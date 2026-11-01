/* Dungeons and Degenerates — js/render/iso.js
 * Isometric geometry for the world renderer (ARCHITECTURE §7.1):
 *   - grid <-> world projection (64x32 diamonds, 16 px per elevation level)
 *   - hit-testing helpers (tile columns, polygons) used by DD.Render picking
 *   - deterministic per-tile noise (stable textures/variants, never Math.random)
 *   - DD.Iso.painter(ctx, opts): the small painter helper `g` (§7.3-compatible) handed to custom object
 *     painters (objectDef.draw(g, obj, t)); origin at the feet, +y down, world px at zoom 1.
 * World -> screen is the camera transform owned by DD.Render: screen = (world - camera) * zoom + viewport / 2.
 */
(function () {
  'use strict';
  const DD = window.DD;

  const HALF_W = 32;
  const HALF_H = 16;
  const STEP = 16;      // px per elevation level
  const HEIGHT_PX = 32; // px per "tile" of render height (terrain.tall, object.height)

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

    /** Grid (x, y, elevation h) -> world px of the tile top-face center. */
    toWorld: function (x, y, h) {
      return { x: (x - y) * HALF_W, y: (x + y) * HALF_H - (h || 0) * STEP };
    },
    /** World px -> fractional grid coords on the plane at elevation h (inverse of toWorld). */
    fromWorld: function (wx, wy, h) {
      const a = wx / HALF_W;
      const b = (wy + (h || 0) * STEP) / HALF_H;
      return { x: (a + b) / 2, y: (b - a) / 2 };
    },
    /** Render height in tiles (terrain.tall, object.height) -> elevation levels. */
    levels: function (tiles) { return (tiles || 0) * HEIGHT_PX / STEP; },
    /** Painter's-order key of a grid position. */
    depth: function (x, y) { return x + y; },
    /** Offset inside a tile in grid units (u along +x, v along +y, each in [-0.5, 0.5]) -> px from its center. */
    local: function (u, v) { return { x: (u - v) * HALF_W, y: (u + v) * HALF_H }; },

    // ---- hit testing ------------------------------------------------------------------------------
    /** Is (px,py) inside a tile column: the top diamond centered at (cx,cy) extruded down by depthPx? */
    inColumn: function (px, py, cx, cy, hw, hh, depthPx) {
      const dx = Math.abs(px - cx);
      if (dx > hw) return false;
      const k = hh * (dx / hw);
      return py >= cy - hh + k && py <= cy + hh + (depthPx || 0) - k;
    },
    inDiamond: function (px, py, cx, cy, hw, hh) { return Iso.inColumn(px, py, cx, cy, hw, hh, 0); },
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
    /** Diamond subpath (no beginPath). */
    diamondPath: function (ctx, cx, cy, hw, hh) {
      ctx.moveTo(cx, cy - hh);
      ctx.lineTo(cx + hw, cy);
      ctx.lineTo(cx, cy + hh);
      ctx.lineTo(cx - hw, cy);
      ctx.closePath();
    },
    roundRectPath: roundRectPath,
    flatPoints: flatPoints,

    /**
     * Painter helper `g` (ARCHITECTURE §7.3) for custom painters. Drawing happens in the caller's current
     * transform (origin at the feet, +y down). `stroke` args accept a color or `true` (= g.outline).
     * Extras beyond §7.3: g.diamond, g.box (iso block), g.cylinder, g.shade, g.rgba, g.glow, g.save/restore.
     */
    painter: function (ctx, opts) {
      opts = opts || {};
      const g = {
        ctx: ctx, pal: opts.pal || {}, t: opts.t || 0, lw: opts.lw || 1.5, outline: opts.outline || '#1a1014',
        zoom: opts.zoom || 1, obj: opts.obj || null, tile: opts.tile || null,
      };
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
      g.diamond = function (cx, cy, hw, hh, fill, stroke) {
        ctx.beginPath(); Iso.diamondPath(ctx, cx, cy, hw, hh); finish(fill, stroke); return g;
      };
      /** Iso block standing on the ground diamond (cx, cy, hw, hh), `height` px tall. colors: { top, left, right }. */
      g.box = function (cx, cy, hw, hh, height, colors, stroke) {
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
      };
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
