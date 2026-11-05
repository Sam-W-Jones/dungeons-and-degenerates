/* Dungeons and Degenerates — tests/content/boss_dm.js
 * Suites "boss_dm: …" for js/data/bosses/dm.js (The Dungeon Master, encounter boss_dm), v2 (initiative, wind-ups):
 * registry + arena, his turn (one action now + one wind-up), wind-ups landing / dodged / interrupted, the screen puzzle,
 * house rules (and the wind-up numbers that show them), every attack's damage vs its desc, phases + plot armor, track
 * switches (the AutoPlay hint reads v2 wind-ups; a diverted train is unstoppable), handbooks + the doom countdown,
 * cameo caps, robustness (bare sandbox, charm, previews, death) and AutoPlay sims at the v2 level band (fixture party,
 * and in full runs random parties of real heroes).
 */
(function () {
  'use strict';
  const T = window.DD_TEST;
  const DD = window.DD;
  const PARTY = ['test_knight', 'test_cleric', 'test_mage', 'test_rogue'];
  const DM = 'dungeon_master';
  const LV = 5;   // DESIGN §5 (v2): a party is about level 5 when it reaches the DM

  // ---- helpers --------------------------------------------------------------------------------------------------
  function B() { return DD.BossDM; }
  /** Run heroes at a v2 level: the 2 starting skills plus one boon per level gained (learn up to 2 more, then upgrades). */
  function partyAt(level, ids) {
    return (ids || PARTY).map(function (id) {
      const h = DD.getHero(id);
      const boons = Math.max(0, level - 1);
      const learn = Math.min(2, boons);
      const list = h.startingSkills.concat(h.skillPool.filter(function (s) { return h.startingSkills.indexOf(s) < 0; }).slice(0, learn));
      const skills = list.map(function (s) { return { id: s, level: 1 }; });
      for (let k = 0, up = boons - learn; up > 0 && k < 12; k++) {
        const sk = skills[k % skills.length];
        if (sk.level < Math.min(3, DD.getSkill(sk.id).levels.length)) { sk.level++; up--; }
      }
      return DD.Combat.makeRunHero({ id: id, level: level, skills: skills });
    });
  }
  /**
   * The real encounter (arena, objects, marks). Default: a scripted fight on that setup (sandbox flag: no deployment,
   * fixed order heroes first then the DM, giveTurnTo allowed). opts.real: the real path (deployment, rolled initiative).
   */
  function startFight(seed, opts) {
    opts = opts || {};
    const diff = opts.diff || 'normal';
    const setup = DD.Encounter.build('boss_dm', partyAt(opts.level || LV, opts.ids), { rng: DD.RNG('dm:' + seed), difficulty: diff, act: 3 });
    if (opts.real) return DD.Combat.start(setup, { seed: seed, headless: true, difficulty: diff, kind: 'boss' });
    return DD.Combat.start(setup, { seed: seed, headless: true, difficulty: diff, kind: 'boss', sandbox: true, initiative: opts.initiative || 'heroesFirst', order: opts.order });
  }
  function S() { return DD.Combat.state; }
  function dmUnit() { return S().units.filter(function (u) { return u.defId === DM; })[0]; }
  function heroes() { return S().units.filter(function (u) { return u.kind === 'hero' && !u.dead; }); }
  function hero(id) { return S().units.filter(function (u) { return u.defId === id; })[0]; }
  function has(u, id) { return DD.Act.hasStatus(u, id); }
  function objs(id) { return DD.Grid.allTiles().filter(function (t) { return t.obj && t.obj.id === id; }); }
  function tagged(tag) { return DD.Grid.allTiles().filter(function (t) { return t.tag === tag; }).map(function (t) { return { x: t.x, y: t.y }; }); }
  function act(fn) { return DD.Combat._action(fn); }
  function windups(id) { return dmUnit().intents.filter(function (i) { return !id || i.skillId === id; }); }
  function cameos() { return S().units.filter(function (u) { return u.data && u.data.dmCameo && !u.dead; }); }
  function clearCameos() { act(function () { cameos().forEach(function (u) { DD.Act.kill(u, null); }); }); }
  /** No more Random Encounters this fight (the per-fight cap is reached). */
  function noCameos() { clearCameos(); dmUnit().data.cameos = B().N.cameoTotal; }
  /** Put a unit on a tile (no tile effects, no attacks of opportunity). */
  function put(u, x, y) { return u.x === x && u.y === y ? true : DD.Act.teleport(u, x, y, { noEnter: true, fx: false }); }
  function breakScreen(src) { objs('dm_screen_panel').forEach(function (t) { DD.Act.damageObject(src || null, t.x, t.y, 99); }); }
  /** No house rule in play, and whatever this round's rule already handed out (Inspired, Cheeto Slow, AP) is gone too. */
  function noRule() {
    DD.Act.removeRule('dm_house_rule');
    heroes().forEach(function (h) { ['inspired', 'slow'].forEach(function (id) { DD.Act.removeStatus(h, id, { silent: true }); }); });
  }
  function rule(roll) { return act(function () { return B().rollHouseRule(dmUnit(), roll); }); }
  function ruleKey() { const r = S().rules.filter(function (x) { return x.id === 'dm_house_rule'; })[0]; return r ? r.key : null; }
  function mentions(text, n) { return new RegExp('(^|[^0-9])' + n + '(?![0-9])').test(text); }
  function logHas(re) { return S().log.some(function (l) { return re.test(l.text); }); }
  function buffHeroes(n) { heroes().forEach(function (h) { h.maxHp = h.hp = n; }); }
  /** Phase 1 with the screen down, no stun, no cameos, no house rule: a clean, Exposed DM, at the first hero's turn. */
  function exposedFight(seed, opts) {
    startFight(seed, opts);
    noCameos();
    act(function () { breakScreen(heroes()[0]); });
    const dm = dmUnit();
    DD.Act.removeStatus(dm, 'stun', { silent: true });
    dm.data.guard = null;
    noRule();
    return dm;
  }
  /** Move to phase 2 (mid-turn flip). */
  function toPhase2(dm) { dm.hp = Math.ceil(dm.maxHp * 2 / 3) + 1; act(function () { DD.Act.damage(null, dm, 2, { cause: 'other' }); }); }
  /** Move to phase 3 (mid-turn flip from phase 2). */
  function toPhase3(dm) {
    if (dm.data.phase < 2) toPhase2(dm);
    dm.data.lastShift = -1;
    dm.hp = Math.ceil(dm.maxHp / 3) + 1;
    act(function () { DD.Act.damage(null, dm, 2, { cause: 'other' }); });
  }
  /** HP lost per unit to hits while fn runs (optionally only hits whose tags include `tag`). */
  function hitsDuring(fn, tag) {
    const got = {};
    DD.Act.addRule({ id: 'test_dm_hits', name: 'Test hit counter', hooks: { onTakeDamage: function (d) {
      if (tag && (d.tags || []).indexOf(tag) < 0) return;
      got[d.target.id] = (got[d.target.id] || 0) + d.dealt;
    } } });
    try { fn(); } finally { DD.Act.removeRule('test_dm_hits'); }
    return function (u) { return got[u.id] || 0; };
  }
  /** What the DM did during fn: his skills used now (actions) and the wind-ups he announced / that landed. */
  function watchDM(fn) {
    const dm = dmUnit();
    const out = { actions: [], windups: [], landed: [], cancels: 0 };
    DD.Act.addRule({ id: 'test_dm_watch', name: 'Test DM watch', hooks: { onSkillUsed: function (ctx) {
      if (ctx.user !== dm) return;
      const it = ctx.intent;
      if (it && it.windup) out.landed.push(it.skillId); else out.actions.push(ctx.skill ? ctx.skill.id : (it && it.skillId));
    } } });
    const off1 = DD.Events.on('windup:start', function (e) { if (e.unit === dm) out.windups.push(e.intent.skillId); });
    const off2 = DD.Events.on('windup:cancel', function (e) { if (e.unit === dm) out.cancels++; });
    try { fn(); } finally { DD.Act.removeRule('test_dm_watch'); off1(); off2(); }
    return out;
  }
  function trainDmg() { return DD.getSkill('dm_railroad').levels[0].dmg; }
  function freeSpot(pred) { return DD.Grid.allTiles().filter(function (t) { return DD.Grid.isFree(t.x, t.y) && !DD.Grid.isDrop(t.x, t.y) && (!pred || pred(t)); })[0]; }
  function onList(list, p) { return list.some(function (q) { return q.x === p.x && q.y === p.y; }); }
  /** Put u on a free tile next to a track switch (a stray mini may stand on the obvious one); returns the switch tile. */
  function besideSwitch(u) {
    const sws = objs('dm_track_switch').sort(function (a, b) { return a.x - b.x; });
    for (let i = 0; i < sws.length; i++) {
      const sw = sws[i];
      if (DD.Grid.dist(u, sw) === 1) return sw;
      const spot = DD.Grid.neighbors(sw.x, sw.y).filter(function (n) { return DD.Grid.isFree(n.x, n.y) && !DD.Grid.isDrop(n.x, n.y) && DD.Grid.tile(n.x, n.y).t !== 'dm_track'; })[0];
      if (spot && put(u, spot.x, spot.y)) return sw;
    }
    return sws[0];
  }

  // ---- registry & arena -------------------------------------------------------------------------------------------
  T.suite('boss_dm: registry, arena and encounter', function (t) {
    const ids = { enemies: [DM, 'dm_cameo_goblin', 'dm_cameo_skeleton', 'dm_cameo_imp'],
      skills: ['dm_fudged_roll', 'dm_secret_roll', 'dm_rocks_fall', 'dm_railroad', 'dm_plot_hook', 'dm_get_off', 'dm_tpk', 'dm_cameo_stab', 'dm_cameo_bone', 'dm_cameo_ember'],
      objects: ['dm_screen_panel', 'dm_track_switch', 'dm_handbook', 'dm_book_stack'], terrain: ['dm_track'], statuses: ['dm_exposed'], encounters: ['boss_dm'] };
    for (const kind in ids) ids[kind].forEach(function (id) { t.ok(!!DD.defs[kind][id], kind + ' ' + id + ' registered'); });
    const def = DD.getEnemy(DM);
    t.eq(def.tier, 'boss', 'boss tier');
    t.ok(def.hp >= 360 && def.hp <= 520, 'HP in the act-3 boss range: ' + def.hp);
    t.ok(def.boss && def.boss.title && def.boss.intro, 'boss title + intro');
    t.eq(typeof def.ai, 'function', 'custom planner');
    t.ok(def.flags.immovable && !def.flags.stunImmune, 'immovable, stunnable');
    t.ok(def.sprite.scale >= 1.8 && def.sprite.scale <= 2.4, 'big sprite (' + def.sprite.scale + ')');
    t.eq(def.init, 2, 'explicit initiative modifier (+2)');
    t.ok(!def.turnsPerRound || def.turnsPerRound === 1, 'one initiative entry: he takes one turn a round');
    t.eq(def.aiStyle, 'ranged', 'a ranged turret (AutoPlay and the HUD model his targeting as ranged)');
    t.ok(def.passive && typeof def.passive.desc === 'function' && /House Rule/.test(def.passive.desc(null)), 'inspect line: what he does on his turn');
    // v2: his slots are his immediate attacks; the big attacks are wind-ups, never slots (the threat shading must not
    // paint the whole table with a 60-damage doom)
    t.eq(def.skills.join(), 'dm_secret_roll,dm_fudged_roll,dm_plot_hook,dm_get_off', 'skills = his immediate attacks');
    ['dm_rocks_fall', 'dm_railroad', 'dm_tpk'].forEach(function (id) {
      t.ok(/^Wind-up/.test(DD.skillDesc(DD.getSkill(id), 1, null)), id + ': the desc says it is a wind-up');
    });
    ['dm_fudged_roll', 'dm_secret_roll', 'dm_plot_hook', 'dm_get_off', 'dm_cameo_stab', 'dm_cameo_bone', 'dm_cameo_ember'].forEach(function (id) {
      t.ok(!/Wind-up/.test(DD.skillDesc(DD.getSkill(id), 1, null)), id + ': acts at once');
    });
    ids.skills.forEach(function (id) {
      const s = DD.getSkill(id), L = s.levels[0], d = DD.skillDesc(s, 1, null);
      ['dmg', 'push', 'pull'].forEach(function (k) { if (typeof L[k] === 'number') t.ok(mentions(d, L[k]), id + ' desc shows ' + k + ' ' + L[k]); });
      t.ok(!/telegraph|tracked|after a .*delay|next round/i.test(d), id + ': no v1 telegraph wording: ' + d);
    });
    t.ok(/runs him over too/.test(DD.skillDesc(DD.getSkill('dm_railroad'), 1, null)), 'the train says what a diverted one does to him (the same hit as everyone on his row)');
    ['spawn', 'attack', 'hurt', 'death', 'phase2', 'phase3', 'screen', 'rule', 'cameo', 'diverted', 'lawyered', 'stunned'].forEach(function (k) {
      t.ok(Array.isArray(def.barks[k]) && def.barks[k].length >= 2, 'barks.' + k);
    });
    Object.keys(DD.defs.enemies).filter(function (k) { return k === DM || k.indexOf('dm_') === 0; }).forEach(function (k) {
      const e = DD.getEnemy(k);
      for (const key in e.barks) e.barks[key].forEach(function (b) { t.ok(b.length <= 70, k + ' bark ≤ 70 chars: ' + b); });
      t.ok(typeof e.init === 'number', k + ': explicit init');
    });
    t.eq(DD.getEnemy('dm_cameo_imp').ai.style, 'skirmisher', 'the flying imp mini dives the wounded (a diver style)');
    t.ok(def.barks.death.every(function (b) { return b.indexOf('Fine. FINE. You win. Same time next week?') === 0; }), 'the defeat line');
    ['dm_start', 'dm_phase2', 'dm_phase3', 'dm_screen', 'dm_rule', 'dm_cameo', 'dm_switch', 'dm_objection', 'dm_defeat'].forEach(function (k) {
      t.ok((DD.defs.narration[k] || []).length >= 2, 'narration ' + k);
    });
    t.ok((DD.defs.narration.boss_start || []).length >= 1, 'a (generic) boss_start line');
    t.ok(DD.defs.narration.dm_start.every(function (l) { return /screen/.test(l); }), 'the opening hint points at the screen');
    // the arena, the real way in: deployment first, then "Roll for initiative!"
    startFight('arena' + t.seed, { real: true });
    const s = S(), dm = dmUnit();
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
    t.ok(s.log.some(function (l) { return l.cls === 'narrator' && DD.defs.narration.dm_start.indexOf(l.text) >= 0; }), 'the DM\'s opening hint is narrated');
    t.ok(heroes().length === 4 && heroes().every(function (h) { return h.y >= 9; }), 'heroes deploy at the bottom');
    const reach = DD.Grid.reachable(heroes()[0], 99, { ignoreUnits: true });
    t.ok(!reach.has((dm.x - 1) + ',' + dm.y) && !reach.has((dm.x + 1) + ',' + dm.y), 'the alcove is sealed by the screen and the stacks');
    t.ok(DD.Grid.los(dm, { x: dm.x, y: dm.y + 5 }) && DD.Grid.los(dm, { x: dm.x - 3, y: dm.y + 2 }), 'screen panels and stacks do not block his sight');
    t.ok(objs('dm_screen_panel').every(function (p) { return /DM Screen \((Left|Center|Right) Panel\)/.test(p.obj.label); }), 'panels are labelled');
    t.ok(objs('dm_screen_panel').every(function (p) { return p.obj.data !== objs('dm_screen_panel')[0].obj.data || p === objs('dm_screen_panel')[0]; }), 'panel data is not shared');
    t.ok(s.phase === 'deploy' && s.round === 0 && !ruleKey(), 'deployment: no house rule before the roll');
    const h0 = heroes()[0];
    const dest = s.deploy.tiles.filter(function (q) { return DD.Grid.isFree(q.x, q.y); })[0];
    t.ok(DD.Combat.deployMove(h0, dest.x, dest.y), 'a deployment move');
    t.ok(!ruleKey() && cameos().length === 0 && dm.intents.length === 0, 'deployment moves set nothing off');
    t.ok(DD.Combat.rollInitiative(), 'roll for initiative');
    t.ok(s.round >= 1 && !!ruleKey(), 'a house rule is in play from round 1 (' + ruleKey() + ')');
    t.eq(s.order.filter(function (e) { return e.unitId === dm.id; }).length, 1, 'one initiative entry');
    t.eq(DD.Combat.slotsOf(dm).map(function (sl) { return sl.id; }).join(), 'dm_secret_roll', 'behind the screen his only slot is the secret roll');
    t.eq(DD.AI.reachOf(dm).best, DD.getSkill('dm_secret_roll').levels[0].dmg, 'his reach (threat shading) is the roll he really has: ' + DD.getSkill('dm_secret_roll').levels[0].dmg);
  });

  // ---- his turn ---------------------------------------------------------------------------------------------------
  T.suite('boss_dm: his turn — the last wind-up lands, one action now, one new wind-up', function (t) {
    startFight('turn' + t.seed);
    buffHeroes(400);
    const dm = dmUnit(), d = dm.data;
    t.ok(DD.Combat.current() === heroes()[0], 'heroes first: the knight\'s turn, round 1');
    // phase 1, his turn 1: Random Encounter + Rocks Fall (no roll)
    let w = watchDM(function () { DD.Combat.endRound(); });
    t.eq(cameos().length, 2, 'turn 1: Random Encounter (2 cameos)');
    t.eq(w.actions.length, 0, 'turn 1: the encounter is his action (no roll)');
    t.eq(w.windups.join(), 'dm_rocks_fall', 'turn 1: he winds up Rocks Fall');
    const rocks = windups('dm_rocks_fall')[0];
    t.ok(rocks && rocks.windup && rocks.turnsLeft === 1 && rocks.anchor === 'ground', 'pending at the heroes\' turns: ⏳1, fixed tiles');
    t.ok(rocks && rocks.data.centers.length >= 1 && rocks.data.centers.every(function (p) { return onList(rocks.tiles, p); }) &&
      rocks.data.centers.every(function (p) { return heroes().some(function (h) { return h.x === p.x && h.y === p.y; }); }), 'crosses around heroes (' + (rocks ? rocks.tiles.length : 0) + ' tiles)');
    t.ok(cameos().every(function (c) { return S().order.some(function (e) { return e.unitId === c.id; }); }), 'the cameos rolled initiative and joined the order');
    // his turn 2: the rocks land, one roll (behind the screen), new rocks
    const hp = heroes().map(function (h) { return h.hp; });
    w = watchDM(function () { DD.Combat.endRound(); });
    t.eq(w.landed.join(), 'dm_rocks_fall', 'turn 2: last turn\'s Rocks Fall lands at the start of his turn');
    t.eq(w.actions.join(), 'dm_secret_roll', 'turn 2: one roll, behind the screen');
    t.eq(w.windups.join(), 'dm_rocks_fall', 'turn 2: and the next Rocks Fall');
    t.ok(heroes().some(function (h, i) { return h.hp < hp[i]; }), 'somebody got hurt');
    t.eq(windups().length, 1, 'never more than one regular wind-up pending');
    // turn 4: another encounter, capped at 3 minis alive
    DD.Combat.endRound();
    w = watchDM(function () { DD.Combat.endRound(); });
    t.ok(d.cameos > 2 && cameos().length <= 3, 'turn 4: another Random Encounter, never more than 3 minis (' + cameos().length + ')');
    // phase 2: one roll + a train down the busiest lane
    noCameos();
    act(function () { breakScreen(heroes()[0]); });
    DD.Act.removeStatus(dm, 'stun', { silent: true });
    dm.intents = [];
    d.guard = null;
    // everyone in plain sight in the middle of the table (no cover, nobody on a lane)
    heroes().forEach(function (h, i) { put(h, 4 + 2 * i, 7); });
    toPhase2(dm);
    t.eq(d.phase, 2, 'phase 2');
    t.eq(DD.Combat.slotsOf(dm).map(function (sl) { return sl.id; }).join(), 'dm_fudged_roll,dm_plot_hook,dm_get_off', 'phase 2 kit: roll, Plot Hook, Get Off My Table');
    w = watchDM(function () { DD.Combat.endRound(); });
    t.eq(w.actions.join(), 'dm_fudged_roll', 'phase 2, turn 1: one roll');
    t.eq(w.windups.join(), 'dm_railroad', '… and a train wind-up');
    const tr1 = windups('dm_railroad')[0];
    t.ok(tr1 && tr1.tiles.length === 14 && tr1.tiles.every(function (p) { return p.y === tr1.tiles[0].y; }), 'a whole lane');
    w = watchDM(function () { DD.Combat.endRound(); });
    t.eq(w.landed.join(), 'dm_railroad', 'the train lands at the start of his next turn');
    t.eq(w.actions.length, 1, 'phase 2, turn 2: one action (' + w.actions.join() + ')');
    t.ok(windups('dm_railroad').length === 1, 'and the next train');
    // phase 3: the doom from the moment the phase starts, then two rolls (two different heroes) + rocks or a train
    toPhase3(dm);
    t.eq(d.phase, 3, 'phase 3');
    const doom = windups('dm_tpk')[0];
    t.ok(doom && doom.turnsLeft === 3 && doom.data.unstoppable && doom.tiles.length === S().grid.tiles.length, 'ROCKS FALL, EVERYONE DIES over the whole table, ⏳3, unstoppable');
    t.ok(/two dice/.test(B().passiveText(dm)) && logHas(/rolls two dice a turn now/), 'he says he rolls two dice a turn now (inspect line + log)');
    heroes().forEach(function (h, i) { put(h, 4 + 2 * i, 7); });
    const victims = [];
    DD.Act.addRule({ id: 'test_dm_dice', name: 'dice', hooks: { onTakeDamage: function (dd) { if (dd.source === dm && (dd.tags || []).indexOf('dice') >= 0) victims.push(dd.target.id); } } });
    try { w = watchDM(function () { DD.Combat.endRound(); }); } finally { DD.Act.removeRule('test_dm_dice'); }
    t.eq(w.actions.join(), 'dm_fudged_roll,dm_fudged_roll', 'phase 3: two rolls a turn');
    t.ok(victims.length === 2 && victims[0] !== victims[1], 'at two different heroes (' + victims.join() + ')');
    t.ok(w.windups.length === 1 && /dm_rocks_fall|dm_railroad/.test(w.windups[0]), 'plus rocks or a train (' + w.windups.join() + ')');
    t.eq(windups('dm_tpk')[0].turnsLeft, 2, 'the countdown ticked (⏳2)');
  });

  T.suite('boss_dm: hiding from him (cover stops his rolls; rocks and the Plot Hook find you)', function (t) {
    const dm = exposedFight('hide' + t.seed);
    buffHeroes(400);
    heroes().forEach(function (h) { h.armor = 0; });
    const hook = DD.getSkill('dm_plot_hook').levels[0];
    t.ok(DD.getSkill('dm_plot_hook').target.los === false && DD.Combat.slotsOf(dm).some(function (sl) { return sl.id === 'dm_plot_hook'; }),
      'the Plot Hook needs no line of sight, and it is in his kit (threat shading and AutoPlay see it)');
    // everybody behind cover: no line of sight from his chair
    const hidden = DD.Grid.allTiles().filter(function (p) {
      return DD.Grid.isFree(p.x, p.y) && !DD.Grid.isDrop(p.x, p.y) && !DD.Grid.los(dm, p) && DD.Grid.dist(p, dm) <= 14 && DD.Grid.dist(p, dm) >= 4 && p.t !== 'dm_track';
    });
    const hs = heroes();
    if (!t.ok(hidden.length >= hs.length, 'enough cover on the table (' + hidden.length + ' hidden tiles)')) return;
    const spots = [];
    hidden.forEach(function (p) { if (spots.length < hs.length && spots.every(function (q) { return DD.Grid.dist(p, q) >= 3; })) spots.push(p); });
    hidden.forEach(function (p) { if (spots.length < hs.length && !onList(spots, p)) spots.push(p); });
    hs.forEach(function (h, i) { put(h, spots[i].x, spots[i].y); h.block = 0; });
    t.ok(hs.every(function (h) { return !DD.Grid.los(dm, h); }), 'nobody in his sight');
    t.ok(!DD.AI.bestAttack(dm, { skills: ['dm_fudged_roll'], noMove: true }), 'his roll has no target');
    const d0 = hs.map(function (h) { return DD.Grid.dist(h, dm); });
    let aimed = null;
    const off = DD.Events.on('windup:start', function (e) {
      if (e.unit !== dm || e.intent.skillId !== 'dm_rocks_fall') return;
      // who stands on each cross, and whether he can see them, the moment he winds it up
      aimed = e.intent.data.centers.map(function (c) { const u = DD.Grid.unitAt(c.x, c.y); return u ? (DD.Grid.los(dm, u) ? 'seen' : 'hidden') : 'empty'; });
    });
    let w, lost;
    try { lost = hitsDuring(function () { w = watchDM(function () { DD.Combat.endRound(); }); }, 'hook'); } finally { off(); }
    t.eq(w.actions.join(), 'dm_plot_hook', 'seeing nobody, he Plot Hooks somebody instead');
    const hooked = hs.filter(function (h) { return lost(h) > 0; });
    t.ok(hooked.length === 1 && lost(hooked[0]) === hook.dmg && DD.Grid.dist(hooked[0], dm) < d0[hs.indexOf(hooked[0])],
      'a hidden hero takes ' + hook.dmg + ' and is reeled in toward him (' + hs.map(function (h, i) { return h.name + ' lost ' + lost(h) + ' dist ' + d0[i] + '→' + DD.Grid.dist(h, dm); }).join('; ') + ')');
    t.ok(aimed && aimed.length >= 1 && aimed.every(function (k) { return k === 'hidden'; }), 'and his rocks go to the heroes still hiding (' + (aimed || []).join() + ')');
  });

  T.suite('boss_dm: wind-ups land on the marked tiles, can be dodged, and a stun interrupts them', function (t) {
    const dm = exposedFight('windup' + t.seed);
    buffHeroes(400);
    const k = hero('test_knight'), m = hero('test_mage'), c = hero('test_cleric');
    heroes().forEach(function (h, i) { put(h, 1 + 3 * i, 10); h.armor = 0; });
    put(m, 4, 7); put(c, 9, 7);
    // a Rocks Fall wind-up on both (announced on the knight's turn: it lands at the DM's turn this round)
    const tiles = DD.Grid.shape('cross', { x: 4, y: 7 }, null, 1).concat(DD.Grid.shape('cross', { x: 9, y: 7 }, null, 1));
    const it = act(function () { return DD.AI.windUp(dm, 'dm_rocks_fall', { x: 4, y: 7 }, { tiles: tiles, data: { centers: [{ x: 4, y: 7 }, { x: 9, y: 7 }] } }); });
    t.ok(it && it.windup && dm.intents.indexOf(it) >= 0, 'wound up');
    const listed = DD.AI.windups().filter(function (x) { return x.intent === it; })[0];
    t.ok(listed && listed.dmg === 26 && listed.tiles.length === tiles.filter(function (p) { return DD.Grid.inBounds(p.x, p.y); }).length, 'listed for the HUD with its number (26) and tiles');
    t.ok(/lands at the start of The Dungeon Master's next turn/.test(DD.AI.describe(dm, it).text) && /Stun, sleep, freeze/.test(DD.AI.describe(dm, it).text), 'inspect: when it lands, how to stop it');
    // the cleric steps out on her own turn, the mage stays
    DD.Combat.endTurn();
    t.ok(DD.Combat.current() === c, 'the cleric\'s turn');
    const out = [{ x: 9, y: 9 }, { x: 11, y: 7 }, { x: 7, y: 7 }].filter(function (p) { return DD.Grid.isFree(p.x, p.y) && !onList(tiles, p); })[0];
    t.ok(out && DD.Combat.move(c, out.x, out.y), 'the cleric walks off the red');
    const lost = hitsDuring(function () { DD.Combat.endRound(); }, 'rocks');
    t.eq(lost(m), 26, 'the mage stayed on the marked tiles: 26');
    t.eq(lost(c), 0, 'the cleric dodged');
    t.ok(DD.Grid.tile(4, 7).t === 'rubble' || DD.Grid.tile(4, 7).tag, 'rubble where it fell');
    // a stun on a hero's turn interrupts whatever he is winding up, and he loses his next turn
    let pending = windups().length;
    t.ok(pending >= 1, 'he wound up something new on his turn (' + windups().map(function (i) { return i.skillId; }).join() + ')');
    let cancels = 0;
    const off = DD.Events.on('windup:cancel', function (e) { if (e.unit === dm) cancels++; });
    act(function () { DD.Act.addStatus(dm, 'stun', { turns: 1 }, k); });
    off();
    t.ok(has(dm, 'stun') && windups().length === 0 && cancels === 1, 'stunned: his wind-up is interrupted at once (windup:cancel)');
    const w = watchDM(function () { DD.Combat.endRound(); });
    t.ok(w.actions.length === 0 && w.windups.length === 0 && w.landed.length === 0, 'and he loses his turn: no action, nothing new');
    t.ok(!has(dm, 'stun') && logHas(/loses the turn/), 'the stun ends with the lost turn');
    // sleep and frozen interrupt too (once the stun guard is down)
    DD.Combat.endRound();
    ['sleep', 'frozen'].forEach(function (id) {
      pending = windups().length;
      dm.data.guard = null;
      act(function () { DD.Act.addStatus(dm, id, { turns: 1 }, k); });
      t.ok(pending > 0 && windups().length === 0, id + ' interrupts his wind-up');
      DD.Act.removeStatus(dm, id, { silent: true });
      DD.Combat.endRound();
    });
  });

  // ---- phase 1 puzzle: the DM Screen ---------------------------------------------------------------------------
  T.suite('boss_dm: the DM Screen (invulnerable, smashed, collapses on him)', function (t) {
    startFight('screen' + t.seed);
    buffHeroes(400);
    const dm = dmUnit(), k = hero('test_knight'), c = hero('test_cleric');
    DD.Combat.endRound();   // his first turn: cameos + a Rocks Fall wind-up
    noCameos();
    noRule();
    t.ok(dm.flags.invulnerable && has(dm, 'invulnerable'), 'screened: invulnerable (flag + status)');
    t.eq(act(function () { return DD.Act.damage(k, dm, 30, { cause: 'skill' }); }), 0, 'no damage behind the screen');
    DD.Act.removeStatus(dm, 'invulnerable', { silent: true });
    t.eq(act(function () { return DD.Act.damage(k, dm, 30, { cause: 'skill' }); }), 0, 'dispelling the status does not help: the screen itself protects him');
    act(function () { B().syncShield(dm); });
    t.ok(has(dm, 'invulnerable'), 'status restored by the next sync');
    t.eq(DD.AI.estimate(k, dm, 10, null), 0, 'AI and AutoPlay see him as untouchable');
    const panels = objs('dm_screen_panel').sort(function (a, b) { return a.x - b.x; });
    const pdef = DD.getObject('dm_screen_panel');
    t.eq(panels[0].obj.hp, 10, 'panel HP');
    t.ok(DD.Combat.smashable(panels[0].obj), 'panels are smashable');
    t.eq(pdef.autoplay(k, panels[0].obj), 30, 'AutoPlay hint while 3 stand');
    t.ok(DD.Combat.current() === k, 'the knight\'s turn');
    t.ok(put(k, panels[0].x, panels[0].y + 1), 'knight next to the left panel');
    const ix = DD.Combat.interactions(k).filter(function (o) { return o.x === panels[0].x && o.y === panels[0].y; })[0];
    t.ok(ix && ix.kind === 'smash' && ix.ap === 1, 'Smash interaction (1 AP)');
    t.ok(DD.Combat.interact(k, panels[0].x, panels[0].y), 'smash 1');
    t.eq(objs('dm_screen_panel').length, 3, 'still standing at 5 HP');
    t.ok(DD.Combat.interact(k, panels[0].x, panels[0].y), 'smash 2');
    t.eq(objs('dm_screen_panel').length, 2, 'left panel destroyed');
    t.ok(logHas(/Behind it: Encounter tables/), 'the left panel reveals his encounter tables');
    t.ok(/2 panels left/.test(S().objective.flavor), 'subtitle counts the panels: ' + S().objective.flavor);
    act(function () { DD.Act.damageObject(c, panels[1].x, panels[1].y, 10); });
    t.eq(objs('dm_screen_panel').length, 1, 'center panel destroyed by damage (skills that hit objects work too)');
    t.eq(pdef.autoplay(k, panels[2].obj), 45, 'the last panel is worth the most to AutoPlay');
    t.ok(dm.flags.invulnerable && dm.hp === dm.maxHp, 'still invulnerable with 1 panel left');
    t.ok(windups('dm_rocks_fall').length === 1, 'his Rocks Fall is still winding up');
    let cancels = 0;
    const off = DD.Events.on('windup:cancel', function (e) { if (e.unit === dm) cancels++; });
    act(function () { DD.Act.damageObject(c, panels[2].x, panels[2].y, 10); });
    off();
    const d = dm.data;
    t.ok(d.screenDown && !dm.flags.invulnerable && !has(dm, 'invulnerable'), 'screen down: no longer invulnerable');
    t.eq(dm.hp, dm.maxHp - B().N.screenDrop, 'the screen falls on him: ' + B().N.screenDrop + ' damage');
    t.ok(has(dm, 'stun') && windups().length === 0 && cancels === 1, 'stunned: his Rocks Fall is interrupted at once');
    t.ok(has(dm, 'dm_exposed'), 'Exposed');
    t.eq(act(function () { return DD.Act.damage(c, dm, 10, { cause: 'skill' }); }), 15, 'Exposed: +50% damage taken');
    const exSt = DD.Act.getStatus(dm, 'dm_exposed'), exAt = dm.statuses.indexOf(exSt);
    const withEx = DD.AI.estimate(c, dm, 20, null);
    dm.statuses.splice(exAt, 1);                 // a peek without it (no hooks, no popups)
    const without = DD.AI.estimate(c, dm, 20, null);
    dm.statuses.splice(exAt, 0, exSt);
    t.ok(withEx > without, 'DD.AI.estimate counts Exposed (' + without + ' → ' + withEx + ')');
    t.eq(DD.Combat.slotsOf(dm).map(function (sl) { return sl.id; }).join(), 'dm_fudged_roll,dm_plot_hook,dm_get_off', 'screen down: rolls need line of sight now (+ Plot Hook, Get Off My Table)');
    t.eq(d.stats.panels, 3, 'stats: 3 panels');
    t.eq(d.stats.screen, 2, 'stats: screen down in round 2');
    t.eq(pdef.autoplay(k, { hp: 10 }), 0, 'no more panel value');
    t.ok(/Screen's down/.test(S().objective.flavor), 'subtitle updated');
    t.ok(logHas(/collapses onto the Dungeon Master/), 'logged');
    // the stun costs him exactly his next turn
    let w = watchDM(function () { DD.Combat.endRound(); });
    t.ok(w.actions.length === 0 && w.windups.length === 0, 'his next turn is lost');
    t.ok(!has(dm, 'stun'), 'stun over after his skipped turn');
    w = watchDM(function () { DD.Combat.endRound(); });
    t.ok(w.actions.indexOf('dm_secret_roll') < 0 && w.windups.length === 1, 'the turn after he acts again, no more secret rolls (' + w.actions.join() + ' / ' + w.windups.join() + ')');
    t.ok(has(dm, 'dm_exposed'), 'still Exposed in phase 1');
  });

  // ---- rules lawyering ------------------------------------------------------------------------------------------
  T.suite('boss_dm: house rules (one per round, each does what its chip says)', function (t) {
    const dm = exposedFight('rules' + t.seed);
    const k = hero('test_knight'), c = hero('test_cleric'), m = hero('test_mage'), r = hero('test_rogue');
    const hit = function (src, tgt, n) { return act(function () { return DD.Act.damage(src, tgt, n, { cause: 'skill', noHighGround: true }); }); };
    buffHeroes(200);
    heroes().forEach(function (h) { h.armor = 0; });
    rule(1); t.eq(ruleKey(), 'milestone', 'd20 1: Milestone XP');
    t.eq(hit(c, m, 5), 5, 'Milestone XP: nothing changes');
    rule(4); t.eq(ruleKey(), 'exploding', 'd20 4: Exploding Dice');
    t.eq(S().rules.filter(function (x) { return x.id === 'dm_house_rule'; }).length, 1, 'one house rule at a time');
    t.eq(hit(c, m, 5), 7, 'Exploding Dice: hero attacks +2');
    t.eq(hit(dm, m, 5), 7, 'Exploding Dice: his attacks +2 too');
    rule(6); t.eq(ruleKey(), 'snacks', 'd20 6: Snack Break');
    m.hp -= 20;
    const mhp = m.hp;
    DD.Combat.giveTurnTo(m);
    t.ok(DD.Combat.current() === m && m.hp === mhp + 4, 'Snack Break heals heroes 4 at the start of their turn');
    dm.hp -= 20; const dhp = dm.hp; act(function () { DD.Hooks.fire('onTurnStart', dm, dm); });
    t.eq(dm.hp, dhp, 'but never the DM');
    rule(8); t.eq(ruleKey(), 'los', 'd20 8: Strict Line of Sight');
    t.eq(DD.Targeting.range(m, DD.getSkill('test_bolt'), 1)[1], 4, 'heroes lose 1 max range (5 → 4)');
    t.eq(DD.Targeting.range(dm, DD.getSkill('dm_fudged_roll'), 1)[1], 14, 'his range is untouched');
    rule(10); t.eq(ruleKey(), 'ac', 'd20 10: Armor Class Is Back');
    t.eq(hit(c, m, 6), 4, 'every attack deals 2 less');
    rule(12); t.eq(ruleKey(), 'flank', 'd20 12: Flanking Rules');
    t.eq(hit(c, m, 8), 8, 'no flanking: normal damage');
    const spot = freeSpot(function (p) { return DD.Grid.isFree(p.x - 1, p.y) && DD.Grid.isFree(p.x + 1, p.y) && p.y >= 6; });
    put(m, spot.x, spot.y);
    const g1 = DD.Act.spawn('dm_cameo_goblin', m.x - 1, m.y, { noFx: true, silent: true });
    const g2 = DD.Act.spawn('dm_cameo_goblin', m.x + 1, m.y, { noFx: true, silent: true });
    t.ok(g1 && g2 && DD.Grid.dist(g1, m) === 1 && DD.Grid.dist(g2, m) === 1, 'two goblins flank the mage');
    t.eq(hit(g1, m, 8), 10, 'flanked: +25%');
    rule(14); t.eq(ruleKey(), 'cheeto', 'd20 14: Cheeto Fingers');
    clearCameos();
    put(r, dm.x, dm.y + 3);
    act(function () { DD.AI.useNow(dm, 'dm_fudged_roll', r, { noCooldown: true }); });
    const rt = DD.Grid.tile(r.x, r.y);
    t.ok(rt.surface && rt.surface.id === 'cheeto', 'his hits leave Cheeto dust');
    rule(16); t.eq(ruleKey(), 'fiat', 'd20 16: DM Fiat');
    t.eq(hit(dm, c, 10), 14, 'his attacks +4');
    t.eq(hit(c, m, 10), 10, 'heroes unaffected');
    rule(18); t.eq(ruleKey(), 'inspire', 'd20 18: Inspiration for Everyone');
    DD.Combat.giveTurnTo(c);
    t.ok(has(c, 'inspired'), 'heroes start their turn Inspired');
    rule(20); t.eq(ruleKey(), 'speed', 'd20 20: Speed Factor Initiative');
    DD.Combat.giveTurnTo(k);
    t.eq(k.ap, DD.Combat.turnAp(k) + 1, 'heroes +1 AP at the start of their turn (spendable at once)');
    act(function () { DD.Act.addStatus(r, 'stun', { turns: 1 }, dm); });
    const rap = r.ap, rbank = r.apBank || 0;
    act(function () { DD.Hooks.fire('onTurnStart', r, r); });
    t.ok(r.ap === rap && (r.apBank || 0) === rbank, 'a stunned hero gets no AP out of it (no phantom AP pip)');
    DD.Act.removeStatus(r, 'stun', { silent: true });
    // lifecycle: it lasts the round, a fresh one is rolled at the next round start
    const cur = S().rules.filter(function (x) { return x.id === 'dm_house_rule'; })[0];
    t.eq(cur.turns, 1, 'lasts this round');
    t.ok(/Rolled a 20/.test(cur.desc), 'the chip shows the roll');
    const rolledBefore = dm.data.stats.rules;
    DD.Combat.endRound();
    t.ok(ruleKey() && dm.data.stats.rules === rolledBefore + 1, 'a new rule next round');
    // phase 2+: rolls that help the heroes get re-rolled ("fudged"); phase 1 is honest
    let fudged = 0;
    for (let i = 0; i < 40; i++) { act(function () { B().rollHouseRule(dm); }); }
    t.ok(!logHas(/didn't like his first roll/), 'phase 1: honest rolls');
    dm.data.phase = 2;
    for (let i = 0; i < 40; i++) { act(function () { B().rollHouseRule(dm); }); }
    S().log.forEach(function (l) { if (/didn't like his first roll/.test(l.text)) fudged++; });
    t.ok(fudged > 0, 'phase 2: good rolls get fudged (' + fudged + ' of 40)');
  });

  T.suite('boss_dm: shown number = damage under every house rule (actions now, wind-ups when they land)', function (t) {
    /** The mage alone in the middle of the table (the others parked in the far corner), no armor, no Block. */
    function lone(seed) {
      const dm = exposedFight(seed);
      buffHeroes(400);
      ['test_knight', 'test_cleric', 'test_rogue'].forEach(function (id, i) { put(hero(id), i, 10); });
      const m = hero('test_mage');
      m.armor = 0; m.block = 0;
      return dm;
    }
    function areaOf(sid, dm, m) {
      if (sid === 'dm_get_off') { put(m, dm.x, dm.y + 1); return { tgt: dm, opts: { anchor: 'self' } }; }
      if (sid === 'dm_rocks_fall') { put(m, 7, 7); return { tgt: { x: 7, y: 7 }, opts: { anchor: 'ground', tiles: DD.Grid.shape('cross', { x: 7, y: 7 }, null, 1), data: { centers: [{ x: 7, y: 7 }] } } }; }
      if (sid === 'dm_railroad') { put(m, 1, 8); return { tgt: { x: 7, y: 8 }, opts: { anchor: 'ground', tiles: B().lanes(dm)[1], data: { lane: 1, dir: 1 } } }; }
      if (sid === 'dm_tpk') { put(m, 7, 7); return { tgt: { x: dm.x, y: dm.y }, opts: { anchor: 'ground', tiles: DD.Grid.allTiles().map(function (p) { return { x: p.x, y: p.y }; }) } }; }
      put(m, dm.x, dm.y + 6);
      return { tgt: m, opts: { anchor: 'unit' } };
    }
    // [d20 roll, rule, flat change]
    [[1, 'milestone', 0], [4, 'exploding', 2], [10, 'ac', -2], [16, 'fiat', 4]].forEach(function (c) {
      const res = [];
      // his immediate actions resolve under this round's rule
      ['dm_fudged_roll', 'dm_secret_roll', 'dm_plot_hook', 'dm_get_off'].forEach(function (sid) {
        const dm = lone('now' + c[0] + sid + t.seed);
        const m = hero('test_mage');
        const a = areaOf(sid, dm, m);
        rule(c[0]);
        const rec = DD.AI.makeIntent(dm, sid, a.tgt, Object.assign({ noAdd: true, noCooldown: true }, a.opts));
        const shown = DD.AI.intentDmg(dm, rec);
        const lost = hitsDuring(function () { act(function () { DD.AI.executeIntent(dm, rec); }); });
        t.eq(shown, DD.getSkill(sid).levels[0].dmg + c[2], sid + ' under ' + c[1]);
        t.eq(lost(m), shown, sid + ' under ' + c[1] + ': damage = number (' + shown + ')');
        res.push(sid.replace('dm_', '') + ' ' + shown);
      });
      // his wind-ups: announced on a hero's turn, they land at his turn this round, under this round's rule
      ['dm_rocks_fall', 'dm_railroad', 'dm_tpk'].forEach(function (sid) {
        const dm = lone('wu' + c[0] + sid + t.seed);
        const m = hero('test_mage');
        dm.data.p1 = 1;   // his own turn: a plain roll (not an encounter), aimed wherever
        const a = areaOf(sid, dm, m);
        rule(c[0]);
        const it = act(function () { return DD.AI.windUp(dm, sid, a.tgt, Object.assign({ noCooldown: true }, a.opts)); });
        t.ok(B().landsThisRound(dm, it), sid + ': lands this round (his turn comes after the heroes\')');
        const shown = DD.AI.describe(dm, it).dmg;
        const before = ruleKey();
        const lost = hitsDuring(function () { DD.Combat.endRound(); }, sid === 'dm_railroad' ? 'train' : 'rocks');
        t.eq(shown, DD.getSkill(sid).levels[0].dmg + c[2], sid + ' wind-up under ' + c[1] + ' (' + before + ')');
        t.eq(lost(m), shown, sid + ' wind-up under ' + c[1] + ': damage = its badge (' + shown + ')');
        res.push(sid.replace('dm_', '') + ' ⏳' + shown);
      });
      t.log(c[1] + ': ' + res.join(', '));
    });
    // a wind-up that lands next round shows its base number until the new round's rule is known
    const dm = lone('later' + t.seed);
    const m = hero('test_mage');
    DD.Combat.setOrder([dm, hero('test_knight'), hero('test_cleric'), m, hero('test_rogue')]);
    DD.Combat.endRound();          // round 2: the DM acted first; it is the knight's turn, the DM's entry is behind us
    noCameos();
    dm.intents = [];
    rule(16);
    put(m, 7, 7);
    const later = act(function () { return DD.AI.windUp(dm, 'dm_rocks_fall', { x: 7, y: 7 }, { tiles: DD.Grid.shape('cross', { x: 7, y: 7 }, null, 1), data: { centers: [{ x: 7, y: 7 }] }, noCooldown: true }); });
    t.ok(!B().landsThisRound(dm, later), 'his turn is past this round: it lands next round');
    t.eq(DD.AI.describe(dm, later).dmg, 26, 'base 26 under this round\'s DM Fiat (next round rolls its own rule)');
    // Flanking Rules: a roll at a hero standing between two of his minis deals (and shows) +25%
    const dm2 = lone('flank' + t.seed);
    const m2 = hero('test_mage');
    put(m2, 7, 7);
    DD.Act.spawn('dm_cameo_goblin', 6, 7, { noFx: true, silent: true });
    DD.Act.spawn('dm_cameo_goblin', 8, 7, { noFx: true, silent: true });
    rule(12);
    const rec = DD.AI.makeIntent(dm2, 'dm_fudged_roll', m2, { anchor: 'unit', noAdd: true, noCooldown: true });
    const shown = DD.AI.intentDmg(dm2, rec);
    const lost = hitsDuring(function () { act(function () { DD.AI.executeIntent(dm2, rec); }); });
    t.eq(shown, Math.round(DD.getSkill('dm_fudged_roll').levels[0].dmg * 1.25), 'flanked: +25% on the number');
    t.eq(lost(m2), shown, 'and that is what lands');
    // his cameos (real enemies of every act, no house-rule code of their own) follow the rule too
    [[4, 'exploding', 2], [10, 'ac', -2], [16, 'fiat', 0]].forEach(function (c) {
      lone('cameo' + c[0] + t.seed);
      const m3 = hero('test_mage');
      put(m3, 7, 7);
      const g = act(function () { return DD.Act.spawn('test_grunt', 7, 6, { noFx: true, silent: true }); });
      if (!t.ok(!!g, 'a stand-in cameo (test_grunt) on the table')) return;
      rule(c[0]);
      const r2 = DD.AI.makeIntent(g, 'test_grunt_stab', m3, { noAdd: true, noCooldown: true });
      const sh = DD.AI.intentDmg(g, r2);
      const l2 = hitsDuring(function () { act(function () { DD.AI.executeIntent(g, r2); }); });
      t.eq(sh, 4 + c[2], 'cameo number under ' + c[1] + ' (' + sh + ')');
      t.eq(l2(m3), sh, 'cameo hit under ' + c[1] + ' = its number');
    });
  });

  T.suite('boss_dm: Get Off My Table (only when crowded, not two turns in a row)', function (t) {
    const dm = exposedFight('shove' + t.seed);
    buffHeroes(400);
    const r = hero('test_rogue'), c = hero('test_cleric');
    put(r, dm.x - 1, dm.y);
    let w = watchDM(function () { DD.Combat.endRound(); });
    t.ok(w.actions.indexOf('dm_get_off') < 0, 'one hero adjacent: no shove (' + w.actions.join() + ')');
    put(r, dm.x - 1, dm.y); put(c, dm.x, dm.y + 1);
    noRule();   // this round's house rule (Armor Class Is Back...) would change the numbers
    const r0 = r.hp, c0 = c.hp;
    w = watchDM(function () { DD.Combat.endRound(); });
    t.eq(w.actions.join(), 'dm_get_off', 'two heroes adjacent: Get Off My Table is his action');
    const shove = DD.getSkill('dm_get_off').levels[0].dmg;
    t.ok(r0 - r.hp >= shove && c0 - c.hp >= shove && DD.Grid.dist(c, dm) >= 2, 'both hit, the cleric shoved off the table (the rogue bumps into his sourcebooks)');
    put(r, dm.x - 1, dm.y); put(c, dm.x, dm.y + 1);
    w = watchDM(function () { DD.Combat.endRound(); });
    t.ok(w.actions.indexOf('dm_get_off') < 0, 'still crowded next turn, but not two turns in a row (' + w.actions.join() + ')');
    put(r, dm.x - 1, dm.y); put(c, dm.x, dm.y + 1);
    w = watchDM(function () { DD.Combat.endRound(); });
    t.eq(w.actions.join(), 'dm_get_off', 'the turn after, again');
    t.ok(/Get Off My Table if two foes crowd him, not two turns running/.test(B().passiveText(dm)), 'his inspect line says so: ' + B().passiveText(dm));
    // behind the screen the shove is not in his kit (nor in his inspect line): two heroes who got into his alcove get rolled at
    startFight('shovescreen' + t.seed);
    buffHeroes(400);
    const sdm = dmUnit();
    DD.Combat.endRound();   // his first turn: the Random Encounter
    put(hero('test_rogue'), sdm.x - 1, sdm.y); put(hero('test_cleric'), sdm.x + 1, sdm.y);
    w = watchDM(function () { DD.Combat.endRound(); });
    t.ok(B().boss(sdm).screenDown === false && w.actions.join() === 'dm_secret_roll', 'screened and crowded: a roll, no shove (' + w.actions.join() + ')');
    t.ok(!/Get Off My Table/.test(B().passiveText(sdm)), 'and his screened inspect line does not promise one');
  });

  // ---- attacks of opportunity (v2 AoO rule) ----------------------------------------------------------------------
  T.suite('boss_dm: attacks of opportunity (he makes none; his hooks, shoves and trains never provoke)', function (t) {
    const dm = exposedFight('aoo' + t.seed);
    buffHeroes(400);
    const k = hero('test_knight'), c = hero('test_cleric'), m = hero('test_mage');
    // a seated DM: every kit he has is ranged or his own shove (a self-centred action), so no free swings at leavers
    const real = dm.skillSlots;
    ['screen', 1, 2].forEach(function (key) {
      dm.skillSlots = B().KIT[key].map(function (id) { return DD.Act.makeSlot(id, 1); });
      t.eq(DD.Act.opportunitySlot(dm), null, 'kit ' + key + ' (' + B().KIT[key].join() + '): no attack of opportunity');
    });
    dm.skillSlots = real;
    const evs = [];
    const off = DD.Events.on('opportunity:attack', function (e) { evs.push((e.attacker ? e.attacker.name : '?') + ' → ' + (e.mover ? e.mover.name : '?')); });
    try {
      // the others out of the way (far corner), the knight next to the DM on his own turn
      [c, m, hero('test_rogue')].forEach(function (h, i) { put(h, 11 + i % 3, 10); });
      t.ok(DD.Combat.current() === k && put(k, dm.x, dm.y + 1), 'the knight\'s turn, next to the DM');
      const away = [{ x: dm.x, y: dm.y + 3 }, { x: dm.x - 1, y: dm.y + 3 }, { x: dm.x + 1, y: dm.y + 3 }].filter(function (p) { return DD.Grid.isFree(p.x, p.y); })[0];
      t.eq(DD.Combat.provokes(k, away.x, away.y).length, 0, 'walking away from him provokes nothing (the move preview agrees)');
      t.ok(DD.Combat.move(k, away.x, away.y) && evs.length === 0, 'and the walk is free');
      // his minis do strike (the fallback goblin is melee; the skeleton and the imp shoot)
      t.ok(!!DD.Act.opportunitySlot(DD.Act.spawn('dm_cameo_goblin', 0, 0, { noFx: true, silent: true })), 'the goblin mini stabs leavers');
      ['dm_cameo_skeleton', 'dm_cameo_imp'].forEach(function (id) {
        t.eq(DD.Act.opportunitySlot(DD.Act.spawn(id, 13 - (id === 'dm_cameo_imp' ? 1 : 0), 0, { noFx: true, silent: true })), null, id + ': ranged, no attacks of opportunity');
      });
      // his Plot Hook drags a hero past a goblin, Get Off My Table shoves heroes away from goblins: neither provokes
      put(m, dm.x, dm.y + 7);
      const g1 = DD.Act.spawn('dm_cameo_goblin', dm.x + 1, dm.y + 6, { noFx: true, silent: true });
      t.ok(g1 && DD.Act.opportunityOf(g1, m, { x: m.x, y: m.y - 1 }), 'a goblin beside the mage\'s way (a walk would provoke it)');
      const y0 = m.y;
      act(function () { DD.AI.useNow(dm, 'dm_plot_hook', m, { noCooldown: true }); });
      t.ok(m.y < y0 && evs.length === 0, 'Plot Hook: pulled past the goblin, no attack of opportunity (' + evs.join('; ') + ')');
      put(k, dm.x - 1, dm.y); put(c, dm.x, dm.y + 1);
      const g2 = DD.Act.spawn('dm_cameo_goblin', dm.x + 1, dm.y + 1, { noFx: true, silent: true });
      t.ok(g2 && DD.Grid.dist(g2, c) === 1, 'a goblin next to the cleric');
      act(function () { DD.AI.useNow(dm, 'dm_get_off', dm, { anchor: 'self', noCooldown: true }); });
      t.ok(DD.Grid.dist(c, dm) >= 2 && evs.length === 0, 'Get Off My Table: knocked away from the goblin, no attack of opportunity');
      const lane = tagged('lane2'), ly = lane[0].y;
      t.ok(put(m, 4, ly), 'the mage on the tracks');
      const g3 = DD.Act.spawn('dm_cameo_goblin', 4, ly - 1, { noFx: true, silent: true });
      t.ok(g3 && DD.Act.opportunityOf(g3, m), 'a goblin beside the mage, just off the tracks');
      act(function () { DD.AI.useNow(dm, 'dm_railroad', lane[7], { anchor: 'ground', tiles: lane, data: { lane: 1, dir: 1 }, noCooldown: true }); });
      t.ok(m.y === ly + 1 && evs.length === 0, 'The Railroad: knocked south off the tracks, away from it, no attack of opportunity');
      // the same mini does strike a hero who walks away from it on his own turn
      const g4 = DD.Act.spawn('dm_cameo_goblin', 2, 10, { noFx: true, silent: true });
      put(c, 2, 9);
      DD.Combat.giveTurnTo(c);
      t.ok(g4 && DD.Combat.provokes(c, 2, 7).some(function (p) { return p.unitId === g4.id; }), 'walking away from a goblin mini would provoke it');
      DD.Combat.move(c, 2, 7);
      t.ok(evs.some(function (e) { return /Goblin/.test(e); }), 'and it does: ' + evs.join('; '));
    } finally { off(); }
  });

  // ---- every attack: damage == desc ------------------------------------------------------------------------------
  T.suite('boss_dm: every attack deals exactly what its desc says', function (t) {
    let dm = exposedFight('atk' + t.seed);
    buffHeroes(400);
    const c = hero('test_cleric'), m = hero('test_mage'), r = hero('test_rogue');
    heroes().forEach(function (h) { h.armor = 0; });
    const now = function (sid, tgt, opts) { return act(function () { return DD.AI.useNow(dm, sid, tgt, Object.assign({ noCooldown: true }, opts || {})); }); };
    const dmg = function (sid) { return DD.getSkill(sid).levels[0].dmg; };
    // Fudged Roll (line of sight)
    put(m, dm.x, dm.y + 4);
    let hp = m.hp;
    now('dm_fudged_roll', m);
    t.eq(hp - m.hp, dmg('dm_fudged_roll'), 'Fudged Roll: ' + dmg('dm_fudged_roll') + ' (no high-ground bonus from his dais)');
    const hidden = freeSpot(function (p) { return DD.Grid.dist(p, dm) <= 14 && !DD.Grid.los(dm, p); });
    t.ok(!!hidden, 'there is cover on the table');
    put(m, hidden.x, hidden.y);
    hp = m.hp;
    now('dm_fudged_roll', m);
    t.eq(m.hp, hp, 'Fudged Roll fizzles behind cover');
    t.ok(logHas(/Lost track/), 'fizzle logged');
    now('dm_secret_roll', m);
    t.eq(hp - m.hp, dmg('dm_secret_roll'), 'Roll Behind the Screen: ' + dmg('dm_secret_roll') + ', no line of sight needed');
    // Rocks Fall (everyone on the tiles but him, rubble)
    const spot = freeSpot(function (p) { return !p.tag && p.h === 0 && !p.obj && DD.Grid.terrain(p).id !== 'rubble' && p.x > 0 && p.y < 10 && DD.Grid.isFree(p.x + 1, p.y) && DD.Grid.dist(p, dm) > 3; });
    put(m, spot.x, spot.y);
    const gob = DD.Act.spawn('dm_cameo_goblin', spot.x + 1, spot.y, { noFx: true, silent: true });
    hp = m.hp;
    now('dm_rocks_fall', spot, { anchor: 'ground', tiles: DD.Grid.shape('cross', spot, null, 1), data: { centers: [{ x: spot.x, y: spot.y }] } });
    t.eq(hp - m.hp, dmg('dm_rocks_fall'), 'Rocks Fall: ' + dmg('dm_rocks_fall'));
    t.ok(gob.dead, 'his own minis get flattened too');
    t.eq(DD.Grid.tile(spot.x, spot.y).t, 'rubble', 'leaves rubble at the impact');
    // The Railroad (+ 1 south, minis too); nobody south of the lane to bump into
    const lane = tagged('lane2');
    const ly = lane[0].y;
    put(hero('test_knight'), 0, 10); put(c, 1, 10);
    put(m, 3, ly); put(r, 9, ly);
    const g2 = DD.Act.spawn('dm_cameo_goblin', 11, ly, { noFx: true, silent: true });
    const mhp = m.hp, rhp = r.hp;
    now('dm_railroad', lane[7], { anchor: 'ground', tiles: lane, data: { lane: 1, dir: 1 } });
    t.eq(mhp - m.hp, dmg('dm_railroad'), 'The Railroad: ' + dmg('dm_railroad'));
    t.eq(rhp - r.hp, dmg('dm_railroad'), 'every hero on the lane');
    t.ok(m.y === ly + 1 && r.y === ly + 1, 'knocked 1 tile south, off the tracks');
    t.ok(g2.dead, 'his minis are not spared');
    t.ok(dm.hp === dm.maxHp - B().N.screenDrop, 'the DM is not on that lane');
    // Plot Hook (+ pull 3), with a clear column in front of him
    [hero('test_knight'), r, c].forEach(function (u, i) { put(u, 1 + i, 10); });
    put(m, dm.x, dm.y + 7);
    hp = m.hp;
    const d0 = DD.Grid.dist(m, dm);
    now('dm_plot_hook', m);
    t.eq(hp - m.hp, dmg('dm_plot_hook'), 'Plot Hook: ' + dmg('dm_plot_hook'));
    t.eq(d0 - DD.Grid.dist(m, dm), 3, 'pulled 3 tiles toward the DM');
    // Get Off My Table (13 + knockback 2)
    put(m, 1, 9); put(r, dm.x - 1, dm.y); put(c, dm.x, dm.y + 1);
    const r0 = r.hp, c0 = c.hp;
    now('dm_get_off', dm, { anchor: 'self' });
    t.eq(r0 - r.hp, dmg('dm_get_off') + 3, 'Get Off My Table: ' + dmg('dm_get_off') + ', +3 bump against the sourcebooks');
    t.eq(c0 - c.hp, dmg('dm_get_off'), 'Get Off My Table: ' + dmg('dm_get_off'));
    t.eq(DD.Grid.dist(c, dm), 3, 'knocked back 2');
    // ROCKS FALL, EVERYONE DIES (every hero)
    dm = exposedFight('doomhit' + t.seed);
    const hs = heroes();
    hs.forEach(function (h) { h.maxHp = h.hp = 100; h.block = 0; });
    act(function () { DD.AI.useNow(dm, 'dm_tpk', { x: dm.x, y: dm.y }, { anchor: 'ground', tiles: DD.Grid.allTiles().map(function (x) { return { x: x.x, y: x.y }; }), noCooldown: true }); });
    hs.forEach(function (h) { t.eq(100 - h.hp, dmg('dm_tpk') - (h.armor || 0), h.name + ' takes ' + dmg('dm_tpk') + (h.armor ? ' (−' + h.armor + ' armor)' : '')); });
    t.eq(dm.hp, dm.maxHp - B().N.screenDrop, 'not him');
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
    t.ok(/Railroad/.test(S().objective.flavor), 'subtitle: the railroad');
    t.ok(/Track Switch/.test(B().passiveText(dm)), 'inspect line: the railroad and its switch');
    // Plot Armor clamps the hit itself: it deals (and reports) only what he loses, nothing is healed back afterwards
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
    t.ok(/PLOT ARMOR/.test(S().objective.flavor), 'the subtitle says why he stopped taking damage');
    t.eq(act(function () { return DD.Act.damage(c, dm, 30, { cause: 'skill' }); }), 0, 'no more damage this round');
    const kp = DD.Combat.current();
    put(kp, dm.x, dm.y + 1);
    const prev = DD.Combat.preview(kp, kp.basic, dm.x, dm.y);
    t.ok(!!prev && !(prev.perUnit[dm.id] && prev.perUnit[dm.id].dmg), 'previews know about plot armor (0 on him)');
    DD.Combat.endRound();
    t.eq(d.phase, 3, 'next round: phase 3');
    t.ok(!d.armored && !has(dm, 'invulnerable'), 'plot armor gone');
    t.eq(objs('dm_handbook').length, 3, '3 Player\'s Handbooks appear');
    t.ok(d.doom && d.doom.active, 'the doom countdown starts');
    const doom = windups('dm_tpk')[0];
    t.ok(doom && doom.turnsLeft === 3, 'wound up over 3 of his turns (⏳3)');
    t.ok(/ROCKS FALL in 3 of his turns \(⏳3\)/.test(S().objective.flavor), 'the subtitle counts like the badge: ' + S().objective.flavor);
    // can't die before phase 3 even to a giant overkill
    const dm2 = exposedFight('overkill' + t.seed);
    act(function () { DD.Act.damage(null, dm2, 9999, { cause: 'other' }); });
    t.ok(!dm2.dead && dm2.hp === p3 && dm2.data.phase === 2, 'overkill in phase 1: phase 2 at 1/3 HP with plot armor');
    DD.Combat.endRound();
    t.eq(dm2.data.phase, 3, 'and phase 3 next round');
    act(function () { DD.Act.damage(null, dm2, 9999, { cause: 'other' }); });
    t.ok(dm2.dead, 'phase 3 has no plot armor');
    // plot armor never outlives its round: healed back above the floor, he stays in phase 2 and can be hurt again
    const dm3 = exposedFight('armorheal' + t.seed);
    act(function () { DD.Act.damage(null, dm3, 9999, { cause: 'other' }); });
    t.ok(dm3.data.armored && dm3.hp === p3, 'plot armored at 1/3');
    act(function () { DD.Act.heal(null, dm3, 8); });
    DD.Combat.endRound();
    t.ok(dm3.data.phase === 2 && !dm3.data.armored && !has(dm3, 'invulnerable') && !dm3.flags.invulnerable, 'healed above the floor: phase 2, no plot armor left');
    t.ok(act(function () { return DD.Act.damage(c, dm3, 5, { cause: 'other' }); }) > 0, 'and he takes damage again (no soft-lock)');
  });

  // ---- phase 2 puzzle: track switches ---------------------------------------------------------------------------
  T.suite('boss_dm: track switches divert the train onto the DM (the hint reads v2 wind-ups)', function (t) {
    const dm = exposedFight('switch' + t.seed);
    buffHeroes(400);
    const r = hero('test_rogue'), c = hero('test_cleric');
    const sdef = DD.getObject('dm_track_switch');
    let sw = besideSwitch(r);
    t.ok(!DD.Combat.interactions(r).some(function (o) { return o.x === sw.x && o.y === sw.y; }), 'phase 1: the switch does nothing yet');
    t.eq(sdef.autoplay(), 0, 'no AutoPlay value in phase 1');
    toPhase2(dm);
    t.eq(sdef.autoplay(), 0, 'phase 2, no train winding up yet: nothing to switch');
    DD.Combat.endRound();   // his turn: a train wind-up
    const due = windups('dm_railroad')[0];
    t.ok(due && due.windup && due.turnsLeft === 1 && due.delay === 1, 'a train winding up (⏳1: delay 1 while it is pending)');
    // regression (v2): the pre-v2 test `!(delay > 0)` found nothing here, so the switch never worked
    t.ok(B().divertable(dm) === due, 'divertable: the pending wind-up that lands at his next turn');
    sw = besideSwitch(r);
    const ix = DD.Combat.interactions(r).filter(function (o) { return o.x === sw.x && o.y === sw.y; })[0];
    t.ok(ix && ix.kind === 'object' && /Switch Tracks/.test(ix.label) && ix.ap === 1, 'Switch Tracks (1 AP)');
    t.eq(sdef.autoplay(), 34, 'AutoPlay value while a train winds up');
    noRule();   // exact numbers: no house rule this round
    put(c, dm.x - 1, dm.y);
    c.armor = 0;
    DD.Combat.giveTurnTo(r);
    t.ok(DD.Combat.interact(r, sw.x, sw.y), 'switched on the rogue\'s turn');
    t.ok(due.data.diverted && due.data.unstoppable && DD.AI.intentTiles(dm, due).every(function (p) { return p.y === dm.y; }) && DD.AI.intentTiles(dm, due).length === 14,
      'the train now runs down the DM\'s row, and nothing he does can stop it');
    t.ok(/Diverted/.test(due.label) && due.label.length <= 22, 'its label says so (short enough for the badge): ' + due.label);
    t.eq(sdef.autoplay(), 0, 'nothing left to switch');
    t.eq(dm.data.stats.switches, 1, 'stats: switch used');
    noRule();
    const lost = hitsDuring(function () { DD.Combat.endRound(); }, 'train');
    t.eq(lost(dm), trainDmg(), 'run over by his own plot: the same ' + trainDmg() + ' as anyone on his row');
    t.eq(lost(c), trainDmg(), 'whoever stands on his row gets hit too');
    t.ok(has(dm, 'vulnerable'), 'and he is Vulnerable');
    t.eq(DD.Act.getStatus(dm, 'vulnerable').turns, 1, '… through the heroes\' turns and his next one');
    t.eq(dm.data.stats.diverted, 1, 'stats: diverted');
    t.ok(logHas(/flattened by his own railroad/), 'logged');
    DD.Combat.endRound();
    t.ok(!has(dm, 'vulnerable'), 'Vulnerable ends with his next turn (as the desc says)');
  });

  /** Phase 2, a train winding up, the switch thrown by the rogue on her turn. Returns the diverted wind-up. */
  function divertNow(dm) {
    const r = hero('test_rogue');
    toPhase2(dm);
    DD.Combat.endRound();
    const sw = besideSwitch(r);
    DD.Combat.giveTurnTo(r);
    DD.Combat.interact(r, sw.x, sw.y);
    return dm.intents.filter(function (i) { return i.data && i.data.diverted; })[0];
  }
  T.suite('boss_dm: a diverted train is the party\'s (his stun, taunt or dazzle can\'t stop it)', function (t) {
    let dm = exposedFight('runaway' + t.seed);
    buffHeroes(400);
    const k = hero('test_knight');
    let it = divertNow(dm);
    t.ok(!!it, 'diverted');
    dm.data.guard = null;
    act(function () { DD.Act.addStatus(dm, 'stun', { turns: 1 }, k); });
    const kept = dm.intents.filter(function (i) { return i.data && i.data.diverted; });
    t.ok(has(dm, 'stun') && kept.length === 1, 'stunned: the diverted train stays');
    t.ok(kept[0] && DD.AI.intentTiles(dm, kept[0]).length === 14 && DD.AI.intentTiles(dm, kept[0]).every(function (p) { return p.y === dm.y; }), 'still marked down his row');
    const desc = DD.AI.describe(dm, kept[0]);
    t.ok(!/Incapacitated/.test(desc.text) && /Diverted/.test(desc.label), 'the inspect text does not claim it will not happen: ' + desc.text);
    noRule();
    let lost = hitsDuring(function () { DD.Combat.endRound(); }, 'train');
    t.eq(lost(dm), trainDmg(), 'it hits him anyway: ' + trainDmg());
    t.ok(has(dm, 'vulnerable') && dm.data.stats.diverted === 1, 'Vulnerable, counted');
    // taunted after the switch: the diverted train stays on his row
    dm = exposedFight('taunted' + t.seed);
    buffHeroes(400);
    divertNow(dm);
    const kn = hero('test_knight');
    put(kn, 3, 9);
    act(function () { DD.Act.addStatus(dm, 'taunt', { turns: 1 }, kn); });
    it = dm.intents.filter(function (i) { return i.data && i.data.diverted; })[0];
    t.ok(it && DD.AI.intentTiles(dm, it).every(function (p) { return p.y === dm.y; }), 'taunt does not drag it off his row');
    noRule();
    lost = hitsDuring(function () { DD.Combat.endRound(); }, 'train');
    t.eq(lost(dm), trainDmg(), 'and it still hits him');
    // dazzled when it lands: not his to aim. Under DM Fiat it is still "his attack": the badge says +4, and so does he
    dm = exposedFight('dazzled' + t.seed);
    buffHeroes(400);
    it = divertNow(dm);
    act(function () { DD.Act.addStatus(dm, 'dazzled', { turns: 1 }, hero('test_cleric')); });
    rule(16);
    const shown = DD.AI.intentDmg(dm, it);
    lost = hitsDuring(function () { DD.Combat.endRound(); }, 'train');
    t.eq(shown, trainDmg() + 4, 'the badge counts DM Fiat (' + shown + ')');
    t.eq(lost(dm), shown, 'dazzled: still a direct hit, and he takes exactly the badge number');
  });

  // ---- phase 3 puzzle: handbooks & the doom ------------------------------------------------------------------
  T.suite('boss_dm: Player\'s Handbooks rules-lawyer the doom away', function (t) {
    const dm = exposedFight('books' + t.seed);
    buffHeroes(400);
    const bdef = DD.getObject('dm_handbook');
    t.eq(objs('dm_handbook').length, 0, 'no books before phase 3');
    toPhase3(dm);
    const d = dm.data;
    const books = objs('dm_handbook');
    t.eq(books.length, 3, '3 books');
    t.ok(books.every(function (b) { return DD.Grid.neighbors(b.x, b.y).some(function (n) { return DD.Grid.isWalkable(n.x, n.y); }); }), 'every book can be reached');
    t.ok(books.every(function (b) { return bdef.autoplay(null, b.obj) === 40; }), 'AutoPlay values every unused book at 40');
    t.ok(windups('dm_tpk').length === 1, 'the doom is winding up');
    const hs = heroes();
    function cite(i, h) {
      const b = books[i];
      const spot = DD.Grid.neighbors(b.x, b.y).filter(function (n) { return DD.Grid.isFree(n.x, n.y); })[0];
      put(h, spot.x, spot.y);
      DD.Combat.giveTurnTo(h);
      const ix = DD.Combat.interactions(h).filter(function (o) { return o.x === b.x && o.y === b.y; })[0];
      t.ok(ix && /Cite the Rules/.test(ix.label) && ix.ap === 1, 'Cite the Rules (1 AP)');
      return DD.Combat.interact(h, b.x, b.y);
    }
    t.ok(cite(0, hs[1]), 'cite 1');
    t.ok(books[0].obj.data.used && bdef.autoplay(null, books[0].obj) === 0, 'a cited book is spent');
    t.eq(d.books, 1, '1/3');
    t.ok(/\(1\/3\)/.test(S().objective.flavor), 'subtitle counts: ' + S().objective.flavor);
    t.ok(cite(1, hs[2]), 'cite 2');
    t.ok(windups('dm_tpk').length === 1, 'two citations are not enough');
    const hp = dm.hp;
    let cancels = 0;
    const off = DD.Events.on('windup:cancel', function (e) { if (e.unit === dm) cancels++; });
    t.ok(cite(2, hs[3]), 'cite 3');
    off();
    t.ok(d.doom.solved && !d.doom.active, 'RULES-LAWYERED: the doom is cancelled for good');
    t.ok(windups('dm_tpk').length === 0 && cancels >= 1, 'its wind-up is gone (windup:cancel)');
    t.eq(hp - dm.hp, 55, 'the rocks fall on him: 55');
    t.ok(!has(dm, 'stun') && has(dm, 'dm_exposed'), 'Exposed for the rest of the fight (no stun: he keeps rolling)');
    t.ok(books.every(function (b) { return bdef.autoplay(null, b.obj) === 0; }), 'no more book value');
    t.eq(d.stats.lawyered, S().round, 'stats');
    DD.Combat.endRound(); DD.Combat.endRound();
    t.eq(windups('dm_tpk').length, 0, 'he never winds it up again');
    t.ok(has(dm, 'dm_exposed'), 'still Exposed');
  });

  T.suite('boss_dm: the doom lands after 3 of his turns, stuns push it back, the stun guard limits stun-locks', function (t) {
    let dm = exposedFight('doom' + t.seed);
    buffHeroes(400);
    heroes().forEach(function (h) { h.armor = 0; });
    toPhase3(dm);
    let fired = 0;
    for (let i = 1; i <= 2; i++) {
      DD.Combat.endRound();
      t.eq(windups('dm_tpk')[0].turnsLeft, 3 - i, 'after his turn ' + i + ': ⏳' + (3 - i));
    }
    t.eq(dm.data.stats.doomFired, 0, 'not yet');
    noRule();
    const lost = hitsDuring(function () { DD.Combat.endRound(); }, 'rocks');
    fired = dm.data.stats.doomFired;
    t.eq(fired, 1, 'ROCKS FALL, EVERYONE DIES at the start of his 3rd turn');
    t.ok(heroes().every(function (h) { return lost(h) >= 60; }), 'every hero took the rocks (' + heroes().map(lost).join(', ') + ')');
    const again = windups('dm_tpk')[0];
    t.ok(again && again.turnsLeft === 3, 'he restarts the countdown (⏳3)');
    // a stun pushes it back a turn (it is unstoppable: the stun does not cancel it)
    dm = exposedFight('doomstun' + t.seed);
    buffHeroes(400);
    toPhase3(dm);
    const k = hero('test_knight');
    DD.Combat.endRound();
    const before = windups('dm_tpk')[0].turnsLeft;
    act(function () { DD.Act.addStatus(dm, 'stun', { turns: 1 }, k); });
    t.ok(has(dm, 'stun') && windups('dm_tpk').length === 1, 'stunned: the countdown survives');
    t.eq(windups('dm_tpk')[0].turnsLeft, before + 1, 'he lost his place: +1 turn (⏳' + (before + 1) + ')');
    t.ok(logHas(/loses his place in his notes/), 'logged');
    act(function () { DD.Act.addStatus(dm, 'sleep', { turns: 1 }, k); });
    t.ok(!has(dm, 'sleep') && windups('dm_tpk')[0].turnsLeft === before + 1, 'stun guard: no second stun before he has played a turn');
    let w = watchDM(function () { DD.Combat.endRound(); });
    t.ok(w.actions.length === 0 && !has(dm, 'stun'), 'he lost that turn');
    t.eq(windups('dm_tpk')[0].turnsLeft, before, 'the countdown still ticked at its start');
    act(function () { DD.Act.addStatus(dm, 'stun', { turns: 1 }, k); });
    t.ok(!has(dm, 'stun'), 'stun guard: still stun-proof until his next real turn is over');
    w = watchDM(function () { DD.Combat.endRound(); });
    t.ok(w.actions.length + w.landed.length > 0, 'he played that turn');
    act(function () { DD.Act.addStatus(dm, 'stun', { turns: 1 }, k); });
    t.ok(has(dm, 'stun'), 'after a turn he played, he can be stunned again');
    t.ok(dm.data.stats.refused >= 2 && dm.data.stats.pushed >= 2, 'stats: refused ' + dm.data.stats.refused + ', pushed back ' + dm.data.stats.pushed);
    t.ok(!has(dm, 'sheep') && !DD.Act.addStatus(dm, 'sheep', { turns: 1 }, k), 'bosses never turn into sheep');
  });

  // ---- cameos ----------------------------------------------------------------------------------------------------
  T.suite('boss_dm: random encounters (runtime pool, caps, unpainted minis, initiative on arrival)', function (t) {
    startFight('cameo' + t.seed);
    const dm = dmUnit(), d = dm.data;
    const pool = B().cameoPool();
    const real = pool[1].length + pool[2].length + pool[3].length;
    DD.Combat.endRound();
    t.eq(cameos().length, 2, 'his first turn: 2 cameos');
    t.ok(/a Random Encounter every third turn/.test(B().passiveText(dm)), 'his inspect line says when they come: ' + B().passiveText(dm));
    cameos().forEach(function (u) {
      const def = DD.getEnemy(u.defId);
      if (real) t.ok(!/^dm_/.test(u.defId) && def.tier !== 'boss' && def.tier !== 'elite', u.name + ' is a real act enemy (pool of ' + real + ')');
      else t.ok(/^dm_cameo_/.test(u.defId), u.name + ' is a fallback mini (no act enemies registered)');
      t.ok(S().order.some(function (e) { return e.unitId === u.id; }), u.name + ' has an initiative entry of its own');
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
      DD.Combat.endRound();
      const c = cameos();
      t.ok(c.length === 2 && c.every(function (u) { return u.defId === 'a1_dmtest_cameo'; }), 'picked from the registry at runtime');
      t.ok(c.every(function (u) { return u.maxHp === 16; }), 'minis come out at mini toughness (14 → 16 HP)');
      t.ok(c.every(function (u) { return u.sprite && u.sprite.palette.skin !== '#6fa04a' && /^#([0-9a-f]{2})\1/.test(u.sprite.palette.skin); }), 'drawn as unpainted grey minis');
      t.ok(c.every(function (u) { return u.data.cameoAct === 1; }), 'remember their act');
    } finally { DD.defs.enemies = saved; }
    // charmed DMs don't summon
    startFight('cameo3' + t.seed);
    const dm3 = dmUnit();
    act(function () { DD.Act.addStatus(dm3, 'charmed', { turns: 1 }, heroes()[0]); });
    t.eq(act(function () { return B().randomEncounter(dm3); }), 0, 'a charmed DM summons nobody');
  });

  // ---- robustness ------------------------------------------------------------------------------------------------
  T.suite('boss_dm: robustness (bare sandbox, charm, previews, death, a cramped table)', function (t) {
    DD.Combat.sandbox({ w: 11, h: 11, seed: 'bare' + t.seed, kind: 'boss',
      heroes: [{ id: 'test_knight', x: 2, y: 8, level: LV }, { id: 'test_cleric', x: 4, y: 9, level: LV }, { id: 'test_mage', x: 6, y: 9, level: LV }, { id: 'test_rogue', x: 9, y: 8, level: LV }],
      enemies: [{ id: DM, x: 5, y: 2 }] });
    let dm = dmUnit();
    buffHeroes(400);
    t.ok(!dm.flags.invulnerable && !has(dm, 'invulnerable'), 'no screen in a bare sandbox: vulnerable from the start');
    t.eq(DD.Combat.slotsOf(dm).map(function (sl) { return sl.id; }).join(), 'dm_fudged_roll,dm_plot_hook,dm_get_off', 'and he rolls with line of sight');
    t.ok(act(function () { return DD.Act.damage(heroes()[0], dm, 5, { cause: 'skill' }); }) > 0, 'takes damage');
    for (let i = 0; i < 3; i++) DD.Combat.endRound();
    t.ok(S().round === 4 && !S().result, 'three rounds without a hitch');
    t.ok(dm.intents.length > 0, 'still winding things up');
    dm.hp = B().threshold(dm, 2) - 1; dm.data.lastShift = -1;
    act(function () { B().syncPhase(dm); });
    noCameos();
    DD.Combat.endRound();
    const tr = windups('dm_railroad')[0];
    t.ok(tr && tr.tiles.length === 11 && tr.tiles.every(function (p) { return p.y === tr.tiles[0].y; }) && tr.tiles[0].y !== dm.y, 'fallback lanes: full rows near him');
    dm.hp = B().threshold(dm, 3) - 1;
    act(function () { B().syncPhase(dm); });
    const books = objs('dm_handbook');
    t.eq(books.length, 3, 'fallback handbook spots near the party');
    t.ok(books.every(function (b) { return DD.Grid.neighbors(b.x, b.y).some(function (n) { return DD.Grid.isWalkable(n.x, n.y); }); }), 'reachable');
    // charmed on his turn: he turns his roll and his rocks on his own minis
    startFight('charm' + t.seed);
    buffHeroes(400);
    DD.Combat.endRound();          // his first turn: two cameos
    dm = dmUnit();
    act(function () { breakScreen(heroes()[0]); });
    DD.Act.removeStatus(dm, 'stun', { silent: true });
    dm.intents = [];
    dm.data.guard = null;
    const mini = cameos()[0];
    put(mini, dm.x, dm.y + 3);
    act(function () { DD.Act.addStatus(dm, 'charmed', { turns: 1 }, heroes()[0]); });
    // where his rocks are aimed, read the moment he winds them up (his minis walk on afterwards)
    const aimed = [];
    const offW = DD.Events.on('windup:start', function (e) {
      if (e.unit !== dm || !e.intent.data || !e.intent.data.centers) return;
      e.intent.data.centers.forEach(function (p) { const u = DD.Grid.unitAt(p.x, p.y); aimed.push(u ? u.side : '-'); });
    });
    let rolls;
    try { rolls = hitsDuring(function () { DD.Combat.giveTurnTo(dm); }, 'dice'); } finally { offW(); }
    t.ok(heroes().every(function (h) { return rolls(h) === 0; }), 'charmed: no hero takes his roll');
    t.ok(cameos().concat([mini]).some(function (u) { return rolls(u) > 0; }) || mini.dead, 'his roll went for one of his own minis');
    t.ok(aimed.length > 0 && aimed.every(function (sd) { return sd === 'enemy'; }), 'his rocks too (' + aimed.join() + ')');
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
    // a switch dry run (AutoPlay dry-runs registered puzzle objects) leaves the real fight alone
    DD.Combat.endRound();
    const rg = hero('test_rogue');
    const sw = besideSwitch(rg);
    DD.Combat.giveTurnTo(rg);
    const real = B().divertable(dm);
    if (t.ok(!!real, 'a train is winding up')) {
      const tl0 = JSON.stringify(real.tiles);
      let inSim = false;
      DD.Targeting.simulate(function () {
        const su = DD.Combat.byId(rg.id);
        if (su && DD.Combat.interact(su, sw.x, sw.y)) { const sd = B().findDM(); inSim = !!(sd && B().boss(sd).stats.switches === 1 && !B().divertable(sd)); }
      });
      t.ok(inSim, 'in the dry run the switch works');
      t.ok(B().divertable(dm) === real && JSON.stringify(real.tiles) === tl0 && !(real.data && real.data.diverted) && dm.data.stats.switches === 0, 'and the real train is untouched');
    }
    // death: the defeat line, minis flee, victory
    dm = exposedFight('death' + t.seed);
    dm.data.cameos = 0;
    act(function () { B().randomEncounter(dm); });
    toPhase3(dm);
    dm.hp = 5;
    act(function () { DD.Act.damage(hero('test_knight'), dm, 50, { cause: 'skill' }); });
    t.eq(S().result, 'victory', 'victory');
    t.ok(logHas(/Fine\. FINE\. You win\. Same time next week\?/), 'the defeat line');
    t.ok(!S().rules.some(function (r) { return r.id === 'dm_house_rule'; }), 'house rules end with him');
    t.ok(cameos().length === 0, 'his minis flee');
    // a table with room for a single handbook: citing the books that fit is enough
    DD.Combat.sandbox({ w: 4, h: 1, seed: 'onebook' + t.seed, kind: 'boss',
      heroes: [{ id: 'test_knight', x: 3, y: 0, level: LV }], enemies: [{ id: DM, x: 0, y: 0 }] });
    dm = dmUnit();
    dm.hp = B().threshold(dm, 3) - 1;
    act(function () { B().syncPhase(dm); });
    const one = objs('dm_handbook');
    t.ok(dm.data.phase === 3 && one.length >= 1 && one.length < 3, 'phase 3 on a cramped table: ' + one.length + ' book(s)');
    t.eq(dm.data.booksNeeded, one.length, 'the countdown asks for the books that are on the table');
    t.ok(new RegExp('\\(0/' + one.length + '\\)').test(S().objective.flavor), 'and the subtitle says so: ' + S().objective.flavor);
    const kn = hero('test_knight');
    put(kn, one[0].x + 1, 0);
    one.forEach(function (b) { DD.Combat.interact(kn, b.x, b.y); });
    t.ok(dm.data.doom.solved, 'rules-lawyered with ' + one.length);
  });

  // ---- autoplay -----------------------------------------------------------------------------------------------------
  /**
   * n AutoPlay fights on the real path (deployment, rolled initiative). party(i) → RunHero[]. Returns a summary and
   * the per-fight lines; also checks honest areas / wind-ups and sanity.
   */
  /** One sim fight on the real path; key names its dice (the same key and party replay the same fight: dump=1&simkey=). */
  function simStart(key, team) {
    const setup = DD.Encounter.build('boss_dm', team, { rng: DD.RNG('dm-sim:' + key), difficulty: 'normal', act: 3 });
    return DD.Combat.start(setup, { seed: 'dm-sim' + key, headless: true, difficulty: 'normal', kind: 'boss' });
  }
  function sims(t, n, party, label) {
    const watch = T.contentHelpers && T.contentHelpers.watchAreas;
    const r = { n: n, wins: 0, rounds: 0, timeouts: 0, screens: 0, p2: 0, switched: 0, diverted: 0, p3: 0, engaged: 0, lawyered: 0, dooms: 0, downs: 0, lines: [] };
    const run = function (w) {
      for (let i = 0; i < n; i++) {
        const team = party(i);
        simStart(label + t.seed + ':' + i, team);
        if (w) w.arm();
        const dm = dmUnit();
        const res = DD.AutoPlay.runBattle(30);
        const st = dm.data.stats;
        if (res.timeout) r.timeouts++;
        if (res.result === 'victory') r.wins++;
        r.rounds += res.rounds;
        r.downs += S().stats.downs || 0;
        if (st.screen) r.screens++;
        if (st.phase2) { r.p2++; if (st.switches) r.switched++; r.diverted += st.diverted; }
        // a phase 3 that lasted into a second round: the party cited books, or the doom fell on them
        if (st.phase3 && res.rounds > st.phase3) { r.p3++; if (st.books || st.doomFired) r.engaged++; }
        if (st.lawyered) r.lawyered++;
        if (st.doomFired) r.dooms++;
        r.lines.push({ rounds: res.rounds, won: res.result === 'victory', text: '#' + i + ' ' + team.map(function (h) { return h.id; }).join('+') + ' ' + (res.result === 'victory' ? 'W' : 'L') + res.rounds +
          ' (DM ' + Math.max(0, dm.hp) + ', screen ' + (st.screen || '-') + ', p2 ' + (st.phase2 || '-') + ', p3 ' + (st.phase3 || '-') + ', switches ' + st.switches + '/' + st.diverted +
          ', books ' + st.books + (st.lawyered ? ' LAWYERED' : '') + (st.doomFired ? ', doom x' + st.doomFired : '') + ', stuns ' + st.stuns + ', downs ' + (S().stats.downs || 0) + ')' });
        if (T.contentHelpers && T.contentHelpers.sanity) T.contentHelpers.sanity(t, label + ' sim ' + i);
      }
    };
    const w = watch ? watch(run) : (run(null), null);
    if (w) t.eq(w.violations.length, 0, 'areas and wind-ups honest over ' + w.actions + ' actions (' + w.windups + ' wind-ups)' + (w.violations[0] ? ': ' + w.violations[0] : ''));
    t.log(label + ': WIN RATE ' + r.wins + '/' + n + ' (' + Math.round(100 * r.wins / n) + '%), avg rounds ' + (r.rounds / n).toFixed(1) + ', downs/fight ' + (r.downs / n).toFixed(1) +
      ', timeouts ' + r.timeouts + '; screen ' + r.screens + '/' + n + ', switch used ' + r.switched + '/' + r.p2 + ' (' + r.diverted + ' trains diverted), phase 3 engaged ' +
      r.engaged + '/' + r.p3 + ', lawyered ' + r.lawyered + ', doom fired in ' + r.dooms);
    // the harness prints 60 lines a suite: the losses and the longest fights first (replay one: dump=1&simkey=<label><seed>:<#>)
    const hist = {};
    r.lines.forEach(function (l) { hist[l.rounds] = (hist[l.rounds] || 0) + 1; });
    t.log('  rounds: ' + Object.keys(hist).sort(function (a, b) { return a - b; }).map(function (k) { return k + '×' + hist[k]; }).join(' '));
    if (t.param('lines', '1') === '1') {
      r.lines.slice().sort(function (a, b) { return (a.won - b.won) || b.rounds - a.rounds; }).slice(0, 50).forEach(function (l) { t.log('  ' + l.text); });
    }
    return r;
  }

  T.suite('boss_dm: AutoPlay sims (fixture party, level 5): puzzles engaged, no timeouts', function (t) {
    // the fixture heroes are simpler than the real ones (they win ~25%): this is about the puzzles and the phases
    const n = +(t.param('n', 10));
    const lv = +(t.param('level', LV));
    const r = sims(t, n, function () { return partyAt(lv); }, 'fixture L' + lv);
    t.eq(r.timeouts, 0, 'no timeouts');
    t.eq(r.screens, n, 'AutoPlay breaks the DM Screen every time');
    t.ok(r.p2 >= Math.ceil(n * 0.8), 'it gets him to The Railroad (' + r.p2 + '/' + n + ')');
    t.ok(r.p2 === 0 || r.switched >= Math.ceil(r.p2 * 0.5), 'AutoPlay pulls the Track Switch (' + r.switched + '/' + r.p2 + ')');
    t.ok(r.p3 >= Math.ceil(n * 0.5), 'and to phase 3 in most fights (' + r.p3 + '/' + n + ')');
    t.ok(r.p3 === 0 || r.engaged >= Math.ceil(r.p3 * 0.5), 'AutoPlay works the handbooks (' + r.engaged + '/' + r.p3 + ')');
    t.ok(r.rounds / n >= 5 && r.rounds / n <= 18, 'fight length ' + (r.rounds / n).toFixed(1) + ' rounds');
  });

  T.suite('boss_dm: AutoPlay sims with the real heroes (random parties, level 5): hard but fair', function (t) {
    const pool = Object.keys(DD.defs.heroes).filter(function (k) { return !/^test_/.test(k); });
    if (pool.length < 4) { t.skip('needs 4 real heroes (isolated run)'); return; }
    const n = +(t.param('n', 16));
    const lv = +(t.param('level', LV));
    const rng = DD.RNG('dm-real:' + t.seed);
    const r = sims(t, n, function () { return partyAt(lv, rng.sample(pool, 4)); }, 'real L' + lv);
    t.eq(r.timeouts, 0, 'no timeouts');
    t.eq(r.screens, n, 'the screen always comes down');
    t.ok(r.p2 === 0 || r.switched >= Math.ceil(r.p2 * 0.5), 'the party pulls the Track Switch (' + r.switched + '/' + r.p2 + ')');
    t.ok(r.p3 === 0 || r.engaged >= Math.ceil(r.p3 * 0.5), 'phase 3 is about the handbooks and the doom (' + r.engaged + '/' + r.p3 + ')');
    const rate = r.wins / n;
    t.ok(rate >= 0.35 && rate <= 0.95, 'a competent party wins most of the time, not always: ' + Math.round(rate * 100) + '%');
    t.ok(r.rounds / n >= 6 && r.rounds / n <= 14, 'fight length ' + (r.rounds / n).toFixed(1) + ' rounds');
  });

  // ---- diagnostics (skipped unless asked for) ------------------------------------------------------------------------
  T.suite('boss_dm: balance probe (diagnostic)', function (t) {
    if (t.param('probe', '0') !== '1') { t.skip('probe=1 to print where the damage comes from (real heroes: heroes=real)'); return; }
    const pool = Object.keys(DD.defs.heroes).filter(function (k) { return !/^test_/.test(k); });
    const real = t.param('heroes', 'real') === 'real' && pool.length >= 4;
    const n = +(t.param('n', 16)), lv = +(t.param('level', LV));
    const rng = DD.RNG('dm-probe:' + t.seed);
    const taken = {}, dealt = {}, per = { rounds: 0, wins: 0, downs: 0, p1: 0, p2: 0, p3: 0, landed: 0, landHits: 0 };
    const add = function (o, k, v) { o[k] = (o[k] || 0) + v; };
    for (let i = 0; i < n; i++) {
      const team = real ? partyAt(lv, rng.sample(pool, 4)) : partyAt(lv);
      const setup = DD.Encounter.build('boss_dm', team, { rng: DD.RNG('dm-probe:' + t.seed + ':' + i), difficulty: t.param('diff', 'normal'), act: 3 });
      DD.Combat.start(setup, { seed: 'dm-probe' + t.seed + ':' + i, headless: true, difficulty: t.param('diff', 'normal'), kind: 'boss' });
      const dm = dmUnit();
      DD.Act.addRule({ id: 'test_dm_probe', name: 'probe', hooks: {
        onTakeDamage: function (d) {
          const tg = d.target, src = d.source, tags = d.tags || [];
          if (tg === dm) {
            const k = tags.indexOf('dm_screen') >= 0 ? 'screen' : tags.indexOf('train') >= 0 ? 'diverted train' : tags.indexOf('rocks') >= 0 && !src ? 'lawyered' :
              src && src.side === 'hero' ? 'heroes' : 'other';
            add(dealt, k, d.dealt);
            return;
          }
          if (tg.side !== 'hero') return;
          let k = 'other (' + (d.cause || '?') + ')';
          if (src === dm) {
            // his wind-ups land in the start phase of his turn; everything after is what he does now
            const sid = String(d.skill ? (d.skill.id || d.skill) : tags.join('/')).replace('dm_', '');
            k = (S().current === dm.id && !S().turnLive ? 'DM wind-up ' : 'DM now ') + sid;
          } else if (src && src.side === 'enemy') k = 'cameos';
          add(taken, k, d.dealt);
        } } });
      let res;
      try { res = DD.AutoPlay.runBattle(30); } finally { DD.Act.removeRule('test_dm_probe'); }
      per.rounds += res.rounds;
      if (res.result === 'victory') per.wins++;
      per.downs += S().stats.downs || 0;
      const st = dm.data.stats;
      per.p1 += (st.phase2 || res.rounds + 1) - 1;
      per.p2 += st.phase2 ? (st.phase3 || res.rounds + 1) - st.phase2 : 0;
      per.p3 += st.phase3 ? res.rounds + 1 - st.phase3 : 0;
    }
    const fmt = function (o) { return Object.keys(o).sort(function (a, b) { return o[b] - o[a]; }).map(function (k) { return k + ' ' + (o[k] / n).toFixed(1); }).join(', '); };
    t.log((real ? 'real' : 'fixture') + ' L' + lv + ': wins ' + per.wins + '/' + n + ', rounds ' + (per.rounds / n).toFixed(1) + ' (phases ' + (per.p1 / n).toFixed(1) + ' / ' +
      (per.p2 / n).toFixed(1) + ' / ' + (per.p3 / n).toFixed(1) + '), downs ' + (per.downs / n).toFixed(1));
    t.log('hero-side HP lost per fight: ' + fmt(taken));
    t.log('DM HP lost per fight: ' + fmt(dealt));
    t.ok(true, 'probed');
  });

  T.suite('boss_dm: battle log (diagnostic)', function (t) {
    if (t.param('dump', '0') !== '1') { t.skip('dump=1 to print a full fight log'); return; }
    const ids = t.param('party', '') ? t.param('party', '').split(',') : null;
    if (t.param('simkey', '')) simStart(t.param('simkey', ''), partyAt(+t.param('level', LV), ids || PARTY));
    else startFight(t.param('fseed', 'dump' + t.param('dseed', '1')), { real: true, level: +t.param('level', LV), ids: ids });
    const dm = dmUnit();
    const from = +t.param('from', 0);
    // the harness prints 60 log lines a suite: one line per round, its turns separated by ' ‖ '
    let line = null;
    const flush = function () { if (line) t.log(line); line = null; };
    const off0 = DD.Events.on('round:start', function (e) { flush(); if (e.round >= from) line = 'R' + e.round + ':'; });
    const off = DD.Events.on('turn:start', function (e) {
      if (!line) return;
      const u = e.unit;
      line += ' ‖ ' + u.name + ' (' + u.hp + ')' + (u === dm && dm.intents.length ? ' ⏳' + dm.intents.map(function (i) { return i.label + ' ' + i.turnsLeft; }).join('/') : '') + ':';
    });
    const off2 = DD.Events.on('combat:log', function (e) {
      if (line && e.cls !== 'narrator' && !/Rule ended|is Slowed|is Bleeding|is Wet|rolls initiative|joins the fight/.test(e.text)) line += ' ' + e.text;
    });
    try { DD.AutoPlay.runBattle(+t.param('rounds', 30)); } finally { flush(); off0(); off(); off2(); }
    t.log('result: ' + S().result + ' in ' + S().round + ' rounds; DM ' + dm.hp + '; heroes ' + heroes().map(function (h) { return h.name + ' ' + h.hp + (h.downed ? ' (down)' : ''); }).join(', '));
    t.ok(true, 'dumped');
  });

  // ---- v2 user requests (Nov 3): map rotation (DM screen panels, the train), flyers over Cheeto dust ---------------
  // The painters as they were before the map could turn (A/B reference: the default view must stay pixel-identical).
  function oldP(u, v, h) { return [32 * (u - v), 16 * (u + v) - (h || 0)]; }
  function oldPanel(g, obj) {
    const c = g.ctx, H = 32, v0 = -0.02, v1 = 0.07, A = -0.47, B2 = 0.47, P = oldP;
    g.ellipse(0, 3, 24, 9, 'rgba(0,0,0,0.28)');
    g.poly([P(A, v0, H), P(B2, v0, H), P(B2, v1, H), P(A, v1, H)], '#d8c9a8', true);
    g.poly([P(B2, v0), P(B2, v1), P(B2, v1, H), P(B2, v0, H)], '#4a1019', true);
    g.poly([P(A, v1), P(B2, v1), P(B2, v1, H), P(A, v1, H)], '#7a1f2b', true);
    g.poly([P(A + 0.05, v1, 3), P(B2 - 0.05, v1, 3), P(B2 - 0.05, v1, H - 3), P(A + 0.05, v1, H - 3)], null, '#e8b84a');
    const m = P(0, v1, H / 2);
    c.save(); c.translate(m[0], m[1]); c.transform(1, 0.5, 0, 1, 0, 0);
    c.fillStyle = '#e8b84a';
    c.beginPath(); c.moveTo(-9, 3); c.quadraticCurveTo(-2, -9, 6, -4); c.lineTo(11, -9); c.lineTo(9, -1); c.quadraticCurveTo(2, 6, -9, 3); c.fill();
    c.beginPath(); c.moveTo(-2, -3); c.lineTo(-6, -12); c.lineTo(2, -5); c.fill();
    c.font = 'bold 7px "Trebuchet MS", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = '#ffe9a8'; c.fillText('DM', 0, 10);
    c.restore();
    if (obj.maxHp > 0 && obj.hp < obj.maxHp) {
      const k = 1 - obj.hp / obj.maxHp;
      g.line(P(-0.2, v1, H * 0.9)[0], P(-0.2, v1, H * 0.9)[1], P(0.05, v1, H * (0.9 - 0.5 * k))[0], P(0.05, v1, H * (0.9 - 0.5 * k))[1], '#1a1014', 1.4);
      if (k > 0.4) g.line(P(0.25, v1, H * 0.2)[0], P(0.25, v1, H * 0.2)[1], P(0.1, v1, H * 0.6)[0], P(0.1, v1, H * 0.6)[1], '#1a1014', 1.2);
    }
  }
  function oldTrain(c, x, y, p, view, evt) {
    const z = view.zoom || 1, dir = evt.dirX < 0 ? -1 : 1, ax = 32 * dir, ay = 16 * dir;
    const pt = function (a, b, h) { return [x + (ax * a - 32 * b) * z, y + (ay * a + 16 * b) * z - h * z]; };
    const block = function (a0, a1, b0, b1, h, top, side, end) {
      const face = function (pts, fill) {
        c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
        c.closePath(); c.fillStyle = fill; c.fill(); c.strokeStyle = '#1a1014'; c.lineWidth = 1.2 * z; c.stroke();
      };
      const ea = dir > 0 ? a1 : a0;
      face([pt(ea, b0, 0), pt(ea, b1, 0), pt(ea, b1, h), pt(ea, b0, h)], end);
      face([pt(a0, b1, 0), pt(a1, b1, 0), pt(a1, b1, h), pt(a0, b1, h)], side);
      face([pt(a0, b0, h), pt(a1, b0, h), pt(a1, b1, h), pt(a0, b1, h)], top);
    };
    c.save();
    for (let k = 0; k < 5; k++) {
      const q = pt(-0.15 - k * 0.32, -0.05, 34 + k * 6);
      c.fillStyle = 'rgba(235,235,240,' + (0.55 - k * 0.09) + ')';
      c.beginPath(); c.arc(q[0], q[1], (5 + k * 2.4) * z, 0, Math.PI * 2); c.fill();
    }
    const coal = function () { block(-2.1, -1.2, -0.26, 0.26, 16, '#c9a24f', '#8a5a2b', '#6a4520'); };
    if (dir > 0) coal();
    block(-1.1, 0.25, -0.28, 0.28, 18, '#3a3f4a', '#c0392b', '#7a1f2b');
    block(-1.1, -0.55, -0.3, 0.3, 30, '#2a2e36', '#a8302a', '#6a1a1a');
    block(-0.15, 0.05, -0.08, 0.08, 30, '#222', '#333', '#111');
    if (dir < 0) coal();
    const wheel = function (a) { const w = pt(a, 0.3, 4); c.fillStyle = '#ffd34d'; c.strokeStyle = '#1a1014'; c.lineWidth = 1.2 * z; c.beginPath(); c.arc(w[0], w[1], 4.5 * z, 0, Math.PI * 2); c.fill(); c.stroke(); };
    [-1.9, -1.4, -0.8, -0.3, 0.1].forEach(wheel);
    const lamp = pt(0.27, 0.1, 13);
    c.fillStyle = 'rgba(255,240,150,0.95)'; c.beginPath(); c.arc(lamp[0], lamp[1], 3.4 * z, 0, Math.PI * 2); c.fill();
    const label = pt(-0.45, 0.3, 11);
    c.font = 'bold ' + Math.round(7 * z) + 'px "Trebuchet MS", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = '#ffe9a8'; c.fillText('PLOT', label[0], label[1]);
    c.restore();
  }
  /** Pixels of one paint on a fresh 220×200 canvas. */
  function paint(fn) {
    const cv = document.createElement('canvas');
    cv.width = 220; cv.height = 200;
    const c = cv.getContext('2d');
    fn(c);
    return c.getImageData(0, 0, cv.width, cv.height).data;
  }
  function samePixels(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  function inked(d) { for (let i = 3; i < d.length; i += 4) if (d[i]) return true; return false; }

  T.suite('boss_dm: v2 requests (Nov 3) — screen panels and the train follow the map rotation; flyers over Cheeto dust', function (t) {
    const n0 = DD.problems.length;
    const b = B(), Iso = DD.Iso;
    const panel = { id: 'dm_screen_panel', hp: 3, maxHp: 10, data: {} };
    const panelAt = function (draw) { return function (c) { c.translate(110, 130); draw(Iso.painter(c, { t: 0 }), panel, 0); }; };
    // the default view: exactly the classic iso offsets, pixel for pixel
    Iso.withYaw(0, function () {
      [[0.47, 0.07, 32], [-0.47, -0.02, 0], [0.3, -0.2, 3], [0, 0.2, 6]].forEach(function (q) {
        const p = b.panelPt(q[0], q[1], q[2]), o = oldP(q[0], q[1], q[2]);
        t.ok(p[0] === o[0] && p[1] === o[1], 'yaw 0: panel point ' + q.join(', ') + ' is the classic offset');
      });
      [1, -1].forEach(function (dir) {
        const F = b.trainFrame(dir);
        t.ok(F.A.x === 32 * dir && F.A.y === 16 * dir && F.B.x === -32 && F.B.y === 16 && F.front === dir > 0 && F.side === 1, 'yaw 0: train frame (dir ' + dir + ') is the classic one');
      });
      t.ok(samePixels(paint(panelAt(b.drawPanel)), paint(panelAt(oldPanel))), 'yaw 0: a damaged DM Screen panel paints exactly as before');
      [1, -1].forEach(function (dir) {
        const ev = { dirX: dir };
        t.ok(samePixels(paint(function (c) { b.drawTrain(c, 110, 120, 0.5, { zoom: 1.5 }, ev); }), paint(function (c) { oldTrain(c, 110, 120, 0.5, { zoom: 1.5 }, ev); })),
          'yaw 0: the train (' + (dir > 0 ? 'eastbound' : 'westbound') + ') paints exactly as before');
      });
    });
    // every other view: grid directions through DD.Iso.local; the faces the viewer sees turn with the map
    [90, 180, 270, 37.5].forEach(function (yaw) {
      Iso.withYaw(yaw, function () {
        const L = Iso.local(0.47, 0.07), p = b.panelPt(0.47, 0.07, 10);
        t.ok(Math.abs(p[0] - L.x) < 1e-9 && Math.abs(p[1] - (L.y - 10)) < 1e-9, 'yaw ' + yaw + ': panel points follow the view');
        [1, -1].forEach(function (dir) {
          const F = b.trainFrame(dir), A = Iso.local(dir, 0), B2 = Iso.local(0, 1);
          t.ok(Math.abs(F.A.x - A.x) < 1e-9 && Math.abs(F.A.y - A.y) < 1e-9 && F.front === (A.y > 0) && F.side === (B2.y > 0 ? 1 : -1),
            'yaw ' + yaw + ' (dir ' + dir + '): the train runs along grid x, showing the end and side that face the viewer');
        });
        // the logo on the panel reads left to right whichever face is shown
        let logo = null;
        const px = paint(function (c) {
          const tr = c.transform;
          c.transform = function (a, bb, cc, d, e, f) { if (!logo) logo = [a, bb, cc, d]; return tr.call(c, a, bb, cc, d, e, f); };
          panelAt(b.drawPanel)(c);
        });
        t.ok(inked(px) && logo && logo[0] > 0, 'yaw ' + yaw + ': the panel paints, its logo reading left to right (' + (logo ? logo.map(function (v) { return +v.toFixed(2); }).join(',') : 'none') + ')');
        t.ok(inked(paint(function (c) { b.drawTrain(c, 110, 120, 0.5, { zoom: 1 }, { dirX: 1 }); })), 'yaw ' + yaw + ': the train paints');
      });
    });
    // a half-turned map shows the panel's other broad face: the picture is not the default view's
    const p0 = Iso.withYaw(0, function () { return paint(panelAt(b.drawPanel)); });
    const p180 = Iso.withYaw(180, function () { return paint(panelAt(b.drawPanel)); });
    t.ok(!samePixels(p0, p180), 'yaw 180 draws the panel from the other side');
    // Cheeto Fingers: dust Slows walkers on entry; flyers float over it (and the rule says so)
    t.ok(/flyers float over it/.test(b.HOUSE_RULES.filter(function (r) { return r.key === 'cheeto'; })[0].desc), 'Cheeto Fingers says flyers float over the dust');
    exposedFight(51);
    const walker = hero('test_knight'), flyer = hero('test_rogue');
    flyer.flags.flying = true;
    [walker, flyer].forEach(function (h) {
      const p = DD.Grid.emptyTilesNear(h.x, h.y, 2).filter(function (q) { return !DD.Grid.isDrop(q.x, q.y) && !DD.Grid.tile(q.x, q.y).obj; })[0];
      DD.Act.setSurface(p.x, p.y, 'cheeto', 2);
      act(function () { DD.Act.teleport(h, p.x, p.y, { fx: false }); });
    });
    t.ok(has(walker, 'slow') && !has(flyer, 'slow'), 'the walker stepping into the dust is Slowed, the flyer is not');
    t.eq(DD.problems.slice(n0).filter(function (p) { return /^Error in /.test(p); }).length, 0, 'no swallowed errors');
  });

  // ---- map rotation: box props turn with the board (rotation plan §7 P2: def.yawAware) ------------------------------
  /**
   * Pixels of an object def painted at `yaw` on a fresh 160×200 canvas (the feet at 80, 160; zoom 1.5), through the painter
   * the renderer hands it: the yawAware one when the def opts in, the billboard one when `billboard` is set.
   */
  function rotPx(id, inst, yaw, billboard) {
    const def = DD.getObject(id), cv = document.createElement('canvas');
    cv.width = 160; cv.height = 200;
    const c = cv.getContext('2d');
    c.translate(80, 160); c.scale(1.5, 1.5);
    const obj = Object.assign({ id: id, hp: 0, maxHp: 0, data: {} }, JSON.parse(JSON.stringify(inst || {})));
    DD.Iso.withYaw(yaw, function () {
      const g = DD.Iso.painter(c, { yawAware: !billboard && def.yawAware === true, t: 0.8 });
      g.obj = obj; g.tile = { x: 3, y: 4 }; g.zoom = 1.5; g.lw = 1.2; g.outline = '#1a1014';
      g.pal = def.colors || def.palette || {};
      def.draw.call(def, g, obj, 0.8);
    });
    return c.getImageData(0, 0, cv.width, cv.height).data;
  }
  function rotSame(a, b) { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; }
  /** Opaque pixels passing fn(r, g, b): how many, and their mean x (canvas px; the feet are at 80). */
  function rotCount(d, fn) {
    let n = 0, sx = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] === 255 && fn(d[i], d[i + 1], d[i + 2])) { n++; sx += (i / 4) % 160; }
    return { n: n, x: n ? sx / n : 0 };
  }
  function rotHex(hex) {
    const v = parseInt(hex.slice(1), 16);
    return function (r, g, b) { return r === (v >> 16) && g === ((v >> 8) & 255) && b === (v & 255); };
  }
  /**
   * Each case [id, inst]: the def opts in; at yaw 0 its turning painter draws exactly the billboard pixels (opting in never
   * changes the default view); it paints at every angle without throwing, and turns (30° differs from 0°).
   */
  function rotTurns(t, cases) {
    const yaws = [30, 37.5, 45, 90, 120, 180, 225, 270, 315];
    cases.forEach(function (cs) {
      const id = cs[0], inst = cs[1] || {}, tag = id + ' ' + JSON.stringify(inst.data || {}) + (inst.hp ? ' (' + inst.hp + ' HP)' : '');
      t.ok(!!DD.getObject(id) && DD.getObject(id).yawAware === true, tag + ': opts in (yawAware)');
      const p0 = t.tryRun(tag + ' at 0°', function () { return rotPx(id, inst, 0); });
      t.ok(!!p0 && rotSame(p0, rotPx(id, inst, 0, true)), 'yaw 0: ' + tag + ' paints exactly what the billboard painter paints');
      const bad = [];
      yaws.forEach(function (y) {
        const p = t.tryRun(tag + ' at ' + y + '°', function () { return rotPx(id, inst, y); });
        if (!p || !rotCount(p, function () { return true; }).n) bad.push(y);
        else if (y === 30 && p0 && rotSame(p, p0)) bad.push('30 (did not turn)');
      });
      t.eq(bad.join(','), '', tag + ' paints at ' + yaws.join(' / ') + '° and turns with the map');
    });
  }

  T.suite('boss_dm: handbooks, track switches and sourcebook stacks turn with the map (box props, yawAware)', function (t) {
    if (!DD.Iso || !DD.Iso.withYaw || !DD.getObject('dm_book_stack')) { t.skip('map views or boss content not loaded'); return; }
    const n0 = DD.problems.length;
    rotTurns(t, [['dm_handbook', {}], ['dm_handbook', { data: { used: true } }], ['dm_track_switch', {}], ['dm_track_switch', { data: { on: true } }],
      ['dm_book_stack', { data: { seed: 0 } }], ['dm_book_stack', { data: { seed: 1 } }]]);
    // the crossing sign's post stands at the base's back corner: right of it by default, left of it at 180°
    const post = rotHex('#e8e2d0'), p0 = rotCount(rotPx('dm_track_switch', {}, 0), post), p180 = rotCount(rotPx('dm_track_switch', {}, 180), post);
    t.ok(p0.n > 10 && p180.n > 10 && p0.x > 80 && p180.x < 80, 'the crossing sign walks round the switch (x ' + p0.x.toFixed(1) + ' -> ' + p180.x.toFixed(1) + ')');
    // a sourcebook keeps its spine on the east side: in view at 90° (the left face), page edges all round at 180°
    const spine = rotHex('#2d4f8a'), st = { data: { seed: 0 } };
    const k90 = rotCount(rotPx('dm_book_stack', st, 90), spine).n, k180 = rotCount(rotPx('dm_book_stack', st, 180), spine).n;
    t.ok(k90 > 10 && k180 === 0, 'the bottom book\'s spine faces east (' + k90 + ' px at 90°, ' + k180 + ' at 180°)');
    t.eq(DD.problems.slice(n0).filter(function (p) { return /^Error in /.test(p); }).length, 0, 'no swallowed errors');
  }, { tags: ['render'] });
})();
