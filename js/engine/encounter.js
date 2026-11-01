/* Dungeons and Degenerates — js/engine/encounter.js
 * Encounter definition (ARCHITECTURE §3.8) → combat setup for DD.Combat.start (§5.8):
 *   DD.Encounter.build(def, party, { rng, difficulty, act }) → { grid, theme, heroes, enemies, objective, rules,
 *     encounter, deployTiles, reinforcements, ...extras }
 *   DD.Encounter.pick(act, kind, rng, { depth, exclude }) → encounter def (null only if nothing can be fought)
 *   DD.Encounter.spawnWave(state, wave) → spawned units (reinforcements, called by combat at round start)
 * Enemy entries may also carry placement hints: { id, n, x, y } / { id, at: {x,y} } / { id, mark: 'R' }.
 */
(function () {
  'use strict';
  const DD = window.DD;

  const DIFFICULTY = {
    casual: { id: 'casual', hp: 0.8, dmg: 0.8 },
    normal: { id: 'normal', hp: 1, dmg: 1 },
    brutal: { id: 'brutal', hp: 1.25, dmg: 1.2 },
  };
  const TIER_RANK = { boss: 0, elite: 1, normal: 2, minion: 3 };
  const EDGE_NAMES = { N: 'the north', E: 'the east', S: 'the south', W: 'the west', zone: 'the enemy lines' };
  // Objective jokes (objective.flavor); the instruction itself stays plain.
  const KILL_ALL_JOKES = [
    'Diplomacy was never on the table.',
    'Murderhobo responsibly.',
    'Loot the bodies afterwards.',
    'The DM spent ages naming them.',
    'Roll for initiative, then for everything.',
  ];
  const OBJECTIVE_JOKES = {
    boss: 'The minions flee once the boss drops.',
    survive: 'Backup is "five minutes out".',
    destroy: 'Property damage is a valid strategy.',
    protect: 'No pressure.',
  };
  const WAVE_LINES = [
    'Reinforcements pour in from {edge}. Someone left the door open.',
    'More of them arrive from {edge}. The DM had extra minis.',
    'Reinforcements from {edge}! The DM is "balancing" the encounter.',
    'Fresh enemies storm in from {edge}, fashionably late.',
  ];
  const BEHIND_LINES = [
    'Reinforcements from {edge}. That is behind you. Classic.',
    'Enemies sneak in from {edge}. Nobody was watching the rear.',
  ];

  // Placement hints we know where to find at runtime (grid object → marks); tags are the fallback.
  const marksByGrid = typeof WeakMap === 'function' ? new WeakMap() : null;

  const Enc = (DD.Encounter = {});

  // =====================================================================================================
  // Helpers
  // =====================================================================================================

  function key(x, y) { return x + ',' + y; }
  function manhattan(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }
  function clampAct(a) { return Math.max(1, Math.min(3, Math.round(+a) || 1)); }

  /** { id, hp, dmg } of a difficulty; with act + kind the fight's full enemy scaling (DD.Balance.scale). [balance] */
  function difficultyInfo(d, act, kind, encId) {
    let id = d;
    if (d && typeof d === 'object') id = d.id || d.name || 'normal';
    const base = DIFFICULTY[typeof id === 'string' ? id.toLowerCase() : 'normal'] || DIFFICULTY.normal;
    if (DD.Balance && typeof DD.Balance.scale === 'function') {
      const sc = DD.Balance.scale(base.id, act, kind, { neutral: act === undefined && kind === undefined, encounter: encId });
      return { id: base.id, hp: sc.hp, dmg: sc.dmg };
    }
    return { id: base.id, hp: base.hp, dmg: base.dmg };
  }

  /** A reinforcement wave of the encounter's own grunts (DD.Balance.waves[difficulty][kind] = { round, n, edge });
   *  none for fights that already script waves or objectives (survive / protect / destroy / custom). */
  function extraWave(def, list, diffId, kind) {
    const W = DD.Balance && DD.Balance.waves;
    const w = W && W[diffId] && W[diffId][kind];
    if (!w || !(w.n > 0) || (def.reinforcements && def.reinforcements.length)) return [];
    const ob = typeof def.objective === 'string' ? def.objective : def.objective && def.objective.type;
    if (ob && ob !== 'killAll' && ob !== 'boss') return [];
    const grunts = list.filter(function (e) { const t = tierOf(e.id); return t === 'normal' || t === 'minion'; });
    if (!grunts.length) return [];
    const ids = {};
    grunts.forEach(function (e) { ids[e.id] = (ids[e.id] || 0) + 1; });
    const pool = Object.keys(ids);
    const enemies = [];
    for (let k = 0; k < Math.round(w.n); k++) enemies.push({ id: pool[k % pool.length], n: 1 });
    return normalizeWaves([{ round: w.round || 3, enemies: enemies, edge: w.edge || 'zone', balance: true }]);
  }

  /** Extra grunts (DD.Balance.extraEnemies; brutal +1 per normal fight by default): copies of the encounter's own
   *  non-elite, non-boss entries; a fractional count rolls its remainder as a chance. */
  function extraEnemies(list, diffId, kind, rng) {
    let n = DD.Balance && DD.Balance.extraOf ? DD.Balance.extraOf(diffId, kind) : (diffId === 'brutal' && kind === 'normal' ? 1 : 0);
    const whole = Math.floor(n), part = n - whole;
    n = whole + (part > 0 && rng.next() < part ? 1 : 0);
    if (!n || !list.length) return;
    const grunts = list.filter(function (e) { const t = tierOf(e.id); return t !== 'boss' && t !== 'elite'; });
    if (!grunts.length && kind !== 'normal') return;   // elite / boss fights only ever add grunts
    const src = grunts.length ? grunts : list;
    for (let k = 0; k < n; k++) {
      const extra = src[Math.floor(rng.next() * src.length) % src.length];
      list.push({ id: extra.id, entry: { id: extra.id, n: 1 }, index: -1, brutal: true });
    }
  }

  function resolveCount(n, rng) {
    if (Array.isArray(n)) {
      let a = Math.round(+n[0]) || 0, b = n.length > 1 ? Math.round(+n[1]) || 0 : a;
      if (b < a) { const t = a; a = b; b = t; }
      return Math.max(0, rng.int(Math.max(0, a), Math.max(0, b)));
    }
    if ((typeof n === 'number' || (typeof n === 'string' && n.trim() !== '')) && isFinite(+n)) return Math.max(0, Math.round(+n));
    return 1;
  }

  /** [{ id, n, ... }] → [{ id, entry }] with counts rolled. */
  function expandEntries(entries, rng) {
    const out = [];
    (Array.isArray(entries) ? entries : []).forEach(function (e) {
      if (typeof e === 'string') e = { id: e, n: 1 };
      if (!e || typeof e.id !== 'string') return;
      const n = resolveCount(e.n, rng);
      for (let k = 0; k < n; k++) out.push({ id: e.id, entry: e, index: k });
    });
    return out;
  }

  function enemyDef(id) { return DD.getEnemy ? DD.getEnemy(id) : null; }
  function tierOf(id) { const d = enemyDef(id); return (d && d.tier) || 'normal'; }

  function tileAt(grid, x, y) {
    if (!grid || x < 0 || y < 0 || x >= grid.w || y >= grid.h) return null;
    return grid.tiles[y * grid.w + x] || null;
  }

  /** Setup-time placeability: safe walkable tile not taken by another placed unit. */
  function placeable(grid, x, y, occ) {
    const t = tileAt(grid, x, y);
    return !!t && !occ[key(x, y)] && DD.MapGen.isSafeTile(t);
  }

  /** Greedy spread: prefer candidates at least `cap` apart (and from `preset`), then by list order. */
  function chooseSpread(cands, n, cap, preset) {
    const chosen = [], pool = cands.slice(), fixed = preset || [];
    while (chosen.length < n && pool.length) {
      let best = 0, bestScore = -Infinity;
      for (let k = 0; k < pool.length; k++) {
        let d = cap;
        for (let m = 0; m < chosen.length; m++) d = Math.min(d, manhattan(pool[k], chosen[m]));
        for (let m = 0; m < fixed.length; m++) d = Math.min(d, manhattan(pool[k], fixed[m]));
        const score = d * 10000 - k;
        if (score > bestScore) { bestScore = score; best = k; }
      }
      chosen.push(pool[best]);
      pool.splice(best, 1);
    }
    return chosen;
  }

  /** Free tiles in BFS order outward from the given seeds (walking only over walkable tiles). */
  function nearestFree(grid, seeds, occ, avoid, minAvoid) {
    const seen = {}, q = [], out = [];
    seeds.forEach(function (p) { const k = key(p.x, p.y); if (!seen[k] && tileAt(grid, p.x, p.y)) { seen[k] = 1; q.push(p); } });
    for (let head = 0; head < q.length; head++) {
      const p = q[head];
      if (placeable(grid, p.x, p.y, occ)) {
        let d = Infinity;
        for (let k = 0; k < avoid.length; k++) d = Math.min(d, manhattan(p, avoid[k]));
        if (d >= minAvoid) out.push({ x: p.x, y: p.y });
      }
      const ns = [[0, -1], [1, 0], [0, 1], [-1, 0]];
      for (let k = 0; k < 4; k++) {
        const nx = p.x + ns[k][0], ny = p.y + ns[k][1], nk = key(nx, ny);
        const t = tileAt(grid, nx, ny);
        if (!t || seen[nk] || !DD.MapGen.isWalkableTile(t)) continue;
        seen[nk] = 1;
        q.push({ x: nx, y: ny });
      }
    }
    return out;
  }

  /** Same as nearestFree but relaxes the distance to `avoid` units step by step. */
  function nearestFreeRelaxed(grid, seeds, occ, avoid, startDist, n) {
    for (let d = startDist; d >= 0; d--) {
      const list = nearestFree(grid, seeds, occ, avoid, d);
      if (list.length >= n || d === 0) return list;
    }
    return [];
  }

  function centroid(list) {
    if (!list.length) return null;
    let sx = 0, sy = 0;
    list.forEach(function (p) { sx += p.x; sy += p.y; });
    return { x: sx / list.length, y: sy / list.length };
  }

  function objName(id, count) {
    const def = DD.getObject ? DD.getObject(id) : null;
    let name = def && def.name ? def.name : String(id || 'thing').replace(/_/g, ' ');
    if (count !== 1) {
      if (/(s|x|ch|sh)$/i.test(name)) name += 'es';
      else if (/[^aeiou]y$/i.test(name)) name = name.slice(0, -1) + 'ies';
      else name += 's';
    }
    return name;
  }

  function pickLine(lines, rng) { return lines[Math.floor(rng.next() * lines.length) % lines.length]; }

  // =====================================================================================================
  // Objectives
  // =====================================================================================================

  /** Objects an objective needs on a procedural map (destroy N things, protect a thing). */
  function requiredObjects(objective) {
    const o = typeof objective === 'string' ? { type: objective } : objective && typeof objective === 'object' ? objective : null;
    if (!o) return [];
    if (o.type === 'destroy') return [{ id: o.objId || 'totem', count: Math.max(1, Math.round(+o.count) || 3), where: 'enemy' }];
    if (o.type === 'protect' && o.objId) return [{ id: o.objId, count: 1, where: 'hero' }];
    return [];
  }

  function countObjects(grid, id) {
    let n = 0;
    grid.tiles.forEach(function (t) { if (t.obj && t.obj.id === id) n++; });
    return n;
  }

  /** The plain instruction of an objective ("Destroy 3 Totems."). */
  function objectiveGoal(o, def) {
    switch (o.type) {
      case 'boss': {
        const b = enemyDef(o.bossId);
        return 'Defeat ' + (b ? b.name : 'the boss') + '.';
      }
      case 'survive': return 'Survive ' + o.rounds + ' rounds.';
      case 'destroy': return 'Destroy ' + o.count + ' ' + objName(o.objId, o.count) + '.';
      case 'protect': {
        if (o.objId) return 'Protect the ' + objName(o.objId, 1) + ' and defeat all enemies.';
        const d = o.unitId ? (enemyDef(o.unitId) || (DD.getSummon && DD.getSummon(o.unitId)) || (DD.getHero && DD.getHero(o.unitId))) : null;
        return 'Keep ' + (d ? d.name : 'the VIP') + ' alive and defeat all enemies.';
      }
      case 'custom': return def.objectiveText || 'Complete the objective the DM keeps hinting at.';
      default: return 'Defeat all enemies.';
    }
  }

  /** One-line joke for an objective (objective.flavor). */
  function objectiveJoke(o, rng) {
    if (o.type === 'custom') return '';
    return OBJECTIVE_JOKES[o.type] || pickLine(KILL_ALL_JOKES, rng);
  }

  /** Short, clear objective text: the instruction first, the joke second. */
  function objectiveText(o, def, rng) {
    const joke = objectiveJoke(o, rng || DD.rng);
    return objectiveGoal(o, def || {}) + (joke ? ' ' + joke : '');
  }

  const OBJECTIVE_TYPES = ['killAll', 'boss', 'survive', 'destroy', 'protect', 'custom'];

  function buildObjective(def, enemyIds, grid, rng) {
    let src = def.objective;
    if (typeof src === 'string') src = { type: src };
    const o = Object.assign({}, src && typeof src === 'object' ? src : {});
    if (typeof o.type !== 'string' || !o.type) o.type = 'killAll';
    if (OBJECTIVE_TYPES.indexOf(o.type) < 0) {
      DD.warn('Encounter "' + def.id + '": unknown objective type "' + o.type + '" (using killAll)');
      o.type = 'killAll';
    }
    if (o.type === 'boss' && !o.bossId) {
      const boss = enemyIds.filter(function (e) { return tierOf(e.id) === 'boss'; })[0];
      if (boss) o.bossId = boss.id;
      else {
        DD.warn('Encounter "' + def.id + '": boss objective without a boss-tier enemy (using killAll)');
        o.type = 'killAll';
        delete o.text;
      }
    }
    if (o.type === 'survive' && !(o.rounds > 0)) o.rounds = 5;
    if (o.type === 'destroy') {
      if (!o.objId) o.objId = 'totem';
      const onMap = countObjects(grid, o.objId);
      if (onMap === 0) {
        DD.warn('Encounter "' + def.id + '": destroy objective but no "' + o.objId + '" on the map (falling back to killAll)');
        o.type = 'killAll';
        delete o.text;
      } else if (!(o.count > 0) || o.count > onMap) {
        o.count = onMap;
      }
    }
    if (!o.text) {
      // combat replaces `text` with live progress ("3 left"); the joke survives separately in `flavor`
      const joke = objectiveJoke(o, rng);
      o.text = objectiveGoal(o, def) + (joke ? ' ' + joke : '');
      if (joke && o.flavor === undefined) o.flavor = joke;
    }
    return o;
  }

  // =====================================================================================================
  // Waves
  // =====================================================================================================

  function normEdge(edge) {
    if (typeof edge !== 'string' || !edge) return 'zone';
    const e = edge.trim();
    const map = { n: 'N', north: 'N', e: 'E', east: 'E', s: 'S', south: 'S', w: 'W', west: 'W', zone: 'zone', enemy: 'zone' };
    return map[e.toLowerCase()] || e;
  }

  function normalizeWaves(list) {
    return (Array.isArray(list) ? list : []).filter(function (w) { return w && typeof w === 'object'; }).map(function (w) {
      return Object.assign({}, w, {
        round: Math.max(1, Math.round(+w.round) || 2),
        enemies: (Array.isArray(w.enemies) ? w.enemies : []).filter(function (e) { return e && typeof e.id === 'string'; })
          .map(function (e) { return Object.assign({}, e); }),
        edge: normEdge(w.edge),
      });
    });
  }

  // =====================================================================================================
  // Build
  // =====================================================================================================

  function buildMap(def, act, count, rng) {
    const m = def.map && typeof def.map === 'object' ? def.map : {};
    if (m.layout) return DD.MapGen.fromLayout(m, m.seed !== undefined ? DD.RNG(m.seed) : rng);
    let theme = m.theme;
    if (!theme || !(DD.Themes && (DD.Themes.has ? DD.Themes.has(theme) : DD.Themes[theme]))) {
      if (theme) DD.warn('Encounter "' + def.id + '": unknown theme "' + theme + '"');
      theme = DD.Themes && DD.Themes.random ? DD.Themes.random(act, rng) : 'cellar';
    }
    return DD.MapGen.generate({
      theme: theme, w: m.w, h: m.h, features: m.features, density: m.density, heroSide: m.heroSide,
      rng: m.seed !== undefined ? DD.RNG(m.seed) : rng,
      objects: requiredObjects(def.objective),
      enemyZoneSize: count + 3,
    });
  }

  function partyEntries(party) {
    const out = [];
    (Array.isArray(party) ? party : party ? [party] : []).forEach(function (p) {
      if (typeof p === 'string' && p) out.push({ id: p });
      else if (p && typeof p === 'object' && typeof p.id === 'string' && !p.dead) out.push({ runHero: p, id: p.id });
    });
    return out;
  }

  function placeHeroes(map, party, occ) {
    const grid = map.grid, entries = partyEntries(party);
    const zone = map.heroZone.filter(function (p) { return placeable(grid, p.x, p.y, occ); });
    let spots = chooseSpread(zone, entries.length, 2);
    if (spots.length < entries.length) {
      spots.forEach(function (p) { occ[key(p.x, p.y)] = 1; });
      const extra = nearestFree(grid, map.heroZone.length ? map.heroZone : [{ x: 0, y: grid.h - 1 }], occ, [], 0);
      spots = spots.concat(extra.slice(0, entries.length - spots.length));
    }
    const out = [];
    entries.forEach(function (e, k) {
      const p = spots[k];
      if (!p) { DD.warn('Encounter: no room to place hero ' + e.id); return; }
      occ[key(p.x, p.y)] = 1;
      out.push(Object.assign(e, { x: p.x, y: p.y }));
    });
    return out;
  }

  function markTiles(map, name) {
    const marks = map.marks || {};
    if (marks[name]) return marks[name];
    return map.grid.tiles.filter(function (t) { return t.tag === name; }).map(function (t) { return { x: t.x, y: t.y }; });
  }

  function placeEnemies(map, list, heroes, occ) {
    const grid = map.grid, out = new Array(list.length);
    const heroPos = heroes.map(function (h) { return { x: h.x, y: h.y }; });
    const placed = [];
    const take = function (k, p) { out[k] = { id: list[k].id, x: p.x, y: p.y }; occ[key(p.x, p.y)] = 1; placed.push(p); };
    const markUse = {};
    // 1. explicit hints: { x, y } / { at } / { mark }
    list.forEach(function (e, k) {
      const en = e.entry || {};
      let p = null;
      if (typeof en.x === 'number' && typeof en.y === 'number') p = { x: en.x, y: en.y };
      else if (en.at && typeof en.at.x === 'number') p = { x: en.at.x, y: en.at.y };
      else if (typeof en.mark === 'string') {
        const tiles = markTiles(map, en.mark);
        let i = markUse[en.mark] || 0;
        while (i < tiles.length && !placeable(grid, tiles[i].x, tiles[i].y, occ)) i++;
        markUse[en.mark] = i + 1;
        p = tiles[i] || null;
      }
      if (p && placeable(grid, p.x, p.y, occ)) take(k, p);
    });
    // 2. bosses on B marks, then the deepest central zone tiles
    const heroC = centroid(heroPos) || centroid(map.heroZone) || { x: grid.w / 2, y: grid.h };
    const zoneFree = function () { return map.enemyZone.filter(function (p) { return placeable(grid, p.x, p.y, occ); }); };
    const order = list.map(function (e, k) { return k; }).filter(function (k) { return !out[k]; });
    order.sort(function (a, b) { return (TIER_RANK[tierOf(list[a].id)] || 2) - (TIER_RANK[tierOf(list[b].id)] || 2) || a - b; });
    const bMarks = markTiles(map, 'B'), eMarks = markTiles(map, 'E');
    order.forEach(function (k) {
      if (out[k]) return;
      const boss = tierOf(list[k].id) === 'boss';
      const marks = (boss ? bMarks.concat(eMarks) : eMarks).filter(function (p) { return placeable(grid, p.x, p.y, occ); });
      if (marks.length) { take(k, marks[0]); return; }
      let zone = zoneFree();
      if (!zone.length) return;
      if (boss) {
        const zc = centroid(zone);
        zone = zone.slice().sort(function (a, b) {
          return (manhattan(b, heroC) - 0.6 * manhattan(b, zc)) - (manhattan(a, heroC) - 0.6 * manhattan(a, zc)) || a.y - b.y || a.x - b.x;
        });
        take(k, zone[0]);
      } else {
        take(k, chooseSpread(zone, 1, 2, placed)[0]);
      }
    });
    // 3. overflow: nearest free tiles around the zone, keeping a polite distance from the heroes
    const left = order.filter(function (k) { return !out[k]; });
    if (left.length) {
      const seeds = map.enemyZone.length ? map.enemyZone : eMarks.length ? eMarks : [{ x: Math.floor(grid.w / 2), y: 0 }];
      const extra = nearestFreeRelaxed(grid, seeds, occ, heroPos, 3, left.length);
      left.forEach(function (k, m) { if (extra[m]) take(k, extra[m]); });
    }
    list.forEach(function (e, k) { if (!out[k]) DD.warn('Encounter: no room to place enemy ' + e.id); });
    return out.filter(Boolean);
  }

  /**
   * Build a combat setup. def: encounter def or id. party: RunHero[] (dead ones skipped) or hero ids.
   * opts: { rng | seed, difficulty: 'casual'|'normal'|'brutal' (or { id }), act }.
   * Extras beyond the contract: marks, heroZone, enemyZone, difficulty { id, hp, dmg }, act, kind, name, mapMeta.
   */
  Enc.build = function (def, party, opts) {
    opts = opts || {};
    if (typeof def === 'string') def = DD.getEncounter(def);
    if (!def || typeof def !== 'object') {
      DD.warn('Encounter.build: missing encounter definition (using a fallback fight)');
      def = Enc.synthesize(opts.act || 1, 'normal', null, { register: false }) ||
        { id: 'mg_empty', act: opts.act || 1, kind: 'normal', enemies: [], objective: { type: 'killAll' } };
    }
    const rng = opts.rng && typeof opts.rng.next === 'function' ? opts.rng : DD.RNG(opts.seed);
    rng.next(); // consecutive builds from one rng differ
    const enemyRng = rng.fork('enemies'), mapRng = rng.fork('map'), textRng = rng.fork('text');
    const act = clampAct(opts.act || def.act || 1);
    const kind = def.kind || 'normal';
    const diff = difficultyInfo(opts.difficulty, act, kind, def.id);

    const list = expandEntries(def.enemies, enemyRng);
    extraEnemies(list, diff.id, kind, enemyRng);
    const waves = normalizeWaves(def.reinforcements).concat(extraWave(def, list, diff.id, kind));

    const map = buildMap(def, act, list.length, mapRng);
    const occ = {};
    const heroes = placeHeroes(map, party, occ);
    const enemies = placeEnemies(map, list, heroes, occ);
    const objective = buildObjective(def, list, map.grid, textRng);
    const marks = map.marks || {};
    if (marksByGrid) marksByGrid.set(map.grid, marks);

    return {
      grid: map.grid,
      theme: map.theme,
      heroes: heroes,
      enemies: enemies,
      objective: objective,
      rules: (Array.isArray(def.rules) ? def.rules : []).filter(function (r) { return r && typeof r === 'object'; })
        .map(function (r) { return Object.assign({}, r); }),
      encounter: def,
      deployTiles: map.heroZone.map(function (p) { return { x: p.x, y: p.y }; }),
      reinforcements: waves,
      // extras
      marks: marks,
      heroZone: map.heroZone.slice(),
      enemyZone: map.enemyZone.slice(),
      difficulty: diff,
      act: act,
      kind: kind,
      name: def.name || def.id,
      mapMeta: map.meta || {},
    };
  };

  // =====================================================================================================
  // Picking encounters
  // =====================================================================================================

  function excludeFn(ex) {
    if (!ex) return function () { return false; };
    if (Array.isArray(ex)) return function (id) { return ex.indexOf(id) >= 0; };
    if (typeof ex.has === 'function') return function (id) { return ex.has(id); };
    if (typeof ex === 'object') return function (id) { return !!ex[id]; };
    return function (id) { return id === ex; };
  }
  function weightOf(e) { return e.weight === undefined || e.weight === null ? 1 : Math.max(0, +e.weight || 0); }
  function depthOk(e, depth) {
    if (depth === null || depth === undefined) return true;
    return (e.minDepth || 0) <= depth && (e.maxDepth === undefined || e.maxDepth === null || depth <= e.maxDepth);
  }
  function isTestContent(e) { return /^test_/.test(e.id) || !!e.synthetic; }

  /**
   * Pick from an explicit list. Relaxes, in order: depth → exclude → real content before test_/synthetic content
   * → kind (boss → elite → normal) → act (nearest first). Weighted by def.weight (weight 0 only when nothing else).
   */
  Enc.pickFrom = function (list, act, kind, rng, opts) {
    opts = opts || {};
    rng = rng && typeof rng.next === 'function' ? rng : DD.RNG();
    const all = (Array.isArray(list) ? list : []).filter(function (e) { return e && typeof e.id === 'string'; });
    if (!all.length) return null;
    const a0 = clampAct(act);
    const acts = [a0, a0 - 1, a0 + 1, a0 - 2, a0 + 2].filter(function (a) { return a >= 1 && a <= 3; });
    const kinds = { boss: ['boss', 'elite', 'normal'], elite: ['elite', 'normal'], normal: ['normal', 'elite'] }[kind] || [kind, 'normal'];
    const excluded = excludeFn(opts.exclude);
    const depth = typeof opts.depth === 'number' ? opts.depth : null;
    for (let ai = 0; ai < acts.length; ai++) {
      for (let ki = 0; ki < kinds.length; ki++) {
        for (let real = 1; real >= 0; real--) {
          const base = all.filter(function (e) {
            return (+e.act || 1) === acts[ai] && (e.kind || 'normal') === kinds[ki] && isTestContent(e) !== !!real;
          });
          if (!base.length) continue;
          // weight-0 encounters (scripted-only fights) are a last resort within this act/kind
          const weighted = base.filter(function (e) { return weightOf(e) > 0; });
          const sets = weighted.length ? [weighted, base] : [base];
          for (let si = 0; si < sets.length; si++) {
            const set = sets[si];
            const tiers = [
              set.filter(function (e) { return !excluded(e.id) && depthOk(e, depth); }),
              set.filter(function (e) { return !excluded(e.id); }),
              set.filter(function (e) { return depthOk(e, depth); }),
              set,
            ];
            for (let t = 0; t < tiers.length; t++) {
              if (!tiers[t].length) continue;
              const useWeights = tiers[t].some(function (e) { return weightOf(e) > 0; });
              return rng.weighted(tiers[t], function (e) { return useWeights ? weightOf(e) : 1; });
            }
          }
        }
      }
    }
    return null;
  };

  /** Pick a registered encounter for a run-map node; synthesizes one if the registry has nothing usable. */
  Enc.pick = function (act, kind, rng, opts) {
    const defs = DD.defs.encounters, list = [];
    for (const id in defs) if (Object.prototype.hasOwnProperty.call(defs, id)) list.push(defs[id]);
    return Enc.pickFrom(list, act, kind || 'normal', rng, opts) || Enc.synthesize(act, kind || 'normal', rng);
  };

  /**
   * A procedural stand-in encounter built from registered enemies (used when no encounter fits).
   * Registered as 'mg_fallback_a<act>_<kind>' (so ids stay resolvable) unless opts.register === false.
   */
  Enc.synthesize = function (act, kind, rng, opts) {
    opts = opts || {};
    rng = rng && typeof rng.next === 'function' ? rng : DD.RNG('synth:' + act + ':' + kind);
    act = clampAct(act);
    kind = kind === 'boss' || kind === 'elite' ? kind : 'normal';
    const id = 'mg_fallback_a' + act + '_' + kind;
    if (opts.register !== false && DD.getEncounter(id)) return DD.getEncounter(id);
    const enemies = [];
    for (const eid in DD.defs.enemies) {
      const e = DD.defs.enemies[eid];
      if (e && !/^wm_/.test(eid)) enemies.push(e);
    }
    if (!enemies.length) return null;
    const real = enemies.filter(function (e) { return !/^test_/.test(e.id); });
    const pool = real.length ? real : enemies;
    const byAct = function (tiers) {
      for (let d = 0; d < 3; d++) {
        const hit = pool.filter(function (e) { return Math.abs((+e.act || 1) - act) === d && tiers.indexOf(e.tier || 'normal') >= 0; });
        if (hit.length) return hit;
      }
      return [];
    };
    const grunts = byAct(['normal', 'minion']);
    const list = [];
    if (kind === 'boss') {
      const boss = byAct(['boss'])[0] || byAct(['elite'])[0];
      if (boss) list.push({ id: boss.id, n: 1 });
    } else if (kind === 'elite') {
      const elite = byAct(['elite']);
      if (elite.length) list.push({ id: elite[Math.floor(rng.next() * elite.length) % elite.length].id, n: 1 });
    }
    const picks = rng.sample(grunts, Math.min(grunts.length, kind === 'normal' ? 3 : 2));
    picks.forEach(function (e, k) { list.push({ id: e.id, n: kind === 'normal' ? (k === 0 ? [1, 2] : 1) : 1 }); });
    if (!list.length) list.push({ id: pool[0].id, n: kind === 'normal' ? 3 : 1 });
    const boss = list.filter(function (e) { return tierOf(e.id) === 'boss'; })[0];
    const def = {
      id: id, act: act, kind: kind, name: 'Random Encounter (Budget Edition)',
      intro: "The DM didn't prep this one. Please clap.", weight: 0, minDepth: 0, synthetic: true,
      map: { theme: DD.Themes && DD.Themes.random ? DD.Themes.random(act, rng) : 'cellar', w: 11, h: 11 },
      enemies: list, objective: boss ? { type: 'boss', bossId: boss.id } : { type: 'killAll' },
      reinforcements: [], rules: [], reward: { goldMult: 1, itemRarity: null },
    };
    if (opts.register !== false) DD.registerEncounter(def);
    return def;
  };

  // =====================================================================================================
  // Reinforcements
  // =====================================================================================================

  /** Placement hints of a combat's map (layout marks), falling back to tile tags. */
  Enc.marks = function (state) {
    const st = state || (DD.Combat && DD.Combat.state);
    if (!st || !st.grid) return {};
    const known = marksByGrid ? marksByGrid.get(st.grid) : null;
    if (known) return known;
    const out = {};
    (st.grid.tiles || []).forEach(function (t) { if (t && t.tag) (out[t.tag] = out[t.tag] || []).push({ x: t.x, y: t.y }); });
    return out;
  };

  function liveUnits(state) {
    return (state.units || []).filter(function (u) { return u && !u.dead; });
  }

  /** Candidate tiles for a wave, best first. */
  function waveTiles(state, wave, n, rng) {
    const grid = state.grid, w = grid.w, h = grid.h, edge = wave.edge || 'zone';
    const occ = {};
    const units = liveUnits(state);
    units.forEach(function (u) { occ[key(u.x, u.y)] = 1; });
    const heroes = units.filter(function (u) { return u.side === 'hero'; }).map(function (u) { return { x: u.x, y: u.y }; });
    const free = function (t) {
      if (!t || occ[key(t.x, t.y)] || !DD.MapGen.isSafeTile(t)) return false;
      return !(DD.Grid && DD.Grid.isFree) || DD.Grid.isFree(t.x, t.y);
    };
    const heroDist = function (t) {
      let d = Infinity;
      for (let k = 0; k < heroes.length; k++) d = Math.min(d, manhattan(t, heroes[k]));
      return d;
    };
    let seeds = null;
    const depthFn = { N: function (t) { return t.y; }, S: function (t) { return h - 1 - t.y; }, W: function (t) { return t.x; }, E: function (t) { return w - 1 - t.x; } }[edge];
    let cands;
    if (depthFn) {
      cands = grid.tiles.filter(function (t) { return t && depthFn(t) <= 3 && free(t); });
      const jitter = {};
      cands.forEach(function (t) { jitter[key(t.x, t.y)] = rng.next(); });
      cands.sort(function (a, b) {
        return depthFn(a) - depthFn(b) || Math.min(heroDist(b), 6) - Math.min(heroDist(a), 6) || jitter[key(a.x, a.y)] - jitter[key(b.x, b.y)];
      });
    } else {
      const marks = Enc.marks(state);
      if (typeof wave.mark === 'string' && marks[wave.mark]) seeds = marks[wave.mark];
      else if (edge !== 'zone' && marks[edge]) seeds = marks[edge];
      if (!seeds || !seeds.length) seeds = grid.tiles.filter(function (t) { return t && t.zone === 'enemy'; });
      if (!seeds.length) seeds = grid.tiles.filter(function (t) { return t && t.y === 0; });
      cands = nearestFree(grid, seeds, occ, [], 0).map(function (p) { return tileAt(grid, p.x, p.y); }).filter(free);
    }
    for (let minD = 3; minD >= 1; minD--) {
      const ok = cands.filter(function (t) { return heroDist(t) >= minD; });
      if (ok.length >= n || minD === 1) return chooseSpread(ok.map(function (t) { return { x: t.x, y: t.y }; }), n, 2);
    }
    return [];
  }

  /**
   * Spawn a reinforcement wave: { round, enemies: [{ id, n }], edge: 'N'|'E'|'S'|'W'|'zone', mark?, text? }.
   * Edges spawn on the outermost free tiles of that side (furthest from heroes first); 'zone' (or a mark name)
   * spawns around the enemy deploy zone / marked tiles. Announces the wave (banner + log). Returns the units.
   */
  Enc.spawnWave = function (state, wave) {
    state = state || (DD.Combat && DD.Combat.state);
    if (!state || !state.grid || !wave || !DD.Act || typeof DD.Act.spawn !== 'function') return [];
    const rng = state.rng && typeof state.rng.next === 'function' ? state.rng : DD.RNG('wave:' + (state.round || 0));
    const w = Object.assign({}, wave, { edge: normEdge(wave.edge) });
    const warned = {};
    const ids = expandEntries(w.enemies, rng).map(function (e) { return e.id; }).filter(function (id) {
      if (enemyDef(id)) return true;
      if (!warned[id]) DD.warn('Encounter.spawnWave: unknown enemy "' + id + '"');
      warned[id] = true;
      return false;
    });
    if (!ids.length) return [];
    const tiles = waveTiles(state, w, ids.length, rng);
    if (!tiles.length) {
      if (DD.Act.log) DD.Act.log('Reinforcements arrived, but there was nowhere to stand. They went home.', 'narrator');
      return [];
    }
    const heroes = liveUnits(state).filter(function (u) { return u.side === 'hero'; });
    const hc = centroid(heroes.map(function (u) { return { x: u.x, y: u.y }; }));
    const behind = hc && { N: hc.y < state.grid.h / 3, S: hc.y > state.grid.h * 2 / 3, W: hc.x < state.grid.w / 3, E: hc.x > state.grid.w * 2 / 3 }[w.edge];
    const text = typeof w.text === 'string' && w.text ? w.text :
      pickLine(behind ? BEHIND_LINES : WAVE_LINES, rng).replace('{edge}', EDGE_NAMES[w.edge] || 'somewhere');
    if (DD.FX && DD.FX.banner) DD.FX.banner('Reinforcements!', { sub: text, color: '#ff7b6b', ms: 900 });
    if (DD.FX && DD.FX.sound) DD.FX.sound('roar');
    if (DD.Act.log) DD.Act.log(text, 'enemy');
    const out = [];
    for (let k = 0; k < ids.length && k < tiles.length; k++) {
      const u = DD.Act.spawn(ids[k], tiles[k].x, tiles[k].y, {});
      if (u) out.push(u);
    }
    if (out.length < ids.length && DD.Act.log) DD.Act.log((ids.length - out.length) + ' of them could not find parking.', 'narrator');
    return out;
  };

  Enc.difficulty = difficultyInfo;
  Enc.objectiveText = objectiveText;
  Enc.requiredObjects = requiredObjects;
  Enc.resolveEnemies = function (entries, rng) {
    return expandEntries(entries, rng && typeof rng.next === 'function' ? rng : DD.RNG()).map(function (e) { return e.id; });
  };
})();
