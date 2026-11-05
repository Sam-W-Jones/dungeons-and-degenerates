/* Dungeons and Degenerates — js/render/iso.js
 * Isometric geometry for the world renderer (ARCHITECTURE §7.1):
 *   - grid <-> world projection under a VIEW YAW: the ground plane is turned by the yaw, then projected 2:1 as today
 *     (64x32 diamonds at yaw 0, 16 px per elevation level at every yaw). A(yaw) = A0 · R(yaw); positive yaw turns the
 *     board clockwise on screen. Yaw 0 is the LEGACY view: every helper returns today's exact expressions there.
 *     One immutable view object per yaw (DD.Iso.view(): matrix, tile quad, edges / visible faces, shading weights);
 *     only DD.Render sets the live one (setYaw), anything may paint under another (withYaw).
 *   - hit-testing helpers (tile columns, polygons, view rays through columns) used by DD.Render picking
 *   - deterministic per-tile noise (stable textures/variants, never Math.random)
 *   - DD.Iso.painter(ctx, opts): the small painter helper `g` (§7.3-compatible) handed to custom object
 *     painters (objectDef.draw(g, obj, t)); origin at the feet, +y down, world px at zoom 1. Billboard by default;
 *     opts.ground makes g.diamond the view's tile quad; opts.yawAware also turns g.box with the board (g.faces /
 *     g.on / g.quad place details on a block's faces); g.local(u, v) is the view-aware ground offset.
 * World -> screen is the camera transform owned by DD.Render: screen = (world - camera) * zoom + viewport / 2.
 */
(function () {
  'use strict';
  const DD = window.DD;

  const HALF_W = 32;
  const HALF_H = 16;
  const STEP = 16;      // px per elevation level
  const HEIGHT_PX = 32; // px per "tile" of render height (terrain.tall, object.height)
  const K = HALF_W * Math.SQRT2;   // px per tile along the screen-horizontal ground axis (any yaw)
  const RAD = Math.PI / 180;

  // ---- views (one per yaw) ------------------------------------------------------------------------------
  // Tile corners in ground units: NW, NE, SE, SW (screen-clockwise at every yaw). Each edge: outward normal (dx, dy),
  // its face corner pair a -> b (left -> right on screen whenever the face is visible) and its overlay stroke pair
  // sa -> sb (clockwise: today's stroke directions).
  const CORNER_UV = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
  const EDGE_DEFS = [
    { dir: 'N', dx: 0, dy: -1, a: 1, b: 0, sa: 0, sb: 1, opp: 'S' },
    { dir: 'E', dx: 1, dy: 0, a: 2, b: 1, sa: 1, sb: 2, opp: 'W' },
    { dir: 'S', dx: 0, dy: 1, a: 3, b: 2, sa: 2, sb: 3, opp: 'N' },
    { dir: 'W', dx: -1, dy: 0, a: 0, b: 3, sa: 3, sb: 0, opp: 'E' },
  ];
  const QUARTER_CS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function smoothstep(a, b, x) { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); }

  /** Degrees -> [0, 360), rounded to 1e-3 deg (the view memo's resolution); garbage -> 0. */
  function normYaw(deg) {
    deg = +deg;
    if (!isFinite(deg)) return 0;
    deg %= 360;
    if (deg < 0) deg += 360;
    deg = Math.round(deg * 1000) / 1000;
    return deg >= 360 || deg === 0 ? 0 : deg;
  }

  /** Everything derived from one yaw (ARCHITECTURE §7.1 / the rotation plan §1). Frozen once built. */
  function buildView(yaw) {
    const qf = yaw / 90, qi = Math.round(qf);
    const quarter = Math.abs(qf - qi) < 1e-9 ? qi % 4 : -1;
    let c, s;
    if (quarter >= 0) { c = QUARTER_CS[quarter][0]; s = QUARTER_CS[quarter][1]; yaw = quarter * 90; }
    else { c = Math.cos(yaw * RAD); s = Math.sin(yaw * RAD); }
    const V = { yaw: yaw, quarter: quarter, legacy: quarter === 0, key: quarter >= 0 ? 'q' + quarter : 'y' + yaw.toFixed(3), c: c, s: s };
    V.ax = HALF_W * (c - s); V.bx = -HALF_W * (s + c);
    V.ay = HALF_H * (c + s); V.by = HALF_H * (c - s);
    // f: unit ground vector toward the viewer (straight down the screen); r: toward screen right
    V.fx = (c + s) * Math.SQRT1_2; V.fy = (c - s) * Math.SQRT1_2;
    V.rx = (c - s) * Math.SQRT1_2; V.ry = -(c + s) * Math.SQRT1_2;
    V.corners = CORNER_UV.map(function (q) { return [V.ax * q[0] + V.bx * q[1], V.ay * q[0] + V.by * q[1]]; });
    V.unit = V.corners.map(function (p) { return [p[0] / HALF_W, p[1] / HALF_H]; });
    let top = 0;
    for (let i = 1; i < 4; i++) {
      const p = V.corners[i], q = V.corners[top];
      if (p[1] < q[1] - 1e-9 || (Math.abs(p[1] - q[1]) <= 1e-9 && p[0] < q[0])) top = i;
    }
    V.order = [top, (top + 1) % 4, (top + 2) % 4, (top + 3) % 4];
    V.hx = (Math.abs(V.ax) + Math.abs(V.bx)) / 2;
    V.hy = (Math.abs(V.ay) + Math.abs(V.by)) / 2;
    V.ea = K / 2; V.eb = K / 4;   // the inscribed ellipse of every tile top (inside the quad at any yaw)
    // ground warp W(yaw) = A(yaw)·A(0)^-1 in canvas transform order (a, b, c, d): yaw-0 tile px -> this view
    V.warp = [c, s / 2, -2 * s, c];
    V.edges = {};
    V.edgeList = EDGE_DEFS.map(function (d) {
      const nf = d.dx * V.fx + d.dy * V.fy, nr = d.dx * V.rx + d.dy * V.ry;
      const e = {
        dir: d.dir, dx: d.dx, dy: d.dy, a: d.a, b: d.b, sa: d.sa, sb: d.sb, nf: nf, nr: nr,
        front: nf > 1e-9, back: nf < -1e-9,
        // view-relative light: a face's colour sweeps with its angle in view (0 = style.left ... 1 = style.right)
        shade: quarter >= 0 ? (nr < 0 ? 0 : 1) : clamp01(0.5 + Math.atan2(nr, nf) / RAD / 90),
        // contact shadow of a taller neighbour across this edge: 1 behind, 0 in front
        shadowW: quarter >= 0 ? (nf < 0 ? 1 : 0) : clamp01((0.25 - nf) / 0.5),
        // border cutaway weight (N / W only: mapgen dresses those borders with tall walls)
        cut: d.dir === 'N' || d.dir === 'W' ? smoothstep(-0.1, 0.35, nf) : 0,
        pa: V.corners[d.a], pb: V.corners[d.b], frame: null, opp: null,
      };
      V.edges[d.dir] = e;
      return e;
    });
    V.edgeList.forEach(function (e, i) { e.opp = V.edges[EDGE_DEFS[i].opp]; });
    V.faces = V.edgeList.filter(function (e) { return e.front; })
      .sort(function (a, b) { return (a.pa[0] + a.pb[0]) - (b.pa[0] + b.pb[0]); });
    if (V.faces.length === 2) { V.faces[0].frame = 'L'; V.faces[1].frame = 'R'; }
    else if (V.faces.length === 1) V.faces[0].frame = V.faces[0].shade <= 0.5 ? 'L' : 'R';
    // silhouette chains: leftmost -> rightmost corner along the upper (back) and lower (front) boundary
    let L = 0, Rt = 0;
    for (let i = 1; i < 4; i++) {
      const p = V.corners[i], l = V.corners[L], r = V.corners[Rt];
      if (p[0] < l[0] - 1e-9 || (Math.abs(p[0] - l[0]) <= 1e-9 && p[1] < l[1])) L = i;
      if (p[0] > r[0] + 1e-9 || (Math.abs(p[0] - r[0]) <= 1e-9 && p[1] < r[1])) Rt = i;
    }
    const walk = function (step) { const out = [L]; let i = L; while (i !== Rt) { i = (i + step + 4) % 4; out.push(i); } return out; };
    const cw = walk(1), ccw = walk(-1);
    const meanY = function (ch) { let m = 0; ch.forEach(function (i) { m += V.corners[i][1]; }); return m / ch.length; };
    const backIdx = meanY(cw) <= meanY(ccw) ? cw : ccw, frontIdx = backIdx === cw ? ccw : cw;
    V.backIdx = backIdx; V.frontIdx = frontIdx;
    V.backChain = backIdx.map(function (i) { return V.corners[i]; });
    V.frontChain = frontIdx.map(function (i) { return V.corners[i]; });
    V.edgeList.forEach(Object.freeze);
    return Object.freeze(V);
  }

  const viewMemo = new Map();   // normalised yaw (1e-3 deg) -> view, LRU 400
  function makeView(deg) {
    const yaw = normYaw(deg);
    let V = viewMemo.get(yaw);
    if (V) { viewMemo.delete(yaw); viewMemo.set(yaw, V); return V; }
    V = buildView(yaw);
    viewMemo.set(yaw, V);
    if (viewMemo.size > 400) viewMemo.delete(viewMemo.keys().next().value);
    return V;
  }
  let cur = makeView(0);

  /** Normalise polygon points: [[x,y],...] | [{x,y},...] | flat [x0,y0,x1,y1,...] -> flat array. */
  function flatPoints(points) {
    const out = [];
    if (!points || !points.length) return out;
    if (typeof points[0] === 'number') {
      for (let i = 0; i + 1 < points.length; i += 2) out.push(+points[i], +points[i + 1]);
      return out;
    }
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (!p) continue;
      if (Array.isArray(p)) out.push(+p[0], +p[1]);
      else out.push(+p.x, +p.y);
    }
    return out;
  }

  /** Rounded rectangle subpath (no beginPath). */
  function roundRectPath(ctx, x, y, w, h, r) {
    if (w < 0) { x += w; w = -w; }
    if (h < 0) { y += h; h = -h; }
    r = Math.max(0, Math.min(r || 0, w / 2, h / 2));
    if (!r) { ctx.rect(x, y, w, h); return; }
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  const Iso = (DD.Iso = {
    TILE_W: 64, TILE_H: 32, HALF_W: HALF_W, HALF_H: HALF_H, STEP: STEP, HEIGHT_PX: HEIGHT_PX,
    /** px per tile along the screen-horizontal ground axis; a ground circle of radius r is the ellipse (K r, K r / 2). */
    K: K,
    /** A screen ray's ground track moves RISE tiles toward the viewer (along f) per elevation level. */
    RISE: Math.SQRT1_2,

    // ---- views -----------------------------------------------------------------------------------
    /**
     * The current view V (immutable): { yaw, quarter (0..3 | -1), legacy (yaw 0), key ('q0'..'q3' | 'y<yaw>'), c, s,
     * ax, bx, ay, by (ground -> px matrix), fx, fy (toward the viewer), rx, ry (screen right), corners[4] / unit[4]
     * (NW, NE, SE, SW as [x, y] px / [x / 32, y / 16]), order[4] (corner indices clockwise from the top), hx, hy (quad
     * half-extents), ea, eb (inscribed ellipse), warp [a, b, c, d] (yaw-0 tile px -> this view, canvas order),
     * edges { N, E, S, W } (+ edgeList in that order) each { dir, dx, dy, a, b (face corners, left -> right when
     * visible), sa, sb (overlay stroke corners), nf, nr, front, back, shade, shadowW, cut, pa, pb, frame, opp },
     * faces (visible edges left -> right, frame 'L' | 'R'), backIdx / backChain, frontIdx / frontChain }.
     */
    view: function () { return cur; },
    /** The (memoised) view of a yaw in degrees. */
    makeView: makeView,
    /** Set the current view (DD.Render owns the live yaw; everyone else uses withYaw). Returns it. */
    setYaw: function (deg) { cur = deg && typeof deg === 'object' && deg.key ? deg : makeView(deg); return cur; },
    /** Run fn under another view (degrees or a view object); the previous view is restored even if fn throws. */
    withYaw: function (deg, fn) {
      const prev = cur;
      cur = deg && typeof deg === 'object' && deg.key ? deg : makeView(deg);
      try { return fn(); } finally { cur = prev; }
    },
    /** Degrees -> [0, 360) at the views' 1e-3 deg resolution. */
    normYaw: normYaw,

    /** Grid (x, y, elevation h) -> world px of the tile top-face center (current view). */
    toWorld: function (x, y, h) {
      const V = cur;
      if (V.legacy) return { x: (x - y) * HALF_W, y: (x + y) * HALF_H - (h || 0) * STEP };
      return { x: V.ax * x + V.bx * y, y: V.ay * x + V.by * y - (h || 0) * STEP };
    },
    /** World px -> fractional grid coords on the plane at elevation h (inverse of toWorld). */
    fromWorld: function (wx, wy, h) {
      const a = wx / HALF_W;
      const b = (wy + (h || 0) * STEP) / HALF_H;
      const V = cur;
      if (V.legacy) return { x: (a + b) / 2, y: (b - a) / 2 };
      const x = (a + b) / 2, y = (b - a) / 2;
      return { x: V.c * x + V.s * y, y: -V.s * x + V.c * y };
    },
    /** Render height in tiles (terrain.tall, object.height) -> elevation levels. */
    levels: function (tiles) { return (tiles || 0) * HEIGHT_PX / STEP; },
    /** Painter's-order key of a grid position: larger = nearer the viewer (x + y at yaw 0, integers at every quarter). */
    depth: function (x, y) {
      const V = cur;
      return V.legacy ? x + y : (V.c + V.s) * x + (V.c - V.s) * y;
    },
    /** Offset inside a tile in grid units (u along +x, v along +y, each in [-0.5, 0.5]) -> px from its center (current view). */
    local: function (u, v) {
      const V = cur;
      if (V.legacy) return { x: (u - v) * HALF_W, y: (u + v) * HALF_H };
      return { x: V.ax * u + V.bx * v, y: V.ay * u + V.by * v };
    },
    /** The yaw-0 offset, whatever the view (billboards drawn in the classic look). */
    local0: function (u, v) { return { x: (u - v) * HALF_W, y: (u + v) * HALF_H }; },
    /**
     * Display mirror (+1 = faces screen right) of a unit at the current view. `facing` is the engine's yaw-0 screen-x
     * sign, `lastDir` its last grid step (used when it agrees with facing), `prev` the sign shown last frame: kept inside
     * a ~±3° band where the direction points along the view (no flicker). Yaw 0: exactly `facing`.
     */
    screenFacing: function (facing, lastDir, prev) {
      const f0 = facing === -1 ? -1 : 1;
      const V = cur;
      if (V.legacy) return f0;
      const ok = lastDir && (lastDir.x || lastDir.y) && Math.sign((+lastDir.x || 0) - (+lastDir.y || 0)) === f0;
      const dx = ok ? +lastDir.x || 0 : f0, dy = ok ? +lastDir.y || 0 : -f0;
      const sx = (V.c - V.s) * dx - (V.s + V.c) * dy;
      if (Math.abs(sx) < 0.05 * Math.hypot(dx, dy)) return prev === 1 || prev === -1 ? prev : f0;
      return sx > 0 ? 1 : -1;
    },

    // ---- hit testing ------------------------------------------------------------------------------
    /** Is (px,py) inside a tile column: the top diamond centered at (cx,cy) extruded down by depthPx? (yaw-0 shape) */
    inColumn: function (px, py, cx, cy, hw, hh, depthPx) {
      const dx = Math.abs(px - cx);
      if (dx > hw) return false;
      const k = hh * (dx / hw);
      return py >= cy - hh + k && py <= cy + hh + (depthPx || 0) - k;
    },
    inDiamond: function (px, py, cx, cy, hw, hh) { return Iso.inColumn(px, py, cx, cy, hw, hh, 0); },
    /**
     * Does the view ray through world px (wx, wy) hit the column of tile (tx, ty) between elevations bot..top (current
     * view)? The ray's ground track fromWorld(wx, wy, h) is a segment; segment vs unit square (Liang-Barsky).
     */
    rayHitsColumn: function (wx, wy, tx, ty, bot, top) {
      const g0 = Iso.fromWorld(wx, wy, bot), g1 = Iso.fromWorld(wx, wy, top);
      let t0 = 0, t1 = 1;
      const clip = function (p, d, lo, hi) {
        if (Math.abs(d) < 1e-12) return p >= lo && p <= hi;
        let a = (lo - p) / d, b = (hi - p) / d;
        if (a > b) { const q = a; a = b; b = q; }
        if (a > t0) t0 = a;
        if (b < t1) t1 = b;
        return t0 <= t1;
      };
      return clip(g0.x, g1.x - g0.x, tx - 0.5, tx + 0.5) && clip(g0.y, g1.y - g0.y, ty - 0.5, ty + 0.5);
    },
    /** Even-odd point-in-polygon (any point format accepted by flatPoints). */
    inPoly: function (px, py, points) {
      const p = flatPoints(points);
      let inside = false;
      for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
        const xi = p[i], yi = p[i + 1], xj = p[j], yj = p[j + 1];
        if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi || 1e-9) + xi) inside = !inside;
      }
      return inside;
    },

    // ---- deterministic noise -------------------------------------------------------------------------
    /** uint32 hash of integer coords + salt. */
    hash: function (x, y, salt) {
      let h = Math.imul((x | 0) ^ 0x27d4eb2d, 0x165667b1);
      h ^= Math.imul(((y | 0) + 0x3c6ef372) | 0, 0x85ebca77);
      h ^= Math.imul(((salt | 0) + 0x9e3779b9) | 0, 0xc2b2ae3d);
      h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d);
      h ^= h >>> 12; h = Math.imul(h, 0x297a2d39);
      h ^= h >>> 15;
      return h >>> 0;
    },
    /** Deterministic float in [0, 1) for integer coords + salt. */
    rand: function (x, y, salt) { return Iso.hash(x, y, salt) / 4294967296; },
    /** Deterministic PRNG stream (mulberry32) -> function () => [0, 1). */
    stream: function (seed) {
      let s = (seed >>> 0) || 1;
      return function () {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    },

    // ---- path helpers ----------------------------------------------------------------------------------
    /** Diamond subpath (no beginPath): the yaw-0 tile shape (billboards). */
    diamondPath: function (ctx, cx, cy, hw, hh) {
      ctx.moveTo(cx, cy - hh);
      ctx.lineTo(cx + hw, cy);
      ctx.lineTo(cx, cy + hh);
      ctx.lineTo(cx - hw, cy);
      ctx.closePath();
    },
    /**
     * The tile quad of view V (default: current) as a subpath, scaled like a diamond of half-sizes (hw, hh) about
     * (cx, cy): top corner first, then clockwise. Equals diamondPath at the quarter views.
     */
    quadPath: function (ctx, cx, cy, hw, hh, V) {
      V = V || cur;
      if (V.legacy) { Iso.diamondPath(ctx, cx, cy, hw, hh); return; }
      const u = V.unit, o = V.order;
      ctx.moveTo(cx + u[o[0]][0] * hw, cy + u[o[0]][1] * hh);
      ctx.lineTo(cx + u[o[1]][0] * hw, cy + u[o[1]][1] * hh);
      ctx.lineTo(cx + u[o[2]][0] * hw, cy + u[o[2]][1] * hh);
      ctx.lineTo(cx + u[o[3]][0] * hw, cy + u[o[3]][1] * hh);
      ctx.closePath();
    },
    roundRectPath: roundRectPath,
    flatPoints: flatPoints,

    /**
     * Painter helper `g` (ARCHITECTURE §7.3) for custom painters. Drawing happens in the caller's current
     * transform (origin at the feet, +y down). `stroke` args accept a color or `true` (= g.outline).
     * Extras beyond §7.3: g.diamond, g.box (iso block), g.cylinder, g.shade, g.rgba, g.glow, g.save/restore,
     * g.local(u, v) -> [x, y] (view-aware ground offset: anything that points along the grid), g.yaw, g.view.
     * Billboard by default (g.diamond / g.box keep the yaw-0 look); opts.ground: g.diamond is the view's tile quad.
     * opts.yawAware: g.box / g.diamond stand on the view's ground quad (blocks turn with the board), and g.faces / g.on /
     * g.quad / g.mix put details on a block's visible faces or top (identical to the billboard helpers at yaw 0).
     */
    painter: function (ctx, opts) {
      opts = opts || {};
      const g = {
        ctx: ctx, pal: opts.pal || {}, t: opts.t || 0, lw: opts.lw || 1.5, outline: opts.outline || '#1a1014',
        zoom: opts.zoom || 1, obj: opts.obj || null, tile: opts.tile || null, yaw: cur.yaw, view: cur,
      };
      g.local = function (u, v) { const L = Iso.local(u, v); return [L.x, L.y]; };
      function finish(fill, stroke) {
        if (fill) { ctx.fillStyle = fill; ctx.fill(); }
        if (stroke) {
          ctx.strokeStyle = stroke === true ? g.outline : stroke;
          ctx.lineWidth = g.lw;
          ctx.lineJoin = 'round';
          ctx.stroke();
        }
      }
      g.circle = function (x, y, r, fill, stroke) {
        ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2); finish(fill, stroke); return g;
      };
      g.ellipse = function (x, y, rx, ry, fill, stroke, rot) {
        ctx.beginPath(); ctx.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), rot || 0, 0, Math.PI * 2); finish(fill, stroke); return g;
      };
      g.rect = function (x, y, w, h, fill, stroke, radius) {
        ctx.beginPath(); roundRectPath(ctx, x, y, w, h, radius || 0); finish(fill, stroke); return g;
      };
      g.poly = function (points, fill, stroke) {
        const p = flatPoints(points);
        if (p.length < 4) return g;
        ctx.beginPath(); ctx.moveTo(p[0], p[1]);
        for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
        ctx.closePath(); finish(fill, stroke); return g;
      };
      g.line = function (x1, y1, x2, y2, color, width) {
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
        ctx.strokeStyle = color || g.outline; ctx.lineWidth = width || g.lw; ctx.lineCap = 'round'; ctx.stroke();
        return g;
      };
      /** Arc from a0 to a1 (radians): stroked with color (null = no stroke), optionally filled. */
      g.arc = function (x, y, r, a0, a1, color, width, fill) {
        ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), a0 || 0, a1 === undefined ? Math.PI * 2 : a1);
        if (fill) { ctx.fillStyle = fill; ctx.fill(); }
        if (color !== null) { ctx.strokeStyle = color || g.outline; ctx.lineWidth = width || g.lw; ctx.lineCap = 'round'; ctx.stroke(); }
        return g;
      };
      /** Centered text. opts: { bold, font, align, baseline, stroke } */
      g.text = function (str, x, y, size, color, o) {
        o = o || {};
        ctx.font = (o.bold === false ? '' : 'bold ') + (size || 10) + 'px ' + (o.font || '"Trebuchet MS", Verdana, sans-serif');
        ctx.textAlign = o.align || 'center';
        ctx.textBaseline = o.baseline || 'middle';
        if (o.stroke) { ctx.lineWidth = o.strokeWidth || 3; ctx.strokeStyle = o.stroke; ctx.lineJoin = 'round'; ctx.strokeText(String(str), x, y); }
        ctx.fillStyle = color || '#ffffff';
        ctx.fillText(String(str), x, y);
        return g;
      };
      // opts.yawAware (objects whose def opts in, and the renderer's built-in boxes): g.box and g.diamond stand on the
      // view's ground quad, so blocks turn with the board. Identical to the billboard helpers at yaw 0.
      const yawAware = opts.yawAware === true;
      const ground = opts.ground === true || yawAware;
      g.diamond = function (cx, cy, hw, hh, fill, stroke) {
        ctx.beginPath();
        if (ground) Iso.quadPath(ctx, cx, cy, hw, hh); else Iso.diamondPath(ctx, cx, cy, hw, hh);
        finish(fill, stroke); return g;
      };
      /** Corners [NW, NE, SE, SW] ([x, y] each) of a ground square given by its yaw-0 diamond half-sizes, at the view. */
      g.quad = function (cx, cy, hw, hh) {
        return cur.unit.map(function (u) { return [cx + u[0] * hw, cy + u[1] * hh]; });
      };
      /** The ground point (u, w) (tiles, from the square's centre) of a square of yaw-0 half-sizes (hw, hh), `up` px above. */
      g.on = function (cx, cy, hw, hh, u, w, up) {
        const V = cur, sx = hw / HALF_W, sy = hh / HALF_H;
        return [cx + (V.ax * u + V.bx * w) * sx, cy + (V.ay * u + V.by * w) * sy - (up || 0)];
      };
      /**
       * The visible vertical faces of a block on that square, left to right on screen: { dir ('N'|'E'|'S'|'W': the
       * physical side), shade (0 = the left colour .. 1 = the right), frame ('L'|'R'), x0, y0, x1, y1 (bottom edge),
       * at(s, up) -> [x, y] (s in [0, 1] along the bottom edge, left -> right; up = px above it), apply() (multiplies the
       * ctx by the face map x = s, y = -up, for patterns painted in face space) }. At yaw 0: S (left) then E (right).
       */
      g.faces = function (cx, cy, hw, hh) {
        const q = g.quad(cx, cy, hw, hh);
        return cur.faces.map(function (e) {
          const p0 = q[e.a], p1 = q[e.b], ex = p1[0] - p0[0], ey = p1[1] - p0[1];
          return {
            dir: e.dir, shade: e.shade, frame: e.frame, x0: p0[0], y0: p0[1], x1: p1[0], y1: p1[1],
            at: function (s, up) { return [p0[0] + ex * s, p0[1] + ey * s - (up || 0)]; },
            apply: function () { ctx.transform(ex, ey, 0, 1, p0[0], p0[1]); },
          };
        });
      };
      /** Face colour between colors.left (shade 0) and colors.right (shade 1); the ends exactly at the quarter views. */
      function faceColor(left, right, t) {
        if (t <= 0) return left;
        if (t >= 1) return right;
        const A = DD.util.parseColor(left), B = DD.util.parseColor(right);
        if (!A || !B) return t < 0.5 ? left : right;
        const m = function (k) { return Math.round(A[k] + (B[k] - A[k]) * t); };
        return 'rgb(' + m('r') + ',' + m('g') + ',' + m('b') + ')';
      }
      g.mix = faceColor;
      /** Iso block standing on the ground diamond (cx, cy, hw, hh), `height` px tall. colors: { top, left, right }. */
      g.box = function (cx, cy, hw, hh, height, colors, stroke) {
        if (yawAware && !cur.legacy) {
          colors = colors || {};
          g.faces(cx, cy, hw, hh).forEach(function (f) {
            ctx.beginPath();
            ctx.moveTo(f.x0, f.y0); ctx.lineTo(f.x1, f.y1); ctx.lineTo(f.x1, f.y1 - height); ctx.lineTo(f.x0, f.y0 - height); ctx.closePath();
            finish(faceColor(colors.left || '#666', colors.right || '#555', f.shade), stroke);
          });
          ctx.beginPath(); Iso.quadPath(ctx, cx, cy - height, hw, hh); finish(colors.top || '#888', stroke);
          return g;
        }
        return boxYaw0(cx, cy, hw, hh, height, colors, stroke);
      };
      function boxYaw0(cx, cy, hw, hh, height, colors, stroke) {
        colors = colors || {};
        const top = cy - height;
        ctx.beginPath();
        ctx.moveTo(cx - hw, cy); ctx.lineTo(cx, cy + hh); ctx.lineTo(cx, top + hh); ctx.lineTo(cx - hw, top); ctx.closePath();
        finish(colors.left || '#666', stroke);
        ctx.beginPath();
        ctx.moveTo(cx, cy + hh); ctx.lineTo(cx + hw, cy); ctx.lineTo(cx + hw, top); ctx.lineTo(cx, top + hh); ctx.closePath();
        finish(colors.right || '#555', stroke);
        ctx.beginPath(); Iso.diamondPath(ctx, cx, top, hw, hh); finish(colors.top || '#888', stroke);
        return g;
      }
      /** Upright cylinder on the ground ellipse (cx, cy, rx, ry), `height` px tall, body shaded for roundness. */
      g.cylinder = function (cx, cy, rx, ry, height, body, top, stroke) {
        const grad = ctx.createLinearGradient(cx - rx, 0, cx + rx, 0);
        grad.addColorStop(0, DD.util.shade(body, -0.25));
        grad.addColorStop(0.38, DD.util.shade(body, 0.12));
        grad.addColorStop(1, DD.util.shade(body, -0.4));
        ctx.beginPath();
        ctx.moveTo(cx - rx, cy - height);
        ctx.lineTo(cx - rx, cy);
        ctx.ellipse(cx, cy, rx, ry, 0, Math.PI, 0, true);
        ctx.lineTo(cx + rx, cy - height);
        ctx.closePath();
        finish(grad, stroke);
        g.ellipse(cx, cy - height, rx, ry, top || DD.util.shade(body, 0.2), stroke);
        return g;
      };
      /** Soft additive glow. */
      g.glow = function (x, y, r, color, alpha) {
        const grad = ctx.createRadialGradient(x, y, 0, x, y, Math.max(1, r));
        grad.addColorStop(0, DD.util.rgba(color, alpha === undefined ? 0.6 : alpha));
        grad.addColorStop(1, DD.util.rgba(color, 0));
        const op = ctx.globalCompositeOperation;
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(x, y, Math.max(1, r), 0, Math.PI * 2); ctx.fill();
        ctx.globalCompositeOperation = op;
        return g;
      };
      g.shade = function (c, amt) { return DD.util.shade(c, amt); };
      g.rgba = function (c, a) { return DD.util.rgba(c, a); };
      g.save = function () { ctx.save(); return g; };
      g.restore = function () { ctx.restore(); return g; };
      return g;
    },
  });
})();
