/* Dungeons and Degenerates — js/ui/screens/levelup.js
 * Level-up flow (v2: usually one hero — the one the DM's rotation picked after the fight, or a hero an event named):
 * a celebratory backdrop with the party lineup, then one modal per pending level offering the three
 * choices from DD.Run.levelUpChoices(heroIdx) (learn a skill / upgrade a skill / perk), applied with
 * DD.Run.applyLevelChoice(heroIdx, choice, replaceIdx). Learning a 5th skill opens the forget-a-skill picker
 * ("Back" returns to the choices). Afterwards, queued skill learns (DD.Run.pendingLearns, e.g. tomes from events)
 * are resolved with the same picker (skip allowed). Pending levels are read from RunHero.pendingLevels; a
 * params.queue of hero indices is used when the run layer does not track them.
 * Before each level's choice the hero rolls on the Table of Questionable Blessings (DD.UI.passiveRoll, THE ROLL
 * MOMENT); DD.Run.nextLevelStep(heroIdx) says whether a roll or a choice comes next. Leftover rolls from events or
 * the shop are resolved here too.
 * The subtitle under "Level Up!" is the DM's `level_up` narration line (it stays visible above the roll and boon
 * modals); the per-hero step ("… rolls on the Table") sits above the lineup.
 * Params: { queue: [heroIdx...], next: 'map' | { id, params } | fn }.
 */
(function () {
  'use strict';
  const DD = window.DD;

  const PERK_ICON = { hp: '❤️', maxhp: '❤️', dmg: '⚔️', damage: '⚔️', mov: '👣', move: '👣', armor: '🛡️', ap: '⚡', heal: '💚' };
  const LEVEL_UP_FALLBACK = ['Level up! The DM reluctantly turns the page of your character sheet.', 'Numbers are going up. The DM is taking notes.'];

  let st = null;

  function run() { return DD.UI.run(); }
  function num(v) { v = +v; return isFinite(v) ? v : 0; }
  function tracked(r) { return !!r && r.party.some(function (h) { return h && h.pendingLevels !== undefined; }); }

  function pendingRolls(h) { return DD.Passives && h && Array.isArray(h.passiveRolls) ? h.passiveRolls.length : 0; }

  /** Party indices that still owe a level-up choice or a Blessing roll (in party order). */
  function levelQueue() {
    const r = run();
    if (!r) return [];
    if (tracked(r)) return r.party.map(function (h, i) { return i; }).filter(function (i) { return !r.party[i].dead && (num(r.party[i].pendingLevels) > 0 || pendingRolls(r.party[i]) > 0); });
    return st.queue.filter(function (i) { return r.party[i] && !r.party[i].dead; });
  }

  /** 'roll' | 'choice' | null — what this hero does next (the run layer decides; plain pending levels otherwise). */
  function nextStep(heroIdx) {
    if (DD.Run && typeof DD.Run.nextLevelStep === 'function') return DD.safe('Run.nextLevelStep', DD.Run.nextLevelStep, DD.Run, [heroIdx]) || null;
    return 'choice';
  }

  function pendingLearns() {
    if (!DD.Run || typeof DD.Run.pendingLearns !== 'function') return [];
    return DD.safe('Run.pendingLearns', DD.Run.pendingLearns, DD.Run) || [];
  }

  /** Turn a Choice from DD.Run.levelUpChoices into display info. Tolerates several field names. */
  function describe(c, rh) {
    const UI = DD.UI;
    const type = c.type || c.kind || 'perk';
    const out = { type: type, icon: c.icon || '✨', label: c.label || '', desc: c.desc || '', content: null, skillId: null };
    if (type === 'learn' || type === 'skill' || type === 'new') {
      const id = c.skillId || c.id;
      const d = DD.getSkill(id);
      out.skillId = id;
      if (d) {
        out.icon = '';
        out.label = c.label || 'Learn ' + d.name;
        out.desc = '';
        out.content = UI.skillCard(id, 1, { showNext: true, badge: 'New', unit: rh });
        if (c.replace || (rh && (rh.skills || []).length >= 4)) out.note = 'All 4 sockets are full — you will choose a skill to forget.';
      }
    } else if (type === 'upgrade') {
      let idx = c.skillIdx !== undefined ? c.skillIdx : c.index !== undefined ? c.index : c.idx;
      if ((idx === undefined || !(rh && rh.skills && rh.skills[idx] && rh.skills[idx].id === (c.skillId || c.id || rh.skills[idx].id))) && rh && (c.skillId || c.id)) {
        idx = (rh.skills || []).map(function (s) { return s.id; }).indexOf(c.skillId || c.id);
      }
      const s = rh && rh.skills ? rh.skills[idx] : null;
      const id = (s && s.id) || c.skillId || c.id;
      const d = DD.getSkill(id);
      out.skillId = id;
      if (d) {
        const from = s ? s.level || 1 : Math.max(1, num(c.level) - 1);
        const to = Math.min(from + 1, d.maxLevel || 1);
        out.icon = '';
        out.label = c.label || 'Upgrade ' + d.name + ' to ' + DD.util.roman(to);
        out.desc = '';
        out.content = UI.el('div.lu-upgrade', null,
          UI.skillCard(id, to, { badge: DD.util.roman(from) + ' → ' + DD.util.roman(to), showNext: false, unit: rh }),
          UI.el('div.lu-was', null, UI.el('span', null, 'Was: '), DD.skillDesc(d, from, UI.describer(rh))));
      }
    } else {
      const key = String(c.perk || c.stat || c.id || '').toLowerCase();
      out.icon = c.icon || PERK_ICON[key] || '✨';
      out.label = c.label || 'Perk';
    }
    if (!out.label) out.label = DD.util.capitalize(type);
    return out;
  }

  function renderLineup(activeIdx) {
    const UI = DD.UI, el = UI.el;
    const r = run();
    const box = st.refs.lineup;
    box.innerHTML = '';
    if (!r) return;
    const q = levelQueue();
    (r.party || []).forEach(function (rh, i) {
      const pendingCount = tracked(r) ? num(rh.pendingLevels) : st.queue.filter(function (x) { return x === i; }).length;
      const rolls = rh.dead ? 0 : pendingRolls(rh);
      const active = activeIdx === i;
      const done = st.done.indexOf(i) >= 0 && q.indexOf(i) < 0;
      let label = '';
      if (active && st.rolling === i) label = 'Rolling…';
      else if (pendingCount) label = pendingCount > 1 ? pendingCount + ' level-ups' : active ? 'Choosing…' : '1 level-up';
      else if (rolls) label = active ? 'Rolling…' : '🎲 ' + (rolls > 1 ? rolls + ' rolls' : '1 roll');
      box.appendChild(el('div.lu-hero', { class: [active ? 'active' : '', done ? 'done' : '', rh.dead ? 'dead' : ''], style: { '--hc': (UI.heroDef(rh) || {}).color || '#c9a24f' } },
        UI.portrait(rh.id, active ? 92 : 64, { dead: rh.dead }),
        el('div.lu-name', null, UI.heroName(rh)),
        el('div.lu-lvl', null, 'Level ' + (rh.level || 1)),
        label ? el('div.lu-pending', null, label) : done ? el('div.lu-done', null, '✓ Done') : null));
    });
  }

  function finishAll() {
    const UI = DD.UI;
    const target = st.next;
    renderLineup(-1);
    st.refs.status.textContent = 'Everyone is suitably empowered.';
    if (st.refs.dm) { st.refs.dm.innerHTML = ''; st.refs.dm.textContent = 'Everyone is suitably empowered.'; }
    const go = function () {
      if (DD.UI.current !== 'levelup') return;
      if (target) UI.goNext(target);
      else if (DD.Run && typeof DD.Run.next === 'function') DD.safe('Run.next', DD.Run.next, DD.Run);
      if (DD.UI.current === 'levelup') UI.show(UI.run() ? 'map' : 'title');
    };
    if (DD.headless) go(); else setTimeout(go, 450);
  }

  function next() {
    if (!st) return;
    const q = levelQueue();
    if (q.length) { openFor(q[0]); return; }
    const learns = pendingLearns();
    if (learns.length) { openLearn(learns[0]); return; }
    finishAll();
  }

  function heroDone(heroIdx) {
    if (!tracked(run())) {
      const k = st.queue.indexOf(heroIdx);
      if (k >= 0) st.queue.splice(k, 1);
    }
    if (st.done.indexOf(heroIdx) < 0) st.done.push(heroIdx);
    next();
  }

  function applyChoice(heroIdx, choice, replaceIdx) {
    const UI = DD.UI;
    let res = null;
    if (DD.Run && typeof DD.Run.applyLevelChoice === 'function') {
      res = DD.safe('Run.applyLevelChoice', DD.Run.applyLevelChoice, DD.Run, [heroIdx, choice, typeof replaceIdx === 'number' && replaceIdx >= 0 ? replaceIdx : undefined]);
    }
    if (res && res.ok === false) {
      if (res.needsReplace) {
        UI.chooseSkillSlot(heroIdx, choice.skillId || choice.id, { skipLabel: 'Back to the choices' }, function (ri) {
          if (ri === null || ri < 0) { openFor(heroIdx); return; }
          applyChoice(heroIdx, choice, ri);
        });
        return;
      }
      if (res.text) UI.toast(res.text, { icon: '🤔' });
      openFor(heroIdx);
      return;
    }
    UI.sound('levelup');
    if (res && res.text) UI.toast(res.text, { icon: '✨', cls: 'good' });
    heroDone(heroIdx);
  }

  function openFor(heroIdx) {
    const UI = DD.UI, el = UI.el;
    const r = run();
    const rh = r && r.party ? r.party[heroIdx] : null;
    if (!rh || rh.dead) { heroDone(heroIdx); return; }
    const step = nextStep(heroIdx);
    if (step === 'roll') {
      // THE ROLL MOMENT comes first; afterwards this hero's next step (usually the boon for the same level)
      st.rolling = heroIdx;
      renderLineup(heroIdx);
      st.refs.status.textContent = UI.heroName(rh) + ' rolls on the Table of Questionable Blessings…';
      let sync = true;
      const m = UI.passiveRoll(heroIdx, { cls: 'in-levelup', onDone: function () { if (sync || !st) return; st.rolling = -1; openFor(heroIdx); } });
      sync = false;
      st.rolling = m ? heroIdx : -1;
      if (m) return;
      if (!(num(rh.pendingLevels) > 0)) { heroDone(heroIdx); return; } // the roll fizzled (nothing left on the table)
    } else if (step === null && tracked(r) && !(num(rh.pendingLevels) > 0)) { heroDone(heroIdx); return; }
    let choices = [];
    if (DD.Run && typeof DD.Run.levelUpChoices === 'function') choices = DD.safe('Run.levelUpChoices', DD.Run.levelUpChoices, DD.Run, [heroIdx]) || [];
    const def = UI.heroDef(rh);
    const name = UI.heroName(rh);
    // With several pending levels the boons are picked oldest first: name the level this boon is for (the same
    // level its Blessing roll just named), not the hero's current level.
    const forLevel = tracked(r) && num(rh.pendingLevels) > 0 ? Math.max(1, (rh.level || 1) - num(rh.pendingLevels) + 1) : (rh.level || 1);
    renderLineup(heroIdx);
    st.refs.status.textContent = name + ' is choosing a boon…';
    if (!choices.length) {
      if (tracked(r) && num(rh.pendingLevels) > 0) rh.pendingLevels = 0; // nothing left to offer: never loop forever
      UI.alert(name + ' — Level ' + forLevel, name + ' feels stronger. There was nothing new to learn, so they learned humility instead.', { icon: '✨', onClose: function () { heroDone(heroIdx); } });
      return;
    }
    const bark = def && def.barks && def.barks.levelup && def.barks.levelup.length ? DD.util.pick(def.barks.levelup, DD.rng) : '';
    const stats = UI.heroStats(rh);
    const growth = def && def.growth && def.growth.hp ? def.growth.hp : 0;
    const more = tracked(r) && num(rh.pendingLevels) > 1 ? ' (' + num(rh.pendingLevels) + ' boons to pick)' : '';
    const head = el('div.lu-head', { style: { '--hc': (def && def.color) || '#c9a24f' } },
      UI.portrait(rh.id, 72),
      el('div.lu-head-text', null,
        el('div.lu-head-title', null, name + ' reached Level ' + forLevel + '!'),
        el('div.lu-head-sub', null, (growth ? '+' + growth + ' max HP per level (now ' + stats.maxHp + '). ' : '') + 'Choose one boon' + more + ':'),
        bark ? el('div.lu-bark', null, '“' + bark + '”') : null));
    const options = choices.map(function (c) {
      const v = describe(c, rh);
      return {
        icon: v.icon, label: v.label, desc: v.desc || null, content: [v.content, v.note ? el('div.co-note', null, v.note) : null],
        onPick: function () {
          const isLearn = v.type === 'learn' || v.type === 'skill' || v.type === 'new';
          if (isLearn && (rh.skills || []).length >= 4) {
            UI.chooseSkillSlot(heroIdx, v.skillId, { skipLabel: 'Back to the choices', title: name + ': Forget a Skill' }, function (ri) {
              if (ri === null || ri < 0) { openFor(heroIdx); return; }
              applyChoice(heroIdx, c, ri);
            });
            return;
          }
          applyChoice(heroIdx, c, -1);
        },
      };
    });
    UI.choice({ title: 'Choose a Boon', icon: '✨', text: head, options: options, size: 'xl', cls: 'modal-levelup' });
  }

  /** A queued "learn X" (skill tome from an event / reward with full sockets): forget one or skip. */
  function openLearn(job) {
    const UI = DD.UI;
    const r = run();
    const rh = r && r.party[job.heroIdx];
    const d = DD.getSkill(job.skillId);
    renderLineup(job.heroIdx);
    st.refs.status.textContent = (rh ? UI.heroName(rh) : 'Someone') + ' found a skill tome…';
    UI.chooseSkillSlot(job.heroIdx, job.skillId, { title: 'New Skill: ' + (d ? d.name : 'Mystery'), skipLabel: 'Skip — don\'t learn it' }, function (ri) {
      // chooseSkillSlot: -1 = free socket (learn without forgetting), null = skip; resolveLearn: -1 = skip.
      const arg = ri === null ? -1 : ri >= 0 ? ri : undefined;
      const res = DD.Run && typeof DD.Run.resolveLearn === 'function' ? DD.safe('Run.resolveLearn', DD.Run.resolveLearn, DD.Run, [job.index, arg]) : null;
      if (res && res.text) UI.toast(res.text, { icon: d ? d.icon : '📖', cls: res.ok ? 'good' : '' });
      if (!res) { finishAll(); return; } // cannot resolve without the run layer: avoid looping
      next();
    });
  }

  DD.afterLoad(function () {
    if (!DD.UI) return;
    DD.UI.screen('levelup', {
      cls: 'full dim',
      history: false,
      mount: function (root, params) {
        const UI = DD.UI, el = UI.el;
        params = params || {};
        const r = run();
        let queue = Array.isArray(params.queue) ? params.queue.slice() : [];
        if (!queue.length && params.heroIdx !== undefined) queue = [params.heroIdx];
        st = { queue: queue, done: [], next: params.next || null, refs: {} };
        const wrap = el('div.lu-wrap');
        wrap.appendChild(el('div.lu-burst'));
        wrap.appendChild(el('div.lu-title', null, 'Level Up!'));
        // subtitle: the DM's level_up line (narration key with no tokens, ARCHITECTURE §3.10)
        st.refs.dm = el('div.lu-status');
        wrap.appendChild(st.refs.dm);
        st.refs.status = el('div.lu-step', null, '');
        st.refs.lineup = el('div.lu-lineup');
        wrap.appendChild(el('div.lu-bottom', null, st.refs.status, st.refs.lineup));
        root.appendChild(wrap);
        if (!r) { st.refs.dm.textContent = 'No campaign in progress.'; root.appendChild(el('div.lu-foot', null, UI.button('Title', function () { UI.show('title'); }, { cls: 'primary' }))); return; }
        const line = UI.narrate('level_up', {}, LEVEL_UP_FALLBACK);
        if (line) st.refs.dm.appendChild(UI.narration(line, { cls: 'lu-dm' }));
        renderLineup(-1);
        next();
      },
      unmount: function () { st = null; },
    });
  });
})();
