/* Dungeons and Degenerates — js/data/heroes/ellaria.js
 * Ellaria the Corgi Whisperer, elf druid: corgi summoner / healer / control. v2 kit: one verb per skill, power from
 * combinations (Healing Spring puddles for lightning / frost, flammable Brambles for fire and shoves, Who's a Good Boy?
 * Empowers an ally, Thorn Whip / Fetch! pull foes into allies' cleaves, corgis taunt).
 * Passive Pack Leader: every fight starts with a corgi at her side; a fallen corgi Inspires the party (AVENGE BISCUIT!).
 * Registers the hero, basic Thorn Whip (Chomp while shapeshifted), 9 pool skills, signature Release the Corgis!,
 * the ell_corgi summon (Bite, Bark taunt), status ell_absolute_unit (Wild Shape), surface ell_bramble, 3 items.
 */
(function () {
  'use strict';
  const DD = window.DD;

  const CORGI = 'ell_corgi';
  const BRAMBLE = 'ell_bramble';
  const PACK = 3;               // corgis Ellaria can keep at once (Summon Corgi, the Flower Crown)
  const BITE = 3;               // corgi Bite damage
  const CHOMP = [7, 9, 10];     // Chomp damage per Wild Shape level
  const CORGI_BASE_HP = 9;      // def hp; real HP = 8 + Ellaria's level (via hpMult)
  const BRAMBLE_DMG = 3;        // Brambles laid without a level (other content): Entangling Roots I
  const STICK = 'ell_good_stick', ROBE = 'ell_shedding_robe', CROWN = 'ell_flower_crown';
  const NAMES = ['Biscuit', 'Waffles', 'Sir Fluffington III', 'Nugget', 'Captain Loaf', 'Pancake', 'Butterbean', 'Muffin',
    'Lord Wigglebottom', 'Tater Tot', 'Meatloaf', 'Princess Stumpy', 'Duke Floofington', 'Admiral Snoot', 'Pudding', 'Crouton'];

  // ---- helpers ----------------------------------------------------------------------------------------------
  function A() { return DD.Act; }
  function G() { return DD.Grid; }
  function S() { return DD.Combat && DD.Combat.state; }
  function active(u) { return !!u && !u.dead && !u.downed; }
  function dist(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
  function hasItem(u, id) { return !!u && Array.isArray(u.items) && u.items.indexOf(id) >= 0; }
  function ownerOf(u) { return u && u.ownerId != null && DD.Combat ? DD.Combat.byId(u.ownerId) : null; }
  function isCorgiOf(u, owner) { return !!u && !!owner && u.defId === CORGI && u.ownerId === owner.id; }
  function byPos(a, b) { return a.y - b.y || a.x - b.x; }
  function heroLevel(u) { return u && u.level > 0 ? Math.floor(u.level) : 1; }
  function corgiHp(owner) { return 8 + heroLevel(owner); }

  /** Ellaria's living corgis, in board order (deterministic). */
  function corgisOf(owner) {
    const s = S();
    if (!s || !owner) return [];
    return s.units.filter(function (u) { return active(u) && isCorgiOf(u, owner); });
  }

  /** A free tile a corgi can safely stand on (no pit / deep water / damaging hazard). */
  function safeFree(x, y) { return G().isFree(x, y) && !G().isDrop(x, y) && !G().hazardAt(x, y, null); }
  /** Free safe tiles next to `p`, nearest to `near` first. */
  function besideTiles(p, near) {
    const out = [];
    DD.util.DIRS.forEach(function (d) { const q = { x: p.x + d.x, y: p.y + d.y }; if (safeFree(q.x, q.y)) out.push(q); });
    return out.sort(function (a, b) { return (near ? dist(a, near) - dist(b, near) : 0) || byPos(a, b); });
  }

  /**
   * A name no living corgi is using, so "AVENGE BISCUIT!" is never ambiguous. Picked by a hash of the fight seed and
   * the number of corgis so far: different every fight, no combat-RNG draw (a summon's preview stays exact).
   */
  function freshName() {
    const s = S();
    const taken = {};
    let made = 0;
    if (s) s.units.forEach(function (u) { if (u.defId !== CORGI) return; made++; if (!u.dead) taken[u.name] = 1; });
    const free = NAMES.filter(function (n) { return !taken[n]; });
    const pool = free.length ? free : NAMES;
    const name = pool[(DD.util.hash(String(s ? s.seed : 0) + ':corgi:' + made) >>> 0) % pool.length];
    return free.length ? name : name + ' Jr.';
  }

  function summonCorgi(owner, x, y, opts) {
    return A().summon(owner, CORGI, x, y, Object.assign({ hpMult: corgiHp(owner) / CORGI_BASE_HP, name: freshName() }, opts || {}));
  }

  /** The tile `foe` is dragged into first when pulled toward `toward` (null without a direction). */
  function dragTile(foe, toward) {
    const d = toward ? DD.util.dirTo(foe, toward) : null;
    return d && (d.x || d.y) ? { x: foe.x + d.x, y: foe.y + d.y } : null;
  }

  /**
   * Dash a corgi next to `foe` (jump FX). It prefers a tile off the drag lane toward `toward`; the lane tile is used
   * only when nothing else is free. Returns true when the corgi ends next to the foe.
   */
  function dashBeside(c, foe, toward) {
    if (!active(c) || !active(foe)) return false;
    const lane = dragTile(foe, toward);
    const onLane = function (q) { return !!lane && q.x === lane.x && q.y === lane.y; };
    if (dist(c, foe) === 1 && !onLane(c)) return true;
    const spots = besideTiles(foe, c);
    const spot = spots.filter(function (q) { return !onLane(q); })[0] || (dist(c, foe) === 1 ? null : spots[0]);
    if (!spot) return dist(c, foe) === 1;
    const from = { x: c.x, y: c.y };
    if (!A().teleport(c, spot.x, spot.y, { fx: false })) return dist(c, foe) === 1;
    DD.FX.jump(c, from, { x: c.x, y: c.y }, { ms: 240 });
    return active(c) && dist(c, foe) === 1;
  }

  /** A corgi standing on the drag lane backs up along it (safe free tiles only) so the foe can follow. Returns the steps taken. */
  function backUp(c, d, n) {
    let m = 0;
    while (m < n && active(c)) {
      const q = { x: c.x + d.x, y: c.y + d.y };
      if (!safeFree(q.x, q.y) || !G().canStep(c, { x: c.x, y: c.y }, q)) break;
      const from = { x: c.x, y: c.y };
      if (!A().teleport(c, q.x, q.y, { fx: false })) break;
      DD.FX.slide(c, from, q, { ms: 110 });
      m++;
    }
    return m;
  }

  /** The corgi that answers Fetch! for `foe`: Ellaria's corgi nearest to it (board order breaks ties). */
  function fetcher(owner, foe) {
    if (!foe) return null;
    return corgisOf(owner).sort(function (a, b) { return dist(a, foe) - dist(b, foe) || byPos(a, b); })[0] || null;
  }

  // ---- Wild Shape bookkeeping (sprite override, immovable flag, basic attack swap) ---------------------------
  function shapeOn(unit, level) {
    const d = unit.data || (unit.data = {});
    unit.flags = unit.flags || {};
    if (!d.ellShape) d.ellShape = { immovable: !!unit.flags.immovable };
    unit.flags.immovable = true;
    unit.sprite = GIANT_CORGI_SPRITE;
    unit.basic = A().makeSlot('ell_chomp', Math.max(1, Math.min(3, level || 1)));
    A().touch();
  }
  function shapeOff(unit) {
    const d = unit && unit.data;
    if (!d || !d.ellShape) return false;
    unit.flags = unit.flags || {};
    if (d.ellShape.immovable) unit.flags.immovable = true; else delete unit.flags.immovable;
    delete unit.sprite;
    const def = DD.getHero(unit.defId);
    unit.basic = def && def.basic ? A().makeSlot(def.basic, 1) : null;
    d.ellShape = null;
    if (A().hasStatus(unit, 'ell_absolute_unit')) A().removeStatus(unit, 'ell_absolute_unit', { silent: true });
    A().touch();
    if (!unit.dead) {
      DD.FX.particles(unit, { kind: 'leaves', count: 10 });
      DD.FX.text(unit, 'Back to elf!', { color: '#bfe8a0', size: 14 });
    }
    return true;
  }
  /** The form ends when its status is gone (cleansed, dispelled). */
  function syncShape(unit) {
    if (unit && unit.data && unit.data.ellShape && !A().hasStatus(unit, 'ell_absolute_unit')) shapeOff(unit);
  }

  // ---- sprites ----------------------------------------------------------------------------------------------
  const FLOWERS = ['#ff6fb0', '#ffffff', '#ffd23f', '#b98cff', '#ff9e5e', '#ffffff'];
  /** Five-petal flower: one filled path with a thin darker edge (the sprite outline would drown it at 40 px). */
  function flower(g, x, y, r, col, rot) {
    g.path(function (c) {
      for (let k = 0; k < 5; k++) {
        const a = rot + k * Math.PI * 0.4, px = x + Math.cos(a) * r * 0.6, py = y + Math.sin(a) * r * 0.6;
        c.moveTo(px + r * 0.5, py);
        c.arc(px, py, r * 0.5, 0, Math.PI * 2);
      }
    }, col, g.shade(col, -0.5), 0.5);
    g.circle(x, y, r * 0.34, col === '#ffd23f' ? '#ff8a2a' : '#ffd23f', null);
  }
  /** A bright crown of flowers along the top of a head centred at (hx, hy) with radius r. */
  function flowerCrown(g, hx, hy, r, size, n) {
    n = n || FLOWERS.length;
    const spot = function (i, off) { const a = Math.PI * (1.12 + 0.76 * i / (n - 1)) + (off || 0); return [hx + Math.cos(a) * r, hy + Math.sin(a) * r * 0.9, a]; };
    for (let i = 0; i < n - 1; i++) { const p = spot(i, 0.13); g.ellipse(p[0], p[1], r * 0.2, r * 0.085, '#4f9e3c', null, p[2] + 1.2); }
    for (let i = 0; i < n; i++) { const p = spot(i); flower(g, p[0], p[1], size * (i % 2 ? 0.82 : 1), FLOWERS[i % FLOWERS.length], i * 0.7); }
  }
  /** Ellaria: flower crown (the default hat reads as dark rings at 40 px) and a leaf pattern on the dress. */
  function ellariaOverlay(g) {
    const hx = g.pose === 'attack' ? 1.2 : g.pose === 'hurt' ? -0.8 : 0;
    const leaf = function (x, y, rot, col) { g.ellipse(x, y, 2.1, 1.0, col, null, rot); };
    leaf(-4.5, -9.5, 0.7, '#8fd06a');
    leaf(3.8, -7.2, -0.6, '#cdeb8f');
    leaf(-1.2, -4.6, 0.3, '#8fd06a');
    leaf(5.2, -12.5, -0.9, '#cdeb8f');
    flowerCrown(g, hx, -27.4, 9.6, 2.6);
  }
  /**
   * Corgi details on the quadruped base: white blaze and muzzle, black nose, happy tongue, fluffy white loaf butt.
   * Head geometry mirrors the quadruped painter (long body, short legs, head size 1).
   */
  function corgiOverlay(g) {
    const rx = 13, ry = 6.8, by = -(4.2 + ry * 0.72), r = 7.2;
    const atk = g.pose === 'attack', hurt = g.pose === 'hurt';
    const hx = rx * 0.82 + 1.5 + (atk ? 2.5 : hurt ? -1 : 0), hy = by - ry * 0.5 - 2.8 + (atk ? 1 : 0);
    const white = '#fff6ea';
    g.ellipse(-rx * 0.9, by - ry * 0.05, 3.6, 3.4, white, null);
    g.ellipse(-rx * 0.78, by + ry * 0.25, 3.0, 2.8, white, null);
    // narrow blaze between the eyes, white lower muzzle under them, nose, a little tongue
    const ex = hx + r * 0.3;
    g.poly([[ex - 0.6, hy - r * 0.97], [ex + 0.6, hy - r * 0.97], [ex + 1.05, hy + r * 0.42], [ex - 0.9, hy + r * 0.42]], white, null);
    g.path(function (c) {
      c.moveTo(hx + r * 0.45, hy + r * 0.36);
      c.quadraticCurveTo(hx + r * 1.2, hy + r * 0.2, hx + r * 1.78, hy + r * 0.3);
      c.quadraticCurveTo(hx + r * 1.55, hy + r * 0.74, hx + r * 0.4, hy + r * 0.68);
      c.closePath();
    }, white, null);
    g.ellipse(hx + r * 1.76, hy + r * 0.14, r * 0.2, r * 0.16, '#1d1418', null);
    if (!hurt) g.ellipse(hx + r * 1.3, hy + r * 0.74, r * 0.12, r * 0.17, '#ff7f9a', g.shade('#ff7f9a', -0.4));
    if (g.spec && g.spec.giant) flowerCrown(g, hx - r * 0.1, hy - r * 0.05, r * 0.92, 1.5, 5);
  }

  const ELLARIA_SPRITE = {
    base: 'humanoid', scale: 1, build: 'slim', outfit: 'dress',
    // emerald dress: the old #4e9a3c was the exact hue of grass tiles (#5a9341) and vanished on forest maps
    palette: { skin: '#f4dcc8', cloth: '#2e7d5b', cloth2: '#b7e07a', hair: '#dd7a3c', metal: '#e0bd57', eye: '#2f9a5a',
      accent: '#ff79ad', outline: '#1d2a17', wood: '#8a5a2e', leather: '#9b6a3a' },
    head: { ears: 'elf', hair: 'long', hat: 'none', eyes: 'normal', mouth: 'smile' },
    mainhand: 'staff', offhand: 'none', extras: ['satchel'],
    aura: { kind: 'leaves', color: '#7ccf5a' },
    overlay: ellariaOverlay,
  };
  const CORGI_PALETTE = { skin: '#e48d3a', belly: '#fff5e8', cloth2: '#fff5e8', ear: '#e48d3a', inner: '#ffb7a6',
    eye: '#2a1710', outline: '#2a1910', accent: '#e83d4f', collar: '#e83d4f', hair: '#e48d3a' };
  const CORGI_SPRITE = {
    base: 'quadruped', scale: 0.8, palette: CORGI_PALETTE,
    shape: { legs: 'short', snout: 'long', fluff: true, body: 'long' },
    head: { ears: 'cat', eyes: 'big', mouth: 'smile' },
    tail: 'none', extras: ['collar'],
    overlay: corgiOverlay,
  };
  const GIANT_CORGI_SPRITE = {
    base: 'quadruped', scale: 1.35, giant: true, palette: CORGI_PALETTE,
    shape: { legs: 'short', snout: 'long', fluff: true, body: 'long' },
    head: { ears: 'cat', eyes: 'big', mouth: 'smile' },
    tail: 'none', extras: ['collar'],
    aura: { kind: 'leaves', color: '#7ccf5a' },
    overlay: corgiOverlay,
  };

  // ---- status: Absolute Unit ----------------------------------------------------------------------------------
  DD.registerStatus({
    id: 'ell_absolute_unit', name: 'Absolute Unit', icon: '🐕', color: '#e48d3a', type: 'buff', stacking: 'refresh',
    maxStacks: 1, decay: 'turnEnd', defaultTurns: 1,
    desc: function (st) {
      return 'A giant corgi: can\'t be pushed or pulled, and Thorn Whip is replaced by Chomp.' +
        (st && st.turns > 0 ? ' (' + plural(st.turns, 'turn') + ' left)' : '');
    },
    hooks: {
      // its last tick (not the fresh end of the turn it began): the engine removes the status right after the
      // turn-end hooks, so the form ends now, before anyone else's turn sees an immovable elf
      onTurnEnd: function (unit, st) { if (st && st.turns === 1 && !st.fresh && unit.data && unit.data.ellShape) shapeOff(unit); },
    },
  });

  // ---- surface: Brambles (Entangling Roots) -------------------------------------------------------------------
  /** A foe enters Brambles (or is caught when they grow): the patch's damage, then Rooted. Ellaria's side walks through. */
  function prick(unit, tile) {
    if (!active(unit) || unit.side === 'hero') return;
    const sf = tile && tile.surface;
    const dmg = sf && sf.data && sf.data.dmg > 0 ? sf.data.dmg : BRAMBLE_DMG;
    DD.FX.text(unit, 'Prickly!', { color: '#9fdc7a', size: 13 });
    A().damage(null, unit, dmg, { cause: 'surface', tags: ['bramble'] });
    if (active(unit)) A().addStatus(unit, 'root', { turns: 1 }, null);
  }

  DD.registerSurface({
    id: BRAMBLE, name: 'Brambles', color: 'rgba(72,118,44,0.55)', turns: 2,
    // a hazard only for the other side: enemies path around it, heroes and corgis walk through
    hazard: function (unit) { return !!unit && unit.side !== 'hero'; }, hazardDmg: BRAMBLE_DMG,
    desc: 'Foes that enter take 3-5 damage (Entangling Roots I-III) and are Rooted; Ellaria\'s side walks through. Flammable: fire spreads through the whole patch.',
    react: { fire: { surface: 'fire', turns: 2, spread: true } },
    onEnter: function (unit, tile) { prick(unit, tile); },
    draw: function (g, sf, t) {
      const tl = g.tile || { x: 0, y: 0 };
      const seed = (tl.x * 7 + tl.y * 13) % 5;
      g.diamond(0, 0, 30, 15, 'rgba(58,92,34,0.42)', null);
      const c = g.ctx;
      const vines = [[-24, 2, -8, -12, 10, -1], [-10, 9, 4, -4, 22, 4], [-18, -4, -2, 6, 14, -8]];
      for (let i = 0; i < vines.length; i++) {
        const v = vines[(i + seed) % vines.length];
        const sw = Math.sin(t * 1.3 + i + seed) * 0.8;
        c.beginPath(); c.moveTo(v[0], v[1]); c.quadraticCurveTo(v[2], v[3] + sw, v[4], v[5]);
        c.lineCap = 'round';
        c.strokeStyle = '#3b2a14'; c.lineWidth = 3; c.stroke();
        c.strokeStyle = '#4f8a2e'; c.lineWidth = 1.7; c.stroke();
        for (let k = 1; k < 4; k++) {
          const f = k / 4, x = (1 - f) * (1 - f) * v[0] + 2 * (1 - f) * f * v[2] + f * f * v[4];
          const y = (1 - f) * (1 - f) * v[1] + 2 * (1 - f) * f * (v[3] + sw) + f * f * v[5];
          g.poly([[x - 1.2, y], [x, y - 3.2], [x + 1.2, y]], '#d9c9a0', null);
        }
      }
      g.ellipse(-6 + seed * 2, -3, 2.6, 1.3, '#6fbf4a', null, 0.5);
      g.ellipse(9 - seed, 3, 2.4, 1.2, '#6fbf4a', null, -0.4);
      if (seed % 2 === 0) g.circle(2, -1, 1.4, '#c0304a', null);
    },
  });

  // ---- basic attacks ----------------------------------------------------------------------------------------
  DD.registerSkill({
    id: 'ell_thorn_whip', name: 'Thorn Whip', owner: 'ellaria', icon: '🌿', kind: 'attack', tags: ['ranged', 'pull', 'nature'],
    ap: 1, cooldown: 0, levels: [{ dmg: 4, pull: 1 }],
    target: { type: 'unit', range: [1, 3], los: true, filter: 'enemy' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to a foe and pull it ' + plural(L.pull, 'tile') + ' toward you.'; },
    flavor: 'A gentle whip made of roses. The thorns are there for emotional support.',
    execute: function (ctx) {
      const u = ctx.user, f = ctx.targetUnit;
      if (!u || !active(f)) return;
      DD.FX.beam(u, f, { color: '#5fae4a', width: 3 });
      A().damage(u, f, ctx.L.dmg, { tags: ['nature'] });
      if (active(f)) A().pull(u, f, u, ctx.L.pull);
    },
  });

  DD.registerSkill({
    id: 'ell_chomp', name: 'Chomp', owner: 'ellaria', icon: '🦷', kind: 'attack', tags: ['melee', 'push'],
    ap: 1, cooldown: 0, levels: CHOMP.map(function (d) { return { dmg: d, push: 1 }; }),
    target: { type: 'unit', range: [1, 1], filter: 'enemy' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to an adjacent foe and knock it back ' + plural(L.push, 'tile') + '.'; },
    flavor: 'Replaces Thorn Whip while Ellaria is an Absolute Unit. She has no regrets.',
    execute: function (ctx) {
      const u = ctx.user, f = ctx.targetUnit;
      if (!u || !active(f)) return;
      DD.FX.lunge(u, f);
      A().damage(u, f, ctx.L.dmg, { tags: ['bite'] });
      if (active(f)) A().knockback(u, f, ctx.L.push);
    },
  });

  // ---- pool skills ------------------------------------------------------------------------------------------
  DD.registerSkill({
    id: 'ell_summon_corgi', name: 'Summon Corgi', owner: 'ellaria', icon: '🐕', kind: 'summon', tags: ['summon', 'corgi'],
    ap: 2, cooldown: function (L) { return L.cd; },
    levels: [{ cd: 3 }, { cd: 2 }, { cd: 2, ready: true }],
    target: { type: 'tile', range: [1, 2], los: false, filter: 'empty' },
    canUse: function (ctx) { return corgisOf(ctx.user).length < PACK ? true : 'The pack is full (' + PACK + ' corgis).'; },
    desc: function (L, user) {
      const hp = user && user.level > 0 ? corgiHp(user) + ' HP' : '8 + your level HP';
      return 'Summon a corgi (' + hp + ', Bite ' + BITE + ', Bark taunts) on an empty tile. Up to ' + PACK + ' corgis.' +
        (L.ready ? ' It acts right away.' : '');
    },
    flavor: 'Ellaria does not know where they come from. Neither do the corgis. Nobody asks.',
    execute: function (ctx) {
      const u = ctx.user;
      if (!u || !ctx.target || corgisOf(u).length >= PACK) return;
      const c = summonCorgi(u, ctx.target.x, ctx.target.y, { ready: !!ctx.L.ready });
      if (c) DD.FX.particles(c, { kind: 'hearts', count: 8 });
    },
  });

  DD.registerSkill({
    id: 'ell_spring', name: 'Healing Spring', owner: 'ellaria', icon: '⛲', kind: 'heal', tags: ['heal', 'water', 'aoe'],
    ap: 2, cooldown: 2,
    levels: [{ heal: 5 }, { heal: 6 }, { heal: 8 }],
    target: { type: 'tile', range: [0, 4], los: true, filter: 'any' },
    area: { shape: 'circle', size: 1 },
    desc: function (L) { return 'Allies in radius 1 heal ' + L.heal + ' HP; every other tile there becomes a puddle (Wet).'; },
    flavor: 'Locally sourced, organic, and only slightly full of tadpoles. Conducts lightning beautifully.',
    execute: function (ctx) {
      const u = ctx.user, L = ctx.L;
      if (!u || !ctx.target) return;
      DD.FX.particles(ctx.target, { kind: 'bubbles', count: 16 });
      ctx.tiles.forEach(function (p, i) {
        DD.FX.tile(p.x, p.y, 'splash', { color: '#8fe0ff', parallel: i > 0 });
        const o = G().unitAt(p.x, p.y);
        if (active(o) && !G().hostile(u, o)) return;
        A().applyElement(p.x, p.y, 'water', u);
      });
      ctx.friends.forEach(function (f) { if (active(f)) A().heal(u, f, L.heal); });
    },
  });

  DD.registerSkill({
    id: 'ell_roots', name: 'Entangling Roots', owner: 'ellaria', icon: '🌱', kind: 'spell', tags: ['aoe', 'root', 'nature', 'ranged'],
    ap: 2, cooldown: 2,
    levels: [{ dmg: 3, turns: 2 }, { dmg: 4, turns: 2 }, { dmg: 5, turns: 3 }],
    target: { type: 'tile', range: [2, 5], los: true, filter: 'any' },
    area: { shape: 'circle', size: 1 },
    desc: function (L) {
      return 'Brambles fill radius 1 for ' + plural(L.turns, 'round') + ': foes in or entering them take ' + L.dmg + ' damage and are Rooted.';
    },
    flavor: 'The plants are on her side. They are also extremely flammable, so keep Zarathor on her side too.',
    execute: function (ctx) {
      const u = ctx.user, L = ctx.L;
      if (!u || !ctx.target) return;
      DD.FX.particles(ctx.target, { kind: 'leaves', count: 18 });
      ctx.tiles.forEach(function (p, i) {
        DD.FX.tile(p.x, p.y, 'crack', { color: '#5aa83a', parallel: i > 0 });
        const tl = G().tile(p.x, p.y);
        if (!tl || (tl.surface && tl.surface.id === 'fire')) return;   // brambles don't grow in a fire
        if (A().setSurface(p.x, p.y, BRAMBLE, L.turns) && tl.surface) tl.surface.data = { dmg: L.dmg };
      });
      ctx.foes.forEach(function (f) {
        if (!active(f)) return;
        A().damage(u, f, L.dmg, { tags: ['nature', 'bramble'] });
        if (active(f)) A().addStatus(f, 'root', { turns: 1 }, u);
      });
    },
  });

  DD.registerSkill({
    id: 'ell_barkskin', name: 'Barkskin', owner: 'ellaria', icon: '🌳', kind: 'buff', tags: ['block', 'nature'],
    ap: 1, cooldown: 1,
    levels: [{ block: 5, thorns: 2 }, { block: 7, thorns: 2 }, { block: 9, thorns: 3 }],
    target: { type: 'unit', range: [0, 3], los: false, filter: 'allyOrSelf' },
    desc: function (L) { return 'You or an ally gains ' + L.block + ' Block, plus Thorns ' + L.thorns + ' until the end of their next turn.'; },
    flavor: 'Moisturize. Then lignify.',
    execute: function (ctx) {
      const u = ctx.user, f = ctx.targetUnit, L = ctx.L;
      if (!u || !active(f)) return;
      DD.FX.particles(f, { kind: 'leaves', count: 10 });
      A().addBlock(f, L.block);
      A().addStatus(f, 'thorns', { stacks: L.thorns, turns: 1 }, u);
    },
  });

  DD.registerSkill({
    id: 'ell_good_boy', name: 'Who\'s a Good Boy?', owner: 'ellaria', icon: '🦴', kind: 'buff', tags: ['heal', 'buff'],
    ap: 1, cooldown: function (L) { return L.cd; },
    levels: [{ heal: 3, cd: 2 }, { heal: 5, cd: 2 }, { heal: 6, cd: 1 }],
    target: { type: 'unit', range: [0, 4], los: false, filter: 'allyOrSelf' },
    desc: function (L) {
      return 'Treat an ally, a corgi or yourself: heal ' + L.heal + ' HP and Empowered (next damaging skill +50%).';
    },
    flavor: 'Works on corgis, barbarians and, once, a very confused tax goblin. Best served right before a big swing.',
    // a treat is worth most on someone about to hit hard (not on someone already Empowered)
    aiScore: function (ctx) {
      const f = ctx.targetUnit;
      return f && !A().hasStatus(f, 'empowered') && DD.Combat.foesOf(f).some(function (o) { return dist(o, f) <= 4; }) ? 3 : 0;
    },
    execute: function (ctx) {
      const u = ctx.user, f = ctx.targetUnit;
      if (!u || !active(f)) return;
      DD.FX.projectile(u, f, { kind: 'bone', arc: true });
      DD.FX.particles(f, { kind: 'hearts', count: 8 });
      A().heal(u, f, ctx.L.heal);
      if (active(f)) A().addStatus(f, 'empowered', {}, u);
    },
  });

  DD.registerSkill({
    id: 'ell_fetch', name: 'Fetch!', owner: 'ellaria', icon: '🎾', kind: 'attack', tags: ['pull', 'corgi'],
    ap: 1, cooldown: 2,
    levels: [{ dmg: 3, pull: 2 }, { dmg: 4, pull: 3 }, { dmg: 5, pull: 3 }],
    target: { type: 'unit', range: [1, 6], los: false, filter: 'enemy',
      // the corgi needs somewhere to stand: already next to the foe, or a free safe tile beside it
      canTarget: function (ctx) {
        const f = ctx.targetUnit, c = fetcher(ctx.user, f);
        if (!c) return 'Needs a corgi.';
        return dist(c, f) === 1 || besideTiles(f, null).length ? true : 'No room for a corgi next to it.';
      } },
    canUse: function (ctx) { return corgisOf(ctx.user).length ? true : 'Needs a corgi.'; },
    desc: function (L) {
      return 'The corgi nearest the foe bites it for ' + L.dmg + ' damage and drags it up to ' + plural(L.pull, 'tile') + ' toward you.';
    },
    flavor: 'She threw a stick. The corgi brought back a goblin. Close enough.',
    execute: function (ctx) {
      const u = ctx.user, foe = ctx.targetUnit, L = ctx.L;
      if (!u || !active(foe)) return;
      const c = fetcher(u, foe);
      if (!c) return;
      DD.FX.projectile(u, foe, { kind: 'bone', arc: true });
      // no room beside the foe (canTarget normally prevents it): no bite, and nothing to drag it with
      if (!dashBeside(c, foe, u)) return;
      DD.FX.lunge(c, foe);
      A().damage(u, foe, L.dmg, { tags: ['bite', 'corgi'] });
      if (!active(foe)) return;
      // a corgi stuck on the drag lane walks backwards first (otherwise the foe would be bumped into it)
      const lane = dragTile(foe, u);
      let n = L.pull;
      if (lane && active(c) && c.x === lane.x && c.y === lane.y) n = backUp(c, DD.util.dirTo(foe, u), n);
      if (n > 0) A().pull(u, foe, u, n);
      if (active(foe) && active(c)) dashBeside(c, foe, null);
    },
  });

  DD.registerSkill({
    id: 'ell_zoomies', name: 'Zoomies', owner: 'ellaria', icon: '💨', kind: 'attack', tags: ['aoe', 'push', 'corgi'],
    ap: 2, cooldown: 2,
    levels: [{ dmg: 4, push: 1 }, { dmg: 5, push: 1 }, { dmg: 6, push: 2 }],
    target: { type: 'self' },
    // tiles around the corgis, minus those holding friends (never hit; AutoPlay would read them as friendly fire)
    area: { shape: 'custom', fn: function (ctx) {
      const out = [];
      const u = ctx && ctx.user;
      corgisOf(u).forEach(function (c) {
        DD.util.DIRS.forEach(function (d) {
          const o = G().unitAt(c.x + d.x, c.y + d.y);
          if (!o || G().hostile(u, o)) out.push({ x: c.x + d.x, y: c.y + d.y });
        });
      });
      return out;
    } },
    canUse: function (ctx) {
      const pack = corgisOf(ctx.user);
      if (!pack.length) return 'Needs a corgi.';
      // with nobody to zoom past it would only burn 2 AP
      const near = pack.some(function (c) {
        return DD.util.DIRS.some(function (d) { const f = G().unitAt(c.x + d.x, c.y + d.y); return active(f) && G().hostile(ctx.user, f); });
      });
      return near ? true : 'No foe next to a corgi.';
    },
    desc: function (L) {
      return 'Each foe next to one of your corgis takes ' + L.dmg + ' damage and is pushed ' + plural(L.push, 'tile') + ' away from it.';
    },
    flavor: '3 a.m. energy, weaponized. Point the pack at a pit for best results.',
    execute: function (ctx) {
      const u = ctx.user, L = ctx.L;
      if (!u) return;
      const hit = {};
      corgisOf(u).forEach(function (c, i) {
        if (!active(c)) return;
        DD.FX.particles(c, { kind: 'dust', count: 10, parallel: i > 0 });
        DD.FX.text(c, 'ZOOM!', { color: '#ffe08a', size: 14 });
        DD.util.DIRS.forEach(function (d) {
          if (!active(c)) return;
          const f = G().unitAt(c.x + d.x, c.y + d.y);
          if (!active(f) || !G().hostile(u, f) || hit[f.id]) return;
          hit[f.id] = 1;
          DD.FX.lunge(c, f);
          A().damage(u, f, L.dmg, { tags: ['corgi'] });
          if (active(f)) A().push(u, f, d, L.push);
        });
      });
    },
  });

  DD.registerSkill({
    id: 'ell_switcheroo', name: 'The Ol\' Switcheroo', owner: 'ellaria', icon: '🔄', kind: 'move', tags: ['teleport', 'corgi'],
    ap: 1, cooldown: function (L) { return L.cd; },
    levels: [{ block: 4, cd: 2 }, { block: 6, cd: 2 }, { block: 8, cd: 1 }],
    target: { type: 'unit', range: [1, 40], los: false, filter: 'ally',
      canTarget: function (ctx) { return isCorgiOf(ctx.targetUnit, ctx.user) ? true : 'Only your corgis.'; } },
    canUse: function (ctx) { return corgisOf(ctx.user).length ? true : 'Needs a corgi.'; },
    desc: function (L) { return 'Swap places with one of your corgis anywhere on the field; the corgi gains ' + L.block + ' Block.'; },
    flavor: 'The goblins swear she was right there. The corgi is just happy to be included.',
    execute: function (ctx) {
      const u = ctx.user, c = ctx.targetUnit;
      if (!u || !active(c) || !isCorgiOf(c, u)) return;
      DD.FX.particles(u, { kind: 'leaves', count: 8 });
      if (A().swap(u, c, { force: true, src: u }) && active(c)) A().addBlock(c, ctx.L.block);
    },
  });

  DD.registerSkill({
    id: 'ell_wildshape', name: 'Wild Shape: Absolute Unit', owner: 'ellaria', icon: '🐶', kind: 'buff', tags: ['shapeshift', 'corgi'],
    ap: 2, cooldown: 0, charges: 1,
    levels: [{ chomp: CHOMP[0], turns: 1 }, { chomp: CHOMP[1], turns: 1 }, { chomp: CHOMP[2], turns: 2 }],
    target: { type: 'self' },
    desc: function (L) {
      return 'Once per fight: become an immovable giant corgi until the end of your next ' + (L.turns === 1 ? 'turn' : L.turns + ' turns') +
        '; Thorn Whip becomes Chomp (' + L.chomp + ' damage, knockback 1).';
    },
    flavor: 'She can still cast spells. Nobody knows how. The corgi union has filed a complaint.',
    // the form pays off in Chomps: worth it with a foe within a walk and a bite
    aiScore: function (ctx) {
      const u = ctx.user;
      return u && DD.Combat.foesOf(u).some(function (f) { return dist(f, u) <= (u.mov || 4) + 1; }) ? 6 : 0;
    },
    execute: function (ctx) {
      const u = ctx.user, L = ctx.L;
      if (!active(u)) return;
      DD.FX.particles(u, { kind: 'leaves', count: 22 });
      DD.FX.shake(6, 300);
      DD.FX.sound('corgi');
      A().addStatus(u, 'ell_absolute_unit', { turns: L.turns }, u);
      shapeOn(u, ctx.level || 1);
      DD.FX.text(u, 'ABSOLUTE UNIT!', { color: '#ffd76a', size: 20 });
    },
  });

  // ---- signature ----------------------------------------------------------------------------------------------
  DD.registerSkill({
    id: 'ell_release', name: 'Release the Corgis', owner: 'ellaria', icon: '🐾', kind: 'summon', tags: ['summon', 'aoe', 'taunt', 'corgi'],
    ap: 2, cooldown: 0, hype: 100,
    levels: [{ dmg: 6, n: 6 }],
    target: { type: 'self' }, area: { shape: 'all_foes' },
    // never spend 100 Hype on napping corgis
    canUse: function (ctx) {
      return DD.Combat.foesOf(ctx.user).some(function (f) { return besideTiles(f, null).length > 0; }) ? true : 'No room next to any foe.';
    },
    desc: function (L) {
      return 'A corgi pounces beside each of up to ' + L.n + ' foes (nearest first), biting it for ' + L.dmg + ' damage and Taunting it for 1 turn.';
    },
    flavor: 'Somewhere, a dog park is suddenly very quiet.',
    execute: function (ctx) {
      const u = ctx.user, L = ctx.L;
      if (!active(u)) return;
      DD.FX.banner('RELEASE THE CORGIS!', { sub: 'Every dog has its day', color: '#ffd76a' });
      DD.FX.shake(10, 500);
      DD.FX.sound('corgi');
      const foes = DD.Combat.foesOf(u).sort(function (a, b) { return dist(a, u) - dist(b, u) || byPos(a, b); });
      let n = 0;
      for (let i = 0; i < foes.length && n < L.n; i++) {
        const f = foes[i];
        if (!active(f)) continue;
        const spot = besideTiles(f, u)[0];
        if (!spot) continue;
        // not ready: the pounce is their action (they act from her next turn)
        const c = summonCorgi(u, spot.x, spot.y, {});
        if (!c) continue;
        n++;
        DD.FX.particles(c, { kind: 'dust', count: 8 });
        DD.FX.lunge(c, f);
        A().damage(u, f, L.dmg, { tags: ['bite', 'corgi'] });
        if (active(f) && active(c)) A().addStatus(f, 'taunt', { turns: 1 }, c);
      }
      if (!n) DD.FX.text(u, 'The corgis are... napping.', { color: '#dddddd', size: 14 });
    },
  });

  // ---- corgi summon ---------------------------------------------------------------------------------------------
  DD.registerSkill({
    id: 'ell_corgi_bite', name: 'Bite', owner: 'summon', icon: '🦷', kind: 'attack', tags: ['melee', 'corgi'],
    ap: 1, cooldown: 0,
    levels: [{ dmg: BITE }],
    target: { type: 'unit', range: [1, 1], filter: 'enemy' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to an adjacent foe. Ankles first.'; },
    flavor: 'Herding instinct: mostly ankles.',
    execute: function (ctx) {
      const u = ctx.user, f = ctx.targetUnit;
      if (!u || !active(f)) return;
      DD.FX.lunge(u, f);
      A().damage(u, f, ctx.L.dmg, { tags: ['bite'] });
    },
  });

  DD.registerSkill({
    id: 'ell_corgi_bark', name: 'Bark Bark Bark', owner: 'summon', icon: '📢', kind: 'utility', tags: ['taunt', 'aoe', 'corgi'],
    ap: 1, cooldown: 2,
    levels: [{ r: 1 }],
    target: { type: 'self' },
    area: { shape: 'circle', size: function (L) { return L.r; } },
    desc: function () { return 'Taunt every adjacent foe for 1 turn: on its turn it must attack this corgi if it can.'; },
    flavor: 'Look at me. LOOK AT ME. I AM SMALL AND LOUD.',
    execute: function (ctx) {
      const u = ctx.user;
      if (!active(u)) return;
      DD.FX.sound('corgi');
      DD.FX.text(u, 'BORK!', { color: '#ffe08a', size: 18 });
      ctx.foes.forEach(function (f) { if (active(f)) A().addStatus(f, 'taunt', { turns: 1 }, u); });
    },
  });

  DD.registerSummon({
    id: CORGI, name: 'Corgi', hp: CORGI_BASE_HP, mov: 4, ap: 2, armor: 0, tags: ['beast', 'corgi'], flags: {},
    names: NAMES,
    sprite: CORGI_SPRITE,
    skills: ['ell_corgi_bite', 'ell_corgi_bark'],
    hooks: {
      // corgis summoned without summonCorgi (e.g. by other content via DD.Act.summon) still get a name of their own
      onCombatStart: function (unit) {
        const s = S();
        if (!s || !unit) return;
        if (s.units.some(function (o) { return o !== unit && !o.dead && o.defId === CORGI && o.name === unit.name; })) unit.name = freshName();
      },
      // The Good Stick: Ellaria's corgis bite harder for it
      modifyOutgoingDamage: function (d) {
        if (d.cause === 'skill' && hasItem(ownerOf(d.source), STICK)) d.flat += 2;
      },
    },
    barks: {
      spawn: ['Woof!', 'Bork!', '*happy wiggle*', '*sploot*', 'Arf! Arf!'],
      attack: ['GRRR!', 'Bork!', '*nom*'],
      hurt: ['Yip!', '*indignant boof*'],
      death: ['*sad boof*', '*whimper*'],
    },
    desc: 'A low-riding herding dog of immense dignity: 70% fluff, 30% loaf, 100% willing to die for Ellaria. HP 8 + Ellaria\'s level, Bite 3, Bark taunts adjacent foes.',
  });

  // ---- passive ------------------------------------------------------------------------------------------------
  /**
   * Starting corgi: within 2 tiles of Ellaria, standing guard on her foe-facing side, inside the deploy zone when
   * there is one (so it can be redeployed with the party).
   */
  function startingCorgi(unit) {
    const s = S();
    if (!s || !active(unit)) return;
    const zone = s.deploy && s.deploy.active ? s.deploy.tiles : [];
    const inZone = function (p) { return zone.some(function (z) { return z.x === p.x && z.y === p.y; }); };
    const foes = DD.Combat.foesOf(unit);
    const near = function (p) { let d = 99; foes.forEach(function (f) { d = Math.min(d, dist(f, p)); }); return d; };
    const spots = G().emptyTilesNear(unit.x, unit.y, 2).filter(function (p) {
      return (p.x !== unit.x || p.y !== unit.y) && !G().isDrop(p.x, p.y) && !G().hazardAt(p.x, p.y, null);
    }).sort(function (a, b) {
      return (inZone(b) ? 1 : 0) - (inZone(a) ? 1 : 0) || near(a) - near(b) || dist(a, unit) - dist(b, unit) || byPos(a, b);
    });
    if (spots.length) summonCorgi(unit, spots[0].x, spots[0].y, { noFx: true, ready: true });
  }

  /** AVENGE <NAME>!: the whole party (Ellaria, allies, corgis) is Inspired until the end of their next turn. */
  function avenge(unit, dead) {
    A().log(dead.name + ' has crossed the Rainbow Bridge. The party is Inspired!', 'hero');
    A().bark(unit, 'AVENGE ' + String(dead.name).toUpperCase() + '!');
    DD.FX.particles(dead, { kind: 'hearts', count: 12 });
    DD.Combat.party().forEach(function (f) { if (active(f)) A().addStatus(f, 'inspired', { turns: 1 }, unit); });
  }

  // ---- hero ---------------------------------------------------------------------------------------------------
  DD.registerHero({
    id: 'ellaria', name: 'Ellaria', epithet: 'the Corgi Whisperer', race: 'Elf', cls: 'Druid',
    role: 'Corgi summoner / healer / control', complexity: 2,
    blurb: 'A serene elf druid who believes every problem can be solved with corgis, and has yet to be proven wrong. ' +
      'She heals the party, tangles the enemy in brambles and fields a pack of loyal loaves who will happily die for her. Keep them away from the Mayor.',
    color: '#7cc35a', unlock: null,
    stats: { hp: 26, ap: 3, mov: 4, armor: 0, init: 1 }, growth: { hp: 4 }, flags: {},
    sprite: ELLARIA_SPRITE,
    basic: 'ell_thorn_whip', signature: 'ell_release',
    passive: {
      name: 'Pack Leader',
      desc: 'Starts each fight with a corgi. While she stands, each fallen corgi Inspires the party until the end of their next turn. AVENGE BISCUIT!',
      hooks: {
        onCombatStart: function (unit) { startingCorgi(unit); },
        onAllyDeath: function (unit, dead) { if (isCorgiOf(dead, unit)) avenge(unit, dead); },
        onTurnStart: function (unit) { syncShape(unit); },
        onTurnEnd: function (unit) { syncShape(unit); },
        onSkillUsed: function (ctx) { if (ctx && ctx.user) syncShape(ctx.user); },
        onDowned: function (unit) { shapeOff(unit); },
        onCombatEnd: function (unit) { shapeOff(unit); },
      },
    },
    startingSkills: ['ell_summon_corgi', 'ell_spring'],
    skillPool: ['ell_summon_corgi', 'ell_spring', 'ell_roots', 'ell_barkskin', 'ell_good_boy', 'ell_fetch', 'ell_zoomies',
      'ell_switcheroo', 'ell_wildshape'],
    summons: [CORGI],
    barks: {
      select: ['The corgis and I are listening.', 'Yes? Biscuit was just asking the same thing.', 'Nature provides. Mostly corgis.',
        'Shh. The grass is telling me a secret.', 'Did someone say walkies?'],
      start: ['Corgis, assemble! Gently. GENTLY.', 'Roll for initiative! Biscuit rolled a 20. With his nose.',
        'Nature finds a way. The way is corgis.', 'Everyone stay calm. And nobody pet the goblins.', 'Who\'s ready for walkies? Violent walkies?'],
      move: ['Walkies!', 'Coming, little ones. Mind the paws.', 'The moss says this way.', 'Heel. No, not you, Marwyn.', 'Pardon me, mushrooms.'],
      kill: ['Returned to the earth. With love.', 'You\'re compost now. Beautiful compost.', 'Good boys. GOOD boys.',
        'Nature is healing. You are not.', 'That one was a bad dog.'],
      hurt: ['Ow! Rude!', 'The corgis saw that. They will remember.', 'Not the flower crown!', 'I\'m composting that grudge.'],
      lowhp: ['I may need to lie down in a meadow.', 'Biscuit... tell the others I loved them...', 'Someone heal me! Or pet me! Either!',
        'Wilting... a bit... over here.'],
      downed: ['Tell the corgis... they were all good boys...', 'Returning to the earth... briefly...', 'Feed the dogs... twice a day...',
        'Who\'s a good... ugh.'],
      revive: ['Photosynthesis! I\'m back!', 'The corgis licked me back to life.', 'Nature always returns. Like a boomerang.',
        'Back on my paws. Feet. Paws.'],
      ally_down: ['No! Corgis, protect them!', 'Someone get them a treat! Or a healer!', 'That\'s it. Nobody gets belly rubs.',
        'Josiah, do the thing with the leeches!', 'Captain Loaf, sit on them until they feel better!'],
      levelup: ['I\'ve learned the true name of every corgi.', 'Stronger roots, fluffier friends.', 'The pack grows!',
        'My power grows. So does the dog hair.'],
      victory: ['Everyone gets a treat! Even you, Slate.', 'Walkies are over. Nap time.', 'Peace, love and corgis.',
        'Good fight. Now, who wants belly rubs?', 'The earth thanks you. The corgis thank you more.'],
      idle: ['Waffles, no. We do not eat the Mayor.', 'Zarathor, the corgis are not "bling".', 'Professor Marbles, they chase you out of love.',
        'Betty, those are the corgis\' treats. Put them down.', 'Basanos, they just want to sniff you. You know why.',
        'Marwyn, they can\'t all fit on your lap. Stop trying.'],
      signature: ['RELEASE THE CORGIS!', 'Every dog has its day. Today is that day!', 'THE PACK IS UPON YOU!',
        'Cry havoc and let slip the corgis of war!', 'Loaves! Out of the oven!'],
    },
  });

  // ---- hero items -------------------------------------------------------------------------------------------------
  DD.registerItem({
    id: STICK, name: 'The Good Stick', slot: 'weapon', rarity: 'rare', icon: '🪵', hero: 'ellaria',
    stats: { dmg: 0.1 },
    desc: '+10% damage. Corgi attacks deal +2 damage: Bite, Fetch!, Zoomies and Release the Corgis.',
    flavor: 'Thrown 4,000 times. Returned 4,000 times. Slightly damp.',
    hooks: {
      // corgi attacks Ellaria orders (Fetch!, Zoomies, Release the Corgis) are her damage, tagged 'corgi'; the
      // corgis' own Bite gets its +2 from the ell_corgi summon hook
      modifyOutgoingDamage: function (d) {
        if (d.cause === 'skill' && (d.tags || []).indexOf('corgi') >= 0) d.flat += 2;
      },
    },
  });

  DD.registerItem({
    id: ROBE, name: 'Robe of Perpetual Shedding', slot: 'armor', rarity: 'common', icon: '🥼', hero: 'ellaria',
    stats: { hp: 4 },
    desc: '+4 max HP. Foes that hit you in melee are Dazzled until the end of their next turn (corgi fur allergy).',
    flavor: 'Woven from 100% reclaimed corgi fluff. Achoo.',
    hooks: {
      onTakeDamage: function (d) {
        const src = d.source, me = d.target;
        if (!src || !me || src === me || !active(src) || !(d.amount > 0) || dist(src, me) !== 1) return;
        if ((d.cause !== 'skill' && d.cause !== 'other') || (d.tags || []).indexOf('thorns') >= 0) return;
        if (!G().hostile(me, src)) return;
        DD.FX.text(src, 'Achoo!', { color: '#fff3a3', size: 14 });
        A().addStatus(src, 'dazzled', { turns: 1 }, me);
      },
    },
  });

  DD.registerItem({
    id: CROWN, name: 'Flower Crown of the Corgi Queen', slot: 'trinket', rarity: 'legendary', icon: '🌸', hero: 'ellaria',
    stats: { heal: 0.15 },
    desc: '+15% healing. Lost a corgi? One new corgi bounds in beside you at the start of your next turn (pack of 3).',
    flavor: 'Every daisy is a good boy who crossed the Rainbow Bridge. And then came back. Repeatedly.',
    hooks: {
      onAllyDeath: function (unit, dead) {
        if (isCorgiOf(dead, unit)) { unit.data = unit.data || {}; unit.data.ellCrownPending = true; }
      },
      onTurnStart: function (unit) {
        if (!unit.data || !unit.data.ellCrownPending || !active(unit)) return;
        unit.data.ellCrownPending = false;
        if (corgisOf(unit).length >= PACK) return;
        const spot = besideTiles(unit, null)[0] || G().emptyTilesNear(unit.x, unit.y, 2).filter(function (p) { return safeFree(p.x, p.y); })[0];
        if (!spot) return;
        const c = summonCorgi(unit, spot.x, spot.y, { ready: true });
        if (c) DD.FX.text(c, 'I\'m back!', { color: '#ffd76a', size: 14 });
      },
    },
  });

  // Public helpers for tests / other content (read-only queries)
  DD.Ellaria = { corgisOf: corgisOf, packMax: function () { return PACK; }, corgiHp: corgiHp, CORGI: CORGI, BRAMBLE: BRAMBLE,
    GIANT_SPRITE: GIANT_CORGI_SPRITE };
})();
