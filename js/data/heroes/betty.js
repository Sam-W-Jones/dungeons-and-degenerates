/* Dungeons and Degenerates — js/data/heroes/betty.js
 * Hero: Betty (goatfolk warrior, he/him, starter) — frontline charger / knockback / taunts. Owner: hero-betty.
 * v2-simple kit (DESIGN §6 "Simplicity"): one verb per skill and at most one rider; the power is in the combos
 * (rams into pits / lava / water / runes / fire, Stuns and Taunts before the enemy's turn, Vulnerable foes tossed into
 * the party, Kick 'Em on whatever the party Stunned or Rooted). Goats climb: flags.hop (up 2 levels per step).
 * Passive Eats Anything: Betty heals 4 HP for every foe he kills and every object one of his skills breaks.
 * Registers: hero betty, 11 skills (bet_*), 3 hero items. No custom statuses or summons.
 */
(function () {
  'use strict';
  const DD = window.DD;

  const EAT_HEAL = 4;                       // Eats Anything
  const MALLET = 'bet_grandmas_mallet';
  const PLATE = 'bet_name_plate';
  const COWBELL = 'bet_cowbell';
  const BROWN = '#b07a4f';

  // ---- helpers ------------------------------------------------------------------------------------
  function G() { return DD.Grid; }
  function active(u) { return !!u && !u.dead && !u.downed; }
  function foeOf(user, u) { return active(u) && G().hostile(user, u); }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
  function dataOf(u) { return u.data || (u.data = {}); }
  /** Item check for combat units (items array), RunHeroes (slot object) or null. */
  function hasItem(user, id) {
    if (!user) return false;
    const items = user.items;
    if (Array.isArray(items)) return items.indexOf(id) >= 0;
    if (items && typeof items === 'object') { for (const k in items) if (items[k] === id) return true; }
    return !!(user.runHero && user.runHero !== user && hasItem(user.runHero, id));
  }
  /** Rooted, held (noMove) or otherwise pinned: no charging, leaping or trampling. */
  function pinned(u) { return !!u && DD.Act.cantMove(u); }
  function rootedReason(ctx, line) { return pinned(ctx.user) ? line : true; }
  /** Max range of a skill for this user as targeting resolves it (range items, Dazzle, modifyRange), else the level's. */
  function rangeOf(user, def, level, fallback) {
    const r = user && def ? DD.Targeting.range(user, def, level || 1) : null;
    return r && r[1] > 0 ? r[1] : fallback;
  }
  /** Straight cardinal direction from a to b, or null when they don't share a row / column. */
  function lineDir(a, b) {
    if (!a || !b) return null;
    const dx = b.x - a.x, dy = b.y - a.y;
    if ((dx && dy) || (!dx && !dy)) return null;
    return { x: Math.sign(dx), y: Math.sign(dy) };
  }
  /** A tile Betty's legs can run onto from `from` (walkable, no blocking object, at most 2 levels up: hop). */
  function runnable(user, from, to) {
    return G().inBounds(to.x, to.y) && G().isWalkable(to.x, to.y, user) && G().canStep(user, from, to);
  }

  // ---- Eats Anything ---------------------------------------------------------------------------------
  function objectsBroken() {
    const s = DD.Combat.state;
    const o = s && s.stats && s.stats.objects;
    let n = 0;
    if (o) for (const k in o) n += o[k] || 0;
    return n;
  }
  /** Betty eats something: +4 HP (a cosmetic "Nom!" either way). */
  function eat(u, what) {
    if (!active(u)) return 0;
    DD.FX.text(u, what === 'object' ? 'Nom! (crunchy)' : 'Nom! (lunch)', { color: '#ffe3a8', size: 14 });
    DD.Act.maybeBark(u, 'eat', 0.3);
    return DD.Act.heal(u, u, EAT_HEAL);
  }

  const PASSIVE = {
    name: 'Eats Anything',
    desc: 'Whenever Betty kills a foe or one of his skills breaks an object, he eats it and heals ' + EAT_HEAL + ' HP. Don\'t ask.',
    hooks: {
      // the paid use (ctx.paid of this very skill) remembers how many objects were broken before it resolved
      onCostPaid: function (p) { if (p) p.betObjects = objectsBroken(); },
      onSkillUsed: function (ctx) {
        const u = ctx && ctx.user, p = ctx && ctx.paid;
        if (!active(u) || !p || typeof p.betObjects !== 'number') return;
        const n = objectsBroken() - p.betObjects;
        p.betObjects = objectsBroken();
        for (let i = 0; i < n && active(u); i++) eat(u, 'object');
      },
      onKill: function (d) {
        const u = d && d.credit;
        if (!active(u) || !d.target || d.target === u || d.target.side === u.side) return;
        eat(u, 'foe');
      },
    },
  };

  // ---- pure geometry (targeting, HUD areas and execute share it) ---------------------------------------
  /** The Family Hammer: an adjacent active foe, or an adjacent breakable object. */
  function hammerTarget(user, p) {
    if (!user || !p || G().dist(user, p) !== 1) return null;
    const o = G().unitAt(p.x, p.y);
    if (o) return foeOf(user, o) ? { foe: o } : null;
    const t = G().tile(p.x, p.y);
    return t && t.obj && t.obj.maxHp > 0 && t.obj.hp > 0 ? { obj: t.obj } : null;
  }

  /**
   * Ramming Speed!: { dir, path (tiles he runs over), foe (the first foe in the way) } or null. He runs straight at the
   * target up to maxRange tiles and stops before the first unit (a foe gets rammed), obstacle, pit or ledge too high.
   */
  function chargePlan(user, target, maxRange) {
    const dir = lineDir(user, target);
    if (!dir) return null;
    const n = Math.min(Math.abs(target.x - user.x) + Math.abs(target.y - user.y), maxRange);
    const path = [];
    let foe = null, at = { x: user.x, y: user.y };
    for (let k = 1; k <= n; k++) {
      const nx = at.x + dir.x, ny = at.y + dir.y;
      if (!G().inBounds(nx, ny)) break;
      const o = G().unitAt(nx, ny);
      if (o) { if (foeOf(user, o)) foe = o; break; }
      if (!runnable(user, at, { x: nx, y: ny })) break;
      path.push({ x: nx, y: ny });
      at = { x: nx, y: ny };
    }
    if (!path.length && !foe) return null;
    return { dir: dir, path: path, foe: foe };
  }

  /**
   * Head Over Heels: where an adjacent foe lands when flipped over Betty (the tile right behind him): { x, y, drop }
   * or null when there is no room (edge, wall, blocking object, a unit). Pits and deep water count as room.
   */
  function tossLanding(user, foe) {
    if (!user || !foe || G().dist(user, foe) !== 1) return null;
    const d = DD.util.dirTo(user, foe);
    const p = { x: user.x - d.x, y: user.y - d.y };
    const t = G().tile(p.x, p.y);
    if (!t || G().unitAt(p.x, p.y)) return null;
    if (t.obj && G().objBlocksMove(t.obj)) return null;
    const drop = G().isDrop(p.x, p.y) && !G().isFlying(foe);
    if (!drop && !G().isWalkable(p.x, p.y, foe)) return null;
    return { x: p.x, y: p.y, drop: drop };
  }

  /**
   * G.O.A.T.: the straight run up to maxRange tiles toward target (walls, blocking objects, pits and ledges more than
   * 2 levels up stop it; units don't) → { dir, tiles, foes } or null.
   */
  function tramplePlan(user, target, maxRange) {
    const dir = lineDir(user, target);
    if (!dir) return null;
    const n = Math.min(Math.abs(target.x - user.x) + Math.abs(target.y - user.y), maxRange);
    const tiles = [], foes = [];
    let at = { x: user.x, y: user.y };
    for (let k = 1; k <= n; k++) {
      const p = { x: at.x + dir.x, y: at.y + dir.y };
      if (!runnable(user, at, p)) break;
      tiles.push(p);
      const o = G().unitAt(p.x, p.y);
      if (foeOf(user, o)) foes.push(o);
      at = p;
    }
    return tiles.length ? { dir: dir, tiles: tiles, foes: foes } : null;
  }
  /** The furthest tile of the run Betty can stand on now (null: none, he stays where he is). */
  function trampleEnd(user, plan) {
    for (let i = plan.tiles.length - 1; i >= 0; i--) {
      const p = plan.tiles[i];
      if (G().isFree(p.x, p.y, user)) return p;
    }
    return null;
  }

  /** Kick 'Em While They're Down: Stunned-like (stun, sleep, frozen...) or Rooted-like (root, holds). */
  function helpless(u) { return !!u && (DD.Act.isStunned(u) || DD.Act.cantMove(u)); }

  // ---- skills -------------------------------------------------------------------------------------------
  function skill(def) { def.owner = 'betty'; return DD.registerSkill(def); }

  skill({
    id: 'bet_family_hammer', name: 'The Family Hammer', icon: '🔨', kind: 'attack', tags: ['melee'],
    ap: 1, cooldown: 0,
    levels: [{ dmg: 5 }],
    target: {
      type: 'tile', range: [1, 1], filter: 'any', los: false,
      canTarget: function (ctx) { return hammerTarget(ctx.user, ctx.target) ? true : 'Nothing there to hit (or eat).'; },
    },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to an adjacent foe or breakable object.'; },
    flavor: 'It\'s a family hammer. Every Betty has swung it. Mostly at wolves.',
    execute: function (ctx) {
      const u = ctx.user, k = hammerTarget(u, ctx.target);
      if (!k) return;
      DD.FX.lunge(u, ctx.target);
      if (k.foe) DD.Act.damage(u, k.foe, ctx.L.dmg, { tags: ['melee'] });
      else DD.Act.damageObject(u, ctx.target.x, ctx.target.y, ctx.L.dmg);
    },
  });

  skill({
    id: 'bet_ram', name: 'Ramming Speed!', icon: '🐏', kind: 'attack', tags: ['melee', 'push', 'dash'],
    ap: 2, cooldown: 2,
    levels: [{ dmg: 6, range: 3, push: 2 }, { dmg: 8, range: 3, push: 2 }, { dmg: 9, range: 4, push: 3 }],
    target: {
      type: 'tile', range: function (L) { return [1, L.range]; }, filter: 'any', los: false, straight: true,
      canTarget: function (ctx) {
        return chargePlan(ctx.user, ctx.target, rangeOf(ctx.user, ctx.skill, ctx.level, ctx.L.range)) ? true : 'Something is in the way.';
      },
    },
    area: {
      shape: 'custom',
      fn: function (ctx) {
        const plan = ctx && ctx.user && ctx.target && chargePlan(ctx.user, ctx.target, rangeOf(ctx.user, ctx.skill, ctx.level, (ctx.L || {}).range || 3));
        if (!plan) return ctx && ctx.target ? [{ x: ctx.target.x, y: ctx.target.y }] : [];
        return plan.path.concat(plan.foe ? [{ x: plan.foe.x, y: plan.foe.y }] : []);
      },
    },
    canUse: function (ctx) { return rootedReason(ctx, 'Rooted: no running start.'); },
    desc: function (L, user) {
      return 'Charge up to ' + L.range + ' tiles in a straight line. The first foe in the way takes ' + L.dmg + ' damage and is pushed ' +
        plural(L.push + (hasItem(user, MALLET) ? 1 : 0), 'tile') + '.';
    },
    flavor: 'Horns first, questions never.',
    aiScore: function (ctx) {
      const plan = ctx.user && ctx.target && chargePlan(ctx.user, ctx.target, rangeOf(ctx.user, ctx.skill, ctx.level, ctx.L.range));
      return plan && plan.foe && G().isEdge(plan.foe.x, plan.foe.y) ? 6 : 0;
    },
    execute: function (ctx) {
      const u = ctx.user;
      const plan = chargePlan(u, ctx.target, rangeOf(u, ctx.skill, ctx.level, ctx.L.range));
      if (!plan) return;
      if (plan.path.length) {
        DD.FX.particles(u, { kind: 'dust', count: 10 });
        DD.Act.moveAlong(u, plan.path, { cause: 'move' });
      }
      const f = plan.foe;
      if (!active(u) || !active(f) || G().dist(u, f) !== 1) return;
      DD.FX.lunge(u, f, { ms: 120 });
      DD.FX.text(f, 'RAM!', { color: '#ffe08a', size: 18 });
      DD.Act.maybeBark(u, 'ram', 0.35);
      DD.Act.damage(u, f, ctx.L.dmg, { tags: ['melee'] });
      if (active(f) && active(u)) DD.Act.push(u, f, plan.dir, ctx.L.push);
    },
  });

  skill({
    id: 'bet_headbutt', name: 'Butt Out', icon: '💫', kind: 'attack', tags: ['melee', 'stun'],
    ap: 2, cooldown: function (L) { return L.cd; },
    levels: [{ dmg: 6, stun: 1, cd: 3 }, { dmg: 7, stun: 1, cd: 3 }, { dmg: 9, stun: 1, cd: 2 }],
    target: { type: 'unit', range: [1, 1], filter: 'enemy' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to an adjacent foe and Stun it (it skips its next turn).'; },
    flavor: 'Betty\'s skull is thick enough to be a family heirloom. It is one.',
    execute: function (ctx) {
      const u = ctx.user, t = ctx.targetUnit;
      if (!active(t) || t === u) return;
      DD.FX.lunge(u, t, { ms: 110 });
      DD.FX.shake(5, 220);
      DD.FX.text(t, 'BONK!', { color: '#ffe08a', size: 20 });
      DD.Act.damage(u, t, ctx.L.dmg, { tags: ['melee'] });
      if (active(t)) DD.Act.addStatus(t, 'stun', { turns: ctx.L.stun || 1 }, u);
    },
  });

  skill({
    id: 'bet_horn_toss', name: 'Head Over Heels', icon: '🤸', kind: 'utility', tags: ['melee', 'throw', 'vulnerable'],
    ap: 1, cooldown: 2,
    levels: [{ turns: 1 }, { turns: 2 }, { turns: 2, dmg: 5 }],
    target: {
      type: 'unit', range: [1, 1], filter: 'enemy',
      canTarget: function (ctx) {
        const t = ctx.targetUnit;
        if (!t) return false;
        if (DD.Act.isImmovable(t)) return 'Too heavy to flip. Betty checked.';
        return tossLanding(ctx.user, t) ? true : 'No room behind Betty to land it.';
      },
    },
    area: {
      shape: 'custom',
      fn: function (ctx) {
        if (!ctx || !ctx.target) return [];
        const out = [{ x: ctx.target.x, y: ctx.target.y }];
        const t = G().unitAt(ctx.target.x, ctx.target.y);
        const land = t && ctx.user ? tossLanding(ctx.user, t) : null;
        if (land) out.push({ x: land.x, y: land.y });
        return out;
      },
    },
    desc: function (L) {
      return 'Flip an adjacent foe over Betty onto the tile behind him.' + (L.dmg ? ' It takes ' + L.dmg + ' damage and is' : ' It is') +
        ' Vulnerable (+25% damage taken) for ' + plural(L.turns, 'turn') + '.';
    },
    flavor: 'Up and over, kid. Mind the pit. Or don\'t. Betty doesn\'t judge.',
    aiScore: function (ctx) {
      const t = ctx.targetUnit, land = t && ctx.user ? tossLanding(ctx.user, t) : null;
      if (!land) return 0;
      if (land.drop) return DD.Act.isBoss(t) ? 6 : 15;
      return G().hazardAt(land.x, land.y, t) ? 6 : 0;
    },
    execute: function (ctx) {
      const u = ctx.user, f = ctx.targetUnit;
      if (!foeOf(u, f) || DD.Act.isImmovable(f)) return;
      const land = tossLanding(u, f);
      if (!land) return;
      const from = { x: f.x, y: f.y };
      DD.FX.lunge(u, f, { ms: 110 });
      DD.FX.text(f, 'Up and over!', { color: '#ffe08a', size: 16 });
      DD.Act.maybeBark(u, 'toss', 0.35);
      DD.Act.withCredit(u, function () {
        DD.FX.jump(f, from, land, { arc: 34, ms: 380 });
        if (land.drop) {
          // pits / deep water: the engine's fall rules (enemies are YEETed, bosses climb out hurt)
          f.x = land.x; f.y = land.y;
          DD.Act.touch();
          DD.Act.fall(f, u);
        } else DD.Act.teleport(f, land.x, land.y, { fx: false });
      });
      if (!active(f)) return;
      DD.FX.particles(f, { kind: 'dust', count: 10 });
      if (ctx.L.dmg) DD.Act.damage(u, f, ctx.L.dmg, { tags: ['melee', 'throw'] });
      if (active(f)) DD.Act.addStatus(f, 'vulnerable', { turns: ctx.L.turns }, u);
    },
  });

  skill({
    id: 'bet_bleat', name: 'Bleat of Defiance', icon: '📢', kind: 'utility', tags: ['taunt', 'aoe'],
    ap: 1, cooldown: function (L) { return L.cd; },
    levels: [{ r: 2, cd: 2 }, { r: 3, cd: 2 }, { r: 3, cd: 1 }],
    target: { type: 'self' },
    area: { shape: 'circle', size: function (L) { return L.r; } },
    desc: function (L) { return 'BAAAH! Every foe within ' + L.r + ' tiles is Taunted: on its next turn it must attack Betty.'; },
    flavor: 'The goat equivalent of "come at me, bro". Also the goat equivalent of everything else.',
    execute: function (ctx) {
      const u = ctx.user;
      DD.FX.explosion(u, { radius: ctx.L.r, color: '#f2d38a', kind: 'shout', shake: false, sound: 'roar' });
      DD.FX.text(u, 'BAAAAAH!', { color: '#ffe9b0', size: 20 });
      DD.Act.maybeBark(u, 'bleat', 0.5);
      ctx.foes.forEach(function (f) { if (active(f)) DD.Act.addStatus(f, 'taunt', { turns: 1 }, u); });
    },
  });

  skill({
    id: 'bet_stomp', name: 'Stomping Grounds', icon: '🦶', kind: 'attack', tags: ['melee', 'aoe', 'slow'],
    ap: 2, cooldown: 2,
    levels: [{ dmg: 4 }, { dmg: 5 }, { dmg: 6 }],
    target: { type: 'self' },
    area: { shape: 'square', size: 1 },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to every foe on the 8 tiles around Betty and Slow them (−2 move on their next turn).'; },
    flavor: 'Hooves: nature\'s hammers. Betty also brought a hammer. He is very thorough.',
    execute: function (ctx) {
      const u = ctx.user;
      DD.FX.shake(6, 260);
      DD.FX.explosion(u, { radius: 1, color: '#c9b48f', kind: 'dust', shake: false, sound: 'bump' });
      ctx.tiles.forEach(function (p, i) { DD.FX.tile(p.x, p.y, 'crack', { parallel: i > 0 }); });
      ctx.foes.forEach(function (f) {
        if (!active(f)) return;
        DD.Act.damage(u, f, ctx.L.dmg, { tags: ['melee'] });
        if (active(f)) DD.Act.addStatus(f, 'slow', { turns: 1 }, u);
      });
    },
  });

  skill({
    id: 'bet_goat_yoga', name: 'Goat Yoga', icon: '🧘', kind: 'buff', tags: ['block', 'ally'],
    ap: 1, cooldown: 2,
    levels: [{ block: 6 }, { block: 8 }, { block: 10 }],
    target: { type: 'unit', range: [0, 1], filter: 'allyOrSelf' },
    desc: function (L) { return 'Betty or an adjacent ally gains ' + L.block + ' Block (until the start of its next turn).'; },
    flavor: 'Betty stands on your back and breathes deeply. It is relaxing. For Betty.',
    execute: function (ctx) {
      const u = ctx.user, a = ctx.targetUnit;
      if (!active(a)) return;
      if (a !== u) DD.FX.lunge(u, a, { ms: 160 });
      DD.FX.text(a, 'Namaste.', { color: '#c8f0d0', size: 14 });
      DD.FX.particles(a, { kind: 'leaves', count: 8 });
      DD.Act.addBlock(a, ctx.L.block);
    },
  });

  skill({
    id: 'bet_snack', name: 'Five-Second Rule', icon: '🥫', kind: 'heal', tags: ['heal'],
    ap: 1, cooldown: 3,
    levels: [{ heal: 6 }, { heal: 8 }, { heal: 8, cleanse: 1 }],
    target: { type: 'self' },
    desc: function (L) {
      return 'Betty eats something off the floor: heal ' + L.heal + ' HP' + (L.cleanse ? ' and remove ' + (L.cleanse === 1 ? 'one debuff' : L.cleanse + ' debuffs') + ' (he eats that too)' : '') + '.';
    },
    flavor: 'A boot. Half a map. The DM\'s notes. It was on the floor for under five seconds. Mostly.',
    execute: function (ctx) {
      const u = ctx.user;
      DD.FX.text(u, '*crunch*', { color: '#ffe3a8', size: 15 });
      DD.FX.particles(u, { kind: 'dust', count: 6 });
      DD.Act.maybeBark(u, 'eat', 0.5);
      DD.Act.heal(u, u, ctx.L.heal);
      if (ctx.L.cleanse && active(u)) DD.Act.cleanse(u, 'debuff', ctx.L.cleanse);
    },
  });

  skill({
    id: 'bet_mountain_goat', name: 'Mountain Goat', icon: '⛰️', kind: 'move', tags: ['leap', 'move'],
    ap: 1, cooldown: 2,
    levels: [{ leap: 3 }, { leap: 4 }, { leap: 5 }],
    target: { type: 'tile', range: function (L) { return [1, L.leap]; }, filter: 'empty', los: false },
    canUse: function (ctx) { return rootedReason(ctx, 'Rooted: even goats need their legs.'); },
    desc: function (L) { return 'Leap to an empty tile up to ' + L.leap + ' tiles away, whatever its height and whatever is in between.'; },
    flavor: 'Cliffs, crates, castle walls: if it is taller than Betty, it is a staircase.',
    execute: function (ctx) {
      const u = ctx.user, p = ctx.target;
      if (!active(u) || !p || (p.x === u.x && p.y === u.y)) return;
      const from = { x: u.x, y: u.y };
      DD.FX.jump(u, from, p, { arc: 30, ms: 420 });
      if (DD.Act.teleport(u, p.x, p.y, { fx: false }) && active(u)) DD.FX.particles(u, { kind: 'dust', count: 10 });
    },
  });

  skill({
    id: 'bet_kick', name: 'Kick \'Em While They\'re Down', icon: '🦵', kind: 'attack', tags: ['melee', 'combo'],
    ap: 1, cooldown: 1,
    levels: [{ dmg: 5, down: 10 }, { dmg: 6, down: 12 }, { dmg: 7, down: 14 }],
    target: { type: 'unit', range: [1, 1], filter: 'enemy' },
    desc: function (L) {
      return 'Deal ' + L.dmg + ' damage to an adjacent foe, or ' + L.down + ' if it is Stunned or Rooted (asleep, frozen and held count too).';
    },
    flavor: 'Fair fights are for people who lose fights.',
    aiScore: function (ctx) { return helpless(ctx.targetUnit) ? ctx.L.down - ctx.L.dmg : 0; },
    execute: function (ctx) {
      const u = ctx.user, t = ctx.targetUnit;
      if (!active(t) || t === u) return;
      const down = helpless(t);
      DD.FX.lunge(u, t, { ms: 110 });
      if (down) DD.FX.text(t, 'CHEAP SHOT!', { color: '#ffd28a', size: 16 });
      DD.Act.damage(u, t, down ? ctx.L.down : ctx.L.dmg, { tags: ['melee'] });
    },
  });

  skill({
    id: 'bet_goat', name: 'G.O.A.T.', icon: '🏆', kind: 'attack', tags: ['melee', 'aoe', 'dash', 'stun'],
    ap: 2, hype: 100,
    levels: [{ dmg: 15, range: 6, stun: 1 }],
    target: {
      type: 'tile', range: function (L) { return [1, L.range || 6]; }, filter: 'any', los: false, straight: true,
      canTarget: function (ctx) {
        return tramplePlan(ctx.user, ctx.target, rangeOf(ctx.user, ctx.skill, ctx.level, ctx.L.range)) ? true : 'A wall. Even the G.O.A.T. respects walls.';
      },
    },
    area: {
      shape: 'custom',
      fn: function (ctx) {
        const plan = ctx && ctx.user && ctx.target && tramplePlan(ctx.user, ctx.target, rangeOf(ctx.user, ctx.skill, ctx.level, (ctx.L || {}).range || 6));
        return plan ? plan.tiles.slice() : ctx && ctx.target ? [{ x: ctx.target.x, y: ctx.target.y }] : [];
      },
    },
    canUse: function (ctx) { return rootedReason(ctx, 'Rooted: even the G.O.A.T. needs legs.'); },
    desc: function (L) {
      return 'Charge up to ' + L.range + ' tiles in a straight line, right through every foe in the way: each takes ' + L.dmg +
        ' damage and is Stunned.';
    },
    flavor: 'Greatest Of All Time. It says so on his breastplate. Well, it says BETTY. Same thing.',
    execute: function (ctx) {
      const u = ctx.user;
      const plan = tramplePlan(u, ctx.target, rangeOf(u, ctx.skill, ctx.level, ctx.L.range));
      if (!plan) return;
      const from = { x: u.x, y: u.y };
      DD.FX.banner('G.O.A.T.!', { sub: 'Greatest Of All Time', color: BROWN, ms: 900 });
      DD.FX.shake(10, 450);
      DD.FX.move(u, plan.tiles, { from: from, ms: 70 * plan.tiles.length });
      plan.foes.forEach(function (f) {
        if (!active(f) || !active(u)) return;
        DD.FX.text(f, 'TRAMPLED!', { color: '#ffe08a', size: 16 });
        DD.Act.damage(u, f, ctx.L.dmg, { tags: ['melee', 'trample'] });
        if (active(f)) DD.Act.addStatus(f, 'stun', { turns: ctx.L.stun || 1 }, u);
      });
      if (!active(u)) return;
      const end = trampleEnd(u, plan);
      if (end) DD.Act.teleport(u, end.x, end.y, { fx: false });
      else DD.FX.slide(u, plan.tiles[plan.tiles.length - 1], from, { ms: 160 });
      if (active(u)) DD.FX.particles(u, { kind: 'dust', count: 16 });
    },
  });

  // ---- items -------------------------------------------------------------------------------------------
  DD.registerItem({
    id: MALLET, name: 'Great-Grandma Betty\'s Mallet', slot: 'weapon', rarity: 'rare', icon: '🔨', hero: 'betty',
    stats: { dmg: 0.1 },
    desc: '+10% damage. Betty\'s pushes go 1 tile further.',
    flavor: 'It\'s a family mallet. Great-Grandma Betty used it on wolves, tax collectors and one very confused bard.',
    hooks: {
      modifyOutgoingPush: function (p) { if (p && !p.cancel && p.dist > 0) p.dist += 1; },
    },
  });

  DD.registerItem({
    id: PLATE, name: 'Breastplate That Says BETTY', slot: 'armor', rarity: 'rare', icon: '🛡️', hero: 'betty',
    stats: { hp: 6, armor: 1 },
    desc: '+6 max HP and +1 armor.',
    flavor: 'In case anyone forgets. In case Betty forgets. It\'s a family name.',
    hooks: {},
  });

  DD.registerItem({
    id: COWBELL, name: 'Championship Cowbell', slot: 'trinket', rarity: 'legendary', icon: '🔔', hero: 'betty',
    stats: {},
    desc: 'Once per turn, when Betty kills a foe, he gains 1 AP.',
    flavor: 'The DM said the fight needed more cowbell. The DM was right.',
    hooks: {
      onKill: function (d) {
        const u = d && d.credit, s = DD.Combat.state;
        if (!active(u) || !s || !d.target || d.target.side === u.side) return;
        const data = dataOf(u);
        if (data.betBellTurn === s.turn) return;
        data.betBellTurn = s.turn;
        DD.FX.text(u, '🔔 DING!', { color: '#ffe066', size: 15 });
        DD.Act.gainAp(u, 1);
      },
    },
  });

  // ---- sprite ----------------------------------------------------------------------------------------------
  const FUR = '#9a6943', WHITE = '#f2ebdd', HOOF = '#3a2a20', PLATE_COL = '#b9c2cc';
  /**
   * Overlay: the goat details the stock humanoid lacks, painted over the finished body (stocky build, scale 1.08):
   * a steel breastplate stamped BETTY, a pale muzzle with nostrils, a white goatee tuft, horizontal goat pupils and split
   * hooves. Everything is in body coordinates, so it lies down and flips with the sprite.
   */
  function bettyOverlay(g, t, o) {
    const H = g.head;
    if (!H) return;
    const r = H.r, pal = g.pal, lying = o && o.lying > 0.5;
    const shY = H.y + r * 0.8, hipY = -5.5;
    // breastplate (narrow, so the hammer arm stays in front of it)
    g.shaded(function (c) {
      c.moveTo(-5.2, shY + 2.4); c.lineTo(5.2, shY + 2.4);
      c.quadraticCurveTo(5.8, (shY + hipY) / 2, 3.4, hipY - 2.2);
      c.lineTo(-3.4, hipY - 2.2);
      c.quadraticCurveTo(-5.8, (shY + hipY) / 2, -5.2, shY + 2.4);
      c.closePath();
    }, PLATE_COL, { dx: 1.2, dy: -1, hl: [1.8, shY + 4, 2.4, 1.1, -0.3] });
    g.text('BETTY', 0, (shY + hipY) / 2 - 0.6, 3.1, '#5a4632', null);
    // hooves: a split down the front of each foot
    const walk = o && typeof o.walk === 'number' ? Math.sin(o.walk * Math.PI * 2) : 0;
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1, s = side * walk, x = side * 3.6 + s * 1.3, lift = Math.max(0, s) * 1.4;
      g.line(x + 2.2, -2.9 - lift, x + 2.2, -0.3 - lift, '#1c130d', 0.7);
    }
    // muzzle, nostrils, mouth
    const fx = r * 0.24, mx = H.x + fx + r * 0.06, my = H.y + r * 0.5;
    g.ellipse(mx, my, r * 0.44, r * 0.3, WHITE, null);
    g.ellipse(mx - r * 0.13, my - r * 0.1, r * 0.07, r * 0.05, '#4a2f22', null);
    g.ellipse(mx + r * 0.13, my - r * 0.1, r * 0.07, r * 0.05, '#4a2f22', null);
    if (!lying && (g.pose === 'attack' || g.pose === 'hurt')) g.ellipse(mx, my + r * 0.12, r * 0.12, r * 0.1, '#3a0f17', null);
    else g.arc(mx, my + r * 0.02, r * 0.14, 0.2 * Math.PI, 0.8 * Math.PI, '#4a2f22', Math.max(0.7, r * 0.07));
    // goatee: a tapered white tuft off the chin
    g.path(function (c) {
      c.moveTo(mx - r * 0.2, my + r * 0.24);
      c.quadraticCurveTo(mx - r * 0.2, my + r * 0.8, mx + r * 0.02, my + r * 1.05);
      c.quadraticCurveTo(mx + r * 0.16, my + r * 0.7, mx + r * 0.2, my + r * 0.24);
      c.closePath();
    }, WHITE, g.outline, g.lw * 0.7);
    // goat eyes: horizontal bar pupils (not while blinking, wincing or knocked out)
    if (lying || g.blink || g.pose === 'hurt') return;
    const ey = H.y + r * 0.1, d = r * 0.36;
    [[-1, 0.9], [1, 1]].forEach(function (e) {
      const k = e[1], ex = H.x + fx + e[0] * d, rx = r * 0.155 * k, ry = r * 0.215 * k;
      g.ellipse(ex + rx * 0.15, ey + ry * 0.05, rx * 0.75, ry * 0.7, pal.eye, null);
      g.rect(ex - rx * 0.45, ey - ry * 0.08, rx * 1.2, ry * 0.3, '#1a1014', null, ry * 0.12);
      g.circle(ex + rx * 0.3, ey - ry * 0.4, Math.max(0.45, rx * 0.36), '#ffffff', null);
    });
  }

  const SPRITE = {
    base: 'humanoid', scale: 1.08, build: 'stocky', outfit: 'furs',
    palette: {
      skin: FUR, cloth: WHITE, cloth2: WHITE, fur: '#7a5132', hair: '#5e3d26', beard: WHITE, metal: '#9aa3ad',
      eye: '#e3a62f', accent: '#c9a227', outline: '#24160d', ear: FUR, inner: '#e9a0ad', horn: '#d8c59f',
      pants: FUR, boots: HOOF, belt: '#4a2f1c', leather: '#5b3a22', wood: '#7a5132', tail: FUR, blush: '#d98a7a',
    },
    head: { size: 1.02, ears: 'goblin', horns: 'ram', hair: 'short', beard: 'none', hat: 'none', face: 'none', eyes: 'normal', mouth: 'none' },
    wings: 'none', tail: 'dog', mainhand: 'hammer', offhand: 'none', bling: [], extras: ['belt'], aura: null,
    overlay: bettyOverlay,
  };

  // ---- the hero ------------------------------------------------------------------------------------------
  DD.registerHero({
    id: 'betty', name: 'Betty', epithet: 'the G.O.A.T.', race: 'Goatfolk', cls: 'Warrior',
    role: 'Frontline charger / knockback / taunts', complexity: 1,
    blurb: 'A big goatfolk warrior named Betty. It\'s a family name. He rams, headbutts and flips anything in his way, ' +
      'climbs anything taller than him, then eats whatever is left: crates, loot, the map, the DM\'s notes. Calls everyone "kid".',
    color: BROWN,
    unlock: null,
    stats: { hp: 32, ap: 3, mov: 4, armor: 0, init: 1 },
    growth: { hp: 4 },
    flags: { hop: true },
    sprite: SPRITE,
    basic: 'bet_family_hammer',
    signature: 'bet_goat',
    passive: PASSIVE,
    startingSkills: ['bet_ram', 'bet_headbutt'],
    skillPool: ['bet_ram', 'bet_headbutt', 'bet_horn_toss', 'bet_bleat', 'bet_stomp', 'bet_goat_yoga', 'bet_snack',
      'bet_mountain_goat', 'bet_kick'],
    summons: [],
    barks: {
      select: [
        'Betty. It\'s a family name. Got a problem with that, kid?',
        'BAAAttle-ready. Point me at it.',
        'Named after my dad. And his dad. Lotta Bettys.',
        'What are we headbutting today, kid?',
        'Ready. Also hungry. Mostly hungry.',
      ],
      start: [
        'Alright, kids. Stay behind the goat.',
        'BAAAttle stations!',
        'I charge, you lot do the thinking. Deal?',
        'Is that a crate? I\'m eating that crate after.',
        'Somebody hold the map. Wait. I ate the map.',
      ],
      move: [
        'Hoof it.',
        'Coming through, kid.',
        'Uphill? My favorite direction.',
        'Watch your step. I never do.',
      ],
      kill: [
        'Down you go, kid.',
        'That\'s what you get for butting in.',
        'Mm. Lunch.',
        'Next!',
        'Never mess with the horns.',
      ],
      hurt: [
        'BAAAH! That stung.',
        'Ow. Rude.',
        'That all you got, kid?',
        'Hit me again. See what happens.',
      ],
      lowhp: [
        'Gettin\' a little woozy here, kids.',
        'Josiah, got anything I can eat? Potions count.',
        'Not now. I\'m busy being stubborn.',
        'I\'ve had worse. I\'ve EATEN worse.',
      ],
      downed: [
        'Tell Grandpa Betty... I tried...',
        'Just... resting my horns a minute...',
        'Don\'t let \'em eat my lunch...',
        'BAAAh... humbug...',
      ],
      revive: [
        'Back on my hooves!',
        'Stubborn? Me? Yeah.',
        'Round two. Still hungry, too.',
        'Can\'t keep a good goat down.',
      ],
      ally_down: [
        'Hey! That\'s my kid you\'re hitting!',
        'Oh, now you\'ve made the goat angry.',
        'Hang in there, kid! Goat incoming!',
        'Nobody flattens my party. Nobody!',
      ],
      levelup: [
        'Older and wiser. Mostly older.',
        'Horns got bigger. Probably.',
        'New trick! Same old goat.',
        'Grandpa Betty would be proud. He\'d say so, too.',
      ],
      victory: [
        'Good work, kids. Now, where\'s the snack table?',
        'BAAAttle won!',
        'Told you. Never fight a goat uphill.',
        'I\'m eating the loot. Kidding. Mostly kidding.',
      ],
      idle: [
        'You gonna eat that map? No? Mine.',
        'It\'s a family name. Stop asking.',
        'Corelos, can I eat this contract? Too late, sorry.',
        'Slate, you look delicious. In a rock way.',
        'Marbles, wake up. You\'re drooling on my hoof.',
      ],
      signature: [
        'Greatest! Of! All! TIIIME!',
        'Make way for the G.O.A.T.!',
        'RAMMING SPEED, KIDS! RAMMING SPEED!',
        'BAAAAAAAAAAH!',
      ],
      // extra keys (DD.Act.bark / maybeBark from his skills and passive)
      ram: [
        'RAMMING SPEED!',
        'Horns first!',
        'Out of the way, kid!',
        'Incoming goat!',
      ],
      toss: [
        'Up and over!',
        'Head over heels, kid!',
        'Wheee! For you. Not for me.',
      ],
      bleat: [
        'BAAAH! Over here!',
        'Come get some, kids!',
        'Who wants a piece of the goat?',
      ],
      eat: [
        'Mm. Crunchy.',
        'Needs salt.',
        'Don\'t tell the DM.',
        'That was load-bearing? Oops.',
      ],
    },
  });

  /** Small public surface for tests and other content. */
  DD.Betty = {
    EAT_HEAL: EAT_HEAL, hasItem: hasItem, chargePlan: chargePlan, tossLanding: tossLanding, tramplePlan: tramplePlan,
    trampleEnd: trampleEnd, hammerTarget: hammerTarget, helpless: helpless, objectsBroken: objectsBroken,
  };
})();
