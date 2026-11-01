/* Dungeons and Degenerates — tests/mapgen_tests.js
 * MAPGEN suites (names start with "mapgen:"): themes, 300+ procedural maps (connectivity, zones, determinism),
 * map features, layouts, encounter build/pick, reinforcement waves, wild magic.
 * Connectivity is re-checked here with an independent BFS (tile walkability from DD.MapGen's tile helpers,
 * which read the real terrain/object defs when js/data/terrain.js is loaded).
 */
(function () {
  'use strict';
  const T = window.DD_TEST;
  const DD = window.DD;

  const THEME_IDS = ['cellar', 'sewer', 'warren', 'hauntwood', 'academy', 'graveyard', 'hellscape', 'hoard', 'dm_table'];
  const AMBIENT = [null, 'dust', 'spores', 'embers', 'fog'];
  const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

  function tileAt(grid, x, y) { return x >= 0 && y >= 0 && x < grid.w && y < grid.h ? grid.tiles[y * grid.w + x] : null; }
  function key(p) { return p.x + ',' + p.y; }

  /** Independent check: safe tiles strongly connected (up ≤ 1), every walkable tile can get back to safety. */
  function connectivity(grid, start) {
    const safe = function (t) { return DD.MapGen.isSafeTile(t); };
    const walk = function (t) { return DD.MapGen.isWalkableTile(t); };
    const bfs = function (seeds, ok, reverse) {
      const seen = {}, q = seeds.slice();
      seeds.forEach(function (t) { seen[key(t)] = true; });
      while (q.length) {
        const t = q.shift();
        DIRS.forEach(function (d) {
          const n = tileAt(grid, t.x + d[0], t.y + d[1]);
          if (!n || seen[key(n)] || !ok(n)) return;
          const up = reverse ? t.h - n.h : n.h - t.h;
          if (up > 1) return;
          seen[key(n)] = true;
          q.push(n);
        });
      }
      return seen;
    };
    const root = tileAt(grid, start.x, start.y);
    const fwd = bfs([root], safe, false), bwd = bfs([root], safe, true);
    const main = grid.tiles.filter(function (t) { return fwd[key(t)] && bwd[key(t)]; });
    const back = bfs(main, walk, true);
    let unreachable = 0, stranded = 0, safeCount = 0;
    grid.tiles.forEach(function (t) {
      if (safe(t)) { safeCount++; if (!fwd[key(t)] || !bwd[key(t)]) unreachable++; }
      else if (walk(t) && !back[key(t)]) stranded++;
    });
    return { unreachable: unreachable, stranded: stranded, safeCount: safeCount, main: fwd };
  }

  function sideOk(zone, side, grid) {
    return zone.every(function (p) {
      if (side === 'S') return p.y >= grid.h - 3;
      if (side === 'N') return p.y <= 2;
      if (side === 'E') return p.x >= grid.w - 3;
      if (side === 'W') return p.x <= 2;
      return false;
    });
  }

  function cliffStats(grid) {
    let pairs = 0, cliffs = 0, maxH = 0, minH = 9;
    grid.tiles.forEach(function (t) {
      maxH = Math.max(maxH, t.h); minH = Math.min(minH, t.h);
      [[1, 0], [0, 1]].forEach(function (d) {
        const n = tileAt(grid, t.x + d[0], t.y + d[1]);
        if (!n || !DD.MapGen.isWalkableTile(t) || !DD.MapGen.isWalkableTile(n)) return;
        pairs++;
        if (Math.abs(n.h - t.h) >= 2) cliffs++;
      });
    });
    return { pairs: pairs, cliffs: cliffs, maxH: maxH, minH: minH };
  }

  function countWhere(grid, fn) { let n = 0; grid.tiles.forEach(function (t) { if (fn(t)) n++; }); return n; }

  /** Full structural + guarantee check of a generated map; returns a list of problems. */
  function checkMap(map, w, h) {
    const p = [];
    const v = DD.MapGen.validate(map);
    if (!v.ok) p.push.apply(p, v.problems);
    const g = map.grid;
    if (g.w !== w || g.h !== h) p.push('size ' + g.w + 'x' + g.h + ' != ' + w + 'x' + h);
    if (Object.keys(g).sort().join(',') !== 'h,tiles,w') p.push('grid has extra keys: ' + Object.keys(g).join(','));
    if (map.heroZone.length < 6) p.push('hero zone ' + map.heroZone.length);
    if (map.enemyZone.length < 6) p.push('enemy zone ' + map.enemyZone.length);
    if (!sideOk(map.heroZone, map.meta.heroSide, g)) p.push('hero zone not on side ' + map.meta.heroSide);
    if (!sideOk(map.enemyZone, map.meta.enemySide, g)) p.push('enemy zone not on side ' + map.meta.enemySide);
    const c = connectivity(g, map.heroZone[0]);
    if (c.unreachable) p.push(c.unreachable + ' safe tiles not mutually reachable (independent check)');
    if (c.stranded) p.push(c.stranded + ' walkable tiles stranded (independent check)');
    if (!map.enemyZone.every(function (z) { return c.main[key(z)]; })) p.push('enemy zone unreachable from hero zone');
    map.heroZone.concat(map.enemyZone).forEach(function (z) {
      const t = tileAt(g, z.x, z.y);
      if (!DD.MapGen.isCleanTile(t)) p.push('zone tile ' + key(z) + ' not clean');
    });
    // readability: no wall terrain on the two camera-facing edges (S and E); the two side corners they share with
    // the back edges belong to the back-edge border dressing
    const front = g.tiles.filter(function (t) { return (t.x === g.w - 1 || t.y === g.h - 1) && t.x > 0 && t.y > 0 && t.t === 'wall'; });
    if (front.length) p.push(front.length + ' wall tiles on the front edges (e.g. ' + key(front[0]) + ')');
    // a fair start: nothing that hurts or swallows heroes right next to their deploy zone
    map.heroZone.forEach(function (z) {
      DIRS.forEach(function (d) {
        const n = tileAt(g, z.x + d[0], z.y + d[1]);
        if (!n || n.zone === 'hero') return;
        const info = DD.MapGen.terrainInfo(n.t);
        if (info.pit || info.liquid === 'lava' || info.liquid === 'deep' || (DD.MapGen.isWalkableTile(n) && !DD.MapGen.isSafeTile(n))) {
          p.push('hazard ' + n.t + (n.surface ? '~' + n.surface.id : '') + ' next to the hero zone at ' + key(n));
        }
      });
    });
    g.tiles.forEach(function (t) {
      if (Object.keys(t).sort().join(',') !== 'h,obj,surface,t,tag,x,y,zone') p.push('tile keys ' + Object.keys(t).join(',') + ' at ' + key(t));
      if (t.surface && !(typeof t.surface.turns === 'number')) p.push('surface without turns at ' + key(t));
      if (t.obj && (typeof t.obj.hp !== 'number' || typeof t.obj.maxHp !== 'number' || !t.obj.data)) p.push('bad obj instance at ' + key(t));
    });
    return p;
  }

  // =====================================================================================================

  T.suite('mapgen: themes', function (t) {
    t.ok(DD.Themes, 'DD.Themes exists');
    if (!DD.Themes) return;
    t.eq(Object.keys(DD.Themes).sort().join(','), THEME_IDS.slice().sort().join(','), 'enumerable keys are exactly the 9 theme ids');
    t.eq(DD.Themes.ids().join(','), THEME_IDS.join(','), 'ids() in design order');
    const canonFloors = DD.MapGen.CANON.floors, canonObjects = DD.MapGen.CANON.objects, canonSurfaces = DD.MapGen.CANON.surfaces;
    const knownTerrain = function (id) { return DD.MapGen.CANON.terrain.indexOf(id) >= 0 || !!DD.getTerrain(id); };
    const knownObject = function (id) { return canonObjects.indexOf(id) >= 0 || !!DD.getObject(id); };
    THEME_IDS.forEach(function (id) {
      const th = DD.Themes[id];
      if (!t.ok(th && typeof th === 'object', id + ' exists')) return;
      t.eq(th.id, id, id + '.id');
      t.ok(typeof th.name === 'string' && th.name.length > 3, id + ' has a name');
      t.ok(typeof th.flavor === 'string' && th.flavor.length <= 120, id + ' flavor ≤ 120 chars');
      t.ok([1, 2, 3].indexOf(th.act) >= 0, id + ' act');
      t.ok(Array.isArray(th.floors) && th.floors.length >= 2, id + ' has floors');
      th.floors.forEach(function (f) { t.ok(canonFloors.indexOf(f) >= 0 || !!DD.getTerrain(f), id + ' floor ' + f + ' is canonical'); });
      t.eq((th.floorWeights || []).length, th.floors.length, id + ' floorWeights parallel to floors');
      t.ok(knownTerrain(th.walls), id + ' walls terrain known');
      if (th.raisedFloor) t.ok(knownTerrain(th.raisedFloor), id + ' raisedFloor known');
      ['obstacles', 'decor'].forEach(function (k) {
        t.ok(Array.isArray(th[k]), id + '.' + k + ' array');
        (th[k] || []).forEach(function (o) { t.ok(knownObject(o), id + ' ' + k + ' object ' + o + ' known'); });
      });
      t.ok(th.obstacles.length >= 2, id + ' has 2+ obstacle kinds');
      t.ok(Array.isArray(th.hazards) && Array.isArray(th.liquids), id + ' hazards/liquids arrays');
      th.liquids.forEach(function (l) { t.ok(knownTerrain(l), id + ' liquid ' + l); });
      th.hazards.forEach(function (h) { t.ok(knownTerrain(h) || canonSurfaces.indexOf(h) >= 0, id + ' hazard ' + h + ' is a terrain or surface id'); });
      (th.surfaces || []).forEach(function (s) { t.ok(canonSurfaces.indexOf(s) >= 0 || !!DD.getSurface(s), id + ' surface ' + s); });
      t.ok(th.bg && DD.util.parseColor(th.bg.top) && DD.util.parseColor(th.bg.bottom), id + ' bg colors');
      t.ok(AMBIENT.indexOf(th.ambient) >= 0, id + ' ambient kind');
      const g = th.gen || {};
      t.ok(['flat', 'hills', 'terraces'].indexOf(g.elevation) >= 0, id + ' elevation style');
      t.ok(g.maxH >= 1 && g.maxH <= 4, id + ' maxH');
      (g.hazards || []).forEach(function (hz) {
        t.ok(['pools', 'pits', 'patches', 'surface', 'spikes'].indexOf(hz.kind) >= 0, id + ' hazard kind ' + hz.kind);
      });
      (g.hazards || []).concat(g.extras || []).forEach(function (hz) {
        t.ok(['pools', 'pits', 'patches', 'surface', 'circle', 'walls', 'cluster', 'spikes'].indexOf(hz.kind) >= 0, id + ' feature kind ' + hz.kind);
        if (hz.terrain) t.ok(knownTerrain(hz.terrain), id + ' hazard terrain ' + hz.terrain);
        if (hz.kind === 'surface' || hz.kind === 'circle') t.ok(canonSurfaces.indexOf(hz.id) >= 0, id + ' hazard surface ' + hz.id);
        if (hz.kind === 'cluster') t.ok(knownObject(hz.id), id + ' cluster object ' + hz.id);
      });
      ((g.barrier && g.barrier.kinds) || []).forEach(function (b) {
        t.ok(['walls', 'objects', 'channel', 'river', 'chasm'].indexOf(b.kind) >= 0, id + ' barrier kind ' + b.kind);
        (b.ids || []).forEach(function (o) { t.ok(knownObject(o), id + ' barrier object ' + o); });
      });
      if (g.border) (g.border.ids || []).forEach(function (o) { t.ok(knownObject(o), id + ' border object ' + o); });
      t.ok(knownObject(g.filler || 'rock'), id + ' filler object');
    });
    t.eq(DD.Themes.forAct(1).join(','), 'cellar,sewer,warren', 'forAct(1)');
    t.eq(DD.Themes.forAct(2).join(','), 'hauntwood,academy,graveyard', 'forAct(2)');
    t.eq(DD.Themes.forAct(3).join(','), 'hellscape,hoard,dm_table', 'forAct(3)');
    t.eq(DD.Themes.forAct(0).join(','), 'cellar,sewer,warren', 'forAct clamps low');
    t.eq(DD.Themes.forAct(7).join(','), 'hellscape,hoard,dm_table', 'forAct clamps high');
    t.eq(DD.Themes.get('nope').id, 'cellar', 'get() falls back to the cellar');
    t.eq(DD.Themes.get('forAct').id, 'cellar', 'get() never returns a helper');
    t.ok(DD.Themes.has('hoard') && !DD.Themes.has('ids'), 'has()');
    const rng = DD.RNG(5);
    for (let i = 0; i < 20; i++) t.ok(DD.Themes.forAct(2).indexOf(DD.Themes.random(2, rng)) >= 0, 'random(2) is an act-2 theme');
  });

  T.suite('mapgen: generate 300+ maps (validity, zones, connectivity)', function (t) {
    const seeds = t.n || 7;
    const sizes = [[9, 9], [10, 10], [11, 11], [12, 12], [13, 13]];
    let total = 0, failed = 0, fallbacks = 0, attempts = 0;
    const perTheme = {};
    THEME_IDS.forEach(function (theme) {
      const stat = perTheme[theme] = { maps: 0, elevated: 0, objects: 0, hazards: 0, barrier: 0, cliffs: 0, pairs: 0, explosive: 0, chest: 0 };
      sizes.concat([[9, 12], [13, 10]]).forEach(function (sz) {
        for (let s = 0; s < seeds; s++) {
          const seed = theme + ':' + sz.join('x') + ':' + s;
          const map = DD.MapGen.generate({ theme: theme, w: sz[0], h: sz[1], rng: DD.RNG(seed) });
          total++;
          attempts += map.meta.attempts || 1;
          if (map.meta.fallback) fallbacks++;
          const problems = checkMap(map, sz[0], sz[1]);
          if (problems.length) {
            failed++;
            if (failed <= 12) t.fail('map ' + seed + ': ' + problems.slice(0, 4).join(' | '));
          }
          const cs = cliffStats(map.grid);
          stat.maps++;
          stat.cliffs += cs.cliffs; stat.pairs += cs.pairs;
          if (cs.maxH > cs.minH) stat.elevated++;
          if (countWhere(map.grid, function (x) { return !!x.obj; }) >= 4) stat.objects++;
          if (countWhere(map.grid, function (x) { return !DD.MapGen.isSafeTile(x) && x.t !== 'wall' && !(x.obj && !DD.MapGen.objectInfo(x.obj.id).hazard) || ['water', 'mud', 'ice', 'rubble'].indexOf(x.t) >= 0 || !!x.surface; }) > 0) stat.hazards++;
          if (map.meta.barrier) stat.barrier++;
          if (countWhere(map.grid, function (x) { return x.obj && x.obj.id === 'barrel_explosive'; })) stat.explosive++;
          if (countWhere(map.grid, function (x) { return x.obj && x.obj.id === 'chest'; })) stat.chest++;
        }
      });
    });
    t.ok(total >= 300, 'generated ' + total + ' maps (>= 300)');
    t.eq(failed, 0, 'maps failing validation');
    t.ok(fallbacks <= Math.ceil(total * 0.02), 'flat fallback used ' + fallbacks + ' times (<= 2%)');
    t.log('avg attempts ' + (attempts / total).toFixed(2) + ', fallbacks ' + fallbacks + '/' + total);
    THEME_IDS.forEach(function (theme) {
      const s = perTheme[theme];
      const pct = function (n) { return Math.round(100 * n / s.maps); };
      t.log(theme + ': elevated ' + pct(s.elevated) + '% · 4+ objects ' + pct(s.objects) + '% · hazards ' + pct(s.hazards) +
        '% · barrier ' + pct(s.barrier) + '% · barrels ' + pct(s.explosive) + '% · chest ' + pct(s.chest) +
        '% · cliff edges ' + (100 * s.cliffs / Math.max(1, s.pairs)).toFixed(1) + '%');
      t.ok(s.elevated / s.maps >= 0.8, theme + ': most maps have elevation (' + pct(s.elevated) + '%)');
      t.ok(s.objects / s.maps >= 0.9, theme + ': maps have cover objects (' + pct(s.objects) + '%)');
      t.ok(s.hazards / s.maps >= 0.85, theme + ': maps have hazard/terrain features (' + pct(s.hazards) + '%)');
      t.ok(s.cliffs / Math.max(1, s.pairs) <= 0.08, theme + ': cliffs are rare (' + (100 * s.cliffs / Math.max(1, s.pairs)).toFixed(1) + '% of steps)');
    });
  });

  T.suite('mapgen: generate determinism and orientation', function (t) {
    THEME_IDS.forEach(function (theme) {
      const a = DD.MapGen.generate({ theme: theme, w: 11, h: 11, rng: DD.RNG('det:' + theme) });
      const b = DD.MapGen.generate({ theme: theme, w: 11, h: 11, rng: DD.RNG('det:' + theme) });
      t.eq(JSON.stringify(a.grid), JSON.stringify(b.grid), theme + ': same seed, same grid');
      t.eq(JSON.stringify(a.heroZone) + JSON.stringify(a.enemyZone), JSON.stringify(b.heroZone) + JSON.stringify(b.enemyZone), theme + ': same zones');
      const c = DD.MapGen.generate({ theme: theme, w: 11, h: 11, rng: DD.RNG('det2:' + theme) });
      t.ok(JSON.stringify(a.grid) !== JSON.stringify(c.grid), theme + ': different seed, different grid');
    });
    // the rng is consumed: two maps from one rng differ, a cloned state reproduces them
    const r1 = DD.RNG(99), r2 = DD.RNG(99);
    const m1 = DD.MapGen.generate({ theme: 'cellar', w: 10, h: 10, rng: r1 });
    const m2 = DD.MapGen.generate({ theme: 'cellar', w: 10, h: 10, rng: r1 });
    t.ok(JSON.stringify(m1.grid) !== JSON.stringify(m2.grid), 'consecutive maps from one rng differ');
    DD.MapGen.generate({ theme: 'cellar', w: 10, h: 10, rng: r2 });
    t.eq(JSON.stringify(DD.MapGen.generate({ theme: 'cellar', w: 10, h: 10, rng: r2 }).grid), JSON.stringify(m2.grid), 'same rng sequence reproduces both');
    // explicit sides
    ['N', 'E', 'S', 'W'].forEach(function (side) {
      const m = DD.MapGen.generate({ theme: 'sewer', w: 12, h: 10, rng: DD.RNG('side' + side), heroSide: side });
      t.eq(m.meta.heroSide, side, 'heroSide ' + side + ' honoured');
      t.eq(m.grid.w + 'x' + m.grid.h, '12x10', 'size kept for side ' + side);
      t.ok(sideOk(m.heroZone, side, m.grid), 'hero zone on ' + side);
      t.ok(sideOk(m.enemyZone, { N: 'S', S: 'N', E: 'W', W: 'E' }[side], m.grid), 'enemy zone opposite ' + side);
      t.eq(checkMap(m, 12, 10).join(' | '), '', 'side ' + side + ' map valid');
    });
    // default sides are the two edges nearest the camera
    const seen = {};
    for (let i = 0; i < 30; i++) seen[DD.MapGen.generate({ theme: 'warren', w: 10, h: 10, rng: DD.RNG('ds' + i) }).meta.heroSide] = true;
    t.ok(seen.S && seen.E && !seen.N && !seen.W, 'default hero side is S or E: ' + Object.keys(seen).join(','));
    // odd sizes and clamping
    [[5, 5], [6, 8], [16, 9], [24, 24], [3, 40]].forEach(function (sz) {
      const m = DD.MapGen.generate({ theme: 'hellscape', w: sz[0], h: sz[1], rng: DD.RNG('odd' + sz) });
      const w = Math.max(5, Math.min(24, sz[0])), h = Math.max(5, Math.min(24, sz[1]));
      t.eq(m.grid.w + 'x' + m.grid.h, w + 'x' + h, 'size clamped ' + sz.join('x'));
      const v = DD.MapGen.validate(m, { minHero: 4, minEnemy: 4 });
      t.ok(v.ok, 'odd size ' + sz.join('x') + ' valid: ' + v.problems.slice(0, 3).join(' | '));
    });
    const d = DD.MapGen.generate({ rng: DD.RNG(3) });
    t.ok(d.grid.w >= 10 && d.grid.w <= 12 && d.grid.h >= 9 && d.grid.h <= 13, 'default size ' + d.grid.w + 'x' + d.grid.h);
    t.eq(d.theme, 'cellar', 'default theme');
  });

  T.suite('mapgen: generate features', function (t) {
    const gen = function (theme, features, seed, extra) {
      return DD.MapGen.generate(Object.assign({ theme: theme, w: 11, h: 11, rng: DD.RNG(seed), features: features }, extra || {}));
    };
    const any = function (map, fn) { return map.grid.tiles.some(fn); };
    const valid = function (map, label) { const p = checkMap(map, map.grid.w, map.grid.h); t.eq(p.slice(0, 3).join(' | '), '', label + ' valid'); };
    for (let s = 0; s < 4; s++) {
      let m = gen('hellscape', ['lava'], 'f-lava' + s); valid(m, 'lava');
      t.ok(any(m, function (x) { return x.t === 'lava'; }), 'lava feature makes lava');
      m = gen('cellar', ['barrels'], 'f-barrels' + s); valid(m, 'barrels');
      t.ok(m.grid.tiles.filter(function (x) { return x.obj && x.obj.id === 'barrel_explosive'; }).length >= 2, 'barrels feature: 2+ explosive barrels');
      m = gen('graveyard', ['chest'], 'f-chest' + s); valid(m, 'chest');
      t.ok(any(m, function (x) { return x.obj && x.obj.id === 'chest'; }), 'chest feature places a chest');
      m = gen('cellar', ['pits'], 'f-pits' + s); valid(m, 'pits');
      t.ok(any(m, function (x) { return x.t === 'pit'; }), 'pits feature makes pits');
      m = gen('hauntwood', ['river'], 'f-river' + s); valid(m, 'river');
      t.eq(m.meta.barrier, 'river', 'river feature makes a river');
      t.ok(any(m, function (x) { return x.t === 'water' || x.t === 'deep_water'; }), 'river has water');
      m = gen('sewer', ['channel'], 'f-chan' + s); valid(m, 'channel');
      t.ok(any(m, function (x) { return x.t === 'deep_water'; }) && any(m, function (x) { return x.t === 'bridge'; }), 'channel: deep water + bridges');
      m = gen('academy', ['flat'], 'f-flat' + s); valid(m, 'flat');
      t.ok(m.grid.tiles.every(function (x) { return x.h <= 1; }), 'flat feature keeps heights ≤ 1');
      m = gen('dm_table', ['hills'], 'f-hills' + s); valid(m, 'hills');
      t.ok(any(m, function (x) { return x.h >= 2; }), 'hills feature raises ground');
      m = gen('cellar', ['trees', 'gravestones'], 'f-objs' + s); valid(m, 'object features');
      t.ok(any(m, function (x) { return x.obj && x.obj.id === 'tree'; }) && any(m, function (x) { return x.obj && x.obj.id === 'gravestone'; }), 'object id features place those objects');
      m = gen('warren', ['poison', 'oil', 'ice', 'mud'], 'f-surf' + s); valid(m, 'surfaces');
      t.ok(any(m, function (x) { return x.surface && x.surface.id === 'poison'; }) && any(m, function (x) { return x.surface && x.surface.id === 'oil'; }), 'surface features');
      t.ok(any(m, function (x) { return x.t === 'ice'; }) && any(m, function (x) { return x.t === 'mud'; }), 'terrain patch features');
      m = gen('hoard', ['chokepoint', 'bridge'], 'f-choke' + s); valid(m, 'chokepoint');
      t.ok(!!m.meta.barrier, 'chokepoint feature forces a barrier');
      m = gen('academy', ['walls', 'cover', 'spikes', 'fountain', 'braziers'], 'f-misc' + s); valid(m, 'misc features');
      t.ok(any(m, function (x) { return x.obj && x.obj.id === 'fountain'; }), 'fountain feature');
      t.ok(any(m, function (x) { return x.obj && x.obj.id === 'brazier'; }), 'braziers feature');
    }
    const before = DD.problems.length;
    const u = gen('cellar', ['xyzzy', 'Lava Rivers', 'EXPLOSIVES', 7, null], 'f-unknown');
    t.eq(u.meta.unknownFeatures.join(','), 'xyzzy', 'unknown features recorded');
    t.eq(DD.problems.length, before, 'unknown features do not warn outside debug mode');
    t.eq(DD.MapGen.parseFeatures(['Lava Rivers']).flags.lava_river, true, 'feature names are case/space insensitive');
    // density
    let sparse = 0, dense = 0;
    for (let s = 0; s < 6; s++) {
      sparse += gen('cellar', [], 'dens' + s, { density: 0 }).grid.tiles.filter(function (x) { return x.obj; }).length;
      dense += gen('cellar', [], 'dens' + s, { density: 2 }).grid.tiles.filter(function (x) { return x.obj; }).length;
    }
    t.ok(dense > sparse * 1.5, 'density 2 has more objects than density 0 (' + dense + ' vs ' + sparse + ')');
    // required objects (objectives)
    for (let s = 0; s < 6; s++) {
      const m = gen(THEME_IDS[s], [], 'req' + s, { objects: [{ id: 'totem', count: 3, where: 'enemy' }, { id: 'keg', count: 1, where: 'hero' }] });
      valid(m, 'required objects');
      const totems = m.grid.tiles.filter(function (x) { return x.obj && x.obj.id === 'totem'; });
      t.eq(totems.length, 3, THEME_IDS[s] + ': 3 totems placed');
      totems.forEach(function (x) {
        const open = DIRS.filter(function (d) { const n = tileAt(m.grid, x.x + d[0], x.y + d[1]); return n && DD.MapGen.isSafeTile(n); }).length;
        t.ok(open >= 2, 'totem at ' + key(x) + ' is reachable from 2+ sides');
      });
      t.ok(m.grid.tiles.some(function (x) { return x.obj && x.obj.id === 'keg'; }), THEME_IDS[s] + ': protect object placed');
      t.eq(m.meta.required.map(function (r) { return r.placed; }).join(','), '3,1', 'meta.required reports placements');
    }
    // a bare-bones theme added by content still generates valid maps
    DD.Themes.mgt_bare = { id: 'mgt_bare', name: 'Bare', act: 1, floors: [], obstacles: ['crate'] };
    try {
      for (let s = 0; s < 5; s++) valid(gen('mgt_bare', ['lava', 'pits'], 'bare' + s), 'bare theme');
    } finally { delete DD.Themes.mgt_bare; }
    // enemy zone sizing
    const big = gen('cellar', [], 'bigzone', { enemyZoneSize: 16 });
    t.ok(big.enemyZone.length >= 16, 'enemy zone grows with enemyZoneSize (' + big.enemyZone.length + ')');
    valid(big, 'big enemy zone');
  });

  T.suite('mapgen: layouts', function (t) {
    const layout = {
      theme: 'cellar',
      layout: [
        '#..E..B..#',
        '.C.X.P.T..',
        '~~^^__,,**',
        '."L.S.O.$F',
        '.R.....Q..',
        '..HHHH=%&',
      ],
      heights: [
        '0001110000',
        '0001110000',
        '0000000000',
        '0000000000',
        '0222000000',
        '0000000000',
      ],
      legend: {
        R: { terrain: 'rubble', obj: { id: 'lever', label: 'Tax Loophole #1', data: { n: 1 } }, h: 3, mark: 'loophole', surface: 'oil' },
        '%': 'sand',
        F: { obj: 'fountain', zone: 'hero' },
      },
    };
    const m = DD.MapGen.fromLayout(layout, DD.RNG(1));
    const g = m.grid;
    t.eq(g.w + 'x' + g.h, '10x6', 'size from rows (ragged row padded)');
    t.eq(Object.keys(g).sort().join(','), 'h,tiles,w', 'grid has exactly w,h,tiles');
    const at = function (x, y) { return tileAt(g, x, y); };
    t.eq(at(0, 0).t, 'wall', '# is the theme wall');
    t.ok(DD.Themes.cellar.floors.indexOf(at(1, 0).t) >= 0, '. is a theme floor');
    t.eq(at(3, 0).zone, 'enemy', 'E is enemy zone');
    t.eq(at(3, 0).tag, 'enemy_spawn', 'E tag');
    t.eq(at(6, 0).zone, 'enemy', 'B is enemy zone');
    t.eq(at(1, 1).obj.id, 'crate', 'C crate');
    t.eq(at(3, 1).obj.id, 'barrel_explosive', 'X explosive barrel');
    t.eq(at(3, 1).h, 1, 'heights row applied');
    t.eq(at(5, 1).obj.id, 'pillar', 'P pillar');
    t.eq(at(7, 1).obj.id, 'tree', 'T tree');
    t.eq([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(function (x) { return at(x, 2).t; }).join(','), 'water,water,lava,lava,pit,pit,mud,mud,ice,ice', 'liquid/terrain chars');
    t.eq(at(1, 3).t + '+' + at(1, 3).obj.id, 'grass+bush', '" grass + bush');
    t.eq(at(2, 3).obj.id, 'lever', 'L lever');
    t.eq(at(4, 3).obj.id, 'spikes', 'S spikes');
    t.eq(at(6, 3).obj.id, 'pressure_plate', 'O pressure plate');
    t.eq(at(8, 3).obj.id, 'chest', '$ chest');
    t.eq(at(9, 3).obj.id + ':' + at(9, 3).zone, 'fountain:hero', 'custom legend replaces the default F entry');
    const r = at(1, 4);
    t.eq(r.t, 'rubble', 'custom terrain');
    t.eq(r.h, 3, 'legend h beats the heights row');
    t.eq(r.obj.label + '|' + r.obj.data.n, 'Tax Loophole #1|1', 'object overrides');
    t.eq(r.surface && r.surface.id, 'oil', 'custom surface');
    t.eq(r.tag, 'loophole', 'mark sets the tag');
    t.eq(JSON.stringify(m.marks.loophole), '[{"x":1,"y":4}]', 'named mark');
    t.eq(JSON.stringify(m.marks.R), '[{"x":1,"y":4}]', 'char mark');
    t.eq(at(2, 4).h, 2, 'heights digits');
    t.ok(DD.Themes.cellar.floors.indexOf(at(7, 4).t) >= 0 && !at(7, 4).obj, 'unknown char Q is plain floor');
    t.eq(JSON.stringify(m.marks.Q), '[{"x":7,"y":4}]', 'unknown chars are still marked');
    t.eq(m.marks.E.length + ':' + m.marks.B.length + ':' + m.marks.H.length, '1:1:4', 'E/B/H marks');
    t.eq(at(6, 5).t, 'bridge', '= bridge');
    t.eq(at(7, 5).t, 'sand', 'string legend entry');
    t.eq(at(8, 5).t, 'deep_water', '& deep water');
    t.ok(DD.Themes.cellar.floors.indexOf(at(9, 5).t) >= 0, 'padding is floor');
    t.eq(m.heroZone.length, 5, 'hero zone = H tiles + custom zone tile');
    t.eq(m.enemyZone.length, 2, 'enemy zone = E + B');
    t.ok(m.heroZone.every(function (p) { return at(p.x, p.y).zone === 'hero'; }), 'heroZone tiles are marked');
    // auto zones
    const bare = DD.MapGen.fromLayout({ theme: 'hoard', layout: ['.........', '..#...#..', '.........', '.........'] });
    t.ok(bare.heroZone.length >= 6 && bare.enemyZone.length >= 6, 'missing zones are generated (' + bare.heroZone.length + '/' + bare.enemyZone.length + ')');
    t.ok(bare.heroZone.every(function (p) { return p.y >= 2; }) && bare.enemyZone.every(function (p) { return p.y <= 1; }), 'auto zones on bottom/top rows');
    t.ok(DD.MapGen.validate(bare, { layout: true }).ok, 'auto-zoned layout validates');
    const multi = DD.MapGen.fromLayout({ theme: 'dm_table', layout: 'EE.EE\n.....\n..#..\n.....\nHHHHH' });
    t.eq(multi.grid.w + 'x' + multi.grid.h, '5x5', 'layout as a newline string');
    t.ok(DD.MapGen.validate(multi, { layout: true }).ok, 'string layout validates: ' + DD.MapGen.validate(multi, { layout: true }).problems.join('|'));
    t.eq(JSON.stringify(DD.MapGen.fromLayout(layout, DD.RNG(1)).grid), JSON.stringify(g), 'layouts are deterministic per rng');
    const broken = DD.MapGen.fromLayout({ layout: ['HH#EE', '..#..'] });
    t.ok(!DD.MapGen.validate(broken, { layout: true }).ok, 'validate() flags a layout whose zones are walled apart');
    t.ok(DD.MapGen.fromLayout(null).grid.tiles.length >= 1, 'null layout does not throw');
    t.ok(DD.MapGen.fromLayout({ layout: [] }).grid.tiles.length >= 1, 'empty layout does not throw');
    // fromDef dispatch
    t.ok(DD.MapGen.fromDef({ layout: ['H.E'] }, DD.RNG(1)).marks, 'fromDef handles layouts');
    t.ok(!DD.MapGen.fromDef({ theme: 'sewer', w: 9, h: 9 }, DD.RNG(1)).marks, 'fromDef handles procedural maps');
  });

  // =====================================================================================================
  // Encounters
  // =====================================================================================================

  function enemyIds(tiers) {
    const out = [];
    for (const id in DD.defs.enemies) {
      const e = DD.defs.enemies[id];
      if (!tiers || tiers.indexOf(e.tier) >= 0) out.push(id);
    }
    return out;
  }
  function heroIds() { return Object.keys(DD.defs.heroes); }
  function runHero(id, extra) {
    return Object.assign({ id: id, level: 2, xp: 12, hp: 20, skills: [], items: { weapon: null, armor: null, trinket: null },
      scars: [], downs: 0, dead: false, kills: 0 }, extra || {});
  }
  function countRange(entries) {
    let lo = 0, hi = 0;
    (entries || []).forEach(function (e) {
      if (typeof e === 'string') e = { id: e, n: 1 };
      if (!e || typeof e.id !== 'string') return;
      if (Array.isArray(e.n)) { lo += Math.min(e.n[0], e.n[1]); hi += Math.max(e.n[0], e.n[1]); }
      else if (typeof e.n === 'number') { lo += e.n; hi += e.n; }
      else { lo += 1; hi += 1; }
    });
    return [lo, hi];
  }

  /** Hard checks on a setup; returns problems (strings). opts.layout → connectivity problems are soft. */
  function checkSetup(setup, def, party, difficulty, opts) {
    const p = [], soft = [];
    opts = opts || {};
    const g = setup && setup.grid;
    if (!g || !Array.isArray(g.tiles) || g.tiles.length !== g.w * g.h) return { hard: ['bad grid'], soft: soft };
    ['grid', 'theme', 'heroes', 'enemies', 'objective', 'rules', 'encounter', 'deployTiles', 'reinforcements'].forEach(function (k) {
      if (setup[k] === undefined) p.push('setup.' + k + ' missing');
    });
    if (!DD.Themes.has(setup.theme)) p.push('unknown theme ' + setup.theme);
    if (setup.encounter !== def) p.push('setup.encounter is not the def');
    const layout = !!(def.map && def.map.layout);
    const v = DD.MapGen.validate({ grid: g, heroZone: setup.heroZone, enemyZone: setup.enemyZone }, { layout: layout });
    if (!v.ok) (layout ? soft : p).push('map: ' + v.problems.slice(0, 2).join(' | '));
    if (!layout && setup.deployTiles.length < 6) p.push('deployTiles ' + setup.deployTiles.length);
    const alive = (party || []).filter(function (h) { return h && (typeof h === 'string' || !h.dead); });
    if (setup.heroes.length !== alive.length) p.push('heroes placed ' + setup.heroes.length + ' != ' + alive.length);
    const taken = {};
    const deploy = {};
    setup.deployTiles.forEach(function (d) { deploy[key(d)] = true; });
    setup.heroes.forEach(function (h, i) {
      const want = alive[i];
      const wantId = typeof want === 'string' ? want : want && want.id;
      if (h.id !== wantId) p.push('hero order: ' + h.id + ' != ' + wantId);
      if (typeof want === 'object' && h.runHero !== want) p.push('hero ' + h.id + ' lost its runHero');
      const t = tileAt(g, h.x, h.y);
      if (!t || !DD.MapGen.isSafeTile(t)) p.push('hero ' + h.id + ' on bad tile ' + key(h));
      if (taken[key(h)]) p.push('two units on ' + key(h));
      taken[key(h)] = true;
      if (setup.deployTiles.length >= alive.length && !deploy[key(h)]) p.push('hero ' + h.id + ' outside the deploy zone');
    });
    const range = countRange(def.enemies);
    const extra = difficulty === 'brutal' && (def.kind || 'normal') === 'normal' && range[1] > 0 ? 1 : 0;
    if (setup.enemies.length < range[0] + extra || setup.enemies.length > range[1] + extra) {
      p.push('enemy count ' + setup.enemies.length + ' outside ' + (range[0] + extra) + '..' + (range[1] + extra));
    }
    setup.enemies.forEach(function (e) {
      if (typeof e.id !== 'string' || typeof e.x !== 'number' || typeof e.y !== 'number') { p.push('bad enemy entry'); return; }
      const t = tileAt(g, e.x, e.y);
      if (!t || !DD.MapGen.isSafeTile(t)) p.push('enemy ' + e.id + ' on bad tile ' + key(e));
      if (taken[key(e)]) p.push('two units on ' + key(e));
      taken[key(e)] = true;
      setup.heroes.forEach(function (h) { if (Math.abs(h.x - e.x) + Math.abs(h.y - e.y) < 2) soft.push('enemy adjacent to hero at ' + key(e)); });
    });
    const o = setup.objective;
    if (!o || typeof o.type !== 'string' || typeof o.text !== 'string' || o.text.length < 8) p.push('bad objective');
    else if (o.text.length > 100) p.push('objective text too long: ' + o.text);
    if (!Array.isArray(setup.rules)) p.push('rules not an array');
    (def.rules || []).forEach(function (r, i) { if (setup.rules[i] === r) p.push('rule objects must be copies'); });
    setup.reinforcements.forEach(function (w) {
      if (!(w.round >= 1) || !Array.isArray(w.enemies) || typeof w.edge !== 'string') p.push('bad wave ' + JSON.stringify(w));
    });
    return { hard: p, soft: soft };
  }

  const SYNTH = {
    procedural: { id: 'mgt_proc', act: 1, kind: 'normal', name: 'Test Brawl', map: { theme: 'cellar', w: 11, h: 11, features: ['barrels', 'water'] },
      enemies: [{ id: 'x_grunt', n: [2, 3] }, { id: 'x_archer', n: 1 }], objective: { type: 'killAll' },
      reinforcements: [{ round: 3, enemies: [{ id: 'x_grunt', n: 2 }], edge: 'north' }, { round: 5, enemies: [{ id: 'x_grunt' }] }],
      rules: [{ id: 'r1', name: 'Slippery', hooks: {}, turns: -1 }] },
    elite: { id: 'mgt_elite', act: 2, kind: 'elite', map: { theme: 'graveyard', w: 12, h: 10 },
      enemies: [{ id: 'x_elite', n: 1 }, { id: 'x_grunt', n: [1, 2] }] },
    layout: { id: 'mgt_layout', act: 1, kind: 'boss', map: { theme: 'warren', layout: [
      '#..E.B.E..#', '...........', '..C.....C..', '...........', '.....R.....', '...........', '..HHHHHHH..'],
    legend: { R: { mark: 'rat_spot' } } },
    enemies: [{ id: 'x_grunt', n: 2 }, { id: 'x_rat', n: 1, mark: 'rat_spot' }, { id: 'x_pinned', x: 9, y: 1 }, { id: 'x_grunt', n: 3 }],
    objective: { type: 'survive' } },
    destroy: { id: 'mgt_destroy', act: 2, kind: 'normal', map: { theme: 'academy', w: 11, h: 11 },
      enemies: [{ id: 'x_grunt', n: 3 }], objective: { type: 'destroy', objId: 'totem', count: 3 } },
    protect: { id: 'mgt_protect', act: 1, kind: 'normal', map: { theme: 'cellar', w: 10, h: 10 },
      enemies: [{ id: 'x_grunt', n: [3, 4] }], objective: { type: 'protect', objId: 'keg' } },
    crowded: { id: 'mgt_crowd', act: 3, kind: 'normal', map: { theme: 'dm_table', w: 9, h: 9 },
      enemies: [{ id: 'x_grunt', n: 12 }] },
    nomap: { id: 'mgt_nomap', act: 3, kind: 'normal', enemies: ['x_grunt', { id: 'x_archer', n: [0, 1] }] },
  };

  T.suite('mapgen: encounter build (synthetic encounters)', function (t) {
    const ids = ['test_a', 'test_b', 'test_c', 'test_d'];
    const rh = [runHero('hero_one'), runHero('hero_two', { dead: true }), runHero('hero_three'), runHero('hero_four'), runHero('hero_five')];
    let builds = 0;
    Object.keys(SYNTH).forEach(function (k) {
      const def = SYNTH[k];
      ['casual', 'normal', 'brutal'].forEach(function (diff) {
        [ids, rh].forEach(function (party, pi) {
          for (let s = 0; s < 3; s++) {
            const setup = t.tryRun(k, function () { return DD.Encounter.build(def, party, { rng: DD.RNG(k + diff + pi + s), difficulty: diff, act: def.act }); });
            builds++;
            if (!setup) continue;
            const res = checkSetup(setup, def, party, diff);
            if (res.hard.length) t.fail(k + '/' + diff + '/' + pi + '/' + s + ': ' + res.hard.slice(0, 3).join(' | '));
          }
        });
      });
    });
    t.ok(builds >= 100, builds + ' builds');
    // brutal adds exactly one enemy to normal encounters (same seed), none to elites
    const n1 = DD.Encounter.build(SYNTH.procedural, ids, { rng: DD.RNG('b1'), difficulty: 'normal' }).enemies.length;
    const b1 = DD.Encounter.build(SYNTH.procedural, ids, { rng: DD.RNG('b1'), difficulty: 'brutal' }).enemies.length;
    t.eq(b1, n1 + 1, 'brutal: +1 enemy in a normal encounter');
    const n2 = DD.Encounter.build(SYNTH.elite, ids, { rng: DD.RNG('b2'), difficulty: 'normal' }).enemies.length;
    const b2 = DD.Encounter.build(SYNTH.elite, ids, { rng: DD.RNG('b2'), difficulty: 'brutal' }).enemies.length;
    t.eq(b2, n2, 'brutal: elites keep their count');
    const bd = DD.Encounter.build(SYNTH.procedural, ids, { rng: DD.RNG('b3'), difficulty: { id: 'brutal' } });
    t.eq(bd.difficulty.id + ':' + bd.difficulty.hp + ':' + bd.difficulty.dmg, 'brutal:1.25:1.2', 'difficulty info');
    // determinism
    const s1 = DD.Encounter.build(SYNTH.procedural, rh, { rng: DD.RNG('det') });
    const s2 = DD.Encounter.build(SYNTH.procedural, rh, { rng: DD.RNG('det') });
    t.eq(JSON.stringify([s1.grid, s1.heroes.map(key), s1.enemies, s1.objective]), JSON.stringify([s2.grid, s2.heroes.map(key), s2.enemies, s2.objective]), 'same rng, same setup');
    // layout placement: marks, explicit positions, boss on B
    const L = DD.Encounter.build(SYNTH.layout, ids, { rng: DD.RNG('lay') });
    t.eq(L.enemies.filter(function (e) { return e.id === 'x_rat'; }).map(key).join(), '5,4', 'enemy entry mark hint');
    t.eq(L.enemies.filter(function (e) { return e.id === 'x_pinned'; }).map(key).join(), '9,1', 'enemy entry x/y hint');
    const occupied = {};
    L.enemies.forEach(function (e) { occupied[key(e)] = e.id; });
    t.eq([L.marks.E[0], L.marks.B[0], L.marks.E[1]].map(function (p) { return occupied[key(p)] || '-'; }).join(','), 'x_grunt,x_grunt,x_grunt', 'E/B marks filled first');
    t.eq(L.enemies.length, 7, 'all layout enemies placed (overflow beside the marks)');
    t.eq(L.objective.type + ':' + L.objective.rounds, 'survive:5', 'survive defaults to 5 rounds');
    t.ok(/Survive 5 rounds/.test(L.objective.text), 'survive text: ' + L.objective.text);
    t.eq(JSON.stringify(L.marks.rat_spot), '[{"x":5,"y":4}]', 'setup.marks');
    t.eq(DD.Encounter.marks({ grid: L.grid }), L.marks, 'marks(state) finds the setup marks by grid');
    const cloned = JSON.parse(JSON.stringify(L.grid));
    t.eq(JSON.stringify(DD.Encounter.marks({ grid: cloned }).rat_spot), '[{"x":5,"y":4}]', 'marks(state) falls back to tile tags');
    t.eq(DD.Encounter.marks({ grid: cloned }).enemy_spawn.length, 2, 'E tiles tagged enemy_spawn');
    t.ok(L.heroes.every(function (h) { return h.y === 6; }), 'heroes on the H tiles');
    // objectives on procedural maps
    const D = DD.Encounter.build(SYNTH.destroy, ids, { rng: DD.RNG('des') });
    t.eq(D.grid.tiles.filter(function (x) { return x.obj && x.obj.id === 'totem'; }).length, 3, 'destroy objective: totems placed on the map');
    t.eq(D.objective.count, 3, 'destroy count kept');
    t.ok(/^Destroy 3 /.test(D.objective.text), 'destroy text: ' + D.objective.text);
    const P = DD.Encounter.build(SYNTH.protect, ids, { rng: DD.RNG('pro') });
    t.ok(P.grid.tiles.some(function (x) { return x.obj && x.obj.id === 'keg'; }), 'protect objective: keg on the map');
    t.ok(/^Protect the /.test(P.objective.text), 'protect text: ' + P.objective.text);
    const C = DD.Encounter.build(SYNTH.crowded, ids, { rng: DD.RNG('crowd') });
    t.eq(C.enemies.length, 12, 'a dozen enemies still fit on a 9x9 map');
    const K = DD.Encounter.build(SYNTH.procedural, ids, { rng: DD.RNG('kill') });
    t.ok(/^Defeat all enemies\./.test(K.objective.text), 'killAll text: ' + K.objective.text);
    t.ok(K.objective.flavor && K.objective.text === 'Defeat all enemies. ' + K.objective.flavor, 'the joke is kept in objective.flavor');
    t.ok(/^Destroy 3 Totems\. /.test(D.objective.text) && D.objective.flavor.length > 5, 'destroy text names the object: ' + D.objective.text);
    t.eq(K.reinforcements[0].edge + K.reinforcements[1].edge, 'Nzone', 'wave edges normalized');
    t.eq(K.reinforcements[1].enemies[0].id, 'x_grunt', 'wave enemies copied');
    t.ok(K.rules[0] !== SYNTH.procedural.rules[0] && K.rules[0].id === 'r1', 'rules copied');
    const N = DD.Encounter.build(SYNTH.nomap, ids, { rng: DD.RNG('nm'), act: 3 });
    t.ok(DD.Themes.forAct(3).indexOf(N.theme) >= 0, 'missing map → a theme of the act (' + N.theme + ')');
    // by id, custom objective text, empty party, bogus input
    const bossDef = { id: 'mgt_boss', act: 1, kind: 'boss', enemies: [{ id: 'wm_duck_foe', n: 2 }], objective: { type: 'boss', bossId: 'wm_duck_foe' } };
    const B = DD.Encounter.build(bossDef, [], { rng: DD.RNG('boss') });
    t.ok(/^Defeat Hostile Duck\./.test(B.objective.text), 'boss text names the boss: ' + B.objective.text);
    t.eq(B.heroes.length, 0, 'empty party is fine');
    const custom = DD.Encounter.build({ id: 'mgt_custom', act: 1, kind: 'normal', enemies: [], objective: { type: 'custom', text: 'Pet the dog.' } }, ids, { rng: DD.RNG(1) });
    t.eq(custom.objective.text, 'Pet the dog.', 'explicit objective text kept');
    t.eq(custom.objective.flavor, undefined, 'no joke added to an explicit objective text');
    t.eq(DD.Encounter.objectiveText({ type: 'survive', rounds: 4 }, {}), 'Survive 4 rounds. Backup is "five minutes out".', 'objectiveText helper');
    const before = DD.problems.length;
    const junk = DD.Encounter.build({ id: 'mgt_junk', act: 9, kind: 'normal', map: { theme: 'nope', w: 'x' }, enemies: [null, { n: 3 }, { id: 'x_grunt', n: [-2, -1] }], objective: 'kill' }, null, { rng: DD.RNG(2) });
    t.ok(junk && junk.grid && junk.enemies.length === 0, 'junk encounter builds');
    t.ok(DD.problems.slice(before).some(function (w) { return /unknown theme/.test(w); }), 'unknown theme warns');
    t.ok(DD.problems.slice(before).every(function (w) { return !/^Error in /.test(w); }), 'no swallowed errors for junk input');
  });

  T.suite('mapgen: encounter build (registered encounters)', function (t) {
    const all = Object.keys(DD.defs.encounters).map(function (id) { return DD.defs.encounters[id]; }).filter(function (e) { return !e.synthetic; });
    if (!all.length) { t.skip('no encounters registered yet'); return; }
    const hids = heroIds();
    const party = (hids.length >= 4 ? hids.slice(0, 4) : ['test_a', 'test_b', 'test_c', 'test_d']).map(function (id) { return runHero(id); });
    let soft = 0;
    all.forEach(function (def) {
      ['normal', 'brutal'].forEach(function (diff) {
        for (let s = 0; s < 2; s++) {
          const setup = t.tryRun(def.id, function () { return DD.Encounter.build(def, party, { rng: DD.RNG(def.id + diff + s), difficulty: diff, act: def.act }); });
          if (!setup) continue;
          const res = checkSetup(setup, def, party, diff);
          if (res.hard.length) t.fail(def.id + ' (' + diff + '): ' + res.hard.slice(0, 3).join(' | '));
          else t.ok(true, def.id + ' builds');
          if (res.soft.length) { soft++; if (s === 0 && diff === 'normal') t.log(def.id + ' (content note): ' + res.soft.slice(0, 2).join(' | ')); }
        }
      });
      const feats = def.map && def.map.features ? DD.MapGen.parseFeatures(def.map.features).unknown : [];
      if (feats.length) t.log(def.id + ': unknown map features ' + feats.join(', '));
      (def.enemies || []).forEach(function (e) { if (e && e.id && !DD.getEnemy(e.id)) t.log(def.id + ': unknown enemy ' + e.id); });
    });
    t.log(all.length + ' encounters, ' + soft + ' builds with content notes');
  });

  T.suite('mapgen: encounter pick', function (t) {
    const mk = function (id, act, kind, extra) { return Object.assign({ id: id, act: act, kind: kind, weight: 1, minDepth: 0 }, extra || {}); };
    const list = [
      mk('a1_n1', 1, 'normal'), mk('a1_n2', 1, 'normal', { minDepth: 3 }), mk('a1_n0', 1, 'normal', { weight: 0 }),
      mk('a1_e1', 1, 'elite', { minDepth: 2 }), mk('a2_n1', 2, 'normal'), mk('a2_b1', 2, 'boss'),
      mk('test_a1_b', 1, 'boss'), mk('test_a3_n', 3, 'normal'),
    ];
    const rng = DD.RNG('pick');
    const pick = function (act, kind, opts) { return DD.Encounter.pickFrom(list, act, kind, rng, opts); };
    const many = function (act, kind, opts, n) { const s = {}; for (let i = 0; i < (n || 40); i++) { const e = pick(act, kind, opts); s[e ? e.id : 'null'] = true; } return Object.keys(s).sort().join(','); };
    t.eq(many(1, 'normal', { depth: 0 }), 'a1_n1', 'depth gates minDepth; weight 0 never picked when others exist');
    t.eq(many(1, 'normal', { depth: 5 }), 'a1_n1,a1_n2', 'deeper rows allow more');
    t.eq(many(1, 'normal', { depth: 5, exclude: ['a1_n1'] }), 'a1_n2', 'exclude (array)');
    t.eq(many(1, 'normal', { depth: 5, exclude: { a1_n1: true, a1_n2: true } }), 'a1_n1,a1_n2', 'exclude is relaxed when it empties the pool');
    t.eq(many(1, 'normal', { depth: 5, exclude: new Set(['a1_n2']) }), 'a1_n1', 'exclude (Set)');
    t.eq(many(1, 'elite', { depth: 0 }), 'a1_e1', 'depth relaxed before giving up on the kind');
    t.eq(many(1, 'boss', {}), 'test_a1_b', 'test_ content is a fallback for a missing kind');
    t.eq(many(2, 'boss', {}), 'a2_b1', 'boss by act');
    t.eq(many(2, 'elite', {}), 'a2_n1', 'elite falls back to normal of the same act');
    t.eq(many(3, 'normal', {}), 'test_a3_n', 'test_ content used when nothing real exists for the act');
    t.eq(many(3, 'elite', {}), 'test_a3_n', 'kind relaxes before act');
    t.eq(pick(1, 'normal', {}).act, 1, 'no depth → act matches');
    t.eq(DD.Encounter.pickFrom([], 1, 'normal', rng), null, 'empty list → null');
    t.eq(DD.Encounter.pickFrom([mk('only', 2, 'elite')], 1, 'boss', rng).id, 'only', 'anything beats nothing');
    // weights
    const wl = [mk('w1', 1, 'normal', { weight: 1 }), mk('w9', 1, 'normal', { weight: 9 })];
    let nine = 0;
    for (let i = 0; i < 400; i++) if (DD.Encounter.pickFrom(wl, 1, 'normal', rng).id === 'w9') nine++;
    t.ok(nine > 320 && nine < 395, 'weights respected (' + nine + '/400)');
    t.eq(many(1, 'normal', { exclude: ['a1_n1', 'a1_n2'] }), 'a1_n1,a1_n2', 'weight-0 encounters only when nothing weighted exists');
    t.eq(DD.Encounter.pickFrom([mk('z', 1, 'normal', { weight: 0 })], 1, 'normal', rng).id, 'z', 'weight 0 still beats nothing');
    // the real registry
    const fighters = enemyIds().filter(function (id) { return !/^wm_/.test(id); });
    [1, 2, 3].forEach(function (act) {
      ['normal', 'elite', 'boss'].forEach(function (kind) {
        const e = DD.Encounter.pick(act, kind, DD.RNG(act + kind), { depth: 6 });
        if (!fighters.length && !Object.keys(DD.defs.encounters).length) { t.eq(e, null, 'nothing to fight → null'); return; }
        t.ok(e && typeof e.id === 'string', 'pick(' + act + ', ' + kind + ') → ' + (e && e.id));
        if (e && !e.synthetic && Object.keys(DD.defs.encounters).some(function (id) {
          const d = DD.defs.encounters[id]; return d.act === act && d.kind === kind && !/^test_|^mg_/.test(id);
        })) t.ok(e.act === act && e.kind === kind && !/^test_/.test(e.id), 'real ' + act + '/' + kind + ' content preferred (' + e.id + ')');
      });
    });
    const syn = DD.Encounter.synthesize(2, 'elite', DD.RNG(4), { register: false });
    if (!fighters.length) t.eq(syn, null, 'synthesize needs real enemies (the duck does not count)');
    else {
      t.ok(syn && syn.synthetic && syn.enemies.length >= 1, 'synthesize builds a fallback encounter');
      t.ok(!DD.getEncounter(syn.id) || DD.getEncounter(syn.id) !== syn, 'synthesize({ register: false }) does not register');
      const s = DD.Encounter.build(syn, ['test_a'], { rng: DD.RNG(5) });
      t.ok(s.enemies.length >= 1, 'synthesized encounter builds');
    }
  });

  T.suite('mapgen: reinforcement waves (spawnWave)', function (t) {
    if (!DD.Combat || typeof DD.Combat.start !== 'function' || !DD.Act || typeof DD.Act.spawn !== 'function') {
      t.skip('DD.Combat.start / DD.Act.spawn not available yet');
      return;
    }
    const foes = enemyIds(['normal', 'minion']);
    const heroes = heroIds();
    if (!foes.length || heroes.length < 2) { t.skip('needs registered heroes and enemies'); return; }
    ['N', 'E', 'S', 'W', 'zone'].forEach(function (edge, i) {
      const def = { id: 'mgt_wave_' + edge, act: 1, kind: 'normal', map: { theme: 'cellar', w: 11, h: 11, heroSide: 'S' },
        enemies: [{ id: foes[0], n: 2 }], objective: { type: 'killAll' } };
      const setup = DD.Encounter.build(def, heroes.slice(0, 3), { rng: DD.RNG('wave' + i) });
      const state = t.tryRun('Combat.start', function () { return DD.Combat.start(setup, { seed: 'wave' + i, headless: true }); });
      if (!state) return;
      const before = state.units.filter(function (u) { return !u.dead; }).length;
      const spawned = t.tryRun('spawnWave', function () { return DD.Encounter.spawnWave(state, { round: 2, enemies: [{ id: foes[0], n: 3 }], edge: edge }); }) || [];
      t.eq(spawned.length, 3, edge + ': 3 reinforcements spawned');
      t.eq(state.units.filter(function (u) { return !u.dead; }).length, before + spawned.length, edge + ': units added to the state');
      const seen = {};
      state.units.filter(function (u) { return !u.dead; }).forEach(function (u) {
        t.ok(!seen[key(u)], edge + ': no stacked units at ' + key(u));
        seen[key(u)] = true;
      });
      spawned.forEach(function (u) {
        const tl = tileAt(state.grid, u.x, u.y);
        t.ok(tl && DD.MapGen.isSafeTile(tl), edge + ': spawned on a safe tile');
        t.eq(u.side, 'enemy', edge + ': spawned on the enemy side');
        const depth = { N: u.y, S: state.grid.h - 1 - u.y, W: u.x, E: state.grid.w - 1 - u.x }[edge];
        if (edge !== 'zone') t.ok(depth <= 3, edge + ': spawned near the ' + edge + ' edge (depth ' + depth + ')');
      });
    });
    const st = DD.Combat.state;
    const none = DD.Encounter.spawnWave(st, { round: 1, enemies: [{ id: 'no_such_enemy', n: 2 }], edge: 'N' });
    t.eq(none.length, 0, 'unknown enemy ids spawn nothing');
    t.eq(DD.Encounter.spawnWave(null, null).length, 0, 'null wave is harmless');
  });

  T.suite('mapgen: combat integration', function (t) {
    if (!DD.Combat || typeof DD.Combat.start !== 'function' || !DD.Grid || !DD.Grid.path) { t.skip('DD.Combat.start not available yet'); return; }
    const heroes = heroIds(), foes = enemyIds(['normal', 'minion']);
    if (heroes.length < 2 || !foes.length) { t.skip('needs registered heroes and enemies'); return; }
    THEME_IDS.forEach(function (theme, i) {
      const def = { id: 'mgt_int_' + theme, act: DD.Themes[theme].act, kind: 'normal', map: { theme: theme, w: 11, h: 11 },
        enemies: [{ id: foes[i % foes.length], n: 3 }], objective: { type: 'killAll' } };
      const setup = DD.Encounter.build(def, heroes.slice(0, 4), { rng: DD.RNG('int' + theme) });
      const state = t.tryRun('start ' + theme, function () { return DD.Combat.start(setup, { seed: 'int' + theme, headless: true }); });
      if (!state) return;
      t.ok(state.grid && state.grid.w === setup.grid.w && state.grid.h === setup.grid.h, theme + ': combat uses the generated grid');
      const hs = state.units.filter(function (u) { return u.side === 'hero' && u.kind === 'hero'; });
      t.eq(hs.length, Math.min(4, heroes.length), theme + ': heroes spawned');
      hs.forEach(function (h) {
        const s = setup.heroes.filter(function (x) { return x.id === h.defId; })[0];
        t.ok(s && s.x === h.x && s.y === h.y, theme + ': ' + h.defId + ' at its setup position');
      });
      const h0 = hs[0];
      const target = setup.enemyZone.filter(function (p) { return !DD.Grid.unitAt(p.x, p.y); })[0];
      if (h0 && target) t.ok(!!DD.Grid.path(h0, target.x, target.y, { ignoreUnits: true }), theme + ': a hero can walk to the enemy zone (DD.Grid.path)');
    });
  });

  // VERIFY-ENGINE: the generator's guarantees re-checked with the rules engine itself (DD.Grid: real terrain/object
  // defs, canStep height rule, Dijkstra pathing), so MapGen's internal model and the engine can never drift apart.
  T.suite('mapgen: DD.Grid agrees — every safe tile reachable both ways under the height rule', function (t) {
    if (!DD.Grid || !DD.Grid.reachable || !DD.Grid.path) { t.skip('DD.Grid not available'); return; }
    const FEATS = [[], ['hills', 'cliffs'], ['lava', 'pits'], ['river'], ['chasm', 'bridge'], ['walls', 'chokepoint'], ['terraces', 'cliffs'], ['water', 'ice', 'mud', 'deep_water']];
    const prev = DD.Combat.state;
    let maps = 0, bad = 0, checked = 0;
    try {
      THEME_IDS.forEach(function (theme) {
        FEATS.forEach(function (features, k) {
          const m = DD.MapGen.generate({ theme: theme, w: 9 + (k % 4), h: 9 + ((k * 3) % 4), features: features, rng: DD.RNG('xcheck:' + theme + ':' + k) });
          maps++;
          DD.Combat.state = { grid: m.grid, units: [], rng: DD.RNG(1) };
          const root = m.heroZone[0];
          const probe = { id: 'probe', kind: 'hero', side: 'hero', flags: {}, statuses: [], x: root.x, y: root.y };
          const fwd = DD.Grid.reachable(probe, Infinity, { ignoreUnits: true });
          const problems = [];
          m.grid.tiles.forEach(function (tl) {
            if (!DD.Grid.isWalkable(tl.x, tl.y, probe) || (tl.x === root.x && tl.y === root.y)) return;
            const safe = DD.MapGen.isSafeTile(tl);
            checked++;
            if (safe && !fwd.has(key(tl))) problems.push(key(tl) + ' unreachable from the hero zone');
            probe.x = tl.x; probe.y = tl.y;
            if (!DD.Grid.path(probe, root.x, root.y, { ignoreUnits: true })) problems.push(key(tl) + (safe ? ' cannot walk back' : ' (hazard) is a trap'));
            probe.x = root.x; probe.y = root.y;
          });
          m.enemyZone.forEach(function (z) { if (!fwd.has(key(z)) && !(z.x === root.x && z.y === root.y)) problems.push('enemy zone ' + key(z) + ' unreachable'); });
          if (problems.length) { bad++; t.fail(theme + ' [' + features.join(',') + '] ' + m.grid.w + 'x' + m.grid.h + ': ' + problems.slice(0, 4).join('; ')); }
        });
      });
    } finally { DD.Combat.state = prev; }
    t.log(maps + ' maps, ' + checked + ' walkable tiles path-checked both ways, ' + bad + ' bad');
    t.ok(maps === THEME_IDS.length * FEATS.length && bad === 0 && checked > maps * 40, maps + ' maps, ' + checked + ' tiles, ' + bad + ' bad');
  });

  T.suite('mapgen: reinforcements land on safe tiles, away from heroes, with a way in', function (t) {
    if (!DD.Combat || typeof DD.Combat.start !== 'function') { t.skip('DD.Combat.start not available yet'); return; }
    const foes = enemyIds(['normal', 'minion']).filter(function (id) { return !/^wm_/.test(id); });
    const heroes = heroIds();
    if (!foes.length || heroes.length < 3) { t.skip('needs registered heroes and enemies'); return; }
    let waves = 0;
    THEME_IDS.forEach(function (theme, i) {
      ['N', 'E', 'S', 'W', 'zone'].forEach(function (edge, k) {
        const def = { id: 'mgt_rw_' + theme + edge, act: DD.Themes[theme].act, kind: 'normal', map: { theme: theme, w: 11, h: 11 },
          enemies: [{ id: foes[0], n: 2 }], objective: { type: 'custom', text: 'Wait' }, checkObjective: function () { return null; } };
        const setup = DD.Encounter.build(def, heroes.slice(0, 4), { rng: DD.RNG('rw' + i + k) });
        const st = DD.Combat.start(setup, { seed: 'rw' + i + k, headless: true, noPlan: true });
        const spawned = DD.Encounter.spawnWave(st, { round: 2, enemies: [{ id: foes[i % foes.length], n: 4 }], edge: edge });
        waves++;
        const hs = st.units.filter(function (u) { return u.side === 'hero' && !u.dead; });
        t.eq(spawned.length, 4, theme + '/' + edge + ': all 4 placed');
        spawned.forEach(function (u) {
          const tl = DD.Grid.tile(u.x, u.y);
          const near = hs.reduce(function (d, h) { return Math.min(d, DD.Grid.dist(u, h)); }, 99);
          t.ok(DD.Grid.isWalkable(u.x, u.y, u) && !DD.Grid.isDrop(u.x, u.y) && DD.MapGen.isSafeTile(tl) && !DD.Grid.hazardAt(u.x, u.y, u),
            theme + '/' + edge + ': ' + u.name + ' on a safe walkable tile at ' + key(u));
          t.ok(near >= 2, theme + '/' + edge + ': ' + u.name + ' does not spawn in a hero\'s face (distance ' + near + ')');
          t.ok(hs.some(function (h) { return !!DD.Grid.path(u, h.x, h.y, { ignoreUnits: true }); }), theme + '/' + edge + ': ' + u.name + ' can walk to the heroes');
        });
      });
    });
    t.ok(waves === THEME_IDS.length * 5, waves + ' waves');
  });

  // =====================================================================================================
  // Wild magic
  // =====================================================================================================

  T.suite('mapgen: wild magic table', function (t) {
    t.ok(DD.WildMagic, 'DD.WildMagic exists');
    if (!DD.WildMagic) return;
    const list = DD.WildMagic.list();
    t.ok(list.length >= 24, list.length + ' surges (>= 24)');
    const seen = {};
    let good = 0, bad = 0, chaos = 0, total = 0;
    list.forEach(function (d) {
      t.ok(!seen[d.id], 'unique id ' + d.id); seen[d.id] = true;
      t.ok(/^wm_/.test(d.id), d.id + ' prefixed wm_');
      t.ok(typeof d.name === 'string' && d.name.length > 2 && d.name.length <= 40, d.id + ' name');
      t.ok(typeof d.icon === 'string' && d.icon.length > 0, d.id + ' icon');
      t.ok(typeof d.quip === 'string' && d.quip.length > 8 && d.quip.length <= 120, d.id + ' quip ≤ 120 chars');
      t.ok(d.weight > 0, d.id + ' weight');
      t.ok(d.good === true || d.good === false || d.good === null, d.id + ' good flag');
      [1, 2, 3].forEach(function (a) {
        const txt = DD.WildMagic.describe(d.id, a);
        t.ok(txt.length > 10 && txt.indexOf('{') < 0, d.id + ' text resolves for act ' + a + ': ' + txt);
      });
      total += d.weight;
      if (d.good === true) good += d.weight; else if (d.good === false) bad += d.weight; else chaos += d.weight;
    });
    t.ok(good / total >= 0.5, 'mostly good by weight (' + Math.round(100 * good / total) + '%)');
    t.ok(bad / total <= 0.2 && bad > 0, 'some backfires (' + Math.round(100 * bad / total) + '%)');
    t.ok(chaos > 0, 'some chaos (' + Math.round(100 * chaos / total) + '%)');
    const safe = list.filter(function (d) { return d.enemySafe; });
    t.ok(safe.length >= 10 && safe.some(function (d) { return d.good === true; }), safe.length + ' enemy-safe surges');
    t.ok(!safe.some(function (d) { return /gold|Hype/.test(d.text); }), 'enemy-safe surges never touch party gold or Hype');
    t.eq(DD.WildMagic.describe('wm_make_it_rain', 2), 'The party gains 15 gold.', 'act scaling in text');
    t.eq(DD.WildMagic.describe('nope', 1), '', 'describe unknown → empty');
    t.eq(DD.WildMagic.surge(null), null, 'surge(null) → null');
    t.eq(DD.WildMagic.apply('nope', {}), null, 'apply(unknown) → null');
    const before = DD.problems.length;
    t.eq(DD.WildMagic.register({ id: 'broken' }), null, 'register rejects defs without apply');
    t.ok(DD.problems.length === before + 1 && !/^Error in/.test(DD.problems[before]), 'register warns (not an error)');
    // the duck
    const duck = DD.getSummon('wm_duck'), foeDuck = DD.getEnemy('wm_duck_foe');
    t.ok(duck && foeDuck, 'duck summon + hostile duck registered');
    [duck, foeDuck].forEach(function (d) {
      if (!d) return;
      t.ok(d.sprite && ['humanoid', 'quadruped', 'blob', 'flyer', 'swarm', 'construct', 'custom'].indexOf(d.sprite.base) >= 0, d.id + ' sprite base');
      t.ok(d.sprite.palette && DD.util.parseColor(d.sprite.palette.outline), d.id + ' palette');
      d.skills.forEach(function (sid) {
        const s = DD.getSkill(sid);
        t.ok(!!s, d.id + ' skill ' + sid + ' registered');
        if (!s) return;
        t.eq(s.owner, d === duck ? 'summon' : 'enemy', sid + ' owner');
        t.ok(/\d/.test(DD.skillDesc(s, 1)), sid + ' desc has numbers: ' + DD.skillDesc(s, 1));
      });
      ['spawn', 'attack', 'hurt', 'death'].forEach(function (k) {
        t.ok(d.barks[k] && d.barks[k].length >= 2 && d.barks[k].every(function (b) { return b.length <= 70; }), d.id + ' barks.' + k);
      });
      // overlays must survive a painter without text support
      t.tryRun(d.id + ' overlay', function () { d.sprite.overlay({}); d.sprite.overlay({ text: function () {} }); });
    });
  });

  function sandboxFor(seed) {
    const heroes = heroIds().filter(function (id) { return !DD.defs.heroes[id].flags || !DD.defs.heroes[id].flags.large; });
    const foes = enemyIds(['normal', 'minion']).filter(function (id) { return id !== 'wm_duck_foe'; });
    if (heroes.length < 2 || foes.length < 1) return null;
    return DD.Combat.sandbox({
      w: 9, h: 9, theme: 'cellar', seed: seed, noPlan: true, gold: 50,
      heroes: [{ id: heroes[0], x: 3, y: 6, level: 3 }, { id: heroes[1], x: 5, y: 6, level: 3 }],
      enemies: [{ id: foes[0], x: 3, y: 3 }, { id: foes[foes.length > 1 ? 1 : 0], x: 5, y: 2 }, { id: foes[0], x: 6, y: 4 }],
      terrain: function (tile) { if (tile.x === 6 && tile.y === 4) tile.t = 'water'; },
    });
  }

  function stateProblems(state) {
    const p = [], seen = {};
    state.units.forEach(function (u) {
      if (u.dead) return;
      if (!tileAt(state.grid, u.x, u.y)) p.push(u.name + ' out of bounds');
      if (seen[key(u)]) p.push('stacked units at ' + key(u));
      seen[key(u)] = true;
      if (!(u.hp >= 0 && u.hp <= u.maxHp)) p.push(u.name + ' hp ' + u.hp + '/' + u.maxHp);
    });
    return p;
  }

  T.suite('mapgen: wild magic surges in a sandbox', function (t) {
    if (!DD.Combat || typeof DD.Combat.sandbox !== 'function' || !DD.Act) { t.skip('DD.Combat.sandbox not available yet'); return; }
    if (!sandboxFor('probe')) { t.skip('needs 2 registered heroes and a normal enemy'); return; }
    let applied = 0;
    DD.WildMagic.list().forEach(function (d) {
      ['hero', 'enemy'].forEach(function (side) {
        if (side === 'enemy' && !d.enemySafe) return;
        const state = t.tryRun('sandbox ' + d.id, function () { return sandboxFor('wm:' + d.id + ':' + side); });
        if (!state) return;
        const unit = state.units.filter(function (u) { return !u.dead && u.side === side; })[0];
        (unit.skills || []).concat(unit.skillSlots || []).forEach(function (s) { if (s) s.cd = 2; });
        const eff = t.tryRun(d.id + ' as ' + side, function () { return DD.WildMagic.apply(d.id, unit, { source: 'test' }); });
        if (eff) {
          applied++;
          t.eq(eff.id, d.id, d.id + ' (' + side + ') returns its effect');
          t.ok(typeof eff.text === 'string' && eff.text.length > 5, d.id + ' effect text');
        } else t.log(d.id + ' (' + side + ') not applicable in this sandbox');
        if (DD.FX && DD.FX.flush) DD.FX.flush();
        const sp = stateProblems(state);
        t.eq(sp.join(' | '), '', d.id + ' (' + side + ') leaves a consistent state');
      });
    });
    t.ok(applied >= DD.WildMagic.list().length, applied + ' surge applications');
    // random surges respect the filters
    const state = sandboxFor('wm:random');
    const hero = state.units.filter(function (u) { return u.side === 'hero'; })[0];
    const enemy = state.units.filter(function (u) { return u.side === 'enemy'; })[0];
    for (let i = 0; i < 25; i++) {
      const g = DD.WildMagic.surge(hero, { good: true });
      if (g) t.ok(g.good === true, 'good:true → ' + g.id);
      const nb = DD.WildMagic.surge(hero, { good: false });
      if (nb) t.ok(nb.good !== true, 'good:false → ' + nb.id);
      if (!enemy.dead) {
        const e = DD.WildMagic.surge(enemy);
        if (e) t.ok(DD.WildMagic.get(e.id).enemySafe, 'enemy surge is enemy-safe: ' + e.id);
      }
      if (DD.FX && DD.FX.flush) DD.FX.flush();
      if (hero.dead || hero.downed) break;
    }
    t.eq(stateProblems(state).join(' | '), '', 'state consistent after 75 random surges');
  });
})();
