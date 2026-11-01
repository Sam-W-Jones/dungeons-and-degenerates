/* Dungeons and Degenerates — tests/content/boss_dm.js
 * Suites "boss_dm: …" for js/data/bosses/dm.js (The Dungeon Master, encounter boss_dm): registry + arena, the screen
 * puzzle, house rules (and the telegraphs that show them), per-phase pattern rotation, every attack's damage vs its desc,
 * phase transitions + plot armor, track switches (a diverted train survives his stun / taunt / dazzle), handbooks + the
 * doom countdown, cameo caps, robustness (sandbox, charm, stun guard, previews, deployment rewinds) and AutoPlay sims
 * with the fixture party and (full runs only) random parties of real heroes at level 10.
 */
(function () {
  'use strict';
  const T = window.DD_TEST;
  const DD = window.DD;
  const PARTY = ['test_knight', 'test_cleric', 'test_mage', 'test_rogue'];
  const DM = 'dungeon_master';

  // ---- helpers --------------------------------------------------------------------------------------------------
  function B() { return DD.BossDM; }
  /** Fixture party at a level: starting skills + the first 2 pool skills, upgraded like the debug builds. */
  function partyAt(level) {
    return PARTY.map(function (id) {
      const h = DD.getHero(id);
      const pool = h.skillPool.filter(function (s) { return h.startingSkills.indexOf(s) < 0; });
      const lv = Math.min(3, 1 + Math.floor((level - 1) / 4));
      const ids = h.startingSkills.concat(pool.slice(0, 2));
      return DD.Combat.makeRunHero({ id: id, level: level, skills: ids.map(function (s) { return { id: s, level: Math.min(lv, DD.getSkill(s).levels.length) }; }) });
    });
  }
  /** The real encounter (arena, objects, marks) with the fixture party. */
  function startFight(seed, level, diff) {
    const setup = DD.Encounter.build('boss_dm', partyAt(level || 10), { rng: DD.RNG('dm:' + seed), difficulty: diff || 'normal', act: 3 });
    return DD.Combat.start(setup, { seed: seed, headless: true, difficulty: diff || 'normal', kind: 'boss' });
  }
  function dmUnit() { return DD.Combat.state.units.filter(function (u) { return u.defId === DM; })[0]; }
  function heroes() { return DD.Combat.state.units.filter(function (u) { return u.kind === 'hero' && !u.dead; }); }
  function hero(id) { return DD.Combat.state.units.filter(function (u) { return u.defId === id; })[0]; }
  function has(u, id) { return DD.Act.hasStatus(u, id); }
  function objs(id) { return DD.Grid.allTiles().filter(function (t) { return t.obj && t.obj.id === id; }); }
  function tagged(tag) { return DD.Grid.allTiles().filter(function (t) { return t.tag === tag; }).map(function (t) { return { x: t.x, y: t.y }; }); }
  function act(fn) { return DD.Combat._action(fn); }
  function intents(id) { return dmUnit().intents.filter(function (i) { return i.skillId === id; }); }
  function exec(u, it) { return act(function () { return DD.AI.executeIntent(u, it); }); }
  function cameos() { return DD.Combat.state.units.filter(function (u) { return u.data && u.data.dmCameo && !u.dead; }); }
  function clearCameos() { act(function () { cameos().forEach(function (u) { DD.Act.kill(u, null); }); }); }
  /** Put a unit on a free tile (no tile effects). */
  function put(u, x, y) { return u.x === x && u.y === y ? true : DD.Act.teleport(u, x, y, { noEnter: true, fx: false }); }
  function breakScreen(src) { objs('dm_screen_panel').forEach(function (t) { DD.Act.damageObject(src || null, t.x, t.y, 99); }); }
  /** No house rule in play, and whatever this round's rule already handed out (Inspired, Cheeto Slow, AP) is gone too. */
  function noRule() {
    DD.Act.removeRule('dm_house_rule');
    heroes().forEach(function (h) { ['inspired', 'slow'].forEach(function (id) { DD.Act.removeStatus(h, id, { silent: true }); }); h.ap = h.maxAp; });
  }
  function endTurn() { return DD.Combat.endTurn(); }
  /** Phase 1 with the screen down, no stun, no cameos, no house rule: a clean, Exposed DM. */
  function exposedFight(seed) {
    startFight(seed);
    clearCameos();
    act(function () { breakScreen(heroes()[0]); });
    const dm = dmUnit();
    DD.Act.removeStatus(dm, 'stun', { silent: true });
    dm.data.stunGuard = -1;
    noRule();
    return dm;
  }
  function noGuard() { heroes().forEach(function (h) { h.ap = 0; }); }
  /** The DM in a bare sandbox (no arena objects or marks). */
  function bare(seed, extra) {
    return DD.Combat.sandbox(Object.assign({ w: 11, h: 11, seed: seed || 5, noPlan: true, kind: 'boss',
      heroes: [{ id: 'test_knight', x: 2, y: 8, level: 10 }, { id: 'test_cleric', x: 4, y: 9, level: 10 }, { id: 'test_mage', x: 6, y: 9, level: 10 }, { id: 'test_rogue', x: 9, y: 8, level: 10 }],
      enemies: [{ id: DM, x: 5, y: 2 }] }, extra || {}));
  }
  /** Force the house rule rolled as `roll` on the d20. */
  function rule(roll) { return act(function () { return B().rollHouseRule(dmUnit(), roll); }); }
  function ruleKey() { const r = DD.Combat.state.rules.filter(function (x) { return x.id === 'dm_house_rule'; })[0]; return r ? r.key : null; }
  function mentions(text, n) { return new RegExp('(^|[^0-9])' + n + '(?![0-9])').test(text); }
  function logHas(re) { return DD.Combat.state.log.some(function (l) { return re.test(l.text); }); }
  /** Move to phase 2 (mid-turn flip). */
  function toPhase2(dm) { dm.hp = Math.ceil(dm.maxHp * 2 / 3) + 1; act(function () { DD.Act.damage(null, dm, 2, { cause: 'other' }); }); }
  /** Move to phase 3 (mid-turn flip from phase 2). */
  function toPhase3(dm) {
    if (dm.data.phase < 2) toPhase2(dm);
    dm.data.lastShift = -1;
    dm.hp = Math.ceil(dm.maxHp / 3) + 1;
    act(function () { DD.Act.damage(null, dm, 2, { cause: 'other' }); });
  }
  function buffHeroes(n) { heroes().forEach(function (h) { h.maxHp = h.hp = n; }); }
  /** HP lost per unit to hits while fn runs (next round's Snack Break or a stray heal can't blur the numbers). */
  function hitsDuring(fn) {
    const got = {};
    DD.Act.addRule({ id: 'test_dm_hits', name: 'Test hit counter', hooks: { onTakeDamage: function (d) { got[d.target.id] = (got[d.target.id] || 0) + d.dealt; } } });
    try { fn(); } finally { DD.Act.removeRule('test_dm_hits'); }
    return function (u) { return got[u.id] || 0; };
  }
  function freeSpot(pred) { return DD.Grid.allTiles().filter(function (t) { return DD.Grid.isFree(t.x, t.y) && !DD.Grid.isDrop(t.x, t.y) && (!pred || pred(t)); })[0]; }

  // ---- registry & arena -------------------------------------------------------------------------------------------
  T.suite('boss_dm: registry, arena and encounter', function (t) {
    const ids = { enemies: [DM, 'dm_cameo_goblin', 'dm_cameo_skeleton', 'dm_cameo_imp'],
      skills: ['dm_fudged_roll', 'dm_secret_roll', 'dm_rocks_fall', 'dm_railroad', 'dm_plot_hook', 'dm_get_off', 'dm_tpk', 'dm_cameo_stab', 'dm_cameo_bone', 'dm_cameo_ember'],
      objects: ['dm_screen_panel', 'dm_track_switch', 'dm_handbook', 'dm_book_stack'], terrain: ['dm_track'], statuses: ['dm_exposed'], encounters: ['boss_dm'] };
    for (const kind in ids) ids[kind].forEach(function (id) { t.ok(!!DD.defs[kind][id], kind + ' ' + id + ' registered'); });
    const def = DD.getEnemy(DM);
    t.eq(def.tier, 'boss', 'boss tier');
    t.ok(def.hp >= 420 && def.hp <= 520, 'HP in the DESIGN act-3 band: ' + def.hp);
    t.ok(def.boss && def.boss.title && def.boss.intro, 'boss title + intro');
    t.eq(typeof def.ai, 'function', 'custom planner');
    t.ok(def.flags.immovable && !def.flags.stunImmune, 'immovable, stunnable');
    t.ok(def.sprite.scale >= 1.8 && def.sprite.scale <= 2.4, 'big sprite (' + def.sprite.scale + ')');
    ['spawn', 'attack', 'hurt', 'death', 'phase2', 'phase3', 'screen', 'rule', 'cameo', 'diverted', 'lawyered', 'stunned'].forEach(function (k) {
      t.ok(Array.isArray(def.barks[k]) && def.barks[k].length >= 2, 'barks.' + k);
    });
    Object.keys(DD.defs.enemies).filter(function (k) { return k === DM || k.indexOf('dm_') === 0; }).forEach(function (k) {
      const barks = DD.getEnemy(k).barks;
      for (const key in barks) barks[key].forEach(function (b) { t.ok(b.length <= 70, k + ' bark ≤ 70 chars: ' + b); });
    });
    t.ok(def.barks.death.every(function (b) { return b.indexOf('Fine. FINE. You win. Same time next week?') === 0; }), 'the defeat line');
    ids.skills.forEach(function (id) {
      const s = DD.getSkill(id), L = s.levels[0], d = DD.skillDesc(s, 1, null);
      ['dmg', 'push', 'pull', 'self'].forEach(function (k) { if (typeof L[k] === 'number') t.ok(mentions(d, L[k]), id + ' desc shows ' + k + ' ' + L[k]); });
    });
    ['dm_start', 'dm_phase2', 'dm_phase3', 'dm_screen', 'dm_rule', 'dm_cameo', 'dm_switch', 'dm_objection', 'dm_defeat'].forEach(function (k) {
      t.ok((DD.defs.narration[k] || []).length >= 2, 'narration ' + k);
    });
    t.ok((DD.defs.narration.boss_start || []).length >= 1, 'a (generic) boss_start line');
    t.ok(DD.defs.narration.dm_start.every(function (l) { return /screen/.test(l); }), 'the opening hint points at the screen');
    // the arena
    startFight('arena' + t.seed);
    const s = DD.Combat.state, dm = dmUnit();
    t.eq(s.theme, 'dm_table', 'theme');
    t.eq(s.grid.w + 'x' + s.grid.h, '14x11', 'arena size');
    t.ok(dm && DD.Grid.tile(dm.x, dm.y).tag === 'boss_spawn', 'the DM sits on his B mark');
    t.eq(objs('dm_screen_panel').length, 3, '3 screen panels');
    t.eq(objs('dm_track_switch').length, 2, '2 track switches');
    t.eq(tagged('lane1').length + tagged('lane2').length, 28, '2 full-width train lanes');
    t.ok(tagged('book').length >= 4 && tagged('cameo').length >= 4, 'book and cameo marks');
    t.eq(s.objective.type, 'boss', 'boss objective');
    t.ok(/Smash the DM Screen/.test(s.objective.flavor), 'the objective subtitle explains the screen: ' + s.objective.flavor);
    t.ok(logHas(/final session/), 'encounter intro logged');
    t.ok(DD.Combat.state.log.some(function (l) { return l.cls === 'narrator' && DD.defs.narration.dm_start.indexOf(l.text) >= 0; }), 'the DM\'s opening hint is narrated');
    t.ok(heroes().length === 4 && heroes().every(function (h) { return h.y >= 9; }), 'heroes deploy at the bottom');
    const reach = DD.Grid.reachable(heroes()[0], 99, { ignoreUnits: true });
    t.ok(!reach.has((dm.x - 1) + ',' + dm.y) && !reach.has((dm.x + 1) + ',' + dm.y), 'the alcove is sealed by the screen and the stacks');
    t.ok(DD.Grid.los(dm, { x: dm.x, y: dm.y + 5 }) && DD.Grid.los(dm, { x: dm.x - 3, y: dm.y + 2 }), 'screen panels and stacks do not block his sight');
    t.ok(objs('dm_screen_panel').every(function (p) { return /DM Screen \((Left|Center|Right) Panel\)/.test(p.obj.label); }), 'panels are labelled');
    t.ok(objs('dm_screen_panel').every(function (p) { return p.obj.data !== objs('dm_screen_panel')[0].obj.data || p === objs('dm_screen_panel')[0]; }), 'panel data is not shared');
    t.ok(ruleKey(), 'a house rule is in play from round 1');
  });

  // ---- phase 1 puzzle: the DM Screen ---------------------------------------------------------------------------
  T.suite('boss_dm: the DM Screen (invulnerable, smashed, collapses on him)', function (t) {
    startFight('screen' + t.seed);
    clearCameos();
    noRule();
    const dm = dmUnit(), k = hero('test_knight'), c = hero('test_cleric');
    t.ok(dm.flags.invulnerable && has(dm, 'invulnerable'), 'screened: invulnerable (flag + status)');
    t.eq(act(function () { return DD.Act.damage(k, dm, 30, { cause: 'skill' }); }), 0, 'no damage behind the screen');
    DD.Act.removeStatus(dm, 'invulnerable', { silent: true });
    t.eq(act(function () { return DD.Act.damage(k, dm, 30, { cause: 'skill' }); }), 0, 'dispelling the status does not help: the screen itself protects him');
    act(function () { B().syncShield(dm); });
    t.ok(has(dm, 'invulnerable'), 'status restored by the next sync');
    t.eq(DD.AI.estimate(k, dm, 10, null), 0, 'AI and AutoPlay see him as untouchable');
    t.ok(dm.intents.length >= 1 && dm.intents.every(function (i) { return i.skillId === 'dm_secret_roll'; }), 'behind the screen he rolls in secret (no line of sight needed)');
    const panels = objs('dm_screen_panel').sort(function (a, b) { return a.x - b.x; });
    const pdef = DD.getObject('dm_screen_panel');
    t.eq(panels[0].obj.hp, 10, 'panel HP');
    t.ok(DD.Combat.smashable(panels[0].obj), 'panels are smashable');
    t.eq(pdef.autoplay(k, panels[0].obj), 30, 'AutoPlay hint while 3 stand');
    t.ok(put(k, panels[0].x, panels[0].y + 1), 'knight next to the left panel');
    const ix = DD.Combat.interactions(k).filter(function (o) { return o.x === panels[0].x && o.y === panels[0].y; })[0];
    t.ok(ix && ix.kind === 'smash' && ix.ap === 1, 'Smash interaction (1 AP)');
    t.ok(DD.Combat.interact(k, panels[0].x, panels[0].y), 'smash 1');
    t.eq(objs('dm_screen_panel').length, 3, 'still standing at 5 HP');
    t.ok(DD.Combat.interact(k, panels[0].x, panels[0].y), 'smash 2');
    t.eq(objs('dm_screen_panel').length, 2, 'left panel destroyed');
    t.ok(logHas(/Behind it: Encounter tables/), 'the left panel reveals his encounter tables');
    t.ok(/2 panels left/.test(DD.Combat.state.objective.flavor), 'subtitle counts the panels: ' + DD.Combat.state.objective.flavor);
    act(function () { DD.Act.damageObject(c, panels[1].x, panels[1].y, 10); });
    t.eq(objs('dm_screen_panel').length, 1, 'center panel destroyed by damage (skills that hit objects work too)');
    t.eq(pdef.autoplay(k, panels[2].obj), 45, 'the last panel is worth the most to AutoPlay');
    t.ok(dm.flags.invulnerable && dm.hp === dm.maxHp, 'still invulnerable with 1 panel left');
    const before = dm.intents.length;
    act(function () { DD.Act.damageObject(c, panels[2].x, panels[2].y, 10); });
    const d = dm.data;
    t.ok(d.screenDown && !dm.flags.invulnerable && !has(dm, 'invulnerable'), 'screen down: no longer invulnerable');
    t.eq(dm.hp, dm.maxHp - 60, 'the screen falls on him: 60 damage');
    t.ok(has(dm, 'stun') && before > 0 && dm.intents.length === 0, 'stunned: his telegraphs are cancelled at once');
    t.ok(has(dm, 'dm_exposed'), 'Exposed');
    t.eq(act(function () { return DD.Act.damage(c, dm, 10, { cause: 'skill' }); }), 15, 'Exposed: +50% damage taken');
    // [phase 4] Exposed is a declared takenMult, so the AI's / AutoPlay's damage estimate sees it as well
    const exSt = DD.Act.getStatus(dm, 'dm_exposed'), exAt = dm.statuses.indexOf(exSt);
    const withEx = DD.AI.estimate(c, dm, 20, null);
    dm.statuses.splice(exAt, 1);                 // a peek without it (no hooks, no popups)
    const without = DD.AI.estimate(c, dm, 20, null);
    dm.statuses.splice(exAt, 0, exSt);
    t.ok(withEx > without, 'DD.AI.estimate counts Exposed (' + without + ' → ' + withEx + ')');
    t.eq(d.stats.panels, 3, 'stats: 3 panels');
    t.eq(d.stats.screen, 1, 'stats: screen down in round 1');
    t.eq(pdef.autoplay(k, { hp: 10 }), 0, 'no more panel value');
    t.ok(/Screen's down/.test(DD.Combat.state.objective.flavor), 'subtitle updated');
    t.ok(logHas(/collapses onto the Dungeon Master/), 'logged');
    // the stun costs him exactly his current turn
    endTurn();
    t.ok(!has(dm, 'stun'), 'stun over after his skipped turn');
    t.ok(dm.intents.length > 0 && intents('dm_fudged_roll').length > 0 && !intents('dm_secret_roll').length, 'next round he plans again, rolls now need line of sight');
    t.ok(has(dm, 'dm_exposed'), 'still Exposed in phase 1');
  });

  // ---- rules lawyering ------------------------------------------------------------------------------------------
  T.suite('boss_dm: house rules (one per round, each does what its chip says)', function (t) {
    const dm = exposedFight('rules' + t.seed);
    const k = hero('test_knight'), c = hero('test_cleric'), m = hero('test_mage'), r = hero('test_rogue');
    const hit = function (src, tgt, n) { return act(function () { return DD.Act.damage(src, tgt, n, { cause: 'skill', noHighGround: true }); }); };
    rule(1); t.eq(ruleKey(), 'milestone', 'd20 1: Milestone XP');
    t.eq(hit(c, m, 5), 5, 'Milestone XP: nothing changes');
    rule(4); t.eq(ruleKey(), 'exploding', 'd20 4: Exploding Dice');
    t.eq(DD.Combat.state.rules.filter(function (x) { return x.id === 'dm_house_rule'; }).length, 1, 'one house rule at a time');
    t.eq(hit(c, m, 5), 7, 'Exploding Dice: hero attacks +2');
    t.eq(hit(dm, m, 5), 7, 'Exploding Dice: his attacks +2 too');
    rule(6); t.eq(ruleKey(), 'snacks', 'd20 6: Snack Break');
    const mhp = m.hp; act(function () { DD.Hooks.fire('onTurnStart', m, m); });
    t.eq(m.hp, mhp + 4, 'Snack Break heals heroes 4 at turn start');
    dm.hp -= 20; const dhp = dm.hp; act(function () { DD.Hooks.fire('onTurnStart', dm, dm); });
    t.eq(dm.hp, dhp, 'but never the DM');
    rule(8); t.eq(ruleKey(), 'los', 'd20 8: Strict Line of Sight');
    t.eq(DD.Targeting.range(m, DD.getSkill('test_bolt'), 1)[1], 4, 'heroes lose 1 max range (5 → 4)');
    t.eq(DD.Targeting.range(dm, DD.getSkill('dm_fudged_roll'), 1)[1], 14, 'his range is untouched');
    rule(10); t.eq(ruleKey(), 'ac', 'd20 10: Armor Class Is Back');
    t.eq(hit(c, m, 6), 4, 'every attack deals 2 less');
    rule(12); t.eq(ruleKey(), 'flank', 'd20 12: Flanking Rules');
    t.eq(hit(c, m, 8), 8, 'no flanking: normal damage');
    const g1 = DD.Act.spawn('dm_cameo_goblin', m.x - 1, m.y, { noFx: true, silent: true });
    const g2 = DD.Act.spawn('dm_cameo_goblin', m.x + 1, m.y, { noFx: true, silent: true });
    t.ok(g1 && g2 && DD.Grid.dist(g1, m) === 1 && DD.Grid.dist(g2, m) === 1, 'two goblins flank the mage');
    t.eq(hit(g1, m, 8), 10, 'flanked: +25%');
    rule(14); t.eq(ruleKey(), 'cheeto', 'd20 14: Cheeto Fingers');
    clearCameos();
    put(r, dm.x, dm.y + 3);
    const it = DD.AI.makeIntent(dm, 'dm_fudged_roll', r, { anchor: 'unit', noCooldown: true });
    exec(dm, it);
    const rt = DD.Grid.tile(r.x, r.y);
    t.ok(rt.surface && rt.surface.id === 'cheeto', 'his hits leave Cheeto dust');
    rule(16); t.eq(ruleKey(), 'fiat', 'd20 16: DM Fiat');
    t.eq(hit(dm, c, 10), 14, 'his attacks +4');
    t.eq(hit(c, m, 10), 10, 'heroes unaffected');
    rule(18); t.eq(ruleKey(), 'inspire', 'd20 18: Inspiration for Everyone');
    act(function () { DD.Hooks.fire('onTurnStart', k, k); });
    t.ok(has(k, 'inspired'), 'heroes start their turn Inspired');
    rule(20); t.eq(ruleKey(), 'speed', 'd20 20: Speed Factor Initiative');
    const ap = c.ap; act(function () { DD.Hooks.fire('onTurnStart', c, c); });
    t.eq(c.ap, ap + 1, 'heroes +1 AP');
    act(function () { DD.Act.addStatus(k, 'stun', { turns: 1 }, dm); });
    k.ap = 0; act(function () { DD.Hooks.fire('onTurnStart', k, k); });
    t.eq(k.ap, 0, 'a stunned hero gets no AP out of it (no phantom AP pip)');
    DD.Act.removeStatus(k, 'stun', { silent: true });
    // lifecycle: it expires at the round's end and a fresh one is rolled next round
    t.eq(DD.Combat.state.rules.filter(function (x) { return x.id === 'dm_house_rule'; })[0].turns, 1, 'lasts this round');
    t.ok(/Rolled a 20/.test(DD.Combat.state.rules.filter(function (x) { return x.id === 'dm_house_rule'; })[0].desc), 'the chip shows the roll');
    const rolledBefore = dm.data.stats.rules;
    endTurn();
    t.ok(ruleKey() && dm.data.stats.rules === rolledBefore + 1, 'a new rule next round');
    // phase 2+: rolls that help the heroes get re-rolled ("fudged"); phase 1 is honest
    let fudged = 0;
    for (let i = 0; i < 40; i++) { act(function () { B().rollHouseRule(dm); }); }
    t.ok(!logHas(/didn't like his first roll/), 'phase 1: honest rolls');
    dm.data.phase = 2;
    for (let i = 0; i < 40; i++) { act(function () { B().rollHouseRule(dm); }); }
    DD.Combat.state.log.forEach(function (l) { if (/didn't like his first roll/.test(l.text)) fudged++; });
    t.ok(fudged > 0, 'phase 2: good rolls get fudged (' + fudged + ' of 40)');
  });

  T.suite('boss_dm: his telegraphs show this round\'s house rule (shown number = damage)', function (t) {
    /** The mage alone in the middle of the table (the others parked in the far corner), no armor, no Block. */
    function lone(seed) {
      const dm = exposedFight(seed);
      buffHeroes(400);
      ['test_knight', 'test_cleric', 'test_rogue'].forEach(function (id, i) { put(hero(id), i, 10); });
      const m = hero('test_mage');
      m.armor = 0; m.block = 0;
      return dm;
    }
    // [d20 roll, rule, flat change on his telegraphs]
    [[1, 'milestone', 0], [4, 'exploding', 2], [10, 'ac', -2], [16, 'fiat', 4]].forEach(function (c) {
      const res = [];
      ['dm_fudged_roll', 'dm_secret_roll', 'dm_rocks_fall', 'dm_railroad', 'dm_plot_hook', 'dm_get_off', 'dm_tpk'].forEach(function (sid) {
        const dm = lone('tg' + c[0] + sid + t.seed);
        const m = hero('test_mage');
        let tgt, opts;
        if (sid === 'dm_get_off') { put(m, dm.x, dm.y + 1); tgt = dm; opts = { anchor: 'self' }; }
        else if (sid === 'dm_rocks_fall') { put(m, 7, 7); tgt = { x: 7, y: 7 }; opts = { anchor: 'ground', tiles: DD.Grid.shape('cross', tgt, null, 1), data: { centers: [tgt] } }; }
        else if (sid === 'dm_railroad') { put(m, 1, 8); tgt = { x: 7, y: 8 }; opts = { anchor: 'ground', tiles: B().lanes(dm)[1], data: { lane: 1, dir: 1 } }; }
        else if (sid === 'dm_tpk') { put(m, 7, 7); tgt = { x: dm.x, y: dm.y }; opts = { anchor: 'ground', tiles: DD.Grid.allTiles().map(function (p) { return { x: p.x, y: p.y }; }) }; }
        else { put(m, dm.x, dm.y + 6); tgt = m; opts = { anchor: 'unit' }; }
        opts.noCooldown = true;
        rule(c[0]);
        const it = DD.AI.makeIntent(dm, sid, tgt, opts);
        const shown = DD.AI.describe(dm, it).dmg;
        const hp = m.hp;
        exec(dm, it);
        t.eq(shown, DD.getSkill(sid).levels[0].dmg + c[2], sid + ' telegraph under ' + c[1]);
        t.eq(hp - m.hp, shown, sid + ' under ' + c[1] + ': damage = telegraph (' + shown + ')');
        res.push(sid.replace('dm_', '') + ' ' + shown);
      });
      t.log(c[1] + ': ' + res.join(', '));
    });
    // Flanking Rules: a tracked shot at a hero standing between two of his minis shows (and deals) +25%
    const dm = lone('tgflank' + t.seed);
    const m = hero('test_mage');
    put(m, 7, 7);
    DD.Act.spawn('dm_cameo_goblin', 6, 7, { noFx: true, silent: true });
    DD.Act.spawn('dm_cameo_goblin', 8, 7, { noFx: true, silent: true });
    rule(12);
    const it = DD.AI.makeIntent(dm, 'dm_fudged_roll', m, { anchor: 'unit', noCooldown: true });
    const shown = DD.AI.describe(dm, it).dmg;
    const hp = m.hp;
    exec(dm, it);
    t.eq(shown, Math.round(15 * 1.25), 'flanked: the telegraph shows +25%');
    t.eq(hp - m.hp, shown, 'and that is what lands');
    // the rule rolled at round start is the one his attacks use at the end of the same round
    const dm2 = lone('tgflow' + t.seed);
    const m2 = hero('test_mage');
    put(m2, 7, 7);
    rule(16);
    dm2.intents = [];
    DD.AI.makeIntent(dm2, 'dm_fudged_roll', m2, { anchor: 'unit', noCooldown: true });
    const shown2 = DD.AI.describe(dm2, dm2.intents[0]).dmg;
    // count the hit itself (next round's house rule may be a Snack Break that heals the mage right after)
    let got = 0;
    DD.Act.addRule({ id: 'test_dm_hit_watch', name: 'test', hooks: { onTakeDamage: function (d) { if (d.target === m2 && d.source === dm2) got += d.dealt; } } });
    noGuard();
    endTurn();
    DD.Act.removeRule('test_dm_hit_watch');
    t.eq(got, 19, 'DM Fiat still applies when his turn comes (19)');
    t.eq(shown2, 19, '… exactly as telegraphed');
    // a ⏳ attack lands under a later round's rule: its telegraph keeps the base number until it is due
    rule(16);
    const later = DD.AI.makeIntent(dm2, 'dm_rocks_fall', { x: 7, y: 7 }, { anchor: 'ground', tiles: DD.Grid.shape('cross', { x: 7, y: 7 }, null, 1), delay: 1, noCooldown: true });
    t.eq(DD.AI.describe(dm2, later).dmg, 26, '⏳1 Rocks Fall: base 26 under this round\'s DM Fiat');
    later.delay = 0;
    t.eq(DD.AI.describe(dm2, later).dmg, 30, '… and 30 once it is due under DM Fiat');
    // [phase 4, engine rule-level telegraphFlat] his cameos (real enemies of every act, no house-rule code of their own)
    // show the house rule too: Exploding Dice +2, Armor Class Is Back −2. Before, only his own skills did.
    [[4, 'exploding', 2], [10, 'ac', -2], [16, 'fiat', 0]].forEach(function (c) {
      lone('tgcameo' + c[0] + t.seed);
      const m3 = hero('test_mage');
      put(m3, 7, 7);
      const g = act(function () { return DD.Act.spawn('test_grunt', 7, 6, { noFx: true, silent: true }); });
      if (!t.ok(!!g, 'a stand-in cameo (test_grunt) on the table')) return;
      rule(c[0]);
      g.intents = [];
      const it = DD.AI.makeIntent(g, 'test_grunt_stab', m3, { noCooldown: true });
      const shown = DD.AI.describe(g, it).dmg;
      const hp = m3.hp;
      exec(g, it);
      t.eq(shown, 4 + c[2], 'cameo telegraph under ' + c[1] + ' (' + shown + ')');
      t.eq(hp - m3.hp, shown, 'cameo hit under ' + c[1] + ' = its telegraph');
    });
  });

  // ---- planner patterns -------------------------------------------------------------------------------------------
  T.suite('boss_dm: pattern rotation per phase', function (t) {
    startFight('pattern' + t.seed);
    buffHeroes(400);
    const dm = dmUnit();
    const d = dm.data;
    t.eq(cameos().length, 2, 'round 1: Random Encounter (2 cameos)');
    t.eq(intents('dm_secret_roll').length, 2, 'round 1: two rolls');
    t.eq(intents('dm_rocks_fall').length, 0, 'round 1: no rocks yet');
    endTurn();
    const rocks = intents('dm_rocks_fall');
    t.eq(rocks.length, 1, 'round 2: Rocks Fall');
    t.ok(rocks[0] && rocks[0].delay === 1 && rocks[0].anchor === 'ground', 'Rocks Fall is telegraphed a round ahead (⏳1, ground)');
    t.ok(rocks[0] && rocks[0].tiles.length >= 3 && rocks[0].data.centers.length >= 1 && rocks[0].data.centers.every(function (p) { return rocks[0].tiles.some(function (q) { return q.x === p.x && q.y === p.y; }); }), 'crosses around heroes (' + (rocks[0] ? rocks[0].tiles.length : 0) + ' tiles)');
    t.eq(intents('dm_secret_roll').length, 2, 'round 2: two rolls');
    endTurn();
    t.ok(intents('dm_rocks_fall').length === 1 && intents('dm_rocks_fall')[0].delay === 0, 'round 3: the rocks are due, no new rocks');
    const before = d.cameos;
    endTurn();
    t.ok(d.cameos > before, 'round 4: another Random Encounter');
    t.ok(cameos().length <= 3, 'never more than 3 cameos alive (' + cameos().length + ')');
    // phase 2
    clearCameos();
    act(function () { breakScreen(heroes()[0]); });
    DD.Act.removeStatus(dm, 'stun', { silent: true });
    toPhase2(dm);
    t.eq(d.phase, 2, 'phase 2');
    endTurn();
    const tr1 = intents('dm_railroad');
    t.ok(tr1.length === 1 && tr1[0].delay === 1, 'phase 2: a train telegraphed a round ahead');
    t.eq(intents('dm_plot_hook').length, 1, 'first railroad round: Plot Hook');
    t.eq(intents('dm_fudged_roll').length, 1, '… and one roll');
    const lane1 = tr1[0].data.lane;
    t.eq(tr1[0].tiles.length, 14, 'a whole lane');
    endTurn();
    const tr2 = intents('dm_railroad');
    t.eq(tr2.length, 2, 'one train due, the next one ⏳1');
    t.ok(tr2.some(function (i) { return i.delay === 0 && i.data.lane === lane1; }) && tr2.some(function (i) { return i.delay === 1 && i.data.lane !== lane1; }), 'lanes alternate');
    t.eq(intents('dm_fudged_roll').length, 2, 'second railroad round: two rolls');
    // phase 3
    clearCameos();
    toPhase3(dm);
    t.eq(d.phase, 3, 'phase 3');
    endTurn();
    const doom = intents('dm_tpk')[0];
    t.ok(doom && doom.delay === 2 && doom.tiles.length === DD.Combat.state.grid.tiles.length, 'phase 3: ROCKS FALL, EVERYONE DIES over the whole table, ⏳2');
    t.eq(intents('dm_fudged_roll').length, 2, 'phase 3: two rolls a round');
    t.ok(intents('dm_rocks_fall').length + intents('dm_railroad').length >= 1, 'plus rocks or trains');
  });

  T.suite('boss_dm: Get Off My Table (only when crowded, every other round)', function (t) {
    const dm = exposedFight('shove' + t.seed);
    buffHeroes(400);
    const r = hero('test_rogue'), c = hero('test_cleric');
    put(r, dm.x - 1, dm.y);
    endTurn();
    t.eq(intents('dm_get_off').length, 0, 'one hero adjacent: no shove');
    put(c, dm.x, dm.y + 1);
    endTurn();
    const shove = intents('dm_get_off')[0];
    t.ok(!!shove && shove.anchor === 'self', 'two heroes adjacent: shove telegraphed around him');
    dm.intents = dm.intents.filter(function (i) { return i !== shove; });
    put(r, dm.x - 1, dm.y); put(c, dm.x, dm.y + 1);
    endTurn();
    t.eq(intents('dm_get_off').length, 0, 'still crowded next round, but not two rounds in a row');
    put(r, dm.x - 1, dm.y); put(c, dm.x, dm.y + 1);
    endTurn();
    t.eq(intents('dm_get_off').length, 1, 'the round after, again');
  });

  // ---- every attack: damage == desc ------------------------------------------------------------------------------
  T.suite('boss_dm: every attack deals exactly what its desc says', function (t) {
    let dm = exposedFight('atk' + t.seed);
    buffHeroes(400);
    const c = hero('test_cleric'), m = hero('test_mage'), r = hero('test_rogue');
    // Fudged Roll (15, line of sight)
    put(m, dm.x, dm.y + 4);
    let hp = m.hp;
    exec(dm, DD.AI.makeIntent(dm, 'dm_fudged_roll', m, { anchor: 'unit', noCooldown: true }));
    t.eq(hp - m.hp, 15, 'Fudged Roll: 15 (no high-ground bonus from his dais)');
    const hidden = freeSpot(function (p) { return DD.Grid.dist(p, dm) <= 14 && !DD.Grid.los(dm, p); });
    t.ok(!!hidden, 'there is cover on the table');
    put(m, hidden.x, hidden.y);
    hp = m.hp;
    exec(dm, DD.AI.makeIntent(dm, 'dm_fudged_roll', m, { anchor: 'unit', noCooldown: true }));
    t.eq(m.hp, hp, 'Fudged Roll fizzles behind cover');
    t.ok(logHas(/Lost track/), 'fizzle logged');
    exec(dm, DD.AI.makeIntent(dm, 'dm_secret_roll', m, { anchor: 'unit', noCooldown: true }));
    t.eq(hp - m.hp, 15, 'Roll Behind the Screen: 15, no line of sight needed');
    // Rocks Fall (26 to everyone on the tiles but him, rubble)
    const spot = freeSpot(function (p) { return !p.tag && p.h === 0 && !p.obj && DD.Grid.terrain(p).id !== 'rubble' && p.x > 0 && p.y < 10 && DD.Grid.isFree(p.x + 1, p.y) && DD.Grid.dist(p, dm) > 3; });
    put(m, spot.x, spot.y);
    const gob = DD.Act.spawn('dm_cameo_goblin', spot.x + 1, spot.y, { noFx: true, silent: true });
    const tiles = DD.Grid.shape('cross', spot, null, 1);
    hp = m.hp;
    exec(dm, DD.AI.makeIntent(dm, 'dm_rocks_fall', spot, { anchor: 'ground', tiles: tiles, delay: 0, data: { centers: [{ x: spot.x, y: spot.y }] }, noCooldown: true }));
    t.eq(hp - m.hp, 26, 'Rocks Fall: 26');
    t.ok(gob.dead, 'his own minis get flattened too (26 > 16 HP)');
    t.eq(DD.Grid.tile(spot.x, spot.y).t, 'rubble', 'leaves rubble at the impact');
    // The Railroad (28 + 1 south, minis too)
    const lane = tagged('lane2');
    const ly = lane[0].y;
    put(m, 3, ly); put(r, 9, ly);
    const g2 = DD.Act.spawn('dm_cameo_goblin', 11, ly, { noFx: true, silent: true });
    const mhp = m.hp, rhp = r.hp;
    exec(dm, DD.AI.makeIntent(dm, 'dm_railroad', lane[7], { anchor: 'ground', tiles: lane, delay: 0, data: { lane: 1, dir: 1 }, noCooldown: true }));
    t.eq(mhp - m.hp, 28, 'The Railroad: 28');
    t.eq(rhp - r.hp, 28, 'every hero on the lane');
    t.ok(m.y === ly + 1 && r.y === ly + 1, 'knocked 1 tile south, off the tracks');
    t.ok(g2.dead, 'his minis are not spared');
    t.ok(dm.hp === dm.maxHp - 60, 'the DM is not on that lane');
    // Plot Hook (10 + pull 3), with a clear column in front of him
    [hero('test_knight'), r, c].forEach(function (u, i) { put(u, 1 + i, 10); });
    put(m, dm.x, dm.y + 7);
    hp = m.hp;
    const d0 = DD.Grid.dist(m, dm);
    exec(dm, DD.AI.makeIntent(dm, 'dm_plot_hook', m, { anchor: 'unit', noCooldown: true }));
    t.eq(hp - m.hp, 10, 'Plot Hook: 10');
    t.eq(d0 - DD.Grid.dist(m, dm), 3, 'pulled 3 tiles toward the DM');
    // Get Off My Table (13 + knockback 2)
    put(m, 1, 9); put(r, dm.x - 1, dm.y); put(c, dm.x, dm.y + 1);
    const r0 = r.hp, c0 = c.hp;
    exec(dm, DD.AI.makeIntent(dm, 'dm_get_off', dm, { anchor: 'self', noCooldown: true }));
    t.eq(r0 - r.hp, 16, 'Get Off My Table: 13, +3 bump against the sourcebooks');
    t.eq(c0 - c.hp, 13, 'Get Off My Table: 13');
    t.eq(DD.Grid.dist(c, dm), 3, 'knocked back 2');
    // ROCKS FALL, EVERYONE DIES (60 to every hero)
    dm = exposedFight('doomhit' + t.seed);
    const hs = heroes();
    hs.forEach(function (h) { h.maxHp = h.hp = 100; h.block = 0; });
    exec(dm, DD.AI.makeIntent(dm, 'dm_tpk', { x: dm.x, y: dm.y }, { anchor: 'ground', tiles: DD.Grid.allTiles().map(function (x) { return { x: x.x, y: x.y }; }), delay: 0, noCooldown: true }));
    hs.forEach(function (h) { t.eq(100 - h.hp, 60 - (h.armor || 0), h.name + ' takes 60' + (h.armor ? ' (−' + h.armor + ' armor)' : '')); });
    t.eq(dm.hp, dm.maxHp - 60, 'not him');
  });

  // ---- phases ----------------------------------------------------------------------------------------------------
  T.suite('boss_dm: phase transitions and plot armor', function (t) {
    const dm = exposedFight('phase' + t.seed);
    const c = hero('test_cleric');
    const d = dm.data;
    const p2 = B().threshold(dm, 2), p3 = B().threshold(dm, 3);
    t.eq(d.phase, 1, 'phase 1');
    t.eq(p2, Math.ceil(dm.maxHp * 2 / 3), 'phase 2 at 2/3 HP (' + p2 + ')');
    t.eq(p3, Math.ceil(dm.maxHp / 3), 'phase 3 at 1/3 HP (' + p3 + ')');
    t.eq(B().floorHp(dm), p2, 'phase 1 floor = the phase 2 threshold');
    dm.hp = p2 + 10;
    t.eq(act(function () { return DD.Act.damage(c, dm, 10, { cause: 'skill' }); }), 15, 'Exposed hit for 15');
    t.eq(d.phase, 2, 'crossing 2/3 turns the phase over at once');
    t.eq(dm.hp, p2 - 5, 'the damage carries over (no heal back)');
    t.ok(!has(dm, 'dm_exposed'), 'phase 2: he has his notes back (Exposed ends)');
    t.eq(d.stats.phase2, 1, 'phase 2 began in round 1');
    t.ok(logHas(/PHASE 2: The Railroad/), 'phase 2 announced');
    t.ok(/Railroad/.test(DD.Combat.state.objective.flavor), 'subtitle: the railroad');
    // [phase 4, engine modifyFinalDamage] Plot Armor clamps the hit itself: it deals (and reports) only what he loses,
    // nothing is healed back afterwards (lifesteal, damage stats and the log used to see the whole 200)
    const watch = { dealt: 0, healed: 0 };
    DD.Act.addRule({ id: 'test_dm_armor_watch', name: 'test', hooks: {
      onDealDamage: function (dd) { if (dd.target === dm) watch.dealt += dd.dealt; },
      onHealed: function (u, n) { if (u === dm && n > 0) watch.healed += n; } } });
    const hp1 = dm.hp;
    t.eq(act(function () { return DD.Act.damage(c, dm, 200, { cause: 'skill' }); }), hp1 - p3, 'a huge hit deals only what Plot Armor lets through (' + (hp1 - p3) + ')');
    DD.Act.removeRule('test_dm_armor_watch');
    t.eq(watch.dealt, hp1 - p3, 'the hit\'s dealt damage (lifesteal, stats) is the HP he really lost');
    t.eq(watch.healed, 0, 'no heal-back');
    t.eq(dm.hp, p3, 'second threshold in the same round: Plot Armor holds him at 1/3');
    t.ok(d.armored && has(dm, 'invulnerable') && d.phase === 2, 'plot armored, still phase 2');
    t.ok(/PLOT ARMOR/.test(DD.Combat.state.objective.flavor), 'the subtitle says why he stopped taking damage');
    t.eq(act(function () { return DD.Act.damage(c, dm, 30, { cause: 'skill' }); }), 0, 'no more damage this round');
    const prev = DD.Combat.preview(c, c.basic, dm.x, dm.y);
    t.ok(!prev.perUnit[dm.id] || !prev.perUnit[dm.id].dmg, 'previews know about plot armor');
    endTurn();
    t.eq(d.phase, 3, 'next round: phase 3');
    t.ok(!d.armored && !has(dm, 'invulnerable'), 'plot armor gone');
    t.eq(objs('dm_handbook').length, 3, '3 Player\'s Handbooks appear');
    t.ok(d.doom && d.doom.active && d.doom.at === 4, 'the doom countdown starts (fires at the end of round 4)');
    t.eq(intents('dm_tpk').length === 1 ? intents('dm_tpk')[0].delay : -1, 2, 'telegraphed with ⏳2');
    // the subtitle uses the same count as the ⏳ on the telegraph (fires at the end of round now + ⏳)
    t.ok(/ROCKS FALL at the end of round 4 \(⏳2\)/.test(DD.Combat.state.objective.flavor), 'subtitle counts down like the telegraph: ' + DD.Combat.state.objective.flavor);
    // can't die before phase 3 even to a giant overkill
    const dm2 = exposedFight('overkill' + t.seed);
    act(function () { DD.Act.damage(null, dm2, 9999, { cause: 'other' }); });
    t.ok(!dm2.dead && dm2.hp === p3 && dm2.data.phase === 2, 'overkill in phase 1: phase 2 at 1/3 HP with plot armor');
    endTurn();
    t.eq(dm2.data.phase, 3, 'and phase 3 next round');
    act(function () { DD.Act.damage(null, dm2, 9999, { cause: 'other' }); });
    t.ok(dm2.dead, 'phase 3 has no plot armor');
    // plot armor never outlives its round: healed back above the floor, he stays in phase 2 and can be hurt again
    const dm3 = exposedFight('armorheal' + t.seed);
    act(function () { DD.Act.damage(null, dm3, 9999, { cause: 'other' }); });
    t.ok(dm3.data.armored && dm3.hp === p3, 'plot armored at 1/3');
    act(function () { DD.Act.heal(null, dm3, 8); });
    endTurn();
    t.ok(dm3.data.phase === 2 && !dm3.data.armored && !has(dm3, 'invulnerable') && !dm3.flags.invulnerable, 'healed above the floor: phase 2, no plot armor left');
    t.ok(act(function () { return DD.Act.damage(c, dm3, 5, { cause: 'other' }); }) > 0, 'and he takes damage again (no soft-lock)');
  });

  // ---- phase 2 puzzle: track switches ---------------------------------------------------------------------------
  /** Put u on a free tile next to a track switch (a stray mini may stand on the obvious one); returns the switch tile. */
  function besideSwitch(u) {
    const sws = objs('dm_track_switch').sort(function (a, b) { return a.x - b.x; });
    for (let i = 0; i < sws.length; i++) {
      const sw = sws[i];
      if (DD.Grid.dist(u, sw) === 1) return sw;
      const spot = DD.Grid.neighbors(sw.x, sw.y).filter(function (n) { return DD.Grid.isFree(n.x, n.y) && !DD.Grid.isDrop(n.x, n.y); })[0];
      if (spot && put(u, spot.x, spot.y)) return sw;
    }
    return sws[0];
  }
  T.suite('boss_dm: track switches divert the train onto the DM', function (t) {
    const dm = exposedFight('switch' + t.seed);
    buffHeroes(400);
    const r = hero('test_rogue'), c = hero('test_cleric');
    const sdef = DD.getObject('dm_track_switch');
    let sw = besideSwitch(r);
    t.ok(!DD.Combat.interactions(r).some(function (o) { return o.x === sw.x && o.y === sw.y; }), 'phase 1: the switch does nothing yet');
    t.eq(sdef.autoplay(), 0, 'no AutoPlay value in phase 1');
    toPhase2(dm);
    endTurn();
    t.ok(intents('dm_railroad').length === 1 && intents('dm_railroad')[0].delay === 1, 'train ⏳1');
    sw = besideSwitch(r);
    t.ok(!DD.Combat.interactions(r).some(function (o) { return o.x === sw.x && o.y === sw.y; }), 'a train that is not due yet cannot be switched');
    endTurn();
    const due = intents('dm_railroad').filter(function (i) { return i.delay === 0; })[0];
    t.ok(!!due, 'a train is due this turn');
    sw = besideSwitch(r);
    const ix = DD.Combat.interactions(r).filter(function (o) { return o.x === sw.x && o.y === sw.y; })[0];
    t.ok(ix && ix.kind === 'object' && /Switch Tracks/.test(ix.label) && ix.ap === 1, 'Switch Tracks (1 AP)');
    t.eq(sdef.autoplay(), 34, 'AutoPlay value while divertable');
    noRule();   // exact numbers: no house rule this round
    put(c, dm.x - 1, dm.y);
    c.ap = 0;
    t.ok(DD.Combat.interact(r, sw.x, sw.y), 'switched');
    t.ok(due.data.diverted && due.tiles.every(function (p) { return p.y === dm.y; }) && due.tiles.length === 14, 'the due train now runs down the DM\'s row');
    t.ok(/DIVERTED/.test(due.label), 'its telegraph says so');
    t.eq(sdef.autoplay(), 0, 'nothing left to switch this round');
    t.eq(dm.data.stats.switches, 1, 'stats: switch used');
    const lost = hitsDuring(endTurn);
    t.eq(lost(dm), B().N.divert, 'run over by his own plot: ' + B().N.divert);
    t.eq(lost(c), 28, 'whoever stands on his row gets hit too');
    t.ok(has(dm, 'vulnerable'), 'and he is Vulnerable');
    t.eq(DD.Act.getStatus(dm, 'vulnerable').turns, 1, '... through the next player phase');
    t.eq(dm.data.stats.diverted, 1, 'stats: diverted');
    t.ok(logHas(/flattened by his own railroad/), 'logged');
    endTurn();
    t.ok(!has(dm, 'vulnerable'), 'Vulnerable ends with his next turn (as the desc says)');
  });

  /** Phase 2, a train due this turn, a switch thrown by the rogue. Returns the diverted intent. */
  function divertNow(dm) {
    const r = hero('test_rogue');
    toPhase2(dm);
    endTurn(); endTurn();
    r.ap = Math.max(1, r.ap);
    const sw = besideSwitch(r);
    DD.Combat.interact(r, sw.x, sw.y);
    return dm.intents.filter(function (i) { return i.data && i.data.diverted; })[0];
  }
  T.suite('boss_dm: a diverted train is the party\'s (his stun, taunt or dazzle can\'t stop it)', function (t) {
    // stunned after the switch: the engine cancels his intents, the diverted one is pinned back and still runs
    let dm = exposedFight('runaway' + t.seed);
    buffHeroes(400);
    const k = hero('test_knight');
    let it = divertNow(dm);
    t.ok(!!it, 'diverted');
    dm.data.stunGuard = -1;
    act(function () { DD.Act.addStatus(dm, 'stun', { turns: 1 }, k); });
    const kept = dm.intents.filter(function (i) { return i.data && i.data.diverted; });
    t.ok(has(dm, 'stun') && kept.length === 1 && dm.intents.length === 1, 'stunned: everything else is cancelled, the diverted train stays');
    t.ok(kept[0] && kept[0].tiles.length === 14 && kept[0].tiles.every(function (p) { return p.y === dm.y; }), 'still telegraphed down his row');
    const desc = DD.AI.describe(dm, kept[0]);
    t.ok(!/Incapacitated/.test(desc.text) && /DIVERTED/.test(desc.label), 'the inspect text does not claim it will not happen: ' + desc.text);
    noGuard();
    let lost = hitsDuring(endTurn);
    t.eq(lost(dm), B().N.divert, 'it hits him anyway: ' + B().N.divert);
    t.ok(has(dm, 'vulnerable') && dm.data.stats.diverted === 1, 'Vulnerable, counted');
    // taunted after the switch: his attacks turn on the taunter, the diverted train does not
    dm = exposedFight('taunted' + t.seed);
    buffHeroes(400);
    it = divertNow(dm);
    const kn = hero('test_knight');
    put(kn, 3, 9);
    act(function () { DD.Act.addStatus(dm, 'taunt', { turns: 1 }, kn); });
    it = dm.intents.filter(function (i) { return i.data && i.data.diverted; })[0];
    t.ok(it && DD.AI.intentTiles(dm, it).every(function (p) { return p.y === dm.y; }), 'taunt does not drag the diverted train off his row');
    t.ok(dm.intents.filter(function (i) { return !(i.data && i.data.diverted); }).every(function (i) { return DD.AI.intentTiles(dm, i).some(function (p) { return p.x === kn.x && p.y === kn.y; }); }),
      'his own attacks do turn on the taunter');
    noGuard();
    lost = hitsDuring(endTurn);
    t.eq(lost(dm), B().N.divert, 'and it still hits him');
    // dazzled when it fires: a diverted train is not his to aim
    dm = exposedFight('dazzled' + t.seed);
    buffHeroes(400);
    divertNow(dm);
    act(function () { DD.Act.addStatus(dm, 'dazzled', { turns: 2 }, hero('test_cleric')); });
    noGuard();
    lost = hitsDuring(endTurn);
    t.eq(lost(dm), B().N.divert, 'dazzled: still a direct hit');
  });

  // ---- phase 3 puzzle: handbooks & the doom ------------------------------------------------------------------
  T.suite('boss_dm: Player\'s Handbooks rules-lawyer the doom away', function (t) {
    const dm = exposedFight('books' + t.seed);
    buffHeroes(400);
    toPhase3(dm);
    const d = dm.data;
    const books = objs('dm_handbook');
    const bdef = DD.getObject('dm_handbook');
    t.eq(books.length, 3, '3 books');
    t.ok(books.every(function (b) { return DD.Grid.neighbors(b.x, b.y).some(function (n) { return DD.Grid.isWalkable(n.x, n.y); }); }), 'every book can be reached');
    t.ok(books.every(function (b) { return bdef.autoplay(null, b.obj) === 40; }), 'AutoPlay values every unused book at 40');
    endTurn();
    t.ok(intents('dm_tpk').length === 1, 'doom telegraphed');
    const hs = heroes();
    function cite(i, h) {
      const b = books[i];
      const spot = DD.Grid.neighbors(b.x, b.y).filter(function (n) { return DD.Grid.isFree(n.x, n.y); })[0];
      put(h, spot.x, spot.y);
      h.ap = 3;
      const ix = DD.Combat.interactions(h).filter(function (o) { return o.x === b.x && o.y === b.y; })[0];
      t.ok(ix && /Cite the Rules/.test(ix.label) && ix.ap === 1, 'Cite the Rules (1 AP)');
      return DD.Combat.interact(h, b.x, b.y);
    }
    t.ok(cite(0, hs[1]), 'cite 1');
    t.ok(books[0].obj.data.used && bdef.autoplay(null, books[0].obj) === 0, 'a cited book is spent');
    t.eq(d.books, 1, '1/3');
    t.ok(/\(1\/3\)/.test(DD.Combat.state.objective.flavor), 'subtitle counts: ' + DD.Combat.state.objective.flavor);
    t.ok(cite(1, hs[2]), 'cite 2');
    t.ok(intents('dm_tpk').length === 1, 'two citations are not enough');
    const hp = dm.hp;
    t.ok(cite(2, hs[3]), 'cite 3');
    t.ok(d.doom.solved && !d.doom.active, 'RULES-LAWYERED: the doom is cancelled for good');
    t.eq(intents('dm_tpk').length, 0, 'its telegraph is gone');
    t.eq(hp - dm.hp, 55, 'the rocks fall on him: 55');
    t.ok(has(dm, 'stun') && has(dm, 'dm_exposed'), 'Stunned and Exposed for the rest of the fight');
    t.ok(books.every(function (b) { return bdef.autoplay(null, b.obj) === 0; }), 'no more book value');
    t.eq(d.stats.lawyered, DD.Combat.state.round, 'stats');
    endTurn(); endTurn();
    t.eq(intents('dm_tpk').length, 0, 'he never re-declares it');
    t.ok(has(dm, 'dm_exposed'), 'still Exposed');
  });

  T.suite('boss_dm: the doom fires after 3 rounds, stuns delay it, the stun guard limits stun-locks', function (t) {
    let dm = exposedFight('doom' + t.seed);
    buffHeroes(400);
    toPhase3(dm);
    const at = dm.data.doom.at;
    t.eq(at, 1 + 3, 'mid-turn flip: 3 full rounds');
    while (DD.Combat.state.round < at && !DD.Combat.state.result) endTurn();
    t.eq(dm.data.stats.doomFired, 0, 'not yet at the start of round ' + at);
    t.ok(intents('dm_tpk').length === 1 && intents('dm_tpk')[0].delay === 0, 'due this round');
    noRule();   // no Armor Class Is Back shaving 2 off it
    noGuard();
    const lost = hitsDuring(endTurn);
    t.eq(dm.data.stats.doomFired, 1, 'ROCKS FALL, EVERYONE DIES');
    t.ok(heroes().every(function (h) { return lost(h) >= 60 - (h.armor || 0); }), 'every hero took the rocks (' + heroes().map(lost).join(', ') + ')');
    t.eq(dm.data.doom.at, at + 3, 'he restarts the countdown');
    // a stun pushes it back one round
    dm = exposedFight('doomstun' + t.seed);
    buffHeroes(400);
    toPhase3(dm);
    endTurn();
    const k = hero('test_knight');
    const at2 = dm.data.doom.at;
    dm.data.stunGuard = -1;   // the screen collapse stunned him in round 1, which arms the guard for round 2
    t.ok(intents('dm_tpk').length === 1, 'doom telegraphed');
    act(function () { DD.Act.addStatus(dm, 'stun', { turns: 1 }, k); });
    t.ok(has(dm, 'stun') && intents('dm_tpk').length === 0, 'stunned: the countdown telegraph is cancelled');
    t.eq(dm.data.doom.at, at2 + 1, 'he lost his place: +1 round');
    t.ok(logHas(/loses his place in his notes/), 'logged');
    act(function () { DD.Act.addStatus(dm, 'sleep', { turns: 1 }, k); });
    t.ok(!has(dm, 'sleep'), 'stun guard: no second stun-like this round');
    endTurn();
    t.ok(!has(dm, 'stun') && intents('dm_tpk').length === 1 && intents('dm_tpk')[0].delay === 2, 're-declared with the countdown pushed back');
    act(function () { DD.Act.addStatus(dm, 'stun', { turns: 1 }, k); });
    t.ok(!has(dm, 'stun'), 'stun guard: not the very next round either');
    endTurn();
    act(function () { DD.Act.addStatus(dm, 'stun', { turns: 1 }, k); });
    t.ok(has(dm, 'stun'), 'two rounds later he can be stunned again');
    t.ok(!has(dm, 'sheep') && !DD.Act.addStatus(dm, 'sheep', { turns: 1 }, k), 'bosses never turn into sheep');
  });

  // ---- cameos ----------------------------------------------------------------------------------------------------
  T.suite('boss_dm: random encounters (runtime pool, caps, unpainted minis)', function (t) {
    startFight('cameo' + t.seed);
    const dm = dmUnit(), d = dm.data;
    const pool = B().cameoPool();
    const real = pool[1].length + pool[2].length + pool[3].length;
    t.eq(cameos().length, 2, 'round 1: 2 cameos');
    cameos().forEach(function (u) {
      const def = DD.getEnemy(u.defId);
      if (real) t.ok(!/^dm_/.test(u.defId) && def.tier !== 'boss' && def.tier !== 'elite', u.name + ' is a real act enemy (pool of ' + real + ')');
      else t.ok(/^dm_cameo_/.test(u.defId), u.name + ' is a fallback mini (no act enemies registered)');
    });
    t.ok(Object.keys(pool).every(function (a) { return pool[a].every(function (id) { return !/^(test_|dm_|wm_|grim_|rat_|lich_|iris_)/.test(id) && DD.getEnemy(id).tier !== 'boss' && DD.getEnemy(id).tier !== 'elite'; }); }), 'pool excludes tests, boss adds, bosses and elites');
    // caps
    act(function () { B().randomEncounter(dm); });
    t.eq(cameos().length, 3, 'at most 3 alive');
    act(function () { B().randomEncounter(dm); });
    t.eq(cameos().length, 3, 'still 3');
    clearCameos();
    act(function () { B().randomEncounter(dm); });
    t.eq(d.cameos, 5, '2 per encounter');
    clearCameos();
    act(function () { B().randomEncounter(dm); });
    t.eq(d.cameos, 6, 'capped at 6 per fight');
    clearCameos();
    t.eq(act(function () { return B().randomEncounter(dm); }), 0, 'no more after 6');
    // the runtime pool: a stand-in act-1 enemy becomes an unpainted cameo with act-1 HP scaling
    const saved = DD.defs.enemies;
    const stub = {};
    Object.keys(saved).forEach(function (id) { if (/^(dm_|dungeon_master$|test_)/.test(id)) stub[id] = saved[id]; });
    stub.a1_dmtest_cameo = { id: 'a1_dmtest_cameo', name: 'Test Cameo Goblin', act: 1, tier: 'normal', hp: 14, mov: 3, armor: 0, tags: [], flags: {}, resist: {},
      skills: ['test_grunt_stab'], ai: 'default', xp: 1, gold: [1, 1], hooks: {}, barks: {}, desc: 'stand-in', boss: null,
      sprite: { base: 'humanoid', palette: { skin: '#6fa04a', cloth: '#7a4a2a' } } };
    try {
      DD.defs.enemies = stub;
      startFight('cameo2' + t.seed);
      const c = cameos();
      t.ok(c.length === 2 && c.every(function (u) { return u.defId === 'a1_dmtest_cameo'; }), 'picked from the registry at runtime');
      t.ok(c.every(function (u) { return u.maxHp === 16; }), 'minis come out at mini toughness (14 → 16 HP)');
      t.ok(c.every(function (u) { return u.sprite && u.sprite.palette.skin !== '#6fa04a' && /^#([0-9a-f]{2})\1/.test(u.sprite.palette.skin); }), 'drawn as unpainted grey minis');
      t.ok(c.every(function (u) { return u.data.cameoAct === 1; }), 'remember their act');
    } finally { DD.defs.enemies = saved; }
    // charmed DMs don't summon
    startFight('cameo3' + t.seed);
    clearCameos();
    const dm3 = dmUnit();
    act(function () { DD.Act.addStatus(dm3, 'charmed', { turns: 1 }, heroes()[0]); });
    t.eq(act(function () { return B().randomEncounter(dm3); }), 0, 'a charmed DM summons nobody');
  });

  // ---- robustness ------------------------------------------------------------------------------------------------
  T.suite('boss_dm: robustness (bare sandbox, charm, previews, deployment, death)', function (t) {
    bare('bare' + t.seed);
    let dm = dmUnit();
    t.ok(!dm.flags.invulnerable && !has(dm, 'invulnerable'), 'no screen in a bare sandbox: vulnerable from the start');
    t.ok(DD.Act.damage(heroes()[0], dm, 5, { cause: 'skill' }) > 0, 'takes damage');
    for (let i = 0; i < 3; i++) endTurn();
    t.ok(DD.Combat.state.round === 4 && !DD.Combat.state.result, 'three rounds without a hitch');
    t.ok(dm.intents.length > 0, 'still planning');
    dm.hp = B().threshold(dm, 2) - 1; dm.data.lastShift = -1;
    act(function () { B().syncPhase(dm); });
    endTurn();
    const tr = intents('dm_railroad')[0];
    t.ok(tr && tr.tiles.length === 11 && tr.tiles.every(function (p) { return p.y === tr.tiles[0].y; }) && tr.tiles[0].y !== dm.y, 'fallback lanes: full rows near him');
    dm.hp = B().threshold(dm, 3) - 1;
    act(function () { B().syncPhase(dm); });
    const books = objs('dm_handbook');
    t.eq(books.length, 3, 'fallback handbook spots near the party');
    t.ok(books.every(function (b) { return DD.Grid.neighbors(b.x, b.y).some(function (n) { return DD.Grid.isWalkable(n.x, n.y); }); }), 'reachable');
    // charmed: he turns on his own minis
    startFight('charm' + t.seed);
    dm = dmUnit();
    const mini = cameos()[0];
    act(function () { breakScreen(heroes()[0]); });
    DD.Act.removeStatus(dm, 'stun', { silent: true });
    act(function () { DD.Act.addStatus(dm, 'charmed', { turns: 2 }, heroes()[0]); });
    put(mini, dm.x, dm.y + 3);
    DD.AI.plan(dm);
    const aims = [];
    dm.intents.forEach(function (i) {
      if (i.unitId) aims.push(DD.Combat.byId(i.unitId));
      ((i.data && i.data.centers) || []).forEach(function (p) { aims.push(DD.Grid.unitAt(p.x, p.y)); });
    });
    t.ok(aims.length > 0 && aims.every(function (u) { return u && u.side === 'enemy'; }), 'charmed: he turns his rolls and rocks on his own minis (' + aims.map(function (u) { return u ? u.name : '?'; }).join(', ') + ')');
    t.ok(mini && !mini.dead, 'mini still alive before execution');
    // previews == reality on the DM (Exposed, then across the phase threshold)
    dm = exposedFight('preview' + t.seed);
    const k = hero('test_knight');
    put(k, dm.x, dm.y + 1);
    const slot = k.basic;
    let p = DD.Combat.preview(k, slot, dm.x, dm.y);
    let hp = dm.hp;
    t.ok(DD.Combat.useSkill(k, slot, dm.x, dm.y), 'knight hits the DM');
    t.eq(p.perUnit[dm.id].dmg, hp - dm.hp, 'preview = reality (Exposed)');
    dm.hp = B().threshold(dm, 2) + 5;
    p = DD.Combat.preview(k, slot, dm.x, dm.y);
    hp = dm.hp;
    t.eq(dm.data.phase, 1, 'preview did not change the phase');
    t.ok(DD.Combat.useSkill(k, slot, dm.x, dm.y), 'hit across the threshold');
    t.eq(p.perUnit[dm.id].dmg, hp - dm.hp, 'preview = reality across the phase flip');
    t.eq(dm.data.phase, 2, 'phase 2');
    // deployment re-planning is deterministic (no double cameos, same rule)
    startFight('deploy' + t.seed);
    dm = dmUnit();
    const before = { cameos: cameos().length, spawned: dm.data.cameos, rule: DD.Combat.state.rules.map(function (r) { return r.key; }).join(), intents: dm.intents.length };
    const h = heroes()[0];
    const dest = DD.Combat.state.deploy.tiles.filter(function (q) { return DD.Grid.isFree(q.x, q.y); })[0];
    t.ok(DD.Combat.deployMove(h, dest.x, dest.y), 'deploy move');
    t.eq(JSON.stringify({ cameos: cameos().length, spawned: dm.data.cameos, rule: DD.Combat.state.rules.map(function (r) { return r.key; }).join(), intents: dm.intents.length }), JSON.stringify(before), 'replanning repeats the same round');
    // death: the defeat line, minis flee, victory
    dm = exposedFight('death' + t.seed);
    act(function () { B().randomEncounter(dm); });
    toPhase3(dm);
    dm.hp = 5;
    act(function () { DD.Act.damage(hero('test_knight'), dm, 50, { cause: 'skill' }); });
    t.eq(DD.Combat.state.result, 'victory', 'victory');
    t.ok(logHas(/Fine\. FINE\. You win\. Same time next week\?/), 'the defeat line');
    t.ok(!DD.Combat.state.rules.some(function (r) { return r.id === 'dm_house_rule'; }), 'house rules end with him');
    t.ok(cameos().length === 0, 'his minis flee');
    // a table with room for a single handbook: citing the books that fit is enough
    DD.Combat.sandbox({ w: 4, h: 1, seed: 'onebook' + t.seed, noPlan: true, kind: 'boss',
      heroes: [{ id: 'test_knight', x: 3, y: 0, level: 10 }], enemies: [{ id: DM, x: 0, y: 0 }] });
    dm = dmUnit();
    dm.hp = B().threshold(dm, 3) - 1;
    act(function () { B().syncPhase(dm); });
    const one = objs('dm_handbook');
    t.ok(dm.data.phase === 3 && one.length >= 1 && one.length < 3, 'phase 3 on a cramped table: ' + one.length + ' book(s)');
    t.eq(dm.data.booksNeeded, one.length, 'the countdown asks for the books that are on the table');
    t.ok(new RegExp('\\(0/' + one.length + '\\)').test(DD.Combat.state.objective.flavor), 'and the subtitle says so: ' + DD.Combat.state.objective.flavor);
    const kn = hero('test_knight');
    kn.ap = 3;
    put(kn, one[0].x + 1, 0);
    one.forEach(function (b) { DD.Combat.interact(kn, b.x, b.y); });
    t.ok(dm.data.doom.solved, 'rules-lawyered with ' + one.length);
  });

  // ---- autoplay -----------------------------------------------------------------------------------------------------
  T.suite('boss_dm: AutoPlay sims (fixture party, level 10): puzzles engaged, moderate win rate, no timeouts', function (t) {
    const n = +(t.param('n', 12));
    const watch = T.contentHelpers && T.contentHelpers.watchTelegraphs;
    let wins = 0, rounds = 0, screens = 0, p2 = 0, switched = 0, p3 = 0, cited = 0, timeouts = 0;
    const timeline = [];
    const run = function (w) {
      for (let i = 0; i < n; i++) {
        startFight('auto' + t.seed + ':' + i, 10);
        if (w) w.arm();
        const dm = dmUnit();
        const res = DD.AutoPlay.runBattle(30);
        const st = dm.data.stats;
        if (res.timeout) timeouts++;
        if (res.result === 'victory') wins++;
        rounds += res.rounds;
        if (st.screen) screens++;
        if (st.phase2) { p2++; if (st.switches) switched++; }
        if (st.phase3) { p3++; if (st.books) cited++; }
        timeline.push((st.screen || '-') + '/' + (st.phase2 || '-') + '/' + (st.phase3 || '-') + '/' + res.rounds + (res.result === 'victory' ? 'W' : 'L'));
        if (T.contentHelpers && T.contentHelpers.sanity) T.contentHelpers.sanity(t, 'sim ' + i);
      }
    };
    const w = watch ? watch(run) : (run(null), null);
    if (w) {
      t.eq(w.violations.length, 0, 'telegraphs honest over ' + w.intents + ' intents' + (w.violations[0] ? ': ' + w.violations[0] : ''));
    }
    const rate = wins / n;
    t.log('WIN RATE ' + wins + '/' + n + ' (' + Math.round(rate * 100) + '%), avg rounds ' + (rounds / n).toFixed(1) + ', timeouts ' + timeouts);
    t.log('screen/phase2/phase3/end per fight: ' + timeline.join('  '));
    t.log('puzzles: screen broken ' + screens + '/' + n + ', switch used ' + switched + '/' + p2 + ', books cited ' + cited + '/' + p3);
    t.eq(timeouts, 0, 'no timeouts');
    t.eq(screens, n, 'AutoPlay breaks the DM Screen every time');
    t.ok(p2 > 0 && switched >= Math.ceil(p2 * 0.6), 'AutoPlay pulls the Track Switch (' + switched + '/' + p2 + ')');
    t.ok(p3 > 0 && cited >= Math.ceil(p3 * 0.6), 'AutoPlay cites the handbooks (' + cited + '/' + p3 + ')');
    t.ok(rate >= 0.2 && rate <= 0.85, 'moderate win rate (aim 30-70%): ' + Math.round(rate * 100) + '%');
    t.ok(rounds / n >= 6 && rounds / n <= 16, 'fight length ' + (rounds / n).toFixed(1) + ' rounds');
  });

  T.suite('boss_dm: AutoPlay sims with the real heroes (random parties, level 10): the final boss is a fight, not a wall', function (t) {
    const pool = Object.keys(DD.defs.heroes).filter(function (k) { return !/^test_/.test(k); });
    if (pool.length < 4) { t.skip('needs 4 real heroes (isolated run)'); return; }
    const n = +(t.param('n', 16));
    const rng = DD.RNG('dm-real:' + t.seed);
    const watch = T.contentHelpers && T.contentHelpers.watchTelegraphs;
    let wins = 0, rounds = 0, timeouts = 0, screens = 0, p2 = 0, switched = 0, p3 = 0, engaged = 0, dooms = 0, downs = 0;
    const lines = [];
    const run = function (w) {
      for (let i = 0; i < n; i++) {
        const ids = rng.sample(pool, 4);
        const setup = DD.Encounter.build('boss_dm', ids.map(function (id) {
          const h = DD.getHero(id);
          const extra = h.skillPool.filter(function (s) { return h.startingSkills.indexOf(s) < 0; }).slice(0, 2);
          return DD.Combat.makeRunHero({ id: id, level: 10, skills: h.startingSkills.concat(extra).map(function (s) { return { id: s, level: Math.min(3, DD.getSkill(s).levels.length) }; }) });
        }), { rng: DD.RNG('dm-real:' + t.seed + ':' + i), difficulty: 'normal', act: 3 });
        DD.Combat.start(setup, { seed: 'dm-real' + t.seed + ':' + i, headless: true, difficulty: 'normal', kind: 'boss' });
        if (w) w.arm();
        const dm = dmUnit();
        const res = DD.AutoPlay.runBattle(30);
        const st = dm.data.stats;
        if (res.timeout) timeouts++;
        if (res.result === 'victory') wins++;
        rounds += res.rounds;
        downs += DD.Combat.state.stats.downs || 0;
        if (st.screen) screens++;
        if (st.phase2) { p2++; if (st.switches) switched++; }
        // a phase 3 that lasted into a second round: the party cited books, or the doom fell on them
        if (st.phase3 && res.rounds > st.phase3) { p3++; if (st.books || st.doomFired) engaged++; }
        if (st.doomFired) dooms++;
        lines.push(ids.join('+') + ' ' + (res.result === 'victory' ? 'W' : 'L') + res.rounds + ' (screen ' + (st.screen || '-') + ', p2 ' + (st.phase2 || '-') + ', p3 ' + (st.phase3 || '-') +
          ', switches ' + st.switches + '/' + st.diverted + ', books ' + st.books + (st.lawyered ? ' LAWYERED' : '') + (st.doomFired ? ', doom x' + st.doomFired : '') + ')');
        if (T.contentHelpers && T.contentHelpers.sanity) T.contentHelpers.sanity(t, 'real sim ' + i);
      }
    };
    const w = watch ? watch(run) : (run(null), null);
    if (w) t.eq(w.violations.length, 0, 'telegraphs honest over ' + w.intents + ' intents' + (w.violations[0] ? ': ' + w.violations[0] : ''));
    const rate = wins / n;
    t.log('WIN RATE ' + wins + '/' + n + ' (' + Math.round(rate * 100) + '%), avg rounds ' + (rounds / n).toFixed(1) + ', downs/fight ' + (downs / n).toFixed(1) + ', doom fired in ' + dooms + ', timeouts ' + timeouts);
    lines.forEach(function (l) { t.log(l); });
    t.eq(timeouts, 0, 'no timeouts');
    t.eq(screens, n, 'the screen always comes down');
    t.ok(p2 > 0 && switched >= Math.ceil(p2 * 0.6), 'the party pulls the Track Switch (' + switched + '/' + p2 + ')');
    t.ok(p3 === 0 || engaged >= Math.ceil(p3 * 0.5), 'phase 3 is about the handbooks and the doom (' + engaged + '/' + p3 + ')');
    t.ok(rate >= 0.35, 'not a wall: ' + Math.round(rate * 100) + '% wins');
    t.ok(rounds / n >= 6 && rounds / n <= 13, 'fight length ' + (rounds / n).toFixed(1) + ' rounds');
  });

  // ---- diagnostics (skipped unless asked for) ------------------------------------------------------------------------
  T.suite('boss_dm: battle log (diagnostic)', function (t) {
    if (t.param('dump', '0') !== '1') { t.skip('dump=1 to print a full fight log'); return; }
    startFight(t.param('fseed', 'dump' + t.param('dseed', '1')), +t.param('level', 10));
    const dm = dmUnit();
    const from = +t.param('from', 0);
    const off = DD.Events.on('turn:player', function () {
      if (DD.Combat.state.round >= from) t.log('--- round ' + DD.Combat.state.round + ' · DM ' + dm.hp + ' · intents: ' + dm.intents.map(function (i) { return i.label + (i.delay ? '⏳' + i.delay : ''); }).join(', '));
    });
    const off2 = DD.Events.on('combat:log', function (e) {
      if (e.cls !== 'narrator' && DD.Combat.state.round >= from && !/Rule ended|is Slowed|is Bleeding|charging|is Wet/.test(e.text)) t.log('   ' + e.text);
    });
    try { DD.AutoPlay.runBattle(+t.param('rounds', 8)); } finally { off(); off2(); }
    t.ok(true, 'dumped');
  });
})();
