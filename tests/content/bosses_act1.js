/* Dungeons and Degenerates — tests/content/bosses_act1.js
 * Suites "bosses_act1: …" for the Act 1 bosses (js/data/bosses/grimble.js, js/data/bosses/ratking.js):
 * arenas, pattern rotation, every attack's numbers vs its desc, phase transitions, minion caps, both puzzles step by
 * step (incl. AutoPlay hints), previews, edge cases, stun guards, target-dependent telegraph numbers and AutoPlay
 * balance sims with the fixture party at level 4.
 * Params (balance work only): sims=<n> fights per boss (default 8) · level=<n> · dmglog=1 (damage taken by source, and
 * where the party's damage went) · hplog=<i> (per-round positions/HP/intents of fight i) · fightlog=<i> ·
 * tune=<def.path:value,...> (temporarily overrides skill/enemy/object/status def numbers or the bosses' knobs for the
 * sims, e.g. grcfg.noHint:1 / rkcfg.noHint:1 = AutoPlay ignores the puzzle).
 */
(function () {
  'use strict';
  const T = window.DD_TEST;
  const DD = window.DD;
  const PARTY = ['test_knight', 'test_cleric', 'test_mage', 'test_rogue'];

  /**
   * Safety net: the core suite 'run: boss unlocks' (tests/run_tests.js) used to leak a stub 'grimble' enemy into later
   * suites. Its sandbox now swaps DD.defs.enemies too (integration fix), so this is a no-op kept as a guard.
   */
  function realDefs() {
    const G = DD.GrimbleBoss;
    if (G && G.def && DD.defs.enemies.grimble !== G.def) DD.defs.enemies.grimble = G.def;
  }
  function have() { realDefs(); return !!(DD.getEnemy('grimble') && DD.getEnemy('rat_king') && DD.getHero('test_knight')); }

  /**
   * Run heroes like the debug party at `level`: starting skills + one pool skill (all level 1). With an rng (balance
   * sims) the extra pool skill and the deployment order vary, since combat itself has no dice.
   */
  function runParty(level, rng, heroIds) {
    const base = heroIds && heroIds.length ? heroIds : PARTY;
    const ids = rng ? rng.shuffle(base.slice()) : base.slice();
    return ids.map(function (id) {
      const h = DD.getHero(id);
      const pool = (h.skillPool || []).filter(function (s) { return h.startingSkills.indexOf(s) < 0; });
      const extra = rng ? [pool[rng.int(0, pool.length - 1)]] : pool.slice(0, 1);
      return DD.Combat.makeRunHero({ id: id, level: level, skills: h.startingSkills.concat(extra.filter(Boolean)) });
    });
  }
  /** Build + start a boss encounter. opts.vary: randomized party (sims); other opts go to Combat.start. */
  function start(encId, seed, opts) {
    opts = Object.assign({}, opts || {});
    const rng = DD.RNG('ba1:' + encId + ':' + seed);
    const party = runParty(opts.level || 4, opts.vary ? rng.fork('party') : null, opts.party);
    delete opts.vary; delete opts.level; delete opts.party;
    const setup = DD.Encounter.build(encId, party, { rng: rng, difficulty: 'normal', act: 1 });
    start.lastSetup = setup;
    return DD.Combat.start(setup, Object.assign({ seed: seed, headless: true, difficulty: 'normal', kind: 'boss' }, opts));
  }
  /** Intents a planner call added (new ids only). */
  function planned(u) {
    const before = (u.intents || []).map(function (it) { return it.id; });
    DD.AI.plan(u);
    return (u.intents || []).filter(function (it) { return before.indexOf(it.id) < 0; });
  }
  function ids(list) { return list.map(function (it) { return it.skillId; }).join('+'); }
  function byDef(id) { return DD.Combat.state.units.filter(function (u) { return u.defId === id && !u.dead; }); }
  function hero(id) { return byDef(id)[0]; }
  function tile(x, y) { return DD.Grid.tile(x, y); }
  /** Put a unit somewhere directly (tests only), moving whoever stands there out of the way first. */
  function place(u, x, y) {
    const other = DD.Grid.unitAt(x, y);
    if (other && other !== u) { const f = DD.Grid.nearestFree(20, 20) || { x: 0, y: 0 }; other.x = f.x; other.y = f.y; }
    u.x = x; u.y = y;
    if (DD.FX && DD.FX.syncVis) DD.FX.syncVis(u);
  }
  function park(units, spots) { units.forEach(function (u, i) { place(u, spots[i].x, spots[i].y); }); }
  /** No leftover AP → no Guard Block, so damage checks read straight off HP. */
  function noGuard() { DD.Combat.active('hero').forEach(function (u) { u.ap = 0; }); }
  function intentsOf(u, skillId) { return (u.intents || []).filter(function (it) { return !skillId || it.skillId === skillId; }); }
  function only(u, skillId) { u.intents = intentsOf(u, skillId); }
  function slotOf(u, id) { return DD.Combat.slotsOf(u).filter(function (sl) { return sl.id === id; })[0]; }
  function use(u, id, target) { return DD.Combat._action(function () { return DD.Combat.resolveSkill(u, slotOf(u, id), target, {}); }); }
  function isLane(tiles) {
    const row = tiles.every(function (p) { return p.y === tiles[0].y; }), col = tiles.every(function (p) { return p.x === tiles[0].x; });
    return row ? 'row' : col ? 'col' : null;
  }

  // =====================================================================================================
  // GRIMBLE
  // =====================================================================================================
  const GB = function () { return DD.GrimbleBoss; };
  const ZONE = [[4, 2], [5, 2], [6, 2], [4, 3], [5, 3], [6, 3]];
  const LEVERS = [[10, 3], [1, 4], [6, 7]];
  const FAR = [{ x: 1, y: 11 }, { x: 11, y: 10 }, { x: 11, y: 11 }];

  T.suite('bosses_act1: grimble registry, arena and encounter', function (t) {
    if (!have()) { t.skip('boss content not loaded'); return; }
    ['grimble', 'grim_intern'].forEach(function (id) { t.ok(!!DD.getEnemy(id), 'enemy ' + id); });
    ['grim_levy', 'grim_audit', 'grim_stamp', 'grim_hire', 'grim_redtape', 'grim_papercut', 'grim_refile'].forEach(function (id) {
      const s = DD.getSkill(id);
      t.ok(!!s && s.owner === 'enemy', 'skill ' + id);
      if (s) for (let lv = 1; lv <= s.levels.length; lv++) {
        t.ok(/\S/.test(DD.skillDesc(s, lv, null)) && !/undefined|NaN/.test(DD.skillDesc(s, lv, null)), id + ' L' + lv + ' desc without a user');
      }
    });
    ['grim_loophole', 'grim_vault', 'grim_desk', 'grim_cabinet'].forEach(function (id) { t.ok(!!DD.getObject(id), 'object ' + id); });
    t.ok(!!DD.getTerrain('grim_dropzone'), 'terrain grim_dropzone');
    ['grim_takeover', 'grim_ledger'].forEach(function (id) { t.ok(!!DD.getStatus(id), 'status ' + id); });
    const g = DD.getEnemy('grimble');
    t.ok(g === GB().def && typeof g.ai === 'function', 'the registered Grimble is the real one (not a leaked test stub)');
    t.eq(g.tier, 'boss', 'boss tier');
    t.ok(g.hp >= 150 && g.hp <= 200, 'Act 1 boss HP 150-200: ' + g.hp);
    t.ok(g.boss && g.boss.title && g.boss.intro, 'boss title + intro');
    t.ok(g.sprite.scale >= 1.8 && g.sprite.scale <= 2.4, 'boss-size sprite');
    ['spawn', 'attack', 'hurt', 'death', 'phase', 'vault'].forEach(function (k) {
      t.ok(Array.isArray(g.barks[k]) && g.barks[k].length >= 2 && g.barks[k].every(function (b) { return b.length <= 70; }), 'grimble barks.' + k + ' (2+, ≤70 chars)');
    });
    const ib = DD.getEnemy('grim_intern').barks;
    ['spawn', 'attack', 'hurt', 'death'].forEach(function (k) { t.ok(ib[k].length >= 2 && ib[k].every(function (b) { return b.length <= 70; }), 'intern barks.' + k); });
    const enc = DD.getEncounter('boss_grimble');
    t.ok(enc && enc.kind === 'boss' && enc.act === 1 && enc.objective.type === 'boss', 'encounter boss_grimble (act 1 boss)');
    t.ok(/30|36/.test(DD.getObject('grim_loophole').desc) && /DROP ZONE/.test(DD.getObject('grim_loophole').desc), 'loophole desc explains the drop');
    t.ok(new RegExp('takes ' + GB().VAULT_DMG + ' damage').test(DD.getTerrain('grim_dropzone').desc), 'drop zone desc shows the real damage');

    const s = start('boss_grimble', 1);
    t.eq(DD.Combat.state, s, 'fight started');
    t.eq(GB().zoneTiles(s).length, 6, '6 DROP ZONE tiles');
    ZONE.forEach(function (p) { t.eq(tile(p[0], p[1]).t, 'grim_dropzone', 'zone tile ' + p); });
    const ls = GB().loopholes(s);
    t.eq(ls.length, 3, 'three Tax Loopholes');
    LEVERS.forEach(function (p) { t.ok(ls.some(function (l) { return l.x === p[0] && l.y === p[1]; }), 'loophole at ' + p); });
    t.ok(ls.every(function (l) { return l.obj.data.name && /^Tax Loophole: /.test(l.obj.label); }), 'loopholes are named and labelled');
    t.ok(!!GB().vaultTile(s), 'the vault is on the map');
    const sp = start.lastSetup.enemies.filter(function (e) { return e.id === 'grimble'; })[0];
    t.ok(sp && sp.x === 5 && sp.y === 3, 'Grimble is placed on the B mark in the DROP ZONE');
    const boss = byDef('grimble')[0];
    t.ok(boss && GB().zoneTiles(s).some(function (p) { return p.x === boss.x && p.y === boss.y; }), 'and is still in the zone after planning');
    t.eq(DD.Combat.heroes().length, 4, 'four heroes deployed');
    t.ok(s.deploy.tiles.length >= 8, 'deploy zone ' + s.deploy.tiles.length);
    t.ok(s.log.some(function (l) { return l.cls === 'narrator' && /LOOPHOLE/.test(l.text); }), 'the DM hints at the loopholes at the start');
    const v = DD.MapGen.validate({ grid: s.grid, heroZone: s.heroZone || [], enemyZone: s.enemyZone || [] }, { layout: true });
    t.ok(v.ok, 'arena layout validates: ' + v.problems.join('; '));
    t.ok(DD.Grid.los({ x: 5, y: 3 }, { x: 5, y: 7 }), 'LOS down the middle from the desk');
    t.ok(!DD.Grid.los({ x: 5, y: 3 }, { x: 2, y: 9 }), 'the filing cabinets give cover from his desk');
  });

  T.suite('bosses_act1: grimble pattern rotation (levy + audit every round, red tape / hire, stamp, caps)', function (t) {
    if (!have()) { t.skip('boss content not loaded'); return; }
    start('boss_grimble', 2, { noPlan: true });
    const boss = byDef('grimble')[0];
    const k = hero('test_knight'), c = hero('test_cleric'), m = hero('test_mage'), r = hero('test_rogue');
    park([c, m, r], FAR);
    place(k, 5, 7);
    const seq = [];
    for (let i = 0; i < 4; i++) seq.push(ids(planned(boss)));
    // (the Levy is planned last, so the gold it pockets never changes an earlier attack's telegraphed number)
    t.eq(seq[0], 'grim_audit+grim_redtape+grim_levy', 'round 1: Audit + Red Tape + Levy');
    t.eq(seq[1], 'grim_audit+grim_hire+grim_levy', 'round 2: Audit + Hire Intern + Levy');
    t.eq(seq[2], 'grim_redtape+grim_levy', 'round 3: two audits already on the board (phase 1 cap), so Red Tape + Levy');
    t.eq(seq[3], 'grim_hire+grim_levy', 'round 4: Hire + Levy');
    const lv = intentsOf(boss, 'grim_levy')[0];
    t.ok(lv.anchor === 'unit' && lv.unitId === k.id, 'Levy tracks the hero');
    const au = intentsOf(boss, 'grim_audit');
    t.eq(au.length, 2, 'two pending audits');
    t.ok(au.every(function (it) { return it.anchor === 'ground' && it.pending && it.delay === 1; }), 'audits are delayed (⏳1) ground telegraphs');
    t.ok(au.every(function (it) { return isLane(it.tiles) && it.tiles.length === 11; }), 'each audit covers a whole row or column (11 tiles)');
    const heroes = [k, c, m, r];
    t.ok(au.every(function (it) { return heroes.some(function (h) { return it.tiles.some(function (p) { return p.x === h.x && p.y === h.y; }); }); }), 'every audited lane holds a hero');
    t.ok(au[0].data.lane !== au[1].data.lane, 'never the same lane twice');
    t.ok(DD.GrimbleBoss.zoneTiles().some(function (p) { return p.x === boss.x && p.y === boss.y; }), 'phase 1: Grimble never leaves the DROP ZONE');
    // stamp: a hero next to him → shockwave on all 4 adjacent tiles
    boss.intents = [];
    place(m, 4, 3);
    const st = planned(boss).filter(function (it) { return it.skillId === 'grim_stamp'; })[0];
    t.ok(!!st && st.anchor === 'self', 'Rubber Stamp telegraphed (anchored to Grimble)');
    const tiles = st ? DD.AI.intentTiles(boss, st) : [];
    t.eq(tiles.length, 4, 'stamp covers the 4 adjacent tiles');
    t.ok(tiles.some(function (p) { return p.x === m.x && p.y === m.y; }), 'including the adjacent hero');
    // the rooted hero attracts the audits
    boss.intents = [];
    boss.data.patIdx = 0;
    DD.Act.addStatus(c, 'root', { turns: 2 }, boss);
    place(c, 3, 9); place(k, 8, 7);
    const lanes = planned(boss).filter(function (it) { return it.skillId === 'grim_audit'; });
    t.ok(lanes.length === 1 && lanes[0].tiles.some(function (p) { return p.x === c.x && p.y === c.y; }), 'a hero stuck in Red Tape gets audited first');
    // works without his office (sandbox)
    DD.Combat.sandbox({ w: 11, h: 11, seed: 3, heroes: [{ id: 'test_mage', x: 1, y: 1, level: 4 }], enemies: [{ id: 'grimble', x: 9, y: 9 }], noPlan: true });
    const b2 = byDef('grimble')[0];
    t.ok(planned(b2).length > 0, 'without his office (sandbox) Grimble still plans');
  });

  T.suite('bosses_act1: grimble attacks deal exactly what they say', function (t) {
    if (!have()) { t.skip('boss content not loaded'); return; }
    // Levy: damage + gold + Block (half the gold)
    let s = start('boss_grimble', 3, { noPlan: true });
    let boss = byDef('grimble')[0];
    const c = hero('test_cleric');
    park(['test_knight', 'test_mage', 'test_rogue'].map(hero), FAR);
    place(c, 5, 7);
    s.sandboxGold = 20;
    const L1 = DD.skillLevel(DD.getSkill('grim_levy'), 1);
    DD.AI.plan(boss);
    t.eq(intentsOf(boss, 'grim_levy').length, 1, 'levy planned');
    t.eq(DD.AI.describe(boss, intentsOf(boss, 'grim_levy')[0]).dmg, L1.dmg, 'telegraph shows ' + L1.dmg);
    only(boss, 'grim_levy');
    noGuard();
    let hp0 = c.hp;
    DD.Combat.endTurn();
    t.eq(hp0 - c.hp, L1.dmg, 'Levy deals ' + L1.dmg);
    t.eq(DD.Act.gold(), 20 - L1.gold, 'Levy steals ' + L1.gold + ' gold');
    t.eq(boss.data.stolen, L1.gold, 'stolen gold is on the books');
    t.eq((DD.Act.getStatus(boss, 'grim_ledger') || {}).stacks, L1.gold, 'Ill-Gotten Gains shows the stolen gold');
    t.eq(boss.block, Math.ceil(L1.gold / 2), 'Levy buys 1 Block per 2 gold (' + Math.ceil(L1.gold / 2) + ', lasts through the player phase)');
    // gold runs dry: steals what is there
    s.sandboxGold = 3;
    boss.intents = [];
    DD.AI.plan(boss);
    only(boss, 'grim_levy');
    noGuard();
    DD.Combat.endTurn();
    t.eq(DD.Act.gold(), 0, 'steals up to the gold the party has');
    t.eq(boss.data.stolen, L1.gold + 3, 'running total');
    t.eq(boss.block, 2, '3 gold buys 2 Block (rounded up)');
    // broke party: no Block at all
    boss.intents = [];
    DD.AI.plan(boss);
    only(boss, 'grim_levy');
    noGuard();
    DD.Combat.endTurn();
    t.eq(boss.block, 0, 'a broke party gives him nothing to buy Block with');
    // Levy fizzles when the target breaks line of sight
    boss.intents = [];
    DD.AI.plan(boss);
    t.ok(intentsOf(boss, 'grim_levy').length === 1, 'levy planned again');
    only(boss, 'grim_levy');
    place(c, 2, 9);
    hp0 = c.hp;
    noGuard();
    DD.Combat.endTurn();
    t.eq(c.hp, hp0, 'the tracked hero hid behind a filing cabinet: Levy fizzles');

    // Red Tape: damage + Root 2 turns
    s = start('boss_grimble', 4, { noPlan: true });
    boss = byDef('grimble')[0];
    let m = hero('test_mage');
    park(['test_knight', 'test_cleric', 'test_rogue'].map(hero), FAR);
    place(m, 6, 8);
    DD.AI.plan(boss);
    t.eq(intentsOf(boss, 'grim_redtape').length, 1, 'red tape planned');
    only(boss, 'grim_redtape');
    const RL = DD.skillLevel(DD.getSkill('grim_redtape'), 1);
    hp0 = m.hp;
    noGuard();
    DD.Combat.endTurn();
    t.eq(hp0 - m.hp, RL.dmg, 'Red Tape deals ' + RL.dmg);
    const rt = DD.Act.getStatus(m, 'root');
    t.ok(rt && rt.turns === RL.turns, 'and Roots for ' + RL.turns + ' turns');
    m.ap = 3;
    t.eq(DD.Combat.reachable(m).size, 0, 'a rooted hero cannot walk away');

    // Audit: 20 to every hero in the lane after the countdown, nobody else
    s = start('boss_grimble', 5, { noPlan: true });
    boss = byDef('grimble')[0];
    const h = PARTY.map(hero);
    place(h[1], 2, 7); place(h[2], 9, 7); place(h[0], 1, 10); place(h[3], 11, 11);
    DD.AI.plan(boss);
    only(boss, 'grim_audit');
    const au = intentsOf(boss, 'grim_audit')[0];
    t.ok(!!au && au.delay === 1, 'audit planned with ⏳1');
    t.eq(au.tiles[0].y, 7, 'the row with two heroes is audited');
    const AL = DD.skillLevel(DD.getSkill('grim_audit'), 1);
    const hpA = h.map(function (u) { return u.hp; });
    noGuard();
    DD.Combat.endTurn();
    t.eq(h[1].hp, hpA[1], 'countdown round: nothing happens yet');
    t.ok(intentsOf(boss, 'grim_audit').some(function (it) { return it.pending && it.delay === 0; }), 'audit is now charged (fires this enemy turn)');
    only(boss, 'grim_audit');
    boss.intents = boss.intents.filter(function (it) { return it.id === au.id; });
    place(h[1], 2, 7); place(h[2], 9, 7); place(h[0], 1, 10); place(h[3], 11, 11);
    noGuard();
    DD.Combat.endTurn();
    t.eq(hpA[1] - h[1].hp, AL.dmg, 'cleric in the lane takes ' + AL.dmg);
    t.eq(hpA[2] - h[2].hp, AL.dmg, 'mage in the lane takes ' + AL.dmg);
    t.eq(h[0].hp, hpA[0], 'knight outside the lane untouched');

    // Rubber Stamp: 14 to every adjacent hero + knockback 2
    s = start('boss_grimble', 6, { noPlan: true });
    boss = byDef('grimble')[0];
    m = hero('test_mage');
    const cc = hero('test_cleric');
    park(['test_knight', 'test_rogue'].map(hero), FAR);
    place(m, 4, 3); place(cc, 6, 3);
    DD.AI.plan(boss);
    t.ok(intentsOf(boss, 'grim_stamp').length === 1, 'stamp planned');
    only(boss, 'grim_stamp');
    const SL = DD.skillLevel(DD.getSkill('grim_stamp'), 1);
    hp0 = m.hp;
    const hc = cc.hp;
    noGuard();
    DD.Combat.endTurn();
    t.eq(hp0 - m.hp, SL.dmg, 'stamp deals ' + SL.dmg + ' to the west neighbour');
    t.eq(hc - cc.hp, SL.dmg, 'and to the east neighbour');
    t.ok(m.x === 4 - SL.push && m.y === 3, 'knocked back ' + SL.push + ' tiles: ' + m.x + ',' + m.y);
    t.ok(cc.x === 6 + SL.push && cc.y === 3, 'both ways: ' + cc.x + ',' + cc.y);
    // stepping away from the stamp makes it whiff
    s = start('boss_grimble', 7, { noPlan: true });
    boss = byDef('grimble')[0];
    const m2 = hero('test_mage');
    place(m2, 4, 3);
    DD.AI.plan(boss);
    only(boss, 'grim_stamp');
    place(m2, 2, 6);
    hp0 = m2.hp;
    noGuard();
    DD.Combat.endTurn();
    t.eq(m2.hp, hp0, 'a hero who steps out of the stamp is not hit');

    // Hire Intern: 2 per hire at the break-room doors, named
    s = start('boss_grimble', 8, { noPlan: true });
    boss = byDef('grimble')[0];
    use(boss, 'grim_hire', boss);
    const ints = byDef('grim_intern');
    const HL = DD.skillLevel(DD.getSkill('grim_hire'), 1);
    t.eq(ints.length, HL.n, 'Hire Intern hires ' + HL.n);
    t.ok(ints.every(function (u) { return /^Intern /.test(u.name); }), 'interns have names: ' + ints.map(function (u) { return u.name; }).join(', '));
    t.ok(ints.every(function (u) { return tile(u.x, u.y).tag === 'grim_door'; }), 'they arrive at the break-room doors');
  });

  T.suite('bosses_act1: grimble interns (cap, papercut, closing loopholes)', function (t) {
    if (!have()) { t.skip('boss content not loaded'); return; }
    start('boss_grimble', 9, { noPlan: true });
    const boss = byDef('grimble')[0];
    const HL = DD.skillLevel(DD.getSkill('grim_hire'), 1);
    for (let i = 0; i < 4; i++) use(boss, 'grim_hire', boss);
    t.eq(byDef('grim_intern').length, HL.cap, 'never more than ' + HL.cap + ' interns in phase 1');
    t.eq(DD.getEnemy('grim_intern').hp, byDef('grim_intern')[0].maxHp, 'intern HP ' + DD.getEnemy('grim_intern').hp);
    // papercut numbers
    const intern = byDef('grim_intern')[0];
    const m = hero('test_mage');
    place(intern, 7, 8); place(m, 7, 9);
    byDef('grim_intern').slice(1).forEach(function (u) { DD.Act.kill(u, null); });
    intern.intents = [];
    DD.AI.plan(intern);
    t.ok(intentsOf(intern, 'grim_papercut').length === 1, 'intern plans Paper Cut on the adjacent hero');
    const PL = DD.skillLevel(DD.getSkill('grim_papercut'), 1);
    boss.intents = [];
    DD.Act.addStatus(boss, 'stun', { turns: 1 }, null);
    const hp0 = m.hp;
    noGuard();
    DD.Combat.endTurn();
    t.eq(hp0 - m.hp, PL.dmg, 'Paper Cut deals ' + PL.dmg);
    t.ok(DD.Act.hasStatus(m, 'bleed'), 'and Bleeds');

    // closing a loophole
    start('boss_grimble', 10, { noPlan: true });
    const b2 = byDef('grimble')[0];
    const lever = DD.GrimbleBoss.loopholes()[0];      // (10,3)
    lever.obj.data.on = true;
    const iu = DD.Act.spawn('grim_intern', 10, 2, { silent: true });
    DD.AI.plan(iu);
    const rf = intentsOf(iu, 'grim_refile')[0];
    t.ok(!!rf && rf.abs.x === lever.x && rf.abs.y === lever.y, 'intern next to an exploited loophole telegraphs Close Loophole on it');
    t.ok(DD.AI.intentTiles(iu, rf).some(function (p) { return p.x === lever.x && p.y === lever.y; }), 'the lever tile is marked');
    b2.intents = [];
    DD.Act.addStatus(b2, 'stun', { turns: 1 }, null);
    noGuard();
    DD.Combat.endTurn();
    t.eq(lever.obj.data.on, false, 'the intern closed the loophole');
    t.eq(DD.GrimbleBoss.data().refiles, 1, 'refile counted');
    t.ok(!/EXPLOITED/.test(lever.obj.label), 'label updated');
    // shoved away first: it fizzles
    lever.obj.data.on = true;
    iu.intents = [];
    place(iu, 10, 2);
    DD.AI.plan(iu);
    t.ok(intentsOf(iu, 'grim_refile').length === 1, 'refile planned again');
    place(iu, 8, 2);
    b2.intents = [];
    DD.Act.addStatus(b2, 'stun', { turns: 1 }, null);
    noGuard();
    DD.Combat.endTurn();
    t.eq(lever.obj.data.on, true, 'an intern pushed away from the lever cannot close it');
    // stunned: cancelled at once
    iu.intents = [];
    place(iu, 10, 2);
    DD.AI.plan(iu);
    DD.Act.addStatus(iu, 'stun', { turns: 1 }, null);
    t.eq(intentsOf(iu).length, 0, 'stunning the intern cancels its paperwork');
    // walks over from afar
    DD.Act.removeStatus(iu, 'stun', { silent: true });
    place(iu, 11, 9);
    iu.intents = [];
    const d0 = DD.Grid.dist(iu, lever);
    DD.AI.plan(iu);
    t.ok(DD.Grid.dist(iu, lever) < d0, 'an intern walks toward an exploited loophole (' + d0 + ' → ' + DD.Grid.dist(iu, lever) + ')');
    // two interns never chase the same lever
    const iu2 = DD.Act.spawn('grim_intern', 9, 2, { silent: true });
    place(iu, 11, 3); iu.intents = [];
    DD.AI.plan(iu);
    iu2.intents = [];
    DD.AI.plan(iu2);
    t.ok(intentsOf(iu, 'grim_refile').length + intentsOf(iu2, 'grim_refile').length <= 1, 'one intern per exploited loophole');
  });

  T.suite('bosses_act1: grimble phase 2 (hostile takeover)', function (t) {
    if (!have()) { t.skip('boss content not loaded'); return; }
    start('boss_grimble', 11, { noPlan: true });
    const boss = byDef('grimble')[0];
    const k = hero('test_knight'), c = hero('test_cleric'), m = hero('test_mage'), r = hero('test_rogue');
    place(k, 3, 7); place(c, 8, 9); place(m, 2, 10); place(r, 10, 11);
    boss.hp = Math.floor(boss.maxHp * DD.GrimbleBoss.PHASE2_AT);
    const p1 = planned(boss);
    t.eq(boss.data.phase, 2, 'at 50%: phase 2');
    t.ok(DD.Act.hasStatus(boss, 'grim_takeover'), 'Hostile Takeover status shows the phase');
    const ints = byDef('grim_intern');
    t.eq(ints.length, 2, 'two interns hired on the spot');
    t.ok(ints.every(function (u) { return DD.Act.hasStatus(u, 'haste'); }), 'phase 2 interns arrive Hasted');
    t.eq(slotOf(boss, 'grim_hire').level, 2, 'Hire Intern upgraded to its phase 2 numbers');
    const au = p1.filter(function (it) { return it.skillId === 'grim_audit'; });
    t.eq(au.length, 2, 'double audit');
    t.eq(au.map(function (it) { return isLane(it.tiles); }).sort().join(','), 'col,row', 'a row and a column');
    t.ok(au.every(function (it) { return it.delay === 1; }), 'both delayed');
    t.ok(!DD.GrimbleBoss.zoneTiles().some(function (p) { return p.x === boss.x && p.y === boss.y; }), 'phase 2: he leaves his desk to go stamping');
    t.ok(!p1.some(function (it) { return it.skillId === 'grim_levy'; }), 'no more plain Levy in phase 2...');
    const gw = p1.filter(function (it) { return it.skillId === 'grim_garnish'; })[0];
    const GW = DD.skillLevel(DD.getSkill('grim_garnish'), 1);
    t.ok(!!gw && gw.anchor === 'unit', '...he Garnishes Wages instead (tracking)');
    if (gw) t.eq(DD.AI.describe(boss, gw).dmg, GW.dmg, 'Garnish Wages telegraphs ' + GW.dmg);
    t.ok(/up to 15 party gold/.test(DD.skillDesc(DD.getSkill('grim_garnish'), 1, null)) && /no line of sight/.test(DD.skillDesc(DD.getSkill('grim_garnish'), 1, null)), 'its desc shows the bigger levy and the reach');
    // the hiring step: back to the desk
    const p2 = planned(boss);
    t.ok(p2.some(function (it) { return it.skillId === 'grim_hire'; }), 'phase 2 step 2: Hire Interns');
    t.ok(DD.GrimbleBoss.zoneTiles().some(function (p) { return p.x === boss.x && p.y === boss.y; }) || DD.Grid.dist(boss, { x: 5, y: 3 }) <= 3, 'he walks back to his desk to file the hiring forms');
    // the hire cap rises
    const H2 = DD.skillLevel(DD.getSkill('grim_hire'), 2);
    for (let i = 0; i < 3; i++) use(boss, 'grim_hire', boss);
    t.eq(byDef('grim_intern').length, H2.cap, 'never more than ' + H2.cap + ' interns in phase 2');
    // the takeover happens once
    planned(boss);
    t.eq(byDef('grim_intern').length, H2.cap, 'no second takeover');
    t.ok(DD.Combat.state.log.some(function (l) { return /HOSTILE TAKEOVER/.test(l.text); }), 'the takeover is announced in the log');
  });

  T.suite('bosses_act1: grimble ill-gotten gains, garnish wages and the vault refund', function (t) {
    if (!have()) { t.skip('boss content not loaded'); return; }
    const G = DD.GrimbleBoss;
    const s = start('boss_grimble', 14, { noPlan: true });
    const boss = byDef('grimble')[0];
    const k = hero('test_knight'), c = hero('test_cleric'), m = hero('test_mage'), r = hero('test_rogue');
    park([k, m, r], FAR);
    place(c, 5, 7);
    boss.mov = 0;
    s.sandboxGold = 200;
    const L1 = DD.skillLevel(DD.getSkill('grim_levy'), 1);
    const gains = function (held) { return Math.min(G.GAIN_MAX, Math.floor(held / G.GAIN_PER)); };
    // first Levy: nothing pocketed yet
    DD.AI.plan(boss); only(boss, 'grim_levy'); noGuard();
    let hp0 = c.hp;
    DD.Combat.endTurn();
    t.eq(hp0 - c.hp, L1.dmg, 'first Levy deals ' + L1.dmg + ' (nothing pocketed yet)');
    t.eq(boss.data.stolen, L1.gold, 'he now holds ' + L1.gold + ' gold');
    const b1 = gains(L1.gold);
    t.ok(b1 >= 1, 'holding ' + L1.gold + ' gold is worth +' + b1);
    t.ok(new RegExp('\\+' + b1 + ' damage').test(DD.getStatus('grim_ledger').desc(DD.Act.getStatus(boss, 'grim_ledger'))), 'Ill-Gotten Gains shows the bonus');
    // the telegraph tells the truth, and the hit matches it
    boss.intents = [];
    DD.AI.plan(boss);
    const lv = intentsOf(boss, 'grim_levy')[0];
    t.eq(lv ? DD.AI.describe(boss, lv).dmg : 0, L1.dmg + b1, 'the next Levy telegraphs ' + (L1.dmg + b1));
    only(boss, 'grim_levy'); noGuard();
    hp0 = c.hp;
    DD.Combat.endTurn();
    t.eq(hp0 - c.hp, L1.dmg + b1, 'and deals exactly that');
    // every attack gets it, up to the cap
    const st = DD.Act.getStatus(boss, 'grim_ledger');
    st.stacks = G.GAIN_PER * (G.GAIN_MAX + 3); boss.data.stolen = st.stacks;
    const AL = DD.skillLevel(DD.getSkill('grim_audit'), 1);
    c.hp = c.maxHp;
    hp0 = c.hp;
    use(boss, 'grim_audit', { x: c.x, y: c.y });
    t.eq(hp0 - c.hp, AL.dmg + G.GAIN_MAX, 'an Audit with a fat ledger: ' + AL.dmg + ' + ' + G.GAIN_MAX + ' (capped)');
    // the vault door knocks it all loose
    s.sandboxGold = 10;
    const held = boss.data.stolen;
    DD.Combat._action(function () { G.dropVault(k); });
    t.eq(DD.Act.gold(), 10 + held, 'the vault drop refunds all ' + held + ' gold he was holding');
    t.eq(boss.data.stolen, 0, 'his ledger is empty');
    t.ok(!DD.Act.hasStatus(boss, 'grim_ledger'), 'Ill-Gotten Gains is gone (no more bonus)');
    t.ok(s.log.some(function (l) { return /refunded to the party/.test(l.text); }), 'the refund is announced');

    // phase 2 Garnish Wages: no hiding behind a filing cabinet
    start('boss_grimble', 15, { noPlan: true });
    const b2 = byDef('grimble')[0];
    const c2 = hero('test_cleric');
    park(['test_knight', 'test_mage', 'test_rogue'].map(hero), FAR);
    place(c2, 5, 7);
    b2.mov = 0;
    b2.hp = Math.floor(b2.maxHp * G.PHASE2_AT);
    DD.Combat.state.stats.units[c2.id] = Object.assign(DD.Combat.state.stats.units[c2.id] || {}, { dmg: 99 });
    DD.AI.plan(b2);
    const gw = intentsOf(b2, 'grim_garnish')[0];
    t.ok(!!gw && gw.unitId === c2.id, 'Garnish Wages tracks the biggest spender');
    b2.intents = gw ? [gw] : [];
    DD.Combat.state.units.filter(function (u) { return u.defId === 'grim_intern'; }).forEach(function (u) { u.intents = []; DD.Act.addStatus(u, 'stun', { turns: 1 }, null); });
    place(c2, 2, 9);
    t.ok(!DD.Grid.los(b2, c2), 'the hero hides behind a filing cabinet');
    const GW = DD.skillLevel(DD.getSkill('grim_garnish'), 1);
    hp0 = c2.hp;
    noGuard();
    DD.Combat.endTurn();
    t.eq(hp0 - c2.hp, GW.dmg, 'Garnish Wages finds them anyway: ' + GW.dmg);
  });

  T.suite('bosses_act1: grimble tax loophole puzzle (vault door)', function (t) {
    if (!have()) { t.skip('boss content not loaded'); return; }
    const s = start('boss_grimble', 12, { noPlan: true });
    const boss = byDef('grimble')[0];
    const k = hero('test_knight'), c = hero('test_cleric'), m = hero('test_mage'), r = hero('test_rogue');
    const ls = DD.GrimbleBoss.loopholes(s);
    const at = function (x, y) { return ls.filter(function (l) { return l.x === x && l.y === y; })[0]; };
    place(k, 9, 3); place(c, 2, 4); place(m, 6, 8); place(r, 11, 11);
    DD.AI.plan(boss);
    t.ok(boss.intents.length > 0, 'Grimble has telegraphs before the drop');
    boss.block = 7;
    const hint = function (l, u) { return DD.getObject('grim_loophole').autoplay(u, l.obj, tile(l.x, l.y), s); };
    t.eq(hint(at(10, 3), k), 16, 'first pull hint 16 (beats a basic attack)');
    const ia = DD.Combat.interactions(k).filter(function (o) { return o.x === 10 && o.y === 3; })[0];
    t.ok(ia && ia.label === 'Exploit Loophole' && ia.ap === 1, 'adjacent hero can Exploit Loophole (1 AP)');
    t.ok(DD.Combat.interact(k, 10, 3), 'pull 1');
    t.eq(at(10, 3).obj.data.on, true, 'loophole 1 exploited');
    t.ok(/EXPLOITED/.test(at(10, 3).obj.label), 'label shows it');
    t.eq(hint(at(10, 3), k), 0, 'an exploited loophole hints 0');
    // an intern about to close the exploited one: deal with the intern first
    const spy = DD.Act.spawn('grim_intern', 11, 2, { silent: true });
    t.eq(hint(at(1, 4), c), 20, 'an intern nearby but not next to it: still 20');
    place(spy, 10, 2);
    t.eq(hint(at(1, 4), c), 6, 'an intern next to the exploited loophole: the next pull is only worth 6 (it would be undone)');
    DD.Combat._action(function () { DD.Act.kill(spy, k); });
    t.eq(hint(at(1, 4), c), 20, 'second pull hint 20 once the intern is gone');
    t.ok(DD.Combat.interact(c, 1, 4), 'pull 2');
    t.ok(!DD.Combat.interactions(k).some(function (o) { return o.x === 10 && o.y === 3; }), 'an exploited loophole offers no interaction');
    // last pull: worth it only with Grimble (and no hero) under the door
    t.eq(hint(at(6, 7), m), 60, 'last pull with Grimble in the zone: 60');
    place(r, 4, 2);
    t.eq(hint(at(6, 7), m), 0, 'a hero in the DROP ZONE: AutoPlay waits');
    const rHp = r.hp, bHp = boss.hp;
    const V = DD.GrimbleBoss.VAULT_DMG;
    t.ok(DD.Combat.interact(m, 6, 7), 'pull 3');
    const g = DD.GrimbleBoss.data(s);
    t.eq(g.drops, 1, 'the vault door dropped');
    t.eq(g.hits, 1, 'and hit Grimble');
    t.eq(bHp - boss.hp, V, 'Grimble takes ' + V + ' (Block ignored)');
    t.eq(boss.block, 0, 'his Block is stripped');
    t.ok(DD.Act.hasStatus(boss, 'stun'), 'Grimble is Stunned');
    t.ok(DD.Act.hasStatus(boss, 'vulnerable'), 'and Vulnerable');
    t.eq(boss.intents.length, 0, 'the stun cancels his telegraphs (delayed audits too)');
    t.eq(rHp - r.hp, Math.min(rHp, V), 'a hero in the zone is flattened too');
    t.ok(r.downed || DD.Act.hasStatus(r, 'stun'), 'and stunned (or worse)');
    t.ok(ls.every(function (l) { return !l.obj.data.on; }), 'loopholes reset');
    const R1 = DD.GrimbleBoss.reviewRounds(1);
    t.eq(g.jam, R1, 'under review for ' + R1 + ' rounds');
    t.ok(DD.GrimbleBoss.vaultTile(s).obj.data.down, 'vault door is down');
    t.ok(ls.every(function (l) { return /under review/.test(l.obj.label); }), 'labels say under review');
    k.ap = 3;
    t.ok(!DD.Combat.interactions(k).some(function (o) { return o.kind === 'object' && o.x === 10 && o.y === 3; }), 'no exploiting during the review');
    t.eq(hint(at(10, 3), k), 0, 'review hints 0');
    for (let i = 1; i <= R1; i++) {
      noGuard();
      DD.Combat.endTurn();
      if (i === 1) t.ok(!DD.Act.hasStatus(boss, 'stun'), 'the stun wears off after his lost turn');
      t.eq(g.jam, R1 - i, 'review ticks down (' + (R1 - i) + ')');
    }
    t.ok(!DD.GrimbleBoss.vaultTile(s).obj.data.down, 'the interns winched the door back up');
    t.ok(ls.every(function (l) { return !/under review/.test(l.obj.label); }), 'labels back to normal');
    place(k, 9, 3); k.ap = 3;
    t.ok(DD.Combat.interactions(k).some(function (o) { return o.x === 10 && o.y === 3 && o.label === 'Exploit Loophole'; }), 'the loopholes can be exploited again');
    // second drop on an empty zone: nothing happens to Grimble, the review gets longer
    ls.forEach(function (l) { l.obj.data.on = true; });
    at(6, 7).obj.data.on = false;
    place(boss, 8, 7);
    DD.Combat.state.units.filter(function (u) { return DD.GrimbleBoss.zoneTiles().some(function (p) { return p.x === u.x && p.y === u.y; }); }).forEach(function (u) { place(u, 11, 6); });
    t.eq(hint(at(6, 7), m), 0, 'nobody under the door: hint 0');
    const before = boss.hp;
    place(m, 6, 8); m.ap = 3;
    DD.Combat.interact(m, 6, 7);
    t.eq(boss.hp, before, 'a drop on an empty zone does nothing to Grimble');
    t.eq(DD.GrimbleBoss.data(s).drops, 2, 'still counts as a drop');
    t.eq(DD.GrimbleBoss.data(s).jam, DD.GrimbleBoss.reviewRounds(2), 'and the paperwork piles up: ' + DD.GrimbleBoss.reviewRounds(2) + ' rounds of review');
  });

  T.suite('bosses_act1: grimble previews and refunds', function (t) {
    if (!have()) { t.skip('boss content not loaded'); return; }
    const fp = T.contentHelpers && T.contentHelpers.fingerprint;
    start('boss_grimble', 13, { noPlan: true });
    const boss = byDef('grimble')[0];
    const k = hero('test_knight'), m = hero('test_mage');
    place(k, 4, 3);
    k.ap = 3; m.ap = 3;
    DD.AI.plan(boss);
    // shield bash pushes Grimble out of his zone: preview == reality
    const bash = slotOf(k, 'test_shield_bash');
    if (bash) {
      const s = DD.Combat.state;
      const f0 = fp ? fp(s) : '';
      const prev = DD.Combat.preview(k, bash, 5, 3);
      if (fp) t.eq(fp(s), f0, 'preview leaves the fight untouched');
      const e = prev.perUnit[boss.id];
      const hp0 = boss.hp, x0 = boss.x;
      t.ok(DD.Combat.useSkill(k, bash, 5, 3), 'shield bash Grimble');
      t.eq(hp0 - boss.hp, e ? e.dmg : 0, 'preview damage == real damage');
      t.ok(boss.x !== x0 && e && e.moved, 'Grimble is pushable (and the preview says so)');
    }
    // fire weakness: fireball preview matches
    place(m, boss.x, boss.y + 3);
    m.ap = 3;
    const fb = slotOf(m, 'test_fireball');
    if (fb) {
      const prev = DD.Combat.preview(m, fb, boss.x, boss.y);
      const hp0 = boss.hp;
      t.ok(DD.Combat.useSkill(m, fb, boss.x, boss.y), 'fireball Grimble');
      const e = prev.perUnit[boss.id];
      t.eq(hp0 - boss.hp, e ? e.dmg : -1, 'fireball preview == reality (fire weakness applied)');
      t.ok(hp0 - boss.hp > DD.skillLevel(DD.getSkill('test_fireball'), 1).dmg, 'paperwork burns: weak to fire');
    }
    // enemy skill previews never throw
    DD.Combat.slotsOf(boss).forEach(function (sl) {
      const r = t.tryRun('preview ' + sl.id, function () { return DD.Targeting.preview(boss, sl, { x: m.x, y: m.y }); });
      t.ok(r && typeof r === 'object', 'Targeting.preview of ' + sl.id + ' returns a result');
    });
    // a Levy execute with nobody on the tile (target died) is harmless
    const s0 = DD.Combat.state;
    s0.sandboxGold = 9;
    t.tryRun('levy at an empty tile', function () { use(boss, 'grim_levy', { x: 0, y: 11 }); });
    t.eq(DD.Act.gold(), 9, 'no hero hit: no gold taken');
    // refund on death
    boss.data.stolen = 17;
    s0.sandboxGold = 5;
    DD.Combat._action(function () { DD.Act.kill(boss, k); });
    t.eq(DD.Act.gold(), 22, 'Grimble\'s ledger refunds the 17 stolen gold when he falls');
    t.eq(s0.result, 'victory', 'killing Grimble wins the fight');
  });

  // =====================================================================================================
  // THE RAT KING
  // =====================================================================================================
  const RK = function () { return DD.RatKingBoss; };

  T.suite('bosses_act1: rat king registry, arena and encounter', function (t) {
    if (!have()) { t.skip('boss content not loaded'); return; }
    ['rat_king', 'rat_lawyer', 'rat_plaintiff'].forEach(function (id) { t.ok(!!DD.getEnemy(id), 'enemy ' + id); });
    ['rat_pile', 'rat_gnaw', 'rat_surge', 'rat_tails', 'rat_gavel', 'rat_class', 'rat_nibble', 'rat_objection', 'rat_cease', 'rat_billable'].forEach(function (id) {
      const s = DD.getSkill(id);
      t.ok(!!s && s.owner === 'enemy', 'skill ' + id);
      if (s) for (let lv = 1; lv <= s.levels.length; lv++) t.ok(!/undefined|NaN/.test(DD.skillDesc(s, lv, null)), id + ' desc L' + lv);
    });
    t.ok(!!DD.getObject('rat_valve') && !!DD.getTerrain('rat_rot') && !!DD.getStatus('rat_session'), 'valve, rotten floor, court status');
    const kd = DD.getEnemy('rat_king');
    t.ok(kd.tier === 'boss' && kd.hp >= 150 && kd.hp <= 200, 'Act 1 boss HP ' + kd.hp);
    t.ok(kd.flags.immovable, 'the swarm is immovable (only water moves it)');
    t.ok(kd.sprite.base === 'custom' && typeof kd.sprite.draw === 'function' && kd.sprite.scale >= 1.8, 'custom boss sprite');
    ['spawn', 'attack', 'hurt', 'death', 'phase', 'flush'].forEach(function (k) {
      t.ok(Array.isArray(kd.barks[k]) && kd.barks[k].length >= 2 && kd.barks[k].every(function (b) { return b.length <= 70; }), 'rat king barks.' + k);
    });
    ['rat_lawyer', 'rat_plaintiff'].forEach(function (id) {
      const b = DD.getEnemy(id).barks;
      ['spawn', 'attack', 'hurt', 'death'].forEach(function (k) { t.ok(b[k].length >= 2 && b[k].every(function (x) { return x.length <= 70; }), id + ' barks.' + k); });
    });
    const s = start('boss_rat_king', 1);
    const ch = RK().channels(s);
    t.eq(Object.keys(ch).sort().join(','), 'A,B', 'two channels');
    t.eq(ch.A.length, 24, 'channel A: 2 rows x 12');
    t.eq(ch.B.length, 24, 'channel B: 2 rows x 12');
    t.ok(ch.A.every(function (p) { return tile(p.x, p.y).t === 'water'; }), 'channels are shallow water');
    [[0, 3], [0, 4], [0, 7], [0, 8]].forEach(function (p) { t.ok(DD.Grid.isPit(p[0], p[1]), 'drain at ' + p); });
    t.eq(RK().rotTiles(s).length, 8, '8 rotten floor tiles');
    const vs = RK().valves(s);
    t.eq(vs.length, 2, 'two sluice valves');
    t.ok(vs.some(function (v) { return v.obj.data.chan === 'A'; }) && vs.some(function (v) { return v.obj.data.chan === 'B'; }), 'one valve per channel');
    t.ok(vs.every(function (v) { return /Sluice Valve \(channel [AB]\)/.test(v.obj.label); }), 'valves labelled');
    t.ok(new RegExp('FLUSHED \\(' + RK().FLUSH_DMG + ' damage').test(DD.getObject('rat_valve').desc), 'valve desc shows the flush damage');
    const king = byDef('rat_king')[0];
    const sp = start.lastSetup.enemies.filter(function (e) { return e.id === 'rat_king'; })[0];
    t.ok(sp && sp.x === 6 && sp.y === 1, 'the King is placed on his throne walkway');
    t.eq(byDef('rat_lawyer').length, 2, 'with two Rat Lawyers on retainer');
    t.ok(DD.Act.hasStatus(king, 'rat_session'), 'court is in session (phase status)');
    const v = DD.MapGen.validate({ grid: s.grid, heroZone: s.heroZone || [], enemyZone: s.enemyZone || [] }, { layout: true });
    t.ok(v.ok, 'arena layout validates: ' + v.problems.join('; '));
    // gnawing every rotten tile never cuts the map apart
    RK().rotTiles(s).forEach(function (p) { tile(p.x, p.y).t = 'pit'; });
    const v2 = DD.MapGen.validate({ grid: s.grid, heroZone: s.heroZone || [], enemyZone: s.enemyZone || [] }, { layout: true });
    t.ok(v2.ok, 'still connected with every rotten tile collapsed: ' + v2.problems.join('; '));
    t.ok(s.log.some(function (l) { return l.cls === 'narrator' && /valve|water/i.test(l.text); }), 'the DM hints at the valves');
  });

  T.suite('bosses_act1: rat king patterns (tails, gnaw, surge, gavel, rat pile)', function (t) {
    if (!have()) { t.skip('boss content not loaded'); return; }
    start('boss_rat_king', 2, { noPlan: true });
    const king = byDef('rat_king')[0];
    const k = hero('test_knight'), c = hero('test_cleric'), m = hero('test_mage'), r = hero('test_rogue');
    byDef('rat_lawyer').forEach(function (u) { DD.Act.kill(u, null); });
    king.mov = 0;                              // keep him put: the planner's choices are what is tested here
    place(king, 6, 5);
    park([k, c, m, r], [{ x: 6, y: 9 }, { x: 4, y: 8 }, { x: 9, y: 10 }, { x: 11, y: 11 }]);
    k.hp -= 10;
    king.data.step = 0;                        // phase 1 rotation: tails, gnaw, tails, surge
    let p = planned(king);
    t.eq(ids(p), 'rat_tails+rat_pile+rat_gavel', 'step 1: Tangled Tails, then a Rat Pile for whoever gets reeled in, + the gavel');
    t.ok(p[0].unitId === k.id, 'tails reel in the most hurt hero in reach');
    t.ok(king.intents.indexOf(p[0]) < king.intents.indexOf(p[1]), 'the tails go first (they drag the hero into the pile)');
    t.ok(p[2].unitId !== k.id, 'the gavel goes for somebody else');
    // gnaw: heroes next to rotten floor
    king.intents = [];
    place(c, 4, 6); place(m, 9, 5);
    king.data.step = 1;
    p = planned(king);
    const gn = p.filter(function (it) { return it.skillId === 'rat_gnaw'; })[0];
    t.ok(!!gn && gn.anchor === 'ground' && gn.tiles.length === 2 && gn.tiles.every(function (q) { return tile(q.x, q.y).t === 'rat_rot'; }), 'step 2: Gnaw marks 2 rotten tiles');
    t.ok(gn && gn.tiles.every(function (q) { return [k, c, m, r].some(function (h) { return DD.Grid.dist(h, q) <= 1; }); }), 'next to heroes');
    // surge: a hero wading in channel B
    king.intents = [];
    place(m, 6, 8);
    king.data.step = 3;
    p = planned(king);
    const su = p.filter(function (it) { return it.skillId === 'rat_surge'; })[0];
    t.ok(!!su && su.delay === 1 && su.data.chan === 'B', 'step 4: Sewer Surge on the channel with a hero in it (⏳1)');
    t.eq(su && su.tiles.length, 24, 'the whole channel is marked');
    // rat pile when anyone is within reach (diagonals too)
    king.intents = [];
    place(m, 7, 6); place(k, 5, 5);
    p = planned(king);
    const pile = p.filter(function (it) { return it.skillId === 'rat_pile'; })[0];
    t.ok(!!pile, 'Rat Pile when heroes are next to him');
    t.eq(pile ? DD.AI.intentTiles(king, pile).length : 0, 8, 'Rat Pile telegraphs all 8 surrounding tiles');
    // he wades toward the party
    king.mov = 5;
    king.intents = [];
    place(king, 6, 1);
    park([k, c, m, r], [{ x: 3, y: 10 }, { x: 5, y: 10 }, { x: 7, y: 10 }, { x: 9, y: 10 }]);
    DD.AI.plan(king);
    t.ok(king.y > 1, 'the King advances toward the party (now at ' + king.x + ',' + king.y + ')');
    // a rooted hero is lunch
    king.intents = [];
    place(king, 6, 5);
    DD.Act.addStatus(c, 'root', { turns: 1 }, null);
    place(c, 9, 6);
    king.data.step = 1;
    DD.AI.plan(king);
    t.ok(Math.max(Math.abs(king.x - c.x), Math.abs(king.y - c.y)) === 1 && intentsOf(king, 'rat_pile').length === 1, 'he walks up to a rooted hero and piles on');
    // sandbox without the sewer still works
    DD.Combat.sandbox({ w: 9, h: 9, seed: 3, heroes: [{ id: 'test_mage', x: 1, y: 1, level: 4 }], enemies: [{ id: 'rat_king', x: 2, y: 2 }], noPlan: true });
    const k2 = byDef('rat_king')[0];
    DD.AI.plan(k2);
    t.ok(intentsOf(k2, 'rat_pile').length === 1, 'without channels or rotten floor he still bites');
  });

  T.suite('bosses_act1: rat king attacks deal exactly what they say', function (t) {
    if (!have()) { t.skip('boss content not loaded'); return; }
    // Rat Pile: 12 + Bleed 1 to every hero within the 8 tiles
    start('boss_rat_king', 3, { noPlan: true });
    let king = byDef('rat_king')[0];
    byDef('rat_lawyer').forEach(function (u) { DD.Act.kill(u, null); });
    let c = hero('test_cleric'), m = hero('test_mage');
    park(['test_knight', 'test_rogue'].map(hero), [{ x: 2, y: 11 }, { x: 11, y: 11 }]);
    king.mov = 0;
    place(king, 6, 10); place(c, 5, 10); place(m, 7, 11);
    DD.AI.plan(king);
    only(king, 'rat_pile');
    const PL = DD.skillLevel(DD.getSkill('rat_pile'), 1);
    let hc = c.hp, hm = m.hp;
    noGuard();
    DD.Combat.endTurn();
    t.eq(hc - c.hp, PL.dmg, 'Rat Pile hits the cleric (side) for ' + PL.dmg);
    t.eq(hm - m.hp, PL.dmg, 'and the mage (diagonal) for ' + PL.dmg);
    t.ok(DD.Act.hasStatus(c, 'bleed') && DD.Act.hasStatus(m, 'bleed'), 'Bleed 1 on both');

    // Tangled Tails: 8 + pull 2 + Root 2; the gavel: 11
    start('boss_rat_king', 4, { noPlan: true });
    king = byDef('rat_king')[0];
    byDef('rat_lawyer').forEach(function (u) { DD.Act.kill(u, null); });
    c = hero('test_cleric'); m = hero('test_mage');
    park(['test_knight', 'test_rogue'].map(hero), [{ x: 2, y: 11 }, { x: 11, y: 11 }]);
    king.mov = 0;
    place(king, 6, 5); place(c, 6, 9); place(m, 9, 6);
    c.hp -= 6;
    king.data.step = 0;
    DD.AI.plan(king);
    t.ok(intentsOf(king, 'rat_tails').length === 1 && intentsOf(king, 'rat_gavel').length === 1, 'tails + gavel planned');
    king.intents = intentsOf(king).filter(function (it) { return it.skillId === 'rat_tails' || it.skillId === 'rat_gavel'; });
    const TL = DD.skillLevel(DD.getSkill('rat_tails'), 1), GV = DD.skillLevel(DD.getSkill('rat_gavel'), 1);
    hc = c.hp; hm = m.hp;
    noGuard();
    DD.Combat.endTurn();
    t.eq(hc - c.hp, TL.dmg, 'Tangled Tails deals ' + TL.dmg);
    t.ok(c.x === 6 && c.y === 9 - TL.pull, 'and pulls the hero ' + TL.pull + ' tiles closer (' + c.x + ',' + c.y + ')');
    t.ok((DD.Act.getStatus(c, 'root') || {}).turns === TL.turns, 'and Roots for ' + TL.turns + ' turns');
    t.eq(hm - m.hp, GV.dmg, 'the gavel deals ' + GV.dmg);

    // Gnaw: 8 to heroes on the tiles, then pits; a hero on it falls (25% max HP) and climbs out
    start('boss_rat_king', 5, { noPlan: true });
    king = byDef('rat_king')[0];
    byDef('rat_lawyer').forEach(function (u) { DD.Act.kill(u, null); });
    c = hero('test_cleric'); m = hero('test_mage');
    park(['test_knight', 'test_rogue'].map(hero), [{ x: 2, y: 11 }, { x: 11, y: 11 }]);
    place(c, 4, 5); place(m, 10, 6);
    king.mov = 0;
    king.data.step = 1;
    DD.AI.plan(king);
    const gn = intentsOf(king, 'rat_gnaw')[0];
    t.ok(gn && gn.tiles.some(function (q) { return q.x === 4 && q.y === 5; }) && gn.tiles.some(function (q) { return q.x === 10 && q.y === 6; }), 'Gnaw targets the rotten tiles under the heroes');
    only(king, 'rat_gnaw');
    const GL = DD.skillLevel(DD.getSkill('rat_gnaw'), 1);
    hc = c.hp;
    const fall = Math.ceil(c.maxHp * 0.25);
    noGuard();
    DD.Combat.endTurn();
    t.eq(hc - c.hp, GL.dmg + fall, 'standing on it: ' + GL.dmg + ' + a 25% max HP fall (' + fall + ')');
    t.ok(DD.Grid.isPit(4, 5) && DD.Grid.isPit(10, 6), 'the gnawed tiles are pits now');
    t.ok(!DD.Grid.isPit(c.x, c.y) && DD.Grid.isWalkable(c.x, c.y, c), 'the hero climbed out');
    t.eq(RK().rotTiles().length, 6, 'two rotten tiles used up');

    // Sewer Surge: 8 to heroes in the channel, then everybody (but the King) washed into the drain
    start('boss_rat_king', 6, { noPlan: true });
    king = byDef('rat_king')[0];
    const lw = byDef('rat_lawyer')[0];
    byDef('rat_lawyer').slice(1).forEach(function (u) { DD.Act.kill(u, null); });
    c = hero('test_cleric'); m = hero('test_mage');
    park(['test_knight', 'test_rogue'].map(hero), [{ x: 2, y: 11 }, { x: 11, y: 11 }]);
    place(c, 8, 7); place(m, 3, 10);
    place(lw, 5, 8);
    place(king, 10, 8);
    king.mov = 0;
    king.data.step = 3;
    DD.AI.plan(king);
    const su = intentsOf(king, 'rat_surge')[0];
    t.ok(su && su.data.chan === 'B', 'surge planned on channel B');
    only(king, 'rat_surge');
    lw.intents = [];
    DD.Act.addStatus(lw, 'stun', { turns: 1 }, null);
    hc = c.hp;
    noGuard();
    DD.Combat.endTurn();
    t.eq(c.hp, hc, 'countdown round: nothing yet');
    only(king, 'rat_surge');
    lw.intents = [];
    DD.Act.addStatus(lw, 'stun', { turns: 1 }, null);
    place(c, 8, 7); place(lw, 5, 8); place(king, 10, 8);
    // (round 2: the King has 1 stack of Swelling Ranks; take it off so the base number is checked)
    t.ok(DD.Act.hasStatus(king, 'rat_swarm'), 'round 2: Swelling Ranks');
    DD.Act.removeStatus(king, 'rat_swarm', { silent: true });
    const SL = DD.skillLevel(DD.getSkill('rat_surge'), 1);
    hc = c.hp;
    noGuard();
    DD.Combat.endTurn();
    const fallC = Math.ceil(c.maxHp * 0.25);
    t.eq(hc - c.hp, SL.dmg + fallC, 'a hero in the flooded channel takes ' + SL.dmg + ' and is washed into the drain (+' + fallC + ')');
    t.ok(!RK().chanTiles('B').some(function (q) { return q.x === c.x && q.y === c.y; }), 'and climbs out onto the walkway, not back into the water');
    t.ok(lw.dead, 'his own lawyer in the channel drowned (the King spares nobody)');
    t.ok(!king.dead && king.x === 10 && king.y === 8, 'the King rides his own surge (exempt)');

    // lawyers: OBJECTION! 7 + push 1, Cease and Desist 4 + Root 1, Billable Bite 6
    start('boss_rat_king', 7, { noPlan: true });
    king = byDef('rat_king')[0];
    const law = byDef('rat_lawyer')[0];
    byDef('rat_lawyer').slice(1).forEach(function (u) { DD.Act.kill(u, null); });
    m = hero('test_mage');
    park(['test_knight', 'test_cleric', 'test_rogue'].map(hero), [{ x: 2, y: 11 }, { x: 11, y: 11 }, { x: 10, y: 11 }]);
    place(king, 1, 1); king.intents = [];
    const quiet = function () { king.intents = []; DD.Act.addStatus(king, 'stun', { turns: 1 }, null); };
    quiet();
    place(law, 6, 5); place(m, 6, 9);
    law.intents = [];
    DD.AI.makeIntent(law, 'rat_objection', m, {});
    const OL = DD.skillLevel(DD.getSkill('rat_objection'), 1);
    let hp0 = m.hp;
    noGuard();
    DD.Combat.endTurn();
    t.eq(hp0 - m.hp, OL.dmg, 'OBJECTION! deals ' + OL.dmg);
    t.ok(m.y === 10, 'and pushes the hero 1 tile away (' + m.x + ',' + m.y + ')');
    law.intents = []; quiet();
    place(law, 6, 6); place(m, 6, 9);
    DD.AI.makeIntent(law, 'rat_cease', m, {});
    const CL = DD.skillLevel(DD.getSkill('rat_cease'), 1);
    hp0 = m.hp;
    noGuard();
    DD.Combat.endTurn();
    t.eq(hp0 - m.hp, CL.dmg, 'Cease and Desist deals ' + CL.dmg);
    t.ok(DD.Act.hasStatus(m, 'root'), 'and Roots');
    law.intents = []; quiet();
    place(law, 6, 9); place(m, 6, 10);
    DD.AI.makeIntent(law, 'rat_billable', m, {});
    const BL = DD.skillLevel(DD.getSkill('rat_billable'), 1);
    hp0 = m.hp;
    noGuard();
    DD.Combat.endTurn();
    t.eq(hp0 - m.hp, BL.dmg, 'Billable Bite deals ' + BL.dmg);
    // the lawyer AI likes rooting heroes the King can reach
    const cease = DD.getSkill('rat_cease');
    law.intents = [];
    place(king, 6, 7); place(law, 6, 4); place(m, 6, 6);
    DD.Act.removeStatus(m, 'root', { silent: true });
    const sc1 = cease.aiScore(DD.Targeting.buildCtx(law, slotOf(law, 'rat_cease'), { x: m.x, y: m.y }));
    DD.Act.addStatus(m, 'root', { turns: 1 }, null);
    const sc2 = cease.aiScore(DD.Targeting.buildCtx(law, slotOf(law, 'rat_cease'), { x: m.x, y: m.y }));
    t.ok(sc1 > 0 && sc2 < 0, 'Cease and Desist is worth it on a free hero near the King, not on a rooted one (' + sc1 + ' / ' + sc2 + ')');
  });

  T.suite('bosses_act1: rat king splits into lawyers (phases, cap, class action)', function (t) {
    if (!have()) { t.skip('boss content not loaded'); return; }
    start('boss_rat_king', 8, { noPlan: true });
    const king = byDef('rat_king')[0];
    const k = hero('test_knight');
    place(king, 6, 5);
    t.eq(RK().phaseOf(king), 1, 'phase 1');
    const toHp = function (frac) { DD.Combat._action(function () { DD.Act.damage(k, king, Math.max(1, king.hp - Math.floor(king.maxHp * frac)), { cause: 'other' }); }); };
    toHp(0.6);
    t.eq(RK().phaseOf(king), 2, 'below 66%: phase 2 (Cross-Examination)');
    t.eq(byDef('rat_lawyer').length, 3, 'lawyers split off (capped at 3)');
    t.eq((DD.Act.getStatus(king, 'rat_session') || {}).stacks, 2, 'court status shows phase 2');
    t.eq(slotOf(king, 'rat_gnaw').level, 2, 'Gnaw now takes 3 tiles');
    t.ok(DD.Combat.state.log.some(function (l) { return /splits/.test(l.text); }), 'the split is announced');
    toHp(0.3);
    t.eq(RK().phaseOf(king), 3, 'below 33%: phase 3 (Closing Arguments)');
    t.eq(byDef('rat_lawyer').length, RK().LAWYER_CAP, 'never more than ' + RK().LAWYER_CAP + ' lawyers on retainer');
    // a single big hit that skips a threshold triggers both splits
    start('boss_rat_king', 9, { noPlan: true });
    const k2 = byDef('rat_king')[0];
    byDef('rat_lawyer').forEach(function (u) { DD.Act.kill(u, null); });
    DD.Combat._action(function () { DD.Act.damage(hero('test_knight'), k2, Math.ceil(k2.maxHp * 0.7), { cause: 'other' }); });
    t.eq(RK().phaseOf(k2), 3, 'one huge hit: straight to phase 3');
    t.eq(byDef('rat_lawyer').length, 3, 'capped at 3 even after two splits at once');
    // phase 3: double surge, class action
    const c = hero('test_cleric'), m = hero('test_mage');
    place(c, 3, 3); place(m, 8, 8);
    byDef('rat_lawyer').forEach(function (u, i) { place(u, 2 + i * 2, 11); });
    k2.mov = 0;
    k2.intents = [];
    k2.data.step = 0;
    t.eq(planned(k2).filter(function (it) { return it.skillId === 'rat_surge'; }).length, 2, 'Closing Arguments: both channels surge at once');
    k2.intents = [];
    k2.data.step = 2;
    const cl = planned(k2).filter(function (it) { return it.skillId === 'rat_class'; });
    t.eq(cl.length, 1, 'phase 3 step 3: Class Action');
    const CL = DD.skillLevel(DD.getSkill('rat_class'), 1);
    use(k2, 'rat_class', k2);
    use(k2, 'rat_class', k2);
    const pl = byDef('rat_plaintiff');
    t.eq(pl.length, CL.cap, 'Plaintiff Rats crawl out (capped at ' + CL.cap + ')');
    t.ok(pl.every(function (u) { return u.x <= 3; }), 'next to the drains');
  });

  T.suite('bosses_act1: rat king sluice puzzle (flush the King)', function (t) {
    if (!have()) { t.skip('boss content not loaded'); return; }
    const s = start('boss_rat_king', 10, { noPlan: true });
    const king = byDef('rat_king')[0];
    const lw = byDef('rat_lawyer')[0];
    byDef('rat_lawyer').slice(1).forEach(function (u) { DD.Act.kill(u, null); });
    const k = hero('test_knight'), c = hero('test_cleric'), m = hero('test_mage'), r = hero('test_rogue');
    const vA = RK().valves(s).filter(function (v) { return v.obj.data.chan === 'A'; })[0];
    const vB = RK().valves(s).filter(function (v) { return v.obj.data.chan === 'B'; })[0];
    const hint = function (v, u) { return DD.getObject('rat_valve').autoplay(u, v.obj, tile(v.x, v.y), s); };
    // immovable to normal pushes
    place(king, 6, 3); place(k, 6, 2); place(lw, 3, 4); place(c, 8, 5); place(m, 6, 10); place(r, 10, 10);
    t.ok(vA.x === 7 && vA.y === 5 && vB.x === 6 && vB.y === 9, 'valve A on the island, valve B on the party walkway, both mid-arena');
    k.ap = 3;
    const bash = slotOf(k, 'test_shield_bash');
    if (bash) { DD.Combat.useSkill(k, bash, 6, 3); t.ok(king.x === 6 && king.y === 3, 'a shield bash does not budge the Rat King'); }
    place(k, 2, 1);
    DD.AI.plan(king);
    t.ok(king.intents.length > 0, 'the King has telegraphs');
    place(king, 6, 3); place(lw, 3, 4);
    t.eq(hint(vA, c), 55 + 18, 'valve A hint: King + lawyer in the channel = 73');
    t.eq(hint(vB, m), 0, 'valve B: nobody in channel B');
    const ia = DD.Combat.interactions(c).filter(function (o) { return o.x === vA.x && o.y === vA.y; })[0];
    t.ok(ia && ia.label === 'Crank Sluice' && ia.ap === 1, 'adjacent hero can Crank Sluice (1 AP)');
    // AutoPlay's idle fallback uses any 'Drink|Open' interaction regardless of its hint: keep the valve out of it
    t.ok(!/Drink|Open/.test(ia ? ia.label : 'Open'), 'the valve label stays out of the AutoPlay idle "Open/Drink" fallback');
    const hp0 = king.hp, hype0 = s.hype;
    t.ok(DD.Combat.interact(c, vA.x, vA.y), 'open sluice A');
    t.eq(hp0 - king.hp, RK().FLUSH_DMG, 'the King is flushed: ' + RK().FLUSH_DMG + ' damage');
    t.ok(DD.Act.hasStatus(king, 'stun') && DD.Act.hasStatus(king, 'wet'), 'Stunned and Wet');
    t.eq(king.intents.length, 0, 'his telegraphs are cancelled');
    t.ok(!RK().chanTiles('A').some(function (p) { return p.x === king.x && p.y === king.y; }) && !DD.Grid.isPit(king.x, king.y), 'he climbs out onto a walkway');
    t.ok(lw.dead, 'the lawyer in the channel drowned');
    t.ok(s.hype - hype0 >= 20, 'drowning a lawyer is an environmental kill (+20 Hype)');
    t.eq(s.data.rat.flushes, 1, 'flush counted');
    t.eq(vA.obj.data.cd, RK().VALVE_CD, 'valve A needs ' + RK().VALVE_CD + ' rounds');
    t.ok(/building pressure/.test(vA.obj.label), 'label says so');
    c.ap = 3;
    t.ok(!DD.Combat.interactions(c).some(function (o) { return o.x === vA.x && o.y === vA.y && o.kind === 'object'; }), 'no second flood while repressurizing');
    t.eq(hint(vA, c), 0, 'recharging valve hints 0');
    for (let i = 1; i <= RK().VALVE_CD; i++) {
      noGuard();
      DD.Combat.endTurn();
      t.eq(vA.obj.data.cd, RK().VALVE_CD - i, 'pressure builds (' + (RK().VALVE_CD - i) + ')');
    }
    t.ok(/ready/.test(vA.obj.label), 'ready again');
    // heroes in the channel get washed too (and the hint warns)
    place(c, 8, 5);
    const kk = byDef('rat_king')[0];
    kk.intents = [];
    place(kk, 2, 1);
    place(r, 9, 4);
    t.ok(hint(vA, c) < 0, 'a hero in the channel: negative hint (' + hint(vA, c) + ')');
    const hr = r.hp;
    c.ap = 3;
    DD.Combat.interact(c, vA.x, vA.y);
    t.eq(hr - r.hp, Math.ceil(r.maxHp * 0.25), 'a hero washed into the drain loses 25% max HP');
    t.ok(!RK().chanTiles('A').some(function (p) { return p.x === r.x && p.y === r.y; }), 'and climbs out dry');
    // flyers float over a flood, downed heroes stay put
    place(r, 8, 8);
    r.flags.flying = true;
    const hr2 = r.hp;
    place(m, 9, 7);
    DD.Combat._action(function () { m.hp = 0; m.downed = true; });
    const mx = m.x;
    DD.Combat._action(function () { RK().flood('B', null, {}); });
    t.ok(r.x === 8 && r.hp === hr2, 'a flyer is not washed away');
    t.ok(m.x === mx, 'a downed hero is not washed away');
    r.flags.flying = false;
  });

  T.suite('bosses_act1: rat king swelling ranks, sleepless swarm, tails into the pile', function (t) {
    if (!have()) { t.skip('boss content not loaded'); return; }
    const near8 = function (a, b) { return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) === 1; };
    let s = start('boss_rat_king', 12, { noPlan: true });
    let king = byDef('rat_king')[0];
    byDef('rat_lawyer').forEach(function (u) { DD.Act.kill(u, null); });
    const k = hero('test_knight'), c = hero('test_cleric'), m = hero('test_mage'), r = hero('test_rogue');
    king.mov = 0;
    place(king, 6, 1);
    park([k, c, m, r], [{ x: 1, y: 10 }, { x: 2, y: 11 }, { x: 11, y: 11 }, { x: 12, y: 10 }]);
    const SW = DD.getStatus('rat_swarm'), per = RK().cfg.swarmDmg;
    t.ok(!DD.Act.hasStatus(king, 'rat_swarm'), 'round 1: just the King');
    for (let i = 1; i <= SW.maxStacks + 1; i++) {
      king.intents = [];
      noGuard();
      DD.Combat.endTurn();
      const n = Math.min(i, SW.maxStacks);
      t.eq((DD.Act.getStatus(king, 'rat_swarm') || {}).stacks, n, 'round ' + (i + 1) + ': ' + n + ' stack(s) of Swelling Ranks');
    }
    t.ok(new RegExp('\\+' + per * SW.maxStacks + ' damage').test(SW.desc(DD.Act.getStatus(king, 'rat_swarm'))), 'the status shows the bonus');
    // the telegraph tells the truth, and the hit matches it
    place(m, 6, 5);
    m.hp = m.maxHp;
    king.intents = [];
    DD.AI.makeIntent(king, 'rat_gavel', m, { noCooldown: true });
    const GV = DD.skillLevel(DD.getSkill('rat_gavel'), 1);
    const want = GV.dmg + per * SW.maxStacks;
    t.eq(DD.AI.describe(king, intentsOf(king, 'rat_gavel')[0]).dmg, want, 'a max-swarm gavel telegraphs ' + want);
    const hm = m.hp;
    noGuard();
    DD.Combat.endTurn();
    t.eq(hm - m.hp, want, 'and hits for exactly that');
    // a flush washes them all away
    king.intents = [];
    place(king, 5, 4);
    place(c, 8, 5);
    c.ap = 3;
    const vA = RK().valves(s).filter(function (v) { return v.obj.data.chan === 'A'; })[0];
    t.ok(DD.Combat.interact(c, vA.x, vA.y), 'open sluice A on him');
    t.ok(!DD.Act.hasStatus(king, 'rat_swarm'), 'the flush washes the extra rats away');
    // a swarm never sleeps
    DD.Act.removeStatus(king, 'stun', { silent: true });
    DD.Act.addStatus(king, 'sleep', { turns: 1 }, k);
    t.ok(!DD.Act.hasStatus(king, 'sleep'), 'forty rats never all fall asleep at once (immune to Sleep)');

    // Tangled Tails goes first: the reeled-in hero lands in the Rat Pile, Rooted (buried)
    s = start('boss_rat_king', 13, { noPlan: true });
    king = byDef('rat_king')[0];
    byDef('rat_lawyer').forEach(function (u) { DD.Act.kill(u, null); });
    const c2 = hero('test_cleric');
    park(['test_knight', 'test_mage', 'test_rogue'].map(hero), [{ x: 1, y: 10 }, { x: 2, y: 11 }, { x: 11, y: 11 }]);
    king.mov = 0;
    place(king, 6, 5);
    place(c2, 6, 8);
    c2.hp -= 5;
    king.data.step = 0;
    DD.AI.plan(king);
    t.ok(intentsOf(king, 'rat_tails').length === 1 && intentsOf(king, 'rat_pile').length === 1, 'Tangled Tails + Rat Pile planned (nobody next to him yet)');
    king.intents = king.intents.filter(function (it) { return it.skillId === 'rat_tails' || it.skillId === 'rat_pile'; });
    const TL = DD.skillLevel(DD.getSkill('rat_tails'), 1), PL = DD.skillLevel(DD.getSkill('rat_pile'), 1);
    const h0 = c2.hp;
    noGuard();
    DD.Combat.endTurn();
    t.ok(near8(c2, king), 'reeled in next to the King (' + c2.x + ',' + c2.y + ')');
    t.eq(h0 - c2.hp, TL.dmg + PL.rooted, 'Tangled Tails ' + TL.dmg + ' + buried in the Rat Pile ' + PL.rooted);
    t.ok(DD.Act.hasStatus(c2, 'root') && DD.Act.hasStatus(c2, 'bleed'), 'Rooted and Bleeding');
  });

  T.suite('bosses_act1: rat king previews and edge cases', function (t) {
    if (!have()) { t.skip('boss content not loaded'); return; }
    const fp = T.contentHelpers && T.contentHelpers.fingerprint;
    const s = start('boss_rat_king', 11, { noPlan: true });
    const king = byDef('rat_king')[0];
    const m = hero('test_mage'), k = hero('test_knight');
    place(king, 6, 5); place(m, 6, 8); place(k, 1, 10);
    m.ap = 3;
    const fb = slotOf(m, 'test_fireball');
    if (fb) {
      king.hp = Math.floor(king.maxHp * 0.66) + 2;       // a hit that crosses the first split threshold
      const f0 = fp ? fp(s) : '';
      const prev = DD.Combat.preview(m, fb, 6, 5);
      if (fp) t.eq(fp(s), f0, 'preview with a split leaves the real fight untouched');
      const hp0 = king.hp, n0 = byDef('rat_lawyer').length;
      DD.Combat.useSkill(m, fb, 6, 5);
      t.eq(hp0 - king.hp, (prev.perUnit[king.id] || {}).dmg, 'preview damage == real damage');
      t.eq(byDef('rat_lawyer').length - n0, (prev.spawned || []).filter(function (u) { return u.defId === 'rat_lawyer'; }).length, 'the preview predicts the lawyers splitting off');
    }
    // frost can't freeze a whole swarm (immune to Frozen)
    DD.Act.addStatus(king, 'wet', { turns: 2 }, null);
    DD.Act.addStatus(king, 'frozen', { turns: 1 }, null);
    t.ok(!DD.Act.hasStatus(king, 'frozen'), 'the swarm cannot be Frozen');
    DD.Combat.slotsOf(king).forEach(function (sl) {
      const r = t.tryRun('preview ' + sl.id, function () { return DD.Targeting.preview(king, sl, { x: m.x, y: m.y }); });
      t.ok(r && typeof r === 'object', 'Targeting.preview of ' + sl.id);
    });
    // a flood on a map without a drain: units bump into the edge, nothing breaks
    DD.Combat.sandbox({ w: 6, h: 3, seed: 2, heroes: [{ id: 'test_mage', x: 3, y: 1, level: 4 }], enemies: [{ id: 'rat_king', x: 5, y: 2 }], noPlan: true,
      terrain: function (tl) { if (tl.y === 1) { tl.t = 'water'; tl.tag = 'rat_chanA'; } } });
    const mm = hero('test_mage');
    const r1 = t.tryRun('flood without a drain', function () { return DD.Combat._action(function () { return RK().flood('A', null, {}); }); });
    t.ok(r1 && mm.x === 0 && !mm.dead, 'washed to the map edge (' + (mm && mm.x) + ')');
    // gnaw on plain floor: harmless
    const k3 = byDef('rat_king')[0];
    const r2 = t.tryRun('gnaw on plain floor', function () {
      return DD.Combat._action(function () { return DD.Combat.resolveSkill(k3, slotOf(k3, 'rat_gnaw'), { x: 0, y: 0 }, { extra: { tiles: [{ x: 0, y: 0 }] } }); });
    });
    t.ok(!!r2 && !DD.Grid.isPit(0, 0), 'gnaw only collapses rotten floor');
    // tails at an empty tile (the target died): harmless
    t.tryRun('tails at nobody', function () { use(k3, 'rat_tails', { x: 0, y: 0 }); });
    t.ok(true, 'no throw');
  });

  // =====================================================================================================
  // Review: stun guard, honest telegraphs, unblockable flush, raw refunds
  // =====================================================================================================
  T.suite('bosses_act1: stun guard on both bosses (the puzzle stuns always land)', function (t) {
    if (!have()) { t.skip('boss content not loaded'); return; }
    start('boss_grimble', 21, { noPlan: true });
    const g = byDef('grimble')[0];
    const k = hero('test_knight');
    const stun = function (u, id) { DD.Combat._action(function () { DD.Act.addStatus(u, id || 'stun', { turns: 1 }, k); }); return DD.Act.hasStatus(u, id || 'stun'); };
    t.ok(stun(g), 'round 1: a hero stun lands on Grimble');
    const ap = DD.Act.getStatus(g, 'grim_appeal');
    t.ok(!!ap && ap.turns === 2, 'and he files an appeal (2 turns: this round and the next)');
    noGuard(); DD.Combat.endTurn();
    t.ok(!DD.Act.hasStatus(g, 'stun') && g.intents.length > 0, 'round 2: the stun is spent and he telegraphs again');
    t.ok(!stun(g), 'round 2: a second stun is appealed (no effect)');
    t.ok(!stun(g, 'charmed') && !stun(g, 'sleep') && !stun(g, 'frozen'), 'and so are a charm, sleep and freeze');
    t.ok(g.intents.length > 0, 'his telegraphs stand');
    t.ok(/Appeal pending/i.test(DD.getStatus('grim_appeal').name) && /next round/.test(DD.getStatus('grim_appeal').desc(DD.Act.getStatus(g, 'grim_appeal'))), 'the status says what it does');
    noGuard(); DD.Combat.endTurn();
    t.ok(!DD.Act.hasStatus(g, 'grim_appeal'), 'round 3: the appeal ran out');
    t.ok(stun(g), 'round 3: he can be stunned again');
    noGuard(); DD.Combat.endTurn();
    t.ok(DD.Act.hasStatus(g, 'grim_appeal') && !DD.Act.hasStatus(g, 'stun'), 'round 4: appeal pending again');
    const hp0 = g.hp;
    DD.Combat._action(function () { GB().dropVault(k); });
    t.ok(DD.Act.hasStatus(g, 'stun') && hp0 - g.hp === GB().VAULT_DMG, 'the vault door stuns him anyway (puzzle stuns ignore the appeal)');

    start('boss_rat_king', 22, { noPlan: true });
    const rk = byDef('rat_king')[0];
    byDef('rat_lawyer').forEach(function (u) { DD.Act.kill(u, null); });
    const kk = hero('test_knight'), c = hero('test_cleric');
    place(rk, 6, 3); place(c, 8, 5);
    rk.mov = 0;
    DD.Combat._action(function () { DD.Act.addStatus(rk, 'charmed', { turns: 1 }, kk); });
    t.ok(DD.Act.hasStatus(rk, 'charmed') && DD.Act.hasStatus(rk, 'rat_recess'), 'a charmed Rat King calls a recess');
    DD.Combat._action(function () { DD.Act.addStatus(rk, 'stun', { turns: 1 }, kk); });
    t.ok(!DD.Act.hasStatus(rk, 'stun'), 'no hero stun during the recess');
    const vA = RK().valves().filter(function (v) { return v.obj.data.chan === 'A'; })[0];
    c.ap = 3;
    const h0 = rk.hp;
    t.ok(DD.Combat.interact(c, vA.x, vA.y), 'open sluice A on him');
    t.ok(DD.Act.hasStatus(rk, 'stun') && h0 - rk.hp === RK().FLUSH_DMG, 'the flush still stuns him');
  });

  T.suite('bosses_act1: the flush is never blocked, the killing blow never splits', function (t) {
    if (!have()) { t.skip('boss content not loaded'); return; }
    const valveA = function () { return RK().valves().filter(function (v) { return v.obj.data.chan === 'A'; })[0]; };
    // a downed hero lying in the channel between the King and the drain
    let s = start('boss_rat_king', 23, { noPlan: true });
    let king = byDef('rat_king')[0];
    const lw = byDef('rat_lawyer')[0];
    byDef('rat_lawyer').slice(1).forEach(function (u) { DD.Act.kill(u, null); });
    const m = hero('test_mage'), c = hero('test_cleric');
    place(king, 6, 3); place(m, 3, 3); place(lw, 5, 3); place(c, 8, 5);
    DD.Combat._action(function () { m.hp = 0; m.downed = true; });
    let h0 = king.hp;
    c.ap = 3;
    DD.Combat.interact(c, valveA().x, valveA().y);
    t.eq(h0 - king.hp, RK().FLUSH_DMG, 'the water sweeps the King past a downed hero: FLUSHED for exactly ' + RK().FLUSH_DMG);
    t.ok(DD.Act.hasStatus(king, 'stun') && s.data.rat.flushes === 1, 'stunned, flush counted');
    t.ok(!RK().chanTiles('A').some(function (p) { return p.x === king.x && p.y === king.y; }), 'he climbs out on a walkway');
    t.ok(lw.dead && s.data.rat.drowned === 1, 'his lawyer, stuck behind the same body, drowns too');
    t.ok(m.x === 3 && m.y === 3 && m.downed, 'the downed hero stays where it fell');
    // a flyer hovering over the channel
    s = start('boss_rat_king', 24, { noPlan: true });
    king = byDef('rat_king')[0];
    byDef('rat_lawyer').forEach(function (u) { DD.Act.kill(u, null); });
    const r = hero('test_rogue'), c2 = hero('test_cleric');
    place(king, 6, 4); place(r, 2, 4); place(c2, 8, 5);
    r.flags.flying = true;
    h0 = king.hp;
    c2.ap = 3;
    DD.Combat.interact(c2, valveA().x, valveA().y);
    t.ok(h0 - king.hp === RK().FLUSH_DMG && DD.Act.hasStatus(king, 'stun'), 'a flyer in the way does not save him either');
    t.ok(r.x === 2 && r.y === 4, 'and the flyer stays dry');
    r.flags.flying = false;
    // the killing blow is not a motion to split
    s = start('boss_rat_king', 25, { noPlan: true });
    king = byDef('rat_king')[0];
    byDef('rat_lawyer').forEach(function (u) { DD.Act.kill(u, null); });
    const mm = hero('test_mage');
    place(king, 6, 5); place(mm, 6, 8);
    mm.ap = 3;
    king.hp = 3;
    const fb = slotOf(mm, 'test_fireball');
    if (fb) {
      const prev = DD.Combat.preview(mm, fb, 6, 5);
      t.ok(prev.perUnit[king.id] && prev.perUnit[king.id].lethal, 'the preview shows the kill');
      t.eq((prev.spawned || []).length, 0, 'and no lawyers splitting off');
    }
    const n0 = s.units.length;
    DD.Combat._action(function () { DD.Act.damage(mm, king, 99, { cause: 'other' }); });
    t.ok(king.dead, 'a killing blow while no split has happened yet kills him');
    t.eq(s.units.length, n0, 'no lawyers split off on the way down');
    t.ok(!s.log.some(function (l) { return /splits/.test(l.text); }), 'no split announced');
    t.eq(RK().phaseOf(king), 1, 'he died in phase 1');
  });

  T.suite('bosses_act1: telegraphs tell the truth (buried pile, tails into the pile, red tape after the levy)', function (t) {
    if (!have()) { t.skip('boss content not loaded'); return; }
    const PL = DD.skillLevel(DD.getSkill('rat_pile'), 1), TL = DD.skillLevel(DD.getSkill('rat_tails'), 1);
    const kingFight = function (seed) {
      start('boss_rat_king', seed, { noPlan: true });
      const king = byDef('rat_king')[0];
      byDef('rat_lawyer').forEach(function (u) { DD.Act.kill(u, null); });
      park(PARTY.map(hero), [{ x: 1, y: 11 }, { x: 2, y: 11 }, { x: 11, y: 11 }, { x: 12, y: 11 }]);
      king.mov = 0;
      place(king, 6, 5);
      king.intents = [];
      return king;
    };
    const plan = function (king, list) { list.forEach(function (e) { DD.AI.makeIntent(king, e[0], e[1], { noCooldown: true }); }); };
    const said = function (king, id) { const it = intentsOf(king, id)[0]; return it ? DD.AI.describe(king, it).dmg : null; };
    // a Rooted hero in the pile: the pile shows the buried number (the free hero next to it takes the plain one)
    let king = kingFight(31);
    const m = hero('test_mage'), c = hero('test_cleric');
    place(m, 7, 6); place(c, 5, 5);
    DD.Combat._action(function () { DD.Act.addStatus(m, 'root', { turns: 2 }, null); });
    plan(king, [['rat_pile', king]]);
    t.eq(said(king, 'rat_pile'), PL.rooted, 'with a Rooted hero in it the Rat Pile telegraphs ' + PL.rooted);
    let hm = m.hp, hc = c.hp;
    noGuard(); DD.Combat.endTurn();
    t.eq(hm - m.hp, PL.rooted, 'the Rooted hero takes exactly that');
    t.eq(hc - c.hp, PL.dmg, 'a free hero next to him takes the plain ' + PL.dmg);
    king = kingFight(32);
    place(byDef('test_cleric')[0], 5, 5);
    plan(king, [['rat_pile', king]]);
    t.eq(said(king, 'rat_pile'), PL.dmg, 'nobody Rooted in it: the plain ' + PL.dmg);
    // Tangled Tails into the pile: the reeled-in hero's telegraph carries the whole combo
    king = kingFight(33);
    const c2 = hero('test_cleric');
    place(c2, 6, 8);
    plan(king, [['rat_tails', c2], ['rat_pile', king]]);
    const combo = said(king, 'rat_tails');
    t.eq(combo, TL.dmg + PL.rooted, 'a hero 3 tiles away in a clear line: the tails telegraph ' + TL.dmg + ' + the buried pile ' + PL.rooted);
    t.eq(said(king, 'rat_pile'), PL.dmg, 'while the pile itself still shows ' + PL.dmg + ' to whoever stands in it now');
    let h2 = c2.hp;
    noGuard(); DD.Combat.endTurn();
    t.eq(h2 - c2.hp, combo, 'and the hero loses exactly ' + combo);
    // 5 tiles away in a clear line: the pull leaves the hero 3 short of him, the plain number is what lands
    king = kingFight(34);
    const c3 = hero('test_cleric');
    place(c3, 11, 5);
    plan(king, [['rat_tails', c3], ['rat_pile', king]]);
    t.eq(said(king, 'rat_tails'), TL.dmg, 'too far to be reeled into the pile: just the tails, ' + TL.dmg);
    h2 = c3.hp;
    noGuard(); DD.Combat.endTurn();
    t.ok(c3.x === 9 && c3.y === 5, 'pulled 2 (' + c3.x + ',' + c3.y + ')');
    t.eq(h2 - c3.hp, TL.dmg, 'and only the tails land');
    // the pull would stop short of the pile (Sluice Valve B in the way): no pile in the telegraph, none lands
    king = kingFight(38);
    const c6 = hero('test_cleric');
    place(c6, 6, 10);
    plan(king, [['rat_tails', c6], ['rat_pile', king]]);
    t.eq(said(king, 'rat_tails'), TL.dmg, 'blocked by Sluice Valve B on the way: just the tails, ' + TL.dmg);
    noGuard(); DD.Combat.endTurn();
    t.ok(c6.x === 6 && c6.y === 10 && !DD.Act.hasStatus(c6, 'bleed'), 'the hero stays put behind the valve and never touches the pile');
    // a hook that shortens pulls (Marwyn plants his feet) is consulted
    king = kingFight(35);
    const c4 = hero('test_cleric');
    place(c4, 6, 8);
    DD.Act.addRule({ id: 'ba1_short_pull', name: 'Heavy Boots', hooks: { modifyPush: function (p) { if (p.unit === c4) p.dist -= 1; } } });
    plan(king, [['rat_tails', c4], ['rat_pile', king]]);
    t.eq(said(king, 'rat_tails'), TL.dmg, 'a hero who only gets dragged 1 tile stays out of the pile: ' + TL.dmg);
    h2 = c4.hp;
    noGuard(); DD.Combat.endTurn();
    t.eq(h2 - c4.hp, TL.dmg, 'and that is what lands');
    DD.Act.removeRule('ba1_short_pull');
    // a hero already diagonal to him: the pile shows its plain number to it, the tails add the buried bonus
    king = kingFight(36);
    const c5 = hero('test_cleric');
    place(c5, 7, 6);
    plan(king, [['rat_tails', c5], ['rat_pile', king]]);
    t.eq(said(king, 'rat_tails') + said(king, 'rat_pile'), TL.dmg + PL.rooted, 'already in the pile: tails + pile telegraphs add up to the combo');
    h2 = c5.hp;
    noGuard(); DD.Combat.endTurn();
    t.eq(h2 - c5.hp, TL.dmg + PL.rooted, 'which is what lands');

    // Grimble: the Levy pockets gold last, so a Red Tape planned with it hits for its telegraph
    const s = start('boss_grimble', 37, { noPlan: true });
    const g = byDef('grimble')[0];
    g.mov = 0;
    s.sandboxGold = 100;
    DD.Combat._action(function () { DD.Act.addStatus(g, 'grim_ledger', { stacks: 15, silent: true }, g); g.data.stolen = 15; });
    const k = hero('test_knight'), cc = hero('test_cleric'), mg = hero('test_mage'), rg = hero('test_rogue');
    place(cc, 5, 7); place(mg, 5, 8); place(k, 1, 11); place(rg, 11, 11);
    s.stats.units[cc.id] = { dmg: 50, taken: 0, kills: 0, heals: 0 };
    g.data.patIdx = 0;
    DD.AI.plan(g);
    const tape = intentsOf(g, 'grim_redtape')[0], levy = intentsOf(g, 'grim_levy')[0];
    t.ok(tape && levy && tape.unitId === mg.id && levy.unitId === cc.id, 'Red Tape on the mage, the Levy on the biggest spender');
    t.ok(g.intents.indexOf(tape) < g.intents.indexOf(levy), 'the Levy resolves last');
    const tSaid = tape ? DD.AI.describe(g, tape).dmg : 0, lSaid = levy ? DD.AI.describe(g, levy).dmg : 0;
    g.intents = g.intents.filter(function (i) { return i === tape || i === levy; });    // in the order he planned them
    const hmg = mg.hp, hcc = cc.hp;
    noGuard(); DD.Combat.endTurn();
    t.eq(hmg - mg.hp, tSaid, 'Red Tape deals its telegraphed ' + tSaid + ' though the Levy then lifts him to ' + g.data.stolen + ' gold');
    t.eq(hcc - cc.hp, lSaid, 'and the Levy its ' + lSaid);
    // tracking shots that ignore line of sight say so (core describe fix)
    const gw = DD.AI.makeIntent(g, 'grim_garnish', cc, { noCooldown: true, noAdd: true });
    const lv = DD.AI.makeIntent(g, 'grim_levy', cc, { noCooldown: true, noAdd: true });
    t.ok(/fizzles if out of range\./.test(DD.AI.describe(g, gw).text) && !/range or sight/.test(DD.AI.describe(g, gw).text), 'Garnish Wages: "fizzles if out of range." (no line of sight needed)');
    t.ok(/fizzles if out of range or sight\./.test(DD.AI.describe(g, lv).text), 'the plain Levy still needs line of sight');
  });

  T.suite('bosses_act1: refunds are not income, the last loophole waits for the taxman, quiet status logs', function (t) {
    if (!have()) { t.skip('boss content not loaded'); return; }
    const s = start('boss_grimble', 41, { noPlan: true });
    const g = byDef('grimble')[0];
    const k = hero('test_knight');
    // in a live run the refund goes back raw (no passive gold bonus on your own coins)
    g.data.stolen = 40;
    const fakeRun = { gold: 5 }, calls = [];
    const savedState = DD.Run && DD.Run.state, savedAdd = DD.Run && DD.Run.addGold;
    if (DD.Run) {
      s.run = fakeRun; DD.Run.state = fakeRun;
      DD.Run.addGold = function (n, opts) { calls.push([n, opts]); fakeRun.gold += n; return n; };
      try { DD.Combat._action(function () { GB().dropVault(k); }); } finally { DD.Run.state = savedState; DD.Run.addGold = savedAdd; s.run = null; }
      t.ok(calls.length === 1 && calls[0][0] === 40 && calls[0][1] && calls[0][1].raw === true, 'the vault refund pays the 40 gold back raw: ' + JSON.stringify(calls));
      t.eq(g.data.stolen, 0, 'his ledger is empty');
    }
    // the last pull is only worth it with Grimble himself under the door
    const s2 = start('boss_grimble', 42, { noPlan: true });
    const g2 = byDef('grimble')[0];
    const ls = GB().loopholes(s2);
    ls.forEach(function (l) { l.obj.data.on = true; });
    const last = ls.filter(function (l) { return l.x === 6 && l.y === 7; })[0];
    last.obj.data.on = false;
    place(g2, 8, 7);
    const it = DD.Act.spawn('grim_intern', 4, 2, { silent: true });
    const hint = DD.getObject('grim_loophole').autoplay(k, last.obj, tile(last.x, last.y), s2);
    t.eq(hint, 0, 'only an intern in the DROP ZONE: AutoPlay keeps the last loophole for the taxman');
    place(g2, 5, 3);
    t.eq(DD.getObject('grim_loophole').autoplay(k, last.obj, tile(last.x, last.y), s2), 60 + 8, 'Grimble (60) and his intern (8) under the door');
    t.ok(!!it, 'intern placed');
    // status bookkeeping is logged in words, not "X is <status>"
    const s3 = start('boss_rat_king', 43, { noPlan: true });
    const rk = byDef('rat_king')[0];
    noGuard(); DD.Combat.endTurn();
    t.ok(DD.Act.hasStatus(rk, 'rat_swarm'), 'round 2: Swelling Ranks');
    t.ok(s3.log.some(function (l) { return /More sewer rats pile onto the King: Swelling Ranks 1 \(\+2 damage\)/.test(l.text); }), 'the swarm is announced with its bonus');
    t.ok(!s3.log.some(function (l) { return / is (Swelling Ranks|Court in Session|Recess)/.test(l.text); }), 'no "is Swelling Ranks" log lines');
  });

  // =====================================================================================================
  // AutoPlay balance sims
  // =====================================================================================================
  /**
   * Balance exploration only: tune=grim_levy.levels.0.dmg:12,grimble.hp:200 (skill/enemy/object def paths, or the
   * bosses' knobs: rkcfg.lawyerCap:4, grcfg.<key>:<n>); restored after.
   */
  function applyTune(t) {
    const undo = [];
    String(t.param('tune', '')).split(',').filter(Boolean).forEach(function (kv) {
      const i = kv.lastIndexOf(':');
      const parts = kv.slice(0, i).split('.'), val = kv.slice(i + 1);
      const cfgs = { rkcfg: DD.RatKingBoss && DD.RatKingBoss.cfg, grcfg: DD.GrimbleBoss && DD.GrimbleBoss.cfg };
      let o = cfgs[parts[0]] || DD.getSkill(parts[0]) || DD.getEnemy(parts[0]) || DD.getObject(parts[0]) || DD.getStatus(parts[0]);
      for (let k = 1; o && k < parts.length - 1; k++) o = o[parts[k]];
      if (!o) return;
      const key = parts[parts.length - 1];
      undo.push([o, key, o[key]]);
      o[key] = val === 'true' ? true : val === 'false' ? false : isNaN(+val) ? val : +val;
    });
    if (undo.length) t.log('tune: ' + t.param('tune', ''));
    return function () { undo.reverse().forEach(function (u) { u[0][u[1]] = u[2]; }); };
  }

  /**
   * Balance guard: winnable but not a walkover, and fights of a sane length. The target is 30-70% wins and 6-10
   * rounds (48-fight runs, see docs/notes/bosses-act1.md); with the default 8 fights the guard is looser.
   */
  function moderate(t, r) {
    t.ok(r.wins >= 1, 'the fight is winnable: ' + r.wins + '/' + r.n);
    t.ok(r.wins <= r.n - 1 || r.n < 4, 'and not a walkover: ' + r.wins + '/' + r.n);
    t.ok(r.rounds >= 5 && r.rounds <= 13, 'fights last ' + r.rounds.toFixed(1) + ' rounds on average (target 6-10)');
  }

  function sims(t, encId, label, extra) {
    const restore = applyTune(t);
    try { return runSims(t, encId, label, extra); } finally { restore(); }
  }
  function runSims(t, encId, label, extra) {
    const n = Math.max(1, +(t.param('sims', 8)) || 8);
    let wins = 0, rounds = 0, timeouts = 0;
    const per = [];
    for (let i = 0; i < n; i++) {
      const seed = DD.util.hash(t.seed + ':' + encId + ':' + i) % 100000;
      // party=<id,id,...> or party=random (4 real heroes per fight): exploration only, the guard uses the fixture party
      let heroIds = null;
      const pp = String(t.param('party', ''));
      if (pp === 'random') {
        const real = Object.keys(DD.defs.heroes).filter(function (id) { return id.indexOf('test_') !== 0 && !/^rt_/.test(id); }).sort();
        heroIds = DD.RNG('ba1:party:' + seed).shuffle(real).slice(0, 4);
      } else if (pp) heroIds = pp.split(',');
      const s = start(encId, seed, { vary: true, level: +(t.param('level', 4)) || 4, gold: 60, party: heroIds });
      if (heroIds) t.log('  party ' + heroIds.join(','));
      const taken = {};
      if (t.param('dmglog', '') === '1') {
        DD.Act.addRule({ id: 'ba1_dmglog', name: 'Damage log', hooks: { onTakeDamage: function (d) {
          if (DD.Act.simulating || !d.target || !(d.dealt || d.blocked)) return;
          if (d.target.side !== 'hero') {
            // what the party's damage went into: '>defId' = HP, '>defId#' = Block
            if (d.source && d.source.side === 'hero') {
              taken['>' + d.target.defId] = (taken['>' + d.target.defId] || 0) + (d.dealt || 0);
              if (d.blocked) taken['>' + d.target.defId + '#'] = (taken['>' + d.target.defId + '#'] || 0) + d.blocked;
            }
            return;
          }
          const k = (d.source ? d.source.defId : 'none') + ':' + (d.skill ? d.skill.id : d.cause);
          taken[k] = (taken[k] || 0) + (d.dealt || 0) + (d.blocked || 0);
        } } });
      }
      let off = null;
      if (t.param('hplog', '') === String(i)) {
        off = DD.Events.on('turn:player', function () {
          const st = DD.Combat.state;
          const at = function (u) { return '@' + u.x + ',' + u.y; };
          t.log('    r' + st.round + ' heroes ' + st.units.filter(function (u) { return u.kind === 'hero'; }).map(function (u) { return u.defId.slice(5) + at(u) + ':' + u.hp + (u.block ? '+' + u.block : '') + (u.downed ? 'D' : ''); }).join(' ') +
            ' | foes ' + st.units.filter(function (u) { return u.side === 'enemy' && !u.dead; }).map(function (u) { return u.defId + at(u) + ':' + u.hp + (u.block ? '+' + u.block : '') + '[' + (u.intents || []).map(function (it) { return it.skillId + (it.delay ? '⏳' + it.delay : ''); }).join(',') + ']'; }).join(' '));
        });
      }
      const res = DD.AutoPlay.runBattle(30);
      if (off) off();
      if (Object.keys(taken).length) t.log('  dmg to heroes ' + JSON.stringify(taken));
      if (t.param('fightlog', '') === String(i)) s.log.forEach(function (l) { t.log('    [' + l.round + '] ' + l.text); });
      if (res.result === 'victory') wins++;
      if (res.timeout) timeouts++;
      rounds += res.rounds;
      const info = extra(s);
      info.result = res.result === 'victory' ? 'W' : 'L'; info.rounds = res.rounds; info.downs = s.stats.downs || 0;
      info.heroHp = s.units.filter(function (u) { return u.kind === 'hero'; }).map(function (u) { return u.hp; }).join('/');
      per.push(info);
    }
    t.log(label + ': won ' + wins + '/' + n + ' (' + Math.round(100 * wins / n) + '%), avg rounds ' + (rounds / n).toFixed(1) + ', timeouts ' + timeouts);
    per.forEach(function (p, i) { t.log('  #' + i + ' ' + JSON.stringify(p)); });
    t.eq(timeouts, 0, label + ': AutoPlay battles never time out');
    return { wins: wins, n: n, per: per, rounds: rounds / n };
  }

  T.suite('bosses_act1: grimble autoplay sims (fixture party, level 4)', function (t) {
    if (!have()) { t.skip('boss content not loaded'); return; }
    const r = sims(t, 'boss_grimble', 'Grimble', function (s) {
      const g = DD.GrimbleBoss.data(s);
      const b = s.units.filter(function (u) { return u.defId === 'grimble'; })[0];
      return { pulls: g.pulls, drops: g.drops, hits: g.hits, refiles: g.refiles, bossHp: b ? b.hp : null, phase: b ? b.data.phase : null };
    });
    const pulled = r.per.filter(function (p) { return p.pulls > 0; }).length;
    t.ok(pulled >= Math.ceil(r.n / 2), 'AutoPlay engages the loophole puzzle in most fights (' + pulled + '/' + r.n + ')');
    t.ok(r.per.some(function (p) { return p.hits > 0; }), 'the vault door lands on Grimble in at least one sim');
    t.ok(r.per.some(function (p) { return p.phase === 2; }), 'phase 2 is reached');
    moderate(t, r);
  });

  T.suite('bosses_act1: rat king autoplay sims (fixture party, level 4)', function (t) {
    if (!have()) { t.skip('boss content not loaded'); return; }
    const r = sims(t, 'boss_rat_king', 'Rat King', function (s) {
      const d = (s.data && s.data.rat) || {};
      const k = s.units.filter(function (u) { return u.defId === 'rat_king'; })[0];
      return { sluices: d.sluices || 0, flushes: d.flushes || 0, drowned: d.drowned || 0, kingHp: k ? k.hp : null, splits: k ? k.data.splits : null };
    });
    const used = r.per.filter(function (p) { return p.sluices > 0; }).length;
    t.ok(used >= Math.ceil(r.n / 2), 'AutoPlay opens the sluices in most fights (' + used + '/' + r.n + ')');
    t.ok(r.per.some(function (p) { return p.flushes > 0; }), 'the King gets flushed in at least one sim');
    t.ok(r.per.some(function (p) { return p.splits >= 1; }), 'the King splits in at least one sim');
    t.ok(r.per.some(function (p) { return p.drowned > 0; }), 'a Rat Lawyer gets washed down the drain in at least one sim');
    moderate(t, r);
  });
})();
