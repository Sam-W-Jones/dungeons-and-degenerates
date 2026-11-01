/* Dungeons and Degenerates — js/engine/mapgen.js
 * Battlefield generation (ARCHITECTURE §5.8): DD.MapGen.generate builds procedural maps from a theme
 * (js/data/themes.js); DD.MapGen.fromLayout parses hand-made layouts. Both return
 *   { grid: { w, h, tiles }, heroZone: [{x,y}], enemyZone: [{x,y}], theme, meta }   (+ marks for layouts)
 * with tiles[y*w+x] = { x, y, h, t, surface, obj, zone, tag } (§4.2).
 *
 * Generated maps are built in a canonical orientation (heroes along the bottom rows, enemies along the top),
 * then mirrored/transposed so heroes start on the S or E edge (the edges nearest the camera).
 * Guarantees (checked by validate(), retried with a forked rng, flat fallback as a last resort):
 *   - every safe walkable tile can reach every other one under the height rule (step up ≤ 1, down any),
 *   - every walkable hazard tile (lava, deep water...) can walk back to safety,
 *   - deploy zones are clean dry floor (no objects, surfaces, liquids or slow terrain),
 *   - the same rng state always produces the same map.
 * "Safe" = walkable, not lava / deep / hazard terrain, no fire / poison / electric / web (or hazard) surface, no
 * hazard object (spikes). Object instance overrides (blocksMove, hazard) win, as in DD.Grid.
 */
(function () {
  'use strict';
  const DD = window.DD;

  const MIN_SIZE = 5;
  const MAX_SIZE = 24;
  const MAX_H = 4;
  const SURFACE_TURNS = -1; // pre-placed surfaces are scenery: turns -1 never ticks down (same as combat.js / statuses)
  const LOCK_ZONE = 1, LOCK_BUFFER = 2, LOCK_KEEP = 4;

  const FLOOR_IDS = ['stone', 'cobble', 'dirt', 'grass', 'wood', 'sand', 'moss', 'crypt', 'obsidian', 'felt',
    'paper', 'gold', 'carpet', 'grate', 'marble'];
  const FLOOR_SET = {};
  FLOOR_IDS.forEach(function (id) { FLOOR_SET[id] = true; });

  // Canonical terrain behaviour, used only when js/data/terrain.js has not registered the id.
  const FALLBACK_TERRAIN = {
    wall: { walkable: false, blocksLos: true },
    pit: { walkable: false, pit: true },
    water: { cost: 2, liquid: 'water' },
    deep_water: { walkable: false, liquid: 'deep' },
    lava: { liquid: 'lava' },
    mud: { cost: 2 },
    rubble: { cost: 2 },
    ice: {},
    bridge: {},
  };
  const CANON_OBJECTS = ['crate', 'barrel', 'barrel_explosive', 'keg', 'pillar', 'rock', 'tree', 'dead_tree', 'bush',
    'mushroom', 'gravestone', 'coffin', 'statue', 'lever', 'pressure_plate', 'chest', 'fountain', 'brazier', 'spikes',
    'totem', 'bookshelf', 'candles', 'mirror', 'd20', 'soda_can', 'pencil', 'gold_pile', 'bones', 'fence', 'pipe', 'valve'];
  const CANON_SURFACES = ['fire', 'poison', 'water', 'oil', 'ice', 'blood', 'web', 'steam', 'smoke', 'holy', 'electric', 'cheeto'];
  // Object fallbacks (real defs from js/data/terrain.js always win).
  const PASSABLE_OBJECTS = { pressure_plate: true, spikes: true, bones: true, candles: true, bush: true };
  const HAZARD_OBJECTS = { spikes: true };
  const FALLBACK_OBJ_HP = { crate: 6, barrel: 6, barrel_explosive: 4, keg: 8, bush: 2, mushroom: 4, bookshelf: 12,
    coffin: 10, fence: 6, totem: 14, dead_tree: 10, soda_can: 10, pencil: 8, candles: 2, bones: 2, mirror: 10, pipe: 0 };
  const UNSAFE_SURFACES = { fire: true, poison: true, electric: true, web: true };
  const FLOOR_INFO = { id: null, walkable: true, pit: false, liquid: null, cost: 1, blocksLos: false, known: true };

  // Minimal stand-in theme so the generator still works if js/data/themes.js is missing.
  const BASIC_THEME = {
    id: 'cellar', name: 'A Basement', act: 1, floors: ['stone', 'cobble'], floorWeights: [3, 1], walls: 'wall',
    obstacles: ['crate', 'barrel'], obstacleWeights: [1, 1], decor: [], hazards: [], liquids: [], surfaces: [],
    bg: { top: '#0d0907', bottom: '#2c1b10' }, ambient: 'dust',
    gen: { elevation: 'terraces', maxH: 2, cliffs: 0.1, hazards: [], hazardCount: [0, 0], obstacleDensity: 0.08,
      explosive: [1, 2], braziers: [0, 0], chest: 0.2, filler: 'crate' },
  };

  // Layout legend (ARCHITECTURE §5.8) plus three extras: '=' bridge, '%' rubble, '&' deep water.
  const LEGEND = {
    '.': { terrain: 'floor' },
    ' ': { terrain: 'floor' },
    '#': { terrain: 'wall' },
    '~': { terrain: 'water' },
    '^': { terrain: 'lava' },
    '_': { terrain: 'pit' },
    ',': { terrain: 'mud' },
    '*': { terrain: 'ice' },
    '"': { terrain: 'grass', obj: 'bush' },
    'H': { terrain: 'floor', zone: 'hero' },
    'E': { terrain: 'floor', zone: 'enemy', tag: 'enemy_spawn' },
    'B': { terrain: 'floor', zone: 'enemy', tag: 'boss_spawn' },
    'C': { obj: 'crate' },
    'X': { obj: 'barrel_explosive' },
    'P': { obj: 'pillar' },
    'T': { obj: 'tree' },
    'L': { obj: 'lever' },
    'S': { obj: 'spikes' },
    'O': { obj: 'pressure_plate' },
    '$': { obj: 'chest' },
    'F': { obj: 'fountain' },
    '=': { terrain: 'bridge' },
    '%': { terrain: 'rubble' },
    '&': { terrain: 'deep_water' },
  };

  // Encounter map.features vocabulary → internal feature keys. Anything else that names a canonical (or
  // registered) object / terrain / surface id, singular or plural, also works ("trees", "gravestones", "ice").
  const FEATURE_ALIASES = {
    barrel: 'explosive', barrels: 'explosive', explosive: 'explosive', explosives: 'explosive',
    barrel_explosive: 'explosive', barrels_explosive: 'explosive', tnt: 'explosive', powder: 'explosive',
    crate: 'obj:crate', crates: 'obj:crate', kegs: 'obj:keg', keg: 'obj:keg',
    cover: 'cover', dense: 'cover', cluttered: 'cover', open: 'open', sparse: 'open', arena: 'open',
    water: 'water', puddle: 'water', puddles: 'water', ale: 'water', flooded: 'water', flood: 'water',
    river: 'river', rivers: 'river', stream: 'river', channel: 'channel', channels: 'channel',
    canal: 'channel', canals: 'channel', sewage: 'channel',
    pool: 'pools', pools: 'pools', pond: 'pools', ponds: 'pools', lake: 'pools',
    lava: 'lava', magma: 'lava', lava_river: 'lava_river', lava_rivers: 'lava_river', lava_pool: 'lava', lava_pools: 'lava',
    pit: 'pits', pits: 'pits', hole: 'pits', holes: 'pits', chasm: 'chasm', chasms: 'chasm', gap: 'chasm',
    mud: 'mud', swamp: 'mud', bog: 'mud', marsh: 'mud',
    ice: 'ice', frozen: 'ice', deep_water: 'deep', deep: 'deep', rubble: 'rubble', debris: 'rubble',
    poison: 'surface:poison', slime: 'surface:poison', spores: 'surface:poison', toxic: 'surface:poison',
    oil: 'surface:oil', grease: 'surface:oil', web: 'surface:web', webs: 'surface:web', cobwebs: 'surface:web',
    cheeto: 'surface:cheeto', cheetos: 'surface:cheeto', cheeto_dust: 'surface:cheeto', snacks: 'surface:cheeto',
    fire: 'surface:fire', flames: 'surface:fire', vents: 'surface:fire', holy: 'surface:holy',
    holy_ground: 'surface:holy', blood: 'surface:blood', electric: 'surface:electric', smoke: 'surface:smoke',
    steam: 'surface:steam',
    hills: 'hills', hilly: 'hills', elevation: 'hills', high_ground: 'hills', terraces: 'terraces',
    platforms: 'terraces', tiers: 'terraces', flat: 'flat', cliffs: 'cliffs', cliff: 'cliffs',
    walls: 'walls', wall: 'walls', corridors: 'walls', maze: 'walls', rooms: 'walls',
    chokepoint: 'chokepoint', chokepoints: 'chokepoint', bridge: 'bridge', bridges: 'bridge',
    chest: 'chest', chests: 'chest', treasure: 'chest', loot: 'chest',
    brazier: 'braziers', braziers: 'braziers', torches: 'braziers',
    fountain: 'fountain', fountains: 'fountain', spikes: 'spikes', traps: 'spikes', trap: 'spikes',
  };

  const MapGen = (DD.MapGen = {});

  // =====================================================================================================
  // Tile knowledge
  // =====================================================================================================

  function terrainInfo(id) {
    if (id === null || id === undefined) return FLOOR_INFO;
    const def = DD.getTerrain ? DD.getTerrain(id) : null;
    const src = def || FALLBACK_TERRAIN[id] || {};
    return {
      id: id,
      walkable: src.walkable !== false,
      pit: !!src.pit,
      liquid: src.liquid || null,
      cost: typeof src.cost === 'number' ? src.cost : 1,
      blocksLos: !!src.blocksLos,
      hazard: !!src.hazard || src.liquid === 'lava',
      known: !!def || !!FALLBACK_TERRAIN[id] || !!FLOOR_SET[id],
    };
  }

  function objectInfo(id) {
    const def = DD.getObject ? DD.getObject(id) : null;
    if (def) {
      return { id: id, blocksMove: def.blocksMove !== false, blocksLos: !!def.blocksLos, hp: def.hp > 0 ? def.hp : 0,
        hazard: !!HAZARD_OBJECTS[id] || !!def.hazard, known: true };
    }
    return { id: id, blocksMove: !PASSABLE_OBJECTS[id], blocksLos: false, hp: FALLBACK_OBJ_HP[id] || 0,
      hazard: !!HAZARD_OBJECTS[id], known: CANON_OBJECTS.indexOf(id) >= 0 };
  }

  /** Surfaces that hurt or trap whoever enters (fire, poison, electric, web + anything flagged hazard). */
  function surfaceHazard(id) {
    if (UNSAFE_SURFACES[id]) return true;
    const def = DD.getSurface ? DD.getSurface(id) : null;
    return !!(def && def.hazard);
  }

  /** New object instance (ARCHITECTURE §3.7) with optional instance overrides (label, data, onInteract...). */
  function makeObj(id, extra, info) {
    const inf = info || objectInfo(id);
    const o = { id: id, hp: inf.hp, maxHp: inf.hp, data: {} };
    if (extra && typeof extra === 'object') {
      for (const k in extra) if (k !== 'id' && Object.prototype.hasOwnProperty.call(extra, k)) o[k] = extra[k];
      if (extra.hp !== undefined && extra.maxHp === undefined) o.maxHp = o.hp;
    }
    if (!o.data || typeof o.data !== 'object') o.data = {};
    return o;
  }

  function themeById(id) {
    const T = DD.Themes;
    if (T && typeof T.get === 'function') {
      if (id && !(T.has ? T.has(id) : (T[id] && typeof T[id] === 'object'))) {
        DD.warn('MapGen: unknown theme "' + id + '" (using ' + T.get(id).id + ')');
      }
      return T.get(id);
    }
    return BASIC_THEME;
  }

  // =====================================================================================================
  // Small helpers
  // =====================================================================================================

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function clampInt(v, lo, hi, def) {
    const n = Math.round(+v);
    return isFinite(n) && v !== null && v !== undefined && v !== '' ? clamp(n, lo, hi) : def;
  }
  /** Integer from a [min, max] range (or a plain number) via rng. */
  function rint(rng, range, def) {
    if (Array.isArray(range)) {
      let a = Math.round(+range[0]) || 0, b = range.length > 1 ? Math.round(+range[1]) || 0 : a;
      if (b < a) { const t = a; a = b; b = t; }
      return rng.int(a, b);
    }
    if (typeof range === 'number' && isFinite(range)) return Math.round(range);
    return def;
  }
  function weightedId(ids, weights, rng) {
    if (!ids || !ids.length) return null;
    let total = 0;
    for (let i = 0; i < ids.length; i++) total += Math.max(0, weights && weights[i] !== undefined ? +weights[i] : 1);
    if (total <= 0) return ids[0];
    let r = rng.next() * total;
    for (let i = 0; i < ids.length; i++) {
      r -= Math.max(0, weights && weights[i] !== undefined ? +weights[i] : 1);
      if (r < 0) return ids[i];
    }
    return ids[ids.length - 1];
  }
  function weightedSpec(list, rng) {
    if (!list || !list.length) return null;
    return weightedId(list, list.map(function (s) { return s && s.w !== undefined ? s.w : 1; }), rng);
  }
  function lerp(a, b, t) { return a + (b - a) * t; }

  // =====================================================================================================
  // Build context ("B"): a canonical cell grid plus caches and planning data
  // =====================================================================================================

  function makeCtx(w, h, rng, theme) {
    const n = w * h, cells = new Array(n);
    for (let i = 0; i < n; i++) {
      cells[i] = { t: null, h: 0, obj: null, surface: null, zone: null, tag: null, lock: 0, cliff: false, floor: null };
    }
    return {
      theme: theme, gen: theme.gen || {}, w: w, h: h, n: n, rng: rng, cells: cells,
      tcache: {}, ocache: {}, features: {}, objFeatures: [], surfaceFeatures: [], density: 1, required: [],
      deferred: [], style: 'flat', maxH: 2, heroH: 0, enemyH: 0, bandTop: 2, bandBot: h - 4, barrierRow: -1,
      dHero: null, dEnemy: null, meta: { features: [], unknownFeatures: [], barrier: null, required: [] },
      wallT: theme.walls || 'wall',
    };
  }
  function ti(B, t) {
    if (t === null || t === undefined) return FLOOR_INFO;
    return B.tcache[t] || (B.tcache[t] = terrainInfo(t));
  }
  function oi(B, id) { return B.ocache[id] || (B.ocache[id] = objectInfo(id)); }
  function idx(B, x, y) { return y * B.w + x; }
  function inb(B, x, y) { return x >= 0 && y >= 0 && x < B.w && y < B.h; }
  function nbrs(B, i) {
    const w = B.w, x = i % w, y = (i - x) / w, out = [];
    if (y > 0) out.push(i - w);
    if (x < w - 1) out.push(i + 1);
    if (y < B.h - 1) out.push(i + w);
    if (x > 0) out.push(i - 1);
    return out;
  }
  function mdist(B, a, b) {
    const ax = a % B.w, bx = b % B.w;
    return Math.abs(ax - bx) + Math.abs((a - ax) / B.w - (b - bx) / B.w);
  }

  // Instance-level overrides win over the object definition (same rule as DD.Grid).
  function objBlocks(B, o) { return o.blocksMove !== undefined ? !!o.blocksMove : oi(B, o.id).blocksMove; }
  function objHazard(B, o) { return o.hazard !== undefined ? !!o.hazard : oi(B, o.id).hazard; }
  function surfHazard(B, id) {
    const k = 'surface:' + id;
    if (B.tcache[k] === undefined) B.tcache[k] = surfaceHazard(id);
    return B.tcache[k];
  }

  function isWalk(B, c) {
    const t = ti(B, c.t);
    if (!t.walkable || t.pit) return false;
    return !(c.obj && objBlocks(B, c.obj));
  }
  function isSafe(B, c) {
    if (!isWalk(B, c)) return false;
    const t = ti(B, c.t);
    if (t.hazard || t.liquid === 'lava' || t.liquid === 'deep') return false;
    if (c.surface && surfHazard(B, c.surface.id)) return false;
    return !(c.obj && objHazard(B, c.obj));
  }
  /** Zone-grade tile: dry, plain-cost floor with nothing on it. */
  function isClean(B, c) {
    if (c.obj || c.surface) return false;
    const t = ti(B, c.t);
    return t.walkable && !t.pit && !t.liquid && t.cost <= 1;
  }
  /** Dry solid ground (objects / surfaces may go here). */
  function isGround(B, c) {
    const t = ti(B, c.t);
    return t.walkable && !t.pit && !t.liquid;
  }

  // =====================================================================================================
  // Connectivity analysis
  // =====================================================================================================

  /** Flood over mask from starts. Forward: a→b allowed if h[b]-h[a] ≤ 1. Reverse: finds tiles that can reach starts. */
  function flood(B, starts, mask, reverse) {
    const n = B.n, w = B.w, H = B.h, cells = B.cells;
    const seen = new Uint8Array(n), q = new Int32Array(n);
    let head = 0, tail = 0;
    for (let s = 0; s < starts.length; s++) {
      const i = starts[s];
      if (i >= 0 && mask[i] && !seen[i]) { seen[i] = 1; q[tail++] = i; }
    }
    while (head < tail) {
      const i = q[head++], x = i % w, y = (i - x) / w, hi = cells[i].h;
      for (let d = 0; d < 4; d++) {
        let j;
        if (d === 0) { if (y === 0) continue; j = i - w; }
        else if (d === 1) { if (x === w - 1) continue; j = i + 1; }
        else if (d === 2) { if (y === H - 1) continue; j = i + w; }
        else { if (x === 0) continue; j = i - 1; }
        if (!mask[j] || seen[j]) continue;
        const hj = cells[j].h;
        if (reverse ? hi - hj > 1 : hj - hi > 1) continue;
        seen[j] = 1; q[tail++] = j;
      }
    }
    return seen;
  }

  /**
   * Strong connectivity of the safe tiles (relative to a root in the hero zone), exit-ability of walkable hazard
   * tiles and zone membership. ok === true means every guarantee holds.
   */
  function analyze(B) {
    const n = B.n, cells = B.cells;
    const walk = new Uint8Array(n), safe = new Uint8Array(n);
    let root = -1;
    for (let i = 0; i < n; i++) {
      const c = cells[i];
      if (!isWalk(B, c)) continue;
      walk[i] = 1;
      if (!isSafe(B, c)) continue;
      safe[i] = 1;
      if (root < 0 || (c.zone === 'hero' && cells[root].zone !== 'hero')) root = i;
    }
    const res = { ok: false, walk: walk, safe: safe, root: root, fwd: null, bwd: null, main: null, exit: null,
      pockets: [], traps: [], zoneOut: [] };
    if (root < 0) return res;
    const fwd = flood(B, [root], safe, false), bwd = flood(B, [root], safe, true);
    const main = new Uint8Array(n), mainList = [];
    for (let i = 0; i < n; i++) if (fwd[i] && bwd[i]) { main[i] = 1; mainList.push(i); }
    const exit = flood(B, mainList, walk, true);
    for (let i = 0; i < n; i++) {
      if (safe[i] && !main[i]) res.pockets.push(i);
      else if (walk[i] && !exit[i]) res.traps.push(i);
      if (cells[i].zone && !main[i]) res.zoneOut.push(i);
    }
    res.fwd = fwd; res.bwd = bwd; res.main = main; res.exit = exit;
    res.ok = !res.pockets.length && !res.traps.length && !res.zoneOut.length;
    return res;
  }

  // =====================================================================================================
  // Zones
  // =====================================================================================================

  function setZone(B, x, y, zone, h) {
    const c = B.cells[idx(B, x, y)];
    c.zone = zone; c.lock |= LOCK_ZONE; c.h = h; c.cliff = false;
  }

  function zoneDistances(B) {
    const n = B.n, hero = [], enemy = [];
    for (let i = 0; i < n; i++) {
      if (B.cells[i].zone === 'hero') hero.push(i);
      else if (B.cells[i].zone === 'enemy') enemy.push(i);
    }
    B.dHero = new Int16Array(n); B.dEnemy = new Int16Array(n);
    for (let i = 0; i < n; i++) {
      let dh = 999, de = 999;
      for (let k = 0; k < hero.length; k++) { const d = mdist(B, i, hero[k]); if (d < dh) dh = d; }
      for (let k = 0; k < enemy.length; k++) { const d = mdist(B, i, enemy[k]); if (d < de) de = d; }
      B.dHero[i] = dh; B.dEnemy[i] = de;
    }
  }

  /** Reserve the deploy zones (canonical: heroes along the bottom, enemies along the top) and the hero buffer. */
  function reserveZones(B, enemyNeed) {
    const w = B.w, h = B.h, rng = B.rng, zh = B.gen.zoneH || {};
    B.heroH = clamp(rint(rng, zh.hero, 0), 0, B.maxH);
    B.enemyH = clamp(rint(rng, zh.enemy, 0), 0, B.maxH);
    if (B.style === 'flat') { B.heroH = 0; B.enemyH = Math.min(B.enemyH, 1); }

    const heroRows = h >= 7 ? 2 : 1;
    const heroW = Math.min(w, w >= 11 ? 5 : 4);
    const hx0 = clamp(Math.floor((w - heroW) / 2) + rng.int(-1, 1), 0, w - heroW);
    for (let y = h - heroRows; y < h; y++) for (let x = hx0; x < hx0 + heroW; x++) setZone(B, x, y, 'hero', B.heroH);

    const need = Math.max(8, enemyNeed | 0);
    const enemyRows = Math.min(h - heroRows - 1, need > 14 && h >= 11 ? 3 : 2);
    const ew = clamp(Math.ceil(need * 1.3 / Math.max(1, enemyRows)), 4, w);
    if (w >= 11 && ew <= w - 3 && rng.chance(0.2)) {
      // two groups on the flanks: the enemy split the party, for once
      const bw = Math.min(Math.ceil(ew / 2) + 1, Math.floor((w - 1) / 2));
      const lx = rng.int(0, 1), rx = w - bw - rng.int(0, 1);
      for (let y = 0; y < enemyRows; y++) {
        for (let x = lx; x < lx + bw; x++) setZone(B, x, y, 'enemy', B.enemyH);
        for (let x = rx; x < rx + bw; x++) setZone(B, x, y, 'enemy', B.enemyH);
      }
      B.meta.splitEnemyZone = true;
    } else {
      const ex0 = clamp(Math.floor((w - ew) / 2) + rng.int(-2, 2), 0, w - ew);
      for (let y = 0; y < enemyRows; y++) for (let x = ex0; x < ex0 + ew; x++) setZone(B, x, y, 'enemy', B.enemyH);
    }
    B.heroRows = heroRows; B.enemyRows = enemyRows;
    B.bandTop = enemyRows;
    B.bandBot = Math.max(B.bandTop, h - heroRows - 2);
    zoneDistances(B);
    for (let i = 0; i < B.n; i++) if (!B.cells[i].zone && B.dHero[i] === 1) B.cells[i].lock |= LOCK_BUFFER;
  }

  // =====================================================================================================
  // Elevation
  // =====================================================================================================

  function valueNoise(rng, w, h, cell) {
    const gw = Math.floor(w / cell) + 3, gh = Math.floor(h / cell) + 3;
    const g = new Float32Array(gw * gh);
    for (let i = 0; i < g.length; i++) g[i] = rng.next();
    const ox = rng.next() * cell, oy = rng.next() * cell;
    return function (x, y) {
      const fx = (x + ox) / cell, fy = (y + oy) / cell;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      let tx = fx - x0, ty = fy - y0;
      tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
      const a = g[y0 * gw + x0], b = g[y0 * gw + x0 + 1], c = g[(y0 + 1) * gw + x0], d = g[(y0 + 1) * gw + x0 + 1];
      const top = a + (b - a) * tx, bot = c + (d - c) * tx;
      return top + (bot - top) * ty;
    };
  }

  function raiseRect(B, x0, y0, rw, rh, lift, sheer) {
    for (let y = y0; y < y0 + rh; y++) {
      for (let x = x0; x < x0 + rw; x++) {
        if (!inb(B, x, y)) continue;
        const c = B.cells[idx(B, x, y)];
        if (c.lock & LOCK_ZONE) continue;
        c.h = Math.min(B.maxH, c.h + lift);
        if (sheer) c.cliff = true;
      }
    }
  }

  function terraces(B) {
    const rng = B.rng, w = B.w;
    const bandH = B.bandBot - B.bandTop + 1;
    const count = Math.max(2, Math.round(B.n / 45)) + rng.int(0, 1);
    for (let k = 0; k < count; k++) {
      const rw = rng.int(2, Math.max(2, Math.round(w * 0.4)));
      const rh = rng.int(2, Math.max(2, Math.min(4, bandH)));
      const x0 = rng.int(0, Math.max(0, w - rw));
      const y0 = rng.int(Math.max(0, B.bandTop - 1), Math.max(0, B.bandBot - rh + 2));
      const sheer = rng.chance(B.gen.cliffs || 0);
      raiseRect(B, x0, y0, rw, rh, sheer ? 2 : 1, sheer);
    }
  }

  /** A small sheer-sided mesa: high ground you have to find the way up to. */
  function mesa(B) {
    const rng = B.rng;
    const rw = rng.int(2, 3), rh = 2;
    const x0 = rng.int(0, Math.max(0, B.w - rw)), y0 = rng.int(B.bandTop, Math.max(B.bandTop, B.bandBot - rh + 1));
    let top = 0;
    for (let y = y0; y < y0 + rh; y++) for (let x = x0; x < x0 + rw; x++) if (inb(B, x, y)) top = Math.max(top, B.cells[idx(B, x, y)].h);
    const target = Math.min(B.maxH, top + 2);
    for (let y = y0; y < y0 + rh; y++) {
      for (let x = x0; x < x0 + rw; x++) {
        if (!inb(B, x, y)) continue;
        const c = B.cells[idx(B, x, y)];
        if (c.lock & LOCK_ZONE) continue;
        c.h = target; c.cliff = true;
      }
    }
  }

  function dais(B) {
    const rng = B.rng, rw = rng.int(2, 3), rh = 2;
    const x0 = clamp(Math.floor((B.w - rw) / 2) + rng.int(-2, 2), 0, Math.max(0, B.w - rw));
    const y0 = clamp(Math.floor((B.bandTop + B.bandBot) / 2) - 1 + rng.int(0, 1), 0, Math.max(0, B.h - rh));
    raiseRect(B, x0, y0, rw, rh, 1, false);
  }

  /** Lower (or raise) tiles until every step is ≤ 1, except the sheer edges of cliff plateaus. */
  function smooth(B) {
    const cells = B.cells, n = B.n;
    for (let pass = 0; pass < 16; pass++) {
      let changed = false;
      for (let s = 0; s < n; s++) {
        const i = pass % 2 ? n - 1 - s : s, c = cells[i];
        const ns = nbrs(B, i);
        for (let k = 0; k < ns.length; k++) {
          const o = cells[ns[k]];
          if (c.h - o.h < 2) continue;
          if (c.cliff && !o.cliff && !(o.lock & LOCK_ZONE)) continue; // intentional cliff edge
          if (!(c.lock & LOCK_ZONE)) { c.h--; changed = true; }
          else if (!(o.lock & LOCK_ZONE)) { o.h++; changed = true; }
        }
      }
      if (!changed) break;
    }
  }

  function genHeights(B) {
    const rng = B.rng, cells = B.cells, w = B.w;
    if (B.maxH > 0) {
      if (B.style === 'hills') {
        const noise = valueNoise(rng, B.w, B.h, rng.int(3, 5));
        const raw = new Float32Array(B.n);
        let lo = Infinity, hi = -Infinity;
        for (let i = 0; i < B.n; i++) {
          const x = i % w, y = (i - x) / w;
          raw[i] = noise(x, y);
          if (raw[i] < lo) lo = raw[i];
          if (raw[i] > hi) hi = raw[i];
        }
        const span = hi - lo || 1;
        for (let i = 0; i < B.n; i++) {
          const v = Math.pow((raw[i] - lo) / span, 1.35);
          if (!(cells[i].lock & LOCK_ZONE)) cells[i].h = Math.min(B.maxH, Math.floor(v * (B.maxH + 1)));
        }
        if (rng.chance(B.gen.cliffs || 0)) mesa(B);
      } else if (B.style === 'terraces') {
        terraces(B);
      } else if (rng.chance(0.35)) {
        dais(B);
      }
    }
    for (let i = 0; i < B.n; i++) {
      const c = cells[i];
      if (c.zone === 'hero') c.h = B.heroH;
      else if (c.zone === 'enemy') c.h = B.enemyH;
      else {
        if (B.dHero[i] <= 2) c.h = Math.round(lerp(B.heroH, c.h, B.dHero[i] / 3));
        if (B.dEnemy[i] <= 1) c.h = Math.round(lerp(B.enemyH, c.h, B.dEnemy[i] / 2));
      }
    }
    smooth(B);
  }

  // =====================================================================================================
  // Terrain painting: liquids, chasms, walls, patches, surfaces
  // =====================================================================================================

  function canHazard(B, i, enemyGap) {
    const c = B.cells[i];
    if (c.lock & (LOCK_ZONE | LOCK_BUFFER | LOCK_KEEP)) return false;
    if (c.t !== null || c.obj) return false;
    return B.dEnemy[i] >= (enemyGap || 1) && B.dHero[i] >= 2;
  }

  /** Liquid tiles sit in a valley: banks step down to them, so anyone who falls in can climb out. */
  function valley(B, list, level, reach) {
    const cells = B.cells, isLiq = {};
    for (let k = 0; k < list.length; k++) { isLiq[list[k]] = 1; cells[list[k]].h = level; cells[list[k]].cliff = false; }
    let ring = list.slice();
    for (let r = 1; r <= reach; r++) {
      const next = [], seen = {};
      for (let k = 0; k < ring.length; k++) {
        const ns = nbrs(B, ring[k]);
        for (let m = 0; m < ns.length; m++) {
          const j = ns[m];
          if (isLiq[j] || seen[j]) continue;
          seen[j] = 1; next.push(j);
          const c = cells[j];
          if (c.lock & LOCK_ZONE) continue;
          if (c.h > level + r) { c.h = level + r; c.cliff = false; }
        }
      }
      for (let k = 0; k < next.length; k++) isLiq[next[k]] = 1;
      ring = next;
    }
  }

  function blob(B, center, r, keep, filter) {
    const out = [center], seen = {};
    seen[center] = 1;
    let head = 0;
    while (head < out.length) {
      const ns = nbrs(B, out[head++]);
      for (let k = 0; k < ns.length; k++) {
        const j = ns[k];
        if (seen[j]) continue;
        seen[j] = 1;
        if (mdist(B, j, center) > r || !filter(j) || !B.rng.chance(keep)) continue;
        out.push(j);
      }
    }
    return out;
  }

  function pickTile(B, filter, weight) {
    let total = 0;
    const cand = [], wts = [];
    for (let i = 0; i < B.n; i++) {
      if (!filter(i)) continue;
      const wt = weight ? weight(i) : 1;
      if (!(wt > 0)) continue;
      cand.push(i); wts.push(wt); total += wt;
    }
    if (!cand.length) return -1;
    let r = B.rng.next() * total;
    for (let k = 0; k < cand.length; k++) { r -= wts[k]; if (r < 0) return cand[k]; }
    return cand[cand.length - 1];
  }

  function rowOf(B, i) { return (i - (i % B.w)) / B.w; }
  function inBand(B, i) { const y = rowOf(B, i); return y >= B.bandTop && y <= B.bandBot; }

  /** Columns left open across a barrier: 2-3 chokepoints, sometimes two tiles wide. */
  function gapColumns(B) {
    const w = B.w, rng = B.rng;
    const g = w <= 9 ? 2 : rng.int(2, 3);
    const cols = {}, seg = w / g;
    for (let k = 0; k < g; k++) {
      const lo = Math.floor(k * seg) + (k === 0 ? 0 : 1);
      const hi = Math.max(lo, Math.floor((k + 1) * seg) - 1 - (k === g - 1 ? 0 : 1));
      const x = rng.int(lo, hi);
      cols[x] = true;
      if (rng.chance(0.35) && x + 1 <= hi) cols[x + 1] = true;
    }
    return cols;
  }

  function keepClear(B, x, y) {
    for (let dy = -1; dy <= 1; dy++) if (inb(B, x, y + dy)) B.cells[idx(B, x, y + dy)].lock |= LOCK_KEEP;
  }

  function barrierRow(B) {
    const span = B.bandBot - B.bandTop;
    return B.bandTop + Math.floor(span / 2) + (span % 2 === 1 ? B.rng.int(0, 1) : 0);
  }

  /** Mid-map barrier with gaps (chokepoints): wall line, object line, channel, river or chasm. */
  function buildBarrier(B) {
    const f = B.features, gen = B.gen, rng = B.rng;
    if (B.h < 8 || B.bandBot - B.bandTop < 2) return;
    const liquid = gen.liquid === 'lava' ? 'lava' : 'water';
    let spec = null;
    if (f.lava_river) spec = { kind: 'river', terrain: 'lava', crossing: 'bridge' };
    else if (f.river) spec = { kind: 'river', terrain: f.lava ? 'lava' : liquid, deep: liquid === 'water' ? (gen.deep || null) : null, crossing: 'bridge' };
    else if (f.channel) spec = { kind: 'channel', terrain: 'water', deep: gen.deep || 'deep_water', crossing: 'bridge' };
    else if (f.chasm) spec = { kind: 'chasm' };
    else if (f.water && gen.liquidStyle === 'channels') spec = { kind: 'channel', terrain: 'water', deep: gen.deep, crossing: 'bridge' };
    else if (f.water && gen.liquidStyle === 'rivers' && liquid === 'water') spec = { kind: 'river', terrain: 'water', deep: gen.deep, crossing: 'bridge' };
    else if (f.lava && gen.liquidStyle === 'rivers' && liquid === 'lava') spec = { kind: 'river', terrain: 'lava', crossing: 'bridge' };
    else if (gen.barrier && gen.barrier.kinds && gen.barrier.kinds.length) {
      const forced = f.chokepoint || f.bridge;
      if (forced || rng.chance(gen.barrier.chance || 0)) {
        let kinds = gen.barrier.kinds;
        if (f.bridge) {
          const wet = kinds.filter(function (k) { return k.kind === 'river' || k.kind === 'channel' || k.kind === 'chasm'; });
          kinds = wet.length ? wet : [{ kind: 'chasm' }];
        }
        spec = weightedSpec(kinds, rng);
      }
    }
    if (!spec) return;
    const by = barrierRow(B);
    B.barrierRow = by;
    B.meta.barrier = spec.kind;
    const gaps = gapColumns(B);
    const kind = spec.kind;
    if (kind === 'walls' || kind === 'objects' || kind === 'chasm') {
      for (let x = 0; x < B.w; x++) {
        const i = idx(B, x, by), c = B.cells[i];
        if (gaps[x]) {
          keepClear(B, x, by);
          if (kind === 'chasm' && rng.chance(0.5) && c.t === null) c.t = 'bridge';
          continue;
        }
        if (c.lock & (LOCK_ZONE | LOCK_KEEP) || c.t !== null || c.obj) continue;
        if (kind === 'walls' && frontEdge(B, i)) continue; // one more way through, and no wall in the camera's face
        if (kind === 'walls') c.t = B.wallT;
        else if (kind === 'chasm') c.t = 'pit';
        else {
          const id = weightedId(spec.ids && spec.ids.length ? spec.ids : B.theme.obstacles, null, rng);
          if (id) c.obj = makeObj(id, null, oi(B, id));
        }
      }
      return;
    }
    // liquid barriers
    const width = B.h >= 11 && rng.chance(0.5) && by + 1 <= B.bandBot ? 2 : 1;
    const tiles = [];
    const add = function (x, y) {
      if (!inb(B, x, y)) return;
      const i = idx(B, x, y);
      if (B.cells[i].lock & LOCK_ZONE) return;
      if (tiles.indexOf(i) < 0) tiles.push(i);
    };
    if (kind === 'channel') {
      for (let x = 0; x < B.w; x++) for (let k = 0; k < width; k++) add(x, by + k);
    } else {
      let y = by;
      const lo = B.bandTop + 1, hi = Math.max(B.bandTop + 1, B.bandBot - width);
      for (let x = 0; x < B.w; x++) {
        for (let k = 0; k < width; k++) add(x, y + k);
        if (x < B.w - 1 && rng.chance(0.3)) {
          const ny = clamp(y + (rng.chance(0.5) ? 1 : -1), lo, hi);
          if (ny !== y) { for (let k = 0; k < width; k++) add(x, ny + k); y = ny; }
        }
      }
    }
    const terrain = spec.terrain || liquid;
    const deep = spec.deep || null;
    const unsafe = terrain === 'lava' || !!deep;
    for (let k = 0; k < tiles.length; k++) {
      const i = tiles[k], c = B.cells[i], x = i % B.w;
      c.obj = null; c.surface = null;
      if (gaps[x]) {
        if (unsafe) c.t = terrain === 'lava' && rng.chance(0.35) ? 'obsidian' : spec.crossing || 'bridge';
        else c.t = rng.chance(0.5) ? 'bridge' : terrain;
        c.lock |= LOCK_KEEP;
      } else {
        c.t = deep && (kind === 'channel' || rng.chance(0.85)) ? deep : terrain;
      }
    }
    // the far bank and near bank of each crossing stay clear
    for (let k = 0; k < tiles.length; k++) {
      const i = tiles[k];
      if (!gaps[i % B.w]) continue;
      const ns = nbrs(B, i);
      for (let m = 0; m < ns.length; m++) if (tiles.indexOf(ns[m]) < 0) B.cells[ns[m]].lock |= LOCK_KEEP;
    }
    // the whole band (bridges and fords included) sits at level 0; banks step down to it
    valley(B, tiles, 0, 2);
  }

  function pools(B, spec) {
    const terrain = spec.terrain || B.gen.liquid || 'water';
    const count = rint(B.rng, spec.count, B.n >= 120 ? B.rng.int(1, 2) : 1);
    const ok = function (i) { return canHazard(B, i, 2); };
    for (let k = 0; k < count; k++) {
      const center = pickTile(B, function (i) { return ok(i) && B.dHero[i] >= 3; }, function (i) { return inBand(B, i) ? 3 : 1; });
      if (center < 0) return;
      const r = B.n >= 120 && B.rng.chance(0.5) ? 2 : 1;
      const tiles = blob(B, center, r, 0.65, ok);
      if (tiles.length < 2 && terrain !== 'mud') continue;
      let level = MAX_H;
      for (let m = 0; m < tiles.length; m++) level = Math.min(level, B.cells[tiles[m]].h);
      for (let m = 0; m < tiles.length; m++) {
        const c = B.cells[tiles[m]];
        c.t = terrain; c.obj = null; c.surface = null;
      }
      if (spec.deep && tiles.length >= 5) B.cells[center].t = spec.deep;
      valley(B, tiles, level, 1);
      if (spec.rim) {
        for (let m = 0; m < tiles.length; m++) {
          const ns = nbrs(B, tiles[m]);
          for (let q = 0; q < ns.length; q++) if (canHazard(B, ns[q], 1) && B.rng.chance(0.45)) B.cells[ns[q]].t = spec.rim;
        }
      }
    }
  }

  function pits(B, spec) {
    const count = rint(B.rng, spec.count, B.n >= 120 ? B.rng.int(1, 3) : B.rng.int(1, 2));
    const ok = function (i) { return canHazard(B, i, 1) && B.dHero[i] >= 3; };
    for (let k = 0; k < count; k++) {
      const seed = pickTile(B, ok, function (i) { return B.dEnemy[i] >= 1 && B.dEnemy[i] <= 4 ? 3 : 1; });
      if (seed < 0) return;
      if (spec.shape === 'grave') {
        // an open grave: a 1x2 hole with its headstone at one end
        const vertical = B.rng.chance(0.5), x = seed % B.w, y = rowOf(B, seed);
        const ox = vertical ? 0 : 1, oy = vertical ? 1 : 0;
        if (!inb(B, x + ox, y + oy) || !ok(idx(B, x + ox, y + oy))) { B.cells[seed].t = 'pit'; continue; }
        B.cells[seed].t = 'pit';
        B.cells[idx(B, x + ox, y + oy)].t = 'pit';
        const hx = x - ox, hy = y - oy;
        if (inb(B, hx, hy) && canHazard(B, idx(B, hx, hy), 1)) B.deferred.push({ kind: 'object', at: idx(B, hx, hy), id: 'gravestone' });
        continue;
      }
      const size = B.rng.int(1, 3), tiles = [seed];
      B.cells[seed].t = 'pit';
      for (let s = 1; s < size; s++) {
        const opts = [];
        for (let m = 0; m < tiles.length; m++) {
          const ns = nbrs(B, tiles[m]);
          for (let q = 0; q < ns.length; q++) if (ok(ns[q]) && opts.indexOf(ns[q]) < 0) opts.push(ns[q]);
        }
        if (!opts.length) break;
        const j = opts[Math.floor(B.rng.next() * opts.length) % opts.length];
        B.cells[j].t = 'pit';
        tiles.push(j);
      }
    }
  }

  function patches(B, spec) {
    const terrain = spec.terrain || 'mud';
    const count = rint(B.rng, spec.count, B.rng.int(1, B.n >= 120 ? 3 : 2));
    const ok = function (i) { return canHazard(B, i, 1); };
    for (let k = 0; k < count; k++) {
      const center = pickTile(B, ok, function (i) { return inBand(B, i) ? 2 : 1; });
      if (center < 0) return;
      const tiles = blob(B, center, B.rng.int(1, 2), 0.55, ok);
      for (let m = 0; m < tiles.length; m++) B.cells[tiles[m]].t = terrain;
    }
  }

  function canSurface(B, i) {
    const c = B.cells[i];
    if (c.lock & (LOCK_ZONE | LOCK_BUFFER | LOCK_KEEP) || c.surface || c.obj) return false;
    return isGround(B, c) && B.dEnemy[i] >= 1;
  }

  function surfacePatches(B, spec) {
    const id = spec.id;
    if (!id) return;
    const count = rint(B.rng, spec.count, B.rng.int(1, B.n >= 120 ? 3 : 2));
    const ok = function (i) { return canSurface(B, i); };
    for (let k = 0; k < count; k++) {
      const center = pickTile(B, ok, function (i) { return inBand(B, i) ? 3 : 1; });
      if (center < 0) return;
      const tiles = blob(B, center, 1, 0.6, ok);
      for (let m = 0; m < tiles.length; m++) B.cells[tiles[m]].surface = { id: id, turns: SURFACE_TURNS, data: {} };
    }
  }

  /** A magic circle: a plus of surface around a centre tile. */
  function circle(B, spec) {
    const id = spec.id || 'holy';
    const center = pickTile(B, function (i) {
      if (!canSurface(B, i) || !inBand(B, i)) return false;
      const ns = nbrs(B, i);
      if (ns.length < 4) return false;
      for (let k = 0; k < ns.length; k++) if (!canSurface(B, ns[k])) return false;
      return true;
    });
    if (center < 0) return;
    const tiles = [center].concat(nbrs(B, center));
    for (let k = 0; k < tiles.length; k++) B.cells[tiles[k]].surface = { id: id, turns: SURFACE_TURNS, data: {} };
  }

  function isBarrierKind(kind) { return kind === 'river' || kind === 'channel' || kind === 'chasm'; }

  function runHazard(B, spec) {
    if (!spec) return;
    B.meta.features.push(spec.kind + (spec.terrain ? ':' + spec.terrain : spec.id ? ':' + spec.id : ''));
    switch (spec.kind) {
      case 'pools': pools(B, spec); break;
      case 'pits': pits(B, spec); break;
      case 'patches': patches(B, spec); break;
      case 'surface': surfacePatches(B, spec); break;
      case 'circle': circle(B, spec); break;
      case 'walls': B.deferred.push({ kind: 'walls' }); break;
      case 'cluster': B.deferred.push({ kind: 'cluster', id: spec.id }); break;
      case 'spikes': B.deferred.push({ kind: 'spikes' }); break;
      default: break;
    }
  }

  function buildHazards(B) {
    const gen = B.gen, rng = B.rng, f = B.features;
    const list = (gen.hazards || []).filter(function (s) { return s && !isBarrierKind(s.kind); });
    const range = gen.hazardCount || [1, 2];
    let count = rint(rng, range, 1);
    // a river / channel / chasm across the map already is the map's first hazard
    if (isBarrierKind(B.meta.barrier)) count = Math.max(0, count - 1);
    if (f.open) count = Math.min(count, 1);
    const chosen = [], pool = list.slice();
    while (chosen.length < count && pool.length) {
      const s = weightedSpec(pool, rng);
      chosen.push(s);
      pool.splice(pool.indexOf(s), 1);
    }
    if (gen.extras && gen.extras.length && rng.chance(gen.extraChance !== undefined ? gen.extraChance : 0.5)) {
      chosen.push(weightedSpec(gen.extras, rng));
    }
    const liquid = gen.liquid === 'lava' ? 'lava' : 'water';
    const has = function (pred) { return chosen.some(pred); };
    if (f.water && B.meta.barrier !== 'channel' && B.meta.barrier !== 'river' && !has(function (s) { return s.kind === 'pools' && s.terrain === 'water'; })) {
      chosen.push({ kind: 'pools', terrain: 'water' });
    }
    if (f.lava && !f.lava_river && B.meta.barrier !== 'river' && !has(function (s) { return s.terrain === 'lava'; })) chosen.push({ kind: 'pools', terrain: 'lava' });
    if (f.deep) chosen.push({ kind: 'pools', terrain: 'water', deep: 'deep_water', count: 1 });
    if (f.pools && !has(function (s) { return s.kind === 'pools'; })) chosen.push({ kind: 'pools', terrain: liquid });
    if (f.pits && !has(function (s) { return s.kind === 'pits'; })) chosen.push({ kind: 'pits' });
    ['mud', 'ice', 'rubble'].forEach(function (t) {
      if (f[t] && !has(function (s) { return s.kind === 'patches' && s.terrain === t; })) chosen.push({ kind: 'patches', terrain: t });
    });
    B.surfaceFeatures.forEach(function (id) {
      if (!has(function (s) { return s.kind === 'surface' && s.id === id; })) chosen.push({ kind: 'surface', id: id });
    });
    Object.keys(f).forEach(function (k) {
      // other terrain named as a feature ("sand", "gold"...): a few patches of it
      if (k.indexOf('terrain:') !== 0) return;
      const t = k.slice(8);
      if (['mud', 'ice', 'rubble'].indexOf(t) < 0) chosen.push({ kind: 'patches', terrain: t });
    });
    if (f.walls && !has(function (s) { return s.kind === 'walls'; })) chosen.push({ kind: 'walls' });
    if (f.spikes) chosen.push({ kind: 'spikes' });
    for (let k = 0; k < chosen.length; k++) runHazard(B, chosen[k]);
  }

  // =====================================================================================================
  // Floors
  // =====================================================================================================

  function paintPatch(field, w, h, id, shape, rng) {
    let n = 0;
    const set = function (x, y) {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      const i = y * w + x;
      if (field[i] !== id) { field[i] = id; n++; }
    };
    if (shape === 'rect') {
      const rw = rng.int(2, 4), rh = rng.int(2, 3), x0 = rng.int(0, Math.max(0, w - rw)), y0 = rng.int(0, Math.max(0, h - rh));
      for (let y = y0; y < y0 + rh; y++) for (let x = x0; x < x0 + rw; x++) set(x, y);
    } else if (shape === 'strip') {
      const x0 = rng.int(1, Math.max(1, w - 2)), wide = rng.chance(0.4) ? 2 : 1;
      for (let y = 0; y < h; y++) for (let k = 0; k < wide; k++) set(x0 + k, y);
    } else if (shape === 'path') {
      let x = clamp(Math.floor(w / 2) + rng.int(-2, 2), 0, w - 1);
      for (let y = h - 1; y >= 0; y--) {
        set(x, y);
        if (rng.chance(0.4)) { const nx = clamp(x + (rng.chance(0.5) ? 1 : -1), 0, w - 1); set(nx, y); x = nx; }
      }
    } else {
      const cx = rng.int(0, w - 1), cy = rng.int(0, h - 1), r = rng.int(1, 2);
      for (let y = cy - r - 1; y <= cy + r + 1; y++) {
        for (let x = cx - r - 1; x <= cx + r + 1; x++) {
          const d = Math.abs(x - cx) + Math.abs(y - cy);
          if (d <= r || (d === r + 1 && rng.chance(0.35))) set(x, y);
        }
      }
    }
    return n;
  }

  /** Coherent floor patches (not salt-and-pepper noise): primary floor + patches of the others by weight. */
  function floorField(theme, w, h, rng) {
    const floors = theme.floors && theme.floors.length ? theme.floors : ['stone'];
    const weights = theme.floorWeights || floors.map(function () { return 1; });
    let pi = 0, total = 0;
    for (let i = 0; i < floors.length; i++) {
      total += Math.max(0, weights[i] || 0);
      if ((weights[i] || 0) > (weights[pi] || 0)) pi = i;
    }
    const field = new Array(w * h);
    for (let i = 0; i < field.length; i++) field[i] = floors[pi];
    const shapes = theme.floorPatch || {};
    for (let f = 0; f < floors.length; f++) {
      if (f === pi || !(weights[f] > 0)) continue;
      const target = Math.round(w * h * weights[f] / (total || 1) * 0.85);
      let placed = 0, guard = 0;
      const shape = shapes[floors[f]] || 'blob';
      const maxPatches = shape === 'strip' || shape === 'path' ? 1 + (w * h > 120 && rng.chance(0.3) ? 1 : 0) : 60;
      for (let p = 0; p < maxPatches && placed < target && guard++ < 60; p++) placed += paintPatch(field, w, h, floors[f], shape, rng);
    }
    return field;
  }

  function primaryFloor(B) {
    const floors = B.theme.floors && B.theme.floors.length ? B.theme.floors : ['stone'];
    const weights = B.theme.floorWeights || [];
    let pi = 0;
    for (let i = 0; i < floors.length; i++) if ((weights[i] || 1) > (weights[pi] || 1)) pi = i;
    return floors[pi];
  }

  /** Cheapest dry floor of the theme (deploy zones never get slow floors). */
  function cleanFloor(B) {
    const p = primaryFloor(B);
    if (ti(B, p).cost <= 1) return p;
    const floors = B.theme.floors || [];
    for (let i = 0; i < floors.length; i++) if (ti(B, floors[i]).cost <= 1 && !ti(B, floors[i]).liquid) return floors[i];
    return 'stone';
  }

  function assignFloorField(B) {
    const field = floorField(B.theme, B.w, B.h, B.rng);
    for (let i = 0; i < B.n; i++) B.cells[i].floor = field[i];
  }

  function fillFloors(B) {
    const raised = B.theme.raisedFloor || null, raisedMin = Math.max(1, B.theme.raisedMin || 1);
    for (let i = 0; i < B.n; i++) {
      const c = B.cells[i];
      if (c.t !== null) continue;
      let t = c.floor || primaryFloor(B);
      if (c.lock & LOCK_ZONE) {
        const inf = ti(B, t);
        if (inf.cost > 1 || inf.liquid || !inf.walkable) t = cleanFloor(B);
      } else if (raised && c.h >= raisedMin) {
        t = raised;
      }
      c.t = t;
    }
  }

  // =====================================================================================================
  // Repair: make every guarantee hold (heights first, then carving, then plugging pockets)
  // =====================================================================================================

  function fixHeights(B, a) {
    const cells = B.cells, cands = [];
    const consider = function (u, isTrap) {
      const ns = nbrs(B, u);
      for (let k = 0; k < ns.length; k++) {
        const m = ns[k];
        const good = isTrap ? a.exit[m] && a.walk[m] : a.main[m];
        if (!good) continue;
        const du = cells[u].h - cells[m].h;
        if (!isTrap && !a.fwd[u] && du >= 2) cands.push({ u: u, m: m, kind: 'lower' });
        if (!a.bwd[u] && -du >= 2) cands.push({ u: u, m: m, kind: 'raise' });
        if (isTrap && -du >= 2) cands.push({ u: u, m: m, kind: 'raise' });
      }
    };
    for (let k = 0; k < a.pockets.length; k++) consider(a.pockets[k], false);
    for (let k = 0; k < a.zoneOut.length; k++) if (a.safe[a.zoneOut[k]]) consider(a.zoneOut[k], false);
    for (let k = 0; k < a.traps.length; k++) consider(a.traps[k], true);
    if (!cands.length) return false;
    const c = cands[Math.floor(B.rng.next() * cands.length) % cands.length];
    const U = cells[c.u], M = cells[c.m];
    const lockedU = U.lock & LOCK_ZONE, lockedM = M.lock & LOCK_ZONE;
    if (c.kind === 'lower') {
      if (!lockedU) U.h = M.h + 1; else if (!lockedM) M.h = U.h - 1; else return false;
    } else {
      if (!lockedU) U.h = M.h - 1; else if (!lockedM) M.h = U.h + 1; else return false;
    }
    U.cliff = false; M.cliff = false;
    return true;
  }

  function blockCost(B, c) {
    if (isSafe(B, c)) return 1;
    const t = ti(B, c.t);
    if (c.obj && objBlocks(B, c.obj)) return 4;
    if (isWalk(B, c)) return 3;
    if (t.pit) return 7;
    if (t.liquid) return 7;
    return 6;
  }

  /** Dig the cheapest corridor from the main region to a stranded tile, converting blockers on the way. */
  function carve(B, a) {
    const n = B.n, cells = B.cells;
    const targets = {};
    let any = false;
    a.pockets.concat(a.zoneOut, a.traps).forEach(function (i) { targets[i] = 1; any = true; });
    if (!any) return false;
    const dist = new Float64Array(n), prev = new Int32Array(n), done = new Uint8Array(n);
    for (let i = 0; i < n; i++) { dist[i] = Infinity; prev[i] = -1; }
    for (let i = 0; i < n; i++) if (a.main[i]) dist[i] = 0;
    let found = -1;
    for (let iter = 0; iter < n; iter++) {
      let u = -1, best = Infinity;
      for (let i = 0; i < n; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
      if (u < 0) break;
      done[u] = 1;
      if (targets[u]) { found = u; break; }
      const ns = nbrs(B, u);
      for (let k = 0; k < ns.length; k++) {
        const v = ns[k];
        if (done[v]) continue;
        const cv = cells[v];
        const cost = targets[v] ? 1 : (cv.lock & LOCK_ZONE ? 1 : blockCost(B, cv));
        if (dist[u] + cost < dist[v]) { dist[v] = dist[u] + cost; prev[v] = u; }
      }
    }
    if (found < 0) return false;
    const path = [];
    for (let v = found; v >= 0 && !a.main[v]; v = prev[v]) path.unshift(v);
    const start = prev[path[0]];
    let lastH = start >= 0 ? cells[start].h : cells[path[0]].h;
    let changed = false;
    for (let k = 0; k < path.length; k++) {
      const c = cells[path[k]];
      if (!(c.lock & LOCK_ZONE)) {
        if (c.obj && (objBlocks(B, c.obj) || objHazard(B, c.obj))) { c.obj = null; changed = true; }
        if (c.surface && surfHazard(B, c.surface.id)) { c.surface = null; changed = true; }
        const t = ti(B, c.t);
        if (!t.walkable || t.pit) { c.t = t.pit || t.liquid ? 'bridge' : null; changed = true; }
        else if (t.liquid === 'lava' || t.liquid === 'deep') { c.t = 'bridge'; changed = true; }
        else if (t.hazard) { c.t = null; changed = true; }
        const nh = clamp(c.h, lastH - 1, lastH + 1);
        if (nh !== c.h) { c.h = nh; c.cliff = false; changed = true; }
      }
      lastH = c.h;
    }
    if (changed) fillFloors(B);
    return changed;
  }

  /** Last resort: fill stranded tiles so they are no longer walkable. */
  function plug(B, a) {
    let changed = false;
    const filler = B.gen.filler && oi(B, B.gen.filler).blocksMove ? B.gen.filler : 'rock';
    a.pockets.concat(a.traps).forEach(function (i) {
      const c = B.cells[i];
      if (c.lock & LOCK_ZONE) return;
      if (isGround(B, c) && !c.obj && oi(B, filler).blocksMove) c.obj = makeObj(filler, null, oi(B, filler));
      else { c.t = B.wallT; c.obj = null; }
      c.surface = null;
      changed = true;
    });
    return changed;
  }

  function repair(B) {
    for (let iter = 0; iter < 120; iter++) {
      const a = analyze(B);
      if (a.ok) return true;
      if (fixHeights(B, a)) continue;
      if (carve(B, a)) continue;
      if (plug(B, a)) continue;
      return false;
    }
    return analyze(B).ok;
  }

  // =====================================================================================================
  // Objects
  // =====================================================================================================

  function canObj(B, i) {
    const c = B.cells[i];
    if (c.obj || c.surface || c.lock & (LOCK_ZONE | LOCK_KEEP)) return false;
    return isGround(B, c);
  }

  /** Place an object; blocking/hazard objects are rolled back if they would break connectivity. */
  function tryObj(B, i, id, extra) {
    if (!id || !canObj(B, i)) return false;
    const info = oi(B, id), c = B.cells[i];
    c.obj = makeObj(id, extra, info);
    if ((objBlocks(B, c.obj) || objHazard(B, c.obj)) && !analyze(B).ok) { c.obj = null; return false; }
    return true;
  }

  function placeSome(B, count, filter, weight, idFn, after) {
    const bad = {};
    let placed = 0, guard = 0;
    while (placed < count && guard++ < count * 8 + 12) {
      const i = pickTile(B, function (j) { return !bad[j] && canObj(B, j) && filter(j); }, weight);
      if (i < 0) break;
      if (tryObj(B, i, idFn(i))) { placed++; if (after) after(i); } else bad[i] = 1;
    }
    return placed;
  }

  function nearestObjDist(B, i, cap) {
    const x = i % B.w, y = rowOf(B, i);
    let best = cap;
    for (let dy = -cap; dy <= cap; dy++) {
      for (let dx = -cap; dx <= cap; dx++) {
        const d = Math.abs(dx) + Math.abs(dy);
        if (d === 0 || d >= best || !inb(B, x + dx, y + dy)) continue;
        const c = B.cells[idx(B, x + dx, y + dy)];
        if (c.obj || !isWalk(B, c) && c.t === B.wallT) best = d;
      }
    }
    return best;
  }

  function elevEdge(B, i) {
    const ns = nbrs(B, i), h = B.cells[i].h;
    for (let k = 0; k < ns.length; k++) if (B.cells[ns[k]].h !== h) return true;
    return false;
  }

  function walkNeighbors(B, i) {
    const ns = nbrs(B, i);
    let n = 0;
    for (let k = 0; k < ns.length; k++) if (isSafe(B, B.cells[ns[k]])) n++;
    return n;
  }

  function placeObstacles(B) {
    const g = B.gen, rng = B.rng, ids = B.theme.obstacles || [], wts = B.theme.obstacleWeights;
    if (!ids.length) return;
    let target = Math.round(B.n * (g.obstacleDensity !== undefined ? g.obstacleDensity : 0.08) * B.density * rng.float(0.85, 1.15));
    if (B.features.cover) target = Math.round(target * 1.5);
    if (B.features.open) target = Math.round(target * 0.45);
    const weight = function (i) {
      let w = inBand(B, i) ? 3 : 1;
      if (B.cells[i].lock & LOCK_BUFFER) w *= 1.4;
      if (elevEdge(B, i)) w *= 1.5;
      return w * (0.25 + nearestObjDist(B, i, 3));
    };
    const bad = {};
    let placed = 0, guard = 0;
    while (placed < target && guard++ < target * 8 + 12) {
      const seed = pickTile(B, function (j) { return !bad[j] && canObj(B, j); }, weight);
      if (seed < 0) break;
      if (!tryObj(B, seed, weightedId(ids, wts, rng))) { bad[seed] = 1; continue; }
      placed++;
      // grow small clusters: two crates are cover, one crate is a suggestion
      const extra = rng.int(0, 2);
      let at = seed;
      for (let k = 0; k < extra && placed < target; k++) {
        const opts = nbrs(B, at).filter(function (j) { return canObj(B, j) && !(B.cells[j].lock & LOCK_BUFFER); });
        if (!opts.length) break;
        const j = opts[Math.floor(rng.next() * opts.length) % opts.length];
        if (tryObj(B, j, weightedId(ids, wts, rng))) { placed++; at = j; }
      }
    }
  }

  function hasNearSurface(B, i, ids) {
    const ns = nbrs(B, i);
    for (let k = 0; k < ns.length; k++) { const s = B.cells[ns[k]].surface; if (s && ids.indexOf(s.id) >= 0) return true; }
    return false;
  }

  function placeInteractive(B) {
    const g = B.gen, rng = B.rng, f = B.features;
    // explosive barrels: near the enemies, far from the heroes (aim, push, boom)
    let boom = rint(rng, g.explosive, 0);
    if (f.explosive) boom = Math.max(boom, 1) + 2;
    if (boom > 0) {
      placeSome(B, boom, function (i) { return B.dHero[i] >= 4; }, function (i) {
        return (B.dEnemy[i] <= 3 ? 4 : 1) * (hasNearSurface(B, i, ['oil']) ? 3 : 1);
      }, function () { return 'barrel_explosive'; }, function (i) {
        if (!rng.chance(0.35)) return;
        const opts = nbrs(B, i).filter(function (j) { return canObj(B, j) && B.dHero[j] >= 4; });
        if (opts.length) tryObj(B, opts[Math.floor(rng.next() * opts.length) % opts.length], 'barrel_explosive');
      });
    }
    // braziers: next to something flammable when possible
    let fires = rint(rng, g.braziers, 0);
    if (f.braziers) fires += 1;
    if (fires > 0) {
      placeSome(B, fires, function (i) { return B.dHero[i] >= 3; }, function (i) {
        return (hasNearSurface(B, i, ['oil', 'web']) ? 6 : 1) * (inBand(B, i) ? 2 : 1);
      }, function () { return 'brazier'; });
    }
    // the occasional chest, tucked somewhere slightly out of the way
    if (f.chest || rng.chance(g.chest || 0)) {
      placeSome(B, 1, function (i) { return B.dHero[i] >= 4 && walkNeighbors(B, i) >= 1; }, function (i) {
        const x = i % B.w;
        return (x <= 1 || x >= B.w - 2 ? 3 : 1) * (B.cells[i].h >= 1 ? 2 : 1) * (rowOf(B, i) <= Math.floor(B.h / 2) ? 2 : 1);
      }, function () { return 'chest'; });
    }
    if (f.fountain) {
      placeSome(B, 1, function (i) { return B.dHero[i] >= 2 && B.dHero[i] <= 5 && walkNeighbors(B, i) >= 2; }, null, function () { return 'fountain'; });
    }
    // object features ("trees", "gravestones", "crates"...)
    B.objFeatures.forEach(function (id) {
      placeSome(B, rng.int(2, 4), function () { return true; }, function (i) { return inBand(B, i) ? 2 : 1; }, function () { return id; });
    });
  }

  function placeRequired(B) {
    B.required.forEach(function (req) {
      if (!req || !req.id) return;
      const count = clamp(Math.round(+req.count) || 1, 1, 12);
      const where = req.where || 'enemy';
      const placed = [];
      const inner = function (i) { const x = i % B.w, y = rowOf(B, i); return x > 0 && y > 0 && x < B.w - 1 && y < B.h - 1; };
      const filter = function (i) {
        if (walkNeighbors(B, i) < 2 || !inner(i)) return false;
        if (where === 'hero') return B.dHero[i] >= 2 && B.dHero[i] <= 4;
        if (where === 'mid') return inBand(B, i);
        if (where === 'enemy') return rowOf(B, i) <= Math.floor(B.h / 2) && B.dHero[i] >= 4;
        return true;
      };
      // objective objects keep their surroundings open: they must stay reachable for interactions and smashing
      const guard = function (i) {
        placed.push(i);
        nbrs(B, i).forEach(function (j) { if (!B.cells[j].obj) B.cells[j].lock |= LOCK_KEEP; });
      };
      const weight = function (i) {
        let d = 4;
        for (let k = 0; k < placed.length; k++) d = Math.min(d, mdist(B, i, placed[k]));
        let w = 0.2 + d * d;
        if (where === 'hero') w *= 1 + Math.max(0, 3 - Math.abs((i % B.w) - (B.w - 1) / 2));
        return w;
      };
      placeSome(B, count, filter, weight, function () { return req.id; }, guard);
      // relax the placement rules rather than ship an unwinnable objective
      if (placed.length < count) {
        placeSome(B, count - placed.length, function (i) { return B.dHero[i] >= 2 && inner(i) && walkNeighbors(B, i) >= 2; }, weight, function () { return req.id; }, guard);
      }
      if (placed.length < count) {
        placeSome(B, count - placed.length, function (i) { return B.dHero[i] >= 1 && walkNeighbors(B, i) >= 1; }, weight, function () { return req.id; }, guard);
      }
      B.meta.required.push({ id: req.id, wanted: count, placed: placed.length });
    });
  }

  function placeDecor(B) {
    const ids = B.theme.decor || [], rng = B.rng;
    if (!ids.length) return;
    const count = Math.round(B.n * (B.gen.decorDensity || 0) * B.density * rng.float(0.7, 1.3));
    if (count <= 0) return;
    placeSome(B, count, function (i) { return !(B.cells[i].lock & LOCK_BUFFER); }, function (i) {
      const x = i % B.w, y = rowOf(B, i);
      return (x === 0 || y === 0 || x === B.w - 1 || y === B.h - 1 ? 2 : 1) * (nearestObjDist(B, i, 2) <= 1 ? 2 : 1);
    }, function () { return weightedId(ids, B.theme.decorWeights, rng); });
  }

  function runDeferred(B) {
    const rng = B.rng;
    B.deferred.forEach(function (d) {
      if (d.kind === 'object') { tryObj(B, d.at, d.id); return; }
      if (d.kind === 'walls') {
        const segs = rng.int(1, B.n >= 120 ? 3 : 2);
        for (let s = 0; s < segs; s++) {
          for (let attempt = 0; attempt < 6; attempt++) {
            const len = rng.int(2, 4), horiz = rng.chance(0.5);
            const x0 = rng.int(0, B.w - 1), y0 = rng.int(B.bandTop, B.bandBot);
            const tiles = [];
            let ok = true;
            for (let k = 0; k < len && ok; k++) {
              const x = x0 + (horiz ? k : 0), y = y0 + (horiz ? 0 : k);
              if (!inb(B, x, y)) { ok = false; break; }
              const i = idx(B, x, y), c = B.cells[i];
              if (c.lock & (LOCK_ZONE | LOCK_BUFFER | LOCK_KEEP) || c.obj || c.surface || !isGround(B, c) || B.dEnemy[i] < 1 || frontEdge(B, i)) ok = false;
              else tiles.push(i);
            }
            if (!ok || !tiles.length) continue;
            const saved = tiles.map(function (i) { return B.cells[i].t; });
            tiles.forEach(function (i) { B.cells[i].t = B.wallT; });
            if (analyze(B).ok) break;
            tiles.forEach(function (i, k) { B.cells[i].t = saved[k]; });
          }
        }
        return;
      }
      if (d.kind === 'cluster') {
        const clusters = rng.int(1, 2);
        for (let k = 0; k < clusters; k++) {
          const seed = pickTile(B, function (i) { return canObj(B, i) && inBand(B, i) && !(B.cells[i].lock & LOCK_BUFFER); });
          if (seed < 0) return;
          if (!tryObj(B, seed, d.id)) continue;
          const extra = rng.int(1, 3);
          for (let m = 0; m < extra; m++) {
            const opts = nbrs(B, seed).filter(function (j) { return canObj(B, j); });
            if (!opts.length) break;
            tryObj(B, opts[Math.floor(rng.next() * opts.length) % opts.length], d.id);
          }
        }
        return;
      }
      if (d.kind === 'spikes') {
        placeSome(B, rng.int(2, 4), function (i) { return inBand(B, i) && B.dHero[i] >= 3; }, null, function () { return 'spikes'; });
      }
    });
  }

  // =====================================================================================================
  // Orientation & dressing
  // =====================================================================================================

  function transform(B, mirrorX, flipY, transpose) {
    if (mirrorX || flipY || transpose) {
      const cw = B.w, ch = B.h, nw = transpose ? ch : cw, nh = transpose ? cw : ch;
      const out = new Array(nw * nh);
      for (let ny = 0; ny < nh; ny++) {
        for (let nx = 0; nx < nw; nx++) {
          let cx = transpose ? ny : nx, cy = transpose ? nx : ny;
          if (mirrorX) cx = cw - 1 - cx;
          if (flipY) cy = ch - 1 - cy;
          out[ny * nw + nx] = B.cells[cy * cw + cx];
        }
      }
      B.cells = out; B.w = nw; B.h = nh;
    }
    zoneDistances(B);
  }

  /**
   * True when canonical cell i ends up on a camera-facing edge (final S or E) after the transform. Tall walls
   * stay off those edges so they never hide the battlefield behind them.
   */
  function frontEdge(B, i) {
    if (B.mirrorX === undefined) return false;
    let cx = i % B.w, cy = rowOf(B, i);
    if (B.mirrorX) cx = B.w - 1 - cx;
    if (B.flipY) cy = B.h - 1 - cy;
    const nx = B.transpose ? cy : cx, ny = B.transpose ? cx : cy;
    const nw = B.transpose ? B.h : B.w, nh = B.transpose ? B.w : B.h;
    return nx === nw - 1 || ny === nh - 1;
  }

  /** Walls / trees / fences along the two back edges (N and W: the top of the screen) frame the scene. */
  function dressBorder(B) {
    const spec = B.gen.border, rng = B.rng;
    if (!spec || !(spec.chance > 0) || B.features.open) return;
    const edge = [];
    for (let x = 0; x < B.w; x++) edge.push(idx(B, x, 0));
    for (let y = 1; y < B.h; y++) edge.push(idx(B, 0, y));
    let on = rng.chance(spec.chance);
    for (let k = 0; k < edge.length; k++) {
      if (rng.chance(0.3)) on = rng.chance(spec.chance);
      if (!on) continue;
      const i = edge[k], c = B.cells[i];
      if (spec.kind === 'wall') {
        if (c.lock & (LOCK_ZONE | LOCK_KEEP) || c.obj || c.surface || !isGround(B, c) || B.dHero[i] <= 1 || B.dEnemy[i] <= 0) continue;
        const saved = c.t;
        c.t = B.wallT;
        if (!analyze(B).ok) c.t = saved;
      } else if (B.dHero[i] > 1) {
        tryObj(B, i, weightedId(spec.ids || B.theme.obstacles, null, rng));
      }
    }
  }

  // =====================================================================================================
  // Output
  // =====================================================================================================

  function centroid(tiles) {
    let sx = 0, sy = 0;
    for (let k = 0; k < tiles.length; k++) { sx += tiles[k].x; sy += tiles[k].y; }
    return tiles.length ? { x: sx / tiles.length, y: sy / tiles.length } : null;
  }

  /** Zone tiles, best deploy spots first (centre of the zone, then the side facing the other zone). */
  function sortedZone(tiles, zone, other) {
    const list = tiles.filter(function (t) { return t.zone === zone; }).map(function (t) { return { x: t.x, y: t.y }; });
    const c = centroid(list);
    if (!c) return list;
    list.sort(function (a, b) {
      const da = Math.abs(a.x - c.x) + Math.abs(a.y - c.y), db = Math.abs(b.x - c.x) + Math.abs(b.y - c.y);
      if (da !== db) return da - db;
      if (other) {
        const fa = Math.abs(a.x - other.x) + Math.abs(a.y - other.y), fb = Math.abs(b.x - other.x) + Math.abs(b.y - other.y);
        if (fa !== fb) return fa - fb;
      }
      return a.y - b.y || a.x - b.x;
    });
    return list;
  }

  function finish(B, extraMeta) {
    const tiles = new Array(B.n), pf = primaryFloor(B);
    for (let y = 0; y < B.h; y++) {
      for (let x = 0; x < B.w; x++) {
        const i = y * B.w + x, c = B.cells[i];
        tiles[i] = {
          x: x, y: y, h: clamp(Math.round(c.h) || 0, 0, MAX_H), t: c.t || pf,
          surface: c.surface ? { id: c.surface.id, turns: c.surface.turns !== undefined ? c.surface.turns : SURFACE_TURNS, data: c.surface.data || {} } : null,
          obj: c.obj || null, zone: c.zone || null, tag: c.tag || null,
        };
      }
    }
    const heroTiles = tiles.filter(function (t) { return t.zone === 'hero'; });
    const enemyTiles = tiles.filter(function (t) { return t.zone === 'enemy'; });
    const heroZone = sortedZone(tiles, 'hero', centroid(enemyTiles));
    const enemyZone = sortedZone(tiles, 'enemy', centroid(heroTiles));
    const meta = Object.assign({ style: B.style }, B.meta, extraMeta || {});
    return { grid: { w: B.w, h: B.h, tiles: tiles }, heroZone: heroZone, enemyZone: enemyZone, theme: B.theme.id, meta: meta };
  }

  // =====================================================================================================
  // Features
  // =====================================================================================================

  function singular(s) {
    if (/ies$/.test(s)) return s.slice(0, -3) + 'y';
    if (/ves$/.test(s)) return s.slice(0, -3) + 'f';
    if (/(ses|xes|ches|shes)$/.test(s)) return s.slice(0, -2);
    if (/s$/.test(s) && !/ss$/.test(s)) return s.slice(0, -1);
    return s;
  }
  function knownObject(id) { return CANON_OBJECTS.indexOf(id) >= 0 || !!(DD.getObject && DD.getObject(id)); }
  function knownTerrain(id) { return !!FALLBACK_TERRAIN[id] || !!FLOOR_SET[id] || !!(DD.getTerrain && DD.getTerrain(id)); }
  function knownSurface(id) { return CANON_SURFACES.indexOf(id) >= 0 || !!(DD.getSurface && DD.getSurface(id)); }

  /** Normalize map.features into { flags, objects: [ids], surfaces: [ids], unknown: [strings] }. */
  function parseFeatures(list) {
    const out = { flags: {}, objects: [], surfaces: [], unknown: [] };
    (Array.isArray(list) ? list : list ? [list] : []).forEach(function (raw) {
      if (typeof raw !== 'string' || !raw.trim()) return;
      const s = raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
      let key = FEATURE_ALIASES[s] || FEATURE_ALIASES[singular(s)] || null;
      if (!key) {
        const one = singular(s);
        if (knownObject(s)) key = 'obj:' + s;
        else if (knownObject(one)) key = 'obj:' + one;
        else if (knownSurface(s)) key = 'surface:' + s;
        else if (knownTerrain(s)) key = s === 'water' ? 'water' : s === 'lava' ? 'lava' : s === 'pit' ? 'pits' : 'terrain:' + s;
        else if (knownTerrain(one)) key = 'terrain:' + one;
      }
      if (!key) { out.unknown.push(raw); return; }
      if (key.indexOf('obj:') === 0) { const id = key.slice(4); if (out.objects.indexOf(id) < 0) out.objects.push(id); }
      else if (key.indexOf('surface:') === 0) { const id = key.slice(8); if (out.surfaces.indexOf(id) < 0) out.surfaces.push(id); }
      else if (key.indexOf('terrain:') === 0) { out.flags[key.slice(8)] = true; out.flags['terrain:' + key.slice(8)] = true; }
      else out.flags[key] = true;
    });
    return out;
  }

  // =====================================================================================================
  // Generate
  // =====================================================================================================

  function applyStyle(B, f) {
    const gen = B.gen;
    B.style = f.flat ? 'flat' : f.terraces ? 'terraces' : f.hills || f.cliffs ? 'hills' : (gen.elevation || 'flat');
    B.maxH = clamp(gen.maxH !== undefined ? gen.maxH : 2, 0, MAX_H);
    if (f.flat) B.maxH = Math.min(B.maxH, 1);
    if (f.hills || f.terraces || f.cliffs) B.maxH = Math.max(B.maxH, 3);
    if (f.cliffs) B.gen = Object.assign({}, gen, { cliffs: Math.max(gen.cliffs || 0, 0.8) });
  }

  function setupCtx(theme, W, H, rng, opts, parsed) {
    const side = { N: 1, E: 1, S: 1, W: 1 }[opts.heroSide] ? opts.heroSide : (rng.chance(0.5) ? 'S' : 'E');
    const transpose = side === 'E' || side === 'W';
    const B = makeCtx(transpose ? H : W, transpose ? W : H, rng, theme);
    B.features = parsed.flags;
    B.objFeatures = parsed.objects;
    B.surfaceFeatures = parsed.surfaces;
    B.meta.unknownFeatures = parsed.unknown.slice();
    B.density = typeof opts.density === 'number' && isFinite(opts.density) ? clamp(opts.density, 0, 3) : 1;
    B.required = Array.isArray(opts.objects) ? opts.objects.filter(function (o) { return o && typeof o.id === 'string'; }) : [];
    B.side = side;
    B.flipY = side === 'N' || side === 'W';
    B.transpose = transpose;
    B.mirrorX = rng.chance(0.5);
    return B;
  }

  function tryGenerate(theme, W, H, rng, opts, parsed) {
    const B = setupCtx(theme, W, H, rng, opts, parsed);
    applyStyle(B, B.features);
    reserveZones(B, opts.enemyZoneSize);
    assignFloorField(B);
    genHeights(B);
    buildBarrier(B);
    buildHazards(B);
    fillFloors(B);
    if (!repair(B)) return null;
    placeRequired(B);
    runDeferred(B);
    placeObstacles(B);
    placeInteractive(B);
    placeDecor(B);
    transform(B, B.mirrorX, B.flipY, B.transpose);
    dressBorder(B);
    fillFloors(B);
    if (!analyze(B).ok) return null;
    return finish(B, { heroSide: B.side, enemySide: { S: 'N', N: 'S', E: 'W', W: 'E' }[B.side] });
  }

  /** Flat, hazard-free map with a little cover. Always valid. */
  function fallbackMap(theme, W, H, rng, opts) {
    const B = setupCtx(theme, W, H, rng, opts, { flags: {}, objects: [], surfaces: [], unknown: [] });
    B.style = 'flat'; B.maxH = 0;
    B.gen = Object.assign({}, B.gen, { obstacleDensity: 0.05, zoneH: { hero: [0, 0], enemy: [0, 0] } });
    reserveZones(B, opts.enemyZoneSize);
    assignFloorField(B);
    fillFloors(B);
    placeObstacles(B);
    placeRequired(B);
    transform(B, B.mirrorX, B.flipY, B.transpose);
    return finish(B, { heroSide: B.side, enemySide: { S: 'N', N: 'S', E: 'W', W: 'E' }[B.side], fallback: true });
  }

  /**
   * Procedural map. opts: { theme, w, h, rng | seed, features: [strings], density (0..3, default 1),
   *   heroSide: 'S'|'E'|'N'|'W' (default random S/E), objects: [{ id, count, where: 'enemy'|'hero'|'mid'|'any' }],
   *   enemyZoneSize: tiles wanted in the enemy zone (default 8) }.
   */
  MapGen.generate = function (opts) {
    opts = opts || {};
    const theme = themeById(opts.theme);
    const rng = opts.rng && typeof opts.rng.next === 'function' ? opts.rng : DD.RNG(opts.seed !== undefined ? opts.seed : 1);
    let W = clampInt(opts.w, MIN_SIZE, MAX_SIZE, 0), H = clampInt(opts.h, MIN_SIZE, MAX_SIZE, 0);
    if (!W && !H) { W = rng.int(10, 12); H = W + rng.int(-1, 1); }
    else if (!W) W = H;
    else if (!H) H = W;
    const parsed = parseFeatures(opts.features);
    if (parsed.unknown.length && DD.debug) DD.warn('MapGen: unknown map features ignored: ' + parsed.unknown.join(', '));
    for (let attempt = 0; attempt < 6; attempt++) {
      const r = attempt === 0 ? rng : rng.fork('mapgen-retry-' + attempt);
      const res = DD.safe('MapGen.generate', tryGenerate, null, [theme, W, H, r, opts, parsed]);
      if (res) { res.meta.attempts = attempt + 1; return res; }
    }
    const fb = fallbackMap(theme, W, H, rng.fork('mapgen-fallback'), opts);
    fb.meta.attempts = 7;
    return fb;
  };

  // =====================================================================================================
  // Layouts
  // =====================================================================================================

  function toRows(v) {
    if (Array.isArray(v)) return v.map(function (r) { return r === null || r === undefined ? '' : String(r); });
    if (typeof v === 'string') return v.split(/\r?\n/);
    return [];
  }

  function resolveTerrain(B, t, floor) {
    if (t === undefined || t === null || t === 'floor' || t === '') return floor;
    if (t === 'wall' || t === 'walls') return B.wallT;
    if (t === 'liquid') return B.gen.liquid || 'water';
    if (t === 'deep') return B.gen.deep || 'deep_water';
    return String(t);
  }

  function resolveObjEntry(B, o) {
    if (!o) return null;
    if (typeof o === 'string') {
      if (o === 'obstacle') return makeObj(weightedId(B.theme.obstacles || ['crate'], B.theme.obstacleWeights, B.rng));
      if (o === 'decor') return B.theme.decor && B.theme.decor.length ? makeObj(weightedId(B.theme.decor, B.theme.decorWeights, B.rng)) : null;
      return makeObj(o);
    }
    if (typeof o === 'object' && typeof o.id === 'string') return makeObj(o.id, o);
    return null;
  }

  function resolveSurfaceEntry(s, turns) {
    if (!s) return null;
    if (typeof s === 'string') return { id: s, turns: turns !== undefined ? turns : SURFACE_TURNS, data: {} };
    if (typeof s === 'object' && typeof s.id === 'string') {
      return { id: s.id, turns: s.turns !== undefined ? s.turns : (turns !== undefined ? turns : SURFACE_TURNS), data: s.data || {} };
    }
    return null;
  }

  function legendEntry(B, legend, ch) {
    const e = Object.prototype.hasOwnProperty.call(legend, ch) ? legend[ch] : undefined;
    if (e === undefined || e === null) return null;
    if (typeof e === 'string') {
      if (knownTerrain(e) || e === 'floor' || e === 'wall') return { terrain: e };
      if (knownObject(e)) return { obj: e };
      return { terrain: e };
    }
    return typeof e === 'object' ? e : null;
  }

  /** Auto deploy zone for layouts that forgot one: clean tiles nearest the middle of the bottom/top rows. */
  function autoZone(B, zone, fromBottom) {
    const want = zone === 'hero' ? 8 : 10;
    const picks = [];
    for (let r = 0; r < Math.min(3, B.h) && picks.length < want; r++) {
      const y = fromBottom ? B.h - 1 - r : r;
      const row = [];
      for (let x = 0; x < B.w; x++) {
        const c = B.cells[idx(B, x, y)];
        if (!c.zone && isClean(B, c)) row.push(x);
      }
      row.sort(function (a, b) { return Math.abs(a - (B.w - 1) / 2) - Math.abs(b - (B.w - 1) / 2) || a - b; });
      for (let k = 0; k < row.length && picks.length < want; k++) picks.push(idx(B, row[k], y));
    }
    picks.forEach(function (i) { B.cells[i].zone = zone; });
    return picks.length;
  }

  /**
   * Hand-made map. layoutDef: { theme, layout: [rows], heights: [rows of digits], legend: { char: { terrain, obj,
   * h, zone, surface, mark, tag, turns } } }. Custom legend entries replace the default entry for that char.
   * terrain may be a terrain id or 'floor' | 'wall' | 'liquid' | 'deep' (theme-resolved); obj may be an id,
   * 'obstacle' / 'decor' (random theme object) or { id, ...instance overrides }. A legend `h` beats the heights
   * row. Unknown chars are plain floor. Every char's positions are returned in marks[char] (reading order), and
   * entries with mark: 'name' also fill marks.name and set tile.tag = 'name'.
   */
  MapGen.fromLayout = function (layoutDef, rng) {
    const def = layoutDef && typeof layoutDef === 'object' ? layoutDef : {};
    const theme = themeById(def.theme);
    const rows = toRows(def.layout);
    const H = clamp(rows.length || 1, 1, 64);
    let W = 1;
    for (let y = 0; y < H; y++) W = Math.max(W, (rows[y] || '').length);
    W = clamp(W, 1, 64);
    if (!rng || typeof rng.next !== 'function') rng = DD.RNG('layout:' + rows.join('/'));
    const hRows = toRows(def.heights);
    const legend = Object.assign({}, LEGEND, def.legend && typeof def.legend === 'object' ? def.legend : {});
    const B = makeCtx(W, H, rng, theme);
    assignFloorField(B);
    const marks = {};
    const addMark = function (k, x, y) { (marks[k] = marks[k] || []).push({ x: x, y: y }); };
    for (let y = 0; y < H; y++) {
      const row = rows[y] || '';
      for (let x = 0; x < W; x++) {
        const ch = x < row.length ? row.charAt(x) : '.';
        const e = legendEntry(B, legend, ch) || {};
        const c = B.cells[idx(B, x, y)];
        c.t = resolveTerrain(B, e.terrain, c.floor);
        const digit = hRows[y] && x < hRows[y].length ? hRows[y].charAt(x) : '';
        const hv = e.h !== undefined && e.h !== null ? +e.h : (/[0-9]/.test(digit) ? +digit : 0);
        c.h = clamp(Math.round(hv) || 0, 0, MAX_H);
        c.obj = resolveObjEntry(B, e.obj);
        c.surface = resolveSurfaceEntry(e.surface, e.turns);
        c.zone = e.zone === 'hero' || e.zone === 'enemy' ? e.zone : null;
        c.tag = typeof e.tag === 'string' ? e.tag : typeof e.mark === 'string' ? e.mark : null;
        addMark(ch, x, y);
        if (typeof e.mark === 'string' && e.mark !== ch) addMark(e.mark, x, y);
      }
    }
    const meta = { layout: true };
    let hasHero = false, hasEnemy = false;
    for (let i = 0; i < B.n; i++) {
      if (B.cells[i].zone === 'hero') hasHero = true;
      if (B.cells[i].zone === 'enemy') hasEnemy = true;
    }
    if (!hasHero) meta.autoHeroZone = autoZone(B, 'hero', true);
    if (!hasEnemy) meta.autoEnemyZone = autoZone(B, 'enemy', false);
    B.style = 'layout';
    const out = finish(B, meta);
    out.marks = marks;
    return out;
  };

  /** Map from an encounter's map definition (layout or procedural). */
  MapGen.fromDef = function (mapDef, rng, opts) {
    const m = mapDef && typeof mapDef === 'object' ? mapDef : {};
    if (m.layout) return MapGen.fromLayout(m, m.seed !== undefined ? DD.RNG(m.seed) : rng);
    return MapGen.generate(Object.assign({}, opts || {}, {
      theme: m.theme, w: m.w, h: m.h, features: m.features, density: m.density,
      heroSide: m.heroSide || (opts && opts.heroSide), rng: m.seed !== undefined ? DD.RNG(m.seed) : rng,
    }));
  };

  // =====================================================================================================
  // Validation & public tile helpers
  // =====================================================================================================

  function gridCtx(grid) {
    return { w: grid.w, h: grid.h, n: grid.w * grid.h, cells: grid.tiles, tcache: {}, ocache: {} };
  }

  /**
   * Check a map result. opts: { minHero = 6, minEnemy = 4, layout = false (skip zone cleanliness and sizes) }.
   * Returns { ok, problems: [strings] }.
   */
  MapGen.validate = function (map, opts) {
    opts = opts || {};
    const problems = [];
    const grid = map && map.grid;
    if (!grid || !(grid.w > 0) || !(grid.h > 0) || !Array.isArray(grid.tiles)) return { ok: false, problems: ['grid missing or malformed'] };
    const w = grid.w, h = grid.h;
    if (grid.tiles.length !== w * h) return { ok: false, problems: ['tiles.length ' + grid.tiles.length + ' != w*h ' + w * h] };
    for (let i = 0; i < grid.tiles.length; i++) {
      const t = grid.tiles[i];
      const where = ' at index ' + i;
      if (!t || typeof t !== 'object') { problems.push('missing tile' + where); continue; }
      if (t.x !== i % w || t.y !== Math.floor(i / w)) problems.push('tile x/y mismatch' + where);
      if (!(Number.isInteger(t.h) && t.h >= 0 && t.h <= MAX_H)) problems.push('bad height ' + t.h + where);
      if (typeof t.t !== 'string' || !t.t) problems.push('bad terrain' + where);
      if (t.surface !== null && !(t.surface && typeof t.surface.id === 'string')) problems.push('bad surface' + where);
      if (t.obj !== null && !(t.obj && typeof t.obj.id === 'string')) problems.push('bad object' + where);
      if (t.zone !== null && t.zone !== 'hero' && t.zone !== 'enemy') problems.push('bad zone' + where);
      if (t.tag !== null && typeof t.tag !== 'string') problems.push('bad tag' + where);
    }
    if (problems.length) return { ok: false, problems: problems };
    const B = gridCtx(grid);
    const zones = { hero: map.heroZone, enemy: map.enemyZone };
    ['hero', 'enemy'].forEach(function (z) {
      const list = zones[z];
      if (!Array.isArray(list)) { problems.push(z + 'Zone missing'); return; }
      const min = opts.layout ? 1 : (z === 'hero' ? (opts.minHero !== undefined ? opts.minHero : 6) : (opts.minEnemy !== undefined ? opts.minEnemy : 4));
      if (list.length < min) problems.push(z + 'Zone has ' + list.length + ' tiles (< ' + min + ')');
      let count = 0;
      for (let i = 0; i < grid.tiles.length; i++) if (grid.tiles[i].zone === z) count++;
      if (count !== list.length) problems.push(z + 'Zone lists ' + list.length + ' tiles but ' + count + ' tiles are marked');
      list.forEach(function (p) {
        const t = p && p.x >= 0 && p.y >= 0 && p.x < w && p.y < h ? grid.tiles[p.y * w + p.x] : null;
        if (!t) { problems.push(z + 'Zone tile out of bounds ' + JSON.stringify(p)); return; }
        if (t.zone !== z) problems.push(z + 'Zone tile ' + t.x + ',' + t.y + ' not marked');
        if (!opts.layout && !isClean(B, t)) problems.push(z + 'Zone tile ' + t.x + ',' + t.y + ' is not clean floor (' + t.t + (t.obj ? ' +' + t.obj.id : '') + (t.surface ? ' ~' + t.surface.id : '') + ')');
        else if (!isSafe(B, t)) problems.push(z + 'Zone tile ' + t.x + ',' + t.y + ' is not safe');
      });
    });
    const a = analyze(B);
    if (a.root < 0) problems.push('no safe walkable tiles');
    const pos = function (i) { return (i % w) + ',' + Math.floor(i / w); };
    if (a.pockets.length) problems.push(a.pockets.length + ' safe tiles not mutually reachable (e.g. ' + a.pockets.slice(0, 4).map(pos).join(' ') + ')');
    if (a.traps.length) problems.push(a.traps.length + ' walkable tiles with no way back to safety (e.g. ' + a.traps.slice(0, 4).map(pos).join(' ') + ')');
    if (a.zoneOut.length) problems.push(a.zoneOut.length + ' zone tiles outside the connected region');
    return { ok: problems.length === 0, problems: problems };
  };

  function tileCtx() { return { tcache: {}, ocache: {} }; }
  /** Terrain walkable, no blocking object, not a pit (ignores units). */
  MapGen.isWalkableTile = function (tile) { return !!tile && isWalk(tileCtx(), tile); };
  /** Walkable and not a hazard (lava, deep water, fire/poison/electric/web surface, spikes). */
  MapGen.isSafeTile = function (tile) { return !!tile && isSafe(tileCtx(), tile); };
  /** Deploy-grade: dry plain floor with no object or surface. */
  MapGen.isCleanTile = function (tile) { return !!tile && isClean(tileCtx(), tile); };
  MapGen.terrainInfo = terrainInfo;
  MapGen.objectInfo = objectInfo;
  MapGen.makeObject = makeObj;
  MapGen.parseFeatures = parseFeatures;
  MapGen.LEGEND = LEGEND;
  MapGen.FEATURES = Object.keys(FEATURE_ALIASES);
  MapGen.CANON = { floors: FLOOR_IDS.slice(), objects: CANON_OBJECTS.slice(), surfaces: CANON_SURFACES.slice(),
    terrain: FLOOR_IDS.concat(Object.keys(FALLBACK_TERRAIN)) };
  MapGen.SURFACE_TURNS = SURFACE_TURNS;
})();
