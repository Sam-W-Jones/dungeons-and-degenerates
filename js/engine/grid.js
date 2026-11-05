/* Dungeons and Degenerates — js/engine/grid.js
 * DD.Grid: map queries on DD.Combat.state.grid (ARCHITECTURE §5.1, §6.2, §6.3, §5.2 shapes).
 * Walkability, height rules (climb 1 / hop 2 / flying any), Dijkstra movement with terrain cost,
 * pass-through-friends and hazard marking, supercover line of sight, area shapes. v2: opts.aoo paths (move actions)
 * provoke as few attacks of opportunity as possible and report who they provoke.
 */
(function () {
  'use strict';
  const DD = window.DD;
  const U = DD.util;

  const FALLBACK_TERRAIN = { id: 'stone', name: 'Floor', walkable: true, cost: 1, blocksLos: false, pit: false, liquid: null, tall: 0 };
  const DIRS = U.DIRS;

  function state() { return DD.Combat && DD.Combat.state; }
  function grid() { const s = state(); return s && s.grid; }

  const Grid = (DD.Grid = {});

  // ---- basic queries ------------------------------------------------------------------------
  Grid.inBounds = function (x, y) {
    const g = grid();
    return !!g && (x | 0) === x && (y | 0) === y && x >= 0 && y >= 0 && x < g.w && y < g.h;
  };
  Grid.tile = function (x, y) {
    const g = grid();
    if (!g || (x | 0) !== x || (y | 0) !== y || x < 0 || y < 0 || x >= g.w || y >= g.h) return null;
    return g.tiles[y * g.w + x] || null;
  };
  Grid.key = function (x, y) { return x + ',' + y; };
  Grid.allTiles = function () { const g = grid(); return g ? g.tiles : []; };
  Grid.dist = function (a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); };
  Grid.dirTo = function (a, b) { return U.dirTo(a, b); };
  Grid.neighbors = function (x, y) {
    const out = [];
    for (let i = 0; i < 4; i++) { const t = Grid.tile(x + DIRS[i].x, y + DIRS[i].y); if (t) out.push(t); }
    return out;
  };

  // A walker passing through a friend shares its tile for a moment; while something resolves on it there (an attack of
  // opportunity on the walker, or a query about it standing on a tile it has not reached yet) it is the unit on top.
  let onTop = null;
  /** Living unit on a tile (downed heroes count, dead units don't; the unit on top first, see Grid.onTop). */
  Grid.unitAt = function (x, y) {
    const s = state();
    if (!s || !s.units) return null;
    if (onTop && !onTop.dead && onTop.x === x && onTop.y === y && s.units.indexOf(onTop) >= 0) return onTop;
    for (let i = 0; i < s.units.length; i++) {
      const u = s.units[i];
      if (!u.dead && u.x === x && u.y === y) return u;
    }
    return null;
  };
  /** Run fn with unit "on top" of its tile: Grid.unitAt there returns it even when a friend shares the tile. */
  Grid.onTop = function (unit, fn) {
    const prev = onTop;
    onTop = unit || null;
    try { return fn(); } finally { onTop = prev; }
  };

  Grid.terrain = function (tile) {
    if (!tile) return FALLBACK_TERRAIN;
    return DD.getTerrain(tile.t) || FALLBACK_TERRAIN;
  };
  Grid.objDef = function (obj) { return obj ? DD.getObject(obj.id) : null; };
  Grid.surfaceDef = function (tile) { return tile && tile.surface ? DD.getSurface(tile.surface.id) : null; };

  function objBlocksMove(obj) {
    if (obj.blocksMove !== undefined) return !!obj.blocksMove;
    const d = DD.getObject(obj.id);
    return d ? d.blocksMove !== false : true;
  }
  function objBlocksLos(obj) {
    if (obj.blocksLos !== undefined) return !!obj.blocksLos;
    const d = DD.getObject(obj.id);
    return !!(d && d.blocksLos);
  }
  Grid.objBlocksMove = function (obj) { return !!obj && objBlocksMove(obj); };
  Grid.objBlocksLos = function (obj) { return !!obj && objBlocksLos(obj); };

  /**
   * Flying: flags.flying (its def, an item, a Blessing) or a status whose def says `flying: true | (st, unit) => bool`.
   * Flyers ignore height, pits, liquids, terrain cost and everything on the floor (see feelsFloor).
   */
  function isFlying(unit) {
    if (!unit) return false;
    if (unit.flags && unit.flags.flying) return true;
    const list = unit.statuses;
    if (!list || !list.length) return false;
    for (let i = 0; i < list.length; i++) {
      const sd = DD.getStatus(list[i].id);
      if (!sd || !sd.flying) continue;
      if (typeof sd.flying !== 'function' || DD.safe('status ' + sd.id + ' flying', sd.flying, sd, [list[i], unit])) return true;
    }
    return false;
  }
  Grid.isFlying = isFlying;
  /**
   * The floor touches this unit (it is not flying). v2 (user request): flyers ignore EVERYTHING on the floor, good and
   * bad — terrain effects, surfaces (except airborne clouds: steam, smoke, gases), ground objects and traps, plates,
   * standing-in ticks, floor element reactions. Content that implements a floor effect itself checks this.
   */
  Grid.feelsFloor = function (unit) { return !!unit && !isFlying(unit); };
  /**
   * This surface (def, id, a tile's instance `tile.surface`, or the tile itself) touches the unit: an airborne cloud
   * touches everyone, the rest only walkers.
   */
  Grid.feelsSurface = function (unit, surface) {
    if (!unit) return false;
    let sd = surface;
    if (typeof surface === 'string') sd = DD.getSurface(surface);
    else if (surface && surface.surface !== undefined && surface.x !== undefined) sd = surface.surface ? DD.getSurface(surface.surface.id) : null;
    // [v2 review] an instance ({ id, turns, data }) carries no `airborne`: read its def
    else if (surface && surface.id && surface.airborne === undefined) sd = DD.getSurface(surface.id) || surface;
    if (sd && sd.airborne) return true;
    return !isFlying(unit);
  };

  Grid.isPit = function (x, y) { const t = Grid.tile(x, y); return !!t && !!Grid.terrain(t).pit; };
  /** Pit or deep water: ground units that end up here fall / sink (§6.6). */
  Grid.isDrop = function (x, y) {
    const t = Grid.tile(x, y);
    if (!t) return false;
    const td = Grid.terrain(t);
    return !!td.pit || (td.liquid === 'deep' && !td.walkable);
  };

  /** Tile blocks line of sight by its terrain, object or surface (height is handled in los()). */
  Grid.blocksLos = function (x, y) {
    const t = Grid.tile(x, y);
    if (!t) return true;
    if (Grid.terrain(t).blocksLos) return true;
    if (t.obj && objBlocksLos(t.obj)) return true;
    if (t.surface) { const sd = DD.getSurface(t.surface.id); if (sd && sd.blocksLos) return true; }
    return false;
  };

  /** Terrain walkable, no blocking object, no pit. Flying units ignore pits and liquids (not walls). */
  Grid.isWalkable = function (x, y, unit) {
    const t = Grid.tile(x, y);
    if (!t) return false;
    if (t.obj && objBlocksMove(t.obj)) return false;
    const td = Grid.terrain(t);
    if (isFlying(unit)) return !!(td.walkable || td.pit || td.liquid);
    if (td.pit) return false;
    return td.walkable !== false;
  };

  /** Walkable and unoccupied (dead units don't count, downed do). */
  Grid.isFree = function (x, y, unit) { return Grid.isWalkable(x, y, unit) && !Grid.unitAt(x, y); };

  /** Height rule: up ≤1 (hop ≤2, flying any), down any. */
  Grid.canStep = function (unit, from, to) {
    if (isFlying(unit)) return true;
    const a = Grid.tile(from.x, from.y), b = Grid.tile(to.x, to.y);
    if (!a || !b) return false;
    const maxUp = unit && unit.flags && unit.flags.hop ? 2 : 1;
    return (b.h || 0) - (a.h || 0) <= maxUp;
  };

  /** Movement cost of one step: terrain cost + 1 per level climbed (flying: always 1). */
  Grid.stepCost = function (unit, from, to) {
    if (isFlying(unit)) return 1;
    const b = Grid.tile(to.x, to.y);
    const a = Grid.tile(from.x, from.y);
    const td = Grid.terrain(b);
    const base = Math.max(1, td.cost || 1);
    const up = a && b ? Math.max(0, (b.h || 0) - (a.h || 0)) : 0;
    return base + up;
  };

  /** Hostility used by pathing/targeting: sides differ; a charmed enemy fights for the heroes (§4.4). */
  Grid.hostile = function (a, b) {
    if (!a || !b || a === b) return false;
    return effectiveSide(a) !== b.side;
  };
  function effectiveSide(u) {
    if (u.side === 'enemy' && u.statuses) {
      for (let i = 0; i < u.statuses.length; i++) if (u.statuses[i].id === 'charmed') return 'hero';
    }
    return u.side;
  }
  Grid.effectiveSide = effectiveSide;

  /**
   * A def / instance `hazard` flag for this unit: true, or a per-unit test hazard(unit, tile) → bool (a cloud that
   * only hurts its brewer's foes warns only them). [phase 4, hero-josiah request]
   */
  function hazardFlag(v, owner, unit, tile) {
    if (typeof v === 'function') return !!DD.safe('hazard of ' + (owner && owner.id), v, owner, [unit || null, tile]);
    return !!v;
  }
  Grid.hazardFlag = hazardFlag;

  // ---- hazards, per unit (flyers, immunities) — the ONE place hazard checks are made ----------------------------
  const ELEMENT_ALIAS = { ice: 'frost', cold: 'frost', electric: 'lightning', shock: 'lightning' };
  /** Nothing of this element gets through (resist 0). */
  function elementProof(unit, el) {
    el = ELEMENT_ALIAS[el] || el;
    return !!(unit && unit.resist && unit.resist[el] === 0);
  }
  /** The status can't hurt the unit: it is immune (flags.immune, stunImmune...) or the status deals an element it ignores. */
  function statusProof(unit, id) {
    if (DD.Act && DD.Act.immuneTo && DD.Act.immuneTo(unit, id)) return true;
    const sd = DD.getStatus(id);
    return !!(sd && sd.element && elementProof(unit, sd.element));
  }
  /**
   * A hazard that can't hurt this unit (v2): the def (or instance) declares what it does — `hazardElement` (the element
   * of its damage) and / or `hazardStatus` (a status id or a list) — and the unit shrugs off all of it (resist 0 to the
   * element, immune to every status or to the element the status deals). Pebbles in fire, hell hounds in lava,
   * poison-proof slimes in poison puddles. A hazard declaring neither is a hazard for everyone it flags.
   */
  function harmlessTo(src, inst, unit) {
    if (!unit) return false;
    const pick = function (k) { return inst && inst[k] !== undefined ? inst[k] : src ? src[k] : undefined; };
    const el = pick('hazardElement'), sts = pick('hazardStatus');
    if (!el && !sts) return false;
    if (el && !elementProof(unit, el)) return false;
    const list = Array.isArray(sts) ? sts : sts ? [sts] : [];
    for (let i = 0; i < list.length; i++) if (!statusProof(unit, list[i])) return false;
    return true;
  }
  Grid.harmlessTo = harmlessTo;
  /** The hazard flag of a def / instance for this unit, minus what can't hurt it. */
  function flaggedFor(src, inst, unit, tile) {
    const v = inst && inst.hazard !== undefined ? inst.hazard : src && src.hazard;
    if (!v || !hazardFlag(v, inst && inst.hazard !== undefined ? inst : src, unit, tile)) return false;
    return !harmlessTo(src, inst, unit);
  }
  function surfaceHazard(t, unit) {
    if (!t.surface) return null;
    const sd = DD.getSurface(t.surface.id);
    if (!sd || !sd.hazard || (!sd.airborne && isFlying(unit))) return null;
    return flaggedFor(sd, null, unit, t) ? sd.id : null;
  }
  function terrainHazard(t, unit) {
    if (isFlying(unit)) return null;
    const td = Grid.terrain(t);
    return td.hazard && flaggedFor(td, null, unit, t) ? td.id : null;
  }
  function objectHazard(t, unit) {
    if (!t.obj || objBlocksMove(t.obj) || isFlying(unit)) return null;
    return flaggedFor(DD.getObject(t.obj.id), t.obj, unit, t) ? t.obj.id : null;
  }

  /**
   * Damaging hazard on a tile for this unit, or null: terrain/object/surface defs with `hazard` (true, or
   * (unit, tile) => bool): lava, spikes, fire, poison, electric... Per unit (v2): flyers ignore the floor (terrain,
   * objects, surfaces) except airborne clouds; a hazard that can't hurt the unit (harmlessTo) is none. unit null =
   * anyone (a walker without immunities).
   */
  Grid.hazardAt = function (x, y, unit) {
    const t = Grid.tile(x, y);
    if (!t) return null;
    return surfaceHazard(t, unit) || terrainHazard(t, unit) || objectHazard(t, unit);
  };
  /** The tile's surface is a hazard for this unit (per unit, as hazardAt): its id or null. */
  Grid.surfaceHazard = function (x, y, unit) { const t = Grid.tile(x, y); return t ? surfaceHazard(t, unit) : null; };

  function hazardNumbers(src, inst, unit, tile) {
    if (!flaggedFor(src, inst, unit, tile)) return null;
    function pick(k, d) {
      const v = inst && inst[k] !== undefined ? inst[k] : src ? src[k] : undefined;
      const n = Number(v);
      return v === undefined || v === null || !isFinite(n) ? d : Math.max(0, n);
    }
    return { enter: pick('hazardDmg', 4), end: pick('hazardEnd', 0) };
  }

  /**
   * Rough damage a hazard tile does to this unit (AI risk estimates): { id, enter, end } or null. enter = immediate
   * damage on stepping in (def.hazardDmg; 4 for a hazard without numbers), end = damage for ending a turn there
   * (def.hazardEnd). Surface + terrain + object add up; per unit like hazardAt (flyers only feel airborne surfaces, a
   * hazard that can't hurt the unit counts nothing).
   */
  Grid.hazardDamage = function (x, y, unit) {
    const t = Grid.tile(x, y);
    if (!t) return null;
    const fly = isFlying(unit);
    let out = null;
    function add(n, id) {
      if (!n) return;
      if (!out) out = { id: id, enter: 0, end: 0 };
      out.enter += n.enter; out.end += n.end;
    }
    if (t.surface) {
      const sd = DD.getSurface(t.surface.id);
      if (sd && (!fly || sd.airborne)) add(hazardNumbers(sd, null, unit, t), sd.id);
    }
    if (fly) return out;
    const td = Grid.terrain(t);
    add(hazardNumbers(td, null, unit, t), td.id);
    if (t.obj && !objBlocksMove(t.obj)) add(hazardNumbers(DD.getObject(t.obj.id), t.obj, unit, t), t.obj.id);
    return out;
  };

  /**
   * Tile borders a pit, deep water or lava: being pushed from here can be fatal. Per unit when one is given ([v2
   * review]): never for a flyer (it floats over all of them), and lava only when it can hurt the unit (harmlessTo).
   */
  Grid.isEdge = function (x, y, unit) {
    if (unit && isFlying(unit)) return false;
    for (let i = 0; i < 4; i++) {
      const nx = x + DIRS[i].x, ny = y + DIRS[i].y;
      const t = Grid.tile(nx, ny);
      if (!t) continue;
      const td = Grid.terrain(t);
      if (td.pit || td.liquid === 'deep') return true;
      if (td.liquid === 'lava' && !(unit && harmlessTo(td, null, unit))) return true;
    }
    return false;
  };

  // ---- Dijkstra -----------------------------------------------------------------------------
  // Tiny binary heap on parallel arrays (index, priority).
  function Heap() { this.i = []; this.p = []; }
  Heap.prototype.push = function (idx, pr) {
    const I = this.i, P = this.p;
    let n = I.length;
    I.push(idx); P.push(pr);
    while (n > 0) {
      const parent = (n - 1) >> 1;
      if (P[parent] <= pr) break;
      I[n] = I[parent]; P[n] = P[parent];
      n = parent;
    }
    I[n] = idx; P[n] = pr;
  };
  Heap.prototype.pop = function () {
    const I = this.i, P = this.p;
    const top = I[0];
    const lastI = I.pop(), lastP = P.pop();
    const len = I.length;
    if (len > 0) {
      let n = 0;
      for (;;) {
        const l = 2 * n + 1, r = l + 1;
        let m = n, mp = lastP;
        if (l < len && P[l] < mp) { m = l; mp = P[l]; }
        if (r < len && P[r] < mp) { m = r; mp = P[r]; }
        if (m === n) break;
        I[n] = I[m]; P[n] = P[m];
        n = m;
      }
      I[n] = lastI; P[n] = lastP;
    }
    return top;
  };

  /**
   * Core search. Priority = cost*1000 + hazards so equal-cost paths prefer fewer hazard tiles.
   * Returns { cost, prev, hazard, w, h, occ, startIdx } typed arrays.
   */
  function search(unit, maxCost, opts, targetIdx) {
    const g = grid();
    const w = g.w, h = g.h, n = w * h;
    const cost = new Float64Array(n).fill(Infinity);
    const prio = new Float64Array(n).fill(Infinity);
    const prev = new Int32Array(n).fill(-1);
    const hzCount = new Int32Array(n);
    const hzName = new Array(n);
    const done = new Uint8Array(n);
    const occ = new Array(n);
    const s = state();
    for (let i = 0; i < s.units.length; i++) {
      const u = s.units[i];
      if (u.dead || u === unit) continue;
      if (u.x >= 0 && u.y >= 0 && u.x < w && u.y < h) occ[u.y * w + u.x] = u;
    }
    const sx = opts.from ? opts.from.x : unit.x, sy = opts.from ? opts.from.y : unit.y;
    const startIdx = sy * w + sx;
    if (sx < 0 || sy < 0 || sx >= w || sy >= h) return null;
    cost[startIdx] = 0; prio[startIdx] = 0;
    const heap = new Heap();
    heap.push(startIdx, 0);
    const ignoreUnits = !!opts.ignoreUnits;
    while (heap.i.length) {
      const i = heap.pop();
      if (done[i]) continue;
      done[i] = 1;
      if (i === targetIdx) break;
      const x = i % w, y = (i / w) | 0;
      for (let d = 0; d < 4; d++) {
        const nx = x + DIRS[d].x, ny = y + DIRS[d].y;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (done[j]) continue;
        if (!Grid.isWalkable(nx, ny, unit)) continue;
        if (!Grid.canStep(unit, { x: x, y: y }, { x: nx, y: ny })) continue;
        const o = occ[j];
        if (o && !ignoreUnits && Grid.hostile(unit, o)) continue;
        const c = cost[i] + Grid.stepCost(unit, { x: x, y: y }, { x: nx, y: ny });
        if (c > maxCost) continue;
        const hz = Grid.hazardAt(nx, ny, unit);
        const hc = hzCount[i] + (hz ? 1 : 0);
        const p = c * 1000 + hc;
        if (p < prio[j]) {
          prio[j] = p; cost[j] = c; prev[j] = i; hzCount[j] = hc;
          hzName[j] = hzName[i] || hz || null;
          heap.push(j, p);
        }
      }
    }
    return { cost: cost, prev: prev, hzName: hzName, w: w, occ: occ, startIdx: startIdx, done: done };
  }

  function buildPath(res, idx) {
    const out = [];
    let i = idx;
    const w = res.w, n = res.n || Infinity;
    while (i !== -1 && i !== res.startIdx) { const t = i % n; out.push({ x: t % w, y: (t / w) | 0 }); i = res.prev[i]; }
    out.reverse();
    return out;
  }

  // ---- attacks of opportunity on the way (v2; DD.Act.opportunityOf) -------------------------------------------
  const LAYERS = 4;   // attacks of opportunity a path provokes: 0, 1, 2, 3+

  /**
   * Who would strike the mover when it leaves each tile: zl[i] = [opposing units] (DD.Act.opportunityOf on every
   * eligible unit's 4 neighbours), or null when nobody can make an attack of opportunity on it.
   */
  function oppZones(unit) {
    const s = state(), g = grid();
    if (!s || !g || !s.order || !DD.Act || !DD.Act.opportunityOf) return null;
    let zl = null;
    for (let k = 0; k < s.units.length; k++) {
      const a = s.units[k];
      if (a.dead || a.downed || a === unit || !Grid.hostile(a, unit) || !DD.Act.opportunitySlot(a)) continue;
      for (let d = 0; d < 4; d++) {
        const nx = a.x + DIRS[d].x, ny = a.y + DIRS[d].y;
        if (nx < 0 || ny < 0 || nx >= g.w || ny >= g.h || !Grid.isWalkable(nx, ny, unit)) continue;
        if (!DD.Act.opportunityOf(a, unit, { x: nx, y: ny })) continue;
        if (!zl) zl = new Array(g.w * g.h);
        const i = ny * g.w + nx;
        (zl[i] || (zl[i] = [])).push(a);
      }
    }
    return zl;
  }

  /**
   * search() with attacks of opportunity: Dijkstra over (tile, attacks provoked so far) states, so each tile keeps the
   * cheapest path for every count; best[i] = its state with the fewest (attacks + hazard tiles) — counted exactly —
   * then, on a tie, the least harmful walk (walkHarm), then the fewest attacks, then the cheapest.
   */
  function searchAoo(unit, maxCost, opts, zl) {
    const g = grid();
    const w = g.w, h = g.h, n = w * h, N = n * LAYERS;
    const cost = new Float64Array(N).fill(Infinity);
    const prio = new Float64Array(N).fill(Infinity);
    const prev = new Int32Array(N).fill(-1);
    const hzCount = new Int32Array(N);
    const hzName = new Array(N);
    const done = new Uint8Array(N);
    const occ = new Array(n);
    const s = state();
    for (let i = 0; i < s.units.length; i++) {
      const u = s.units[i];
      if (u.dead || u === unit) continue;
      if (u.x >= 0 && u.y >= 0 && u.x < w && u.y < h) occ[u.y * w + u.x] = u;
    }
    const sx = opts.from ? opts.from.x : unit.x, sy = opts.from ? opts.from.y : unit.y;
    if (sx < 0 || sy < 0 || sx >= w || sy >= h) return null;
    const startIdx = sy * w + sx;
    cost[startIdx] = 0; prio[startIdx] = 0;
    const heap = new Heap();
    heap.push(startIdx, 0);
    while (heap.i.length) {
      const si = heap.pop();
      if (done[si]) continue;
      done[si] = 1;
      const layer = (si / n) | 0, i = si - layer * n;
      const x = i % w, y = (i / w) | 0;
      const nl = Math.min(LAYERS - 1, layer + (zl[i] ? zl[i].length : 0));
      for (let d = 0; d < 4; d++) {
        const nx = x + DIRS[d].x, ny = y + DIRS[d].y;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx, sj = nl * n + j;
        if (done[sj]) continue;
        if (!Grid.isWalkable(nx, ny, unit)) continue;
        if (!Grid.canStep(unit, { x: x, y: y }, { x: nx, y: ny })) continue;
        const o = occ[j];
        if (o && Grid.hostile(unit, o)) continue;
        const c = cost[si] + Grid.stepCost(unit, { x: x, y: y }, { x: nx, y: ny });
        if (c > maxCost) continue;
        const hz = Grid.hazardAt(nx, ny, unit);
        const hc = hzCount[si] + (hz ? 1 : 0);
        const p = c * 1000 + hc;
        if (p < prio[sj]) {
          prio[sj] = p; cost[sj] = c; prev[sj] = si; hzCount[sj] = hc;
          hzName[sj] = hzName[si] || hz || null;
          heap.push(sj, p);
        }
      }
    }
    const best = new Int32Array(n).fill(-1);
    const cand = [];
    for (let i = 0; i < n; i++) {
      cand.length = 0;
      let k1 = Infinity;
      for (let l = 0; l < LAYERS; l++) {
        const si = l * n + i;
        if (cost[si] === Infinity) continue;
        // the layer counts an attacker again when the path leaves two tiles next to it (walking round it), but it
        // strikes once per round: from 2 up, recount the stored path exactly (else a phantom second attack could
        // send the walk through fire)
        const pv = l >= 2 ? exactProvokes(prev, si, n, zl) : l;
        const k = pv + hzCount[si];
        if (k < k1) { k1 = k; cand.length = 0; }
        if (k === k1) cand.push(si, pv);
      }
      if (cand.length === 2) { best[i] = cand[0]; continue; }
      // a tie (a stab on one way, a hazard tile on the other): the less harmful walk, then fewer attacks, then cheaper
      // (so a lava walk is never taken just to dodge a stab that hurts less than the lava)
      let b = -1, bk = Infinity;
      for (let c = 0; c < cand.length; c += 2) {
        const si = cand[c];
        const k = walkHarm(unit, prev, si, n, w, zl) * 1e4 + cand[c + 1] * 100 + cost[si];
        if (k < bk) { bk = k; b = si; }
      }
      best[i] = b;
    }
    return { n: n, cost: cost, prev: prev, hzName: hzName, w: w, occ: occ, startIdx: startIdx, best: best, zl: zl };
  }
  /** Distinct attackers along the stored path to state si (every tile it leaves: the start and the steps before si). */
  function exactProvokes(prev, si, n, zl) {
    const seen = {};
    let c = 0;
    for (let t = prev[si]; t !== -1; t = prev[t]) {
      const list = zl[t % n];
      if (list) for (let a = 0; a < list.length; a++) if (!seen[list[a].id]) { seen[list[a].id] = 1; c++; }
    }
    return c;
  }
  /**
   * Estimated HP the stored walk to state si costs the unit: every hazard tile it enters (its damage, at least 2: Burn and
   * Poison hurt later) plus the estimated hits of its attacks of opportunity (DD.AI.opportunityDmg, each attacker once).
   */
  function walkHarm(unit, prev, si, n, w, zl) {
    const tiles = [];
    for (let t = si; t !== -1; t = prev[t]) tiles.push(t % n);
    let harm = 0;
    const seen = {};
    for (let k = tiles.length - 1; k >= 0; k--) {   // from the start to the destination
      const i = tiles[k], x = i % w, y = (i / w) | 0;
      if (k < tiles.length - 1 && Grid.hazardAt(x, y, unit)) {
        const hz = Grid.hazardDamage(x, y, unit);
        harm += Math.max(hz ? hz.enter : 0, 2);
      }
      const list = k > 0 ? zl[i] : null;   // the destination is not left
      if (!list) continue;
      for (let a = 0; a < list.length; a++) {
        if (seen[list[a].id]) continue;
        seen[list[a].id] = 1;
        harm += DD.AI && DD.AI.opportunityDmg ? DD.AI.opportunityDmg(list[a], unit, { x: x, y: y }) : 4;
      }
    }
    return harm;
  }

  /** Ids of the units a path (excluding the start) provokes, each once, in order (from the zones of searchAoo). */
  function provokesOf(zl, startIdx, path, w) {
    const out = [];
    if (!zl) return out;
    const seen = {};
    let i = startIdx;
    for (let k = 0; k < path.length; k++) {
      const list = zl[i];
      if (list) for (let a = 0; a < list.length; a++) if (!seen[list[a].id]) { seen[list[a].id] = 1; out.push(list[a].id); }
      i = path[k].y * w + path[k].x;
    }
    return out;
  }

  /**
   * Tiles a unit can move to within maxCost: Map<"x,y", { x, y, cost, path, hazard, edge }>.
   * Passes through friends (not foes), never ends on a unit, excludes the start tile.
   * hazard = first damaging hazard id along the path (incl. destination) or null; edge = destination borders
   * a pit / deep water / lava. opts: ignoreUnits, from {x,y}, includeOccupied (report occupied tiles too),
   * aoo (a MOVE action: each path provokes as few attacks of opportunity as possible within maxCost, and entries get
   * `provokes: [unitIds]` — who would strike on the way, in order; see DD.Act.opportunityOf).
   */
  Grid.reachable = function (unit, maxCost, opts) {
    opts = opts || {};
    const out = new Map();
    if (!unit || !grid()) return out;
    const max = maxCost === undefined ? Infinity : maxCost;
    const zl = opts.aoo && !opts.ignoreUnits ? oppZones(unit) : null;
    if (zl) {
      const res = searchAoo(unit, max, opts, zl);
      if (!res) return out;
      const w = res.w;
      for (let i = 0; i < res.n; i++) {
        const si = res.best[i];
        if (i === res.startIdx || si < 0) continue;
        if (res.occ[i] && !opts.includeOccupied) continue;
        const x = i % w, y = (i / w) | 0;
        const path = buildPath(res, si);
        out.set(x + ',' + y, { x: x, y: y, cost: res.cost[si], path: path, hazard: res.hzName[si] || null, edge: Grid.isEdge(x, y, unit),
          provokes: provokesOf(zl, res.startIdx, path, w) });
      }
      return out;
    }
    const res = search(unit, max, opts, -1);
    if (!res) return out;
    const w = res.w;
    for (let i = 0; i < res.cost.length; i++) {
      if (i === res.startIdx || res.cost[i] === Infinity) continue;
      if (res.occ[i] && !opts.includeOccupied && !opts.ignoreUnits) continue;
      const x = i % w, y = (i / w) | 0;
      const e = { x: x, y: y, cost: res.cost[i], path: buildPath(res, i), hazard: res.hzName[i] || null, edge: Grid.isEdge(x, y, unit) };
      if (opts.aoo) e.provokes = [];
      out.set(x + ',' + y, e);
    }
    return out;
  };

  /**
   * Cheapest path to (x, y) excluding the start, or null. opts: maxCost, ignoreUnits, allowOccupied (end on a unit),
   * aoo (the path provoking the fewest attacks of opportunity within maxCost, then the cheapest).
   */
  Grid.path = function (unit, x, y, opts) {
    opts = opts || {};
    if (!unit || !Grid.inBounds(x, y)) return null;
    if (unit.x === x && unit.y === y) return [];
    const g = grid();
    const target = y * g.w + x;
    const max = opts.maxCost === undefined ? Infinity : opts.maxCost;
    const zl = opts.aoo && !opts.ignoreUnits ? oppZones(unit) : null;
    if (zl) {
      const res = searchAoo(unit, max, opts, zl);
      if (!res || res.best[target] < 0) return null;
      if (res.occ[target] && !opts.allowOccupied) return null;
      return buildPath(res, res.best[target]);
    }
    const res = search(unit, max, opts, target);
    if (!res || res.cost[target] === Infinity) return null;
    if (res.occ[target] && !opts.allowOccupied && !opts.ignoreUnits) return null;
    return buildPath(res, target);
  };

  /** Ids of the units that would make an attack of opportunity on `unit` walking `path` (DD.Act.provokers). */
  Grid.provokes = function (unit, path, from) {
    if (!unit || !DD.Act || !DD.Act.provokers) return [];
    return DD.Act.provokers(unit, path, from).map(function (a) { return a.id; });
  };

  /** Movement cost of a path (array of {x,y} excluding start) for unit starting at its position. */
  Grid.pathCost = function (unit, path, from) {
    let c = 0;
    let p = from || { x: unit.x, y: unit.y };
    for (let i = 0; i < path.length; i++) { c += Grid.stepCost(unit, p, path[i]); p = path[i]; }
    return c;
  };

  // ---- line of sight (§6.3) -------------------------------------------------------------------
  /**
   * Supercover walk between tile centers. Blocked by an intermediate tile whose terrain/object/surface blocks
   * LOS or whose h ≥ max(hA, hB) + 2. When the line passes exactly through a corner it is blocked only if
   * both side tiles block (you can see past a single corner). Units never block.
   */
  Grid.los = function (a, b) {
    if (!a || !b) return false;
    if (a.x === b.x && a.y === b.y) return true;
    const ta = Grid.tile(a.x, a.y), tb = Grid.tile(b.x, b.y);
    if (!ta || !tb) return false;
    const hLimit = Math.max(ta.h || 0, tb.h || 0) + 2;
    const dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y);
    const sx = b.x > a.x ? 1 : -1, sy = b.y > a.y ? 1 : -1;
    let x = a.x, y = a.y, ix = 0, iy = 0;
    function blocks(px, py) {
      const t = Grid.tile(px, py);
      if (!t) return true;
      if ((t.h || 0) >= hLimit) return true;
      return Grid.blocksLos(px, py);
    }
    while (ix < dx || iy < dy) {
      const decision = (1 + 2 * ix) * dy - (1 + 2 * iy) * dx;
      if (decision === 0) {
        if (blocks(x + sx, y) && blocks(x, y + sy)) return false;
        x += sx; y += sy; ix++; iy++;
      } else if (decision < 0) { x += sx; ix++; } else { y += sy; iy++; }
      if (x === b.x && y === b.y) break;
      if (blocks(x, y)) return false;
    }
    return true;
  };

  // ---- lines & shapes (§5.2) ------------------------------------------------------------------
  function tallBlock(x, y, baseH) {
    const t = Grid.tile(x, y);
    if (!t) return true;
    if (Grid.blocksLos(x, y)) return true;
    const td = Grid.terrain(t);
    if (!td.walkable && !td.pit && !td.liquid) return true; // walls
    return (t.h || 0) >= baseH + 2;
  }

  /** Tiles from `from`+dir onward, up to len. opts: stopAtBlock, stopAtUnit, includeUnitTile, stopAtObject. */
  Grid.line = function (from, dir, len, opts) {
    opts = opts || {};
    const out = [];
    if (!from || !dir || (!dir.x && !dir.y)) return out;
    const t0 = Grid.tile(from.x, from.y);
    const baseH = t0 ? t0.h || 0 : 0;
    let x = from.x, y = from.y;
    for (let i = 0; i < len; i++) {
      x += dir.x; y += dir.y;
      if (!Grid.inBounds(x, y)) break;
      if (opts.stopAtBlock && tallBlock(x, y, baseH)) break;
      const u = opts.stopAtUnit ? Grid.unitAt(x, y) : null;
      const tl = Grid.tile(x, y);
      const objStop = opts.stopAtObject && tl.obj && objBlocksMove(tl.obj);
      if ((u && !u.downed) || objStop) {
        if (opts.includeUnitTile !== false) out.push({ x: x, y: y });
        break;
      }
      out.push({ x: x, y: y });
    }
    return out;
  };

  function perp(dir) { return { x: -dir.y, y: dir.x }; }

  /**
   * Area tiles (in-bounds, deduped). `shape` is a shape name or an area object { shape, size, pierce, fn }.
   * origin = target tile; user supplies the apex for line/cone/adjacent and the side for all_foes/all_allies.
   * opts.ctx is passed to custom area functions.
   */
  Grid.shape = function (shape, origin, dir, size, user, opts) {
    let area = null;
    if (shape && typeof shape === 'object') { area = shape; shape = area.shape || 'single'; }
    opts = opts || {};
    if (size === undefined || size === null) size = area && typeof area.size === 'number' ? area.size : 1;
    size = Math.max(0, Math.floor(size || 0));
    const out = [];
    const seen = {};
    function add(x, y) {
      if (!Grid.inBounds(x, y)) return;
      const k = x + ',' + y;
      if (seen[k]) return;
      seen[k] = 1;
      out.push({ x: x, y: y });
    }
    const o = origin || (user ? { x: user.x, y: user.y } : null);
    const apex = user ? { x: user.x, y: user.y } : o;
    let d = dir && (dir.x || dir.y) ? dir : null;
    if (!d && apex && o && (apex.x !== o.x || apex.y !== o.y)) d = U.dirTo(apex, o);
    if (!d) d = { x: 1, y: 0 };
    switch (shape) {
      case 'circle':
        for (let dy = -size; dy <= size; dy++) for (let dx = -size; dx <= size; dx++) if (Math.abs(dx) + Math.abs(dy) <= size) add(o.x + dx, o.y + dy);
        break;
      case 'square':
        for (let dy = -size; dy <= size; dy++) for (let dx = -size; dx <= size; dx++) add(o.x + dx, o.y + dy);
        break;
      case 'ring':
        if (size === 0) add(o.x, o.y);
        for (let dy = -size; dy <= size; dy++) for (let dx = -size; dx <= size; dx++) if (Math.abs(dx) + Math.abs(dy) === size) add(o.x + dx, o.y + dy);
        break;
      case 'cross':
        add(o.x, o.y);
        for (let i = 0; i < 4; i++) for (let k = 1; k <= size; k++) add(o.x + DIRS[i].x * k, o.y + DIRS[i].y * k);
        break;
      case 'line': {
        const pierce = !(area && area.pierce === false) && opts.pierce !== false;
        const tiles = Grid.line(apex, d, size, { stopAtBlock: true, stopAtUnit: !pierce, stopAtObject: !pierce, includeUnitTile: true });
        for (let i = 0; i < tiles.length; i++) add(tiles[i].x, tiles[i].y);
        break;
      }
      case 'cone': {
        const p = perp(d);
        for (let k = 1; k <= size; k++) {
          const cx = apex.x + d.x * k, cy = apex.y + d.y * k;
          for (let j = -(k - 1); j <= k - 1; j++) add(cx + p.x * j, cy + p.y * j);
        }
        break;
      }
      case 'row': {
        const p = perp(d);
        for (let j = -size; j <= size; j++) add(o.x + p.x * j, o.y + p.y * j);
        break;
      }
      case 'adjacent':
        for (let i = 0; i < 4; i++) add(apex.x + DIRS[i].x, apex.y + DIRS[i].y);
        break;
      case 'all_foes': case 'all_allies': {
        const s = state();
        if (s && user) {
          for (let i = 0; i < s.units.length; i++) {
            const u = s.units[i];
            if (u.dead || u.downed) continue;
            const foe = Grid.hostile(user, u);
            if (shape === 'all_foes' ? foe : (!foe)) add(u.x, u.y);
          }
        }
        break;
      }
      case 'custom': {
        const fn = (area && area.fn) || opts.fn;
        if (typeof fn === 'function') {
          // area queries run every frame (telegraphs) and on every hover: a fn that rolls dice must not advance
          // the combat RNG, so its state is put back afterwards
          const s = state();
          const rs = s && s.rng ? s.rng.getState() : null;
          let r;
          if (DD.Act) DD.Act._quiet++;   // rolled back below: not chance in a preview's outcome
          try { r = DD.safe('custom area fn', fn, area, [opts.ctx || { user: user, target: o, dir: d, size: size, state: s, rng: s ? s.rng : DD.rng }]); }
          finally { if (DD.Act) DD.Act._quiet--; if (rs !== null && state() === s) s.rng.setState(rs); }
          if (Array.isArray(r)) for (let i = 0; i < r.length; i++) if (r[i] && typeof r[i].x === 'number' && typeof r[i].y === 'number') add(r[i].x, r[i].y);
        } else if (o) add(o.x, o.y);
        break;
      }
      default:
        if (o) add(o.x, o.y);
    }
    return out;
  };

  // ---- free tile helpers ----------------------------------------------------------------------
  /** Free tiles within Manhattan radius r of (x, y), nearest first. */
  Grid.emptyTilesNear = function (x, y, r, unit) {
    const out = [];
    for (let d = 0; d <= r; d++) {
      for (let dy = -d; dy <= d; dy++) {
        const rem = d - Math.abs(dy);
        const xs = rem === 0 ? [0] : [-rem, rem];
        for (let k = 0; k < xs.length; k++) {
          const tx = x + xs[k], ty = y + dy;
          if (Grid.isFree(tx, ty, unit)) out.push({ x: tx, y: ty });
        }
      }
    }
    return out;
  };

  Grid.randomEmptyTile = function (rng, filterFn) {
    const g = grid();
    if (!g) return null;
    const list = [];
    for (let i = 0; i < g.tiles.length; i++) {
      const t = g.tiles[i];
      if (!Grid.isFree(t.x, t.y)) continue;
      if (filterFn && !filterFn(t)) continue;
      list.push({ x: t.x, y: t.y });
    }
    if (!list.length) return null;
    const r = rng || (state() && state().rng) || DD.rng;
    return list[r.int(0, list.length - 1)];
  };

  /** Nearest free tile to (x, y) (the tile itself if free). Optional unit for flying rules. */
  Grid.nearestFree = function (x, y, unit) {
    const g = grid();
    if (!g) return null;
    const maxR = g.w + g.h;
    for (let d = 0; d <= maxR; d++) {
      const ring = Grid.emptyTilesRing(x, y, d, unit);
      if (ring.length) return ring[0];
    }
    return null;
  };
  Grid.emptyTilesRing = function (x, y, d, unit) {
    const out = [];
    for (let dy = -d; dy <= d; dy++) {
      const rem = d - Math.abs(dy);
      const xs = rem === 0 ? [0] : [-rem, rem];
      for (let k = 0; k < xs.length; k++) {
        const tx = x + xs[k], ty = y + dy;
        if (Grid.isFree(tx, ty, unit) && !Grid.isDrop(tx, ty)) out.push({ x: tx, y: ty });
      }
    }
    return out;
  };
})();
