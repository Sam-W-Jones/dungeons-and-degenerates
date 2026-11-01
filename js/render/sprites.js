/* Dungeons and Degenerates — js/render/sprites.js
 * Procedural chibi sprite painter (docs/ARCHITECTURE.md §3.11 SpriteSpec, §7.3 DD.Sprites).
 * Every unit is painted from a SpriteSpec with canvas primitives: big heads, bold dark outlines, cel shading
 * from the palette (DD.util.shade), idle bob + breathing + blinking, poses, facing flip, hit flash, status tints.
 *
 *   DD.Sprites.draw(ctx, spec, sx, sy, zoom, opts)    (sx, sy) = screen position of the feet (tile top centre)
 *   DD.Sprites.drawUnit(ctx, unit, sx, sy, zoom, t)    resolves the def sprite, applies unit.vis + statuses
 *   DD.Sprites.portrait(specOrDefId, size, opts)       cached head-and-shoulders portrait canvas
 *   DD.Sprites.metrics(specOrUnit)                     { height, width, headY, hover } in px at zoom 1
 *
 * Painter helper `g` (spec.draw / spec.overlay / object draw): origin at the feet, +y down, ~40 px = medium
 * creature before scale. Shape helpers take (..., fill, stroke): fill null/undefined = no fill; stroke
 * undefined/true = outline colour at g.lw, null/false = no stroke, a string = that colour.
 */
(function () {
  'use strict';
  const DD = window.DD;
  const U = DD.util;
  const TAU = Math.PI * 2;

  // ---- option lists (also used by the gallery + tests) --------------------------------------------
  const OPTIONS = {
    base: ['humanoid', 'quadruped', 'blob', 'flyer', 'swarm', 'construct', 'custom'],
    build: ['tiny', 'slim', 'normal', 'stocky', 'huge'],
    outfit: ['robe', 'tunic', 'armor', 'furs', 'coat', 'rags', 'dress', 'none'],
    ears: ['none', 'elf', 'goblin', 'rabbit', 'rabbit_floppy', 'cat', 'dog', 'bear', 'pointy', 'rat'],
    horns: ['none', 'tiefling', 'ram', 'demon', 'antlers', 'unicorn'],
    hair: ['none', 'short', 'long', 'wild', 'mohawk', 'bun', 'ponytail', 'braids'],
    beard: ['none', 'stubble', 'short', 'long', 'wild', 'tentacles'],
    hat: ['none', 'wizard', 'hood', 'crown', 'tophat', 'plague', 'helmet', 'viking', 'beret', 'flowers', 'bandana', 'mortarboard', 'cowl', 'mushroom'],
    face: ['none', 'plague_mask', 'skull', 'bandit_mask', 'glasses', 'monocle', 'sunglasses', 'eyepatch'],
    eyes: ['normal', 'glow', 'angry', 'sleepy', 'big', 'cyclops', 'none'],
    mouth: ['none', 'smile', 'grin', 'fangs', 'tusks', 'frown', 'open', 'gold_teeth'],
    wings: ['none', 'fairy', 'bat', 'bird', 'demon'],
    tail: ['none', 'devil', 'rabbit', 'cat', 'lizard', 'dog', 'rat'],
    mainhand: ['none', 'staff', 'sword', 'greatsword', 'axe', 'greataxe', 'dagger', 'bow', 'crossbow', 'lute', 'book', 'wand',
      'cane', 'flask', 'scythe', 'club', 'spear', 'orb', 'torch', 'scroll', 'quill', 'hammer'],
    offhand: ['none', 'shield', 'flask', 'book', 'orb', 'torch', 'lantern', 'scroll', 'dagger'],
    bling: ['chain', 'rings', 'earrings', 'crown', 'grill', 'bracelets'],
    extras: ['scarf', 'cape', 'belt', 'bandolier', 'sash', 'pouches', 'satchel', 'collar'],
    aura: ['flames', 'glow', 'sparkles', 'smoke', 'runes', 'blood', 'notes', 'leaves', 'bubbles'],
    poses: ['idle', 'attack', 'cast', 'hurt', 'downed'],
    quadruped: { legs: ['short', 'long', 'spider'], snout: ['long', 'short', 'flat', 'beak'], body: ['long', 'round'], fluff: [false, true] },
    blob: { wobble: [0, 1, 2], translucent: [false, true], cube: [false, true] },
    flyer: { body: ['bird', 'bat', 'imp', 'orb', 'wisp'] },
    swarm: { of: ['rat', 'bat', 'bee', 'pixie'] },
    construct: { kind: ['golem', 'armor', 'totem'] },
  };

  const DEFAULT_PAL = {
    skin: '#f2c29b', cloth: '#5b6ee1', cloth2: '#2e3a6b', hair: '#5a3a22', metal: '#c9ced6',
    eye: '#2b2233', accent: '#ffcc33', outline: '#1a1014',
  };

  // ---- colour helpers (cached: shade/parse are string work) -----------------------------------------
  const shadeCache = new Map();
  function shade(c, amt) {
    if (!c || !amt) return c;
    const k = c + '|' + amt;
    let v = shadeCache.get(k);
    if (v === undefined) {
      v = U.shade(c, amt);
      if (shadeCache.size > 6000) shadeCache.clear();
      shadeCache.set(k, v);
    }
    return v;
  }
  const rgbaCache = new Map();
  function rgba(c, a) {
    a = a <= 0 ? 0 : a >= 1 ? 1 : Math.round(a * 50) / 50;
    const k = c + '|' + a;
    let v = rgbaCache.get(k);
    if (v === undefined) {
      v = U.rgba(c, a);
      if (rgbaCache.size > 6000) rgbaCache.clear();
      rgbaCache.set(k, v);
    }
    return v;
  }
  function validColor(c) { return typeof c === 'string' && !!U.parseColor(c); }

  // ---- small math ------------------------------------------------------------------------------------
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  function num(v, fb) { return typeof v === 'number' && isFinite(v) ? v : fb; }
  /** Deterministic pseudo-random in [0,1) from integers (cosmetic layout, never game logic). */
  function hash01(a, b) {
    let h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b | 0) + 0x632be5ab, 0xc2b2ae35);
    h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
    return (h >>> 0) / 4294967296;
  }

  function roundRect(c, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y);
    c.closePath();
  }
  /** Points as [[x,y],...], [{x,y},...] or flat [x,y,x,y,...]. */
  function tracePoly(c, pts, close) {
    if (!pts || !pts.length) return;
    if (typeof pts[0] === 'number') {
      c.moveTo(pts[0], pts[1]);
      for (let i = 2; i + 1 < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
    } else {
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const x = Array.isArray(p) ? p[0] : p.x, y = Array.isArray(p) ? p[1] : p.y;
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
    }
    if (close !== false) c.closePath();
  }
  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
    return c;
  }

  // ---- painter helper `g` (§7.3) ---------------------------------------------------------------------
  function Painter(ctx, pal, o) {
    this.ctx = ctx;
    this.pal = pal;
    this.t = o.t || 0;
    this.lw = o.lw || 1.8;
    this.outline = pal.outline;
    this.facing = o.facing < 0 ? -1 : 1;
    this.pose = o.pose || 'idle';
    this.poseT = o.poseT;
    this.opts = o;
    this.spec = o.spec || null;
    this.unit = o.unit || null;
    this.scale = o.specScale || 1;
    this.zoom = o.zoom || 1;
    this.blink = !!o.blink;
  }
  const P = Painter.prototype;

  P._fs = function (fill, stroke, width) {
    const c = this.ctx;
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke !== null && stroke !== false) {
      c.strokeStyle = typeof stroke === 'string' ? stroke : this.outline;
      c.lineWidth = width || this.lw;
      c.lineJoin = 'round';
      c.stroke();
    }
    return this;
  };
  P.shade = shade;
  P.rgba = rgba;
  P.circle = function (x, y, r, fill, stroke) {
    const c = this.ctx; c.beginPath(); c.arc(x, y, Math.max(0, r), 0, TAU);
    return this._fs(fill, stroke);
  };
  P.ellipse = function (x, y, rx, ry, fill, stroke, rot) {
    const c = this.ctx; c.beginPath(); c.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), rot || 0, 0, TAU);
    return this._fs(fill, stroke);
  };
  P.rect = function (x, y, w, h, fill, stroke, radius) {
    const c = this.ctx; c.beginPath();
    if (radius) roundRect(c, x, y, w, h, radius); else c.rect(x, y, w, h);
    return this._fs(fill, stroke);
  };
  P.poly = function (points, fill, stroke, width) {
    const c = this.ctx; c.beginPath(); tracePoly(c, points, true);
    return this._fs(fill, stroke, width);
  };
  P.line = function (x1, y1, x2, y2, color, width) {
    const c = this.ctx; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2);
    c.lineCap = 'round'; c.strokeStyle = color || this.outline; c.lineWidth = width || this.lw; c.stroke();
    c.lineCap = 'butt';
    return this;
  };
  /** Stroked arc (angles in radians, clockwise from +x). Optional fill fills the pie slice first. */
  P.arc = function (x, y, r, a0, a1, color, width, fill) {
    const c = this.ctx;
    if (fill) { c.beginPath(); c.moveTo(x, y); c.arc(x, y, Math.max(0, r), a0, a1); c.closePath(); c.fillStyle = fill; c.fill(); }
    c.beginPath(); c.arc(x, y, Math.max(0, r), a0, a1);
    c.lineCap = 'round'; c.strokeStyle = color || this.outline; c.lineWidth = width || this.lw; c.stroke();
    c.lineCap = 'butt';
    return this;
  };
  /** Centred text, never mirrored by the facing flip. stroke: outline colour (default) or null. */
  P.text = function (str, x, y, size, color, stroke) {
    const c = this.ctx;
    size = size || 10;
    c.save();
    c.translate(x, y);
    if (this.facing < 0) c.scale(-1, 1);
    c.font = 'bold ' + size + 'px "Trebuchet MS", Verdana, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    if (stroke !== null && stroke !== false) {
      c.lineJoin = 'round'; c.lineWidth = Math.max(1.5, size / 4);
      c.strokeStyle = typeof stroke === 'string' ? stroke : this.outline;
      c.strokeText(String(str), 0, 0);
    }
    c.fillStyle = color || '#ffffff';
    c.fillText(String(str), 0, 0);
    c.restore();
    return this;
  };
  /** Outlined capsule (arms, legs, tails, handles). Optional quadratic control point (cx, cy). */
  P.limb = function (x1, y1, x2, y2, width, color, cx, cy) {
    const c = this.ctx;
    c.beginPath(); c.moveTo(x1, y1);
    if (cx !== undefined && cy !== undefined) c.quadraticCurveTo(cx, cy, x2, y2); else c.lineTo(x2, y2);
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.strokeStyle = this.outline; c.lineWidth = width + this.lw * 2; c.stroke();
    c.strokeStyle = color || this.pal.skin; c.lineWidth = width; c.stroke();
    c.lineCap = 'butt';
    return this;
  };
  /** Build any path with fn(ctx) and fill/stroke it (optional stroke width). */
  P.path = function (fn, fill, stroke, width) {
    const c = this.ctx; c.beginPath(); fn(c);
    return this._fs(fill, stroke, width);
  };
  /**
   * Cel-shaded fill of the path built by fn(ctx): the shape in a shadow tone, the lit tone offset toward the light
   * (up/front) and clipped, an optional highlight ellipse, then the outline.
   * o: { dx, dy, dark, light, hl: [x, y, rx, ry], stroke }
   */
  P.shaded = function (fn, base, o) {
    o = o || {};
    const c = this.ctx;
    c.beginPath(); fn(c);
    c.fillStyle = o.dark || shade(base, -0.3); c.fill();
    c.save();
    c.clip();
    c.translate(o.dx !== undefined ? o.dx : 1.3, o.dy !== undefined ? o.dy : -1.5);
    c.beginPath(); fn(c);
    c.fillStyle = base; c.fill();
    c.restore();
    if (o.hl) {
      c.beginPath(); c.ellipse(o.hl[0], o.hl[1], o.hl[2], o.hl[3], o.hl[4] || 0, 0, TAU);
      c.fillStyle = o.light || rgba(shade(base, 0.45), 0.85); c.fill();
    }
    if (o.stroke !== null && o.stroke !== false) {
      c.beginPath(); fn(c);
      c.strokeStyle = typeof o.stroke === 'string' ? o.stroke : this.outline;
      c.lineWidth = this.lw; c.lineJoin = 'round'; c.stroke();
    }
    return this;
  };
  /** Soft radial glow (no outline). */
  P.glow = function (x, y, r, color, alpha) {
    if (!(r > 0)) return this;
    const c = this.ctx;
    const gr = c.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, rgba(color, alpha === undefined ? 0.55 : alpha));
    gr.addColorStop(1, rgba(color, 0));
    c.fillStyle = gr;
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    return this;
  };
  /** n-point star / twinkle. */
  P.star = function (x, y, r, fill, stroke, points, inner) {
    const n = points || 4, ri = r * (inner || 0.4);
    const c = this.ctx; c.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / n, rr = i % 2 ? ri : r;
      if (i === 0) c.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); else c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    c.closePath();
    return this._fs(fill, stroke);
  };
  /** Heart shape centred at (x, y). */
  P.heart = function (x, y, r, fill, stroke) {
    const c = this.ctx; c.beginPath();
    c.moveTo(x, y + r * 0.9);
    c.bezierCurveTo(x - r * 1.5, y - r * 0.1, x - r * 0.8, y - r * 1.2, x, y - r * 0.45);
    c.bezierCurveTo(x + r * 0.8, y - r * 1.2, x + r * 1.5, y - r * 0.1, x, y + r * 0.9);
    c.closePath();
    return this._fs(fill, stroke);
  };
  /** Teardrop flame pointing up, base centre (x, y). */
  P.flame = function (x, y, w, h, fill, stroke, lean) {
    const c = this.ctx, l = lean || 0; c.beginPath();
    c.moveTo(x - w / 2, y);
    c.bezierCurveTo(x - w * 0.6, y - h * 0.45, x + l - w * 0.1, y - h * 0.7, x + l, y - h);
    c.bezierCurveTo(x + l + w * 0.1, y - h * 0.7, x + w * 0.6, y - h * 0.45, x + w / 2, y);
    c.quadraticCurveTo(x, y + w * 0.35, x - w / 2, y);
    c.closePath();
    return this._fs(fill, stroke);
  };
  /** Music note glyph (head at x, y). */
  P.note = function (x, y, s, fill) {
    this.ellipse(x, y, s * 0.55, s * 0.4, fill, null, -0.4);
    this.line(x + s * 0.48, y - s * 0.1, x + s * 0.48, y - s * 1.6, fill, Math.max(0.8, s * 0.22));
    this.line(x + s * 0.48, y - s * 1.6, x + s * 1.05, y - s * 1.15, fill, Math.max(0.8, s * 0.22));
    return this;
  };

  // ---- spec normalisation (cached per spec object) ------------------------------------------------------
  // Build table for humanoids: torso width/height, leg height/width, arm width, head radius.
  const BUILDS = {
    tiny: { w: 10, th: 8.5, lh: 4, lw: 3.4, aw: 3, hr: 9.4 },
    slim: { w: 11, th: 12, lh: 7.5, lw: 3.3, aw: 3, hr: 9.6 },
    normal: { w: 13.5, th: 12, lh: 7, lw: 3.9, aw: 3.5, hr: 10 },
    stocky: { w: 16.5, th: 11.5, lh: 5.5, lw: 4.7, aw: 4.3, hr: 10 },
    huge: { w: 20, th: 15, lh: 8.5, lw: 5.4, aw: 5.4, hr: 10.5 },
  };
  const DEFAULT_BOUNDS = { l: -66, r: 66, t: -96, b: 22 };
  const normCache = new WeakMap();
  const warned = new Set();

  function warnOnce(key, msg) {
    if (warned.has(key)) return;
    warned.add(key);
    DD.warn(msg);
  }
  function pickOpt(v, list, fb, label, id) {
    if (v === undefined || v === null || v === '') return fb;
    if (list.indexOf(v) >= 0) return v;
    warnOnce(label + ':' + v, 'Sprite' + (id ? ' "' + id + '"' : '') + ': unknown ' + label + ' "' + v + '" (drawn as "' + fb + '")');
    return fb;
  }
  function flagSet(arr, list, label, id) {
    const out = {};
    if (!Array.isArray(arr)) return out;
    for (let i = 0; i < arr.length; i++) {
      if (list.indexOf(arr[i]) >= 0) out[arr[i]] = true;
      else warnOnce(label + ':' + arr[i], 'Sprite' + (id ? ' "' + id + '"' : '') + ': unknown ' + label + ' "' + arr[i] + '" (ignored)');
    }
    return out;
  }

  function normalize(spec, id) {
    if (!spec || typeof spec !== 'object') spec = PLACEHOLDER_SPEC;
    let n = normCache.get(spec);
    if (n) return n;
    const pal = Object.assign({}, DEFAULT_PAL);
    const sp = spec.palette && typeof spec.palette === 'object' ? spec.palette : {};
    for (const k in sp) {
      if (validColor(sp[k])) pal[k] = sp[k];
      else warnOnce('pal:' + k + ':' + sp[k], 'Sprite' + (id ? ' "' + id + '"' : '') + ': bad palette colour ' + k + '=' + sp[k]);
    }
    const h = spec.head && typeof spec.head === 'object' ? spec.head : {};
    let base = spec.base;
    if (typeof spec.draw === 'function' && (!base || base === 'custom')) base = 'custom';
    base = pickOpt(base, OPTIONS.base, 'humanoid', 'base', id);
    if (base === 'custom' && typeof spec.draw !== 'function') base = 'humanoid';
    const aura = spec.aura && typeof spec.aura === 'object' && OPTIONS.aura.indexOf(spec.aura.kind) >= 0 ?
      { kind: spec.aura.kind, color: validColor(spec.aura.color) ? spec.aura.color : null } : null;
    if (spec.aura && !aura) warnOnce('aura:' + JSON.stringify(spec.aura), 'Sprite' + (id ? ' "' + id + '"' : '') + ': bad aura (ignored)');
    n = {
      src: spec,
      id: id || null,
      base: base,
      scale: clamp(num(spec.scale, 1), 0.2, 4),
      pal: pal,
      given: sp,
      buildName: pickOpt(spec.build, OPTIONS.build, 'normal', 'build', id),
      outfit: pickOpt(spec.outfit, OPTIONS.outfit, 'tunic', 'outfit', id),
      head: {
        size: clamp(num(h.size, 1), 0.5, 2),
        ears: pickOpt(h.ears, OPTIONS.ears, 'none', 'ears', id),
        horns: pickOpt(h.horns, OPTIONS.horns, 'none', 'horns', id),
        hair: pickOpt(h.hair, OPTIONS.hair, 'none', 'hair', id),
        beard: pickOpt(h.beard, OPTIONS.beard, 'none', 'beard', id),
        hat: pickOpt(h.hat, OPTIONS.hat, 'none', 'hat', id),
        face: pickOpt(h.face, OPTIONS.face, 'none', 'face', id),
        eyes: pickOpt(h.eyes, OPTIONS.eyes, 'normal', 'eyes', id),
        mouth: pickOpt(h.mouth, OPTIONS.mouth, 'none', 'mouth', id),
        blush: h.blush !== false,
      },
      wings: pickOpt(spec.wings, OPTIONS.wings, 'none', 'wings', id),
      tail: pickOpt(spec.tail, OPTIONS.tail, 'none', 'tail', id),
      mainhand: pickOpt(spec.mainhand, OPTIONS.mainhand, 'none', 'mainhand', id),
      offhand: pickOpt(spec.offhand, OPTIONS.offhand, 'none', 'offhand', id),
      bling: flagSet(spec.bling, OPTIONS.bling, 'bling', id),
      extras: flagSet(spec.extras, OPTIONS.extras, 'extra', id),
      aura: aura,
      shape: spec.shape && typeof spec.shape === 'object' ? spec.shape : {},
      draw: typeof spec.draw === 'function' ? spec.draw : null,
      overlay: typeof spec.overlay === 'function' ? spec.overlay : null,
      underlay: typeof spec.underlay === 'function' ? spec.underlay : null,
      // humanoid posture: > 0 hunches the shoulders and head forward (old masters), < 0 puffs the chest out
      hunch: clamp(num(spec.hunch, 0), -0.6, 1),
      hover: spec.hover,
      bounds: Object.assign({}, DEFAULT_BOUNDS, spec.bounds && typeof spec.bounds === 'object' ? spec.bounds : {}),
      portrait: spec.portrait && typeof spec.portrait === 'object' ? spec.portrait : null,
    };
    n.build = BUILDS[n.buildName];
    normCache.set(spec, n);
    return n;
  }

  function isLight(c) {
    const p = U.parseColor(c);
    return !!p && (p.r * 0.299 + p.g * 0.587 + p.b * 0.114) > 140;
  }

  // ---- heads: shared by every base that has a face ------------------------------------------------------
  // H = { x, y, r, fx } — head centre, radius and how far features sit toward the front (+x).

  function eyePositions(H) {
    const cx = H.x + H.fx, ey = H.y + H.r * 0.1, d = H.r * 0.36;
    return [{ x: cx - d, y: ey, k: 0.9 }, { x: cx + d, y: ey, k: 1 }];
  }

  function drawEyes(g, H, kind, o) {
    if (kind === 'none') return;
    const pal = g.pal, r = H.r, dark = pal.outline;
    const eyeCol = pal.eye;
    const light = isLight(eyeCol);
    if (o.lying >= 0.6 || o.dizzy) { // knocked out: X X
      const ps = eyePositions(H);
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i], s = r * 0.16;
        g.line(p.x - s, p.y - s, p.x + s, p.y + s, dark, r * 0.11);
        g.line(p.x - s, p.y + s, p.x + s, p.y - s, dark, r * 0.11);
      }
      return;
    }
    if (g.pose === 'hurt' && kind !== 'glow' && kind !== 'cyclops') { // >_<
      const ps = eyePositions(H), s = r * 0.17;
      g.ctx.beginPath();
      g.ctx.moveTo(ps[0].x - s, ps[0].y - s); g.ctx.lineTo(ps[0].x + s * 0.7, ps[0].y); g.ctx.lineTo(ps[0].x - s, ps[0].y + s);
      g.ctx.moveTo(ps[1].x + s, ps[1].y - s); g.ctx.lineTo(ps[1].x - s * 0.7, ps[1].y); g.ctx.lineTo(ps[1].x + s, ps[1].y + s);
      g.ctx.strokeStyle = dark; g.ctx.lineWidth = r * 0.11; g.ctx.lineJoin = 'round'; g.ctx.stroke();
      return;
    }
    if (kind === 'cyclops') {
      const x = H.x + H.fx * 0.7, y = H.y + r * 0.02, er = r * 0.36;
      if (g.blink) { g.arc(x, y, er * 0.8, 0.15 * Math.PI, 0.85 * Math.PI, dark, r * 0.1); return; }
      g.circle(x, y, er, '#fbf6ee', dark);
      g.circle(x + er * 0.18, y, er * 0.58, eyeCol, null);
      g.circle(x + er * 0.25, y, er * 0.28, '#140c10', null);
      g.circle(x + er * 0.05, y - er * 0.3, er * 0.16, '#ffffff', null);
      return;
    }
    const ps = eyePositions(H);
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i], k = p.k;
      if (kind === 'glow') {
        g.glow(p.x, p.y, r * 0.55 * k, eyeCol, 0.6);
        g.ellipse(p.x, p.y, r * 0.2 * k, r * 0.14 * k, eyeCol, null);
        g.ellipse(p.x + r * 0.03, p.y, r * 0.09 * k, r * 0.07 * k, '#ffffff', null);
        continue;
      }
      if (g.blink) { g.line(p.x - r * 0.17 * k, p.y + r * 0.04, p.x + r * 0.17 * k, p.y + r * 0.04, dark, r * 0.1); continue; }
      if (kind === 'sleepy') {
        const c = g.ctx, rx = r * 0.19 * k, ry = r * 0.17 * k;
        c.beginPath(); c.ellipse(p.x, p.y, rx, ry, 0, 0, Math.PI); c.closePath();
        c.fillStyle = light ? dark : eyeCol; c.fill();
        g.line(p.x - rx * 1.25, p.y - r * 0.01, p.x + rx * 1.25, p.y + r * 0.02, dark, r * 0.09);
        continue;
      }
      const big = kind === 'big';
      const rx = r * (big ? 0.22 : 0.155) * k, ry = r * (big ? 0.28 : 0.215) * k;
      if (big) {
        g.ellipse(p.x, p.y, rx, ry, dark, null);
        g.ellipse(p.x + rx * 0.1, p.y + ry * 0.12, rx * 0.72, ry * 0.7, light ? eyeCol : shade(eyeCol, 0.35), null);
        g.ellipse(p.x + rx * 0.14, p.y + ry * 0.18, rx * 0.36, ry * 0.36, '#120a0e', null);
        g.circle(p.x + rx * 0.35, p.y - ry * 0.4, rx * 0.36, '#ffffff', null);
        g.circle(p.x - rx * 0.3, p.y + ry * 0.35, rx * 0.16, '#ffffff', null);
      } else {
        g.ellipse(p.x, p.y, rx, ry, light ? '#1a1014' : eyeCol, null);
        if (light) g.ellipse(p.x + rx * 0.15, p.y + ry * 0.05, rx * 0.75, ry * 0.7, eyeCol, null);
        if (light) g.circle(p.x + rx * 0.25, p.y + ry * 0.1, rx * 0.38, '#1a1014', null);
        g.circle(p.x + rx * 0.3, p.y - ry * 0.38, Math.max(0.45, rx * 0.4), '#ffffff', null);
      }
      if (kind === 'angry') {
        const dir = i === 0 ? 1 : -1; // brows slope down toward the nose
        g.line(p.x - dir * r * 0.24, p.y - r * 0.4, p.x + dir * r * 0.14, p.y - r * 0.24, dark, r * 0.12);
      }
    }
  }

  function drawMouth(g, H, kind, o, gold) {
    const pal = g.pal, r = H.r, dark = pal.outline;
    const mx = H.x + H.fx + r * 0.05, my = H.y + r * 0.5;
    const lw = Math.max(0.9, r * 0.1);
    if (g.pose === 'hurt' || o.lying >= 0.6) kind = kind === 'tusks' ? 'tusks' : 'open';
    if (gold && (kind === 'none' || kind === 'smile')) kind = 'grin';
    const teeth = gold || kind === 'gold_teeth' ? pal.metal : '#fbf6ee';
    switch (kind) {
      case 'smile':
        g.arc(mx, my - r * 0.14, r * 0.22, 0.18 * Math.PI, 0.82 * Math.PI, dark, lw);
        break;
      case 'grin': case 'gold_teeth': {
        const c = g.ctx, w = r * 0.32;
        c.beginPath(); c.moveTo(mx - w, my - r * 0.07);
        c.quadraticCurveTo(mx, my + r * 0.45, mx + w, my - r * 0.07); c.closePath();
        c.fillStyle = '#3a0f17'; c.fill();
        c.save(); c.clip();
        c.fillStyle = teeth; c.fillRect(mx - w, my - r * 0.1, w * 2, r * 0.14);
        c.restore();
        c.beginPath(); c.moveTo(mx - w, my - r * 0.07);
        c.quadraticCurveTo(mx, my + r * 0.45, mx + w, my - r * 0.07); c.closePath();
        c.strokeStyle = dark; c.lineWidth = lw; c.stroke();
        if (teeth === pal.metal) g.star(mx + w * 0.45, my - r * 0.02, r * 0.14, '#fffbe0', null);
        break;
      }
      case 'fangs':
        g.arc(mx, my - r * 0.16, r * 0.24, 0.15 * Math.PI, 0.85 * Math.PI, dark, lw);
        g.poly([[mx - r * 0.2, my + r * 0.02], [mx - r * 0.06, my + r * 0.04], [mx - r * 0.14, my + r * 0.28]], '#fbf6ee', dark, lw * 0.7);
        g.poly([[mx + r * 0.06, my + r * 0.04], [mx + r * 0.2, my + r * 0.02], [mx + r * 0.14, my + r * 0.28]], '#fbf6ee', dark, lw * 0.7);
        break;
      case 'tusks':
        g.arc(mx, my - r * 0.12, r * 0.24, 0.2 * Math.PI, 0.8 * Math.PI, dark, lw);
        g.poly([[mx - r * 0.36, my + r * 0.14], [mx - r * 0.2, my + r * 0.12], [mx - r * 0.33, my - r * 0.24]], '#f3ead2', dark, lw * 0.7);
        g.poly([[mx + r * 0.2, my + r * 0.12], [mx + r * 0.36, my + r * 0.14], [mx + r * 0.33, my - r * 0.24]], '#f3ead2', dark, lw * 0.7);
        break;
      case 'frown':
        g.arc(mx, my + r * 0.2, r * 0.2, 1.2 * Math.PI, 1.8 * Math.PI, dark, lw);
        break;
      case 'open':
        g.ellipse(mx, my + r * 0.04, r * 0.15, r * 0.19, '#3a0f17', dark);
        g.ellipse(mx, my + r * 0.13, r * 0.09, r * 0.06, '#e56b7b', null);
        break;
      default:
        break;
    }
  }

  function drawBlush(g, H) {
    const c = g.pal.blush || '#ff6b6b';
    g.ellipse(H.x + H.fx + H.r * 0.62, H.y + H.r * 0.36, H.r * 0.16, H.r * 0.09, rgba(c, 0.32), null);
    g.ellipse(H.x + H.fx - H.r * 0.62, H.y + H.r * 0.36, H.r * 0.14, H.r * 0.08, rgba(c, 0.26), null);
  }


  function drawEars(g, H, kind, front, t) {
    if (kind === 'none') return;
    const pal = g.pal, r = H.r, x = H.x, y = H.y;
    const col = pal.ear || pal.skin, inner = pal.inner || '#f4a3b5';
    const twitch = Math.sin(t * 1.3) > 0.97 ? 0.12 : 0;
    function leaf(side, len, up, wide, k) { // pointed side ear
      const bx = x + side * r * 0.86, by = y + r * 0.05;
      const tx = x + side * r * (0.9 + len), ty = y - r * up;
      g.poly([[bx, by - r * wide * k], [tx, ty], [bx + side * r * 0.08, by + r * wide]], col);
      g.line(bx + side * r * 0.12, by, lerp(bx, tx, 0.65), lerp(by, ty, 0.65), shade(col, -0.25), r * 0.08);
    }
    switch (kind) {
      case 'elf':
        if (!front) { leaf(-1, 0.95, 0.75, 0.22, 1); leaf(1, 0.85, 0.7, 0.2, 1); }
        break;
      case 'pointy':
        if (!front) { leaf(-1, 0.45, 0.32, 0.2, 1); leaf(1, 0.42, 0.3, 0.2, 1); }
        break;
      case 'goblin':
        if (!front) {
          for (let s = -1; s <= 1; s += 2) {
            const bx = x + s * r * 0.8, tx = x + s * r * 2.05, ty = y + r * 0.05 + twitch * r;
            g.poly([[bx, y - r * 0.35], [tx, ty], [bx, y + r * 0.35]], col);
            g.poly([[bx + s * r * 0.1, y - r * 0.18], [lerp(bx, tx, 0.75), lerp(y, ty, 0.75)], [bx + s * r * 0.1, y + r * 0.18]], rgba(inner, 0.7), null);
          }
        }
        break;
      case 'rabbit': case 'rabbit_floppy': {
        if (!front) {
          g.ellipse(x - r * 0.38, y - r * 1.45, r * 0.3, r * 0.82, col, undefined, -0.18 - twitch);
          g.ellipse(x - r * 0.38, y - r * 1.42, r * 0.14, r * 0.6, inner, null, -0.18 - twitch);
          if (kind === 'rabbit') {
            g.ellipse(x + r * 0.22, y - r * 1.5, r * 0.3, r * 0.86, col, undefined, 0.12);
            g.ellipse(x + r * 0.22, y - r * 1.47, r * 0.14, r * 0.62, inner, null, 0.12);
          }
        } else if (kind === 'rabbit_floppy') { // rises from the crown, folds over and hangs past the front of the face
          const c = g.ctx;
          const sway = Math.sin(t * 2.1) * r * 0.06;
          c.beginPath();
          c.moveTo(x - r * 0.05, y - r * 0.8);
          c.bezierCurveTo(x - r * 0.1, y - r * 1.65, x + r * 1.0, y - r * 1.8, x + r * 1.42 + sway, y - r * 0.9);
          c.quadraticCurveTo(x + r * 1.8 + sway, y + r * 0.1, x + r * 1.5 + sway, y + r * 0.35);
          c.quadraticCurveTo(x + r * 1.1 + sway, y - r * 0.1, x + r * 1.02 + sway, y - r * 0.82);
          c.bezierCurveTo(x + r * 0.85, y - r * 1.3, x + r * 0.4, y - r * 1.25, x + r * 0.42, y - r * 0.78);
          c.closePath();
          c.fillStyle = col; c.fill(); c.strokeStyle = g.outline; c.lineWidth = g.lw; c.lineJoin = 'round'; c.stroke();
          c.beginPath();
          c.moveTo(x + r * 0.2, y - r * 1.0);
          c.bezierCurveTo(x + r * 0.2, y - r * 1.45, x + r * 0.95, y - r * 1.55, x + r * 1.3 + sway, y - r * 0.6);
          c.strokeStyle = inner; c.lineWidth = r * 0.12; c.lineCap = 'round'; c.stroke(); c.lineCap = 'butt';
        }
        break;
      }
      case 'cat':
        if (!front) {
          for (let s = -1; s <= 1; s += 2) {
            const a = -Math.PI / 2 + s * 0.62, bx = x + Math.cos(a) * r * 0.8, by = y + Math.sin(a) * r * 0.8;
            const tx = x + Math.cos(a) * r * 1.7, ty = y + Math.sin(a) * r * 1.7 - (s > 0 ? twitch * r : 0);
            const px = -Math.sin(a) * r * 0.42, py = Math.cos(a) * r * 0.42;
            g.poly([[bx - px, by - py], [tx, ty], [bx + px, by + py]], col);
            g.poly([[bx - px * 0.5, by - py * 0.5], [lerp(bx, tx, 0.7), lerp(by, ty, 0.7)], [bx + px * 0.5, by + py * 0.5]], inner, null);
          }
        }
        break;
      case 'dog':
        if (front) {
          const flop = Math.sin(t * 2.4) * 0.06;
          g.ellipse(x - r * 0.9, y + r * 0.08, r * 0.3, r * 0.62, pal.ear || pal.hair, undefined, 0.32 + flop);
          g.ellipse(x + r * 0.95, y + r * 0.1, r * 0.28, r * 0.58, pal.ear || pal.hair, undefined, -0.3 - flop);
        }
        break;
      case 'bear':
        if (!front) {
          for (let s = -1; s <= 1; s += 2) {
            const a = -Math.PI / 2 + s * 0.75, ex = x + Math.cos(a) * r * 0.9, ey = y + Math.sin(a) * r * 0.9;
            g.circle(ex, ey, r * 0.34, col);
            g.circle(ex, ey, r * 0.17, inner, null);
          }
        }
        break;
      case 'rat':
        if (!front) {
          for (let s = -1; s <= 1; s += 2) {
            const a = -Math.PI / 2 + s * 0.9, ex = x + Math.cos(a) * r * 1.0, ey = y + Math.sin(a) * r * 1.0;
            g.circle(ex, ey, r * 0.46, col);
            g.circle(ex, ey + r * 0.03, r * 0.28, inner, null);
          }
        }
        break;
      default:
        break;
    }
  }

  /** Tapered curved horn along a quadratic (x0,y0) -> (x1,y1) with control (cx,cy), base width w. */
  function taperHorn(g, x0, y0, cx, cy, x1, y1, w, col, ridges) {
    const N = 10, L = [], R = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N, it = 1 - t;
      const px = it * it * x0 + 2 * it * t * cx + t * t * x1, py = it * it * y0 + 2 * it * t * cy + t * t * y1;
      const dx = 2 * it * (cx - x0) + 2 * t * (x1 - cx), dy = 2 * it * (cy - y0) + 2 * t * (y1 - cy);
      const len = Math.hypot(dx, dy) || 1, hw = (w / 2) * (1 - t * 0.92);
      L.push([px - (dy / len) * hw, py + (dx / len) * hw]);
      R.push([px + (dy / len) * hw, py - (dx / len) * hw]);
    }
    g.poly(L.concat(R.reverse()), col);
    // R was reversed in place: R[N - i] is now the right edge point i. Ridges = short inset bands.
    if (ridges) {
      const dk = isLight(col) ? rgba(shade(col, -0.35), 0.8) : rgba(shade(col, 0.35), 0.75);
      for (let i = 3; i < N - 1; i += 2) {
        const a = L[i], b = R[N - i];
        g.line(lerp(a[0], b[0], 0.22), lerp(a[1], b[1], 0.22), lerp(a[0], b[0], 0.78), lerp(a[1], b[1], 0.78), dk, Math.max(0.5, w * 0.09));
      }
    }
    const h0 = L[1], h1 = L[6];
    g.line(lerp(h0[0], R[N - 1][0], 0.3), lerp(h0[1], R[N - 1][1], 0.3), lerp(h1[0], R[N - 6][0], 0.3), lerp(h1[1], R[N - 6][1], 0.3),
      rgba(shade(col, 0.55), 0.75), Math.max(0.6, w * 0.14));
  }

  function hornColor(pal, kind) {
    if (pal.horn) return pal.horn;
    return { tiefling: '#5d4656', ram: '#d9c8a4', demon: '#4a3340', antlers: '#9b7048', unicorn: '#f4e3a1' }[kind] || '#d9c8a4';
  }

  function drawHorns(g, H, kind) {
    if (kind === 'none') return;
    const r = H.r, x = H.x, y = H.y, col = hornColor(g.pal, kind);
    switch (kind) {
      case 'tiefling':
        taperHorn(g, x - r * 0.45, y - r * 0.7, x - r * 0.85, y - r * 1.6, x - r * 1.5, y - r * 1.15, r * 0.48, shade(col, -0.15), true);
        taperHorn(g, x + r * 0.3, y - r * 0.8, x + r * 0.2, y - r * 1.85, x - r * 0.75, y - r * 1.75, r * 0.54, col, true);
        break;
      case 'demon':
        taperHorn(g, x - r * 0.55, y - r * 0.68, x - r * 1.45, y - r * 0.95, x - r * 1.1, y - r * 2.15, r * 0.56, shade(col, -0.1), true);
        taperHorn(g, x + r * 0.5, y - r * 0.72, x + r * 1.4, y - r * 1.0, x + r * 1.05, y - r * 2.2, r * 0.56, col, true);
        break;
      case 'ram':
        for (let s = -1; s <= 1; s += 2) {
          const cx = x + s * r * 0.82, cy = y - r * 0.28, c = g.ctx;
          c.beginPath(); c.arc(cx, cy, r * 0.42, s > 0 ? -2.6 : -0.54, s > 0 ? 1.6 : 3.74, s < 0);
          c.lineCap = 'round';
          c.strokeStyle = g.outline; c.lineWidth = r * 0.36 + g.lw * 2; c.stroke();
          c.strokeStyle = s > 0 ? col : shade(col, -0.12); c.lineWidth = r * 0.36; c.stroke();
          c.strokeStyle = shade(col, -0.3); c.lineWidth = Math.max(0.6, r * 0.06);
          for (let i = 0; i < 4; i++) {
            const a = (s > 0 ? -2.2 : -0.9) + s * i * 0.85, ex = cx + Math.cos(a) * r * 0.42, ey = cy + Math.sin(a) * r * 0.42;
            c.beginPath(); c.moveTo(ex - Math.cos(a) * r * 0.15, ey - Math.sin(a) * r * 0.15); c.lineTo(ex + Math.cos(a) * r * 0.15, ey + Math.sin(a) * r * 0.15); c.stroke();
          }
          c.lineCap = 'butt';
        }
        break;
      case 'antlers':
        for (let s = -1; s <= 1; s += 2) {
          const bx = x + s * r * 0.42, by = y - r * 0.8, tx = x + s * r * 1.05, ty = y - r * 1.9;
          const w = Math.max(1.2, r * 0.17), c2 = s > 0 ? col : shade(col, -0.12);
          g.limb(bx, by, tx, ty, w, c2, x + s * r * 1.1, y - r * 1.15);
          g.limb(x + s * r * 0.9, y - r * 1.32, x + s * r * 1.45, y - r * 1.52, w * 0.85, c2);
          g.limb(x + s * r * 0.92, y - r * 1.62, x + s * r * 0.62, y - r * 2.0, w * 0.8, c2);
        }
        break;
      case 'unicorn': {
        const bx = x + r * 0.32, by = y - r * 0.82, tx = x + r * 0.78, ty = y - r * 2.2;
        g.poly([[bx - r * 0.3, by + r * 0.08], [tx, ty], [bx + r * 0.32, by - r * 0.06]], col);
        for (let i = 1; i <= 3; i++) {
          const t1 = i / 4.2;
          g.line(lerp(bx - r * 0.2, tx, t1), lerp(by + r * 0.05, ty, t1), lerp(bx + r * 0.22, tx, t1 + 0.08), lerp(by - r * 0.04, ty, t1 + 0.08), shade(col, -0.3), Math.max(0.6, r * 0.07));
        }
        break;
      }
      default:
        break;
    }
  }

  // ---- hair -------------------------------------------------------------------------------------------
  function hairCapPath(c, H, spiky) {
    const x = H.x, y = H.y, r = H.r;
    c.moveTo(x - r * 1.05, y + r * 0.22);
    c.arc(x, y, r * 1.07, Math.PI * 0.93, Math.PI * 1.94);
    const k = spiky ? 1.6 : 1;
    c.lineTo(x + r * 0.66, y - r * (0.38 + 0.06 * k));
    c.lineTo(x + r * 0.5, y - r * (0.18 - 0.08 * (k - 1)));
    c.lineTo(x + r * 0.26, y - r * (0.46 + 0.08 * k));
    c.lineTo(x + r * 0.02, y - r * (0.16 - 0.08 * (k - 1)));
    c.lineTo(x - r * 0.28, y - r * (0.44 + 0.08 * k));
    c.lineTo(x - r * 0.5, y - r * 0.06);
    c.lineTo(x - r * 0.78, y + r * 0.42);
    c.closePath();
  }

  function drawHairBack(g, H, kind, t) {
    const pal = g.pal, x = H.x, y = H.y, r = H.r, col = pal.hair, dk = shade(col, -0.22);
    switch (kind) {
      case 'long': {
        const sway = Math.sin(t * 1.6) * r * 0.04;
        g.path(function (c) { // falls down the back, past the shoulders; narrow at the front so the face stays clear
          c.moveTo(x - r * 0.9, y - r * 0.6);
          c.quadraticCurveTo(x - r * 1.45, y + r * 0.55, x - r * 1.25 + sway, y + r * 1.65);
          c.quadraticCurveTo(x - r * 0.8, y + r * 1.85, x - r * 0.3, y + r * 1.45);
          c.quadraticCurveTo(x + r * 0.35, y + r * 1.15, x + r * 0.75, y + r * 0.9);
          c.quadraticCurveTo(x + r * 1.05, y + r * 0.3, x + r * 0.85, y - r * 0.5);
          c.closePath();
        }, dk);
        break;
      }
      case 'wild': {
        const cx = x - r * 0.12, cy = y - r * 0.05, N = 13;
        g.path(function (c) {
          for (let i = 0; i <= N; i++) {
            const a = Math.PI * 0.75 + (i / N) * Math.PI * 1.55;
            const rr = r * (i % 2 ? 1.18 : 1.6 + Math.sin(t * 2 + i) * 0.03);
            if (i === 0) c.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); else c.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
          }
          c.lineTo(cx + r * 0.2, cy + r * 1.2);
          c.closePath();
        }, dk);
        break;
      }
      case 'bun':
        g.circle(x - r * 0.48, y - r * 1.0, r * 0.45, col);
        g.arc(x - r * 0.48, y - r * 1.0, r * 0.26, 3.6, 5.4, dk, Math.max(0.7, r * 0.07));
        break;
      case 'ponytail': {
        const sw = Math.sin(t * 2.2) * r * 0.12;
        g.limb(x - r * 0.95, y - r * 0.55, x - r * 1.55 + sw, y + r * 1.1, r * 0.48, col, x - r * 1.85, y - r * 0.1);
        g.circle(x - r * 0.98, y - r * 0.52, r * 0.2, pal.accent);
        break;
      }
      case 'braids':
        for (let s = -1; s <= 1; s += 2) {
          const bx = x + s * r * 0.88;
          for (let i = 0; i < 4; i++) g.ellipse(bx + s * r * 0.04 * i, y + r * (0.35 + i * 0.36), r * 0.22, r * 0.21, i % 2 ? col : dk);
          g.circle(bx + s * r * 0.16, y + r * 1.78, r * 0.13, pal.accent);
        }
        break;
      default:
        break;
    }
  }

  function drawHairFront(g, H, kind, covered, t) {
    const pal = g.pal, x = H.x, y = H.y, r = H.r, col = pal.hair, hl = rgba(shade(col, 0.4), 0.8);
    if (kind === 'none') {
      g.ellipse(x - r * 0.1, y - r * 0.62, r * 0.32, r * 0.12, rgba('#ffffff', 0.35), null, -0.35); // bald shine
      return;
    }
    if (kind === 'mohawk') {
      g.arc(x, y + r * 0.02, r * 0.98, Math.PI * 1.12, Math.PI * 1.88, rgba(col, 0.35), r * 0.14);
      if (covered) return;
      g.path(function (c) { // crest of swept-back spikes along the top of the skull
        const N = 5, a0 = -Math.PI / 2 + 0.75, a1 = -Math.PI / 2 - 0.85;
        c.moveTo(x + Math.cos(a0) * r * 0.92, y + Math.sin(a0) * r * 0.92);
        for (let i = 0; i < N; i++) {
          const k0 = i / N, k1 = (i + 1) / N, am = lerp(a0, a1, (k0 + k1) / 2), ae = lerp(a0, a1, k1);
          const tip = r * (1.55 + (i === 1 || i === 2 ? 0.2 : 0));
          c.lineTo(x + Math.cos(am - 0.22) * tip, y + Math.sin(am - 0.22) * tip);
          c.lineTo(x + Math.cos(ae) * r * 0.95, y + Math.sin(ae) * r * 0.95);
        }
        c.closePath();
      }, col);
      return;
    }
    g.shaded(function (c) { hairCapPath(c, H, kind === 'wild'); }, col, { dx: r * 0.12, dy: -r * 0.12 });
    g.arc(x - r * 0.05, y - r * 0.1, r * 0.82, Math.PI * 1.3, Math.PI * 1.6, hl, Math.max(0.8, r * 0.1));
    if (kind === 'long' && !covered) {
      g.path(function (c) { // lock framing the face, outside the eyes
        c.moveTo(x + r * 0.78, y - r * 0.62);
        c.quadraticCurveTo(x + r * 1.3, y + r * 0.1, x + r * 1.12, y + r * 1.1);
        c.lineTo(x + r * 0.92, y + r * 0.72);
        c.quadraticCurveTo(x + r * 1.0, y + r * 0.0, x + r * 0.7, y - r * 0.4);
        c.closePath();
      }, col);
    }
    if (kind === 'wild') {
      g.poly([[x + r * 0.55, y - r * 0.72], [x + r * 1.25, y - r * 0.95], [x + r * 0.95, y - r * 0.4]], col);
    }
  }

  // ---- beards -----------------------------------------------------------------------------------------
  function drawBeard(g, H, kind, part) {
    if (kind === 'none') return;
    const pal = g.pal, x = H.x, y = H.y, r = H.r, col = pal.beard || pal.hair, cx = x + H.fx * 0.7;
    if (kind === 'tentacles') { // face tentacles (mind flayers, squid folk): wiggle, drawn over the mouth
      if (part !== 'mass') return;
      const tc = pal.beard || shade(pal.skin, -0.12), t = g.t;
      for (let i = 0; i < 4; i++) {
        const bx = cx + (i - 1.5) * r * 0.26, w = Math.sin(t * 3 + i * 1.7) * r * 0.25;
        const len = r * (i === 1 || i === 2 ? 1.25 : 0.95);
        g.limb(bx, y + r * 0.35, bx + w + (i - 1.5) * r * 0.12, y + r * 0.35 + len, Math.max(1, r * 0.17), tc, bx - w, y + r * 0.35 + len * 0.55);
      }
      return;
    }
    if (kind === 'stubble') {
      if (part !== 'mass') return;
      const c = g.ctx;
      c.save();
      c.beginPath(); c.ellipse(x, y, r * 1.03, r * 0.96, 0, 0, TAU); c.clip();
      c.beginPath(); c.ellipse(cx, y + r * 0.74, r * 0.88, r * 0.46, 0, 0, TAU);
      c.fillStyle = rgba(shade(col, -0.35), 0.3); c.fill();
      c.fillStyle = rgba(shade(col, -0.45), 0.55);
      for (let i = 0; i < 9; i++) {
        const px = cx + (hash01(i, 41) - 0.5) * r * 1.3, py = y + r * (0.55 + hash01(i, 42) * 0.38);
        c.fillRect(px, py, r * 0.07, r * 0.07);
      }
      c.restore();
      return;
    }
    if (part === 'mass') {
      const len = kind === 'short' ? 1.12 : kind === 'long' ? 2.05 : 2.3;
      if (kind === 'wild') { // big bushy fan: wide at the jaw, scalloped, down onto the chest
        g.path(function (c) {
          const N = 9;
          c.moveTo(x - r * 0.98, y - r * 0.02);
          for (let i = 0; i <= N; i++) {
            const a = Math.PI * (1.0 - i / N), rr = r * (i % 2 ? 1.12 : 1.36);
            c.lineTo(cx + Math.cos(a) * rr * 0.98, y + r * 0.42 + Math.sin(a) * rr * 1.05);
          }
          c.lineTo(x + r * 1.0, y - r * 0.02);
          c.quadraticCurveTo(cx, y + r * 0.62, x - r * 0.98, y - r * 0.02);
          c.closePath();
        }, col);
        g.arc(cx - r * 0.25, y + r * 0.95, r * 0.45, 0.6, 2.2, rgba(shade(col, -0.35), 0.8), Math.max(0.7, r * 0.08));
        g.arc(cx + r * 0.3, y + r * 1.2, r * 0.35, 0.4, 2.0, rgba(shade(col, -0.35), 0.8), Math.max(0.7, r * 0.08));
        return;
      }
      g.path(function (c) {
        c.moveTo(x - r * 0.98, y + r * 0.0);
        c.quadraticCurveTo(x - r * 0.95, y + r * len * 0.75, cx, y + r * len);
        c.quadraticCurveTo(x + r * 1.0, y + r * len * 0.7, x + r * 0.99, y + r * 0.05);
        c.quadraticCurveTo(cx + r * 0.1, y + r * 0.78, x - r * 0.98, y + r * 0.0);
        c.closePath();
      }, col);
      if (kind === 'long') g.line(cx, y + r * 0.95, cx + r * 0.05, y + r * 1.75, shade(col, -0.3), Math.max(0.6, r * 0.07));
      return;
    }
    // mustache
    const mx = x + H.fx + r * 0.05, my = y + r * 0.4;
    g.path(function (c) {
      c.moveTo(mx, my - r * 0.06);
      c.quadraticCurveTo(mx - r * 0.3, my - r * 0.22, mx - r * 0.5, my + r * 0.12);
      c.quadraticCurveTo(mx - r * 0.25, my + r * 0.06, mx, my + r * 0.08);
      c.quadraticCurveTo(mx + r * 0.25, my + r * 0.06, mx + r * 0.5, my + r * 0.12);
      c.quadraticCurveTo(mx + r * 0.3, my - r * 0.22, mx, my - r * 0.06);
      c.closePath();
    }, shade(col, -0.1), undefined, g.lw * 0.6);
  }

  // ---- hats ------------------------------------------------------------------------------------------
  const COVERING_HATS = { wizard: 1, hood: 1, tophat: 1, plague: 1, helmet: 1, viking: 1, mortarboard: 1, cowl: 1, beret: 1, mushroom: 1 };
  function hatColor(pal, kind) {
    if (pal.hat) return pal.hat;
    return { wizard: pal.cloth, hood: pal.cloth, cowl: pal.cloth, tophat: '#2b2730', plague: '#2a2228', helmet: pal.metal, viking: pal.metal,
      beret: pal.cloth2, bandana: pal.accent, mortarboard: '#24202a', crown: pal.metal }[kind] || pal.cloth;
  }
  function hatTopY(H, kind) {
    const k = { wizard: 1.45, tophat: 2.1, plague: 1.42, helmet: 1.12, viking: 1.12, hood: 1.2, cowl: 1.12, beret: 1.25, mortarboard: 1.36, crown: 1.55, mushroom: 1.85 }[kind];
    return H.y - H.r * (k || 0.98);
  }

  function drawCrown(g, x, y, w, h, metal, gem) {
    g.path(function (c) {
      c.moveTo(x - w / 2, y);
      c.lineTo(x - w / 2, y - h * 0.55); c.lineTo(x - w * 0.27, y - h * 0.3);
      c.lineTo(x, y - h); c.lineTo(x + w * 0.27, y - h * 0.3);
      c.lineTo(x + w / 2, y - h * 0.55); c.lineTo(x + w / 2, y);
      c.closePath();
    }, metal);
    g.rect(x - w / 2, y - h * 0.22, w, h * 0.22, shade(metal, -0.18), null);
    g.circle(x, y - h * 0.11, h * 0.13, gem, null);
    g.circle(x, y - h, h * 0.12, '#fff5c0', null);
    g.circle(x - w / 2, y - h * 0.55, h * 0.1, '#fff5c0', null);
    g.circle(x + w / 2, y - h * 0.55, h * 0.1, '#fff5c0', null);
  }

  function drawHat(g, H, kind, pass, t) {
    if (kind === 'none') return;
    const pal = g.pal, x = H.x, y = H.y, r = H.r, col = hatColor(pal, kind);
    if (pass === 'back') {
      if (kind === 'hood') {
        g.path(function (c) {
          c.moveTo(x - r * 0.55, y - r * 0.95);
          c.quadraticCurveTo(x - r * 1.35, y - r * 1.5, x - r * 1.75, y - r * 1.1);
          c.quadraticCurveTo(x - r * 1.35, y - r * 0.55, x - r * 1.1, y - r * 0.05);
          c.closePath();
        }, shade(col, -0.12));
        g.circle(x - r * 0.06, y + r * 0.02, r * 1.2, shade(col, -0.12));
      } else if (kind === 'cowl') {
        g.circle(x - r * 0.04, y + r * 0.05, r * 1.16, shade(col, -0.12));
      }
      return;
    }
    if (pass === 'neck') {
      if (kind === 'cowl' && H.bw) {
        const w = H.bw * 0.62 + 2, sy = H.sy;
        g.shaded(function (c) {
          c.moveTo(x - w, sy + 4.5);
          c.quadraticCurveTo(x - w * 1.05, sy - 2.5, x, sy - 3);
          c.quadraticCurveTo(x + w * 1.05, sy - 2.5, x + w, sy + 4.5);
          c.quadraticCurveTo(x, sy + 7, x - w, sy + 4.5);
          c.closePath();
        }, col);
      }
      return;
    }
    switch (kind) {
      case 'wizard': {
        const sway = Math.sin(t * 1.4) * r * 0.1;
        g.ellipse(x - r * 0.05, y - r * 0.6, r * 1.5, r * 0.36, shade(col, -0.12));
        g.shaded(function (c) {
          c.moveTo(x - r * 0.88, y - r * 0.68);
          c.quadraticCurveTo(x - r * 0.42, y - r * 1.55, x - r * 0.65 + sway, y - r * 2.7);
          c.quadraticCurveTo(x + r * 0.42, y - r * 1.5, x + r * 0.86, y - r * 0.7);
          c.quadraticCurveTo(x, y - r * 0.5, x - r * 0.88, y - r * 0.68);
          c.closePath();
        }, col, { dx: r * 0.12, dy: -r * 0.05 });
        g.path(function (c) {
          c.moveTo(x - r * 0.84, y - r * 0.72); c.quadraticCurveTo(x, y - r * 0.55, x + r * 0.84, y - r * 0.74);
          c.lineTo(x + r * 0.74, y - r * 0.98); c.quadraticCurveTo(x, y - r * 0.82, x - r * 0.72, y - r * 0.98);
          c.closePath();
        }, pal.accent);
        g.star(x - r * 0.12, y - r * 1.5, r * 0.26, pal.cloth2 === col ? pal.accent : pal.cloth2, null, 5, 0.45);
        break;
      }
      case 'tophat':
        g.ellipse(x, y - r * 0.72, r * 1.2, r * 0.28, shade(col, -0.1));
        g.shaded(function (c) { roundRect(c, x - r * 0.68, y - r * 2.1, r * 1.36, r * 1.42, r * 0.12); }, col, { dx: r * 0.15, dy: 0 });
        g.rect(x - r * 0.68, y - r * 1.02, r * 1.36, r * 0.26, pal.accent);
        g.ellipse(x, y - r * 2.08, r * 0.68, r * 0.16, shade(col, 0.12));
        break;
      case 'plague':
        g.ellipse(x, y - r * 0.55, r * 1.78, r * 0.44, shade(col, -0.06));
        g.shaded(function (c) { roundRect(c, x - r * 0.74, y - r * 1.42, r * 1.48, r * 0.92, r * 0.25); }, col, { dx: r * 0.12, dy: -r * 0.05 });
        g.rect(x - r * 0.74, y - r * 0.82, r * 1.48, r * 0.22, pal.cloth2 !== col ? pal.cloth2 : shade(col, 0.25));
        g.ctx.beginPath(); g.ctx.ellipse(x, y - r * 0.55, r * 1.5, r * 0.3, 0, 0.35, 2.8);
        g.ctx.strokeStyle = rgba(shade(col, 0.45), 0.55); g.ctx.lineWidth = Math.max(0.7, r * 0.07); g.ctx.stroke();
        break;
      case 'helmet': case 'viking': {
        if (kind === 'viking') {
          const bone = '#efe3c8';
          taperHorn(g, x - r * 0.85, y - r * 0.5, x - r * 1.75, y - r * 0.6, x - r * 1.55, y - r * 1.55, r * 0.42, shade(bone, -0.1), false);
          taperHorn(g, x + r * 0.85, y - r * 0.5, x + r * 1.75, y - r * 0.6, x + r * 1.55, y - r * 1.55, r * 0.42, bone, false);
        }
        g.shaded(function (c) {
          c.arc(x, y - r * 0.2, r * 1.1, Math.PI * 1.0, Math.PI * 2.0);
          c.closePath();
        }, col, { dx: r * 0.15, dy: -r * 0.12, hl: [x + r * 0.3, y - r * 0.95, r * 0.3, r * 0.13, -0.4] });
        g.rect(x - r * 1.14, y - r * 0.42, r * 2.28, r * 0.3, shade(col, -0.2), undefined, r * 0.1);
        for (let i = -2; i <= 2; i++) g.circle(x + i * r * 0.45, y - r * 0.27, r * 0.06, shade(col, 0.4), null);
        if (kind === 'helmet') g.rect(x + H.fx + r * 0.0, y - r * 0.44, r * 0.14, r * 0.42, shade(col, -0.05), undefined, r * 0.05);
        break;
      }
      case 'beret':
        g.shaded(function (c) { c.ellipse(x - r * 0.18, y - r * 0.85, r * 1.1, r * 0.44, -0.2, 0, TAU); }, col, { dx: r * 0.1, dy: -r * 0.1 });
        g.circle(x - r * 0.12, y - r * 1.27, r * 0.12, shade(col, -0.15));
        break;
      case 'flowers': {
        const cols = [pal.accent, '#ff8ab3', '#fff3a8', '#b48cff', '#ffb36b', '#ff8ab3'];
        for (let i = 0; i < 7; i++) {
          const a = Math.PI * (1.12 + i * 0.127), fxp = x + Math.cos(a) * r * 1.0, fyp = y - r * 0.05 + Math.sin(a) * r * 1.0;
          g.ellipse(fxp + r * 0.12, fyp + r * 0.06, r * 0.18, r * 0.09, '#5fae4a', null, a);
        }
        for (let i = 0; i < 6; i++) {
          const a = Math.PI * (1.15 + i * 0.14), fxp = x + Math.cos(a) * r * 1.0, fyp = y - r * 0.05 + Math.sin(a) * r * 1.0;
          const pc = cols[i % cols.length], pr = r * 0.15;
          for (let k = 0; k < 5; k++) {
            const pa = k * TAU / 5 + i;
            g.circle(fxp + Math.cos(pa) * pr * 0.9, fyp + Math.sin(pa) * pr * 0.9, pr * 0.72, pc, g.outline);
          }
          g.circle(fxp, fyp, pr * 0.55, '#ffd23f', null);
        }
        break;
      }
      case 'bandana': {
        const c = g.ctx;
        c.beginPath(); c.arc(x, y + r * 0.06, r * 0.98, Math.PI * 1.06, Math.PI * 1.94);
        c.lineCap = 'round';
        c.strokeStyle = g.outline; c.lineWidth = r * 0.42 + g.lw * 2; c.stroke();
        c.strokeStyle = col; c.lineWidth = r * 0.42; c.stroke();
        c.lineCap = 'butt';
        const fl = Math.sin(t * 5) * r * 0.08;
        g.poly([[x - r * 0.95, y - r * 0.38], [x - r * 1.7, y - r * 0.55 + fl], [x - r * 1.55, y - r * 0.15]], col);
        g.poly([[x - r * 0.95, y - r * 0.3], [x - r * 1.55, y + r * 0.1 - fl], [x - r * 1.25, y + r * 0.25]], shade(col, -0.15));
        g.circle(x - r * 0.95, y - r * 0.33, r * 0.17, shade(col, -0.1));
        g.circle(x + r * 0.15, y - r * 0.92, r * 0.07, rgba('#ffffff', 0.85), null);
        g.circle(x + r * 0.55, y - r * 0.78, r * 0.07, rgba('#ffffff', 0.85), null);
        break;
      }
      case 'mortarboard':
        g.path(function (c) { c.arc(x, y - r * 0.3, r * 0.92, Math.PI * 1.05, Math.PI * 1.95); c.closePath(); }, col);
        g.poly([[x - r * 1.4, y - r * 1.02], [x, y - r * 1.38], [x + r * 1.4, y - r * 1.02], [x, y - r * 0.72]], shade(col, 0.12));
        g.circle(x, y - r * 1.05, r * 0.1, pal.accent, null);
        g.line(x, y - r * 1.05, x + r * 1.05, y - r * 0.95, pal.accent, Math.max(0.8, r * 0.07));
        g.line(x + r * 1.05, y - r * 0.95, x + r * 1.08 + Math.sin(t * 2) * r * 0.05, y - r * 0.4, pal.accent, Math.max(0.8, r * 0.07));
        g.ellipse(x + r * 1.08 + Math.sin(t * 2) * r * 0.05, y - r * 0.32, r * 0.09, r * 0.16, pal.accent);
        break;
      case 'hood': case 'cowl': {
        const c = g.ctx, R = kind === 'hood' ? 1.2 : 1.16;
        c.beginPath();
        c.arc(x - r * 0.05, y + r * 0.02, r * R, 0, TAU);
        c.ellipse(x + r * 0.16, y + r * 0.2, r * 0.8, r * 0.86, 0, 0, TAU, true);
        c.fillStyle = col; c.fill('evenodd');
        c.strokeStyle = g.outline; c.lineWidth = g.lw; c.stroke();
        c.beginPath(); c.ellipse(x + r * 0.16, y + r * 0.2, r * 0.8, r * 0.86, 0, Math.PI * 1.08, Math.PI * 1.92);
        c.strokeStyle = rgba('#000000', 0.35); c.lineWidth = r * 0.22; c.stroke();
        g.arc(x - r * 0.05, y + r * 0.02, r * R * 0.84, Math.PI * 1.2, Math.PI * 1.45, rgba(shade(col, 0.4), 0.7), Math.max(0.8, r * 0.1));
        break;
      }
      case 'crown':
        drawCrown(g, x, y - r * 0.78, r * 1.25, r * 0.78, pal.metal, pal.accent);
        break;
      case 'mushroom': { // spotted toadstool cap (spore folk, myconids)
        const capC = pal.hat || pal.accent, wob = Math.sin(t * 2) * r * 0.03;
        g.shaded(function (c) {
          c.moveTo(x - r * 1.55, y - r * 0.32);
          c.bezierCurveTo(x - r * 1.5, y - r * 1.85 + wob, x + r * 1.5, y - r * 1.85 - wob, x + r * 1.55, y - r * 0.32);
          c.quadraticCurveTo(x, y - r * 0.05, x - r * 1.55, y - r * 0.32);
          c.closePath();
        }, capC, { dx: r * 0.12, dy: -r * 0.12, hl: [x + r * 0.35, y - r * 1.25, r * 0.4, r * 0.16, -0.3] });
        const spots = [[-0.8, -0.85, 0.22], [0.05, -1.25, 0.26], [0.85, -0.8, 0.2], [-0.3, -0.6, 0.15], [0.5, -0.45, 0.13]];
        for (let i = 0; i < spots.length; i++) g.ellipse(x + spots[i][0] * r, y + spots[i][1] * r, spots[i][2] * r, spots[i][2] * r * 0.8, '#fbf6ee', null);
        g.ctx.beginPath(); g.ctx.ellipse(x, y - r * 0.28, r * 1.35, r * 0.22, 0, 0.15, Math.PI - 0.15);
        g.ctx.strokeStyle = rgba(shade(capC, -0.45), 0.8); g.ctx.lineWidth = Math.max(0.7, r * 0.07); g.ctx.stroke();
        break;
      }
      default:
        break;
    }
  }

  // ---- face accessories --------------------------------------------------------------------------------
  function drawFace(g, H, kind, pass, eyesKind) {
    if (kind === 'none') return;
    const pal = g.pal, x = H.x, y = H.y, r = H.r, ps = eyePositions(H);
    if (pass === 'under') {
      if (kind === 'skull') {
        for (let i = 0; i < 2; i++) g.ellipse(ps[i].x, ps[i].y, r * 0.24 * ps[i].k, r * 0.27 * ps[i].k, '#1d1418', null);
        g.poly([[x + H.fx, y + r * 0.3], [x + H.fx - r * 0.1, y + r * 0.46], [x + H.fx + r * 0.1, y + r * 0.46]], '#1d1418', null);
        const mx = x + H.fx + r * 0.05, my = y + r * 0.66;
        g.rect(mx - r * 0.34, my - r * 0.1, r * 0.68, r * 0.2, '#f6f0e2', undefined, r * 0.05);
        for (let i = -1; i <= 1; i++) g.line(mx + i * r * 0.17, my - r * 0.1, mx + i * r * 0.17, my + r * 0.1, g.outline, Math.max(0.5, r * 0.05));
        if (eyesKind !== 'glow') for (let i = 0; i < 2; i++) g.circle(ps[i].x + r * 0.03, ps[i].y, r * 0.06, '#ff5a3c', null);
      } else if (kind === 'bandit_mask') {
        const c = g.ctx, mc = pal.mask || '#1f1b26';
        c.save();
        c.beginPath(); c.ellipse(x, y, r * 1.04, r * 0.97, 0, 0, TAU); c.clip();
        c.beginPath(); roundRect(c, x - r * 1.1, y - r * 0.2, r * 2.2, r * 0.5, r * 0.15);
        c.fillStyle = mc; c.fill();
        c.restore();
        g.poly([[x - r * 0.98, y - r * 0.05], [x - r * 1.55, y - r * 0.25], [x - r * 1.45, y + r * 0.2]], mc);
        for (let i = 0; i < 2; i++) g.ellipse(ps[i].x, ps[i].y, r * 0.22 * ps[i].k, r * 0.17, '#f6efe4', null);
      }
      return;
    }
    switch (kind) {
      case 'plague_mask': {
        const mc = pal.mask || '#e9dfc6', fx = x + H.fx;
        g.ellipse(fx, y + r * 0.12, r * 0.66, r * 0.62, mc);
        g.shaded(function (c) {
          c.moveTo(fx + r * 0.05, y - r * 0.02);
          c.quadraticCurveTo(fx + r * 1.2, y + r * 0.05, fx + r * 2.0, y + r * 1.0);
          c.quadraticCurveTo(fx + r * 1.0, y + r * 0.95, fx - r * 0.02, y + r * 0.6);
          c.closePath();
        }, mc, { dx: 0, dy: -r * 0.12 });
        g.line(fx + r * 0.35, y + r * 0.25, fx + r * 1.6, y + r * 0.85, shade(mc, -0.3), Math.max(0.6, r * 0.06));
        g.circle(fx + r * 0.62, y + r * 0.28, r * 0.06, '#3a2a26', null);
        for (let i = 0; i < 2; i++) {
          const p = ps[i];
          g.circle(p.x, p.y - r * 0.02, r * 0.25 * p.k, pal.metal);
          g.circle(p.x, p.y - r * 0.02, r * 0.17 * p.k, rgba(pal.eye, 0.95), null);
          g.circle(p.x + r * 0.06, p.y - r * 0.08, r * 0.06, '#ffffff', null);
        }
        break;
      }
      case 'glasses':
        for (let i = 0; i < 2; i++) {
          const p = ps[i];
          g.circle(p.x, p.y, r * 0.25 * p.k, rgba('#ffffff', 0.18), pal.glasses || '#3a2a20');
        }
        g.line(ps[0].x + r * 0.22, ps[0].y - r * 0.02, ps[1].x - r * 0.24, ps[1].y - r * 0.02, pal.glasses || '#3a2a20', Math.max(0.7, r * 0.07));
        g.line(ps[0].x - r * 0.23, ps[0].y - r * 0.04, x - r * 0.95, y - r * 0.08, pal.glasses || '#3a2a20', Math.max(0.7, r * 0.07));
        break;
      case 'monocle': {
        const p = ps[1];
        g.circle(p.x, p.y, r * 0.27, rgba('#dff4ff', 0.35), pal.metal);
        g.circle(p.x, p.y, r * 0.27, null, g.outline);
        g.line(p.x + r * 0.08, p.y - r * 0.12, p.x + r * 0.15, p.y - r * 0.02, '#ffffff', Math.max(0.6, r * 0.06));
        g.path(function (c) { c.moveTo(p.x, p.y + r * 0.27); c.quadraticCurveTo(p.x + r * 0.35, y + r * 1.2, x + r * 0.2, y + r * 1.6); }, null, pal.metal);
        break;
      }
      case 'sunglasses': {
        const c = g.ctx, a = ps[0], b = ps[1];
        g.path(function (cc) {
          cc.moveTo(a.x - r * 0.3, a.y - r * 0.2);
          cc.lineTo(b.x + r * 0.34, b.y - r * 0.22);
          cc.quadraticCurveTo(b.x + r * 0.32, b.y + r * 0.26, b.x, b.y + r * 0.24);
          cc.quadraticCurveTo((a.x + b.x) / 2, a.y - r * 0.02, a.x, a.y + r * 0.22);
          cc.quadraticCurveTo(a.x - r * 0.3, a.y + r * 0.22, a.x - r * 0.3, a.y - r * 0.2);
          cc.closePath();
        }, '#141018');
        c.save();
        g.line(b.x - r * 0.05, b.y - r * 0.12, b.x + r * 0.15, b.y + r * 0.06, rgba('#ffffff', 0.7), Math.max(0.6, r * 0.07));
        g.line(a.x - r * 0.1, a.y - r * 0.1, a.x + r * 0.05, a.y + r * 0.05, rgba('#ffffff', 0.5), Math.max(0.6, r * 0.06));
        c.restore();
        g.line(a.x - r * 0.3, a.y - r * 0.16, x - r * 0.95, y - r * 0.12, '#141018', Math.max(0.7, r * 0.08));
        break;
      }
      case 'eyepatch': {
        const p = ps[1];
        g.line(p.x - r * 0.15, p.y - r * 0.2, x - r * 0.75, y - r * 0.75, '#1d1418', Math.max(0.7, r * 0.09));
        g.line(p.x + r * 0.2, p.y - r * 0.1, x + r * 0.98, y - r * 0.28, '#1d1418', Math.max(0.7, r * 0.09));
        g.ellipse(p.x, p.y, r * 0.24, r * 0.26, '#1d1418');
        break;
      }
      default:
        break;
    }
  }

  // ---- bling sparkle ------------------------------------------------------------------------------------
  function glint(g, x, y, t, seed, size) {
    const s = ((t * 0.55 + seed * 0.37) % 1 + 1) % 1;
    if (s > 0.16) return;
    const k = Math.sin((s / 0.16) * Math.PI);
    g.star(x, y, (size || 2.6) * k, '#fffbe6', null, 4, 0.3);
  }

  // ---- head assembly -------------------------------------------------------------------------------------
  function drawHead(g, n, H, o) {
    const hd = n.head, t = o.at, pal = n.pal;
    const hooded = hd.hat === 'hood' || hd.hat === 'cowl';
    const covered = !!COVERING_HATS[hd.hat];
    const rabbit = hd.ears === 'rabbit' || hd.ears === 'rabbit_floppy';
    const earsThrough = (covered || hooded) && rabbit;
    const hidesEyes = hd.face === 'plague_mask' || hd.face === 'sunglasses' || (hd.face === 'skull' && hd.eyes !== 'glow');
    const masked = hd.face === 'plague_mask' || hd.face === 'skull';

    drawHat(g, H, hd.hat, 'back', t);
    if (!hooded) drawHairBack(g, H, hd.hair, t);
    if (!earsThrough) drawEars(g, H, hd.ears, false, t);
    g.shaded(function (c) { c.ellipse(H.x, H.y, H.r * 1.04, H.r * 0.97, 0, 0, TAU); }, pal.skin,
      { dx: H.r * 0.17, dy: -H.r * 0.15, hl: [H.x + H.r * 0.4, H.y - H.r * 0.5, H.r * 0.26, H.r * 0.14, -0.5] });
    if (hd.blush && !masked && hd.eyes !== 'none') drawBlush(g, H);
    drawFace(g, H, hd.face, 'under', hd.eyes);
    if (!hidesEyes) drawEyes(g, H, hd.eyes, o);
    drawBeard(g, H, hd.beard, 'mass');
    if (!masked) drawMouth(g, H, hd.mouth, o, !!n.bling.grill);
    if (hd.beard !== 'none' && hd.beard !== 'stubble') drawBeard(g, H, hd.beard, 'stache');
    if (!earsThrough) drawEars(g, H, hd.ears, true, t);
    if (!hooded) drawHairFront(g, H, hd.hair, covered, t);
    drawFace(g, H, hd.face, 'over', hd.eyes);
    drawHat(g, H, hd.hat, 'front', t);
    if (earsThrough) { drawEars(g, H, hd.ears, false, t); drawEars(g, H, hd.ears, true, t); }
    drawHorns(g, H, hd.horns);
    if (n.bling.earrings) {
      g.arc(H.x - H.r * 0.92, H.y + H.r * 0.42, H.r * 0.17, 0, TAU, pal.metal, Math.max(0.9, H.r * 0.09));
      g.arc(H.x + H.r * 0.9, H.y + H.r * 0.45, H.r * 0.15, 0, TAU, pal.metal, Math.max(0.9, H.r * 0.09));
      glint(g, H.x - H.r * 0.92, H.y + H.r * 0.6, t, 3, H.r * 0.28);
    }
    if (n.bling.crown && hd.hat !== 'crown') {
      const cy = hatTopY(H, hd.hat) + H.r * 0.12, cx = H.x - H.r * 0.12, c = g.ctx;
      c.save(); c.translate(cx, cy); c.rotate(-0.22);
      drawCrown(g, 0, 0, H.r * 0.95, H.r * 0.6, pal.metal, pal.accent);
      c.restore();
      glint(g, cx + H.r * 0.3, cy - H.r * 0.5, t, 7, H.r * 0.3);
    }
  }

  // ---- humanoid body parts --------------------------------------------------------------------------------
  function torsoPath(c, w, top, bottom, flare, round) {
    const hw = w / 2, bw = hw * flare, r = Math.min(round, hw * 0.9);
    c.moveTo(-hw + r, top);
    c.lineTo(hw - r, top);
    c.quadraticCurveTo(hw, top, hw + (bw - hw) * 0.12, top + r);
    c.lineTo(bw, bottom - 1.6);
    c.quadraticCurveTo(bw, bottom, bw - 1.8, bottom);
    c.lineTo(-bw + 1.8, bottom);
    c.quadraticCurveTo(-bw, bottom, -bw, bottom - 1.6);
    c.lineTo(-hw - (bw - hw) * 0.12, top + r);
    c.quadraticCurveTo(-hw, top, -hw + r, top);
    c.closePath();
  }

  function outfitColors(n) {
    const pal = n.pal, o = n.outfit;
    const pants = pal.pants || shade(pal.cloth2, -0.1);
    const boots = pal.boots || '#4a3020';
    const bare = o === 'rags' || o === 'none';
    return {
      sleeve: o === 'armor' ? pal.metal : (o === 'furs' || bare) ? pal.skin : pal.cloth,
      leg: o === 'armor' ? shade(pal.metal, -0.12) : bare ? pal.skin : pants,
      boot: o === 'armor' ? shade(pal.metal, -0.3) : bare ? pal.skin : o === 'furs' ? (pal.boots || '#6b4a30') : boots,
      bareFeet: bare,
    };
  }

  function drawLegs(g, n, B, hipY, oc, walk, hideLegs) {
    const lx = B.w * 0.22, lw = B.lw;
    const step = walk === null || walk === undefined ? 0 : Math.sin(walk * TAU);
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1, s = side * step;
      const x = side * lx + s * 1.3, lift = Math.max(0, s) * 1.4;
      const legCol = i === 0 ? shade(oc.leg, -0.14) : oc.leg, bootCol = i === 0 ? shade(oc.boot, -0.14) : oc.boot;
      if (!hideLegs) g.rect(x - lw / 2, hipY - 1.5 - lift, lw, -hipY - 1.4 + 1.5, legCol, undefined, lw * 0.35);
      const bh = oc.bareFeet ? 2.4 : 3.2;
      g.rect(x - lw / 2 - 0.3, -bh - lift, lw + 1.9, bh, bootCol, undefined, 1.2);
      if (n.outfit === 'furs') g.rect(x - lw / 2 - 0.6, -bh - 1.4 - lift, lw + 1.2, 1.6, n.pal.cloth2, undefined, 0.8);
    }
  }

  function drawTorso(g, n, B, shY, hipY, t) {
    const pal = n.pal, w = B.w, o = n.outfit, c2 = pal.cloth2;
    const sh = function (fn, col, extra) { g.shaded(fn, col, Object.assign({ dx: 1.7, dy: -1.2 }, extra || {})); };
    switch (o) {
      case 'robe': {
        const bot = -1.4;
        sh(function (c) { torsoPath(c, w, shY, bot, 1.38, 3.5); }, pal.cloth);
        g.path(function (c) { // hem band
          const bw = w / 2 * 1.38;
          c.moveTo(-bw, bot - 2.4); c.lineTo(bw, bot - 2.4); c.lineTo(bw, bot - 1.2); c.quadraticCurveTo(bw, bot, bw - 1.6, bot);
          c.lineTo(-bw + 1.6, bot); c.quadraticCurveTo(-bw, bot, -bw, bot - 1.2); c.closePath();
        }, c2);
        g.rect(w * 0.08, shY + 2, 2, -shY - 4.5, c2, null);
        g.poly([[-w * 0.18, shY], [w * 0.08 + 1, shY + w * 0.32], [w * 0.36, shY]], pal.skin, undefined);
        break;
      }
      case 'dress': {
        sh(function (c) { torsoPath(c, w * 0.92, shY, hipY - 1, 1.0, 3); }, pal.cloth);
        sh(function (c) {
          const tw = w * 0.46, bw = w * 0.82, y0 = hipY - 2, y1 = -1.6;
          c.moveTo(-tw, y0); c.lineTo(tw, y0); c.quadraticCurveTo(bw * 0.9, y0 + 2, bw, y1); c.lineTo(-bw, y1); c.quadraticCurveTo(-bw * 0.9, y0 + 2, -tw, y0); c.closePath();
        }, pal.cloth);
        for (let i = -3; i <= 3; i++) g.circle(i * w * 0.24, -1.8, w * 0.13, c2);
        g.rect(-w * 0.46, hipY - 2.8, w * 0.92, 1.8, c2, null);
        break;
      }
      case 'armor': {
        const tz = [-w * 0.42, -w * 0.12, w * 0.18];
        for (let i = 0; i < tz.length; i++) g.rect(tz[i], hipY - 1.5, w * 0.26, 4.4, shade(pal.metal, -0.18), undefined, 0.8);
        sh(function (c) { torsoPath(c, w, shY, hipY + 0.5, 0.92, 4); }, pal.metal, { hl: [w * 0.12, shY + 3.5, w * 0.14, 2, -0.3] });
        g.line(w * 0.06, shY + 2, w * 0.06, hipY - 1, shade(pal.metal, -0.3), 1);
        g.rect(-w / 2 + 0.5, hipY - 3.2, w - 1, 2, c2, null);
        break;
      }
      case 'furs': {
        sh(function (c) { torsoPath(c, w, shY + 0.5, hipY + 2.5, 1.06, 3); }, pal.cloth);
        g.poly([[-w * 0.05, shY + 1], [w * 0.2, shY + w * 0.45], [w * 0.42, shY + 1]], pal.skin);
        const furC = pal.fur || c2, N = Math.max(5, Math.round(w / 2.6));
        for (let i = 0; i < N; i++) {
          const x = -w / 2 + 0.5 + (i / (N - 1)) * (w - 1);
          g.circle(x, shY + 1.2 + Math.sin(i * 2.1) * 0.5, 1.9, furC);
        }
        g.path(function (c) {
          const bw = w / 2 * 1.06, y = hipY + 2.5;
          c.moveTo(-bw, y - 1.5);
          for (let i = 0; i <= 8; i++) c.lineTo(-bw + (i / 8) * bw * 2, y + (i % 2 ? 1.6 : -0.3));
          c.lineTo(bw, y - 1.5); c.closePath();
        }, furC);
        break;
      }
      case 'coat': {
        const bot = hipY + 4.8;
        sh(function (c) { torsoPath(c, w, shY, bot, 1.2, 3); }, pal.cloth);
        g.poly([[w * 0.0, bot + 0.2], [w * 0.14, hipY + 0.5], [w * 0.28, bot + 0.2]], shade(pal.cloth, -0.45), null);
        g.poly([[-w * 0.08, shY], [w * 0.14, shY + th(B) * 0.62], [w * 0.0, shY + 0.6]], c2);
        g.poly([[w * 0.38, shY], [w * 0.14, shY + th(B) * 0.62], [w * 0.28, shY + 0.6]], c2);
        for (let i = 0; i < 3; i++) g.circle(w * 0.2, shY + th(B) * (0.72 + i * 0.16), 0.9, pal.metal, null);
        break;
      }
      case 'rags': {
        g.path(function (c) {
          const hw = w / 2, bw = hw * 1.06, y = hipY + 2.6;
          c.moveTo(-hw + 2, shY); c.lineTo(hw - 2, shY); c.quadraticCurveTo(hw, shY, hw, shY + 2);
          c.lineTo(bw, y - 1);
          for (let i = 0; i <= 6; i++) c.lineTo(bw - (i / 6) * bw * 2, y + (i % 2 ? -1.8 : 0.6));
          c.lineTo(-hw, shY + 2); c.quadraticCurveTo(-hw, shY, -hw + 2, shY); c.closePath();
        }, pal.cloth);
        g.rect(-w * 0.32, shY + 3, w * 0.28, w * 0.26, c2, undefined, 0.6);
        g.line(-w * 0.3, shY + 3.6, -w * 0.07, shY + 3.6 + w * 0.2, rgba('#000000', 0.4), 0.6);
        break;
      }
      case 'none': {
        sh(function (c) { torsoPath(c, w, shY, hipY + 0.5, 0.94, 4.5); }, pal.skin, { hl: [w * 0.15, shY + 3, w * 0.16, 1.8, -0.3] });
        g.arc(w * 0.05, shY + th(B) * 0.42, w * 0.2, 0.3, 2.8, rgba(shade(pal.skin, -0.45), 0.55), 0.8);
        sh(function (c) { torsoPath(c, w * 0.98, hipY - 1.5, hipY + 2.8, 1.04, 1); }, pal.cloth);
        break;
      }
      default: { // tunic
        sh(function (c) { torsoPath(c, w, shY, hipY + 2.6, 1.08, 3.5); }, pal.cloth);
        g.poly([[-w * 0.06, shY], [w * 0.14, shY + w * 0.3], [w * 0.34, shY]], pal.skin);
        g.path(function (c) {
          const bw = w / 2 * 1.08, y = hipY + 2.6;
          c.moveTo(-bw, y - 1.6); c.lineTo(bw, y - 1.6); c.lineTo(bw, y - 1.0); c.quadraticCurveTo(bw, y, bw - 1.6, y);
          c.lineTo(-bw + 1.6, y); c.quadraticCurveTo(-bw, y, -bw, y - 1.0); c.closePath();
        }, c2, null);
        break;
      }
    }
  }
  function th(B) { return B.th; }

  function pauldron(g, n, x, y, aw) {
    g.shaded(function (c) { c.ellipse(x, y, aw * 0.95, aw * 0.72, 0, Math.PI, TAU); c.closePath(); }, n.pal.metal, { dx: 0.6, dy: -0.6 });
  }

  // Extras on the torso (after the torso is drawn)
  function drawTorsoExtras(g, n, B, shY, hipY, t) {
    const pal = n.pal, w = B.w, ex = n.extras, leather = pal.leather || '#6b4423';
    if (ex.sash) {
      g.poly([[-w * 0.5, shY + 1.5], [-w * 0.5, shY + 4.2], [w * 0.5, hipY + 0.5], [w * 0.5, hipY - 2.5]], pal.sash || pal.accent);
      g.circle(w * 0.36, hipY - 0.5, 1.6, pal.sash || pal.accent);
      g.poly([[w * 0.36, hipY], [w * 0.5, hipY + 4.5], [w * 0.22, hipY + 3.5]], shade(pal.sash || pal.accent, -0.15));
    }
    if (ex.bandolier) {
      g.poly([[w * 0.5, shY + 1], [w * 0.5, shY + 3.8], [-w * 0.5, hipY + 0.2], [-w * 0.5, hipY - 2.6]], leather);
      const vials = [pal.accent, '#7ad3ff', '#a7f070'];
      for (let i = 0; i < 3; i++) {
        const k = 0.25 + i * 0.25, vx = lerp(w * 0.5, -w * 0.5, k), vy = lerp(shY + 2.3, hipY - 1.2, k);
        g.rect(vx - 1, vy - 2.6, 2, 3.2, vials[i], undefined, 0.6);
      }
    }
    if (ex.satchel) {
      g.line(w * 0.45, shY + 1.5, -w * 0.38, hipY - 0.5, leather, 1.4);
      g.rect(-w * 0.62, hipY - 3, w * 0.42, 4.6, leather, undefined, 1);
      g.rect(-w * 0.62, hipY - 3, w * 0.42, 1.8, shade(leather, -0.2), undefined, 0.8);
      g.circle(-w * 0.41, hipY - 1.2, 0.6, pal.metal, null);
    }
    if (ex.belt) {
      g.rect(-w / 2 - 0.3, hipY - 2.5, w + 0.6, 2.3, pal.belt || leather, undefined, 0.6);
      g.rect(w * 0.08, hipY - 2.8, 2.6, 2.9, pal.metal, undefined, 0.5);
    }
    if (ex.pouches) {
      g.rect(-w * 0.42, hipY - 1.6, 3, 3, shade(leather, 0.1), undefined, 0.9);
      g.rect(w * 0.26, hipY - 1.4, 2.6, 2.6, shade(leather, 0.1), undefined, 0.9);
    }
  }

  // Neck layer: collar, scarf wrap, bling chain, cowl mantle (after torso, before head)
  function drawNeckLayer(g, n, B, shY, H, t) {
    const pal = n.pal, w = B.w, ex = n.extras;
    drawHat(g, H, n.head.hat, 'neck', t);
    if (ex.collar) { // tall popped collar flaring out beside the head
      const cc = pal.collar || pal.cloth2, rx = H.r + 2.2;
      g.poly([[-w * 0.36, shY + 1.8], [-rx, shY - 7.5], [-rx * 0.55, shY - 3], [-w * 0.05, shY - 0.5]], shade(cc, -0.12));
      g.poly([[w * 0.36, shY + 1.8], [rx, shY - 7.5], [rx * 0.55, shY - 3], [w * 0.05, shY - 0.5]], cc);
    }
    if (ex.scarf) {
      const sc = pal.scarf || pal.accent;
      g.rect(-w * 0.42, shY - 1.8, w * 0.84, 3.6, sc, undefined, 1.6);
      g.line(-w * 0.3, shY - 0.2, w * 0.3, shY + 0.4, rgba(shade(sc, -0.4), 0.7), 0.7);
    }
    if (n.bling.chain) {
      const c = g.ctx, x0 = -w * 0.3, x1 = w * 0.34, dy = B.th * 0.55;
      c.beginPath(); c.moveTo(x0, shY + 0.6); c.quadraticCurveTo(w * 0.02, shY + dy * 1.6, x1, shY + 0.6);
      c.strokeStyle = g.outline; c.lineWidth = 2.6; c.stroke();
      c.strokeStyle = pal.metal; c.lineWidth = 1.5; c.setLineDash([1.6, 0.9]); c.stroke(); c.setLineDash([]);
      const my = shY + dy * 0.86;
      g.circle(w * 0.03, my, 2.3, pal.metal);
      g.text('$', w * 0.03, my + 0.2, 3.2, shade(pal.metal, -0.45), null);
      glint(g, w * 0.03 + 1, my - 1.2, t, 1, 2.6);
    }
  }

  // Cape + scarf tail (back layer, before the back arm)
  function drawBackExtras(g, n, B, shY, hipY, t) {
    const pal = n.pal, w = B.w, ex = n.extras;
    if (ex.cape) {
      const cc = pal.cape || (pal.cloth2 !== pal.cloth ? pal.cloth2 : pal.accent);
      const wave = Math.sin(t * 2.3) * 1.2;
      g.shaded(function (c) {
        c.moveTo(-w * 0.45, shY + 0.5);
        c.lineTo(w * 0.3, shY + 0.5);
        c.quadraticCurveTo(w * 0.1, -B.lh * 0.6, -w * 0.15, -0.8);
        c.quadraticCurveTo(-w * 0.55, 0.6 + wave * 0.4, -w * 0.95 - 2 + wave, -0.8 + wave * 0.3);
        c.quadraticCurveTo(-w * 0.85, shY * 0.4, -w * 0.45, shY + 0.5);
        c.closePath();
      }, shade(cc, -0.05), { dx: -1.2, dy: 0 });
    }
    if (ex.scarf) {
      const sc = pal.scarf || pal.accent, fl = Math.sin(t * 4.2) * 1.4;
      g.path(function (c) {
        c.moveTo(-w * 0.3, shY - 1);
        c.quadraticCurveTo(-w * 0.75, shY - 0.5 + fl * 0.4, -w * 0.95 - 3, shY + 2.5 + fl);
        c.lineTo(-w * 0.8 - 2.5, shY + 5 + fl);
        c.quadraticCurveTo(-w * 0.6, shY + 2.5, -w * 0.2, shY + 1.5);
        c.closePath();
      }, shade(sc, -0.12));
    }
  }

  // ---- wings (behind the body; extend toward -x = back) ------------------------------------------------------
  function drawWings(g, kind, ax, ay, sz, t, pal) {
    if (kind === 'none') return;
    const c = g.ctx;
    const speed = kind === 'fairy' ? 17 : kind === 'demon' ? 4.2 : kind === 'bat' ? 7 : 5.5;
    const flap = Math.sin(t * speed);
    for (let pass = 0; pass < 2; pass++) { // 0 = far wing, 1 = near wing
      c.save();
      c.translate(ax + (pass ? 0 : 1.5), ay - (pass ? 0 : 1.5));
      // fairy wings sweep back (not up) so they clear the big chibi head
      c.rotate((kind === 'fairy' ? -0.3 : 0) + (pass ? 0 : -0.45) + flap * (kind === 'fairy' ? 0.22 : 0.3));
      c.scale(sz * (kind === 'fairy' ? 0.85 + 0.15 * Math.abs(flap) : 1), sz);
      const far = pass === 0;
      if (kind === 'fairy') {
        const wc = pal.wing || '#bdf3ff';
        c.globalAlpha *= far ? 0.55 : 0.8;
        g.path(function (p) { p.moveTo(0, 0); p.bezierCurveTo(-4, -12, -15, -17, -16, -9); p.bezierCurveTo(-16, -4, -7, -1, 0, 0); p.closePath(); },
          rgba(wc, 0.6), rgba(shade(wc, -0.55), 0.9));
        g.path(function (p) { p.moveTo(0, 1); p.bezierCurveTo(-6, 2, -12, 7, -10, 10); p.bezierCurveTo(-7, 12, -2, 6, 0, 1); p.closePath(); },
          rgba(wc, 0.5), rgba(shade(wc, -0.55), 0.9));
        g.line(-1, -1, -12, -10, rgba('#ffffff', 0.8), 0.6);
        g.line(-1, 2, -8, 8, rgba('#ffffff', 0.8), 0.6);
        g.circle(-11, -10, 1.2, rgba('#ffffff', 0.9), null);
      } else if (kind === 'bat' || kind === 'demon') {
        const wc = pal.wing || (kind === 'demon' ? '#6a1b2a' : shade(pal.skin, -0.35));
        const k = kind === 'demon' ? 1.3 : 1;
        const col = far ? shade(wc, -0.25) : wc;
        const pts = [[0, 0], [-9 * k, -11 * k], [-21 * k, -7 * k], [-17 * k, -1 * k], [-19 * k, 3 * k], [-13 * k, 3.5 * k], [-12 * k, 7 * k], [-6 * k, 4.5 * k], [0, 4]];
        g.path(function (p) {
          p.moveTo(pts[0][0], pts[0][1]);
          for (let i = 1; i < pts.length; i++) {
            const prev = pts[i - 1], cur = pts[i];
            if (i >= 3) p.quadraticCurveTo((prev[0] + cur[0]) / 2 + 1.5, (prev[1] + cur[1]) / 2 - 1.2, cur[0], cur[1]); else p.lineTo(cur[0], cur[1]);
          }
          p.closePath();
        }, col);
        const bone = shade(wc, -0.45);
        g.line(0, 0, pts[1][0], pts[1][1], bone, 1.1);
        g.line(pts[1][0], pts[1][1], pts[2][0], pts[2][1], bone, 0.9);
        g.line(pts[1][0], pts[1][1], pts[4][0], pts[4][1], bone, 0.9);
        g.line(pts[1][0], pts[1][1], pts[6][0], pts[6][1], bone, 0.9);
        if (kind === 'demon') g.poly([[pts[1][0], pts[1][1]], [pts[1][0] - 1.5, pts[1][1] - 4], [pts[1][0] + 1.5, pts[1][1] - 0.5]], '#e8dcc8');
      } else if (kind === 'bird') {
        const wc = pal.wing || '#f3efe6', col = far ? shade(wc, -0.2) : wc;
        g.path(function (p) {
          p.moveTo(0, 2); p.quadraticCurveTo(-4, -10, -13, -11);
          p.lineTo(-19, -9); p.lineTo(-15, -6); p.lineTo(-20, -4); p.lineTo(-15, -2); p.lineTo(-18, 1); p.lineTo(-12, 1.5);
          p.quadraticCurveTo(-6, 5, 0, 2); p.closePath();
        }, col);
        g.arc(-6, -2, 6, 3.6, 5.2, shade(wc, -0.3), 0.7);
        g.arc(-9, 0, 6, 3.7, 5.0, shade(wc, -0.3), 0.7);
      }
      c.restore();
    }
  }

  // ---- tails (anchored at the back of the hips, extend toward -x) ----------------------------------------------
  function drawTail(g, kind, ax, ay, t, pal, sz) {
    if (kind === 'none') return;
    sz = sz || 1;
    const sway = Math.sin(t * 2.2) * 2 * sz;
    switch (kind) {
      case 'devil': {
        const col = pal.tail || pal.skin;
        const ex = ax - 11 * sz, ey = ay - 4 * sz + sway;
        g.limb(ax, ay, ex, ey, 1.6 * sz, col, ax - 9 * sz, ay + 7 * sz);
        g.poly([[ex, ey - 2.6 * sz], [ex - 3.2 * sz, ey - 0.6 * sz], [ex - 0.2 * sz, ey + 2.4 * sz], [ex + 1.6 * sz, ey - 0.2 * sz]], col);
        break;
      }
      case 'rabbit':
        for (let i = 0; i < 4; i++) g.circle(ax - 2.2 * sz + Math.cos(i * 1.6) * 1.2 * sz, ay + 1 * sz + Math.sin(i * 1.6) * 1.2 * sz, 2.3 * sz, pal.tail || '#f6f3ee');
        break;
      case 'cat': {
        const col = pal.tail || pal.hair;
        g.limb(ax, ay, ax - 7 * sz + sway, ay - 11 * sz, 2.6 * sz, col, ax - 11 * sz, ay + 3 * sz);
        g.circle(ax - 7 * sz + sway, ay - 11 * sz, 1.3 * sz, shade(col, 0.2), null);
        break;
      }
      case 'lizard': {
        const col = pal.tail || pal.skin;
        taperHorn(g, ax + 1.5 * sz, ay - 1 * sz, ax - 8 * sz, ay + 2 * sz, ax - 16 * sz + sway * 0.5, -1.2 * sz, 6 * sz, col, false);
        break;
      }
      case 'dog': {
        const wag = Math.sin(t * 13) * 2.2 * sz, col = pal.tail || pal.hair;
        g.limb(ax, ay, ax - 3 * sz + wag, ay - 6.5 * sz, 3 * sz, col, ax - 4.5 * sz, ay - 1 * sz);
        break;
      }
      case 'rat': {
        const col = pal.tail || '#e3a0a6';
        g.limb(ax, ay, ax - 15 * sz + sway, ay + 5.5 * sz, 1.1 * sz, col, ax - 8 * sz, ay + 9 * sz);
        break;
      }
      default:
        break;
    }
  }

  // ---- auras (pass 'back' before the body, 'front' after) ---------------------------------------------------
  const AURA_COLORS = { flames: '#ff7a1a', glow: '#ffd76a', sparkles: '#fff3a0', smoke: '#9a93a3', runes: '#7af0ff', blood: '#e0203a',
    notes: '#ffd76a', leaves: '#6cc24a', bubbles: '#9be7ff' };

  function drawAura(g, aura, pass, h, w, t) {
    if (!aura) return;
    const col = aura.color || AURA_COLORS[aura.kind], c = g.ctx;
    switch (aura.kind) {
      case 'glow':
        if (pass === 'back') g.glow(0, -h * 0.5, Math.max(h, w) * 0.78, col, 0.32 + 0.1 * Math.sin(t * 3));
        break;
      case 'flames': {
        const n = pass === 'back' ? 5 : 3;
        const prev = c.globalCompositeOperation;
        c.globalCompositeOperation = 'lighter';
        if (pass === 'back') g.glow(0, -h * 0.25, w * 1.3, col, 0.25);
        for (let i = 0; i < n; i++) {
          const k = n === 1 ? 0.5 : i / (n - 1);
          const x = (k - 0.5) * w * (pass === 'back' ? 1.5 : 1.1);
          const fl = Math.sin(t * 9 + i * 2.3) * 0.18 + Math.sin(t * 13.7 + i) * 0.1;
          const fh = (pass === 'back' ? h * 0.42 : h * 0.22) * (1 + fl), fw = w * (pass === 'back' ? 0.36 : 0.28);
          g.flame(x, pass === 'back' ? -1 : 1, fw, fh, rgba(col, 0.85), null, Math.sin(t * 5 + i) * fw * 0.4);
          g.flame(x, pass === 'back' ? -1 : 1, fw * 0.5, fh * 0.6, rgba('#ffe066', 0.9), null, Math.sin(t * 5 + i) * fw * 0.25);
        }
        c.globalCompositeOperation = prev;
        break;
      }
      case 'sparkles':
        if (pass !== 'front') break;
        for (let i = 0; i < 6; i++) {
          const p = (t * 0.7 + i / 6) % 1, x = (hash01(i, 3) - 0.5) * w * 2, y = -h * (0.1 + 0.95 * hash01(i, 9 + Math.floor(t * 0.7 + i / 6)));
          g.star(x, y, 2.6 * Math.sin(p * Math.PI), col, null, 4, 0.3);
        }
        break;
      case 'smoke':
        for (let i = 0; i < 5; i++) {
          const p = (t * 0.35 + i / 5) % 1, front = i % 2 === 1;
          if ((pass === 'front') !== front) continue;
          const x = (hash01(i, 5) - 0.5) * w * 1.2 + Math.sin(p * 4 + i) * 2.5, y = -h * 0.45 - p * h * 0.75;
          g.glow(x, y, 4 + p * 7, col, 0.75 * (1 - p));
          g.glow(x - 1, y - 1, 2 + p * 3, shade(col, 0.35), 0.5 * (1 - p));
        }
        break;
      case 'runes': case 'blood': case 'leaves': {
        const N = aura.kind === 'blood' ? 4 : 4, sp = aura.kind === 'leaves' ? 1.1 : aura.kind === 'blood' ? 1.6 : 1.2;
        for (let i = 0; i < N; i++) {
          const a = t * sp + (i * TAU) / N, sn = Math.sin(a);
          if ((pass === 'front') !== (sn >= 0)) continue;
          const x = Math.cos(a) * w * 1.05, y = -h * (0.42 + 0.12 * Math.sin(a * 2 + i)) + sn * 3.5;
          if (aura.kind === 'runes') {
            g.glow(x, y, 5, col, 0.45);
            drawRune(g, x, y, 2.4, col, i);
          } else if (aura.kind === 'blood') {
            g.path(function (p) { p.moveTo(x, y - 3.4); p.quadraticCurveTo(x + 2.4, y, x, y + 2); p.quadraticCurveTo(x - 2.4, y, x, y - 3.4); p.closePath(); }, col, undefined, g.lw * 0.6);
            g.circle(x - 0.6, y - 0.2, 0.6, rgba('#ffffff', 0.7), null);
          } else {
            g.ellipse(x, y, 3.4, 1.5, i % 2 ? col : shade(col, 0.2), undefined, a * 1.5);
            g.line(x - Math.cos(a * 1.5) * 2.6, y - Math.sin(a * 1.5) * 2.6, x + Math.cos(a * 1.5) * 2.6, y + Math.sin(a * 1.5) * 2.6, shade(col, -0.35), 0.5);
          }
        }
        break;
      }
      case 'notes':
        if (pass !== 'front') break;
        for (let i = 0; i < 3; i++) {
          const p = (t * 0.45 + i / 3) % 1, x = (i - 1) * w * 0.6 + Math.sin(p * 6 + i) * 2, y = -h * 0.45 - p * h * 0.75;
          c.save(); c.globalAlpha *= Math.sin(p * Math.PI);
          g.note(x, y, 2.2, i === 1 ? shade(col, 0.3) : col);
          c.restore();
        }
        break;
      case 'bubbles':
        if (pass !== 'front') break;
        for (let i = 0; i < 5; i++) {
          const p = (t * 0.5 + i / 5) % 1, x = (hash01(i, 11) - 0.5) * w * 1.3 + Math.sin(p * 7 + i) * 1.5, y = -2 - p * h * 1.05, r = 1.1 + hash01(i, 2) * 1.5;
          g.circle(x, y, r, rgba(col, 0.25), rgba(shade(col, -0.2), 0.9 * (1 - p * 0.5)));
          g.circle(x - r * 0.35, y - r * 0.35, r * 0.3, rgba('#ffffff', 0.8), null);
        }
        break;
      default:
        break;
    }
  }

  /** A small procedural rune glyph (deterministic per seed). */
  function drawRune(g, x, y, s, col, seed) {
    const c = g.ctx;
    c.beginPath();
    const v = Math.floor(hash01(seed, 77) * 4);
    c.moveTo(x, y - s); c.lineTo(x, y + s);
    if (v === 0) { c.moveTo(x, y - s * 0.3); c.lineTo(x + s * 0.8, y - s); c.moveTo(x, y + s * 0.2); c.lineTo(x - s * 0.8, y - s * 0.4); }
    else if (v === 1) { c.moveTo(x - s * 0.8, y - s * 0.6); c.lineTo(x + s * 0.8, y + s * 0.2); c.moveTo(x - s * 0.8, y + s * 0.2); c.lineTo(x + s * 0.8, y - s * 0.6); }
    else if (v === 2) { c.moveTo(x, y - s); c.lineTo(x + s * 0.8, y - s * 0.2); c.lineTo(x, y + s * 0.4); }
    else { c.moveTo(x - s * 0.7, y + s * 0.3); c.lineTo(x, y - s * 0.4); c.lineTo(x + s * 0.7, y + s * 0.3); }
    c.lineCap = 'round'; c.strokeStyle = col; c.lineWidth = Math.max(0.8, s * 0.42); c.stroke(); c.lineCap = 'butt';
  }

  // ---- held items: grip at the origin, item points "up" (-y) in its own frame ------------------------------------
  const WOOD = '#8a5a33', PARCH = '#f1e3bf';
  function itemCols(pal) { return { wood: pal.wood || WOOD, metal: pal.metal, acc: pal.accent, parch: pal.parchment || PARCH }; }

  function drawItem(g, kind, x, y, R, pal, t) {
    if (kind === 'none') return;
    const c = g.ctx, C = itemCols(pal), lw0 = g.lw;
    c.save();
    c.translate(x, y);
    c.rotate(R);
    c.scale(1.1, 1.1);
    g.lw = lw0 * 0.62; // small props need thinner outlines to stay readable
    switch (kind) {
      case 'staff':
        g.limb(0, 8, 0, -21, 2.2, C.wood);
        g.limb(0, -20, 2.6, -24.5, 1.6, C.wood, 3.5, -21);
        g.limb(0, -20, -2.6, -24.5, 1.6, C.wood, -3.5, -21);
        g.glow(0, -24.5, 7, C.acc, 0.5 + 0.15 * Math.sin(t * 4));
        g.circle(0, -24.5, 3.1, C.acc);
        g.circle(-0.9, -25.6, 1, rgba('#ffffff', 0.85), null);
        break;
      case 'sword': case 'greatsword': {
        const L = kind === 'sword' ? 15 : 23, W = kind === 'sword' ? 1.5 : 2.3, G = kind === 'sword' ? 3.6 : 5.2;
        g.limb(0, kind === 'sword' ? 3 : 6, 0, -1, 1.7, pal.grip || '#4a2f20');
        g.poly([[-W, -1.6], [-W, -L + W * 1.2], [0, -L - W * 0.8], [W, -L + W * 1.2], [W, -1.6]], C.metal);
        g.line(0, -2.5, 0, -L + W, shade(C.metal, -0.3), 0.7);
        g.line(-W * 0.5, -3, -W * 0.5, -L * 0.7, rgba('#ffffff', 0.6), 0.6);
        g.rect(-G, -2.4, G * 2, 1.9, shade(C.metal, -0.15), undefined, 0.6);
        g.circle(0, kind === 'sword' ? 3.6 : 6.6, 1.3, C.acc);
        break;
      }
      case 'axe':
        g.limb(0, 6, 0, -12, 1.9, C.wood);
        g.path(function (p) { p.moveTo(0.5, -13); p.quadraticCurveTo(7.5, -14, 7.5, -9); p.quadraticCurveTo(7.5, -4.5, 0.5, -6.5); p.closePath(); }, C.metal);
        g.line(5.8, -12.5, 6.6, -6.5, rgba('#ffffff', 0.7), 0.7);
        break;
      case 'greataxe':
        g.limb(0, 9, 0, -19, 2.1, C.wood);
        for (let s = -1; s <= 1; s += 2) {
          g.path(function (p) { p.moveTo(0, -19.5); p.quadraticCurveTo(s * 10, -22, s * 10, -14); p.quadraticCurveTo(s * 9, -7.5, 0, -10); p.closePath(); }, s > 0 ? C.metal : shade(C.metal, -0.15));
        }
        g.line(8, -19, 8.6, -10, rgba('#ffffff', 0.7), 0.8);
        g.rect(-1.6, -17, 3.2, 3, shade(C.metal, -0.35), undefined, 0.5);
        break;
      case 'dagger':
        g.limb(0, 2.6, 0, -0.5, 1.6, pal.grip || '#4a2f20');
        g.poly([[-1.5, -1.2], [-1.2, -7], [0, -10.5], [1.2, -7], [1.5, -1.2]], C.metal);
        g.line(-0.4, -2, -0.4, -8, rgba('#ffffff', 0.65), 0.5);
        g.rect(-2.8, -2, 5.6, 1.4, shade(C.metal, -0.2), undefined, 0.5);
        break;
      case 'bow':
        g.limb(0, -11, 0, 11, 1.7, C.wood, 7, 0);
        g.line(0.6, -10.5, 0.6, 10.5, '#f3ead2', 0.6);
        g.rect(1.6, -1.8, 2.2, 3.6, pal.grip || '#4a2f20', undefined, 0.6);
        break;
      case 'crossbow':
        g.rect(-3, -1.2, 13, 2.6, C.wood, undefined, 0.8);
        g.limb(9, -5.5, 9, 5.5, 1.5, shade(C.metal, -0.1), 11.5, 0);
        g.line(9.3, -5, 5.5, 0, '#f3ead2', 0.5); g.line(9.3, 5, 5.5, 0, '#f3ead2', 0.5);
        g.line(1, -1.6, 10.5, -1.6, shade(C.metal, -0.2), 0.9);
        break;
      case 'lute': { // pear-shaped body across the belly, neck up and forward
        const body = pal.lute || '#d08a3a';
        g.limb(1.5, -4, 8.5, -16.5, 2.4, shade(C.wood, -0.15));
        g.poly([[7.2, -16.5], [11.2, -20], [12.2, -18.6], [9.4, -15.4]], shade(C.wood, -0.35));
        g.ellipse(0, 0.2, 5.6, 6.6, body, undefined, 0.55);
        g.ellipse(-1, 1.4, 3.6, 4.2, shade(body, -0.18), null, 0.55);
        g.ellipse(1.6, -2.2, 1.8, 1.2, rgba(shade(body, 0.5), 0.7), null, 0.55);
        g.circle(0.6, -0.6, 1.5, '#3a2316', null);
        g.rect(-2.6, 2.6, 3.4, 0.9, '#3a2316', null);
        g.line(-1.4, 3, 8, -15.6, rgba('#fff4d6', 0.8), 0.35);
        g.line(-0.4, 3.2, 8.8, -15.2, rgba('#fff4d6', 0.8), 0.35);
        break;
      }
      case 'book': case 'off_book': { // open tome held by its lower edge
        const by = -4.2;
        g.rect(-5.4, by - 4, 10.8, 7.6, pal.book || pal.cloth2, undefined, 0.9);
        g.poly([[-4.8, by - 3.6], [0, by - 2.4], [0, by + 2.8], [-4.8, by + 2.2]], C.parch);
        g.poly([[4.8, by - 3.6], [0, by - 2.4], [0, by + 2.8], [4.8, by + 2.2]], shade(C.parch, -0.06));
        for (let i = 0; i < 3; i++) {
          g.line(-3.9, by - 1.9 + i * 1.4, -0.9, by - 1.3 + i * 1.4, rgba('#5a4636', 0.6), 0.45);
          g.line(0.9, by - 1.3 + i * 1.4, 3.9, by - 1.9 + i * 1.4, rgba('#5a4636', 0.6), 0.45);
        }
        break;
      }
      case 'wand':
        g.limb(0, 2, 0, -8.5, 1.2, pal.wand || '#3b2a22');
        g.glow(0, -9.5, 5, C.acc, 0.6);
        g.star(0, -9.5, 2.8 + Math.sin(t * 6) * 0.5, C.acc, g.outline, 4, 0.42);
        g.circle(0, -9.5, 0.7, '#ffffff', null);
        break;
      case 'cane':
        g.limb(0, 15, 0, -1, 1.7, C.wood);
        g.limb(0, -1, 4.2, 0.5, 1.7, C.wood, 2.5, -4.2);
        g.circle(0, 15.2, 1.1, shade(C.metal, -0.2), null);
        break;
      case 'flask':
        drawFlask(g, 0.5, -3.6, 1.1, C.acc, t);
        break;
      case 'scythe':
        g.limb(0, 10, 0, -20, 1.9, C.wood);
        g.path(function (p) { p.moveTo(0.5, -20.5); p.quadraticCurveTo(-8, -24, -15, -14); p.quadraticCurveTo(-8, -19.5, -0.2, -17.2); p.closePath(); }, C.metal);
        g.line(-3, -20.3, -12, -15.8, rgba('#ffffff', 0.6), 0.6);
        break;
      case 'club':
        g.path(function (p) { p.moveTo(-1, 2.5); p.lineTo(-2.6, -9); p.quadraticCurveTo(0, -13, 2.6, -9); p.lineTo(1, 2.5); p.closePath(); }, C.wood);
        g.circle(-0.8, -7.5, 0.8, shade(C.wood, -0.35), null); g.circle(1, -4.5, 0.7, shade(C.wood, -0.35), null);
        break;
      case 'spear':
        g.limb(0, 10, 0, -21, 1.6, C.wood);
        g.poly([[0, -28.5], [-2, -23], [0, -20.6], [2, -23]], C.metal);
        g.rect(-1.2, -21.6, 2.4, 1.6, pal.accent, undefined, 0.4);
        break;
      case 'orb':
        g.glow(0, -3.5, 8, C.acc, 0.5 + 0.15 * Math.sin(t * 3));
        g.circle(0, -3.5, 3.6, C.acc);
        g.arc(0, -3.5, 2, t * 3, t * 3 + 3.5, rgba('#ffffff', 0.6), 0.7);
        g.circle(-1.2, -4.8, 1, rgba('#ffffff', 0.9), null);
        break;
      case 'torch':
        g.limb(0, 5, 0, -5, 1.9, C.wood);
        g.rect(-1.6, -6.5, 3.2, 2.4, pal.cloth2, undefined, 0.6);
        drawTorchFlame(g, 0, -7, 1, t);
        break;
      case 'scroll':
        g.rect(-1.9, -7, 3.8, 9.5, C.parch, undefined, 0.6);
        g.ellipse(0, -7, 2.6, 1.1, shade(C.parch, -0.12));
        g.ellipse(0, 2.5, 2.6, 1.1, shade(C.parch, -0.12));
        g.rect(-2.1, -3.2, 4.2, 1.2, C.acc, null);
        break;
      case 'quill':
        g.line(0, 2.5, 0, -2, '#2a2228', 0.9);
        g.path(function (p) { p.moveTo(0, -1); p.quadraticCurveTo(-4.5, -6, -0.5, -12.5); p.quadraticCurveTo(3.2, -6, 0, -1); p.closePath(); }, pal.quill || '#f6f2ea');
        g.line(0, -1.5, -0.4, -11.5, rgba('#7a6a60', 0.8), 0.5);
        break;
      case 'hammer':
        g.limb(0, 6, 0, -10, 1.9, C.wood);
        g.shaded(function (p) { roundRect(p, -5.2, -14.6, 10.4, 5.4, 1); }, C.metal, { dx: 0.6, dy: -0.6 });
        g.rect(-1.4, -14.6, 2.8, 5.4, shade(C.metal, -0.3), null);
        break;
      default:
        break;
    }
    g.lw = lw0;
    c.restore();
  }

  function drawFlask(g, x, y, s, liquid, t) {
    g.rect(x - 1 * s, y - 6.5 * s, 2 * s, 3 * s, rgba('#dff4ff', 0.6), undefined, 0.4 * s);
    g.rect(x - 1.3 * s, y - 7.8 * s, 2.6 * s, 1.6 * s, '#8a5a33', undefined, 0.5 * s);
    g.circle(x, y - 1.2 * s, 3.4 * s, rgba('#dff4ff', 0.5));
    const c = g.ctx;
    c.save(); c.beginPath(); c.arc(x, y - 1.2 * s, 3.4 * s - 0.6, 0, TAU); c.clip();
    c.fillStyle = liquid; c.fillRect(x - 4 * s, y - 1.6 * s + Math.sin(t * 3) * 0.3 * s, 8 * s, 6 * s);
    c.restore();
    g.circle(x, y - 1.2 * s, 3.4 * s, null);
    g.circle(x - 1.2 * s, y - 2.4 * s, 0.8 * s, rgba('#ffffff', 0.85), null);
  }

  function drawTorchFlame(g, x, y, s, t) {
    const c = g.ctx, f = Math.sin(t * 11) * 0.12 + Math.sin(t * 17) * 0.08;
    g.glow(x, y - 3 * s, 9 * s, '#ff9a2a', 0.45);
    const prev = c.globalCompositeOperation;
    c.globalCompositeOperation = 'lighter';
    g.flame(x, y, 4.2 * s, 7.5 * s * (1 + f), rgba('#ff6a1a', 0.9), null, Math.sin(t * 7) * 0.8 * s);
    g.flame(x, y, 2.2 * s, 4.5 * s * (1 + f), rgba('#ffe066', 0.95), null, Math.sin(t * 7) * 0.4 * s);
    c.globalCompositeOperation = prev;
  }

  function drawOffhand(g, kind, x, y, pal, t) {
    if (kind === 'none') return;
    const C = itemCols(pal), lw0 = g.lw;
    g.lw = lw0 * 0.7;
    switch (kind) {
      case 'shield': {
        const sc = pal.shield || pal.cloth2;
        g.shaded(function (p) { p.arc(x - 0.5, y - 1, 6, 0, TAU); }, sc, { dx: 0.9, dy: -0.9 });
        g.arc(x - 0.5, y - 1, 5.2, 0, TAU, shade(C.metal, -0.1), 1.3);
        g.circle(x - 0.5, y - 1, 1.8, C.metal);
        g.line(x - 0.5, y - 6, x - 0.5, y + 4, rgba(shade(sc, -0.4), 0.6), 0.8);
        break;
      }
      case 'lantern':
        g.line(x, y + 1, x, y - 2, '#2a2228', 0.8);
        g.glow(x, y + 5, 9, '#ffcf5a', 0.45 + 0.1 * Math.sin(t * 5));
        g.rect(x - 2.6, y + 1.5, 5.2, 7, rgba('#ffe9a0', 0.9), undefined, 1);
        g.rect(x - 3, y + 0.8, 6, 1.4, shade(C.metal, -0.3), undefined, 0.5);
        g.rect(x - 3, y + 8.3, 6, 1.4, shade(C.metal, -0.3), undefined, 0.5);
        g.line(x, y + 2.2, x, y + 8, rgba(shade(C.metal, -0.4), 0.8), 0.6);
        break;
      case 'flask': drawFlask(g, x, y + 2, 0.95, C.acc, t); break;
      default: { // props shared with the main hand (drawItem applies its own thin outline)
        g.lw = lw0;
        const R = { book: -0.25, orb: 0, torch: -0.2, scroll: -0.5, dagger: -0.45 }[kind] || 0;
        drawItem(g, kind === 'book' ? 'off_book' : kind, x, y + (kind === 'orb' || kind === 'scroll' ? 1 : 0), R, pal, t);
        break;
      }
    }
    g.lw = lw0;
  }

  // ---- humanoid ----------------------------------------------------------------------------------------------
  // idle: resting rotation of the item (0 = pointing straight up); two: two-handed; fixed: doesn't swing like a blade.
  const ITEM_INFO = {
    staff: { idle: 0.08 }, sword: { idle: 0.85 }, greatsword: { idle: 0.72, two: true, arm: 1.0 }, axe: { idle: 0.8 },
    greataxe: { idle: 0.62, two: true, arm: 1.0 }, dagger: { idle: 1.0 }, bow: { idle: 0, fixed: true, arm: 0.75 },
    crossbow: { idle: 0, fixed: true, two: true, arm: 0.7 }, lute: { idle: 0, fixed: true }, book: { idle: -0.2, fixed: true, arm: 0.85 },
    wand: { idle: 0.75 }, cane: { idle: 0.06, fixed: true }, flask: { idle: 0, fixed: true, arm: 0.95 }, scythe: { idle: 0.15, two: true },
    club: { idle: 0.8 }, spear: { idle: 0.12 }, orb: { idle: 0, fixed: true, arm: 0.95 }, torch: { idle: 0.3 },
    scroll: { idle: -0.35, fixed: true, arm: 0.9 }, quill: { idle: 0.6 }, hammer: { idle: 0.75 },
  };
  const WING_SCALE = { tiny: 1.05, slim: 1, normal: 1, stocky: 1.05, huge: 1.25 };

  function armAngles(g, o, info) {
    const sway = o.still ? 0 : Math.sin(o.at * 2.2 + o.phase) * 0.05;
    const rest = info.arm !== undefined ? info.arm : 1.2;
    switch (g.pose) {
      case 'attack': {
        const p = g.poseT;
        if (p === undefined || p === null) return [0.05, 2.0];
        let a;
        if (p < 0.3) a = lerp(rest, -2.1, smooth(p / 0.3));
        else if (p < 0.55) a = lerp(-2.1, 0.55, smooth((p - 0.3) / 0.25));
        else a = lerp(0.55, rest, smooth((p - 0.55) / 0.45));
        return [a, 2.05];
      }
      case 'cast': return [-0.75 + sway, -2.35 - sway];
      case 'hurt': return [-1.0, -2.2];
      default: return [rest + sway, 1.95 - sway];
    }
  }

  function itemRotation(g, info, fa, kind) {
    const idle = info.idle || 0;
    switch (g.pose) {
      case 'attack': {
        if (info.fixed) return kind === 'cane' ? fa - Math.PI / 2 : idle + 0.25;
        const swing = fa + Math.PI / 2 - 0.4, p = g.poseT;
        return p !== undefined && p !== null && p > 0.55 ? lerp(swing, idle, smooth((p - 0.55) / 0.45)) : swing;
      }
      case 'cast': return kind === 'staff' || kind === 'wand' || kind === 'orb' || kind === 'torch' ? idle - 0.12 : idle - 0.3;
      case 'hurt': return idle - 0.6;
      default: return idle;
    }
  }

  function drawArm(g, n, s, h, aw, sleeve, hand, isBack) {
    const dx = h.x - s.x, dy = h.y - s.y, len = Math.hypot(dx, dy) || 1, bend = 1.5;
    const cx = (s.x + h.x) / 2 - (dy / len) * bend, cy = (s.y + h.y) / 2 + (dx / len) * bend;
    const o = n.outfit, pal = n.pal;
    g.limb(s.x, s.y, h.x, h.y, aw, sleeve, cx, cy);
    if (o === 'rags') g.limb(s.x, s.y, lerp(s.x, h.x, 0.32), lerp(s.y, h.y, 0.32), aw + 0.8, isBack ? shade(pal.cloth, -0.15) : pal.cloth);
    if (o === 'furs') g.limb(lerp(s.x, h.x, 0.66), lerp(s.y, h.y, 0.66), lerp(s.x, h.x, 0.84), lerp(s.y, h.y, 0.84), aw + 0.7, pal.leather || '#6b4423');
    if (o === 'robe' || o === 'dress') g.circle(lerp(s.x, h.x, 0.8), lerp(s.y, h.y, 0.8), aw * 0.82, sleeve);
    if (n.bling.bracelets) g.limb(lerp(s.x, h.x, 0.76), lerp(s.y, h.y, 0.76), lerp(s.x, h.x, 0.86), lerp(s.y, h.y, 0.86), aw + 0.6, pal.metal);
    g.circle(h.x, h.y, aw * 0.64, hand);
    if (n.bling.rings) {
      g.circle(h.x + aw * 0.25, h.y + aw * 0.15, aw * 0.3, null, pal.metal);
      g.circle(h.x + aw * 0.45, h.y - aw * 0.05, aw * 0.16, pal.accent, null);
    }
  }

  function reach(from, to, maxLen) {
    const dx = to.x - from.x, dy = to.y - from.y, d = Math.hypot(dx, dy);
    if (d <= maxLen || d === 0) return { x: to.x, y: to.y };
    return { x: from.x + (dx / d) * maxLen, y: from.y + (dy / d) * maxLen };
  }

  function paintHumanoid(g, n, o) {
    const B = n.build, pal = n.pal, t = o.at, hd = n.head;
    const br = o.still ? 0 : Math.sin(t * 2.2 + o.phase);
    const w = B.w, hipY = -B.lh, shY = -(B.lh + B.th) + br * 0.3;
    const hr = B.hr * hd.size;
    const H = { x: 0, y: shY - hr * 0.8 + br * 0.15, r: hr, fx: hr * 0.24, sy: shY, bw: w };
    if (g.pose === 'attack') H.x += 1.2;
    else if (g.pose === 'hurt') H.x -= 0.8;
    // spec.hunch: the body is sheared forward around the feet (feet and cane tip stay planted) and the head, drawn
    // upright, cranes forward and sinks into the shoulders; a hunched back bulges behind the shoulders
    const hk = n.hunch || 0, sh = 0.2 * hk, c = g.ctx;
    H.x += hr * 0.3 * hk; H.y += hr * 0.25 * Math.max(0, hk);
    const Hs = sh ? { x: H.x - sh * H.y, y: H.y, r: H.r, fx: H.fx, sy: H.sy, bw: H.bw } : H;
    const shear = function (on) { if (!sh) return; if (on) { c.save(); c.transform(1, 0, -sh, 1, 0, 0); } else c.restore(); };
    g.head = { x: Hs.x, y: Hs.y, r: hr };
    g.bodyShear = sh;
    const oc = outfitColors(n);
    const height = -(H.y - hr);
    const info = ITEM_INFO[n.mainhand] || {};
    const angles = armAngles(g, o, info);
    const fa = angles[0], ba = n.offhand === 'shield' && g.pose !== 'cast' && g.pose !== 'hurt' ? 1.3 : angles[1];
    const armL = B.th * 0.62 + 3.6, aw = B.aw;
    const fs = { x: w / 2 - aw * 0.35, y: shY + aw * 0.75 + 0.4 }, bs = { x: -(w / 2 - aw * 0.35), y: shY + aw * 0.75 + 0.4 };
    let fh = { x: fs.x + Math.cos(fa) * armL, y: fs.y + Math.sin(fa) * armL };
    let bh = { x: bs.x + Math.cos(ba) * armL, y: bs.y + Math.sin(ba) * armL };
    const R = itemRotation(g, info, fa, n.mainhand);
    let lute = null;
    if (n.mainhand === 'lute') {
      const strum = (g.pose === 'cast' || g.pose === 'attack' ? Math.sin(t * 22) * 1.2 : Math.sin(t * 3) * 0.4);
      lute = { x: w * 0.12, y: hipY - B.th * 0.28 };
      fh = { x: lute.x + 3.2, y: lute.y + 2.4 + strum };
      bh = reach(bs, { x: lute.x + 6.2, y: lute.y - 11.5 }, armL * 1.6);
    } else if (n.mainhand === 'bow' && n.offhand === 'none') {
      bh = reach(bs, { x: fh.x - 2.5, y: fh.y - 0.5 }, armL * 1.5);
    } else if (info.two && n.offhand === 'none') {
      bh = reach(bs, { x: fh.x - Math.sin(R) * 5.5, y: fh.y + Math.cos(R) * 5.5 }, armL * 1.3);
    }

    if (n.src.mini) g.ellipse(0, 0.5, w * 0.95, w * 0.42, '#3b3940', g.outline);
    drawAura(g, n.aura, 'back', height, w, t);
    shear(true);
    drawWings(g, n.wings, -w * 0.15, shY + Math.max(3, B.th * 0.45), WING_SCALE[n.buildName] || 1, t, pal);
    drawBackExtras(g, n, B, shY, hipY, t);
    drawArm(g, n, bs, bh, aw, shade(oc.sleeve, -0.16), shade(n.outfit === 'armor' ? shade(pal.metal, -0.1) : pal.skin, -0.12), true);
    drawTail(g, n.tail, -w * 0.47, hipY - 1.2, t, pal, clamp(w / 13.5, 0.75, 1.4));
    drawLegs(g, n, B, hipY, oc, o.walk, n.outfit === 'robe' || n.outfit === 'dress');
    if (hk > 0.15) { // the hunched back: a rounded bulge behind the shoulders, in the outfit's colour
      const hc = n.outfit === 'armor' ? pal.metal : (n.outfit === 'none' || n.outfit === 'rags') ? pal.skin : pal.cloth;
      g.shaded(function (p) { p.ellipse(-w * 0.4, shY + B.th * 0.22, w * 0.24 + 3 * hk, B.th * 0.32 + 1.5 * hk, -0.5, 0, TAU); }, hc, { dx: 0.8, dy: -1 });
    }
    drawTorso(g, n, B, shY, hipY, t);
    drawTorsoExtras(g, n, B, shY, hipY, t);
    if (n.outfit === 'armor') pauldron(g, n, bs.x, shY + 1.2, aw);
    drawOffhand(g, n.offhand, bh.x, bh.y, pal, t);
    drawNeckLayer(g, n, B, shY, H, t);

    // main-hand item sits behind the head, the hand gripping it is drawn after the head
    if (lute) drawItem(g, 'lute', lute.x, lute.y, 0, pal, t);
    else if (n.mainhand === 'cane' && g.pose !== 'attack') {
      const wood = pal.wood || WOOD;
      g.limb(fh.x + 0.6, fh.y, fh.x + 2.2, -0.5, 1.7, wood);
      g.limb(fh.x + 0.6, fh.y, fh.x + 4.8, fh.y + 1.4, 1.7, wood, fh.x + 3.2, fh.y - 3.6);
    } else drawItem(g, n.mainhand, fh.x, fh.y, R, pal, t);

    // resting arms tuck under the big head; raised arms (attack/cast) are drawn over it
    const armOverHead = g.pose === 'attack' || g.pose === 'cast';
    const frontArm = function () {
      drawArm(g, n, fs, fh, aw, oc.sleeve, n.outfit === 'armor' ? shade(pal.metal, -0.1) : pal.skin, false);
      if (lute) g.circle(bh.x, bh.y, aw * 0.62, shade(pal.skin, -0.08));
      if (n.outfit === 'armor') pauldron(g, n, fs.x, shY + 1.2, aw * 1.05);
    };
    if (!armOverHead) frontArm();
    shear(false);
    drawHead(g, n, Hs, o);
    shear(true);
    if (armOverHead) frontArm();
    if (g.pose === 'cast') {
      const gc = pal.cast || pal.accent;
      g.glow(fh.x, fh.y, 8, gc, 0.55 + 0.2 * Math.sin(t * 9));
      for (let i = 0; i < 3; i++) {
        const a = t * 4 + i * 2.1;
        g.star(fh.x + Math.cos(a) * 5, fh.y + Math.sin(a) * 4, 1.6, '#fffbe6', null, 4, 0.35);
      }
    }
    shear(false);
    drawAura(g, n.aura, 'front', height, w, t);
  }

  // ---- quadruped -------------------------------------------------------------------------------------------
  function paintQuadruped(g, n, o) {
    const pal = n.pal, sh = n.shape, t = o.at, hd = n.head;
    const long = sh.body !== 'round', legLong = sh.legs === 'long';
    const rx = long ? 13 : 10.5, ry = long ? 6.8 : 8.2;
    const spider = sh.legs === 'spider', legH = spider ? 7 : legLong ? 9 : 4.2, lw = legLong ? 3.2 : 3.7;
    const br = o.still ? 0 : Math.sin(t * 2.6 + o.phase);
    const by = -(legH + ry * 0.72) + br * 0.25;
    const step = o.walk === null || o.walk === undefined ? 0 : Math.sin(o.walk * TAU);
    const fur = pal.skin, belly = pal.belly || (n.given.cloth2 ? pal.cloth2 : shade(fur, 0.3));
    const hr = 7.2 * hd.size;
    const H = spider ? { x: rx * 0.88 + hr * 0.35, y: by - ry * 0.1 + br * 0.2, r: hr, fx: hr * 0.3 } :
      { x: rx * 0.82 + 1.5, y: by - ry * 0.5 - 2.8 + br * 0.3, r: hr, fx: hr * 0.3 };
    if (g.pose === 'attack') { H.x += 2.5; H.y += 1; }
    if (g.pose === 'hurt') H.x -= 1;
    const height = -(H.y - hr);

    drawAura(g, n.aura, 'back', height, rx * 1.4, t);
    if (n.wings !== 'none') drawWings(g, n.wings, -rx * 0.15, by - ry * 0.6, 1.1, t, pal);
    drawTail(g, n.tail, -rx * 0.92, by - ry * 0.3, t, pal, 1.05);
    // legs (far pair darker, slightly offset), paws in belly colour when marked; spiders get 4 bent legs a side
    const legX = [rx * 0.58, -rx * 0.55];
    if (spider) spiderLegs(g, rx, ry, by, fur, o, true);
    for (let pass = 0; pass < 2 && !spider; pass++) {
      for (let i = 0; i < 2; i++) {
        const phase = (i === 0) === (pass === 0) ? step : -step;
        const x = legX[i] + (pass === 0 ? -2 : 0.5) + phase * 1.4, lift = Math.max(0, phase) * 1.3;
        const col = pass === 0 ? shade(fur, -0.2) : fur;
        g.rect(x - lw / 2, by + ry * 0.2, lw, -by - ry * 0.2 - lift, col, undefined, lw * 0.45);
        g.ellipse(x + 0.6, -1.1 - lift, lw * 0.7, 1.3, sh.socks === false ? shade(col, -0.1) : (pass === 0 ? shade(belly, -0.2) : belly));
      }
    }
    g.shaded(function (c) { c.ellipse(0, by, rx, ry, 0, 0, TAU); }, fur, { dx: 1.5, dy: -1.6, hl: [-rx * 0.1, by - ry * 0.6, rx * 0.4, ry * 0.18, 0] });
    const c = g.ctx;
    c.save();
    c.beginPath(); c.ellipse(0, by, rx - 0.6, ry - 0.6, 0, 0, TAU); c.clip();
    c.beginPath(); c.ellipse(rx * 0.25, by + ry * 0.75, rx * 0.85, ry * 0.55, 0, 0, TAU); c.fillStyle = belly; c.fill();
    c.restore();
    if (n.outfit === 'armor') {
      g.path(function (p) { p.moveTo(-rx * 0.6, by - ry * 0.55); p.quadraticCurveTo(0, by - ry * 1.3, rx * 0.6, by - ry * 0.55); p.lineTo(rx * 0.55, by + ry * 0.1); p.quadraticCurveTo(0, by - ry * 0.25, -rx * 0.55, by + ry * 0.1); p.closePath(); }, pal.metal);
    }
    if (n.extras.cape) {
      const cc = pal.cape || pal.cloth;
      g.path(function (p) { p.moveTo(-rx * 0.75, by - ry * 0.35); p.quadraticCurveTo(0, by - ry * 1.4, rx * 0.65, by - ry * 0.55); p.lineTo(rx * 0.25, by + ry * 0.35); p.quadraticCurveTo(-rx * 0.3, by + ry * 0.2 + Math.sin(t * 2.5), -rx * 0.95, by + ry * 0.45); p.closePath(); }, cc);
    }
    if (sh.fluff) {
      for (let i = 0; i < 5; i++) g.circle(rx * 0.72 + Math.cos(i * 1.2) * 1.5, by + ry * (0.1 + i * 0.14), 2.6, belly, null);
      g.arc(rx * 0.72, by + ry * 0.3, ry * 0.55, -1.2, 1.4, rgba(shade(belly, -0.3), 0.8), 0.8);
      for (let i = 0; i < 3; i++) g.circle(-rx * 0.88, by - ry * 0.1 + i * 2.2, 2.3, shade(belly, -0.05), null);
    }
    if (spider) spiderLegs(g, rx, ry, by, fur, o, false);
    // neck + head
    if (!spider) g.limb(rx * 0.55, by - ry * 0.2, H.x - hr * 0.3, H.y + hr * 0.3, hr * 1.0, fur);
    if (n.extras.collar || n.extras.scarf) g.limb(H.x - hr * 0.95, H.y + hr * 0.45, H.x - hr * 0.15, H.y + hr * 0.95, 2.4, n.extras.scarf ? (pal.scarf || pal.accent) : (pal.collar || pal.accent));
    if (n.bling.chain) {
      g.arc(H.x - hr * 0.55, H.y + hr * 0.55, hr * 0.62, 0.4, 2.4, pal.metal, 1.4);
      g.circle(H.x - hr * 0.6, H.y + hr * 1.2, 1.8, pal.metal);
      glint(g, H.x - hr * 0.4, H.y + hr * 1.0, t, 4, 2.4);
    }
    drawQuadHead(g, n, H, o);
    drawAura(g, n.aura, 'front', height, rx * 1.4, t);
  }

  /** Eight jointed legs (four per side): knees above the body, feet spread from back to front. */
  function spiderLegs(g, rx, ry, by, col, o, far) {
    const walk = o.walk === null || o.walk === undefined ? null : o.walk;
    const c2 = far ? shade(col, -0.28) : col;
    for (let i = 0; i < 4; i++) {
      const k = i / 3;
      const hipX = lerp(-rx * 0.3, rx * 0.4, k) + (far ? -1.5 : 0), hipY = by + ry * 0.15;
      const reach = lerp(-1.05, 1.05, k) * rx;
      const step = walk === null ? Math.sin(o.at * 1.5 + i) * 0.25 : Math.sin(walk * TAU * 2 + i * 1.7 + (far ? 1 : 0)) * 1.6;
      const footX = hipX + reach + step, footY = -0.4 - Math.max(0, step) * 0.6;
      const kneeX = hipX + reach * 0.45, kneeY = by - ry * 0.95 - (far ? 1.5 : 0) - Math.abs(reach) * 0.08;
      g.limb(hipX, hipY, kneeX, kneeY, 1.7, c2);
      g.limb(kneeX, kneeY, footX, footY, 1.3, c2);
    }
  }

  function drawQuadHead(g, n, H, o) {
    const pal = n.pal, hd = n.head, sn = n.shape.snout || 'short', t = o.at, r = H.r;
    const fur = pal.skin, muzzle = pal.belly || (n.given.cloth2 ? pal.cloth2 : shade(fur, 0.3));
    drawEars(g, H, hd.ears, false, t);
    drawHat(g, H, hd.hat, 'back', t);
    if (sn === 'long') {
      g.shaded(function (c) {
        c.moveTo(H.x + r * 0.2, H.y - r * 0.35);
        c.quadraticCurveTo(H.x + r * 1.5, H.y - r * 0.2, H.x + r * 1.85, H.y + r * 0.22);
        c.quadraticCurveTo(H.x + r * 1.6, H.y + r * 0.7, H.x + r * 0.2, H.y + r * 0.62);
        c.closePath();
      }, fur, { dx: 0.5, dy: -0.8 });
    }
    g.shaded(function (c) { c.ellipse(H.x, H.y, r * 1.05, r * 0.98, 0, 0, TAU); }, fur,
      { dx: r * 0.16, dy: -r * 0.15, hl: [H.x + r * 0.3, H.y - r * 0.5, r * 0.28, r * 0.14, -0.5] });
    const MH = { x: H.x, y: H.y, r: r, fx: H.fx };
    if (sn === 'long') {
      g.circle(H.x + r * 1.78, H.y + r * 0.15, r * 0.2, '#1d1418', null);
      MH.x += r * 0.95; MH.y -= r * 0.05; MH.fx = 0;
    } else if (sn === 'short') {
      g.ellipse(H.x + r * 0.78, H.y + r * 0.36, r * 0.55, r * 0.42, muzzle);
      g.ellipse(H.x + r * 1.14, H.y + r * 0.16, r * 0.2, r * 0.14, '#1d1418', null);
      MH.x += r * 0.42; MH.fx = 0; MH.y -= r * 0.02;
    } else if (sn === 'beak') {
      g.poly([[H.x + r * 0.55, H.y - r * 0.12], [H.x + r * 1.65, H.y + r * 0.2], [H.x + r * 1.45, H.y + r * 0.55], [H.x + r * 0.55, H.y + r * 0.62]], pal.beak || '#e3b23c');
      g.line(H.x + r * 0.6, H.y + r * 0.3, H.x + r * 1.5, H.y + r * 0.35, shade(pal.beak || '#e3b23c', -0.4), 0.7);
    } else {
      g.ellipse(H.x + r * 0.62, H.y + r * 0.22, r * 0.17, r * 0.12, '#1d1418', null);
    }
    if (hd.blush) drawBlush(g, H);
    drawFace(g, H, hd.face, 'under', hd.eyes);
    if (hd.face !== 'sunglasses' && hd.face !== 'plague_mask') drawEyes(g, H, hd.eyes, o);
    if (sn !== 'beak') drawMouth(g, MH, hd.mouth, o, !!n.bling.grill);
    drawEars(g, H, hd.ears, true, t);
    if (hd.hair !== 'none') drawHairFront(g, H, hd.hair, !!COVERING_HATS[hd.hat], t);
    drawFace(g, H, hd.face, 'over', hd.eyes);
    drawHat(g, H, hd.hat, 'front', t);
    drawHorns(g, H, hd.horns);
    if (n.bling.crown && hd.hat !== 'crown') drawCrown(g, H.x - r * 0.1, H.y - r * 0.85, r * 0.95, r * 0.6, pal.metal, pal.accent);
  }

  // ---- blob (slimes, oozes, gelatinous cubes) ------------------------------------------------------------------
  function paintBlob(g, n, o) {
    const sh = n.shape, pal = n.pal, t = o.at, hd = n.head;
    const wob = clamp(num(sh.wobble, 1), 0, 3);
    const k = o.still ? 0 : Math.sin(t * 3.2 + o.phase) * 0.07 * wob;
    const hgtBase = 18;
    if (sh.cube) { paintCube(g, n, o, k); return; }
    const rx = 12.5 * (1 + k), hgt = hgtBase * (1 - k), top = Math.sin(t * 4.1 + o.phase) * 1.4 * wob;
    const tr = !!sh.translucent;
    const body = function (c) {
      c.moveTo(-rx, -1.2);
      c.bezierCurveTo(-rx - 1, -hgt * 0.7, -rx * 0.5 + top, -hgt, top, -hgt);
      c.bezierCurveTo(rx * 0.5 + top, -hgt, rx + 1, -hgt * 0.7, rx, -1.2);
      c.quadraticCurveTo(rx * 0.5, 1.2, 0, 0.6);
      c.quadraticCurveTo(-rx * 0.5, 1.2, -rx, -1.2);
      c.closePath();
    };
    drawAura(g, n.aura, 'back', hgt, rx, t);
    if (tr) {
      const ins = sh.contents || 'bones';
      if (ins === 'bones' || ins === 'skull') {
        g.circle(-3, -7, 3, '#efe6d2');
        g.circle(-4, -7.3, 0.8, '#3a2a26', null); g.circle(-2, -7.3, 0.8, '#3a2a26', null);
        g.limb(2, -4, 7, -9, 1.2, '#efe6d2');
      } else if (ins === 'coins') {
        for (let i = 0; i < 4; i++) g.ellipse(-5 + i * 3, -4 - (i % 2) * 3, 1.6, 1.1, pal.metal);
      }
      g.path(body, rgba(pal.skin, 0.62));
    } else {
      g.shaded(body, pal.skin, { dx: 1.8, dy: -2, hl: null });
    }
    g.ellipse(-rx * 0.38 + top * 0.5, -hgt * 0.7, rx * 0.22, hgt * 0.1, rgba('#ffffff', 0.55), null, -0.6);
    g.circle(-rx * 0.12 + top * 0.5, -hgt * 0.82, 1, rgba('#ffffff', 0.7), null);
    for (let i = 0; i < 2; i++) { // drips
      const dx = (i ? 0.62 : -0.7) * rx, dl = 1.2 + Math.max(0, Math.sin(t * 2 + i * 3)) * 1.5;
      g.ellipse(dx, -1 + dl * 0.4, 1.2, dl, tr ? rgba(pal.skin, 0.7) : pal.skin, null);
    }
    const H = { x: 1.8 + top * 0.4, y: -hgt * 0.5, r: 8, fx: 1.4 };
    drawFace(g, H, hd.face, 'under', hd.eyes);
    if (hd.face !== 'sunglasses' && hd.face !== 'plague_mask') drawEyes(g, H, hd.eyes, o);
    drawMouth(g, { x: H.x, y: H.y + 0.6, r: 8, fx: H.fx }, hd.mouth, o, !!n.bling.grill);
    drawFace(g, H, hd.face, 'over', hd.eyes);
    const HT = { x: top * 0.8, y: -hgt + 6.5, r: 7, fx: 1.2 };
    drawHat(g, HT, hd.hat, 'front', t);
    drawHorns(g, HT, hd.horns);
    if (n.bling.crown && hd.hat !== 'crown') drawCrown(g, HT.x, -hgt + 1.5, 7, 4.5, pal.metal, pal.accent);
    if (n.bling.chain) { g.arc(H.x, H.y + 2, 6, 0.5, 2.6, pal.metal, 1.3); glint(g, H.x + 2, H.y + 7, t, 2); }
    drawAura(g, n.aura, 'front', hgt, rx, t);
  }

  function paintCube(g, n, o, k) {
    const pal = n.pal, t = o.at, hd = n.head;
    const s = 13, h = 17 * (1 - k * 0.6), j = Math.sin(t * 3.6 + o.phase) * 0.8;
    const base = -s / 2 + 0.5;
    const L = [-s, base], F = [0, base + s / 2], Rr = [s, base], Bk = [0, base - s / 2];
    const up = function (p, dx) { return [p[0] + (dx || 0), p[1] - h]; };
    drawAura(g, n.aura, 'back', h + s, s, t);
    g.limb(-3, base - 6, 4, base - 12, 1.4, '#efe6d2');
    g.circle(-4, base - 13, 2.6, '#efe6d2');
    g.line(5, base - 4, 9, base - 15, '#a7a9b4', 1.3);
    g.ellipse(-6, base - 3, 1.6, 1.1, pal.metal);
    g.ellipse(3, base - 2, 1.6, 1.1, pal.metal);
    const col = pal.skin;
    g.poly([L, F, up(F, j), up(L, j)], rgba(shade(col, -0.15), 0.6));
    g.poly([F, Rr, up(Rr, j), up(F, j)], rgba(col, 0.55));
    g.poly([up(L, j), up(F, j), up(Rr, j), up(Bk, j)], rgba(shade(col, 0.25), 0.6));
    g.line(up(L, j)[0] + 2, up(L, j)[1] + 1, up(F, j)[0] - 1, up(F, j)[1] - 1, rgba('#ffffff', 0.6), 1);
    g.circle(up(Rr, j)[0] - 4, up(Rr, j)[1] + 4, 1.2, rgba('#ffffff', 0.7), null);
    const H = { x: s * 0.48 + j * 0.5, y: base - h * 0.5, r: 7.5, fx: 0 };
    if (hd.face !== 'sunglasses') drawEyes(g, H, hd.eyes, o);
    drawMouth(g, H, hd.mouth, o, !!n.bling.grill);
    drawFace(g, H, hd.face, 'over', hd.eyes);
    drawAura(g, n.aura, 'front', h + s, s, t);
  }

  // ---- flyer (birds, bats, imps, floating eyes, wisps) — hovering is applied by the draw transform --------------
  let impCache = new WeakMap();
  function paintFlyer(g, n, o) {
    const pal = n.pal, t = o.at, hd = n.head, body = n.shape.body || 'bird';
    switch (body) {
      case 'imp': {
        let ni = impCache.get(n);
        if (!ni) {
          ni = Object.assign({}, n, {
            buildName: 'tiny', build: BUILDS.tiny, base: 'humanoid',
            wings: n.wings === 'none' ? 'bat' : n.wings, tail: n.tail === 'none' ? 'devil' : n.tail,
            head: Object.assign({}, hd, { horns: hd.horns === 'none' ? 'demon' : hd.horns, ears: hd.ears === 'none' ? 'pointy' : hd.ears }),
            outfit: n.given && n.src.outfit ? n.outfit : 'none',
          });
          impCache.set(n, ni);
        }
        paintHumanoid(g, ni, o);
        return;
      }
      case 'orb': {
        const r = 10 * hd.size, cy = -r - 1;
        drawAura(g, n.aura, 'back', r * 2, r, t);
        const stalks = clamp(Math.round(num(n.shape.stalks, 0)), 0, 10);
        for (let i = 0; i < stalks; i++) {
          const a = -Math.PI / 2 + (i - (stalks - 1) / 2) * 0.42, wig = Math.sin(t * 2.4 + i * 1.7) * 0.15;
          const ex = Math.cos(a + wig) * r * 1.75, ey = cy + Math.sin(a + wig) * r * 1.65;
          g.limb(Math.cos(a) * r * 0.8, cy + Math.sin(a) * r * 0.8, ex, ey, 1.6, shade(pal.skin, -0.1), Math.cos(a - 0.3) * r * 1.4, cy + Math.sin(a - 0.3) * r * 1.3);
          g.circle(ex, ey, 2.2, '#fbf6ee');
          g.circle(ex + 0.6, ey, 1.1, pal.eye, null);
        }
        g.shaded(function (c) { c.arc(0, cy, r, 0, TAU); }, pal.skin, { dx: r * 0.15, dy: -r * 0.15, hl: [-r * 0.4, cy - r * 0.45, r * 0.3, r * 0.16, -0.6] });
        const blink = g.blink;
        if (!blink && !(o.lying >= 0.6)) {
          g.circle(r * 0.28, cy, r * 0.5, '#fbf6ee', g.outline);
          g.circle(r * 0.36, cy, r * 0.32, pal.eye, null);
          g.circle(r * 0.4, cy, r * 0.15, '#120a0e', null);
          g.circle(r * 0.22, cy - r * 0.18, r * 0.1, '#ffffff', null);
        } else {
          g.arc(r * 0.28, cy, r * 0.4, 0.2 * Math.PI, 0.8 * Math.PI, g.outline, 1.3);
        }
        if (hd.mouth !== 'none') drawMouth(g, { x: r * 0.1, y: cy + r * 0.42, r: r * 0.9, fx: 0 }, hd.mouth, o, !!n.bling.grill);
        const HT = { x: 0, y: cy, r: r, fx: r * 0.3 };
        drawFace(g, HT, hd.face, 'over', 'normal');
        drawHat(g, HT, hd.hat, 'front', t);
        drawHorns(g, HT, hd.horns);
        drawAura(g, n.aura, 'front', r * 2, r, t);
        return;
      }
      case 'wisp': {
        const col = pal.skin, fl = Math.sin(t * 7 + o.phase) * 0.12;
        const c = g.ctx, prev = c.globalCompositeOperation;
        g.glow(0, -9, 16, col, 0.55);
        c.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 4; i++) {
          const p = (t * 0.8 + i / 4) % 1;
          g.circle(Math.sin(p * 6 + i) * 3, -2 + p * 8, 1.6 * (1 - p), rgba(col, 0.8 * (1 - p)), null);
        }
        g.flame(0, -2, 13, 20 * (1 + fl), rgba(col, 0.85), null, Math.sin(t * 3) * 2);
        g.flame(0, -3, 7, 12 * (1 + fl), rgba('#ffffff', 0.75), null, Math.sin(t * 3) * 1.2);
        c.globalCompositeOperation = prev;
        drawEyes(g, { x: 0.5, y: -8, r: 6, fx: 1 }, hd.eyes === 'normal' ? 'glow' : hd.eyes, o);
        drawMouth(g, { x: 0.5, y: -8, r: 6, fx: 1 }, hd.mouth, o, false);
        drawHat(g, { x: 0, y: -13, r: 6, fx: 1 }, hd.hat, 'front', t);
        drawAura(g, n.aura, 'front', 20, 8, t);
        return;
      }
      case 'bat': {
        drawAura(g, n.aura, 'back', 14, 6, t);
        drawWings(g, n.wings === 'none' ? 'bat' : n.wings, 1, -7, 1.05, t, pal);
        const H = { x: 0, y: -7, r: 6 * hd.size, fx: 1.4 };
        drawEars(g, H, hd.ears === 'none' ? 'cat' : hd.ears, false, t);
        g.shaded(function (c) { c.ellipse(0, -6, 6, 6.5, 0, 0, TAU); }, pal.skin, { dx: 1, dy: -1 });
        g.line(-1.5, 0.3, -2, 2.4, g.outline, 1); g.line(1.5, 0.3, 2, 2.4, g.outline, 1);
        drawEyes(g, H, hd.eyes, o);
        drawMouth(g, H, hd.mouth === 'none' ? 'fangs' : hd.mouth, o, !!n.bling.grill);
        drawFace(g, H, hd.face, 'over', hd.eyes);
        drawHat(g, H, hd.hat, 'front', t);
        drawAura(g, n.aura, 'front', 14, 6, t);
        return;
      }
      default: { // bird
        const fe = pal.skin, beak = pal.beak || pal.accent;
        drawAura(g, n.aura, 'back', 18, 8, t);
        const flap = Math.sin(t * 6 + o.phase);
        g.ctx.save(); g.ctx.translate(-1, -8); g.ctx.rotate(-0.5 + flap * 0.35);
        g.path(function (c) { c.moveTo(0, 0); c.quadraticCurveTo(-6, -9, -15, -9); c.lineTo(-12, -5); c.lineTo(-16, -3); c.lineTo(-11, -1); c.quadraticCurveTo(-5, 3, 0, 1); c.closePath(); }, shade(fe, -0.2));
        g.ctx.restore();
        g.poly([[-6, -6], [-14, -9], [-15, -5], [-13, -2], [-6, -3]], shade(fe, -0.1));
        g.line(-1, -1, -1.6, 2.4, beak, 1); g.line(1.5, -1, 1.8, 2.4, beak, 1);
        g.shaded(function (c) { c.ellipse(0, -6, 7.5, 6, 0, 0, TAU); }, fe, { dx: 1, dy: -1, hl: [1.5, -9.5, 3.2, 1.3, -0.3], light: rgba(shade(fe, 0.55), 0.8) });
        const H = { x: 5, y: -12, r: 5.2 * hd.size, fx: 1.2 };
        g.shaded(function (c) { c.arc(H.x, H.y, H.r, 0, TAU); }, fe, { dx: 0.8, dy: -0.8, hl: [H.x + 1.2, H.y - 2.6, 1.8, 0.9, -0.4], light: rgba(shade(fe, 0.55), 0.8) });
        g.poly([[H.x + H.r * 0.7, H.y - H.r * 0.25], [H.x + H.r * 2.0, H.y + H.r * 0.3], [H.x + H.r * 0.7, H.y + H.r * 0.55]], beak);
        drawEyes(g, { x: H.x - 0.5, y: H.y - 0.5, r: H.r, fx: H.fx }, hd.eyes, o);
        drawFace(g, H, hd.face, 'over', hd.eyes);
        drawHat(g, H, hd.hat, 'front', t);
        drawHorns(g, H, hd.horns);
        g.ctx.save(); g.ctx.translate(1, -8); g.ctx.rotate(-0.25 + flap * 0.45);
        g.path(function (c) { c.moveTo(0, 0); c.quadraticCurveTo(-5, -10, -14, -11); c.lineTo(-11, -7); c.lineTo(-15, -5); c.lineTo(-10, -2.5); c.quadraticCurveTo(-5, 2, 0, 1.5); c.closePath(); }, fe);
        g.ctx.restore();
        if (n.extras.scarf || n.extras.collar) g.limb(H.x - 4, H.y + 4, H.x + 1, H.y + 5, 2, pal.scarf || pal.accent);
        drawAura(g, n.aura, 'front', 18, 8, t);
        return;
      }
    }
  }

  // ---- swarm ------------------------------------------------------------------------------------------------
  function paintSwarm(g, n, o) {
    const pal = n.pal, t = o.at, of = n.shape.of || 'rat';
    const count = clamp(Math.round(num(n.shape.count, 5)), 1, 12);
    const flies = of !== 'rat';
    const list = [];
    for (let i = 0; i < count; i++) {
      const a = i * 2.39996 + 0.5, rad = count === 1 ? 0 : 3 + Math.sqrt(i / count) * 11;
      let x = Math.cos(a) * rad * 1.15, y = Math.sin(a) * rad * 0.5 - (flies ? 12 : 1.5);
      if (!o.still) {
        if (flies) { x += Math.sin(t * (2.5 + i * 0.3) + i) * 2.5; y += Math.cos(t * (3.1 + i * 0.2) + i * 2) * 2; }
        else x += Math.sin(t * 5 + i * 1.7) * 0.8;
      }
      list.push({ x: x, y: y, i: i });
    }
    list.sort(function (a, b) { return a.y - b.y; });
    drawAura(g, n.aura, 'back', 20, 14, t);
    for (let k = 0; k < list.length; k++) drawCritter(g, of, list[k].x, list[k].y, list[k].i, pal, t, o);
    if (n.bling.crown || n.head.hat === 'crown') {
      const lead = list[list.length - 1];
      drawCrown(g, lead.x + 2.5, lead.y - 5, 8.5, 6.5, pal.metal, pal.accent);
      glint(g, lead.x + 5, lead.y - 10, t, 6, 2.6);
    }
    drawAura(g, n.aura, 'front', 20, 14, t);
  }

  function drawCritter(g, of, x, y, i, pal, t, o) {
    const col = i % 3 === 1 ? shade(pal.skin, -0.12) : pal.skin;
    const c = g.ctx, lw0 = g.lw;
    g.lw = lw0 * 0.6; // tiny bodies: keep the fill readable
    c.save();
    c.translate(x, y);
    if (i % 4 === 3) c.scale(-1, 1);
    switch (of) {
      case 'bat': {
        const f = Math.sin(t * 14 + i);
        g.poly([[0, -1], [-6, -4 - f * 3], [-4, 0], [-1, 1]], shade(col, -0.2));
        g.poly([[0, -1], [6, -4 - f * 3], [4, 0], [1, 1]], shade(col, -0.2));
        g.circle(0, -0.5, 2.4, col);
        g.circle(0.9, -1, 0.5, pal.eye === DEFAULT_PAL.eye ? '#ffd23f' : pal.eye, null);
        break;
      }
      case 'bee': {
        const f = Math.sin(t * 30 + i) * 0.5 + 0.5;
        g.ellipse(-0.8, -3, 1.6, 2.3 * (0.6 + f * 0.4), rgba('#ffffff', 0.7), rgba(g.outline, 0.6), -0.4);
        g.ellipse(0, 0, 3.2, 2.2, pal.accent === DEFAULT_PAL.accent ? '#ffcc33' : pal.accent);
        g.line(-0.6, -1.9, -0.6, 1.9, g.outline, 0.9); g.line(1.1, -1.8, 1.1, 1.8, g.outline, 0.9);
        g.poly([[-3.1, 0], [-4.6, -0.4], [-3.1, 0.8]], g.outline, null);
        g.circle(2.4, -0.4, 0.5, g.outline, null);
        break;
      }
      case 'pixie': {
        const f = Math.sin(t * 22 + i);
        g.glow(0, 0, 6, pal.accent, 0.45);
        g.ellipse(-1.5, -2, 2.2, 3.2 * (0.7 + 0.3 * Math.abs(f)), rgba('#e0fbff', 0.7), rgba(g.outline, 0.5), -0.5);
        g.ellipse(1.5, -2, 2.2, 3.2 * (0.7 + 0.3 * Math.abs(f)), rgba('#e0fbff', 0.7), rgba(g.outline, 0.5), 0.5);
        g.circle(0, 0.5, 1.7, col);
        g.circle(0, -2, 1.9, pal.skin);
        g.circle(0.7, -2.2, 0.45, g.outline, null);
        break;
      }
      default: { // rat
        g.limb(-3.5, 0, -8, 1.2 + Math.sin(t * 6 + i) * 0.8, 0.8, pal.tail || '#e3a0a6', -6, 2.5);
        g.ellipse(0, -2, 4.2, 2.8, col);
        g.circle(3.4, -2.8, 2.1, col);
        g.circle(2.6, -4.8, 1.3, pal.inner || '#f4a3b5');
        g.circle(5.4, -2.6, 0.55, '#f4a3b5', null);
        g.circle(3.9, -3.3, 0.5, pal.eye === DEFAULT_PAL.eye ? '#1a1014' : pal.eye, null);
        break;
      }
    }
    c.restore();
    g.lw = lw0;
  }

  // ---- construct (golems, animated armour, totems) ---------------------------------------------------------------
  let armorCache = new WeakMap();
  function paintConstruct(g, n, o) {
    const pal = n.pal, t = o.at, kind = n.shape.kind || 'golem', hd = n.head;
    if (kind === 'armor') {
      let na = armorCache.get(n);
      if (!na) {
        na = Object.assign({}, n, {
          base: 'humanoid', outfit: 'armor',
          pal: Object.assign({}, pal, { skin: '#141018' }),
          head: Object.assign({}, hd, { hat: hd.hat === 'none' ? 'helmet' : hd.hat, eyes: hd.eyes === 'normal' ? 'glow' : hd.eyes, blush: false, hair: 'none' }),
        });
        if (!n.given.eye) na.pal.eye = '#7af0ff';
        armorCache.set(n, na);
      }
      paintHumanoid(g, na, o);
      return;
    }
    if (kind === 'totem') {
      drawAura(g, n.aura, 'back', 40, 10, t);
      const segs = [{ w: 16, h: 11, c: pal.skin }, { w: 14.5, h: 10, c: shade(pal.skin, -0.08) }, { w: 13, h: 10, c: pal.skin }];
      let y = 0;
      g.rect(-2, -2, 4, 3, shade(pal.skin, -0.3), undefined, 1);
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i];
        y -= s.h;
        g.shaded(function (c) { roundRect(c, -s.w / 2, y, s.w, s.h, 2); }, s.c, { dx: 1.2, dy: -0.8 });
        g.rect(-s.w / 2, y + s.h - 2.2, s.w, 1.6, i % 2 ? pal.cloth2 : pal.cloth, null);
        const H = { x: 0.8, y: y + s.h * 0.45, r: s.h * 0.5, fx: 0.5 };
        drawEyes(g, H, i === segs.length - 1 ? (hd.eyes === 'normal' ? 'glow' : hd.eyes) : (i ? 'angry' : 'sleepy'), o);
        drawMouth(g, { x: 0.8, y: y + s.h * 0.4, r: s.h * 0.5, fx: 0.5 }, i === 0 ? 'frown' : i === 1 ? 'grin' : (hd.mouth === 'none' ? 'open' : hd.mouth), { lying: 0 }, false);
      }
      const wy = y + 3, wc = pal.accent;
      g.poly([[-6, wy], [-15, wy - 6], [-13, wy + 1], [-16, wy + 3], [-6, wy + 4]], wc);
      g.poly([[6, wy], [15, wy - 6], [13, wy + 1], [16, wy + 3], [6, wy + 4]], wc);
      drawHat(g, { x: 0, y: y + 5, r: 6.5, fx: 0.5 }, hd.hat, 'front', t);
      drawAura(g, n.aura, 'front', 40, 10, t);
      return;
    }
    // golem
    const br = o.still ? 0 : Math.sin(t * 1.6 + o.phase) * 0.6;
    const stone = pal.skin, glow = n.given.accent ? pal.accent : '#7af0ff', eyeC = n.given.eye ? pal.eye : glow;
    const moss = n.given.cloth2 ? pal.cloth2 : null;
    drawAura(g, n.aura, 'back', 38, 14, t);
    const swing = g.pose === 'attack' ? -0.9 : g.pose === 'cast' ? -0.5 : g.pose === 'hurt' ? 0.3 : br * 0.04;
    const arm = function (x, front) {
      const c = g.ctx; c.save(); c.translate(x, -24 + br); c.rotate(front ? swing : -swing * 0.5);
      g.shaded(function (p) { roundRect(p, -3.4, -1, 6.8, 12, 2); }, front ? stone : shade(stone, -0.15), { dx: 0.8, dy: -0.8 });
      g.shaded(function (p) { roundRect(p, -4.6, 9.5, 9.2, 7, 2.5); }, front ? shade(stone, -0.05) : shade(stone, -0.2), { dx: 0.8, dy: -0.8 });
      c.restore();
    };
    arm(-11.5, false);
    g.shaded(function (p) { roundRect(p, -8, -8, 6.5, 8, 1.5); }, shade(stone, -0.15), { dx: 0.8, dy: -0.8 });
    g.shaded(function (p) { roundRect(p, 1.5, -8, 6.5, 8, 1.5); }, stone, { dx: 0.8, dy: -0.8 });
    g.shaded(function (p) { roundRect(p, -11, -27 + br, 22, 20, 4); }, stone, { dx: 1.6, dy: -1.6, hl: [-3, -23 + br, 4, 1.6, -0.2] });
    g.line(-7, -22 + br, -3, -17 + br, shade(stone, -0.4), 0.9);
    g.line(-3, -17 + br, -5, -12 + br, shade(stone, -0.4), 0.9);
    g.line(6, -25 + br, 8, -20 + br, shade(stone, -0.4), 0.9);
    g.glow(1.5, -17 + br, 6, glow, 0.5 + 0.2 * Math.sin(t * 3));
    drawRune(g, 1.5, -17 + br, 3, glow, 3);
    if (moss) { g.ellipse(-6, -26 + br, 4, 1.6, moss, null); g.ellipse(7, -9, 2.5, 1.2, moss, null); }
    g.shaded(function (p) { roundRect(p, -5.5, -36 + br * 1.2, 11, 10, 2.5); }, stone, { dx: 1, dy: -1 });
    g.rect(-3.8, -32.5 + br * 1.2, 8.6, 2.6, '#1d1418', null, 1);
    const eyesOn = !(o.lying >= 0.6);
    if (eyesOn) {
      g.glow(-1.2, -31.2 + br * 1.2, 3.5, eyeC, 0.7); g.glow(3.2, -31.2 + br * 1.2, 3.5, eyeC, 0.7);
      g.rect(-2.4, -32 + br * 1.2, 2.2, 1.4, eyeC, null); g.rect(2.1, -32 + br * 1.2, 2.2, 1.4, eyeC, null);
    }
    drawHat(g, { x: 0, y: -29.5 + br, r: 6.4, fx: 0.5 }, hd.hat, 'front', t);
    drawHorns(g, { x: 0, y: -31 + br, r: 6.4, fx: 0.5 }, hd.horns);
    arm(11.5, true);
    if (n.bling.chain) { g.arc(0, -27 + br, 7, 0.4, 2.7, pal.metal, 1.6); glint(g, 0, -20 + br, t, 5); }
    drawAura(g, n.aura, 'front', 38, 14, t);
  }

  // ---- custom painter (spec.draw) ---------------------------------------------------------------------------
  const broken = new WeakSet();
  function runContent(label, fn, n, g, o) {
    let ok = false;
    const c = g.ctx;
    c.save();
    DD.safe(label + (n.id ? ' (' + n.id + ')' : ''), function () { fn.call(n.src, g, g.t, o.user); ok = true; });
    c.restore();
    return ok;
  }
  function paintCustom(g, n, o) {
    if (!n.draw || broken.has(n.src) || !runContent('sprite draw', n.draw, n, g, o)) {
      broken.add(n.src);
      paintHumanoid(g, normalize(PLACEHOLDER_SPEC), o);
    }
  }

  // ---- sheep (polymorph status) -----------------------------------------------------------------------------
  function paintSheep(g, o) {
    const t = o.at, hop = o.still ? 0 : Math.abs(Math.sin(t * 3.4 + o.phase)) * 1.6;
    const wool = '#f4f1ea', face = '#2a2328', c = g.ctx;
    for (let i = 0; i < 4; i++) {
      const x = [-6, -2.5, 3, 6.5][i];
      g.rect(x - 1.1, -6, 2.2, 6 - (i % 2 ? hop * 0.4 : 0), i < 2 ? shade(face, -0.2) : face, undefined, 0.8);
    }
    const blobs = [[-6, -11], [-2, -14], [3, -14], [6.5, -11], [2, -8.5], [-4, -8], [0, -11]];
    c.save(); c.translate(0, -hop);
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < blobs.length; i++) {
        c.beginPath(); c.arc(blobs[i][0], blobs[i][1], 4.6, 0, TAU);
        if (pass === 0) { c.strokeStyle = g.outline; c.lineWidth = g.lw * 2; c.stroke(); }
        else { c.fillStyle = i === 6 ? '#ffffff' : wool; c.fill(); }
      }
    }
    g.ellipse(9.5, -13, 3.6, 4.2, face);
    g.ellipse(7.2, -15.5, 2.2, 1.1, face, undefined, -0.5);
    g.circle(10.5, -14, 0.9, '#ffffff', null);
    g.circle(10.8, -14, 0.45, face, null);
    for (let i = 0; i < 3; i++) g.circle(8 + i * 1.6, -17.2, 1.5, wool, null);
    c.restore();
  }

  // ---- draw pipeline --------------------------------------------------------------------------------------------
  const BASE_PAINTERS = { humanoid: paintHumanoid, quadruped: paintQuadruped, blob: paintBlob, flyer: paintFlyer, swarm: paintSwarm, construct: paintConstruct, custom: paintCustom };

  // "Unpainted miniature" — what a unit looks like when its def has no (valid) sprite.
  const PLACEHOLDER_SPEC = {
    base: 'humanoid', build: 'normal', outfit: 'robe', mainhand: 'staff', mini: true,
    palette: { skin: '#a9a7b0', cloth: '#8f8d97', cloth2: '#7d7b85', hair: '#8f8d97', metal: '#b9b7c1', eye: '#55535d', accent: '#c9c7d1', outline: '#2b2a31' },
    head: { hat: 'hood', eyes: 'normal', mouth: 'frown', blush: false },
  };

  const POSE_LEAN = { attack: 0.1, hurt: -0.13, cast: -0.05 };
  const TINTS = [ // status -> body tint (strongest listed first)
    ['frozen', '#8fd8ff', 0.5], ['burn', '#ff7a1a', 0.2], ['poison', '#62d650', 0.22], ['invulnerable', '#ffe680', 0.1],
    ['charmed', '#ff8ad8', 0.14], ['wet', '#5fa8ff', 0.12],
  ];
  const brokenOverlays = new WeakSet();
  const stats = { portraitRenders: 0 };

  function nowMs() { return (window.performance && performance.now) ? performance.now() : Date.now(); }
  function hasSt(st, id) { return !!st && (st instanceof Set ? st.has(id) : Array.isArray(st) ? st.indexOf(id) >= 0 : !!st[id]); }

  function hoverHeight(n, o) {
    let h = o.hover;
    if (h === undefined || h === null) h = n.hover;
    // hover: true means "this unit flies" (drawUnit/metrics/portraits pass it for flags.flying): a spec that sets its
    // own px height keeps it, otherwise the numeric spec key was dead for every flying unit (review fix, see
    // docs/notes/hero-syllamin.md "Core fixes")
    if (h === true && typeof n.hover === 'number' && isFinite(n.hover)) h = n.hover;
    if (h === undefined || h === null) h = n.base === 'flyer';
    if (h === true) h = n.base === 'flyer' ? 10 : 7;
    return typeof h === 'number' && isFinite(h) ? h : 0;
  }

  function resolveOpts(n, opts, zoom) {
    const st = opts.statuses || null;
    const frozen = hasSt(st, 'frozen');
    const T = num(opts.t, 0), phase = num(opts.phase, 0);
    const pose = OPTIONS.poses.indexOf(opts.pose) >= 0 ? opts.pose : 'idle';
    const lying = clamp(num(opts.lying, pose === 'downed' ? 1 : 0), 0, 1);
    const still = frozen || opts.still === true;
    let lean = num(opts.lean, POSE_LEAN[pose] || 0);
    if (pose === 'attack' && typeof opts.poseT === 'number') lean = 0.13 * Math.sin(Math.PI * clamp(opts.poseT, 0, 1));
    const o = {
      t: T, at: frozen ? 0 : T, still: still, phase: phase,
      facing: opts.facing < 0 ? -1 : 1,
      pose: lying >= 0.5 ? 'idle' : pose === 'downed' ? 'idle' : pose,
      poseT: typeof opts.poseT === 'number' ? clamp(opts.poseT, 0, 1) : undefined,
      flash: clamp(num(opts.flash, 0), 0, 1), flashColor: validColor(opts.flashColor) ? opts.flashColor : '#ffffff',
      alpha: clamp(num(opts.alpha, 1), 0, 1),
      bob: num(opts.bob, 1),
      walk: typeof opts.walk === 'number' ? opts.walk : null,
      lying: lying, lean: lean,
      scaleMul: clamp(num(opts.scale, 1), 0, 6),
      squash: clamp(num(opts.squash, 0), -1, 1),
      offX: num(opts.offX, 0), offY: num(opts.offY, 0), lift: num(opts.lift, 0),
      tint: validColor(opts.tint) ? opts.tint : null, tintAmt: clamp(num(opts.tintAmt, opts.tint ? 0.4 : 0), 0, 1),
      spin: num(opts.spin, 0),
      hover: opts.hover,
      zoom: zoom, unit: opts.unit || null, statuses: st, spec: n.src,
      dizzy: !!opts.dizzy,
    };
    if (typeof opts.blink === 'boolean') o.blink = opts.blink;
    else o.blink = !still && lying < 0.5 && ((T + phase * 1.7) % 4.3) < 0.11;
    if (!o.tint && st) {
      for (let i = 0; i < TINTS.length; i++) {
        if (!hasSt(st, TINTS[i][0])) continue;
        o.tint = TINTS[i][1];
        o.tintAmt = TINTS[i][0] === 'burn' ? 0.12 + 0.14 * Math.abs(Math.sin(T * 9 + phase)) :
          TINTS[i][0] === 'poison' ? TINTS[i][2] + 0.08 * Math.sin(T * 3) : TINTS[i][2];
        break;
      }
    }
    if (hasSt(st, 'stealth')) o.alpha *= 0.42 + 0.06 * Math.sin(T * 5 + phase);
    o.user = { t: T, pose: o.pose, poseT: o.poseT, facing: o.facing, unit: o.unit, zoom: zoom, walk: o.walk, lying: lying, statuses: st, still: still };
    return o;
  }

  function lineWidthFor(n) { return 1.9 / Math.sqrt(Math.max(0.3, n.scale)); }

  /** ctx origin = feet (screen px). Applies scale/facing/squash/lying/lean/bob/hover and paints in local units. */
  function paintAll(ctx, n, o, s, sheep) {
    const sq = o.squash;
    ctx.scale(s * o.facing * (1 + 0.12 * sq), s * (1 - 0.12 * sq));
    if (o.lying > 0) { // fall over backwards around the feet and rest the back on the ground
      const M = metricsN(n), H = sheep ? 18 : M.height;
      ctx.translate(o.lying * H * 0.4, -o.lying * (sheep ? 6 : M.width * 0.3 + 1));
      ctx.rotate(-o.lying * Math.PI / 2);
    }
    if (o.lean) ctx.rotate(o.lean);
    if (o.spin) { // tumbling through the air (thrown): turn around the middle of the body, not the feet
      const mid = (sheep ? 18 : metricsN(n).height) * 0.45;
      ctx.translate(0, -mid); ctx.rotate(o.spin); ctx.translate(0, mid);
    }
    const bobY = o.still ? 0 : Math.sin(o.at * 2.6 + o.phase) * 0.6 * o.bob;
    const hov = hoverHeight(n, o) * (1 - o.lying);
    const hovBob = hov && !o.still ? Math.sin(o.at * 2 + o.phase) * 1.6 : 0;
    ctx.translate(0, bobY - hov - hovBob);
    ctx.lineJoin = 'round';
    const g = new Painter(ctx, n.pal, { t: o.at, lw: lineWidthFor(n), facing: o.facing, pose: o.pose, poseT: o.poseT, spec: n.src, unit: o.unit, specScale: n.scale, zoom: o.zoom, blink: o.blink });
    if (sheep) { paintSheep(g, o); return; }
    (BASE_PAINTERS[n.base] || paintHumanoid)(g, n, o);
    if (n.overlay && !brokenOverlays.has(n.overlay) && !runContent('sprite overlay', n.overlay, n, g, o)) brokenOverlays.add(n.overlay);
  }

  const bufPool = [];
  let bufDepth = 0;
  function drawBuffered(ctx, n, o, X, Y, s, sheep) {
    const m = ctx.getTransform ? ctx.getTransform() : null;
    const dev = m ? clamp(Math.hypot(m.a, m.b), 0.25, 4) : 1;
    const B = n.bounds, k = s * dev;
    const pad = 4;
    const bw = Math.ceil((B.r - B.l) * k) + pad * 2, bh = Math.ceil((B.b - B.t) * k) + pad * 2;
    if (bw > 2400 || bh > 2400 || bw < 2 || bh < 2) return false;
    if (!bufPool[bufDepth]) {
      // CPU-backed: repainted and composited every frame; a GPU-promoted buffer pays a flush per sprite.
      bufPool[bufDepth] = makeCanvas(bw, bh);
      bufPool[bufDepth].getContext('2d', { willReadFrequently: true });
    }
    const buf = bufPool[bufDepth];
    if (buf.width < bw || buf.height < bh) { buf.width = Math.max(buf.width, bw); buf.height = Math.max(buf.height, bh); }
    const b = buf.getContext('2d');
    bufDepth++;
    try {
      b.setTransform(1, 0, 0, 1, 0, 0);
      b.globalAlpha = 1; b.globalCompositeOperation = 'source-over'; b.filter = 'none';
      b.clearRect(0, 0, bw, bh);
      const ox = -B.l * k + pad, oy = -B.t * k + pad;
      b.save();
      b.translate(ox, oy);
      b.scale(dev, dev);
      paintAll(b, n, o, s, sheep);
      b.restore();
      b.setTransform(1, 0, 0, 1, 0, 0);
      b.globalCompositeOperation = 'source-atop';
      if (o.tintAmt > 0.01 && o.tint) { b.globalAlpha = o.tintAmt; b.fillStyle = o.tint; b.fillRect(0, 0, bw, bh); }
      if (o.flash > 0.01) { b.globalAlpha = o.flash; b.fillStyle = o.flashColor; b.fillRect(0, 0, bw, bh); }
      b.globalAlpha = 1; b.globalCompositeOperation = 'source-over';
      ctx.save();
      ctx.globalAlpha *= o.alpha;
      ctx.drawImage(buf, 0, 0, bw, bh, X - ox / dev, Y - oy / dev, bw / dev, bh / dev);
      ctx.restore();
    } finally {
      bufDepth--;
    }
    return true;
  }

  function drawDirect(ctx, n, o, X, Y, s, sheep) {
    ctx.save();
    ctx.translate(X, Y);
    if (o.alpha < 1) ctx.globalAlpha *= o.alpha;
    paintAll(ctx, n, o, s, sheep);
    ctx.restore();
  }

  /**
   * spec.underlay(g, t, opts): painted before (behind) the body at ground level (no hover, bob, lean or jump lift),
   * never tinted or flashed with it: spotlights, floor glyphs, light cones behind a unit.
   */
  const brokenUnderlays = new WeakSet();
  function drawUnderlay(ctx, n, o, X, Y, s) {
    if (!n.underlay || brokenUnderlays.has(n.underlay)) return;
    ctx.save();
    ctx.translate(X, Y);
    if (o.alpha < 1) ctx.globalAlpha *= o.alpha;
    ctx.scale(s * o.facing, s);
    ctx.lineJoin = 'round';
    const g = new Painter(ctx, n.pal, { t: o.at, lw: lineWidthFor(n), facing: o.facing, pose: o.pose, poseT: o.poseT, spec: n.src, unit: o.unit, specScale: n.scale, zoom: o.zoom });
    g.lying = o.lying;
    if (!runContent('sprite underlay', n.underlay, n, g, o)) brokenUnderlays.add(n.underlay);
    ctx.restore();
  }

  /**
   * Grapples explain the Root: no vines on a held unit (Slate's Grappled, or any status def flagged `holds` or the
   * engine's `noMove`).
   */
  function heldFast(st) {
    if (!st) return false;
    const ids = st instanceof Set ? Array.from(st) : Array.isArray(st) ? st : Object.keys(st).filter(function (k) { return st[k]; });
    for (let i = 0; i < ids.length; i++) {
      if (ids[i] === 'sla_grappled') return true;
      const d = DD.getStatus ? DD.getStatus(ids[i]) : null;
      if (d && (d.holds || d.noMove)) return true;
    }
    return false;
  }

  /** Knocked-out birdies: little stars circling the head of a downed unit. */
  function drawDizzy(ctx, n, o, X, Y, s, sheep) {
    const M = metricsN(n), H = sheep ? 18 : M.height, T = o.t;
    ctx.save();
    ctx.translate(X, Y);
    ctx.scale(s, s);
    const g = new Painter(ctx, n.pal, { t: T, lw: lineWidthFor(n) * 0.7, facing: 1, specScale: n.scale });
    const hx = -o.facing * H * 0.48, hy = -M.width * 0.3 - 9;
    for (let i = 0; i < 3; i++) {
      const a = T * 2.6 + (i * TAU) / 3;
      g.star(hx + Math.cos(a) * 7, hy + Math.sin(a) * 2.2, 2.4, i === 1 ? '#7af0ff' : '#ffe14a', g.outline, 5, 0.45);
    }
    ctx.restore();
  }

  /** Status visuals drawn over the sprite (not tinted): stars, Zzz, hearts, flames, bubbles, ice, drips, shield, vines. */
  function drawStatusFx(ctx, n, o, X, Y, s, sheep) {
    const st = o.statuses;
    if (!st) return;
    const M = metricsN(n), T = o.t;
    const h = (sheep ? 18 : M.height) * (1 - o.lying * 0.6), w = sheep ? 18 : M.width;
    const hov = hoverHeight(n, o) * (1 - o.lying);
    ctx.save();
    ctx.translate(X, Y);
    ctx.scale(s, s);
    const g = new Painter(ctx, n.pal, { t: T, lw: lineWidthFor(n), facing: 1, spec: n.src, specScale: n.scale, zoom: o.zoom });
    const top = -h - hov - 3;
    if (hasSt(st, 'stun')) {
      for (let i = 0; i < 3; i++) {
        const a = T * 3.2 + (i * TAU) / 3;
        g.star(Math.cos(a) * w * 0.45, top + Math.sin(a) * 2.2, 2.6, '#ffe14a', g.outline, 5, 0.45);
      }
    }
    if (hasSt(st, 'sleep')) {
      for (let i = 0; i < 3; i++) {
        const p = (T * 0.6 + i / 3) % 1;
        ctx.save(); ctx.globalAlpha *= Math.sin(p * Math.PI);
        g.text('z', w * 0.25 + p * 7 + Math.sin(p * 6) * 1.5, top - p * 12, 5 + p * 4, '#dfe8ff');
        ctx.restore();
      }
    }
    if (hasSt(st, 'charmed')) {
      for (let i = 0; i < 2; i++) {
        const p = (T * 0.5 + i / 2) % 1;
        ctx.save(); ctx.globalAlpha *= Math.sin(p * Math.PI);
        g.heart((i ? 4 : -4) + Math.sin(p * 5) * 1.5, top - p * 9, 2.4, '#ff6fae', g.outline);
        ctx.restore();
      }
    }
    if (hasSt(st, 'confused')) {
      const a = T * 2.5;
      g.text('?', Math.cos(a) * w * 0.4, top - 2 + Math.sin(a) * 1.5, 8, '#c9a8ff');
      g.text('?', Math.cos(a + Math.PI) * w * 0.4, top - 2 + Math.sin(a + Math.PI) * 1.5, 6, '#c9a8ff');
    }
    if (hasSt(st, 'burn')) {
      const prev = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) {
        const fl = Math.sin(T * 10 + i * 2) * 0.2;
        const x = (i - 1) * w * 0.32, y = -h * (0.2 + 0.25 * ((i * 7) % 3) / 2);
        g.flame(x, y, 4.5, 8 * (1 + fl), rgba('#ff6a1a', 0.85), null, Math.sin(T * 6 + i));
        g.flame(x, y, 2.2, 4.6 * (1 + fl), rgba('#ffe066', 0.9), null, Math.sin(T * 6 + i) * 0.5);
      }
      ctx.globalCompositeOperation = prev;
    }
    if (hasSt(st, 'poison')) {
      for (let i = 0; i < 3; i++) {
        const p = (T * 0.7 + i / 3) % 1, x = (hash01(i, 21) - 0.5) * w + Math.sin(p * 6 + i) * 1.5;
        g.circle(x, -h * 0.3 - p * h * 0.8, 1.2 + p, rgba('#7be04a', 0.8 * (1 - p)), rgba('#2f6b1a', 0.8 * (1 - p)));
      }
    }
    if (hasSt(st, 'frozen')) {
      const ice = [[-w * 0.45, -2, 5, -0.3], [w * 0.4, -3, 6, 0.25], [-w * 0.15, -h * 0.55, 4, -0.1], [w * 0.3, -h * 0.75, 3.5, 0.4]];
      for (let i = 0; i < ice.length; i++) {
        const q = ice[i];
        ctx.save(); ctx.translate(q[0], q[1]); ctx.rotate(q[3]);
        g.poly([[0, -q[2] * 1.4], [q[2] * 0.55, 0], [0, q[2] * 0.4], [-q[2] * 0.55, 0]], rgba('#dff6ff', 0.75), rgba('#3a7fb0', 0.9));
        g.line(-q[2] * 0.15, -q[2] * 0.8, q[2] * 0.1, -q[2] * 0.1, rgba('#ffffff', 0.9), 0.7);
        ctx.restore();
      }
    }
    if (hasSt(st, 'wet')) {
      for (let i = 0; i < 2; i++) {
        const p = (T * 0.9 + i / 2) % 1;
        g.ellipse((i ? 0.35 : -0.3) * w, -h * 0.5 + p * h * 0.45, 0.9, 1.4, rgba('#6fb8ff', 0.85 * (1 - p)), null);
      }
    }
    if (hasSt(st, 'invulnerable')) {
      // a golden force bubble (a flat gold tint washed big sprites out into ghosts): faint fill, shimmering rim, a
      // glint sliding around it
      const rx = w * 0.62 + 4, ry = (h + hov) * 0.55 + 3, cy = -(h + hov) * 0.5;
      const p = 0.5 + 0.5 * Math.sin(T * 3);
      ctx.save();
      ctx.beginPath(); ctx.ellipse(0, cy, rx, ry, 0, 0, TAU);
      ctx.fillStyle = rgba('#ffe680', 0.06 + 0.04 * p); ctx.fill();
      ctx.lineWidth = 1.1; ctx.strokeStyle = rgba('#ffd84a', 0.5 + 0.25 * p); ctx.stroke();
      const a0 = T * 1.6;
      ctx.beginPath(); ctx.ellipse(0, cy, rx, ry, 0, a0, a0 + 0.9);
      ctx.lineWidth = 1.8; ctx.lineCap = 'round'; ctx.strokeStyle = rgba('#fffbe6', 0.85); ctx.stroke();
      ctx.restore();
    }
    if (hasSt(st, 'root') && !heldFast(st)) {
      for (let i = 0; i < 4; i++) {
        const x = (i - 1.5) * w * 0.3, sw = Math.sin(T * 2 + i) * 0.8;
        g.limb(x, 0.5, x + (i % 2 ? 2.5 : -2.5) + sw, -5 - (i % 2) * 2, 1.2, '#4f8f3a', x + (i % 2 ? -2 : 2), -2.5);
      }
      g.ellipse(0, 0.5, w * 0.6, 1.6, rgba('#3f6b2c', 0.7), null);
    }
    ctx.restore();
  }

  function draw(ctx, spec, sx, sy, zoom, opts) {
    if (!ctx) return;
    opts = opts || {};
    zoom = num(zoom, 1);
    const n = normalize(spec, opts.id);
    const o = resolveOpts(n, opts, zoom);
    if (o.alpha <= 0.003 || o.scaleMul <= 0) return;
    const sheep = hasSt(o.statuses, 'sheep');
    const s = zoom * (sheep ? clamp(n.scale, 0.8, 1.6) : n.scale) * o.scaleMul;
    const X = sx + o.offX * zoom, Y = sy + (o.offY - o.lift) * zoom;
    // opts.underlay / opts.statusFx === false: the bare body (silhouette masks, portraits, measurements)
    if (n.underlay && opts.underlay !== false) drawUnderlay(ctx, n, o, X, sy + o.offY * zoom, s);
    const buffered = o.flash > 0.01 || (o.tint && o.tintAmt > 0.01) || o.alpha < 0.999;
    if (!buffered || !drawBuffered(ctx, n, o, X, Y, s, sheep)) drawDirect(ctx, n, o, X, Y, s, sheep);
    if (o.statuses && opts.statusFx !== false) drawStatusFx(ctx, n, o, X, Y, s, sheep);
    if (o.dizzy && o.lying >= 0.9 && o.alpha > 0.5 && opts.statusFx !== false) drawDizzy(ctx, n, o, X, Y, s, sheep);
  }

  /** Soft ground shadow under a sprite (the world renderer may draw its own). */
  function drawShadow(ctx, specOrUnit, sx, sy, zoom, alpha) {
    const M = metrics(specOrUnit);
    const k = M.hover ? 0.75 : 1;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,' + clamp(num(alpha, 0.3) * k, 0, 1) + ')';
    ctx.beginPath();
    ctx.ellipse(sx, sy, Math.max(4, M.width * 0.55) * zoom * k, Math.max(2, M.width * 0.22) * zoom * k, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  // ---- metrics ---------------------------------------------------------------------------------------------------
  const HAT_EXTRA = { wizard: 1.75, tophat: 1.15, plague: 0.45, helmet: 0.3, viking: 0.7, mortarboard: 0.4, crown: 0.6, hood: 0.25, cowl: 0.15, beret: 0.3, flowers: 0.15, mushroom: 0.9 };
  function metricsN(n) {
    if (n._m) return n._m;
    let height = 40, width = 24, headY = -28;
    const hd = n.head;
    switch (n.base) {
      case 'humanoid': {
        const B = n.build, hr = B.hr * hd.size, shY = -(B.lh + B.th);
        headY = shY - hr * 0.8 + hr * 0.25 * Math.max(0, n.hunch || 0);
        height = -(headY - hr) + (HAT_EXTRA[hd.hat] || 0) * hr + (hd.horns !== 'none' ? hr * 0.5 : 0) + (hd.ears === 'rabbit' ? hr * 0.9 : 0);
        width = B.w + 8;
        break;
      }
      case 'quadruped': {
        const long = n.shape.body !== 'round', ry = long ? 6.8 : 8.2, legH = n.shape.legs === 'spider' ? 7 : n.shape.legs === 'long' ? 9 : 4.2, hr = 7.2 * hd.size;
        headY = -(legH + ry * 0.72) - ry * 0.5 - 2.8;
        height = -(headY - hr) + (hd.ears !== 'none' ? hr * 0.5 : 0);
        width = long ? 34 : 30;
        break;
      }
      case 'blob': height = n.shape.cube ? 30 : 19; width = 27; headY = -10; break;
      case 'flyer': {
        const b = n.shape.body || 'bird';
        if (b === 'imp') { const hr = BUILDS.tiny.hr * hd.size; headY = -(BUILDS.tiny.lh + BUILDS.tiny.th) - hr * 0.8; height = -(headY - hr) + hr * 0.6; width = 18; }
        else if (b === 'orb') { height = 22 * hd.size + (n.shape.stalks ? 9 : 0); width = 22; headY = -11; }
        else if (b === 'wisp') { height = 22; width = 16; headY = -8; }
        else if (b === 'bat') { height = 15; width = 30; headY = -7; }
        else { height = 18; width = 22; headY = -12; }
        break;
      }
      case 'swarm': height = n.shape.of && n.shape.of !== 'rat' ? 26 : 16; width = 34; headY = -8; break;
      case 'construct': {
        const k = n.shape.kind || 'golem';
        if (k === 'armor') { const B = BUILDS[n.buildName], hr = B.hr * hd.size; headY = -(B.lh + B.th) - hr * 0.8; height = -(headY - hr) + hr * 0.2; width = B.w + 8; }
        else if (k === 'totem') { height = 36; width = 22; headY = -26; }
        else { height = 37; width = 30; headY = -31; }
        break;
      }
      case 'custom': {
        const sp = n.src;
        height = num(sp.height, 40); width = num(sp.width, 26); headY = num(sp.headY, -height * 0.7);
        break;
      }
      default: break;
    }
    n._m = { height: height, width: width, headY: headY };
    return n._m;
  }

  /** Public metrics in px at zoom 1 (already multiplied by spec scale). Accepts a spec, a unit or a def id. */
  function metrics(x) {
    let spec = x, hover;
    if (typeof x === 'string') { const d = DD.getHero(x) || DD.getEnemy(x) || DD.getSummon(x); spec = d && d.sprite; }
    else if (x && (x.vis || x.defId !== undefined || x.kind === 'hero' || x.kind === 'enemy' || x.kind === 'summon') && !x.base) {
      const r = specFor(x); spec = r.spec;
      if (r.def && r.def.flags && r.def.flags.flying) hover = true;
    }
    const n = normalize(spec);
    const M = metricsN(n), hv = hoverHeight(n, { hover: hover });
    return { height: (M.height + hv) * n.scale, width: M.width * n.scale, headY: (M.headY - hv) * n.scale, hover: hv * n.scale, scale: n.scale };
  }

  /**
   * Painted extent of a sprite in zoom-1 px around its feet (spec scale applied): { l, r, t, b, w, h }, measured once
   * per spec from a still idle render (aura and overlay included; underlay and status effects not). Galleries use it
   * to fit tall or wide sprites (bosses, Marwyn's horns, Slate) into their cards; metrics() stays the layout estimate.
   */
  function bounds(x, flying) {
    let spec = x;
    if (typeof x === 'string') {
      const d = DD.getHero(x) || DD.getEnemy(x) || DD.getSummon(x);
      spec = d && d.sprite;
      if (d && d.flags && d.flags.flying) flying = true;
    } else if (x && !x.base && (x.vis || x.defId !== undefined)) {
      const r = specFor(x); spec = r.spec;
      if (r.def && r.def.flags && r.def.flags.flying) flying = true;
    }
    const n = normalize(spec);
    const key = flying ? '_bndF' : '_bnd';
    if (n[key]) return n[key];
    const S = 1.5, pad = 6, B = n.bounds, k = n.scale * S, up = 30;
    const W = Math.ceil((B.r - B.l) * k) + pad * 2, H = Math.ceil((B.b - B.t + up) * k) + pad * 2;
    const ox = -B.l * k + pad, oy = (-B.t + up) * k + pad;
    let res = null;
    if (W <= 2400 && H <= 2400) {
      try {
        const c = makeCanvas(W, H), ctx = c.getContext('2d', { willReadFrequently: true });
        draw(ctx, n.src, ox, oy, S, { t: 0.6, still: true, blink: false, id: n.id, hover: flying ? true : undefined, underlay: false });
        const data = ctx.getImageData(0, 0, W, H).data;
        let l = W, r = -1, t = H, b = -1;
        for (let y = 0; y < H; y++) {
          for (let xx = 0; xx < W; xx++) {
            if (data[(y * W + xx) * 4 + 3] > 20) { if (xx < l) l = xx; if (xx > r) r = xx; if (y < t) t = y; if (y > b) b = y; }
          }
        }
        if (r >= 0) res = { l: (l - ox) / S, r: (r + 1 - ox) / S, t: (t - oy) / S, b: (b + 1 - oy) / S };
      } catch (e) { res = null; }
    }
    if (!res) {
      const m = metricsN(n), hv = hoverHeight(n, { hover: flying ? true : undefined });
      res = { l: -m.width * 0.6 * n.scale, r: m.width * 0.6 * n.scale, t: -(m.height + hv) * n.scale, b: 2 * n.scale };
    }
    res.w = res.r - res.l; res.h = res.b - res.t;
    n[key] = res;
    return res;
  }

  // ---- units -----------------------------------------------------------------------------------------------------
  function defOf(unit) {
    const id = unit.defId || unit.id;
    if (unit.kind === 'hero') return DD.getHero(id) || DD.getSummon(id) || DD.getEnemy(id);
    if (unit.kind === 'enemy') return DD.getEnemy(id) || DD.getSummon(id) || DD.getHero(id);
    if (unit.kind === 'summon') return DD.getSummon(id) || DD.getEnemy(id) || DD.getHero(id);
    return DD.getHero(id) || DD.getEnemy(id) || DD.getSummon(id);
  }
  /** { spec, def } for a unit: unit.sprite / unit.vis.sprite override (spec or def id), else the def's sprite. */
  function specFor(unit) {
    const def = defOf(unit);
    const ov = (unit.vis && unit.vis.sprite) || unit.sprite;
    if (ov && typeof ov === 'object') return { spec: ov, def: def };
    if (typeof ov === 'string') {
      const d2 = DD.getHero(ov) || DD.getEnemy(ov) || DD.getSummon(ov);
      if (d2 && d2.sprite) return { spec: d2.sprite, def: def };
    }
    return { spec: def && def.sprite && typeof def.sprite === 'object' ? def.sprite : PLACEHOLDER_SPEC, def: def };
  }

  const phaseCache = new Map();
  function phaseOf(id) {
    let p = phaseCache.get(id);
    if (p === undefined) { p = (U.hash(String(id)) % 1000) / 1000 * TAU; phaseCache.set(id, p); }
    return p;
  }
  function statusIds(unit) {
    const list = unit.statuses;
    if (!Array.isArray(list) || !list.length) return null;
    const s = new Set();
    for (let i = 0; i < list.length; i++) if (list[i] && list[i].id) s.add(list[i].id);
    return s.size ? s : null;
  }

  /** Transient vis fields written by fx_render are honoured only while an FX keeps refreshing them. */
  function visFresh(v) { return v && v._fxAt !== undefined && nowMs() - v._fxAt < 450; }

  /** extra (optional): { underlay: false, statusFx: false } paints the bare body (the renderer's silhouette masks). */
  function drawUnit(ctx, unit, sx, sy, zoom, t, extra) {
    if (!ctx || !unit) return;
    const v = unit.vis || {};
    const fresh = visFresh(v);
    if (v.hidden && !(fresh && v.spawnT !== undefined)) return;
    const dying = fresh && typeof v.deathT === 'number';
    if (v.dead && !dying) return;
    const r = specFor(unit), def = r.def;
    let lying = v.downed ? 1 : 0;
    if (fresh && typeof v.downT === 'number') lying = v.downT;
    if (fresh && typeof v.reviveT === 'number') lying = 1 - v.reviveT;
    let alpha = num(v.alpha, 1), flash = num(v.flash, 0);
    if (dying) {
      lying = Math.max(lying, smooth(v.deathT * 1.7));
      alpha = Math.min(alpha > 0 ? alpha : 1, 1 - smooth((v.deathT - 0.45) / 0.55));
      flash = Math.max(flash, 1 - v.deathT * 5);
    }
    const flying = !!((def && def.flags && def.flags.flying) || (unit.flags && unit.flags.flying));
    // FX steer facing while they play (walk direction, lunge/shot target); otherwise the engine's unit.facing rules
    const facing = fresh && (v.facing === 1 || v.facing === -1) ? v.facing : (unit.facing === -1 ? -1 : 1);
    draw(ctx, r.spec, sx, sy, zoom, {
      t: t, id: unit.defId, unit: unit, facing: facing,
      pose: fresh && v.pose ? v.pose : 'idle', poseT: fresh ? v.poseT : undefined,
      flash: flash, flashColor: fresh && v.flashColor ? v.flashColor : '#ffffff',
      alpha: alpha, scale: num(v.scale, 1),
      offX: num(v.offX, 0), offY: num(v.offY, 0), lift: fresh ? num(v.lift, 0) : 0,
      squash: fresh ? num(v.squash, 0) : 0, walk: fresh ? v.walk : undefined, spin: fresh ? num(v.spin, 0) : 0,
      lying: lying, phase: phaseOf(unit.id), hover: flying ? true : undefined,
      dizzy: lying >= 0.6, statuses: statusIds(unit),
      underlay: extra && extra.underlay === false ? false : undefined,
      statusFx: extra && extra.statusFx === false ? false : undefined,
    });
  }

  // ---- portraits ---------------------------------------------------------------------------------------------
  /** Local-space framing { x, y, r } (head and shoulders) for a normalized spec, hover not included. */
  function framing(n) {
    const M = metricsN(n), hd = n.head;
    switch (n.base) {
      case 'humanoid': { const hr = n.build.hr * hd.size; return { x: 1, y: M.headY + hr * 0.5, r: hr * 1.8 }; }
      case 'quadruped': {
        const hr = 7.2 * hd.size, rx = n.shape.body !== 'round' ? 13 : 10.5;
        return { x: rx * 0.82 + 0.5, y: M.headY + 2.5, r: hr * 2.1 };
      }
      case 'blob': return n.shape.cube ? { x: 0, y: -15, r: 17 } : { x: 0, y: -10, r: 14.5 };
      case 'flyer': {
        const b = n.shape.body || 'bird';
        if (b === 'imp') { const hr = BUILDS.tiny.hr * hd.size; return { x: 0, y: M.headY + hr * 0.5, r: hr * 1.9 }; }
        if (b === 'orb') return { x: 0, y: -11 * hd.size - 1 - (n.shape.stalks ? 4 : 0), r: (n.shape.stalks ? 17 : 13) * hd.size };
        if (b === 'bat') return { x: 0, y: -7, r: 14 };
        if (b === 'wisp') return { x: 0, y: -10, r: 13 };
        return { x: 3, y: -10, r: 11.5 };
      }
      case 'swarm': return { x: 0, y: n.shape.of && n.shape.of !== 'rat' ? -12 : -4, r: 16 };
      case 'construct': {
        const k = n.shape.kind || 'golem';
        if (k === 'armor') { const hr = n.build.hr * hd.size; return { x: 1, y: M.headY + hr * 0.5, r: hr * 1.8 }; }
        if (k === 'totem') return { x: 0, y: -27, r: 12 };
        return { x: 0, y: -27, r: 15 };
      }
      default: return measureFrame(n);
    }
  }

  /** Custom painters: render once offscreen and frame the top of the opaque bounding box. */
  function measureFrame(n) {
    if (n._frame) return n._frame;
    const S = 2, W = 320, HH = 320, ox = W / 2, oy = HH * 0.78;
    let fr = { x: 0, y: -22, r: 22 };
    try {
      const c = makeCanvas(W, HH), ctx = c.getContext('2d');
      draw(ctx, n.src, ox, oy, S / n.scale, { t: 0, still: true, blink: false, id: n.id, hover: 0, underlay: false });
      const data = ctx.getImageData(0, 0, W, HH).data;
      let l = W, r = -1, t = HH, b = -1;
      for (let y = 0; y < HH; y += 2) {
        for (let x = 0; x < W; x += 2) {
          if (data[(y * W + x) * 4 + 3] > 24) { if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > b) b = y; }
        }
      }
      if (r >= 0) {
        const L = (l - ox) / S, R = (r - ox) / S, T = (t - oy) / S, B = (b - oy) / S, w = R - L, h = B - T;
        fr = { x: (L + R) / 2, y: T + h * 0.42, r: Math.max(w * 0.52, h * 0.45, 8) };
      }
    } catch (e) { /* keep default framing */ }
    n._frame = fr;
    return fr;
  }

  function renderPortrait(spec, def, id, size, opts) {
    stats.portraitRenders++;
    const n = normalize(spec, id);
    const c = makeCanvas(size, size), ctx = c.getContext('2d');
    const flying = def && def.flags && def.flags.flying ? true : undefined;
    const fr = n.portrait ? { x: num(n.portrait.x, 0), y: num(n.portrait.y, -20), r: Math.max(4, num(n.portrait.r, 20)) } : Object.assign({}, framing(n));
    fr.y -= hoverHeight(n, { hover: flying });
    const s = (size * 0.5 * clamp(num(opts.fill, 1), 0.3, 3)) / fr.r, zoom = s / n.scale;
    const facing = opts.facing === -1 ? -1 : 1;
    const X = size / 2 - fr.x * s * facing, Y = size * 0.54 - fr.y * s;
    const rad = opts.square ? 0 : size * 0.16;
    ctx.save();
    if (opts.bg !== false) {
      const base = typeof opts.bg === 'string' && validColor(opts.bg) ? opts.bg :
        validColor(opts.color) ? opts.color : def && validColor(def.color) ? def.color : n.pal.accent;
      ctx.beginPath(); roundRect(ctx, 0, 0, size, size, rad); ctx.clip();
      const gr = ctx.createRadialGradient(size * 0.5, size * 0.38, size * 0.04, size * 0.5, size * 0.5, size * 0.8);
      gr.addColorStop(0, shade(base, 0.15)); gr.addColorStop(0.5, shade(base, -0.38)); gr.addColorStop(1, shade(base, -0.78));
      ctx.fillStyle = gr; ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      for (let i = -1; i < 6; i++) {
        const x0 = i * size * 0.28;
        ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x0 + size * 0.12, 0); ctx.lineTo(x0 - size * 0.28, size); ctx.lineTo(x0 - size * 0.4, size); ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.ellipse(size / 2, size * 1.02, size * 0.5, size * 0.16, 0, 0, TAU); ctx.fill();
    } else {
      ctx.beginPath(); ctx.rect(0, 0, size, size); ctx.clip();
    }
    draw(ctx, spec, X, Y, zoom, { t: num(opts.t, 0.6), still: true, blink: false, facing: facing, pose: opts.pose || 'idle', id: id, hover: flying, underlay: false });
    if (opts.bg !== false) {
      const vg = ctx.createLinearGradient(0, size * 0.66, 0, size);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.42)');
      ctx.fillStyle = vg; ctx.fillRect(0, 0, size, size);
      const lw = Math.max(1, size / 42);
      ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = lw;
      ctx.beginPath(); roundRect(ctx, lw, lw, size - lw * 2, size - lw * 2, Math.max(0, rad - lw)); ctx.stroke();
    }
    ctx.restore();
    if (opts.border) {
      const lw = Math.max(1.5, size / 26);
      ctx.strokeStyle = validColor(opts.border) ? opts.border : '#d4af37'; ctx.lineWidth = lw;
      ctx.beginPath(); roundRect(ctx, lw / 2, lw / 2, size - lw, size - lw, Math.max(0, rad - lw / 2)); ctx.stroke();
    }
    if (opts.gray) {
      const tmp = makeCanvas(size, size), tc = tmp.getContext('2d');
      tc.filter = 'grayscale(1) brightness(0.8) contrast(1.05)';
      tc.drawImage(c, 0, 0);
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(tmp, 0, 0);
    }
    return c;
  }

  let portraitBySpec = new WeakMap();
  function portraitKey(size, opts, def) {
    return [size, opts.bg === false ? '-' : (opts.bg || ''), opts.color || '', opts.pose || '', opts.facing === -1 ? 'L' : 'R', opts.gray ? 'g' : '',
      opts.border || '', opts.fill || '', opts.square ? 's' : '', opts.t || '', def && def.color ? def.color : '', def && def.flags && def.flags.flying ? 'f' : ''].join('|');
  }
  /** Resolve spec/def from a def id, a def, a unit or a spec. */
  function portraitSource(x) {
    if (typeof x === 'string') {
      const d = DD.getHero(x) || DD.getEnemy(x) || DD.getSummon(x);
      return { spec: d && d.sprite && typeof d.sprite === 'object' ? d.sprite : PLACEHOLDER_SPEC, def: d, id: x };
    }
    if (x && typeof x === 'object' && !x.base) {
      if (x.sprite && typeof x.sprite === 'object' && x.__kind) return { spec: x.sprite, def: x, id: x.id || null };
      if (x.defId !== undefined || x.vis) { const r = specFor(x); return { spec: r.spec, def: r.def, id: x.defId || null }; }
    }
    return { spec: x && typeof x === 'object' ? x : PLACEHOLDER_SPEC, def: null, id: null };
  }
  function portraitMaster(x, size, opts) {
    opts = opts || {};
    size = clamp(Math.round(num(size, 64)), 8, 1024);
    const src = portraitSource(x);
    let m = portraitBySpec.get(src.spec);
    if (!m) { m = new Map(); portraitBySpec.set(src.spec, m); }
    const key = portraitKey(size, opts, src.def);
    let c = m.get(key);
    if (!c) { c = renderPortrait(src.spec, src.def, src.id, size, opts); m.set(key, c); }
    return c;
  }
  /** Cached portrait canvas; if the cached canvas is already in the DOM a cheap copy is returned instead. */
  function portrait(x, size, opts) {
    const master = portraitMaster(x, size, opts);
    if (!master.parentNode) return master;
    const c = makeCanvas(master.width, master.height);
    c.getContext('2d').drawImage(master, 0, 0);
    return c;
  }
  function portraitURL(x, size, opts) {
    const master = portraitMaster(x, size, opts);
    if (!master._ddUrl) { try { master._ddUrl = master.toDataURL('image/png'); } catch (e) { master._ddUrl = ''; } }
    return master._ddUrl;
  }

  function invalidate(spec) {
    if (spec && typeof spec === 'object') { normCache.delete(spec); portraitBySpec.delete(spec); }
  }
  function clearCache() { portraitBySpec = new WeakMap(); }

  // ---- public API ---------------------------------------------------------------------------------------------
  DD.Sprites = {
    OPTIONS: OPTIONS,
    DEFAULT_PALETTE: DEFAULT_PAL,
    PLACEHOLDER: PLACEHOLDER_SPEC,
    draw: draw,
    drawUnit: drawUnit,
    drawShadow: drawShadow,
    portrait: portrait,
    portraitURL: portraitURL,
    metrics: metrics,
    bounds: bounds,
    specFor: function (unit) { return unit ? specFor(unit).spec : PLACEHOLDER_SPEC; },
    /** Paint into an arbitrary context with the `g` helper (object painters, UI icons). Origin at (x, y). */
    paint: function (ctx, x, y, scale, fn, palette, t) {
      const pal = Object.assign({}, DEFAULT_PAL, palette || {});
      ctx.save(); ctx.translate(x, y); ctx.scale(scale || 1, scale || 1);
      const g = new Painter(ctx, pal, { t: t || 0, lw: 1.9, facing: 1 });
      DD.safe('Sprites.paint', fn, null, [g, t || 0]);
      ctx.restore();
    },
    painter: function (ctx, palette, t) { return new Painter(ctx, Object.assign({}, DEFAULT_PAL, palette || {}), { t: t || 0, lw: 1.9, facing: 1 }); },
    invalidate: invalidate,
    clearCache: clearCache,
    stats: stats,
    _normalize: normalize,
  };

  // ---- sample specs: every option on a neutral adventurer + showcase specs (gallery sheets, tests) ---------------
  const SAMPLE_PAL = { skin: '#f0c49a', cloth: '#4f7fd6', cloth2: '#2d3f73', hair: '#7a4322', metal: '#d4af37', eye: '#2b2233', accent: '#ff9f1c', outline: '#1a1014' };
  function mk(over) {
    const s = { base: 'humanoid', build: 'normal', outfit: 'tunic', palette: Object.assign({}, SAMPLE_PAL), head: { hair: 'short', eyes: 'normal', mouth: 'smile' } };
    for (const k in over) {
      if (k === 'palette') Object.assign(s.palette, over.palette);
      else if (k === 'head') Object.assign(s.head, over.head);
      else s[k] = over[k];
    }
    return s;
  }
  const samples = [];
  function add(group, label, spec) { samples.push({ id: group + ':' + label, group: group, label: label, spec: spec }); }

  OPTIONS.build.forEach(function (v) { add('builds', v, mk({ build: v })); });
  OPTIONS.outfit.forEach(function (v) { add('outfits', v, mk({ outfit: v })); });
  OPTIONS.ears.forEach(function (v) { add('ears', v, mk({ head: { ears: v } })); });
  OPTIONS.horns.forEach(function (v) { add('horns', v, mk({ head: { horns: v }, palette: v === 'tiefling' || v === 'demon' ? { skin: '#c94b3b' } : {} })); });
  OPTIONS.hair.forEach(function (v) { add('hair', v, mk({ head: { hair: v } })); });
  OPTIONS.beard.forEach(function (v) { add('beards', v, mk({ build: 'stocky', head: { beard: v }, palette: { hair: '#d35400' } })); });
  OPTIONS.hat.forEach(function (v) { add('hats', v, mk({ head: { hat: v } })); });
  OPTIONS.face.forEach(function (v) {
    add('faces', v, mk({ head: { face: v, eyes: v === 'skull' ? 'glow' : 'normal', hair: v === 'skull' ? 'none' : 'short' }, palette: v === 'skull' ? { skin: '#e9e2cf', eye: '#ff5a3c' } : v === 'plague_mask' ? { eye: '#9be7ff' } : {} }));
  });
  OPTIONS.eyes.forEach(function (v) { add('eyes', v, mk({ head: { eyes: v }, palette: v === 'glow' ? { eye: '#ffeb3b' } : v === 'big' ? { eye: '#3fa7ff' } : v === 'cyclops' ? { eye: '#3fbf5a' } : {} })); });
  OPTIONS.mouth.forEach(function (v) { add('mouths', v, mk({ head: { mouth: v } })); });
  OPTIONS.wings.forEach(function (v) { add('wings', v, mk({ wings: v, hover: v !== 'none' })); });
  OPTIONS.tail.forEach(function (v) { add('tails', v, mk({ tail: v })); });
  OPTIONS.mainhand.forEach(function (v) { add('mainhand', v, mk({ mainhand: v })); });
  OPTIONS.offhand.forEach(function (v) { add('offhand', v, mk({ offhand: v })); });
  OPTIONS.bling.forEach(function (v) { add('bling', v, mk({ bling: [v], head: { mouth: v === 'grill' ? 'grin' : 'smile' } })); });
  add('bling', 'everything', mk({ bling: OPTIONS.bling.slice(), head: { mouth: 'grin' } }));
  OPTIONS.extras.forEach(function (v) { add('extras', v, mk({ extras: [v] })); });
  OPTIONS.aura.forEach(function (v) { add('auras', v, mk({ aura: { kind: v } })); });

  const Q = function (over) { return Object.assign({ base: 'quadruped' }, over); };
  add('quadruped', 'corgi', Q({ scale: 0.75, palette: { skin: '#e8963e', cloth2: '#fff4e2', hair: '#c4742a', eye: '#2b1d14', accent: '#e94b5a' },
    shape: { legs: 'short', body: 'long', snout: 'short', fluff: true }, head: { ears: 'cat', eyes: 'big', mouth: 'open' }, tail: 'dog', extras: ['collar'] }));
  add('quadruped', 'wolf', Q({ palette: { skin: '#7d8590', cloth2: '#c9ccd3', hair: '#5c636d', eye: '#ffd23f' },
    shape: { legs: 'long', body: 'long', snout: 'long' }, head: { ears: 'cat', eyes: 'angry', mouth: 'fangs' }, tail: 'cat' }));
  add('quadruped', 'cat', Q({ scale: 0.7, palette: { skin: '#3b3b46', cloth2: '#f2f2f2', hair: '#3b3b46', eye: '#9be564' },
    shape: { legs: 'short', body: 'round', snout: 'flat' }, head: { ears: 'cat', eyes: 'big', mouth: 'smile' }, tail: 'cat' }));
  add('quadruped', 'owlbear', Q({ scale: 1.2, palette: { skin: '#8a5a35', cloth2: '#d9b98a', hair: '#6b4426', eye: '#ffcf3f', beak: '#e8b13a' },
    shape: { legs: 'short', body: 'round', snout: 'beak', fluff: true }, head: { ears: 'bear', eyes: 'big' }, tail: 'rabbit' }));
  add('quadruped', 'hell hound', Q({ palette: { skin: '#2a1f24', cloth2: '#4a2a2a', hair: '#1a1214', eye: '#ff6a1a' },
    shape: { legs: 'long', body: 'long', snout: 'long' }, head: { ears: 'pointy', horns: 'demon', eyes: 'glow', mouth: 'fangs' }, tail: 'devil', aura: { kind: 'flames' } }));
  add('quadruped', 'dragon', Q({ scale: 1.3, palette: { skin: '#c0392b', cloth2: '#f5c26b', hair: '#8e2a20', eye: '#ffe14a', metal: '#d4af37' },
    shape: { legs: 'long', body: 'long', snout: 'long' }, head: { horns: 'ram', eyes: 'angry', mouth: 'fangs' }, wings: 'demon', tail: 'lizard', bling: ['chain'] }));
  add('quadruped', 'cellar spider', Q({ scale: 0.85, palette: { skin: '#4a3b4f', cloth2: '#6b566f', eye: '#ff3a3a' },
    shape: { legs: 'spider', body: 'round', snout: 'flat' }, head: { eyes: 'glow', mouth: 'fangs', size: 0.85 } }));
  add('quadruped', 'sir fluffington', Q({ scale: 0.8, palette: { skin: '#f2f0ea', cloth2: '#ffffff', hair: '#d8d4cc', eye: '#2b1d14', cape: '#7d3cff' },
    shape: { legs: 'short', body: 'long', snout: 'short', fluff: true }, head: { ears: 'cat', eyes: 'normal', mouth: 'smile', face: 'monocle' }, tail: 'dog', extras: ['cape'], bling: ['crown'] }));

  add('blob', 'slime', { base: 'blob', palette: { skin: '#5cc85a', eye: '#1a1014' }, head: { eyes: 'big', mouth: 'smile' } });
  add('blob', 'translucent', { base: 'blob', palette: { skin: '#7ad3ff' }, shape: { translucent: true, contents: 'bones' }, head: { eyes: 'normal', mouth: 'open' } });
  add('blob', 'wobbly', { base: 'blob', palette: { skin: '#ff7ab8' }, shape: { wobble: 2.5 }, head: { eyes: 'sleepy', mouth: 'grin' } });
  add('blob', 'cube', { base: 'blob', scale: 1.3, palette: { skin: '#79e07a' }, shape: { cube: true }, head: { eyes: 'big', mouth: 'grin' } });
  add('blob', 'fancy', { base: 'blob', palette: { skin: '#b48cff' }, head: { eyes: 'normal', mouth: 'smile', hat: 'tophat', face: 'monocle' } });

  add('flyer', 'raven', { base: 'flyer', scale: 0.8, palette: { skin: '#2b2a35', eye: '#e8e6f0', beak: '#4a4a52', accent: '#4a4a52' }, shape: { body: 'bird' }, head: { eyes: 'normal' } });
  add('flyer', 'bat', { base: 'flyer', scale: 0.8, palette: { skin: '#5a4660', eye: '#ffd23f' }, shape: { body: 'bat' }, head: { eyes: 'glow' } });
  add('flyer', 'imp', { base: 'flyer', scale: 0.8, palette: { skin: '#d9443a', cloth: '#2a2228', eye: '#ffe14a', hair: '#2a2228', accent: '#ffcc33' }, shape: { body: 'imp' },
    head: { eyes: 'glow', mouth: 'grin', face: 'glasses' }, mainhand: 'quill' });
  add('flyer', 'eyeball', { base: 'flyer', palette: { skin: '#f3e9e2', eye: '#3fa7ff' }, shape: { body: 'orb' }, head: { mouth: 'none' } });
  add('flyer', 'beholder', { base: 'flyer', scale: 1.4, palette: { skin: '#a05bb5', eye: '#ffcf3f' }, shape: { body: 'orb', stalks: 6 }, head: { mouth: 'fangs' } });
  add('flyer', 'wisp', { base: 'flyer', palette: { skin: '#7af0ff', eye: '#ffffff' }, shape: { body: 'wisp' }, head: { eyes: 'glow', mouth: 'smile' } });

  add('swarm', 'rats', { base: 'swarm', palette: { skin: '#8a7f78' }, shape: { of: 'rat', count: 5 } });
  add('swarm', 'bats', { base: 'swarm', palette: { skin: '#5a4660' }, shape: { of: 'bat', count: 5 } });
  add('swarm', 'bees', { base: 'swarm', shape: { of: 'bee', count: 6 } });
  add('swarm', 'pixies', { base: 'swarm', palette: { skin: '#ffd9f0', accent: '#ff8ad8' }, shape: { of: 'pixie', count: 5 } });
  add('swarm', 'rat king', { base: 'swarm', scale: 1.4, palette: { skin: '#7a6e66', metal: '#d4af37', accent: '#e23b3b' }, shape: { of: 'rat', count: 9 }, bling: ['crown'] });

  add('construct', 'golem', { base: 'construct', scale: 1.2, palette: { skin: '#8f8a80', accent: '#7af0ff', cloth2: '#5f8f4a' }, shape: { kind: 'golem' } });
  add('construct', 'armor', { base: 'construct', palette: { metal: '#a9b2bf', cloth2: '#7a1f2b', eye: '#ff5a3c' }, shape: { kind: 'armor' }, mainhand: 'sword', offhand: 'shield' });
  add('construct', 'totem', { base: 'construct', palette: { skin: '#a8743f', cloth: '#d94b3b', cloth2: '#2f8f9d', accent: '#f5c542', eye: '#7cfc8a' }, shape: { kind: 'totem' } });

  add('custom', 'd20 mimic', {
    base: 'custom', palette: { skin: '#e23b3b', eye: '#ffe14a', accent: '#ffffff' }, height: 30,
    draw: function (g, t) {
      const b = Math.sin(t * 3) * 1.2, r = 13;
      const pts = [];
      for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + i * Math.PI / 3; pts.push([Math.cos(a) * r, -15 + b + Math.sin(a) * r]); }
      g.poly(pts, g.pal.skin);
      g.poly([pts[0], pts[2], pts[4]], g.shade(g.pal.skin, 0.15));
      g.text('20', 0, -14 + b, 8, '#ffffff');
      g.poly([[-8, -6 + b], [8, -6 + b], [6, -3 + b], [-6, -3 + b]], '#3a0f17');
      for (let i = -3; i <= 3; i++) g.poly([[i * 2.2 - 1, -6 + b], [i * 2.2 + 1, -6 + b], [i * 2.2, -4 + b]], '#ffffff', null);
      g.circle(-5, -19 + b, 2.2, g.pal.eye); g.circle(5, -19 + b, 2.2, g.pal.eye);
      g.circle(-4.6, -19 + b, 0.9, '#1a1014', null); g.circle(5.4, -19 + b, 0.9, '#1a1014', null);
    },
  });
  add('custom', 'overlay: party hat', mk({
    head: { mouth: 'grin', eyes: 'big' }, palette: { eye: '#3fa7ff' },
    overlay: function (g, t) {
      g.poly([[-5, -36], [5, -37], [-1, -52]], '#ff5fa2');
      g.line(-3.6, -40, 3.6, -41, '#ffe14a', 1.4); g.line(-2, -45, 2, -46, '#ffe14a', 1.4);
      g.circle(-1, -53, 2 + Math.sin(t * 6) * 0.3, '#7af0ff');
    },
  }));

  // Hero-ish / enemy-ish showcase (content authors design their own; these show what the painter can do)
  add('showcase', 'fire warlock', mk({ outfit: 'robe', palette: { skin: '#c0392b', cloth: '#3b1f4a', cloth2: '#f1c40f', hair: '#222222', metal: '#d4af37', eye: '#ffeb3b', accent: '#ff6f00' },
    head: { horns: 'tiefling', hair: 'long', eyes: 'glow', mouth: 'gold_teeth', face: 'sunglasses' }, tail: 'devil', mainhand: 'orb', bling: ['chain', 'rings', 'earrings'], extras: ['sash'], aura: { kind: 'flames' } }));
  add('showcase', 'faerie bard', mk({ build: 'tiny', scale: 0.72, outfit: 'dress', hover: true, palette: { skin: '#ffd9e6', cloth: '#7d3cff', cloth2: '#ffd23f', hair: '#ff5fa2', eye: '#2b2233', accent: '#ffd23f', wing: '#bdf3ff' },
    head: { ears: 'elf', hair: 'ponytail', eyes: 'big', mouth: 'grin', hat: 'beret' }, wings: 'fairy', mainhand: 'lute', aura: { kind: 'notes' } }));
  add('showcase', 'rabbit monk', mk({ build: 'slim', scale: 0.88, outfit: 'robe', palette: { skin: '#ece7df', cloth: '#d9822b', cloth2: '#8a3b12', hair: '#f6f3ee', eye: '#3a2a26', accent: '#ffcc33' },
    head: { ears: 'rabbit_floppy', hair: 'none', beard: 'long', face: 'glasses', eyes: 'sleepy', mouth: 'smile' }, tail: 'rabbit', mainhand: 'cane' }));
  add('showcase', 'ginger barbarian', mk({ build: 'huge', scale: 1.12, outfit: 'furs', palette: { skin: '#f2b48a', cloth: '#7a4a2a', cloth2: '#e8dcc0', hair: '#e8612c', eye: '#2b2233', accent: '#9b59ff' },
    head: { hair: 'wild', beard: 'wild', eyes: 'angry', mouth: 'grin' }, mainhand: 'greataxe', extras: ['belt'], aura: { kind: 'sparkles', color: '#c9a8ff' } }));
  add('showcase', 'runic sorcerer', mk({ outfit: 'robe', palette: { skin: '#d8c3b0', cloth: '#1e2a4a', cloth2: '#3fd0e0', hair: '#e8e8f0', eye: '#7af0ff', accent: '#7af0ff' },
    head: { hat: 'hood', eyes: 'glow', mouth: 'grin', hair: 'long' }, mainhand: 'staff', offhand: 'scroll', aura: { kind: 'runes' } }));
  add('showcase', 'plague doctor', mk({ outfit: 'coat', palette: { skin: '#e9d6c1', cloth: '#2c2a33', cloth2: '#5a4a3a', hair: '#2c2a33', metal: '#b08d57', eye: '#9be564', accent: '#7be04a' },
    head: { hat: 'plague', face: 'plague_mask' }, extras: ['collar', 'bandolier'], mainhand: 'flask', offhand: 'lantern', aura: { kind: 'smoke' } }));
  add('showcase', 'corgi druid', mk({ outfit: 'robe', palette: { skin: '#f6dcc0', cloth: '#3f8f4a', cloth2: '#a8d672', hair: '#f2c46b', eye: '#3a6b2a', accent: '#a8f070' },
    head: { ears: 'elf', hair: 'long', hat: 'flowers', eyes: 'big', mouth: 'smile' }, mainhand: 'staff', aura: { kind: 'leaves' } }));
  add('showcase', 'blood goblin', mk({ build: 'tiny', scale: 0.8, outfit: 'rags', palette: { skin: '#6fae3c', cloth: '#5a2a2a', cloth2: '#8a1c2a', hair: '#1a1014', eye: '#ff3a3a', accent: '#c0102a' },
    head: { ears: 'goblin', hair: 'mohawk', eyes: 'angry', mouth: 'fangs' }, mainhand: 'dagger', offhand: 'dagger', extras: ['pouches'], aura: { kind: 'blood' } }));
  add('showcase', 'skeleton intern', mk({ build: 'slim', outfit: 'rags', palette: { skin: '#ece5d3', cloth: '#4a4a5a', cloth2: '#2a2a3a', eye: '#7af0ff' },
    head: { face: 'skull', eyes: 'glow', hair: 'none', hat: 'mortarboard' }, mainhand: 'scroll' }));
  add('showcase', 'rules lawyer', mk({ outfit: 'coat', palette: { skin: '#b8322a', cloth: '#1c1a22', cloth2: '#e8e2d0', hair: '#1c1a22', eye: '#ffe14a', accent: '#c0102a' },
    head: { horns: 'demon', hair: 'short', face: 'glasses', mouth: 'grin' }, tail: 'devil', mainhand: 'book', extras: ['collar'] }));
  add('showcase', 'kobold rep', mk({ build: 'tiny', scale: 0.8, outfit: 'tunic', palette: { skin: '#c76b2a', cloth: '#d9b44a', cloth2: '#6a4a2a', eye: '#2b2233', accent: '#e23b3b' },
    head: { ears: 'pointy', hair: 'none', hat: 'helmet', mouth: 'open' }, tail: 'lizard', mainhand: 'scroll', extras: ['sash'] }));
  add('showcase', 'spore bro', mk({ build: 'stocky', scale: 0.9, outfit: 'none', palette: { skin: '#e8dcc4', cloth: '#7a5a3a', hat: '#c0392b', eye: '#2b2233' },
    head: { hat: 'mushroom', hair: 'none', eyes: 'sleepy', mouth: 'grin' }, aura: { kind: 'bubbles', color: '#b8f070' } }));
  add('showcase', 'mind flayer coach', mk({ outfit: 'coat', palette: { skin: '#a77bc0', cloth: '#2a2240', cloth2: '#e8e2d0', eye: '#ffffff' },
    head: { hair: 'none', beard: 'tentacles', eyes: 'glow', ears: 'pointy' }, mainhand: 'book', bling: ['rings'], extras: ['collar'] }));
  add('showcase', 'bugbear bouncer', mk({ build: 'huge', scale: 1.3, outfit: 'none', palette: { skin: '#a8743f', cloth: '#2a2a33', hair: '#6b4426', eye: '#ffd23f', accent: '#e23b3b' },
    head: { ears: 'bear', hair: 'none', eyes: 'angry', mouth: 'tusks', face: 'sunglasses' }, mainhand: 'club', bling: ['chain'] }));

  DD.Sprites.samples = samples;
  DD.Sprites.sampleGroups = ['builds', 'outfits', 'ears', 'horns', 'hair', 'beards', 'hats', 'faces', 'eyes', 'mouths', 'wings', 'tails', 'mainhand',
    'offhand', 'bling', 'extras', 'auras', 'quadruped', 'blob', 'flyer', 'swarm', 'construct', 'custom', 'showcase'];
})();
