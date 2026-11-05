/* Dungeons and Degenerates — js/data/heroes/syllamin.js
 * Hero: SYLLAMIN, THE ROASTMASTER GENERAL — a four-inch, flying, foul-mouthed faerie bard (he/him, starter).
 * Role: support / debuffs / crowd control. v2 kit (DESIGN §6 "Simplicity": one verb per skill, combos carry the power).
 * Passive "Heckler": his damaging skills Roast each foe hit (status syl_roasted, 1-3 stacks, no decay); at 3 the foe
 * suffers Emotional Damage — the stacks clear, it is Stunned (elites and bosses: Weakened 2 turns) and the party gains
 * 6 Hype. Combo setups for the party: Mosh Pit (clusters foes for an AoE), Glitter Bomb (slippery ground: pushes slide
 * further), Hype Man (Empowered + AP for the big hitter), Lullaby III (Marked sleepers), Heckle (Charm). Attacks of
 * opportunity: his basic is ranged (he never makes one), but Charm / Sleep / Stun / Dazzle switch a foe's off and Fae
 * Blink (a teleport) pulls a pinned ally out without provoking.
 * Registers: hero syllamin, basic + signature + 10 pool skills, status syl_roasted, surface syl_glitter, 3 items,
 * narration keys syl_*. Helpers for other content: DD.Syllamin.roast / emotionalDamage / blinkSpot.
 * Swearing is bleeped (#$%&) and stays PG-13 by implication; mechanics text is exact.
 */
(function () {
  'use strict';
  const DD = window.DD;

  const PINK = '#ff3fa4', HOT = '#ff5fd2', GOLD = '#ffd23f', MINT = '#2fffa0', TEAR = '#7fc8ff', BLUE = '#8fb7ff';
  const ROAST_MAX = 3;      // Roasted stacks that trigger Emotional Damage
  const EMO_HYPE = 6;       // party Hype per Emotional Damage on an enemy
  const EMO_WEAK = 2;       // elites and bosses are Weakened this many turns instead of Stunned
  const MIX_HYPE = 4;       // Platinum Diss Mixtape: extra Hype per Emotional Damage

  const JOKES = [
    'Your mom\'s so big she counts as difficult terrain!',
    'Your mom\'s so ugly, mimics pretend to be HER!',
    'Your mom\'s so old, she was a tutorial monster!',
    'Your mom\'s so slow, a gelatinous cube lapped her!',
    'Your mom failed a Perception check on a WALL!',
    'Your mom\'s so ugly, the beholder shut all its eyes!',
    'Your mom rolls natural 1s on PURPOSE!',
    'Your mom\'s so dense, a Fireball bounced off her!',
    'Your mom\'s lair action is complaining!',
    'Your mom\'s so cheap she haggles with mimics!',
    'Your mom has disadvantage on being likable!',
    'Your mom\'s so ugly, the DM made her roll again!',
    'Your mom rolled initiative and came in LAST!',
  ];
  const BLEEPS = ['#$%&!', '@#$%!', '*BLEEP*', '&%#@!', '#@&%$!'];

  // ---- small helpers (runtime only) ---------------------------------------------------------------------
  function A() { return DD.Act; }
  function S() { return DD.Combat && DD.Combat.state; }
  function active(u) { return !!u && !u.dead && !u.downed; }
  function alive(u) { return active(u) && u.hp > 0; }
  function foeOf(a, b) { return !!a && active(b) && DD.Grid.hostile(a, b); }
  function has(u, id) { return DD.Act.hasStatus(u, id); }
  function hasItem(u, id) { return !!u && Array.isArray(u.items) && u.items.indexOf(id) >= 0; }
  /** Can take its next turn (ally buffs would be wasted on a stunned, sleeping or polymorphed ally). */
  function canAct(u) { return active(u) && !DD.Combat.isStunned(u) && !has(u, 'sheep'); }
  function cosmetic() { return !DD.Act.simulating; }
  function pick(list) { return DD.util.line(list, DD.rng); }
  function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }
  function size(key) { return function (L) { return L[key]; }; }

  /** Cosmetic: a floating bleep over a unit (never touches game state). */
  function bleep(at) { if (cosmetic() && at) DD.FX.text(at, pick(BLEEPS), { color: HOT, size: 13, parallel: true }); }

  /** Basic-attack banter: a "your mom" joke now and then, a rude gesture while silenced. */
  function joke(user) {
    if (!cosmetic() || !active(user)) return;
    if (has(user, 'silenced')) { DD.FX.text(user, '*rude gesture*', { color: HOT, size: 13 }); return; }
    if (DD.rng.next() < 0.35) A().bark(user, pick(JOKES));
  }

  /**
   * Run fn and make the visual events it queues play together (one beat: e.g. a verse hitting every foe at once).
   * Visual-only: logic already resolved; instant mode has no queue.
   */
  function together(fn) {
    const q = DD.FX.queue;
    const start = q.length;
    fn();
    if (DD.FX.instant) return;
    for (let i = start + 1; i < q.length; i++) q[i].parallel = true;
  }

  // ---- Roasted + Emotional Damage ----------------------------------------------------------------------
  /** Roast a foe n times (default 1). Returns the status instance or null. Emotional Damage triggers itself. */
  function roast(src, target, n) {
    if (!alive(target)) return null;
    if (src && !DD.Grid.hostile(src, target)) return null;
    const inst = A().addStatus(target, 'syl_roasted', { stacks: n || 1, silent: true }, src || null);
    if (inst && active(target) && has(target, 'syl_roasted') && cosmetic()) {
      DD.FX.text(target, '🍗 Roasted ' + inst.stacks, { color: '#ff9a5a', size: 12, parallel: true });
    }
    return inst;
  }

  /** Elites and bosses don't get stunned by a meltdown (no stun-locking a boss with three jokes a turn). */
  function thickSkinned(unit) { return A().isBoss(unit) || unit.tier === 'elite'; }

  /** Emotional Damage: the Roasted stacks clear, the unit is Stunned (elites / bosses: Weakened) and the party gains Hype. */
  function emotionalDamage(unit, src) {
    if (!S() || !alive(unit)) return false;
    A().removeStatus(unit, 'syl_roasted', { silent: true });
    DD.FX.text(unit, 'EMOTIONAL DAMAGE!', { color: HOT, size: 19 });
    DD.FX.particles(unit, { kind: 'bubbles', count: 12, color: TEAR });
    A().log(unit.name + ' suffers EMOTIONAL DAMAGE!', 'status');
    if (thickSkinned(unit)) A().addStatus(unit, 'weak', { turns: EMO_WEAK }, src || null);
    else A().addStatus(unit, 'stun', { turns: 1 }, src || null);
    if (unit.side === 'enemy') {
      A().gainHype(EMO_HYPE + (hasItem(src, 'syl_mixtape') ? MIX_HYPE : 0), 'Emotional Damage');
      if (cosmetic() && DD.rng.next() < 0.3) A().narrate('syl_emotional_damage', { hero: src ? src.name : 'Syllamin', enemy: unit.name });
    }
    return true;
  }

  DD.registerStatus({
    id: 'syl_roasted', name: 'Roasted', icon: '🍗', color: '#ff7a3d', type: 'debuff', stacking: 'stack', maxStacks: ROAST_MAX,
    decay: 'never', defaultTurns: -1,
    desc: function (st) {
      const n = st && st.stacks > 0 ? st.stacks : 1;
      return 'Roasted ' + n + '/' + ROAST_MAX + '. At ' + ROAST_MAX + ': Emotional Damage (the stacks clear and it is Stunned; ' +
        'elites and bosses are Weakened for ' + EMO_WEAK + ' turns instead).';
    },
    hooks: {
      onStatusApplied: function (unit, inst, src, st) { if (inst && inst === st && st.stacks >= ROAST_MAX) emotionalDamage(unit, src); },
    },
  });

  // ---- Glitter (surface) ---------------------------------------------------------------------------------
  DD.registerSurface({
    id: 'syl_glitter', name: 'Glitter', color: 'rgba(255,110,214,0.42)', turns: 2, slide: true,
    desc: 'Slippery: a grounded unit pushed onto it slides 1 extra tile (flyers just glide over). Fire burns it away.',
    react: { fire: { surface: null } },
    draw: function (g, sf, t) {
      const tl = g.tile || { x: 0, y: 0 };
      g.diamond(0, 0, 30, 15, 'rgba(255,95,200,0.30)');
      g.diamond(0, 1, 17, 8.5, 'rgba(255,200,245,0.20)');
      const cols = ['#ffffff', '#ff8ee6', '#9ff3ff', '#fff3a3'];
      for (let i = 0; i < 8; i++) {
        const h1 = Math.sin(tl.x * 12.9898 + tl.y * 78.233 + i * 37.719) * 43758.5453;
        const h2 = Math.sin(h1) * 9631.73;
        const x = ((h1 - Math.floor(h1)) - 0.5) * 40, y = ((h2 - Math.floor(h2)) - 0.5) * 18;
        const tw = 0.5 + 0.5 * Math.sin((t || 0) * 5 + i * 1.7 + tl.x * 0.9 + tl.y * 1.3);
        const r = 0.7 + 1.9 * tw, col = cols[i % cols.length];
        g.line(x - r, y, x + r, y, col, 0.9);
        g.line(x, y - r * 0.6, x, y + r * 0.6, col, 0.9);
      }
    },
  });

  // ---- Fae Blink landing tile ----------------------------------------------------------------------------
  /** Free tile next to `user` for `ally`: no hazard if possible, then nearest to the ally (N, E, S, W on ties). */
  function blinkSpot(user, ally) {
    if (!user || !ally || !DD.Grid || !S()) return null;
    let best = null, bd = Infinity;
    DD.util.DIRS.forEach(function (d) {
      const x = user.x + d.x, y = user.y + d.y;
      if (!DD.Grid.inBounds(x, y) || !DD.Grid.isFree(x, y, ally)) return;
      if (!DD.Grid.isFlying(ally) && DD.Grid.isDrop(x, y)) return;
      const score = (DD.Grid.hazardAt(x, y, ally) ? 100 : 0) + Math.abs(ally.x - x) + Math.abs(ally.y - y);
      if (score < bd) { bd = score; best = { x: x, y: y }; }
    });
    return best;
  }

  // ---- Mic Drop visual -------------------------------------------------------------------------------------
  function drawMic(c, x, y, p, view) {
    const z = view && view.zoom ? view.zoom : 1;
    const fall = Math.min(1, p / 0.75);
    const yy = y - (1 - fall * fall) * 150 * z - 18 * z;
    c.save();
    c.translate(x, yy);
    c.rotate(0.5 - fall * 0.5);
    c.fillStyle = '#2a2633'; c.strokeStyle = '#100c14'; c.lineWidth = 1.5 * z;
    c.beginPath(); c.rect(-2.6 * z, 0, 5.2 * z, 16 * z); c.fill(); c.stroke();
    c.fillStyle = PINK; c.fillRect(-2.6 * z, 10 * z, 5.2 * z, 2 * z);
    c.beginPath(); c.arc(0, -3 * z, 6 * z, 0, Math.PI * 2);
    c.fillStyle = '#d9dbe6'; c.fill(); c.stroke();
    c.strokeStyle = '#8a8d9a'; c.lineWidth = 0.8 * z;
    for (let i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(-5 * z, (-3 + i * 2.4) * z); c.lineTo(5 * z, (-3 + i * 2.4) * z); c.stroke(); }
    c.restore();
  }

  // ---- skills -------------------------------------------------------------------------------------------
  function skill(def) {
    def.owner = 'syllamin';
    return DD.registerSkill(def);
  }
  /** Ally buffs: refuse an ally that will lose its next turn anyway (stunned, asleep, a sheep). */
  function readyAlly(ctx) { return ctx.targetUnit && canAct(ctx.targetUnit) ? true : 'They can\'t act next turn.'; }

  skill({
    id: 'syl_basic', name: 'Your Mom Joke', icon: '🤬', kind: 'attack', tags: ['ranged', 'psychic'],
    ap: 1, cooldown: 0, levels: [{ dmg: 5, range: 4 }],
    target: { type: 'unit', range: function (L) { return [1, L.range]; }, los: true, filter: 'enemy' },
    desc: function (L) { return 'Deal ' + L.dmg + ' psychic damage to a foe up to ' + L.range + ' tiles away.'; },
    flavor: 'Every monster has a mom. Every mom is fair game. Those are the rules.',
    execute: function (ctx) {
      const u = ctx.user, t = ctx.targetUnit;
      if (!t || !foeOf(u, t)) return;
      DD.FX.projectile(u, t, { kind: 'note', color: PINK });
      A().damage(u, t, ctx.L.dmg, { element: 'psychic' });
      bleep(t);
      joke(u);
    },
  });

  skill({
    id: 'syl_heckle', name: 'Heckle', icon: '🗯️', kind: 'spell', tags: ['ranged', 'psychic', 'charm'],
    ap: 2, cooldown: 2,
    levels: [{ dmg: 4, range: 4 }, { dmg: 5, range: 4 }, { dmg: 6, range: 5 }],
    target: { type: 'unit', range: function (L) { return [1, L.range]; }, los: true, filter: 'enemy' },
    desc: function (L) {
      return 'Deal ' + L.dmg + ' psychic damage to a foe up to ' + L.range + ' tiles away and Charm it: on its next turn it fights ' +
        'for your side.';
    },
    flavor: '"Did you hear what HE said about your mom?" He did not. It does not matter.',
    execute: function (ctx) {
      const u = ctx.user, t = ctx.targetUnit;
      if (!t || !foeOf(u, t)) return;
      DD.FX.projectile(u, t, { kind: 'note', color: HOT });
      if (cosmetic()) DD.FX.text(t, 'WHO ASKED YOU?!', { color: HOT, size: 15 });
      A().damage(u, t, ctx.L.dmg, { element: 'psychic' });
      if (!alive(t)) return;
      const inst = A().addStatus(t, 'charmed', { turns: 1 }, u);
      if (inst && cosmetic()) {
        DD.FX.text(t, '😡 Who said that?!', { color: HOT, size: 14 });
        if (DD.rng.next() < 0.5) A().narrate('syl_heckle', { hero: u.name, enemy: t.name });
      }
    },
  });

  skill({
    id: 'syl_power_ballad', name: 'Power Ballad', icon: '🎶', kind: 'spell', tags: ['aoe', 'buff', 'song'],
    ap: 1, cooldown: 2,
    levels: [{ r: 2, turns: 1 }, { r: 3, turns: 1 }, { r: 3, turns: 2 }],
    target: { type: 'self' }, area: { shape: 'circle', size: size('r') },
    desc: function (L) {
      return 'You and allies within ' + L.r + ' tiles are Inspired (+25% damage) for ' + plural(L.turns, 'turn') + '.';
    },
    flavor: 'Eleven minutes long. Nine of them are a lute solo. Marwyn cried. MAGNIFICENTLY.',
    execute: function (ctx) {
      const u = ctx.user, L = ctx.L;
      DD.FX.explosion(u, { radius: L.r, color: GOLD, kind: 'song' });
      DD.FX.particles(u, { kind: 'notes', count: 16, color: GOLD });
      ctx.friends.forEach(function (f) { if (active(f)) A().addStatus(f, 'inspired', { turns: L.turns }, u); });
    },
  });

  skill({
    id: 'syl_hype_man', name: 'Hype Man', icon: '📣', kind: 'buff', tags: ['ally', 'buff', 'ap'],
    ap: 1, cooldown: function (L) { return L.cd; },
    levels: [{ gain: 1, cd: 2 }, { gain: 1, cd: 1 }, { gain: 2, cd: 1 }],
    target: { type: 'unit', range: [1, 5], los: false, filter: 'ally', canTarget: readyAlly },
    desc: function (L) {
      return 'An ally up to 5 tiles away gains ' + L.gain + ' AP on its next turn and is Empowered (its next damaging skill deals +50%).';
    },
    flavor: '"WHO\'S THE BEST? YOU\'RE THE BEST! NOW GO HIT IT!" — at a volume fairies should not reach.',
    execute: function (ctx) {
      const u = ctx.user, t = ctx.targetUnit, L = ctx.L;
      if (!t || !active(t) || DD.Grid.hostile(u, t)) return;
      DD.FX.projectile(u, t, { kind: 'note', color: GOLD });
      if (cosmetic()) DD.FX.text(t, 'YOU\'RE THE BEST!', { color: GOLD, size: 14 });
      A().gainAp(t, L.gain);
      A().addStatus(t, 'empowered', { stacks: 1 }, u);
    },
  });

  skill({
    id: 'syl_shriek', name: 'Discordant Shriek', icon: '🔊', kind: 'spell', tags: ['aoe', 'cone', 'push', 'psychic'],
    ap: 2, cooldown: 2,
    levels: [{ dmg: 4, len: 2, push: 1 }, { dmg: 5, len: 2, push: 1 }, { dmg: 6, len: 3, push: 2 }],
    target: { type: 'dir' }, area: { shape: 'cone', size: size('len') },
    desc: function (L) {
      return 'Deal ' + L.dmg + ' psychic damage to foes in a ' + L.len + '-deep cone and push them ' + plural(L.push, 'tile') + ' away.';
    },
    flavor: 'Somewhere between a high C and a war crime. Bats file a noise complaint.',
    execute: function (ctx) {
      const u = ctx.user, L = ctx.L, dir = ctx.dir;
      let reach = L.len;
      while (reach > 1 && !DD.Grid.inBounds(u.x + dir.x * reach, u.y + dir.y * reach)) reach--;
      DD.FX.beam(u, { x: u.x + dir.x * reach, y: u.y + dir.y * reach }, { color: HOT, width: 10 });
      DD.FX.particles(u, { kind: 'notes', count: 10, color: HOT });
      DD.FX.shake(4, 220);
      // the far ones first, so the front row isn't pushed into the back row
      ctx.foes.slice().sort(function (a, b) { return DD.Grid.dist(u, b) - DD.Grid.dist(u, a); }).forEach(function (f) {
        if (!alive(f)) return;
        A().damage(u, f, L.dmg, { element: 'psychic' });
        if (alive(f)) A().push(u, f, dir, L.push);
      });
    },
  });

  skill({
    id: 'syl_glitter_bomb', name: 'Glitter Bomb', icon: '✨', kind: 'utility', tags: ['aoe', 'ranged', 'dazzle', 'surface'],
    ap: 2, cooldown: 2,
    levels: [{ r: 1, glitter: 2 }, { r: 1, glitter: 3 }, { r: 2, glitter: 3 }],
    target: { type: 'tile', range: [1, 5], los: true, filter: 'any' }, area: { shape: 'circle', size: size('r') },
    desc: function (L) {
      return 'Dazzle foes in radius ' + L.r + ' and leave slippery Glitter there for ' + plural(L.glitter, 'round') +
        ' (not over other surfaces).';
    },
    flavor: 'Weapons-grade arts and crafts. Dwarven archaeologists will still be finding it in a thousand years.',
    execute: function (ctx) {
      const u = ctx.user, L = ctx.L, c = ctx.target;
      if (!c) return;
      DD.FX.projectile(u, c, { kind: 'orb', color: HOT, arc: true });
      DD.FX.explosion(c, { radius: L.r, color: HOT, kind: 'glitter' });
      DD.FX.particles(c, { kind: 'glitter', count: 26, color: HOT });
      ctx.foes.forEach(function (f) { if (alive(f)) A().addStatus(f, 'dazzled', { turns: 1 }, u); });
      ctx.tiles.forEach(function (p) {
        const tl = DD.Grid.tile(p.x, p.y);
        if (tl && !tl.surface) A().setSurface(p.x, p.y, 'syl_glitter', L.glitter);
      });
    },
  });

  skill({
    id: 'syl_lullaby', name: 'Lullaby of Mediocrity', icon: '💤', kind: 'spell', tags: ['aoe', 'ranged', 'sleep', 'control', 'song'],
    ap: 2, cooldown: 3,
    levels: [{ r: 1, turns: 1, mark: 0 }, { r: 1, turns: 2, mark: 0 }, { r: 1, turns: 2, mark: 3 }],
    target: { type: 'tile', range: [1, 4], los: true, filter: 'any' }, area: { shape: 'circle', size: size('r') },
    desc: function (L) {
      return 'Foes in radius ' + L.r + ' fall Asleep for ' + plural(L.turns, 'turn') + ' (damage wakes them up)' +
        (L.mark ? ' and are Marked ' + L.mark : '') + '.';
    },
    flavor: 'A ballad about tax forms, sung in a monotone. Even he nods off at the bridge.',
    execute: function (ctx) {
      const u = ctx.user, L = ctx.L, c = ctx.target;
      if (!c) return;
      DD.FX.particles(c, { kind: 'notes', count: 18, color: BLUE });
      ctx.foes.forEach(function (f) {
        if (!alive(f)) return;
        A().addStatus(f, 'sleep', { turns: L.turns }, u);
        if (L.mark && alive(f)) A().addStatus(f, 'marked', { stacks: L.mark }, u);
        if (cosmetic()) DD.FX.text(f, 'Zzz...', { color: BLUE, size: 13, parallel: true });
      });
    },
  });

  skill({
    id: 'syl_encore', name: 'Encore!', icon: '🔁', kind: 'buff', tags: ['ally', 'cooldown'],
    ap: function (L) { return L.ap; }, cooldown: 0, charges: 2,
    levels: [{ ap: 2, gain: 0 }, { ap: 1, gain: 0 }, { ap: 1, gain: 1 }],
    target: {
      type: 'unit', range: [1, 5], los: false, filter: 'ally',
      canTarget: function (ctx) {
        const t = ctx.targetUnit;
        const ready = readyAlly(ctx);
        if (ready !== true) return ready;
        // only a cooldown still running on its next turn is worth a charge (cd 1 ticks to 0 at that turn's start,
        // unless it was used since its last turn: a fresh cooldown skips that tick)
        const busy = DD.Combat.slotsOf(t).some(function (sl) { return sl.cd > (sl.fresh ? 0 : 1); });
        return busy || (ctx.L && ctx.L.gain > 0) ? true : 'Its skills are ready by its next turn anyway.';
      },
    },
    desc: function (L) {
      return 'Reset every skill cooldown of an ally up to 5 tiles away' + (L.gain ? ' and it gains ' + L.gain + ' AP on its next turn' : '') +
        '. 2 uses per combat.';
    },
    flavor: '"ONE MORE! ONE MORE!" — the crowd, the band, and the DM, who has run out of encounters.',
    execute: function (ctx) {
      const u = ctx.user, t = ctx.targetUnit;
      if (!t || !active(t) || DD.Grid.hostile(u, t)) return;
      DD.FX.particles(t, { kind: 'sparks', count: 14, color: GOLD });
      if (cosmetic()) DD.FX.text(t, 'ENCORE!', { color: GOLD, size: 16 });
      A().resetCooldowns(t);
      if (ctx.L.gain) A().gainAp(t, ctx.L.gain);
      A().log(u.name + ' demands an encore from ' + t.name + '.', 'hero');
    },
  });

  skill({
    id: 'syl_fae_blink', name: 'Fae Blink', icon: '🧚', kind: 'move', tags: ['ally', 'teleport', 'rescue'],
    ap: 1, cooldown: 2,
    levels: [{ range: 6, block: 3 }, { range: 7, block: 4 }, { range: 8, block: 6 }],
    target: {
      type: 'unit', range: function (L) { return [2, L.range]; }, los: false, filter: 'ally',
      canTarget: function (ctx) { return blinkSpot(ctx.user, ctx.targetUnit) ? true : 'No free tile next to Syllamin.'; },
    },
    area: {
      shape: 'custom',
      fn: function (ctx) {
        if (!ctx || !ctx.user || !ctx.target) return [];
        const t = ctx.targetUnit || DD.Grid.unitAt(ctx.target.x, ctx.target.y);
        const p = t && t !== ctx.user ? blinkSpot(ctx.user, t) : null;
        return p ? [p] : [];
      },
    },
    desc: function (L) {
      return 'Teleport an ally 2-' + L.range + ' tiles away to a free tile next to you. It gains ' + L.block + ' Block.';
    },
    flavor: 'Fairy dust: 10% magic, 90% glitter, 100% impossible to get out of Marwyn\'s beard.',
    execute: function (ctx) {
      const u = ctx.user, t = ctx.targetUnit, L = ctx.L;
      if (!t || !active(t) || DD.Grid.hostile(u, t)) return;
      const spot = blinkSpot(u, t);
      if (!spot) return;
      DD.FX.particles(t, { kind: 'glitter', count: 16, color: MINT });
      if (!A().teleport(t, spot.x, spot.y)) return;
      DD.FX.particles(t, { kind: 'glitter', count: 16, color: MINT });
      if (active(t)) A().addBlock(t, L.block);
    },
  });

  skill({
    id: 'syl_mosh_pit', name: 'Mosh Pit', icon: '🤘', kind: 'attack', tags: ['aoe', 'pull', 'ranged'],
    ap: 1, cooldown: 2,
    levels: [{ dmg: 2, r: 2, pull: 1 }, { dmg: 3, r: 2, pull: 1 }, { dmg: 3, r: 3, pull: 2 }],
    target: { type: 'tile', range: [1, 5], los: true, filter: 'any' }, area: { shape: 'circle', size: size('r') },
    desc: function (L) {
      return 'Foes within ' + L.r + ' tiles of the target tile take ' + L.dmg + ' damage and are pulled up to ' + plural(L.pull, 'tile') + ' toward it.';
    },
    flavor: 'CIRCLE PIT! The goblins did not consent to the circle pit. Zarathor\'s fireball did.',
    execute: function (ctx) {
      const u = ctx.user, c = ctx.target, L = ctx.L;
      if (!c) return;
      DD.FX.particles(c, { kind: 'dust', count: 18 });
      if (cosmetic()) DD.FX.text(c, 'MOSH!', { color: HOT, size: 16 });
      const foes = ctx.foes.slice();
      foes.forEach(function (f) { if (alive(f)) A().damage(u, f, L.dmg); });
      // the closest move first, so the crowd packs in from the middle out
      foes.filter(function (f) { return alive(f) && !(f.x === c.x && f.y === c.y); })
        .sort(function (a, b) { return DD.Grid.dist(a, c) - DD.Grid.dist(b, c); })
        .forEach(function (f) { if (alive(f)) A().pull(u, f, c, L.pull); });
    },
  });

  skill({
    id: 'syl_mic_drop', name: 'Mic Drop', icon: '🎤', kind: 'attack', tags: ['stun', 'big'],
    ap: 3, cooldown: 0, charges: 1,
    levels: [{ dmg: 15 }, { dmg: 18 }, { dmg: 22 }],
    target: { type: 'unit', range: [1, 4], los: false, filter: 'enemy' },
    desc: function (L) {
      return 'Once per combat: deal ' + L.dmg + ' damage to a foe up to 4 tiles away (no line of sight needed) and Stun it.';
    },
    flavor: 'He says "I\'m done." He is never done. The mic weighs about as much as a goblin.',
    execute: function (ctx) {
      const u = ctx.user, t = ctx.targetUnit, L = ctx.L;
      if (!t || !foeOf(u, t)) return;
      const at = { x: t.x, y: t.y };
      DD.FX.custom('custom', { at: at, ms: 420, draw: drawMic });
      DD.FX.explosion(at, { radius: 0, color: PINK, kind: 'mic' });
      DD.FX.shake(9, 380);
      if (cosmetic()) DD.FX.text(at, 'MIC DROP', { color: GOLD, size: 18 });
      A().damage(u, t, L.dmg);
      if (alive(t)) A().addStatus(t, 'stun', { turns: 1 }, u);
    },
  });

  /** Who hears a verse: every foe on the board right now (one that split or showed up mid-track hears the rest). */
  function verseFoes(ctx) {
    const c = DD.Targeting.buildCtx(ctx.user, ctx.slot || ctx.skill, ctx.target || { x: ctx.user.x, y: ctx.user.y });
    return (c ? c.foes : ctx.foes).filter(alive);
  }

  skill({
    id: 'syl_signature', name: 'Diss Track', icon: '💿', kind: 'spell', tags: ['aoe', 'psychic', 'signature'],
    ap: 2, cooldown: 0, hype: 100,
    levels: [{ dmg: 4, verses: 3 }],
    target: { type: 'self' }, area: { shape: 'all_foes' },
    desc: function (L) {
      return L.verses + ' verses: every foe takes ' + L.dmg + ' psychic damage per verse (' + (L.dmg * L.verses) + ' total). Each verse Roasts.';
    },
    flavor: 'Track 1: "Your Mom (Remix)". Track 2: "Your Mom (Acoustic)". Track 3 got the DM\'s table banned from the venue.',
    execute: function (ctx) {
      const u = ctx.user, L = ctx.L;
      DD.FX.banner('DISS TRACK', { sub: 'feat. ' + u.name + ' (Explicit)', color: PINK });
      DD.FX.flash(HOT, 260);
      for (let v = 1; v <= L.verses; v++) {
        const foes = v === 1 ? ctx.foes.filter(alive) : verseFoes(ctx);
        if (!foes.length) break;
        DD.FX.text(u, 'VERSE ' + v + '!', { color: GOLD, size: 18 });
        DD.FX.shake(3 + v * 2, 260);
        together(function () {
          foes.forEach(function (f) {
            if (!alive(f)) return;
            DD.FX.particles(f, { kind: 'notes', count: 8, color: HOT });
            A().damage(u, f, L.dmg, { element: 'psychic' });
          });
        });
      }
      if (cosmetic()) A().narrate('syl_diss_track', { hero: u.name });
    },
  });

  // ---- items --------------------------------------------------------------------------------------------
  DD.registerItem({
    id: 'syl_electric_lute', name: 'The Electric Lute', slot: 'weapon', rarity: 'rare', icon: '🎸', hero: 'syllamin',
    stats: { dmg: 0.1 },
    desc: '+10% damage. Your Mom Joke deals lightning damage and electrifies the water its target stands in (it shocks everyone ' +
      'in that water, allies too).',
    flavor: 'Plugged into what? Nobody knows. It\'s fae magic and one very nervous potato.',
    hooks: {
      modifyOutgoingDamage: function (d) {
        if (d.cause === 'skill' && d.skill && d.skill.id === 'syl_basic') d.element = 'lightning';
      },
      onSkillUsed: function (ctx) {
        if (!ctx || !ctx.skill || ctx.skill.id !== 'syl_basic' || !ctx.target) return;
        if (A().waterBody(ctx.target.x, ctx.target.y).length) A().applyElement(ctx.target.x, ctx.target.y, 'lightning', ctx.user, { noUnits: true });
      },
    },
  });

  DD.registerItem({
    id: 'syl_studded_jacket', name: 'Tiny Studded Jacket', slot: 'armor', rarity: 'common', icon: '🧥', hero: 'syllamin',
    stats: { hp: 4 },
    desc: '+4 max HP. A foe that damages him from an adjacent tile is Roasted (a comeback).',
    flavor: 'Every stud is a safety pin. Every safety pin is a threat.',
    hooks: {
      onTakeDamage: function (d) {
        const me = d.target, foe = d.source;
        if (!me || !foe || d.cause !== 'skill' || !(d.amount > 0) || !alive(me) || !alive(foe)) return;
        if (!DD.Grid.hostile(me, foe) || DD.Grid.dist(me, foe) !== 1) return;
        if (cosmetic()) DD.FX.text(me, 'Comeback!', { color: HOT, size: 13 });
        roast(me, foe, 1);
      },
    },
  });

  DD.registerItem({
    id: 'syl_mixtape', name: 'Platinum Diss Mixtape', slot: 'trinket', rarity: 'legendary', icon: '📼', hero: 'syllamin',
    stats: { hype: 15 },
    desc: '+15 Hype at combat start. Each Emotional Damage gives the party ' + MIX_HYPE + ' more Hype.',
    flavor: 'Track 7 made a dragon cry. Track 8 is four minutes of him yelling "MOM" into a bucket.',
    hooks: {},
  });

  // ---- the hero -----------------------------------------------------------------------------------------
  const PASSIVE_DESC = 'His damaging skills Roast each foe they hit. At ' + ROAST_MAX + ' Roasted the foe suffers Emotional Damage: ' +
    'the stacks clear, it is Stunned (elites and bosses: Weakened for ' + EMO_WEAK + ' turns instead) and the party gains ' + EMO_HYPE + ' Hype.';

  // ---- sprite ---------------------------------------------------------------------------------------------
  // The built-in mohawk and elf ears are thin shapes that drown in the outline at this tiny scale, so the overlay
  // paints a chunky hot-pink crest, small faerie ears and a glam-rock bolt over the front eye. Local units follow
  // the humanoid painter's 'tiny' build (head radius 9.4 × head.size, shoulders at y −12.5, breathing br).
  const HEAD_SIZE = 1.12;
  function overlay(g, t, o) {
    const pal = g.pal, pose = g.pose || 'idle';
    // the painter breathes with opts.phase (drawUnit passes the unit's phase); reading the same value keeps the crest on the head
    const phase = o && typeof o.phase === 'number' && isFinite(o.phase) ? o.phase : 0;
    const br = o && o.still ? 0 : Math.sin((t || 0) * 2.2 + phase);
    const r = 9.4 * HEAD_SIZE;
    const hx = pose === 'attack' ? 1.2 : pose === 'hurt' ? -0.8 : 0;
    const hy = -12.5 + br * 0.45 - r * 0.8;
    const c = g.ctx;
    function outlined(points, fill, width) {
      c.beginPath(); c.moveTo(points[0][0], points[0][1]);
      for (let i = 1; i < points.length; i++) c.lineTo(points[i][0], points[i][1]);
      c.closePath();
      c.fillStyle = fill; c.fill();
      c.lineWidth = width; c.strokeStyle = pal.outline; c.lineJoin = 'round'; c.stroke();
    }
    // faerie ears (back ear a touch darker)
    [-1, 1].forEach(function (side) {
      const bx = hx + side * r * 0.8, by = hy + r * 0.12;
      const tx = hx + side * r * (side < 0 ? 1.62 : 1.5), ty = hy - r * 0.38;
      outlined([[bx, by - r * 0.26], [tx, ty], [bx + side * r * 0.05, by + r * 0.2]], side < 0 ? DD.util.shade(pal.skin, -0.08) : pal.skin, 1.2);
      g.line(bx + side * r * 0.12, by, bx + side * r * 0.48, by - r * 0.2, pal.inner || '#ff9ccf', 0.9);
    });
    // mohawk: four fat spikes swept back along the top of the skull
    const pts = [];
    const a0 = -Math.PI / 2 + 0.62, a1 = -Math.PI / 2 - 0.95, N = 4, TIPS = [1.8, 2.05, 1.95, 1.65];
    pts.push([hx + Math.cos(a0) * r * 0.93, hy + Math.sin(a0) * r * 0.93]);
    for (let i = 0; i < N; i++) {
      const am = a0 + (a1 - a0) * (i + 0.5) / N, ae = a0 + (a1 - a0) * (i + 1) / N;
      const sweep = -0.32 - i * 0.06, base = i === N - 1 ? 0.92 : 1.12;
      pts.push([hx + Math.cos(am + sweep) * r * TIPS[i], hy + Math.sin(am + sweep) * r * TIPS[i]]);
      pts.push([hx + Math.cos(ae) * r * base, hy + Math.sin(ae) * r * base]);
    }
    outlined(pts, pal.hair, 1.5);
    g.line(hx - r * 0.1, hy - r * 1.05, hx - r * 0.55, hy - r * 1.55, 'rgba(255,205,238,0.85)', 1.1);
    // glam-rock bolt over the front eye
    const ex = hx + 5.95, ey = hy + 0.3;
    g.poly([[ex - 1.0, ey - 4.2], [ex + 1.7, ey - 4.2], [ex + 0.3, ey - 1.0], [ex + 2.3, ey - 1.0], [ex - 1.6, ey + 3.6], [ex - 0.2, ey + 0.2], [ex - 2.0, ey + 0.2]],
      'rgba(47,255,160,0.9)', null);
  }

  // hover: he flies at shoulder height of a medium unit, so a hero or foe on the tile in front can't bury him (HP bar
  // included). Honoured for flying units since the review's sprites.js fix.
  const SPRITE = {
    base: 'humanoid', scale: 0.7, build: 'tiny', outfit: 'coat', hover: 20,
    palette: {
      skin: '#ffe0ec', cloth: '#2d1f3d', cloth2: PINK, hair: PINK, metal: '#ecebf5', eye: '#2b1530', accent: MINT,
      outline: '#2a0f26', wing: '#a8f4ff', lute: '#ffcf4a', wood: '#c2257a', inner: '#ff9ccf', blush: '#ff4f9a', boots: '#15121b', belt: '#ecebf5',
    },
    head: { size: HEAD_SIZE, ears: 'none', hair: 'none', eyes: 'angry', mouth: 'grin' },
    wings: 'fairy', mainhand: 'lute', bling: ['earrings'], extras: ['belt'],
    aura: { kind: 'notes', color: '#ff7ad1' },
    overlay: overlay,
  };

  DD.registerHero({
    id: 'syllamin', name: 'Syllamin', epithet: 'the Roastmaster General', race: 'Faerie', cls: 'Bard',
    role: 'Support · debuffs · crowd control', complexity: 2,
    blurb: 'Four inches of glitter, spite and lute. He flies over pits, roasts monsters until they cry, and heckles them into ' +
      'punching their own friends. His mother would be proud, if they were still speaking.',
    color: PINK, unlock: null,
    stats: { hp: 20, ap: 3, mov: 5, armor: 0, init: 4 }, growth: { hp: 3 },
    flags: { flying: true },
    sprite: SPRITE,
    basic: 'syl_basic', signature: 'syl_signature',
    passive: {
      name: 'Heckler', desc: PASSIVE_DESC,
      hooks: {
        // every damaging skill hit Roasts (skill damage only: bumps, burns and thorns are not his words)
        onDealDamage: function (d) {
          if (d.cause !== 'skill' || !(d.amount > 0)) return;
          const u = d.source, t = d.target;
          if (!u || !t || t === u || !alive(t) || !DD.Grid.hostile(u, t)) return;
          roast(u, t, 1);
        },
      },
    },
    startingSkills: ['syl_heckle', 'syl_power_ballad'],
    skillPool: ['syl_heckle', 'syl_power_ballad', 'syl_hype_man', 'syl_shriek', 'syl_glitter_bomb', 'syl_lullaby', 'syl_encore',
      'syl_fae_blink', 'syl_mosh_pit', 'syl_mic_drop'],
    summons: [],
    barks: {
      select: [
        'Yeah, yeah, what do you want?',
        'Point me at something ugly. Easy. It\'s all ugly.',
        'Four inches of pure talent, reporting for #$%&ing duty.',
        'Ugh, FINE. Who am I roasting?',
        'You picked the tiny one? Bold. Correct, but bold.',
        'Hjalmar touched my lute again. I\'m in a MOOD.',
      ],
      start: [
        'Alright, losers, let\'s give \'em a show!',
        'Tough crowd. Ugly crowd. My favourite crowd.',
        'Mic check: one, two, @#$% you, monsters.',
        'Nobody panic. I\'ll insult them to death.',
        'Zarathor, stop posing in the torchlight. We\'re ON.',
        'Betty, spit out the map. We need that.',
      ],
      move: [
        'Flying over your problems. Literally.',
        'Out of the way, kneecaps.',
        'Watch the wings, Marwyn! WATCH. THE. WINGS.',
        'Moving! Keep up, Marbles. Wake up first.',
        'Zoom zoom, #$%&heads.',
        'Kiri, quit phasing through me! It tickles.',
      ],
      kill: [
        'And STAY dead, you #$%&ing amateur.',
        'That\'s what you get for heckling the heckler.',
        'Encore? No? Didn\'t think so.',
        'Killed it. Literally. Also figuratively.',
        'Thank you, thank you, I\'m here all week.',
        'Pebbles, DROP IT. That\'s not a stick, that\'s a femur.',
      ],
      hurt: [
        'OW! Do you know who I AM?!',
        'Not the face! NOT THE WINGS!',
        'You hit like your mom tells jokes.',
        'That\'s going in my diss track, #$%&face.',
        'Rude! RUDE! I\'m the rude one here!',
        'Who threw that?! Hjalmar, I swear to the DM...',
      ],
      lowhp: [
        'I\'m too pretty to die in a basement!',
        'Josiah! Drugs! The legal ones! HURRY!',
        'Ellaria, I\'ll pet a corgi, just HEAL ME!',
        'Okay, maybe I\'ll stop talking. ...NOT.',
        'Somebody tell my fans I was fabulous.',
        'Valdris! Forge me tiny armour! TINY! NOW!',
      ],
      downed: [
        'Tell my mom... she still owes me twenty gold...',
        'This... is NOT... my final... set...',
        'Ugh, #$%&. Somebody pick me up. Gently.',
        'Bury me in glitter. A LOT of glitter.',
        'I blame the acoustics.',
        'Pebbles... you\'re a good boy... avenge me...',
      ],
      revive: [
        'I\'m BACK, baby! Did you miss me? You did.',
        'Death? Overrated. Terrible reviews.',
        'Whose hands were those? Wash them.',
        'Did anyone record that? Delete it.',
        'Second set! Same jokes, twice the spite.',
        'Pebbles, stop licking me! You\'re ON FIRE!',
      ],
      ally_down: [
        'Get UP! I can\'t carry you, I\'m four inches!',
        'Oh no. Anyway— no, wait, get UP!',
        'Marwyn, MAGNIFICENT people don\'t nap mid-fight!',
        'Who did that? I\'ll roast your whole family tree.',
        'That\'s it. Now I\'m mad. Madder. Maddest.',
        'Basanos, up! Bite something, you big puppy!',
      ],
      levelup: [
        'Level up! My insults have footnotes now.',
        'New material, baby! Fresh burns!',
        'I\'m basically famous now. Autographs: 5 gold.',
        'Stronger, meaner, still four inches. Perfect.',
        'The talent grows. The height does not.',
        'Valdris, engrave my name on something. In gold.',
      ],
      victory: [
        'Thank you, goodnight, tip your bartender!',
        'Another sold-out show. Pay me.',
        'Easy. They were ugly AND slow.',
        'Buga, don\'t you DARE take credit for this.',
        'And THAT is how you roast a dungeon.',
        'Betty, do NOT eat the loot. Again.',
      ],
      idle: [
        'Anyone else bored? I\'m bored. Corelos, you\'re boring.',
        'Marbles is asleep again. Can I draw on him?',
        'Sparrow, you\'re bleeding on my shoes.',
        'Slate, smile. No? Okay, rock.',
        'Zarathor, nice chains. Did they come free with a meal?',
        'I could write a song about this. A bad one.',
      ],
      signature: [
        'DROP THE BEAT! This one\'s for your MOM!',
        'Mic check! Everybody shut UP!',
        'This track\'s called "You\'re All #$%&ing Ugly"!',
        'Verse one: YOU. Verse two: ALSO YOU.',
        'Hit it! Three verses, zero mercy!',
      ],
    },
  });

  // ---- narration (own keys) ----------------------------------------------------------------------------
  DD.registerNarration('syl_emotional_damage', [
    '{enemy} will be in therapy for years.',
    'The DM checks the rulebook. Yes. Words can do that.',
    '{enemy} is crying. Actual tears. On my nice dungeon floor.',
    '{hero} just ended {enemy}\'s whole career.',
    'Somebody get {enemy} a tissue and a new personality.',
  ]);
  DD.registerNarration('syl_heckle', [
    'Drama in the monster group chat. {enemy} is NOT okay.',
    '{hero} started beef. The DM is taking notes for next session.',
    'Nobody actually said anything about anybody\'s mom. Doesn\'t matter now.',
  ]);
  DD.registerNarration('syl_diss_track', [
    'The DM has never heard a track this explicit. Five stars.',
    'Every monster in the room just got personally attacked. In rhyme.',
    'Somewhere, a bard college revokes a diploma.',
  ]);

  // ---- public helpers for other content (runtime) -------------------------------------------------------
  DD.Syllamin = {
    /** Roast `target` n times as `src` (foes only; any unit when src is null); returns the syl_roasted instance or null. */
    roast: function (src, target, n) { return roast(src, target, n); },
    /** Force an Emotional Damage on a unit; returns true if it happened. */
    emotionalDamage: function (unit, src) { return emotionalDamage(unit, src); },
    /** Where Fae Blink would put `ally` (pure): {x, y} | null. */
    blinkSpot: function (user, ally) { return blinkSpot(user, ally); },
    ROAST_MAX: ROAST_MAX, EMO_HYPE: EMO_HYPE, EMO_WEAK: EMO_WEAK, MIX_HYPE: MIX_HYPE,
  };
})();
