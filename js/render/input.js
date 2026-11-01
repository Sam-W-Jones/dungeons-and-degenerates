/* Dungeons and Degenerates — js/render/input.js
 * Canvas input (ARCHITECTURE §7.5). Turns pointer / wheel / keyboard activity on the #game canvas into
 * input:* events (§5.10) and drives the DD.Render camera: drag to pan (right/middle button, or a left drag
 * past a few px), WASD / arrow keys pan, wheel or pinch zooms around the cursor, F / Home recenters, +/- zoom.
 * The canvas only receives events the DOM UI did not capture (#ui is pointer-events:none, panels auto).
 * Keys are ignored while typing in text inputs, textareas, selects, sliders or contenteditable elements.
 *
 * Events:  input:tileHover {x,y,unitId}|null · input:tileClick {x,y,button:0,shift,unitId}
 *          input:unitClick {unitId,x,y,button:0,shift} (emitted right before the matching tileClick)
 *          input:rightClick {x,y,sx,sy}|{key:'Escape'} · input:key {key,code,shift,ctrl,alt,meta}
 */
(function () {
  'use strict';
  const DD = window.DD;

  const DRAG_PX = 6;
  const PAN_SPEED = 760; // CSS px per second for keyboard panning
  const PAN_KEYS = {
    w: [0, -1], a: [-1, 0], s: [0, 1], d: [1, 0],
    arrowup: [0, -1], arrowleft: [-1, 0], arrowdown: [0, 1], arrowright: [1, 0],
  };
  const NON_TEXT_INPUTS = ['button', 'checkbox', 'radio', 'submit', 'reset', 'color', 'file', 'image'];

  let canvas = null;
  let windowBound = false;
  const held = {};
  const pointers = new Map(); // pointerId -> { x, y, sx, sy, button, dragging, shift }
  let pinch = null, pinchUsed = false;
  let hoverKey = '';
  let camSig = '';
  let recheckAt = 0;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function R() { return DD.Render; }
  /** Camera + picking only make sense while a battlefield is on screen. */
  function inCombat() {
    const r = R();
    if (!r) return false;
    if (r.stateOverride) return true;
    return typeof r.getScene === 'function' ? r.getScene() === 'combat' : true;
  }
  function local(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function isTyping(e) {
    const el = (e && e.target && e.target !== window ? e.target : null) || document.activeElement;
    if (!el || el === document.body || el === document.documentElement) return false;
    const tag = (el.tagName || '').toLowerCase();
    if (tag === 'input') return NON_TEXT_INPUTS.indexOf(String(el.type || 'text').toLowerCase()) < 0;
    return tag === 'textarea' || tag === 'select' || !!el.isContentEditable;
  }

  /** What is under a screen point: a unit's tile (sprite hit first) or the frontmost tile. */
  function pick(sx, sy) {
    const r = R();
    if (!r || !inCombat()) return null;
    const u = typeof r.unitAtScreen === 'function' ? r.unitAtScreen(sx, sy) : null;
    if (u) return { x: u.x, y: u.y, unitId: u.id };
    const t = typeof r.screenToTile === 'function' ? r.screenToTile(sx, sy) : null;
    return t ? { x: t.x, y: t.y, unitId: null } : null;
  }

  function setHover(p) {
    const key = p ? p.x + ',' + p.y + ',' + (p.unitId || '') : '';
    if (key === hoverKey) return;
    hoverKey = key;
    I.hover = p ? { x: p.x, y: p.y, unitId: p.unitId || null } : null;
    const r = R();
    if (r && r.overlay) r.overlay.hover = p ? { x: p.x, y: p.y } : null;
    DD.Events.emit('input:tileHover', p ? { x: p.x, y: p.y, unitId: p.unitId || null } : null);
  }
  function updateHover() {
    if (!I.mouse.inside || !I.enabled) { setHover(null); return; }
    setHover(pick(I.mouse.x, I.mouse.y));
  }

  // ---- pointer ---------------------------------------------------------------------------------------
  function pointerList() { return Array.from(pointers.values()); }
  function startPinch() {
    const ps = pointerList();
    if (ps.length < 2) return;
    pinch = { d: Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y), mx: (ps[0].x + ps[1].x) / 2, my: (ps[0].y + ps[1].y) / 2 };
    pinchUsed = true;
  }
  function updatePinch() {
    const ps = pointerList();
    if (!pinch || ps.length < 2 || !inCombat()) return;
    const d = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
    const mx = (ps[0].x + ps[1].x) / 2, my = (ps[0].y + ps[1].y) / 2;
    R().panBy(mx - pinch.mx, my - pinch.my);
    if (pinch.d > 8 && d > 8) R().zoomAt(d / pinch.d, mx, my);
    pinch.d = d; pinch.mx = mx; pinch.my = my;
  }

  function onPointerDown(e) {
    if (!I.enabled) return;
    const p = local(e);
    pointers.set(e.pointerId, { x: p.x, y: p.y, sx: p.x, sy: p.y, button: e.button, dragging: false, shift: !!e.shiftKey });
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic or already released pointer */ }
    if (pointers.size === 2) startPinch();
    if (e.button === 1) e.preventDefault(); // no middle-click autoscroll
  }

  function onPointerMove(e) {
    const p = local(e);
    I.mouse.x = p.x; I.mouse.y = p.y; I.mouse.inside = true;
    const pt = pointers.get(e.pointerId);
    if (pt) {
      if (pinch && pointers.size >= 2) { pt.x = p.x; pt.y = p.y; updatePinch(); return; }
      if (!pt.dragging && Math.hypot(p.x - pt.sx, p.y - pt.sy) > DRAG_PX) pt.dragging = true;
      if (pt.dragging && inCombat()) R().panBy(p.x - pt.x, p.y - pt.y);
      pt.x = p.x; pt.y = p.y;
    }
    updateHover();
  }

  function onPointerUp(e) {
    const pt = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    try { canvas.releasePointerCapture(e.pointerId); } catch (err) { /* not captured */ }
    if (pinch && pointers.size < 2) pinch = null;
    if (pinchUsed) { if (!pointers.size) pinchUsed = false; return; }
    if (!pt || pt.dragging || !I.enabled) return;
    const p = local(e);
    if (pt.button === 0) {
      const hit = pick(p.x, p.y);
      if (!hit) return;
      if (hit.unitId) DD.Events.emit('input:unitClick', { unitId: hit.unitId, x: hit.x, y: hit.y, button: 0, shift: pt.shift || !!e.shiftKey });
      DD.Events.emit('input:tileClick', { x: hit.x, y: hit.y, button: 0, shift: pt.shift || !!e.shiftKey, unitId: hit.unitId || null });
    } else if (pt.button === 2) {
      const hit = pick(p.x, p.y);
      DD.Events.emit('input:rightClick', { x: hit ? hit.x : null, y: hit ? hit.y : null, sx: p.x, sy: p.y });
    }
  }

  function onPointerCancel(e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (!pointers.size) pinchUsed = false;
  }

  function onPointerLeave(e) {
    if (pointers.has(e.pointerId)) return; // captured drag continues outside
    I.mouse.inside = false;
    setHover(null);
  }

  function onWheel(e) {
    if (!I.enabled || !inCombat()) return;
    e.preventDefault();
    const p = local(e);
    const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
    R().zoomAt(Math.exp(-clamp(dy, -300, 300) * 0.0016), p.x, p.y);
  }

  // ---- keyboard ----------------------------------------------------------------------------------------
  /** A focused DOM control (button, link, tabbable panel) handles Space/Enter/Tab itself. */
  function uiControlFocused() {
    const el = document.activeElement;
    if (!el || el === document.body || el === document.documentElement || el === canvas) return false;
    const tag = (el.tagName || '').toLowerCase();
    return tag === 'button' || tag === 'a' || tag === 'summary' || el.tabIndex >= 0;
  }

  function onKeyDown(e) {
    if (!I.enabled || isTyping(e)) return;
    const k = String(e.key || '').toLowerCase();
    const mod = e.ctrlKey || e.metaKey || e.altKey;
    const combat = inCombat();
    const uiFocus = uiControlFocused();
    if (!mod && PAN_KEYS[k]) held[k] = true;
    // in combat, Space/Tab/arrows belong to the game (no page scroll / focus walk) unless a UI control has focus
    if (combat && !mod && !uiFocus && (k.indexOf('arrow') === 0 || k === ' ' || k === 'tab')) e.preventDefault();
    if (e.repeat) return;
    if (uiFocus && (k === ' ' || k === 'enter')) return; // the focused control activates natively: no double fire
    if (combat && !mod) {
      if (k === 'f' || k === 'home') R().fitMap();
      else if (k === '+' || k === '=') R().zoomAt(1.2);
      else if (k === '-' || k === '_') R().zoomAt(1 / 1.2);
    }
    DD.Events.emit('input:key', { key: e.key, code: e.code, shift: !!e.shiftKey, ctrl: !!e.ctrlKey, alt: !!e.altKey, meta: !!e.metaKey });
    if (k === 'escape') DD.Events.emit('input:rightClick', { key: 'Escape' });
  }
  function onKeyUp(e) {
    const k = String(e.key || '').toLowerCase();
    delete held[k];
  }
  function clearKeys() {
    for (const k in held) delete held[k];
  }

  const I = (DD.Input = {
    enabled: true,
    mouse: { x: 0, y: 0, inside: false },
    hover: null,
    keys: held,

    /** Attach to the canvas (idempotent). Keyboard listeners live on window. */
    init: function (cv) {
      const target = cv || document.getElementById('game');
      if (!target) { DD.warn('DD.Input.init: no canvas'); return false; }
      if (target === canvas) return true;
      if (canvas) I.detach();
      canvas = target;
      canvas.style.touchAction = 'none';
      canvas.addEventListener('pointerdown', onPointerDown);
      canvas.addEventListener('pointermove', onPointerMove);
      canvas.addEventListener('pointerup', onPointerUp);
      canvas.addEventListener('pointercancel', onPointerCancel);
      canvas.addEventListener('pointerleave', onPointerLeave);
      canvas.addEventListener('wheel', onWheel, { passive: false });
      canvas.addEventListener('contextmenu', preventMenu);
      if (!windowBound) {
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        window.addEventListener('blur', clearKeys);
        windowBound = true;
      }
      return true;
    },
    detach: function () {
      if (!canvas) return;
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerCancel);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', preventMenu);
      canvas = null;
      pointers.clear();
      pinch = null;
    },

    /** Per-frame tick (called by DD.Render): keyboard panning + hover refresh under a still cursor. */
    update: function (dt) {
      const r = R();
      if (!canvas || !r || !I.enabled) return;
      let vx = 0, vy = 0;
      for (const k in held) if (held[k] && PAN_KEYS[k]) { vx += PAN_KEYS[k][0]; vy += PAN_KEYS[k][1]; }
      if ((vx || vy) && inCombat()) {
        const len = Math.hypot(vx, vy) || 1, sp = PAN_SPEED * Math.min(0.1, Math.max(0, dt) / 1000);
        r.panBy(-vx / len * sp, -vy / len * sp);
      }
      if (I.mouse.inside && !pointers.size) {
        const cam = r.camera || { x: 0, y: 0, zoom: 1 };
        const sig = cam.x.toFixed(1) + ',' + cam.y.toFixed(1) + ',' + cam.zoom.toFixed(3);
        const now = performance.now();
        if (sig !== camSig || now >= recheckAt) { camSig = sig; recheckAt = now + 150; updateHover(); }
      } else if (!I.mouse.inside && hoverKey) setHover(null);
    },

    /** Is the user typing into a form field (keys should not drive the game)? */
    isTyping: function () { return isTyping(null); },
    /** Hit-test a screen point: { x, y, unitId } | null (null outside combat). */
    pick: pick,
    /** Forget hover state (e.g. when a modal opens over the board). */
    clearHover: function () { I.mouse.inside = false; setHover(null); },
  });

  function preventMenu(e) { e.preventDefault(); }
})();
