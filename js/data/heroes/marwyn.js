/* Dungeons and Degenerates — js/data/heroes/marwyn.js
 * Hero: Marwyn the Magnificent (human barbarian) — tank / bruiser / taunts. Owner: hero-marwyn. v2 kit (DESIGN §6
 * "Simplicity"): one verb per skill, the power is in the combinations (Taunt, throws, pulls, Stun, Root, Wet).
 * Passive MAGNIFICENCE (status mrw_magnificence, 0-5): each of his skills that reaches a foe (a foe in its area) adds 1;
 * at 5 his NEXT skill unleashes a MAGNIFICENT SURGE (a random good DD.WildMagic effect, +10 party Hype) and the meter
 * resets. Gains are paid out in onSkillUsed after the surge check, so the surge always belongs to the skill after the
 * one that filled the meter. Registers: hero marwyn, 11 skills (mrw_*), statuses mrw_magnificence + mrw_rage, 3 items.
 */
(function () {
  'use strict';
  const DD = window.DD;

  const MAX = 5;               // MAGNIFICENCE that fills the meter
  const SURGE_HYPE = 10;       // party Hype per MAGNIFICENT SURGE (DESIGN §4.5: Marwyn's passive adds Hype)
  const GAUNTLET_TILES = 2;    // extra YEET distance with the gauntlets
  const GAUNTLETS = 'mrw_yeet_gauntlets';
  const MIRROR = 'mrw_hand_mirror';
  const LOINCLOTH = 'mrw_loincloth';
  const ORANGE = '#ffb347';
  const HIT_CAUSES = { skill: 1, other: 1, bump: 1, explosion: 1 };   // what Ginger Rage softens

  // ---- helpers ------------------------------------------------------------------------------------
  function G() { return DD.Grid; }
  function active(u) { return !!u && !u.dead && !u.downed; }
  function stacksOf(u) {
    const st = u && u.statuses ? DD.Act.getStatus(u, 'mrw_magnificence') : null;
    return st ? Math.min(MAX, st.stacks || 0) : 0;
  }
  /** Item check for combat units (items array), RunHeroes (slot object) or null. */
  function hasItem(user, id) {
    if (!user) return false;
    const items = user.items;
    if (Array.isArray(items)) return items.indexOf(id) >= 0;
    if (items && typeof items === 'object') { for (const k in items) if (items[k] === id) return true; }
    return !!(user.runHero && user.runHero !== user && hasItem(user.runHero, id));
  }
  /** The skill currently resolving belongs to u (gains are banked until it finishes). */
  function ownSkill(u) { const sk = DD.Act.currentSkill(); return !!sk && sk.user === u; }
  function isSkillDef(def) { return !!def && !!def.id && DD.getSkill(def.id) === def; }
  function dataOf(u) { return u.data || (u.data = {}); }
  function left(st) { return !st || st.turns < 0 ? '' : ' (' + st.turns + ' turn' + (st.turns === 1 ? '' : 's') + ' left)'; }
  function byDistance(from) {
    return function (a, b) { return G().dist(a, from) - G().dist(b, from) || a.y - b.y || a.x - b.x; };
  }
  function adjacentFoes(user, at) {
    const out = [];
    G().neighbors(at.x, at.y).forEach(function (t) {
      const o = G().unitAt(t.x, t.y);
      if (active(o) && G().hostile(user, o)) out.push(o);
    });
    return out;
  }
  function taunt(u, f) { return active(f) ? DD.Act.addStatus(f, 'taunt', { turns: 1 }, u) : null; }

  // ---- MAGNIFICENCE -----------------------------------------------------------------------------------
  /** Add MAGNIFICENCE right now (capped at 5). Returns how many were added. */
  function addStacks(u, n) {
    if (!active(u) || !(n > 0)) return 0;
    const before = stacksOf(u);
    if (before >= MAX) return 0;
    DD.Act.addStatus(u, 'mrw_magnificence', { stacks: Math.min(MAX - before, Math.round(n)), silent: true }, u);
    const after = stacksOf(u);
    if (after > before) {
      DD.FX.text(u, '+' + (after - before) + ' 🦁', { color: ORANGE, size: 13 });
      if (after >= MAX) {
        DD.FX.particles(u, { kind: 'glitter', color: '#ffd76a', count: 16 });
        DD.Act.log(u.name + ' reaches MAXIMUM MAGNIFICENCE! His next skill will SURGE.', 'hero');
        DD.Act.maybeBark(u, 'maxed', 0.5);
      }
    }
    return after - before;
  }
  /** Gain MAGNIFICENCE: banked while one of his own skills resolves (paid out in onSkillUsed), at once otherwise. */
  function gain(u, n) {
    if (!active(u) || !(n > 0)) return;
    if (ownSkill(u)) { const d = dataOf(u); d.mrwPending = (d.mrwPending || 0) + n; return; }
    addStacks(u, n);
  }

  /**
   * MAGNIFICENT SURGE: the meter resets, the party gains 10 Hype and a random GOOD wild magic effect goes off (two
   * different ones with the Hand Mirror), picked with the combat RNG. Returns the applied effects.
   */
  function surge(u, rng) {
    DD.Act.removeStatus(u, 'mrw_magnificence', { silent: true });
    const out = [];
    const WM = DD.WildMagic;
    if (!WM || !active(u) || !rng) return out;
    let pool = WM.pool(u, { good: true });
    if (!pool.length) pool = WM.pool(u, {});
    const picks = [];
    for (let i = 0; i < (hasItem(u, MIRROR) ? 2 : 1) && pool.length; i++) {
      const def = rng.weighted(pool, function (d) { return d.weight; });
      if (!def) break;
      picks.push(def);
      pool = pool.filter(function (d) { return d !== def; });
    }
    if (!picks.length) return out;
    DD.FX.banner('MAGNIFICENT SURGE!', { sub: picks.map(function (d) { return (d.icon || '✨') + ' ' + d.name; }).join(' + '), color: ORANGE, ms: 900 });
    DD.FX.sound('magic');
    DD.FX.particles(u, { kind: 'glitter', color: '#c9a8ff', count: 24 });
    DD.Act.bark(u, 'surge');
    DD.Act.log('MAGNIFICENT SURGE! The crowd goes wild.', 'hero');
    DD.Act.gainHype(SURGE_HYPE, 'MAGNIFICENT SURGE');
    picks.forEach(function (def) {
      if (!active(u)) return;
      const e = WM.apply(def.id, u, { silent: true, source: 'mrw_magnificence' });
      if (e) out.push(e);
    });
    return out;
  }

  DD.registerStatus({
    id: 'mrw_magnificence', name: 'MAGNIFICENT', icon: '🦁', color: '#ff9f2e', type: 'buff',
    stacking: 'stack', maxStacks: MAX, decay: 'never', defaultTurns: -1,
    desc: function (st) {
      const n = Math.max(0, Math.min(MAX, (st && st.stacks) || 0));
      return 'MAGNIFICENCE ' + n + '/' + MAX + '. ' + (n >= MAX ?
        'MAXED: his next skill unleashes a MAGNIFICENT SURGE (random good wild magic, +' + SURGE_HYPE + ' party Hype).' :
        'At ' + MAX + ', his next skill unleashes a MAGNIFICENT SURGE.');
    },
  });

  DD.registerStatus({
    id: 'mrw_rage', name: 'Ginger Rage', icon: '🌋', color: '#ff5a1f', type: 'buff',
    stacking: 'refresh', maxStacks: 9, decay: 'turnEnd', defaultTurns: 1,
    desc: function (st) { return 'Takes ' + ((st && st.stacks) || 1) + ' less damage from every hit (attacks, bumps, explosions).' + left(st); },
    hooks: {
      modifyIncomingDamage: function (d, st) { if (st && HIT_CAUSES[d.cause]) d.flat -= st.stacks || 1; },
    },
  });

  const PASSIVE = {
    name: 'MAGNIFICENCE',
    desc: 'Each of his skills that reaches a foe (a foe in its area) adds 1 MAGNIFICENCE. At ' + MAX + ', his next skill also ' +
      'unleashes a MAGNIFICENT SURGE (a random good wild magic effect, +' + SURGE_HYPE + ' party Hype) and the meter resets.',
    hooks: {
      onSkillUsed: function (ctx) {
        const u = ctx && ctx.user;
        if (!u) return;
        const d = dataOf(u);
        const pending = d.mrwPending || 0;
        d.mrwPending = 0;
        if (!active(u) || !isSkillDef(ctx.skill)) return;
        const s = DD.Combat.state;
        // no surge once the fight is decided (a banner + wild magic after the last kill would be wasted noise)
        if (stacksOf(u) >= MAX && !(s && s.result)) surge(u, ctx.rng || (s && s.rng));
        if (!active(u)) return;
        addStacks(u, pending + ((ctx.foes || []).length > 0 ? 1 : 0));
      },
      onCombatStart: function (u) { dataOf(u).mrwPending = 0; },
    },
  };

  // ---- YEET's flight path (pure: the HUD area shows where the thrown unit lands) ------------------------
  /** Same test as the engine's push: ice terrain / ice sheets make a pushed (non-flying) unit slide 1 extra tile. */
  function slippery(unit, x, y) {
    if (G().isFlying(unit)) return false;
    const t = G().tile(x, y);
    if (!t) return false;
    if (G().terrain(t).slide) return true;
    const sd = t.surface ? DD.getSurface(t.surface.id) : null;
    return !!(sd && sd.slide);
  }
  /** Run content hooks as a query (areas are asked on every hover): their pop-ups, logs and barks stay quiet. */
  function quietly(fn) {
    const FX = DD.FX, A = DD.Act, sim = A.simulating, push = FX.push;
    A.simulating = true;
    FX.push = function (evt) { return evt; };
    try { return fn(); } finally { FX.push = push; A.simulating = sim; }
  }
  /** How far a throw of n really carries the unit: the thrower's modifyOutgoingPush, then its modifyPush (as Act.push). */
  function throwDist(src, unit, dir, n) {
    const pm = { unit: unit, src: src || null, dir: { x: dir.x, y: dir.y }, dist: Math.floor(n), cancel: false };
    if (DD.Hooks && typeof DD.Hooks.fire === 'function') {
      quietly(function () {
        if (src && src !== unit) DD.Hooks.fire('modifyOutgoingPush', src, pm);
        if (!pm.cancel) DD.Hooks.fire('modifyPush', unit, pm);
      });
    }
    return pm.cancel ? 0 : Math.max(0, Math.floor(+pm.dist || 0));
  }
  /** Tiles a throw carries `unit` through (incl. the ice slide), plus the unit / object tile it would crash into. */
  function flightPath(unit, dir, n, src) {
    const out = [];
    if (!unit || !dir || (!dir.x && !dir.y)) return out;
    let x = unit.x, y = unit.y, steps = throwDist(src, unit, dir, n), slid = false;
    while (steps > 0) {
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
      steps--;
      if (steps === 0 && !slid && slippery(unit, x, y)) { steps = 1; slid = true; }
    }
    return out;
  }
  function throwTiles(user, L) { return ((L && L.push) || 3) + (hasItem(user, GAUNTLETS) ? GAUNTLET_TILES : 0); }

  // ---- skills -------------------------------------------------------------------------------------------
  function skill(def) { def.owner = 'marwyn'; return DD.registerSkill(def); }

  skill({
    id: 'mrw_ginger_snap', name: 'Ginger Snap', icon: '🪓', kind: 'attack', tags: ['melee'],
    ap: 1, cooldown: 0,
    levels: [{ dmg: 5 }],
    target: { type: 'unit', range: [1, 1], filter: 'enemy' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to an adjacent foe.'; },
    flavor: 'Named after the noise it makes. Not the biscuit. Never ask him about the biscuit.',
    execute: function (ctx) {
      const t = ctx.targetUnit;
      if (!active(t) || t === ctx.user) return;
      DD.FX.lunge(ctx.user, t);
      DD.Act.damage(ctx.user, t, ctx.L.dmg, { tags: ['melee'] });
      DD.FX.particles(t, { kind: 'sparks', count: 8 });
    },
  });

  skill({
    id: 'mrw_war_cry', name: 'LOOK AT MARWYN!', icon: '📣', kind: 'buff', tags: ['aoe', 'taunt', 'block'],
    ap: 1, cooldown: 2,
    levels: [{ block: 4, r: 2 }, { block: 6, r: 2 }, { block: 8, r: 3 }],
    target: { type: 'self' },
    area: { shape: 'circle', size: function (L) { return L.r; } },
    desc: function (L) { return 'Taunt every foe within ' + L.r + ' tiles and gain ' + L.block + ' Block.'; },
    flavor: 'Technically a war cry. Legally a noise complaint.',
    execute: function (ctx) {
      const u = ctx.user;
      DD.FX.explosion(u, { radius: ctx.L.r, color: ORANGE, kind: 'shout', shake: false, sound: 'roar' });
      DD.FX.text(u, 'I AM MAGNIFICENT!', { color: '#ffd76a', size: 20 });
      DD.Act.maybeBark(u, 'taunt', 0.5);
      ctx.foes.forEach(function (f) { taunt(u, f); });
      DD.Act.addBlock(u, ctx.L.block);
    },
  });

  skill({
    id: 'mrw_yeet', name: 'YEET', icon: '🤾', kind: 'attack', tags: ['melee', 'push', 'throw'],
    ap: 2, cooldown: 2,
    levels: [{ push: 3, crash: 6 }, { push: 3, crash: 8 }, { push: 4, crash: 10 }],
    target: {
      type: 'dir',
      canTarget: function (ctx) {
        const t = ctx.targetUnit;
        if (!t || t === ctx.user) return 'Nobody there to YEET.';
        if (DD.Act.isImmovable(t)) return 'Too heavy to YEET. (Marwyn tried.)';
        return true;
      },
    },
    area: {
      shape: 'custom',
      fn: function (ctx) {
        if (!ctx || !ctx.target) return [];
        const t = G().unitAt(ctx.target.x, ctx.target.y);
        const out = [{ x: ctx.target.x, y: ctx.target.y }];
        if (!t || !ctx.user || t === ctx.user) return out;
        return out.concat(flightPath(t, DD.util.dirTo(ctx.user, t), throwTiles(ctx.user, ctx.L), ctx.user));
      },
    },
    desc: function (L, user) {
      return 'Throw an adjacent unit (friend or foe) ' + throwTiles(user, L) + ' tiles away from him; on a crash, it and what it hits take ' +
        L.crash + ' damage.';
    },
    flavor: 'Ancient barbarian technique. The ancient barbarians could not explain it either.',
    execute: function (ctx) {
      const u = ctx.user, t = ctx.targetUnit;
      if (!active(t) || t === u) return;
      const dir = G().dist(u, t) === 1 ? DD.util.dirTo(u, t) : ctx.dir;
      DD.FX.lunge(u, t);
      DD.FX.text(t, 'YEET!', { color: '#ffe066', size: 22 });
      DD.Act.maybeBark(u, 'yeet', 0.5);
      const r = DD.Act.push(u, t, dir, throwTiles(u, ctx.L), { bump: ctx.L.crash });
      if (r.moved) DD.FX.particles(t, { kind: 'dust', count: 10 });
    },
  });

  skill({
    id: 'mrw_cleave', name: 'Glorious Cleave', icon: '⚔️', kind: 'attack', tags: ['melee', 'aoe'],
    ap: 2, cooldown: 1,
    levels: [{ dmg: 5 }, { dmg: 6 }, { dmg: 7, push: 1 }],
    target: { type: 'dir' },
    area: { shape: 'row', size: 1 },
    desc: function (L) {
      return 'Deal ' + L.dmg + ' damage to every foe on the 3 tiles in front of him' + (L.push ? ' and knock them back ' + L.push + ' tile' : '') + '.';
    },
    flavor: 'Three enemies, one swing, zero subtlety.',
    execute: function (ctx) {
      const u = ctx.user;
      if (ctx.target) DD.FX.lunge(u, ctx.target);
      ctx.tiles.forEach(function (p, i) { DD.FX.tile(p.x, p.y, 'pulse', { color: ORANGE, parallel: i > 0 }); });
      ctx.foes.forEach(function (f) {
        if (!active(f)) return;
        DD.Act.damage(u, f, ctx.L.dmg, { tags: ['melee'] });
        if (ctx.L.push && active(f) && active(u)) DD.Act.push(u, f, ctx.dir, ctx.L.push);
      });
    },
  });

  skill({
    id: 'mrw_headbutt', name: 'Use Your Head', icon: '🤕', kind: 'attack', tags: ['melee', 'stun'],
    ap: 2, hpCost: 2, cooldown: function (L) { return L.cd; },
    levels: [{ dmg: 7, cd: 3 }, { dmg: 8, cd: 3 }, { dmg: 10, cd: 2 }],
    target: { type: 'unit', range: [1, 1], filter: 'enemy' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to an adjacent foe and Stun it. Costs him 2 HP.'; },
    flavor: 'The one time anyone told Marwyn to use his head. He took it literally. He takes everything literally.',
    execute: function (ctx) {
      const u = ctx.user, t = ctx.targetUnit;
      if (!active(t) || t === u) return;
      DD.FX.lunge(u, t, { ms: 120 });
      DD.FX.shake(5, 220);
      DD.FX.text(t, 'BONK!', { color: '#ffe08a', size: 20 });
      DD.Act.damage(u, t, ctx.L.dmg, { tags: ['melee'] });
      if (active(t)) DD.Act.addStatus(t, 'stun', { turns: 1 }, u);
    },
  });

  // v1 review: Hero Landing replaced Fastball Special (Slate throws allies). v2: a plain leap whose landing taunts.
  skill({
    id: 'mrw_hero_landing', name: 'Hero Landing', icon: '🦸', kind: 'move', tags: ['leap', 'move', 'taunt'],
    ap: 2, cooldown: 2,
    levels: [{ leap: 3 }, { leap: 4 }, { leap: 5 }],
    target: {
      type: 'tile', range: function (L) { return [1, L.leap]; }, filter: 'empty', los: false,
      canTarget: function (ctx) {
        const p = ctx.target, u = ctx.user;
        if (!p || !u) return false;
        return G().hazardAt(p.x, p.y, u) ? 'Not even Marwyn lands in THAT.' : true;
      },
    },
    area: { shape: 'circle', size: 1 },
    canUse: function (ctx) { return ctx.user && DD.Act.cantMove(ctx.user) ? 'Rooted: no leaping without legs.' : true; },
    desc: function (L) { return 'Leap to a free tile up to ' + L.leap + ' tiles away and Taunt every foe next to where he lands.'; },
    flavor: 'Superhero landings are terrible for the knees. His knees filed a complaint. Marwyn denied it.',
    execute: function (ctx) {
      const u = ctx.user, p = ctx.target;
      if (!active(u) || !p) return;
      if (p.x !== u.x || p.y !== u.y) {
        const from = { x: u.x, y: u.y };
        DD.FX.jump(u, from, p, { ms: 420 });
        if (!DD.Act.teleport(u, p.x, p.y, { fx: false }) || !active(u)) return;
      }
      DD.FX.text(u, 'HERO LANDING!', { color: '#ffd76a', size: 18 });
      DD.Act.maybeBark(u, 'landing', 0.5);
      DD.FX.shake(4, 200);
      DD.FX.particles(u, { kind: 'dust', count: 14 });
      adjacentFoes(u, u).forEach(function (f) { taunt(u, f); });
    },
  });

  skill({
    id: 'mrw_gun_show', name: 'Gun Show', icon: '💪', kind: 'buff', tags: ['root', 'thorns'],
    ap: 1, cooldown: 2,
    levels: [{ thorns: 2 }, { thorns: 3 }, { thorns: 4 }],
    target: { type: 'self' },
    area: { shape: 'adjacent' },
    desc: function (L) { return 'Flex: Root every adjacent foe and gain Thorns ' + L.thorns + ' (adjacent attackers take ' + L.thorns + ' back).'; },
    flavor: 'Tickets are free. Leaving is not.',
    execute: function (ctx) {
      const u = ctx.user;
      DD.FX.particles(u, { kind: 'glitter', color: ORANGE, count: 14 });
      DD.FX.text(u, '💪 GUN SHOW 💪', { color: '#ffd76a', size: 16 });
      DD.Act.maybeBark(u, 'flex', 0.5);
      ctx.foes.forEach(function (f) { if (active(f)) DD.Act.addStatus(f, 'root', { turns: 1 }, u); });
      DD.Act.addStatus(u, 'thorns', { stacks: ctx.L.thorns, turns: 1 }, u);
    },
  });

  skill({
    id: 'mrw_rage', name: 'Ginger Rage', icon: '🌋', kind: 'buff', tags: ['rage'],
    ap: 1, cooldown: 3,
    levels: [{ reduce: 2, stacks: 2 }, { reduce: 3, stacks: 2 }, { reduce: 4, stacks: 2 }],
    target: { type: 'self' },
    desc: function (L) {
      return 'Until the end of his next turn, every hit deals ' + L.reduce + ' less damage to him. Gain ' + L.stacks + ' MAGNIFICENCE.';
    },
    flavor: 'The ginger is not decorative. It is a warning.',
    execute: function (ctx) {
      const u = ctx.user;
      DD.FX.particles(u, { kind: 'fire', count: 16 });
      DD.FX.text(u, 'GINGER RAGE!', { color: '#ff6a3a', size: 18 });
      DD.Act.addStatus(u, 'mrw_rage', { stacks: ctx.L.reduce, turns: 1 }, u);
      gain(u, ctx.L.stacks);
    },
  });

  skill({
    id: 'mrw_magnetism', name: 'Center of Attention', icon: '🧲', kind: 'spell', tags: ['pull', 'aoe', 'taunt', 'wildmagic'],
    ap: 3, cooldown: 3,
    levels: [{ r: 3, pull: 2 }, { r: 4, pull: 2 }, { r: 4, pull: 3 }],
    target: { type: 'self' },
    area: { shape: 'circle', size: function (L) { return L.r; } },
    desc: function (L) { return 'Wild magic: pull every foe within ' + L.r + ' tiles up to ' + L.pull + ' tiles toward him, then Taunt them.'; },
    flavor: 'His wild magic makes him literally attractive. Nobody can look away. Nobody can walk away.',
    execute: function (ctx) {
      const u = ctx.user;
      DD.FX.explosion(u, { radius: ctx.L.r, color: '#b388ff', kind: 'magic', shake: false, sound: 'magic' });
      DD.FX.particles(u, { kind: 'runes', color: '#c9a8ff', count: 20 });
      ctx.foes.filter(active).sort(byDistance(u)).forEach(function (f) {
        if (!active(f) || !active(u)) return;
        if (G().dist(f, u) > 1 && !DD.Act.isImmovable(f)) DD.Act.pull(u, f, { x: u.x, y: u.y }, ctx.L.pull);
        taunt(u, f);
      });
    },
  });

  skill({
    id: 'mrw_keg_stand', name: 'Keg Stand', icon: '🍺', kind: 'heal', tags: ['heal', 'water', 'aoe'],
    ap: 1, cooldown: 1, charges: 2,
    levels: [{ heal: 4, r: 1 }, { heal: 6, r: 1 }, { heal: 8, r: 2 }],
    target: { type: 'self' },
    area: { shape: 'circle', size: function (L) { return L.r; } },
    desc: function (L) { return 'Heal ' + L.heal + ' HP and splash water on every tile within ' + L.r + ' (units there get Wet). 2 kegs per fight.'; },
    flavor: 'Ale is mostly water. Marwyn is mostly ale. Hydration is very important to him.',
    execute: function (ctx) {
      const u = ctx.user;
      DD.FX.particles(u, { kind: 'bubbles', color: '#e8b04a', count: 18 });
      DD.FX.text(u, 'CHUG! CHUG! CHUG!', { color: '#ffd76a', size: 15 });
      DD.Act.heal(u, u, ctx.L.heal);
      if (!active(u)) return;
      DD.FX.sound('splash');
      DD.Act.splash(u.x, u.y, ctx.L.r, 'water', 3, u);
    },
  });

  skill({
    id: 'mrw_behold', name: 'BEHOLD, MARWYN!', icon: '💥', kind: 'buff', tags: ['taunt', 'block', 'aoe'],
    ap: 2, hype: 100,
    levels: [{ block: 15 }],
    target: { type: 'self' },
    area: { shape: 'all_foes' },
    desc: function (L) { return 'EVERY enemy is Taunted and Marwyn gains ' + L.block + ' Block.'; },
    flavor: 'He has rehearsed this pose in every puddle he has ever looked into.',
    execute: function (ctx) {
      const u = ctx.user;
      DD.FX.banner('BEHOLD, MARWYN!', { sub: 'Look upon him. LOOK.', color: ORANGE, ms: 900 });
      DD.FX.explosion(u, { radius: 2, color: '#ffd27a', kind: 'shout', shake: false, sound: 'roar' });
      DD.FX.shake(10, 450);
      DD.FX.flash('#ffd27a', 220);
      DD.FX.particles(u, { kind: 'glitter', color: '#ffd76a', count: 30 });
      ctx.foes.forEach(function (f) { if (taunt(u, f)) DD.FX.text(f, '😍', { size: 16, parallel: true }); });
      DD.Act.addBlock(u, ctx.L.block);
    },
  });

  // ---- items -------------------------------------------------------------------------------------------
  DD.registerItem({
    id: GAUNTLETS, name: 'Gauntlets of Competitive Yeeting', slot: 'weapon', rarity: 'rare', icon: '🧤', hero: 'marwyn',
    stats: { dmg: 0.05 },
    desc: '+5% damage. YEET throws ' + GAUNTLET_TILES + ' tiles further.',
    flavor: 'He put the axe down to free up both hands for throwing. Then picked it back up. Now he has three hands, somehow.',
    hooks: {},
  });

  DD.registerItem({
    id: LOINCLOTH, name: 'Loincloth of Unearned Confidence', slot: 'armor', rarity: 'rare', icon: '🩲', hero: 'marwyn',
    stats: { hp: 6 },
    desc: '+6 max HP. Foes Taunted by Marwyn deal 25% less damage to him.',
    flavor: 'Covers the essentials. Barely. Boldly.',
    hooks: {
      modifyIncomingDamage: function (d) {
        const src = d.source, me = d.target;
        if (!src || !me || src === me) return;
        const st = DD.Act.getStatus(src, 'taunt');
        if (st && st.source === me.id) d.mult *= 0.75;
      },
    },
  });

  DD.registerItem({
    id: MIRROR, name: 'Hand Mirror of Self-Admiration', slot: 'trinket', rarity: 'legendary', icon: '🪞', hero: 'marwyn',
    stats: {},
    desc: 'His MAGNIFICENT SURGEs unleash two different good wild magic effects instead of one.',
    flavor: 'Mirror, mirror, in his hand: who is the most MAGNIFICENT in the land? (It has stopped answering. It just nods.)',
    hooks: {},
  });

  // ---- sprite ----------------------------------------------------------------------------------------------
  /**
   * Overlay = the MAGNIFICENCE meter, worn: a gold championship-belt buckle with 5 gem sockets that light up one per
   * stack. At 5 the gems turn wild-magic violet and sparkles orbit him (his next skill surges). Everything stays inside
   * the body so the HP bar above his head is never covered.
   */
  function magnificenceOverlay(g, t, o) {
    if (o && o.lying > 0.5) return;
    const unit = (o && o.unit) || g.unit;
    const n = unit && unit.statuses ? stacksOf(unit) : 0;
    const by = -9.8, bx = 1;
    const maxed = n >= MAX;
    const pulse = 0.5 + 0.5 * Math.sin(t * 7);
    if (maxed) g.glow(0, -22, 26, '#b98cff', 0.12 + 0.08 * pulse);
    g.rect(bx - 5.4, by - 2.5, 10.8, 5, '#f2c33a', g.outline, 1.4);
    g.rect(bx - 4.2, by - 1.4, 8.4, 2.8, '#b8860b', null, 0.8);
    for (let i = 0; i < MAX; i++) {
      const lit = i < n;
      const gx = bx + (i - 2) * 1.75;
      g.circle(gx, by, 0.85, lit ? (maxed ? '#e9d6ff' : '#e8203a') : '#4a2a08', null);
      if (lit) g.circle(gx - 0.25, by - 0.3, 0.28, '#ffffff', null);
    }
    if (!maxed) return;
    for (let i = 0; i < 6; i++) {
      const a = t * 2.4 + i * (Math.PI / 3);
      const front = Math.sin(a) > 0;
      g.star(Math.cos(a) * 15, -24 + Math.sin(a) * 5, (front ? 2.6 : 1.9) + pulse * 0.7, i % 2 ? '#ffe27a' : '#e9d6ff', null, 4, 0.36);
    }
    for (let s = -1; s <= 1; s += 2) g.star(s * 15.5, -41 + Math.sin(t * 9 + s) * 0.8, 1.5 + pulse, '#d9b8ff', null, 4, 0.3);
  }

  const SPRITE = {
    base: 'humanoid', scale: 1.14, build: 'huge', outfit: 'furs',
    palette: {
      skin: '#f4b996', cloth: '#7b4a2c', cloth2: '#efe2c4', hair: '#e2581f', beard: '#f06a24', metal: '#c3cad3',
      eye: '#2c6ed6', accent: ORANGE, outline: '#2a150b', leather: '#5b3820', boots: '#4a2e1b', belt: '#4a2e1b', fur: '#8a5a34',
    },
    head: { size: 1.05, ears: 'none', horns: 'none', hair: 'wild', beard: 'wild', hat: 'viking', face: 'none', eyes: 'normal', mouth: 'open' },
    wings: 'none', tail: 'none', mainhand: 'greataxe', offhand: 'none', bling: [], extras: ['belt'], aura: null,
    overlay: magnificenceOverlay,
  };

  // ---- the hero ------------------------------------------------------------------------------------------
  DD.registerHero({
    id: 'marwyn', name: 'Marwyn', epithet: 'the Magnificent', race: 'Human', cls: 'Barbarian',
    role: 'Tank / bruiser / taunts', complexity: 2,
    blurb: 'Seven feet of ginger beard, furs and volume who refers to himself in the third person, in capitals. Marwyn taunts ' +
      'everything, throws anything and bottles up so much MAGNIFICENCE that it leaks out as wild magic. Nobody has ever won an ' +
      'argument with the beard.',
    color: '#e8823a',
    unlock: null,
    stats: { hp: 35, ap: 3, mov: 3, armor: 0, init: 0 },
    growth: { hp: 5 },
    flags: {},
    sprite: SPRITE,
    basic: 'mrw_ginger_snap',
    signature: 'mrw_behold',
    passive: PASSIVE,
    startingSkills: ['mrw_war_cry', 'mrw_yeet'],
    skillPool: ['mrw_war_cry', 'mrw_yeet', 'mrw_cleave', 'mrw_headbutt', 'mrw_hero_landing', 'mrw_gun_show', 'mrw_rage',
      'mrw_magnetism', 'mrw_keg_stand'],
    summons: [],
    barks: {
      select: [
        'MARWYN IS READY. MARWYN WAS BORN READY.',
        'You have chosen... MAGNIFICENTLY.',
        'Point Marwyn at something. Preferably large.',
        'Yes? The beard is listening.',
        'Marwyn awaits your MAGNIFICENT command.',
      ],
      start: [
        'BEHOLD! A worthy audience for MARWYN!',
        'Stand back, Syllamin. Marwyn needs room to be MAGNIFICENT.',
        'Who wants to be thrown first? No volunteers? Marwyn picks.',
        'Roll for initiative? Marwyn rolls for MAGNIFICENCE!',
        'Zarathor, stop polishing your rings. We fight!',
        'Kiri, shoot whatever Marwyn is not already hitting.',
      ],
      move: [
        'MARWYN APPROACHES.',
        'Make way for MAGNIFICENCE!',
        'Stomp. Stomp. MAGNIFICENT stomp.',
        'The floor is honored.',
      ],
      kill: [
        'ANOTHER CHAPTER FOR THE SAGA OF MARWYN!',
        'Did everyone see that? Josiah, write it down!',
        'MAGNIFICENT!',
        'You fought well. Marwyn fought MAGNIFICENTLY.',
        'Down you go. NEXT!',
      ],
      hurt: [
        'A scratch! A MAGNIFICENT scratch!',
        'Ow. That will make a GREAT scar.',
        'Marwyn felt that. Marwyn LIKED that.',
        'Is that all? The beard has taken worse.',
      ],
      lowhp: [
        'Marwyn is... still MAGNIFICENT. Mostly.',
        'Ellaria! A corgi! Any corgi! For emotional support!',
        'This is just the dramatic part of the saga.',
        'Josiah, the good potion. Not the purple one.',
      ],
      downed: [
        'Tell the bards... Marwyn was... MAGNIFICENT...',
        'Marwyn is not dead. Marwyn is resting MAGNIFICENTLY.',
        'Too... much... glory...',
        'Remember Marwyn as he was: enormous.',
      ],
      revive: [
        'MARWYN RETURNS! You missed him. Admit it.',
        'Death could not handle this much MAGNIFICENCE.',
        'Back! And twice as ginger!',
        'A MAGNIFICENT comeback, exactly as foretold.',
      ],
      ally_down: [
        'NO! Who will witness Marwyn\'s MAGNIFICENCE now?!',
        'You will PAY for that! In MAGNIFICENT installments!',
        'Get up! Marwyn needs an audience!',
        'That one was Marwyn\'s friend! Probably!',
        'Basanos, get up! Marwyn still owes you an arm-wrestle!',
      ],
      levelup: [
        'MARWYN GREW EVEN MORE MAGNIFICENT. Impossible, yet here we are.',
        'More MAGNIFICENT? Is that even legal?',
        'Level up! The beard grows stronger.',
        'The DM finally noticed Marwyn. About time.',
      ],
      victory: [
        'VICTORY! Exactly as Marwyn predicted. Loudly.',
        'Another MAGNIFICENT triumph for the saga!',
        'Syllamin, compose a ballad. Make Marwyn taller in it.',
        'Ale for everyone! Marwyn is paying! Buga is paying.',
      ],
      idle: [
        'Marwyn flexes. Nobody asked. Marwyn flexes anyway.',
        'Is anyone else hungry? Marwyn could eat a bugbear.',
        'Professor Marbles, are you asleep again?',
        'The beard has a beard. Look closer.',
        'Slate, you look grumpy. Marwyn will hug it out of you.',
        'Betty, stop eating the map. Marwyn was reading that.',
      ],
      signature: [
        'BEHOLD, MARWYN!',
        'ALL EYES ON MARWYN!',
        'WITNESS ME! WITNESS MARWYN!',
        'LOOK UPON MARWYN AND DESPAIR! OR APPLAUD!',
      ],
      // extra keys (DD.Act.bark): MAGNIFICENT SURGE, maxed meter, war cry, YEET, Hero Landing, Gun Show
      surge: [
        'MARWYN IS MAGNIFICENT!',
        'TOO MUCH MAGNIFICENCE! IT IS LEAKING!',
        'The beard is glowing again. Stand back.',
        'WILD MAGIC? NO. MARWYN MAGIC!',
      ],
      maxed: [
        'MAXIMUM MAGNIFICENCE ACHIEVED.',
        'Marwyn is FULL of MAGNIFICENCE. Something must give.',
        'Corelos, is the beard supposed to hum like that?',
      ],
      taunt: [
        'I AM MAGNIFICENT!',
        'LOOK AT MARWYN! ONLY AT MARWYN!',
        'Over here, cowards! The MAGNIFICENT one!',
      ],
      yeet: [
        'YEET!',
        'Marwyn calls this one: the long goodbye!',
        'Fly, little one! FLY!',
        'Sparrow, take notes. This is how you throw a goblin.',
      ],
      landing: [
        'FEAR NOT! MARWYN IS HERE!',
        'Did somebody call for a HERO? Nobody? Marwyn came anyway.',
        'Stand behind Marwyn, Syllamin. Way behind. He is very wide.',
        'Marwyn has arrived. You may now be rescued.',
      ],
      flex: [
        'Welcome to the GUN SHOW!',
        'Look all you like. Leaving is extra.',
        'These are not arms. These are LEGENDS.',
      ],
    },
  });

  /** Small public surface for tests and other content (e.g. events that want to pump Marwyn up). */
  DD.Marwyn = {
    MAX: MAX, SURGE_HYPE: SURGE_HYPE, GAUNTLET_TILES: GAUNTLET_TILES, stacksOf: stacksOf, addStacks: addStacks, gain: gain,
    surge: surge, flightPath: flightPath, hasItem: hasItem,
  };
})();
