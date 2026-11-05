/* Dungeons and Degenerates — tests/engine_tests.js
 * Unit tests for the rules engine (grid, LOS, pathing, shapes, damage pipeline, statuses, displacement, elements,
 * deaths, v2 initiative and individual turns, wind-ups, AI turns, costs, undo, deployment, objectives, reinforcements,
 * previews, hooks). Suites are prefixed "engine:". Uses the test_ fixtures from tests/fixtures.js.
 * Sandbox fights roll no dice for the order by default (initiative 'heroesFirst': heroes in the listed order, then the
 * enemies) and `noPlan: true` (the sb() default here) makes AI units pass their round-1 turns.
 */
(function () {
  'use strict';
  const T = window.DD_TEST;
  const DD = window.DD;

  // ---- helpers ------------------------------------------------------------------------------------
  function sb(cfg) { return DD.Combat.sandbox(Object.assign({ w: 8, h: 8, seed: 7, noPlan: true }, cfg || {})); }
  function H(x, y, id, extra) { return Object.assign({ id: id || 'test_mage', x: x, y: y }, extra || {}); }
  function E(x, y, id) { return { id: id || 'test_grunt', x: x, y: y }; }
  function hero(i) { return DD.Combat.heroes()[i || 0]; }
  function foe(i) { return DD.Combat.enemies()[i || 0]; }
  function cur() { return DD.Combat.current(); }
  function tile(x, y) { return DD.Grid.tile(x, y); }
  function keys(tiles) { return tiles.map(function (p) { return p.x + ',' + p.y; }).sort().join(' '); }
  function has(u, id) { return DD.Act.hasStatus(u, id); }
  function setT(x, y, t, h) { const tl = tile(x, y); tl.t = t; if (h !== undefined) tl.h = h; }
  function slotOf(u, id) { return DD.Combat.slotsOf(u).filter(function (s) { return s.id === id; })[0]; }
  function giveSkill(u, id, level) { const s = DD.Act.makeSlot(id, level || 1); u.skills.push(s); return s; }
  function orderDefs() { return DD.Combat.order().map(function (e) { return e.unit.defId; }).join(' '); }
  function entryOf(u) { return DD.Combat.state.order.filter(function (e) { return e.unitId === u.id; })[0] || null; }
  function dist(a, b) { return DD.Grid.dist(a, b); }

  T.helpers = { sb: sb, H: H, E: E, hero: hero, foe: foe, keys: keys, cur: cur };

  // ---- grid & LOS ----------------------------------------------------------------------------------
  T.suite('engine: grid basics', function (t) {
    sb({ heroes: [H(1, 1)], enemies: [E(5, 5)] });
    t.ok(DD.Grid.inBounds(0, 0) && DD.Grid.inBounds(7, 7) && !DD.Grid.inBounds(8, 0) && !DD.Grid.inBounds(-1, 2), 'inBounds');
    t.eq(DD.Grid.tile(1.5, 1), null, 'non-integer tile is null');
    t.eq(DD.Grid.allTiles().length, 64, 'allTiles');
    t.eq(DD.Grid.unitAt(1, 1), hero(), 'unitAt hero');
    t.eq(DD.Grid.neighbors(0, 0).length, 2, 'corner has 2 neighbors');
    t.eq(DD.Grid.dist({ x: 0, y: 0 }, { x: 3, y: 4 }), 7, 'manhattan');
    t.eq(JSON.stringify(DD.Grid.dirTo({ x: 0, y: 0 }, { x: 0, y: 3 })), '{"x":0,"y":1}', 'dirTo');
    setT(2, 2, 'wall');
    t.ok(!DD.Grid.isWalkable(2, 2), 'wall not walkable');
    setT(3, 3, 'pit');
    t.ok(DD.Grid.isPit(3, 3) && !DD.Grid.isWalkable(3, 3), 'pit');
    t.ok(DD.Grid.isWalkable(3, 3, { flags: { flying: true } }), 'flyers cross pits');
    t.ok(!DD.Grid.isWalkable(2, 2, { flags: { flying: true } }), 'flyers do not cross walls');
    DD.Act.placeObject(4, 4, 'crate');
    t.ok(!DD.Grid.isWalkable(4, 4), 'crate blocks');
    DD.Act.placeObject(4, 5, 'spikes');
    t.ok(DD.Grid.isWalkable(4, 5) && DD.Grid.hazardAt(4, 5, hero()) === 'spikes', 'spikes walkable hazard');
    t.ok(!DD.Grid.isFree(1, 1) && DD.Grid.isFree(0, 0), 'isFree');
    t.ok(DD.Grid.isEdge(3, 2) && !DD.Grid.isEdge(0, 7), 'pit edge');
    const nf = DD.Grid.nearestFree(1, 1);
    t.eq(DD.Grid.dist(nf, { x: 1, y: 1 }), 1, 'nearestFree next to an occupied tile');
  });

  T.suite('engine: line of sight', function (t) {
    sb({ w: 10, h: 10 });
    t.ok(DD.Grid.los({ x: 0, y: 0 }, { x: 7, y: 3 }), 'open floor');
    setT(3, 0, 'wall');
    t.ok(!DD.Grid.los({ x: 0, y: 0 }, { x: 6, y: 0 }), 'wall blocks a row');
    t.ok(DD.Grid.los({ x: 0, y: 0 }, { x: 3, y: 1 }) === DD.Grid.los({ x: 3, y: 1 }, { x: 0, y: 0 }), 'symmetric');
    sb({ w: 10, h: 10 });
    setT(1, 0, 'wall');
    t.ok(DD.Grid.los({ x: 0, y: 0 }, { x: 2, y: 2 }), 'can see past a single corner');
    setT(0, 1, 'wall');
    t.ok(!DD.Grid.los({ x: 0, y: 0 }, { x: 2, y: 2 }), 'both corner tiles block');
    sb({ w: 10, h: 10, heroes: [H(2, 5)] });
    t.ok(DD.Grid.los({ x: 0, y: 5 }, { x: 4, y: 5 }), 'units never block LOS');
    tile(2, 0).h = 2;
    t.ok(!DD.Grid.los({ x: 0, y: 0 }, { x: 4, y: 0 }), 'tile 2 higher than both ends blocks');
    tile(2, 0).h = 1;
    t.ok(DD.Grid.los({ x: 0, y: 0 }, { x: 4, y: 0 }), 'tile 1 higher does not block');
    tile(2, 0).h = 2; tile(0, 0).h = 1;
    t.ok(DD.Grid.los({ x: 0, y: 0 }, { x: 4, y: 0 }), 'standing higher sees over');
    DD.Act.placeObject(2, 7, 'pillar');
    t.ok(!DD.Grid.los({ x: 0, y: 7 }, { x: 5, y: 7 }), 'pillar blocks');
    DD.Act.placeObject(2, 8, 'crate');
    t.ok(DD.Grid.los({ x: 0, y: 8 }, { x: 5, y: 8 }), 'crate does not block');
    DD.Act.setSurface(2, 9, 'smoke', 2);
    t.ok(!DD.Grid.los({ x: 0, y: 9 }, { x: 5, y: 9 }), 'smoke blocks');
  });

  T.suite('engine: pathing & reachable', function (t) {
    sb({ heroes: [H(0, 0)] });
    const u = hero();
    let r = DD.Grid.reachable(u, 3);
    t.eq(r.size, 9, 'mov 3 on open floor (start excluded)');
    t.ok(!r.has('0,0'), 'start excluded');
    t.eq(r.get('2,1').path.length, 3, 'path excludes start');
    setT(1, 0, 'mud');
    r = DD.Grid.reachable(u, 3);
    t.eq(r.get('1,0').cost, 2, 'mud costs 2');
    sb({ heroes: [H(0, 0)] });
    tile(1, 0).h = 2; tile(0, 1).h = 1;
    r = DD.Grid.reachable(hero(), 4);
    t.ok(!r.has('1,0') || r.get('1,0').path.length > 1, 'cannot climb 2 in one step');
    t.eq(r.get('0,1').cost, 2, 'climbing 1 costs +1');
    const hopper = hero();
    hopper.flags.hop = true;
    t.eq(DD.Grid.reachable(hopper, 4).get('1,0').cost, 3, 'hop climbs 2 (cost 1+2)');
    hopper.flags.hop = false;
    hopper.flags.flying = true;
    setT(2, 0, 'pit'); setT(3, 0, 'mud');
    r = DD.Grid.reachable(hopper, 4);
    t.ok(r.has('2,0') && r.get('1,0').cost === 1 && r.get('3,0').cost === 3, 'flying ignores height, pits and costs');
    // corridor: through friends, not foes
    sb({ w: 5, h: 1, heroes: [H(0, 0), H(1, 0, 'test_cleric')] });
    r = DD.Grid.reachable(hero(0), 3);
    t.ok(r.has('2,0') && r.has('3,0') && !r.has('1,0'), 'passes through friends, never ends on them');
    sb({ w: 5, h: 1, heroes: [H(0, 0)], enemies: [E(1, 0)] });
    t.eq(DD.Grid.reachable(hero(), 3).size, 0, 'foes block');
    t.eq(DD.Grid.path(hero(), 3, 0), null, 'no path through a foe');
    t.eq(DD.Grid.path(hero(), 3, 0, { ignoreUnits: true }).length, 3, 'ignoreUnits');
    // hazards
    sb({ w: 5, h: 1, heroes: [H(0, 0)] });
    setT(1, 0, 'lava');
    t.eq(DD.Grid.reachable(hero(), 3).get('2,0').hazard, 'lava', 'hazard on path is reported');
    sb({ heroes: [H(0, 0)] });
    DD.Act.setSurface(1, 0, 'fire', 3);
    t.eq(DD.Grid.reachable(hero(), 3).get('1,1').hazard, null, 'equal-cost path avoids the hazard');
    t.eq(DD.Grid.reachable(hero(), 3).get('2,0').hazard, 'fire', 'cheaper path through fire is flagged');
    setT(4, 4, 'pit');
    t.ok(DD.Grid.reachable(hero(), 8).get('4,3').edge, 'pit edge flagged');
    t.eq(DD.Grid.path(hero(), 7, 7).length, 14, 'path length across the map');
  });

  T.suite('engine: area shapes', function (t) {
    sb({ w: 9, h: 9, heroes: [H(1, 4)], enemies: [E(6, 6), E(7, 1)] });
    const u = hero();
    const S = DD.Grid.shape;
    t.eq(S('single', { x: 4, y: 4 }, null, 0, u).length, 1, 'single');
    t.eq(S('circle', { x: 4, y: 4 }, null, 1, u).length, 5, 'circle 1');
    t.eq(S('circle', { x: 4, y: 4 }, null, 2, u).length, 13, 'circle 2');
    t.eq(S('circle', { x: 0, y: 0 }, null, 1, u).length, 3, 'clipped to bounds');
    t.eq(S('square', { x: 4, y: 4 }, null, 1, u).length, 9, 'square');
    t.eq(S('ring', { x: 4, y: 4 }, null, 2, u).length, 8, 'ring 2');
    t.eq(S('cross', { x: 4, y: 4 }, null, 2, u).length, 9, 'cross 2');
    t.eq(keys(S('line', { x: 2, y: 4 }, { x: 1, y: 0 }, 3, u)), '2,4 3,4 4,4', 'line from next to the user');
    setT(3, 4, 'wall');
    t.eq(keys(S('line', { x: 2, y: 4 }, { x: 1, y: 0 }, 3, u)), '2,4', 'line stops at walls');
    setT(3, 4, 'stone');
    DD.Combat.sandbox({ w: 9, h: 9, seed: 1, noPlan: true, heroes: [H(1, 4)], enemies: [E(3, 4), E(5, 4)] });
    const v = hero();
    t.eq(keys(S({ shape: 'line', pierce: false }, { x: 2, y: 4 }, { x: 1, y: 0 }, 6, v)), '2,4 3,4', 'pierce:false stops at the first unit');
    t.eq(keys(S({ shape: 'line' }, { x: 2, y: 4 }, { x: 1, y: 0 }, 6, v)), '2,4 3,4 4,4 5,4 6,4 7,4', 'pierce by default');
    t.eq(keys(S('cone', { x: 2, y: 4 }, { x: 1, y: 0 }, 2, v)), '2,4 3,3 3,4 3,5', 'cone rows 1 and 3 wide');
    t.eq(keys(S('row', { x: 3, y: 4 }, { x: 1, y: 0 }, 1, v)), '3,3 3,4 3,5', 'row perpendicular to dir');
    t.eq(keys(S('adjacent', { x: 1, y: 4 }, null, 1, v)), '0,4 1,3 1,5 2,4', 'adjacent around the user');
    t.eq(keys(S('all_foes', null, null, 0, v)), '3,4 5,4', 'all_foes');
    t.eq(keys(S('all_allies', null, null, 0, v)), '1,4', 'all_allies');
    t.eq(keys(S({ shape: 'custom', fn: function () { return [{ x: 0, y: 0 }, { x: 99, y: 0 }, { x: 0, y: 0 }]; } }, { x: 1, y: 1 }, null, 0, v)), '0,0', 'custom: deduped + in bounds');
  });

  T.suite('engine: smoke battle (autoplay, rolled initiative)', function (t) {
    sb({ w: 9, h: 9, noPlan: false, initiative: 'roll', heroes: [H(1, 3, 'test_knight'), H(1, 5, 'test_mage'), H(0, 4, 'test_cleric'), H(2, 4, 'test_rogue')],
      enemies: [E(7, 3), E(7, 5, 'test_archer'), E(8, 4, 'test_healer')] });
    t.eq(DD.Combat.enemies().length, 3, 'enemies placed');
    t.eq(DD.Combat.state.order.length, 7, 'every hero and enemy rolled initiative');
    const res = DD.AutoPlay.runBattle(30);
    t.log('result ' + res.result + ' in ' + res.rounds + ' rounds, ' + DD.Combat.state.log.length + ' log lines');
    t.ok(res.result === 'victory' || res.result === 'defeat', 'battle resolves: ' + JSON.stringify(res));
    t.ok(DD.Combat.state.log.length > 5, 'log written');
  });

  /** Sandbox that never ends on its own (custom objective), so turns can be cycled with few/no enemies. */
  function quiet(cfg) {
    return sb(Object.assign({ objective: { type: 'custom', text: 'Testing' }, encounter: { id: 'test_quiet', checkObjective: function () { return null; } } }, cfg || {}));
  }
  T.helpers.quiet = quiet;

  T.suite('engine: damage pipeline', function (t) {
    const A = DD.Act;
    sb({ heroes: [H(1, 1)], enemies: [E(2, 1), E(5, 5)] });
    const h = hero(), g = foe(0), g2 = foe(1);
    function fresh() { g.hp = g.maxHp; g.block = 0; g.armor = 0; g.statuses = []; h.statuses = []; }
    t.eq(A.damage(h, g, 5), 5, 'plain damage'); t.eq(g.hp, 9, 'hp reduced');
    fresh(); A.addStatus(h, 'weak'); t.eq(A.damage(h, g, 8), 6, 'Weak -25%');
    fresh(); A.addStatus(h, 'inspired'); t.eq(A.damage(h, g, 8), 10, 'Inspired +25%');
    fresh(); h.dmgBonus = 0.1; t.eq(A.damage(h, g, 10), 11, 'item dmg bonus'); h.dmgBonus = 0;
    fresh(); A.addStatus(g, 'vulnerable'); t.eq(A.damage(h, g, 8), 10, 'Vulnerable +25%');
    fresh(); tile(1, 1).h = 1; t.eq(A.damage(h, g, 8, { cause: 'skill' }), 10, 'high ground +25%');
    fresh(); t.eq(A.damage(h, g, 8, { cause: 'skill', noHighGround: true }), 8, 'noHighGround');
    fresh(); t.eq(A.damage(h, g, 8, { cause: 'status' }), 8, 'no high ground for status ticks'); tile(1, 1).h = 0;
    fresh(); g.resist.fire = 0.5; t.eq(A.damage(h, g, 8, { element: 'fire' }), 4, 'resist 0.5');
    fresh(); g.resist.fire = 0; t.eq(A.damage(h, g, 8, { element: 'fire' }), 0, 'immune (0)'); delete g.resist.fire;
    fresh(); g.resist.frost = 1.5; t.eq(A.damage(h, g, 4, { element: 'frost' }), 6, 'weakness 1.5'); delete g.resist.frost;
    fresh(); g.armor = 2; t.eq(A.damage(h, g, 5), 3, 'armor subtracts');
    fresh(); g.armor = 3; t.eq(A.damage(h, g, 1), 1, 'armor min 1');
    fresh(); g.armor = 2; t.eq(A.damage(h, g, 5, { ignoreArmor: true }), 5, 'ignoreArmor');
    fresh(); g.armor = 2; t.eq(A.damage(h, g, 5, { cause: 'status' }), 5, 'status damage ignores armor');
    fresh(); g.block = 3; t.eq(A.damage(h, g, 5), 2, 'block absorbs first'); t.eq(g.block, 0, 'block spent');
    fresh(); g.block = 3; t.eq(A.damage(h, g, 5, { ignoreBlock: true }), 5, 'ignoreBlock'); t.eq(g.block, 3, 'block kept');
    fresh(); A.addStatus(g, 'marked', { stacks: 3 }); t.eq(A.damage(h, g, 5), 8, 'Marked adds stacks'); t.ok(!has(g, 'marked'), 'mark consumed');
    fresh(); A.addStatus(g, 'invulnerable'); t.eq(A.damage(h, g, 9), 0, 'Invulnerable'); t.eq(g.hp, g.maxHp, 'no hp lost');
    fresh(); A.addStatus(g, 'wet'); t.eq(A.damage(h, g, 4, { element: 'lightning' }), 6, 'Wet: lightning +50%');
    fresh(); A.addStatus(g, 'frozen'); t.eq(A.damage(h, g, 4), 6, 'Frozen: physical +50%');
    fresh(); A.addStatus(g, 'frozen'); A.damage(h, g, 2, { element: 'fire' }); t.ok(!has(g, 'frozen'), 'fire thaws');
    fresh(); A.addStatus(g, 'wet'); A.damage(h, g, 2, { element: 'frost' }); t.ok(has(g, 'frozen') && !has(g, 'wet'), 'frost freezes the Wet');
    fresh(); A.addStatus(g, 'sleep'); A.damage(h, g, 1); t.ok(!has(g, 'sleep'), 'damage wakes sleepers');
    fresh(); A.addStatus(h, 'stealth'); A.damage(h, g, 2); t.ok(!has(h, 'stealth'), 'dealing damage breaks stealth');
    fresh(); A.addStatus(g, 'thorns', { stacks: 2 }); const hp0 = h.hp; A.damage(h, g, 3, { cause: 'skill' }); t.eq(h.hp, hp0 - 2, 'thorns hit the adjacent attacker');
    fresh(); A.addStatus(g2, 'thorns', { stacks: 2 }); const hp1 = h.hp; A.damage(h, g2, 3, { cause: 'skill' }); t.eq(h.hp, hp1, 'thorns need adjacency');
    fresh(); A.addStatus(h, 'taunt', { turns: 1 }, g2); t.eq(A.damage(h, g, 8), 4, 'taunted hero: -50% vs others'); g2.hp = g2.maxHp; t.eq(A.damage(h, g2, 8), 8, 'full vs the taunter');
    fresh(); A.addStatus(h, 'charmed', { turns: 1 }, g); t.eq(A.damage(h, g, 8), 0, 'charmed hero cannot damage the charmer');
    fresh(); A.addStatus(h, 'empowered');
    DD.Combat.resolveSkill(h, h.basic, { x: g.x, y: g.y }, {});
    t.eq(g.hp, g.maxHp - 6, 'Empowered: next damaging skill +50%'); t.ok(!has(h, 'empowered'), 'Empowered consumed after the skill');
    fresh(); A.addRule({ id: 'test_rule_plus2', name: 'Plus Two', hooks: { modifyIncomingDamage: function (d) { d.flat += 2; } } });
    t.eq(A.damage(h, g, 3), 5, 'rule hooks modify damage'); A.removeRule('test_rule_plus2');
    fresh(); h.statuses = [];
    let dealt = null;
    A.addRule({ id: 'test_rule_watch', name: 'Watch', hooks: { onTakeDamage: function (d) { dealt = d; } } });
    A.damage(h, g, 4, { element: 'fire', tags: ['x'], cause: 'skill' });
    t.ok(dealt && dealt.source === h && dealt.target === g && dealt.dealt === 5 && dealt.element === 'fire' && dealt.cause === 'skill', 'DamageCtx fields (incl. +1 elemental passive)');
    fresh(); A.damage(h, g, 4, { element: 'fire' });
    t.eq(g.hp, g.maxHp - 4, "passive only boosts cause 'skill'");
    A.removeRule('test_rule_watch');
    // difficulty
    sb({ difficulty: 'brutal', heroes: [H(1, 1)], enemies: [E(2, 1)] });
    t.eq(foe().maxHp, Math.round(14 * 1.25), 'brutal enemy HP x1.25');
    t.eq(DD.Act.damage(foe(), hero(), 5), 6, 'brutal enemy damage x1.2');
    t.eq(DD.Act.damage(hero(), foe(), 5), 5, 'hero damage unaffected');
    sb({ difficulty: 'casual', heroes: [H(1, 1)], enemies: [E(2, 1)] });
    t.eq(foe().maxHp, Math.round(14 * 0.8), 'casual enemy HP x0.8');
    t.eq(DD.Act.damage(foe(), hero(), 5), 4, 'casual enemy damage x0.8');
    // damageTiles filters
    sb({ heroes: [H(1, 1), H(1, 2, 'test_cleric')], enemies: [E(2, 1), E(2, 2)] });
    const tiles = [{ x: 1, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 1 }, { x: 2, y: 2 }];
    t.eq(DD.Act.damageTiles(hero(), tiles, 2).length, 2, 'damageTiles default: foes only');
    t.eq(DD.Act.damageTiles(hero(), tiles, 2, { filter: 'all' }).length, 4, 'filter all');
    t.eq(DD.Act.damageTiles(hero(), tiles, 2, { filter: 'friends' }).length, 2, 'filter friends');
    // heal
    const c = hero(1);
    c.hp = 10; c.healBonus = 0;
    t.eq(DD.Act.heal(c, c, 5), 5, 'heal'); c.hp = c.maxHp - 2;
    t.eq(DD.Act.heal(c, c, 5), 2, 'heal capped at max HP');
    c.hp = 10; c.healBonus = 0.5; t.eq(DD.Act.heal(c, c, 4), 6, 'heal bonus');
  });

  T.suite('engine: statuses (DESIGN 4.4, durations per own turn)', function (t) {
    const A = DD.Act;
    // one hero vs a grunt that never acts: every endTurn() is one full round, back to the hero
    quiet({ heroes: [H(1, 1)], enemies: [E(6, 6)] });
    const h = hero(), g = foe();
    g.skillSlots = [];
    A.addStatus(g, 'root', { turns: -1 });
    t.eq(Object.keys(DD.defs.statuses).filter(function (k) { return k.indexOf('test_') !== 0; }).length >= 25, true, '25 core statuses registered');
    ['burn', 'poison', 'bleed', 'stun', 'root', 'weak', 'vulnerable', 'taunt', 'haste', 'slow', 'regen', 'stealth', 'marked', 'dazzled', 'confused',
      'charmed', 'inspired', 'wet', 'silenced', 'sleep', 'invulnerable', 'frozen', 'thorns', 'empowered', 'sheep'].forEach(function (id) {
      const d = DD.getStatus(id);
      t.ok(d && d.icon && d.color && typeof d.desc === 'function' && /\w/.test(d.desc({ id: id, stacks: 2, turns: 1, data: {} })), 'status ' + id + ' complete');
      t.ok(d && d.enemyDecay === undefined, 'status ' + id + ': no side-turn decay flags (v2)');
    });
    // stacking rules
    A.addStatus(h, 'burn', { stacks: 2 }); A.addStatus(h, 'burn', { stacks: 3 });
    t.eq(A.getStatus(h, 'burn').stacks, 5, "'stack' adds stacks");
    A.addStatus(h, 'weak', { turns: 1 }); A.addStatus(h, 'weak', { turns: 3 });
    t.eq(A.getStatus(h, 'weak').turns, 3, "'refresh' keeps max turns");
    A.addStatus(h, 'empowered'); A.addStatus(h, 'empowered');
    t.eq(h.statuses.filter(function (s) { return s.id === 'empowered'; }).length, 1, "'none' ignores re-apply");
    h.statuses = [];
    // burn ticks at the end of its own turn, then -1
    A.addStatus(h, 'burn', { stacks: 3 });
    let hp = h.hp;
    DD.Combat.endTurn();
    t.eq(h.hp, hp - 3, 'Burn: stacks damage at the end of its turn'); t.eq(A.getStatus(h, 'burn').stacks, 2, 'Burn -1');
    A.addStatus(h, 'wet');
    t.ok(!has(h, 'burn'), 'Wet puts out Burn');
    t.eq(A.addStatus(h, 'burn', { stacks: 2 }), null, 'cannot Burn while Wet');
    h.statuses = [];
    // poison ignores block, ticks at turn start
    A.addStatus(h, 'poison', { stacks: 3 });
    h.block = 5; hp = h.hp;
    DD.Hooks.fire('onTurnStart', h, h);
    t.eq(h.hp, hp - 3, 'Poison ignores Block'); t.eq(h.block, 5, 'block untouched'); t.eq(A.getStatus(h, 'poison').stacks, 2, 'Poison -1');
    h.statuses = []; h.block = 0;
    // bleed on move action
    A.addStatus(h, 'bleed', { stacks: 2 });
    hp = h.hp;
    t.ok(DD.Combat.move(h, 2, 1), 'move');
    t.eq(h.hp, hp - 2, 'Bleed damages on move'); t.eq(tile(2, 1).surface && tile(2, 1).surface.id, 'blood', 'leaves blood');
    h.statuses = [];
    // regen at turn start
    h.hp = 10; A.addStatus(h, 'regen', { stacks: 3, turns: 2 });
    DD.Combat.endTurn();
    t.eq(h.hp, 13, 'Regen heals stacks at turn start');
    h.statuses = [];
    // stun applied during its own turn: it loses its NEXT turn (passed automatically), then the stun is gone
    A.addStatus(h, 'stun');
    t.eq(DD.Combat.canUse(h, h.basic), 'Stunned!', 'stunned: no skills');
    const r0 = DD.Combat.state.round, n0 = DD.Combat.state.log.length;
    DD.Combat.endTurn();
    t.eq(DD.Combat.state.round, r0 + 2, 'its next turn (round ' + (r0 + 1) + ') was passed: nobody could act');
    t.ok(DD.Combat.state.log.slice(n0).some(function (l) { return /loses the turn \(Stunned\)/.test(l.text); }), 'the log says the turn was lost');
    t.ok(!has(h, 'stun') && h.ap === h.maxAp && cur() === h, 'stun gone, full AP the turn after');
    // haste / slow / charmed (heroes: AP); a buff applied during its own turn covers its next N turns
    A.addStatus(h, 'haste', { turns: 2 });
    DD.Combat.endTurn();
    t.eq(h.ap, h.maxAp + 1, 'Haste: +1 AP');
    DD.Combat.endTurn();
    t.eq(h.ap, h.maxAp + 1, 'Haste (2 turns, cast on its own turn): both of its next 2 turns');
    DD.Combat.endTurn();
    t.eq(h.ap, h.maxAp, 'then gone');
    A.addStatus(h, 'slow', { turns: 2 });
    DD.Combat.endTurn();
    t.eq(h.ap, h.maxAp - 1, 'Slow: -1 AP');
    h.statuses = [];
    A.addStatus(h, 'charmed', { turns: 2 }, g);
    t.eq(DD.Combat.turnAp(h), h.maxAp - 1, 'charmed hero: -1 AP');
    h.statuses = [];
    // enemies: haste / slow move
    const m = g.mov;
    A.addStatus(g, 'haste'); t.eq(DD.Combat.effectiveMov(g), m + 2, 'enemy Haste +2 move'); A.removeStatus(g, 'haste');
    A.addStatus(g, 'slow'); t.eq(DD.Combat.effectiveMov(g), Math.max(1, m - 2), 'enemy Slow -2 move'); A.removeStatus(g, 'slow');
    // root
    h.ap = 3;
    A.addStatus(h, 'root', { turns: 1 });
    t.eq(DD.Combat.reachable(h).size, 0, 'Root: no move actions');
    t.ok(!DD.Combat.move(h, h.x + 1, h.y), 'Root: move refused');
    t.ok(A.push(null, h, { x: 1, y: 0 }, 1).moved === 1, 'Root: can still be pushed');
    h.statuses = [];
    // dazzled hero: -1 max range; confused hero: moving costs 2 AP
    t.eq(DD.Targeting.range(h, DD.getSkill('test_bolt'), 1)[1], 5, 'base range');
    A.addStatus(h, 'dazzled'); t.eq(DD.Targeting.range(h, DD.getSkill('test_bolt'), 1)[1], 4, 'Dazzled hero: -1 max range'); A.removeStatus(h, 'dazzled');
    A.addStatus(h, 'confused'); t.eq(DD.Combat.moveApCost(h), 2, 'Confused hero: move costs 2 AP');
    h.ap = 3;
    const ap = h.ap; DD.Combat.move(h, h.x, h.y + 1); t.eq(h.ap, ap - 2, 'paid 2 AP'); h.statuses = [];
    // silence: no spells
    A.addStatus(h, 'silenced');
    t.eq(DD.Combat.canUse(h, h.basic), 'Silenced!', 'Silenced: spells blocked');
    A.removeStatus(h, 'silenced');
    // sheep
    A.addStatus(h, 'sheep');
    t.ok(/Baa/.test(DD.Combat.canUse(h, h.basic)), 'Sheep: no skills');
    t.eq(DD.Combat.effectiveMov(h), 2, 'Sheep: move 2');
    h.statuses = [];
    // stealth: enemy single-target skills can't pick it
    quiet({ heroes: [H(1, 1), H(1, 3, 'test_cleric')], enemies: [E(1, 4)] });
    const c = hero(1), g4 = foe();
    A.addStatus(c, 'stealth');
    t.ok(DD.Targeting.validTargets(g4, DD.getSkill('test_grunt_stab')).every(function (p) { return p.x !== c.x || p.y !== c.y; }), 'Stealth: not targetable by enemies');
    t.eq(DD.AI.targetsFor(g4).indexOf(c), -1, 'Stealth: AI ignores it');
    // charm (enemy) flips sides
    sb({ heroes: [H(1, 1)], enemies: [E(3, 3), E(4, 4)] });
    const g1 = foe(0), g3 = foe(1);
    A.addStatus(g1, 'charmed', { turns: 1 }, hero());
    t.ok(DD.Grid.hostile(g1, g3) && !DD.Grid.hostile(g1, hero()), 'charmed enemy fights its own side');
    // immunities
    g3.flags.stunImmune = true;
    t.eq(A.addStatus(g3, 'stun'), null, 'stunImmune');
    t.eq(A.addStatus(g3, 'sleep'), null, 'stunImmune covers sleep');
    // modifyStatus hook can cancel
    A.addRule({ id: 'test_no_poison', name: 'No Poison', hooks: { modifyStatus: function (mm) { if (mm.id === 'poison') mm.cancel = true; } } });
    t.eq(A.addStatus(g3, 'poison', { stacks: 2 }), null, 'modifyStatus cancel');
    A.removeRule('test_no_poison');
    // cleanse
    A.addStatus(g3, 'weak'); A.addStatus(g3, 'vulnerable'); A.addStatus(g3, 'inspired');
    t.eq(A.cleanse(g3, 'debuff'), 2, 'cleanse removes debuffs'); t.ok(has(g3, 'inspired'), 'buffs kept');
    // durations on enemies: turns 1 from a hero's turn covers that enemy's next turn
    quiet({ heroes: [H(1, 1)], enemies: [E(6, 6)] });
    A.addStatus(foe(), 'weak', { turns: 1 });
    t.ok(has(foe(), 'weak'), 'present during the hero\'s turn');
    DD.Combat.endTurn();
    t.ok(!has(foe(), 'weak'), 'expired at the end of the enemy\'s own (next) turn');
    A.addStatus(foe(), 'root', { turns: 1 });
    const pos = { x: foe().x, y: foe().y };
    DD.Combat.endTurn();
    t.ok(foe().x === pos.x && foe().y === pos.y, 'enemy Root (1) holds it through its next turn (it could not walk up)');
    t.ok(!has(foe(), 'root'), 'and then expires');
  });

  T.suite('engine: push, bump, pits, lava, water, ice', function (t) {
    const A = DD.Act;
    const E1 = { x: 1, y: 0 };
    function setup(extraEnemies) { return quiet({ heroes: [H(1, 3)], enemies: [E(2, 3)].concat(extraEnemies || []) }); }
    setup();
    let r = A.push(hero(), foe(), E1, 2);
    t.ok(r.moved === 2 && foe().x === 4 && r.blockedBy === null, 'push 2 on open floor');
    setup(); setT(3, 3, 'wall');
    r = A.push(hero(), foe(), E1, 2);
    t.ok(r.moved === 0 && r.blockedBy === 'wall' && foe().hp === 11, 'wall: blocked + 3 bump');
    setup([E(3, 3)]);
    r = A.push(hero(), foe(0), E1, 2);
    t.ok(r.blockedBy === 'unit' && foe(0).hp === 11 && foe(1).hp === 11 && r.hitUnit === foe(1), 'unit: both bumped');
    setup(); A.placeObject(3, 3, 'crate');
    r = A.push(hero(), foe(), E1, 1, { bump: 2 });
    t.ok(r.blockedBy === 'object' && foe().hp === 12 && tile(3, 3).obj.hp === 4, 'object: custom bump hits unit and object');
    quiet({ heroes: [H(1, 3)], enemies: [E(7, 3)] });
    r = A.push(hero(), foe(), E1, 1);
    t.ok(r.blockedBy === 'edge' && foe().hp === 11, 'map edge bumps');
    setup(); tile(3, 3).h = 2;
    t.eq(A.push(hero(), foe(), E1, 1).blockedBy, 'height', 'cliff (+2) blocks');
    setup(); tile(2, 3).h = 2;
    t.eq(A.push(hero(), foe(), E1, 1).moved, 1, 'pushing down a cliff is fine');
    // pits
    setup(); setT(3, 3, 'pit');
    const s = DD.Combat.state;
    r = A.push(hero(), foe(), E1, 2);
    t.ok(r.fell && s.units.filter(function (u) { return u.defId === 'test_grunt'; })[0].dead, 'enemy YEETED into the pit');
    t.eq(s.hype, 20, 'environmental kill: +20 Hype'); t.eq(s.stats.envKills, 1, 'envKills stat');
    quiet({ heroes: [H(2, 3), H(0, 0, 'test_cleric')], enemies: [E(1, 3), E(6, 6)] });
    setT(3, 3, 'pit');
    const hh = hero(); const max = hh.maxHp;
    r = A.push(foe(), hh, E1, 1);
    t.ok(!hh.dead && !hh.downed && hh.hp === max - Math.ceil(max * 0.25), 'hero loses 25% max HP');
    t.ok(!(hh.x === 3 && hh.y === 3) && DD.Grid.isWalkable(hh.x, hh.y) && DD.Grid.dist(hh, { x: 3, y: 3 }) === 1, 'and climbs out next to the pit');
    quiet({ w: 9, h: 9, heroes: [H(1, 3)], enemies: [E(2, 3, 'test_boss')] });
    setT(4, 3, 'pit');
    const b = foe();
    b.flags.large = false;
    r = A.push(hero(), b, E1, 2);
    t.ok(!b.dead && b.hp === b.maxHp - Math.ceil(b.maxHp * 0.25), 'bosses survive pits (-25%)');
    setup(); setT(3, 3, 'deep_water');
    A.push(hero(), foe(), E1, 1);
    t.ok(DD.Combat.state.units.filter(function (u) { return u.defId === 'test_grunt'; })[0].dead, 'deep water drowns non-boss enemies');
    // lava / water / ice
    setup(); setT(3, 3, 'lava');
    A.push(hero(), foe(), E1, 1);
    t.ok(foe().hp === 6 && A.getStatus(foe(), 'burn').stacks === 2, 'lava: 8 fire damage + Burn 2');
    setup(); setT(3, 3, 'water');
    A.addStatus(foe(), 'burn', { stacks: 3 });
    A.push(hero(), foe(), E1, 1);
    t.ok(!has(foe(), 'burn') && has(foe(), 'wet'), 'water: Wet, Burn removed');
    setup(); setT(3, 3, 'ice');
    A.push(hero(), foe(), E1, 1);
    t.eq(foe().x, 4, 'ice: slide 1 extra');
    setup(); DD.Act.setSurface(3, 3, 'ice', 3);
    A.push(hero(), foe(), E1, 1);
    t.eq(foe().x, 4, 'ice surface slides too');
    quiet({ heroes: [H(1, 3)], enemies: [E(2, 3, 'test_brute')] });
    r = A.push(hero(), foe(), E1, 3);
    t.ok(r.moved === 0 && foe().x === 2, 'immovable ignores pushes');
    // traps & plates, per-tile onEnterTile, bleed on forced movement
    setup(); A.placeObject(4, 3, 'spikes');
    let entered = [];
    A.addRule({ id: 'test_enter', name: 'Enter', hooks: { onEnterTile: function (u, tl, cause) { entered.push(tl.x + ',' + tl.y + ':' + cause); } } });
    A.push(hero(), foe(), E1, 2);
    t.eq(foe().hp, 9, 'spikes: 5 damage on entry');
    t.eq(entered.join(' '), '3,3:push 4,3:push', 'onEnterTile per tile with cause push');
    A.removeRule('test_enter');
    setup();
    let pressed = null;
    A.placeObject(3, 3, 'pressure_plate', { onEnter: function (u, o, tl) { pressed = { u: u, o: o, tl: tl }; } });
    A.push(hero(), foe(), E1, 1);
    t.ok(pressed && pressed.u === foe() && pressed.o.id === 'pressure_plate' && pressed.tl.x === 3, 'instance onEnter override (plate)');
    setup(); A.placeObject(3, 3, 'pressure_plate');
    A.push(hero(), foe(), E1, 1);
    t.ok(tile(3, 3).obj.data.pressed, 'default plate records the press');
    setup(); A.addStatus(foe(), 'bleed', { stacks: 2 });
    A.push(hero(), foe(), E1, 1);
    t.eq(foe().hp, 12, 'Bleed: forced movement hurts');
    // pull / knockback / teleport / swap
    quiet({ heroes: [H(1, 3)], enemies: [E(5, 3)] });
    r = A.pull(hero(), foe(), hero(), 6);
    t.ok(foe().x === 2 && r.blockedBy === null, 'pull stops next to the puller (no bump)');
    quiet({ heroes: [H(1, 3)], enemies: [E(2, 3)] });
    A.knockback(hero(), foe(), 2);
    t.eq(foe().x, 4, 'knockback pushes away from the source');
    t.ok(A.teleport(foe(), 6, 6) && foe().x === 6, 'teleport to a free tile');
    t.ok(!A.teleport(foe(), 1, 3), 'teleport onto a unit fails');
    t.ok(A.swap(hero(), foe()) && hero().x === 6 && foe().x === 1, 'swap');
  });

  T.suite('engine: elements & surfaces', function (t) {
    const A = DD.Act;
    quiet({ w: 9, h: 9, heroes: [H(0, 0)], enemies: [E(8, 8)] });
    [[1, 1], [2, 1], [3, 1], [3, 2]].forEach(function (p) { A.setSurface(p[0], p[1], 'oil', 5); });
    A.applyElement(1, 1, 'fire', hero());
    t.ok([[1, 1], [2, 1], [3, 1], [3, 2]].every(function (p) { return tile(p[0], p[1]).surface.id === 'fire'; }), 'fire spreads along the oil slick');
    A.setSurface(5, 1, 'water', 3);
    A.applyElement(5, 1, 'fire', hero());
    t.eq(tile(5, 1).surface.id, 'steam', 'fire evaporates water into steam');
    t.ok(!DD.Grid.los({ x: 4, y: 1 }, { x: 6, y: 1 }), 'steam blocks LOS');
    A.setSurface(6, 2, 'web', 3); A.applyElement(6, 2, 'fire', hero());
    t.eq(tile(6, 2).surface.id, 'fire', 'fire burns webs');
    A.setSurface(7, 2, 'fire', 3); A.applyElement(7, 2, 'water', hero());
    t.eq(tile(7, 2).surface, null, 'water extinguishes fire');
    A.setSurface(7, 3, 'fire', 3); A.applyElement(7, 3, 'frost', hero());
    t.eq(tile(7, 3).surface, null, 'frost removes fire');
    A.setSurface(6, 3, 'ice', 3); A.applyElement(6, 3, 'fire', hero());
    t.eq(tile(6, 3).surface.id, 'water', 'fire melts ice sheets');
    setT(1, 4, 'water'); A.applyElement(1, 4, 'frost', hero());
    t.eq(tile(1, 4).t, 'ice', 'frost freezes water'); A.applyElement(1, 4, 'fire', hero());
    t.eq(tile(1, 4).t, 'water', 'fire melts it back');
    setT(2, 4, 'deep_water'); A.applyElement(2, 4, 'frost', hero());
    t.ok(tile(2, 4).t === 'ice' && DD.Grid.isWalkable(2, 4), 'frozen deep water is walkable');
    A.applyElement(2, 4, 'fire', hero());
    t.eq(tile(2, 4).t, 'deep_water', 'and melts back to deep water');
    setT(3, 4, 'lava'); A.applyElement(3, 4, 'water', hero());
    t.eq(tile(3, 4).t, 'obsidian', 'water cools lava to obsidian');
    A.applyElement(4, 4, 'poison', hero()); t.eq(tile(4, 4).surface.id, 'poison', 'poison surface');
    A.applyElement(5, 4, 'blood', hero()); t.eq(tile(5, 4).surface.id, 'blood', 'blood surface');
    A.applyElement(6, 4, 'oil', hero()); t.eq(tile(6, 4).surface.id, 'oil', 'oil surface');
    A.applyElement(7, 4, 'water', hero()); t.eq(tile(7, 4).surface.id, 'water', 'water makes a puddle');
    A.applyElement(5, 5, 'fire', hero());
    t.eq(tile(5, 5).surface, null, 'fire alone does not leave fire on bare floor');
    // units
    quiet({ heroes: [H(0, 0)], enemies: [E(2, 2), E(3, 3), E(4, 4)] });
    A.applyElement(2, 2, 'fire', hero()); t.eq(A.getStatus(foe(0), 'burn').stacks, 2, 'fire burns the unit there');
    A.applyElement(2, 2, 'water', hero()); t.ok(!has(foe(0), 'burn') && has(foe(0), 'wet'), 'water: extinguish + Wet');
    A.applyElement(2, 2, 'fire', hero()); t.ok(!has(foe(0), 'wet') && !has(foe(0), 'burn'), 'fire on Wet just dries it');
    A.addStatus(foe(1), 'wet'); A.applyElement(3, 3, 'frost', hero());
    t.ok(has(foe(1), 'frozen'), 'frost freezes Wet units');
    // electrified water body
    quiet({ w: 9, h: 9, heroes: [H(0, 0)], enemies: [E(3, 6), E(4, 6), E(7, 6)] });
    [2, 3, 4, 5].forEach(function (x) { setT(x, 6, 'water'); });
    A.applyElement(2, 6, 'lightning', hero());
    t.ok(foe(0).hp === 10 && foe(1).hp === 10 && has(foe(0), 'stun') && has(foe(1), 'stun'), 'lightning shocks everyone in the pool');
    t.ok(foe(2).hp === 14 && !has(foe(2), 'stun'), 'units outside the water are fine');
    // explosive barrels chain
    quiet({ w: 9, h: 9, heroes: [H(0, 0)], enemies: [E(4, 5), E(8, 8)] });
    A.placeObject(4, 4, 'barrel_explosive'); A.placeObject(5, 4, 'barrel_explosive');
    t.ok(A.damageObject(hero(), 4, 4, 10), 'barrel destroyed');
    t.ok(!tile(4, 4).obj && !tile(5, 4).obj, 'chain reaction: both barrels exploded');
    t.eq(foe(0).hp, 6, 'explosion: 8 fire damage');
    t.ok(tile(6, 4).surface && tile(6, 4).surface.id === 'fire', 'explosions leave fire');
    // braziers & kegs
    quiet({ w: 9, h: 9, heroes: [H(0, 0)], enemies: [E(8, 8)] });
    A.placeObject(4, 4, 'brazier'); A.damageObject(hero(), 4, 4, 5);
    t.ok(tile(4, 5).surface.id === 'fire' && tile(4, 4).surface.id === 'fire', 'brazier destroyed: fire radius 1');
    A.placeObject(2, 6, 'keg'); A.damageObject(hero(), 2, 6, 6);
    t.eq(tile(2, 7).surface.id, 'water', 'keg floods with ale');
    // surfaces expire
    A.setSurface(7, 7, 'smoke', 1);
    DD.Combat.endTurn();
    t.eq(tile(7, 7).surface, null, 'surface turns tick down each round');
    // surface turn-end effects
    quiet({ heroes: [H(2, 2)], enemies: [E(7, 7)] });
    A.setSurface(2, 2, 'holy', 3);
    hero().hp = 10;
    DD.Combat.endTurn();
    t.eq(hero().hp, 13, 'holy ground heals heroes at the end of their turn');
  });

  T.suite('engine: objects & interactions', function (t) {
    const A = DD.Act;
    quiet({ heroes: [H(2, 2)], enemies: [E(7, 7)], gold: 10 });
    const h = hero();
    let pulled = 0;
    A.placeObject(3, 2, 'lever', { onInteract: function (u, o) { pulled++; t.ok(o.data.on === true, 'lever toggled before the instance callback'); } });
    A.placeObject(2, 3, 'chest');
    A.placeObject(1, 2, 'fountain');
    A.placeObject(2, 1, 'mirror', { data: { facing: 'E' } });
    const ia = DD.Combat.interactions(h);
    t.eq(ia.length, 4, 'four adjacent interactables');
    t.ok(DD.Combat.interact(h, 3, 2) && pulled === 1 && tile(3, 2).obj.data.on, 'pull the lever (1 AP)');
    t.eq(h.ap, 2, 'interaction costs AP');
    t.ok(DD.Combat.interact(h, 2, 3), 'open the chest');
    t.ok(DD.Combat.state.sandboxGold >= 18, 'chest gives gold');
    t.ok(!DD.Combat.interactions(h).some(function (o) { return o.x === 2 && o.y === 3; }), 'opened chests are no longer interactable');
    h.hp = 5;
    t.ok(DD.Combat.interact(h, 1, 2) && h.hp === 15, 'fountain heals 10');
    t.eq(h.ap, 0, 'out of AP');
    DD.Combat.endTurn();
    t.ok(!DD.Combat.interactions(h).some(function (o) { return o.x === 1 && o.y === 2; }), 'fountain only once');
    t.ok(DD.Combat.interact(h, 2, 1) && tile(2, 1).obj.data.facing === 'S', 'mirror rotates clockwise');
    t.ok(!DD.Combat.interact(h, 5, 5), 'nothing to interact with there');
    A.placeObject(4, 4, 'crate');
    t.eq(A.placeObject(h.x, h.y, 'crate'), null, 'cannot drop a blocking object on a unit');
    t.ok(A.removeObject(4, 4).id === 'crate' && !tile(4, 4).obj, 'removeObject');
    A.placeObject(4, 4, 'pillar');
    t.ok(!A.damageObject(h, 4, 4, 99) && tile(4, 4).obj, 'pillars are indestructible');
  });

  T.suite('engine: deaths, downed, Help Up, defeat', function (t) {
    const A = DD.Act;
    let ends = [], endEvents = 0;
    const off = DD.Events.on('combat:end', function () { endEvents++; });
    sb({ heroes: [H(1, 1), H(1, 2, 'test_cleric')], enemies: [E(2, 1), E(6, 6)], onEnd: function (r) { ends.push(r); } });
    const s = DD.Combat.state;
    const h = hero(), c = hero(1), g = foe(0), g2 = foe(1);
    const seen = { death: 0, kill: 0, ally: 0 };
    A.addRule({ id: 'test_watch', name: 'Watch', hooks: {
      onDeath: function (u) { if (u === g) seen.death++; }, onKill: function (d) { if (d.target === g) seen.kill++; },
      onAllyDeath: function (u, dead) { if (u === g2 && dead === g) seen.ally++; } } });
    A.damage(h, g, 99);
    t.ok(g.dead && !DD.Grid.unitAt(2, 1) && g.intents.length === 0, 'enemy dies and leaves the board');
    t.ok(s.units.indexOf(g) >= 0, 'dead units stay in state.units');
    t.eq(s.hype, 8, '+8 Hype for a hero kill');
    t.ok(seen.death === 1 && seen.kill === 1 && seen.ally === 1, 'onDeath / onKill / onAllyDeath');
    t.ok(s.stats.units[h.id].kills === 1, 'kill stats');
    A.addStatus(c, 'burn', { stacks: 2 });
    A.damage(g2, c, 99);
    t.ok(c.downed && !c.dead && c.hp === 0 && DD.Grid.unitAt(1, 2) === c, 'hero downed, stays on its tile');
    t.eq(c.statuses.length, 0, 'statuses cleared when downed');
    t.ok(!DD.Targeting.validTargets(g2, DD.getSkill('test_poke')).some(function (p) { return p.x === 1 && p.y === 2; }), 'downed heroes are untargetable');
    t.eq(A.damage(g2, c, 5), 0, 'and take no damage');
    const help = DD.Combat.interactions(h).filter(function (o) { return o.kind === 'helpUp'; })[0];
    t.ok(help && help.ap === 2, 'Help Up offered for 2 AP');
    t.ok(DD.Combat.interact(h, 1, 2) && !c.downed && c.hp === Math.round(c.maxHp * 0.25), 'Help Up revives at 25%');
    t.eq(h.ap, 1, 'paid 2 AP');
    t.eq(s.result, null, 'still fighting');
    A.kill(h, g2); A.kill(c, g2);
    t.ok(h.downed && c.downed, 'kill() downs heroes');
    t.eq(s.result, 'defeat', 'defeat when no hero is active');
    t.eq(ends.join(','), 'defeat', 'onEnd called once with the result');
    t.eq(endEvents, 1, 'combat:end emitted once');
    off();
    // victory + summons die at 0 HP
    sb({ heroes: [H(1, 1, 'test_summoner')], enemies: [E(6, 6)] });
    const pup = DD.Combat.party().filter(function (u) { return u.kind === 'summon'; })[0];
    t.ok(pup && pup.ownerId === hero().id && pup.side === 'hero', 'passive summon at combat start');
    A.damage(foe(), pup, 99);
    t.ok(pup.dead, 'summons die at 0 HP');
    t.eq(DD.Combat.state.result, null, 'losing a summon is not defeat');
    A.kill(foe(), hero());
    t.eq(DD.Combat.state.result, 'victory', 'victory when every enemy is dead');
  });

  // =====================================================================================================
  // v2: initiative, individual turns, wind-ups, AI turns that act at once (docs/notes/rules.md "v2")
  // =====================================================================================================
  const DIRS4 = DD.util.DIRS;
  /** Register throwaway defs for one suite; they are removed again even if the suite throws. */
  function withTemp(kind, defs, fn) {
    const reg = { skills: DD.registerSkill, enemies: DD.registerEnemy, summons: DD.registerSummon, items: DD.registerItem };
    defs.forEach(function (d) { reg[kind](d); });
    try { return fn(); } finally { defs.forEach(function (d) { delete DD.defs[kind][d.id]; }); }
  }
  /** Register throwaway statuses / surfaces / objects for one suite (removed again even if it throws). */
  function withDefs(kind, defs, fn) {
    const reg = { statuses: DD.registerStatus, surfaces: DD.registerSurface, objects: DD.registerObject };
    defs.forEach(function (d) { reg[kind](d); });
    try { return fn(); } finally { defs.forEach(function (d) { delete DD.defs[kind][d.id]; }); }
  }
  function byDef(id) { return DD.Combat.state.units.filter(function (u) { return u.defId === id && !u.dead; })[0]; }
  function logSince(n, re) { return DD.Combat.state.log.slice(n).some(function (l) { return re.test(l.text); }); }
  function shifted(tiles, d) {
    return tiles.map(function (p) { return { x: p.x + d.x, y: p.y + d.y }; }).filter(function (p) { return DD.Grid.inBounds(p.x, p.y); });
  }
  function captureSkill(user, fn) {
    let seen = null;
    DD.Act.addRule({ id: 'test_capture', name: 'Capture', hooks: { onSkillUsed: function (ctx) { if (ctx.user === user) seen = ctx; } } });
    try { fn(); } finally { DD.Act.removeRule('test_capture'); }
    return seen;
  }
  /** Count the skill uses of every unit while fn runs: { 'defId:skillId': n }. */
  function countUses(fn) {
    const n = {};
    DD.Act.addRule({ id: 'test_uses', name: 'Uses', hooks: { onSkillUsed: function (ctx) { const k = ctx.user.defId + ':' + ctx.skill.id; n[k] = (n[k] || 0) + 1; } } });
    try { fn(); } finally { DD.Act.removeRule('test_uses'); }
    return n;
  }
  const SPR = { base: 'humanoid' };

  T.suite('engine: v2 initiative — d20 + init, ties, fixed for the fight, sandbox orders', function (t) {
    let rolled = null;
    const off = DD.Events.on('initiative:rolled', function (e) { rolled = e; });
    const cfg = { w: 9, h: 9, seed: 'init-1', initiative: 'roll', heroes: [H(1, 1, 'test_knight'), H(1, 3, 'test_rogue'), H(1, 5)],
      enemies: [E(7, 1), E(7, 3, 'test_coward'), E(7, 5, 'test_brute')] };
    quiet(cfg);
    off();
    const s = DD.Combat.state;
    t.ok(rolled && rolled.order.length === 6 && rolled.rolled === true, 'initiative:rolled with all 6 rolls');
    t.eq(s.order.length, 6, 'state.order: one entry per hero and enemy');
    const inits = {};
    s.order.forEach(function (e) {
      const u = DD.Combat.byId(e.unitId);
      inits[u.defId] = e.init;
      t.ok(e.roll >= 1 && e.roll <= 20 && e.total === e.roll + e.init, u.defId + ': d20 ' + e.roll + ' + ' + e.init + ' = ' + e.total);
    });
    t.ok(inits.test_knight === -1 && inits.test_rogue === 3 && inits.test_mage === 1, 'heroes: stats.init (knight −1, rogue +3, mage +1)');
    t.ok(inits.test_grunt === 0 && inits.test_coward === 3 && inits.test_brute === 1, 'enemies: def init (coward +3), else by tier (normal 0, elite +1)');
    let sorted = true;
    for (let i = 1; i < s.order.length; i++) {
      const a = s.order[i - 1], b = s.order[i];
      if (a.total < b.total || (a.total === b.total && a.init < b.init)) sorted = false;
    }
    t.ok(sorted, 'sorted by total, then init');
    t.eq(DD.Combat.order().length, 6, 'Combat.order()');
    const firstHero = s.order.filter(function (e) { return e.side === 'hero'; })[0];
    t.eq(cur() && cur().id, firstHero.unitId, 'enemies before the first hero passed their turn (noPlan): the first hero in the order is current');
    t.ok(DD.Combat.order().some(function (e) { return e.current && e.unit === cur(); }), 'order() marks the current entry');
    const sig = function () { return DD.Combat.state.order.map(function (e) { return DD.Combat.byId(e.unitId).defId + e.total; }).join(' '); };
    const first = sig();
    DD.Combat.endRound();
    DD.Combat.endRound();
    t.eq(sig(), first, 'the order is fixed for the fight (same after 2 more rounds)');
    quiet(cfg);
    t.eq(sig(), first, 'same seed, same rolls (state.rng)');
    // ties: higher init, then heroes, then a coin flip; modifyInitiative(r) can change a roll
    quiet({ initiative: 'roll', seed: 'ties', heroes: [H(1, 1, 'test_knight'), H(1, 3)], enemies: [E(6, 1), E(6, 3, 'test_brute')],
      rules: [{ id: 'test_tie', name: 'Everybody Rolls 10', hooks: { modifyInitiative: function (r) { r.total = 10; } } }] });
    t.eq(orderDefs(), 'test_mage test_brute test_grunt test_knight', 'all on 10: init +1 (hero first) · +1 · 0 · −1');
    t.ok(DD.Combat.state.order.every(function (e) { return e.total === 10 && typeof e.tie === 'number'; }), 'modifyInitiative(r) set every total; a pre-rolled coin flip is kept for exact ties');
    // two entries per round (a boss def's turnsPerRound)
    withTemp('enemies', [{ id: 'test_tmp_twice', name: 'Double Dipper', act: 1, tier: 'boss', hp: 50, sprite: SPR, skills: [], turnsPerRound: 2 }], function () {
      quiet({ initiative: 'roll', seed: 'twice', heroes: [H(1, 1)], enemies: [E(6, 6, 'test_tmp_twice')] });
      const es = DD.Combat.state.order.filter(function (e) { return DD.Combat.byId(e.unitId).defId === 'test_tmp_twice'; });
      t.ok(es.length === 2 && es[0].k !== es[1].k, 'turnsPerRound 2: two entries, rolled separately');
      t.eq(es[0].init, 2, 'boss tier default init +2');
      let turns = 0;
      const offT = DD.Events.on('turn:start', function (e) { if (e.unit.defId === 'test_tmp_twice') turns++; });
      DD.Combat.endRound();
      offT();
      t.ok(turns >= 2, 'it takes both turns in a round (' + turns + ')');
    });
    // sandbox orders without dice
    const heroes = [H(1, 1, 'test_knight'), H(1, 3)], enemies = [E(6, 1), E(6, 3, 'test_archer')];
    quiet({ heroes: heroes, enemies: enemies });
    t.eq(orderDefs(), 'test_knight test_mage test_grunt test_archer', 'sandbox default (heroesFirst): heroes in the listed order, then enemies');
    t.ok(cur() === hero(0) && DD.Combat.state.order.every(function (e) { return e.fixed && e.roll === 0; }), 'no dice rolled; the first hero\'s turn');
    quiet({ heroes: heroes, enemies: enemies, initiative: 'enemiesFirst' });
    t.eq(orderDefs(), 'test_grunt test_archer test_knight test_mage', "initiative: 'enemiesFirst'");
    t.eq(cur(), hero(0), 'the enemies passed (noPlan), so the knight is up');
    quiet({ heroes: heroes, enemies: enemies, order: ['test_archer', 'test_mage'] });
    t.eq(orderDefs(), 'test_archer test_mage test_knight test_grunt', 'order: [ids]: listed first, the rest heroes-first');
    quiet({ heroes: heroes, enemies: enemies, order: ['test_archer'], initiative: 'roll', seed: 'mix' });
    t.eq(DD.Combat.order()[0].unit.defId, 'test_archer', 'order + roll: the listed unit first, the rest rolled');
    t.ok(DD.Combat.order().slice(1).every(function (e) { return e.roll >= 1; }), '... with real rolls');
    // real fights roll by default
    DD.Combat.start({ grid: DD.Combat.emptyGrid(8, 8), heroes: [{ id: 'test_mage', x: 1, y: 1 }], enemies: [{ id: 'test_grunt', x: 6, y: 6 }] }, { seed: 3, headless: true });
    t.ok(DD.Combat.state.initMode === 'roll' && DD.Combat.state.order.every(function (e) { return e.roll >= 1 && !e.fixed; }), 'Combat.start without deployment: rolls at once');
  });

  T.suite('engine: v2 turns — one unit at a time, endTurn runs the AI turns, round and turn events', function (t) {
    const log = [];
    const names = ['round:start', 'round:end', 'turn:start', 'turn:end', 'turn:player', 'turn:enemy'];
    const offs = names.map(function (n) { return DD.Events.on(n, function (e) { log.push(n + (e && e.unit ? ':' + e.unit.defId.replace('test_', '') : e && e.round ? ':' + e.round : '')); }); });
    quiet({ noPlan: false, heroes: [H(1, 1, 'test_knight'), H(1, 3)], enemies: [E(3, 1), E(7, 7)] });
    const s = DD.Combat.state, k = hero(0), m = hero(1);
    t.eq(cur(), k, 'round 1: the knight\'s turn first');
    t.ok(DD.Combat.isPlayerTurn() && s.phase === 'player' && DD.Combat.controllable(k) && !DD.Combat.controllable(m), 'only the current hero can act');
    t.eq(DD.Combat.canUse(m, m.basic), 'Not Wizzy McTest\'s turn.', 'others are told whose turn it is');
    t.ok(!DD.Combat.move(m, 2, 3), 'and cannot move');
    t.ok(m.ap === 0 && k.ap === 3, 'AP only on your own turn (knight 3, mage 0)');
    t.eq(k.block, 3, 'the knight\'s Overly Prepared: 3 Block at the start of his round-1 turn');
    t.eq(DD.Combat.turnGroup().length, 1, 'turnGroup: the knight alone');
    k.ap = 1;
    const turn0 = s.turn;
    t.ok(DD.Combat.endTurn(), 'endTurn');
    t.eq(cur(), m, 'the mage\'s turn, same round');
    t.ok(s.round === 1 && s.turn === turn0 + 1, 'still round 1; state.turn counts turns');
    t.eq(k.ap, 0, 'unused AP is lost (no Guard)');
    t.eq(k.block, 3, 'no Guard Block either');
    t.eq(m.ap, 3, 'the mage gets his AP at the start of his turn');
    const uses = countUses(function () { t.ok(DD.Combat.endTurn(), 'endTurn'); });
    t.ok(s.round === 2 && cur() === k, 'the enemy turns resolved inside endTurn, then round 2 began with the knight');
    const g = foe(0);
    t.ok(dist(g, k) === 1 || dist(g, m) === 1, 'the grunt walked up to a hero on its turn');
    t.eq(uses['test_grunt:test_grunt_stab'], 1, 'and stabbed once, on its own turn');
    t.eq(g.intents.length, 0, 'no telegraph left behind');
    offs.forEach(function (f) { f(); });
    t.eq(log.join(' '), 'round:start:1 turn:start:knight turn:player:knight turn:end:knight turn:start:mage turn:player:mage turn:end:mage ' +
      'turn:enemy:grunt turn:start:grunt turn:end:grunt turn:start:grunt turn:end:grunt round:end:1 round:start:2 turn:start:knight turn:player:knight',
      'events in order: round:start, turn:start / turn:player (hero), turn:enemy (once per run of AI turns), turn:end, round:end');
    // endRound: pass every remaining turn of the round
    const r = s.round;
    t.ok(DD.Combat.endRound() && s.round === r + 1 && cur() === k, 'endRound: back to the knight one round later');
    // a downed hero (with nobody acting on its turn) is passed
    quiet({ heroes: [H(1, 1), H(1, 3, 'test_cleric')], enemies: [E(7, 7)] });
    const a = hero(0), c = hero(1);
    DD.Act.kill(c, foe());
    DD.Combat.endTurn();
    t.ok(cur() === a && DD.Combat.state.round === 2, 'the downed cleric\'s turn is skipped');
  });

  T.suite('engine: v2 summons act on their owner\'s turn (both sides)', function (t) {
    quiet({ heroes: [H(1, 1, 'test_summoner'), H(1, 4, 'test_cleric')], enemies: [E(6, 6)] });
    const sm = hero(0), cl = hero(1);
    const pup = DD.Combat.party().filter(function (u) { return u.kind === 'summon'; })[0];
    t.ok(pup && DD.Combat.turnOwner(pup) === sm, 'the passive hound acts on Mocha\'s turn');
    t.ok(!entryOf(pup), 'no initiative entry of its own');
    t.ok(DD.Combat.controllable(pup) && pup.ap === pup.maxAp, 'controllable now, with its own AP');
    t.eq(DD.Combat.turnGroup().length, 2, 'turnGroup: owner + hound');
    t.ok(DD.Combat.isTurnOf(pup) && DD.Act.isOwnTurn(pup), 'it is the hound\'s turn too (statuses on it are fresh)');
    DD.Combat.endTurn();
    t.ok(cur() === cl && !DD.Combat.controllable(pup) && pup.ap === 0, 'not on the cleric\'s turn');
    DD.Combat.endTurn();
    t.ok(cur() === sm && pup.ap === pup.maxAp, 'back on Mocha\'s turn: the hound\'s AP refreshed');
    // a summon made mid-turn: 0 AP unless ready
    const late = DD.Act.summon(sm, 'test_hound', 3, 3, { noFx: true });
    t.ok(late && late.ap === 0 && DD.Combat.turnOwner(late) === sm && !DD.Combat.joining().length, 'a hound made mid-turn: 0 AP, acts on her turns, no roll');
    // a downed owner keeps the turn for her summons
    DD.Act.kill(sm, foe());
    t.ok(DD.Combat.controllable(pup), 'the hound fights on during its downed owner\'s turn');
    DD.Combat.endTurn();
    DD.Combat.endTurn();
    t.ok(cur() === sm && sm.downed && DD.Combat.controllable(pup) && pup.ap === pup.maxAp, 'next round: the downed owner\'s turn still comes, for her hounds');
    DD.Act.kill(pup, foe()); DD.Act.kill(late, foe());
    DD.Combat.endTurn();
    DD.Combat.endTurn();
    t.eq(cur(), cl, 'with no hound left, the downed owner\'s turn is skipped');
    // enemy-side summons: the AI plays them on their owner's turn
    quiet({ w: 10, h: 10, heroes: [H(1, 1)], enemies: [E(8, 8)] });
    const boss = foe();
    const imp = DD.Act.summon(boss, 'test_hound', 8, 6, { noFx: true });
    t.ok(imp && imp.side === 'enemy' && DD.Combat.turnOwner(imp) === boss && !entryOf(imp), 'an enemy-side summon acts on its owner\'s turn');
    const d0 = dist(imp, hero());
    DD.Combat.endTurn();   // round 1: the grunt passes (noPlan)
    DD.Combat.endTurn();   // round 2: the grunt and its hound act
    t.ok(dist(imp, hero()) < d0, 'its hound walked up on the grunt\'s turn');
    // orphans: the owner died → a turn of its own from the next round
    DD.Act.kill(boss, hero());
    t.eq(DD.Combat.turnOwner(imp), null, 'its owner is dead: no turn owner');
    DD.Combat.endTurn();
    t.ok(!!entryOf(imp), 'the orphan got an initiative entry at the next round start');
  });

  T.suite('engine: v2 units that join later roll on arrival and act from the next round', function (t) {
    quiet({ initiative: 'roll', seed: 'join', heroes: [H(1, 1)], enemies: [E(7, 7)] });
    const s = DD.Combat.state;
    let joined = null;
    const off = DD.Events.on('initiative:joined', function (e) { joined = e; });
    const m = DD.Act.spawn('test_minion', 5, 5);
    off();
    t.ok(joined && joined.unit === m && joined.entries.length === 1 && joined.entries[0].roll >= 1, 'initiative:joined: it rolls on arrival');
    t.ok(!entryOf(m) && s.joining.some(function (e) { return e.unitId === m.id; }), 'it waits for the next round');
    t.eq(DD.Combat.joining().length, 1, 'Combat.joining() lists it');
    const turns = [];
    const offT = DD.Events.on('turn:start', function (e) { if (e.unit === m) turns.push(e.round); });
    DD.Combat.endRound();
    offT();
    t.ok(!!entryOf(m) && !s.joining.length, 'merged into the order at the next round start');
    t.ok(turns.indexOf(1) < 0, 'it did not act in the round it arrived');
    DD.Act.kill(m, hero());
    DD.Combat.endRound();
    t.ok(!entryOf(m), 'dead units drop out of the order');
    // reinforcements arriving at a round start act that round
    quiet({ heroes: [H(1, 1)], enemies: [E(7, 7)], reinforcements: [{ round: 2, enemies: [{ id: 'test_minion', n: 1 }], edge: 'E' }] });
    const waveTurns = [];
    const offW = DD.Events.on('turn:start', function (e) { if (e.unit.defId === 'test_minion') waveTurns.push(e.round); });
    DD.Combat.endTurn();
    const w = byDef('test_minion');
    t.ok(w && !!entryOf(w), 'the round-2 wave is in the order for round 2');
    DD.Combat.endTurn();
    offW();
    t.ok(waveTurns.indexOf(2) >= 0, 'and takes its turn in round 2');
    // revived heroes keep their slot
    quiet({ heroes: [H(1, 1), H(1, 2, 'test_cleric')], enemies: [E(7, 7)] });
    const a = hero(0), c = hero(1);
    const idx = DD.Combat.state.order.indexOf(entryOf(c));
    DD.Act.kill(c, foe());
    t.eq(DD.Combat.state.order.indexOf(entryOf(c)), idx, 'a downed hero keeps its entry');
    DD.Combat.endTurn();
    t.eq(cur(), a, 'its turn was skipped while down');
    t.ok(DD.Combat.interact(a, c.x, c.y) && !c.downed && c.ap === 0, 'Help Up (0 AP for now)');
    DD.Combat.endTurn();
    t.ok(cur() === c && c.ap === c.maxAp, 'revived: it acts in its old slot with full AP');
  });

  T.suite('engine: v2 no Guard, nobody starts with Block, Block lasts until its owner\'s next turn', function (t) {
    withTemp('items', [{ id: 'test_tmp_shield', name: 'Shield of Yesteryear', slot: 'armor', rarity: 'common', stats: { block: 5 }, desc: 'Used to give 5 Block at combat start.' }], function () {
      t.eq(DD.Combat.heroStats(DD.Combat.makeRunHero({ id: 'test_mage', items: ['test_tmp_shield'] })).block, 5, 'premise: the item still reports stats.block');
      quiet({ heroes: [H(1, 1, 'test_mage', { items: ['test_tmp_shield'] }), H(1, 3, 'test_cleric', { skills: ['test_heal'] })], enemies: [E(6, 6)],
        rules: [{ id: 'test_start_block', name: 'Pre-buff', hooks: { onCombatStart: function (u) { DD.Act.addBlock(u, 4); } } }] });
      const s = DD.Combat.state, m = hero(0), cl = hero(1);
      t.ok(s.units.every(function (u) { return !u.block; }), 'nobody has Block when the fight starts (items\' stats.block ignored, onCombatStart Block discarded)');
      m.ap = 3;
      DD.Combat.endTurn();
      t.ok(m.block === 0 && m.ap === 0, 'no Guard: 3 unused AP give no Block, they are just gone');
      // Block from a skill lasts through everyone else's turns until the start of its owner's next turn
      const guard = giveSkill(cl, 'test_guard_ally');
      t.ok(DD.Combat.useSkill(cl, guard, m.x, m.y) && m.block === 5, 'the cleric gives the mage 5 Block');
      let during = -1;
      const off = DD.Events.on('turn:start', function (e) { if (e.unit.side === 'enemy') during = m.block; });
      DD.Combat.endTurn();
      off();
      t.eq(during, 5, 'the mage still has it during the enemy\'s turn');
      t.ok(cur() === m && m.block === 0, 'and loses it at the start of his own next turn');
      // an enemy's Block also lasts until its own next turn
      const g = foe();
      DD.Act.addBlock(g, 6);
      DD.Combat.endTurn();
      t.eq(g.block, 6, 'an enemy\'s Block survives the heroes\' turns');
      DD.Combat.endTurn();
      t.eq(g.block, 0, 'and expires when its own turn starts');
    });
    let guardCalls = 0;
    quiet({ heroes: [H(1, 1, 'test_mage')], enemies: [E(6, 6)], rules: [{ id: 'test_guard_probe', name: 'Guard probe', hooks: { modifyGuard: function () { guardCalls++; } } }] });
    hero(0).ap = 3;
    DD.Combat.endTurn();
    t.ok(guardCalls === 0 && hero(0).block === 0, 'modifyGuard is never fired and unused AP give no Block (Guard is gone)');
  });

  T.suite('engine: v2 durations count the owner\'s own turns', function (t) {
    const A = DD.Act;
    withDefs('statuses', [
      { id: 'test_tmp_until', name: 'Until Next Turn', type: 'buff', decay: 'turnStart', defaultTurns: 1 },
      { id: 'test_tmp_now', name: 'This Turn Only', type: 'buff', defaultTurns: 1, skipFresh: false },
    ], function () {
      quiet({ heroes: [H(1, 1), H(1, 3, 'test_cleric')], enemies: [E(6, 6)], enemyAi: false });
      const m = hero(0), c = hero(1);
      // a buff on yourself during your own turn: through your NEXT turn
      A.addStatus(m, 'inspired', { turns: 1 });
      t.ok(A.getStatus(m, 'inspired').fresh, 'applied on its own turn: fresh');
      DD.Combat.endRound();
      t.ok(has(m, 'inspired'), 'still Inspired on its next turn');
      DD.Combat.endRound();
      t.ok(!has(m, 'inspired'), 'gone after that turn');
      // a buff from an ally (not your turn): until the end of your next turn
      DD.Combat.endTurn();
      t.eq(cur(), c, 'the cleric\'s turn');
      A.addStatus(m, 'inspired', { turns: 1 });
      t.ok(!A.getStatus(m, 'inspired').fresh, 'applied on someone else\'s turn: not fresh');
      DD.Combat.endTurn();
      t.ok(cur() === m && has(m, 'inspired'), 'the mage has it on his next turn');
      DD.Combat.endTurn();
      t.ok(!has(m, 'inspired'), 'and it ends with that turn');
      // decay 'turnStart': until the start of its next turn
      DD.Combat.endRound();
      A.addStatus(m, 'test_tmp_until', {});
      DD.Combat.endTurn();
      t.ok(has(m, 'test_tmp_until'), "'turnStart' decay: kept through the others' turns");
      DD.Combat.endTurn();
      t.ok(cur() === m && !has(m, 'test_tmp_until'), '... gone when its turn starts');
      // skipFresh: false → the end of this very turn counts
      A.addStatus(m, 'test_tmp_now', {});
      DD.Combat.endTurn();
      t.ok(!has(m, 'test_tmp_now'), 'skipFresh: false: a 1-turn status applied now ends with this turn');
      // statuses from onTurnStart hooks are not fresh (a stun there costs this turn only)
      DD.Combat.endTurn();
      A.addRule({ id: 'test_ts_stun', name: 'Zap', hooks: { onTurnStart: function (u) { if (u === m && !u.data.zapped) { u.data.zapped = 1; A.addStatus(u, 'stun', { turns: 1 }, null); } } } });
      const r = DD.Combat.state.round;
      DD.Combat.endTurn();
      DD.Combat.endTurn();
      A.removeRule('test_ts_stun');
      t.ok(cur() === c && DD.Combat.state.round === r + 1 && m.data.zapped, 'stunned by its own onTurnStart: the mage lost that turn');
      t.ok(!has(m, 'stun'), '... and only that one');
    });
  });

  T.suite('engine: v2 AI turns — decide and act at once (default planner, styles, custom boss)', function (t) {
    const AI = DD.AI;
    quiet({ heroes: [H(2, 3)], enemies: [E(3, 3)] });
    let hp = hero().hp;
    t.ok(AI.act(foe()), 'AI.act');
    t.eq(hero().hp, hp - 4, 'an adjacent grunt stabs at once');
    t.eq(foe().intents.length, 0, 'no telegraph left behind');
    quiet({ w: 10, h: 10, heroes: [H(1, 5)], enemies: [E(8, 5)] });
    AI.act(foe());
    t.ok(dist(foe(), hero()) < 7, 'out of reach: approaches');
    quiet({ w: 10, h: 10, heroes: [H(2, 5)], enemies: [E(4, 5, 'test_archer')] });
    hp = hero().hp;
    AI.act(foe());
    t.ok(dist(foe(), hero()) >= 3 && hero().hp === hp - 4, 'ranged keeps distance and shoots');
    quiet({ w: 10, h: 10, heroes: [H(1, 1)], enemies: [E(6, 6, 'test_healer'), E(6, 8)] });
    foe(1).hp = 4;
    AI.act(foe(0));
    t.eq(foe(1).hp, 10, 'support heals the hurt ally (+6)');
    quiet({ w: 10, h: 10, heroes: [H(1, 1)], enemies: [E(6, 6, 'test_summoner_foe')] });
    AI.act(foe());
    t.ok(byDef('test_minion'), 'summoner summons');
    t.ok(DD.Combat.joining().some(function (e) { return e.unit.defId === 'test_minion'; }), 'the summoned minion rolled to join the next round');
    quiet({ w: 10, h: 10, heroes: [H(1, 1)], enemies: [E(3, 1, 'test_coward')] });
    foe().hp = 2;
    AI.act(foe());
    t.ok(dist(foe(), hero()) > 2, 'hurt coward runs away');
    quiet({ w: 10, h: 10, heroes: [H(2, 2)], enemies: [E(5, 2, 'test_bomber')] });
    hp = hero().hp;
    const bomber = foe();
    AI.act(bomber);
    t.ok(bomber.dead && hero().hp === hp - 8, 'kamikaze walks up and explodes');
    quiet({ w: 6, h: 1, heroes: [H(0, 0)], enemies: [E(3, 0)] });
    setT(1, 0, 'lava');
    AI.act(foe());
    t.ok(foe().x !== 1 && !foe().dead, 'AI avoids ending in lava');
    // the custom-planner boss: a wind-up and a phase change
    quiet({ w: 10, h: 10, heroes: [H(2, 2), H(2, 4, 'test_cleric')], enemies: [E(7, 7, 'test_boss')] });
    const boss = foe();
    AI.act(boss);
    const met = boss.intents.filter(function (i) { return i.skillId === 'test_boss_meteor'; })[0];
    t.ok(met && met.windup && met.turnsLeft === 1 && met.anchor === 'ground', 'the boss winds up its meteor');
    boss.hp = Math.floor(boss.maxHp * 0.4);
    boss.intents = [];
    DD.Combat.slotsOf(boss).forEach(function (sl) { sl.cd = 0; sl.fresh = false; });
    const uses = countUses(function () { AI.act(boss); });
    t.eq(boss.data.phase, 2, 'phase change below 50%');
    t.ok(uses['test_boss:test_boss_rage'] === 1 && uses['test_boss:test_boss_summon'] === 1, 'phase 2: rage and summon at once');
    // speed: 8 enemies take their turns well under 50ms
    quiet({ w: 12, h: 12, heroes: [H(1, 2), H(1, 5, 'test_cleric'), H(1, 8, 'test_rogue'), H(2, 10, 'test_knight')],
      enemies: [E(9, 1), E(10, 3, 'test_archer'), E(9, 5, 'test_mortar'), E(10, 7, 'test_healer'), E(9, 9, 'test_summoner_foe'),
        E(11, 11, 'test_bomber'), E(8, 10, 'test_web_spinner'), E(11, 5, 'test_brute')] });
    const s = DD.Combat.state;
    const times = [];
    for (let i = 0; i < 5; i++) {
      const snap = DD.Combat.cloneState(s);
      DD.Combat.state = snap;
      const t0 = performance.now();
      snap.units.filter(function (u) { return u.side === 'enemy'; }).forEach(function (u) { AI.act(u); });
      times.push(performance.now() - t0);
    }
    DD.Combat.state = s;
    times.sort(function (x, y) { return x - y; });
    t.log('8 AI turns: median ' + times[2].toFixed(1) + 'ms');
    t.ok(times[2] < 50, '8 AI turns < 50ms (median ' + times[2].toFixed(1) + 'ms)');
  });

  T.suite('engine: v2 AI turns — taunt, dazzle, confuse, charm, silence, sheep, stun', function (t) {
    const A = DD.Act, AI = DD.AI;
    // taunt: it must attack the taunter if it can
    quiet({ heroes: [H(2, 3), H(3, 4, 'test_cleric')], enemies: [E(3, 3)] });
    let a = hero(0), b = hero(1), g = foe();
    A.addStatus(g, 'taunt', { turns: 1 }, b);
    let hpa = a.hp, hpb = b.hp;
    AI.act(g);
    t.ok(a.hp === hpa && b.hp === hpb - 4, 'taunted: it stabs the taunter, not the mage next to it');
    quiet({ w: 9, h: 9, heroes: [H(2, 3), H(8, 8, 'test_cleric')], enemies: [E(3, 3)] });
    a = hero(0); b = hero(1); g = foe();
    A.addStatus(g, 'taunt', { turns: 1 }, b);
    hpa = a.hp;
    const d0 = dist(g, b);
    AI.act(g);
    t.ok(a.hp === hpa && dist(g, b) < d0, 'taunter out of reach: no other attack, it heads for the taunter');
    // custom planners get the same rule: an attack that cannot reach the taunter fizzles
    withTemp('enemies', [{ id: 'test_tmp_stubborn', name: 'Stubborn', act: 1, tier: 'normal', hp: 20, sprite: SPR, skills: ['test_grunt_stab'],
      ai: function (u, api) { api.act(u, 'test_grunt_stab', api.heroes()[0], {}); } }], function () {
      quiet({ w: 9, h: 9, heroes: [H(2, 3), H(8, 8, 'test_cleric')], enemies: [E(3, 3, 'test_tmp_stubborn')] });
      const st = foe();
      A.addStatus(st, 'taunt', { turns: 1 }, hero(1));
      const hp = hero(0).hp, n0 = DD.Combat.state.log.length;
      AI.act(st);
      t.ok(hero(0).hp === hp && logSince(n0, /Taunted, can't reach!/), 'a planner\'s stab at someone else fizzles ("Taunted, can\'t reach!")');
      quiet({ heroes: [H(2, 3), H(3, 4, 'test_cleric')], enemies: [E(3, 3, 'test_tmp_stubborn')] });
      const st2 = foe();
      A.addStatus(st2, 'taunt', { turns: 1 }, hero(1));
      const hb = hero(1).hp;
      AI.act(st2);
      t.eq(hero(1).hp, hb - 4, 'if the skill can reach the taunter, it is turned on it');
    });
    // dazzled: lands 1 tile off; confused: a quarter turn
    quiet({ heroes: [H(2, 3)], enemies: [E(3, 3), E(3, 2)] });
    const h = hero();
    g = foe(0);
    let hp = h.hp;
    A.addStatus(g, 'dazzled');
    AI.useNow(g, 'test_grunt_stab', h, {});
    t.eq(h.hp, hp, 'dazzled: the stab lands 1 tile off');
    g.statuses = [];
    A.addStatus(g, 'confused');
    AI.useNow(g, 'test_grunt_stab', h, {});
    t.eq(h.hp, hp, 'confused: rotated a quarter turn, missed');
    // charmed: it fights for the other side on its turn
    quiet({ heroes: [H(1, 1)], enemies: [E(3, 3), E(4, 3)] });
    const c1 = foe(0), c2 = foe(1);
    A.addStatus(c1, 'charmed', { turns: 1 }, hero());
    hp = hero().hp;
    AI.act(c1);
    t.ok(c2.hp === 10 && hero().hp === hp, 'charmed: it stabs its friend, not the hero');
    // silenced: no spells (the necromancer's Hex Bolt), other skills fine
    quiet({ w: 9, h: 9, heroes: [H(2, 4)], enemies: [E(5, 4, 'test_summoner_foe')] });
    const nec = foe();
    nec.skillSlots = [DD.Act.makeSlot('test_hex_bolt', 1)];
    A.addStatus(nec, 'silenced', { turns: 1 });
    hp = hero().hp;
    AI.act(nec);
    t.eq(hero().hp, hp, 'silenced: no Hex Bolt');
    A.removeStatus(nec, 'silenced');
    AI.act(nec);
    t.ok(hero().hp < hp, 'without the silence it casts');
    // sheep: wanders, no attack; stunned: loses the turn
    quiet({ heroes: [H(1, 1)], enemies: [E(2, 1)] });
    A.addStatus(foe(), 'sheep');
    hp = hero().hp;
    AI.act(foe());
    t.eq(hero().hp, hp, 'sheep: no attack');
    quiet({ heroes: [H(1, 1)], enemies: [E(2, 1)] });
    A.addStatus(foe(), 'stun', { turns: 1 });
    hp = hero().hp;
    const n1 = DD.Combat.state.log.length;
    t.eq(AI.act(foe()), false, 'stunned: AI.act does nothing');
    t.ok(hero().hp === hp && logSince(n1, /loses the turn \(Stunned\)/), '"loses the turn"');
  });

  T.suite('engine: v2 wind-ups — announced, land at the start of the next turn, interrupted', function (t) {
    const A = DD.Act, AI = DD.AI;
    quiet({ w: 9, h: 9, heroes: [H(2, 3)], enemies: [E(7, 7, 'test_boss')], enemyAi: false });
    const h = hero(), b = foe();
    h.maxHp = h.hp = 99;
    let started = null;
    const off = DD.Events.on('windup:start', function (e) { started = e; });
    const n0 = DD.Combat.state.log.length;
    const it = AI.windUp(b, 'test_boss_meteor', h, {});
    off();
    t.ok(it && it.windup && it.turnsLeft === 1 && it.anchor === 'ground' && b.intents.indexOf(it) >= 0, 'recorded on the unit: windup, turnsLeft 1, fixed tiles');
    t.ok(started && started.intent === it && logSince(n0, /winds up Meteor of Regression/), 'announced: windup:start + log');
    t.eq(keys(AI.intentTiles(b, it)), '1,3 2,2 2,3 2,4 3,3', 'its marked tiles: radius 1 around the mage');
    const list = AI.windups();
    t.ok(list.length === 1 && list[0].turnsLeft === 1 && list[0].dmg === 14 && list[0].tiles.length === 5 && list[0].unit === b, 'AI.windups(): tiles, turnsLeft, label, dmg');
    const d = AI.describe(b, it);
    t.ok(d.windup && d.turnsLeft === 1 && /start of The Test Overlord's next turn/.test(d.text) && /interrupt/.test(d.text), 'describe: when it lands and how to stop it');
    let hp = h.hp;
    DD.Combat.endTurn();
    t.eq(h.hp, hp - 14, 'it lands at the start of the boss\'s next turn on whoever stands in it');
    t.eq(b.intents.length, 0, 'resolved wind-ups are gone');
    // step out of the red
    AI.windUp(b, 'test_boss_meteor', h, { noCooldown: true });
    A.teleport(h, 2, 6);
    hp = h.hp;
    DD.Combat.endTurn();
    t.eq(h.hp, hp, 'out of the red: no damage');
    // turns: 2
    const two = AI.windUp(b, 'test_boss_meteor', h, { noCooldown: true, turns: 2 });
    DD.Combat.endTurn();
    t.ok(b.intents.indexOf(two) >= 0 && two.turnsLeft === 1, 'turns: 2 → one of its turns later it is still coming');
    hp = h.hp;
    DD.Combat.endTurn();
    t.ok(b.intents.indexOf(two) < 0 && h.hp === hp - 14, '... and lands the turn after');
    // interrupted: stun (at once), sleep, frozen, sheep — but not an unstoppable one
    ['stun', 'sleep', 'frozen'].forEach(function (id) {
      b.statuses = [];
      AI.windUp(b, 'test_boss_meteor', h, { noCooldown: true });
      A.addStatus(b, id, { turns: 1 });
      t.eq(b.intents.length, 0, id + ' interrupts the wind-up at once');
    });
    b.statuses = [];
    const hold = AI.windUp(b, 'test_boss_meteor', h, { noCooldown: true, data: { unstoppable: true } });
    A.addStatus(b, 'stun', { turns: 1 });
    t.ok(b.intents.indexOf(hold) >= 0, 'data.unstoppable survives the stun');
    hp = h.hp;
    DD.Combat.endTurn();
    t.eq(h.hp, hp - 14, '... and lands although its owner is stunned');
    b.statuses = []; b.intents = [];
    quiet({ w: 9, h: 9, heroes: [H(2, 3)], enemies: [E(6, 3)], enemyAi: false });
    const g = foe();
    AI.windUp(g, 'test_grunt_stab', hero(), {});
    A.addStatus(g, 'sheep', { turns: 1 });
    t.eq(g.intents.length, 0, 'sheep interrupts too');
    AI.windUp(g, 'test_grunt_stab', hero(), {});
    DD.Act.kill(g, hero());
    t.eq(g.intents.length, 0, 'a dead unit\'s wind-ups are gone');
    // anchors: ground stays put, self follows its owner, a tracked one follows its target and can lose it
    quiet({ w: 9, h: 9, heroes: [H(2, 3)], enemies: [E(3, 3), E(7, 3, 'test_archer')], enemyAi: false });
    const gr = foe(0), ar = foe(1), m = hero();
    const self = AI.windUp(gr, 'test_grunt_stab', m, { anchor: 'self' });
    A.push(m, gr, { x: 1, y: 0 }, 1);
    t.eq(keys(AI.intentTiles(gr, self)), '3,3', "anchor 'self': pushed, its swing moves with it");
    const track = AI.windUp(ar, 'test_arrow', m, { track: true });
    t.ok(track.anchor === 'unit' && track.unitId === m.id, 'track: true follows the target unit');
    A.teleport(m, 3, 5);
    t.eq(keys(AI.intentTiles(ar, track)), '3,5', '... its tile is wherever the mage stands');
    A.addStatus(m, 'stealth', { turns: 2 });
    hp = m.hp;
    DD.Combat.endTurn();
    t.eq(m.hp, hp, 'a stealthed target loses a tracking wind-up; the swing hit empty floor');
    // taunt does not re-aim a wind-up; dazzle still shifts it when it lands; silence fizzles a spell
    quiet({ w: 9, h: 9, heroes: [H(2, 3), H(5, 5, 'test_cleric')], enemies: [E(7, 7, 'test_boss')], enemyAi: false });
    const bb = foe(), mm = hero(0), cc = hero(1);
    const met = AI.windUp(bb, 'test_boss_meteor', mm, { noCooldown: true });
    const before = keys(AI.intentTiles(bb, met));
    A.addStatus(bb, 'taunt', { turns: 1 }, cc);
    t.eq(keys(AI.intentTiles(bb, met)), before, 'taunt does not move a wind-up');
    A.addStatus(bb, 'silenced', { turns: 1 });
    t.ok(/Silenced: this spell will fizzle/.test(AI.describe(bb, met).text), 'describe warns a silenced spell will fizzle');
    hp = mm.hp;
    const n2 = DD.Combat.state.log.length;
    DD.Combat.endRound();
    t.ok(mm.hp === hp && logSince(n2, /Silenced!/), 'the silenced meteor fizzles when it would land');
    // dazzled at resolution: one tile off
    quiet({ w: 9, h: 9, heroes: [H(1, 4)], enemies: [E(4, 4)], enemyAi: false });
    const dz = foe();
    const cone = AI.windUp(dz, 'test_cone_of_cold', { x: 3, y: 4 }, {});
    const drawn = AI.intentTiles(dz, cone);
    A.addStatus(dz, 'dazzled', { turns: 1 });
    t.ok(AI.describe(dz, cone).uncertain, 'a dazzled wind-up is marked uncertain');
    const ctx = captureSkill(dz, function () { DD.Combat.endTurn(); });
    t.ok(ctx && keys(ctx.tiles) !== keys(drawn) && DIRS4.some(function (dd) { return keys(shifted(drawn, dd)) === keys(ctx.tiles); }), 'it lands exactly one tile off');
    // content compat: makeIntent stores a silent pending action; api.addIntent with delay is a wind-up
    quiet({ w: 9, h: 9, heroes: [H(2, 3)], enemies: [E(3, 3)], enemyAi: false });
    const pend = AI.makeIntent(foe(), 'test_grunt_stab', hero(), {});
    t.ok(pend.windup && pend.turnsLeft === 1 && foe().intents.length === 1, 'AI.makeIntent: a pending action (resolves at its next turn start)');
    hp = hero().hp;
    DD.Combat.endTurn();
    t.eq(hero().hp, hp - 4, '... and it does');
  });

  T.suite('engine: v2 planner api — act and windUp now, addIntent compat, entry', function (t) {
    const calls = [];
    withTemp('enemies', [{ id: 'test_tmp_planner', name: 'Planner', act: 1, tier: 'elite', hp: 40, sprite: SPR, skills: ['test_grunt_stab', 'test_lob', 'test_mend'],
      ai: function (u, api) {
        calls.push(api.round + ':' + (api.entry ? api.entry.unitId === u.id : 'none') + ':' + (api.unit === u));
        const h = api.heroes()[0];
        const now = api.addIntent(u, 'test_lob', h, {});
        calls.push('lob:' + !!(now && now.resolved));
        const later = api.addIntent(u, 'test_grunt_stab', h, { delay: 1, anchor: 'ground' });
        calls.push('stab:' + !!(later && later.windup));
        calls.push('act:' + api.act(u, 'test_mend', u, {}));
      } }], function () {
      quiet({ w: 9, h: 9, noPlan: false, heroes: [H(2, 3)], enemies: [E(6, 3, 'test_tmp_planner')] });
      const p = foe(), h = hero();
      const hp = h.hp;
      DD.Combat.endTurn();
      t.eq(calls.slice(0, 4).join(' '), '1:true:true lob:true stab:true act:true', 'api.round / api.entry / api.unit; addIntent without delay happened now, with delay is a wind-up, act → true');
      t.eq(h.hp, hp - 5, 'the lob hit at once (5)');
      t.ok(p.intents.length === 1 && p.intents[0].skillId === 'test_grunt_stab', 'the delayed stab is pending on its tile');
      t.eq(slotOf(p, 'test_lob').cd, 1, 'cooldowns start when the action happens');
    });
  });

  T.suite('engine: v2 gainAp — now on its own turn, banked for its next turn otherwise', function (t) {
    quiet({ heroes: [H(1, 1, 'test_summoner'), H(1, 3, 'test_cleric')], enemies: [E(7, 7)] });
    const sm = hero(0), cl = hero(1);
    const pup = DD.Combat.party().filter(function (u) { return u.kind === 'summon'; })[0];
    t.ok(DD.Combat.useSkill(sm, slotOf(sm, 'test_bark_order'), cl.x, cl.y), 'Good Boy! on the cleric (not her turn)');
    t.ok(cl.ap === 0 && cl.apBank === 1, 'banked: +1 AP next turn');
    DD.Act.gainAp(pup, 1);
    t.eq(pup.ap, pup.maxAp + 1, 'a summon acting on this turn gets it now');
    DD.Combat.endTurn();
    t.ok(cur() === cl && cl.ap === cl.maxAp + 1 && cl.apBank === 0, 'her turn: 3 + 1 AP');
    DD.Act.gainAp(cl, 1);
    t.eq(cl.ap, cl.maxAp + 2, 'on her own turn it is spendable at once');
    DD.Act.gainAp(sm, -1);
    t.eq(sm.apBank, -1, 'negative AP is banked too');
    DD.Combat.endTurn();
    t.ok(cur() === sm && sm.ap === sm.maxAp - 1, '... −1 AP on her next turn');
    quiet({ heroes: [H(1, 1)], enemies: [E(7, 7)], deploy: true, deployTiles: [{ x: 1, y: 1 }, { x: 1, y: 2 }] });
    const m = hero();
    DD.Act.gainAp(m, 1);
    t.eq(m.apBank, 1, 'before initiative: banked');
    DD.Combat.rollInitiative();
    t.eq(m.ap, m.maxAp + 1, '... for the first turn');
  });

  T.suite('engine: v2 deployment — free swaps, then "Roll for initiative!"', function (t) {
    const tiles = [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }, { x: 0, y: 3 }];
    const cfg = { deploy: true, deployTiles: tiles, initiative: 'roll', seed: 'dep', heroes: [H(0, 0), H(0, 1, 'test_cleric')], enemies: [E(3, 1), E(7, 7)] };
    let rolls = 0;
    const off = DD.Events.on('initiative:rolled', function () { rolls++; });
    quiet(cfg);
    const s = DD.Combat.state, a = hero(0), b = hero(1);
    t.ok(s.deploy.active && s.phase === 'deploy' && s.order === null && s.round === 0 && rolls === 0, 'deployment: no initiative yet, round 0');
    t.ok(DD.Combat.isDeploying() && DD.Combat.isPlayerTurn() && cur() === null, 'the player is in control; nobody\'s turn yet');
    t.eq(DD.Combat.canUse(a, a.basic), 'Roll for initiative first!', 'skills wait for initiative');
    t.ok(a.ap === 0 && b.ap === 0, 'nobody has AP yet');
    t.ok(DD.Combat.deployMove(a, 0, 1) && a.y === 1 && b.y === 0, 'swap inside the zone');
    t.ok(DD.Combat.deployMove(a, 0, 3) && a.y === 3, 'move to an empty deploy tile');
    t.ok(!DD.Combat.deployMove(a, 2, 2), 'outside the zone refused');
    t.ok(foe(0).x === 3 && foe(0).y === 1 && !foe(0).intents.length, 'the enemies have not moved or planned anything');
    t.ok(DD.Combat.rollInitiative() && rolls === 1, 'Roll for initiative!');
    t.ok(!s.deploy.active && !!s.order && s.round >= 1 && !DD.Combat.deployMove(a, 0, 2), 'deployment is over');
    t.eq(DD.Combat.rollInitiative(), false, 'only once');
    quiet(cfg);
    t.ok(DD.Combat.endTurn() && !!DD.Combat.state.order && rolls === 2, 'End Turn during deployment rolls initiative');
    quiet(Object.assign({}, cfg, { initiative: 'heroesFirst' }));
    t.ok(DD.Combat.move(hero(0), 1, 0) && !!DD.Combat.state.order && hero(0).x === 1, 'the first real action rolls initiative too (then it counts if it is that hero\'s turn)');
    off();
  });

  T.suite('engine: v2 reach estimates — AI.reachOf, AI.threatMap', function (t) {
    const A = DD.Act;
    quiet({ w: 10, h: 10, heroes: [H(1, 1)], enemies: [E(5, 5)] });
    const g = foe();
    let r = DD.AI.reachOf(g);
    t.ok(r.best === 4 && r.tiles.get('5,9') === 4 && r.tiles.has('9,5') && !r.tiles.has('5,0') && !r.tiles.has('1,1'), 'a grunt: move 3 + stab 1 (4 damage)');
    A.addStatus(g, 'stun', { turns: 1 });
    t.eq(DD.AI.reachOf(g).tiles.size, 0, 'a stunned unit loses its next turn: no reach');
    A.removeStatus(g, 'stun');
    A.addStatus(g, 'root', { turns: 1 });
    r = DD.AI.reachOf(g);
    t.ok(r.tiles.has('5,6') && !r.tiles.has('5,7'), 'rooted: only its own reach');
    A.removeStatus(g, 'root');
    slotOf(g, 'test_grunt_stab').cd = 2;
    t.eq(DD.AI.reachOf(g).tiles.size, 0, 'nothing ready by its next turn: no reach');
    slotOf(g, 'test_grunt_stab').cd = 0;
    quiet({ w: 10, h: 10, heroes: [H(1, 1), H(1, 2, 'test_cleric')], enemies: [E(5, 5), E(9, 9, 'test_archer')] });
    const map = DD.AI.threatMap('hero');
    const ar = foe(1);
    t.ok(DD.AI.reachOf(ar).tiles.has('1,9') && DD.AI.reachOf(ar).best === 4, 'an archer: move 3 + range 6');
    const c = map.get('5,9');
    t.ok(c && c.from.length === 2 && c.dmg === 8 && c.max === 4, 'threatMap sums every enemy that reaches a tile');
    A.addStatus(foe(0), 'taunt', { turns: 1 }, hero(1));
    t.eq(DD.AI.reachOf(foe(0)).only, hero(1).id, 'taunted: it only threatens the taunter');
    A.addStatus(foe(0), 'charmed', { turns: 1 }, hero(0));
    t.ok(!DD.AI.threatMap('hero').get('5,9').from.some(function (id) { return id === foe(0).id; }), 'a charmed enemy is no threat to the heroes');
  });

  T.suite('engine: v2 test helpers — giveTurnTo, endRound, setOrder, enemyAi: false', function (t) {
    quiet({ noPlan: false, heroes: [H(1, 1), H(1, 3, 'test_cleric')], enemies: [E(2, 1), E(7, 7)] });
    const a = hero(0), c = hero(1), g = foe(0);
    t.ok(DD.Combat.giveTurnTo(c) && cur() === c && c.ap === c.maxAp, 'giveTurnTo(hero): its turn now, with its AP');
    t.ok(!DD.Combat.controllable(a), 'the abandoned turn is over');
    const hp = a.hp;
    t.ok(DD.Combat.giveTurnTo(g), 'giveTurnTo(enemy)');
    t.eq(a.hp, hp - 4, 'the grunt acted at once (stab)');
    t.ok(DD.Combat.state.round === 2 && cur() === a, 'then play went on from its place: round 2, the mage');
    const r = DD.Combat.state.round;
    DD.Combat.endRound();
    t.ok(DD.Combat.state.round === r + 1 && cur() === a, 'endRound: the rest of the round');
    t.ok(DD.Combat.setOrder(['test_cleric']), 'setOrder');
    t.eq(orderDefs(), 'test_cleric test_mage test_grunt test_grunt', 'the cleric first, the others in their old order');
    t.eq(cur(), a, 'the current turn keeps going');
    DD.Combat.endRound();
    t.eq(cur(), c, 'next round the cleric starts');
    quiet({ enemyAi: false, heroes: [H(2, 3)], enemies: [E(3, 3)] });
    const hp2 = hero().hp;
    DD.Combat.endRound(); DD.Combat.endRound();
    t.eq(hero().hp, hp2, 'enemyAi: false — the enemies pass every turn');
    DD.Combat.start({ grid: DD.Combat.emptyGrid(6, 6), heroes: [{ id: 'test_mage', x: 1, y: 1 }], enemies: [{ id: 'test_grunt', x: 4, y: 4 }] }, { seed: 4, headless: true });
    t.eq(DD.Combat.giveTurnTo(foe()), false, 'giveTurnTo is for sandboxes only');
  });

  T.suite('engine: costs, cooldowns, charges, Hype', function (t) {
    quiet({ heroes: [H(1, 1)], enemies: [E(4, 1), E(7, 7)] });
    const h = hero();
    const fb = slotOf(h, 'test_fireball');
    t.eq(DD.Combat.canUse(h, fb), true, 'usable');
    t.ok(DD.Combat.useSkill(h, fb, 4, 1), 'fireball');
    t.ok(h.ap === 1 && fb.cd === 1 && fb.uses === 1, 'paid 2 AP, cooldown 1 started');
    t.ok(/cooldown/i.test(DD.Combat.canUse(h, fb)), 'on cooldown this turn');
    t.eq(DD.Combat.canUse(h, slotOf(h, 'test_frost_ray')), 'Not enough AP.', 'AP check');
    t.ok(!DD.Combat.useSkill(h, slotOf(h, 'test_frost_ray'), 2, 1), 'useSkill refuses');
    DD.Combat.endTurn();
    t.ok(fb.cd === 1 && /cooldown/i.test(DD.Combat.canUse(h, fb)), 'still cooling down on its next turn');
    DD.Combat.endTurn();
    t.ok(fb.cd === 0 && DD.Combat.canUse(h, fb) === true, 'usable again the turn after (round r+N+1)');
    t.ok(!DD.Combat.useSkill(h, fb, 9, 9), 'invalid target refused');
    // Hype + signature
    const sig = h.signature;
    DD.Combat.state.hype = 0;
    t.eq(DD.Combat.canUse(h, sig), 'Needs 100 Hype.', 'signature needs 100 Hype');
    DD.Combat.state.hype = 100;
    const gained = [];
    const offH = DD.Events.on('hype:changed', function (e) { gained.push(e.delta); });
    t.ok(DD.Combat.useSkill(h, sig, h.x, h.y), 'signature used');
    offH();
    t.eq(gained[0], -100, 'signature spends 100 Hype first');
    t.eq(DD.Combat.state.hype, gained.slice(1).reduce(function (a, b) { return a + b; }, 0), 'then Hype only from what it achieved');
    // multi-hit Hype
    quiet({ heroes: [H(1, 1)], enemies: [E(4, 1), E(4, 2), E(7, 7)] });
    const hype0 = DD.Combat.state.hype;
    DD.Combat.useSkill(hero(), slotOf(hero(), 'test_fireball'), 4, 1);
    t.ok(DD.Combat.state.hype - hype0 >= 4, '+4 Hype for hitting 2+ foes');
    // charges
    quiet({ heroes: [H(1, 1, 'test_cleric', { skills: ['test_revive', 'test_heal'] }), H(1, 2)], enemies: [E(7, 7)] });
    const cl = hero(0), m = hero(1);
    DD.Act.kill(m, foe());
    const rv = slotOf(cl, 'test_revive');
    t.ok(DD.Combat.useSkill(cl, rv, m.x, m.y) && !m.downed, 'revive at range');
    DD.Act.kill(m, foe());
    cl.ap = 3;
    t.eq(DD.Combat.canUse(cl, rv), 'No charges left.', 'charges per combat');
    // HP costs via modifyCost
    quiet({ heroes: [H(1, 1)], enemies: [E(2, 1), E(7, 7)] });
    DD.Act.addRule({ id: 'test_blood_tax', name: 'Blood Tax', hooks: { modifyCost: function (c) { c.hp += 3; } } });
    const hp = hero().hp;
    DD.Combat.useSkill(hero(), hero().basic, 2, 1);
    t.eq(hero().hp, hp - 3, 'HP cost paid');
    hero().hp = 2; hero().ap = 3;
    DD.Combat.useSkill(hero(), hero().basic, 2, 1);
    t.eq(hero().hp, 1, 'HP costs never go below 1');
    t.eq(DD.Combat.canUse(hero(), hero().basic), 'Not enough HP.', 'cannot pay at 1 HP');
    DD.Act.removeRule('test_blood_tax');
  });

  T.suite('engine: autoplay (plays the current hero\'s turn)', function (t) {
    // drinks a potion when hurt and nothing better to do
    quiet({ heroes: [H(1, 1, 'test_knight')], enemies: [E(7, 7)], consumables: ['test_potion'] });
    hero().hp = 6;
    DD.AutoPlay.takeTurn();
    t.ok(hero().hp >= 16 && DD.Combat.consumables().length === 0, 'drinks the potion when hurt');
    // Help Up
    quiet({ heroes: [H(1, 1), H(2, 1, 'test_cleric')], enemies: [E(7, 7)] });
    DD.Act.kill(hero(1), foe());
    DD.AutoPlay.takeTurn();
    t.ok(!hero(1).downed, 'helps a downed ally up');
    // steps out of a wind-up
    quiet({ heroes: [H(2, 3, 'test_cleric')], enemies: [E(3, 3), E(7, 7)] });
    const w = DD.AI.windUp(foe(0), 'test_grunt_stab', hero(), {});
    DD.AutoPlay.takeTurn();
    t.ok(!DD.AI.intentTiles(foe(0), w).some(function (p) { return p.x === hero().x && p.y === hero().y; }), 'ends its turn outside the wind-up');
    // pushes a foe into a pit
    quiet({ heroes: [H(2, 3, 'test_knight', { skills: ['test_shield_bash'] })], enemies: [E(3, 3), E(7, 7)] });
    setT(4, 3, 'pit');
    DD.AutoPlay.takeTurn();
    t.eq(DD.Combat.state.stats.envKills, 1, 'YEETs a foe into the pit');
    // signature at 100 Hype
    quiet({ heroes: [H(1, 3)], enemies: [E(5, 2), E(5, 4), E(7, 7)] });
    DD.Combat.state.hype = 100;
    let spent = false;
    const off = DD.Events.on('hype:changed', function (e) { if (e.delta === -100) spent = true; });
    DD.AutoPlay.takeTurn();
    off();
    t.ok(spent, 'uses the signature at 100 Hype');
    // v2: only the current hero (and its summons) act
    quiet({ heroes: [H(1, 3), H(1, 5, 'test_cleric')], enemies: [E(4, 3), E(7, 7)] });
    const m = hero(0), c = hero(1);
    const cpos = c.x + ',' + c.y;
    DD.AutoPlay.takeTurn();
    t.ok(cur() === m && c.x + ',' + c.y === cpos && c.ap === 0, 'takeTurn plays the mage\'s turn only (the cleric waits for hers)');
    t.ok(m.ap < m.maxAp, 'the mage did something');
    // never stalls
    quiet({ heroes: [H(0, 0)], enemies: [E(7, 7)] });
    for (let x = 0; x < 8; x++) if (x !== 0) setT(x, 4, 'wall');
    setT(0, 4, 'wall');
    const res = DD.AutoPlay.runBattle(5);
    t.ok(res.timeout && res.result === null && res.rounds <= 6, 'runBattle terminates on a stalemate: ' + JSON.stringify(res));
    // runBattle rolls initiative when deployment is open
    quiet({ heroes: [H(0, 0)], enemies: [E(7, 7)], deploy: true, deployTiles: [{ x: 0, y: 0 }, { x: 0, y: 1 }] });
    const res2 = DD.AutoPlay.runBattle(2);
    t.ok(!!DD.Combat.state.order && res2.rounds >= 2, 'runBattle starts a deploying fight');
  });

  T.suite('engine: autoplay puzzle hints', function (t) {
    const A = DD.Act;
    // walks to a hinted lever and pulls it once (the hint drops to 0 after the pull)
    quiet({ heroes: [H(1, 1, 'test_knight')], enemies: [E(7, 7)] });
    let pulled = 0;
    A.placeObject(4, 1, 'lever', { autoplay: function (u, o) { return o.data.on ? 0 : 40; }, onInteract: function () { pulled++; } });
    DD.AutoPlay.takeTurn();
    t.eq(pulled, 1, 'moved next to the lever and pulled it');
    DD.Combat.endTurn();
    DD.AutoPlay.takeTurn();
    t.eq(pulled, 1, 'a spent hint is ignored');
    // steps on a hinted pressure plate (non-blocking objects: walking onto them is the interaction)
    quiet({ heroes: [H(1, 1, 'test_knight')], enemies: [E(7, 7)] });
    A.placeObject(3, 2, 'pressure_plate', { autoplay: function (u, o) { return o.data.pressed ? 0 : 30; } });
    DD.AutoPlay.takeTurn();
    t.ok(tile(3, 2).obj.data.pressed, 'stepped on the hinted plate');
    // smashes a hinted smashable object; unhinted objects are left alone
    quiet({ heroes: [H(1, 1, 'test_knight')], enemies: [E(7, 7)] });
    A.placeObject(2, 1, 'crate', { smashable: true, autoplay: 25 });
    A.placeObject(1, 2, 'crate', { smashable: true });
    DD.AutoPlay.takeTurn();
    t.ok(tile(2, 1).obj === null || tile(2, 1).obj.hp < tile(2, 1).obj.maxHp, 'smashed the hinted crate');
    t.ok(tile(1, 2).obj && tile(1, 2).obj.hp === tile(1, 2).obj.maxHp, 'ignored the unhinted crate');
    // a far-away hint (≥ 10) is approached when nothing else is worth doing
    quiet({ heroes: [H(0, 0, 'test_knight')], enemies: [E(7, 7)] });
    A.placeObject(7, 0, 'lever', { autoplay: 50 });
    const d0 = 7 - hero().x;
    DD.AutoPlay.takeTurn();
    t.ok(7 - hero().x < d0, 'walks toward a distant hinted lever');
    // a throwing hint is contained (counts as 0)
    quiet({ heroes: [H(1, 1, 'test_knight')], enemies: [E(7, 7)] });
    A.placeObject(2, 1, 'lever', { autoplay: function () { throw new Error('boom'); } });
    const before = DD.problems ? DD.problems.length : 0;
    DD.AutoPlay.takeTurn();
    t.ok(!tile(2, 1).obj.data.on, 'a broken hint is ignored');
    if (DD.problems) DD.problems.length = before;
  });

  T.suite('engine: random passives (Table of Questionable Blessings) in combat', function (t) {
    const ids = ['test_rp_tough', 'test_rp_spite'];
    DD.registerPassive({ id: 'test_rp_tough', name: 'Test Toughness', rarity: 'common',
      levels: [{ hp: 5, armor: 1 }, { hp: 10, armor: 2 }], stats: function (L) { return { hp: L.hp, armor: L.armor }; },
      desc: function (L) { return '+' + L.hp + ' max HP, +' + L.armor + ' armor.'; } });
    DD.registerPassive({ id: 'test_rp_spite', name: 'Test Spite', rarity: 'cursed',
      levels: [{ dmg: 3 }], desc: function (L) { return 'Deals +' + L.dmg + ' damage. Hates you.'; },
      hooks: { modifyOutgoingDamage: function (d, p) { d.flat += p.L.dmg; p.data.hits = (p.data.hits || 0) + 1; } } });
    try {
      t.eq(DD.getPassive('test_rp_tough').maxLevel, 2, 'maxLevel from levels');
      t.eq(DD.getPassive('test_rp_spite').weight, 4, 'default weight by rarity (cursed 4)');
      t.eq(DD.passiveDesc({ id: 'test_rp_tough', level: 2 }), '+10 max HP, +2 armor.', 'passiveDesc at a level');
      t.eq(DD.passiveInstance({ id: 'test_rp_tough', level: 9 }).level, 2, 'levels clamp to maxLevel');
      t.eq(DD.passiveInstance('nope'), null, 'unknown passives are dropped');
      const base = DD.Combat.heroStats(DD.Combat.makeRunHero({ id: 'test_knight' }));
      const rh = DD.Combat.makeRunHero({ id: 'test_knight', passives: [{ id: 'test_rp_tough', level: 2 }, 'test_rp_spite', 'nope'] });
      const st = DD.Combat.heroStats(rh);
      t.eq(st.maxHp - base.maxHp, 10, 'passive stats add max HP');
      t.eq(st.armor - base.armor, 2, 'passive stats add armor');
      quiet({ heroes: [H(1, 1, 'test_knight', { passives: [{ id: 'test_rp_tough', level: 2 }, 'test_rp_spite', 'nope'] })], enemies: [E(2, 1), E(7, 7)] });
      const h = hero();
      t.eq(h.passives.length, 2, 'unit gets instances of the known passives');
      t.ok(h.passives[0].def && h.passives[0].L && h.passives[0].data, 'instances carry def, L and data');
      t.eq(h.armor, base.armor + 2, 'unit armor includes the passive');
      const target = foe();
      const hp0 = target.hp;
      DD.Act.damage(h, target, 4, { cause: 'skill' });
      t.eq(hp0 - target.hp, 4 + 3 - (target.armor || 0), 'passive hook adds +3 damage (instance passed as last arg)');
      t.eq(h.passives[1].data.hits, 1, 'per-fight instance data');
      quiet({ heroes: [H(1, 1, 'test_knight', { passives: ['test_rp_spite'] })], enemies: [E(7, 7)] });
      t.ok(!hero().passives[0].data.hits, 'fresh instance data every fight');
    } finally {
      ids.forEach(function (id) { delete DD.defs.passives[id]; });
    }
  });

  T.suite('engine: events, log & barks', function (t) {
    const names = ['combat:start', 'combat:changed', 'combat:log', 'combat:end', 'turn:player', 'turn:enemy', 'turn:start', 'turn:end', 'round:start',
      'round:end', 'initiative:rolled', 'unit:died', 'unit:downed', 'hype:changed'];
    const seen = {};
    const offs = names.map(function (n) { return DD.Events.on(n, function () { seen[n] = (seen[n] || 0) + 1; }); });
    sb({ heroes: [H(1, 1), H(1, 2, 'test_cleric')], enemies: [E(2, 1), E(6, 6)] });
    DD.Combat.useSkill(hero(), hero().basic, 2, 1);
    DD.Combat.endRound();
    DD.Act.kill(foe(0), hero());
    DD.Act.kill(hero(1), foe());
    DD.Act.kill(hero(0), foe());
    offs.forEach(function (f) { f(); });
    names.forEach(function (n) { t.ok(seen[n] > 0, 'event ' + n + ' emitted'); });
    t.eq(seen['combat:end'], 1, 'combat:end once');
    t.eq(seen['initiative:rolled'], 1, 'initiative:rolled once');
    const s = DD.Combat.state;
    t.ok(s.log.every(function (l) { return typeof l.text === 'string' && l.text && typeof l.round === 'number' && l.cls; }), 'log entries { round, text, cls }');
    t.ok(s.log.some(function (l) { return /^Initiative \(fixed\)/.test(l.text); }), 'the initiative order is logged');
    sb({ heroes: [H(1, 1)], enemies: [E(6, 6)] });
    t.eq(DD.Act.bark(foe(), 'no_such_key'), '', 'missing bark key: silent');
    t.ok(DD.getEnemy('test_grunt').barks.attack.indexOf(DD.Act.bark(foe(), 'attack')) >= 0, 'bark key picks a line');
    t.eq(DD.Act.bark(hero(), 'Hello there!'), 'Hello there!', 'literal text barks');
    // FX markers: whose turn the playback has reached
    t.ok(DD.FX.shownTurn && DD.FX.shownTurn.unitId === hero().id, 'FX.shownTurn follows the turn markers (instant: the current one)');
  });

  T.suite('engine: undo (within the current hero\'s turn)', function (t) {
    quiet({ heroes: [H(1, 1), H(1, 5, 'test_cleric')], enemies: [E(7, 7)] });
    const h = hero(), c = hero(1);
    t.ok(!DD.Combat.canUndo(), 'nothing to undo');
    t.ok(DD.Combat.move(h, 3, 2) && h.ap === 2, 'move costs 1 AP');
    t.ok(DD.Combat.canUndo(), 'can undo a clean move');
    t.ok(DD.Combat.undo() && h.x === 1 && h.y === 1 && h.ap === 3, 'undo restores position and AP');
    t.ok(!DD.Combat.canUndo(), 'only once');
    DD.Combat.move(h, 2, 1);
    DD.Combat.useSkill(h, slotOf(h, 'test_frost_ray'), 3, 1);
    t.ok(!DD.Combat.canUndo(), 'no undo after another action');
    DD.Act.placeObject(4, 1, 'spikes');
    h.ap = 3;
    DD.Combat.move(h, 5, 1);
    t.ok(!DD.Combat.canUndo(), 'no undo when the move triggered something');
    t.ok(!DD.Combat.move(h, 7, 7), 'cannot move onto an enemy');
    h.ap = 3;
    DD.Combat.move(h, 5, 2);
    t.ok(DD.Combat.canUndo(), 'a clean move again');
    DD.Combat.endTurn();
    t.ok(cur() === c && !DD.Combat.canUndo(), 'the next hero\'s turn: the old move can no longer be undone');
  });

  T.suite('engine: objectives & reinforcements', function (t) {
    // boss: minions flee
    sb({ w: 9, h: 9, heroes: [H(1, 1)], enemies: [E(7, 7, 'test_boss'), E(6, 2)], objective: { type: 'boss' } });
    t.ok(/Overlord/.test(DD.Combat.state.objective.text), 'boss objective text');
    DD.Act.kill(foe(0), hero());
    const s1 = DD.Combat.state;
    t.eq(s1.result, 'victory', 'boss dies: victory');
    t.ok(s1.units.filter(function (u) { return u.defId === 'test_grunt'; })[0].fled, 'minions flee');
    // survive
    sb({ heroes: [H(1, 1)], enemies: [E(7, 7)], objective: { type: 'survive', rounds: 2 } });
    t.ok(/Survive 2 rounds/.test(DD.Combat.state.objective.text), 'survive text');
    DD.Combat.endTurn();
    t.eq(DD.Combat.state.result, null, 'not yet');
    DD.Combat.endTurn();
    t.eq(DD.Combat.state.result, 'victory', 'victory at the end of round N');
    // destroy
    sb({ heroes: [H(1, 1)], enemies: [E(7, 7)], objective: { type: 'destroy', objId: 'totem', count: 2 },
      objects: [{ x: 3, y: 3, id: 'totem' }, { x: 4, y: 4, id: 'totem' }, { x: 5, y: 5, id: 'totem' }] });
    t.ok(/Destroy 2 Totems \(0\/2\)/.test(DD.Combat.state.objective.text), 'destroy text: ' + DD.Combat.state.objective.text);
    DD.Act.damageObject(hero(), 3, 3, 99);
    t.ok(/1\/2/.test(DD.Combat.state.objective.text) && !DD.Combat.state.result, 'progress');
    DD.Act.teleport(hero(), 4, 3);
    const smash = DD.Combat.interactions(hero()).filter(function (o) { return o.kind === 'smash'; })[0];
    t.ok(smash && smash.x === 4 && smash.y === 4 && smash.ap === 1, 'objective objects can be smashed (1 AP)');
    t.ok(DD.Combat.interact(hero(), 4, 4) && tile(4, 4).obj.hp === 5, 'Smash deals 5');
    DD.Act.damageObject(hero(), 4, 4, 99);
    t.eq(DD.Combat.state.result, 'victory', 'destroyed enough');
    // protect object
    sb({ heroes: [H(1, 1)], enemies: [E(7, 7)], objective: { type: 'protect', objId: 'keg' }, objects: [{ x: 3, y: 3, id: 'keg' }] });
    DD.Act.damageObject(foe(), 3, 3, 99);
    t.eq(DD.Combat.state.result, 'defeat', 'protected object destroyed: defeat');
    sb({ heroes: [H(1, 1), H(2, 2, 'test_cleric')], enemies: [E(7, 7)], objective: { type: 'protect' } });
    DD.Combat.state.objective.unitId = hero(1).id;
    DD.Act.kill(hero(1), foe());
    t.eq(DD.Combat.state.result, 'defeat', 'protected unit down: defeat');
    sb({ heroes: [H(1, 1)], enemies: [E(2, 1)], objective: { type: 'protect', objId: 'keg' }, objects: [{ x: 5, y: 5, id: 'keg' }] });
    DD.Act.kill(foe(), hero());
    t.eq(DD.Combat.state.result, 'victory', 'protect: victory by killing everything');
    // custom
    sb({ heroes: [H(1, 1)], enemies: [E(7, 7)], objective: { type: 'custom', text: 'Do the thing' },
      encounter: { id: 'test_custom', checkObjective: function (st) { return st.round >= 2 ? 'victory' : null; } } });
    t.eq(DD.Combat.state.objective.text, 'Do the thing', 'custom text');
    DD.Combat.endTurn();
    t.eq(DD.Combat.state.result, 'victory', 'custom checkObjective');
    // reinforcements
    quiet({ heroes: [H(1, 1)], enemies: [E(7, 7)], reinforcements: [{ round: 2, enemies: [{ id: 'test_minion', n: 2 }], edge: 'E' }] });
    t.eq(DD.Combat.enemies().length, 1, 'one enemy at first');
    DD.Combat.endTurn();
    t.eq(DD.Combat.enemies().length, 3, 'reinforcements at round 2');
    t.ok(DD.Combat.enemies().every(function (u) { return !!entryOf(u) && u.order >= 1; }), 'they joined the initiative order (unit.order = position)');
    // encounter hooks + rules
    let calls = [];
    sb({ heroes: [H(1, 1)], enemies: [E(7, 7)], rules: [{ id: 'test_r', name: 'R', turns: 1, hooks: { onRoundStart: function (u, r) { calls.push('rule' + r); } } }],
      encounter: { id: 'test_hooks', onStart: function () { calls.push('start'); }, onRoundStart: function (st) { calls.push('round' + st.round); }, onRoundEnd: function (st) { calls.push('end' + st.round); } } });
    DD.Combat.endTurn();
    t.eq(calls.join(' '), 'start round1 rule1 rule1 end1 round2', 'encounter hooks + per-unit rule hooks in order');
    t.eq(DD.Combat.state.rules.length, 0, 'rule with turns 1 expired');
  });

  T.suite('engine: preview simulation', function (t) {
    quiet({ heroes: [H(1, 3), H(1, 5, 'test_cleric')], enemies: [E(4, 3), E(4, 4), E(7, 7)] });
    const s = DD.Combat.state;
    const h = hero();
    function plain() {
      return JSON.stringify({
        units: s.units.map(function (u) { return [u.id, u.x, u.y, u.hp, u.block, u.ap, u.apBank, u.dead, u.downed, u.statuses, u.intents, DD.Combat.slotsOf(u)]; }),
        tiles: s.grid.tiles.map(function (tl) { return [tl.t, tl.h, tl.surface, tl.obj && [tl.obj.id, tl.obj.hp]]; }),
        hype: s.hype, log: s.log.length, rng: s.rng.getState(), stats: s.stats, round: s.round, phase: s.phase, rules: s.rules.length, gold: s.sandboxGold,
        order: s.order, cur: s.current, turn: s.turn, joining: s.joining,
      });
    }
    DD.Act.placeObject(5, 3, 'barrel_explosive');
    const before = plain();
    const fxBefore = DD.FX.queue.length;
    let events = 0;
    const offs = ['combat:changed', 'combat:log', 'hype:changed', 'unit:died'].map(function (n) { return DD.Events.on(n, function () { events++; }); });
    const fb = slotOf(h, 'test_fireball');
    const p = DD.Combat.preview(h, fb, 4, 3);
    t.ok(p.perUnit[foe(1).id] && p.perUnit[foe(1).id].dmg === 6, 'fireball preview: 6 (5 +1 passive)');
    t.ok(p.perUnit[foe(0).id] && p.perUnit[foe(0).id].lethal, 'the ignited barrel finishes the other grunt (6 + 8 explosion)');
    t.ok(tile(5, 3).obj && tile(5, 3).obj.id === 'barrel_explosive', 'the barrel is still there after the preview');
    t.ok(p.tiles.length === 5 && p.units.length === 2, 'tiles + units');
    t.eq(plain(), before, 'state restored exactly (initiative order and turn included)');
    t.ok(DD.FX.queue.length === fxBefore && events === 0 && !DD.Act.simulating && DD.Combat.state === s, 'no FX, no events, flags restored');
    foe(0).hp = 3;
    t.ok(DD.Combat.preview(h, fb, 4, 3).perUnit[foe(0).id].lethal, 'lethal flag');
    // push preview into a pit is lethal
    quiet({ heroes: [H(2, 3, 'test_knight')], enemies: [E(3, 3), E(7, 7)] });
    setT(5, 3, 'pit');
    const kb = DD.Combat.preview(hero(), slotOf(hero(), 'test_shield_bash'), 3, 3);
    t.ok(kb.perUnit[foe(0).id].lethal && kb.hype === 20, 'shield bash into the pit: lethal + env Hype');
    // heals and statuses
    quiet({ heroes: [H(1, 1, 'test_cleric'), H(1, 2)], enemies: [E(7, 7)] });
    hero(1).hp = 5;
    const hp = DD.Combat.preview(hero(0), slotOf(hero(0), 'test_heal'), 1, 2).perUnit[hero(1).id];
    t.ok(hp.heal === 7 && hp.block === 1, 'heal preview (+ passive Block)');
    const bl = DD.Combat.preview(hero(0), slotOf(hero(0), 'test_bless'), 1, 2).perUnit[hero(1).id];
    t.ok(bl.statuses.indexOf('inspired') >= 0 && /Inspired/.test(bl.text), 'status preview');
    // a summon's preview does not roll its initiative (it acts on its owner's turn) and stays certain
    quiet({ heroes: [H(1, 1, 'test_summoner')], enemies: [E(7, 7)] });
    const ps = DD.Combat.preview(hero(), slotOf(hero(), 'test_call_hound'), 2, 1);
    t.ok(ps.spawned.length === 1 && !ps.uncertain, 'summon preview: spawned, certain');
    // skill.preview override + random → uncertain
    quiet({ heroes: [H(1, 1, 'test_cleric'), H(1, 2)], enemies: [E(7, 7)] });
    const custom = { id: 'test_tmp_preview', name: 'Tmp', target: { type: 'unit', range: [0, 9], filter: 'any' }, levels: [{}], tags: ['random'],
      preview: function (ctx) { const o = {}; o[ctx.targetUnit.id] = { dmg: 99, text: 'lots' }; return o; }, execute: function () {} };
    const pv = DD.Targeting.preview(hero(0), custom, { x: 7, y: 7 });
    t.ok(pv.uncertain && pv.perUnit[foe().id].dmg === 99 && pv.perUnit[foe().id].lethal, 'preview override + random uncertain');
    // a throwing skill still restores everything
    const st2 = DD.Combat.state;
    const snap = JSON.stringify(st2.units.map(function (u) { return [u.hp, u.x, u.y]; }));
    const rngBefore = st2.rng.getState();
    const nProblems = DD.problems.length;
    const boom = { id: 'test_tmp_throw', name: 'Throw', target: { type: 'unit', range: [0, 9], filter: 'any' }, levels: [{}],
      execute: function (ctx) { DD.Act.damage(ctx.user, ctx.targetUnit, 5); ctx.state.rng.next(); throw new Error('intentional test error'); } };
    DD.Targeting.preview(hero(0), boom, { x: 7, y: 7 });
    t.ok(JSON.stringify(st2.units.map(function (u) { return [u.hp, u.x, u.y]; })) === snap && st2.rng.getState() === rngBefore && DD.Combat.state === st2 && !DD.Act.simulating, 'restored after a throw');
    const caught = DD.problems.slice(nProblems).filter(function (w) { return /intentional test error/.test(w); });
    t.eq(caught.length, 1, 'error reported');
    for (let i = DD.problems.length - 1; i >= nProblems; i--) if (/intentional test error/.test(DD.problems[i])) DD.problems.splice(i, 1);
    // speed
    quiet({ w: 10, h: 10, heroes: [H(1, 3), H(1, 5, 'test_cleric'), H(2, 4, 'test_knight'), H(0, 4, 'test_rogue')], enemies: [E(4, 3), E(4, 4), E(7, 7), E(8, 2), E(6, 6, 'test_brute')] });
    const t0 = performance.now();
    for (let i = 0; i < 50; i++) DD.Combat.preview(hero(), slotOf(hero(), 'test_fireball'), 4, 3);
    const per = (performance.now() - t0) / 50;
    t.log('preview avg ' + per.toFixed(2) + 'ms');
    t.ok(per < 5, 'preview is fast (' + per.toFixed(2) + 'ms)');
    offs.forEach(function (f) { f(); });
  });

  // =====================================================================================================
  // Adversarial review (VERIFY-ENGINE, ported to v2): every suite below pins a bug that was found and fixed, or
  // an edge case of DESIGN §4 / ARCHITECTURE §4-6 that is easy to break. Suites are prefixed "engine: review".
  // =====================================================================================================

  T.suite('engine: review — immobile units (mov 0) and Slow', function (t) {
    quiet({ heroes: [H(1, 1, 'test_summoner')], enemies: [E(6, 6)] });
    const tur = DD.Act.summon(hero(), 'test_turret', 3, 3, { ready: true, noFx: true });
    t.eq(tur && tur.mov, 0, 'a mov 0 summon (turret) keeps mov 0');
    t.eq(DD.Combat.reachable(tur).size, 0, 'and cannot move');
    const statue = DD.Act.newEnemyUnit(Object.assign({}, DD.getEnemy('test_grunt'), { mov: 0 }), 0, 0);
    t.eq(statue.mov, 0, 'a mov 0 enemy def keeps mov 0');
    const g = foe();
    g.mov = 0;
    DD.Act.addStatus(g, 'slow', { turns: 1 });
    t.eq(DD.Combat.effectiveMov(g), 0, 'Slow never gives a stationary enemy movement');
    g.mov = 3;
    t.eq(DD.Combat.effectiveMov(g), 1, 'Slow: move 3 → 1');
    g.mov = 0;
    DD.Act.removeStatus(g, 'slow', { silent: true });
    const pos = { x: g.x, y: g.y };
    DD.AI.act(g);
    t.ok(g.x === pos.x && g.y === pos.y, 'a mov 0 enemy stays put on its turn');
  });

  T.suite('engine: review — setCooldown(n) blocks the owner\'s next n turns', function (t) {
    quiet({ heroes: [H(1, 1)], enemies: [E(5, 2, 'test_mortar')] });
    const h = hero(), m = foe(), fb = slotOf(h, 'test_fireball');
    DD.Act.setCooldown(h, 'test_fireball', 1);
    t.ok(/cooldown/i.test(String(DD.Combat.canUse(h, fb))), 'set during its own turn: blocked now');
    DD.Combat.endTurn();
    t.ok(/cooldown/i.test(String(DD.Combat.canUse(h, fb))), 'and during its next turn, like a cooldown-1 skill');
    DD.Combat.endTurn();
    t.eq(DD.Combat.canUse(h, fb), true, 'usable the turn after');
    let done = false;
    DD.Act.addRule({ id: 'test_cd_rule', name: 'Objection!', hooks: { onTurnStart: function (u) {
      if (u.side === 'enemy' && !done) { done = true; DD.Act.setCooldown(h, 'test_fireball', 1); }
    } } });
    DD.Combat.endTurn();
    DD.Act.removeRule('test_cd_rule');
    t.ok(done && /cooldown/i.test(String(DD.Combat.canUse(h, fb))), 'setCooldown(1) from an enemy\'s turn blocks the hero\'s next turn');
    DD.Combat.slotsOf(m).forEach(function (sl) { sl.cd = 0; sl.fresh = false; });
    DD.Act.setCooldown(m, 'test_lob', 1);
    let uses = countUses(function () { DD.Combat.endTurn(); });
    t.ok(!uses['test_mortar:test_lob'], 'setCooldown(1) on an enemy: no lob on its next turn');
    uses = countUses(function () { DD.Combat.endTurn(); });
    t.eq(uses['test_mortar:test_lob'], 1, 'and it lobs again the turn after');
  });

  T.suite('engine: review — an action cancelled mid-turn never happens', function (t) {
    withTemp('enemies', [{ id: 'test_tmp_double', name: 'Double Stabber', act: 1, tier: 'normal', hp: 20, sprite: SPR, skills: ['test_grunt_stab'],
      ai: function (u, api) { const h = api.heroes()[0]; api.act(u, 'test_grunt_stab', h, {}); api.act(u, 'test_grunt_stab', h, {}); } }], function () {
      quiet({ noPlan: false, heroes: [H(2, 3)], enemies: [E(3, 3, 'test_tmp_double')] });
      const h = hero(), g = foe();
      h.maxHp = h.hp = 60;
      DD.Act.addRule({ id: 'test_counter', name: 'Back In My Day', hooks: { onTakeDamage: function (d) {
        if (d.target === h && d.source === g && d.cause === 'skill' && !DD.Act.hasStatus(g, 'stun')) DD.Act.addStatus(g, 'stun', { turns: 1 }, h);
      } } });
      const hp = h.hp;
      DD.Combat.endTurn();
      DD.Act.removeRule('test_counter');
      t.eq(hp - h.hp, 4, 'the counter-stun after the first stab stops the second one');
      t.ok(has(g, 'stun'), 'stunned during its own turn: still stunned after it');
      const hp2 = h.hp;
      DD.Combat.endTurn();
      t.ok(h.hp === hp2 && !has(g, 'stun'), 'it lost its NEXT turn, then the stun was gone');
    });
  });

  T.suite('engine: review — ground-anchored wind-ups are fixed tiles', function (t) {
    quiet({ w: 9, h: 9, heroes: [H(2, 4)], enemies: [E(3, 4)], enemyAi: false });
    const h = hero(), g = foe();
    const ring = DD.AI.windUp(g, 'test_sweep', g, { anchor: 'ground', noCooldown: true });
    const ringBefore = keys(DD.AI.intentTiles(g, ring));
    DD.Act.push(h, g, { x: 0, y: 1 }, 2);
    t.eq(keys(DD.AI.intentTiles(g, ring)), ringBefore, 'an apex-based area (adjacent) stays where it was drawn when its owner is pushed');
    const row = DD.AI.windUp(g, 'test_smash', { x: g.x - 1, y: g.y }, { anchor: 'ground' });
    const rowBefore = keys(DD.AI.intentTiles(g, row));
    DD.Act.push(h, g, { x: 0, y: 1 }, 2);
    t.eq(keys(DD.AI.intentTiles(g, row)), rowBefore, 'a ground row does not rotate when its owner moves');
    const hp = h.hp;
    const ctx = captureSkill(g, function () { DD.AI.executeIntent(g, ring); });
    t.ok(ctx && keys(ctx.tiles) === ringBefore, 'it resolves on the drawn tiles');
    t.ok(h.hp < hp, 'and hits the hero standing in them');
  });

  T.suite('engine: review — tracking wind-ups lose stealthed targets', function (t) {
    quiet({ w: 9, h: 9, heroes: [H(2, 3)], enemies: [E(6, 3, 'test_archer')], enemyAi: false });
    const it = DD.AI.windUp(foe(), 'test_arrow', hero(), { track: true });
    DD.Act.addStatus(hero(), 'stealth', { turns: 2 });
    let hp = hero().hp;
    DD.AI.executeIntent(foe(), it);
    t.eq(hero().hp, hp, 'a tracking wind-up fizzles when its target is stealthed');
    quiet({ heroes: [H(2, 3)], enemies: [E(3, 3)], enemyAi: false });
    const it2 = DD.AI.windUp(foe(), 'test_grunt_stab', hero(), {});
    DD.Act.addStatus(hero(), 'stealth', { turns: 2 });
    hp = hero().hp;
    DD.AI.executeIntent(foe(), it2);
    t.eq(hero().hp, hp - 4, 'a swing at a tile still hits whoever stands there (stealth breaks tracking only)');
  });

  T.suite('engine: review — Dazzle shifts every attack shape by one tile', function (t) {
    quiet({ w: 9, h: 9, heroes: [H(1, 4)], enemies: [E(4, 4)], enemyAi: false });
    const g = foe();
    const it = DD.AI.makeIntent(g, 'test_cone_of_cold', { x: 3, y: 4 }, { noAdd: true });
    const drawn = DD.AI.intentTiles(g, it);
    DD.Act.addStatus(g, 'dazzled', { turns: 1 });
    const ctx = captureSkill(g, function () { DD.AI.executeIntent(g, it); });
    t.ok(ctx && keys(ctx.tiles) !== keys(drawn), 'a dazzled cone does not land where it was aimed');
    t.ok(ctx && DIRS4.some(function (d) { return keys(shifted(drawn, d)) === keys(ctx.tiles); }), 'it lands exactly one tile off');
    quiet({ w: 9, h: 9, heroes: [H(1, 4)], enemies: [E(4, 4)], enemyAi: false });
    const g2 = foe();
    const ring = DD.AI.makeIntent(g2, 'test_sweep', g2, { noAdd: true });
    const drawn2 = DD.AI.intentTiles(g2, ring);
    DD.Act.addStatus(g2, 'dazzled', { turns: 1 });
    const ctx2 = captureSkill(g2, function () { DD.AI.executeIntent(g2, ring); });
    t.ok(ctx2 && DIRS4.some(function (d) { return keys(shifted(drawn2, d)) === keys(ctx2.tiles); }), 'an adjacent sweep is shifted too');
  });

  T.suite('engine: review — a charmed enemy turns on its own side on its turn', function (t) {
    quiet({ heroes: [H(1, 3)], enemies: [E(2, 3), E(3, 3)] });
    const a = foe(0), b = foe(1), h = hero();
    h.maxHp = h.hp = 60;
    DD.Act.addStatus(a, 'charmed', { turns: 1 }, h);
    const hpH = h.hp, hpB = b.hp;
    DD.Combat.endTurn();   // round 1 (noPlan): they pass; the charm (1 turn) is spent on that turn
    t.ok(h.hp === hpH && b.hp === hpB && !has(a, 'charmed'), 'a charm that covers a passed turn is simply used up');
    DD.Act.addStatus(a, 'charmed', { turns: 1 }, h);
    const fromA = [];
    DD.Act.addRule({ id: 'test_from_a', name: 'Who Hit Whom', hooks: { onTakeDamage: function (d) { if (d.source === a && d.cause === 'skill') fromA.push(d.target === h ? 'hero' : d.target === b ? 'friend' : '?'); } } });
    DD.Combat.endTurn();
    DD.Act.removeRule('test_from_a');
    t.ok(fromA.indexOf('hero') < 0, 'the charmed goblin does not stab the hero');
    t.ok(fromA.indexOf('friend') >= 0 && b.hp < hpB, 'it stabs its friend instead');
    t.ok(!has(a, 'charmed'), 'charm (1 turn) wears off after that turn');
    // nobody of its own side in reach: it attacks nobody
    quiet({ heroes: [H(1, 3)], enemies: [E(2, 3), E(7, 7)] });
    const c = foe(0);
    DD.Act.addStatus(c, 'charmed', { turns: 1 }, hero());
    const hp = hero().hp;
    DD.AI.act(c);
    t.eq(hero().hp, hp, 'no friend in reach: no attack on the heroes either');
    // a pending wind-up keeps its countdown through a charm
    quiet({ w: 9, h: 9, heroes: [H(2, 3)], enemies: [E(7, 7, 'test_boss')], enemyAi: false });
    const boss = foe();
    DD.AI.windUp(boss, 'test_boss_meteor', hero(), {});
    DD.Act.addStatus(boss, 'charmed', { turns: 1 }, hero());
    t.ok(boss.intents.some(function (i) { return i.skillId === 'test_boss_meteor' && i.pending; }), 'wind-ups survive a charm');
  });

  T.suite('engine: review — queries never consume the combat RNG', function (t) {
    const dice = { id: 'test_tmp_dice', name: 'Dice Area', owner: 'enemy', icon: '🎲', kind: 'attack', tags: [], ap: 0, anchor: 'self',
      levels: [{ dmg: 2 }], target: { type: 'tile', range: [0, 9], filter: 'any', los: false },
      area: { shape: 'custom', fn: function (ctx) { (ctx.rng || DD.Combat.state.rng).next(); return [ctx.target]; } },
      desc: function (L) { return 'Deal ' + L.dmg + ' damage to a tile chosen by fate.'; },
      execute: function (ctx) { ctx.foes.forEach(function (f) { DD.Act.damage(ctx.user, f, ctx.L.dmg); }); } };
    withTemp('skills', [dice], function () {
      quiet({ heroes: [H(1, 1)], enemies: [E(4, 4)] });
      const s = DD.Combat.state, h = hero(), g = foe();
      const r0 = s.rng.getState();
      DD.Targeting.area(h, dice, 1, { x: 4, y: 4 });
      DD.Targeting.buildCtx(h, dice, { x: 4, y: 4 });
      DD.Targeting.validTargets(h, dice);
      DD.Targeting.preview(h, dice, { x: 4, y: 4 });
      const it = DD.AI.makeIntent(g, 'test_tmp_dice', { x: 1, y: 1 }, { noAdd: true });
      for (let i = 0; i < 5; i++) { DD.AI.intentTiles(g, it); DD.AI.describe(g, it); }
      DD.AI.windups(); DD.AI.threatMap('hero'); DD.AI.reachOf(g);
      t.eq(s.rng.getState(), r0, 'area / buildCtx / validTargets / preview / intentTiles / describe / windups / threatMap leave state.rng alone');
      const fake = Object.assign({}, dice, { id: 'test_tmp_dice2', area: { shape: 'single' }, preview: function (ctx) { ctx.rng.next(); return {}; } });
      DD.Targeting.preview(h, fake, { x: 4, y: 4 });
      t.eq(s.rng.getState(), r0, 'a skill.preview() override that rolls dice does not advance the real RNG');
      const picky = Object.assign({}, dice, { id: 'test_tmp_dice3', area: { shape: 'single' }, canUse: function (ctx) { ctx.rng.next(); return true; },
        target: { type: 'tile', range: [1, 3], filter: 'any', los: false, canTarget: function (ctx) { ctx.rng.next(); return true; } } });
      DD.Combat.canUse(h, picky);
      t.eq(s.rng.getState(), r0, 'canUse / canTarget callbacks that roll dice do not advance it either');
    });
  });

  T.suite('engine: review — objectives: protect by def id, multi-unit bosses', function (t) {
    sb({ heroes: [H(1, 1), H(2, 2, 'test_cleric')], enemies: [E(7, 7)], objective: { type: 'protect', unitId: 'test_cleric' } });
    t.eq(DD.Combat.state.result, null, 'protect { unitId: <def id> }: no instant defeat while the VIP stands');
    DD.Act.kill(hero(1), foe());
    t.eq(DD.Combat.state.result, 'defeat', 'the VIP named by def id going down is a defeat');
    sb({ w: 9, h: 9, heroes: [H(1, 1)], enemies: [E(7, 7, 'test_boss')], objective: { type: 'boss', bossId: 'test_boss' } });
    const s = DD.Combat.state, b = foe();
    let p2 = null;
    b.hooks = { onDeath: function () { p2 = DD.Act.spawn('test_brute', 6, 6, { silent: true }); if (p2) { p2.tier = 'boss'; p2.isBoss = true; } } };
    DD.Act.kill(b, hero());
    t.ok(p2 && !p2.dead, 'phase 2 arrives as a new boss-tier unit');
    t.eq(s.result, null, 'killing phase 1 is not a victory while phase 2 stands');
    DD.Act.kill(p2, hero());
    t.eq(s.result, 'victory', 'killing the last boss-tier unit wins');
  });

  T.suite('engine: review — deployment moves are not tile entries and cost nothing', function (t) {
    const tiles = [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }, { x: 0, y: 3 }];
    let entered = 0;
    sb({ w: 8, h: 8, deploy: true, deployTiles: tiles, heroes: [H(0, 0), H(0, 1, 'test_cleric')], enemies: [E(6, 1)],
      objective: { type: 'custom' }, encounter: { id: 'test_dep', checkObjective: function () { return null; } },
      rules: [{ id: 'test_enter_count', name: 'Doormat', hooks: { onEnterTile: function (u) { if (u.side === 'hero') entered++; } } }] });
    const s = DD.Combat.state, a = hero(0), b = hero(1);
    const log1 = s.log.length, rng1 = s.rng.getState();
    t.ok(DD.Combat.deployMove(a, 0, 3), 'deploy move');
    t.ok(DD.Combat.deployMove(b, 0, 2), 'another one');
    t.ok(DD.Combat.deployMove(a, 0, 2), 'a deploy swap');
    t.eq(entered, 0, 'deploy moves and swaps are not tile entries (no onEnterTile)');
    t.ok(s.log.length === log1 && s.rng.getState() === rng1, 'no log lines, no dice');
    t.ok(a.y === 2 && b.y === 3 && s.deploy.active, 'deployment positions kept, deployment still open');
  });

  T.suite('engine: review — displacement edge cases', function (t) {
    quiet({ heroes: [H(2, 2)], enemies: [E(5, 5), E(7, 7)] });
    setT(3, 3, 'pit');
    const h = hero(), g = foe(0);
    h.flags.flying = true;
    t.ok(DD.Act.teleport(h, 3, 3), 'a flyer hovers over the pit');
    t.ok(DD.Act.swap(h, g), 'swap places');
    t.ok(g.dead, 'the grounded enemy swapped onto the pit falls in');
    t.eq(DD.Grid.unitAt(3, 3), null, 'nobody is left standing in the pit');
    // a stun stops a walk just like Root does
    quiet({ w: 9, h: 3, heroes: [H(0, 1)], enemies: [E(8, 1)] });
    DD.Act.placeObject(2, 1, 'pressure_plate', { onEnter: function (u) { DD.Act.addStatus(u, 'stun', { turns: 1 }, null); } });
    DD.Combat.move(hero(), 4, 1);
    t.eq(hero().x, 2, 'stunned mid-walk: the hero stops on the trap');
  });

  T.suite('engine: review — units created during combat start get onCombatStart', function (t) {
    const seen = [];
    sb({ heroes: [H(1, 1, 'test_summoner')], enemies: [E(6, 6)], rules: [{ id: 'test_cs', name: 'Roll Call', hooks: { onCombatStart: function (u) { seen.push(u.kind); } } }] });
    t.ok(DD.Combat.party().some(function (u) { return u.kind === 'summon'; }), 'the passive hound exists');
    t.eq(seen.filter(function (k) { return k === 'summon'; }).length, 1, 'the hound summoned in onCombatStart got onCombatStart (once)');
    t.eq(seen.filter(function (k) { return k === 'hero'; }).length, 1, 'the hero once');
    t.eq(seen.filter(function (k) { return k === 'enemy'; }).length, 1, 'the enemy once');
  });

  T.suite('engine: review — enemy stun timing (loses exactly one turn)', function (t) {
    quiet({ w: 9, h: 9, noPlan: false, heroes: [H(1, 4)], enemies: [E(7, 4)] });
    const g = foe();
    let fired = false;
    DD.Act.addRule({ id: 'test_trap_stun', name: 'Stun Trap', hooks: { onEnterTile: function (u, tl, cause) {
      if (u === g && cause === 'move' && !fired) { fired = true; DD.Act.addStatus(u, 'stun', { turns: 1 }, null); }
    } } });
    DD.Combat.endTurn();
    DD.Act.removeRule('test_trap_stun');
    t.ok(fired && has(g, 'stun'), 'stunned while walking on its own turn: still stunned afterwards');
    const at = { x: g.x, y: g.y };
    let turns = 0;
    const off = DD.Events.on('turn:start', function (e) { if (e.unit === g) turns++; });
    DD.Combat.endTurn();
    t.ok(turns === 1 && !has(g, 'stun') && g.x === at.x && g.y === at.y, 'it lost its next turn (did not move), then the stun was gone');
    DD.Combat.endTurn();
    off();
    t.ok(g.x !== at.x || g.y !== at.y, 'it walks again the turn after');
    quiet({ w: 9, h: 9, noPlan: false, heroes: [H(1, 4)], enemies: [E(7, 4)] });
    const g2 = foe();
    DD.Act.addRule({ id: 'test_ts', name: 'Zap', hooks: { onTurnStart: function (u) { if (u === g2 && DD.Combat.state.round === 1) DD.Act.addStatus(u, 'stun', { turns: 1 }, null); } } });
    const at2 = { x: g2.x, y: g2.y };
    DD.Combat.endTurn();
    DD.Act.removeRule('test_ts');
    t.ok(!has(g2, 'stun') && g2.x === at2.x, 'stunned at the start of its own turn (before acting): it lost that turn, removed at its end');
    quiet({ w: 9, h: 9, noPlan: false, heroes: [H(1, 4)], enemies: [E(7, 4)] });
    const g3 = foe();
    DD.Act.addRule({ id: 'test_te', name: 'Zap', hooks: { onTurnEnd: function (u) { if (u === g3 && DD.Combat.state.round === 1) DD.Act.addStatus(u, 'stun', { turns: 1 }, null); } } });
    DD.Combat.endTurn();
    DD.Act.removeRule('test_te');
    const at3 = { x: g3.x, y: g3.y };
    t.ok(has(g3, 'stun'), 'stunned at the end of its turn: it will skip the next one');
    DD.Combat.endTurn();
    t.ok(!has(g3, 'stun') && g3.x === at3.x, 'and is free after that lost turn');
  });

  T.suite('engine: review — the AI does not walk to its death', function (t) {
    quiet({ w: 6, h: 3, heroes: [H(0, 1)], enemies: [E(3, 1, 'test_minion')] });
    setT(1, 1, 'lava'); setT(0, 0, 'wall'); setT(0, 2, 'wall');
    hero().hp = 2;
    const m = foe();
    DD.AI.act(m);
    t.ok(!m.dead && !(m.x === 1 && m.y === 1), 'a 6 HP minion does not step into lava (8 + Burn) even for a kill');
    quiet({ w: 7, h: 3, heroes: [H(0, 1)], enemies: [E(4, 1, 'test_minion')] });
    [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2], [3, 0], [3, 2]].forEach(function (p) { setT(p[0], p[1], 'wall'); });
    DD.Act.placeObject(2, 1, 'spikes');
    foe().hp = 4;
    hero().hp = 2;
    DD.AI.act(foe());
    t.ok(!foe().dead, 'a 4 HP minion does not walk over spikes (5) even for a kill');
    quiet({ w: 7, h: 3, heroes: [H(0, 1)], enemies: [E(4, 1)] });
    [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2], [3, 0], [3, 2]].forEach(function (p) { setT(p[0], p[1], 'wall'); });
    DD.Act.placeObject(2, 1, 'spikes');
    hero().hp = 2;
    const g = foe();
    DD.AI.act(g);
    t.ok(!g.dead && g.x === 1 && hero().downed, 'a 14 HP grunt does brave the spikes for the kill');
  });

  T.suite('engine: review — the default AI can use single-tile "empty" skills', function (t) {
    const hop = { id: 'test_tmp_hop', name: 'Shadow Hop', owner: 'enemy', icon: '🌀', kind: 'move', tags: [], ap: 0, anchor: 'ground',
      levels: [{}], target: { type: 'tile', range: [1, 5], filter: 'empty', los: false },
      desc: function () { return 'Teleport to an empty tile next to a hero.'; },
      aiScore: function (ctx) { return ctx.target && DD.Combat.active('hero').some(function (x) { return DD.Grid.dist(x, ctx.target) === 1; }) ? 8 : 0; },
      execute: function (ctx) { if (ctx.target) DD.Act.teleport(ctx.user, ctx.target.x, ctx.target.y); } };
    withTemp('skills', [hop], function () {
      quiet({ w: 10, h: 5, heroes: [H(1, 2)], enemies: [E(6, 2)] });
      const g = foe();
      g.skillSlots = [DD.Act.makeSlot('test_tmp_hop', 1)];
      g.mov = 0;
      DD.AI.act(g);
      t.eq(dist(g, hero()), 1, 'it hops onto a tile next to the hero');
    });
  });

  T.suite('engine: review — Cheeto dust slows whoever walks in', function (t) {
    quiet({ heroes: [H(1, 1)], enemies: [E(7, 7)] });
    const h = hero();
    DD.Act.setSurface(2, 1, 'cheeto', 4);
    t.ok(DD.Combat.move(h, 2, 1), 'walk into the dust');
    DD.Combat.endTurn();
    t.eq(h.ap, h.maxAp - 1, 'Slowed (−1 AP) on the next turn');
    DD.Combat.endTurn();
    t.eq(h.ap, h.maxAp, 'for one turn only');
    quiet({ heroes: [H(1, 1)], enemies: [E(7, 7)] });
    DD.Act.setSurface(2, 1, 'cheeto', 4);
    DD.Act.push(foe(), hero(), { x: 1, y: 0 }, 1);
    t.ok(has(hero(), 'slow'), 'pushed in: slowed too');
  });

  T.suite('engine: review — deaths mid-resolution', function (t) {
    // an AoE kills one target whose death spawns more units into the blast: no double hits, no errors
    quiet({ heroes: [H(1, 3)], enemies: [E(4, 3), E(4, 4), E(7, 7)] });
    const s = DD.Combat.state, h = hero(), a = foe(0), b = foe(1);
    a.hp = 1;
    let spawned = [];
    a.hooks = { onDeath: function () { spawned = [DD.Act.spawn('test_minion', 5, 3, { silent: true }), DD.Act.spawn('test_minion', 3, 3, { silent: true })]; } };
    const hype0 = s.hype;
    t.ok(DD.Combat.useSkill(h, slotOf(h, 'test_fireball'), 4, 3), 'fireball into the pack');
    t.ok(a.dead && b.hp === b.maxHp - 6, 'the first target dies, the second takes its 6');
    t.ok(spawned.length === 2 && spawned.every(function (m) { return m && !m.dead && m.hp === m.maxHp; }), 'units born mid-blast are not hit by it');
    t.ok(s.hype - hype0 >= 8 + 4, 'Hype: one kill (+8) and a multi-hit (+4)');
    // killed by thorns during its own turn: the rest of its actions never happen
    withTemp('enemies', [{ id: 'test_tmp_double2', name: 'Double Stabber', act: 1, tier: 'normal', hp: 14, sprite: SPR, skills: ['test_grunt_stab'],
      ai: function (u, api) { const x = api.heroes()[0]; api.act(u, 'test_grunt_stab', x, {}); api.act(u, 'test_grunt_stab', x, {}); } }], function () {
      quiet({ heroes: [H(2, 3)], enemies: [E(3, 3, 'test_tmp_double2')] });
      const g = foe(), hh = hero();
      DD.Act.addStatus(hh, 'thorns', { stacks: 99, turns: 2 });
      const hp = hh.hp;
      DD.AI.act(g);
      t.ok(g.dead && hp - hh.hp === 4, 'the stabber dies on its first stab; the second one never happens');
    });
    // a slide on ice that ends in a pit is still a YEET (+20 Hype)
    quiet({ heroes: [H(1, 3)], enemies: [E(2, 3), E(7, 7)] });
    setT(3, 3, 'ice'); setT(4, 3, 'pit');
    const r = DD.Act.push(hero(), foe(0), { x: 1, y: 0 }, 1);
    t.ok(r.fell && DD.Combat.state.units.filter(function (u) { return u.x === 4 && u.y === 3; })[0].dead, 'pushed onto ice, slid into the pit');
    t.eq(DD.Combat.state.hype, 20, 'environmental kill credited to the pusher');
    // one fireball kills the last two enemies: victory once, finalized after the action, no stray errors
    const results = [];
    let ends = 0;
    const off = DD.Events.on('combat:end', function () { ends++; });
    sb({ heroes: [H(1, 3)], enemies: [E(4, 3), E(4, 4)], onEnd: function (res) { results.push(res); } });
    foe(0).hp = 1; foe(1).hp = 1;
    let duringAction = null;
    DD.Act.addRule({ id: 'test_after', name: 'After', hooks: { onSkillUsed: function () { duringAction = DD.Combat.state.result + '/' + ends; } } });
    t.ok(DD.Combat.useSkill(hero(), slotOf(hero(), 'test_fireball'), 4, 3), 'the last fireball');
    off();
    t.ok(DD.Combat.state.result === 'victory' && ends === 1 && results.join(',') === 'victory', 'victory once (combat:end ' + ends + ', onEnd ' + results.join(',') + ')');
    t.eq(duringAction, 'victory/0', 'the result is set at once, combat:end only after the whole action resolved');
    // summons outlive their downed owner: they keep fighting, but they never avoid a TPK
    quiet({ heroes: [H(1, 1, 'test_summoner'), H(1, 5, 'test_cleric')], enemies: [E(6, 6)] });
    const owner = hero(0), pup = DD.Combat.party().filter(function (u) { return u.kind === 'summon'; })[0];
    DD.Act.kill(owner, foe());
    t.ok(pup && !pup.dead && DD.Combat.controllable(pup) && DD.AI.targetsFor(foe()).indexOf(pup) >= 0, 'the hound fights on (and is still a target)');
    sb({ heroes: [H(1, 1, 'test_summoner')], enemies: [E(6, 6)] });
    DD.Act.kill(hero(0), foe());
    t.eq(DD.Combat.state.result, 'defeat', 'no hero standing = defeat, however many summons remain');
  });

  T.suite('engine: review — hook sources fire in contract order (§5.3)', function (t) {
    const order = [];
    const passive = DD.getHero('test_mage').passive.hooks;
    function rec(label) { return function () { order.push(label + ':' + (arguments[arguments.length - 1] && (arguments[arguments.length - 1].id || arguments[arguments.length - 1].name))); }; }
    passive.testOrder = rec('passive');
    DD.registerItem({ id: 'test_tmp_item', name: 'Order Ring', slot: 'trinket', rarity: 'common', desc: 'Test.', hooks: { testOrder: rec('item') } });
    DD.registerScar({ id: 'test_tmp_scar', name: 'Order Scar', desc: 'Test.', hooks: { testOrder: rec('scar') } });
    DD.registerStatus({ id: 'test_tmp_status', name: 'Ordered', type: 'buff', hooks: { testOrder: rec('status') } });
    try {
      quiet({ heroes: [H(1, 1, 'test_mage', { items: ['test_tmp_item'], scars: ['test_tmp_scar'] })], enemies: [E(6, 6)] });
      const h = hero();
      h.hooks = { testOrder: rec('instance') };
      DD.Act.addStatus(h, 'test_tmp_status', { turns: -1 });
      DD.Act.addRule({ id: 'test_tmp_rule', name: 'Order Rule', hooks: { testOrder: rec('rule') } });
      DD.Hooks.fire('testOrder', h);
      t.eq(order.join(' '), 'passive:Arcane Surplus instance:' + h.id + ' item:test_tmp_item scar:test_tmp_scar status:test_tmp_status rule:test_tmp_rule',
        'passive → instance → items → scars → statuses → rules, each with its source as the last argument');
    } finally {
      delete passive.testOrder;
      delete DD.defs.items.test_tmp_item; delete DD.defs.scars.test_tmp_scar; delete DD.defs.statuses.test_tmp_status;
    }
  });

  T.suite('engine: review — previews leak nothing (gold, run, log, events, FX, toasts)', function (t) {
    const greedy = { id: 'test_tmp_greedy', name: 'Make It Weird', owner: 'test_mage', icon: '💸', kind: 'spell', tags: [], ap: 1,
      levels: [{ dmg: 99 }], target: { type: 'unit', range: [1, 9], filter: 'enemy', los: false },
      desc: function (L) { return 'Spend 10 gold, deal ' + L.dmg + ' damage, summon, gain Hype and a potion.'; },
      execute: function (ctx) {
        DD.Act.spendGold(10); DD.Act.gainGold(3); DD.Act.gainHype(30, 'test');
        DD.Act.log('This should never be logged by a preview.', 'system');
        if (DD.UI && DD.UI.toast) DD.UI.toast('Preview toast!');
        DD.Act.damage(ctx.user, ctx.targetUnit, ctx.L.dmg);
        DD.Act.summon(ctx.user, 'test_hound', 2, 2, {});
        DD.Act.giveRandomConsumable('test_potion');
        ctx.state.data.counter = (ctx.state.data.counter || 0) + 1;
      } };
    const run = { gold: 40, consumables: [], maxConsumables: 3, act: 1 };
    quiet({ heroes: [H(1, 1)], enemies: [E(5, 5)], gold: 25, run: run });
    const s = DD.Combat.state, h = hero();
    const snap = function () {
      return JSON.stringify({ gold: run.gold, cons: run.consumables, sb: s.sandboxGold, hype: s.hype, log: s.log.length, units: s.units.length,
        stats: s.stats, data: s.data, rng: s.rng.getState(), hp: s.units.map(function (u) { return u.hp; }), order: s.order, joining: s.joining });
    };
    const before = snap();
    let events = 0, toasts = 0;
    const offs = ['combat:changed', 'combat:log', 'hype:changed', 'unit:died', 'run:gold', 'initiative:joined'].map(function (n) { return DD.Events.on(n, function () { events++; }); });
    const toast = DD.UI && DD.UI.toast;
    if (DD.UI) DD.UI.toast = function () { toasts++; };
    const fxq = DD.FX.queue.length;
    let p;
    try { p = DD.Targeting.preview(h, greedy, { x: 5, y: 5 }); } finally { if (DD.UI) DD.UI.toast = toast; offs.forEach(function (f) { f(); }); }
    t.ok(p.perUnit[foe().id] && p.perUnit[foe().id].lethal && p.spawned.length === 1 && p.hype === 38, 'the preview saw the kill, the summon and +38 Hype');
    t.eq(snap(), before, 'run gold / consumables, Hype, log, units, stats, state.data, RNG and the initiative order all untouched');
    t.ok(events === 0 && toasts === 0 && DD.FX.queue.length === fxq, 'no events (' + events + '), toasts (' + toasts + ') or FX');
  });

  T.suite('engine: review — protect objectives: enemies go for the protected object', function (t) {
    const smash = { id: 'test_tmp_kegsmash', name: 'Keg Smash', owner: 'enemy', icon: '🍺', kind: 'attack', tags: ['melee'], ap: 0, anchor: 'ground',
      levels: [{ dmg: 4 }], target: { type: 'tile', range: [1, 1], filter: 'object', los: false },
      desc: function (L) { return 'Deal ' + L.dmg + ' damage to an adjacent object.'; },
      execute: function (ctx) { DD.Act.damageObject(ctx.user, ctx.target.x, ctx.target.y, ctx.L.dmg); } };
    withTemp('skills', [smash], function () {
      sb({ heroes: [H(1, 1)], enemies: [E(7, 4)], objective: { type: 'protect', objId: 'keg' }, objects: [{ x: 5, y: 4, id: 'keg' }] });
      const g = foe();
      g.skillSlots = [DD.Act.makeSlot('test_tmp_kegsmash', 1), DD.Act.makeSlot('test_grunt_stab', 1)];
      const uses = countUses(function () { DD.AI.act(g); });
      t.eq(uses['test_grunt:test_tmp_kegsmash'], 1, 'the enemy walks up and smashes the keg on its turn');
      t.ok(DD.Grid.tile(5, 4).obj && DD.Grid.tile(5, 4).obj.hp === 2, 'the keg is at 2 (6 − 4)');
    });
  });

  T.suite('engine: review — NaN-proof numbers, live wind-up damage, rooted enemies', function (t) {
    quiet({ heroes: [H(2, 3), H(1, 1, 'test_cleric')], enemies: [E(3, 3)] });
    const h = hero(), g = foe();
    const st = DD.Act.addStatus(h, 'weak', { turns: NaN });
    t.ok(st && isFinite(st.turns) && st.turns > 0, 'NaN turns fall back to the default duration');
    DD.Act.addStatus(h, 'vulnerable', { turns: null });
    t.ok(DD.Act.getStatus(h, 'vulnerable').turns > 0, 'null turns too');
    h.hp = 5; h.healBonus = 'lots';
    DD.Act.heal(h, h, 4);
    t.eq(h.hp, 9, 'a malformed heal bonus is ignored instead of making HP NaN');
    h.healBonus = 0;
    DD.Act.kill(hero(1), g);
    DD.Act.revive(hero(1), NaN);
    t.ok(isFinite(hero(1).hp) && hero(1).hp >= 1, 'revive with a malformed fraction still gives a finite HP');
    const it = DD.AI.windUp(g, 'test_grunt_stab', h, {});
    t.eq(DD.AI.describe(g, it).dmg, 4, 'wind-up shows 4');
    DD.Act.addStatus(g, 'weak', { turns: 1 });
    t.eq(DD.AI.describe(g, it).dmg, 3, 'Weakening the enemy updates its wind-up number (−25%)');
    DD.Act.addStatus(g, 'root', { turns: 1 });
    t.eq(DD.Combat.reachable(g).size, 0, 'Combat.reachable: a rooted enemy has nowhere to go');
  });

  // =====================================================================================================
  // Phase 4 (engine requests), ported to v2: fair previews of rolls, the hooks content asked for, status flags, AI api.
  // =====================================================================================================

  T.suite('engine: phase 4 — previews never give a roll of the dice away', function (t) {
    quiet({ heroes: [H(1, 3)], enemies: [E(2, 3), E(7, 7)] });
    const s = DD.Combat.state, h = hero(), g = foe(0);
    g.hp = g.maxHp = 60;
    // a coin flip without the 'random' tag: 10 damage on heads, nothing on tails
    const coin = { id: 'test_tmp_coin', name: 'Coin Flip', target: { type: 'unit', range: [1, 1], filter: 'enemy' }, levels: [{ dmg: 10 }],
      execute: function (ctx) { if (ctx.rng.chance(0.5)) DD.Act.damage(ctx.user, ctx.targetUnit, 10); } };
    let n = 0, unc = 0, told = 0, ranged = 0, quietRng = 0;
    for (let i = 0; i < 24; i++) {
      s.rng.setState(1000 + i * 7919);
      const r0 = s.rng.getState();
      const p = DD.Targeting.preview(h, coin, { x: g.x, y: g.y });
      if (s.rng.getState() === r0) quietRng++;
      const e = p.perUnit[g.id];
      const hp = g.hp;
      DD.Combat._action(function () { DD.Combat.resolveSkill(h, coin, { x: g.x, y: g.y }); });
      const real = hp - g.hp;
      g.hp = 60;
      n++;
      if (p.uncertain && (!e || (e.uncertain && /^\?/.test(e.text)))) unc++;
      if ((e ? e.dmg : 0) === real) told++;
      if (e && e.dmgMin === 0 && e.dmgMax === 10 && e.dmg > 0 && e.dmg < 10) ranged++;
    }
    t.eq(quietRng, n, 'previews leave the real RNG where it was');
    t.eq(unc, n, 'every coin-flip preview is uncertain ("?", aggregated over other rolls)');
    t.ok(told <= 2, 'the shown number does not follow the real roll (' + told + '/' + n + ' equal; the old dry run: ' + n + '/' + n + ')');
    t.ok(ranged > 0, 'the expected hit comes with its range (0–10)');
    // no dice, no doubt: a kill (its loot roll is bookkeeping) previews exactly, with one dry run
    g.hp = 3;
    const kill = DD.Combat.preview(h, h.basic, g.x, g.y);
    t.ok(!kill.uncertain && kill.samples === 1 && kill.perUnit[g.id].lethal && !kill.perUnit[g.id].uncertain, 'a certain kill previews exactly (loot gold is not chance)');
    g.hp = 60;
    // 'random' without a roll, DD.Act.markUncertain(), ctx.uncertain: flagged, numbers exact
    const tagged = { id: 'test_tmp_tag', name: 'Tagged', tags: ['random'], target: { type: 'unit', range: [1, 1], filter: 'enemy' }, levels: [{}],
      execute: function (ctx) { DD.Act.damage(ctx.user, ctx.targetUnit, 3); } };
    const pt = DD.Targeting.preview(h, tagged, { x: g.x, y: g.y });
    t.ok(pt.uncertain && pt.perUnit[g.id].dmg === 3 && pt.perUnit[g.id].uncertain && /^\? /.test(pt.perUnit[g.id].text), "'random' tag: '?', the fixed number");
    const marked = Object.assign({}, tagged, { id: 'test_tmp_mark', tags: [], execute: function (ctx) { DD.Act.markUncertain(); DD.Act.damage(ctx.user, ctx.targetUnit, 3); } });
    t.ok(DD.Targeting.preview(h, marked, { x: g.x, y: g.y }).uncertain, 'DD.Act.markUncertain() during the dry run flags it');
    const flagged = Object.assign({}, tagged, { id: 'test_tmp_flag', tags: [], execute: function (ctx) { ctx.uncertain = true; } });
    t.ok(DD.Targeting.preview(h, flagged, { x: g.x, y: g.y }).uncertain, 'so does ctx.uncertain = true');
    t.ok(!DD.Act.simulating && DD.Act._sim === null && DD.Act._quiet === 0, 'simulation bookkeeping restored');
    t.ok(!DD.Targeting.preview(h, h.basic, g.x, g.y).uncertain, 'a plain hit stays certain');
    // a def's own preview(ctx) gets the full entry shape (block / blocked default to 0: no NaN in AutoPlay scores)
    const own = Object.assign({}, tagged, { id: 'test_tmp_own', tags: [], preview: function (ctx) { const o = {}; o[ctx.targetUnit.id] = { dmg: 2 }; return o; } });
    const po = DD.Targeting.preview(h, own, { x: g.x, y: g.y }).perUnit[g.id];
    t.ok(po && po.dmg === 2 && po.block === 0 && po.blocked === 0 && Array.isArray(po.statuses) && po.moved === null, 'preview() override: { dmg, heal, blocked: 0, block: 0, statuses: [], ... }');
  });

  T.suite('engine: phase 4 — modifyFinalDamage, preventDeath, onAnyDeath, onAllyDowned, modifyHeal', function (t) {
    quiet({ heroes: [H(1, 1), H(1, 2, 'test_cleric')], enemies: [E(2, 1), E(6, 6), E(7, 7)] });
    const s = DD.Combat.state, h = hero(0), c = hero(1), g = foe(0);
    // modifyFinalDamage: after armor, before Block; immunity can't be undone
    g.armor = 2; g.block = 3;
    let seen = 0;
    g.hooks = { modifyFinalDamage: function (d) { seen = d.amount; d.amount = 5; } };
    const hp0 = g.hp;
    t.eq(DD.Act.damage(null, g, 10, { cause: 'other' }), 2, 'final amount set to 5: 3 Block absorbs, 2 HP lost');
    t.eq(seen, 8, 'the hook saw the amount after armor (10 − 2)');
    t.eq(g.hp, hp0 - 2, 'HP');
    g.armor = 0; g.block = 0;
    g.resist = { fire: 0 };
    g.hooks = { modifyFinalDamage: function (d) { d.amount = 99; } };
    t.eq(DD.Act.damage(null, g, 10, { element: 'fire', cause: 'other' }), 0, 'an immune target still takes 0');
    g.resist = {};
    // preventDeath: nothing of a death happens
    const xp0 = s.stats.xp || 0, gold0 = s.stats.gold || 0, hype0 = s.hype;
    let died = 0, kills = 0;
    h.hooks = { onKill: function () { kills++; } };
    g.hooks = { preventDeath: function (u) { u.hp = 5; return true; }, onDeath: function () { died++; } };
    DD.Act.damage(h, g, 999);
    t.ok(!g.dead && g.hp === 5, 'preventDeath: alive, at the HP the hook gave');
    t.ok(died === 0 && kills === 0 && (s.stats.xp || 0) === xp0 && (s.stats.gold || 0) === gold0 && s.hype === hype0, 'no onDeath, no onKill, no XP / gold, no Hype');
    g.hooks = { preventDeath: function () { return true; } };
    t.eq(DD.Act.kill(g, h), false, 'Act.kill reports a refused death');
    t.eq(g.hp, 5, 'a refused instant kill keeps the HP it had');
    g.hp = 2;
    DD.Act.damage(h, g, 999);
    t.eq(g.hp, 1, 'refused damage without the hook setting HP: 1 HP');
    g.hooks = { preventDeath: function () { return false; } };
    DD.Act.damage(h, g, 999);
    t.ok(g.dead && kills === 1, 'false lets it die');
    h.hooks = { preventDeath: function (u) { u.hp = 2; return true; } };
    DD.Act.damage(null, h, 999, { cause: 'other', ignoreArmor: true });
    t.ok(!h.downed && h.hp === 2, 'a hero can refuse to go down too');
    h.hooks = null;
    // a refused YEET climbs out of the pit instead of standing in it
    setT(6, 5, 'pit');
    const g2 = DD.Grid.unitAt(6, 6);
    g2.hooks = { preventDeath: function () { return true; } };
    DD.Act.push(h, g2, { x: 0, y: -1 }, 1);
    t.ok(!g2.dead && !DD.Grid.isDrop(g2.x, g2.y), 'refused fall: out of the pit');
    g2.hooks = null;
    // onAnyDeath: every active unit's own sources once, every rule once (unit = null)
    const any = [];
    let ruleN = 0, ruleUnit = 'unset';
    c.hooks = { onAnyDeath: function (u, dead, d) { any.push([u.id, dead.id, !!d]); } };
    DD.Act.addRule({ id: 'test_any_death', name: 'Any', hooks: { onAnyDeath: function (u) { ruleN++; ruleUnit = u; } } });
    const g3 = DD.Grid.unitAt(7, 7);
    DD.Act.kill(g3, h);
    DD.Act.removeRule('test_any_death');
    t.ok(any.length === 1 && any[0][0] === c.id && any[0][1] === g3.id && any[0][2], 'onAnyDeath(unit, dead, d) on the cleric\'s own sources');
    t.ok(ruleN === 1 && ruleUnit === null, 'a rule gets it once, with unit = null (not once per unit)');
    // onAllyDowned: the downed hero's side only
    const downs = [];
    c.hooks = { onAllyDowned: function (u, who, d) { downs.push([u.id, who.id, !!d]); } };
    g2.hooks = { onAllyDowned: function () { downs.push('enemy'); } };
    DD.Act.damage(g2, h, 999, { ignoreArmor: true });
    t.ok(h.downed, 'the mage is downed');
    t.ok(downs.length === 1 && downs[0][0] === c.id && downs[0][1] === h.id && downs[0][2], 'onAllyDowned(unit, downed, d) on its allies only');
    // modifyHeal: incoming healing, on the target
    let hh = null;
    c.hooks = { modifyHeal: function (x) { hh = x; x.amount *= 2; } };
    c.hp = 5;
    t.eq(DD.Act.heal(null, c, 4), 8, 'incoming heal doubled');
    t.ok(hh && hh.unit === c && hh.base === 4 && hh.src === null, 'h = { unit, src, base, amount, cause, cancel }');
    c.hooks = { modifyHeal: function (x) { x.cancel = true; } };
    t.eq(DD.Act.heal(null, c, 4), 0, 'cancel blocks it');
    c.hooks = null;
  });

  T.suite('engine: phase 4 — modifyCost level, onCostPaid, modifyMoveCost, modifyOutgoingPush, modifyInitiative', function (t) {
    quiet({ heroes: [H(1, 1, 'test_knight'), H(1, 4)], enemies: [E(7, 7)] });
    const k = hero(0);
    let lvl = null;
    k.hooks = { modifyCost: function (c) { lvl = c.level; } };
    DD.Combat.costOf(k, DD.getSkill('test_cleave'), 2);
    t.eq(lvl, 2, 'modifyCost sees c.level');
    // onCostPaid: what was really paid; the same record is ctx.paid
    let paid = null, inCtx = null;
    k.hooks = { onCostPaid: function (p) { paid = p; }, onSkillUsed: function (ctx) { inCtx = ctx.paid; } };
    k.hp = 3; k.ap = 3;
    const blood = { id: 'test_tmp_blood', name: 'Blood Price', ap: 1, hpCost: 5, target: { type: 'self' }, levels: [{}], execute: function () {} };
    DD.Combat._action(function () { DD.Combat.resolveSkill(k, blood, { x: k.x, y: k.y }, { pay: true }); });
    t.ok(paid && paid.unit === k && paid.hp === 2 && paid.hpCost === 5 && paid.ap === 1, 'onCostPaid: 2 of the 5 HP asked (never below 1), 1 AP');
    t.eq(k.hp, 1, '1 HP left');
    t.eq(inCtx, paid, 'ctx.paid is the same record');
    // modifyMoveCost
    k.hooks = { modifyMoveCost: function (m) { m.ap += 1; } };
    k.hp = k.maxHp; k.ap = 3;
    t.eq(DD.Combat.moveApCost(k), 2, 'modifyMoveCost: a move costs 2 AP');
    t.ok(DD.Combat.move(k, 1, 2) && k.ap === 1, 'and is paid');
    t.eq(DD.Combat.reachable(k).size, 0, '1 AP left: no move');
    k.hooks = null;
    // modifyOutgoingPush (pusher) first, then modifyPush (target)
    quiet({ heroes: [H(1, 1, 'test_knight')], enemies: [E(2, 1), E(7, 7)] });
    const k2 = hero(0), g = foe(0);
    k2.hooks = { modifyOutgoingPush: function (p) { p.dist += 1; } };
    DD.Act.push(k2, g, { x: 1, y: 0 }, 1);
    t.eq(g.x, 4, 'the pusher\'s +1: 2 tiles');
    g.hooks = { modifyPush: function (p) { p.dist -= 1; } };
    DD.Act.push(k2, g, { x: 1, y: 0 }, 1);
    t.eq(g.x, 5, 'then the target\'s −1: 1 tile');
    k2.hooks = { modifyOutgoingPush: function (p) { p.cancel = true; } };
    DD.Act.push(k2, g, { x: 1, y: 0 }, 2);
    t.eq(g.x, 5, 'the pusher can cancel');
    // v2: modifyGuard is gone (unused AP is lost); modifyInitiative(r) is the new roll hook
    let fired = 0, rr = null;
    DD.registerItem({ id: 'test_tmp_alert', name: 'Alert Feat', slot: 'trinket', rarity: 'common', desc: '+5 initiative.',
      hooks: { modifyGuard: function () { fired++; }, modifyInitiative: function (r) { rr = { roll: r.roll, init: r.init, k: r.k, unit: r.unit }; r.total += 5; } } });
    try {
      quiet({ initiative: 'roll', seed: 'alert', heroes: [H(1, 1, 'test_knight', { items: ['test_tmp_alert'] })], enemies: [E(7, 7)] });
      const e = entryOf(hero());
      t.ok(rr && rr.unit === hero() && rr.init === -1 && rr.k === 0 && e.total === rr.roll + rr.init + 5, 'modifyInitiative(r): r = { unit, roll, init, total, k }; +5 on the total');
      hero().ap = 2;
      DD.Combat.endTurn();
      t.eq(fired, 0, 'modifyGuard never fires');
    } finally { delete DD.defs.items.test_tmp_alert; }
  });

  T.suite('engine: phase 4 — status flags: noMove (holds), stunLike, takenMult', function (t) {
    withDefs('statuses', [
      { id: 'test_tmp_hold', name: 'Held', type: 'debuff', noMove: true, defaultTurns: 1 },
      { id: 'test_tmp_daze', name: 'Dazed Silly', type: 'debuff', stunLike: true, defaultTurns: 1 },
      { id: 'test_tmp_soft', name: 'Softened', type: 'debuff', takenMult: 1.5, defaultTurns: -1 },
    ], function () {
      quiet({ heroes: [H(1, 1, 'test_knight'), H(1, 3)], enemies: [E(4, 1), E(7, 7)] });
      const k = hero(0), m = hero(1), g = foe(0);
      DD.Act.addStatus(k, 'test_tmp_hold', { turns: 1 });
      t.ok(DD.Act.cantMove(k) && DD.Combat.cantMove(k) && DD.Combat.reachable(k).size === 0, 'noMove: a held hero has nowhere to go');
      t.eq(DD.Combat.move(k, 1, 2), false, '... and cannot move');
      DD.Act.removeStatus(k, 'test_tmp_hold', { silent: true });
      DD.Act.addStatus(g, 'test_tmp_hold', { turns: 1 });
      t.eq(DD.Combat.reachable(g).size, 0, 'a held enemy neither');
      DD.AI.act(g);
      t.ok(g.x === 4 && g.y === 1, 'the AI leaves a held enemy where it is');
      DD.Act.removeStatus(g, 'test_tmp_hold', { silent: true });
      // stun-like: loses its turn, wind-ups interrupted at once, stunImmune covers it
      DD.AI.windUp(g, 'test_grunt_stab', k, {});
      DD.Act.addStatus(g, 'test_tmp_daze', { turns: 1 });
      t.ok(DD.Combat.isStunned(g) && g.intents.length === 0 && DD.AI.reachOf(g).tiles.size === 0, 'stunLike: counts as stunned, interrupts its wind-up, no reach');
      DD.Act.addStatus(m, 'test_tmp_daze', { turns: 1 });
      t.eq(DD.Combat.turnAp(m), 0, 'a stun-like hero gets no AP');
      DD.Act.removeStatus(g, 'test_tmp_daze', { silent: true });
      g.flags.stunImmune = true;
      t.eq(DD.Act.addStatus(g, 'test_tmp_daze', { turns: 1 }), null, 'stunImmune: immune to custom stun-likes too');
      // takenMult: applied to damage, read by the estimate
      DD.Act.addStatus(g, 'test_tmp_soft', {});
      g.hp = g.maxHp = 40;
      const hp0 = g.hp;
      DD.Act.damage(null, g, 10, { cause: 'other' });
      t.eq(hp0 - g.hp, 15, 'takenMult 1.5: 10 → 15');
      t.eq(DD.AI.estimate(k, g, 10, null), 15, 'DD.AI.estimate sees it');
    });
  });

  T.suite('engine: phase 4 — AI: rule telegraphFlat, styleOf for planners, defaultPlan(u, style); v2 removals', function (t) {
    quiet({ heroes: [H(1, 1)], enemies: [E(2, 1), E(5, 5)] });
    const h = hero(), g = foe(0);
    const it = DD.AI.windUp(g, 'test_grunt_stab', h, {});
    t.eq(DD.AI.describe(g, it).dmg, 4, 'base wind-up number 4');
    DD.Act.addRule({ id: 'test_tflat', name: 'Plus Two', hooks: {}, telegraphFlat: function (u, intent, rule) { return rule.id === 'test_tflat' && intent === it ? 2 : 0; } });
    t.eq(DD.AI.describe(g, it).dmg, 6, 'a rule\'s telegraphFlat(unit, intent, rule) is added to the number');
    DD.Act.removeRule('test_tflat');
    withTemp('enemies', [
      { id: 'test_tmp_bruiser', name: 'Leaping Bruiser', act: 1, tier: 'normal', hp: 20, sprite: SPR, skills: ['test_grunt_stab', 'test_arrow'], ai: function (u, api) { api.defaultPlan(u); } },
      { id: 'test_tmp_styled', name: 'Styled', act: 1, tier: 'normal', hp: 20, sprite: SPR, skills: ['test_grunt_stab'], ai: function () {}, aiStyle: { style: 'ranged', keepDistance: 2 } },
      { id: 'test_tmp_mixed', name: 'Mixed', act: 1, tier: 'normal', hp: 20, sprite: SPR, skills: ['test_grunt_stab', 'test_arrow'] },
    ], function () {
      quiet({ heroes: [H(1, 1)], enemies: [E(6, 6, 'test_tmp_bruiser'), E(7, 7, 'test_tmp_styled'), E(7, 5, 'test_tmp_mixed')] });
      t.eq(DD.AI.styleOf(byDef('test_tmp_bruiser')).style, 'melee', 'a function planner goes by its shortest damage skill (stab 1, arrow 6): melee');
      t.eq(JSON.stringify(DD.AI.styleOf(byDef('test_tmp_styled'))), '{"style":"ranged","keepDistance":2}', 'def.aiStyle sets it explicitly');
      t.eq(DD.AI.styleOf(byDef('test_tmp_mixed')).style, 'ranged', 'the default planner still goes by its longest one');
    });
    // defaultPlan(u, style) / approach(u, style) act now: a hurt grunt played as a coward runs instead of stabbing
    quiet({ heroes: [H(1, 1)], enemies: [E(2, 1), E(7, 7)] });
    let gg = foe(0);
    gg.hp = 3;
    let hp = hero().hp;
    DD.AI.api(gg).defaultPlan(gg, 'coward');
    t.ok(hero().hp === hp && dist(gg, hero()) > 1, 'api.defaultPlan(u, \'coward\'): it flees, no attack');
    quiet({ heroes: [H(1, 1)], enemies: [E(2, 1), E(7, 7)] });
    gg = foe(0);
    gg.hp = 3;
    hp = hero().hp;
    DD.AI.defaultPlan(gg);
    t.eq(hero().hp, hp - 4, 'its own (melee) style stabs at once');
    quiet({ heroes: [H(1, 1)], enemies: [E(2, 1), E(7, 7)] });
    gg = foe(0);
    gg.hp = 3;
    t.ok(DD.AI.approach(gg, 'coward') && dist(gg, hero()) > 1, 'AI.approach(u, style) moves by that style');
    // v2: no planning phase and no intent manipulation of normal enemies
    ['planAll', 'plan', 'executeAll', 'recharm', 'turnOn', 'retarget', 'cancelSpellIntents'].forEach(function (k) { t.ok(DD.AI[k] === undefined, 'DD.AI.' + k + ' is gone'); });
    t.ok(DD.Act.retarget === undefined, 'DD.Act.retarget is gone');
    ['act', 'useNow', 'windUp', 'resolveWindups', 'windups', 'reachOf', 'threatMap', 'redirectIntent', 'cancelIntents'].forEach(function (k) { t.ok(typeof DD.AI[k] === 'function', 'DD.AI.' + k); });
  });

  T.suite('engine: phase 4 — per-unit hazards, no-op tile callbacks keep Undo, stopMove, FX durations, tracked-shot text', function (t) {
    withDefs('surfaces', [
      { id: 'test_tmp_cloud', name: 'Picky Cloud', color: 'rgba(0,255,0,0.3)', turns: 3, hazardDmg: 3, hazard: function (u) { return !!u && u.side === 'enemy'; } },
      { id: 'test_tmp_noop', name: 'Nothing Burger', color: 'rgba(255,255,255,0.3)', turns: 3, onEnter: function () {} },
      { id: 'test_tmp_trip', name: 'Tripwire', color: 'rgba(255,0,0,0.3)', turns: 3, onEnter: function (u) { DD.Act.stopMove(u); } },
    ], function () {
      quiet({ heroes: [H(1, 1, 'test_knight')], enemies: [E(6, 6)] });
      const k = hero(), g = foe();
      DD.Act.setSurface(3, 3, 'test_tmp_cloud', 3);
      t.eq(DD.Grid.hazardAt(3, 3, g), 'test_tmp_cloud', 'hazard(unit, tile): a hazard for its foes');
      t.eq(DD.Grid.hazardAt(3, 3, k), null, '... not for the heroes');
      const hz = DD.Grid.hazardDamage(3, 3, g);
      t.ok(hz && hz.enter === 3 && !DD.Grid.hazardDamage(3, 3, k), 'hazardDamage too');
      // Undo: a callback that changed nothing keeps it; a pressed plate does not
      DD.Act.setSurface(1, 2, 'test_tmp_noop', 3);
      k.ap = 3;
      t.ok(DD.Combat.move(k, 1, 3) && DD.Combat.canUndo(), 'walking over a no-op surface can be undone');
      t.ok(DD.Combat.undo() && k.x === 1 && k.y === 1, 'undone');
      DD.Act.placeObject(2, 1, 'pressure_plate');
      t.ok(DD.Combat.move(k, 3, 1) && !DD.Combat.canUndo(), 'pressing a plate is a side effect: no Undo');
      // stopMove: the walk ends on that tile, no status
      DD.Act.setSurface(4, 1, 'test_tmp_trip', 3);
      k.ap = 3;
      t.ok(DD.Combat.move(k, 5, 1) && k.x === 4 && k.y === 1, 'DD.Act.stopMove stops the walk on the tripwire');
      t.eq(k.statuses.length, 0, '... without a status');
      t.ok(DD.Combat.move(k, 5, 1) && k.x === 5, 'the next walk is not stopped');
    });
    // FX.push repairs broken durations
    const e1 = DD.FX.push({ type: 'wait', ms: NaN }), e2 = DD.FX.push({ type: 'tile', ms: Infinity });
    const e3 = DD.FX.push({ type: 'wait', ms: '120' }), e4 = DD.FX.push({ type: 'wait', ms: -5 }), e5 = DD.FX.push({ type: 'wait', ms: 'soon' });
    t.ok(e1.ms === 300 && e2.ms === 0 && e3.ms === 120 && e4.ms === 300 && e5.ms === 300, 'FX.push: NaN / Infinity / negative / words → the type default, numeric strings kept');
    t.ok(DD.FX.push({ type: 'turn' }).ms === 0 && DD.FX.push({ type: 'initiative' }).ms === 0 && DD.FX.push({ type: 'windup' }).ms === 0, 'the v2 markers default to 0 ms');
    // a tracking wind-up that needs no line of sight only fizzles out of range
    withTemp('skills', [{ id: 'test_tmp_hex', name: 'Long Hex', owner: 'enemy', anchor: 'unit', levels: [{ dmg: 3 }],
      target: { type: 'unit', range: [1, 8], filter: 'enemy', los: false }, execute: function () {} }], function () {
      quiet({ heroes: [H(1, 1)], enemies: [E(6, 6, 'test_archer')] });
      const a = foe();
      const txt = DD.AI.describe(a, DD.AI.makeIntent(a, 'test_tmp_hex', hero(), { anchor: 'unit' })).text;
      t.ok(/fizzles if out of range\./.test(txt) && !/or sight/.test(txt), 'los: false → "fizzles if out of range." (' + txt.slice(-60) + ')');
      t.ok(/range or sight\./.test(DD.AI.describe(a, DD.AI.makeIntent(a, 'test_arrow', hero(), { anchor: 'unit' })).text), 'line-of-sight shots keep "range or sight"');
    });
    // objective text: an object def's pluralName
    withDefs('objects', [{ id: 'test_tmp_dish', name: 'Chafing Dish', pluralName: 'Chafing Dishes', hp: 6 }], function () {
      sb({ heroes: [H(1, 1)], enemies: [E(6, 6)], objective: { type: 'destroy', objId: 'test_tmp_dish', count: 2 },
        objects: [{ x: 3, y: 3, id: 'test_tmp_dish' }, { x: 4, y: 4, id: 'test_tmp_dish' }] });
      t.ok(/^Destroy 2 Chafing Dishes \(0\/2\)/.test(DD.Combat.state.objective.text), 'destroy objective: "' + DD.Combat.state.objective.text + '"');
    });
  });

  // =====================================================================================================
  // v2 review (adversarial rules review of the v2 core): regressions for what it found
  // =====================================================================================================
  T.suite('engine: v2 review — a wind-up never lands before the heroes had a turn', function (t) {
    const A = DD.Act, AI = DD.AI;
    // two boss turns back to back (turnsPerRound 2): a wind-up from the first must not land on the second
    withTemp('enemies', [{ id: 'test_tmp_twice_wind', name: 'Double Booker', act: 1, tier: 'boss', hp: 80, sprite: SPR, skills: ['test_boss_meteor'], turnsPerRound: 2,
      ai: function (u, api) { if (api.entry && api.entry.k === 0 && !u.intents.length) api.windUp(u, 'test_boss_meteor', api.heroes()[0], { noCooldown: true }); } }], function () {
      quiet({ w: 9, h: 9, noPlan: false, heroes: [H(2, 3)], enemies: [E(7, 7, 'test_tmp_twice_wind')] });
      const s = DD.Combat.state, m = hero(), b = foe();
      m.maxHp = m.hp = 99;
      t.eq(s.order.map(function (e) { return DD.Combat.byId(e.unitId).defId + ':' + e.k; }).join(' '), 'test_mage:0 test_tmp_twice_wind:0 test_tmp_twice_wind:1',
        'premise: the boss\'s two turns are back to back');
      const hp = m.hp, h0 = s.heroTurns;
      DD.Combat.endTurn();
      t.ok(b.intents.length === 1 && b.intents[0].turnsLeft === 1, 'wound up on its first turn, still pending after its second (no hero turn in between)');
      t.ok(m.hp === hp && cur() === m && s.round === 2 && s.heroTurns === h0 + 1, 'round 2: the mage gets his window (state.heroTurns counts hero turns)');
      DD.Combat.endTurn();
      t.eq(m.hp, hp - 14, 'it lands at the boss\'s first turn after the mage\'s');
    });
    // a wind-up announced in the owner's own onTurnStart hook does not land in that same turn start
    quiet({ w: 9, h: 9, heroes: [H(2, 3)], enemies: [E(7, 7, 'test_boss')], enemyAi: false });
    const m2 = hero(), b2 = foe();
    m2.maxHp = m2.hp = 99;
    let made = null;
    A.addRule({ id: 'test_tmp_ts_wind', name: 'Wind at dawn', hooks: { onTurnStart: function (u) { if (u === b2 && !made) made = AI.windUp(b2, 'test_boss_meteor', m2, { noCooldown: true }); } } });
    let hp2 = m2.hp;
    DD.Combat.endTurn();
    t.ok(made && b2.intents.indexOf(made) >= 0 && m2.hp === hp2, 'announced at its own turn start: not landed at once');
    DD.Combat.endTurn();
    t.eq(m2.hp, hp2 - 14, '... it lands at its next turn start, after the mage\'s turn');
    A.removeRule('test_tmp_ts_wind');
    // a wind-up announced at a round start when the boss acts first waits for the heroes too
    quiet({ w: 9, h: 9, heroes: [H(2, 3)], enemies: [E(7, 7, 'test_boss')], enemyAi: false, initiative: 'enemiesFirst' });
    const m3 = hero(), b3 = foe();
    m3.maxHp = m3.hp = 99;
    A.addRule({ id: 'test_tmp_rs_wind', name: 'Wind at round start', hooks: { onRoundStart: function (u, r) { if (u === b3 && r === 2) AI.windUp(b3, 'test_boss_meteor', m3, { noCooldown: true }); } } });
    const hp3 = m3.hp;
    DD.Combat.endTurn();
    t.ok(cur() === m3 && b3.intents.length === 1 && m3.hp === hp3, 'round 2 start, the boss first: it waits for the mage');
    DD.Combat.endTurn();
    t.eq(m3.hp, hp3 - 14, '... and lands at the boss\'s next turn');
    A.removeRule('test_tmp_rs_wind');
    // at combat start without deployment (onCombatStart), the boss first: it waits for the mage too
    let opening = null;
    quiet({ w: 9, h: 9, heroes: [H(2, 3)], enemies: [E(7, 7, 'test_boss')], enemyAi: false, initiative: 'enemiesFirst',
      rules: [{ id: 'test_tmp_cs_wind', name: 'Opening move', hooks: { onCombatStart: function (u) {
        if (u.defId === 'test_boss' && !opening) opening = AI.windUp(u, 'test_boss_meteor', { x: 2, y: 3 }, { noCooldown: true });
      } } }] });
    t.ok(opening && foe().intents.indexOf(opening) >= 0 && hero().hp === hero().maxHp && cur() === hero(), 'combat-start wind-up, the boss first: still pending at the mage\'s first turn');
    const hp5 = hero().hp;
    DD.Combat.endTurn();
    t.eq(hero().hp, hp5 - 14, '... it lands at the boss\'s round-2 turn');
    // deployment is a window: the marked tiles can be deployed out of, so it lands at the boss's first turn
    quiet({ w: 9, h: 9, heroes: [H(2, 3)], enemies: [E(7, 7, 'test_boss')], enemyAi: false, initiative: 'enemiesFirst',
      deploy: true, deployTiles: [{ x: 2, y: 3 }, { x: 2, y: 6 }] });
    t.ok(DD.Combat.isDeploying(), 'premise: deployment');
    AI.windUp(foe(), 'test_boss_meteor', { x: 2, y: 3 }, { noCooldown: true });
    const hp6 = hero().hp;
    DD.Combat.rollInitiative();
    t.ok(hero().hp === hp6 - 14 && !foe().intents.length, 'announced in deployment: lands at the boss\'s first turn (deploy out of the red)');
    // unchanged: announced on a hero's turn, it lands at the boss's next turn start; turns: 2 = two of its turns
    quiet({ w: 9, h: 9, heroes: [H(2, 3)], enemies: [E(7, 7, 'test_boss')], enemyAi: false });
    const m4 = hero(), b4 = foe();
    m4.maxHp = m4.hp = 99;
    AI.windUp(b4, 'test_boss_meteor', m4, { noCooldown: true });
    let hp4 = m4.hp;
    DD.Combat.endTurn();
    t.eq(m4.hp, hp4 - 14, 'announced during the mage\'s turn: lands at the boss\'s next turn start');
    DD.Grid.allTiles().forEach(function (tl) { tl.surface = null; });   // the first meteor's flames
    m4.statuses = [];
    const two = AI.windUp(b4, 'test_boss_meteor', m4, { noCooldown: true, turns: 2 });
    hp4 = m4.hp;
    DD.Combat.endTurn();
    t.ok(b4.intents.indexOf(two) >= 0 && two.turnsLeft === 1 && m4.hp === hp4, 'turns: 2 — one of its turns later it is still coming');
    DD.Combat.endTurn();
    t.eq(m4.hp, hp4 - 14, '... and lands at the next');
  });

  T.suite('engine: v2 review — summons have AP only on their owner\'s turn', function (t) {
    quiet({ heroes: [H(1, 1, 'test_knight'), H(1, 4, 'test_summoner')], enemies: [E(7, 7)], enemyAi: false });
    const k = hero(0), sm = hero(1);
    t.eq(cur(), k, 'the knight\'s turn');
    // a summon made "ready" outside its owner's turn (a combat-start pet, another hero's turn) has no AP to show yet
    const pup = DD.Act.summon(sm, 'test_hound', 3, 4, { noFx: true, ready: true });
    t.ok(pup && pup.ap === 0 && !DD.Combat.controllable(pup), 'ready, but not its owner\'s turn: 0 AP');
    DD.Combat.endTurn();
    t.ok(cur() === sm && pup.ap === pup.maxAp && DD.Combat.controllable(pup), 'its owner\'s turn: full AP');
    // made ready during its owner's turn: it can act at once
    const late = DD.Act.summon(sm, 'test_hound', 3, 5, { noFx: true, ready: true });
    t.ok(late && late.ap === late.maxAp && DD.Combat.controllable(late), 'ready during its owner\'s turn: acts at once');
    DD.Combat.endTurn();
    t.ok(pup.ap === 0 && late.ap === 0, 'the turn ended: no AP left on the summons');
    // the passive pet summoned at combat start (before initiative) shows no AP before its owner's first turn
    quiet({ heroes: [H(1, 1, 'test_knight'), H(1, 4, 'test_summoner')], enemies: [E(7, 7)], enemyAi: false, summons: [{ id: 'test_hound', x: 3, y: 1, owner: 'test_summoner' }] });
    const pets = DD.Combat.party().filter(function (u) { return u.kind === 'summon'; });
    t.ok(pets.length >= 1 && pets.every(function (p) { return p.ap === 0; }), 'combat-start summons: 0 AP during the knight\'s turn');
  });

  T.suite('engine: v2 review — a dead unit\'s wind-ups are cancelled (windup:cancel, reason death)', function (t) {
    quiet({ w: 9, h: 9, heroes: [H(2, 3)], enemies: [E(7, 7, 'test_boss')], enemyAi: false });
    const b = foe();
    const seen = [];
    const off = DD.Events.on('windup:cancel', function (e) { seen.push(e.unitId + ':' + e.reason); });
    DD.AI.windUp(b, 'test_boss_meteor', hero(), { noCooldown: true });
    DD.Act.kill(b, hero());
    off();
    t.ok(b.dead && b.intents.length === 0, 'its wind-up is gone');
    t.eq(seen.join(' '), b.id + ':death', 'windup:cancel { reason: death } (like any interrupt)');
    const seen2 = [];
    const off2 = DD.Events.on('windup:cancel', function (e) { seen2.push(e.reason); });
    quiet({ heroes: [H(1, 1)], enemies: [E(6, 6)] });
    DD.Act.kill(foe(), hero());
    off2();
    t.eq(seen2.length, 0, 'no event for a unit that had no wind-up');
  });

  T.suite('engine: v2 review — whole fights are deterministic by seed (rolled initiative, AutoPlay)', function (t) {
    if (!DD.AutoPlay || !DD.Encounter) { t.skip('AutoPlay / Encounter missing'); return; }
    function fight(seed, encId) {
      const def = DD.getEncounter(encId);
      const setup = DD.Encounter.build(def, ['test_knight', 'test_mage', 'test_cleric', 'test_rogue'], { rng: DD.RNG(seed), act: def.act, kind: def.kind });
      DD.Combat.start(setup, { seed: seed, headless: true, kind: def.kind });
      const r = DD.AutoPlay.runBattle(30);
      const s = DD.Combat.state;
      return [r.result, s.round, s.turn, s.order.map(function (e) { const u = DD.Combat.byId(e.unitId); return (u ? u.defId : '?') + e.total; }).join(','),
        s.units.map(function (u) { return u.defId + ':' + u.hp + '@' + u.x + ',' + u.y + (u.dead ? 'X' : '') + (u.downed ? 'D' : ''); }).join(' ')].join(' | ');
    }
    ['test_a1_normal', 'test_a1_elite', 'test_a3_survive'].forEach(function (id) {
      const a = fight(4242, id);
      t.eq(fight(4242, id), a, id + ': same seed, same initiative, same fight');
    });
  });

  T.suite('engine: v2 review — turn-engine invariants under random statuses, spawns and deaths (fuzz)', function (t) {
    const HEROES = ['test_knight', 'test_mage', 'test_cleric', 'test_rogue', 'test_summoner'];
    const FOES = ['test_grunt', 'test_archer', 'test_mortar', 'test_healer', 'test_coward', 'test_summoner_foe', 'test_minion', 'test_bomber', 'test_web_spinner', 'test_brute'];
    const STS = ['stun', 'sleep', 'frozen', 'sheep', 'root', 'taunt', 'charmed', 'silenced', 'dazzled', 'confused', 'haste', 'slow', 'weak', 'inspired', 'stealth', 'burn', 'poison', 'regen'];
    const problems = [];
    let turns = 0;
    const N = t.n || 25;
    for (let f = 0; f < N; f++) {
      const rng = DD.RNG('fuzz:' + f);
      const used = {};
      const spot = function (x0, x1) { for (let g = 0; g < 50; g++) { const x = rng.int(x0, x1), y = rng.int(0, 9); if (!used[x + ',' + y]) { used[x + ',' + y] = 1; return { x: x, y: y }; } } return { x: x0, y: 0 }; };
      const ids = rng.shuffle(HEROES.slice()).slice(0, rng.int(1, 4));
      const heroes = ids.map(function (id) { const p = spot(0, 2); return { id: id, x: p.x, y: p.y, level: rng.int(1, 5) }; });
      const enemies = [];
      for (let i = 0, n = rng.int(1, 5); i < n; i++) { const p = spot(7, 9); enemies.push({ id: FOES[rng.int(0, FOES.length - 1)], x: p.x, y: p.y }); }
      const chaos = { id: 'test_tmp_chaos', name: 'Chaos', hooks: { onTurnStart: function () {
        const s = DD.Combat.state;
        const all = s.units.filter(function (x) { return !x.dead && !x.downed; });
        if (all.length && s.rng.chance(0.25)) DD.Act.addStatus(all[s.rng.int(0, all.length - 1)], STS[s.rng.int(0, STS.length - 1)], { turns: s.rng.int(1, 2), stacks: s.rng.int(1, 3) }, all[s.rng.int(0, all.length - 1)]);
        if (s.rng.chance(0.05) && s.units.filter(function (x) { return !x.dead; }).length < 16) { const p = DD.Grid.randomEmptyTile(s.rng); if (p) DD.Act.spawn('test_minion', p.x, p.y, {}); }
      } } };
      DD.Combat.sandbox({ w: 10, h: 10, seed: 'fz' + f, initiative: rng.chance(0.7) ? 'roll' : 'heroesFirst', heroes: heroes, enemies: enemies, rules: [chaos] });
      const s = DD.Combat.state;
      const seen = {};
      let lastRound = s.round;   // round 1's first turn already started inside sandbox()
      const offs = [
        DD.Events.on('turn:start', function (e) {
          turns++;
          const k = e.round + ':' + e.unitId + ':' + e.entry.k;
          if (seen[k]) problems.push('fight ' + f + ': ' + e.unit.defId + ' took two turns as entry ' + k);
          seen[k] = 1;
          if (e.unit.dead) problems.push('fight ' + f + ': dead ' + e.unit.defId + ' started a turn');
          if (e.round === lastRound) return;
          // the first turn of a round (joiners and orphans merged): every living unit has a turn of its own or acts on
          // its owner's
          lastRound = e.round;
          if ((s.joining || []).length) problems.push('fight ' + f + ': joiners left unmerged in round ' + e.round);
          s.units.forEach(function (u) {
            if (!u.dead && !s.order.some(function (x) { return x.unitId === u.id; }) && !DD.Combat.turnOwner(u)) problems.push('fight ' + f + ': ' + u.defId + ' has no turn in round ' + e.round);
          });
        }),
        DD.Events.on('turn:player', function () {
          const c = cur();
          if (!c || !DD.Combat.isPlayerControlled(c)) problems.push('fight ' + f + ': turn:player without a player-controlled current unit');
          s.units.forEach(function (u) {
            if (!u.dead && !u.downed && DD.Combat.isPlayerControlled(u) && !DD.Combat.isTurnOf(u) && (u.ap || 0) !== 0) problems.push('fight ' + f + ': ' + u.defId + ' has ' + u.ap + ' AP outside its turn');
          });
        }),
        DD.Events.on('round:start', function () {
          s.units.forEach(function (u) {
            if (!u.dead) u.statuses.forEach(function (st) { if (!isFinite(st.turns) || st.turns === 0 || st.turns < -1) problems.push('fight ' + f + ': ' + st.id + ' turns ' + st.turns); });
          });
        }),
      ];
      try { DD.AutoPlay.runBattle(25); } catch (e) { problems.push('fight ' + f + ': threw ' + (e && e.message)); }
      offs.forEach(function (o) { o(); });
      if (!s.result) problems.push('fight ' + f + ': no result after 25 rounds');
    }
    t.log(N + ' fights, ' + turns + ' turns');
    problems.slice(0, 20).forEach(function (p) { t.fail(p); });
    t.ok(!problems.length && turns > N * 5, N + ' random fights: every unit one turn per entry per round, AP only on its own turn, sane durations, every fight ends (' + problems.length + ' problems)');
  });

  // =====================================================================================================
  // v2: attacks of opportunity + reach-aware AI targeting (docs/notes/rules.md "Attacks of opportunity", "Targeting")
  // =====================================================================================================
  /** Run fn while recording 'opportunity:attack' events: [{ a: attacker defId, m: mover defId, skill, at }]. */
  function opportunities(fn) {
    const seen = [];
    const off = DD.Events.on('opportunity:attack', function (e) { seen.push({ a: e.attacker.defId, m: e.mover.defId, skill: e.skillId, at: e.from }); });
    try { fn(); } finally { off(); }
    return seen;
  }

  T.suite('engine: v2 attacks of opportunity — a move away from a melee foe provokes one free basic attack', function (t) {
    quiet({ w: 9, h: 9, heroes: [H(2, 4)], enemies: [E(3, 4)], enemyAi: false });
    const h = hero(), g = foe(), s = DD.Combat.state;
    const e = DD.Combat.reachable(h).get('0,4');
    t.ok(e && e.provokes.length === 1 && e.provokes[0] === g.id, 'Combat.reachable marks the move away: provokes [the grunt]');
    t.eq(DD.Combat.reachable(h).get('2,3').provokes.length, 1, 'any step off a tile next to it leaves its reach (4-way adjacency)');
    const pv = DD.Combat.provokes(h, 0, 4);
    t.ok(pv.length === 1 && pv[0].unitId === g.id && pv[0].skillId === 'test_grunt_stab' && pv[0].dmg === 4, 'Combat.provokes: who, with which skill, for how much (' + JSON.stringify(pv) + ')');
    const hp = h.hp, ap = h.ap, n0 = s.log.length, m0 = s.mutations;
    let ok = false;
    const seen = opportunities(function () { ok = DD.Combat.move(h, 0, 4); });
    t.ok(ok, 'the move happens');
    t.ok(seen.length === 1 && seen[0].a === 'test_grunt' && seen[0].m === 'test_mage' && seen[0].skill === 'test_grunt_stab', 'opportunity:attack (' + JSON.stringify(seen) + ')');
    t.ok(seen[0] && seen[0].at.x === 2 && seen[0].at.y === 4, 'it strikes as the mover leaves the tile next to it');
    t.eq(h.hp, hp - 4, 'the grunt stabs it (4, normal damage rules)');
    t.ok(h.x === 0 && h.y === 4, 'and the walk goes on to the destination');
    t.eq(h.ap, ap - 1, 'one move action: 1 AP, nothing else');
    t.ok(logSince(n0, /attack of opportunity on Wizzy McTest \(Stab\)/), 'logged');
    t.ok(s.mutations > m0 && !DD.Combat.canUndo(), 'a move that provoked can\'t be undone');
    t.eq(g.oppRound, s.round, 'the grunt\'s reaction is used for this round');
    t.ok((g.skillSlots[0].cd || 0) === 0 && (g.skillSlots[0].uses || 0) === 0, 'free: no cooldown, no use counted');
    t.ok(DD.Combat.move(h, 2, 4) && h.hp === hp - 4, 'walking back next to it never provokes (entering its reach)');
    t.eq(DD.Combat.reachable(h).get('2,1').provokes.length, 0, 'its reaction is spent: the next move away is free this round');
    t.ok(DD.Combat.move(h, 2, 1) && h.hp === hp - 4, 'at most one attack of opportunity per attacker per round');
    DD.Combat.endTurn();
    t.ok(s.round === 2 && cur() === h, 'round 2, the mage again');
    DD.Act.teleport(h, 2, 4);
    t.eq(DD.Combat.reachable(h).get('0,4').provokes.length, 1, 'a new round: the grunt may strike again');
    DD.Combat.move(h, 0, 4);
    t.eq(h.hp, hp - 8, 'and does');
    // walking past a foe provokes too (into its reach and out again)
    quiet({ w: 9, h: 9, heroes: [H(1, 3)], enemies: [E(3, 4)], enemyAi: false });
    const p = DD.Combat.reachable(hero()).get('5,3');
    t.ok(p && p.provokes.length === 1 && p.path.some(function (q) { return q.x === 3 && q.y === 3; }), 'the only path within its move passes the grunt: provokes 1');
    const hp2 = hero().hp;
    DD.Combat.move(hero(), 5, 3);
    t.ok(hero().hp === hp2 - 4 && hero().x === 5, 'walking past it costs a stab');
    // undo still works for a clean move
    quiet({ w: 9, h: 9, heroes: [H(1, 1)], enemies: [E(7, 7)], enemyAi: false });
    t.ok(DD.Combat.move(hero(), 3, 1) && DD.Combat.canUndo(), 'a move that provoked nothing can still be undone');
  });

  T.suite('engine: v2 attacks of opportunity — paths provoke as few attacks as possible (reachable, path, previews)', function (t) {
    // mage on (2,2), grunt on (3,3): (3,2) is next to the grunt; the long way round (2,1)-(3,1)-(4,1) is not
    quiet({ w: 9, h: 9, heroes: [H(2, 2)], enemies: [E(3, 3)], enemyAi: false });
    const h = hero(), g = foe();
    const e = DD.Combat.reachable(h).get('4,2');
    t.ok(e && e.provokes.length === 0 && e.cost === 4 && e.path.length === 4, 'within its move the path goes the long way round: provokes nothing (' + JSON.stringify(e && e.path) + ')');
    const plain = DD.Grid.reachable(h, 4).get('4,2');
    t.ok(plain && plain.path.length === 2 && plain.provokes === undefined, 'Grid.reachable without aoo: the cheapest path, no provokes field (unchanged)');
    t.eq(DD.Grid.provokes(h, plain.path).join(','), g.id, 'Grid.provokes: that short cut would provoke the grunt');
    const gp = DD.Grid.path(h, 4, 2, { maxCost: 4, aoo: true });
    t.ok(gp && gp.length === 4 && DD.Grid.provokes(h, gp).length === 0, 'Grid.path with aoo: the same safe path');
    t.ok(DD.Grid.path(h, 4, 2, { maxCost: 2, aoo: true }).length === 2, 'no safe path within the budget: the provoking one');
    const e2 = DD.Combat.reachable(h).get('4,3');
    t.ok(e2 && e2.provokes.length === 1, 'some tiles can only be reached by provoking (4,3: the cheap way passes next to it)');
    t.eq(DD.AI.provokes(h, 4, 3).join(','), g.id, 'AI.provokes(unit, x, y)');
    t.eq(DD.AI.provokes(h, 8, 8), null, 'AI.provokes: null when out of reach');
    t.eq(DD.Combat.provokes(h, 4, 2).length, 0, 'Combat.provokes: [] for the safe path');
    // a dry run of a move sees the attack; the real state does not change
    const hp = h.hp;
    const sim = DD.Targeting.simulate(function () {
      const su = DD.Combat.byId(h.id);
      DD.Combat.move(su, 4, 3);
      return { hp: su.hp, at: su.x + ',' + su.y, used: DD.Combat.byId(g.id).oppRound };
    });
    t.ok(sim && sim.hp === hp - 4 && sim.at === '4,3', 'simulate(move): the attack of opportunity happens in the dry run (' + JSON.stringify(sim) + ')');
    t.ok(h.hp === hp && h.x === 2 && (g.oppRound || 0) === 0, 'the real state is untouched');
    // speed: AoO-aware reachable on a busy 12x12 board
    quiet({ w: 12, h: 12, heroes: [H(5, 5), H(4, 6, 'test_knight'), H(6, 6, 'test_rogue')], enemies: [E(5, 6), E(6, 5), E(4, 5), E(5, 4, 'test_brute'), E(9, 9, 'test_archer')], enemyAi: false });
    const t0 = performance.now();
    let n = 0;
    for (let i = 0; i < 20; i++) n += DD.Grid.reachable(hero(0), 6, { aoo: true }).size;
    t.log('20 AoO-aware reachable calls (mov 6, 4 adjacent foes): ' + (performance.now() - t0).toFixed(1) + 'ms');
    t.ok(n >= 0, 'AoO-aware reachable runs on a crowded board');
  });

  T.suite('engine: v2 attacks of opportunity — what never provokes', function (t) {
    const A = DD.Act;
    function setup(foeId, extra) {
      quiet(Object.assign({ w: 9, h: 9, heroes: [H(2, 4)], enemies: [E(3, 4, foeId)], enemyAi: false }, extra || {}));
      return { h: hero(), g: foe() };
    }
    function lost(u, fn) { const hp = u.hp; const seen = opportunities(fn); return { dmg: hp - u.hp, n: seen.length }; }
    function walkAway(u) { return lost(u, function () { DD.Combat.move(u, 0, 4); }); }
    let s = setup('test_archer');
    t.eq(walkAway(s.h).n, 0, 'an archer (range 2-6, no melee attack) makes none');
    s = setup('test_healer');
    t.eq(walkAway(s.h).n, 0, 'a medic (Mend, Poke range 1-3) makes none: melee = max range 1');
    ['stun', 'sleep', 'frozen', 'sheep', 'dazzled', 'confused'].forEach(function (id) {
      s = setup();
      A.addStatus(s.g, id, { turns: 1 });
      t.eq(walkAway(s.h).n, 0, id + ': no attack of opportunity');
    });
    s = setup();
    A.addStatus(s.h, 'stealth', { turns: 1 });
    t.eq(walkAway(s.h).n, 0, 'a stealthed mover slips away');
    s = setup();
    s.h.flags.noProvoke = true;
    t.eq(walkAway(s.h).n, 0, 'flags.noProvoke: its moves never provoke');
    s = setup();
    s.g.flags.noOpportunity = true;
    t.eq(walkAway(s.h).n, 0, 'flags.noOpportunity: it never strikes');
    s = setup(null, { heroes: [H(2, 4), H(7, 7, 'test_cleric')] });
    A.addStatus(s.g, 'taunt', { turns: 1 }, hero(1));
    t.eq(walkAway(s.h).n, 0, 'a foe taunted by someone else only strikes its taunter');
    s = setup(null, { heroes: [H(2, 4), H(2, 5, 'test_knight')], enemies: [E(7, 7)] });
    t.eq(walkAway(s.h).n, 0, 'allies never strike (the knight next to it)');
    // displacement and skills are not move actions
    s = setup();
    t.eq(lost(s.h, function () { A.teleport(s.h, 0, 4); }).n, 0, 'teleport');
    s = setup();
    t.eq(lost(s.h, function () { A.push(null, s.h, { x: -1, y: 0 }, 2); }).n, 0, 'push');
    s = setup();
    t.eq(lost(s.h, function () { A.pull(null, s.h, { x: 0, y: 4 }, 2); }).n, 0, 'pull');
    s = setup(null, { enemies: [E(3, 4), E(7, 7, 'test_minion')] });
    t.eq(lost(s.h, function () { A.swap(s.h, foe(1), { force: true }); }).n, 0, 'swap');
    s = setup();
    t.eq(lost(s.h, function () { A.moveAlong(s.h, [{ x: 1, y: 4 }, { x: 0, y: 4 }]); }).n, 0, 'a scripted walk without provoke (skill dashes, leaps) never provokes');
    setup(null, { heroes: [H(2, 4, 'test_knight', { skills: ['test_charge'] })], enemies: [E(3, 4), E(2, 1, 'test_minion')] });
    const k = hero();
    k.block = 0;
    const r = lost(k, function () { DD.Combat.useSkill(k, slotOf(k, 'test_charge'), 2, 1); });
    t.ok(r.n === 0 && k.y === 2, 'a charge skill dashes away from the grunt for free (' + k.x + ',' + k.y + ')');
    setup(null, { heroes: [H(2, 4, 'test_mage', { skills: ['test_blink'] })] });
    const bl = lost(hero(), function () { DD.Combat.useSkill(hero(), slotOf(hero(), 'test_blink'), 0, 4); });
    t.ok(bl.n === 0 && hero().x === 0, 'Blink teleports out for free');
    // a downed hero does not strike; deployment moves never provoke
    quiet({ w: 9, h: 9, heroes: [H(2, 4, 'test_knight'), H(8, 8, 'test_cleric')], enemies: [E(3, 4)], enemyAi: false });
    const kn = hero(0), gr = foe();
    kn.block = 0; kn.hp = 1;
    A.damage(null, kn, 5, { cause: 'other' });
    t.ok(kn.downed, 'knight downed');
    t.eq(lost(gr, function () { DD.AI.moveTo(gr, 6, 4); }).n, 0, 'a downed knight makes no attack of opportunity');
    quiet({ w: 9, h: 9, heroes: [H(2, 4)], enemies: [E(3, 3)], deploy: true, deployTiles: [{ x: 2, y: 4 }, { x: 2, y: 3 }, { x: 1, y: 3 }], enemyAi: false });
    t.ok(DD.Combat.isDeploying(), 'deployment');
    const dm = lost(hero(), function () { DD.Combat.deployMove(hero(), 2, 3); DD.Combat.deployMove(hero(), 1, 3); });
    t.ok(dm.n === 0 && hero().x === 1, 'deployment moves never provoke');
  });

  T.suite('engine: v2 attacks of opportunity — interrupts, heroes and summons strike too, several attackers', function (t) {
    const A = DD.Act, AI = DD.AI;
    // the boss's Assertion Slam pushes 1: the walk ends where it lands
    quiet({ w: 9, h: 9, heroes: [H(4, 4)], enemies: [E(5, 4, 'test_boss')], enemyAi: false });
    let h = hero();
    const hp = h.hp, ap = h.ap;
    t.ok(DD.Act.opportunitySlot(foe()) && DD.Act.opportunitySlot(foe()).id === 'test_boss_slam', 'an enemy strikes with its first ready melee skill (the slam)');
    t.ok(!DD.Act.opportunitySlot(h), 'a hero with a ranged basic attack has none');
    t.eq(DD.Combat.reachable(h).get('4,1').provokes.length, 1, 'the boss is in the way of every move');
    t.ok(DD.Combat.move(h, 4, 1), 'Combat.move: true, the move action happened');
    t.ok(h.hp === hp - 10 && h.x === 3 && h.y === 4, 'slammed (10) and pushed 1: the walk ends there (' + h.x + ',' + h.y + ')');
    t.eq(h.ap, ap - 1, 'the move action is spent');
    // a lethal attack of opportunity: downed on the tile it tried to leave
    quiet({ w: 9, h: 9, heroes: [H(2, 4), H(8, 8, 'test_cleric')], enemies: [E(3, 4)], enemyAi: false });
    h = hero(0);
    h.hp = 3;
    DD.Combat.move(h, 0, 4);
    t.ok(h.downed && h.x === 2 && h.y === 4, 'downed by the stab, it stays where it was');
    // a stunning attack of opportunity ends the walk too
    withTemp('skills', [{ id: 'test_tmp_bonk', name: 'Bonk', owner: 'enemy', ap: 0, kind: 'attack', tags: ['melee'], levels: [{ dmg: 1 }],
      target: { type: 'unit', range: [1, 1], filter: 'enemy' }, desc: function () { return 'Deal 1 damage and Stun.'; },
      execute: function (ctx) { if (ctx.targetUnit) { A.damage(ctx.user, ctx.targetUnit, 1); A.addStatus(ctx.targetUnit, 'stun', { turns: 1 }, ctx.user); } } }], function () {
      withTemp('enemies', [{ id: 'test_tmp_bonker', name: 'Bonker', act: 1, tier: 'normal', hp: 20, sprite: SPR, skills: ['test_tmp_bonk'], ai: 'default' }], function () {
        quiet({ w: 9, h: 9, heroes: [H(2, 4)], enemies: [E(3, 4, 'test_tmp_bonker')], enemyAi: false });
        DD.Combat.move(hero(), 0, 4);
        t.ok(has(hero(), 'stun') && hero().x === 2, 'stunned by the attack of opportunity: the walk stops at once');
        t.eq(DD.Combat.reachable(hero()).size, 0, 'and it cannot move on');
      });
    });
    // heroes strike enemies that walk away from them (on the enemy's move action), for free
    quiet({ w: 9, h: 9, heroes: [H(3, 4, 'test_knight')], enemies: [E(4, 4)], enemyAi: false });
    const k = hero(), g = foe();
    const kap = k.ap, uses = k.basic.uses || 0;
    const seen = opportunities(function () { AI.moveTo(g, 7, 4); });
    t.ok(seen.length === 1 && seen[0].a === 'test_knight' && seen[0].skill === 'test_slash', 'the knight strikes with his basic attack');
    t.ok(g.hp === g.maxHp - 5 && g.x === 7, 'the grunt takes 5 and walks on');
    t.ok(k.ap === kap && (k.basic.uses || 0) === uses && !k.basic.usedThisTurn, 'free: no AP, no use');
    // hero summons strike too; several attackers each strike once, in unit order
    quiet({ w: 9, h: 9, heroes: [H(3, 4, 'test_knight'), H(4, 3, 'test_rogue')], summons: [{ id: 'test_hound', x: 5, y: 4, owner: 0 }], enemies: [E(4, 4)], enemyAi: false });
    const g2 = foe();
    const many = opportunities(function () { AI.moveTo(g2, 4, 7); });
    t.eq(many.map(function (x) { return x.a; }).join(' '), 'test_knight test_rogue test_hound', 'knight, rogue and hound all strike as it leaves (' + JSON.stringify(many) + ')');
    t.ok(g2.dead || g2.hp === g2.maxHp - 5 - 4 - 3 - 1, 'slash 5 + stab 4 + bite 3, then the stab\'s Bleed ticks on the move (1): ' + g2.hp);
  });

  T.suite('engine: v2 attacks of opportunity — hooks and riders (modifyOpportunity, onOpportunityAttack, d.opportunity)', function (t) {
    const A = DD.Act;
    function setup() { quiet({ w: 9, h: 9, heroes: [H(2, 4)], enemies: [E(3, 4)], enemyAi: false }); return { h: hero(), g: foe() }; }
    let s = setup();
    s.h.hooks = { modifyOpportunity: function (o) { o.cancel = true; } };
    t.eq(DD.Combat.reachable(s.h).get('0,4').provokes.length, 0, 'the mover\'s modifyOpportunity cancel: "can\'t be opportunity-attacked" (paths know it)');
    let hp = s.h.hp;
    DD.Combat.move(s.h, 0, 4);
    t.eq(s.h.hp, hp, 'and no attack happens');
    s = setup();
    s.g.hooks = { modifyOpportunity: function (o) { if (o.attacker === s.g) o.flat += 3; } };
    t.eq(DD.Combat.provokes(s.h, 0, 4)[0].dmg, 7, 'the attacker\'s flat bonus shows in Combat.provokes');
    hp = s.h.hp;
    DD.Combat.move(s.h, 0, 4);
    t.eq(s.h.hp, hp - 7, '"+3 damage on attacks of opportunity" (o.flat)');
    s = setup();
    const calls = [];
    let flagged = 0, other = 0;
    s.g.hooks = {
      onOpportunityAttack: function (o) { calls.push('attacker:' + o.attacker.defId + '>' + o.mover.defId + ':' + o.dealt); },
      modifyOutgoingDamage: function (d) { if (d.opportunity) flagged++; else other++; },
    };
    s.h.hooks = { onOpportunityAttack: function (o) { calls.push('mover:' + o.skill.id); } };
    DD.Combat.move(s.h, 0, 4);
    t.eq(calls.join(' '), 'attacker:test_grunt>test_mage:4 mover:test_grunt_stab', 'onOpportunityAttack on both sides, o.dealt');
    t.ok(flagged === 1 && other === 0, 'the hit carries d.opportunity');
    A.teleport(s.h, 2, 4);
    DD.AI.useNow(s.g, 'test_grunt_stab', s.h, {});
    t.ok(other === 1 && flagged === 1, 'an ordinary stab does not');
    s = setup();
    A.addStatus(s.g, 'empowered');
    hp = s.h.hp;
    DD.Combat.move(s.h, 0, 4);
    t.ok(s.h.hp === hp - 4 && has(s.g, 'empowered'), 'Empowered is neither used nor consumed by an attack of opportunity');
    s = setup();
    A.addStatus(s.g, 'weak', { turns: 1 });
    t.eq(DD.Combat.provokes(s.h, 0, 4)[0].dmg, 3, 'Weak shows in the estimate (4 → 3)');
    hp = s.h.hp;
    DD.Combat.move(s.h, 0, 4);
    t.eq(s.h.hp, hp - 3, 'and in the hit (normal damage rules)');
    // ctx.opportunity reaches the skill and onSkillUsed; the mover's tile only (an area basic hits nobody else)
    quiet({ w: 9, h: 9, heroes: [H(2, 4), H(3, 3, 'test_cleric')], enemies: [E(3, 4, 'test_brute')], enemyAi: false });
    const ctx = captureSkill(foe(), function () { DD.Combat.move(hero(0), 0, 4); });
    t.ok(ctx && ctx.opportunity && ctx.skill.id === 'test_smash' && ctx.tiles.length === 1, 'ctx.opportunity, one tile (the brute\'s row smash)');
    t.eq(hero(1).hp, hero(1).maxHp, 'the cleric beside the mover is not hit by it');
  });

  T.suite('engine: v2 targeting — engaged brutes stick, the AoO holds the line, divers dive, ranged stay pinned', function (t) {
    const AI = DD.AI;
    // grunt (4,4) engaged with the knight (3,4); the mage (4,2) on 3 HP is one step away — a kill
    function layout(knightAt) {
      quiet({ w: 9, h: 9, heroes: [H(4, 2), H(knightAt.x, knightAt.y, 'test_knight')], enemies: [E(4, 4)], enemyAi: false });
      const m = hero(0), k = hero(1), g = foe();
      m.hp = 3; k.block = 0;
      return { m: m, k: k, g: g };
    }
    let L = layout({ x: 3, y: 4 });
    AI.act(L.g);
    t.ok(L.m.hp === 3 && L.k.hp === L.k.maxHp - 3 && L.g.x === 4 && L.g.y === 4, 'engaged: it stabs the knight next to it (3) instead of walking off to finish the mage');
    L = layout({ x: 6, y: 4 });
    AI.act(L.g);
    t.ok(L.m.downed, 'not engaged (the knight 2 tiles off): it goes for the kill on the mage');
    L = layout({ x: 3, y: 4 });
    L.k.oppRound = DD.Combat.state.round;
    AI.act(L.g);
    t.ok(L.m.downed && L.g.hp === L.g.maxHp, 'engaged, but the knight\'s reaction is spent: nothing holds it — the attack of opportunity is what holds the line');
    L = layout({ x: 3, y: 4 });
    L.g.hp = 4;
    AI.act(L.g);
    t.ok(L.m.hp === 3 && L.g.x === 4, 'it never walks into a lethal attack of opportunity');
    // engaged with a mage (no attack of opportunity to fear): it still sticks to the hero next to it
    quiet({ w: 9, h: 9, heroes: [H(3, 4), H(6, 4, 'test_cleric')], enemies: [E(4, 4)], enemyAi: false });
    hero(1).hp = 12;
    const mhp = hero(0).hp;
    AI.act(foe());
    t.ok(hero(0).hp === mhp - 4 && hero(1).hp === 12 && foe().x === 4, 'it stabs the mage next to it rather than walking to the wounded cleric');
    // the reach-aware list for planners
    L = layout({ x: 3, y: 4 });
    const list = AI.reachableTargets(L.g);
    const byId = {};
    list.forEach(function (x) { byId[x.unit.id] = x; });
    t.ok(list.length === 2 && list[0].unit === L.k && list[0].engaged && list[0].provokes.length === 0 && list[0].cost === 0, 'AI.reachableTargets: the engaged knight first (no walk, no provoke)');
    t.ok(byId[L.m.id] && byId[L.m.id].provokes.length === 1 && byId[L.m.id].provokes[0] === L.k.id && byId[L.m.id].est === 4, 'the mage: reachable by provoking the knight, 4 damage');
    t.ok(AI.engaged(L.g).length === 1 && AI.engaged(L.g)[0] === L.k, 'AI.engaged: the knight would strike if it walked away');
    t.ok(AI.aooCost(L.g, byId[L.m.id]) === 9.5 && AI.opportunityDmg(L.k, L.g) === 5, 'AI.aooCost / AI.opportunityDmg (5 × 1.5 + 2)');
    // divers: assassins go for the weak and shrug off the hit
    withTemp('enemies', [{ id: 'test_tmp_shank', name: 'Shank', act: 1, tier: 'normal', hp: 14, mov: 3, sprite: SPR, skills: ['test_grunt_stab'], ai: 'assassin' },
      { id: 'test_tmp_skirm', name: 'Skirm', act: 1, tier: 'normal', hp: 14, mov: 3, sprite: SPR, skills: ['test_grunt_stab'], ai: { style: 'skirmisher' } }], function () {
      ['test_tmp_shank', 'test_tmp_skirm'].forEach(function (id) {
        quiet({ w: 9, h: 9, heroes: [H(4, 2), H(3, 4, 'test_knight')], enemies: [E(4, 4, id)], enemyAi: false });
        const m = hero(0), k = hero(1), a = foe();
        m.hp = 3; k.block = 0;
        t.ok(AI.isDiver(a), id + ': a diver style (' + AI.styleOf(a).style + ')');
        AI.act(a);
        t.ok(m.downed && a.hp === a.maxHp - 5 && k.hp === k.maxHp, id + ': disengages through the knight\'s slash (5) and downs the mage');
      });
      quiet({ w: 9, h: 9, heroes: [H(4, 2), H(3, 4, 'test_knight')], enemies: [E(4, 4, 'test_tmp_shank')], enemyAi: false });
      hero(0).hp = 3; hero(1).block = 0; foe().hp = 5;
      AI.act(foe());
      t.ok(hero(0).hp === 3 && !foe().dead, 'even an assassin does not walk into a lethal attack of opportunity');
      quiet({ w: 9, h: 9, heroes: [H(4, 2), H(3, 4, 'test_knight')], enemies: [E(4, 4, 'test_tmp_shank')], enemyAi: false });
      const kk = hero(1);
      hero(0).hp = 3; kk.block = 0;
      kk.hooks = { modifyOpportunity: function (o) { if (o.attacker === kk) o.flat += 10; } };
      AI.act(foe());
      t.ok(hero(0).hp === 3 && foe().hp === foe().maxHp, 'the AI reads modifyOpportunity bonuses: a +10 reaction (15 ≥ its 14 HP) keeps even the assassin put');
    });
    // ranged: an archer next to the knight cannot shoot him (min range 2) and stepping away would cost a slash: it stays
    quiet({ w: 9, h: 9, heroes: [H(1, 1), H(4, 4, 'test_knight')], enemies: [E(5, 4, 'test_archer')], enemyAi: false });
    let ar = foe();
    const kn = hero(1);
    kn.block = 0;
    const seen = opportunities(function () { AI.act(ar); });
    t.ok(ar.x === 5 && ar.y === 4 && seen.length === 0 && kn.hp === kn.maxHp, 'pinned by the knight: it does not step away to shoot');
    quiet({ w: 9, h: 9, heroes: [H(4, 4)], enemies: [E(5, 4, 'test_archer')], enemyAi: false });
    ar = foe();
    const mh = hero().hp;
    AI.act(ar);
    t.ok(DD.Grid.dist(ar, hero()) >= 3 && hero().hp === mh - 4, 'next to a mage (no melee attack) it steps back and shoots');
    // ranged picks a target it reaches without walking into the party
    quiet({ w: 10, h: 9, heroes: [H(1, 4, 'test_cleric'), H(5, 4, 'test_knight')], enemies: [E(8, 4, 'test_archer')], enemyAi: false });
    hero(0).hp = 9; hero(1).block = 0;
    ar = foe();
    AI.act(ar);
    t.ok(hero(1).hp === hero(1).maxHp - 3 && hero(0).hp === 9 && ar.x >= 7, 'in range now: it shoots the knight from where it stands rather than walking up to the wounded cleric');
  });

  T.suite('engine: v2 targeting — taunt still forces (through attacks of opportunity), planners get reachableTargets', function (t) {
    const A = DD.Act, AI = DD.AI;
    // the grunt is engaged with the rogue; the knight 2 tiles away taunts it: it walks to the knight, eating the rogue's stab
    quiet({ w: 9, h: 9, heroes: [H(3, 4, 'test_rogue'), H(6, 4, 'test_knight')], enemies: [E(4, 4)], enemyAi: false });
    const r = hero(0), k = hero(1), g = foe();
    k.block = 0;
    A.addStatus(g, 'taunt', { turns: 1 }, k);
    const seen = opportunities(function () { AI.act(g); });
    t.ok(seen.length === 1 && seen[0].a === 'test_rogue', 'it walks off anyway: the rogue gets the stab');
    t.ok(k.hp === k.maxHp - 3 && r.hp === r.maxHp, 'and it stabs the taunting knight (3), not the rogue');
    // a taunted unit next to someone else does not strike them as they walk away (only its taunter)
    quiet({ w: 9, h: 9, heroes: [H(3, 4), H(8, 8, 'test_knight')], enemies: [E(4, 4)], enemyAi: false });
    A.addStatus(foe(), 'taunt', { turns: 1 }, hero(1));
    const hp = hero(0).hp;
    DD.Combat.move(hero(0), 1, 4);
    t.eq(hero(0).hp, hp, 'taunted by the knight: no attack of opportunity on the mage');
    // custom planners: api.reachableTargets / api.engaged / api.provokes
    let got = null;
    withTemp('enemies', [{ id: 'test_tmp_picky', name: 'Picky', act: 1, tier: 'normal', hp: 14, mov: 3, sprite: SPR, skills: ['test_grunt_stab'],
      ai: function (u, api) {
        const list = api.reachableTargets(u);
        const r43 = api.reachable(u).get('4,3');
        got = { first: list[0] && list[0].unit.defId, n: list.length, engaged: api.engaged(u).map(function (x) { return x.defId; }).join(','),
          pv: (api.provokes(u, 4, 3) || []).length, reach: r43 ? r43.provokes.length : -1 };
        if (list[0]) { api.moveTo(u, list[0].moveTo.x, list[0].moveTo.y); api.act(u, list[0].skillId, list[0].unit, {}); }
      } }], function () {
      quiet({ w: 9, h: 9, heroes: [H(4, 2), H(3, 4, 'test_knight')], enemies: [E(4, 4, 'test_tmp_picky')], enemyAi: false });
      hero(0).hp = 3; hero(1).block = 0;
      AI.act(foe());
      t.ok(got && got.first === 'test_knight' && got.n === 2 && got.engaged === 'test_knight' && got.pv === 1 && got.reach === 1, 'api.reachableTargets / engaged / provokes / reachable (' + JSON.stringify(got) + ')');
      t.ok(hero(1).hp === hero(1).maxHp - 3 && hero(0).hp === 3, 'the planner hits the engaged knight');
    });
  });

  T.suite('engine: v2 attacks of opportunity — invariants in random fights (fuzz)', function (t) {
    const HEROES = ['test_knight', 'test_mage', 'test_cleric', 'test_rogue', 'test_summoner'];
    const FOES = ['test_grunt', 'test_archer', 'test_healer', 'test_coward', 'test_minion', 'test_bomber', 'test_web_spinner', 'test_brute'];
    const problems = [];
    let n = 0, heroSide = 0;
    const N = t.n || 20;
    for (let f = 0; f < N; f++) {
      const rng = DD.RNG('aoo-fuzz:' + f);
      const used = {};
      const spot = function (x0, x1) { for (let g = 0; g < 50; g++) { const x = rng.int(x0, x1), y = rng.int(0, 7); if (!used[x + ',' + y]) { used[x + ',' + y] = 1; return { x: x, y: y }; } } return { x: x0, y: 0 }; };
      const heroes = rng.shuffle(HEROES.slice()).slice(0, rng.int(2, 4)).map(function (id) { const p = spot(1, 3); return { id: id, x: p.x, y: p.y, level: rng.int(1, 4) }; });
      const enemies = [];
      for (let i = 0, k = rng.int(2, 5); i < k; i++) { const p = spot(4, 7); enemies.push({ id: FOES[rng.int(0, FOES.length - 1)], x: p.x, y: p.y }); }
      DD.Combat.sandbox({ w: 9, h: 8, seed: 'aoo-fz' + f, initiative: rng.chance(0.5) ? 'roll' : 'heroesFirst', heroes: heroes, enemies: enemies });
      const s = DD.Combat.state;
      const per = {};
      let cur = null;
      const offs = [DD.Events.on('opportunity:attack', function (e) {
        n++;
        cur = e;
        if (e.attacker.side === 'hero') heroSide++;
        const k = s.round + ':' + e.attackerId;
        if (per[k]) problems.push('fight ' + f + ': ' + e.attacker.defId + ' struck twice in round ' + s.round);
        per[k] = 1;
        if (DD.Grid.dist(e.attacker, e.from) !== 1 || e.mover.x !== e.from.x || e.mover.y !== e.from.y) problems.push('fight ' + f + ': ' + e.attacker.defId + ' struck a mover that was not next to it');
        if (!DD.Grid.hostile(e.attacker, e.mover)) problems.push('fight ' + f + ': ' + e.attacker.defId + ' struck a friend');
        if (DD.Act.isStunned(e.attacker) || DD.Act.hasStatus(e.attacker, 'sheep') || e.attacker.downed) problems.push('fight ' + f + ': an incapacitated ' + e.attacker.defId + ' struck');
        if (!DD.Act.opportunitySlot(e.attacker)) problems.push('fight ' + f + ': ' + e.attacker.defId + ' has no melee skill');
      }), DD.Events.on('turn:end', function () {
        // (review) nobody ends a turn inside someone else (a walker downed on a friend's tile is moved off it)
        const at = {};
        s.units.forEach(function (u) {
          if (u.dead) return;
          const k = u.x + ',' + u.y;
          if (at[k]) problems.push('fight ' + f + ' round ' + s.round + ': ' + u.defId + ' shares ' + k + ' with ' + at[k]);
          at[k] = u.defId;
        });
      })];
      // (review) the strike lands on the mover, never on the friend it is passing
      DD.Act.addRule({ id: 'test_aoo_fuzz', name: 'AoO fuzz', hooks: { modifyIncomingDamage: function (d) {
        if (d.opportunity && d.cause === 'skill' && cur && d.target !== cur.mover) problems.push('fight ' + f + ': ' + d.source.defId + '\'s attack of opportunity hit ' + d.target.defId + ', not the mover ' + cur.mover.defId);
      } } });
      try { DD.AutoPlay.runBattle(20); } catch (e) { problems.push('fight ' + f + ': threw ' + (e && e.message)); }
      offs.forEach(function (o) { o(); });
      if (!s.result && s.round <= 20) problems.push('fight ' + f + ': unfinished');
    }
    t.log(N + ' fights, ' + n + ' attacks of opportunity (' + heroSide + ' by the heroes\' side)');
    problems.slice(0, 15).forEach(function (p) { t.fail(p); });
    t.ok(!problems.length, N + ' random fights: at most one per attacker per round, always next to it, never on a friend, never while incapacitated, it hits the mover, no shared tiles (' + problems.length + ' problems)');
  });

  // v2 AoO review (ADVERSARIAL REVIEWER): regressions for what the review broke (docs/notes/rules.md "AoO review")
  T.suite('engine: v2 attacks of opportunity — review: walkers passing friends, charm, what counts as melee, recounted paths', function (t) {
    const A = DD.Act, AI = DD.AI;
    // 1. a walker passing through a friend: the strike is aimed at the walker (the friend shares the tile for a step).
    // The knight is first in the unit list; the mage's only path within its move crosses his tile, next to the grunt.
    quiet({ w: 9, h: 9, heroes: [H(3, 4, 'test_knight'), H(2, 4)], enemies: [E(3, 5)], enemyAi: false });
    let k = hero(0), m = hero(1);
    k.block = 0;
    DD.Combat.giveTurnTo(m);
    const e = DD.Combat.reachable(m).get('5,4');
    t.ok(e && e.path[0].x === 3 && e.path[0].y === 4 && e.provokes.length === 1, 'the path crosses the knight\'s tile and provokes the grunt there');
    let kh = k.hp, mh = m.hp;
    const seen = opportunities(function () { DD.Combat.move(m, 5, 4); });
    t.ok(seen.length === 1 && seen[0].m === 'test_mage', 'one attack of opportunity on the mage');
    t.ok(k.hp === kh && m.hp === mh - 4, 'the stab hits the mage (the mover), not the knight it was passing (knight ' + kh + '→' + k.hp + ', mage ' + mh + '→' + m.hp + ')');
    // the same for an AI walker: the grunt walking through its friend's tile next to the knight takes the slash
    quiet({ w: 9, h: 9, heroes: [H(4, 5, 'test_knight')], enemies: [E(4, 4), E(3, 4)], enemyAi: false });
    const g1 = foe(0), g2 = foe(1);
    t.ok(AI.moveTo(g2, 6, 4) && g2.x === 6, 'the second grunt walks through the first one\'s tile');
    t.ok(g1.hp === g1.maxHp && g2.hp === g2.maxHp - 5, 'the knight\'s slash hits the walker, not the grunt it passed (' + g1.hp + ', ' + g2.hp + ')');
    // a walker downed on a friend's tile is moved off it (no two units on one tile)
    quiet({ w: 9, h: 9, heroes: [H(2, 4), H(3, 4, 'test_knight'), H(8, 8, 'test_cleric')], enemies: [E(3, 5)], enemyAi: false });
    m = hero(0); k = hero(1);
    m.hp = 2;
    DD.Combat.move(m, 5, 4);
    t.ok(m.downed, 'the mage is downed by the stab on the knight\'s tile');
    t.ok(!(m.x === k.x && m.y === k.y) && DD.Grid.dist(m, k) === 1 && DD.Grid.isWalkable(m.x, m.y, m), 'its body is moved to the nearest free tile, off the knight (' + m.x + ',' + m.y + ')');
    t.ok(DD.Grid.unitAt(3, 4) === k, 'the knight\'s tile is his alone again');
    // 2. charm: an enemy charmed to fight for the heroes walks off a hero without being stabbed in the back
    quiet({ w: 9, h: 9, heroes: [H(3, 4, 'test_knight')], enemies: [E(4, 4), E(7, 4)], enemyAi: false });
    k = hero();
    const c = foe(0), victim = foe(1);
    A.addStatus(c, 'charmed', { turns: 1 }, k);
    t.ok(!A.opportunityOf(k, c, null) && DD.AI.provokes(c, 6, 4).length === 0, 'no attack of opportunity on the charmed grunt (paths know it)');
    const seenC = opportunities(function () { AI.act(c); });
    t.ok(seenC.length === 0 && c.hp === c.maxHp, 'its turn: it walks off the knight unharmed (' + JSON.stringify(seenC) + ')');
    t.ok(victim.hp === victim.maxHp - 4, 'and stabs its old friend for the heroes');
    // ...while it still punishes its old friends walking away from it, for the heroes
    quiet({ w: 9, h: 9, heroes: [H(1, 1, 'test_knight')], enemies: [E(4, 4), E(5, 4)], enemyAi: false });
    A.addStatus(foe(0), 'charmed', { turns: 1 }, hero());
    const seenF = opportunities(function () { AI.moveTo(foe(1), 8, 4); });
    t.ok(seenF.length === 1 && foe(1).hp === foe(1).maxHp - 4, 'the charmed grunt stabs the grunt walking away from it');
    // 3. what counts as a melee attack: never a 'ranged' one, an area one only if tagged 'melee' ('dir' skills always
    // read as range 1: a slingshot down a line or a breath cone would otherwise be a free reaction)
    withTemp('skills', [
      { id: 'test_tmp_sling_line', name: 'Line Sling', owner: 'enemy', ap: 0, kind: 'attack', tags: ['ranged', 'line'], levels: [{ dmg: 5 }],
        target: { type: 'dir' }, area: { shape: 'line', size: 6 }, desc: function (L) { return 'Deal ' + L.dmg + ' damage down a line.'; },
        execute: function (ctx) { ctx.foes.forEach(function (f) { A.damage(ctx.user, f, ctx.L.dmg); }); } },
      { id: 'test_tmp_breath', name: 'Breath', owner: 'enemy', ap: 0, kind: 'attack', tags: ['fire', 'aoe'], levels: [{ dmg: 16 }],
        target: { type: 'dir' }, area: { shape: 'cone', size: 3 }, desc: function (L) { return 'Deal ' + L.dmg + ' fire damage in a cone.'; },
        execute: function (ctx) { ctx.foes.forEach(function (f) { A.damage(ctx.user, f, ctx.L.dmg, { element: 'fire' }); }); } },
      { id: 'test_tmp_bite', name: 'Bite', owner: 'enemy', ap: 0, kind: 'attack', tags: ['melee'], levels: [{ dmg: 3 }],
        target: { type: 'unit', range: [1, 1], filter: 'enemy' }, desc: function (L) { return 'Deal ' + L.dmg + ' damage.'; },
        execute: function (ctx) { if (ctx.targetUnit) A.damage(ctx.user, ctx.targetUnit, ctx.L.dmg); } },
    ], function () {
      withTemp('enemies', [{ id: 'test_tmp_slinger', name: 'Slinger', act: 1, tier: 'normal', hp: 12, sprite: SPR, skills: ['test_tmp_sling_line'], ai: 'default' },
        { id: 'test_tmp_dragon', name: 'Wyrmling', act: 1, tier: 'normal', hp: 30, sprite: SPR, skills: ['test_tmp_breath', 'test_tmp_bite'], ai: 'default' }], function () {
        quiet({ w: 9, h: 9, heroes: [H(2, 4)], enemies: [E(3, 4, 'test_tmp_slinger'), E(2, 5, 'test_tmp_dragon')], enemyAi: false });
        t.eq(A.opportunitySlot(foe(0)), null, 'a ranged-tagged line shot is no melee attack');
        t.eq((A.opportunitySlot(foe(1)) || {}).id, 'test_tmp_bite', 'a breath cone is not either: the wyrmling strikes with its bite');
        const hp = hero().hp;
        DD.Combat.move(hero(), 0, 4);
        t.eq(hero().hp, hp - 3, 'walking off both: one bite (3), no breath (16), no sling');
      });
    });
    quiet({ w: 9, h: 9, heroes: [H(2, 4)], enemies: [E(3, 4, 'test_brute')], enemyAi: false });
    t.eq(A.opportunitySlot(foe()).id, 'test_smash', 'a melee-tagged row smash still counts');
    // 4. paths: an attacker passed twice strikes once (once per round), so walking round it is no worse than going wide —
    // the wide way through fire is not taken to dodge a second attack that cannot happen
    quiet({ w: 9, h: 9, heroes: [H(3, 2, 'test_rogue')], enemies: [E(3, 3)], enemyAi: false, surfaces: [{ x: 1, y: 3, id: 'fire', turns: 5 }] });
    const r = hero();
    t.ok(!!DD.Grid.hazardAt(1, 3, r), 'fire on the wide way');
    const pe = DD.Combat.reachable(r).get('2,4');
    t.ok(pe && !pe.hazard && pe.path.length === 3 && pe.provokes.length === 1, 'the tight way round the grunt (provokes 1, no fire): ' + JSON.stringify(pe && pe.path));
    const gp = DD.Grid.path(r, 2, 4, { maxCost: DD.Combat.effectiveMov(r), aoo: true });
    t.ok(gp && gp.length === 3 && !gp.some(function (p) { return p.x === 1 && p.y === 3; }), 'Grid.path agrees');
    const hp4 = r.hp;
    DD.Combat.move(r, 2, 4);
    t.ok(r.x === 2 && r.y === 4 && r.hp === hp4 - 4 && !has(r, 'burn'), 'one stab, no burn');
    // ...and a tie between a stab on the short way and a hazard tile on the long way goes to the less harmful walk:
    // the rogue (mov 6) heading for (5,1) passes the grunt at (3,2), or detours over the lava at (3,0)
    function lavaWay(bonus) {
      quiet({ w: 9, h: 9, heroes: [H(1, 1, 'test_rogue')], enemies: [E(3, 2)], enemyAi: false, terrain: function (tl) { if (tl.x === 3 && tl.y === 0) tl.t = 'lava'; } });
      hero().mov = 6;
      if (bonus) foe().hooks = { modifyOpportunity: function (o) { o.flat += bonus; } };
      return DD.Combat.reachable(hero()).get('5,1');
    }
    let lw = lavaWay(0);
    t.ok(lw && !lw.hazard && lw.provokes.length === 1, 'a 4-damage stab beats 8 lava: no lava walk just to dodge a stab (' + JSON.stringify(lw && lw.path) + ')');
    lw = lavaWay(10);
    t.ok(lw && lw.hazard === 'lava' && lw.provokes.length === 0, 'a 14-damage reaction is worse than the lava: then the detour');
    // 5. a fight rule's hooks count once per attack (they are among both units' sources)
    quiet({ w: 9, h: 9, heroes: [H(2, 4)], enemies: [E(3, 4)], enemyAi: false });
    let calls = 0;
    A.addRule({ id: 'test_aoo_house_rule', name: 'Opportunity Knocks', hooks: {
      modifyOpportunity: function (o) { o.flat += 1; },
      onOpportunityAttack: function () { calls++; },
    } });
    t.eq(DD.Combat.provokes(hero(), 0, 4)[0].dmg, 5, 'a rule\'s "+1 on attacks of opportunity" adds 1 (4 → 5), not 2');
    const hp5 = hero().hp;
    DD.Combat.move(hero(), 0, 4);
    t.ok(hero().hp === hp5 - 5 && calls === 1, 'the stab deals 5 and the rule hears about it once (' + (hp5 - hero().hp) + ', ' + calls + ' calls)');
  });

  // =====================================================================================================
  // v2 requests (user): flyers ignore floor effects · hazards per unit · attacks set off barrels · heals get downed
  // allies back up
  // =====================================================================================================
  function flyer(u) { u.flags = Object.assign({}, u.flags, { flying: true }); return u; }
  function ids(u) { return u.statuses.map(function (st) { return st.id; }).sort().join(',') || '-'; }
  /** One step onto (x, y) (a walk, not a move action: no Bleed, no attacks of opportunity). */
  function stepOnto(u, x, y) { return DD.Act.moveAlong(u, [{ x: x, y: y }], { action: false }).length === 1; }
  /** End this unit's own turn (sandbox: its turn starts now, then ends: onTurnEnd, decay, the tile it stands on). */
  function endOwnTurn(u) { DD.Combat.giveTurnTo(u); if (DD.Combat.current() === u) DD.Combat.endTurn(); }
  /** A flying mage on (1,1) and a walking knight on (1,3); prep(x, y) dresses (2,1) and (2,3) the same way. */
  function flyerAndWalker(prep, extra) {
    quiet(Object.assign({ w: 9, h: 9, heroes: [H(1, 1), H(1, 3, 'test_knight')], enemies: [E(8, 8)], enemyAi: false }, extra || {}));
    const f = flyer(hero(0)), w = hero(1);
    if (prep) { prep(2, 1); prep(2, 3); }
    return { f: f, w: w };
  }

  T.suite('engine: v2 requests — flyers ignore everything on the floor (terrain, surfaces, objects, ticks, reactions)', function (t) {
    const A = DD.Act, G = DD.Grid;
    // helper API
    let p = flyerAndWalker(null);
    t.ok(G.isFlying(p.f) && !G.feelsFloor(p.f) && G.feelsFloor(p.w) && !G.feelsFloor(null), 'Grid.feelsFloor: walkers yes, flyers no');
    t.ok(!G.feelsSurface(p.f, 'fire') && G.feelsSurface(p.w, 'fire') && G.feelsSurface(p.f, 'steam') && G.feelsSurface(p.f, DD.getSurface('smoke')), 'Grid.feelsSurface: flyers feel clouds only (id or def)');
    ['fire', 'poison', 'web', 'holy', 'water', 'oil', 'ice', 'blood', 'electric', 'cheeto'].forEach(function (id) {
      t.ok(!DD.getSurface(id).airborne, 'surface ' + id + ' lies on the floor (not airborne)');
    });
    t.ok(DD.getSurface('steam').airborne && DD.getSurface('smoke').airborne, 'steam and smoke are clouds (airborne)');
    // terrain on entry: lava, water
    p = flyerAndWalker(function (x, y) { setT(x, y, 'lava'); });
    let f0 = p.f.hp, w0 = p.w.hp;
    t.ok(stepOnto(p.f, 2, 1) && stepOnto(p.w, 2, 3), 'both step onto lava');
    t.ok(p.f.hp === f0 && ids(p.f) === '-', 'lava: the flyer feels nothing (' + (f0 - p.f.hp) + ' dmg, ' + ids(p.f) + ')');
    t.ok(p.w.hp === w0 - 8 && has(p.w, 'burn'), 'lava: the walker takes 8 and Burns');
    f0 = p.f.hp; w0 = p.w.hp;
    endOwnTurn(p.f);
    t.ok(p.f.hp === f0 && ids(p.f) === '-', 'ending a turn over lava: nothing for the flyer');
    p = flyerAndWalker(function (x, y) { setT(x, y, 'water'); });
    stepOnto(p.f, 2, 1); stepOnto(p.w, 2, 3);
    t.ok(!has(p.f, 'wet') && has(p.w, 'wet'), 'shallow water: the walker gets Wet, the flyer stays dry');
    // surfaces on entry
    const onEntry = { fire: 'burn', poison: 'poison', web: 'root', cheeto: 'slow', water: 'wet' };
    Object.keys(onEntry).forEach(function (sid) {
      p = flyerAndWalker(function (x, y) { A.setSurface(x, y, sid, 3); });
      stepOnto(p.f, 2, 1); stepOnto(p.w, 2, 3);
      t.ok(!has(p.f, onEntry[sid]) && has(p.w, onEntry[sid]), 'surface ' + sid + ': ' + onEntry[sid] + ' for the walker only (flyer ' + ids(p.f) + ', walker ' + ids(p.w) + ')');
    });
    p = flyerAndWalker(function (x, y) { A.setSurface(x, y, 'electric', 1); });
    f0 = p.f.hp; w0 = p.w.hp;
    stepOnto(p.f, 2, 1); stepOnto(p.w, 2, 3);
    t.ok(p.f.hp === f0 && p.w.hp === w0 - 3, 'live current: 3 lightning to the walker only');
    // standing in it at turn end: fire, poison, holy ground
    [['fire', 'burn'], ['poison', 'poison']].forEach(function (c) {
      p = flyerAndWalker(function (x, y) { A.setSurface(x, y, c[0], 3); });
      A.teleport(p.f, 2, 1, { noEnter: true }); A.teleport(p.w, 2, 3, { noEnter: true });
      // checked right after each one's own turn end (Poison ticks off at its owner's next turn start)
      endOwnTurn(p.f);
      const fHas = has(p.f, c[1]);
      endOwnTurn(p.w);
      t.ok(!fHas && has(p.w, c[1]), 'ending a turn in ' + c[0] + ': ' + c[1] + ' for the walker only');
    });
    p = flyerAndWalker(function (x, y) { A.setSurface(x, y, 'holy', 3); });
    A.teleport(p.f, 2, 1, { noEnter: true }); A.teleport(p.w, 2, 3, { noEnter: true });
    p.f.hp -= 5; p.w.hp -= 5;
    f0 = p.f.hp; w0 = p.w.hp;
    endOwnTurn(p.f); endOwnTurn(p.w);
    t.ok(p.f.hp === f0 && p.w.hp === w0 + 3, 'holy ground heals walkers only (good effects too: flyers are above all that)');
    // ground objects and traps
    p = flyerAndWalker(function (x, y) { A.placeObject(x, y, 'spikes'); });
    f0 = p.f.hp; w0 = p.w.hp;
    stepOnto(p.f, 2, 1); stepOnto(p.w, 2, 3);
    t.ok(p.f.hp === f0 && p.w.hp === w0 - 5, 'spikes: 5 to the walker only');
    p = flyerAndWalker(function (x, y) { A.placeObject(x, y, 'pressure_plate'); });
    stepOnto(p.f, 2, 1);
    t.ok(!tile(2, 1).obj.data.pressed, 'a flyer never presses a plate');
    stepOnto(p.w, 2, 3);
    t.ok(tile(2, 3).obj.data.pressed, '... a walker does');
    p = flyerAndWalker(function (x, y) { A.placeObject(x, y, 'gold_pile'); }, { gold: 0 });
    stepOnto(p.f, 2, 1);
    t.ok(A.gold() === 0 && !!tile(2, 1).obj, 'a flying hero floats over a gold pile (good things too)');
    stepOnto(p.w, 2, 3);
    t.ok(A.gold() > 0 && !tile(2, 3).obj, '... a walking one pockets it');
    withDefs('objects', [{ id: 'test_tmp_snare', name: 'Snare', blocksMove: false, hp: 0, onEnter: function (u) { A.addStatus(u, 'root', { turns: 1 }, null); } }], function () {
      p = flyerAndWalker(function (x, y) { A.placeObject(x, y, 'test_tmp_snare'); });
      stepOnto(p.f, 2, 1); stepOnto(p.w, 2, 3);
      t.ok(!has(p.f, 'root') && has(p.w, 'root'), 'a content trap (object onEnter) never fires for a flyer');
      // pushed or teleported onto it: same
      p = flyerAndWalker(function (x, y) { A.placeObject(x, y, 'test_tmp_snare'); });
      A.push(null, p.f, { x: 1, y: 0 }, 1); A.teleport(p.w, 2, 3);
      t.ok(p.f.x === 2 && !has(p.f, 'root') && has(p.w, 'root'), 'pushed onto it (flyer) / teleported onto it (walker)');
    });
    // clouds still touch flyers
    withDefs('surfaces', [{ id: 'test_tmp_gas', name: 'Test Gas', color: 'rgba(0,255,0,0.3)', turns: 3, airborne: true, hazard: true, hazardDmg: 0, hazardEnd: 1, hazardStatus: 'poison',
      onEnter: function (u) { A.addStatus(u, 'poison', { stacks: 2 }, null); }, onTurnEnd: function (u) { A.addStatus(u, 'poison', { stacks: 1 }, null); } }], function () {
      p = flyerAndWalker(function (x, y) { A.setSurface(x, y, 'test_tmp_gas', 3); });
      t.eq(G.hazardAt(2, 1, p.f), 'test_tmp_gas', 'an airborne cloud is a hazard for flyers too');
      stepOnto(p.f, 2, 1); stepOnto(p.w, 2, 3);
      t.ok(A.getStatus(p.f, 'poison').stacks === 2 && A.getStatus(p.w, 'poison').stacks === 2, 'clouds (airborne: gases) poison flyers and walkers alike');
      endOwnTurn(p.f);
      t.eq(A.getStatus(p.f, 'poison').stacks, 2, '... and when a flyer ends its turn inside (2, −1 at its turn start, +1 at its turn end)');
      p = flyerAndWalker(null);
      A.splash(1, 1, 0, 'test_tmp_gas', 2, null);
      t.ok(has(p.f, 'poison'), 'a splashed cloud too');
    });
    // splashes on the floor
    p = flyerAndWalker(null);
    A.splash(1, 1, 0, 'poison', 3, null); A.splash(1, 3, 0, 'poison', 3, null);
    t.ok(!has(p.f, 'poison') && has(p.w, 'poison'), 'a poison puddle splashed under them: the walker only');
    // floor element reactions: an oil slick going up burns the walkers on it, not the flyer above it
    p = flyerAndWalker(null);
    [[1, 1], [1, 2], [1, 3]].forEach(function (q) { A.setSurface(q[0], q[1], 'oil', 5); });
    A.applyElement(1, 2, 'fire', null);
    t.ok(tile(1, 1).surface.id === 'fire' && tile(1, 3).surface.id === 'fire', 'the slick burns end to end');
    t.ok(!has(p.f, 'burn') && has(p.w, 'burn'), 'a lit oil slick burns the walker on it, not the flyer above it');
    A.applyElement(1, 1, 'fire', null);
    t.ok(has(p.f, 'burn'), 'fire aimed at the flyer\'s own tile still hits it (attacks and spells aimed at their area)');
    // lightning in water: only grounded units
    p = flyerAndWalker(null);
    [[1, 1], [1, 2], [1, 3]].forEach(function (q) { setT(q[0], q[1], 'water'); });
    f0 = p.f.hp; w0 = p.w.hp;
    A.applyElement(1, 2, 'lightning', null);
    t.ok(p.f.hp === f0 && !has(p.f, 'stun') && p.w.hp === w0 - 4 && has(p.w, 'stun'), 'an electrified pool shocks the walker, not the flyer');
    // explosions still hit flyers (blast damage), the fire they leave does not
    p = flyerAndWalker(null);
    A.placeObject(1, 2, 'barrel_explosive');
    f0 = p.f.hp; w0 = p.w.hp;
    A.destroyObject(1, 2, null);
    t.ok(p.f.hp === f0 - 8 && p.w.hp === w0 - 7, 'an explosion\'s blast hits the flyer too (8; the knight 8 − 1 armor)');
    // ice slides, setTerrain under them, pits
    p = flyerAndWalker(function (x, y) { setT(x, y, 'ice'); });
    A.push(null, p.f, { x: 1, y: 0 }, 1); A.push(null, p.w, { x: 1, y: 0 }, 1);
    t.ok(p.f.x === 2 && p.w.x === 3, 'ice: a pushed walker slides one extra tile, a flyer stops');
    p = flyerAndWalker(function (x, y) { A.setSurface(x, y, 'ice', 3); });
    A.push(null, p.f, { x: 1, y: 0 }, 1); A.push(null, p.w, { x: 1, y: 0 }, 1);
    t.ok(p.f.x === 2 && p.w.x === 3, 'an ice sheet (surface) too');
    p = flyerAndWalker(function (x, y) { setT(x, y, 'mud'); });
    t.ok(G.stepCost(p.f, { x: 1, y: 1 }, { x: 2, y: 1 }) === 1 && G.stepCost(p.w, { x: 1, y: 3 }, { x: 2, y: 3 }) === 2, 'mud costs a walker 2, a flyer 1');
    p = flyerAndWalker(null);
    f0 = p.f.hp; w0 = p.w.hp;
    A.setTerrain(1, 1, 'lava'); A.setTerrain(1, 3, 'lava');
    t.ok(p.f.hp === f0 && p.w.hp === w0 - 8, 'lava appearing under them: the walker burns, the flyer hovers');
    // hazards for flyers (paths, AI, previews)
    p = flyerAndWalker(function (x, y) { setT(x, y, 'lava'); A.setSurface(x + 1, y, 'fire', 3); A.placeObject(x + 2, y, 'spikes'); });
    t.ok(G.hazardAt(2, 1, p.f) === null && G.hazardAt(3, 1, p.f) === null && G.hazardAt(4, 1, p.f) === null, 'Grid.hazardAt: lava, fire and spikes are no hazard for a flyer');
    t.ok(G.hazardAt(2, 3, p.w) === 'lava' && G.hazardAt(3, 3, p.w) === 'fire' && G.hazardAt(4, 3, p.w) === 'spikes', '... they are for a walker');
    t.ok(!G.hazardDamage(2, 1, p.f) && !G.hazardDamage(3, 1, p.f) && G.hazardDamage(2, 3, p.w).enter === 8, 'Grid.hazardDamage too (AI / AutoPlay risk)');
    const fe = DD.Combat.reachable(p.f).get('5,1');
    t.ok(fe && !fe.hazard && fe.path.length === 4 && fe.path[0].y === 1, 'the flyer\'s move preview flies straight over them, no hazard warning (' + JSON.stringify(fe && fe.path) + ')');
    t.eq(DD.AI.pathRisk(p.f, { x: 5, y: 1, path: [{ x: 2, y: 1 }, { x: 3, y: 1 }, { x: 4, y: 1 }, { x: 5, y: 1 }] }).penalty, 0, 'AI.pathRisk: 0 for a flyer over all of it');
    // a status can grant flight
    withDefs('statuses', [{ id: 'test_tmp_wings', name: 'Borrowed Wings', icon: '🪽', type: 'buff', stacking: 'refresh', maxStacks: 1, flying: true, desc: function () { return 'Flies.'; } }], function () {
      p = flyerAndWalker(function (x, y) { setT(x, y, 'lava'); });
      A.addStatus(p.w, 'test_tmp_wings', { turns: 2 }, null);
      w0 = p.w.hp;
      t.ok(G.isFlying(p.w) && stepOnto(p.w, 2, 3) && p.w.hp === w0 && !has(p.w, 'burn'), 'a status with flying: true makes its unit a flyer (no lava damage)');
    });
  });

  T.suite('engine: v2 requests — hazards are per unit (flyers, immunities): previews, AI and AutoPlay agree', function (t) {
    const A = DD.Act, G = DD.Grid;
    quiet({ w: 9, h: 9, heroes: [H(1, 1), H(1, 3, 'test_knight'), H(1, 5, 'test_rogue')], enemies: [E(8, 8), E(8, 6, 'test_minion')], enemyAi: false });
    const m = hero(0), k = hero(1), r = hero(2), g = foe(0), mn = foe(1);
    A.setSurface(3, 1, 'fire', 3); setT(3, 3, 'lava'); A.setSurface(3, 5, 'poison', 3); A.setSurface(3, 7, 'electric', 3);
    A.setSurface(5, 1, 'web', 3); A.placeObject(5, 3, 'spikes');
    // fireproof (Pebbles: resist fire 0, immune to Burn)
    m.resist = { fire: 0 }; m.flags = { immune: ['burn'] };
    t.ok(G.hazardAt(3, 1, m) === null && G.hazardAt(3, 3, m) === null, 'fireproof: fire and lava are no hazard for it');
    t.ok(!G.hazardDamage(3, 3, m) && !G.hazardDamage(3, 1, m), '... no hazard numbers either');
    t.ok(G.hazardAt(3, 1, k) === 'fire' && G.hazardAt(3, 3, k) === 'lava', 'a plain walker is warned of both');
    t.ok(G.hazardAt(3, 5, m) === 'poison' && G.hazardAt(5, 3, m) === 'spikes', 'it is still warned of poison and spikes');
    // immune to Burn only: the fire surface only Burns (harmless), lava also deals fire damage (still a hazard)
    k.flags = { immune: ['burn'] };
    t.ok(G.hazardAt(3, 1, k) === null && G.hazardAt(3, 3, k) === 'lava', 'immune to Burn: fire is harmless, lava still burns its feet');
    // resist fire 0 without the Burn immunity: Burn deals fire damage (status def element), so both are harmless
    k.flags = {}; k.resist = { fire: 0 };
    t.ok(G.hazardAt(3, 1, k) === null && G.hazardAt(3, 3, k) === null, 'resist fire 0: Burn (fire) can\'t hurt it either (hell hounds in lava)');
    // poison-proof (slimes: resist poison 0), lightning-proof
    r.resist = { poison: 0, lightning: 0 };
    t.ok(G.hazardAt(3, 5, r) === null && G.hazardAt(3, 7, r) === null, 'resist poison / lightning 0: poison puddles and live current are harmless');
    t.ok(G.hazardAt(3, 5, k) === 'poison' && G.hazardAt(3, 7, k) === 'electric', '... for the others they are hazards');
    t.ok(G.harmlessTo(DD.getTerrain('lava'), null, m) && !G.harmlessTo(DD.getTerrain('lava'), null, r) && !G.harmlessTo(DD.getObject('spikes'), null, m),
      'Grid.harmlessTo(def, inst, unit): needs metadata (spikes declare none: a hazard for every walker)');
    t.ok(G.hazardAt(3, 1, null) === 'fire', 'unit null = anyone: still a hazard');
    // instance metadata wins over the def's
    A.placeObject(5, 5, 'spikes', { hazardElement: 'poison' });
    t.ok(G.hazardAt(5, 5, r) === null && G.hazardAt(5, 5, k) === 'spikes', 'instance hazardElement / hazardStatus override the def');
    // the move preview and paths: the fireproof mage walks straight through the fire, the knight goes around
    const me = DD.Combat.reachable(m).get('4,1');
    t.ok(me && !me.hazard && me.path.some(function (q) { return q.x === 3 && q.y === 1; }), 'the move preview walks Pebbles through the fire, no warning (' + JSON.stringify(me && me.path) + ')');
    const kp = G.reachable(k, 6).get('4,3');
    t.ok(kp && !kp.hazard, 'resist fire 0 walks lava without a warning');
    k.resist = {}; k.flags = {};
    const plain = G.reachable(k, 6).get('4,1');
    t.ok(plain && !plain.hazard && plain.path.every(function (q) { return !(q.x === 3 && q.y === 1); }), 'a plain walker paths around the fire (' + JSON.stringify(plain && plain.path) + ')');
    // AI risk: a poison-proof enemy crosses a puddle, a plain one pays for it
    mn.resist = { poison: 0 };
    const way = { x: 4, y: 5, path: [{ x: 2, y: 5 }, { x: 3, y: 5 }, { x: 4, y: 5 }] };
    t.ok(DD.AI.pathRisk(mn, way).penalty === 0 && DD.AI.pathRisk(g, way).penalty > 0, 'AI.pathRisk: 0 for the poison-proof minion, > 0 for the grunt');
    // AutoPlay's exposure: ending the turn on fire costs the fireproof mage nothing extra
    const inc = function (u, x, y) { return DD.AutoPlay.incomingAt(u, x, y).dmg; };
    t.ok(inc(m, 3, 1) === inc(m, 2, 1), 'AutoPlay: standing in fire costs the fireproof mage nothing (' + inc(m, 3, 1) + ' vs ' + inc(m, 2, 1) + ')');
    k.resist = {};
    t.ok(inc(k, 3, 1) > inc(k, 2, 1), '... it does cost a plain hero');
  });

  T.suite('engine: v2 requests — attacks aimed at a volatile object set it off (range, sight, credit, previews = reality)', function (t) {
    const A = DD.Act, Tg = DD.Targeting;
    // the mage (basic: Magic Missile, a single-target 'spell' basic, range 5) and a barrel among foes
    function scene(extra) {
      quiet(Object.assign({ w: 9, h: 9, heroes: [H(1, 4), H(0, 0, 'test_knight')],
        enemies: [E(5, 4, 'test_minion'), E(4, 5, 'test_minion'), E(4, 3, 'test_grunt'), E(8, 8, 'test_archer')],
        objects: [{ x: 4, y: 4, id: 'barrel_explosive' }], enemyAi: false }, extra || {}));
      return hero(0);
    }
    function targetsOf(u, ref) { return Tg.validTargets(u, ref).filter(function (q) { return q.obj; }).map(function (q) { return q.x + ',' + q.y; }).join(' '); }
    let m = scene();
    t.ok(A.isVolatile(tile(4, 4).obj) && !A.isVolatile({ id: 'barrel' }) && A.isVolatile({ id: 'barrel', volatile: true }), 'Act.isVolatile: barrel_explosive (def flag), instances may flag too');
    t.ok(Tg.aimsAtObjects(m, m.basic), 'a hero\'s basic attack can be aimed at barrels (even a "spell" basic)');
    t.eq(targetsOf(m, m.basic), '4,4', 'validTargets lists the barrel (with obj: its id)');
    t.ok(Tg.validTargets(m, m.basic).filter(function (q) { return q.obj; })[0].obj === 'barrel_explosive', '... obj = the object id');
    t.ok(!Tg.aimsAtObjects(m, slotOf(m, 'test_fireball')) && !Tg.aimsAtObjects(m, DD.getSkill('test_chain_zap')), 'tile skills and non-basic spells don\'t (they have their own ways)');
    t.ok(Tg.aimsAtObjects(hero(1), slotOf(hero(1), 'test_shield_bash')) === false && Tg.aimsAtObjects(hero(1), hero(1).basic), 'dir skills don\'t; the knight\'s Test Slash (kind attack) does');
    t.eq(targetsOf(hero(1), hero(1).basic), '', '... within its range only (the knight is far)');
    t.ok(!Tg.aimsAtObjects(foe(2), foe(2).skillSlots[0]), 'enemies never aim at objects (barrels stay a hero tool)');
    t.ok(!Tg.buildCtx(foe(2), foe(2).skillSlots[0], { x: 4, y: 4 }).targetObj, '... not even when handed one');
    // range and line of sight
    m = scene({ objects: [{ x: 7, y: 4, id: 'barrel_explosive' }] });
    t.eq(targetsOf(m, m.basic), '', 'a barrel 6 tiles away is out of Magic Missile\'s range (5)');
    m = scene();
    setT(3, 4, 'wall');
    t.eq(targetsOf(m, m.basic), '', 'a wall in between: no line of sight, no target');
    m = scene({ objects: [{ x: 4, y: 4, id: 'barrel' }] });
    t.eq(targetsOf(m, m.basic), '', 'a plain barrel is no target');
    // opt-in / opt-out
    withTemp('skills', [
      { id: 'test_tmp_dud', name: 'Dud Shot', owner: 'test_mage', kind: 'attack', ap: 1, levels: [{ dmg: 3 }], target: { type: 'unit', range: [1, 5], filter: 'enemy', objects: false }, desc: function () { return 'x'; }, execute: function () {} },
      { id: 'test_tmp_zing', name: 'Zing', owner: 'test_mage', kind: 'spell', ap: 1, levels: [{ dmg: 3 }], target: { type: 'unit', range: [1, 5], filter: 'enemy', objects: true }, desc: function () { return 'x'; }, execute: function () {} },
      { id: 'test_tmp_rider', name: 'Poison Dart', owner: 'test_mage', kind: 'attack', ap: 2, cooldown: 2, levels: [{ dmg: 3 }], target: { type: 'unit', range: [1, 5], filter: 'enemy' },
        desc: function () { return 'x'; }, execute: function (ctx) { ctx.state.data.dartRan = true; } },
    ], function () {
      m = scene();
      t.eq(targetsOf(m, DD.getSkill('test_tmp_dud')), '', 'target.objects: false opts out');
      t.eq(targetsOf(m, DD.getSkill('test_tmp_zing')), '4,4', 'target.objects: true opts a spell in');
      // costs paid, riders skipped
      const sl = giveSkill(m, 'test_tmp_rider');
      m.ap = 3;
      t.ok(DD.Combat.useSkill(m, sl, 4, 4), 'used on the barrel');
      t.ok(!DD.Combat.state.data.dartRan, 'its execute (the rider) does not run');
      t.ok(m.ap === 1 && sl.cd === 2, 'AP (2) and cooldown (2) are paid');
      t.ok(!tile(4, 4).obj, 'the barrel is gone');
    });
    // the preview shows the blast exactly, and it is what happens
    m = scene();
    const s = DD.Combat.state;
    const m1 = foe(0), m2 = foe(1), gr = foe(2);
    const pv = DD.Combat.preview(m, m.basic, 4, 4);
    t.ok(!pv.uncertain && pv.detonates === 'barrel_explosive', 'preview: certain, detonates the barrel');
    t.ok(pv.perUnit[m1.id] && pv.perUnit[m1.id].lethal && pv.perUnit[m2.id].lethal, 'preview: both minions KO');
    t.ok(pv.perUnit[gr.id] && pv.perUnit[gr.id].dmg === 8 && !pv.perUnit[gr.id].lethal, 'preview: the grunt −8 (' + (pv.perUnit[gr.id] && pv.perUnit[gr.id].text) + ')');
    t.ok(!pv.perUnit[m.id], 'preview: the mage 3 tiles away is safe');
    t.ok(pv.objects.length === 1 && pv.objects[0].destroyed, 'preview: the barrel destroyed');
    t.eq(keys(pv.tiles), keys([{ x: 4, y: 4 }, { x: 3, y: 4 }, { x: 5, y: 4 }, { x: 4, y: 3 }, { x: 4, y: 5 }]), 'preview.tiles = the blast (radius 1 around the barrel), for the HUD\'s area');
    t.eq(keys(pv.blast), keys(pv.tiles), 'preview.blast: the explosions\' tiles');
    const hype0 = s.hype, n0 = s.log.length;
    let kills = 0;
    A.addRule({ id: 'test_kill_count', name: 'Kill Count', hooks: { onKill: function (d) { if (d.credit === m) kills++; } } });
    t.ok(DD.Combat.useSkill(m, m.basic, 4, 4), 'useSkill on the barrel tile');
    t.ok(m1.dead && m2.dead && gr.hp === gr.maxHp - 8 && !tile(4, 4).obj, 'it blows: minions dead, grunt −8, barrel gone');
    t.eq(s.hype - hype0, pv.hype, 'Hype as previewed (' + pv.hype + ': environmental kills + a multi-hit)');
    t.ok(s.stats.units[m.id].kills === 2 && s.stats.envKills === 2 && kills === 2, 'credited to the mage: 2 kills, 2 environmental kills, onKill on her sources');
    t.ok(m.ap === 2, 'Magic Missile\'s 1 AP paid');
    t.ok(logSince(n0, /takes a shot at the explosive barrel/) && logSince(n0, /KABOOM/), 'logged (shot, KABOOM)');
    // a chain: two barrels side by side
    m = scene({ objects: [{ x: 4, y: 4, id: 'barrel_explosive' }, { x: 3, y: 4, id: 'barrel_explosive' }] });
    t.ok(DD.Combat.useSkill(m, m.basic, 4, 4) && !tile(4, 4).obj && !tile(3, 4).obj, 'chain reaction: the first blast sets off the barrel next to it');
    // melee (lunge), summons, consumables
    quiet({ w: 9, h: 9, heroes: [H(3, 4, 'test_knight')], enemies: [E(8, 8)], objects: [{ x: 4, y: 4, id: 'barrel_explosive' }], enemyAi: false });
    const kn = hero(), hp0 = kn.hp;
    kn.block = 0;
    t.eq(targetsOf(kn, kn.basic), '4,4', 'melee basic: the adjacent barrel');
    t.ok(DD.Combat.useSkill(kn, kn.basic, 4, 4) && !tile(4, 4).obj && kn.hp === hp0 - 7, 'whacked: it blows up in the knight\'s face (8 − 1 armor)');
    quiet({ w: 9, h: 9, heroes: [H(1, 1, 'test_summoner')], enemies: [E(8, 8)], objects: [{ x: 5, y: 5, id: 'barrel_explosive' }], enemyAi: false });
    const hound = A.summon(hero(), 'test_hound', 5, 4, { ready: true, noFx: true });
    t.eq(targetsOf(hound, DD.Combat.slotsOf(hound)[0]), '5,5', 'a hero-side summon\'s melee attack (the hound\'s Bite) too');
    DD.registerConsumable({ id: 'test_tmp_dart', name: 'Throwing Dart', icon: '🎯', rarity: 'common', ap: 1, target: { type: 'unit', range: [1, 4], filter: 'enemy' },
      desc: 'Throw a dart at a foe: 2 damage.', execute: function (ctx) { if (ctx.targetUnit) A.damage(ctx.user, ctx.targetUnit, 2); } });
    try {
      m = scene({ consumables: ['test_tmp_dart'] });
      t.ok(Tg.aimsAtObjects(m, DD.getConsumable('test_tmp_dart')), 'a consumable with a single-unit enemy target (no kind) too');
      const mm = foe(0);
      const cpv = Tg.preview(m, DD.getConsumable('test_tmp_dart'), { x: 4, y: 4 });
      t.ok(cpv.perUnit[mm.id] && cpv.perUnit[mm.id].lethal, 'its preview shows the blast');
      t.ok(DD.Combat.useConsumable(m, 0, 4, 4) && !tile(4, 4).obj && mm.dead, 'thrown: the barrel blows');
      t.eq(DD.Combat.consumables().length, 0, 'and the dart is used up');
    } finally { delete DD.defs.consumables.test_tmp_dart; }
    // the AI never aims at barrels: an archer next to a barrel by the heroes shoots a hero
    quiet({ w: 9, h: 9, heroes: [H(3, 4), H(3, 6, 'test_knight')], enemies: [E(7, 5, 'test_archer')], objects: [{ x: 4, y: 5, id: 'barrel_explosive' }] });
    DD.AI.act(foe());
    t.ok(!!tile(4, 5).obj, 'the AI shot a hero, not the barrel between them');
    // Smash stays as it was (objective objects / smashable ones only)
    quiet({ w: 9, h: 9, heroes: [H(3, 4)], enemies: [E(8, 8)], objects: [{ x: 4, y: 4, id: 'barrel_explosive' }, { x: 3, y: 5, id: 'totem' }], enemyAi: false });
    const ia = DD.Combat.interactions(hero()).map(function (o) { return o.kind + '@' + o.x + ',' + o.y; }).join(' ');
    t.ok(/smash@3,5/.test(ia) && !/smash@4,4/.test(ia), 'the Smash interaction is unchanged (' + ia + ')');
  });

  T.suite('engine: v2 requests — a heal aimed at a downed ally gets it back up (only that heal)', function (t) {
    const A = DD.Act, Tg = DD.Targeting;
    // cleric (Patch Notes: heal 7, unit allyOrSelf, range 0-4), knight downed next to her, mage further away
    function scene(extra, order) {
      quiet(Object.assign({ w: 9, h: 9, heroes: order || [H(1, 1, 'test_cleric'), H(2, 1, 'test_knight'), H(3, 2)], enemies: [E(8, 8)], enemyAi: false }, extra || {}));
      const c = DD.Combat.heroes().filter(function (u) { return u.defId === 'test_cleric'; })[0];
      const k = DD.Combat.heroes().filter(function (u) { return u.defId === 'test_knight'; })[0];
      A.kill(k, null);
      return { c: c, k: k };
    }
    let sc = scene();
    const heal = function () { return slotOf(sc.c, 'test_heal'); };
    t.ok(sc.k.downed && Tg.revivesWith(sc.c, heal()), 'Patch Notes is a single-target heal that can revive');
    const vt = Tg.validTargets(sc.c, heal()).filter(function (q) { return q.x === 2 && q.y === 1; })[0];
    t.ok(vt && vt.revive === true, 'validTargets lists the downed knight (revive: true)');
    t.ok(!Tg.revivesWith(sc.c, DD.getSkill('test_sanctuary')) && !Tg.revivesWith(sc.c, DD.getSkill('test_cleric_sig')) && !Tg.revivesWith(sc.c, DD.getSkill('test_bless')),
      'area heals and buffs don\'t revive');
    t.ok(!Tg.revivesWith(foe(), DD.getSkill('test_mend')), 'enemy heals never aim at downed heroes');
    const ctx = Tg.buildCtx(sc.c, heal(), { x: 2, y: 1 });
    t.ok(ctx.targetUnit === sc.k && ctx.reviveTarget === sc.k, 'buildCtx: targetUnit = reviveTarget = the downed knight');
    // the preview says "UP!" with the HP, and that is what happens
    const pv = DD.Combat.preview(sc.c, heal(), 2, 1);
    const e = pv.perUnit[sc.k.id];
    t.ok(e && e.revived && e.heal === 7 && !e.lethal && !pv.uncertain && /UP! 7 HP/.test(e.text), 'preview: "' + (e && e.text) + '"');
    t.eq(pv.revives, sc.k.id, 'preview.revives = the ally');
    const seen = { narr: [], bark: [], fx: 0 }, heals = [];
    const nar = A.narrate, bark = A.bark, fxr = DD.FX.revive;
    A.addRule({ id: 'test_heal_watch', name: 'Watch', hooks: { onHealed: function (u, n) { heals.push(u.defId + ':' + n); } } });
    A.narrate = function (key) { seen.narr.push(key); return nar.apply(this, arguments); };
    A.bark = function (u, key) { if (typeof key === 'string') seen.bark.push(key); return bark.apply(this, arguments); };
    DD.FX.revive = function () { seen.fx++; return fxr.apply(this, arguments); };
    const n0 = DD.Combat.state.log.length, ap0 = sc.c.ap;
    let ok;
    try { ok = DD.Combat.useSkill(sc.c, heal(), 2, 1); } finally { A.narrate = nar; A.bark = bark; DD.FX.revive = fxr; }
    t.ok(ok && !sc.k.downed && sc.k.hp === 7 && sc.k.ap === 0, 'the knight is up with 7 HP and 0 AP');
    t.eq(sc.c.ap, ap0 - 1, 'the heal\'s 1 AP paid');
    t.ok(logSince(n0, /Sir Testsalot is back up \(7 HP\)/), 'the revive log line');
    t.ok(seen.narr.indexOf('hero_revived') >= 0 && seen.bark.indexOf('revive') >= 0 && seen.fx === 1, 'narration hero_revived, the revive bark, the revive FX');
    t.ok(heals.indexOf('test_knight:7') >= 0 && DD.Combat.state.stats.units[sc.c.id].heals >= 7, 'onHealed and the healing stat count it');
    // he acts on his own slot this round (after the cleric's)
    DD.Combat.endTurn();
    t.ok(cur() === sc.k && sc.k.ap === 3, 'his turn comes up as usual, with full AP');
    // his slot already passed: next round
    sc = scene(null, [H(2, 1, 'test_knight'), H(1, 1, 'test_cleric')]);
    DD.Combat.endTurn();
    t.eq(cur(), sc.c, 'the downed knight\'s slot passed: the cleric');
    DD.Combat.useSkill(sc.c, heal(), 2, 1);
    t.ok(!sc.k.downed && sc.k.ap === 0, 'up, 0 AP');
    const r0 = DD.Combat.state.round;
    DD.Combat.endTurn();
    t.ok(cur() === sc.k && DD.Combat.state.round === r0 + 1 && sc.k.ap === 3, 'he acts next round');
    // the HP: heal bonuses, modifyHeal, the level, at least 1, at most max HP
    sc = scene();
    sc.c.healBonus = 0.5;
    DD.Combat.useSkill(sc.c, heal(), 2, 1);
    t.eq(sc.k.hp, 11, 'item heal bonus +50%: round(7 × 1.5) = 11 HP');
    function withRule(hook, fn) { A.addRule({ id: 'test_heal_mod', name: 'Mod', hooks: { modifyHeal: hook } }); fn(); }
    sc = scene();
    withRule(function (h) { h.amount = 0.2; }, function () { DD.Combat.useSkill(sc.c, heal(), 2, 1); });
    t.ok(!sc.k.downed && sc.k.hp === 1, 'a heal shrunk below 1 still gets him up at 1 HP');
    sc = scene();
    withRule(function (h) { if (h.revive) h.amount = 999; }, function () { DD.Combat.useSkill(sc.c, heal(), 2, 1); });
    t.eq(sc.k.hp, sc.k.maxHp, 'capped at max HP (h.revive tells modifyHeal it is a revive)');
    sc = scene();
    withRule(function (h) { h.cancel = true; }, function () { DD.Combat.useSkill(sc.c, heal(), 2, 1); });
    t.ok(sc.k.downed, 'a cancelled heal (modifyHeal) does not revive');
    sc = scene();
    slotOf(sc.c, 'test_heal').level = 3;
    DD.Combat.useSkill(sc.c, heal(), 2, 1);
    t.eq(sc.k.hp, 12, 'Patch Notes III: 12 HP');
    // what never revives
    sc = scene();
    giveSkill(sc.c, 'test_sanctuary');
    sc.c.ap = 3;
    t.ok(DD.Combat.useSkill(sc.c, slotOf(sc.c, 'test_sanctuary'), 2, 1) && sc.k.downed, 'an area heal centred on him: still down');
    t.eq(A.heal(sc.c, sc.k, 10), 0, 'a heal outside an aimed use (passives, round ends): 0, still down');
    t.ok(A.heal(sc.c, sc.k, 10, { cause: 'status' }) === 0 && sc.k.downed, 'regeneration (cause status): 0');
    sc = scene();
    t.ok(DD.Combat.useSkill(sc.c, heal(), 3, 2), 'the heal aimed at the mage');
    t.ok(sc.k.downed, 'a heal aimed at someone else: he stays down');
    withTemp('skills', [{ id: 'test_tmp_salve', name: 'Salve', owner: 'test_cleric', kind: 'heal', tags: ['heal'], ap: 1, levels: [{ heal: 5 }],
      target: { type: 'unit', range: [0, 4], filter: 'allyOrSelf', revive: false }, desc: function () { return 'x'; },
      execute: function (ctx) { if (ctx.targetUnit) A.heal(ctx.user, ctx.targetUnit, ctx.L.heal); } }], function () {
      sc = scene();
      t.ok(!Tg.validTargets(sc.c, DD.getSkill('test_tmp_salve')).some(function (q) { return q.x === 2 && q.y === 1; }), 'target.revive: false opts out');
    });
    // 'downedAlly' revive skills and Help Up stay as they were
    sc = scene();
    const rv = giveSkill(sc.c, 'test_revive');
    t.ok(DD.Combat.useSkill(sc.c, rv, 2, 1) && sc.k.hp === Math.round(sc.k.maxHp * 0.4), 'Rerun Failed (downedAlly) still revives at 40%');
    sc = scene();
    const help = DD.Combat.interactions(sc.c).filter(function (o) { return o.kind === 'helpUp'; })[0];
    t.ok(help && help.ap === 2 && DD.Combat.interact(sc.c, 2, 1) && sc.k.hp === Math.round(sc.k.maxHp * 0.25), 'Help Up: 2 AP, ¼ HP');
    // a consumable heal
    DD.registerConsumable({ id: 'test_tmp_tonic', name: 'Tonic', icon: '🧃', rarity: 'common', ap: 1, tags: ['heal'], target: { type: 'unit', range: [0, 1], filter: 'allyOrSelf' },
      desc: 'Heal yourself or an adjacent ally 6 HP.', execute: function (ctx) { if (ctx.targetUnit) A.heal(ctx.user, ctx.targetUnit, 6); } });
    try {
      sc = scene({ consumables: ['test_tmp_tonic'] });
      const cpv = Tg.preview(sc.c, DD.getConsumable('test_tmp_tonic'), { x: 2, y: 1 });
      t.ok(cpv.perUnit[sc.k.id] && cpv.perUnit[sc.k.id].revived, 'a healing consumable previews "UP!" too');
      t.ok(DD.Combat.useConsumable(sc.c, 0, 2, 1) && !sc.k.downed && sc.k.hp === 6, 'and drinks him back up (6 HP)');
    } finally { delete DD.defs.consumables.test_tmp_tonic; }
  });

  // ---- v2 requests review (ADVERSARIAL REVIEWER): docs/notes/rules.md "v2 requests review" ------------------------------
  T.suite('engine: v2 requests review — flight that ends over a pit lands the unit in it (status wings)', function (t) {
    const A = DD.Act, G = DD.Grid;
    withDefs('statuses', [{ id: 'test_tmp_wings', name: 'Borrowed Wings', icon: '🪽', type: 'buff', stacking: 'refresh', maxStacks: 1, flying: true,
      desc: function () { return 'Flies.'; } }], function () {
      // removed by name: the hero over the pit falls in and climbs out hurt (25% max HP), like any walker
      quiet({ w: 9, h: 9, heroes: [H(1, 1)], enemies: [E(8, 8)], enemyAi: false });
      let u = hero();
      setT(2, 1, 'pit');
      A.addStatus(u, 'test_tmp_wings', { turns: 2 }, null);
      t.ok(stepOnto(u, 2, 1) && u.x === 2 && G.isFlying(u), 'with wings it hovers over the pit');
      let hp0 = u.hp;
      A.removeStatus(u, 'test_tmp_wings');
      t.ok(!G.isDrop(u.x, u.y) && u.hp === hp0 - Math.ceil(u.maxHp * 0.25), 'wings gone: it falls in and climbs out (' + u.x + ',' + u.y + ', −' + (hp0 - u.hp) + ')');
      // dispelled (cleanse of buffs): same
      quiet({ w: 9, h: 9, heroes: [H(1, 1)], enemies: [E(8, 8)], enemyAi: false });
      u = hero();
      setT(2, 1, 'deep_water');
      A.addStatus(u, 'test_tmp_wings', { turns: 2 }, null);
      stepOnto(u, 2, 1);
      hp0 = u.hp;
      A.cleanse(u, 'buff');
      t.ok(!G.isDrop(u.x, u.y) && u.hp < hp0 && has(u, 'wet'), 'dispelled over deep water: it sinks, splutters out Wet');
      // run out at its turn end (decay): an enemy over a pit drops for good
      quiet({ w: 9, h: 9, heroes: [H(1, 1)], enemies: [E(5, 5)], enemyAi: false });
      const g = foe();
      setT(5, 6, 'pit');
      A.addStatus(g, 'test_tmp_wings', { turns: 1 }, null);
      t.ok(stepOnto(g, 5, 6), 'the grunt flies over a pit');
      endOwnTurn(g);
      t.ok(g.dead, 'its wings run out at its turn end: YEET (the grunt falls)');
      // over plain floor nothing happens
      quiet({ w: 9, h: 9, heroes: [H(1, 1)], enemies: [E(8, 8)], enemyAi: false });
      u = hero();
      A.addStatus(u, 'test_tmp_wings', { turns: 2 }, null);
      hp0 = u.hp;
      A.removeStatus(u, 'test_tmp_wings');
      t.ok(u.x === 1 && u.y === 1 && u.hp === hp0, 'over plain floor: it just lands');
      // a natural flyer that also had wings keeps flying
      quiet({ w: 9, h: 9, heroes: [H(1, 1)], enemies: [E(8, 8)], enemyAi: false });
      u = flyer(hero());
      setT(2, 1, 'pit');
      A.addStatus(u, 'test_tmp_wings', { turns: 2 }, null);
      stepOnto(u, 2, 1);
      A.removeStatus(u, 'test_tmp_wings');
      t.ok(u.x === 2 && u.y === 1, 'a born flyer stays up when the wings go');
    });
  });

  T.suite('engine: v2 requests review — edges, surface instances and clouds are per unit / per cloud', function (t) {
    const A = DD.Act, G = DD.Grid;
    // 1. edges: a drop next to a flyer is no danger; lava next to a fireproof unit neither
    let p = flyerAndWalker(null);
    setT(3, 1, 'pit'); setT(3, 3, 'pit');
    t.ok(G.isEdge(2, 3, p.w) && !G.isEdge(2, 1, p.f) && G.isEdge(2, 1), 'Grid.isEdge(x, y, unit): a pit edge for a walker, none for a flyer (no unit: anyone)');
    t.ok(G.reachable(p.w, 4).get('2,3').edge && !G.reachable(p.f, 4).get('2,1').edge && !G.reachable(p.f, 4, { aoo: true }).get('2,1').edge, 'Grid.reachable (the move preview)\'s "next to a drop" flag is per unit');
    p = flyerAndWalker(null);
    setT(3, 3, 'lava');
    t.ok(G.isEdge(2, 3, p.w), 'lava edge for a plain walker');
    p.w.resist = { fire: 0 };
    t.ok(!G.isEdge(2, 3, p.w), '... not for a fireproof one (lava can\'t hurt it)');
    // 2. feelsSurface accepts a tile's surface instance (it carries no airborne flag of its own)
    p = flyerAndWalker(null);
    A.setSurface(2, 1, 'steam', 2); A.setSurface(2, 3, 'fire', 2);
    t.ok(G.feelsSurface(p.f, tile(2, 1).surface) && !G.feelsSurface(p.f, tile(2, 3).surface) && G.feelsSurface(p.w, tile(2, 3).surface),
      'Grid.feelsSurface(unit, tile.surface): a steam instance touches the flyer, a fire instance only the walker');
    // 3. clouds (airborne) drift over pits and lava; floor surfaces don't
    withDefs('surfaces', [{ id: 'test_tmp_fog', name: 'Test Fog', color: 'rgba(200,200,200,0.4)', turns: 2, airborne: true, desc: 'A cloud.' }], function () {
      quiet({ w: 9, h: 9, heroes: [H(1, 1)], enemies: [E(8, 8)], enemyAi: false });
      setT(3, 3, 'pit'); setT(4, 4, 'lava');
      t.ok(A.setSurface(3, 3, 'test_tmp_fog', 2) && A.setSurface(4, 4, 'test_tmp_fog', 2), 'an airborne content cloud can hang over a pit and over lava');
      t.ok(!A.setSurface(3, 4, 'fire', 2) || tile(3, 4).surface.id === 'fire', 'control: fire on floor is fine');
      setT(5, 5, 'pit');
      t.ok(!A.setSurface(5, 5, 'fire', 2) && !A.setSurface(4, 4, 'poison', 2), 'floor surfaces never lie on a pit or on lava');
      A.setSurface(6, 6, 'test_tmp_fog', 2); A.setSurface(6, 7, 'fire', 2);
      A.setTerrain(6, 6, 'lava'); A.setTerrain(6, 7, 'lava');
      t.ok(tile(6, 6).surface && tile(6, 6).surface.id === 'test_tmp_fog' && !tile(6, 7).surface, 'lava welling up keeps a cloud, swallows the fire');
      A.setSurface(7, 6, 'steam', 2); A.setSurface(7, 7, 'oil', 2);
      A.setTerrain(7, 6, 'pit'); A.setTerrain(7, 7, 'pit');
      t.ok(tile(7, 6).surface && tile(7, 6).surface.id === 'steam' && !tile(7, 7).surface, 'a floor collapsing into a pit keeps the steam above it, drops the oil');
    });
  });
})();
