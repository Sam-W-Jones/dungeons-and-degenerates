/* Dungeons and Degenerates — js/ui/screens/event.js
 * Narrative event: framed art (icon + featured hero), title, narration, choice buttons with hints and requirements,
 * then the outcome text with a summary of what changed (gold, HP, level-ups, items, scars, skills…) and Continue /
 * Fight!.
 * The run layer owns the logic: DD.Run.currentEvent() describes the pending event, DD.Run.chooseEventOption(i)
 * resolves a choice through the §9.5 event API, and DD.Run.next() moves on (queued fight → level-ups → map).
 * Blessing rolls granted by a choice (api.rollPassive) open THE ROLL MOMENT (DD.UI.resolveRolls) right after it.
 * Params: { eventId } (the run's pending event wins when there is one).
 */
(function () {
  'use strict';
  const DD = window.DD;

  let st = null;

  function num(v) { v = +v; return isFinite(v) ? v : 0; }
  function R(name) { return DD.Run && typeof DD.Run[name] === 'function' ? DD.Run[name] : null; }

  // ---- change summary ------------------------------------------------------------------------------------------
  function snapshot(run) {
    if (!run) return null;
    const party = run.party || [];
    return {
      gold: num(run.gold),
      ids: party.map(function (h) { return h.id; }),
      hp: party.map(function (h) { return num(h.hp); }),
      level: party.map(function (h) { return num(h.level); }),
      dead: party.map(function (h) { return !!h.dead; }),
      scars: party.map(function (h) { return (h.scars || []).slice(); }),
      skills: party.map(function (h) { return (h.skills || []).map(function (s) { return s.id + ':' + (s.level || 1); }); }),
      items: [].concat(run.inventory || [], party.reduce(function (a, h) { const it = h.items || {}; return a.concat([it.weapon, it.armor, it.trinket].filter(Boolean)); }, [])),
      cons: (run.consumables || []).slice(),
      learns: (run.learnQueue || []).length,
      passives: party.map(function (h) { return (h.passives || []).map(function (p) { return p.id + ':' + (p.level || 1); }); }),
    };
  }

  function multisetDiff(a, b) {
    const count = {};
    a.forEach(function (x) { count[x] = (count[x] || 0) + 1; });
    const added = [];
    b.forEach(function (x) { if (count[x]) count[x]--; else added.push(x); });
    const removed = [];
    Object.keys(count).forEach(function (k) { for (let i = 0; i < count[k]; i++) removed.push(k); });
    return { added: added, removed: removed };
  }

  /** Human-readable chips for everything the choice changed. */
  function changes(a, b) {
    const UI = DD.UI;
    const out = [];
    if (!a || !b) return out;
    const dg = b.gold - a.gold;
    if (dg) out.push({ icon: '🪙', text: (dg > 0 ? '+' : '−') + Math.abs(dg) + ' gold', good: dg > 0 });
    // a level-up's HP growth is told on its level chip ("+4 max HP"), not as healing
    const growth = b.ids.map(function (id, i) {
      const up = a.ids[i] === id ? b.level[i] - a.level[i] : 0;
      const d = up > 0 ? DD.getHero(id) : null;
      return up > 0 ? up * num(d && d.growth && d.growth.hp !== undefined ? d.growth.hp : 4) : 0;
    });
    const hpD = b.ids.map(function (id, i) { return a.ids[i] === id ? b.hp[i] - a.hp[i] - growth[i] : 0; });
    const nz = hpD.filter(function (d) { return d; });
    const aliveN = b.ids.filter(function (id, i) { return !b.dead[i]; }).length;
    if (nz.length > 1 && nz.length === aliveN && nz.every(function (d) { return d === nz[0]; })) {
      out.push({ icon: nz[0] > 0 ? '💚' : '💔', text: 'Party ' + (nz[0] > 0 ? '+' : '−') + Math.abs(nz[0]) + ' HP', good: nz[0] > 0 });
    } else {
      hpD.forEach(function (d, i) { if (d) out.push({ icon: d > 0 ? '💚' : '💔', text: UI.heroName(b.ids[i]) + ' ' + (d > 0 ? '+' : '−') + Math.abs(d) + ' HP', good: d > 0 }); });
    }
    b.ids.forEach(function (id, i) {
      if (a.ids[i] !== id) { out.push({ icon: '🍺', text: UI.heroName(id) + ' joined the party', good: true }); return; }
      const up = b.level[i] - a.level[i];
      // v2 leveling: events level heroes up (the DM's rotation or a named hero); the boon is chosen after the event
      if (up > 0) out.push({ icon: '✨', text: UI.heroName(id) + (up > 1 ? ' gained ' + up + ' levels (now ' + b.level[i] + ')' : ' levels up to ' + b.level[i]) + (growth[i] ? ' (+' + growth[i] + ' max HP)' : ''), good: true });
      const sc = multisetDiff(a.scars[i], b.scars[i]);
      sc.added.forEach(function (s) { const d = DD.getScar(s); out.push({ icon: (d && d.icon) || '🩹', text: UI.heroName(id) + ' gained ' + (d ? d.name : 'a scar'), good: false, tip: UI.scarTooltipHtml(s) }); });
      sc.removed.forEach(function (s) { const d = DD.getScar(s); out.push({ icon: '✚', text: UI.heroName(id) + ' healed ' + (d ? d.name : 'a scar'), good: true }); });
      const sk = multisetDiff(a.skills[i], b.skills[i]);
      sk.added.forEach(function (k) {
        const p = k.split(':');
        const d = DD.getSkill(p[0]);
        const had = a.skills[i].some(function (x) { return x.split(':')[0] === p[0]; });
        out.push({ icon: d ? d.icon : '📖', text: UI.heroName(id) + (had ? ' upgraded ' : ' learned ') + (d ? d.name : p[0]) + (had ? ' to ' + DD.util.roman(+p[1]) : ''), good: true, tip: d ? UI.skillTooltipHtml(p[0], +p[1]) : null });
      });
      if (b.dead[i] && !a.dead[i]) out.push({ icon: '⚰️', text: UI.heroName(id) + ' was written out of the campaign', good: false });
      // Blessings (random passives): gained, upgraded, lost
      const pa = (a.passives && a.passives[i]) || [], pb = (b.passives && b.passives[i]) || [];
      const lvA = {};
      pa.forEach(function (k) { const p = k.split(':'); lvA[p[0]] = +p[1]; });
      const idsB = pb.map(function (k) { return k.split(':')[0]; });
      pb.forEach(function (k) {
        const p = k.split(':');
        const entry = { id: p[0], level: +p[1] };
        const info = UI.passiveInfo ? UI.passiveInfo(entry) : { icon: '🎲', name: p[0], rarity: 'common' };
        const tip = UI.passiveTooltipHtml ? UI.passiveTooltipHtml(entry) : null;
        if (!(p[0] in lvA)) out.push({ icon: info.icon, text: UI.heroName(id) + ' gained ' + info.name, good: info.rarity !== 'cursed', tip: tip });
        else if (+p[1] > lvA[p[0]]) out.push({ icon: info.icon, text: UI.heroName(id) + '\'s ' + info.name + ' is now ' + DD.util.roman(+p[1]), good: true, tip: tip });
      });
      Object.keys(lvA).forEach(function (pid) {
        if (idsB.indexOf(pid) >= 0) return;
        const info = UI.passiveInfo ? UI.passiveInfo(pid) : { icon: '🎲', name: pid };
        out.push({ icon: info.icon, text: UI.heroName(id) + ' lost ' + info.name, good: false });
      });
    });
    const it = multisetDiff(a.items, b.items);
    it.added.forEach(function (id) { const d = DD.getItem(id); out.push({ icon: d ? d.icon : '🎁', text: 'Found ' + (d ? d.name : id), good: d ? d.rarity !== 'cursed' : true, tip: UI.itemTooltipHtml(id), rarity: d && d.rarity }); });
    it.removed.forEach(function (id) { const d = DD.getItem(id); out.push({ icon: d ? d.icon : '🎁', text: 'Lost ' + (d ? d.name : id), good: false }); });
    const cs = multisetDiff(a.cons, b.cons);
    cs.added.forEach(function (id) { const d = DD.getConsumable(id); out.push({ icon: d ? d.icon : '🧪', text: 'Got ' + (d ? d.name : id), good: true, tip: UI.consumableTooltipHtml(id) }); });
    cs.removed.forEach(function (id) { const d = DD.getConsumable(id); out.push({ icon: d ? d.icon : '🧪', text: 'Used up ' + (d ? d.name : id), good: false }); });
    if (b.learns > a.learns) out.push({ icon: '📖', text: 'A new skill awaits (choose after this)', good: true });
    return out;
  }

  // ---- data ---------------------------------------------------------------------------------------------------------
  /** A choice's label / hint as text: event authors may write either as (run) => string (act-scaled numbers). */
  function choiceText(v, owner, run, what) {
    if (typeof v === 'function') v = DD.safe(what || 'event choice text', v, owner || null, [run]);
    return v === undefined || v === null ? '' : String(v);
  }

  /** { id, def, title, icon, text, choices: [{ index, label, hint, disabled }], resolved, outcome, combat } */
  function load(params) {
    const run = DD.UI.run();
    const cur = R('currentEvent') ? DD.safe('Run.currentEvent', R('currentEvent'), DD.Run) : null;
    if (cur && cur.def) return cur;
    const p = params || {};
    const id = p.eventId || p.id || (typeof p.event === 'string' ? p.event : p.event && p.event.id);
    const def = id ? DD.getEvent(id) : null;
    if (!def) return null;
    const text = typeof def.text === 'function' ? DD.safe('text of event ' + def.id, def.text, def, [run]) : def.text;
    return {
      id: def.id, def: def, title: def.title, icon: def.icon, text: text == null ? '' : String(text), standalone: true,
      choices: (def.choices || []).map(function (c, i) {
        const ok = typeof c.requires !== 'function' || !!DD.safe('requires of event ' + def.id, c.requires, c, [run]);
        return { index: i, label: choiceText(c.label, c, run, 'label of event ' + def.id), hint: choiceText(c.hint, c, run, 'hint of event ' + def.id), disabled: !ok };
      }),
      resolved: false, outcome: null, combat: null,
    };
  }

  function choose(i) {
    const UI = DD.UI;
    const run = UI.run();
    const ev = st.ev;
    if (!ev || st.outcome) return;
    const before = snapshot(run);
    let res = null;
    if (!ev.standalone && R('chooseEventOption')) res = DD.safe('Run.chooseEventOption', R('chooseEventOption'), DD.Run, [i]);
    else {
      // Debug / stand-alone event (not the run's pending step): resolve through the run's event API.
      const c = ev.def.choices[i];
      const api = R('eventApi') ? DD.safe('Run.eventApi', R('eventApi'), DD.Run) : null;
      const r = c && typeof c.resolve === 'function' && api ? DD.safe('event ' + ev.id + ' choice ' + i, c.resolve, c, [api, run]) : '';
      res = typeof r === 'string' ? { text: r, combat: null } : r && typeof r === 'object' ? { text: r.text || '', combat: r.combat || null } : { text: '', combat: null };
      if (res.combat && R('queueCombat')) DD.safe('Run.queueCombat', R('queueCombat'), DD.Run, [res.combat]);
      if (run && run.queuedCombat) res.combat = run.queuedCombat;
    }
    if (!res) return;
    st.outcome = {
      choice: i, text: res.text || 'Nothing much happens. The DM looks disappointed.',
      combat: res.combat || (run && run.queuedCombat) || null,
      changes: changes(before, snapshot(UI.run())),
    };
    UI.sound(st.outcome.changes.some(function (c) { return !c.good; }) ? 'debuff' : 'buff');
    renderPage();
    // Rolls on the Table of Questionable Blessings granted by the choice (api.rollPassive) are shown right away.
    const evRoll = function (r) { return r.src !== 'level'; };
    const rolls = R('pendingRolls') ? (DD.safe('Run.pendingRolls', R('pendingRolls'), DD.Run) || []).filter(evRoll) : [];
    if (rolls.length && typeof UI.resolveRolls === 'function') {
      const outcome = st.outcome;
      UI.resolveRolls(evRoll, function () {
        if (!st || st.outcome !== outcome) return;
        outcome.changes = changes(before, snapshot(UI.run()));
        renderPage();
      });
    }
  }

  /** Continue: the run layer starts a queued fight, then pending level-ups / learns, then the map. */
  function proceed() {
    const UI = DD.UI;
    if (R('next')) { DD.safe('Run.next', R('next'), DD.Run); return; }
    UI.show(UI.run() ? 'map' : 'title');
  }

  function renderPage() {
    const UI = DD.UI, el = UI.el;
    const page = st.refs.page;
    page.innerHTML = '';
    // the run bar follows the choice's effects (HP, gold, who is next for a level-up)
    if (st.refs.bar && st.refs.bar.parentNode) { const bar = UI.runBar(); st.refs.bar.replaceWith(bar); st.refs.bar = bar; }
    const ev = st.ev;
    page.appendChild(el('h1.ev-title', null, ev.title || 'Something Happens'));
    const text = el('div.ev-text');
    String(ev.text || '').split(/\n\s*\n/).filter(Boolean).forEach(function (p) { text.appendChild(el('p', null, p)); });
    page.appendChild(text);
    if (!st.outcome) {
      const list = el('div.ev-choices');
      const run = UI.run();
      ev.choices.forEach(function (c, i) {
        const ok = !c.disabled;
        // the run layer already turns function labels / hints into text; this covers an older adapter
        const label = choiceText(c.label, c, run, 'label of event ' + ev.id);
        const hint = choiceText(c.hint, c, run, 'hint of event ' + ev.id);
        const b = el('button.ev-choice', { type: 'button', class: ok ? '' : 'is-disabled' },
          el('span.evc-num', null, String(i + 1)),
          el('span.evc-main', null,
            el('span.evc-label', null, label || 'Do the thing.'),
            hint ? el('span.evc-hint', null, hint) : null,
            ok ? null : el('span.evc-req', null, '🔒 Requirements not met')));
        if (ok) UI.bindHotkey(b, String(i + 1));
        b.addEventListener('click', function () {
          if (!ok) { UI.sound('error'); return; }
          UI.sound('click');
          choose(c.index !== undefined ? c.index : i);
        });
        list.appendChild(b);
      });
      page.appendChild(list);
      return;
    }
    const o = st.outcome;
    const picked = ev.choices.filter(function (c, i) { return (c.index !== undefined ? c.index : i) === o.choice; })[0];
    if (picked) page.appendChild(el('div.ev-picked', null, '▸ ' + choiceText(picked.label, picked, UI.run(), 'label of event ' + ev.id)));
    const out = el('div.ev-outcome');
    String(o.text).split(/\n\s*\n/).forEach(function (p) { out.appendChild(el('p', null, p)); });
    page.appendChild(out);
    if (o.changes.length) {
      page.appendChild(el('div.ev-changes', null, o.changes.map(function (c) {
        const chip = el('span.change-chip', { class: [c.good ? 'good' : 'bad', c.rarity ? 'rarity-' + c.rarity : ''] }, el('span.cc-icon', null, c.icon), el('span', null, c.text));
        if (c.tip) UI.tooltip(chip, c.tip);
        return chip;
      })));
    }
    page.appendChild(el('div.ev-actions', null, UI.button(o.combat ? 'Fight!' : 'Continue', proceed, { cls: o.combat ? 'danger big' : 'primary big', icon: o.combat ? '⚔️' : '▶', hotkey: 'Enter' })));
  }

  DD.afterLoad(function () {
    if (!DD.UI) return;
    DD.UI.screen('event', {
      scene: 'none',
      cls: 'full',
      history: false,
      mount: function (root, params) {
        const UI = DD.UI, el = UI.el;
        const run = UI.run();
        const ev = load(params);
        st = { ev: ev, outcome: null, refs: {} };
        if (run) root.classList.add('act-' + (run.act || 1));
        st.refs.bar = UI.runBar();
        root.appendChild(st.refs.bar);
        if (!ev) {
          root.appendChild(el('div.center-message.panel', null, el('div.es-icon', null, '❓'), el('h2', null, 'The DM lost his notes'), el('p', null, 'This event could not be found. Nothing happens, which is honestly a relief.'),
            UI.button('Continue', proceed, { cls: 'primary', hotkey: 'Enter' })));
          return;
        }
        if (ev.resolved) {
          st.outcome = { choice: run && run.pending && run.pending.data ? run.pending.data.choice : -1, text: ev.outcome || '', combat: ev.combat, changes: [] };
        }
        const heroId = ev.def && ev.def.hero && DD.getHero(ev.def.hero) ? ev.def.hero : null;
        const art = el('div.ev-art.panel', null,
          el('div.ev-art-frame', null, el('div.ev-art-glow'), el('div.ev-icon', null, ev.icon || '❓'), heroId ? el('div.ev-hero', null, UI.portrait(heroId, 64)) : null),
          el('div.ev-art-caption', null, (UI.ACTS[run && run.act] || {}).name || 'Somewhere Questionable'));
        st.refs.page = el('div.ev-page.parchment');
        root.appendChild(el('div.ev-layout', null, art, st.refs.page));
        renderPage();
        // an event roll interrupted by a reload: show it again (stored, so the same roll)
        const evRoll = function (r) { return r.src === 'event'; };
        if (ev.resolved && R('pendingRolls') && (DD.safe('Run.pendingRolls', R('pendingRolls'), DD.Run) || []).some(evRoll) && UI.resolveRolls) {
          UI.resolveRolls(evRoll, function () { if (st) renderPage(); });
        }
      },
      unmount: function () { st = null; },
    });
  });
})();
