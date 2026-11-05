/* Dungeons and Degenerates — js/data/heroes/valdris.js
 * Hero: VALDRIS, THE WELL-CONDITIONED — human forge cleric (he/him) with long, golden, somehow soot-free hair. He forges
 * weapons and armour for the party mid-fight and hits things with an unreasonably large hammer. v2-native (initiative,
 * no telegraphs, no Guard, attacks of opportunity: his hammer is melee, so he holds the line). DESIGN §6 "Valdris" +
 * "Simplicity": one verb per skill; the power is in the combinations (Burning, Block, Thorns, pushes, Stun, Dazzle).
 * Passive "Strike While the Iron's Hot": his hits on Burning foes deal +3. His attacks of opportunity get it through
 * modifyOpportunity (o.flat), so the HUD's move preview and the AI's estimates see it.
 * Forge statuses: val_forged "Freshly Forged" (+N damage with every hit until the end of its next turn; attacks of
 * opportunity through modifyOpportunity) and val_flame_edge "Flame-Forged Edge" (its next damaging skill sets each foe it
 * hits Burning N, then it is spent).
 * Registers: hero valdris, 11 skills, 2 statuses, 3 items (all ids val_*).
 */
(function () {
  'use strict';
  const DD = window.DD;

  const HERO = 'valdris';
  const IRON = 3;                        // Strike While the Iron's Hot: +3 damage to Burning foes
  const FORGED = 'val_forged', EDGE = 'val_flame_edge';
  const BRIGHTFORGE = 'val_brightforge', EDGE_SKILL = 'val_flame_edge';   // Brightforge makes this skill free
  const EMBER = '#ff8a2a', GOLD = '#f2c14e', HOLY = '#fff1b8', STEEL = '#cfd6dd', SPARK = '#ffd27a';

  // ---- helpers ------------------------------------------------------------------------------------
  function active(u) { return !!u && !u.dead && !u.downed; }
  function has(u, id) { return DD.Act.hasStatus(u, id); }
  function hostile(a, b) { return !!a && !!b && DD.Grid.hostile(a, b); }
  function dist(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }
  /** The status instance st sits on unit u (status hooks fire for an attacker's and a mover's sources alike). */
  function holds(u, st) { return !!u && !!st && Array.isArray(u.statuses) && u.statuses.indexOf(st) >= 0; }
  function isValdris(u) { return !!u && u.kind === 'hero' && u.defId === HERO; }
  function left(st) { return st && st.turns > 0 ? ' (' + st.turns + ' turn' + (st.turns === 1 ? '' : 's') + ' left)' : ''; }
  /**
   * A hit of its own skill on a foe. Attacks of opportunity are left out: their bonus goes through modifyOpportunity
   * (o.flat), which every estimate reads; adding it here as well would count it twice.
   */
  function skillHit(d) {
    return !!d && d.cause === 'skill' && !d.opportunity && !!d.source && !!d.target && d.target !== d.source && hostile(d.source, d.target);
  }
  function hasItem(u, id) { return !!u && Array.isArray(u.items) && u.items.indexOf(id) >= 0; }

  /** How far a unit can strike on its next turn (a walk plus its longest damaging skill): aiScore helpers. */
  function strikeReach(u) {
    let best = 1;
    DD.Combat.slotsOf(u).forEach(function (sl) {
      const d = DD.getSkill(sl.id);
      if (!d || (u.signature && sl === u.signature)) return;
      const L = DD.skillLevel(d, sl.level || 1);
      if (!L || !(L.dmg > 0)) return;
      const r = DD.Targeting.range(u, d, sl.level || 1);
      if (r && r[1] > best) best = r[1];
    });
    return (u.mov || 3) + best;
  }
  /** Foes this ally could hit on its next turn (a rough count for aiScore). */
  function foesInReach(u) {
    if (!active(u)) return [];
    const r = strikeReach(u);
    return DD.Combat.foesOf(u).filter(function (f) { return active(f) && dist(f, u) <= r; });
  }
  /** Does the unit hit several foes at once (an area damage skill socketed)? Weapon buffs pay per hit. */
  function hitsArea(u) {
    return DD.Combat.slotsOf(u).some(function (sl) {
      const d = DD.getSkill(sl.id);
      const L = d && DD.skillLevel(d, sl.level || 1);
      return !!(L && L.dmg > 0 && d.area && d.area.shape && d.area.shape !== 'single');
    });
  }

  // ---- statuses -------------------------------------------------------------------------------------------
  DD.registerStatus({
    id: FORGED, name: 'Freshly Forged', icon: '⚒️', color: '#ffb347', type: 'buff', stacking: 'refresh', maxStacks: 9,
    decay: 'turnEnd', defaultTurns: 1,
    desc: function (st) {
      return 'Deals +' + ((st && st.stacks) || 1) + ' damage with every hit, attacks of opportunity included.' + left(st);
    },
    // a flat change of its damage numbers (wind-up and reach estimates, should a foe ever carry it)
    telegraphFlat: function (st) { return (st && st.stacks) || 0; },
    hooks: {
      modifyOutgoingDamage: function (d, st) { if (skillHit(d) && holds(d.source, st)) d.flat += st.stacks || 0; },
      // pure: the HUD's move preview, paths and the AI's attack-of-opportunity estimates read it
      modifyOpportunity: function (o, st) { if (o && holds(o.attacker, st)) o.flat += st.stacks || 0; },
    },
  });

  /** The holder's own skill is resolving (so the edge is spent when it ends), else the hit came from outside one. */
  function inOwnSkill(u) { const sk = DD.Act.currentSkill(); return !!sk && sk.user === u; }
  DD.registerStatus({
    id: EDGE, name: 'Flame-Forged Edge', icon: '♨️', color: EMBER, type: 'buff', stacking: 'refresh', maxStacks: 9,
    decay: 'never', defaultTurns: -1,
    desc: function (st) { return 'Its next damaging skill sets each foe it hits Burning ' + ((st && st.stacks) || 1) + '.'; },
    hooks: {
      onDealDamage: function (d, st) {
        const u = d && d.source, f = d && d.target;
        if (!skillHit(d) || !holds(u, st) || !(d.amount > 0)) return;
        st.data.hit = st.data.hit || {};
        st.data.spent = true;
        if (!st.data.hit[f.id] && active(f) && f.hp > 0) {
          st.data.hit[f.id] = 1;
          DD.FX.particles(f, { kind: 'fire', count: 8, parallel: true });
          DD.Act.addStatus(f, 'burn', { stacks: st.stacks || 1 }, u);
        }
        // damage from outside a skill resolution (a delayed arrow landing at a turn start): spent at once
        if (!inOwnSkill(u)) DD.Act.removeStatus(u, EDGE, { text: '♨️ Edge spent' });
      },
      onSkillUsed: function (ctx, st) {
        if (ctx && !ctx.opportunity && st && st.data && st.data.spent && holds(ctx.user, st)) DD.Act.removeStatus(ctx.user, EDGE, { text: '♨️ Edge spent' });
      },
    },
  });

  // ---- sprite -------------------------------------------------------------------------------------------
  // Armoured human cleric: chainmail (stocky 'armor' outfit) under a leather forge apron, long flowing golden hair with a
  // shine, blue eyes, a holy anvil charm, a very big smithing hammer and an ember glow.
  const VAL_PAL = {
    skin: '#f2c8a2', cloth: '#6e4327', cloth2: '#d4a02a', hair: '#f4cf62', beard: '#a8782a', metal: '#aab3bd', eye: '#3f78c4',
    accent: EMBER, outline: '#1e140e', leather: '#5a3820', belt: '#4a2e1a', wood: '#7a5230', boots: '#3a2a20',
    apron: '#7a4b2b', hammer: '#8d97a3', haft: '#7a5230',
  };
  const STOCKY = { w: 16.5, th: 11.5, aw: 4.3 };   // sprites.js BUILDS.stocky (arm / hand geometry for the hammer)
  function smooth(t) { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  /**
   * Where sprites.js puts the front hand and how it turns a 'hammer' (paintHumanoid / armAngles / itemRotation with
   * ITEM_INFO.hammer = { idle: 0.75 }), so the big hammer head is drawn over the stock one. The idle sway (±0.05 rad)
   * isn't known here; the bigger head covers the difference.
   */
  function hammerGrip(g) {
    const H = g.head, shY = H.y + H.r * 0.8;   // the head centre sits 0.8 r above the shoulders (breathing aside)
    const fs = { x: STOCKY.w / 2 - STOCKY.aw * 0.35, y: shY + STOCKY.aw * 0.75 + 0.4 };
    const armL = STOCKY.th * 0.62 + 3.6, rest = 1.2, idle = 0.75;
    let fa = rest, R = idle;
    if (g.pose === 'attack') {
      const p = g.poseT;
      if (p === undefined || p === null) fa = 0.05;
      else if (p < 0.3) fa = lerp(rest, -2.1, smooth(p / 0.3));
      else if (p < 0.55) fa = lerp(-2.1, 0.55, smooth((p - 0.3) / 0.25));
      else fa = lerp(0.55, rest, smooth((p - 0.55) / 0.45));
      const swing = fa + Math.PI / 2 - 0.4;
      R = p !== undefined && p !== null && p > 0.55 ? lerp(swing, idle, smooth((p - 0.55) / 0.45)) : swing;
    } else if (g.pose === 'cast') { fa = -0.75; R = idle - 0.3; } else if (g.pose === 'hurt') { fa = -1.0; R = idle - 0.6; }
    return { x: fs.x + Math.cos(fa) * armL, y: fs.y + Math.sin(fa) * armL, r: R };
  }
  /**
   * The unreasonably large hammer: a long haft and a big blocky sledge head with a gold anvil sigil, painted over the
   * stock one in the same frame (sprites.js drawItem: translate to the hand, rotate, scale 1.1). The stock head
   * (−5.2..5.2 × −14.6..−9.2) and haft (0, 6 → 0, −10) sit inside this one.
   */
  function bigHammer(g, t) {
    const c = g.ctx, h = hammerGrip(g), pal = g.pal, lw0 = g.lw;
    c.save();
    c.translate(h.x, h.y);
    c.rotate(h.r);
    c.scale(1.1, 1.1);
    g.lw = lw0 * 0.75;
    g.limb(0, 7.6, 0, -9.6, 2.3, pal.haft);
    g.line(0.45, 6.4, 0.45, -8.6, g.shade(pal.haft, 0.25), 0.6);
    g.rect(-1.75, 4.6, 3.5, 2.4, pal.leather, undefined, 0.5);          // leather grip wrap
    // head: a blocky smithing sledge with two flat striking faces and a gold collar round the haft
    g.shaded(function (p) {
      p.moveTo(-6.4, -17.2); p.lineTo(6.4, -17.2); p.lineTo(7.1, -16.5); p.lineTo(7.1, -9.4); p.lineTo(6.4, -8.7);
      p.lineTo(-6.4, -8.7); p.lineTo(-7.1, -9.4); p.lineTo(-7.1, -16.5); p.closePath();
    }, pal.hammer, { dx: 0.7, dy: -0.8, hl: [-2.2, -15.8, 3.2, 0.7] });
    g.rect(-8.9, -17.8, 2.2, 9.7, g.shade(pal.hammer, -0.28), undefined, 0.5);   // striking faces
    g.rect(6.7, -17.8, 2.2, 9.7, g.shade(pal.hammer, -0.28), undefined, 0.5);
    g.rect(-1.9, -9.3, 3.8, 1.9, pal.cloth2, undefined, 0.45);                  // gold collar
    g.poly([[-2.2, -15.3], [2.3, -15.3], [3.1, -14.4], [1, -14.2], [1.2, -12.8], [2.2, -11.7], [-2.2, -11.7], [-1.2, -12.8],
      [-1, -14.2], [-2.2, -14.4]], pal.cloth2, g.shade(pal.cloth2, -0.45), 0.45);   // gold anvil sigil
    const hot = 0.45 + 0.25 * Math.sin(t * 2.6);
    g.glow(-8, -13, 4.4, EMBER, hot * 0.6);                              // one face is always a little warm
    g.lw = lw0;
    c.restore();
    // the gauntlet over the haft
    g.circle(h.x, h.y, STOCKY.aw * 0.64, g.shade(pal.metal, -0.1));
  }
  /** Leather forge apron over the chainmail, a tool loop and a holy anvil charm on a chain. */
  function apron(g, shY, t) {
    const pal = g.pal;
    g.shaded(function (p) {
      p.moveTo(-4.6, shY + 3.2); p.lineTo(4.6, shY + 3.2);
      p.quadraticCurveTo(6.2, shY + 9, 6.4, -2.6); p.lineTo(-6.4, -2.6);
      p.quadraticCurveTo(-6.2, shY + 9, -4.6, shY + 3.2);
      p.closePath();
    }, pal.apron, { dx: 1.1, dy: -1, hl: [1.6, shY + 5.2, 2.2, 0.9, -0.3] });
    g.line(-4.4, shY + 3.4, -7.2, shY + 0.6, pal.leather, 1.1);          // neck strap
    g.line(4.4, shY + 3.4, 7.2, shY + 0.6, pal.leather, 1.1);
    g.line(-2.6, shY + 9.4, -3.1, shY + 6.6, '#9aa3ad', 0.9);              // a chisel in the pocket
    g.rect(-3.6, shY + 9.2, 4.4, 3, g.shade(pal.apron, -0.14), g.shade(pal.apron, -0.5), 0.6);   // pocket
    // scorch marks (he is a smith)
    g.circle(3.2, shY + 11.5, 0.9, 'rgba(30,18,10,0.45)', null);
    g.circle(-4.2, -4.8, 0.7, 'rgba(30,18,10,0.4)', null);
    // holy anvil charm on a gold chain: a horned top, a narrow waist, a wide foot
    g.arc(0, shY - 0.6, 3.4, 0.25 * Math.PI, 0.75 * Math.PI, pal.cloth2, 0.8);
    const cy = shY + 3.6;
    g.poly([[-1.6, cy - 1.5], [1.9, cy - 1.5], [3.1, cy - 1.1], [1.6, cy - 0.5], [0.7, cy - 0.4], [0.7, cy + 0.6], [1.8, cy + 1.5],
      [-1.8, cy + 1.5], [-0.7, cy + 0.6], [-0.7, cy - 0.4], [-1.6, cy - 0.5]], pal.cloth2, g.outline, 0.55);
    g.glow(0, cy, 3.5, HOLY, 0.25 + 0.15 * Math.sin(t * 3.3));
  }
  /**
   * The hair (his pride): the stock 'long' cut gets volume — a golden mane spilling over the back shoulder to the
   * waist, a lock over the front shoulder (outside the face), a highlight streak and the odd twinkle.
   */
  function mane(g, t, lying) {
    const H = g.head, r = H.r, col = g.pal.hair, dk = g.shade(col, -0.18), hl = g.rgba(g.shade(col, 0.45), 0.85);
    const sway = Math.sin(t * 1.5) * r * 0.05;
    // back mane (behind the head side: -x), falling over the back shoulder
    g.path(function (p) {
      p.moveTo(H.x - r * 0.95, H.y - r * 0.3);
      p.quadraticCurveTo(H.x - r * 1.55, H.y + r * 0.6, H.x - r * 1.25 + sway, H.y + r * 2.15);
      p.quadraticCurveTo(H.x - r * 0.95 + sway, H.y + r * 2.35, H.x - r * 0.62, H.y + r * 2.0);
      p.quadraticCurveTo(H.x - r * 0.72, H.y + r * 1.2, H.x - r * 0.55, H.y + r * 0.62);
      p.closePath();
    }, dk, g.outline, Math.max(0.7, r * 0.09));
    g.line(H.x - r * 1.1, H.y + r * 0.5, H.x - r * 1.05 + sway, H.y + r * 1.8, g.shade(col, -0.32), Math.max(0.5, r * 0.05));
    // front lock over the front shoulder (well outside the eyes)
    g.path(function (p) {
      p.moveTo(H.x + r * 0.86, H.y - r * 0.2);
      p.quadraticCurveTo(H.x + r * 1.32, H.y + r * 0.55, H.x + r * 1.08 - sway, H.y + r * 1.62);
      p.quadraticCurveTo(H.x + r * 0.88 - sway, H.y + r * 1.75, H.x + r * 0.78, H.y + r * 1.5);
      p.quadraticCurveTo(H.x + r * 0.98, H.y + r * 0.8, H.x + r * 0.74, H.y + r * 0.2);
      p.closePath();
    }, col, g.outline, Math.max(0.7, r * 0.09));
    g.line(H.x + r * 1.02, H.y + r * 0.35, H.x + r * 1.0 - sway, H.y + r * 1.35, hl, Math.max(0.5, r * 0.06));
    // the shine: a highlight band across the crown and a twinkle
    g.arc(H.x - r * 0.15, H.y - r * 0.05, r * 0.9, Math.PI * 1.18, Math.PI * 1.42, hl, Math.max(0.8, r * 0.11));
    if (lying) return;
    const tw = Math.max(0, Math.sin(t * 1.9));
    if (tw > 0.55) g.star(H.x - r * 0.62, H.y - r * 0.78, r * 0.32 * (tw - 0.4), '#ffffff', null, 4, 0.3);
  }
  function valOverlay(g, t, o) {
    if (!g || !g.head) return;
    const lying = !!(o && o.lying >= 0.5);
    const shY = g.head.y + g.head.r * 0.8;
    apron(g, shY, t);
    bigHammer(g, t);
    mane(g, t, lying);
  }
  /** Embers drifting up at his heels: the forge goes where he goes. */
  function valUnderlay(g, t) {
    if (!g) return;
    g.ellipse(0, 0.5, 10.5, 3.8, g.rgba(EMBER, 0.16 + 0.05 * Math.sin(t * 2.1)), null);
    for (let i = 0; i < 3; i++) {
      const k = (t * 0.42 + i / 3) % 1;
      g.circle(-5 + i * 5 + Math.sin(t * 2 + i) * 1.2, -1 - k * 11, 0.9 * (1 - k) + 0.35, g.rgba(i === 1 ? SPARK : EMBER, 0.8 * (1 - k)), null);
    }
  }
  const VAL_SPRITE = {
    base: 'humanoid', scale: 1.06, palette: VAL_PAL, build: 'stocky', outfit: 'armor',
    head: { size: 1, ears: 'none', horns: 'none', hair: 'long', beard: 'stubble', hat: 'none', face: 'none', eyes: 'normal', mouth: 'grin', blush: false },
    wings: 'none', tail: 'none', mainhand: 'hammer', offhand: 'none',
    bling: [], extras: ['belt'],
    aura: { kind: 'glow', color: EMBER },
    overlay: valOverlay,
    underlay: valUnderlay,
  };

  // ---- skills -----------------------------------------------------------------------------------------------
  function skill(def) { def.owner = HERO; return DD.registerSkill(def); }
  /** A ringing hammer blow on the anvil (cosmetic). */
  function clang(at, n) {
    DD.FX.particles(at, { kind: 'sparks', color: SPARK, count: n || 10, parallel: true });
    DD.FX.sound('hit', { parallel: true });
  }

  // Basic: Percussive Maintenance — his hammer is melee, so it is also his attack of opportunity
  skill({
    id: 'val_basic', name: 'Percussive Maintenance', icon: '🔨', kind: 'attack', tags: ['melee', 'hammer'],
    ap: 1, cooldown: 0,
    levels: [{ dmg: 5 }],
    target: { type: 'unit', range: [1, 1], filter: 'enemy' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to an adjacent foe.'; },
    flavor: 'Fixing things by hitting them is a sacred smithing tradition. He applies it to goblins.',
    execute: function (ctx) {
      const u = ctx.user, t = ctx.targetUnit;
      if (!active(t) || t === u) return;
      if (ctx.opportunity) DD.Act.maybeBark(u, 'opportunity', 0.5);   // cosmetic: a foe tried to walk off him
      DD.FX.lunge(u, t);
      DD.Act.damage(u, t, ctx.L.dmg, { skill: ctx.skill, tags: ['melee', 'hammer'] });
      DD.FX.particles(t, { kind: 'sparks', color: SPARK, count: 8, parallel: true });
    },
  });

  // Flame-Forged Edge (starter): the ally's next damaging skill sets foes Burning (the setup for his passive)
  skill({
    id: 'val_flame_edge', name: 'Flame-Forged Edge', icon: '🗡️', kind: 'buff', tags: ['buff', 'fire', 'forge', 'burn'],
    ap: 1, cooldown: 1,
    levels: [{ burn: 3 }, { burn: 4 }, { burn: 5 }],
    target: { type: 'unit', range: [0, 3], los: false, filter: 'allyOrSelf' },
    desc: function (L) { return 'Valdris or an ally within 3: its next damaging skill sets each foe it hits Burning ' + L.burn + '.'; },
    flavor: 'Folded a thousand times, quenched in holy oil, then set on fire again. On purpose.',
    // the Burn lands later (on the ally's hit), so the dry run can't see it: worth it on someone with foes to hit
    aiScore: function (ctx) {
      const f = ctx.targetUnit, L = ctx.L || {};
      if (!active(f) || has(f, EDGE)) return 0;
      const fresh = foesInReach(f).filter(function (o) { return !has(o, 'burn') && !has(o, 'wet'); }).length;
      return fresh ? (L.burn || 0) * 2 : 0;
    },
    execute: function (ctx) {
      const u = ctx.user, f = ctx.targetUnit;
      if (!active(f)) return;
      if (f !== u) DD.FX.beam(u, f, { color: EMBER, width: 2 });
      clang(f, 10);
      DD.FX.particles(f, { kind: 'fire', count: 10, parallel: true });
      DD.FX.text(f, '♨️ Flame-forged!', { color: EMBER, size: 14, parallel: true });
      DD.Act.addStatus(f, EDGE, { stacks: ctx.L.burn }, u);
    },
  });

  // Forge Armour (starter): Block
  skill({
    id: 'val_forge_armour', name: 'Forge Armour', icon: '🛡️', kind: 'buff', tags: ['buff', 'block', 'forge'],
    ap: 1, cooldown: 1,
    levels: [{ block: 6 }, { block: 8 }, { block: 10 }],
    target: { type: 'unit', range: [0, 3], los: false, filter: 'allyOrSelf' },
    desc: function (L) { return 'Valdris or an ally within 3 gains ' + L.block + ' Block (until the start of its next turn).'; },
    flavor: 'Measured, hammered, riveted and polished in four seconds flat. The polishing took three of them.',
    execute: function (ctx) {
      const u = ctx.user, f = ctx.targetUnit;
      if (!active(f)) return;
      if (f !== u) DD.FX.beam(u, f, { color: STEEL, width: 2 });
      clang(f, 12);
      DD.Act.addBlock(f, ctx.L.block);
    },
  });

  // Forge Weapon: +N damage with every hit (allies only: he forges for the party)
  skill({
    id: 'val_forge_weapon', name: 'Forge Weapon', icon: '⚒️', kind: 'buff', tags: ['buff', 'forge'],
    ap: 1, cooldown: 1,
    levels: [{ bonus: 2 }, { bonus: 3 }, { bonus: 4 }],
    target: { type: 'unit', range: [1, 3], los: false, filter: 'ally' },
    desc: function (L) { return 'An ally within 3 deals +' + L.bonus + ' damage with every hit until the end of its next turn.'; },
    flavor: 'He sharpens your sword mid-swing. Please stop sharpening the sword mid-swing.',
    // the bonus pays on the ally's hits next turn, not in this dry run: about two hits, three for an area attacker
    aiScore: function (ctx) {
      const f = ctx.targetUnit, L = ctx.L || {};
      if (!active(f) || f === ctx.user) return 0;
      const st = DD.Act.getStatus(f, FORGED);
      if (st && st.stacks >= (L.bonus || 0)) return 0;
      if (!foesInReach(f).length) return 0;
      return (L.bonus || 0) * (hitsArea(f) ? 3 : 2);
    },
    execute: function (ctx) {
      const u = ctx.user, f = ctx.targetUnit;
      if (!active(f)) return;
      DD.FX.beam(u, f, { color: GOLD, width: 2 });
      clang(f, 12);
      DD.FX.text(f, '⚒️ Freshly forged!', { color: GOLD, size: 14, parallel: true });
      DD.Act.addStatus(f, FORGED, { stacks: ctx.L.bonus, turns: 1 }, u);
    },
  });

  // Spiked Pauldrons: Thorns (melee attackers pay for it; pairs with taunts and with holding the line)
  skill({
    id: 'val_spiked', name: 'Spiked Pauldrons', icon: '🦔', kind: 'buff', tags: ['buff', 'thorns', 'forge'],
    ap: 1, cooldown: 1,
    levels: [{ thorns: 3 }, { thorns: 4 }, { thorns: 5 }],
    target: { type: 'unit', range: [0, 3], los: false, filter: 'allyOrSelf' },
    desc: function (L) { return 'Valdris or an ally within 3 gains Thorns ' + L.thorns + ' through its next turn: adjacent attackers that hurt it take ' + L.thorns + '.'; },
    flavor: 'He added spikes. To the pauldrons, the gauntlets, the boots and, worryingly, the codpiece.',
    execute: function (ctx) {
      const u = ctx.user, f = ctx.targetUnit;
      if (!active(f)) return;
      if (f !== u) DD.FX.beam(u, f, { color: STEEL, width: 2 });
      clang(f, 8);
      DD.Act.addStatus(f, 'thorns', { stacks: ctx.L.thorns, turns: 1 }, u);
    },
  });

  // Temper: cleanse (III also mends). v2: Temper III is a single-target heal, so aimed at a downed ally it gets it back up
  // (the heal is its HP; target.revive opts in, canTarget keeps I-II, which don't heal, off the downed)
  skill({
    id: 'val_temper', name: 'Temper', icon: '💧', kind: 'utility', tags: ['cleanse', 'forge'],
    ap: 1, cooldown: function (L) { return L.cd; },
    levels: [{ cd: 2 }, { cd: 1 }, { cd: 1, heal: 5 }],
    target: {
      type: 'unit', range: [0, 3], los: false, filter: 'allyOrSelf', revive: true,
      canTarget: function (ctx) {
        const f = ctx.targetUnit;
        return f && f.downed && !(ctx.L && ctx.L.heal > 0) ? 'Only Temper III mends. Help them up first.' : true;
      },
    },
    desc: function (L) { return 'Valdris or an ally within 3 sheds all its debuffs' + (L.heal ? ' and heals ' + L.heal + ' HP.' : '.'); },
    flavor: 'Heat, hammer, quench. Your curse is now structurally sound and slightly steamy.',
    execute: function (ctx) {
      const u = ctx.user, f = ctx.targetUnit;
      if (!f || f.dead) return;
      // a downed ally is quenched back onto its feet first (the heal), then tempered
      const up = f.downed && ctx.L.heal > 0 ? DD.Act.heal(u, f, ctx.L.heal) : 0;
      if (!active(f)) return;
      DD.FX.particles(f, { kind: 'smoke', color: '#e8eef5', count: 12 });
      DD.FX.text(f, '💧 Tempered!', { color: '#bfe6ff', size: 14, parallel: true });
      DD.Act.cleanse(f, 'debuff');
      if (ctx.L.heal && !up) DD.Act.heal(u, f, ctx.L.heal);
    },
  });

  // Hammer of Faith: a big swing that knocks the foe away (pits, lava, water, allies' traps)
  skill({
    id: 'val_hammer_faith', name: 'Hammer of Faith', icon: '🙏', kind: 'attack', tags: ['melee', 'push', 'hammer'],
    ap: 2, cooldown: 1,
    levels: [{ dmg: 7, push: 2 }, { dmg: 9, push: 2 }, { dmg: 11, push: 3 }],
    target: { type: 'unit', range: [1, 1], filter: 'enemy' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to an adjacent foe and push it ' + L.push + ' tiles away.'; },
    flavor: 'He believes very hard. Then he swings very hard. The order matters to him; not to the goblin.',
    execute: function (ctx) {
      const u = ctx.user, t = ctx.targetUnit;
      if (!active(t) || t === u) return;
      DD.FX.lunge(u, t);
      DD.FX.flash(HOLY, 90);
      clang(t, 14);
      DD.Act.damage(u, t, ctx.L.dmg, { skill: ctx.skill, tags: ['melee', 'hammer', 'push'] });
      if (active(t)) DD.Act.push(u, t, DD.util.dirTo(u, t), ctx.L.push);
    },
  });

  // Molten Spray: a cone of molten metal (fire: foes Burn, oil and clouds ignite)
  skill({
    id: 'val_molten', name: 'Molten Spray', icon: '🌋', kind: 'attack', tags: ['fire', 'aoe', 'cone', 'burn'],
    ap: 2, cooldown: 2,
    levels: [{ dmg: 4, burn: 2 }, { dmg: 5, burn: 2 }, { dmg: 6, burn: 3 }],
    // aimed at any tile up to 2 away in a straight line (the cone always starts at him: both tiles of a row aim the same)
    target: { type: 'tile', range: [1, 2], los: false, filter: 'any', straight: true },
    area: { shape: 'cone', size: 2 },
    desc: function (L) { return 'Deal ' + L.dmg + ' fire damage and Burn ' + L.burn + ' to every foe in a cone 2 tiles deep. Ignites oil and explosive barrels.'; },
    flavor: 'He flicks the crucible. Everyone in front of him learns what 1,200 degrees means.',
    execute: function (ctx) {
      const u = ctx.user, L = ctx.L;
      const far = ctx.tiles[ctx.tiles.length - 1];
      if (far) DD.FX.beam(u, far, { color: EMBER, width: 6 });
      DD.FX.sound('fire');
      ctx.tiles.forEach(function (q, i) { DD.FX.tile(q.x, q.y, 'glow', { color: EMBER, parallel: i > 0 }); });
      ctx.foes.forEach(function (f) {
        if (!active(f)) return;
        DD.FX.particles(f, { kind: 'fire', count: 10, parallel: true });
        DD.Act.damage(u, f, L.dmg, { element: 'fire', skill: ctx.skill, tags: ['fire', 'aoe'] });
        if (active(f)) DD.Act.addStatus(f, 'burn', { stacks: L.burn }, u);
      });
      // the fire meets the floor: oil ignites, webs burn, water boils, ice melts (units: done above, foes only)
      ctx.tiles.forEach(function (q) { DD.Act.applyElement(q.x, q.y, 'fire', u, { noUnits: true }); });
    },
  });

  // Anvil Drop: the big one — a holy anvil from above, Stun (it loses its next turn; interrupts a boss wind-up)
  skill({
    id: 'val_anvil', name: 'Anvil Drop', icon: '🪨', kind: 'spell', tags: ['ranged', 'stun', 'holy'],
    ap: 3, cooldown: 3,
    levels: [{ dmg: 10 }, { dmg: 13 }, { dmg: 16 }],
    target: { type: 'unit', range: [1, 4], los: true, filter: 'enemy' },
    desc: function (L) { return 'A holy anvil falls on a foe within 4: ' + L.dmg + ' damage, and it is Stunned (loses its next turn).'; },
    flavor: 'The forge god answers prayers in the traditional manner: from directly above, at speed.',
    execute: function (ctx) {
      const u = ctx.user, t = ctx.targetUnit;
      if (!active(t)) return;
      DD.FX.projectile({ x: t.x, y: t.y, h: 9 }, t, { kind: 'rock', color: '#5d6670', arc: 0, size: 2 });
      DD.FX.shake(9, 300);
      DD.FX.text(t, 'CLANG!', { color: HOLY, size: 18 });
      clang(t, 18);
      DD.FX.particles(t, { kind: 'dust', count: 10, parallel: true });
      DD.Act.damage(u, t, ctx.L.dmg, { skill: ctx.skill, tags: ['holy', 'anvil'] });
      if (active(t)) DD.Act.addStatus(t, 'stun', { turns: 1 }, u);
    },
  });

  // Hair Flip: the hair is the weapon now (Dazzled foes make no attacks of opportunity: everyone walks away free)
  skill({
    id: 'val_hair_flip', name: 'Hair Flip', icon: '💁', kind: 'utility', tags: ['dazzle', 'aoe', 'hair'],
    ap: 1, cooldown: function (L) { return L.cd; },
    levels: [{ r: 1, cd: 3 }, { r: 1, cd: 2 }, { r: 2, cd: 2 }],
    target: { type: 'self' },
    area: { shape: 'circle', size: function (L) { return L.r; } },
    desc: function (L) { return 'Valdris flips his glorious hair: foes within ' + L.r + ' are Dazzled through their next turn.'; },
    flavor: 'Forty years of conditioner, released in a single, devastating swish.',
    // a Dazzled foe's next attack lands a tile off (usually a miss) and it makes no attacks of opportunity
    aiScore: function (ctx) {
      let v = 0;
      ctx.foes.forEach(function (f) {
        if (!active(f) || has(f, 'dazzled') || DD.Combat.isStunned(f) || has(f, 'sheep')) return;
        v += 2 + (DD.AI.engaged(f).length ? 1 : 0);
      });
      return v;
    },
    execute: function (ctx) {
      const u = ctx.user;
      DD.FX.particles(u, { kind: 'glitter', color: GOLD, count: 18 });
      DD.FX.text(u, '✨ Mind the hair.', { color: GOLD, size: 15 });
      DD.Act.maybeBark(u, 'hair', 0.5);
      ctx.foes.forEach(function (f) { if (active(f)) DD.Act.addStatus(f, 'dazzled', { turns: 1 }, u); });
    },
  });

  // Signature: Divine Forge — the whole party gets a matching set
  skill({
    id: 'val_signature', name: 'Divine Forge', icon: '⚜️', kind: 'buff', tags: ['buff', 'block', 'forge', 'aoe'],
    ap: 2, cooldown: 0, hype: 100,
    levels: [{ block: 8, bonus: 3 }],
    target: { type: 'self' },
    area: { shape: 'all_allies' },
    // the duration is the damage bonus's: Block always ends at the start of its owner's next turn
    desc: function (L) {
      return 'Valdris and every ally deal +' + L.bonus + ' damage with every hit until the end of their next turn, and gain ' + L.block + ' Block.';
    },
    flavor: 'Everyone gets a matching set. His is shinier. That is not up for discussion.',
    aiScore: function (ctx) {
      const L = ctx.L || {};
      let v = 0;
      ctx.friends.forEach(function (f) { if (active(f) && foesInReach(f).length) v += (L.bonus || 0) * 2; });
      return v;
    },
    execute: function (ctx) {
      const u = ctx.user, L = ctx.L;
      DD.FX.banner('DIVINE FORGE', { sub: 'Everyone gets a matching set.', color: GOLD, ms: 900 });
      DD.FX.flash('#fff3c4', 240);
      DD.FX.shake(7, 380);
      DD.Act.bark(u, 'signature');
      const list = ctx.friends.slice();
      if (list.indexOf(u) < 0 && active(u)) list.unshift(u);
      list.forEach(function (f, i) {
        if (!active(f)) return;
        if (f !== u) DD.FX.beam(u, f, { color: GOLD, width: 3, parallel: i > 0 });
        DD.FX.particles(f, { kind: 'sparks', color: SPARK, count: 14, parallel: true });
        DD.Act.addBlock(f, L.block);
        DD.Act.addStatus(f, FORGED, { stacks: L.bonus, turns: 1 }, u);
      });
    },
  });

  // ---- items ----------------------------------------------------------------------------------------------
  DD.registerItem({
    id: 'val_apron', name: '"Kiss the Smith" Apron', slot: 'armor', rarity: 'rare', icon: '🦺', hero: HERO,
    stats: { hp: 6, armor: 1 },
    desc: '+6 max HP, +1 armor. Valdris takes half damage from fire.',
    flavor: 'Fireproof, soot-proof and, so far, entirely kiss-proof. He remains hopeful.',
    hooks: {
      // fired for the wearer's own sources only (he is the target)
      modifyIncomingDamage: function (d) { if (d && d.element === 'fire') d.mult *= 0.5; },
    },
  });
  DD.registerItem({
    id: 'val_conditioner', name: 'Forge-Proof Conditioner', slot: 'trinket', rarity: 'rare', icon: '🧴', hero: HERO,
    stats: { init: 2, hp: 4 },
    desc: '+2 initiative, +4 max HP.',
    flavor: 'Keeps his golden locks soot-free at 1,200 degrees. Smells of cinnamon and molten iron. Not a drink, Betty.',
    hooks: {},
  });
  DD.registerItem({
    id: BRIGHTFORGE, name: 'Brightforge, the Unreasonably Large Hammer', slot: 'weapon', rarity: 'legendary', icon: '🔨', hero: HERO,
    stats: { dmg: 0.1 },
    desc: '+10% damage. Flame-Forged Edge costs 0 AP.',
    flavor: 'Forged from a fallen star, a cart axle and his ex\'s favourite skillet. Always warm, so flame-forging is instant.',
    hooks: {
      // fired for the unit paying: the wielder's own Flame-Forged Edge only
      modifyCost: function (c) { if (c && c.skill && c.skill.id === EDGE_SKILL && hasItem(c.unit, BRIGHTFORGE)) c.ap = 0; },
    },
  });

  // ---- the hero ---------------------------------------------------------------------------------------------
  DD.registerHero({
    id: HERO, name: 'Valdris', epithet: 'the Well-Conditioned', race: 'Human', cls: 'Forge Cleric',
    role: 'Forge support / frontline buffer', complexity: 2,
    blurb: 'A devout smith-priest of the forge god who forges weapons and armour for the party mid-fight, sets their blades ' +
      'on fire and hammers the dents out of them while they are still wearing them. He strikes while the iron\'s hot, ' +
      'holds the line with a very large hammer and would like you to mind the hair.',
    color: GOLD,
    unlock: null,
    stats: { hp: 28, ap: 3, mov: 3, armor: 1, init: 0 },
    growth: { hp: 4 },
    flags: {},
    sprite: VAL_SPRITE,
    basic: 'val_basic',
    signature: 'val_signature',
    passive: {
      name: 'Strike While the Iron\'s Hot',
      desc: 'Valdris deals +' + IRON + ' damage to Burning foes, attacks of opportunity included.',
      hooks: {
        modifyOutgoingDamage: function (d) {
          if (!d || !isValdris(d.source) || !d.target || !has(d.target, 'burn')) return;
          if (d.opportunity) { d.valIron = true; return; }   // its +3 came through modifyOpportunity (o.flat)
          if (!skillHit(d)) return;
          d.flat += IRON;
          d.valIron = true;
        },
        // pure: the HUD's move preview, paths and the AI's attack-of-opportunity estimates read it
        modifyOpportunity: function (o) {
          if (o && isValdris(o.attacker) && o.mover && has(o.mover, 'burn')) o.flat += IRON;
        },
        onDealDamage: function (d) {
          if (!d || !d.valIron || !(d.amount > 0) || !d.target) return;
          DD.FX.text(d.target, 'Iron\'s hot! +' + IRON, { color: EMBER, size: 13 });
          DD.Act.maybeBark(d.source, 'iron', 0.25);
        },
      },
    },
    startingSkills: ['val_flame_edge', 'val_forge_armour'],
    skillPool: ['val_flame_edge', 'val_forge_armour', 'val_forge_weapon', 'val_spiked', 'val_temper', 'val_hammer_faith',
      'val_molten', 'val_anvil', 'val_hair_flip'],
    summons: [],
    barks: {
      select: ['Valdris, forge cleric. Mind the hair.', 'Bring me your dented, your dull, your rusty.',
        'Faith in the forge. Conditioner in the bag.', 'Point me at something that needs hammering.',
        'Every blade blessed. Every buckle tightened.'],
      start: ['Roll for initiative. I\'ll roll up my sleeves.', 'Check your straps, everyone. Kiri, yours are loose.',
        'Stand behind me. Not too close. The hair.', 'The forge is lit. Let\'s make something.',
        'Weapons out. I\'ll sharpen them as we go.'],
      move: ['Coming through. Mind the hair.', 'A smith goes where the dents are.', 'Heavy armour, heavier faith. Walking.',
        'Repositioning the forge.'],
      kill: ['Hammered flat.', 'Strike while the iron\'s hot!', 'Quenched.', 'Another one for the scrap pile.',
        'That dent is permanent.'],
      hurt: ['Not the hair!', 'That\'ll buff out.', 'Ow. My apron.', 'A scratch. I can hammer that out.'],
      lowhp: ['Structural integrity: questionable.', 'I need a whetstone. And a medic.', 'Someone hold my hammer. And my hair.',
        'Ellaria! Josiah! Anyone! I\'m cracking!'],
      downed: ['Tell them... the hair... was natural...', 'Don\'t let Buga sell my hammer...', 'Bury me with my conditioner...',
        'The forge... grows cold...'],
      revive: ['Back on the anvil. Let\'s go.', 'Re-forged and ready.', 'Did anyone touch the hair while I was out?',
        'The forge god said "not yet". Loudly.'],
      ally_down: ['Hold on! I\'ll weld you back together!', 'That was my best armour! Get up!',
        'Someone get them up. I\'ll hold the gap.', 'Down? Not on my anvil. Up!'],
      levelup: ['New techniques. Same gorgeous hair.', 'The forge god approves. Mostly.', 'Tempered. Stronger. Shinier.',
        'I\'ve learned a new way to hit things.'],
      victory: ['Good work. Now bring me your gear. All of it.', 'Not one split end. Victory.',
        'I\'ll hammer the dents out tonight.', 'Forged in battle. Polished after.', 'Your armour is filthy. I\'m so happy.'],
      idle: ['Marwyn, hold still. Your axe is crying.', 'Zarathor, gold is a SOFT metal. Stop.', 'Slate, I could fix that crack. No? Fine.',
        'Hjalmar, give back my tongs.', 'Pebbles, stop licking the anvil. Good boy.', 'A hundred strokes a night. Hair first, then hammer.'],
      signature: ['DIVINE FORGE!', 'By hammer and flame, everyone gets a set!', 'The forge god provides! Line up!',
        'Weapons glow! Armour holds! GO!', 'Hammer! Anvil! Faith! FORGE!'],
      // extra keys (DD.Act.bark): attacks of opportunity, the passive, Hair Flip
      opportunity: ['Where do you think you\'re going?', 'Leaving? Take a souvenir.', 'Nobody walks away from the smith.',
        'Turn your back on my hammer? Bold.'],
      iron: ['Strike while the iron\'s hot!', 'Glowing nicely. Now: hammer.', 'Pre-heated. Perfect.', 'Hot iron! Hammer time!'],
      hair: ['Mind the hair.', 'Behold: conditioned perfection.', 'You may look. You may not touch.', 'Shampoo. Rinse. Blind.'],
    },
  });

  /** Small public surface for tests and other content (read-only). */
  DD.Valdris = { IRON: IRON, FORGED: FORGED, EDGE: EDGE, hammerGrip: hammerGrip, foesInReach: foesInReach };
})();
