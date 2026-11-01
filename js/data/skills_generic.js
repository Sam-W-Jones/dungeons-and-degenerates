/* Dungeons and Degenerates — js/data/skills_generic.js
 * Generic skills (owner 'generic', ids gen_*): the bar-fight basics any hero can learn from a skill tome or a
 * level-up (DD.Run.learnableFor(rh, { generic: true })). Twelve skills × three levels, each simple on its own and
 * built to combo with the rest of the party: Throw Chair, Second Wind, Dodge Roll, Rude Shove, Rally the Troops,
 * First Aid, Sand in Your Eye, Come At Me Bro, Sucker Punch, Barrel Toss, Power Nap, Tactical Retreat.
 * None of them is a spell, so Silence never stops them. DD.Kit (shared with js/data/consumables.js) holds the pure
 * geometry helpers and the custom projectile painters (chair, barrel) so tests and other content can reuse them.
 */
(function () {
  'use strict';
  const DD = window.DD;

  const INK = '#1a1014';
  const GOLD = '#ffd76a';
  // Stunned, Asleep, Frozen, Dazzled or busy glaring at someone: open for a Sucker Punch
  const HELPLESS = ['dazzled', 'stun', 'sleep', 'frozen', 'taunt'];

  // ---- helpers ---------------------------------------------------------------------------------------------
  function A() { return DD.Act; }
  function G() { return DD.Grid; }
  function active(u) { return !!u && !u.dead && !u.downed; }
  function has(u, id) { return !!u && !!u.statuses && DD.Act.hasStatus(u, id); }
  function lv(L) { return L || {}; }

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
    gen_tactical_retreat: ['Strategic withdrawal!', 'I meant to do that.', 'Regroup! REGROUP!', 'Cover me!'],
  };

  /** A literal speech-bubble quip now and then (cosmetic RNG only; silent during preview dry runs). */
  function quip(u, id, chance) {
    const lines = QUIPS[id];
    if (!active(u) || A().simulating || !lines || !lines.length) return;
    const r = DD.rng;
    if (!r || r.next() >= (chance === undefined ? 0.3 : chance)) return;
    A().bark(u, lines[Math.floor(r.next() * lines.length) % lines.length]);
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
   * one-tile slide when the last step lands on ice), plus the tile it would crash into. No side effects; used for the
   * HUD area of Rude Shove and the Scroll of Yeet so players see where the victim goes.
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

  /** Tiles under an enemy telegraph right now ({ 'x,y': 1 }); stunned or sheeped enemies' intents don't count. */
  function telegraphed() {
    const out = {};
    const s = DD.Combat && DD.Combat.state;
    if (!s || !DD.AI || typeof DD.AI.intentTiles !== 'function') return out;
    s.units.forEach(function (e) {
      if (!active(e) || e.side !== 'enemy' || !e.intents || !e.intents.length || has(e, 'sheep')) return;
      if (DD.Combat.isStunned && DD.Combat.isStunned(e)) return;
      e.intents.forEach(function (it) {
        DD.AI.intentTiles(e, it).forEach(function (p) { out[p.x + ',' + p.y] = 1; });
      });
    });
    return out;
  }

  /**
   * Tactical Retreat: the free tile next to `ally` to land on, or null. Never a pit, deep water or hazard (lava,
   * fire, spikes...); out of enemy telegraphs when possible; then nearest to the user; then N/E/S/W.
   */
  function retreatSpot(u, ally) {
    if (!u || !ally) return null;
    const hot = telegraphed();
    let best = null, bestScore = Infinity;
    DD.util.DIRS.forEach(function (d, i) {
      const x = ally.x + d.x, y = ally.y + d.y;
      if (!G().isFree(x, y, u) || G().isDrop(x, y) || G().hazardAt(x, y, u)) return;
      const score = (hot[x + ',' + y] ? 1000 : 0) + (Math.abs(x - u.x) + Math.abs(y - u.y)) * 10 + i;
      if (score < bestScore) { bestScore = score; best = { x: x, y: y }; }
    });
    return best;
  }

  /** First Aid: the friendly unit on the target tile (downed heroes only when the level can revive), else null. */
  function aidTarget(ctx) {
    if (!ctx || !ctx.user || !ctx.target) return null;
    const t = G().unitAt(ctx.target.x, ctx.target.y);
    if (!t || t.dead || G().hostile(ctx.user, t)) return null;
    if (t.downed) return lv(ctx.L).revive && t.kind === 'hero' ? t : null;
    return t;
  }

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
  Kit.pushPath = pushPath;
  Kit.pushDist = pushDist;
  Kit.telegraphed = telegraphed;
  Kit.rollPath = rollPath;
  Kit.retreatSpot = retreatSpot;
  Kit.aidTarget = aidTarget;
  Kit.drawChair = drawChair;
  Kit.drawBarrel = drawBarrel;
  Kit.isHelpless = function (u) { return HELPLESS.some(function (id) { return has(u, id); }); };

  function skill(def) { def.owner = 'generic'; return DD.registerSkill(def); }

  // ---- 1. Throw Chair ----------------------------------------------------------------------------------------------
  skill({
    id: 'gen_throw_chair', name: 'Throw Chair', icon: '🪑', kind: 'attack', tags: ['ranged', 'throw'],
    ap: 2, cooldown: 2,
    levels: [{ dmg: 7 }, { dmg: 9 }, { dmg: 10, splinter: 3 }],
    target: { type: 'unit', range: [1, 4], filter: 'enemy', los: true },
    area: { shape: 'circle', size: function (L) { return lv(L).splinter ? 1 : 0; } },
    desc: function (L) {
      return 'Hurl a tavern chair at a foe up to 4 tiles away: ' + L.dmg + ' damage.' +
        (L.splinter ? ' Splinters deal ' + L.splinter + ' damage to every other foe next to it.' : '');
    },
    flavor: 'Every tavern brawl ends the same way. Somebody gets chaired.',
    execute: function (ctx) {
      const u = ctx.user, t = ctx.targetUnit, L = ctx.L;
      if (!active(u) || !active(t) || !G().hostile(u, t)) return;
      const others = ctx.foes.filter(function (f) { return f !== t; });
      DD.FX.lunge(u, t, { ms: 120 });
      DD.FX.projectile(u, t, { kind: 'custom', draw: drawChair, arc: 26, ms: 340, sound: 'arrow' });
      A().damage(u, t, L.dmg, { tags: ['ranged', 'throw'] });
      DD.FX.particles(t, { kind: 'dust', count: 10 });
      DD.FX.text(t, 'CRASH!', { color: '#e8c48a', size: 15 });
      if (L.splinter) {
        others.forEach(function (f) {
          if (!active(f) || !active(u)) return;
          DD.FX.particles(f, { kind: 'sparks', color: '#c89a5e', count: 6 });
          A().damage(u, f, L.splinter, { tags: ['splinter'] });
        });
      }
      quip(u, 'gen_throw_chair');
    },
  });

  // ---- 2. Second Wind ----------------------------------------------------------------------------------------------
  skill({
    id: 'gen_second_wind', name: 'Second Wind', icon: '🌬️', kind: 'heal', tags: ['heal', 'self', 'cleanse'],
    ap: 0, cooldown: 0, charges: 1,
    levels: [{ heal: 6 }, { heal: 8, cleanse: 1 }, { heal: 10, cleanse: 99, gainAp: 1 }],
    target: { type: 'self' },
    desc: function (L) {
      const cl = L.cleanse >= 99 ? ', shake off every debuff' : L.cleanse ? ', shake off your newest debuff' : '';
      return 'Free action (0 AP), once per fight: heal ' + L.heal + ' HP' + cl + (L.gainAp ? ' and gain ' + L.gainAp + ' AP' : '') + '.';
    },
    flavor: 'Technically it is the first wind again. Nobody checks.',
    canUse: function (ctx) {
      const u = ctx.user, L = lv(ctx.L);
      if (!u || L.gainAp) return true;
      const hurt = u.hp < u.maxHp;
      const sick = L.cleanse && (u.statuses || []).some(function (st) { const d = DD.getStatus(st.id); return d && d.type === 'debuff'; });
      return hurt || sick ? true : 'Not even winded. (Full HP.)';
    },
    execute: function (ctx) {
      const u = ctx.user, L = ctx.L;
      if (!active(u)) return;
      DD.FX.particles(u, { kind: 'leaves', color: '#bff5d0', count: 10 });
      DD.FX.text(u, 'Second wind!', { color: '#bff5d0', size: 14 });
      A().heal(u, u, L.heal);
      if (L.cleanse && active(u)) A().cleanse(u, 'debuff', L.cleanse);
      if (L.gainAp && active(u)) A().gainAp(u, L.gainAp);
      quip(u, 'gen_second_wind');
    },
  });

  // ---- 3. Dodge Roll -----------------------------------------------------------------------------------------------
  skill({
    id: 'gen_dodge_roll', name: 'Dodge Roll', icon: '🤸', kind: 'move', tags: ['move', 'defense'],
    ap: 1, cooldown: 1,
    levels: [{ range: 2, block: 2 }, { range: 3, block: 3 }, { range: 3, block: 4, unroot: true }],
    target: {
      type: 'tile', range: function (L) { return [1, lv(L).range || 2]; }, filter: 'empty', los: false, straight: true,
      canTarget: function (ctx) { return rollPath(ctx.user, ctx.target) ? true : 'Something solid is in the way.'; },
    },
    desc: function (L) {
      return 'Roll up to ' + L.range + ' tiles in a straight line, right past anyone in the way (walls and objects stop you; so do ' +
        'pits, deep water and cliffs unless you fly). Works while Rooted' + (L.unroot ? ' and shakes the Root off' : '') + '. Gain ' +
        L.block + ' Block.';
    },
    flavor: 'Invincibility frames sold separately.',
    execute: function (ctx) {
      const u = ctx.user, L = ctx.L, to = ctx.target;
      if (!active(u) || !to || !rollPath(u, to) || !G().isFree(to.x, to.y, u)) return;
      const from = { x: u.x, y: u.y };
      DD.FX.particles(from, { kind: 'dust', count: 8 });
      DD.FX.jump(u, from, to, { ms: 260 });
      if (!A().teleport(u, to.x, to.y, { fx: false })) return;
      if (!active(u)) return;
      DD.FX.particles(u, { kind: 'dust', count: 8 });
      if (L.unroot && has(u, 'root')) A().removeStatus(u, 'root', { text: 'Rolled free!' });
      A().addBlock(u, L.block);
      quip(u, 'gen_dodge_roll', 0.2);
    },
  });

  // ---- 4. Rude Shove -----------------------------------------------------------------------------------------------
  skill({
    id: 'gen_shove', name: 'Rude Shove', icon: '👐', kind: 'attack', tags: ['melee', 'push'],
    ap: 1, cooldown: 1,
    levels: [{ dmg: 2, push: 2 }, { dmg: 3, push: 2 }, { dmg: 3, push: 3 }],
    target: {
      type: 'dir',
      canTarget: function (ctx) {
        const t = ctx.targetUnit;
        if (!t || t === ctx.user) return 'Nobody there to shove.';
        if (A().isImmovable(t)) return 'Too heavy to shove.';
        return true;
      },
    },
    area: {
      shape: 'custom',
      fn: function (ctx) {
        if (!ctx || !ctx.target) return [];
        const out = [{ x: ctx.target.x, y: ctx.target.y }];
        const t = G().unitAt(ctx.target.x, ctx.target.y);
        if (!t || !ctx.user || t === ctx.user || A().isImmovable(t)) return out;
        return out.concat(pushPath(t, DD.util.dirTo(ctx.user, t), lv(ctx.L).push || 2, ctx.user));
      },
    },
    desc: function (L) {
      return 'Shove the adjacent unit (friend or foe) ' + L.push + ' tiles straight away from you; a foe also takes ' + L.dmg +
        ' damage. If it crashes into something it takes 3 damage (so does a unit it hits). Pits, lava and water do the rest.';
    },
    flavor: 'Personal space is a right. Enforcing it is a skill.',
    aiScore: function (ctx) { return ctx.targetUnit && G().isEdge(ctx.targetUnit.x, ctx.targetUnit.y) ? 10 : 0; },
    execute: function (ctx) {
      const u = ctx.user, t = ctx.targetUnit, L = ctx.L;
      if (!active(u) || !active(t) || t === u) return;
      DD.FX.lunge(u, t);
      if (G().hostile(u, t)) A().damage(u, t, L.dmg, { tags: ['melee', 'push'] });
      if (active(t) && active(u)) A().push(u, t, ctx.dir, L.push);
      quip(u, 'gen_shove', 0.2);
    },
  });

  // ---- 5. Rally the Troops -----------------------------------------------------------------------------------------
  skill({
    id: 'gen_rally', name: 'Rally the Troops', icon: '📯', kind: 'buff', tags: ['aoe', 'buff', 'inspire'],
    ap: 1, cooldown: 3,
    levels: [{ r: 2, block: 2, turns: 1 }, { r: 2, block: 4, turns: 1 }, { r: 3, block: 4, turns: 2 }],
    target: { type: 'self' },
    area: { shape: 'circle', size: function (L) { return lv(L).r || 2; } },
    desc: function (L) {
      return 'You and every ally within ' + L.r + ' tiles gain ' + L.block + ' Block and are Inspired (+25% damage) ' +
        (L.turns >= 2 ? 'until the end of your next turn' : 'for the rest of this turn') + '.';
    },
    flavor: 'Mostly yelling. Inspirational yelling.',
    aiScore: function (ctx) { return ctx.friends.length * 3; },
    execute: function (ctx) {
      const u = ctx.user, L = ctx.L;
      if (!active(u)) return;
      DD.FX.explosion(u, { radius: L.r, color: GOLD, kind: 'shout', shake: false, sound: 'buff' });
      DD.FX.text(u, 'RALLY!', { color: GOLD, size: 18 });
      ctx.friends.forEach(function (f) {
        if (!active(f)) return;
        A().addBlock(f, L.block);
        if (active(f)) A().addStatus(f, 'inspired', { turns: L.turns }, u);
      });
      quip(u, 'gen_rally', 0.45);
    },
  });

  // ---- 6. First Aid ------------------------------------------------------------------------------------------------
  skill({
    id: 'gen_first_aid', name: 'First Aid', icon: '🚑', kind: 'heal', tags: ['heal', 'cleanse'],
    ap: 1, cooldown: 2,
    levels: [
      { heal: 6, cure: ['bleed'] },
      { heal: 8, cure: ['bleed', 'poison'] },
      { heal: 10, cure: ['bleed', 'poison'], revive: 6 },
    ],
    target: {
      type: 'tile', range: [0, 1], los: false,
      canTarget: function (ctx) { return aidTarget(ctx) ? true : 'Nobody to patch up there.'; },
    },
    desc: function (L) {
      const cure = (L.cure || []).length > 1 ? 'cure Bleed and Poison' : 'stop any Bleeding';
      return 'Patch up yourself or an adjacent ally: heal ' + L.heal + ' HP and ' + cure + '.' +
        (L.revive ? ' Or get a downed adjacent ally back on their feet with ' + L.revive + ' HP.' : '');
    },
    flavor: 'One bandage, one juice box, one stern talking-to.',
    execute: function (ctx) {
      const u = ctx.user, L = ctx.L;
      const t = aidTarget(ctx);
      if (!active(u) || !t) return;
      if (t !== u) DD.FX.lunge(u, t, { ms: 120 });
      DD.FX.particles(t, { kind: 'hearts', count: 6 });
      if (t.downed) {
        if (A().revive(t, L.revive / Math.max(1, t.maxHp))) DD.FX.text(t, 'Walk it off!', { color: '#9fffb0', size: 14 });
        return;
      }
      A().heal(u, t, L.heal);
      (L.cure || []).forEach(function (id) { if (active(t) && has(t, id)) A().removeStatus(t, id, { text: 'Patched!' }); });
      quip(u, 'gen_first_aid', 0.25);
    },
  });

  // ---- 7. Sand in Your Eye (the generic cousin of everyone's pocket sand) -------------------------------------------
  skill({
    id: 'gen_pocket_sand', name: 'Sand in Your Eye', icon: '🏖️', kind: 'utility', tags: ['ranged', 'debuff', 'dazzle'],
    ap: 1, cooldown: 2,
    levels: [{ dmg: 2, range: 2, r: 0 }, { dmg: 2, range: 2, r: 0, weak: true }, { dmg: 3, range: 3, r: 1, weak: true }],
    target: { type: 'unit', range: function (L) { return [1, lv(L).range || 2]; }, filter: 'enemy', los: true },
    area: { shape: 'circle', size: function (L) { return lv(L).r || 0; } },
    desc: function (L) {
      return 'Fling a fistful of sand at a foe up to ' + L.range + ' tiles away' + (L.r ? ' and every foe next to it' : '') + ': ' +
        L.dmg + ' damage and Dazzled for 1 turn (its next attack lands 1 tile off)' + (L.weak ? ', plus Weakened (−25% damage) for 1 turn' : '') + '.';
    },
    flavor: 'Sh-sha! A classic. Beach not included.',
    aiScore: function (ctx) { return ctx.foes.filter(function (f) { return f.intents && f.intents.length; }).length * 4; },
    execute: function (ctx) {
      const u = ctx.user, L = ctx.L, t = ctx.targetUnit;
      if (!active(u) || !ctx.target) return;
      if (t) sandShot(u, t);
      ctx.foes.forEach(function (f) {
        if (!active(f) || !active(u)) return;
        DD.FX.particles(f, { kind: 'dust', color: '#e2c98f', count: 10 });
        A().damage(u, f, L.dmg, { tags: ['ranged', 'sand'] });
        if (!active(f)) return;
        A().addStatus(f, 'dazzled', { turns: 1 }, u);
        if (L.weak && active(f)) A().addStatus(f, 'weak', { turns: 1 }, u);
      });
      quip(u, 'gen_pocket_sand', 0.35);
    },
  });

  // ---- 8. Come At Me, Bro (Taunt) ----------------------------------------------------------------------------------
  skill({
    id: 'gen_taunt', name: 'Come At Me, Bro', icon: '😤', kind: 'utility', tags: ['taunt', 'defense'],
    ap: 1, cooldown: 2,
    levels: [{ block: 3, range: 3, r: 0 }, { block: 5, range: 4, r: 0 }, { block: 6, range: 4, r: 1 }],
    target: { type: 'unit', range: function (L) { return [1, lv(L).range || 3]; }, filter: 'enemy', los: true },
    area: { shape: 'circle', size: function (L) { return lv(L).r || 0; } },
    desc: function (L) {
      return 'Taunt a foe up to ' + L.range + ' tiles away' + (L.r ? ' and every foe next to it' : '') + ' for 1 turn: ' +
        (L.r ? 'their' : 'its') + ' attacks turn on you if they can reach you (otherwise they fizzle) and ' + (L.r ? 'they' : 'it') +
        ' must come for you next. Gain ' + L.block + ' Block.';
    },
    flavor: 'The bravest words in any language. Also the last, sometimes.',
    aiScore: function (ctx) { return ctx.foes.length * 3; },
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

  // ---- 9. Sucker Punch ---------------------------------------------------------------------------------------------
  skill({
    id: 'gen_sucker_punch', name: 'Sucker Punch', icon: '🤛', kind: 'attack', tags: ['melee'],
    ap: 1, cooldown: 1,
    levels: [{ dmg: 4, bonus: 4 }, { dmg: 5, bonus: 5 }, { dmg: 6, bonus: 6, weak: true }],
    target: { type: 'unit', range: [1, 1], filter: 'enemy' },
    desc: function (L) {
      return 'Punch an adjacent foe for ' + L.dmg + ' damage, or ' + (L.dmg + L.bonus) + ' if it is Dazzled, Stunned, Asleep, Frozen ' +
        'or Taunted' + (L.weak ? '. It is Weakened (−25% damage) for 1 turn' : '') + '.';
    },
    flavor: 'Honor is for people with full health bars.',
    aiScore: function (ctx) { return ctx.targetUnit && Kit.isHelpless(ctx.targetUnit) ? lv(ctx.L).bonus || 0 : 0; },
    execute: function (ctx) {
      const u = ctx.user, t = ctx.targetUnit, L = ctx.L;
      if (!active(u) || !active(t) || !G().hostile(u, t)) return;
      const cheap = Kit.isHelpless(t);
      DD.FX.lunge(u, t);
      A().damage(u, t, L.dmg + (cheap ? L.bonus : 0), { tags: ['melee', 'punch'] });
      DD.FX.particles(t, { kind: 'sparks', count: cheap ? 12 : 6 });
      if (cheap) DD.FX.text(t, 'CHEAP SHOT!', { color: GOLD, size: 16 });
      if (L.weak && active(t)) A().addStatus(t, 'weak', { turns: 1 }, u);
      if (cheap) quip(u, 'gen_sucker_punch', 0.35);
    },
  });

  // ---- 10. Barrel Toss ---------------------------------------------------------------------------------------------
  skill({
    id: 'gen_barrel_toss', name: 'Barrel Toss', icon: '🛢️', kind: 'attack', tags: ['ranged', 'aoe', 'fire', 'throw'],
    ap: 2, cooldown: 2,
    levels: [{ dmg: 5, range: 4 }, { dmg: 6, range: 4 }, { dmg: 7, range: 5, knock: 1 }],
    target: { type: 'tile', range: function (L) { return [2, lv(L).range || 4]; }, los: false },
    area: { shape: 'circle', size: 1 },
    desc: function (L) {
      return 'Lob a lit explosive barrel 2-' + L.range + ' tiles away (no line of sight needed). KABOOM: ' + L.dmg + ' fire damage to ' +
        'every unit within 1 tile of where it lands (allies too) and the fire sets off oil, webs and barrels there.' +
        (L.knock ? ' The blast also throws everyone around the impact 1 tile outward (crashes hurt).' : '');
    },
    flavor: 'Where was the barrel? Nobody asks where the barrel was.',
    execute: function (ctx) {
      const u = ctx.user, L = ctx.L, c = ctx.target;
      if (!active(u) || !c) return;
      const victims = ctx.units.slice();
      DD.FX.projectile(u, c, { kind: 'custom', draw: drawBarrel, arc: 40, ms: 420, sound: 'arrow' });
      DD.FX.explosion(c, { radius: 1, color: '#ff8a1a' });
      DD.FX.sound('explosion');
      // 'throw': the barrel is thrown (e.g. Slate's Mitts add +2 to everything he throws); the chair's splinters aren't
      victims.forEach(function (v) { if (active(v)) A().damage(u, v, L.dmg, { element: 'fire', tags: ['fire', 'aoe', 'barrel', 'throw'] }); });
      ctx.tiles.forEach(function (p) { A().applyElement(p.x, p.y, 'fire', u, { noUnits: true }); });
      if (L.knock) {
        victims.forEach(function (v) {
          if (!active(v) || (v.x === c.x && v.y === c.y)) return;
          A().push(u, v, DD.util.dirTo(c, v), L.knock);
        });
      }
      quip(u, 'gen_barrel_toss', 0.35);
    },
  });

  // ---- 11. Power Nap -----------------------------------------------------------------------------------------------
  skill({
    id: 'gen_power_nap', name: 'Power Nap', icon: '😴', kind: 'heal', tags: ['heal', 'self'],
    ap: 1, cooldown: 2,
    levels: [{ heal: 3 }, { heal: 4 }, { heal: 5 }],
    target: { type: 'self' },
    desc: function (L) {
      return 'Nap through the rest of your turn: spend this and all your remaining AP, healing ' + L.heal + ' HP per AP spent ' +
        '(at least 1; 3 AP = ' + 3 * L.heal + ' HP). No Guard Block, obviously.';
    },
    flavor: 'Five more minutes. The goblins can wait.',
    canUse: function (ctx) { return !ctx.user || ctx.user.hp < ctx.user.maxHp ? true : 'Not even tired. (Full HP.)'; },
    execute: function (ctx) {
      const u = ctx.user, L = ctx.L;
      if (!active(u)) return;
      // the AP this use cost (a passive may have made it free) + everything left
      const paid = Math.max(0, DD.Combat.costOf(u, ctx.skill, ctx.level).ap || 0);
      const extra = Math.max(0, Math.floor(u.ap || 0));
      if (extra > 0) A().gainAp(u, -extra);
      DD.FX.text(u, 'Zzz...', { color: '#b8c8ff', size: 16 });
      DD.FX.particles(u, { kind: 'bubbles', color: '#b8c8ff', count: 8 });
      A().heal(u, u, L.heal * Math.max(1, paid + extra));
      quip(u, 'gen_power_nap', 0.4);
    },
  });

  // ---- 12. Tactical Retreat ----------------------------------------------------------------------------------------
  skill({
    id: 'gen_tactical_retreat', name: 'Tactical Retreat', icon: '🏳️', kind: 'move', tags: ['move', 'defense', 'ally'],
    ap: 1, cooldown: 2,
    levels: [{ range: 4, block: 3 }, { range: 5, block: 4 }, { range: 6, block: 6 }],
    target: {
      type: 'unit', range: function (L) { return [1, lv(L).range || 4]; }, filter: 'ally', los: false,
      canTarget: function (ctx) {
        const a = ctx.targetUnit;
        return a && (G().dist(ctx.user, a) === 1 || retreatSpot(ctx.user, a)) ? true : 'No safe room next to them.';
      },
    },
    // highlight where you will land (the ally + the landing tile), like a push path
    area: {
      shape: 'custom',
      fn: function (ctx) {
        if (!ctx || !ctx.target) return [];
        const out = [{ x: ctx.target.x, y: ctx.target.y }];
        const a = G().unitAt(ctx.target.x, ctx.target.y);
        if (!a || !ctx.user || a === ctx.user || G().dist(ctx.user, a) <= 1) return out;
        const spot = retreatSpot(ctx.user, a);
        return spot ? out.concat([spot]) : out;
      },
    },
    canUse: function (ctx) { return ctx.user && has(ctx.user, 'root') ? 'Rooted: you can\'t run. (A Dodge Roll can.)' : true; },
    desc: function (L) {
      return 'Fall back to an ally up to ' + L.range + ' tiles away: leap to the free tile next to them nearest to you, never into ' +
        'a hazard and out of telegraphed attacks if possible (already adjacent, you hold your ground). Then you both gain ' +
        L.block + ' Block. Not while Rooted.';
    },
    flavor: 'We are not running away. We are advancing toward the rear.',
    aiScore: function (ctx) { return ctx.user && ctx.user.hp < ctx.user.maxHp * 0.4 ? 6 : 0; },
    execute: function (ctx) {
      const u = ctx.user, ally = ctx.targetUnit, L = ctx.L;
      if (!active(u) || !active(ally) || ally === u || has(u, 'root')) return;
      if (G().dist(u, ally) > 1) {
        const spot = retreatSpot(u, ally);
        if (!spot) return;
        const from = { x: u.x, y: u.y };
        DD.FX.particles(from, { kind: 'dust', count: 10 });
        DD.FX.jump(u, from, spot, { ms: 340 });
        if (!A().teleport(u, spot.x, spot.y, { fx: false })) return;
      }
      DD.FX.text(u, 'Tactical!', { color: '#d8e6ff', size: 14 });
      if (active(u)) A().addBlock(u, L.block);
      if (active(ally)) A().addBlock(ally, L.block);
      quip(u, 'gen_tactical_retreat', 0.4);
    },
  });

  Kit.QUIPS = QUIPS;
  Kit.GENERIC_IDS = ['gen_throw_chair', 'gen_second_wind', 'gen_dodge_roll', 'gen_shove', 'gen_rally', 'gen_first_aid',
    'gen_pocket_sand', 'gen_taunt', 'gen_sucker_punch', 'gen_barrel_toss', 'gen_power_nap', 'gen_tactical_retreat'];
})();
