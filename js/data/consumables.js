/* Dungeons and Degenerates — js/data/consumables.js
 * Consumables (ids con_*): 14 single-use drinks, bombs and dubious scrolls for the party's pockets (3 by default),
 * sold in shops for 20-35 gold and looted after fights. Each costs 1 AP unless stated, can't be used by summons, and
 * its `desc` is the exact effect. Registers the surface con_d4s ("Loose d4s", from the Bag of d4s): the first enemy
 * to step on a tile of dice takes 4 damage and kicks them away; heroes and flyers are safe; fire melts them.
 * Helpers shared with js/data/skills_generic.js live on DD.Kit (pushPath etc.).
 */
(function () {
  'use strict';
  const DD = window.DD;

  const D4_DMG = 4;
  const D4_COLORS = ['#e74c3c', '#3a86ff', '#2ecc71', '#a55eea', '#f1c40f', '#ff8a4c'];
  const UNHOLY = ['undead', 'devil', 'demon', 'fiend'];

  // ---- helpers ---------------------------------------------------------------------------------------------
  function A() { return DD.Act; }
  function G() { return DD.Grid; }
  function active(u) { return !!u && !u.dead && !u.downed; }
  function key(p) { return p.x + ',' + p.y; }
  function unholy(u) { return !!u && (u.tags || []).some(function (t) { return UNHOLY.indexOf(t) >= 0; }); }

  /** The targeted friendly unit of a drink (targetUnit, falling back to the drinker for self/odd targets). */
  function drinker(ctx) {
    const t = ctx.targetUnit || (ctx.target && G().unitAt(ctx.target.x, ctx.target.y));
    return active(t) && !G().hostile(ctx.user, t) ? t : null;
  }

  /**
   * May a thrown potion lay its surface on this tile? Solid, dry floor that nobody blocks, and never over a hazard
   * (fire, lava...) or a permanent scenery surface.
   */
  function coverable(x, y) {
    const t = G().tile(x, y);
    if (!t) return false;
    const td = G().terrain(t);
    if (td.liquid || td.pit || td.walkable === false) return false;
    if (t.obj && G().objBlocksMove(t.obj)) return false;
    if (t.surface) {
      const sd = DD.getSurface(t.surface.id);
      if (t.surface.turns < 0 || (sd && sd.hazard)) return false;
    }
    return true;
  }
  /** Clouds (smoke) go anywhere except over hazards and permanent scenery. */
  function smokeable(x, y) {
    const t = G().tile(x, y);
    if (!t) return false;
    if (t.surface) {
      const sd = DD.getSurface(t.surface.id);
      if (t.surface.turns < 0 || (sd && sd.hazard)) return false;
    }
    return true;
  }

  function toss(u, at, color, kind) {
    DD.FX.projectile(u, at, { kind: kind || 'flask', color: color, ms: 340 });
  }

  function cons(def) { return DD.registerConsumable(def); }

  // ---- the d4 surface ----------------------------------------------------------------------------------------
  /** Deterministic dice layout per tile (render only). */
  function d4Layout(tx, ty) {
    let h = ((tx * 73856093) ^ (ty * 19349663) ^ 0x5bd1e995) >>> 0;
    function rnd() { h = (Math.imul(h, 1103515245) + 12345) >>> 0; return (h >>> 8) / 16777216; }
    const out = [];
    for (let i = 0; i < 6; i++) {
      out.push({ u: rnd() * 0.7 - 0.35, v: rnd() * 0.7 - 0.35, c: D4_COLORS[Math.floor(rnd() * D4_COLORS.length)], s: 0.85 + rnd() * 0.4, f: rnd() * 0.5 - 0.25 });
    }
    return out.sort(function (a, b) { return (a.u + a.v) - (b.u + b.v); });
  }

  /** An enemy steps on a tile of d4s: 4 damage (ignores armor), the dice on that tile are kicked away. */
  function stepOnD4(unit, tile) {
    if (!active(unit) || unit.side === 'hero' || !tile || !tile.surface || tile.surface.id !== 'con_d4s') return;
    const s = DD.Combat.state;
    const src = tile.surface.data && tile.surface.data.src ? DD.Combat.byId(tile.surface.data.src) : null;
    A().setSurface(tile.x, tile.y, null);
    DD.FX.text(unit, 'OW! A d4!', { color: '#ff9d7a', size: 15 });
    DD.FX.particles(tile, { kind: 'sparks', color: D4_COLORS[(tile.x + tile.y) % D4_COLORS.length], count: 8 });
    if (s) A().log(unit.name + ' steps on a d4. Everyone winces.', 'dmg');
    A().damage(src && !src.dead ? src : null, unit, D4_DMG, { cause: 'surface', tags: ['d4'] });
  }

  DD.registerSurface({
    id: 'con_d4s', name: 'Loose d4s', color: 'rgba(235,90,90,0.25)', turns: 3,
    desc: 'The first enemy to step here takes ' + D4_DMG + ' damage (ignores armor) and kicks the dice away. Heroes watch their ' +
      'step; flyers float over. Fire melts them.',
    react: { fire: { surface: null } },
    onEnter: function (unit, tile) { stepOnD4(unit, tile); },
    draw: function (g) {
      const tl = g.tile || { x: 0, y: 0 };
      const lw = g.lw;
      g.diamond(0, 0, 28, 14, 'rgba(255,110,90,0.10)');
      g.lw = 1;
      d4Layout(tl.x, tl.y).forEach(function (m) {
        const px = (m.u - m.v) * 32, py = (m.u + m.v) * 16, s = 5 * m.s, fx = px + m.f * s;
        g.ellipse(px + 0.6, py + 1.6, s * 1.15, s * 0.45, 'rgba(0,0,0,0.38)', null);
        const apex = [px, py - s * 1.25], left = [px - s, py + s * 0.35], right = [px + s, py + s * 0.35], front = [fx, py + s * 0.75];
        g.poly([apex, left, front], m.c, null);
        g.poly([apex, front, right], g.shade(m.c, -0.32), null);
        g.poly([apex, left, front, right], null, '#1a1014');
        g.line(apex[0], apex[1], front[0], front[1], 'rgba(26,16,20,0.75)', 0.8);
        g.circle(px - s * 0.3, py - s * 0.35, s * 0.18, 'rgba(255,255,255,0.85)', null);
      });
      g.lw = lw;
    },
  });

  // ---- 1-2. Red Drinks -----------------------------------------------------------------------------------------
  cons({
    id: 'con_red_drink', name: 'Red Drink', icon: '🥤', rarity: 'common', price: 20, ap: 1, tags: ['heal'],
    target: { type: 'unit', range: [0, 1], filter: 'allyOrSelf' },
    desc: 'Heal yourself or an adjacent ally for 10 HP.',
    flavor: 'Flavor: red. Ingredients: also red. Side effects: confidence.',
    execute: function (ctx) {
      const u = ctx.user, t = drinker(ctx);
      if (!active(u) || !t) return;
      DD.FX.particles(t, { kind: 'bubbles', color: '#ff5a6e', count: 10 });
      A().heal(u, t, 10);
    },
  });

  cons({
    id: 'con_big_red_drink', name: 'Big Red Drink', icon: '🍹', rarity: 'rare', price: 32, ap: 1, tags: ['heal'],
    target: { type: 'unit', range: [0, 1], filter: 'allyOrSelf' },
    desc: 'Heal yourself or an adjacent ally for 20 HP.',
    flavor: 'The two-liter. Technically a weapon in three kingdoms.',
    execute: function (ctx) {
      const u = ctx.user, t = drinker(ctx);
      if (!active(u) || !t) return;
      DD.FX.particles(t, { kind: 'bubbles', color: '#ff3b5c', count: 16 });
      DD.FX.text(t, 'GLUG GLUG GLUG', { color: '#ffb0bc', size: 13 });
      A().heal(u, t, 20);
    },
  });

  // ---- 3. Flask of Bad Decisions -------------------------------------------------------------------------------
  cons({
    id: 'con_bad_decisions', name: 'Flask of Bad Decisions', icon: '🍾', rarity: 'rare', price: 30, ap: 1, tags: ['fire', 'aoe'],
    target: { type: 'tile', range: [1, 4], los: false },
    area: { shape: 'circle', size: 1 },
    desc: 'Lob it at a tile up to 4 away: 8 fire damage to every unit within 1 tile (yes, allies too) and the floor there ' +
      'burns for 2 rounds. Fire also sets off oil, webs and barrels.',
    flavor: 'Shake well. Throw better. Apologize to the cleric afterwards.',
    execute: function (ctx) {
      const u = ctx.user, c = ctx.target;
      if (!active(u) || !c) return;
      const victims = ctx.units.slice();
      toss(u, c, '#ff7a1a');
      DD.FX.explosion(c, { radius: 1 });
      DD.FX.sound('fire');
      victims.forEach(function (v) { if (active(v)) A().damage(u, v, 8, { element: 'fire', tags: ['fire', 'aoe'] }); });
      ctx.tiles.forEach(function (p) {
        A().applyElement(p.x, p.y, 'fire', u, { noUnits: true });
        const t = G().tile(p.x, p.y);
        if (t && !t.surface && coverable(p.x, p.y)) A().setSurface(p.x, p.y, 'fire', 2);
      });
    },
  });

  // ---- 4. Smoke Bomb -------------------------------------------------------------------------------------------
  cons({
    id: 'con_smoke_bomb', name: 'Smoke Bomb', icon: '💨', rarity: 'common', price: 22, ap: 1, tags: ['stealth', 'smoke'],
    target: { type: 'self' },
    area: { shape: 'circle', size: 1 },
    desc: 'Smoke fills the tiles within 1 of you for 2 rounds (not over fire or other hazards; it blocks line of sight), and you ' +
      'and every ally in it are Stealthed until the end of your next turn: enemies ignore you and shots tracking you fizzle. ' +
      'Dealing damage breaks Stealth.',
    flavor: 'The ninja exit, for people who are not ninjas.',
    execute: function (ctx) {
      const u = ctx.user;
      if (!active(u)) return;
      DD.FX.particles(u, { kind: 'smoke', count: 26 });
      DD.FX.sound('push');
      ctx.tiles.forEach(function (p, i) {
        if (!smokeable(p.x, p.y)) return;
        if (A().setSurface(p.x, p.y, 'smoke', 2)) DD.FX.tile(p.x, p.y, 'glow', { color: '#9aa0b0', parallel: i > 0 });
      });
      ctx.friends.forEach(function (f) { if (active(f)) A().addStatus(f, 'stealth', { turns: 2 }, u); });
    },
  });

  // ---- 5. Energy Drink -----------------------------------------------------------------------------------------
  cons({
    id: 'con_energy_drink', name: 'Energy Drink', icon: '⚡', rarity: 'common', price: 25, ap: 1, tags: ['ap', 'buff'],
    target: { type: 'unit', range: [0, 1], filter: 'allyOrSelf' },
    desc: 'You or an adjacent ally gain 2 AP right now and are Hasted: +1 AP at the start of the next turn.',
    flavor: 'Contains 900% of your daily taurine. You can hear colors now.',
    execute: function (ctx) {
      const u = ctx.user, t = drinker(ctx);
      if (!active(u) || !t) return;
      DD.FX.particles(t, { kind: 'zap', count: 6 });
      A().gainAp(t, 2);
      // turns: 2 = through the end of the next player phase, so the +1 AP lands at the start of that turn
      if (active(t)) A().addStatus(t, 'haste', { turns: 2 }, u);
    },
  });

  // ---- 6. Antidote ---------------------------------------------------------------------------------------------
  cons({
    id: 'con_antidote', name: 'Antidote', icon: '💊', rarity: 'common', price: 20, ap: 1, tags: ['heal', 'cleanse'],
    target: { type: 'unit', range: [0, 1], filter: 'allyOrSelf' },
    desc: 'Remove every debuff from yourself or an adjacent ally and heal 5 HP.',
    flavor: 'Cures poison, curses, hangovers and most opinions. Tastes like a penny.',
    execute: function (ctx) {
      const u = ctx.user, t = drinker(ctx);
      if (!active(u) || !t) return;
      DD.FX.particles(t, { kind: 'glitter', color: '#9fffb0', count: 12 });
      A().cleanse(t, 'debuff');
      if (active(t)) A().heal(u, t, 5);
    },
  });

  // ---- 7. Liquid Courage ---------------------------------------------------------------------------------------
  cons({
    id: 'con_liquid_courage', name: 'Liquid Courage', icon: '🍺', rarity: 'common', price: 22, ap: 1, tags: ['buff'],
    target: { type: 'unit', range: [0, 1], filter: 'allyOrSelf' },
    desc: 'You or an adjacent ally become Empowered (the next damaging skill deals +50%) and gain 5 Block. Hic: also Dazzled ' +
      'for the rest of this turn (−1 max range).',
    flavor: 'Brewed by dwarves. Rated by dwarves: "it\'s fine".',
    execute: function (ctx) {
      const u = ctx.user, t = drinker(ctx);
      if (!active(u) || !t) return;
      DD.FX.particles(t, { kind: 'bubbles', color: '#f2c14e', count: 12 });
      DD.FX.text(t, 'Hic!', { color: '#f2c14e', size: 14 });
      A().addStatus(t, 'empowered', {}, u);
      if (active(t)) A().addBlock(t, 5);
      if (active(t)) A().addStatus(t, 'dazzled', { turns: 1 }, null);
    },
  });

  // ---- 8. Scroll of Yeet ---------------------------------------------------------------------------------------
  cons({
    id: 'con_scroll_of_yeet', name: 'Scroll of Yeet', icon: '📜', rarity: 'rare', price: 30, ap: 1, tags: ['push', 'ranged'],
    target: {
      type: 'unit', range: [1, 4], filter: 'notSelf', los: true, straight: true,
      canTarget: function (ctx) {
        const t = ctx.targetUnit;
        if (!t || t === ctx.user) return 'Nobody to yeet.';
        if (A().isImmovable(t)) return 'Too heavy to yeet. It read the scroll too.';
        return true;
      },
    },
    area: {
      shape: 'custom',
      fn: function (ctx) {
        if (!ctx || !ctx.target) return [];
        const out = [{ x: ctx.target.x, y: ctx.target.y }];
        const t = G().unitAt(ctx.target.x, ctx.target.y);
        if (!t || !ctx.user || t === ctx.user || A().isImmovable(t) || !DD.Kit || !DD.Kit.pushPath) return out;
        return out.concat(DD.Kit.pushPath(t, DD.util.dirTo(ctx.user, t), 3, ctx.user));
      },
    },
    desc: 'Read it at a unit (friend or foe) up to 4 tiles away in a straight line: it is YEETED 3 tiles directly away from ' +
      'you. If it crashes into something it takes 5 damage (so does a unit it hits). Pits, lava and water do the rest.',
    flavor: 'Ancient Draconic for "go away, but faster".',
    execute: function (ctx) {
      const u = ctx.user, t = ctx.targetUnit;
      if (!active(u) || !active(t) || t === u) return;
      DD.FX.beam(u, t, { color: '#ffe9a0', width: 4, ms: 200 });
      DD.FX.text(t, 'YEET!', { color: '#ffdf6b', size: 20 });
      A().push(u, t, DD.util.dirTo(u, t), 3, { bump: 5 });
    },
  });

  // ---- 9. Bag of d4s (not marbles: Professor Marbles would like his back) ---------------------------------------
  cons({
    id: 'con_bag_of_d4s', name: 'Bag of d4s', icon: '🎲', rarity: 'common', price: 22, ap: 1, tags: ['trap', 'aoe'],
    target: { type: 'tile', range: [1, 3], los: false },
    area: { shape: 'circle', size: 1 },
    desc: 'Scatter d4s on the dry floor within 1 tile of a spot up to 3 away, for 3 rounds. The first enemy to step on each ' +
      'tile of dice (enemies already there included) takes ' + D4_DMG + ' damage, ignoring armor. Heroes and flyers are safe.',
    flavor: 'Nature\'s caltrop. The only die that hurts more off the table than on it.',
    execute: function (ctx) {
      const u = ctx.user, c = ctx.target;
      if (!active(u) || !c) return;
      toss(u, c, '#e74c3c', 'coin');
      DD.FX.particles(c, { kind: 'glitter', color: '#ff7a6b', count: 14 });
      DD.FX.sound('coin');
      const placed = [];
      ctx.tiles.forEach(function (p) {
        if (!coverable(p.x, p.y) || !A().setSurface(p.x, p.y, 'con_d4s', 3)) return;
        const t = G().tile(p.x, p.y);
        t.surface.data = { src: u.id };
        placed.push(t);
      });
      placed.forEach(function (t) {
        const v = G().unitAt(t.x, t.y);
        if (active(v) && v.side !== 'hero' && !G().isFlying(v)) stepOnD4(v, t);
      });
    },
  });

  // ---- 10. Holy Water ------------------------------------------------------------------------------------------
  cons({
    id: 'con_holy_water', name: 'Holy Water', icon: '😇', rarity: 'common', price: 24, ap: 1, tags: ['holy', 'aoe'],
    target: { type: 'tile', range: [1, 3], los: false },
    area: { shape: 'circle', size: 1 },
    desc: 'Splash a tile up to 3 away: Holy Ground covers the dry floor within 1 tile for 3 rounds (heroes ending a turn there ' +
      'heal 3; undead there take 3), and undead, devils and demons in the splash take 10 holy damage.',
    flavor: 'Blessed by a priest. It is tap water, but the priest was very sincere.',
    execute: function (ctx) {
      const u = ctx.user, c = ctx.target;
      if (!active(u) || !c) return;
      const victims = ctx.foes.filter(unholy);
      toss(u, c, '#fff0a0');
      DD.FX.explosion(c, { radius: 1, color: '#fff3b0', kind: 'holy', shake: false });
      DD.FX.sound('heal');
      victims.forEach(function (v) { if (active(v)) A().damage(u, v, 10, { element: 'holy', tags: ['holy', 'aoe'] }); });
      ctx.tiles.forEach(function (p) { if (coverable(p.x, p.y)) A().setSurface(p.x, p.y, 'holy', 3); });
    },
  });

  // ---- 11. Frost Flask -----------------------------------------------------------------------------------------
  cons({
    id: 'con_frost_flask', name: 'Frost Flask', icon: '🧊', rarity: 'common', price: 25, ap: 1, tags: ['frost', 'aoe'],
    target: { type: 'tile', range: [1, 4], los: false },
    area: { shape: 'circle', size: 1 },
    desc: 'Lob it at a tile up to 4 away: every foe within 1 tile takes 5 frost damage and is Slowed for 1 turn (−2 move). ' +
      'Wet foes freeze solid. Water there turns to ice and fire goes out.',
    flavor: 'Keep away from children, fire elementals and your tongue.',
    execute: function (ctx) {
      const u = ctx.user, c = ctx.target;
      if (!active(u) || !c) return;
      const victims = ctx.foes.slice();
      toss(u, c, '#9fe3ff');
      DD.FX.explosion(c, { radius: 1, color: '#bfefff', kind: 'frost', shake: false });
      DD.FX.sound('frost');
      victims.forEach(function (v) {
        if (!active(v)) return;
        A().damage(u, v, 5, { element: 'frost', tags: ['frost', 'aoe'] });
        if (active(v)) A().addStatus(v, 'slow', { turns: 1 }, u);
      });
      ctx.tiles.forEach(function (p) { A().applyElement(p.x, p.y, 'frost', u, { noUnits: true }); });
    },
  });

  // ---- 12. Thunder Jar -----------------------------------------------------------------------------------------
  /** Next foe for the chain: within 2 of the last one, not yet struck; nearest, then weakest, then top-left. */
  function chainNext(u, last, struck) {
    let best = null, bestKey = null;
    DD.Combat.foesOf(u).forEach(function (f) {
      if (struck.indexOf(f) >= 0) return;
      const d = G().dist(f, last);
      if (d > 2) return;
      const k = [d, f.hp, f.y, f.x];
      if (!bestKey || lexLess(k, bestKey)) { best = f; bestKey = k; }
    });
    return best;
  }
  function lexLess(a, b) {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i];
    return false;
  }

  cons({
    id: 'con_thunder_jar', name: 'Thunder Jar', icon: '🌩️', rarity: 'rare', price: 32, ap: 1, tags: ['lightning', 'ranged', 'chain'],
    target: { type: 'unit', range: [1, 4], filter: 'enemy', los: true },
    desc: 'Hurl it at a foe up to 4 tiles away: 8 lightning damage, then the bolt jumps to up to 2 more foes (each within 2 tiles ' +
      'of the last) for 4 damage each. Wet targets take +50%. Water under a target is electrified: everyone in that pool takes ' +
      '4 lightning damage and is Stunned (heroes too).',
    flavor: 'Do not shake. Do not open. Definitely do not lick. Throw.',
    execute: function (ctx) {
      const u = ctx.user, t = ctx.targetUnit;
      if (!active(u) || !active(t) || !G().hostile(u, t)) return;
      const struck = [t];
      for (let i = 0; i < 2; i++) {
        const n = chainNext(u, struck[struck.length - 1], struck);
        if (!n) break;
        struck.push(n);
      }
      const spots = struck.map(function (s) { return { x: s.x, y: s.y }; });
      DD.FX.projectile(u, t, { kind: 'orb', color: '#9fd0ff', ms: 260 });
      DD.FX.sound('zap');
      struck.forEach(function (s, i) {
        if (i > 0) DD.FX.beam(spots[i - 1], spots[i], { kind: 'lightning', color: '#bfe3ff', width: 5, ms: 220 });
        DD.FX.particles(spots[i], { kind: 'zap', count: 8 });
        if (active(s) && active(u)) A().damage(u, s, i === 0 ? 8 : 4, { element: 'lightning', tags: ['lightning', 'chain'] });
      });
      const zapped = {};
      spots.forEach(function (p) {
        if (zapped[key(p)]) return;
        const body = A().waterBody(p.x, p.y);
        if (!body.length) return;
        body.forEach(function (b) { zapped[key(b)] = 1; });
        A().applyElement(p.x, p.y, 'lightning', u, { noUnits: true });
      });
    },
  });

  // ---- 13. Pocket Sand (Family Size) ---------------------------------------------------------------------------
  cons({
    id: 'con_pocket_sand', name: 'Pocket Sand (Family Size)', icon: '⏳', rarity: 'common', price: 20, ap: 1, tags: ['dazzle', 'aoe'],
    target: { type: 'dir' },
    area: { shape: 'cone', size: 3 },
    desc: 'Empty the family-size bag in a cone 3 tiles deep in front of you: every foe in it is Dazzled (its next attack lands ' +
      '1 tile off) and Weakened (−25% damage) for 1 turn.',
    flavor: 'Sh-sh-sha! Now with 40% more sand and 100% more family.',
    execute: function (ctx) {
      const u = ctx.user;
      if (!active(u)) return;
      DD.FX.lunge(u, ctx.target || u, { ms: 120 });
      ctx.tiles.forEach(function (p, i) { DD.FX.particles(p, { kind: 'dust', color: '#e2c98f', count: 6, parallel: i > 0 }); });
      DD.FX.text(u, 'SH-SH-SHA!', { color: '#e8d29a', size: 16 });
      ctx.foes.forEach(function (f) {
        if (!active(f)) return;
        A().addStatus(f, 'dazzled', { turns: 1 }, u);
        if (active(f)) A().addStatus(f, 'weak', { turns: 1 }, u);
      });
    },
  });

  // ---- 14. Mystery Potion --------------------------------------------------------------------------------------
  const MYSTERY = [
    null,
    { text: 'Baa.', run: function (u) { A().addStatus(u, 'sheep', { turns: 1 }, null); } },
    { text: 'Tastes like regret.', run: function (u) { A().addStatus(u, 'poison', { stacks: 3 }, null); } },
    { text: 'Strawberry!', run: function (u) { A().heal(u, u, 12); } },
    { text: 'ZOOM.', run: function (u) { A().gainAp(u, 2); } },
    { text: 'Unbreakable!', run: function (u) { A().addStatus(u, 'invulnerable', { turns: 2 }, u); } },
    { text: 'Ooh, sparkly.', run: function (u) {
      // WildMagic.surge falls back to ANY surge when no good one is eligible, so check the good pool first
      const WM = DD.WildMagic;
      const good = WM && typeof WM.surge === 'function' && (typeof WM.pool !== 'function' || WM.pool(u, { good: true }).length > 0);
      const fx = good ? WM.surge(u, { good: true, source: 'con_mystery_potion' }) : null;
      if (!fx && active(u)) A().heal(u, u, 12);
    } },
  ];

  cons({
    id: 'con_mystery_potion', name: 'Mystery Potion', icon: '🧪', rarity: 'common', price: 20, ap: 1, tags: ['random'],
    target: { type: 'self' },
    desc: 'Drink it and roll a d6. 1: you turn into a sheep for the rest of this turn. 2: Poisoned 3. 3: heal 12 HP. ' +
      '4: gain 2 AP. 5: Invulnerable until the end of your next turn. 6: a good Wild Magic surge (if none can happen, heal 12 HP).',
    flavor: 'The label fell off. The label was a warning.',
    // The HUD's dry-run preview would roll the same die the real drink rolls (same RNG state) and show the face
    // ("? +12", "? Sheep"), so players could peek and only drink good rolls. A bare "?" keeps it a gamble.
    preview: function (ctx) {
      const out = {};
      if (ctx && active(ctx.user)) out[ctx.user.id] = { text: '? (d6)' };
      return out;
    },
    execute: function (ctx) {
      const u = ctx.user;
      if (!active(u)) return;
      const roll = ctx.rng.int(1, 6);
      const o = MYSTERY[roll];
      DD.FX.particles(u, { kind: 'bubbles', color: '#c48aff', count: 12 });
      DD.FX.text(u, '🎲 ' + roll + ': ' + o.text, { color: '#d9b8ff', size: 15 });
      A().log(u.name + ' rolls a ' + roll + ' on the Mystery Potion. ' + o.text, 'status');
      o.run(u);
    },
  });

  const Kit = (DD.Kit = DD.Kit || {});
  Kit.CONSUMABLE_IDS = ['con_red_drink', 'con_big_red_drink', 'con_bad_decisions', 'con_smoke_bomb', 'con_energy_drink',
    'con_antidote', 'con_liquid_courage', 'con_scroll_of_yeet', 'con_bag_of_d4s', 'con_holy_water', 'con_frost_flask',
    'con_thunder_jar', 'con_pocket_sand', 'con_mystery_potion'];
  Kit.D4_DMG = D4_DMG;
  Kit.coverable = coverable;
  Kit.chainNext = chainNext;
  Kit.unholy = unholy;
})();
