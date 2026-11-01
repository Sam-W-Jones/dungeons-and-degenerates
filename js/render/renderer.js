/* Dungeons and Degenerates — js/render/renderer.js
 * World renderer (ARCHITECTURE §7.2). DPR-aware full-window canvas + rAF loop, camera (pan / zoom / fit /
 * gentle follow), picking, and every world layer: theme backdrop + ambient particles, terrain blocks (cached
 * per-terrain top textures, elevation side faces, animated liquids), surfaces, overlay highlights (incl. v2 threat
 * shading and one enemy's reach), boss WIND-UPS (red pulsing hatch, ⏳ label + damage badges; shown in step with FX
 * playback), objects, units (DD.Sprites with a fallback figure, the acting unit's turn ring), HP/Block/status/AP
 * widgets, occlusion silhouettes, light glows, then the DD.FXRender world + screen layers.
 * Scenes: 'combat' | 'title' | 'gallery' | 'none'.
 * Reads DD.Combat.state (or DD.Render.stateOverride) and DD.Render.overlay; never mutates game state.
 * World drawing happens in world px (ctx transform = camera); widgets are drawn in screen px.
 */
(function () {
  'use strict';
  const DD = window.DD;
  const U = DD.util;
  const Iso = DD.Iso;

  const HW = 32, HH = 16, STEP = 16;
  const TAU = Math.PI * 2;
  const FONT = '"Trebuchet MS", Verdana, Arial, sans-serif';
  const SLAB = 1.25;            // board slab thickness below h = 0 (levels)
  const MIN_ZOOM = 0.4, MAX_ZOOM = 2.75;
  const HUD_MARGIN = { left: 230, bottom: 250, top: 60, right: 24 };
  const TEX_PAD = 3;            // world px of padding around cached tile textures

  // ---- theme looks (fallbacks when DD.Themes lacks bg/ambient) ----------------------------------------
  const THEME_LOOK = {
    cellar: { bg: ['#2b1d15', '#0c0705'], ambient: 'dust', tint: '#ffb35a' },
    sewer: { bg: ['#14251f', '#050a08'], ambient: 'spores', tint: '#8fd16a' },
    warren: { bg: ['#2b1e12', '#0a0604'], ambient: 'spores', tint: '#d8b36a' },
    hauntwood: { bg: ['#1a2333', '#05070c'], ambient: 'fog', tint: '#9fb6e8' },
    academy: { bg: ['#221a36', '#07050e'], ambient: 'dust', tint: '#c3a6ff' },
    graveyard: { bg: ['#1c222b', '#06070a'], ambient: 'fog', tint: '#b8c6d8' },
    hellscape: { bg: ['#3e130f', '#0e0303'], ambient: 'embers', tint: '#ff7a3a' },
    hoard: { bg: ['#36280f', '#0d0903'], ambient: 'dust', tint: '#ffd36a' },
    dm_table: { bg: ['#2c2019', '#0a0705'], ambient: 'dust', tint: '#ffcf8a' },
    title: { bg: ['#1b2440', '#06070f'], ambient: 'fireflies', tint: '#ffb35a' },
  };
  const DEFAULT_LOOK = { bg: ['#221a22', '#08060a'], ambient: 'dust', tint: '#ffd9a0' };

  // Wall looks per theme (the canonical 'wall' terrain is themed; content walls use their own colors).
  const WALLS = {
    default: { top: '#8a8580', left: '#6c6762', right: '#57534f', mortar: '#3b3835', face: 'brick' },
    cellar: { top: '#8e7c66', left: '#705f4c', right: '#5b4d3d', mortar: '#3a3027', face: 'brick' },
    sewer: { top: '#6f7e6b', left: '#56644f', right: '#475342', mortar: '#2b3428', face: 'brick', slime: '#86c443' },
    warren: { top: '#806446', left: '#664d34', right: '#533e29', mortar: '#3c2b1b', face: 'earth', roots: '#3e2a1a' },
    hauntwood: { top: '#5f675a', left: '#485044', right: '#3b4137', mortar: '#262b23', face: 'brick', moss: '#4f7a3a' },
    academy: { top: '#736c89', left: '#59536e', right: '#48435a', mortar: '#2f2b3b', face: 'brick', trim: '#b9a2e8' },
    graveyard: { top: '#7d7e85', left: '#616269', right: '#4f5056', mortar: '#34353a', face: 'brick', moss: '#5c7347' },
    hellscape: { top: '#3f2c30', left: '#2e1f23', right: '#23171a', mortar: '#140c0e', face: 'obsidian', glow: '#ff6a1a' },
    hoard: { top: '#e2dcd2', left: '#c4bcb0', right: '#a89f93', mortar: '#8a8276', face: 'marble', trim: '#e3b341' },
    dm_table: { top: '#7c3030', left: '#5f2525', right: '#4c1e1e', mortar: '#ece2c6', face: 'books' },
    title: { top: '#7f7a70', left: '#625e56', right: '#504c46', mortar: '#34312c', face: 'brick', moss: '#4f7a3a' },
  };

  // ---- canonical terrain looks (ARCHITECTURE §3.7). side: face style; tex: cached top painter ----------
  const TERRAIN = {
    stone: { top: '#7c808b', left: '#5d616b', right: '#4b4e57', side: 'stone', tex: 'stone', flip: true },
    cobble: { top: '#5a534b', left: '#5f584f', right: '#4c463f', side: 'stone', tex: 'cobble', flip: true, stone: '#8a8174' },
    dirt: { top: '#87613f', left: '#6b4b30', right: '#573d27', side: 'earth', tex: 'dirt', flip: true },
    grass: { top: '#5a9341', left: '#6b4b30', right: '#573d27', side: 'earth', lip: '#4c8437', tex: 'grass', flip: true },
    wood: { top: '#9b6b3d', left: '#77522e', right: '#614226', side: 'wood', tex: 'wood' },
    sand: { top: '#d5b87b', left: '#b2955b', right: '#977b49', side: 'earth', tex: 'sand', flip: true },
    moss: { top: '#4f7444', left: '#5d5b49', right: '#4b493a', side: 'stone', lip: '#476b3c', tex: 'moss', flip: true },
    crypt: { top: '#5f5c6a', left: '#484551', right: '#393742', side: 'stone', tex: 'crypt' },
    obsidian: { top: '#2f2634', left: '#231c27', right: '#1b151e', side: 'obsidian', tex: 'obsidian', flip: true },
    felt: { top: '#2f7e50', left: '#5b3b23', right: '#492f1c', side: 'table', tex: 'felt', flip: true },
    paper: { top: '#f0eadb', left: '#dcd4bb', right: '#c6bda1', side: 'paper', tex: 'paper' },
    gold: { top: '#b88a26', left: '#9b7521', right: '#806019', side: 'gold', tex: 'gold', flip: true },
    carpet: { top: '#8f2c3c', left: '#5f4b3b', right: '#4e3d30', side: 'stone', tex: 'carpet' },
    grate: { top: '#15191c', left: '#4b5057', right: '#3c4046', side: 'metal', tex: 'grate' },
    marble: { top: '#e3ded6', left: '#c0b9af', right: '#a69f95', side: 'marble', tex: 'marble', flip: true },
    wall: { top: '#8a8580', left: '#6c6762', right: '#57534f', side: 'brick', tex: 'wallcap', wall: true, tall: 1.5 },
    pit: { top: '#0d090b', left: '#3b3137', right: '#2d262b', side: 'stone', pit: true },
    water: { top: '#2e7ea6', left: '#5d616b', right: '#4b4e57', side: 'stone', tex: 'water', liquid: 'water', flip: true },
    deep_water: { top: '#1b4b82', left: '#4b4e57', right: '#3c3f47', side: 'stone', tex: 'deep', liquid: 'deep', flip: true },
    lava: { top: '#ff6a1f', left: '#3b2523', right: '#2d1b1a', side: 'lava', tex: 'lava', liquid: 'lava', flip: true },
    mud: { top: '#644732', left: '#5b4131', right: '#4b3527', side: 'earth', tex: 'mud', flip: true },
    ice: { top: '#c3e8f3', left: '#91c4d7', right: '#78afc4', side: 'ice', tex: 'ice', flip: true },
    rubble: { top: '#7e7469', left: '#60584f', right: '#4d4740', side: 'stone', tex: 'rubble', flip: true },
    bridge: { top: '#1d1512', left: '#6f4b2b', right: '#5b3d23', side: 'wood', tex: 'bridge' },
  };

  // ---- shared module state -----------------------------------------------------------------------------
  let canvas = null, ctx = null;
  let W = 1280, H = 720, DPR = 1;
  let time = 0;                   // seconds since init (animation clock)
  let running = false, rafId = 0, lastTs = 0;
  let scene = 'none';
  let lastStateRef = null;        // detects a new combat (auto-fit)
  let userMoved = false;          // camera moved by the player since the last fit
  let zoomAnchor = null;          // { sx, sy, wx, wy } keeps a world point under the cursor while zooming
  let camEase = null;             // { tau, until } a slower camera ease while it follows the acting unit (R.follow)
  let renderErrorShown = {};
  const camera = { x: 0, y: 0, zoom: 1 };
  const camTarget = { x: 0, y: 0, zoom: 1 };
  const brokenPainters = {};      // def ids whose custom painter threw once -> default painter
  const sceneHandlers = {};       // registerScene(id, { draw(view), enter(), leave() })

  // ---- tiny helpers -------------------------------------------------------------------------------------
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rgba(c, a) { return U.rgba(c, a); }
  function shade(c, a) { return U.shade(c, a); }
  function P(u, v) { return [(u - v) * HW, (u + v) * HH]; }
  function pulse(speed, phase) { return 0.5 + 0.5 * Math.sin(time * speed + (phase || 0)); }

  /** Run fn in uv space of a tile (origin = tile top center): rects become diamonds, circles flat ellipses. */
  function inUV(c, fn) {
    c.save();
    c.transform(HW, HH, -HW, HH, 0, 0);
    fn();
    c.restore();
  }
  function uvSeg(c, u1, v1, u2, v2) {
    const a = P(u1, v1), b = P(u2, v2);
    c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]);
  }
  function diamond(c, cx, cy, hw, hh) { Iso.diamondPath(c, cx, cy, hw, hh); }
  function fillDiamond(c, cx, cy, color, hw, hh) {
    c.beginPath(); diamond(c, cx, cy, hw || HW, hh || HH); c.fillStyle = color; c.fill();
  }

  /** Report a renderer failure once per message (keeps the rAF loop alive). */
  function renderError(label, err) {
    const msg = label + ': ' + (err && err.message ? err.message : err);
    if (renderErrorShown[msg]) return;
    renderErrorShown[msg] = true;
    DD.warn('Error in render ' + msg + (err && err.stack ? '\n' + err.stack : ''));
  }

  /** Call a content painter safely; a painter that throws once is disabled (falls back to the default). */
  function safePaint(key, label, fn, thisArg, args) {
    if (brokenPainters[key]) return false;
    let ok = true;
    DD.safe(label, function () {
      try { fn.apply(thisArg, args); } catch (e) { ok = false; brokenPainters[key] = true; throw e; }
    });
    return ok;
  }

  function settings() {
    const m = DD.Meta && DD.Meta.data;
    return (m && m.settings) || {};
  }

  function themeLook(theme) {
    const base = THEME_LOOK[theme] || DEFAULT_LOOK;
    const def = DD.Themes && DD.Themes[theme];
    const bg = def && def.bg && def.bg.top ? [def.bg.top, def.bg.bottom || base.bg[1]] : base.bg;
    const ambient = def && def.ambient !== undefined ? def.ambient : base.ambient;
    return { id: theme, bg: bg, ambient: ambient, tint: base.tint, wall: WALLS[theme] || WALLS.default };
  }

  // ---- glyph cache (emoji / short labels rendered once per size) -----------------------------------------
  const glyphs = new Map();
  function glyph(str, px) {
    px = Math.max(6, Math.round(px));
    const key = str + '|' + px;
    let cv = glyphs.get(key);
    if (cv) return cv;
    if (glyphs.size > 600) glyphs.clear();
    cv = document.createElement('canvas');
    const s = Math.ceil(px * 1.5);
    cv.width = s; cv.height = s;
    const c = cv.getContext('2d');
    c.font = px + 'px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", ' + FONT;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = '#ffffff';
    c.fillText(str, s / 2, s / 2 + px * 0.06);
    glyphs.set(key, cv);
    return cv;
  }
  /** Draw a cached glyph centered at (x, y) with a CSS-px size (screen space). */
  function drawGlyph(c, str, x, y, size) {
    if (!str) return;
    const cv = glyph(String(str), size * DPR);
    const s = cv.width / DPR;
    c.drawImage(cv, x - s / 2, y - s / 2, s, s);
  }

  /** Outlined text in screen space. */
  function label(c, str, x, y, size, color, opts) {
    opts = opts || {};
    c.font = (opts.weight || 'bold') + ' ' + size + 'px ' + (opts.font || FONT);
    c.textAlign = opts.align || 'center';
    c.textBaseline = opts.baseline || 'middle';
    if (opts.stroke !== false) {
      c.lineJoin = 'round';
      c.lineWidth = opts.strokeWidth || Math.max(2, size * 0.28);
      c.strokeStyle = opts.stroke || 'rgba(12,6,8,0.92)';
      c.strokeText(str, x, y);
    }
    c.fillStyle = color || '#ffffff';
    c.fillText(str, x, y);
  }

  function roundRect(c, x, y, w, h, r) { Iso.roundRectPath(c, x, y, w, h, r); }

  // ======================================================================================================
  // Terrain styles + cached top textures
  // ======================================================================================================
  const styleCache = new Map();

  /** Look of a terrain id (canonical table, themed walls, or the def's colors for content terrain). */
  function terrainStyle(id, theme) {
    const key = id === 'wall' ? 'wall|' + theme : id;
    let s = styleCache.get(key);
    if (s) return s;
    const def = DD.getTerrain ? DD.getTerrain(id) : null;
    const canon = TERRAIN[id];
    if (canon) {
      s = Object.assign({}, canon);
      if (canon.wall) {
        const wl = WALLS[theme] || WALLS.default;
        s.top = wl.top; s.left = wl.left; s.right = wl.right; s.side = wl.face; s.wallLook = wl;
        s.tall = def && def.tall > 0 ? def.tall : canon.tall;
      }
    } else {
      const col = (def && def.colors) || {};
      const top = col.top || (def && def.color) || '#7a7470';
      s = {
        top: top, left: col.left || shade(top, -0.22), right: col.right || shade(top, -0.38),
        side: 'plain', tex: def && def.liquid ? 'liquid' : 'generic', flip: true,
        pit: !!(def && def.pit), liquid: (def && def.liquid) || null, tall: (def && def.tall) || 0,
      };
      s.wall = s.tall >= 1;
      if (s.wall) s.wallLook = { top: s.top, left: s.left, right: s.right, mortar: shade(s.left, -0.35), face: 'brick' };
    }
    s.id = id;
    s.key = key;
    s.def = def;
    s.levels = Iso.levels(s.tall || 0);
    styleCache.set(key, s);
    return s;
  }

  const texCache = new Map();
  function texScale(zoom) {
    const z = zoom * DPR;
    return z <= 0.6 ? 0.6 : z <= 1 ? 1 : z <= 1.5 ? 1.5 : z <= 2 ? 2 : z <= 3 ? 3 : 4;
  }
  function topTexture(style, variant, S, grid) {
    const key = style.key + '#' + variant + '@' + S + (grid ? 'g' : '');
    let cv = texCache.get(key);
    if (cv) return cv;
    if (texCache.size > 1600) texCache.clear();
    cv = document.createElement('canvas');
    cv.width = Math.ceil((HW + TEX_PAD) * 2 * S);
    cv.height = Math.ceil((HH + TEX_PAD) * 2 * S);
    const c = cv.getContext('2d');
    c.setTransform(S, 0, 0, S, (HW + TEX_PAD) * S, (HH + TEX_PAD) * S);
    paintTop(c, style, variant, grid);
    texCache.set(key, cv);
    return cv;
  }

  function paintTop(c, s, variant, grid) {
    // slightly expanded base hides hairline seams between neighbours
    c.beginPath();
    c.moveTo(0, -HH - 0.3); c.lineTo(HW + 0.9, 0); c.lineTo(0, HH + 1.1); c.lineTo(-HW - 0.9, 0); c.closePath();
    c.fillStyle = s.top;
    c.fill();
    c.save();
    c.beginPath(); diamond(c, 0, 0, HW, HH); c.clip();
    const rnd = Iso.stream((U.hash(s.key) ^ Math.imul(variant + 1, 0x9e3779b1)) >>> 0);
    const fn = TEX[s.tex] || TEX.generic;
    try { fn(c, rnd, variant, s); } catch (e) { renderError('texture ' + s.id, e); }
    c.restore();
    c.lineWidth = 1;
    c.beginPath(); c.moveTo(-HW + 1, 0); c.lineTo(0, -HH + 0.5); c.lineTo(HW - 1, 0);
    c.strokeStyle = 'rgba(255,255,255,' + (s.pit ? 0 : 0.14) + ')';
    c.stroke();
    c.beginPath(); c.moveTo(-HW + 1, 0); c.lineTo(0, HH - 0.5); c.lineTo(HW - 1, 0);
    c.strokeStyle = 'rgba(0,0,0,0.26)';
    c.stroke();
    if (grid) {
      // optional tactical grid (settings.showGrid), baked in so it costs nothing per frame
      c.beginPath(); diamond(c, 0, 0, HW - 0.6, HH - 0.3);
      c.strokeStyle = 'rgba(10,6,8,0.22)'; c.lineWidth = 0.9; c.stroke();
    }
  }

  // ---- texture primitives (tile-local px, origin = tile top center) -----------------------------------
  function rp(r) { return P(r() - 0.5, r() - 0.5); }
  function specks(c, r, n, color, size) {
    c.fillStyle = color;
    for (let i = 0; i < n; i++) {
      const p = rp(r), s = size * (0.5 + r());
      c.fillRect(p[0] - s / 2, p[1] - s / 4, s, s * 0.5 + 0.35);
    }
  }
  function blobs(c, r, n, color, rmin, rmax) {
    inUV(c, function () {
      c.fillStyle = color;
      for (let i = 0; i < n; i++) {
        c.beginPath();
        c.arc(r() - 0.5, r() - 0.5, rmin + r() * (rmax - rmin), 0, TAU);
        c.fill();
      }
    });
  }
  function stroke(c, color, width) { c.strokeStyle = color; c.lineWidth = width; c.stroke(); }
  function pebble(c, x, y, rx, color) {
    c.beginPath(); c.ellipse(x, y + 0.6, rx, rx * 0.55, 0, 0, TAU); c.fillStyle = 'rgba(0,0,0,0.25)'; c.fill();
    c.beginPath(); c.ellipse(x, y, rx, rx * 0.55, 0, 0, TAU); c.fillStyle = color; c.fill();
    c.beginPath(); c.ellipse(x - rx * 0.3, y - rx * 0.18, rx * 0.4, rx * 0.2, 0, 0, TAU); c.fillStyle = 'rgba(255,255,255,0.28)'; c.fill();
  }

  const TEX = {
    stone: function (c, r, v, s) {
      const sv = (r() - 0.5) * 0.3, su1 = (r() - 0.5) * 0.4, su2 = (r() - 0.5) * 0.4;
      const cells = v === 3 ? [[-0.5, -0.5, 0.5, 0.5]] :
        [[-0.5, -0.5, su1, sv], [su1, -0.5, 0.5, sv], [-0.5, sv, su2, 0.5], [su2, sv, 0.5, 0.5]];
      inUV(c, function () {
        for (let i = 0; i < cells.length; i++) {
          const k = cells[i];
          c.fillStyle = shade(s.top, (r() - 0.5) * 0.16);
          c.fillRect(k[0], k[1], k[2] - k[0], k[3] - k[1]);
        }
      });
      if (v !== 3) {
        c.beginPath();
        uvSeg(c, -0.5, sv, 0.5, sv); uvSeg(c, su1, -0.5, su1, sv); uvSeg(c, su2, sv, su2, 0.5);
        stroke(c, rgba(shade(s.top, -0.5), 0.9), 1.1);
        c.beginPath();
        uvSeg(c, -0.5, sv + 0.025, 0.5, sv + 0.025);
        stroke(c, 'rgba(255,255,255,0.08)', 0.8);
      } else {
        c.beginPath();
        const a = rp(r), b = rp(r);
        c.moveTo(a[0], a[1]); c.quadraticCurveTo((a[0] + b[0]) / 2 + 4, (a[1] + b[1]) / 2 - 3, b[0], b[1]);
        stroke(c, rgba(shade(s.top, -0.5), 0.55), 0.7);
      }
      specks(c, r, 8, rgba(shade(s.top, -0.45), 0.6), 1.3);
      specks(c, r, 5, 'rgba(255,255,255,0.12)', 1.2);
    },
    cobble: function (c, r, v, s) {
      inUV(c, function () {
        for (let i = 0; i < 3; i++) {
          for (let j = 0; j < 3; j++) {
            const u = -0.5 + (i + 0.5) / 3 + (r() - 0.5) * 0.07;
            const w = -0.5 + (j + 0.5) / 3 + (r() - 0.5) * 0.07;
            const rad = 0.125 + r() * 0.035;
            c.beginPath(); c.arc(u + 0.012, w + 0.012, rad, 0, TAU); c.fillStyle = 'rgba(0,0,0,0.3)'; c.fill();
            c.beginPath(); c.arc(u, w, rad, 0, TAU); c.fillStyle = shade(s.stone, (r() - 0.5) * 0.24); c.fill();
            c.beginPath(); c.arc(u - rad * 0.28, w - rad * 0.28, rad * 0.5, 0, TAU); c.fillStyle = 'rgba(255,255,255,0.11)'; c.fill();
          }
        }
      });
      specks(c, r, 6, 'rgba(0,0,0,0.25)', 1);
    },
    dirt: function (c, r, v, s) {
      blobs(c, r, 3, rgba(shade(s.top, -0.25), 0.22), 0.1, 0.22);
      blobs(c, r, 2, rgba(shade(s.top, 0.18), 0.16), 0.08, 0.18);
      specks(c, r, 16, rgba(shade(s.top, -0.42), 0.7), 1.3);
      specks(c, r, 8, rgba(shade(s.top, 0.25), 0.55), 1.1);
      const n = 1 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) { const p = rp(r); pebble(c, p[0], p[1], 1.6 + r() * 1.4, shade('#8a7a68', (r() - 0.5) * 0.3)); }
      if (v === 2) {
        const a = rp(r);
        c.beginPath(); c.moveTo(a[0], a[1]); c.quadraticCurveTo(a[0] + 6, a[1] - 3, a[0] + 11, a[1] + 1);
        stroke(c, rgba(shade(s.top, -0.5), 0.6), 0.8);
      }
    },
    grass: function (c, r, v, s) {
      blobs(c, r, 4, rgba(shade(s.top, -0.18), 0.28), 0.1, 0.2);
      blobs(c, r, 3, rgba(shade(s.top, 0.16), 0.22), 0.08, 0.16);
      specks(c, r, 10, rgba(shade(s.top, -0.35), 0.45), 1.1);
      const tufts = 6 + Math.floor(r() * 4);
      c.lineCap = 'round';
      for (let i = 0; i < tufts; i++) {
        const p = rp(r);
        const tall = 2.6 + r() * 2.4;
        c.beginPath();
        c.moveTo(p[0] - 1.6, p[1]); c.lineTo(p[0] - 2.4, p[1] - tall * 0.8);
        c.moveTo(p[0], p[1]); c.lineTo(p[0] + 0.3, p[1] - tall);
        c.moveTo(p[0] + 1.6, p[1]); c.lineTo(p[0] + 2.6, p[1] - tall * 0.75);
        stroke(c, rgba(shade(s.top, i % 2 ? 0.3 : -0.25), 0.9), 0.9);
      }
      if (r() < 0.45) {
        const p = rp(r);
        const col = ['#f4f0e6', '#ffd84a', '#c99bff', '#ff8fb1'][Math.floor(r() * 4)];
        for (let k = 0; k < 4; k++) {
          const a = k * TAU / 4;
          c.beginPath(); c.ellipse(p[0] + Math.cos(a) * 1.2, p[1] + Math.sin(a) * 0.6, 1, 0.6, 0, 0, TAU); c.fillStyle = col; c.fill();
        }
        c.beginPath(); c.arc(p[0], p[1], 0.6, 0, TAU); c.fillStyle = '#e8a51c'; c.fill();
      }
    },
    wood: function (c, r, v, s) {
      inUV(c, function () {
        for (let i = 0; i < 4; i++) {
          c.fillStyle = shade(s.top, (r() - 0.5) * 0.16 + (i % 2 ? -0.05 : 0.03));
          c.fillRect(-0.5, -0.5 + i * 0.25, 1, 0.25);
        }
      });
      c.beginPath();
      for (let i = 0; i < 4; i++) {
        for (let k = 0; k < 2; k++) {
          const w = -0.5 + i * 0.25 + 0.05 + r() * 0.15, u0 = -0.5 + r() * 0.4;
          uvSeg(c, u0, w, Math.min(0.5, u0 + 0.25 + r() * 0.5), w + (r() - 0.5) * 0.02);
        }
      }
      stroke(c, rgba(shade(s.top, -0.38), 0.4), 0.6);
      c.beginPath();
      for (let i = 1; i < 4; i++) uvSeg(c, -0.5, -0.5 + i * 0.25, 0.5, -0.5 + i * 0.25);
      stroke(c, rgba(shade(s.top, -0.6), 0.95), 1.1);
      for (let i = 0; i < 4; i++) {
        if (r() < 0.55) {
          const ju = -0.38 + r() * 0.76, w0 = -0.5 + i * 0.25;
          c.beginPath(); uvSeg(c, ju, w0, ju, w0 + 0.25); stroke(c, rgba(shade(s.top, -0.6), 0.9), 1);
          c.fillStyle = 'rgba(30,20,12,0.75)';
          const n1 = P(ju - 0.05, w0 + 0.125), n2 = P(ju + 0.05, w0 + 0.125);
          c.fillRect(n1[0] - 0.6, n1[1] - 0.4, 1.2, 0.8); c.fillRect(n2[0] - 0.6, n2[1] - 0.4, 1.2, 0.8);
        }
      }
      if (v === 1) {
        const p = P((r() - 0.5) * 0.6, -0.5 + 0.125 + Math.floor(r() * 4) * 0.25);
        c.beginPath(); c.ellipse(p[0], p[1], 2.4, 1, 0, 0, TAU); c.fillStyle = rgba(shade(s.top, -0.5), 0.7); c.fill();
      }
    },
    sand: function (c, r, v, s) {
      for (let i = 0; i < 4; i++) {
        const w = -0.42 + i * 0.26 + (r() - 0.5) * 0.06;
        const a = P(-0.5, w), b = P(0.5, w + 0.08), m = P(0, w + (r() - 0.5) * 0.2);
        c.beginPath(); c.moveTo(a[0], a[1]); c.quadraticCurveTo(m[0], m[1] - 3, b[0], b[1]);
        stroke(c, 'rgba(255,255,255,0.22)', 0.9);
        c.beginPath(); c.moveTo(a[0], a[1] + 1.2); c.quadraticCurveTo(m[0], m[1] - 1.8, b[0], b[1] + 1.2);
        stroke(c, rgba(shade(s.top, -0.3), 0.3), 0.8);
      }
      specks(c, r, 18, rgba(shade(s.top, -0.35), 0.5), 0.9);
      if (v === 3) {
        const p = rp(r);
        c.beginPath(); c.arc(p[0], p[1], 1.8, Math.PI, 0); c.fillStyle = '#f3d9c8'; c.fill();
        stroke(c, 'rgba(120,80,60,0.6)', 0.5);
      }
    },
    moss: function (c, r, v, s) {
      for (let i = 0; i < 2; i++) { const p = rp(r); pebble(c, p[0], p[1], 3 + r() * 2.5, '#7d7a70'); }
      blobs(c, r, 7, rgba(shade(s.top, -0.12), 0.85), 0.08, 0.17);
      blobs(c, r, 5, rgba(shade(s.top, 0.18), 0.75), 0.05, 0.12);
      specks(c, r, 12, rgba(shade(s.top, 0.35), 0.5), 0.9);
    },
    crypt: function (c, r, v, s) {
      inUV(c, function () {
        c.fillStyle = shade(s.top, 0.05 + (r() - 0.5) * 0.06);
        c.fillRect(-0.44, -0.44, 0.88, 0.88);
      });
      c.beginPath();
      uvSeg(c, -0.36, -0.36, 0.36, -0.36); uvSeg(c, 0.36, -0.36, 0.36, 0.36);
      uvSeg(c, 0.36, 0.36, -0.36, 0.36); uvSeg(c, -0.36, 0.36, -0.36, -0.36);
      stroke(c, rgba(shade(s.top, -0.45), 0.6), 0.8);
      const ctr = P(0, 0);
      if (v === 0) {
        c.beginPath(); c.ellipse(ctr[0], ctr[1] - 0.6, 3.6, 2.4, 0, 0, TAU); stroke(c, rgba(shade(s.top, -0.5), 0.55), 0.8);
        c.fillStyle = rgba(shade(s.top, -0.55), 0.6);
        c.fillRect(ctr[0] - 2, ctr[1] - 1.2, 1.3, 0.9); c.fillRect(ctr[0] + 0.7, ctr[1] - 1.2, 1.3, 0.9);
      } else if (v === 1) {
        c.beginPath(); uvSeg(c, -0.14, 0, 0.14, 0); uvSeg(c, 0, -0.14, 0, 0.14);
        stroke(c, rgba('#b9a2e8', 0.35), 1);
      } else if (v === 2) {
        const a = rp(r);
        c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(a[0] + 4, a[1] + 1.5); c.lineTo(a[0] + 7, a[1] - 0.5); c.lineTo(a[0] + 11, a[1] + 1);
        stroke(c, rgba(shade(s.top, -0.55), 0.7), 0.7);
      }
      specks(c, r, 10, 'rgba(0,0,0,0.25)', 1);
      specks(c, r, 5, 'rgba(255,255,255,0.08)', 1);
    },
    obsidian: function (c, r, v, s) {
      for (let i = 0; i < 3; i++) {
        const a = rp(r), b = rp(r), d = rp(r);
        c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.lineTo(d[0], d[1]); c.closePath();
        c.fillStyle = rgba('#8a6aa8', 0.08 + r() * 0.08); c.fill();
      }
      for (let i = 0; i < 2; i++) {
        const p = rp(r);
        c.beginPath(); c.moveTo(p[0] - 4, p[1] + 1); c.lineTo(p[0] + 4, p[1] - 1);
        stroke(c, 'rgba(255,255,255,0.22)', 0.6);
      }
      if (v === 0 || v === 2) {
        const a = rp(r);
        c.beginPath(); c.moveTo(a[0], a[1]);
        let x = a[0], y = a[1];
        for (let k = 0; k < 4; k++) { x += 3 + r() * 4; y += (r() - 0.5) * 4; c.lineTo(x, y); }
        c.save(); c.shadowColor = '#ff5a1a'; c.shadowBlur = 4;
        stroke(c, '#ff5a1a', 1.2); c.restore();
        stroke(c, '#ffc070', 0.45);
      }
    },
  };

  Object.assign(TEX, {
    felt: function (c, r, v, s) {
      blobs(c, r, 3, rgba(shade(s.top, -0.12), 0.35), 0.12, 0.26);
      blobs(c, r, 2, rgba(shade(s.top, 0.1), 0.25), 0.1, 0.2);
      for (let i = 0; i < 160; i++) {
        const p = rp(r);
        c.fillStyle = i % 2 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)';
        c.fillRect(p[0], p[1], 0.9, 0.9);
      }
      c.beginPath();
      for (let i = -3; i <= 3; i++) { uvSeg(c, -0.5, i / 8, 0.5, i / 8); uvSeg(c, i / 8, -0.5, i / 8, 0.5); }
      stroke(c, 'rgba(0,0,0,0.06)', 0.6);
      if (v === 2) {
        // somebody put a sweaty soda can down here
        const p = rp(r);
        c.beginPath(); c.ellipse(p[0], p[1], 6, 3, 0, 0, TAU); stroke(c, 'rgba(15,35,15,0.28)', 1.4);
      } else if (v === 1 || v === 3) {
        for (let i = 0; i < 4; i++) { const p = rp(r); c.fillStyle = i % 2 ? '#ff9a1f' : '#e07a10'; c.fillRect(p[0], p[1], 1.4, 1); }
      }
    },
    paper: function (c, r, v, s) {
      c.beginPath();
      for (let i = 1; i < 4; i++) { uvSeg(c, -0.5, -0.5 + i * 0.25, 0.5, -0.5 + i * 0.25); uvSeg(c, -0.5 + i * 0.25, -0.5, -0.5 + i * 0.25, 0.5); }
      stroke(c, 'rgba(80,135,220,0.33)', 0.55);
      c.beginPath();
      uvSeg(c, -0.5, -0.5, 0.5, -0.5); uvSeg(c, -0.5, -0.5, -0.5, 0.5);
      stroke(c, 'rgba(60,110,210,0.5)', 0.9);
      const p = P((r() - 0.5) * 0.5, (r() - 0.5) * 0.5);
      const pencil = 'rgba(70,70,80,0.55)';
      if (v === 0) {
        c.beginPath(); c.moveTo(p[0] - 2.5, p[1] - 1.5); c.lineTo(p[0] + 2.5, p[1] + 1.5);
        c.moveTo(p[0] + 2.5, p[1] - 1.5); c.lineTo(p[0] - 2.5, p[1] + 1.5); stroke(c, pencil, 0.8);
      } else if (v === 1) {
        // a tiny stick-figure doodle of the party's fighter, probably
        c.beginPath(); c.arc(p[0], p[1] - 4, 1.4, 0, TAU);
        c.moveTo(p[0], p[1] - 2.6); c.lineTo(p[0], p[1] + 0.5);
        c.moveTo(p[0] - 2, p[1] - 1.6); c.lineTo(p[0] + 2, p[1] - 1.6);
        c.moveTo(p[0], p[1] + 0.5); c.lineTo(p[0] - 1.5, p[1] + 2.6);
        c.moveTo(p[0], p[1] + 0.5); c.lineTo(p[0] + 1.5, p[1] + 2.6);
        c.moveTo(p[0] + 2, p[1] - 1.6); c.lineTo(p[0] + 4.5, p[1] - 4.5);
        stroke(c, pencil, 0.7);
      } else if (v === 2) {
        c.beginPath(); c.ellipse(p[0], p[1], 7, 3.6, 0, 0, TAU); stroke(c, 'rgba(130,80,35,0.22)', 1.5);
        c.beginPath(); c.ellipse(p[0] + 0.5, p[1] + 0.3, 6.2, 3.1, 0, 0.4, 2.6); stroke(c, 'rgba(130,80,35,0.18)', 0.8);
      } else {
        c.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = k * TAU / 6 - Math.PI / 2;
          const x = p[0] + Math.cos(a) * 3.2, y = p[1] + Math.sin(a) * 2.6;
          if (k) c.lineTo(x, y); else c.moveTo(x, y);
        }
        c.closePath();
        c.moveTo(p[0], p[1] - 2.6); c.lineTo(p[0] - 2.2, p[1] + 1.3); c.lineTo(p[0] + 2.2, p[1] + 1.3); c.closePath();
        stroke(c, 'rgba(180,50,50,0.45)', 0.6);
      }
    },
    gold: function (c, r, v, s) {
      const coins = [];
      for (let i = 0; i < 17; i++) coins.push(rp(r).concat([2.6 + r() * 1.6, r()]));
      coins.sort(function (a, b) { return a[1] - b[1]; });
      for (let i = 0; i < coins.length; i++) {
        const k = coins[i];
        const stack = k[3] < 0.15 ? 3 : k[3] < 0.3 ? 2 : 1;
        for (let j = 0; j < stack; j++) {
          const y = k[1] - j * 1.4;
          c.beginPath(); c.ellipse(k[0], y + 0.7, k[2], k[2] * 0.5, 0, 0, TAU); c.fillStyle = '#7a5410'; c.fill();
          c.beginPath(); c.ellipse(k[0], y, k[2], k[2] * 0.5, 0, 0, TAU); c.fillStyle = shade('#f0c040', (k[3] - 0.5) * 0.18); c.fill();
          c.beginPath(); c.ellipse(k[0], y, k[2] * 0.62, k[2] * 0.3, 0, 0, TAU); stroke(c, 'rgba(150,100,20,0.6)', 0.5);
        }
        if (k[3] > 0.9) {
          c.beginPath(); c.ellipse(k[0] - k[2] * 0.3, k[1] - k[2] * 0.15 - (stack - 1) * 1.4, k[2] * 0.35, k[2] * 0.15, 0, 0, TAU);
          c.fillStyle = 'rgba(255,255,230,0.75)'; c.fill();
        }
      }
    },
    carpet: function (c, r, v, s) {
      c.beginPath();
      for (let i = -2; i <= 2; i++) { uvSeg(c, -0.5, i * 0.25 + 0.125, 0.5, i * 0.25 + 0.125); uvSeg(c, i * 0.25 + 0.125, -0.5, i * 0.25 + 0.125, 0.5); }
      stroke(c, rgba(shade(s.top, -0.35), 0.55), 1.2);
      c.fillStyle = 'rgba(232,184,74,0.75)';
      for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
        const q = P(i * 0.25 + 0.125, j * 0.25 + 0.125);
        c.fillRect(q[0] - 0.7, q[1] - 0.4, 1.4, 0.8);
      }
      const m = P(0, 0);
      c.beginPath(); diamond(c, m[0], m[1], 7, 3.5); c.fillStyle = 'rgba(232,184,74,0.85)'; c.fill();
      c.beginPath(); diamond(c, m[0], m[1], 4, 2); c.fillStyle = '#2b3a6e'; c.fill();
      specks(c, r, 20, 'rgba(0,0,0,0.12)', 0.9);
    },
    grate: function (c, r, v, s) {
      blobs(c, r, 4, 'rgba(110,190,70,0.16)', 0.08, 0.2);
      const metal = '#5b6169';
      inUV(c, function () {
        c.fillStyle = metal;
        for (let i = 1; i < 4; i++) { c.fillRect(-0.5 + i * 0.25 - 0.03, -0.5, 0.06, 1); c.fillRect(-0.5, -0.5 + i * 0.25 - 0.03, 1, 0.06); }
        c.fillStyle = shade(metal, 0.1);
        c.fillRect(-0.5, -0.5, 1, 0.07); c.fillRect(-0.5, -0.5, 0.07, 1);
        c.fillRect(-0.5, 0.43, 1, 0.07); c.fillRect(0.43, -0.5, 0.07, 1);
      });
      c.beginPath();
      for (let i = 1; i < 4; i++) { uvSeg(c, -0.5, -0.5 + i * 0.25 - 0.03, 0.5, -0.5 + i * 0.25 - 0.03); uvSeg(c, -0.5 + i * 0.25 - 0.03, -0.5, -0.5 + i * 0.25 - 0.03, 0.5); }
      stroke(c, 'rgba(255,255,255,0.14)', 0.5);
      c.fillStyle = '#9aa1a8';
      [[-0.46, -0.46], [0.46, -0.46], [0.46, 0.46], [-0.46, 0.46]].forEach(function (q) { const p = P(q[0], q[1]); c.fillRect(p[0] - 0.8, p[1] - 0.5, 1.6, 1); });
      specks(c, r, 8, 'rgba(160,90,40,0.35)', 1.2);
    },
    marble: function (c, r, v, s) {
      blobs(c, r, 3, 'rgba(120,115,130,0.07)', 0.12, 0.25);
      for (let i = 0; i < 3; i++) {
        const a = P(-0.5, (r() - 0.5)), b = P(0.5, (r() - 0.5));
        const m1 = rp(r), m2 = rp(r);
        c.beginPath(); c.moveTo(a[0], a[1]); c.bezierCurveTo(m1[0], m1[1], m2[0], m2[1], b[0], b[1]);
        stroke(c, i ? 'rgba(130,125,140,0.22)' : 'rgba(110,105,120,0.42)', i ? 0.5 : 0.8);
      }
      c.beginPath(); c.moveTo(-14, -8); c.lineTo(-4, -12); c.lineTo(10, 4); c.lineTo(0, 8); c.closePath();
      c.fillStyle = 'rgba(255,255,255,0.10)'; c.fill();
    },
    wallcap: function (c, r, v, s) {
      const wl = s.wallLook || WALLS.default;
      inUV(c, function () { c.fillStyle = shade(s.top, 0.07); c.fillRect(-0.4, -0.4, 0.8, 0.8); });
      const su = (r() - 0.5) * 0.3;
      c.beginPath(); uvSeg(c, su, -0.5, su, 0.5); stroke(c, rgba(wl.mortar, 0.8), 1);
      c.beginPath();
      uvSeg(c, -0.4, -0.4, 0.4, -0.4); uvSeg(c, -0.4, -0.4, -0.4, 0.4);
      stroke(c, 'rgba(255,255,255,0.12)', 0.8);
      specks(c, r, 9, 'rgba(0,0,0,0.22)', 1.1);
      if (wl.moss) blobs(c, r, 4, rgba(wl.moss, 0.75), 0.05, 0.13);
      if (wl.slime) blobs(c, r, 3, rgba(wl.slime, 0.45), 0.04, 0.1);
      if (wl.trim) {
        c.beginPath();
        uvSeg(c, -0.47, -0.47, 0.47, -0.47); uvSeg(c, 0.47, -0.47, 0.47, 0.47);
        uvSeg(c, 0.47, 0.47, -0.47, 0.47); uvSeg(c, -0.47, 0.47, -0.47, -0.47);
        stroke(c, rgba(wl.trim, 0.7), 0.9);
      }
      if (wl.glow) {
        const a = rp(r);
        c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(a[0] + 5, a[1] + 2); c.lineTo(a[0] + 9, a[1] - 1);
        c.save(); c.shadowColor = wl.glow; c.shadowBlur = 4; stroke(c, wl.glow, 1); c.restore();
      }
      if (wl.face === 'books') {
        // the top of a stack of rulebooks: cover with gilt title lines
        inUV(c, function () { c.fillStyle = shade(s.top, -0.05); c.fillRect(-0.46, -0.46, 0.92, 0.92); });
        c.beginPath(); uvSeg(c, -0.25, -0.1, 0.25, -0.1); uvSeg(c, -0.18, 0.05, 0.18, 0.05);
        stroke(c, 'rgba(240,200,90,0.85)', 1);
      }
      if (wl.face === 'marble') TEX.marble(c, r, v, s);
    },
    water: function (c, r, v, s) {
      inUV(c, function () {
        c.fillStyle = rgba(shade(s.top, -0.25), 0.5); c.fillRect(-0.36, -0.36, 0.72, 0.72);
        c.fillStyle = rgba(shade(s.top, -0.4), 0.4); c.fillRect(-0.22, -0.22, 0.44, 0.44);
      });
      for (let i = 0; i < 3; i++) {
        const p = rp(r);
        c.beginPath(); c.ellipse(p[0], p[1], 4 + r() * 4, 1.4, 0, 0, Math.PI); stroke(c, 'rgba(200,240,255,0.12)', 0.7);
      }
    },
    deep: function (c, r, v, s) {
      inUV(c, function () {
        c.fillStyle = rgba(shade(s.top, -0.3), 0.6); c.fillRect(-0.38, -0.38, 0.76, 0.76);
        c.fillStyle = rgba(shade(s.top, -0.5), 0.5); c.fillRect(-0.2, -0.2, 0.4, 0.4);
      });
    },
    liquid: function (c, r, v, s) {
      inUV(c, function () { c.fillStyle = rgba(shade(s.top, -0.25), 0.45); c.fillRect(-0.3, -0.3, 0.6, 0.6); });
    },
    lava: function (c, r, v, s) {
      blobs(c, r, 4, 'rgba(255,220,90,0.55)', 0.08, 0.18);
      const n = 3 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) {
        const p = rp(r), rad = 3 + r() * 4.5;
        c.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = k * TAU / 6 + r() * 0.5, rr = rad * (0.7 + r() * 0.5);
          const x = p[0] + Math.cos(a) * rr, y = p[1] + Math.sin(a) * rr * 0.5;
          if (k) c.lineTo(x, y); else c.moveTo(x, y);
        }
        c.closePath();
        c.fillStyle = shade('#3a1a12', (r() - 0.5) * 0.3); c.fill();
        stroke(c, 'rgba(255,150,60,0.9)', 0.8);
      }
    },
    mud: function (c, r, v, s) {
      blobs(c, r, 4, rgba(shade(s.top, -0.35), 0.45), 0.1, 0.2);
      blobs(c, r, 3, rgba(shade(s.top, 0.12), 0.3), 0.05, 0.12);
      for (let i = 0; i < 3; i++) {
        const p = rp(r);
        c.beginPath(); c.ellipse(p[0], p[1], 2.5 + r() * 2, 0.8, 0, 0, TAU); c.fillStyle = 'rgba(255,255,255,0.13)'; c.fill();
      }
      specks(c, r, 12, rgba(shade(s.top, -0.45), 0.6), 1.2);
    },
    ice: function (c, r, v, s) {
      for (let i = 0; i < 3; i++) {
        const a = rp(r), b = rp(r), d = rp(r);
        c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.lineTo(d[0], d[1]); c.closePath();
        c.fillStyle = 'rgba(255,255,255,' + (0.1 + r() * 0.15) + ')'; c.fill();
      }
      for (let i = 0; i < 2; i++) {
        const a = rp(r);
        let x = a[0], y = a[1];
        c.beginPath(); c.moveTo(x, y);
        for (let k = 0; k < 4; k++) {
          x += (r() - 0.3) * 8; y += (r() - 0.5) * 4; c.lineTo(x, y);
          if (r() < 0.4) { c.moveTo(x, y); c.lineTo(x + (r() - 0.5) * 6, y + (r() - 0.5) * 3); c.moveTo(x, y); }
        }
        stroke(c, 'rgba(255,255,255,0.7)', 0.6);
      }
      specks(c, r, 10, 'rgba(255,255,255,0.5)', 0.8);
    },
    rubble: function (c, r, v, s) {
      blobs(c, r, 3, rgba(shade(s.top, -0.2), 0.3), 0.1, 0.2);
      specks(c, r, 12, rgba(shade(s.top, -0.4), 0.6), 1.2);
      const n = 4 + Math.floor(r() * 3);
      const chunks = [];
      for (let i = 0; i < n; i++) chunks.push(rp(r).concat([2 + r() * 3.2, r()]));
      chunks.sort(function (a, b) { return a[1] - b[1]; });
      for (let i = 0; i < chunks.length; i++) {
        const k = chunks[i], w = k[2], hgt = 1.2 + k[3] * 2;
        const col = shade(s.top, (k[3] - 0.5) * 0.3);
        c.beginPath();
        c.moveTo(k[0] - w, k[1]); c.lineTo(k[0], k[1] + w * 0.5); c.lineTo(k[0] + w, k[1]);
        c.lineTo(k[0] + w, k[1] - hgt); c.lineTo(k[0] - w, k[1] - hgt); c.closePath();
        c.fillStyle = shade(col, -0.3); c.fill();
        c.beginPath(); diamond(c, k[0], k[1] - hgt, w, w * 0.5); c.fillStyle = shade(col, 0.1); c.fill();
        stroke(c, 'rgba(0,0,0,0.35)', 0.5);
      }
    },
    bridge: function (c, r, v, s) {
      inUV(c, function () {
        const g = c.createLinearGradient(0, -0.5, 0, 0.5);
        g.addColorStop(0, '#2a2018'); g.addColorStop(1, '#0d0907');
        c.fillStyle = g; c.fillRect(-0.5, -0.5, 1, 1);
        for (let i = 0; i < 5; i++) {
          c.fillStyle = shade('#8a5f36', (r() - 0.5) * 0.25);
          c.fillRect(-0.5 + i * 0.2 + 0.015, -0.44, 0.17, 0.88);
        }
        c.fillStyle = '#4a3220';
        c.fillRect(-0.5, -0.5, 1, 0.07); c.fillRect(-0.5, 0.43, 1, 0.07);
      });
      c.beginPath();
      for (let i = 0; i < 5; i++) { uvSeg(c, -0.5 + i * 0.2 + 0.03, -0.44, -0.5 + i * 0.2 + 0.03, 0.44); }
      stroke(c, 'rgba(255,230,190,0.12)', 0.5);
      c.fillStyle = 'rgba(30,20,12,0.8)';
      for (let i = 0; i < 5; i++) {
        const a = P(-0.5 + i * 0.2 + 0.1, -0.38), b = P(-0.5 + i * 0.2 + 0.1, 0.38);
        c.fillRect(a[0] - 0.6, a[1] - 0.4, 1.2, 0.8); c.fillRect(b[0] - 0.6, b[1] - 0.4, 1.2, 0.8);
      }
    },
    generic: function (c, r, v, s) {
      blobs(c, r, 3, rgba(shade(s.top, -0.2), 0.25), 0.1, 0.22);
      blobs(c, r, 2, rgba(shade(s.top, 0.15), 0.2), 0.08, 0.16);
      specks(c, r, 14, rgba(shade(s.top, -0.4), 0.55), 1.2);
      specks(c, r, 6, rgba(shade(s.top, 0.3), 0.45), 1);
    },
  });

  // ======================================================================================================
  // Tile blocks: side faces, tops, pits, animated liquids
  // ======================================================================================================
  function gridTile(F, x, y) { return x >= 0 && y >= 0 && x < F.gw && y < F.gh ? F.tiles[y * F.gw + x] : null; }

  /** Visual top elevation (levels) of a tile: h plus wall height. */
  function topLevel(F, t) { return (t.h || 0) + terrainStyle(t.t, F.theme).levels; }

  /** Elevation a tile's side face drops to on one side: the front neighbour's top or the board slab. */
  function faceBottom(F, nx, ny, selfTop) {
    const n = gridTile(F, nx, ny);
    if (!n) return -SLAB;
    const ns = terrainStyle(n.t, F.theme);
    if (ns.pit) return Math.min(selfTop, n.h || 0); // pits paint their own inner walls
    return (n.h || 0) + ns.levels;
  }

  function edgeAt(x0, y0, x1, y1, u) { return [x0 + (x1 - x0) * u, y0 + (y1 - y0) * u]; }
  function courses(c, x0, y0, x1, y1, d, sp, off) {
    for (let k = off === undefined ? sp : off; k < d - 0.5; k += sp) { c.moveTo(x0, y0 + k); c.lineTo(x1, y1 + k); }
  }
  function joints(c, x0, y0, x1, y1, d, sp, n) {
    let row = 0;
    for (let k = 0; k < d - 0.5; k += sp, row++) {
      for (let i = 0; i < n; i++) {
        const u = (i + (row % 2 ? 0.5 : 0) + 0.25) / n;
        if (u <= 0.04 || u >= 0.96) continue;
        const p = edgeAt(x0, y0, x1, y1, u);
        c.moveTo(p[0], p[1] + k); c.lineTo(p[0], p[1] + Math.min(d, k + sp));
      }
    }
  }
  function lipBand(c, color, x0, y0, x1, y1, r) {
    c.beginPath(); c.moveTo(x0, y0 - 0.5);
    const n = 8;
    for (let i = 0; i <= n; i++) {
      const p = edgeAt(x0, y0, x1, y1, i / n);
      c.lineTo(p[0], p[1] + (i % 2 ? 4.5 + r() * 1.5 : 2.2));
    }
    c.lineTo(x1, y1 - 0.5); c.closePath();
    c.fillStyle = color; c.fill();
    stroke(c, 'rgba(0,0,0,0.25)', 0.6);
  }
  function drips(c, color, x0, y0, x1, y1, d, r, n) {
    c.strokeStyle = color; c.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const p = edgeAt(x0, y0, x1, y1, 0.12 + r() * 0.76), len = Math.min(d - 1, 3 + r() * 9);
      c.beginPath(); c.moveTo(p[0], p[1]); c.lineTo(p[0], p[1] + len); c.lineWidth = 1.6 + r(); c.stroke();
      c.beginPath(); c.arc(p[0], p[1] + len, 1.1, 0, TAU); c.fillStyle = color; c.fill();
    }
  }

  // Side-face detail painters: (c, style, x0,y0 -> x1,y1 top edge, depth px, rng, isLeft, tile)
  const FACE = {
    stone: function (c, s, x0, y0, x1, y1, d, r) {
      c.beginPath(); courses(c, x0, y0, x1, y1, d, 10); joints(c, x0, y0, x1, y1, d, 10, 2);
      stroke(c, 'rgba(0,0,0,0.3)', 0.9);
      c.beginPath(); courses(c, x0, y0 + 1, x1, y1 + 1, d, 10); stroke(c, 'rgba(255,255,255,0.06)', 0.7);
      if (s.liquid) waterline(c, s, x0, y0, x1, y1);
      if (s.lip) lipBand(c, s.lip, x0, y0, x1, y1, r);
    },
    brick: function (c, s, x0, y0, x1, y1, d, r) {
      const wl = s.wallLook || WALLS.default;
      for (let i = 0; i < 5; i++) {
        const row = Math.floor(r() * Math.max(1, d / 7)), u = Math.floor(r() * 3) / 3;
        const a = edgeAt(x0, y0, x1, y1, u), b = edgeAt(x0, y0, x1, y1, u + 1 / 3);
        c.beginPath(); c.moveTo(a[0], a[1] + row * 7); c.lineTo(b[0], b[1] + row * 7); c.lineTo(b[0], b[1] + row * 7 + 7); c.lineTo(a[0], a[1] + row * 7 + 7); c.closePath();
        c.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.1)'; c.fill();
      }
      c.beginPath(); courses(c, x0, y0, x1, y1, d, 7); joints(c, x0, y0, x1, y1, d, 7, 3);
      stroke(c, rgba(wl.mortar, 0.85), 1);
      c.beginPath(); courses(c, x0, y0 + 1, x1, y1 + 1, d, 7); stroke(c, 'rgba(255,255,255,0.07)', 0.6);
      c.beginPath(); c.moveTo(x0, y0 + 3); c.lineTo(x1, y1 + 3); stroke(c, 'rgba(255,255,255,0.1)', 2.5);
      if (wl.trim) { c.beginPath(); c.moveTo(x0, y0 + 5); c.lineTo(x1, y1 + 5); stroke(c, rgba(wl.trim, 0.55), 1.1); }
      if (wl.moss) drips(c, rgba(wl.moss, 0.85), x0, y0, x1, y1, d, r, 3);
      if (wl.slime) drips(c, rgba(wl.slime, 0.75), x0, y0, x1, y1, d, r, 4);
    },
    earth: function (c, s, x0, y0, x1, y1, d, r) {
      c.beginPath();
      for (let k = 7 + r() * 4; k < d - 2; k += 9 + r() * 6) {
        c.moveTo(x0, y0 + k);
        for (let i = 1; i <= 4; i++) { const p = edgeAt(x0, y0, x1, y1, i / 4); c.lineTo(p[0], p[1] + k + (r() - 0.5) * 3); }
      }
      stroke(c, 'rgba(0,0,0,0.22)', 1);
      for (let i = 0; i < Math.min(6, 1 + d / 10); i++) {
        const p = edgeAt(x0, y0, x1, y1, 0.1 + r() * 0.8);
        pebble(c, p[0], p[1] + 4 + r() * (d - 6), 1.2 + r() * 1.6, 'rgba(150,135,115,0.8)');
      }
      const wl = s.wallLook;
      if (wl && wl.roots) {
        c.beginPath();
        for (let i = 0; i < 2; i++) {
          const p = edgeAt(x0, y0, x1, y1, 0.2 + r() * 0.6);
          c.moveTo(p[0], p[1]); c.bezierCurveTo(p[0] + 4, p[1] + d * 0.3, p[0] - 5, p[1] + d * 0.5, p[0] + 2, p[1] + d * 0.8);
        }
        stroke(c, rgba(wl.roots, 0.9), 1.4);
      }
      if (s.liquid) waterline(c, s, x0, y0, x1, y1);
      if (s.lip) lipBand(c, s.lip, x0, y0, x1, y1, r);
    },
    wood: function (c, s, x0, y0, x1, y1, d) {
      c.beginPath(); joints(c, x0, y0, x1, y1, d, d + 1, 4);
      courses(c, x0, y0, x1, y1, d, 12, 4);
      stroke(c, 'rgba(0,0,0,0.32)', 0.9);
      c.fillStyle = 'rgba(30,20,10,0.7)';
      for (let i = 1; i < 4; i++) { const p = edgeAt(x0, y0, x1, y1, i / 4 - 0.06); c.fillRect(p[0] - 0.6, p[1] + 2, 1.2, 1.2); }
    },
    metal: function (c, s, x0, y0, x1, y1, d) {
      c.beginPath(); courses(c, x0, y0, x1, y1, d, 6, 3); stroke(c, 'rgba(0,0,0,0.35)', 1);
      c.fillStyle = 'rgba(210,215,220,0.6)';
      for (let i = 1; i < 6; i++) { const p = edgeAt(x0, y0, x1, y1, i / 6); c.fillRect(p[0] - 0.7, p[1] + 1.5, 1.4, 1.2); }
      c.beginPath(); c.moveTo(x0, y0 + 0.8); c.lineTo(x1, y1 + 0.8); stroke(c, 'rgba(255,255,255,0.18)', 1);
    },
    gold: function (c, s, x0, y0, x1, y1, d, r) {
      c.beginPath(); courses(c, x0, y0, x1, y1, d, 3.5, 2); stroke(c, 'rgba(90,60,10,0.45)', 0.8);
      c.beginPath(); courses(c, x0, y0 + 1, x1, y1 + 1, d, 3.5, 2); stroke(c, 'rgba(255,230,140,0.3)', 0.6);
      c.fillStyle = 'rgba(255,250,210,0.75)';
      for (let i = 0; i < 4; i++) { const p = edgeAt(x0, y0, x1, y1, r()); c.fillRect(p[0] - 1, p[1] + 2 + r() * (d - 4), 2, 1); }
    },
    paper: function (c, s, x0, y0, x1, y1, d, r) {
      c.beginPath(); courses(c, x0, y0, x1, y1, d, 2, 1.5); stroke(c, 'rgba(150,140,115,0.45)', 0.5);
      const covers = ['#2d5aa8', '#a83232', '#3d8a4a', '#6b3fa0'];
      for (let k = 6 + r() * 6; k < d - 1; k += 9 + r() * 9) {
        c.beginPath(); c.moveTo(x0, y0 + k); c.lineTo(x1, y1 + k); stroke(c, covers[Math.floor(r() * covers.length)], 1.8);
      }
    },
    table: function (c, s, x0, y0, x1, y1, d, r) {
      c.beginPath(); courses(c, x0, y0, x1, y1, d, 3 + r() * 2, 4); stroke(c, 'rgba(0,0,0,0.18)', 0.6);
      c.beginPath(); c.moveTo(x0, y0 + 1.2); c.lineTo(x1, y1 + 1.2); stroke(c, '#d9b46a', 1.4);
      c.beginPath(); c.moveTo(x0, y0 + 3.2); c.lineTo(x1, y1 + 3.2); stroke(c, 'rgba(0,0,0,0.35)', 0.8);
    },
    ice: function (c, s, x0, y0, x1, y1, d, r) {
      c.beginPath();
      for (let i = 0; i < 4; i++) { const p = edgeAt(x0, y0, x1, y1, 0.1 + r() * 0.8); c.moveTo(p[0], p[1] + 2); c.lineTo(p[0] + (r() - 0.5) * 3, p[1] + d * (0.4 + r() * 0.5)); }
      stroke(c, 'rgba(255,255,255,0.4)', 0.8);
      c.beginPath(); c.moveTo(x0, y0 + 1); c.lineTo(x1, y1 + 1); stroke(c, 'rgba(255,255,255,0.5)', 1.2);
    },
    lava: function (c, s, x0, y0, x1, y1, d, r) {
      c.beginPath(); courses(c, x0, y0, x1, y1, d, 9); stroke(c, 'rgba(0,0,0,0.3)', 0.8);
      c.beginPath();
      for (let i = 0; i < 2; i++) {
        let p = edgeAt(x0, y0, x1, y1, 0.15 + r() * 0.7), y = p[1] + 2;
        c.moveTo(p[0], y);
        for (let k = 0; k < 4 && y < p[1] + d; k++) { y += 3 + r() * 5; c.lineTo(p[0] + (r() - 0.5) * 5, y); }
      }
      stroke(c, 'rgba(255,90,20,0.35)', 2.6);
      stroke(c, '#ffb050', 0.7);
      c.beginPath(); c.moveTo(x0, y0 + 1); c.lineTo(x1, y1 + 1); stroke(c, 'rgba(255,120,40,0.85)', 2);
    },
    obsidian: function (c, s, x0, y0, x1, y1, d, r) {
      c.beginPath();
      for (let i = 0; i < 3; i++) { const p = edgeAt(x0, y0, x1, y1, r()); c.moveTo(p[0], p[1] + 2 + r() * d * 0.5); c.lineTo(p[0] + 2, p[1] + 6 + r() * d * 0.5); }
      stroke(c, 'rgba(190,160,230,0.22)', 0.8);
      const wl = s.wallLook;
      if (wl && wl.glow) {
        c.beginPath();
        const p = edgeAt(x0, y0, x1, y1, 0.3 + r() * 0.4);
        c.moveTo(p[0], p[1] + 3); c.lineTo(p[0] + 3, p[1] + d * 0.35); c.lineTo(p[0] - 1, p[1] + d * 0.7);
        stroke(c, rgba(wl.glow, 0.35), 2.6); stroke(c, '#ffb050', 0.7);
      }
    },
    marble: function (c, s, x0, y0, x1, y1, d, r) {
      c.beginPath(); courses(c, x0, y0, x1, y1, d, 16); stroke(c, 'rgba(90,85,95,0.25)', 0.8);
      c.beginPath();
      const p = edgeAt(x0, y0, x1, y1, r());
      c.moveTo(p[0], p[1]); c.bezierCurveTo(p[0] + 6, p[1] + d * 0.3, p[0] - 6, p[1] + d * 0.6, p[0] + 3, p[1] + d);
      stroke(c, 'rgba(110,105,120,0.3)', 0.7);
      const wl = s.wallLook;
      if (wl && wl.trim) { c.beginPath(); c.moveTo(x0, y0 + 2.5); c.lineTo(x1, y1 + 2.5); stroke(c, wl.trim, 1.6); }
    },
    books: function (c, s, x0, y0, x1, y1, d, r, isLeft) {
      const cols = ['#7c3030', '#2d4f8a', '#3b6b3f', '#6a4a8c', '#8a6a2a', '#2f2f3a'];
      let k = 0;
      while (k < d - 0.5) {
        const th = 5 + Math.floor(r() * 4);
        const col = cols[Math.floor(r() * cols.length)];
        const b0 = Math.min(d, k + th);
        c.beginPath(); c.moveTo(x0, y0 + k); c.lineTo(x1, y1 + k); c.lineTo(x1, y1 + b0); c.lineTo(x0, y0 + b0); c.closePath();
        if (isLeft) {
          c.fillStyle = col; c.fill();
          c.beginPath();
          const a = edgeAt(x0, y0, x1, y1, 0.3 + r() * 0.2);
          c.moveTo(a[0], a[1] + k + th / 2); c.lineTo(a[0] + 8, a[1] + 4 + k + th / 2);
          stroke(c, 'rgba(240,200,90,0.8)', 0.9);
        } else {
          c.fillStyle = '#ece2c6'; c.fill();
          c.beginPath(); courses(c, x0, y0 + k, x1, y1 + k, b0 - k, 1.6, 1.2); stroke(c, 'rgba(150,135,100,0.45)', 0.4);
          c.beginPath(); c.moveTo(x0, y0 + k + 0.6); c.lineTo(x1, y1 + k + 0.6); stroke(c, col, 1.2);
        }
        k = b0;
      }
    },
    plain: function (c, s, x0, y0, x1, y1, d) {
      c.beginPath(); courses(c, x0, y0, x1, y1, d, 12); stroke(c, 'rgba(0,0,0,0.2)', 0.8);
      if (s.liquid) waterline(c, s, x0, y0, x1, y1);
    },
  };
  function waterline(c, s, x0, y0, x1, y1) {
    c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.lineTo(x1, y1 + 3); c.lineTo(x0, y0 + 3); c.closePath();
    c.fillStyle = rgba(s.top, 0.85); c.fill();
  }

  // Side faces are cached as images per (style, side, depth, variant, scale): clip + detail strokes + gradient
  // per face per frame was the single most expensive part of the world pass.
  const faceCache = new Map();
  const FACE_PAD = 2;
  function faceImage(s, isLeft, d, variant, S) {
    const key = s.key + (isLeft ? '|L' : '|R') + d + '#' + variant + '@' + S;
    let cv = faceCache.get(key);
    if (cv) return cv;
    if (faceCache.size > 1500) faceCache.clear();
    cv = document.createElement('canvas');
    cv.width = Math.ceil((HW + FACE_PAD * 2) * S);
    cv.height = Math.ceil((HH + d + FACE_PAD * 2) * S);
    const c = cv.getContext('2d');
    c.setTransform(S, 0, 0, S, (isLeft ? HW + FACE_PAD : FACE_PAD) * S, FACE_PAD * S);
    paintFace(c, s, 0, 0, d, isLeft, Iso.stream(U.hash(s.key) ^ Math.imul(variant + (isLeft ? 1 : 5), 0x85ebca6b)));
    faceCache.set(key, cv);
    return cv;
  }
  function drawFace(F, c, s, t, cx, cy, d, isLeft) {
    d = Math.round(d * 2) / 2;
    const img = faceImage(s, isLeft, d, Iso.hash(t.x, t.y, isLeft ? 11 : 12) & 3, F.texS);
    c.drawImage(img, cx - (isLeft ? HW + FACE_PAD : FACE_PAD), cy - FACE_PAD, img.width / F.texS, img.height / F.texS);
  }
  function paintFace(c, s, cx, cy, d, isLeft, rng) {
    const x0 = isLeft ? cx - HW : cx, y0 = isLeft ? cy : cy + HH;
    const x1 = isLeft ? cx : cx + HW, y1 = isLeft ? cy + HH : cy;
    c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.lineTo(x1, y1 + d); c.lineTo(x0, y0 + d); c.closePath();
    c.fillStyle = isLeft ? s.left : s.right;
    c.fill();
    c.save();
    c.clip();
    const fd = FACE[s.side] || FACE.plain;
    try { fd(c, s, x0, y0, x1, y1, d, rng, isLeft); } catch (e) { renderError('face ' + s.id, e); }
    const g = c.createLinearGradient(0, Math.min(y0, y1), 0, Math.max(y0, y1) + d);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,' + Math.min(0.5, 0.12 + d / 170) + ')');
    c.fillStyle = g;
    c.fillRect(Math.min(x0, x1) - 1, Math.min(y0, y1) - 1, HW + 2, HH + d + 2);
    c.restore();
    c.lineWidth = 1;
    c.beginPath();
    if (isLeft) { c.moveTo(x0, y0); c.lineTo(x0, y0 + d); c.lineTo(x1, y1 + d); }
    else { c.moveTo(x1, y1); c.lineTo(x1, y1 + d); c.lineTo(x0, y0 + d); }
    c.strokeStyle = 'rgba(8,4,6,0.5)';
    c.stroke();
    c.beginPath();
    c.moveTo(cx, cy + HH + 0.5); c.lineTo(cx, cy + HH + d);
    c.strokeStyle = 'rgba(255,255,255,0.07)';
    c.stroke();
  }

  function drawTop(F, c, t, s, cx, cy) {
    const variant = Iso.hash(t.x, t.y, 77) & 3;
    const tex = topTexture(s, variant, F.texS, F.showGrid && !s.wall);
    const tw = (HW + TEX_PAD) * 2, th = (HH + TEX_PAD) * 2;
    if (s.flip && (Iso.hash(t.x, t.y, 91) & 1)) {
      c.save(); c.translate(cx, cy); c.scale(-1, 1);
      c.drawImage(tex, -HW - TEX_PAD, -HH - TEX_PAD, tw, th);
      c.restore();
    } else {
      c.drawImage(tex, cx - HW - TEX_PAD, cy - HH - TEX_PAD, tw, th);
    }
    if (t.h > 0 && !s.wall) fillDiamond(c, cx, cy, 'rgba(255,236,210,' + Math.min(0.12, t.h * 0.03) + ')');
    // contact shadow cast by taller neighbours behind
    if (!s.wall) {
      const top = (t.h || 0) + s.levels;
      const nw = gridTile(F, t.x - 1, t.y), nn = gridTile(F, t.x, t.y - 1);
      const dw = nw ? topLevel(F, nw) - top : 0, dn = nn ? topLevel(F, nn) - top : 0;
      if (dw > 0.01 || dn > 0.01) {
        c.save(); c.translate(cx, cy);
        inUV(c, function () {
          if (dw > 0.01) { c.fillStyle = 'rgba(0,0,0,' + Math.min(0.3, 0.12 + dw * 0.06) + ')'; c.fillRect(-0.5, -0.5, 0.2, 1); c.fillRect(-0.5, -0.5, 0.1, 1); }
          if (dn > 0.01) { c.fillStyle = 'rgba(0,0,0,' + Math.min(0.3, 0.12 + dn * 0.06) + ')'; c.fillRect(-0.5, -0.5, 1, 0.2); c.fillRect(-0.5, -0.5, 1, 0.1); }
        });
        c.restore();
      }
    }
    if (s.liquid) drawLiquid(F, c, t, s, cx, cy);
    else if (s.id === 'ice') drawIceGlint(F, c, t, cx, cy);
    if (s.def && typeof s.def.draw === 'function' && !TERRAIN[s.id]) {
      c.save(); c.translate(cx, cy);
      safePaint('terrain:' + s.id, 'terrain draw ' + s.id, s.def.draw, s.def, [Iso.painter(c, { t: time, tile: t, pal: s.def.colors || {} }), t, time]);
      c.restore();
    }
  }

  // Animated liquid layer. Everything stays inside the diamond analytically (no clip: clips are costly).
  function drawLiquid(F, c, t, s, cx, cy) {
    const ph = Iso.rand(t.x, t.y, 5) * TAU;
    if (s.liquid === 'lava') {
      c.beginPath(); diamond(c, cx, cy, HW, HH);
      c.fillStyle = 'rgba(255,220,80,' + (0.08 + 0.12 * pulse(1.6, ph)) + ')';
      c.fill();
      for (let i = 0; i < 2; i++) {
        const k = (time * 0.45 + i * 0.5 + ph / TAU) % 1;
        const bx = cx + Math.sin(ph * 3 + i * 2.1) * 13, by = cy + Math.cos(ph * 2 + i * 1.7) * 5;
        const br = 0.8 + k * 3;
        c.beginPath(); c.ellipse(bx, by - k * 1.5, br, br * 0.6, 0, 0, TAU);
        c.fillStyle = 'rgba(255,240,150,' + (0.85 * (1 - k)) + ')'; c.fill();
      }
      F.lights.push({ x: cx, y: cy, r: 46, color: '#ff6a1a', a: 0.16 + 0.05 * pulse(2.2, ph) });
      return;
    }
    const deep = s.liquid === 'deep';
    c.strokeStyle = deep ? 'rgba(170,210,255,0.18)' : 'rgba(225,245,255,0.32)';
    c.lineWidth = 1;
    c.lineCap = 'round';
    c.beginPath();
    for (let i = 0; i < 3; i++) {
      const k = (time * (deep ? 0.12 : 0.22) + i / 3 + ph / TAU) % 1;
      const y = cy - HH + 4 + k * (HH * 2 - 8);
      const half = (1 - Math.abs(y - cy) / HH) * HW * 0.55;
      const x = cx + Math.sin(time * 0.9 + i * 2 + ph) * 6 * (half / (HW * 0.55));
      c.moveTo(x - half * 0.6, y); c.quadraticCurveTo(x, y - 1.6, x + half * 0.6, y);
    }
    c.stroke();
    const tw = pulse(3.1, ph * 2);
    if (!deep && tw > 0.8) {
      const sx = cx + Math.cos(ph * 5) * 12, sy = cy + Math.sin(ph * 7) * 5;
      c.fillStyle = 'rgba(255,255,255,' + ((tw - 0.8) * 4) + ')';
      c.fillRect(sx - 1.5, sy - 0.3, 3, 0.6); c.fillRect(sx - 0.3, sy - 1.2, 0.6, 2.4);
    }
  }

  /** A glint sweeping across an icy tile; corners sit on the diamond edge so no clip is needed. */
  function drawIceGlint(F, c, t, cx, cy) {
    const k = (time * 0.18 + Iso.rand(t.x, t.y, 6)) % 1.6;
    if (k > 1) return;
    const half = function (x) { return HH * Math.max(0, 1 - Math.abs(x - cx) / HW); };
    const x = cx - HW + 8 + k * (HW * 2 - 16);
    const a = x + 3, b = x - 5, d = x - 9;
    c.beginPath();
    c.moveTo(x, cy - half(x)); c.lineTo(a, cy - half(a)); c.lineTo(b, cy + half(b)); c.lineTo(d, cy + half(d)); c.closePath();
    c.fillStyle = 'rgba(255,255,255,0.28)'; c.fill();
  }

  function drawPitTop(F, c, t, cx, cy) {
    c.save();
    c.beginPath(); diamond(c, cx, cy, HW, HH); c.clip();
    c.fillStyle = '#060405';
    c.fillRect(cx - HW, cy - HH, HW * 2, HH * 2);
    const D = 26;
    const nw = gridTile(F, t.x - 1, t.y), nn = gridTile(F, t.x, t.y - 1);
    const sw = nw && terrainStyle(nw.t, F.theme), sn = nn && terrainStyle(nn.t, F.theme);
    if (sw && !sw.pit) {
      c.beginPath(); c.moveTo(cx - HW, cy); c.lineTo(cx, cy - HH); c.lineTo(cx, cy - HH + D); c.lineTo(cx - HW, cy + D); c.closePath();
      c.fillStyle = shade(sw.right, -0.25); c.fill();
      c.beginPath(); courses(c, cx - HW, cy, cx, cy - HH, D, 8); stroke(c, 'rgba(0,0,0,0.35)', 0.8);
    }
    if (sn && !sn.pit) {
      c.beginPath(); c.moveTo(cx, cy - HH); c.lineTo(cx + HW, cy); c.lineTo(cx + HW, cy + D); c.lineTo(cx, cy - HH + D); c.closePath();
      c.fillStyle = shade(sn.left, -0.1); c.fill();
      c.beginPath(); courses(c, cx, cy - HH, cx + HW, cy, D, 8); stroke(c, 'rgba(0,0,0,0.35)', 0.8);
    }
    const g = c.createLinearGradient(0, cy - HH, 0, cy + HH);
    g.addColorStop(0, 'rgba(4,2,3,0)');
    g.addColorStop(0.55, 'rgba(4,2,3,0.85)');
    g.addColorStop(1, 'rgba(4,2,3,1)');
    c.fillStyle = g;
    c.fillRect(cx - HW, cy - HH, HW * 2, HH * 2);
    // something lives down there (and it is judging you)
    if (Iso.rand(t.x, t.y, 13) < 0.35) {
      const cyc = (time * 0.23 + Iso.rand(t.x, t.y, 14) * 7) % 7;
      if (cyc > 4.6 && cyc < 6.6 && Math.abs(cyc - 5.6) > 0.08) {
        const ex = cx + (Iso.rand(t.x, t.y, 15) - 0.5) * 14, ey = cy + 5;
        c.fillStyle = 'rgba(255,214,90,0.9)';
        c.beginPath(); c.ellipse(ex - 2.6, ey, 1.2, 0.8, 0, 0, TAU); c.ellipse(ex + 2.6, ey, 1.2, 0.8, 0, 0, TAU); c.fill();
      }
    }
    c.restore();
    c.beginPath(); c.moveTo(cx - HW, cy); c.lineTo(cx, cy - HH); c.lineTo(cx + HW, cy);
    stroke(c, 'rgba(0,0,0,0.6)', 1.2);
    c.beginPath(); c.moveTo(cx - HW, cy); c.lineTo(cx, cy + HH); c.lineTo(cx + HW, cy);
    stroke(c, 'rgba(255,255,255,0.1)', 1);
  }

  /** Full block for one tile: faces, top, flat surface layer, overlay + telegraph highlights. */
  function drawTile(F, c, t) {
    const s = terrainStyle(t.t, F.theme);
    const top = (t.h || 0) + s.levels;
    const wp = Iso.toWorld(t.x, t.y, top);
    const cx = wp.x, cy = wp.y;
    const dl = (top - faceBottom(F, t.x, t.y + 1, top)) * STEP;
    const dr = (top - faceBottom(F, t.x + 1, t.y, top)) * STEP;
    if (dl > 0.01) drawFace(F, c, s, t, cx, cy, dl, true);
    if (dr > 0.01) drawFace(F, c, s, t, cx, cy, dr, false);
    if (s.pit) drawPitTop(F, c, t, cx, cy);
    else drawTop(F, c, t, s, cx, cy);
    if (t.surface && !s.wall) drawSurfaceFlat(F, c, t, cx, cy);
    drawTileOverlay(F, c, t, cx, cy, top);
  }

  // ======================================================================================================
  // Surfaces (flat layer clipped to the tile top + optional volume layer drawn with objects)
  // ======================================================================================================
  function uvBlob(c, cx, cy, u, v, r, color) {
    c.save(); c.translate(cx, cy);
    inUV(c, function () { c.beginPath(); c.arc(u, v, r, 0, TAU); c.fillStyle = color; c.fill(); });
    c.restore();
  }
  function flame(c, x, y, w, h, sway, a) {
    const g = c.createLinearGradient(0, y, 0, y - h);
    g.addColorStop(0, 'rgba(255,240,170,' + a + ')');
    g.addColorStop(0.35, 'rgba(255,150,40,' + a * 0.9 + ')');
    g.addColorStop(1, 'rgba(220,40,10,0)');
    c.beginPath();
    c.moveTo(x - w, y);
    c.quadraticCurveTo(x - w * 1.1, y - h * 0.45, x + sway, y - h);
    c.quadraticCurveTo(x + w * 1.1, y - h * 0.45, x + w, y);
    c.quadraticCurveTo(x, y + w * 0.5, x - w, y);
    c.fillStyle = g;
    c.fill();
  }
  function puff(F, c, cx, cy, ph, color, alpha, n, speed, size) {
    for (let i = 0; i < n; i++) {
      const k = (time * speed + i / n + ph) % 1;
      const x = cx + Math.sin(i * 2.3 + ph) * 12 + Math.sin(time * 0.8 + i) * 3;
      const y = cy - 2 - k * 30;
      const r = size * (0.55 + k * 0.9);
      c.beginPath(); c.arc(x, y, r, 0, TAU);
      c.fillStyle = rgba(color, alpha * Math.sin(Math.PI * Math.min(1, k * 1.15)));
      c.fill();
    }
  }

  const SURF = {
    fire: {
      flat: function (F, c, cx, cy) {
        const g = c.createRadialGradient(cx, cy, 2, cx, cy, HW);
        g.addColorStop(0, 'rgba(255,200,70,0.72)');
        g.addColorStop(0.6, 'rgba(255,95,20,0.48)');
        g.addColorStop(1, 'rgba(150,25,8,0.3)');
        c.fillStyle = g; c.fillRect(cx - HW, cy - HH, HW * 2, HH * 2);
      },
      vol: function (F, c, cx, cy, ph, t) {
        const r = Iso.stream(Iso.hash(t.x, t.y, 41));
        c.save();
        c.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 4; i++) {
          const p = P((r() - 0.5) * 0.7, (r() - 0.5) * 0.7);
          const f = 0.72 + 0.28 * Math.sin(time * (8 + i) + ph + i);
          flame(c, cx + p[0], cy + p[1], 3 + r() * 2.2, (9 + r() * 8) * f, Math.sin(time * 4 + i * 1.7 + ph) * 2.2, 0.75);
        }
        for (let i = 0; i < 3; i++) {
          const k = (time * 0.8 + i * 0.33 + ph) % 1;
          c.fillStyle = 'rgba(255,200,90,' + (1 - k) + ')';
          c.fillRect(cx + Math.sin(i * 3 + ph + time * 2) * 9, cy - 4 - k * 28, 1.4, 1.4);
        }
        c.restore();
        F.lights.push({ x: cx, y: cy - 6, r: 58, color: '#ff8a2a', a: 0.26 + 0.07 * pulse(11, ph) });
      },
    },
    poison: {
      flat: function (F, c, cx, cy, ph) {
        uvBlob(c, cx, cy, -0.1, 0.05, 0.3, 'rgba(105,190,55,0.5)');
        uvBlob(c, cx, cy, 0.14, -0.08, 0.24, 'rgba(105,190,55,0.5)');
        uvBlob(c, cx, cy, 0.02, 0.02, 0.16, 'rgba(55,125,25,0.45)');
        for (let i = 0; i < 3; i++) {
          const k = (time * 0.6 + i * 0.37 + ph) % 1;
          const bx = cx + Math.sin(ph * 2 + i * 2.4) * 11, by = cy + Math.cos(ph + i * 1.9) * 5;
          c.beginPath(); c.ellipse(bx, by, 0.6 + k * 2.6, (0.6 + k * 2.6) * 0.7, 0, 0, TAU);
          c.fillStyle = 'rgba(160,240,100,' + 0.35 * (1 - k) + ')'; c.fill();
          c.strokeStyle = 'rgba(210,255,160,' + 0.8 * (1 - k) + ')'; c.lineWidth = 0.6; c.stroke();
        }
        c.beginPath(); c.ellipse(cx - 6, cy - 3, 4, 1, -0.2, 0, TAU); c.fillStyle = 'rgba(230,255,200,0.25)'; c.fill();
      },
      vol: function (F, c, cx, cy, ph) { puff(F, c, cx, cy, ph, '#9be26a', 0.12, 2, 0.18, 6); },
    },
    water: {
      flat: function (F, c, cx, cy, ph) {
        uvBlob(c, cx, cy, -0.06, 0.04, 0.3, 'rgba(90,170,235,0.42)');
        uvBlob(c, cx, cy, 0.14, -0.1, 0.22, 'rgba(90,170,235,0.42)');
        const k = (time * 0.45 + ph) % 1;
        c.beginPath(); c.ellipse(cx, cy, 3 + k * 13, (3 + k * 13) * 0.5, 0, 0, TAU);
        c.strokeStyle = 'rgba(225,245,255,' + 0.45 * (1 - k) + ')'; c.lineWidth = 0.8; c.stroke();
        c.beginPath(); c.ellipse(cx - 5, cy - 3, 5, 1.2, -0.2, 0, TAU); c.fillStyle = 'rgba(255,255,255,0.22)'; c.fill();
      },
    },
    oil: {
      flat: function (F, c, cx, cy, ph) {
        uvBlob(c, cx, cy, -0.05, 0.05, 0.32, 'rgba(22,17,12,0.74)');
        uvBlob(c, cx, cy, 0.16, -0.12, 0.22, 'rgba(22,17,12,0.74)');
        const sh = Math.sin(time * 0.7 + ph) * 10;
        const g = c.createLinearGradient(cx - 18 + sh, cy - 6, cx + 18 + sh, cy + 6);
        g.addColorStop(0, 'rgba(255,60,200,0)'); g.addColorStop(0.3, 'rgba(255,60,200,0.22)');
        g.addColorStop(0.5, 'rgba(60,220,255,0.22)'); g.addColorStop(0.7, 'rgba(255,230,60,0.2)'); g.addColorStop(1, 'rgba(255,230,60,0)');
        c.beginPath(); c.ellipse(cx, cy, 18, 6, -0.25, 0, TAU); c.fillStyle = g; c.fill();
      },
    },
    ice: {
      flat: function (F, c, cx, cy, ph, t) {
        c.beginPath(); diamond(c, cx, cy, HW - 4, HH - 2); c.fillStyle = 'rgba(205,238,255,0.58)'; c.fill();
        const r = Iso.stream(Iso.hash(t.x, t.y, 43));
        c.beginPath();
        for (let i = 0; i < 3; i++) {
          const p = P((r() - 0.5) * 0.7, (r() - 0.5) * 0.7);
          c.moveTo(cx + p[0], cy + p[1]); c.lineTo(cx + p[0] + (r() - 0.5) * 14, cy + p[1] + (r() - 0.5) * 6);
        }
        stroke(c, 'rgba(255,255,255,0.75)', 0.6);
        drawIceGlint(F, c, t, cx, cy);
      },
    },
    blood: {
      flat: function (F, c, cx, cy, ph, t) {
        const r = Iso.stream(Iso.hash(t.x, t.y, 44));
        for (let i = 0; i < 4; i++) uvBlob(c, cx, cy, (r() - 0.5) * 0.5, (r() - 0.5) * 0.5, 0.08 + r() * 0.16, 'rgba(120,6,14,0.82)');
        c.fillStyle = 'rgba(120,6,14,0.85)';
        for (let i = 0; i < 6; i++) { const p = rp(r); c.beginPath(); c.ellipse(cx + p[0], cy + p[1], 1 + r(), 0.6 + r() * 0.5, 0, 0, TAU); c.fill(); }
        c.beginPath(); c.ellipse(cx - 4, cy - 2, 3, 0.9, -0.2, 0, TAU); c.fillStyle = 'rgba(255,190,190,0.25)'; c.fill();
      },
    },
    web: {
      flat: function (F, c, cx, cy, ph, t) {
        const r = Iso.stream(Iso.hash(t.x, t.y, 45));
        const ox = cx + (r() - 0.5) * 8, oy = cy + (r() - 0.5) * 4;
        const spokes = [];
        for (let i = 0; i < 8; i++) { const a = i * TAU / 8 + r() * 0.3; spokes.push([Math.cos(a) * 30, Math.sin(a) * 15]); }
        c.beginPath();
        for (let i = 0; i < 8; i++) { c.moveTo(ox, oy); c.lineTo(ox + spokes[i][0], oy + spokes[i][1]); }
        for (let ring = 1; ring <= 3; ring++) {
          const f = ring * 0.28;
          for (let i = 0; i <= 8; i++) {
            const s = spokes[i % 8], x = ox + s[0] * f, y = oy + s[1] * f;
            if (i === 0) c.moveTo(x, y);
            else { const pr = spokes[(i - 1) % 8]; c.quadraticCurveTo(ox + (pr[0] + s[0]) * f * 0.42, oy + (pr[1] + s[1]) * f * 0.42, x, y); }
          }
        }
        stroke(c, 'rgba(240,240,248,0.62)', 0.55);
        c.beginPath(); c.arc(ox + 3, oy - 1, 1.2, 0, TAU); c.fillStyle = '#1c1418'; c.fill();
      },
    },
    steam: {
      flat: function (F, c, cx, cy) { c.fillStyle = 'rgba(235,240,245,0.22)'; c.fillRect(cx - HW, cy - HH, HW * 2, HH * 2); },
      vol: function (F, c, cx, cy, ph) { puff(F, c, cx, cy, ph, '#f2f6fa', 0.42, 5, 0.32, 8); },
    },
    smoke: {
      flat: function (F, c, cx, cy) { c.fillStyle = 'rgba(55,55,62,0.32)'; c.fillRect(cx - HW, cy - HH, HW * 2, HH * 2); },
      vol: function (F, c, cx, cy, ph) { puff(F, c, cx, cy, ph, '#54545c', 0.5, 5, 0.2, 10); },
    },
    holy: {
      flat: function (F, c, cx, cy, ph) {
        const g = c.createRadialGradient(cx, cy, 1, cx, cy, HW);
        g.addColorStop(0, 'rgba(255,236,160,0.6)'); g.addColorStop(1, 'rgba(255,220,120,0.08)');
        c.fillStyle = g; c.fillRect(cx - HW, cy - HH, HW * 2, HH * 2);
        for (let i = 0; i < 4; i++) {
          const tw = pulse(4 + i, ph + i * 1.3);
          if (tw < 0.6) continue;
          const p = P(Math.sin(ph + i * 2) * 0.35, Math.cos(ph * 1.3 + i) * 0.35);
          c.fillStyle = 'rgba(255,255,230,' + (tw - 0.6) * 2.4 + ')';
          c.fillRect(cx + p[0] - 2, cy + p[1] - 0.3, 4, 0.6); c.fillRect(cx + p[0] - 0.3, cy + p[1] - 2, 0.6, 4);
        }
      },
      vol: function (F, c, cx, cy, ph) {
        c.save(); c.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 3; i++) {
          const x = cx + (i - 1) * 10 + Math.sin(time + i + ph) * 2, hgt = 30 + 8 * pulse(2, i + ph);
          const g = c.createLinearGradient(0, cy, 0, cy - hgt);
          g.addColorStop(0, 'rgba(255,236,170,0.32)'); g.addColorStop(1, 'rgba(255,236,170,0)');
          c.fillStyle = g; c.fillRect(x - 2.2, cy - hgt, 4.4, hgt);
        }
        c.restore();
        F.lights.push({ x: cx, y: cy - 4, r: 44, color: '#ffe08a', a: 0.14 });
      },
    },
    electric: {
      flat: function (F, c, cx, cy, ph, t) {
        c.fillStyle = 'rgba(110,170,255,0.2)'; c.fillRect(cx - HW, cy - HH, HW * 2, HH * 2);
        const r = Iso.stream(Iso.hash(t.x, t.y, Math.floor(time * 12)));
        c.save(); c.globalCompositeOperation = 'lighter';
        c.beginPath();
        for (let i = 0; i < 2; i++) {
          let p = rp(r); c.moveTo(cx + p[0], cy + p[1]);
          for (let k = 0; k < 4; k++) { p = [p[0] + (r() - 0.5) * 16, p[1] + (r() - 0.5) * 8]; c.lineTo(cx + p[0], cy + p[1]); }
        }
        stroke(c, 'rgba(140,200,255,0.9)', 1.4);
        stroke(c, 'rgba(255,255,255,0.95)', 0.5);
        c.restore();
        F.lights.push({ x: cx, y: cy, r: 34, color: '#7ab8ff', a: 0.1 + 0.12 * r() });
      },
    },
    cheeto: {
      flat: function (F, c, cx, cy, ph, t) {
        c.fillStyle = 'rgba(255,150,40,0.16)'; c.fillRect(cx - HW, cy - HH, HW * 2, HH * 2);
        const r = Iso.stream(Iso.hash(t.x, t.y, 46));
        for (let i = 0; i < 26; i++) { const p = rp(r); c.fillStyle = i % 3 ? '#ff9a1f' : '#d9700e'; c.fillRect(cx + p[0], cy + p[1], 1.1, 0.8); }
        c.lineCap = 'round';
        for (let i = 0; i < 3; i++) {
          const p = P((r() - 0.5) * 0.6, (r() - 0.5) * 0.6), x = cx + p[0], y = cy + p[1];
          c.beginPath(); c.moveTo(x - 4, y); c.quadraticCurveTo(x - 1, y - 3 - r() * 2, x + 4, y - 1);
          c.strokeStyle = '#c45f0a'; c.lineWidth = 3.2; c.stroke();
          c.strokeStyle = '#ff9f2a'; c.lineWidth = 2.2; c.stroke();
        }
      },
    },
  };

  function drawSurfaceFlat(F, c, t, cx, cy) {
    const sf = t.surface;
    if (!sf || !sf.id) return;
    const p = SURF[sf.id];
    const ph = Iso.rand(t.x, t.y, 31) * TAU;
    c.save();
    c.beginPath(); diamond(c, cx, cy, HW - 0.5, HH - 0.25); c.clip();
    c.globalAlpha = sf.turns === 1 ? 0.7 : 1;
    if (p) {
      try { p.flat(F, c, cx, cy, ph, t); } catch (e) { renderError('surface ' + sf.id, e); }
    } else {
      const def = DD.getSurface ? DD.getSurface(sf.id) : null;
      let drawn = false;
      if (def && typeof def.draw === 'function') {
        c.translate(cx, cy);
        drawn = safePaint('surface:' + sf.id, 'surface draw ' + sf.id, def.draw, def, [Iso.painter(c, { t: time, tile: t }), sf, time]);
        c.translate(-cx, -cy);
      }
      if (!drawn) {
        const col = (def && def.color) || 'rgba(255,255,255,0.3)';
        c.fillStyle = col; c.fillRect(cx - HW, cy - HH, HW * 2, HH * 2);
        c.globalAlpha *= 0.25 + 0.2 * pulse(2.4, ph);
        c.beginPath(); diamond(c, cx, cy, HW * 0.55, HH * 0.55); c.fillStyle = '#ffffff'; c.fill();
      }
    }
    c.restore();
  }
  /**
   * The unclipped volume layer, drawn with the objects of its diagonal (so units further back are covered by it):
   * flames, steam, smoke, holy light; content surfaces may add `def.drawVolume(g, surface, t)` (origin = tile top
   * center, world px) for clouds that billow above the tile, e.g. Josiah's Plague Miasma.
   */
  function drawSurfaceVolume(F, c, t, cx, cy) {
    const sf = t.surface;
    if (!sf || !sf.id) return;
    const p = SURF[sf.id];
    if (p) {
      if (!p.vol) return;
      c.save();
      c.globalAlpha = sf.turns === 1 ? 0.7 : 1;
      try { p.vol(F, c, cx, cy, Iso.rand(t.x, t.y, 31) * TAU, t); } catch (e) { renderError('surface ' + sf.id, e); }
      c.restore();
      return;
    }
    const def = DD.getSurface ? DD.getSurface(sf.id) : null;
    if (!def || typeof def.drawVolume !== 'function') return;
    c.save();
    c.translate(cx, cy);
    c.globalAlpha = sf.turns === 1 ? 0.7 : 1;
    safePaint('surfaceVol:' + sf.id, 'surface drawVolume ' + sf.id, def.drawVolume, def, [Iso.painter(c, { t: time, tile: t, zoom: F.zoom }), sf, time]);
    c.restore();
  }

  // ======================================================================================================
  // Per-tile overlay highlights (drawn under objects/units so they stay readable)
  // ======================================================================================================
  const hatchCache = new WeakMap();
  /** Moving diagonal hatch: 'now' (red), 'later' (amber) or 'tape' (cream + red danger tape: reads on red floors too). */
  function hatchPattern(c, delayed, kind) {
    let pats = hatchCache.get(c);
    if (!pats) {
      pats = {};
      [['now', 'rgba(255,90,70,0.85)'], ['later', 'rgba(255,190,70,0.75)'], ['tape', 'rgba(255,238,214,0.9)', 'rgba(150,10,10,0.75)']].forEach(function (d) {
        const cv = document.createElement('canvas');
        cv.width = 12; cv.height = 12;
        const k = cv.getContext('2d');
        k.lineWidth = 2.2;
        if (d[2]) {
          k.strokeStyle = d[2]; k.beginPath();
          for (let i = -12; i <= 24; i += 6) { k.moveTo(i + 3, 12); k.lineTo(i + 15, 0); }
          k.stroke();
        }
        k.strokeStyle = d[1];
        k.beginPath();
        for (let i = -12; i <= 24; i += 6) { k.moveTo(i, 12); k.lineTo(i + 12, 0); }
        k.stroke();
        pats[d[0]] = c.createPattern(cv, 'repeat');
      });
      hatchCache.set(c, pats);
    }
    const pat = pats[kind || (delayed ? 'later' : 'now')];
    if (pat && pat.setTransform && typeof DOMMatrix === 'function') {
      try { pat.setTransform(new DOMMatrix([1, 0, 0, 1, (time * 9) % 12, 0])); } catch (e) { /* older engines: static hatch */ }
    }
    return pat;
  }

  function inSet(F, set, x, y, top) {
    if (x < 0 || y < 0 || x >= F.gw || y >= F.gh) return false;
    if (!set[y * F.gw + x]) return false;
    return Math.abs(topLevel(F, F.tiles[y * F.gw + x]) - top) < 0.01;
  }
  /** Fill a tile and stroke only the edges on the region's boundary (merged outline). */
  function regionTile(F, c, t, cx, cy, top, set, fill, line, width) {
    c.beginPath(); diamond(c, cx, cy, HW, HH); c.fillStyle = fill; c.fill();
    const hw = HW - 2.5, hh = HH - 1.25;
    c.beginPath();
    if (!inSet(F, set, t.x, t.y - 1, top)) { c.moveTo(cx, cy - hh); c.lineTo(cx + hw, cy); }
    if (!inSet(F, set, t.x + 1, t.y, top)) { c.moveTo(cx + hw, cy); c.lineTo(cx, cy + hh); }
    if (!inSet(F, set, t.x, t.y + 1, top)) { c.moveTo(cx, cy + hh); c.lineTo(cx - hw, cy); }
    if (!inSet(F, set, t.x - 1, t.y, top)) { c.moveTo(cx - hw, cy); c.lineTo(cx, cy - hh); }
    c.lineCap = 'round';
    stroke(c, line, width || 1.8);
  }

  /** A wind-up tile: red pulsing fill + moving hatch (calmer for one landing in 2+ of its owner's turns). */
  function telegraphFill(F, c, cx, cy, info) {
    const a = info.a;
    const later = info.delayed && !info.now;
    c.beginPath(); diamond(c, cx, cy, HW, HH);
    const p = later ? 0.75 + 0.25 * pulse(3) : 0.62 + 0.38 * pulse(5.5);
    c.fillStyle = 'rgba(255,38,28,' + Math.min(0.6, ((later ? 0.2 : 0.3) + 0.09 * Math.min(2, info.n - 1)) * p) * a + ')';
    c.fill();
    const pat = hatchPattern(c, false, 'tape');
    if (pat) {
      c.save(); c.globalAlpha = a * (later ? 0.32 : 0.42 + 0.2 * pulse(5.5)); c.fillStyle = pat; c.fill(); c.restore();
    }
  }

  /** Threat shading (v2, hold Alt): orange-red by the damage enemies could deal there before the hero's next turn;
   *  tiles where it would drop the hero get the red hatch. */
  function threatFill(F, c, t, cx, cy, top, i) {
    const ov = F.ov;
    const k = clamp(ov.threatD[i] / ov.threatRef, 0, 1);
    regionTile(F, c, t, cx, cy, top, ov.threatSet, 'rgba(255,96,36,' + (0.13 + 0.3 * k) + ')', 'rgba(255,176,104,0.92)', 1.7);
    if (ov.threatL[i]) {
      c.beginPath(); diamond(c, cx, cy, HW, HH);
      c.fillStyle = 'rgba(150,0,20,0.22)'; c.fill();
      const pat = hatchPattern(c, false);
      if (pat) { c.save(); c.globalAlpha = 0.45; c.fillStyle = pat; c.fill(); c.restore(); }
    }
  }

  function drawTileOverlay(F, c, t, cx, cy, top) {
    const ov = F.ov;
    if (!ov) return;
    const i = t.y * F.gw + t.x;
    if (ov.deploy[i]) regionTile(F, c, t, cx, cy, top, ov.deploy, 'rgba(80,220,120,' + (0.18 + 0.07 * pulse(2.5)) + ')', 'rgba(150,255,170,0.9)');
    if (ov.move[i]) regionTile(F, c, t, cx, cy, top, ov.move, 'rgba(60,140,255,0.27)', 'rgba(150,205,255,0.95)');
    if (ov.threatSet && ov.threatSet[i]) threatFill(F, c, t, cx, cy, top, i);
    if (ov.reach && ov.reach[i]) regionTile(F, c, t, cx, cy, top, ov.reach, 'rgba(255,70,60,' + (0.08 + 0.05 * pulse(3)) + ')', 'rgba(255,128,112,0.9)', 1.5);
    if (ov.interact[i]) {
      regionTile(F, c, t, cx, cy, top, ov.interact, 'rgba(255,215,60,' + (0.16 + 0.12 * pulse(4)) + ')', 'rgba(255,225,110,0.95)', 1.6);
    }
    if (F.tele && F.tele[i]) telegraphFill(F, c, cx, cy, F.tele[i]);
    if (ov.target[i]) {
      c.beginPath(); diamond(c, cx, cy, HW, HH); c.fillStyle = 'rgba(255,245,200,0.1)'; c.fill();
      c.beginPath(); diamond(c, cx, cy, HW - 4, HH - 2);
      stroke(c, 'rgba(255,226,120,' + (0.55 + 0.4 * pulse(5)) + ')', 1.6);
    }
    if (ov.area[i]) regionTile(F, c, t, cx, cy, top, ov.area, 'rgba(255,135,30,0.42)', 'rgba(255,196,96,1)', 2);
  }

  // ======================================================================================================
  // Objects. Painters draw in world px with the origin at the tile top center (+y down), using the
  // painter helper g (DD.Iso.painter). E = { F, cx, cy, tile } gives world coords for lights/occluders.
  // ======================================================================================================
  const OUT = '#1a1014';
  const OBJ_H = {
    crate: 24, barrel: 26, barrel_explosive: 28, keg: 22, pillar: 64, rock: 20, tree: 78, dead_tree: 66,
    bush: 18, mushroom: 18, gravestone: 26, coffin: 12, statue: 58, lever: 22, pressure_plate: 3, chest: 20,
    fountain: 28, brazier: 34, spikes: 10, totem: 54, bookshelf: 56, candles: 20, mirror: 44, d20: 36,
    soda_can: 48, pencil: 10, gold_pile: 16, bones: 6, fence: 22, pipe: 36, valve: 22,
  };
  const OBJ_W = { tree: 26, dead_tree: 22, fountain: 22, bookshelf: 21, statue: 17, pillar: 16 };

  function light(E, dx, dy, r, color, a) {
    const k = E.k || 1;
    E.F.lights.push({ x: E.cx + dx * k, y: E.cy + dy * k, r: r * k, color: color, a: a });
  }
  function shadowBlob(g, rx, ry, a) { g.ellipse(0, 1.5, rx, ry, 'rgba(0,0,0,' + (a || 0.3) + ')'); }
  function objFlag(obj, names) {
    const d = obj.data || {};
    for (let i = 0; i < names.length; i++) if (d[names[i]] !== undefined) return !!d[names[i]];
    for (let i = 0; i < names.length; i++) if (obj[names[i]] !== undefined) return !!obj[names[i]];
    return false;
  }
  function themeIs(E, ids) { return ids.indexOf(E.F.theme) >= 0; }
  function stoneFor(E) {
    if (themeIs(E, ['hoard'])) return { top: '#ece6dc', left: '#cfc7bb', right: '#b1a99d' };
    if (themeIs(E, ['academy'])) return { top: '#8d86a3', left: '#6f6987', right: '#5a556e' };
    if (themeIs(E, ['hellscape'])) return { top: '#4a383c', left: '#382a2e', right: '#2b2023' };
    return { top: '#9a968f', left: '#7b7771', right: '#64605b' };
  }
  function hoops(g, rx, ry, ys, color) {
    const c = g.ctx;
    for (let i = 0; i < ys.length; i++) {
      c.beginPath(); c.ellipse(0, ys[i], rx + 0.4, ry + 0.2, 0, 0, Math.PI);
      c.strokeStyle = color; c.lineWidth = 2; c.stroke();
    }
  }
  function staves(g, rx, ry, h) {
    const c = g.ctx;
    c.beginPath();
    for (let i = -2; i <= 2; i++) {
      const x = i * rx * 0.4, yb = ry * Math.sqrt(Math.max(0, 1 - (x * x) / (rx * rx)));
      c.moveTo(x, yb - h + ry * 0.2); c.lineTo(x, yb);
    }
    c.strokeStyle = 'rgba(40,22,10,0.35)'; c.lineWidth = 0.7; c.stroke();
  }
  function skull(g, x, y, s, bone) {
    g.circle(x, y, 3.6 * s, bone || '#f1ead8', OUT);
    g.rect(x - 2 * s, y + 2 * s, 4 * s, 2.4 * s, bone || '#f1ead8', OUT, 0.8);
    g.circle(x - 1.4 * s, y - 0.2 * s, 1 * s, OUT);
    g.circle(x + 1.4 * s, y - 0.2 * s, 1 * s, OUT);
  }

  const OBJ = {
    crate: function (g) {
      shadowBlob(g, 21, 10);
      g.box(0, 0, 18, 9, 22, { top: '#c08f52', left: '#a0713a', right: '#83592b' }, OUT);
      const c = g.ctx;
      c.beginPath();
      [7.3, 14.6].forEach(function (k) { c.moveTo(-18, -k); c.lineTo(0, 9 - k); c.lineTo(18, -k); });
      c.strokeStyle = 'rgba(60,35,15,0.55)'; c.lineWidth = 0.8; c.stroke();
      c.beginPath();
      c.moveTo(-17, -20.5); c.lineTo(-1, 7.5); c.moveTo(-17, -1); c.lineTo(-1, -12);
      c.moveTo(1, -12); c.lineTo(17, -1); c.moveTo(1, 7.5); c.lineTo(17, -20.5);
      c.strokeStyle = '#6b4520'; c.lineWidth = 2.6; c.stroke();
      c.strokeStyle = 'rgba(255,220,170,0.25)'; c.lineWidth = 0.7; c.stroke();
      c.beginPath(); c.moveTo(-9, -26.5); c.lineTo(9, -17.5); c.moveTo(-18, -22); c.lineTo(0, -13); c.lineTo(18, -22);
      c.strokeStyle = 'rgba(70,40,15,0.45)'; c.lineWidth = 0.8; c.stroke();
    },
    barrel: function (g) {
      shadowBlob(g, 15, 7.5);
      g.cylinder(0, 0, 12, 6, 25, '#a06d3b', '#7d522a', OUT);
      staves(g, 12, 6, 25);
      hoops(g, 12, 6, [-5, -19], '#3f3d42');
      g.ellipse(0, -25, 8.5, 4.2, null, 'rgba(60,35,15,0.7)');
    },
    barrel_explosive: function (g, obj, t, E) {
      shadowBlob(g, 15, 7.5);
      g.cylinder(0, 0, 12, 6, 25, '#b9342b', '#8e2219', OUT);
      const c = g.ctx;
      c.save();
      c.beginPath(); c.rect(-12.5, -16, 25, 7); c.clip();
      c.fillStyle = '#f2c230'; c.fillRect(-13, -17, 26, 9);
      c.fillStyle = '#1d1416';
      for (let x = -14; x < 14; x += 5) { c.beginPath(); c.moveTo(x, -9); c.lineTo(x + 3, -9); c.lineTo(x + 6, -16); c.lineTo(x + 3, -16); c.closePath(); c.fill(); }
      c.restore();
      hoops(g, 12, 6, [-4, -21], '#3a2a2a');
      skull(g, -4, -12.5, 0.85);
      g.ellipse(0, -25, 8.5, 4.2, null, 'rgba(60,15,10,0.7)');
      g.line(3, -26, 6, -32, '#3a2a20', 1.4);
      const f = pulse(16);
      g.glow(6, -32.5, 5 + 2 * f, '#ffb040', 0.9);
      g.circle(6, -32.5, 1.2, '#fff6c0');
      light(E, 6, -32, 22, '#ff9a3a', 0.08 + 0.05 * f);
    },
    keg: function (g) {
      shadowBlob(g, 14, 7);
      g.cylinder(0, 0, 11, 5.5, 20, '#b8823f', '#8c5e2b', OUT);
      staves(g, 11, 5.5, 20);
      hoops(g, 11, 5.5, [-3, -16], '#c9a03a');
      g.ellipse(0, -20, 7.5, 3.6, null, 'rgba(80,50,20,0.6)');
      g.circle(3, -20.4, 1.4, '#6a4523', OUT);
      g.text('ALE', 4, -10, 4.4, 'rgba(60,30,10,0.8)');
      // brass spigot: round mount, spout bending down, little black handle
      g.line(-6, -10.5, -6, -14.5, OUT, 2.4); g.line(-6, -10.5, -6, -14.5, '#2a1a10', 1.2);
      g.circle(-6, -9, 2.3, '#d9b44a', OUT);
      g.line(-6.5, -9, -10.5, -8, OUT, 2.8); g.line(-6.5, -9, -10.5, -8, '#e3c35a', 1.5);
      g.line(-10.5, -8, -10.8, -5.6, OUT, 2.6); g.line(-10.5, -8, -10.8, -5.6, '#e3c35a', 1.3);
      const k = (time * 0.6) % 1;
      g.ellipse(-10.8, -4.6 + k * 4.5, 0.9, 1.2, 'rgba(255,238,190,' + (1 - k) + ')');
    },
    pillar: function (g, obj, t, E) {
      const st = stoneFor(E);
      shadowBlob(g, 19, 9.5);
      g.box(0, 0, 16, 8, 6, st, OUT);
      g.cylinder(0, -6, 10, 5, 50, st.left, st.top, OUT);
      const c = g.ctx;
      c.beginPath();
      [-6, -2, 2, 6].forEach(function (x) { const yb = -6 + 5 * Math.sqrt(1 - (x * x) / 100); c.moveTo(x, yb - 48); c.lineTo(x, yb - 1); });
      c.strokeStyle = 'rgba(0,0,0,0.18)'; c.lineWidth = 0.8; c.stroke();
      g.box(0, -56, 15, 7.5, 6, st, OUT);
      if (themeIs(E, ['hauntwood', 'graveyard', 'warren'])) {
        c.beginPath(); c.moveTo(-3, -30); c.lineTo(0, -24); c.lineTo(-2, -18); c.lineTo(1, -12);
        c.strokeStyle = 'rgba(30,25,25,0.6)'; c.lineWidth = 0.8; c.stroke();
        g.ellipse(-7, -3, 5, 2.5, 'rgba(80,120,60,0.8)');
      }
    },
    rock: function (g, obj, t, E) {
      shadowBlob(g, 17, 8);
      const base = themeIs(E, ['hellscape']) ? '#4a3b3a' : themeIs(E, ['warren', 'sewer']) ? '#6f665c' : '#837d74';
      g.poly([[-15, 1], [-14, -8], [-7, -16], [4, -18], [13, -11], [15, -2], [8, 5], [-7, 5]], base, OUT);
      g.poly([[-14, -8], [-7, -16], [4, -18], [13, -11], [3, -9], [-6, -7]], shade(base, 0.18));
      g.poly([[13, -11], [15, -2], [8, 5], [3, -9]], shade(base, -0.22));
      g.line(-6, -7, 3, -9, 'rgba(0,0,0,0.25)', 0.8);
      if (themeIs(E, ['hauntwood', 'graveyard', 'warren', 'title'])) g.ellipse(-4, -14, 6, 2.5, 'rgba(90,140,70,0.85)');
      if (themeIs(E, ['hellscape'])) { g.line(-8, -4, -2, -1, '#ff6a1a', 1); g.line(-2, -1, 2, 3, '#ff6a1a', 0.8); }
    },
    tree: function (g, obj, t, E) {
      shadowBlob(g, 24, 11, 0.32);
      const dark = themeIs(E, ['hauntwood', 'graveyard']);
      const leaf = dark ? '#2f5a3c' : '#3f8a3e';
      const sway = Math.sin(time * 0.8 + Iso.rand(t.x, t.y, 21) * TAU) * 1.3;
      g.poly([[-5, 1], [5, 1], [3, -26], [2.5, -34], [-2.5, -34], [-3, -26]], '#6b4a2b', OUT);
      g.poly([[1, 1], [5, 1], [3, -26], [2.5, -34], [0.5, -34]], 'rgba(0,0,0,0.22)');
      g.line(-5, 1, -9, 3, '#5a3d22', 2); g.line(5, 1, 9, 3.5, '#5a3d22', 2);
      const blobs2 = [[-11 + sway * 0.6, -38, 12], [11 + sway * 0.6, -39, 12], [0 + sway, -47, 16], [2 + sway * 1.2, -60, 11]];
      blobs2.forEach(function (b) { g.circle(b[0] + 1.5, b[1] + 2, b[2], shade(leaf, -0.35), OUT); });
      blobs2.forEach(function (b) { g.circle(b[0], b[1], b[2], leaf); });
      blobs2.forEach(function (b) { g.circle(b[0] - b[2] * 0.3, b[1] - b[2] * 0.35, b[2] * 0.45, rgba(shade(leaf, 0.25), 0.8)); });
      if (!dark && Iso.rand(t.x, t.y, 22) < 0.5) { g.circle(-6 + sway, -44, 1.8, '#e0473a'); g.circle(7 + sway, -52, 1.8, '#e0473a'); }
    },
    dead_tree: function (g, obj, t) {
      shadowBlob(g, 18, 8);
      const bark = '#5d4c40';
      g.poly([[-6, 1], [6, 1], [3, -18], [4, -34], [1, -46], [-2, -44], [-3, -30], [-4, -16]], bark, OUT);
      const c = g.ctx;
      c.lineCap = 'round';
      [[[0, -30], [-14, -42], 3], [[-14, -42], [-20, -40], 1.6], [[-14, -42], [-16, -52], 1.4], [[1, -38], [13, -50], 2.6],
        [[13, -50], [20, -49], 1.4], [[13, -50], [12, -60], 1.2], [[2, -44], [4, -58], 1.8]].forEach(function (b) {
        c.beginPath(); c.moveTo(b[0][0], b[0][1]); c.lineTo(b[1][0], b[1][1]);
        c.strokeStyle = OUT; c.lineWidth = b[2] + 1.6; c.stroke();
        c.strokeStyle = bark; c.lineWidth = b[2]; c.stroke();
      });
      g.ellipse(-0.5, -22, 2.2, 3.4, '#1a120e');
      if (Iso.rand(t.x, t.y, 23) < 0.4) { g.circle(-1.6, -22.5, 0.7, '#ffd65a'); g.circle(0.6, -22.5, 0.7, '#ffd65a'); }
    },
    bush: function (g, obj, t, E) {
      shadowBlob(g, 16, 7);
      const leaf = themeIs(E, ['hauntwood', 'graveyard']) ? '#355e38' : '#3f7d38';
      const parts = [[-7, -6, 7.5], [7, -6, 7.5], [0, -11, 8.5]];
      parts.forEach(function (b) { g.circle(b[0] + 1, b[1] + 1.5, b[2], shade(leaf, -0.35), OUT); });
      parts.forEach(function (b) { g.circle(b[0], b[1], b[2], leaf); });
      parts.forEach(function (b) { g.circle(b[0] - 2.5, b[1] - 3, b[2] * 0.4, rgba(shade(leaf, 0.3), 0.8)); });
      if (Iso.rand(t.x, t.y, 24) < 0.6) [[-6, -9], [4, -12], [8, -5]].forEach(function (p) { g.circle(p[0], p[1], 1.4, '#c43a52'); });
    },
    mushroom: function (g, obj, t, E) {
      shadowBlob(g, 14, 6);
      const glowy = themeIs(E, ['warren', 'hauntwood', 'sewer']);
      const cap = glowy ? '#9a6ae0' : '#c0392b';
      [[-7, 2, 0.75], [6, 1, 0.65], [0, -1, 1]].sort(function (a, b) { return a[1] - b[1]; }).forEach(function (m) {
        const s = m[2], x = m[0], y = m[1];
        g.rect(x - 2.2 * s, y - 11 * s, 4.4 * s, 11 * s, '#efe4cf', OUT, 1.5 * s);
        g.ctx.beginPath(); g.ctx.ellipse(x, y - 11 * s, 9 * s, 6.5 * s, 0, Math.PI, 0); g.ctx.closePath();
        g.ctx.fillStyle = cap; g.ctx.fill(); g.ctx.strokeStyle = OUT; g.ctx.lineWidth = 1.2; g.ctx.stroke();
        g.ellipse(x, y - 11 * s, 9 * s, 1.6 * s, shade(cap, -0.3));
        g.circle(x - 3.5 * s, y - 14 * s, 1.3 * s, '#fff4e6'); g.circle(x + 2.5 * s, y - 15.5 * s, 1.1 * s, '#fff4e6'); g.circle(x + 0.5 * s, y - 12.5 * s, 0.9 * s, '#fff4e6');
      });
      if (glowy) light(E, 0, -10, 26, '#b48cff', 0.1 + 0.05 * pulse(1.7, t.x));
    },
    gravestone: function (g, obj, t) {
      const c = g.ctx;
      shadowBlob(g, 15, 7);
      g.ellipse(0, 3, 14, 6, '#4a3a2c');
      g.ellipse(0, 2, 11, 4.6, '#5a4634');
      c.save();
      c.rotate((Iso.rand(t.x, t.y, 25) - 0.5) * 0.16);
      const stoneC = '#8f9096';
      c.beginPath(); c.moveTo(-6, 4); c.lineTo(-6, -15); c.arc(3, -15, 9, Math.PI, 0); c.lineTo(12, -3); c.closePath();
      c.fillStyle = shade(stoneC, -0.3); c.fill(); c.strokeStyle = OUT; c.lineWidth = 1.2; c.stroke();
      c.beginPath(); c.moveTo(-9, 3); c.lineTo(-9, -16); c.arc(0, -16, 9, Math.PI, 0); c.lineTo(9, 3); c.closePath();
      c.fillStyle = stoneC; c.fill(); c.stroke();
      const v = Iso.hash(t.x, t.y, 26) % 3;
      if (v === 0) g.text('RIP', 0, -14, 6, 'rgba(40,40,48,0.75)');
      else if (v === 1) g.text('BRB', 0, -14, 5.5, 'rgba(40,40,48,0.75)');
      else { g.line(0, -21, 0, -8, 'rgba(40,40,48,0.7)', 1.4); g.line(-4, -17, 4, -17, 'rgba(40,40,48,0.7)', 1.4); }
      g.line(-6, -6, 6, -6, 'rgba(40,40,48,0.35)', 0.8);
      g.ellipse(-6, 1, 4, 2, 'rgba(90,130,70,0.8)');
      c.restore();
    },
    coffin: function (g) {
      shadowBlob(g, 22, 9);
      const shape = [[-0.42, -0.07], [-0.25, -0.17], [0.42, -0.1], [0.42, 0.1], [-0.25, 0.17], [-0.42, 0.07]].map(function (q) { return P(q[0], q[1]); });
      for (let k = 0; k <= 9; k++) {
        g.poly(shape.map(function (p) { return [p[0], p[1] - k]; }), k === 9 ? '#6e4426' : '#4c2d17', k === 0 || k === 9 ? OUT : null);
      }
      const a = P(-0.12, 0), b = P(0.28, 0), m1 = P(0, -0.08), m2 = P(0, 0.08);
      g.line(a[0], a[1] - 9.5, b[0], b[1] - 9.5, '#d9b45a', 1.8);
      g.line(m1[0], m1[1] - 9.5, m2[0], m2[1] - 9.5, '#d9b45a', 1.8);
    },
    statue: function (g, obj, t, E) {
      const st = stoneFor(E);
      shadowBlob(g, 18, 9);
      g.box(0, 0, 15, 7.5, 14, st, OUT);
      g.text('NPC', -7.5, -6, 4.5, 'rgba(40,36,34,0.6)');
      const c = g.ctx, y0 = -14, body = st.top, dark = st.left;
      g.rect(-5, y0 - 13, 4, 13, dark, OUT, 1.5);
      g.rect(1, y0 - 13, 4, 13, dark, OUT, 1.5);
      g.rect(-7, y0 - 27, 14, 15, body, OUT, 4);
      g.line(-6, y0 - 24, -12, y0 - 16, OUT, 4.2); g.line(-6, y0 - 24, -12, y0 - 16, body, 2.6);
      g.line(6, y0 - 24, 11, y0 - 34, OUT, 4.2); g.line(6, y0 - 24, 11, y0 - 34, body, 2.6);
      g.line(11, y0 - 34, 12, y0 - 46, OUT, 2.4); g.line(11, y0 - 34, 12, y0 - 46, shade(body, 0.2), 1.2);
      g.circle(0, y0 - 32, 6, body, OUT);
      g.circle(-2, y0 - 33, 0.8, OUT); g.circle(2, y0 - 33, 0.8, OUT);
      c.beginPath(); c.arc(0, y0 - 31, 2.2, 0.2, Math.PI - 0.2); c.strokeStyle = OUT; c.lineWidth = 0.8; c.stroke();
    },
    lever: function (g, obj) {
      const on = objFlag(obj, ['on', 'pulled', 'active', 'flipped']);
      shadowBlob(g, 12, 6);
      g.box(0, 0, 10, 5, 5, { top: '#6d6f75', left: '#55575c', right: '#45474b' }, OUT);
      g.ellipse(0, -5, 5, 1.6, '#2a2a2e');
      const a = on ? 0.62 : -0.62;
      const ex = Math.sin(a) * 17, ey = -5 - Math.cos(a) * 17;
      g.line(0, -5, ex, ey, OUT, 3.4);
      g.line(0, -5, ex, ey, '#a8aab0', 2);
      g.circle(ex, ey, 3.2, on ? '#43c463' : '#d8443a', OUT);
      g.circle(ex - 1, ey - 1, 1, 'rgba(255,255,255,0.6)');
      g.circle(-6, -2.5, 1.4, on ? '#7dff9a' : '#ff6a5a');
      if (on) g.glow(-6, -2.5, 5, '#7dff9a', 0.5);
    },
  };

  function gs(dx, dy) { return [(dx - dy) * HW, (dx + dy) * HH]; }

  /** Mirror orientation from obj.data.facing / obj.facing: {x,y} | 'N'..'NW' | '/' '\' | 0-3 (diagonal quarter turns) | degrees. */
  function mirrorFacing(obj) {
    const f = obj.data && obj.data.facing !== undefined ? obj.data.facing : obj.facing;
    let v = null;
    if (f && typeof f === 'object') v = [+f.x || 0, +f.y || 0];
    else if (typeof f === 'string') {
      const m = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0], NE: [1, -1], SE: [1, 1], SW: [-1, 1], NW: [-1, -1], '/': [1, 1], '\\': [1, -1] };
      v = m[f.toUpperCase()] || m[f] || null;
    } else if (typeof f === 'number' && isFinite(f)) {
      const deg = Number.isInteger(f) && f >= 0 && f <= 3 ? 45 + f * 90 : f;
      const rad = deg * Math.PI / 180;
      v = [Math.sin(rad), -Math.cos(rad)];
    }
    if (!v || (!v[0] && !v[1])) v = [1, 1];
    const L = Math.hypot(v[0], v[1]);
    return { x: v[0] / L, y: v[1] / L };
  }

  Object.assign(OBJ, {
    pressure_plate: function (g, obj, t, E) {
      const F = E.F;
      const pressed = objFlag(obj, ['pressed', 'active', 'on']) || !!(F.unitOn && F.unitOn[t.y * F.gw + t.x]);
      const h = pressed ? 1 : 3;
      g.box(0, 0, 17, 8.5, h, { top: '#9a9286', left: '#79726a', right: '#655f58' }, OUT);
      g.diamond(0, -h, 11, 5.5, pressed ? '#8a8276' : '#a59d91', 'rgba(0,0,0,0.35)');
      g.ctx.save();
      g.ctx.globalAlpha = pressed ? 0.95 : 0.45 + 0.2 * pulse(2, t.x + t.y);
      g.circle(0, -h, 2.6, null, pressed ? '#ffe27a' : '#c9b98a');
      g.line(-5, -h, 5, -h, pressed ? '#ffe27a' : '#c9b98a', 0.9);
      g.ctx.restore();
      if (pressed) g.glow(0, -h, 16, '#ffd65a', 0.35);
    },
    chest: function (g, obj, t, E) {
      const open = objFlag(obj, ['open', 'opened', 'looted', 'used']);
      shadowBlob(g, 17, 8.5);
      const wood = { top: '#9a6232', left: '#84522a', right: '#6a4120' };
      g.box(0, 0, 14, 7, 11, wood, OUT);
      const c = g.ctx;
      c.beginPath(); c.moveTo(-14, -4); c.lineTo(0, 3); c.lineTo(14, -4);
      c.moveTo(-7, -7.5); c.lineTo(-7, 3.5 - 7); c.moveTo(7, -7.5); c.lineTo(7, 3.5 - 7);
      c.strokeStyle = '#d9a83a'; c.lineWidth = 1.6; c.stroke();
      if (open) {
        g.diamond(0, -11, 12, 6, '#2a1a10');
        c.save(); c.beginPath(); diamond(c, 0, -11, 12, 6); c.clip();
        [[-4, -11], [3, -12], [0, -9], [5, -10], [-2, -13]].forEach(function (p) { g.ellipse(p[0], p[1], 3, 1.5, '#f0c040', 'rgba(120,80,10,0.8)'); });
        c.restore();
        g.poly([[-14, -11], [0, -18], [0, -32], [-14, -25]], '#7a4a24', OUT);
        g.poly([[0, -18], [14, -11], [14, -25], [0, -32]], '#5e3a1c', OUT);
        g.line(-14, -18, 0, -25, '#d9a83a', 1.4); g.line(0, -25, 14, -18, '#d9a83a', 1.4);
        g.glow(0, -14, 20, '#ffd65a', 0.4 + 0.1 * pulse(3));
        light(E, 0, -14, 34, '#ffd65a', 0.1);
      } else {
        g.box(0, -11, 15, 7.5, 6, { top: '#b07238', left: '#8e5a2c', right: '#734622' }, OUT);
        g.line(-15, -14, 0, -6.5, '#d9a83a', 1.6); g.line(0, -6.5, 15, -14, '#d9a83a', 1.6);
        g.rect(-9.5, -9.5, 5, 5.5, '#e8b84a', OUT, 1);
        g.circle(-7, -7.5, 0.9, OUT);
        const tw = pulse(2.2, t.x * 3 + t.y);
        if (tw > 0.85) { g.ctx.fillStyle = 'rgba(255,255,220,' + (tw - 0.85) * 6 + ')'; g.ctx.fillRect(8, -19, 4, 0.8); g.ctx.fillRect(9.6, -21, 0.8, 4); }
      }
    },
    fountain: function (g, obj, t, E) {
      const st = stoneFor(E);
      const dry = objFlag(obj, ['used', 'empty', 'dry']);
      shadowBlob(g, 23, 11);
      g.cylinder(0, 0, 21, 10.5, 10, st.left, st.top, OUT);
      g.ellipse(0, -10, 17, 8.5, dry ? '#3c3a3a' : '#2f7fae');
      const c = g.ctx;
      if (dry) {
        g.ellipse(-4, -9, 6, 2.4, 'rgba(90,110,120,0.6)');
        g.text('OUT OF ORDER', 0, -2.5, 3.4, 'rgba(30,24,20,0.8)');
      } else {
        c.save(); c.beginPath(); c.ellipse(0, -10, 17, 8.5, 0, 0, TAU); c.clip();
        for (let i = 0; i < 2; i++) {
          const k = (time * 0.5 + i * 0.5) % 1;
          c.beginPath(); c.ellipse(0, -10, 4 + k * 13, (4 + k * 13) * 0.5, 0, 0, TAU);
          c.strokeStyle = 'rgba(220,245,255,' + 0.5 * (1 - k) + ')'; c.lineWidth = 0.8; c.stroke();
        }
        c.restore();
      }
      g.cylinder(0, -10, 3, 1.5, 16, st.left, st.top, OUT);
      g.ellipse(0, -26, 7, 3.2, st.top, OUT);
      g.ellipse(0, -26, 5, 2.2, dry ? '#3c3a3a' : '#5fb4e0');
      if (dry) return;
      for (let i = 0; i < 8; i++) {
        const k = (time * 1.1 + i / 8) % 1, a = (i % 4) * Math.PI / 2 + 0.6;
        const x = Math.cos(a) * (3 + k * 11), y = -27 + Math.sin(a) * (1.5 + k * 5) - Math.sin(k * Math.PI) * 6 + k * 15;
        g.circle(x, y, 0.9, 'rgba(190,235,255,' + (1 - k * 0.6) + ')');
      }
      light(E, 0, -12, 30, '#6ac0ff', 0.06);
    },
    brazier: function (g, obj, t, E) {
      const lit = !objFlag(obj, ['out', 'extinguished', 'unlit']) && !(obj.data && obj.data.lit === false);
      shadowBlob(g, 13, 6.5);
      const c = g.ctx;
      g.line(-8, 2, -5, -15, OUT, 2.6); g.line(8, 2, 5, -15, OUT, 2.6); g.line(0, 5, 0, -14, OUT, 2.6);
      g.line(-8, 2, -5, -15, '#5a5458', 1.4); g.line(8, 2, 5, -15, '#5a5458', 1.4); g.line(0, 5, 0, -14, '#5a5458', 1.4);
      c.beginPath(); c.ellipse(0, -18, 12, 5.5, 0, 0, Math.PI); c.lineTo(-12, -18); c.closePath();
      c.fillStyle = '#4a4448'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 1.2; c.stroke();
      g.ellipse(0, -18, 12, 5.5, '#2a2224', OUT);
      [[-4, -18], [3, -19], [0, -17], [6, -17.5], [-7, -17.5]].forEach(function (p) { g.circle(p[0], p[1], 2.2, lit ? '#ff6a2a' : '#3a2a28'); });
      if (lit) {
        c.save(); c.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 3; i++) {
          const f = 0.75 + 0.25 * Math.sin(time * (9 + i * 2) + i * 2.1);
          flame(c, (i - 1) * 4.5, -18, 4.2, (14 + i * 3) * f, Math.sin(time * 5 + i) * 2.5, 0.85);
        }
        for (let i = 0; i < 4; i++) {
          const k = (time * 0.9 + i * 0.25) % 1;
          c.fillStyle = 'rgba(255,200,90,' + (1 - k) + ')';
          c.fillRect(Math.sin(i * 2.7 + time * 2) * 6, -26 - k * 30, 1.4, 1.4);
        }
        c.restore();
        light(E, 0, -24, 96, '#ff9a3a', 0.28 + 0.06 * pulse(13));
      } else {
        g.circle(0, -26 - (time * 8) % 8, 3, 'rgba(120,120,125,0.35)');
      }
    },
    spikes: function (g, obj, t) {
      const down = objFlag(obj, ['retracted', 'down', 'disarmed']) || (obj.data && obj.data.active === false);
      g.diamond(0, 0, 17, 8.5, '#4a464c', OUT);
      g.diamond(0, -0.5, 14, 7, '#3a363c');
      const pts = [];
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) pts.push(P(i * 0.25, j * 0.25));
      pts.sort(function (a, b) { return a[1] - b[1]; });
      pts.forEach(function (p, i) {
        g.ellipse(p[0], p[1], 2.2, 1.1, '#151215');
        if (down) return;
        const h = 9 + (i % 3);
        g.poly([[p[0] - 2.2, p[1]], [p[0], p[1] - h], [p[0] + 2.2, p[1]]], '#a9adb5', OUT);
        g.poly([[p[0], p[1] - h], [p[0] + 2.2, p[1]], [p[0] + 0.3, p[1] + 0.2]], '#7d8189');
        if (i === 4) g.circle(p[0], p[1] - h + 1.6, 0.9, '#b0182a');
      });
    },
    totem: function (g, obj, t, E) {
      shadowBlob(g, 15, 7.5);
      const blocks = [[0, 14, 7, 15, '#7a4a2a'], [-15, 12.5, 6.25, 14, '#3f8a7a'], [-29, 11, 5.5, 13, '#a83a3a']];
      const glowA = 0.55 + 0.45 * pulse(3, t.x);
      blocks.forEach(function (b) {
        const y = b[0], col = b[4];
        g.box(0, y, b[1], b[2], b[3], { top: shade(col, 0.15), left: col, right: shade(col, -0.25) }, OUT);
        const fy = y - b[3] * 0.55;
        g.rect(-b[1] * 0.78, fy - 2.4 - b[1] * 0.1, 3, 2, 'rgba(210,150,255,' + glowA + ')');
        g.rect(-b[1] * 0.38, fy - 0.6, 3, 2, 'rgba(210,150,255,' + glowA + ')');
        g.line(-b[1] * 0.8, fy + 3.5, -b[1] * 0.25, fy + 6, OUT, 1.2);
      });
      g.poly([[-6, -42], [-11, -52], [-3, -45]], '#e8c84a', OUT);
      g.poly([[6, -42], [11, -52], [3, -45]], '#e8c84a', OUT);
      g.glow(-6, -24, 12, '#c48cff', 0.25 * glowA);
      light(E, 0, -26, 34, '#b48cff', 0.08 * glowA);
    },
    bookshelf: function (g, obj, t) {
      shadowBlob(g, 22, 10);
      const wood = { top: '#6e4a2c', left: '#5a3a22', right: '#47301c' };
      g.box(0, 0, 20, 10, 54, wood, OUT);
      const c = g.ctx;
      const r = Iso.stream(Iso.hash(t.x, t.y, 27));
      const cols = ['#8e2b2b', '#2d4f8a', '#3b6b3f', '#6a4a8c', '#b08a2a', '#2c6b6b', '#7a3a5a'];
      [[-20, 0, 0, 10, true], [0, 10, 20, 0, false]].forEach(function (f) {
        const x0 = f[0], y0 = f[1], x1 = f[2], y1 = f[3];
        for (let s = 0; s < 3; s++) {
          const base = -4 - s * 17, top = base - 13;
          c.beginPath(); c.moveTo(x0, y0 + base); c.lineTo(x1, y1 + base); c.lineTo(x1, y1 + top); c.lineTo(x0, y0 + top); c.closePath();
          c.fillStyle = 'rgba(20,10,5,0.75)'; c.fill();
          let u = 0.06;
          while (u < 0.94) {
            const w = 0.06 + r() * 0.06, hgt = 9 + r() * 4;
            const a = edgeAt(x0, y0, x1, y1, u), b = edgeAt(x0, y0, x1, y1, Math.min(0.94, u + w));
            c.beginPath(); c.moveTo(a[0], a[1] + base); c.lineTo(b[0], b[1] + base); c.lineTo(b[0], b[1] + base - hgt); c.lineTo(a[0], a[1] + base - hgt); c.closePath();
            c.fillStyle = shade(cols[Math.floor(r() * cols.length)], f[4] ? 0 : -0.2); c.fill();
            c.strokeStyle = 'rgba(0,0,0,0.4)'; c.lineWidth = 0.5; c.stroke();
            u += w + 0.01;
          }
          c.beginPath(); c.moveTo(x0, y0 + base); c.lineTo(x1, y1 + base); c.strokeStyle = '#3a2414'; c.lineWidth = 1.6; c.stroke();
        }
      });
    },
    candles: function (g, obj, t, E) {
      g.ellipse(0, 0, 10, 5, '#8a7a5a', OUT);
      const c = g.ctx;
      [[-4, -1, 12], [4, -2, 8], [0, 2, 15]].sort(function (a, b) { return a[1] - b[1]; }).forEach(function (k, i) {
        g.cylinder(k[0], k[1], 2.3, 1.1, k[2], '#efe6cf', '#f8f2e0', OUT);
        g.ellipse(k[0] + 1.2, k[1] - k[2] + 3, 0.8, 2, '#f8f2e0');
        g.line(k[0], k[1] - k[2], k[0], k[1] - k[2] - 2, OUT, 0.7);
        c.save(); c.globalCompositeOperation = 'lighter';
        const f = 0.8 + 0.2 * Math.sin(time * 13 + i * 2);
        flame(c, k[0], k[1] - k[2] - 1.5, 1.6, 6 * f, Math.sin(time * 6 + i) * 0.8, 0.95);
        c.restore();
      });
      light(E, 0, -14, 52, '#ffc070', 0.2 + 0.04 * pulse(17));
    },
    mirror: function (g, obj) {
      const n = mirrorFacing(obj), p = { x: -n.y, y: n.x };
      const c = g.ctx;
      shadowBlob(g, 14, 7);
      // floor arrow: which way the reflective side faces
      const tip = gs(n.x * 0.44, n.y * 0.44);
      const b1 = gs(n.x * 0.2 + p.x * 0.1, n.y * 0.2 + p.y * 0.1), b2 = gs(n.x * 0.2 - p.x * 0.1, n.y * 0.2 - p.y * 0.1);
      g.poly([tip, b1, b2], 'rgba(255,214,90,0.85)', OUT);
      const leg1 = gs(p.x * 0.22, p.y * 0.22);
      g.line(leg1[0], leg1[1], leg1[0], leg1[1] - 8, '#6b4a2b', 2); g.line(-leg1[0], -leg1[1], -leg1[0], -leg1[1] - 8, '#6b4a2b', 2);
      function quad(off, w, y0, y1) {
        const a = gs(off.x + p.x * w, off.y + p.y * w), b = gs(off.x - p.x * w, off.y - p.y * w);
        return [[a[0], a[1] + y0], [b[0], b[1] + y0], [b[0], b[1] + y1], [a[0], a[1] + y1]];
      }
      const front = { x: n.x * 0.04, y: n.y * 0.04 }, back = { x: -n.x * 0.04, y: -n.y * 0.04 };
      const facingCam = n.x + n.y > 0;
      const fq = quad(front, 0.36, -7, -42), bq = quad(back, 0.36, -7, -42);
      g.poly(facingCam ? bq : fq, '#5a3a22', OUT);
      g.poly([fq[0], bq[0], bq[3], fq[3]], '#c9a03a', OUT);
      g.poly([fq[1], bq[1], bq[2], fq[2]], '#c9a03a', OUT);
      if (facingCam) {
        g.poly(fq, '#d4a63a', OUT);
        const inner = quad(front, 0.31, -10, -39);
        const gr = c.createLinearGradient(inner[0][0], inner[3][1], inner[1][0], inner[0][1]);
        gr.addColorStop(0, '#dfe9f5'); gr.addColorStop(0.5, '#9fb6d1'); gr.addColorStop(1, '#e9f1fa');
        g.poly(inner, gr);
        const sh = (time * 0.25) % 1.4;
        if (sh < 1) {
          const a = inner[0], b = inner[1];
          const x = a[0] + (b[0] - a[0]) * sh, y = a[1] + (b[1] - a[1]) * sh;
          g.line(x, y - 4, x + (b[0] - a[0]) * 0.12, y - 24 + (b[1] - a[1]) * 0.12, 'rgba(255,255,255,0.7)', 1.6);
        }
      } else {
        g.poly(bq, '#6b4a2b', OUT);
      }
    },
    d20: function (g, obj, t) {
      const c = g.ctx, R = 16, cy = -17;
      shadowBlob(g, 14, 6);
      const H = [], T = [];
      for (let k = 0; k < 6; k++) { const a = -Math.PI / 2 + k * Math.PI / 3; H.push([Math.cos(a) * R, cy + Math.sin(a) * R]); }
      for (let k = 0; k < 3; k++) { const a = -Math.PI / 2 + k * TAU / 3; T.push([Math.cos(a) * R * 0.52, cy + Math.sin(a) * R * 0.52]); }
      const base = '#6a2fa0';
      g.poly(H, shade(base, -0.25), OUT);
      g.poly([T[0], H[1], T[1]], shade(base, -0.05));
      g.poly([T[1], H[3], T[2]], shade(base, -0.35));
      g.poly([T[2], H[5], T[0]], shade(base, 0.05));
      g.poly(T, shade(base, 0.22));
      c.beginPath();
      c.moveTo(H[0][0], H[0][1]); c.lineTo(T[0][0], T[0][1]);
      c.moveTo(H[2][0], H[2][1]); c.lineTo(T[1][0], T[1][1]);
      c.moveTo(H[4][0], H[4][1]); c.lineTo(T[2][0], T[2][1]);
      [[T[0], H[1]], [H[1], T[1]], [T[1], H[3]], [H[3], T[2]], [T[2], H[5]], [H[5], T[0]]].forEach(function (s) { c.moveTo(s[0][0], s[0][1]); c.lineTo(s[1][0], s[1][1]); });
      c.strokeStyle = 'rgba(25,8,40,0.8)'; c.lineWidth = 0.9; c.stroke();
      g.poly(T, null, 'rgba(255,255,255,0.35)');
      const d = obj.data || {};
      const val = d.value !== undefined ? d.value : d.face !== undefined ? d.face : (Iso.rand(t.x, t.y, 28) < 0.25 ? 1 : 20);
      g.text(String(val), 0, cy + 1, val > 9 ? 7.5 : 8.5, val === 1 ? '#ff7a6a' : '#ffe08a', { stroke: 'rgba(30,10,45,0.9)', strokeWidth: 2 });
    },
    soda_can: function (g, obj, t) {
      shadowBlob(g, 14, 7);
      g.cylinder(0, 0, 11, 5.5, 46, '#2a9a3e', '#c9ced6', OUT);
      const c = g.ctx;
      c.save();
      c.beginPath(); c.rect(-11.5, -36, 23, 26); c.clip();
      c.beginPath(); c.moveTo(-12, -14); c.bezierCurveTo(-4, -26, 4, -18, 12, -32); c.lineTo(12, -24); c.bezierCurveTo(4, -12, -4, -20, -12, -8); c.closePath();
      c.fillStyle = 'rgba(230,255,120,0.75)'; c.fill();
      c.restore();
      g.text('MTN', -1, -31, 5, '#ffffff', { stroke: '#11461c', strokeWidth: 1.6 });
      g.text('DOOM', -1, -24, 6.5, '#ffffff', { stroke: '#11461c', strokeWidth: 1.8 });
      g.ellipse(0, -46, 11, 5.5, '#d9dde3', OUT);
      g.ellipse(0, -46, 8.5, 4, null, 'rgba(120,125,135,0.8)');
      g.ellipse(2, -46.5, 3, 1.4, '#9aa0a8', OUT);
      g.ellipse(-2.2, -45.5, 2, 1, '#2a2a2e');
      c.fillStyle = 'rgba(255,255,255,0.75)';
      [[-7, -12], [-4, -20], [5, -9], [7, -27], [-8, -33]].forEach(function (p) { c.fillRect(p[0], p[1], 1, 1.4); });
    },
    pencil: function (g) {
      const c = g.ctx;
      const a = P(-0.44, 0.05), b = P(0.22, 0.05), tip = P(0.46, 0.05);
      g.ellipse(0, 4, 24, 6, 'rgba(0,0,0,0.25)');
      const facets = [[-7, -4.6, '#f7d24a'], [-4.6, -2.3, '#e8b928'], [-2.3, 0, '#c9971a']];
      facets.forEach(function (f) {
        g.poly([[a[0], a[1] + f[0]], [b[0], b[1] + f[0]], [b[0], b[1] + f[1]], [a[0], a[1] + f[1]]], f[2]);
      });
      g.poly([[a[0], a[1] - 7], [b[0], b[1] - 7], [b[0], b[1]], [a[0], a[1]]], null, OUT);
      g.poly([[b[0], b[1] - 7], [tip[0], tip[1] - 3.5], [b[0], b[1]]], '#e9c9a0', OUT);
      const lead = edgeAt(b[0], b[1] - 3.5, tip[0], tip[1] - 3.5, 0.62);
      g.poly([[lead[0], lead[1] - 1.3], [tip[0], tip[1] - 3.5], [lead[0], lead[1] + 1.3]], '#3a3a40');
      const fe = edgeAt(a[0], a[1], b[0], b[1], 0.12);
      g.poly([[a[0], a[1] - 7], [fe[0], fe[1] - 7], [fe[0], fe[1]], [a[0], a[1]]], '#b8bcc4', OUT);
      g.ellipse(a[0], a[1] - 3.5, 2.6, 3.6, '#f08aa0', OUT);
      c.beginPath(); c.moveTo(a[0] + 2, a[1] - 6); c.lineTo(fe[0] + 1, fe[1] - 6); c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 0.7; c.stroke();
    },
    gold_pile: function (g, obj, t, E) {
      shadowBlob(g, 18, 8);
      g.ellipse(0, 0, 17, 8.5, '#a37a1e', OUT);
      const r = Iso.stream(Iso.hash(t.x, t.y, 29));
      for (let layer = 0; layer < 5; layer++) {
        const rad = 14 - layer * 2.8, y = -layer * 3;
        for (let i = 0; i < 6; i++) {
          const a = r() * TAU, d = r() * rad;
          g.ellipse(Math.cos(a) * d, y + Math.sin(a) * d * 0.45, 3.2, 1.6, shade('#f0c040', (r() - 0.5) * 0.25), 'rgba(120,80,10,0.7)');
        }
      }
      g.poly([[-1.5, -15], [1.5, -18], [4, -15], [1.5, -12.5]], '#e0475a', OUT);
      for (let i = 0; i < 2; i++) {
        const tw = pulse(3 + i, t.x + i * 2);
        if (tw > 0.75) {
          const x = (i ? 6 : -7), y = (i ? -6 : -9);
          g.ctx.fillStyle = 'rgba(255,255,230,' + (tw - 0.75) * 4 + ')';
          g.ctx.fillRect(x - 2.5, y - 0.4, 5, 0.8); g.ctx.fillRect(x - 0.4, y - 2.5, 0.8, 5);
        }
      }
      light(E, 0, -6, 26, '#ffd65a', 0.06);
    },
    bones: function (g, obj, t) {
      const bone = '#e9e1cc';
      const c = g.ctx;
      c.save(); c.rotate((Iso.rand(t.x, t.y, 30) - 0.5) * 0.6);
      [[-9, 3, 7, -2], [-8, -3, 8, 3]].forEach(function (b) {
        g.line(b[0], b[1], b[2], b[3], OUT, 3.4); g.line(b[0], b[1], b[2], b[3], bone, 2);
        [[b[0], b[1]], [b[2], b[3]]].forEach(function (e) { g.circle(e[0] - 0.8, e[1], 1.5, bone, OUT); g.circle(e[0] + 0.8, e[1] + 0.6, 1.5, bone, OUT); });
      });
      c.restore();
      skull(g, 3, -5, 0.9, bone);
    },
    fence: function (g, obj, t, E) {
      const F = E.F;
      const along = function (dx, dy) { const n = gridTile(F, t.x + dx, t.y + dy); return !!(n && n.obj && n.obj.id === 'fence'); };
      const axis = (obj.data && obj.data.axis) || (along(1, 0) || along(-1, 0) ? 'x' : along(0, 1) || along(0, -1) ? 'y' : 'x');
      const iron = themeIs(E, ['graveyard', 'academy', 'hoard', 'hellscape']);
      const col = iron ? '#3c3c44' : '#7a5530', hi = iron ? '#6a6a76' : '#a07445';
      const pts = [-0.5, -0.25, 0, 0.25, 0.5].map(function (k) { return axis === 'x' ? P(k, 0) : P(0, k); });
      const rails = [-7, -15];
      rails.forEach(function (y) {
        g.line(pts[0][0], pts[0][1] + y, pts[4][0], pts[4][1] + y, OUT, 3.2);
        g.line(pts[0][0], pts[0][1] + y, pts[4][0], pts[4][1] + y, hi, 1.6);
      });
      pts.forEach(function (p, i) {
        if (i === 0 || i === 4) return;
        g.line(p[0], p[1] + 1, p[0], p[1] - 20, OUT, 3.6);
        g.line(p[0], p[1] + 1, p[0], p[1] - 20, col, 2.2);
        if (iron) g.poly([[p[0] - 1.8, p[1] - 20], [p[0], p[1] - 24.5], [p[0] + 1.8, p[1] - 20]], hi, OUT);
        else g.poly([[p[0] - 1.6, p[1] - 20], [p[0], p[1] - 22.5], [p[0] + 1.6, p[1] - 20]], hi, OUT);
      });
    },
    pipe: function (g, obj, t) {
      shadowBlob(g, 13, 6.5);
      const metal = '#6f6b62';
      g.cylinder(0, 0, 10, 5, 3, '#56534c', '#7d796f', OUT);
      g.cylinder(0, -3, 8, 4, 26, metal, '#86827a', OUT);
      g.cylinder(0, -27, 10, 5, 4, '#56534c', '#86827a', OUT);
      const o = P(0.32, 0);
      g.line(0, -18, o[0], o[1] - 18, OUT, 9.5); g.line(0, -18, o[0], o[1] - 18, metal, 7);
      g.ellipse(o[0], o[1] - 18, 2.4, 4.4, '#22201c', OUT);
      g.ellipse(-3, -16, 2, 1.2, 'rgba(170,90,40,0.6)');
      const k = (time * 0.7 + Iso.rand(t.x, t.y, 32)) % 1;
      g.circle(o[0], o[1] - 15 + k * 14, 1.4 * (1 - k * 0.4), 'rgba(140,220,70,' + (1 - k) + ')');
      g.ellipse(0, -31, 6, 3, '#22201c');
    },
    valve: function (g, obj, t) {
      const on = objFlag(obj, ['on', 'open', 'turned', 'active']);
      shadowBlob(g, 12, 6);
      g.cylinder(0, 0, 5, 2.5, 13, '#6f6b62', '#86827a', OUT);
      const c = g.ctx, ang = (on ? Math.PI / 4 : 0) + (obj.data && obj.data.spin ? time * 4 : 0);
      g.ellipse(0, -15, 10.5, 5.2, null, OUT);
      c.beginPath(); c.ellipse(0, -15, 10, 5, 0, 0, TAU); c.strokeStyle = '#b8352a'; c.lineWidth = 2.6; c.stroke();
      c.beginPath();
      for (let k = 0; k < 4; k++) { const a = ang + k * Math.PI / 2; c.moveTo(0, -15); c.lineTo(Math.cos(a) * 9.5, -15 + Math.sin(a) * 4.7); }
      c.strokeStyle = '#8e2a20'; c.lineWidth = 1.6; c.stroke();
      g.circle(0, -15, 2, '#d0d4da', OUT);
      g.circle(6, -3, 1.4, on ? '#7dff9a' : '#ff6a5a');
    },
  });

  function genericObject(g, obj, def) {
    const col = (def && (def.color || (def.colors && (def.colors.top || def.colors.body)))) || '#8a7f72';
    const h = clamp(((def && def.height) || 0.8) * Iso.HEIGHT_PX, 4, 90);
    shadowBlob(g, 18, 8.5);
    g.box(0, 0, 15, 7.5, h, { top: shade(col, 0.15), left: col, right: shade(col, -0.25) }, OUT);
    g.diamond(0, -h, 9, 4.5, null, 'rgba(255,255,255,0.22)');
  }

  function objHeight(obj, def) {
    if (def && typeof def.draw === 'function' && !brokenPainters['object:' + obj.id]) return clamp((def.height || 0.8) * Iso.HEIGHT_PX, 4, 120);
    if (OBJ_H[obj.id] !== undefined) return OBJ_H[obj.id];
    return clamp(((def && def.height) || 0.8) * Iso.HEIGHT_PX, 4, 90);
  }
  /**
   * Instance `height` override (tiles, like def.height): the object is painted uniformly scaled around its base,
   * e.g. a pet rock { id: 'rock', height: 0.45 } next to the def's 1-tile boulder. Render-only.
   */
  function objScale(obj, def) {
    const h = obj && typeof obj.height === 'number' ? obj.height : NaN;
    if (!(h > 0) || !isFinite(h)) return 1;
    return clamp(h / ((def && def.height > 0 && def.height) || 0.8), 0.2, 2.5);
  }
  /**
   * A pair of googly eyes stuck on an object (instance flag `googly: true`): the pet rock is a person now. Sized in
   * world px (k = the instance scale), so a small rock gets comically big eyes.
   */
  function googlyEyes(g, obj, h, k) {
    const r = clamp(2.6 / k, 2.2, 7), y = -h * 0.55;
    const look = Math.sin(time * 0.9 + (obj.hp || 0)) * r * 0.3;
    [-r * 1.12, r * 1.12].forEach(function (x, i) {
      g.circle(x, y, r, '#ffffff', OUT);
      g.circle(x + look + (i ? 0.15 : -0.15) * r, y + r * 0.32, r * 0.46, '#14100f');
    });
  }

  function drawObject(F, c, t, cx, cy) {
    const obj = t.obj;
    if (!obj || !obj.id) return;
    const def = DD.getObject ? DD.getObject(obj.id) : null;
    const k = objScale(obj, def);
    const E = { F: F, cx: cx, cy: cy, tile: t, k: k };
    c.save();
    c.translate(cx, cy);
    if (k !== 1) c.scale(k, k);
    if (!F.painter || F.painter.ctx !== c) F.painter = Iso.painter(c, {});
    const g = F.painter;
    g.t = time; g.obj = obj; g.tile = t; g.zoom = F.zoom * k; g.lw = 1.2; g.outline = OUT;
    g.pal = (def && (def.colors || def.palette)) || {};
    let drawn = false;
    if (def && typeof def.draw === 'function') drawn = safePaint('object:' + obj.id, 'object draw ' + obj.id, def.draw, def, [g, obj, time]);
    if (!drawn) {
      try {
        if (OBJ[obj.id]) OBJ[obj.id](g, obj, t, E);
        else genericObject(g, obj, def);
      } catch (e) { renderError('object ' + obj.id, e); }
    }
    if (obj.googly) googlyEyes(g, obj, objHeight(obj, def), k);
    c.restore();
    F.objList.push({ obj: obj, tile: t, cx: cx, cy: cy, h: objHeight(obj, def) * k, hw: (OBJ_W[obj.id] || 15) * k, diag: t.x + t.y });
  }

  // ======================================================================================================
  // Units
  // ======================================================================================================
  function unitDef(u) {
    if (!u) return null;
    if (u.kind === 'hero') return DD.getHero ? DD.getHero(u.defId) : null;
    if (u.kind === 'summon') return (DD.getSummon && DD.getSummon(u.defId)) || (DD.getEnemy && DD.getEnemy(u.defId)) || null;
    return (DD.getEnemy && DD.getEnemy(u.defId)) || (DD.getSummon && DD.getSummon(u.defId)) || null;
  }
  function unitScale(u) {
    const d = unitDef(u);
    const s = d && d.sprite && d.sprite.scale;
    return clamp(+s || (u.flags && u.flags.large ? 1.35 : 1), 0.4, 3);
  }
  function isFlying(u) {
    if (u.flags && u.flags.flying) return true;
    const d = unitDef(u);
    return !!(d && d.flags && d.flags.flying);
  }
  function sideColor(u) {
    if (u.side !== 'hero') return '#ff6a5a';
    return u.kind === 'summon' ? '#8affb0' : '#86d4ff';
  }
  function groundH(F, x, y) {
    const t = gridTile(F, Math.round(x), Math.round(y));
    return t ? (t.h || 0) : 0;
  }
  /** Sprite size in px at zoom 1 (spec scale applied, vis.scale not): { height, width, hover, scale }. */
  function unitMetrics(u) {
    const S = DD.Sprites;
    if (S && typeof S.metrics === 'function' && !brokenPainters.metrics) {
      try {
        const m = S.metrics(u);
        if (m && m.height > 0 && isFinite(m.height)) return m;
      } catch (e) { brokenPainters.metrics = true; renderError('DD.Sprites.metrics', e); }
    }
    const s = unitScale(u), fl = isFlying(u);
    return { height: (40 + (fl ? 8 : 0)) * s, width: 26 * s, hover: fl ? 8 * s : 0, scale: s };
  }

  /** Render-only jump / throw height (px at zoom 1) while an FX keeps it fresh (the rule DD.Sprites applies). */
  function liftOf(v) {
    if (!v || !(v.lift > 0) || v._fxAt === undefined) return 0;
    return performance.now() - v._fxAt < 450 ? v.lift : 0;
  }

  /** Collect drawable units with their interpolated world positions. */
  function collectUnits(F) {
    const out = [];
    const units = (F.st && F.st.units) || [];
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (!u) continue;
      if (!u.vis && DD.FX && DD.FX.initVis) DD.FX.initVis(u);
      const v = u.vis || {};
      const alpha = v.alpha === undefined ? (u.dead ? 0 : 1) : v.alpha;
      if (alpha <= 0.01) continue;
      const x = v.x !== undefined ? v.x : u.x, y = v.y !== undefined ? v.y : u.y;
      if (!isFinite(x) || !isFinite(y)) continue;
      const gh = groundH(F, x, y);
      const h = v.h !== undefined ? v.h : gh;
      const w = Iso.toWorld(x, y, h);
      const vscale = v.scale > 0 ? v.scale : 1;
      const m = unitMetrics(u);
      out.push({
        u: u, x: x, y: y, h: h, groundH: Math.min(h, gh), alpha: clamp(alpha, 0, 1),
        // feet position; lunge offsets (vis.offX/offY), alpha and vis.scale are applied by DD.Sprites.drawUnit
        wx: w.x, wy: w.y, offX: v.offX || 0, offY: v.offY || 0, vscale: vscale,
        gwx: w.x, gwy: Iso.toWorld(x, y, Math.min(h, gh)).y,
        diag: clamp(Math.ceil(x + y - 0.02), 0, F.gw + F.gh - 2),
        scale: (m.scale || unitScale(u)) * vscale, mh: m.height * vscale, mw: m.width * vscale,
        downed: !!(v.downed || u.downed), flying: isFlying(u), lift: liftOf(v),
      });
    }
    out.sort(function (a, b) { return a.diag - b.diag || a.h - b.h || a.wx - b.wx; });
    return out;
  }

  /** Fallback figure when DD.Sprites is unavailable; applies vis alpha / scale / lunge offsets itself. */
  function placeholderUnit(c, u, sx, sy, z, downed) {
    const def = unitDef(u), v = u.vis || {};
    const col = u.side === 'hero' ? ((def && def.color) || (u.kind === 'summon' ? '#6fd38a' : '#4aa3ff')) : '#d9534a';
    const s = z * unitScale(u) * (v.scale > 0 ? v.scale : 1);
    const bob = downed ? 0 : Math.sin(time * 3 + (U.hash(String(u.id)) % 100)) * 1.2 * s;
    c.save();
    c.globalAlpha *= clamp(v.alpha === undefined ? 1 : v.alpha, 0, 1);
    c.translate(sx + (v.offX || 0) * z, sy + (v.offY || 0) * z);
    if (downed) c.rotate(-Math.PI / 2 * (u.facing === -1 ? -1 : 1) * 0.9);
    c.lineWidth = Math.max(1, 1.6 * s);
    c.strokeStyle = OUT;
    c.beginPath(); roundRect(c, -8 * s, -24 * s + bob, 16 * s, 22 * s, 6 * s);
    c.fillStyle = col; c.fill(); c.stroke();
    c.beginPath(); roundRect(c, -8 * s, -10 * s + bob, 16 * s, 3 * s, 1 * s); c.fillStyle = shade(col, -0.35); c.fill();
    c.beginPath(); c.arc(0, -31 * s + bob, 9 * s, 0, TAU);
    c.fillStyle = u.side === 'hero' ? '#f1d2b6' : '#a7c96b'; c.fill(); c.stroke();
    const f = u.facing === -1 ? -1 : 1;
    c.fillStyle = OUT;
    c.beginPath(); c.arc(f * 2.5 * s, -32 * s + bob, 1.4 * s, 0, TAU); c.arc(f * 6 * s, -32 * s + bob, 1.4 * s, 0, TAU); c.fill();
    c.restore();
  }

  /** bare (optional): paint only the body, no underlay or status effects (silhouette masks). */
  function drawSprite(c, u, sx, sy, z, downed, bare) {
    const key = 'sprite:' + (u.defId || u.id);
    const S = DD.Sprites;
    if (S && !brokenPainters[key]) {
      try {
        const extra = bare ? BARE : undefined;
        // decorative units (title diorama) idle out of sync via a per-unit time offset
        if (u._idle !== undefined && typeof S.draw === 'function') {
          const def = unitDef(u);
          if (def && def.sprite) {
            S.draw(c, def.sprite, sx, sy, z, { t: time + u._idle, facing: u.facing || 1, pose: 'idle', alpha: 1, underlay: bare ? false : undefined });
            return;
          }
        }
        if (typeof S.drawUnit === 'function') { S.drawUnit(c, u, sx, sy, z, time, extra); return; }
      } catch (e) {
        brokenPainters[key] = true;
        renderError('DD.Sprites (' + (u.defId || u.id) + ')', e);
      }
    }
    placeholderUnit(c, u, sx, sy, z, downed);
  }

  function selectionRing(c, x, y, s) {
    const p = pulse(4);
    c.beginPath(); c.ellipse(x, y, 19 * s, 9.5 * s, 0, 0, TAU);
    c.fillStyle = 'rgba(255,215,106,' + (0.12 + 0.08 * p) + ')'; c.fill();
    c.lineWidth = 2; c.strokeStyle = 'rgba(255,215,106,' + (0.75 + 0.25 * p) + ')'; c.stroke();
    c.save();
    c.lineWidth = 2.6; c.strokeStyle = '#fff2b8'; c.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const a = time * 1.6 + i * Math.PI / 2;
      c.beginPath(); c.ellipse(x, y, 23 * s, 11.5 * s, 0, a, a + 0.45); c.stroke();
    }
    c.restore();
  }

  /** v2: the unit whose turn it is (overlay.turnUnitId): a soft glow disc and a breathing ring, red for AI units. */
  function turnRing(c, x, y, s, foe) {
    const p = pulse(3.2);
    const col = foe ? '255,86,64' : '255,215,106';
    const g = c.createRadialGradient(x, y, 2, x, y, 26 * s);
    g.addColorStop(0, 'rgba(' + col + ',' + (0.34 + 0.14 * p) + ')');
    g.addColorStop(1, 'rgba(' + col + ',0)');
    c.save();
    c.translate(x, y); c.scale(1, 0.5); c.translate(-x, -y);
    c.beginPath(); c.arc(x, y, 26 * s, 0, TAU); c.fillStyle = g; c.fill();
    c.restore();
    c.beginPath(); c.ellipse(x, y, (20 + 3 * p) * s, (10 + 1.5 * p) * s, 0, 0, TAU);
    c.lineWidth = 2.4; c.strokeStyle = 'rgba(' + col + ',' + (0.65 + 0.3 * p) + ')'; c.stroke();
  }

  /** Hero-side units acting on the current turn (the current unit and its summons): the only ones with live AP. */
  function inCurrentTurn(st, u) {
    if (!st || !st.current || !u) return !!(st && !st.order && u && u.side === 'hero');   // pre-v2 states: every hero
    return u.id === st.current || u.ownerId === st.current;
  }

  const BARE = Object.freeze({ underlay: false, statusFx: false });

  function setScreenTransform(F) { F.ctx.setTransform(DPR, 0, 0, DPR, 0, 0); }
  function setWorldTransform(F) {
    const z = F.zoom;
    F.ctx.setTransform(DPR * z, 0, 0, DPR * z, DPR * (W / 2 + F.shake.x - F.cam.x * z), DPR * (H / 2 + F.shake.y - F.cam.y * z));
  }
  function w2s(F, wx, wy) { return { x: (wx - F.cam.x) * F.zoom + W / 2 + F.shake.x, y: (wy - F.cam.y) * F.zoom + H / 2 + F.shake.y }; }

  function drawUnitBody(F, c, d) {
    const u = d.u, s = Math.max(0.6, d.scale);
    if (F.ov && F.ov.turnUnitId === u.id && !d.downed && d.alpha > 0.3) turnRing(c, d.gwx, d.gwy, Math.max(0.8, s), u.side !== 'hero');
    if (F.ov && F.ov.selectedId === u.id && !d.downed) selectionRing(c, d.gwx, d.gwy, Math.max(0.8, s));
    const air = Math.max(0, d.h - d.groundH) + (d.flying ? 0.8 : 0) + d.lift / STEP;
    const k = 1 / (1 + air * 0.35);
    const rx = clamp(d.mw * 0.55, 8, 60) * k * (d.downed ? 1.35 : 1);
    c.beginPath();
    c.ellipse(d.gwx + d.offX * 0.5, d.gwy + 1, rx, rx * 0.45, 0, 0, TAU);
    c.fillStyle = 'rgba(0,0,0,' + (0.34 * d.alpha * k) + ')';
    c.fill();
    const sp = w2s(F, d.wx, d.wy);
    setScreenTransform(F);
    c.save();
    drawSprite(c, u, sp.x, sp.y, F.zoom, d.downed);
    c.restore();
    setWorldTransform(F);
    d.sx = sp.x; d.sy = sp.y;
  }

  // ---- occlusion silhouettes ---------------------------------------------------------------------------
  let silCanvas = null;
  function columnPoly(cx, cy) {
    return [[cx, cy - HH], [cx + HW, cy], [cx + HW, cy + 600], [cx, cy + HH + 600], [cx - HW, cy + 600], [cx - HW, cy]];
  }
  /** World-space occluder polygons in front of a unit that rise above its feet. */
  function occludersFor(F, d) {
    const polys = [];
    const ux = Math.round(d.x), uy = Math.round(d.y);
    const feet = d.gwy - 2, reach = 18 * d.scale;
    for (let dd = 1; dd <= 8; dd++) {
      const diag = d.diag + dd;
      for (let sxk = -3; sxk <= 3; sxk++) {
        // tiles on diagonal `diag` whose screen x is near the unit: (x - y) = (ux - uy) + sxk
        const sum = diag, dif = (ux - uy) + sxk;
        if ((sum + dif) % 2 !== 0) continue;
        const tx = (sum + dif) / 2, ty = (sum - dif) / 2;
        const t = gridTile(F, tx, ty);
        if (!t) continue;
        const top = topLevel(F, t);
        const w = Iso.toWorld(tx, ty, top);
        if (Math.abs(w.x - d.wx) > HW + reach) continue;
        if (w.y - HH < feet && top > d.groundH + 0.5) polys.push(columnPoly(w.x, w.y));
      }
    }
    for (let i = 0; i < F.objList.length; i++) {
      const o = F.objList[i];
      if (o.diag <= d.diag || o.diag > d.diag + 5 || o.h < 14) continue;
      if (Math.abs(o.cx - d.wx) > o.hw + reach) continue;
      if (o.cy - o.h < feet) polys.push([[o.cx - o.hw, o.cy - o.h], [o.cx + o.hw, o.cy - o.h], [o.cx + o.hw, o.cy + 10], [o.cx - o.hw, o.cy + 10]]);
    }
    return polys;
  }

  /** Screen box of a unit's sprite (feet at d.sx/d.sy; lying units are wide and low). */
  function spriteBox(d, z) {
    const cx = d.sx + d.offX * z, up = (d.lift || 0) * z;
    if (d.downed) {
      const hw = Math.max(14, d.mh * 0.5) * z;
      return { x0: cx - hw, x1: cx + hw, y0: d.sy - Math.max(12, d.mw * 0.7) * z - up, y1: d.sy + 3 * z - up };
    }
    const hw = Math.max(8, d.mw * 0.5) * z;
    return { x0: cx - hw, x1: cx + hw, y0: d.sy + d.offY * z - d.mh * z - up, y1: d.sy + 3 * z - up };
  }
  /**
   * Units painted after d (index i) that hide a good part of it: small heroes behind Marwyn or Slate, corgis behind
   * anyone, minions behind a boss. Box overlap decides who counts (>= 40% of d's box: a same-size unit one row in
   * front only covers the feet, ~25%); the mask itself is the front sprites' real pixels.
   */
  const UNIT_COVER = 0.4;
  function unitOccluders(F, i, d) {
    if (d.downed && d.u.side !== 'hero') return null;
    const z = F.zoom, a = spriteBox(d, z);
    const area = Math.max(1, (a.x1 - a.x0) * (a.y1 - a.y0));
    let covered = 0, out = null;
    for (let j = i + 1; j < F.unitDraws.length; j++) {
      const e = F.unitDraws[j];
      if (e.alpha < 0.5 || e.sx === undefined || e.u === d.u) continue;
      const b = spriteBox(e, z);
      const ix = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), iy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
      if (ix <= 0 || iy <= 0) continue;
      covered += ix * iy;
      (out = out || []).push(e);
    }
    return out && covered >= area * UNIT_COVER ? out : null;
  }

  let ringCanvas = null, maskCanvas = null;
  function scratch(cv, pw, ph) {
    if (!cv) {
      cv = document.createElement('canvas');
      // CPU-backed on purpose: these small canvases are composited into each other several times per frame, and a
      // GPU-promoted canvas pays a flush + readback for every such hop (measured: 1 ms → 40+ ms per frame).
      cv.getContext('2d', { willReadFrequently: true });
    }
    if (cv.width < pw || cv.height < ph) { cv.width = Math.max(pw, cv.width); cv.height = Math.max(ph, cv.height); }
    const k = cv.getContext('2d');
    k.setTransform(1, 0, 0, 1, 0, 0);
    k.globalCompositeOperation = 'source-over';
    k.globalAlpha = 1;
    k.clearRect(0, 0, cv.width, cv.height);
    return cv;
  }
  /**
   * Units hidden behind taller geometry or bigger units: faint team-coloured fill + crisp outline, only where
   * occluded. Masks are the bare bodies (no spotlight underlays or status sparkles). F.silhouettes counts them.
   */
  function drawSilhouettes(F) {
    const c = F.ctx;
    F.silhouettes = [];
    for (let i = 0; i < F.unitDraws.length; i++) {
      const d = F.unitDraws[i];
      if (d.alpha < 0.3 || d.sx === undefined) continue;
      const polys = occludersFor(F, d);
      const fronts = unitOccluders(F, i, d);
      if (!polys.length && !fronts) continue;
      const z = F.zoom;
      const bw = (Math.max(40, d.mw * 2.2) + 40) * z, bh = (d.mh + 56 + d.lift) * z;
      const bx = d.sx - bw / 2, by = d.sy - bh + 24 * z;
      const pw = Math.ceil(bw * DPR), ph = Math.ceil(bh * DPR);
      if (pw < 2 || ph < 2) continue;
      // 1) the whole sprite as a flat team-coloured shape
      silCanvas = scratch(silCanvas, pw, ph);
      const k = silCanvas.getContext('2d');
      k.setTransform(DPR, 0, 0, DPR, -bx * DPR, -by * DPR);
      drawSprite(k, d.u, d.sx, d.sy, z, d.downed, true);
      k.setTransform(1, 0, 0, 1, 0, 0);
      k.globalCompositeOperation = 'source-in';
      k.fillStyle = sideColor(d.u);
      k.fillRect(0, 0, pw, ph);
      // 2) outline ring = shape dilated by ~1.5 px minus the shape (computed before masking: no line along the occluder)
      ringCanvas = scratch(ringCanvas, pw, ph);
      const r = ringCanvas.getContext('2d');
      const o = Math.max(1, Math.round(1.5 * DPR));
      [[o, 0], [-o, 0], [0, o], [0, -o]].forEach(function (q) { r.drawImage(silCanvas, 0, 0, pw, ph, q[0], q[1], pw, ph); });
      r.globalCompositeOperation = 'destination-out';
      r.drawImage(silCanvas, 0, 0, pw, ph, 0, 0, pw, ph);
      // 3) the occluders: taller tiles/objects in front as polygons, bigger units in front by their real pixels
      maskCanvas = scratch(maskCanvas, pw, ph);
      const m = maskCanvas.getContext('2d');
      m.setTransform(DPR, 0, 0, DPR, -bx * DPR, -by * DPR);
      if (polys.length) {
        m.beginPath();
        for (let p = 0; p < polys.length; p++) {
          const poly = polys[p];
          for (let q = 0; q < poly.length; q++) {
            const sp = w2s(F, poly[q][0], poly[q][1]);
            if (q) m.lineTo(sp.x, sp.y); else m.moveTo(sp.x, sp.y);
          }
          m.closePath();
        }
        m.fillStyle = '#ffffff';
        m.fill('nonzero');
      }
      if (fronts) {
        for (let f = 0; f < fronts.length; f++) {
          const e = fronts[f], b = spriteBox(e, z);
          drawSprite(m, e.u, e.sx, e.sy, z, e.downed, true);
          // feet behind another sprite: its AP pips would sit on that unit's body and read as theirs
          if (d.sx >= b.x0 && d.sx <= b.x1 && d.sy + 8 * z >= b.y0 && d.sy + 8 * z <= b.y1) d.feetHidden = true;
        }
      }
      m.setTransform(1, 0, 0, 1, 0, 0);
      // 4) keep fill and ring only where something covers the unit
      [k, r].forEach(function (cx) {
        cx.globalCompositeOperation = 'destination-in';
        cx.drawImage(maskCanvas, 0, 0, pw, ph, 0, 0, pw, ph);
        cx.globalCompositeOperation = 'source-over';
      });
      c.save();
      setScreenTransform(F);
      // over another unit the fill stays faint (the outline does the work) so the unit in front keeps its colours
      c.globalAlpha = (fronts ? 0.16 : 0.3) * d.alpha;
      c.drawImage(silCanvas, 0, 0, pw, ph, bx, by, pw / DPR, ph / DPR);
      c.globalAlpha = 0.95 * d.alpha;
      c.drawImage(ringCanvas, 0, 0, pw, ph, bx, by, pw / DPR, ph / DPR);
      c.restore();
      F.silhouettes.push({ id: d.u.id, geometry: polys.length, units: fronts ? fronts.map(function (e) { return e.u.id; }) : [] });
    }
  }

  // ---- unit widgets (screen space) -----------------------------------------------------------------------
  const barState = new Map();
  function barValues(u, dt) {
    const v = u.vis || {};
    const target = Math.max(0, v.hp !== undefined ? v.hp : (u.hp || 0));
    let b = barState.get(u.id);
    if (!b) {
      if (barState.size > 400) barState.clear();
      b = { hp: target, ghost: target, hold: 0 };
      barState.set(u.id, b);
    }
    const sec = Math.max(0, dt) / 1000;
    if (target < b.hp - 0.001) { b.ghost = Math.max(b.ghost, b.hp); b.hp = target; b.hold = 0.5; }
    else if (target > b.hp) { b.hp += (target - b.hp) * Math.min(1, sec * 7); if (target - b.hp < 0.05) b.hp = target; }
    if (b.hold > 0) b.hold -= sec;
    else if (b.ghost > b.hp) { b.ghost -= Math.max(sec * 6, (b.ghost - b.hp) * Math.min(1, sec * 5)); if (b.ghost < b.hp) b.ghost = b.hp; }
    else b.ghost = b.hp;
    return b;
  }

  function shieldBadge(c, x, y, n, z) {
    const s = 0.9 * z;
    c.beginPath();
    c.moveTo(x, y - 7 * s); c.lineTo(x + 6 * s, y - 4.6 * s); c.lineTo(x + 6 * s, y + 0.8 * s);
    c.quadraticCurveTo(x + 6 * s, y + 5.5 * s, x, y + 7.6 * s);
    c.quadraticCurveTo(x - 6 * s, y + 5.5 * s, x - 6 * s, y + 0.8 * s);
    c.lineTo(x - 6 * s, y - 4.6 * s); c.closePath();
    c.fillStyle = '#5f97f0'; c.fill();
    c.lineWidth = 1.4; c.strokeStyle = 'rgba(10,14,30,0.95)'; c.stroke();
    label(c, String(n), x, y + 0.6 * s, Math.round(8.5 * z), '#ffffff', { strokeWidth: 2 });
  }

  function hpBar(F, c, d, x, y, w, h, z) {
    const u = d.u;
    const max = Math.max(1, u.maxHp || 1);
    const b = barValues(u, F.dt);
    const block = Math.max(0, u.vis && u.vis.block !== undefined ? u.vis.block : (u.block || 0));
    c.beginPath(); roundRect(c, x - 1.5, y - 1.5, w + 3, h + 3, 2.5); c.fillStyle = 'rgba(12,6,8,0.9)'; c.fill();
    c.fillStyle = '#3b2023'; c.fillRect(x, y, w, h);
    const hpW = w * clamp(b.hp / max, 0, 1), ghostW = w * clamp(b.ghost / max, 0, 1);
    if (ghostW > hpW + 0.3) { c.fillStyle = '#ffe3a0'; c.fillRect(x + hpW, y, ghostW - hpW, h); }
    const col = d.downed ? '#7a7070' : u.side === 'hero' ? (u.kind === 'summon' ? '#46cdb4' : '#56d16a') : (u.tier === 'boss' ? '#e0386e' : '#e2483c');
    c.fillStyle = col; c.fillRect(x, y, hpW, h);
    c.fillStyle = 'rgba(255,255,255,0.28)'; c.fillRect(x, y, hpW, Math.max(1, Math.round(h * 0.38)));
    if (max <= 160 && w / max >= 2.2) {
      c.fillStyle = 'rgba(0,0,0,0.35)';
      const step = max > 60 ? 10 : 5;
      for (let k = step; k < max; k += step) c.fillRect(Math.round(x + w * k / max), y, 1, h);
    }
    const prev = F.ov && F.ov.previews ? F.ov.previews[u.id] : null;
    const flash = 0.45 + 0.55 * pulse(9);
    if (prev && prev.heal > 0) {
      const hw2 = w * clamp((b.hp + prev.heal) / max, 0, 1) - hpW;
      if (hw2 > 0) { c.fillStyle = 'rgba(150,255,170,' + flash + ')'; c.fillRect(x + hpW, y, hw2, h); }
    }
    let blockW = block > 0 ? Math.max(2, w * clamp(block / max, 0, 1)) : 0;
    let blockX = x + Math.min(hpW, w - blockW);
    if (blockW > 0) {
      c.fillStyle = '#7fb0ff'; c.fillRect(blockX, y, blockW, h);
      c.fillStyle = 'rgba(255,255,255,0.45)';
      for (let k = 2; k < blockW; k += 4) c.fillRect(blockX + k, y, 1.2, h);
    }
    if (prev && prev.dmg > 0) {
      const blockLoss = Math.min(block, prev.dmg);
      const hpLoss = Math.min(b.hp, prev.dmg - blockLoss);
      if (hpLoss > 0) {
        const lw = w * clamp(hpLoss / max, 0, 1);
        c.fillStyle = 'rgba(255,255,255,' + flash + ')'; c.fillRect(x + hpW - lw, y, lw, h);
        c.fillStyle = 'rgba(255,40,40,' + (1 - flash) * 0.8 + ')'; c.fillRect(x + hpW - lw, y, lw, h);
      }
      if (blockLoss > 0 && blockW > 0) {
        c.fillStyle = 'rgba(20,30,70,' + flash * 0.75 + ')';
        c.fillRect(blockX + blockW - Math.min(blockW, w * blockLoss / max), y, Math.min(blockW, w * blockLoss / max), h);
      }
    }
    const fs = Math.max(8, Math.round(9.5 * z));
    const txt = String(Math.max(0, Math.round(u.vis && u.vis.hp !== undefined ? u.vis.hp : u.hp)));
    c.font = 'bold ' + fs + 'px ' + FONT;
    const tw = c.measureText(txt).width;
    const px = x - tw - 7;
    c.beginPath(); roundRect(c, px - 1, y + h / 2 - fs * 0.62, tw + 6, fs * 1.24, 3);
    c.fillStyle = 'rgba(12,6,8,0.9)'; c.fill();
    label(c, txt, px + tw / 2 + 2, y + h / 2 + 0.5, fs, d.downed ? '#bbb' : '#ffffff', { stroke: false });
    if (block > 0) shieldBadge(c, x + w + 8 * z, y + h / 2, Math.round(block), z);
  }

  function statusRow(F, c, u, cx, y, z) {
    const sts = (u.statuses || []).filter(function (s) { return s && s.id; });
    if (!sts.length) return y;
    const size = Math.round(13 * z), gap = 2, n = Math.min(6, sts.length);
    const total = n * size + (n - 1) * gap + (sts.length > 6 ? size : 0);
    let x = cx - total / 2 + size / 2;
    const cyy = y - size / 2;
    for (let i = 0; i < n; i++) {
      const st = sts[i], def = DD.getStatus ? DD.getStatus(st.id) : null;
      const col = (def && def.color) || (def && def.type === 'buff' ? '#5ad16a' : '#e2483c');
      c.beginPath(); roundRect(c, x - size / 2 - 1, cyy - size / 2 - 1, size + 2, size + 2, 3);
      c.fillStyle = 'rgba(14,8,12,0.88)'; c.fill();
      c.lineWidth = 1.2; c.strokeStyle = col; c.stroke();
      drawGlyph(c, (def && def.icon) || '❔', x, cyy, size * 0.8);
      if (st.stacks > 1) label(c, String(st.stacks), x + size * 0.42, cyy + size * 0.38, Math.max(7, Math.round(8 * z)), '#ffffff', { strokeWidth: 2.2 });
      x += size + gap;
    }
    if (sts.length > 6) label(c, '+' + (sts.length - 6), x, cyy, Math.round(9 * z), '#ffffff');
    return y - size - 3;
  }

  function apPips(c, u, cx, y, z) {
    const max = clamp(u.maxAp || 0, 0, 8);
    if (!max) return;
    const ap = clamp(u.ap || 0, 0, 8), sz = 3.4 * z, gap = 8 * z;
    let x = cx - (max - 1) * gap / 2;
    for (let i = 0; i < Math.max(max, ap); i++) {
      c.beginPath(); c.moveTo(x, y - sz); c.lineTo(x + sz, y); c.lineTo(x, y + sz); c.lineTo(x - sz, y); c.closePath();
      c.fillStyle = i < ap ? '#ffd76a' : 'rgba(30,20,20,0.75)'; c.fill();
      c.lineWidth = 1.2; c.strokeStyle = i < ap ? '#5a3a10' : 'rgba(255,215,106,0.5)'; c.stroke();
      x += gap;
    }
  }

  // Wind-up bubble over its owner (v2: only boss wind-ups are stored as intents): ⏳[n] icon dmg per wind-up.
  // No order numbers any more (initiative lives in the HUD tracker). Measured first so colliding bubbles stack.
  function measureBubble(F, c, d, z) {
    const items = F.intentInfo && F.intentInfo[d.u.id];
    if (!items || !items.length) return null;
    const focus = F.ov && F.ov.focusIntentUnitId;
    const zz = z * (focus === d.u.id ? 1.12 : 1);
    const fs = Math.round(11 * zz), ic = Math.round(14 * zz), pad = 4 * zz;
    c.font = 'bold ' + fs + 'px ' + FONT;
    const parts = [];
    let wsum = pad;
    for (let i = 0; i < items.length && i < 3; i++) {
      const it = items[i];
      const txt = (it.unknown ? '?' : '') + (it.dmg > 0 ? String(it.dmg) : '');
      const tw = txt ? c.measureText(txt).width + 2 : 0;
      const dl = ic * 0.85 + (it.delay > 1 ? c.measureText(String(it.delay)).width + 1 : 0);
      parts.push({ kind: 'intent', it: it, txt: txt, tw: tw, dl: dl });
      wsum += dl + ic + tw + 4 * zz;
    }
    if (items.length > 3) { parts.push({ kind: 'more', n: items.length - 3 }); wsum += fs * 1.4; }
    return {
      w: wsum + pad - 4 * zz, h: ic + pad * 1.4, parts: parts, zz: zz, fs: fs, ic: ic, pad: pad,
      dim: !!(focus && focus !== d.u.id), focused: focus === d.u.id,
      now: items.some(function (i) { return !(i.delay > 1); }),
    };
  }
  function drawBubble(c, m, bx, by) {
    const zz = m.zz, ic = m.ic, fs = m.fs;
    c.save();
    c.globalAlpha *= m.dim ? 0.35 : 1;
    c.beginPath(); roundRect(c, bx, by, m.w, m.h, 6 * zz);
    c.fillStyle = 'rgba(48,10,12,0.93)'; c.fill();
    c.lineWidth = m.focused ? 2.4 : 1.6;
    c.strokeStyle = 'rgba(255,90,74,' + (m.now ? 0.75 + 0.25 * pulse(5.5) : 0.8) + ')';
    c.stroke();
    let x = bx + m.pad;
    const midY = by + m.h / 2;
    for (let i = 0; i < m.parts.length; i++) {
      const p = m.parts[i];
      if (p.kind === 'more') {
        label(c, '+' + p.n, x + fs * 0.6, midY + 0.5, fs, '#ffd76a', { strokeWidth: 2.4 });
        x += fs * 1.4;
        continue;
      }
      drawGlyph(c, '⏳', x + ic * 0.4, midY, ic * 0.78);
      if (p.it.delay > 1) label(c, String(p.it.delay), x + ic * 0.85 + (p.dl - ic * 0.85) / 2, midY + 0.5, fs, '#ffcf7a', { strokeWidth: 2.6 });
      x += p.dl;
      drawGlyph(c, p.it.icon || '⚔️', x + ic / 2, midY, ic * 0.9);
      x += ic + 1;
      if (p.txt) { label(c, p.txt, x + p.tw / 2, midY + 0.5, fs, p.it.unknown ? '#ffd76a' : '#ffffff', { strokeWidth: 2.6 }); x += p.tw; }
      x += 4 * zz;
    }
    c.restore();
  }

  /** v2 turn marker: a small bouncing chevron above the acting unit's widget (when nothing else is stacked there). */
  function turnChevron(c, x, y, z, foe) {
    const b = Math.sin(time * 5) * 2.2 * z;
    const s = 6.5 * z;
    c.beginPath();
    c.moveTo(x - s, y - s * 1.1 + b); c.lineTo(x + s, y - s * 1.1 + b); c.lineTo(x, y + b); c.closePath();
    c.fillStyle = foe ? '#ff6a52' : '#ffd76a'; c.fill();
    c.lineWidth = 1.6; c.strokeStyle = 'rgba(20,8,8,0.9)'; c.stroke();
  }

  // Preview badge ("-9" + skull when lethal, "+4", or text) from overlay.previews[unitId].
  function measureBadge(F, c, d, z) {
    const prev = F.ov && F.ov.previews ? F.ov.previews[d.u.id] : null;
    if (!prev || typeof prev !== 'object') return null;
    let txt = '', bg = '#6b3fa0';
    if (prev.dmg > 0) { txt = '-' + prev.dmg; bg = prev.lethal ? '#8e0f0f' : '#c62828'; }
    else if (prev.heal > 0) { txt = '+' + prev.heal; bg = '#2e8b45'; }
    if (prev.text) txt = txt ? txt + ' ' + prev.text : String(prev.text);
    if (!txt && !prev.lethal) return null;
    const zz = z * (1 + 0.06 * pulse(7));
    const fs = Math.round(13 * zz);
    c.font = 'bold ' + fs + 'px ' + FONT;
    const skullW = prev.lethal ? fs * 1.15 : 0;
    const tw = c.measureText(txt).width;
    return { w: tw + skullW + 12 * zz, h: fs + 7 * zz, txt: txt, bg: bg, lethal: !!prev.lethal, skullW: skullW, tw: tw, fs: fs, zz: zz };
  }
  function drawBadge(c, m, bx, by) {
    c.beginPath(); roundRect(c, bx, by, m.w, m.h, m.h / 2);
    c.fillStyle = m.bg; c.fill();
    c.lineWidth = 1.6; c.strokeStyle = m.lethal ? '#ffd76a' : 'rgba(255,255,255,0.85)'; c.stroke();
    if (m.lethal) drawGlyph(c, '💀', bx + 6 * m.zz + m.skullW / 2, by + m.h / 2, m.fs);
    label(c, m.txt, bx + 6 * m.zz + m.skullW + m.tw / 2, by + m.h / 2 + 0.5, m.fs, '#ffffff', { strokeWidth: 2.6 });
  }

  /**
   * Stack colliding bubble/badge columns upward (front units keep their spot). `obstacles` ({x, y, w, h} boxes,
   * e.g. HP widgets) are avoided but not moved. Returns the stacks, front first.
   */
  function layoutStacks(stacks, obstacles) {
    stacks.sort(function (a, b) { return b.ay - a.ay; });
    const placed = (obstacles || []).slice();
    for (let i = 0; i < stacks.length; i++) {
      const s = stacks[i];
      s.x = clamp(s.ax - s.w / 2, 4, W - s.w - 4);
      s.y = s.ay - s.h;
      for (let guard = 0; guard < 24; guard++) {
        let hit = null;
        for (let k = 0; k < placed.length; k++) {
          const o = placed[k];
          if (s.x < o.x + o.w + 2 && s.x + s.w + 2 > o.x && s.y < o.y + o.h + 2 && s.y + s.h + 2 > o.y) { hit = o; break; }
        }
        if (!hit) break;
        s.y = hit.y - s.h - 3;
      }
      placed.push(s);
    }
    return stacks;
  }

  /**
   * Screen box of a unit's HP widget (HP number pill + bar + Block badge + status row, or the DOWNED label) at its
   * natural spot above the head. `dy` (<= 0) is filled in by layoutWidgets.
   */
  function measureWidget(F, c, d) {
    const u = d.u;
    const z = clamp(F.zoom, 0.65, 1.5);
    const top = d.sy - (d.mh + 4 + d.lift) * F.zoom;   // follows jumps and throws
    const w = { d: d, z: z, top: top, dy: 0 };
    if (d.downed) {
      w.x0 = d.sx - 27 * z; w.x1 = d.sx + 27 * z;
      w.y0 = top + 4 * F.zoom - 9 * z; w.y1 = top + 18 * F.zoom + 7 * z;
      return w;
    }
    const boss = u.tier === 'boss';
    w.bw = Math.round((boss ? 60 : 36) * z);
    w.bh = Math.max(4, Math.round((boss ? 6 : 5) * z));
    w.bx = Math.round(d.sx - w.bw / 2);
    w.by = Math.round(top - w.bh - 2);
    const fs = Math.max(8, Math.round(9.5 * z));
    c.font = 'bold ' + fs + 'px ' + FONT;
    const tw = c.measureText(String(Math.max(0, Math.round(u.vis && u.vis.hp !== undefined ? u.vis.hp : u.hp)))).width;
    const block = Math.max(0, u.vis && u.vis.block !== undefined ? u.vis.block : (u.block || 0));
    w.x0 = w.bx - tw - 9;
    w.x1 = w.bx + w.bw + (block > 0 ? 15 * z : 2);
    w.y0 = w.by - 2;
    w.y1 = w.by + w.bh + 2;
    const sts = (u.statuses || []).filter(function (s) { return s && s.id; }).length;
    if (sts) {
      const size = Math.round(13 * z), n = Math.min(6, sts);
      const total = n * size + (n - 1) * 2 + (sts > 6 ? size : 0);
      w.x0 = Math.min(w.x0, d.sx - total / 2 - 2);
      w.x1 = Math.max(w.x1, d.sx + total / 2 + 2);
      w.y0 = w.by - 6 - size;
    }
    return w;
  }

  /**
   * Small units standing right behind d (a pixie behind Marwyn, a rat behind a bugbear) whose bodies d's widget box
   * would cover: their sprite boxes, so the widget rises above them instead of hiding them.
   */
  function bodiesUnder(w, list, zoom) {
    const out = [];
    for (let k = 0; k < list.length; k++) {
      const o = list[k], e = o.d;
      if (o === w || e.downed || e.alpha < 0.3 || e.sy >= w.d.sy || e.mh > w.d.mh * 0.8) continue;
      const b = spriteBox(e, zoom);
      const ix = Math.min(w.x1, b.x1) - Math.max(w.x0, b.x0), iy = Math.min(w.y1, b.y1) - Math.max(w.y0, b.y0);
      if (ix > 0 && iy > 0 && ix * iy >= 0.3 * (b.x1 - b.x0) * (b.y1 - b.y0)) out.push({ x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1, body: true });
    }
    return out;
  }

  /**
   * Keep every HP widget readable: front units (lower on screen) keep their spot, a widget that would overlap one
   * already placed rises just above it (at most a few rows, so it never drifts far from its unit). A widget also
   * rises over the bodies of small units right behind its unit, so it never hides them.
   */
  function layoutWidgets(list, zoom) {
    const order = list.slice().sort(function (a, b) { return b.d.sy - a.d.sy || a.d.sx - b.d.sx; });
    const placed = [];
    for (let i = 0; i < order.length; i++) {
      const w = order[i];
      const limit = -4 * (w.y1 - w.y0 + 2);
      const avoid = placed.concat(bodiesUnder(w, list, zoom || 1));
      let dy = 0;
      for (let guard = 0; guard < 16; guard++) {
        let hit = null;
        for (let k = 0; k < avoid.length; k++) {
          const o = avoid[k];
          if (w.x0 < o.x1 + 1 && w.x1 + 1 > o.x0 && w.y0 + dy < o.y1 + 1 && w.y1 + dy + 1 > o.y0) { hit = o; break; }
        }
        if (!hit) break;
        const next = hit.y0 - w.y1 - 2;
        if (next < limit) break;
        dy = next;
        if (hit.body) w.overBody = true;
      }
      w.dy = dy;
      placed.push({ id: w.d.u.id, x0: w.x0, x1: w.x1, y0: w.y0 + dy, y1: w.y1 + dy, dy: dy });
    }
    return placed;
  }

  function drawUnitWidgets(F) {
    const c = F.ctx;
    setScreenTransform(F);
    const st = F.st;
    const playerPhase = !!(st && st.phase === 'player');
    const stacks = [];
    const widgets = [];
    for (let i = 0; i < F.unitDraws.length; i++) {
      const d = F.unitDraws[i];
      if (d.alpha < 0.25 || d.sx === undefined) continue;
      widgets.push(measureWidget(F, c, d));
    }
    const boxes = layoutWidgets(widgets, F.zoom);
    F.widgetBoxes = boxes;
    for (let i = 0; i < widgets.length; i++) {
      const wg = widgets[i], d = wg.d, u = d.u, z = wg.z, dy = wg.dy;
      const top = wg.top;
      const foot = w2s(F, d.gwx, d.gwy);
      const a = Math.min(1, d.alpha * 1.2);
      c.save();
      c.globalAlpha = a;
      let y = top + dy;
      if (dy < -3) {
        // lifted out of a crowd: a thin leader keeps it attached to its unit (off-centre when it hops over a small
        // unit standing behind, so the line does not cut through that unit)
        const from = d.downed ? wg.y1 + dy : wg.by + wg.bh + 2 + dy;
        const lx = wg.overBody && !d.downed ? d.sx + wg.bw / 2 - 3 : d.sx;
        c.beginPath(); c.moveTo(lx, from); c.lineTo(lx, top + 2);
        c.lineWidth = 3; c.strokeStyle = 'rgba(12,6,8,0.55)'; c.stroke();
        c.lineWidth = 1.2; c.strokeStyle = u.side === 'hero' ? 'rgba(150,235,160,0.85)' : 'rgba(255,150,130,0.85)'; c.stroke();
      }
      if (d.downed) {
        label(c, 'DOWNED', d.sx, top + 18 * F.zoom + dy, Math.round(10 * z), '#ff8a7a');
        if (u.side === 'hero') drawGlyph(c, '🆘', d.sx, top + 4 * F.zoom + dy, 14 * z);
      } else {
        hpBar(F, c, d, wg.bx, wg.by + dy, wg.bw, wg.bh, z);
        y = statusRow(F, c, u, d.sx, wg.by + dy - 4, z);
        // v2: AP exists only on the acting turn (other heroes get theirs at their own turn start)
        if (playerPhase && u.side === 'hero' && !d.feetHidden && inCurrentTurn(st, u)) apPips(c, u, foot.x, foot.y + 11 * F.zoom, z);
      }
      c.restore();
      const bubble = F.showTele && !d.downed ? measureBubble(F, c, d, z) : null;
      const badge = measureBadge(F, c, d, z);
      if (!bubble && !badge && F.ov && F.ov.turnUnitId === u.id && !d.downed) {
        c.save(); c.globalAlpha = a; turnChevron(c, d.sx, y - 3 * z, z, u.side !== 'hero'); c.restore();
      }
      if (bubble || badge) {
        const gap = 3 * z;
        stacks.push({
          d: d, bubble: bubble, badge: badge, ax: d.sx, ay: y - (bubble ? 5 * z : 0), alpha: a,
          w: Math.max(bubble ? bubble.w : 0, badge ? badge.w : 0),
          h: (bubble ? bubble.h : 0) + (badge ? badge.h : 0) + (bubble && badge ? gap : 0), gap: gap,
        });
      }
    }
    // bubbles and preview badges also steer clear of the other units' HP widgets
    const obstacles = boxes.map(function (b) { return { x: b.x0, y: b.y0, w: b.x1 - b.x0, h: b.y1 - b.y0 }; });
    const placed = layoutStacks(stacks, obstacles);
    for (let i = placed.length - 1; i >= 0; i--) {
      const s = placed[i];
      c.save();
      c.globalAlpha = s.alpha;
      let y = s.y + s.h;
      if (s.bubble) {
        const bx = s.ax - s.bubble.w / 2, by = y - s.bubble.h;
        const tipY = s.ay + 5 * s.bubble.zz;
        c.beginPath();
        if (tipY - (by + s.bubble.h) > 3) {
          // displaced: a leader line down to the unit
          c.moveTo(s.ax, by + s.bubble.h); c.lineTo(s.ax, tipY);
          c.strokeStyle = 'rgba(255,90,74,' + (s.bubble.dim ? 0.3 : 0.8) + ')'; c.lineWidth = 1.4; c.stroke();
        } else {
          c.moveTo(s.ax - 4 * s.bubble.zz, by + s.bubble.h); c.lineTo(s.ax, tipY); c.lineTo(s.ax + 4 * s.bubble.zz, by + s.bubble.h); c.closePath();
          c.fillStyle = 'rgba(48,10,12,' + (s.bubble.dim ? 0.33 : 0.93) + ')'; c.fill();
        }
        drawBubble(c, s.bubble, clamp(bx, 4, W - s.bubble.w - 4), by);
        y = by - s.gap;
      }
      if (s.badge) drawBadge(c, s.badge, clamp(s.ax - s.badge.w / 2, 4, W - s.badge.w - 4), y - s.badge.h);
      c.restore();
    }
    for (let i = 0; i < F.objList.length; i++) {
      const o = F.objList[i], obj = o.obj;
      if (!(obj.maxHp > 0) || !(obj.hp > 0) || obj.hp >= obj.maxHp) continue;
      const p = w2s(F, o.cx, o.cy - o.h - 6);
      const z = clamp(F.zoom, 0.65, 1.5), w = Math.round(24 * z), h = Math.max(3, Math.round(4 * z));
      c.beginPath(); roundRect(c, p.x - w / 2 - 1.5, p.y - 1.5, w + 3, h + 3, 2); c.fillStyle = 'rgba(12,6,8,0.85)'; c.fill();
      c.fillStyle = '#3b2023'; c.fillRect(p.x - w / 2, p.y, w, h);
      c.fillStyle = '#e0a23a'; c.fillRect(p.x - w / 2, p.y, w * clamp(obj.hp / obj.maxHp, 0, 1), h);
    }
  }

  // ======================================================================================================
  // Overlay contract (HUD writes, renderer reads every frame) + telegraphs
  // ======================================================================================================
  function defaultOverlay() {
    return {
      selectedId: null, hover: null, moveTiles: [], path: [], pathHazard: false, targetTiles: [], areaTiles: [],
      previews: {}, deployTiles: [], interactTiles: [], showIntents: true, focusIntentUnitId: null,
      // v2: whose turn the HUD shows (turn ring), threat shading (hold Alt), one inspected enemy's reach
      turnUnitId: null, threat: null, reach: null,
    };
  }

  /** overlay.threat = { tiles: [{ x, y, dmg, lethal }], ref } → per-tile damage, lethal flags and the region set. */
  function threatArrays(F, th) {
    if (!th || !Array.isArray(th.tiles) || !th.tiles.length) return null;
    const n = F.gw * F.gh;
    const out = { d: new Float32Array(n), l: new Uint8Array(n), set: new Uint8Array(n), n: 0 };
    for (let i = 0; i < th.tiles.length; i++) {
      const p = th.tiles[i];
      if (!p) continue;
      const x = p.x | 0, y = p.y | 0, dmg = +p.dmg;
      if (x < 0 || y < 0 || x >= F.gw || y >= F.gh || !(dmg > 0)) continue;
      const k = y * F.gw + x;
      if (!out.set[k]) out.n++;
      out.set[k] = 1;
      out.d[k] = Math.max(out.d[k], dmg);
      if (p.lethal) out.l[k] = 1;
    }
    return out.n ? out : null;
  }

  function tileSet(F, arr) {
    const set = new Uint8Array(F.gw * F.gh);
    if (Array.isArray(arr)) {
      for (let i = 0; i < arr.length; i++) {
        const p = arr[i];
        if (!p) continue;
        const x = p.x | 0, y = p.y | 0;
        if (x >= 0 && y >= 0 && x < F.gw && y < F.gh) set[y * F.gw + x] = 1;
      }
    }
    return set;
  }

  function buildOverlay(F) {
    const o = R.overlay || {};
    const th = threatArrays(F, o.threat);
    const reach = o.reach && Array.isArray(o.reach.tiles) && o.reach.tiles.length ? tileSet(F, o.reach.tiles) : null;
    F.ov = {
      move: tileSet(F, o.moveTiles), target: tileSet(F, o.targetTiles), area: tileSet(F, o.areaTiles),
      deploy: tileSet(F, o.deployTiles), interact: tileSet(F, o.interactTiles),
      selectedId: o.selectedId === undefined ? null : o.selectedId, hover: o.hover || null,
      path: Array.isArray(o.path) ? o.path : [], pathHazard: !!o.pathHazard,
      previews: o.previews && typeof o.previews === 'object' ? o.previews : {},
      showIntents: o.showIntents !== false, focusIntentUnitId: o.focusIntentUnitId || null,
      turnUnitId: o.turnUnitId || null,
      threatSet: th ? th.set : null, threatD: th ? th.d : null, threatL: th ? th.l : null, threatN: th ? th.n : 0,
      threatRef: Math.max(6, +(o.threat && o.threat.ref) || 20),
      reach: reach,
    };
  }

  /** Call engine code that may run content (area fns); a failing key falls back silently after one warning. */
  function safeGet(key, label, fn) {
    if (brokenPainters[key]) return null;
    try { return fn(); } catch (e) {
      brokenPainters[key] = true;
      DD.warn('Error in render ' + label + ': ' + (e && e.stack ? e.stack : e));
      return null;
    }
  }

  function findUnit(st, id) {
    const us = (st && st.units) || [];
    for (let i = 0; i < us.length; i++) if (us[i] && us[i].id === id) return us[i];
    return null;
  }

  /** Intent tiles without DD.AI (or when it fails): follows the §4.5 anchor semantics. */
  function fallbackIntentTiles(st, u, it) {
    const out = [];
    if (it.anchor === 'ground') {
      if (Array.isArray(it.tiles) && it.tiles.length) it.tiles.forEach(function (p) { if (p) out.push({ x: p.x, y: p.y }); });
      else if (it.abs) out.push({ x: it.abs.x, y: it.abs.y });
    } else if (it.anchor === 'unit') {
      const tu = findUnit(st, it.unitId);
      if (tu && !tu.dead) out.push({ x: tu.x, y: tu.y });
      else if (it.abs) out.push({ x: it.abs.x, y: it.abs.y });
    } else if (Array.isArray(it.tiles) && it.tiles.length) {
      it.tiles.forEach(function (p) { if (p) out.push({ x: u.x + (p.dx !== undefined ? p.dx : p.x || 0), y: u.y + (p.dy !== undefined ? p.dy : p.y || 0) }); });
    } else if (it.rel) {
      out.push({ x: u.x + (it.rel.dx || 0), y: u.y + (it.rel.dy || 0) });
    }
    return out;
  }

  function hasStatus(u, id) {
    const s = u.statuses || [];
    for (let i = 0; i < s.length; i++) if (s[i] && s[i].id === id) return true;
    return false;
  }

  let stateVersion = 0;
  const teleCache = { st: null, version: -1, at: -10, data: [] };

  /** Wind-ups in the logical state (v2: every stored intent is one): [{ u, list: [{ id, tiles, delay, label, dmg… }] }]. */
  function rawTelegraphs(st) {
    if (teleCache.st === st && teleCache.version === stateVersion && time - teleCache.at < 0.5) return teleCache.data;
    const out = [];
    const AI = DD.AI;
    const units = st.units || [];
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (!u || u.dead || u.downed || !Array.isArray(u.intents) || !u.intents.length) continue;
      const entry = { u: u, list: [] };
      for (let k = 0; k < u.intents.length; k++) {
        const it = u.intents[k];
        if (!it) continue;
        const sk = it.skillId || '?';
        let tiles = null, desc = null;
        if (AI && typeof AI.intentTiles === 'function') tiles = safeGet('intentTiles:' + sk, 'DD.AI.intentTiles(' + sk + ')', function () { return AI.intentTiles(u, it); });
        if (!Array.isArray(tiles)) tiles = fallbackIntentTiles(st, u, it);
        if (AI && typeof AI.describe === 'function') desc = safeGet('describe:' + sk, 'DD.AI.describe(' + sk + ')', function () { return AI.describe(u, it); });
        const skill = DD.getSkill ? DD.getSkill(it.skillId) : null;
        const dmg = desc && desc.dmg !== undefined && desc.dmg !== null ? desc.dmg : it.dmg;
        const left = it.turnsLeft > 0 ? it.turnsLeft : it.delay > 0 ? it.delay : 1;
        entry.list.push({
          id: it.id || null, tiles: tiles, delay: left, anchor: it.anchor || 'self', unitId: it.unitId,
          icon: (desc && desc.icon) || it.icon || (skill && skill.icon) || '⚔️',
          dmg: typeof dmg === 'number' && isFinite(dmg) ? Math.round(dmg) : 0,
          label: (desc && desc.label) || it.label || (skill && skill.name) || '',
          unknown: !!(desc && desc.uncertain) || hasStatus(u, 'dazzled') || hasStatus(u, 'confused') ||
            !!(skill && Array.isArray(skill.tags) && skill.tags.indexOf('random') >= 0),
        });
      }
      if (entry.list.length) out.push(entry);
    }
    teleCache.st = st; teleCache.version = stateVersion; teleCache.at = time; teleCache.data = out;
    return out;
  }

  /**
   * The wind-ups to draw this frame, in step with FX playback (the logical state runs ahead of the animation):
   * a wind-up whose 'windup' announcement is still queued is hidden; one that already resolved stays on screen until
   * playback reaches its owner's turn ('turn' marker) — then it lands. FX idle: exactly the logical state.
   */
  const shownWU = { st: null, list: [] };
  function shownWindups(st) {
    const live = rawTelegraphs(st);
    const FX = DD.FX;
    const busy = !!(FX && typeof FX.busy === 'function' && FX.busy() && Array.isArray(FX.queue));
    if (!busy || shownWU.st !== st) { shownWU.st = st; shownWU.list = live; return live; }
    const pendingWind = {}, pendingTurn = {};
    for (let i = 0; i < FX.queue.length; i++) {
      const e = FX.queue[i];
      if (!e) continue;
      if (e.type === 'windup' && e.intentId) pendingWind[e.intentId] = 1;
      else if (e.type === 'turn' && e.unitId !== undefined) pendingTurn[e.unitId] = 1;
    }
    const out = [], liveIds = {}, byUnit = {};
    live.forEach(function (entry) {
      const list = entry.list.filter(function (it) { if (it.id) liveIds[it.id] = 1; return !(it.id && pendingWind[it.id]); });
      if (list.length) { const e = { u: entry.u, list: list }; out.push(e); byUnit[entry.u.id] = e; }
    });
    shownWU.list.forEach(function (entry) {
      const u = entry.u;
      const waiting = pendingTurn[u.id] || (u.ownerId && pendingTurn[u.ownerId]);
      const ghosts = waiting ? entry.list.filter(function (it) { return it.id && !liveIds[it.id]; }) : [];
      if (!ghosts.length) return;
      if (byUnit[u.id]) byUnit[u.id].list = byUnit[u.id].list.concat(ghosts);
      else { const e = { u: u, list: ghosts }; out.push(e); byUnit[u.id] = e; }
    });
    shownWU.list = out;
    return out;
  }

  function computeTelegraphs(F) {
    F.tele = null; F.teleRaw = []; F.intentInfo = {};
    const st = F.st;
    // v2: wind-ups stay visible in every phase (deployment has none), in step with playback (shownWindups)
    F.showTele = !!(st && F.ov.showIntents && !(st.result));
    if (!F.showTele) return;
    const raw = shownWindups(st);
    if (!raw.length) return;
    const n = F.gw * F.gh;
    const tele = new Array(n);
    const focus = F.ov.focusIntentUnitId;
    for (let i = 0; i < raw.length; i++) {
      const e = raw[i];
      const fa = !focus ? 1 : focus === e.u.id ? 1.25 : 0.28;
      F.intentInfo[e.u.id] = e.list;
      for (let k = 0; k < e.list.length; k++) {
        const it = e.list[k];
        for (let j = 0; j < it.tiles.length; j++) {
          const p = it.tiles[j];
          if (!p || p.x < 0 || p.y < 0 || p.x >= F.gw || p.y >= F.gh) continue;
          const idx = (p.y | 0) * F.gw + (p.x | 0);
          const cell = tele[idx] || (tele[idx] = { a: 0, n: 0, now: false, delayed: false });
          cell.n++;
          cell.a = Math.max(cell.a, fa);
          // lands at its owner's next turn = "now"; 2+ of its turns away = "later" (calmer)
          if (it.delay > 1) cell.delayed = true; else cell.now = true;
        }
      }
    }
    F.tele = tele;
    F.teleRaw = raw;
  }

  function regionOutline(F, c, tiles, inset) {
    const keys = new Set();
    for (let i = 0; i < tiles.length; i++) { const p = tiles[i]; if (p) keys.add((p.y | 0) * F.gw + (p.x | 0)); }
    const hw = HW - inset, hh = HH - inset / 2;
    const has = function (x, y, top) {
      if (x < 0 || y < 0 || x >= F.gw || y >= F.gh || !keys.has(y * F.gw + x)) return false;
      return Math.abs(topLevel(F, F.tiles[y * F.gw + x]) - top) < 0.01;
    };
    let pts = 0;
    keys.forEach(function (k) {
      const x = k % F.gw, y = (k - x) / F.gw;
      const t = F.tiles[k];
      if (!t) return;
      const top = topLevel(F, t);
      const w = Iso.toWorld(x, y, top);
      if (!has(x, y - 1, top)) { c.moveTo(w.x, w.y - hh); c.lineTo(w.x + hw, w.y); pts++; }
      if (!has(x + 1, y, top)) { c.moveTo(w.x + hw, w.y); c.lineTo(w.x, w.y + hh); pts++; }
      if (!has(x, y + 1, top)) { c.moveTo(w.x, w.y + hh); c.lineTo(w.x - hw, w.y); pts++; }
      if (!has(x - 1, y, top)) { c.moveTo(w.x - hw, w.y); c.lineTo(w.x, w.y - hh); pts++; }
    });
    return pts;
  }

  function unitDrawById(F, id) {
    for (let i = 0; i < F.unitDraws.length; i++) if (F.unitDraws[i].u.id === id) return F.unitDraws[i];
    return null;
  }

  function drawTelegraphLines(F, c) {
    if (!F.showTele || !F.teleRaw.length) return;
    const focus = F.ov.focusIntentUnitId;
    F.teleBadges = [];
    for (let i = 0; i < F.teleRaw.length; i++) {
      const e = F.teleRaw[i];
      const focused = focus === e.u.id;
      const a = !focus ? 0.9 : focused ? 1 : 0.25;
      for (let k = 0; k < e.list.length; k++) {
        const it = e.list[k];
        if (!it.tiles.length) continue;
        c.beginPath();
        if (regionOutline(F, c, it.tiles, 1.5)) {
          c.lineCap = 'round';
          c.strokeStyle = 'rgba(30,0,0,' + 0.6 * a + ')'; c.lineWidth = focused ? 5 : 4.2; c.stroke();
          c.strokeStyle = 'rgba(255,' + (it.delay > 1 ? 112 : 64) + ',52,' + a * (0.8 + 0.2 * pulse(5.5)) + ')';
          c.lineWidth = focused ? 3 : 2.4;
          c.stroke();
          c.strokeStyle = 'rgba(255,232,210,' + a * (0.45 + 0.35 * pulse(5.5)) + ')';
          c.lineWidth = 0.9;
          c.stroke();
        }
        // ⏳ label · damage badge at the area's centre (one per wind-up)
        let sx = 0, sy = 0, sh = 0, n = 0;
        it.tiles.forEach(function (p) { const t = gridTile(F, p.x, p.y); if (t) { sx += p.x; sy += p.y; sh += topLevel(F, t); n++; } });
        if (n) {
          const w = Iso.toWorld(sx / n, sy / n, sh / n);
          F.teleBadges.push({ wx: w.x, wy: w.y, delay: it.delay, a: a, label: it.label, dmg: it.dmg, unknown: it.unknown, icon: it.icon, focused: focused });
        }
        if (it.anchor === 'unit' && it.unitId) {
          const src = unitDrawById(F, e.u.id), dst = unitDrawById(F, it.unitId);
          if (src && dst) {
            const y0 = src.wy - 22 * src.scale, y1 = dst.wy - 20 * dst.scale;
            c.save();
            c.setLineDash([6, 5]);
            c.lineDashOffset = -time * 22;
            c.beginPath(); c.moveTo(src.wx, y0); c.lineTo(dst.wx, y1);
            c.strokeStyle = 'rgba(30,0,0,' + 0.6 * a + ')'; c.lineWidth = 3.4; c.stroke();
            c.strokeStyle = 'rgba(255,90,70,' + a + ')'; c.lineWidth = 1.6; c.stroke();
            c.restore();
            const p = pulse(6);
            c.beginPath(); c.ellipse(dst.gwx, dst.gwy, (15 + 3 * p) * dst.scale, (7.5 + 1.5 * p) * dst.scale, 0, 0, TAU);
            c.strokeStyle = 'rgba(255,70,55,' + a + ')'; c.lineWidth = 1.8; c.stroke();
            c.beginPath();
            const r = 18 * dst.scale;
            c.moveTo(dst.gwx - r - 4, dst.gwy); c.lineTo(dst.gwx - r + 4, dst.gwy);
            c.moveTo(dst.gwx + r - 4, dst.gwy); c.lineTo(dst.gwx + r + 4, dst.gwy);
            c.stroke();
          }
        }
      }
    }
  }

  /** Short badge text: the wind-up's name, cut to fit. */
  function badgeLabel(s) {
    s = String(s || '').trim();
    return s.length > 22 ? s.slice(0, 21).trim() + '…' : s;
  }

  /** Wind-up badges: "⏳ Meteor of Regression 14" (⏳2 when it lands in 2+ of its owner's turns). Stacked if they meet. */
  function drawTeleBadges(F) {
    if (!F.teleBadges || !F.teleBadges.length) return;
    const c = F.ctx;
    setScreenTransform(F);
    const z = clamp(F.zoom, 0.75, 1.4);
    const fs = Math.round(11.5 * z), bh = Math.round(19 * z);
    const placed = [];
    F.teleBadges.forEach(function (b) {
      const p = w2s(F, b.wx, b.wy);
      c.font = 'bold ' + fs + 'px ' + FONT;
      const name = badgeLabel(b.label);
      const dmg = (b.unknown ? '?' : '') + (b.dmg > 0 ? String(b.dmg) : '');
      const nameW = name ? c.measureText(name).width + 6 * z : 0;
      const dmgW = dmg ? c.measureText(dmg).width + 10 * z : 0;
      const turnW = b.delay > 1 ? c.measureText(String(b.delay)).width + 2 : 0;
      const bw = Math.round(8 * z + 15 * z + turnW + nameW + dmgW + 4 * z);
      let x = Math.round(clamp(p.x - bw / 2, 4, W - bw - 4)), y = Math.round(p.y - bh / 2);
      for (let guard = 0; guard < 8; guard++) {
        const hit = placed.filter(function (o) { return x < o.x + o.w + 2 && x + bw + 2 > o.x && y < o.y + o.h + 2 && y + bh + 2 > o.y; })[0];
        if (!hit) break;
        y = hit.y - bh - 3;
      }
      placed.push({ x: x, y: y, w: bw, h: bh });
      c.save();
      c.globalAlpha = Math.min(1, b.a + 0.1);
      c.beginPath(); roundRect(c, x, y, bw, bh, bh / 2);
      c.fillStyle = 'rgba(58,8,8,0.93)'; c.fill();
      c.lineWidth = b.focused ? 2.2 : 1.5;
      c.strokeStyle = 'rgba(255,110,90,' + (0.75 + 0.25 * pulse(5.5)) + ')'; c.stroke();
      let cx = x + 8 * z;
      drawGlyph(c, '⏳', cx + 6 * z, y + bh / 2, 13 * z);
      cx += 15 * z;
      if (turnW) { label(c, String(b.delay), cx + turnW / 2, y + bh / 2 + 0.5, fs, '#ffcf7a', { strokeWidth: 2.4 }); cx += turnW; }
      if (name) { label(c, name, cx + nameW / 2, y + bh / 2 + 0.5, fs, '#ffe6d8', { strokeWidth: 2.4 }); cx += nameW; }
      if (dmg) {
        c.beginPath(); roundRect(c, cx, y + 2.5 * z, dmgW - 2 * z, bh - 5 * z, (bh - 5 * z) / 2);
        c.fillStyle = '#c62828'; c.fill();
        label(c, dmg, cx + (dmgW - 2 * z) / 2, y + bh / 2 + 0.5, fs, '#ffffff', { strokeWidth: 2.2 });
      }
      c.restore();
    });
  }

  function drawPath(F, c) {
    const ov = F.ov;
    if (!ov.path || !ov.path.length) return;
    const pts = [];
    const sel = ov.selectedId !== null ? unitDrawById(F, ov.selectedId) : null;
    if (sel) pts.push([sel.gwx, sel.gwy]);
    for (let i = 0; i < ov.path.length; i++) {
      const p = ov.path[i], t = p && gridTile(F, p.x, p.y);
      if (!t) continue;
      const w = Iso.toWorld(p.x, p.y, topLevel(F, t));
      pts.push([w.x, w.y]);
    }
    if (!pts.length) return;
    const col = ov.pathHazard ? '#ff5a4a' : '#a6d6ff';
    const end = pts[pts.length - 1];
    c.beginPath(); diamond(c, end[0], end[1], HW - 6, HH - 3);
    c.fillStyle = rgba(col, 0.22); c.fill();
    c.lineWidth = 2; c.strokeStyle = col; c.stroke();
    if (pts.length < 2) return;
    const spacing = 7, off = (time * 22) % spacing;
    let carry = spacing - off;
    c.fillStyle = col;
    c.strokeStyle = 'rgba(10,15,30,0.85)';
    c.lineWidth = 1;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      let d = carry;
      while (d < len - 4 || (i + 2 < pts.length && d < len)) {
        const k = d / len;
        c.beginPath(); c.arc(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, 2.1, 0, TAU);
        c.fill(); c.stroke();
        d += spacing;
      }
      carry = d - len;
    }
    const a = pts[pts.length - 2];
    const ang = Math.atan2(end[1] - a[1], end[0] - a[0]);
    c.save();
    c.translate(end[0], end[1]);
    c.rotate(ang);
    c.beginPath(); c.moveTo(3, 0); c.lineTo(-8, -6); c.lineTo(-5, 0); c.lineTo(-8, 6); c.closePath();
    c.fillStyle = col; c.fill();
    c.lineWidth = 1.4; c.strokeStyle = 'rgba(10,15,30,0.9)'; c.stroke();
    c.restore();
    if (ov.pathHazard) {
      setScreenTransform(F);
      const p = w2s(F, end[0], end[1] - 26);
      drawGlyph(c, '⚠️', p.x, p.y, 16 * clamp(F.zoom, 0.7, 1.4));
      setWorldTransform(F);
    }
  }

  function drawHover(F, c) {
    const h = F.ov.hover;
    if (!h) return;
    const t = gridTile(F, h.x | 0, h.y | 0);
    if (!t) return;
    const w = Iso.toWorld(t.x, t.y, topLevel(F, t));
    const p = pulse(6);
    c.beginPath(); diamond(c, w.x, w.y, HW, HH);
    c.fillStyle = 'rgba(255,255,255,' + (0.07 + 0.05 * p) + ')'; c.fill();
    const v = [[0, -HH], [HW, 0], [0, HH], [-HW, 0]];
    const k = 0.3;
    c.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = v[(i + 3) % 4], m = v[i], b = v[(i + 1) % 4];
      c.moveTo(w.x + m[0] + (a[0] - m[0]) * k, w.y + m[1] + (a[1] - m[1]) * k);
      c.lineTo(w.x + m[0], w.y + m[1]);
      c.lineTo(w.x + m[0] + (b[0] - m[0]) * k, w.y + m[1] + (b[1] - m[1]) * k);
    }
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.strokeStyle = 'rgba(10,6,8,0.7)'; c.lineWidth = 4; c.stroke();
    c.strokeStyle = 'rgba(255,255,255,' + (0.8 + 0.2 * p) + ')'; c.lineWidth = 2; c.stroke();
  }

  function drawLateWorld(F) {
    const c = F.ctx;
    setWorldTransform(F);
    drawTelegraphLines(F, c);
    drawPath(F, c);
    drawHover(F, c);
  }

  // ======================================================================================================
  // Backdrop, ambient particles, lights, foreground (cosmetic randomness: Math.random is fine here)
  // ======================================================================================================
  const AMBIENT_N = { dust: 46, spores: 38, embers: 56, fog: 9, fireflies: 30 };
  const ambient = { kind: null, list: [] };

  function spawnParticle(kind, anywhere) {
    const p = { x: Math.random(), y: anywhere ? Math.random() : 1.04, ph: Math.random() * TAU, front: Math.random() < 0.28, life: 0 };
    if (kind === 'dust') { p.vx = (Math.random() - 0.5) * 0.01; p.vy = -0.004 - Math.random() * 0.008; p.r = 0.6 + Math.random() * 1.5; p.a = 0.15 + Math.random() * 0.35; p.color = '#ffe9c4'; }
    else if (kind === 'spores') { p.vx = (Math.random() - 0.5) * 0.01; p.vy = -0.008 - Math.random() * 0.012; p.r = 0.9 + Math.random() * 1.6; p.a = 0.3 + Math.random() * 0.4; p.color = Math.random() < 0.5 ? '#c3f07a' : '#9ae8c8'; }
    else if (kind === 'embers') { p.vx = (Math.random() - 0.5) * 0.02; p.vy = -0.03 - Math.random() * 0.05; p.r = 0.7 + Math.random() * 1.6; p.a = 0.5 + Math.random() * 0.5; p.color = Math.random() < 0.6 ? '#ff9a3a' : '#ffd36a'; }
    else if (kind === 'fog') { p.x = anywhere ? Math.random() : -0.3; p.y = 0.25 + Math.random() * 0.75; p.vx = 0.004 + Math.random() * 0.008; p.vy = 0; p.r = 0.16 + Math.random() * 0.2; p.a = 0.05 + Math.random() * 0.05; p.color = '#c8d4e6'; p.front = Math.random() < 0.4; }
    else if (kind === 'fireflies') { p.vx = (Math.random() - 0.5) * 0.02; p.vy = (Math.random() - 0.5) * 0.02; p.r = 1 + Math.random() * 1.2; p.a = 0.7; p.color = '#d8ff7a'; p.y = 0.25 + Math.random() * 0.7; }
    return p;
  }
  function ensureAmbient(kind) {
    if (ambient.kind === kind) return;
    ambient.kind = kind;
    ambient.list = [];
    const n = AMBIENT_N[kind] || 0;
    for (let i = 0; i < n; i++) ambient.list.push(spawnParticle(kind, true));
  }
  function updateAmbient(dt) {
    const k = ambient.kind;
    if (!k) return;
    const sec = Math.min(0.1, dt / 1000);
    for (let i = 0; i < ambient.list.length; i++) {
      const p = ambient.list[i];
      p.life += sec;
      p.x += (p.vx + Math.sin(time * 0.7 + p.ph) * (k === 'fog' ? 0 : 0.004)) * sec;
      p.y += p.vy * sec;
      if (k === 'fireflies') { p.vx += (Math.random() - 0.5) * 0.02 * sec; p.vy += (Math.random() - 0.5) * 0.02 * sec; p.vx = clamp(p.vx, -0.02, 0.02); p.vy = clamp(p.vy, -0.015, 0.015); }
      const out = p.y < -0.05 || p.x < -0.4 || p.x > 1.4 || (k === 'fireflies' && (p.y > 1.05 || p.y < 0.15));
      if (out) ambient.list[i] = spawnParticle(k, k === 'fireflies');
    }
  }
  function drawAmbient(F, front) {
    const k = ambient.kind;
    if (!k || !ambient.list.length) return;
    const c = F.ctx;
    setScreenTransform(F);
    c.save();
    if (k !== 'fog') c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < ambient.list.length; i++) {
      const p = ambient.list[i];
      if (p.front !== front) continue;
      const x = p.x * W, y = p.y * H;
      if (k === 'fog') {
        const r = p.r * Math.max(W, H);
        const g = c.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, rgba(p.color, p.a * (front ? 0.7 : 1))); g.addColorStop(1, rgba(p.color, 0));
        c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
        continue;
      }
      let a = p.a * (0.6 + 0.4 * Math.sin(time * 2 + p.ph));
      if (k === 'fireflies') a = Math.max(0, Math.sin(time * 1.3 + p.ph)) * 0.9;
      if (a <= 0.02) continue;
      const r = p.r * (front ? 1.4 : 1);
      c.beginPath(); c.arc(x, y, r * 2.6, 0, TAU); c.fillStyle = rgba(p.color, a * 0.18); c.fill();
      c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = rgba(p.color, a); c.fill();
    }
    c.restore();
  }

  function drawBackdrop(F) {
    const c = F.ctx;
    setScreenTransform(F);
    const look = F.look;
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, look.bg[0]); g.addColorStop(1, look.bg[1]);
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    if (F.boardCenter) {
      const bc = w2s(F, F.boardCenter.x, F.boardCenter.y);
      const r = Math.max(W, H) * 0.65;
      const rg = c.createRadialGradient(bc.x, bc.y, 0, bc.x, bc.y, r);
      rg.addColorStop(0, rgba(look.tint, 0.2)); rg.addColorStop(0.45, rgba(look.tint, 0.07)); rg.addColorStop(1, rgba(look.tint, 0));
      c.fillStyle = rg;
      c.fillRect(0, 0, W, H);
    }
    ensureAmbient(look.ambient || null);
    drawAmbient(F, false);
  }

  function drawBoardShadow(F) {
    if (!F.bounds) return;
    const c = F.ctx, b = F.bounds;
    setScreenTransform(F);
    const p = w2s(F, (b.minX + b.maxX) / 2, b.maxY - HH);
    const rx = (b.maxX - b.minX) * 0.55 * F.zoom, ry = rx * 0.32;
    const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, rx);
    g.addColorStop(0, 'rgba(0,0,0,0.5)'); g.addColorStop(0.6, 'rgba(0,0,0,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.save(); c.translate(p.x, p.y); c.scale(1, ry / rx); c.translate(-p.x, -p.y);
    c.fillStyle = g; c.beginPath(); c.arc(p.x, p.y, rx, 0, TAU); c.fill();
    c.restore();
    setWorldTransform(F);
  }

  function drawLights(F) {
    if (!F.lights.length) return;
    const c = F.ctx;
    setWorldTransform(F);
    c.save();
    c.globalCompositeOperation = 'lighter';
    const n = Math.min(F.lights.length, 96);
    for (let i = 0; i < n; i++) {
      const L = F.lights[i];
      if (!(L.r > 0) || !(L.a > 0)) continue;
      const g = c.createRadialGradient(L.x, L.y, 0, L.x, L.y, L.r);
      g.addColorStop(0, rgba(L.color, L.a)); g.addColorStop(1, rgba(L.color, 0));
      c.fillStyle = g;
      c.fillRect(L.x - L.r, L.y - L.r, L.r * 2, L.r * 2);
    }
    c.restore();
  }

  function drawForeground(F) {
    const c = F.ctx;
    drawAmbient(F, true);
    setScreenTransform(F);
    const g = c.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.35, W / 2, H * 0.5, Math.max(W, H) * 0.78);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.5)');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
  }

  // ======================================================================================================
  // Title scene: a floating campfire diorama under the stars, registered heroes idling around the fire
  // ======================================================================================================
  const TITLE_TER = ['ggmgggg', 'gggdggw', 'gddddgg', 'mdddddg', 'gddddgg', 'ggdsggg', 'gggssgg'];
  const TITLE_HGT = ['2211112', '1100011', '1000001', '0000000', '0000000', '0000000', '0000000'];
  const TITLE_TMAP = { g: 'grass', d: 'dirt', m: 'moss', s: 'cobble', w: 'water' };
  const TITLE_OBJ = {
    '3,3': 'title_campfire', '0,0': 'tree', '6,0': 'tree', '2,0': 'rock', '5,0': 'chest', '6,3': 'title_tent',
    '0,3': 'title_sign', '0,6': 'bush', '6,6': 'mushroom', '5,5': 'barrel', '1,0': 'bush',
  };
  const TITLE_SLOTS = [[2, 5], [4, 5], [1, 4], [5, 4], [1, 2], [5, 2], [2, 1], [4, 1]];
  const HERO_ORDER = ['zarathor', 'syllamin', 'marbles', 'professor_marbles', 'marwyn', 'ellaria', 'josiah', 'sparrow', 'corelos'];
  let titleState = null, titleHeroKey = '';
  const titleBark = { at: 4, unitId: null, text: '', until: 0 };
  let stars = null;

  Object.assign(OBJ, {
    title_campfire: function (g, obj, t, E) {
      for (let i = 0; i < 9; i++) {
        const a = i * TAU / 9;
        g.ellipse(Math.cos(a) * 16, Math.sin(a) * 8 + 1, 3.8, 2.4, i % 2 ? '#8d8882' : '#a29d95', OUT);
      }
      g.glow(0, -1, 22, '#ff7a2a', 0.8);
      [[-12, 3, 11, -4], [-10, -4, 12, 3]].forEach(function (l) {
        g.line(l[0], l[1], l[2], l[3], OUT, 6.6);
        g.line(l[0], l[1], l[2], l[3], '#6b4424', 4.6);
        g.circle(l[0], l[1], 2.6, '#c99a6a', OUT);
      });
      const c = g.ctx;
      c.save();
      c.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 5; i++) {
        const f = 0.72 + 0.28 * Math.sin(time * (7 + i * 1.7) + i * 1.9);
        flame(c, (i - 2) * 3.6, -1, 5 - Math.abs(i - 2) * 0.8, (26 - Math.abs(i - 2) * 6) * f, Math.sin(time * 3.2 + i) * 3, 0.9);
      }
      for (let i = 0; i < 9; i++) {
        const k = (time * 0.55 + i / 9) % 1;
        c.fillStyle = 'rgba(255,200,100,' + (1 - k) + ')';
        c.fillRect(Math.sin(i * 2.3 + time * 1.4) * (6 + k * 10), -10 - k * 58, 1.6, 1.6);
      }
      c.restore();
      g.line(22, -3, 7, -15, '#5a3a20', 1.4);
      g.ellipse(6.4, -15.6, 2.4, 1.9, '#f6efe0', OUT);
      g.ellipse(5.6, -15.2, 1.1, 0.9, '#6a4a2a');
      light(E, 0, -16, 160, '#ff9a3a', 0.24 + 0.07 * Math.sin(time * 11) * Math.sin(time * 7.3));
    },
    title_tent: function (g) {
      shadowBlob(g, 24, 11);
      const R0 = P(-0.36, 0), R1 = P(0.36, 0);
      const r0 = [R0[0], R0[1] - 27], r1 = [R1[0], R1[1] - 27];
      const S0 = P(-0.4, 0.4), S1 = P(0.4, 0.4), N1 = P(0.4, -0.4);
      g.poly([r0, r1, S1, S0], '#b78d55', OUT);
      const c = g.ctx;
      c.beginPath();
      for (let k = 1; k < 4; k++) { const a = edgeAt(r0[0], r0[1], S0[0], S0[1], k / 4), b = edgeAt(r1[0], r1[1], S1[0], S1[1], k / 4); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); }
      c.strokeStyle = 'rgba(80,50,20,0.3)'; c.lineWidth = 0.8; c.stroke();
      g.poly([r1, S1, N1], '#d9b57c', OUT);
      const mid = [(S1[0] + N1[0]) / 2, (S1[1] + N1[1]) / 2];
      g.poly([[r1[0] * 0.35 + mid[0] * 0.65, r1[1] * 0.35 + mid[1] * 0.65], [S1[0] * 0.6 + mid[0] * 0.4, S1[1] * 0.6 + mid[1] * 0.4], [N1[0] * 0.6 + mid[0] * 0.4, N1[1] * 0.6 + mid[1] * 0.4]], '#2a1a10');
      g.line(r1[0], r1[1], r1[0], r1[1] - 10, '#5a3a20', 1.2);
      g.poly([[r1[0], r1[1] - 10], [r1[0] + 7, r1[1] - 8], [r1[0], r1[1] - 6]], '#d0453a', OUT);
    },
    title_sign: function (g) {
      shadowBlob(g, 8, 4);
      g.line(0, 2, 0, -36, OUT, 4.2); g.line(0, 2, 0, -36, '#7a5530', 2.6);
      g.poly([[-3, -33], [20, -33], [25, -29.5], [20, -26], [-3, -26]], '#a8794a', OUT);
      g.text('DUNGEON', 10, -29.4, 4.6, '#2a1a10', { bold: true });
      g.poly([[3, -23], [-20, -23], [-25, -19.5], [-20, -16], [3, -16]], '#9a6c40', OUT);
      g.text('TAVERN', -10, -19.4, 4.6, '#2a1a10', { bold: true });
      g.poly([[-2, -13], [12, -13], [12, -7], [-2, -7]], '#8a6038', OUT);
      g.text('LOOT?', 5, -9.8, 4, '#2a1a10', { bold: true });
    },
  });

  function titleHeroes() {
    const all = Object.keys((DD.defs && DD.defs.heroes) || {});
    all.sort(function (a, b) {
      const ia = HERO_ORDER.indexOf(a), ib = HERO_ORDER.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    const unlocked = all.filter(function (id) {
      if (!DD.Meta || typeof DD.Meta.isUnlocked !== 'function') return true;
      return !!safeGet('meta:isUnlocked', 'DD.Meta.isUnlocked', function () { return DD.Meta.isUnlocked(id); });
    });
    return (unlocked.length ? unlocked : all).slice(0, TITLE_SLOTS.length);
  }

  function titleDiorama() {
    const heroes = titleHeroes();
    const key = heroes.join(',');
    if (titleState && key === titleHeroKey) return titleState;
    titleHeroKey = key;
    const tiles = [];
    for (let y = 0; y < 7; y++) {
      for (let x = 0; x < 7; x++) {
        const oid = TITLE_OBJ[x + ',' + y];
        tiles.push({ x: x, y: y, h: +TITLE_HGT[y][x], t: TITLE_TMAP[TITLE_TER[y][x]], surface: null, zone: null, tag: null,
          obj: oid ? { id: oid, hp: 0, maxHp: 0, data: {} } : null });
      }
    }
    const units = heroes.map(function (id, i) {
      const s = TITLE_SLOTS[i], h = +TITLE_HGT[s[1]][s[0]];
      return {
        id: 'title_' + id, defId: id, kind: 'hero', side: 'hero', name: id, x: s[0], y: s[1], hp: 1, maxHp: 1,
        statuses: [], flags: {}, facing: (s[0] - s[1]) < 0 ? 1 : -1, dead: false, downed: false, _idle: i * 0.41,
        vis: { x: s[0], y: s[1], h: h, hp: 1, block: 0, alpha: 1, hidden: false, dead: false, downed: false, flash: 0, offX: 0, offY: 0, scale: 1 },
      };
    });
    titleState = { id: 'title', theme: 'title', phase: 'title', round: 0, grid: { w: 7, h: 7, tiles: tiles }, units: units };
    return titleState;
  }

  function drawNightSky(F) {
    const c = F.ctx;
    setScreenTransform(F);
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1f2a4d'); g.addColorStop(0.55, '#0e1124'); g.addColorStop(1, '#05060c');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    if (!stars) {
      stars = [];
      for (let i = 0; i < 150; i++) stars.push({ x: Math.random(), y: Math.random() * 0.72, r: 0.4 + Math.random() * 1.2, ph: Math.random() * TAU, sp: 0.6 + Math.random() * 2 });
    }
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      const a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(time * s.sp + s.ph));
      c.fillStyle = 'rgba(235,240,255,' + a * 0.9 + ')';
      c.fillRect(s.x * W, s.y * H, s.r, s.r);
    }
    const sk = (time % 11) / 1.1;
    if (sk < 1) {
      const x0 = W * 0.15 + sk * W * 0.35, y0 = H * 0.08 + sk * H * 0.12;
      const lg = c.createLinearGradient(x0, y0, x0 - 60, y0 - 20);
      lg.addColorStop(0, 'rgba(255,255,255,' + (1 - sk) + ')'); lg.addColorStop(1, 'rgba(255,255,255,0)');
      c.strokeStyle = lg; c.lineWidth = 1.6; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x0 - 60, y0 - 20); c.stroke();
    }
    const mr = Math.max(18, Math.min(W, H) * 0.05), mx = W * 0.82, my = H * 0.17;
    const mg = c.createRadialGradient(mx, my, mr * 0.5, mx, my, mr * 4);
    mg.addColorStop(0, 'rgba(255,248,220,0.25)'); mg.addColorStop(1, 'rgba(255,248,220,0)');
    c.fillStyle = mg; c.fillRect(mx - mr * 4, my - mr * 4, mr * 8, mr * 8);
    c.beginPath(); c.arc(mx, my, mr, 0, TAU); c.fillStyle = '#f4eed6'; c.fill();
    c.fillStyle = 'rgba(200,190,160,0.5)';
    [[-0.3, -0.2, 0.22], [0.25, 0.1, 0.16], [-0.05, 0.4, 0.12]].forEach(function (k) { c.beginPath(); c.arc(mx + k[0] * mr, my + k[1] * mr, k[2] * mr, 0, TAU); c.fill(); });
    [['#161c38', 0.66, 0.11, 3], ['#0e1228', 0.76, 0.08, 7]].forEach(function (layer) {
      c.beginPath(); c.moveTo(0, H);
      const n = 14;
      for (let i = 0; i <= n; i++) {
        const x = (i / n) * W, peak = Iso.rand(i, layer[3], 3);
        c.lineTo(x, H * (layer[1] - peak * layer[2]));
        if (i < n) c.lineTo(x + W / n / 2, H * (layer[1] + 0.02 - Iso.rand(i, layer[3], 4) * layer[2] * 0.4));
      }
      c.lineTo(W, H); c.closePath();
      c.fillStyle = layer[0]; c.fill();
    });
  }

  function speechBubble(c, text, x, y, maxW) {
    c.font = 'bold 12px ' + FONT;
    const words = String(text).split(/\s+/), lines = [];
    let cur = '';
    for (let i = 0; i < words.length; i++) {
      const test = cur ? cur + ' ' + words[i] : words[i];
      if (c.measureText(test).width > maxW && cur) { lines.push(cur); cur = words[i]; } else cur = test;
    }
    if (cur) lines.push(cur);
    let w = 0;
    lines.forEach(function (l) { w = Math.max(w, c.measureText(l).width); });
    const lh = 15, bw = w + 16, bh = lines.length * lh + 10;
    const bx = clamp(x - bw / 2, 8, W - bw - 8), by = y - bh - 10;
    c.beginPath(); roundRect(c, bx, by, bw, bh, 8);
    c.fillStyle = '#fbf3df'; c.fill();
    c.lineWidth = 2; c.strokeStyle = '#2a1a14'; c.stroke();
    c.beginPath(); c.moveTo(x - 6, by + bh - 1); c.lineTo(x, by + bh + 9); c.lineTo(x + 6, by + bh - 1); c.closePath();
    c.fillStyle = '#fbf3df'; c.fill();
    c.beginPath(); c.moveTo(x - 6, by + bh); c.lineTo(x, by + bh + 9); c.lineTo(x + 6, by + bh); c.stroke();
    c.fillStyle = '#2a1a14'; c.textAlign = 'center'; c.textBaseline = 'middle';
    lines.forEach(function (l, i) { c.fillText(l, bx + bw / 2, by + 5 + lh * i + lh / 2); });
  }

  function updateTitleBark(st) {
    if (time < titleBark.at || !st.units.length) return;
    const u = st.units[Math.floor(Math.random() * st.units.length)];
    const def = DD.getHero ? DD.getHero(u.defId) : null;
    const b = def && def.barks;
    const pool = (b && ((b.idle && b.idle.length && b.idle) || (b.select && b.select.length && b.select))) || null;
    titleBark.at = time + 6 + Math.random() * 4;
    if (!pool) return;
    titleBark.unitId = u.id;
    titleBark.text = String(pool[Math.floor(Math.random() * pool.length)] || '');
    titleBark.until = time + 3.4;
  }

  function drawTitleScene(c, dt) {
    const st = titleDiorama();
    const b = mapBounds(st);
    const zoom = clamp(Math.min(W * 0.52 / (b.maxX - b.minX), H * 0.55 / (b.maxY - b.minY)), 0.55, 2.6);
    const cam = {
      // wide screens: nudge the island right of center to balance the title menu on the left
      x: (b.minX + b.maxX) / 2 - (W >= 1000 ? W * 0.05 : 0) / zoom,
      y: (b.minY + b.maxY) / 2 - (H * 0.1) / zoom + Math.sin(time * 0.6) * 4 / zoom,
      zoom: zoom,
    };
    const F = makeFrame(c, st, dt, cam);
    F.showGrid = false;
    drawNightSky(F);
    ensureAmbient('fireflies');
    buildOverlay(F);
    F.ov.hover = null; F.ov.selectedId = null; F.ov.previews = {};
    F.unitDraws = collectUnits(F);
    F.unitDraws.forEach(function (d) { d.title = true; });
    drawBoardShadow(F);
    setWorldTransform(F);
    drawWorld(F);
    drawLights(F);
    drawForeground(F);
    updateTitleBark(st);
    if (titleBark.unitId && time < titleBark.until) {
      const d = unitDrawById(F, titleBark.unitId);
      if (d && d.sx !== undefined) {
        setScreenTransform(F);
        speechBubble(c, titleBark.text, d.sx, d.sy - 48 * d.scale * F.zoom, 210);
      }
    }
    return F;
  }

  function drawEmptyScene(c) {
    c.setTransform(DPR, 0, 0, DPR, 0, 0);
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1d1218'); g.addColorStop(1, '#07040a');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    const v = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.45)');
    c.fillStyle = v;
    c.fillRect(0, 0, W, H);
  }

  // ======================================================================================================
  // Frame assembly
  // ======================================================================================================
  function normTiles(grid) {
    const tiles = grid.tiles || [];
    if (!tiles.length || (tiles[0] && tiles[0].x !== undefined)) return tiles;
    return tiles.map(function (t, i) { return t ? Object.assign({ x: i % grid.w, y: Math.floor(i / grid.w) }, t) : null; });
  }

  function mapBounds(st) {
    const g = st.grid, tiles = (g && g.tiles) || [];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < tiles.length; i++) {
      const t = tiles[i];
      if (!t) continue;
      const x = t.x !== undefined ? t.x : i % g.w, y = t.y !== undefined ? t.y : Math.floor(i / g.w);
      const w = Iso.toWorld(x, y, (t.h || 0) + terrainStyle(t.t, st.theme).levels);
      if (w.x - HW < minX) minX = w.x - HW;
      if (w.x + HW > maxX) maxX = w.x + HW;
      if (w.y - HH - 30 < minY) minY = w.y - HH - 30;
      const bot = Iso.toWorld(x, y, -SLAB).y + HH;
      if (bot > maxY) maxY = bot;
    }
    if (!isFinite(minX)) return { minX: -100, maxX: 100, minY: -60, maxY: 60 };
    return { minX: minX, maxX: maxX, minY: minY, maxY: maxY };
  }

  function makeFrame(c, st, dt, cam) {
    const F = {
      ctx: c, st: st || null, dt: dt || 0, cam: cam, zoom: cam.zoom, shake: { x: 0, y: 0 },
      lights: [], objList: [], unitDraws: [], teleRaw: [], teleBadges: [], tele: null, intentInfo: {}, showTele: false,
      gw: 0, gh: 0, tiles: [], ov: null,
    };
    F.theme = (st && st.theme) || 'cellar';
    F.look = themeLook(F.theme);
    F.texS = texScale(F.zoom);
    F.showGrid = settings().showGrid !== false;
    if (st && st.grid && st.grid.w > 0 && st.grid.h > 0 && Array.isArray(st.grid.tiles)) {
      F.grid = st.grid;
      F.gw = st.grid.w | 0;
      F.gh = st.grid.h | 0;
      F.tiles = normTiles(st.grid);
      F.bounds = mapBounds(st);
      F.boardCenter = { x: (F.bounds.minX + F.bounds.maxX) / 2, y: (F.bounds.minY + F.bounds.maxY) / 2 };
    }
    return F;
  }

  function makeView(F) {
    return {
      ctx: F.ctx, zoom: F.zoom, t: time, dt: F.dt, width: W, height: H, dpr: DPR,
      camera: F.cam, state: F.st, scene: scene, shake: F.shake,
      toScreen: function (x, y, h) {
        if (h === undefined || h === null) {
          const t = F.gw ? gridTile(F, Math.round(x), Math.round(y)) : null;
          h = t ? (t.h || 0) : 0;
        }
        const w = Iso.toWorld(x, y, h);
        return w2s(F, w.x, w.y);
      },
      toWorld: function (x, y, h) { return Iso.toWorld(x, y, h); },
      /** unit id → its laid-out HP widget box { x0, x1, y0, y1 } in screen px (filled once widgets are drawn). */
      widgets: null,
    };
  }

  /** Painter's pass: per diagonal, all tile blocks, then objects + surface volumes, then units (by height). */
  function drawWorld(F) {
    const c = F.ctx;
    const maxD = F.gw + F.gh - 2;
    const buckets = [];
    for (let i = 0; i < F.unitDraws.length; i++) {
      const d = F.unitDraws[i];
      (buckets[d.diag] = buckets[d.diag] || []).push(d);
    }
    const prof = R.profile && typeof R.profile === 'object' ? R.profile : null;
    let tA = 0;
    for (let dg = 0; dg <= maxD; dg++) {
      const x0 = Math.max(0, dg - (F.gh - 1)), x1 = Math.min(F.gw - 1, dg);
      if (prof) tA = performance.now();
      for (let x = x0; x <= x1; x++) {
        const t = F.tiles[(dg - x) * F.gw + x];
        if (t) drawTile(F, c, t);
      }
      if (prof) { const n = performance.now(); prof['w.tiles'] = (prof['w.tiles'] || 0) + n - tA; tA = n; }
      for (let x = x0; x <= x1; x++) {
        const t = F.tiles[(dg - x) * F.gw + x];
        if (!t || (!t.obj && !t.surface)) continue;
        const w = Iso.toWorld(t.x, t.y, topLevel(F, t));
        if (t.obj) drawObject(F, c, t, w.x, w.y);
        if (t.surface) drawSurfaceVolume(F, c, t, w.x, w.y);
      }
      if (prof) { const n = performance.now(); prof['w.objects'] = (prof['w.objects'] || 0) + n - tA; tA = n; }
      const b = buckets[dg];
      if (b) for (let i = 0; i < b.length; i++) drawUnitBody(F, c, b[i]);
      if (prof) prof['w.units'] = (prof['w.units'] || 0) + performance.now() - tA;
    }
  }

  function callFx(name, view) {
    const FXR = DD.FXRender;
    if (!FXR || typeof FXR[name] !== 'function') return;
    const c = view.ctx;
    c.save();
    c.setTransform(DPR, 0, 0, DPR, 0, 0);
    try { FXR[name](view); } catch (e) { renderError('DD.FXRender.' + name, e); }
    c.restore();
  }

  function drawCombatScene(c, dt, st, cam) {
    const F = makeFrame(c, st, dt, cam);
    if (settings().shake !== false && DD.FXRender && typeof DD.FXRender.shakeOffset === 'function') {
      const s = safeGet('fx:shake', 'DD.FXRender.shakeOffset', function () { return DD.FXRender.shakeOffset(); });
      if (s && isFinite(s.x) && isFinite(s.y)) F.shake = { x: s.x, y: s.y };
    }
    const prof = R.profile && typeof R.profile === 'object' ? R.profile : null;
    let t0 = prof ? performance.now() : 0;
    const mark = function (name) {
      if (!prof) return;
      const t1 = performance.now();
      prof[name] = (prof[name] || 0) + (t1 - t0);
      t0 = t1;
    };
    drawBackdrop(F);
    mark('backdrop');
    const view = makeView(F);
    if (!F.tiles.length) {
      callFx('drawWorld', view);
      drawForeground(F);
      callFx('drawScreen', view);
      return F;
    }
    buildOverlay(F);
    computeTelegraphs(F);
    F.unitDraws = collectUnits(F);
    F.unitOn = new Uint8Array(F.gw * F.gh);
    for (let i = 0; i < F.unitDraws.length; i++) {
      const d = F.unitDraws[i], ux = Math.round(d.x), uy = Math.round(d.y);
      if (!d.u.dead && ux >= 0 && uy >= 0 && ux < F.gw && uy < F.gh) F.unitOn[uy * F.gw + ux] = 1;
    }
    mark('prepare');
    drawBoardShadow(F);
    setWorldTransform(F);
    drawWorld(F);
    mark('world');
    drawLights(F);
    mark('lights');
    drawSilhouettes(F);
    mark('silhouettes');
    drawLateWorld(F);
    drawUnitWidgets(F);
    drawTeleBadges(F);
    view.widgets = {};
    (F.widgetBoxes || []).forEach(function (b) { view.widgets[b.id] = b; });
    mark('widgets');
    callFx('drawWorld', view);
    drawForeground(F);
    callFx('drawScreen', view);
    mark('fx+foreground');
    if (prof) prof.frames = (prof.frames || 0) + 1;
    return F;
  }

  function drawGalleryScene(c, dt) {
    drawEmptyScene(c);
    const G = DD.Gallery;
    if (!G || typeof G.draw !== 'function' || brokenPainters.gallery) return;
    const view = makeView(makeFrame(c, null, dt, camera));
    c.save();
    try { G.draw(view); } catch (e) { brokenPainters.gallery = true; renderError('DD.Gallery.draw', e); }
    c.restore();
  }

  // ======================================================================================================
  // Camera
  // ======================================================================================================
  const lastCam = { x: 0, y: 0, zoom: 1 };
  let boundsMemo = { st: null, version: -1, b: null };
  function stateBounds(st) {
    if (boundsMemo.st !== st || boundsMemo.version !== stateVersion || !boundsMemo.b) boundsMemo = { st: st, version: stateVersion, b: mapBounds(st) };
    return boundsMemo.b;
  }
  /**
   * Screen area the HUD covers on each side (CSS px). DD.Render.hudMargins = { left, right, top, bottom } (or a
   * function (w, h) returning one) set by the HUD wins; missing sides fall back to the defaults. Margins never eat
   * more than 70% of a dimension, so the board always keeps a usable area.
   */
  function defaultMargins(w, h) {
    if (w >= 900 && h >= 620) return HUD_MARGIN;
    return { left: Math.min(HUD_MARGIN.left, w * 0.16), right: 10, top: Math.min(HUD_MARGIN.top, h * 0.08), bottom: Math.min(HUD_MARGIN.bottom, h * 0.3) };
  }
  function hudMargins(w, h) {
    const def = defaultMargins(w, h);
    let o = R.hudMargins;
    if (typeof o === 'function') { try { o = o(w, h); } catch (e) { renderError('DD.Render.hudMargins()', e); o = null; } }
    if (!o || typeof o !== 'object') return def;
    const side = function (k) { const v = +o[k]; return isFinite(v) && v >= 0 ? v : def[k]; };
    const m = { left: side('left'), right: side('right'), top: side('top'), bottom: side('bottom') };
    const fit = function (a, b, total) {
      const s = m[a] + m[b], max = total * 0.7;
      if (s > max && s > 0) { m[a] *= max / s; m[b] *= max / s; }
    };
    fit('left', 'right', w);
    fit('top', 'bottom', h);
    return m;
  }
  let marginSig = '';
  /** Refit (smoothly) when the HUD changes its margins, unless the player has moved the camera. */
  function watchMargins() {
    const m = hudMargins(W, H);
    const sig = Math.round(m.left) + ',' + Math.round(m.right) + ',' + Math.round(m.top) + ',' + Math.round(m.bottom) + '@' + W + 'x' + H;
    if (sig === marginSig) return;
    const first = !marginSig;
    marginSig = sig;
    if (!first && scene === 'combat' && !userMoved && currentState()) R.fitMap();
  }
  function computeFit(st, w, h) {
    const b = mapBounds(st), m = hudMargins(w, h);
    const aw = Math.max(120, w - m.left - m.right), ah = Math.max(120, h - m.top - m.bottom);
    const zoom = clamp(Math.min(aw / (b.maxX - b.minX), ah / (b.maxY - b.minY)), MIN_ZOOM, 2);
    const acx = m.left + aw / 2, acy = m.top + ah / 2;
    return { x: (b.minX + b.maxX) / 2 - (acx - w / 2) / zoom, y: (b.minY + b.maxY) / 2 - (acy - h / 2) / zoom, zoom: zoom };
  }
  function clampTarget() {
    const st = currentState();
    if (!st) return;
    const b = stateBounds(st);
    const px = (W / camTarget.zoom) * 0.32, py = (H / camTarget.zoom) * 0.32;
    camTarget.x = clamp(camTarget.x, b.minX - px + W * 0.18 / camTarget.zoom, b.maxX + px - W * 0.18 / camTarget.zoom);
    camTarget.y = clamp(camTarget.y, b.minY - py + H * 0.18 / camTarget.zoom, b.maxY + py - H * 0.18 / camTarget.zoom);
  }
  /** DD.Render.camera is public: a value written from outside becomes the new target (and survives resizes). */
  function adoptExternalCamera() {
    if (camera.x === lastCam.x && camera.y === lastCam.y && camera.zoom === lastCam.zoom) return;
    camTarget.x = camera.x; camTarget.y = camera.y; camTarget.zoom = camera.zoom = clamp(camera.zoom || 1, MIN_ZOOM, MAX_ZOOM);
    lastCam.x = camera.x; lastCam.y = camera.y; lastCam.zoom = camera.zoom;
    zoomAnchor = null;
    userMoved = true;
  }
  function updateCamera(dt) {
    adoptExternalCamera();
    if (camEase && time > camEase.until) camEase = null;
    const k = 1 - Math.exp(-Math.max(0, dt) / (camEase ? camEase.tau : 85));
    camera.zoom += (camTarget.zoom - camera.zoom) * k;
    if (Math.abs(camTarget.zoom - camera.zoom) < 1e-4) camera.zoom = camTarget.zoom;
    if (zoomAnchor) {
      camera.x = zoomAnchor.wx - (zoomAnchor.sx - W / 2) / camera.zoom;
      camera.y = zoomAnchor.wy - (zoomAnchor.sy - H / 2) / camera.zoom;
      camTarget.x = zoomAnchor.wx - (zoomAnchor.sx - W / 2) / camTarget.zoom;
      camTarget.y = zoomAnchor.wy - (zoomAnchor.sy - H / 2) / camTarget.zoom;
      if (camera.zoom === camTarget.zoom) zoomAnchor = null;
    } else {
      if (scene === 'combat') clampTarget();
      camera.x += (camTarget.x - camera.x) * k;
      camera.y += (camTarget.y - camera.y) * k;
      if (Math.abs(camTarget.x - camera.x) < 0.02) camera.x = camTarget.x;
      if (Math.abs(camTarget.y - camera.y) < 0.02) camera.y = camTarget.y;
    }
    lastCam.x = camera.x; lastCam.y = camera.y; lastCam.zoom = camera.zoom;
  }
  function snapCamera() {
    camera.x = camTarget.x; camera.y = camTarget.y; camera.zoom = camTarget.zoom;
    lastCam.x = camera.x; lastCam.y = camera.y; lastCam.zoom = camera.zoom;
  }

  function currentState() {
    if (R.stateOverride) return R.stateOverride;
    const st = DD.Combat && DD.Combat.state;
    return st && st.grid ? st : null;
  }
  /** Frame context for painting a single tile/object outside the battlefield (drawTileAt / drawObjectAt). */
  function isolatedFrame(c, tile, zoom, opts) {
    const theme = opts.theme || (DD.Combat && DD.Combat.state && DD.Combat.state.theme) || 'cellar';
    const st = { theme: theme, grid: { w: 1, h: 1, tiles: [tile] }, units: [] };
    return {
      ctx: c, st: st, dt: 0, cam: { x: 0, y: 0, zoom: zoom || 1 }, zoom: zoom || 1, shake: { x: 0, y: 0 },
      lights: [], objList: [], unitDraws: [], teleRaw: [], teleBadges: [], tele: null, intentInfo: {}, showTele: false,
      gw: 1, gh: 1, tiles: [tile], ov: null, theme: theme, look: themeLook(theme), showGrid: false,
      texS: Math.max(0.6, Math.min(4, Math.ceil((zoom || 1) * (opts.dpr || DPR) * 2) / 2)),
    };
  }

  /** Minimal frame context for geometry queries (picking, tile tops): no drawing state, no shake. */
  function pickFrame(st) {
    const g = st && st.grid;
    const ok = g && g.w > 0 && g.h > 0 && Array.isArray(g.tiles);
    return {
      st: st, cam: camera, zoom: camera.zoom, shake: { x: 0, y: 0 }, theme: (st && st.theme) || 'cellar',
      gw: ok ? g.w | 0 : 0, gh: ok ? g.h | 0 : 0, tiles: ok ? normTiles(g) : [],
    };
  }

  // ======================================================================================================
  // Loop
  // ======================================================================================================
  let lastDpr = 1, fpsAcc = 0, fpsN = 0;

  // Combat input waits for the FX queue to drain, so one broken event (a NaN / Infinity / negative duration from
  // content, or anything still "playing" long after its duration) would freeze the fight forever. Repair those.
  const FX_STALL_MS = 6000;
  let fxStallWarned = false;
  function guardFx() {
    const F = DD.FX;
    if (!F || !Array.isArray(F.queue) || !Array.isArray(F.active)) return;
    const fix = function (e, playing) {
      if (!e || typeof e !== 'object') return;
      const bad = typeof e.ms !== 'number' || !isFinite(e.ms) || e.ms < 0;
      const stalled = playing && !e.done && isFinite(e.elapsed) && e.elapsed > Math.max(0, +e.ms || 0) + FX_STALL_MS;
      if (!bad && !stalled) return;
      if (!fxStallWarned) { fxStallWarned = true; DD.warn('DD.Render: FX "' + e.type + '" had a bad or endless duration (' + e.ms + '); finished it so the game can go on'); }
      e.ms = stalled ? e.elapsed : 300;
    };
    for (let i = 0; i < F.active.length; i++) fix(F.active[i], true);
    for (let i = 0; i < F.queue.length; i++) fix(F.queue[i], false);
  }

  function frame(dt) {
    time += dt / 1000;
    if (DD.FX && typeof DD.FX.update === 'function') {
      try { guardFx(); DD.FX.update(dt); } catch (e) { renderError('DD.FX.update', e); }
    }
    const st = currentState();
    if (st && Array.isArray(st.units) && DD.FX && typeof DD.FX.busy === 'function' && !DD.FX.busy() && typeof DD.FX.syncAll === 'function') {
      DD.FX.syncAll(st.units);
    }
    if (st !== lastStateRef) {
      lastStateRef = st;
      stateVersion++;
      if (st && scene === 'combat') R.fitMap({ instant: true });
    }
    if (DD.Input && typeof DD.Input.update === 'function') {
      try { DD.Input.update(dt); } catch (e) { renderError('DD.Input.update', e); }
    }
    watchMargins();
    updateCamera(dt);
    updateAmbient(dt);
    if (canvas && (window.devicePixelRatio || 1) !== lastDpr) R.resize();
    draw(dt);
  }

  function draw(dt) {
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    try {
      const custom = sceneHandlers[scene];
      if (custom && typeof custom.draw === 'function') {
        drawEmptyScene(ctx);
        custom.draw(makeView(makeFrame(ctx, null, dt, camera)));
      } else if (scene === 'combat') {
        const st = currentState();
        if (st) drawCombatScene(ctx, dt, st, camera);
        else drawEmptyScene(ctx);
      } else if (scene === 'title') drawTitleScene(ctx, dt);
      else if (scene === 'gallery') drawGalleryScene(ctx, dt);
      else drawEmptyScene(ctx);
    } catch (e) {
      renderError('frame', e);
    }
  }

  // Headless Chrome (tools/shot.sh) runs on virtual time, which cannot advance while heavy canvas frames are queued
  // back to back by requestAnimationFrame: there a 10 fps timer drives the loop so screenshots always complete.
  const HEADLESS_UA = /HeadlessChrome/.test((window.navigator && navigator.userAgent) || '');
  let timerId = 0;
  function schedule() {
    if (HEADLESS_UA) timerId = window.setTimeout(function () { loop(performance.now()); }, 100);
    else rafId = requestAnimationFrame(loop);
  }
  function loop(ts) {
    if (!running) return;
    schedule();
    const dt = lastTs ? clamp(ts - lastTs, 0, 100) : 16;
    lastTs = ts;
    fpsAcc += dt; fpsN++;
    if (fpsAcc >= 500) { R.fps = Math.round(1000 * fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
    frame(dt);
  }

  function bumpState() { stateVersion++; }
  let eventsBound = false;
  function bindEvents() {
    if (eventsBound || !DD.Events) return;
    eventsBound = true;
    ['combat:changed', 'combat:start', 'combat:end', 'turn:player', 'turn:enemy', 'turn:start', 'round:start', 'unit:died', 'unit:downed',
      'windup:start', 'windup:cancel', 'initiative:rolled'].forEach(function (n) {
      DD.Events.on(n, bumpState);
    });
    DD.Events.on('combat:start', function () { lastStateRef = null; });
    window.addEventListener('resize', function () { R.resize(); });
  }

  // ======================================================================================================
  // Public API (ARCHITECTURE §7.2)
  // ======================================================================================================
  const R = (DD.Render = {
    camera: camera,
    overlay: defaultOverlay(),
    /** Test/debug: render this state instead of DD.Combat.state. */
    stateOverride: null,
    fps: 0,
    /**
     * HUD-covered screen edges in CSS px, { left, right, top, bottom } or fn(w, h) → that (null = built-in defaults).
     * fitMap / centerOn frame the board inside the rest; a change refits unless the player moved the camera.
     */
    hudMargins: null,
    /** The margins in effect for the current viewport (HUD's or defaults), e.g. to keep overlays off the panels. */
    margins: function () { return Object.assign({}, hudMargins(W, H)); },

    init: function (cv) {
      canvas = cv || document.getElementById('game');
      if (!canvas || !canvas.getContext) { DD.warn('DD.Render.init: no canvas'); canvas = null; return false; }
      ctx = canvas.getContext('2d');
      bindEvents();
      R.resize();
      return true;
    },
    start: function () {
      if (running || !ctx || DD.headless) return;
      running = true;
      lastTs = 0;
      schedule();
    },
    stop: function () {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      if (timerId) window.clearTimeout(timerId);
      rafId = 0; timerId = 0;
    },
    isRunning: function () { return running; },
    resize: function () {
      if (!canvas) return;
      lastDpr = window.devicePixelRatio || 1;
      DPR = clamp(lastDpr, 1, 3);
      W = Math.max(1, Math.round(window.innerWidth || canvas.clientWidth || 1280));
      H = Math.max(1, Math.round(window.innerHeight || canvas.clientHeight || 720));
      canvas.width = Math.round(W * DPR);
      canvas.height = Math.round(H * DPR);
      canvas.style.width = W + 'px';
      canvas.style.height = H + 'px';
      adoptExternalCamera();
      if (!userMoved && scene === 'combat') R.fitMap({ instant: true });
      // resizing clears the canvas: repaint now instead of leaving it blank until the next tick
      if (running) draw(0);
    },
    setScene: function (id) {
      id = id || 'none';
      if (id === scene) return;
      const prev = sceneHandlers[scene];
      if (prev && typeof prev.leave === 'function') DD.safe('scene leave ' + scene, prev.leave, prev);
      scene = id;
      if (id === 'combat') { lastStateRef = null; userMoved = false; }
      if (id === 'title') { titleBark.at = time + 3; titleBark.unitId = null; }
      const next = sceneHandlers[id];
      if (next && typeof next.enter === 'function') DD.safe('scene enter ' + id, next.enter, next);
    },
    getScene: function () { return scene; },
    /** Custom scenes: registerScene(id, { draw(view), enter(), leave() }). */
    registerScene: function (id, handler) { sceneHandlers[id] = handler; },

    centerOn: function (x, y, opts) {
      opts = opts || {};
      const st = currentState();
      let hgt = 0;
      if (st) {
        const F = pickFrame(st);
        const t = gridTile(F, Math.round(x), Math.round(y));
        if (t) hgt = t.h || 0;
      }
      const w = Iso.toWorld(x, y, hgt);
      const z = camTarget.zoom, m = opts.ignoreHud ? { left: 0, right: 0, top: 0, bottom: 0 } : hudMargins(W, H);
      const acx = m.left + (W - m.left - m.right) / 2, acy = m.top + (H - m.top - m.bottom) / 2;
      camTarget.x = w.x - (acx - W / 2) / z;
      camTarget.y = w.y - 16 - (acy - H / 2) / z;
      zoomAnchor = null;
      camEase = null;
      userMoved = true;
      if (opts.instant || !running) snapCamera();
    },
    /**
     * v2: gently keep a tile (the acting unit) in view. If (x, y) — with room for a sprite above it — lies outside the
     * board area (HUD margins, inset by opts.pad of it, default 0.1), pan the least amount that brings it inside, with a
     * slow ease (opts.ms ≈ time constant, default 240). Nothing moves when it is already comfortably visible (the
     * fitted view usually shows the whole board). Returns true if the camera will move.
     */
    follow: function (x, y, opts) {
      opts = opts || {};
      const st = currentState();
      if (!st || !isFinite(x) || !isFinite(y)) return false;
      const F = pickFrame(st);
      const t = gridTile(F, Math.round(x), Math.round(y));
      const w = Iso.toWorld(x, y, t ? (t.h || 0) : 0);
      const m = hudMargins(W, H), z = camTarget.zoom;
      const aw = Math.max(80, W - m.left - m.right), ah = Math.max(80, H - m.top - m.bottom);
      const pad = clamp(opts.pad === undefined ? 0.1 : +opts.pad || 0, 0, 0.4);
      const x0 = m.left + aw * pad, x1 = W - m.right - aw * pad;
      const y0 = m.top + ah * pad, y1 = H - m.bottom - ah * pad;
      const head = (opts.height || 56) * z;
      const sx = (w.x - camTarget.x) * z + W / 2, sy = (w.y - camTarget.y) * z + H / 2;
      let dx = 0, dy = 0;
      if (sx < x0) dx = sx - x0; else if (sx > x1) dx = sx - x1;
      if (sy - head < y0) dy = sy - head - y0; else if (sy > y1) dy = sy - y1;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return false;
      camTarget.x += dx / z;
      camTarget.y += dy / z;
      zoomAnchor = null;
      userMoved = true;
      if (!running || opts.instant) { snapCamera(); return true; }
      const tau = Math.max(60, +opts.ms || 240);
      camEase = { tau: tau, until: time + tau * 6 / 1000 };
      return true;
    },
    fitMap: function (opts) {
      const st = currentState();
      if (!st) return false;
      const f = computeFit(st, W, H);
      camTarget.x = f.x; camTarget.y = f.y; camTarget.zoom = f.zoom;
      zoomAnchor = null;
      camEase = null;
      userMoved = false;
      if ((opts && opts.instant) || !running) snapCamera();
      return true;
    },
    /** Grid (x, y[, h]) -> screen CSS px (tile top center; h defaults to the tile's ground height). No shake. */
    worldToScreen: function (x, y, h) {
      if (h === undefined || h === null) h = R.tileTop(x, y, true);
      const w = Iso.toWorld(x, y, h);
      return { x: (w.x - camera.x) * camera.zoom + W / 2, y: (w.y - camera.y) * camera.zoom + H / 2 };
    },
    /** Screen CSS px -> world px. */
    screenToWorld: function (sx, sy) {
      return { x: (sx - W / 2) / camera.zoom + camera.x, y: (sy - H / 2) / camera.zoom + camera.y };
    },
    /** Frontmost tile (top face or side face) under a screen point, or null. */
    screenToTile: function (sx, sy) {
      const st = currentState();
      if (!st) return null;
      const F = pickFrame(st);
      const p = R.screenToWorld(sx, sy);
      for (let d = F.gw + F.gh - 2; d >= 0; d--) {
        const x0 = Math.max(0, d - (F.gh - 1)), x1 = Math.min(F.gw - 1, d);
        for (let x = x0; x <= x1; x++) {
          const y = d - x, t = F.tiles[y * F.gw + x];
          if (!t) continue;
          const top = topLevel(F, t), w = Iso.toWorld(x, y, top);
          if (Iso.inColumn(p.x, p.y, w.x, w.y, HW, HH, (top + SLAB) * STEP)) return { x: x, y: y };
        }
      }
      return null;
    },
    /** Frontmost non-dead unit whose sprite bounds contain the screen point. */
    unitAtScreen: function (sx, sy) {
      const st = currentState();
      if (!st) return null;
      const F = pickFrame(st);
      const draws = collectUnits(F);
      for (let i = draws.length - 1; i >= 0; i--) {
        const d = draws[i];
        if (d.u.dead || d.alpha < 0.3) continue;
        const p = w2s(F, d.wx, d.wy), z = F.zoom;
        const hw = (d.downed ? Math.max(18, d.mh * 0.5) : Math.max(12, d.mw * 0.55)) * z;
        const top = p.y - (d.downed ? Math.max(14, d.mw * 0.7) : d.mh) * z, bottom = p.y + 6 * z;
        if (sx >= p.x - hw && sx <= p.x + hw && sy >= top && sy <= bottom) return d.u;
      }
      return null;
    },
    /** Elevation of a tile: ground h (ground=true) or visual top including wall height. */
    tileTop: function (x, y, ground) {
      const st = currentState();
      if (!st) return 0;
      const F = pickFrame(st);
      const t = gridTile(F, Math.round(x), Math.round(y));
      if (!t) return 0;
      return ground ? (t.h || 0) : topLevel(F, t);
    },
    panBy: function (dx, dy) {
      camera.x -= dx / camera.zoom; camera.y -= dy / camera.zoom;
      camTarget.x = camera.x; camTarget.y = camera.y;
      lastCam.x = camera.x; lastCam.y = camera.y;
      zoomAnchor = null;
      camEase = null;
      userMoved = true;
    },
    /** Smoothly zoom by `factor`, keeping the world point under (sx, sy) fixed (default: screen center). */
    zoomAt: function (factor, sx, sy) {
      if (!(factor > 0)) return;
      if (sx === undefined) { sx = W / 2; sy = H / 2; }
      const z = clamp(camTarget.zoom * factor, MIN_ZOOM, MAX_ZOOM);
      if (z === camTarget.zoom) return;
      const wp = R.screenToWorld(sx, sy);
      zoomAnchor = { sx: sx, sy: sy, wx: wp.x, wy: wp.y };
      camTarget.zoom = z;
      camEase = null;
      userMoved = true;
      if (!running) {
        camera.zoom = z;
        camera.x = wp.x - (sx - W / 2) / z; camera.y = wp.y - (sy - H / 2) / z;
        camTarget.x = camera.x; camTarget.y = camera.y;
        lastCam.x = camera.x; lastCam.y = camera.y; lastCam.zoom = z;
        zoomAnchor = null;
      }
    },
    resetOverlay: function () { R.overlay = defaultOverlay(); },
    /** Viewport size in CSS px. */
    size: function () { return { width: W, height: H, dpr: DPR }; },
    /** Run one full frame (FX update + draw) on the main canvas — tests / manual stepping. */
    drawFrame: function (dt) { frame(dt === undefined ? 16 : dt); },
    /**
     * Render into another canvas: opts { state, scene: 'combat'|'title'|'none', width, height, dpr, camera, dt }.
     * Returns { units, objects, lights, telegraphs, widgets, silhouettes } for the drawn frame (null for empty scenes);
     * `widgets` are the laid-out HP widget boxes { id, x0, x1, y0, y1, dy } in screen px, `silhouettes` the units drawn
     * see-through { id, geometry (occluding tiles/objects), units (ids of the units in front hiding it) }.
     */
    renderTo: function (cv, opts) {
      opts = opts || {};
      const saved = { W: W, H: H, DPR: DPR };
      try {
        DPR = opts.dpr || 1;
        W = opts.width || Math.round(cv.width / DPR);
        H = opts.height || Math.round(cv.height / DPR);
        if (cv.width !== Math.round(W * DPR)) cv.width = Math.round(W * DPR);
        if (cv.height !== Math.round(H * DPR)) cv.height = Math.round(H * DPR);
        const c = cv.getContext('2d');
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.globalAlpha = 1;
        c.globalCompositeOperation = 'source-over';
        const sc = opts.scene || 'combat';
        let F = null;
        if (sc === 'title') F = drawTitleScene(c, opts.dt || 16);
        else if (sc === 'combat') {
          const st = opts.state || currentState();
          if (st) F = drawCombatScene(c, opts.dt || 16, st, opts.camera || computeFit(st, W, H));
          else drawEmptyScene(c);
        } else drawEmptyScene(c);
        return F ? {
          units: F.unitDraws.length, objects: F.objList.length, lights: F.lights.length, telegraphs: F.teleRaw.length,
          // v2: drawn wind-ups (ids), their ⏳ badges, threat-shaded tiles, the inspected enemy's reach tiles
          windups: F.teleRaw.reduce(function (a, e) { return a.concat(e.list.map(function (it) { return it.id; })); }, []),
          badges: (F.teleBadges || []).map(function (b) { return { label: b.label, dmg: b.dmg, delay: b.delay }; }),
          threatTiles: F.ov ? F.ov.threatN : 0,
          reachTiles: F.ov && F.ov.reach ? F.ov.reach.reduce(function (a, v) { return a + v; }, 0) : 0,
          widgets: (F.widgetBoxes || []).map(function (b) { return Object.assign({}, b); }),
          silhouettes: (F.silhouettes || []).map(function (s) { return { id: s.id, geometry: s.geometry, units: s.units.slice() }; }),
        } : null;
      } finally {
        W = saved.W; H = saved.H; DPR = saved.DPR;
      }
    },
    /**
     * Paint one terrain block (optionally with a surface and an object on it) into any context, top-face center at
     * (sx, sy) in that context's current units: for galleries, codex entries and tooltips.
     * opts: { h = 1 (block height in levels), theme, surface: id, obj: id|instance, t, dpr }.
     */
    drawTileAt: function (c, terrainId, sx, sy, zoom, opts) {
      opts = opts || {};
      const h = opts.h === undefined ? 1 : Math.max(0, +opts.h || 0);
      const tile = { x: 0, y: 0, h: h, t: terrainId || 'stone', surface: opts.surface ? { id: opts.surface, turns: 2, data: {} } : null, obj: null, zone: null, tag: null };
      if (opts.obj) tile.obj = typeof opts.obj === 'object' ? opts.obj : { id: opts.obj, hp: 0, maxHp: 0, data: {} };
      const F = isolatedFrame(c, tile, zoom, opts);
      const top = topLevel(F, tile);
      c.save();
      c.translate(sx, sy);
      c.scale(zoom || 1, zoom || 1);
      c.translate(0, top * STEP);
      try {
        drawTile(F, c, tile);
        if (tile.obj || tile.surface) {
          const w = Iso.toWorld(0, 0, top);
          if (tile.obj) drawObject(F, c, tile, w.x, w.y);
          if (tile.surface) drawSurfaceVolume(F, c, tile, w.x, w.y);
        }
      } finally { c.restore(); }
    },
    /** Paint an object (id or instance) standing at (sx, sy) with the world painters (def.draw honoured). */
    drawObjectAt: function (c, objOrId, sx, sy, zoom, opts) {
      opts = opts || {};
      const obj = typeof objOrId === 'object' && objOrId ? objOrId : { id: String(objOrId), hp: 0, maxHp: 0, data: {} };
      if (!obj.data) obj.data = {};
      const tile = { x: 0, y: 0, h: 0, t: 'stone', surface: null, obj: obj, zone: null, tag: null };
      const F = isolatedFrame(c, tile, zoom, opts);
      c.save();
      c.translate(sx, sy);
      c.scale(zoom || 1, zoom || 1);
      try { drawObject(F, c, tile, 0, 0); } finally { c.restore(); }
    },
    /** Drop cached textures/styles (e.g. after registering terrain at runtime). */
    invalidate: function () {
      styleCache.clear(); texCache.clear(); glyphs.clear();
      teleCache.st = null; boundsMemo.st = null; titleState = null;
      stateVersion++;
    },
    /** Ids with dedicated painters (used by tests and the gallery). */
    painters: {
      terrain: Object.keys(TERRAIN),
      objects: Object.keys(OBJ).filter(function (k) { return k.indexOf('title_') !== 0; }),
      surfaces: Object.keys(SURF),
      themes: Object.keys(THEME_LOOK).filter(function (k) { return k !== 'title'; }),
    },
  });
})();
