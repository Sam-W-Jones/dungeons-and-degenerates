/* Dungeons and Degenerates — js/data/heroes/corelos.js
 * Corelos the Undersigned, Runic Sorcerer (v2: available from the start, initiative +1). Rune traps + dark bargains.
 * - Runes: cor_rune objects (non-blocking, max 3 per Corelos; the oldest fizzles). A foe that steps on one (walk, push,
 *   pull, teleport; flyers float over) sets it off: it bursts for its damage on every foe on and next to it. Foes do
 *   not see runes (no AI hazard), so runes punish the paths enemies walk on their turns and every push, pull and throw
 *   of his allies.
 * - Debt (cor_debt, stacks = HP owed): what bargains cost. Paid in HP at the start of his next turn (ignores Block,
 *   never below 1 HP). Passive "Collateral Damage" (his own onAnyDeath hook): every foe that dies first pays off 4.
 * Public helpers for tests / other content: DD.Corelos (runes, placeRune, burst, burstAll, debt, addDebt, payOff...).
 */
(function () {
  'use strict';
  const DD = window.DD;
  const U = DD.util;

  const HERO = 'corelos';
  const RUNE = 'cor_rune';
  const DEBT = 'cor_debt';
  const IMP = 'cor_imp';
  const RUNE_CAP = 3;
  const PAYOFF = 4;
  const CARD_PAYOFF = 7;
  const QUILL_BONUS = 2;
  const NOTARIZED_DEBT = 10;
  const VIOLET = '#b77bff', VIOLET_LIGHT = '#e6d0ff', CRIMSON = '#c8203f', GOLD = '#e8c45a', PARCH = '#f3e6c4';

  function A() { return DD.Act; }
  function G() { return DD.Grid; }
  function S() { return DD.Combat && DD.Combat.state; }
  function FX() { return DD.FX; }
  function active(u) { return !!u && !u.dead && !u.downed; }
  function byId(id) { return id && DD.Combat ? DD.Combat.byId(id) : null; }
  function dist(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }
  /** Item check for a combat unit (items: [ids]) or a RunHero (items: { weapon, armor, trinket }). */
  function hasItem(u, id) {
    if (!u || !u.items) return false;
    if (Array.isArray(u.items)) return u.items.indexOf(id) >= 0;
    for (const k in u.items) if (u.items[k] === id) return true;
    return false;
  }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }

  // ---- cosmetic FX helpers ------------------------------------------------------------------------
  /** A rune-sealed letter for custom projectiles (visual only). */
  function drawLetter(c, x, y, p, view) {
    const z = (view && view.zoom) || 1;
    c.save();
    c.translate(x, y);
    c.rotate(Math.sin(p * 10) * 0.45);
    c.lineJoin = 'round';
    c.fillStyle = PARCH; c.strokeStyle = '#1a1014'; c.lineWidth = 1.1 * z;
    c.beginPath(); c.rect(-6.5 * z, -4.5 * z, 13 * z, 9 * z); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(-6.5 * z, -4.5 * z); c.lineTo(0, 0.8 * z); c.lineTo(6.5 * z, -4.5 * z); c.stroke();
    c.fillStyle = CRIMSON; c.beginPath(); c.arc(0, 1 * z, 2.3 * z, 0, Math.PI * 2); c.fill();
    c.restore();
  }
  function letter(from, to, opts) {
    if (!from || !to) return;
    FX().projectile(from, to, Object.assign({ kind: 'custom', draw: drawLetter, color: PARCH, ms: 300 }, opts || {}));
  }

  // ---- runes --------------------------------------------------------------------------------------
  function seqOf(o) { return o && o.data && typeof o.data.seq === 'number' ? o.data.seq : 0; }
  function isRune(o) { return !!o && o.id === RUNE; }
  function ownerIdOf(o) { return o && o.data ? o.data.owner || null : null; }

  /** Rune tiles (oldest first), of one owner (unit or id) or of everybody when owner is omitted. */
  function runeTiles(owner) {
    const s = S();
    if (!s || !s.grid) return [];
    const id = owner && typeof owner === 'object' ? owner.id : owner;
    const out = [];
    s.grid.tiles.forEach(function (t) { if (isRune(t.obj) && (!id || ownerIdOf(t.obj) === id)) out.push(t); });
    out.sort(function (a, b) { return seqOf(a.obj) - seqOf(b.obj); });
    return out;
  }
  /** The Quill's +2 is part of the burst itself, so multipliers (Weak, Inspired) apply to the whole amount. */
  function quillBonus(owner) { return hasItem(owner, 'cor_quill') ? QUILL_BONUS : 0; }
  function burstTiles(p) { return p ? G().shape('circle', { x: p.x, y: p.y }, null, 1) : []; }
  /** The owner's runes within Manhattan distance r of p. */
  function runesNear(owner, p, r) {
    if (!p || !owner) return [];
    return runeTiles(owner).filter(function (t) { return dist(t, p) <= r; });
  }
  /** Hostile to the rune's owner (ownerless runes go off under enemies). */
  function isFoe(owner, u) {
    if (!active(u)) return false;
    return owner ? G().hostile(owner, u) : u.side === 'enemy';
  }
  function canRuneAt(p) {
    const t = p && G().tile(p.x, p.y);
    if (!t) return 'Off the map.';
    if (t.obj) return 'Something is already there.';
    if (!G().isFree(p.x, p.y) || G().isDrop(p.x, p.y)) return 'No room for a rune.';
    return true;
  }

  function fizzle(t) {
    if (!t || !isRune(t.obj)) return;
    A().removeObject(t.x, t.y);
    FX().particles({ x: t.x, y: t.y }, { kind: 'smoke', count: 6, color: VIOLET });
    FX().text({ x: t.x, y: t.y }, 'fizzle', { color: '#bba6d6', size: 12 });
    A().log('An old rune fizzles out (limit reached).', 'system');
  }

  /** Inscribe a rune for owner. opts: { dmg, root }. The owner's oldest rune fizzles at the cap. Returns the object. */
  function placeRune(owner, x, y, opts) {
    opts = opts || {};
    const s = S();
    if (!s || canRuneAt({ x: x, y: y }) !== true) return null;
    const mine = runeTiles(owner);
    while (mine.length >= RUNE_CAP) fizzle(mine.shift());
    s.data = s.data || {};
    s.data.corRuneSeq = (s.data.corRuneSeq || 0) + 1;
    const dmg = Math.max(0, Math.round(Number(opts.dmg) || 0));
    const root = !!opts.root;
    const o = A().placeObject(x, y, RUNE, {
      label: (root ? 'Binding Rune' : 'Rune') + ' (' + (dmg + quillBonus(owner)) + ' dmg' + (root ? ', roots' : '') + ')',
      data: { owner: owner ? owner.id : null, dmg: dmg, root: root, seq: s.data.corRuneSeq },
    });
    if (o) {
      FX().tile(x, y, 'glow', { color: VIOLET });
      FX().particles({ x: x, y: y }, { kind: 'runes', color: VIOLET, count: 10, parallel: true });
    }
    return o;
  }

  /**
   * Set off the rune on (x, y): its damage (+ opts.bonus) to every foe of its owner on and next to the tile.
   * opts.trigger: the foe that stepped on it (a binding rune Roots it). Returns [{ unit, dealt }].
   */
  function burst(x, y, opts) {
    opts = opts || {};
    const t = G().tile(x, y);
    const rune = t && isRune(t.obj) ? t.obj : null;
    if (!rune) return [];
    A().removeObject(x, y);
    const d = rune.data || {};
    const owner = byId(d.owner);
    const amount = Math.max(0, (Number(d.dmg) || 0) + (Number(opts.bonus) || 0) + quillBonus(owner));
    FX().explosion({ x: x, y: y }, { radius: 1, color: VIOLET, ms: 300 });
    FX().particles({ x: x, y: y }, { kind: 'runes', color: VIOLET_LIGHT, count: 14, parallel: true });
    FX().sound('magic');
    const victims = [];
    burstTiles({ x: x, y: y }).forEach(function (p) {
      const u = G().unitAt(p.x, p.y);
      if (isFoe(owner, u) && victims.indexOf(u) < 0) victims.push(u);
    });
    A().log((d.root ? 'A binding rune' : 'A rune') + ' bursts' + (opts.trigger ? ' under ' + opts.trigger.name : '') + '!', 'dmg');
    const hits = [];
    victims.forEach(function (v) {
      if (!active(v)) return;
      hits.push({ unit: v, dealt: A().damage(owner, v, amount, { tags: ['cor_rune', 'arcane'], noHighGround: true }) });
    });
    if (d.root && opts.trigger && active(opts.trigger)) A().addStatus(opts.trigger, 'root', { turns: 1 }, owner);
    return hits;
  }

  /** Burst a list of rune tiles in order, skipping any that went off (or vanished) in the meantime. */
  function burstAll(tiles, opts) {
    const snap = tiles.map(function (t) { return { x: t.x, y: t.y, obj: t.obj }; });
    let n = 0;
    snap.forEach(function (r) {
      const t = G().tile(r.x, r.y);
      if (!t || t.obj !== r.obj) return;
      burst(r.x, r.y, opts);
      n++;
    });
    return n;
  }

  /** The rune painter: a glowing violet circle with a sigil, pulsing; binding runes get a green chain ring. */
  function drawRune(g, o, t) {
    const d = (o && o.data) || {};
    const c = g.ctx;
    const seq = typeof d.seq === 'number' ? d.seq : 0;
    const time = typeof t === 'number' ? t : 0;
    const pulse = 0.5 + 0.5 * Math.sin(time * 3.2 + seq * 1.7);
    const lw0 = g.lw;
    g.glow(0, 0, 27, VIOLET, 0.22 + 0.16 * pulse);
    g.ellipse(0, 0, 15.5, 7.75, 'rgba(26,8,48,0.62)', null);
    g.lw = 2.2;
    g.ellipse(0, 0, 15.5, 7.75, null, '#1a0d2e');
    g.lw = 1.3;
    g.ellipse(0, 0, 15.5, 7.75, null, U.rgba(VIOLET_LIGHT, 0.7 + 0.3 * pulse));
    g.ellipse(0, 0, 11, 5.5, null, U.rgba(VIOLET, 0.85));
    if (d.root) {
      c.save();
      c.setLineDash([2.5, 2]);
      g.lw = 1.4;
      g.ellipse(0, 0, 13.2, 6.6, null, '#7ee08a');
      c.restore();
    }
    // the sigil, lying flat on the floor
    c.save();
    c.scale(1, 0.5);
    c.lineCap = 'round'; c.lineJoin = 'round';
    const spin = time * 0.6 + seq;
    c.strokeStyle = U.rgba('#ffffff', 0.55 + 0.4 * pulse);
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(0, -7.5); c.lineTo(0, 7.5);
    c.moveTo(-5.5, 3); c.lineTo(0, -3.5); c.lineTo(5.5, 3);
    c.moveTo(-3, -6); c.lineTo(3, -6);
    c.stroke();
    c.fillStyle = U.rgba(VIOLET_LIGHT, 0.9);
    for (let i = 0; i < 4; i++) {
      const a = spin + i * Math.PI / 2;
      c.beginPath(); c.arc(Math.cos(a) * 13, Math.sin(a) * 13, 1.3, 0, Math.PI * 2); c.fill();
    }
    c.restore();
    // a tiny glyph hovering above the circle so a rune reads even next to busy sprites
    const hy = -5 - 1.5 * Math.sin(time * 2 + seq);
    g.glow(0, hy, 7, VIOLET, 0.35 + 0.25 * pulse);
    g.line(0, hy - 2.4, 0, hy + 2.4, U.rgba('#ffffff', 0.85), 1);
    g.line(-1.8, hy + 0.6, 0, hy - 1, U.rgba('#ffffff', 0.85), 1);
    g.line(1.8, hy + 0.6, 0, hy - 1, U.rgba('#ffffff', 0.85), 1);
    g.lw = lw0;
  }

  DD.registerObject({
    id: RUNE, name: 'Rune', blocksMove: false, blocksLos: false, hp: 0, height: 0.05, color: VIOLET,
    desc: 'One of Corelos\' runes. A foe that steps on it (flyers float over) sets it off: it bursts for its damage on every foe on and next to it. Foes never see it coming.',
    onEnter: function (unit, o, tile) {
      if (!active(unit) || !isRune(o) || !tile) return;
      if (!isFoe(byId(ownerIdOf(o)), unit)) return;
      burst(tile.x, tile.y, { trigger: unit });
    },
    draw: drawRune,
  });

  // ---- Debt ---------------------------------------------------------------------------------------
  function debtOf(u) { const st = u ? A().getStatus(u, DEBT) : null; return st ? st.stacks : 0; }
  function payoffFor(u) { return hasItem(u, 'cor_soul_card') ? CARD_PAYOFF : PAYOFF; }
  /** Does this unit carry Collateral Damage (Corelos' passive)? */
  function collateral(u) { return !!u && u.defId === HERO && u.kind === 'hero'; }

  /** Put a unit in Debt (n HP owed). Returns the Debt actually added (0 if blocked, e.g. by debuff immunity). */
  function addDebt(unit, n, src) {
    n = Math.round(Number(n) || 0);
    if (!active(unit) || n <= 0) return 0;
    const inst = A().addStatus(unit, DEBT, { stacks: n }, src || unit);
    return inst ? n : 0;
  }

  /** Pay off up to n Debt. Returns the amount paid off. */
  function payOff(unit, n, reason) {
    const st = unit ? A().getStatus(unit, DEBT) : null;
    n = Math.round(Number(n) || 0);
    if (!st || n <= 0) return 0;
    const paid = Math.min(st.stacks, n);
    st.stacks -= paid;
    A().touch();
    FX().text(unit, '−' + paid + ' Debt', { color: GOLD, size: 14 });
    A().log(unit.name + '\'s Debt drops by ' + paid + (reason ? ' (' + reason + ')' : '') + '.', 'status');
    if (st.stacks <= 0) A().removeStatus(unit, DEBT, { text: 'Debt paid!' });
    return paid;
  }

  /** Debt comes due: paid in HP like a skill's HP cost (ignores Block and armor, never below 1 HP). */
  function collect(unit, st) {
    if (!active(unit) || !st) return 0;
    const owed = Math.max(0, st.stacks || 0);
    A().removeStatus(unit, DEBT, { silent: true });
    const paid = Math.max(0, Math.min(owed, unit.hp - 1));
    if (paid > 0) {
      unit.hp -= paid;
      A().touch();
      FX().damage(unit, paid, { cost: true });
      FX().text(unit, '💸 Debt collected!', { color: GOLD, size: 15 });
      A().log(unit.name + ' pays ' + paid + ' HP of Debt.', 'dmg');
      if (unit.kind === 'hero') A().maybeBark(unit, unit.hp <= unit.maxHp * 0.3 ? 'lowhp' : 'hurt', 0.35);
    } else if (owed > 0) {
      FX().text(unit, 'Nothing left to collect', { color: GOLD, size: 13 });
      A().log('The collectors find nothing left on ' + unit.name + ' and leave.', 'status');
    }
    return paid;
  }

  /** The unit holding a status instance (for its tooltip). */
  function holderOf(st) {
    const s = S();
    return s ? s.units.filter(function (u) { return u.statuses && u.statuses.indexOf(st) >= 0; })[0] || null : null;
  }

  DD.registerStatus({
    id: DEBT, name: 'In Debt', icon: '💸', color: GOLD, type: 'debuff', stacking: 'stack', maxStacks: 99,
    decay: 'never', defaultTurns: -1,
    desc: function (st) {
      const u = holderOf(st);
      const his = !u || collateral(u);   // Corelos (he/him) is the one who signs things; anyone else is "its"
      return 'Owes ' + st.stacks + ' HP, paid at the start of ' + (his ? 'his' : 'its') + ' next turn (ignores Block, never below 1 HP).' +
        (his ? ' Every foe that dies first pays off ' + payoffFor(u) + ' of it.' : '');
    },
    hooks: { onTurnStart: function (unit, st) { collect(unit, st); } },
  });

  // ---- skills --------------------------------------------------------------------------------------
  function skill(def) { def.owner = def.owner || HERO; return DD.registerSkill(def); }

  // Basic: Rune Bolt
  skill({
    id: 'cor_rune_bolt', name: 'Rune Bolt', icon: '🔮', kind: 'attack', tags: ['ranged', 'arcane', 'rune'], ap: 1,
    levels: [{ dmg: 4 }],
    target: { type: 'unit', range: [1, 4], los: true, filter: 'enemy' },
    area: { shape: 'custom', fn: function (ctx) {
      if (!ctx || !ctx.target) return [];
      let out = [{ x: ctx.target.x, y: ctx.target.y }];
      runesNear(ctx.user, ctx.target, 1).forEach(function (t) { out = out.concat(burstTiles(t)); });
      return out;
    } },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage. Your runes on or next to the target burst.'; },
    flavor: 'Legally distinct from Magic Missile. Terms and conditions apply.',
    execute: function (ctx) {
      const u = ctx.targetUnit, at = ctx.target;
      if (!at) return;
      FX().projectile(ctx.user, at, { kind: 'bolt', color: VIOLET, trail: true });
      if (active(u)) A().damage(ctx.user, u, ctx.L.dmg, { tags: ['arcane'] });
      burstAll(runesNear(ctx.user, at, 1), {});
    },
  });

  /**
   * AutoPlay's worth of a rune on ctx.target (a rune only pays off later): foes next to it (a Rune Bolt or their next
   * step sets it off) and foes that can walk over it on their way to the party. Never shown to the player.
   */
  function runeValue(ctx) {
    const me = ctx && ctx.user, p = ctx && ctx.target, s = S();
    if (!me || !p || !s || canRuneAt(p) !== true || runeTiles(me).length >= RUNE_CAP) return 0;   // at the cap one fizzles
    const dmg = ((ctx.L && ctx.L.rune) || 0) + quillBonus(me);
    const party = s.units.filter(function (u) { return active(u) && !G().hostile(me, u); });
    let v = 0;
    s.units.forEach(function (f) {
      if (!isFoe(me, f) || G().isFlying(f)) return;
      const d = dist(f, p);
      if (d <= 1) { v += 0.5 * dmg; return; }
      if (d > (f.mov || 3) + 1) return;
      let near = null;
      party.forEach(function (h) { if (!near || dist(h, f) < dist(near, f)) near = h; });
      if (near && dist(p, near) < dist(f, near)) v += 0.3 * dmg;
    });
    if (ctx.L && ctx.L.root && v > 0) v += 1.5;
    return Math.min(v, 1.5 * dmg);
  }
  /**
   * AutoPlay's worth of the deaths that will pay off a bargain's Debt (it prices any Debt like a flat debuff on him):
   * badly hurt foes are likely to die before his next turn. Never shown to the player.
   */
  function debtRelief(ctx) {
    const me = ctx && ctx.user, s = S();
    if (!me || !s || !ctx.L || !(ctx.L.debt > 0)) return 0;
    let soon = 0;
    s.units.forEach(function (f) { if (isFoe(me, f) && f.hp <= 8) soon++; });
    return Math.min(ctx.L.debt, payoffFor(me) * soon, 4);
  }

  // Starter: Glyph of Warding
  skill({
    id: 'cor_glyph', name: 'Glyph of Warding', icon: '🔯', kind: 'spell', tags: ['rune', 'trap', 'arcane'], ap: 1, cooldown: 0,
    levels: [{ rune: 5 }, { rune: 6 }, { rune: 6, root: true }],
    target: { type: 'tile', range: [1, 4], los: false, filter: 'empty', canTarget: function (ctx) { return canRuneAt(ctx.target); } },
    area: { shape: 'custom', fn: function (ctx) { return ctx && ctx.target ? burstTiles(ctx.target) : []; } },
    desc: function (L, user) {
      return 'Inscribe a rune (max ' + RUNE_CAP + '): when a foe steps on it, ' + (L.root ? 'that foe is Rooted and ' : '') +
        'foes on and next to it take ' + (L.rune + quillBonus(user)) + ' damage.';
    },
    flavor: 'Monsters never read the fine print. Or look at the floor.',
    execute: function (ctx) {
      const p = ctx.target;
      if (!p) return;
      FX().projectile(ctx.user, p, { kind: 'orb', color: VIOLET, ms: 220 });
      if (!placeRune(ctx.user, p.x, p.y, { dmg: ctx.L.rune, root: !!ctx.L.root })) FX().text(p, 'No room for a rune', { color: '#bba6d6', size: 13 });
    },
    autoplayValue: runeValue,
  });

  // Starter: Dark Bargain
  skill({
    id: 'cor_bargain', name: 'Dark Bargain', icon: '😈', kind: 'buff', tags: ['bargain'], ap: 0, cooldown: 2,
    levels: [{ gain: 2, debt: 6 }, { gain: 2, debt: 4 }, { gain: 3, debt: 6 }],
    target: { type: 'self' },
    desc: function (L) { return 'Gain ' + L.gain + ' AP. Take ' + L.debt + ' Debt.'; },
    flavor: 'He read the whole contract. Well, the first word. It was "Hey".',
    execute: function (ctx) {
      const u = ctx.user;
      if (!active(u)) return;
      FX().particles(u, { kind: 'runes', color: CRIMSON, count: 14 });
      FX().text(u, '✍️ Signed!', { color: '#ff9db0', size: 15 });
      A().gainAp(u, ctx.L.gain);
      addDebt(u, ctx.L.debt, u);
    },
    autoplayValue: debtRelief,
  });

  // Runic Detonation
  skill({
    id: 'cor_detonate', name: 'Runic Detonation', icon: '💥', kind: 'spell', tags: ['rune', 'aoe', 'arcane'], ap: 1, cooldown: 1,
    levels: [{ bonus: 2 }, { bonus: 3 }, { bonus: 4 }],
    target: { type: 'self' },
    area: { shape: 'custom', fn: function (ctx) {
      let out = [];
      if (ctx && ctx.user) runeTiles(ctx.user).forEach(function (t) { out = out.concat(burstTiles(t)); });
      return out;
    } },
    canUse: function (ctx) { return ctx && ctx.user && runeTiles(ctx.user).length ? true : 'No runes to detonate.'; },
    desc: function (L) { return 'All your runes burst at once, each dealing +' + L.bonus + ' damage.'; },
    flavor: 'Section 7: the party of the first part goes KABOOM.',
    execute: function (ctx) {
      const tiles = runeTiles(ctx.user);
      if (!tiles.length) { FX().text(ctx.user, 'No runes!', { color: '#bba6d6', size: 13 }); return; }
      FX().particles(ctx.user, { kind: 'runes', color: VIOLET, count: 12 });
      FX().shake(5, 260);
      burstAll(tiles, { bonus: ctx.L.bonus });
    },
  });

  // You've Been Served
  skill({
    id: 'cor_served', name: 'You\'ve Been Served', icon: '📨', kind: 'attack', tags: ['pull', 'ranged'], ap: 1, cooldown: 2,
    levels: [{ dmg: 3, pull: 3 }, { dmg: 4, pull: 4 }, { dmg: 6, pull: 4 }],
    target: { type: 'unit', range: [2, 5], los: true, filter: 'enemy', straight: true },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to a foe in a straight line and pull it up to ' + plural(L.pull, 'tile') + ' toward you.'; },
    flavor: 'Paperwork, delivered at the speed of a thrown brick.',
    execute: function (ctx) {
      const u = ctx.targetUnit;
      if (!u) return;
      letter(ctx.user, u);
      FX().beam(ctx.user, u, { color: GOLD, width: 2, parallel: true });
      A().damage(ctx.user, u, ctx.L.dmg);
      if (active(u)) A().pull(ctx.user, u, ctx.user, ctx.L.pull);
    },
  });

  // Restraining Order
  skill({
    id: 'cor_restraining', name: 'Restraining Order', icon: '🚫', kind: 'spell', tags: ['push', 'aoe'], ap: 1, cooldown: 2,
    levels: [{ dmg: 2, push: 2 }, { dmg: 3, push: 2 }, { dmg: 4, push: 3 }],
    target: { type: 'self' }, area: { shape: 'adjacent' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to each adjacent foe and push it ' + plural(L.push, 'tile') + ' away.'; },
    flavor: 'Must stay 500 feet away. Or 2 tiles. Whichever hurts more.',
    execute: function (ctx) {
      FX().explosion(ctx.user, { radius: 1, color: GOLD, ms: 220 });
      ctx.foes.forEach(function (f) {
        if (!active(f)) return;
        A().damage(ctx.user, f, ctx.L.dmg);
        if (active(f)) A().knockback(ctx.user, f, ctx.L.push);
      });
    },
  });

  // Cease & Desist (v2: no telegraphs to cancel, so the letter makes the foe sit out its next turn)
  skill({
    id: 'cor_cease', name: 'Cease & Desist', icon: '✋', kind: 'spell', tags: ['ranged', 'control', 'stun'],
    ap: function (L) { return L.cost; }, cooldown: function (L) { return L.cd; },
    levels: [{ cost: 2, cd: 3 }, { cost: 2, cd: 2 }, { cost: 1, cd: 2 }],
    target: { type: 'unit', range: [1, 5], los: true, filter: 'enemy', canTarget: function (ctx) {
      const u = ctx && ctx.targetUnit;
      if (!u) return 'Pick a foe.';
      return u.flags && u.flags.stunImmune ? 'It has diplomatic immunity.' : true;
    } },
    desc: function () { return 'Stun a foe: it skips its next turn.'; },
    flavor: 'A strongly worded letter, delivered at a strongly worded velocity.',
    execute: function (ctx) {
      const u = ctx.targetUnit;
      if (!active(u)) return;
      letter(ctx.user, u);
      if (A().addStatus(u, 'stun', { turns: 1 }, ctx.user)) FX().text(u, '✋ Ceased!', { color: '#ffe14d', size: 15 });
    },
  });

  // Sign Here, Please
  skill({
    id: 'cor_sign_here', name: 'Sign Here, Please', icon: '✍️', kind: 'spell', tags: ['charm', 'bargain', 'ranged'], ap: 2, cooldown: 3,
    levels: [{ debt: 5, turns: 1 }, { debt: 3, turns: 1 }, { debt: 3, turns: 2 }],
    target: { type: 'unit', range: [1, 4], los: true, filter: 'enemy', canTarget: function (ctx) {
      const u = ctx && ctx.targetUnit;
      if (!u) return 'Pick a foe.';
      if (A().isBoss(u)) return 'Bosses never sign without their own lawyers.';
      const f = u.flags || {};
      if (Array.isArray(f.immune) && f.immune.indexOf('charmed') >= 0) return 'It refuses to sign anything.';
      if (A().hasStatus(u, 'charmed')) return 'Already under contract.';
      return true;
    } },
    desc: function (L) {
      return 'Charm a foe (not a boss): on its next ' + (L.turns > 1 ? L.turns + ' turns' : 'turn') + ' it fights for you. Take ' + L.debt + ' Debt.';
    },
    flavor: '"Just a formality. Initial here, here, and on your soul."',
    execute: function (ctx) {
      const u = ctx.targetUnit;
      if (!active(u)) return;
      letter(ctx.user, u);
      FX().particles(u, { kind: 'hearts', count: 8, parallel: true });
      if (!A().addStatus(u, 'charmed', { turns: ctx.L.turns }, ctx.user)) return;
      FX().text(u, '✍️ Signed!', { color: '#ff9db0', size: 15 });
      addDebt(ctx.user, ctx.L.debt, ctx.user);
    },
    autoplayValue: debtRelief,
  });

  // Soul Contract
  skill({
    id: 'cor_soul_contract', name: 'Soul Contract', icon: '🤝', kind: 'buff', tags: ['bargain', 'ally', 'defend'], ap: 1, cooldown: 2,
    levels: [{ block: 8, debt: 4 }, { block: 11, debt: 4 }, { block: 14, debt: 4 }],
    target: { type: 'unit', range: [0, 5], los: false, filter: 'allyOrSelf' },
    desc: function (L) { return 'Give yourself or an ally ' + L.block + ' Block. Take ' + L.debt + ' Debt.'; },
    flavor: '"Their soul, my signature. What could possibly go wrong?"',
    execute: function (ctx) {
      const a = ctx.targetUnit;
      if (!active(a)) return;
      FX().beam(ctx.user, a, { color: GOLD, width: 3 });
      FX().text(a, '🤝 Co-signed', { color: GOLD, size: 14 });
      A().addBlock(a, ctx.L.block);
      addDebt(ctx.user, ctx.L.debt, ctx.user);
    },
    autoplayValue: debtRelief,
  });

  // Infernal Lawyer
  function impSkillDmg(level) { return DD.skillLevel(DD.getSkill('cor_imp_poke'), level).dmg || 0; }
  skill({
    id: 'cor_lawyer', name: 'Infernal Lawyer', icon: '👿', kind: 'summon', tags: ['summon'], ap: 2, charges: 1,
    levels: [{ lvl: 1, hp: 12 }, { lvl: 2, hp: 15 }, { lvl: 3, hp: 18, ready: true }],
    target: { type: 'tile', range: [1, 2], los: false, filter: 'empty' },
    desc: function (L) {
      return 'Summon an Infernal Lawyer (' + L.hp + ' HP, flies): Billable Poke deals ' + impSkillDmg(L.lvl) +
        ', Objection! taunts. Once per combat.' + (L.ready ? ' It acts at once.' : '');
    },
    flavor: 'Bills in six-minute increments. Most of them are spent screaming.',
    execute: function (ctx) {
      const p = ctx.target;
      if (!p) return;
      FX().explosion(p, { radius: 0, color: CRIMSON, ms: 220 });
      FX().particles(p, { kind: 'smoke', count: 12, color: '#7a2030', parallel: true });
      A().summon(ctx.user, IMP, p.x, p.y, { level: ctx.L.lvl, hpMult: ctx.L.hp / 12, ready: !!ctx.L.ready });
    },
  });

  // Collect Debt
  function collectDmg(L, user) { return L.dmg + Math.min(L.cap || 0, debtOf(user)); }
  skill({
    id: 'cor_collect', name: 'Collect Debt', icon: '💀', kind: 'spell', tags: ['ranged', 'bargain'], ap: 2, cooldown: 2,
    levels: [{ dmg: 7, cap: 10 }, { dmg: 9, cap: 10 }, { dmg: 11, cap: 10 }],
    target: { type: 'unit', range: [1, 3], los: true, filter: 'enemy' },
    desc: function (L, user) {
      const d = user ? debtOf(user) : 0;
      return 'Deal ' + L.dmg + ' damage, +1 per point of your Debt (max +' + L.cap + ')' + (d > 0 ? ': ' + collectDmg(L, user) + ' right now' : '') + '.';
    },
    flavor: 'Somebody is paying for all of this. It will not be Corelos.',
    execute: function (ctx) {
      const u = ctx.targetUnit;
      if (!active(u)) return;
      FX().beam(ctx.user, u, { color: CRIMSON, width: 4, kind: 'lightning' });
      A().damage(ctx.user, u, collectDmg(ctx.L, ctx.user), { tags: ['cor_collect'] });
    },
  });

  // Signature: Read the Fine Print (v2: the fine print voids every foe's next turn)
  skill({
    id: 'cor_fine_print', name: 'Read the Fine Print', icon: '📜', kind: 'spell', tags: ['aoe', 'control', 'stun'], ap: 2, hype: 100,
    levels: [{ turns: 1 }],
    target: { type: 'self' }, area: { shape: 'all_foes' },
    desc: function () { return 'Every foe is Stunned: it skips its next turn.'; },
    flavor: 'Section 9, Clause 4, Subclause "Gotcha": everything you planned is void.',
    execute: function (ctx) {
      const me = ctx.user;
      FX().banner('READ THE FINE PRINT', { sub: 'Section 9, Clause 4: everything you planned is void.', color: VIOLET_LIGHT });
      FX().flash(VIOLET, 260);
      FX().shake(7, 320);
      ctx.foes.forEach(function (f, i) {
        if (!active(f)) return;
        letter(me, f, { parallel: i > 0 });
        if (A().addStatus(f, 'stun', { turns: ctx.L.turns }, me)) FX().text(f, 'VOID!', { color: '#ffe14d', size: 15 });
      });
    },
  });

  // ---- the Infernal Lawyer (summon) -----------------------------------------------------------------------
  skill({
    id: 'cor_imp_poke', owner: 'summon', name: 'Billable Poke', icon: '🔱', kind: 'attack', tags: ['melee'], ap: 1,
    levels: [{ dmg: 3 }, { dmg: 4 }, { dmg: 5 }],
    target: { type: 'unit', range: [1, 1], filter: 'enemy' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage.'; },
    flavor: 'That will be 300 gold for the consultation.',
    execute: function (ctx) {
      const u = ctx.targetUnit;
      if (!u) return;
      FX().lunge(ctx.user, u);
      A().damage(ctx.user, u, ctx.L.dmg);
    },
  });
  // one verb at every level (the Lawyer's levels grow its HP and its poke); Block for it comes from Soul Contract
  skill({
    id: 'cor_imp_objection', owner: 'summon', name: 'Objection!', icon: '🙅', kind: 'utility', tags: ['taunt', 'ranged'], ap: 1, cooldown: 2,
    levels: [{ turns: 1 }],
    target: { type: 'unit', range: [1, 4], los: true, filter: 'enemy' },
    desc: function () { return 'Taunt a foe: on its next turn it must attack this Lawyer if it can.'; },
    flavor: '"Objection! Leading the witness! The witness is my client! My client is a goblin!"',
    execute: function (ctx) {
      const u = ctx.targetUnit;
      if (!active(u)) return;
      FX().text(ctx.user, 'OBJECTION!', { color: '#ffcf4a', size: 17 });
      A().addStatus(u, 'taunt', { turns: ctx.L.turns }, ctx.user);
    },
  });

  DD.registerSummon({
    id: IMP, name: 'Infernal Lawyer', hp: 12, mov: 4, ap: 2, armor: 0, tags: ['demon', 'imp'], flags: { flying: true },
    names: ['Barrister Brimstone', 'Habeas Corpse', 'Torts McGee', 'Sue Ifer', 'Mortimer Pitchwick, Esq.', 'Billable Bill', 'Litigious Lou', 'Clause-Wits'],
    sprite: {
      base: 'flyer', scale: 0.72, outfit: 'coat', shape: { body: 'imp' },
      palette: { skin: '#cf3a3f', cloth: '#1d1b27', cloth2: '#f2efe8', hair: '#1d1b27', metal: '#d8b64a', eye: '#ffd84a', accent: '#ffcc33',
        outline: '#150c12', wing: '#6e1420', book: '#5a2a1a' },
      head: { eyes: 'glow', mouth: 'grin', face: 'glasses' },
      mainhand: 'book',
    },
    skills: ['cor_imp_poke', 'cor_imp_objection'],
    barks: {
      spawn: ['Did somebody say "liability"?', 'I bill in six-minute increments.', 'Objection! I just got here.'],
      attack: ['That\'s billable!', 'Consider yourself deposed.', 'See you in court!'],
      hurt: ['That\'s assault! I\'ll sue!', 'My briefcase!', 'Hearsay! Painful hearsay!'],
      death: ['I\'ll see you... in court...', 'No... refunds...', 'Tell my clients... I\'m sorry... for nothing.'],
    },
    desc: 'A tiny devil in a tiny suit with an enormous retainer. Objects to everything, including being stabbed.',
  });

  // ---- items --------------------------------------------------------------------------------------
  DD.registerItem({
    id: 'cor_quill', name: 'Quill of Questionable Provenance', slot: 'weapon', rarity: 'rare', icon: '🪶', hero: HERO, stats: {},
    desc: 'Corelos\' runes deal +' + QUILL_BONUS + ' damage.',
    flavor: 'Signs in blood. Not his, the paperwork insists.',
    // no hooks: burst() reads the item (the +2 is part of the burst, before Weak / Inspired)
  });
  DD.registerItem({
    id: 'cor_soul_card', name: 'Platinum Soul Card', slot: 'trinket', rarity: 'rare', icon: '💳', hero: HERO, stats: {},
    desc: 'Every foe that dies pays off ' + CARD_PAYOFF + ' of Corelos\' Debt (instead of ' + PAYOFF + ').',
    flavor: 'No pre-set spending limit. Interest compounds in the Nine Hells.',
    // no hooks: payoffFor() reads the item
  });
  DD.registerItem({
    id: 'cor_notarized', name: 'Notarized Soul (Photocopy)', slot: 'armor', rarity: 'legendary', icon: '📄', hero: HERO, stats: { hp: 6 },
    desc: '+6 max HP. Once per combat, instead of going down Corelos stays up at half his max HP and takes ' + NOTARIZED_DEBT + ' Debt.',
    flavor: 'The original is in a vault in Hell. This copy is legally binding on most planes.',
    hooks: {
      preventDeath: function (u) {
        if (!u || u.kind !== 'hero' || !hasItem(u, 'cor_notarized')) return false;
        u.data = u.data || {};
        if (u.data.corNotarized) return false;
        u.data.corNotarized = true;
        u.hp = Math.max(1, Math.round(u.maxHp * 0.5));
        A().touch();
        FX().text(u, '📄 NOTARIZED!', { color: GOLD, size: 18 });
        A().log(u.name + ' produces a notarized copy of his soul. Death will need a second signature.', 'hero');
        addDebt(u, NOTARIZED_DEBT, u);
        return true;
      },
    },
  });

  // ---- the hero ----------------------------------------------------------------------------------
  /** Glowing runes (raido, othala, algiz) stitched into the robe's lower front (sprite overlay, visual only). */
  function robeRunes(g, t) {
    const time = typeof t === 'number' ? t : 0;
    const a = 0.55 + 0.35 * Math.sin(time * 2.4);
    const col = U.rgba(VIOLET_LIGHT, 0.65 + 0.35 * a), w = 0.95;
    const glow = function (x, y, s) { g.glow(x, y, s * 2.4, VIOLET, 0.32 * a); };
    // raido ᚱ
    let x = -4.6, y = -7, s = 1.9;
    glow(x, y, s);
    g.line(x - s * 0.4, y - s, x - s * 0.4, y + s, col, w);
    g.line(x - s * 0.4, y - s, x + s * 0.5, y - s * 0.45, col, w);
    g.line(x + s * 0.5, y - s * 0.45, x - s * 0.4, y + s * 0.05, col, w);
    g.line(x - s * 0.4, y + s * 0.05, x + s * 0.55, y + s, col, w);
    // othala ᛟ
    x = 0.4; y = -6.2; s = 1.9;
    glow(x, y, s);
    g.line(x, y - s, x + s * 0.6, y - s * 0.3, col, w); g.line(x + s * 0.6, y - s * 0.3, x, y + s * 0.35, col, w);
    g.line(x, y + s * 0.35, x - s * 0.6, y - s * 0.3, col, w); g.line(x - s * 0.6, y - s * 0.3, x, y - s, col, w);
    g.line(x - s * 0.25, y + s * 0.1, x + s * 0.6, y + s, col, w); g.line(x + s * 0.25, y + s * 0.1, x - s * 0.6, y + s, col, w);
    // algiz ᛉ
    x = 5.2; y = -7.2; s = 1.9;
    glow(x, y, s);
    g.line(x, y - s, x, y + s, col, w);
    g.line(x, y, x - s * 0.75, y - s, col, w); g.line(x, y, x + s * 0.75, y - s, col, w);
  }

  DD.registerHero({
    id: HERO, name: 'Corelos', epithet: 'the Undersigned', race: 'Human (Mostly)', cls: 'Runic Sorcerer',
    role: 'Rune traps & dark bargains', complexity: 2,
    blurb: 'Corelos has signed every contract ever slid across a table, including three written on the backs of demons. ' +
      'He paints exploding runes exactly where monsters are about to step, buys power on credit, and lets the dead pay his tab.',
    color: '#9b5cff',
    unlock: null, // all heroes are available from the start (v2, user request)
    stats: { hp: 24, ap: 3, mov: 4, armor: 0, init: 1 },
    growth: { hp: 4 },
    flags: {},
    sprite: {
      base: 'humanoid', scale: 1, build: 'slim', outfit: 'robe',
      palette: { skin: '#e2c6b0', cloth: '#3a2c74', cloth2: '#b51d3d', hair: '#dcd6ee', metal: '#d8b64a', eye: '#e3b6ff', accent: VIOLET,
        outline: '#140c22', quill: '#e23d5c', parchment: PARCH, sash: '#b51d3d', hat: '#3a2c74' },
      head: { hat: 'hood', eyes: 'glow', mouth: 'grin', beard: 'stubble', blush: false },
      mainhand: 'quill', offhand: 'scroll',
      extras: ['sash'],
      aura: { kind: 'runes', color: '#c48cff' },
      overlay: robeRunes,
    },
    basic: 'cor_rune_bolt',
    signature: 'cor_fine_print',
    passive: {
      name: 'Collateral Damage',
      desc: 'Bargains cost Debt, paid in HP at the start of his next turn. Every foe that dies before then pays off ' + PAYOFF + ' of it.',
      hooks: {
        onAnyDeath: function (unit, dead) {
          if (!collateral(unit) || !active(unit) || !dead || !G().hostile(unit, dead) || !A().hasStatus(unit, DEBT)) return;
          payOff(unit, payoffFor(unit), dead.name + '\'s soul');
        },
        // Debt does not outlive the fight (statuses never do): flavour only
        onCombatEnd: function (unit, result) {
          const owed = debtOf(unit);
          if (owed > 0 && result === 'victory') A().log(unit.name + ' skips town owing ' + owed + ' Debt. The patron will be in touch.', 'hero');
        },
      },
    },
    startingSkills: ['cor_glyph', 'cor_bargain'],
    skillPool: ['cor_glyph', 'cor_bargain', 'cor_detonate', 'cor_served', 'cor_restraining', 'cor_cease', 'cor_sign_here',
      'cor_soul_contract', 'cor_lawyer', 'cor_collect'],
    summons: [IMP],
    barks: {
      select: ['Corelos. Sign here, here, and... here.', 'You read the terms? Of course you didn\'t.', 'I\'m listening. For a modest retainer.',
        'Everything you say is now legally binding.', 'Runes inscribed. Souls pending.'],
      start: ['Gentlemen, I believe you\'re standing on my runes.', 'Let\'s settle this out of court. Violently.',
        'Per my last rune, you are all in breach.', 'Everyone signed the waiver? Marwyn, that\'s a napkin.', 'I\'ve drafted a strongly worded explosion.',
        'Betty, do NOT eat the contract before they sign it.'],
      move: ['Changing venue.', 'Mind the runes. They\'re for them, not you.', 'Walking. Billing for it.', 'Strategic relocation. Totally not fleeing.',
        'Stepping carefully. Hjalmar was here first.'],
      kill: ['Contract terminated.', 'Your soul has been processed. Next!', 'Collateral: collected.', 'That\'s what the fine print was for.', 'Paid in full. With you.',
        'Pebbles, fetch the soul! Good boy. Do NOT chew it.'],
      hurt: ['That goes on your tab.', 'Ow! Adding that to the settlement.', 'Assaulting a sorcerer? That\'s a felony.', 'Unacceptable terms!'],
      lowhp: ['I may have overextended my credit.', 'Somebody co-sign me. Anybody. Buga?', 'The patron is calling. I\'m not picking up.',
        'Low on HP. High on liabilities.', 'Valdris, forge me a loophole. Any size.'],
      downed: ['I... never read... the fine print...', 'Tell my patron... the check\'s in the mail...', 'This... voids... my warranty...', 'Repossessed...'],
      revive: ['Back! Death\'s paperwork is a nightmare.', 'I appealed. I won.', 'My soul was in escrow. I\'m out.', 'Loophole found. Resuming.'],
      ally_down: ['Man down! Is that covered? IS THAT COVERED?', 'Get up! You still owe me money!', 'Someone help them! I\'ll bill you later.',
        'That was NOT in the contract!'],
      levelup: ['New powers! Terms and conditions apply.', 'Upgraded. My patron wants a word.', 'Stronger. Smarter. Deeper in debt.',
        'I signed for more power. Again.'],
      victory: ['Case closed.', 'Another flawless settlement.', 'Pleasure doing business. Mostly with corpses.',
        'Payment received. In souls. Non-refundable.', 'Zarathor, stop looting. Those souls are mine.',
        'Kiri, collect your arrows. All of them are evidence.'],
      idle: ['Syllamin, insult them faster. I bill by the hour.', 'Marbles forgot his trousers again. I have a form for that.',
        'Ellaria, the corgis are NOT covered by our insurance.', 'Slate, grumpiness is not a legal defense.',
        'Josiah, is that beak mask OSHA compliant?', 'Basanos, the werewolf clause is not boilerplate.'],
      signature: ['Did you even READ the fine print?!', 'Section 9, Clause 4: you lose.', 'Objection sustained. By me. Forever.',
        'Clause 666: you all sit this one out.'],
    },
  });

  // ---- public helpers (tests, other content) ---------------------------------------------------------------
  DD.Corelos = {
    RUNE_CAP: RUNE_CAP, PAYOFF: PAYOFF, CARD_PAYOFF: CARD_PAYOFF, QUILL_BONUS: QUILL_BONUS,
    runes: runeTiles, runesNear: runesNear, placeRune: placeRune, burst: burst, burstAll: burstAll,
    debt: debtOf, addDebt: addDebt, payOff: payOff, payoffFor: payoffFor, runeValue: runeValue, debtRelief: debtRelief,
  };
})();
