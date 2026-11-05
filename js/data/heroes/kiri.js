/* Dungeons and Degenerates — js/data/heroes/kiri.js
 * Hero: KIRI, THE HALF-THERE — half-elven ranger (she/her) whose arrows, and occasionally Kiri herself, take a shortcut
 * through the ethereal plane. v2-native (initiative, no telegraphs), DESIGN §6 "Kiri" + "Simplicity".
 * Passive "Between Worlds": her skills ignore line of sight (every Kiri skill has target.los === false).
 * Arrow from Beyond puts the status kir_incoming "Foreshadowed" (stacks = damage) on a foe; Kiri's passive hooks land
 * those arrows at the start of her next turn (onTurnStart) and fizzle them if she goes down first (onDowned).
 * Attacks of opportunity (DESIGN §4.2): her bow is ranged, so she never makes one; walking off a melee foe provokes one
 * like for anybody, but Ethereal Step is a teleport and Fade Out a Stealth, so both slip away (her escape tools), and
 * Banishing Shot's push never provokes. A cosmetic passive hook barks ('provoked') when she gets hit by one.
 * Registers: hero kiri, 11 skills, status kir_incoming, surface kir_ghost_mist, 3 items (all ids kir_*).
 */
(function () {
  'use strict';
  const DD = window.DD;

  const HERO = 'kiri';
  const GHOST = '#a99bff', GHOST_BLUE = '#8fd3ff', GHOST_DEEP = '#6f5fe0';

  // ---- helpers ------------------------------------------------------------------------------------
  function active(u) { return !!u && !u.dead && !u.downed; }
  function has(u, id) { return DD.Act.hasStatus(u, id); }
  function sky(p) { return { x: p.x - 1, y: p.y - 1, h: 9 }; }

  /** A ghost arrow from the user to a point (projectile + a little ectoplasm where it lands). */
  function ghostShot(from, to, opts) {
    opts = opts || {};
    DD.FX.projectile(from, to, { kind: 'arrow', color: opts.color || GHOST, trail: true, arc: opts.arc === undefined ? 0.15 : opts.arc, parallel: !!opts.parallel });
    DD.FX.particles(to, { kind: 'runes', color: GHOST, count: opts.count || 6, parallel: true });
  }

  /**
   * Phase Shot's line: every in-bounds tile straight ahead of the user out to the skill's range (L.len, so the Longbow's
   * +1 range or Dazzle's −1 lengthen / shorten the line and it always reaches the aimed tile), walls and units notwithstanding.
   */
  function phaseLine(ctx) {
    const u = ctx && ctx.user, d = ctx && ctx.dir;
    if (!u || !d || (!d.x && !d.y)) return [];
    const base = Math.round(+(ctx.L && ctx.L.len) || 5);
    const len = Math.max(1, ctx.skill ? DD.Targeting.range(u, ctx.skill, ctx.level || 1)[1] : base);
    const out = [];
    for (let i = 1; i <= len; i++) {
      const x = u.x + d.x * i, y = u.y + d.y * i;
      if (!DD.Grid.inBounds(x, y)) break;
      out.push({ x: x, y: y });
    }
    return out;
  }

  // ---- Arrow from Beyond: pending arrows land at the start of the shooter's next turn -------------------
  function shooterName(st) {
    const u = st && st.source && DD.Combat && DD.Combat.byId ? DD.Combat.byId(st.source) : null;
    return u ? u.name : 'Kiri';
  }
  /** Every arrow this unit sent into the ethereal plane: [{ unit, st }] (living targets only). */
  function pendingArrows(shooter) {
    const s = DD.Combat && DD.Combat.state;
    if (!s || !shooter) return [];
    const out = [];
    s.units.forEach(function (u) {
      if (!active(u)) return;
      const st = DD.Act.getStatus(u, 'kir_incoming');
      if (st && st.source === shooter.id) out.push({ unit: u, st: st });
    });
    return out;
  }
  /** Start of the shooter's turn: each pending arrow hits its target for its stacks, wherever the target is. */
  function landArrows(shooter) {
    const s = DD.Combat && DD.Combat.state;
    if (!active(shooter) || !s || s.result) return 0;
    const def = DD.getSkill('kir_beyond');
    const list = pendingArrows(shooter);
    list.forEach(function (e) {
      const u = e.unit;
      if (!active(u) || s.result) return;
      const dmg = Math.max(1, Math.round(e.st.stacks || 0));
      DD.Act.removeStatus(u, 'kir_incoming', { silent: true });
      DD.FX.projectile(sky(u), u, { kind: 'arrow', color: GHOST, trail: true, arc: 0, size: 1.5 });
      DD.FX.particles(u, { kind: 'runes', color: GHOST, count: 14, parallel: true });
      DD.FX.text(u, '☄️ From beyond!', { color: GHOST, size: 15, parallel: true });
      DD.Act.log('An arrow from beyond finds ' + u.name + '.', 'hero');
      DD.Act.damage(shooter, u, dmg, { skill: def, tags: ['arrow', 'ethereal', 'delayed'], noHighGround: true });
    });
    return list.length;
  }
  /** The shooter went down before her next turn: her arrows lose their way. */
  function fizzleArrows(shooter) {
    const list = pendingArrows(shooter);
    list.forEach(function (e) { DD.Act.removeStatus(e.unit, 'kir_incoming', { text: '☄️ Lost its way' }); });
    if (list.length) DD.Act.log('With ' + shooter.name + ' down, her arrows from beyond lose their way.', 'system');
    return list.length;
  }

  // ---- status & surface ------------------------------------------------------------------------------
  // the status name reads as a state, like every status ("Goblin Grunt is Foreshadowed (22).", "+Foreshadowed 22")
  DD.registerStatus({
    id: 'kir_incoming', name: 'Foreshadowed', icon: '☄️', color: GHOST, type: 'debuff', stacking: 'stack', maxStacks: 99,
    decay: 'never', defaultTurns: -1,
    desc: function (st) {
      return 'An arrow is on its way from the ethereal plane: it deals ' + st.stacks + ' damage at the start of ' + shooterName(st) +
        '\'s next turn, wherever this unit is (it fizzles if she goes down first).';
    },
  });

  /** Lavender puffs drifting up from the tile (renderer volume layer). */
  function mistVolume(g, sf, t) {
    const c = g.ctx, tl = g.tile || { x: 0, y: 0 };
    const ph = ((tl.x * 41 + tl.y * 67) % 19) / 19 * 6.283;
    t = t || 0;
    for (let i = 0; i < 4; i++) {
      const k = (t * 0.06 + i / 4 + ph / 6.283) % 1, life = Math.sin(Math.PI * k);
      const x = Math.sin(ph + i * 2.3) * 13 + Math.sin(t * 0.3 + i * 1.7) * 2;
      const y = Math.cos(ph * 0.7 + i * 1.9) * 4 - 4 - k * 15;
      const r = (10 + 3 * Math.sin(i * 2.1 + ph)) * (0.65 + 0.5 * life) + 3;
      const a = 0.5 * Math.min(1, life * 1.7);
      const gr = c.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
      gr.addColorStop(0, 'rgba(232,226,255,' + a.toFixed(3) + ')');
      gr.addColorStop(0.55, 'rgba(176,160,255,' + (a * 0.8).toFixed(3) + ')');
      gr.addColorStop(1, 'rgba(120,104,224,0)');
      c.fillStyle = gr;
      c.beginPath(); c.arc(x, y, r, 0, 6.283); c.fill();
    }
  }
  // a cloud, not a floor surface (airborne: it hangs over pits and lava too; flyers are inside it like everyone else)
  DD.registerSurface({
    id: 'kir_ghost_mist', name: 'Ghost Mist', color: 'rgba(170,155,255,0.38)', turns: 2, blocksLos: true, airborne: true,
    desc: 'Mist from the other side: blocks line of sight. Kiri\'s skills ignore it (she has seen through worse).',
    drawVolume: mistVolume,
  });

  // ---- sprite ----------------------------------------------------------------------------------------
  // half-elf ranger: green-grey hood and cloak, dark hair, violet eyes, longbow, ghost-lit quiver, ectoplasm at her heels
  const KIR_PAL = {
    skin: '#efcdb4', cloth: '#5b6e5c', cloth2: '#3c4b42', hair: '#2b2436', metal: '#b9c3cf', eye: '#8f7bff',
    accent: GHOST, outline: '#16131d', cape: '#4b5d50', pants: '#3a4036', boots: '#3d2c22', belt: '#5c4130',
    wood: '#7a5838', grip: '#3b281d',
  };
  /**
   * Dark hair the painter leaves out under a hood: side-swept bangs inside the hood's face opening (the ellipse drawn by
   * sprites.js drawHat 'hood': centre head + (0.16 r, 0.2 r), radii 0.8 r × 0.86 r) and two long locks spilling out of it.
   */
  function kirHair(g, H, t, part) {
    const c = g.ctx, r = H.r, col = g.pal.hair, ink = Math.max(0.6, r * 0.07);
    const P = function (dx, dy) { return [H.x + dx * r, H.y + dy * r]; };
    const ox = H.x + r * 0.16, oy = H.y + r * 0.2;
    if (part === 'locks') {
      const sway = Math.sin(t * 1.4) * r * 0.03;
      [[-0.5, -0.62, 1.62], [0.86, 0.98, 1.55]].forEach(function (L) {
        const top = P(L[0], 0.35), tip = P(L[1], L[2]), w = r * 0.13, my = (top[1] + tip[1]) / 2;
        g.path(function (p) {
          p.moveTo(top[0] - w, top[1]);
          p.quadraticCurveTo(top[0] - w * 1.2 + sway, my, tip[0] + sway, tip[1]);
          p.quadraticCurveTo(top[0] + w * 1.1 + sway, my, top[0] + w, top[1]);
          p.closePath();
        }, col, g.outline, ink);
      });
      return;
    }
    c.save();
    c.beginPath(); c.ellipse(ox, oy, r * 0.8, r * 0.86, 0, 0, Math.PI * 2); c.clip();
    g.path(function (p) {
      const pts = [P(-1.1, -1.1), P(1.2, -1.1), P(1.2, 0.75), P(0.86, 0.75)];
      p.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
      const a = P(0.8, 0.1), b = P(0.74, -0.16);
      p.quadraticCurveTo(a[0], a[1], b[0], b[1]);
      [P(0.52, -0.08), P(0.36, -0.3), P(0.18, -0.06), P(-0.02, -0.34), P(-0.2, -0.13), P(-0.36, -0.3)].forEach(function (q) { p.lineTo(q[0], q[1]); });
      const d = P(-0.47, 0.1), e = P(-0.44, 0.75), f = P(-1.1, 0.75);
      p.quadraticCurveTo(d[0], d[1], e[0], e[1]);
      p.lineTo(f[0], f[1]);
      p.closePath();
    }, col, g.outline, ink);
    g.arc(H.x + r * 0.12, H.y + r * 0.05, r * 0.55, Math.PI * 1.22, Math.PI * 1.5, g.rgba(g.shade(col, 0.7), 0.75), ink);
    c.beginPath(); c.ellipse(ox, oy, r * 0.8, r * 0.86, 0, Math.PI * 1.08, Math.PI * 1.92);
    c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = r * 0.2; c.stroke();
    c.restore();
  }
  /**
   * In front: her hair (above), a deadpan mouth, a thin quiver strap and belt (the painter's belt / bandolier are mostly
   * outline on a slim torso), half-elf ear tips poking out through the hood (the painter hides 'pointy' ears under a hood)
   * and a quiver of ghost-lit arrows slung over the cloak, fletchings out behind her back shoulder.
   */
  function kirOverlay(g, t, o) {
    if (!g) return;
    const lying = !!(o && o.lying >= 0.5);
    if (g.head) kirHair(g, g.head, t, 'bangs');
    if (lying) return;
    if (g.head && g.pose !== 'hurt') {
      const H = g.head, mx = H.x + H.r * 0.29, my = H.y + H.r * 0.5;
      g.line(mx - H.r * 0.13, my + H.r * 0.01, mx + H.r * 0.1, my - H.r * 0.035, g.outline, Math.max(0.7, H.r * 0.085));
    }
    // slim build (sprites.js BUILDS.slim): shoulders 0.8 r below the head centre, hips 12 below the shoulders
    const shY = g.head ? g.head.y + g.head.r * 0.8 : -19.5, hipY = shY + 12;
    g.line(-4.9, hipY - 1.5, 4.9, hipY - 1.5, g.outline, 2.1);
    g.line(-4.9, hipY - 1.5, 4.9, hipY - 1.5, g.pal.belt, 1.1);
    g.poly([[0.7, hipY - 2.5], [2.6, hipY - 2.5], [2.6, hipY - 0.5], [0.7, hipY - 0.5]], g.pal.metal, g.outline, 0.5);
    g.line(-4.6, shY + 3.7, 4.9, hipY - 1.9, g.outline, 2.4);
    g.line(-4.6, shY + 3.7, 4.9, hipY - 1.9, '#6b4a30', 1.3);
    const flick = 0.5 + 0.15 * Math.sin(t * 3.1);
    g.glow(-17, -25.5, 7, GHOST, flick);
    g.limb(-8.5, -8, -13.2, -20.5, 3.6, '#6b4a30');
    g.line(-9.6, -10.5, -13.6, -19.5, '#8f6a45', 0.8);
    const tips = [[-17.6, -25.8], [-19.4, -23], [-15.6, -28]];
    for (let i = 0; i < tips.length; i++) {
      const tx = tips[i][0], ty = tips[i][1];
      g.line(-13.2, -20.5, tx, ty, '#4a3426', 1.1);
      g.poly([[tx + 0.4, ty - 0.6], [tx - 2.6, ty + 0.4], [tx - 0.4, ty + 2.6]], i === 1 ? GHOST_BLUE : GHOST, g.outline, 0.9);
    }
    if (!g.head) return;
    const H = g.head, r = H.r, skin = g.pal.skin;
    const twitch = Math.sin(t * 1.7) > 0.96 ? 0.12 : 0;
    for (let s = -1; s <= 1; s += 2) {
      const b0 = [H.x + s * r * 1.08, H.y - r * 0.2], b1 = [H.x + s * r * 1.12, H.y + r * 0.22];
      const tip = [H.x + s * r * 1.68, H.y - r * (0.62 + twitch)];
      g.poly([b0, tip, b1], skin, g.outline, 1.1);
      g.line(H.x + s * r * 1.16, H.y - r * 0.02, H.x + s * r * 1.45, H.y - r * 0.38, g.shade(skin, -0.22), 0.9);
    }
    kirHair(g, H, t, 'locks');
  }
  /** Ectoplasm at her heels: she is never entirely in one plane. */
  function kirUnderlay(g, t) {
    if (!g) return;
    const a = 0.32 + 0.1 * Math.sin(t * 2.4);
    g.ellipse(0, 0.5, 11, 4.2, g.rgba(GHOST, a * 0.7), null);
    for (let i = 0; i < 3; i++) {
      const k = (t * 0.35 + i / 3) % 1;
      g.circle(-6 + i * 6, -1 - k * 9, 1.4 * (1 - k) + 0.4, g.rgba(i === 1 ? GHOST_BLUE : GHOST, 0.7 * (1 - k)), null);
    }
  }
  const KIR_SPRITE = {
    base: 'humanoid', scale: 1, palette: KIR_PAL, build: 'slim', outfit: 'tunic',
    head: { size: 1, ears: 'pointy', horns: 'none', hair: 'long', beard: 'none', hat: 'hood', face: 'none', eyes: 'normal', mouth: 'none', blush: false },
    wings: 'none', tail: 'none', mainhand: 'bow', offhand: 'none',
    bling: [], extras: ['cape'],
    aura: { kind: 'glow', color: GHOST },
    overlay: kirOverlay,
    underlay: kirUnderlay,
  };

  // ---- skills ------------------------------------------------------------------------------------------
  function skill(def) { def.owner = HERO; return DD.registerSkill(def); }

  // Basic: Ghost Arrow
  skill({
    id: 'kir_basic', name: 'Ghost Arrow', icon: '🏹', kind: 'attack', tags: ['ranged', 'arrow'],
    ap: 1, cooldown: 0,
    levels: [{ dmg: 5 }],
    target: { type: 'unit', range: [1, 5], los: false, filter: 'enemy' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to a foe within 5, through walls and cover.'; },
    flavor: 'It goes through the wall, then through you. Nothing personal. It is barely even physical.',
    execute: function (ctx) {
      const u = ctx.user, t = ctx.targetUnit;
      if (!active(t)) return;
      ghostShot(u, t);
      DD.Act.damage(u, t, ctx.L.dmg, { skill: ctx.skill, tags: ['arrow'] });
    },
  });

  // Phase Shot (starter): every foe in a straight line, walls and units don't stop it. 1 AP and a point under Ghost
  // Arrow: worse on one foe, the pick once two line up (at 2 AP it only beat two plain arrows at three foes)
  skill({
    id: 'kir_phase', name: 'Phase Shot', icon: '👻', kind: 'attack', tags: ['ranged', 'arrow', 'aoe', 'pierce'],
    ap: 1, cooldown: 1,
    levels: [{ dmg: 4, len: 5 }, { dmg: 5, len: 5 }, { dmg: 6, len: 5 }],
    target: { type: 'tile', range: function (L) { return [1, L.len]; }, los: false, filter: 'any', straight: true },
    area: { shape: 'custom', fn: phaseLine },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to every foe in a straight line of ' + L.len + ' tiles, through walls and units.'; },
    flavor: 'The arrow has places to be. You are merely on the way.',
    execute: function (ctx) {
      const u = ctx.user, end = ctx.tiles[ctx.tiles.length - 1];
      if (end) {
        DD.FX.beam(u, end, { color: GHOST, width: 3 });
        DD.FX.projectile(u, end, { kind: 'arrow', color: GHOST_BLUE, trail: true, arc: 0, parallel: true });
      }
      ctx.foes.forEach(function (f) {
        if (!active(f)) return;
        DD.FX.particles(f, { kind: 'runes', color: GHOST, count: 6, parallel: true });
        DD.Act.damage(u, f, ctx.L.dmg, { skill: ctx.skill, tags: ['arrow', 'pierce'] });
      });
    },
  });

  // Ethereal Step (starter): straight-line teleport through walls and units
  skill({
    id: 'kir_step', name: 'Ethereal Step', icon: '🌀', kind: 'move', tags: ['move', 'teleport', 'ethereal'],
    ap: 1, cooldown: 1,
    levels: [{ len: 3 }, { len: 4 }, { len: 5 }],
    target: { type: 'tile', range: function (L) { return [1, L.len]; }, los: false, filter: 'empty', straight: true },
    desc: function (L) {
      return 'Teleport to an empty tile up to ' + L.len + ' tiles away in a straight line, through walls and units.';
    },
    flavor: 'Excuse me. Coming through. Through the wall. Through you. No, you don\'t get a free swing.',
    execute: function (ctx) {
      const u = ctx.user, p = ctx.target;
      if (!active(u) || !p) return;
      const from = { x: u.x, y: u.y };
      DD.FX.particles(from, { kind: 'runes', color: GHOST, count: 12 });
      if (DD.Act.teleport(u, p.x, p.y)) {
        DD.FX.particles(u, { kind: 'runes', color: GHOST_BLUE, count: 12, parallel: true });
        DD.Act.maybeBark(u, 'move', 0.3);
      }
    },
  });

  // Spirit Mark: Marked (the setup for everybody else's big hit)
  skill({
    id: 'kir_mark', name: 'Spirit Mark', icon: '🎯', kind: 'utility', tags: ['ranged', 'mark', 'debuff'],
    ap: 1, cooldown: 1,
    levels: [{ mark: 5 }, { mark: 7 }, { mark: 9 }],
    target: { type: 'unit', range: [1, 6], los: false, filter: 'enemy' },
    desc: function (L) { return 'Mark a foe within 6: the next damage it takes is +' + L.mark + '.'; },
    flavor: 'She marks it on both planes, so it can hide in neither.',
    execute: function (ctx) {
      const u = ctx.user, t = ctx.targetUnit;
      if (!active(t)) return;
      DD.FX.beam(u, t, { color: GHOST, width: 2 });
      DD.FX.particles(t, { kind: 'runes', color: GHOST, count: 10, parallel: true });
      DD.Act.addStatus(t, 'marked', { stacks: ctx.L.mark }, u);
    },
  });

  // Pinning Shot: damage + Root
  skill({
    id: 'kir_pin', name: 'Pinning Shot', icon: '📌', kind: 'attack', tags: ['ranged', 'arrow', 'root'],
    ap: 2, cooldown: 2,
    levels: [{ dmg: 7, turns: 1 }, { dmg: 9, turns: 1 }, { dmg: 10, turns: 2 }],
    target: { type: 'unit', range: [1, 5], los: false, filter: 'enemy' },
    desc: function (L) {
      return 'Deal ' + L.dmg + ' damage to a foe within 5 and Root it for its next ' + (L.turns > 1 ? L.turns + ' turns' : 'turn') + '.';
    },
    flavor: 'Stay. Stay. Good monster.',
    execute: function (ctx) {
      const u = ctx.user, t = ctx.targetUnit;
      if (!active(t)) return;
      ghostShot(u, t, { color: GHOST_BLUE });
      DD.Act.damage(u, t, ctx.L.dmg, { skill: ctx.skill, tags: ['arrow', 'root'] });
      if (active(t)) DD.Act.addStatus(t, 'root', { turns: ctx.L.turns }, u);
    },
  });

  // Banishing Shot: damage + push
  skill({
    id: 'kir_banish', name: 'Banishing Shot', icon: '💨', kind: 'attack', tags: ['ranged', 'arrow', 'push'],
    ap: 1, cooldown: 2,
    levels: [{ dmg: 3, push: 2 }, { dmg: 4, push: 2 }, { dmg: 5, push: 3 }],
    target: { type: 'unit', range: [1, 4], los: false, filter: 'enemy' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to a foe within 4 and push it ' + L.push + ' tiles away from Kiri.'; },
    flavor: 'Not a push. A firm suggestion that it exist somewhere else.',
    execute: function (ctx) {
      const u = ctx.user, t = ctx.targetUnit;
      if (!active(t)) return;
      ghostShot(u, t, { arc: 0 });
      DD.Act.damage(u, t, ctx.L.dmg, { skill: ctx.skill, tags: ['arrow', 'push'] });
      if (active(t)) DD.Act.knockback(u, t, ctx.L.push);
    },
  });

  // Haunted Volley: small area
  skill({
    id: 'kir_volley', name: 'Haunted Volley', icon: '🌠', kind: 'attack', tags: ['ranged', 'arrow', 'aoe'],
    ap: 2, cooldown: 2,
    levels: [{ dmg: 4 }, { dmg: 5 }, { dmg: 6 }],
    target: { type: 'tile', range: [1, 5], los: false, filter: 'any' },
    area: { shape: 'circle', size: 1 },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to every foe within 1 of a tile within 5.'; },
    flavor: 'Arrows from both sides of reality. Mostly this side. Still hurts.',
    execute: function (ctx) {
      const u = ctx.user, p = ctx.target;
      if (!p) return;
      [[0, 0], [1, 0], [0, 1]].forEach(function (o, i) {
        DD.FX.projectile(u, { x: p.x + o[0] * 0.4, y: p.y + o[1] * 0.4 }, { kind: 'arrow', color: i === 1 ? GHOST_BLUE : GHOST, arc: 0.7, parallel: i > 0 });
      });
      ctx.tiles.forEach(function (q, i) { DD.FX.tile(q.x, q.y, 'glow', { color: GHOST, parallel: i > 0 }); });
      ctx.foes.forEach(function (f) {
        if (active(f)) DD.Act.damage(u, f, ctx.L.dmg, { skill: ctx.skill, tags: ['arrow', 'aoe'] });
      });
    },
  });

  // Arrow from Beyond: the big one; it lands at the start of her next turn, wherever the target is. Its number is
  // L.arrow, not L.dmg: AutoPlay / AI estimates read L.dmg as damage dealt now, and nothing lands now (aiScore values it).
  skill({
    id: 'kir_beyond', name: 'Arrow from Beyond', icon: '☄️', kind: 'attack', tags: ['ranged', 'arrow', 'delayed'],
    ap: 3, cooldown: 2,
    levels: [{ arrow: 18 }, { arrow: 22 }, { arrow: 26 }],
    // objects: false — its arrow lands on her next turn; a barrel is a job for Ghost Arrow
    target: { type: 'unit', range: [1, 7], los: false, filter: 'enemy', objects: false },
    desc: function (L) { return 'A foe within 7 takes ' + L.arrow + ' damage at the start of Kiri\'s next turn, wherever it is.'; },
    flavor: 'She fired it yesterday, spiritually. It has been on its way the whole time.',
    aiScore: function (ctx) {
      const t = ctx.targetUnit, L = ctx.L || {};
      if (!active(t) || has(t, 'kir_incoming')) return 0;
      return Math.min(L.arrow || 0, (t.hp || 0) + (t.block || 0)) * 0.9;
    },
    execute: function (ctx) {
      const u = ctx.user, t = ctx.targetUnit;
      if (!active(t)) return;
      DD.FX.projectile(u, { x: u.x - 1, y: u.y - 1, h: 9 }, { kind: 'arrow', color: GHOST, trail: true, arc: 0 });
      DD.FX.particles(u, { kind: 'runes', color: GHOST, count: 10, parallel: true });
      DD.FX.text(t, '☄️ Something is coming…', { color: GHOST, size: 14 });
      DD.Act.addStatus(t, 'kir_incoming', { stacks: ctx.L.arrow }, u);
    },
  });

  // Fade Out: Kiri slips half into the ethereal plane (Stealth through her next turn)
  skill({
    id: 'kir_fade', name: 'Fade Out', icon: '👤', kind: 'buff', tags: ['buff', 'stealth', 'ethereal'],
    ap: 1, cooldown: function (L) { return L.cd; },
    levels: [{ cd: 3, cleanse: 0 }, { cd: 2, cleanse: 0 }, { cd: 2, cleanse: 1 }],
    target: { type: 'self', los: false },
    desc: function (L) {
      return 'Kiri is Stealthed until the end of her next turn: enemies ignore her' + (L.cleanse ? ', and she sheds her debuffs.' : '.');
    },
    flavor: 'She was here a second ago. She would like you to remember that fondly.',
    execute: function (ctx) {
      const u = ctx.user;
      if (!active(u)) return;
      DD.FX.particles(u, { kind: 'runes', color: GHOST, count: 14 });
      if (ctx.L.cleanse) DD.Act.cleanse(u, 'debuff');
      DD.Act.addStatus(u, 'stealth', { turns: 1 }, u);
    },
  });

  // Mist Opportunity: line-of-sight-blocking mist (her own skills ignore it)
  skill({
    id: 'kir_mist', name: 'Mist Opportunity', icon: '☁️', kind: 'utility', tags: ['terrain', 'surface', 'mist'],
    ap: 1, cooldown: 3,
    levels: [{ r: 1, turns: 2 }, { r: 1, turns: 3 }, { r: 2, turns: 3 }],
    target: { type: 'tile', range: [0, 5], los: false, filter: 'any' },
    area: { shape: 'circle', size: function (L) { return L.r; } },
    // one breath: the surface skip is said, Kiri seeing through it is her passive (and the flavor)
    desc: function (L) {
      return 'Ghost mist blocks line of sight around a tile within 5 (radius ' + L.r + ', for ' + L.turns +
        ' rounds, not over other surfaces).';
    },
    flavor: 'Enemies cannot see through it. Kiri never needed to.',
    execute: function (ctx) {
      const L = ctx.L;
      DD.FX.particles(ctx.target, { kind: 'smoke', color: GHOST, count: 18 });
      ctx.tiles.forEach(function (q, i) {
        const tl = DD.Grid.tile(q.x, q.y);
        if (!tl || tl.surface) return;
        if (DD.Act.setSurface(q.x, q.y, 'kir_ghost_mist', L.turns)) DD.FX.tile(q.x, q.y, 'glow', { color: GHOST, parallel: i > 0 });
      });
    },
  });

  // Signature: Rain from the Other Side
  skill({
    id: 'kir_signature', name: 'Rain from the Other Side', icon: '🌌', kind: 'attack', tags: ['ranged', 'arrow', 'aoe'],
    ap: 2, cooldown: 0, hype: 100,
    levels: [{ dmg: 16 }],
    target: { type: 'tile', range: [0, 6], los: false, filter: 'any' },
    area: { shape: 'circle', size: 2 },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to every foe within 2 of a tile within 6, ignoring Block and armor.'; },
    flavor: 'Every arrow she ever lost in the ethereal plane, returned at once. With interest.',
    execute: function (ctx) {
      const u = ctx.user, p = ctx.target;
      if (!p) return;
      DD.FX.banner('RAIN FROM THE OTHER SIDE', { sub: 'Look up. Then look nowhere.', color: GHOST, ms: 900 });
      DD.FX.flash('#d9d0ff', 260);
      DD.FX.shake(9, 450);
      ctx.tiles.forEach(function (q, i) {
        DD.FX.projectile(sky(q), q, { kind: 'arrow', color: i % 2 ? GHOST_BLUE : GHOST, arc: 0, parallel: i > 0 });
        DD.FX.tile(q.x, q.y, 'glow', { color: GHOST_DEEP, parallel: true });
      });
      DD.FX.particles(p, { kind: 'runes', color: GHOST, count: 30, parallel: true });
      ctx.foes.forEach(function (f) {
        if (active(f)) DD.Act.damage(u, f, ctx.L.dmg, { skill: ctx.skill, tags: ['arrow', 'aoe'], ignoreBlock: true, ignoreArmor: true });
      });
    },
  });

  // ---- items ------------------------------------------------------------------------------------------
  DD.registerItem({
    id: 'kir_ghostwood_bow', name: 'Ghostwood Longbow', slot: 'weapon', rarity: 'rare', icon: '🏹', hero: HERO,
    stats: { dmg: 0.1, range: 1 },
    desc: '+10% damage. +1 range to skills with a range of 2 or more.',
    flavor: 'Carved from a tree that is still haunting the forest about it.',
    hooks: {},
  });
  DD.registerItem({
    id: 'kir_name_tag', name: '"Hello, I\'m the Elf One" Name Tag', slot: 'trinket', rarity: 'rare', icon: '🏷️', hero: HERO,
    stats: { init: 2, hp: 4 },
    desc: '+2 initiative, +4 max HP.',
    flavor: 'It has not reduced the number of questions. It has added "which half wrote the tag?"',
    hooks: {},
  });
  DD.registerItem({
    id: 'kir_cloak_elsewhere', name: 'Cloak of Being Somewhere Else', slot: 'armor', rarity: 'legendary', icon: '🧥', hero: HERO,
    stats: { hp: 6, armor: 1 },
    desc: '+6 max HP, +1 armor. Ethereal Step costs 0 AP.',
    flavor: 'Half of it is in the ethereal plane at all times. The half with the pockets, unfortunately.',
    hooks: {
      modifyCost: function (c) { if (c && c.skill && c.skill.id === 'kir_step') c.ap = 0; },
    },
  });

  // ---- the hero -----------------------------------------------------------------------------------------
  DD.registerHero({
    id: HERO, name: 'Kiri', epithet: 'the Half-There', race: 'Half-Elf', cls: 'Ranger',
    role: 'Ranged precision & ethereal mobility', complexity: 2,
    blurb: 'A half-elven ranger whose arrows take a shortcut through the ethereal plane, walls notwithstanding. ' +
      'She steps through stone, vanishes mid-conversation and has been asked "so are you the elf one or the human one?" four hundred times. ' +
      'She is the tired one.',
    color: '#8a9bff',
    unlock: null,
    stats: { hp: 24, ap: 3, mov: 4, armor: 0, init: 3 },
    growth: { hp: 4 },
    flags: {},
    sprite: KIR_SPRITE,
    basic: 'kir_basic',
    signature: 'kir_signature',
    passive: {
      name: 'Between Worlds',
      desc: 'Kiri\'s own skills ignore line of sight: walls, pillars, trees and smoke don\'t stop her. She aims through the ethereal plane.',
      // the rule itself is data (every Kiri skill has target.los === false; a generic skill from a tome keeps its own
      // rule, hence "own"); these hooks deliver Arrow from Beyond (+ one cosmetic bark)
      hooks: {
        onTurnStart: function (unit) { landArrows(unit); },
        onDowned: function (unit) { fizzleArrows(unit); },
        // cosmetic: she walked off a foe like a mortal and paid for it (fired on the mover's own sources)
        onOpportunityAttack: function (o) {
          if (o && o.mover && o.mover.defId === HERO && o.dealt > 0 && active(o.mover)) DD.Act.maybeBark(o.mover, 'provoked', 0.5);
        },
      },
    },
    startingSkills: ['kir_phase', 'kir_step'],
    skillPool: ['kir_phase', 'kir_step', 'kir_mark', 'kir_pin', 'kir_banish', 'kir_volley', 'kir_beyond', 'kir_fade', 'kir_mist'],
    summons: [],
    barks: {
      select: ['Kiri. Half-elf. Yes, both halves came.', 'I\'m the elf one. And the human one. Moving on.', 'Name a target. Walls optional.',
        'I\'ll be over there. Or through there.', 'Ranger reporting. Don\'t ask which half.'],
      start: ['They brought cover. Adorable.', 'Nobody move. I\'m aiming through the wall.', 'Stay out of my line. Or don\'t. It goes through you.',
        'Roll for initiative. I already know mine.', 'Someone explain the plan to Marwyn. Slowly.'],
      move: ['Excuse me. Coming through. Literally.', 'Walls are a suggestion.', 'I was never here.', 'Repositioning. Quietly. Unlike some people.'],
      kill: ['Didn\'t see it coming. Nobody does.', 'Through and through.', 'Clean shot. Next.', 'That one\'s on the other side now. Say hi.',
        'The wall didn\'t help you, did it?'],
      hurt: ['Rude.', 'That was my human half. It bruises.', 'Ow. Noted. Filed. Avenged later.', 'I\'m fine. Mostly ethereal.'],
      lowhp: ['Fading. Not the cool way.', 'Halfway to the other side. Literally.', 'Little help? I\'m running out of halves.',
        'Josiah, Ellaria, anyone. Now would be nice.'],
      downed: ['Tell them... I was the elf one...', 'Going ethereal. Permanently-ish.', 'Don\'t let Buga loot my quiver.',
        'See you on the other side. I mean that literally.'],
      revive: ['Back. The other side was boring.', 'Apparently I looked very peaceful.', 'Both halves present. Let\'s go.',
        'Thanks. Don\'t make it weird.'],
      ally_down: ['Hero down! Elf, human or toast: get up!', 'Hold on. I\'ll cover you through the wall.',
        'Stay out of the light. I know the people there.', 'They\'ll pay for that. From very far away.'],
      levelup: ['Better aim. Same attitude.', 'Stronger now. Still not answering the elf question.', 'New trick: being even harder to find.',
        'Growth. Gross. Fine.'],
      victory: ['Done. Who\'s buying?', 'Clean. Quiet. Professional. Unlike Marwyn.', 'Collect your arrows. Oh right, mine are in another plane.',
        'Nobody even saw me. As intended.', 'Walls: 0. Me: all of it.'],
      idle: ['No, I can\'t pick which half. I\'ve tried.', 'My arrows come back eventually. Different plane, slow mail.',
        'Syllamin, call me "Legolas" again and I miss. On purpose.', 'Professor Marbles is asleep standing up. Respect.',
        'I can hear the ghosts. They\'re bored too.'],
      signature: ['Rain from the Other Side!', 'Duck. Not that it\'ll help.', 'The other side sends its regards!',
        'Every arrow I ever lost. Returning now.', 'Look up. Then look nowhere.'],
      // extra key (passive hook): an attack of opportunity hit her as she walked off a foe
      provoked: ['Walked off like a mortal. Never again.', 'Should have stepped through. Noted.', 'That is what I get for using legs.',
        'Next time I leave through the wall.', 'Free swing, huh? Enjoy it. It was your last.'],
    },
  });

  /** Small public surface for tests and other content (read-only helpers). */
  DD.Kiri = {
    GHOST: GHOST,
    phaseLine: phaseLine,
    pendingArrows: pendingArrows,
    landArrows: landArrows,
    fizzleArrows: fizzleArrows,
  };
})();
