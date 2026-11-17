/* Dungeons and Degenerates — tests/content/boss_gardener.js
 * Suites "boss_gardener: …" for js/data/bosses/gardener.js (THE GARDENER, encounter boss_gardener, plan .tmp/v3/design.md
 * §3.1 / §5.3 / §6.2): the registry and the encounter, the conservatory, every skill against its desc (and the fight's
 * scaled numbers), Photosynthesis, Mow the Lawn (the lane, the landing, pushes, objects, the charge, the gnome jam),
 * Harvest Festival, Weed and Feed, the Weed-B-Gone drums and Corroded, its turn (the docket and the wind-up rotation),
 * Overgrowth Mode, Safe Mode, the Strangler Vines (E1: they act on its turn), Svammiel's Green Thumb (needs svammiel.js),
 * the voice, the sprites at five yaws, robustness and AutoPlay battles (real=1: random real parties at L5 against the
 * plan's band). Works isolated (&isolate=gardener): the fixture heroes stand in for the party.
 */
(function () {
  'use strict';
  const T = window.DD_TEST;
  const DD = window.DD;
  if (!T || !DD) return;
  const PARTY = ['test_knight', 'test_cleric', 'test_mage', 'test_rogue'];
  const ENC = 'boss_gardener', GARD = 'gard_gardener', VINE = 'gard_vine';
  const LV = 5;
  const N_ = { x: 0, y: -1 }, E_ = { x: 1, y: 0 }, S_ = { x: 0, y: 1 }, W_ = { x: -1, y: 0 };

  // ---- helpers --------------------------------------------------------------------------------------------------
  function B() { return DD.Gardener; }
  function S() { return DD.Combat.state; }
  function ready(t) {
    if (!DD.Gardener || !DD.getEncounter(ENC)) { t.skip('js/data/bosses/gardener.js not loaded'); return false; }
    if (!DD.getHero('test_knight')) { t.skip('needs tests/fixtures.js'); return false; }
    return true;
  }
  function act(fn) { return DD.Combat._action(fn); }
  /** A party at a level; a fractional level (5.5) splits it (half at 5, half at 6). */
  function partyAt(level, ids) {
    return (ids || PARTY).map(function (id, i) {
      const lv = Math.floor(level) + (level % 1 && i % 2 ? 1 : 0);
      const h = DD.getHero(id);
      const boons = Math.max(0, lv - 1), learn = Math.min(2, boons);
      const list = h.startingSkills.concat(h.skillPool.filter(function (s) { return h.startingSkills.indexOf(s) < 0; }).slice(0, learn));
      const skills = list.map(function (s) { return { id: s, level: 1 }; });
      for (let k = 0, up = boons - learn; up > 0 && k < 12; k++) {
        const sk = skills[k % skills.length];
        if (sk.level < Math.min(3, DD.getSkill(sk.id).levels.length)) { sk.level++; up--; }
      }
      return DD.Combat.makeRunHero({ id: id, level: lv, skills: skills });
    });
  }
  /** BAL (V3): the author bands measure the content numbers, so a real=1 author sim runs without DD.Balance's act-4
   *  campaign rows (the act row and this encounter's row, boss_dm.js's bare() pattern); balance=1 keeps them. */
  function bareRows(on, start) {
    const B = DD.Balance, k = DD.MAX_ACT;
    if (!on || !B || DD.params.balance === '1') return start();
    const a = B.act && B.act[k], row = B.encounters && B.encounters[ENC];
    if (a) B.act[k] = { hp: 1, dmg: 1 };
    if (row) delete B.encounters[ENC];
    try { return start(); } finally { if (a) B.act[k] = a; if (row) B.encounters[ENC] = row; }
  }
  /** The real encounter. Default: scripted (no deployment, heroes first, no cameo). opts.real: the real path. */
  function startFight(seed, opts) {
    opts = opts || {};
    const diff = opts.diff || 'normal';
    const setup = DD.Encounter.build(ENC, partyAt(opts.level || LV, opts.ids), { rng: DD.RNG('gard:' + seed), difficulty: diff, act: 4 });
    const o = { seed: seed, headless: true, difficulty: diff, kind: 'boss' };
    if (!opts.cameo) o.cameo = false;
    if (!opts.real) { o.sandbox = true; o.initiative = 'heroesFirst'; }
    return DD.Combat.start(setup, o);
  }
  /** A small scripted arena (12 × 12 lawn): heroes and the Gardener at fixed tiles. ai: true lets it act on its turns. */
  function arena(cfg, ai) {
    const c = Object.assign({ w: 12, h: 12, seed: 7, noPlan: !ai, cameo: false, floor: 'grass' }, cfg);
    if (!ai) c.enemyAi = false;
    return DD.Combat.sandbox(c);
  }
  function unit(defId) { return S().units.filter(function (u) { return u.defId === defId && !u.dead; })[0]; }
  function gard() { return unit(GARD); }
  function hero(defId) { return S().units.filter(function (u) { return u.defId === defId; })[0]; }
  function put(u, x, y) { return u.x === x && u.y === y ? true : DD.Act.teleport(u, x, y, { noEnter: true, fx: false }); }
  function has(u, id) { return DD.Act.hasStatus(u, id); }
  function key(p) { return p.x + ',' + p.y; }
  function dist(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }
  function bare(u) { u.armor = 0; u.block = 0; }
  function D(u) { return B().boss(u || gard()); }
  function objAt(x, y) { const tl = DD.Grid.tile(x, y); return tl && tl.obj ? tl.obj.id : null; }
  function vines() { return B().vinesOf(); }
  function spawnVine(x, y, owner) { let v = null; act(function () { v = DD.Act.spawn(VINE, x, y, { owner: owner || gard(), silent: true }); }); return v; }
  /** Damage records (target, base, dealt, element, cause, skill) while fn runs. */
  function hits(fn) {
    const out = [];
    DD.Act.addRule({ id: 'test_gard_hits', name: 'Test hits', silent: true, hooks: { onTakeDamage: function (d) {
      if (DD.Act.simulating) return;
      out.push({ target: d.target, base: d.base, dealt: d.dealt, element: d.element, cause: d.cause, skill: d.skill ? d.skill.id : null });
    } } });
    try { fn(); } finally { DD.Act.removeRule('test_gard_hits'); }
    out.of = function (u) { return out.filter(function (h) { return h.target === u; }); };
    return out;
  }
  function windup(u, id) { return (u.intents || []).filter(function (i) { return i.skillId === id; })[0] || null; }
  /** Its turn now (sandbox giveTurnTo: the start-of-turn ticks, its planner unless the AI is off). */
  function turn(u) { return act(function () { return DD.Combat.giveTurnTo(u); }); }
  /** The heroes pass: its natural turn of this round plays (wind-ups land at its start), back at the next hero turn. */
  function play() { return act(function () { return DD.Combat.endRound(); }); }
  function useNow(u, id, target, opts) { return act(function () { return DD.AI.useNow(u, id, target, opts); }); }
  function logHas(re) { return S().log.some(function (l) { return re.test(l.text); }); }
  function logCount(re) { return S().log.filter(function (l) { return re.test(l.text); }).length; }
  function aiOff() { S().aiOff = true; }
  function sentences(s) { return String(s).split(/(?<=[.!?…])\s+|\n/); }
  function desc(id, level, u) { return DD.skillDesc(DD.getSkill(id), level || 1, u || null); }

  // ---- registry and the encounter ------------------------------------------------------------------------------------
  T.suite('boss_gardener: registry — the Gardener, the Strangler Vine, skills, Corroded, objects and the encounter', function (t) {
    if (!ready(t)) return;
    const d = DD.getEnemy(GARD);
    t.eq(d.name, 'The Gardener', 'unit name');
    t.ok(d.act === 4 && d.tier === 'boss' && d.boss && d.boss.mini === true, 'an act-4 solo mini-boss (tier boss, boss.mini)');
    t.eq(d.pronoun, 'it', 'pronoun it (a machine: plan §0.2, lead patch P4)');
    t.eq(d.boss.title, 'Head Groundskeeper', 'boss.title (V §8.1)');
    t.ok(/Welcome to the conservatory\. Please keep off the grass\. You are now the grass\./.test(d.boss.intro), 'boss.intro (V §8.1)');
    t.eq(d.boss.sting, 'clockwork', 'sting clockwork (V §12)');
    t.ok(d.hp === B().N.hp && d.hp >= 300 && d.hp <= 340, 'HP ' + d.hp + ' (plan §3.0.5 solo band 300-340; DD.Gardener.N.hp)');
    t.ok(d.armor === 2 && d.mov === 4 && d.init === 1, 'armor 2, move 4, init +1');
    t.ok(d.flags.large === true && d.flags.hop === true && d.flags.immune.indexOf('sleep') >= 0 && !d.flags.flying, 'large, hop, immune to sleep, grounded');
    t.ok(d.resist.poison === 0 && d.resist.fire === 1.25 && d.resist.lightning === 1.25, 'poison ×0, fire ×1.25, lightning ×1.25');
    t.eq(JSON.stringify(d.skills), JSON.stringify(['gard_shears', 'gard_trimmer', 'gard_spitter', 'gard_plant']), 'its slots: the at-once kit (Shears first: its attack of opportunity)');
    t.ok(typeof d.ai === 'function' && !!d.passive && typeof d.passive.desc === 'function' && d.passive.name === 'Photosynthesis', 'a custom planner and a live Photosynthesis line');
    t.ok(/clockwork spider Svammiel ordered from a catalogue/.test(d.desc) && /It has decided that heroes are weeds\./.test(d.desc), 'codex desc (V §8.1)');
    t.ok(d.gold && d.xp > 0, 'loot fields');
    // the vine
    const v = DD.getEnemy(VINE);
    t.eq(v.name, 'Strangler Vine', 'vine name');
    t.ok(v.act === 4 && v.tier === 'minion' && v.hp === 20 && v.mov === 0 && v.armor === 0 && v.init === 0, 'a minion: 20 HP, move 0, armor 0, init 0');
    t.ok(v.actsWithOwner === true && v.flags.immovable === true && v.tags.indexOf('plant') >= 0 && v.resist.fire === 1.5, 'actsWithOwner (E1), immovable, a plant, fire ×1.5');
    t.eq(JSON.stringify(v.skills), JSON.stringify(['gard_tendril', 'gard_rustle']), 'Grabby Tendril first (its attack of opportunity), then Rustle Menacingly');
    t.eq(v.desc, 'Grows where it\'s spat and holds on like a clingy ex.', 'vine codex line (plan §5.3)');
    // skills
    Object.keys(B().SK).forEach(function (k) {
      const s = DD.getSkill(B().SK[k]);
      t.ok(!!s && s.owner === 'enemy', B().SK[k] + ': an enemy skill');
    });
    ['gard_mow', 'gard_harvest', 'gard_weedfeed'].forEach(function (id) { t.ok(DD.getSkill(id).windupOnly === true, id + ': wind-up only (not a slot)'); });
    t.ok(DD.getSkill('gard_trimmer').cooldown === 1 && DD.getSkill('gard_spitter').cooldown === 1 && DD.getSkill('gard_plant').cooldown === 2, 'Trimmer cd 1, Spitter cd 1, Planting Season cd 2');
    // the exact descs (plan §3.1; the numbers are the knobs, DD.Gardener.N)
    const N = B().N;
    t.ok(N.shears >= 10 && N.shears <= 14 && N.trimmer >= 9 && N.trimmer <= 14 && N.mow >= 20 && N.mow <= 26 && N.tendril >= 6 && N.tendril <= 7,
      'the hits sit in the act-4 band (plan §3.0.5: hits 10-14, big wind-up 20-26, minion hit 6-7)');
    t.eq(desc('gard_shears'), 'Deal ' + N.shears + ' damage to an adjacent foe.', 'Pruning Shears desc');
    t.eq(desc('gard_trimmer'), 'Sweep an adjacent foe and the 2 tiles beside it: ' + N.trimmer + ' damage to each foe there.', 'Hedge Trimmer desc');
    t.eq(desc('gard_spitter', 1), 'Deal ' + N.spit + ' damage to a foe 2-5 tiles away; a Strangler Vine sprouts next to it (max 4 vines).', 'Seed Spitter I desc');
    t.eq(desc('gard_spitter', 2), 'Deal ' + N.spit + ' damage to a foe 2-5 tiles away; two Strangler Vines sprout next to it (max 6 vines).', 'Seed Spitter II desc');
    t.eq(desc('gard_plant', 1), 'Plant a Pump-kaboom next to each of up to 2 heroes (max 4 on the field).', 'Planting Season I desc');
    t.eq(desc('gard_plant', 2), 'Plant a Pump-kaboom next to each of up to 2 heroes (max 6 on the field).', 'Planting Season II desc');
    t.eq(desc('gard_mow'), 'Wind-up: next turn it charges down the marked lane (3 wide, up to 7 long): ' + N.mow + ' damage to each grounded unit there, pushed sideways ' +
      'out of the lane; objects in the lane are destroyed. A Garden Gnome in the middle of the lane stops it there: it takes 20 damage and is Stunned.', 'Mow the Lawn desc');
    t.eq(desc('gard_harvest'), 'Wind-up: next turn every Pump-kaboom bursts (10 damage to each unit within 1 of it).', 'Harvest Festival desc');
    t.eq(desc('gard_weedfeed'), 'Wind-up: next turn pesticide hits radius 1 around up to 2 heroes: ' + N.weedfeed + ' poison damage and Poisoned 3 to each foe there.', 'Weed and Feed desc');
    t.eq(desc('gard_tendril'), 'Deal ' + N.tendril + ' damage to an adjacent foe and Root it through its next turn.', 'Grabby Tendril desc');
    // Corroded
    const co = DD.getStatus('gard_corroded');
    t.ok(co && co.type === 'debuff' && co.takenMult === 1.25 && co.defaultTurns === 2, 'Corroded: a debuff, ×1.25 damage taken (takenMult), 2 turns');
    t.eq(co.desc({ stacks: 1, turns: 0 }), 'Armor 0 and +25% damage taken.', 'Corroded desc (plan §3.1)');
    t.ok(co.hooks && typeof co.hooks.modifyIncomingDamage === 'function' && typeof co.hooks.estimateTaken === 'function', 'armor 0 in the pipeline and in the estimate');
    // objects
    const gd = DD.getObject('gard_gourd'), dr = DD.getObject('gard_drum'), gn = DD.getObject('gard_gnome');
    t.ok(gd && gd.hp === 4 && gd.volatile === true && gd.blocksMove && gd.tags.indexOf('plant') >= 0 && gd.react.fire.destroy, 'Pump-kaboom: 4 HP, volatile, a plant, fire sets it off');
    t.ok(/^Explodes when destroyed, set alight or shot \(aim any single-target damage skill at it\): 10 damage to each unit within 1\. While it stands, it feeds the Gardener's Photosynthesis\./.test(gd.desc),
      'Pump-kaboom desc (plan §3.1 + the D1 words, lead patch P2)');
    t.ok(dr && dr.hp === 3 && dr.volatile === true && dr.react.fire.destroy, 'Weed-B-Gone Drum: 3 HP, volatile, fire sets it off');
    t.ok(/^Explodes when destroyed, set alight or shot \(aim any single-target damage skill at it\): 12 damage to each unit within 1, and every plant within 2 is destroyed\. The Gardener caught in it is Corroded/.test(dr.desc),
      'drum desc (plan §3.1 + the D1 words)');
    t.ok(gn && gn.hp === 0 && gn.blocksMove && !gn.blocksLos && gn.codex === true, 'Garden Gnome: indestructible, blocks movement not sight, in the codex');
    t.ok(/^Indestructible\. A gnome in the middle of the Gardener's mowing lane jams it: 20 damage and Stunned\. Each gnome jams it once, then shatters\./.test(gn.desc), 'gnome desc (plan §3.1)');
    // the encounter
    const e = DD.getEncounter(ENC);
    t.eq(e.name, 'The Overgrown Conservatory', 'encounter name (V §8.1)');
    t.ok(e.act === 4 && e.kind === 'boss' && e.weight === 0, 'act 4, a boss fight, weight 0 (only the gauntlet places it)');
    t.ok(e.gauntlet && e.gauntlet.lane === 'gardener' && e.gauntlet.order === 1, 'gauntlet lane gardener, order 1');
    t.eq(e.gauntlet.hint, 'Hates fire. Loves gnomes.', 'the map hint (plan §2.2)');
    t.ok(e.shortName === 'The Gardener' && e.shortName.length <= 24 && e.icon === '🕷️' && e.banner === false, 'shortName, icon 🕷️, banner false');
    t.ok(e.cameo && e.cameo.start === 'svam_cameo_gardener' && e.cameo.cheat === 'svam_green_thumb' && e.cameo.interjections === true,
      'cameo: announcer svam_cameo_gardener, the cheat Green Thumb (plan §3.0.2)');
    t.ok(e.objective.type === 'boss' && /gnome/.test(e.objective.flavor), 'a boss objective with the gnome hint');
    t.ok(e.reward && e.reward.goldMult === 0.9 && e.reward.itemRarity === 'rare', 'reward: a guaranteed rare, boss gold × 0.9 (lead patch P5)');
    t.eq(e.map.theme, 'a4_conservatory', 'theme a4_conservatory');
    t.eq(e.intro, 'Glass, brass and a lot of very angry plants. Something large ticks behind the ferns. It is wearing a sun hat.', 'encounter intro (V §8.1)');
  });

  // ---- the arena ---------------------------------------------------------------------------------------------------
  T.suite('boss_gardener: the conservatory — layout, gnomes, drums, pond, compost, planters, topiary, the cameo marks, deploy', function (t) {
    if (!ready(t)) return;
    const s = startFight(1);
    t.ok(s.grid.w === 14 && s.grid.h === 12, '14 × 12');
    const g = gard();
    t.ok(!!g && g.x === 7 && g.y === 1, 'the Gardener on the gravel at (7,1)');
    t.eq(DD.Grid.tile(7, 1).t, 'cobble', 'gravel under it');
    [[2, 3], [11, 3], [6, 8]].forEach(function (p) { t.eq(objAt(p[0], p[1]), 'gard_gnome', 'a Garden Gnome at (' + p + ')'); });
    t.eq(B().gnomesLeft(), 3, 'three gnomes');
    [[1, 5], [12, 5]].forEach(function (p) { t.eq(objAt(p[0], p[1]), 'gard_drum', 'a Weed-B-Gone Drum at (' + p + ')'); });
    let water = 0;
    for (let x = 5; x <= 8; x++) for (let y = 5; y <= 6; y++) if (DD.Grid.tile(x, y).t === 'water') water++;
    t.eq(water, 8, 'the sprinkler pond: 8 tiles of shallow water');
    t.ok(DD.Grid.tile(2, 8).t === 'mud' && DD.Grid.tile(11, 8).t === 'mud', 'compost (mud) at (2,8) and (11,8)');
    [[0, 0], [1, 0], [0, 1], [13, 0], [12, 0], [13, 1], [0, 9], [13, 9], [0, 10], [13, 10], [0, 11], [1, 11], [12, 11], [13, 11]].forEach(function (p) {
      t.eq(DD.Grid.tile(p[0], p[1]).h, 1, 'raised planter (h1) at (' + p + ')');
    });
    t.ok(objAt(3, 0) === 'tree' && objAt(10, 0) === 'tree' && DD.Grid.tile(3, 0).obj.label === 'Topiary', 'topiary at (3,0) and (10,0)');
    t.ok(!DD.Grid.los({ x: 2, y: 0 }, { x: 4, y: 0 }), 'topiary blocks sight');
    t.ok(objAt(1, 2) === 'bush' && objAt(12, 2) === 'bush', 'bushes at (1,2) and (12,2)');
    for (let x = 0; x < 14; x++) { t.eq(DD.Grid.tile(x, 4).t, 'cobble', 'gravel mow lane row 4, x ' + x); t.eq(DD.Grid.tile(x, 7).t, 'cobble', 'gravel row 7, x ' + x); }
    const marks = s.grid.tiles.filter(function (x) { return x.tag === 'cameo'; }).map(key).sort();
    t.eq(marks.join(' '), '5,9 8,9', 'Green Thumb\'s cameo marks at (5,9) and (8,9)');
    const heroes = s.units.filter(function (u) { return u.kind === 'hero'; });
    t.ok(heroes.length === 4 && heroes.every(function (h) { return h.y >= 10; }), 'the party deploys on the south lawn');
    t.ok(/gnome/.test(s.objective.flavor) && /plant/.test(s.objective.flavor), 'objective flavor: ' + s.objective.flavor);
    t.ok(logHas(/You are now the grass/) && logHas(/It is wearing a sun hat/), 'its intro and the encounter intro are logged');
    t.eq(s.theme, 'a4_conservatory', 'the conservatory theme');
    t.ok(!s.rules.length || s.rules.every(function (r) { return r.id.indexOf('cameo:') !== 0; }), 'no cameo cheat in a cameo-free fight');
  });

  // ---- skills: desc == execute -----------------------------------------------------------------------------------------
  T.suite('boss_gardener: skills — Shears, Hedge Trimmer, Seed Spitter (vines and caps), Planting Season (caps), Grabby Tendril; scaled texts', function (t) {
    if (!ready(t)) return;
    // Pruning Shears: 12 to an adjacent foe
    arena({ heroes: [{ id: 'test_knight', x: 5, y: 6 }, { id: 'test_mage', x: 4, y: 5 }, { id: 'test_rogue', x: 6, y: 5 }, { id: 'test_cleric', x: 5, y: 10 }],
      enemies: [{ id: GARD, x: 5, y: 5 }] });
    let g = gard();
    const kn = hero('test_knight'), mg = hero('test_mage'), rg = hero('test_rogue');
    let h = hits(function () { useNow(g, 'gard_shears', kn); });
    t.ok(h.of(kn).length === 1 && h.of(kn)[0].base === B().N.shears && h.of(kn)[0].skill === 'gard_shears', 'Shears: ' + B().N.shears + ' to the target');
    t.eq(h.length, 1, 'only the target');
    // Hedge Trimmer: the target and the 2 tiles beside it (across the line from the Gardener)
    put(kn, 5, 4); put(mg, 4, 4); put(rg, 6, 4);
    const sw = B().sweepTiles(g, kn).map(key).sort();
    t.eq(sw.join(' '), '4,4 5,4 6,4', 'the sweep: the target and its two neighbours across');
    h = hits(function () { useNow(g, 'gard_trimmer', kn); });
    t.ok(h.length === 3 && h.every(function (x) { return x.base === B().N.trimmer; }), 'Hedge Trimmer: ' + B().N.trimmer + ' to each of the three (' + h.length + ')');
    // a vine in the sweep is a friend: not hit
    put(rg, 9, 9);
    const v0 = spawnVine(6, 4);
    h = hits(function () { DD.Combat.slotsOf(g).forEach(function (sl) { sl.cd = 0; }); useNow(g, 'gard_trimmer', kn); });
    t.ok(!h.of(v0).length && h.length === 2, 'its own vine in the sweep is not hit');
    // Seed Spitter: 7 to a foe 2-5 away, a vine sprouts next to it, owned by the Gardener, max 4
    arena({ heroes: [{ id: 'test_mage', x: 5, y: 8 }, { id: 'test_knight', x: 1, y: 1 }], enemies: [{ id: GARD, x: 5, y: 5 }] });
    g = gard();
    const m = hero('test_mage');
    h = hits(function () { useNow(g, 'gard_spitter', m); });
    t.ok(h.of(m).length === 1 && h.of(m)[0].base === B().N.spit, 'Seed Spitter: ' + B().N.spit + ' to the target');
    let vs = vines();
    t.ok(vs.length === 1 && dist(vs[0], m) === 1 && vs[0].ownerId === g.id, 'a Strangler Vine sprouts next to it, owned by the Gardener');
    t.ok(DD.Combat.actsWithOwner(vs[0]), 'the sprout acts with its owner (E1)');
    t.ok(logHas(/A Strangler Vine sprouts where the seed landed/), 'logged');
    const rgSp = DD.Targeting.range(g, DD.getSkill('gard_spitter'), 1);
    t.ok(rgSp[0] === 2 && rgSp[1] === 5 && DD.getSkill('gard_spitter').target.los === true, 'range 2-5, needs sight');
    spawnVine(1, 9); spawnVine(2, 9); spawnVine(3, 9);
    t.eq(vines().length, 4, 'four vines on the field');
    h = hits(function () { DD.Combat.slotsOf(g).forEach(function (sl) { sl.cd = 0; }); useNow(g, 'gard_spitter', m); });
    t.ok(h.of(m).length === 1 && vines().length === 4, 'at the cap (4) the seed still hits, but nothing sprouts');
    // level II (Overgrowth): two vines, max 6
    DD.Combat.slotsOf(g).forEach(function (sl) { sl.cd = 0; if (sl.id === 'gard_spitter') sl.level = 2; });
    useNow(g, 'gard_spitter', m);
    t.eq(vines().length, 6, 'Seed Spitter II: two vines sprout (6 = the phase-2 cap)');
    // Planting Season: a Pump-kaboom next to each of up to 2 heroes, max 4 on the field
    arena({ heroes: [{ id: 'test_knight', x: 2, y: 2 }, { id: 'test_mage', x: 9, y: 2 }, { id: 'test_rogue', x: 2, y: 9 }], enemies: [{ id: GARD, x: 6, y: 6 }] });
    g = gard();
    useNow(g, 'gard_plant', g, { anchor: 'self' });
    let gs = B().gourdTiles();
    t.eq(gs.length, 2, 'two Pump-kabooms');
    t.ok(gs.every(function (x) { return S().units.some(function (u) { return u.kind === 'hero' && dist(u, x) === 1; }); }), 'each next to a hero');
    const owners = {};
    gs.forEach(function (x) { S().units.forEach(function (u) { if (u.kind === 'hero' && dist(u, x) === 1) owners[u.id] = 1; }); });
    t.eq(Object.keys(owners).length, 2, 'next to two different heroes');
    DD.Combat.slotsOf(g).forEach(function (sl) { sl.cd = 0; });
    useNow(g, 'gard_plant', g, { anchor: 'self' });
    t.eq(B().gourdTiles().length, 4, 'four on the field');
    DD.Combat.slotsOf(g).forEach(function (sl) { sl.cd = 0; });
    useNow(g, 'gard_plant', g, { anchor: 'self' });
    t.eq(B().gourdTiles().length, 4, 'the cap: 4 (Planting Season I)');
    DD.Combat.slotsOf(g).forEach(function (sl) { sl.cd = 0; if (sl.id === 'gard_plant') sl.level = 2; });
    useNow(g, 'gard_plant', g, { anchor: 'self' });
    t.eq(B().gourdTiles().length, 6, 'Planting Season II: up to 6');
    // Grabby Tendril: 6 and Root through its next turn
    arena({ heroes: [{ id: 'test_knight', x: 4, y: 5 }], enemies: [{ id: GARD, x: 9, y: 9 }] });
    g = gard();
    const v = spawnVine(5, 5);
    const k2 = hero('test_knight');
    bare(k2);
    h = hits(function () { useNow(v, 'gard_tendril', k2); });
    t.ok(h.of(k2).length === 1 && h.of(k2)[0].base === B().N.tendril, 'Grabby Tendril: ' + B().N.tendril);
    const rt = DD.Act.getStatus(k2, 'root');
    t.ok(!!rt && rt.turns === 1, 'and Rooted (1 turn: through its next turn)');
    // P3: the HUD prints the fight's numbers (difficulty ×1.5): damage keys scale, the jam and the bursts don't
    arena({ heroes: [{ id: 'test_knight', x: 5, y: 6 }], enemies: [{ id: GARD, x: 5, y: 5 }], difficulty: { id: 'custom', hp: 1, dmg: 1.5 } });
    g = gard();
    t.ok(new RegExp('Deal ' + Math.round(B().N.shears * 1.5) + ' damage').test(DD.AI.skillDesc(DD.getSkill('gard_shears'), 1, g)), 'scaled Shears: ' + Math.round(B().N.shears * 1.5));
    const mowD = DD.AI.skillDesc(DD.getSkill('gard_mow'), 1, g);
    t.ok(mowD.indexOf(': ' + Math.round(B().N.mow * 1.5) + ' damage to each grounded unit') >= 0 && /it takes 20 damage/.test(mowD), 'scaled Mow the Lawn: ' + Math.round(B().N.mow * 1.5) + ' (the jam stays 20)');
    t.ok(/\(10 damage to each unit within 1/.test(DD.AI.skillDesc(DD.getSkill('gard_harvest'), 1, g)), 'Harvest Festival: the gourd burst stays 10 (it is the gourd\'s blast)');
    bare(hero('test_knight'));
    h = hits(function () { useNow(g, 'gard_shears', hero('test_knight')); });
    t.eq(h[0].dealt, Math.round(B().N.shears * 1.5), 'the scaled Shears hit for ' + Math.round(B().N.shears * 1.5));
  });

  // ---- Photosynthesis ----------------------------------------------------------------------------------------------------
  T.suite('boss_gardener: Photosynthesis — 4 per plant (vines and gourds) at its turn start, at most 16; 5 / 20 in Overgrowth; the live line', function (t) {
    if (!ready(t)) return;
    arena({ heroes: [{ id: 'test_knight', x: 1, y: 10 }], enemies: [{ id: GARD, x: 6, y: 5 }],
      objects: [{ x: 3, y: 3, id: 'gard_gourd' }] });
    const g = gard();
    spawnVine(8, 8); spawnVine(9, 8);
    t.eq(B().plantCount(), 3, 'three plants: two vines and a gourd');
    t.ok(/\(now: 3 plants, \+12\)/.test(B().passiveText(g)), 'the passive line counts them: ' + B().passiveText(g));
    g.hp = 200;
    turn(g);
    t.eq(g.hp, 212, 'its turn start: +12 (3 plants × 4)');
    t.ok(logHas(/Photosynthesis: the Gardener heals 12 \(3 plants on the field\)/), 'logged');
    spawnVine(10, 8); spawnVine(10, 9); spawnVine(11, 9);
    g.hp = 200;
    turn(g);
    t.eq(g.hp, 216, '6 plants: capped at 16');
    // Overgrowth: 5 per plant, at most 20
    act(function () { B().enterOvergrowth(g); });
    g.hp = 100;
    turn(g);
    t.eq(g.hp, 120, 'Overgrowth: 6 plants × 5 = 30, capped at 20');
    t.ok(/heals 5 per plant on the field \(Strangler Vines and Pump-kabooms\), at most 20/.test(B().passiveText(g)), 'the line says 5 / 20');
    // no plants, no heal
    vines().forEach(function (v) { act(function () { DD.Act.kill(v, null); }); });
    act(function () { DD.Act.removeObject(3, 3); });
    g.hp = 100;
    turn(g);
    t.eq(g.hp, 100, 'a weeded garden heals nothing');
    t.ok(/Weed every sprout: each plant heals it 5 a turn/.test(S().objective.flavor), 'the flavor says so: ' + S().objective.flavor);
  });

  // ---- Mow the Lawn ------------------------------------------------------------------------------------------------------
  T.suite('boss_gardener: Mow the Lawn — the lane (3 × 7, most grounded heroes, grid-order ties, cut at blockers), it ignores gnomes', function (t) {
    if (!ready(t)) return;
    arena({ heroes: [{ id: 'test_knight', x: 5, y: 2 }, { id: 'test_mage', x: 8, y: 5 }, { id: 'test_rogue', x: 9, y: 6 }, { id: 'test_cleric', x: 0, y: 11 }],
      enemies: [{ id: GARD, x: 5, y: 5 }] });
    const g = gard();
    const n = B().laneOf(g, N_), e = B().laneOf(g, E_);
    t.ok(n.rows === 5 && n.tiles.length === 15, 'north: 5 rows to the edge, 3 wide (' + n.tiles.length + ' tiles)');
    t.ok(e.rows === 6 && e.tiles.length === 18, 'east: 6 rows to the edge');
    t.ok(B().laneOf(g, S_).rows === 6 && B().laneOf(g, W_).rows === 5, 'south 6, west 5');
    t.ok(n.tiles.every(function (p) { return Math.abs(p.x - 5) <= 1 && p.y < 5; }), 'the north lane is the 3 columns x 4-6 above it');
    t.eq(B().laneOf(g, E_, { x: 0, y: 10 }).rows, 7, 'at most 7 long (from the west edge)');
    let pick = B().pickLane(g);
    t.ok(!!pick && pick.dir.x === 1 && pick.score === 4, 'two heroes east, one north: it mows east (score ' + (pick && pick.score) + ')');
    put(hero('test_rogue'), 0, 10);
    pick = B().pickLane(g);
    t.ok(!!pick && pick.dir.y === -1, 'one hero north, one east: a tie goes in grid order (north first)');
    // flyers float over the blades: they don't count
    const kn = hero('test_knight');
    kn.flags.flying = true;
    DD.Act.touch();
    pick = B().pickLane(g);
    t.ok(!!pick && pick.dir.x === 1, 'a flying hero doesn\'t count: east it is');
    kn.flags.flying = false;
    // a topiary cuts the lane, a gnome ends the marked lane but not the count
    act(function () { DD.Act.placeObject(5, 3, 'tree'); });
    t.eq(B().laneOf(g, N_).rows, 1, 'a topiary (indestructible) in the middle column cuts the lane before it');
    act(function () { DD.Act.removeObject(5, 3); DD.Act.placeObject(5, 3, 'gard_gnome'); });
    const ln = B().laneOf(g, N_);
    t.ok(ln.gnome && ln.gnome.x === 5 && ln.gnome.y === 3 && ln.rows === 1, 'a gnome in the middle column: the marked lane ends there');
    t.ok(ln.tiles.some(function (p) { return p.x === 5 && p.y === 3; }) && !ln.tiles.some(function (p) { return p.y < 3; }), 'the gnome\'s tile is marked (the jam), nothing beyond');
    t.eq(ln.full.length, 15, 'the whole lane still counts heroes beyond the gnome (it never looks)');
    put(hero('test_mage'), 0, 9);
    pick = B().pickLane(g);
    t.ok(!!pick && pick.dir.y === -1 && !!pick.gnome, 'the knight behind the gnome baits the lane');
    const it = act(function () { return B().windMow(g, pick); });
    t.ok(!!it && /gnome is in the way/.test(it.label) && it.data.hint === 'a gnome is in the way!', 'the wind-up says a gnome is in the way');
    t.ok(logHas(/runs straight into a garden gnome/), 'and the log');
    t.eq(DD.AI.intentDmg(g, it), B().N.mow, 'the marked number: ' + B().N.mow);
    // nobody in any lane: no mow
    arena({ heroes: [{ id: 'test_knight', x: 1, y: 1 }], enemies: [{ id: GARD, x: 6, y: 6 }] });
    t.eq(B().pickLane(gard()), null, 'nobody in a lane: no mow');
  });

  T.suite('boss_gardener: Mow the Lawn lands — its damage to grounded units in the lane, pushed out, objects mowed (credited), the charge, flyers spared', function (t) {
    if (!ready(t)) return;
    arena({ heroes: [{ id: 'test_knight', x: 5, y: 3 }, { id: 'test_mage', x: 6, y: 2 }, { id: 'test_rogue', x: 9, y: 9 }, { id: 'test_cleric', x: 1, y: 9 }],
      enemies: [{ id: GARD, x: 5, y: 5 }], objects: [{ x: 4, y: 1, id: 'crate' }] });
    aiOff();
    const g = gard(), kn = hero('test_knight'), mg = hero('test_mage');
    bare(kn); bare(mg);
    mg.maxHp = mg.hp = 100;
    const v = spawnVine(4, 4);
    const it = act(function () { return B().windMow(g, B().laneOf(g, N_)); });
    t.ok(!!it && it.anchor === 'self' && DD.AI.intentTiles(g, it).length === 15, 'wound up: 15 marked tiles, anchored on it');
    const h = hits(play);
    t.ok(h.of(kn).some(function (x) { return x.base === B().N.mow && x.skill === 'gard_mow'; }) && h.of(mg).some(function (x) { return x.base === B().N.mow && x.skill === 'gard_mow'; }),
      'the knight (middle) and the mage (side) take ' + B().N.mow);
    t.ok(h.of(v).some(function (x) { return x.base === B().N.mow; }) && v.dead, 'its own vine in the lane takes the blades too (and is mulch)');
    t.ok(kn.x === 7 && kn.y === 3, 'the middle-column knight goes 2 tiles sideways, out of the lane (' + key(kn) + ')');
    t.ok(mg.x === 7 && mg.y === 2, 'the side-column mage goes 1 tile outward (' + key(mg) + ')');
    t.eq(objAt(4, 1), null, 'the crate in the lane is mowed down');
    t.ok(g.x === 5 && g.y === 0, 'it charges to the far end of the lane (' + key(g) + ')');
    t.ok(!h.of(hero('test_rogue')).length && !h.of(hero('test_cleric')).length, 'nobody outside the lane is touched');
    t.eq(D(g).stats.mows, 1, 'counted');
    // flyers float over it; an immovable unit stays and stops the charge before it
    arena({ heroes: [{ id: 'test_knight', x: 5, y: 2 }, { id: 'test_rogue', x: 4, y: 4 }], enemies: [{ id: GARD, x: 5, y: 5 }] });
    aiOff();
    const g2 = gard(), r = hero('test_rogue'), k2 = hero('test_knight');
    r.flags.flying = true;
    k2.flags.immovable = true;
    const hp0 = r.hp;
    act(function () { B().windMow(g2, B().laneOf(g2, N_)); });
    const h2 = hits(play);
    t.ok(r.hp === hp0 && r.x === 4 && r.y === 4, 'a flyer in the lane is spared and stays put');
    t.ok(h2.of(k2).length >= 1 && k2.x === 5 && k2.y === 2, 'an immovable hero is hit but not pushed');
    t.ok(g2.x === 5 && g2.y === 3, 'the charge stops in front of the unit it couldn\'t clear (' + key(g2) + ')');
    // its own drum: mowed next to it, the blast Corrodes it
    arena({ heroes: [{ id: 'test_knight', x: 5, y: 1 }], enemies: [{ id: GARD, x: 5, y: 5 }], objects: [{ x: 5, y: 4, id: 'gard_drum' }] });
    aiOff();
    const g3 = gard();
    const hp3 = g3.hp;
    act(function () { B().windMow(g3, B().laneOf(g3, N_)); });
    const h3 = hits(play);
    t.ok(objAt(5, 4) === null && h3.of(g3).some(function (x) { return x.base === 12 && x.cause === 'explosion'; }), 'it mows its own drum: 12 to itself (' + (hp3 - g3.hp) + ' after armor)');
    t.ok(has(g3, 'gard_corroded') && D(g3).stats.drums === 1, 'and is Corroded');
  });

  T.suite('boss_gardener: the gnome jam — 20 damage and Stunned (that turn is lost), the gnome shatters, each gnome once', function (t) {
    if (!ready(t)) return;
    arena({ heroes: [{ id: 'test_knight', x: 5, y: 1 }, { id: 'test_mage', x: 0, y: 11 }], enemies: [{ id: GARD, x: 5, y: 5 }],
      objects: [{ x: 5, y: 2, id: 'gard_gnome' }] }, true);
    const g = gard();
    const pick = B().pickLane(g);
    t.ok(!!pick && pick.dir.y === -1 && pick.gnome && pick.gnome.y === 2, 'the knight behind the gnome: it picks the north lane anyway');
    act(function () { B().windMow(g, pick); });
    const hp0 = g.hp;
    const h = hits(play);
    t.ok(g.x === 5 && g.y === 3, 'it charges up to the gnome (' + key(g) + ')');
    t.ok(h.of(g).some(function (x) { return x.base === 20 && x.cause === 'bump'; }) && hp0 - g.hp >= 20, 'the jam: 20 damage, through its armor (' + (hp0 - g.hp) + ')');
    t.eq(objAt(5, 2), null, 'the gnome shatters');
    t.eq(D(g).stats.jams, 1, 'one jam');
    t.ok(logHas(/The blades jam: 20 damage and Stunned/), 'logged');
    t.ok(logHas(/The Gardener loses the turn/), 'the stun costs it that very turn');
    t.ok(!(g.intents || []).some(function (i) { return i.windup; }) && D(g).stats.shears + D(g).stats.trims + D(g).stats.spits + D(g).stats.planted === 0,
      'no action and no new wind-up that turn');
    t.ok(!has(g, 'stun'), 'the stun is spent at the end of that turn');
    t.eq(B().gnomesLeft(), 0, 'each gnome jams it once');
    t.ok(!!D(g).guard, 'Safe Mode is up after the jam');
  });

  // ---- Harvest Festival ------------------------------------------------------------------------------------------------------
  T.suite('boss_gardener: Harvest Festival — needs 2+ gourds, marks every blast (a chained drum too), 10 each, every gourd bursts', function (t) {
    if (!ready(t)) return;
    arena({ heroes: [{ id: 'test_knight', x: 6, y: 6 }, { id: 'test_mage', x: 9, y: 6 }, { id: 'test_rogue', x: 0, y: 11 }], enemies: [{ id: GARD, x: 1, y: 1 }],
      objects: [{ x: 6, y: 7, id: 'gard_gourd' }, { x: 10, y: 7, id: 'gard_drum' }] });
    aiOff();
    const g = gard(), kn = hero('test_knight'), mg = hero('test_mage');
    t.eq(B().harvestPlan(), null, 'one gourd: no Harvest Festival');
    act(function () { DD.Act.placeObject(9, 7, 'gard_gourd'); });
    const plan = B().harvestPlan();
    const ks = plan.tiles.map(key);
    t.ok(plan.gourds.length === 2 && ks.indexOf('6,6') >= 0 && ks.indexOf('9,6') >= 0, 'two gourds: their blasts are marked');
    t.ok(ks.indexOf('11,7') >= 0 && ks.indexOf('10,8') >= 0, 'the drum next to a gourd goes off too: its blast is marked as well');
    D(g).wind = 1;
    act(function () { B().windNext(g); });
    const w = windup(g, 'gard_harvest');
    t.ok(!!w && DD.AI.intentDmg(g, w) === 10, 'wound up (the rotation\'s Harvest), the marked number 10');
    t.eq(D(g).wind, 0, 'next in the rotation: Mow the Lawn');
    const h = hits(play);
    t.eq(B().gourdTiles().length, 0, 'every gourd bursts');
    t.ok(h.of(kn).some(function (x) { return x.base === 10 && x.cause === 'explosion'; }) && h.of(mg).some(function (x) { return x.base === 10 && x.cause === 'explosion'; }),
      'the heroes next to the gourds take 10');
    t.eq(objAt(10, 7), null, 'the chained drum went off');
    const marked = plan.tiles.map(key);
    const blasted = h.filter(function (x) { return x.cause === 'explosion' && x.target && x.target.kind === 'hero'; });
    t.ok(blasted.length === 2 && blasted.every(function (x) { return marked.indexOf(key(x.target)) >= 0; }), 'every hero a blast reached stood on the marked tiles');
    t.ok(!h.of(hero('test_rogue')).length, 'nobody off the marked tiles');
    t.ok(D(g).stats.harvests === 1 && D(g).stats.harvestBursts === 2, 'counted');
  });

  // ---- Weed and Feed ----------------------------------------------------------------------------------------------------------
  T.suite('boss_gardener: Weed and Feed (Overgrowth) — radius 1 around up to 2 heroes, 14 poison and Poisoned 3, the Gardener immune', function (t) {
    if (!ready(t)) return;
    arena({ heroes: [{ id: 'test_knight', x: 6, y: 6 }, { id: 'test_cleric', x: 6, y: 7 }, { id: 'test_mage', x: 10, y: 2 }, { id: 'test_rogue', x: 0, y: 11 }],
      enemies: [{ id: GARD, x: 1, y: 1 }] });
    aiOff();
    const g = gard();
    act(function () { B().enterOvergrowth(g); });
    const plan = B().weedPlan(g);
    t.eq(plan.centers.length, 2, 'two centres');
    t.ok(plan.centers.some(function (c) { return (c.x === 6 && (c.y === 6 || c.y === 7)); }), 'the pair first');
    t.ok(plan.tiles.every(function (p) { return plan.centers.some(function (c) { return dist(c, p) <= 1; }); }), 'radius 1 around each');
    D(g).wind = 1;
    act(function () { B().windNext(g); });
    const w = windup(g, 'gard_weedfeed');
    t.ok(!!w && DD.AI.intentDmg(g, w) === B().N.weedfeed, 'wound up in the phase-2 rotation, the marked number ' + B().N.weedfeed);
    const marked = DD.AI.intentTiles(g, w).map(key);
    const inRed = S().units.filter(function (u) { return u.kind === 'hero' && marked.indexOf(key(u)) >= 0; });
    const h = hits(play);
    const ww = h.filter(function (x) { return x.skill === 'gard_weedfeed'; });
    t.ok(ww.length === inRed.length && ww.length >= 2 && ww.every(function (x) { return x.base === B().N.weedfeed && x.element === 'poison'; }), B().N.weedfeed + ' poison to each hero in the red (' + ww.length + ')');
    // (the first hero's turn has started by now: its Poisoned ticked once, 3 → 2)
    t.ok(inRed.every(function (u) { const st = DD.Act.getStatus(u, 'poison'); return st && st.stacks >= 2; }), 'and Poisoned 3');
    t.ok(!h.of(hero('test_rogue')).length, 'nobody off the marked tiles');
    t.ok(!DD.Act.addStatus(g, 'poison', { stacks: 3 }, g) && DD.AI.estimate(hero('test_knight'), g, 10, 'poison') === 0, 'the Gardener itself: poison ×0');
  });

  // ---- drums and Corroded ------------------------------------------------------------------------------------------------------
  T.suite('boss_gardener: Weed-B-Gone drums — 12 around, plants within 2 wither, the Gardener Corroded (armor 0, ×1.25, honest estimates, 2 turns)', function (t) {
    if (!ready(t)) return;
    arena({ heroes: [{ id: 'test_mage', x: 2, y: 5 }, { id: 'test_knight', x: 10, y: 10 }], enemies: [{ id: GARD, x: 5, y: 5 }],
      objects: [{ x: 6, y: 5, id: 'gard_drum' }, { x: 6, y: 7, id: 'gard_gourd' }, { x: 3, y: 8, id: 'gard_gourd' }] });
    aiOff();
    const g = gard(), m = hero('test_mage'), kn = hero('test_knight');
    const near = spawnVine(8, 5), far = spawnVine(9, 6);
    const q = DD.Targeting.validTargets(m, m.basic).filter(function (p) { return p.x === 6 && p.y === 5; })[0];
    t.ok(!!q && q.detonates, 'the mage can set the drum off from range');
    const hp0 = g.hp;
    const h = hits(function () { act(function () { DD.Act.detonate(m, 6, 5); }); });
    t.ok(h.of(g).some(function (x) { return x.base === 12 && x.cause === 'explosion'; }) && hp0 - g.hp === 10, 'the blast: 12 to the Gardener next to it (10 after armor)');
    t.ok(near.dead && !far.dead, 'the vine within 2 withers, the one 3 away does not');
    t.eq(objAt(6, 7), null, 'the gourd within 2 is destroyed (and bursts)');
    t.eq(objAt(3, 8), 'gard_gourd', 'a gourd farther away stays');
    const st = DD.Act.getStatus(g, 'gard_corroded');
    t.ok(!!st && st.turns === 2, 'Corroded for 2 of its turns');
    t.ok(logHas(/Corroded! Armor 0 and \+25% damage taken/), 'logged');
    // armor 0 and ×1.25, the estimate agrees
    t.eq(DD.AI.estimate(kn, g, 16, null), 20, 'the estimate: 16 → 20 (×1.25, armor ignored)');
    let dealt = 0;
    act(function () { dealt = DD.Act.damage(kn, g, 16, { cause: 'skill' }); });
    t.eq(dealt, 20, 'the hit: 20');
    turn(g); turn(g);
    t.ok(!has(g, 'gard_corroded'), 'gone after 2 of its turns');
    t.eq(DD.AI.estimate(kn, g, 16, null), 14, 'armor back: 16 → 14');
    act(function () { dealt = DD.Act.damage(kn, g, 16, { cause: 'skill' }); });
    t.eq(dealt, 14, 'and the hit agrees');
    // fire sets drums and gourds off
    arena({ heroes: [{ id: 'test_mage', x: 1, y: 1 }], enemies: [{ id: GARD, x: 9, y: 9 }], objects: [{ x: 5, y: 5, id: 'gard_drum' }, { x: 3, y: 3, id: 'gard_gourd' }] });
    act(function () { DD.Act.applyElement(5, 5, 'fire', hero('test_mage')); DD.Act.applyElement(3, 3, 'fire', hero('test_mage')); });
    t.ok(objAt(5, 5) === null && objAt(3, 3) === null, 'fire sets off the drum and the gourd');
  });

  // ---- its turn ---------------------------------------------------------------------------------------------------------------
  T.suite('boss_gardener: its turn — the docket (Planting Season → Prune → Seed Spitter → Prune) with fallbacks, then one wind-up in rotation', function (t) {
    if (!ready(t)) return;
    arena({ heroes: [{ id: 'test_knight', x: 4, y: 9 }, { id: 'test_mage', x: 7, y: 9 }, { id: 'test_cleric', x: 5, y: 11 }, { id: 'test_rogue', x: 9, y: 11 }],
      enemies: [{ id: GARD, x: 6, y: 2 }] }, true);
    const g = gard();
    S().units.forEach(function (u) { if (u.kind === 'hero') u.maxHp = u.hp = 200; });
    t.ok(/next: Planting Season/.test(B().passiveText(g)) && /next: Mow the Lawn/.test(B().passiveText(g)), 'the inspect line names the next step and wind-up');
    play();
    t.ok(D(g).stats.planted >= 1 && D(g).docket === 1, 'turn 1: Planting Season (' + D(g).stats.planted + ' gourds)');
    t.eq((g.intents || []).filter(function (i) { return i.windup; }).length, 1, 'then one wind-up');
    const first = (g.intents || []).filter(function (i) { return i.windup; })[0];
    t.ok(!!first, 'its wind-up: ' + (first && first.skillId));
    t.ok(/next: Hedge Trimmer or Pruning Shears/.test(B().passiveText(g)), 'next: Prune');
    play();
    t.eq(D(g).docket, 2, 'turn 2 used the docket\'s next step');
    t.ok(D(g).stats.shears + D(g).stats.trims + D(g).stats.spits >= 1 || D(g).stats.turns === 2, 'a prune or its fallback');
    // Planting Season at the cap falls back to Seed Spitter
    arena({ heroes: [{ id: 'test_mage', x: 5, y: 8 }, { id: 'test_knight', x: 0, y: 11 }], enemies: [{ id: GARD, x: 5, y: 5 }],
      objects: [{ x: 0, y: 0, id: 'gard_gourd' }, { x: 1, y: 0, id: 'gard_gourd' }, { x: 10, y: 0, id: 'gard_gourd' }, { x: 11, y: 0, id: 'gard_gourd' }] }, true);
    const g2 = gard();
    hero('test_mage').maxHp = hero('test_mage').hp = 200;
    turn(g2);
    t.ok(B().gourdTiles().length === 4 && D(g2).stats.planted === 0 && D(g2).stats.spits === 1, 'at the gourd cap the planting turn spits a seed instead');
    // Harvest is skipped with fewer than 2 gourds; nothing to wind up → no wind-up
    arena({ heroes: [{ id: 'test_knight', x: 1, y: 1 }], enemies: [{ id: GARD, x: 6, y: 6 }], objects: [{ x: 10, y: 10, id: 'gard_gourd' }] });
    const g3 = gard();
    D(g3).wind = 1;
    t.ok(!act(function () { return B().windNext(g3); }) && !(g3.intents || []).length, 'no lane with a hero and one gourd: no wind-up');
    D(g3).wind = 0;
    put(hero('test_knight'), 6, 3);
    t.ok(act(function () { return B().windNext(g3); }) && !!windup(g3, 'gard_mow') && D(g3).wind === 1, 'a hero in a lane: Mow the Lawn, Harvest next');
    t.ok(!act(function () { return B().windNext(g3); }), 'one wind-up at a time');
  });

  // ---- Overgrowth Mode ----------------------------------------------------------------------------------------------------------
  T.suite('boss_gardener: Overgrowth Mode at half HP — the damage carries over, II skills, move +1, Weed and Feed joins, the docket restarts', function (t) {
    if (!ready(t)) return;
    arena({ heroes: [{ id: 'test_knight', x: 5, y: 6 }, { id: 'test_mage', x: 1, y: 10 }], enemies: [{ id: GARD, x: 5, y: 5 }] });
    const g = gard(), kn = hero('test_knight');
    t.ok(B().threshold(g) === B().N.p2 && B().N.p2 * 2 === B().N.hp, 'the threshold: half its HP (' + B().N.p2 + ' of ' + B().N.hp + ')');
    const mov0 = g.mov;
    D(g).docket = 2;
    D(g).wind = 1;
    act(function () { DD.Act.damage(kn, g, g.hp - 140 + g.armor, { cause: 'skill', noHighGround: true }); });
    t.eq(g.hp, 140, 'no plot armor: the damage carries over (140)');
    t.eq(D(g).phase, 2, 'Overgrowth Mode');
    const lv = {};
    DD.Combat.slotsOf(g).forEach(function (sl) { lv[sl.id] = sl.level; });
    t.ok(lv.gard_spitter === 2 && lv.gard_plant === 2 && lv.gard_shears === 1, 'Seed Spitter II and Planting Season II');
    t.eq(g.mov, mov0 + 1, 'move +1 (5)');
    t.eq(D(g).docket, 0, 'the docket restarts at Planting Season');
    t.eq(B().WIND[2][D(g).wind], 'harvest', 'the rotation keeps its place (Harvest was next)');
    t.ok(logHas(/OVERGROWTH MODE! The Gardener now heals 5 per plant \(at most 20\)/), 'logged');
    t.ok(/Weed and Feed/.test(S().log.filter(function (l) { return /OVERGROWTH/.test(l.text); })[0].text), 'the log names Weed and Feed');
    t.ok(/^OVERGROWTH MODE!/.test(S().objective.flavor), 'the flavor says so');
    act(function () { DD.Act.damage(kn, g, 10, { cause: 'skill' }); });
    t.eq(D(g).phase, 2, 'it stays in phase 2');
  });

  // ---- Safe Mode ---------------------------------------------------------------------------------------------------------------------
  T.suite('boss_gardener: Safe Mode — after a stun lands, stuns are refused until the end of the next turn it plays', function (t) {
    if (!ready(t)) return;
    arena({ heroes: [{ id: 'test_knight', x: 6, y: 7 }, { id: 'test_mage', x: 6, y: 9 }], enemies: [{ id: GARD, x: 6, y: 5 }] });
    const g = gard(), kn = hero('test_knight'), m = hero('test_mage');
    let st = null;
    act(function () { st = DD.Act.addStatus(g, 'stun', { turns: 1 }, kn); });
    t.ok(!!st && D(g).stats.stuns === 1, 'the first stun lands');
    act(function () { DD.Act.addStatus(g, 'stun', { turns: 2 }, m); });
    t.ok(DD.Act.getStatus(g, 'stun').turns === 1 && D(g).stats.refused === 1, 'a second stun is refused (🔧 Safe Mode)');
    turn(g);
    t.ok(!!D(g).guard, 'a lost turn keeps Safe Mode up');
    act(function () { DD.Act.addStatus(g, 'stun', { turns: 1 }, m); });
    t.ok(!has(g, 'stun'), 'still refused');
    act(function () { DD.Combat.endRound(); });
    turn(g);
    t.ok(!D(g).guard, 'Safe Mode drops at the end of a turn it played');
    act(function () { st = DD.Act.addStatus(g, 'stun', { turns: 1 }, m); });
    t.ok(!!st, 'and stuns land again');
    t.ok(!DD.Act.addStatus(g, 'sleep', { turns: 1 }, m), 'sleep never lands (immune)');
    t.ok(DD.Act.isBoss(g) && !DD.Act.addStatus(g, 'sheep', { turns: 1 }, m), 'a boss: no sheep');
  });

  // ---- the vines ------------------------------------------------------------------------------------------------------------------
  T.suite('boss_gardener: Strangler Vines — act on its turn (E1), split on its death, immovable, a Rooting attack of opportunity, rustling', function (t) {
    if (!ready(t)) return;
    arena({ heroes: [{ id: 'test_knight', x: 3, y: 5 }, { id: 'test_mage', x: 1, y: 10 }], enemies: [{ id: GARD, x: 9, y: 9 }] }, true);
    const g = gard(), kn = hero('test_knight');
    kn.maxHp = kn.hp = 200;
    const v = spawnVine(4, 5);
    t.ok(v.ownerId === g.id && DD.Combat.actsWithOwner(v), 'spawned with its owner: it acts with the Gardener');
    play();
    t.ok(!(S().order || []).some(function (e) { return e.unitId === v.id; }), 'no initiative entry of its own');
    t.ok(DD.Combat.groupOf(g).indexOf(v) > 0, 'it acts right after the Gardener (its group)');
    t.ok(has(kn, 'root') || logHas(/Grabby Tendril/), 'on the Gardener\'s turn it grabs the knight next to it');
    // immovable
    const r = act(function () { return DD.Act.push(kn, v, { x: 1, y: 0 }, 2); });
    t.ok(r.moved === 0 && v.x === 4 && v.y === 5, 'it can\'t be pushed');
    // the Rooting attack of opportunity stops a walk
    arena({ heroes: [{ id: 'test_knight', x: 3, y: 5 }], enemies: [{ id: GARD, x: 10, y: 10 }] });
    const v2 = spawnVine(4, 5), k2 = hero('test_knight');
    k2.maxHp = k2.hp = 200;
    act(function () { DD.Combat.giveTurnTo(k2); });
    const o = DD.Act.opportunityOf(v2, k2, null, { x: 2, y: 5 });
    t.ok(!!o && o.skill.id === 'gard_tendril', 'walking away provokes Grabby Tendril');
    DD.Combat.move(k2, 1, 5);
    t.ok(has(k2, 'root') && k2.x === 3 && k2.y === 5, 'it lands: Rooted, the walk stops before it starts (' + key(k2) + ')');
    // its owner dies: the vine rolls its own entry at the next round start
    arena({ heroes: [{ id: 'test_knight', x: 1, y: 1 }], enemies: [{ id: GARD, x: 9, y: 9 }] }, true);
    const g3 = gard(), v3 = spawnVine(5, 5);
    play();
    act(function () { DD.Act.kill(g3, hero('test_knight')); });
    if (!S().result) {
      play();
      t.ok((S().order || []).some(function (e) { return e.unitId === v3.id; }), 'an orphaned vine rolls its own initiative');
    } else t.ok(true, 'the fight ended with the Gardener (boss objective)');
    // with nobody next to it, it rustles (and the content suite sees it act)
    arena({ heroes: [{ id: 'test_knight', x: 1, y: 1 }], enemies: [{ id: VINE, x: 8, y: 8 }] }, true);
    const v4 = unit(VINE);
    let used = 0;
    DD.Act.addRule({ id: 'test_rustle', name: 'used', silent: true, hooks: { onSkillUsed: function (ctx) { if (ctx.user === v4 && ctx.skill.id === 'gard_rustle') used++; } } });
    play(); play(); play();
    DD.Act.removeRule('test_rustle');
    t.ok(used >= 1 && used <= 2, 'alone, it rustles menacingly (' + used + ' times in 3 rounds: cooldown 2)');
  });

  // ---- the cameo cheat ---------------------------------------------------------------------------------------------------------
  T.suite('boss_gardener: Svammiel\'s Green Thumb at this door (needs svammiel.js) — two vines on the marks, owned by the Gardener, exact desc', function (t) {
    if (!ready(t)) return;
    const cam = DD.getCameo && DD.getCameo('svammiel');
    if (!cam || !cam.cheats || !cam.cheats.svam_green_thumb || !DD.Cameo || DD.Cameo.stub) { t.log('svammiel.js / cameo.js not loaded: the cheat checks are skipped'); t.ok(true, 'skipped'); return; }
    const s = startFight(5, { cameo: true });
    const r = s.rules.filter(function (x) { return x.id === 'cameo:svam_green_thumb'; })[0];
    t.ok(!!r && r.cheat === true, 'the start cameo puts Green Thumb in the rules');
    t.eq(r && r.desc, 'Svammiel planted two Strangler Vines for the Gardener.', 'its exact desc');
    const g = gard();
    const vs = vines().map(key).sort();
    t.eq(vs.join(' '), '5,9 8,9', 'two vines on the cameo marks');
    t.ok(vines().every(function (v) { return v.ownerId === g.id && DD.Combat.actsWithOwner(v); }), 'owned by the Gardener (they act on its turn)');
    t.ok(/\(now: 2 plants, \+8\)/.test(B().passiveText(g)), 'they feed Photosynthesis');
  });

  // ---- voice ---------------------------------------------------------------------------------------------------------------
  T.suite('boss_gardener: voice — lengths, "it", tags, named lines (Benedick\'s verbatim), never a name without its hero, the DM\'s tips, the defeat', function (t) {
    if (!ready(t)) return;
    const d = DD.getEnemy(GARD), v = DD.getEnemy(VINE);
    const texts = [];
    [d, v].forEach(function (def) {
      Object.keys(def.barks).forEach(function (k) { def.barks[k].forEach(function (l) { t.ok(l.length <= 70, def.id + ' bark ' + k + ' ≤ 70: "' + l + '"'); texts.push(['bark ' + k, l]); }); });
    });
    ['spawn', 'attack', 'hurt', 'lowhp', 'summon', 'vines', 'phase', 'stunned', 'death'].forEach(function (k) { t.ok((d.barks[k] || []).length >= 2, 'barks.' + k); });
    t.ok(d.barks.attack.indexOf('Thyme\'s up.') >= 0 && d.barks.death.indexOf('[SHUTDOWN] Please water... the petunias...') >= 0 && d.barks.spawn.indexOf('Lettuce begin.') >= 0, 'V §8.1 verbatim');
    ['gardener_tip', 'gard_overgrowth', 'gardener_death'].forEach(function (k) {
      const pool = DD.defs.narration[k] || [];
      t.ok(pool.length >= 2, k + ': ' + pool.length + ' lines');
      pool.forEach(function (l) { t.ok(l.length <= 160 && !/\{/.test(l), k + ' ≤ 160, token-free'); texts.push([k, l]); });
    });
    t.eq(JSON.stringify(DD.defs.narration.gardener_tip), JSON.stringify(['DM (whispering): "Plants burn. Fire is your friend in a greenhouse."',
      'DM (whispering): "Make it mow over a garden gnome. It never looks."']), 'the DM\'s two tips (plan §5.3; no sprinkler tip)');
    t.ok(DD.defs.narration.gardener_death.indexOf('The Gardener folds its legs, tips its sun hat and powers down. The petunias have never looked better.') >= 0, 'the defeat (V §8.1)');
    Object.keys(B().SK).forEach(function (k) { const s = DD.getSkill(B().SK[k]); for (let lv = 1; lv <= s.levels.length; lv++) texts.push(['skill ' + s.id, DD.skillDesc(s, lv, null)]); texts.push(['flavor ' + s.id, s.flavor || '']); });
    texts.push(['codex', d.desc], ['intro', d.boss.intro], ['passive', B().passiveText(null)], ['vine passive', v.passive.desc], ['encounter', DD.getEncounter(ENC).intro]);
    ['gard_gourd', 'gard_drum', 'gard_gnome'].forEach(function (id) { texts.push([id, DD.getObject(id).desc]); });
    texts.push(['corroded', DD.getStatus('gard_corroded').desc({ turns: 2 })]);
    // pronouns: a sentence naming the Gardener says it / its, never he / she
    let checked = 0;
    texts.forEach(function (x) {
      sentences(x[1]).forEach(function (sent) {
        if (!/Gardener/.test(sent)) return;
        checked++;
        t.ok(!/\b(he|him|his|himself|she|her|hers|herself)\b/i.test(sent), x[0] + ': "it" for the Gardener in "' + sent + '"');
      });
    });
    t.ok(checked >= 8, checked + ' sentences name the Gardener');
    // generic lines name no hero
    const heroWords = /\b(Zarathor|Syllamin|Marbles|Professor|Marwyn|Corelos|Josiah|Ellaria|Sparrow|Slate|Mayor|Buga|Kiri|Betty|Basanos|Valdris|Hjalmar|Pebbles|Benedick)\b/;
    Object.keys(d.barks).forEach(function (k) { if (k !== 'named') d.barks[k].forEach(function (l) { t.ok(!heroWords.test(l), 'generic bark ' + k + ' names no hero: "' + l + '"'); }); });
    // named lines: each names its hero exactly; Benedick's verbatim
    const NAMES = { pebbles: 'Pebbles', betty: 'Betty', hjalmar: 'Hjalmar', ellaria: 'Ellaria', marbles: 'Professor Marbles', marwyn: 'Marwyn', valdris: 'Valdris',
      zarathor: 'Zarathor', benedick: 'Benedick' };
    B().NAMED.forEach(function (p) {
      const h = DD.getHero(p[0]);
      t.ok(!!NAMES[p[0]] && p[1].indexOf(NAMES[p[0]]) >= 0 && p[1].length <= 70, p[0] + ': names ' + NAMES[p[0]] + ' exactly: "' + p[1] + '"');
      if (!h) { t.log(p[0] + ' not registered in this run (isolated): the line waits for the hero'); return; }
      t.eq(h.name, NAMES[p[0]], p[0] + ': the hero\'s registered name');
    });
    t.ok(B().NAMED.some(function (x) { return x[0] === 'benedick' && x[1] === 'PEST DETECTED: Benedick. INITIATING SALT PROTOCOL.'; }), 'Benedick\'s line, verbatim (plan §5.3)');
    t.ok(d.barks.named.indexOf('PEST DETECTED: Benedick. INITIATING SALT PROTOCOL.') >= 0, 'in the named bark key (the party filter applies)');
    arena({ heroes: [{ id: 'test_mage', x: 6, y: 9 }], enemies: [{ id: GARD, x: 6, y: 5 }] });
    let leaked = 0;
    for (let i = 0; i < 40; i++) if (B().namedLine()) leaked++;
    t.eq(leaked, 0, 'no named line without its hero in the fight');
    const reg = B().NAMED.filter(function (p) { return !!DD.getHero(p[0]); }).map(function (p) { return p[1]; });
    t.eq(DD.Act.partyLines(reg).length, 0, 'the party filter drops every named bark of a registered hero here (' + reg.length + ' registered)');
    // the DM's tip once, in round 1
    startFight(6);
    aiOff();
    play(); play();
    t.eq(logCount(/^DM \(whispering\): "(Plants burn|Make it mow)/), 1, 'the DM whispers one tip, once');
  });

  // ---- the sprites and props ---------------------------------------------------------------------------------------------------
  T.suite('boss_gardener: sprites and props — the Gardener (both modes, every pose), the vine, gourd, drum and gnome at five yaws', function (t) {
    if (!ready(t)) return;
    if (!DD.Sprites || !DD.Iso || typeof document === 'undefined') { t.skip('no renderer'); return; }
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const ctx = c.getContext('2d');
    const spec = DD.getEnemy(GARD).sprite, vspec = DD.getEnemy(VINE).sprite;
    const p0 = (DD.problems || []).length;
    const w0 = (DD.errors || []).length;
    arena({ heroes: [{ id: 'test_mage', x: 6, y: 9 }], enemies: [{ id: GARD, x: 6, y: 5 }] });
    const g = gard();
    const v = spawnVine(3, 3);
    let n = 0;
    [0, 90, 180, 270, 37.5].forEach(function (yaw) {
      DD.Iso.withYaw(yaw, function () {
        [1, 2].forEach(function (phase) {
          D(g).phase = phase;
          ['idle', 'cast', 'attack', 'hurt'].forEach(function (pose) {
            [0, 0.7, 2.3].forEach(function (tt) {
              ctx.clearRect(0, 0, 256, 256);
              DD.Sprites.draw(ctx, spec, 128, 220, 1, { t: tt, pose: pose, unit: g, facing: tt > 1 ? -1 : 1 });
              DD.Sprites.draw(ctx, vspec, 60, 220, 1, { t: tt, pose: pose, unit: v, facing: tt > 1 ? -1 : 1 });
              n++;
            });
          });
        });
        const gp = DD.Iso.painter(ctx, { t: 1.3, yawAware: false });
        ['gard_gourd', 'gard_drum', 'gard_gnome'].forEach(function (id) { gp.t = 1.3; DD.getObject(id).draw(gp, { id: id, hp: 3, maxHp: 4, data: {} }, 1.3); });
      });
    });
    D(g).phase = 1;
    t.ok(n === 5 * 2 * 4 * 3, n + ' sprite draws');
    t.eq((DD.problems || []).length - p0, 0, 'no sprite problems');
    t.eq((DD.errors || []).length - w0, 0, 'no swallowed painter errors');
    let px = 0;
    const data = ctx.getImageData(0, 0, 256, 256).data;
    for (let i = 3; i < data.length; i += 4) if (data[i]) px++;
    t.ok(px > 100, 'something was painted (' + px + ' px)');
    if (DD.Sprites.bounds) {
      const bd = DD.Sprites.bounds(GARD), dec = spec.bounds, k = spec.scale;
      t.ok(!!bd && bd.l >= dec.l * k - 2 && bd.r <= dec.r * k + 2 && bd.t >= dec.t * k - 2 && bd.b <= dec.b * k + 2,
        'the painted extent fits the declared bounds (' + JSON.stringify(bd) + ' within ' + JSON.stringify(dec) + ' × ' + k + ')');
      const vb = DD.Sprites.bounds(VINE), vd = vspec.bounds, vk = vspec.scale;
      t.ok(!!vb && vb.l >= vd.l * vk - 2 && vb.r <= vd.r * vk + 2 && vb.t >= vd.t * vk - 2, 'the vine fits its bounds (' + JSON.stringify(vb) + ')');
    }
    t.ok(!DD.Sprites.portrait || !!DD.Sprites.portrait(GARD, 64), 'a portrait');
  });

  // ---- robustness ---------------------------------------------------------------------------------------------------------------
  T.suite('boss_gardener: robustness — alone it acts, previews leave no trace, a whole fight under the area watch', function (t) {
    if (!ready(t)) return;
    DD.Combat.sandbox({ w: 11, h: 11, seed: 4, cameo: false, objective: { type: 'custom' }, encounter: { id: 'gard_alone', checkObjective: function () { return null; } },
      heroes: PARTY.map(function (h, i) { return { id: h, x: 1 + (i % 2), y: 3 + i, level: 4 }; }), enemies: [{ id: GARD, x: 7, y: 5 }] });
    let used = 0;
    const g0 = gard();
    DD.Act.addRule({ id: 'test_gard_used', name: 'used', silent: true, hooks: { onSkillUsed: function (ctx) { if (ctx.user === g0) used++; } } });
    for (let r = 0; r < 3 && !S().result; r++) act(function () { DD.Combat.endRound(); });
    DD.Act.removeRule('test_gard_used');
    t.ok(used > 0, 'alone in a bare sandbox it acts (' + used + ' skills in 3 rounds)');
    // previews of hits on it (across the Overgrowth threshold, next to a drum) leave the fight untouched
    const fp = T.contentHelpers && T.contentHelpers.fingerprint;
    const s = startFight(9);
    aiOff();
    const g = gard();
    const m = s.units.filter(function (u) { return u.defId === 'test_mage'; })[0];
    const kn = s.units.filter(function (u) { return u.defId === 'test_knight'; })[0];
    put(kn, 7, 2);
    put(m, 7, 5);
    g.hp = 152;
    const snap = fp ? fp(s) : JSON.stringify(g.data);
    DD.Targeting.preview(kn, kn.basic, { x: g.x, y: g.y });
    DD.Targeting.preview(m, m.basic, { x: g.x, y: g.y });
    t.eq(fp ? fp(s) : JSON.stringify(g.data), snap, 'previews change nothing (the phase, the stats)');
    t.eq(D(g).phase, 1, 'still phase 1');
    // a full fight under the content suite's area watch: every hit inside its marked tiles / area
    const watch = T.contentHelpers && T.contentHelpers.watchAreas;
    if (!watch) { t.log('content_tests helpers not loaded: the area watch is skipped'); return; }
    let res = null;
    const w = watch(function (ww) {
      startFight(11, { real: true });
      ww.arm();
      res = DD.AutoPlay.runBattle(40);
    });
    w.violations.forEach(function (v) { t.fail(v); });
    t.ok(w.actions > 0, w.actions + ' actions watched (' + w.windups + ' wind-ups), ' + (res && res.result) + ' in ' + (res && res.rounds) + ' rounds');
  });

  // ---- AutoPlay battles --------------------------------------------------------------------------------------------------
  T.suite('boss_gardener: AutoPlay battles (fixture party; real=1: random real parties at L5 against the plan\'s band)', function (t) {
    if (!ready(t)) return;
    const real = t.param('real', '0') === '1';
    const pool = Object.keys(DD.defs.heroes).filter(function (id) { return !/^test_/.test(id); });
    if (real && pool.length < 4) { t.skip('real=1 needs the hero files (isolate=gardener,heroes)'); return; }
    const n = Math.max(1, +(t.param('n', real ? 20 : 2)) || 1);
    const level = +(t.param('level', LV)) || LV;
    const rng = DD.RNG('gard-sims:' + t.seed);
    let wins = 0, rounds = 0, timeouts = 0, downs = 0, p2 = 0;
    const eng = {};
    const taken = {};
    // tuning probes (BAL): hpx=<HP factor>, knobs=key:value,… (DD.Gardener.N), cameo=1 (the real start cameo)
    const def = DD.getEnemy(GARD), hp0 = def.hp, savedN = JSON.parse(JSON.stringify(B().N));
    const hpx = +(t.param('hpx', 1)) || 1;
    def.hp = Math.round(hp0 * hpx);
    String(t.param('knobs', '')).split(',').filter(Boolean).forEach(function (kv) { const p = kv.split(':'); if (p[0] in B().N && typeof B().N[p[0]] === 'number') B().N[p[0]] = +p[1]; });
    // lv=skill.key:value,… (a skill's numbers at every level, e.g. gard_shears.dmg:14)
    const savedLv = [];
    String(t.param('lv', '')).split(',').filter(Boolean).forEach(function (kv) {
      const p = kv.split(':'), q = p[0].split('.'), sd = DD.getSkill(q[0]);
      if (!sd) return;
      sd.levels.forEach(function (L) { if (q[1] in L) { savedLv.push([L, q[1], L[q[1]]]); L[q[1]] = +p[1]; } });
    });
    // replay one fight of a batch: only=<index> (the party draws still happen, so #i is the same fight); trace=1 logs
    // its rounds (the Gardener's HP, plants, heroes up), tracelog=<round> the combat log from that round on
    const only = t.param('only', '') === '' ? -1 : +t.param('only');
    const fought = only >= 0 ? 1 : n;
    try {
      for (let i = 0; i < n; i++) {
        // party=a,b,c,d pins the party (the draw still happens, so the fights keep their seeds)
        const drawn = real ? rng.sample(pool, 4) : PARTY;
        const ids = t.param('party', '') ? String(t.param('party')).split(',') : drawn;
        if (only >= 0 && i !== only) continue;
        const s = bareRows(real, function () { return startFight('sim' + i, { real: true, level: level, ids: ids, cameo: t.param('cameo', '0') === '1' }); });
        if (t.param('trace', '0') === '1') {
          let traced = 0, seen = null;
          DD.Act.addRule({ id: 'test_gard_trace', name: 'trace', silent: true, hooks: { onRoundStart: function () {
            if (DD.Act.simulating || traced === s.round) return;
            traced = s.round;
            const from = +t.param('tracelog', 999);
            if (s.round > from) s.log.slice(s.log.indexOf(seen) + 1).forEach(function (l) { t.log('      ' + l.text); });
            seen = s.log[s.log.length - 1];
            const g = B().findGard(s), up = s.units.filter(function (u) { return u.kind === 'hero' && !u.dead && !u.downed; });
            t.log('  r' + s.round + ': Gardener ' + (g ? g.hp + '/' + g.maxHp + ' ' + g.x + ',' + g.y : 'dead') + ', plants ' + B().plantCount(s) +
              ' (vines ' + B().vinesOf(s).length + ', gourds ' + B().gourdTiles(s).length + '), heroes up ' +
              up.map(function (u) { return u.defId + ' ' + u.hp + ' ' + u.x + ',' + u.y; }).join(' | '));
          } } });
        }
        DD.Act.addRule({ id: 'test_gard_diag', name: 'diag', silent: true, hooks: {
          onTakeDamage: function (d) {
            if (!d.target || DD.Act.simulating || d.target.kind !== 'hero') return;
            const k = d.skill ? d.skill.id : d.cause;
            taken[k] = (taken[k] || 0) + (d.dealt || 0);
          },
        } });
        const res = DD.AutoPlay.runBattle(40);
        rounds += res.rounds;
        if (res.result === 'victory') wins++;
        if (res.timeout) timeouts++;
        downs += s.stats.downs || 0;
        const st = B().stats(s) || {};
        Object.keys(st).forEach(function (k) { if (k !== 'phase' && k !== 'overgrowth') eng[k] = (eng[k] || 0) + (st[k] || 0); });
        if (st.phase === 2) p2++;
        if (t.param('fights')) t.log('#' + i + ' ' + ids.join(',') + ': ' + res.result + ' in ' + res.rounds + ' rounds, ' + JSON.stringify(st));
      }
    } finally {
      def.hp = hp0;
      Object.keys(savedN).forEach(function (k) { B().N[k] = savedN[k]; });
      savedLv.forEach(function (x) { x[0][x[1]] = x[2]; });
    }
    if (hpx !== 1 || t.param('knobs') || t.param('lv')) t.log('probe: hpx ' + hpx + ', knobs ' + t.param('knobs', '-') + ', lv ' + t.param('lv', '-'));
    const pct = Math.round(100 * wins / fought);
    const per = function (o) { const r = {}; Object.keys(o).sort(function (a, b) { return o[b] - o[a]; }).forEach(function (k) { r[k] = Math.round(10 * o[k] / fought) / 10; }); return JSON.stringify(r); };
    t.log('The Gardener at L' + level + ' (' + (real ? 'random real parties' : 'fixture party') + '): won ' + wins + '/' + fought + ' (' + pct + '%), avg rounds ' +
      (rounds / fought).toFixed(1) + ', downs ' + (downs / fought).toFixed(2) + ', Overgrowth reached ' + p2 + ', timeouts ' + timeouts);
    t.log('engagement per fight: ' + per(eng));
    t.log('damage to heroes by source per fight: ' + per(taken));
    t.eq(timeouts, 0, 'no timeouts');
    if (!real || only >= 0) return;
    t.ok(pct >= 45 && pct <= 90, 'author band (plan §7.1: 63-74% at L5; this check 45-90%): ' + pct + '%');
    t.ok((eng.vinesKilled || 0) + (eng.gourdsPopped || 0) > 0 && (eng.mows || 0) > 0, 'the puzzle happens (vines weeded ' + (eng.vinesKilled || 0) + ', gourds popped ' +
      (eng.gourdsPopped || 0) + ', mows ' + (eng.mows || 0) + ', jams ' + (eng.jams || 0) + ', drums ' + (eng.drums || 0) + ')');
  });

  // ---- review (V3) ---------------------------------------------------------------------------------------------------------
  T.suite('boss_gardener: review (V3) — the live texts (one plant "heals"), weeding counts only the party\'s kills, a Rooted hero can\'t be swapped', function (t) {
    if (!ready(t)) return;
    const s = startFight(31);
    aiOff();
    const g = gard();
    // the objective's subtitle agrees in number
    act(function () { DD.Act.placeObject(3, 9, 'gard_gourd'); B().updateFlavor(g); });
    t.ok(/^Weed it: 1 plant heals it 4 a turn\./.test(s.objective.flavor), 'one plant heals it ("' + s.objective.flavor + '")');
    act(function () { DD.Act.placeObject(10, 9, 'gard_gourd'); B().updateFlavor(g); });
    t.ok(/^Weed it: 2 plants heal it 8 a turn\./.test(s.objective.flavor), 'two plants heal it ("' + s.objective.flavor + '")');
    // no gnomes left: the line points at the drums only while one stands
    const tilesOf = function (id) { return S().grid.tiles.filter(function (x) { return x.obj && x.obj.id === id; }); };
    act(function () { tilesOf('gard_gnome').forEach(function (x) { DD.Act.removeObject(x.x, x.y); }); B().updateFlavor(g); });
    t.ok(/No gnomes left: set off a Weed-B-Gone drum next to it \(Corroded\)\.$/.test(s.objective.flavor), 'no gnomes: the drums ("' + s.objective.flavor + '")');
    act(function () { tilesOf('gard_drum').forEach(function (x) { DD.Act.removeObject(x.x, x.y); }); B().updateFlavor(g); });
    t.ok(/No gnomes and no drums left: burn the garden\.$/.test(s.objective.flavor), 'no drums either: fire ("' + s.objective.flavor + '")');
    // stats.vinesKilled is the party's weeding (the sims' engagement column): its own mow mulching a vine is not weeding
    arena({ heroes: [{ id: 'test_knight', x: 1, y: 11 }, { id: 'test_mage', x: 0, y: 11 }], enemies: [{ id: GARD, x: 5, y: 5 }] });
    const g2 = gard(), kn = hero('test_knight');
    const v1 = spawnVine(5, 6), v2 = spawnVine(8, 8);
    act(function () { DD.Act.damage(g2, v1, 99, { cause: 'skill' }); });
    t.ok(v1.dead && D(g2).stats.vinesKilled === 0, 'a vine the Gardener kills itself is not counted (' + D(g2).stats.vinesKilled + ')');
    act(function () { DD.Act.damage(kn, v2, 99, { cause: 'skill' }); });
    t.ok(v2.dead && D(g2).stats.vinesKilled === 1, 'a vine a hero kills is (' + D(g2).stats.vinesKilled + ')');
    // plan §3.0.4: a Rooted hero can't be swapped out (the wf11 exclusion), and the vine's line says so
    arena({ heroes: [{ id: 'test_knight', x: 3, y: 5 }, { id: 'test_mage', x: 3, y: 6 }], enemies: [{ id: GARD, x: 10, y: 10 }] });
    const k3 = hero('test_knight'), m3 = hero('test_mage');
    act(function () { DD.Combat.giveTurnTo(m3); DD.Act.addStatus(k3, 'root', { turns: 1 }, null); });
    t.ok(!DD.Combat.swap(m3, k3.x, k3.y) && m3.y === 6 && k3.y === 5, 'the swap with a Rooted ally is refused');
    t.ok(/A Rooted hero can't move or be swapped: pull or teleport that hero out\./.test(DD.getEnemy(VINE).passive.desc), 'the Strangler Vine\'s line says so');
  });

  T.suite('boss_gardener: review (V3) — a mow that moved with it (pushed to the edge, into a pillar) or Dazzled / Confused lands clean, only on its marks', function (t) {
    if (!ready(t)) return;
    const before = DD.problems.length;
    // pushed after the wind-up: the lane (anchored on it) now runs off the board's east edge and into a pillar
    arena({ heroes: [{ id: 'test_knight', x: 5, y: 9 }, { id: 'test_mage', x: 11, y: 9 }, { id: 'test_rogue', x: 0, y: 0 }],
      enemies: [{ id: GARD, x: 5, y: 5 }], objects: [{ x: 11, y: 8, id: 'pillar' }] });
    aiOff();
    const g = gard(), mg = hero('test_mage');
    bare(mg);
    mg.maxHp = mg.hp = 100;
    act(function () { B().windMow(g, B().laneOf(g, S_)); });
    t.ok(put(g, 11, 5), 'pushed east to the board edge after it wound up');
    const marked = DD.AI.intentTiles(g, windup(g, 'gard_mow')).map(key);
    t.ok(marked.every(function (k) { const p = k.split(','); return DD.Grid.inBounds(+p[0], +p[1]); }), 'the marks stay on the board (' + marked.length + ' tiles)');
    const at = [];
    DD.Act.addRule({ id: 'test_gard_at', name: 'at', silent: true, hooks: { onTakeDamage: function (d) {
      if (!DD.Act.simulating && d.skill && d.skill.id === 'gard_mow' && d.target !== g) at.push({ target: d.target, at: key(d.target) });
    } } });
    try { play(); } finally { DD.Act.removeRule('test_gard_at'); }
    t.ok(at.every(function (x) { return marked.indexOf(x.at) >= 0; }), 'every blade hit is on its marks (' + at.map(function (x) { return x.at; }).join(' ') + ')');
    t.ok(at.some(function (x) { return x.target === mg; }), 'the mage in the moved lane is hit');
    t.ok(g.y < 8, 'the charge stops before the pillar (' + key(g) + ')');
    // Dazzled (the whole lane one tile off) and Confused (a quarter turn): the landing follows the marks it shows
    ['dazzled', 'confused'].forEach(function (st) {
      arena({ heroes: [{ id: 'test_knight', x: 5, y: 8 }, { id: 'test_mage', x: 6, y: 8 }, { id: 'test_cleric', x: 8, y: 5 }, { id: 'test_rogue', x: 2, y: 5 }],
        enemies: [{ id: GARD, x: 5, y: 5 }] });
      aiOff();
      const g2 = gard();
      S().units.forEach(function (u) { if (u.kind === 'hero') { bare(u); u.maxHp = u.hp = 100; } });
      act(function () { B().windMow(g2, B().laneOf(g2, S_)); DD.Act.addStatus(g2, st, { turns: 3 }, hero('test_rogue')); });
      const it = windup(g2, 'gard_mow');
      const shown = DD.AI.intentTiles(g2, it).map(key);
      const blades = [];
      DD.Act.addRule({ id: 'test_gard_at', name: 'at', silent: true, hooks: { onTakeDamage: function (d) {
        if (!DD.Act.simulating && d.skill && d.skill.id === 'gard_mow' && d.target !== g2) blades.push({ target: d.target, at: key(d.target) });
      } } });
      try { play(); } finally { DD.Act.removeRule('test_gard_at'); }
      t.ok(blades.length > 0 && blades.every(function (x) { return shown.indexOf(x.at) >= 0; }),
        st + ': every blade hit is on the marks it showed (' + blades.map(function (x) { return x.target.defId; }).join(',') + ')');
    });
    t.eq(DD.problems.slice(before).filter(function (w) { return /^Error in/.test(w); }).length, 0, 'no swallowed errors');
  });

  T.suite('boss_gardener: review (V3) — Benedick\'s Snail Slime never stops the Gardener (boss tier); a vine is immovable anyway', function (t) {
    if (!ready(t)) return;
    const slime = DD.getSurface && DD.getSurface('ben_slime');
    if (!DD.getHero('benedick') || !slime) { t.skip('Benedick (js/data/heroes/benedick.js) not loaded'); return; }
    arena({ heroes: [{ id: 'benedick', x: 0, y: 11 }], enemies: [{ id: GARD, x: 2, y: 5 }] });
    const g = gard(), ben = hero('benedick');
    act(function () { [3, 4].forEach(function (x) { DD.Act.setSurface(x, 5, slime.id, 3); DD.Grid.tile(x, 5).surface.data = { src: ben.id }; }); });
    const sn = DD.Grid.snagAt(3, 5, g);
    t.ok(!sn || !sn.stops, 'the slime is no snag for a boss (' + JSON.stringify(sn) + ')');
    const r = DD.Grid.reachable(g, 4, { aoo: true });
    const e55 = r.get('5,5');
    t.ok(!!e55 && e55.path.some(function (p) { return p.x === 4 && p.y === 5; }), 'its walk plan runs straight across the slime to (5,5)');
    act(function () { DD.Act.moveAlong(g, [{ x: 3, y: 5 }, { x: 4, y: 5 }, { x: 5, y: 5 }], { action: false }); });
    t.ok(g.x === 5 && g.y === 5, 'it walks across the slime without stopping (' + key(g) + ')');
  });

  /**
   * Review (V3, Nov 15): whole fights of the real door through the real path (deployment, initiative, Svammiel's start
   * cameo and its cheat), real heroes (Benedick in the first party once he has landed), every enemy action under the
   * content suite's area watch. rn=<fights> (default 2), rdiff=<difficulty>.
   */
  T.suite('boss_gardener: review (V3) — real parties (Benedick in one), the start cameo on: every hit inside its marked tiles, the fight ends', function (t) {
    if (!ready(t)) return;
    const watch = T.contentHelpers && T.contentHelpers.watchAreas;
    const pool = Object.keys(DD.defs.heroes).filter(function (id) { return !/^test_/.test(id); });
    if (!watch || pool.length < 4) { t.skip('needs the hero files and content_tests.js (a full run)'); return; }
    const n = Math.max(1, +(t.param('rn', 2)) || 1);
    const rng = DD.RNG('gard-review:' + t.seed);
    let ended = 0;
    for (let i = 0; i < n; i++) {
      const ids = rng.sample(pool, 4);
      if (i === 0 && DD.getHero('benedick') && ids.indexOf('benedick') < 0) ids[0] = 'benedick';
      let res = null, s = null;
      const w = watch(function (ww) {
        s = startFight('review' + i, { real: true, level: 5, ids: ids, cameo: true, diff: t.param('rdiff', 'normal') });
        ww.arm();
        res = DD.AutoPlay.runBattle(40);
      });
      w.violations.forEach(function (v) { t.fail('#' + i + ' ' + ids.join(',') + ': ' + v); });
      if (res && res.result) ended++;
      t.log('#' + i + ' ' + ids.join(',') + ': ' + (res && res.result) + ' in ' + (res && res.rounds) + ' rounds, ' + w.actions + ' enemy actions (' + w.windups +
        ' wind-ups) watched, cheats ' + ((s && s.stats && s.stats.cheats) || 0));
    }
    t.eq(ended, n, 'every fight ends (no timeout)');
  });

  // ---- QA voice-3 (Nov 17): no line writes the party's size (a party that lost a hero hears it too) ----------------------
  T.suite('boss_gardener: QA voice-3 — no act-4 bark or narration counts the heroes', function (t) {
    const COUNT = /\b(one|two|three|four|five|six|seven|\d+) (weeds?|heroes|adventurers|pests|intruders|of you|players|mortals)\b/i;
    const bad = [];
    Object.keys(DD.defs.enemies).forEach(function (id) {
      const d = DD.defs.enemies[id];
      if (!/^(gard|lg|gal|cov|rap|svam)_/.test(id) || !d.barks) return;
      Object.keys(d.barks).forEach(function (k) { (d.barks[k] || []).forEach(function (l) { if (COUNT.test(l)) bad.push(id + '.' + k + ': ' + l); }); });
    });
    Object.keys(DD.defs.narration).forEach(function (k) {
      if (!/^(gard|league|galbraith|coven|goats|rap|svam)_/.test(k)) return;
      (DD.defs.narration[k] || []).forEach(function (l) { if (COUNT.test(l)) bad.push(k + ': ' + l); });
    });
    t.eq(bad.join(' | '), '', 'no "four weeds" (the Gardener\'s scan says "Weeds detected.")');
    const g = DD.getEnemy('gard_gardener');
    if (g) t.ok(g.barks.spawn.indexOf('[SCANNING] Weeds detected. Scheduling removal.') >= 0, 'the scan line');
  });
})();
