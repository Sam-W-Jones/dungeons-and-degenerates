/* Dungeons and Degenerates — js/data/wildmagic.js
 * DD.WildMagic (ARCHITECTURE §5.9, DESIGN §7): the shared table of wild-magic surges.
 *   DD.WildMagic.surge(unit, { good, source, kind, silent }) → effect | null   random surge (combat rng)
 *   DD.WildMagic.apply(id, unit, opts) → effect | null                         a specific surge
 *   DD.WildMagic.register({ id, name, weight, good, text, apply(unit, ctx) })  (+ icon, quip, enemySafe, canApply)
 *   DD.WildMagic.list() · get(id) · pool(unit, opts) · describe(idOrDef, act)
 * good: true helps the surging unit's side · false backfires · null is chaos for everyone.
 * opts.good: true → good surges only · false → anything but good · omitted → the whole table (mostly good).
 * Enemy-side units (wild-magic bosses) only roll surges flagged enemySafe.
 * Numbers scale by act; text tokens {dmg} {small} {heal} {block} {bigBlock} {gold} {fee} {hype} {regen}.
 * effect = { id, name, icon, good, text, quip, unitId, source }.
 * Also registers the surge-only units: summon wm_duck (Confused Duck) and enemy wm_duck_foe (Hostile Duck).
 */
(function () {
  'use strict';
  const DD = window.DD;

  const SCALE = {
    dmg: [5, 7, 9], small: [2, 3, 4], heal: [6, 9, 12], block: [6, 8, 10], bigBlock: [10, 13, 16],
    gold: [10, 15, 20], fee: [5, 8, 10], hype: [15, 15, 15], regen: [2, 3, 4],
  };
  const GOOD_COLOR = { true: '#7dffb0', false: '#ff7b6b', null: '#d9a8ff' };
  const SOUTH = { x: 0, y: 1 };

  const defs = {};
  const order = [];

  const WM = (DD.WildMagic = {
    /** Register a surge. Fields: id, name, weight (1), good (true|false|null), text, apply(unit, ctx);
     *  optional icon, quip, enemySafe (usable by enemy-side units), canApply(unit, ctx) → bool. */
    register: function (def) {
      if (!def || typeof def.id !== 'string' || typeof def.apply !== 'function') {
        DD.warn('WildMagic.register: a surge needs an id and an apply function');
        return null;
      }
      if (defs[def.id]) DD.warn('WildMagic.register: duplicate surge "' + def.id + '" (later one wins)');
      else order.push(def.id);
      const d = Object.assign({ name: def.id, weight: 1, good: null, text: '', icon: '✨', quip: '', enemySafe: false }, def);
      if (d.good !== true && d.good !== false) d.good = null;
      d.weight = Math.max(0, +d.weight || 0);
      defs[d.id] = d;
      return d;
    },
    get: function (id) { return defs[id] || null; },
    list: function () { return order.map(function (id) { return defs[id]; }); },
  });

  // =====================================================================================================
  // Context helpers (built per surge)
  // =====================================================================================================

  function combatState() { return DD.Combat && DD.Combat.state ? DD.Combat.state : null; }
  function actOf(state) {
    const a = (state && state.run && state.run.act) || (state && state.encounter && state.encounter.act) || 1;
    return Math.max(1, Math.min(3, Math.round(+a) || 1));
  }
  function active(u) { return !!u && !u.dead && !u.downed; }
  function dist(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }
  function hostile(a, b) {
    if (DD.Grid && DD.Grid.hostile) return DD.Grid.hostile(a, b);
    return !!a && !!b && a !== b && a.side !== b.side;
  }
  function isBoss(u) {
    if (!u) return false;
    if (u.tier === 'boss' || u.isBoss) return true;
    const d = u.kind === 'enemy' && DD.getEnemy ? DD.getEnemy(u.defId) : null;
    return !!(d && (d.tier === 'boss' || d.boss));
  }
  function immovable(u) { return !!(u && u.flags && u.flags.immovable) || isBoss(u); }
  function tileOf(state, x, y) {
    if (DD.Grid && DD.Grid.tile) return DD.Grid.tile(x, y);
    const g = state && state.grid;
    return g && x >= 0 && y >= 0 && x < g.w && y < g.h ? g.tiles[y * g.w + x] : null;
  }

  function fill(text, n) {
    return String(text || '').replace(/\{(\w+)\}/g, function (m, k) { return n[k] !== undefined ? String(n[k]) : m; });
  }

  function makeCtx(unit, state, opts) {
    const act = actOf(state), i = act - 1, n = {};
    for (const k in SCALE) n[k] = SCALE[k][i];
    const units = function () { return (state.units || []).filter(active); };
    const ctx = {
      state: state, rng: state.rng && state.rng.next ? state.rng : DD.rng, act: act, n: n, opts: opts,
      source: opts.source || null,
      units: units,
      foes: function () { return units().filter(function (u) { return hostile(unit, u); }); },
      friends: function () { return units().filter(function (u) { return u === unit || (!hostile(unit, u) && u.side === unit.side); }); },
      others: function () { return units().filter(function (u) { return u !== unit; }); },
      within: function (list, r, from) { const c = from || unit; return list.filter(function (u) { return dist(u, c) <= r; }); },
      tile: function (x, y) { return tileOf(state, x, y); },
      isBoss: isBoss,
      immovable: immovable,
      /** Free, safe, dry tiles without objects within r of (x, y), nearest first. */
      freeTiles: function (x, y, r) {
        const out = [];
        const taken = {};
        units().forEach(function (u) { taken[u.x + ',' + u.y] = true; });
        for (let d = 0; d <= r; d++) {
          for (let dy = -d; dy <= d; dy++) {
            const rem = d - Math.abs(dy);
            const xs = rem === 0 ? [0] : [-rem, rem];
            for (let k = 0; k < xs.length; k++) {
              const tx = x + xs[k], ty = y + dy, t = tileOf(state, tx, ty);
              if (!t || t.obj || taken[tx + ',' + ty]) continue;
              if (DD.Grid && DD.Grid.isFree && !DD.Grid.isFree(tx, ty)) continue;
              if (!DD.MapGen || !DD.MapGen.isSafeTile(t)) continue;
              const td = DD.MapGen.terrainInfo(t.t);
              if (td.liquid) continue;
              out.push({ x: tx, y: ty });
            }
          }
        }
        return out;
      },
      pick: function (list) { return list.length ? list[Math.floor(ctx.rng.next() * list.length) % list.length] : null; },
    };
    return ctx;
  }

  function act(name) { return DD.Act && typeof DD.Act[name] === 'function'; }
  function fx(name) { return DD.FX && typeof DD.FX[name] === 'function'; }

  // =====================================================================================================
  // Running a surge
  // =====================================================================================================

  function eligible(def, unit, ctx, opts) {
    if (!def || !(def.weight > 0)) return false;
    if (opts.good === true && def.good !== true) return false;
    if (opts.good === false && def.good === true) return false;
    if (opts.kind === 'good' && def.good !== true) return false;
    if (opts.kind === 'bad' && def.good !== false) return false;
    if (opts.kind === 'chaos' && def.good !== null) return false;
    if (unit.side !== 'hero' && !def.enemySafe) return false;
    if (def.canApply) return DD.safe('wild surge canApply ' + def.id, def.canApply, def, [unit, ctx]) === true;
    return true;
  }

  /** Surges this unit could roll right now. */
  WM.pool = function (unit, opts) {
    const state = combatState();
    if (!state || !active(unit)) return [];
    opts = opts || {};
    const ctx = makeCtx(unit, state, opts);
    return WM.list().filter(function (d) { return eligible(d, unit, ctx, opts); });
  };

  /** Mechanics text of a surge for an act (tokens filled). */
  WM.describe = function (idOrDef, act) {
    const d = typeof idOrDef === 'string' ? defs[idOrDef] : idOrDef;
    if (!d) return '';
    const i = Math.max(1, Math.min(3, Math.round(+act) || 1)) - 1, n = {};
    for (const k in SCALE) n[k] = SCALE[k][i];
    return fill(d.text, n);
  };

  function run(def, unit, ctx, opts) {
    const text = fill(def.text, ctx.n);
    const color = GOOD_COLOR[String(def.good)];
    if (!opts.silent) {
      if (fx('banner')) DD.FX.banner('WILD MAGIC!', { sub: def.icon + ' ' + def.name, color: color, ms: 850 });
      if (fx('sound')) DD.FX.sound('magic');
      if (fx('particles')) DD.FX.particles(unit, { kind: 'glitter', color: color, count: 18 });
    }
    if (act('log')) DD.Act.log(unit.name + ' surges with wild magic — ' + def.name + ': ' + text, 'status');
    const res = DD.safe('wild surge ' + def.id, def.apply, def, [unit, ctx]);
    if (def.quip && act('log')) DD.Act.log(def.quip, 'narrator');
    const effect = {
      id: def.id, name: def.name, icon: def.icon, good: def.good,
      text: res && typeof res.text === 'string' ? res.text : text,
      quip: def.quip, unitId: unit.id, source: ctx.source,
    };
    if (DD.Events) DD.Events.emit('wildmagic:surge', effect);
    return effect;
  }

  /** Roll and apply a random surge for unit. Returns the effect, or null outside combat / with no options. */
  WM.surge = function (unit, opts) {
    opts = opts || {};
    const state = combatState();
    if (!state || !active(unit) || !DD.Act) return null;
    const ctx = makeCtx(unit, state, opts);
    let pool = WM.list().filter(function (d) { return eligible(d, unit, ctx, opts); });
    if (!pool.length) pool = WM.list().filter(function (d) { return eligible(d, unit, ctx, {}); });
    if (!pool.length) return null;
    const def = ctx.rng.weighted ? ctx.rng.weighted(pool, function (d) { return d.weight; }) : pool[0];
    return run(def, unit, ctx, opts);
  };

  /** Apply one specific surge (tests, debug, content that wants a particular joke). Ignores weight/side filters. */
  WM.apply = function (id, unit, opts) {
    opts = opts || {};
    const def = defs[id], state = combatState();
    if (!def || !state || !active(unit) || !DD.Act) return null;
    const ctx = makeCtx(unit, state, opts);
    if (def.canApply && DD.safe('wild surge canApply ' + def.id, def.canApply, def, [unit, ctx]) !== true) return null;
    return run(def, unit, ctx, opts);
  };

  // =====================================================================================================
  // Effect helpers
  // =====================================================================================================

  function heal(unit, target, amount) { if (active(target)) DD.Act.heal(unit, target, amount, { tags: ['wildmagic'] }); }
  function status(target, id, turns, stacks, src) {
    if (!active(target) || !act('addStatus')) return;
    const o = {};
    if (stacks) o.stacks = stacks;
    if (turns !== undefined) o.turns = turns;
    DD.Act.addStatus(target, id, o, src || null);
  }
  function hit(unit, target, amount, element, extraTags) {
    if (!active(target)) return 0;
    return DD.Act.damage(unit, target, amount, { element: element || null, tags: ['wildmagic'].concat(extraTags || []), cause: 'other' });
  }
  function randomNonBossFoe(unit, ctx) { return ctx.pick(ctx.foes().filter(function (u) { return !isBoss(u); })); }
  function hasNonBossFoe(unit, ctx) { return ctx.foes().some(function (u) { return !isBoss(u); }); }
  function skyAbove(ctx, p) { const t = ctx.tile(p.x, p.y); return { x: p.x, y: p.y, h: (t ? t.h || 0 : 0) + 7 }; }

  // =====================================================================================================
  // The table — good surges
  // =====================================================================================================

  WM.register({
    id: 'wm_make_it_rain', name: 'Make It Rain', icon: '💰', weight: 3, good: true,
    text: 'The party gains {gold} gold.',
    quip: 'Gold coins rain from the ceiling. The DM frantically re-reads the loot table.',
    canApply: function (unit) { return unit.side === 'hero' && act('gainGold'); },
    apply: function (unit, ctx) {
      if (fx('particles')) DD.FX.particles(skyAbove(ctx, unit), { kind: 'coins', count: 24 });
      if (fx('sound')) DD.FX.sound('coin');
      DD.Act.gainGold(ctx.n.gold);
    },
  });

  WM.register({
    id: 'wm_self_care', name: 'Spontaneous Self-Care', icon: '🛁', weight: 2, good: true, enemySafe: true,
    text: 'The surger and adjacent allies heal {heal} HP.',
    quip: 'A scented candle appears from nowhere. Everyone feels seen.',
    apply: function (unit, ctx) {
      ctx.within(ctx.friends(), 1).forEach(function (u) {
        if (fx('particles')) DD.FX.particles(u, { kind: 'hearts', count: 8, parallel: true });
        heal(unit, u, ctx.n.heal);
      });
    },
  });

  WM.register({
    id: 'wm_enlarge', name: 'Enlarge (Unrequested)', icon: '🦣', weight: 2, good: true, enemySafe: true,
    text: 'The surger gains Empowered (next damaging skill +50%) and {block} Block.',
    quip: 'You are HUGE now. Your pants are not.',
    apply: function (unit, ctx) {
      status(unit, 'empowered', -1, 1, unit);
      DD.Act.addBlock(unit, ctx.n.block);
    },
  });

  WM.register({
    id: 'wm_baa', name: 'Baa-d Luck', icon: '🐑', weight: 2, good: true,
    text: 'A random non-boss enemy turns into a Sheep for 1 turn.',
    quip: 'Somewhere, a shepherd gains a very confused employee.',
    canApply: function (unit, ctx) { return hasNonBossFoe(unit, ctx); },
    apply: function (unit, ctx) {
      const foe = randomNonBossFoe(unit, ctx);
      if (!foe) return;
      if (fx('particles')) DD.FX.particles(foe, { kind: 'smoke', count: 14 });
      status(foe, 'sheep', 1, 1, unit);
      return { text: foe.name + ' turns into a Sheep for 1 turn.' };
    },
  });

  WM.register({
    id: 'wm_bees', name: 'BEES!', icon: '🐝', weight: 2, good: true, enemySafe: true,
    text: 'Every enemy within 3 tiles takes {small} damage and {small} Poison.',
    quip: 'Not the bees! (Yes, the bees.)',
    canApply: function (unit, ctx) { return ctx.within(ctx.foes(), 3).length > 0; },
    apply: function (unit, ctx) {
      ctx.within(ctx.foes(), 3).forEach(function (foe) {
        if (fx('particles')) DD.FX.particles(foe, { kind: 'sparks', color: '#ffd23f', count: 10, parallel: true });
        hit(unit, foe, ctx.n.small, 'poison');
        status(foe, 'poison', undefined, ctx.n.small, unit);
      });
    },
  });

  WM.register({
    id: 'wm_caffeine', name: 'Caffeine Surge', icon: '☕', weight: 2, good: true, enemySafe: true,
    text: 'The surger gains Haste for 2 turns; a hero also gains 1 AP right now.',
    quip: 'Seven espressos materialise. All of them are consumed. Immediately.',
    apply: function (unit) {
      status(unit, 'haste', 2, 1, unit);
      if (unit.side === 'hero' && act('gainAp')) DD.Act.gainAp(unit, 1);
    },
  });

  WM.register({
    id: 'wm_duck', name: 'Summon Confused Duck', icon: '🦆', weight: 3, good: true, enemySafe: true,
    text: 'A Confused Duck appears next to the surger and fights on its side.',
    quip: 'It is a duck. Nobody ordered a duck. The duck does not care.',
    canApply: function (unit, ctx) {
      return ctx.freeTiles(unit.x, unit.y, 2).length > 0 && (unit.side === 'hero' ? act('summon') : act('spawn'));
    },
    apply: function (unit, ctx) {
      const spot = ctx.freeTiles(unit.x, unit.y, 2).filter(function (p) { return p.x !== unit.x || p.y !== unit.y; })[0];
      if (!spot) return;
      const hpMult = [1, 1.5, 2][ctx.act - 1];
      let duck;
      if (unit.side === 'hero') duck = DD.Act.summon(unit, 'wm_duck', spot.x, spot.y, { hpMult: hpMult, ready: true });
      else {
        if (fx('sound')) DD.FX.sound('summon');
        duck = DD.Act.spawn('wm_duck_foe', spot.x, spot.y, { hpMult: hpMult });
      }
      if (!duck) return;
      const label = duck.title && duck.title !== duck.name ? duck.name + ' the ' + duck.title : 'A ' + duck.name;
      return { text: label + ' appears next to ' + unit.name + '.' };
    },
  });

  WM.register({
    id: 'wm_plate', name: 'Spontaneous Plate Armor', icon: '🛡️', weight: 2, good: true, enemySafe: true,
    text: 'The surger gains {bigBlock} Block.',
    quip: 'Full plate, from nowhere, in your size. It even has cup holders.',
    apply: function (unit, ctx) { DD.Act.addBlock(unit, ctx.n.bigBlock); },
  });

  WM.register({
    id: 'wm_crowd', name: 'The Crowd Goes Wild', icon: '📣', weight: 2, good: true,
    text: 'The party gains {hype} Hype.',
    quip: 'An invisible studio audience cheers. Nobody asks where it came from.',
    canApply: function (unit) { return unit.side === 'hero' && act('gainHype'); },
    apply: function (unit, ctx) {
      if (fx('particles')) DD.FX.particles(unit, { kind: 'notes', count: 14 });
      DD.Act.gainHype(ctx.n.hype, 'wild magic');
    },
  });

  WM.register({
    id: 'wm_deja_vu', name: 'Déjà Vu', icon: '🔁', weight: 2, good: true, enemySafe: true,
    text: "The surger's skill cooldowns reset.",
    quip: 'Didn\'t this already happen? The DM swears it did not.',
    canApply: function (unit) {
      if (!act('resetCooldowns')) return false;
      const slots = (unit.skills || []).concat(unit.skillSlots || [], unit.basic ? [unit.basic] : []);
      return slots.some(function (s) { return s && s.cd > 0; });
    },
    apply: function (unit) {
      if (fx('particles')) DD.FX.particles(unit, { kind: 'runes', count: 12 });
      DD.Act.resetCooldowns(unit);
    },
  });

  WM.register({
    id: 'wm_smite', name: 'Smite (Wrong Address)', icon: '⚡', weight: 2, good: true, enemySafe: true,
    text: 'Lightning strikes a random enemy for {dmg} lightning damage. Water it stands in gets electrified too.',
    quip: 'That bolt was meant for a cleric three dungeons over. Finders keepers.',
    canApply: function (unit, ctx) { return ctx.foes().length > 0; },
    apply: function (unit, ctx) {
      const foe = ctx.pick(ctx.foes());
      if (!foe) return;
      if (fx('projectile')) DD.FX.projectile(skyAbove(ctx, foe), foe, { kind: 'bolt', color: '#bfe8ff', size: 2 });
      if (fx('sound')) DD.FX.sound('zap');
      const x = foe.x, y = foe.y;
      hit(unit, foe, ctx.n.dmg, 'lightning', ['lightning']);
      const t = ctx.tile(x, y);
      const wet = t && (DD.MapGen.terrainInfo(t.t).liquid === 'water' || (t.surface && t.surface.id === 'water'));
      if (wet && act('applyElement')) DD.Act.applyElement(x, y, 'lightning', unit);
      return { text: 'Lightning strikes ' + foe.name + ' for ' + ctx.n.dmg + ' lightning damage.' };
    },
  });

  WM.register({
    id: 'wm_brain_freeze', name: 'Brain Freeze', icon: '🧊', weight: 2, good: true,
    text: 'A random non-boss enemy is Frozen for 1 turn.',
    quip: 'It ate its ice cream too fast. Tragic. Useful.',
    canApply: function (unit, ctx) { return hasNonBossFoe(unit, ctx); },
    apply: function (unit, ctx) {
      const foe = randomNonBossFoe(unit, ctx);
      if (!foe) return;
      if (fx('particles')) DD.FX.particles(foe, { kind: 'ice', count: 14 });
      if (fx('sound')) DD.FX.sound('frost');
      status(foe, 'frozen', 1, 1, unit);
      return { text: foe.name + ' is Frozen for 1 turn.' };
    },
  });

  WM.register({
    id: 'wm_love_potion', name: 'Love Potion No. 9', icon: '💘', weight: 2, good: true,
    text: 'A random non-boss enemy is Charmed for 1 turn.',
    quip: 'It looks at you differently now. Please do not make this weird.',
    canApply: function (unit, ctx) { return hasNonBossFoe(unit, ctx); },
    apply: function (unit, ctx) {
      const foe = randomNonBossFoe(unit, ctx);
      if (!foe) return;
      if (fx('particles')) DD.FX.particles(foe, { kind: 'hearts', count: 14 });
      status(foe, 'charmed', 1, 1, unit);
      return { text: foe.name + ' is Charmed for 1 turn.' };
    },
  });

  WM.register({
    id: 'wm_hype_train', name: 'Hype Train', icon: '🚂', weight: 2, good: true, enemySafe: true,
    text: 'The surger and allies within 3 tiles gain Inspired (+25% damage) for 2 turns.',
    quip: 'All aboard! Next stop: Violence Junction.',
    apply: function (unit, ctx) {
      ctx.within(ctx.friends(), 3).forEach(function (u) { status(u, 'inspired', 2, 1, unit); });
    },
  });

  WM.register({
    id: 'wm_wholesome', name: 'Wholesome Aura', icon: '🌈', weight: 2, good: true, enemySafe: true,
    text: 'The surger and allies within 2 tiles gain Regen {regen} for 3 turns.',
    quip: 'Everyone suddenly remembers to drink water. Healing ensues.',
    apply: function (unit, ctx) {
      ctx.within(ctx.friends(), 2).forEach(function (u) { status(u, 'regen', 3, ctx.n.regen, unit); });
    },
  });

  WM.register({
    id: 'wm_invisibility', name: 'Accidental Invisibility', icon: '👻', weight: 1, good: true,
    text: 'The surger gains Stealth for 2 turns.',
    quip: 'They were here a second ago. They are still here. You just cannot see them.',
    canApply: function (unit) { return unit.side === 'hero'; },
    apply: function (unit) { status(unit, 'stealth', 2, 1, unit); },
  });

  WM.register({
    id: 'wm_crates', name: 'Crate Expectations', icon: '📦', weight: 2, good: true, enemySafe: true,
    text: 'Up to 3 crates appear around the surger. Instant cover.',
    quip: 'Every dungeon needs more crates. This is just science.',
    canApply: function (unit, ctx) { return act('placeObject') && ctx.freeTiles(unit.x, unit.y, 2).length > 1; },
    apply: function (unit, ctx) {
      const spots = ctx.freeTiles(unit.x, unit.y, 2).filter(function (p) { return p.x !== unit.x || p.y !== unit.y; });
      const picks = ctx.rng.sample ? ctx.rng.sample(spots, 3) : spots.slice(0, 3);
      picks.forEach(function (p) {
        DD.Act.placeObject(p.x, p.y, 'crate');
        if (fx('particles')) DD.FX.particles(p, { kind: 'dust', count: 8, parallel: true });
      });
      return { text: picks.length + ' crate' + (picks.length === 1 ? '' : 's') + ' appear around ' + unit.name + '.' };
    },
  });

  // =====================================================================================================
  // Chaos surges (good: null)
  // =====================================================================================================

  WM.register({
    id: 'wm_oops_fireball', name: 'Oops, All Fireball', icon: '🔥', weight: 3, good: null, enemySafe: true,
    text: 'A fireball lands within 3 tiles: {dmg} fire damage to every unit and object in radius 1, friend or foe, and the area ignites.',
    quip: 'The DM rolls on the wild magic table and starts giggling. Never a good sign.',
    canApply: function () { return act('damageTiles'); },
    apply: function (unit, ctx) {
      let center;
      const near = ctx.within(ctx.units(), 3);
      if (near.length && ctx.rng.chance(0.5)) center = ctx.pick(near);
      else {
        const spots = [];
        for (let dy = -3; dy <= 3; dy++) {
          for (let dx = -3; dx <= 3; dx++) {
            if (Math.abs(dx) + Math.abs(dy) > 3 || !ctx.tile(unit.x + dx, unit.y + dy)) continue;
            spots.push({ x: unit.x + dx, y: unit.y + dy });
          }
        }
        center = ctx.pick(spots) || unit;
      }
      const c = { x: center.x, y: center.y };
      if (fx('projectile')) DD.FX.projectile(unit, c, { kind: 'fireball', color: '#ff7a1a', arc: 1 });
      if (fx('explosion')) DD.FX.explosion(c, { radius: 1, color: '#ff8a1a' });
      if (fx('sound')) DD.FX.sound('explosion');
      const tiles = [];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (Math.abs(dx) + Math.abs(dy) <= 1 && ctx.tile(c.x + dx, c.y + dy)) tiles.push({ x: c.x + dx, y: c.y + dy });
        }
      }
      DD.Act.damageTiles(unit, tiles, ctx.n.dmg, { element: 'fire', filter: 'all', hitObjects: true, tags: ['wildmagic', 'fire', 'aoe'], cause: 'other' });
      if (act('applyElement')) tiles.forEach(function (p) { DD.Act.applyElement(p.x, p.y, 'fire', unit); });
    },
  });

  WM.register({
    id: 'wm_continental_drift', name: 'Continental Drift', icon: '🌍', weight: 2, good: null, enemySafe: true,
    text: 'Every unit is pushed 1 tile south (toward the bottom-left).',
    quip: 'The whole battlefield tilts. Somebody bumped the table.',
    canApply: function () { return act('push'); },
    apply: function (unit, ctx) {
      if (fx('shake')) DD.FX.shake(6, 350);
      // southernmost first, so nobody bumps into a neighbour that was about to move anyway
      ctx.units().sort(function (a, b) { return b.y - a.y || a.x - b.x; }).forEach(function (u) {
        if (active(u)) DD.Act.push(unit, u, SOUTH, 1, {});
      });
    },
  });

  WM.register({
    id: 'wm_group_hug', name: 'Group Hug (Mandatory)', icon: '🤗', weight: 2, good: null, enemySafe: true,
    text: 'Every unit heals {heal} HP. Yes, the enemies too.',
    quip: 'Everyone stops fighting for one awkward, sincere moment. Then it is over.',
    apply: function (unit, ctx) {
      if (fx('particles')) DD.FX.particles(unit, { kind: 'hearts', count: 20 });
      ctx.units().forEach(function (u) { heal(unit, u, ctx.n.heal); });
    },
  });

  WM.register({
    id: 'wm_musical_chairs', name: 'Musical Chairs', icon: '🪑', weight: 2, good: null, enemySafe: true,
    text: 'The surger swaps places with a random other unit.',
    quip: 'The music stops. Everybody panics. Two people end up somewhere new.',
    canApply: function (unit, ctx) {
      return act('swap') && !immovable(unit) && ctx.others().some(function (u) { return !immovable(u); });
    },
    apply: function (unit, ctx) {
      const other = ctx.pick(ctx.others().filter(function (u) { return !immovable(u); }));
      if (!other) return;
      DD.Act.swap(unit, other);
      return { text: unit.name + ' swaps places with ' + other.name + '.' };
    },
  });

  WM.register({
    id: 'wm_blink', name: 'Blink (Directionally Challenged)', icon: '🌀', weight: 2, good: null, enemySafe: true,
    text: 'The surger teleports to a random free tile within 4.',
    quip: 'They meant to go somewhere specific. They did not go there.',
    canApply: function (unit, ctx) { return act('teleport') && !immovable(unit) && ctx.freeTiles(unit.x, unit.y, 4).length > 1; },
    apply: function (unit, ctx) {
      const spot = ctx.pick(ctx.freeTiles(unit.x, unit.y, 4).filter(function (p) { return p.x !== unit.x || p.y !== unit.y; }));
      if (spot) DD.Act.teleport(unit, spot.x, spot.y, {});
    },
  });

  WM.register({
    id: 'wm_weather', name: 'Localized Weather Event', icon: '🌧️', weight: 2, good: null, enemySafe: true,
    text: 'Rain falls within 2 tiles of the surger: units there lose Burn and become Wet; fires go out.',
    quip: 'A small, personal raincloud. It follows nobody. It judges everybody.',
    apply: function (unit, ctx) {
      if (fx('particles')) DD.FX.particles(skyAbove(ctx, unit), { kind: 'bubbles', color: '#8ec9ff', count: 26 });
      if (fx('sound')) DD.FX.sound('splash');
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (Math.abs(dx) + Math.abs(dy) > 2) continue;
          const x = unit.x + dx, y = unit.y + dy, t = ctx.tile(x, y);
          if (t && t.surface && (t.surface.id === 'fire' || t.surface.id === 'smoke') && act('applyElement')) DD.Act.applyElement(x, y, 'water', unit);
        }
      }
      ctx.within(ctx.units(), 2).forEach(function (u) {
        if (act('removeStatus') && act('hasStatus') && DD.Act.hasStatus(u, 'burn')) DD.Act.removeStatus(u, 'burn');
        status(u, 'wet', 2, 1, unit);
      });
    },
  });

  WM.register({
    id: 'wm_grease', name: 'Grease Fire Hazard', icon: '🛢️', weight: 1, good: null, enemySafe: true,
    text: 'Oil spills on and around the surger (radius 1). Keep away from open flames.',
    quip: 'Someone casts Grease. Nobody admits to it.',
    canApply: function () { return act('setSurface'); },
    apply: function (unit, ctx) {
      [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
        const t = ctx.tile(unit.x + d[0], unit.y + d[1]);
        if (!t || !DD.MapGen.isWalkableTile(t) || DD.MapGen.terrainInfo(t.t).liquid) return;
        DD.Act.setSurface(t.x, t.y, 'oil', 3);
      });
    },
  });

  WM.register({
    id: 'wm_magnet', name: 'Magnetic Personality', icon: '🧲', weight: 2, good: null, enemySafe: true,
    text: 'Every enemy within 4 tiles is pulled 1 tile toward the surger.',
    quip: 'They are drawn to you. Physically. Against their will. Relatable.',
    canApply: function (unit, ctx) {
      return act('pull') && ctx.within(ctx.foes(), 4).some(function (u) { return dist(u, unit) > 1 && !immovable(u); });
    },
    apply: function (unit, ctx) {
      ctx.within(ctx.foes(), 4).filter(function (u) { return dist(u, unit) > 1; })
        .sort(function (a, b) { return dist(a, unit) - dist(b, unit); })
        .forEach(function (u) { if (active(u)) DD.Act.pull(unit, u, { x: unit.x, y: unit.y }, 1, {}); });
    },
  });

  WM.register({
    id: 'wm_barrel_roll', name: 'Do a Barrel Roll', icon: '🛢️', weight: 2, good: null, enemySafe: true,
    text: 'Explosive barrels appear next to up to 2 random enemies.',
    quip: 'Where did these come from? Who cares. Somebody light a match.',
    canApply: function (unit, ctx) {
      return act('placeObject') && ctx.foes().some(function (u) { return ctx.freeTiles(u.x, u.y, 1).length > 0; });
    },
    apply: function (unit, ctx) {
      const targets = ctx.foes().filter(function (u) { return ctx.freeTiles(u.x, u.y, 1).length > 0; });
      const picks = ctx.rng.sample ? ctx.rng.sample(targets, 2) : targets.slice(0, 2);
      let placed = 0;
      picks.forEach(function (u) {
        const spot = ctx.freeTiles(u.x, u.y, 1).filter(function (p) { return p.x !== u.x || p.y !== u.y; })[0];
        if (!spot) return;
        DD.Act.placeObject(spot.x, spot.y, 'barrel_explosive');
        if (fx('particles')) DD.FX.particles(spot, { kind: 'dust', count: 8, parallel: true });
        placed++;
      });
      return { text: placed + ' explosive barrel' + (placed === 1 ? '' : 's') + ' appear next to the enemies.' };
    },
  });

  // =====================================================================================================
  // Backfires (good: false)
  // =====================================================================================================

  WM.register({
    id: 'wm_baackfire', name: 'Baa-ckfire', icon: '🐏', weight: 2, good: false,
    text: 'The surger turns into a Sheep for 1 turn.',
    quip: 'Baa. (The DM is crying with laughter. Please wait.)',
    canApply: function (unit) { return !isBoss(unit); },
    apply: function (unit) {
      if (fx('particles')) DD.FX.particles(unit, { kind: 'smoke', count: 14 });
      status(unit, 'sheep', 1, 1, null);
    },
  });

  WM.register({
    id: 'wm_wardrobe', name: 'Wardrobe Malfunction', icon: '🩲', weight: 2, good: false, enemySafe: true,
    text: 'The surger becomes Vulnerable (+25% damage taken) for 2 turns.',
    quip: 'The armor teleports away. The underwear, regrettably, stays.',
    apply: function (unit) { status(unit, 'vulnerable', 2, 1, null); },
  });

  WM.register({
    id: 'wm_surcharge', name: 'Wild Magic Surcharge', icon: '🧾', weight: 2, good: false,
    text: 'The party loses {fee} gold.',
    quip: 'An imp in a visor hands you an invoice. Chaos is not covered by your insurance.',
    canApply: function (unit) { return unit.side === 'hero' && act('loseGold') && (!act('gold') || DD.Act.gold() > 0); },
    apply: function (unit, ctx) {
      const lost = DD.Act.loseGold(ctx.n.fee);
      return { text: 'The party loses ' + (typeof lost === 'number' ? lost : ctx.n.fee) + ' gold.' };
    },
  });

  WM.register({
    id: 'wm_butterfingers', name: 'Butterfingers', icon: '🧈', weight: 2, good: false, enemySafe: true,
    text: 'The surger becomes Weak (−25% damage) for 2 turns.',
    quip: 'Their hands are now, inexplicably, made of butter.',
    apply: function (unit) { status(unit, 'weak', 2, 1, null); },
  });

  // =====================================================================================================
  // Surge-only units: the Confused Duck (hero side) and its hostile cousin (enemy side)
  // =====================================================================================================

  function duckHead(eyes, hat) {
    return { size: 1.1, ears: 'none', horns: 'none', hair: 'none', beard: 'none', hat: hat, face: 'none', eyes: eyes, mouth: 'none' };
  }
  // overlay painters: a floating "?" (confused) / "!" (furious) just above the head
  function questionMark(g) { if (g && typeof g.text === 'function') g.text('?', 6, -24, 12, '#fff3a0'); }
  function angerMark(g) { if (g && typeof g.text === 'function') g.text('!', 6, -24, 12, '#ff5a4a'); }

  // a yellow rubber duck (bird painter: body = skin, beak/feet = beak)
  const DUCK_PALETTE = { skin: '#ffd84a', cloth: '#ffd84a', cloth2: '#ff8a1f', hair: '#e8b92e', metal: '#f2a541',
    eye: '#14110c', beak: '#ff8a1f', accent: '#ff8a1f', outline: '#2a1e0e' };
  // its grey, goose-adjacent cousin in a red bandana
  const FOE_DUCK_PALETTE = { skin: '#8d857a', cloth: '#8d857a', cloth2: '#c0392b', hair: '#5f574d', metal: '#b0a69a',
    eye: '#14110c', beak: '#ff7a1a', accent: '#c0392b', outline: '#1d1a14' };

  DD.registerSkill({
    id: 'wm_duck_honk', name: 'Honk of Confusion', owner: 'summon', icon: '🦆', kind: 'attack', tags: ['melee'],
    ap: 1, cooldown: 0,
    levels: [{ dmg: 3 }],
    target: { type: 'unit', range: [1, 1], los: false, filter: 'enemy' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to an adjacent enemy and apply Confused for 1 turn.'; },
    flavor: 'Nobody knows what it is saying. Everybody knows it is rude.',
    execute: function (ctx) {
      const t = ctx.targetUnit || (ctx.foes && ctx.foes[0]) || null;
      if (!t || t.dead) return;
      if (fx('lunge')) DD.FX.lunge(ctx.user, t);
      if (fx('sound')) DD.FX.sound('bark');
      DD.Act.damage(ctx.user, t, ctx.L.dmg, { skill: ctx.skill, tags: ['melee'] });
      if (!t.dead) DD.Act.addStatus(t, 'confused', { turns: 1 }, ctx.user);
    },
  });

  DD.registerSkill({
    id: 'wm_duck_peck', name: 'Indignant Peck', owner: 'enemy', icon: '🦆', kind: 'attack', tags: ['melee'],
    ap: 0, cooldown: 0, anchor: 'self',
    levels: [{ dmg: 3 }],
    target: { type: 'unit', range: [1, 1], los: false, filter: 'enemy' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to an adjacent target.'; },
    flavor: 'It wants bread. You do not have bread. This is your fault.',
    execute: function (ctx) {
      const foes = (ctx.foes || []).filter(function (f) { return f && !f.dead; });
      if (foes.length && fx('lunge')) DD.FX.lunge(ctx.user, foes[0]);
      foes.forEach(function (f) { if (!f.dead) DD.Act.damage(ctx.user, f, ctx.L.dmg, { skill: ctx.skill, tags: ['melee'] }); });
    },
  });

  DD.registerSummon({
    id: 'wm_duck', name: 'Confused Duck', hp: 8, mov: 4, ap: 2, armor: 0,
    tags: ['beast', 'wildmagic'], flags: {}, resist: {},
    sprite: {
      base: 'flyer', scale: 0.6, palette: DUCK_PALETTE, shape: { body: 'bird' }, head: duckHead('big', 'none'),
      wings: 'bird', tail: 'none', mainhand: 'none', offhand: 'none', bling: [], extras: [], aura: null,
      overlay: questionMark,
    },
    skills: ['wm_duck_honk'],
    names: ['Duck Norris', 'Sir Quacksalot', 'Gerald', 'Bread Thief', 'The Admiral', 'Quackers', 'Mallard Fillmore'],
    barks: {
      spawn: ['Quack?', '...quack?', 'QUACK.'],
      attack: ['HONK!', 'Quack quack QUACK.', '*aggressive waddling*'],
      hurt: ['QUACK!', 'Wak!', 'Quack?!'],
      death: ['...quack.', 'Quack (final).'],
    },
    desc: 'A duck from nowhere. It has questions. It will not be taking yours.',
  });

  DD.registerEnemy({
    id: 'wm_duck_foe', name: 'Hostile Duck', act: 1, tier: 'minion', hp: 8, mov: 3, armor: 0,
    tags: ['beast', 'wildmagic'], flags: {}, resist: {},
    sprite: {
      base: 'flyer', scale: 0.6, palette: FOE_DUCK_PALETTE,
      shape: { body: 'bird' }, head: duckHead('angry', 'bandana'),
      wings: 'bird', tail: 'none', mainhand: 'none', offhand: 'none', bling: [], extras: [], aura: null,
      overlay: angerMark,
    },
    skills: ['wm_duck_peck'],
    ai: { style: 'melee' },
    xp: 1, gold: [0, 1],
    barks: {
      spawn: ['QUACK.', 'Quack. (menacing)'],
      attack: ['HONK!', 'Bread. Now.', '*furious flapping*'],
      hurt: ['QUACK!', 'Wak!'],
      death: ['...quack.', 'Tell my ducklings...'],
    },
    desc: 'Summoned by a wild surge on the wrong side. It is not confused. It is angry.',
    boss: null,
  });
})();
