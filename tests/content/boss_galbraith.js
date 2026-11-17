/* Dungeons and Degenerates — tests/content/boss_galbraith.js
 * Suites "boss_galbraith: …" for js/data/bosses/galbraith.js (GRAND MAGISTER GALBRAITH, encounter boss_galbraith, plan
 * .tmp/v3/design.md §3.3 / §5.3 / §6.2): the registry and the encounter, the observatory, every skill against its desc
 * (and the fight-scaled numbers), the spell slots (costs, crystals, the Intermission), the Counterspell (once a round,
 * spells only, sight + 6, a whole resolution, debuffs, previews / estimates / object hits), Galbraith's Contingency, his
 * turn (teleport, wall, chain, ray, the wind-ups, the Power Word fizzle), the Encore (phase 2), Focus Crystals, the
 * cameo cheat That's a 1 Now (needs svammiel.js), the voice, the sprite at five yaws, robustness and AutoPlay battles
 * (real=1: random real parties at L5.5 against the plan's band). Works isolated (&isolate=galbraith): the fixture heroes
 * stand in for the party.
 */
(function () {
  'use strict';
  const T = window.DD_TEST;
  const DD = window.DD;
  if (!T || !DD) return;
  const PARTY = ['test_knight', 'test_cleric', 'test_mage', 'test_rogue'];
  const ENC = 'boss_galbraith', GAL = 'gal_galbraith';
  const LV = 5.5;

  // ---- helpers --------------------------------------------------------------------------------------------------
  function B() { return DD.Galbraith; }
  function S() { return DD.Combat.state; }
  function ready(t) {
    if (!DD.Galbraith || !DD.getEncounter(ENC)) { t.skip('js/data/bosses/galbraith.js not loaded'); return false; }
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
    const setup = DD.Encounter.build(ENC, partyAt(opts.level || LV, opts.ids), { rng: DD.RNG('gal:' + seed), difficulty: diff, act: 4 });
    const o = { seed: seed, headless: true, difficulty: diff, kind: 'boss' };
    if (!opts.cameo) o.cameo = false;
    if (!opts.real) { o.sandbox = true; o.initiative = 'heroesFirst'; }
    return DD.Combat.start(setup, o);
  }
  /** A small scripted arena: heroes and Galbraith at fixed tiles. ai: true lets him act on giveTurnTo. */
  function arena(cfg, ai) {
    const c = Object.assign({ w: 13, h: 13, seed: 7, noPlan: !ai, cameo: false, floor: 'marble' }, cfg);
    if (!ai) c.enemyAi = false;
    return DD.Combat.sandbox(c);
  }
  function unit(defId) { return S().units.filter(function (u) { return u.defId === defId && !u.dead; })[0]; }
  function gal() { return unit(GAL); }
  function put(u, x, y) { return u.x === x && u.y === y ? true : DD.Act.teleport(u, x, y, { noEnter: true, fx: false }); }
  function has(u, id) { return DD.Act.hasStatus(u, id); }
  function key(p) { return p.x + ',' + p.y; }
  function dist(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }
  function bare(u) { u.armor = 0; u.block = 0; }
  function D(u) { return B().boss(u || gal()); }
  /** Damage records (target, base, dealt, element, cause, skill) while fn runs. */
  function hits(fn) {
    const out = [];
    DD.Act.addRule({ id: 'test_gal_hits', name: 'Test hits', silent: true, hooks: { onTakeDamage: function (d) {
      if (DD.Act.simulating) return;
      out.push({ target: d.target, base: d.base, dealt: d.dealt, element: d.element, cause: d.cause, skill: d.skill ? d.skill.id : null });
    } } });
    try { fn(); } finally { DD.Act.removeRule('test_gal_hits'); }
    out.of = function (u) { return out.filter(function (h) { return h.target === u; }); };
    return out;
  }
  function windup(u, id) { return (u.intents || []).filter(function (i) { return i.skillId === id; })[0] || null; }
  /** His turn now (sandbox giveTurnTo: the start-of-turn ticks, his planner unless the AI is off), then on to the next round. */
  function turn(u) { return act(function () { return DD.Combat.giveTurnTo(u); }); }
  /** The heroes pass: his natural turn of this round plays (wind-ups land at its start), back at the next hero turn. */
  function play() { return act(function () { return DD.Combat.endRound(); }); }
  function useNow(u, id, target, opts) { return act(function () { return DD.AI.useNow(u, id, target, opts); }); }
  function logHas(re) { return S().log.some(function (l) { return re.test(l.text); }); }
  function logCount(re) { return S().log.filter(function (l) { return re.test(l.text); }).length; }
  function hero(defId) { return S().units.filter(function (u) { return u.defId === defId; })[0]; }
  /** Every enemy turn passes (the heroes act by hand): sandbox AI off for the current fight. */
  function aiOff() { S().aiOff = true; }
  function aiOn() { S().aiOff = false; S().noActFirst = false; }
  function sentences(s) { return String(s).split(/(?<=[.!?…])\s+|\n/); }
  /** Cast a spell resolution by hand: fn runs inside a resolution of `def` by `caster` (the engine's skill stack). */
  function inResolution(caster, def, fn) {
    const ctx = { user: caster, skill: def };
    DD.Act.beginSkill(caster, def, ctx);
    try { return fn(ctx); } finally { DD.Act.endSkill(); }
  }

  // ---- registry and the encounter ------------------------------------------------------------------------------------
  T.suite('boss_galbraith: registry — Galbraith, his skills, statuses, objects and the encounter', function (t) {
    if (!ready(t)) return;
    const d = DD.getEnemy(GAL);
    t.eq(d.name, 'Grand Magister Galbraith', 'unit name');
    t.ok(d.act === 4 && d.tier === 'boss' && d.boss && d.boss.mini === true, 'an act-4 solo mini-boss (tier boss, boss.mini)');
    t.eq(d.pronoun, 'he', 'pronoun he (the user: "Grand Magister male")');
    t.eq(d.boss.title, 'Namesake of Every Spell', 'boss.title (V §8.3)');
    t.ok(/Behold! Galbraith's Grand Spectacular! Please hold your applause until you are dead\./.test(d.boss.intro), 'boss.intro (V §8.3)');
    t.eq(d.boss.sting, 'grand_spell', 'sting grand_spell (V §12)');
    t.ok(d.hp === B().N.hp && d.hp >= 300 && d.hp <= 340, 'HP ' + d.hp + ' (plan §3.0.5 solo band 300-340; DD.Galbraith.N.hp)');
    t.ok(d.mov === 3 && d.armor === 0 && d.init === 3, 'move 3, armor 0, init +3');
    t.ok(d.flags.flying === true && d.flags.large === true && d.flags.immune.indexOf('sleep') >= 0, 'flying, large, immune to sleep');
    t.ok(d.resist.poison === 0 && d.resist.frost === 0.5, 'poison ×0, frost ×0.5');
    t.ok(typeof d.ai === 'function' && !!d.passive && typeof d.passive.desc === 'function', 'a custom planner and a live passive line');
    t.eq(JSON.stringify(d.skills), JSON.stringify(['gal_ray', 'gal_chain', 'gal_wall']), 'his slots: the at-once kit (wind-ups are scripted)');
    t.ok(/if it has an apostrophe, it is his/.test(d.desc), 'codex desc (V §8.3)');
    // the skills
    Object.keys(B().SK).forEach(function (k) {
      const s = DD.getSkill(B().SK[k]);
      if (!t.ok(!!s && s.owner === 'enemy', B().SK[k] + ': an enemy skill')) return;
      t.ok(/^Galbraith's /.test(s.name), s.id + ': a possessive name ("' + s.name + '")');
      t.eq(s.kind, k === 'rest' ? 'utility' : 'spell', s.id + ': kind');
    });
    ['gal_meteor', 'gal_pw', 'gal_finale'].forEach(function (id) { t.ok(DD.getSkill(id).windupOnly === true, id + ': wind-up only'); });
    t.ok(DD.getSkill('gal_chain').cooldown === 1 && DD.getSkill('gal_wall').cooldown === 3, 'Chain cd 1, Wall cd 3');
    // statuses
    const sl = DD.getStatus('gal_slots'), rs = DD.getStatus('gal_resting'), ov = DD.getStatus('gal_overchannel');
    t.ok(sl && sl.type === 'buff' && sl.decay === 'never' && sl.icon === '🔮', 'Spell Slots: a 🔮 buff that never decays');
    t.eq(sl.desc({ stacks: 4 }), 'Spell slots: 4 of 9. Each spell costs slots; a turn that starts at 2 or fewer is spent resting.', 'Spell Slots desc (plan §3.3)');
    t.ok(rs && rs.takenMult === 1.5 && ov && ov.takenMult === 1.5, 'Intermission and Overchannelling: +50% damage taken (takenMult)');
    t.eq(ov.desc(), '+50% damage taken. No slots, no Counterspell.', 'Overchannelling desc (plan §3.3)');
    // objects
    const cr = DD.getObject('gal_crystal'), wl = DD.getObject('gal_force_wall');
    t.ok(cr && cr.hp === 15 && cr.targetable === true && cr.blocksMove && !cr.blocksLos, 'Focus Crystal: 15 HP, a target, blocks movement not sight');
    t.ok(/\b15 HP\b/.test(cr.desc) && /any single-target damage skill can break it/.test(cr.desc), 'crystal desc: its HP and D1 (lead patch P2)');
    t.ok(/regains 1 spell slot at the start of each of his turns/.test(cr.desc) && /heals him 8/.test(cr.desc), 'crystal desc: the slot and the Encore heal');
    t.ok(wl && wl.hp === 0 && wl.blocksMove && wl.blocksLos, 'Wall of Force: unbreakable, blocks movement and sight');
    // the encounter
    const e = DD.getEncounter(ENC);
    t.eq(e.name, 'Galbraith\'s Grand Observatory', 'encounter name (the possessive is the point)');
    t.ok(e.act === 4 && e.kind === 'boss' && e.weight === 0, 'act 4, a boss fight, weight 0 (only the gauntlet places it)');
    t.ok(e.gauntlet && e.gauntlet.lane === 'galbraith' && e.gauntlet.order === 3, 'gauntlet lane galbraith, order 3');
    t.eq(e.gauntlet.hint, 'Counters one spell a round: steel and arrows go through.', 'the map hint (plan §2.2)');
    t.ok(e.shortName === 'Galbraith' && e.shortName.length <= 24 && e.icon === '🔭' && e.banner === false, 'shortName, icon 🔭, banner false');
    t.ok(e.cameo && e.cameo.start === 'svam_cameo_galbraith' && e.cameo.cheat === 'svam_cameo_one' && e.cameo.interjections === true,
      'cameo: announcer svam_cameo_galbraith, the cheat That\'s a 1 Now (plan §3.0.2)');
    t.ok(e.objective.type === 'boss' && /Counterspell/.test(e.objective.flavor), 'a boss objective with the Counterspell hint');
    t.ok(e.reward && e.reward.goldMult === 0.9 && e.reward.itemRarity === 'rare', 'reward: a guaranteed rare, boss gold × 0.9 (lead patch P5)');
    t.eq(e.map.theme, 'a4_observatory', 'theme a4_observatory');
    t.ok(/lich at the telescope, naming every constellation after himself/.test(e.intro), 'encounter intro (V §8.3)');
  });

  // ---- the arena ---------------------------------------------------------------------------------------------------
  T.suite('boss_galbraith: the observatory — layout, void, crystals on pedestals, orrery columns, deploy, rule and slots at start', function (t) {
    if (!ready(t)) return;
    const s = startFight(1);
    t.ok(s.grid.w === 13 && s.grid.h === 13, '13 × 13');
    const g = gal();
    t.ok(!!g && g.x === 6 && g.y === 5, 'Galbraith on his sigil at (6,5)');
    t.eq(DD.Grid.tile(6, 5).t, 'gal_sigil', 'the sigil floor');
    [[6, 1], [0, 6], [12, 6]].forEach(function (p) {
      const tl = DD.Grid.tile(p[0], p[1]);
      t.ok(tl.obj && tl.obj.id === 'gal_crystal' && tl.obj.hp === 15 && tl.h === 2, 'Focus Crystal at (' + p + ') on an h2 pedestal');
      DD.Grid.neighbors(p[0], p[1]).forEach(function (n) { if (!DD.Grid.isPit(n.x, n.y)) t.eq(n.h, 1, 'step next to the pedestal (' + n.x + ',' + n.y + ') is h1'); });
    });
    t.eq(B().crystalsStanding(), 3, 'three crystals standing');
    [[3, 3], [9, 3], [3, 8], [9, 8]].forEach(function (p) { t.ok(DD.Grid.tile(p[0], p[1]).obj && DD.Grid.tile(p[0], p[1]).obj.id === 'pillar', 'orrery column at (' + p + ')'); });
    t.ok(!DD.Grid.los({ x: 3, y: 2 }, { x: 3, y: 4 }), 'a column blocks sight');
    t.ok(DD.Grid.isPit(0, 0) && DD.Grid.isPit(12, 12) && DD.Grid.isPit(0, 2) && !DD.Grid.isPit(0, 4), 'the starry void is a pit (corners and edges)');
    let pits = 0;
    s.grid.tiles.forEach(function (tl) { if (DD.Grid.isPit(tl.x, tl.y)) pits++; });
    t.eq(pits, 36, '36 void tiles (the layout)');
    const heroes = s.units.filter(function (u) { return u.kind === 'hero'; });
    t.ok(heroes.length === 4 && heroes.every(function (h) { return h.y >= 10 && !DD.Grid.isPit(h.x, h.y); }), 'the party deploys on the south rim');
    t.ok(s.rules.some(function (r) { return r.id === 'gal_counterspell' && r.desc === B().COUNTER_DESC; }), 'the Counterspell rule from the start');
    t.eq(B().COUNTER_DESC, 'Once per round, the first hero spell that would damage or debuff Galbraith while he can see its caster within 6 does nothing to him. ' +
      'It costs him 2 slots. Not while he rests or holds fewer than 2 slots.', 'Counterspell desc (plan §3.3)');
    const st = DD.Act.getStatus(g, 'gal_slots');
    t.ok(st && st.stacks === 9 && B().slotsOf(g) === 9, '🔮 9 of 9 slots at the start');
    t.ok(/Counterspell/.test(s.objective.flavor) && /3 left/.test(s.objective.flavor), 'objective flavor: ' + s.objective.flavor);
    t.ok(logHas(/Grand Spectacular/) && logHas(/naming every constellation after himself/), 'his intro and the encounter intro are logged');
    t.eq(s.theme, 'a4_observatory', 'the observatory theme');
  });

  // ---- skills: desc == execute -----------------------------------------------------------------------------------------
  T.suite('boss_galbraith: skills — Frostbite Ray, Chain Lightning, Wall of Force, the teleport, the wind-ups (descs and hits agree)', function (t) {
    if (!ready(t)) return;
    // Frostbite Ray: RAY frost (14 shipped; plan 10, raised for the author band), a foe within 6 he can see; costs nothing
    arena({ heroes: [{ id: 'test_mage', x: 6, y: 10 }], enemies: [{ id: GAL, x: 6, y: 5 }] });
    let g = gal(), m = hero('test_mage');
    const ray = DD.getSkill('gal_ray');
    const RAY = ray.levels[0].dmg, CHAIN = DD.getSkill('gal_chain').levels[0].dmg;
    t.ok(RAY >= 10 && RAY <= 14 && CHAIN >= 10 && CHAIN <= 14, 'ray ' + RAY + ', chain ' + CHAIN + ': inside the solo mini-boss hit band 10-14 (plan §3.0.5)');
    t.eq(DD.skillDesc(ray, 1, g), 'Deal ' + RAY + ' frost damage to a foe within 6 he can see. A cantrip: costs no slots.', 'Frostbite Ray desc (plan §3.3)');
    let h = hits(function () { useNow(g, 'gal_ray', m); });
    t.ok(h.of(m).length === 1 && h.of(m)[0].base === RAY && h.of(m)[0].element === 'frost', 'the ray: ' + RAY + ' frost to the target');
    t.eq(B().slotsOf(g), 9, 'a cantrip: no slots spent');
    const rg = DD.Targeting.range(g, ray, 1);
    t.ok(rg[0] === 1 && rg[1] === 6 && ray.target.los === true, 'range 1-6, needs sight');
    // Chain Lightning: the target + up to 2 more foes within 2 of it (the nearest), 3 slots
    arena({ heroes: [{ id: 'test_knight', x: 6, y: 9 }, { id: 'test_mage', x: 7, y: 9 }, { id: 'test_cleric', x: 6, y: 11 }, { id: 'test_rogue', x: 8, y: 11 }],
      enemies: [{ id: GAL, x: 6, y: 5 }] });
    g = gal();
    const ch = DD.getSkill('gal_chain');
    t.eq(DD.skillDesc(ch, 1, g), 'Spend 3 slots: deal ' + CHAIN + ' lightning damage to a foe within 6 and to up to 2 more foes within 2 of it.', 'Chain desc (plan §3.3)');
    const kn = hero('test_knight');
    const tiles = B().chainTiles(g, kn);
    t.eq(tiles.map(key).join(' '), '6,9 7,9 6,11', 'Chain: the target, then the 2 nearest foes within 2 (the rogue at 3 is left out)');
    h = hits(function () { useNow(g, 'gal_chain', kn); });
    t.ok(h.length === 3 && h.every(function (x) { return x.base === CHAIN && x.element === 'lightning'; }), 'three foes take ' + CHAIN + ' lightning each (' + h.length + ')');
    t.ok(!h.of(hero('test_rogue')).length, 'the rogue (3 away from the target) is not hit');
    t.eq(B().slotsOf(g), 6, 'Chain spends 3 slots');
    t.ok(DD.Combat.slotsOf(g).filter(function (sl) { return sl.id === 'gal_chain'; })[0].cd > 0, 'and goes on cooldown');
    // the slot gate: under 3 slots Chain and the Wall can't be cast (their canUse: threat shading stays honest)
    B().setSlots(g, 2);
    const ctx = DD.Targeting.buildCtx(g, DD.Combat.slotsOf(g)[1], null);
    t.ok(typeof ch.canUse(ctx) === 'string', 'under 3 slots, Chain says no: ' + ch.canUse(ctx));
    // Wall of Force: up to 5 tiles within 4, blocks movement and sight, gone at the end of the next round, 3 slots
    arena({ heroes: [{ id: 'test_knight', x: 6, y: 9 }, { id: 'test_mage', x: 2, y: 12 }], enemies: [{ id: GAL, x: 6, y: 5 }] });
    g = gal();
    const wl = DD.getSkill('gal_wall');
    t.eq(DD.skillDesc(wl, 1, g), 'Spend 3 slots: raise a wall of up to 5 tiles within 4 until the end of the next round. It blocks movement and sight and can\'t be broken.', 'Wall desc');
    const row = [{ x: 4, y: 7 }, { x: 5, y: 7 }, { x: 6, y: 7 }, { x: 7, y: 7 }, { x: 8, y: 7 }];
    useNow(g, 'gal_wall', { x: 6, y: 7 }, { anchor: 'ground', tiles: row });
    t.ok(row.every(function (p) { const o = DD.Grid.tile(p.x, p.y).obj; return o && o.id === 'gal_force_wall'; }), 'five wall tiles');
    t.ok(row.every(function (p) { return dist(p, g) <= 4; }), 'all within 4');
    t.ok(!DD.Grid.los(g, hero('test_knight')) && !DD.Grid.isWalkable(6, 7), 'it blocks sight and movement');
    t.eq(B().slotsOf(g), 6, 'the Wall spends 3 slots');
    act(function () { DD.Combat.endRound(); });
    t.ok(!!DD.Grid.tile(6, 7).obj, 'still up after the round it went up in');
    act(function () { DD.Combat.endRound(); });
    t.ok(!DD.Grid.tile(6, 7).obj && DD.Grid.los(g, hero('test_knight')), 'gone at the end of the next round');
    // the wall planner: 2+ melee heroes within 3 → the row that walls off the most of them
    arena({ heroes: [{ id: 'test_knight', x: 6, y: 8 }, { id: 'test_rogue', x: 5, y: 7 }, { id: 'test_mage', x: 6, y: 12 }], enemies: [{ id: GAL, x: 6, y: 5 }] });
    let plan = B().wallPlan(gal());
    t.ok(!!plan && plan.blocked === 2 && plan.dir.y === 1 && plan.tiles.length >= 3, 'two melee heroes south within 3: a wall to the south (' + (plan && plan.tiles.map(key).join(' ')) + ')');
    arena({ heroes: [{ id: 'test_knight', x: 6, y: 8 }, { id: 'test_mage', x: 5, y: 8 }], enemies: [{ id: GAL, x: 6, y: 5 }] });
    t.eq(B().wallPlan(gal()), null, 'one melee hero: no wall');
    // Mildly Forbidden Teleport: a free floor tile 4-6 from the nearest foe, 1 slot
    arena({ heroes: [{ id: 'test_knight', x: 6, y: 6 }, { id: 'test_mage', x: 6, y: 11 }], enemies: [{ id: GAL, x: 6, y: 5 }] });
    g = gal();
    const bl = DD.getSkill('gal_blink');
    t.ok(/^Spend 1 slot: teleport to a free floor tile at least 4 tiles from every foe \(the nearest within 6\)\./.test(DD.skillDesc(bl, 1, g)), 'teleport desc');
    const spot = B().blinkSpot(g);
    t.ok(!!spot, 'a teleport spot exists');
    useNow(g, 'gal_blink', spot, { anchor: 'ground' });
    const near = Math.min(dist(g, hero('test_knight')), dist(g, hero('test_mage')));
    t.ok(g.x === spot.x && g.y === spot.y && near >= 4 && near <= 6 && !DD.Grid.isPit(g.x, g.y), 'he teleports 4-6 from the nearest foe, onto the floor (' + key(g) + ', ' + near + ')');
    t.eq(B().slotsOf(g), 8, 'it spends 1 slot');
    // the wind-ups' descs
    t.eq(DD.skillDesc(DD.getSkill('gal_meteor'), 1, g), 'Wind-up (5 slots): next turn up to three meteors land, radius 1 around up to 3 heroes: 20 fire damage to each foe in them.', 'Meteoric Displeasure desc');
    t.eq(DD.skillDesc(DD.getSkill('gal_pw'), 1, g), 'Wind-up (4 slots): next turn the marked hero takes 26 damage, if Galbraith can still see that hero within 8 (the mark follows the hero).', 'Power Word desc');
    t.eq(DD.skillDesc(DD.getSkill('gal_finale'), 1, g), 'Wind-up: next turn 20 damage to each foe within 3 of him (the blast moves with him).', 'Grand Finale desc');
    t.ok(/^A turn that starts at 2 or fewer slots he spends resting, and he is back to 9 slots at its end\. Until his next turn starts he takes \+50% damage and can't Counterspell\.$/
      .test(DD.skillDesc(DD.getSkill('gal_rest'), 1, g)), 'Intermission desc (plan §3.3)');
    // P3: the HUD prints the fight's numbers (difficulty ×1.5) and the hits agree
    arena({ heroes: [{ id: 'test_mage', x: 6, y: 9 }, { id: 'test_cleric', x: 9, y: 9 }], enemies: [{ id: GAL, x: 6, y: 5 }], difficulty: { id: 'custom', hp: 1, dmg: 1.5 } });
    g = gal(); m = hero('test_mage');
    const RAYX = Math.round(RAY * 1.5), PWX = Math.round(DD.getSkill('gal_pw').levels[0].dmg * 1.5);
    t.ok(new RegExp('Deal ' + RAYX + ' frost damage').test(DD.AI.skillDesc(ray, 1, g)) && new RegExp('takes ' + PWX + ' damage').test(DD.AI.skillDesc(DD.getSkill('gal_pw'), 1, g)),
      'scaled descs: ray ' + RAYX + ', Power Word ' + PWX);
    h = hits(function () { useNow(g, 'gal_ray', m); });
    t.eq(h.of(m)[0].dealt, RAYX - (m.armor || 0), 'the scaled ray hits for ' + RAYX);
  });

  // ---- the wind-ups ---------------------------------------------------------------------------------------------------
  T.suite('boss_galbraith: wind-ups — Meteoric Displeasure (3 × radius 1, honest), Power Word: Ouch (tracks, lands, fizzles behind a column)', function (t) {
    if (!ready(t)) return;
    // the meteor plan: up to 3 heroes at least 3 apart, the most crowded first
    arena({ heroes: [{ id: 'test_knight', x: 2, y: 9 }, { id: 'test_mage', x: 3, y: 9 }, { id: 'test_cleric', x: 9, y: 9 }, { id: 'test_rogue', x: 6, y: 12 }],
      enemies: [{ id: GAL, x: 6, y: 5 }] }, true);
    let g = gal();
    const plan = B().meteorPlan(g);
    t.ok(plan.centers.length === 3, 'three centres (' + plan.centers.map(key).join(' ') + ')');
    t.ok(plan.centers.every(function (c, i) { return plan.centers.every(function (o, j) { return i === j || dist(c, o) >= 3; }); }), 'at least 3 apart');
    t.ok(key(plan.centers[0]) === '2,9' || key(plan.centers[0]) === '3,9', 'the pair first (most foes within 1)');
    t.ok(plan.tiles.length >= 10 && plan.tiles.every(function (p) { return plan.centers.some(function (c) { return dist(c, p) <= 1; }); }), 'radius 1 around each centre');
    // wound up by his planner: honest number, lands on the marked tiles only
    play();
    let w = windup(g, 'gal_meteor');
    if (!t.ok(!!w, 'his first turn winds up Meteoric Displeasure')) return;
    t.eq(DD.AI.intentDmg(g, w), 20, 'the marked number: 20');
    const marked = DD.AI.intentTiles(g, w).map(key);
    const mk = hero('test_knight');
    const out = S().grid.tiles.filter(function (x) { return DD.Grid.isFree(x.x, x.y) && marked.indexOf(key(x)) < 0 && dist(x, g) > 6; })[0];
    put(mk, out.x, out.y);     // the knight steps out of the red (and out of his reach)
    t.ok(marked.indexOf(key(mk)) < 0, 'the knight steps out of the marked tiles');
    const inRed = S().units.filter(function (u) { return u.kind === 'hero' && !u.downed && marked.indexOf(key(u)) >= 0; });
    const h = hits(play);
    const meteorHits = h.filter(function (x) { return x.skill === 'gal_meteor'; });
    t.ok(meteorHits.length === inRed.length && meteorHits.length >= 2 && meteorHits.every(function (x) { return x.base === 20 && x.element === 'fire'; }),
      'meteors land: 20 fire to each hero in the red (' + meteorHits.length + '/' + inRed.length + ')');
    t.ok(!h.of(mk).some(function (x) { return x.skill === 'gal_meteor'; }), 'nobody off the marked tiles is hit');
    // Power Word: Ouch: the lowest HP + Block he can see within 8, tracks, 26
    arena({ heroes: [{ id: 'test_knight', x: 6, y: 9 }, { id: 'test_mage', x: 8, y: 9 }], enemies: [{ id: GAL, x: 6, y: 5 }] }, true);
    g = gal();
    const mg = hero('test_mage'), kn = hero('test_knight');
    mg.hp = 9;
    t.eq(B().pwTarget(g), mg, 'Power Word targets the weakest hero in sight');
    kn.hp = 5;
    kn.block = 10;
    t.eq(B().pwTarget(g), mg, 'HP + Block counts (the knight\'s Block)');
    mg.hp = 20; kn.hp = kn.maxHp; kn.block = 0;     // the mage survives a ray (14) and stays the weakest
    D(g).nextWind = 'pw';
    play();
    w = windup(g, 'gal_pw');
    if (!t.ok(!!w && w.anchor === 'unit' && w.unitId === mg.id, 'his planner winds up the Power Word on the mage (it tracks)')) return;
    t.eq(DD.AI.intentDmg(g, w), 26, 'the marked number: 26');
    t.eq(B().slotsOf(g), 9 - 4 - (D(g).stats.chains ? 3 : 0), 'the Power Word costs 4 slots');
    mg.hp = mg.maxHp;
    const step = [{ x: mg.x + 1, y: mg.y }, { x: mg.x - 1, y: mg.y }, { x: mg.x, y: mg.y + 1 }].filter(function (p) {
      return DD.Grid.isFree(p.x, p.y) && DD.Grid.los(g, p) && dist(g, p) <= 8;
    })[0];
    put(mg, step.x, step.y);      // it follows the hero
    t.ok(DD.AI.intentTiles(g, w).map(key).indexOf(key(step)) >= 0, 'the mark follows the hero');
    let hh = hits(play);
    t.ok(hh.of(mg).some(function (x) { return x.skill === 'gal_pw' && x.base === 26; }), 'it lands: 26');
    // out of his sight it fizzles (a column between them)
    arena({ heroes: [{ id: 'test_mage', x: 6, y: 9 }], enemies: [{ id: GAL, x: 6, y: 5 }] }, true);
    g = gal();
    const m2 = hero('test_mage');
    D(g).nextWind = 'pw';
    B().setSlots(g, 4);
    play();
    w = windup(g, 'gal_pw');
    if (!t.ok(!!w, 'a Power Word is wound up')) return;
    const dy = g.y <= 6 ? 1 : -1;
    put(m2, g.x, g.y + 3 * dy);
    DD.Act.placeObject(g.x, g.y + 2 * dy, 'pillar');
    t.ok(!DD.Grid.los(g, m2), 'the mage hides behind a column');
    aiOff();
    hh = hits(play);
    t.ok(!hh.of(m2).some(function (x) { return x.skill === 'gal_pw'; }) && !windup(g, 'gal_pw'), 'out of sight, the Power Word fizzles');
    t.ok(logHas(/Lost track of them/), 'logged: "Lost track of them!"');
  });

  // ---- spell slots and the Intermission -----------------------------------------------------------------------------
  T.suite('boss_galbraith: spell slots — crystals refill them, a turn at 2 or fewer is an Intermission (+50%, no counter, back to 9)', function (t) {
    if (!ready(t)) return;
    // regen: +1 per standing crystal at his turn start, max 9
    arena({ heroes: [{ id: 'test_knight', x: 6, y: 11 }], enemies: [{ id: GAL, x: 6, y: 5 }],
      objects: [{ x: 1, y: 6, id: 'gal_crystal' }, { x: 11, y: 6, id: 'gal_crystal' }] });
    let g = gal();
    B().setSlots(g, 5);
    turn(g);            // the AI passes (sandbox AI off): only the turn-start ticks
    t.eq(B().slotsOf(g), 7, 'two crystals: +2 at his turn start (5 → 7)');
    t.eq(DD.Act.getStatus(g, 'gal_slots').stacks, 7, 'the 🔮 status shows it');
    B().setSlots(g, 8);
    act(function () { DD.Combat.endRound(); });
    turn(g);
    t.eq(B().slotsOf(g), 9, 'capped at 9');
    // the Intermission: a turn that starts at 2 or fewer
    arena({ heroes: [{ id: 'test_knight', x: 6, y: 7 }], enemies: [{ id: GAL, x: 6, y: 5 }] }, true);
    g = gal();
    const kn = hero('test_knight');
    B().setSlots(g, 2);
    aiOn();
    const before = S().log.length;
    turn(g);
    t.ok(has(g, 'gal_resting') && D(g).stats.rests === 1, 'at 2 slots he rests the whole turn (Intermission)');
    t.ok(!S().log.slice(before).some(function (l) { return /Frostbite Ray|Teleport|winds up/.test(l.text); }), 'and does nothing else');
    t.eq(B().slotsOf(g), 9, 'back to 9 slots at the end of it');
    t.ok(!B().counterArmed(g), 'no Counterspell while resting (even with 9 slots)');
    bare(g);
    let dealt = 0;
    act(function () { dealt = DD.Act.damage(kn, g, 10, { cause: 'skill' }); });
    t.eq(dealt, 15, '+50% damage taken while resting');
    t.eq(DD.AI.estimate(kn, g, 10, null), 15, 'the estimate knows it (takenMult)');
    t.ok(/INTERMISSION/.test(S().objective.flavor), 'the objective says so: ' + S().objective.flavor);
    act(function () { DD.Combat.endRound(); });
    aiOff();
    turn(g);
    t.ok(!has(g, 'gal_resting'), 'the Intermission ends when his next turn starts');
    t.ok(B().counterArmed(g), 'and the Counterspell is back');
    // with all three crystals and his usual spending he never starts a turn at 2 or fewer
    const N = B().N;
    let slots = N.slots, rested = 0;
    for (let k = 0; k < 12; k++) {
      slots = Math.min(N.slots, slots + 3);
      if (slots <= N.restAt) { rested++; slots = N.slots; continue; }
      if (slots >= N.cost.chain) slots -= N.cost.chain;
      if (slots >= N.cost.meteor) slots -= N.cost.meteor; else if (slots >= N.cost.pw) slots -= N.cost.pw;
    }
    t.eq(rested, 0, 'the slot economy: three crystals, a Chain and a wind-up a turn: he never rests (plan §3.3)');
  });

  // ---- the Counterspell -----------------------------------------------------------------------------------------------
  T.suite('boss_galbraith: Counterspell — once a round, spells only, sight + 6, a whole resolution, debuffs, previews, estimates, objects', function (t) {
    if (!ready(t)) return;
    arena({ heroes: [{ id: 'test_mage', x: 6, y: 8 }, { id: 'test_knight', x: 6, y: 6 }, { id: 'test_cleric', x: 2, y: 12 }], enemies: [{ id: GAL, x: 6, y: 5 }],
      objects: [{ x: 8, y: 8, id: 'gal_crystal' }] });
    let g = gal();
    bare(g);
    const m = hero('test_mage'), kn = hero('test_knight');
    const bolt = m.basic;
    // the preview and the estimate are honest while it is armed
    const pdmg = function (p) { return p && p.perUnit && p.perUnit[g.id] ? p.perUnit[g.id].dmg || 0 : 0; };
    let pv = DD.Targeting.preview(m, bolt, { x: g.x, y: g.y });
    t.ok(!!pv && !pv.uncertain && pdmg(pv) === 0, 'armed: the preview of a spell at him says 0 (' + pdmg(pv) + ')');
    t.eq(DD.AI.estimate(m, g, 4, null, false, DD.getSkill('test_bolt')), 0, 'armed: DD.AI.estimate says 0 (estimateDealt)');
    t.ok(B().counterArmed(g) && B().slotsOf(g) === 9, 'the preview spent nothing');
    // an object hit (the crystal) neither is countered nor spends it
    const cq = DD.Targeting.validTargets(m, bolt).filter(function (p) { return p.x === 8 && p.y === 8; })[0];
    t.ok(!!cq && cq.dmg === 4, 'the bolt can aim at the crystal (D1)');
    act(function () { DD.Combat.useSkill(m, bolt, 8, 8); });
    t.eq(DD.Grid.tile(8, 8).obj.hp, 11, 'the crystal takes 4 (no counter for objects)');
    t.ok(B().counterArmed(g) && B().slotsOf(g) === 9, 'and the Counterspell is still armed (object hits never arm or spend it)');
    // the first spell at him does nothing and costs him 2 slots
    const hp0 = g.hp;
    act(function () { DD.Combat.useSkill(m, bolt, g.x, g.y); });
    t.eq(g.hp, hp0, 'the first spell at him is countered');
    t.ok(B().slotsOf(g) === 7 && !B().counterArmed(g) && D(g).stats.counters === 1, 'it costs him 2 slots (9 → 7) and is spent for the round');
    t.ok(logHas(/Galbraith's Counterspell! Wizzy McTest's Magic Missile \(Unit\) does nothing to him/), 'logged by name');
    // the second goes through (and its preview says so); so does steel
    pv = DD.Targeting.preview(m, bolt, { x: g.x, y: g.y });
    t.eq(pdmg(pv), 4, 'spent: the preview says 4');
    act(function () { DD.Combat.useSkill(m, bolt, g.x, g.y); });
    t.eq(g.hp, hp0 - 4, 'the second spell this round goes through');
    let dealt = 0;
    act(function () { dealt = DD.Act.damage(kn, g, 5, { cause: 'skill', skill: DD.getSkill('test_slash') }); });
    t.eq(dealt, 5, 'steel goes through');
    // next round it is armed again; an attack never arms or spends it
    act(function () { DD.Combat.endRound(); });
    t.ok(B().counterArmed(g), 're-armed next round');
    act(function () { DD.Act.damage(kn, g, 5, { cause: 'skill', skill: DD.getSkill('test_slash') }); });
    t.ok(B().counterArmed(g), 'an attack does not spend it');
    // out of range (7): not countered (Mass Assert hits every foe; it targets the caster's own tile)
    S().hype = 100;
    put(m, 6, 12);
    t.ok(dist(m, g) === 7, 'the mage 7 away');
    const hp1 = g.hp;
    t.ok(act(function () { return DD.Combat.useSkill(m, m.signature, m.x, m.y); }), 'Mass Assert cast');
    t.eq(g.hp, hp1 - 13, 'a spell from 7 away goes through (12 fire + the mage\'s Arcane Surplus 1)');
    t.ok(B().counterArmed(g), 'and does not spend it');
    // a whole resolution is countered as one (an area spell that hits him twice), and its debuff is cancelled
    act(function () { DD.Combat.endRound(); });
    put(m, 6, 8);
    const boltDef = DD.getSkill('test_bolt');
    let d1 = -1, d2 = -1, sl = B().slotsOf(g), cn = D(g).stats.counters;
    act(function () {
      inResolution(m, boltDef, function () {
        d1 = DD.Act.damage(m, g, 4);
        d2 = DD.Act.damage(m, g, 4);
        DD.Act.addStatus(g, 'slow', { turns: 1 }, m);
      });
    });
    t.ok(d1 === 0 && d2 === 0, 'both hits of one resolution are countered (' + d1 + ', ' + d2 + ')');
    t.ok(!has(g, 'slow'), 'the spell\'s debuff on him is cancelled too');
    t.ok(B().slotsOf(g) === sl - 2 && D(g).stats.counters === cn + 1, 'one counter, one price (' + sl + ' → ' + B().slotsOf(g) + ')');
    act(function () { inResolution(m, boltDef, function () { DD.Act.addStatus(g, 'weak', { turns: 1 }, m); }); });
    t.ok(has(g, 'weak'), 'the next spell\'s debuff lands (spent for the round)');
    DD.Act.removeStatus(g, 'weak', { silent: true });
    // a pure debuff spell arms it too
    act(function () { DD.Combat.endRound(); });
    sl = B().slotsOf(g); cn = D(g).stats.counters;
    act(function () { inResolution(m, boltDef, function () { DD.Act.addStatus(g, 'weak', { turns: 1 }, m); }); });
    t.ok(!has(g, 'weak') && !B().counterArmed(g) && B().slotsOf(g) === sl - 2 && D(g).stats.counters === cn + 1, 'a debuffing spell is countered (' + sl + ' → ' + B().slotsOf(g) + ')');
    // poison does nothing to him anyway: no counter wasted
    act(function () { DD.Combat.endRound(); });
    sl = B().slotsOf(g); cn = D(g).stats.counters;
    act(function () { inResolution(m, boltDef, function () { DD.Act.damage(m, g, 4, { element: 'poison' }); }); });
    t.ok(B().counterArmed(g) && B().slotsOf(g) === sl && D(g).stats.counters === cn, 'a poison spell (he is immune) does not spend it');
    // under 2 slots, while resting, in his Encore: no counter
    B().setSlots(g, 1);
    t.ok(!B().counterArmed(g), 'under 2 slots: off');
    let hpx = g.hp;
    act(function () { DD.Combat.useSkill(m, bolt, g.x, g.y); });
    t.eq(g.hp, hpx - 4, 'so the spell goes through');
    B().setSlots(g, 9);
    // a caster he can't see (a column between): not countered
    arena({ heroes: [{ id: 'test_mage', x: 6, y: 9 }], enemies: [{ id: GAL, x: 6, y: 5 }], objects: [{ x: 6, y: 7, id: 'pillar' }] });
    g = gal(); bare(g);
    const m3 = hero('test_mage');
    t.ok(!DD.Grid.los(g, m3) && !B().counterable(g, m3), 'out of his sight: not counterable');
    hpx = g.hp;
    act(function () { inResolution(m3, boltDef, function () { DD.Act.damage(m3, g, 4); }); });
    t.eq(g.hp, hpx - 4, 'a spell he can\'t see coming goes through (a no-sight spell)');
  });

  // ---- the stun guard ---------------------------------------------------------------------------------------------------
  T.suite('boss_galbraith: Galbraith\'s Contingency — after a stun lands, stuns are refused until the end of the next turn he plays', function (t) {
    if (!ready(t)) return;
    arena({ heroes: [{ id: 'test_knight', x: 6, y: 7 }, { id: 'test_mage', x: 6, y: 9 }], enemies: [{ id: GAL, x: 6, y: 5 }] });
    const g = gal(), kn = hero('test_knight'), m = hero('test_mage');
    let st = null;
    act(function () { st = DD.Act.addStatus(g, 'stun', { turns: 1 }, kn); });
    t.ok(!!st && D(g).stats.stuns === 1, 'the first stun lands');
    act(function () { st = DD.Act.addStatus(g, 'stun', { turns: 2 }, m); });
    t.ok(DD.Act.getStatus(g, 'stun').turns === 1 && D(g).stats.refused === 1, 'a second stun is refused (🎩 Galbraith\'s Contingency)');
    turn(g);            // he loses this turn (stunned): the guard holds
    t.ok(!!D(g).guard, 'a lost turn keeps the guard up');
    act(function () { DD.Act.addStatus(g, 'stun', { turns: 1 }, m); });
    t.ok(!has(g, 'stun'), 'still refused');
    act(function () { DD.Combat.endRound(); });
    turn(g);            // a turn he really plays: the guard drops at its end
    t.ok(!D(g).guard, 'the guard drops at the end of a turn he played');
    act(function () { st = DD.Act.addStatus(g, 'stun', { turns: 1 }, m); });
    t.ok(!!st, 'and stuns land again');
    t.ok(!DD.Act.addStatus(g, 'sleep', { turns: 1 }, m), 'sleep never lands (immune)');
    t.ok(DD.Act.isBoss(g) && !DD.Act.addStatus(g, 'sheep', { turns: 1 }, m), 'a boss: no sheep');
  });

  // ---- his turn ----------------------------------------------------------------------------------------------------------
  T.suite('boss_galbraith: his turn — teleport away (never two turns running), Wall of Force, Chain on a cluster, the Ray, wind-ups take turns', function (t) {
    if (!ready(t)) return;
    // a foe next to him: the teleport, then a spell and a wind-up
    arena({ heroes: [{ id: 'test_knight', x: 6, y: 6 }, { id: 'test_mage', x: 6, y: 11 }], enemies: [{ id: GAL, x: 6, y: 5 }] }, true);
    let g = gal();
    play();
    t.ok(D(g).stats.blinks === 1 && dist(g, hero('test_knight')) >= 4, 'a foe next to him: he teleports away (' + key(g) + ')');
    t.ok(D(g).stats.rays + D(g).stats.chains >= 1, 'then one spell');
    t.ok(!!windup(g, 'gal_meteor') || !!windup(g, 'gal_pw'), 'then a wind-up');
    const next = DD.Grid.neighbors(g.x, g.y).filter(function (n) { return DD.Grid.isFree(n.x, n.y); })[0];
    put(hero('test_knight'), next.x, next.y);
    t.ok(dist(g, hero('test_knight')) === 1, 'the knight catches up');
    play();
    t.eq(D(g).stats.blinks, 1, 'no teleport two turns running');
    // the Wall: two melee heroes within 3 (not adjacent)
    arena({ heroes: [{ id: 'test_knight', x: 6, y: 8 }, { id: 'test_rogue', x: 5, y: 7 }, { id: 'test_mage', x: 10, y: 12 }], enemies: [{ id: GAL, x: 6, y: 5 }] }, true);
    g = gal();
    play();
    t.ok(D(g).stats.walls === 1, 'two melee heroes within 3: Wall of Force');
    const walls = S().grid.tiles.filter(function (x) { return x.obj && x.obj.id === 'gal_force_wall'; });
    t.ok(walls.length >= 3 && walls.length <= 5 && walls.every(function (x) { return x.y === 6; }), 'a wall between him and them (' + walls.map(key).join(' ') + ')');
    // Chain on a cluster
    arena({ heroes: [{ id: 'test_mage', x: 6, y: 10 }, { id: 'test_cleric', x: 7, y: 10 }, { id: 'test_knight', x: 1, y: 12 }], enemies: [{ id: GAL, x: 6, y: 5 }] }, true);
    g = gal();
    play();
    t.eq(D(g).stats.chains, 1, 'two foes within 2 of each other: Chain Lightning');
    // the Ray when nobody clusters
    arena({ heroes: [{ id: 'test_mage', x: 6, y: 10 }, { id: 'test_cleric', x: 12, y: 12 }], enemies: [{ id: GAL, x: 6, y: 5 }] }, true);
    g = gal();
    hero('test_mage').maxHp = hero('test_mage').hp = 90;     // the fixture mage has to last three of his turns
    play();
    t.ok(D(g).stats.rays === 1 && D(g).stats.chains === 0, 'no cluster: the Frostbite Ray');
    // the wind-ups take turns: Meteor, then Power Word
    t.ok(!!windup(g, 'gal_meteor') && D(g).nextWind === 'pw', 'first a Meteoric Displeasure, next the Power Word');
    t.eq(B().slotsOf(g), 4, 'a ray (0) and the Meteor (5): 4 slots left');
    play();
    t.ok(!!windup(g, 'gal_pw') && B().slotsOf(g) === 0, 'then the Power Word (4 → 0)');
    t.eq(g.intents.filter(function (i) { return i.windup; }).length, 1, 'one wind-up at a time');
    play();
    t.ok(D(g).stats.rests === 1 && has(g, 'gal_resting'), 'out of slots: the next turn is an Intermission');
    // in the observatory he never ends a walk over the void
    startFight(12);
    g = gal();
    let over = 0, moved = 0;
    for (let k = 0; k < 5 && !S().result; k++) {
      const p0 = key(g);
      play();
      if (key(g) !== p0) moved++;
      if (DD.Grid.isPit(g.x, g.y)) over++;
    }
    t.ok(over === 0, 'he hovers over the floor, never the void (moved ' + moved + ' times)');
    // pushed out over the void (he flies, melee can't reach him there) and nobody in sight: he floats back to the marble
    // and closes in (a sim party once stalled 40 rounds against a Galbraith parked over the corner void)
    [1, 2].forEach(function (phase) {
      startFight(13);
      g = gal();
      if (phase === 2) B().enterEncore(g);
      const party = S().units.filter(function (u) { return u.kind === 'hero'; });
      const near = function () { return Math.min.apply(null, party.map(function (h) { return dist(h, g); })); };
      t.ok(put(g, 0, 1) && DD.Grid.isPit(0, 1), 'phase ' + phase + ': Galbraith pushed over the void at (0,1)');
      const d0 = near();
      t.ok(party.every(function (h) { return !(dist(h, g) <= 6 && DD.Grid.los(g, h)); }), 'nobody in his sight from there (' + d0 + ' to the nearest)');
      play();
      t.ok(!DD.Grid.isPit(g.x, g.y) && near() < d0, 'phase ' + phase + ': his turn takes him back over the marble, toward the party (' + key(g) + ', ' + near() + ')');
    });
  });

  // ---- the Encore ----------------------------------------------------------------------------------------------------------
  T.suite('boss_galbraith: the Encore — at 100 HP: Overchannelling ×1.5, no slots / counter, move 5, two rays, Grand Finale every other turn, crystals heal', function (t) {
    if (!ready(t)) return;
    arena({ heroes: [{ id: 'test_knight', x: 6, y: 8 }, { id: 'test_mage', x: 3, y: 8 }, { id: 'test_cleric', x: 9, y: 8 }],
      enemies: [{ id: GAL, x: 6, y: 5 }], objects: [{ x: 1, y: 6, id: 'gal_crystal' }] }, true);
    const g = gal(), kn = hero('test_knight');
    bare(g);
    t.eq(B().threshold(g), 100, 'the Encore starts at 100 HP');
    g.hp = 104;
    act(function () { DD.Act.damage(kn, g, 10, { cause: 'skill' }); });
    t.ok(g.hp === 94 && D(g).phase === 2, 'crossing 100 starts the Encore; the damage carries on (94)');
    t.ok(has(g, 'gal_overchannel') && !has(g, 'gal_slots'), 'Overchannelling, no slots');
    t.ok(!S().rules.some(function (r) { return r.id === 'gal_counterspell'; }), 'the Counterspell rule is gone');
    t.ok(g.mov === 5 && JSON.stringify(DD.Combat.slotsOf(g).map(function (s) { return s.id; })) === '["gal_ray"]', 'move 5; his kit is the ray');
    t.ok(/ENCORE/.test(S().objective.flavor) && /ENCORE/.test(B().passiveText(g)), 'the flavor and the inspect line say ENCORE');
    let dealt = 0;
    act(function () { dealt = DD.Act.damage(kn, g, 10, { cause: 'skill' }); });
    t.eq(dealt, 15, '+50% damage taken');
    t.ok(logHas(/ENCORE!/), 'logged');
    // his turn: the crystal heals 8 at the start, two rays at two different foes, the Finale wound up (anchored on him)
    const hp0 = g.hp;
    const h = hits(play);
    t.ok(D(g).stats.healed === 8, 'one standing crystal heals him 8 at his turn start (' + D(g).stats.healed + ')');
    const rays = h.filter(function (x) { return x.skill === 'gal_ray'; });
    t.ok(rays.length === 2 && rays[0].target !== rays[1].target, 'two Frostbite Rays at two different foes (' + rays.length + ')');
    let w = windup(g, 'gal_finale');
    if (!t.ok(!!w && w.anchor === 'self', 'the Grand Finale is wound up, anchored on him')) return;
    t.eq(DD.AI.intentDmg(g, w), 20, 'its number: 20');
    const ox = g.x, oy = g.y;
    const tiles = DD.AI.intentTiles(g, w);
    t.ok(tiles.every(function (p) { return dist(p, g) <= 3; }), 'radius 3 around him');
    // the blast moves with him
    const spot = DD.Grid.emptyTilesNear(g.x, g.y, 2).filter(function (p) { return !DD.Grid.isPit(p.x, p.y) && (p.x !== ox || p.y !== oy); })[0];
    put(g, spot.x, spot.y);
    t.ok(DD.AI.intentTiles(g, w).every(function (p) { return dist(p, g) <= 3; }), 'moved, the blast moves with him');
    put(g, ox, oy);
    t.ok(g.hp >= hp0, 'he healed before the rays (' + hp0 + ' → ' + g.hp + ')');
    // the Finale lands at his next turn start on the foes within 3; no new one that turn
    const inside = S().units.filter(function (u) { return u.kind === 'hero' && !u.downed && dist(u, g) <= 3; });
    const h2 = hits(play);
    const fin = h2.filter(function (x) { return x.skill === 'gal_finale'; });
    t.ok(fin.length === inside.length && fin.every(function (x) { return x.base === 20; }), 'the Finale lands: 20 to each foe within 3 (' + fin.length + '/' + inside.length + ')');
    t.ok(!windup(g, 'gal_finale'), 'every other turn: none wound up this turn');
    play();
    t.ok(!!windup(g, 'gal_finale') || !!S().result, 'the turn after: the Finale again');
  });

  // ---- Focus Crystals --------------------------------------------------------------------------------------------------------
  T.suite('boss_galbraith: Focus Crystals — any single-target damage skill breaks them, one slot less a turn, AutoPlay hints', function (t) {
    if (!ready(t)) return;
    const s = startFight(3);
    aiOff();
    const g = gal();
    const kn = s.units.filter(function (u) { return u.defId === 'test_knight'; })[0];
    const tl = DD.Grid.tile(6, 1);
    t.eq(DD.getObject('gal_crystal').autoplay(kn, tl.obj, tl, s, 'break'), 14, 'AutoPlay values breaking one at 14');
    t.eq(DD.getObject('gal_crystal').autoplay(kn, tl.obj, tl, s, 'step'), 0, 'stepping on it: 0');
    // break the north crystal from range (the mage's bolt, then the rest)
    const m = s.units.filter(function (u) { return u.defId === 'test_mage'; })[0];
    put(m, 6, 4);
    const q = DD.Targeting.validTargets(m, m.basic).filter(function (p) { return p.x === 6 && p.y === 1; })[0];
    t.ok(!!q && q.obj === 'gal_crystal', 'the mage can aim at it on its pedestal');
    act(function () { DD.Act.damageObject(m, 6, 1, 15); });
    t.ok(!DD.Grid.tile(6, 1).obj && B().crystalsStanding() === 2 && D(g).stats.crystals === 1, 'it breaks: two left');
    t.ok(logHas(/A Focus Crystal shatters/), 'logged');
    t.ok(/2 left/.test(s.objective.flavor), 'the flavor counts them: ' + s.objective.flavor);
    B().setSlots(g, 3);
    turn(g);
    t.eq(B().slotsOf(g), 5, 'two crystals: +2 a turn');
    B().enterEncore(g);
    t.eq(DD.getObject('gal_crystal').autoplay(kn, DD.Grid.tile(0, 6).obj, DD.Grid.tile(0, 6), s, 'break'), 18, 'in his Encore: 18');
  });

  // ---- the cameo cheat ---------------------------------------------------------------------------------------------------------
  T.suite('boss_galbraith: Svammiel\'s That\'s a 1 Now at this door (needs svammiel.js) — exact, honest previews, a countered spell never spends it', function (t) {
    if (!ready(t)) return;
    const cam = DD.getCameo && DD.getCameo('svammiel');
    if (!cam || !cam.cheats || !cam.cheats.svam_cameo_one || !DD.Cameo || DD.Cameo.stub) { t.log('svammiel.js / cameo.js not loaded: the cheat checks are skipped'); t.ok(true, 'skipped'); return; }
    // the real door: the start cameo applies it
    const s = startFight(5, { cameo: true });
    const r = s.rules.filter(function (x) { return x.id === 'cameo:svam_cameo_one'; })[0];
    t.ok(!!r && r.cheat === true, 'the start cameo puts That\'s a 1 Now in the rules');
    t.eq(r && r.desc, 'The first hit of 10 or more damage on Galbraith this fight deals 1 instead.', 'its exact desc');
    aiOff();
    const g = gal();
    bare(g);
    const m = s.units.filter(function (u) { return u.defId === 'test_mage'; })[0];
    const kn = s.units.filter(function (u) { return u.defId === 'test_knight'; })[0];
    // a countered 12-damage spell: 0, and the cheat is not spent
    put(m, 6, 8);
    s.hype = 100;
    act(function () { DD.Combat.giveTurnTo(m); });
    const hp0 = g.hp;
    t.ok(act(function () { return DD.Combat.useSkill(m, m.signature, m.x, m.y); }), 'Mass Assert cast');
    t.ok(g.hp === hp0 && D(g).stats.counters === 1, 'Mass Assert at him is countered');
    t.eq(DD.AI.estimate(kn, g, 15, null), 1, 'the cheat is still waiting (the estimate says 1)');
    let dealt = 0;
    act(function () { dealt = DD.Act.damage(kn, g, 15, { cause: 'skill' }); });
    t.eq(dealt, 1, 'the first 10+ hit deals 1');
    act(function () { dealt = DD.Act.damage(kn, g, 15, { cause: 'skill' }); });
    t.eq(dealt, 15, 'only the first');
  });

  // ---- voice ---------------------------------------------------------------------------------------------------------------
  T.suite('boss_galbraith: voice — lengths, he / him, first person, named lines (Benedick\'s verbatim), the DM\'s tips, the jab once', function (t) {
    if (!ready(t)) return;
    const d = DD.getEnemy(GAL);
    const texts = [];
    Object.keys(d.barks).forEach(function (k) { d.barks[k].forEach(function (l) { t.ok(l.length <= 70, 'bark ' + k + ' ≤ 70: "' + l + '"'); texts.push(['bark ' + k, l]); }); });
    ['spawn', 'attack', 'hurt', 'death', 'phase', 'stunned', 'counter', 'rest', 'landed'].forEach(function (k) { t.ok((d.barks[k] || []).length >= 1, 'barks.' + k); });
    t.ok(d.barks.death.indexOf('Spell my name right on the plaque... one L...') >= 0 && d.barks.phase[0] === 'An encore! The crowd demands it. I am the crowd.', 'V §8.3 verbatim');
    ['galbraith_tip', 'galbraith_encore', 'galbraith_death'].forEach(function (k) {
      const pool = DD.defs.narration[k] || [];
      t.ok(pool.length >= 2, k + ': ' + pool.length + ' lines');
      pool.forEach(function (l) { t.ok(l.length <= 160 && !/\{/.test(l), k + ' ≤ 160, token-free'); texts.push([k, l]); });
    });
    DD.defs.narration.galbraith_tip.forEach(function (l) { t.ok(/^DM \(whispering\): ".+"$/.test(l), 'the demoted DM whispers: ' + l); });
    t.ok(!DD.defs.narration.galbraith_tip.some(function (l) { return /[Ss]ilence/.test(l); }), 'no Silence tip (plan V12: no hero silences)');
    t.ok(DD.defs.narration.galbraith_death.indexOf('The painted stars go out one at a time, and every one of them had his name on it.') >= 0, 'the defeat narration (V §8.3)');
    Object.keys(B().SK).forEach(function (k) { const s = DD.getSkill(B().SK[k]); texts.push(['skill ' + s.id, DD.skillDesc(s, 1, null)]); texts.push(['flavor ' + s.id, s.flavor || '']); });
    texts.push(['codex', d.desc], ['intro', d.boss.intro], ['passive', B().passiveText(null)], ['counter', B().COUNTER_DESC],
      ['crystal', DD.getObject('gal_crystal').desc], ['wall', DD.getObject('gal_force_wall').desc], ['encounter', DD.getEncounter(ENC).intro]);
    // pronouns: a sentence naming Galbraith never says she / her
    let checked = 0;
    texts.forEach(function (x) {
      sentences(x[1]).forEach(function (sent) {
        if (!/Galbraith/.test(sent)) return;
        checked++;
        t.ok(!/\b(she|her|hers|herself)\b/i.test(sent), x[0] + ': he / him for Galbraith in "' + sent + '"');
      });
    });
    t.ok(checked >= 10, checked + ' sentences name Galbraith');
    // named lines: each names its hero exactly (registered heroes), Benedick's verbatim, never without the hero
    const NAMES = { zarathor: 'Zarathor', kiri: 'Kiri', corelos: 'Corelos', syllamin: 'Syllamin', marbles: 'Professor Marbles', valdris: 'Valdris', benedick: 'Benedick' };
    B().NAMED.forEach(function (p) {
      const h = DD.getHero(p[0]);
      t.ok(!!NAMES[p[0]] && p[1].indexOf(NAMES[p[0]]) >= 0 && p[1].length <= 70, p[0] + ': names ' + NAMES[p[0]] + ' exactly: "' + p[1] + '"');
      if (!h) { t.log(p[0] + ' not registered in this run (isolated): the line waits for the hero'); return; }
      t.eq(h.name, NAMES[p[0]], p[0] + ': the hero\'s registered name');
    });
    t.ok(B().NAMED.some(function (x) { return x[0] === 'benedick' && x[1] === 'Galbraith\'s Escargot, Benedick. A classic. Hold still.'; }), 'Benedick\'s line, verbatim (plan §5.3)');
    arena({ heroes: [{ id: 'test_mage', x: 6, y: 9 }], enemies: [{ id: GAL, x: 6, y: 5 }] });
    let leaked = 0;
    for (let i = 0; i < 40; i++) if (B().namedLine()) leaked++;
    t.eq(leaked, 0, 'no named line without its hero in the fight');
    // the jab: once, in round 1, with the DM's tip
    startFight(6);
    aiOff();
    act(function () { DD.Combat.endRound(); });
    act(function () { DD.Combat.endRound(); });
    t.eq(logCount(/Lich-tenstein\? I supervised his thesis/), 1, 'the Lich-tenstein jab, once');
    t.ok(logHas(/^DM \(whispering\)/), 'the DM\'s whisper in round 1');
  });

  // ---- the sprite and the props ---------------------------------------------------------------------------------------------
  T.suite('boss_galbraith: sprite and props — both looks, every pose, five yaws, no painter errors', function (t) {
    if (!ready(t)) return;
    if (!DD.Sprites || !DD.Iso || typeof document === 'undefined') { t.skip('no renderer'); return; }
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const ctx = c.getContext('2d');
    const spec = DD.getEnemy(GAL).sprite;
    const p0 = (DD.problems || []).length;
    const w0 = (DD.errors || []).length;
    arena({ heroes: [{ id: 'test_mage', x: 6, y: 9 }], enemies: [{ id: GAL, x: 6, y: 5 }] });
    const g = gal();
    let n = 0;
    [0, 90, 180, 270, 37.5].forEach(function (yaw) {
      DD.Iso.withYaw(yaw, function () {
        [1, 2].forEach(function (phase) {
          D(g).phase = phase;
          ['idle', 'cast', 'attack', 'hurt'].forEach(function (pose) {
            [0, 0.7, 2.3].forEach(function (tt) {
              ctx.clearRect(0, 0, 256, 256);
              DD.Sprites.draw(ctx, spec, 128, 220, 1, { t: tt, pose: pose, unit: g, facing: tt > 1 ? -1 : 1, hover: true });
              n++;
            });
          });
        });
        // the props: crystal (whole and cracked), the wall (fresh and fading), the floors
        const gp = DD.Iso.painter(ctx, { t: 1.3, yawAware: false });
        DD.getObject('gal_crystal').draw(gp, { id: 'gal_crystal', hp: 15, maxHp: 15, data: {} }, 1.3);
        DD.getObject('gal_crystal').draw(gp, { id: 'gal_crystal', hp: 3, maxHp: 15, data: {} }, 1.3);
        DD.getObject('gal_force_wall').draw(gp, { id: 'gal_force_wall', hp: 0, maxHp: 0, data: { left: 2 } }, 1.3);
        DD.getObject('gal_force_wall').draw(gp, { id: 'gal_force_wall', hp: 0, maxHp: 0, data: { left: 1 } }, 1.3);
        DD.getTerrain('gal_starmarble').draw(gp, { x: 5, y: 0 }, 1.3);
        DD.getTerrain('gal_starmarble').draw(gp, { x: 1, y: 1 }, 1.3);
        DD.getTerrain('gal_sigil').draw(gp, { x: 6, y: 5 }, 1.3);
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
    const pt = DD.Sprites.portrait ? DD.Sprites.portrait(GAL, 64) : null;
    t.ok(!DD.Sprites.portrait || !!pt, 'a portrait');
  });

  // ---- robustness ---------------------------------------------------------------------------------------------------------
  T.suite('boss_galbraith: robustness — alone he acts, previews leave no trace, every wind-up honest under the area watch', function (t) {
    if (!ready(t)) return;
    // alone in a bare sandbox (the content suite's setup): he acts within 3 rounds
    DD.Combat.sandbox({ w: 11, h: 11, seed: 4, cameo: false, objective: { type: 'custom' }, encounter: { id: 'gal_alone', checkObjective: function () { return null; } },
      heroes: PARTY.map(function (h, i) { return { id: h, x: 1 + (i % 2), y: 3 + i, level: 4 }; }), enemies: [{ id: GAL, x: 7, y: 5 }] });
    let used = 0;
    const g0 = gal();
    DD.Act.addRule({ id: 'test_gal_used', name: 'used', silent: true, hooks: { onSkillUsed: function (ctx) { if (ctx.user === g0) used++; } } });
    for (let r = 0; r < 3 && !S().result; r++) act(function () { DD.Combat.endRound(); });
    DD.Act.removeRule('test_gal_used');
    t.ok(used > 0, 'alone in a bare sandbox he acts (' + used + ' skills in 3 rounds)');
    // previews (dry runs) of hits on him (armed counter, the Encore threshold) leave the fight untouched
    const fp = T.contentHelpers && T.contentHelpers.fingerprint;
    const s = startFight(9);
    aiOff();
    const g = gal();
    const m = s.units.filter(function (u) { return u.defId === 'test_mage'; })[0];
    const kn = s.units.filter(function (u) { return u.defId === 'test_knight'; })[0];
    put(m, 6, 8); put(kn, 6, 6);
    g.hp = 102;
    const snap = fp ? fp(s) : JSON.stringify(g.data);
    DD.Targeting.preview(m, m.basic, { x: g.x, y: g.y });
    DD.Targeting.preview(kn, kn.basic, { x: g.x, y: g.y });
    t.eq(fp ? fp(s) : JSON.stringify(g.data), snap, 'previews change nothing (slots, the counter, the phase)');
    t.ok(D(g).phase === 1 && B().counterArmed(g), 'still phase 1, the counter still armed');
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
  T.suite('boss_galbraith: AutoPlay battles (fixture party; real=1: random real parties at L5.5 against the plan\'s band)', function (t) {
    if (!ready(t)) return;
    const real = t.param('real', '0') === '1';
    const pool = Object.keys(DD.defs.heroes).filter(function (id) { return !/^test_/.test(id); });
    if (real && pool.length < 4) { t.skip('real=1 needs the hero files (isolate=galbraith,heroes)'); return; }
    const n = Math.max(1, +(t.param('n', real ? 20 : 2)) || 1);
    const level = +(t.param('level', LV)) || LV;
    const rng = DD.RNG('gal-sims:' + t.seed);
    let wins = 0, rounds = 0, timeouts = 0, downs = 0, encores = 0;
    const eng = { counters: 0, rests: 0, restDmg: 0, crystals: 0, blinks: 0, walls: 0, chains: 0, rays: 0, meteors: 0, meteorHits: 0, pws: 0, pwLanded: 0, finales: 0, finaleHits: 0, healed: 0, refused: 0 };
    const taken = {}, dealt = { spells: 0, other: 0 };
    // tuning probes (BAL): hpx=<HP factor>, knobs=key:value,… (DD.Galbraith.N), lv=skill.key:value,… (level-1 numbers)
    const def = DD.getEnemy(GAL), hp0 = def.hp, savedN = JSON.parse(JSON.stringify(B().N));
    const hpx = +(t.param('hpx', 1)) || 1;
    def.hp = Math.round(hp0 * hpx);
    String(t.param('knobs', '')).split(',').filter(Boolean).forEach(function (kv) { const p = kv.split(':'); if (p[0] in B().N && typeof B().N[p[0]] === 'number') B().N[p[0]] = +p[1]; });
    const savedLv = [];
    String(t.param('lv', '')).split(',').filter(Boolean).forEach(function (kv) {
      const p = kv.split(':'), q = p[0].split('.'), sd = DD.getSkill(q[0]);
      if (!sd || !sd.levels[0] || !(q[1] in sd.levels[0])) return;
      savedLv.push([sd, q[1], sd.levels[0][q[1]]]);
      sd.levels[0][q[1]] = +p[1];
    });
    try {
      for (let i = 0; i < n; i++) {
        // party=a,b,c,d pins the party (the draw still happens, so the fights keep their seeds)
        const drawn = real ? rng.sample(pool, 4) : PARTY;
        const ids = t.param('party', '') ? String(t.param('party')).split(',') : drawn;
        const s = bareRows(real, function () { return startFight('sim' + i, { real: true, level: level, ids: ids, cameo: t.param('cameo', '0') === '1' }); });
        DD.Act.addRule({ id: 'test_gal_diag', name: 'diag', silent: true, hooks: {
          onTakeDamage: function (d) {
            if (!d.target || DD.Act.simulating) return;
            if (d.target.kind === 'hero') { const k = d.skill ? d.skill.id : d.cause; taken[k] = (taken[k] || 0) + (d.dealt || 0); }
            else if (d.target.defId === GAL && d.source && d.source.side === 'hero') {
              if (d.skill && d.skill.kind === 'spell') dealt.spells += d.dealt || 0; else dealt.other += d.dealt || 0;
            }
          },
        } });
        const res = DD.AutoPlay.runBattle(40);
        rounds += res.rounds;
        if (res.result === 'victory') wins++;
        if (res.timeout) timeouts++;
        downs += s.stats.downs || 0;
        const st = B().stats(s) || {};
        Object.keys(eng).forEach(function (k) { eng[k] += st[k] || 0; });
        if (st.phase === 2) encores++;
        if (t.param('fights')) t.log('#' + i + ' ' + ids.join(',') + ': ' + res.result + ' in ' + res.rounds + ' rounds, ' + JSON.stringify(st));
        if (res.timeout || t.param('where')) {
          t.log('#' + i + ' ends at: ' + s.units.filter(function (u) { return !u.dead; }).map(function (u) {
            return u.defId + '@' + u.x + ',' + u.y + ' ' + u.hp + '/' + u.maxHp + (u.downed ? ' (down)' : '');
          }).join(' · '));
        }
      }
    } finally {
      def.hp = hp0;
      Object.keys(savedN).forEach(function (k) { B().N[k] = savedN[k]; });
      savedLv.forEach(function (x) { x[0].levels[0][x[1]] = x[2]; });
    }
    if (hpx !== 1 || t.param('knobs') || t.param('lv')) t.log('probe: hpx ' + hpx + ', knobs ' + t.param('knobs', '-') + ', lv ' + t.param('lv', '-'));
    const pct = Math.round(100 * wins / n);
    const per = function (o) { const r = {}; Object.keys(o).sort(function (a, b) { return o[b] - o[a]; }).forEach(function (k) { r[k] = Math.round(10 * o[k] / n) / 10; }); return JSON.stringify(r); };
    t.log('Galbraith at L' + level + ' (' + (real ? 'random real parties' : 'fixture party') + '): won ' + wins + '/' + n + ' (' + pct + '%), avg rounds ' +
      (rounds / n).toFixed(1) + ', downs ' + (downs / n).toFixed(2) + ', encores ' + encores + ', timeouts ' + timeouts);
    t.log('engagement per fight: ' + per(eng));
    t.log('damage to heroes by source per fight: ' + per(taken) + ' · damage to him per fight: ' + per(dealt));
    t.eq(timeouts, 0, 'no timeouts');
    if (!real) return;
    t.ok(pct >= 50 && pct <= 90, 'author band (plan §7.1: 66-74% at L5.5; this check 50-90%): ' + pct + '%');
    t.ok(eng.counters > 0 && eng.rests > 0 && eng.crystals > 0, 'the puzzle happens (counters ' + eng.counters + ', rests ' + eng.rests + ', crystals ' + eng.crystals + ')');
  });

  // ---- review (V3) ---------------------------------------------------------------------------------------------------------
  T.suite('boss_galbraith: review (V3) — Meteoric Displeasure drops UP TO three meteors (one per hero 3+ apart); Snail Slime never snags him (he flies)', function (t) {
    if (!ready(t)) return;
    // two heroes side by side: one meteor (the desc said "three meteors land"; it now says "up to three")
    arena({ heroes: [{ id: 'test_mage', x: 6, y: 9 }, { id: 'test_cleric', x: 7, y: 9 }], enemies: [{ id: GAL, x: 6, y: 3 }] });
    const g = gal();
    const plan = B().meteorPlan(g);
    t.eq(plan.centers.length, 1, 'two heroes next to each other: one meteor');
    t.ok(/up to three meteors land/.test(DD.skillDesc(DD.getSkill('gal_meteor'), 1, g)), 'the desc says "up to three"');
    t.ok(act(function () { return !!DD.AI.windUp(g, 'gal_meteor', plan.centers[0], { anchor: 'ground', tiles: plan.tiles, data: { centers: plan.centers } }); }), 'wound up');
    const marked = DD.AI.intentTiles(g, windup(g, 'gal_meteor')).map(key);
    const h = hits(play);
    const hit = h.filter(function (x) { return x.skill === 'gal_meteor'; });
    t.ok(hit.length === 2 && hit.every(function (x) { return marked.indexOf(key(x.target)) >= 0; }), 'it lands on both heroes inside its marked tiles (' + hit.length + ' hits)');
    // he flies: Benedick's slime (a stop for grounded non-bosses) never touches him
    const slime = DD.getSurface && DD.getSurface('ben_slime');
    if (!DD.getHero('benedick') || !slime) { t.log('Benedick not loaded: the slime check is skipped'); return; }
    arena({ heroes: [{ id: 'benedick', x: 6, y: 11 }], enemies: [{ id: GAL, x: 6, y: 5 }] });
    const g2 = gal();
    act(function () { DD.Act.setSurface(6, 6, slime.id, 3); DD.Grid.tile(6, 6).surface.data = { src: hero('benedick').id }; });
    t.ok(!DD.Grid.snagAt(6, 6, g2), 'no snag for Galbraith (a flying boss)');
  });

  /**
   * Review (V3, Nov 15): whole fights of the real door through the real path (deployment, initiative, Svammiel's start
   * cameo and its cheat), real heroes (Benedick in the first party once he has landed), every enemy action under the
   * content suite's area watch. rn=<fights> (default 2), rdiff=<difficulty>.
   */
  T.suite('boss_galbraith: review (V3) — real parties (Benedick in one), the start cameo on: every hit inside its marked tiles, the fight ends', function (t) {
    if (!ready(t)) return;
    const watch = T.contentHelpers && T.contentHelpers.watchAreas;
    const pool = Object.keys(DD.defs.heroes).filter(function (id) { return !/^test_/.test(id); });
    if (!watch || pool.length < 4) { t.skip('needs the hero files and content_tests.js (a full run)'); return; }
    const n = Math.max(1, +(t.param('rn', 2)) || 1);
    const rng = DD.RNG('gal-review:' + t.seed);
    let ended = 0;
    for (let i = 0; i < n; i++) {
      const ids = rng.sample(pool, 4);
      if (i === 0 && DD.getHero('benedick') && ids.indexOf('benedick') < 0) ids[0] = 'benedick';
      let res = null, s = null;
      const w = watch(function (ww) {
        s = startFight('review' + i, { real: true, level: 5.5, ids: ids, cameo: true, diff: t.param('rdiff', 'normal') });
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

  // ---- QA voice-5 (Nov 17): the crowned skull of his phase 2 is Galbraith, and Galbraith is "he" ---------------------------
  T.suite('boss_galbraith: QA voice-5 — his encore narration calls the floating skull "he", never "it"', function (t) {
    const enc = DD.defs.narration.galbraith_encore || [];
    if (!enc.length) { t.skip('galbraith.js not loaded'); return; }
    t.ok(!enc.some(function (l) { return /\bskull\b[^.]*\.\s*It\b/.test(l) || /\bIt bows\b/.test(l); }), 'no "It bows"');
    t.ok(enc.some(function (l) { return /Galbraith, now a floating skull in a crown\. He bows/.test(l); }), 'the spotlight finds Galbraith; he bows');
  });
})();
