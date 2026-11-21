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
    // difficulty — [finish audit-1] the brutal row comes from DD.Balance (a refit moves it; the test follows)
    const BR = DD.Balance.difficulty.brutal;
    t.ok(BR.hp > 1 && BR.dmg > 1, 'brutal raises enemy HP and damage (DD.Balance.difficulty.brutal)');
    sb({ difficulty: 'brutal', heroes: [H(1, 1)], enemies: [E(2, 1)] });
    t.eq(foe().maxHp, Math.round(14 * BR.hp), 'brutal enemy HP x' + BR.hp);
    t.eq(DD.Act.damage(foe(), hero(), 10), Math.round(10 * BR.dmg), 'brutal enemy damage x' + BR.dmg);
    t.eq(DD.Act.damage(hero(), foe(), 5), 5, 'hero damage unaffected');
    t.eq(JSON.stringify(DD.Combat.DIFFICULTY.brutal), JSON.stringify({ hp: BR.hp, dmg: BR.dmg }), 'DD.Combat.DIFFICULTY reads DD.Balance');
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
    // playtest fix (bosses-objectives-2): the offset is rolled when Dazzle lands and the board draws it (no "?")
    const moved = AI.intentTiles(dz, cone);
    t.ok(!AI.describe(dz, cone).uncertain && keys(moved) !== keys(drawn), 'a dazzled wind-up is drawn where it will land (not uncertain)');
    const ctx = captureSkill(dz, function () { DD.Combat.endTurn(); });
    t.ok(ctx && keys(ctx.tiles) === keys(moved) && DIRS4.some(function (dd) { return keys(shifted(drawn, dd)) === keys(ctx.tiles); }), 'it lands exactly one tile off, on the drawn tiles');
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

  // [qa FIGHTS-12] Galbraith and the finale read "Defeat X (the minions will flee)" with nobody there to flee
  T.suite('engine: a boss objective mentions fleeing minions only while there are some (qa FIGHTS-12)', function (t) {
    const text = function () { DD.Combat.refreshObjective(); return DD.Combat.state.objective.text; };
    const WITH = 'Defeat The Test Overlord (the minions will flee)', SOLO = 'Defeat The Test Overlord';
    // a solo boss: just "Defeat X", and he still wins the fight alone
    sb({ w: 9, h: 9, heroes: [H(1, 1)], enemies: [E(7, 7, 'test_boss')], objective: { type: 'boss' } });
    t.eq(DD.Combat.state.objective.text, SOLO, 'a solo boss at the start');
    // one appears mid-fight (an imp, a vine): the suffix comes with it, and it flees when the boss drops
    const imp = DD.Act.spawn('test_minion', 3, 3, { silent: true });
    t.ok(imp && text() === WITH, 'a spawned minion brings the suffix: ' + DD.Combat.state.objective.text);
    DD.Act.kill(foe(0), hero());
    t.ok(DD.Combat.state.result === 'victory' && imp.fled, 'the boss drops: victory, the minion flees');
    // with a minion: the suffix, gone once the minion is gone, and the fight goes on
    sb({ w: 9, h: 9, heroes: [H(1, 1)], enemies: [E(7, 7, 'test_boss'), E(6, 2)], objective: { type: 'boss' } });
    t.eq(DD.Combat.state.objective.text, WITH, 'a boss with a minion');
    DD.Act.kill(foe(1), hero());
    t.ok(text() === SOLO && !DD.Combat.state.result, 'the minion down: "' + DD.Combat.state.objective.text + '", the fight goes on');
    // a wave still coming counts: someone will be there to flee
    sb({ w: 9, h: 9, heroes: [H(1, 1)], enemies: [E(7, 7, 'test_boss')], objective: { type: 'boss' },
      reinforcements: [{ round: 3, enemies: [{ id: 'test_minion', n: 1 }], edge: 'E' }] });
    t.eq(DD.Combat.state.objective.text, WITH, 'a pending wave: the suffix');
    // a squad keeps its "(N left)" count
    sb({ w: 9, h: 9, heroes: [H(1, 1)], enemies: [E(7, 7, 'test_boss'), E(6, 2, 'test_brute')], objective: { type: 'boss', bossIds: ['test_boss', 'test_brute'] },
      encounter: { id: 'test_fights12_squad', shortName: 'The Test Squad' } });
    t.eq(DD.Combat.state.objective.text, 'Defeat the Test Squad (2 left)', 'a squad: unchanged');
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
    // V3.1 polish (render-ui QA HERO-1): a def's own preview entry says so (custom: true: the HUD leads with its text);
    // a dry run's entry never does
    t.eq(po && po.custom, true, 'preview() override entries carry custom: true');
    const dry = DD.Targeting.preview(h, h.basic, { x: g.x, y: g.y }).perUnit[g.id];
    t.ok(dry && dry.custom === undefined, 'a dry-run entry has no custom flag');
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
    s.g.hooks = { modifyOpportunity: function (o) { if (o.attacker.id === s.g.id) o.flat += 3; } };   // by id: previews dry-run copies
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
        if (DD.Act.simulating) return;   // dry runs (previews, AutoPlay) strike copies
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
      onOpportunityAttack: function () { if (!A.simulating) calls++; },   // the preview's dry run hears it too
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
    // lead's call (engine requests pass): picking up loot is not a floor effect — flyers pocket gold piles too
    p = flyerAndWalker(function (x, y) { A.placeObject(x, y, 'gold_pile'); }, { gold: 0 });
    stepOnto(p.f, 2, 1);
    const g1 = A.gold();
    t.ok(g1 >= 3 && g1 <= 6 && !tile(2, 1).obj, 'a flying hero swoops down on a gold pile (loot is no floor effect)');
    stepOnto(p.w, 2, 3);
    t.ok(A.gold() > g1 && !tile(2, 3).obj, '... a walking one pockets it as well');
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
    // rules run: a plain barrel is a breakable target now (it is hit, not set off)
    t.ok(Tg.validTargets(m, m.basic).filter(function (q) { return q.obj; }).every(function (q) { return !q.detonates && q.dmg === 4; }), 'a plain barrel is no detonation (rules run: it is hit for 4)');
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
    t.ok(logSince(n0, /takes a shot at the Explosive Barrel/) && logSince(n0, /KABOOM/), 'logged (shot, KABOOM)');
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

  // =====================================================================================================
  // engine requests (v2-digest §5 "Engine / rules"): honest AI estimates and reach, the approach field and the boxed-in
  // fallback, no walk / wind-up after a mid-turn stun, void taunts on charmed foes, objective_failed, log noise, barks
  // for the party in the fight, onDeathPrevented / onStatusRemoved, "this turn only", enterTile cause + from, clouds,
  // cones that stop at walls, loot for flyers (docs/notes/rules.md "Engine requests")
  // =====================================================================================================
  T.suite('engine: engine requests — AI estimates: flats after multipliers, takenFlat, estimate hooks, Frozen, charm / taunt', function (t) {
    const A = DD.Act, AI = DD.AI;
    // 1. an attack of opportunity's o.flat comes after the multipliers (Act.damage: round(amount × mult + flat))
    quiet({ w: 9, h: 9, heroes: [H(2, 4, 'test_knight')], enemies: [E(3, 4)], enemyAi: false });
    const k = hero(), g = foe();
    k.hooks = { modifyOpportunity: function (o) { if (o.attacker === k) o.flat += 7; } };
    A.addStatus(g, 'vulnerable', { turns: 3 });
    const est = AI.opportunityDmg(k, g, { x: 3, y: 4 });
    t.eq(est, 13, 'the slash (5) on a Vulnerable walker + 7: round(5 × 1.25) + 7 = 13, not round(12 × 1.25) = 15');
    const hp = g.hp;
    DD.AI.moveTo(g, 6, 4);
    t.eq(hp - g.hp, est, 'the real attack of opportunity deals what the estimate said (' + (hp - g.hp) + ')');
    // 2. estimate(..., flat): extra flats after the multipliers; hero-side charm / taunt like the real pipeline
    quiet({ w: 9, h: 9, heroes: [H(2, 4)], enemies: [E(3, 4), E(6, 6)], enemyAi: false });
    const m = hero(), g1 = foe(0), g2 = foe(1);
    A.addStatus(g1, 'vulnerable', { turns: 3 });
    t.eq(AI.estimate(g1, m, 4), 4, 'plain: the stab estimates 4 on the mage');
    t.eq(AI.estimate(m, g1, 4), 5, 'Vulnerable: round(4 × 1.25) = 5');
    A.addStatus(m, 'charmed', { turns: 1 }, g1);
    t.eq(AI.estimate(m, g1, 4), 0, 'a charmed hero can\'t hurt its charmer: 0 (as Act.damage)');
    A.removeStatus(m, 'charmed', { silent: true });
    A.addStatus(m, 'taunt', { turns: 1 }, g2);
    t.eq(AI.estimate(m, g1, 8), 5, 'a hero taunted by someone else deals half to the others: round(8 × 1.25 × 0.5) = 5');
    m.statuses = [];
    // 3. Frozen: physical hits ×1.5 (the real pipeline had it, the estimate did not)
    g1.statuses = [];
    A.addStatus(g1, 'frozen', { turns: 1 });
    const fe = AI.estimate(m, g1, 4);
    const fh = g1.hp;
    A.damage(m, g1, 4);
    t.ok(fe === 6 && fh - g1.hp === 6, 'Frozen: 4 → 6 in the estimate and in reality (' + fe + ' / ' + (fh - g1.hp) + ')');
    // 4. a status declaring takenFlat: the real pipeline applies it, the estimate reads it (number or function)
    withDefs('statuses', [
      { id: 'test_tmp_thick', name: 'Thick Skin', icon: '🪨', type: 'buff', takenFlat: -2, desc: 'Takes 2 less damage.' },
      { id: 'test_tmp_rage', name: 'Test Rage', icon: '🌋', type: 'buff', stacking: 'refresh',
        takenFlat: function (st, unit, d) { return d && d.cause === 'status' ? 0 : -(st.stacks || 1); }, desc: 'Takes less from hits.' },
    ], function () {
      quiet({ w: 9, h: 9, heroes: [H(2, 4)], enemies: [E(3, 4)], enemyAi: false });
      const mh = hero(), gg = foe();
      A.addStatus(mh, 'test_tmp_thick', { turns: 3 });
      t.eq(AI.estimate(gg, mh, 4), 2, 'takenFlat −2: the stab estimates 2');
      let h0 = mh.hp;
      A.damage(gg, mh, 4);
      t.eq(h0 - mh.hp, 2, '... and deals 2');
      mh.statuses = [];
      A.addStatus(mh, 'test_tmp_rage', { stacks: 3, turns: 3 });
      t.eq(AI.estimate(gg, mh, 4), 1, 'takenFlat(st, unit, d) → −stacks: 4 − 3 = 1 estimated');
      h0 = mh.hp;
      A.damage(gg, mh, 4);
      t.eq(h0 - mh.hp, 1, '... and dealt');
      h0 = mh.hp;
      A.damage(gg, mh, 4, { cause: 'status' });
      t.eq(h0 - mh.hp, 4, 'a function can leave some causes alone (a status tick: 4)');
      t.eq(AI.estimate(gg, mh, 2), 0, 'a flat that eats the whole hit: 0, never negative');
    });
    // 5. the pure query hooks estimateDealt (attacker's sources) / estimateTaken (target's own) mirror content hooks
    withTemp('items', [{ id: 'test_tmp_whet', name: 'Test Whetstone', slot: 'trinket', rarity: 'common', desc: 'Your basic attack deals +2 damage.',
      hooks: {
        modifyOutgoingDamage: function (d) { if (d.skill && d.source && d.source.basic && d.skill.id === d.source.basic.id) d.flat += 2; },
        estimateDealt: function (e) { if (e.skill && e.attacker.basic && e.skill.id === e.attacker.basic.id) e.flat += 2; },
      } }], function () {
      quiet({ w: 9, h: 9, heroes: [H(2, 4, 'test_knight', { items: ['test_tmp_whet'] })], enemies: [E(3, 4)], enemyAi: false });
      const kn = hero(), gg = foe();
      t.eq(AI.estimate(kn, gg, 5, null, false, 'test_slash'), 7, 'estimateDealt: the whetstone basic estimates 5 + 2');
      t.eq(AI.estimate(kn, gg, 5, null, false, 'test_shield_bash'), 5, '... another skill 5 (skill passed by id or def)');
      t.eq(AI.estimate(kn, gg, 5), 5, '... no skill named: no skill-only bonus');
      const h0 = gg.hp;
      DD.Combat.resolveSkill(kn, kn.basic, { x: 3, y: 4 }, {});
      t.eq(h0 - gg.hp, 7, 'the real slash deals 7');
      gg.hooks = { modifyIncomingDamage: function (d) { d.mult *= 0.5; }, estimateTaken: function (e) { e.mult *= 0.5; } };
      t.eq(AI.estimate(kn, gg, 8), 4, 'estimateTaken on the target\'s own sources: ×0.5');
      t.eq(AI.opportunityDmg(kn, gg, { x: 3, y: 4 }), 5, 'opportunityDmg too: round(5 × 0.5 + 2) = 5 (the whetstone is on the basic)');
    });
  });

  T.suite('engine: engine requests — reach estimates: sight past the walk, attacks of opportunity, canUse, windupOnly / fromStand, per-victim bonuses', function (t) {
    const AI = DD.AI;
    // 1. line of sight past the walk: the archer (walks 3, shoots 2-6 with sight) can't reach the mage behind a wall
    const wall = function (tl) { if (tl.x === 5 && tl.y >= 2 && tl.y <= 6) tl.t = 'wall'; };
    quiet({ w: 12, h: 9, heroes: [H(3, 4)], enemies: [E(10, 4, 'test_archer')], enemyAi: false, terrain: wall });
    let r = AI.reachOf(foe());
    t.ok(!r.tiles.has('3,4') && !r.units.has(hero().id), 'behind the wall: the arrow can\'t reach the mage (no tile it walks to sees her)');
    t.ok(r.tiles.get('6,1') > 0, 'in the open, in range after its walk: in reach');
    quiet({ w: 12, h: 9, heroes: [H(3, 4)], enemies: [E(10, 4, 'test_archer')], enemyAi: false });
    r = AI.reachOf(foe());
    t.ok(r.tiles.has('3,4') && r.units.get(hero().id) === 4, 'control: no wall, the mage is in reach (4)');
    // a lobbed rock (los: false) goes over walls
    quiet({ w: 12, h: 9, heroes: [H(3, 4)], enemies: [E(9, 4, 'test_mortar')], enemyAi: false, terrain: wall });
    t.ok(AI.reachOf(foe()).tiles.has('3,4'), 'a lob (target.los false) ignores the wall');
    // 2. attacks of opportunity: a walk that would drop it is not in its reach (it never walks into a lethal one)
    quiet({ w: 9, h: 9, heroes: [H(2, 4, 'test_knight'), H(6, 4)], enemies: [E(3, 4)], enemyAi: false });
    const g = foe();
    t.ok(AI.reachOf(g).tiles.has('6,4'), 'healthy: it may walk off the knight (one slash) and stab the mage');
    g.hp = 4;
    r = AI.reachOf(g);
    t.ok(!r.tiles.has('6,4') && r.tiles.has('2,4'), 'at 4 HP the knight\'s reaction (5) would drop it: only the knight is in reach');
    // 3. canUse, windupOnly (flag or tag 'windup'), fromStand
    withTemp('skills', [
      { id: 'test_tmp_corpse', name: 'Corpse Toss', owner: 'enemy', anchor: 'unit', levels: [{ dmg: 9 }], target: { type: 'unit', range: [1, 6], filter: 'enemy' },
        canUse: function (ctx) { return ctx.user.data.corpse ? true : 'Needs a corpse.'; }, execute: function () {} },
      { id: 'test_tmp_meteor', name: 'Slow Meteor', owner: 'enemy', anchor: 'ground', windupOnly: true, levels: [{ dmg: 20 }],
        target: { type: 'tile', range: [0, 12], filter: 'any', los: false }, area: { shape: 'circle', size: 1 }, execute: function (ctx) { DD.Act.damageTiles(ctx.user, ctx.tiles, ctx.L.dmg); } },
      { id: 'test_tmp_quake', name: 'Tagged Quake', owner: 'enemy', anchor: 'ground', tags: ['windup'], levels: [{ dmg: 20 }],
        target: { type: 'tile', range: [0, 12], filter: 'any', los: false }, execute: function () {} },
      { id: 'test_tmp_lunge', name: 'Standing Lunge', owner: 'enemy', anchor: 'unit', fromStand: true, levels: [{ dmg: 6 }],
        target: { type: 'unit', range: [1, 3], filter: 'enemy' }, execute: function (ctx) { if (ctx.targetUnit) DD.Act.damage(ctx.user, ctx.targetUnit, ctx.L.dmg); } },
      { id: 'test_tmp_slam', name: 'Wound-Up Slam', owner: 'enemy', anchor: 'unit', windupOnly: true, tags: ['melee'], levels: [{ dmg: 30 }],
        target: { type: 'unit', range: [1, 1], filter: 'enemy' }, execute: function () {} },
    ], function () {
      quiet({ w: 14, h: 9, heroes: [H(1, 4), H(12, 4, 'test_knight')], enemies: [E(6, 4)], enemyAi: false });
      const e = foe(), m = hero();
      e.skillSlots = [DD.Act.makeSlot('test_tmp_corpse', 1)];
      t.ok(!AI.reachOf(e).tiles.size, 'canUse says no ("Needs a corpse."): no reach at all');
      e.data.corpse = true;
      t.ok(AI.reachOf(e).tiles.has('1,4'), '... with a corpse it reaches the mage');
      e.skillSlots = [DD.Act.makeSlot('test_grunt_stab', 1), DD.Act.makeSlot('test_tmp_meteor', 1), DD.Act.makeSlot('test_tmp_quake', 1)];
      r = AI.reachOf(e);
      t.ok(r.best === 4 && !r.tiles.has('1,4') && !r.tiles.has('12,4'), 'windupOnly / tag windup: skipped (best 4, nothing 5+ tiles off)');
      t.ok(AI.windupOnly(DD.getSkill('test_tmp_meteor')) && AI.windupOnly(DD.getSkill('test_tmp_quake')) && !AI.windupOnly(DD.getSkill('test_grunt_stab')), 'AI.windupOnly reads the flag and the tag');
      const before = m.hp + hero(1).hp;
      const uses = countUses(function () { AI.act(e); });
      t.ok(!uses['test_grunt:test_tmp_meteor'] && !uses['test_grunt:test_tmp_quake'] && m.hp + hero(1).hp === before, 'the default turn never fires a wind-up-only skill at once (' + JSON.stringify(uses) + ')');
      const ba = AI.bestAttack(e, { skills: ['test_tmp_meteor'] });
      t.ok(!!ba && ba.skillId === 'test_tmp_meteor', 'a planner that names it (opts.skills) still gets a target for its wind-up');
      t.ok(DD.AI.api(e).canUse(e, 'test_tmp_meteor'), '... and api.canUse says it is ready');
      e.skillSlots = [DD.Act.makeSlot('test_tmp_slam', 1), DD.Act.makeSlot('test_grunt_stab', 1)];
      t.eq((DD.Act.opportunitySlot(e) || {}).id, 'test_grunt_stab', 'a wound-up melee slam is no attack of opportunity: the stab is');
      // fromStand: reach from its tile only, and the default turn doesn't walk first to use it
      quiet({ w: 14, h: 9, heroes: [H(1, 4)], enemies: [E(6, 4)], enemyAi: false });
      const l = foe();
      l.skillSlots = [DD.Act.makeSlot('test_tmp_lunge', 1)];
      r = AI.reachOf(l);
      t.ok(r.tiles.has('3,4') && !r.tiles.has('2,4') && !r.tiles.has('1,4'), 'fromStand: range 3 from where it stands (6 → 3), its walk not added');
      DD.getSkill('test_tmp_lunge').fromStand = false;
      t.ok(AI.reachOf(l).tiles.has('1,4'), 'control: the same skill without the flag reaches 3 + its move');
      DD.getSkill('test_tmp_lunge').fromStand = true;
      const lh = hero().hp, lx = l.x;
      AI.act(l);
      t.ok(hero().hp === lh, 'fromStand: the mage 5 tiles off is not lunged at after a walk');
      t.ok(l.x < lx, '... it walks toward her instead (' + lx + ' → ' + l.x + ')');
    });
    // 4. per-victim bonuses (a skill's telegraphFlat, read with an action aimed at that foe: Pack Tactics, webbed prey)
    withTemp('skills', [{ id: 'test_tmp_bully', name: 'Bully', owner: 'enemy', anchor: 'self', tags: ['melee'], levels: [{ dmg: 4 }],
      target: { type: 'unit', range: [1, 1], filter: 'enemy' },
      telegraphFlat: function (unit, intent) { const p = DD.AI.intentTarget(unit, intent); const v = p && DD.Grid.unitAt(p.x, p.y); return v && v.defId === 'test_mage' ? 3 : 0; },
      execute: function () {} }], function () {
      quiet({ w: 9, h: 9, heroes: [H(2, 2), H(6, 6, 'test_knight')], enemies: [E(4, 4)], enemyAi: false });
      const b = foe();
      b.skillSlots = [DD.Act.makeSlot('test_tmp_bully', 1)];
      r = AI.reachOf(b);
      t.ok(r.units.get(hero(0).id) === 7 && r.units.get(hero(1).id) === 4, 'the mage\'s number includes her +3 (7), the knight\'s does not (4)');
      t.ok(r.tiles.get('2,2') === 7 && r.tiles.get('6,6') === 4 && r.tiles.get('4,6') === 4, 'tiles: 7 under the mage, 4 elsewhere');
      const tm = DD.AI.threatMap('hero');
      t.ok(tm.get('2,2') && tm.get('2,2').max === 7, 'threatMap (HUD shading) carries it');
    });
    // 5. a charmed foe's taunt by a hero is void: no 'only'
    quiet({ w: 9, h: 9, heroes: [H(2, 4)], enemies: [E(3, 4), E(5, 4)], enemyAi: false });
    DD.Act.addStatus(foe(0), 'charmed', { turns: 1 }, hero());
    DD.Act.addStatus(foe(0), 'taunt', { turns: 1 }, hero());
    t.eq(AI.reachOf(foe(0)).only, null, 'a hero\'s taunt on an enemy charmed to the heroes\' side binds nothing (only: null)');
  });

  T.suite('engine: engine requests — the approach field, the boxed-in squeeze, no walk or wind-up after a mid-turn stun', function (t) {
    const A = DD.Act, AI = DD.AI;
    // 1. the approach field treats foes as walls: a downed hero in the doorway sends the grunt round the long way
    const door = function (tl) { if (tl.x === 4 && tl.y !== 1 && tl.y !== 7) tl.t = 'wall'; };
    quiet({ w: 9, h: 9, heroes: [H(1, 1), H(4, 1, 'test_knight')], enemies: [E(6, 1)], enemyAi: false, terrain: door });
    A.kill(hero(1), null, { force: true });
    const g = foe();
    t.ok(hero(1).downed, 'premise: the knight lies in the north doorway');
    AI.act(g);
    t.ok(g.y > 1 && !(g.x === 5 && g.y === 1), 'the grunt heads for the south door instead of parking at the body (' + g.x + ',' + g.y + ')');
    for (let i = 0; i < 8 && dist(g, hero(0)) > 1; i++) AI.act(g);
    t.eq(dist(g, hero(0)), 1, 'and gets to the mage the long way round');
    // 2. boxed in: no free route at all (a pocket whose only opening holds a downed hero) → it squeezes past the body
    const pocket = function (tl) { if ((tl.x === 2 && tl.y !== 1 && tl.y <= 2) || (tl.y === 2 && tl.x <= 2)) tl.t = 'wall'; };
    quiet({ w: 9, h: 9, heroes: [H(7, 1), H(2, 1, 'test_knight')], enemies: [E(1, 1)], enemyAi: false, terrain: pocket });
    A.kill(hero(1), null, { force: true });
    const b = foe();
    const n0 = DD.Combat.state.log.length;
    AI.act(b);
    t.ok(b.x >= 3 && b.y === 1, 'the grunt steps over the downed knight and out of the pocket (' + b.x + ',' + b.y + ')');
    t.ok(hero(1).x === 2 && hero(1).y === 1 && hero(1).downed && !DD.Combat.state.units.some(function (u) { return u !== hero(1) && !u.dead && u.x === 2 && u.y === 1; }),
      'the body stays put and nobody ends on it');
    t.ok(logSince(n0, /squeezes past the fallen/), 'the log says so');
    // control: a wall in the opening instead of a body → no way out, it waits
    quiet({ w: 9, h: 9, heroes: [H(7, 1)], enemies: [E(1, 1)], enemyAi: false, terrain: function (tl) { pocket(tl); if (tl.x === 2 && tl.y === 1) tl.t = 'wall'; } });
    AI.act(foe());
    t.ok(foe().x === 1 && foe().y === 1, 'control: walled in for real, it stays');
    // a custom planner that looks for something to do and finds nothing gets the same fallback
    withTemp('enemies', [{ id: 'test_tmp_idle', name: 'Idle Planner', act: 1, tier: 'normal', hp: 14, sprite: SPR, skills: ['test_grunt_stab'],
      ai: function (u, api) { api.bestAttack(u, { noMove: true }); /* nothing to do from here */ } }], function () {
      quiet({ w: 9, h: 9, heroes: [H(7, 1), H(2, 1, 'test_knight')], enemies: [E(1, 1, 'test_tmp_idle')], enemyAi: false, terrain: pocket });
      A.kill(hero(1), null, { force: true });
      AI.act(foe());
      t.ok(foe().x >= 3, 'a custom planner that looked and did nothing at all: squeezed out too (' + foe().x + ',' + foe().y + ')');
    });
    // [review] ...but a planner that returns at once on purpose (a statue "does nothing" that turn) is left alone
    withTemp('enemies', [{ id: 'test_tmp_statue', name: 'Test Statue', act: 1, tier: 'normal', hp: 14, sprite: SPR, skills: ['test_grunt_stab'],
      ai: function (u, api) { if (u.data.statue) return; api.defaultTurn(u); } }], function () {
      quiet({ w: 9, h: 9, heroes: [H(7, 1), H(2, 1, 'test_knight')], enemies: [E(1, 1, 'test_tmp_statue')], enemyAi: false, terrain: pocket });
      A.kill(hero(1), null, { force: true });
      foe().data.statue = true;
      AI.act(foe());
      t.ok(foe().x === 1 && foe().y === 1, 'review: a planner that returns at once (a statue turn) is not squeezed out (' + foe().x + ',' + foe().y + ')');
      foe().data.statue = false;
      AI.act(foe());
      t.ok(foe().x >= 3, '... the same planner asking for its turn squeezes out (' + foe().x + ',' + foe().y + ')');
    });
    // 3. a mid-turn stun (a peel slipped on during its own walk): no further walk, no wind-up (unstoppable ones aside)
    const rec = {};
    withDefs('objects', [{ id: 'test_tmp_peel', name: 'Test Peel', blocksMove: false, hp: 0, desc: 'Slippery.',
      onEnter: function (u) { A.addStatus(u, 'stun', { turns: 1 }, null); } }], function () {
      withTemp('enemies', [{ id: 'test_tmp_walker', name: 'Double Walker', act: 1, tier: 'elite', hp: 60, sprite: SPR, skills: ['test_boss_meteor'],
        ai: function (u, api) {
          rec.first = api.moveTo(u, u.x - 1, u.y);
          rec.second = api.moveTo(u, u.x - 1, u.y);
          rec.wind = api.windUp(u, 'test_boss_meteor', api.heroes()[0], {});
          rec.sure = api.windUp(u, 'test_boss_meteor', api.heroes()[0], { data: { unstoppable: true }, noCooldown: true });
        } }], function () {
        quiet({ w: 9, h: 9, noPlan: false, heroes: [H(1, 4)], enemies: [E(6, 4, 'test_tmp_walker')], objects: [{ x: 5, y: 4, id: 'test_tmp_peel' }] });
        const w = foe();
        DD.Combat.giveTurnTo(w);   // its own turn: the planner runs now
        t.ok(rec.first === true && w.x === 5 && has(w, 'stun'), 'premise: on its turn it walked onto the peel and slipped (stunned)');
        t.ok(rec.second === false && w.x === 5, 'api.moveTo refuses after the slip (it stays on 5,4)');
        t.ok(rec.wind === null, 'api.windUp refuses too (a stun-like during its own turn)');
        t.ok(!!rec.sure && w.intents.length === 1, '... except an unstoppable wind-up (content that must fire whatever its state)');
        rec.wind = 'unset';
        t.ok(!!AI.windUp(w, 'test_boss_meteor', hero(), { noCooldown: true }), 'outside its turn (scripted content) a wind-up is still recorded: the stun interrupts it when it would land');
        AI.clearIntents(w, false);
        t.ok(!AI.moveTo(w, 4, 4) && w.x === 5, 'DD.AI.moveTo refuses a stunned unit');
        A.removeStatus(w, 'stun', { silent: true });
        A.addStatus(w, 'sheep', { turns: 1 });
        t.ok(!AI.moveTo(w, 4, 4) && w.x === 5, '... and a sheep (it only strolls on its own turn)');
      });
    });
  });

  T.suite('engine: engine requests — a taunt on a charmed foe is void; objective_failed; log noise; barks name only heroes in the fight', function (t) {
    const A = DD.Act, AI = DD.AI;
    // 1. a hero's Taunt on an enemy charmed to the heroes' side wastes nothing: it still fights its old friends
    quiet({ w: 9, h: 9, heroes: [H(1, 4, 'test_knight')], enemies: [E(3, 4), E(4, 4)], enemyAi: false });
    const c = foe(0), f = foe(1);
    A.addStatus(c, 'charmed', { turns: 1 }, hero());
    A.addStatus(c, 'taunt', { turns: 1 }, hero());
    t.ok(AI.activeTaunter(c) === null && AI.taunter(c) === hero(), 'AI.activeTaunter: the taunter is no foe of the charmed grunt now (void)');
    t.ok(AI.targetsFor(c).indexOf(f) >= 0, 'its targets are its old friends');
    const kh = hero().hp;
    AI.act(c);
    t.ok(f.hp === 10 && hero().hp === kh, 'it stabs its friend (14 → ' + f.hp + '), not the knight');
    // 2. Combat.finish: a lost objective with heroes standing narrates objective_failed; a TPK narrates defeat
    const keys = [];
    const narrate = A.narrate;
    A.narrate = function (key) { keys.push(key); return ''; };
    try {
      sb({ heroes: [H(1, 1)], enemies: [E(7, 7)], objective: { type: 'protect', objId: 'keg' }, objects: [{ x: 3, y: 3, id: 'keg' }] });
      A.damageObject(foe(), 3, 3, 99);
      t.ok(DD.Combat.state.result === 'defeat' && keys.indexOf('objective_failed') >= 0 && keys.indexOf('defeat') < 0, 'keg lost, mage standing: objective_failed (' + keys.join(',') + ')');
      keys.length = 0;
      sb({ heroes: [H(1, 1)], enemies: [E(2, 1)] });
      A.kill(hero(), foe(), { force: true });
      t.ok(DD.Combat.state.result === 'defeat' && keys.indexOf('defeat') >= 0 && keys.indexOf('objective_failed') < 0, 'everybody down: defeat (' + keys.join(',') + ')');
    } finally { A.narrate = narrate; }
    // 3. log noise: wading through water logs "is Wet" once; the ignition line names the surface, not its id
    quiet({ w: 9, h: 9, heroes: [H(1, 4)], enemies: [E(8, 8)], enemyAi: false, terrain: function (tl) { if (tl.y === 4 && tl.x >= 2 && tl.x <= 5) tl.t = 'water'; } });
    const m = hero();
    let n0 = DD.Combat.state.log.length;
    A.moveAlong(m, [{ x: 2, y: 4 }, { x: 3, y: 4 }, { x: 4, y: 4 }, { x: 5, y: 4 }], { action: false });
    const wets = DD.Combat.state.log.slice(n0).filter(function (l) { return /is Wet/.test(l.text); }).length;
    t.ok(has(m, 'wet') && wets === 1, 'four water tiles: Wet, logged once (' + wets + ')');
    A.addStatus(m, 'wet', { turns: 9 });
    t.eq(DD.Combat.state.log.slice(n0).filter(function (l) { return /is Wet/.test(l.text); }).length, 2, 'a longer Wet is news: logged again');
    quiet({ w: 9, h: 9, heroes: [H(1, 1)], enemies: [E(8, 8)], enemyAi: false });
    [2, 3, 4].forEach(function (x) { A.setSurface(x, 6, 'oil', 3); });
    n0 = DD.Combat.state.log.length;
    A.applyElement(2, 6, 'fire', hero());
    const line = DD.Combat.state.log.slice(n0).filter(function (l) { return /line of flames/.test(l.text); })[0];
    t.ok(line && /The Oil Slick goes up/.test(line.text) && !/\boil\b/.test(line.text), 'the chain line names the Oil Slick (' + (line && line.text) + ')');
    // 4. barks: a line naming a hero who is not in this fight is never picked
    quiet({ w: 9, h: 9, heroes: [H(1, 1), H(2, 1, 'test_knight')], enemies: [E(8, 8)], enemyAi: false });
    const lines = ['Shady, where are you?', 'Testsalot, hold the line!', 'Nobody named here.', 'Shadyish weather.'];
    t.eq(A.partyLines(lines).join(' | '), 'Testsalot, hold the line! | Nobody named here. | Shadyish weather.', 'Act.partyLines drops the line naming Shady McTest (not here); whole words only');
    const def = DD.getHero('test_mage'), saved = def.barks;
    def.barks = Object.assign({}, saved, { kill: ['Shady, look at this!', 'Sir Testsalot, look at this!'], victory: 'Shady would have loved this.' });
    try {
      let shady = 0, said = 0;
      for (let i = 0; i < 30; i++) { const s = A.bark(hero(0), 'kill'); if (s) said++; if (/Shady/.test(s)) shady++; }
      t.ok(said === 30 && shady === 0, 'Act.bark never says the Shady line without Shady (' + shady + ' / ' + said + ')');
      t.eq(A.bark(hero(0), 'victory'), '', 'a single-line bark naming an absent hero stays silent');
      quiet({ w: 9, h: 9, heroes: [H(1, 1), H(2, 1, 'test_rogue')], enemies: [E(8, 8)], enemyAi: false });
      let seen = false;
      for (let i = 0; i < 40 && !seen; i++) seen = /Shady/.test(A.bark(hero(0), 'kill'));
      t.ok(seen && /Shady/.test(A.bark(hero(0), 'victory')), 'with Shady in the fight the lines come back');
    } finally { def.barks = saved; }
  });

  T.suite('engine: engine requests — onDeathPrevented, onStatusRemoved / onRemove, thisTurn / fresh: false, enterTile cause + from, clouds, cones, loot', function (t) {
    const A = DD.Act, G = DD.Grid;
    // 1. onDeathPrevented: the unit's sources hear a refused death at once, with the HP it kept
    quiet({ w: 9, h: 9, heroes: [H(1, 1)], enemies: [E(2, 1)], enemyAi: false });
    const g = foe();
    const heard = [];
    g.hooks = { preventDeath: function () { return true; }, onDeathPrevented: function (u, d) { heard.push({ hp: u.hp, prevented: d.prevented }); } };
    A.damage(hero(), g, 99);
    t.ok(heard.length === 1 && heard[0].hp === 1 && heard[0].prevented && !g.dead, 'damage: refused, heard with 1 HP');
    g.hp = 9;
    A.kill(g, hero());
    t.ok(heard.length === 2 && heard[1].hp === 9 && g.hp === 9, 'an instant kill refused: heard with the HP it had (9)');
    // 2. onStatusRemoved (unit's sources) + the status def's onRemove, with the reason
    const gone = [];
    withDefs('statuses', [{ id: 'test_tmp_form', name: 'Test Form', icon: '🐺', type: 'buff', desc: 'A form.',
      onRemove: function (unit, st, why) { gone.push('def:' + st.id + ':' + why); } }], function () {
      quiet({ w: 9, h: 9, heroes: [H(1, 1)], enemies: [E(8, 8)], enemyAi: false });
      const m = hero();
      m.hooks = { onStatusRemoved: function (u, st, why) { gone.push('hook:' + st.id + ':' + why + ':' + (A.hasStatus(u, st.id) ? 'still' : 'gone')); } };
      A.addStatus(m, 'test_tmp_form', { turns: -1 });
      A.removeStatus(m, 'test_tmp_form');
      t.eq(gone.join(' '), 'def:test_tmp_form:removed hook:test_tmp_form:removed:gone', 'removeStatus: onRemove, then the hook (the status already gone)');
      gone.length = 0;
      A.addStatus(m, 'weak', { turns: 3 }); A.addStatus(m, 'slow', { turns: 3 });
      A.cleanse(m, 'debuff');
      t.eq(gone.slice().sort().join(' '), 'hook:slow:cleansed:gone hook:weak:cleansed:gone', 'cleanse: each one, reason cleansed');
      gone.length = 0;
      A.addStatus(m, 'inspired', { turns: 1, fresh: false });
      endOwnTurn(m);
      t.eq(gone.join(' '), 'hook:inspired:expired:gone', 'decay at its turn end: reason expired');
    });
    // 3. addStatus { thisTurn } / { fresh: false } during the owner's own turn
    quiet({ w: 9, h: 9, heroes: [H(1, 1)], enemies: [E(8, 8)], enemyAi: false });
    const m = hero();
    DD.Combat.giveTurnTo(m);
    A.addStatus(m, 'inspired', { thisTurn: true });
    A.addStatus(m, 'haste', { turns: 1 });
    A.addStatus(m, 'thorns', { stacks: 2, turns: 2, fresh: false });
    t.ok(A.getStatus(m, 'inspired').turns === 1 && !A.getStatus(m, 'inspired').fresh && A.getStatus(m, 'haste').fresh, 'thisTurn = 1 turn, not fresh');
    DD.Combat.endTurn();
    t.ok(!has(m, 'inspired') && has(m, 'haste') && A.getStatus(m, 'thorns').turns === 1, 'end of that turn: the thisTurn one is gone, turns: 1 stays, fresh: false lost a turn');
    // 4. enterTile passes (cause, from) to object, surface and terrain onEnter
    const calls = [];
    withDefs('objects', [{ id: 'test_tmp_mat', name: 'Welcome Mat', blocksMove: false, hp: 0, desc: 'Says hi.',
      onEnter: function (u, o, tile, cause, from) { calls.push('obj ' + cause + ' ' + (from ? from.x + ',' + from.y : '-')); } }], function () {
      withDefs('surfaces', [{ id: 'test_tmp_goo', name: 'Goo', color: 'rgba(0,0,0,0.2)', turns: 5, desc: 'Gooey.',
        onEnter: function (u, tile, cause, from) { calls.push('surf ' + cause + ' ' + (from ? from.x + ',' + from.y : '-')); } }], function () {
        quiet({ w: 9, h: 9, heroes: [H(1, 1)], enemies: [E(8, 8)], enemyAi: false, objects: [{ x: 2, y: 1, id: 'test_tmp_mat' }, { x: 5, y: 1, id: 'test_tmp_mat' }] });
        A.setSurface(3, 1, 'test_tmp_goo', 5);
        const h = hero();
        A.moveAlong(h, [{ x: 2, y: 1 }, { x: 3, y: 1 }], { action: false });
        A.push(null, h, { x: 1, y: 0 }, 2);
        A.teleport(h, 2, 1);
        t.eq(calls.join(' | '), 'obj move 1,1 | surf move 2,1 | obj push 4,1 | obj teleport 5,1', 'walk / push / teleport: cause and the tile it came from (' + calls.join(' | ') + ')');
      });
    });
    // 5. clouds: `cloud: true` (or airborne) — touches flyers, hangs over pits; every core cloud has both flags
    withDefs('surfaces', [{ id: 'test_tmp_mist', name: 'Test Mist', color: 'rgba(220,220,255,0.4)', turns: 2, cloud: true, blocksLos: true, desc: 'A cloud.' }], function () {
      quiet({ w: 9, h: 9, heroes: [H(1, 1)], enemies: [E(8, 8)], enemyAi: false });
      setT(3, 3, 'pit');
      t.ok(G.isCloud('test_tmp_mist') && G.isCloud(DD.getSurface('steam')) && !G.isCloud('fire'), 'Grid.isCloud: cloud: true, airborne, not fire');
      t.ok(A.setSurface(3, 3, 'test_tmp_mist', 2) && G.feelsSurface(flyer(hero()), tile(3, 3).surface), 'a cloud: true mist hangs over a pit and touches flyers');
      t.ok(['steam', 'smoke'].every(function (id) { const d = DD.getSurface(id); return d.cloud === true && d.airborne === true; }), 'core clouds carry both flags (normalised at load)');
    });
    // 6. cones stop at walls (no breath round corners), lines already did
    quiet({ w: 9, h: 9, heroes: [H(1, 4)], enemies: [E(8, 8)], enemyAi: false });
    const open = G.shape('cone', null, { x: 1, y: 0 }, 3, hero());
    t.eq(open.length, 9, 'control: an open cone of 3 is 1 + 3 + 5 tiles');
    [3, 4, 5].forEach(function (y) { setT(3, y, 'wall'); });
    t.eq(keys(G.shape('cone', null, { x: 1, y: 0 }, 3, hero())), '2,4', 'a wall across rows 2: only the first tile, nothing behind it');
    quiet({ w: 9, h: 9, heroes: [H(1, 4)], enemies: [E(8, 8)], enemyAi: false });
    A.placeObject(3, 4, 'pillar');
    const shade = G.shape('cone', null, { x: 1, y: 0 }, 3, hero()).map(function (p) { return p.x + ',' + p.y; });
    t.ok(shade.length === 7 && shade.indexOf('3,4') < 0 && shade.indexOf('4,4') < 0 && shade.indexOf('3,3') >= 0 && shade.indexOf('4,3') >= 0,
      'a pillar in row 2 shadows itself and the tile straight behind it, the rest burns (' + shade.join(' ') + ')');
    // 7. loot: flyers pick it up (gold piles; any object or instance flagged loot), nothing else on the floor
    withDefs('objects', [{ id: 'test_tmp_coin', name: 'Shiny Coin', blocksMove: false, hp: 0, loot: true, desc: 'Shiny.',
      onEnter: function (u, o, tile) { A.addStatus(u, 'inspired', { turns: 1 }); A.removeObject(tile.x, tile.y); } },
    { id: 'test_tmp_tack', name: 'Thumbtack', blocksMove: false, hp: 0, desc: 'Ow.', onEnter: function (u) { A.damage(null, u, 2, { cause: 'terrain' }); } }], function () {
      quiet({ w: 9, h: 9, heroes: [H(1, 1)], enemies: [E(8, 8)], enemyAi: false, objects: [{ x: 2, y: 1, id: 'test_tmp_coin' }, { x: 3, y: 1, id: 'test_tmp_tack' },
        { x: 4, y: 1, id: 'test_tmp_tack', loot: true }] });
      const fl = flyer(hero()), h0 = fl.hp;
      t.ok(G.isLoot(tile(2, 1).obj) && !G.isLoot(tile(3, 1).obj) && G.isLoot(tile(4, 1).obj), 'Grid.isLoot: the def flag, or the instance\'s');
      A.moveAlong(fl, [{ x: 2, y: 1 }, { x: 3, y: 1 }, { x: 4, y: 1 }], { action: false });
      t.ok(has(fl, 'inspired') && !tile(2, 1).obj, 'the flyer swoops on the loot');
      t.eq(h0 - fl.hp, 2, '... floats over the plain tack, and an instance flagged loot is "picked up" (2)');
    });
  });

  // ---- rules run (user requests): moving through allies, swapping places, breaking objects -----------------------
  /** A 1-wide corridor along row y = 2 (everything else is wall). */
  function corridor(tl) { return tl.y === 2 ? null : { t: 'wall' }; }
  function pathKeys(e) { return e ? e.path.map(function (p) { return p.x + ',' + p.y; }).join(' ') : 'none'; }

  T.suite('engine: rules run — both sides move through their own side and never end on a unit (corridors, doorways, height, objects, hazards)', function (t) {
    const G = DD.Grid, C = DD.Combat, AI = DD.AI;
    // 1. a corridor: the mage walks through the knight and the cleric
    quiet({ w: 9, h: 5, terrain: corridor, heroes: [H(1, 2), H(2, 2, 'test_knight'), H(3, 2, 'test_cleric')], enemies: [E(8, 2)], enemyAi: false });
    let m = hero(0);
    const k = hero(1), c = hero(2);
    t.eq(cur(), m, 'the mage\'s turn');
    let r = C.reachable(m);
    t.eq(pathKeys(r.get('5,2')), '2,2 3,2 4,2 5,2', 'corridor: the only way to 5,2 crosses the knight and the cleric (move 4)');
    t.ok(!r.has('2,2') && !r.has('3,2'), 'an ally\'s tile is never a destination');
    t.ok(!C.move(m, 2, 2) && !C.move(m, 3, 2) && m.x === 1 && m.ap === 3, 'Combat.move refuses an ally\'s tile (nothing spent)');
    t.ok(C.move(m, 5, 2) && m.x === 5 && m.y === 2 && m.ap === 2, 'walked through both (one move action)');
    t.ok(G.unitAt(2, 2) === k && G.unitAt(3, 2) === c && k.x === 2 && c.x === 3, 'the allies stay put, alone on their tiles');
    t.ok(C.canUndo() && C.undo() && m.x === 1 && m.ap === 3, 'a clean walk through allies can be undone');
    // 2. enemies do the same through enemies, and nobody walks through a foe
    quiet({ w: 9, h: 5, terrain: corridor, heroes: [H(0, 2)], enemies: [E(5, 2), E(6, 2), E(7, 2)], enemyAi: false });
    const back = foe(2);
    r = G.reachable(back, back.mov, { aoo: true });
    t.eq(pathKeys(r.get('4,2')), '6,2 5,2 4,2', 'enemies: the rear grunt\'s way to 4,2 crosses both friends');
    t.ok(!r.has('5,2') && !r.has('6,2'), '... never ending on one');
    t.ok(AI.moveTo(back, 4, 2) && back.x === 4 && foe(0).x === 5 && foe(1).x === 6, 'AI.moveTo walks it through');
    m = hero();
    r = C.reachable(m);
    t.ok(r.has('3,2') && !r.has('5,2') && !r.has('6,2') && !r.has('7,2'), 'a hero never walks through a foe (' + Array.from(r.keys()).join(' ') + ')');
    t.ok(!G.reachable(foe(0), 3).has('3,2') || pathKeys(G.reachable(foe(0), 3).get('3,2')).indexOf('4,2') >= 0, 'the front grunt reaches 3,2 only through its friend on 4,2');
    // the AI's own turn: the rear grunt walks through its friend to stab the knight at the end of the corridor
    quiet({ w: 9, h: 5, terrain: corridor, heroes: [H(1, 2, 'test_knight')], enemies: [E(4, 2), E(5, 2)], enemyAi: false });
    const kn = hero(), front = foe(0), rear = foe(1), kh = kn.hp;
    kn.block = 0;
    DD.AI.act(rear);
    t.ok(rear.x === 2 && rear.y === 2 && front.x === 4, 'its default turn walks the rear grunt through its friend to the only tile next to the knight');
    t.ok(kn.hp < kh, '... and it stabs (' + kh + ' → ' + kn.hp + ')');
    // 3. a doorway: a wall at x = 4 with one gap, an ally standing in it
    const door = function (tl) { return tl.x === 4 && tl.y !== 4 ? { t: 'wall' } : null; };
    quiet({ w: 9, h: 9, terrain: door, heroes: [H(2, 4, 'test_summoner'), H(4, 4, 'test_knight')], summons: [{ id: 'test_hound', x: 3, y: 4, owner: 'test_summoner' }],
      enemies: [E(8, 8)], enemyAi: false });
    const su = hero(0), hound = DD.Combat.units().filter(function (u) { return u.defId === 'test_hound'; })[0];
    t.ok(hound && C.isTurnOf(hound), 'the hound acts on the summoner\'s turn');
    r = C.reachable(hound);
    t.eq(pathKeys(r.get('6,4')), '4,4 5,4 6,4', 'doorway: the hound (a hero-side summon) walks through the knight in the gap');
    t.eq(pathKeys(C.reachable(su).get('5,4')), '3,4 4,4 5,4', '... the summoner through the hound and the knight');
    t.ok(C.move(hound, 6, 4) && C.move(su, 5, 4) && G.unitAt(4, 4) === hero(1), 'both through the doorway; the knight still holds it');
    quiet({ w: 9, h: 9, terrain: door, heroes: [H(1, 1)], enemies: [E(4, 4), E(6, 4)], enemyAi: false });
    t.ok(AI.moveTo(foe(1), 3, 4) && foe(1).x === 3 && foe(0).x === 4, 'enemies through their friend in a doorway too');
    quiet({ w: 9, h: 9, terrain: door, heroes: [H(2, 4)], enemies: [E(4, 4)], enemyAi: false });
    t.ok(!Array.from(C.reachable(hero()).keys()).some(function (kk) { return +kk.split(',')[0] > 4; }), 'a foe in the gap shuts the door for the heroes');
    // 4. height: an ally on a step 1 up is walked over; 2 up is a cliff with or without the ally
    quiet({ w: 9, h: 5, terrain: corridor, heroes: [H(1, 2), H(2, 2, 'test_knight')], enemies: [E(8, 2)], enemyAi: false });
    tile(2, 2).h = 1;
    m = hero(0);
    t.eq(pathKeys(C.reachable(m).get('4,2')), '2,2 3,2 4,2', 'height: up onto the knight\'s step (cost 2) and down again: 4,2 within move 4');
    tile(2, 2).h = 2;
    t.ok(!C.reachable(m).has('3,2'), 'two levels up: no way past');
    hero(1).x = 7;
    t.ok(!C.reachable(m).has('3,2'), '... and none without the knight either (the cliff blocks, not the ally)');
    // 5. objects: an ally on a plate (the walker presses it passing: a side effect, no Undo), on bones (no effect), a crate
    quiet({ w: 9, h: 5, terrain: corridor, heroes: [H(1, 2), H(2, 2, 'test_knight')], enemies: [E(8, 2)], enemyAi: false,
      objects: [{ x: 2, y: 2, id: 'pressure_plate' }] });
    m = hero(0);
    const plate = tile(2, 2).obj;
    t.ok(C.move(m, 4, 2) && m.x === 4 && plate.data.count === 1, 'walking through the knight on a plate presses it once (the walker\'s step)');
    t.ok(!C.canUndo(), '... a side effect: that move can\'t be undone');
    quiet({ w: 9, h: 5, terrain: corridor, heroes: [H(1, 2), H(2, 2, 'test_knight')], enemies: [E(8, 2)], enemyAi: false, objects: [{ x: 2, y: 2, id: 'bones' }, { x: 5, y: 2, id: 'crate' }] });
    m = hero(0);
    r = C.reachable(m);
    t.ok(r.has('4,2') && !r.has('5,2') && !r.has('6,2'), 'bones under the knight change nothing; a crate still blocks the corridor');
    t.ok(C.move(m, 4, 2) && C.canUndo(), 'a walk through an ally on bones keeps Undo');
    // 6. hazards: the ally stands in fire in the corridor (the only way): the walker crosses it and burns; in the open it goes round
    quiet({ w: 9, h: 5, terrain: corridor, heroes: [H(1, 2), H(2, 2, 'test_knight')], enemies: [E(8, 2)], enemyAi: false,
      surfaces: [{ x: 2, y: 2, id: 'fire', turns: 3 }] });
    m = hero(0);
    const e6 = C.reachable(m).get('4,2');
    t.ok(e6 && e6.hazard === 'fire', 'the path through the burning knight is flagged (hazard: fire)');
    t.ok(C.move(m, 4, 2) && has(m, 'burn') && m.x === 4, 'crossing it: Burn, as for any walker');
    quiet({ w: 9, h: 9, heroes: [H(1, 4), H(2, 4, 'test_knight')], enemies: [E(8, 8)], enemyAi: false, surfaces: [{ x: 2, y: 4, id: 'fire', turns: 3 }] });
    const e6b = C.reachable(hero(0)).get('4,3');
    t.ok(e6b && !e6b.hazard && e6b.path.every(function (p) { return !(p.x === 2 && p.y === 4); }), 'in the open the path goes round the burning ally (' + pathKeys(e6b) + ')');
    // 7. rooted on the ally's tile (a web under the knight): the walker stops there and is moved off (never shares a tile)
    quiet({ w: 9, h: 5, terrain: corridor, heroes: [H(1, 2), H(2, 2, 'test_knight')], enemies: [E(8, 2)], enemyAi: false,
      surfaces: [{ x: 2, y: 2, id: 'web', turns: 3 }] });
    m = hero(0);
    t.ok(C.move(m, 4, 2) && has(m, 'root'), 'the web roots the walker on the knight\'s tile');
    t.ok(!(m.x === 2 && m.y === 2) && dist(m, { x: 2, y: 2 }) === 1 && G.unitAt(2, 2) === hero(1), 'it is moved off to a free tile next to it (' + m.x + ',' + m.y + ')');
    // 8. attacks of opportunity: the only way passes a friend next to a foe; the stab is aimed at the walker
    quiet({ w: 9, h: 5, terrain: function (tl) { return tl.y === 2 || (tl.x === 2 && tl.y === 3) ? null : { t: 'wall' }; },
      heroes: [H(1, 2), H(2, 2, 'test_knight')], enemies: [E(2, 3)], enemyAi: false });
    m = hero(0);
    const kk = hero(1), kh0 = kk.hp, mh0 = m.hp;
    const e8 = C.reachable(m).get('4,2');
    t.ok(e8 && e8.provokes.length === 1 && e8.provokes[0] === foe().id, 'the walk through the knight (next to the grunt) provokes it once');
    C.move(m, 4, 2);
    t.ok(m.x === 4 && m.hp === mh0 - 4 && kk.hp === kh0, 'the stab lands on the walker, never on the ally it passed');
    // 9. flyers pass over allies the same way
    quiet({ w: 9, h: 5, terrain: corridor, heroes: [H(1, 2), H(2, 2, 'test_knight')], enemies: [E(8, 2)], enemyAi: false });
    m = hero(0);
    m.flags = Object.assign({}, m.flags, { flying: true });
    t.eq(pathKeys(C.reachable(m).get('5,2')), '2,2 3,2 4,2 5,2', 'a flyer through its ally too');
  });

  T.suite('engine: rules run — swap places with an adjacent ally (the move, its cost, who can, undo)', function (t) {
    const G = DD.Grid, C = DD.Combat;
    quiet({ w: 9, h: 9, heroes: [H(2, 4), H(3, 4, 'test_knight'), H(2, 5, 'test_cleric')], enemies: [E(8, 8)], enemyAi: false });
    const m = hero(0), k = hero(1), c = hero(2);
    t.eq(cur(), m, 'the mage\'s turn');
    const list = C.swapTargets(m).map(function (s) { return s.name + '@' + s.x + ',' + s.y; }).sort().join(' ');
    t.eq(list, 'Father Unittest@2,5 Sir Testsalot@3,4', 'swapTargets: the adjacent allies');
    const info = C.swapInfo(m, 3, 4);
    t.ok(info.ok === true && info.unitId === k.id && info.ap === 1 && info.provokes.length === 0 && info.hazard === null && info.allyHazard === null,
      'swapInfo: ok, 1 AP (a move), no attacks of opportunity, no hazards');
    t.ok(C.canSwap(m, 3, 4) === true && C.swapInfo(m, 5, 5) === null && typeof C.canSwap(m, 5, 5) === 'string', 'canSwap; nothing to swap with on an empty tile');
    t.eq(C.swapInfo(m, 4, 4), null, 'not adjacent: no swap');
    const kAp = k.ap, n0 = DD.Combat.state.log.length;
    t.ok(C.swap(m, 3, 4), 'Combat.swap');
    t.ok(m.x === 3 && m.y === 4 && k.x === 2 && k.y === 4, 'they traded tiles');
    t.ok(m.ap === 2 && k.ap === kAp, 'the mover paid a move (1 AP); the ally paid nothing');
    t.ok(logSince(n0, /Wizzy McTest swaps places with Sir Testsalot\./), 'logged');
    t.ok(C.canUndo(), 'a clean swap can be undone');
    t.ok(C.undo() && m.x === 2 && k.x === 3 && m.ap === 3, 'Undo puts both back and refunds the AP');
    t.ok(!C.canUndo(), '... once');
    // swaps chain like moves: swap, walk on, swap again
    t.ok(C.swap(m, 3, 4) && C.move(m, 4, 5) && m.x === 4 && m.ap === 1, 'a swap, then a walk (2 moves)');
    // the ally keeps its own turn: full AP when it comes
    DD.Combat.endTurn();
    t.ok(cur() === k && k.ap === 3, 'the knight\'s own turn comes with its full AP (' + k.ap + ')');
    // a hero-side summon swaps on its owner's turn; a hero swaps with a summon
    quiet({ w: 9, h: 9, heroes: [H(2, 4, 'test_summoner'), H(5, 5, 'test_knight')], summons: [{ id: 'test_hound', x: 3, y: 4, owner: 'test_summoner' }],
      enemies: [E(8, 8)], enemyAi: false });
    const su = hero(0), hound = DD.Combat.units().filter(function (u) { return u.defId === 'test_hound'; })[0];
    const hAp = hound.ap;
    t.ok(C.swap(hound, 2, 4) && hound.x === 2 && su.x === 3 && hound.ap === hAp - 1, 'the hound swaps with its summoner (its own move AP)');
    t.ok(C.swap(su, 2, 4) && su.x === 2 && hound.x === 3, 'and the summoner swaps back with the hound');
    // enemies never swap
    quiet({ w: 9, h: 9, heroes: [H(1, 1)], enemies: [E(4, 4), E(5, 4)], enemyAi: false });
    t.ok(C.swapInfo(foe(0), 5, 4) === null && !C.swap(foe(0), 5, 4) && foe(0).x === 4, 'an enemy has no swap (swapInfo null, Combat.swap refuses)');
    t.ok(C.swapInfo(hero(), 4, 4) === null, '... and a hero never swaps with a foe');
  });

  T.suite('engine: rules run — swap: who can\'t (downed, stunned, rooted, immovable, cliffs, pits, AP, turn)', function (t) {
    const G = DD.Grid, C = DD.Combat, A = DD.Act;
    function scene() {
      quiet({ w: 9, h: 9, heroes: [H(2, 4), H(3, 4, 'test_knight'), H(8, 0, 'test_cleric')], enemies: [E(8, 8)], enemyAi: false });
      return { m: hero(0), k: hero(1) };
    }
    function why(s) { const r = C.canSwap(s.m, 3, 4); return r === true ? 'ok' : r; }
    let s = scene();
    s.k.hp = 0; s.k.downed = true;
    t.ok(/Help Up/.test(why(s)) && !C.swap(s.m, 3, 4), 'a downed ally: no swap (' + why(s) + ')');
    s = scene(); A.addStatus(s.k, 'stun', { turns: 1 });
    t.ok(/won't budge/.test(why(s)), 'a stunned ally (' + why(s) + ')');
    s = scene(); A.addStatus(s.k, 'sleep', { turns: 1 });
    t.ok(why(s) !== 'ok', 'an asleep (stun-like) ally');
    s = scene(); A.addStatus(s.k, 'root', { turns: 1 });
    t.ok(/stuck/.test(why(s)), 'a rooted ally (' + why(s) + ')');
    s = scene(); s.k.flags = Object.assign({}, s.k.flags, { immovable: true });
    t.ok(/immovable/.test(why(s)), 'an immovable ally (' + why(s) + ')');
    s = scene(); A.addStatus(s.m, 'root', { turns: 1 });
    t.ok(/move/i.test(why(s)) && !C.swap(s.m, 3, 4), 'a rooted mover (' + why(s) + ')');
    s = scene(); A.addStatus(s.m, 'stun', { turns: 1 });
    t.eq(why(s), 'Stunned!', 'a stunned mover');
    s = scene(); s.m.ap = 0;
    t.eq(why(s), 'Not enough AP.', 'no AP for a move');
    s = scene(); A.addStatus(s.m, 'confused', { turns: 1 }); s.m.ap = 1;
    t.eq(why(s), 'Not enough AP.', 'a Confused mover needs 2 AP for a move, and so for a swap');
    s = scene(); DD.Combat.giveTurnTo(s.k);
    t.ok(/turn/.test(C.canSwap(s.m, 3, 4)), 'not the mover\'s turn (' + C.canSwap(s.m, 3, 4) + ')');
    t.ok(C.canSwap(s.k, 2, 4) === true, '... while the knight, on his turn, can swap with the mage');
    // the immovable turret summon
    quiet({ w: 9, h: 9, heroes: [H(2, 4, 'test_summoner')], summons: [{ id: 'test_turret', x: 3, y: 4, owner: 'test_summoner' }], enemies: [E(8, 8)], enemyAi: false });
    t.ok(/immovable/.test(C.canSwap(hero(), 3, 4)), 'an immovable summon (the turret)');
    // heights: one level either way is fine; two up is a cliff for whoever has to climb it
    s = scene(); tile(3, 4).h = 1;
    t.ok(why(s) === 'ok', 'the knight one level up: fine both ways');
    s = scene(); tile(3, 4).h = 2;
    t.ok(/Wizzy McTest can't stand there/.test(why(s)), 'the knight 2 up: the mage can\'t climb there (' + why(s) + ')');
    s = scene(); tile(2, 4).h = 2;
    t.ok(/Sir Testsalot can't stand there/.test(why(s)), 'the mage 2 up: the knight can\'t climb there (' + why(s) + ')');
    s = scene(); tile(2, 4).h = 2; s.k.flags = Object.assign({}, s.k.flags, { hop: true });
    t.ok(why(s) === 'ok', '... unless he hops (2 levels)');
    // a flyer over a pit: a walker can't take its place; two flyers can
    s = scene(); setT(3, 4, 'pit'); s.k.flags = Object.assign({}, s.k.flags, { flying: true });
    t.ok(/can't stand there/.test(why(s)), 'the knight flies over a pit: the mage can\'t swap onto it');
    s.m.flags = Object.assign({}, s.m.flags, { flying: true });
    t.ok(why(s) === 'ok' && C.swap(s.m, 3, 4) && s.m.x === 3 && s.k.x === 2 && !s.m.downed && !s.k.downed, '... two flyers can (nobody falls)');
    // mud: the step costs 2 (fine with move 4); a unit with no move left for the step can't
    s = scene(); setT(3, 4, 'mud');
    t.ok(why(s) === 'ok', 'the knight in mud: the step costs 2, within the mage\'s move');
    s = scene(); s.m.mov = 0;
    t.eq(why(s), 'Not enough movement.', 'a mover with no movement can\'t step over');
  });

  T.suite('engine: rules run — swap: attacks of opportunity (mover only), floor effects for both, Bleed, no Undo after side effects', function (t) {
    const G = DD.Grid, C = DD.Combat, A = DD.Act;
    // the mage next to a grunt swaps with the knight: it leaves the grunt's reach (one stab on the mage); the knight,
    // displaced next to the grunt... and away from another grunt, provokes nothing
    quiet({ w: 9, h: 9, heroes: [H(2, 4), H(3, 4, 'test_knight')], enemies: [E(2, 5), E(4, 4)], enemyAi: false });
    let m = hero(0), k = hero(1);
    k.block = 0;
    const info = C.swapInfo(m, 3, 4);
    t.ok(info.ok === true && info.provokes.length === 1 && info.provokes[0].unitId === foe(0).id && info.provokes[0].dmg === 4,
      'swapInfo lists the grunt the mage leaves (−4)');
    t.eq(JSON.stringify(C.provokes(m, 3, 4)), JSON.stringify(info.provokes), 'Combat.provokes on an ally\'s tile = the swap\'s');
    const mh = m.hp, kh = k.hp;
    const seen = opportunities(function () { C.swap(m, 3, 4); });
    t.ok(seen.length === 1 && seen[0].m === 'test_mage' && seen[0].a === 'test_grunt', 'one attack of opportunity, on the mage');
    t.ok(m.x === 3 && k.x === 2 && m.hp === mh - 4 && k.hp === kh, 'the swap went through: the mage −4, the knight untouched (his displacement provokes nothing)');
    t.ok(!C.canUndo(), 'a swap that provoked can\'t be undone');
    // an interrupting attack of opportunity cancels the swap (the move is spent)
    quiet({ w: 9, h: 9, heroes: [H(2, 4), H(3, 4, 'test_knight'), H(8, 0, 'test_cleric')], enemies: [E(2, 5)], enemyAi: false });
    m = hero(0); k = hero(1);
    m.hp = 3;
    t.ok(C.swap(m, 3, 4), 'the swap action happened');
    t.ok(m.downed && k.x === 3 && k.y === 4 && m.x === 2 && m.y === 4, 'the stab downed the mage where she stood: no swap');
    quiet({ w: 9, h: 9, heroes: [H(2, 4), H(3, 4, 'test_knight')], enemies: [E(2, 5)], enemyAi: false });
    m = hero(0); k = hero(1);
    A.addRule({ id: 'test_tmp_snare', name: 'Snare', hooks: { onOpportunityAttack: function (o) { if (o.mover && !o.mover.dead) A.addStatus(o.mover, 'root', { turns: 1 }); } } });
    t.ok(C.swap(m, 3, 4) && m.x === 2 && k.x === 3 && m.ap === 2 && has(m, 'root'), 'a rooting stab: "Stopped!" in place, the move spent');
    // floor effects on arrival for both (flyers excepted)
    quiet({ w: 9, h: 9, heroes: [H(2, 4), H(3, 4, 'test_knight')], enemies: [E(8, 8)], enemyAi: false,
      surfaces: [{ x: 3, y: 4, id: 'fire', turns: 3 }, { x: 2, y: 4, id: 'poison', turns: 3 }] });
    m = hero(0); k = hero(1);
    const sw = C.swapInfo(m, 3, 4);
    t.ok(sw.hazard === 'fire' && sw.allyHazard === 'poison', 'swapInfo warns of both arrivals (fire for the mage, poison for the knight)');
    C.swap(m, 3, 4);
    t.ok(has(m, 'burn') && has(k, 'poison'), 'each feels the surface it lands on');
    t.ok(!C.canUndo(), '... side effects: no Undo');
    quiet({ w: 9, h: 9, heroes: [H(2, 4), H(3, 4, 'test_knight')], enemies: [E(8, 8)], enemyAi: false, surfaces: [{ x: 2, y: 4, id: 'fire', turns: 3 }] });
    m = hero(0); k = hero(1);
    k.flags = Object.assign({}, k.flags, { flying: true });
    t.ok(C.swap(m, 3, 4) && !has(k, 'burn'), 'a flying ally floats over the fire it is swapped onto');
    // a plate under the ally: the mover presses it
    quiet({ w: 9, h: 9, heroes: [H(2, 4), H(3, 4, 'test_knight')], enemies: [E(8, 8)], enemyAi: false, objects: [{ x: 3, y: 4, id: 'pressure_plate' }] });
    m = hero(0);
    t.ok(C.swap(m, 3, 4) && tile(3, 4).obj.data.count === 1, 'the mover presses the plate it swaps onto');
    // Bleed: the mover's move action ticks it; the displaced ally's doesn't
    quiet({ w: 9, h: 9, heroes: [H(2, 4), H(3, 4, 'test_knight')], enemies: [E(8, 8)], enemyAi: false });
    m = hero(0); k = hero(1);
    A.addStatus(m, 'bleed', { stacks: 2, turns: 3 });
    A.addStatus(k, 'bleed', { stacks: 2, turns: 3 });
    const mh2 = m.hp, kh2 = k.hp;
    C.swap(m, 3, 4);
    t.ok(m.hp < mh2 && k.hp === kh2, 'Bleed ticks on the mover (' + mh2 + ' → ' + m.hp + '), not on the ally');
    // onMove: the mover only (a one-tile walk)
    quiet({ w: 9, h: 9, heroes: [H(2, 4), H(3, 4, 'test_knight')], enemies: [E(8, 8)], enemyAi: false });
    const moved = [];
    A.addRule({ id: 'test_tmp_onmove', name: 'Pedometer', hooks: { onMove: function (u, path) { moved.push(u.defId + ':' + path.length); } } });
    C.swap(hero(0), 3, 4);
    t.eq(moved.join(' '), 'test_mage:1', 'onMove fires for the mover (one tile), not for the ally');
    // a swap in deployment rolls initiative first (like a move), then works on the mover's turn
    quiet({ w: 9, h: 9, heroes: [H(2, 4), H(3, 4, 'test_knight')], enemies: [E(8, 8)], enemyAi: false, deploy: true,
      deployTiles: [{ x: 2, y: 4 }, { x: 3, y: 4 }, { x: 2, y: 3 }] });
    t.ok(C.isDeploying(), 'deployment open');
    t.ok(C.swap(hero(0), 3, 4) && !C.isDeploying() && hero(0).x === 3, 'a swap ends deployment and happens');
  });

  /** A crate / barrel field for the mage (Magic Missile: 4 damage, range 5) and the knight (Test Slash 5, melee). */
  function objectScene(extra) {
    quiet(Object.assign({ w: 9, h: 9, heroes: [H(1, 4), H(0, 0, 'test_knight')], enemies: [E(8, 8)], enemyAi: false,
      objects: [{ x: 4, y: 4, id: 'crate' }] }, extra || {}));
    return hero(0);
  }
  function objTargets(u, ref) { return DD.Targeting.validTargets(u, ref).filter(function (q) { return q.obj; }); }

  T.suite('engine: rules run — breakable objects are targets for the attacks that can aim at barrels (range, sight, damage, opt-outs)', function (t) {
    const Tg = DD.Targeting, A = DD.Act, C = DD.Combat;
    let m = objectScene();
    let q = objTargets(m, m.basic);
    t.ok(q.length === 1 && q[0].x === 4 && q[0].y === 4 && q[0].obj === 'crate' && q[0].dmg === 4 && q[0].hp === 6 && q[0].breaks === false && !q[0].detonates,
      'a crate in range and sight: { obj, dmg 4, hp 6, breaks: false } (' + JSON.stringify(q[0]) + ')');
    t.ok(Tg.breakableAt(4, 4) && Tg.breakable(tile(4, 4).obj) && Tg.objectTargetable(tile(4, 4).obj), 'Targeting.breakableAt / breakable / objectTargetable');
    // what is not a target
    m = objectScene({ objects: [{ x: 4, y: 4, id: 'pillar' }, { x: 2, y: 2, id: 'gold_pile' }, { x: 3, y: 6, id: 'spikes' }] });
    t.eq(objTargets(m, m.basic).length, 0, 'no HP, no target (pillar, gold pile, spikes)');
    m = objectScene({ objects: [{ x: 7, y: 4, id: 'crate' }] });
    t.eq(objTargets(m, m.basic).length, 0, 'out of range (6 > 5)');
    m = objectScene(); setT(3, 4, 'wall');
    t.eq(objTargets(m, m.basic).length, 0, 'no line of sight');
    m = objectScene({ objects: [{ x: 4, y: 4, id: 'bush' }], enemies: [E(4, 4)] });
    t.eq(objTargets(m, m.basic).length, 0, 'a unit standing on a walkable object (a grunt in a bush): the unit is the target');
    m = objectScene({ objects: [{ x: 4, y: 4, id: 'crate', targetable: false }] });
    t.eq(objTargets(m, m.basic).length, 0, 'an instance with targetable: false');
    withDefs('objects', [{ id: 'test_tmp_puzzle', name: 'Puzzle Box', blocksMove: true, hp: 5, targetable: false, desc: 'Solve me.' }], function () {
      m = objectScene({ objects: [{ x: 4, y: 4, id: 'test_tmp_puzzle' }] });
      t.ok(objTargets(m, m.basic).length === 0 && !Tg.objectTargetable(tile(4, 4).obj), 'a def with targetable: false');
    });
    m = objectScene({ objects: [{ x: 4, y: 4, id: 'keg' }], objective: { type: 'protect', objId: 'keg' } });
    t.eq(objTargets(m, m.basic).length, 0, 'the object the party must protect is never a target');
    const hp0 = tile(4, 4).obj.hp;
    A.damageTiles(m, [{ x: 4, y: 4 }], 2, { hitObjects: true });
    t.ok(tile(4, 4).obj.hp === hp0 - 2, '... while area hits still hurt it as before');
    // volatile objects still detonate (an entry with detonates: true), plain barrels are breakables now
    m = objectScene({ objects: [{ x: 4, y: 4, id: 'barrel' }, { x: 4, y: 2, id: 'barrel_explosive' }] });
    q = objTargets(m, m.basic).sort(function (a, b) { return a.y - b.y; });
    t.ok(q.length === 2 && q[0].detonates === true && q[0].obj === 'barrel_explosive' && q[1].obj === 'barrel' && q[1].dmg === 4 && !q[1].detonates,
      'an explosive barrel detonates, a plain one is hit (' + JSON.stringify(q) + ')');
    // melee: adjacent only
    m = objectScene({ objects: [{ x: 1, y: 0, id: 'crate' }, { x: 3, y: 0, id: 'crate' }] });
    q = objTargets(hero(1), hero(1).basic);
    t.ok(q.length === 1 && q[0].x === 1 && q[0].dmg === 5, 'the knight\'s melee basic: the adjacent crate only, 5 damage');
    // which skills: the barrel rule (kind attack, basic, consumable without a kind; target.objects opts in / out)
    withTemp('skills', [
      { id: 'test_tmp_dud', name: 'Dud Shot', owner: 'test_mage', kind: 'attack', ap: 1, levels: [{ dmg: 3 }], target: { type: 'unit', range: [1, 5], filter: 'enemy', objects: false }, desc: function () { return 'x'; }, execute: function () {} },
      { id: 'test_tmp_zing', name: 'Zing', owner: 'test_mage', kind: 'spell', ap: 1, levels: [{ dmg: 3 }], target: { type: 'unit', range: [1, 5], filter: 'enemy', objects: true }, desc: function () { return 'x'; }, execute: function () {} },
      { id: 'test_tmp_tap', name: 'Gentle Tap', owner: 'test_mage', kind: 'attack', ap: 1, levels: [{}], target: { type: 'unit', range: [1, 5], filter: 'enemy' }, desc: function () { return 'x'; }, execute: function () {} },
      { id: 'test_tmp_ram', name: 'Battering Ram', owner: 'test_mage', kind: 'attack', ap: 1, objectDmg: function (L) { return L.n * 3; }, levels: [{ n: 3 }], target: { type: 'unit', range: [1, 5], filter: 'enemy' }, desc: function () { return 'x'; }, execute: function () {} },
    ], function () {
      m = objectScene({ objects: [{ x: 4, y: 4, id: 'crate' }, { x: 4, y: 2, id: 'barrel_explosive' }] });
      t.eq(objTargets(m, DD.getSkill('test_tmp_dud')).length, 0, 'target.objects: false opts out of both');
      t.eq(objTargets(m, DD.getSkill('test_tmp_zing')).length, 2, 'target.objects: true opts a spell in');
      const tap = objTargets(m, DD.getSkill('test_tmp_tap'));
      t.ok(tap.length === 1 && tap[0].detonates, 'no damage number: it can still set a barrel off, but breaks nothing');
      t.eq(Tg.objectDamage(m, DD.getSkill('test_tmp_ram')), 9, 'objectDmg (number | (L, user) => n) overrides L.dmg');
      t.ok(!Tg.aimsAtObjects(m, slotOf(m, 'test_fireball')), 'a tile spell (it has its own area) is not aimed at objects');
    });
    // the damage: L.dmg with Weak / Inspired / item damage, nothing else
    m = objectScene();
    t.eq(Tg.objectDamage(m, m.basic), 4, 'Magic Missile: 4');
    A.addStatus(m, 'weak', { turns: 2 });
    t.eq(Tg.objectDamage(m, m.basic), 3, 'Weak: −25% (rounded)');
    A.removeStatus(m, 'weak');
    A.addStatus(m, 'inspired', { turns: 2 });
    t.eq(Tg.objectDamage(m, m.basic), 5, 'Inspired: +25%');
    A.removeStatus(m, 'inspired');
    m.dmgBonus = 0.5;
    t.eq(Tg.objectDamage(m, m.basic), 6, 'item damage bonus (+50%)');
    m.dmgBonus = 0;
    A.addStatus(m, 'empowered', { turns: 2 });
    t.eq(Tg.objectDamage(m, m.basic), 4, 'Empowered is saved for a foe (not applied)');
    tile(1, 4).h = 2;
    t.eq(Tg.objectDamage(m, m.basic), 4, 'no high ground bonus on objects');
    // the AI never aims at objects
    m = objectScene({ enemies: [E(6, 4, 'test_archer')] });
    t.ok(!Tg.aimsAtObjects(foe(), foe().skillSlots[0]) && objTargets(foe(), foe().skillSlots[0]).length === 0, 'enemies: no object targets');
    t.ok(!Tg.buildCtx(foe(), foe().skillSlots[0], { x: 4, y: 4 }).targetObj, '... not even when handed one');
  });

  T.suite('engine: rules run — hitting an object: damage, breaking, onDestroyed, loot, puzzle hooks, objective, credit, previews = reality', function (t) {
    const Tg = DD.Targeting, A = DD.Act, C = DD.Combat;
    let m = objectScene();
    let s = DD.Combat.state;
    const crate = tile(4, 4).obj;
    // the preview: "Break: Crate − 4 damage, 2 HP left"
    let pv = C.preview(m, m.basic, 4, 4);
    t.ok(pv.breaks && !pv.detonates && !pv.uncertain, 'preview: breaks (no detonation), certain');
    t.ok(pv.breaks.dmg === 4 && pv.breaks.hp === 6 && pv.breaks.left === 2 && pv.breaks.destroyed === false && pv.breaks.name === 'Crate',
      'preview.breaks: 4 damage, 2 HP left (' + JSON.stringify(pv.breaks) + ')');
    t.eq(pv.breaks.text, 'Break: Crate − 4 damage, 2 HP left', 'preview.breaks.text');
    t.eq(keys(pv.tiles), '4,4', 'preview.tiles: the object\'s tile');
    t.ok(crate.hp === 6 && s.log.length >= 0, 'the preview changed nothing');
    let n0 = s.log.length;
    t.ok(C.useSkill(m, m.basic, 4, 4), 'useSkill on the crate');
    t.ok(crate.hp === 2 && tile(4, 4).obj === crate && m.ap === 2, 'the crate took 4 (2 HP left); 1 AP paid');
    t.ok(logSince(n0, /Wizzy McTest takes a shot at the Crate: 4 damage \(2 HP left\)\./), 'logged with what is left');
    pv = C.preview(m, m.basic, 4, 4);
    t.ok(pv.breaks.destroyed && pv.breaks.dmg === 2 && pv.breaks.left === 0 && pv.breaks.text === 'Break: Crate − 2 damage — breaks!', 'preview: "— breaks!" (' + pv.breaks.text + ')');
    n0 = s.log.length;
    t.ok(C.useSkill(m, m.basic, 4, 4) && !tile(4, 4).obj, 'the second shot breaks it');
    t.ok(logSince(n0, /The Crate is destroyed\./) && s.stats.objects.crate === 1, 'logged and counted');
    // melee: a lunge; costs, cooldown and charges paid, riders skipped, Empowered kept
    withTemp('skills', [{ id: 'test_tmp_rider', name: 'Poison Dart', owner: 'test_mage', kind: 'attack', ap: 2, cooldown: 2, charges: 2, levels: [{ dmg: 3 }],
      target: { type: 'unit', range: [1, 5], filter: 'enemy' }, desc: function () { return 'x'; }, execute: function (ctx) { ctx.state.data.dartRan = true; } }], function () {
      m = objectScene();
      const sl = giveSkill(m, 'test_tmp_rider');
      A.addStatus(m, 'empowered', { turns: 2 });
      t.ok(C.useSkill(m, sl, 4, 4) && tile(4, 4).obj.hp === 3, 'Poison Dart hits the crate for its listed 3');
      t.ok(!DD.Combat.state.data.dartRan && m.ap === 1 && sl.cd === 2 && sl.uses === 1, 'execute does not run; AP, cooldown and a charge are paid');
      t.ok(has(m, 'empowered'), 'Empowered is not used up on a crate');
    });
    // onDestroyed, credit (kills, environmental kills), Hype as previewed
    withDefs('objects', [{ id: 'test_tmp_pinata', name: 'Pinata', blocksMove: true, hp: 3, desc: 'Full of hornets.',
      onDestroyed: function (o, tl, src) { DD.Act.explode(src, tl.x, tl.y, { radius: 1, dmg: 7, element: null }); } },
    { id: 'test_tmp_piggy', name: 'Piggy Bank', blocksMove: true, hp: 2, desc: 'Oink.', autoplay: function (unit) { return unit && unit.side === 'hero' ? 9 : 0; },
      onDestroyed: function (o, tl, src) { DD.Act.gainGold(5); DD.Combat.state.data.piggyBy = src ? src.id : null; } }], function () {
      m = objectScene({ objects: [{ x: 4, y: 4, id: 'test_tmp_pinata' }], enemies: [E(5, 4, 'test_minion'), E(4, 5, 'test_minion'), E(8, 8)] });
      s = DD.Combat.state;
      const m1 = foe(0), m2 = foe(1);
      pv = C.preview(m, m.basic, 4, 4);
      t.ok(pv.breaks && pv.breaks.destroyed && pv.perUnit[m1.id] && pv.perUnit[m1.id].lethal && pv.perUnit[m2.id].lethal, 'preview: the pinata breaks, its blast KOs both minions');
      t.eq(keys(pv.tiles), keys([{ x: 4, y: 4 }, { x: 3, y: 4 }, { x: 5, y: 4 }, { x: 4, y: 3 }, { x: 4, y: 5 }]), 'preview.tiles: the object + its blast');
      const hype0 = s.hype;
      t.ok(C.useSkill(m, m.basic, 4, 4) && m1.dead && m2.dead && !tile(4, 4).obj, 'reality: same');
      t.ok(s.stats.units[m.id].kills === 2 && s.stats.envKills === 2 && s.hype - hype0 === pv.hype, 'credited to the mage (2 kills, 2 environmental), Hype as previewed (' + pv.hype + ')');
      // loot and puzzle hooks: onDestroyed gets the attacker; the puzzle hint is read before the blow (boss fights)
      const puz = DD.Balance.hype.puzzle;
      DD.Balance.hype.puzzle = 5;
      try {
        m = objectScene({ objects: [{ x: 4, y: 4, id: 'test_tmp_piggy' }], kind: 'boss' });
        s = DD.Combat.state;
        const g0 = A.gold(), h0 = s.hype;
        t.ok(C.useSkill(m, m.basic, 4, 4) && !tile(4, 4).obj, 'the piggy bank breaks');
        t.ok(A.gold() === g0 + 5 && s.data.piggyBy === m.id, 'its loot (5 gold) spills, onDestroyed got the attacker');
        t.eq(s.hype - h0, 5, 'a hinted object broken in a boss fight is a puzzle step (Hype)');
      } finally { DD.Balance.hype.puzzle = puz; }
    });
    // the destroy objective counts, and wins
    m = objectScene({ objects: [{ x: 4, y: 4, id: 'totem' }, { x: 4, y: 2, id: 'totem' }], objective: { type: 'destroy', objId: 'totem', count: 2 } });
    s = DD.Combat.state;
    tile(4, 4).obj.hp = 4; tile(4, 2).obj.hp = 4;
    t.ok(C.useSkill(m, m.basic, 4, 4) && s.objective.destroyed === 1 && !s.result, 'a totem shot down counts for the destroy objective');
    t.ok(C.useSkill(m, m.basic, 4, 2) && s.result === 'victory', 'the last one wins the fight');
    // volatile objects still detonate outright (whatever their HP)
    m = objectScene({ objects: [{ x: 4, y: 4, id: 'barrel_explosive' }], enemies: [E(5, 4, 'test_minion'), E(8, 8)] });
    pv = C.preview(m, m.basic, 4, 4);
    const mini = foe(0);
    t.ok(pv.detonates === 'barrel_explosive' && !pv.breaks, 'a barrel: detonates, no break line');
    t.ok(C.useSkill(m, m.basic, 4, 4) && !tile(4, 4).obj && mini.dead, 'and it goes off at once');
    // a consumable without a kind breaks things too (its listed damage: objectDmg)
    DD.registerConsumable({ id: 'test_tmp_rock', name: 'Pocket Rock', icon: '🪨', rarity: 'common', ap: 1, objectDmg: 5, target: { type: 'unit', range: [1, 4], filter: 'enemy' },
      desc: 'Throw it at a foe: 5 damage.', execute: function (ctx) { if (ctx.targetUnit) A.damage(ctx.user, ctx.targetUnit, 5); } });
    try {
      m = objectScene({ consumables: ['test_tmp_rock'] });
      const cq = objTargets(m, DD.getConsumable('test_tmp_rock'));
      t.ok(cq.length === 1 && cq[0].dmg === 5, 'a thrown consumable lists the crate (5)');
      t.ok(C.useConsumable(m, 0, 4, 4) && tile(4, 4).obj.hp === 1 && C.consumables().length === 0, 'thrown: 5 damage, used up');
    } finally { delete DD.defs.consumables.test_tmp_rock; }
    // the AI never aims at objects: an archer with a crate on its line shoots the hero
    quiet({ w: 9, h: 9, heroes: [H(2, 4)], enemies: [E(6, 4, 'test_archer')], objects: [{ x: 4, y: 3, id: 'crate' }, { x: 5, y: 5, id: 'barrel' }] });
    const h = hero(), hh = h.hp;
    DD.AI.act(foe());
    t.ok(tile(4, 3).obj.hp === 6 && tile(5, 5).obj.hp === 5 && h.hp < hh, 'the archer shot the hero, never an object');
  });

  T.suite('engine: rules run review — a strike of opportunity that shoves or downs the ALLY calls the swap off (nobody shares a tile)', function (t) {
    const C = DD.Combat, A = DD.Act;
    function alone(tag) {
      const seen = {};
      let dup = null;
      C.units().forEach(function (u) { const k = u.x + ',' + u.y; if (seen[k]) dup = k; seen[k] = 1; });
      t.ok(!dup, tag + ': never two units on a tile' + (dup ? ' (' + dup + ')' : ''));
    }
    quiet({ w: 9, h: 9, heroes: [H(2, 4), H(3, 4, 'test_knight')], enemies: [E(2, 5)], enemyAi: false });
    let m = hero(0), k = hero(1);
    A.addRule({ id: 'test_tmp_sweep', name: 'Sweep', hooks: { onOpportunityAttack: function (o) { if (o.mover === m) A.push(o.attacker, k, { x: 1, y: 0 }, 2); } } });
    t.ok(C.swap(m, 3, 4) && m.x === 2 && m.y === 4 && k.x === 5 && m.ap === 2, 'the knight shoved away by the strike: no swap, the mage stays, the move is spent');
    alone('shoved ally');
    quiet({ w: 9, h: 9, heroes: [H(2, 4), H(3, 4, 'test_knight')], enemies: [E(2, 5)], enemyAi: false });
    m = hero(0); k = hero(1);
    A.addRule({ id: 'test_tmp_cleave', name: 'Cleave', hooks: { onOpportunityAttack: function (o) { if (o.mover === m) { k.block = 0; A.damage(o.attacker, k, 999); } } } });
    t.ok(C.swap(m, 3, 4) && k.downed && m.x === 2 && k.x === 3, 'the knight downed by the strike: the mage never takes a downed ally\'s place');
    alone('downed ally');
  });

  T.suite('engine: rules run review — every breakable object def: a target from 1 and 3 tiles unless opted out; a killing hit previews exactly what happens', function (t) {
    const Tg = DD.Targeting, C = DD.Combat;
    const ids = Object.keys(DD.defs.objects).filter(function (id) { return id.indexOf('test_') !== 0 && DD.defs.objects[id].hp > 0; });
    t.ok(ids.length >= 10, ids.length + ' breakable defs');
    withTemp('skills', [{ id: 'test_tmp_maul', name: 'Big Maul', owner: 'test_mage', kind: 'attack', ap: 1, levels: [{ dmg: 60 }],
      target: { type: 'unit', range: [1, 5], filter: 'enemy' }, desc: function () { return 'x'; }, execute: function () {} }], function () {
      ids.forEach(function (id) {
        [1, 3].forEach(function (d) {
          quiet({ w: 11, h: 9, heroes: [H(4 - d, 4)], enemies: [E(10, 8)], enemyAi: false, objects: [{ x: 4, y: 4, id: id }] });
          const o = tile(4, 4).obj, m = hero();
          const q = Tg.validTargets(m, m.basic).some(function (p) { return p.x === 4 && p.y === 4; });
          t.eq(q, Tg.objectTargetable(o), id + ' from ' + d + ': a target exactly when targetable (blocks sight: ' + !!DD.defs.objects[id].blocksLos + ')');
        });
        quiet({ w: 11, h: 9, heroes: [H(1, 4), H(4, 6, 'test_knight')], enemies: [E(5, 4, 'test_minion'), E(4, 3), E(10, 8)], enemyAi: false, objects: [{ x: 4, y: 4, id: id }] });
        const o = tile(4, 4).obj, m = hero();
        if (!Tg.objectTargetable(o)) return;
        const sl = giveSkill(m, 'test_tmp_maul');
        const pv = C.preview(m, sl, 4, 4);
        const hp0 = {};
        C.units().forEach(function (u) { hp0[u.id] = u.hp; });
        t.ok(C.useSkill(m, sl, 4, 4), id + ': hit');
        const real = {}, want = {};
        Object.keys(hp0).forEach(function (uid) { const u = C.byId(uid); const dd = hp0[uid] - (u ? u.hp : 0); if (dd) real[uid] = dd; });
        Object.keys(pv.perUnit || {}).forEach(function (uid) { if (pv.perUnit[uid].dmg) want[uid] = pv.perUnit[uid].dmg; });
        t.eq(JSON.stringify(real), JSON.stringify(want), id + ': the units hurt as previewed');
        t.ok(pv.detonates ? !tile(4, 4).obj : pv.breaks && pv.breaks.destroyed && tile(4, 4).obj !== o, id + ': ' + (pv.detonates ? 'detonated' : pv.breaks && pv.breaks.text));
      });
    });
  });
})();

// ---- playtest fixes (Nov 12, fix:engine): one suite per confirmed finding, each failing on the pre-fix files -------
(function () {
  'use strict';
  const T = window.DD_TEST;
  const DD = window.DD;
  const sb = T.helpers.sb, H = T.helpers.H, E = T.helpers.E, hero = T.helpers.hero, foe = T.helpers.foe, quiet = T.helpers.quiet;
  function tile(x, y) { return DD.Grid.tile(x, y); }
  function setT(x, y, t) { tile(x, y).t = t; }
  function pk(path) { return (path || []).map(function (p) { return p.x + ',' + p.y; }).join(' '); }

  T.suite('engine: playtest fixes — combat-controls-2: walks avoid a web on a tie and report the snag (stop / hinder)', function (t) {
    const C = DD.Combat, G = DD.Grid;
    quiet({ w: 9, h: 7, heroes: [H(2, 3, 'test_knight')], enemies: [E(8, 6)], enemyAi: false });
    const z = hero();
    DD.Act.setSurface(3, 3, 'web', 4);
    t.eq(pk(G.path(z, 3, 4)), '2,4 3,4', 'the equal-cost web-free route (2,4 then 3,4)');
    let r = C.reachable(z);
    t.eq(r.get('3,4').stop, null, 'no snag on that route');
    const via = r.get('4,3');
    t.ok(via && via.stop && via.stop.x === 3 && via.stop.y === 3 && via.stop.id === 'web', 'the only cost-2 route to 4,3 crosses the web: entry.stop names it');
    t.ok(C.move(z, 3, 4) && z.x === 3 && z.y === 4 && !DD.Act.hasStatus(z, 'root'), 'the walk to 3,4 ends there, not Rooted');
    // the other direction (the old tie-break was direction luck)
    quiet({ w: 9, h: 7, heroes: [H(2, 3, 'test_knight')], enemies: [E(8, 6)], enemyAi: false });
    DD.Act.setSurface(2, 4, 'web', 4);
    t.eq(pk(G.path(hero(), 3, 4)), '3,3 3,4', 'a web on 2,4 is avoided too');
    // a stop on the destination is reported; flyers and root-immune units feel none; Cheeto Dust is a hinder
    quiet({ w: 9, h: 7, heroes: [H(2, 3, 'test_knight')], enemies: [E(8, 6)], enemyAi: false });
    DD.Act.setSurface(4, 3, 'web', 4);
    DD.Act.setSurface(2, 5, 'cheeto', 4);
    r = C.reachable(hero());
    t.ok(r.get('4,3').stop && r.get('4,3').stop.x === 4, 'ending on a web: stop is the destination');
    t.ok(r.get('2,5').hinder && r.get('2,5').hinder.id === 'cheeto' && !r.get('2,5').stop, 'Cheeto Dust: a hinder, not a stop');
    hero().flags.immune = ['root'];
    t.eq(G.snagAt(4, 3, hero()), null, 'root-immune: the web is no snag');
    hero().flags.immune = [];
    hero().flags.flying = true;
    t.eq(G.snagAt(4, 3, hero()), null, 'flyers float over the web');
    hero().flags.flying = false;
    // with attacks of opportunity in play (searchAoo) the tie-break holds too
    quiet({ w: 9, h: 7, heroes: [H(2, 3, 'test_knight')], enemies: [E(0, 0), E(8, 6)], enemyAi: false });
    DD.Act.setSurface(3, 3, 'web', 4);
    t.eq(pk(G.reachable(hero(), 4, { aoo: true }).get('3,4').path), '2,4 3,4', 'the AoO search avoids the web on a tie');
  });

  T.suite('engine: playtest fixes — combat-controls-v1: rooted on a friend\'s tile, the walker steps back, never slides into lava', function (t) {
    const C = DD.Combat;
    [['lava', 'lava'], ['open floor', null]].forEach(function (v) {
      quiet({ w: 9, h: 7, heroes: [H(2, 3, 'test_knight'), H(3, 3, 'test_mage')], enemies: [E(8, 6)], enemyAi: false });
      const z = hero(0), m = hero(1);
      for (let x = 0; x < 9; x++) { if (x !== 3) { setT(x, 2, 'wall'); setT(x, 4, 'wall'); } }
      setT(3, 4, 'wall');
      if (v[1]) setT(3, 2, v[1]);
      DD.Act.setSurface(3, 3, 'web', 4);
      const hp0 = z.hp;
      t.ok(C.move(z, 4, 3), v[0] + ': the walk through Wizzy on the web');
      t.ok(DD.Act.hasStatus(z, 'root'), v[0] + ': Rooted on the web under the friend');
      t.eq(z.x + ',' + z.y, '2,3', v[0] + ': back on the tile he came from (not 3,2)');
      t.eq(z.hp, hp0, v[0] + ': no HP lost');
      t.ok(m.x === 3 && m.y === 3, v[0] + ': the friend stays put');
    });
    // nowhere to step back (someone took the start tile): the nearest free safe tile, whose floor is felt (cause push)
    quiet({ w: 9, h: 7, heroes: [H(2, 3, 'test_knight'), H(3, 3, 'test_mage'), H(2, 5, 'test_cleric')], enemies: [E(8, 6)], enemyAi: false });
    const z = hero(0), c = hero(2);
    setT(3, 2, 'lava');
    DD.Act.setSurface(3, 3, 'web', 4);
    const seen = [];
    DD.Act.addRule({ id: 'test_tmp_enter', name: 'Enter log', hooks: { onEnterTile: function (u, tl, cause) {
      if (u !== z) return;
      seen.push(tl.x + ',' + tl.y + ':' + cause);
      if (tl.x === 3 && tl.y === 3) { c.x = 2; c.y = 3; }   // the cleric steps into the start tile behind him
    } } });
    t.ok(C.move(z, 4, 3), 'the walk');
    t.ok(!(z.x === 3 && z.y === 3) && !(z.x === 2 && z.y === 3), 'never left sharing a tile (' + z.x + ',' + z.y + ')');
    t.ok(!(z.x === 3 && z.y === 2), 'never slid onto the lava');
    t.eq(seen[seen.length - 1], z.x + ',' + z.y + ':push', 'the landing tile is felt as an entry (cause push)');
  });
})();

(function () {
  'use strict';
  const T = window.DD_TEST;
  const DD = window.DD;
  const H = T.helpers.H, E = T.helpers.E, hero = T.helpers.hero, foe = T.helpers.foe, quiet = T.helpers.quiet;
  function pool(u) { return u.hp + (u.block || 0); }

  T.suite('engine: playtest fixes — combat-controls-1: attack-of-opportunity previews come from a dry run (stops, Bleed riders, dice)', function (t) {
    const C = DD.Combat;
    function fight(enemyId, ex, ey, extraHeroes) {
      quiet({ w: 9, h: 9, heroes: [H(3, 3, 'test_mage')].concat(extraHeroes || []), enemies: [E(ex, ey, enemyId), E(8, 8, 'test_grunt')], enemyAi: false });
      return hero(0);
    }
    if (!DD.getEnemy('a1_cube') || !DD.getEnemy('a1_rat') || !DD.getEnemy('a3_nat1_golem')) { t.ok(true, 'content enemies missing: skipped'); return; }
    // Engulf stops the walk: the preview says so, and where he ends
    let m = fight('a1_cube', 3, 2);
    let pv = C.provokes(m, 3, 5);
    t.eq(pv.length, 1, 'the cube strikes the walk');
    t.ok(pv[0].stops && /Engulf/.test(pv[0].stops), 'the strike stops the walk: ' + pv[0].stops);
    t.eq(pv.outcome.end.x + ',' + pv.outcome.end.y, '3,3', 'the dry run ends the walk on the start tile');
    t.ok(!pv.outcome.arrived, 'it never arrives');
    let p0 = pool(m);
    t.ok(C.move(m, 3, 5) && m.x === 3 && m.y === 3, 'the real walk: stopped on 3,3');
    t.eq(p0 - pool(m), pv.outcome.loss, 'the HP lost is the previewed loss (' + pv.outcome.loss + ')');
    t.eq(pv[0].dmg, pv.outcome.loss, 'and the strike\'s number');
    // the swap version: the preview calls the swap off
    m = fight('a1_cube', 3, 2, [H(4, 3, 'test_knight')]);
    let si = C.swapInfo(m, 4, 3);
    t.ok(si.ok === true && si.provokes.length === 1 && si.provokes[0].stops && si.outcome && si.outcome.arrived === false, 'swap preview: the strike stops it, no swap');
    t.ok(C.provokes(m, 4, 3).outcome && C.provokes(m, 4, 3).outcome.arrived === false && C.moveOutcome(m, 4, 3).arrived === false, 'Combat.provokes / moveOutcome on the ally\'s tile: the same outcome');
    t.ok(C.swap(m, 4, 3) && m.x === 3 && hero(1).x === 4, 'the real swap: called off');
    // a Bleed rider ticks when the same move ends: counted in the preview
    m = fight('a1_rat', 4, 3);
    pv = C.provokes(m, 1, 3);
    t.eq(pv.length, 1, 'the rat strikes');
    p0 = pool(m);
    t.ok(C.move(m, 1, 3), 'the real walk');
    const lost = p0 - pool(m);
    if (pv.outcome.uncertain) t.ok(lost >= pv.outcome.lossMin && lost <= pv.outcome.lossMax, 'random: the real loss ' + lost + ' is inside ' + pv.outcome.lossMin + '–' + pv.outcome.lossMax);
    else t.eq(lost, pv.outcome.loss, 'the whole loss (strike + Bleed tick) is previewed exactly');
    t.ok(pv[0].bleed > 0 && pv.outcome.bleedTick > 0, 'the rider\'s Bleed is reported (' + pv[0].bleed + ' stacks, ' + pv.outcome.bleedTick + ' at the end)');
    // dice: the golem's Roll to Hit is flagged random with a range from other rolls, never the real roll alone
    m = fight('a3_nat1_golem', 3, 2);
    pv = C.provokes(m, 3, 5);
    t.ok(pv.length === 1 && pv[0].random && pv.outcome.uncertain, 'the golem\'s strike is flagged random');
    t.ok(pv[0].min <= pv[0].dmg && pv[0].dmg <= pv[0].max, 'min ' + pv[0].min + ' ≤ ' + pv[0].dmg + ' ≤ max ' + pv[0].max);
    // the preview touched nothing
    t.ok(m.x === 3 && m.y === 3 && !DD.Act.hasStatus(m, 'bleed') && !DD.Combat.state.rules.some(function (r) { return r.id === 'dd_dry_move'; }), 'pure: nothing moved, no rule left behind');
  });
})();

(function () {
  'use strict';
  const T = window.DD_TEST;
  const DD = window.DD;
  const H = T.helpers.H, E = T.helpers.E, hero = T.helpers.hero, quiet = T.helpers.quiet;
  function tile(x, y) { return DD.Grid.tile(x, y); }

  T.suite('engine: playtest fixes — robustness-1: a downed body never lies on a tile that becomes a pit or deep water; revives stand on solid floor', function (t) {
    const A = DD.Act, G = DD.Grid;
    quiet({ w: 8, h: 8, heroes: [H(3, 2, 'test_mage'), H(5, 5, 'test_cleric')], enemies: [E(7, 7)], enemyAi: false });
    const j = hero(0);
    j.block = 0;
    A.damage(null, j, 999);
    t.ok(j.downed && !j.dead, 'downed on 3,2');
    A.setTerrain(3, 2, 'pit');
    t.ok(!(j.x === 3 && j.y === 2) && !G.isDrop(j.x, j.y), 'the body is moved off the new pit (' + j.x + ',' + j.y + ')');
    t.ok(j.downed && !j.dead && j.hp === 0, 'still downed, not dead');
    t.ok(A.revive(j, 0.25) && !G.isDrop(j.x, j.y) && G.isWalkable(j.x, j.y, j), 'revived on solid floor');
    // a wall rising under a body: off it too
    quiet({ w: 8, h: 8, heroes: [H(3, 2, 'test_mage'), H(5, 5, 'test_cleric')], enemies: [E(7, 7)], enemyAi: false });
    const j2 = hero(0);
    j2.block = 0;
    A.damage(null, j2, 999);
    A.setTerrain(3, 2, 'wall');
    t.ok(!(j2.x === 3 && j2.y === 2) && G.isWalkable(j2.x, j2.y, j2), 'a body under a new wall is moved off it');
    // the safety net: a body that somehow lies over a drop is stood up on solid floor by the revive
    quiet({ w: 8, h: 8, heroes: [H(3, 2, 'test_mage'), H(5, 5, 'test_cleric')], enemies: [E(7, 7)], enemyAi: false });
    const j3 = hero(0);
    j3.block = 0;
    A.damage(null, j3, 999);
    tile(3, 2).t = 'pit';
    t.ok(A.revive(j3, 0.25) && !G.isDrop(j3.x, j3.y), 'revive: off the pit first (' + j3.x + ',' + j3.y + ')');
  });
})();

(function () {
  'use strict';
  const T = window.DD_TEST;
  const DD = window.DD;
  const H = T.helpers.H, E = T.helpers.E, hero = T.helpers.hero, foe = T.helpers.foe, quiet = T.helpers.quiet, keys = T.helpers.keys;

  T.suite('engine: playtest fixes — bosses-objectives-2: Dazzle / Confuse on a pending wind-up: the board shows where it really lands', function (t) {
    const A = DD.Act, AI = DD.AI;
    function setup() {
      quiet({ w: 11, h: 11, heroes: [H(4, 4)], enemies: [E(6, 6, 'test_boss')], enemyAi: false });
      const h = hero(0), b = foe();
      h.maxHp = h.hp = 99;
      return { h: h, b: b, it: AI.windUp(b, 'test_boss_meteor', h, {}) };
    }
    let k = setup();
    const before = keys(AI.intentTiles(k.b, k.it));
    t.eq(before, '3,4 4,3 4,4 4,5 5,4', 'marked: radius 1 around the mage');
    A.addStatus(k.b, 'dazzled', { turns: 1 });
    const off = k.it.skew && k.it.skew.off;
    t.ok(off && Math.abs(off.x) + Math.abs(off.y) === 1, 'Dazzle rolls the offset when it lands (' + JSON.stringify(off) + ')');
    const now = AI.intentTiles(k.b, k.it);
    t.eq(keys(now), keys(DD.AI.intentTiles(k.b, k.it)), 'stable: the same tiles every frame');
    t.eq(keys(now), keys([{ x: 3, y: 4 }, { x: 4, y: 3 }, { x: 4, y: 4 }, { x: 4, y: 5 }, { x: 5, y: 4 }].map(function (p) { return { x: p.x + off.x, y: p.y + off.y }; })), 'the marked tiles moved 1 tile off');
    const d = AI.describe(k.b, k.it);
    t.ok(!d.uncertain && /Dazzled: it lands 1 tile off, on the tiles marked now/.test(d.text), 'describe: honest, no "?" (' + d.text + ')');
    // stand on a newly marked tile that was safe before: hit; on the old centre's far side (no longer marked): safe
    const hit = now.filter(function (p) { return before.split(' ').indexOf(p.x + ',' + p.y) < 0; })[0];
    A.teleport(k.h, hit.x, hit.y);
    let hp = k.h.hp;
    DD.Combat.endTurn();
    t.eq(k.h.hp, hp - 14, 'it lands where the board said (' + hit.x + ',' + hit.y + ')');
    // and a hero on a tile the move left unmarked takes nothing
    k = setup();
    A.addStatus(k.b, 'dazzled', { turns: 1 });
    const now2 = keys(AI.intentTiles(k.b, k.it)).split(' ');
    const safe = ['3,4', '4,3', '4,5', '5,4'].filter(function (q) { return now2.indexOf(q) < 0; })[0].split(',');
    A.teleport(k.h, +safe[0], +safe[1]);
    hp = k.h.hp;
    DD.Combat.endTurn();
    t.eq(k.h.hp, hp, 'an unmarked tile is safe (' + safe.join(',') + ')');
    // Confuse: a quarter turn around the boss, drawn
    k = setup();
    A.addStatus(k.b, 'confused', { turns: 1 });
    t.ok(k.it.skew && (k.it.skew.turn === 1 || k.it.skew.turn === 3), 'Confuse rolls the quarter turn when it lands');
    const turned = AI.intentTiles(k.b, k.it);
    t.ok(keys(turned) !== before && turned.length === 5, 'the marked tiles turned');
    const spot = turned.filter(function (p) { return !DD.Grid.unitAt(p.x, p.y); })[0];
    A.teleport(k.h, spot.x, spot.y);
    hp = k.h.hp;
    DD.Combat.endTurn();
    t.eq(k.h.hp, hp - 14, 'it lands on the turned tiles');
    // a wind-up started while already Dazzled is drawn moved at once
    quiet({ w: 11, h: 11, heroes: [H(4, 4)], enemies: [E(9, 9, 'test_boss')], enemyAi: false });
    A.addStatus(foe(), 'dazzled', { turns: 1 });
    const it2 = AI.windUp(foe(), 'test_boss_meteor', hero(), {});
    t.ok(it2.skew && it2.skew.off && keys(AI.intentTiles(foe(), it2)) !== '3,4 4,3 4,4 4,5 5,4', 'started while Dazzled: moved from the start');
    // the status gone before it lands: back on the original tiles
    A.removeStatus(foe(), 'dazzled');
    t.eq(keys(AI.intentTiles(foe(), it2)), '3,4 4,3 4,4 4,5 5,4', 'Dazzle cleansed: the original tiles again');
  });

  T.suite('engine: playtest fixes — first-hour-1 / bosses-objectives-9 / text-tone-3: wind-up texts at this fight\'s numbers, whole-table dooms, no "its" for a boss', function (t) {
    const AI = DD.AI;
    quiet({ w: 9, h: 9, heroes: [H(2, 3)], enemies: [E(7, 7, 'test_boss')], enemyAi: false });
    const b = foe(), h = hero();
    DD.Combat.state.difficulty = Object.assign({}, DD.Combat.state.difficulty, { dmg: 1.5 });
    const n0 = DD.Combat.state.log.length;
    const it = AI.windUp(b, 'test_boss_meteor', h, {});
    const d = AI.describe(b, it);
    t.ok(/deal 21 fire damage/.test(d.text) && d.dmg === 21, 'the desc says 21 (14 × 1.5), like the badge (' + d.dmg + ')');
    t.ok(/deal 21 fire damage/.test(AI.skillDesc(DD.getSkill('test_boss_meteor'), 1, b)), 'AI.skillDesc: an enemy\'s ability at this fight\'s numbers');
    t.eq(AI.fightLevel(DD.getSkill('test_slash'), 1, h).dmg, 5, 'a hero\'s numbers are unchanged');
    t.ok(/Hits the marked tiles\. Get out of the red\./.test(d.text), 'a normal ground wind-up: get out of the red');
    const all = DD.Grid.allTiles().map(function (p) { return { x: p.x, y: p.y }; });
    const doom = AI.windUp(b, 'test_boss_meteor', h, { noCooldown: true, tiles: all, data: { unstoppable: true } });
    const dd = AI.describe(b, doom);
    t.ok(/whole table/.test(dd.text) && !/Get out of the red/.test(dd.text), 'a doom over the whole table: no "get out of the red" (' + dd.text + ')');
    const lines = DD.Combat.state.log.slice(n0).map(function (l) { return l.text; }).join(' | ');
    t.ok(/lands at the start of The Test Overlord's next turn/.test(lines) && !/\bits (next )?turn/.test(lines), 'the log names the boss, no "its" (' + lines + ')');
    const it3 = AI.windUp(b, 'test_boss_meteor', h, { noCooldown: true, anchor: 'self' });
    t.ok(/push The Test Overlord and the attack moves along/.test(AI.describe(b, it3).text), 'self-anchored: "push <name>", no "it"');
  });
})();

(function () {
  'use strict';
  const T = window.DD_TEST;
  const DD = window.DD;
  const H = T.helpers.H, E = T.helpers.E, hero = T.helpers.hero, foe = T.helpers.foe, quiet = T.helpers.quiet;

  T.suite('engine: playtest fixes — bosses-objectives-3: threat counts every turn a foe gets before the hero\'s next turn (two-turn bosses twice)', function (t) {
    const AI = DD.AI;
    DD.registerEnemy(Object.assign({}, DD.getEnemy('test_grunt'), { id: 'test_tmp_pt_twice', name: 'Double Dipper', tier: 'boss', turnsPerRound: 2 }));
    try {
      quiet({ w: 9, h: 9, heroes: [H(1, 1), H(1, 7, 'test_knight')], enemies: [E(3, 1, 'test_tmp_pt_twice'), E(3, 7)], enemyAi: false });
      const m = hero(0), k = hero(1), b = foe(0), g = foe(1);
      const order = DD.Combat.state.order.map(function (e) { return DD.Combat.byId(e.unitId).defId; }).join(' ');
      t.eq(order, 'test_mage test_knight test_tmp_pt_twice test_grunt test_tmp_pt_twice', 'order: both heroes, the boss, the grunt, the boss again');
      t.eq(AI.turnsBefore(b, m), 2, 'the boss acts twice before the mage\'s next turn');
      t.eq(AI.turnsBefore(g, m), 1, 'the grunt once');
      t.eq(AI.turnsBefore(b, k), 0, 'the knight acts next: nobody before him');
      const one = AI.reachOf(b).tiles.get('2,1');
      t.ok(one > 0, 'the boss reaches 2,1 (' + one + ' per turn)');
      const plain = AI.threatMap('hero').get('2,1');
      const forM = AI.threatMap('hero', { hero: m }).get('2,1');
      t.eq(plain.dmg, one, 'without a hero: once per unit (as before)');
      t.ok(forM.dmg === 2 * one && forM.turns[b.id] === 2 && forM.max === one, 'for the mage: twice (' + forM.dmg + ')');
      t.eq(AI.threatMap('hero', { hero: k }).get('2,1'), undefined, 'for the knight (next to act): nothing reaches before his turn');
      // the knight's own turn: everyone else acts once more, the boss twice
      DD.Combat.endTurn();
      t.ok(DD.Combat.current() === k && AI.turnsBefore(b, k) === 2 && AI.turnsBefore(g, k) === 1, 'on the knight\'s turn: the boss twice, the grunt once');
    } finally { delete DD.defs.enemies.test_tmp_pt_twice; }
  });
})();

(function () {
  'use strict';
  const T = window.DD_TEST;
  const DD = window.DD;
  const H = T.helpers.H, E = T.helpers.E, hero = T.helpers.hero, quiet = T.helpers.quiet;

  T.suite('engine: playtest fixes — heroes-3: a TILE-aimed hit on a breakable object previews the Break (and a barrel\'s Detonate)', function (t) {
    const C = DD.Combat;
    DD.registerSkill({ id: 'test_tmp_pt_hammer', name: 'Test Hammer', owner: 'test_knight', icon: '🔨', kind: 'attack', tags: ['melee'], ap: 1,
      levels: [{ dmg: 5 }], target: { type: 'tile', range: [1, 1], filter: 'any' },
      desc: function (L) { return 'Smash an adjacent tile for ' + L.dmg + '.'; },
      execute: function (ctx) {
        const u = DD.Grid.unitAt(ctx.target.x, ctx.target.y);
        if (u && u !== ctx.user) DD.Act.damage(ctx.user, u, ctx.L.dmg);
        else DD.Act.damageObject(ctx.user, ctx.target.x, ctx.target.y, ctx.L.dmg);
      } });
    try {
      quiet({ w: 9, h: 9, heroes: [H(3, 3, 'test_knight')], enemies: [E(8, 8)], enemyAi: false, objects: [{ x: 4, y: 3, id: 'crate' }, { x: 3, y: 4, id: 'barrel_explosive' }] });
      const k = hero();
      const sl = DD.Act.makeSlot('test_tmp_pt_hammer', 1);
      k.skills.push(sl);
      const crateHp = DD.Grid.tile(4, 3).obj.hp;
      const pv = C.preview(k, sl, 4, 3);
      t.ok(pv.breaks && pv.breaks.dmg === Math.min(5, crateHp) && pv.breaks.left === Math.max(0, crateHp - 5), 'the crate: ' + (pv.breaks && pv.breaks.text));
      const bp = C.preview(k, sl, 3, 4);
      t.ok(bp.detonates === 'barrel_explosive' && bp.tiles.length > 1, 'the barrel: Detonate, with its blast tiles (' + bp.tiles.length + ')');
      t.ok(C.useSkill(k, sl, 4, 3) && DD.Grid.tile(4, 3).obj && DD.Grid.tile(4, 3).obj.hp === pv.breaks.left, 'the real hit leaves what the preview said');
    } finally { delete DD.defs.skills.test_tmp_pt_hammer; }
  });
})();

(function () {
  'use strict';
  const T = window.DD_TEST;
  const DD = window.DD;
  const H = T.helpers.H, E = T.helpers.E, hero = T.helpers.hero, quiet = T.helpers.quiet;

  T.suite('engine: playtest fixes — heroes-v1: DD.Targeting.reach gives descs the range the card\'s Range pill shows', function (t) {
    DD.registerSkill({ id: 'test_tmp_pt_toss', name: 'Test Toss', owner: 'test_mage', icon: '🥥', kind: 'attack', tags: ['ranged'], ap: 1,
      levels: [{ dmg: 4 }, { dmg: 5 }], target: { type: 'unit', range: [1, 4], filter: 'enemy' },
      desc: function (L, user) { return 'Deal ' + L.dmg + ' damage to a foe within ' + DD.Targeting.reach(this, L, user, 4) + '.'; },
      execute: function () {} });
    try {
      quiet({ w: 9, h: 9, heroes: [H(1, 1)], enemies: [E(8, 8)], enemyAi: false });
      const m = hero(), def = DD.getSkill('test_tmp_pt_toss');
      t.eq(DD.skillDesc(def, 1, null), 'Deal 4 damage to a foe within 4.', 'no user (codex): the base number');
      t.eq(DD.skillDesc(def, 1, m), 'Deal 4 damage to a foe within 4.', 'a hero without range items: 4');
      m.rangeBonus = 1;
      t.eq(DD.Targeting.range(m, def, 2)[1], 5, 'the Range pill: 1–5');
      t.eq(DD.skillDesc(def, 2, m), 'Deal 5 damage to a foe within 5.', 'with a +1 range item the desc agrees (level 2 too)');
    } finally { delete DD.defs.skills.test_tmp_pt_toss; }
  });
})();

(function () {
  'use strict';
  const T = window.DD_TEST;
  const DD = window.DD;
  const H = T.helpers.H, E = T.helpers.E, hero = T.helpers.hero, foe = T.helpers.foe, quiet = T.helpers.quiet;
  function logText(n0) { return DD.Combat.state.log.slice(n0).map(function (l) { return l.text; }).join(' | '); }

  T.suite('engine: playtest fixes — text-tone-5 / bosses-objectives-10: a self-own or friendly fire narrates as such', function (t) {
    const A = DD.Act;
    const keys = [];
    const real = DD.narrate;
    DD.narrate = function (key, vars, rng) { keys.push(key + ':' + (vars.enemy || '')); return real.call(DD, key, vars, rng); };
    try {
      quiet({ w: 9, h: 9, heroes: [H(1, 1), H(3, 3, 'test_knight')], enemies: [E(8, 8)], enemyAi: false });
      const m = hero(0);
      m.block = 0;
      A.damage(m, m, 999, { cause: 'other' });
      t.eq(keys.filter(function (x) { return /^hero_downed/.test(x); }).join(' '), 'hero_downed_self:', 'credit = the downed hero: hero_downed_self');
      quiet({ w: 9, h: 9, heroes: [H(1, 1), H(3, 3, 'test_knight')], enemies: [E(8, 8)], enemyAi: false });
      keys.length = 0;
      hero(1).block = 0;
      A.damage(hero(0), hero(1), 999, { cause: 'other' });
      t.eq(keys.filter(function (x) { return /^hero_downed/.test(x); }).join(' '), 'hero_downed_friendly:Wizzy McTest', 'credit = an ally: hero_downed_friendly with the ally\'s name');
      keys.length = 0;
      hero(0).block = 0;
      A.damage(foe(), hero(0), 999, { cause: 'other' });
      t.eq(keys.filter(function (x) { return /^hero_downed/.test(x); }).join(' '), 'hero_downed:' + foe().name, 'credit = a foe: hero_downed');
    } finally { DD.narrate = real; }
  });

  T.suite('engine: playtest fixes — text-tone-2: ally_down barks fit who went down; text-tone-20: minion death barks are occasional', function (t) {
    const A = DD.Act;
    const kdef = DD.getHero('test_knight');
    const saved = kdef.barks.ally_down;
    kdef.barks.ally_down = ['Wizzy, go get help!', 'Father Unittest, get up!', '{downed}, on your feet!', 'Man down!'];
    try {
      quiet({ w: 9, h: 9, heroes: [H(1, 1, 'test_knight'), H(3, 3), H(5, 5, 'test_cleric')], enemies: [E(8, 8)], enemyAi: false });
      const k = hero(0), m = hero(1), c = hero(2);
      function heard(about) {
        const got = {};
        for (let i = 0; i < 200; i++) { const s = A.bark(k, 'ally_down', { about: about }); if (s) got[s] = 1; }
        return Object.keys(got).sort();
      }
      c.downed = true;
      let h = heard(c);
      // [finish text-tone-2] a line that opens by telling a named hero to get up speaks to the downed one: it fires
      // exactly when that hero is the one down (it used to be read as a helper call and fire while he stood)
      t.ok(h.indexOf('Father Unittest, get up!') >= 0 && h.indexOf('Wizzy, go get help!') >= 0 && h.indexOf('Father Unittest, on your feet!') >= 0,
        'the cleric down: "Father Unittest, get up!" fits, the helper call to Wizzy fires, {downed} is filled in (' + h.join(' / ') + ')');
      c.downed = false;
      m.downed = true;
      h = heard(m);
      t.ok(h.indexOf('Wizzy, go get help!') < 0, 'Wizzy down: no "Wizzy, go get help!" (' + h.join(' / ') + ')');
      t.ok(h.indexOf('Father Unittest, get up!') < 0, 'Wizzy down: no "Father Unittest, get up!" while the cleric stands (' + h.join(' / ') + ')');
      t.ok(h.indexOf('Man down!') >= 0 && h.indexOf('Wizzy McTest, on your feet!') >= 0, 'the generic line and {downed} still fire');
    } finally { kdef.barks.ally_down = saved; }
    // a minion's death bark is no longer guaranteed: over many deaths some are silent, an elite always speaks
    let said = 0, n = 0;
    const real = A.bark;
    A.bark = function (u, key) { if (key === 'death') said++; return ''; };
    try {
      for (let i = 0; i < 30; i++) {
        quiet({ w: 6, h: 6, heroes: [H(0, 0)], enemies: [E(5, 5, 'test_minion'), E(4, 5)], enemyAi: false, seed: 'tt20-' + i });
        A.kill(foe(0), hero(), { force: true });
        n++;
      }
    } finally { A.bark = real; }
    t.ok(said > 0 && said < n, 'minions: ' + said + ' death barks in ' + n + ' deaths');
  });
})();

(function () {
  'use strict';
  const T = window.DD_TEST;
  const DD = window.DD;
  const H = T.helpers.H, E = T.helpers.E, hero = T.helpers.hero, quiet = T.helpers.quiet;
  function logSince(n0) { return DD.Combat.state.log.slice(n0).map(function (l) { return l.text; }).join(' | '); }

  T.suite('engine: playtest fixes — text-tone-9 / text-tone-10: object names keep their case, plural agreement, no double lines; status lines read', function (t) {
    const A = DD.Act;
    quiet({ w: 9, h: 9, heroes: [H(1, 1)], enemies: [E(8, 8)], enemyAi: false,
      objects: [{ x: 3, y: 3, id: 'crate' }, { x: 4, y: 4, id: 'keg' }, { x: 5, y: 5, id: 'crate', label: 'The Vault Door' }] });
    DD.registerObject({ id: 'test_tmp_candles', name: 'Candles', blocksMove: true, hp: 2, desc: 'x' });
    DD.registerObject({ id: 'test_tmp_stack', name: 'Stack of Sourcebooks', blocksMove: true, hp: 2, desc: 'x' });
    try {
      A.placeObject(6, 2, 'test_tmp_candles');
      A.placeObject(6, 3, 'test_tmp_stack');
      let n0 = DD.Combat.state.log.length;
      A.destroyObject(3, 3, hero());
      A.destroyObject(6, 2, hero());
      A.destroyObject(6, 3, hero());
      A.destroyObject(5, 5, hero());
      const txt = logSince(n0);
      t.ok(/The Crate is destroyed\./.test(txt) && /The Candles are destroyed\./.test(txt) && /The Stack of Sourcebooks is destroyed\./.test(txt), 'case kept, "are" for Candles: ' + txt);
      t.ok(/The Vault Door is destroyed\./.test(txt) && !/The The/.test(txt), 'a label starting with "The" takes no second article');
      n0 = DD.Combat.state.log.length;
      A.destroyObject(4, 4, hero());
      t.ok(/A keg bursts/.test(logSince(n0)) && !/is destroyed/.test(logSince(n0)), 'an object that announces itself gets no second line: ' + logSince(n0));
      // statuses: "gains" for names that are nouns, "is" for the adjective ones; never "!." 
      DD.registerStatus({ id: 'test_tmp_thief', name: 'Thief!', type: 'debuff', desc: 'x' });
      n0 = DD.Combat.state.log.length;
      A.addStatus(hero(), 'test_tmp_thief');
      A.addStatus(hero(), 'weak');
      const st = logSince(n0);
      t.ok(/Wizzy McTest gains Thief!( |$)/.test(st) && !/!\./.test(st), 'a noun status: "gains Thief!" (' + st + ')');
      t.ok(/Wizzy McTest is Weakened\./.test(st), 'an adjective status: "is Weakened."');
    } finally { delete DD.defs.objects.test_tmp_candles; delete DD.defs.objects.test_tmp_stack; delete DD.defs.statuses.test_tmp_thief; }
  });
})();

// ---- review of the playtest fixes (Nov 12, adversarial reviewer): regressions for what the review found ----------
(function () {
  'use strict';
  const T = window.DD_TEST;
  const DD = window.DD;
  const H = T.helpers.H, E = T.helpers.E, hero = T.helpers.hero, foe = T.helpers.foe, quiet = T.helpers.quiet, keys = T.helpers.keys;

  T.suite('engine: playtest review — bosses-objectives-2: a Dazzle / Confuse that wears off before a wind-up lands moves nothing on the board', function (t) {
    const A = DD.Act, AI = DD.AI;
    // [status, its turns, the wind-up's turns]: a 1-turn status on a 2-turn wind-up ends at the owner's turn in between
    // (Grimble's and the Rat King's one-round wind-ups), so the board must keep the tiles it really lands on
    [['dazzled', 1, 1], ['dazzled', 1, 2], ['dazzled', 2, 2], ['dazzled', 2, 3], ['confused', 1, 1], ['confused', 1, 2], ['confused', 2, 2]].forEach(function (c) {
      quiet({ w: 11, h: 11, heroes: [H(4, 4)], enemies: [E(6, 6, 'test_boss')], enemyAi: false });
      const h = hero(0), b = foe();
      h.maxHp = h.hp = 99;
      const it = AI.windUp(b, 'test_boss_meteor', h, { turns: c[2] });
      const orig = keys(AI.intentTiles(b, it));
      A.addStatus(b, c[0], { turns: c[1] }, h);
      const drawn = keys(AI.intentTiles(b, it));
      const txt = AI.describe(b, it).text;
      const holds = c[1] >= c[2];
      let landed = null;
      const ex = AI.executeIntent;
      AI.executeIntent = function (u, i2) { if (i2 === it) landed = keys(AI.intentTiles(u, i2)); return ex.apply(this, arguments); };
      try { for (let k = 0; k < 12 && !landed; k++) DD.Combat.endTurn(); } finally { AI.executeIntent = ex; }
      const tag = c[0] + ' ' + c[1] + ' turn(s), a ' + c[2] + '-turn wind-up';
      t.eq(drawn !== orig, holds, tag + ': the marked tiles ' + (holds ? 'move' : 'stay'));
      t.eq(landed, drawn, tag + ': it lands on the tiles marked right after the status landed');
      t.ok(holds ? /on(to)? the tiles marked now/.test(txt) && !/wears off/.test(txt) : /but it wears off before this lands: it hits the tiles marked now/.test(txt),
        tag + ': the text says so (' + txt.replace(/^.*?(✨|😵)/, '$1') + ')');
    });
    // AI.lastsToLanding: an action used now / a wind-up landing now only asks whether the status is on
    quiet({ w: 11, h: 11, heroes: [H(4, 4)], enemies: [E(6, 6, 'test_boss')], enemyAi: false });
    A.addStatus(foe(), 'silenced', { turns: 1 }, hero());
    const it = AI.windUp(foe(), 'test_boss_meteor', hero(), { turns: 2 });
    t.ok(!AI.lastsToLanding(foe(), it, 'silenced') && AI.lastsToLanding(foe(), { windup: false }, 'silenced'), 'Silence 1 turn vs a 2-turn wind-up: worn off by then; an action now: on');
    t.ok(!AI.lastsToLanding(foe(), it, 'dazzled'), 'no status: false');
  });
})();

// ---- finish (Nov 14): lead decisions D1-D7 (engine part) and the last playtest / audit findings ------------------------
(function () {
  'use strict';
  const T = window.DD_TEST;
  const DD = window.DD;
  const H = T.helpers.H, E = T.helpers.E, hero = T.helpers.hero, foe = T.helpers.foe, quiet = T.helpers.quiet;
  function tile(x, y) { return DD.Grid.tile(x, y); }
  function has(u, id) { return DD.Act.hasStatus(u, id); }
  function objTargets(u, ref) { return DD.Targeting.validTargets(u, ref).filter(function (q) { return q.obj; }); }
  function give(u, id, level) { const s = DD.Act.makeSlot(id, level || 1); u.skills.push(s); return s; }
  function logFrom(n0) { return DD.Combat.state.log.slice(n0).map(function (l) { return l.text; }).join(' | '); }
  function scene(extra) {
    quiet(Object.assign({ w: 9, h: 9, heroes: [H(1, 4)], enemies: [E(8, 8)], enemyAi: false, objects: [{ x: 4, y: 4, id: 'crate' }] }, extra || {}));
    return hero(0);
  }
  function withSkills(defs, fn) {
    defs.forEach(function (d) { DD.registerSkill(d); });
    try { return fn(); } finally { defs.forEach(function (d) { delete DD.defs.skills[d.id]; }); }
  }
  // a spell with riders everywhere: on a unit it damages and charms, it heals the caster and pays gold (execute counts runs)
  let ran = 0;
  function riders(ctx) {
    ran++;
    const A = DD.Act;
    if (ctx.targetUnit) { A.damage(ctx.user, ctx.targetUnit, ctx.L.dmg || 0); A.addStatus(ctx.targetUnit, 'charmed', { turns: 1 }, ctx.user); }
    A.heal(ctx.user, ctx.user, 5);
    A.gainGold(3);
  }
  function spell(id, name, kind, levels, extra) {
    return Object.assign({ id: id, name: name, owner: 'test_mage', kind: kind, ap: 1, levels: levels,
      target: { type: 'unit', range: [1, 5], filter: 'enemy' }, desc: function () { return 'Riders.'; }, execute: riders }, extra || {});
  }

  T.suite('engine: finish — D1: every single-target damage skill (spells and utilities too) can break an object: its damage, nothing else', function (t) {
    const Tg = DD.Targeting, A = DD.Act, C = DD.Combat;
    withSkills([
      spell('test_tmp_heckle', 'Heckle', 'spell', [{ dmg: 4 }]),
      spell('test_tmp_sand', 'Sand', 'utility', [{ dmg: 2, r: 0 }, { dmg: 3, r: 1 }], { area: { shape: 'circle', size: function (L) { return L.r; } } }),
      spell('test_tmp_hex', 'Hex', 'spell', [{ turns: 2 }]),
      spell('test_tmp_hug', 'Group Hug', 'spell', [{ dmg: 3 }], { target: { type: 'unit', range: [1, 5], filter: 'enemy', objects: false } }),
    ], function () {
      let m = scene();
      const heckle = give(m, 'test_tmp_heckle'), sand = give(m, 'test_tmp_sand', 1), sand2 = give(m, 'test_tmp_sand', 2);
      const hex = give(m, 'test_tmp_hex'), hug = give(m, 'test_tmp_hug');
      t.ok(Tg.aimsAtObjects(m, heckle), 'a single-target damage SPELL aims at objects (lead decision D1)');
      let q = objTargets(m, heckle);
      t.ok(q.length === 1 && q[0].obj === 'crate' && q[0].dmg === 4 && q[0].hp === 6 && !q[0].breaks, 'the crate is a target for its listed 4 (' + JSON.stringify(q) + ')');
      t.ok(Tg.aimsAtObjects(m, sand) && objTargets(m, sand)[0].dmg === 2, 'a utility whose area is 0 at this level is single-target: it aims too');
      t.ok(!Tg.aimsAtObjects(m, sand2), '... not at the level its area grows (an area skill)');
      t.ok(!Tg.aimsAtObjects(m, hex) && objTargets(m, hex).length === 0, 'a spell that deals no damage: no object target');
      t.ok(!Tg.aimsAtObjects(m, hug) && objTargets(m, hug).length === 0, 'target.objects: false opts out');
      t.ok(!Tg.aimsAtObjects(m, DD.getSkill('test_chain_zap')), 'a chaining area spell (custom area): no');
      // preview = reality, damage only
      const pv = Tg.preview(m, heckle, { x: 4, y: 4 });
      t.ok(!!pv.breaks && pv.breaks.text === 'Break: Crate − 4 damage, 2 HP left' && !pv.uncertain, 'preview: ' + (pv.breaks && pv.breaks.text));
      m.hp = m.maxHp - 8;
      const hp0 = m.hp, gold0 = A.gold();
      let n0 = DD.Combat.state.log.length;
      ran = 0;
      t.ok(C.useSkill(m, heckle, 4, 4), 'used on the crate');
      t.eq(tile(4, 4).obj.hp, 2, 'the crate took its 4');
      t.ok(ran === 0 && m.hp === hp0 && A.gold() === gold0 && m.ap === m.maxAp - 1, 'no execute: no heal, no gold, no riders; the AP is paid');
      t.ok(/Wizzy McTest turns Heckle on the Crate: 4 damage \(2 HP left\)\./.test(logFrom(n0)), 'a spell is "turned on" the crate (' + logFrom(n0) + ')');
      n0 = DD.Combat.state.log.length;
      t.ok(C.useSkill(m, heckle, 4, 4) && !tile(4, 4).obj, 'a second Heckle breaks it');
      t.ok(/turns Heckle on the Crate: 2 damage\. \S/.test(logFrom(n0)), '... with a quip (' + logFrom(n0) + ')');
      // a barrel still detonates outright
      m = scene({ objects: [{ x: 4, y: 4, id: 'barrel_explosive' }] });
      const h2 = give(m, 'test_tmp_heckle');
      q = objTargets(m, h2);
      t.ok(q.length === 1 && q[0].detonates === true, 'aimed at an explosive barrel: it detonates (' + JSON.stringify(q) + ')');
      t.ok(C.useSkill(m, h2, 4, 4) && !tile(4, 4).obj && /KABOOM/.test(logFrom(0)), 'KABOOM');
    });
  });

  T.suite('engine: finish — D2: an immovable hero can start a swap but can\'t be swapped (the refusal names him)', function (t) {
    const A = DD.Act, C = DD.Combat;
    quiet({ w: 7, h: 7, heroes: [H(2, 3, 'test_knight'), H(3, 3)], enemies: [E(6, 6)], enemyAi: false });
    const k = hero(0), m = hero(1);
    k.flags.immovable = true;
    const si = C.swapInfo(k, 3, 3);
    t.ok(!!si && si.ok === true, 'the immovable knight may start a swap (' + JSON.stringify(si && si.ok) + ')');
    t.ok(C.swap(k, 3, 3) && k.x === 3 && m.x === 2, 'he steps onto the mage\'s tile, the mage takes his');
    C.endTurn();
    t.eq(C.current(), m, 'the mage\'s turn');
    t.eq(C.canSwap(m, k.x, k.y), 'Sir Testsalot is immovable: he can start a swap, you can\'t move him.', 'the refusal reads as the lead wrote it');
    t.ok(!C.swapTargets(m).some(function (s) { return s.unitId === k.id; }), '... and he is no swap target');
    // pronouns: she for Ellaria, Sparrow and Kiri, he for the other heroes, it for the rest; the unit's / def's own wins
    const P = A.pronouns;
    t.eq(P({ kind: 'hero', defId: 'kiri' }).sub + '/' + P({ kind: 'hero', defId: 'sparrow' }).obj + '/' + P({ kind: 'hero', defId: 'ellaria' }).pos, 'she/her/her', 'Kiri, Sparrow, Ellaria: she / her');
    t.eq(P({ kind: 'hero', defId: 'slate' }).sub + '/' + P({ kind: 'hero', defId: 'slate' }).obj, 'he/him', 'Slate: he / him');
    t.eq(P({ kind: 'summon', defId: 'whatever' }).sub, 'it', 'a summon: it');
    t.eq(P({ kind: 'summon', defId: 'x', pronoun: 'they' }).obj, 'them', 'a unit\'s own pronoun wins');
  });

  // [finish review] the UI reviewer's two RULES requests: a move-0 immovable ally (Zarathor's statue) is told no swap
  // promise it can't keep; the Stealth tooltip names D3 (attacking an object ends it)
  T.suite('engine: finish review — a statue that never moves isn\'t offered "it can start a swap"; Stealth says objects end it', function (t) {
    const C = DD.Combat, A = DD.Act;
    if (!DD.getSummon('zar_statue') || !DD.getHero('zarathor')) { t.skip('needs zarathor.js (isolated run)'); return; }
    C.sandbox({ w: 7, h: 7, seed: 'rev-d2', noPlan: true, enemyAi: false, heroes: [{ id: 'zarathor', x: 1, y: 3 }, { id: 'test_mage', x: 3, y: 3 }],
      enemies: [{ id: 'test_grunt', x: 6, y: 6 }], objective: { type: 'custom', text: 'x' }, encounter: { id: 'rev', checkObjective: function () { return null; } } });
    const z = C.heroes().filter(function (u) { return u.defId === 'zarathor'; })[0], m = C.heroes().filter(function (u) { return u.defId === 'test_mage'; })[0];
    const st = A.summon(z, 'zar_statue', 3, 2, { silent: true });
    t.ok(!!st && A.isImmovable(st) && !(st.mov > 0) && st.x === 3 && st.y === 2, 'a statue next to the mage (immovable, move 0)');
    if (!C.isTurnOf(m)) C.giveTurnTo(m);
    t.eq(C.canSwap(m, st.x, st.y), st.name + ' is immovable: you can\'t move it.', 'the mage is told why, without "it can start a swap"');
    t.ok(C.swapInfo(st, m.x, m.y) === null || C.swapInfo(st, m.x, m.y).ok !== true, 'and the statue indeed never swaps');
    A.addStatus(m, 'stealth', { turns: 2 });
    const sd = DD.getStatus('stealth'), txt = sd.desc(A.getStatus(m, 'stealth'));
    t.ok(/Breaks when it deals damage or attacks an object/.test(txt), 'the Stealth tooltip names D3: ' + txt);
  });

  T.suite('engine: finish — D3: attacking an object ends Stealth exactly as attacking a unit does', function (t) {
    const A = DD.Act, C = DD.Combat;
    function sneak(extra) { const m = scene(extra); A.addStatus(m, 'stealth', { turns: 2 }); t.ok(has(m, 'stealth'), 'stealthed'); return m; }
    let m = sneak();
    t.ok(C.useSkill(m, m.basic, 4, 4) && tile(4, 4).obj.hp === 2, 'Magic Missile at the crate');
    t.ok(!has(m, 'stealth'), 'a crate shot reveals the shooter');
    m = sneak({ objects: [{ x: 4, y: 4, id: 'barrel_explosive' }] });
    C.useSkill(m, m.basic, 4, 4);
    t.ok(!tile(4, 4).obj && !has(m, 'stealth'), 'setting off a barrel on purpose reveals too');
    m = sneak({ objects: [{ x: 2, y: 4, id: 'totem' }], objective: { type: 'destroy', objId: 'totem', count: 1 } });
    t.ok(C.interact(m, 2, 4) && tile(2, 4).obj.hp === 5 && !has(m, 'stealth'), 'a Smash reveals');
    // environmental hits on objects don't (as on units): a blast credited to the stealthed hero, a shove into a crate
    m = sneak({ objects: [{ x: 6, y: 6, id: 'crate' }] });
    A.explode(m, 6, 7, { radius: 1, dmg: 2, element: null });
    t.ok(tile(6, 6).obj.hp === 4 && has(m, 'stealth'), 'a blast credited to him: still stealthed');
    A.damageObject(m, 6, 6, 1, { cause: 'bump' });
    t.ok(tile(6, 6).obj.hp === 3 && has(m, 'stealth'), 'a bump: still stealthed');
    A.damageObject(m, 6, 6, 1);
    t.ok(!has(m, 'stealth'), 'his own hit (a skill\'s damageObject, cause skill by default): revealed');
  });

  T.suite('engine: finish — D4: an object hit fires onSkillUsed (the use counts) with no target to ride on', function (t) {
    const A = DD.Act, C = DD.Combat;
    const seen = [];
    const m = scene({ objects: [{ x: 4, y: 4, id: 'crate', hp: 20, maxHp: 20 }], enemies: [E(1, 2)] });
    A.addRule({ id: 'test_rule_d4', name: 'Rider Watch', hooks: { onSkillUsed: function (ctx) {
      seen.push({ skill: ctx.skill.id, target: ctx.target ? ctx.target.x + ',' + ctx.target.y : null, hit: ctx.objectHit || null, foes: ctx.foes.length });
      // an Echo Chamber-style rider: the use again on the same target, if still valid
      if (ctx.target && !ctx.rpEcho && DD.Targeting.isValidTarget(ctx.user, ctx.slot, ctx.target.x, ctx.target.y)) C.resolveSkill(ctx.user, ctx.slot, ctx.target, { extra: { rpEcho: true } });
    } } });
    try {
      t.ok(C.useSkill(m, m.basic, 4, 4), 'Magic Missile at the crate');
      t.eq(seen.length, 1, 'onSkillUsed fired once (a use is a use)');
      t.ok(seen[0].target === null && !!seen[0].hit && seen[0].hit.id === 'crate' && seen[0].hit.x === 4 && seen[0].foes === 0,
        'no target, ctx.objectHit = the crate (' + JSON.stringify(seen[0]) + ')');
      t.eq(tile(4, 4).obj.hp, 16, 'no echo: the crate took one hit (4)');
      t.eq(m.basic.uses, 1, 'the use is counted on the slot');
      seen.length = 0;
      m.ap = 3;
      C.useSkill(m, m.basic, 1, 2);
      t.ok(seen.length === 2 && seen[0].target === '1,2' && !seen[0].hit, 'on a unit the rider sees its target (and echoes): ' + JSON.stringify(seen));
    } finally { A.removeRule('test_rule_d4'); }
  });

  T.suite('engine: finish — D7: a swap narrates now and then ({hero}, {ally}) and the mover\'s own swap barks name the ally', function (t) {
    const C = DD.Combat;
    const kdef = DD.getHero('test_knight');
    const saved = kdef.barks.swap, real = DD.narrate, fxBark = DD.FX.bark, rng = DD.rng;
    const narr = [], barks = [];
    kdef.barks.swap = ['After you, {ally}. No, I insist.'];
    DD.narrate = function (key, vars, r) { narr.push(key + ':' + (vars.hero || '') + '>' + (vars.ally || '')); return real.call(DD, key, vars, r); };
    DD.FX.bark = function (u, text) { barks.push(u.name + ': ' + text); };
    DD.rng = Object.assign(DD.RNG(5), { next: function () { return 0.01; } });
    try {
      quiet({ w: 7, h: 7, heroes: [H(2, 3, 'test_knight'), H(3, 3)], enemies: [E(6, 6)], enemyAi: false });
      t.ok(C.swap(hero(0), 3, 3), 'swapped');
      t.ok(narr.indexOf('swap:Sir Testsalot>Wizzy McTest') >= 0, 'narration key swap with {hero} and {ally} (' + narr.join(' ') + ')');
      t.ok(barks.indexOf('Sir Testsalot: After you, Wizzy McTest. No, I insist.') >= 0, 'his swap bark, {ally} filled in (' + barks.join(' / ') + ')');
    } finally {
      if (saved === undefined) delete kdef.barks.swap; else kdef.barks.swap = saved;
      DD.narrate = real; DD.FX.bark = fxBark; DD.rng = rng;
    }
  });

  T.suite('engine: finish — audit-1: the brutal row comes from DD.Balance (the engine\'s fallback matches it)', function (t) {
    const BR = DD.Balance.difficulty.brutal;
    quiet({ difficulty: 'brutal', heroes: [H(1, 1)], enemies: [E(2, 1)] });
    t.eq(DD.Combat.state.difficulty.hp, BR.hp, 'a brutal sandbox fight: x' + BR.hp + ' HP');
    t.eq(DD.Combat.state.difficulty.dmg, BR.dmg, '... and x' + BR.dmg + ' damage');
    const saved = DD.Balance.difficulty;
    try {
      DD.Balance.difficulty = null;
      t.eq(JSON.stringify(DD.Combat.DIFFICULTY.brutal), JSON.stringify({ hp: BR.hp, dmg: BR.dmg }), 'without DD.Balance the fallback row is the same');
    } finally { DD.Balance.difficulty = saved; }
  });

  T.suite('engine: finish — audit-3: an AI kill that ends the fight (the last hero standing) is worth more than any other kill', function (t) {
    const AI = DD.AI, A = DD.Act;
    quiet({ w: 8, h: 8, heroes: [H(1, 1), H(1, 3, 'test_knight')], enemies: [E(2, 2)], enemyAi: false });
    const m = hero(0), k = hero(1), g = foe();
    m.hp = 3;
    const far = { x: 7, y: 7 };
    const both = AI.targetValue(g, m, 6, 'melee', far);
    t.ok(!AI.endsFight(m), 'the knight still stands: downing the mage ends nothing');
    A.damage(g, k, 999);
    t.ok(k.downed && AI.endsFight(m), 'the knight is down: the mage is the last hero standing');
    const last = AI.targetValue(g, m, 6, 'melee', far);
    t.eq(Math.round(last - both), 30, 'the knockout that ends the fight is worth +30 (' + both + ' → ' + last + ')');
    t.eq(Math.round(AI.targetValue(g, m, 2, 'melee', far) - (both - 7)), 0, 'no kill, no bonus');
    t.eq(AI.targetBonus('melee', { kill: true, hero: true, last: true }) - AI.targetBonus('melee', { kill: true, hero: true }), 30, 'AI.targetBonus (AutoPlay\'s model) has the same term');
  });

  T.suite('engine: finish — audit-7: a hold that ends before the held unit\'s next turn doesn\'t pin its predicted reach', function (t) {
    const A = DD.Act, AI = DD.AI;
    let answer = true;
    DD.registerStatus({ id: 'test_tmp_held', name: 'Held', icon: '🤼', type: 'debuff', stacking: 'refresh', maxStacks: 1, decay: 'never', defaultTurns: 1, noMove: true,
      heldThrough: function () { return answer; }, desc: function () { return 'Held.'; } });
    try {
      quiet({ w: 9, h: 9, heroes: [H(1, 1)], enemies: [E(6, 6)], enemyAi: false });
      const g = foe();
      A.addStatus(g, 'test_tmp_held', { turns: 1 });
      const tiles = function () { return AI.reachOf(g).tiles.size; };
      t.ok(A.cantMove(g) && A.cantMoveNext(g), 'held now and (says the status) through its next turn');
      const pinned = tiles();
      answer = false;
      t.ok(A.cantMove(g) && !A.cantMoveNext(g), 'held now, free by its next turn (heldThrough false)');
      const free = tiles();
      t.ok(free > pinned, 'its predicted reach walks again (' + pinned + ' → ' + free + ' tiles)');
      A.removeStatus(g, 'test_tmp_held', { silent: true });
      t.eq(tiles(), free, '... the same reach as unheld');
      // own decays: a 1-turn Root holds through its next turn, except during its own turn (it ends at this turn's end)
      A.addStatus(g, 'root', { turns: 1, fresh: false });
      t.ok(A.cantMoveNext(g), 'Rooted 1 turn, the hero\'s turn now: still rooted on its next turn');
      const cur = DD.Combat.state.current;
      DD.Combat.state.current = g.id;   // as if it were acting now (a pure query reads whose turn it is)
      const free1 = !A.cantMoveNext(g);
      DD.Combat.state.current = cur;
      t.ok(free1, 'its own turn, 1 turn left: free on its next turn');
    } finally { delete DD.defs.statuses.test_tmp_held; }
  });

  T.suite('engine: finish — FF-6: an elemental status never sticks to a unit immune to its element (no Burning on a fire-proof hound)', function (t) {
    const A = DD.Act;
    quiet({ w: 7, h: 7, heroes: [H(1, 1)], enemies: [E(4, 4), E(5, 5)], enemyAi: false });
    const g = foe(0), g2 = foe(1);
    g.resist = { fire: 0, poison: 0 };
    t.ok(A.immuneTo(g, 'burn') && A.immuneTo(g, 'poison') && !A.immuneTo(g2, 'burn'), 'Act.immuneTo: resist 0 to the status\' element');
    t.eq(A.addStatus(g, 'burn', { stacks: 3 }), null, 'addStatus(fire-immune, burn) → null');
    t.eq(A.addStatus(g, 'poison', { stacks: 2 }), null, '... poison on a poison-immune unit too');
    t.ok(!has(g, 'burn') && !has(g, 'poison'), 'no stacks');
    t.ok(!!A.addStatus(g2, 'burn', { stacks: 2 }) && has(g2, 'burn'), 'a normal grunt burns');
    const n0 = DD.Combat.state.log.length;
    A.setSurface(4, 3, 'fire', 2);
    A.teleport(g, 4, 3);
    t.ok(!has(g, 'burn') && !/Test Grunt is Burning/.test(logFrom(n0)), 'stepping into fire: no Burning, no log line (' + logFrom(n0) + ')');
    g.resist = { fire: 0.5 };
    t.ok(!!A.addStatus(g, 'burn', { stacks: 1 }), 'a resistant (not immune) unit still burns');
  });
})();

// ---- V3 (act 4): E1 shared turns, E2 a unit's own entries, the new events, squads, banners, swaps, the modifyUse veto
// and DD.Cameo (js/engine/cameo.js). The fixtures' act-4 doors name their cameo actor (the Heckler), so these fights never
// meet Svammiel's triggers, loaded or not.
(function () {
  'use strict';
  const T = window.DD_TEST;
  const DD = window.DD;
  const H = T.helpers.H, E = T.helpers.E, hero = T.helpers.hero, foe = T.helpers.foe, sb = T.helpers.sb;
  function orderDefs() { return DD.Combat.order().map(function (e) { return e.unit.defId; }).join(' '); }
  function grab(defId) { return DD.Combat.state.units.filter(function (u) { return u.defId === defId && !u.dead; })[0] || null; }
  function entriesOf(u) { return DD.Combat.state.order.filter(function (e) { return e.unitId === u.id; }); }
  function custom(extra) { return Object.assign({ objective: { type: 'custom', text: 'Testing' } }, extra || {}); }
  function withAiLog(fn) {
    const acts = [], orig = DD.AI.act;
    DD.AI.act = function (u) { acts.push({ round: DD.Combat.state.round, id: u.defId }); return orig.apply(DD.AI, arguments); };
    try { fn(); } finally { DD.AI.act = orig; }
    return acts;
  }

  T.suite('engine: V3 E1 — an actsWithOwner unit takes no entry while its owner lives: it acts right after the owner, then splits off', function (t) {
    let creeper = null;
    sb({ w: 9, h: 7, seed: 11, initiative: 'roll', noPlan: false, heroes: [H(1, 3, 'test_knight')],
      enemies: [E(7, 3, 'test_grunt'), E(7, 5, 'test_archer')], objective: { type: 'custom', text: 'Testing' },
      encounter: { id: 'test_e1', checkObjective: function () { return null; }, onStart: function () {
        creeper = DD.Act.spawn('test_creeper', 6, 1, { owner: grab('test_grunt'), noFx: true, silent: true });
      } } });
    const s = DD.Combat.state, grunt = grab('test_grunt'), archer = grab('test_archer');
    t.ok(!!creeper && creeper.ownerId === grunt.id, 'spawned with { owner } before initiative: ownerId set');
    t.eq(entriesOf(creeper).length, 0, 'no entry of its own (the first roll checks the owner directly)');
    t.ok(entriesOf(grunt).length === 1 && entriesOf(archer).length === 1, 'its owner and the others rolled');
    t.eq(DD.Combat.turnOwner(creeper), grunt, 'it acts on its owner\'s turn');
    t.eq(DD.Combat.groupOf(grunt).map(function (u) { return u.defId; }).join(' '), 'test_grunt test_creeper', 'the owner first, then the creeper');
    t.ok(DD.Combat.actsWithOwner(creeper) && !DD.Combat.actsWithOwner(archer), 'Combat.actsWithOwner reads the def');
    // round 2 is played whole inside these two calls (round 1's AI turns before the knight resolved inside start)
    const acts = withAiLog(function () { DD.Combat.endRound(); DD.Combat.endRound(); });
    const r2 = acts.filter(function (a) { return a.round === 2; }).map(function (a) { return a.id; });
    const gi = r2.indexOf('test_grunt');
    t.ok(gi >= 0 && r2[gi + 1] === 'test_creeper', 'round 2: the creeper acts right after the grunt (' + r2.join(', ') + ')');
    t.eq(r2.filter(function (x) { return x === 'test_creeper'; }).length, 1, 'once a round');
    // after initiative: a spawn with { owner } joins its owner's turn at once; one without the flag rolls for itself
    const c2 = DD.Act.spawn('test_creeper', 6, 5, { owner: archer, noFx: true, silent: true });
    t.ok(!!c2 && !(s.joining || []).some(function (e) { return e.unitId === c2.id; }) && DD.Combat.turnOwner(c2) === archer, 'mid-fight: no joining entry, it acts on its owner\'s turn');
    const m = DD.Act.spawn('test_minion', 5, 1, { owner: grunt, noFx: true, silent: true });
    t.ok(!!m && (s.joining || []).some(function (e) { return e.unitId === m.id; }) && DD.Combat.turnOwner(m) === null, 'an enemy without actsWithOwner rolls its own entry even with an owner');
    const c3 = DD.Act.spawn('test_minion', 4, 1, { owner: grunt, actsWithOwner: true, noFx: true, silent: true });
    t.ok(!!c3 && DD.Combat.turnOwner(c3) === grunt && !(s.joining || []).some(function (e) { return e.unitId === c3.id; }), 'opts.actsWithOwner flags one unit');
    // the owner dies: its creeper gets an entry of its own at the next round start
    DD.Act.kill(grunt, null, { cause: 'other' });
    t.eq(DD.Combat.turnOwner(creeper), null, 'the owner is dead: the creeper no longer acts on its turn');
    const acts2 = withAiLog(function () { DD.Combat.endRound(); });
    t.eq(entriesOf(creeper).length, 1, 'next round start: it rolled an entry of its own (split)');
    t.ok(acts2.some(function (a) { return a.id === 'test_creeper' && a.round === s.round; }) || acts2.some(function (a) { return a.id === 'test_creeper'; }), 'and it keeps acting');
    t.ok(entriesOf(c2).length === 0 && DD.Combat.turnOwner(c2) === archer, 'the other creeper still rides with its living owner');
  });

  T.suite('engine: V3 E1 — a sandbox in fixed order and a run of turns: the shared turn holds through rounds', function (t) {
    let creeper = null;
    sb({ w: 9, h: 7, noPlan: false, heroes: [H(1, 3, 'test_knight')], enemies: [E(7, 3, 'test_grunt')], objective: { type: 'custom', text: 'Testing' },
      encounter: { id: 'test_e1b', checkObjective: function () { return null; }, onStart: function () {
        creeper = DD.Act.spawn('test_creeper', 7, 1, { owner: grab('test_grunt'), noFx: true, silent: true });
      } } });
    t.eq(orderDefs(), 'test_knight test_grunt', 'heroesFirst: the knight, then the grunt — the creeper has no slot');
    const acts = withAiLog(function () { for (let i = 0; i < 3; i++) DD.Combat.endRound(); });
    [1, 2, 3].forEach(function (r) {
      const ids = acts.filter(function (a) { return a.round === r; }).map(function (a) { return a.id; }).join(' ');
      t.eq(ids, 'test_grunt test_creeper', 'round ' + r + ': ' + ids);
    });
    t.ok(!creeper.dead, 'the creeper is alive and well');
  });

  T.suite('engine: V3 E2 — a unit\'s own turnsPerRound adds or drops an entry at the next round start (rolled like a joiner)', function (t) {
    function fight(seed) {
      sb({ w: 8, h: 6, seed: seed, initiative: 'roll', enemyAi: false, heroes: [H(1, 2, 'test_knight')], enemies: [E(6, 2, 'test_grunt')],
        objective: { type: 'custom', text: 'Testing' }, encounter: { id: 'test_e2', checkObjective: function () { return null; } } });
      return foe(0);
    }
    const g = fight(5), s = DD.Combat.state;
    t.eq(DD.Combat.entriesPerRound(g), 1, 'a grunt: 1 entry a round');
    g.turnsPerRound = 2;
    t.eq(DD.Combat.entriesPerRound(g), 2, 'the unit\'s own turnsPerRound wins over its def');
    t.eq(entriesOf(g).length, 1, 'nothing changes mid-round');
    let turns = {};
    const off = DD.Events.on('turn:start', function (e) { if (e.unit === g) turns[e.round] = (turns[e.round] || 0) + 1; });
    const n0 = s.log.length;
    try {
      DD.Combat.endRound();
      t.eq(entriesOf(g).map(function (e) { return e.k; }).sort().join(','), '0,1', 'round ' + s.round + ' starts with two entries (k 0 and 1)');
      t.eq(DD.Combat.order().filter(function (e) { return e.unit === g; }).length, 2, 'Combat.order (the tracker) shows both');
      t.ok(s.log.slice(n0).some(function (l) { return /Test Grunt now takes 2 turns a round \(rolls \d+\)\./.test(l.text); }), 'the extra entry is rolled and logged');
      const r2 = s.round;
      DD.Combat.endRound();
      t.eq(turns[r2], 2, 'two turns in round ' + r2);
      g.turnsPerRound = 1;
      DD.Combat.endRound();
      t.eq(entriesOf(g).length, 1, 'back to 1: the extra entry is dropped at the next round start');
      t.eq(entriesOf(g)[0].k, 0, '... the first one stays');
      const r4 = s.round;
      DD.Combat.endRound();
      t.eq(turns[r4], 1, 'one turn in round ' + r4);
      g.turnsPerRound = 9;
      t.eq(DD.Combat.entriesPerRound(g), 4, 'clamped to 4');
      g.turnsPerRound = 'junk';
      t.eq(DD.Combat.entriesPerRound(g), 1, 'junk → the def\'s (1)');
      t.eq(DD.Combat.entriesPerRound(hero(0)), 1, 'heroes: always 1');
    } finally { off(); }
    // rolled with the combat RNG: the same seed gives the same extra roll
    const totals = [];
    [7, 7].forEach(function (seed) {
      const u = fight(seed);
      u.turnsPerRound = 3;
      DD.Combat.endRound();
      totals.push(entriesOf(u).map(function (e) { return e.k + ':' + e.total; }).sort().join(' '));
    });
    t.eq(totals[0], totals[1], 'deterministic per seed (' + totals[0] + ')');
    // robustness: a unit of an earlier fight is never given a turn (sandbox giveTurnTo)
    const stale = hero(0);
    fight(8);
    t.eq(DD.Combat.giveTurnTo(stale), false, 'giveTurnTo refuses a unit that is not in this fight');
  });

  T.suite('engine: V3 events — combat:ready (after onStart, before deployment / the roll), skill:used (real uses only), Act.log extra, addRule silent', function (t) {
    const seen = [];
    const offR = DD.Events.on('combat:ready', function (e) {
      seen.push({ phase: e.state.phase, order: e.state.order, onStart: !!e.state.data.onStartRan, round: e.state.round, deploy: e.state.deploy.active });
    });
    try {
      sb({ heroes: [H(1, 1)], enemies: [E(5, 5)], deploy: true, deployTiles: [{ x: 1, y: 1 }, { x: 1, y: 2 }],
        encounter: { id: 'test_ready', onStart: function (s) { s.data.onStartRan = true; } } });
    } finally { offR(); }
    t.eq(seen.length, 1, 'combat:ready fires once');
    t.ok(seen[0] && seen[0].onStart && seen[0].phase === 'setup' && seen[0].order === null && seen[0].round === 0, 'after encounter.onStart, before deployment and the initiative roll');
    t.eq(DD.Combat.state.phase, 'deploy', 'deployment opens after it');
    // skill:used: real uses, never previews or attacks of opportunity
    sb({ heroes: [H(1, 1, 'test_mage'), H(3, 3, 'test_knight')], enemies: [E(1, 3), E(4, 3)], enemyAi: false, objective: { type: 'custom', text: 'Testing' }, encounter: { id: 'test_used', checkObjective: function () { return null; } } });
    const used = [];
    const off = DD.Events.on('skill:used', function (e) { used.push(e); });
    try {
      const m = hero(0), k = hero(1);
      DD.Combat.preview(m, m.basic, 1, 3);
      t.eq(used.length, 0, 'a preview emits nothing');
      t.ok(DD.Combat.useSkill(m, m.basic, 1, 3), 'a real use');
      t.ok(used.length === 1 && used[0].unit === m && used[0].skill.id === 'test_bolt' && used[0].ctx && used[0].ctx.user === m, 'skill:used { unit, skill, ctx }');
      DD.Combat.endTurn();
      t.eq(DD.Combat.current(), k, 'the knight\'s turn');
      t.eq(DD.Combat.provokes(k, 3, 1).length, 1, 'walking off provokes the grunt next to him');
      const n0 = used.length;
      let opp = 0;
      const offO = DD.Events.on('opportunity:attack', function () { opp++; });
      try { DD.Combat.move(k, 3, 1); } finally { offO(); }
      t.eq(opp, 1, 'the attack of opportunity happened');
      t.eq(used.length, n0, 'an attack of opportunity is no skill:used');
    } finally { off(); }
    // Act.log extra: merged into the entry (and combat:log), round / text / cls stay the engine's
    const logs = [];
    const offL = DD.Events.on('combat:log', function (e) { logs.push(e); });
    try {
      DD.Act.log('A test line.', 'cameo', { speaker: 'The Heckler', actor: 'test_heckler', cls: 'hacked', round: 99 });
    } finally { offL(); }
    const last = DD.Combat.state.log[DD.Combat.state.log.length - 1];
    t.ok(last.speaker === 'The Heckler' && last.actor === 'test_heckler' && last.cls === 'cameo' && last.round === DD.Combat.state.round && last.text === 'A test line.', 'the extra fields ride on the entry');
    t.ok(logs.length === 1 && logs[0].speaker === 'The Heckler', 'combat:log carries them');
    // addRule: silent logs nothing, and cheat / source / next are kept
    const n1 = DD.Combat.state.log.length;
    DD.Act.addRule({ id: 'test_silent', name: 'Hush', desc: 'Nothing.', silent: true, cheat: true, source: 'test_heckler', next: true });
    t.eq(DD.Combat.state.log.length, n1, 'a silent rule logs no "New rule:" line');
    const r = DD.Combat.state.rules.filter(function (x) { return x.id === 'test_silent'; })[0];
    t.ok(r && r.cheat === true && r.source === 'test_heckler' && r.next === true, 'cheat / source / next kept');
    DD.Act.addRule({ id: 'test_loud', name: 'Loud', desc: 'Everything.' });
    t.ok(/^New rule: Loud \(Everything\.\)$/.test(DD.Combat.state.log[DD.Combat.state.log.length - 1].text), 'a normal rule still announces itself');
  });

  T.suite('engine: V3 E10 / E11 / E12 — a squad in objective.bossIds, encounter.banner false, the swap count', function (t) {
    // E10
    sb({ w: 9, h: 7, heroes: [H(1, 3, 'test_knight')], enemies: [E(6, 2, 'test_brute'), E(6, 4, 'test_grunt'), E(7, 6, 'test_minion')], enemyAi: false,
      objective: { type: 'boss', bossIds: ['test_brute', 'test_grunt'] }, encounter: { id: 'test_e10', shortName: 'The Test Squad', name: 'The Test Squad of Many Letters' } });
    const s = DD.Combat.state;
    t.eq(s.objective.text, 'Defeat the Test Squad (2 left)', 'objective text from shortName ("the", N left)');
    t.eq(DD.Combat.bossUnits().map(function (u) { return u.defId; }).join(' '), 'test_brute test_grunt', 'bossUnits: the squad');
    DD.Act.kill(grab('test_grunt'), null, { cause: 'other' });
    DD.Combat.refreshObjective();
    t.ok(s.objective.text === 'Defeat the Test Squad (1 left)' && !s.result, 'one down: 1 left, the fight goes on');
    const late = DD.Act.spawn('test_grunt', 5, 5, { noFx: true, silent: true });
    DD.Combat.refreshObjective();
    t.eq(s.objective.text, 'Defeat the Test Squad (2 left)', 'a squad member arriving mid-fight counts too');
    DD.Act.kill(grab('test_brute'), null, { cause: 'other' });
    t.eq(s.result, null, 'the last one still stands');
    DD.Act.kill(late, null, { cause: 'other' });
    t.eq(s.result, 'victory', 'every unit of the squad\'s defs down: victory');
    const mn = s.units.filter(function (u) { return u.defId === 'test_minion'; })[0];
    t.ok(mn.dead && mn.fled, 'the rest flee');
    // E11 (FX are recorded, not played)
    const FX = DD.FX, was = FX.instant;
    const bannerCount = function (banner) {
      FX.reset();
      FX.instant = false;
      try {
        sb({ heroes: [H(1, 1)], enemies: [E(6, 5, 'test_boss')], enemyAi: false, encounter: { id: 'test_e11', banner: banner } });
        return { n: FX.queue.filter(function (e) { return e.type === 'banner' && e.text === 'The Test Overlord'; }).length,
          intro: DD.Combat.state.log.some(function (l) { return /cracks its knuckles/.test(l.text); }) };
      } finally { FX.reset(); FX.instant = was; }
    };
    const on = bannerCount(undefined), off = bannerCount(false);
    t.ok(on.n === 1 && on.intro, 'a boss fight shows its boss banner and logs the intro');
    t.ok(off.n === 0 && off.intro, 'banner: false: no banner (the cameo shows the opponent), the intro is still logged');
    // E12
    sb({ w: 9, h: 9, heroes: [H(2, 4), H(3, 4, 'test_knight')], enemies: [E(8, 8)], enemyAi: false, objective: { type: 'custom', text: 'Testing' }, encounter: { id: 'test_e12', checkObjective: function () { return null; } } });
    const s2 = DD.Combat.state;
    t.eq(s2.stats.swaps, 0, 'stats.swaps starts at 0');
    const undone = [];
    const offU = DD.Events.on('move:undone', function (e) { undone.push(e); });
    try {
      t.ok(DD.Combat.swap(hero(0), 3, 4) && s2.stats.swaps === 1, 'a hero swap move counts');
      t.ok(DD.Combat.undo() && s2.stats.swaps === 0, 'an undone swap does not');
      t.ok(undone.length === 1 && undone[0].kind === 'swap' && undone[0].unitId === hero(0).id && undone[0].to.x === 2 && undone[0].from.x === 3, 'move:undone { kind: swap, from, to }');
      t.ok(DD.Combat.swap(hero(0), 3, 4) && s2.stats.swaps === 1, 'swapped again: 1');
      DD.Combat.endTurn();
      const k = DD.Combat.current();
      t.ok(DD.Combat.move(k, 2, 7) && DD.Combat.undo(), 'a walk and its undo');
      const u2 = undone[undone.length - 1];
      t.ok(undone.length === 2 && u2.kind === 'move' && u2.unitId === k.id && u2.from.x === 2 && u2.from.y === 7 && Array.isArray(u2.path) && u2.path.length >= 1, 'move:undone { kind: move, from, to, path }');
    } finally { offU(); }
    t.ok(s2.stats.cameos === 0 && s2.stats.cheats === 0, 'stats.cameos / cheats start at 0');
  });

  T.suite('engine: V3 E13 — a rule\'s modifyUse refuses exactly one skill with its reason; useSkill and AutoPlay respect it; asking is pure', function (t) {
    let q0 = null;
    const ban = { id: 'test_ban', name: 'Ban', desc: 'No Fire Fixture.', hooks: { modifyUse: function (q) {
      if (!q0) q0 = Object.assign({}, q);
      DD.Combat.state.rng.next();   // a careless hook that rolls: the query puts the dice back
      if (q.skill.id === 'test_fireball') q.why = 'Bleeped by the tests (Fire Fixture).';
    } } };
    function fight(rules) {
      sb({ w: 9, h: 6, heroes: [H(1, 2, 'test_mage')], enemies: [E(5, 2, 'test_grunt'), E(5, 3, 'test_grunt')], enemyAi: false, rules: rules,
        objective: { type: 'custom', text: 'Testing' }, encounter: { id: 'test_e13', checkObjective: function () { return null; } } });
      const m = hero(0);
      return { m: m, fb: m.skills.filter(function (x) { return x.id === 'test_fireball'; })[0] };
    }
    const f = fight([ban]), s = DD.Combat.state;
    const rng0 = JSON.stringify(s.rng.getState()), mut0 = s.mutations;
    t.eq(DD.Combat.canUse(f.m, f.fb), 'Bleeped by the tests (Fire Fixture).', 'canUse returns the reason');
    t.ok(q0 && q0.unit === f.m && q0.skill && q0.slot && q0.level === 1 && q0.why === null, 'q = { unit, skill, slot, level, why: null }');
    t.eq(DD.Combat.canUse(f.m, f.m.basic), true, 'every other skill is fine');
    t.eq(DD.Combat.vetoOf(f.m, f.fb), 'Bleeped by the tests (Fire Fixture).', 'Combat.vetoOf answers the same');
    t.ok(JSON.stringify(s.rng.getState()) === rng0 && s.mutations === mut0 && f.m.ap === 3, 'asking is pure: no RNG draw, no state change');
    t.ok(!DD.Combat.useSkill(f.m, f.fb, 5, 2) && f.m.ap === 3 && f.fb.cd === 0, 'useSkill refuses it (no AP, no cooldown spent)');
    f.fb.cd = 2;
    t.eq(DD.Combat.canUse(f.m, f.fb), 'Bleeped by the tests (Fire Fixture).', 'the refusal wins over "On cooldown"');
    DD.Act.resetCooldowns(f.m);
    t.eq(DD.Combat.canUse(f.m, f.fb), 'Bleeped by the tests (Fire Fixture).', 'a cooldown reset changes nothing');
    // AutoPlay: with the ban it never casts it (without it, it would be on the table)
    function autoUses(rules) {
      fight(rules);
      const ids = [];
      DD.Act.addRule({ id: 'test_e13_spy', name: 'Spy', silent: true, hooks: { onSkillUsed: function (ctx) { if (!DD.Act.simulating && ctx.user && ctx.user.kind === 'hero') ids.push(ctx.skill.id); } } });
      for (let i = 0; i < 3 && !DD.Combat.state.result; i++) { DD.AutoPlay.takeTurn(); DD.Combat.endTurn(); }
      return ids;
    }
    const free = autoUses([]), banned = autoUses([ban]);
    const tally = function (ids) { const c = {}; ids.forEach(function (id) { c[id] = (c[id] || 0) + 1; }); return JSON.stringify(c); };
    t.log('AutoPlay without the ban: ' + tally(free) + ' · with it: ' + tally(banned));
    t.ok(banned.length > 0 && banned.indexOf('test_fireball') < 0, 'AutoPlay plays on and never picks the banned skill');
    // the fixtures' Muted Test (the Radio Edit's shape) through a real start cameo: the filled desc and the veto
    sb({ w: 10, h: 9, encounter: DD.getEncounter('test_a4_lane_d'), heroes: [H(1, 2, 'test_knight'), H(1, 4, 'test_mage')], enemies: [E(8, 4, 'test_boss')], enemyAi: false });
    const s3 = DD.Combat.state, mu = s3.data.testMute;
    const rule = s3.rules.filter(function (r) { return r.id === 'cameo:test_cheat_mute'; })[0];
    const owner = mu && DD.Combat.byId(mu.unitId);
    t.ok(!!rule && !!owner, 'the mute picked a hero skill (' + (mu && mu.skillId) + ')');
    t.ok(rule && /^.+ \((Sir Testsalot|Wizzy McTest)\) is muted: it can't be used this fight\.$/.test(rule.desc) && rule.desc.indexOf('<') < 0, 'the filled desc: ' + (rule && rule.desc));
    const sl = owner && DD.Combat.slotsOf(owner).filter(function (x) { return x.id === mu.skillId; })[0];
    if (owner && owner !== DD.Combat.current()) DD.Combat.endTurn();
    t.eq(DD.Combat.canUse(owner, sl), 'Muted by the Heckler (Muted Test).', 'refused all fight with the rule\'s reason');
  });

  // ---- DD.Cameo ----------------------------------------------------------------------------------------------------
  function door(id, cfg) {
    return sb(Object.assign({ w: 10, h: 9, encounter: DD.getEncounter(id), heroes: [H(1, 2, 'test_knight'), H(1, 4, 'test_mage')],
      enemies: [E(8, 4, 'test_boss')], enemyAi: false }, cfg || {}));
  }
  function cameoLines() { return DD.Combat.state.log.filter(function (l) { return l.cls === 'cameo'; }); }
  function pool(key) { return DD.defs.narration[key] || []; }

  T.suite('engine: V3 cameo — the start cameo: announcer, roast, the cheat in state.rules during deployment (exact desc, a Reason), memory and stats', function (t) {
    t.ok(DD.Cameo && DD.Cameo.stub === false, 'js/engine/cameo.js replaced the core stand-in');
    door('test_a4_lane_b', { deploy: true, deployTiles: [{ x: 1, y: 2 }, { x: 1, y: 4 }, { x: 1, y: 6 }] });
    const s = DD.Combat.state;
    t.eq(s.phase, 'deploy', 'deployment is open');
    const rule = s.rules.filter(function (r) { return r.id === 'cameo:test_cheat_rule'; })[0];
    t.ok(!!rule && rule.cheat === true && rule.source === 'test_heckler' && rule.silent === true && rule.turns === -1, 'the cheat is a rule before anyone deploys (cheat, source, silent, the whole fight)');
    t.ok(rule && rule.name === '🧪 Rigged Tests' && rule.desc === 'Heroes take 1 more damage from every hit this fight.', 'chip: icon + name, the exact desc');
    t.ok(!s.log.some(function (l) { return /^New rule:/.test(l.text); }), 'no "New rule:" line (the cameo announces it)');
    const lines = cameoLines();
    t.ok(lines.length >= 3 && lines.every(function (l) { return l.speaker === 'The Heckler' && l.actor === 'test_heckler'; }), 'cameo lines carry the speaker (' + lines.length + ')');
    t.ok(pool('test_heckle_cameo').indexOf(lines[0].text) >= 0, 'first the announcer line: ' + lines[0].text);
    const roasts = pool('test_heckle_hero_test_knight').map(function (l) { return l.replace(/\{hero\}/g, 'Sir Testsalot'); })
      .concat(pool('test_heckle_hero_test_mage').map(function (l) { return l.replace(/\{hero\}/g, 'Wizzy McTest'); }));
    t.ok(roasts.indexOf(lines[1].text) >= 0, 'then a roast of a hero in this fight ({hero} filled): ' + lines[1].text);
    const cheat = lines.filter(function (l) { return l.cheat === 'test_cheat_rule'; })[0];
    t.ok(cheat && /^🤡 The Heckler cheats: Rigged Tests\. Heroes take 1 more damage from every hit this fight\. Reason: (the tests said so|flaky|none)\.$/.test(cheat.text), 'the cheat line: ' + (cheat && cheat.text));
    t.ok(s.log.some(function (l) { return l.cls === 'narrator' && /^DM \(whispering\)/.test(l.text); }), 'the DM\'s counter whisper');
    t.ok(s.stats.cameos === 1 && s.stats.cheats === 1, 'stats: 1 cameo, 1 cheat');
    const h = DD.Cameo.history(s);
    t.ok(h.length === 1 && h[0].style === 'swoop' && h[0].cheat === 'test_cheat_rule' && h[0].actor === 'test_heckler' && h[0].round === 0, 'history: the start cameo with its cheat');
    t.eq(DD.Cameo.budget(s).used, 0, 'the start cameo never counts toward the budget');
    t.ok(s.data.cameo.mem && s.data.cameo.mem.cheats.indexOf('test_cheat_rule') >= 0 && s.data.cameo.mem.heroes.length === 1, 'no run: the fight keeps the memory');
    // the cheat works, and the estimate (the honesty rule) agrees
    DD.Combat.rollInitiative();
    const m = DD.Combat.heroes().filter(function (u) { return u.defId === 'test_mage'; })[0], b = foe(0);
    const est = DD.AI.estimate(b, m, 6), hp0 = m.hp;
    DD.Act.damage(b, m, 6, {});
    t.ok(est === 7 && hp0 - m.hp === 7, 'heroes take 1 more: estimate ' + est + ', dealt ' + (hp0 - m.hp));
    const g0 = b.hp;
    DD.Act.damage(m, b, 6, {});
    t.eq(g0 - b.hp, 5, 'the boss is not affected (armor 1)');
  });

  T.suite('engine: V3 cameo — a start cheat lands before the roll (modifyInitiative), apply may use state.rng and fill the desc, onRemove runs', function (t) {
    const def = DD.getCameo('test_heckler');
    def.cheats.zz_init = { id: 'zz_init', name: 'Favouritism', icon: '🤝', rounds: -1, desc: 'Enemies get +50 initiative.',
      quips: ['Favourites first. Obviously.'],
      hooks: { modifyInitiative: function (r) { if (r.unit.side === 'enemy') r.total += 50; } } };
    const enc = Object.assign({}, DD.getEncounter('test_a4_lane_a'), { id: 'test_zz_init', cameo: { actor: 'test_heckler', start: 'test_heckle_cameo', cheat: 'zz_init' } });
    try {
      const roll = function (cameo) {
        sb({ w: 9, h: 7, seed: 3, initiative: 'roll', encounter: enc, cameo: cameo, heroes: [H(1, 2, 'test_knight')], enemies: [E(7, 3, 'test_grunt')], enemyAi: false });
        return DD.Combat.state.order.filter(function (e) { return e.side === 'enemy'; })[0].total;
      };
      const plain = roll(false), cheated = roll(undefined);
      t.eq(cheated, plain + 50, 'the cheat\'s modifyInitiative changed the roll (' + plain + ' → ' + cheated + ')');
      t.eq(orderDefs().split(' ')[0], 'test_grunt', 'the favourite goes first');
      // a direct call (his own fight's way), the actor absent: its own banner and a bubble with the card; no quip pool,
      // so the cheat's own `quips` line
      const FX = DD.FX, was = FX.instant;
      try {
        roll(false);
        FX.reset();
        FX.instant = false;
        const n0 = DD.Combat.state.stats.cheats;
        const r = DD.Cameo.cheat('test_heckler', 'zz_init');
        const bn = FX.queue.filter(function (e) { return e.type === 'banner'; })[0];
        const ev = FX.queue.filter(function (e) { return e.type === 'cameo'; })[0];
        t.ok(!!r && r.cheat && DD.Combat.state.stats.cheats === n0 + 1, 'a direct cheat applies even with noCameo (a mechanic)');
        t.ok(bn && bn.text === 'THE HECKLER\'S RULE: Favouritism' && bn.sub === 'Enemies get +50 initiative.', 'its own banner: ' + (bn && bn.text));
        t.ok(ev && ev.style === 'bubble' && ev.cheat && ev.cheat.quip === 'Favourites first. Obviously.', 'a bubble with the card and the cheat\'s own quip');
        t.eq(DD.Cameo.history().filter(function (h) { return h.style === 'cheat'; }).length, 1, 'history: a cheat entry');
      } finally { FX.reset(); FX.instant = was; }
    } finally { delete def.cheats.zz_init; }
    // the crate: apply draws its tile from the combat RNG, fills the desc, and the rule's onRemove runs when it ends
    door('test_a4_lane_c', { seed: 9, enemies: [E(8, 4, 'test_boss'), E(8, 7, 'test_brute')] });
    const s = DD.Combat.state, c = s.data.testCrate;
    const rule = s.rules.filter(function (r) { return r.id === 'cameo:test_cheat_crate'; })[0];
    t.ok(!!c && DD.Grid.tile(c.x, c.y).obj && DD.Grid.tile(c.x, c.y).obj.id === 'crate', 'apply placed the crate at (' + (c && c.x) + ', ' + (c && c.y) + ')');
    t.ok(rule && rule.desc === 'A crate lands on (' + c.x + ', ' + c.y + ').', 'the filled desc is the rule\'s, the chip\'s and the log\'s: ' + (rule && rule.desc));
    t.ok(cameoLines().some(function (l) { return l.text.indexOf('A crate lands on (' + c.x + ', ' + c.y + ').') >= 0; }), 'the log line carries it');
    door('test_a4_lane_c', { seed: 9, enemies: [E(8, 4, 'test_boss'), E(8, 7, 'test_brute')] });
    t.eq(JSON.stringify(DD.Combat.state.data.testCrate), JSON.stringify(c), 'same seed, same crate (state.rng)');
    t.eq(DD.Combat.state.objective.text, 'Defeat the Test Brute Brigade (2 left)', 'the door\'s squad objective (E10, shortName)');
    for (let i = 0; i < 3 && !DD.Combat.state.result; i++) DD.Combat.endRound();
    t.ok(DD.Combat.state.data.testCrateRuleEnded && !DD.Combat.state.rules.some(function (r) { return r.id === 'cameo:test_cheat_crate'; }), 'rounds: 2 → the rule ends after round 2 and its onRemove ran');
  });

  T.suite('engine: V3 cameo — nothing in previews or dry runs (log, cameo memory, stats unchanged)', function (t) {
    door('test_a4_lane_a', { heroes: [H(1, 2, 'test_mage'), H(4, 2, 'test_knight'), H(1, 6, 'test_cleric')] });
    const s = DD.Combat.state, m = hero(0), k = hero(1);
    const snap = function () { return JSON.stringify({ log: s.log.length, cameo: s.data.cameo, stats: [s.stats.cameos, s.stats.cheats] }); };
    const before = snap();
    DD.Act.simulating = true;
    let n = 0, txt = '';
    try {
      n += DD.Cameo.fire('round:start', { round: 4 }) + DD.Cameo.fire('start', {}) + DD.Cameo.fire('unit:downed', { unit: k, unitId: k.id });
      txt += DD.Cameo.say('test_heckler', 'test_heckle_generic', {}, { force: true }) + DD.Cameo.play('test_heckler', 'Hello from a dream.', { force: true });
    } finally { DD.Act.simulating = false; }
    t.ok(n === 0 && txt === '', 'fire / say / play do nothing while simulating');
    t.eq(snap(), before, 'state unchanged');
    // a real preview that downs a hero (the Heckler has a heroDowned trigger): no trace
    k.hp = 1;
    const fb = m.skills.filter(function (x) { return x.id === 'test_fireball'; })[0];
    const pv = DD.Combat.preview(m, fb, 4, 2);
    t.ok(pv && pv.perUnit && pv.perUnit[k.id] && pv.perUnit[k.id].lethal, 'the preview downs the knight');
    t.eq(snap(), before, 'and nothing of the cameo moved');
    t.eq(DD.Cameo.history(s).length, 1, 'history: still the start cameo only');
  });

  T.suite('engine: V3 cameo — the budget: ≤ 3 a fight, ≤ 1 a round, ≥ 2 rounds apart, trigger order; start / entrance / forced lines never refused', function (t) {
    const snap = DD.Balance.snapshot();
    try {
      Object.assign(DD.Balance.cameo, { perFight: 3, perRound: 1, minGap: 2 });
      door('test_a4_lane_a');
      const s = DD.Combat.state;
      const say = function () { return DD.Cameo.say('test_heckler', 'test_heckle_generic'); };
      s.round = 1;
      t.ok(!!say(), 'round 1: an interjection plays');
      t.eq(say(), '', 'round 1 again: refused (1 a round)');
      s.round = 2;
      t.eq(say(), '', 'round 2: refused (2 rounds apart)');
      s.round = 3;
      t.ok(!!say(), 'round 3: plays');
      s.round = 5;
      t.ok(!!say(), 'round 5: plays');
      s.round = 7;
      t.eq(say(), '', 'round 7: refused (3 a fight)');
      t.ok(!!DD.Cameo.say('test_heckler', 'test_heckle_generic', {}, { force: true }), 'a forced line is never refused');
      t.ok(!!DD.Cameo.play('test_heckler', 'test_heckle_generic', { style: 'entrance' }), 'an entrance is never refused');
      const b = DD.Cameo.budget(s);
      t.ok(b.used === 3 && b.left === 0 && b.lastRound === 5, 'budget(): ' + JSON.stringify(b));
      t.eq(s.stats.cameos, 1 + 3 + 2, 'every cameo counts in stats.cameos (start + 3 + forced + entrance)');
      DD.Balance.cameo.perRound = 2;
      door('test_a4_lane_a');
      DD.Combat.state.round = 4;
      t.ok(!!say() && !!say() && say() === '', 'perRound 2: two in a round, not three');
    } finally { DD.Balance.restore(snap); }
    // priority: two triggers on one event → the first one listed plays
    DD.registerNarration('test_zz_first', ['First!']);
    DD.registerNarration('test_zz_second', ['Second!']);
    DD.registerCameo({ id: 'zz_prio', name: 'Priority Tester', triggers: [
      { on: 'round', act: 4, key: 'test_zz_first', style: 'bubble' }, { on: 'round', act: 4, key: 'test_zz_second', style: 'bubble' }] });
    try {
      sb({ heroes: [H(1, 1)], enemies: [E(5, 5)], enemyAi: false, encounter: { id: 'zz_prio_enc', act: 4, cameo: { actor: 'zz_prio' } } });
      const h1 = DD.Cameo.history();
      t.ok(h1.length === 1 && h1[0].text === 'First!' && h1[0].round === 1, 'round 1 (the real round:start): the first trigger listed wins');
      DD.Combat.state.round = 6;
      const n = DD.Cameo.fire('round:start', { round: 6 });
      const h = DD.Cameo.history();
      t.ok(n === 1 && h.length === 2 && h[1].text === 'First!', 'round 6: again only the first (' + n + ')');
    } finally {
      delete DD.defs.cameos.zz_prio;
      delete DD.defs.narration.test_zz_first;
      delete DD.defs.narration.test_zz_second;
    }
  });

  T.suite('engine: V3 cameo — routing: absent → one cameo FX; present → barks on his unit, nothing swoops; Log only → no FX; instant mode → an empty queue', function (t) {
    const FX = DD.FX, was = FX.instant;
    const st = DD.Meta && DD.Meta.data && DD.Meta.data.settings;
    const had = st ? st.cameos : undefined;
    const cameoFx = function () { return FX.queue.filter(function (e) { return e.type === 'cameo'; }); };
    try {
      FX.reset();
      FX.instant = false;
      door('test_a4_lane_b');
      let ev = cameoFx();
      t.eq(ev.length, 1, 'absent: exactly one cameo FX event');
      const e = ev[0] || {};
      t.ok(e.style === 'swoop' && e.actor === 'test_heckler' && e.enemy === 'test_heckler_imp' && e.speaker === 'The Heckler', 'style swoop, the actor, his sprite, the speaker');
      t.ok(e.banner && e.banner.title === 'The Test Door of Flakiness' && /^The Heckler: ".+"$/.test(e.banner.sub) && e.banner.fit === true, 'banner: the encounter name, sub = his announcer line');
      t.ok(e.cheat && e.cheat.name === 'Rigged Tests' && e.cheat.icon === '🧪' && e.cheat.desc === 'Heroes take 1 more damage from every hit this fight.' && !!e.cheat.quip, 'the cheat card (name, icon, exact desc, a quip)');
      t.ok(e.ms === 3300 && !e.parallel && e.text === cameoLines()[1].text, 'Full with a card: 3.3 s, blocking; the bubble is the roast');
      FX.reset();
      door('test_a4_lane_a');
      t.eq(cameoFx()[0] && cameoFx()[0].ms, 2500, 'without a card: 2.5 s');
      FX.reset();
      // a bubble interjection: non-blocking
      DD.Combat.state.round = 3;
      DD.Cameo.say('test_heckler', 'test_heckle_generic');
      ev = cameoFx();
      t.ok(ev.length === 1 && ev[0].style === 'bubble' && ev[0].ms === 0 && ev[0].parallel === true, 'a bubble: ms 0, parallel (AI turns never wait for a heckle)');
      FX.reset();
      // present: his own fight
      sb({ w: 10, h: 9, encounter: DD.getEncounter('test_a4_finale'), heroes: [H(1, 2, 'test_knight'), H(1, 4, 'test_mage')],
        enemies: [E(8, 4, 'test_boss'), E(8, 6, 'test_heckler_imp')], enemyAi: false });
      const imp = grab('test_heckler_imp');
      t.eq(DD.Cameo.present(DD.Combat.state, 'test_heckler'), imp, 'present() finds his unit');
      t.eq(cameoFx().length, 0, 'present: no cameo FX (nothing swoops)');
      const said = cameoLines().map(function (l) { return l.text; });
      const barks = FX.queue.filter(function (x) { return x.type === 'bark' && x.unitId === imp.id; }).map(function (x) { return x.text; });
      t.ok(said.length >= 1 && said.every(function (l) { return barks.indexOf(l) >= 0; }), 'his lines are barks on his unit (and logged): ' + barks.join(' | '));
      FX.reset();
      if (st) {
        st.cameos = 'log';
        door('test_a4_lane_b');
        t.ok(cameoFx().length === 0 && cameoLines().length >= 3 && DD.Combat.state.rules.some(function (r) { return r.cheat; }), 'Log only: no FX, the same log and the same cheat');
        FX.reset();
        st.cameos = 'short';
        door('test_a4_lane_b');
        t.eq(cameoFx()[0] && cameoFx()[0].ms, 1200, 'Short: 1.2 s');
        FX.reset();
      } else t.log('DD.Meta settings missing: the Log only / Short checks skipped');
    } finally {
      FX.reset();
      FX.instant = was;
      if (st) { if (had === undefined) delete st.cameos; else st.cameos = had; }
    }
    // instant mode (tests, sims, headless): applied at once
    door('test_a4_lane_a');
    t.ok(!FX.busy() && FX.queue.length === 0, 'instant: the FX queue stays empty');
    t.ok(cameoLines().length >= 1 && cameoLines()[0].speaker === 'The Heckler' && DD.Combat.state.stats.cameos === 1, 'and the cameo is logged with its speaker');
    // noCameo: a sandbox's cameo: false and the page-wide DD.Balance.cameo.off
    door('test_a4_lane_b', { cameo: false });
    t.ok(DD.Combat.state.noCameo && cameoLines().length === 0 && !DD.Combat.state.rules.length, 'cameo: false: no line, no cheat');
    const snap = DD.Balance.snapshot();
    try {
      DD.Balance.cameo.off = 1;
      door('test_a4_lane_b');
      t.ok(DD.Combat.state.noCameo && cameoLines().length === 0 && !DD.Combat.state.rules.length, 'DD.Balance.cameo.off: no cameo in any fight of the page');
    } finally { DD.Balance.restore(snap); }
  });

  T.suite('engine: V3 cameo — determinism: a flavour cameo never draws state.rng (only a cheat\'s apply may)', function (t) {
    const stateAfter = function (id, cameo) {
      door(id, { seed: 21, cameo: cameo });
      return JSON.stringify(DD.Combat.state.rng.getState());
    };
    t.eq(stateAfter('test_a4_lane_a', undefined), stateAfter('test_a4_lane_a', false), 'the start cameo (lines, roast, comeback) leaves state.rng where no cameo leaves it');
    t.eq(stateAfter('test_a4_lane_b', undefined), stateAfter('test_a4_lane_b', false), 'a cheat without apply too');
    t.ok(stateAfter('test_a4_lane_c', undefined) !== stateAfter('test_a4_lane_c', false), 'the crate\'s apply rolled its tile (allowed)');
    door('test_a4_lane_a');
    const s = DD.Combat.state, r0 = JSON.stringify(s.rng.getState());
    s.round = 4;
    DD.Cameo.fire('round:start', { round: 4 });
    DD.Cameo.say('test_heckler', 'test_heckle_generic', {}, { force: true });
    DD.Cameo.fire('combat:end', { result: 'victory', state: s });
    t.ok(DD.Cameo.history(s).length >= 3, 'three more cameos played');
    t.eq(JSON.stringify(s.rng.getState()), r0, 'state.rng untouched');
    // a fight no trigger can match (acts 1-3, sandboxes) keeps no cameo memory at all
    sb({ heroes: [H(1, 1)], enemies: [E(2, 1, 'test_minion')], encounter: { id: 'test_a1_plain', act: 1, kind: 'boss' } });
    DD.Act.damage(foe(0), hero(0), 999, {});
    DD.Act.kill(foe(0), hero(0), { cause: 'other' });
    t.ok(DD.Combat.state.data.cameo === undefined && DD.Combat.state.stats.cameos === 0, 'an act-1 fight: no state.data.cameo, no cameo');
  });

  // Review (V3): a fight whose triggers all match on act / kind / encounter but whose `when` says no (the act-3 DM's
  // twist and shadow under a 3-act knob) used to get an empty state.data.cameo; the memory now starts with a live trigger.
  T.suite('engine: V3 cameo review — triggers whose `when` refuses leave no cameo memory; a live one starts it', function (t) {
    const enc = { id: 'rv_a4_not_a_test_fight', act: 4, kind: 'boss', name: 'Not a Test Fight', cameo: { actor: 'test_heckler' } };
    sb({ heroes: [H(1, 1, 'test_knight'), H(1, 3)], enemies: [E(5, 1, 'test_minion')], encounter: enc });
    const s = DD.Combat.state;
    s.round = 3;
    t.eq(DD.Cameo.fire('round:start', { round: 3 }), 0, 'round: the Heckler\'s act-4 trigger matches, its when refuses');
    DD.Act.damage(foe(0), hero(0), 999, {});
    t.eq(DD.Cameo.fire('combat:end', { result: 'victory', state: s }), 0, 'victory: refused too');
    t.ok(s.data.cameo === undefined && s.stats.cameos === 0 && !s.log.some(function (l) { return l.cls === 'cameo'; }), 'no state.data.cameo, no line, no stat');
    // the same actor in one of its own fights: the memory starts with the first live trigger
    door('test_a4_lane_a');
    t.ok(DD.Combat.state.data.cameo && DD.Combat.state.data.cameo.started === true, 'a live start trigger starts the memory');
  });

  // Review (V3, NARRATIVE's ask): unit:downed comes after the onDowned / onAllyDowned hooks, so a hook that stands the hero
  // right back up must not get a "down" heckle; friendly fire keeps {enemy} the opponent (actions.js narrates it so too).
  T.suite('engine: V3 cameo review — heroDowned skips a hero a hook stood back up; friendly fire never makes a hero the {enemy}', function (t) {
    DD.registerNarration('test_zz_rv', ['{enemy} got {hero}.']);
    DD.registerCameo({ id: 'zz_rv', name: 'Down Tester', triggers: [{ on: 'heroDowned', act: 4, key: 'test_zz_rv', style: 'bubble', force: true }] });
    try {
      sb({ heroes: [H(1, 1, 'test_knight'), H(1, 3)], enemies: [E(5, 1)], enemyAi: false,
        encounter: { id: 'zz_rv_enc', act: 4, kind: 'boss', name: 'Revive Test', cameo: { actor: 'zz_rv' } } });
      const s = DD.Combat.state, k = hero(0), m = hero(1);
      DD.Act.addRule({ id: 'zz_rv_angel', name: 'Guardian Test Angel', silent: true, turns: -1, hooks: {
        onDowned: function (u) { if (u && u.kind === 'hero' && !s.data.zzAngel) { s.data.zzAngel = 1; DD.Act.revive(u, 0.5); } } } });
      DD.Act.damage(foe(0), k, 999, {});
      t.ok(!k.downed && DD.Cameo.history(s).length === 0, 'stood back up by the hook before the event: no heckle');
      DD.Act.damage(foe(0), k, 999, {});
      const h1 = DD.Cameo.history(s);
      t.ok(k.downed && h1.length === 1 && h1[0].text === foe(0).name + ' got ' + k.name + '.', 'the first real down: one line, {enemy} the foe (' + (h1[0] && h1[0].text) + ')');
      DD.Act.damage(k, m, 999, {});
      const h2 = DD.Cameo.history(s);
      t.ok(m.downed && h2.length === 2 && h2[1].text === 'Revive Test got ' + m.name + '.', 'friendly fire: {enemy} stays the opponent (' + (h2[1] && h2[1].text) + ')');
    } finally {
      delete DD.defs.cameos.zz_rv;
      delete DD.defs.narration.test_zz_rv;
    }
  });

  T.suite('engine: V3 cameo — lines: never an absent hero, never an unfilled token, no repeat in a run until the pool is used up', function (t) {
    DD.registerNarration('test_zz_lines', ['Shady stole the tests.', 'Mocha forgot the stubs.', 'Hello {enemy}.', 'Hi {bogus}.', 'Plain one.', 'Plain two.']);
    try {
      const run = { act: 4, flags: {}, consumables: [], gold: 0, difficulty: 'normal' };
      door('test_a4_lane_a', { run: run });
      const got = [];
      for (let i = 0; i < 9; i++) got.push(DD.Cameo.say('test_heckler', 'test_zz_lines', {}, { force: true }));
      t.ok(got.every(function (x) { return x && !/Shady|Mocha/.test(x); }), 'never a line naming a hero who is not in this fight');
      t.ok(got.every(function (x) { return x.indexOf('{') < 0; }) && got.indexOf('Hello Test Door A.') >= 0, 'never an unfilled token ({enemy} = the door\'s shortName)');
      [0, 3, 6].forEach(function (i) {
        const three = got.slice(i, i + 3);
        t.eq(three.filter(function (x, j) { return three.indexOf(x) === j; }).length, 3, 'picks ' + (i + 1) + '-' + (i + 3) + ' all differ: ' + three.join(' | '));
      });
      t.ok(run.flags.cameo && Array.isArray(run.flags.cameo.lines.test_zz_lines), 'the memory lives in run.flags.cameo.lines');
      // the next fight of the run remembers (the roast picks a hero not roasted yet)
      const roasted = run.flags.cameo.heroes.slice();
      door('test_a4_lane_a', { run: run });
      t.ok(run.flags.cameo.heroes.length === 2 && run.flags.cameo.heroes.indexOf(roasted[0]) === 0, 'fight 2 roasts the other hero: ' + run.flags.cameo.heroes.join(', '));
      door('test_a4_lane_a', { run: run });
      t.ok(run.flags.cameo.heroes.length === 2 && pool('test_heckle_generic').indexOf(cameoLines()[1].text) >= 0, 'fight 3: everybody roasted, a generic line');
      // a situation goes first, once a run
      run.flags.testHeckleSituation = true;
      door('test_a4_lane_a', { run: run });
      t.eq(cameoLines()[1].text, 'Bob from Accounting owes me a code review.', 'a situation ({name}) beats the roast');
      door('test_a4_lane_a', { run: run });
      t.ok(cameoLines()[1].text !== 'Bob from Accounting owes me a code review.' && run.flags.cameo.situations.join() === 'test_heckle_sit_flag', 'once a run');
    } finally { delete DD.defs.narration.test_zz_lines; }
  });

  T.suite('engine: V3 cameo — the Bribe skips one start cheat and is spent; a fight without a cheat leaves it alone', function (t) {
    const run = { act: 4, flags: { cameo: { bribe: 1 } }, consumables: [], gold: 0, difficulty: 'normal' };
    door('test_a4_lane_a', { run: run });
    t.eq(run.flags.cameo.bribe, 1, 'no cheat to skip: the bribe waits');
    door('test_a4_lane_b', { run: run });
    const s = DD.Combat.state;
    t.ok(!s.rules.some(function (r) { return r.id === 'cameo:test_cheat_rule'; }) && s.stats.cheats === 0, 'the bribe skips the cheat');
    t.eq(run.flags.cameo.bribe, 0, 'and is spent');
    t.ok(cameoLines().some(function (l) { return l.bribe && l.text === 'A bribe? For ME? ...No rule this time.'; }), 'his bribe line instead');
    door('test_a4_lane_b', { run: run });
    t.ok(DD.Combat.state.rules.some(function (r) { return r.id === 'cameo:test_cheat_rule'; }) && run.flags.cameo.cheats.indexOf('test_cheat_rule') >= 0, 'the next fight: the cheat again, remembered in run.flags.cameo.cheats');
  });

  T.suite('engine: V3 cameo — triggers: act / kind / encounter / from / once / squad filters, the event payload, falsy keys, heroDowned once per hero, the victory quip', function (t) {
    const ctxs = [];
    DD.registerNarration('test_zz_trig', ['Zing!', 'Zang!', 'Zong!', 'Zung!']);
    DD.registerCameo({ id: 'zz_trig', name: 'Trigger Tester', triggers: [
      { on: 'round', act: 4, from: 3, key: 'test_zz_trig', style: 'bubble', force: true, when: function (s, e) { ctxs.push({ s: s, e: e }); return true; } },
      { on: 'kill', act: 4, squad: true, key: 'test_zz_trig', style: 'bubble', once: true, force: true },
      { on: 'heroDowned', act: 4, key: 'test_zz_trig', style: 'bubble', force: true },
      { on: 'signature', act: 4, key: 'test_zz_trig', style: 'bubble', force: true },
      { on: 'windupCancel', act: 4, key: 'test_zz_trig', style: 'bubble', force: true },
      { on: 'victory', act: 4, kind: 'boss', style: 'quip', force: true, keyOf: function (s, e) { return e.result === 'victory' && s.encounter.id === 'zz_trig_enc' ? 'test_zz_trig' : null; } },
      { on: 'round', act: 3, key: 'test_zz_trig', style: 'bubble', force: true },
      { on: 'round', act: 4, encounter: 'nope', key: 'test_zz_trig', style: 'bubble', force: true },
      { on: 'round', act: 4, kind: 'normal', key: 'test_zz_trig', style: 'bubble', force: true },
      { on: 'round', act: 4, style: 'bubble', force: true, keyOf: function () { return null; } },
    ] });
    DD.registerCameo({ id: 'zz_throw', name: 'Throw Tester', triggers: [{ on: 'round', key: 'test_zz_trig', style: 'bubble', force: true, when: function () { throw new Error('zz boom'); } }] });
    const p0 = DD.problems.length;
    try {
      sb({ w: 9, h: 7, heroes: [H(1, 1, 'test_knight'), H(1, 3, 'test_mage'), H(1, 5, 'test_cleric')], enemies: [E(6, 2), E(6, 4), E(7, 6, 'test_minion')], enemyAi: false,
        objective: { type: 'boss', bossIds: ['test_grunt'] }, encounter: { id: 'zz_trig_enc', act: 4, kind: 'boss', name: 'Trigger Test', cameo: { actor: 'zz_trig' } } });
      const s = DD.Combat.state;
      const count = function () { return DD.Cameo.history(s).length; };
      s.round = 2;
      t.eq(DD.Cameo.fire('round:start', { round: 2 }), 0, 'round 2: before `from` 3');
      s.round = 3;
      t.eq(DD.Cameo.fire('round:start', { round: 3 }), 1, 'round 3: exactly one (wrong act, encounter, kind and a falsy key all skip)');
      t.ok(ctxs.length === 1 && ctxs[0].s === s && ctxs[0].e.round === 3, 'when(state, payload): DD.Combat.state and the event payload');
      // throwing when = false (reported, then cleared here)
      t.ok(DD.problems.slice(p0).some(function (w) { return /zz boom/.test(w); }) === false, 'the throw tester is not in this fight (actor)');
      // heroDowned: once per hero
      const k = hero(0), m = hero(1);
      DD.Act.damage(foe(0), k, 999, {});
      t.ok(k.downed && count() === 2, 'a hero goes down: one line');
      DD.Act.revive(k, 0.5);
      DD.Act.damage(foe(0), k, 999, {});
      t.eq(count(), 2, 'the same hero again: no line');
      DD.Act.damage(foe(0), m, 999, {});
      t.eq(count(), 3, 'another hero: a line');
      const dl = DD.Cameo.history(s)[2];
      t.ok(dl.style === 'bubble' && dl.key === 'test_zz_trig', 'history entry: style and key');
      // signature: skill.hype >= 100 only
      t.eq(DD.Cameo.fire('skill:used', { unit: m, skill: DD.getSkill('test_bolt') }), 0, 'skill:used of a normal skill: nothing');
      t.eq(DD.Cameo.fire('skill:used', { unit: m, skill: DD.getSkill('test_mage_sig') }), 1, 'a signature: a line');
      // windupCancel: not on death
      t.eq(DD.Cameo.fire('windup:cancel', { unit: foe(0), unitId: foe(0).id, reason: 'death' }), 0, 'a wind-up dying with its owner: nothing');
      t.eq(DD.Cameo.fire('windup:cancel', { unit: foe(0), unitId: foe(0).id, reason: 'stun' }), 1, 'an interrupted wind-up: a line');
      // kill + squad + once
      const n0 = count();
      DD.Act.kill(grab('test_minion'), null, { cause: 'other' });
      t.eq(count(), n0, 'a minion (not in bossIds): nothing');
      DD.Act.kill(grab('test_grunt'), null, { cause: 'other' });
      t.eq(count(), n0 + 1, 'the first squad member down: a line');
      DD.Act.kill(grab('test_grunt'), null, { cause: 'other' });
      t.ok(s.result === 'victory', 'the squad is down: victory');
      const h = DD.Cameo.history(s);
      t.eq(h.length, n0 + 2, 'the second member: no line (once); the victory quip: one');
      t.ok(h[h.length - 1].style === 'quip' && s.log.some(function (l) { return l.cls === 'cameo' && l.style === 'quip'; }), 'the victory quip: logged, style quip');
      // a throwing when counts as false
      sb({ heroes: [H(1, 1)], enemies: [E(5, 5)], enemyAi: false, encounter: { id: 'zz_throw_enc', act: 4, cameo: { actor: 'zz_throw' } } });
      const thrown = function () { return DD.problems.slice(p0).filter(function (w) { return /zz boom/.test(w); }).length; };
      const th0 = thrown();
      t.eq(DD.Cameo.fire('round:start', { round: 1 }), 0, 'a throwing when: false');
      t.eq(thrown(), th0 + 1, 'reported through DD.safe');
      t.eq(DD.Cameo.history().length, 0, 'nothing played');
    } finally {
      for (let i = DD.problems.length - 1; i >= p0; i--) if (/zz boom/.test(DD.problems[i])) DD.problems.splice(i, 1);
      delete DD.defs.cameos.zz_trig;
      delete DD.defs.cameos.zz_throw;
      delete DD.defs.narration.test_zz_trig;
    }
  });

  T.suite('engine: V3 cameo — campaignGoesOn, interjections: false, a fixture door end to end (AutoPlay), the twist trigger shape', function (t) {
    const snap = DD.Balance.snapshot();
    try {
      DD.Balance.campaign.acts = 3;
      t.ok(!DD.Cameo.campaignGoesOn({ run: { act: 3 }, encounter: { act: 3 } }) && !DD.Cameo.campaignGoesOn({ run: null, encounter: { act: 3 } }), 'knob 3: the act-3 boss ends it');
      DD.Balance.campaign.acts = 4;
      t.ok(DD.Cameo.campaignGoesOn({ run: { act: 3 } }) && DD.Cameo.campaignGoesOn({ run: null, encounter: { act: 3 } }) && !DD.Cameo.campaignGoesOn({ run: { act: 4 } }), 'knob 4: act 3 goes on, act 4 is the end');
      t.ok(!DD.Cameo.campaignGoesOn({ run: null, encounter: null }), 'a fight with no act: false');
      // an entrance trigger on a victory (the twist's shape): force, played after the end
      DD.registerNarration('test_zz_twist', ['You thought this test was over?']);
      DD.registerCameo({ id: 'zz_twist', name: 'Twister', triggers: [{ on: 'victory', act: 3, kind: 'boss', key: 'test_zz_twist', style: 'entrance', force: true,
        banner: { title: 'YOU THOUGHT THIS WAS OVER?' }, bubble: 'Over?', when: function (s) { return DD.Cameo.campaignGoesOn(s); },
        then: function (s, e, played) { s.data.zzThen = played.text; } }] });
      const FX = DD.FX, was = FX.instant;
      try {
        FX.reset();
        FX.instant = false;
        sb({ heroes: [H(1, 1)], enemies: [E(2, 1, 'test_minion')], enemyAi: false, encounter: { id: 'zz_twist_enc', act: 3, kind: 'boss', cameo: { actor: 'zz_twist' } } });
        DD.Act.kill(foe(0), hero(0), { cause: 'other' });
        const s = DD.Combat.state;
        const ev = FX.queue.filter(function (e) { return e.type === 'cameo'; });
        t.ok(s.result === 'victory' && ev.length === 1 && ev[0].style === 'entrance' && ev[0].ms === 4500 && ev[0].text === 'Over?' && ev[0].banner.title === 'YOU THOUGHT THIS WAS OVER?', 'the entrance plays after the victory (banner, bubble, 4.5 s)');
        t.ok(cameoLines().some(function (l) { return l.text === 'You thought this test was over?'; }) && s.data.zzThen === 'You thought this test was over?', 'the full line is logged; then() ran with what played');
        DD.Balance.campaign.acts = 3;
        FX.reset();
        sb({ heroes: [H(1, 1)], enemies: [E(2, 1, 'test_minion')], enemyAi: false, encounter: { id: 'zz_twist_enc', act: 3, kind: 'boss', cameo: { actor: 'zz_twist' } } });
        DD.Act.kill(foe(0), hero(0), { cause: 'other' });
        t.eq(FX.queue.filter(function (e) { return e.type === 'cameo'; }).length, 0, 'knob 3: no twist');
      } finally {
        FX.reset();
        FX.instant = was;
        delete DD.defs.cameos.zz_twist;
        delete DD.defs.narration.test_zz_twist;
      }
    } finally { DD.Balance.restore(snap); }
    // interjections: false — the start cameo only
    door('test_a4_lane_d');
    const s = DD.Combat.state;
    s.round = 5;
    t.eq(DD.Cameo.fire('round:start', { round: 5 }), 0, 'interjections: false: the Heckler\'s round trigger stays quiet');
    t.ok(DD.Cameo.history(s).length === 1, 'the start cameo played');
    // a fixture door end to end: AutoPlay plays it, the cameo memory is plain data, nothing warns
    const p0 = DD.problems.length;
    door('test_a4_lane_b', { enemyAi: true, noPlan: false });
    const res = DD.AutoPlay.runBattle(20);
    const s2 = DD.Combat.state;
    t.ok(!!res && s2.stats.cameos >= 1 && s2.stats.cheats === 1, 'AutoPlay fought the door (' + res.result + ' in ' + res.rounds + '): ' + s2.stats.cameos + ' cameos, ' + s2.stats.cheats + ' cheat');
    t.ok(DD.Cameo.budget(s2).used <= 3, 'interjections within the budget (' + DD.Cameo.budget(s2).used + ')');
    t.ok((function () { try { JSON.stringify(s2.data.cameo); return true; } catch (e) { return false; } })(), 'state.data.cameo is plain data');
    t.eq(DD.problems.length, p0, 'no warnings');
  });
})();

// =====================================================================================================
// h19 QA fixes (QA FIXER, core cluster, Nov 20): previews name the AP an action gives; a signature name that already
// shouts is logged with one bang.
// =====================================================================================================
(function () {
  'use strict';
  const T = window.DD_TEST;
  const DD = window.DD;
  const H = T.helpers.H, E = T.helpers.E, hero = T.helpers.hero, quiet = T.helpers.quiet;
  function slotOf(u, id) { return DD.Combat.slotsOf(u).filter(function (s) { return s.id === id; })[0]; }

  T.suite('engine: h19 QA-BIZ-6 — a preview names the AP an action gives ("+1 AP" now, "+1 AP next turn" banked), never the actor\'s own cost', function (t) {
    const C = DD.Combat;
    quiet({ w: 9, h: 9, heroes: [H(1, 1, 'test_summoner'), H(1, 4, 'test_knight')], enemies: [E(8, 8)], enemyAi: false });
    const s = hero(0), k = hero(1);
    const tur = DD.Act.summon(s, 'test_turret', 3, 1, { ready: true, noFx: true });
    const gb = slotOf(s, 'test_bark_order');   // Good Boy!: 1 AP, "An ally gains 1 AP this turn."
    t.ok(!!tur && !!gb && C.isTurnOf(s) && C.isTurnOf(tur) && !C.isTurnOf(k), 'setup: the summoner\'s turn; the turret acts with it, the knight does not');
    // a unit of the acting group: AP to spend now
    const tAp = tur.ap, sAp = s.ap;
    const p = C.preview(s, gb, tur.x, tur.y);
    const e = p.perUnit[tur.id];
    t.ok(!!e && e.ap === 1 && !e.apNext && !p.uncertain && e.text === '+1 AP', 'the turret: ap 1, text "+1 AP" (' + (e && e.text) + ')');
    t.ok(!p.perUnit[s.id], 'the actor\'s own 1 AP cost is no entry (the card\'s pips show it)');
    t.ok(C.useSkill(s, gb, tur.x, tur.y) && tur.ap === tAp + 1 && s.ap === sAp - 1, 'the real use: the turret has 1 more AP now, the summoner paid 1 (preview = reality)');
    // another hero, whose turn it is not: banked for its next turn (Act.gainAp's apBank)
    gb.cd = 0; gb.usedThisTurn = false;
    const bank0 = k.apBank || 0, kAp = k.ap || 0;
    const p2 = C.preview(s, gb, k.x, k.y);
    const e2 = p2.perUnit[k.id];
    t.ok(!!e2 && e2.apNext === 1 && !e2.ap && e2.text === '+1 AP next turn', 'the knight: apNext 1, text "+1 AP next turn" (' + (e2 && e2.text) + ')');
    t.ok(!p2.perUnit[s.id], 'again no entry for the actor');
    t.ok(C.useSkill(s, gb, k.x, k.y) && (k.apBank || 0) === bank0 + 1 && (k.ap || 0) === kAp, 'the real use banks 1 AP for the knight\'s next turn');
    // an AP drain and a gift to the actor itself (inline defs: nothing paid), and an action that touches no AP
    const drain = { id: 'test_tmp_ap_drain', name: 'Tmp Drain', target: { type: 'unit', range: [0, 9], filter: 'any' }, levels: [{}],
      execute: function (ctx) { if (ctx.targetUnit) DD.Act.gainAp(ctx.targetUnit, -1); } };
    const e3 = DD.Targeting.preview(s, drain, { x: k.x, y: k.y }).perUnit[k.id];
    t.ok(!!e3 && e3.apNext === -1 && e3.text === '−1 AP next turn', 'a drain: "−1 AP next turn" (' + (e3 && e3.text) + ')');
    const self = { id: 'test_tmp_ap_self', name: 'Tmp Coffee', target: { type: 'self' }, levels: [{}],
      execute: function (ctx) { DD.Act.gainAp(ctx.user, 2); } };
    const e4 = DD.Targeting.preview(s, self, { x: s.x, y: s.y }).perUnit[s.id];
    t.ok(!!e4 && e4.ap === 2 && e4.text === '+2 AP', 'AP the action gives its own user shows: "+2 AP" (' + (e4 && e4.text) + ')');
    const fx = C.preview(s, slotOf(s, 'test_whip'), 2, 1);
    t.ok(!fx.perUnit[s.id], 'a skill that gives no AP: no actor entry');
    // a lethal hit says KO, not "−N AP"
    const kill = { id: 'test_tmp_ap_kill', name: 'Tmp Kill', target: { type: 'unit', range: [0, 9], filter: 'any' }, levels: [{}],
      execute: function (ctx) { if (ctx.targetUnit) DD.Act.kill(ctx.targetUnit, ctx.user); } };
    const e5 = DD.Targeting.preview(s, kill, { x: tur.x, y: tur.y }).perUnit[tur.id];
    t.ok(!!e5 && e5.lethal && !e5.ap && !/AP/.test(e5.text), 'a KO carries no AP change (' + (e5 && e5.text) + ')');
    // dice: the AP over other rolls (aggregate), never the real roll
    const dice = { id: 'test_tmp_ap_dice', name: 'Tmp Dice', target: { type: 'unit', range: [0, 9], filter: 'any' }, levels: [{}],
      execute: function (ctx) { if (ctx.targetUnit) DD.Act.gainAp(ctx.targetUnit, ctx.state.rng.next() < 0.5 ? 1 : 2); } };
    const pd = DD.Targeting.preview(s, dice, { x: tur.x, y: tur.y });
    const ed = pd.perUnit[tur.id];
    const agg = pd.samples > 1;
    t.ok(pd.uncertain && !!ed && ed.uncertain && /^\? /.test(ed.text) && ed.ap >= 1 && ed.ap <= 2 &&
      (agg ? ed.apMin >= 1 && ed.apMax <= 2 && /\+\d(–\d)? AP/.test(ed.text) : /\+[12] AP/.test(ed.text)),
      'a random gift: uncertain, "' + (ed && ed.text) + '" (' + pd.samples + ' samples)');
    // T.diff with no opts (AutoPlay's callers) reports the raw AP change
    s.ap = 2;
    const real = C.state;
    const raw = DD.Targeting.simulate(function (sim) {
      DD.Combat.byId(s.id).ap -= 1;
      return DD.Targeting.diff(real, sim, false);
    });
    t.ok(!!raw && raw.perUnit[s.id] && raw.perUnit[s.id].ap === -1 && raw.perUnit[s.id].text === '−1 AP', 'diff without opts: the raw change ("−1 AP")');
    const paid = DD.Targeting.simulate(function (sim) {
      DD.Combat.byId(s.id).ap -= 1;
      return DD.Targeting.diff(real, sim, false, { actor: s.id, paid: 1 });
    });
    t.ok(!!paid && !paid.perUnit[s.id], 'with { actor, paid: 1 }: the paid AP is left out');
  });

  T.suite('engine: h19 QA-BIZ-8 — a signature whose name already ends in "!" or "?" is logged with one bang', function (t) {
    const def = DD.getSkill('test_mage_sig'), name0 = def.name;
    try {
      [['Mass Assert', 'Mass Assert!'], ['Mass Assert!', 'Mass Assert!'], ['Mass Assert?', 'Mass Assert?']].forEach(function (c) {
        def.name = c[0];
        quiet({ heroes: [H(1, 1)], enemies: [E(4, 1), E(7, 7)], enemyAi: false });
        const h = hero(), s = DD.Combat.state;
        s.hype = 100;
        const n0 = s.log.length;
        t.ok(DD.Combat.useSkill(h, h.signature, h.x, h.y), '"' + c[0] + '": used');
        // h19:gate: match the skill's own name; the narrator's cosmetic signature pool (DD.rng) has an "unleashes" line too
        const line = s.log.slice(n0).filter(function (l) { return /unleashes Mass Assert/.test(l.text); })[0];
        t.eq(line && line.text, h.name + ' unleashes ' + c[1], 'logged "' + (line && line.text) + '"');
      });
    } finally { def.name = name0; }
  });
})();
