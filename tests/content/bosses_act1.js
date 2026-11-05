/* Dungeons and Degenerates — tests/content/bosses_act1.js
 * Suites "bosses_act1: …" for the Act 1 bosses (js/data/bosses/grimble.js, js/data/bosses/ratking.js), v2 (initiative,
 * boss wind-ups, attacks of opportunity): arenas, each boss turn (one action, then a wind-up), every attack's numbers vs
 * its desc, wind-ups landing one round later (whatever the order of his two turns) and stuns interrupting them, phases,
 * minion caps and minions' attacks of opportunity, both puzzles step by step (incl. their AutoPlay hints), stun guards,
 * previews, wind-up number / area honesty and AutoPlay balance sims (real heroes at the v2 act 1 level when loaded).
 * Unit tests start the real arenas as sandboxes (heroes first in a fixed order; turns handed out with giveTurnTo).
 * Sim params (balance work; logs show with verbose=1): sims=<fights per boss> · level=<n> · party=a,b,c,d ·
 * fixture=1 (the fixture party even when real heroes are loaded) · per=1 (a line per fight) · log=<i>&tail=<n> (the last
 * n combat log lines of fight i) ·
 * tune=<def.path:value,...> (temporary overrides: skill / enemy / object / status def paths or the bosses' knobs,
 * e.g. grcfg.noHint:true / rkcfg.noHint:true = AutoPlay ignores the puzzles).
 */
(function () {
  'use strict';
  const T = window.DD_TEST;
  const DD = window.DD;
  const PARTY = ['test_knight', 'test_cleric', 'test_mage', 'test_rogue'];
  const BAND = 2;          // DESIGN §5 v2: a party is about level 2 at the act 1 boss
  const FIXTURE_LEVEL = 4; // the fixture party is much weaker than real heroes: level 4 lands in the same band

  // ---- helpers -----------------------------------------------------------------------------------------------------
  /**
   * Safety net: 'run: boss unlocks' (tests/run_tests.js) once leaked a stub 'grimble' enemy into later suites. Its
   * sandbox swaps DD.defs.enemies now, so this is a no-op kept as a guard.
   */
  function realDefs() {
    const G = DD.GrimbleBoss;
    if (G && G.def && DD.defs.enemies.grimble !== G.def) DD.defs.enemies.grimble = G.def;
  }
  function have() { realDefs(); return !!(DD.getEnemy('grimble') && DD.getEnemy('rat_king') && DD.getHero('test_knight')); }
  const GB = function () { return DD.GrimbleBoss; };
  const RK = function () { return DD.RatKingBoss; };

  /**
   * Run heroes at a v2 level: the 2 starting skills plus one boon per level gained (learn up to 2 more skills, then
   * upgrades), like a party that levelled once per won fight. With rng (sims): random pool skills and upgrades, and one
   * Blessing roll per level gained when the passive table is loaded.
   */
  function partyAt(level, ids, rng) {
    return (ids || PARTY).map(function (id) {
      const h = DD.getHero(id);
      const boons = Math.max(0, level - 1);
      const pool = (h.skillPool || []).filter(function (s) { return h.startingSkills.indexOf(s) < 0; });
      const learn = Math.min(2, boons, pool.length);
      const picks = rng ? rng.shuffle(pool.slice()).slice(0, learn) : pool.slice(0, learn);
      const skills = h.startingSkills.concat(picks).map(function (s) { return { id: s, level: 1 }; });
      for (let k = 0, up = boons - learn; up > 0 && k < 24; k++) {
        const sk = skills[rng ? rng.int(0, skills.length - 1) : k % skills.length];
        if (sk.level < Math.min(3, DD.getSkill(sk.id).levels.length)) { sk.level++; up--; }
      }
      const rh = DD.Combat.makeRunHero({ id: id, level: level, skills: skills });
      if (rng && DD.Passives && typeof DD.Passives.roll === 'function') {
        for (let k = 0; k < boons; k++) {
          const r = DD.Passives.roll(rh, rng);
          if (!r) continue;
          const own = rh.passives.filter(function (p) { return p.id === r.id; })[0];
          if (own) own.level = r.level; else if (rh.passives.length < 4) rh.passives.push({ id: r.id, level: 1 });
        }
      }
      return rh;
    });
  }
  function realHeroIds() { return Object.keys(DD.defs.heroes).filter(function (id) { return !/^test_|^rt_/.test(id); }).sort(); }

  /**
   * A real boss arena (Encounter.build + its onStart) started as a sandbox: no deployment, heroes first in the listed
   * order (opts.order: unit / def ids first), so turns can be handed out with giveTurnTo. opts: ai (enemy turns act;
   * default off), heroes (ids), level, party (RunHeroes), gold, initiative.
   */
  function fight(encId, seed, opts) {
    opts = opts || {};
    const setup = DD.Encounter.build(DD.getEncounter(encId), opts.party || partyAt(opts.level || BAND, opts.heroes),
      { rng: DD.RNG('ba1:' + encId + ':' + seed), difficulty: 'normal', act: 1 });
    fight.setup = setup;
    DD.Combat.start(setup, { seed: seed, headless: true, sandbox: true, kind: 'boss', initiative: opts.initiative || 'heroesFirst',
      order: opts.order || null, enemyAi: opts.ai ? undefined : false, gold: opts.gold || 0 });
    return DD.Combat.state;
  }
  /** A real fight as the game runs it (deployment, rolled initiative): for AutoPlay. */
  function realFight(encId, seed, party) {
    const setup = DD.Encounter.build(DD.getEncounter(encId), party || partyAt(BAND), { rng: DD.RNG('ba1:real:' + encId + ':' + seed), difficulty: 'normal', act: 1 });
    DD.Combat.start(setup, { seed: seed, headless: true, difficulty: 'normal', kind: 'boss', gold: 60 });
    return DD.Combat.state;
  }
  function units(defId) { return DD.Combat.state.units.filter(function (u) { return u.defId === defId && !u.dead && !u.downed; }); }
  function hero(defId) { return units(defId)[0]; }
  function tile(x, y) { return DD.Grid.tile(x, y); }
  function has(u, id) { return DD.Act.hasStatus(u, id); }
  function key(p) { return p.x + ',' + p.y; }
  function slotOf(u, id) { return DD.Combat.slotsOf(u).filter(function (sl) { return sl.id === id; })[0]; }
  function L1(id, lv) { return DD.skillLevel(DD.getSkill(id), lv || 1); }
  /** Do an enemy skill now (an action, no cooldown), like its turn would. */
  function now(u, skillId, target, opts) { return DD.AI.useNow(u, skillId, target, Object.assign({ noCooldown: true }, opts || {})); }
  /** Teleport unit to (x, y), first clearing anything standing there. */
  function put(u, x, y) {
    const o = DD.Grid.unitAt(x, y);
    if (o && o !== u) { const p = DD.Grid.nearestFree(x, y); DD.Act.teleport(o, p.x, p.y, { fx: false, noEnter: true }); }
    if (u.x !== x || u.y !== y) DD.Act.teleport(u, x, y, { fx: false, noEnter: true });
    return u;
  }
  /** Park units on the given spots (far from everything). */
  function park(list, spots) { list.forEach(function (u, i) { if (u && spots[i]) put(u, spots[i].x, spots[i].y); }); }
  function killAll(defId) { units(defId).forEach(function (u) { DD.Act.kill(u, null, { force: true }); }); }
  /** Huge HP so long scripted runs never down anyone (timelines need every hero's turn). */
  function sturdy(list) { list.forEach(function (h) { h.maxHp = 999; h.hp = 999; }); }
  /** Back on their feet: full HP, no statuses, no Block. */
  function refresh(list) { list.forEach(function (h) { if (h.dead) return; h.downed = false; h.hp = h.maxHp; h.block = 0; h.statuses = []; }); }
  function inList(p, list) { return list.some(function (q) { return q.x === p.x && q.y === p.y; }); }
  /** Make it u's turn (sandbox), stand it next to (x, y) unless it already is, and interact. */
  function interactAt(u, x, y, spot) {
    if (!DD.Combat.isTurnOf(u)) DD.Combat.giveTurnTo(u);
    if (spot) put(u, spot.x, spot.y);
    else if (DD.Grid.dist(u, { x: x, y: y }) !== 1) {
      const n = DD.Grid.neighbors(x, y).filter(function (q) { return DD.Grid.isFree(q.x, q.y) && !DD.Grid.isDrop(q.x, q.y); })[0];
      if (n) put(u, n.x, n.y);
    }
    return DD.Combat.interact(u, x, y);
  }
  /** Damage, skill uses, wind-ups and cancels while recording (a fight rule + listeners); rec.off() when done. */
  function recorder() {
    const rec = { hits: [], used: [], windups: [], cancels: [], aoo: [] };
    DD.Act.addRule({ id: 'ba1_rec', name: 'Recorder', hooks: {
      onTakeDamage: function (d) { if (!DD.Act.simulating) rec.hits.push({ target: d.target, base: d.base, dealt: d.dealt, blocked: d.blocked || 0, cause: d.cause, src: d.source, skill: d.skill ? d.skill.id : null, opp: !!d.opportunity }); },
      onSkillUsed: function (ctx) { if (!DD.Act.simulating) rec.used.push({ user: ctx.user, skill: ctx.skill.id, windup: !!(ctx.intent && ctx.intent.windup), round: DD.Combat.state.round }); },
    } });
    const offs = [
      DD.Events.on('windup:start', function (e) { rec.windups.push({ unit: e.unit, skill: e.intent.skillId, intent: e.intent }); }),
      DD.Events.on('windup:cancel', function (e) { rec.cancels.push({ unit: e.unit, reason: e.reason }); }),
      DD.Events.on('opportunity:attack', function (e) { if (!DD.Act.simulating) rec.aoo.push(e); }),
    ];
    rec.off = function () { offs.forEach(function (f) { f(); }); DD.Act.removeRule('ba1_rec'); };
    rec.dmgTo = function (u, skill) { return rec.hits.filter(function (h) { return h.target === u && (!skill || h.skill === skill); }).reduce(function (a, h) { return a + h.dealt; }, 0); };
    rec.usedBy = function (u) { return rec.used.filter(function (x) { return x.user === u; }).map(function (x) { return x.skill; }); };
    return rec;
  }
  function pendingOf(u, skillId) { return (u.intents || []).filter(function (i) { return !skillId || i.skillId === skillId; }); }
  function laneOf(tiles) {
    const row = tiles.every(function (p) { return p.y === tiles[0].y; }), col = tiles.every(function (p) { return p.x === tiles[0].x; });
    return row ? 'row' : col ? 'col' : null;
  }
  function passiveText(u, defId) { const d = DD.getEnemy(defId || u.defId); return d.passive.desc(u); }

  /**
   * Every wind-up of `boss` while fn runs: { id, skill, at: { round, k, heroes }, land: {...} | null, cancel: reason |
   * null }, where k = his initiative entry and heroes = hero turns started so far.
   */
  function windTimeline(boss, fn) {
    const list = [], byId = {};
    let cur = { round: 0, k: 0 }, heroes = 0;
    const offs = [
      DD.Events.on('turn:start', function (e) {
        cur = { round: e.round, k: e.entry ? e.entry.k || 0 : 0 };
        if (DD.Combat.isPlayerControlled(e.unit)) heroes++;
      }),
      DD.Events.on('windup:start', function (e) {
        if (e.unit !== boss) return;
        const r = { id: e.intent.id, skill: e.intent.skillId, at: { round: cur.round, k: cur.k, heroes: heroes }, land: null, cancel: null };
        list.push(r); byId[r.id] = r;
      }),
      DD.Events.on('windup:cancel', function (e) {
        if (e.unit !== boss) return;
        list.forEach(function (r) { if (!r.land && !r.cancel && !(boss.intents || []).some(function (i) { return i.id === r.id; })) r.cancel = e.reason || 'cancel'; });
      }),
    ];
    DD.Act.addRule({ id: 'ba1_wind', name: 'Wind-up log', hooks: { onSkillUsed: function (ctx) {
      if (DD.Act.simulating || ctx.user !== boss || !ctx.intent || !ctx.intent.windup) return;
      const r = byId[ctx.intent.id];
      if (r && !r.land) r.land = { round: cur.round, k: cur.k, heroes: heroes };
    } } });
    try { fn(); } finally { offs.forEach(function (f) { f(); }); DD.Act.removeRule('ba1_wind'); }
    return list;
  }
  /**
   * A puzzle stun (stunFn(boss), on the first hero's turn) costs the boss both of his next turns, then he acts again.
   * Two heroes, his turns apart: mage, boss, cleric, boss.
   */
  function stunCostsBothTurns(t, label, encId, bossId, minion, seed, stunFn) {
    fight(encId, seed, { ai: true, heroes: ['test_mage', 'test_cleric'], order: ['test_mage', bossId, 'test_cleric'], gold: 100 });
    killAll(minion);
    const boss = units(bossId)[0];
    sturdy(DD.Combat.heroes());
    stunFn(boss);
    t.ok(has(boss, 'stun') && (DD.Act.getStatus(boss, 'stun') || {}).turns === 2, label + ': Stunned for his next 2 turns');
    const rec = recorder();
    DD.Combat.endTurn();      // mage → his first turn (lost) → cleric
    DD.Combat.endTurn();      // cleric → his second turn (lost) → round 2: mage
    t.eq(rec.usedBy(boss).length, 0, label + ': both of his next turns are lost');
    t.ok(!has(boss, 'stun'), label + ': then the stun is spent');
    DD.Combat.endTurn();      // mage → his turn
    t.ok(rec.usedBy(boss).length > 0, label + ': and he acts again (' + rec.usedBy(boss).join(',') + ')');
    rec.off();
  }
  /** Check a timeline: every wind-up landed one round later at the same turn of his, after exactly `heroTurns` hero turns. */
  function checkTimeline(t, label, list, heroTurns) {
    const landed = list.filter(function (r) { return r.land; });
    t.ok(landed.length >= 2, label + ': wind-ups landed (' + landed.length + ' of ' + list.length + ')');
    const bad = landed.filter(function (r) { return r.land.round !== r.at.round + 1 || r.land.k !== r.at.k || r.land.heroes - r.at.heroes !== heroTurns; });
    t.ok(!bad.length, label + ': each lands one round later at the start of the same turn of his, after every hero had exactly one turn' +
      (bad.length ? ' — ' + bad.map(function (r) { return r.skill + ' r' + r.at.round + '.' + r.at.k + ' → r' + r.land.round + '.' + r.land.k + ' (' + (r.land.heroes - r.at.heroes) + ' hero turns)'; }).join('; ') : ''));
  }

  /**
   * Wind-up NUMBER honesty while fn runs: every wind-up that lands must hit for exactly the number DD.AI.describe showed
   * at the end of the last hero-controlled turn before it — the attacker-side number, read the moment
   * modifyIncomingDamage fires (the target's Block / armor / Vulnerable come after). Returns { checked, bad }.
   */
  function watchNumbers(fn) {
    const out = { checked: 0, bad: [] };
    const snap = {};
    let cur = null;
    const take = function (e) {
      if (!e || !e.unit || !DD.Combat.isPlayerControlled(e.unit) || !DD.Combat.state) return;
      DD.Combat.state.units.forEach(function (u) {
        if (!u.dead && u.side === 'enemy') (u.intents || []).forEach(function (it) { snap[it.id] = DD.AI.describe(u, it).dmg; });
      });
    };
    const off = DD.Events.on('turn:end', take);
    const exec = DD.AI.executeIntent, fire = DD.Hooks.fire;
    DD.AI.executeIntent = function (unit, intent) {
      if (!intent || !intent.windup) return exec.apply(DD.AI, arguments);
      const prev = cur;
      cur = { unit: unit, intent: intent, tele: snap[intent.id] };
      try { return exec.apply(DD.AI, arguments); } finally { cur = prev; }
    };
    DD.Hooks.fire = function (name, unit, d) {
      if (name === 'modifyIncomingDamage' && cur && d && d.source === cur.unit && d.cause === 'skill' && cur.tele !== undefined && !DD.Act.simulating) {
        out.checked++;
        const raw = Math.round(d.amount * d.mult + d.flat);
        if (raw !== cur.tele) out.bad.push(cur.intent.skillId + ': showed ' + cur.tele + ', hit ' + raw + ' (round ' + DD.Combat.state.round + ')');
      }
      return fire.apply(DD.Hooks, arguments);
    };
    try { fn(); } finally { off(); DD.AI.executeIntent = exec; DD.Hooks.fire = fire; }
    return out;
  }

  // =====================================================================================================================
  // GRIMBLE
  // =====================================================================================================================
  const ZONE = [[4, 2], [5, 2], [6, 2], [4, 3], [5, 3], [6, 3]];
  const LEVERS = [[10, 3], [1, 4], [6, 7]];
  const G_FAR = [{ x: 1, y: 11 }, { x: 11, y: 11 }, { x: 11, y: 10 }, { x: 1, y: 10 }];
  function inZone(u) { return ZONE.some(function (p) { return p[0] === u.x && p[1] === u.y; }); }
  /** A Grimble arena with the interns fired (the boss alone), heroes parked in the corners. */
  function grimbleAlone(seed, opts) {
    const s = fight('boss_grimble', seed, opts);
    killAll('grim_intern');
    const boss = units('grimble')[0];
    park(DD.Combat.heroes(), G_FAR);
    return { s: s, boss: boss };
  }

  T.suite('bosses_act1: grimble registry, arena and encounter', function (t) {
    if (!have()) { t.skip('boss content not loaded'); return; }
    ['grimble', 'grim_intern'].forEach(function (id) { t.ok(!!DD.getEnemy(id), 'enemy ' + id); });
    ['grim_levy', 'grim_garnish', 'grim_audit', 'grim_stamp', 'grim_hire', 'grim_redtape', 'grim_papercut', 'grim_refile'].forEach(function (id) {
      const s = DD.getSkill(id);
      t.ok(!!s && s.owner === 'enemy', 'skill ' + id);
      if (s) for (let lv = 1; lv <= s.levels.length; lv++) {
        const d = DD.skillDesc(s, lv, null);
        t.ok(/\S/.test(d) && !/undefined|NaN/.test(d), id + ' L' + lv + ' desc without a user');
      }
    });
    ['grim_loophole', 'grim_vault', 'grim_desk', 'grim_cabinet'].forEach(function (id) { t.ok(!!DD.getObject(id), 'object ' + id); });
    t.ok(!!DD.getTerrain('grim_dropzone'), 'terrain grim_dropzone');
    ['grim_takeover', 'grim_ledger', 'grim_appeal'].forEach(function (id) { t.ok(!!DD.getStatus(id), 'status ' + id); });
    const g = DD.getEnemy('grimble');
    t.ok(g === GB().def && typeof g.ai === 'function', 'the registered Grimble is the real one (not a leaked test stub)');
    t.eq(g.tier, 'boss', 'boss tier');
    t.ok(g.hp >= 150 && g.hp <= 200, 'Act 1 boss HP 150-200: ' + g.hp);
    t.eq(g.turnsPerRound, 2, 'a double shift: two initiative entries a round');
    t.ok(g.skills.indexOf('grim_audit') < 0, 'the Audit is a wind-up only (not in his skill list: no phantom at-once reach)');
    t.ok(g.boss && g.boss.title && g.boss.intro, 'boss title + intro');
    t.ok(g.sprite.scale >= 1.8 && g.sprite.scale <= 2.4, 'boss-size sprite');
    ['spawn', 'attack', 'hurt', 'death', 'phase', 'vault'].forEach(function (k) {
      t.ok(Array.isArray(g.barks[k]) && g.barks[k].length >= 2 && g.barks[k].every(function (b) { return b.length <= 70; }), 'grimble barks.' + k + ' (2+, ≤70 chars)');
    });
    const ib = DD.getEnemy('grim_intern').barks;
    ['spawn', 'attack', 'hurt', 'death'].forEach(function (k) { t.ok(ib[k].length >= 2 && ib[k].every(function (b) { return b.length <= 70; }), 'intern barks.' + k); });
    const pd = passiveText(null, 'grimble');
    t.ok(/Two turns a round/.test(pd) && /Levy, Red Tape, Levy, Hire Intern/.test(pd) && /one round later/.test(pd) && /DROP ZONE/.test(pd) && !/next:/.test(pd),
      'his passive states the rule (codex: no live "next")');
    const enc = DD.getEncounter('boss_grimble');
    t.ok(enc && enc.kind === 'boss' && enc.act === 1 && enc.objective.type === 'boss', 'encounter boss_grimble (act 1 boss)');
    t.ok(new RegExp('takes ' + GB().VAULT_DMG + ' damage').test(DD.getObject('grim_loophole').desc) && /DROP ZONE/.test(DD.getObject('grim_loophole').desc), 'loophole desc explains the drop');
    t.ok(new RegExp('takes ' + GB().VAULT_DMG + ' damage').test(DD.getTerrain('grim_dropzone').desc), 'drop zone desc shows the real damage');

    const s = fight('boss_grimble', 1);
    t.eq(GB().zoneTiles(s).length, 6, '6 DROP ZONE tiles');
    ZONE.forEach(function (p) { t.eq(tile(p[0], p[1]).t, 'grim_dropzone', 'zone tile ' + p); });
    const ls = GB().loopholes(s);
    t.eq(ls.length, 3, 'three Tax Loopholes');
    LEVERS.forEach(function (p) { t.ok(ls.some(function (l) { return l.x === p[0] && l.y === p[1]; }), 'loophole at ' + p); });
    t.ok(ls.every(function (l) { return l.obj.data.name && /^Tax Loophole: /.test(l.obj.label); }), 'loopholes are named and labelled');
    t.ok(!!GB().vaultTile(s), 'the vault is on the map');
    const boss = units('grimble')[0];
    t.ok(boss.x === 5 && boss.y === 3, 'Grimble starts on the B mark in the DROP ZONE');
    t.eq(DD.Combat.heroes().length, 4, 'four heroes deployed');
    const ints = units('grim_intern');
    t.eq(ints.length, 2, 'two interns on the payroll at the start');
    t.ok(ints.every(function (u) { return tile(u.x, u.y).tag === 'grim_door'; }), 'at the break-room doors');
    t.ok(s.log.some(function (l) { return l.cls === 'narrator' && /LOOPHOLE/.test(l.text); }), 'the DM hints at the loopholes at the start');
    t.ok(fight.setup.deployTiles.length >= 8, 'deploy zone ' + fight.setup.deployTiles.length);
    const v = DD.MapGen.validate({ grid: s.grid, heroZone: s.heroZone || [], enemyZone: s.enemyZone || [] }, { layout: true });
    t.ok(v.ok, 'arena layout validates: ' + v.problems.join('; '));
    t.ok(DD.Grid.los({ x: 5, y: 3 }, { x: 5, y: 7 }), 'LOS down the middle from the desk');
    t.ok(!DD.Grid.los({ x: 5, y: 3 }, { x: 2, y: 9 }), 'the filing cabinets give cover from his desk');
    t.ok(/next: Levy/.test(passiveText(boss)), 'in a fight his passive names the next docket step: ' + passiveText(boss));
    // a real fight: deployment, then two rolled entries for him
    const rs = realFight('boss_grimble', 2);
    t.eq(rs.phase, 'deploy', 'a real fight opens in deployment');
    DD.Combat.rollInitiative();
    const gb = rs.units.filter(function (u) { return u.defId === 'grimble'; })[0];
    const entries = rs.order.filter(function (e) { return e.unitId === gb.id; });
    t.eq(entries.length, 2, 'rolled initiative: two entries for Grimble');
    t.ok(entries[0].k !== entries[1].k, 'his two entries are k 0 and 1');
  });

  T.suite('bosses_act1: grimble takes one action a turn (stamp or docket), then keeps an Audit wound up', function (t) {
    if (!have()) { t.skip('boss content not loaded'); return; }
    let g = grimbleAlone(3);
    let boss = g.boss;
    const m = hero('test_mage'), c = hero('test_cleric'), r = hero('test_rogue'), k = hero('test_knight');
    put(c, 5, 7);                 // in sight down the middle: the Levy's biggest spender
    g.s.sandboxGold = 100;
    const rec = recorder();
    const seq = [];
    for (let i = 0; i < 4; i++) { DD.AI.act(boss); seq.push(boss.data.lastAct); }
    t.eq(seq.join(','), 'levy,tape,levy,hire', 'phase 1 docket, one step a turn: Levy, Red Tape, Levy, Hire Intern');
    t.eq(rec.windups.filter(function (w) { return w.unit === boss && w.skill === 'grim_audit'; }).length, 1, 'one Audit wound up (he keeps one pending)');
    const au = pendingOf(boss, 'grim_audit')[0];
    t.ok(au && au.windup && au.anchor === 'ground' && au.turnsLeft === 2, 'the Audit is a ground wind-up (2 of his turns = one round)');
    t.ok(au && laneOf(au.tiles) && au.tiles.length === 11, 'covering a whole row or column (11 tiles)');
    t.ok(au && [m, c, r, k].some(function (h) { return inList(h, au.tiles); }), 'through a hero');
    t.ok(au && au.window === 0 && au.data.oneRound, 'one-round wind-up (hero window handled by the boss, see grimble.js windUpRound)');
    t.ok(inZone(boss), 'phase 1: he never leaves the DROP ZONE');
    t.ok(/next: Levy/.test(passiveText(boss)), 'after four steps the passive says the docket starts over (next: Levy)');
    rec.off();

    // a hero next to him gets the Rubber Stamp instead, and the docket waits
    put(boss, 5, 3);
    put(m, 4, 3);
    const stepBefore = boss.data.step;
    DD.AI.act(boss);
    t.eq(boss.data.lastAct, 'stamp', 'a hero next to him: Rubber Stamp');
    t.eq(boss.data.step, stepBefore, 'a Stamp turn keeps the docket where it was');
    t.ok(slotOf(boss, 'grim_stamp').cd > 0, 'the Stamp is cooling down');
    put(boss, 5, 3);
    put(m, 4, 3);
    DD.AI.act(boss);
    t.ok(boss.data.lastAct !== 'stamp', 'with the Stamp on cooldown he does his docket instead (' + boss.data.lastAct + ')');
    t.eq(boss.data.step, stepBefore + 1, 'and that step is used up');

    // Red Tape goes for a hero standing in the pending Audit's lane; a Rooted hero attracts the next Audit
    g = grimbleAlone(4, { heroes: ['test_cleric', 'test_mage'] });
    boss = g.boss;
    const c2 = hero('test_cleric'), m2 = hero('test_mage');
    put(c2, 9, 9); put(m2, 2, 6);                           // no shared row or column
    DD.AI.act(boss);                                        // step 1 (a Levy) + an Audit through one of them
    const lane1 = pendingOf(boss, 'grim_audit')[0];
    const inLane = [c2, m2].filter(function (h) { return inList(h, lane1.tiles); })[0];
    const outLane = inLane === c2 ? m2 : c2;
    t.ok(!!inLane && !inList(outLane, lane1.tiles), 'one hero in the audited lane, one outside');
    DD.AI.act(boss);                                        // step 2: Red Tape
    t.eq(boss.data.lastAct, 'tape', 'step 2: Red Tape');
    t.ok(has(inLane, 'root') && !has(outLane, 'root'), 'Red Tape roots the hero standing in the Audit lane (they can\'t walk out of it)');
    boss.intents = [];
    DD.AI.act(boss);
    const lane2 = pendingOf(boss, 'grim_audit')[0];
    t.ok(lane2 && inList(inLane, lane2.tiles), 'with no Audit pending, the rooted hero gets audited first');

    // without his office (sandbox) he still works
    DD.Combat.sandbox({ w: 11, h: 11, seed: 3, heroes: [{ id: 'test_mage', x: 1, y: 1, level: 2 }], enemies: [{ id: 'grimble', x: 9, y: 9 }], enemyAi: false, gold: 30 });
    const b2 = units('grimble')[0];
    const acts = [];
    t.tryRun('grimble without his office', function () { DD.AI.act(b2); acts.push(b2.data.lastAct); DD.AI.act(b2); acts.push(b2.data.lastAct); });
    t.ok(pendingOf(b2, 'grim_audit').length === 1, 'without his office (sandbox) he still winds up Audits');
    t.ok(acts.some(function (a) { return /levy|tape/.test(String(a)); }), 'and works his docket (' + acts.join(',') + ')');
  });

  T.suite('bosses_act1: grimble attacks deal exactly what they say', function (t) {
    if (!have()) { t.skip('boss content not loaded'); return; }
    // Levy: damage, gold, Block (1 per 2 gold, rounded up); Ill-Gotten Gains from the next one on
    let g = grimbleAlone(5);
    let boss = g.boss;
    const c = hero('test_cleric');
    put(c, 5, 7);
    g.s.sandboxGold = 20;
    const LV = L1('grim_levy');
    let h0 = c.hp;
    now(boss, 'grim_levy', c);
    t.eq(h0 - c.hp, LV.dmg, 'Levy deals ' + LV.dmg + ' (nothing pocketed yet)');
    t.eq(DD.Act.gold(), 20 - LV.gold, 'and steals ' + LV.gold + ' gold');
    t.eq(boss.data.stolen, LV.gold, 'stolen gold is on his books');
    t.eq((DD.Act.getStatus(boss, 'grim_ledger') || {}).stacks, LV.gold, 'Ill-Gotten Gains shows the stolen gold');
    t.eq(boss.block, Math.ceil(LV.gold / 2), 'he buys Block worth half the gold, rounded up (' + Math.ceil(LV.gold / 2) + ')');
    ['grim_levy', 'grim_garnish'].forEach(function (id) {
      t.ok(/half the gold stolen \(rounded up\)/.test(DD.skillDesc(DD.getSkill(id), 1, null)), id + ' desc says the Block is half the gold, rounded up (3 gold = 2 Block)');
    });
    g.s.sandboxGold = 3;
    const gains = Math.min(GB().GAIN_MAX, Math.floor(LV.gold / GB().GAIN_PER));
    c.hp = c.maxHp;
    h0 = c.hp;
    now(boss, 'grim_levy', c);
    t.eq(h0 - c.hp, LV.dmg + gains, 'holding ' + LV.gold + ' gold: the next Levy deals ' + (LV.dmg + gains));
    t.eq(DD.Act.gold(), 0, 'he steals what the party has');
    t.eq(boss.block, Math.ceil(LV.gold / 2) + 2, '3 gold buys 2 more Block (rounded up)');
    boss.block = 0;
    c.hp = c.maxHp;
    now(boss, 'grim_levy', c);
    t.eq(boss.block, 0, 'a broke party gives him nothing to buy Block with');
    c.hp = c.maxHp;
    // the planner's Levy needs line of sight: hide behind a filing cabinet and that docket step is wasted (the fiscal
    // quarter's takeover keeps that from stalling the fight: see the phase 2 suite)
    put(c, 2, 9);
    t.ok(!DD.Grid.los(boss, c), 'behind a filing cabinet');
    t.eq(GB().levyTarget(boss, boss, [c], 'grim_levy'), null, 'the Levy finds nobody to tax');
    t.eq(GB().levyTarget(boss, boss, [c], 'grim_garnish'), c, 'Garnish Wages (phase 2) needs no line of sight');
    boss.data.step = 0;
    const hc = c.hp;
    DD.AI.act(boss);
    t.ok(boss.data.lastAct === null && c.hp === hc, 'a Levy step with nobody in sight does nothing');

    // Garnish Wages: through walls
    g.s.sandboxGold = 50;
    const GW = L1('grim_garnish');
    h0 = c.hp;
    const gn = Math.min(GB().GAIN_MAX, Math.floor(boss.data.stolen / GB().GAIN_PER));
    now(boss, 'grim_garnish', c);
    t.eq(h0 - c.hp, GW.dmg + gn, 'Garnish Wages deals ' + GW.dmg + ' (+' + gn + ' gains) behind the cabinet');
    t.eq(DD.Act.gold(), 50 - GW.gold, 'and steals ' + GW.gold + ' gold');

    // Red Tape: damage + Root for the hero's next turn
    g = grimbleAlone(6);
    boss = g.boss;
    const m = hero('test_mage');
    put(m, 6, 8);
    const RT = L1('grim_redtape');
    h0 = m.hp;
    now(boss, 'grim_redtape', m);
    t.eq(h0 - m.hp, RT.dmg, 'Red Tape deals ' + RT.dmg);
    t.ok(has(m, 'root'), 'and Roots');
    DD.Combat.giveTurnTo(m);
    t.eq(DD.Combat.reachable(m).size, 0, 'on the hero\'s next turn it cannot walk away');
    DD.Combat.endTurn();
    t.ok(!has(m, 'root'), 'the Root is gone after that turn');

    // Rubber Stamp: both sides, pushed 2 away
    g = grimbleAlone(7);
    boss = g.boss;
    const m3 = hero('test_mage'), c3 = hero('test_cleric');
    put(m3, 4, 3); put(c3, 6, 3);
    const SP = L1('grim_stamp');
    const hm = m3.hp, hc3 = c3.hp;
    now(boss, 'grim_stamp', boss);
    t.eq(hm - m3.hp, SP.dmg, 'the Stamp deals ' + SP.dmg + ' to the west neighbour');
    t.eq(hc3 - c3.hp, SP.dmg, 'and to the east neighbour');
    t.ok(m3.x === 4 - SP.push && m3.y === 3, 'knocked back ' + SP.push + ' tiles: ' + key(m3));
    t.ok(c3.x === 6 + SP.push && c3.y === 3, 'both ways: ' + key(c3));
    t.eq(DD.getSkill('grim_stamp').cooldown, 1, 'cooldown 1: never two of his turns in a row');

    // the Audit: every hero in the lane, nobody else (a wind-up landing at his turn start)
    g = grimbleAlone(8);
    boss = g.boss;
    const hs = ['test_cleric', 'test_mage', 'test_knight', 'test_rogue'].map(hero);
    put(hs[0], 2, 7); put(hs[1], 9, 7); put(hs[2], 1, 10); put(hs[3], 11, 11);
    DD.AI.act(boss);
    const au = pendingOf(boss, 'grim_audit')[0];
    t.ok(au && laneOf(au.tiles) === 'row' && au.tiles[0].y === 7, 'the row with two heroes is audited');
    const AU = L1('grim_audit');
    t.eq(DD.AI.describe(boss, au).dmg, AU.dmg, 'the wind-up shows ' + AU.dmg);
    const hA = hs.map(function (u) { return u.hp; });
    // wound up outside his turns (here: by the test, on a hero's turn), so both of his turns count it down; in this
    // heroes-first sandbox they run back to back (enemy AI off: only wind-ups resolve)
    let mid = null;
    const off = DD.Events.on('turn:end', function (e) { if (e.unit === boss && mid === null) mid = { hp: hs[0].hp, left: (pendingOf(boss, 'grim_audit')[0] || {}).turnsLeft }; });
    DD.Combat.giveTurnTo(boss);
    off();
    t.ok(mid && mid.hp === hA[0] && mid.left === 1, 'after his first turn nothing has landed yet (⏳ 1)');
    t.eq(hA[0] - hs[0].hp, AU.dmg, 'cleric in the lane takes ' + AU.dmg);
    t.eq(hA[1] - hs[1].hp, AU.dmg, 'mage in the lane takes ' + AU.dmg);
    t.ok(hs[2].hp === hA[2] && hs[3].hp === hA[3], 'heroes outside the lane are untouched');

    // Hire Intern: at the break-room doors, named
    g = grimbleAlone(9);
    boss = g.boss;
    now(boss, 'grim_hire', boss);
    const ints = units('grim_intern');
    const HI = L1('grim_hire');
    t.eq(ints.length, HI.n, 'Hire Intern hires ' + HI.n);
    t.ok(ints.every(function (u) { return /^Intern /.test(u.name); }), 'interns have names: ' + ints.map(function (u) { return u.name; }).join(', '));
    t.ok(ints.every(function (u) { return tile(u.x, u.y).tag === 'grim_door'; }), 'they arrive at the break-room doors');
    t.ok(DD.Combat.state.joining.some(function (e) { return e.unitId === ints[0].id; }) || DD.Combat.state.order.some(function (e) { return e.unitId === ints[0].id; }),
      'a hire rolls initiative (joins the order)');

    // Paper Cut: damage + Bleed; it is also the intern's attack of opportunity
    const it = ints[0];
    const m4 = hero('test_mage');
    put(it, 7, 8); put(m4, 7, 9);
    const PC = L1('grim_papercut');
    h0 = m4.hp;
    now(it, 'grim_papercut', m4);
    t.eq(h0 - m4.hp, PC.dmg, 'Paper Cut deals ' + PC.dmg);
    t.ok(has(m4, 'bleed'), 'and Bleeds');
    DD.Act.removeStatus(m4, 'bleed', { silent: true });
    const rec = recorder();
    DD.Combat.giveTurnTo(m4);
    h0 = m4.hp;
    DD.Combat.move(m4, 7, 11);
    rec.off();
    t.ok(rec.aoo.some(function (e) { return e.attacker === it && e.skillId === 'grim_papercut'; }), 'walking away from an intern provokes its Paper Cut');
    t.eq(rec.hits.filter(function (hh) { return hh.opp && hh.target === m4; }).reduce(function (a, hh) { return a + hh.dealt; }, 0), PC.dmg, 'for ' + PC.dmg + ' (then its Bleed ticks on the walk)');
  });

  T.suite('bosses_act1: grimble wind-ups land one round later whatever the order, and a stun interrupts them', function (t) {
    if (!have()) { t.skip('boss content not loaded'); return; }
    const orders = [
      { label: 'his turns apart', order: ['test_mage', 'grimble', 'test_cleric'] },
      { label: 'his two turns back to back', order: ['test_mage', 'test_cleric', 'grimble'] },
      { label: 'his second turn last, his first turn first', order: ['grimble', 'test_mage', 'test_cleric'] },
    ];
    orders.forEach(function (o, i) {
      fight('boss_grimble', 20 + i, { ai: true, heroes: ['test_mage', 'test_cleric'], order: o.order, gold: 200 });
      killAll('grim_intern');
      const boss = units('grimble')[0];
      sturdy(DD.Combat.heroes());
      put(hero('test_mage'), 5, 7); put(hero('test_cleric'), 9, 9);
      const tl = windTimeline(boss, function () { for (let r = 0; r < 5 && !DD.Combat.state.result; r++) DD.Combat.endRound(); });
      checkTimeline(t, o.label, tl, 2);
    });
    // a rolled order with the full party (interns too)
    fight('boss_grimble', 24, { ai: true, initiative: 'roll', gold: 200 });
    const b0 = units('grimble')[0];
    sturdy(DD.Combat.heroes());
    const tl = windTimeline(b0, function () { for (let r = 0; r < 5 && !DD.Combat.state.result; r++) DD.Combat.endRound(); });
    checkTimeline(t, 'rolled initiative, four heroes', tl.filter(function (r) { return !r.cancel; }), 4);

    // a stun on a hero's turn interrupts the pending Audit at once and costs him his next turn
    fight('boss_grimble', 25, { ai: true, heroes: ['test_mage', 'test_cleric'], order: ['test_mage', 'grimble', 'test_cleric'], gold: 200 });
    killAll('grim_intern');
    const boss = units('grimble')[0];
    const m = hero('test_mage'), c = hero('test_cleric');
    sturdy([m, c]);
    put(m, 5, 7); put(c, 9, 9);
    DD.Combat.endTurn();                         // mage → Grimble's first turn: he winds up an Audit → cleric's turn
    t.ok(DD.Combat.isTurnOf(c) && pendingOf(boss, 'grim_audit').length === 1, 'an Audit is pending on the cleric\'s turn');
    const rec = recorder();
    DD.Act.addStatus(boss, 'stun', { turns: 1 }, c);
    t.eq(pendingOf(boss).length, 0, 'the stun interrupts it at once');
    t.ok(rec.cancels.some(function (e) { return e.unit === boss; }), 'windup:cancel');
    t.ok(has(boss, 'grim_appeal'), 'and he files an appeal');
    const used0 = rec.usedBy(boss).length;
    DD.Combat.endTurn();                         // cleric → Grimble's second turn (lost) → round 2: mage
    t.eq(rec.usedBy(boss).length, used0, 'his next turn is lost (no action)');
    t.ok(!has(boss, 'stun'), 'the stun is spent');
    DD.Combat.endTurn();                         // mage → Grimble acts again
    t.ok(rec.usedBy(boss).length > used0, 'the turn after, he works again');
    // during the appeal a stun no longer costs him a turn, but it still calls off his Audit
    t.ok(has(boss, 'grim_appeal') && pendingOf(boss, 'grim_audit').length === 1, 'appeal pending, a new Audit pending');
    DD.Act.addStatus(boss, 'stun', { turns: 1 }, c);
    t.ok(!has(boss, 'stun'), 'appeal pending: the stun does not land');
    t.eq(pendingOf(boss).length, 0, 'but it still calls off the Audit');
    ['sleep', 'frozen', 'charmed'].forEach(function (id) {
      DD.Act.addStatus(boss, id, { turns: 1 }, c);
      t.ok(!has(boss, id), 'appeal pending: no ' + id);
    });
    const other = Object.keys(DD.defs.statuses).filter(function (id) { return DD.Act.isStunLike(id) && ['stun', 'sleep', 'frozen'].indexOf(id) < 0; })[0];
    if (other) {
      DD.Act.addStatus(boss, other, { turns: 1 }, c);
      t.ok(!has(boss, other), 'every stun-like is appealed (' + other + ')');
    }
    t.ok(/stuns/.test(DD.getStatus('grim_appeal').desc(DD.Act.getStatus(boss, 'grim_appeal'))), 'the status says what it does');
    rec.off();
    // the vault door ignores the appeal
    const hp0 = boss.hp;
    DD.Combat._action(function () { GB().dropVault(c); });
    t.ok(has(boss, 'stun') && hp0 - boss.hp === GB().VAULT_DMG, 'the vault door stuns him anyway (puzzle stuns ignore the appeal)');
    // the HUD lists a pending Audit with its live number
    fight('boss_grimble', 26, { heroes: ['test_mage', 'test_cleric'] });
    const b3 = units('grimble')[0];
    put(hero('test_mage'), 5, 7);
    DD.AI.act(b3);
    const w = DD.AI.windups().filter(function (x) { return x.unit === b3; })[0];
    t.ok(w && w.tiles.length === 11 && w.turnsLeft === 2 && w.dmg === L1('grim_audit').dmg, 'DD.AI.windups lists the Audit (11 tiles, ⏳2, ' + (w && w.dmg) + ')');
    DD.Act.addStatus(b3, 'weak', { turns: 1 }, hero('test_mage'));
    t.eq(DD.AI.windups().filter(function (x) { return x.unit === b3; })[0].dmg, Math.round(L1('grim_audit').dmg * 0.75), 'Weak lowers the shown number live');
    t.ok(/lands in 2 of Grimble's turns/.test(DD.AI.describe(b3, pendingOf(b3, 'grim_audit')[0]).text), 'the inspect text says when it lands');
  });

  T.suite('bosses_act1: grimble interns (cap, closing loopholes, claims)', function (t) {
    if (!have()) { t.skip('boss content not loaded'); return; }
    let g = grimbleAlone(30);
    const boss = g.boss;
    const HL = L1('grim_hire');
    for (let i = 0; i < 4; i++) now(boss, 'grim_hire', boss);
    t.eq(units('grim_intern').length, HL.cap, 'never more than ' + HL.cap + ' interns in phase 1');
    t.eq(DD.getEnemy('grim_intern').hp, units('grim_intern')[0].maxHp, 'intern HP ' + DD.getEnemy('grim_intern').hp);
    t.ok(DD.getEnemy('grim_intern').hp >= 6 && DD.getEnemy('grim_intern').hp <= 9, 'act 1 minion HP band');

    // closing a loophole: an intern next to an exploited one closes it on its turn
    g = grimbleAlone(31);
    const lever = GB().loopholes().filter(function (l) { return l.x === 10 && l.y === 3; })[0];
    lever.obj.data.on = true;
    const iu = DD.Act.spawn('grim_intern', 10, 2, { silent: true });
    DD.AI.act(iu);
    t.eq(lever.obj.data.on, false, 'an intern next to an exploited loophole closes it at once on its turn');
    t.eq(GB().data().refiles, 1, 'refile counted');
    t.ok(!/EXPLOITED/.test(lever.obj.label), 'label updated');
    // from afar it walks over (and closes it if it gets there)
    lever.obj.data.on = true;
    put(iu, 11, 9);
    const d0 = DD.Grid.dist(iu, lever);
    DD.AI.act(iu);
    t.ok(DD.Grid.dist(iu, lever) < d0 || !lever.obj.data.on, 'an intern walks toward an exploited loophole (' + d0 + ' → ' + DD.Grid.dist(iu, lever) + ')');
    // a stunned intern does nothing
    lever.obj.data.on = true;
    put(iu, 10, 2);
    DD.Act.addStatus(iu, 'stun', { turns: 1 }, null);
    DD.AI.act(iu);
    t.eq(lever.obj.data.on, true, 'a stunned intern cannot close it');
    DD.Act.removeStatus(iu, 'stun', { silent: true });
    // two interns never chase the same lever
    const l2 = GB().loopholes().filter(function (l) { return l.x === 1 && l.y === 4; })[0];
    l2.obj.data.on = true;
    const iu2 = DD.Act.spawn('grim_intern', 9, 2, { silent: true });
    put(iu, 11, 6); put(iu2, 11, 7);
    DD.AI.act(iu); DD.AI.act(iu2);
    t.ok(iu.data.claim !== iu2.data.claim || !iu.data.claim, 'one intern per exploited loophole (' + iu.data.claim + ' / ' + iu2.data.claim + ')');
    // nothing to close: an intern is a plain melee minion
    GB().loopholes().forEach(function (l) { l.obj.data.on = false; });
    const m = hero('test_mage');
    put(iu, 7, 8); put(m, 7, 9);
    DD.Act.kill(iu2, null, { force: true });
    const h0 = m.hp;
    DD.AI.act(iu);
    t.eq(h0 - m.hp, L1('grim_papercut').dmg, 'with no loophole to close it paper-cuts the hero next to it');
  });

  T.suite('bosses_act1: grimble phase 2 (hostile takeover)', function (t) {
    if (!have()) { t.skip('boss content not loaded'); return; }
    const g = grimbleAlone(40);
    const boss = g.boss;
    const k = hero('test_knight'), c = hero('test_cleric'), m = hero('test_mage'), r = hero('test_rogue');
    put(k, 4, 5); put(c, 8, 9); put(m, 2, 10); put(r, 10, 11);     // the knight in reach of his +2 move
    boss.hp = Math.floor(boss.maxHp * GB().PHASE2_AT);
    const mov0 = boss.mov;
    DD.AI.act(boss);
    t.eq(boss.data.phase, 2, 'at 50%: phase 2');
    t.ok(has(boss, 'grim_takeover'), 'Hostile Takeover status shows the phase');
    t.ok(DD.Combat.state.log.some(function (l) { return /HOSTILE TAKEOVER/.test(l.text); }), 'the takeover is announced in the log');
    const ints = units('grim_intern');
    t.eq(ints.length, 2, 'two interns hired on the spot');
    t.ok(ints.every(function (u) { return has(u, 'haste'); }), 'phase 2 interns arrive Hasted');
    t.eq(slotOf(boss, 'grim_hire').level, 2, 'Hire Intern upgraded to its phase 2 numbers');
    t.ok(!!slotOf(boss, 'grim_garnish') && !slotOf(boss, 'grim_levy'), 'the Levy became Garnish Wages');
    t.eq(boss.mov, mov0 + GB().PHASE2_MOV, '+' + GB().PHASE2_MOV + ' move: he leaves his desk');
    const au = pendingOf(boss, 'grim_audit');
    t.eq(au.map(function (it) { return laneOf(it.tiles); }).sort().join(','), 'col,row', 'a crossing Audit: a row and a column');
    t.ok(/Garnish Wages, Hire Interns, Garnish Wages, Red Tape/.test(passiveText(boss)) && /a row and a column/.test(passiveText(boss)), 'the passive shows the phase 2 docket');
    t.ok(!inZone(boss) && (k.x !== 4 || k.y !== 5), 'the Stamp is ready: he walks out from behind his desk (' + key(boss) + ') and stamps the knight away (' + key(k) + ')');
    t.eq(boss.data.lastAct, 'stamp', 'and stamps');
    // Stamp cooling down: back toward his desk (and he does his docket)
    const d0 = Math.min.apply(null, ZONE.map(function (p) { return Math.abs(p[0] - boss.x) + Math.abs(p[1] - boss.y); }));
    DD.AI.act(boss);
    const d1 = Math.min.apply(null, ZONE.map(function (p) { return Math.abs(p[0] - boss.x) + Math.abs(p[1] - boss.y); }));
    t.ok(d1 < d0 || inZone(boss), 'Stamp on cooldown: he heads back to his desk (' + d0 + ' → ' + d1 + ')');
    t.ok(boss.data.lastAct !== 'stamp', 'and works the docket (' + boss.data.lastAct + ')');
    const GWd = DD.skillDesc(DD.getSkill('grim_garnish'), 1, null);
    t.ok(new RegExp('up to ' + L1('grim_garnish').gold + ' party gold').test(GWd) && /no line of sight/.test(GWd), 'Garnish Wages desc: the bigger levy and the reach');
    // the cap rises; the takeover happens once
    const H2 = L1('grim_hire', 2);
    for (let i = 0; i < 4; i++) now(boss, 'grim_hire', boss);
    t.eq(units('grim_intern').length, H2.cap, 'never more than ' + H2.cap + ' interns in phase 2');
    DD.AI.act(boss);
    t.eq(units('grim_intern').length, H2.cap, 'no second takeover');
    t.eq(DD.Combat.state.log.filter(function (l) { return /HOSTILE TAKEOVER/.test(l.text); }).length, 1, 'announced once');
    // the fiscal quarter: from round QUARTER_END he takes over at any HP (nobody stalls him from behind a cabinet)
    const QE = GB().QUARTER_END;
    const g2 = grimbleAlone(41);
    const b2 = g2.boss;
    t.ok(new RegExp('round ' + QE + ' when the fiscal quarter ends').test(passiveText(b2)), 'the passive warns about the fiscal quarter');
    g2.s.round = QE - 1;
    DD.AI.act(b2);
    t.eq(b2.data.phase, 1, 'round ' + (QE - 1) + ', full HP: still phase 1');
    g2.s.round = QE;
    DD.AI.act(b2);
    t.ok(b2.data.phase === 2 && b2.hp === b2.maxHp && has(b2, 'grim_takeover'), 'round ' + QE + ' at full HP: Hostile Takeover');
    t.ok(g2.s.log.some(function (l) { return /The fiscal quarter ends\. Grimble initiates a HOSTILE TAKEOVER/.test(l.text); }), 'announced as the end of the fiscal quarter');
    t.ok(!!slotOf(b2, 'grim_garnish'), 'Garnish Wages: hiding behind a cabinet stops working');
  });

  T.suite('bosses_act1: grimble ill-gotten gains, garnish wages and refunds', function (t) {
    if (!have()) { t.skip('boss content not loaded'); return; }
    const G = GB();
    let g = grimbleAlone(50);
    let boss = g.boss;
    const k = hero('test_knight'), c = hero('test_cleric');
    put(c, 5, 7);
    g.s.sandboxGold = 300;
    const gains = function (held) { return Math.min(G.GAIN_MAX, Math.floor(held / G.GAIN_PER)); };
    for (let i = 0; i < 3; i++) { now(boss, 'grim_levy', c); c.hp = c.maxHp; }
    const held = boss.data.stolen;
    const b = gains(held);
    t.ok(b >= 2, 'holding ' + held + ' gold is worth +' + b);
    t.ok(new RegExp('\\+' + b + ' damage').test(DD.getStatus('grim_ledger').desc(DD.Act.getStatus(boss, 'grim_ledger'))), 'Ill-Gotten Gains shows the bonus');
    c.hp = c.maxHp;
    let h0 = c.hp;
    now(boss, 'grim_redtape', c);
    t.eq(h0 - c.hp, L1('grim_redtape').dmg + b, 'Red Tape gets it: ' + (L1('grim_redtape').dmg + b));
    put(c, 4, 3);
    h0 = c.hp;
    now(boss, 'grim_stamp', boss);
    t.eq(h0 - c.hp, L1('grim_stamp').dmg + b, 'so does the Stamp');
    // ...but not the Audit: a Levy on his other turn can't raise a pending Audit after the heroes saw it
    boss.intents = [];
    put(c, 5, 7);
    c.hp = c.maxHp;
    DD.AI.act(boss);
    const au = pendingOf(boss, 'grim_audit')[0];
    t.eq(DD.AI.describe(boss, au).dmg, L1('grim_audit').dmg, 'the Audit shows its plain ' + L1('grim_audit').dmg + ' while he holds ' + boss.data.stolen + ' gold');
    c.hp = c.maxHp;
    h0 = c.hp;
    DD.Combat._action(function () { DD.Combat.resolveSkill(boss, DD.getSkill('grim_audit'), { x: c.x, y: c.y }, { extra: { tiles: [{ x: c.x, y: c.y }] } }); });
    t.eq(h0 - c.hp, L1('grim_audit').dmg, 'and hits for exactly that');
    // the cap
    const st = DD.Act.getStatus(boss, 'grim_ledger');
    st.stacks = G.GAIN_PER * (G.GAIN_MAX + 3); boss.data.stolen = st.stacks;
    c.hp = c.maxHp; h0 = c.hp;
    now(boss, 'grim_redtape', c);
    t.eq(h0 - c.hp, L1('grim_redtape').dmg + G.GAIN_MAX, 'capped at +' + G.GAIN_MAX);
    // the vault door knocks it all loose
    g.s.sandboxGold = 10;
    const all = boss.data.stolen;
    DD.Combat._action(function () { G.dropVault(k); });
    t.eq(DD.Act.gold(), 10 + all, 'the vault drop refunds all ' + all + ' gold he was holding');
    t.eq(boss.data.stolen, 0, 'his ledger is empty');
    t.ok(!has(boss, 'grim_ledger'), 'Ill-Gotten Gains is gone (no more bonus)');
    t.ok(g.s.log.some(function (l) { return /refunded to the party/.test(l.text); }), 'the refund is announced');
    // refund on death; killing him wins
    g = grimbleAlone(51);
    boss = g.boss;
    boss.data.stolen = 17;
    g.s.sandboxGold = 5;
    DD.Combat._action(function () { DD.Act.kill(boss, hero('test_knight')); });
    t.eq(DD.Act.gold(), 22, 'his ledger refunds the 17 stolen gold when he falls');
    t.eq(g.s.result, 'victory', 'killing Grimble wins the fight');
    // in a live run the refund goes back raw (no passive gold bonus on your own coins)
    g = grimbleAlone(52);
    boss = g.boss;
    boss.data.stolen = 40;
    if (DD.Run) {
      const fakeRun = { gold: 5 }, calls = [];
      const savedState = DD.Run.state, savedAdd = DD.Run.addGold;
      g.s.run = fakeRun; DD.Run.state = fakeRun;
      DD.Run.addGold = function (n, opts) { calls.push([n, opts]); fakeRun.gold += n; return n; };
      try { DD.Combat._action(function () { G.dropVault(hero('test_knight')); }); } finally { DD.Run.state = savedState; DD.Run.addGold = savedAdd; g.s.run = null; }
      t.ok(calls.length === 1 && calls[0][0] === 40 && calls[0][1] && calls[0][1].raw === true, 'the vault refund pays the 40 gold back raw: ' + JSON.stringify(calls));
    }
  });

  T.suite('bosses_act1: grimble tax loophole puzzle (vault door) and its AutoPlay hints', function (t) {
    if (!have()) { t.skip('boss content not loaded'); return; }
    const s = fight('boss_grimble', 60);
    killAll('grim_intern');
    const boss = units('grimble')[0];
    const k = hero('test_knight'), c = hero('test_cleric'), m = hero('test_mage'), r = hero('test_rogue');
    const ls = GB().loopholes(s);
    const at = function (x, y) { return ls.filter(function (l) { return l.x === x && l.y === y; })[0]; };
    const hint = function (l, u) { return DD.getObject('grim_loophole').autoplay(u, l.obj, tile(l.x, l.y), s); };
    park([k, c, m, r], [{ x: 9, y: 3 }, { x: 2, y: 4 }, { x: 6, y: 8 }, { x: 11, y: 11 }]);
    DD.AI.act(boss);
    put(boss, 5, 3);
    t.ok(pendingOf(boss, 'grim_audit').length === 1, 'an Audit is pending before the drop');
    boss.block = 7;
    t.eq(hint(at(10, 3), k), 16, 'first pull hint 16 (beats a basic attack)');
    DD.Combat.giveTurnTo(k);
    const ia = DD.Combat.interactions(k).filter(function (o) { return o.x === 10 && o.y === 3; })[0];
    t.ok(ia && ia.label === 'Exploit Loophole' && ia.ap === 1, 'adjacent hero can Exploit Loophole (1 AP)');
    t.ok(DD.Combat.interact(k, 10, 3), 'pull 1');
    t.ok(at(10, 3).obj.data.on && /EXPLOITED/.test(at(10, 3).obj.label), 'loophole 1 exploited (label says so)');
    t.eq(hint(at(10, 3), k), 0, 'an exploited loophole hints 0');
    t.ok(!DD.Combat.interactions(k).some(function (o) { return o.x === 10 && o.y === 3; }), 'and offers no interaction');
    // an intern able to undo the work on its next turn: deal with it first
    const spy = DD.Act.spawn('grim_intern', 11, 6, { silent: true });
    t.eq(hint(at(1, 4), c), 6, 'an intern that can reach the exploited loophole: the next pull is only worth 6');
    DD.Combat._action(function () { DD.Act.kill(spy, k); });
    t.eq(hint(at(1, 4), c), 20, 'second pull hint 20 once the intern is gone');
    t.ok(interactAt(c, 1, 4, { x: 2, y: 4 }), 'pull 2');
    // the last pull: only with Grimble (and no hero) under the door
    t.eq(hint(at(6, 7), m), 60, 'last pull with Grimble in the zone: 60');
    put(r, 4, 2);
    t.eq(hint(at(6, 7), m), 0, 'a hero in the DROP ZONE: AutoPlay waits');
    const rHp = r.hp, bHp = boss.hp;
    const V = GB().VAULT_DMG;
    const rec = recorder();
    t.ok(interactAt(m, 6, 7, { x: 6, y: 8 }), 'pull 3');
    const g = GB().data(s);
    t.ok(g.drops === 1 && g.hits === 1, 'the vault door dropped and hit Grimble');
    t.eq(bHp - boss.hp, V, 'Grimble takes ' + V + ' (Block ignored)');
    t.eq(boss.block, 0, 'his Block is stripped');
    t.ok(has(boss, 'stun') && (DD.Act.getStatus(boss, 'stun') || {}).turns === 2, 'Stunned for his next 2 turns');
    t.ok(has(boss, 'vulnerable'), 'and Vulnerable');
    t.eq(pendingOf(boss).length, 0, 'the stun interrupts his pending Audit');
    t.ok(rec.cancels.some(function (e) { return e.unit === boss; }), 'windup:cancel');
    t.eq(rHp - r.hp, Math.min(rHp, V), 'a hero in the zone is flattened too');
    t.ok(r.downed || has(r, 'stun'), 'and stunned (or worse)');
    t.ok(ls.every(function (l) { return !l.obj.data.on; }), 'loopholes reset');
    const R1 = GB().reviewRounds(1);
    t.eq(g.jam, R1, 'under review for ' + R1 + ' rounds');
    t.ok(GB().vaultTile(s).obj.data.down, 'vault door is down');
    t.ok(ls.every(function (l) { return /under review/.test(l.obj.label); }), 'labels say under review');
    t.ok(!DD.Combat.interactions(m).some(function (o) { return o.kind === 'object' && o.x === 6 && o.y === 7; }), 'no exploiting during the review');
    t.eq(hint(at(10, 3), k), 0, 'review hints 0');
    rec.off();
    // the review ticks down once per round
    let left = GB().data(s).jam;
    while (left > 0 && !s.result) {
      DD.Combat.endRound();
      t.eq(GB().data(s).jam, left - 1, 'review ticks down (' + (left - 1) + ')');
      left = GB().data(s).jam;
    }
    t.ok(!GB().vaultTile(s).obj.data.down, 'the interns winched the door back up');
    t.ok(ls.every(function (l) { return !/under review/.test(l.obj.label); }), 'labels back to normal');
    DD.Combat.giveTurnTo(k); put(k, 9, 3);
    t.ok(DD.Combat.interactions(k).some(function (o) { return o.x === 10 && o.y === 3 && o.label === 'Exploit Loophole'; }), 'the loopholes can be exploited again');
    // a drop on an empty zone: nothing happens to Grimble, the review gets longer
    ls.forEach(function (l) { l.obj.data.on = true; });
    at(6, 7).obj.data.on = false;
    put(boss, 8, 7);
    s.units.filter(function (u) { return !u.dead && inZone(u); }).forEach(function (u) { put(u, 11, 6); });
    t.eq(hint(at(6, 7), m), 0, 'nobody under the door: hint 0');
    const before = boss.hp;
    t.ok(interactAt(m, 6, 7, { x: 6, y: 8 }), 'pull on an empty zone');
    t.eq(boss.hp, before, 'a drop on an empty zone does nothing to Grimble');
    t.eq(GB().data(s).drops, 2, 'still counts as a drop');
    t.eq(GB().data(s).jam, GB().reviewRounds(2), 'and the paperwork piles up: ' + GB().reviewRounds(2) + ' rounds of review');
    // only an intern under the door: AutoPlay keeps the last loophole for the taxman
    const s2 = fight('boss_grimble', 61);
    killAll('grim_intern');
    const g2 = units('grimble')[0];
    const ls2 = GB().loopholes(s2);
    ls2.forEach(function (l) { l.obj.data.on = true; });
    const last = ls2.filter(function (l) { return l.x === 6 && l.y === 7; })[0];
    last.obj.data.on = false;
    put(g2, 8, 7);
    DD.Act.spawn('grim_intern', 4, 2, { silent: true });
    const h2 = function () { return DD.getObject('grim_loophole').autoplay(hero('test_mage'), last.obj, tile(last.x, last.y), s2); };
    t.eq(h2(), 0, 'only an intern in the DROP ZONE: hint 0');
    put(g2, 5, 3);
    t.eq(h2(), 60 + 8, 'Grimble (60) and his intern (8) under the door');
    // with his turns played for real: the drop costs him both of them
    stunCostsBothTurns(t, 'the vault door', 'boss_grimble', 'grimble', 'grim_intern', 62, function (b) {
      put(b, 5, 3); put(hero('test_mage'), 5, 7);
      DD.Combat._action(function () { GB().dropVault(hero('test_mage')); });
    });
  });

  T.suite('bosses_act1: grimble previews and edge cases', function (t) {
    if (!have()) { t.skip('boss content not loaded'); return; }
    const fp = T.contentHelpers && T.contentHelpers.fingerprint;
    const s = fight('boss_grimble', 70);
    killAll('grim_intern');
    const boss = units('grimble')[0];
    const k = hero('test_knight'), m = hero('test_mage');
    put(boss, 5, 3);
    // a shield bash pushes Grimble out of his zone: preview == reality
    const bash = slotOf(k, 'test_shield_bash');
    if (bash) {
      DD.Combat.giveTurnTo(k);
      put(k, 4, 3);
      const f0 = fp ? fp(s) : '';
      const prev = DD.Combat.preview(k, bash, boss.x, boss.y);
      if (fp) t.eq(fp(s), f0, 'preview leaves the fight untouched');
      const e = prev.perUnit[boss.id];
      const hp0 = boss.hp, x0 = boss.x;
      t.ok(DD.Combat.useSkill(k, bash, boss.x, boss.y), 'shield bash Grimble');
      t.eq(hp0 - boss.hp, e ? e.dmg : -1, 'preview damage == real damage');
      t.ok(boss.x !== x0 && e && e.moved, 'Grimble is pushable (and the preview says so)');
    }
    // fire weakness: a fireball preview matches
    const fb = slotOf(m, 'test_fireball');
    if (fb) {
      DD.Combat.giveTurnTo(m);
      put(m, boss.x, Math.min(11, boss.y + 3));
      const prev = DD.Combat.preview(m, fb, boss.x, boss.y);
      const hp0 = boss.hp;
      t.ok(DD.Combat.useSkill(m, fb, boss.x, boss.y), 'fireball Grimble');
      const e = prev.perUnit[boss.id];
      t.eq(hp0 - boss.hp, e ? e.dmg : -1, 'fireball preview == reality (fire weakness applied)');
      t.ok(hp0 - boss.hp > L1('test_fireball').dmg, 'paperwork burns: weak to fire');
    }
    // enemy skill previews never throw
    DD.Combat.slotsOf(boss).forEach(function (sl) {
      const r = t.tryRun('preview ' + sl.id, function () { return DD.Targeting.preview(boss, sl, { x: m.x, y: m.y }); });
      t.ok(r && typeof r === 'object', 'Targeting.preview of ' + sl.id + ' returns a result');
    });
    // a Levy on an empty tile (the target died) is harmless
    s.sandboxGold = 9;
    t.tryRun('levy at an empty tile', function () { now(boss, 'grim_levy', { x: 1, y: 11 }); });
    t.eq(DD.Act.gold(), 9, 'no hero hit: no gold taken');
    // a whole round with every control status on him runs clean
    ['charmed', 'taunt', 'silenced', 'dazzled', 'confused', 'rooted', 'slow', 'haste', 'sheep'].forEach(function (id) {
      const s2 = fight('boss_grimble', 71, { ai: true, gold: 60 });
      const b = units('grimble')[0];
      const sid = id === 'rooted' ? 'root' : id;
      if (!DD.getStatus(sid)) return;
      DD.Act.addStatus(b, sid, { turns: 2 }, hero('test_knight'));
      t.tryRun('grimble ' + sid, function () { for (let i = 0; i < 2 && !s2.result; i++) DD.Combat.endRound(); });
      t.ok(T.contentHelpers.sanity(t, 'grimble ' + sid), 'two rounds with Grimble ' + sid);
    });
  });

  // =====================================================================================================================
  // THE RAT KING
  // =====================================================================================================================
  const R_FAR = [{ x: 1, y: 11 }, { x: 2, y: 11 }, { x: 11, y: 11 }, { x: 12, y: 11 }];
  function near8(a, b) { return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) === 1; }
  /** A sewer with the lawyers dismissed (the King alone), heroes parked in the corners; opts.still: he does not walk. */
  function kingAlone(seed, opts) {
    opts = opts || {};
    const s = fight('boss_rat_king', seed, opts);
    killAll('rat_lawyer');
    const king = units('rat_king')[0];
    park(DD.Combat.heroes(), R_FAR);
    if (opts.still) king.mov = 0;
    return { s: s, king: king };
  }
  function valve(chan) { return RK().valves().filter(function (v) { return v.obj.data.chan === chan; })[0]; }

  T.suite('bosses_act1: rat king registry, arena and encounter', function (t) {
    if (!have()) { t.skip('boss content not loaded'); return; }
    ['rat_king', 'rat_lawyer', 'rat_plaintiff'].forEach(function (id) { t.ok(!!DD.getEnemy(id), 'enemy ' + id); });
    ['rat_pile', 'rat_gnaw', 'rat_surge', 'rat_tails', 'rat_gavel', 'rat_class', 'rat_nibble', 'rat_objection', 'rat_cease', 'rat_billable'].forEach(function (id) {
      const s = DD.getSkill(id);
      t.ok(!!s && s.owner === 'enemy', 'skill ' + id);
      if (s) for (let lv = 1; lv <= s.levels.length; lv++) t.ok(!/undefined|NaN/.test(DD.skillDesc(s, lv, null)), id + ' desc L' + lv);
    });
    t.ok(!!DD.getObject('rat_valve') && !!DD.getTerrain('rat_rot') && !!DD.getStatus('rat_session') && !!DD.getStatus('rat_swarm') && !!DD.getStatus('rat_recess'), 'valve, rotten floor, statuses');
    const kd = DD.getEnemy('rat_king');
    t.ok(kd.tier === 'boss' && kd.hp >= 150 && kd.hp <= 200, 'Act 1 boss HP ' + kd.hp);
    t.eq(kd.turnsPerRound, 2, 'forty rats: two initiative entries a round');
    t.ok(kd.skills.indexOf('rat_gnaw') < 0 && kd.skills.indexOf('rat_surge') < 0, 'Gnaw and Sewer Surge are wind-ups only (not in his skill list)');
    t.ok(kd.flags.immovable, 'the swarm is immovable (only water moves it)');
    t.ok(kd.sprite.base === 'custom' && typeof kd.sprite.draw === 'function' && kd.sprite.scale >= 1.8, 'custom boss sprite');
    ['spawn', 'attack', 'hurt', 'death', 'phase', 'flush'].forEach(function (k) {
      t.ok(Array.isArray(kd.barks[k]) && kd.barks[k].length >= 2 && kd.barks[k].every(function (b) { return b.length <= 70; }), 'rat king barks.' + k);
    });
    ['rat_lawyer', 'rat_plaintiff'].forEach(function (id) {
      const b = DD.getEnemy(id).barks;
      ['spawn', 'attack', 'hurt', 'death'].forEach(function (k) { t.ok(b[k].length >= 2 && b[k].every(function (x) { return x.length <= 70; }), id + ' barks.' + k); });
    });
    const pd = passiveText(null, 'rat_king');
    t.ok(/Two turns a round/.test(pd) && /Tangled Tails, Gnaw, Tangled Tails, Sewer Surge/.test(pd) && /one round later/.test(pd) && !/next:/.test(pd), 'his passive states the rule');
    const s = fight('boss_rat_king', 1);
    const ch = RK().channels(s);
    t.eq(Object.keys(ch).sort().join(','), 'A,B', 'two channels');
    t.ok(ch.A.length === 24 && ch.B.length === 24, 'each 2 rows x 12');
    t.ok(ch.A.every(function (p) { return tile(p.x, p.y).t === 'water'; }), 'channels are shallow water');
    [[0, 3], [0, 4], [0, 7], [0, 8]].forEach(function (p) { t.ok(DD.Grid.isPit(p[0], p[1]), 'drain at ' + p); });
    t.eq(RK().rotTiles(s).length, 8, '8 rotten floor tiles');
    const vs = RK().valves(s);
    t.eq(vs.length, 2, 'two sluice valves');
    t.ok(valve('A').x === 7 && valve('A').y === 5 && valve('B').x === 6 && valve('B').y === 9, 'valve A on the island, valve B on the party walkway');
    t.ok(vs.every(function (v) { return /Sluice Valve \(channel [AB]\)/.test(v.obj.label); }), 'valves labelled');
    t.ok(new RegExp('FLUSHED \\(' + RK().FLUSH_DMG + ' damage').test(DD.getObject('rat_valve').desc), 'valve desc shows the flush damage');
    const king = units('rat_king')[0];
    t.ok(king.x === 6 && king.y === 1, 'the King starts on his throne walkway');
    t.eq(units('rat_lawyer').length, 2, 'with two Rat Lawyers on retainer');
    t.ok(has(king, 'rat_session'), 'court is in session (phase status)');
    t.ok(/next: Tangled Tails/.test(passiveText(king)), 'in a fight the passive names the next docket step');
    const v = DD.MapGen.validate({ grid: s.grid, heroZone: s.heroZone || [], enemyZone: s.enemyZone || [] }, { layout: true });
    t.ok(v.ok, 'arena layout validates: ' + v.problems.join('; '));
    RK().rotTiles(s).forEach(function (p) { tile(p.x, p.y).t = 'pit'; });
    const v2 = DD.MapGen.validate({ grid: s.grid, heroZone: s.heroZone || [], enemyZone: s.enemyZone || [] }, { layout: true });
    t.ok(v2.ok, 'still connected with every rotten tile collapsed: ' + v2.problems.join('; '));
    t.ok(s.log.some(function (l) { return l.cls === 'narrator' && /valve|water/i.test(l.text); }), 'the DM hints at the valves');
    const rs = realFight('boss_rat_king', 2);
    DD.Combat.rollInitiative();
    const rk = rs.units.filter(function (u) { return u.defId === 'rat_king'; })[0];
    t.eq(rs.order.filter(function (e) { return e.unitId === rk.id; }).length, 2, 'rolled initiative: two entries for the King');
  });

  T.suite('bosses_act1: rat king takes one action a turn (rat pile or docket, gavel fallback)', function (t) {
    if (!have()) { t.skip('boss content not loaded'); return; }
    let g = kingAlone(2, { still: true });
    let king = g.king;
    const k = hero('test_knight'), c = hero('test_cleric'), m = hero('test_mage'), r = hero('test_rogue');
    put(king, 6, 5);
    put(c, 6, 8);                                   // 3 tiles away, in a clear line: reeled in next to him
    put(m, 11, 6);                                  // next to rotten floor (10,6), 6 tiles away
    king.data.step = 0;
    DD.AI.act(king);
    t.eq(king.data.lastAct, 'tails', 'step 1: Tangled Tails');
    t.ok(near8(c, king) && has(c, 'root'), 'the hero 3 tiles away (not the one 6 away) is reeled in next to him and Rooted (' + key(c) + ')');
    DD.AI.act(king);
    t.eq(king.data.lastAct, 'pile', 'a Rooted hero next to him: Rat Pile instead of the docket');
    t.eq(king.data.step, 1, 'a Rat Pile turn keeps the docket where it was');
    t.ok(/next: Gnaw/.test(passiveText(king)), 'the passive names the next step (Gnaw)');
    refresh([c]);
    put(c, 11, 10);
    DD.AI.act(king);
    t.eq(king.data.lastAct, 'gnaw', 'step 2: Gnaw (a hero next to rotten floor)');
    const gn = pendingOf(king, 'rat_gnaw')[0];
    t.ok(gn && gn.anchor === 'ground' && gn.tiles.length >= 1 && gn.tiles.length <= L1('rat_gnaw').n && gn.tiles.every(function (q) { return tile(q.x, q.y).t === 'rat_rot'; }), 'Gnaw marks up to ' + L1('rat_gnaw').n + ' rotten tiles (the ones near heroes: ' + (gn ? gn.tiles.length : 0) + ')');
    t.ok(gn && gn.tiles.some(function (q) { return DD.Grid.dist(q, m) <= 1; }), 'next to the hero');
    t.ok(gn && gn.turnsLeft === 2 && gn.window === 0 && gn.data.oneRound, 'a one-round wind-up');
    DD.AI.act(king);
    t.eq(king.data.lastAct, 'tails', 'step 3: Tangled Tails');
    refresh([m]);
    put(m, 11, 6);
    DD.AI.act(king);
    t.eq(king.data.lastAct, 'gavel', 'step 4: Sewer Surge, but a wind-up is still pending: the gavel instead');
    // Sewer Surge on the channel with a hero in it
    king.intents = [];
    refresh([k, c, m, r]);
    put(m, 6, 8);
    king.data.step = 3;
    DD.AI.act(king);
    const su = pendingOf(king, 'rat_surge')[0];
    t.ok(su && su.data.chan === 'B' && su.tiles.length === 24, 'step 4: Sewer Surge marks the whole channel with a hero in it');
    // nobody near the rot or in the water: the gavel
    king.intents = [];
    refresh([k, c, m, r]);
    park([k, c, m, r], [{ x: 6, y: 10 }, { x: 8, y: 10 }, { x: 11, y: 11 }, { x: 12, y: 11 }]);
    king.data.step = 1;
    DD.AI.act(king);
    t.eq(king.data.lastAct, 'gavel', 'nothing to gnaw or flood: he throws his gavel instead');
    t.ok(!pendingOf(king).length, 'and winds up nothing');
    // three heroes next to him: Rat Pile (diagonals count); two free heroes are not enough
    t.eq(RK().cfg.crowd, 3, 'a crowd is three heroes');
    refresh([k, c, m, r]);
    put(m, 7, 6); put(k, 5, 5); put(r, 5, 6);
    DD.AI.act(king);
    t.eq(king.data.lastAct, 'pile', 'three heroes next to him (two diagonal): Rat Pile');
    refresh([k, c, m, r]);
    put(r, 12, 11);
    king.data.step = 0;
    DD.AI.act(king);
    t.ok(king.data.lastAct !== 'pile', 'two free heroes next to him are not enough (' + king.data.lastAct + ')');
    // he wades toward the party
    g = kingAlone(3);
    king = g.king;
    park(DD.Combat.heroes(), [{ x: 3, y: 10 }, { x: 5, y: 10 }, { x: 7, y: 10 }, { x: 9, y: 10 }]);
    DD.AI.act(king);
    t.ok(king.y > 1, 'the King advances toward the party (now at ' + key(king) + ')');
    // he walks up to a rooted hero and piles on
    g = kingAlone(4);
    king = g.king;
    const c2 = hero('test_cleric');
    put(king, 6, 5); put(c2, 9, 6);
    DD.Act.addStatus(c2, 'root', { turns: 1 }, null);
    king.data.step = 1;
    DD.AI.act(king);
    t.ok(near8(king, c2) && king.data.lastAct === 'pile', 'he walks up to a rooted hero and piles on (' + key(king) + ', ' + king.data.lastAct + ')');
    // sandbox without the sewer still works
    DD.Combat.sandbox({ w: 9, h: 9, seed: 3, heroes: [{ id: 'test_mage', x: 1, y: 1, level: 2 }, { id: 'test_cleric', x: 3, y: 1, level: 2 }, { id: 'test_knight', x: 2, y: 3, level: 2 }],
      enemies: [{ id: 'rat_king', x: 2, y: 2 }], enemyAi: false });
    const k2 = units('rat_king')[0];
    t.tryRun('rat king without his sewer', function () { DD.AI.act(k2); });
    t.log('sandbox king ' + key(k2) + ' heroes ' + DD.Combat.heroes().map(key).join(' ') + ' last ' + k2.data.lastAct);
    t.eq(k2.data.lastAct, 'pile', 'without channels or rotten floor he still bites');
  });

  T.suite('bosses_act1: rat king attacks deal exactly what they say', function (t) {
    if (!have()) { t.skip('boss content not loaded'); return; }
    // Rat Pile: every hero within the 8 tiles
    let g = kingAlone(10, { still: true });
    let king = g.king;
    let c = hero('test_cleric'), m = hero('test_mage');
    put(king, 6, 10); put(c, 5, 10); put(m, 7, 11);
    const PL = L1('rat_pile');
    let hc = c.hp, hm = m.hp;
    now(king, 'rat_pile', king);
    t.eq(hc - c.hp, PL.dmg, 'Rat Pile hits the cleric (side) for ' + PL.dmg);
    t.eq(hm - m.hp, PL.dmg, 'and the mage (diagonal) for ' + PL.dmg);
    t.ok(has(c, 'bleed') && has(m, 'bleed'), 'Bleed ' + PL.bleed + ' on both');
    // Tangled Tails: damage, pull, Root; the gavel
    g = kingAlone(11, { still: true });
    king = g.king;
    c = hero('test_cleric'); m = hero('test_mage');
    put(king, 6, 5); put(c, 6, 8); put(m, 9, 6);
    const TL = L1('rat_tails'), GV = L1('rat_gavel');
    hc = c.hp;
    now(king, 'rat_tails', c);
    t.eq(hc - c.hp, TL.dmg, 'Tangled Tails deals ' + TL.dmg);
    t.ok(c.x === 6 && c.y === 8 - TL.pull, 'and pulls the hero ' + TL.pull + ' tiles closer (' + key(c) + ')');
    t.ok(has(c, 'root'), 'and Roots them');
    hm = m.hp;
    now(king, 'rat_gavel', m);
    t.eq(hm - m.hp, GV.dmg, 'the gavel deals ' + GV.dmg);
    // Gnaw: damage to heroes on the tiles, then pits (a hero on it falls: 25% max HP) and climbs out
    g = kingAlone(12, { still: true });
    king = g.king;
    c = hero('test_cleric'); m = hero('test_mage');
    put(c, 4, 5); put(m, 10, 6);
    king.data.step = 1;
    DD.AI.act(king);
    const gn = pendingOf(king, 'rat_gnaw')[0];
    t.ok(gn && inList({ x: 4, y: 5 }, gn.tiles) && inList({ x: 10, y: 6 }, gn.tiles), 'Gnaw targets the rotten tiles under the heroes');
    const GL = L1('rat_gnaw');
    hc = c.hp;
    const fall = Math.ceil(c.maxHp * 0.25);
    DD.Combat.giveTurnTo(king);     // his two turns (back to back here; wound up on a hero's turn, both count it down)
    t.eq(hc - c.hp, GL.dmg + fall, 'standing on it: ' + GL.dmg + ' + a 25% max HP fall (' + fall + ')');
    t.ok(DD.Grid.isPit(4, 5) && DD.Grid.isPit(10, 6), 'the gnawed tiles are pits now');
    t.ok(!DD.Grid.isPit(c.x, c.y) && DD.Grid.isWalkable(c.x, c.y, c), 'the hero climbed out');
    t.eq(RK().rotTiles().length, 8 - GL.n, GL.n + ' rotten tiles used up');
    // Sewer Surge: heroes in the channel, then everybody but the King washed into the drain
    g = fight('boss_rat_king', 13);
    king = units('rat_king')[0];
    const lw = units('rat_lawyer')[0];
    units('rat_lawyer').slice(1).forEach(function (u) { DD.Act.kill(u, null, { force: true }); });
    c = hero('test_cleric'); m = hero('test_mage');
    park(['test_knight', 'test_rogue'].map(hero), [{ x: 2, y: 11 }, { x: 11, y: 11 }]);
    put(c, 8, 7); put(m, 3, 10); put(lw, 5, 8); put(king, 10, 8);
    king.mov = 0;
    king.data.step = 3;
    DD.AI.act(king);
    const su = pendingOf(king, 'rat_surge')[0];
    t.ok(su && su.data.chan === 'B', 'surge wound up on channel B');
    const SL = L1('rat_surge');
    hc = c.hp;
    let mid = null;
    const off = DD.Events.on('turn:end', function (e) { if (e.unit === king && mid === null) mid = c.hp; });
    DD.Combat.giveTurnTo(king);
    off();
    t.eq(mid, hc, 'after his first turn: nothing yet');
    const fallC = Math.ceil(c.maxHp * 0.25);
    t.eq(hc - c.hp, SL.dmg + fallC, 'a hero in the flooded channel takes ' + SL.dmg + ' and is washed into the drain (+' + fallC + ')');
    t.ok(!inList(c, RK().chanTiles('B')), 'and climbs out onto the walkway, not back into the water');
    t.ok(lw.dead, 'his own lawyer in the channel drowned');
    t.ok(!king.dead && king.x === 10 && king.y === 8, 'the King rides his own surge');
    // lawyers: OBJECTION! push, Cease and Desist Root, Billable Bite (also their attack of opportunity)
    g = fight('boss_rat_king', 14);
    king = units('rat_king')[0];
    const law = units('rat_lawyer')[0];
    units('rat_lawyer').slice(1).forEach(function (u) { DD.Act.kill(u, null, { force: true }); });
    m = hero('test_mage');
    park(['test_knight', 'test_cleric', 'test_rogue'].map(hero), [{ x: 2, y: 11 }, { x: 11, y: 11 }, { x: 10, y: 11 }]);
    put(king, 1, 1);
    put(law, 5, 5); put(m, 5, 9);
    const OL = L1('rat_objection'), CL = L1('rat_cease'), BL = L1('rat_billable');
    let h0 = m.hp;
    now(law, 'rat_objection', m);
    t.eq(h0 - m.hp, OL.dmg, 'OBJECTION! deals ' + OL.dmg);
    t.ok(m.x === 5 && m.y === 9 + OL.push, 'and pushes the hero ' + OL.push + ' tile away (' + key(m) + ')');
    put(m, 5, 8);
    h0 = m.hp;
    now(law, 'rat_cease', m);
    t.eq(h0 - m.hp, CL.dmg, 'Cease and Desist deals ' + CL.dmg);
    t.ok(has(m, 'root'), 'and Roots');
    DD.Act.removeStatus(m, 'root', { silent: true });
    put(law, 5, 9); put(m, 5, 10);
    m.hp = m.maxHp;
    h0 = m.hp;
    now(law, 'rat_billable', m);
    t.eq(h0 - m.hp, BL.dmg, 'Billable Bite deals ' + BL.dmg);
    const rec = recorder();
    DD.Combat.giveTurnTo(m);
    h0 = m.hp;
    DD.Combat.move(m, 8, 10);
    rec.off();
    t.ok(rec.aoo.some(function (e) { return e.attacker === law && e.skillId === 'rat_billable'; }), 'walking away from a lawyer provokes its Billable Bite');
    t.eq(rec.hits.filter(function (hh) { return hh.opp && hh.target === m; }).reduce(function (a, hh) { return a + hh.dealt; }, 0), BL.dmg, 'for ' + BL.dmg);
    // the lawyer AI likes rooting heroes the King can reach
    const cease = DD.getSkill('rat_cease');
    put(king, 6, 7); put(law, 6, 4); put(m, 6, 6);
    const sc1 = cease.aiScore(DD.Targeting.buildCtx(law, slotOf(law, 'rat_cease'), { x: m.x, y: m.y }));
    DD.Act.addStatus(m, 'root', { turns: 1 }, null);
    const sc2 = cease.aiScore(DD.Targeting.buildCtx(law, slotOf(law, 'rat_cease'), { x: m.x, y: m.y }));
    t.ok(sc1 > 0 && sc2 < 0, 'Cease and Desist is worth it on a free hero near the King, not on a rooted one (' + sc1 + ' / ' + sc2 + ')');
    // Plaintiff Rats nibble
    const pr = DD.Act.spawn('rat_plaintiff', 7, 10, { silent: true });
    DD.Act.removeStatus(m, 'root', { silent: true });
    put(m, 7, 11);
    m.hp = m.maxHp;
    h0 = m.hp;
    now(pr, 'rat_nibble', m);
    t.eq(h0 - m.hp, L1('rat_nibble').dmg, 'Nibble deals ' + L1('rat_nibble').dmg);
  });

  T.suite('bosses_act1: rat king wind-ups land one round later; a stun or a flush interrupts them', function (t) {
    if (!have()) { t.skip('boss content not loaded'); return; }
    const orders = [
      { label: 'his turns apart', order: ['test_mage', 'rat_king', 'test_cleric'] },
      { label: 'his two turns back to back', order: ['test_mage', 'test_cleric', 'rat_king'] },
      { label: 'his second turn last, his first turn first', order: ['rat_king', 'test_mage', 'test_cleric'] },
    ];
    // a wind-up-only docket for these runs (his real one has Tangled Tails in it, whose pulls feed Rat Piles instead)
    const P = RK().PATTERNS, saved = P[1];
    P[1] = ['surge', 'gnaw'];
    try {
      orders.forEach(function (o, i) {
        fight('boss_rat_king', 20 + i, { ai: true, heroes: ['test_mage', 'test_cleric'], order: o.order });
        killAll('rat_lawyer');
        const king = units('rat_king')[0];
        const m = hero('test_mage'), c = hero('test_cleric');
        sturdy([m, c]);
        king.mov = 0;
        put(king, 11, 1);
        // two heroes who keep standing in the channels and next to rotten floor (re-placed at each hero turn start)
        const pin = function () { if (!m.dead) put(m, 4, 8); if (!c.dead) put(c, 9, 4); };
        const off = DD.Events.on('turn:start', function (e) { if (DD.Combat.isPlayerControlled(e.unit)) pin(); });
        pin();
        let tl;
        try { tl = windTimeline(king, function () { for (let r = 0; r < 5 && !DD.Combat.state.result; r++) DD.Combat.endRound(); }); } finally { off(); }
        checkTimeline(t, o.label, tl, 2);
      });
    } finally { P[1] = saved; }
    // a stun on a hero's turn interrupts the pending wind-up and costs his next turn; the court then calls a recess
    let g = fight('boss_rat_king', 25, { ai: true, heroes: ['test_mage', 'test_cleric'], order: ['test_mage', 'rat_king', 'test_cleric'] });
    killAll('rat_lawyer');
    let king = units('rat_king')[0];
    const m = hero('test_mage'), c = hero('test_cleric');
    sturdy([m, c]);
    put(m, 6, 8); put(c, 11, 10);
    king.data.step = 3;                           // next: Sewer Surge (the mage stands in channel B)
    DD.Combat.endTurn();
    t.ok(DD.Combat.isTurnOf(c) && pendingOf(king, 'rat_surge').length === 1, 'a Sewer Surge is pending on the cleric\'s turn');
    const rec = recorder();
    DD.Act.addStatus(king, 'stun', { turns: 1 }, c);
    t.eq(pendingOf(king).length, 0, 'the stun interrupts it at once');
    t.ok(rec.cancels.some(function (e) { return e.unit === king; }) && has(king, 'rat_recess'), 'windup:cancel, and the court calls a recess');
    const used0 = rec.usedBy(king).length;
    DD.Combat.endTurn();
    t.eq(rec.usedBy(king).length, used0, 'his next turn is lost');
    DD.Combat.endTurn();
    t.ok(rec.usedBy(king).length > used0, 'the turn after, he acts again');
    DD.Act.addStatus(king, 'stun', { turns: 1 }, c);
    t.ok(!has(king, 'stun'), 'recess: no second stun');
    DD.Act.addStatus(king, 'charmed', { turns: 1 }, c);
    t.ok(!has(king, 'charmed'), 'recess: no charm');
    const other = Object.keys(DD.defs.statuses).filter(function (id) { return DD.Act.isStunLike(id) && ['stun', 'sleep', 'frozen'].indexOf(id) < 0; })[0];
    if (other) { DD.Act.addStatus(king, other, { turns: 1 }, c); t.ok(!has(king, other), 'recess: no ' + other + ' either'); }
    rec.off();
    // a flush interrupts too (and always lands)
    g = fight('boss_rat_king', 26, { heroes: ['test_mage', 'test_cleric'] });
    killAll('rat_lawyer');
    king = units('rat_king')[0];
    const m2 = hero('test_mage'), c2 = hero('test_cleric');
    put(king, 8, 4); put(m2, 3, 6); put(c2, 8, 5);
    king.mov = 0;
    king.data.step = 1;
    DD.AI.act(king);
    t.ok(pendingOf(king).length === 1, 'a wind-up is pending (' + pendingOf(king).map(function (i) { return i.skillId; }) + ')');
    DD.Act.addStatus(king, 'stun', { turns: 1 }, c2);
    DD.Act.removeStatus(king, 'stun', { silent: true });
    t.ok(has(king, 'rat_recess'), 'recess pending');
    king.data.step = 1;
    DD.AI.act(king);
    const hp0 = king.hp;
    t.ok(interactAt(c2, valve('A').x, valve('A').y, { x: 8, y: 5 }), 'open sluice A on him during the recess');
    t.ok(hp0 - king.hp === RK().FLUSH_DMG && has(king, 'stun'), 'the flush still lands: ' + RK().FLUSH_DMG + ' and Stunned');
    t.eq(pendingOf(king).length, 0, 'and his wind-ups are gone');
    void g;
  });

  T.suite('bosses_act1: rat king splits into lawyers (phases, caps, class action)', function (t) {
    if (!have()) { t.skip('boss content not loaded'); return; }
    let g = fight('boss_rat_king', 30);
    let king = units('rat_king')[0];
    const k = hero('test_knight');
    put(king, 6, 5);
    t.eq(RK().phaseOf(king), 1, 'phase 1');
    const toHp = function (u, frac) { DD.Combat._action(function () { DD.Act.damage(k, u, Math.max(1, u.hp - Math.floor(u.maxHp * frac)), { cause: 'other' }); }); };
    toHp(king, 0.6);
    t.eq(RK().phaseOf(king), 2, 'below 66%: phase 2 (Cross-Examination)');
    t.eq(units('rat_lawyer').length, RK().LAWYER_CAP, 'lawyers split off (capped at ' + RK().LAWYER_CAP + ')');
    t.eq((DD.Act.getStatus(king, 'rat_session') || {}).stacks, 2, 'court status shows phase 2');
    t.ok(g.log.some(function (l) { return /splits/.test(l.text); }), 'the split is announced');
    t.ok(/Tangled Tails, Sewer Surge, Tangled Tails, Gnaw/.test(passiveText(king)), 'the passive shows the phase 2 docket');
    toHp(king, 0.3);
    t.eq(RK().phaseOf(king), 3, 'below 33%: phase 3 (Closing Arguments)');
    t.eq(units('rat_lawyer').length, RK().LAWYER_CAP, 'never more than ' + RK().LAWYER_CAP + ' lawyers on retainer');
    // one huge hit: both splits at once, still capped
    g = fight('boss_rat_king', 31);
    king = units('rat_king')[0];
    killAll('rat_lawyer');
    DD.Combat._action(function () { DD.Act.damage(hero('test_knight'), king, Math.ceil(king.maxHp * 0.7), { cause: 'other' }); });
    t.eq(RK().phaseOf(king), 3, 'one huge hit: straight to phase 3');
    t.eq(units('rat_lawyer').length, RK().LAWYER_CAP, 'capped at ' + RK().LAWYER_CAP + ' even after two splits at once');
    // phase 2: Gnaw takes more tiles; phase 3: both channels flood; Class Action
    const c = hero('test_cleric'), m = hero('test_mage');
    units('rat_lawyer').forEach(function (u, i) { put(u, 2 + i * 2, 11); });
    put(c, 3, 3); put(m, 8, 8);
    king.mov = 0;
    king.data.step = 1;
    DD.AI.act(king);
    t.eq(pendingOf(king, 'rat_surge').length, 2, 'Closing Arguments: both channels surge at once');
    king.intents = [];
    king.data.step = 2;
    DD.AI.act(king);
    t.eq(king.data.lastAct, 'class', 'phase 3 step 3: Class Action');
    const CA = L1('rat_class');
    t.eq(units('rat_plaintiff').length, CA.n, CA.n + ' Plaintiff Rats crawl out');
    now(king, 'rat_class', king); now(king, 'rat_class', king);
    t.eq(units('rat_plaintiff').length, CA.cap, 'capped at ' + CA.cap);
    t.ok(units('rat_plaintiff').every(function (u) { return u.x <= 3; }), 'next to the drains');
    g = fight('boss_rat_king', 32);
    king = units('rat_king')[0];
    killAll('rat_lawyer');
    park(DD.Combat.heroes(), R_FAR);
    king.mov = 0;
    put(king, 6, 5);
    toHp(king, 0.6);
    killAll('rat_lawyer');
    put(hero('test_mage'), 3, 6); put(hero('test_cleric'), 9, 6); put(hero('test_rogue'), 2, 5);
    king.data.step = 3;
    DD.AI.act(king);
    t.eq((pendingOf(king, 'rat_gnaw')[0] || { tiles: [] }).tiles.length, L1('rat_gnaw').n2, 'Cross-Examination: Gnaw takes ' + L1('rat_gnaw').n2 + ' tiles');
  });

  T.suite('bosses_act1: rat king sluice puzzle (flush the King) and its AutoPlay hints', function (t) {
    if (!have()) { t.skip('boss content not loaded'); return; }
    const s = fight('boss_rat_king', 40);
    const king = units('rat_king')[0];
    const lw = units('rat_lawyer')[0];
    units('rat_lawyer').slice(1).forEach(function (u) { DD.Act.kill(u, null, { force: true }); });
    const k = hero('test_knight'), c = hero('test_cleric'), m = hero('test_mage'), r = hero('test_rogue');
    const vA = valve('A'), vB = valve('B');
    const hint = function (v, u) { return DD.getObject('rat_valve').autoplay(u, v.obj, tile(v.x, v.y), s); };
    king.mov = 0;
    put(king, 6, 3); put(k, 6, 2); put(lw, 3, 4); put(c, 8, 5); put(m, 6, 10); put(r, 10, 10);
    const bash = slotOf(k, 'test_shield_bash');
    if (bash) { DD.Combat.giveTurnTo(k); DD.Combat.useSkill(k, bash, 6, 3); t.ok(king.x === 6 && king.y === 3, 'a shield bash does not budge the Rat King'); }
    put(k, 1, 1);
    king.data.step = 1;
    put(c, 4, 5);
    DD.AI.act(king);                             // a Gnaw wind-up (the cleric next to rot)
    put(king, 6, 3); put(lw, 3, 4); put(c, 8, 5);
    t.ok(pendingOf(king).length > 0, 'the King has a wind-up pending');
    t.eq(hint(vA, c), 55 + 18, 'valve A hint: King + lawyer in the channel = 73');
    t.eq(hint(vB, m), 0, 'valve B: nobody in channel B');
    DD.Combat.giveTurnTo(c);
    const ia = DD.Combat.interactions(c).filter(function (o) { return o.x === vA.x && o.y === vA.y; })[0];
    t.ok(ia && ia.label === 'Crank Sluice' && ia.ap === 1, 'adjacent hero can Crank Sluice (1 AP)');
    t.ok(!/Drink|Open/.test(ia ? ia.label : 'Open'), 'the valve label stays out of the AutoPlay idle "Open/Drink" fallback');
    const hp0 = king.hp, hype0 = s.hype;
    t.ok(DD.Combat.interact(c, vA.x, vA.y), 'open sluice A');
    t.eq(hp0 - king.hp, RK().FLUSH_DMG, 'the King is flushed: ' + RK().FLUSH_DMG + ' damage');
    t.ok(has(king, 'stun') && (DD.Act.getStatus(king, 'stun') || {}).turns === 2 && has(king, 'wet'), 'Stunned for his next 2 turns, and Wet');
    t.eq(pendingOf(king).length, 0, 'his wind-up is cancelled');
    t.ok(!inList(king, RK().chanTiles('A')) && !DD.Grid.isPit(king.x, king.y), 'he climbs out onto a walkway');
    t.ok(lw.dead, 'the lawyer in the channel drowned');
    t.ok(s.hype - hype0 >= 20, 'drowning a lawyer is an environmental kill (+20 Hype)');
    t.eq(s.data.rat.flushes, 1, 'flush counted');
    t.eq(vA.obj.data.cd, RK().VALVE_CD, 'valve A needs ' + RK().VALVE_CD + ' rounds');
    t.ok(/building pressure/.test(vA.obj.label), 'label says so');
    t.ok(!DD.Combat.interactions(c).some(function (o) { return o.x === vA.x && o.y === vA.y && o.kind === 'object'; }), 'no second flood while repressurizing');
    t.eq(hint(vA, c), 0, 'recharging valve hints 0');
    let left = vA.obj.data.cd;
    while (left > 0 && !s.result) {
      DD.Combat.endRound();
      t.eq(vA.obj.data.cd, left - 1, 'pressure builds (' + (left - 1) + ')');
      left = vA.obj.data.cd;
    }
    t.ok(/ready/.test(vA.obj.label), 'ready again');
    // heroes in the channel get washed too (and the hint warns)
    put(king, 1, 1);
    king.intents = [];
    put(r, 9, 4); put(c, 8, 5);
    t.ok(hint(vA, c) < 0, 'a hero in the channel: negative hint (' + hint(vA, c) + ')');
    const hr = r.hp;
    t.ok(interactAt(c, vA.x, vA.y, { x: 8, y: 5 }), 'flood channel A on a hero');
    t.eq(hr - r.hp, Math.ceil(r.maxHp * 0.25), 'a hero washed into the drain loses 25% max HP');
    t.ok(!inList(r, RK().chanTiles('A')), 'and climbs out dry');
    // flyers float over a flood; downed heroes stay put
    put(r, 8, 8);
    r.flags.flying = true;
    const hr2 = r.hp;
    put(m, 9, 7);
    DD.Combat._action(function () { m.hp = 0; m.downed = true; });
    const mx = m.x;
    DD.Combat._action(function () { RK().flood('B', null, {}); });
    t.ok(r.x === 8 && r.hp === hr2, 'a flyer is not washed away');
    t.ok(m.x === mx, 'a downed hero is not washed away');
    r.flags.flying = false;
    // with his turns played for real: a flush costs him both of them
    stunCostsBothTurns(t, 'the flush', 'boss_rat_king', 'rat_king', 'rat_lawyer', 42, function (b) {
      put(b, 8, 4); put(hero('test_cleric'), 3, 5);
      interactAt(hero('test_mage'), 7, 5, { x: 8, y: 5 });
    });
  });

  T.suite('bosses_act1: rat king swelling ranks, sleepless swarm, honest wind-up numbers', function (t) {
    if (!have()) { t.skip('boss content not loaded'); return; }
    const g = kingAlone(50, { still: true });
    const king = g.king;
    put(king, 6, 1);
    const SW = DD.getStatus('rat_swarm'), per = RK().cfg.swarmDmg;
    const ROUNDS = 8;               // well past the v1 cap of 6: the soft timer has no cap now
    t.ok(!has(king, 'rat_swarm'), 'round 1: just the King');
    for (let i = 1; i <= ROUNDS; i++) {
      DD.Combat.endRound();
      t.eq((DD.Act.getStatus(king, 'rat_swarm') || {}).stacks, i, 'round ' + (i + 1) + ': ' + i + ' stack(s) of Swelling Ranks');
    }
    t.ok(g.s.log.some(function (l) { return new RegExp('More sewer rats pile onto the King: Swelling Ranks 1 \\(\\+' + per + ' damage\\)').test(l.text); }), 'the swarm is announced with its bonus');
    t.ok(!g.s.log.some(function (l) { return / is (Swelling Ranks|Court in Session|Recess)/.test(l.text); }), 'no "is Swelling Ranks" log lines');
    t.ok(new RegExp('\\+' + per * ROUNDS + ' damage').test(SW.desc(DD.Act.getStatus(king, 'rat_swarm'))) && /no cap/.test(SW.desc(DD.Act.getStatus(king, 'rat_swarm'))), 'the status shows the bonus (no cap)');
    const bonus = per * ROUNDS;
    const m = hero('test_mage');
    put(m, 6, 5);
    m.hp = m.maxHp;
    let h0 = m.hp;
    now(king, 'rat_gavel', m);
    t.eq(h0 - m.hp, L1('rat_gavel').dmg + bonus, 'a max-swarm gavel hits for ' + (L1('rat_gavel').dmg + bonus));
    // the swarm does not grow his wind-ups (it grows at the round start, after the heroes' last look)
    put(m, 3, 6);
    king.data.step = 1;
    DD.AI.act(king);
    const gn = pendingOf(king, 'rat_gnaw')[0];
    t.ok(!!gn, 'Gnaw wound up');
    t.eq(gn ? DD.AI.describe(king, gn).dmg : -1, L1('rat_gnaw').dmg, 'with Swelling Ranks ' + ROUNDS + ' the Gnaw still shows its plain ' + L1('rat_gnaw').dmg);
    if (!gn) return;
    put(m, gn.tiles[0].x, gn.tiles[0].y);
    m.hp = m.maxHp;
    h0 = m.hp;
    DD.Combat.giveTurnTo(king);     // both of his turns (wound up on a hero turn)
    t.eq(h0 - m.hp, L1('rat_gnaw').dmg + Math.ceil(m.maxHp * 0.25), 'and it lands for exactly that (+ the fall)');
    // a flush washes them all away
    king.intents = [];
    put(king, 5, 4);
    const c = hero('test_cleric');
    t.ok(interactAt(c, valve('A').x, valve('A').y, { x: 8, y: 5 }), 'open sluice A on him');
    t.ok(!has(king, 'rat_swarm'), 'the flush washes the extra rats away');
    // a swarm never sleeps or freezes
    DD.Act.removeStatus(king, 'stun', { silent: true });
    DD.Act.removeStatus(king, 'rat_recess', { silent: true });
    DD.Act.addStatus(king, 'sleep', { turns: 1 }, hero('test_knight'));
    t.ok(!has(king, 'sleep'), 'forty rats never all fall asleep at once (immune to Sleep)');
    DD.Act.addStatus(king, 'wet', { turns: 2 }, null);
    DD.Act.addStatus(king, 'frozen', { turns: 1 }, null);
    t.ok(!has(king, 'frozen'), 'nor freeze');
  });

  T.suite('bosses_act1: the flush is never blocked, the killing blow never splits', function (t) {
    if (!have()) { t.skip('boss content not loaded'); return; }
    // a downed hero lying in the channel between the King and the drain
    let s = fight('boss_rat_king', 60);
    let king = units('rat_king')[0];
    const lw = units('rat_lawyer')[0];
    units('rat_lawyer').slice(1).forEach(function (u) { DD.Act.kill(u, null, { force: true }); });
    const m = hero('test_mage'), c = hero('test_cleric');
    put(king, 6, 3); put(m, 3, 3); put(lw, 5, 3); put(c, 8, 5);
    DD.Combat._action(function () { m.hp = 0; m.downed = true; });
    let h0 = king.hp;
    t.ok(interactAt(c, valve('A').x, valve('A').y, { x: 8, y: 5 }), 'open sluice A');
    t.eq(h0 - king.hp, RK().FLUSH_DMG, 'the water sweeps the King past a downed hero: FLUSHED for exactly ' + RK().FLUSH_DMG);
    t.ok(has(king, 'stun') && s.data.rat.flushes === 1, 'stunned, flush counted');
    t.ok(!inList(king, RK().chanTiles('A')), 'he climbs out on a walkway');
    t.ok(lw.dead && s.data.rat.drowned === 1, 'his lawyer, stuck behind the same body, drowns too');
    t.ok(m.x === 3 && m.y === 3 && m.downed, 'the downed hero stays where it fell');
    // a flyer hovering over the channel
    s = fight('boss_rat_king', 61);
    king = units('rat_king')[0];
    killAll('rat_lawyer');
    const r = hero('test_rogue'), c2 = hero('test_cleric');
    put(king, 6, 4); put(r, 2, 4); put(c2, 8, 5);
    r.flags.flying = true;
    h0 = king.hp;
    t.ok(interactAt(c2, valve('A').x, valve('A').y, { x: 8, y: 5 }), 'open sluice A');
    t.ok(h0 - king.hp === RK().FLUSH_DMG && has(king, 'stun'), 'a flyer in the way does not save him either');
    t.ok(r.x === 2 && r.y === 4, 'and the flyer stays dry');
    r.flags.flying = false;
    // the killing blow is not a motion to split
    s = fight('boss_rat_king', 62);
    king = units('rat_king')[0];
    killAll('rat_lawyer');
    const mm = hero('test_mage');
    put(king, 6, 5); put(mm, 6, 8);
    king.hp = 3;
    const fb = slotOf(mm, 'test_fireball');
    if (fb) {
      DD.Combat.giveTurnTo(mm);
      const prev = DD.Combat.preview(mm, fb, 6, 5);
      t.ok(prev.perUnit[king.id] && prev.perUnit[king.id].lethal, 'the preview shows the kill');
      t.eq((prev.spawned || []).length, 0, 'and no lawyers splitting off');
    }
    const n0 = s.units.length;
    DD.Combat._action(function () { DD.Act.damage(mm, king, 99, { cause: 'other' }); });
    t.ok(king.dead, 'a killing blow kills him');
    t.eq(s.units.length, n0, 'no lawyers split off on the way down');
    t.ok(!s.log.some(function (l) { return /splits/.test(l.text); }), 'no split announced');
    t.eq(s.result, 'victory', 'killing the King wins the fight');
  });

  T.suite('bosses_act1: rat king previews and edge cases', function (t) {
    if (!have()) { t.skip('boss content not loaded'); return; }
    const fp = T.contentHelpers && T.contentHelpers.fingerprint;
    const s = fight('boss_rat_king', 70);
    const king = units('rat_king')[0];
    const m = hero('test_mage'), k = hero('test_knight');
    put(king, 6, 5); put(m, 6, 8); put(k, 1, 10);
    const fb = slotOf(m, 'test_fireball');
    if (fb) {
      DD.Combat.giveTurnTo(m);
      king.hp = Math.floor(king.maxHp * 0.66) + 2;       // a hit that crosses the first split threshold
      const f0 = fp ? fp(s) : '';
      const prev = DD.Combat.preview(m, fb, 6, 5);
      if (fp) t.eq(fp(s), f0, 'preview with a split leaves the real fight untouched');
      const hp0 = king.hp, n0 = units('rat_lawyer').length;
      DD.Combat.useSkill(m, fb, 6, 5);
      t.eq(hp0 - king.hp, (prev.perUnit[king.id] || {}).dmg, 'preview damage == real damage');
      t.eq(units('rat_lawyer').length - n0, (prev.spawned || []).filter(function (u) { return u.defId === 'rat_lawyer'; }).length, 'the preview predicts the lawyers splitting off');
    }
    DD.Combat.slotsOf(king).forEach(function (sl) {
      const r = t.tryRun('preview ' + sl.id, function () { return DD.Targeting.preview(king, sl, { x: m.x, y: m.y }); });
      t.ok(r && typeof r === 'object', 'Targeting.preview of ' + sl.id);
    });
    // a flood on a map without a drain: units bump into the edge, nothing breaks
    DD.Combat.sandbox({ w: 6, h: 3, seed: 2, heroes: [{ id: 'test_mage', x: 3, y: 1, level: 2 }], enemies: [{ id: 'rat_king', x: 5, y: 2 }], enemyAi: false,
      terrain: function (tl) { if (tl.y === 1) { tl.t = 'water'; tl.tag = 'rat_chanA'; } } });
    const mm = hero('test_mage');
    const r1 = t.tryRun('flood without a drain', function () { return DD.Combat._action(function () { return RK().flood('A', null, {}); }); });
    t.ok(r1 && mm.x === 0 && !mm.dead, 'washed to the map edge (' + (mm && mm.x) + ')');
    const k3 = units('rat_king')[0];
    const r2 = t.tryRun('gnaw on plain floor', function () {
      return DD.Combat._action(function () { return DD.Combat.resolveSkill(k3, DD.getSkill('rat_gnaw'), { x: 0, y: 0 }, { extra: { tiles: [{ x: 0, y: 0 }] } }); });
    });
    t.ok(!!r2 && !DD.Grid.isPit(0, 0), 'gnaw only collapses rotten floor');
    t.tryRun('tails at nobody', function () { now(k3, 'rat_tails', { x: 0, y: 0 }); });
    // boxed in (his corner, the barrel and a downed hero: bodies can't be walked through): the swarm scurries out
    // instead of stalling the fight (a campaign sim once hit the 30-round cap that way)
    const gb = kingAlone(72);
    const kb = gb.king, dn = hero('test_knight');
    put(kb, 1, 1); put(dn, 1, 2);
    DD.Combat._action(function () { dn.hp = 0; dn.downed = true; });
    t.eq(DD.Grid.reachable(kb, DD.Combat.effectiveMov(kb), { aoo: true }).size, 0, 'boxed in: no tile to walk to');
    DD.AI.act(kb);
    t.ok(!(kb.x === 1 && kb.y === 1) && DD.Grid.dist(kb, { x: 1, y: 1 }) <= DD.Combat.effectiveMov(kb) + 1, 'he scurries out, about a move away (' + key(kb) + ')');
    t.ok(gb.s.log.some(function (l) { return /scatters into forty rats/.test(l.text); }), 'and the log says how');
    const gm = kingAlone(73, { still: true });
    put(gm.king, 1, 1); put(hero('test_knight'), 1, 2);
    DD.Combat._action(function () { const kn = hero('test_knight'); kn.hp = 0; kn.downed = true; });
    DD.AI.act(gm.king);
    t.ok(gm.king.x === 1 && gm.king.y === 1, 'a King who can\'t move at all stays put');
    // Scurry is only for a King with nothing to do: surrounded by heroes he piles on them; boxed in with a hero in
    // reach of his tails he stays and lashes
    const gs = kingAlone(74);
    const hs4 = DD.Combat.heroes();
    sturdy(hs4);
    put(gs.king, 4, 10);
    put(hs4[0], 3, 10); put(hs4[1], 5, 10); put(hs4[2], 4, 9); put(hs4[3], 4, 11);
    t.eq(DD.Grid.reachable(gs.king, DD.Combat.effectiveMov(gs.king), { aoo: true }).size, 0, 'four heroes around him: no tile to walk to');
    DD.AI.act(gs.king);
    t.ok(gs.king.x === 4 && gs.king.y === 10 && gs.king.data.lastAct === 'pile', 'surrounded, he piles on them instead of scurrying (' + key(gs.king) + ', ' + gs.king.data.lastAct + ')');
    const gr = kingAlone(75);
    put(gr.king, 1, 1); put(hero('test_knight'), 1, 2);
    DD.Combat._action(function () { const kn = hero('test_knight'); kn.hp = 0; kn.downed = true; });
    put(hero('test_mage'), 4, 2);
    gr.king.data.step = 0;
    DD.AI.act(gr.king);
    t.ok(gr.king.x === 1 && gr.king.y === 1 && gr.king.data.lastAct === 'tails', 'boxed in with a hero in reach: no scurry, he lashes them (' + key(gr.king) + ', ' + gr.king.data.lastAct + ')');
    // he never ends a walk on a tile of his own pending Gnaw (it would drop him in the pit: a free 30 for the party)
    const gw = kingAlone(76);
    const rc = hero('test_cleric');
    sturdy([rc]);
    put(gw.king, 7, 1); put(rc, 9, 6);
    DD.Act.addStatus(rc, 'root', { turns: 1 }, null);
    gw.king.data.step = 0;
    DD.AI.act(gw.king);
    const spot = { x: gw.king.x, y: gw.king.y };
    const gw2 = kingAlone(76);
    const rc2 = hero('test_cleric');
    sturdy([rc2]);
    put(gw2.king, 7, 1); put(rc2, 9, 6);
    DD.Act.addStatus(rc2, 'root', { turns: 1 }, null);
    gw2.king.data.step = 0;
    DD.AI.windUp(gw2.king, 'rat_gnaw', spot, { tiles: [spot], turns: 2, noCooldown: true });
    DD.AI.act(gw2.king);
    t.ok(!(spot.x === 7 && spot.y === 1) && !(gw2.king.x === spot.x && gw2.king.y === spot.y), 'he keeps off his own marked Gnaw tile (' + key(spot) + ' → ' + key(gw2.king) + ')');
    // a whole round with every control status on him runs clean
    ['charmed', 'taunt', 'silenced', 'dazzled', 'confused', 'root', 'slow', 'haste', 'sheep'].forEach(function (id) {
      const s2 = fight('boss_rat_king', 71, { ai: true });
      const b = units('rat_king')[0];
      if (!DD.getStatus(id)) return;
      DD.Act.addStatus(b, id, { turns: 2 }, hero('test_knight'));
      t.tryRun('rat king ' + id, function () { for (let i = 0; i < 2 && !s2.result; i++) DD.Combat.endRound(); });
      t.ok(T.contentHelpers.sanity(t, 'rat king ' + id), 'two rounds with the King ' + id);
    });
  });

  // =====================================================================================================================
  // Both bosses: honesty under AutoPlay, balance sims
  // =====================================================================================================================
  T.suite('bosses_act1: wind-up numbers and areas tell the truth (AutoPlay fights)', function (t) {
    if (!have()) { t.skip('boss content not loaded'); return; }
    const W = T.contentHelpers && T.contentHelpers.watchAreas;
    ['boss_grimble', 'boss_rat_king'].forEach(function (enc) {
      let checked = 0, windups = 0;
      for (let i = 0; i < 3; i++) {
        const nums = watchNumbers(function () {
          const w = W ? W(function (w) {
            realFight(enc, 80 + i, partyAt(FIXTURE_LEVEL, PARTY, DD.RNG('ba1:honest:' + i)));
            w.arm();
            DD.AutoPlay.runBattle(30);
          }) : { violations: [], windups: 0 };
          windups += w.windups;
          w.violations.filter(function (v, j, a) { return a.indexOf(v) === j; }).forEach(function (v) { t.fail(enc + ': ' + v); });
        });
        checked += nums.checked;
        nums.bad.forEach(function (b) { t.fail(enc + ' fight ' + i + ': ' + b); });
      }
      t.ok(windups > 0, enc + ': wind-ups landed in the AutoPlay fights (' + windups + ')');
      t.log(enc + ': ' + checked + ' wind-up hits checked against their shown numbers');
    });
    // scripted: heroes left standing in every wind-up, Weak toggled between the announcement and the landing (the Rat
    // King on a wind-up-only docket, held still, heroes put in the water and next to the rot when nothing is pending)
    const P = RK().PATTERNS, saved = P[1];
    P[1] = ['surge', 'gnaw'];
    try {
      ['boss_grimble', 'boss_rat_king'].forEach(function (enc) {
        const bossId = enc === 'boss_grimble' ? 'grimble' : 'rat_king';
        fight(enc, 85, { ai: true, gold: 200 });
        killAll(bossId === 'grimble' ? 'grim_intern' : 'rat_lawyer');
        const boss = units(bossId)[0];
        if (bossId === 'rat_king') { boss.mov = 0; put(boss, 11, 1); }
        sturdy(DD.Combat.heroes());
        let k = 0;
        const placeIn = function () {
          const heroes = DD.Combat.heroes().filter(function (h) { return !h.dead; });
          refresh(heroes);
          if (bossId === 'rat_king' && !(boss.intents || []).length) { put(heroes[0], 4, 8); put(heroes[1], 9, 4); }
          let i = 0;
          (boss.intents || []).forEach(function (it) {
            const free = DD.AI.intentTiles(boss, it).filter(function (p) { return DD.Grid.isFree(p.x, p.y) && DD.Grid.isWalkable(p.x, p.y); });
            const h = heroes[i++ % heroes.length];
            if (free.length && h) put(h, free[0].x, free[0].y);
          });
          if (k++ % 2) DD.Act.addStatus(boss, 'weak', { turns: 1 }, heroes[0]); else DD.Act.removeStatus(boss, 'weak', { silent: true });
        };
        const off = DD.Events.on('turn:start', function (e) { if (DD.Combat.isPlayerControlled(e.unit) && e.unit === DD.Combat.heroes()[0]) placeIn(); });
        let res;
        try { res = watchNumbers(function () { for (let r = 0; r < 6 && !DD.Combat.state.result; r++) DD.Combat.endRound(); }); } finally { off(); }
        t.ok(res.checked >= 2, enc + ': scripted wind-up hits checked (' + res.checked + ')');
        res.bad.forEach(function (b) { t.fail(enc + ' scripted: ' + b); });
      });
    } finally { P[1] = saved; }
  });


  /**
   * Balance exploration only: tune=grim_levy.levels.0.dmg:12,grimble.hp:180 (skill / enemy / object / status def paths,
   * or the bosses' knobs: grcfg.<key>, rkcfg.<key>); restored after.
   */
  function applyTune(t) {
    const undo = [];
    String(t.param('tune', '')).split(',').filter(Boolean).forEach(function (kv) {
      const i = kv.lastIndexOf(':');
      const parts = kv.slice(0, i).split('.'), val = kv.slice(i + 1);
      const cfgs = { rkcfg: RK() && RK().cfg, grcfg: GB() && GB().cfg };
      let o = cfgs[parts[0]] || DD.getSkill(parts[0]) || DD.getEnemy(parts[0]) || DD.getObject(parts[0]) || DD.getStatus(parts[0]);
      for (let k = 1; o && k < parts.length - 1; k++) o = o[parts[k]];
      if (!o) return;
      const k2 = parts[parts.length - 1];
      undo.push([o, k2, o[k2]]);
      o[k2] = val === 'true' ? true : val === 'false' ? false : isNaN(+val) ? val : +val;
    });
    if (undo.length) t.log('tune: ' + t.param('tune', ''));
    return function () { undo.reverse().forEach(function (u) { u[0][u[1]] = u[2]; }); };
  }

  /**
   * AutoPlay sims: real heroes (4 random of the loaded ones, v2 loadout at the act 1 level, Blessings rolled) when the
   * hero files are loaded, else the fixture party at FIXTURE_LEVEL. Returns { wins, n, rounds, per, real }.
   */
  function runSims(t, encId, label, extra) {
    const restore = applyTune(t);
    try {
      const n = Math.max(1, +(t.param('sims', 10)) || 10);
      const pool = realHeroIds();
      const real = pool.length >= 4 && t.param('fixture', '0') !== '1';
      const level = +(t.param('level', real ? BAND : FIXTURE_LEVEL)) || BAND;
      let wins = 0, rounds = 0, timeouts = 0;
      const per = [];
      for (let i = 0; i < n; i++) {
        const seed = DD.util.hash(t.seed + ':' + encId + ':' + i) % 100000;
        const rng = DD.RNG('ba1:sim:' + seed);
        const want = String(t.param('party', '')).split(',').filter(function (id) { return id && DD.getHero(id); });
        const ids = want.length ? want : real ? rng.shuffle(pool.slice()).slice(0, 4) : rng.shuffle(PARTY.slice());
        const s = realFight(encId, seed, partyAt(level, ids, rng.fork('party')));
        const res = DD.AutoPlay.runBattle(30);
        if (String(t.param('log', '')) === String(i)) s.log.slice(-+(t.param('tail', 80))).forEach(function (l) { t.log('    [' + l.round + '] ' + l.text); });
        if (res.result === 'victory') wins++;
        if (res.timeout) timeouts++;
        rounds += res.rounds;
        const info = extra(s);
        const hs = s.units.filter(function (u) { return u.kind === 'hero'; });
        info.result = res.result === 'victory' ? 'W' : 'L'; info.rounds = res.rounds; info.downs = s.stats.downs || 0;
        info.hpLost = Math.round(100 * hs.reduce(function (a, u) { return a + u.maxHp - u.hp; }, 0) / hs.reduce(function (a, u) { return a + u.maxHp; }, 0));
        info.party = ids.join(',');
        per.push(info);
      }
      const won = per.filter(function (p) { return p.result === 'W'; });
      t.log(label + (real ? ' (real heroes, level ' : ' (fixture party, level ') + level + '): won ' + wins + '/' + n + ' (' + Math.round(100 * wins / n) + '%), avg rounds ' +
        (rounds / n).toFixed(1) + ', downs ' + (per.reduce(function (a, p) { return a + p.downs; }, 0) / n).toFixed(1) + ', party HP lost in wins ' +
        Math.round(won.reduce(function (a, p) { return a + p.hpLost; }, 0) / Math.max(1, won.length)) + '%, timeouts ' + timeouts);
      if (t.param('per', '') === '1') per.forEach(function (p, i) { t.log('  #' + i + ' ' + JSON.stringify(p)); });
      t.eq(timeouts, 0, label + ': AutoPlay battles never time out');
      return { wins: wins, n: n, per: per, rounds: rounds / n, real: real, won: won };
    } finally { restore(); }
  }
  /** The guard: winnable, hard (the party pays for it), fights of a sane length. Target: docs/notes/bosses-act1.md. */
  function hardButFair(t, r) {
    t.ok(r.wins >= 1, 'the fight is winnable: ' + r.wins + '/' + r.n);
    const hurt = r.won.length ? r.won.reduce(function (a, p) { return a + p.hpLost; }, 0) / r.won.length : 100;
    t.ok(r.wins < r.n || hurt >= 30, 'hard: lost now and then, or the winners lose 30%+ of their HP (' + Math.round(hurt) + '%)');
    t.ok(r.per.filter(function (p) { return p.downs > 0; }).length >= Math.ceil(r.n / 3), 'someone goes down in a third of the fights or more');
    t.ok(r.rounds >= 4 && r.rounds <= 14, 'fights last ' + r.rounds.toFixed(1) + ' rounds on average (4-14)');
  }

  T.suite('bosses_act1: grimble autoplay sims', function (t) {
    if (!have()) { t.skip('boss content not loaded'); return; }
    const r = runSims(t, 'boss_grimble', 'Grimble', function (s) {
      const g = GB().data(s);
      const b = s.units.filter(function (u) { return u.defId === 'grimble'; })[0];
      return { pulls: g.pulls, drops: g.drops, hits: g.hits, refiles: g.refiles, bossHp: b ? b.hp : null, phase: b ? b.data.phase : null };
    });
    const pulled = r.per.filter(function (p) { return p.pulls > 0; }).length;
    t.ok(pulled >= Math.ceil(r.n / 2), 'AutoPlay engages the loophole puzzle in most fights (' + pulled + '/' + r.n + ')');
    t.ok(r.per.some(function (p) { return p.hits > 0; }), 'the vault door lands on Grimble in at least one sim');
    t.ok(r.per.some(function (p) { return p.phase === 2; }), 'phase 2 is reached');
    hardButFair(t, r);
  });

  T.suite('bosses_act1: rat king autoplay sims', function (t) {
    if (!have()) { t.skip('boss content not loaded'); return; }
    const r = runSims(t, 'boss_rat_king', 'Rat King', function (s) {
      const d = (s.data && s.data.rat) || {};
      const k = s.units.filter(function (u) { return u.defId === 'rat_king'; })[0];
      return { sluices: d.sluices || 0, flushes: d.flushes || 0, drowned: d.drowned || 0, kingHp: k ? k.hp : null, splits: k ? k.data.splits : null };
    });
    const used = r.per.filter(function (p) { return p.sluices > 0; }).length;
    t.ok(used >= Math.ceil(r.n / 2), 'AutoPlay opens the sluices in most fights (' + used + '/' + r.n + ')');
    t.ok(r.per.some(function (p) { return p.flushes > 0; }), 'the King gets flushed in at least one sim');
    t.ok(r.per.some(function (p) { return p.splits >= 1; }), 'the King splits in at least one sim');
    hardButFair(t, r);
  });

  // ---- v2 user requests (Nov 3): flyers ignore the floor; heroes aim attacks at explosive barrels -------------------
  T.suite('bosses_act1: v2 requests (Nov 3) — flyers over the rot and the drop zone, the sewer barrels', function (t) {
    if (!have()) { t.skip('boss content not loaded'); return; }
    const n0 = DD.problems.length;
    // Gnaw: the walker on the rot takes the bite and falls in; the flyer on the rot takes the bite and hovers over the pit
    let g = kingAlone(12, { still: true });
    let king = g.king;
    const c = hero('test_cleric'), m = hero('test_mage');
    put(c, 4, 5); put(m, 10, 6);
    c.flags.flying = true;
    king.data.step = 1;
    DD.AI.act(king);
    const gn = pendingOf(king, 'rat_gnaw')[0];
    t.ok(gn && inList({ x: 10, y: 6 }, gn.tiles), 'Gnaw marks the walker\'s rotten tile');
    const flyerMarked = !!gn && inList({ x: 4, y: 5 }, gn.tiles);
    const GL = L1('rat_gnaw'), hc = c.hp, hm = m.hp;
    DD.Combat.giveTurnTo(king);
    t.eq(hm - m.hp, GL.dmg + Math.ceil(m.maxHp * 0.25), 'the walker: ' + GL.dmg + ' + a 25% max HP fall');
    if (flyerMarked) {
      t.eq(hc - c.hp, GL.dmg, 'the flyer: the bite (' + GL.dmg + '), no fall');
      t.ok(c.x === 4 && c.y === 5 && DD.Grid.isPit(4, 5), 'the flyer hovers over the new pit');
    } else t.eq(hc - c.hp, 0, 'the flyer\'s tile was not worth a Gnaw slot: unhurt');
    t.ok(/flyers just hover/.test(DD.getTerrain('rat_rot').desc), 'the rotten floor says flyers just hover');
    // the King prefers a walker's rotten tile to a flyer's (it never falls in)
    g = kingAlone(14, { still: true });
    king = g.king;
    const c2 = hero('test_cleric'), m2 = hero('test_mage');
    put(c2, 4, 5); put(m2, 10, 6);
    c2.flags.flying = true;
    king.data.step = 1;
    DD.AI.act(king);
    const gn2 = pendingOf(king, 'rat_gnaw')[0];
    t.ok(gn2 && gn2.tiles[0].x === 10 && gn2.tiles[0].y === 6, 'the first Gnaw tile is the walker\'s, not the flyer\'s');
    // Sewer Surge and the sluices say flyers stay dry (the flood skips them: covered above)
    t.ok(/flyers stay dry/.test(DD.getSkill('rat_surge').desc(L1('rat_surge'))) && /flyers stay dry/.test(DD.getObject('rat_valve').desc), 'Sewer Surge and the sluice say flyers stay dry');
    // Grimble's vault door falls from above: it flattens a flyer in the DROP ZONE too (not a floor effect)
    fight('boss_grimble', 31);
    const zone = GB().zoneTiles();
    const f = hero('test_rogue');
    const spot = zone.filter(function (p) { return !DD.Grid.unitAt(p.x, p.y); })[0];
    put(f, spot.x, spot.y);
    f.flags.flying = true; f.block = 0;
    const hf = f.hp;
    DD.Combat._action(function () { GB().dropVault(hero('test_mage')); });
    t.ok(hf - f.hp === Math.min(hf, GB().VAULT_DMG) && (has(f, 'stun') || f.downed), 'the vault door flattens a flyer in the zone as well (' + (hf - f.hp) + ')');
    // the sewer's explosive barrels are volatile: a hero aims an attack at one and the blast is the hero's
    fight('boss_rat_king', 15);
    killAll('rat_lawyer');
    const bt = DD.Grid.allTiles().filter(function (tl) { return tl.obj && tl.obj.id === 'barrel_explosive'; })[0];
    t.ok(!!bt && DD.Act.isVolatile(bt.obj), 'the arena has a volatile explosive barrel');
    if (bt) {
      const mg = hero('test_mage');
      const free = DD.Grid.emptyTilesNear(bt.x, bt.y, 3).filter(function (p) { return DD.Grid.dist(p, bt) >= 2 && !DD.Grid.isDrop(p.x, p.y); });
      let shot = null;
      for (let i = 0; i < free.length && !shot; i++) {
        put(mg, free[i].x, free[i].y);
        if (!DD.Combat.isTurnOf(mg)) DD.Combat.giveTurnTo(mg);
        mg.ap = Math.max(mg.ap, 3);
        shot = DD.Combat.slotsOf(mg).filter(function (sl) {
          return DD.Targeting.aimsAtObjects(mg, sl) && DD.Combat.canUse(mg, sl) === true &&
            DD.Targeting.validTargets(mg, sl).some(function (p) { return p.x === bt.x && p.y === bt.y; });
        })[0] || null;
      }
      t.ok(!!shot, 'the mage can aim an attack at it (' + (shot ? shot.id : 'none') + ')');
      if (shot) {
        DD.Combat.useSkill(mg, shot, bt.x, bt.y);
        t.ok(!DD.Grid.tile(bt.x, bt.y).obj, 'KABOOM: the barrel is gone');
      }
    }
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

  T.suite('bosses_act1: grimble\'s office furniture turns with the map (box props, yawAware)', function (t) {
    if (!DD.Iso || !DD.Iso.withYaw || !DD.getObject('grim_vault')) { t.skip('map views or boss content not loaded'); return; }
    const n0 = DD.problems.length;
    rotTurns(t, [['grim_loophole', {}], ['grim_loophole', { data: { on: true } }], ['grim_vault', {}], ['grim_vault', { data: { down: true } }],
      ['grim_desk', {}], ['grim_cabinet', { hp: 6, maxHp: 6 }], ['grim_cabinet', { hp: 2, maxHp: 6 }]]);
    // details stay on their own side: the vault's gold-stuffed opening faces south (toward the drop zone), and so do the
    // filing cabinet's brass handles; from the north (180°) both are out of sight
    const gold = function (r, g, b) { return r > 180 && g > 140 && b < 110; };
    const v0 = rotCount(rotPx('grim_vault', { data: { down: true } }, 0), gold).n, v180 = rotCount(rotPx('grim_vault', { data: { down: true } }, 180), gold).n;
    t.ok(v0 > 20 && v180 === 0, 'the vault\'s opening (gold inside) shows from the south, not from the north (' + v0 + ' / ' + v180 + ' gold px)');
    const c0 = rotCount(rotPx('grim_cabinet', { hp: 6, maxHp: 6 }, 0), gold).n, c180 = rotCount(rotPx('grim_cabinet', { hp: 6, maxHp: 6 }, 180), gold).n;
    t.ok(c0 > 4 && c180 === 0, 'the filing cabinet\'s handles are on its south side (' + c0 + ' / ' + c180 + ' brass px)');
    // the hoisted door hangs over the drop zone and turns with the board: left of the vault by default, right of it at 180°
    const rim = rotHex('#9aa2ab'), d0 = rotCount(rotPx('grim_vault', {}, 0), rim), d180 = rotCount(rotPx('grim_vault', {}, 180), rim);
    t.ok(d0.n > 0 && d180.n > 0 && d0.x < 80 && d180.x > 80, 'the hoisted door swings round with the board (x ' + d0.x.toFixed(1) + ' -> ' + d180.x.toFixed(1) + ')');
    t.eq(DD.problems.slice(n0).filter(function (p) { return /^Error in /.test(p); }).length, 0, 'no swallowed errors');
  }, { tags: ['render'] });
})();
