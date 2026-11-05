/* Dungeons and Degenerates — js/data/heroes/pebbles.js
 * Hero: PEBBLES, THE GOODEST BOY — a dog made of fire (he/him). v2-native (initiative, no telegraphs, no Guard),
 * DESIGN §6 "Pebbles" + "Simplicity": a melee skirmisher who sets things on fire, fetches foes and loves everyone.
 * Fireproof by def (resist fire 0, immune to Burn); passive "Hot Dog" = fire can't hurt him and ending his turn on fire
 * or lava heals him. His basic bite is melee, so it is also his attack of opportunity (Burn included); his dashes
 * (Hot Zoomies) never provoke one.
 * Registers: hero pebbles, 11 skills (peb_*), 3 items (peb_*). No custom statuses or summons.
 */
(function () {
  'use strict';
  const DD = window.DD;

  const HERO = 'pebbles';
  const FLAME = '#ff8a1f', FLAME_HOT = '#ffd34d', FLAME_DEEP = '#e2450f', EMBER = '#9c2a08';
  const EXTINGUISHER = 'peb_extinguisher', DOG_BED = 'peb_dog_bed', COLLAR = 'peb_collar';
  const COZY_HEAL = 3, COZY_HEAL_BED = 5, REKINDLE_HP = 8;

  // ---- helpers ------------------------------------------------------------------------------------
  function G() { return DD.Grid; }
  function A() { return DD.Act; }
  function active(u) { return !!u && !u.dead && !u.downed; }
  function has(u, id) { return DD.Act.hasStatus(u, id); }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
  function hasItem(user, id) {
    if (!user) return false;
    const items = user.items;
    if (Array.isArray(items)) return items.indexOf(id) >= 0;
    if (items && typeof items === 'object') { for (const k in items) if (items[k] === id) return true; }
    return false;
  }
  function foeOf(user, u) { return active(u) && G().hostile(user, u); }
  /** The skill's real max range (range bonuses, hero Dazzle) — dashes go exactly as far as they can target. */
  function reachOf(user, skill, level, fallback) {
    if (!user || !skill) return fallback;
    const r = DD.Targeting.range(user, skill, level || 1);
    return r && r[1] >= 1 ? r[1] : fallback;
  }

  /** Is the unit standing in fire (a fire surface) or on lava? A flyer floats above the floor, so it is in neither. */
  function inFire(u) {
    const tl = u && G().tile(u.x, u.y);
    if (!tl || !G().feelsFloor(u)) return false;
    if (tl.surface && tl.surface.id === 'fire') return true;
    const td = G().terrain(tl);
    return !!(td && td.liquid === 'lava');
  }
  /** Hot Dog's heal for this unit (the Fireproof Dog Bed makes it bigger). */
  function cozyHeal(u) { return hasItem(u, DOG_BED) ? COZY_HEAL_BED : COZY_HEAL; }
  /** Spicy Nibble's Burn for this user (the Chewed-Up Fire Extinguisher adds 1). */
  function nibbleBurn(L, user) { return ((L && L.burn) || 1) + (hasItem(user, EXTINGUISHER) ? 1 : 0); }

  function tkey(x, y) { return x + ',' + y; }
  function zoomable(u, x, y, fly) { return G().inBounds(x, y) && G().isWalkable(x, y, u) && (fly || !G().isDrop(x, y)); }
  /**
   * Would stepping onto this tile hurt him (poison, spikes, a live current, a foe's brambles...)? Fire and lava don't:
   * he is fireproof. DD.Grid.hazardAt is per unit (v2): it knows his fire immunity, and a flying Pebbles feels only clouds.
   */
  function hurts(u, x, y) { return !!G().hazardAt(x, y, u); }
  // one route table per (fight state, position, length, state change counter, where the foes stand): targeting asks
  // for every tile. Foes are in the key because a plain walk (DD.Act.moveAlong) doesn't bump state.mutations.
  const zoomCache = typeof WeakMap === 'function' ? new WeakMap() : null;
  function foeSpots(u, s) {
    let k = '';
    for (let i = 0; i < s.units.length; i++) { const o = s.units[i]; if (active(o) && G().hostile(u, o)) k += o.x + ',' + o.y + ';'; }
    return k;
  }
  /**
   * Hot Zoomies' routes from where u stands: { 'x,y': { h, path } } for every tile within len steps — the route that
   * crosses the fewest tiles that would hurt him, then the shortest (every tile counts 1: zoomies ignore mud). A
   * layer per step count, so a safe detour within len beats a short cut through a poison puddle.
   */
  function zoomRoutes(u, len) {
    const s = DD.Combat && DD.Combat.state;
    const fly = G().isFlying(u), start = tkey(u.x, u.y), DIRS = DD.util.DIRS;
    // flight is in the key: a flyer feels no floor hazard (hurts), and flight can change without a state mutation
    const ck = [u.id, u.x, u.y, len, fly ? 1 : 0, s ? s.mutations || 0 : 0, s ? s.turn || 0 : 0, s ? foeSpots(u, s) : ''].join(':');
    if (s && zoomCache) { const c = zoomCache.get(s); if (c && c.key === ck) return c.routes; }
    const pain = {}, best = {};
    let layer = {};
    layer[start] = { x: u.x, y: u.y, h: 0, path: [] };
    for (let d = 1; d <= len; d++) {
      const next = {};
      for (const k in layer) {
        const c = layer[k];
        for (let i = 0; i < DIRS.length; i++) {
          const nx = c.x + DIRS[i].x, ny = c.y + DIRS[i].y, nk = tkey(nx, ny);
          if (nk === start || !zoomable(u, nx, ny, fly) || !G().canStep(u, c, { x: nx, y: ny })) continue;
          const o = G().unitAt(nx, ny);
          if (o && o !== u && G().hostile(u, o)) continue;   // passes allies, never foes
          if (pain[nk] === undefined) pain[nk] = hurts(u, nx, ny) ? 1 : 0;
          const h = c.h + pain[nk];
          if (next[nk] && next[nk].h <= h) continue;
          next[nk] = { x: nx, y: ny, h: h, path: c.path.concat([{ x: nx, y: ny }]) };
        }
      }
      for (const k in next) if (!best[k] || next[k].h < best[k].h) best[k] = next[k];
      layer = next;
    }
    if (s && zoomCache) zoomCache.set(s, { key: ck, routes: best });
    return best;
  }
  /**
   * Hot Zoomies' route to `to` within `len` tiles (zoomRoutes: fewest tiles that hurt him, then shortest). Walkable, no
   * drops, the climbing rule; it passes allies but never foes and ends on a free tile. Null: no route.
   */
  function zoomPath(u, to, len) {
    if (!u || !to || (to.x === u.x && to.y === u.y) || !(len >= 1)) return null;
    if (!zoomable(u, to.x, to.y, G().isFlying(u)) || G().unitAt(to.x, to.y)) return null;
    if (Math.abs(to.x - u.x) + Math.abs(to.y - u.y) > len) return null;
    const r = zoomRoutes(u, len)[tkey(to.x, to.y)];
    return r ? r.path.map(function (q) { return { x: q.x, y: q.y }; }) : null;
  }

  /**
   * Light a tile: the fire element (oil, webs, ice, barrels react), then a fire surface where fire can lie. Credited to
   * him, so a foe that sinks through ice he melted is his environmental kill.
   */
  function ignite(src, x, y, turns, parallel) {
    const tl = G().tile(x, y);
    if (!tl) return false;
    A().withCredit(src, function () { A().applyElement(x, y, 'fire', src, { noUnits: true }); });
    const td = G().terrain(tl);
    let lit = !!(tl.surface && tl.surface.id === 'fire');
    if (!tl.surface && !td.liquid && td.walkable !== false && !td.pit && !(tl.obj && G().objBlocksMove && G().objBlocksMove(tl.obj))) {
      lit = A().setSurface(x, y, 'fire', turns) || lit;
    }
    if (lit) DD.FX.tile(x, y, 'glow', { color: FLAME, parallel: !!parallel });
    return lit;
  }

  /**
   * Tiles around Pebbles that This Is Fine sets alight (his own included; never under an ally). He never melts the ice he
   * stands on (fire can't lie on ice anyway, and ice that was deep water would sink him); a foe's ice is fair game.
   */
  function fineTiles(u, r) {
    return G().shape('circle', { x: u.x, y: u.y }, null, r).filter(function (q) {
      const o = G().unitAt(q.x, q.y);
      if (o === u) return G().terrain(G().tile(q.x, q.y)).id !== 'ice';
      return !o || G().hostile(u, o);
    });
  }

  function puppyCheck(ctx) {
    const t = ctx && ctx.targetUnit;
    if (!t) return 'Pick a foe.';
    if (A().isBoss(t)) return 'Bosses are dead inside. Even to puppy eyes.';
    const f = t.flags || {};
    if (Array.isArray(f.immune) && f.immune.indexOf('charmed') >= 0) return 'It has no heart. Pebbles is devastated.';
    if (has(t, 'charmed')) return 'It already loves him.';
    return true;
  }

  /** Every Burning foe of the user within r (Bark-B-Q's victims). */
  function burningFoes(user, r) {
    const s = DD.Combat && DD.Combat.state;
    if (!s || !user) return [];
    return s.units.filter(function (f) { return foeOf(user, f) && has(f, 'burn') && G().dist(user, f) <= r; });
  }

  // ---- sprite ------------------------------------------------------------------------------------------
  // a happy medium-sized dog made of flames: orange body, yellow belly and muzzle, an ember core, flame mane, flame
  // ears and a big wagging flame tail, big bright eyes, tongue out, a blue collar with a gold PEBBLES tag
  const PEB_PAL = {
    skin: '#ff8a1c', belly: '#ffd65a', cloth: '#ff8a1c', cloth2: '#ffd65a', hair: '#ff6a14', ear: '#ff6a14',
    eye: '#fff09a', metal: '#ffd75e', accent: '#ff5a1a', outline: '#561a07', collar: '#2f6fe0', tongue: '#ff6f8a',
  };
  const HEAD = 1.12;
  // geometry of the quadruped painter for shape { legs: 'long', body: 'long' } at head size HEAD (sprites.js
  // paintQuadruped): body ellipse centre y, radii, head centre and radius (the breathing bob is a fraction of a pixel)
  const Q = { rx: 13, ry: 6.8, by: -13.9, hr: 7.2 * HEAD, hx: 13 * 0.82 + 1.5, hy: -13.9 - 6.8 * 0.5 - 2.8 };

  /** A two-tone flickering flame tongue (outer orange, inner yellow), base at (x, y). */
  function tongueOfFire(g, x, y, w, h, t, i, lean) {
    const f = 1 + Math.sin(t * 9 + i * 2.1) * 0.16 + Math.sin(t * 14.3 + i) * 0.08;
    const l = (lean || 0) + Math.sin(t * 6 + i * 1.7) * w * 0.25;
    g.flame(x, y, w, h * f, g.rgba(FLAME_DEEP, 0.95), null, l);
    g.flame(x, y + 0.3, w * 0.72, h * f * 0.78, g.rgba(FLAME, 0.98), null, l * 0.8);
    g.flame(x, y + 0.5, w * 0.4, h * f * 0.5, g.rgba(FLAME_HOT, 0.98), null, l * 0.5);
  }

  function pebOverlay(g, t, o) {
    if (!g) return;
    const lying = !!(o && o.lying >= 0.5);
    const pose = g.pose;
    const hx = Q.hx + (pose === 'attack' ? 2.5 : pose === 'hurt' ? -1 : 0), hy = Q.hy + (pose === 'attack' ? 1 : 0), r = Q.hr;
    const top = Q.by - Q.ry * 0.82;
    if (lying) {
      // smouldering: a few embers and a wisp of smoke, no mane
      for (let i = 0; i < 3; i++) {
        const k = (t * 0.5 + i / 3) % 1;
        g.circle(-6 + i * 6, top - 1 - k * 8, 1.2 * (1 - k) + 0.3, g.rgba(i === 1 ? FLAME_HOT : FLAME, 0.8 * (1 - k)), null);
      }
      return;
    }
    // glowing cores down his legs (the painter's long legs are mostly outline): same placement as paintQuadruped
    const step = o && typeof o.walk === 'number' ? Math.sin(o.walk * Math.PI * 2) : 0;
    const legX = [Q.rx * 0.58, -Q.rx * 0.55], legTop = Q.by + Q.ry * 0.2;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < 2; i++) {
        const ph = (i === 0) === (pass === 0) ? step : -step;
        const lx = legX[i] + (pass === 0 ? -2 : 0.5) + ph * 1.4, lift = Math.max(0, ph) * 1.3;
        g.line(lx, legTop + 1, lx, -1.4 - lift, g.rgba(pass === 0 ? FLAME : FLAME_HOT, pass === 0 ? 0.75 : 0.95), 1.3);
      }
    }
    // ember core: a darker glow in the chest and a few glowing cracks
    g.glow(1, Q.by + 0.5, 7.5, EMBER, 0.55);
    const pulse = 0.55 + 0.35 * Math.sin(t * 4.2);
    g.line(-4, Q.by + 1, -1.5, Q.by - 1.2, g.rgba(FLAME_HOT, pulse), 0.9);
    g.line(2.5, Q.by + 2.2, 5.2, Q.by + 0.4, g.rgba(FLAME_HOT, pulse * 0.8), 0.8);
    // flame tail: big, upright, wagging (it never stops wagging)
    const wag = Math.sin(t * 13) * 3.2;
    tongueOfFire(g, -Q.rx * 0.9, Q.by - Q.ry * 0.25, 6.2, 13, t, 7, -3.5 + wag);
    // flame mane along the back, tallest over the shoulders
    const mane = [[-8.5, 5, 0.75], [-4, 6, 0.9], [0.5, 6.4, 1], [5, 6, 1.05]];
    for (let i = 0; i < mane.length; i++) {
      const m = mane[i];
      tongueOfFire(g, m[0], top + Math.abs(m[0]) * 0.06, m[1], 8.5 * m[2], t, i, -1.2);
    }
    // flame ears on the crown: two tall pointed licks, perked up (he heard the word "walk")
    tongueOfFire(g, hx - r * 0.55, hy - r * 0.6, r * 0.7, r * 1.55, t, 11, -r * 0.45);
    tongueOfFire(g, hx + r * 0.2, hy - r * 0.78, r * 0.62, r * 1.35, t, 13, -r * 0.3);
    // little flames licking up from the paws
    [[Q.rx * 0.58 + 0.5, 0], [-Q.rx * 0.55 + 0.5, 0], [Q.rx * 0.58 - 2, -0.6], [-Q.rx * 0.55 - 2, -0.6]].forEach(function (pw, i) {
      tongueOfFire(g, pw[0], pw[1] - 0.6, 3.2, 3.6, t, 20 + i, 0);
    });
    // tongue out (a happy dog), under the snout
    if (pose !== 'hurt') {
      const tx = hx + r * 1.15, ty = hy + r * 0.72 + Math.sin(t * 7) * 0.35;
      g.ellipse(tx, ty, r * 0.2, r * 0.34, g.pal.tongue, g.outline, 0.2);
      g.line(tx, ty - r * 0.2, tx + r * 0.03, ty + r * 0.12, g.shade(g.pal.tongue, -0.3), 0.6);
    }
    // his blue collar across the neck (the painter's sits under the head) and the gold tag hanging off it
    g.limb(hx - r * 0.98, hy + r * 0.5, hx - r * 0.12, hy + r * 1.0, 2.2, g.pal.collar, hx - r * 0.5, hy + r * 0.95);
    const gx = hx - r * 0.55, gy = hy + r * 1.36 + Math.sin(t * 2.6) * 0.2;
    g.line(gx, gy - r * 0.32, gx, gy - r * 0.1, g.outline, 0.6);
    g.circle(gx, gy, r * 0.27, g.pal.metal, g.outline);
    g.text('P', gx, gy + 0.1, r * 0.3, '#7a4a08', null);
    // sparks drifting up
    for (let i = 0; i < 4; i++) {
      const k = (t * 0.55 + i / 4) % 1;
      const sx = -9 + i * 6.5 + Math.sin(t * 2 + i * 2.4) * 1.5, sy = top - 4 - k * 14;
      g.circle(sx, sy, 0.9 * (1 - k) + 0.35, g.rgba(i % 2 ? FLAME_HOT : FLAME, 0.9 * (1 - k)), null);
    }
  }
  /** A warm pool of firelight under him. */
  function pebUnderlay(g, t) {
    if (!g) return;
    const a = 0.3 + 0.08 * Math.sin(t * 3.3);
    g.ellipse(0, 0.5, 15, 5.2, g.rgba(FLAME, a * 0.75), null);
    g.ellipse(0, 0.5, 8, 2.8, g.rgba(FLAME_HOT, a * 0.6), null);
  }
  const PEB_SPRITE = {
    base: 'quadruped', scale: 1, palette: PEB_PAL,
    shape: { legs: 'long', snout: 'long', body: 'long', fluff: false },
    head: { size: HEAD, ears: 'none', eyes: 'big', mouth: 'smile', blush: false },
    tail: 'none', extras: ['collar'],
    aura: { kind: 'glow', color: FLAME },
    overlay: pebOverlay,
    underlay: pebUnderlay,
    portrait: { x: Q.hx + 4, y: Q.hy - 1, r: 14 },   // frame his face (snout, tongue, flame ears), not the whole bonfire
  };

  // ---- skills -----------------------------------------------------------------------------------------
  function skill(def) { def.owner = HERO; return DD.registerSkill(def); }

  // Basic: Spicy Nibble (melee: also his attack of opportunity, Burn included)
  skill({
    id: 'peb_basic', name: 'Spicy Nibble', icon: '🦴', kind: 'attack', tags: ['melee', 'burn'],
    ap: 1, cooldown: 0,
    levels: [{ dmg: 4, burn: 1 }],
    target: { type: 'unit', range: [1, 1], filter: 'enemy' },
    desc: function (L, user) { return 'Deal ' + L.dmg + ' damage to an adjacent foe and Burn ' + nibbleBurn(L, user) + '.'; },
    flavor: 'A love bite. From a bonfire. With teeth.',
    execute: function (ctx) {
      const u = ctx.user, t = ctx.targetUnit;
      if (!foeOf(u, t)) return;
      DD.FX.lunge(u, t, { ms: 110 });
      if (ctx.opportunity) DD.Act.maybeBark(u, 'opportunity', 0.5);   // cosmetic: a foe tried to walk away from him
      DD.FX.particles(t, { kind: 'fire', count: 6, parallel: true });
      DD.Act.damage(u, t, ctx.L.dmg, { skill: ctx.skill, tags: ['melee', 'bite'] });
      if (active(t)) DD.Act.addStatus(t, 'burn', { stacks: nibbleBurn(ctx.L, u) }, u);
    },
  });

  // Hot Zoomies (starter): a dash along any path that leaves a trail of fire behind him
  skill({
    id: 'peb_zoomies', name: 'Hot Zoomies', icon: '💨', kind: 'move', tags: ['move', 'dash', 'fire', 'surface'],
    ap: 1, cooldown: 2,
    levels: [{ len: 4, turns: 2 }, { len: 5, turns: 2 }, { len: 6, turns: 3 }],
    target: {
      type: 'tile', range: function (L) { return [1, L.len]; }, los: false, filter: 'empty',
      canTarget: function (ctx) {
        const len = reachOf(ctx.user, ctx.skill, ctx.level, (ctx.L || {}).len || 4);
        return zoomPath(ctx.user, ctx.target, len) ? true : 'Can\'t zoom there.';
      },
    },
    canUse: function (ctx) { return ctx.user && DD.Act.cantMove(ctx.user) ? 'Can\'t move! No zoomies.' : true; },
    desc: function (L) {
      return 'Dash up to ' + plural(L.len, 'tile') + ', leaving fire (' + plural(L.turns, 'round') + ') on every tile Pebbles leaves, except under allies.';
    },
    flavor: 'Nobody knows what starts the zoomies. Everybody knows what ends them: the carpet.',
    execute: function (ctx) {
      const u = ctx.user;
      const len = reachOf(u, ctx.skill, ctx.level, ctx.L.len);
      const path = zoomPath(u, ctx.target, len);
      if (!path || DD.Act.cantMove(u)) return;
      const start = { x: u.x, y: u.y };
      DD.FX.text(u, '💨 ZOOMIES!', { color: FLAME_HOT, size: 15 });
      const walked = DD.Act.moveAlong(u, path) || [];
      const left = [start].concat(walked).filter(function (q) { return q.x !== u.x || q.y !== u.y; });
      left.forEach(function (q, i) {
        const o = G().unitAt(q.x, q.y);
        if (o && o !== u) return;   // allies he zoomed past keep their feet unburnt
        ignite(u, q.x, q.y, ctx.L.turns, i > 0);
      });
      if (walked.length) DD.Act.maybeBark(u, 'move', 0.3);
    },
  });

  // Fetch Quest (starter): bite a foe at range and drag it back to the party
  skill({
    id: 'peb_fetch', name: 'Fetch Quest', icon: '🎾', kind: 'attack', tags: ['pull', 'ranged', 'fire'],
    ap: 1, cooldown: 2,
    levels: [{ dmg: 3, pull: 2, range: 4 }, { dmg: 4, pull: 2, range: 4 }, { dmg: 5, pull: 3, range: 5 }],
    target: { type: 'unit', range: function (L) { return [2, L.range]; }, los: true, filter: 'enemy' },
    desc: function (L) {
      return 'Deal ' + L.dmg + ' fire damage to a foe 2-' + L.range + ' tiles away and pull it ' + plural(L.pull, 'tile') + ' toward Pebbles.';
    },
    flavor: 'The quest: fetch. The reward: the goblin, slightly chewed, smouldering, at your feet.',
    execute: function (ctx) {
      const u = ctx.user, t = ctx.targetUnit;
      if (!foeOf(u, t)) return;
      DD.FX.beam(u, t, { color: FLAME, width: 3 });
      DD.FX.particles(t, { kind: 'fire', count: 8, parallel: true });
      DD.FX.text(t, '🎾 FETCH!', { color: FLAME_HOT, size: 15 });
      DD.Act.damage(u, t, ctx.L.dmg, { skill: ctx.skill, element: 'fire', tags: ['bite', 'pull'] });
      if (active(t) && active(u)) DD.Act.pull(u, t, u, ctx.L.pull);
    },
  });

  // Chew Toy: a big bite; he won't let go (Root)
  skill({
    id: 'peb_chew_toy', name: 'Chew Toy', icon: '🧸', kind: 'attack', tags: ['melee', 'root'],
    ap: 2, cooldown: 1,
    levels: [{ dmg: 7 }, { dmg: 9 }, { dmg: 11 }],
    target: { type: 'unit', range: [1, 1], filter: 'enemy' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to an adjacent foe and Root it for its next turn.'; },
    flavor: 'He will not let go. He will never let go. It is his toy now.',
    execute: function (ctx) {
      const u = ctx.user, t = ctx.targetUnit;
      if (!foeOf(u, t)) return;
      DD.FX.lunge(u, t, { ms: 130 });
      DD.FX.text(t, '🧸 MINE!', { color: FLAME_HOT, size: 15 });
      DD.Act.damage(u, t, ctx.L.dmg, { skill: ctx.skill, tags: ['melee', 'bite', 'root'] });
      if (active(t)) DD.Act.addStatus(t, 'root', { turns: 1 }, u);
    },
  });

  // Big Wag: the flaming tail hits everything around him and knocks it back
  skill({
    id: 'peb_wag', name: 'Big Wag', icon: '🔥', kind: 'attack', tags: ['melee', 'aoe', 'fire', 'push'],
    ap: 2, cooldown: 2,
    levels: [{ dmg: 4, push: 1 }, { dmg: 5, push: 1 }, { dmg: 6, push: 2 }],
    target: { type: 'self' },
    area: { shape: 'adjacent' },
    desc: function (L) { return 'Deal ' + L.dmg + ' fire damage to every adjacent foe and push each ' + plural(L.push, 'tile') + ' away from Pebbles.'; },
    flavor: 'He is just very, very happy to see you. Stand back.',
    execute: function (ctx) {
      const u = ctx.user;
      DD.FX.text(u, '🔥 WAG WAG WAG', { color: FLAME_HOT, size: 15 });
      ctx.tiles.forEach(function (q, i) { DD.FX.tile(q.x, q.y, 'glow', { color: FLAME, parallel: i > 0 }); });
      ctx.foes.forEach(function (f) {
        if (!active(f)) return;
        DD.FX.particles(f, { kind: 'fire', count: 6, parallel: true });
        DD.Act.damage(u, f, ctx.L.dmg, { skill: ctx.skill, element: 'fire', tags: ['aoe', 'push'] });
        if (active(f) && active(u)) DD.Act.knockback(u, f, ctx.L.push);
      });
    },
  });

  // Bork!: area taunt (the good boy draws the attention)
  skill({
    id: 'peb_bork', name: 'Bork!', icon: '📢', kind: 'utility', tags: ['taunt', 'aoe'],
    ap: 1, cooldown: function (L) { return L.cd; },
    levels: [{ r: 2, cd: 3 }, { r: 3, cd: 3 }, { r: 3, cd: 2 }],
    target: { type: 'self' },
    area: { shape: 'circle', size: function (L) { return L.r; } },
    desc: function (L) { return 'Every foe within ' + plural(L.r, 'tile') + ' is Taunted: on its next turn it must attack Pebbles.'; },
    flavor: 'BORK. (Translation: "Look at me. No, ME. Not the wizard. ME.")',
    aiScore: function (ctx) {
      const u = ctx.user;
      if (!u) return 0;
      const healthy = u.hp >= u.maxHp * 0.5 ? 2.5 : 0.5;
      return ctx.foes.filter(function (f) { return active(f) && !DD.Act.isStunned(f); }).length * healthy;
    },
    execute: function (ctx) {
      const u = ctx.user;
      DD.FX.text(u, '📢 BORK!', { color: FLAME_HOT, size: 18 });
      DD.FX.sound('bark');
      ctx.foes.forEach(function (f) { if (active(f)) DD.Act.addStatus(f, 'taunt', { turns: 1 }, u); });
    },
  });

  // Emotional Support Dog: a lick that heals an adjacent ally and fires it up (Inspired)
  skill({
    id: 'peb_support', name: 'Emotional Support Dog', icon: '💛', kind: 'heal', tags: ['heal', 'buff'],
    ap: 1, cooldown: 2,
    levels: [{ heal: 4 }, { heal: 6 }, { heal: 8 }],
    target: { type: 'unit', range: [1, 1], filter: 'ally' },
    desc: function (L) { return 'An adjacent ally heals ' + L.heal + ' HP and is Inspired (+25% damage) until the end of its next turn.'; },
    flavor: 'Certified. By himself. He is also, technically, a fire hazard. Emotionally, a comfort.',
    execute: function (ctx) {
      const u = ctx.user, t = ctx.targetUnit;
      // v2: aimed at a downed ally, the lick gets it back up (the heal is its HP), then the Inspire
      if (!t || t.dead) return;
      DD.FX.lunge(u, t, { ms: 90 });
      DD.FX.particles(t, { kind: 'hearts', count: 8, parallel: true });
      DD.FX.text(t, '💛 Lick!', { color: '#ffd9e0', size: 14 });
      DD.Act.heal(u, t, ctx.L.heal);
      if (active(t)) DD.Act.addStatus(t, 'inspired', { turns: 1 }, u);
    },
  });

  // This Is Fine: he sits down in a room that is now on fire
  skill({
    id: 'peb_this_is_fine', name: 'This Is Fine', icon: '☕', kind: 'utility', tags: ['fire', 'surface', 'aoe'],
    ap: 1, cooldown: 3,
    levels: [{ r: 1, turns: 2 }, { r: 1, turns: 3 }, { r: 2, turns: 3 }],
    target: { type: 'self' },
    area: { shape: 'circle', size: function (L) { return L.r; } },
    desc: function (L) {
      return 'Set Pebbles\' tile and every tile within ' + L.r + ' on fire for ' + plural(L.turns, 'round') + ', except under allies.';
    },
    flavor: 'He sits. He sips his coffee. The room is on fire. This is fine. He is the fire.',
    aiScore: function (ctx) {
      const u = ctx.user;
      // Hot Dog's heal at his turn end (a flying Pebbles floats over the fire: no heal)
      return u && G().feelsFloor(u) ? Math.min(cozyHeal(u), Math.max(0, u.maxHp - u.hp)) * 0.8 : 0;
    },
    execute: function (ctx) {
      const u = ctx.user;
      DD.FX.text(u, '☕ This is fine.', { color: FLAME_HOT, size: 15 });
      fineTiles(u, ctx.L.r).forEach(function (q, i) { ignite(u, q.x, q.y, ctx.L.turns, i > 0); });
      DD.FX.particles(u, { kind: 'fire', count: 14, parallel: true });
    },
  });

  // Bark-B-Q: payoff — everything that is already Burning gets barbecued
  skill({
    id: 'peb_bbq', name: 'Bark-B-Q', icon: '🍖', kind: 'attack', tags: ['fire', 'aoe', 'payoff'],
    ap: 2, cooldown: 3,
    levels: [{ dmg: 6, r: 3 }, { dmg: 8, r: 3 }, { dmg: 10, r: 3 }],
    target: { type: 'self' },
    area: { shape: 'circle', size: function (L) { return L.r; } },
    canUse: function (ctx) {
      return ctx.user && !burningFoes(ctx.user, (ctx.L || {}).r || 3).length ? 'Nothing is on fire. Yet.' : true;
    },
    desc: function (L) { return 'Deal ' + L.dmg + ' fire damage to every Burning foe within ' + plural(L.r, 'tile') + '.'; },
    flavor: 'Low and slow is for amateurs. Pebbles cooks hot and fast and slightly too close.',
    execute: function (ctx) {
      const u = ctx.user;
      DD.FX.text(u, '🍖 BARK-B-Q!', { color: FLAME_HOT, size: 17 });
      ctx.foes.forEach(function (f) {
        if (!active(f) || !has(f, 'burn')) return;
        DD.FX.projectile(u, f, { kind: 'fireball', color: FLAME, arc: 0.4, parallel: true });
        DD.FX.particles(f, { kind: 'fire', count: 10, parallel: true });
        DD.Act.damage(u, f, ctx.L.dmg, { skill: ctx.skill, element: 'fire', tags: ['aoe', 'payoff'] });
      });
    },
  });

  // Puppy Eyes: nobody can stay mad at him (Charm)
  skill({
    id: 'peb_puppy_eyes', name: 'Puppy Eyes', icon: '🥺', kind: 'utility', tags: ['charm', 'control'],
    ap: 2, cooldown: function (L) { return L.cd; },
    levels: [{ range: 3, cd: 4 }, { range: 4, cd: 4 }, { range: 4, cd: 3 }],
    target: { type: 'unit', range: function (L) { return [1, L.range]; }, los: true, filter: 'enemy', canTarget: puppyCheck },
    desc: function (L) { return 'Charm a foe within ' + L.range + ' (not a boss): on its next turn it fights for your side.'; },
    flavor: 'The goblin raised its knife. Then it looked into his eyes. Now it\'s on our side and crying a little.',
    execute: function (ctx) {
      const u = ctx.user, t = ctx.targetUnit;
      if (!active(t)) return;
      DD.FX.particles(t, { kind: 'hearts', count: 10, parallel: true });
      if (DD.Act.addStatus(t, 'charmed', { turns: 1 }, u)) DD.FX.text(t, '🥺 Aww...', { color: '#ffc6d9', size: 15 });
    },
  });

  // Signature: HOT DIGGITY DOG! — a joyful nova around him; the whole party is fired up
  skill({
    id: 'peb_signature', name: 'Hot Diggity Dog!', icon: '🌭', kind: 'attack', tags: ['aoe', 'buff'],
    ap: 2, cooldown: 0, hype: 100,
    levels: [{ dmg: 16, r: 2 }],
    target: { type: 'self' },
    area: { shape: 'circle', size: 2 },
    desc: function (L) {
      return 'Deal ' + L.dmg + ' damage to every foe within ' + L.r + ' tiles. Pebbles and every ally are Inspired until the end of their next turn.';
    },
    flavor: 'He is so happy. He is SO happy. Everyone near him is now toast, and also loved.',
    execute: function (ctx) {
      const u = ctx.user, s = DD.Combat.state;
      DD.FX.banner('HOT DIGGITY DOG!', { sub: 'Who\'s a good boy? EVERYONE.', color: FLAME_HOT, ms: 900 });
      DD.FX.flash('#ffd27a', 240);
      DD.FX.shake(9, 450);
      DD.FX.explosion(u, { radius: 2, color: FLAME });
      ctx.tiles.forEach(function (q, i) { DD.FX.tile(q.x, q.y, 'glow', { color: FLAME_DEEP, parallel: i > 0 }); });
      DD.FX.particles(u, { kind: 'fire', count: 30, parallel: true });
      ctx.foes.forEach(function (f) {
        if (active(f)) DD.Act.damage(u, f, ctx.L.dmg, { skill: ctx.skill, tags: ['aoe'] });
      });
      if (!active(u) || !s) return;
      // his own side only (a foe charmed onto the party this turn is not his friend next turn)
      s.units.forEach(function (a) {
        if (active(a) && a.side === u.side) DD.Act.addStatus(a, 'inspired', { turns: 1 }, u);
      });
    },
  });

  // ---- items ----------------------------------------------------------------------------------------------
  DD.registerItem({
    id: EXTINGUISHER, name: 'Chewed-Up Fire Extinguisher', slot: 'weapon', rarity: 'rare', icon: '🧯', hero: HERO,
    stats: { dmg: 0.1 },
    desc: '+10% damage. Spicy Nibble Burns 2 instead of 1.',
    flavor: 'His one true nemesis. He won. It still squeaks a little foam when he chews it.',
    hooks: {},
  });
  DD.registerItem({
    id: DOG_BED, name: 'Fireproof Dog Bed', slot: 'armor', rarity: 'rare', icon: '🛏️', hero: HERO,
    stats: { hp: 6, armor: 1 },
    desc: '+6 max HP, +1 armor. Hot Dog heals ' + COZY_HEAL_BED + ' instead of ' + COZY_HEAL + '.',
    flavor: 'Asbestos-free, the label insists. He sleeps in it while it is on fire. Especially then.',
    hooks: {},
  });
  DD.registerItem({
    id: COLLAR, name: 'Collar of the Eternal Flame', slot: 'trinket', rarity: 'legendary', icon: '📿', hero: HERO,
    stats: { hp: 4 },
    desc: '+4 max HP. Once per fight, when Pebbles would go down, he flares back up at ' + REKINDLE_HP + ' HP instead.',
    flavor: 'The tag reads "PEBBLES. IF FOUND: he is not lost, he is on fire. Return anyway."',
    hooks: {
      preventDeath: function (unit) {
        if (!unit || unit.kind !== 'hero' || (unit.data && unit.data.pebRekindled)) return false;
        unit.data = unit.data || {};
        unit.data.pebRekindled = true;
        unit.hp = Math.max(1, Math.min(unit.maxHp, REKINDLE_HP));
        DD.FX.text(unit, '🔥 Rekindled!', { color: FLAME_HOT, size: 17 });
        DD.FX.particles(unit, { kind: 'fire', count: 18 });
        DD.Act.log(unit.name + ' flares back up! (Collar of the Eternal Flame)', 'hero');
        DD.Act.bark(unit, 'revive');
        return true;
      },
    },
  });

  // ---- the hero ---------------------------------------------------------------------------------------------
  const PASSIVE = {
    name: 'Hot Dog',
    desc: 'Pebbles is made of fire: fire damage and Burn can\'t hurt him, and ending his turn on fire or lava heals him ' +
      COZY_HEAL + ' HP.',
    // the immunity itself is data on the def (resist: { fire: 0 }, flags.immune: ['burn']): enemy estimates read it;
    // the hook is the cosy part
    hooks: {
      onTurnEnd: function (unit) {
        if (!active(unit) || !inFire(unit)) return;
        const n = DD.Act.heal(unit, unit, cozyHeal(unit));
        if (n > 0) DD.FX.text(unit, '🔥 Cozy!', { color: FLAME_HOT, size: 14 });
      },
    },
  };

  DD.registerHero({
    id: HERO, name: 'Pebbles', epithet: 'the Goodest Boy', race: 'Fire Dog', cls: 'Very Good Boy',
    role: 'Melee skirmisher & fire control', complexity: 2,
    blurb: 'A living bonfire in the shape of a very good dog. He wags his tail and the carpet catches fire; he fetches sticks ' +
      'and brings back torches. He loves everyone, goblins included, right up until they hurt his friends.',
    color: '#ff9d2e',
    unlock: null,
    stats: { hp: 26, ap: 3, mov: 5, armor: 0, init: 3 },
    growth: { hp: 4 },
    flags: { immune: ['burn'] },
    resist: { fire: 0 },
    sprite: PEB_SPRITE,
    basic: 'peb_basic',
    signature: 'peb_signature',
    passive: PASSIVE,
    startingSkills: ['peb_zoomies', 'peb_fetch'],
    skillPool: ['peb_zoomies', 'peb_fetch', 'peb_chew_toy', 'peb_wag', 'peb_bork', 'peb_support', 'peb_this_is_fine', 'peb_bbq',
      'peb_puppy_eyes'],
    summons: [],
    barks: {
      select: ['BORK! Hi! Hi! Are we going? We\'re going!', 'Pebbles reporting! Tail: wagging. Carpet: on fire.',
        'Is it walkies? It\'s walkies, isn\'t it? BORK!', 'Throw the stick! Any stick! I\'ll light it!',
        'Good boy, ready for duty! Very ready! Too ready!'],
      start: ['New friends to meet! Oh. They have knives. Bad friends.', 'BORK BORK! That means hello. And also you\'re toast.',
        'Roll for initiative? I\'ll roll in the embers!', 'Everyone stay calm! I\'m calm! I\'m on fire, but calm!',
        'Who wants to play? Everyone? GOOD!'],
      move: ['ZOOMIES!', 'SQUIRREL!', 'Coming! Coming! Sorry about the rug!', 'Hot paws! Hot paws! Hot paws!',
        'Fetching! I don\'t know what! Fetching!'],
      kill: ['I fetched it! It\'s... a bit crispy.', 'Good boy! I\'m the good boy! BORK!', 'Bad goblin. Very bad. Now very toasty.',
        'Can I keep it? Oh. It\'s ashes now.', 'Who\'s a good boy? ME! I did that!'],
      hurt: ['Yelp! I\'m okay! Still on fire!', 'Ow! Rude! I was being so good!', 'Hey! No hitting the dog!',
        'That is NOT how you pet a dog!', 'Whimper. Flare. Back to wagging.'],
      lowhp: ['My flame\'s getting low... need a hug... or a log.', 'Pebbles is a little tired. Little nap soon?',
        'Flickering! Someone fetch me kindling!', 'Not feeling so toasty. Help?', 'Josiah? Ellaria? Anyone with treats?'],
      downed: ['Pebbles... was... a good boy...', 'Tell everyone... I fetched my best...', 'Fire\'s out... wake me for dinner...',
        '*sad smouldering noises*', 'Just an ember now. A very good ember.'],
      revive: ['I\'M BACK! Did you miss me? You missed me!', 'Rekindled! It smells like toast in here!',
        'Up, up, UP! Who wants zoomies?', 'Thank you! Thank you! Licks for everyone!', 'Fire\'s back on! Let\'s GO!'],
      ally_down: ['No! Friend! Wake up! I\'ll lick your face!', 'Bad monster! You hurt my friend!',
        'Someone help them up! I\'ll stand watch! BORK!', 'Nobody hurts my pack! NOBODY!', 'Sit... stay... please get up...'],
      levelup: ['I learned a new trick! Watch!', 'Bigger flames! Same good boy!', 'Level up! Do I get a treat? I get a treat!',
        'New trick unlocked: even more fire!', 'Good boy points: maxed! Wait, there\'s more?'],
      victory: ['We won! Belly rubs for everyone! Careful, hot!', 'Victory zoomies! EVERYBODY!', 'Best walkies ever! Again! Again!',
        'Everyone did so good! I did good too!', 'Can we go again? Please? PLEASE?'],
      idle: ['Is that a ball? Is it MY ball? BORK!', 'Slate is a big grumpy rock. I love him so much.',
        'Valdris says no sitting on the anvil. I sat on the anvil.', 'Hjalmar stole my stick again. He\'s my best friend.',
        'Kiri says I\'m "a lot". She pets me anyway.', 'Zarathor says I\'m tacky. He\'s wearing six chains.'],
      signature: ['HOT DIGGITY DOG!', 'Who\'s a good boy? EVERYONE IS!', 'BORK! BORK! BOOOOORK!', 'Love you all! Here\'s ALL my fire!',
        'Biggest. Wag. EVER!'],
      // his attacks of opportunity (Spicy Nibble on a foe walking away from him)
      opportunity: ['Hey! Where are you going? Come back and play!', 'No running from the dog!', 'Chase! Chase! Caught you!',
        'Leaving? Take a souvenir! It\'s fire!'],
    },
  });

  /** Small public surface for tests and other content (read-only helpers). */
  DD.Pebbles = {
    FLAME: FLAME,
    COZY_HEAL: COZY_HEAL, COZY_HEAL_BED: COZY_HEAL_BED, REKINDLE_HP: REKINDLE_HP,
    zoomPath: zoomPath,
    inFire: inFire,
    cozyHeal: cozyHeal,
    fineTiles: fineTiles,
    burningFoes: burningFoes,
  };
})();
