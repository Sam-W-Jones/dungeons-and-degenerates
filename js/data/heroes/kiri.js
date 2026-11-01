/* Dungeons and Degenerates — js/data/heroes/kiri.js
 * Hero: KIRI, THE HALF-THERE — half-elven ranger (she/her) whose arrows, and occasionally Kiri herself, take a shortcut
 * through the ethereal plane. v2-native (initiative, no telegraphs), DESIGN §6 "Kiri" + "Simplicity".
 * Passive "Between Worlds": her skills ignore line of sight (every Kiri skill has target.los === false).
 * Arrow from Beyond puts the status kir_incoming (stacks = damage) on a foe; Kiri's passive hooks land those arrows at
 * the start of her next turn (onTurnStart) and fizzle them if she goes down first (onDowned).
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

  /** Phase Shot's line: the `len` tiles straight ahead of the user (in bounds), walls and units notwithstanding. */
  function phaseLine(ctx) {
    const u = ctx && ctx.user, d = ctx && ctx.dir;
    if (!u || !d || (!d.x && !d.y)) return [];
    const len = Math.max(1, Math.round(+(ctx.L && ctx.L.len) || 5));
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
  DD.registerStatus({
    id: 'kir_incoming', name: 'Arrow from Beyond', icon: '☄️', color: GHOST, type: 'debuff', stacking: 'stack', maxStacks: 99,
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
  DD.registerSurface({
    id: 'kir_ghost_mist', name: 'Ghost Mist', color: 'rgba(170,155,255,0.38)', turns: 2, blocksLos: true,
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
   * In front: half-elf ear tips poking out through the hood (the painter hides 'pointy' ears under a hood) and a quiver
   * of ghost-lit arrows slung over the cloak, fletchings out behind her back shoulder.
   */
  function kirOverlay(g, t, o) {
    if (!g || (o && o.lying >= 0.5)) return;
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
    bling: [], extras: ['cape', 'belt', 'bandolier'],
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

  // Phase Shot (starter): every foe in a straight line, walls and units don't stop it
  skill({
    id: 'kir_phase', name: 'Phase Shot', icon: '👻', kind: 'attack', tags: ['ranged', 'arrow', 'aoe', 'pierce'],
    ap: 2, cooldown: 1,
    levels: [{ dmg: 5, len: 5 }, { dmg: 6, len: 5 }, { dmg: 8, len: 5 }],
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
    flavor: 'Excuse me. Pardon me. Coming through. Through the wall. Through you. Sorry.',
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

  // Arrow from Beyond: the big one; it lands at the start of her next turn, wherever the target is
  skill({
    id: 'kir_beyond', name: 'Arrow from Beyond', icon: '☄️', kind: 'attack', tags: ['ranged', 'arrow', 'delayed'],
    ap: 3, cooldown: 2,
    levels: [{ dmg: 18 }, { dmg: 22 }, { dmg: 26 }],
    target: { type: 'unit', range: [1, 7], los: false, filter: 'enemy' },
    desc: function (L) { return 'Pick a foe within 7: at the start of Kiri\'s next turn it takes ' + L.dmg + ' damage, wherever it is.'; },
    flavor: 'She fired it yesterday, spiritually. It has been on its way the whole time.',
    aiScore: function (ctx) {
      const t = ctx.targetUnit, L = ctx.L || {};
      if (!active(t) || has(t, 'kir_incoming')) return 0;
      return Math.min(L.dmg || 0, (t.hp || 0) + (t.block || 0)) * 0.9;
    },
    execute: function (ctx) {
      const u = ctx.user, t = ctx.targetUnit;
      if (!active(t)) return;
      DD.FX.projectile(u, { x: u.x - 1, y: u.y - 1, h: 9 }, { kind: 'arrow', color: GHOST, trail: true, arc: 0 });
      DD.FX.particles(u, { kind: 'runes', color: GHOST, count: 10, parallel: true });
      DD.FX.text(t, '☄️ Something is coming…', { color: GHOST, size: 14 });
      DD.Act.addStatus(t, 'kir_incoming', { stacks: ctx.L.dmg }, u);
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
    desc: function (L) {
      return 'Ghost mist fills radius ' + L.r + ' around a tile within 5 for ' + L.turns + ' rounds (not over other surfaces). ' +
        'It blocks line of sight, except Kiri\'s.';
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
      desc: 'Kiri\'s skills ignore line of sight: walls, pillars, trees and smoke don\'t stop her. She aims through the ethereal plane.',
      // the rule itself is data (every Kiri skill has target.los === false); these hooks deliver Arrow from Beyond
      hooks: {
        onTurnStart: function (unit) { landArrows(unit); },
        onDowned: function (unit) { fizzleArrows(unit); },
      },
    },
    startingSkills: ['kir_phase', 'kir_step'],
    skillPool: ['kir_phase', 'kir_step', 'kir_mark', 'kir_pin', 'kir_banish', 'kir_volley', 'kir_beyond', 'kir_fade', 'kir_mist'],
    summons: [],
    barks: {
      select: ['Kiri. Half-elf. Yes, both halves came.', 'I\'m the elf one. And the human one. Moving on.', 'Point me at it. Walls optional.',
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
      ally_down: ['Hero down! Elf, human or toast: get up!', 'Hold on. I\'ll cover you through the wall.', 'Someone get them up. I\'ll make room.',
        'They\'ll pay for that. From very far away.'],
      levelup: ['Better aim. Same attitude.', 'Leveled up. Still not answering the elf question.', 'New trick: being even harder to find.',
        'Growth. Gross. Fine.'],
      victory: ['Done. Who\'s buying?', 'Clean. Quiet. Professional. Unlike Marwyn.', 'Collect your arrows. Oh right, mine are in another plane.',
        'Nobody even saw me. As intended.', 'Walls: 0. Me: all of it.'],
      idle: ['No, I can\'t pick which half. I\'ve tried.', 'My arrows come back eventually. Different plane, slow mail.',
        'Syllamin, call me "Legolas" again and I miss. On purpose.', 'Professor Marbles is asleep standing up. Respect.',
        'I can hear the ghosts. They\'re bored too.'],
      signature: ['Rain from the Other Side!', 'Duck. Not that it\'ll help.', 'The other side sends its regards!',
        'Every arrow I ever lost. Returning now.', 'Look up. Then look nowhere.'],
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
