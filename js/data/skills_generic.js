/* Dungeons and Degenerates — js/data/skills_generic.js
 * Generic skills (owner 'generic', ids gen_*): the bar-fight basics any hero can learn from a skill tome or a
 * level-up (DD.Run.learnableFor(rh, { generic: true })). Twelve skills × three levels. v2 (DESIGN §6 "Simplicity"):
 * one verb each plus at most one rider, and the power is in the combinations — Sand in Your Eye's Dazzle sets up a
 * Sucker Punch (and a clean getaway: Dazzled foes make no attacks of opportunity), Come At Me, Bro drags a foe off the
 * squishies, Rude Shove and the chair's knockback feed pits and lava, Barrel Toss lights everybody else's oil, Rally the
 * Troops pays off a big round, Dodge Roll and Tactical Retreat leave melee without provoking anything.
 * v2 requests: First Aid aimed at a downed ally gets them back up with the healed HP; Throw Chair and Sucker Punch, like
 * every single-target attack, can be aimed at an explosive barrel to set it off (the engine detonates it, no riders).
 * None of them is a spell, so Silence never stops them. DD.Kit (shared with js/data/consumables.js) holds the pure
 * path helpers and the custom projectile painters (chair, barrel) so tests and other content can reuse them.
 */
(function () {
  'use strict';
  const DD = window.DD;

  const INK = '#1a1014';
  const GOLD = '#ffd76a';
  // can't see the punch coming: Sucker Punch hits these twice as hard
  const HELPLESS = ['dazzled', 'stun', 'sleep', 'frozen'];

  // ---- helpers ---------------------------------------------------------------------------------------------
  function A() { return DD.Act; }
  function G() { return DD.Grid; }
  function active(u) { return !!u && !u.dead && !u.downed; }
  function has(u, id) { return !!u && !!u.statuses && DD.Act.hasStatus(u, id); }
  function lv(L) { return L || {}; }
  function tk(x, y) { return x + ',' + y; }
  function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }

  // speech-bubble quips per skill (any hero can say them; ≤ 70 characters)
  const QUIPS = {
    gen_throw_chair: ['Chair!', 'Who ordered the chair?', 'This one\'s on the house!', 'Bar rules!'],
    gen_second_wind: ['I\'m fine. Totally fine.', 'Walk it off!', 'Okay. Okay. Round two.'],
    gen_dodge_roll: ['Nope!', 'Tuck and roll!', 'Missed me!'],
    gen_shove: ['Move.', 'Excuse me!', 'Out of my way!', 'Shoo!'],
    gen_rally: ['On me! ON ME!', 'For glory! And loot!', 'Hands in, team!', 'We got this. Probably.'],
    gen_first_aid: ['Hold still. This will sting.', 'Rub some dirt on it.', 'You\'ll live. Probably.'],
    gen_pocket_sand: ['Sh-sha!', 'Pocket sand!', 'Eyes up here! Oh. Sorry.'],
    gen_taunt: ['Yeah, YOU. With the face.', 'Over here, ugly!', 'Hold my drink.', 'Fight me!'],
    gen_sucker_punch: ['Look, a distraction!', 'No such thing as a fair fight.', 'Pow.'],
    gen_barrel_toss: ['FIRE IN THE HOLE!', 'Catch!', 'Barrel delivery!'],
    gen_power_nap: ['Wake me if I die.', 'Just resting my eyes...', 'Zzz... five more minutes...'],
    gen_tactical_retreat: ['Strategic withdrawal!', 'I meant to do that.', 'Pardon me. Excuse me. Leaving.', 'Regroup! REGROUP!'],
  };

  /** A literal speech-bubble quip now and then (cosmetic RNG only; silent during preview dry runs). */
  function quip(u, id, chance) {
    const lines = QUIPS[id];
    if (!active(u) || A().simulating || !lines || !lines.length) return;
    const r = DD.rng;
    if (!r || r.next() >= (chance === undefined ? 0.3 : chance)) return;
    A().bark(u, lines[Math.floor(r.next() * lines.length) % lines.length]);
  }

  /** The skill's real reach for this user (range bonuses, hero Dazzle and modifyRange included), else the fallback. */
  function reachOf(user, skill, level, fallback) {
    if (!user || !skill) return fallback;
    const r = DD.Targeting.range(user, skill, level || 1);
    return r && r[1] >= 1 ? r[1] : fallback;
  }

  /** Would a push ending on (x, y) slide `unit` one extra tile (ice terrain or an ice-like surface)? Mirrors DD.Act.push. */
  function slick(unit, x, y) {
    if (G().isFlying(unit)) return false;
    const t = G().tile(x, y);
    if (!t) return false;
    if (G().terrain(t).slide) return true;
    const sd = t.surface ? DD.getSurface(t.surface.id) : null;
    return !!(sd && sd.slide);
  }

  /** Run a query that must consult content hooks with FX, log lines, barks and events silenced. */
  function quietly(fn) {
    const FX = DD.FX, sim = A().simulating, push = FX.push;
    A().simulating = true;
    FX.push = function (evt) { return evt; };
    try { return fn(); } finally { FX.push = push; A().simulating = sim; }
  }

  /**
   * How far a push of n really carries `unit`: DD.Act.push lets modifyPush hooks change it first (Marwyn's are 1
   * shorter, the cursed Barrel Armor rolls 2 further). The hooks run quietly (their pop-ups belong to the real push).
   */
  function pushDist(src, unit, dir, n) {
    const pm = { unit: unit, src: src || null, dir: { x: dir.x, y: dir.y }, dist: Math.floor(n), cancel: false };
    if (DD.Hooks && typeof DD.Hooks.fire === 'function') quietly(function () { DD.Hooks.fire('modifyPush', unit, pm); });
    return pm.cancel ? 0 : Math.max(0, Math.floor(+pm.dist || 0));
  }

  /**
   * Tiles a forced push by `src` would carry `unit` through (dir, n steps after modifyPush hooks, plus the engine's
   * one-tile slide when the last step lands on ice), plus the tile it would crash into. No side effects; the HUD area
   * of Rude Shove, the chair's knockback and the Scroll of Yeet, so players see where the victim goes.
   */
  function pushPath(unit, dir, n, src) {
    const out = [];
    if (!unit || !dir || (!dir.x && !dir.y)) return out;
    let x = unit.x, y = unit.y, left = pushDist(src, unit, dir, n), slid = false;
    while (left > 0) {
      const nx = x + dir.x, ny = y + dir.y;
      const t = G().tile(nx, ny);
      if (!t) break;
      const o = G().unitAt(nx, ny);
      if (o || (t.obj && G().objBlocksMove(t.obj))) { out.push({ x: nx, y: ny }); break; }
      const td = G().terrain(t);
      const drop = G().isDrop(nx, ny);
      if (!drop && (td.walkable === false || !G().canStep(unit, { x: x, y: y }, { x: nx, y: ny }))) break;
      out.push({ x: nx, y: ny });
      if (drop && !G().isFlying(unit)) break;
      x = nx; y = ny;
      left--;
      if (left === 0 && !slid && slick(unit, x, y)) { left = 1; slid = true; }
    }
    return out;
  }

  /** The target tile plus the push path of the unit on it (a knockback / shove area), or just the tile. */
  function shoveArea(ctx, n) {
    if (!ctx || !ctx.target) return [];
    const out = [{ x: ctx.target.x, y: ctx.target.y }];
    const t = G().unitAt(ctx.target.x, ctx.target.y);
    if (!n || !t || !ctx.user || t === ctx.user || A().isImmovable(t)) return out;
    return out.concat(pushPath(t, DD.util.dirTo(ctx.user, t), n, ctx.user));
  }

  /**
   * Dodge Roll: the tiles from the user (exclusive) to the target (inclusive) along a straight line, or null when the
   * roll is impossible (not straight, walls / blocking objects / pits / deep water in the way, a cliff more than a step
   * up; flyers only stop at walls and objects). Units in the way are fine: you roll right past them.
   */
  function rollPath(u, target) {
    if (!u || !target) return null;
    const dx = target.x - u.x, dy = target.y - u.y;
    if ((dx && dy) || (!dx && !dy)) return null;
    const dir = { x: Math.sign(dx), y: Math.sign(dy) };
    const n = Math.abs(dx) + Math.abs(dy);
    const out = [];
    let prev = { x: u.x, y: u.y };
    for (let k = 1; k <= n; k++) {
      const p = { x: u.x + dir.x * k, y: u.y + dir.y * k };
      if (!G().isWalkable(p.x, p.y, u) || !G().canStep(u, prev, p)) return null;
      out.push(p);
      prev = p;
    }
    return out;
  }

  // one walk tree per (fight state, unit, position, length, state change counter): targeting asks for every tile
  const walkCache = typeof WeakMap === 'function' ? new WeakMap() : null;
  /**
   * Tactical Retreat's walks from where u stands: { 'x,y': { x, y, hz, st, up } } for every tile within n steps — the
   * route with the fewest hazard tiles, then the fewest steps. Walk rules: walkable tiles, the climbing rule, through
   * friends but never through foes. Every tile counts 1 step (mud too). Pure.
   */
  function retreatTree(u, n) {
    const s = DD.Combat && DD.Combat.state;
    // foes are the only units that block a walk (plain moves don't count as state changes, so list where they stand)
    const foes = s ? s.units.filter(function (o) { return !o.dead && G().hostile(u, o); }).map(function (o) { return o.x + ',' + o.y; }).join(';') : '';
    const ck = [u.id, u.x, u.y, n, G().isFlying(u) ? 1 : 0, u.flags && u.flags.hop ? 1 : 0, s ? s.mutations || 0 : 0, s ? s.turn || 0 : 0, foes].join(':');
    if (s && walkCache) { const c = walkCache.get(s); if (c && c.key === ck) return c.tree; }
    const tree = {};
    const minHz = {};
    minHz[tk(u.x, u.y)] = 0;
    let layer = [{ x: u.x, y: u.y, hz: 0, st: 0, up: null }];
    for (let st = 1; st <= n && layer.length; st++) {
      const next = [];
      for (let i = 0; i < layer.length; i++) {
        const c = layer[i];
        for (let d = 0; d < DD.util.DIRS.length; d++) {
          const nx = c.x + DD.util.DIRS[d].x, ny = c.y + DD.util.DIRS[d].y, k = tk(nx, ny);
          if (!G().isWalkable(nx, ny, u) || !G().canStep(u, c, { x: nx, y: ny })) continue;
          const o = G().unitAt(nx, ny);
          if (o && o !== u && G().hostile(u, o)) continue;
          const hz = c.hz + (G().hazardAt(nx, ny, u) ? 1 : 0);
          // reached before in fewer steps with no more hazards: that route is at least as good
          if (minHz[k] !== undefined && minHz[k] <= hz) continue;
          minHz[k] = hz;
          const e = { x: nx, y: ny, hz: hz, st: st, up: c };
          tree[k] = e;
          next.push(e);
        }
      }
      layer = next;
    }
    if (s && walkCache) walkCache.set(s, { key: ck, tree: tree });
    return tree;
  }
  /** Tactical Retreat: the walk to `to` in at most n steps (excluding the start), ending on a free tile; null if none. */
  function retreatPath(u, to, n) {
    if (!u || !to || !(n >= 1) || (to.x === u.x && to.y === u.y)) return null;
    if (Math.abs(to.x - u.x) + Math.abs(to.y - u.y) > n || !G().isFree(to.x, to.y, u)) return null;
    let e = retreatTree(u, n)[tk(to.x, to.y)];
    if (!e) return null;
    const out = [];
    while (e && e.up) { out.unshift({ x: e.x, y: e.y }); e = e.up; }
    return out;
  }
  function retreatReach(ctx) { return reachOf(ctx.user, ctx.skill, ctx.level, lv(ctx.L).range || 3); }

  // ---- projectile painters (screen space, visual only) -----------------------------------------------------------
  function box(c, x, y, w, h) { c.beginPath(); c.rect(x, y, w, h); c.fill(); c.stroke(); }

  /** Faint ghost copies of a custom projectile along its recent screen path (state kept on the FX event; visual only). */
  function trail(c, evt, x, y, z, color) {
    if (!evt) return;
    const pts = evt._kitTrail || (evt._kitTrail = []);
    const last = pts[pts.length - 1];
    if (!last || Math.abs(last.x - x) + Math.abs(last.y - y) > 3 * z) pts.push({ x: x, y: y });
    if (pts.length > 6) pts.shift();
    for (let i = 0; i < pts.length - 1; i++) {
      c.fillStyle = color;
      c.globalAlpha = 0.12 + 0.05 * i;
      c.beginPath(); c.arc(pts[i].x, pts[i].y, (3 + i) * z, 0, Math.PI * 2); c.fill();
    }
    c.globalAlpha = 1;
  }

  /** A tumbling tavern chair with a red cushion (FX projectile kind 'custom'). */
  function drawChair(c, x, y, p, view, evt) {
    const z = (view && view.zoom) || 1;
    c.save();
    trail(c, evt, x, y, z, '#f3dfb8');
    c.translate(x, y);
    c.scale(z * 1.7, z * 1.7);
    c.rotate(-0.5 + p * Math.PI * 3);
    c.lineJoin = 'round';
    c.strokeStyle = INK;
    c.lineWidth = 1.4;
    c.fillStyle = '#8a5a2e';
    box(c, -6.5, 1.8, 2.8, 7);        // back leg
    box(c, 3.7, 1.8, 2.8, 7);         // front leg
    c.fillStyle = '#d9a066';
    box(c, -7, -0.6, 14, 3);          // seat
    c.fillStyle = '#d23b2e';
    box(c, -5.5, -2.6, 11, 2.2);      // cushion
    c.fillStyle = '#8a5a2e';
    box(c, -7, -12.5, 2.8, 12);       // back post
    c.fillStyle = '#e6b57a';
    box(c, -7, -12, 7.5, 2.4);        // top rail
    box(c, -7, -7.4, 7.5, 2);         // middle slat
    c.fillStyle = 'rgba(255,255,255,0.5)';
    c.fillRect(-4.5, -2.2, 6, 0.8);
    c.restore();
  }

  /** A lit explosive barrel with a sputtering fuse (FX projectile kind 'custom'). */
  function drawBarrel(c, x, y, p, view, evt) {
    const z = (view && view.zoom) || 1;
    c.save();
    trail(c, evt, x, y, z, '#ffcf70');
    c.translate(x, y);
    c.scale(z * 1.5, z * 1.5);
    c.rotate(p * Math.PI * 2.2);
    c.lineJoin = 'round';
    c.strokeStyle = INK;
    c.lineWidth = 1.3;
    c.fillStyle = '#b8402e';
    c.beginPath();
    c.moveTo(-5, -7); c.quadraticCurveTo(-7.5, 0, -5, 7); c.lineTo(5, 7); c.quadraticCurveTo(7.5, 0, 5, -7); c.closePath();
    c.fill(); c.stroke();
    c.strokeStyle = '#2b2226'; c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(-6.4, -3.5); c.lineTo(6.4, -3.5); c.moveTo(-6.4, 3.5); c.lineTo(6.4, 3.5); c.stroke();
    c.fillStyle = '#ffe9a0';
    c.font = 'bold 6px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('XXX', 0, 0.3);
    c.strokeStyle = '#3a2a1a'; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(0, -7); c.quadraticCurveTo(2, -9.5, 1, -11.5); c.stroke();
    const f = 0.6 + 0.4 * Math.sin(p * 60);
    c.fillStyle = 'rgba(255,200,60,' + (0.55 + 0.4 * f).toFixed(2) + ')';
    c.beginPath(); c.arc(1, -12, 2.4 * f + 1, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#fffbe0';
    c.beginPath(); c.arc(1, -12, 1, 0, Math.PI * 2); c.fill();
    c.restore();
  }

  /** Clump of sand in flight. */
  function sandShot(u, t) {
    DD.FX.projectile(u, t, { kind: 'rock', color: '#e2c98f', size: 0.7, arc: 14, ms: 220, sound: 'arrow' });
  }

  const Kit = (DD.Kit = DD.Kit || {});
  Kit.HELPLESS = HELPLESS;
  Kit.isHelpless = function (u) { return HELPLESS.some(function (id) { return has(u, id); }); };
  Kit.pushPath = pushPath;
  Kit.pushDist = pushDist;
  Kit.rollPath = rollPath;
  Kit.retreatPath = retreatPath;
  Kit.drawChair = drawChair;
  Kit.drawBarrel = drawBarrel;

  function skill(def) { def.owner = 'generic'; return DD.registerSkill(def); }

  // ---- 1. Throw Chair: ranged damage for anyone (III knocks the foe back) ---------------------------------------
  skill({
    id: 'gen_throw_chair', name: 'Throw Chair', icon: '🪑', kind: 'attack', tags: ['ranged', 'throw'],
    ap: 2, cooldown: 2,
    levels: [{ dmg: 7 }, { dmg: 9 }, { dmg: 10, push: 1 }],
    target: { type: 'unit', range: [1, 4], filter: 'enemy', los: true },
    area: { shape: 'custom', fn: function (ctx) { return shoveArea(ctx, lv(ctx && ctx.L).push || 0); } },
    desc: function (L) {
      return 'Hurl a tavern chair at a foe within 4: ' + L.dmg + ' damage' + (L.push ? ' and it is knocked back ' + plural(L.push, 'tile') : '') + '.';
    },
    flavor: 'Every tavern brawl ends the same way. Somebody gets chaired.',
    execute: function (ctx) {
      const u = ctx.user, t = ctx.targetUnit, L = ctx.L;
      if (!active(u) || !active(t) || !G().hostile(u, t)) return;
      DD.FX.lunge(u, t, { ms: 120 });
      DD.FX.projectile(u, t, { kind: 'custom', draw: drawChair, arc: 26, ms: 340, sound: 'arrow' });
      A().damage(u, t, L.dmg, { tags: ['ranged', 'throw'] });
      DD.FX.particles(t, { kind: 'dust', count: 10 });
      DD.FX.text(t, 'CRASH!', { color: '#e8c48a', size: 15 });
      if (L.push && active(t) && active(u)) A().push(u, t, DD.util.dirTo(u, t), L.push);
      quip(u, 'gen_throw_chair');
    },
  });

  // ---- 2. Second Wind: a free, once-a-fight heal (III also shakes off debuffs) --------------------------------------
  skill({
    id: 'gen_second_wind', name: 'Second Wind', icon: '🌬️', kind: 'heal', tags: ['heal', 'self'],
    ap: 0, cooldown: 0, charges: 1,
    levels: [{ heal: 6 }, { heal: 8 }, { heal: 10, cleanse: true }],
    target: { type: 'self' },
    desc: function (L) {
      return 'Free action, once per fight: heal ' + L.heal + ' HP' + (L.cleanse ? ' and shake off every debuff' : '') + '.';
    },
    flavor: 'Technically it is the first wind again. Nobody checks.',
    canUse: function (ctx) {
      const u = ctx.user, L = lv(ctx.L);
      if (!u || u.hp < u.maxHp) return true;
      const sick = L.cleanse && (u.statuses || []).some(function (st) { const d = DD.getStatus(st.id); return d && d.type === 'debuff'; });
      return sick ? true : 'Not even winded. (Full HP.)';
    },
    execute: function (ctx) {
      const u = ctx.user, L = ctx.L;
      if (!active(u)) return;
      DD.FX.particles(u, { kind: 'leaves', color: '#bff5d0', count: 10 });
      DD.FX.text(u, 'Second wind!', { color: '#bff5d0', size: 14 });
      A().heal(u, u, L.heal);
      if (L.cleanse && active(u)) A().cleanse(u, 'debuff');
      quip(u, 'gen_second_wind');
    },
  });

  // ---- 3. Dodge Roll: roll out of melee (through anyone) and gain Block --------------------------------------------
  skill({
    id: 'gen_dodge_roll', name: 'Dodge Roll', icon: '🤸', kind: 'move', tags: ['move', 'defense'],
    ap: 1, cooldown: 1,
    levels: [{ range: 2, block: 2 }, { range: 3, block: 3 }, { range: 3, block: 5 }],
    target: {
      type: 'tile', range: function (L) { return [1, lv(L).range || 2]; }, filter: 'empty', los: false, straight: true,
      canTarget: function (ctx) { return rollPath(ctx.user, ctx.target) ? true : 'Something solid is in the way.'; },
    },
    canUse: function (ctx) { return ctx.user && A().cantMove(ctx.user) ? 'Rooted: no room to roll.' : true; },
    desc: function (L) {
      return 'Roll up to ' + L.range + ' tiles in a straight line, right past anyone in the way, and gain ' + L.block + ' Block.';
    },
    flavor: 'Invincibility frames sold separately. Nobody gets a swing at a moving target.',
    execute: function (ctx) {
      const u = ctx.user, L = ctx.L, to = ctx.target;
      if (!active(u) || !to || A().cantMove(u) || !rollPath(u, to) || !G().isFree(to.x, to.y, u)) return;
      const from = { x: u.x, y: u.y };
      DD.FX.particles(from, { kind: 'dust', count: 8 });
      DD.FX.jump(u, from, to, { ms: 260 });
      if (!A().teleport(u, to.x, to.y, { fx: false })) return;
      if (!active(u)) return;
      DD.FX.particles(u, { kind: 'dust', count: 8 });
      A().addBlock(u, L.block);
      quip(u, 'gen_dodge_roll', 0.2);
    },
  });

  // ---- 4. Rude Shove: push the adjacent unit (friend or foe) ---------------------------------------------------------
  skill({
    id: 'gen_shove', name: 'Rude Shove', icon: '👐', kind: 'utility', tags: ['melee', 'push'],
    ap: 1, cooldown: 1,
    levels: [{ push: 2 }, { push: 3 }, { push: 4 }],
    target: {
      type: 'dir',
      canTarget: function (ctx) {
        const t = ctx.targetUnit;
        if (!t || t === ctx.user) return 'Nobody there to shove.';
        if (A().isImmovable(t)) return 'Too heavy to shove.';
        return true;
      },
    },
    area: { shape: 'custom', fn: function (ctx) { return shoveArea(ctx, lv(ctx && ctx.L).push || 2); } },
    desc: function (L) {
      return 'Shove the adjacent unit, friend or foe, ' + L.push + ' tiles away. A crash deals 3 damage to it and what it hits.';
    },
    flavor: 'Personal space is a right. Enforcing it is a skill. Nobody gets a free swing at a shoved friend.',
    execute: function (ctx) {
      const u = ctx.user, t = ctx.targetUnit, L = ctx.L;
      if (!active(u) || !active(t) || t === u) return;
      DD.FX.lunge(u, t);
      A().push(u, t, ctx.dir, L.push);
      quip(u, 'gen_shove', 0.2);
    },
  });

  // ---- 5. Rally the Troops: Inspire everyone nearby -----------------------------------------------------------------
  skill({
    id: 'gen_rally', name: 'Rally the Troops', icon: '📯', kind: 'buff', tags: ['aoe', 'buff', 'inspire'],
    ap: 1, cooldown: function (L) { return lv(L).cd || 3; },
    // III: a wider shout and a shorter cooldown (the radius keeps the level-up text from reading the same as II)
    levels: [{ r: 2, cd: 3 }, { r: 3, cd: 3 }, { r: 4, cd: 2 }],
    target: { type: 'self' },
    area: { shape: 'circle', size: function (L) { return lv(L).r || 2; } },
    desc: function (L) {
      return 'You and every ally within ' + L.r + ' tiles are Inspired (+25% damage) until the end of their next turn.';
    },
    flavor: 'Mostly yelling. Inspirational yelling.',
    execute: function (ctx) {
      const u = ctx.user, L = ctx.L;
      if (!active(u)) return;
      DD.FX.explosion(u, { radius: L.r, color: GOLD, kind: 'shout', shake: false, sound: 'buff' });
      DD.FX.text(u, 'RALLY!', { color: GOLD, size: 18 });
      // turns: 1 = through each one's next turn (the user's own: the rest of this turn too)
      ctx.friends.forEach(function (f) { if (active(f)) A().addStatus(f, 'inspired', { turns: 1 }, u); });
      quip(u, 'gen_rally', 0.45);
    },
  });

  // ---- 6. First Aid: heal and stop the bleeding ---------------------------------------------------------------------
  const CURES = ['bleed', 'poison'];
  skill({
    id: 'gen_first_aid', name: 'First Aid', icon: '🚑', kind: 'heal', tags: ['heal', 'cleanse'],
    ap: 1, cooldown: 2,
    levels: [{ heal: 6 }, { heal: 8 }, { heal: 10 }],
    target: { type: 'unit', range: [0, 1], filter: 'allyOrSelf' },
    desc: function (L) { return 'Heal yourself or an adjacent ally ' + L.heal + ' HP and cure Bleeding and Poison.'; },
    flavor: 'One bandage, one juice box, one stern talking-to.',
    execute: function (ctx) {
      const u = ctx.user, t = ctx.targetUnit, L = ctx.L;
      // v2: aimed at a downed ally (the engine's ctx.reviveTarget), the heal gets them back up; the cures come after it
      const reviving = !!t && t === ctx.reviveTarget && t.downed && !t.dead;
      if (!active(u) || !t || (!active(t) && !reviving) || G().hostile(u, t)) return;
      if (t !== u) DD.FX.lunge(u, t, { ms: 120 });
      DD.FX.particles(t, { kind: 'hearts', count: 6 });
      A().heal(u, t, L.heal);
      CURES.forEach(function (id) { if (active(t) && has(t, id)) A().removeStatus(t, id, { text: 'Patched!' }); });
      quip(u, 'gen_first_aid', 0.25);
    },
  });

  // ---- 7. Sand in Your Eye: Dazzle (the setup for a Sucker Punch, or a clean getaway) -------------------------------
  skill({
    id: 'gen_pocket_sand', name: 'Sand in Your Eye', icon: '🏖️', kind: 'utility', tags: ['ranged', 'debuff', 'dazzle'],
    ap: 1, cooldown: 2,
    levels: [{ dmg: 2, range: 2, r: 0 }, { dmg: 3, range: 3, r: 0 }, { dmg: 3, range: 3, r: 1 }],
    target: { type: 'unit', range: function (L) { return [1, lv(L).range || 2]; }, filter: 'enemy', los: true },
    area: { shape: 'circle', size: function (L) { return lv(L).r || 0; } },
    desc: function (L) {
      return 'Fling sand at a foe within ' + L.range + (L.r ? ' and every foe next to it' : '') + ': ' + L.dmg + ' damage and Dazzled ' +
        'through ' + (L.r ? 'their' : 'its') + ' next turn (attacks land 1 tile off).';
    },
    flavor: 'Sh-sha! Nobody can swing at what they can\'t see. Beach not included.',
    execute: function (ctx) {
      const u = ctx.user, L = ctx.L, t = ctx.targetUnit;
      if (!active(u) || !ctx.target) return;
      if (t) sandShot(u, t);
      ctx.foes.forEach(function (f) {
        if (!active(f) || !active(u)) return;
        DD.FX.particles(f, { kind: 'dust', color: '#e2c98f', count: 10 });
        A().damage(u, f, L.dmg, { tags: ['ranged', 'sand'] });
        if (active(f)) A().addStatus(f, 'dazzled', { turns: 1 }, u);
      });
      quip(u, 'gen_pocket_sand', 0.35);
    },
  });

  // ---- 8. Come At Me, Bro: Taunt (and Block, to survive the consequences) ------------------------------------------
  skill({
    id: 'gen_taunt', name: 'Come At Me, Bro', icon: '😤', kind: 'utility', tags: ['taunt', 'defense'],
    ap: 1, cooldown: 2,
    levels: [{ block: 3, range: 3, r: 0 }, { block: 5, range: 4, r: 0 }, { block: 6, range: 4, r: 1 }],
    target: { type: 'unit', range: function (L) { return [1, lv(L).range || 3]; }, filter: 'enemy', los: true },
    area: { shape: 'circle', size: function (L) { return lv(L).r || 0; } },
    desc: function (L) {
      return 'Taunt a foe within ' + L.range + (L.r ? ' and every foe next to it (on their next turn they' : ' (on its next turn it') +
        ' must attack you) and gain ' + L.block + ' Block.';
    },
    flavor: 'The bravest words in any language. Also the last, sometimes.',
    execute: function (ctx) {
      const u = ctx.user, L = ctx.L;
      if (!active(u) || !ctx.target) return;
      if (ctx.targetUnit) DD.FX.lunge(u, ctx.targetUnit, { ms: 140 });
      DD.FX.text(u, 'COME AT ME, BRO!', { color: '#ff8a6b', size: 16 });
      A().addBlock(u, L.block);
      ctx.foes.forEach(function (f) {
        if (!active(f) || !active(u)) return;
        DD.FX.particles(f, { kind: 'sparks', color: '#ff6b5a', count: 6 });
        A().addStatus(f, 'taunt', { turns: 1 }, u);
      });
      quip(u, 'gen_taunt', 0.4);
    },
  });

  // ---- 9. Sucker Punch: the payoff (double damage on a foe that can't see it coming) --------------------------------
  skill({
    id: 'gen_sucker_punch', name: 'Sucker Punch', icon: '🤛', kind: 'attack', tags: ['melee', 'punch'],
    ap: 1, cooldown: 1,
    levels: [{ dmg: 4, bonus: 4 }, { dmg: 5, bonus: 5 }, { dmg: 6, bonus: 6 }],
    target: { type: 'unit', range: [1, 1], filter: 'enemy' },
    desc: function (L) {
      return 'Punch an adjacent foe for ' + L.dmg + ' damage, or ' + (L.dmg + L.bonus) + ' if it is Dazzled, Stunned, Asleep or Frozen.';
    },
    flavor: 'Honor is for people with full health bars.',
    execute: function (ctx) {
      const u = ctx.user, t = ctx.targetUnit, L = ctx.L;
      if (!active(u) || !active(t) || !G().hostile(u, t)) return;
      const cheap = Kit.isHelpless(t);
      DD.FX.lunge(u, t);
      A().damage(u, t, L.dmg + (cheap ? L.bonus : 0), { tags: ['melee', 'punch'] });
      DD.FX.particles(t, { kind: 'sparks', count: cheap ? 12 : 6 });
      if (cheap) {
        DD.FX.text(t, 'CHEAP SHOT!', { color: GOLD, size: 16 });
        quip(u, 'gen_sucker_punch', 0.35);
      }
    },
  });

  // ---- 10. Barrel Toss: fire on an area (lights oil, webs and barrels) ------------------------------------------
  skill({
    id: 'gen_barrel_toss', name: 'Barrel Toss', icon: '🛢️', kind: 'attack', tags: ['ranged', 'aoe', 'fire', 'throw'],
    ap: 2, cooldown: 2,
    levels: [{ dmg: 5, range: 4 }, { dmg: 6, range: 4 }, { dmg: 7, range: 5 }],
    target: { type: 'tile', range: function (L) { return [2, lv(L).range || 4]; }, los: false },
    area: { shape: 'circle', size: 1 },
    desc: function (L) {
      return 'Lob a lit barrel 2-' + L.range + ' tiles away, no line of sight needed: ' + L.dmg + ' fire damage to everyone within 1, ' +
        'allies too. Sets off oil, webs and barrels.';
    },
    flavor: 'Where was the barrel? Nobody asks where the barrel was.',
    execute: function (ctx) {
      const u = ctx.user, L = ctx.L, c = ctx.target;
      if (!active(u) || !c) return;
      const victims = ctx.units.slice();
      DD.FX.projectile(u, c, { kind: 'custom', draw: drawBarrel, arc: 40, ms: 420, sound: 'arrow' });
      DD.FX.explosion(c, { radius: 1, color: '#ff8a1a' });
      DD.FX.sound('explosion');
      // 'throw': the barrel is thrown (e.g. Slate's Mitts add +2 to everything he throws)
      victims.forEach(function (v) { if (active(v)) A().damage(u, v, L.dmg, { element: 'fire', tags: ['fire', 'aoe', 'barrel', 'throw'] }); });
      ctx.tiles.forEach(function (p) { A().applyElement(p.x, p.y, 'fire', u, { noUnits: true }); });
      quip(u, 'gen_barrel_toss', 0.35);
    },
  });

  // ---- 11. Power Nap: turn the AP you would lose anyway into HP -----------------------------------------------------
  skill({
    id: 'gen_power_nap', name: 'Power Nap', icon: '😴', kind: 'heal', tags: ['heal', 'self'],
    ap: 1, cooldown: 2,
    levels: [{ heal: 3 }, { heal: 4 }, { heal: 5 }],
    target: { type: 'self' },
    desc: function (L) {
      return 'Nap away the rest of your turn: spend all your AP, this one included, and heal ' + L.heal + ' HP per AP spent.';
    },
    flavor: 'Unused AP is lost at the end of the turn anyway. Might as well drool on it.',
    canUse: function (ctx) {
      const u = ctx.user;
      if (!u) return true;
      if (u.hp >= u.maxHp) return 'Not even tired. (Full HP.)';
      // the nap spends every AP you have (the engine already checked you can pay for it): a free nap on 0 AP heals 0
      return (u.ap || 0) > 0 ? true : 'Too wired to nap. (No AP.)';
    },
    execute: function (ctx) {
      const u = ctx.user, L = ctx.L;
      if (!active(u)) return;
      // what this use really cost (a passive may have made it free; nothing when another effect resolves it) + the rest
      const paid = ctx.paid ? Math.max(0, ctx.paid.ap || 0) : 0;
      const extra = Math.max(0, Math.floor(u.ap || 0));
      if (extra > 0) A().gainAp(u, -extra);
      DD.FX.text(u, 'Zzz...', { color: '#b8c8ff', size: 16 });
      DD.FX.particles(u, { kind: 'bubbles', color: '#b8c8ff', count: 8 });
      if (paid + extra > 0) A().heal(u, u, L.heal * (paid + extra));
      quip(u, 'gen_power_nap', 0.4);
    },
  });

  // ---- 12. Tactical Retreat: the generic Disengage (a walk that provokes nothing) ----------------------------------
  skill({
    id: 'gen_tactical_retreat', name: 'Tactical Retreat', icon: '🏳️', kind: 'move', tags: ['move', 'defense'],
    ap: 1, cooldown: 2,
    levels: [{ range: 3 }, { range: 4 }, { range: 5 }],
    target: {
      type: 'tile', range: function (L) { return [1, lv(L).range || 3]; }, filter: 'empty', los: false,
      canTarget: function (ctx) { return retreatPath(ctx.user, ctx.target, retreatReach(ctx)) ? true : 'No way to walk there.'; },
    },
    // the HUD shows the route (a skill walk enters every tile on it)
    area: {
      shape: 'custom',
      fn: function (ctx) {
        if (!ctx || !ctx.user || !ctx.target) return [];
        return retreatPath(ctx.user, ctx.target, retreatReach(ctx)) || [{ x: ctx.target.x, y: ctx.target.y }];
      },
    },
    canUse: function (ctx) { return ctx.user && A().cantMove(ctx.user) ? 'Rooted: you can\'t walk away.' : true; },
    desc: function (L) { return 'Walk up to ' + L.range + ' tiles without provoking attacks of opportunity.'; },
    flavor: 'We are not running away. We are advancing toward the rear.',
    execute: function (ctx) {
      const u = ctx.user;
      if (!active(u) || !ctx.target || A().cantMove(u)) return;
      const path = retreatPath(u, ctx.target, retreatReach(ctx));
      if (!path) return;
      DD.FX.text(u, 'Tactical!', { color: '#d8e6ff', size: 14 });
      // a skill walk (moveAlong without provoke): leaving a foe's side is free
      A().moveAlong(u, path);
      quip(u, 'gen_tactical_retreat', 0.4);
    },
  });

  Kit.QUIPS = QUIPS;
  Kit.GENERIC_IDS = ['gen_throw_chair', 'gen_second_wind', 'gen_dodge_roll', 'gen_shove', 'gen_rally', 'gen_first_aid',
    'gen_pocket_sand', 'gen_taunt', 'gen_sucker_punch', 'gen_barrel_toss', 'gen_power_nap', 'gen_tactical_retreat'];
})();
