/* Dungeons and Degenerates — js/core/fx_core.js
 * Visual-event queue ("FX"). Game logic resolves instantly and pushes FX events in logical order;
 * the renderer plays them back over time (handlers registered by js/render/fx_render.js).
 * The HUD must not accept combat input while DD.FX.busy().
 *
 * Every unit has a visual state `unit.vis` ({x,y,h,hp,block,alpha,dead,downed,hidden,flash,offX,offY,scale})
 * that the renderer draws from. FX events move `vis` toward the logical state as they play; when an event
 * finishes (or in instant/headless mode) its "end state" is applied, so logic and visuals always converge.
 *
 * Event fields common to all: { type, parallel?, ms? }  — parallel:true starts together with the previous event.
 * Positions are captured at push time as {x, y, h} (grid coords + elevation).
 */
(function () {
  'use strict';
  const DD = window.DD;

  const DEFAULT_MS = {
    move: 0, slide: 170, jump: 340, teleport: 280, lunge: 170,
    projectile: 260, beam: 330, explosion: 380, particles: 0,
    damage: 230, heal: 200, block: 120, status: 140, text: 70, bark: 0,
    death: 420, downed: 360, revive: 300, spawn: 300,
    shake: 0, banner: 950, flash: 0, wait: 300, call: 0, tile: 0, sound: 0, custom: 300,
    // v2 markers (no animation of their own; renderer / HUD handlers may give them one): whose turn is playing,
    // the initiative roll, a boss wind-up starting
    turn: 0, initiative: 0, windup: 0,
  };
  const MOVE_MS_PER_TILE = 115;

  let seq = 0;
  const idleCbs = [];

  const FX = (DD.FX = {
    queue: [],        // pending events
    active: [],       // currently playing group
    handlers: {},     // type -> { start(evt), update(evt, t01, dtMs), end(evt) } (all optional)
    instant: false,   // true => no animation; end states applied immediately (headless tests, "skip animations")
    speed: 1,         // playback speed multiplier
    resolveUnit: null, // optional fn(id) -> unit; default looks in DD.Combat.state.units
    shownTurn: null,  // { unitId, round } of the turn playback has reached (v2 'turn' markers; instant: the current one)
  });

  // ---- helpers ---------------------------------------------------------------
  function findUnit(id) {
    if (FX.resolveUnit) return FX.resolveUnit(id);
    const st = DD.Combat && DD.Combat.state;
    if (!st || !st.units) return null;
    for (let i = 0; i < st.units.length; i++) if (st.units[i].id === id) return st.units[i];
    return null;
  }
  FX.findUnit = findUnit;

  function tileH(x, y) {
    try {
      if (DD.Grid && DD.Grid.tile) {
        const t = DD.Grid.tile(Math.round(x), Math.round(y));
        if (t) return t.h || 0;
      }
    } catch (e) { /* ignore */ }
    return 0;
  }
  FX.tileH = tileH;

  /** Capture a position {x,y,h} from a Unit or a {x,y[,h]} point. */
  function posOf(p) {
    if (!p) return null;
    return { x: p.x, y: p.y, h: p.h !== undefined && p.id === undefined ? p.h : tileH(p.x, p.y) };
  }
  FX.posOf = posOf;

  /** Create/refresh a unit's visual state from its logical state. hidden:true => invisible until FX.spawn plays. */
  FX.initVis = function (unit, opts) {
    opts = opts || {};
    unit.vis = {
      x: unit.x, y: unit.y, h: tileH(unit.x, unit.y),
      hp: unit.hp, block: unit.block || 0,
      alpha: opts.hidden ? 0 : 1, hidden: !!opts.hidden,
      dead: !!unit.dead, downed: !!unit.downed,
      flash: 0, offX: 0, offY: 0, scale: 1,
    };
    return unit.vis;
  };

  /** Snap a unit's visual state to its logical state (used when idle as a safety net). */
  FX.syncVis = function (unit) {
    if (!unit.vis) { FX.initVis(unit); return; }
    const v = unit.vis;
    v.x = unit.x; v.y = unit.y; v.h = tileH(unit.x, unit.y);
    v.hp = unit.hp; v.block = unit.block || 0;
    v.downed = !!unit.downed;
    if (unit.dead) { v.dead = true; v.alpha = 0; }
    else if (!v.hidden) { v.alpha = 1; }
    v.offX = 0; v.offY = 0;
  };
  FX.syncAll = function (units) { for (let i = 0; i < units.length; i++) FX.syncVis(units[i]); };

  /** Apply the final visual state of an event (both for normal playback end and instant mode). */
  function applyEnd(evt) {
    const u = evt.unit || (evt.unitId ? findUnit(evt.unitId) : null);
    const v = u ? (u.vis || FX.initVis(u)) : null;
    switch (evt.type) {
      case 'move': {
        const last = evt.path && evt.path[evt.path.length - 1];
        if (v && last) { v.x = last.x; v.y = last.y; v.h = last.h; }
        break;
      }
      case 'slide': case 'jump': case 'teleport':
        if (v && evt.to) { v.x = evt.to.x; v.y = evt.to.y; v.h = evt.to.h; v.alpha = v.hidden ? 0 : 1; }
        break;
      case 'lunge':
        if (v) { v.offX = 0; v.offY = 0; }
        break;
      case 'damage': case 'heal':
        if (v) { v.hp = evt.hp; if (evt.block !== undefined) v.block = evt.block; v.flash = 0; }
        break;
      case 'block':
        if (v) v.block = evt.block;
        break;
      case 'death':
        if (v) { v.dead = true; v.alpha = 0; }
        break;
      case 'downed':
        if (v) { v.downed = true; v.hp = 0; }
        break;
      case 'revive':
        if (v) { v.downed = false; v.hp = evt.hp; v.alpha = 1; }
        break;
      case 'spawn':
        if (v) { v.hidden = false; v.alpha = 1; v.x = evt.at ? evt.at.x : v.x; v.y = evt.at ? evt.at.y : v.y; v.h = evt.at ? evt.at.h : v.h; }
        break;
      case 'call':
        if (!evt._called) { evt._called = true; DD.safe('FX.call', evt.fn); }
        break;
      case 'turn':
        FX.shownTurn = { unitId: evt.unitId, round: evt.round || 0 };
        break;
      default:
        break;
    }
  }
  FX.applyEnd = applyEnd;

  // ---- queue -------------------------------------------------------------------
  FX.register = function (type, handler) { FX.handlers[type] = handler; };

  FX.push = function (evt) {
    if (!evt || !evt.type) return evt;
    evt.id = ++seq;
    // a missing or broken duration (NaN, ±Infinity, negative, not a number) gets the type's default: one bad event
    // from content would otherwise play forever and lock combat input (the renderer's watchdog is the last resort)
    const ms = evt.ms === undefined || evt.ms === null || typeof evt.ms === 'boolean' ? NaN : Number(evt.ms);
    if (isFinite(ms) && ms >= 0) evt.ms = ms;
    else {
      evt.ms = evt.type === 'move' ? MOVE_MS_PER_TILE * Math.max(1, (evt.path || []).length) :
        (DEFAULT_MS[evt.type] !== undefined ? DEFAULT_MS[evt.type] : 250);
    }
    if (FX.instant) { applyEnd(evt); return evt; }
    FX.queue.push(evt);
    return evt;
  };

  FX.busy = function () { return FX.queue.length > 0 || FX.active.length > 0; };

  /** Run cb when the queue is empty (immediately if already idle). */
  FX.onIdle = function (cb) {
    if (!FX.busy()) { DD.safe('FX.onIdle', cb); return; }
    idleCbs.push(cb);
  };

  function startEvt(evt) {
    evt.elapsed = 0;
    if (evt.type === 'call') applyEnd(evt);
    const h = FX.handlers[evt.type];
    if (h && h.start) DD.safe('FX start ' + evt.type, h.start, h, [evt]);
  }
  function endEvt(evt) {
    const h = FX.handlers[evt.type];
    if (h && h.end) DD.safe('FX end ' + evt.type, h.end, h, [evt]);
    applyEnd(evt);
  }

  /** Advance playback by dtMs (called by the renderer every frame). */
  FX.update = function (dtMs) {
    const speed = FX.speed > 0 ? FX.speed : 1;
    let guard = 0;
    while (guard++ < 500) {
      if (!FX.active.length) {
        if (!FX.queue.length) break;
        // start the next group: head + following parallel events
        FX.active.push(FX.queue.shift());
        while (FX.queue.length && FX.queue[0].parallel) FX.active.push(FX.queue.shift());
        for (let i = 0; i < FX.active.length; i++) startEvt(FX.active[i]);
      }
      let allDone = true;
      for (let i = 0; i < FX.active.length; i++) {
        const evt = FX.active[i];
        if (evt.done) continue;
        evt.elapsed += dtMs * speed;
        const dur = Math.max(0, evt.ms);
        const t = dur <= 0 ? 1 : Math.min(1, evt.elapsed / dur);
        const h = FX.handlers[evt.type];
        if (h && h.update) DD.safe('FX update ' + evt.type, h.update, h, [evt, t, dtMs * speed]);
        if (t >= 1) { evt.done = true; endEvt(evt); } else allDone = false;
      }
      if (!allDone) break;
      FX.active.length = 0;
      dtMs = 0; // zero-duration events chain within the same frame
    }
    if (!FX.busy() && idleCbs.length) {
      const cbs = idleCbs.splice(0, idleCbs.length);
      for (let i = 0; i < cbs.length; i++) DD.safe('FX.onIdle', cbs[i]);
    }
  };

  /** Finish everything immediately (applies end states and runs pending calls in order). */
  FX.flush = function () {
    let guard = 0;
    while (FX.busy() && guard++ < 100000) {
      for (let i = 0; i < FX.active.length; i++) if (!FX.active[i].done) { FX.active[i].done = true; endEvt(FX.active[i]); }
      FX.active.length = 0;
      if (FX.queue.length) { const e = FX.queue.shift(); startEvt(e); e.done = true; endEvt(e); }
    }
    if (idleCbs.length) {
      const cbs = idleCbs.splice(0, idleCbs.length);
      for (let i = 0; i < cbs.length; i++) DD.safe('FX.onIdle', cbs[i]);
    }
  };

  /** Drop everything without applying (used when leaving combat). */
  FX.reset = function () { FX.queue.length = 0; FX.active.length = 0; idleCbs.length = 0; FX.shownTurn = null; };

  // ---- wrappers (preferred API for engine + content) ---------------------------------
  function o(opts) { return opts || {}; }
  function uid(u) { return u && u.id !== undefined ? u.id : u; }
  function uref(u) { return u && typeof u === 'object' ? u : undefined; }

  /** Walk along path (array of {x,y}, excluding the start tile). */
  FX.move = function (unit, path, opts) {
    return FX.push(Object.assign({ type: 'move', unitId: uid(unit), unit: uref(unit), path: (path || []).map(posOf) }, o(opts)));
  };
  /** Straight slide (push/pull). */
  FX.slide = function (unit, from, to, opts) {
    return FX.push(Object.assign({ type: 'slide', unitId: uid(unit), unit: uref(unit), from: posOf(from), to: posOf(to) }, o(opts)));
  };
  /** Arcing leap. */
  FX.jump = function (unit, from, to, opts) {
    return FX.push(Object.assign({ type: 'jump', unitId: uid(unit), unit: uref(unit), from: posOf(from), to: posOf(to) }, o(opts)));
  };
  /** Fade out + fade in elsewhere. */
  FX.teleport = function (unit, from, to, opts) {
    return FX.push(Object.assign({ type: 'teleport', unitId: uid(unit), unit: uref(unit), from: posOf(from), to: posOf(to) }, o(opts)));
  };
  /** Small attack lunge toward a point. */
  FX.lunge = function (unit, toward, opts) {
    return FX.push(Object.assign({ type: 'lunge', unitId: uid(unit), unit: uref(unit), to: posOf(toward) }, o(opts)));
  };
  /** kind: 'arrow'|'bolt'|'fireball'|'orb'|'rock'|'flask'|'coin'|'note'|'dagger'|'feather'|'bone'|'custom'. opts: color, arc, size, trail */
  FX.projectile = function (from, to, opts) {
    return FX.push(Object.assign({ type: 'projectile', from: posOf(from), to: posOf(to), kind: 'bolt', color: '#ffffff' }, o(opts)));
  };
  /** Straight beam/laser. opts: color, width */
  FX.beam = function (from, to, opts) {
    return FX.push(Object.assign({ type: 'beam', from: posOf(from), to: posOf(to), color: '#ff4444', width: 6 }, o(opts)));
  };
  /** Expanding blast. opts: radius (tiles), color */
  FX.explosion = function (at, opts) {
    return FX.push(Object.assign({ type: 'explosion', at: posOf(at), radius: 1, color: '#ff8a1a' }, o(opts)));
  };
  /** Non-blocking particle burst. kind: 'sparks'|'smoke'|'blood'|'coins'|'hearts'|'glitter'|'leaves'|'bubbles'|'notes'|'runes'|'feathers'|'dust'|'fire'|'ice'|'poison'|'zap'. */
  FX.particles = function (at, opts) {
    return FX.push(Object.assign({ type: 'particles', at: posOf(at), kind: 'sparks', color: null, count: 12 }, o(opts)));
  };
  /** Damage number + flash; captures the unit's hp/block after the hit. opts: element, crit, blocked */
  FX.damage = function (unit, amount, opts) {
    return FX.push(Object.assign({ type: 'damage', unitId: unit.id, unit: unit, amount: amount, hp: unit.hp, block: unit.block || 0 }, o(opts)));
  };
  FX.heal = function (unit, amount, opts) {
    return FX.push(Object.assign({ type: 'heal', unitId: unit.id, unit: unit, amount: amount, hp: unit.hp, block: unit.block || 0 }, o(opts)));
  };
  FX.block = function (unit, amount, opts) {
    return FX.push(Object.assign({ type: 'block', unitId: unit.id, unit: unit, amount: amount, block: unit.block || 0 }, o(opts)));
  };
  /** Status applied/removed popup. */
  FX.status = function (unit, statusId, text, opts) {
    return FX.push(Object.assign({ type: 'status', unitId: unit.id, unit: unit, statusId: statusId, text: text || '' }, o(opts)));
  };
  /** Floating text at a unit or tile. opts: color, size */
  FX.text = function (at, text, opts) {
    const evt = { type: 'text', text: String(text), color: '#ffffff', size: 16 };
    if (at && at.id !== undefined) { evt.unitId = at.id; evt.unit = at; evt.at = posOf(at); } else evt.at = posOf(at);
    return FX.push(Object.assign(evt, o(opts)));
  };
  /** Speech bubble (non-blocking). opts: dur (ms on screen) */
  FX.bark = function (unit, text, opts) {
    if (!text) return null;
    return FX.push(Object.assign({ type: 'bark', unitId: unit.id, unit: unit, text: String(text), dur: 2400 }, o(opts)));
  };
  FX.death = function (unit, opts) { return FX.push(Object.assign({ type: 'death', unitId: unit.id, unit: unit }, o(opts))); };
  FX.downed = function (unit, opts) { return FX.push(Object.assign({ type: 'downed', unitId: unit.id, unit: unit }, o(opts))); };
  FX.revive = function (unit, opts) { return FX.push(Object.assign({ type: 'revive', unitId: unit.id, unit: unit, hp: unit.hp }, o(opts))); };
  FX.spawn = function (unit, opts) { return FX.push(Object.assign({ type: 'spawn', unitId: unit.id, unit: unit, at: posOf(unit) }, o(opts))); };
  /** Non-blocking screen shake. */
  FX.shake = function (intensity, ms, opts) {
    return FX.push(Object.assign({ type: 'shake', intensity: intensity || 6, dur: ms || 300, ms: 0 }, o(opts)));
  };
  /** Big centered banner text (blocking). opts: sub, color, ms */
  FX.banner = function (text, opts) {
    return FX.push(Object.assign({ type: 'banner', text: String(text), sub: '', color: '#ffd76a' }, o(opts)));
  };
  /** Full-screen color flash (non-blocking). */
  FX.flash = function (color, ms, opts) {
    return FX.push(Object.assign({ type: 'flash', color: color || '#ffffff', dur: ms || 200, ms: 0 }, o(opts)));
  };
  /** v2: marks the start of a unit's turn in the playback (FX.shownTurn follows it). opts: round */
  FX.turn = function (unit, opts) {
    return FX.push(Object.assign({ type: 'turn', unitId: uid(unit), unit: uref(unit), round: 0 }, o(opts)));
  };
  FX.wait = function (ms, opts) { return FX.push(Object.assign({ type: 'wait', ms: ms || 300 }, o(opts))); };
  /** Run fn when playback reaches this point (also runs in instant mode). Keep fn visual-only. */
  FX.call = function (fn, opts) { return FX.push(Object.assign({ type: 'call', fn: fn }, o(opts))); };
  /** Pulse/highlight a tile (non-blocking). kind: 'pulse'|'crack'|'splash'|'glow' */
  FX.tile = function (x, y, kind, opts) {
    return FX.push(Object.assign({ type: 'tile', at: posOf({ x: x, y: y }), kind: kind || 'pulse' }, o(opts)));
  };
  /** Play a sound effect when reached (non-blocking). */
  FX.sound = function (name, opts) { return FX.push(Object.assign({ type: 'sound', name: name }, o(opts))); };
  /** Arbitrary event type for custom renderer handlers (falls back to a timed no-op). */
  FX.custom = function (type, data) { return FX.push(Object.assign({ type: type }, data || {})); };
})();
