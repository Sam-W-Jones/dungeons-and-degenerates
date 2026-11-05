/* Dungeons and Degenerates — tests/autoplay_tests.js
 * AutoPlay suites ('autoplay: …') for v2 (initiative, no telegraphs): it plays the CURRENT hero's turn (and the
 * summons acting on it, only on it), spends its AP because unused AP is lost (no Guard), reads danger from boss wind-ups
 * (fixed, tracked, straight), every enemy's reach (walls, line of sight, its likely target, hits per turn it was seen to
 * deal) and threatAt auras, with exact odds of going down; it uses the initiative order (finish / stun the foe acting
 * next, Block the ally hit before its turn, step away from the enemy acting next, Help Up only when she can act first),
 * guards protected objects, walks by walking distance, values dice by their expected value, saves signatures for a big
 * moment, never runs an enemy planner, breaks stalemates and finishes whole fights (fixtures; one suite with real hero
 * kits). Scenes are quiet sandboxes: nobody else acts unless asked. Turn-order suites run each scene in both orders.
 */
(function () {
  'use strict';
  const DD = window.DD;
  const T = window.DD_TEST;
  if (!T) return;

  function S() { return DD.Combat.state; }
  function A() { return DD.Act; }
  function unitOf(defId, n) { return S().units.filter(function (u) { return u.defId === defId && !u.dead; })[n || 0] || null; }
  function key(p) { return p.x + ',' + p.y; }
  function missing(t, ids) {
    const gone = ids.filter(function (id) { return !DD.getHero(id) && !DD.getEnemy(id) && !DD.getSkill(id) && !DD.getConsumable(id) && !DD.getSummon(id); });
    if (gone.length) { t.skip('needs ' + gone.join(', ')); return true; }
    return false;
  }

  /** A quiet sandbox: the fight never ends by itself, enemies never act on their own (enemyAi: false), heroes first. */
  function arena(cfg) {
    DD.Combat.sandbox(Object.assign({
      w: 10, h: 10, seed: 'autoplay-tests', noPlan: true, enemyAi: false, theme: 'cellar',
      objective: { type: 'custom', text: 'AutoPlay test' }, encounter: { id: 'ap_arena', checkObjective: function () { return null; } },
    }, cfg));
    return S();
  }
  function hero(id, x, y, level, skills, extra) {
    return Object.assign({ id: id, x: x, y: y, level: level || 3, skills: (skills || []).map(function (s) { return typeof s === 'string' ? { id: s, level: 1 } : s; }) }, extra || {});
  }
  /** A boss-style wind-up of dmg on explicit tiles (what the board shows, which is what AutoPlay reads). */
  function bomb(enemy, tiles, dmg) {
    return DD.AI.windUp(enemy, 'test_lob', tiles[0], { anchor: 'ground', tiles: tiles, dmg: dmg, noCooldown: true });
  }
  function around(p, r) {
    const out = [];
    for (let y = p.y - r; y <= p.y + r; y++) for (let x = p.x - r; x <= p.x + r; x++) {
      if (Math.abs(x - p.x) + Math.abs(y - p.y) <= r && DD.Grid.inBounds(x, y)) out.push({ x: x, y: y });
    }
    return out;
  }
  function inTiles(u, tiles) { return tiles.some(function (p) { return p.x === u.x && p.y === u.y; }); }

  /** Run fn and record every real (not simulated) skill / consumable use and move: [{ who, kind, id, x, y }]. */
  function watch(fn) {
    const C = DD.Combat, log = [];
    const use = C.useSkill, cons = C.useConsumable, move = C.move;
    C.useSkill = function (u, slot, x, y) {
      const ok = use.apply(this, arguments);
      if (ok && !A().simulating) log.push({ who: u.defId, uid: u.id, kind: 'skill', id: slot && slot.id, x: x, y: y });
      return ok;
    };
    C.useConsumable = function (u, i, x, y) {
      const id = C.consumables()[i];
      const ok = cons.apply(this, arguments);
      if (ok && !A().simulating) log.push({ who: u.defId, uid: u.id, kind: 'consumable', id: id, x: x, y: y });
      return ok;
    };
    C.move = function (u, x, y) {
      const ok = move.apply(this, arguments);
      if (ok && !A().simulating) log.push({ who: u.defId, uid: u.id, kind: 'move', x: x, y: y });
      return ok;
    };
    try { fn(); } finally { C.useSkill = use; C.useConsumable = cons; C.move = move; }
    return log;
  }
  function used(log, id) { return log.filter(function (e) { return e.id === id; }); }
  function said(log) { return log.map(function (e) { return e.who.replace('test_', '') + ':' + (e.id || e.kind); }).join(', '); }
  function sane(t, label) {
    const s = S();
    t.ok(!!s && s.units.every(function (u) { return isFinite(u.hp) && isFinite(u.x) && isFinite(u.y); }), label + ': state sane');
  }

  // ---- v2 turns ------------------------------------------------------------------------------------------------------
  T.suite('autoplay: plays the current hero\'s turn only, then the next hero\'s (v2)', function (t) {
    if (missing(t, ['test_mage', 'test_cleric', 'test_grunt'])) return;
    arena({ heroes: [hero('test_mage', 2, 3), hero('test_cleric', 2, 6)], enemies: [{ id: 'test_grunt', x: 5, y: 3 }] });
    const m = unitOf('test_mage'), c = unitOf('test_cleric');
    let log = watch(function () { DD.AutoPlay.takeTurn(); });
    t.ok(log.length > 0 && log.every(function (e) { return e.who === 'test_mage'; }), 'takeTurn: only the mage acts (' + said(log) + ')');
    t.ok(DD.Combat.current() === m && c.ap === 0, 'it does not end the turn; the cleric has no AP yet');
    DD.Combat.endTurn();
    t.eq(DD.Combat.current(), c, 'the cleric\'s turn');
    log = watch(function () { DD.AutoPlay.takeTurn(); });
    t.ok(log.every(function (e) { return e.who === 'test_cleric'; }), 'takeTurn now plays the cleric (' + said(log) + ')');
    // during deployment it rolls initiative first
    arena({ heroes: [hero('test_mage', 0, 0)], enemies: [{ id: 'test_grunt', x: 5, y: 5 }], deploy: true, deployTiles: [{ x: 0, y: 0 }, { x: 0, y: 1 }] });
    DD.AutoPlay.takeTurn();
    t.ok(!!S().order && unitOf('test_mage').ap < unitOf('test_mage').maxAp, 'in deployment: rolls initiative, then plays the turn');
  });

  T.suite('autoplay: spends its AP when there is something to do (unused AP is lost, no Guard)', function (t) {
    if (missing(t, ['test_knight', 'test_brute'])) return;
    arena({ heroes: [hero('test_knight', 4, 5)], enemies: [{ id: 'test_brute', x: 5, y: 5 }] });
    const k = unitOf('test_knight');
    const log = watch(function () { DD.AutoPlay.takeTurn(); });
    t.ok(k.ap <= 0 || log.filter(function (e) { return e.kind === 'skill'; }).length >= 2, 'it attacks with its AP instead of keeping it (' + said(log) + ', ' + k.ap + ' AP left)');
    t.eq(k.block, 3, 'no Guard Block for whatever is left (just Overly Prepared\'s 3)');
  });

  // ---- danger: wind-ups ------------------------------------------------------------------------------------------------
  T.suite('autoplay: steps out of a boss wind-up', function (t) {
    if (missing(t, ['test_mage', 'test_boss', 'test_boss_meteor'])) return;
    const c = { x: 4, y: 5 };
    arena({ heroes: [hero('test_mage', c.x, c.y)], enemies: [{ id: 'test_boss', x: 9, y: 9 }] });
    const m = unitOf('test_mage'), boss = unitOf('test_boss');
    const w = DD.AI.windUp(boss, 'test_boss_meteor', m, {});
    const red = DD.AI.intentTiles(boss, w);
    t.eq(DD.AutoPlay.incomingAt(m, c.x, c.y).dmg, 14, 'in the red: the meteor\'s 14');
    t.eq(DD.AutoPlay.incomingAt(m, 1, 1).dmg, 0, 'out of it (and of the boss\'s reach): 0');
    DD.AutoPlay.takeTurn();
    t.ok(!inTiles(m, red), 'it ends its turn out of the red (' + key(m) + ')');
    // a two-turn wind-up is less urgent than one landing next turn
    arena({ heroes: [hero('test_mage', c.x, c.y)], enemies: [{ id: 'test_boss', x: 9, y: 9 }] });
    const m2 = unitOf('test_mage');
    DD.AI.windUp(unitOf('test_boss'), 'test_boss_meteor', m2, { turns: 2 });
    t.ok(DD.AutoPlay.incomingAt(m2, c.x, c.y).dmg < 14, 'turns: 2 counts for less (it lands after this hero\'s next turn)');
  });

  T.suite('autoplay: a straight tracked wind-up is dodged by leaving its row (target.straight)', function (t) {
    if (missing(t, ['test_knight', 'test_grunt'])) return;
    DD.registerSkill({ id: 'test_ap_lance', name: 'Test Lance', owner: 'enemy', icon: '🗡️', kind: 'attack', tags: ['ranged'], ap: 0, anchor: 'unit', cooldown: 2,
      levels: [{ dmg: 9 }], target: { type: 'unit', range: [1, 6], filter: 'enemy', straight: true },
      desc: function (L) { return 'Deal ' + L.dmg + ' damage in a straight line.'; },
      execute: function (ctx) { if (ctx.targetUnit) A().damage(ctx.user, ctx.targetUnit, ctx.L.dmg); } });
    try {
      arena({ heroes: [hero('test_knight', 2, 5)], enemies: [{ id: 'test_grunt', x: 7, y: 5 }] });
      const k = unitOf('test_knight'), g = unitOf('test_grunt');
      g.skillSlots = [DD.Act.makeSlot('test_ap_lance', 1)];
      DD.AI.windUp(g, 'test_ap_lance', k, { track: true });
      const after = 9 - (k.armor || 0);   // what it deals through his armor
      t.ok(DD.AutoPlay.incomingAt(k, 2, 5).dmg >= after, 'in its row: the lance reaches (' + DD.AutoPlay.incomingAt(k, 2, 5).dmg + ')');
      t.eq(DD.AutoPlay.incomingAt(k, 2, 4).dmg, 0, 'one step out of the row (still in range): safe (the lance is cooling down, so no other threat)');
      t.ok(DD.AutoPlay.incomingAt(k, 7, 1).dmg >= after, 'its column counts too');
    } finally { delete DD.defs.skills.test_ap_lance; }
  });

  // ---- danger: reach (no telegraphs) -------------------------------------------------------------------------------------
  T.suite('autoplay: reads every enemy\'s reach (no telegraphs) and stays out of a deadly one', function (t) {
    if (missing(t, ['test_mage', 'test_cleric', 'test_grunt', 'test_brute'])) return;
    arena({ heroes: [hero('test_mage', 1, 1), hero('test_cleric', 6, 6)], enemies: [{ id: 'test_grunt', x: 5, y: 5 }] });
    const m = unitOf('test_mage'), c = unitOf('test_cleric'), g = unitOf('test_grunt');
    t.eq(DD.AutoPlay.incomingAt(m, 1, 1).dmg, 0, 'out of the grunt\'s reach (move 3 + stab 1): nothing');
    t.eq(Math.round(DD.AutoPlay.incomingAt(m, 5, 2).dmg), 2, 'in its reach with the cleric there too: half its stab each (4 / 2)');
    t.eq(Math.round(DD.AutoPlay.incomingAt(c, 6, 6).dmg), 4, 'the cleric alone in reach: the whole stab');
    A().addStatus(g, 'stun', { turns: 1 });
    t.eq(DD.AutoPlay.incomingAt(c, 6, 6).dmg, 0, 'a stunned grunt loses its next turn: no threat');
    A().removeStatus(g, 'stun');
    A().addStatus(g, 'taunt', { turns: 1 }, m);
    t.eq(DD.AutoPlay.incomingAt(c, 6, 6).dmg, 0, 'taunted by the mage: it only threatens the mage');
    // a 6-HP mage near a brute (8-damage smash, reach 5) ends its turn out of that reach
    arena({ heroes: [hero('test_mage', 2, 5)], enemies: [{ id: 'test_brute', x: 7, y: 5 }] });
    const m2 = unitOf('test_mage'), b = unitOf('test_brute');
    m2.hp = 6;
    t.ok(DD.AI.reachOf(b).tiles.has('2,5'), 'premise: the brute could reach the mage');
    const log = watch(function () { DD.AutoPlay.takeTurn(); });
    t.ok(!m2.downed && !DD.AI.reachOf(b).tiles.has(key(m2)), 'it ends out of the brute\'s reach (' + key(m2) + '; ' + said(log) + ')');
  });

  T.suite('autoplay: threatAt auras are priced (Block-piercing ones too) and avoided', function (t) {
    if (missing(t, ['test_cleric', 'test_grunt'])) return;
    DD.registerStatus({ id: 'test_ap_glare', name: 'Glare', type: 'buff', defaultTurns: -1,
      hooks: { threatAt: function (enemy, unit, tile) { return unit.kind === 'hero' && DD.Grid.dist(enemy, tile) <= 4 ? { dmg: 10, label: 'Glare' } : 0; } } });
    DD.registerStatus({ id: 'test_ap_tax', name: 'Tax', type: 'buff', defaultTurns: -1,
      hooks: { threatAt: function (enemy, unit) { return unit.kind === 'hero' ? { dmg: 3, label: 'Tax', ignoreBlock: true } : 0; } } });
    try {
      arena({ heroes: [hero('test_cleric', 5, 5)], enemies: [{ id: 'test_grunt', x: 5, y: 2 }] });
      const c = unitOf('test_cleric'), g = unitOf('test_grunt');
      g.skillSlots = [];
      A().addStatus(g, 'test_ap_glare', { silent: true });
      t.eq(DD.AutoPlay.auraAt(g, c, 5, 5).dmg, 10, 'auraAt: inside the glare 10');
      t.eq(DD.AutoPlay.auraAt(g, c, 5, 9).dmg, 0, '... outside 0');
      DD.AutoPlay.takeTurn();
      t.eq(DD.AutoPlay.auraAt(g, c, c.x, c.y).dmg, 0, 'it walks out of the glare (' + key(c) + ')');
      A().addStatus(g, 'test_ap_tax', { silent: true });
      c.block = 20;
      const inc = DD.AutoPlay.incomingAt(c, c.x, c.y);
      t.ok(inc.pierce === 3, 'an ignoreBlock aura counts as Block-piercing damage');
    } finally { delete DD.defs.statuses.test_ap_glare; delete DD.defs.statuses.test_ap_tax; }
  });

  T.suite('autoplay: Help Up by turn order — not into a wind-up that lands before her turn, yes when she acts first', function (t) {
    if (missing(t, ['test_knight', 'test_cleric', 'test_mortar'])) return;
    // the knight's turn; the cleric lies downed next to him on a tile a 30-damage wind-up will hit at the mortar's turn
    const scene = function (threat, order) {
      arena({ heroes: [hero('test_knight', 4, 5), hero('test_cleric', 5, 5)], enemies: [{ id: 'test_mortar', x: 9, y: 0 }], order: order });
      const c = unitOf('test_cleric');
      A().damage(null, c, 999, { cause: 'other', ignoreArmor: true });
      if (threat) bomb(unitOf('test_mortar'), [{ x: 5, y: 5 }], 30);
      return c;
    };
    const c = scene(true, ['test_knight', 'test_mortar', 'test_cleric']);
    t.ok(c.downed && DD.Combat.current() === unitOf('test_knight'), 'premise: his turn, she is down on a tile about to take 30, the mortar acts before her');
    DD.AutoPlay.takeTurn();
    t.ok(c.downed, 'it lands before her turn: he does not help her up into the hit (a downed hero takes no damage)');
    const c1 = scene(true, ['test_knight', 'test_cleric', 'test_mortar']);
    DD.AutoPlay.takeTurn();
    t.ok(!c1.downed && c1.hp > 0, 'her turn comes before the mortar\'s: he helps her up (v2: she acts on her own slot)');
    DD.Combat.endTurn();
    t.eq(DD.Combat.current(), c1, 'her turn');
    DD.AutoPlay.takeTurn();
    t.ok(!(c1.x === 5 && c1.y === 5) && !c1.downed, 'and she walks out of the red herself (' + key(c1) + ')');
    const c2 = scene(false, ['test_knight', 'test_mortar', 'test_cleric']);
    DD.AutoPlay.takeTurn();
    t.ok(!c2.downed && c2.hp > 0, 'nothing coming: he helps her up at once');
  });

  // ---- v2 danger model: walls and sight, likely targets, odds -------------------------------------------------------------
  T.suite('autoplay: an archer\'s reach respects walls and line of sight (cover works without telegraphs)', function (t) {
    if (missing(t, ['test_mage', 'test_archer'])) return;
    // a wall at x = 5 (y 2..6) between the mage and the archer, which walks 3 and shoots 2-6 tiles with line of sight
    const wall = function (tl) { if (tl.x === 5 && tl.y >= 2 && tl.y <= 6) tl.t = 'wall'; };
    arena({ w: 12, h: 9, heroes: [hero('test_mage', 3, 4)], enemies: [{ id: 'test_archer', x: 10, y: 4 }], terrain: wall });
    const m = unitOf('test_mage'), a = unitOf('test_archer');
    t.ok(DD.AI.reachOf(a).tiles.has('3,4'), 'premise: the engine\'s rough reach (sight ignored past its walk) covers the mage');
    t.eq(DD.AutoPlay.incomingAt(m, 3, 4).dmg, 0, 'behind the wall: no line of sight from any tile it can walk to → nothing');
    t.ok(DD.AutoPlay.incomingAt(m, 6, 1).dmg > 3, 'in the open, in range and in sight: its 4-damage arrow counts (' + DD.AutoPlay.incomingAt(m, 6, 1).dmg.toFixed(2) + ')');
    t.eq(DD.AutoPlay.incomingAt(m, 2, 8).dmg, 0, 'out of its range after its walk: nothing');
    // a hurt mage out in the open, too far to kill it this turn: she ends her turn where it can't shoot her
    arena({ w: 12, h: 9, heroes: [hero('test_mage', 7, 7)], enemies: [{ id: 'test_archer', x: 10, y: 4 }], terrain: wall });
    const m2 = unitOf('test_mage'), a2 = unitOf('test_archer');
    m2.hp = 4;
    t.ok(DD.AutoPlay.incomingAt(m2, 7, 7).down > 0.5, 'premise: where she stands the arrow would likely down her');
    const log = watch(function () { DD.AutoPlay.takeTurn(); });
    t.ok(a2.dead || DD.AutoPlay.incomingAt(m2, m2.x, m2.y).dmg === 0, 'she ends out of its reach and sight (' + key(m2) + '; ' + said(log) + ')');
  });

  T.suite('autoplay: an enemy is expected to go for the kill (its likely target), not to split its hit evenly', function (t) {
    if (missing(t, ['test_knight', 'test_mage', 'test_grunt'])) return;
    arena({ heroes: [hero('test_knight', 4, 4), hero('test_mage', 6, 4)], enemies: [{ id: 'test_grunt', x: 5, y: 6 }] });
    const k = unitOf('test_knight'), m = unitOf('test_mage'), g = unitOf('test_grunt');
    const share = function (u) {
      const th = DD.AutoPlay.threats(k).filter(function (x) { return x.id === g.id; })[0];
      return th && th.victims[u.id] ? th.victims[u.id].p : 0;
    };
    const k0 = share(k), m0 = share(m);
    t.ok(Math.abs(k0 + m0 - 1) < 1e-6 && m0 > k0, 'both healthy: a split, a little more on the unarmored mage (' + k0.toFixed(2) + ' / ' + m0.toFixed(2) + ')');
    m.hp = 3;
    const k1 = share(k), m1 = share(m);
    t.ok(m1 > 0.8 && k1 < k0, 'the mage can be stabbed down: it will most likely go for her (' + m1.toFixed(2) + ')');
    const ki = DD.AutoPlay.incomingAt(k, 4, 4), mi = DD.AutoPlay.incomingAt(m, 6, 4);
    t.ok(ki.dmg < 1, 'so the knight next to it expects little (' + ki.dmg.toFixed(2) + ')');
    t.ok(mi.down > 0.7, 'and the mage expects to go down if she stays (' + mi.down.toFixed(2) + ')');
    A().addStatus(g, 'taunt', { turns: 1 }, k);
    t.ok(share(k) === 1 && share(m) === 0, 'taunted by the knight: only the knight');
  });

  T.suite('autoplay: the odds of the HP lost and of going down are exact (Block, certain and piercing damage)', function (t) {
    const L = DD.AutoPlay.lossOf;
    const close = function (a, b) { return Math.abs(a - b) < 1e-9; };
    const a = L([{ p: 0.5, d: 6 }, { p: 0.5, d: 6 }], 0, 0, 0, 10);
    t.ok(close(a.down, 0.25) && close(a.exp, 5.5), 'two coin-flip hits of 6 on 10 HP: down 25%, 5.5 HP expected (' + a.down + ', ' + a.exp + ')');
    const b = L([{ p: 0.5, d: 6 }, { p: 0.5, d: 6 }], 0, 0, 3, 10);
    t.ok(b.down === 0 && close(b.exp, 3.75), 'with 3 Block: never down, 3.75 expected (' + b.down + ', ' + b.exp + ')');
    const c = L([], 4, 2, 0, 6);
    t.ok(c.down === 1 && c.exp === 6, 'certain 4 + 2 piercing on 6 HP: down for sure');
    const d = L([{ p: 0.3, d: 5 }], 0, 3, 10, 7);
    t.ok(close(d.down, 0) && close(d.exp, 3), 'Block stops the hit, not the 3 piercing (' + d.exp + ')');
    const e = L([{ p: 1, d: 4 }, { p: 0.2, d: 4 }], 0, 0, 0, 8);
    t.ok(close(e.down, 0.2) && close(e.exp, 4.8), 'a sure hit and a long shot (' + e.down + ', ' + e.exp + ')');
  });

  T.suite('autoplay: an enemy seen hitting twice a turn is expected to do it again (learned in the fight, like a player)', function (t) {
    if (missing(t, ['test_knight', 'test_grunt', 'test_grunt_stab'])) return;
    DD.registerEnemy(Object.assign({}, DD.getEnemy('test_grunt'), { id: 'test_ap_double', name: 'Test Double Stabber',
      ai: function (unit, api) {
        const f = api.foes(unit).filter(function (o) { return api.dist(o, unit) === 1; })[0];
        if (f) { api.act(unit, 'test_grunt_stab', f); api.act(unit, 'test_grunt_stab', f); }
      } }));
    try {
      arena({ heroes: [hero('test_knight', 4, 4)], enemies: [{ id: 'test_ap_double', x: 5, y: 4 }], enemyAi: true, noPlan: false });
      const k = unitOf('test_knight'), d = unitOf('test_ap_double');
      const before = DD.AutoPlay.incomingAt(k, 4, 4);
      t.ok(DD.AutoPlay.hitsPerTurn(d) === 1 && Math.abs(before.hits - 1) < 1e-6, 'unseen: one hit expected (' + before.hits.toFixed(2) + ')');
      const hp0 = k.hp + k.block;
      DD.Combat.endTurn();
      t.ok(DD.Combat.current() === k && hp0 - (k.hp + k.block) === 6, 'premise: it stabbed him twice (3 + 3 through his armor)');
      const m = DD.AutoPlay.hitsPerTurn(d), after = DD.AutoPlay.incomingAt(k, 4, 4);
      t.ok(m > 1.5 && m < 2, 'one turn watched: about 1.7 hits a turn now (' + m.toFixed(2) + ')');
      t.ok(after.dmg > before.dmg * 1.5, 'so standing next to it is priced higher (' + before.dmg.toFixed(1) + ' → ' + after.dmg.toFixed(1) + ')');
      arena({ heroes: [hero('test_knight', 4, 4)], enemies: [{ id: 'test_ap_double', x: 5, y: 4 }] });
      t.eq(DD.AutoPlay.hitsPerTurn(unitOf('test_ap_double')), 1, 'a new fight starts fresh');
    } finally { delete DD.defs.enemies.test_ap_double; }
  });

  // ---- v2 turn order ---------------------------------------------------------------------------------------------------
  T.suite('autoplay: the turn plan follows initiative (rest of the round, next round, two turns a round, joiners, lost turns)', function (t) {
    if (missing(t, ['test_knight', 'test_mage', 'test_grunt', 'test_archer', 'test_minion'])) return;
    arena({ heroes: [hero('test_knight', 2, 2), hero('test_mage', 2, 6)], enemies: [{ id: 'test_grunt', x: 4, y: 2 }, { id: 'test_archer', x: 8, y: 6 }] });
    const k = unitOf('test_knight'), m = unitOf('test_mage'), g = unitOf('test_grunt'), a = unitOf('test_archer');
    DD.Combat.setOrder([k, g, m, a]);
    let p = DD.AutoPlay.turnPlan();
    t.ok(p.known && p.seqs[g.id][0] === 1 && p.next[m.id] === 2 && p.seqs[a.id][0] === 3 && p.L === 4, 'knight → grunt (1), mage (2), archer (3); his next turn is 4');
    DD.Combat.endTurn();
    t.eq(DD.Combat.current(), m, 'the grunt passed: the mage\'s turn');
    p = DD.AutoPlay.turnPlan();
    t.ok(p.seqs[a.id][0] === 1 && p.next[k.id] === 2 && p.seqs[g.id][0] === 3 && p.L === 4, 'from the mage: archer (1), next round knight (2), grunt (3), her next turn 4');
    // a unit arriving mid-round acts from the next round (fixed order: at its end) — after the mage's next turn here
    const minion = A().spawn('test_minion', 3, 6);
    p = DD.AutoPlay.turnPlan();
    t.ok(minion && !p.seqs[minion.id], 'a minion spawned now does not act before her next turn');
    t.ok(!DD.AutoPlay.threats(m).some(function (x) { return x.id === minion.id; }), 'so it is no threat yet');
    // a stunned enemy loses its next turn
    A().addStatus(a, 'stun', { turns: 1 }, m);
    t.ok(!DD.AutoPlay.threats(m).some(function (x) { return x.id === a.id; }), 'a stunned archer is no threat before her next turn');
    // two turns a round: two chances to hit
    DD.registerEnemy(Object.assign({}, DD.getEnemy('test_grunt'), { id: 'test_ap_twin', name: 'Test Twin', turnsPerRound: 2 }));
    try {
      arena({ heroes: [hero('test_mage', 2, 2)], enemies: [{ id: 'test_grunt', x: 4, y: 2 }] });
      const one = DD.AutoPlay.incomingAt(unitOf('test_mage'), 3, 2);
      arena({ heroes: [hero('test_mage', 2, 2)], enemies: [{ id: 'test_ap_twin', x: 4, y: 2 }] });
      const tw = unitOf('test_ap_twin');
      const plan2 = DD.AutoPlay.turnPlan();
      const two = DD.AutoPlay.incomingAt(unitOf('test_mage'), 3, 2);
      t.ok(plan2.seqs[tw.id] && plan2.seqs[tw.id].length === 2, 'turnsPerRound 2: two turns in the plan');
      t.ok(two.hits > one.hits * 1.9 && two.dmg > one.dmg * 1.9, 'and twice the hits (' + one.dmg.toFixed(1) + ' → ' + two.dmg.toFixed(1) + ')');
    } finally { delete DD.defs.enemies.test_ap_twin; }
  });

  T.suite('autoplay: with one hit left it finishes the wounded foe that acts next, before an ally can (initiative order)', function (t) {
    if (missing(t, ['test_knight', 'test_cleric', 'test_grunt'])) return;
    // two wounded grunts on either side of the knight, both able to reach the cleric; one acts right after him, the other
    // after the cleric
    const run = function (firstIsWest) {
      arena({ heroes: [hero('test_knight', 4, 4), hero('test_cleric', 4, 6)], enemies: [{ id: 'test_grunt', x: 3, y: 4 }, { id: 'test_grunt', x: 5, y: 4 }] });
      const k = unitOf('test_knight'), c = unitOf('test_cleric'), w = unitOf('test_grunt', 0), e = unitOf('test_grunt', 1);
      w.hp = 4; e.hp = 4; k.ap = 1;
      DD.Combat.setOrder(firstIsWest ? [k, w, c, e] : [k, e, c, w]);
      const log = watch(function () { DD.AutoPlay.takeTurn(); });
      return { w: w, e: e, log: log };
    };
    const r1 = run(true);
    t.ok(r1.w.dead && !r1.e.dead, 'the west grunt acts next: he kills it (' + said(r1.log) + ')');
    const r2 = run(false);
    t.ok(r2.e.dead && !r2.w.dead, 'the east grunt acts next: he kills that one instead (' + said(r2.log) + ')');
  });

  T.suite('autoplay: it disables the foe that acts before the ally it threatens (stun by turn order)', function (t) {
    if (missing(t, ['test_knight', 'test_mage', 'test_cleric', 'test_grunt'])) return;
    DD.registerSkill({ id: 'test_ap_bonk', name: 'Test Bonk', owner: 'generic', icon: '🔨', kind: 'attack', tags: ['stun'], ap: 1,
      levels: [{ dmg: 0, stun: 1 }], target: { type: 'unit', range: [1, 5], filter: 'enemy', los: false },
      desc: function () { return 'Stun a foe for 1 turn.'; },
      execute: function (ctx) { if (ctx.targetUnit) A().addStatus(ctx.targetUnit, 'stun', { turns: 1 }, ctx.user); } });
    try {
      // a 4-HP mage next to grunt W, a 4-HP cleric next to grunt E; the knight can stun one of them
      const run = function (mageFirst) {
        arena({ heroes: [hero('test_knight', 4, 4, 3, ['test_ap_bonk']), hero('test_mage', 2, 6), hero('test_cleric', 6, 6)],
          enemies: [{ id: 'test_grunt', x: 1, y: 6 }, { id: 'test_grunt', x: 7, y: 6 }] });
        const k = unitOf('test_knight'), m = unitOf('test_mage'), c = unitOf('test_cleric'), w = unitOf('test_grunt', 0), e = unitOf('test_grunt', 1);
        m.hp = 4; c.hp = 4; k.ap = 1;
        DD.Combat.setOrder(mageFirst ? [k, w, m, c, e] : [k, e, c, m, w]);
        const d = DD.AutoPlay.danger(k);
        const log = watch(function () { DD.AutoPlay.takeTurn(); });
        return { w: w, e: e, m: m, c: c, d: d, log: log };
      };
      const r1 = run(true);
      t.ok(r1.d[r1.m.id] > 2 * r1.d[r1.c.id], 'premise: the mage is hit before her turn, the cleric gets to act first (' + r1.d[r1.m.id].toFixed(1) + ' vs ' + r1.d[r1.c.id].toFixed(1) + ')');
      t.ok(DD.Combat.isStunned(r1.w) && !DD.Combat.isStunned(r1.e), 'he stuns the grunt that acts before the mage (' + said(r1.log) + ')');
      const r2 = run(false);
      t.ok(DD.Combat.isStunned(r2.e) && !DD.Combat.isStunned(r2.w), 'order flipped: he stuns the other one (' + said(r2.log) + ')');
    } finally { delete DD.defs.skills.test_ap_bonk; }
  });

  T.suite('autoplay: it protects the ally whose turn comes after its attacker\'s (Block by turn order)', function (t) {
    if (missing(t, ['test_knight', 'test_mage', 'test_cleric', 'test_grunt', 'test_guard_ally'])) return;
    const run = function (mageFirst) {
      arena({ heroes: [hero('test_knight', 4, 3, 3, ['test_guard_ally']), hero('test_mage', 3, 5), hero('test_cleric', 5, 5)],
        enemies: [{ id: 'test_grunt', x: 2, y: 5 }, { id: 'test_grunt', x: 6, y: 5 }] });
      const k = unitOf('test_knight'), m = unitOf('test_mage'), c = unitOf('test_cleric'), w = unitOf('test_grunt', 0), e = unitOf('test_grunt', 1);
      m.hp = 4; c.hp = 4; k.ap = 1;
      DD.Combat.setOrder(mageFirst ? [k, w, m, c, e] : [k, e, c, m, w]);
      const log = watch(function () { DD.AutoPlay.takeTurn(); });
      return { m: m, c: c, log: log };
    };
    const r1 = run(true);
    t.ok(r1.m.block > 0 && !(r1.c.block > 0), 'the grunt next to the mage acts before her: she gets the Block (' + said(r1.log) + ')');
    const r2 = run(false);
    t.ok(r2.c.block > 0 && !(r2.m.block > 0), 'order flipped: the cleric gets it (' + said(r2.log) + ')');
  });

  T.suite('autoplay: it steps out of the reach of the enemy acting next, toward the one an ally may stop first', function (t) {
    if (missing(t, ['test_cleric', 'test_mage', 'test_grunt'])) return;
    // a 3-row strip: wounded grunts W (2,1) and E (8,1) can each reach one half of it; the cleric (4 HP, one move left) has
    // to end in one of them. The mage (out of their reach: untargetable here) acts between the two grunts and could finish
    // whichever comes after her.
    const run = function (westFirst) {
      arena({ w: 11, h: 3, heroes: [hero('test_cleric', 5, 1), hero('test_mage', 5, 2)], enemies: [{ id: 'test_grunt', x: 2, y: 1 }, { id: 'test_grunt', x: 8, y: 1 }] });
      const c = unitOf('test_cleric'), m = unitOf('test_mage'), w = unitOf('test_grunt', 0), e = unitOf('test_grunt', 1);
      m.flags = Object.assign({}, m.flags, { untargetable: true });
      w.hp = 5; e.hp = 5; c.hp = 4; c.ap = 1;
      DD.Combat.setOrder(westFirst ? [c, w, m, e] : [c, e, m, w]);
      const west = DD.AutoPlay.incomingAt(c, 3, 0), east = DD.AutoPlay.incomingAt(c, 7, 0);
      const log = watch(function () { DD.AutoPlay.takeTurn(); });
      return { c: c, west: west, east: east, log: log };
    };
    const r1 = run(true);
    t.ok(r1.east.down < r1.west.down, 'W acts right after her, E only after the mage: the east half is safer (' + r1.west.down.toFixed(2) + ' vs ' + r1.east.down.toFixed(2) + ')');
    t.ok(r1.c.x >= 6, 'she steps east, out of the reach of the grunt acting next (' + key(r1.c) + '; ' + said(r1.log) + ')');
    const r2 = run(false);
    t.ok(r2.west.down < r2.east.down && r2.c.x <= 4, 'order flipped: she steps west (' + key(r2.c) + ')');
  });

  T.suite('autoplay: utility skills still go through exact previews (a rooted mage Blinks out of a deadly reach)', function (t) {
    if (missing(t, ['test_mage', 'test_brute', 'test_blink'])) return;
    arena({ heroes: [hero('test_mage', 4, 5, 3, ['test_blink'])], enemies: [{ id: 'test_brute', x: 5, y: 5 }] });
    const m = unitOf('test_mage'), b = unitOf('test_brute');
    m.hp = 7;
    A().addStatus(m, 'root', { turns: 1 }, b);
    A().addStatus(b, 'root', { turns: 1 }, m);   // it can't follow her either: a Blink of 3 gets her out of its reach
    t.ok(DD.AutoPlay.incomingAt(m, 4, 5).down > 0.5 && DD.Combat.cantMove(m), 'premise: rooted next to the brute, its smash would down her');
    t.eq(DD.AutoPlay.incomingAt(m, 1, 5).dmg, 0, 'premise: three tiles away it can\'t reach her');
    const log = watch(function () { DD.AutoPlay.takeTurn(); });
    t.eq(used(log, 'test_blink').length, 1, 'she Blinks (' + said(log) + ')');
    t.ok(DD.AutoPlay.incomingAt(m, m.x, m.y).down < 0.2, 'and ends where it can\'t reach her (' + key(m) + ')');
  });

  T.suite('autoplay: protect objectives — it stands in the way of the enemy going for the protected object', function (t) {
    if (missing(t, ['test_knight', 'test_grunt'])) return;
    DD.registerSkill({ id: 'test_ap_vandalize', name: 'Vandalize', owner: 'enemy', icon: '🔨', kind: 'attack', tags: ['melee', 'objects'], ap: 0,
      levels: [{ dmg: 4 }], target: { type: 'tile', range: [1, 1], filter: 'object' },
      desc: function (L) { return 'Deal ' + L.dmg + ' damage to an adjacent object.'; },
      execute: function (ctx) { if (ctx.target) A().damageObject(ctx.user, ctx.target.x, ctx.target.y, ctx.L.dmg); } });
    DD.registerEnemy(Object.assign({}, DD.getEnemy('test_grunt'), { id: 'test_ap_vandal', name: 'Test Vandal', skills: ['test_ap_vandalize'] }));
    try {
      const scene = function () {
        // the keg at (5,5); the vandal (move 3) can only get next to it from (5,4); the knight (move 3, too far to hit it)
        // can just get there first
        arena({ heroes: [hero('test_knight', 3, 7)], enemies: [{ id: 'test_ap_vandal', x: 5, y: 1 }], objects: [{ x: 5, y: 5, id: 'keg' }],
          objective: { type: 'protect', objId: 'keg' }, enemyAi: true, noPlan: false });
        return { k: unitOf('test_knight'), keg: function () { const tl = DD.Grid.tile(5, 5); return tl.obj ? tl.obj.hp : 0; } };
      };
      let sc = scene();
      const hp0 = sc.keg();
      DD.Combat.endTurn();
      t.ok(sc.keg() < hp0, 'premise: left alone, it smashes the keg (' + hp0 + ' → ' + sc.keg() + ')');
      sc = scene();
      const log = watch(function () { DD.AutoPlay.takeTurn(); });
      DD.Combat.endTurn();
      t.eq(sc.keg(), hp0, 'with AutoPlay the knight blocks its way and the keg is untouched (' + key(sc.k) + '; ' + said(log) + ')');
    } finally { delete DD.defs.enemies.test_ap_vandal; delete DD.defs.skills.test_ap_vandalize; }
  });

  // ---- summons, fairness ---------------------------------------------------------------------------------------------------
  T.suite('autoplay: summons act during their owner\'s turn only', function (t) {
    if (missing(t, ['test_summoner', 'test_hound', 'test_knight', 'test_grunt'])) return;
    arena({ w: 12, h: 10, heroes: [hero('test_summoner', 2, 4), hero('test_knight', 2, 7)],
      enemies: [{ id: 'test_grunt', x: 6, y: 4 }, { id: 'test_grunt', x: 7, y: 7 }] });
    const sm = unitOf('test_summoner'), k = unitOf('test_knight');
    const pup = S().units.filter(function (u) { return u.kind === 'summon' && u.ownerId === sm.id && !u.dead; })[0];
    t.ok(!!pup && DD.Combat.current() === sm && DD.Combat.turnGroup().indexOf(pup) >= 0, 'premise: her hound acts on her turn');
    const mine = watch(function () { DD.AutoPlay.takeTurn(); });
    t.ok(mine.some(function (e) { return e.uid === sm.id; }) && mine.some(function (e) { return e.uid === pup.id; }), 'her turn: she and the hound both act (' + said(mine) + ')');
    DD.Combat.endTurn();
    t.eq(DD.Combat.current(), k, 'the knight\'s turn');
    const his = watch(function () { DD.AutoPlay.takeTurn(); });
    t.ok(his.length > 0 && his.every(function (e) { return e.uid === k.id; }), 'his turn: only he acts, the hound waits for hers (' + said(his) + ')');
  });

  T.suite('autoplay: it never runs the enemies\' planners (it reads the board like a player)', function (t) {
    if (missing(t, ['test_knight', 'test_mage', 'test_grunt', 'test_archer', 'test_boss'])) return;
    arena({ w: 12, h: 10, heroes: [hero('test_knight', 3, 4), hero('test_mage', 2, 6)],
      enemies: [{ id: 'test_grunt', x: 6, y: 4 }, { id: 'test_archer', x: 9, y: 6 }, { id: 'test_boss', x: 9, y: 2 }] });
    const AI = DD.AI, names = ['act', 'bestAttack', 'defaultTurn', 'defaultPlan', 'useNow', 'executeIntent'], saved = {}, calls = {};
    names.forEach(function (n) { saved[n] = AI[n]; AI[n] = function () { calls[n] = (calls[n] || 0) + 1; return saved[n].apply(this, arguments); }; });
    const bossAi = DD.getEnemy('test_boss').ai;
    let planner = 0;
    DD.getEnemy('test_boss').ai = function () { planner++; return bossAi.apply(this, arguments); };
    try {
      DD.AutoPlay.takeTurn();
      DD.Combat.endTurn();
      DD.AutoPlay.takeTurn();
    } finally {
      names.forEach(function (n) { AI[n] = saved[n]; });
      DD.getEnemy('test_boss').ai = bossAi;
    }
    t.ok(!Object.keys(calls).length && !planner, 'two hero turns decided without any AI planner call (' + JSON.stringify(calls) + ', planner ' + planner + ')');
  });

  // ---- stalemates ----------------------------------------------------------------------------------------------------
  T.suite('autoplay: stalemate breaker — the enemies\' reach weighs nothing after three quiet rounds past round 6', function (t) {
    if (missing(t, ['test_knight', 'test_grunt'])) return;
    arena({ heroes: [hero('test_knight', 0, 0)], enemies: [{ id: 'test_grunt', x: 6, y: 6 }] });
    const k = unitOf('test_knight'), g = unitOf('test_grunt');
    const near = function () { return DD.AutoPlay.incomingAt(k, g.x - 1, g.y).dmg; };
    const seen = {};
    for (let i = 0; i < 8; i++) { seen[S().round] = { dmg: near(), st: DD.AutoPlay.stall() }; DD.Combat.endRound(); }
    t.ok(seen[1].dmg > 0 && seen[6].dmg === seen[1].dmg && seen[6].st.caution === 1, 'rounds 1-6: the grunt\'s reach counts in full (' + seen[1].dmg + ')');
    t.eq(seen[6].st.quiet, 5, 'nobody\'s HP changed for 5 rounds in a row');
    t.ok(seen[7].dmg === 0 && seen[7].st.caution === 0 && seen[8].dmg === 0, 'round 7 of a stalemate: the reach holds nobody back any more');
    A().damage(g, k, 2, { cause: 'other', ignoreArmor: true });
    DD.Combat.endRound();
    t.ok(DD.AutoPlay.stall().caution === 0, 'the knight getting hurt is no progress: still a stalemate (a last hero kiting a boss)');
    A().damage(k, g, 1, { cause: 'other', ignoreArmor: true });
    DD.Combat.endRound();
    const st = DD.AutoPlay.stall();
    t.ok(st.quiet === 0 && st.caution > 0 && near() > 0, 'the grunt got hurt (the party wears it down): caution is back (' + st.caution + ')');
    // survive objectives: holding out is the point, the streak never zeroes the caution
    arena({ heroes: [hero('test_knight', 0, 0)], enemies: [{ id: 'test_grunt', x: 6, y: 6 }], objective: { type: 'survive', rounds: 20 } });
    for (let i = 0; i < 9; i++) { DD.AutoPlay.stall(); DD.Combat.endRound(); }
    const sv = DD.AutoPlay.stall();
    t.ok(sv.quiet >= 3 && sv.caution > 0, 'survive N rounds: still cautious after ' + sv.quiet + ' quiet rounds (' + sv.caution + ')');
  });

  T.suite('autoplay: stalemate breaker — a hero held back by the enemies\' reach alone engages once the fight stalls', function (t) {
    if (missing(t, ['test_knight', 'test_grunt'])) return;
    // a corridor: three grunts that never come (enemyAi: false) but whose reach would down the hurt knight, so he keeps
    // out of it — until nothing has happened for long enough. With 2 AP (from round 2) there is no hit-and-run.
    arena({ w: 14, h: 3, heroes: [hero('test_knight', 0, 1)],
      enemies: [{ id: 'test_grunt', x: 11, y: 0 }, { id: 'test_grunt', x: 12, y: 1 }, { id: 'test_grunt', x: 11, y: 2 }] });
    const k = unitOf('test_knight');
    k.hp = 10;
    k.maxAp = 2;
    const grunts = DD.Combat.enemies();
    const hurt = function () { return grunts.some(function (g) { return g.hp < g.maxHp; }); };
    let firstHit = 0, at6 = null;
    for (let i = 0; i < 40 && !S().result && S().round <= 10 && !firstHit; i++) {
      if (DD.Combat.isPlayerTurn()) DD.AutoPlay.takeTurn();
      if (S().round === 6) at6 = DD.AutoPlay.stall();
      if (hurt()) firstHit = S().round;
      if (S().result || !DD.Combat.endTurn()) break;
    }
    t.ok(at6 && at6.quiet >= 3 && at6.caution === 1, 'rounds 1-6: the stall is noticed (' + (at6 && at6.quiet) + ' quiet rounds) but caution holds');
    t.ok(firstHit >= 7 && firstHit <= 9, 'after round 6 he goes in and hits one (round ' + firstHit + ')');
  });

  // ---- movement ------------------------------------------------------------------------------------------------------
  T.suite('autoplay: walks around a wall by walking distance (not Manhattan)', function (t) {
    if (missing(t, ['test_knight', 'test_grunt'])) return;
    arena({ heroes: [hero('test_knight', 2, 1)], enemies: [{ id: 'test_grunt', x: 7, y: 1 }],
      terrain: function (tl) { if (tl.x === 4 && tl.y <= 7) tl.t = 'wall'; } });
    const k = unitOf('test_knight'), g = unitOf('test_grunt');
    A().addStatus(g, 'root', { turns: 20 }, null);   // the goal stays put
    const field = function () { return DD.AutoPlay.distField(k, [{ x: g.x, y: g.y }], true); };
    const w = S().grid.w;
    const d0 = field()[k.y * w + k.x];
    t.ok(isFinite(d0) && d0 > 10, 'premise: the way round the wall is long (' + d0 + ')');
    DD.AutoPlay.takeTurn();
    const d1 = field()[k.y * w + k.x];
    t.ok(d1 <= d0 - 3, 'one turn later it is ' + (d0 - d1) + ' steps closer by walking (' + key(k) + ')');
    t.ok(k.y >= 3, 'it went down toward the gap, not right into the wall (' + key(k) + ')');
    for (let r = 0; r < 3 && !S().result; r++) { DD.Combat.endTurn(); if (!S().result) DD.AutoPlay.takeTurn(); }
    const d2 = field()[k.y * w + k.x];
    t.ok(d2 <= 1 || S().result, 'a few turns later it reached the grunt (' + key(k) + ', distance ' + d2 + ')');
  });

  // ---- dice, signatures, summons, consumables --------------------------------------------------------------------------
  T.suite('autoplay: dice are valued by their expected value, never by the real roll', function (t) {
    if (missing(t, ['test_knight', 'test_brute'])) return;
    const ids = ['test_ap_jackpot', 'test_ap_jab'];
    DD.registerSkill({ id: 'test_ap_jackpot', name: 'Test Jackpot', owner: 'generic', icon: '🎰', kind: 'attack', tags: ['random'], ap: 1,
      levels: [{ dmg: 0 }], target: { type: 'unit', range: [1, 1], filter: 'enemy' },
      desc: function () { return '1 in 1000: deal 500 damage.'; },
      execute: function (ctx) { if (ctx.targetUnit && ctx.rng.next() < 0.001) A().damage(ctx.user, ctx.targetUnit, 500); } });
    DD.registerSkill({ id: 'test_ap_jab', name: 'Test Jab', owner: 'generic', icon: '👊', kind: 'attack', tags: ['melee'], ap: 1,
      levels: [{ dmg: 9 }], target: { type: 'unit', range: [1, 1], filter: 'enemy' },
      desc: function (L) { return 'Deal ' + L.dmg + ' damage.'; },
      execute: function (ctx) { if (ctx.targetUnit) A().damage(ctx.user, ctx.targetUnit, ctx.L.dmg); } });
    try {
      arena({ heroes: [hero('test_knight', 4, 5, 3, ['test_ap_jackpot', 'test_ap_jab'])], enemies: [{ id: 'test_brute', x: 5, y: 5 }] });
      // set the combat dice so that the very next roll IS the jackpot: a cheating dry run would see 500 damage
      let seed = 1;
      while (DD.RNG(seed).next() >= 0.001 && seed < 200000) seed++;
      S().rng.setState(DD.RNG(seed).getState());
      t.ok(DD.RNG(seed).next() < 0.001, 'premise: the next real roll is a jackpot (seed ' + seed + ')');
      const log = watch(function () { DD.AutoPlay.takeTurn(); });
      t.eq(used(log, 'test_ap_jackpot').length, 0, 'AutoPlay never pulls the lever on a 1-in-1000 (' + said(log) + ')');
      t.ok(used(log, 'test_ap_jab').length >= 1, 'it jabs instead');
    } finally {
      ids.forEach(function (id) { delete DD.defs.skills[id]; });
    }
  });

  T.suite('autoplay: a signature waits for a big moment (not one lone grunt), then fires', function (t) {
    if (missing(t, ['test_knight', 'test_knight_sig', 'test_grunt'])) return;
    arena({ heroes: [hero('test_knight', 1, 5)],
      enemies: [{ id: 'test_grunt', x: 2, y: 5 }, { id: 'test_grunt', x: 8, y: 1 }, { id: 'test_grunt', x: 8, y: 5 }, { id: 'test_grunt', x: 8, y: 9 }] });
    S().hype = 100;
    const lone = watch(function () { DD.AutoPlay.takeTurn(); });
    t.eq(used(lone, 'test_knight_sig').length, 0, 'one grunt in reach of a 4-foe fight: no signature (' + said(lone) + ')');
    t.ok(S().hype >= 100, 'the Hype is kept');
    arena({ heroes: [hero('test_knight', 4, 5)],
      enemies: [{ id: 'test_grunt', x: 5, y: 5 }, { id: 'test_grunt', x: 4, y: 4 }, { id: 'test_grunt', x: 3, y: 5 }, { id: 'test_grunt', x: 9, y: 9 }] });
    S().hype = 100;
    const crowd = watch(function () { DD.AutoPlay.takeTurn(); });
    t.eq(used(crowd, 'test_knight_sig').length, 1, 'three grunts around him: Full Regression (' + said(crowd) + ')');
  });

  T.suite('autoplay: summons that arrive ready act the same turn (Release the Mocks)', function (t) {
    if (missing(t, ['test_summoner', 'test_summoner_sig', 'test_hound', 'test_grunt'])) return;
    arena({ w: 12, h: 12, heroes: [hero('test_summoner', 2, 5)],
      enemies: [{ id: 'test_grunt', x: 5, y: 5 }, { id: 'test_grunt', x: 6, y: 3 }, { id: 'test_grunt', x: 6, y: 7 }] });
    const sm = unitOf('test_summoner');
    S().units.filter(function (u) { return u.kind === 'summon'; }).forEach(function (u) { A().kill(u, null, { force: true }); });
    S().hype = 100;
    const log = watch(function () { DD.AutoPlay.takeTurn(); });
    const pups = S().units.filter(function (u) { return u.kind === 'summon' && u.ownerId === sm.id && !u.dead; });
    t.ok(used(log, 'test_summoner_sig').length === 1 && pups.length === 2, 'Mocha releases two hounds (' + said(log) + ')');
    t.ok(log.some(function (x) { return x.who === 'test_hound' && pups.some(function (p) { return p.id === x.uid; }); }), 'and they act this very turn (on her turn)');
  });

  T.suite('autoplay: drinks a potion only when it matters', function (t) {
    if (missing(t, ['test_knight', 'test_potion', 'test_grunt'])) return;
    arena({ heroes: [hero('test_knight', 1, 1)], enemies: [{ id: 'test_grunt', x: 8, y: 8 }], consumables: ['test_potion'] });
    unitOf('test_knight').hp = 6;
    DD.AutoPlay.takeTurn();
    t.ok(unitOf('test_knight').hp >= 16 && DD.Combat.consumables().length === 0, 'badly hurt: it drinks');
    arena({ heroes: [hero('test_knight', 1, 1)], enemies: [{ id: 'test_grunt', x: 8, y: 8 }], consumables: ['test_potion'] });
    unitOf('test_knight').hp -= 2;
    DD.AutoPlay.takeTurn();
    t.eq(DD.Combat.consumables().length, 1, 'scratched: the potion stays in the bag');
  });

  // ---- whole fights -----------------------------------------------------------------------------------------------------
  T.suite('autoplay: whole fights with rolled initiative finish, every hero takes turns', function (t) {
    if (missing(t, ['test_knight', 'test_mage', 'test_cleric', 'test_rogue', 'test_grunt', 'test_archer', 'test_healer'])) return;
    let fights = 0, wins = 0;
    ['a', 'b', 'c'].forEach(function (seed) {
      DD.Combat.sandbox({ w: 10, h: 9, seed: 'ap-roll-' + seed, initiative: 'roll',
        heroes: [hero('test_knight', 1, 3), hero('test_mage', 1, 5), hero('test_cleric', 0, 4), hero('test_rogue', 2, 4)],
        enemies: [{ id: 'test_grunt', x: 8, y: 3 }, { id: 'test_archer', x: 8, y: 5 }, { id: 'test_healer', x: 9, y: 4 }, { id: 'test_grunt', x: 9, y: 6 }] });
      const turns = {};
      const off = DD.Events.on('turn:start', function (e) { turns[e.unit.defId] = (turns[e.unit.defId] || 0) + 1; });
      const r = DD.AutoPlay.runBattle(30);
      off();
      fights++;
      if (r.result === 'victory') wins++;
      t.ok(!r.timeout, 'fight ' + seed + ' finished (' + r.result + ' in ' + r.rounds + ' rounds)');
      t.ok(['test_knight', 'test_mage', 'test_cleric', 'test_rogue'].every(function (id) { return turns[id] > 0; }), 'fight ' + seed + ': every hero got turns');
      sane(t, 'fight ' + seed);
    });
    t.log('fixture fights won: ' + wins + '/' + fights);
  });

  T.suite('autoplay: whole sandbox fights with real heroes stay sane and finish', function (t) {
    if (missing(t, ['zarathor', 'syllamin', 'ellaria', 'sparrow', 'marwyn', 'josiah', 'slate', 'buga', 'a1_gob_grunt', 'a1_gob_kid', 'a1_rat'])) return;
    const parties = [
      [hero('zarathor', 1, 3), hero('syllamin', 1, 5), hero('ellaria', 2, 4), hero('sparrow', 2, 6)],
      [hero('marwyn', 1, 3), hero('josiah', 1, 5), hero('slate', 2, 4), hero('buga', 2, 6)],
    ];
    let wins = 0;
    parties.forEach(function (heroes, i) {
      DD.Combat.sandbox({ w: 12, h: 10, seed: 'ap-fight-' + i, theme: 'cellar', initiative: 'roll', heroes: heroes.map(function (h) { delete h.skills; return h; }),
        enemies: [{ id: 'a1_gob_grunt', x: 9, y: 3 }, { id: 'a1_gob_kid', x: 9, y: 5 }, { id: 'a1_rat', x: 10, y: 4 }, { id: 'a1_gob_grunt', x: 10, y: 6 }],
        objects: [{ x: 5, y: 2, id: 'pillar' }, { x: 6, y: 7, id: 'crate' }] });
      const r = DD.AutoPlay.runBattle(30);
      t.ok(!r.timeout, 'fight ' + i + ' finished (' + r.result + ' in ' + r.rounds + ' rounds)');
      if (r.result === 'victory') wins++;
      sane(t, 'fight ' + i);
    });
    t.log('real parties vs a goblin band: ' + wins + '/2 won');
  });

  // ---- v2 attacks of opportunity (docs/notes/rules.md "Attacks of opportunity", "Targeting") ------------------------------
  /** Run fn and record the attacks of opportunity that really happened: [{ a: attacker defId, m: mover defId }]. */
  function opps(fn) {
    const seen = [];
    const off = DD.Events.on('opportunity:attack', function (e) { seen.push({ a: e.attacker.defId, m: e.mover.defId }); });
    try { fn(); } finally { off(); }
    return seen;
  }

  T.suite('autoplay: v2 attacks of opportunity — the enemy model knows engaged foes stick and pay to walk past a melee hero', function (t) {
    if (missing(t, ['test_knight', 'test_mage', 'test_grunt'])) return;
    // the grunt (4,4) is engaged with the knight (3,4); the mage (4,2) on 3 HP is one step away
    const scene = function () {
      arena({ heroes: [hero('test_mage', 4, 2), hero('test_knight', 3, 4)], enemies: [{ id: 'test_grunt', x: 4, y: 4 }] });
      const m = unitOf('test_mage'), k = unitOf('test_knight'), g = unitOf('test_grunt');
      m.hp = 3; k.block = 0;
      return { m: m, k: k, g: g };
    };
    const share = function (sc, u) {
      const th = DD.AutoPlay.threats(sc.m).filter(function (x) { return x.id === sc.g.id; })[0];
      return { p: th && th.victims[u.id] ? th.victims[u.id].p : 0, leave: th ? th.leave : 0 };
    };
    let sc = scene();
    const km = share(sc, sc.k), mm = share(sc, sc.m);
    t.ok(km.leave > 9 && km.p > 0.7 && mm.p < 0.25, 'engaged with the knight: it is expected to stab him (' + km.p.toFixed(2) + ') and leave the wounded mage (' + mm.p.toFixed(2) + '); walking away costs it ' + km.leave.toFixed(1));
    sc = scene();
    sc.k.oppRound = S().round;
    const k2 = share(sc, sc.k), m2 = share(sc, sc.m);
    t.ok(k2.leave === 0 && m2.p > 0.7, 'once the knight\'s reaction is spent nothing holds it: the mage is the likely target (' + m2.p.toFixed(2) + ')');
    sc = scene();
    DD.Act.teleport(sc.k, 7, 7);
    t.ok(share(sc, sc.m).p > 0.7, 'not engaged at all: it goes for the kill, like its own planner');
  });

  T.suite('autoplay: v2 attacks of opportunity — it does not walk away from a melee foe carelessly, it Blinks out', function (t) {
    if (missing(t, ['test_mage', 'test_grunt', 'test_brute', 'test_blink'])) return;
    // a healthy mage next to a grunt: shooting it from where she stands beats stepping off (a stab) to shoot from afar
    arena({ heroes: [hero('test_mage', 4, 5)], enemies: [{ id: 'test_grunt', x: 5, y: 5 }] });
    let m = unitOf('test_mage');
    let log = [];
    let seen = opps(function () { log = watch(function () { DD.AutoPlay.takeTurn(); }); });
    t.ok(seen.length === 0, 'no attack of opportunity provoked (' + said(log) + ')');
    t.ok(log.some(function (e) { return e.kind === 'skill'; }), 'it fights instead');
    // a wounded mage between a brute and a grunt that can't follow (rooted): walking off would provoke both (lethal),
    // so she Blinks
    arena({ heroes: [hero('test_mage', 4, 5, 3, ['test_blink'])], enemies: [{ id: 'test_brute', x: 5, y: 5 }, { id: 'test_grunt', x: 4, y: 4 }] });
    m = unitOf('test_mage');
    m.hp = 9;
    A().addStatus(unitOf('test_brute'), 'root', { turns: 1 }, m);
    A().addStatus(unitOf('test_grunt'), 'root', { turns: 1 }, m);
    t.ok(DD.AutoPlay.incomingAt(m, 4, 5).down > 0.5, 'premise: staying next to them would down her');
    const away = DD.Combat.reachable(m).get('1,5');
    t.ok(away && away.provokes.length === 2, 'premise: every walk away provokes both (' + (away && away.provokes.length) + ')');
    seen = opps(function () { log = watch(function () { DD.AutoPlay.takeTurn(); }); });
    t.eq(used(log, 'test_blink').length, 1, 'she Blinks (' + said(log) + ')');
    t.ok(seen.length === 0 && !m.downed && m.hp === 9, 'without provoking anything (' + key(m) + ')');
  });

  T.suite('autoplay: v2 attacks of opportunity — the knight engages the grunt heading for the wounded cleric (body-blocking)', function (t) {
    if (missing(t, ['test_knight', 'test_cleric', 'test_grunt'])) return;
    // the grunt (5,4, move 3) can reach the cleric (1,4, 4 HP) this turn; the knight (3,6) acts first
    const scene = function () {
      arena({ heroes: [hero('test_knight', 3, 6), hero('test_cleric', 1, 4)], enemies: [{ id: 'test_grunt', x: 5, y: 4 }], enemyAi: true, noPlan: false });
      const k = unitOf('test_knight'), c = unitOf('test_cleric'), g = unitOf('test_grunt');
      DD.Combat.setOrder([k, g, c]);
      c.hp = 4; k.block = 0;
      return { k: k, c: c, g: g };
    };
    let sc = scene();
    DD.Combat.endTurn();
    t.ok(sc.c.downed, 'premise: left alone, the grunt walks up and stabs the cleric down');
    sc = scene();
    const log = watch(function () { DD.AutoPlay.takeTurn(); });
    const engaged = DD.Grid.dist(sc.k, sc.g) === 1;
    DD.Combat.endTurn();
    t.ok(engaged, 'AutoPlay\'s knight steps up next to the grunt (' + key(sc.k) + '; ' + said(log) + ')');
    t.ok(!sc.c.downed && sc.c.hp === 4, 'the engaged grunt sticks to the knight: the cleric is untouched');
  });

  // ---- v2 requests: barrels, heals that revive, flyers and the floor -------------------------------------------------
  T.suite('autoplay: v2 — it shoots the barrel when the blast is worth more, never into its friends', function (t) {
    if (missing(t, ['test_mage', 'test_knight', 'test_minion', 'test_grunt'])) return;
    // three minions around a barrel: Magic Missile (4) kills nobody, the barrel (8 each) kills all three
    arena({ heroes: [hero('test_mage', 1, 4, 1, [])], enemies: [{ id: 'test_minion', x: 5, y: 4 }, { id: 'test_minion', x: 4, y: 5 }, { id: 'test_minion', x: 4, y: 3 }],
      objects: [{ x: 4, y: 4, id: 'barrel_explosive' }] });
    let log = watch(function () { DD.AutoPlay.takeTurn(); });
    const shot = log.filter(function (e) { return e.kind === 'skill' && e.x === 4 && e.y === 4; });
    t.ok(shot.length === 1 && !DD.Grid.tile(4, 4).obj, 'the mage shoots the barrel (' + said(log) + ')');
    t.eq(S().units.filter(function (u) { return u.defId === 'test_minion' && !u.dead; }).length, 0, 'all three minions blown up');
    // the barrel sits between two allies and one grunt: the blast would hurt the party more than the grunt
    arena({ heroes: [hero('test_mage', 1, 4, 1, []), hero('test_knight', 3, 4), hero('test_knight', 4, 5)], enemies: [{ id: 'test_grunt', x: 5, y: 4 }],
      objects: [{ x: 4, y: 4, id: 'barrel_explosive' }] });
    log = watch(function () { DD.AutoPlay.takeTurn(); });
    t.ok(!!DD.Grid.tile(4, 4).obj, 'it leaves the barrel by its friends alone (' + said(log) + ')');
  });

  T.suite('autoplay: v2 — a heal aimed at a downed ally gets it up from range (and Help Up waits for it)', function (t) {
    if (missing(t, ['test_cleric', 'test_knight', 'test_grunt', 'test_heal'])) return;
    arena({ heroes: [hero('test_cleric', 1, 1, 1, ['test_heal']), hero('test_knight', 4, 1)], enemies: [{ id: 'test_grunt', x: 9, y: 9 }] });
    const c = unitOf('test_cleric'), k = unitOf('test_knight');
    A().kill(k, null);
    t.ok(k.downed && DD.Grid.dist(c, k) === 3, 'premise: the knight is down 3 tiles away');
    let log = watch(function () { DD.AutoPlay.takeTurn(); });
    t.ok(used(log, 'test_heal').some(function (e) { return e.x === 4 && e.y === 1; }) && !k.downed, 'Patch Notes from range gets him up (' + said(log) + ')');
    t.ok(k.hp >= 7, 'with the heal\'s HP (' + k.hp + ')');
    // next to him: the heal (1 AP, 7 HP) instead of Help Up (2 AP, ¼ HP)
    arena({ heroes: [hero('test_cleric', 3, 1, 1, ['test_heal']), hero('test_knight', 4, 1)], enemies: [{ id: 'test_grunt', x: 9, y: 9 }] });
    const k2 = unitOf('test_knight');
    A().kill(k2, null);
    log = watch(function () { DD.AutoPlay.takeTurn(); });
    t.ok(!k2.downed && used(log, 'test_heal').length >= 1 && k2.hp === 7, 'adjacent: the heal gets him up, no Help Up needed (' + said(log) + ', ' + k2.hp + ' HP)');
  });

  T.suite('autoplay: v2 — a flyer never walks onto a plate to press it; a walker does', function (t) {
    if (missing(t, ['test_rogue', 'test_grunt'])) return;
    const scene = function (fly) {
      arena({ heroes: [hero('test_rogue', 2, 1)], enemies: [{ id: 'test_grunt', x: 9, y: 9 }], objects: [{ x: 4, y: 1, id: 'pressure_plate', autoplay: 12 }] });
      const r = unitOf('test_rogue');
      if (fly) r.flags = Object.assign({}, r.flags, { flying: true });
      return r;
    };
    let r = scene(false);
    let log = watch(function () { DD.AutoPlay.takeTurn(); });
    t.ok(DD.Grid.tile(4, 1).obj.data.pressed, 'the walker presses the hinted plate (' + said(log) + ')');
    r = scene(true);
    log = watch(function () { DD.AutoPlay.takeTurn(); });
    t.ok(!DD.Grid.tile(4, 1).obj.data.pressed && !(r.x === 4 && r.y === 1), 'the flyer does not go for it (it could not press it): ' + key(r) + ' (' + said(log) + ')');
  });

  T.suite('autoplay: v2 — lava is no hazard for a fireproof hero or a flyer (walks and danger per unit)', function (t) {
    if (missing(t, ['test_rogue', 'test_minion'])) return;
    // a minion (6 HP) in a nook: the only tile next to it, (4,5), is lava; the rogue's Stab (4 + Bleed) won't kill it
    const scene = function (prep) {
      arena({ heroes: [hero('test_rogue', 2, 5, 1, [])], enemies: [{ id: 'test_minion', x: 5, y: 5 }],
        terrain: function (tl) { if ((tl.x === 6 && tl.y === 5) || (tl.x === 5 && (tl.y === 4 || tl.y === 6))) tl.t = 'wall'; if (tl.x === 4 && tl.y === 5) tl.t = 'lava'; } });
      const r = unitOf('test_rogue');
      prep(r);
      return r;
    };
    const play = function (r) {
      const hp = r.hp, log = watch(function () { DD.AutoPlay.takeTurn(); });
      return { lost: hp - r.hp, stabs: used(log, 'test_stab').length, log: said(log), at: key(r) };
    };
    const end = function (u, x, y) { return DD.AutoPlay.incomingAt(u, x, y).dmg; };
    let r = scene(function () {});
    t.ok(end(r, 4, 5) > end(r, 3, 5) + 7, 'premise: ending a turn on lava is priced for a walker (' + end(r, 4, 5) + ' vs ' + end(r, 3, 5) + ')');
    let w = play(r);
    t.ok(w.lost === 0 && !w.stabs, 'a plain rogue does not wade into lava for a stab (' + w.at + ', ' + w.log + ')');
    r = scene(function (u) { u.resist = { fire: 0 }; u.flags = Object.assign({}, u.flags, { immune: ['burn'] }); });
    t.eq(end(r, 4, 5), end(r, 3, 5), 'fireproof: ending a turn on lava costs nothing');
    w = play(r);
    t.ok(w.stabs > 0 && w.lost === 0, 'a fireproof rogue walks onto the lava and stabs it (' + w.at + ', ' + w.log + ')');
    r = scene(function (u) { u.flags = Object.assign({}, u.flags, { flying: true }); });
    t.eq(end(r, 4, 5), end(r, 3, 5), 'a flyer: lava costs nothing either');
    w = play(r);
    t.ok(w.stabs > 0 && w.lost === 0, 'a flying rogue hovers over it and stabs it (' + w.at + ', ' + w.log + ')');
  });
})();
