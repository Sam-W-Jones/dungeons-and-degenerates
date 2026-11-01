/* Dungeons and Degenerates — js/data/heroes/marbles.js
 * Professor Marbles, the Forgetful Fist: an ancient rabbitfolk monk. Mobile melee skirmisher / control. v2 kit (DESIGN
 * §6 Simplicity): one verb per skill, the combos carry the power — Vulnerable marbles, a Stun, a Taunt, a sleepy
 * Lecture, a push, a pull and an Empowered ally. Passive "Absent-Minded Mastery": at the start of each of his turns he
 * remembers one random ready socketed skill, whose first use that turn costs 0 AP. Registers the hero, a basic attack,
 * a signature, a 10-skill pool, the Loose Marbles surface (mar_marbles: enemies who slip are Vulnerable), the
 * mar_remembered status and three hero items. Public helpers: DD.Marbles.slip / DD.Marbles.scatter.
 */
(function () {
  'use strict';
  const DD = window.DD;

  // ---- helpers ---------------------------------------------------------------------------------------
  function A() { return DD.Act; }
  function G() { return DD.Grid; }
  function S() { return DD.Combat && DD.Combat.state; }
  function active(u) { return !!u && !u.dead && !u.downed; }
  function has(u, id) { return DD.Act.hasStatus(u, id); }
  function hostile(a, b) { return DD.Grid.hostile(a, b); }
  function hasItem(u, id) { return !!u && Array.isArray(u.items) && u.items.indexOf(id) >= 0; }
  function lv(a, b, c) { return [a, b, c]; }
  function tiles(n) { return n + ' tile' + (n === 1 ? '' : 's'); }
  function skillName(id) { const d = DD.getSkill(id); return d ? d.name : id; }
  function skill(def) { def.owner = 'marbles'; return DD.registerSkill(def); }
  function melee(ctx, to) { const p = to || ctx.targetUnit || ctx.target; if (p) DD.FX.lunge(ctx.user, p); }
  function byDist(from) { return function (a, b) { return G().dist(from, a) - G().dist(from, b); }; }
  /** Active foes next to the unit, in N/E/S/W order (deterministic). */
  function adjacentFoes(user) {
    const out = [];
    DD.util.DIRS.forEach(function (d) {
      const o = G().unitAt(user.x + d.x, user.y + d.y);
      if (active(o) && hostile(user, o)) out.push(o);
    });
    return out;
  }

  // ---- Loose Marbles (surface) ---------------------------------------------------------------------------
  const MARBLE_COLS = ['#4fb3ff', '#ff5f6d', '#6fdc4a', '#ffd23f', '#c48aff', '#ff9f2a', '#4fe0d0'];
  const layoutCache = new Map();
  /** Render-only: where the marbles sit on a tile (stable per tile, never the logic RNG). */
  function marbleLayout(x, y) {
    const k = x + ',' + y;
    let m = layoutCache.get(k);
    if (m) return m;
    let s = DD.util.hash('mar:' + k) || 1;
    const r = function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    m = [];
    for (let i = 0; i < 7; i++) {
      m.push({ u: r() * 0.76 - 0.38, v: r() * 0.76 - 0.38, c: MARBLE_COLS[Math.floor(r() * MARBLE_COLS.length)], ph: r() * 6.28, s: 0.85 + r() * 0.35 });
    }
    m.sort(function (a, b) { return (a.u + a.v) - (b.u + b.v); });
    if (layoutCache.size > 600) layoutCache.clear();
    layoutCache.set(k, m);
    return m;
  }

  /**
   * A grounded enemy on Loose Marbles slips: Vulnerable for its next turn. turns: 1 covers that turn both when it is
   * pushed in or scattered on during a hero's turn and when it walks in on its own turn (a status gained during its own
   * turn skips that turn's tick, ARCHITECTURE §6.5). Heroes, hero summons and flyers never slip.
   */
  function slip(unit, tile) {
    if (!active(unit) || unit.side !== 'enemy' || G().isFlying(unit)) return false;
    if (!tile || !tile.surface || tile.surface.id !== 'mar_marbles') return false;
    const data = tile.surface.data || {};
    const src = data.src && DD.Combat.byId ? DD.Combat.byId(data.src) : null;
    DD.FX.text(unit, 'Slip!', { color: '#9fd8ff', size: 17 });
    DD.FX.particles(unit, { kind: 'glitter', count: 8, color: '#bfe6ff' });
    A().log(unit.name + ' slips on a marble and goes down in a heap.', 'status');
    A().addStatus(unit, 'vulnerable', { turns: 1 }, src);
    return true;
  }

  /**
   * Put Loose Marbles on tiles for `turns` rounds (default 3), never over another surface (marbles already there keep
   * the longer duration); src gets the credit. opts.slipNow: enemies already standing there slip at once.
   * Returns the tiles that got marbles.
   */
  function scatter(src, list, opts) {
    opts = opts || {};
    const turns = opts.turns || 3;
    const placed = [];
    (list || []).forEach(function (p) {
      const tl = G().tile(p.x, p.y);
      if (!tl) return;
      const sf = tl.surface;
      if (sf && sf.id === 'mar_marbles') {
        if (sf.turns >= 0 && sf.turns < turns) sf.turns = turns;
        sf.data = sf.data || {};
        if (src) sf.data.src = src.id;
        A().touch();
        placed.push(tl);
        return;
      }
      if (sf || !A().setSurface(p.x, p.y, 'mar_marbles', turns)) return;
      tl.surface.data = { src: src ? src.id : null };
      placed.push(tl);
    });
    if (opts.slipNow) placed.forEach(function (tl) { const u = G().unitAt(tl.x, tl.y); if (u) slip(u, tl); });
    return placed;
  }
  DD.Marbles = { slip: slip, scatter: scatter };

  DD.registerSurface({
    id: 'mar_marbles', name: 'Loose Marbles', color: 'rgba(150,205,255,0.35)', turns: 3,
    desc: 'Grounded enemies that walk or are pushed onto it slip: Vulnerable for their next turn. Heroes never slip ' +
      '(they know where he dropped them. Mostly).',
    onEnter: function (unit, tile) { slip(unit, tile); },
    draw: function (g, sf, t) {
      const tl = g.tile || { x: 0, y: 0 };
      const c = g.ctx;
      g.diamond(0, 0, 29, 14.5, 'rgba(170,215,255,0.18)'); // the trap's footprint reads at zoom 1, not only the marbles
      const lw = g.lw;
      g.lw = 0.9;
      const list = marbleLayout(tl.x, tl.y);
      for (let i = 0; i < list.length; i++) {
        const m = list[i], px = (m.u - m.v) * 32, py = (m.u + m.v) * 16, r = 2.5 * m.s;
        g.ellipse(px + 0.7, py + 1.5, r * 1.05, r * 0.45, 'rgba(0,0,0,0.32)', null);
        g.circle(px, py, r, m.c, 'rgba(24,18,30,0.9)');
        g.arc(px, py, r * 0.55, m.ph, m.ph + 2.2, 'rgba(255,255,255,0.55)', 0.7);
        g.circle(px - r * 0.35, py - r * 0.4, r * 0.3, 'rgba(255,255,255,0.92)', null);
        const tw = Math.sin((t || 0) * 2.6 + m.ph * 3);
        if (tw > 0.93) {
          c.save(); c.globalAlpha *= (tw - 0.93) / 0.07;
          g.line(px - r * 0.35 - 1.6, py - r * 0.4, px - r * 0.35 + 1.6, py - r * 0.4, '#ffffff', 0.6);
          g.line(px - r * 0.35, py - r * 0.4 - 1.6, px - r * 0.35, py - r * 0.4 + 1.6, '#ffffff', 0.6);
          c.restore();
        }
      }
      g.lw = lw;
    },
  });

  // ---- Absent-Minded Mastery (status + roll) --------------------------------------------------------------
  /** Will this socketed skill be usable this turn (cooldown after this turn's tick, charges left)? */
  function readyThisTurn(sl) {
    const def = DD.getSkill(sl.id);
    if (!def) return false;
    if (def.charges > 0 && (sl.uses || 0) >= def.charges) return false;
    // onTurnStart runs before the turn's cooldown tick: count the tick that is about to happen
    const cd = sl.cd > 0 ? (sl.fresh ? sl.cd : sl.cd - 1) : 0;
    return cd <= 0;
  }
  function freeIds(st) {
    const d = (st && st.data) || {};
    const used = d.used || {};
    return (Array.isArray(d.ids) ? d.ids : []).filter(function (id) { return !used[id]; });
  }

  DD.registerStatus({
    id: 'mar_remembered', name: 'Remembered!', icon: '💡', color: '#ffe680', type: 'buff', stacking: 'refresh', maxStacks: 1,
    decay: 'turnEnd', defaultTurns: 1, skipFresh: false,
    desc: function (st) {
      const ids = freeIds(st);
      return ids.length ? 'Suddenly remembers ' + ids.map(skillName).join(' and ') + ': the first use this turn costs 0 AP.' :
        'Remembers something important. It will come back to him.';
    },
    hooks: {
      modifyCost: function (c, st) { if (c && c.skill && freeIds(st).indexOf(c.skill.id) >= 0) c.ap = 0; },
      onSkillUsed: function (ctx, st) {
        if (!ctx || !ctx.skill || !st || freeIds(st).indexOf(ctx.skill.id) < 0) return;
        st.data.used = st.data.used || {};
        st.data.used[ctx.skill.id] = true;
        if (!freeIds(st).length) A().removeStatus(ctx.user, 'mar_remembered', { silent: true });
      },
      // this turn only: leave quietly before the engine's decay pops a "−Remembered!" text every turn end
      onTurnEnd: function (unit) { A().removeStatus(unit, 'mar_remembered', { silent: true }); },
    },
  });

  const REMEMBER_LINES = ['Oh! {skill}! I remember that one!', 'Wait, wait... {skill}! Ha!', 'It\'s all coming back to me. {skill}!',
    'My old master taught me {skill}. Or was it my barber?', 'Now how did {skill} go? Ah. Like THIS.'];

  /** His turn start: remember 1 ready socketed skill (2 with the Pill Organizer); its first use this turn is free. */
  function remember(unit) {
    const s = S();
    if (!s || !active(unit) || unit.kind !== 'hero') return;
    if (DD.Combat.isTurnOf && !DD.Combat.isTurnOf(unit)) return;
    A().removeStatus(unit, 'mar_remembered', { silent: true });
    if (DD.Combat.isStunned(unit) || has(unit, 'sheep')) return;
    const ready = (unit.skills || []).filter(readyThisTurn);
    if (!ready.length) return;
    const picks = s.rng.sample(ready, Math.min(hasItem(unit, 'mar_pills') ? 2 : 1, ready.length));
    const ids = picks.map(function (sl) { return sl.id; });
    const st = A().addStatus(unit, 'mar_remembered', { turns: 1, silent: true }, unit);
    if (!st) return;
    st.data = { ids: ids, used: {} };
    const names = ids.map(skillName).join(' + ');
    DD.FX.text(unit, '💡 ' + names + '!', { color: '#ffe680', size: 15 });
    A().log('💡 ' + unit.name + ' suddenly remembers ' + names + '! (first use this turn costs 0 AP)', 'hero');
    if (DD.rng.next() < 0.3) A().bark(unit, DD.util.line(REMEMBER_LINES, DD.rng).replace('{skill}', skillName(ids[0])));
  }

  // ---- FX painters (render-only) -------------------------------------------------------------------------
  function drawCarrot(c, x, y, p, view) {
    const z = (view && view.zoom) || 1;
    c.save();
    c.translate(x, y);
    c.rotate(p * 10);
    c.beginPath(); c.moveTo(-4.5 * z, -2.4 * z); c.lineTo(5.5 * z, 0); c.lineTo(-4.5 * z, 2.4 * z); c.closePath();
    c.fillStyle = '#ff8c1a'; c.fill(); c.lineWidth = 1.1 * z; c.strokeStyle = '#6b3006'; c.stroke();
    c.strokeStyle = '#c4610a'; c.lineWidth = 0.7 * z;
    c.beginPath(); c.moveTo(-1.5 * z, -1.4 * z); c.lineTo(-0.4 * z, -0.7 * z); c.moveTo(0.8 * z, 0.9 * z); c.lineTo(2 * z, 0.4 * z); c.stroke();
    c.fillStyle = '#4caf3a';
    for (let i = -1; i <= 1; i++) {
      c.beginPath(); c.ellipse(-6 * z, i * 1.4 * z, 2.4 * z, 0.9 * z, i * 0.5, 0, Math.PI * 2); c.fill();
    }
    c.restore();
  }
  function drawMarbleVolley(c, x, y, p, view) {
    const z = (view && view.zoom) || 1;
    for (let i = 0; i < 3; i++) {
      const a = p * 13 + i * 2.1;
      const mx = x + Math.cos(a) * 3.4 * z, my = y + Math.sin(a) * 2.2 * z;
      c.beginPath(); c.arc(mx, my, 2.3 * z, 0, Math.PI * 2);
      c.fillStyle = MARBLE_COLS[i * 2 % MARBLE_COLS.length]; c.fill();
      c.lineWidth = 0.8 * z; c.strokeStyle = '#1a1420'; c.stroke();
      c.beginPath(); c.arc(mx - 0.7 * z, my - 0.8 * z, 0.7 * z, 0, Math.PI * 2); c.fillStyle = '#ffffff'; c.fill();
    }
  }

  // ---- basic & signature ---------------------------------------------------------------------------------
  skill({ id: 'mar_jab', name: 'Doddering Jab', icon: '👊', kind: 'attack', tags: ['melee'], ap: 1,
    levels: [{ dmg: 5 }], target: { type: 'unit', range: [1, 1], filter: 'enemy' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to an adjacent foe.'; },
    flavor: 'He wobbles. He totters. He hits the exact same nerve every single time.',
    execute: function (ctx) {
      const u = ctx.targetUnit;
      if (!active(u)) return;
      melee(ctx);
      A().damage(ctx.user, u, ctx.L.dmg);
    } });

  /** Render-only: the tile next to a foe he blurs to (the walkable neighbour nearest to where he is drawn). */
  function blurSpot(foe, from) {
    let best = null, bd = Infinity;
    DD.util.DIRS.forEach(function (d) {
      const x = foe.x + d.x, y = foe.y + d.y;
      if (!G().inBounds(x, y) || !G().isWalkable(x, y)) return;
      const dd = Math.abs(x - from.x) + Math.abs(y - from.y);
      if (dd < bd) { bd = dd; best = { x: x, y: y }; }
    });
    return best || from;
  }

  skill({ id: 'mar_signature', name: 'Forgot I Was Retired', icon: '🐇', kind: 'attack', tags: ['melee', 'aoe', 'stun'], ap: 2, hype: 100,
    levels: [{ dmg: 8, r: 3 }],
    target: { type: 'self' }, area: { shape: 'circle', size: function (L) { return L.r; } },
    desc: function (L) { return 'Every foe within ' + L.r + ' tiles takes ' + L.dmg + ' damage and is Stunned (it loses its next turn).'; },
    flavor: 'Fifty years of kung fu. Six seconds of short-term memory. He is back in his chair before the tea cools.',
    execute: function (ctx) {
      const user = ctx.user, L = ctx.L;
      if (!active(user)) return;
      DD.FX.banner('FORGOT I WAS RETIRED!', { sub: 'Professor Marbles remembers everything. Briefly.', color: '#ffd76a' });
      DD.FX.flash('#fff3c4', 220);
      DD.FX.shake(7, 380);
      DD.FX.particles(user, { kind: 'dust', count: 16 });
      const home = { x: user.x, y: user.y };
      let drawn = home;
      // he never really moves: the blur visits each foe (nearest first) and hops back to his chair
      ctx.foes.slice().sort(byDist(home)).forEach(function (f) {
        if (!active(user) || !active(f)) return;
        const spot = blurSpot(f, drawn);
        DD.FX.jump(user, drawn, spot, { ms: 140 });
        drawn = spot;
        DD.FX.lunge(user, f, { ms: 90 });
        DD.FX.particles(f, { kind: 'sparks', count: 7, color: '#ffe9a8' });
        A().damage(user, f, L.dmg);
        if (active(f)) A().addStatus(f, 'stun', { turns: 1 }, user);
      });
      if (drawn !== home) DD.FX.jump(user, drawn, home, { ms: 160 });
    } });

  // ---- skill pool ----------------------------------------------------------------------------------------
  skill({ id: 'mar_whack', name: 'Walking Stick Whack', icon: '🏑', kind: 'attack', tags: ['melee', 'push'], ap: 1, cooldown: 1,
    levels: lv({ dmg: 5, push: 2 }, { dmg: 6, push: 2 }, { dmg: 7, push: 3 }),
    target: { type: 'unit', range: [1, 1], filter: 'enemy' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to an adjacent foe and push it ' + tiles(L.push) + '.'; },
    flavor: 'Forty years of walking-stick kata. One tasteful thwack. Into the pit, ideally.',
    execute: function (ctx) {
      const user = ctx.user, u = ctx.targetUnit;
      if (!active(u)) return;
      melee(ctx);
      DD.FX.text(u, 'WHACK!', { color: '#ffe08a', size: 16 });
      A().damage(user, u, ctx.L.dmg);
      if (active(u)) A().knockback(user, u, ctx.L.push);
    } });

  skill({ id: 'mar_scatter', name: 'Marble Scatter', icon: '🔮', kind: 'utility', tags: ['ranged', 'aoe', 'surface', 'vulnerable'], ap: 1, cooldown: 2,
    levels: lv({ turns: 3, shape: 'circle' }, { turns: 3, shape: 'square' }, { turns: 4, shape: 'square' }),
    target: { type: 'tile', range: [0, 4], filter: 'any', los: true },
    area: { shape: 'custom', fn: function (ctx) {
      if (!ctx || !ctx.target) return [];
      return G().shape(ctx.L && ctx.L.shape === 'square' ? 'square' : 'circle', ctx.target, null, 1);
    } },
    desc: function (L) {
      return 'Scatter marbles on ' + (L.shape === 'square' ? 'a 3x3 square' : 'a 5-tile plus') + ' for ' + L.turns +
        ' rounds (other surfaces stay). Foes there or moving in slip: Vulnerable for their next turn.';
    },
    flavor: 'He has not lost his marbles. He has deployed them.',
    aiScore: function (ctx) { return ctx.foes.length * 2; },
    execute: function (ctx) {
      const user = ctx.user;
      if (ctx.target) DD.FX.projectile(user, ctx.target, { kind: 'custom', arc: true, draw: drawMarbleVolley, sound: 'arrow' });
      const placed = scatter(user, ctx.tiles, { turns: ctx.L.turns, slipNow: true });
      placed.forEach(function (tl, i) { DD.FX.tile(tl.x, tl.y, 'glow', { color: '#9fd8ff', parallel: i > 0 }); });
      if (placed.length) {
        DD.FX.sound('click');
        A().log(user.name + ' scatters marbles across ' + tiles(placed.length) + '. "Now where did I put those?"', 'hero');
      }
    } });

  skill({ id: 'mar_punch', name: 'Rabbit Punch', icon: '🥊', kind: 'attack', tags: ['melee', 'stun'], ap: 2,
    cooldown: function (L) { return L.cd; },
    levels: lv({ dmg: 6, cd: 3 }, { dmg: 8, cd: 3 }, { dmg: 10, cd: 2 }),
    target: { type: 'unit', range: [1, 1], filter: 'enemy' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to an adjacent foe and Stun it (it loses its next turn).'; },
    flavor: 'Illegal in boxing. Mandatory in kung fu. Delivered with alarming ear-assisted torque.',
    execute: function (ctx) {
      const u = ctx.targetUnit;
      if (!active(u)) return;
      melee(ctx);
      DD.FX.text(u, 'BONK!', { color: '#ffe14d', size: 18 });
      A().damage(ctx.user, u, ctx.L.dmg);
      if (active(u)) A().addStatus(u, 'stun', { turns: 1 }, ctx.user);
    } });

  skill({ id: 'mar_flurry', name: 'Flurry of Paws', icon: '🐾', kind: 'attack', tags: ['melee'], ap: 2, cooldown: 1,
    // +1 per strike per level: armor bites every strike, so every level still beats the one before it against armor 2
    levels: lv({ dmg: 9, hit: 3, hits: 3 }, { dmg: 12, hit: 4, hits: 3 }, { dmg: 15, hit: 5, hits: 3 }),
    target: { type: 'unit', range: [1, 1], filter: 'enemy' },
    desc: function (L) { return 'Strike an adjacent foe ' + L.hits + ' times for ' + L.hit + ' damage each (' + L.dmg + ' total).'; },
    flavor: 'Paws so fast they leave afterimages. Also crumbs.',
    execute: function (ctx) {
      const user = ctx.user, u = ctx.targetUnit, L = ctx.L;
      for (let i = 0; i < L.hits; i++) {
        if (!active(user) || !active(u)) break;
        DD.FX.lunge(user, u, { ms: 85 });
        if (i === 0) DD.FX.particles(u, { kind: 'dust', count: 6 });
        A().damage(user, u, L.hit);
      }
    } });

  skill({ id: 'mar_backinmyday', name: 'Back In My Day...', icon: '👴', kind: 'buff', tags: ['defend', 'taunt'], ap: 1, cooldown: 2,
    levels: lv({ block: 4, r: 1 }, { block: 6, r: 1 }, { block: 8, r: 2 }),
    target: { type: 'self' }, area: { shape: 'circle', size: function (L) { return L.r; } },
    desc: function (L) {
      return 'Gain ' + L.block + ' Block and Taunt ' + (L.r > 1 ? 'foes within ' + L.r + ' tiles' : 'adjacent foes') +
        ': on their next turn they must attack him.';
    },
    flavor: '"...and we walked uphill both ways, in the snow, fighting a dragon, and we LIKED it."',
    execute: function (ctx) {
      const user = ctx.user;
      if (!active(user)) return;
      DD.FX.text(user, '"Back in MY day..."', { color: '#ffe9a8', size: 14 });
      DD.FX.particles(user, { kind: 'notes', count: 6, color: '#ffe9a8' });
      A().addBlock(user, ctx.L.block);
      ctx.foes.forEach(function (f) { if (active(f)) A().addStatus(f, 'taunt', { turns: 1 }, user); });
    } });

  skill({ id: 'mar_lecture', name: 'Lecture', icon: '📚', kind: 'spell', tags: ['aoe', 'sleep'],
    ap: function (L) { return L.ap; }, cooldown: 3,
    levels: lv({ r: 1, turns: 2, ap: 3 }, { r: 2, turns: 2, ap: 3 }, { r: 2, turns: 2, ap: 2 }),
    target: { type: 'self' }, area: { shape: 'circle', size: function (L) { return L.r; } },
    desc: function (L) {
      return (L.r > 1 ? 'Foes within ' + L.r + ' tiles' : 'Adjacent foes') + ' fall Asleep for ' + L.turns + ' turns (damage wakes them).';
    },
    flavor: 'A history of the walking stick, part 1 of 9. The DM ruled it "a sleep spell with footnotes".',
    execute: function (ctx) {
      const user = ctx.user, L = ctx.L;
      if (!active(user)) return;
      DD.FX.text(user, '📚 "Now, in the year 412..."', { color: '#dfe8ff', size: 14 });
      DD.FX.particles(user, { kind: 'notes', count: 8, color: '#bcd0ff' });
      let n = 0;
      ctx.foes.forEach(function (f) {
        if (active(f) && A().addStatus(f, 'sleep', { turns: L.turns }, user)) n++;
      });
      if (n) A().log(n + (n === 1 ? ' foe nods' : ' foes nod') + ' off during ' + user.name + '\'s lecture.', 'status');
    } });

  skill({ id: 'mar_carrot', name: 'Carrot Toss', icon: '🥕', kind: 'heal', tags: ['heal', 'ranged'], ap: 1, cooldown: 0, charges: 3,
    levels: lv({ heal: 6 }, { heal: 8 }, { heal: 10 }),
    target: { type: 'unit', range: [0, 4], filter: 'allyOrSelf', los: true },
    desc: function (L) { return 'Heal an ally within 4 tiles (or himself) for ' + L.heal + ' HP. He packs 3 carrots per fight.'; },
    flavor: 'Good for the eyes. Also the ribs, the morale and, once, a dragon.',
    execute: function (ctx) {
      const user = ctx.user, u = ctx.targetUnit;
      if (!active(u)) return;
      if (u !== user) DD.FX.projectile(user, u, { kind: 'custom', arc: true, draw: drawCarrot, sound: 'arrow' });
      else DD.FX.text(user, '*munch*', { color: '#ffb36b', size: 14 });
      A().heal(user, u, ctx.L.heal);
    } });

  skill({ id: 'mar_leap', name: 'Hare-Brained Leap', icon: '🐰', kind: 'move', tags: ['move', 'jump'], ap: 1, cooldown: 2,
    levels: lv({ r: 3 }, { r: 4 }, { r: 4, dmg: 3 }),
    target: { type: 'tile', range: function (L) { return [1, L.r]; }, filter: 'empty', los: false },
    area: { shape: 'custom', fn: function (ctx) {
      if (!ctx || !ctx.target) return [];
      return ctx.L && ctx.L.dmg ? G().shape('circle', ctx.target, null, 1) : [{ x: ctx.target.x, y: ctx.target.y }];
    } },
    desc: function (L) {
      return 'Leap to an empty tile up to ' + L.r + ' tiles away, over anything.' +
        (L.dmg ? ' He lands with a THUMP: ' + L.dmg + ' damage to adjacent foes.' : '');
    },
    flavor: 'His hips filed for retirement decades ago. His legs never got the memo.',
    execute: function (ctx) {
      const user = ctx.user, p = ctx.target, L = ctx.L;
      if (!active(user) || !p || !G().isFree(p.x, p.y, user) || G().isDrop(p.x, p.y)) return;
      DD.FX.jump(user, { x: user.x, y: user.y }, p, { ms: 330 });
      if (!A().teleport(user, p.x, p.y, { fx: false })) return;
      DD.FX.particles(user, { kind: 'dust', count: 10 });
      if (!L.dmg || !active(user)) return;
      DD.FX.shake(4, 200);
      DD.FX.text(user, 'THUMP!', { color: '#ffe08a', size: 16 });
      adjacentFoes(user).forEach(function (f) { if (active(f)) A().damage(user, f, L.dmg); });
    } });

  skill({ id: 'mar_hook', name: 'Vaudeville Hook', icon: '🪝', kind: 'attack', tags: ['ranged', 'pull'], ap: 1, cooldown: 2,
    levels: lv({ dmg: 3, range: 3 }, { dmg: 4, range: 4 }, { dmg: 5, range: 5 }),
    target: { type: 'unit', range: function (L) { return [2, L.range]; }, filter: 'enemy', straight: true, los: true },
    desc: function (L) { return 'Hook a foe in a straight line 2-' + L.range + ' tiles away: ' + L.dmg + ' damage and yank it next to him.'; },
    flavor: 'Get off the stage. Get INTO the fireball.',
    execute: function (ctx) {
      const user = ctx.user, u = ctx.targetUnit;
      if (!active(u) || u === user) return;
      DD.FX.beam(user, u, { color: '#8b5a2b', width: 3, ms: 220 });
      A().damage(user, u, ctx.L.dmg);
      if (active(u)) A().pull(user, u, user, G().dist(user, u) - 1);
    } });

  skill({ id: 'mar_waxon', name: 'Wax On, Wax Off', icon: '🧽', kind: 'buff', tags: ['buff', 'combo'], ap: 1, cooldown: 2,
    levels: lv({ range: 3 }, { range: 5 }, { range: 5, ap: 1 }),
    target: { type: 'unit', range: function (L) { return [1, L.range]; }, filter: 'ally', los: false },
    desc: function (L) {
      return 'An ally within ' + L.range + ' tiles is Empowered: its next damaging skill deals +50%.' +
        (L.ap ? ' It also gets +' + L.ap + ' AP on its next turn.' : '');
    },
    flavor: 'Paint the fence. Sand the floor. Now punch that ogre in the kneecap.',
    aiScore: function () { return 3; },
    execute: function (ctx) {
      const u = ctx.targetUnit, L = ctx.L;
      if (!active(u)) return;
      DD.FX.text(u, 'Wax on... wax off!', { color: '#ffd8a0', size: 14 });
      DD.FX.particles(u, { kind: 'glitter', count: 10, color: '#ffe9a8' });
      A().addStatus(u, 'empowered', {}, ctx.user);
      if (L.ap) A().gainAp(u, L.ap);
    } });

  // ---- sprite ------------------------------------------------------------------------------------------
  const HEAD = 1.0;
  const WHITE = '#f8f6f1';
  /**
   * Details the humanoid painter has no option for: a long wispy kung-fu-master beard, droopy moustache and
   * eyebrows (white on grey fur), and a leaky marble pouch. Coordinates follow paintHumanoid's slim build.
   */
  function overlay(g) {
    const r = 9.6 * HEAD, shY = -19.5;
    // g.head: where the painter put the head (it cranes forward with the spec's hunch); constants are the fallback
    const hx = g.head ? g.head.x : g.pose === 'attack' ? 1.2 : g.pose === 'hurt' ? -0.8 : 0;
    const hy = g.head ? g.head.y : shY - r * 0.8;
    const fx = hx + r * 0.24, mx = fx + r * 0.05, my = hy + r * 0.5;
    const ey = hy + r * 0.1, d = r * 0.36;
    const sway = Math.sin((g.t || 0) * 1.6) * 0.7;
    // marble pouch on the back hip, two marbles peeking out (body points lean with the hunch: x += shear * height)
    const py = -8.2, px = -4.7 - (g.bodyShear || 0) * py;
    g.ellipse(px, py, 2.4, 2.1, '#a8784a', g.outline);
    g.circle(px - 0.8, py - 1.9, 0.95, '#4fb3ff', null);
    g.circle(px + 0.8, py - 2.0, 0.95, '#ff5f6d', null);
    g.line(px - 1.7, py - 1.0, px + 1.7, py - 1.0, '#5c3a20', 0.7);
    // long wispy beard down to the sash
    g.path(function (c) {
      c.moveTo(mx - r * 0.46, my - r * 0.02);
      c.quadraticCurveTo(mx - r * 0.42, my + r * 0.95, mx + sway, my + r * 1.62);
      c.quadraticCurveTo(mx + r * 0.42, my + r * 0.9, mx + r * 0.48, my - r * 0.04);
      c.quadraticCurveTo(mx, my + r * 0.3, mx - r * 0.46, my - r * 0.02);
      c.closePath();
    }, WHITE, g.outline);
    g.line(mx - r * 0.05, my + r * 0.45, mx + sway * 0.6, my + r * 1.25, '#cfc8bd', 0.7);
    // droopy moustache: one soft "n" over the beard
    g.path(function (c) {
      c.moveTo(mx - r * 0.62, my + r * 0.32);
      c.quadraticCurveTo(mx - r * 0.42, my - r * 0.3, mx, my - r * 0.16);
      c.quadraticCurveTo(mx + r * 0.42, my - r * 0.3, mx + r * 0.62, my + r * 0.32);
      c.quadraticCurveTo(mx + r * 0.36, my + r * 0.02, mx, my + r * 0.06);
      c.quadraticCurveTo(mx - r * 0.36, my + r * 0.02, mx - r * 0.62, my + r * 0.32);
      c.closePath();
    }, WHITE, g.outline, 1.1);
    // bushy brows above the spectacles, drooping at the OUTER ends (kindly and sleepy; inner ends down reads angry)
    g.path(function (c) { c.ellipse(fx - d - r * 0.12, ey - r * 0.36, r * 0.27, r * 0.11, -0.36, 0, Math.PI * 2); }, WHITE, '#5d554b', 0.7);
    g.path(function (c) { c.ellipse(fx + d + r * 0.12, ey - r * 0.36, r * 0.27, r * 0.11, 0.36, 0, Math.PI * 2); }, WHITE, '#5d554b', 0.7);
  }

  // ---- the hero ------------------------------------------------------------------------------------------
  DD.registerHero({
    id: 'marbles', name: 'Professor Marbles', epithet: 'the Forgetful Fist', race: 'Rabbitfolk', cls: 'Monk',
    role: 'Mobile melee skirmisher / control', complexity: 2,
    blurb: 'An ancient rabbitfolk grandmaster who forgets names, birthdays and where he left his marbles, but never how to drop a goblin. ' +
      'Every turn he suddenly remembers one technique and does it for free. Hops up 2-level ledges, naps through briefings, hits like a falling piano.',
    color: '#e8a33d',
    unlock: null,
    stats: { hp: 28, ap: 3, mov: 4, armor: 0, init: 2 },
    growth: { hp: 4 },
    flags: { hop: true },
    sprite: {
      base: 'humanoid', scale: 1, build: 'slim', outfit: 'robe', hunch: 0.6,
      palette: {
        skin: '#bdb1a2', cloth: '#e39b2d', cloth2: '#7c2232', hair: WHITE, beard: WHITE, eye: '#2e2420',
        metal: '#b5853a', accent: '#5fb7ff', outline: '#22161a', ear: '#b9ad9e', inner: '#e99aab', glasses: '#8a6a2e',
        wood: '#7b4f2c', sash: '#7c2232',
      },
      head: { size: HEAD, ears: 'rabbit_floppy', hair: 'none', beard: 'none', face: 'glasses', eyes: 'sleepy', mouth: 'none' },
      tail: 'rabbit', mainhand: 'cane', extras: ['sash'],
      overlay: overlay,
    },
    basic: 'mar_jab',
    signature: 'mar_signature',
    passive: {
      name: 'Absent-Minded Mastery',
      desc: 'At the start of each of his turns he suddenly remembers one random ready socketed skill: its first use that turn costs 0 AP.',
      hooks: { onTurnStart: function (unit) { remember(unit); } },
    },
    startingSkills: ['mar_whack', 'mar_scatter'],
    skillPool: ['mar_whack', 'mar_scatter', 'mar_punch', 'mar_flurry', 'mar_backinmyday', 'mar_lecture', 'mar_carrot', 'mar_leap',
      'mar_hook', 'mar_waxon'],
    summons: [],
    barks: {
      select: ['Eh? Oh! Yes. Me. I\'m the one who punches.', 'Who are you again? Never mind. Point me at it.',
        'I was napping. I mean meditating. Same thing.', 'Professor Marbles, at your service. Where\'s my cane?',
        'Have you seen my marbles? I had them a minute ago.'],
      start: ['Back in my day, dungeons had the decency to be dark.', 'Ah, a fight! I remember those. Vaguely.',
        'Stand behind me, children. And mind the marbles.', 'Let\'s be quick. It\'s nearly nap o\'clock.',
        'Nobody touch my cane. Or my carrots.', 'Betty, dear, please don\'t eat the dungeon. We need it.'],
      move: ['Hop, hop. Mind the hip.', 'My knees say no. My paws say yes.', 'I used to do this faster. In the Bronze Age.',
        'Where was I going? Ah. Forward.', 'Coming, coming! Don\'t rush an old rabbit.'],
      kill: ['Respect your elders.', 'Rest now. I certainly intend to.', 'I\'ve forgotten more kung fu than you\'ll ever learn.',
        'And THAT is why we stretch.', 'Didn\'t even spill my tea.'],
      hurt: ['Ow! My good ear!', 'Hey! I bruise like a ripe pear!', 'That\'s going in my memoirs. Unflatteringly.',
        'My spectacles! Who touched my spectacles?', 'Rude! I am four hundred years old!'],
      lowhp: ['I may need a little lie-down. A long one.', 'Josiah, dear, is that potion carrot-flavoured?',
        'Someone fetch my pills. The blue ones. No, the OTHER blue ones.', 'I see a bright light. Oh. It\'s Zarathor\'s jewellery.',
        'Kiri, dear, if I go ethereal, leave out a carrot.'],
      downed: ['Just... resting my eyes...', 'Wake me when it\'s lunch.', 'Tell my marbles... I loved them...',
        'Zzz... five more minutes, Master...'],
      revive: ['I\'m up! I was never down. I was meditating.', 'Who moved the floor?', 'Ah, a second wind. Or my ninth.',
        'Right! Where was I? Oh yes. Violence.'],
      ally_down: ['Up you get! Youth is wasted on the horizontal.', 'No napping on the job! That\'s MY thing.',
        'Ellaria, dear, send a corgi to lick their face!', 'Bah! In my day we got knocked down and LIKED it.',
        'Basanos, help them up! ...Good boy. Sorry. Habit.'],
      levelup: ['I learned something new! Now to forget something old.', 'Wisdom! Or possibly indigestion.',
        'A level up? At my age? Delightful!', 'My memory improves! Wait, what were we talking about?'],
      victory: ['Splendid! Now, who\'s carrying me home?', 'Another one for the memoirs. Where did I put the memoirs?',
        'Ha! Still got it. Whatever "it" is.', 'Good show, children. Nap time.', 'Marwyn, stop flexing. We all saw it.',
        'Mayor Buga, put that down. Those are MY marbles.'],
      idle: ['Have I told you about the War of the Carrot? I have? Well...', 'Zzz... hm? I\'m awake. I was praying.',
        'Has anyone seen my marbles? Sparrow, check your pockets.', 'Syllamin, dear, must you swear at the furniture?',
        'In my day we had one dimension. Flat. Loved it.', 'Slate, dear, smile for once! ...Oh. That IS the smile.'],
      signature: ['I forgot I was RETIRED!', 'HI-YAAAH! ...oof, my back.', 'Fifty years of kung fu, children! Watch closely!',
        'I remember EVERYTHING! For about six seconds!'],
    },
  });

  // ---- hero items ----------------------------------------------------------------------------------------
  DD.registerItem({ id: 'mar_cane', name: 'Cane of Unsolicited Advice', slot: 'weapon', rarity: 'rare', icon: '🏒', hero: 'marbles',
    stats: { dmg: 0.1 },
    desc: '+10% damage. His pushes and pulls move units 1 tile further.',
    flavor: 'Carved from the tree he planted as a boy. He tells you about it. Every. Single. Swing.',
    hooks: {
      // his own forced movement only (the hook fires on the pusher's sources); a pull still stops next to him
      modifyOutgoingPush: function (p) { if (p && p.dist > 0) p.dist += 1; },
    } });

  DD.registerItem({ id: 'mar_robes', name: 'Robes of Many Pockets', slot: 'armor', rarity: 'rare', icon: '🥋', hero: 'marbles',
    stats: { hp: 5 },
    desc: '+5 max HP. At the end of each of his turns, Loose Marbles spill onto the 4 tiles around him (other surfaces stay) ' +
      'until the end of the next round.',
    flavor: 'Forty-two pockets, forty-one holes, one very old mint.',
    hooks: {
      onTurnEnd: function (unit) {
        if (!active(unit) || unit.side !== 'hero') return;
        const around = DD.util.DIRS.map(function (d) { return { x: unit.x + d.x, y: unit.y + d.y }; });
        const placed = scatter(unit, around, { turns: 2 });
        placed.forEach(function (tl, i) { DD.FX.tile(tl.x, tl.y, 'glow', { color: '#9fd8ff', parallel: i > 0 }); });
        if (placed.length) A().log('Marbles trickle out of ' + unit.name + '\'s pockets.', 'hero');
      },
    } });

  DD.registerItem({ id: 'mar_pills', name: 'Grandpa\'s Pill Organizer', slot: 'trinket', rarity: 'legendary', icon: '💊', hero: 'marbles',
    desc: 'Absent-Minded Mastery remembers 2 skills each turn instead of 1.',
    flavor: 'S-M-T-W-T-F-S. Every compartment holds one marble. He swears they are vitamins.' });
})();
