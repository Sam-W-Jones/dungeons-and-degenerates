/* Dungeons and Degenerates — tests/render_tests.js (RENDER-WORLD)
 * Suites "render: ...": iso projection round-trips, picking on elevated tiles and unit sprites, camera
 * fit/zoom/pan, offscreen rendering of every theme / terrain / object / surface id (plus unknown ids and broken
 * content painters), overlays + telegraphs + widgets, title / empty scenes, a sandbox battle if the engine and
 * fixtures are present, DD.Input event emission, and a frame-time budget check.
 */
(function () {
  'use strict';
  const T = window.DD_TEST;
  const DD = window.DD;
  if (!T || !DD) return;

  // ---- fixtures (hand-built states; never touch the registries except where noted) ----------------------
  function makeGrid(w, h, fn) {
    const tiles = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const t = { x: x, y: y, h: 0, t: 'stone', surface: null, obj: null, zone: null, tag: null };
        if (fn) fn(t);
        tiles.push(t);
      }
    }
    return { w: w, h: h, tiles: tiles };
  }
  function firstId(bag, fallback, skip) {
    const ks = Object.keys(bag || {}).filter(function (k) { return !skip || !skip(bag[k]); });
    return ks.length ? ks[0] : fallback;
  }
  function makeUnit(id, side, x, y, extra) {
    const kind = (extra && extra.kind) || (side === 'hero' ? 'hero' : 'enemy');
    const defId = kind === 'hero' ? firstId(DD.defs.heroes, 'test_hero') :
      kind === 'summon' ? firstId(DD.defs.summons, 'test_summon') : firstId(DD.defs.enemies, 'test_enemy');
    const u = Object.assign({
      id: id, defId: defId, kind: kind, side: side, name: id, x: x, y: y, hp: 12, maxHp: 20, block: 0, armor: 0,
      ap: 2, maxAp: 3, mov: 4, statuses: [], intents: [], skillSlots: [], facing: side === 'hero' ? 1 : -1,
      flags: {}, tags: [], resist: {}, data: {}, dead: false, downed: false, order: 1,
    }, extra || {});
    if (DD.FX && DD.FX.initVis) DD.FX.initVis(u);
    return u;
  }
  function makeState(grid, units, extra) {
    return Object.assign({ id: 'render_test', theme: 'cellar', phase: 'player', round: 1, grid: grid, units: units || [],
      rng: DD.RNG(1), hype: 0, log: [], rules: [], result: null, nextOrder: 1 }, extra || {});
  }
  /** Run fn with DD.Combat.state temporarily set (engine helpers like DD.AI.intentTiles read it). */
  function withState(st, fn) {
    const C = DD.Combat;
    const prev = C ? C.state : undefined;
    if (C) C.state = st;
    try { return fn(); } finally { if (C) C.state = prev; }
  }
  function canvas(w, h) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    return cv;
  }
  /** Number of distinct (quantised) colours in a sparse sample: proves something got painted. */
  function colourVariety(cv) {
    const c = cv.getContext('2d');
    const d = c.getImageData(0, 0, cv.width, cv.height).data;
    const seen = new Set();
    for (let i = 0; i < d.length; i += 4 * 97) seen.add((d[i] >> 4) + ',' + (d[i + 1] >> 4) + ',' + (d[i + 2] >> 4));
    return seen.size;
  }
  function themeIds() {
    const ids = (DD.Render.painters.themes || []).slice();
    if (DD.Themes) {
      Object.keys(DD.Themes).forEach(function (k) {
        const v = DD.Themes[k];
        if (v && typeof v === 'object' && typeof v !== 'function' && ids.indexOf(k) < 0) ids.push(k);
      });
    }
    ids.push('no_such_theme');
    return ids;
  }
  /** Every terrain / object / surface id we can think of: canonical painters + registry + unknown ids. */
  function showcaseState(theme) {
    const P = DD.Render.painters;
    const uniq = function (a) { return a.filter(function (v, i) { return a.indexOf(v) === i; }); };
    const ter = uniq(P.terrain.concat(Object.keys(DD.defs.terrain), ['test_render_unknown_terrain']));
    const obj = uniq(P.objects.concat(Object.keys(DD.defs.objects), ['test_render_unknown_object']));
    const sur = uniq(P.surfaces.concat(Object.keys(DD.defs.surfaces), ['test_render_unknown_surface']));
    const total = ter.length + obj.length + sur.length;
    const n = Math.ceil(Math.sqrt(total)) + 1;
    let i = 0;
    const grid = makeGrid(n, n, function (t) {
      if (i < ter.length) { t.t = ter[i]; t.h = i % 4 === 1 ? 2 : i % 3 === 0 ? 1 : 0; }
      else if (i < ter.length + obj.length) {
        const id = obj[i - ter.length];
        t.t = 'cobble';
        t.obj = { id: id, hp: 2, maxHp: 6, data: { on: i % 2 === 0, opened: i % 3 === 0, facing: ['N', 'E', 'S', 'W'][i % 4] } };
      } else if (i < total) {
        t.surface = { id: sur[i - ter.length - obj.length], turns: 1 + (i % 3), data: {} };
      }
      i++;
    });
    return makeState(grid, [], { theme: theme });
  }

  const R = function () { return DD.Render; };

  // ---- projection --------------------------------------------------------------------------------------
  T.suite('render: projection round-trips', function (t) {
    const Iso = DD.Iso;
    t.ok(Iso && typeof Iso.toWorld === 'function', 'DD.Iso.toWorld exists');
    const w0 = Iso.toWorld(0, 0, 0);
    t.eq(w0.x, 0, 'origin x'); t.eq(w0.y, 0, 'origin y');
    const w1 = Iso.toWorld(3, 1, 2);
    t.eq(w1.x, 64, 'toWorld x = (x-y)*32'); t.eq(w1.y, 32, 'toWorld y = (x+y)*16 - h*16');
    const rng = DD.RNG('iso');
    let worst = 0;
    for (let i = 0; i < 300; i++) {
      const x = rng.float(-5, 25), y = rng.float(-5, 25), h = rng.int(0, 4);
      const w = Iso.toWorld(x, y, h), g = Iso.fromWorld(w.x, w.y, h);
      worst = Math.max(worst, Math.abs(g.x - x), Math.abs(g.y - y));
    }
    t.ok(worst < 1e-9, 'fromWorld(toWorld(p)) == p (worst error ' + worst + ')');
    t.eq(Iso.levels(1.5), 3, 'tall 1.5 tiles = 3 elevation levels');
    const l = Iso.local(0.5, -0.5);
    t.eq(l.x, 32, 'local(+u,-v) is the right vertex'); t.eq(l.y, 0, 'local right vertex y');
    t.ok(Iso.inDiamond(0, 0, 0, 0, 32, 16) && !Iso.inDiamond(31, 15, 0, 0, 32, 16), 'inDiamond center/corner');
    t.ok(Iso.inColumn(16, 20, 0, 0, 32, 16, 16) && !Iso.inColumn(16, 20, 0, 0, 32, 16, 0), 'inColumn includes the side faces');
    t.ok(Iso.inPoly(5, 5, [[0, 0], [10, 0], [10, 10], [0, 10]]) && !Iso.inPoly(15, 5, [0, 0, 10, 0, 10, 10, 0, 10]), 'inPoly point formats');
    t.eq(Iso.hash(3, 4, 5), Iso.hash(3, 4, 5), 'hash is deterministic');
    t.ok(Iso.hash(3, 4, 5) !== Iso.hash(4, 3, 5), 'hash depends on coordinate order');

    // camera transform round-trip
    const st = makeState(makeGrid(6, 6));
    R().stateOverride = st;
    try {
      R().camera.x = 37; R().camera.y = -12; R().camera.zoom = 1.6;
      for (let i = 0; i < 50; i++) {
        const sx = rng.float(0, 800), sy = rng.float(0, 600);
        const wp = R().screenToWorld(sx, sy);
        const g = Iso.fromWorld(wp.x, wp.y, 0);
        const back = R().worldToScreen(g.x, g.y, 0);
        if (Math.abs(back.x - sx) > 1e-6 || Math.abs(back.y - sy) > 1e-6) { t.fail('screen round-trip off at ' + sx + ',' + sy); break; }
      }
      t.ok(true, 'screen <-> world <-> grid round-trips');
    } finally { R().stateOverride = null; }
  }, { tags: ['render'] });

  // ---- picking -----------------------------------------------------------------------------------------
  T.suite('render: picking on elevated tiles', function (t) {
    const r = R();
    // 1) terraces stepping DOWN toward the camera: nothing in front can cover a tile top, every top picks itself
    const terraces = makeGrid(7, 7, function (tl) { tl.h = Math.max(0, 4 - Math.floor((tl.x + tl.y) / 3)); });
    r.stateOverride = makeState(terraces, []);
    try {
      r.camera.x = 0; r.camera.y = 60; r.camera.zoom = 1.3;
      let ok = 0;
      for (let y = 0; y < 7; y++) {
        for (let x = 0; x < 7; x++) {
          const s = r.worldToScreen(x, y, r.tileTop(x, y));
          const hit = r.screenToTile(s.x, s.y + 1);
          if (hit && hit.x === x && hit.y === y) ok++;
          else t.fail('terrace top ' + x + ',' + y + ' picked ' + JSON.stringify(hit));
        }
      }
      t.eq(ok, 49, 'every terrace top picks itself');
      // the front edge of a raised terrace: just below its front vertex is its own side face
      const s = r.worldToScreen(1, 1, r.tileTop(1, 1));
      const face = r.screenToTile(s.x - 6, s.y + 16 + 4);
      t.ok(face && face.x === 1 && face.y === 1, 'side face of a terrace step picks the step (' + JSON.stringify(face) + ')');
    } finally { r.stateOverride = null; }

    // 2) a tall column, a wall and a pit on flat ground
    const grid = makeGrid(6, 6, function (tl) {
      if (tl.x === 3 && tl.y === 3) tl.h = 3;            // tall column in the middle
      if (tl.x === 1 && tl.y === 4) tl.t = 'wall';       // a wall (top = h + 3 levels)
      if (tl.x === 4 && tl.y === 1) tl.t = 'pit';
    });
    const hero = makeUnit('pick_h', 'hero', 1, 1);
    const st = makeState(grid, [hero]);
    r.stateOverride = st;
    try {
      r.camera.x = 0; r.camera.y = 80; r.camera.zoom = 1;
      const top = function (x, y) { return r.tileTop(x, y); };
      // tiles nowhere near the tall pieces pick themselves
      [[0, 0], [5, 0], [5, 5], [4, 4], [5, 2], [2, 5]].forEach(function (p) {
        const s = r.worldToScreen(p[0], p[1], top(p[0], p[1]));
        const hit = r.screenToTile(s.x, s.y + 1);
        t.ok(hit && hit.x === p[0] && hit.y === p[1], 'flat tile ' + p + ' picks itself (' + JSON.stringify(hit) + ')');
      });
      // a point on the raised top face of (3,3)
      const s33 = r.worldToScreen(3, 3, 3);
      t.eq(JSON.stringify(r.screenToTile(s33.x, s33.y)), '{"x":3,"y":3}', 'top face of the raised column');
      // the column's left side face (below its top, where lower tiles would otherwise be)
      const face = r.worldToScreen(3, 3, 3);
      t.eq(JSON.stringify(r.screenToTile(face.x - 16, face.y + 22)), '{"x":3,"y":3}', 'side face of the raised column picks it');
      // (2,2) sits right behind the column: its top center is hidden, the column wins
      const s22 = r.worldToScreen(2, 2, 0);
      const behind = r.screenToTile(s22.x, s22.y);
      t.ok(behind && !(behind.x === 2 && behind.y === 2), 'occluded tile top is not picked through the column (' + JSON.stringify(behind) + ')');
      // wall top (h 0 + 1.5 tiles = 3 levels)
      t.eq(top(1, 4), 3, 'wall top level');
      const w14 = r.worldToScreen(1, 4, 3);
      t.eq(JSON.stringify(r.screenToTile(w14.x, w14.y)), '{"x":1,"y":4}', 'wall top picks the wall');
      // pit tile
      const p41 = r.worldToScreen(4, 1, 0);
      t.eq(JSON.stringify(r.screenToTile(p41.x, p41.y + 2)), '{"x":4,"y":1}', 'pit picks itself');
      // off the map
      t.eq(r.screenToTile(-5000, -5000), null, 'far away: null');
      // units: sprite bounds
      const hs = r.worldToScreen(1, 1, 0);
      const u = r.unitAtScreen(hs.x, hs.y - 18);
      t.ok(u && u.id === 'pick_h', 'unitAtScreen hits the sprite body');
      t.eq(r.unitAtScreen(hs.x + 200, hs.y), null, 'unitAtScreen misses empty space');
      hero.dead = true;
      t.eq(r.unitAtScreen(hs.x, hs.y - 18), null, 'dead units are not picked');
    } finally { r.stateOverride = null; }
  }, { tags: ['render'] });

  // ---- camera ------------------------------------------------------------------------------------------
  T.suite('render: camera fit, zoom around cursor, pan', function (t) {
    const r = R();
    const st = makeState(makeGrid(13, 13, function (tl) { tl.h = (tl.x * 7 + tl.y * 3) % 3; }));
    r.stateOverride = st;
    try {
      t.ok(r.fitMap({ instant: true }), 'fitMap succeeds with a state');
      const size = r.size();
      const corners = [[0, 0], [12, 0], [0, 12], [12, 12]];
      let inside = true;
      corners.forEach(function (p) {
        const s = r.worldToScreen(p[0], p[1], 0);
        if (s.x < -1 || s.x > size.width + 1 || s.y < -1 || s.y > size.height + 1) inside = false;
      });
      t.ok(inside, 'fitted map corners are on screen');
      t.ok(r.camera.zoom >= 0.4 && r.camera.zoom <= 2, 'fit zoom within clamps (' + r.camera.zoom.toFixed(2) + ')');
      const sx = size.width * 0.3, sy = size.height * 0.4;
      const before = r.screenToWorld(sx, sy);
      const z0 = r.camera.zoom;
      r.zoomAt(1.5, sx, sy);
      const after = r.screenToWorld(sx, sy);
      t.ok(r.camera.zoom > z0, 'zoomAt zooms in');
      t.ok(Math.abs(after.x - before.x) < 1e-6 && Math.abs(after.y - before.y) < 1e-6, 'world point under the cursor stays fixed');
      r.zoomAt(1000, sx, sy);
      t.ok(r.camera.zoom <= 2.75 + 1e-9, 'zoom is clamped');
      const cx = r.camera.x;
      r.panBy(100, 0);
      t.near(r.camera.x, cx - 100 / r.camera.zoom, 1e-6, 'panBy moves the camera opposite to the drag');
      r.centerOn(6, 6, { instant: true, ignoreHud: true });
      const c = r.worldToScreen(6, 6);
      t.near(c.x, size.width / 2, 0.5, 'centerOn puts the tile at the screen center (x)');
      // centred on a standing unit's body: the tile itself sits 16 world px below the center
      t.near(c.y, size.height / 2 + 16 * r.camera.zoom, 0.5, 'centerOn frames the unit standing on the tile (y)');
    } finally { r.stateOverride = null; }
  }, { tags: ['render'] });

  // ---- every id, every theme ------------------------------------------------------------------------------
  T.suite('render: draws every theme / terrain / object / surface id', function (t) {
    const r = R();
    const cv = canvas(480, 300);
    const themes = themeIds();
    themes.forEach(function (theme) {
      const st = showcaseState(theme);
      const res = t.tryRun('renderTo ' + theme, function () { return withState(st, function () { return r.renderTo(cv, { state: st, width: 480, height: 300 }); }); });
      t.ok(res && res.objects > 20, theme + ': objects drawn (' + (res && res.objects) + ')');
    });
    t.ok(colourVariety(cv) > 40, 'showcase produced a varied image (' + colourVariety(cv) + ' colours)');
    // high zoom + dpr exercise the larger texture buckets
    const st = showcaseState('hellscape');
    t.tryRun('renderTo zoomed dpr2', function () {
      return r.renderTo(cv, { state: st, width: 240, height: 150, dpr: 2, camera: { x: 0, y: 200, zoom: 2.6 } });
    });
    t.tryRun('renderTo tiny zoom', function () {
      return r.renderTo(cv, { state: st, width: 480, height: 300, camera: { x: 0, y: 200, zoom: 0.4 } });
    });
    t.log('themes: ' + themes.join(', '));
    // standalone painters for galleries / tooltips
    const sw = canvas(200, 200), c = sw.getContext('2d');
    const P = r.painters;
    P.terrain.concat(['test_render_unknown_terrain']).forEach(function (id) {
      t.tryRun('drawTileAt ' + id, function () { c.clearRect(0, 0, 200, 200); r.drawTileAt(c, id, 100, 90, 1.5, { h: 1, surface: 'fire' }); });
    });
    P.objects.concat(['test_render_unknown_object']).forEach(function (id) {
      t.tryRun('drawObjectAt ' + id, function () { r.drawObjectAt(c, id, 100, 150, 1.5, { theme: 'graveyard' }); });
    });
    t.ok(colourVariety(sw) > 10, 'standalone tile/object painters draw');
  }, { tags: ['render'] });

  // ---- overlays, telegraphs, widgets -----------------------------------------------------------------------
  T.suite('render: overlays, telegraphs and unit widgets', function (t) {
    const r = R();
    const grid = makeGrid(10, 10, function (tl) {
      if (tl.x === 5 && tl.y < 4) tl.h = 2;
      if (tl.x === 7 && tl.y === 7) tl.t = 'wall';
      if (tl.y === 9) tl.t = 'water';
    });
    const h1 = makeUnit('ov_h1', 'hero', 2, 2, { block: 5, statuses: [{ id: 'burn', stacks: 2, turns: 2 }, { id: 'inspired', stacks: 1, turns: 1 }, { id: 'no_such_status', stacks: 1, turns: 1 }] });
    const h2 = makeUnit('ov_h2', 'hero', 3, 6, { downed: true, hp: 0 });
    const sm = makeUnit('ov_s1', 'hero', 1, 5, { kind: 'summon' });
    const e1 = makeUnit('ov_e1', 'enemy', 6, 2, { order: 1, intents: [{ skillId: 'test_none', anchor: 'ground', abs: { x: 2, y: 2 }, tiles: [{ x: 2, y: 2 }, { x: 3, y: 2 }, { x: 2, y: 3 }], label: 'Rocks Fall', icon: '🪨', dmg: 12, delay: 2 }] });
    const e2 = makeUnit('ov_e2', 'enemy', 4, 4, { order: 2, statuses: [{ id: 'dazzled', stacks: 1, turns: 1 }], intents: [{ skillId: 'test_none', anchor: 'self', rel: { dx: -1, dy: 0 }, tiles: [{ dx: -1, dy: 0 }, { dx: -2, dy: 0 }], dmg: 5, icon: '🗡️' }] });
    const e3 = makeUnit('ov_e3', 'enemy', 8, 5, { order: 3, tier: 'boss', maxHp: 200, hp: 150, intents: [{ skillId: 'test_none', anchor: 'unit', unitId: 'ov_h1', dmg: 7 }] });
    const e4 = makeUnit('ov_e4', 'enemy', 9, 9, { vis: undefined, intents: null });
    const st = makeState(grid, [h1, h2, sm, e1, e2, e3, e4]);
    st.grid.tiles[5 * 10 + 5].obj = { id: 'crate', hp: 2, maxHp: 6, data: {} };
    r.overlay = {
      selectedId: 'ov_h1', hover: { x: 3, y: 3 },
      moveTiles: [{ x: 1, y: 2 }, { x: 2, y: 1 }, { x: 3, y: 2 }, { x: 2, y: 3 }, { x: 99, y: 99 }, null],
      path: [{ x: 3, y: 2 }, { x: 3, y: 3 }, { x: -4, y: 2 }], pathHazard: true,
      targetTiles: [{ x: 6, y: 2 }, { x: 4, y: 4 }], areaTiles: [{ x: 6, y: 2 }, { x: 6, y: 3 }],
      previews: { ov_e1: { dmg: 9, lethal: true }, ov_h1: { heal: 4 }, ov_e2: { text: 'Stun' }, ov_e3: { dmg: 3 } },
      deployTiles: [{ x: 0, y: 0 }, { x: 0, y: 1 }], interactTiles: [{ x: 5, y: 5 }],
      showIntents: true, focusIntentUnitId: 'ov_e1',
    };
    const cv = canvas(640, 400);
    try {
      const res = t.tryRun('renderTo with overlay', function () { return withState(st, function () { return r.renderTo(cv, { state: st, width: 640, height: 400 }); }); });
      t.ok(res && res.telegraphs === 3, 'telegraphs computed for the 3 enemies with intents (' + (res && res.telegraphs) + ')');
      t.ok(res && res.units === 7, 'all 7 units drawn (incl. one without vis, one downed) (' + (res && res.units) + ')');
      r.overlay.focusIntentUnitId = null;
      st.phase = 'enemy';
      const res2 = t.tryRun('renderTo enemy phase', function () { return withState(st, function () { return r.renderTo(cv, { state: st, width: 640, height: 400 }); }); });
      t.ok(res2 && res2.telegraphs === 3, 'v2: wind-ups stay on the board during AI turns too (' + (res2 && res2.telegraphs) + ')');
      // (the tracking one aims at a unit with an unknown skill: no area, so no badge)
      t.ok(res2 && res2.badges.length === 2 && res2.badges.some(function (b) { return b.label === 'Rocks Fall' && b.dmg === 12 && b.delay === 2; }), 'each wind-up area gets a ⏳ label + damage badge (Rocks Fall 12, lands in 2 turns): ' + JSON.stringify(res2 && res2.badges));
      st.result = 'victory';
      const resOver = withState(st, function () { return r.renderTo(cv, { state: st, width: 640, height: 400 }); });
      t.ok(resOver && resOver.telegraphs === 0, 'none once the fight is over');
      st.result = null;
      st.phase = 'player';
      r.overlay.showIntents = false;
      const res3 = withState(st, function () { return r.renderTo(cv, { state: st, width: 640, height: 400 }); });
      t.ok(res3 && res3.telegraphs === 0, 'showIntents=false hides telegraphs');
      // garbage overlay values must not crash
      r.overlay = { moveTiles: 'nope', path: null, previews: 7, targetTiles: [{}], areaTiles: [{ x: 'a' }] };
      t.tryRun('renderTo garbage overlay', function () { return withState(st, function () { return r.renderTo(cv, { state: st, width: 640, height: 400 }); }); });
      t.ok(colourVariety(cv) > 30, 'overlay frame painted');
    } finally { r.resetOverlay(); }
  }, { tags: ['render'] });

  // ---- scenes ------------------------------------------------------------------------------------------
  T.suite('render: HP widgets of crowded units never overlap', function (t) {
    const r = R();
    const grid = makeGrid(9, 9);
    // a diagonal column and a tight block: on the iso grid these stack right on top of each other
    const units = [
      makeUnit('cw_h1', 'hero', 3, 3, { block: 6, statuses: [{ id: 'burn', stacks: 2, turns: 2 }] }),
      makeUnit('cw_h2', 'hero', 4, 4),
      makeUnit('cw_h3', 'hero', 3, 4),
      makeUnit('cw_h4', 'hero', 4, 3, { downed: true, hp: 0 }),
      makeUnit('cw_e1', 'enemy', 5, 5, { hp: 140, maxHp: 200, tier: 'boss' }),
      makeUnit('cw_e2', 'enemy', 6, 5),
      makeUnit('cw_e3', 'enemy', 5, 6, { statuses: [{ id: 'weak', stacks: 1, turns: 1 }, { id: 'vulnerable', stacks: 1, turns: 1 }] }),
      makeUnit('cw_e4', 'enemy', 1, 7),
    ];
    const st = makeState(grid, units);
    [0.6, 1, 1.6].forEach(function (zoom) {
      const cv = canvas(900, 600);
      const fit = withState(st, function () { return r.renderTo(cv, { state: st, width: 900, height: 600 }); });
      const cam = { x: 0, y: 140, zoom: zoom };
      const res = t.tryRun('renderTo crowd @' + zoom, function () { return withState(st, function () { return r.renderTo(cv, { state: st, width: 900, height: 600, camera: cam }); }); });
      const boxes = (res && res.widgets) || [];
      t.ok(fit && res, 'frames rendered @' + zoom);
      t.eq(boxes.length, units.length, 'one HP widget per unit @' + zoom);
      let overlaps = 0;
      for (let i = 0; i < boxes.length; i++) {
        for (let k = i + 1; k < boxes.length; k++) {
          const a = boxes[i], b = boxes[k];
          if (a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0) { overlaps++; t.log('overlap @' + zoom + ': ' + a.id + ' / ' + b.id); }
        }
      }
      t.eq(overlaps, 0, 'no two HP widgets overlap @' + zoom);
      const lone = boxes.filter(function (b) { return b.id === 'cw_e4'; })[0];
      t.ok(lone && lone.dy === 0, 'a unit with room keeps its widget in place @' + zoom);
      t.ok(boxes.every(function (b) { return b.dy <= 0; }), 'widgets only ever move up @' + zoom);
      t.ok(boxes.some(function (b) { return b.dy < 0; }), 'the crowd actually needed untangling @' + zoom);
    });
  }, { tags: ['render'] });

  T.suite('render: a broken FX duration never freezes the game', function (t) {
    const r = R();
    const FX = DD.FX;
    if (!FX || typeof r.drawFrame !== 'function') { t.skip('DD.FX or drawFrame missing'); return; }
    const wasInstant = FX.instant;
    try {
      FX.reset();
      FX.instant = false;
      FX.custom('vux_nan', { ms: NaN });
      FX.custom('vux_negative', { ms: -40 });
      FX.custom('vux_text_ms', { ms: 'soon' });
      t.ok(FX.busy(), 'bad events are queued');
      for (let i = 0; i < 20 && FX.busy(); i++) r.drawFrame(100);
      t.ok(!FX.busy(), 'NaN / negative / non-numeric durations play as short events and the queue drains');
      FX.custom('vux_forever', { ms: Infinity });
      FX.wait(400);
      for (let i = 0; i < 12 && FX.busy(); i++) r.drawFrame(1000);
      t.ok(!FX.busy(), 'an endless event is finished by the watchdog and the queue drains');
      FX.wait(250);
      r.drawFrame(100);
      t.ok(FX.busy(), 'a normal event is not cut short');
      r.drawFrame(200);
      t.ok(!FX.busy(), 'and it ends on time');
    } finally {
      FX.reset();
      FX.instant = wasInstant;
    }
  }, { tags: ['render'] });

  T.suite('render: title diorama and empty scenes', function (t) {
    const r = R();
    const cv = canvas(640, 360);
    const res = t.tryRun('title', function () { return r.renderTo(cv, { scene: 'title', width: 640, height: 360 }); });
    t.ok(res && res.objects >= 8, 'title diorama objects drawn (' + (res && res.objects) + ')');
    t.ok(res && res.units === Math.min(8, Object.keys(DD.defs.heroes).length) || (res && res.units <= 8), 'title heroes (' + (res && res.units) + ')');
    t.ok(colourVariety(cv) > 40, 'title produced a varied image');
    const none = t.tryRun('none', function () { return r.renderTo(cv, { scene: 'none', width: 320, height: 200 }); });
    t.eq(none, null, 'empty scene returns null');
    const noState = t.tryRun('combat without state', function () { return r.renderTo(cv, { scene: 'combat', state: null, width: 320, height: 200 }); });
    t.ok(noState === null || typeof noState === 'object', 'combat scene without a state does not throw');
  }, { tags: ['render'] });

  // ---- robustness ----------------------------------------------------------------------------------------
  T.suite('render: robust against bad content', function (t) {
    const r = R();
    const objId = 'test_render_broken_painter', surfId = 'test_render_broken_surface';
    DD.defs.objects[objId] = { id: objId, name: 'Broken', __kind: 'objects', height: 1, hp: 0, draw: function () { throw new Error('painter exploded'); } };
    DD.defs.surfaces[surfId] = { id: surfId, name: 'Broken', __kind: 'surfaces', color: 'not a colour', draw: function () { throw new Error('surface exploded'); } };
    const before = DD.problems.length;
    try {
      const grid = makeGrid(5, 5, function (tl) {
        if (tl.x === 1 && tl.y === 1) tl.obj = { id: objId, hp: 0, maxHp: 0, data: {} };
        if (tl.x === 2 && tl.y === 2) tl.surface = { id: surfId, turns: 2 };
        if (tl.x === 3 && tl.y === 3) { tl.obj = { id: 'chest' }; tl.surface = { id: 'fire' }; }   // instance without data/hp
        if (tl.x === 4 && tl.y === 0) tl.h = 9;                                                         // above the contract range
        if (tl.x === 0 && tl.y === 4) tl.t = undefined;                                                 // missing terrain id
      });
      const weird = makeUnit('rb_w', 'enemy', 2, 0, { statuses: [{ id: 'burn' }, { id: 'no_such_status', stacks: 99 }], intents: [null, { anchor: 'ground', abs: { x: 2, y: 2 } }] });
      const nan = makeUnit('rb_nan', 'enemy', NaN, 1);
      const st = makeState(grid, [weird, nan, null]);
      const cv = canvas(320, 240);
      for (let i = 0; i < 3; i++) t.tryRun('frame ' + i, function () { return withState(st, function () { return r.renderTo(cv, { state: st, width: 320, height: 240 }); }); });
      const mine = DD.problems.slice(before).filter(function (w) { return /painter exploded|surface exploded/.test(w); });
      t.eq(mine.length, 2, 'each broken painter warned exactly once over 3 frames');
      t.tryRun('tiles without x/y', function () {
        const bare = { w: 2, h: 2, tiles: [{ h: 0, t: 'stone' }, { h: 1, t: 'grass' }, { h: 0, t: 'water' }, { h: 0, t: 'lava' }] };
        return r.renderTo(cv, { state: makeState(bare, []), width: 320, height: 240 });
      });
      t.tryRun('empty grid', function () { return r.renderTo(cv, { state: makeState({ w: 0, h: 0, tiles: [] }, []), width: 320, height: 240 }); });
    } finally {
      delete DD.defs.objects[objId];
      delete DD.defs.surfaces[surfId];
      // the broken painters above warn by design; keep them out of the harness' swallowed-error check
      for (let i = DD.problems.length - 1; i >= before; i--) if (/painter exploded|surface exploded/.test(DD.problems[i])) DD.problems.splice(i, 1);
      r.invalidate();
    }
  }, { tags: ['render'] });

  // ---- engine sandbox (when RULES + fixtures are loaded) ----------------------------------------------------
  T.suite('render: sandbox battle frames', function (t) {
    const C = DD.Combat;
    const hero = firstId(DD.defs.heroes, null), enemy = firstId(DD.defs.enemies, null, function (d) { return d.tier === 'boss'; });
    if (!C || typeof C.sandbox !== 'function' || !hero || !enemy) { t.skip('needs DD.Combat.sandbox and a registered hero + enemy'); return; }
    const prev = C.state;
    try {
      const st = t.tryRun('sandbox', function () {
        return C.sandbox({ w: 9, h: 9, theme: 'warren', seed: 4,
          heroes: [{ id: hero, x: 1, y: 4 }, { id: hero, x: 2, y: 6 }], enemies: [{ id: enemy, x: 7, y: 4 }, { id: enemy, x: 6, y: 1 }],
          terrain: function (tl) { if (tl.x === 4 && tl.y === 4) return { h: 2 }; if (tl.x === 4 && tl.y === 6) return { t: 'pit' }; return null; } });
      });
      if (!st) return;
      const cv = canvas(640, 400);
      const r = R();
      const a = t.tryRun('frame', function () { return r.renderTo(cv, { state: st, width: 640, height: 400 }); });
      t.ok(a && a.units >= 4, 'sandbox units drawn (' + (a && a.units) + ')');
      if (DD.AutoPlay && typeof DD.AutoPlay.takeTurn === 'function') {
        t.tryRun('autoplay turn', function () { DD.AutoPlay.takeTurn(); if (C.endTurn && !C.isOver()) C.endTurn(); });
        t.tryRun('frame after a round', function () { return r.renderTo(cv, { state: C.state, width: 640, height: 400 }); });
      }
      t.ok(colourVariety(cv) > 30, 'sandbox frame painted');
    } finally { C.state = prev; }
  }, { tags: ['render'] });

  // ---- input -------------------------------------------------------------------------------------------
  T.suite('render: input emits input:* events and drives the camera', function (t) {
    const r = R(), I = DD.Input;
    if (!I) { t.fail('DD.Input missing'); return; }
    const size = r.size();
    const cv = canvas(size.width, size.height);
    cv.style.cssText = 'position:fixed;left:0;top:0;width:' + size.width + 'px;height:' + size.height + 'px';
    document.body.appendChild(cv);
    const hero = makeUnit('in_h', 'hero', 2, 2);
    const st = makeState(makeGrid(6, 6), [hero]);
    const prevScene = r.getScene();
    const got = [];
    const offs = ['input:tileClick', 'input:unitClick', 'input:rightClick', 'input:key', 'input:tileHover'].map(function (n) {
      return DD.Events.on(n, function (d) { got.push({ n: n, d: d }); });
    });
    const ptr = function (type, x, y, button, extra) {
      cv.dispatchEvent(new PointerEvent(type, Object.assign({ clientX: x, clientY: y, button: button || 0, pointerId: 7, bubbles: true, cancelable: true }, extra || {})));
    };
    const field = document.createElement('input');
    try {
      r.stateOverride = st;
      r.setScene('combat');
      r.fitMap({ instant: true });
      t.ok(I.init(cv), 'DD.Input.init');
      t.ok(I.init(cv), 'init is idempotent');
      const p = r.worldToScreen(4, 1);
      ptr('pointermove', p.x, p.y);
      const hov = got.filter(function (e) { return e.n === 'input:tileHover'; }).pop();
      t.ok(hov && hov.d && hov.d.x === 4 && hov.d.y === 1, 'hover emits input:tileHover for the tile');
      t.ok(r.overlay.hover && r.overlay.hover.x === 4, 'hover mirrored into DD.Render.overlay.hover');
      got.length = 0;
      ptr('pointerdown', p.x, p.y, 0); ptr('pointerup', p.x, p.y, 0);
      const click = got.filter(function (e) { return e.n === 'input:tileClick'; })[0];
      t.ok(click && click.d.x === 4 && click.d.y === 1 && click.d.button === 0, 'left click emits input:tileClick');
      got.length = 0;
      const hs = r.worldToScreen(2, 2);
      ptr('pointerdown', hs.x, hs.y - 18, 0); ptr('pointerup', hs.x, hs.y - 18, 0);
      t.ok(got.some(function (e) { return e.n === 'input:unitClick' && e.d.unitId === 'in_h'; }), 'clicking a sprite emits input:unitClick');
      t.ok(got.some(function (e) { return e.n === 'input:tileClick' && e.d.x === 2 && e.d.y === 2 && e.d.unitId === 'in_h'; }), '...and a tileClick for its tile');
      got.length = 0;
      ptr('pointerdown', p.x, p.y, 2); ptr('pointerup', p.x, p.y, 2);
      t.ok(got.some(function (e) { return e.n === 'input:rightClick'; }), 'right click emits input:rightClick');
      t.ok(!got.some(function (e) { return e.n === 'input:tileClick'; }), 'right click does not emit tileClick');
      got.length = 0;
      const cx = r.camera.x;
      ptr('pointerdown', p.x, p.y, 2); ptr('pointermove', p.x + 60, p.y, 2); ptr('pointerup', p.x + 60, p.y, 2);
      t.ok(r.camera.x < cx - 1, 'right-drag pans the camera');
      t.ok(!got.some(function (e) { return e.n === 'input:rightClick'; }), 'a drag is not a right click');
      const z0 = r.camera.zoom;
      cv.dispatchEvent(new WheelEvent('wheel', { deltaY: -240, clientX: p.x, clientY: p.y, bubbles: true, cancelable: true }));
      t.ok(r.camera.zoom > z0, 'wheel up zooms in');
      got.length = 0;
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
      t.ok(got.some(function (e) { return e.n === 'input:key' && e.d.key === 'Escape'; }), 'keydown emits input:key');
      t.ok(got.some(function (e) { return e.n === 'input:rightClick'; }), 'Escape emits input:rightClick');
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', code: 'Escape', bubbles: true }));
      got.length = 0;
      document.body.appendChild(field);
      field.focus();
      field.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', code: 'KeyW', bubbles: true }));
      t.ok(!got.length && !I.keys.w, 'keys are ignored while typing in an input');
      field.blur();
      const btn = document.createElement('button');
      document.body.appendChild(btn);
      btn.focus();
      got.length = 0;
      window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }));
      t.ok(!got.some(function (e) { return e.n === 'input:key'; }), 'Space on a focused button is left to the button');
      window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space', bubbles: true }));
      btn.blur(); btn.remove();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', code: 'KeyD', bubbles: true }));
      const cam0 = r.camera.x;
      I.update(100);
      t.ok(r.camera.x > cam0, 'holding D pans the view right');
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'd', code: 'KeyD', bubbles: true }));
      t.ok(!I.keys.d, 'keyup releases the key');
      r.zoomAt(1.7);
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', code: 'KeyF', bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'f', code: 'KeyF', bubbles: true }));
      r.fitMap({ instant: true });
      const fitZoom = r.camera.zoom;
      t.ok(fitZoom > 0, 'F recenters (fitMap)');
    } finally {
      offs.forEach(function (off) { off(); });
      I.detach();
      cv.remove(); field.remove();
      r.stateOverride = null;
      r.setScene(prevScene);
      r.resetOverlay();
    }
  }, { tags: ['render'] });

  // ---- render polish ------------------------------------------------------------------------------------------
  const BIG = { base: 'humanoid', build: 'huge', scale: 1.8, outfit: 'armor', palette: { skin: '#e0a070', metal: '#a0a8b0' } };
  const SMALL = { base: 'humanoid', build: 'tiny', scale: 0.62, outfit: 'tunic', palette: { skin: '#f0c49a', cloth: '#ff5fa2' } };

  T.suite('render: units hidden behind bigger units get a silhouette', function (t) {
    const r = R();
    const grid = makeGrid(9, 9);
    // a small hero right behind a big one, a small foe behind a big foe, a medium hero one row behind another (feet only)
    const units = [
      makeUnit('sil_small', 'hero', 2, 2, { sprite: SMALL }),
      makeUnit('sil_big', 'hero', 3, 3, { sprite: BIG }),
      makeUnit('sil_minion', 'enemy', 5, 2, { sprite: SMALL }),
      makeUnit('sil_boss', 'enemy', 6, 3, { sprite: BIG, tier: 'boss', hp: 150, maxHp: 200 }),
      makeUnit('sil_far', 'hero', 1, 6),
      makeUnit('sil_front', 'hero', 2, 7),
      makeUnit('sil_alone', 'hero', 7, 7, { sprite: SMALL }),
    ];
    const st = makeState(grid, units);
    const cv = canvas(900, 600);
    [0.8, 1.6].forEach(function (zoom) {
      const res = t.tryRun('renderTo @' + zoom, function () {
        return withState(st, function () { return r.renderTo(cv, { state: st, width: 900, height: 600, camera: { x: 0, y: 140, zoom: zoom } }); });
      });
      const sil = {};
      ((res && res.silhouettes) || []).forEach(function (s) { sil[s.id] = s; });
      t.ok(sil.sil_small && sil.sil_small.units.indexOf('sil_big') >= 0, 'a small hero behind a big one is drawn see-through @' + zoom);
      t.ok(sil.sil_minion && sil.sil_minion.units.indexOf('sil_boss') >= 0, 'a minion behind a boss too @' + zoom);
      t.ok(!sil.sil_far, 'a unit whose feet alone are covered (one row back) is left alone @' + zoom);
      t.ok(!sil.sil_alone && !sil.sil_big && !sil.sil_boss, 'unhidden units get no silhouette @' + zoom);
    });
    // a small unit one step up, right behind a medium one: the front unit's HP widget rises over its body
    const g3 = makeGrid(6, 6, function (tl) { if (tl.x === 2 && tl.y === 2) tl.h = 1; });
    const st3 = makeState(g3, [makeUnit('wb_small', 'hero', 2, 2, { sprite: SMALL }), makeUnit('wb_front', 'hero', 3, 3)]);
    st3.units[0].vis.h = 1;   // vis was made before this grid existed
    const cam = { x: 0, y: 90, zoom: 1.5 };
    const res3 = withState(st3, function () { return r.renderTo(cv, { state: st3, width: 900, height: 600, camera: cam }); });
    const wf = res3 && res3.widgets.filter(function (b) { return b.id === 'wb_front'; })[0];
    const m = DD.Sprites.metrics(SMALL), feet = DD.Iso.toWorld(2, 2, 1);
    const sx = (feet.x - cam.x) * cam.zoom + 450, sy = (feet.y - cam.y) * cam.zoom + 300;
    const body = { x0: sx - 6, x1: sx + 6, y0: sy - m.height * cam.zoom * 0.8, y1: sy - 2 };
    t.ok(wf && wf.dy < 0, 'the front unit\'s widget was lifted (dy ' + (wf && Math.round(wf.dy)) + ')');
    t.ok(wf && (wf.y1 <= body.y0 || wf.y0 >= body.y1), 'and no longer covers the small unit\'s body');
    // geometry still counts: a pillar in front of a hero
    const g2 = makeGrid(6, 6);
    g2.tiles[3 * 6 + 3].obj = { id: 'pillar', hp: 0, maxHp: 0, data: {} };
    const st2 = makeState(g2, [makeUnit('sil_pillar', 'hero', 2, 2)]);
    const res2 = withState(st2, function () { return r.renderTo(cv, { state: st2, width: 900, height: 600, camera: { x: 0, y: 80, zoom: 1.4 } }); });
    const p = res2 && res2.silhouettes.filter(function (s) { return s.id === 'sil_pillar'; })[0];
    t.ok(p && p.geometry > 0 && !p.units.length, 'a pillar in front still makes a geometry silhouette');
  }, { tags: ['render'] });

  T.suite('render: DD.Render.hudMargins frames the board beside the HUD', function (t) {
    const r = R();
    const st = makeState(makeGrid(9, 9));
    const size = r.size();
    const saved = r.hudMargins;
    r.stateOverride = st;
    try {
      r.hudMargins = null;
      const def = r.margins();
      t.ok(def.left > 0 && def.bottom > 0, 'built-in margins without a HUD setting (' + JSON.stringify(def) + ')');
      // a HUD that covers the left 60% of the screen: the board moves into the right part
      r.hudMargins = { left: size.width * 0.6, right: 0, top: 0, bottom: 0 };
      r.fitMap({ instant: true });
      const c = r.worldToScreen(4, 4, 0);
      t.ok(c.x > size.width * 0.6, 'board center sits right of a wide left panel (x ' + Math.round(c.x) + ' of ' + size.width + ')');
      // a function form, sides falling back to the defaults, and the 70% cap
      r.hudMargins = function (w, h) { return { top: h * 0.5, bottom: h * 0.5, left: 'wide' }; };
      const m = r.margins();
      t.ok(Math.abs(m.top + m.bottom - size.height * 0.7) < 1, 'top + bottom never eat more than 70% of the height');
      t.eq(m.left, def.left, 'a garbage side keeps its default');
      r.hudMargins = function () { throw new Error('hud margins exploded'); };
      const p0 = DD.problems.length;
      const m2 = r.margins();
      t.ok(m2.left === def.left && m2.top === def.top, 'a throwing margins function falls back to the defaults');
      t.ok(DD.problems.slice(p0).some(function (w) { return /hud margins exploded/.test(w); }), '...and warns');
      for (let i = DD.problems.length - 1; i >= p0; i--) if (/hud margins exploded/.test(DD.problems[i])) DD.problems.splice(i, 1);
    } finally {
      r.hudMargins = saved;
      r.stateOverride = null;
    }
  }, { tags: ['render'] });

  T.suite('render: surface volumes and object instance overrides', function (t) {
    const r = R();
    const surfId = 'test_render_cloud', badId = 'test_render_bad_cloud';
    let calls = 0, sawTile = false;
    DD.defs.surfaces[surfId] = { id: surfId, name: 'Cloud', __kind: 'surfaces', color: 'rgba(120,170,60,0.5)',
      drawVolume: function (g, sf, time) { calls++; sawTile = sawTile || !!(g.tile && sf && sf.id === surfId && typeof time === 'number'); g.circle(0, -20, 12, '#88cc44'); } };
    DD.defs.surfaces[badId] = { id: badId, name: 'Bad Cloud', __kind: 'surfaces', drawVolume: function () { throw new Error('cloud exploded'); } };
    const p0 = DD.problems.length;
    try {
      const grid = makeGrid(5, 5, function (tl) {
        if (tl.x === 1 && tl.y === 1) tl.surface = { id: surfId, turns: 2, data: {} };
        if (tl.x === 3 && tl.y === 1) tl.surface = { id: badId, turns: 2, data: {} };
      });
      const st = makeState(grid, []);
      const cv = canvas(320, 240);
      for (let i = 0; i < 3; i++) withState(st, function () { return r.renderTo(cv, { state: st, width: 320, height: 240 }); });
      t.eq(calls, 3, 'a content surface\'s drawVolume runs once per frame');
      t.ok(sawTile, 'drawVolume gets (g with g.tile, surface, time)');
      t.eq(DD.problems.slice(p0).filter(function (w) { return /cloud exploded/.test(w); }).length, 1, 'a throwing drawVolume warns once and is disabled');
      // instance height: a pet rock is a pebble next to the def's boulder; googly eyes are white
      const measure = function (obj) {
        const c = canvas(120, 120), k = c.getContext('2d');
        r.drawObjectAt(k, obj, 60, 100, 2, { theme: 'cellar' });
        const d = k.getImageData(0, 0, 120, 120).data;
        let top = 120, white = 0;
        for (let y = 0; y < 120; y++) for (let x = 0; x < 120; x++) {
          const i = (y * 120 + x) * 4;
          if (d[i + 3] > 60) { top = Math.min(top, y); if (d[i] > 235 && d[i + 1] > 235 && d[i + 2] > 235) white++; }
        }
        return { h: 100 - top, white: white };
      };
      const boulder = measure({ id: 'rock', hp: 0, maxHp: 0, data: {} });
      const pebble = measure({ id: 'rock', hp: 10, maxHp: 10, height: 0.45, data: {} });
      const rocky = measure({ id: 'rock', hp: 10, maxHp: 10, height: 0.45, googly: true, data: {} });
      t.ok(pebble.h < boulder.h * 0.65, 'instance height 0.45 paints the rock smaller (' + pebble.h + ' vs ' + boulder.h + ' px)');
      t.ok(rocky.white > pebble.white + 10, 'googly: true adds a pair of googly eyes (' + rocky.white + ' white px)');
      const huge = measure({ id: 'rock', hp: 0, maxHp: 0, height: 99, data: {} });
      t.ok(huge.h <= 100 && huge.h > boulder.h, 'absurd heights are clamped');
    } finally {
      delete DD.defs.surfaces[surfId];
      delete DD.defs.surfaces[badId];
      for (let i = DD.problems.length - 1; i >= p0; i--) if (/cloud exploded/.test(DD.problems[i])) DD.problems.splice(i, 1);
      r.invalidate();
    }
  }, { tags: ['render'] });

  // ---- v2: wind-ups in step with playback, threat shading, reach, turn ring, camera follow --------------------------
  T.suite('render: v2 wind-ups are drawn in step with FX playback (announced when their marker plays, landed at their owner\'s turn)', function (t) {
    const r = R();
    const F = DD.FX;
    const inst = F.instant;
    const grid = makeGrid(9, 9);
    const boss = makeUnit('wu_b', 'enemy', 7, 2, { tier: 'boss', maxHp: 200, hp: 200,
      intents: [{ id: 'wu1', skillId: 'test_none', windup: true, anchor: 'ground', abs: { x: 2, y: 2 }, tiles: [{ x: 2, y: 2 }, { x: 3, y: 2 }], label: 'Old Audit', icon: '📄', dmg: 9, turnsLeft: 1, delay: 1 }] });
    const hero = makeUnit('wu_h', 'hero', 2, 5);
    const st = makeState(grid, [hero, boss]);
    const cv = canvas(480, 320);
    const draw = function () { return withState(st, function () { return r.renderTo(cv, { state: st, width: 480, height: 320 }); }); };
    try {
      F.instant = false;
      F.reset();
      r.invalidate();
      let res = draw();
      t.eq((res && res.windups || []).join(','), 'wu1', 'FX idle: the logical wind-ups are drawn');
      // the boss winds up a second attack during AI playback: hidden until its 'windup' marker plays
      boss.intents.push({ id: 'wu2', skillId: 'test_none', windup: true, anchor: 'ground', abs: { x: 5, y: 5 }, tiles: [{ x: 5, y: 5 }], label: 'New Audit', dmg: 12, turnsLeft: 1, delay: 1 });
      F.push({ type: 'wait', ms: 1000 });
      F.push({ type: 'windup', unitId: 'wu_b', intentId: 'wu2', tiles: [{ x: 5, y: 5 }], ms: 0 });
      // ...and the old one already landed in logic, at the start of the boss's turn (marker queued after the wait)
      F.push({ type: 'turn', unitId: 'wu_b', round: 2, ms: 0 });
      boss.intents = boss.intents.filter(function (i) { return i.id !== 'wu1'; });
      r.invalidate();
      res = draw();
      const ids = (res && res.windups) || [];
      t.ok(ids.indexOf('wu2') < 0, 'a wind-up whose announcement has not played yet is hidden');
      t.ok(ids.indexOf('wu1') >= 0, 'a landed wind-up stays until playback reaches its owner\'s turn');
      F.update(1100);
      t.ok(!F.busy(), 'playback done');
      res = draw();
      t.eq(((res && res.windups) || []).join(','), 'wu2', 'after playback: only the new wind-up');
      t.ok(res.badges.some(function (b) { return b.label === 'New Audit' && b.dmg === 12; }), 'with its ⏳ badge');
      // an interrupted wind-up with no turn of its owner pending vanishes at once
      F.push({ type: 'wait', ms: 500 });
      boss.intents = [];
      r.invalidate();
      res = draw();
      t.eq(((res && res.windups) || []).length, 0, 'interrupted (no owner turn queued): gone immediately');
      // the 'windup' FX handler lights the tiles (non-blocking effect)
      const n0 = DD.FXRender.count();
      DD.FX.handlers.windup.start({ type: 'windup', tiles: [{ x: 1, y: 1 }, { x: 2, y: 1 }], unitId: 'wu_b' });
      t.ok(DD.FXRender.count() >= n0 + 2, 'the windup marker pulses its tiles');
    } finally {
      F.reset();
      F.instant = inst;
      r.invalidate();
      r.resetOverlay();
    }
  }, { tags: ['render'] });

  T.suite('render: threat shading, one enemy\'s reach, the turn ring and AP only on the acting turn', function (t) {
    const r = R();
    const grid = makeGrid(9, 9);
    const h1 = makeUnit('tr_h1', 'hero', 2, 2, { ap: 3 });
    const h2 = makeUnit('tr_h2', 'hero', 2, 4, { ap: 3 });
    const e1 = makeUnit('tr_e1', 'enemy', 6, 3);
    const st = makeState(grid, [h1, h2, e1], { order: [{ unitId: 'tr_h1' }, { unitId: 'tr_h2' }, { unitId: 'tr_e1' }], current: 'tr_h1' });
    const cv = canvas(480, 320);
    const draw = function () { return withState(st, function () { return r.renderTo(cv, { state: st, width: 480, height: 320 }); }); };
    const pixels = function () { return cv.getContext('2d').getImageData(0, 0, 480, 320).data; };
    const diff = function (a, b) { let n = 0; for (let i = 0; i < a.length; i += 16) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 30) n++; return n; };
    try {
      r.resetOverlay();
      t.ok('threat' in r.overlay && 'reach' in r.overlay && 'turnUnitId' in r.overlay, 'the overlay contract has the v2 fields');
      let res = draw();
      t.eq(res.threatTiles, 0, 'no threat shading by default');
      const plain = pixels();
      r.overlay.threat = { tiles: [{ x: 3, y: 3, dmg: 6 }, { x: 4, y: 3, dmg: 14, lethal: true }, { x: 5, y: 3, dmg: 3 }, { x: 99, y: 2, dmg: 5 }, { x: 1, y: 1, dmg: 0 }, null], ref: 12 };
      res = draw();
      t.eq(res.threatTiles, 3, 'threat tiles shaded (off-board, zero and null entries ignored)');
      t.ok(diff(plain, pixels()) > 40, 'the shading is visible');
      r.overlay.threat = null;
      r.overlay.reach = { unitId: 'tr_e1', tiles: [{ x: 5, y: 3 }, { x: 4, y: 3 }, { x: 6, y: 2 }] };
      res = draw();
      t.eq(res.reachTiles, 3, 'one enemy\'s reach shaded');
      r.overlay.reach = null;
      const before = pixels();
      r.overlay.turnUnitId = 'tr_e1';
      res = draw();
      t.ok(diff(before, pixels()) > 10, 'the acting unit gets its turn ring');
      r.overlay.turnUnitId = 'no_such_unit';
      t.tryRun('a turn ring for a missing unit is ignored', draw);
      // AP pips: only the acting hero (st.current) shows them now
      r.overlay.turnUnitId = null;
      st.current = 'tr_h2';
      const a = (draw(), pixels());
      st.current = 'tr_h1';
      const b = (draw(), pixels());
      t.ok(diff(a, b) > 0, 'AP pips follow the acting hero');
    } finally { r.resetOverlay(); }
  }, { tags: ['render'] });

  T.suite('render: DD.Render.follow keeps the acting unit in view with the least camera move', function (t) {
    const r = R();
    const st = makeState(makeGrid(13, 13));
    r.stateOverride = st;
    try {
      t.ok(typeof r.follow === 'function', 'DD.Render.follow exists');
      r.fitMap({ instant: true });
      const cam0 = { x: r.camera.x, y: r.camera.y, zoom: r.camera.zoom };
      t.ok(!r.follow(6, 6), 'a unit already in view: the camera stays put');
      t.ok(r.camera.x === cam0.x && r.camera.y === cam0.y, 'unchanged');
      r.zoomAt(2.5 / r.camera.zoom);
      r.centerOn(1, 1, { instant: true });
      const size = r.size(), m = r.margins();
      const out = r.worldToScreen(12, 12);
      t.ok(out.x > size.width - m.right || out.y > size.height - m.bottom || out.x < m.left, 'zoomed in on a corner: the far corner is off the board area');
      t.ok(r.follow(12, 12), 'following it moves the camera');
      const p = r.worldToScreen(12, 12);
      t.ok(p.x >= m.left - 1 && p.x <= size.width - m.right + 1 && p.y >= m.top - 1 && p.y <= size.height - m.bottom + 1, 'the unit is inside the board area now (' + Math.round(p.x) + ',' + Math.round(p.y) + ')');
      t.near(r.camera.zoom, 2.5, 1e-9, 'without touching the zoom');
      t.ok(!r.follow(NaN, 3), 'bad input is ignored');
    } finally {
      r.stateOverride = null;
      r.fitMap({ instant: true });
    }
  }, { tags: ['render'] });

  // ---- performance -----------------------------------------------------------------------------------------
  T.suite('render: frame budget on a 13x13 map with 15 units', function (t) {
    const r = R();
    const rng = DD.RNG('perf');
    const terr = ['stone', 'wood', 'grass', 'water', 'lava', 'cobble'];
    const grid = makeGrid(13, 13, function (tl) {
      tl.t = terr[rng.int(0, terr.length - 1)];
      tl.h = rng.chance(0.25) ? rng.int(1, 2) : 0;
      if (tl.x === 0 || tl.y === 0) tl.t = 'wall';
      else if (rng.chance(0.1)) tl.obj = { id: ['crate', 'barrel', 'pillar', 'brazier', 'tree'][rng.int(0, 4)], hp: 3, maxHp: 6, data: {} };
      else if (rng.chance(0.08)) tl.surface = { id: ['fire', 'poison', 'blood', 'oil'][rng.int(0, 3)], turns: 2 };
    });
    const units = [];
    for (let i = 0; i < 15; i++) {
      const side = i < 5 ? 'hero' : 'enemy';
      const u = makeUnit('pf' + i, side, 1 + (i * 5) % 11, 1 + (i * 3) % 11, { statuses: i % 3 ? [] : [{ id: 'burn', stacks: 2, turns: 2 }] });
      if (side === 'enemy') u.intents = [{ skillId: 'test_none', anchor: 'ground', tiles: [{ x: u.x - 1, y: u.y }, { x: u.x - 2, y: u.y }], dmg: 6, icon: '⚔️' }];
      units.push(u);
    }
    const st = makeState(grid, units, { theme: 'hellscape' });
    const cv = canvas(1280, 720);
    withState(st, function () { r.renderTo(cv, { state: st, width: 1280, height: 720 }); });   // warm texture caches
    const n = 12, t0 = performance.now();
    withState(st, function () { for (let i = 0; i < n; i++) r.renderTo(cv, { state: st, width: 1280, height: 720, dt: 16 }); });
    const ms = (performance.now() - t0) / n;
    t.log('avg frame ' + ms.toFixed(2) + ' ms (headless software canvas)');
    t.ok(ms < 60, 'frame time within a generous software-rendering budget (' + ms.toFixed(1) + ' ms)');
  }, { tags: ['render', 'perf'] });
})();
