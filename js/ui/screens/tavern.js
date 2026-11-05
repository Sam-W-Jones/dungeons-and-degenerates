/* Dungeons and Degenerates — js/ui/screens/tavern.js
 * Tavern: pick ONE of Rest (every living hero heals 35% max HP + one hero's latest scar is treated), Train (upgrade
 * one socketed skill) or Recruit (swap a party member, dead or alive, for an unlocked hero who is not in the party
 * and has not fallen this run; they join at the living party's lowest level, DD.Run.recruitLevel — v2 leveling).
 * A barkeep greets via narration.
 * The run layer owns the rules: DD.Run.tavern() / tavernRest / tavernTrain / tavernRecruit / recruitCandidates,
 * DD.Run.next() leaves. Opened without a pending tavern (debug), one is installed as the pending step.
 */
(function () {
  'use strict';
  const DD = window.DD;

  const NAMES = ['The Prancing Pony\'s Less Successful Cousin', 'The Tipsy Beholder', 'The Drunken Mimic', 'The Rusty Flagon (No Relation)', 'Ye Olde Second Wind', 'The Critical Hit & Miss'];
  const BARKEEP = {
    name: 'Big Mags',
    title: 'Barkeep, Bouncer, Unlicensed Therapist',
    sprite: {
      base: 'humanoid', scale: 1, build: 'huge', outfit: 'tunic',
      palette: { skin: '#e3b08a', cloth: '#7a4a2a', cloth2: '#f2e6cc', hair: '#c0392b', metal: '#b0b0b0', eye: '#2b1d14', accent: '#e67e22', outline: '#1a1014' },
      head: { size: 1, ears: 'none', horns: 'none', hair: 'bun', beard: 'none', hat: 'bandana', face: 'none', eyes: 'normal', mouth: 'smile' },
      mainhand: 'flask', offhand: 'none', bling: [], extras: ['belt'],
    },
  };
  const FALLBACK = {
    tavern_greet: ['Sit down, you look terrible. That is a compliment around here.', 'First round is free. The second round is mandatory.', 'No fighting inside. Outside, I sell tickets.'],
  };
  const USED_LINES = { rest: 'Rested', train: 'Trained', recruit: 'Recruited' };

  let st = null;

  function num(v) { v = +v; return isFinite(v) ? v : 0; }
  function R(name) { return DD.Run && typeof DD.Run[name] === 'function' ? DD.Run[name] : null; }

  function say(text) {
    if (!st || !st.refs.bubble || !text) return;
    st.refs.bubble.textContent = text;
    st.refs.bubble.classList.remove('pop');
    void st.refs.bubble.offsetWidth;
    st.refs.bubble.classList.add('pop');
  }

  /** The pending tavern ({ used, recruits, greeting, result? }), installed when missing (debug / direct navigation). */
  function tavern() {
    const run = DD.UI.run();
    let t = R('tavern') ? DD.safe('Run.tavern', R('tavern'), DD.Run) : null;
    if (t) return t;
    if (!run || run.over) return null;
    const p = run.pending;
    if (p && p.type === 'tavern' && p.data) return p.data;
    run.pending = { type: 'tavern', data: { nodeId: run.nodeId || null, used: null, greeting: DD.UI.narrate('tavern_greet', {}, FALLBACK.tavern_greet), recruits: candidates() } };
    if (R('save')) DD.safe('Run.save', R('save'), DD.Run);
    return run.pending.data;
  }

  function candidates() {
    if (R('recruitCandidates')) return DD.safe('Run.recruitCandidates', R('recruitCandidates'), DD.Run) || [];
    const run = DD.UI.run();
    const inParty = run ? run.party.map(function (h) { return h.id; }) : [];
    return DD.UI.heroIds().filter(function (id) { return DD.UI.isUnlocked(id) && inParty.indexOf(id) < 0; });
  }

  function alive(run) { return (run.party || []).map(function (h, i) { return i; }).filter(function (i) { return !run.party[i].dead; }); }
  function upgradable(rh) {
    return (rh.skills || []).map(function (s, si) { return { s: s, si: si, d: DD.getSkill(s.id) }; }).filter(function (x) { return x.d && (x.s.level || 1) < (x.d.maxLevel || 1); });
  }

  /** Show a tavern action result; remember its text on the pending step so it survives re-mounts. */
  function done(res, sound) {
    const UI = DD.UI;
    if (!res) return;
    if (!res.ok) { UI.sound('error'); UI.toast(res.text || 'Big Mags shakes her head.', { icon: '✋', cls: 'bad' }); return; }
    UI.sound(sound);
    const t = tavern();
    if (t) t.result = res.text;
    if (R('save')) DD.safe('Run.save', R('save'), DD.Run);
    say('Anything else? No? Then shoo. Or order something.');
    render();
  }

  // ---- Rest -------------------------------------------------------------------------------------------------------
  function doRest() {
    const UI = DD.UI;
    const run = UI.run();
    if (!R('tavernRest')) return;
    const scarred = alive(run).filter(function (i) { return (run.party[i].scars || []).length; });
    if (scarred.length <= 1) { done(DD.safe('Run.tavernRest', R('tavernRest'), DD.Run, [scarred.length ? scarred[0] : undefined]), 'heal'); return; }
    UI.choice({
      title: 'Treat a Scar', icon: '🩹', size: 'md', cancelLabel: 'Never mind',
      text: 'A good night\'s sleep heals everyone 35% and treats one hero\'s most recent scar. Whose?',
      options: scarred.map(function (i) {
        const rh = run.party[i];
        const sid = rh.scars[rh.scars.length - 1];
        const d = DD.getScar(sid);
        return { icon: (d && d.icon) || '🩹', label: UI.heroName(rh) + ': ' + (d ? d.name : sid), desc: d ? d.desc : '', tooltip: UI.scarTooltipHtml(sid), onPick: function () { done(DD.safe('Run.tavernRest', R('tavernRest'), DD.Run, [i]), 'heal'); } };
      }),
    });
  }

  // ---- Train ---------------------------------------------------------------------------------------------------------
  function doTrain() {
    const UI = DD.UI;
    const run = UI.run();
    const heroes = alive(run).filter(function (i) { return upgradable(run.party[i]).length; });
    if (!heroes.length) { UI.toast('Every skill is already maxed. Show-offs.', { icon: '🏅' }); return; }
    UI.choice({
      title: 'Train: Pick a Student', icon: '🥋', text: 'Who gets the private lesson?', size: 'md', cancelLabel: 'Never mind',
      options: heroes.map(function (i) {
        const rh = run.party[i];
        const n = upgradable(rh).length;
        return { content: UI.heroMini(rh, i, { tooltip: false }), desc: n + ' skill' + (n > 1 ? 's' : '') + ' can improve', onPick: function () { pickSkill(i); } };
      }),
    });
    function pickSkill(i) {
      const rh = run.party[i];
      UI.choice({
        title: 'Train ' + UI.heroName(rh), icon: '🥋', text: 'Upgrade one skill by one level.', size: 'lg', cancelLabel: 'Back', onCancel: doTrain,
        options: upgradable(rh).map(function (x) {
          const to = (x.s.level || 1) + 1;
          return {
            content: UI.skillCard(x.s.id, to, { badge: DD.util.roman(x.s.level || 1) + ' → ' + DD.util.roman(to), showNext: false, unit: rh }),
            onPick: function () { if (R('tavernTrain')) done(DD.safe('Run.tavernTrain', R('tavernTrain'), DD.Run, [i, x.si]), 'levelup'); },
          };
        }),
      });
    }
  }

  // ---- Recruit ---------------------------------------------------------------------------------------------------------
  /** The level a recruit for slot `skip` joins at: the run layer's rule, else the lowest living level of the others. */
  function joinLevel(run, skip) {
    if (R('recruitLevel')) return Math.max(1, num(DD.safe('Run.recruitLevel', R('recruitLevel'), DD.Run, [skip])) || 1);
    const list = run.party.filter(function (h, i) { return !h.dead && i !== skip; });
    const src = list.length ? list : run.party;
    return Math.max(1, Math.min.apply(null, src.map(function (h) { return num(h.level || 1); }).concat([10])));
  }

  function doRecruit() {
    const UI = DD.UI, el = UI.el;
    const run = UI.run();
    const cands = candidates();
    // v2 (integrator): every hero is unlocked, so an empty bar means the whole roster is here (no "unlock more" nag)
    if (!cands.length) { UI.toast('Nobody new is drinking here tonight. The whole roster is already in your party.', { icon: '🪑' }); return; }
    UI.choice({
      title: 'Recruit: Who Leaves?', icon: '🍺', size: 'md', cancelLabel: 'Never mind',
      text: 'Pick the party member to replace. Their gear goes back to the stash.',
      options: run.party.map(function (rh, i) {
        return { content: UI.heroMini(rh, i, { tooltip: false }), desc: rh.dead ? 'Written out — the seat is empty.' : 'Leaves the campaign.', onPick: function () { pickNew(i); } };
      }),
    });
    function pickNew(replaceIdx) {
      const lvl = joinLevel(run, replaceIdx);
      UI.choice({
        title: 'Recruit: Who Joins?', icon: '🍺', size: 'lg', cancelLabel: 'Back', onCancel: doRecruit,
        text: 'New recruits join at level ' + lvl + ' (the lowest level of the heroes who stay) with full HP, an automatic build and their Blessings already rolled.',
        options: cands.map(function (id) {
          const d = DD.getHero(id);
          return {
            content: el('div.recruit-opt', { style: { '--hc': d.color || '#c9a24f' } }, UI.portrait(id, 56), el('div.ro-text', null, el('div.ro-name', null, d.name + (d.epithet ? ' ' + d.epithet : '')), el('div.ro-role', null, [d.race, d.cls].filter(Boolean).join(' ') + (d.role ? ' · ' + d.role : '')))),
            tooltip: UI.heroTooltipHtml(id),
            onPick: function () {
              if (!R('tavernRecruit')) return;
              const res = DD.safe('Run.tavernRecruit', R('tavernRecruit'), DD.Run, [id, replaceIdx]);
              done(res, 'summon');
              const bark = res && res.ok && d.barks && d.barks.select && d.barks.select.length ? DD.util.pick(d.barks.select, DD.rng) : '';
              if (bark) UI.toast('<b>' + UI.esc(d.name) + ':</b> ' + UI.esc(bark), { html: true, cls: 'bark', ms: 3000 });
            },
          };
        }),
      });
    }
  }

  // ---- view ---------------------------------------------------------------------------------------------------------------
  function optionCard(kind, icon, title, desc, preview, fn, disabledReason, used) {
    const UI = DD.UI, el = UI.el;
    const isUsed = used === kind;
    const locked = !!used && !isUsed;
    const card = el('div.tav-option', { class: [isUsed ? 'chosen' : '', locked ? 'locked' : '', 'k-' + kind] },
      el('div.to-icon', null, icon),
      el('div.to-title', null, title),
      el('div.to-desc', null, desc),
      preview ? el('div.to-preview', null, preview) : null);
    const tip = disabledReason && !used ? disabledReason : locked ? 'One choice per tavern visit. The DM is strict about this.' : null;
    const btn = UI.button(isUsed ? USED_LINES[kind] || 'Chosen' : title, fn, { cls: isUsed ? 'small' : 'primary', disabled: !!used || !!disabledReason, tooltip: tip ? '<div class="tt"><div class="tt-desc">' + UI.esc(tip) + '</div></div>' : null });
    card.appendChild(el('div.to-actions', null, btn));
    if (isUsed) card.appendChild(el('div.to-stamp', null, '✓'));
    return card;
  }

  function render() {
    const UI = DD.UI, el = UI.el;
    const run = UI.run();
    const t = tavern();
    if (!st || !run || !t) return;
    const bar = UI.runBar();
    st.refs.bar.replaceWith(bar);
    st.refs.bar = bar;
    const box = st.refs.options;
    box.innerHTML = '';
    const used = t.used || null;
    const hurt = run.party.reduce(function (s, h) { return s + (h.dead ? 0 : Math.max(0, UI.heroStats(h).maxHp - num(h.hp))); }, 0);
    const scars = run.party.reduce(function (s, h) { return s + (h.dead ? 0 : (h.scars || []).length); }, 0);
    const trainable = alive(run).reduce(function (s, i) { return s + upgradable(run.party[i]).length; }, 0);
    const cands = candidates();
    const deadCount = run.party.filter(function (h) { return h.dead; }).length;
    box.appendChild(optionCard('rest', '🛏️', 'Rest', 'Every living hero heals 35% of their max HP, and one hero\'s most recent scar is treated.',
      hurt ? 'Party is missing ' + hurt + ' HP' + (scars ? ' · ' + scars + ' scar' + (scars > 1 ? 's' : '') : '') : (scars ? scars + ' scar' + (scars > 1 ? 's' : '') + ' to treat' : 'Everyone is fine. Suspicious.'), doRest, null, used));
    box.appendChild(optionCard('train', '🥋', 'Train', 'Upgrade one socketed skill of one hero by one level (max III).',
      trainable ? trainable + ' skill' + (trainable > 1 ? 's' : '') + ' can improve' : 'Nothing left to learn', doTrain, trainable ? null : 'Every skill is already at max level.', used));
    box.appendChild(optionCard('recruit', '🍺', 'Recruit', 'Replace a party member — dead or alive — with a hero from the bar at the party\'s lowest level.',
      deadCount ? deadCount + ' empty seat' + (deadCount > 1 ? 's' : '') + '! ' + cands.length + ' available' : cands.length + ' hero' + (cands.length === 1 ? '' : 'es') + ' drinking at the bar', doRecruit, cands.length ? null : 'Nobody else is drinking at the bar.', used));
    st.refs.result.innerHTML = '';
    if (t.result) st.refs.result.appendChild(el('div.tav-result', null, el('span.tr-icon', null, '📜'), el('span', null, t.result)));
    st.refs.leave.querySelector('.btn-label').textContent = used ? 'Leave Tavern' : 'Leave Without Choosing';
  }

  function leave() {
    const UI = DD.UI;
    const t = tavern();
    const go = function () {
      if (R('next')) DD.safe('Run.next', R('next'), DD.Run);
      if (UI.current === 'tavern') UI.show(UI.run() ? 'map' : 'title');
    };
    if (t && t.used) { go(); return; }
    UI.confirm('Leave without resting, training or recruiting? Big Mags will be hurt. Emotionally.', { title: 'Leave the Tavern?', yes: 'Leave', no: 'Stay' }).then(function (ok) { if (ok) go(); });
  }

  DD.afterLoad(function () {
    if (!DD.UI) return;
    DD.UI.screen('tavern', {
      scene: 'none',
      cls: 'full',
      mount: function (root) {
        const UI = DD.UI, el = UI.el;
        const run = UI.run();
        st = { refs: {} };
        const t = run && !run.over ? tavern() : null;
        if (!t) {
          root.appendChild(el('div.center-message.panel', null, el('div.es-icon', null, '🍺'), el('h2', null, 'Last call was hours ago'), el('p', null, 'No campaign in progress.'), UI.button('Title', function () { UI.show('title'); }, { cls: 'primary' })));
          return;
        }
        root.classList.add('act-' + (run.act || 1));
        const name = NAMES[DD.util.hash(String(t.nodeId || run.nodeId || '') + ':' + (run.seed || '')) % NAMES.length];
        st.refs.bar = UI.runBar();
        root.appendChild(st.refs.bar);
        st.refs.bubble = el('div.speech');
        st.refs.leave = UI.button('Leave Tavern', leave, { icon: '🚪', cls: 'ghost', hotkey: 'Escape', showKey: false });
        const keeper = el('aside.keeper.panel.barkeep', null,
          el('div.keeper-sign', null, name),
          el('div.keeper-art', null, UI.portrait(BARKEEP.sprite, 150, { frame: false, fallback: '🧔‍♀️' })),
          el('div.keeper-name', null, BARKEEP.name),
          el('div.keeper-title', null, BARKEEP.title),
          st.refs.bubble,
          el('div.keeper-actions', null, UI.button('Party', function () { UI.show('party', { back: 'tavern' }); }, { icon: '🎒', cls: 'small ghost', hotkey: 'p' })));
        st.refs.options = el('div.tav-options');
        st.refs.result = el('div.tav-result-wrap');
        const main = el('main.tav-main', null,
          el('div.tav-head', null, el('h1.tav-title', null, name), el('div.tav-sub', null, 'Choose one: rest, train or recruit. The ale is not optional.')),
          st.refs.options, st.refs.result, el('div.tav-foot', null, st.refs.leave));
        root.appendChild(el('div.tavern-layout', null, keeper, main));
        say(t.used ? 'Anything else? No? Then shoo.' : (t.greeting || UI.narrate('tavern_greet', {}, FALLBACK.tavern_greet)));
        render();
      },
      update: function () { if (st && st.refs.options) render(); },
      unmount: function () { st = null; },
    });
  });
})();
