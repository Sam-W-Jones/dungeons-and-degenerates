/* Dungeons and Degenerates — tests/balance_tests.js
 * Suites "balance: ..." — deterministic, fast guard rails for DD.Balance (js/data/balance.js) and the levers the balance
 * passes rely on (docs/notes/balance.md): every knob is a sane number, the difficulties stay ordered in every act and
 * fight kind, the act × fight-kind rows compose the way B.scale says, the starting kit gives every party a revive and no
 * generic heal (D9), the act 1 levers of balance pass 1 (regular fights hurt; the act 1 bosses hit a bit harder) stay
 * in place, the act 2 bosses and the DM keep their damage-heavy rows, the DM the hardest (sustain refit 2), and the
 * economy keeps two shops on every act map with a trimmed boss payday and flat prices (sustain refit 3), and the Rat
 * King keeps his shorter-fight HP row (balance audit).
 * No sims here: tools/sim.sh measures win rates; these suites only catch a later change silently undoing a lever.
 */
(function () {
  'use strict';
  const T = window.DD_TEST;
  const DD = window.DD;
  if (!T || !DD) return;

  const KINDS = ['normal', 'elite', 'boss'];
  const DIFFS = ['casual', 'normal', 'brutal'];
  function B() { return DD.Balance; }
  function num(v) { return typeof v === 'number' && isFinite(v); }
  function pos(v) { return num(v) && v > 0; }
  function json(v) { return JSON.stringify(v); }

  /** Run fn with DD.Balance restored afterwards (knob experiments inside a suite never leak). */
  function withKnobs(fn) {
    const snap = B().snapshot();
    try { return fn(); } finally { B().restore(snap); }
  }

  // ---- 1. shape --------------------------------------------------------------------------------------------------
  T.suite('balance: every DD.Balance knob is a sane number', function (t) {
    const b = B();
    t.ok(!!b && typeof b.scale === 'function' && typeof b.get === 'function' && typeof b.set === 'function', 'DD.Balance and its helpers exist');
    if (!b) return;
    DIFFS.forEach(function (d) { t.ok(pos(b.difficulty[d].hp) && pos(b.difficulty[d].dmg), 'difficulty.' + d + ' hp / dmg > 0'); });
    [1, 2, 3].forEach(function (a) {
      const row = b.act[a];
      t.ok(!!row && pos(row.hp) && pos(row.dmg), 'act.' + a + ' hp / dmg > 0');
      KINDS.forEach(function (k) {
        if (row && row[k] !== undefined) t.ok(row[k] && typeof row[k] === 'object' && pos(row[k].hp === undefined ? 1 : row[k].hp) && pos(row[k].dmg === undefined ? 1 : row[k].dmg), 'act.' + a + '.' + k + ': an object with hp / dmg > 0');
      });
      Object.keys(row || {}).forEach(function (key) {
        t.ok(key === 'hp' || key === 'dmg' || KINDS.indexOf(key) >= 0, 'act.' + a + ': only hp, dmg and fight-kind rows (' + key + ')');
      });
    });
    KINDS.forEach(function (k) { t.ok(pos(b.kind[k].hp) && pos(b.kind[k].dmg), 'kind.' + k + ' hp / dmg > 0'); });
    Object.keys(b.encounters || {}).forEach(function (id) {
      const e = b.encounters[id];
      t.ok(pos(e.hp === undefined ? 1 : e.hp) && pos(e.dmg === undefined ? 1 : e.dmg), 'encounters.' + id + ' hp / dmg > 0');
      if (Object.keys(DD.defs.encounters || {}).length > 20) t.ok(!!DD.defs.encounters[id], 'encounters.' + id + ' is a registered encounter');
    });
    ['minion', 'normal', 'elite', 'boss'].forEach(function (k) {
      t.ok(pos(b.tierHp[k]), 'tierHp.' + k + ' > 0');
      t.ok(num(b.enemyMov[k]) && b.enemyMov[k] >= 0 && b.enemyMov[k] === Math.round(b.enemyMov[k]), 'enemyMov.' + k + ' is a whole number ≥ 0');
    });
    DIFFS.forEach(function (d) {
      KINDS.forEach(function (k) {
        t.ok(num(b.extraEnemies[d][k]) && b.extraEnemies[d][k] >= 0, 'extraEnemies.' + d + '.' + k + ' ≥ 0');
        const w = b.waves[d][k];
        t.ok(w === null || (w && w.round >= 1 && w.n >= 1), 'waves.' + d + '.' + k + ': null or { round ≥ 1, n ≥ 1 }');
      });
    });
    Object.keys(b.hype).forEach(function (k) { t.ok(num(b.hype[k]) && b.hype[k] >= 0, 'hype.' + k + ' ≥ 0'); });
    t.ok(b.hype.kill > 0 && b.hype.envKill >= b.hype.kill, 'Hype: a kill pays, an environmental kill pays at least as much');
    KINDS.forEach(function (k) {
      const x = b.xp[k];
      t.ok(Array.isArray(x) && x.length === 3 && x.every(pos) && x[0] <= x[1] && x[1] <= x[2], 'xp.' + k + ': three rising numbers');
      const g = b.gold.fight[k];
      t.ok(Array.isArray(g) && g.length === 2 && g.every(num) && g[0] >= 0 && g[0] <= g[1], 'gold.fight.' + k + ': [min, max]');
    });
    t.ok(b.gold.fight.normal[1] <= b.gold.fight.elite[0] && b.gold.fight.elite[1] <= b.gold.fight.boss[0], 'gold: normal < elite < boss fights');
    ['pile', 'treasure'].forEach(function (k) { t.ok(b.gold[k][0] <= b.gold[k][1] && b.gold[k][0] >= 0, 'gold.' + k + ': [min, max]'); });
    t.ok(num(b.gold.start) && b.gold.start >= 0, 'gold.start ≥ 0');
    Object.keys(b.prices).forEach(function (k) { t.ok(pos(b.prices[k]), 'prices.' + k + ' > 0'); });
    t.ok(b.prices.common < b.prices.rare && b.prices.rare < b.prices.legendary, 'prices: common < rare < legendary');
    [1, 2, 3].forEach(function (a) { t.ok(pos(b.priceAct[a]), 'priceAct.' + a + ' > 0'); });
    Object.keys(b.heal).forEach(function (k) { t.ok(pos(b.heal[k]) && b.heal[k] <= 1, 'heal.' + k + ' in (0, 1]'); });
    Object.keys(b.map.weights).forEach(function (k) { t.ok(num(b.map.weights[k]) && b.map.weights[k] >= 0, 'map.weights.' + k + ' ≥ 0'); });
    t.ok(num(b.map.minShops) && b.map.minShops >= 0, 'map.minShops ≥ 0');
    t.ok(!!b.start && Array.isArray(b.start.consumables), 'start.consumables is a list');
    t.ok(b.start.items === undefined || Array.isArray(b.start.items), 'start.items is a list (or absent)');
  });

  // ---- 2. difficulty ordering ------------------------------------------------------------------------------------------
  T.suite('balance: difficulties stay ordered (casual < normal < brutal) in every act and fight kind', function (t) {
    const b = B();
    [1, 2, 3].forEach(function (a) {
      KINDS.forEach(function (k) {
        const c = b.scale('casual', a, k), n = b.scale('normal', a, k), x = b.scale('brutal', a, k);
        t.ok(c.hp < n.hp && n.hp < x.hp, 'act ' + a + ' ' + k + ': enemy HP casual ' + c.hp + ' < normal ' + n.hp + ' < brutal ' + x.hp);
        t.ok(c.dmg < n.dmg && n.dmg < x.dmg, 'act ' + a + ' ' + k + ': enemy damage casual ' + c.dmg + ' < normal ' + n.dmg + ' < brutal ' + x.dmg);
      });
    });
    KINDS.forEach(function (k) {
      t.ok(b.extraOf('casual', k) <= b.extraOf('normal', k) && b.extraOf('normal', k) <= b.extraOf('brutal', k), k + ' fights: extra grunts casual ≤ normal ≤ brutal');
    });
    t.eq(json(b.scale('normal', 1, 'normal', { neutral: true })), json({ id: 'normal', hp: 1, dmg: 1 }), 'a normal sandbox fight stays neutral (tests and debug)');
    t.eq(b.scale('nonsense', 1, 'normal').id, 'normal', 'an unknown difficulty reads as normal');
  });

  // ---- 3. composition ------------------------------------------------------------------------------------------------
  T.suite('balance: scale = difficulty × act × act-kind row × kind × encounter (rows only reach their own fights)', function (t) {
    withKnobs(function () {
      const b = B();
      b.difficulty.normal = { hp: 1, dmg: 1 };
      b.act = { 1: { hp: 1.5, dmg: 1.2, normal: { hp: 2, dmg: 3 } }, 2: { hp: 1, dmg: 1 }, 3: { hp: 1, dmg: 1 } };
      b.kind = { normal: { hp: 1.1, dmg: 1 }, elite: { hp: 1, dmg: 1 }, boss: { hp: 1, dmg: 0.5 } };
      b.encounters = { test_enc: { hp: 0.5, dmg: 2 } };
      t.eq(json(b.scale('normal', 1, 'normal')), json({ id: 'normal', hp: 3.3, dmg: 3.6 }), 'act 1 normal: 1.5 × 2 × 1.1 HP, 1.2 × 3 damage');
      t.eq(json(b.scale('normal', 1, 'elite')), json({ id: 'normal', hp: 1.5, dmg: 1.2 }), 'act 1 elite: the act row only (no normal-fight row)');
      t.eq(json(b.scale('normal', 1, 'boss')), json({ id: 'normal', hp: 1.5, dmg: 0.6 }), 'act 1 boss: act row × boss kind row');
      t.eq(json(b.scale('normal', 2, 'normal')), json({ id: 'normal', hp: 1.1, dmg: 1 }), 'act 2 normal: act 1\'s rows never leak into act 2');
      t.eq(json(b.scale('normal', 1, 'normal', { encounter: 'test_enc' })), json({ id: 'normal', hp: 1.65, dmg: 7.2 }), 'an encounter row multiplies on top');
      t.eq(json(b.scale('normal', 1, 'normal', { neutral: true })), json({ id: 'normal', hp: 1, dmg: 1 }), 'sandbox fights ignore every row');
      b.act[1].normal = 'junk';
      t.eq(json(b.scale('normal', 1, 'normal')), json({ id: 'normal', hp: 1.65, dmg: 1.2 }), 'a junk act-kind row is ignored');
    });
    t.ok(B().act[1].normal === undefined || typeof B().act[1].normal === 'object', 'the real knobs are back (restore)');
  });

  // ---- 4. get / set / snapshot -------------------------------------------------------------------------------------------
  T.suite('balance: get / set by path, snapshot / restore (what sims use for bal= overrides)', function (t) {
    const b = B();
    const before = json(b.snapshot());
    withKnobs(function () {
      const prev = b.set('act.1.normal.dmg', 9);
      t.eq(b.get('act.1.normal.dmg'), 9, 'set + get by dotted path');
      t.eq(b.scale('normal', 1, 'normal').dmg, Math.round(9 * b.act[1].dmg * b.kind.normal.dmg * 1000) / 1000, 'the per-kind row set by path is read by scale');
      t.ok(prev === undefined || num(prev), 'set returns the previous value');
      b.set('brand.new.knob', 3);
      t.eq(b.get('brand.new.knob'), 3, 'set creates missing objects');
      t.eq(b.get('no.such.path'), undefined, 'a missing path reads undefined');
    });
    t.eq(json(b.snapshot()), before, 'restore puts every knob back exactly');
  });

  // ---- 5. act 1 levers (balance pass 1) ---------------------------------------------------------------------------
  T.suite('balance: act 1 levers (pass 1, re-fitted by the sustain refit) — regular fights hurt, the act 1 bosses are shorter and deadlier, nothing else moves with them', function (t) {
    const b = B();
    const n = b.scale('normal', 1, 'normal'), e = b.scale('normal', 1, 'elite'), x = b.scale('normal', 1, 'boss');
    t.ok(n.dmg >= 1.15, 'act 1 regular fights hit harder than the content numbers (×' + n.dmg + ' damage; the user: "regular fights should hurt")');
    t.ok(n.hp >= 1.05, 'act 1 regular fights last a little longer (×' + n.hp + ' enemy HP)');
    t.ok(n.dmg <= 1.5 && n.hp <= 1.4, 'but not by a silly amount (won 95%+ in the sims: docs/notes/balance.md)');
    t.ok(e.dmg <= n.dmg && e.hp <= n.hp, 'act 1 elites are not pushed past the regular fights by the same lever');
    // balance pass 3 (sustain refit, sized after D9 removed the starting heal): shorter, deadlier act 1 boss fights. Boss
    // damage costs a party with a healer more than one without (fewer rounds to heal through), boss HP the other way
    // round, so the row trades HP for damage (60-70% won; the healer gap narrowed from ~28 to ~24 points:
    // docs/notes/balance.md "Sustain refit - act 1")
    t.ok(x.dmg >= 1.2 && x.dmg <= 1.5, 'the act 1 bosses hit ×' + x.dmg + ' (1.2-1.5: the sustain refit\'s row)');
    t.ok(x.hp >= 0.8 && x.hp <= 1, 'the act 1 boss row adds no HP (×' + x.hp + ': the fights get shorter, never longer)');
    t.ok(x.hp * x.dmg >= 1.1 && x.hp * x.dmg <= 1.35, 'and the boss fight as a whole is a bit harder than its content numbers (HP × damage ' + Math.round(x.hp * x.dmg * 100) / 100 + ')');
    [2, 3].forEach(function (a) {
      const before = json(b.scale('normal', a, 'normal')), beforeBoss = json(b.scale('normal', a, 'boss'));
      withKnobs(function () {
        B().set('act.1.normal.dmg', 7);
        B().set('act.1.normal.hp', 7);
        B().set('act.1.boss.dmg', 7);
        t.eq(json(B().scale('normal', a, 'normal')), before, 'act ' + a + ' normal fights never read act 1\'s regular-fight row');
        t.eq(json(B().scale('normal', a, 'boss')), beforeBoss, 'act ' + a + ' bosses never read act 1\'s boss row');
      });
      t.ok(!b.act[a].normal || b.act[a].normal !== b.act[1].normal, 'act ' + a + ' does not share act 1\'s row object');
    });
    // a real act 1 fight reads the act 1 normal row (encounter.js / combat.js go through B.scale)
    const enc = DD.getEncounter && DD.getEncounter('a1_goblin_ambush');
    if (enc && DD.getHero('test_knight') && DD.Encounter && DD.Combat && DD.Combat.makeRunHero) {
      const party = ['test_knight', 'test_mage'].map(function (id) { return DD.Combat.makeRunHero({ id: id, level: 1 }); });
      const setup = DD.Encounter.build(enc, party, { rng: DD.RNG('bal:a1'), difficulty: 'normal', act: 1 });
      DD.Combat.start(setup, { seed: 5, headless: true, difficulty: 'normal', kind: 'normal' });
      const s = DD.Combat.state;
      t.ok(!!s && Math.abs(s.difficulty.dmg - n.dmg) < 1e-9 && Math.abs(s.difficulty.hp - n.hp) < 1e-9,
        'a real act 1 goblin ambush starts at ×' + (s && s.difficulty.hp) + ' HP / ×' + (s && s.difficulty.dmg) + ' damage');
      const grunt = s && s.units.filter(function (u) { return u.defId === 'a1_gob_grunt'; })[0];
      if (grunt) t.eq(grunt.maxHp, Math.max(1, Math.round(DD.getEnemy('a1_gob_grunt').hp * n.hp * B().tierHpOf('normal'))), 'its grunts have the scaled HP');
      if (DD.FX && DD.FX.reset) DD.FX.reset();
    } else t.log('(act 1 encounters not loaded: the live check is skipped)');
    // ...and a real act 1 boss fight reads the boss row (Grimble with his scaled HP)
    const benc = DD.getEncounter && DD.getEncounter('boss_grimble'), gdef = DD.getEnemy && DD.getEnemy('grimble');
    if (benc && gdef && DD.getHero('test_knight') && DD.Encounter && DD.Combat && DD.Combat.makeRunHero) {
      const party = ['test_knight', 'test_mage', 'test_cleric', 'test_rogue'].map(function (id) { return DD.Combat.makeRunHero({ id: id, level: 2 }); });
      const setup = DD.Encounter.build(benc, party, { rng: DD.RNG('bal:a1boss'), difficulty: 'normal', act: 1 });
      DD.Combat.start(setup, { seed: 5, headless: true, difficulty: 'normal', kind: 'boss' });
      const s = DD.Combat.state;
      t.ok(!!s && Math.abs(s.difficulty.dmg - x.dmg) < 1e-9 && Math.abs(s.difficulty.hp - x.hp) < 1e-9,
        'a real Grimble fight starts at ×' + (s && s.difficulty.hp) + ' HP / ×' + (s && s.difficulty.dmg) + ' damage');
      const g = s && s.units.filter(function (u) { return u.defId === 'grimble'; })[0];
      if (g) t.eq(g.maxHp, Math.max(1, Math.round(gdef.hp * x.hp * B().tierHpOf('boss'))), 'Grimble has ' + (g && g.maxHp) + ' HP (' + gdef.hp + ' × ' + x.hp + ')');
      if (DD.FX && DD.FX.reset) DD.FX.reset();
    } else t.log('(act 1 bosses not loaded: the boss live check is skipped)');
  });

  // ---- 6. the starting kit (D9) ---------------------------------------------------------------------------------------
  // D9 (the user, Nov 12): no generic heal handed to every party (balance pass 1's First-Aid Fanny Pack left the kit);
  // sustain comes from the heroes themselves. The kit is a revive that waits for a down.
  const FANNY = 'first_aid_fanny_pack';
  T.suite('balance: every party starts the run with a revive and no generic heal (the starting kit, D9)', function (t) {
    const kit = B().start.consumables, items = B().start.items || [];
    t.ok(kit.length >= 1 && kit.length <= 3, 'the kit fits in the default 3 pockets (' + kit.length + ')');
    t.eq(items.length, 0, 'no starting item: D9 (' + json(items) + ')');
    if (!DD.getConsumable('con_ice_bucket')) { t.log('(kit content not loaded: shape only)'); return; }
    kit.forEach(function (id) { t.ok(!!DD.getConsumable(id), id + ' is a registered consumable'); });
    // the guard, should someone add a starting item back: none of them may tick every turn (a heal for every party)
    items.forEach(function (id) {
      const d = DD.getItem(id), h = (d && d.hooks) || {};
      t.ok(!!d && typeof h.onTurnStart !== 'function' && typeof h.onTurnEnd !== 'function', id + ': no turn-start / turn-end hook (no recurring heal: D9)');
    });
    const defs = kit.map(function (id) { return DD.getConsumable(id); });
    // the kit only revives: a consumable only a downed ally can be targeted with waits for the moment it matters
    defs.forEach(function (d, i) {
      t.ok(!!d && !!d.target && d.target.filter === 'downedAlly', kit[i] + ' only targets a downed ally (the kit is a revive, not a heal)');
    });
    if (!DD.Run || !DD.Run.newRun || !DD.getHero('test_knight')) return;
    const savedUi = DD.Run.useUi, savedMeta = DD.util.deepClone(DD.Meta.data), savedRun = DD.Run.state;
    DD.Run.useUi = false;
    function worn(s, id) { return s.party.filter(function (h) { return h.items && h.items[DD.getItem(id).slot] === id; }).length; }
    try {
      const s = DD.Run.newRun(['test_knight', 'test_mage', 'test_cleric', 'test_rogue'], 'normal', 'bal-kit');
      t.eq(json(s.consumables), json(kit), 'a fresh run starts with the kit in its pockets');
      t.ok(s.consumables.length <= s.maxConsumables, 'and it fits');
      if (DD.getItem(FANNY)) t.ok(worn(s, FANNY) === 0 && s.inventory.indexOf(FANNY) < 0, 'nobody starts with the First-Aid Fanny Pack (D9: it is ordinary loot)');
      const s2 = DD.Run.newRun(['test_knight', 'test_mage'], 'brutal', 'bal-kit-2');
      t.eq(json(s2.consumables), json(kit), 'every difficulty and party size gets the same kit');
      withKnobs(function () {
        // start.items still works (a sim or a later pass may hand out an item): it is equipped like loot, on one hero
        if (DD.getItem(FANNY)) {
          B().start.items = [FANNY];
          const s4 = DD.Run.newRun(['test_knight', 'test_mage'], 'normal', 'bal-kit-4');
          t.eq(worn(s4, FANNY), 1, 'start.items = [' + FANNY + ']: exactly one hero wears it from the start');
          t.ok(s4.inventory.indexOf(FANNY) < 0, 'equipped, not left in the bag');
        } else t.log('(' + FANNY + ' not loaded: the start.items case is skipped)');
        B().start.consumables = ['con_red_drink', 'no_such_thing', 'con_red_drink', 'con_red_drink', 'con_red_drink'];
        B().start.items = ['no_such_item'];
        const s3 = DD.Run.newRun(['test_knight'], 'normal', 'bal-kit-3');
        t.eq(json(s3.consumables), json(['con_red_drink', 'con_red_drink', 'con_red_drink']), 'unknown ids are skipped and the pockets cap the kit');
        t.ok(s3.inventory.length === 0 && !s3.party[0].items.trinket, 'an unknown starting item is skipped');
      });
    } finally {
      DD.Run.useUi = savedUi;
      DD.Run.state = savedRun || null;
      if (!savedRun) DD.Storage.remove(DD.Run.SAVE_KEY);
      DD.Meta.data = savedMeta;
      DD.Meta.save();
    }
  });

  // ---- 7. acts 2-3: the boss rows (balance pass 2; landed by sustain refit 2) -------------------------------------------
  // A campaign party reaches the act 2 bosses and the DM with levels, items and Blessings: at the content numbers they
  // were won 95-100% (balance.md, pass 2 and sustain refit 2). Each of them carries its own DD.Balance.encounters row; the
  // finale is the hardest boss. The rows lean on damage (sustain refit 2: shorter, deadlier fights split less by healer;
  // more HP mostly lengthens the Lich's Late Fees clock and Iris's fights toward her closing time). The rows reach only
  // their own fight (the fixture encounters the hero suites battle stay put).
  const LATE_BOSSES = { boss_lichtenstein: 'lichtenstein', boss_dr_iris: 'dr_iris', boss_dm: 'dungeon_master' };
  T.suite('balance: acts 2-3 levers (pass 2) — the act 2 bosses and the DM carry their own rows, the DM hardest; nothing else moves with them', function (t) {
    const b = B();
    function row(id) { return (b.encounters || {})[id] || {}; }
    function f(v) { return num(v) ? v : 1; }
    Object.keys(LATE_BOSSES).forEach(function (id) {
      const r = row(id), hp = f(r.hp), dmg = f(r.dmg);
      t.ok(hp >= 1 && dmg >= 1 && hp * dmg >= 1.4, id + ': harder than its content numbers (×' + hp + ' HP, ×' + dmg + ' damage; at ×1 a campaign party won 95-98%)');
      t.ok(hp <= 1.8 && dmg <= 1.6, id + ': but not by a silly amount (×' + hp + ' HP, ×' + dmg + ' damage)');
      t.ok(dmg >= hp, id + ': the row leans on damage, not HP (×' + dmg + ' damage ≥ ×' + hp + ' HP: long fights favour the starting healers)');
      const c = b.scale('casual', 2, 'boss', { encounter: id }), n = b.scale('normal', 2, 'boss', { encounter: id }), x = b.scale('brutal', 2, 'boss', { encounter: id });
      t.ok(c.hp < n.hp && n.hp < x.hp && c.dmg < n.dmg && n.dmg < x.dmg, id + ': casual < normal < brutal still holds with the row');
    });
    const dm = row('boss_dm');
    ['boss_lichtenstein', 'boss_dr_iris'].forEach(function (id) {
      const r = row(id);
      t.ok(f(dm.hp) * f(dm.dmg) >= f(r.hp) * f(r.dmg), 'the DM\'s row is at least ' + id + '\'s (the finale is the hardest boss for the party that reaches it)');
    });
    // the rows never leak: an act's other fights and the fixture encounters read only the act and kind rows
    [2, 3].forEach(function (a) {
      const plain = json(b.scale('normal', a, 'boss')), fixture = json(b.scale('normal', a, 'boss', { encounter: 'test_a' + a + '_boss' }));
      t.eq(fixture, plain, 'act ' + a + ': the fixture boss fight (test_a' + a + '_boss) reads no boss row');
      t.eq(json(b.scale('normal', a, 'normal', { encounter: 'a' + a + '_no_such_fight' })), json(b.scale('normal', a, 'normal')), 'act ' + a + ': an encounter without a row is unchanged');
    });
    // a real fight starts at the scaled numbers (combat.js reads the encounter row through B.scale)
    if (!DD.Encounter || !DD.Combat || !DD.Combat.makeRunHero || !DD.getHero('test_knight')) { t.log('(no fixture heroes: the live check is skipped)'); return; }
    Object.keys(LATE_BOSSES).forEach(function (id) {
      const enc = DD.getEncounter && DD.getEncounter(id), def = DD.getEnemy(LATE_BOSSES[id]);
      if (!enc || !def) { t.log('(' + id + ' not loaded: its live check is skipped)'); return; }
      const party = ['test_knight', 'test_cleric', 'test_mage', 'test_rogue'].map(function (h) { return DD.Combat.makeRunHero({ id: h, level: enc.act === 3 ? 5 : 4 }); });
      const setup = DD.Encounter.build(enc, party, { rng: DD.RNG('bal:' + id), difficulty: 'normal', act: enc.act });
      DD.Combat.start(setup, { seed: 7, headless: true, difficulty: 'normal', kind: 'boss' });
      const s = DD.Combat.state, sc = b.scale('normal', enc.act, 'boss', { encounter: id });
      const boss = s && s.units.filter(function (u) { return u.defId === def.id; })[0];
      t.ok(!!s && Math.abs(s.difficulty.hp - sc.hp) < 1e-9 && Math.abs(s.difficulty.dmg - sc.dmg) < 1e-9, id + ': a real fight starts at ×' + sc.hp + ' HP / ×' + sc.dmg + ' damage');
      if (boss) t.eq(boss.maxHp, Math.max(1, Math.round(def.hp * sc.hp * B().tierHpOf('boss'))), id + ': ' + def.name + ' has ' + boss.maxHp + ' HP (' + def.hp + ' × ' + sc.hp + ')');
      if (DD.FX && DD.FX.reset) DD.FX.reset();
    });
  });

  // ---- 8. the economy (sustain refit 3) --------------------------------------------------------------------------------
  // AutoPlay runs reached the DM with ~245 unspent gold (the target: under ~150): a visit spent most of the purse, but
  // one shop per act map meant half the runs never saw one in an act. Two shops per map fixed the access; act price
  // inflation (fewer purchases, the hoard barely moved) and a bigger stock (AutoPlay's wants are the cap) were measured
  // and rejected; the gold that lands where nothing can be bought shrank instead (the act bosses' payday, the per-act
  // growth of regular-fight gold). docs/notes/balance.md "Sustain refit - difficulties and economy".
  T.suite('balance: the economy (sustain refit 3) — two shops on every act map, a smaller boss payday, flat regular-fight gold and prices, Mystery Stew 35%', function (t) {
    const b = B();
    t.ok(b.map.minShops >= 2, 'every act map guarantees at least two shops (map.minShops ' + b.map.minShops + ')');
    t.ok(b.gold.fight.boss[0] >= b.gold.fight.elite[1], 'a boss still pays at least an elite\'s best (' + json(b.gold.fight.boss) + ' vs ' + json(b.gold.fight.elite) + ')');
    t.ok(b.gold.fight.boss[1] <= 80, 'the act bosses\' payday stays trimmed (' + json(b.gold.fight.boss) + ': at 80-100 runs reached the DM with ~245 unspent gold)');
    t.ok(b.gold.fightPerAct.normal <= 3, 'regular fights pay (almost) the same in every act (+' + b.gold.fightPerAct.normal + ' per act)');
    [1, 2, 3].forEach(function (a) { t.eq(b.priceMultOf(a), 1, 'act ' + a + ': no act price inflation (measured: fewer purchases for the same hoard)'); });
    t.eq(b.heal.reward, 0.35, 'Mystery Stew heals 35% (the spec\'s out-of-combat lever for parties without a healer; never a starting heal)');
    if (DD.Rewards && DD.Rewards.combatGold) {
      const r = DD.RNG('bal:gold');
      let lo1 = Infinity, hi1 = -Infinity, lo3 = Infinity, hi3 = -Infinity, bossHi = -Infinity;
      for (let i = 0; i < 200; i++) {
        const g1 = DD.Rewards.combatGold('normal', 1, r), g3 = DD.Rewards.combatGold('normal', 3, r);
        lo1 = Math.min(lo1, g1); hi1 = Math.max(hi1, g1); lo3 = Math.min(lo3, g3); hi3 = Math.max(hi3, g3);
        bossHi = Math.max(bossHi, DD.Rewards.combatGold('boss', 2, r));
      }
      const per = b.gold.fightPerAct.normal * 2;
      t.ok(lo3 === lo1 + per && hi3 === hi1 + per, 'an act 3 regular fight pays ' + lo3 + '-' + hi3 + ' (act 1: ' + lo1 + '-' + hi1 + ', + ' + per + ')');
      t.ok(bossHi <= b.gold.fight.boss[1], 'the act 2 boss pays at most ' + b.gold.fight.boss[1] + ' (' + bossHi + ' in 200 rolls)');
      const stew = DD.Rewards.healReward();
      t.ok(stew.amount === b.heal.reward && stew.desc.indexOf(Math.round(b.heal.reward * 100) + '%') >= 0, 'the Mystery Stew reward heals and says ' + Math.round(b.heal.reward * 100) + '%: ' + stew.desc);
    }
    if (!DD.RunMap || !DD.RunMap.generate) { t.log('(no DD.RunMap: the map check is skipped)'); return; }
    // the generator places the guaranteed shops where the map's rules allow (one per row, never a shop right after a
    // shop, a row keeps its only fight): a small share of maps has room for just one
    let short = 0, none = 0, maps = 0, badRow = 0;
    for (let seed = 0; seed < 100; seed++) {
      for (let a = 1; a <= 3; a++) {
        const m = DD.RunMap.generate(a, DD.RNG('bal-shops:' + seed + ':' + a));
        maps++;
        let shops = 0;
        for (let r = 1; r < 6; r++) {
          const inRow = m.layout[r].filter(function (id) { return m.nodes[id].type === 'shop'; }).length;
          shops += inRow;
          if (inRow > 1) badRow++;
        }
        if (shops < b.map.minShops) short++;
        if (!shops) none++;
      }
    }
    t.ok(short / maps <= 0.05, maps + ' act maps: ' + Math.round(100 * (maps - short) / maps) + '% have at least ' + b.map.minShops + ' shops (the rest: no room)');
    t.eq(none, 0, 'every act map has a shop');
    t.eq(badRow, 0, 'still at most one shop per row');
  });

  // ---- 9. the Rat King's row (balance audit, Nov 14) -------------------------------------------------------------------
  // On top of act 1's boss row the Rat King was a coin flip for parties without a starting healer (51% of 310 fights,
  // Grimble 56%): his Swelling Ranks soft timer grows every round, so his long fights punish the parties that can't heal
  // through them. A ×0.9 HP row shortens the fight (same seeds: 51% -> 57% for them, the act 1 bosses 66% -> 69%).
  // docs/notes/balance.md "Balance audit".
  T.suite('balance: the Rat King carries a shorter-fight row (balance audit) — HP only, Grimble untouched, still harder than his content numbers', function (t) {
    const b = B(), r = (b.encounters || {}).boss_rat_king || {};
    const hp = num(r.hp) ? r.hp : 1, dmg = num(r.dmg) ? r.dmg : 1;
    t.ok(hp >= 0.8 && hp < 1, 'boss_rat_king: a shorter fight (×' + hp + ' HP)');
    t.eq(dmg, 1, 'boss_rat_king: no damage row (his hits stay at act 1\'s boss row)');
    t.ok(!(b.encounters || {}).boss_grimble, 'Grimble carries no row of his own');
    const rk = b.scale('normal', 1, 'boss', { encounter: 'boss_rat_king' }), gr = b.scale('normal', 1, 'boss', { encounter: 'boss_grimble' });
    t.eq(json(gr), json(b.scale('normal', 1, 'boss')), 'Grimble reads only the act 1 boss row');
    t.ok(rk.hp * rk.dmg >= 1, 'the Rat King\'s fight as a whole stays at least as hard as his content numbers (HP × damage ' + Math.round(rk.hp * rk.dmg * 100) / 100 + ')');
    const c = b.scale('casual', 1, 'boss', { encounter: 'boss_rat_king' }), x = b.scale('brutal', 1, 'boss', { encounter: 'boss_rat_king' });
    t.ok(c.hp < rk.hp && rk.hp < x.hp && c.dmg < rk.dmg && rk.dmg < x.dmg, 'casual < normal < brutal still holds with the row');
    // a real Rat King fight starts at the scaled numbers (combat.js reads the encounter row through B.scale)
    const enc = DD.getEncounter && DD.getEncounter('boss_rat_king'), def = DD.getEnemy && DD.getEnemy('rat_king');
    if (!enc || !def || !DD.Encounter || !DD.Combat || !DD.Combat.makeRunHero || !DD.getHero('test_knight')) { t.log('(the Rat King or the fixture heroes are not loaded: the live check is skipped)'); return; }
    const party = ['test_knight', 'test_cleric', 'test_mage', 'test_rogue'].map(function (h) { return DD.Combat.makeRunHero({ id: h, level: 2 }); });
    const setup = DD.Encounter.build(enc, party, { rng: DD.RNG('bal:rk'), difficulty: 'normal', act: 1 });
    DD.Combat.start(setup, { seed: 7, headless: true, difficulty: 'normal', kind: 'boss' });
    const s = DD.Combat.state, king = s && s.units.filter(function (u) { return u.defId === 'rat_king'; })[0];
    t.ok(!!s && Math.abs(s.difficulty.hp - rk.hp) < 1e-9 && Math.abs(s.difficulty.dmg - rk.dmg) < 1e-9, 'a real Rat King fight starts at ×' + rk.hp + ' HP / ×' + rk.dmg + ' damage');
    if (king) t.eq(king.maxHp, Math.max(1, Math.round(def.hp * rk.hp * B().tierHpOf('boss'))), 'the Rat King has ' + (king && king.maxHp) + ' HP (' + def.hp + ' × ' + rk.hp + ')');
    if (DD.FX && DD.FX.reset) DD.FX.reset();
  });

  // ---- 10. finish run (Nov 14): the late-boss fixes that moved numbers --------------------------------------------------
  // FF-1: Lich-tenstein's Late Fees stop at a cap (uncapped they reached +35-60 and every Overdue Notice downed a full-HP
  // hero); +6 / +7 a turn fill it in two of his turns and ×1.3 HP holds his difficulty (500 paired fights 60% -> 64%).
  // FF-4: Dr. Iris closes at round 10 with ×1.1 HP: 2-3 rounds shorter at the same win rate (63% -> 65%).
  // audit-8: Slate moves 4. docs/notes/balance.md "Finish (Nov 14)".
  T.suite('balance: finish (Nov 14) — the Lich\'s fees have a ceiling, Iris closes at round 10, Slate moves 4; the rows still lean on damage', function (t) {
    const b = B(), lich = DD.Act2Bosses && DD.Act2Bosses.lich, iris = DD.Act2Bosses && DD.Act2Bosses.iris;
    const lr = (b.encounters || {}).boss_lichtenstein || {}, ir = (b.encounters || {}).boss_dr_iris || {};
    if (lich) {
      const N = lich.N, notice = Math.round(N.notice * (lr.dmg || 1));
      t.ok(N.feeCap > 0 && N.feeCap <= 16, 'Late Fees stop at ' + N.feeCap + ' (a notice at the cap: ' + notice + ' + ' + N.feeCap + ' = ' + (notice + N.feeCap) + ' at normal)');
      t.ok(N.feeRate >= N.feeCap / 2 && N.feeRate2 >= N.feeRate, 'the clock fills in two of his turns (+' + N.feeRate + ', +' + N.feeRate2 + ' below half HP)');
      t.ok(notice + N.feeCap <= 32, 'the capped notice stays a hit a healthy level 4 hero survives (≤ 32)');
    } else t.log('(lich.js not loaded)');
    t.ok(lr.hp === 1.3 && lr.dmg === 1.5, 'boss_lichtenstein ×' + lr.hp + ' HP / ×' + lr.dmg + ' damage');
    if (iris) t.ok(iris.N.closing <= 11, 'Dr. Iris\'s closing time: round ' + iris.N.closing);
    t.ok(ir.hp === 1.1 && ir.dmg === 1.45, 'boss_dr_iris ×' + ir.hp + ' HP / ×' + ir.dmg + ' damage');
    if (DD.getHero('slate')) t.eq(DD.getHero('slate').stats.mov, 4, 'Slate moves 4');
  });
})();
