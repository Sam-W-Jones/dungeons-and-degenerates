/* Dungeons and Degenerates — tests/render_tests.js (RENDER-WORLD)
 * Suites "render: ...": iso projection round-trips, picking on elevated tiles and unit sprites, camera
 * fit/zoom/pan, offscreen rendering of every theme / terrain / object / surface id (plus unknown ids and broken
 * content painters), overlays + telegraphs + widgets, title / empty scenes, a sandbox battle if the engine and
 * fixtures are present, DD.Input event emission, and a frame-time budget check. Map rotation: the view math, painter's
 * order, picking and pixels at any yaw, the cutaway, the camera pivot, keys / middle drag / sideways wheel / animated
 * turns, and the moving view's level of detail.
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

  // ---- map rotation (view yaw) ------------------------------------------------------------------------------
  /** Path calls recorded by a fake 2D context (moveTo / lineTo / closePath). */
  function pathRecorder() {
    const ops = [];
    return { ops: ops, moveTo: function (x, y) { ops.push(['M', x, y]); }, lineTo: function (x, y) { ops.push(['L', x, y]); },
      closePath: function () { ops.push(['Z']); } };
  }
  const ROT_YAWS = (function () { const a = []; for (let i = 0; i < 48; i++) a.push(i * 7.5 + (i % 4 === 3 ? 1.234 : 0)); return a; })();

  T.suite('render: rotation math', function (t) {
    const Iso = DD.Iso;
    t.eq(Iso.view().yaw, 0, 'the live view starts at yaw 0');
    t.ok(Iso.view().legacy, 'yaw 0 is the legacy view');
    const rng = DD.RNG('rotmath');
    // (1) round trips at 48 yaws
    let worst = 0;
    ROT_YAWS.forEach(function (yaw) {
      Iso.withYaw(yaw, function () {
        for (let i = 0; i < 300; i++) {
          const x = rng.float(-5, 25), y = rng.float(-5, 25), h = rng.float(-1.25, 5);
          const w = Iso.toWorld(x, y, h), g = Iso.fromWorld(w.x, w.y, h);
          worst = Math.max(worst, Math.abs(g.x - x), Math.abs(g.y - y));
        }
      });
    });
    t.ok(worst < 1e-9, 'fromWorld(toWorld(p)) == p at 48 yaws (worst ' + worst + ')');
    t.eq(Iso.view().yaw, 0, 'withYaw restores the view');
    // (2) yaw 0 is today's arithmetic, bit for bit
    let same = true;
    for (let i = 0; i < 300 && same; i++) {
      const x = rng.float(-5, 25), y = rng.float(-5, 25), h = rng.float(0, 4), u = rng.float(-0.5, 0.5), v = rng.float(-0.5, 0.5);
      const w = Iso.toWorld(x, y, h), f = Iso.fromWorld(w.x + 0.3, w.y - 0.7, h), l = Iso.local(u, v);
      const a = (w.x + 0.3) / 32, b = (w.y - 0.7 + h * 16) / 16;
      same = w.x === (x - y) * 32 && w.y === (x + y) * 16 - h * 16 && f.x === (a + b) / 2 && f.y === (b - a) / 2 &&
        l.x === (u - v) * 32 && l.y === (u + v) * 16 && Iso.depth(x, y) === x + y;
    }
    t.ok(same, 'yaw 0: toWorld / fromWorld / local / depth equal the classic formulas exactly');
    // (3) quarter matrices, det
    const Q = [[32, -32, 16, 16], [-32, -32, 16, -16], [-32, 32, -16, -16], [32, 32, -16, 16]];
    Q.forEach(function (m, q) {
      const V = Iso.makeView(q * 90);
      t.eq([V.ax, V.bx, V.ay, V.by].join(','), m.join(','), 'quarter ' + q + ' matrix is exact');
      t.eq(V.quarter, q, 'quarter ' + q + ' flagged');
      t.ok(V.corners.every(function (p) { return Number.isInteger(p[0]) && Number.isInteger(p[1]); }), 'quarter ' + q + ' corners are integers');
    });
    t.eq(Iso.makeView(-90).quarter, 3, '-90 normalises to the 270 quarter');
    t.eq(Iso.makeView(450.0000001).key, 'q1', '450 deg (+ noise) is the 90 quarter');
    t.ok(Iso.makeView(30) === Iso.makeView(390), 'views are memoised per normalised yaw');
    let detOk = true, extOk = true;
    ROT_YAWS.forEach(function (yaw) {
      const V = Iso.makeView(yaw);
      if (Math.abs(V.ax * V.by - V.bx * V.ay - 1024) > 1e-9) detOk = false;
      if (V.hx < 22.6 || V.hx > 32 + 1e-9 || V.hy < 11.3 || V.hy > 16 + 1e-9) extOk = false;
    });
    t.ok(detOk, 'det A = 1024 at every yaw');
    t.ok(extOk, 'quad half-extents within [22.6, 32] x [11.3, 16]');
    // (4) quadPath == diamondPath at the quarters; a rotated quad stays inside the classic diamond's box
    [0, 90, 180, 270].forEach(function (yaw) {
      const a = pathRecorder(), b = pathRecorder();
      Iso.quadPath(a, 10, 20, 28, 14, Iso.makeView(yaw));
      Iso.diamondPath(b, 10, 20, 28, 14);
      t.eq(JSON.stringify(a.ops), JSON.stringify(b.ops), 'quadPath == diamondPath at ' + yaw);
    });
    const r30 = pathRecorder();
    Iso.quadPath(r30, 0, 0, 32, 16, Iso.makeView(30));
    t.ok(r30.ops.slice(0, 4).every(function (o) { return Math.abs(o[1]) <= 32 && Math.abs(o[2]) <= 16; }), 'a 30 deg quad lies inside the diamond box');
    t.ok(r30.ops[0][2] === Math.min.apply(null, r30.ops.slice(0, 4).map(function (o) { return o[2]; })), 'quadPath starts at the top corner');
    // (5) visible faces and role frames per quarter
    const want = [['S', 'E'], ['E', 'N'], ['N', 'W'], ['W', 'S']];
    want.forEach(function (w, q) {
      const V = Iso.makeView(q * 90);
      t.eq(V.faces.map(function (e) { return e.dir + e.frame; }).join(','), w[0] + 'L,' + w[1] + 'R', 'quarter ' + q + ' shows ' + w.join('+'));
      t.eq(V.backChain.length + V.frontChain.length, 6, 'quarter ' + q + ' chains: left, top/bottom, right');
    });
    t.eq(Iso.makeView(45).faces.length, 1, 'a diagonal view shows one face');
    // (6) shades exact at quarters, continuous elsewhere (adjacent 0.1 deg samples)
    [0, 90, 180, 270].forEach(function (yaw) {
      const V = Iso.makeView(yaw);
      t.ok(V.faces[0].shade === 0 && V.faces[1].shade === 1, 'quarter ' + yaw + ': left face shade 0, right face 1');
      t.ok(V.edgeList.every(function (e) { return e.shadowW === (e.back ? 1 : 0); }), 'quarter ' + yaw + ': contact shadows only behind');
    });
    let jump = 0, prev = Iso.makeView(0);
    for (let i = 1; i <= 3600; i++) {
      const V = Iso.makeView(i / 10);
      V.edgeList.forEach(function (e, k) {
        const p = prev.edgeList[k];
        if (e.nf >= -1e-9 && p.nf >= -1e-9) jump = Math.max(jump, Math.abs(e.shade - p.shade));
        jump = Math.max(jump, Math.abs(e.shadowW - p.shadowW));
      });
      prev = V;
    }
    t.ok(jump < 0.01, 'face shades / shadow weights are continuous (worst step ' + jump.toFixed(4) + ')');
    t.ok(Iso.makeView(0).edges.N.cut === 0 && Iso.makeView(0).edges.W.cut === 0, 'no border cutaway at yaw 0');
    t.ok(Iso.makeView(180).edges.N.cut === 1 && Iso.makeView(180).edges.E.cut === 0, 'yaw 180: the N border is cut, E never is');
    // (7) the ground warp: W(d)·A(b) == A(b + d)
    let wErr = 0;
    [[0, 30], [90, -12.5], [200, 77], [33.3, 3.75]].forEach(function (p) {
      const Vb = Iso.makeView(p[0]), Vt = Iso.makeView(p[0] + p[1]), w = Iso.makeView(p[1]).warp;
      Vb.corners.forEach(function (c, i) {
        const x = w[0] * c[0] + w[2] * c[1], y = w[1] * c[0] + w[3] * c[1];
        wErr = Math.max(wErr, Math.abs(x - Vt.corners[i][0]), Math.abs(y - Vt.corners[i][1]));
      });
    });
    t.ok(wErr < 1e-9, 'W(d) maps the yaw-b quad onto the yaw-(b+d) quad (err ' + wErr + ')');
    // (8) display facing
    const sf = function (yaw, f, dir, prev) { return Iso.withYaw(yaw, function () { return Iso.screenFacing(f, dir, prev); }); };
    t.ok(sf(0, 1) === 1 && sf(0, -1) === -1 && sf(0, 1, { x: -1, y: 0 }) === 1, 'yaw 0: the engine facing, unchanged');
    t.ok(sf(180, 1) === -1 && sf(180, -1) === 1 && sf(180, 1, { x: 1, y: 0 }) === -1, 'yaw 180: mirrored');
    t.eq(sf(90, 1, { x: 1, y: 0 }), -1, 'yaw 90: a unit that stepped +x faces screen left');
    let flick = 0;
    [-1, 1].forEach(function (p) {
      for (let y = 88; y <= 92; y += 0.25) if (sf(y, 1, null, p) !== p) flick++;
    });
    t.eq(flick, 0, 'no flip across 90 +- 2 deg (keeps the shown side)');
    t.eq(Iso.view().yaw, 0, 'the live view is still yaw 0');
  }, { tags: ['render'] });

  /** Do two convex polygons ([[x, y], ...]) overlap with positive area? (separating axis test) */
  function convexOverlap(a, b) {
    const polys = [a, b];
    for (let p = 0; p < 2; p++) {
      const P = polys[p];
      for (let i = 0; i < P.length; i++) {
        const q = P[(i + 1) % P.length], nx = q[1] - P[i][1], ny = P[i][0] - q[0];
        const len = Math.hypot(nx, ny);
        if (len < 1e-9) continue;
        let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
        a.forEach(function (v) { const d = (v[0] * nx + v[1] * ny) / len; a0 = Math.min(a0, d); a1 = Math.max(a1, d); });
        b.forEach(function (v) { const d = (v[0] * nx + v[1] * ny) / len; b0 = Math.min(b0, d); b1 = Math.max(b1, d); });
        if (a1 <= b0 + 1e-6 || b1 <= a0 + 1e-6) return false;
      }
    }
    return true;
  }
  /** A rough 10x10 test board (h 0-4 plus walls) and each column's top level. */
  function rotBoard(seed) {
    const rng = DD.RNG(seed || 'rotboard');
    return makeGrid(10, 10, function (tl) {
      tl.h = rng.int(0, 4);
      if (rng.chance(0.15)) tl.t = 'wall';
      else if (rng.chance(0.08)) { tl.t = 'pit'; tl.h = 0; }
    });
  }
  /** Screen hull of a column (tile top quad at `top` down to the slab) at the current view. */
  function columnHull(x, y, top) {
    const Iso = DD.Iso, V = Iso.view();
    const a = Iso.toWorld(x, y, top), b = Iso.toWorld(x, y, -1.25);
    return V.backChain.map(function (p) { return [a.x + p[0], a.y + p[1]]; })
      .concat(V.frontChain.slice().reverse().map(function (p) { return [b.x + p[0], b.y + p[1]]; }));
  }
  /** Painter's-order violations at the current view: overlapping column pairs whose depth order breaks the
   *  separating-grid-plane rule (the column nearer the viewer along a separating plane must draw later). */
  function orderViolations(tiles, topOf, keyOf) {
    const Iso = DD.Iso, V = Iso.view();
    const hulls = tiles.map(function (tl) { return columnHull(tl.x, tl.y, topOf(tl)); });
    const box = hulls.map(function (h) {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      h.forEach(function (p) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
      return [x0, x1, y0, y1];
    });
    const wx = V.c + V.s, wy = V.c - V.s;
    let bad = 0, checked = 0;
    for (let i = 0; i < tiles.length; i++) {
      for (let j = i + 1; j < tiles.length; j++) {
        const bi = box[i], bj = box[j];
        if (bi[1] <= bj[0] || bj[1] <= bi[0] || bi[3] <= bj[2] || bj[3] <= bi[2]) continue;
        if (!convexOverlap(hulls[i], hulls[j])) continue;
        const A = tiles[i], B = tiles[j], need = [];
        if (A.x !== B.x && Math.abs(wx) > 1e-9) need.push(Math.sign((B.x - A.x) * wx));
        if (A.y !== B.y && Math.abs(wy) > 1e-9) need.push(Math.sign((B.y - A.y) * wy));
        if (!need.length) continue;
        checked++;
        const kA = keyOf(A), kB = keyOf(B);
        const got = Math.abs(kA - kB) < 1e-7 ? 0 : Math.sign(kB - kA);
        if (need.some(function (n) { return n !== got; })) bad++;
      }
    }
    return { bad: bad, checked: checked };
  }

  T.suite('render: painter\'s order at any yaw', function (t) {
    const Iso = DD.Iso;
    const grid = rotBoard('order');
    const topOf = function (tl) { return tl.h + (tl.t === 'wall' ? 3 : 0); };
    let bad = 0, checked = 0;
    for (let yaw = 0; yaw < 360; yaw += 3) {
      Iso.withYaw(yaw, function () {
        const r = orderViolations(grid.tiles, topOf, function (tl) { return Iso.depth(tl.x, tl.y); });
        bad += r.bad; checked += r.checked;
      });
    }
    t.ok(checked > 1000, 'overlapping column pairs checked (' + checked + ')');
    t.eq(bad, 0, 'Iso.depth orders every overlapping pair like its separating grid plane, every 3 deg');
    // the renderer's own draw order (depth groups) obeys the same rule; at yaw 0 the groups are the x + y diagonals
    const R0 = DD.Render;
    if (R0 && R0._rot && typeof R0._rot.order === 'function') {
      let gBad = 0;
      for (let yaw = 0; yaw < 360; yaw += 9) {
        Iso.withYaw(yaw, function () {
          const o = R0._rot.order(10, 10);
          gBad += orderViolations(grid.tiles, topOf, function (tl) { return o.groupOf[tl.y * 10 + tl.x]; }).bad;
        });
      }
      t.eq(gBad, 0, 'DD.Render draws the depth groups in a valid painter\'s order, every 9 deg');
      const o0 = R0._rot.order(10, 10);
      t.ok(o0.groups.length === 19 && o0.groups.every(function (g, d) {
        return g.every(function (i, k) { return (i % 10) + Math.floor(i / 10) === d && (k === 0 || i % 10 > g[k - 1] % 10); });
      }), 'yaw 0: group d is the x + y = d diagonal, members by x (today\'s loop)');
      const o90 = Iso.withYaw(90, function () { return R0._rot.order(10, 10); });
      t.eq(o90.groups.length, 19, 'yaw 90: 19 diagonals (x - y) as well');
      const o30 = Iso.withYaw(30, function () { return R0._rot.order(10, 10); });
      t.ok(o30.groups.length > 60, 'yaw 30: mostly single-tile groups (' + o30.groups.length + ')');
    }
    t.eq(Iso.view().yaw, 0, 'the live view is still yaw 0');
  }, { tags: ['render'] });

  T.suite('render: picking at any yaw', function (t) {
    const Iso = DD.Iso, r = R();
    const grid = rotBoard('pick');
    const hero = makeUnit('rp_h', 'hero', 5, 5);
    const st = makeState(grid, [hero]);
    r.stateOverride = st;
    const cam = { x: r.camera.x, y: r.camera.y, zoom: r.camera.zoom };
    try {
      r.camera.x = 0; r.camera.y = 100; r.camera.zoom = 1.25;
      const z = r.camera.zoom;
      // 1) yaw 0: the general ray test picks exactly what the classic diamond-column test picked
      const legacyPick = function (sx, sy) {
        const p = r.screenToWorld(sx, sy);
        for (let d = 18; d >= 0; d--) {
          for (let x = Math.max(0, d - 9); x <= Math.min(9, d); x++) {
            const y = d - x, top = r.tileTop(x, y), w = Iso.toWorld(x, y, top);
            if (Iso.inColumn(p.x, p.y, w.x, w.y, 32, 16, (top + 1.25) * 16)) return { x: x, y: y };
          }
        }
        return null;
      };
      const rng = DD.RNG('rotpick');
      const size = r.size();
      let diff = 0;
      for (let i = 0; i < 1500; i++) {
        const sx = rng.float(0, size.width), sy = rng.float(0, size.height);
        if (JSON.stringify(r.screenToTile(sx, sy)) !== JSON.stringify(legacyPick(sx, sy))) diff++;
      }
      t.eq(diff, 0, 'yaw 0: ray picking == the classic column test on 1500 random points');
      // 2) 24 yaws: points on every tile top (inside its inscribed ellipse) pick that tile or a column in front of it
      let wrong = 0, total = 0, self = 0;
      for (let k = 0; k < 24; k++) {
        const yaw = k * 15 + (k % 2 ? 2.5 : 0);
        Iso.withYaw(yaw, function () {
          const V = Iso.view(), o = r._rot.order(10, 10);
          grid.tiles.forEach(function (tl) {
            const top = r.tileTop(tl.x, tl.y), c = r.worldToScreen(tl.x, tl.y, top);
            [[0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]].forEach(function (q) {
              const sx = c.x + q[0] * V.ea * z, sy = c.y + q[1] * V.eb * z;
              const hit = r.screenToTile(sx, sy);
              total++;
              if (hit && hit.x === tl.x && hit.y === tl.y) { self++; return; }
              const p = r.screenToWorld(sx, sy);
              const ok = hit && o.groupOf[hit.y * 10 + hit.x] > o.groupOf[tl.y * 10 + tl.x] &&
                Iso.rayHitsColumn(p.x, p.y, hit.x, hit.y, -1.25, r.tileTop(hit.x, hit.y));
              if (!ok) wrong++;
            });
          });
        });
      }
      t.eq(wrong, 0, 'top-face points pick their tile or a column in front of it (' + total + ' points, ' + self + ' self)');
      t.ok(self > total * 0.4, 'a good share of top-face points pick their own tile on this rough board (' + self + ' of ' + total + ')');
    } finally { r.stateOverride = null; Object.assign(r.camera, cam); }
    // 3) a raised column, a wall and a pit on flat ground
    const g2 = makeGrid(7, 7, function (tl) {
      if (tl.x === 3 && tl.y === 3) tl.h = 3;
      if (tl.x === 1 && tl.y === 5) tl.t = 'wall';
      if (tl.x === 5 && tl.y === 1) tl.t = 'pit';
    });
    const h2 = makeUnit('rp_u', 'hero', 5, 4);
    r.stateOverride = makeState(g2, [h2]);
    try {
      r.camera.x = 0; r.camera.y = 80; r.camera.zoom = 1;
      [45, 180, 300].forEach(function (yaw) {
        Iso.withYaw(yaw, function () {
          const V = Iso.view(), c = r.worldToScreen(3, 3, 3);
          V.faces.forEach(function (e) {
            const mx = (e.pa[0] + e.pb[0]) / 2, my = (e.pa[1] + e.pb[1]) / 2;
            const hit = r.screenToTile(c.x + mx, c.y + my + 14);
            t.ok(hit && hit.x === 3 && hit.y === 3, 'yaw ' + yaw + ': the ' + e.dir + ' side face of a raised column picks it (' + JSON.stringify(hit) + ')');
          });
          t.eq(JSON.stringify(r.screenToTile(c.x, c.y)), '{"x":3,"y":3}', 'yaw ' + yaw + ': its top face');
          const w = r.worldToScreen(1, 5, 3);
          t.eq(JSON.stringify(r.screenToTile(w.x, w.y)), '{"x":1,"y":5}', 'yaw ' + yaw + ': a wall top picks the wall');
          const p = r.worldToScreen(5, 1, 0);
          t.eq(JSON.stringify(r.screenToTile(p.x, p.y + 1)), '{"x":5,"y":1}', 'yaw ' + yaw + ': a pit picks itself');
        });
      });
      Iso.withYaw(90, function () {
        const s = r.worldToScreen(5, 4, 0);
        const u = r.unitAtScreen(s.x, s.y - 18);
        t.ok(u && u.id === 'rp_u', 'yaw 90: unitAtScreen hits the sprite body');
        t.eq(r.unitAtScreen(s.x + 300, s.y), null, 'yaw 90: and misses empty space');
      });
      t.eq(Iso.view().yaw, 0, 'the live view is still yaw 0');
    } finally { r.stateOverride = null; Object.assign(r.camera, cam); }
  }, { tags: ['render'] });

  // Rotation plan T4 (added by the review): an ID buffer of every column's hull (visual top .. slab, cut-away border walls
  // included) filled in DD.Render's painter's order is what the eye sees; screenToTile must name the same tile at every
  // pixel, at odd yaws, zoomed so the board crosses the screen edges. Anti-aliased hull edges are skipped.
  T.suite('render: picking agrees with the painter\'s order pixel for pixel (truth buffer)', function (t) {
    const r = R(), Iso = DD.Iso;
    const rng = DD.RNG('rot-truth');
    const gw = 11, gh = 9;
    const grid = makeGrid(gw, gh, function (tl) {
      const k = rng.float(0, 1);
      if (tl.x === 0 || tl.y === 0) { if (k < 0.7) tl.t = 'wall'; }
      else if (k < 0.12) tl.t = 'wall';
      else if (k < 0.2) tl.t = 'pit';
      else if (k < 0.6) tl.h = rng.int(0, 4);
    });
    const st = makeState(grid);
    const prevScene = r.getScene(), cam = { x: r.camera.x, y: r.camera.y, zoom: r.camera.zoom };
    const size = r.size(), W = Math.min(800, size.width), H = Math.min(500, size.height);
    const cv = canvas(W, H), c = cv.getContext('2d', { willReadFrequently: true });
    let bad = 0, n = 0, ex = '';
    try {
      r.stateOverride = st;
      r.setScene('combat');
      [0, 33, 135, 251].forEach(function (yaw) {
        r.setYaw(yaw, { keepFocus: false });
        const ctr = Iso.toWorld((gw - 1) / 2, (gh - 1) / 2, 1);
        r.camera.zoom = 1.9; r.camera.x = ctr.x + (size.width / 2 - W / 2) / 1.9; r.camera.y = ctr.y + (size.height / 2 - H / 2) / 1.9;
        const o = r._rot.order(gw, gh);
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.clearRect(0, 0, W, H);
        o.groups.forEach(function (grp) {
          grp.forEach(function (i) {
            const x = i % gw, y = (i - x) / gw, top = r.tileTop(x, y);
            const pts = [];
            [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]].forEach(function (q) {
              const a = r.worldToScreen(x + q[0], y + q[1], top), b = r.worldToScreen(x + q[0], y + q[1], -1.25);
              pts.push([a.x, a.y], [b.x, b.y]);
            });
            // convex hull (monotone chain) of the column's 8 corners
            pts.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
            const cross = function (p, q, s) { return (q[0] - p[0]) * (s[1] - p[1]) - (q[1] - p[1]) * (s[0] - p[0]); };
            const lo = [], up = [];
            pts.forEach(function (p) { while (lo.length > 1 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); });
            for (let k = pts.length - 1; k >= 0; k--) { const p = pts[k]; while (up.length > 1 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
            const hp = lo.slice(0, -1).concat(up.slice(0, -1));
            c.beginPath(); c.moveTo(hp[0][0], hp[0][1]);
            for (let k = 1; k < hp.length; k++) c.lineTo(hp[k][0], hp[k][1]);
            c.closePath();
            c.fillStyle = 'rgb(' + (i + 1) + ',' + ((i * 37) & 255) + ',90)';
            c.fill();
          });
        });
        const d = c.getImageData(0, 0, W, H).data;
        const idAt = function (px, py) {
          const k = (py * W + px) * 4;
          if (d[k + 3] !== 255) return 0;
          return d[k + 2] === 90 && ((d[k] - 1) * 37 & 255) === d[k + 1] ? d[k] : -1;
        };
        for (let py = 1; py < H - 1; py += 5) {
          for (let px = 1; px < W - 1; px += 5) {
            const id = idAt(px, py);
            if (id < 0) continue;
            let uni = true;
            for (let dy = -1; dy <= 1 && uni; dy++) for (let dx = -1; dx <= 1; dx++) if (idAt(px + dx, py + dy) !== id) { uni = false; break; }
            if (!uni) continue;
            // the buffer covers the viewport's top-left W x H (the board is centred there)
            const hit = r.screenToTile(px + 0.5, py + 0.5), hid = hit ? hit.y * gw + hit.x + 1 : 0;
            n++;
            if (hid !== id) { bad++; if (!ex) ex = 'yaw ' + yaw + ' (' + px + ',' + py + '): drawn ' + (id - 1) + ', picked ' + (hid - 1); }
          }
        }
      });
    } finally {
      r.setYaw(0, { keepFocus: false });
      r.stateOverride = null;
      r.setScene(prevScene);
      Object.assign(r.camera, cam);
    }
    t.ok(n > 20000, 'enough interior pixels compared (' + n + ')');
    t.eq(bad, 0, 'screenToTile names the column the painter\'s order shows on top' + (ex ? ': ' + ex : ''));
  }, { tags: ['render'] });

  /** FNV-1a hash of a canvas's pixels. */
  function canvasHash(cv) {
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    let h = 0x811c9dc5;
    for (let i = 0; i < d.length; i++) { h ^= d[i]; h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }
  /** A small busy board: terraces, a wall row, a pit, water / lava / ice, surfaces, objects, units, an overlay. */
  function rotShowState() {
    const ids = DD.defs && DD.defs.objects ? Object.keys(DD.defs.objects) : [];
    const grid = makeGrid(9, 9, function (tl) {
      if (tl.y === 0 && tl.x > 1) tl.t = 'wall';
      if (tl.x >= 5 && tl.y >= 5) tl.h = 1 + ((tl.x + tl.y) % 2);
      if (tl.x === 2 && tl.y === 4) tl.t = 'pit';
      if (tl.x === 6 && tl.y === 2) tl.t = 'water';
      if (tl.x === 7 && tl.y === 2) tl.t = 'lava';
      if (tl.x === 1 && tl.y === 7) tl.t = 'ice';
      if (tl.x === 3 && tl.y === 6) tl.t = 'grass';
      if (tl.x === 4 && tl.y === 1) tl.t = 'gold';
      if (tl.x === 3 && tl.y === 2) tl.surface = { id: 'fire', turns: 2, data: {} };
      if (tl.x === 4 && tl.y === 6) tl.surface = { id: 'web', turns: 2, data: {} };
      if (tl.x === 6 && tl.y === 4) tl.obj = { id: ids.indexOf('pillar') >= 0 ? 'pillar' : 'crate', hp: 0, maxHp: 0, data: {} };
      if (tl.x === 2 && tl.y === 2) tl.obj = { id: 'mirror', hp: 0, maxHp: 0, data: { facing: 'E' } };
      if (tl.x === 7 && tl.y === 4) tl.obj = { id: 'fence', hp: 0, maxHp: 0, data: {} };
    });
    const units = [makeUnit('ry_h', 'hero', 4, 4), makeUnit('ry_e', 'enemy', 6, 6, { lastDir: { x: -1, y: 0 } }), makeUnit('ry_b', 'hero', 5, 3)];
    return makeState(grid, units, { theme: 'academy' });
  }

  T.suite('render: rotated frames keep yaw 0 intact', function (t) {
    const r = R(), Iso = DD.Iso;
    const st = rotShowState();
    const cv = canvas(640, 400);
    const draw = function (yaw) { return withState(st, function () { return r.renderTo(cv, { state: st, width: 640, height: 400, yaw: yaw }); }); };
    try {
      r.resetOverlay();
      Object.assign(r.overlay, { moveTiles: [{ x: 3, y: 4 }, { x: 3, y: 5 }, { x: 4, y: 5 }], path: [{ x: 3, y: 4 }, { x: 3, y: 5 }],
        hover: { x: 5, y: 3 }, targetTiles: [{ x: 6, y: 6 }], areaTiles: [{ x: 6, y: 5 }, { x: 6, y: 6 }], selectedId: 'ry_h' });
      draw(0); canvasHash(cv);
      if (r._rot) r._rot.reset();
      draw(0);
      const h0 = canvasHash(cv);
      t.eq(r._rot ? r._rot.stats.warpDraws : 0, 0, 'no warped draws at yaw 0');
      const seen = {};
      [30, 90, 200, 333.3].forEach(function (y) {
        const res = draw(y);
        seen[y] = canvasHash(cv);
        t.ok(res && res.units === 3, 'yaw ' + y + ': all units drawn');
        t.ok(seen[y] !== h0, 'yaw ' + y + ': a different picture');
      });
      t.ok(r._rot && r._rot.stats.warpDraws > 0, 'odd angles shear faces / warp content (' + (r._rot && r._rot.stats.warpDraws) + ')');
      draw(0);
      t.eq(canvasHash(cv), h0, 'yaw 0 again: the very same pixels (no cache / view leaks)');
      if (r._rot) r._rot.reset();
      draw(90);
      t.eq(canvasHash(cv), seen[90], 'yaw 90 again: the same pixels');
      t.eq(r._rot ? r._rot.stats.warpDraws : 0, 0, 'a quarter view draws its bakes and faces at identity (crisp)');
      t.eq(Iso.view().yaw, 0, 'renderTo leaves the live view at yaw 0');
      t.eq(r.getYaw(), 0, 'and the live yaw too');
      // the title diorama is always the classic view
      r.renderTo(cv, { scene: 'title', width: 640, height: 400 });
      const t0 = canvasHash(cv);
      r.renderTo(cv, { scene: 'title', width: 640, height: 400, yaw: 120 });
      t.eq(canvasHash(cv), t0, 'the title ignores the yaw');
    } finally { r.resetOverlay(); }
  }, { tags: ['render'] });

  T.suite('render: blocks turn with the board (yawAware painter, built-in boxes)', function (t) {
    const r = R(), Iso = DD.Iso;
    const pic = function (yaw, opts, fn) {
      const cv = canvas(160, 140), c = cv.getContext('2d');
      c.translate(80, 110);
      Iso.withYaw(yaw, function () { fn(Iso.painter(c, opts)); });
      return canvasHash(cv);
    };
    const block = function (g) { g.box(0, 0, 24, 12, 30, { top: '#c08f52', left: '#a0713a', right: '#83592b' }, true); g.diamond(0, -30, 12, 6, '#2a1a10'); };
    t.eq(pic(0, { yawAware: true }, block), pic(0, {}, block), 'yaw 0: the yawAware g.box / g.diamond draw the very same pixels as the billboard ones');
    t.eq(pic(30, {}, block), pic(0, {}, block), 'a billboard painter ignores the yaw');
    t.ok(pic(30, { yawAware: true }, block) !== pic(0, {}, block), 'a yawAware block turns with the board at 30°');
    const quarter = { 0: 'S,E', 90: 'E,N', 180: 'N,W', 270: 'W,S' };
    Object.keys(quarter).forEach(function (y) {
      Iso.withYaw(+y, function () {
        const g = Iso.painter(canvas(4, 4).getContext('2d'), { yawAware: true });
        const fs = g.faces(0, 0, 32, 16);
        t.eq(fs.map(function (f) { return f.dir; }).join(','), quarter[y], 'yaw ' + y + ': visible faces left -> right');
        t.eq(fs.map(function (f) { return f.frame; }).join(''), 'LR', 'yaw ' + y + ': role frames');
        t.eq(fs[0].shade + ',' + fs[1].shade, '0,1', 'yaw ' + y + ': left / right colours exactly');
      });
    });
    Iso.withYaw(37, function () {
      const c = canvas(4, 4).getContext('2d'), g = Iso.painter(c, { yawAware: true }), V = Iso.view();
      const fs = g.faces(0, 0, 32, 16);
      let ok = fs.length === V.faces.length;
      fs.forEach(function (f, i) {
        const e = V.faces[i];
        ok = ok && Math.abs(f.x0 - V.corners[e.a][0]) < 1e-9 && Math.abs(f.y1 - V.corners[e.b][1]) < 1e-9 && f.dir === e.dir;
        const p = f.at(0.5, 10);
        ok = ok && Math.abs(p[0] - (f.x0 + f.x1) / 2) < 1e-9 && Math.abs(p[1] - ((f.y0 + f.y1) / 2 - 10)) < 1e-9;
        c.save(); f.apply();
        const m = c.getTransform(), q = f.at(1, 10);
        ok = ok && Math.abs(m.a * 1 + m.c * -10 + m.e - q[0]) < 1e-3 && Math.abs(m.b * 1 + m.d * -10 + m.f - q[1]) < 1e-3;   // the CTM is float32
        c.restore();
      });
      t.ok(ok, 'g.faces at 37°: the view\'s faces on the footprint, at(s, up) along the bottom edge, apply() maps (s, -up) there');
      const on = g.on(0, -5, 16, 8, 0.5, -0.25, 3), L = Iso.local(0.5, -0.25);
      t.ok(Math.abs(on[0] - L.x / 2) < 1e-9 && Math.abs(on[1] - (-5 + L.y / 2 - 3)) < 1e-9, 'g.on: a ground point of a half-size footprint, raised');
      const q = g.quad(0, 0, 32, 16);
      t.ok(q.every(function (p, i) { return Math.abs(p[0] - V.corners[i][0]) < 1e-9 && Math.abs(p[1] - V.corners[i][1]) < 1e-9; }), 'g.quad: the view\'s corners');
    });
    // routing: content opts in with def.yawAware; built-in blocks always turn
    const id = 'test_render_yaw_box', id2 = 'test_render_flat_box';
    const draw = function (g) { g.box(0, 0, 20, 10, 26, { top: '#9a9286', left: '#79726a', right: '#655f58' }, true); };
    DD.defs.objects[id] = { id: id, name: 'Yaw Box', __kind: 'objects', height: 0.8, yawAware: true, draw: draw };
    DD.defs.objects[id2] = { id: id2, name: 'Flat Box', __kind: 'objects', height: 0.8, draw: draw };
    try {
      const shot = function (objId, yaw) {
        const st = makeState(makeGrid(3, 3, function (tl) { if (tl.x === 1 && tl.y === 1) tl.obj = { id: objId, hp: 3, maxHp: 3, data: {} }; }), []);
        const cv = canvas(200, 160);
        withState(st, function () { r.renderTo(cv, { state: st, width: 200, height: 160, yaw: yaw, camera: { x: 0, y: 32, zoom: 1.5 } }); });
        return canvasHash(cv);
      };
      t.eq(shot(id, 0), shot(id2, 0), 'yaw 0: a yawAware content block looks exactly like a billboard one');
      t.ok(shot(id, 30) !== shot(id2, 30), 'yaw 30: def.yawAware gets the turning painter, others stay billboards');
      const crate = function (yaw) {
        const st = makeState(makeGrid(3, 3, function (tl) { if (tl.x === 1 && tl.y === 1) tl.obj = { id: 'crate', hp: 3, maxHp: 3, data: {} }; }), []);
        const cv = canvas(200, 160);
        withState(st, function () { r.renderTo(cv, { state: st, width: 200, height: 160, yaw: yaw, camera: { x: 0, y: 32, zoom: 1.5 } }); });
        return canvasHash(cv);
      };
      const p0 = DD.problems.length;
      ['crate', 'chest', 'bookshelf', 'totem', 'pillar', 'statue', 'lever', 'pressure_plate', 'spikes', 'test_render_unknown_object'].forEach(function (oid) {
        [30, 45, 90, 135, 200].forEach(function (y) {
          [{}, { open: true }].forEach(function (fl) {
            const st = makeState(makeGrid(3, 3, function (tl) { if (tl.x === 1 && tl.y === 1) tl.obj = Object.assign({ id: oid, hp: 3, maxHp: 3, data: {} }, fl); }), []);
            withState(st, function () { r.renderTo(canvas(120, 100), { state: st, width: 120, height: 100, yaw: y }); });
          });
        });
      });
      t.eq(DD.problems.slice(p0).filter(function (w) { return /Error in/.test(w); }).length, 0, 'every built-in block paints at 30 / 45 / 90 / 135 / 200 without errors');
      t.ok(crate(90) !== crate(0) && crate(30) !== crate(0), 'the built-in crate turns with the board');
    } finally {
      delete DD.defs.objects[id];
      delete DD.defs.objects[id2];
      r.invalidate();
    }
  }, { tags: ['render'] });

  T.suite('render: wall cutaway', function (t) {
    const r = R(), Iso = DD.Iso;
    const propId = 'test_render_tall_prop', seen = [];
    DD.defs.objects[propId] = { id: propId, name: 'Suspiciously Tall Hat Stand', __kind: 'objects', height: 2,
      draw: function (g) { seen.push(g.tile.x + ',' + g.tile.y + '@' + g.ctx.globalAlpha.toFixed(2)); g.rect(-8, -60, 16, 60, '#887766', true); } };
    const grid = makeGrid(7, 7, function (tl) {
      if (tl.x === 3 && tl.y === 0) tl.t = 'wall';   // N border
      if (tl.x === 0 && tl.y === 4) tl.t = 'wall';   // W border
      if (tl.x === 3 && tl.y === 3) tl.t = 'wall';   // interior
      if ((tl.x === 5 && tl.y === 0) || (tl.x === 5 && tl.y === 5)) tl.obj = { id: propId, hp: 0, maxHp: 0, data: {} };
    });
    const st = makeState(grid, []);
    const cam = { x: r.camera.x, y: r.camera.y, zoom: r.camera.zoom };
    r.stateOverride = st;
    try {
      r.camera.x = 0; r.camera.y = 0; r.camera.zoom = 1;
      const tops = function (yaw) { return Iso.withYaw(yaw, function () { return [r.tileTop(3, 0), r.tileTop(0, 4), r.tileTop(3, 3)]; }); };
      t.eq(tops(0).join(','), '3,3,3', 'yaw 0: border walls keep their full height');
      const t180 = tops(180), t90 = tops(90), t270 = tops(270);
      t.ok(t180[0] <= 0.5 && t180[1] <= 0.5, 'yaw 180: both border walls are cut to a stub (' + t180 + ')');
      t.ok(t90[0] <= 0.5 && t90[1] === 3, 'yaw 90: only the N border faces the camera (' + t90 + ')');
      t.ok(t270[0] === 3 && t270[1] <= 0.5, 'yaw 270: only the W border (' + t270 + ')');
      t.ok([t180[2], t90[2], t270[2]].every(function (v) { return v === 3; }), 'an interior wall is never cut');
      let prev = 3, mono = true, quant = true;
      for (let y = 0; y <= 180; y += 5) {
        const v = tops(y)[0];
        if (v > prev + 1e-9) mono = false;
        if (v < 0.5 || Math.abs(v * 4 - Math.round(v * 4)) > 1e-9) quant = false;
        prev = v;
      }
      t.ok(mono && quant, 'the cut deepens smoothly from 0 to 180 deg, in 1/4 levels, never below half a level');
      Iso.withYaw(180, function () {
        const p = r.worldToScreen(3.2, 1, 0), w = r.screenToWorld(p.x, p.y);
        t.ok(Iso.rayHitsColumn(w.x, w.y, 3, 0, -1.25, 3), 'at full height the wall would hide that spot');
        t.eq(JSON.stringify(r.screenToTile(p.x, p.y)), '{"x":3,"y":1}', 'yaw 180: the floor right behind the cut wall picks itself');
      });
      const cv = canvas(480, 320);
      const draw = function (yaw) { seen.length = 0; withState(st, function () { r.renderTo(cv, { state: st, width: 480, height: 320, yaw: yaw }); }); return seen.slice().sort().join(' '); };
      t.eq(draw(0), '5,0@1.00 5,5@1.00', 'yaw 0: border props are opaque');
      t.eq(draw(180), '5,0@0.45 5,5@1.00', 'yaw 180: a tall prop on the N border fades, an interior one does not');
      draw(0);
      const h0 = canvasHash(cv);
      draw(180);
      t.ok(canvasHash(cv) !== h0, 'the cut view differs');
      draw(0);
      t.eq(canvasHash(cv), h0, 'and yaw 0 is untouched afterwards');
    } finally {
      r.stateOverride = null; Object.assign(r.camera, cam);
      delete DD.defs.objects[propId];
      r.invalidate();
    }
  }, { tags: ['render'] });

  T.suite('render: silhouettes at other yaws', function (t) {
    const r = R(), Iso = DD.Iso;
    const grid = makeGrid(9, 9, function (tl) {
      if (tl.x === 4 && tl.y === 4) tl.h = 3;        // a 3-high column
      if (tl.x === 6 && tl.y === 0) tl.t = 'wall';   // a N border wall
      if (tl.x === 6 && tl.y === 5) tl.t = 'wall';   // an interior wall
    });
    const st = makeState(grid, [makeUnit('sy_col', 'hero', 3, 3), makeUnit('sy_bor', 'hero', 6, 1), makeUnit('sy_int', 'enemy', 6, 6)]);
    const cv = canvas(640, 400);
    const sils = function (yaw, at) {
      const cam = Iso.withYaw(yaw, function () { const w = Iso.toWorld(at[0], at[1], 0); return { x: w.x, y: w.y - 20, zoom: 1.4 }; });
      const res = withState(st, function () { return r.renderTo(cv, { state: st, width: 640, height: 400, camera: cam, yaw: yaw }); });
      const out = {};
      ((res && res.silhouettes) || []).forEach(function (s) { out[s.id] = s; });
      return out;
    };
    [0, 20, 340].forEach(function (yaw) {
      const s = sils(yaw, [3, 3]).sy_col;
      t.ok(s && s.geometry > 0, 'yaw ' + yaw + ': the column in front shows the hero see-through');
    });
    [180, 160, 200].forEach(function (yaw) {
      t.ok(!sils(yaw, [3, 3]).sy_col, 'yaw ' + yaw + ': the column is behind the hero: no silhouette');
    });
    const s180 = sils(180, [6, 3]);
    t.ok(s180.sy_int && s180.sy_int.geometry > 0, 'yaw 180: a full interior wall in front still hides a unit');
    t.ok(!s180.sy_bor, 'yaw 180: the cut-away border wall in front hides nobody');
    const c = r._rot.caches();
    t.ok(c.sil > 0 && c.silBytes <= 24 << 20, 'silhouettes use pooled scratch canvases (' + c.sil + ' sizes, ' + Math.round(c.silBytes / 1024) + ' KB)');
  }, { tags: ['render'] });

  T.suite('render: camera keeps the focus while turning', function (t) {
    const r = R(), Iso = DD.Iso;
    const prevScene = r.getScene(), savedMargins = r.hudMargins, cam = { x: r.camera.x, y: r.camera.y, zoom: r.camera.zoom };
    const st = makeState(makeGrid(13, 13));
    const events = [];
    const off = DD.Events.on('render:view', function (e) { events.push(e); });
    const so = DD.Meta && DD.Meta.data ? DD.Meta.data.settings : null;
    const hadYaw = !!so && Object.prototype.hasOwnProperty.call(so, 'viewYaw'), oldYaw = so ? so.viewYaw : undefined;
    const hadRot = Object.prototype.hasOwnProperty.call(DD.params, 'rot'), oldRot = DD.params.rot;
    const near = function (p, q) { return Math.abs(p.x - q.x) < 0.5 && Math.abs(p.y - q.y) < 0.5; };
    try {
      r.stateOverride = st;
      r.setScene('combat');
      r.hudMargins = { left: 230, right: 24, top: 60, bottom: 250 };
      r.setYaw(0, { keepFocus: false });
      r.fitMap({ instant: true });
      r.zoomAt(1.6);
      const size = r.size(), m = r.margins();
      const A = { x: m.left + (size.width - m.left - m.right) / 2, y: m.top + (size.height - m.top - m.bottom) / 2 };
      const wp = r.screenToWorld(A.x, A.y), g = Iso.fromWorld(wp.x, wp.y, 0);
      events.length = 0;
      [37, 250, 0].forEach(function (yaw) {
        t.eq(r.setYaw(yaw), yaw, 'setYaw(' + yaw + ') returns its target');
        t.eq(r.getYaw(), yaw, 'setYaw without animate is instant');
        t.eq(Iso.view().yaw, yaw, 'the live view follows at once (HUD calls between frames see it)');
        const p = r.worldToScreen(g.x, g.y, 0);
        t.ok(near(p, A), 'yaw ' + yaw + ': the ground point at the board-area centre stays put (' + p.x.toFixed(2) + ',' + p.y.toFixed(2) + ' vs ' + A.x + ',' + A.y + ')');
      });
      t.eq(events.map(function (e) { return e.yaw + (e.moving ? 'm' : ''); }).join(' '), '37 250 0', 'one settled render:view per instant turn');
      r.setYaw(45);
      r.fitMap({ instant: true });
      const off45 = [[0, 0], [12, 0], [0, 12], [12, 12]].filter(function (p) {
        const s = r.worldToScreen(p[0], p[1]);
        return s.x < 0 || s.y < 0 || s.x > size.width || s.y > size.height;
      });
      t.eq(off45.length, 0, 'fitMap at 45 deg puts all 4 board corners on screen');
      r.setYaw(30);
      t.eq(r.turn(1), 90, 'R from 30 targets 90');
      r.setYaw(30);
      t.eq(r.turn(-1), 0, 'Q from 30 targets 0');
      r.setYaw(0);
      r.turn(1);
      t.eq(r.turn(1), 180, 'R twice from 0: 180');
      t.eq(r._rot.yawTarget(), 180, '...the target');
      r.setYaw(0);
      t.eq(r.turn(-1), 270, 'Q from 0: 270');
      r.setYaw(89.5);
      t.eq(r.turn(1), 180, 'within 1 deg of a classic view R goes on to the following one');
      r.setYaw(10);
      t.eq(r.rotateBy(-25), 345, 'rotateBy is relative to the target');
      r.setYaw(200);
      t.eq(r.resetView(), 0, 'resetView');
      t.eq(r.getYaw(), 0, '...back to the classic view');
      // the rotate-drag API (DD.Input's middle button): 0.35 deg per px, snap within 4 deg on release
      t.ok(r.beginRotate(), 'beginRotate');
      t.ok(r.isViewMoving(), 'a drag counts as moving');
      t.ok(!r.follow(12, 12), 'follow stays out of a turning view');
      r.rotateDrag(100);
      t.near(r.getYaw(), 325, 0.01, 'dragging 100 px right turns the board 35 deg counter-clockwise');
      r.endRotate();
      t.near(r.getYaw(), 325, 0.01, 'an odd angle stays where it was left');
      t.ok(!r.isViewMoving(), 'settled (no live loop)');
      r.setYaw(0);
      r.beginRotate(); r.rotateDrag(-5); r.endRotate();
      t.eq(r.getYaw(), 0, 'released 1.75 deg off a classic view: snaps to it');
      r.beginRotate(); r.rotateDrag(-5); r.endRotate({ snap: false });
      t.near(r.getYaw(), 1.75, 0.01, 'snap off (Shift): stays at 1.75');
      // rot=<deg> (debug screenshots) wins over the remembered angle and is never remembered itself
      const before = so ? JSON.stringify(so.viewYaw) : '';
      DD.params.rot = '30';
      r._rot.initYaw();
      t.eq(r.getYaw(), 30, 'rot=30 is applied');
      t.eq(so ? JSON.stringify(so.viewYaw) : '', before, '...and not written to settings.viewYaw');
      if (so) {
        delete DD.params.rot;
        so.viewYaw = 120;
        r._rot.initYaw();
        t.eq(r.getYaw(), 120, 'without rot= the remembered settings.viewYaw is used');
      }
    } finally {
      off();
      if (hadRot) DD.params.rot = oldRot; else delete DD.params.rot;
      if (so) { if (hadYaw) so.viewYaw = oldYaw; else delete so.viewYaw; }
      r.setYaw(0, { keepFocus: false });
      r.hudMargins = savedMargins;
      r.stateOverride = null;
      r.setScene(prevScene);
      Object.assign(r.camera, cam);
    }
    t.eq(DD.Iso.view().yaw, 0, 'the live view is back at yaw 0');
  }, { tags: ['render'] });

  // review: zoomed in past a board corner, the board-area centre sits over empty space; a turn around that empty
  // point used to swing the board almost out of view (10 of 100 tiles left on screen after 180 deg)
  T.suite('render: a turn whose focus is off the board holds the board\'s nearest point', function (t) {
    const r = R(), Iso = DD.Iso;
    const prevScene = r.getScene(), savedMargins = r.hudMargins, cam = { x: r.camera.x, y: r.camera.y, zoom: r.camera.zoom };
    const st = makeState(makeGrid(10, 10));
    try {
      r.stateOverride = st;
      r.setScene('combat');
      r.hudMargins = { left: 230, right: 24, top: 60, bottom: 250 };
      const size = r.size(), m = r.margins();
      const A = { x: m.left + (size.width - m.left - m.right) / 2, y: m.top + (size.height - m.top - m.bottom) / 2 };
      const onScreen = function () {
        return st.grid.tiles.filter(function (tl) { const p = r.worldToScreen(tl.x, tl.y); return p.x > 0 && p.x < size.width && p.y > 0 && p.y < size.height; }).length;
      };
      [[30, [-3, -3], [-0.5, -0.5]], [0, [12, 4], [9.5, 4]], [200, [4, -4], [4, -0.5]]].forEach(function (c) {
        let worst = 100;
        [90, 180, 270].forEach(function (d) {
          r.setYaw(c[0], { keepFocus: false });
          r.fitMap({ instant: true });
          r.zoomAt(2 / r.camera.zoom);
          const p0 = r.worldToScreen(c[1][0], c[1][1], 0);
          r.panBy(A.x - p0.x, A.y - p0.y);   // the board-area centre now looks at empty ground past the edge
          const hold = r.worldToScreen(c[2][0], c[2][1], 0);
          r.setYaw(c[0] + d);
          const q = r.worldToScreen(c[2][0], c[2][1], 0);
          t.ok(Math.abs(q.x - hold.x) < 0.5 && Math.abs(q.y - hold.y) < 0.5, 'yaw ' + c[0] + ' + ' + d + ', centre over ' + c[1] + ': the nearest board point ' + c[2] + ' stays put on screen');
          worst = Math.min(worst, onScreen());
        });
        t.ok(worst >= 30, '...and the board stays in view (worst ' + worst + ' of 100 tile centres on screen)');
      });
      // over the board the pivot is still the ground point at the board-area centre
      r.setYaw(0, { keepFocus: false });
      r.fitMap({ instant: true });
      const wp = r.screenToWorld(A.x, A.y), g = Iso.fromWorld(wp.x, wp.y, 0);
      r.setYaw(123);
      const p = r.worldToScreen(g.x, g.y, 0);
      t.ok(Math.abs(p.x - A.x) < 0.5 && Math.abs(p.y - A.y) < 0.5, 'on the board the focus point itself stays put');
    } finally {
      r.setYaw(0, { keepFocus: false });
      r.hudMargins = savedMargins;
      r.stateOverride = null;
      r.setScene(prevScene);
      Object.assign(r.camera, cam);
    }
  }, { tags: ['render'] });

  T.suite('render: Q / R / Home turn the map', function (t) {
    const r = R(), I = DD.Input;
    if (!I) { t.fail('DD.Input missing'); return; }
    const size = r.size();
    const cv = canvas(size.width, size.height);
    cv.style.cssText = 'position:fixed;left:0;top:0;width:' + size.width + 'px;height:' + size.height + 'px';
    document.body.appendChild(cv);
    const st = makeState(makeGrid(8, 8, function (tl) { if (tl.x === 5 && tl.y === 2) tl.h = 2; }), [makeUnit('qr_h', 'hero', 2, 2)]);
    const prevScene = r.getScene();
    const got = [];
    const offs = ['input:tileClick', 'input:unitClick', 'input:rightClick', 'input:tileHover'].map(function (n) {
      return DD.Events.on(n, function (d) { got.push({ n: n, d: d }); });
    });
    const key = function (k, extra, target) {
      (target || window).dispatchEvent(new KeyboardEvent('keydown', Object.assign({ key: k, code: 'Key' + k.toUpperCase(), bubbles: true }, extra || {})));
      (target || window).dispatchEvent(new KeyboardEvent('keyup', { key: k, bubbles: true }));
    };
    const field = document.createElement('input');
    try {
      r.stateOverride = st;
      r.setScene('combat');
      r.setYaw(0, { keepFocus: false });
      r.fitMap({ instant: true });
      t.ok(I.init(cv), 'DD.Input.init');
      const p = r.worldToScreen(4, 4);
      cv.dispatchEvent(new PointerEvent('pointermove', { clientX: p.x, clientY: p.y, pointerId: 9, bubbles: true }));
      got.length = 0;
      key('r');
      t.eq(r._rot.yawTarget(), 90, 'R turns the map clockwise to 90');
      key('r');
      t.eq(r.getYaw(), 180, 'R again: 180');
      key('q');
      t.eq(r.getYaw(), 90, 'Q turns it back counter-clockwise');
      key('Q');
      t.eq(r.getYaw(), 0, 'Caps-lock Q too');
      key('q', { repeat: true });
      t.eq(r.getYaw(), 0, 'auto-repeat is ignored');
      key('r', { ctrlKey: true });
      t.eq(r.getYaw(), 0, 'Ctrl+R is left to the browser');
      document.body.appendChild(field);
      field.focus();
      key('r', null, field);
      t.eq(r.getYaw(), 0, 'ignored while typing in an input');
      field.blur();
      t.ok(!got.some(function (e) { return e.n !== 'input:tileHover'; }), 'turning never clicks a tile or a unit');
      key('r');
      I.update(16);
      const want = I.pick(p.x, p.y);
      t.ok(I.hover && want && I.hover.x === want.x && I.hover.y === want.y, 'the hover re-picks under the cursor on the turned board');
      key('Home');
      t.eq(r.getYaw(), 0, 'Home resets the view');
      r.stateOverride = null;
      r.setScene('title');
      key('r');
      t.eq(r.getYaw(), 0, 'no turning outside combat');
    } finally {
      offs.forEach(function (off) { off(); });
      I.detach();
      cv.remove(); field.remove();
      r.setYaw(0, { keepFocus: false });
      r.stateOverride = null;
      r.setScene(prevScene);
      r.resetOverlay();
    }
  }, { tags: ['render'] });

  // T12: free rotation input (the middle drag, the release snap, the horizontal wheel) and animated turns
  T.suite('render: input rotates the map with a middle drag, a sideways wheel and animated Q / R', async function (t) {
    const r = R(), I = DD.Input, Iso = DD.Iso;
    if (!I) { t.fail('DD.Input missing'); return; }
    const size = r.size();
    const cv = canvas(size.width, size.height);
    cv.style.cssText = 'position:fixed;left:0;top:0;width:' + size.width + 'px;height:' + size.height + 'px';
    document.body.appendChild(cv);
    const st = makeState(makeGrid(8, 8, function (tl) { if (tl.x === 5 && tl.y === 2) tl.h = 2; }), [makeUnit('md_h', 'hero', 2, 2)]);
    const prevScene = r.getScene(), cam = { x: r.camera.x, y: r.camera.y, zoom: r.camera.zoom };
    const so = DD.Meta && DD.Meta.data ? DD.Meta.data.settings : null;
    const hadSnap = !!so && Object.prototype.hasOwnProperty.call(so, 'rotSnap'), oldSnap = so ? so.rotSnap : undefined;
    let clock = 0;
    const got = [];
    const offs = ['input:tileClick', 'input:unitClick', 'input:rightClick', 'input:tileHover', 'render:view'].map(function (n) {
      return DD.Events.on(n, function (d) { got.push({ n: n, d: d, at: clock }); });
    });
    // buttons follows the pressed button (1 = left, 2 = right, 4 = middle) like a real mouse
    const BITS = { 0: 1, 1: 4, 2: 2 };
    const ptr = function (type, x, y, button, extra) {
      const down = type === 'pointerup' ? 0 : BITS[button];
      cv.dispatchEvent(new PointerEvent(type, Object.assign({ clientX: x, clientY: y, button: button, buttons: down, pointerId: 11, bubbles: true, cancelable: true }, extra || {})));
    };
    const wheel = function (dx, dy, extra) {
      cv.dispatchEvent(new WheelEvent('wheel', Object.assign({ deltaX: dx, deltaY: dy, clientX: size.width / 2, clientY: size.height / 2, bubbles: true, cancelable: true }, extra || {})));
    };
    const key = function (k) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: k, code: 'Key' + k.toUpperCase(), bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keyup', { key: k, bubbles: true }));
    };
    const step = function (ms, n) { for (let i = 0; i < (n || 1); i++) { clock += ms; r._rot.step(ms); } };
    const named = function (n) { return got.filter(function (e) { return e.n === n; }); };
    const clicks = function () { return got.filter(function (e) { return /Click$/.test(e.n); }).length; };
    const gap = function (a, b) { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
    const drag = function (dx, upExtra) {
      const p = r.worldToScreen(4, 4);
      ptr('pointerdown', p.x, p.y, 1);
      ptr('pointermove', p.x + dx / 2, p.y, 1);
      ptr('pointermove', p.x + dx, p.y, 1);
      ptr('pointerup', p.x + dx, p.y, 1, upExtra);
    };
    try {
      r.stateOverride = st;
      r.setScene('combat');
      r.setYaw(0, { keepFocus: false });
      r.fitMap({ instant: true });
      t.ok(I.init(cv), 'DD.Input.init');
      const p = r.worldToScreen(4, 4);
      ptr('pointermove', p.x, p.y, 0, { buttons: 0 });
      t.ok(I.hover && I.hover.x === 4 && I.hover.y === 4, 'hovering tile 4,4');
      got.length = 0;
      // a middle drag turns the map: 0.35 deg per px of horizontal motion, counted from the press point
      ptr('pointerdown', p.x, p.y, 1);
      ptr('pointermove', p.x + 2, p.y + 1, 1);
      t.eq(r.getYaw(), 0, 'inside the 3 px dead zone nothing turns');
      t.ok(!r.isViewMoving(), '...and the view is still');
      ptr('pointermove', p.x + 50, p.y + 30, 1);
      t.near(r.getYaw(), 342.5, 0.01, '50 px right: -17.5 deg (vertical motion ignored)');
      t.ok(r.isViewMoving(), 'a middle drag is a moving view');
      ptr('pointermove', p.x + 100, p.y - 40, 1);
      t.near(r.getYaw(), 325, 0.01, 'a 100 px middle drag turns the map -35 deg');
      t.ok(I.hover && I.hover.x === 4 && I.hover.y === 4, 'the hover is frozen while turning');
      t.eq(named('input:tileHover').length, 0, '...and no hover events go out');
      ptr('pointerup', p.x + 100, p.y - 40, 1);
      t.near(r.getYaw(), 325, 0.01, 'released at an odd angle: it stays there');
      t.ok(!r.isViewMoving(), 'settled (no live loop)');
      const want = I.pick(p.x + 100, p.y - 40), hov = I.hover;
      t.ok(want ? hov && hov.x === want.x && hov.y === want.y : !hov, 'the hover re-picks under the cursor once released');
      t.eq(clicks(), 0, 'a middle drag never clicks a tile, a unit or the right button');
      const views = named('render:view');
      t.ok(views.length >= 2 && views.slice(0, -1).every(function (e) { return e.d.moving; }), 'render:view { moving: true } while dragging');
      t.eq(views.filter(function (e) { return !e.d.moving; }).length, 1, '...and exactly one moving: false when it settles');
      // the release snap (within 4 deg of a classic view), Shift and settings.rotSnap keep the angle
      r.setYaw(0, { keepFocus: false });
      drag(-6);
      t.eq(r.getYaw(), 0, 'released 2.1 deg off the classic view: it snaps there');
      drag(-6, { shiftKey: true });
      t.near(r.getYaw(), 2.1, 0.01, 'Shift on release: no snap');
      if (so) {
        r.setYaw(0, { keepFocus: false });
        so.rotSnap = false;
        drag(-6);
        t.near(r.getYaw(), 2.1, 0.01, 'settings.rotSnap = false: no snap');
        if (hadSnap) so.rotSnap = oldSnap; else delete so.rotSnap;
      }
      // a middle click does nothing; a chorded left button during a middle drag is no click either
      r.setYaw(0, { keepFocus: false });
      got.length = 0;
      ptr('pointerdown', p.x, p.y, 1); ptr('pointerup', p.x, p.y, 1);
      t.eq(clicks() + r.getYaw(), 0, 'a middle click neither clicks nor turns');
      ptr('pointerdown', p.x, p.y, 1);
      ptr('pointermove', p.x + 20, p.y, 0, { buttons: 5 });
      ptr('pointerup', p.x + 20, p.y, 0);
      t.eq(clicks(), 0, 'a left button chorded into a middle drag is not a click');
      t.near(r.getYaw(), 353, 0.01, '...and the drag still turned the map');
      // review: a real mouse turns the map only while the middle button is down — let it go with the left button still
      // held and the turn ends there (the rest of the press neither turns, pans nor clicks)
      const M = { pointerType: 'mouse' };
      const camX = function () { return r.camera.x; };
      r.setYaw(0, { keepFocus: false });
      got.length = 0;
      ptr('pointerdown', p.x, p.y, 1, M);
      ptr('pointermove', p.x + 20, p.y, -1, Object.assign({ buttons: 4 }, M));
      ptr('pointermove', p.x + 20, p.y, 0, Object.assign({ buttons: 5 }, M));
      t.near(r.getYaw(), 353, 0.01, 'mouse: a 20 px middle drag with the left button chorded in turns -7°');
      ptr('pointermove', p.x + 20, p.y, 1, Object.assign({ buttons: 1 }, M));
      t.ok(!r.isViewMoving(), 'mouse: letting go of the middle button ends the turn (left still down)');
      const cx0 = camX();
      ptr('pointermove', p.x + 140, p.y + 10, -1, Object.assign({ buttons: 1 }, M));
      t.near(r.getYaw(), 353, 0.01, '...moving on with only the left button down turns nothing');
      t.eq(camX(), cx0, '...and pans nothing');
      ptr('pointerup', p.x + 140, p.y + 10, 0, Object.assign({ buttons: 0 }, M));
      t.eq(clicks(), 0, '...and its release is no click');
      ptr('pointerdown', p.x, p.y, 1, M);
      ptr('pointermove', p.x, p.y, 0, Object.assign({ buttons: 5 }, M));
      ptr('pointermove', p.x, p.y, 1, Object.assign({ buttons: 1 }, M));
      ptr('pointermove', p.x + 100, p.y, -1, Object.assign({ buttons: 1 }, M));
      ptr('pointerup', p.x + 100, p.y, 0, Object.assign({ buttons: 0 }, M));
      t.ok(Math.abs(r.getYaw() - 353) < 0.01 && camX() === cx0 && clicks() === 0, 'a middle click let go inside its dead zone, then a left drag: no turn, no pan, no click');
      ptr('pointerdown', p.x, p.y, 0, M); ptr('pointerup', p.x, p.y, 0, M);
      t.eq(named('input:tileClick').length, 1, 'the next plain left click clicks again');
      // the window losing focus mid-drag (Alt+Tab) ends the turn where it is; the late release is no click
      r.setYaw(0, { keepFocus: false });
      got.length = 0;
      ptr('pointerdown', p.x, p.y, 1);
      ptr('pointermove', p.x + 30, p.y, 1);
      t.ok(r.isViewMoving(), 'a middle drag is turning');
      window.dispatchEvent(new Event('blur'));
      t.ok(!r.isViewMoving() && Math.abs(r.getYaw() - 349.5) < 0.01, 'the window blurs: the turn ends at 349.5° (no snap)');
      ptr('pointermove', p.x + 90, p.y, 1);
      ptr('pointerup', p.x + 90, p.y, 1);
      t.ok(Math.abs(r.getYaw() - 349.5) < 0.01 && clicks() === 0, '...the rest of that press turns nothing and clicks nothing');
      // the rewards / level-up screens keep the board drawn behind them (scene 'combat'): no turning there
      const UI = DD.UI;
      if (UI && UI.screens && UI.screens.combat) {
        const prevCur = UI.current;
        r.setYaw(0, { keepFocus: false });
        r.stateOverride = null;
        UI.current = 'rewards';
        try {
          key('r'); key('q'); key('Home');
          t.eq(r.getYaw(), 0, 'on the rewards screen Q / R / Home leave the board behind it alone');
          const cam0 = JSON.stringify([r.camera.x, r.camera.y, r.camera.zoom]);
          ptr('pointerdown', p.x, p.y, 1); ptr('pointermove', p.x + 60, p.y, 1); ptr('pointerup', p.x + 60, p.y, 1);
          wheel(100, 0);
          t.eq(r.getYaw(), 0, '...so do a middle drag and a sideways wheel');
          t.eq(JSON.stringify([r.camera.x, r.camera.y, r.camera.zoom]), cam0, '...and the middle drag does not pan it either');
        } finally {
          UI.current = prevCur;
          r.stateOverride = st;
        }
        key('r');
        t.eq(r.getYaw(), 90, 'back on the battlefield R turns again');
        r.setYaw(0, { keepFocus: false });
      }
      // left and right drags still pan
      r.setYaw(0, { keepFocus: false });
      [0, 2].forEach(function (b) {
        const cx = r.camera.x;
        got.length = 0;
        ptr('pointerdown', p.x, p.y, b); ptr('pointermove', p.x + 60, p.y, b); ptr('pointerup', p.x + 60, p.y, b);
        t.ok(r.camera.x < cx - 1 && r.getYaw() === 0, (b ? 'right' : 'left') + ' drag still pans (and never turns)');
        t.eq(clicks(), 0, '...without a click');
      });
      // a sideways wheel (trackpad swipe, tilt wheel, Shift+wheel on Windows) turns; a vertical one zooms
      r.setYaw(0, { keepFocus: false });
      const z0 = r.camera.zoom;
      wheel(100, 0);
      t.near(r.getYaw(), 335, 0.01, 'a wheel with deltaX 100 turns the map -25 deg');
      t.ok(r.isViewMoving() && r.camera.zoom === z0, '...as a moving view, without zooming');
      wheel(40, 5);
      t.near(r.getYaw(), 325, 0.01, 'more sideways scrolling turns on');
      wheel(0, -240);
      t.ok(r.camera.zoom > z0 && Math.abs(r.getYaw() - 325) < 0.01, 'a vertical wheel still zooms');
      wheel(100, 0, { ctrlKey: true });
      t.near(r.getYaw(), 325, 0.01, 'Ctrl+wheel (a trackpad pinch) never turns');
      await new Promise(function (res) { setTimeout(res, 220); });
      t.ok(!r.isViewMoving(), 'the wheel turn ends 150 ms after the last event');
      t.near(r.getYaw(), 325, 0.01, '...where it was (no snap)');
      wheel(-14, 0);
      await new Promise(function (res) { setTimeout(res, 220); });
      t.near(r.getYaw(), 328.5, 0.01, 'a later swipe the other way turns back');
      // review: a browser that reports Shift+wheel as vertical (Chrome on Windows already turns it sideways) still turns
      const zs = r.camera.zoom;
      wheel(0, 40, { shiftKey: true });
      t.near(r.getYaw(), 318.5, 0.01, 'Shift+wheel reported with deltaY only turns the map (-10°)');
      t.eq(r.camera.zoom, zs, '...instead of zooming');
      wheel(0, -40, { shiftKey: true, ctrlKey: true });
      t.near(r.getYaw(), 318.5, 0.01, 'Ctrl+Shift+wheel never turns');
      await new Promise(function (res) { setTimeout(res, 220); });
      // Q / R animate (250 ms ease-in-out on the renderer clock) once the loop runs: here a stepped test clock
      r.zoomAt(1 / r.camera.zoom);
      r.setYaw(0, { keepFocus: false });
      // the drags above panned the board-area centre off this small board (a turn would then hold the board's nearest
      // point instead: its own suite); look at the board again
      r.centerOn(3.5, 3.5, { instant: true });
      r._rot.sim(true);
      const m = r.margins();
      const A = { x: m.left + (size.width - m.left - m.right) / 2, y: m.top + (size.height - m.top - m.bottom) / 2 };
      const hit = r.screenToTile(A.x, A.y), wp = r.screenToWorld(A.x, A.y);
      const gh = hit ? r.tileTop(hit.x, hit.y, true) : 0, g = Iso.fromWorld(wp.x, wp.y, gh);
      got.length = 0;
      key('q');
      t.eq(r._rot.yawTarget(), 270, 'Q targets 270');
      t.eq(r.getYaw(), 0, '...and starts from where the view is');
      step(100);
      const y100 = r.getYaw();
      t.ok(y100 > 270 && y100 < 360, 'after 100 ms it is on its way, counter-clockwise (' + y100.toFixed(1) + ')');
      const pg = r.worldToScreen(g.x, g.y, gh);
      t.ok(Math.abs(pg.x - A.x) < 0.5 && Math.abs(pg.y - A.y) < 0.5, 'the board-area centre stays put while it turns');
      key('q');
      t.eq(r._rot.anim() && r._rot.anim().to, -180, 'Q again mid-turn: on from the target to -180 (a double tap turns 180 deg)');
      t.near(r.getYaw(), y100, 1e-9, '...retargeting does not jump');
      step(16, 12);
      t.ok(r.isViewMoving(), 'still turning after 290 ms');
      step(16, 6);
      t.eq(r.getYaw(), 180, 'landed on 180 after 250 ms of the second turn');
      t.ok(!r._rot.anim(), '...the animation is over');
      step(16, 12);
      t.ok(!r.isViewMoving(), 'settled 150 ms after landing');
      const views2 = named('render:view'), moving2 = views2.filter(function (e) { return e.d.moving; });
      t.ok(moving2.every(function (e, i) { return !i || e.at - moving2[i - 1].at >= 64; }), 'render:view { moving: true } at most every 66 ms (' + moving2.map(function (e) { return e.at; }).join(' ') + ')');
      t.ok(views2.length > 2 && views2.filter(function (e) { return !e.d.moving; }).length === 1 && !views2[views2.length - 1].d.moving && views2[views2.length - 1].d.yaw === 180, 'exactly one moving: false, last, at 180');
      // a middle drag cancels a running turn and goes on from the animated yaw
      key('r');
      step(100);
      const y2 = r.getYaw();
      t.ok(y2 > 180 && y2 < 270 && !!r._rot.anim(), 'R from 180 is on its way (' + y2.toFixed(1) + ')');
      const p2 = r.worldToScreen(4, 4);
      ptr('pointerdown', p2.x, p2.y, 1);
      ptr('pointermove', p2.x + 50, p2.y, 1);
      t.ok(!r._rot.anim(), 'a middle drag cancels the running turn');
      t.near(r.getYaw(), y2 - 17.5, 1e-6, '...and turns on from the animated yaw');
      step(16, 20);
      t.near(r.getYaw(), y2 - 17.5, 1e-6, '...which no animation overrides');
      ptr('pointerup', p2.x + 50, p2.y, 1);
      // a release near a classic view eases onto it in 120 ms
      r.setYaw(0, { keepFocus: false });
      step(16, 12);
      drag(-6);
      t.ok(!!r._rot.anim() && Math.abs(r._rot.anim().dur - 0.12) < 1e-9, 'the release snap eases (120 ms)');
      step(16, 9);
      t.eq(r.getYaw(), 0, '...onto the classic view');
      // Home goes back the short way and fits the board
      r.setYaw(300, { keepFocus: false });
      step(16, 12);
      key('Home');
      t.eq(r._rot.anim() && r._rot.anim().to, 360, 'Home from 300 turns the short way (to 360)');
      step(16, 20);
      t.eq(r.getYaw(), 0, '...and lands on the classic view');
      // panning, zooming and centring on a unit while it turns work around the turn's pivot
      step(16, 12);
      const wp3 = r.screenToWorld(A.x, A.y), hit3 = r.screenToTile(A.x, A.y);
      const gh3 = hit3 ? r.tileTop(hit3.x, hit3.y, true) : 0, g3 = Iso.fromWorld(wp3.x, wp3.y, gh3);
      const at = function (dx, dy, msg) {
        const q = r.worldToScreen(g3.x, g3.y, gh3);
        t.ok(Math.abs(q.x - A.x - dx) < 0.5 && Math.abs(q.y - A.y - dy) < 0.5, msg + ' (' + (q.x - A.x).toFixed(2) + ',' + (q.y - A.y).toFixed(2) + ')');
      };
      key('r');
      step(16, 3);
      at(0, 0, 'mid-turn the pivot holds');
      r.panBy(30, 0);
      step(16);
      at(30, 0, 'WASD / drag panning mid-turn carries the pivot along');
      const zz = r.camera.zoom;
      r.zoomAt(1.25);
      step(16);
      t.ok(r.camera.zoom > zz, 'zooming mid-turn zooms');
      at(30, 0, '...around the pivot');
      r.centerOn(2, 2);
      step(16);
      const c2 = r.worldToScreen(2, 2);
      t.ok(Math.abs(c2.x - A.x) < 0.5 && Math.abs(c2.y - A.y - 16 * r.camera.zoom) < 0.5, 'centring on a unit mid-turn makes it the pivot');
      step(16, 6);
      const c3 = r.worldToScreen(2, 2);
      t.ok(Math.abs(c3.x - A.x) < 0.5 && Math.abs(c3.y - A.y - 16 * r.camera.zoom) < 0.5, '...it stays there while the turn goes on');
      t.ok(r.fitMap(), 'fitMap mid-turn is accepted (it fits once the turn lands)');
      step(16, 20);
      t.eq(r.getYaw(), 90, 'the turn lands');
      const corners = [[0, 0], [7, 0], [0, 7], [7, 7]].map(function (c) { return r.worldToScreen(c[0], c[1]); });
      t.ok(corners.every(function (s) { return s.x >= 0 && s.y >= 0 && s.x <= size.width && s.y <= size.height; }), '...then the deferred fitMap frames the whole board');
      r._rot.sim(false);
      key('r');
      t.eq(r.getYaw(), 180, 'without a running loop a turn is instant');
      t.eq(clicks(), 0, 'turning never clicked anything');
    } finally {
      offs.forEach(function (off) { off(); });
      I.detach();
      cv.remove();
      r._rot.sim(false);
      if (so) { if (hadSnap) so.rotSnap = oldSnap; else delete so.rotSnap; }
      r.setYaw(0, { keepFocus: false });
      r.stateOverride = null;
      r.setScene(prevScene);
      r.resetOverlay();
      Object.assign(r.camera, cam);
    }
    t.eq(DD.Iso.view().yaw, 0, 'the live view is back at yaw 0');
  }, { tags: ['render'] });

  T.suite('render: a two-finger twist turns the map on touch', function (t) {
    const r = R(), I = DD.Input;
    if (!I) { t.fail('DD.Input missing'); return; }
    const size = r.size();
    const cv = canvas(size.width, size.height);
    cv.style.cssText = 'position:fixed;left:0;top:0;width:' + size.width + 'px;height:' + size.height + 'px';
    document.body.appendChild(cv);
    const st = makeState(makeGrid(8, 8), [makeUnit('tw_h', 'hero', 2, 2)]);
    const prevScene = r.getScene(), cam = { x: r.camera.x, y: r.camera.y, zoom: r.camera.zoom };
    const got = [];
    const offs = ['input:tileClick', 'input:unitClick', 'input:rightClick'].map(function (n) { return DD.Events.on(n, function (d) { got.push(n); }); });
    const touch = function (type, id, x, y) {
      cv.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, button: 0, buttons: type === 'pointerup' ? 0 : 1, pointerId: id,
        pointerType: 'touch', isPrimary: id === 31, bubbles: true, cancelable: true }));
    };
    const cx = size.width / 2, cy = size.height / 2, rad = 120;
    // finger 31 stays put; finger 32 circles it from angle a0 to a1 (screen degrees, clockwise = y down) in small steps
    const twist = function (a0, a1, scale) {
      touch('pointerdown', 31, cx, cy);
      const at = function (a, k) { return [cx + Math.cos(a * Math.PI / 180) * rad * k, cy + Math.sin(a * Math.PI / 180) * rad * k]; };
      let p = at(a0, 1);
      touch('pointerdown', 32, p[0], p[1]);
      const n = 12;
      for (let i = 1; i <= n; i++) { p = at(a0 + (a1 - a0) * i / n, 1 + ((scale || 1) - 1) * i / n); touch('pointermove', 32, p[0], p[1]); }
      touch('pointerup', 32, p[0], p[1]);
      touch('pointerup', 31, cx, cy);
    };
    try {
      r.stateOverride = st;
      r.setScene('combat');
      r.setYaw(0, { keepFocus: false });
      r.fitMap({ instant: true });
      t.ok(I.init(cv), 'DD.Input.init');
      const z0 = r.camera.zoom;
      twist(0, 0, 1.5);
      t.eq(r.getYaw(), 0, 'a plain pinch only zooms');
      t.ok(r.camera.zoom > z0 * 1.2, '...in (zoom ' + z0.toFixed(2) + ' -> ' + r.camera.zoom.toFixed(2) + ')');
      twist(10, 16);
      t.eq(r.getYaw(), 0, 'a 6 deg wobble stays inside the dead zone');
      twist(0, 30);
      t.near(r.getYaw(), 30, 0.01, 'a 30 deg clockwise twist turns the board 30 deg with the fingers (the whole twist counts)');
      t.ok(!r.isViewMoving(), 'released: the view rests (no live loop)');
      twist(90, 32);
      t.near(r.getYaw(), 332, 0.01, 'a 58 deg counter-clockwise twist turns it back past 0');
      twist(0, 26);
      t.eq(r.getYaw(), 0, 'released 2 deg off the classic view: it snaps there');
      t.eq(got.length, 0, 'two fingers never click a tile, a unit or the right button');
    } finally {
      offs.forEach(function (off) { off(); });
      I.detach();
      cv.remove();
      r.setYaw(0, { keepFocus: false });
      r.stateOverride = null;
      r.setScene(prevScene);
      r.resetOverlay();
      Object.assign(r.camera, cam);
    }
    t.eq(DD.Iso.view().yaw, 0, 'the live view is back at yaw 0');
  }, { tags: ['render'] });

  // T13: the moving view's level of detail (half-res silhouettes, bake buckets / quarters, the bake budget)
  T.suite('render: a turning view draws cheaper, then settles to exact bakes under the frame budget', function (t) {
    const r = R(), Iso = DD.Iso;
    const ter = ['stone', 'grass', 'wood', 'gold', 'cobble', 'sand'];
    const grid = makeGrid(9, 9, function (tl) {
      tl.t = ter[(tl.x + tl.y * 2) % ter.length];
      if (tl.x === 4 && tl.y === 4) { tl.t = 'stone'; tl.h = 3; }   // a column in front of the hero at small yaws
    });
    const st = makeState(grid, [makeUnit('lod_h', 'hero', 3, 3)]);
    const cv = canvas(640, 400);
    const prevScene = r.getScene(), cam = { x: r.camera.x, y: r.camera.y, zoom: r.camera.zoom };
    let fake = 0;
    const camAt = Iso.withYaw(20, function () { const w = Iso.toWorld(4, 4, 0); return { x: w.x, y: w.y - 20, zoom: 1.4 }; });
    const frame = function () {
      r._rot.reset();
      return withState(st, function () { return r.renderTo(cv, { state: st, width: 640, height: 400, camera: camAt, live: true }); });
    };
    try {
      r.stateOverride = st;
      r.setScene('combat');
      r.setYaw(0, { keepFocus: false });
      r.invalidate();
      // every bake "costs" 0.3 ms (the harness clock is virtual): the 2.5 ms budget fits 9 a frame
      r._rot.clock(function () { return (fake += 0.3); });
      t.ok(r.beginRotate(), 'a rotate drag begins');
      r.rotateDrag(-20 / 0.35);
      t.near(r.getYaw(), 20, 1e-6, 'turned to 20 deg');
      let worst = 0, warped = 0;
      for (let i = 0; i < 4; i++) {
        const res = frame();
        t.ok(res && res.silScale === 0.5, 'moving frame ' + i + ': silhouettes at half resolution');
        if (!i) t.ok(res && res.silhouettes.some(function (s) { return s.id === 'lod_h'; }), '...the hero behind the column still gets one');
        worst = Math.max(worst, r._rot.stats.budgetMax);
        warped += r._rot.stats.warpDraws;
      }
      t.ok(worst <= 3.5, 'no moving frame paints more than the 2.5 ms bake budget + 1 ms (' + worst.toFixed(2) + ')');
      let baked = r._rot.baked();
      t.eq((baked.stone || []).join(','), '0', 'moving: flat styles draw the nearest quarter set (' + (baked.stone || []).join(',') + ')');
      t.ok(warped > 0, '...through the exact residual warp');
      t.ok((baked.grass || []).indexOf(22.5) >= 0 && (baked.grass || []).every(function (y) { return y % 7.5 === 0; }), 'moving: upright styles bake 7.5 deg buckets (' + (baked.grass || []).join(',') + ')');
      r.endRotate({ snap: false });
      t.ok(!r.isViewMoving(), 'released: the view rests at 20 deg');
      let frames = 0, done = false, res = null;
      worst = 0;
      while (!done && frames < 30) {
        res = frame();
        frames++;
        worst = Math.max(worst, r._rot.stats.budgetMax);
        done = r._rot.stats.fallbacks === 0;
        t.ok(res && res.silScale === 1, 'settled frame ' + frames + ': full-resolution silhouettes');
      }
      t.ok(done && frames <= 10, 'the exact bake set is complete within 10 frames of settling (' + frames + ')');
      t.log('settled: ' + frames + ' frames to the exact bake set, at most ' + worst.toFixed(2) + ' ms of budgeted bakes a frame');
      t.ok(worst <= 3.5, 'no settling frame paints more than the budget + 1 ms (' + worst.toFixed(2) + ')');
      baked = r._rot.baked();
      t.ok((baked.stone || []).indexOf(20) >= 0 && (baked.stone || []).indexOf(340) >= 0, 'settled: exact bakes at 20 deg and its mirror 340 (' + (baked.stone || []).join(',') + ')');
      const live = canvasHash(cv);
      withState(st, function () { r.renderTo(cv, { state: st, width: 640, height: 400, camera: camAt }); });
      t.eq(canvasHash(cv), live, 'a settled live frame is the full-detail picture');
      // the stepped clock: a turn animation is a moving view too, and the 150 ms after it
      r._rot.sim(true);
      r.turn(1);
      t.ok(r.isViewMoving() && frame().silScale === 0.5, 'an animating turn draws the moving level of detail');
      r._rot.step(300);
      t.ok(r.getYaw() === 90 && r.isViewMoving(), 'landed on 90, still moving for 150 ms');
      r._rot.step(200);
      t.ok(!r.isViewMoving() && frame().silScale === 1, '...then settled: full detail again');
    } finally {
      r._rot.sim(false);
      r._rot.clock(null);
      if (r.isViewMoving()) r.endRotate({ snap: false });
      r.setYaw(0, { keepFocus: false });
      r.stateOverride = null;
      r.setScene(prevScene);
      Object.assign(r.camera, cam);
      r.invalidate();
    }
  }, { tags: ['render'] });

  T.suite('render: a Q / R turn bakes the view it lands on ahead (prefetch)', function (t) {
    const r = R(), Iso = DD.Iso;
    const ter = ['stone', 'grass', 'wood', 'gold', 'cobble', 'sand'];
    const grid = makeGrid(9, 9, function (tl) {
      tl.t = ter[(tl.x * 3 + tl.y) % ter.length];
      if (tl.x === 4 && tl.y === 4) { tl.t = 'stone'; tl.h = 3; }
    });
    const st = makeState(grid, [makeUnit('pf_h', 'hero', 2, 6)]);
    const cv = canvas(640, 400);
    const prevScene = r.getScene(), cam = { x: r.camera.x, y: r.camera.y, zoom: r.camera.zoom };
    let fake = 0;
    const camAt = { x: 0, y: 130, zoom: 1.2 };
    const frame = function () {
      return withState(st, function () { return r.renderTo(cv, { state: st, width: 640, height: 400, camera: camAt, live: true }); });
    };
    try {
      r.stateOverride = st;
      r.setScene('combat');
      r.setYaw(0, { keepFocus: false });
      r.invalidate();
      r._rot.clock(function () { return (fake += 0.05); });
      r._rot.sim(true);
      frame();
      r._rot.reset();
      r.turn(1);
      t.ok(!!r._rot.anim(), 'R starts an animated turn toward 90');
      let frames = 0, worst = 0, ahead = 0, landing = -1;
      while (r._rot.anim() && frames < 60) {
        r._rot.step(16);
        r._rot.reset();
        frame();
        worst = Math.max(worst, r._rot.stats.budgetMax);
        ahead += r._rot.stats.prefetched;
        landing = r._rot.stats.texBakes + r._rot.stats.faceBakes;
        frames++;
      }
      t.ok(r.getYaw() === 90, 'landed on 90 after ' + frames + ' frames');
      t.ok(ahead > 0, 'the frames of the turn baked the landing view ahead (' + ahead + ' bakes)');
      t.ok(worst <= 3.5, 'within the per-frame bake budget (' + worst.toFixed(2) + ' ms)');
      t.eq(landing, 0, 'the landing frame at 90 has nothing left to bake');
      const baked = r._rot.baked();
      t.ok((baked.stone || []).indexOf(90) >= 0, 'the 90 deg textures were baked during the turn (' + (baked.stone || []).join(',') + ')');
      // a settled view never prefetches
      r._rot.step(400);
      r._rot.reset();
      frame();
      t.eq(r._rot.stats.prefetched, 0, 'no prefetching once the view rests');
    } finally {
      r._rot.sim(false);
      r._rot.clock(null);
      r.setYaw(0, { keepFocus: false });
      r.stateOverride = null;
      r.setScene(prevScene);
      Object.assign(r.camera, cam);
      r.invalidate();
    }
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
      // the turned views too (any "Error in render" warning fails the suite)
      [30, 90].forEach(function (yaw) {
        const rr = t.tryRun('renderTo ' + theme + ' @' + yaw, function () { return withState(st, function () { return r.renderTo(cv, { state: st, width: 480, height: 300, yaw: yaw }); }); });
        if (!rr || rr.objects < 20) t.fail(theme + ' @' + yaw + ': objects missing (' + (rr && rr.objects) + ')');
      });
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

  // [h19 gus-hpbar-covers-face] a medium foe one tile in front of a short hero drew its HP bar across his face (Phat Gus's
  // cheeks in melee): the selected (or acting) unit's head is an obstacle the front widget rises over, whatever its size
  T.suite('render: h19 gus-hpbar-covers-face — a front unit\'s HP widget rises over the selected or acting unit\'s head', function (t) {
    const r = R(), S = DD.Sprites;
    if (!S || typeof S.metrics !== 'function') { t.skip('no DD.Sprites.metrics'); return; }
    const height = function (id) { try { return S.metrics(id).height || 0; } catch (e) { return 0; } };
    const heroes = Object.keys(DD.defs.heroes).filter(function (id) { return height(id) > 0; }).sort(function (a, b) { return height(a) - height(b); });
    const foes = Object.keys(DD.defs.enemies).filter(function (id) { const d = DD.getEnemy(id); return d && d.tier !== 'boss' && height(id) > 0; });
    if (!heroes.length || !foes.length) { t.skip('needs a hero and an enemy'); return; }
    const W = 640, H = 420, cam = { x: 0, y: 0, zoom: 1.5 };
    const over = function (a, b) { return !!a && !!b && a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0; };
    // a real crossing: at least a quarter of the head box under the bar (the renderer acts from 15%)
    const crosses = function (a, b) {
      if (!over(a, b)) return false;
      const ix = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), iy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
      return ix * iy >= 0.25 * (b.x1 - b.x0) * (b.y1 - b.y0);
    };
    let hid = null;
    const shoot = function (st, ov) {
      r.resetOverlay();
      Object.assign(r.overlay, ov || {});
      return withState(st, function () { return r.renderTo(canvas(W, H), { state: st, width: W, height: H, camera: cam }); });
    };
    const box = function (res, id) { return ((res && res.widgets) || []).filter(function (b) { return b.id === id; })[0]; };
    let found = null;
    try {
      // a foe one tile in front of a short hero (x + y larger: in front at yaw 0) whose bar crosses his head
      for (let i = 0; i < foes.length * 4 && i < 120 && !found; i++) {
        hid = heroes[i % Math.min(4, heroes.length)];
        const fid = foes[Math.floor(i / Math.min(4, heroes.length)) % foes.length];
        const hero = makeUnit('gh_h', 'hero', 3, 4, { defId: hid }), foe = makeUnit('gh_e', 'enemy', 4, 4, { defId: fid });
        const st = makeState(makeGrid(8, 8), [hero, foe]);
        cam.x = DD.Iso.toWorld(3.5, 4, 0).x; cam.y = DD.Iso.toWorld(3.5, 4, 0).y - 30;
        const sel = shoot(st, { selectedId: 'gh_h' }), base = shoot(st, null);
        const head = (sel.heads || []).filter(function (h) { return h.id === 'gh_h'; })[0];
        if (head && crosses(box(base, 'gh_e'), head)) found = { st: st, foe: fid, head: head, base: box(base, 'gh_e'), sel: box(sel, 'gh_e') };
      }
      if (!found) { t.skip('no enemy\'s bar crosses a short hero\'s head here'); return; }
      t.log(hid + ' (' + height(hid) + ' px) behind ' + found.foe + ' (' + height(found.foe) + ' px): head ' + JSON.stringify(found.head) + ', bar ' + JSON.stringify(found.base));
      t.ok(crosses(found.base, found.head), 'premise: unselected, ' + found.foe + '\'s bar crosses ' + hid + '\'s head ' + JSON.stringify(found.base) + ' / ' + JSON.stringify(found.head));
      t.ok(found.sel && found.sel.dy < found.base.dy && !over(found.sel, found.head), 'selected: the bar rises clear of his head ' + JSON.stringify(found.sel));
      const turn = box(shoot(found.st, { turnUnitId: 'gh_h' }), 'gh_e');
      t.ok(turn && !over(turn, found.head), 'his turn (not selected): clear of his head too');
      const foeSel = shoot(found.st, { selectedId: 'gh_e' });
      t.eq(box(foeSel, 'gh_e').dy, found.base.dy, 'the front unit selected instead: its own bar stays put');
      t.ok(!(foeSel.heads || []).some(function (h) { return h.id === 'gh_h'; }), 'and only the focus units have a head box');
    } finally { r.resetOverlay(); }
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
    // the whole table at the fire: every unlocked hero, up to the renderer's seats (every real hero is unlocked since
    // v2). V3: counts from the registry, never a literal: N = the registered real heroes, seats = TITLE_SLOTS.length
    // when the renderer exposes it (DD.Render.TITLE_SLOTS), so "all N sit" reads min(N, seats)
    const ids = Object.keys(DD.defs.heroes);
    const open = ids.filter(function (id) { return !DD.Meta || typeof DD.Meta.isUnlocked !== 'function' || DD.Meta.isUnlocked(id); });
    const pool = open.length ? open : ids;
    const seats = Array.isArray(r.TITLE_SLOTS) ? r.TITLE_SLOTS.length : null;
    if (seats !== null) t.eq(res && res.units, Math.min(seats, pool.length), 'title heroes (' + (res && res.units) + ' of ' + seats + ' seats)');
    else t.ok(res && res.units >= 1 && res.units <= pool.length, 'title heroes (' + (res && res.units) + ')');
    const real = ids.filter(function (id) { return id.indexOf('test_') !== 0; });
    if (DD.UI && DD.UI.HERO_ORDER && real.every(function (id) { return open.indexOf(id) >= 0; })) {
      // real heroes sit first (UI.HERO_ORDER, then any registered hero it does not list yet); test heroes take what is left
      const want = seats !== null ? Math.min(real.length, seats) : real.length;
      t.ok(res && res.units >= want, 'all ' + want + ' real heroes sit at the campfire (' + (res && res.units) + ' seated)');
    }
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
    // the same scene turned to 30 deg (warm its bakes first); the harness clock is virtual, so the ratio is only
    // checked when the yaw-0 time is measurable at all
    withState(st, function () { r.renderTo(cv, { state: st, width: 1280, height: 720, yaw: 30 }); });
    const t1 = performance.now();
    withState(st, function () { for (let i = 0; i < n; i++) r.renderTo(cv, { state: st, width: 1280, height: 720, dt: 16, yaw: 30 }); });
    const ms30 = (performance.now() - t1) / n;
    t.log('avg frame at yaw 30 ' + ms30.toFixed(2) + ' ms');
    if (ms > 1) t.ok(ms30 <= ms * 1.35 + 0.5, 'a turned view costs at most ~1.35x the classic one (' + ms30.toFixed(1) + ' vs ' + ms.toFixed(1) + ' ms)');
    else t.ok(ms30 < 60, 'turned frames render too');
  }, { tags: ['render', 'perf'] });

  // ---- render / HUD polish (wf10): the fit vs the HUD's panels, status flight, threat shading, kept silhouettes,
  // the 💥 marker in the badge layout ----------------------------------------------------------------------------
  /** Screen points the fit keeps clear: tile-top centres and unit heads (feet - sprite height), at the live camera. */
  function fitProbe(r, st) {
    const out = { tiles: [], heads: [] };
    st.grid.tiles.forEach(function (tl) { out.tiles.push(r.worldToScreen(tl.x, tl.y, r.tileTop(tl.x, tl.y))); });
    st.units.forEach(function (u) {
      if (u.dead) return;
      const p = r.worldToScreen(u.x, u.y), m = DD.Sprites.metrics(u);
      out.heads.push({ x: p.x, y: p.y - m.height * r.camera.zoom, id: u.id });
    });
    return out;
  }
  function inBox(p, b) { return p.x > b.x0 && p.x < b.x1 && p.y > b.y0 && p.y < b.y1; }

  T.suite('render: the fit keeps the board out of the HUD\'s panels at every yaw (hudMargins avoid)', function (t) {
    const r = R(), size = r.size(), W = size.width, H = size.height;
    // a wide board with units on its far corners: the diagonal views fill the board area's corners
    const st = makeState(makeGrid(12, 8), [makeUnit('fa_h', 'hero', 1, 6), makeUnit('fa_e', 'enemy', 0, 0), makeUnit('fa_e2', 'enemy', 11, 0), makeUnit('fa_e3', 'enemy', 11, 7)]);
    const saved = r.hudMargins, prevScene = r.getScene();
    let hiddenPlain = 0, changed = 0;
    try {
      r.stateOverride = st;
      r.setScene('combat');
      r.hudMargins = null;
      const m = r.margins();
      // a "combat log" in the board area's top-right corner, a soft "objective" across the top middle
      const log = { x0: W - m.right - Math.min(270, W * 0.22), y0: m.top, x1: W - m.right, y1: m.top + Math.min(160, H * 0.22) };
      const obj = { x0: W * 0.36, y0: m.top, x1: W * 0.64, y1: m.top + 44, soft: true };
      // review (balance run): a head counts with its HP pill (the pill's ends, at the widgets' clamped zoom), as the fit does
      const pillIn = function (q, b) {
        const z = r.camera.zoom, zc = Math.max(0.65, Math.min(1.5, z)), u = st.units.filter(function (x) { return x.id === q.id; })[0];
        const y = q.y - 16 * z, ex = 30 * zc + 9;
        return q.x > b.x0 - ex && q.x < b.x1 + ex && y > b.y0 && y < b.y1 || (u && inBox(q, b));
      };
      const count = function () {
        const p = fitProbe(r, st);
        return p.tiles.filter(function (q) { return inBox(q, log); }).length +
          p.heads.filter(function (q) { return pillIn(q, log) || pillIn(q, obj); }).length;
      };
      [0, 30, 45, 90, 135, 200, 225, 315].forEach(function (y) {
        r.setYaw(y, { keepFocus: false });
        r.hudMargins = null;
        r.fitMap({ instant: true });
        const plain = { x: r.camera.x, y: r.camera.y, zoom: r.camera.zoom };
        const before = count();
        r.hudMargins = function () { return { avoid: [log, obj] }; };
        r.fitMap({ instant: true });
        const after = count();
        const same = r.camera.x === plain.x && r.camera.y === plain.y && r.camera.zoom === plain.zoom;
        if (before) hiddenPlain++;
        if (!same) changed++;
        t.eq(after, 0, 'yaw ' + y + ': no tile centre under the log and no unit head under the log or the objective (plain fit: ' + before + ')');
        if (!before) t.ok(same, 'yaw ' + y + ': nothing was under a panel, so the plain fit stands exactly');
        t.ok(r.camera.zoom <= plain.zoom + 1e-9 && r.camera.zoom >= plain.zoom * 0.69, 'yaw ' + y + ': never larger, at most 30% smaller (' + (r.camera.zoom / plain.zoom).toFixed(2) + ')');
        // the whole board stays inside the HUD margins
        const p = fitProbe(r, st);
        t.ok(p.tiles.every(function (q) { return q.x > m.left - 1 && q.x < W - m.right + 1 && q.y > m.top - 1 && q.y < H - m.bottom + 1; }), 'yaw ' + y + ': every tile still inside the board area');
      });
      t.ok(hiddenPlain > 0 && changed > 0, 'the plain fit hid something at some views (' + hiddenPlain + ') and those were refitted (' + changed + ')');
      // tiles may tuck under a soft panel; units may not
      r.setYaw(0, { keepFocus: false });
      r.hudMargins = null; r.fitMap({ instant: true });
      const plain0 = { x: r.camera.x, y: r.camera.y, zoom: r.camera.zoom };
      const tilesOnly = { x0: m.left, y0: m.top, x1: W - m.right, y1: H - m.bottom, soft: true };
      const emptyState = makeState(makeGrid(12, 8), []);
      r.stateOverride = emptyState;
      r.hudMargins = null; r.fitMap({ instant: true });
      const plainEmpty = { x: r.camera.x, y: r.camera.y, zoom: r.camera.zoom };
      r.hudMargins = function () { return { avoid: [tilesOnly] }; };
      r.fitMap({ instant: true });
      t.ok(r.camera.zoom === plainEmpty.zoom && r.camera.x === plainEmpty.x, 'a soft panel over bare tiles changes nothing');
      r.stateOverride = st;
      // boxes outside the board area and garbage boxes change nothing
      r.hudMargins = function () { return { avoid: [{ x0: 0, y0: 0, x1: 4, y1: 4 }, null, { x0: 'a', y0: 1, x1: 2, y1: 3 }, { x0: 10, y0: 10, x1: 10, y1: 400 }, 7] }; };
      r.fitMap({ instant: true });
      t.ok(r.camera.zoom === plain0.zoom && r.camera.x === plain0.x && r.camera.y === plain0.y, 'panels off the board area and garbage boxes leave the plain fit');
      // a panel nothing can clear (the whole board area, hard) leaves the plain fit rather than a tiny board
      r.hudMargins = function () { return { avoid: [{ x0: m.left, y0: m.top, x1: W - m.right, y1: H - m.bottom }] }; };
      r.fitMap({ instant: true });
      t.ok(r.camera.zoom === plain0.zoom, 'an unclearable panel keeps the plain fit');
      // renderTo without a camera fits the same way
      r.hudMargins = function () { return { avoid: [log, obj] }; };
      r.setYaw(45, { keepFocus: false });
      r.fitMap({ instant: true });
      const live = { x: r.camera.x, y: r.camera.y, zoom: r.camera.zoom };
      const cv = canvas(W, H);
      t.ok(!!withState(st, function () { return r.renderTo(cv, { state: st, width: W, height: H }); }), 'renderTo fits with the panels too');
      t.ok(live.zoom > 0, 'fit at 45 deg (zoom ' + live.zoom.toFixed(3) + ')');
    } finally {
      r.hudMargins = saved;
      r.setYaw(0, { keepFocus: false });
      r.setScene(prevScene);
      r.stateOverride = null;
    }
  }, { tags: ['render'] });

  // Review (balance run): the board re-framed itself 7 times in one 8-round fight (zoom 0.73 → 0.66 → 0.73, one 291 px
  // jump) because every panel change (a party card's status line, a portrait leaving the tracker, the next hero's skill
  // bar) refitted with the units where they stood. And the fit only kept the HP pill's centre clear, so a pill's end
  // still faded the objective at the classic view.
  T.suite('render: a panel change mid-fight refits only to clear a panel, never back and forth; HP pills clear whole', function (t) {
    const r = R(), size = r.size(), W = size.width, H = size.height, rot = r._rot;
    if (!rot || typeof rot.watchMargins !== 'function') { t.skip('no watchMargins hook'); return; }
    const st = makeState(makeGrid(10, 8), [makeUnit('wm_h', 'hero', 2, 6), makeUnit('wm_e', 'enemy', 7, 1)]);
    const saved = r.hudMargins, prevScene = r.getScene();
    let boxes = [];
    try {
      r.stateOverride = st;
      r.setScene('combat');
      r.setYaw(0, { keepFocus: false });
      r.hudMargins = function () { return { avoid: boxes }; };
      rot.watchMargins();
      r.fitMap({ instant: true });
      const fit0 = rot.camTarget();
      const tileBox = function (x, y) {
        const p = r.worldToScreen(x, y, r.tileTop(x, y));
        return { x0: p.x - 30, y0: p.y - 20, x1: p.x + 30, y1: p.y + 20 };
      };
      const same = function (a, b) { return Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6 && Math.abs(a.zoom - b.zoom) < 1e-9; };
      // a panel that grows over empty screen (no tile, no unit under it): the framing holds
      boxes = [{ x0: 0, y0: 0, x1: 40, y1: 40 }];
      rot.watchMargins();
      t.ok(same(rot.camTarget(), fit0), 'a panel change with nothing under it keeps the framing');
      // a panel that now covers board tiles: the fit moves to clear it
      boxes = [tileBox(0, 0)];
      rot.watchMargins();
      const fit1 = rot.camTarget();
      t.ok(!same(fit1, fit0), 'a panel that now covers board tiles refits');
      // the panel shrinks again: no zooming back in mid-fight (that was the back and forth)
      boxes = [{ x0: 0, y0: 0, x1: 40, y1: 40 }];
      rot.watchMargins();
      t.ok(same(rot.camTarget(), fit1), 'a panel that shrinks away does not re-frame the board');
      // under way (no deployment), a soft panel over a unit is not a reason to move: it fades for units
      r.fitMap({ instant: true });
      const fit2 = rot.camTarget();
      const ep = r.worldToScreen(7, 1);
      boxes = [{ x0: ep.x - 25, y0: ep.y - 140, x1: ep.x + 25, y1: ep.y - 20, soft: true }];
      rot.watchMargins();
      t.ok(same(rot.camTarget(), fit2), 'mid-fight a unit under the soft objective keeps the framing');
      // while deploying, a unit under a panel still refits (nobody has moved yet)
      st.deploy = { active: true };
      boxes = [{ x0: ep.x - 60, y0: ep.y - 170, x1: ep.x + 60, y1: ep.y - 20, soft: true }];
      rot.watchMargins();
      t.ok(!same(rot.camTarget(), fit2), 'during deployment a unit under the objective refits');
      st.deploy = null;
      // the HP pill's end counts: a panel ending just left of the pill's centre still has to clear the pill
      boxes = [];
      r.hudMargins = null;
      r.fitMap({ instant: true });
      const plain = rot.camTarget();
      const z = plain.zoom, zc = Math.max(0.65, Math.min(1.5, z)), m = DD.Sprites.metrics(st.units[1]);
      const head = { x: ep.x, y: ep.y - (m.height + 16) * z };
      // a soft panel (units only) whose right edge sits 12 px left of the pill's centre, around the pill's height: centre clear, end not
      const edge = { x0: head.x - 200, y0: head.y - 10, x1: head.x - 12, y1: head.y + 6, soft: true };
      t.ok(30 * zc + 9 > 12 + 4, '(the pill reaches past the panel edge: half-width ' + Math.round(30 * zc + 9) + ' px)');
      r.hudMargins = function () { return { avoid: [edge] }; };
      r.fitMap({ instant: true });
      const after = rot.camTarget();
      t.ok(!same(after, plain), 'the fit moves the board so the pill clears the panel, not just its centre');
      const hp = r.worldToScreen(7, 1), hz = r.camera.zoom, hzc = Math.max(0.65, Math.min(1.5, hz));
      const hy = hp.y - (m.height + 16) * hz;
      const pillHit = hp.x - (30 * hzc + 9) < edge.x1 && hp.x + (30 * hzc + 9) > edge.x0 && hy > edge.y0 && hy < edge.y1;
      t.ok(!pillHit, 'after the fit the whole pill is clear of the panel');
    } finally {
      r.hudMargins = saved;
      r.setYaw(0, { keepFocus: false });
      r.setScene(prevScene);
      r.stateOverride = null;
    }
  }, { tags: ['render'] });

  T.suite('render: a status that grants flight hovers the sprite like a natural flyer', function (t) {
    const r = R(), S = DD.Sprites;
    const sid = 'test_render_levitating';
    DD.defs.statuses[sid] = { id: sid, name: 'Levitating', __kind: 'statuses', icon: '🪶', type: 'buff', flying: true };
    try {
      const heroId = Object.keys(DD.defs.heroes).filter(function (id) { const d = DD.defs.heroes[id]; return !(d.flags && d.flags.flying); })[0];
      t.ok(!!heroId, 'a grounded hero def to test with (' + heroId + ')');
      const u = makeUnit('lev_h', 'hero', 2, 2, { defId: heroId });
      t.eq(S.metrics(u).hover, 0, 'grounded: no hover');
      u.statuses = [{ id: sid, turns: 2 }];
      t.ok(DD.Grid.isFlying(u), 'the engine says the status makes it fly');
      t.ok(S.metrics(u).hover > 0, 'with the status: it hovers like a flyer (' + S.metrics(u).hover + ' px)');
      // drawn higher: the topmost painted row of the sprite moves up
      const top = function () {
        const cv = canvas(200, 200), k = cv.getContext('2d');
        S.drawUnit(k, u, 100, 160, 2, 0.6);
        const d = k.getImageData(0, 0, 200, 200).data;
        for (let y = 0; y < 200; y++) for (let x = 0; x < 200; x++) if (d[(y * 200 + x) * 4 + 3] > 40) return y;
        return 200;
      };
      const flyTop = top();
      u.statuses = [];
      const groundTop = top();
      t.ok(flyTop < groundTop - 4, 'the flying sprite is drawn higher (top row ' + flyTop + ' vs ' + groundTop + ')');
      // the renderer shrinks its shadow like a flyer's
      u.statuses = [{ id: sid, turns: 2 }];
      const st = makeState(makeGrid(5, 5), [u]);
      const res = withState(st, function () { return r.renderTo(canvas(320, 240), { state: st, width: 320, height: 240 }); });
      t.ok(res && res.units === 1, 'renders');
      // a status whose flying is a function that throws is contained
      DD.defs.statuses[sid].flying = function () { throw new Error('levitation exploded'); };
      const p0 = DD.problems.length;
      t.ok(S.metrics(u).hover === 0 || S.metrics(u).hover > 0, 'a throwing flight check does not break metrics');
      for (let i = DD.problems.length - 1; i >= p0; i--) if (/levitation exploded/.test(DD.problems[i])) DD.problems.splice(i, 1);
    } finally {
      delete DD.defs.statuses[sid];
    }
  }, { tags: ['render'] });

  T.suite('render: threat shading reads on warm floors (wood, carpet, gold) at any view', function (t) {
    const r = R();
    ['wood', 'carpet', 'gold', 'stone'].forEach(function (ter) {
      const grid = makeGrid(6, 6, function (tl) { tl.t = ter; });
      const st = makeState(grid, [], { theme: 'hoard' });
      const threat = { tiles: [], ref: 20 };
      grid.tiles.forEach(function (tl) { if (tl.x < 3) threat.tiles.push({ x: tl.x, y: tl.y, dmg: 8, lethal: false }); });
      [0, 45].forEach(function (yaw) {
        const W = 480, H = 320;
        const cam = DD.Iso.withYaw(yaw, function () { const w = DD.Iso.toWorld(2.5, 2.5, 0); return { x: w.x, y: w.y, zoom: 1.6 }; });
        const shot = function (ov) {
          r.resetOverlay();
          Object.assign(r.overlay, ov || {});
          const cv = canvas(W, H);
          withState(st, function () { r.renderTo(cv, { state: st, width: W, height: H, camera: cam, yaw: yaw }); });
          return cv.getContext('2d').getImageData(0, 0, W, H).data;
        };
        const off = shot(null), on = shot({ threat: threat });
        r.resetOverlay();
        // mean colour change inside a threatened tile vs inside a safe one (screen boxes around the tile centres)
        const diff = function (tx, ty) {
          const p = DD.Iso.withYaw(yaw, function () { const w = DD.Iso.toWorld(tx, ty, 0); return { x: (w.x - cam.x) * cam.zoom + W / 2, y: (w.y - cam.y) * cam.zoom + H / 2 }; });
          let s = 0, n = 0;
          for (let y = Math.round(p.y - 6); y <= Math.round(p.y + 6); y++) {
            for (let x = Math.round(p.x - 14); x <= Math.round(p.x + 14); x++) {
              const i = (y * W + x) * 4;
              s += Math.abs(on[i] - off[i]) + Math.abs(on[i + 1] - off[i + 1]) + Math.abs(on[i + 2] - off[i + 2]);
              n++;
            }
          }
          return s / n / 3;
        };
        const hit = diff(1, 2), safe = diff(4, 2);
        t.ok(hit >= 18, ter + ' @' + yaw + ': a threatened tile clearly changes (' + hit.toFixed(1) + ' per channel; the old orange wash alone moved wood ~12)');
        t.ok(safe < 3, ter + ' @' + yaw + ': a safe tile stays as it was (' + safe.toFixed(1) + ')');
      });
    });
  }, { tags: ['render'] });

  T.suite('render: live frames keep a resting unit\'s silhouette, repaint it when it changes, and turning views reuse its body', function (t) {
    const r = R();
    const grid = makeGrid(9, 9, function (tl) { if (tl.x === 4 && tl.y === 4) tl.h = 3; });   // a column in front of the hero
    const hero = makeUnit('kept_h', 'hero', 3, 3);
    const st = makeState(grid, [hero]);
    const W = 640, H = 400;
    const cam = (function () { const w = DD.Iso.toWorld(4, 4, 0); return { x: w.x, y: w.y - 20, zoom: 1.4 }; })();
    const cv = canvas(W, H);
    const live = function () { r._rot.reset(); return withState(st, function () { return r.renderTo(cv, { state: st, width: W, height: H, camera: cam, live: true }); }); };
    const prevScene = r.getScene();
    try {
      r.stateOverride = st;
      r.setScene('combat');
      r.setYaw(0, { keepFocus: false });
      r.invalidate();
      let res = live();
      t.ok(res && res.silhouettes.some(function (s) { return s.id === 'kept_h'; }), 'the hero behind the column has a silhouette');
      t.eq(r._rot.stats.silPaints, 1, 'first live frame: painted');
      const h1 = canvasHash(cv);
      res = live();
      t.eq(r._rot.stats.silPaints, 0, 'second live frame, nothing changed: not painted again');
      t.eq(r._rot.stats.silKept, 1, '...the kept one is drawn');
      t.eq(canvasHash(cv), h1, '...and the frame is the same picture');
      withState(st, function () { r.renderTo(cv, { state: st, width: W, height: H, camera: cam }); });
      t.eq(canvasHash(cv), h1, 'the kept frame equals the exact full-detail render (same clock)');
      t.ok(r._rot.caches().silKept >= 1, 'one kept silhouette in the cache');
      // anything that shapes it repaints it: a step, a camera move, a status, an FX pose
      hero.vis.x = 3.2;
      live();
      t.eq(r._rot.stats.silPaints, 1, 'the unit moved: repainted');
      hero.vis.x = 3;
      live();
      const cam2 = { x: cam.x + 3, y: cam.y, zoom: cam.zoom };
      r._rot.reset();
      withState(st, function () { r.renderTo(cv, { state: st, width: W, height: H, camera: cam2, live: true }); });
      t.eq(r._rot.stats.silPaints, 1, 'the camera moved: repainted');
      live();
      hero.statuses = [{ id: Object.keys(DD.defs.statuses)[0], turns: 2 }];
      live();
      t.eq(r._rot.stats.silPaints, 1, 'a status came: repainted');
      hero.statuses = [];
      live();
      hero.vis._fxAt = performance.now(); hero.vis.pose = 'attack';
      live(); const a1 = r._rot.stats.silPaints;
      live(); const a2 = r._rot.stats.silPaints;
      t.ok(a1 === 1 && a2 === 1, 'a unit in an FX pose is painted fresh every frame (' + a1 + ', ' + a2 + ')');
      delete hero.vis._fxAt; delete hero.vis.pose;
      live();
      // the idle motion: a kept silhouette is repainted once it is older than its time-to-live (stepped clock)
      r._rot.sim(true);
      live();
      r._rot.step(600);
      live();
      t.eq(r._rot.stats.silPaints, 1, 'after 0.6 s of idle motion it is repainted');
      live();
      t.eq(r._rot.stats.silPaints, 0, '...and kept again');
      r._rot.sim(false);
      // a turning view: the body is painted once and reused while the board spins
      t.ok(r.beginRotate(), 'a rotate drag begins');
      r.rotateDrag(-10 / 0.35);
      res = live();
      t.ok(res.silScale === 0.5 && res.silhouettes.some(function (s) { return s.id === 'kept_h'; }), 'turning: a half-resolution silhouette');
      const firstBody = r._rot.stats.bodyPaints;
      let reused = 0;
      for (let i = 0; i < 4; i++) {
        r.rotateDrag(-2 / 0.35);
        res = live();
        if (res.silhouettes.some(function (s) { return s.id === 'kept_h'; }) && r._rot.stats.bodyPaints === 0 && r._rot.stats.silPaints === 0) reused++;
      }
      t.ok(firstBody <= 1 && reused >= 3, 'its body is painted once and reused while the view turns (' + firstBody + ', ' + reused + ' of 4)');
      r.endRotate({ snap: false });
      // renderTo (full detail) never uses the kept ones
      r._rot.reset();
      withState(st, function () { r.renderTo(cv, { state: st, width: W, height: H, camera: cam }); });
      withState(st, function () { r.renderTo(cv, { state: st, width: W, height: H, camera: cam }); });
      t.eq(r._rot.stats.silKept, 0, 'offscreen full-detail renders always paint exactly');
      r.invalidate();
      t.eq(r._rot.caches().silKept + r._rot.caches().bodies, 0, 'invalidate() forgets them');
    } finally {
      r._rot.sim(false);
      r.setYaw(0, { keepFocus: false });
      r.setScene(prevScene);
      r.stateOverride = null;
    }
  }, { tags: ['render'] });

  T.suite('render: the 💥 marker joins the badge layout (never on a neighbour\'s HP pill)', function (t) {
    const r = R();
    const grid = makeGrid(7, 7, function (tl) { if (tl.x === 3 && tl.y === 3) tl.obj = { id: 'barrel_explosive', hp: 3, maxHp: 3, data: {} }; });
    // units right behind the barrel: their HP widgets sit where the marker wants to be
    const units = [makeUnit('bm_a', 'enemy', 2, 2), makeUnit('bm_b', 'enemy', 3, 2), makeUnit('bm_c', 'enemy', 2, 3), makeUnit('bm_h', 'hero', 5, 5)];
    const st = makeState(grid, units);
    const W = 640, H = 400;
    [0, 30, 200].forEach(function (yaw) {
      const cam = DD.Iso.withYaw(yaw, function () { const w = DD.Iso.toWorld(3, 3, 0); return { x: w.x, y: w.y - 30, zoom: 1.6 }; });
      r.resetOverlay();
      r.overlay.objTargets = [{ x: 3, y: 3 }];
      const res = withState(st, function () { return r.renderTo(canvas(W, H), { state: st, width: W, height: H, camera: cam, yaw: yaw }); });
      const b = res && res.booms && res.booms[0];
      t.ok(!!b && b.x === 3 && b.y === 3, 'yaw ' + yaw + ': one marker, on the barrel');
      const hits = (res.widgets || []).filter(function (w) { return b && w.x1 > b.x0 + 1 && w.x0 < b.x1 - 1 && w.y1 > b.y0 + 1 && w.y0 < b.y1 - 1; });
      t.eq(hits.length, 0, 'yaw ' + yaw + ': the marker overlaps no HP widget (' + (hits.map(function (w) { return w.id; }).join(', ') || 'none') + ')');
      // without the overlay field: no marker
      r.resetOverlay();
      const res2 = withState(st, function () { return r.renderTo(canvas(W, H), { state: st, width: W, height: H, camera: cam, yaw: yaw }); });
      t.eq((res2.booms || []).length, 0, 'yaw ' + yaw + ': no marker without objTargets');
    });
    r.resetOverlay();
  }, { tags: ['render'] });

  // ---- rules run: moving through allies (pass tiles, ⇄ swaps, faded allies) and breaking objects (🔨, HP preview) ------
  T.suite('render: rules run — pass tiles, ⇄ rings and swap arrows, faded allies, 🔨 markers and the HP preview follow the rotation', function (t) {
    const r = R();
    const grid = makeGrid(8, 8, function (tl) { if (tl.x === 5 && tl.y === 2) tl.obj = { id: 'crate', hp: 6, maxHp: 6, data: {} }; });
    const mover = makeUnit('rr_m', 'hero', 2, 3), ally = makeUnit('rr_a', 'hero', 3, 3), far = makeUnit('rr_f', 'hero', 4, 3);
    const st = makeState(grid, [mover, ally, far, makeUnit('rr_e', 'enemy', 7, 7)]);
    const W = 560, H = 380;
    const rand = Math.random;
    const diffBox = function (a, b) {
      let x0 = W, y0 = H, x1 = -1, y1 = -1;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 4;
          if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 24) {
            if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
          }
        }
      }
      return x1 < 0 ? null : { x0: x0, y0: y0, x1: x1, y1: y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
    };
    const move = [];
    for (let x = 0; x < 8; x++) for (let y = 1; y < 6; y++) if (!(x === 2 && y === 3) && !(x === 3 && y === 3) && !(x === 4 && y === 3)) move.push({ x: x, y: y });
    try {
      [0, 30, 200].forEach(function (yaw) {
        const cam = DD.Iso.withYaw(yaw, function () { const w = DD.Iso.toWorld(3.5, 3, 0); return { x: w.x, y: w.y - 20, zoom: 1.5 }; });
        const scr = function (tx, ty) { return DD.Iso.withYaw(yaw, function () { const w = DD.Iso.toWorld(tx, ty, 0); return { x: (w.x - cam.x) * cam.zoom + W / 2, y: (w.y - cam.y) * cam.zoom + H / 2 }; }); };
        const shot = function (ov) {
          let s = 7;
          Math.random = function () { s = (s * 16807) % 2147483647; return s / 2147483647; };
          try {
            r.resetOverlay();
            Object.assign(r.overlay, { selectedId: 'rr_m', moveTiles: move }, ov || {});
            const cv = canvas(W, H);
            const res = withState(st, function () { return r.renderTo(cv, { state: st, width: W, height: H, camera: cam, yaw: yaw }); });
            return { px: cv.getContext('2d').getImageData(0, 0, W, H).data, res: res };
          } finally { Math.random = rand; }
        };
        const base = shot(null);
        // the new fields left empty / null: the same picture as an overlay that never heard of them
        const empty = shot({ passTiles: [], swapTiles: [], swap: null, ghosts: null, breakTargets: [], objPreview: null });
        t.eq(diffBox(base.px, empty.px), null, 'yaw ' + yaw + ': empty rules-run fields draw nothing');
        // the far ally's tile as pass-through: the move region closes round it, nothing else changes
        const pass = shot({ passTiles: [{ x: 4, y: 3 }] });
        const pb = diffBox(base.px, pass.px), pf = scr(4, 3);
        t.ok(pb && Math.abs(pb.cx - pf.x) <= 40 && Math.abs(pb.cy - pf.y) <= 26, 'yaw ' + yaw + ': the pass tile is drawn on the far ally\'s tile ' + JSON.stringify(pb) + ' vs ' + JSON.stringify(pf));
        // the adjacent ally as a ⇄ end: a ring under it; hovering it: arrows between the two tiles
        const ring = shot({ swapTiles: [{ x: 3, y: 3 }] });
        t.eq(ring.res.swapRings, 1, 'yaw ' + yaw + ': one ⇄ ring');
        t.eq(base.res.swapRings, 0, 'yaw ' + yaw + ': none without swapTiles');
        const sw = shot({ swapTiles: [{ x: 3, y: 3 }], swap: { from: { x: 2, y: 3 }, to: { x: 3, y: 3 } } });
        const sb = diffBox(ring.px, sw.px), sa = scr(2, 3), sz = scr(3, 3);
        t.ok(sb && Math.abs(sb.cx - (sa.x + sz.x) / 2) <= 24 && sb.x1 - sb.x0 >= Math.abs(sz.x - sa.x) * 0.5, 'yaw ' + yaw + ': the swap arrows run between the two tiles ' + JSON.stringify(sb));
        // faded allies (overlay.ghosts): drawn, counted, only that ally changes; a junk id or alpha is harmless
        const gh = shot({ ghosts: { rr_a: 0.35, nobody: 0.2, rr_f: 'x' } });
        t.eq(gh.res.ghosted, 2, 'yaw ' + yaw + ': the faded allies are counted (a junk alpha clamps, an unknown id is ignored)');
        const gb = diffBox(base.px, shot({ ghosts: { rr_a: 0.35 } }).px), ga = scr(3, 3);
        t.ok(gb && Math.abs(gb.cx - ga.x) <= 30 && gb.y1 <= ga.y + 30, 'yaw ' + yaw + ': only the faded ally changes ' + JSON.stringify(gb));
        // 🔨 on the crate, and its HP bar with the hit when previewed
        const brk = shot({ breakTargets: [{ x: 5, y: 2 }], targetTiles: [{ x: 5, y: 2 }] });
        const bm = (brk.res.booms || [])[0], bc = scr(5, 2);
        t.ok(bm && bm.kind === 'break' && bm.x === 5 && bm.y === 2 && Math.abs((bm.x0 + bm.x1) / 2 - bc.x) <= 4 && bm.y1 < bc.y, 'yaw ' + yaw + ': a 🔨 marker over the crate ' + JSON.stringify(bm));
        const pv = shot({ breakTargets: [{ x: 5, y: 2 }], targetTiles: [{ x: 5, y: 2 }], hover: { x: 5, y: 2 }, objPreview: { x: 5, y: 2, dmg: 4, breaks: false } });
        const nopv = shot({ breakTargets: [{ x: 5, y: 2 }], targetTiles: [{ x: 5, y: 2 }], hover: { x: 5, y: 2 } });
        const vb = diffBox(nopv.px, pv.px);
        t.ok(vb && Math.abs(vb.cx - bc.x) <= 16 && vb.y1 < bc.y && vb.x1 - vb.x0 < 60, 'yaw ' + yaw + ': the previewed hit shows the crate\'s HP bar (full HP otherwise has none) ' + JSON.stringify(vb));
        // junk never throws
        const junk = shot({ passTiles: [{ x: 99, y: -4 }, null], swapTiles: [{ x: 'a' }], swap: { from: { x: 2, y: 3 }, to: { x: 40, y: 40 } }, breakTargets: [{ x: -1, y: 0 }], objPreview: { x: 1, y: 1, dmg: 'lots' } });
        t.ok(!!junk.res, 'yaw ' + yaw + ': junk fields render without throwing');
        // [playtest combat-controls-1] a free hit that calls the swap off: a ✖ between the arrows (and nowhere else)
        const swOk = shot({ swapTiles: [{ x: 3, y: 3 }], swap: { from: { x: 2, y: 3 }, to: { x: 3, y: 3 }, bad: true } });
        const swNo = shot({ swapTiles: [{ x: 3, y: 3 }], swap: { from: { x: 2, y: 3 }, to: { x: 3, y: 3 }, bad: true, blocked: true } });
        const xb = diffBox(swOk.px, swNo.px);
        t.ok(xb && Math.abs(xb.cx - (sa.x + sz.x) / 2) <= 14 && Math.abs(xb.cy - (sa.y + sz.y) / 2) <= 22 && xb.x1 - xb.x0 <= 40,
          'yaw ' + yaw + ': a called-off swap draws a ✖ between the two tiles ' + JSON.stringify(xb));
      });
    } finally {
      Math.random = rand;
      r.resetOverlay();
    }
  }, { tags: ['render'] });

  // [h19 QA-BIZ-2] Zip Line (and every pull / push / reposition) showed only a ↷ badge: where the unit lands is marked now
  T.suite('render: h19 QA-BIZ-2 — overlay.moves marks the landing tile of a moved unit, with an arrow from its tile, at every yaw', function (t) {
    const r = R();
    const st = makeState(makeGrid(8, 8), [makeUnit('mv_a', 'hero', 2, 3), makeUnit('mv_b', 'hero', 5, 3), makeUnit('mv_e', 'enemy', 7, 7)]);
    const W = 560, H = 380, rand = Math.random;
    const diffBox = function (a, b) {
      let x0 = W, y0 = H, x1 = -1, y1 = -1;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 4;
          if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 24) {
            if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
          }
        }
      }
      return x1 < 0 ? null : { x0: x0, y0: y0, x1: x1, y1: y1 };
    };
    try {
      [0, 30, 200].forEach(function (yaw) {
        const cam = DD.Iso.withYaw(yaw, function () { const w = DD.Iso.toWorld(3.5, 3.5, 0); return { x: w.x, y: w.y - 20, zoom: 1.5 }; });
        const scr = function (tx, ty) { return DD.Iso.withYaw(yaw, function () { const w = DD.Iso.toWorld(tx, ty, 0); return { x: (w.x - cam.x) * cam.zoom + W / 2, y: (w.y - cam.y) * cam.zoom + H / 2 }; }); };
        const shot = function (ov) {
          let s = 7;
          Math.random = function () { s = (s * 16807) % 2147483647; return s / 2147483647; };
          try {
            r.resetOverlay();
            Object.assign(r.overlay, { selectedId: 'mv_a' }, ov || {});
            const cv = canvas(W, H);
            const res = withState(st, function () { return r.renderTo(cv, { state: st, width: W, height: H, camera: cam, yaw: yaw }); });
            return { px: cv.getContext('2d').getImageData(0, 0, W, H).data, res: res };
          } finally { Math.random = rand; }
        };
        const base = shot(null);
        t.eq(base.res.landings, 0, 'yaw ' + yaw + ': no landing mark without overlay.moves');
        t.eq(diffBox(base.px, shot({ moves: null }).px), null, 'yaw ' + yaw + ': moves: null draws nothing');
        const mv = shot({ moves: [{ unitId: 'mv_b', from: { x: 5, y: 3 }, to: { x: 3, y: 5 } }] });
        t.eq(mv.res.landings, 1, 'yaw ' + yaw + ': one landing mark');
        const b = diffBox(base.px, mv.px), land = scr(3, 5), from = scr(5, 3);
        const inside = function (p, pad) { return !!b && p.x >= b.x0 - pad && p.x <= b.x1 + pad && p.y >= b.y0 - pad && p.y <= b.y1 + pad; };
        t.ok(inside(land, 2), 'yaw ' + yaw + ': the mark covers the landing tile ' + JSON.stringify(b) + ' vs ' + JSON.stringify(land));
        t.ok(inside({ x: (land.x + from.x) / 2, y: (land.y + from.y) / 2 }, 2) && b.x1 - b.x0 >= Math.abs(from.x - land.x) * 0.5,
          'yaw ' + yaw + ': and the arrow reaches back toward the unit\'s tile ' + JSON.stringify(b));
        // junk never throws and draws nothing
        const junk = shot({ moves: [null, 'x', { to: { x: 'a', y: 1 } }, { from: { x: 1, y: 1 }, to: { x: 40, y: 40 } }] });
        t.ok(!!junk.res && junk.res.landings === 0, 'yaw ' + yaw + ': junk moves render without throwing and mark nothing');
      });
    } finally {
      Math.random = rand;
      r.resetOverlay();
    }
  }, { tags: ['render'] });

  T.suite('render: playtest bosses-objectives-2 — a wind-up badge\'s "?" follows DD.AI.describe (uncertain), not the bare Dazzled status', function (t) {
    const r = R();
    const AI = DD.AI;
    if (!AI) { t.skip('no DD.AI'); return; }
    const had = Object.prototype.hasOwnProperty.call(AI, 'describe'), old = AI.describe;
    const mk = function (tag, statuses) {
      const grid = makeGrid(8, 8);
      const boss = makeUnit('bo2_' + tag, 'enemy', 5, 5, { order: 1, tier: 'boss', statuses: statuses || [],
        intents: [{ skillId: 'test_none', anchor: 'ground', abs: { x: 2, y: 2 }, tiles: [{ x: 2, y: 2 }, { x: 3, y: 2 }], label: 'Audit', icon: '📋', dmg: 9, delay: 2 }] });
      return makeState(grid, [makeUnit('bo2_h_' + tag, 'hero', 1, 1), boss]);
    };
    const badge = function (st) {
      r.resetOverlay();
      r.overlay.showIntents = true;
      const res = withState(st, function () { return r.renderTo(canvas(420, 300), { state: st, width: 420, height: 300 }); });
      return ((res && res.badges) || []).filter(function (b) { return b.label === 'Audit'; })[0] || null;
    };
    const dazzled = [{ id: 'dazzled', stacks: 1, turns: 1 }];
    try {
      AI.describe = function () { return { label: 'Audit', dmg: 9, uncertain: false }; };
      const settled = badge(mk('a', dazzled));
      t.ok(settled && settled.unknown === false, 'a Dazzled boss whose skew is already rolled (the tiles show it): no "?" ' + JSON.stringify(settled));
      AI.describe = function () { return { label: 'Audit', dmg: 9, uncertain: true }; };
      const open = badge(mk('b', null));
      t.ok(open && open.unknown === true, 'describe says the landing is still unknown: "?" ' + JSON.stringify(open));
      if (had) AI.describe = old; else delete AI.describe;
      const fallback = badge(mk('c', dazzled));
      t.ok(!!fallback, 'the real describe (or none) still draws the badge ' + JSON.stringify(fallback));
    } finally {
      if (had) AI.describe = old; else delete AI.describe;
      r.resetOverlay();
    }
  }, { tags: ['render'] });

  // ---- V3: act IV "Under the Table" (arenas, E8 zones) and the 17th hero ------------------------------------
  /** renderTo with Math.random seeded (ambient particles respawn the same way) → { px, res }. */
  function seededShot(st, opts) {
    const rand = Math.random;
    let s = 11;
    Math.random = function () { s = (s * 16807) % 2147483647; return s / 2147483647; };
    try {
      const cv = canvas(opts.width, opts.height);
      const res = withState(st, function () { return R().renderTo(cv, Object.assign({ state: st }, opts)); });
      return { px: cv.getContext('2d').getImageData(0, 0, opts.width, opts.height).data, res: res, w: opts.width, h: opts.height };
    } finally { Math.random = rand; }
  }
  /** Pixels that differ noticeably between two shots, and their box. */
  function shotDiff(a, b) {
    let n = 0, x0 = a.w, y0 = a.h, x1 = -1, y1 = -1;
    for (let y = 0; y < a.h; y++) {
      for (let x = 0; x < a.w; x++) {
        const i = (y * a.w + x) * 4;
        if (Math.abs(a.px[i] - b.px[i]) + Math.abs(a.px[i + 1] - b.px[i + 1]) + Math.abs(a.px[i + 2] - b.px[i + 2]) > 24) {
          n++;
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
    }
    return { n: n, box: n ? { x0: x0, y0: y0, x1: x1, y1: y1 } : null };
  }
  function shotPx(s, p) {
    const x = clampInt(p.x, 0, s.w - 1), y = clampInt(p.y, 0, s.h - 1), i = (y * s.w + x) * 4;
    return [s.px[i], s.px[i + 1], s.px[i + 2]];
  }
  function clampInt(v, a, b) { return Math.max(a, Math.min(b, Math.round(v))); }

  // plan §6.3 (bg top → bottom, ambient): the renderer's own looks when DD.Themes lacks them (MAPGEN's entries win)
  const A4_LOOKS = {
    a4_conservatory: ['#18321f', '#050b07', 'pollen'], a4_lair: ['#1c0f28', '#06030a', 'embers'],
    a4_observatory: ['#0e1240', '#02030a', 'stars'], a4_cottage: ['#1d2a1a', '#070a06', 'fog'],
    a4_barn: ['#2a1210', '#070302', 'dust'], a4_underfloor: ['#2a1a10', '#070403', 'dust'],
  };

  T.suite('render: V3 act-4 arenas — theme fallbacks, the new ambients (pollen, stars, notes) and the DM\'s table overhead', function (t) {
    const r = R();
    if (typeof r.themeLook !== 'function') { t.fail('DD.Render.themeLook is missing'); return; }
    const Th = DD.Themes || {};
    const kinds = r.painters.ambients || [];
    ['pollen', 'stars', 'notes'].forEach(function (k) { t.ok(kinds.indexOf(k) >= 0, 'the renderer draws the ambient kind ' + k); });
    // every act-4 arena the registry has (read from DD.Themes, never a count) has a fallback look and an ambient it draws
    const a4 = Object.keys(Th).filter(function (k) { const v = Th[k]; return v && typeof v === 'object' && typeof v !== 'function' && v.act > 3; });
    a4.forEach(function (id) {
      t.ok(r.painters.themes.indexOf(id) >= 0, id + ': the renderer has a fallback look');
      const l = r.themeLook(id);
      t.ok(l.ambient === null || kinds.indexOf(l.ambient) >= 0, id + ': its ambient (' + Th[id].ambient + ') is drawn as ' + l.ambient);
    });
    t.log('act-4 themes in DD.Themes: ' + (a4.join(', ') || 'none yet'));
    Object.keys(A4_LOOKS).forEach(function (id) {
      t.ok(r.painters.themes.indexOf(id) >= 0, id + ': fallback look present');
      const want = A4_LOOKS[id];
      const had = Object.prototype.hasOwnProperty.call(Th, id), keep = Th[id];
      try {
        if (had) delete Th[id];
        const l = r.themeLook(id);
        t.eq(l.bg[0] + ' → ' + l.bg[1] + ' · ' + l.ambient, want[0] + ' → ' + want[1] + ' · ' + want[2], id + ': the fallback bg and ambient (plan §6.3)');
      } finally { if (had) Th[id] = keep; }
    });
    const green = U0(r.themeLook('a4_cottage').ambientColor);
    t.ok(green && green.g > green.r && green.g > green.b, 'the Coven\'s fog is green (' + r.themeLook('a4_cottage').ambientColor + ')');
    t.eq(r.themeLook('a4_underfloor').backdrop, 'table', 'the Last Floor: the underside of the DM\'s table looms overhead');
    t.eq(r.themeLook('a4_barn').backdrop, 'table_far', 'the Barn Burner: the DM\'s table far overhead');
    t.eq(r.themeLook('cellar').backdrop, null, 'v2 themes keep a plain backdrop');

    // ambient resolution and drawing on a scratch theme (removed again below)
    const TID = 'test_render_v3_theme';
    const setTheme = function (extra) { Th[TID] = Object.assign({ id: TID, name: 'Test', act: 1, bg: { top: '#24202a', bottom: '#08070a' }, ambient: null }, extra); };
    try {
      const kindOf = function (extra) { setTheme(extra); return r.themeLook(TID).ambient; };
      t.eq(kindOf({ ambient: 'pollen' }), 'pollen', 'pollen is a kind of its own now');
      t.eq(kindOf({ ambient: 'stars', ambientFallback: 'dust' }), 'stars', 'a known kind ignores its fallback');
      t.eq(kindOf({ ambient: 'notes' }), 'notes', 'notes');
      t.eq(kindOf({ ambient: 'test_render_no_such_kind', ambientFallback: 'spores' }), 'spores', 'an unknown kind uses the theme\'s ambientFallback');
      t.eq(kindOf({ ambient: 'test_render_no_such_kind', ambientFallback: 'test_render_nor_this' }), 'dust', '… else dust');
      t.eq(kindOf({ ambient: null }), null, 'null stays none');
      setTheme({ ambient: 'fog', ambientColor: '#55ff55' });
      t.eq(r.themeLook(TID).ambientColor, '#55ff55', 'a theme def may recolour its ambient');
      const grid = function () { return makeGrid(3, 3); };
      setTheme({ ambient: null });
      const none = seededShot(makeState(grid(), [], { theme: TID }), { width: 360, height: 240 });
      t.ok(none.res && none.res.ambient.kind === null && none.res.ambient.n === 0, 'no ambient: no particles');
      ['pollen', 'stars', 'notes'].forEach(function (k) {
        setTheme({ ambient: k });
        const s = seededShot(makeState(grid(), [], { theme: TID }), { width: 360, height: 240 });
        const a = s.res && s.res.ambient;
        t.ok(a && a.kind === k && a.n > 0, k + ': particles spawned ' + JSON.stringify(a));
        t.ok(shotDiff(none, s).n > 30, k + ': and painted (' + shotDiff(none, s).n + ' px)');
        if (k === 'stars') t.eq(a && a.front, 0, 'stars never drift into the foreground');
        if (k === 'notes') t.ok(a && a.notes > 0 && a.notes < a.n, 'notes: hay motes with a few music notes (' + (a && a.notes) + ' of ' + (a && a.n) + ')');
      });
      // the DM's table overhead: a band across the top only (screen space), thinner and dimmer when far
      setTheme({ backdrop: null });
      const plain = seededShot(makeState(grid(), [], { theme: TID }), { width: 360, height: 240 });
      setTheme({ backdrop: 'table' });
      const near = shotDiff(plain, seededShot(makeState(grid(), [], { theme: TID }), { width: 360, height: 240 }));
      setTheme({ backdrop: 'table_far' });
      const far = shotDiff(plain, seededShot(makeState(grid(), [], { theme: TID }), { width: 360, height: 240 }));
      t.ok(near.box && near.box.y0 === 0 && near.box.y1 <= 240 * 0.25 && near.box.x1 - near.box.x0 >= 340, 'table: a band across the top ' + JSON.stringify(near.box));
      t.ok(far.box && far.box.y0 === 0 && far.box.y1 < near.box.y1, 'table_far: a thinner band ' + JSON.stringify(far.box));
      setTheme({ backdrop: 'test_render_no_such_backdrop' });
      t.eq(shotDiff(plain, seededShot(makeState(grid(), [], { theme: TID }), { width: 360, height: 240 })).n, 0, 'an unknown backdrop draws nothing');
    } finally {
      delete Th[TID];
      r.invalidate();
    }
    // the six arenas draw at the five QA yaws (no "Error in render" warning may appear)
    Object.keys(A4_LOOKS).forEach(function (id) {
      const st = makeState(makeGrid(6, 6, function (tl) { if (tl.x === 0) tl.t = 'wall'; if (tl.y === 5 && tl.x > 2) tl.h = 1; }),
        [makeUnit('a4_h_' + id, 'hero', 2, 2), makeUnit('a4_e_' + id, 'enemy', 4, 3)], { theme: id });
      [0, 90, 180, 270, 37.5].forEach(function (yaw) {
        const res = t.tryRun(id + ' @' + yaw, function () { return seededShot(st, { width: 400, height: 260, yaw: yaw }).res; });
        if (!res || res.units !== 2) t.fail(id + ' @' + yaw + ': units missing (' + (res && res.units) + ')');
      });
    });
  }, { tags: ['render'] });
  function U0(c) { return DD.util.parseColor(c); }

  T.suite('render: V3 E8 content zones — tinted tiles, a chest-height line and a label at any yaw; nothing when absent', function (t) {
    const r = R(), Iso = DD.Iso;
    const W = 560, H = 380;
    const st = makeState(makeGrid(8, 8), [makeUnit('z8_h', 'hero', 6, 6), makeUnit('z8_e', 'enemy', 1, 6)]);
    const ZA = { tiles: [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }], color: '#ff00ff', label: 'Hex Thread' };
    const ZB = { line: [{ x: 1, y: 4 }, { x: 5, y: 1 }], color: '#00ffff' };
    const ZC = { tiles: [{ x: 6, y: 6 }], line: [{ x: 6, y: 6 }, { x: 4, y: 6 }], color: '#ffd23f', label: '🗣️' };
    const near = function (a, b) { return Math.abs(a - b) <= 0.75; };
    try {
      r.resetOverlay();
      // the plan's checks at rot 30 and 200, and the classic view
      [0, 30, 200].forEach(function (yaw) {
        const cam = Iso.withYaw(yaw, function () { const w = Iso.toWorld(3.5, 3.5, 0); return { x: w.x, y: w.y - 20, zoom: 1.2 }; });
        const scr = function (tx, ty, lift) {
          return Iso.withYaw(yaw, function () { const w = Iso.toWorld(tx, ty, 0); return { x: (w.x - cam.x) * cam.zoom + W / 2, y: (w.y - (lift || 0) - cam.y) * cam.zoom + H / 2 }; });
        };
        const shot = function (data) {
          if (data === undefined) delete st.data; else st.data = data;
          return seededShot(st, { width: W, height: H, camera: cam, yaw: yaw });
        };
        const base = shot(undefined);
        const blanks = [{}, { zones: [] }, { zones: null }, { zones: [{ tiles: [] }] },
          { zones: [{ tiles: [{ x: 99, y: 2 }, { x: 1.5, y: 2 }, { x: -1, y: 0 }], line: [{ x: 1, y: 1 }] }] },
          { zones: [null, 7, 'zone', { tiles: 'nope', line: 5 }, { line: [{ x: 2, y: 2 }, { x: 2, y: 2 }] }] }];
        blanks.forEach(function (d, i) {
          const s = shot(d);
          t.eq(shotDiff(base, s).n, 0, 'yaw ' + yaw + ': no zones / empty / junk zones draw nothing, pixel for pixel (#' + i + ')');
          t.eq(s.res && s.res.zones.length, 0, 'yaw ' + yaw + ': and report none (#' + i + ')');
        });
        const z = shot({ zones: [ZA, ZB, ZC] });
        t.eq(z.res && z.res.zones.length, 3, 'yaw ' + yaw + ': three zones drawn');
        if (!z.res || z.res.zones.length !== 3) return;
        // A: its tiles tinted at their own (rotated) spots; a tile away from every zone untouched
        const ca = scr(1, 1), pa0 = shotPx(base, ca), pa1 = shotPx(z, ca);
        const mag = function (p) { return p[0] + p[2] - 2 * p[1]; };
        t.ok(mag(pa1) > mag(pa0) + 20, 'yaw ' + yaw + ': tile (1, 1) tinted magenta ' + pa0 + ' → ' + pa1);
        t.eq(z.res.zones[0].tiles, 3, 'yaw ' + yaw + ': three tiles in zone A');
        const cf = scr(6, 2);
        t.eq(String(shotPx(z, cf)), String(shotPx(base, cf)), 'yaw ' + yaw + ': a tile outside every zone is untouched');
        // B: a line between two tiles at unit-chest height (22 px above the tile tops at zoom 1), painted all along
        const lb = z.res.zones[1].line, a = scr(1, 4, 22), b = scr(5, 1, 22);
        t.ok(lb && near(lb.ax, a.x) && near(lb.ay, a.y) && near(lb.bx, b.x) && near(lb.by, b.y),
          'yaw ' + yaw + ': zone B\'s line ends at the two tiles\' chest height ' + JSON.stringify(lb) + ' vs ' + JSON.stringify([a, b]));
        let hits = 0;
        for (let k = 1; k <= 7; k++) {
          const p = shotPx(z, { x: a.x + (b.x - a.x) * k / 8, y: a.y + (b.y - a.y) * k / 8 });
          if (p[1] > p[0] + 60 && p[2] > p[0] + 60) hits++;
        }
        t.ok(hits >= 5, 'yaw ' + yaw + ': the cyan thread is painted along the line (' + hits + ' of 7 samples)');
        t.eq(z.res.zones[1].label, null, 'yaw ' + yaw + ': no label asked, none drawn');
        // C: an end on a standing unit hangs at that unit's chest, above the tile's own chest point
        const lc = z.res.zones[2].line, foot = scr(6, 6, 0);
        t.ok(lc && lc.ay < foot.y - 10 * cam.zoom && near(lc.ax, foot.x), 'yaw ' + yaw + ': the line starts at the hero\'s chest ' + JSON.stringify(lc) + ' (feet ' + JSON.stringify(foot) + ')');
        // labels: inside the canvas, just in front of the zone (below its nearest tile), centred under it
        const la = z.res.zones[0].label, pts = ZA.tiles.map(function (p) { return scr(p.x, p.y); });
        const lowest = Math.max.apply(null, pts.map(function (p) { return p.y; }));
        const midX = pts.reduce(function (s, p) { return s + p.x; }, 0) / pts.length;
        t.ok(la && la.text === 'Hex Thread' && la.x0 >= 0 && la.x1 <= W && la.y0 >= 0 && la.y1 <= H, 'yaw ' + yaw + ': zone A\'s label drawn ' + JSON.stringify(la));
        t.ok(la && la.y0 >= lowest - 1 && Math.abs((la.x0 + la.x1) / 2 - midX) <= 2, 'yaw ' + yaw + ': below the zone\'s nearest tile, centred ' + JSON.stringify(la) + ' lowest ' + lowest.toFixed(1));
        t.ok(z.res.zones[2].label && z.res.zones[2].label.text === '🗣️', 'yaw ' + yaw + ': the spotlight\'s 🗣️ label');
        // the zones gone: the very same picture again (no cache or state leaks)
        t.eq(shotDiff(base, shot(undefined)).n, 0, 'yaw ' + yaw + ': without zones the frame is pixel-identical again');
      });
      // resetOverlay (the HUD's mount / unmount) cannot wipe them: they live in the combat state
      r.resetOverlay();
      st.data = { zones: [ZA] };
      const kept = seededShot(st, { width: W, height: H });
      t.eq(kept.res && kept.res.zones.length, 1, 'zones survive DD.Render.resetOverlay()');
      // a finished fight shows none
      st.result = 'victory';
      const over = seededShot(st, { width: W, height: H });
      t.eq(over.res && over.res.zones.length, 0, 'no zones once the fight is over');
      st.result = null;
      // a junk colour falls back to gold; a long label is cut to fit
      st.data = { zones: [{ tiles: [{ x: 3, y: 3 }], color: 'not a colour', label: 'The Stirring Spot Of Unreasonable Length And Then Some' }] };
      const junk = seededShot(st, { width: W, height: H });
      const jz = junk.res && junk.res.zones[0];
      t.ok(jz && jz.color === '#ffd23f', 'a junk colour falls back to gold (' + (jz && jz.color) + ')');
      t.ok(jz && jz.label && jz.label.text.length <= 26 && /…$/.test(jz.label.text), 'a long label is cut: ' + (jz && jz.label && jz.label.text));
      // the live renderer reads the same field (DD.Combat.state.data.zones) through currentState
      st.data = { zones: [ZB] };
      const live = withState(st, function () { return r.renderTo(canvas(W, H), { width: W, height: H }); });
      t.ok(live && live.zones.length === 1 && !!live.zones[0].line, 'the live state\'s zones are drawn');
    } finally {
      delete st.data;
      st.result = null;
      r.resetOverlay();
    }
  }, { tags: ['render'] });

  T.suite('render: V3 the 17th hero — Benedick\'s campfire seat on the path, the fallback order, every real hero at the fire', function (t) {
    const r = R();
    const slots = r.TITLE_SLOTS, order = r.HERO_ORDER;
    t.ok(Array.isArray(slots) && Array.isArray(order), 'DD.Render exposes TITLE_SLOTS and HERO_ORDER');
    if (!Array.isArray(slots) || !Array.isArray(order)) return;
    slots[0][0] = 99; order.push('test_render_nobody');
    t.ok(r.TITLE_SLOTS[0][0] !== 99 && r.HERO_ORDER.indexOf('test_render_nobody') < 0, 'both are copies (the renderer\'s own lists stay put)');
    const S = r.TITLE_SLOTS, O = r.HERO_ORDER;
    const keys = S.map(function (s) { return s[0] + ',' + s[1]; });
    t.eq(keys.filter(function (k, i) { return keys.indexOf(k) === i; }).length, keys.length, 'no two heroes share a seat');
    t.ok(S.every(function (s) { return s[0] >= 0 && s[0] < 7 && s[1] >= 0 && s[1] < 7 && !(s[0] === 3 && s[1] === 3); }), 'every seat on the island, nobody in the fire');
    t.eq(O[O.length - 1], 'benedick', 'Benedick arrives last in the renderer\'s fallback order (obviously)');
    t.eq(JSON.stringify(S[O.indexOf('benedick')]), '[4,6]', 'his seat: [4, 6] on the cobble path behind the ring, still arriving');
    t.ok(S.length >= O.length, 'a seat for every hero of the fallback order (' + S.length + ' seats, ' + O.length + ' heroes)');
    const ids = Object.keys(DD.defs.heroes);
    const isOpen = function (id) { return !DD.Meta || typeof DD.Meta.isUnlocked !== 'function' || DD.Meta.isUnlocked(id); };
    const open = ids.filter(isOpen), pool = open.length ? open : ids;
    const real = ids.filter(function (id) { return id.indexOf('test_') !== 0; });
    const missing = real.filter(function (id) { return O.indexOf(id) < 0; });
    if (missing.length) t.log('NOTE: registered heroes missing from the renderer\'s fallback order (they sit after it): ' + missing.join(', '));
    const seated = function () {
      const res = r.renderTo(canvas(640, 360), { scene: 'title', width: 640, height: 360 });
      return (res && res.seats) || [];
    };
    const check = function (tag, orderUsed) {
      const seats = seated();
      t.eq(seats.length, Math.min(S.length, pool.length), tag + ': min(seats, open heroes) sit (' + seats.length + ')');
      // h19: a hero of the order sits in the seat at his index in it (one not registered yet leaves his chair to the
      // heroes the order does not list, never to the heroes after him); those fill the free seats in order
      const ownSeat = function (id) { const i = orderUsed.indexOf(id); return i >= 0 && i < S.length ? i : -1; };
      const taken = {};
      seats.forEach(function (s) { const i = ownSeat(s.id); if (i >= 0) taken[i] = true; });
      let bad = 0, free = 0;
      seats.forEach(function (s) {
        let i = ownSeat(s.id);
        if (i < 0) { while (taken[free]) free++; i = free; taken[free] = true; }
        if (!S[i] || s.x !== S[i][0] || s.y !== S[i][1]) bad++;
      });
      t.eq(bad, 0, tag + ': each hero of the order in his own seat, the others in the free seats in order');
      const at = seats.map(function (s) { return s.x + ',' + s.y; });
      t.eq(at.filter(function (k, i) { return at.indexOf(k) === i; }).length, at.length, tag + ': nobody shares a seat');
      const realSeated = seats.filter(function (s) { return s.id.indexOf('test_') !== 0; }).map(function (s) { return s.id; });
      const want = Math.min(real.filter(isOpen).length, S.length);
      t.eq(realSeated.length, want, tag + ': all ' + want + ' real heroes sit (N = ' + real.length + ' from the registry)');
      t.eq(seats.slice(0, realSeated.length).map(function (s) { return s.id; }).join(','), realSeated.join(','), tag + ': real heroes take the first seats');
      const listed = realSeated.filter(function (id) { return orderUsed.indexOf(id) >= 0; });
      t.eq(realSeated.slice(0, listed.length).join(','), listed.slice().sort(function (a, b) { return orderUsed.indexOf(a) - orderUsed.indexOf(b); }).join(','),
        tag + ': in the display order (a hero it does not list yet sits after the listed ones)');
      if (DD.defs.heroes.benedick && isOpen('benedick')) {
        const i = seats.map(function (s) { return s.id; }).indexOf('benedick');
        t.ok(i >= 0, tag + ': Benedick sits at the fire');
        // h19: his seat is his index's, so he stays on the path whoever has registered before him
        if (i >= 0 && ownSeat('benedick') === O.indexOf('benedick')) t.eq(seats[i].x + ',' + seats[i].y, '4,6', tag + ': the last of the order, on the path');
      }
      // the path seat is taken whenever there are enough heroes (test heroes fill it until Benedick lands)
      if (pool.length >= S.length) t.ok(seats.some(function (s) { return s.x === 4 && s.y === 6; }), tag + ': the seat on the path [4, 6] is taken');
      return seats;
    };
    const UI = DD.UI;
    check(UI && Array.isArray(UI.HERO_ORDER) && UI.HERO_ORDER.length ? 'UI.HERO_ORDER' : 'fallback order',
      UI && Array.isArray(UI.HERO_ORDER) && UI.HERO_ORDER.length ? UI.HERO_ORDER : O);
    if (UI && Array.isArray(UI.HERO_ORDER)) {
      const keep = UI.HERO_ORDER;
      try {
        UI.HERO_ORDER = [];
        check('fallback order (UI.HERO_ORDER empty)', O);
      } finally { UI.HERO_ORDER = keep; r.invalidate(); }
    }
    if (!DD.defs.heroes.benedick) t.log('Benedick is not registered yet (HERO-BENEDICK\'s stub): the seat on the path waits for him');
  }, { tags: ['render'] });

  // ---- h19 (H19-SEATS, plan D2 / D3): Rasma, Biz and Phat Gus at the campfire, before Benedick --------------------
  T.suite('render: title campfire (h19) — Rasma [6, 2], Biz [0, 4] and Phat Gus [0, 1] sit down before Benedick, each in his own chair, whoever has registered', function (t) {
    const r = R();
    if (!Array.isArray(r.TITLE_SLOTS) || !Array.isArray(r.HERO_ORDER) || typeof r.titleTile !== 'function') { t.skip('renderer without the h19 seats'); return; }
    const S = r.TITLE_SLOTS, O = r.HERO_ORDER;
    t.eq(O.slice(O.indexOf('pebbles')).join(','), 'pebbles,rasma,biz,gus,benedick', 'the fallback order: Pebbles, then the user\'s order (Rasma, Biz, Phat Gus), then Benedick, last (obviously)');
    if (DD.UI && Array.isArray(DD.UI.HERO_ORDER)) t.eq(DD.UI.HERO_ORDER.join(','), O.join(','), 'the fallback order is UI.HERO_ORDER, id for id');
    t.ok(S.length >= O.length, 'a seat for every hero of the order (' + S.length + ' seats, ' + O.length + ' heroes)');
    const want = { rasma: [6, 2, 1], biz: [0, 4, 0], gus: [0, 1, 1], benedick: [4, 6, 0] };
    Object.keys(want).forEach(function (id) {
      const s = S[O.indexOf(id)], w = want[id];
      t.eq(s && s.join(','), w[0] + ',' + w[1], id + '\'s seat: [' + w[0] + ', ' + w[1] + ']');
      const tile = s && r.titleTile(s[0], s[1]);
      if (id !== 'benedick') t.ok(tile && tile.t === 'grass' && tile.h === w[2] && !tile.obj, id + ': grass, height ' + w[2] + ', nothing on it (' + JSON.stringify(tile) + ')');
    });
    t.eq(r.titleTile(6, 1) && r.titleTile(6, 1).t, 'water', 'Rasma stands by the water ([6, 1])');
    t.eq(r.titleTile(0, 0) && r.titleTile(0, 0).obj, 'tree', 'Phat Gus forages under the tree ([0, 0])');
    // every chair: on the island, on open ground, out of the flames
    const bad = S.filter(function (s) {
      const tile = r.titleTile(s[0], s[1]);
      return !tile || tile.obj || tile.t === 'water' || (s[0] === 3 && s[1] === 3);
    });
    t.eq(bad.length, 0, 'every seat on the island, on open ground, nobody in the fire' + (bad.length ? ': ' + JSON.stringify(bad) : ''));
    const keys = S.map(function (s) { return s.join(','); });
    t.eq(keys.filter(function (k, i) { return keys.indexOf(k) === i; }).length, keys.length, 'no two heroes share a seat (' + keys.length + ' seats)');
    // the chairs are keyed by the order: take a hero of the order away and nobody after him moves up
    const UI = DD.UI;
    const order = UI && Array.isArray(UI.HERO_ORDER) && UI.HERO_ORDER.length ? UI.HERO_ORDER : O;
    const seatOf = function (seats, id) { const s = seats.filter(function (x) { return x.id === id; })[0]; return s ? s.x + ',' + s.y : null; };
    const shot = function () { r.invalidate(); const res = r.renderTo(canvas(640, 360), { scene: 'title', width: 640, height: 360 }); return (res && res.seats) || []; };
    const gone = ['pebbles', 'rasma', 'biz'].filter(function (id) { return !!DD.defs.heroes[id]; });
    const kept = {};
    gone.forEach(function (id) { kept[id] = DD.defs.heroes[id]; });
    let seats;
    try {
      gone.forEach(function (id) { delete DD.defs.heroes[id]; });
      seats = shot();
    } finally {
      gone.forEach(function (id) { DD.defs.heroes[id] = kept[id]; });
      r.invalidate();
    }
    const after = order.filter(function (id, i) { return i > order.indexOf('pebbles') && DD.defs.heroes[id] && gone.indexOf(id) < 0; });
    after.forEach(function (id) {
      const s = S[order.indexOf(id)];
      t.eq(seatOf(seats, id), s[0] + ',' + s[1], 'without ' + gone.join(', ') + ': ' + id + ' keeps his own seat [' + s.join(', ') + ']');
    });
    t.ok(seats.every(function (s) { return gone.indexOf(s.id) < 0; }), 'the heroes taken away are not drawn');
    const listedSeat = seats.filter(function (s) { return order.indexOf(s.id) >= 0; });
    t.ok(listedSeat.every(function (s) { return gone.every(function (id) { const g = S[order.indexOf(id)]; return s.x + ',' + s.y !== g[0] + ',' + g[1]; }); }),
      'no hero of the order takes an empty chair (only a hero the order does not list may)');
    if (!after.length) t.log('none of Phat Gus and Benedick is registered here: the kept-seat check had nobody to move');
    const back = shot();
    if (DD.defs.heroes.benedick) t.eq(seatOf(back, 'benedick'), '4,6', 'Benedick on the path again with everyone back');
  }, { tags: ['render'] });

  // ---- V3 QA fixes (render-ui cluster) -------------------------------------------------------------------------------
  T.suite('render: QA FIGHTS-13 — a tinted wind-up (intent.data.tint) washes its tiles in its own colour under the danger tape; shared tiles stay red', function (t) {
    const r = R();
    const grid = makeGrid(7, 7, function (tl) { tl.t = 'gold'; });
    const tinted = [{ x: 1, y: 1 }, { x: 1, y: 2 }, { x: 3, y: 3 }];
    const red = [{ x: 4, y: 1 }, { x: 5, y: 1 }, { x: 3, y: 3 }];
    const wu = function (tiles, extra) {
      return Object.assign({ skillId: 'test_none', anchor: 'ground', abs: { x: tiles[0].x, y: tiles[0].y }, tiles: tiles.slice(), label: 'Bass', icon: '🔊', dmg: 10, delay: 1 }, extra || {});
    };
    const e1 = makeUnit('qa_dj', 'enemy', 6, 6, { intents: [wu(tinted, { data: { tint: '#ffd24a', hint: 'Bass → gold squares' } }), wu(red)] });
    const st = makeState(grid, [e1], { theme: 'hoard' });
    const W = 480, H = 320, cam = { x: DD.Iso.toWorld(3, 3, 0).x, y: DD.Iso.toWorld(3, 3, 0).y, zoom: 1.4 };
    const shot = function (show) {
      r.resetOverlay();
      Object.assign(r.overlay, { showIntents: show });
      const cv = canvas(W, H);
      const res = withState(st, function () { return r.renderTo(cv, { state: st, width: W, height: H, camera: cam, yaw: 0 }); });
      return { px: cv.getContext('2d').getImageData(0, 0, W, H).data, res: res };
    };
    try {
      const off = shot(false), on = shot(true);
      t.ok(on.res && on.res.telegraphs === 1, 'the wind-ups are drawn (' + (on.res && on.res.telegraphs) + ' unit)');
      // mean channel values inside a tile (a box around its centre)
      const mean = function (img, tx, ty) {
        const w = DD.Iso.toWorld(tx, ty, 0), p = { x: (w.x - cam.x) * cam.zoom + W / 2, y: (w.y - cam.y) * cam.zoom + H / 2 };
        const s = [0, 0, 0];
        let n = 0;
        for (let y = Math.round(p.y - 5); y <= Math.round(p.y + 5); y++) {
          for (let x = Math.round(p.x - 12); x <= Math.round(p.x + 12); x++) {
            const i = (y * W + x) * 4;
            s[0] += img[i]; s[1] += img[i + 1]; s[2] += img[i + 2]; n++;
          }
        }
        return s.map(function (v) { return v / n; });
      };
      const fmt = function (c) { return c.map(function (v) { return Math.round(v); }).join(','); };
      const floor = mean(off.px, 1, 1), gold = mean(on.px, 1, 1), hot = mean(on.px, 4, 1), both = mean(on.px, 3, 3);
      t.ok(hot[1] < floor[1] - 10, 'a plain wind-up washes the gold floor red (green ' + Math.round(floor[1]) + ' → ' + Math.round(hot[1]) + ')');
      t.ok(gold[1] > hot[1] + 20, 'the tinted one stays gold, clearly apart from the red one (' + fmt(gold) + ' vs ' + fmt(hot) + ')');
      t.ok(Math.abs(gold[0] - floor[0]) + Math.abs(gold[1] - floor[1]) + Math.abs(gold[2] - floor[2]) > 6, 'and it is still marked (the danger tape; ' + fmt(floor) + ' → ' + fmt(gold) + ')');
      t.ok(both[1] < gold[1] - 20, 'a tile both wind-ups share keeps the red (' + fmt(both) + ')');
    } finally { r.resetOverlay(); }
  }, { tags: ['render'] });

  T.suite('render: QA HERO-5 — a status that opts in (showTurns) draws its turns left by its icon over the unit', function (t) {
    const r = R();
    const d = DD.getStatus('ben_dragon') || DD.getStatus('inspired');
    if (!d) { t.skip('no status to try'); return; }
    const had = Object.prototype.hasOwnProperty.call(d, 'showTurns'), was = d.showTurns;
    const grid = makeGrid(5, 5);
    const h = makeUnit('qa_turns', 'hero', 2, 2, { statuses: [{ id: d.id, stacks: 1, turns: 2 }] });
    const st = makeState(grid, [h]);
    const W = 320, H = 240, cam = { x: DD.Iso.toWorld(2, 2, 0).x, y: DD.Iso.toWorld(2, 2, 0).y - 30, zoom: 1.6 };
    const shot = function () {
      r.resetOverlay();
      const cv = canvas(W, H);
      withState(st, function () { r.renderTo(cv, { state: st, width: W, height: H, camera: cam, yaw: 0 }); });
      return cv.getContext('2d').getImageData(0, 0, W, H).data;
    };
    const diff = function (a, b) { let n = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 30) n++; return n; };
    try {
      d.showTurns = false;
      const a = shot(), a2 = shot();
      d.showTurns = true;
      const b = shot();
      const noise = diff(a, a2), changed = diff(a, b);
      t.ok(changed > noise + 8, 'with showTurns the status row gains its "2" (' + changed + ' px changed; ' + noise + ' between two plain frames)');
    } finally {
      if (had) d.showTurns = was; else delete d.showTurns;
      r.resetOverlay();
    }
  }, { tags: ['render'] });

  // h19 (H19-SEATS, plan D9; ARCHITECTURE §3.3, §7.2): Rasma's last charge and Phat Gus's one acorn read "1"
  T.suite('render: h19 — a status that opts in (showStacks) draws its stack count from 1 by its icon over the unit; from 2 nothing changes', function (t) {
    const r = R();
    const d = ['ras_frost', 'gus_cheeks', 'burn', 'inspired'].map(function (id) { return DD.getStatus(id); }).filter(Boolean)[0];
    if (!d) { t.skip('no status to try'); return; }
    const own = function (k) { return { had: Object.prototype.hasOwnProperty.call(d, k), was: d[k] }; };
    const keep = { showStacks: own('showStacks'), showTurns: own('showTurns') };
    const grid = makeGrid(5, 5);
    const h = makeUnit('h19_stacks', 'hero', 2, 2, { statuses: [{ id: d.id, stacks: 1, turns: -1 }] });
    const st = makeState(grid, [h]);
    const W = 320, H = 240, cam = { x: DD.Iso.toWorld(2, 2, 0).x, y: DD.Iso.toWorld(2, 2, 0).y - 30, zoom: 1.6 };
    const shot = function (stacks) {
      h.statuses[0].stacks = stacks;
      r.resetOverlay();
      const cv = canvas(W, H);
      withState(st, function () { r.renderTo(cv, { state: st, width: W, height: H, camera: cam, yaw: 0 }); });
      return cv.getContext('2d').getImageData(0, 0, W, H).data;
    };
    const diff = function (a, b) { let n = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 30) n++; return n; };
    try {
      d.showTurns = false;
      d.showStacks = false;
      const a = shot(1), a2 = shot(1), two = shot(2);
      d.showStacks = true;
      const b = shot(1), two2 = shot(2);
      const noise = diff(a, a2), changed = diff(a, b);
      t.ok(changed > noise + 8, d.id + ' with showStacks: one stack draws its "1" (' + changed + ' px changed; ' + noise + ' between two plain frames)');
      t.ok(diff(two, two2) <= noise + 2, 'two stacks look the same with or without the flag (' + diff(two, two2) + ' px)');
      t.ok(diff(b, two2) > noise + 4, 'and "1" is not "2" (' + diff(b, two2) + ' px)');
    } finally {
      Object.keys(keep).forEach(function (k) { if (keep[k].had) d[k] = keep[k].was; else delete d[k]; });
      r.resetOverlay();
    }
  }, { tags: ['render'] });
})();
