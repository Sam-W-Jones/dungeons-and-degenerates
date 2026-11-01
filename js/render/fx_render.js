/* Dungeons and Degenerates — js/render/fx_render.js
 * FX playback (docs/ARCHITECTURE.md §7.4). Registers a handler for every DD.FX event type: handlers animate
 * `unit.vis` (position, lunge offsets, flash, alpha, scale + render-only pose fields read by DD.Sprites.drawUnit)
 * and spawn non-blocking visuals (particles, projectiles, beams, explosions, floating numbers, barks, banners)
 * into an FX-owned effect list that the world renderer draws through DD.FXRender.drawWorld / drawScreen.
 *
 * Render-only vis fields written here (honoured by DD.Sprites only while `vis._fxAt` is fresh):
 *   pose, poseT, facing, lift (px up), squash, walk (stride phase), deathT, downT, reviveT, spawnT, flashColor.
 * Sounds queued right after a visual event (the engine's FX.damage(); FX.sound('hit') pattern) are played when
 * that visual starts, so audio lines up with the animation instead of trailing it.
 *
 * v2 markers: 'turn' (fx_core moves DD.FX.shownTurn), 'windup' (a red glow on the announced tiles) and 'initiative'.
 * A screen can host the initiative dice moment: DD.FXRender.moments.initiative = { wants(evt) → bool,
 * start(evt) → ms } (the HUD's dice tray). While a host wants it, the marker blocks playback for those ms (the host
 * may finish it early: evt.elapsed = evt.ms) and the engine's "Roll for initiative!" banner right before it is folded
 * into the moment instead of being drawn.
 */
(function () {
  'use strict';
  const DD = window.DD;
  const TAU = Math.PI * 2;

  const MAX_EFFECTS = 1200;
  const effects = [];      // live visuals: { layer: 'world'|'screen', age, life, tick?(e, dt), draw(ctx, e, view), dead }
  const shakes = [];       // { amp, dur, age }
  let lastT = null;

  // ---- small helpers --------------------------------------------------------------------------------------
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function num(v, fb) { return typeof v === 'number' && isFinite(v) ? v : fb; }
  function easeOut(t) { t = clamp(t, 0, 1); return 1 - (1 - t) * (1 - t) * (1 - t); }
  function easeIn(t) { t = clamp(t, 0, 1); return t * t * t; }
  function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  function easeOutBack(t) { const c = 1.70158; t = clamp(t, 0, 1) - 1; return 1 + (c + 1) * t * t * t + c * t * t; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function nowMs() { return (window.performance && performance.now) ? performance.now() : Date.now(); }
  function speed() { return DD.FX && DD.FX.speed > 0 ? DD.FX.speed : 1; }
  function rgba(c, a) { return DD.util.rgba(c, clamp(a, 0, 1)); }
  function shade(c, k) { return DD.util.shade(c, k); }
  function validColor(c) { return typeof c === 'string' && !!DD.util.parseColor(c); }
  function col(c, fb) { return validColor(c) ? c : fb; }

  function unitOf(evt) {
    if (!evt) return null;
    if (evt.unit && typeof evt.unit === 'object') return evt.unit;
    return evt.unitId !== undefined && DD.FX ? DD.FX.findUnit(evt.unitId) : null;
  }
  function visOf(u) {
    if (!u) return null;
    return u.vis || (DD.FX && DD.FX.initVis ? DD.FX.initVis(u) : null);
  }
  /** Mark render-only vis fields as fresh this frame (DD.Sprites ignores them once an FX stops refreshing). */
  function stamp(v) { if (v) v._fxAt = nowMs(); }
  function clearPose(v) {
    if (!v) return;
    v.pose = null; v.poseT = undefined; v.lift = 0; v.squash = 0; v.walk = undefined; v.spin = 0;
    v.flashColor = undefined;
  }
  function posOf(p) { return p && isFinite(p.x) && isFinite(p.y) ? { x: p.x, y: p.y, h: num(p.h, 0) } : null; }
  function visPos(u) {
    const v = u && u.vis;
    if (v && isFinite(v.x) && isFinite(v.y)) return { x: v.x, y: v.y, h: num(v.h, 0) };
    return u ? { x: u.x, y: u.y, h: DD.FX ? DD.FX.tileH(u.x, u.y) : 0 } : null;
  }
  /** Screen-space delta (zoom 1 px) between two grid positions (ARCHITECTURE §7.1 projection). */
  function screenDelta(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    return { x: (dx - dy) * 32, y: (dx + dy) * 16 - (num(b.h, 0) - num(a.h, 0)) * 16 };
  }
  function facingToward(a, b) {
    const d = screenDelta(a, b);
    return Math.abs(d.x) < 0.5 ? 0 : d.x > 0 ? 1 : -1;
  }
  /** Sprite height in zoom-1 px (for placing text/bubbles over heads). */
  function unitHeight(u) {
    try {
      if (DD.Sprites && DD.Sprites.metrics) { const m = DD.Sprites.metrics(u); if (m && m.height > 0) return m.height; }
    } catch (e) { /* fall through */ }
    return 40;
  }
  /** Find the active unit standing (visually) on a tile: used to give shooters a cast/throw pose. */
  function unitAtPos(p) {
    const st = DD.Combat && DD.Combat.state;
    if (!p || !st || !st.units) return null;
    for (let i = 0; i < st.units.length; i++) {
      const u = st.units[i], v = u.vis;
      if (!u || u.dead || u.downed) continue;
      const x = v ? v.x : u.x, y = v ? v.y : u.y;
      if (Math.round(x) === Math.round(p.x) && Math.round(y) === Math.round(p.y)) return u;
    }
    return null;
  }

  let ticking = false;
  const pending = [];
  function addEffect(e) {
    e.age = 0;
    e.life = Math.max(1, num(e.life, 600));
    if (ticking) { pending.push(e); return e; }
    if (effects.length >= MAX_EFFECTS) effects.splice(0, effects.length - MAX_EFFECTS + 1);
    effects.push(e);
    return e;
  }
  function clearEffects() { effects.length = 0; shakes.length = 0; }

  function addShake(amp, dur) {
    if (!(amp > 0) || !(dur > 0)) return;
    shakes.push({ amp: Math.min(amp, 30), dur: dur, age: 0 });
    if (shakes.length > 12) shakes.shift();
  }

  /** Advance every live effect once per rendered frame. */
  function tick(view) {
    const t = num(view && view.t, null);
    if (t !== null && t === lastT) return;
    lastT = t;
    const dt = clamp(num(view && view.dt, 16), 0, 100) * speed();
    ticking = true;
    try {
      for (let i = 0; i < effects.length; i++) {
        const e = effects[i];
        e.age += dt * (e.speedCap ? Math.min(1, e.speedCap / speed()) : 1);
        if (e.tick && !e.dead) {
          let ok = false;
          DD.safe('FX effect tick', function () { e.tick(e, dt); ok = true; });
          if (!ok) e.dead = true;
        }
        if (e.age >= e.life) e.dead = true;
      }
    } finally {
      ticking = false;
    }
    for (let i = effects.length - 1; i >= 0; i--) if (effects[i].dead) effects.splice(i, 1);
    while (pending.length) addEffect(pending.shift());
    for (let i = shakes.length - 1; i >= 0; i--) { shakes[i].age += dt; if (shakes[i].age >= shakes[i].dur) shakes.splice(i, 1); }
  }

  /** Screen position of a world anchor (grid x, y, h) with a zoom-1 px offset. */
  function project(view, at, ox, oy) {
    const p = view.toScreen(at.x, at.y, at.h);
    return { x: p.x + (ox || 0) * view.zoom, y: p.y + (oy || 0) * view.zoom };
  }
  /** Current head-top anchor of a unit (follows the unit while it moves). */
  function unitAnchor(e) {
    const u = e.unit;
    if (u && u.vis && isFinite(u.vis.x)) {
      const v = u.vis;
      return { at: { x: v.x, y: v.y, h: num(v.h, 0) }, ox: num(v.offX, 0), oy: num(v.offY, 0) - num(v._fxAt && nowMs() - v._fxAt < 450 ? v.lift : 0, 0) };
    }
    return { at: e.at, ox: 0, oy: 0 };
  }

  // ---- text helpers -----------------------------------------------------------------------------------------
  const NUM_FONT = 'Impact, "Arial Black", "Trebuchet MS", sans-serif';
  const TEXT_FONT = '"Trebuchet MS", Verdana, sans-serif';
  const DISPLAY_FONT = '"Cinzel", "MedievalSharp", Georgia, serif';
  function outlinedText(c, str, x, y, size, fill, stroke, font, weight) {
    c.font = (weight || 'bold') + ' ' + Math.round(size) + 'px ' + (font || TEXT_FONT);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineJoin = 'round';
    c.lineWidth = Math.max(2, size * 0.22);
    c.strokeStyle = stroke || 'rgba(20,10,16,0.92)';
    c.strokeText(str, x, y);
    c.fillStyle = fill || '#ffffff';
    c.fillText(str, x, y);
  }
  function wrapLines(c, text, maxW) {
    const words = String(text).split(/\s+/), lines = [];
    let line = '';
    for (let i = 0; i < words.length; i++) {
      const test = line ? line + ' ' + words[i] : words[i];
      if (c.measureText(test).width > maxW && line) { lines.push(line); line = words[i]; } else line = test;
    }
    if (line) lines.push(line);
    return lines.slice(0, 5);
  }
  function roundRect(c, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
  }

  // ---- particles ------------------------------------------------------------------------------------------------
  // Each particle lives in zoom-1 px relative to its anchor's screen point: { x, y, vx, vy (px/s), g (px/s²), drag,
  // size, grow, rot, vr, color, life, age, ground }. Kinds set physics + look.
  const PK = {
    sparks: { n: 14, cols: ['#fff6c0', '#ffd23f', '#ffffff'], add: true },
    smoke: { n: 10, cols: ['#8a8494', '#6f6878', '#a39daa'] },
    blood: { n: 12, cols: ['#c0102a', '#8f0a1e', '#e0203a'] },
    coins: { n: 12, cols: ['#ffd23f', '#f5b72a', '#fff0a0'] },
    hearts: { n: 7, cols: ['#ff6fae', '#ff9fc8', '#ff4f8f'] },
    glitter: { n: 18, cols: ['#ff8ad8', '#7af0ff', '#fff3a0', '#ffffff', '#b48cff'], add: true },
    leaves: { n: 9, cols: ['#6cc24a', '#4f9a35', '#a8d672'] },
    bubbles: { n: 10, cols: ['#9be7ff', '#bff4ff'] },
    notes: { n: 6, cols: ['#ffd76a', '#ff8ad8', '#7af0ff'] },
    runes: { n: 7, cols: ['#7af0ff', '#b48cff'], add: true },
    feathers: { n: 7, cols: ['#2b2a35', '#45434f', '#1c1b24'] },
    dust: { n: 8, cols: ['#c9b48f', '#a8957a', '#ddd0b5'] },
    fire: { n: 16, cols: ['#ffe066', '#ff9a2a', '#ff5a1a'], add: true },
    ice: { n: 12, cols: ['#dff6ff', '#9fe3ff', '#ffffff'] },
    poison: { n: 12, cols: ['#8fdc3c', '#5fae2a', '#b8f070'] },
    zap: { n: 6, cols: ['#fff59a', '#9fd0ff', '#ffffff'], add: true },
  };

  function pick(a) { return a[Math.floor(Math.random() * a.length) % a.length]; }

  function makeParticle(kind, color, spread) {
    const K = PK[kind] || PK.sparks;
    const c = color && validColor(color) ? (Math.random() < 0.7 ? color : pick(K.cols)) : pick(K.cols);
    const a = Math.random() * TAU, sp = spread || 1;
    const p = { kind: kind, x: Math.cos(a) * rand(0, 6) * sp, y: Math.sin(a) * rand(0, 4) * sp, vx: 0, vy: 0, g: 0, drag: 0,
      size: 2, grow: 0, rot: rand(0, TAU), vr: 0, color: c, life: 600, age: 0, ground: null, seed: Math.floor(rand(0, 1000)) };
    switch (kind) {
      case 'sparks': { const v = rand(70, 170); p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v - 40; p.g = 320; p.life = rand(260, 480); p.size = rand(1.2, 2.2); break; }
      case 'smoke': p.vx = rand(-12, 12); p.vy = rand(-28, -12); p.life = rand(700, 1200); p.size = rand(3, 5); p.grow = rand(5, 9); p.drag = 0.6; break;
      case 'blood': { const v = rand(40, 110); p.vx = Math.cos(a) * v; p.vy = -rand(40, 120); p.g = 420; p.life = rand(500, 800); p.size = rand(1.2, 2.4); p.ground = rand(8, 14); break; }
      case 'coins': p.vx = rand(-60, 60); p.vy = -rand(110, 200); p.g = 520; p.life = rand(900, 1300); p.size = rand(2.2, 3); p.vr = rand(8, 14); p.ground = rand(10, 16); break;
      case 'hearts': p.vx = rand(-14, 14); p.vy = -rand(22, 40); p.life = rand(900, 1400); p.size = rand(2.6, 3.8); break;
      case 'glitter': p.vx = rand(-30, 30); p.vy = rand(-40, 10); p.g = 20; p.drag = 1.2; p.life = rand(600, 1100); p.size = rand(1.4, 2.6); break;
      case 'leaves': p.x *= 2; p.y = -rand(14, 30); p.vx = rand(-24, 24); p.vy = rand(10, 24); p.life = rand(1000, 1500); p.size = rand(2.4, 3.4); p.vr = rand(-4, 4); break;
      case 'bubbles': p.vx = rand(-8, 8); p.vy = -rand(18, 36); p.life = rand(700, 1100); p.size = rand(1.4, 2.8); break;
      case 'notes': p.vx = rand(-16, 16); p.vy = -rand(24, 40); p.life = rand(1000, 1400); p.size = rand(2.2, 3); break;
      case 'runes': p.vx = rand(-10, 10); p.vy = -rand(14, 26); p.life = rand(900, 1300); p.size = rand(2.4, 3.4); break;
      case 'feathers': p.x *= 2.5; p.y = -rand(10, 26); p.vx = rand(-18, 18); p.vy = rand(6, 16); p.life = rand(1200, 1700); p.size = rand(2.6, 3.6); p.vr = rand(-3, 3); break;
      case 'dust': p.x *= 2.2; p.y = rand(-2, 1); p.vx = rand(-30, 30); p.vy = -rand(4, 14); p.drag = 2; p.life = rand(380, 650); p.size = rand(2, 3); p.grow = rand(4, 7); break;
      case 'fire': p.vx = rand(-16, 16); p.vy = -rand(30, 60); p.life = rand(380, 700); p.size = rand(2.4, 4); p.grow = -3; break;
      case 'ice': { const v = rand(50, 120); p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v - 60; p.g = 300; p.life = rand(450, 750); p.size = rand(1.6, 2.8); p.vr = rand(-10, 10); p.ground = rand(8, 14); break; }
      case 'poison': p.vx = rand(-14, 14); p.vy = -rand(10, 30); p.life = rand(700, 1000); p.size = rand(1.6, 3); p.grow = rand(1, 3); break;
      case 'zap': p.life = rand(140, 260); p.size = rand(10, 18); p.rot = a; break;
      default: break;
    }
    return p;
  }

  function stepParticle(p, dt) {
    const s = dt / 1000;
    p.age += dt;
    if (p.drag) { const k = Math.max(0, 1 - p.drag * s); p.vx *= k; p.vy *= k; }
    p.vy += p.g * s;
    p.x += p.vx * s;
    p.y += p.vy * s;
    p.rot += p.vr * s;
    if (p.grow) p.size = Math.max(0.2, p.size + p.grow * s);
    if (p.ground !== null && p.y > p.ground) {
      p.y = p.ground;
      if (p.kind === 'coins' && Math.abs(p.vy) > 60) { p.vy *= -0.35; p.vx *= 0.6; } else { p.vy = 0; p.vx *= 0.5; p.g = 0; p.vr = 0; p.landed = true; }
    }
    if (p.kind === 'hearts' || p.kind === 'notes' || p.kind === 'bubbles') p.x += Math.sin(p.age / 160 + p.seed) * 0.25;
    if (p.kind === 'leaves' || p.kind === 'feathers') p.x += Math.sin(p.age / 230 + p.seed) * 0.45;
  }

  function drawParticle(c, p, x, y, z) {
    const k = p.age / p.life, fade = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
    const s = p.size * z;
    c.globalAlpha = clamp(fade, 0, 1);
    switch (p.kind) {
      case 'sparks':
        c.strokeStyle = p.color; c.lineWidth = s; c.lineCap = 'round';
        c.beginPath(); c.moveTo(x, y); c.lineTo(x - p.vx * 0.03 * z, y - p.vy * 0.03 * z); c.stroke();
        break;
      case 'smoke': case 'dust':
        c.globalAlpha *= p.kind === 'smoke' ? 0.55 : 0.5;
        c.fillStyle = p.color; c.beginPath(); c.arc(x, y, s, 0, TAU); c.fill();
        break;
      case 'blood':
        c.fillStyle = p.color; c.beginPath();
        if (p.landed) c.ellipse(x, y, s * 1.6, s * 0.7, 0, 0, TAU); else c.arc(x, y, s, 0, TAU);
        c.fill();
        break;
      case 'coins': {
        const w = Math.abs(Math.cos(p.rot)) * s + 0.4 * z;
        c.fillStyle = p.color; c.strokeStyle = '#7a5a10'; c.lineWidth = Math.max(0.8, 0.6 * z);
        c.beginPath(); c.ellipse(x, y, w, s, 0, 0, TAU); c.fill(); c.stroke();
        break;
      }
      case 'hearts':
        c.fillStyle = p.color; c.beginPath();
        c.moveTo(x, y + s * 0.9);
        c.bezierCurveTo(x - s * 1.5, y - s * 0.1, x - s * 0.8, y - s * 1.2, x, y - s * 0.45);
        c.bezierCurveTo(x + s * 0.8, y - s * 1.2, x + s * 1.5, y - s * 0.1, x, y + s * 0.9);
        c.fill();
        break;
      case 'glitter': case 'ice': {
        const tw = p.kind === 'glitter' ? 0.6 + 0.4 * Math.sin(p.age / 50 + p.seed) : 1;
        c.fillStyle = p.color; c.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = p.rot + i * Math.PI / 4, r = (i % 2 ? 0.35 : 1) * s * tw * (p.kind === 'ice' ? 1.2 : 1.4);
          if (i === 0) c.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); else c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        }
        c.closePath(); c.fill();
        break;
      }
      case 'leaves': case 'feathers':
        c.save(); c.translate(x, y); c.rotate(p.rot);
        c.fillStyle = p.color; c.beginPath(); c.ellipse(0, 0, s * 1.3, s * 0.5, 0, 0, TAU); c.fill();
        c.strokeStyle = rgba('#000000', 0.35); c.lineWidth = Math.max(0.5, 0.4 * z);
        c.beginPath(); c.moveTo(-s * 1.2, 0); c.lineTo(s * 1.2, 0); c.stroke();
        c.restore();
        break;
      case 'bubbles': case 'poison':
        c.strokeStyle = p.color; c.lineWidth = Math.max(0.7, 0.5 * z);
        c.fillStyle = rgba(p.color, p.kind === 'poison' ? 0.45 : 0.18);
        c.beginPath(); c.arc(x, y, s, 0, TAU); c.fill(); c.stroke();
        c.fillStyle = 'rgba(255,255,255,0.75)'; c.beginPath(); c.arc(x - s * 0.35, y - s * 0.35, s * 0.28, 0, TAU); c.fill();
        break;
      case 'notes':
        c.fillStyle = p.color; c.strokeStyle = p.color; c.lineWidth = Math.max(0.8, s * 0.25);
        c.beginPath(); c.ellipse(x, y, s * 0.6, s * 0.45, -0.4, 0, TAU); c.fill();
        c.beginPath(); c.moveTo(x + s * 0.5, y); c.lineTo(x + s * 0.5, y - s * 1.7); c.lineTo(x + s * 1.1, y - s * 1.2); c.stroke();
        break;
      case 'runes': {
        c.strokeStyle = p.color; c.lineWidth = Math.max(0.8, s * 0.3); c.lineCap = 'round';
        const v = p.seed % 4;
        c.beginPath(); c.moveTo(x, y - s); c.lineTo(x, y + s);
        if (v === 0) { c.moveTo(x, y - s * 0.3); c.lineTo(x + s * 0.8, y - s); }
        else if (v === 1) { c.moveTo(x - s * 0.8, y - s * 0.6); c.lineTo(x + s * 0.8, y + s * 0.2); }
        else if (v === 2) { c.moveTo(x, y - s); c.lineTo(x + s * 0.8, y - s * 0.2); c.lineTo(x, y + s * 0.4); }
        else { c.moveTo(x - s * 0.7, y + s * 0.3); c.lineTo(x, y - s * 0.4); c.lineTo(x + s * 0.7, y + s * 0.3); }
        c.stroke();
        break;
      }
      case 'fire': // layered discs (drawn additively) instead of a gradient per particle
        c.fillStyle = rgba(p.color, 0.35); c.beginPath(); c.arc(x, y, s * 1.6, 0, TAU); c.fill();
        c.fillStyle = rgba(p.color, 0.75); c.beginPath(); c.arc(x, y, s, 0, TAU); c.fill();
        c.fillStyle = rgba('#fff3b0', 0.9); c.beginPath(); c.arc(x, y, s * 0.45, 0, TAU); c.fill();
        break;
      case 'zap': {
        c.strokeStyle = p.color; c.lineWidth = Math.max(1, 1.2 * z); c.lineCap = 'round';
        c.beginPath(); c.moveTo(x, y);
        let px = x, py = y;
        for (let i = 1; i <= 4; i++) {
          const d = (p.size * z * i) / 4, j = (Math.random() - 0.5) * 5 * z;
          px = x + Math.cos(p.rot) * d - Math.sin(p.rot) * j; py = y + Math.sin(p.rot) * d + Math.cos(p.rot) * j;
          c.lineTo(px, py);
        }
        c.stroke();
        break;
      }
      default:
        c.fillStyle = p.color; c.beginPath(); c.arc(x, y, s, 0, TAU); c.fill();
    }
    c.globalAlpha = 1;
  }

  /** Spawn a particle burst effect at a world anchor (oy: zoom-1 px offset, e.g. -14 for body height). */
  function burst(at, kind, count, color, oy, spread) {
    if (!at) return null;
    if (!PK[kind]) kind = 'sparks';
    const n = clamp(Math.round(num(count, PK[kind].n)), 1, 80);
    const parts = [];
    for (let i = 0; i < n; i++) parts.push(makeParticle(kind, color, spread));
    let life = 0;
    for (let i = 0; i < parts.length; i++) life = Math.max(life, parts[i].life);
    return addEffect({
      layer: 'world', at: { x: at.x, y: at.y, h: num(at.h, 0) }, oy: num(oy, -12), parts: parts, life: life + 50, add: !!PK[kind].add,
      tick: function (e, dt) { for (let i = 0; i < e.parts.length; i++) stepParticle(e.parts[i], dt); },
      draw: function (c, e, view) {
        const o = project(view, e.at, 0, e.oy), z = view.zoom;
        const prev = c.globalCompositeOperation;
        if (e.add) c.globalCompositeOperation = 'lighter';
        for (let i = 0; i < e.parts.length; i++) {
          const p = e.parts[i];
          if (p.age >= p.life) continue;
          drawParticle(c, p, o.x + p.x * z, o.y + p.y * z, z);
        }
        c.globalCompositeOperation = prev;
      },
    });
  }

  // ---- projectiles -------------------------------------------------------------------------------------------
  // arc: 0 straight .. 1 full lob · spin: rad/s (0 = align with flight) · trail: glowing trail · burst: impact particles
  const PROJ = {
    arrow: { arc: 0.22, sound: 'arrow', burst: 'sparks', n: 5 },
    bolt: { arc: 0, sound: 'magic', trail: true, burst: 'glitter', n: 10, color: '#9fd0ff' },
    fireball: { arc: 0.12, sound: 'fire', trail: true, burst: 'fire', n: 18, color: '#ff8a1a' },
    orb: { arc: 0, sound: 'magic', trail: true, burst: 'glitter', n: 12, color: '#c48aff' },
    rock: { arc: 1, sound: 'arrow', spin: 9, burst: 'dust', n: 8 },
    flask: { arc: 1, sound: 'arrow', spin: 12, burst: 'bubbles', n: 12, color: '#7be04a' },
    coin: { arc: 1, sound: 'coin', spin: 16, burst: 'coins', n: 4, color: '#ffd23f' },
    note: { arc: 0.15, sound: 'magic', burst: 'notes', n: 4, color: '#ffd76a' },
    dagger: { arc: 0.12, sound: 'slash', burst: 'sparks', n: 5 },
    feather: { arc: 0.3, sound: 'arrow', burst: 'feathers', n: 4, color: '#2b2a35' },
    bone: { arc: 1, sound: 'arrow', spin: 13, burst: 'dust', n: 6, color: '#efe6d2' },
    custom: { arc: 0, sound: 'magic', burst: 'sparks', n: 6 },
  };

  /** Flight progress 0..1, driven by the blocking FX event so impact lines up with the next event. */
  function projProgress(e) {
    return e.evt && e.evt.ms > 0 && !e.evt.done ? clamp(num(e.evt.elapsed, 0) / e.evt.ms, 0, 1) : clamp(e.age / e.life, 0, 1);
  }
  function projPoint(view, e, p) {
    const a = project(view, e.from, 0, -14), b = project(view, e.to, 0, -12);
    const dist = Math.hypot(b.x - a.x, b.y - a.y) / Math.max(0.2, view.zoom);
    const arcH = e.arcPx !== null ? e.arcPx : e.arc * (16 + dist * 0.28);
    return { x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p) - arcH * view.zoom * 4 * p * (1 - p) };
  }

  function drawProjectileBody(c, e, x, y, ang, z, t) {
    const color = e.color, s = e.size * z;
    c.save();
    c.translate(x, y);
    const spin = e.spec.spin || 0;
    c.rotate(spin ? t * spin : ang);
    c.lineJoin = 'round'; c.lineCap = 'round';
    const OUT = '#1a1014';
    switch (e.kind) {
      case 'arrow':
        c.strokeStyle = OUT; c.lineWidth = 3 * s; c.beginPath(); c.moveTo(-8 * s, 0); c.lineTo(6 * s, 0); c.stroke();
        c.strokeStyle = '#a0703f'; c.lineWidth = 1.5 * s; c.stroke();
        c.fillStyle = '#d6dbe3'; c.strokeStyle = OUT; c.lineWidth = 1 * s;
        c.beginPath(); c.moveTo(9 * s, 0); c.lineTo(4.5 * s, -2.6 * s); c.lineTo(4.5 * s, 2.6 * s); c.closePath(); c.fill(); c.stroke();
        c.fillStyle = col(e.evtColor, '#f3efe6');
        c.beginPath(); c.moveTo(-8 * s, 0); c.lineTo(-11 * s, -3 * s); c.lineTo(-6 * s, 0); c.lineTo(-11 * s, 3 * s); c.closePath(); c.fill();
        break;
      case 'bolt': {
        const g = c.createRadialGradient(0, 0, 0, 0, 0, 10 * s);
        g.addColorStop(0, rgba(color, 0.7)); g.addColorStop(1, rgba(color, 0));
        c.fillStyle = g; c.beginPath(); c.arc(0, 0, 10 * s, 0, TAU); c.fill();
        c.fillStyle = color; c.beginPath(); c.ellipse(0, 0, 7 * s, 2.8 * s, 0, 0, TAU); c.fill();
        c.fillStyle = '#ffffff'; c.beginPath(); c.ellipse(1.2 * s, 0, 4 * s, 1.3 * s, 0, 0, TAU); c.fill();
        break;
      }
      case 'fireball': {
        const g = c.createRadialGradient(0, 0, 0, 0, 0, 13 * s);
        g.addColorStop(0, rgba('#ffe066', 0.85)); g.addColorStop(0.4, rgba(color, 0.55)); g.addColorStop(1, rgba(color, 0));
        c.fillStyle = g; c.beginPath(); c.arc(0, 0, 13 * s, 0, TAU); c.fill();
        c.fillStyle = color;
        c.beginPath(); c.moveTo(-11 * s, 0); c.quadraticCurveTo(-4 * s, -6 * s, 4 * s, -4.5 * s); c.arc(3 * s, 0, 4.6 * s, -1.3, 1.3); c.quadraticCurveTo(-4 * s, 6 * s, -11 * s, 0); c.fill();
        c.fillStyle = '#ffe066'; c.beginPath(); c.arc(3 * s, 0, 2.8 * s, 0, TAU); c.fill();
        c.fillStyle = '#ffffff'; c.beginPath(); c.arc(3.8 * s, -0.6 * s, 1.1 * s, 0, TAU); c.fill();
        break;
      }
      case 'orb': {
        const g = c.createRadialGradient(0, 0, 0, 0, 0, 11 * s);
        g.addColorStop(0, rgba(color, 0.75)); g.addColorStop(1, rgba(color, 0));
        c.fillStyle = g; c.beginPath(); c.arc(0, 0, 11 * s, 0, TAU); c.fill();
        c.fillStyle = color; c.strokeStyle = OUT; c.lineWidth = 1.2 * s;
        c.beginPath(); c.arc(0, 0, 4.4 * s, 0, TAU); c.fill(); c.stroke();
        c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 1 * s;
        c.beginPath(); c.arc(0, 0, 2.6 * s, t * 9, t * 9 + 3.6); c.stroke();
        c.fillStyle = '#ffffff'; c.beginPath(); c.arc(-1.4 * s, -1.6 * s, 1.1 * s, 0, TAU); c.fill();
        break;
      }
      case 'rock':
        c.fillStyle = col(e.evtColor, '#8f8a80'); c.strokeStyle = OUT; c.lineWidth = 1.3 * s;
        c.beginPath();
        for (let i = 0; i < 7; i++) {
          const a = i * TAU / 7, r = (3.6 + ((i * 5) % 3) * 0.7) * s;
          if (i === 0) c.moveTo(Math.cos(a) * r, Math.sin(a) * r); else c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        c.closePath(); c.fill(); c.stroke();
        c.fillStyle = 'rgba(255,255,255,0.35)'; c.beginPath(); c.arc(-1.2 * s, -1.2 * s, 1.2 * s, 0, TAU); c.fill();
        break;
      case 'flask':
        c.fillStyle = 'rgba(223,244,255,0.7)'; c.strokeStyle = OUT; c.lineWidth = 1.1 * s;
        c.beginPath(); c.rect(-1.1 * s, -6 * s, 2.2 * s, 3 * s); c.fill(); c.stroke();
        c.fillStyle = '#8a5a33'; c.beginPath(); c.rect(-1.4 * s, -7.4 * s, 2.8 * s, 1.6 * s); c.fill();
        c.fillStyle = color; c.beginPath(); c.arc(0, 0, 3.8 * s, 0, TAU); c.fill(); c.stroke();
        c.fillStyle = 'rgba(255,255,255,0.8)'; c.beginPath(); c.arc(-1.3 * s, -1.3 * s, 1 * s, 0, TAU); c.fill();
        break;
      case 'coin': {
        c.rotate(-(spin ? t * spin : ang));
        const w = Math.max(0.6, Math.abs(Math.cos(t * 14)) * 3.6) * s;
        c.fillStyle = color; c.strokeStyle = '#7a5a10'; c.lineWidth = 1 * s;
        c.beginPath(); c.ellipse(0, 0, w, 3.6 * s, 0, 0, TAU); c.fill(); c.stroke();
        c.fillStyle = 'rgba(255,255,255,0.8)'; c.beginPath(); c.ellipse(-w * 0.3, -1.2 * s, w * 0.25, 0.9 * s, 0, 0, TAU); c.fill();
        break;
      }
      case 'note': {
        c.rotate(-ang + Math.sin(t * 12) * 0.3);
        c.fillStyle = color; c.strokeStyle = color; c.lineWidth = 1.3 * s;
        c.beginPath(); c.ellipse(-1.5 * s, 2 * s, 2.4 * s, 1.8 * s, -0.4, 0, TAU); c.fill();
        c.beginPath(); c.moveTo(0.6 * s, 1.6 * s); c.lineTo(0.6 * s, -5.5 * s); c.lineTo(4 * s, -3 * s); c.stroke();
        break;
      }
      case 'dagger':
        c.fillStyle = col(e.evtColor, '#d6dbe3'); c.strokeStyle = OUT; c.lineWidth = 1 * s;
        c.beginPath(); c.moveTo(8 * s, 0); c.lineTo(0, -1.8 * s); c.lineTo(0, 1.8 * s); c.closePath(); c.fill(); c.stroke();
        c.fillStyle = '#6b4a30'; c.beginPath(); c.rect(-4.5 * s, -1 * s, 4.5 * s, 2 * s); c.fill(); c.stroke();
        c.beginPath(); c.rect(-0.6 * s, -3 * s, 1.2 * s, 6 * s); c.fillStyle = '#b08d57'; c.fill(); c.stroke();
        break;
      case 'feather':
        c.rotate(Math.sin(t * 10) * 0.4);
        c.fillStyle = color; c.strokeStyle = OUT; c.lineWidth = 0.8 * s;
        c.beginPath(); c.ellipse(0, 0, 6.5 * s, 2.2 * s, 0, 0, TAU); c.fill(); c.stroke();
        c.strokeStyle = 'rgba(255,255,255,0.5)'; c.beginPath(); c.moveTo(-7 * s, 0); c.lineTo(6 * s, 0); c.stroke();
        break;
      case 'bone':
        c.strokeStyle = OUT; c.lineWidth = 3.6 * s; c.beginPath(); c.moveTo(-5 * s, 0); c.lineTo(5 * s, 0); c.stroke();
        c.strokeStyle = color; c.lineWidth = 2 * s; c.stroke();
        c.fillStyle = color; c.strokeStyle = OUT; c.lineWidth = 1 * s;
        for (let i = 0; i < 4; i++) { c.beginPath(); c.arc((i < 2 ? -5.5 : 5.5) * s, (i % 2 ? 1.4 : -1.4) * s, 1.7 * s, 0, TAU); c.fill(); c.stroke(); }
        break;
      default: {
        const g = c.createRadialGradient(0, 0, 0, 0, 0, 8 * s);
        g.addColorStop(0, rgba(color, 0.9)); g.addColorStop(1, rgba(color, 0));
        c.fillStyle = g; c.beginPath(); c.arc(0, 0, 8 * s, 0, TAU); c.fill();
      }
    }
    c.restore();
  }

  function addProjectile(evt) {
    const kind = PROJ[evt.kind] ? evt.kind : 'bolt';
    const spec = PROJ[kind];
    const from = posOf(evt.from), to = posOf(evt.to);
    if (!from || !to) return null;
    const arc = evt.arc === true ? 1 : evt.arc === false ? 0 : spec.arc;
    return addEffect({
      layer: 'world', kind: kind, spec: spec, from: from, to: to, evt: evt,
      life: Math.max(60, num(evt.ms, 260)),
      arc: arc, arcPx: typeof evt.arc === 'number' ? evt.arc : null,
      color: col(evt.color !== '#ffffff' ? evt.color : null, spec.color || '#ffffff'), evtColor: evt.color,
      size: clamp(num(evt.size, 1), 0.3, 4), trail: evt.trail !== undefined ? !!evt.trail : !!spec.trail,
      embers: 0,
      tick: function (e, dt) { // fireballs shed embers along their flight path
        if (e.kind !== 'fireball') return;
        e.embers += dt;
        if (e.embers < 34) return;
        e.embers = 0;
        const p = projProgress(e), d = screenDelta(e.from, e.to);
        const arcH = e.arcPx !== null ? e.arcPx : e.arc * (16 + Math.hypot(d.x, d.y) * 0.28);
        const at = { x: lerp(e.from.x, e.to.x, p), y: lerp(e.from.y, e.to.y, p), h: lerp(e.from.h, e.to.h, p) };
        burst(at, 'fire', 2, null, lerp(-14, -12, p) - arcH * 4 * p * (1 - p), 0.3);
      },
      draw: function (c, e, view) {
        const p = projProgress(e);
        const pt = projPoint(view, e, p), ahead = projPoint(view, e, Math.min(1, p + 0.02));
        const ang = Math.atan2(ahead.y - pt.y, ahead.x - pt.x) || Math.atan2(project(view, e.to).y - project(view, e.from).y, project(view, e.to).x - project(view, e.from).x);
        if (e.trail) {
          const prev = c.globalCompositeOperation;
          c.globalCompositeOperation = 'lighter';
          for (let k = 1; k <= 7; k++) {
            const q = p - k * 0.03;
            if (q <= 0) break;
            const tp = projPoint(view, e, q);
            c.fillStyle = rgba(e.color, 0.4 * (1 - k / 8));
            c.beginPath(); c.arc(tp.x, tp.y, (5 - k * 0.5) * e.size * view.zoom, 0, TAU); c.fill();
          }
          c.globalCompositeOperation = prev;
        }
        if (e.kind === 'custom' && e.evt && typeof e.evt.draw === 'function' && !e.customBroken) {
          let ok = false;
          DD.safe('FX projectile draw', function () { e.evt.draw(c, pt.x, pt.y, p, view, e.evt); ok = true; });
          if (ok) return;
          e.customBroken = true;
        }
        drawProjectileBody(c, e, pt.x, pt.y, ang, view.zoom, e.age / 1000);
      },
    });
  }

  // ---- beams ------------------------------------------------------------------------------------------------
  function addBeam(evt) {
    const from = posOf(evt.from), to = posOf(evt.to);
    if (!from || !to) return null;
    const color = col(evt.color, '#ff4444');
    const zig = evt.kind === 'lightning' || evt.zigzag === true;
    return addEffect({
      layer: 'world', from: from, to: to, evt: evt, color: color, width: clamp(num(evt.width, 6), 1, 40), zig: zig,
      life: Math.max(80, num(evt.ms, 330)), seed: Math.random() * 1000,
      draw: function (c, e, view) {
        const t = clamp(e.age / e.life, 0, 1);
        const env = t < 0.15 ? t / 0.15 : t > 0.72 ? (1 - t) / 0.28 : 1;
        const a = project(view, e.from, 0, -15), b = project(view, e.to, 0, -12);
        const z = view.zoom, w = e.width * z * (0.55 + 0.45 * env) * (0.9 + 0.1 * Math.sin(e.age * 0.08));
        const pts = [a];
        if (e.zig) {
          const n = 7, k = Math.floor(e.age / 45);
          for (let i = 1; i < n; i++) {
            const f = i / n, j = (Math.sin(e.seed + k * 7.3 + i * 12.9) * 0.5) * 14 * z;
            const nx = -(b.y - a.y), ny = b.x - a.x, len = Math.hypot(nx, ny) || 1;
            pts.push({ x: lerp(a.x, b.x, f) + nx / len * j, y: lerp(a.y, b.y, f) + ny / len * j });
          }
        }
        pts.push(b);
        const line = function (width, style) {
          c.strokeStyle = style; c.lineWidth = width; c.lineCap = 'round'; c.lineJoin = 'round';
          c.beginPath(); c.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
          c.stroke();
        };
        const prev = c.globalCompositeOperation;
        c.globalCompositeOperation = 'lighter';
        line(w * 2.6, rgba(e.color, 0.25 * env));
        line(w, rgba(e.color, 0.9 * env));
        line(Math.max(1, w * 0.35), rgba('#ffffff', 0.95 * env));
        const fl = c.createRadialGradient(b.x, b.y, 0, b.x, b.y, w * 2.4);
        fl.addColorStop(0, rgba('#ffffff', 0.9 * env)); fl.addColorStop(0.4, rgba(e.color, 0.6 * env)); fl.addColorStop(1, rgba(e.color, 0));
        c.fillStyle = fl; c.beginPath(); c.arc(b.x, b.y, w * 2.4, 0, TAU); c.fill();
        const sf = c.createRadialGradient(a.x, a.y, 0, a.x, a.y, w * 1.5);
        sf.addColorStop(0, rgba('#ffffff', 0.8 * env)); sf.addColorStop(1, rgba(e.color, 0));
        c.fillStyle = sf; c.beginPath(); c.arc(a.x, a.y, w * 1.5, 0, TAU); c.fill();
        c.globalCompositeOperation = prev;
      },
    });
  }

  // ---- explosions ------------------------------------------------------------------------------------------------
  function addExplosion(evt) {
    const at = posOf(evt.at);
    if (!at) return null;
    const color = col(evt.color, '#ff8a1a'), radius = clamp(num(evt.radius, 1), 0, 8);
    const fiery = !evt.kind || evt.kind === 'fire';
    burst(at, fiery ? 'fire' : 'glitter', 18 + radius * 8, fiery ? null : color, -8, 1.4 + radius);
    burst(at, 'smoke', 8 + radius * 4, null, -10, 1.6 + radius);
    burst(at, 'sparks', 12 + radius * 4, fiery ? null : color, -10, 1);
    if (evt.shake !== false) addShake(3 + radius * 2.5, 280 + radius * 60);
    return addEffect({
      layer: 'world', at: at, color: color, radius: radius, life: 650,
      draw: function (c, e, view) {
        const k = clamp(e.age / e.life, 0, 1), z = view.zoom;
        const o = project(view, e.at, 0, 0);
        const R = (e.radius + 0.55) * 32 * z;
        c.save();
        c.fillStyle = rgba('#1a1014', 0.28 * (1 - k));
        c.beginPath(); c.ellipse(o.x, o.y, R * 0.8, R * 0.4, 0, 0, TAU); c.fill();
        const rk = easeOut(Math.min(1, k * 1.6));
        c.strokeStyle = rgba(e.color, 0.85 * (1 - k)); c.lineWidth = Math.max(1, (7 * (1 - k) + 1) * z);
        c.beginPath(); c.ellipse(o.x, o.y, R * rk, R * rk * 0.5, 0, 0, TAU); c.stroke();
        c.strokeStyle = rgba('#ffffff', 0.6 * (1 - k)); c.lineWidth = Math.max(1, 2 * (1 - k) * z);
        c.beginPath(); c.ellipse(o.x, o.y, R * rk * 0.92, R * rk * 0.46, 0, 0, TAU); c.stroke();
        if (k < 0.45) {
          const fk = k / 0.45, fr = R * (0.35 + 0.65 * easeOut(fk));
          const g = c.createRadialGradient(o.x, o.y - 10 * z, 0, o.x, o.y - 10 * z, fr);
          g.addColorStop(0, rgba('#ffffff', 0.95 * (1 - fk))); g.addColorStop(0.35, rgba('#ffe066', 0.85 * (1 - fk)));
          g.addColorStop(0.7, rgba(e.color, 0.6 * (1 - fk))); g.addColorStop(1, rgba(e.color, 0));
          c.globalCompositeOperation = 'lighter';
          c.fillStyle = g; c.beginPath(); c.arc(o.x, o.y - 10 * z, fr, 0, TAU); c.fill();
        }
        c.restore();
      },
    });
  }

  // ---- tile pulses -------------------------------------------------------------------------------------------------
  const TILE_COLORS = { pulse: '#ffd76a', glow: '#ffe9a0', crack: '#2a1d16', splash: '#7fc8ff' };
  function diamond(c, x, y, hw, hh) { c.beginPath(); c.moveTo(x, y - hh); c.lineTo(x + hw, y); c.lineTo(x, y + hh); c.lineTo(x - hw, y); c.closePath(); }
  function addTilePulse(evt) {
    const at = posOf(evt.at);
    if (!at) return null;
    const kind = TILE_COLORS[evt.kind] ? evt.kind : 'pulse';
    const color = col(evt.color, TILE_COLORS[kind]);
    if (kind === 'crack') burst(at, 'dust', 8, null, 0, 1.6);
    if (kind === 'splash') burst(at, 'bubbles', 10, color, -2, 1.6);
    const seed = (Math.round(at.x) * 73856093) ^ (Math.round(at.y) * 19349663);
    return addEffect({
      layer: 'world', at: at, kind: kind, color: color, seed: seed, life: num(evt.dur, kind === 'glow' ? 800 : kind === 'crack' ? 1100 : 700),
      draw: function (c, e, view) {
        const k = clamp(e.age / e.life, 0, 1), z = view.zoom, o = project(view, e.at, 0, 0);
        const hw = 32 * z, hh = 16 * z;
        c.save();
        if (e.kind === 'pulse') {
          const s = 0.85 + 0.35 * easeOut(k);
          diamond(c, o.x, o.y, hw * s, hh * s);
          c.strokeStyle = rgba(e.color, 0.9 * (1 - k)); c.lineWidth = Math.max(1, 3 * z * (1 - k * 0.6)); c.stroke();
          diamond(c, o.x, o.y, hw * 0.9, hh * 0.9);
          c.fillStyle = rgba(e.color, 0.25 * (1 - k)); c.fill();
        } else if (e.kind === 'glow') {
          const a = k < 0.2 ? k / 0.2 : 1 - (k - 0.2) / 0.8;
          diamond(c, o.x, o.y, hw * 0.96, hh * 0.96);
          c.globalCompositeOperation = 'lighter';
          c.fillStyle = rgba(e.color, 0.5 * a); c.fill();
          c.strokeStyle = rgba('#ffffff', 0.5 * a); c.lineWidth = Math.max(1, 1.5 * z); c.stroke();
        } else if (e.kind === 'crack') {
          const a = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
          c.strokeStyle = rgba(e.color, 0.85 * a); c.lineWidth = Math.max(1, 1.6 * z); c.lineCap = 'round';
          for (let i = 0; i < 5; i++) {
            const ang = (i / 5) * TAU + ((e.seed >> (i * 3)) & 7) * 0.12;
            let px = o.x, py = o.y;
            c.beginPath(); c.moveTo(px, py);
            for (let j = 1; j <= 3; j++) {
              const r = j / 3 * Math.min(1, k * 4), jit = (((e.seed >> (i + j)) & 3) - 1.5) * 0.18;
              px = o.x + Math.cos(ang + jit) * hw * 0.85 * r; py = o.y + Math.sin(ang + jit) * hh * 0.85 * r;
              c.lineTo(px, py);
            }
            c.stroke();
          }
        } else {
          for (let i = 0; i < 2; i++) {
            const kk = clamp(k * 1.3 - i * 0.25, 0, 1);
            if (kk <= 0) continue;
            c.strokeStyle = rgba(e.color, 0.8 * (1 - kk)); c.lineWidth = Math.max(1, 2 * z);
            c.beginPath(); c.ellipse(o.x, o.y, hw * 0.85 * kk, hh * 0.85 * kk, 0, 0, TAU); c.stroke();
          }
        }
        c.restore();
      },
    });
  }

  // ---- floating text (damage/heal numbers, status popups, generic text) -------------------------------------------
  const ELEMENT_COLORS = {
    physical: '#ffffff', fire: '#ff8a2a', frost: '#8fd8ff', ice: '#8fd8ff', cold: '#8fd8ff', lightning: '#ffe94a', thunder: '#ffe94a',
    poison: '#8be04a', acid: '#c4ff4a', holy: '#ffe9a0', radiant: '#ffe9a0', shadow: '#b48cff', necrotic: '#b48cff', dark: '#b48cff',
    psychic: '#ff8ad8', arcane: '#c48aff', blood: '#ff4a5a', bleed: '#ff4a5a', force: '#bfe6ff', water: '#7fc8ff',
  };
  const STACK_PX = 20;

  /** Count live floating texts on the same unit/tile (so rapid hits stack instead of overlapping). */
  function stackIndex(key) {
    let n = 0;
    for (let i = 0; i < effects.length; i++) {
      const e = effects[i];
      if (e.floatKey === key && !e.dead && e.age < 420) n++;
    }
    return n;
  }

  /**
   * opts: { unit, at, text, color, size, font, crit, sub, subColor, icon, pill, life, rise, pop }
   */
  function addFloat(opts) {
    const u = opts.unit || null;
    const at = u ? visPos(u) : posOf(opts.at);
    if (!at) return null;
    const key = u ? 'u:' + u.id : 't:' + Math.round(at.x) + ',' + Math.round(at.y);
    return addEffect({
      layer: 'screen', floatKey: key, unit: u, at: at, stack: stackIndex(key),
      text: String(opts.text), color: col(opts.color, '#ffffff'), size: clamp(num(opts.size, 16), 8, 64),
      font: opts.font || TEXT_FONT, crit: !!opts.crit, sub: opts.sub || null, subColor: opts.subColor || '#cfd8e3',
      icon: opts.icon || null, pill: !!opts.pill, life: num(opts.life, 1100), rise: num(opts.rise, 30), pop: opts.pop !== false,
      head: u ? unitHeight(u) : 14, jx: (Math.random() - 0.5) * 10,
      draw: drawFloat,
    });
  }

  function drawFloat(c, e, view) {
    const k = clamp(e.age / e.life, 0, 1);
    const anc = unitAnchor(e);
    const base = project(view, anc.at, anc.ox, anc.oy - e.head - 6);
    const zs = clamp(0.55 + view.zoom * 0.4, 0.8, 1.35);
    const x = base.x + e.jx * zs, y = base.y - (easeOut(k) * e.rise + e.stack * STACK_PX) * zs;
    let sc = 1;
    if (e.pop && k < 0.16) sc = 1 + (1 - easeOutBack(k / 0.16)) * 0.9 + (e.crit ? 0.4 : 0) * (1 - k / 0.16);
    const alpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
    const size = e.size * zs * sc * (e.crit ? 1.35 : 1);
    c.save();
    c.globalAlpha = alpha;
    if (e.crit) {
      c.translate(x, y); c.rotate(Math.sin(e.age * 0.05) * 0.06); c.translate(-x, -y);
      c.fillStyle = rgba('#ffe066', 0.35);
      c.beginPath();
      for (let i = 0; i < 16; i++) {
        const a = i * TAU / 16 + e.age * 0.002, r = (i % 2 ? 0.55 : 1) * size * 1.15;
        if (i === 0) c.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.75); else c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.75);
      }
      c.closePath(); c.fill();
    }
    if (e.pill) {
      c.font = 'bold ' + Math.round(size) + 'px ' + TEXT_FONT;
      const label = (e.icon ? e.icon + ' ' : '') + e.text;
      const w = c.measureText(label).width + size * 1.1, h = size * 1.55;
      c.beginPath(); roundRect(c, x - w / 2, y - h / 2, w, h, h / 2);
      c.fillStyle = 'rgba(24,14,22,0.82)'; c.fill();
      c.lineWidth = Math.max(1, 1.5 * zs); c.strokeStyle = rgba(e.color, 0.95); c.stroke();
      c.fillStyle = e.color; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(label, x, y + size * 0.04);
    } else {
      outlinedText(c, e.text, x, y, size, e.color, null, e.font, e.font === NUM_FONT ? 'normal' : 'bold');
      if (e.sub) {
        c.font = 'bold ' + Math.round(size * 0.55) + 'px ' + TEXT_FONT;
        const w = c.measureText(e.text).width;
        outlinedText(c, e.sub, x + w * 0.5 + size * 0.75, y + size * 0.15, size * 0.55, e.subColor);
      }
    }
    c.restore();
  }

  // ---- speech-bubble barks -------------------------------------------------------------------------------------------
  let barkSeq = 0;
  function addBark(u, text, dur) {
    for (let i = 0; i < effects.length; i++) if (effects[i].barkOf === u.id) effects[i].dead = true;
    return addEffect({
      layer: 'screen', barkOf: u.id, unit: u, at: visPos(u), text: String(text), life: clamp(num(dur, 2400), 400, 12000) + 260,
      head: unitHeight(u), lines: null, speedCap: 2, seq: ++barkSeq,
      draw: drawBark,
    });
  }

  /**
   * Natural bubble box over the head: { head, bx, by, bw, bh, tail, zs, fs, lh, pad }. The anchor sits above the unit's
   * own HP widget when the renderer reports it (view.widgets), so a bark never covers its speaker's HP bar.
   */
  function barkGeom(c, e, view) {
    const anc = unitAnchor(e);
    const head = project(view, anc.at, anc.ox, anc.oy - e.head - 4);
    const wb = e.unit && view.widgets ? view.widgets[e.unit.id] : null;
    if (wb && isFinite(wb.y0) && head.x > wb.x0 - 40 && head.x < wb.x1 + 40) head.y = Math.min(head.y, wb.y0 - 1);
    const zs = clamp(view.zoom, 0.85, 1.25);
    const fs = Math.round(12.5 * zs), pad = 7 * zs, maxW = 176 * zs;
    c.font = 'bold ' + fs + 'px ' + TEXT_FONT;
    if (!e.lines || e.linesFs !== fs) { e.lines = wrapLines(c, e.text, maxW); e.linesFs = fs; }
    let tw = 0;
    for (let i = 0; i < e.lines.length; i++) tw = Math.max(tw, c.measureText(e.lines[i]).width);
    const lh = fs * 1.22, bw = tw + pad * 2, bh = e.lines.length * lh + pad * 1.4, tail = 9 * zs;
    const W = num(view.width, 800), H = num(view.height, 600), m = 6;
    const bx = clamp(head.x - bw / 2, m, Math.max(m, W - m - bw));
    const by = clamp(head.y - tail - bh, m, Math.max(m, H - m - bh - tail));
    return { head: head, bx: bx, by: by, bw: bw, bh: bh, tail: tail, zs: zs, fs: fs, lh: lh, pad: pad, W: W, H: H };
  }

  /**
   * Several barks at once (a boss and his cameos, a crowd around a fight): older bubbles keep their spot, newer ones
   * move above the bubbles they would cover (or beside them at the top of the screen) and keep a leader to the head.
   */
  function layoutBarks(view) {
    const c = view.ctx, placed = [];
    const barks = effects.filter(function (e) { return e.barkOf !== undefined && !e.dead && e.draw === drawBark; });
    barks.sort(function (a, b) { return a.seq - b.seq; });
    c.save();
    for (let i = 0; i < barks.length; i++) {
      const e = barks[i], g = barkGeom(c, e, view), gap = 4;
      for (let guard = 0; guard < 8; guard++) {
        let hit = null;
        for (let k = 0; k < placed.length; k++) {
          const o = placed[k];
          if (g.bx < o.bx + o.bw + gap && g.bx + g.bw + gap > o.bx && g.by < o.by + o.bh + gap && g.by + g.bh + gap > o.by) { hit = o; break; }
        }
        if (!hit) break;
        const up = hit.by - gap - g.bh;
        if (up >= 6) g.by = up;
        else g.bx = clamp(hit.bx + hit.bw + gap, 6, Math.max(6, g.W - 6 - g.bw)); // no room above: step aside
      }
      e._geom = g; e._geomAt = view.t;
      placed.push(g);
    }
    c.restore();
  }

  /** Bubbles pushed away from their speaker keep a leader line to the head, drawn under every bubble. */
  function drawBarkLeaders(view) {
    const c = view.ctx;
    for (let i = 0; i < effects.length; i++) {
      const e = effects[i], g = e._geom;
      if (e.dead || e.draw !== drawBark || !g || e._geomAt !== view.t) continue;
      if (g.head.y - (g.by + g.bh) <= g.tail * 1.6) continue;
      const a = clamp(e.age / 130, 0, 1) * clamp((e.life - e.age) / 260, 0, 1);
      const tx = clamp(g.head.x, g.bx + 10 * g.zs, g.bx + g.bw - 10 * g.zs);
      c.save();
      c.globalAlpha = a;
      c.beginPath(); c.moveTo(tx, g.by + g.bh); c.lineTo(g.head.x, g.head.y);
      c.lineCap = 'round'; c.lineWidth = Math.max(2.5, 3.2 * g.zs); c.strokeStyle = 'rgba(42,26,18,0.85)'; c.stroke();
      c.lineWidth = Math.max(1, 1.3 * g.zs); c.strokeStyle = '#fff8e7'; c.stroke();
      c.restore();
    }
  }

  function drawBark(c, e, view) {
    const k = e.age, fadeIn = clamp(k / 130, 0, 1), fadeOut = clamp((e.life - k) / 260, 0, 1);
    c.save();
    const g = e._geom && e._geomAt === view.t ? e._geom : barkGeom(c, e, view);
    const head = g.head, zs = g.zs, bx = g.bx, by = g.by, bw = g.bw, bh = g.bh, tail = g.tail, lh = g.lh, pad = g.pad;
    c.font = 'bold ' + g.fs + 'px ' + TEXT_FONT;
    const tx = clamp(head.x, bx + 10 * zs, bx + bw - 10 * zs);
    const sc = 0.7 + 0.3 * easeOutBack(fadeIn);
    c.globalAlpha = fadeIn * fadeOut;
    c.translate(tx, by + bh);
    c.scale(sc, sc);
    c.translate(-tx, -(by + bh));
    c.beginPath();
    roundRect(c, bx, by, bw, bh, 8 * zs);
    c.fillStyle = 'rgba(0,0,0,0.25)';
    c.save(); c.translate(2 * zs, 3 * zs); c.fill(); c.restore();
    c.beginPath();
    c.moveTo(bx + 8 * zs, by);
    c.lineTo(bx + bw - 8 * zs, by); c.quadraticCurveTo(bx + bw, by, bx + bw, by + 8 * zs);
    c.lineTo(bx + bw, by + bh - 8 * zs); c.quadraticCurveTo(bx + bw, by + bh, bx + bw - 8 * zs, by + bh);
    c.lineTo(tx + 6 * zs, by + bh); c.lineTo(tx - 1 * zs, Math.min(head.y, by + bh + tail)); c.lineTo(tx - 6 * zs, by + bh);
    c.lineTo(bx + 8 * zs, by + bh); c.quadraticCurveTo(bx, by + bh, bx, by + bh - 8 * zs);
    c.lineTo(bx, by + 8 * zs); c.quadraticCurveTo(bx, by, bx + 8 * zs, by);
    c.closePath();
    c.fillStyle = '#fff8e7'; c.fill();
    c.lineWidth = Math.max(1.5, 2 * zs); c.lineJoin = 'round'; c.strokeStyle = '#2a1a12'; c.stroke();
    c.fillStyle = '#2a1a12'; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let i = 0; i < e.lines.length; i++) c.fillText(e.lines[i], bx + bw / 2, by + pad * 0.7 + lh * (i + 0.5));
    c.restore();
  }

  // ---- banner + full-screen flash -------------------------------------------------------------------------------------
  function addBanner(evt) {
    return addEffect({
      layer: 'screen', evt: evt, text: String(evt.text || ''), sub: evt.sub ? String(evt.sub) : '', color: col(evt.color, '#ffd76a'),
      life: Math.max(200, num(evt.ms, 950)), banner: true,
      draw: function (c, e, view) {
        const p = e.evt && e.evt.ms > 0 && !e.evt.done ? clamp(num(e.evt.elapsed, 0) / e.evt.ms, 0, 1) : clamp(e.age / e.life, 0, 1);
        const W = num(view.width, 800), H = num(view.height, 600), cy = H * 0.38;
        const inK = easeOutBack(clamp(p / 0.16, 0, 1)), outK = clamp((p - 0.8) / 0.2, 0, 1);
        const a = clamp(p / 0.08, 0, 1) * (1 - outK);
        const bandH = (e.sub ? 118 : 96) * clamp(W / 1280, 0.7, 1.2);
        c.save();
        c.globalAlpha = a;
        const g = c.createLinearGradient(0, cy - bandH / 2, 0, cy + bandH / 2);
        g.addColorStop(0, 'rgba(12,6,10,0)'); g.addColorStop(0.18, 'rgba(12,6,10,0.78)'); g.addColorStop(0.82, 'rgba(12,6,10,0.78)'); g.addColorStop(1, 'rgba(12,6,10,0)');
        const bw = W * clamp(inK, 0, 1.05);
        c.fillStyle = g; c.fillRect(W / 2 - bw / 2, cy - bandH / 2, bw, bandH);
        c.fillStyle = rgba(e.color, 0.85);
        c.fillRect(W / 2 - bw * 0.42, cy - bandH * 0.36, bw * 0.84, Math.max(1, 2 * (W / 1280)));
        c.fillRect(W / 2 - bw * 0.42, cy + bandH * 0.34, bw * 0.84, Math.max(1, 2 * (W / 1280)));
        const size = clamp(W / 22, 26, 60) * (1 + (1 - clamp(p / 0.16, 0, 1)) * 0.35);
        const slide = (1 - inK) * -60 + outK * 40;
        const tx = W / 2 + slide, ty = cy - (e.sub ? bandH * 0.1 : 0);
        // soft glow from a wide translucent stroke (shadowBlur is far too slow on software canvases)
        c.font = 'bold ' + Math.round(size) + 'px ' + DISPLAY_FONT;
        c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
        c.strokeStyle = rgba(e.color, 0.18); c.lineWidth = size * 0.55; c.strokeText(e.text, tx, ty);
        c.strokeStyle = rgba(e.color, 0.28); c.lineWidth = size * 0.36; c.strokeText(e.text, tx, ty);
        outlinedText(c, e.text, tx, ty, size, e.color, 'rgba(26,12,10,0.95)', DISPLAY_FONT, 'bold');
        if (e.sub) outlinedText(c, e.sub, W / 2 - slide * 0.5, cy + bandH * 0.22, size * 0.38, '#f4e6c8', 'rgba(26,12,10,0.9)', 'Georgia, serif', 'italic bold');
        c.restore();
      },
    });
  }

  function addFlash(color, dur) {
    return addEffect({
      layer: 'screen', flashFx: true, color: col(color, '#ffffff'), life: clamp(num(dur, 200), 30, 3000),
      draw: function (c, e, view) {
        const k = clamp(e.age / e.life, 0, 1);
        c.save();
        c.globalAlpha = 0.55 * (1 - k) * (1 - k);
        c.fillStyle = e.color;
        c.fillRect(0, 0, num(view.width, 800), num(view.height, 600));
        c.restore();
      },
    });
  }

  // ---- audio sync --------------------------------------------------------------------------------------------------
  let lastDefault = { name: null, at: -1e9 };
  function audio(name, opts) {
    if (name && DD.Audio && typeof DD.Audio.play === 'function') DD.safe('Audio.play', DD.Audio.play, DD.Audio, [name, opts || {}]);
  }
  /** Play the sound events queued directly after the starting visual now (marks them so the 'sound' handler skips). */
  function pullSounds() {
    const q = DD.FX && DD.FX.queue;
    let any = false;
    for (let i = 0; q && i < q.length && q[i] && q[i].type === 'sound'; i++) {
      const s = q[i];
      any = true;
      if (s._played) continue;
      s._played = true;
      if (s.name === lastDefault.name && nowMs() - lastDefault.at < 600) continue; // already voiced by this chain
      audio(s.name, s);
    }
    return any;
  }
  /** Default sound for a visual, unless the event overrides it or a queued sound takes its place. */
  function sfx(evt, def, opts) {
    const pulled = pullSounds();
    if (evt.sound === false) return;
    if (typeof evt.sound === 'string') { audio(evt.sound, opts); return; }
    if (!pulled && def) { audio(def, opts); lastDefault = { name: def, at: nowMs() }; }
  }

  // ---- throws: forced movement that flies --------------------------------------------------------------------------
  // Act.push queues one 'slide' per tile. Consecutive slides of one unit (only instant events between them) play as a
  // single flight: steady travel under one arc, so a YEET or a long knockback is a throw, not a shuffle. A unit that
  // flies off right after another unit lunged at it was thrown, and tumbles. Events can ask explicitly: slide/jump
  // `arc` (px) and `spin` (turns; false = none).
  const INSTANT_FX = { sound: 1, particles: 1, shake: 1, flash: 1, tile: 1, bark: 1, call: 1 };
  let lastLunge = null;   // { unitId, to, at } of the latest lunge to start
  function sameTile(a, b) { return !!a && !!b && Math.round(a.x) === Math.round(b.x) && Math.round(a.y) === Math.round(b.y); }
  /** Was the unit leaving `from` just shoved by someone else (a lunge at that tile, moments ago)? */
  function justThrown(evt, from) {
    const l = lastLunge;
    return !!l && l.unitId !== evt.unitId && nowMs() - l.at < 900 && sameTile(l.to, from);
  }
  function spinTurns(evt, thrown) {
    if (evt.spin === false || evt.spin === 0) return 0;
    if (typeof evt.spin === 'number' && isFinite(evt.spin)) return clamp(evt.spin, -4, 4);
    return evt.spin === true || thrown ? 1 : 0;
  }
  /** The flight a slide belongs to (computed once, by its first slide): { n, total ms, arc px, spin turns }. */
  function slideChain(evt) {
    if (evt._chain) return evt._chain;
    const list = [evt], q = DD.FX && DD.FX.queue;
    let last = evt;
    if (!evt.parallel && Array.isArray(q)) {
      for (let i = 0; i < q.length && list.length < 12; i++) {
        const e = q[i];
        if (!e || e.parallel) break;
        if (e.type === 'slide') {
          if (e.unitId !== evt.unitId || !sameTile(e.from, last.to)) break;
          list.push(e); last = e;
        } else if (!(INSTANT_FX[e.type] && !(num(e.ms, 0) > 0))) break;
      }
    }
    const n = list.length;
    let total = 0;
    for (let i = 0; i < n; i++) { list[i]._chainT0 = total; total += Math.max(1, num(list[i].ms, 120)); }
    const thrown = justThrown(evt, evt.from);
    const arc = typeof evt.arc === 'number' && isFinite(evt.arc) ? clamp(evt.arc, 0, 120) : n >= 2 ? Math.min(34, 6 + 6 * n) : 0;
    const ch = { n: n, total: total, arc: arc, spin: n >= 2 || evt.spin ? spinTurns(evt, thrown && n >= 2) : 0 };
    for (let i = 0; i < n; i++) list[i]._chain = ch;
    return ch;
  }

  function barkSound(u) {
    let def = null;
    try { def = u && (DD.getSummon(u.defId) || DD.getEnemy(u.defId) || DD.getHero(u.defId)); } catch (e) { def = null; }
    const tags = ((def && def.tags) || []).concat((u && u.tags) || []).join(' ') + ' ' + String(u && u.defId);
    if (/corgi|dog|hound|pup/i.test(tags)) return 'corgi';
    if (/raven|crow|bird|owl/i.test(tags)) return 'caw';
    return 'bark';
  }
  function isBoss(u) { return !!u && (u.tier === 'boss' || !!(DD.getEnemy && DD.getEnemy(u.defId) && DD.getEnemy(u.defId).boss)); }

  // ---- hosted moments (v2: the HUD's initiative dice tray) -----------------------------------------------------------
  const moments = {};
  /** The registered host for a marker event if it wants to show it: { start(evt) → ms, wants?(evt) → bool }. */
  function momentHost(type, evt) {
    const h = moments[type];
    if (!h || typeof h.start !== 'function') return null;
    if (typeof h.wants === 'function' && !DD.safe('FX moment wants', h.wants, h, [evt])) return null;
    return h;
  }
  /** Is the banner starting now the engine's initiative title (an 'initiative' marker follows after its dice texts)
   *  that a hosted moment will show instead? */
  function initiativeTitle() {
    const q = DD.FX && DD.FX.queue;
    for (let i = 0; q && i < q.length && i < 80; i++) {
      const e = q[i];
      if (!e) continue;
      if (e.type === 'initiative') return !!momentHost('initiative', e);
      if (e.type !== 'text' && e.type !== 'sound') return false;
    }
    return false;
  }

  // ---- handlers (one per DD.FX event type) ----------------------------------------------------------------------------
  const HANDLERS = {
    move: {
      start: function (evt) {
        const u = unitOf(evt), v = visOf(u);
        if (!v) return;
        const path = (evt.path || []).map(posOf).filter(Boolean);
        let from = { x: v.x, y: v.y, h: num(v.h, 0) };
        const ef = posOf(evt.from);
        if (ef && path.length && Math.abs(from.x - path[0].x) + Math.abs(from.y - path[0].y) > 1.6) from = { x: ef.x, y: ef.y, h: DD.FX.tileH(ef.x, ef.y) };
        evt._pts = [from].concat(path);
        evt._step = -1;
        evt._stride = num(v._stride, 0);
        pullSounds();
      },
      update: function (evt, t) {
        const u = unitOf(evt), v = visOf(u);
        if (!v || !evt._pts) return;
        const pts = evt._pts, n = pts.length - 1;
        if (n <= 0) return;
        const f = t * n, i = Math.min(n - 1, Math.floor(f)), k = f - i;
        const a = pts[i], b = pts[i + 1];
        v.x = lerp(a.x, b.x, k); v.y = lerp(a.y, b.y, k);
        const dh = b.h - a.h;
        v.h = lerp(a.h, b.h, smooth(k));
        v.lift = Math.sin(k * Math.PI) * (1.8 + Math.min(2, Math.abs(dh)) * 5);
        v.walk = (evt._stride + f) * 0.5;
        v.pose = null;
        const fc = facingToward(a, b);
        if (fc) v.facing = fc;
        stamp(v);
        if (i !== evt._step) {
          evt._step = i;
          if (evt.dust !== false) burst(a, 'dust', 3, null, 0, 0.8);
          if (evt.sound !== false) audio(typeof evt.sound === 'string' ? evt.sound : 'step', { vol: 0.55 });
        }
      },
      end: function (evt) {
        const v = visOf(unitOf(evt));
        if (!v) return;
        v._stride = num(evt._stride, 0) + (evt._pts ? evt._pts.length - 1 : 0);
        v.lift = 0; v.walk = undefined;
      },
    },

    slide: {
      start: function (evt) {
        const u = unitOf(evt), v = visOf(u);
        if (!v) return;
        evt._from = posOf(evt.from) || { x: v.x, y: v.y, h: num(v.h, 0) };
        evt._to = posOf(evt.to) || evt._from;
        evt._dust = 0;
        const ch = slideChain(evt);
        evt._fly = ch.arc > 0 || ch.spin ? ch : null;
        evt._dir = facingToward(evt._from, evt._to) || 1;
        sfx(evt, 'push', { vol: 0.8 });
      },
      update: function (evt, t, dt) {
        const v = visOf(unitOf(evt));
        if (!v || !evt._from) return;
        const a = evt._from, b = evt._to, fly = evt._fly;
        if (fly) {
          // one arc over the whole chain: p = progress of the flight, steady speed so the tiles don't stutter
          const p = clamp((num(evt._chainT0, 0) + t * Math.max(1, num(evt.ms, 120))) / fly.total, 0, 1);
          v.x = lerp(a.x, b.x, t); v.y = lerp(a.y, b.y, t); v.h = lerp(a.h, b.h, t);
          v.lift = Math.sin(p * Math.PI) * fly.arc;
          v.squash = p < 0.12 ? 0.4 * (1 - p / 0.12) : p > 0.9 ? 0.5 * (p - 0.9) / 0.1 : -0.2;
          v.spin = fly.spin ? easeOut(p) * fly.spin * TAU * evt._dir : 0;
        } else {
          const k = easeOut(t);
          v.x = lerp(a.x, b.x, k); v.y = lerp(a.y, b.y, k); v.h = lerp(a.h, b.h, k);
          v.lift = a.h - b.h > 0.4 ? Math.sin(t * Math.PI) * 4 : 0;
          v.squash = -0.35 * Math.sin(t * Math.PI);
        }
        if (!v.downed) v.pose = 'hurt';
        stamp(v);
        evt._dust += num(dt, 16);
        if (evt._dust > 45 && !(fly && v.lift > 6)) { evt._dust = 0; burst({ x: v.x, y: v.y, h: v.h }, 'dust', 2, null, 0, 0.6); }
      },
      end: function (evt) {
        const v = visOf(unitOf(evt));
        const fly = evt._fly, landed = !fly || num(evt._chainT0, 0) + Math.max(1, num(evt.ms, 120)) >= fly.total - 0.5;
        if (v) { if (landed) clearPose(v); else v.squash = 0; }
        if (evt._to && landed) burst(evt._to, 'dust', fly ? 10 : 6, null, 0, fly ? 1.5 : 1.2);
      },
    },

    jump: {
      start: function (evt) {
        const u = unitOf(evt), v = visOf(u);
        if (!v) return;
        evt._from = posOf(evt.from) || { x: v.x, y: v.y, h: num(v.h, 0) };
        evt._to = posOf(evt.to) || evt._from;
        const dist = Math.abs(evt._to.x - evt._from.x) + Math.abs(evt._to.y - evt._from.y);
        evt._arc = num(evt.arc, 16 + dist * 7 + Math.max(0, evt._to.h - evt._from.h) * 16);
        const fc = facingToward(evt._from, evt._to);
        // thrown (someone just lunged at this unit) or asked to: tumble head over heels in the travel direction
        evt._spin = spinTurns(evt, justThrown(evt, evt._from));
        evt._dir = fc || 1;
        if (fc && !evt._spin) v.facing = fc;
        burst(evt._from, 'dust', 4, null, 0, 1);
        sfx(evt, 'push', { vol: 0.5 });
      },
      update: function (evt, t) {
        const v = visOf(unitOf(evt));
        if (!v || !evt._from) return;
        const a = evt._from, b = evt._to;
        v.x = lerp(a.x, b.x, t); v.y = lerp(a.y, b.y, t); v.h = lerp(a.h, b.h, t);
        v.lift = Math.sin(t * Math.PI) * evt._arc;
        v.squash = t < 0.12 ? 0.5 * (1 - t / 0.12) : t > 0.88 ? 0.6 * (t - 0.88) / 0.12 : -0.22;
        v.spin = evt._spin ? easeOut(t) * evt._spin * TAU * evt._dir : 0;
        if (evt._spin && !v.downed) v.pose = 'hurt';
        stamp(v);
      },
      end: function (evt) {
        const v = visOf(unitOf(evt));
        if (v) clearPose(v);
        if (evt._to) burst(evt._to, 'dust', 8, null, 0, 1.4);
        if (evt.sound !== false) audio('step', { vol: 0.9 });
      },
    },

    teleport: {
      start: function (evt) {
        const u = unitOf(evt), v = visOf(u);
        evt._from = posOf(evt.from) || (v ? { x: v.x, y: v.y, h: num(v.h, 0) } : null);
        evt._to = posOf(evt.to) || evt._from;
        evt._arrived = false;
        if (evt._from) burst(evt._from, 'glitter', 14, evt.color, -14, 1.2);
        sfx(evt, 'magic', { vol: 0.8 });
      },
      update: function (evt, t) {
        const v = visOf(unitOf(evt));
        if (!v || !evt._from) return;
        if (t < 0.45) {
          const k = t / 0.45;
          v.x = evt._from.x; v.y = evt._from.y; v.h = evt._from.h;
          v.alpha = v.hidden ? 0 : 1 - k;
          v.scale = 1 - 0.35 * k;
          v.lift = k * 6;
        } else {
          if (!evt._arrived) { evt._arrived = true; burst(evt._to, 'glitter', 14, evt.color, -14, 1.2); }
          const k = clamp((t - 0.55) / 0.45, 0, 1);
          v.x = evt._to.x; v.y = evt._to.y; v.h = evt._to.h;
          v.alpha = v.hidden ? 0 : k;
          v.scale = 0.65 + 0.35 * easeOutBack(k);
          v.lift = (1 - k) * 6;
        }
        stamp(v);
      },
      end: function (evt) {
        const v = visOf(unitOf(evt));
        if (v) { v.scale = 1; v.lift = 0; }
      },
    },

    lunge: {
      start: function (evt) {
        const u = unitOf(evt), v = visOf(u);
        if (!v) return;
        const from = visPos(u), to = posOf(evt.to) || from;
        lastLunge = { unitId: evt.unitId, to: to, at: nowMs() };
        const d = screenDelta(from, to), len = Math.hypot(d.x, d.y);
        evt._dx = len ? d.x / len : 0; evt._dy = len ? d.y / len : 0;
        evt._dist = clamp(num(evt.dist, len * 0.35), 5, 14);
        const fc = facingToward(from, to);
        if (fc) v.facing = fc;
        sfx(evt, 'slash', { vol: 0.65 });
      },
      update: function (evt, t) {
        const v = visOf(unitOf(evt));
        if (!v) return;
        const p = t < 0.38 ? easeOut(t / 0.38) : 1 - easeIn((t - 0.38) / 0.62);
        v.offX = evt._dx * evt._dist * p;
        v.offY = evt._dy * evt._dist * p;
        if (!v.downed) { v.pose = 'attack'; v.poseT = t; }
        stamp(v);
      },
      end: function (evt) {
        const v = visOf(unitOf(evt));
        if (v) { v.offX = 0; v.offY = 0; clearPose(v); }
      },
    },

    projectile: {
      start: function (evt) {
        const spec = PROJ[evt.kind] || PROJ.bolt;
        evt._fx = addProjectile(evt);
        const shooter = unitAtPos(evt.from);
        evt._shooter = shooter;
        if (shooter && evt.from && evt.to) {
          const fc = facingToward(posOf(evt.from), posOf(evt.to));
          if (fc && shooter.vis) shooter.vis.facing = fc;
        }
        evt._magic = evt.kind === 'bolt' || evt.kind === 'orb' || evt.kind === 'fireball' || evt.kind === 'note' || evt.kind === 'custom' || !PROJ[evt.kind];
        sfx(evt, spec.sound, { vol: 0.8 });
      },
      update: function (evt, t) {
        const v = evt._shooter && visOf(evt._shooter);
        if (!v || t > 0.55) return;
        v.pose = evt._magic ? 'cast' : 'attack';
        v.poseT = evt._magic ? undefined : clamp(0.3 + t * 0.6, 0, 1);
        stamp(v);
      },
      end: function (evt) {
        if (evt._fx) evt._fx.dead = true;
        const spec = PROJ[evt.kind] || PROJ.bolt, to = posOf(evt.to);
        if (to) {
          const c = evt.color && evt.color !== '#ffffff' ? evt.color : spec.color;
          burst(to, spec.burst, spec.n, c, -12, 1);
          if (evt.kind === 'fireball') burst(to, 'smoke', 6, null, -12, 1.2);
          if (evt.kind === 'flask') burst(to, 'ice', 5, '#dff4ff', -10, 0.8);
        }
        const v = evt._shooter && visOf(evt._shooter);
        if (v) clearPose(v);
      },
    },

    beam: {
      start: function (evt) {
        evt._fx = addBeam(evt);
        evt._shooter = unitAtPos(evt.from);
        if (evt._shooter && evt._shooter.vis && evt.from && evt.to) {
          const fc = facingToward(posOf(evt.from), posOf(evt.to));
          if (fc) evt._shooter.vis.facing = fc;
        }
        if (evt.to) burst(posOf(evt.to), 'sparks', 10, evt.color, -12, 1);
        sfx(evt, 'zap', { vol: 0.75 });
      },
      update: function (evt) {
        const v = evt._shooter && visOf(evt._shooter);
        if (!v) return;
        v.pose = 'cast'; stamp(v);
      },
      end: function (evt) {
        if (evt._fx) evt._fx.life = Math.min(evt._fx.life, evt._fx.age + 60);
        const v = evt._shooter && visOf(evt._shooter);
        if (v) clearPose(v);
      },
    },

    explosion: {
      start: function (evt) { addExplosion(evt); sfx(evt, 'explosion'); },
    },

    particles: {
      start: function (evt) {
        const kind = PK[evt.kind] ? evt.kind : 'sparks';
        const oy = num(evt.oy, kind === 'dust' ? 0 : kind === 'leaves' || kind === 'feathers' ? -8 : -14);
        burst(posOf(evt.at), kind, evt.count, evt.color, oy, num(evt.spread, 1));
        if (typeof evt.sound === 'string') audio(evt.sound, evt);
      },
    },

    damage: {
      start: function (evt) {
        const u = unitOf(evt), v = visOf(u);
        if (!u) return;
        evt._hp0 = num(v && v.hp, num(evt.hp, 0) + num(evt.amount, 0));
        evt._b0 = num(v && v.block, num(evt.block, 0));
        const amount = Math.max(0, Math.round(num(evt.amount, 0)));
        const blocked = typeof evt.blocked === 'number' ? Math.max(0, Math.round(evt.blocked)) : 0;
        if (evt.cost) addFloat({ unit: u, text: '-' + amount + ' HP', color: '#d77bff', size: 14, font: NUM_FONT });
        else if (amount <= 0 && (blocked > 0 || evt.blocked === true)) addFloat({ unit: u, text: 'BLOCKED', color: '#9cc8ff', size: 15 });
        else {
          addFloat({ unit: u, text: String(amount), color: ELEMENT_COLORS[evt.element] || '#ffffff', size: evt.crit ? 22 : 19, font: NUM_FONT, crit: !!evt.crit,
            sub: blocked > 0 ? '(' + blocked + ' blocked)' : null, subColor: '#9cc8ff' });
          const pk = { fire: 'fire', frost: 'ice', ice: 'ice', poison: 'poison', lightning: 'zap', holy: 'glitter' }[evt.element] || 'sparks';
          burst(visPos(u), pk, pk === 'zap' ? 4 : 7, null, -16, 0.7);
          if (!evt.element || evt.element === 'physical') burst(visPos(u), 'blood', 3, null, -14, 0.5);
          if (evt.crit) addShake(4, 180);
        }
        sfx(evt, evt.cost ? null : evt.crit ? 'crit' : 'hit');
      },
      update: function (evt, t) {
        const v = visOf(unitOf(evt));
        if (!v) return;
        v.flash = Math.max(0, 1 - t * 1.6) * (evt.cost ? 0.55 : 1);
        v.flashColor = evt.cost ? '#d77bff' : '#ffffff';
        v.squash = evt.cost ? 0 : Math.sin(Math.min(1, t * 1.5) * Math.PI) * 0.8;
        if (!v.downed && !v.dead && !evt.cost) v.pose = 'hurt';
        v.hp = Math.round(lerp(evt._hp0, num(evt.hp, evt._hp0), easeOut(t)));
        v.block = Math.round(lerp(evt._b0, num(evt.block, evt._b0), easeOut(t)));
        stamp(v);
      },
      end: function (evt) { const v = visOf(unitOf(evt)); if (v) clearPose(v); },
    },

    heal: {
      start: function (evt) {
        const u = unitOf(evt), v = visOf(u);
        if (!u) return;
        evt._hp0 = num(v && v.hp, num(evt.hp, 0) - num(evt.amount, 0));
        const amount = Math.max(0, Math.round(num(evt.amount, 0)));
        addFloat({ unit: u, text: '+' + amount, color: '#5dff7a', size: 19, font: NUM_FONT });
        burst(visPos(u), 'hearts', 3, null, -18, 0.8);
        burst(visPos(u), 'glitter', 8, '#9dffb0', -16, 1);
        sfx(evt, 'heal');
      },
      update: function (evt, t) {
        const v = visOf(unitOf(evt));
        if (!v) return;
        v.flash = 0.45 * Math.sin(t * Math.PI);
        v.flashColor = '#9dffb0';
        v.hp = Math.round(lerp(evt._hp0, num(evt.hp, evt._hp0), easeOut(t)));
        stamp(v);
      },
      end: function (evt) { const v = visOf(unitOf(evt)); if (v) clearPose(v); },
    },

    block: {
      start: function (evt) {
        const u = unitOf(evt), v = visOf(u);
        if (!u) return;
        evt._b0 = num(v && v.block, num(evt.block, 0) - num(evt.amount, 0));
        const amount = Math.round(num(evt.amount, 0));
        if (amount) addFloat({ unit: u, text: (amount > 0 ? '+' : '') + amount + ' Block', icon: '🛡', pill: true, color: '#9cc8ff', size: 12, life: 1000, rise: 22 });
        sfx(evt, 'buff', { vol: 0.6 });
      },
      update: function (evt, t) {
        const v = visOf(unitOf(evt));
        if (!v) return;
        v.block = Math.round(lerp(evt._b0, num(evt.block, evt._b0), easeOut(t)));
      },
    },

    status: {
      start: function (evt) {
        const u = unitOf(evt);
        if (!u) return;
        const def = DD.getStatus ? DD.getStatus(evt.statusId) : null;
        const removed = !!evt.removed;
        const color = removed ? '#b8b0bc' : col(def && def.color, def && def.type === 'buff' ? '#9dffb0' : '#ff9a8a');
        const text = evt.text || (def ? (removed ? '−' : '') + def.name : String(evt.statusId || ''));
        addFloat({ unit: u, text: text, icon: def && def.icon ? def.icon : null, pill: true, color: color, size: 12, life: 1250, rise: 24 });
        if (!removed) {
          const pk = { burn: 'fire', poison: 'poison', frozen: 'ice', bleed: 'blood', wet: 'bubbles', charmed: 'hearts', sleep: 'bubbles', stun: 'sparks' }[evt.statusId];
          burst(visPos(u), pk || 'glitter', pk ? 7 : 8, pk ? null : color, -18, 0.9);
        }
        sfx(evt, removed ? null : def && def.type === 'buff' ? 'buff' : 'debuff', { vol: 0.7 });
      },
    },

    text: {
      start: function (evt) {
        const u = unitOf(evt);
        addFloat({ unit: u, at: evt.at, text: evt.text, color: evt.color, size: num(evt.size, 16), life: num(evt.life, 1250), rise: 26 });
        if (typeof evt.sound === 'string') audio(evt.sound, evt);
      },
    },

    bark: {
      start: function (evt) {
        const u = unitOf(evt);
        if (!u || !evt.text) return;
        addBark(u, evt.text, evt.dur);
        sfx(evt, barkSound(u), { vol: 0.7 });
      },
    },

    death: {
      start: function (evt) {
        const u = unitOf(evt), v = visOf(u);
        if (!v) return;
        evt._cause = evt.cause;
        evt._pos = visPos(u);
        if (evt.cause !== 'flee' && evt.cause !== 'fall') v.deathT = 0;
        if (isBoss(u)) { addShake(9, 600); addFlash('#ffffff', 260); }
        sfx(evt, evt.cause === 'flee' ? 'step' : evt.cause === 'fall' ? 'fall' : 'death');
        stamp(v);
      },
      update: function (evt, t, dt) {
        const u = unitOf(evt), v = visOf(u);
        if (!v) return;
        if (evt._cause === 'flee') {
          if (!evt._fleeDir) { evt._fleeDir = (u && u.facing === -1) ? 1 : -1; v.facing = evt._fleeDir; }
          v.offX = evt._fleeDir * 46 * easeIn(t);
          v.lift = Math.abs(Math.sin(t * Math.PI * 4)) * 3;
          v.walk = t * 3;
          v.alpha = 1 - easeIn(t);
          evt._dust = num(evt._dust, 0) + num(dt, 16);
          if (evt._dust > 70) { evt._dust = 0; burst(evt._pos, 'dust', 2, null, 0, 1); }
        } else if (evt._cause === 'fall') {
          v.scale = 1 - easeIn(t) * 0.85;
          v.lift = -easeIn(t) * 22;
          v.alpha = 1 - easeIn(t);
          v.pose = 'hurt';
        } else {
          v.deathT = t;
          if (t > 0.62 && !evt._poof) {
            evt._poof = true;
            const big = isBoss(u);
            burst(evt._pos, 'smoke', big ? 26 : 12, null, -10, big ? 2.6 : 1.4);
            burst(evt._pos, 'glitter', big ? 16 : 7, null, -14, 1);
          }
        }
        stamp(v);
      },
      end: function (evt) {
        const v = visOf(unitOf(evt));
        if (!v) return;
        v.deathT = undefined; v.scale = 1; v.offX = 0; v.offY = 0;
        clearPose(v);
      },
    },

    downed: {
      start: function (evt) {
        const v = visOf(unitOf(evt));
        if (!v) return;
        v.downT = 0;
        sfx(evt, 'downed');
      },
      update: function (evt, t) {
        const v = visOf(unitOf(evt));
        if (!v) return;
        // topple with a little bounce at the end
        v.downT = t < 0.75 ? easeIn(t / 0.75) : 1 - Math.sin((t - 0.75) / 0.25 * Math.PI) * 0.08;
        v.flash = t < 0.2 ? 0.6 * (1 - t / 0.2) : 0;
        stamp(v);
      },
      end: function (evt) {
        const u = unitOf(evt), v = visOf(u);
        if (!v) return;
        v.downT = undefined;
        burst(visPos(u), 'dust', 8, null, 0, 1.4);
      },
    },

    revive: {
      start: function (evt) {
        const u = unitOf(evt), v = visOf(u);
        if (!v) return;
        v.reviveT = 0;
        burst(visPos(u), 'glitter', 14, '#fff3a0', -14, 1.3);
        burst(visPos(u), 'hearts', 4, null, -20, 0.8);
        sfx(evt, 'heal');
      },
      update: function (evt, t) {
        const v = visOf(unitOf(evt));
        if (!v) return;
        v.reviveT = easeOut(t);
        v.flash = 0.5 * Math.sin(t * Math.PI);
        v.flashColor = '#fff3a0';
        stamp(v);
      },
      end: function (evt) {
        const v = visOf(unitOf(evt));
        if (v) { v.reviveT = undefined; clearPose(v); }
      },
    },

    spawn: {
      start: function (evt) {
        const u = unitOf(evt), v = visOf(u);
        if (!v) return;
        const at = posOf(evt.at) || visPos(u);
        v.hidden = false; v.alpha = 0; v.spawnT = 0;
        if (at) { v.x = at.x; v.y = at.y; v.h = at.h; }
        burst(at, 'smoke', 10, null, -6, 1.3);
        burst(at, 'glitter', 10, evt.color, -16, 1.1);
        sfx(evt, 'summon', { vol: 0.8 });
        stamp(v);
      },
      update: function (evt, t) {
        const v = visOf(unitOf(evt));
        if (!v) return;
        v.spawnT = t;
        v.alpha = clamp(t * 2.2, 0, 1);
        v.scale = 0.45 + 0.55 * easeOutBack(t);
        v.lift = -(1 - easeOut(t)) * 8;
        stamp(v);
      },
      end: function (evt) {
        const v = visOf(unitOf(evt));
        if (v) { v.spawnT = undefined; v.scale = 1; v.lift = 0; }
      },
    },

    shake: { start: function (evt) { addShake(num(evt.intensity, 6), num(evt.dur, 300)); } },
    banner: {
      start: function (evt) {
        // the initiative banner becomes the title of the dice moment a screen hosts (no double announcement)
        if (initiativeTitle()) { evt.ms = 0; evt.folded = true; return; }
        addBanner(evt); sfx(evt, 'turn', { vol: 0.7 });
      },
    },
    flash: { start: function (evt) { addFlash(evt.color, evt.dur); } },
    // ---- v2 markers (0 ms from the engine) ----
    turn: {},   // fx_core's applyEnd moves DD.FX.shownTurn; the HUD follows it
    windup: {
      start: function (evt) {
        const tiles = Array.isArray(evt.tiles) ? evt.tiles.slice(0, 40) : [];
        tiles.forEach(function (p) {
          if (p && isFinite(p.x) && isFinite(p.y)) addTilePulse({ at: { x: p.x, y: p.y, h: DD.FX.tileH(p.x, p.y) }, kind: 'glow', color: '#ff4a3a', dur: 900 });
        });
        if (tiles.length) sfx(evt, 'debuff', { vol: 0.55 });
      },
    },
    initiative: {
      start: function (evt) {
        const host = momentHost('initiative', evt);
        if (!host) return;
        const ms = DD.safe('FX initiative moment', host.start, host, [evt]);
        if (typeof ms === 'number' && isFinite(ms) && ms > 0) evt.ms = Math.min(ms, 9000);
      },
    },
    wait: {},
    call: {},
    tile: {
      start: function (evt) {
        addTilePulse(evt);
        sfx(evt, evt.kind === 'splash' ? 'splash' : evt.kind === 'crack' ? 'bump' : null, { vol: 0.6 });
      },
    },
    sound: {
      start: function (evt) { if (!evt._played) { evt._played = true; audio(evt.name, evt); } },
    },
    custom: {
      start: function (evt) {
        if (typeof evt.draw === 'function') {
          evt._fx = addEffect({
            layer: evt.layer === 'screen' ? 'screen' : 'world', evt: evt, at: posOf(evt.at), life: Math.max(30, num(evt.ms, 300)),
            draw: function (c, e, view) {
              const p = e.evt.ms > 0 && !e.evt.done ? clamp(num(e.evt.elapsed, 0) / e.evt.ms, 0, 1) : clamp(e.age / e.life, 0, 1);
              const pt = e.at ? project(view, e.at, 0, 0) : { x: num(view.width, 0) / 2, y: num(view.height, 0) / 2 };
              let ok = false;
              DD.safe('FX custom draw', function () { e.evt.draw(c, pt.x, pt.y, p, view, e.evt); ok = true; });
              if (!ok) e.dead = true;
            },
          });
        }
        if (typeof evt.sound === 'string') audio(evt.sound, evt);
      },
    },
  };

  // Handlers are installed once everything is loaded (load-time code only attaches to DD).
  DD.afterLoad(function () { for (const type in HANDLERS) DD.FX.register(type, HANDLERS[type]); }, -10);

  // ---- drawing entry points (called by the world renderer) -----------------------------------------------------------
  function validView(view) { return !!view && !!view.ctx && typeof view.toScreen === 'function'; }
  function drawLayer(view, layer, late) {
    const c = view.ctx;
    for (let i = 0; i < effects.length; i++) {
      const e = effects[i];
      if (e.dead || e.layer !== layer || !e.draw) continue;
      if (layer === 'screen' && !!late !== !!(e.banner || e.flashFx)) continue;
      c.save();
      let ok = false;
      DD.safe('FXRender.draw', function () { e.draw(c, e, view); ok = true; });
      c.restore();
      if (!ok) e.dead = true;
    }
  }

  DD.FXRender = {
    /** World-space effects (projectiles, beams, explosions, particles, tile pulses) — after units. */
    drawWorld: function (view) {
      if (!validView(view)) return;
      tick(view);
      drawLayer(view, 'world', false);
    },
    /** Screen-space effects: floating numbers/text, speech bubbles, then banners and flashes on top. */
    drawScreen: function (view) {
      if (!validView(view)) return;
      tick(view);
      DD.safe('FXRender bark layout', layoutBarks, null, [view]);
      DD.safe('FXRender bark leaders', drawBarkLeaders, null, [view]);
      drawLayer(view, 'screen', false);
      drawLayer(view, 'screen', true);
    },
    /** Current screen shake in px (0,0 when shake is disabled in settings). */
    shakeOffset: function () {
      const st = DD.Meta && DD.Meta.data && DD.Meta.data.settings;
      if (st && st.shake === false) return { x: 0, y: 0 };
      let a = 0;
      for (let i = 0; i < shakes.length; i++) { const s = shakes[i]; a += s.amp * (1 - s.age / s.dur); }
      a = clamp(a, 0, 24);
      if (a <= 0.05) return { x: 0, y: 0 };
      return { x: (Math.random() * 2 - 1) * a, y: (Math.random() * 2 - 1) * a * 0.7 };
    },
    // ---- extras for content / UI / tests ----
    clear: clearEffects,
    count: function () { return effects.length; },
    /** Add a custom effect: { layer: 'world'|'screen', at?, life (ms), draw(ctx, e, view), tick?(e, dtMs) }. */
    addEffect: function (e) { return e && typeof e.draw === 'function' ? addEffect(e) : null; },
    burst: function (at, kind, count, color, oy) { return burst(posOf(at && at.vis ? visPos(at) : at), kind, count, color, oy); },
    text: function (target, text, opts) {
      opts = opts || {};
      const unit = target && target.id !== undefined && target.vis ? target : null;
      return addFloat(Object.assign({}, opts, { unit: unit, at: unit ? null : target, text: text }));
    },
    bark: function (unit, text, dur) { return unit && text ? addBark(unit, text, dur) : null; },
    /** v2 hosted moments by marker type (see the header): { initiative: { start(evt) → ms, wants?(evt) → bool } }. */
    moments: moments,
    PARTICLE_KINDS: Object.keys(PK),
    PROJECTILE_KINDS: Object.keys(PROJ),
    ELEMENT_COLORS: ELEMENT_COLORS,
    handlers: HANDLERS,
  };

  // Leftover visuals never outlive the fight they belong to.
  DD.afterLoad(function () {
    if (!DD.Events) return;
    DD.Events.on('combat:start', clearEffects);
    DD.Events.on('ui:screen', function (d) { if (!d || d.id !== 'combat') clearEffects(); });
  });
})();
