/* Dungeons and Degenerates — js/core/util.js
 * Small pure helpers shared by every module. No game state in here.
 */
(function () {
  'use strict';
  const DD = window.DD;

  const DIRS = [
    { x: 0, y: -1, name: 'N' },
    { x: 1, y: 0, name: 'E' },
    { x: 0, y: 1, name: 'S' },
    { x: -1, y: 0, name: 'W' },
  ];

  let uidCounter = 0;

  function defaultRng(rng) { return rng || DD.rng; }

  const U = (DD.util = {
    DIRS: DIRS,

    clamp: function (v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; },
    lerp: function (a, b, t) { return a + (b - a) * t; },
    sign: function (v) { return v > 0 ? 1 : v < 0 ? -1 : 0; },
    sum: function (arr, fn) { let s = 0; for (let i = 0; i < arr.length; i++) s += fn ? fn(arr[i], i) : arr[i]; return s; },
    range: function (n) { const a = []; for (let i = 0; i < n; i++) a.push(i); return a; },

    /** Tile key "x,y". */
    key: function (x, y) { return x + ',' + y; },
    unkey: function (k) { const p = k.split(','); return { x: +p[0], y: +p[1] }; },
    samePos: function (a, b) { return !!a && !!b && a.x === b.x && a.y === b.y; },

    manhattan: function (a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); },
    chebyshev: function (a, b) { return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)); },

    /** Cardinal unit vector from a toward b (dominant axis; ties prefer x). {x:0,y:0} if same tile. */
    dirTo: function (a, b) {
      const dx = b.x - a.x, dy = b.y - a.y;
      if (dx === 0 && dy === 0) return { x: 0, y: 0 };
      if (Math.abs(dx) >= Math.abs(dy)) return { x: dx > 0 ? 1 : -1, y: 0 };
      return { x: 0, y: dy > 0 ? 1 : -1 };
    },
    /** Rotate a cardinal dir by quarter turns clockwise (in grid space). */
    rotateDir: function (d, quarterTurns) {
      let x = d.x, y = d.y;
      const n = ((quarterTurns % 4) + 4) % 4;
      for (let i = 0; i < n; i++) { const t = x; x = -y; y = t; }
      return { x: x, y: y };
    },
    dirName: function (d) {
      for (let i = 0; i < DIRS.length; i++) if (DIRS[i].x === d.x && DIRS[i].y === d.y) return DIRS[i].name;
      return '?';
    },
    dirFromName: function (n) {
      for (let i = 0; i < DIRS.length; i++) if (DIRS[i].name === n) return { x: DIRS[i].x, y: DIRS[i].y };
      return null;
    },

    deepClone: function (o) { return o === undefined ? undefined : JSON.parse(JSON.stringify(o)); },

    pick: function (arr, rng) {
      if (!arr || !arr.length) return undefined;
      return arr[Math.floor(defaultRng(rng).next() * arr.length) % arr.length];
    },
    /** Returns a shuffled copy. */
    shuffle: function (arr, rng) {
      const a = arr.slice();
      const r = defaultRng(rng);
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(r.next() * (i + 1));
        const t = a[i]; a[i] = a[j]; a[j] = t;
      }
      return a;
    },
    /** Pick from items by weight; weightFn(item) -> number (default item.weight || 1). */
    weightedPick: function (items, weightFn, rng) {
      if (!items || !items.length) return undefined;
      const wf = weightFn || function (it) { return it && it.weight != null ? it.weight : 1; };
      let total = 0;
      for (let i = 0; i < items.length; i++) total += Math.max(0, wf(items[i]) || 0);
      if (total <= 0) return items[0];
      let roll = defaultRng(rng).next() * total;
      for (let i = 0; i < items.length; i++) {
        roll -= Math.max(0, wf(items[i]) || 0);
        if (roll < 0) return items[i];
      }
      return items[items.length - 1];
    },
    /** Pick n distinct elements. */
    sample: function (arr, n, rng) { return U.shuffle(arr, rng).slice(0, n); },

    uid: function (prefix) { uidCounter++; return (prefix || 'id') + uidCounter; },

    escapeHtml: function (s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },
    /** Replace {token} with vars[token]. */
    fmt: function (template, vars) {
      return String(template).replace(/\{(\w+)\}/g, function (m, k) { return vars && vars[k] !== undefined ? String(vars[k]) : m; });
    },
    roman: function (n) { return ['0', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][n] || String(n); },
    plural: function (n, word, pluralWord) { return n + ' ' + (n === 1 ? word : (pluralWord || word + 's')); },
    capitalize: function (s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); },
    pct: function (f) { return Math.round(f * 100) + '%'; },

    /** Random line from an array (or '' when empty). */
    line: function (lines, rng) { return lines && lines.length ? U.pick(lines, rng) : ''; },

    /** Hex color helpers for render/UI. */
    shade: function (hex, amt) {
      // amt in [-1, 1]: negative darkens, positive lightens
      const c = U.parseColor(hex);
      if (!c) return hex;
      const f = function (v) { return Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt); };
      return 'rgb(' + f(c.r) + ',' + f(c.g) + ',' + f(c.b) + ')';
    },
    parseColor: function (hex) {
      if (typeof hex !== 'string') return null;
      let h = hex.trim();
      if (h.charAt(0) !== '#') {
        const m = h.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
        return m ? { r: +m[1], g: +m[2], b: +m[3] } : null;
      }
      h = h.slice(1);
      if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
      if (h.length < 6) return null;
      return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
    },
    rgba: function (hex, a) {
      const c = U.parseColor(hex);
      return c ? 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + a + ')' : hex;
    },

    /** Simple string hash (uint32). */
    hash: function (str) {
      let h = 1779033703 ^ String(str).length;
      for (let i = 0; i < String(str).length; i++) {
        h = Math.imul(h ^ String(str).charCodeAt(i), 3432918353);
        h = (h << 13) | (h >>> 19);
      }
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      return (h ^= h >>> 16) >>> 0;
    },
  });
})();
