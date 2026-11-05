/* Dungeons and Degenerates — js/ui/ui.js
 * DD.UI: the DOM layer over the #game canvas (ARCHITECTURE §8.1), shared by every screen and the combat HUD.
 *  - screens: DD.UI.screen(id, { mount(root, params), unmount(root), update(root, params), scene, cls, onKey(e) })
 *    + show(id, params) / back() / refresh()
 *  - helpers: el, button (hotkeys), modal / choice / confirm (Esc closes), toast, tooltip (edge-aware placement)
 *  - shared views: skill / item / consumable / status / scar / hero / enemy tooltips + cards, portraits,
 *    HP bars, the next-level-up hint (v2: no XP), gold text, run status bar and the "forget a skill" picker.
 * Layers inside #ui: screens < modals < toasts < tooltip. #ui never eats pointer events itself (map clicks reach the
 * canvas); panels, buttons and full-screen screens opt in via CSS.
 */
(function () {
  'use strict';
  const DD = window.DD;
  const U = DD.util;
  const UI = (DD.UI = DD.UI || {});

  const screens = {};
  const layers = {};
  const modalStack = [];
  const hotkeyButtons = [];
  const history = [];
  let inited = false;
  let cur = null; // { id, def, root, params }
  let updating = false;
  // A key or click that changed the screen (or opened a modal) must not also act on what appears: Space / Enter and
  // clicks are swallowed this long after a screen / modal shows (real input only; headless tests act at once).
  const SHOW_GUARD_MS = 320;
  let shownAt = -Infinity;
  let realInputHeadless = false;
  function clock() { return window.performance && performance.now ? performance.now() : Date.now(); }
  function noteShown() { shownAt = clock(); }
  /** True while fresh screen / modal input is being swallowed (see SHOW_GUARD_MS). */
  UI.inShowGuard = function () { return (!DD.headless || realInputHeadless) && clock() - shownAt < SHOW_GUARD_MS; };
  /** Tests: apply the show guard headless too (like DD.HUD.realInput). */
  UI.realInput = function (on) { realInputHeadless = on !== false; };

  UI.root = null;
  UI.current = null;
  UI.params = null;
  UI.screens = screens;
  UI.layers = layers;

  // ---- static game copy shared by screens ---------------------------------------------------------------------
  UI.ACTS = {
    1: { roman: 'I', name: "The Leaky Flagon's Basement", sub: 'Cellars, sewers and goblin warrens.' },
    2: { roman: 'II', name: 'The Hauntwood & the Necromancy Academy (Accredited)', sub: 'Cursed woods, graveyards and an overdue library.' },
    3: { roman: 'III', name: 'Behind the DM Screen', sub: 'Hellscapes, a dragon hoard and the actual table.' },
  };
  UI.NODE_TYPES = {
    combat: { icon: '⚔️', name: 'Combat', desc: 'A fight. Probably goblins. It is always goblins. Win it and one hero levels up.' },
    elite: { icon: '💀', name: 'Elite', desc: 'A nasty fight with a guaranteed rare item (and the usual one level-up). Possible regret.' },
    event: { icon: '❓', name: 'Event', desc: 'Something weird happens. The DM is improvising.' },
    shop: { icon: '🛒', name: 'Shop', desc: 'Ye Olde Overpriced Shoppe: items, skill tomes, potions and services.' },
    tavern: { icon: '🍺', name: 'Tavern', desc: 'Rest, train or recruit. Mostly drink.' },
    treasure: { icon: '💰', name: 'Treasure', desc: 'Free loot! Definitely not a mimic. Probably.' },
    boss: { icon: '👑', name: 'Boss', desc: 'The big bad of this act. Bring snacks.' },
  };
  UI.DIFFICULTIES = [
    { id: 'casual', name: 'Casual', icon: '🍕', desc: 'Enemies have 20% less HP and deal 20% less damage.', quip: 'The DM pulls his punches.' },
    { id: 'normal', name: 'Normal', icon: '🎲', desc: 'Standard enemy HP and damage.', quip: 'As the dice intended.' },
    { id: 'brutal', name: 'Brutal', icon: '☠️', desc: 'Enemies have 25% more HP, deal 20% more damage, and normal fights bring one extra enemy.', quip: 'The DM had a bad week.' },
  ];
  UI.RARITY = {
    common: { name: 'Common', color: '#cfc6b4' },
    rare: { name: 'Rare', color: '#5aa9ff' },
    legendary: { name: 'Legendary', color: '#ffb52e' },
    cursed: { name: 'Cursed', color: '#c06cff' },
  };
  UI.SLOTS = { weapon: { name: 'Weapon', icon: '🗡️' }, armor: { name: 'Armor', icon: '🛡️' }, trinket: { name: 'Trinket', icon: '💍' } };
  UI.HERO_ORDER = ['zarathor', 'syllamin', 'marbles', 'marwyn', 'ellaria', 'josiah', 'buga', 'sparrow', 'slate', 'corelos',
    'kiri', 'betty', 'basanos', 'valdris', 'hjalmar', 'pebbles'];
  const MAX_LEVEL = 10;

  // ---- tiny utils -------------------------------------------------------------------------------------------------
  function isNode(x) { return !!x && typeof x === 'object' && typeof x.nodeType === 'number'; }
  function isPlain(x) { return !!x && typeof x === 'object' && !isNode(x) && !Array.isArray(x); }
  function num(v, fb) { v = +v; return isFinite(v) ? v : (fb || 0); }
  const esc = U.escapeHtml;
  UI.esc = esc;

  /** Play a UI sound if audio exists (never in headless tests). */
  UI.sound = function (name, opts) {
    if (DD.headless || !DD.Audio || typeof DD.Audio.play !== 'function' || !name) return;
    DD.safe('Audio.play ' + name, DD.Audio.play, DD.Audio, [name, opts]);
  };

  // ---- element helpers ----------------------------------------------------------------------------------------------
  function append(node, child) {
    if (child === null || child === undefined || child === false || child === true) return;
    if (Array.isArray(child)) { for (let i = 0; i < child.length; i++) append(node, child[i]); return; }
    if (isNode(child)) { node.appendChild(child); return; }
    node.appendChild(document.createTextNode(String(child)));
  }
  UI.append = append;

  function wrapHandler(label, fn) {
    return function (e) { return DD.safe(label, fn, this, [e]); };
  }

  function applyAttrs(node, attrs) {
    for (const k in attrs) {
      const v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      switch (k) {
        case 'class': case 'className': case 'cls': {
          const list = Array.isArray(v) ? v : String(v).split(/\s+/);
          for (let i = 0; i < list.length; i++) if (list[i]) node.classList.add(list[i]);
          break;
        }
        case 'style':
          if (typeof v === 'string') node.style.cssText += ';' + v;
          else for (const s in v) {
            if (v[s] === null || v[s] === undefined) continue;
            if (s.indexOf('--') === 0) node.style.setProperty(s, v[s]); else node.style[s] = v[s];
          }
          break;
        case 'text': node.textContent = String(v); break;
        case 'html': node.innerHTML = String(v); break;
        case 'on': for (const ev in v) if (typeof v[ev] === 'function') node.addEventListener(ev, wrapHandler('UI ' + ev + ' handler', v[ev])); break;
        case 'dataset': for (const d in v) if (v[d] !== null && v[d] !== undefined) node.dataset[d] = v[d]; break;
        case 'tooltip': case 'tip': UI.tooltip(node, v); break;
        default:
          if (k.indexOf('on') === 0 && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), wrapHandler('UI ' + k, v));
          else node.setAttribute(k, v === true ? '' : String(v));
      }
    }
  }

  /** el('div.panel.wood', { style: {...}, on: { click }, ... }, ...children). attrs may be omitted. */
  UI.el = function (tag, attrs) {
    const spec = String(tag || 'div');
    const m = spec.match(/^[a-zA-Z0-9-]*/);
    const node = document.createElement(m[0] || 'div');
    spec.slice(m[0].length).replace(/([.#])([^.#]+)/g, function (_, sym, val) {
      if (sym === '.') node.classList.add(val); else node.id = val;
      return '';
    });
    let first = 2;
    if (attrs === null || attrs === undefined) first = 2;
    else if (isPlain(attrs)) applyAttrs(node, attrs);
    else first = 1;
    for (let i = first; i < arguments.length; i++) append(node, arguments[i]);
    return node;
  };
  const el = UI.el;

  /** Build an element from an HTML string (first element). */
  UI.html = function (str) {
    const t = document.createElement('template');
    t.innerHTML = String(str).trim();
    return t.content.firstElementChild || document.createTextNode('');
  };

  // ---- init & layers --------------------------------------------------------------------------------------------------
  UI.init = function () {
    if (inited && UI.root && UI.root.isConnected) return UI;
    let root = document.getElementById('ui');
    if (!root) {
      root = document.createElement('div');
      root.id = 'ui';
      document.body.appendChild(root);
    }
    root.innerHTML = '';
    UI.root = root;
    layers.screens = el('div.ui-layer.ui-screens');
    layers.modals = el('div.ui-layer.ui-modals');
    layers.toasts = el('div.ui-layer.ui-toasts');
    layers.tips = el('div.ui-layer.ui-tips');
    root.appendChild(layers.screens);
    root.appendChild(layers.modals);
    root.appendChild(layers.toasts);
    root.appendChild(layers.tips);
    tipEl = null;
    modalStack.length = 0;
    cur = null;
    UI.current = null;
    if (!inited) {
      inited = true;
      window.addEventListener('keydown', onKeyDown, true);
      // Right-click is a game control (cancel), never the browser menu — except in text fields.
      document.addEventListener('contextmenu', function (e) {
        const t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
        e.preventDefault();
      });
      document.addEventListener('mousemove', onMouseMove, { passive: true, capture: true });
      // the second click of a double click that changed the screen (or opened a modal) lands on nothing
      document.addEventListener('click', function (e) {
        if (!e.isTrusted || !UI.inShowGuard()) return;
        const t = e.target;
        if (t && t.closest && t.closest('#ui') && !(t.closest('input, textarea, select'))) { e.preventDefault(); e.stopImmediatePropagation(); }
      }, true);
      document.addEventListener('mousedown', function () { if (tipAnchor && tipAnchor._ddTip && tipAnchor._ddTip.opts.hideOnClick !== false) hideTip(); }, true);
      window.addEventListener('resize', function () { hideTip(); });
      if (DD.Events) {
        DD.Events.on('run:changed', function () { UI.update('run:changed'); });
        DD.Events.on('run:gold', function () { UI.update('run:gold'); });
      }
    }
    return UI;
  };

  // ---- screens ----------------------------------------------------------------------------------------------------------
  /** Register a screen: { mount(root, params), unmount(root), update(root, params, reason), scene, cls, onKey(e) }. */
  UI.screen = function (id, def) {
    if (!id || !def || typeof def.mount !== 'function') { DD.warn('UI.screen: bad definition for "' + id + '"'); return; }
    def.id = id;
    screens[id] = def;
    return def;
  };

  /** Switch to a screen (unmounts the current one, closes modals and tooltips). Returns true on success. */
  UI.show = function (id, params, opts) {
    UI.init();
    const def = screens[id];
    if (!def) {
      // Without the HUD the battlefield should still be visible.
      if (id === 'combat' && !DD.headless && DD.Render && typeof DD.Render.setScene === 'function') DD.safe('Render.setScene combat', DD.Render.setScene, DD.Render, ['combat']);
      DD.warn('UI.show: unknown screen "' + id + '"');
      return false;
    }
    opts = opts || {};
    hideTip();
    UI.closeAllModals('screen');
    if (cur) {
      if (!opts.noHistory && cur.id !== id && cur.def.history !== false) {
        history.push({ id: cur.id, params: cur.params });
        if (history.length > 12) history.shift();
      }
      const old = cur;
      cur = null;
      if (typeof old.def.unmount === 'function') DD.safe('unmount screen ' + old.id, old.def.unmount, old.def, [old.root]);
      if (old.root.parentNode) old.root.parentNode.removeChild(old.root);
    }
    const root = el('div.screen.screen-' + id);
    if (def.cls) applyAttrs(root, { class: def.cls });
    layers.screens.appendChild(root);
    noteShown();
    const me = { id: id, def: def, root: root, params: params || {} };
    cur = me;
    UI.current = id;
    UI.params = me.params;
    const scene = def.scene !== undefined ? def.scene : (id === 'combat' ? 'combat' : null);
    if (scene && !DD.headless && DD.Render && typeof DD.Render.setScene === 'function') {
      DD.safe('Render.setScene ' + scene, DD.Render.setScene, DD.Render, [scene]);
    }
    DD.safe('mount screen ' + id, def.mount, def, [root, me.params]);
    if (cur !== me) return true; // mount redirected elsewhere
    if (DD.Events) DD.Events.emit('ui:screen', { id: id });
    return true;
  };

  /** Navigate to a "next" spec: 'screenId' | { id, params } | function. Defaults to the map (or title without a run). */
  UI.goNext = function (next) {
    if (typeof next === 'function') return DD.safe('next step', next);
    if (next && typeof next === 'object' && next.id && screens[next.id]) return UI.show(next.id, next.params || {});
    if (typeof next === 'string' && screens[next]) return UI.show(next);
    return UI.show(UI.run() ? 'map' : 'title');
  };

  /** Re-mount the current screen with the same (or merged) params. */
  UI.refresh = function (extraParams) {
    if (!cur) return false;
    const p = extraParams ? Object.assign({}, cur.params, extraParams) : cur.params;
    return UI.show(cur.id, p, { noHistory: true });
  };

  /** Go back to the previous screen (or `fallback`, default 'title'). */
  UI.back = function (fallback) {
    while (history.length) {
      const h = history.pop();
      if (screens[h.id] && h.id !== (cur && cur.id)) return UI.show(h.id, h.params, { noHistory: true });
    }
    return UI.show(fallback || 'title', {}, { noHistory: true });
  };
  UI.clearHistory = function () { history.length = 0; };

  /** Call the current screen's update() (wired to run:changed / run:gold). */
  UI.update = function (reason) {
    if (!cur || updating || typeof cur.def.update !== 'function') return;
    updating = true;
    try { DD.safe('update screen ' + cur.id, cur.def.update, cur.def, [cur.root, cur.params, reason]); } finally { updating = false; }
  };

  UI.currentRoot = function () { return cur ? cur.root : null; };

  // ---- buttons & hotkeys ------------------------------------------------------------------------------------------------
  function normKey(k) {
    if (k === null || k === undefined) return '';
    k = String(k);
    if (k === 'Esc') return 'Escape';
    if (k === 'Space' || k === 'Spacebar') return ' ';
    return k.length === 1 ? k.toLowerCase() : k;
  }
  function keyLabel(k) {
    k = normKey(k);
    const names = { ' ': 'Space', Escape: 'Esc', Enter: 'Enter', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Tab: 'Tab' };
    return names[k] || k.toUpperCase();
  }
  UI.keyLabel = keyLabel;

  UI.isDisabled = function (b) { return !!b && (b.disabled || b.classList.contains('is-disabled')); };
  UI.setDisabled = function (b, on) {
    if (!b) return b;
    b.classList.toggle('is-disabled', !!on);
    b.setAttribute('aria-disabled', on ? 'true' : 'false');
    return b;
  };

  /**
   * button(label, onClick, { cls, disabled, tooltip, hotkey, icon, sub, sound, showKey, title })
   * Disabled buttons stay hoverable (tooltips explain why) and play the error blip when clicked.
   * A hotkey clicks the button when it is visible, enabled and not covered by a modal (consumes the key).
   */
  UI.button = function (label, onClick, opts) {
    opts = opts || {};
    const b = el('button', { type: 'button', class: ['btn'].concat(opts.cls ? String(opts.cls).split(/\s+/) : []), title: opts.title });
    if (opts.icon) b.appendChild(el('span.btn-icon', null, opts.icon));
    const lab = el('span.btn-label');
    append(lab, label);
    b.appendChild(lab);
    if (opts.sub) b.appendChild(el('span.btn-sub', null, opts.sub));
    if (opts.hotkey) {
      b.dataset.hotkey = normKey(opts.hotkey);
      if (opts.showKey !== false) b.appendChild(el('span.kbd', null, keyLabel(opts.hotkey)));
      hotkeyButtons.push(b);
    }
    if (opts.disabled) UI.setDisabled(b, true);
    if (opts.tooltip) UI.tooltip(b, opts.tooltip, opts.tooltipOpts);
    b.addEventListener('click', function (e) {
      b.blur(); // keep Space/Enter free for game hotkeys
      if (UI.isDisabled(b)) {
        UI.sound('error');
        if (typeof opts.onDisabled === 'function') DD.safe('button disabled handler', opts.onDisabled, b, [e]);
        return;
      }
      UI.sound(opts.sound === undefined ? 'click' : opts.sound);
      if (typeof onClick === 'function') DD.safe('button "' + (lab.textContent || '').slice(0, 40) + '"', onClick, b, [e]);
    });
    if (opts.hoverSound) b.addEventListener('mouseenter', function () { if (!UI.isDisabled(b)) UI.sound('hover'); });
    return b;
  };

  /** Register an arbitrary clickable element for a hotkey (used by cards). */
  UI.bindHotkey = function (node, key) {
    if (!node || !key) return node;
    node.dataset.hotkey = normKey(key);
    hotkeyButtons.push(node);
    return node;
  };

  function findHotkey(key, top) {
    for (let i = hotkeyButtons.length - 1; i >= 0; i--) {
      const b = hotkeyButtons[i];
      if (!b.isConnected) { hotkeyButtons.splice(i, 1); continue; }
      if (b.dataset.hotkey !== key || UI.isDisabled(b) || !b.getClientRects().length) continue;
      const inModal = !!b.closest('.modal-backdrop');
      if (top) { if (!top.backdrop.contains(b)) continue; } else if (inModal) continue;
      return b;
    }
    return null;
  }

  function consume(e) { e.preventDefault(); e.stopImmediatePropagation(); }

  function onKeyDown(e) {
    const t = e.target;
    const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    const top = modalStack.length ? modalStack[modalStack.length - 1] : null;
    const key = normKey(e.key);
    if (key === 'Escape') {
      hideTip();
      if (top) {
        consume(e);
        if (top.closable) top.close('escape');
        else if (top.cancelButton) top.cancelButton.click();
        return;
      }
    }
    if (typing && key !== 'Escape') { if (top) e.stopImmediatePropagation(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    // the press that changed the screen (or a quick second one) never also fires the new screen's Space / Enter
    if ((key === ' ' || key === 'Enter') && UI.inShowGuard()) { consume(e); return; }
    const btn = findHotkey(key, top);
    if (btn) { consume(e); if (!e.repeat) btn.click(); return; }
    if (top) {
      if (key === 'Enter' && top.defaultButton && top.defaultButton.isConnected) { consume(e); if (!e.repeat) top.defaultButton.click(); return; }
      e.stopImmediatePropagation(); // modals block game input underneath
      return;
    }
    if (cur && typeof cur.def.onKey === 'function') {
      const r = DD.safe('onKey ' + cur.id, cur.def.onKey, cur.def, [e, cur.root, cur.params]);
      if (r === true) consume(e);
    }
  }

  // ---- modals -------------------------------------------------------------------------------------------------------------
  /**
   * modal({ title, body, buttons: [{ label, cls, onClick(handle), close = true, hotkey, primary, cancel, disabled, tooltip }],
   *         closable = true, size: 'sm'|'md'|'lg'|'xl', cls, icon, onClose(reason), backdropClose = closable })
   * body: Node | array | HTML string. Returns { el, body, footer, close(reason), closed }.
   */
  UI.modal = function (opts) {
    UI.init();
    opts = opts || {};
    const closable = opts.closable !== false;
    const backdrop = el('div.modal-backdrop');
    const box = el('div.modal.panel', { role: 'dialog', class: [opts.size ? 'modal-' + opts.size : 'modal-md'].concat(opts.cls ? String(opts.cls).split(/\s+/) : []) });
    const handle = { el: box, backdrop: backdrop, closable: closable, closed: false, defaultButton: null, cancelButton: null };
    if (opts.title || opts.icon) {
      const head = el('div.modal-head');
      if (opts.icon) head.appendChild(el('div.modal-icon', null, opts.icon));
      const tt = el('div.modal-title');
      append(tt, opts.title);
      head.appendChild(tt);
      box.appendChild(head);
    }
    if (closable) {
      box.appendChild(el('button.modal-x', { type: 'button', title: 'Close (Esc)', 'aria-label': 'Close', on: { click: function () { UI.sound('click'); handle.close('x'); } } }, '✕'));
    }
    const body = el('div.modal-body');
    if (typeof opts.body === 'string') body.innerHTML = opts.body; else append(body, opts.body);
    box.appendChild(body);
    handle.body = body;
    const footer = el('div.modal-buttons');
    (opts.buttons || []).forEach(function (bd) {
      if (!bd) return;
      const b = UI.button(bd.label, function () {
        const r = typeof bd.onClick === 'function' ? DD.safe('modal button', bd.onClick, null, [handle]) : undefined;
        if (bd.close !== false && r !== false) handle.close('button');
      }, { cls: bd.cls || (bd.primary ? 'primary' : ''), hotkey: bd.hotkey, disabled: bd.disabled, tooltip: bd.tooltip, icon: bd.icon, sound: bd.sound });
      if (bd.primary || (bd.cls && /\bprimary\b/.test(bd.cls))) handle.defaultButton = handle.defaultButton || b;
      if (bd.cancel) handle.cancelButton = b;
      footer.appendChild(b);
    });
    if (footer.children.length) box.appendChild(footer);
    handle.footer = footer;
    backdrop.appendChild(box);
    const backdropClose = opts.backdropClose !== undefined ? opts.backdropClose : closable;
    backdrop.addEventListener('mousedown', function (e) {
      // (the second press of the double click that opened it does not close it again)
      if (e.target === backdrop && backdropClose && !(e.isTrusted && UI.inShowGuard())) handle.close('backdrop');
    });
    handle.close = function (reason) {
      if (handle.closed) return;
      handle.closed = true;
      const i = modalStack.indexOf(handle);
      if (i >= 0) modalStack.splice(i, 1);
      if (tipAnchor && backdrop.contains(tipAnchor)) hideTip();
      backdrop.classList.add('closing');
      if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
      if (typeof opts.onClose === 'function') DD.safe('modal onClose', opts.onClose, null, [reason || 'close', handle]);
    };
    hideTip();
    layers.modals.appendChild(backdrop);
    modalStack.push(handle);
    noteShown();
    return handle;
  };

  UI.topModal = function () { return modalStack.length ? modalStack[modalStack.length - 1] : null; };
  UI.modalCount = function () { return modalStack.length; };
  UI.closeAllModals = function (reason) {
    while (modalStack.length) modalStack[modalStack.length - 1].close(reason || 'all');
  };

  /** Hotkeys for long pick lists: 1-9, then 0, then letters (shown on every card). */
  const PICK_KEYS = '1234567890abcdefghijklmnopqrstuvwxyz'.split('');
  UI.PICK_KEYS = PICK_KEYS;

  /**
   * choice({ title, text, icon, options: [{ label, desc, icon, content, badge, tooltip, onPick, disabled, reason, cls,
   *          style, hotkey }], cancelLabel, onCancel, closable = false, size }) → modal handle.
   * Options are big cards with hotkeys 1-9, 0, then a, b, c… (UI.PICK_KEYS; `hotkey` overrides). The modal closes
   * before onPick runs. Long lists (7+ options, e.g. the tavern's twelve recruits) use four compact columns.
   */
  UI.choice = function (opts) {
    opts = opts || {};
    const list = el('div.choice-list' + ((opts.options || []).filter(Boolean).length > 6 ? '.many' : ''));
    const bodyKids = [];
    if (opts.text) bodyKids.push(isNode(opts.text) ? opts.text : el('div.choice-text', { html: String(opts.text) }));
    bodyKids.push(list);
    const buttons = [];
    if (opts.cancelLabel) buttons.push({ label: opts.cancelLabel, cancel: true, cls: 'ghost', onClick: function () { if (typeof opts.onCancel === 'function') DD.safe('choice cancel', opts.onCancel); } });
    const m = UI.modal({ title: opts.title, icon: opts.icon, body: bodyKids, buttons: buttons, closable: !!opts.closable, size: opts.size || 'lg', cls: 'modal-choice' + (opts.cls ? ' ' + opts.cls : ''), onClose: opts.onClose });
    (opts.options || []).forEach(function (o, i) {
      if (!o) return;
      const card = el('button.choice-option', { type: 'button', class: o.cls || null, style: o.style || null });
      if (o.icon) card.appendChild(el('div.co-icon', null, o.icon));
      const main = el('div.co-main');
      if (o.label) main.appendChild(el('div.co-label', null, o.label));
      if (o.desc) main.appendChild(el('div.co-desc', o.descHtml ? { html: o.desc } : null, o.descHtml ? null : o.desc));
      if (o.content) append(main, o.content);
      if (o.disabled && o.reason) main.appendChild(el('div.co-reason', null, o.reason));
      card.appendChild(main);
      if (o.badge) card.appendChild(el('div.co-badge', null, o.badge));
      const hk = o.hotkey || PICK_KEYS[i];
      if (hk) {
        card.appendChild(el('span.kbd.co-key', null, keyLabel(hk)));
        UI.bindHotkey(card, hk);
      }
      if (o.disabled) UI.setDisabled(card, true);
      if (o.tooltip) UI.tooltip(card, o.tooltip);
      card.addEventListener('click', function () {
        if (UI.isDisabled(card)) { UI.sound('error'); return; }
        UI.sound(o.sound || 'click');
        m.close('pick');
        if (typeof o.onPick === 'function') DD.safe('choice onPick', o.onPick, null, [o, i]);
      });
      list.appendChild(card);
    });
    return m;
  };

  /**
   * confirm(text, { title, yes, no, danger, icon }) → Promise<boolean>. Esc / ✕ = false. Enter picks "yes" — except for
   * danger confirms (abandon, reset, discard), where Enter keeps things as they are: a stray key never destroys a run.
   */
  UI.confirm = function (text, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      let done = false;
      function finish(v) { if (!done) { done = true; resolve(v); } }
      UI.modal({
        title: opts.title || 'Are you sure?', icon: opts.icon, size: 'sm', cls: 'modal-confirm',
        body: isNode(text) ? text : el('div.confirm-text', { html: String(text || '') }),
        buttons: [
          { label: opts.no || 'Never mind', cls: 'ghost', cancel: true, primary: !!opts.danger, onClick: function () { finish(false); } },
          { label: opts.yes || 'Do it', cls: opts.danger ? 'danger' : 'primary', primary: !opts.danger, onClick: function () { finish(true); } },
        ],
        onClose: function () { finish(false); },
      });
    });
  };

  /** Simple message modal with one OK button. */
  UI.alert = function (title, body, opts) {
    opts = opts || {};
    return UI.modal({ title: title, body: body, icon: opts.icon, size: opts.size || 'sm', buttons: [{ label: opts.ok || 'Okay', primary: true, onClick: opts.onOk }], onClose: opts.onClose });
  };

  // ---- toasts -----------------------------------------------------------------------------------------------------------------
  /** toast(text, { cls: 'good'|'bad'|'gold'|'info'|'level', ms, icon, html }) */
  UI.toast = function (text, opts) {
    UI.init();
    opts = opts || {};
    const t = el('div.toast', { class: opts.cls });
    if (opts.icon) t.appendChild(el('span.toast-icon', null, opts.icon));
    t.appendChild(el('span.toast-text', opts.html ? { html: String(text) } : null, opts.html ? null : String(text)));
    layers.toasts.appendChild(t);
    while (layers.toasts.children.length > 5) layers.toasts.removeChild(layers.toasts.firstChild);
    const ms = opts.ms || 2600;
    setTimeout(function () {
      t.classList.add('out');
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 320);
    }, ms);
    return t;
  };

  // ---- tooltips -----------------------------------------------------------------------------------------------------------------
  let tipEl = null;
  let tipAnchor = null;
  let tipTimer = 0;

  function ensureTip() {
    if (tipEl && tipEl.isConnected) return tipEl;
    UI.init();
    tipEl = el('div.ui-tooltip', { role: 'tooltip' });
    layers.tips.appendChild(tipEl);
    return tipEl;
  }

  /**
   * Attach a hover tooltip. content: HTML string | Node | fn(node) → string|Node (evaluated on hover).
   * opts: { pos: 'top'|'bottom'|'right'|'left', delay, cls, hideOnClick }
   */
  UI.tooltip = function (node, content, opts) {
    if (!node) return node;
    node._ddTip = { content: content, opts: opts || {} };
    if (!node._ddTipBound) {
      node._ddTipBound = true;
      node.addEventListener('mouseenter', function () {
        clearTimeout(tipTimer);
        const d = node._ddTip && node._ddTip.opts.delay;
        tipTimer = setTimeout(function () { showTipFor(node); }, d !== undefined ? d : 90);
      });
      node.addEventListener('mouseleave', function () {
        clearTimeout(tipTimer);
        if (tipAnchor === node) hideTip();
      });
    }
    return node;
  };

  function showTipFor(node) {
    if (!node.isConnected || !node._ddTip) return;
    let c = node._ddTip.content;
    if (typeof c === 'function') c = DD.safe('tooltip content', c, node, [node]);
    if (c === null || c === undefined || c === '') { hideTip(); return; }
    UI.showTooltip(c, node.getBoundingClientRect(), node._ddTip.opts);
    tipAnchor = node;
  }

  /** Show a tooltip at a DOMRect or {x, y} point (e.g. a canvas position). */
  UI.showTooltip = function (content, rect, opts) {
    opts = opts || {};
    const t = ensureTip();
    t.className = 'ui-tooltip' + (opts.cls ? ' ' + opts.cls : '');
    t.innerHTML = '';
    if (typeof content === 'string') t.innerHTML = content; else append(t, content);
    t.style.left = '0px';
    t.style.top = '0px';
    t.style.display = 'block';
    t.classList.remove('show');
    const r = rect && rect.width !== undefined ? rect : { left: (rect && rect.x) || 0, top: (rect && rect.y) || 0, width: 0, height: 0, right: (rect && rect.x) || 0, bottom: (rect && rect.y) || 0 };
    placeTip(t, r, opts.pos || 'top', opts.gap !== undefined ? opts.gap : 10);
    void t.offsetWidth;
    t.classList.add('show');
    tipAnchor = null;
    return t;
  };

  function placeTip(t, r, pref, gap) {
    const vw = window.innerWidth || 1280, vh = window.innerHeight || 720, m = 8;
    const tw = t.offsetWidth, th = t.offsetHeight;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const pos = {
      top: { x: cx - tw / 2, y: r.top - th - gap },
      bottom: { x: cx - tw / 2, y: r.top + r.height + gap },
      right: { x: r.left + r.width + gap, y: cy - th / 2 },
      left: { x: r.left - tw - gap, y: cy - th / 2 },
    };
    const orders = { top: ['top', 'bottom', 'right', 'left'], bottom: ['bottom', 'top', 'right', 'left'], right: ['right', 'left', 'top', 'bottom'], left: ['left', 'right', 'top', 'bottom'] };
    const order = orders[pref] || orders.top;
    let best = null, bestScore = -1;
    for (let i = 0; i < order.length; i++) {
      const p = pos[order[i]];
      const fitsMain = (order[i] === 'top' ? p.y >= m : order[i] === 'bottom' ? p.y + th <= vh - m : order[i] === 'right' ? p.x + tw <= vw - m : p.x >= m);
      if (fitsMain) { best = { side: order[i], x: p.x, y: p.y }; break; }
      const visW = Math.max(0, Math.min(vw, p.x + tw) - Math.max(0, p.x));
      const visH = Math.max(0, Math.min(vh, p.y + th) - Math.max(0, p.y));
      const score = visW * visH;
      if (score > bestScore) { bestScore = score; best = { side: order[i], x: p.x, y: p.y }; }
    }
    const x = U.clamp(best.x, m, Math.max(m, vw - tw - m));
    const y = U.clamp(best.y, m, Math.max(m, vh - th - m));
    t.style.left = Math.round(x) + 'px';
    t.style.top = Math.round(y) + 'px';
    t.dataset.side = best.side;
  }

  function hideTip() {
    clearTimeout(tipTimer);
    tipAnchor = null;
    if (tipEl) { tipEl.classList.remove('show'); tipEl.style.display = 'none'; }
  }
  UI.hideTooltip = hideTip;

  function onMouseMove() {
    if (tipAnchor && !tipAnchor.isConnected) hideTip();
  }

  // ---- number / label helpers ---------------------------------------------------------------------------------------------
  UI.signed = function (n) { n = Math.round(n * 100) / 100; return (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n); };
  UI.pct = function (f) { const v = Math.round(f * 100); return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v) + '%'; };
  UI.roman = function (n) { return U.roman(n); };
  UI.stars = function (n, max) {
    max = max || 3;
    const s = el('span.stars', { title: 'Complexity ' + n + '/' + max });
    for (let i = 1; i <= max; i++) s.appendChild(el('span.star' + (i <= n ? '.on' : ''), null, '★'));
    return s;
  };
  UI.pips = function (n, max, cls) {
    const s = el('span.pips' + (cls ? '.' + cls : ''));
    for (let i = 1; i <= max; i++) s.appendChild(el('span.pip' + (i <= n ? '.on' : '')));
    return s;
  };

  /** Coin + amount. Returns a <span>; goldHtml returns the same as a string. */
  UI.goldText = function (n, opts) {
    opts = opts || {};
    return el('span.gold-text' + (opts.big ? '.big' : ''), null, el('span.coin'), el('span.gold-num', null, String(Math.round(num(n)))));
  };
  UI.goldHtml = function (n) { return '<span class="gold-text"><span class="coin"></span><span class="gold-num">' + Math.round(num(n)) + '</span></span>'; };

  function hpClass(frac) { return frac > 0.6 ? 'hp-high' : frac > 0.3 ? 'hp-mid' : 'hp-low'; }

  /** hpBar(cur, max, { block, small, big, text = true, label, dead, cls }) → element. */
  UI.hpBar = function (curHp, max, opts) {
    opts = opts || {};
    max = Math.max(1, num(max, 1));
    curHp = U.clamp(num(curHp), 0, max);
    const frac = curHp / max;
    const bar = el('div.hpbar', { class: [opts.small ? 'small' : '', opts.big ? 'big' : '', opts.dead ? 'dead' : '', opts.cls || '', hpClass(frac)] });
    bar.appendChild(el('div.hp-fill', { style: { width: (frac * 100).toFixed(1) + '%' } }));
    if (opts.text !== false) bar.appendChild(el('div.hp-text', null, opts.dead ? (opts.deadText || 'DEAD') : (opts.label ? opts.label + ' ' : '') + Math.round(curHp) + ' / ' + Math.round(max)));
    if (opts.block) bar.appendChild(el('div.hp-block', { title: 'Block' }, '🛡 ' + Math.round(opts.block)));
    return bar;
  };

  /** Generic progress meter (e.g. Hype): meter(value, max, { label, color, cls }) → element (.full at max). */
  UI.meter = function (value, max, opts) {
    opts = opts || {};
    max = Math.max(1, num(max, 100));
    value = U.clamp(num(value), 0, max);
    const m = el('div.meter', { class: [opts.cls || '', value >= max ? 'full' : ''], style: opts.color ? { '--mc': opts.color } : null });
    m.appendChild(el('div.meter-fill', { style: { width: (value / max * 100).toFixed(1) + '%' } }));
    if (opts.label !== false) m.appendChild(el('div.meter-text', null, opts.label !== undefined ? opts.label : Math.round(value) + ' / ' + Math.round(max)));
    return m;
  };

  /** Action-point pips: apPips(current, max) → element. */
  UI.apPips = function (cur, max) {
    const s = el('span.ap-pips', { title: Math.max(0, num(cur)) + ' / ' + num(max) + ' AP' });
    for (let i = 1; i <= num(max); i++) s.appendChild(el('span.ap-pip' + (i <= num(cur) ? '.on' : '')));
    return s;
  };

  UI.MAX_LEVEL = MAX_LEVEL;

  // ---- v2 leveling: no XP — one hero levels up per won fight, drawn among the lowest levels (DD.Run) ------------
  /** "A", "A and B", "A, B and C". */
  function andList(names) {
    if (names.length < 2) return names.join('');
    return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
  }
  UI.andList = andList;

  /** Who the DM rolls among for the next level-up: { candidates: [heroIdx], names, level, maxed, all, text }, e.g.
   *  text "Next level-up: random among Ellaria and Josiah". null without a run. */
  UI.nextLevelUp = function () {
    const run = UI.run();
    if (!run || !Array.isArray(run.party)) return null;
    let info = DD.Run && typeof DD.Run.nextLevelUp === 'function' ? DD.safe('Run.nextLevelUp', DD.Run.nextLevelUp, DD.Run) : null;
    if (!info || !Array.isArray(info.candidates)) {
      // without the run layer's rotation: the living heroes with the lowest level below the max
      const open = run.party.map(function (h, i) { return i; }).filter(function (i) { const h = run.party[i]; return h && !h.dead && num(h.level, 1) < MAX_LEVEL; });
      const low = open.reduce(function (m, i) { return Math.min(m, num(run.party[i].level, 1)); }, Infinity);
      const c = open.filter(function (i) { return num(run.party[i].level, 1) === low; });
      info = { candidates: c, level: c.length ? low : MAX_LEVEL, maxed: !c.length };
    }
    const alive = run.party.filter(function (h) { return h && !h.dead; }).length;
    const names = info.candidates.map(function (i) { return UI.heroName(run.party[i]); });
    const n = names.length;
    let text;
    if (!n) text = alive ? 'Everyone is at the max level. The DM has run out of levels.' : '';
    else if (n === 1) text = 'Next level-up: ' + names[0] + ' (the only one behind).';
    else if (n === alive && n > 2) text = 'Next level-up: anyone (the DM rolls a d' + n + ').';
    else text = 'Next level-up: random among ' + andList(names) + '.';
    return { candidates: info.candidates.slice(), names: names, level: info.level, maxed: !n && alive > 0, all: n > 1 && n === alive, text: text };
  };
  /** True when party slot idx is in the running for the next level-up. */
  UI.isNextLevelUp = function (idx) {
    const n = UI.nextLevelUp();
    return !!n && n.candidates.indexOf(idx) >= 0;
  };
  /** True when slot idx gets the 🎲 "next level-up" marker: in the running while somebody else is not (when the
   *  whole party is level, a marker on everyone says nothing). */
  UI.levelMark = function (idx) {
    const n = UI.nextLevelUp();
    return !!n && !n.all && n.candidates.indexOf(idx) >= 0;
  };
  /** One line about a hero's place in the level-up rotation (tooltips, party sheet). '' for the dead. */
  function levelLine(rh, idx) {
    if (!rh || rh.dead) return '';
    if (num(rh.level, 1) >= MAX_LEVEL) return 'Max level (' + MAX_LEVEL + '). The DM has nothing left to give.';
    const n = UI.nextLevelUp();
    if (!n) return '';
    const k = typeof idx === 'number' ? n.candidates.indexOf(idx) : -1;
    if (k >= 0 && n.candidates.length === 1) return '🎲 Next in line for a level-up (the only one behind).';
    if (k >= 0) return '🎲 In the running for the next level-up (the DM rolls among ' + n.candidates.length + ').';
    return '🎲 ' + n.text;
  }
  UI.levelLine = levelLine;

  // ---- defs & run accessors ------------------------------------------------------------------------------------------------
  UI.run = function () { return DD.Run && DD.Run.state ? DD.Run.state : null; };

  /** Show the right screen for the loaded run (DD.Run.resume when available: pending step, fight restart, map). */
  UI.resumeRun = function () {
    if (DD.Run && typeof DD.Run.resume === 'function') {
      DD.safe('Run.resume', DD.Run.resume, DD.Run);
      return true;
    }
    const run = UI.run();
    if (!run) return UI.show('title');
    const p = run.pending;
    if (p && p.type && screens[p.type] && p.type !== 'combat') return UI.show(p.type, Object.assign({ resumed: true }, p.data || {}));
    return UI.show('map');
  };
  UI.meta = function () { return DD.Meta && DD.Meta.data ? DD.Meta.data : null; };
  UI.settings = function () {
    const m = UI.meta();
    return (m && m.settings) || { animSpeed: 1, sfx: true, volume: 0.6, shake: true, unlockAll: false, showGrid: true };
  };

  function defIdOf(x) {
    if (!x) return null;
    if (typeof x === 'string') return x;
    return x.defId || x.id || null;
  }
  UI.heroDef = function (x) { const id = defIdOf(x); return id ? DD.getHero(id) : null; };
  UI.heroName = function (x) {
    const d = UI.heroDef(x);
    if (d) return d.name;
    return (x && x.name) || (typeof x === 'string' ? x : 'Someone');
  };
  UI.anyDef = function (x) {
    const id = defIdOf(x);
    return id ? (DD.getHero(id) || DD.getEnemy(id) || DD.getSummon(id)) : null;
  };

  /** Hero ids in display order: canonical heroes first, test fixtures hidden once real heroes exist. */
  /** Sort rank of a hero's unlock: starters 0, act N → N, a boss of act N → N + 0.5. */
  function unlockRank(d) {
    const u = d && d.unlock;
    if (!u) return 0;
    if (u.act) return +u.act;
    const e = u.boss ? DD.getEnemy(u.boss) : null;
    return (e && e.act ? e.act : u.boss === 'grimble' ? 1 : 2) + 0.5;
  }

  UI.heroIds = function () {
    const all = Object.keys(DD.defs.heroes || {});
    const real = all.filter(function (id) { return id.indexOf('test_') !== 0; });
    const list = real.length >= 4 ? real : all;
    return list.sort(function (a, b) {
      const ia = UI.HERO_ORDER.indexOf(a), ib = UI.HERO_ORDER.indexOf(b);
      const da = DD.getHero(a), db = DD.getHero(b);
      const ua = unlockRank(da), ub = unlockRank(db);
      if (ua !== ub) return ua - ub;
      if (ia !== ib) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      return String(da.name).localeCompare(String(db.name));
    });
  };

  UI.isUnlocked = function (heroId) {
    const d = DD.getHero(heroId);
    if (!d) return false;
    const s = UI.settings();
    if (s.unlockAll) return true;
    if (DD.Meta && typeof DD.Meta.isUnlocked === 'function') {
      const r = DD.safe('Meta.isUnlocked', DD.Meta.isUnlocked, DD.Meta, [heroId]);
      if (r !== undefined) return !!r;
    }
    return !d.unlock;
  };

  UI.unlockHint = function (heroDef) {
    const u = heroDef && heroDef.unlock;
    if (!u) return '';
    if (DD.Meta && typeof DD.Meta.unlockHint === 'function') {
      const h = DD.safe('Meta.unlockHint', DD.Meta.unlockHint, DD.Meta, [heroDef.id]);
      if (h) return String(h);
    }
    if (u.boss) return 'Defeat ' + ((DD.getEnemy(u.boss) || {}).name || u.boss) + ' to unlock.';
    if (u.act >= 3) return 'Defeat the Dungeon Master to unlock.';
    if (u.act) return 'Clear Act ' + U.roman(u.act) + ' to unlock.';
    if (u.text) return String(u.text);
    return 'Keep playing to unlock.';
  };

  /** Stats for a RunHero via DD.Run.heroStats, with a base + growth fallback. */
  UI.heroStats = function (rh) {
    if (rh && DD.Run && typeof DD.Run.heroStats === 'function') {
      const s = DD.safe('Run.heroStats', DD.Run.heroStats, DD.Run, [rh]);
      if (s && typeof s === 'object') return s;
    }
    const d = UI.heroDef(rh) || {};
    const st = d.stats || {};
    const lvl = num(rh && rh.level, 1);
    return {
      maxHp: num(st.hp, 20) + num(d.growth && d.growth.hp, 4) * (lvl - 1), ap: num(st.ap, 3), mov: num(st.mov, 4),
      armor: num(st.armor, 0), dmg: 0, heal: 0, range: 0, block: 0, hype: 0, init: num(st.init, 0),
    };
  };

  /** True when every {token} of a narration line is filled by vars. */
  function tokensFilled(line, vars) {
    const re = /\{(\w+)\}/g;
    let m;
    while ((m = re.exec(line))) if (vars[m[1]] === undefined || vars[m[1]] === null) return false;
    return true;
  }
  UI.tokensFilled = function (line, vars) { return tokensFilled(String(line || ''), vars || {}); };

  /**
   * Narration line with a local fallback list (so the UI never shows an empty bubble). Lines that use a token the
   * caller does not fill ("{hero}" without vars.hero) are skipped, so authors may use tokens on keys the screens call
   * without vars. The pick still goes through DD.narrate (a cosmetic RNG shim selects the usable line).
   */
  UI.narrate = function (key, vars, fallback) {
    vars = vars || {};
    let s = '';
    const lines = (DD.defs && DD.defs.narration && DD.defs.narration[key]) || [];
    const usable = [];
    lines.forEach(function (l, i) { if (tokensFilled(l, vars)) usable.push(i); });
    if (usable.length && typeof DD.narrate === 'function') {
      const idx = U.pick(usable, DD.rng);
      s = DD.narrate(key, vars, { next: function () { return (idx + 0.5) / lines.length; } }) || '';
      if (!tokensFilled(s, vars)) s = '';
    }
    if (!s && fallback && fallback.length) {
      const ok = fallback.filter(function (l) { return tokensFilled(l, vars); });
      if (ok.length) s = U.fmt(U.pick(ok, DD.rng), vars);
    }
    return s;
  };

  // ---- skill descriptions ----------------------------------------------------------------------------------------------------
  const KIND_LABEL = { attack: 'Attack', spell: 'Spell', buff: 'Buff', heal: 'Heal', summon: 'Summon', move: 'Movement', utility: 'Utility' };
  const FILTER_LABEL = {
    enemy: 'an enemy', ally: 'an ally', allyOrSelf: 'an ally or self', any: 'any unit', notSelf: 'another unit',
    empty: 'an empty tile', emptyOrUnit: 'a tile', downedAlly: 'a downed ally', object: 'an object',
  };

  function isCombatUnit(u) { return !!u && typeof u === 'object' && u.x !== undefined && u.side !== undefined; }

  /**
   * A stand-in combat unit for a RunHero outside combat (party sheet, level-up, tavern, shop, rewards): items, scars and
   * Blessings attached, standing off the board, so skill text, costs and ranges show the item- and Blessing-adjusted
   * numbers the HUD would show at the start of a fight. Never placed in a fight; cached per RunHero until its gear,
   * scars, Blessings, skills or level change. null without the engine or for an unknown hero.
   */
  const sheetCache = typeof WeakMap === 'function' ? new WeakMap() : null;
  UI.sheetUnit = function (rh) {
    if (!rh || typeof rh !== 'object' || isCombatUnit(rh) || !rh.id || !DD.getHero(rh.id)) return null;
    if (!DD.Combat || typeof DD.Combat.makeHeroUnit !== 'function') return null;
    const key = JSON.stringify([rh.level, rh.items, rh.scars, rh.passives, rh.skills, rh.hp]);
    const hit = sheetCache && sheetCache.get(rh);
    if (hit && hit.key === key) return hit.unit;
    const u = DD.safe('Combat.makeHeroUnit', DD.Combat.makeHeroUnit, DD.Combat, [rh, -100, -100]);
    if (!u) return null;
    u.sheet = true;
    u.ap = u.maxAp;
    if (sheetCache) sheetCache.set(rh, { key: key, unit: u });
    return u;
  };
  /** The unit to describe skills with: a combat unit as is, a RunHero as its sheet unit, anything else null. */
  function describer(x) { return isCombatUnit(x) ? x : UI.sheetUnit(x); }
  UI.describer = describer;

  /** Display name of a hook source (DD.Hooks.sources extra): hero passive, item, scar, Blessing, status or rule. */
  function sourceName(x) {
    if (!x || typeof x !== 'object') return '';
    if (x.def && x.def.name) return (x.def.icon ? x.def.icon + ' ' : '') + x.def.name;
    if (x.name) return (x.icon ? x.icon + ' ' : '') + x.name;
    const sd = x.id ? DD.getStatus(x.id) : null;
    return sd ? (sd.icon ? sd.icon + ' ' : '') + sd.name : '';
  }
  /** Which hook sources change a skill's AP cost on their own (for the "why" line under a modified cost). */
  function costSources(user, def, L, base) {
    if (!user || !DD.Hooks || typeof DD.Hooks.sources !== 'function') return [];
    const out = [];
    (DD.safe('Hooks.sources', DD.Hooks.sources, DD.Hooks, [user]) || []).forEach(function (src) {
      if (!src || !src.hooks || typeof src.hooks.modifyCost !== 'function') return;
      const c = { unit: user, skill: def, ap: base, hp: num(DD.resolve(def.hpCost, L, user, 0)) };
      DD.safe('modifyCost of ' + src.label, src.hooks.modifyCost, src.hooks, [c, src.extra]);
      const d = Math.round(num(c.ap)) - base;
      const name = sourceName(src.extra);
      if (d && name) out.push((d > 0 ? '+' : '−') + Math.abs(d) + ' AP: ' + name);
    });
    return out;
  }

  /**
   * Gold in a skill's level table: a cost ("Spend 5 gold…", "Pay 10 gold…") or a gain ("…pockets 2 gold", "…gains 8
   * gold"), told apart by the verb in front of that number in the (exact) desc. → { cost } | { gain } | null.
   */
  UI.skillGold = function (skillId, level, unit) {
    const def = typeof skillId === 'object' && skillId ? skillId : DD.getSkill(skillId);
    if (!def) return null;
    const L = DD.skillLevel(def, level || 1);
    const n = Math.round(num(L && L.gold));
    if (!(n > 0)) return null;
    const desc = DD.skillDesc(def, level || 1, describer(unit));
    const verb = function (re) {
      let m;
      re.lastIndex = 0;
      while ((m = re.exec(desc))) if (+m[2] === n) return true;
      return false;
    };
    if (verb(/\b(spend|spends|pay|pays)\s+(\d+)\s+gold\b/gi)) return { cost: n };
    if (verb(/\b(pocket|pockets|gain|gains|earn|earns)\s+(\d+)\s+gold\b/gi)) return { gain: n };
    return null;
  };

  function resolveRange(def, L, user, level) {
    const tg = def.target || {};
    let r = null;
    if (isCombatUnit(user) && DD.Targeting && typeof DD.Targeting.range === 'function') {
      r = DD.safe('Targeting.range', DD.Targeting.range, DD.Targeting, [user, def, level]);
    }
    if (!r) r = DD.resolve(tg.range, L, isCombatUnit(user) ? user : null, null);
    if (r === null || r === undefined) r = tg.type === 'self' ? [0, 0] : [1, 1];
    if (!Array.isArray(r)) r = [Math.min(1, num(r)), num(r)];
    return [num(r[0]), num(r[1])];
  }

  function rangeLabel(def, L, user, level) {
    const tg = def.target || {};
    if (tg.type === 'self') return 'Self';
    if (tg.type === 'dir') return 'Direction (adjacent)';
    const r = resolveRange(def, L, user, level);
    if (r[1] <= 0) return 'Self';
    if (r[1] === 1 && r[0] <= 1) return 'Melee';
    return r[0] === r[1] ? 'Range ' + r[1] : 'Range ' + r[0] + '–' + r[1];
  }

  function areaLabel(def, L, user) {
    const a = def.area || { shape: 'single' };
    const size = num(DD.resolve(a.size, L, isCombatUnit(user) ? user : null, 1), 1);
    switch (a.shape) {
      case undefined: case null: case 'single': return '';
      case 'circle': return 'Radius ' + size;
      case 'square': return (2 * size + 1) + '×' + (2 * size + 1) + ' square';
      case 'ring': return 'Ring at ' + size;
      case 'cross': return 'Cross (arms ' + size + ')';
      case 'line': return 'Line ' + size + (a.pierce === false ? ', stops at first unit' : ', pierces');
      case 'cone': return 'Cone ' + size;
      case 'row': return 'Row, width ' + (2 * size + 1);
      case 'adjacent': return 'All adjacent tiles';
      case 'all_foes': return 'Every foe';
      case 'all_allies': return 'Every ally';
      case 'custom': return 'Special area';
      default: return U.capitalize(String(a.shape)) + ' ' + size;
    }
  }

  /**
   * Structured info about a skill at a level (shared by cards and tooltips). `unit` may be a combat unit or a RunHero
   * (described through its sheet unit): text, range and costs then include its items, scars and Blessings, with the
   * AP / HP cost after modifyCost hooks (baseAp / baseHp keep the listed numbers).
   */
  UI.skillInfo = function (skillId, level, unit) {
    const def = typeof skillId === 'object' && skillId ? skillId : DD.getSkill(skillId);
    if (!def) return null;
    const maxLevel = def.maxLevel || (def.levels && def.levels.length) || 1;
    const lv = U.clamp(num(level, 1) || 1, 1, maxLevel);
    const L = DD.skillLevel(def, lv);
    const user = describer(unit);
    const info = {
      def: def, id: def.id, name: def.name || def.id, icon: def.icon || '✦', kind: def.kind || 'attack',
      level: lv, maxLevel: maxLevel, L: L, user: user,
      ap: num(DD.resolve(def.ap, L, user, 0)),
      hpCost: num(DD.resolve(def.hpCost, L, user, 0)),
      cooldown: num(DD.resolve(def.cooldown, L, user, 0)),
      charges: num(DD.resolve(def.charges, L, user, 0)),
      hype: num(def.hype),
      range: rangeLabel(def, L, user, lv),
      area: areaLabel(def, L, user),
      target: (def.target && FILTER_LABEL[def.target.filter]) || '',
      los: !!(def.target && def.target.los),
      straight: !!(def.target && def.target.straight),
      desc: DD.skillDesc(def, lv, user),
      next: lv < maxLevel ? DD.skillDesc(def, lv + 1, user) : '',
      flavor: def.flavor || '',
      tags: (def.tags || []).filter(function (t) { return typeof t === 'string'; }),
      random: (def.tags || []).indexOf('random') >= 0,
    };
    info.baseAp = info.ap;
    info.baseHp = info.hpCost;
    if (user && def.owner !== 'enemy' && DD.Combat && typeof DD.Combat.costOf === 'function') {
      const c = DD.safe('Combat.costOf', DD.Combat.costOf, DD.Combat, [user, def, lv]);
      if (c) { info.ap = num(c.ap); info.hpCost = num(c.hp); }
    }
    info.gold = UI.skillGold(def, lv, user);
    return info;
  };

  /** Lines naming what changed a skill's AP cost (Blessings, items, scars, the hero passive); [] when unchanged. */
  UI.skillCostNotes = function (info) {
    if (!info || !info.user || info.ap === info.baseAp) return [];
    const notes = costSources(info.user, info.def, info.L, info.baseAp);
    return notes.length ? notes : ['Listed at ' + info.baseAp + ' AP'];
  };

  function costPills(info, opts) {
    opts = opts || {};
    const out = [];
    if (info.hype) out.push('<span class="pill hype">' + info.hype + ' Hype</span>');
    const apMod = info.baseAp !== undefined && info.ap !== info.baseAp ? (info.ap < info.baseAp ? ' mod-down' : ' mod-up') : '';
    out.push('<span class="pill ap' + apMod + '"' + (apMod ? ' title="Listed at ' + info.baseAp + ' AP"' : '') + '>' + info.ap + ' AP' +
      (apMod ? ' <s>' + info.baseAp + '</s>' : '') + '</span>');
    if (opts.paidBy && info.baseHp > 0) out.push('<span class="pill hpcost paid" title="Paid by ' + esc(opts.paidBy) + '">🩸 <s>−' + info.baseHp + ' HP</s> paid by ' + esc(opts.paidBy) + '</span>');
    else if (info.hpCost) out.push('<span class="pill hpcost">−' + info.hpCost + ' HP</span>');
    if (info.gold && info.gold.cost) out.push('<span class="pill goldcost" title="Spends party gold">🪙 ' + info.gold.cost + ' gold</span>');
    else if (info.gold && info.gold.gain && !opts.compact) out.push('<span class="pill goldgain" title="Pockets party gold">🪙 +' + info.gold.gain + '</span>');
    if (info.cooldown) out.push('<span class="pill cd" title="Cooldown: unusable for this many of its turns after use">⟳ ' + info.cooldown + '</span>');
    if (info.charges) out.push('<span class="pill charges" title="Uses per combat">×' + info.charges + '/fight</span>');
    if (opts.cdLeft) out.push('<span class="pill cdleft">Ready in ' + opts.cdLeft + '</span>');
    return out.join('');
  }

  function levelBadge(info) {
    if (info.maxLevel <= 1) return '';
    let pips = '';
    for (let i = 1; i <= info.maxLevel; i++) pips += '<span class="pip' + (i <= info.level ? ' on' : '') + '"></span>';
    return '<span class="lvl-badge">' + U.roman(info.level) + '<span class="pips">' + pips + '</span></span>';
  }

  /** Full skill tooltip. opts: { showNext, slot (SkillSlot), role: 'basic'|'signature'|null, cdLeft, paidBy (who pays
   *  the HP cost instead) }. `unit`: a combat unit, a RunHero (its sheet unit) or nothing (listed numbers). */
  UI.skillTooltipHtml = function (skillId, level, unit, opts) {
    opts = opts || {};
    const info = UI.skillInfo(skillId, level, unit);
    if (!info) return '<div class="tt"><div class="tt-desc">Unknown skill.</div></div>';
    const live = isCombatUnit(unit) && !unit.sheet;   // a fight is running: per-fight details (cooldowns, uses left)
    const slot = opts.slot || (live ? findSlot(unit, info.id) : null);
    const cdLeft = opts.cdLeft || (slot && slot.cd > 0 ? slot.cd : 0);
    const subParts = [opts.role === 'basic' ? 'Basic attack' : opts.role === 'signature' ? 'Signature' : (KIND_LABEL[info.kind] || U.capitalize(info.kind))];
    info.tags.slice(0, 4).forEach(function (t) { if (t !== info.kind && t !== 'random') subParts.push(U.capitalize(t)); });
    const tgt = [info.range];
    if (info.area) tgt.push(info.area);
    if (info.target && info.range !== 'Self') tgt.push('Targets ' + info.target);
    if (info.los) tgt.push('Needs line of sight');
    if (info.straight) tgt.push('Straight lines only');
    let h = '<div class="tt tt-skill kind-' + esc(info.kind) + '">';
    h += '<div class="tt-head"><span class="tt-icon">' + esc(info.icon) + '</span><div class="tt-titles"><div class="tt-title">' + esc(info.name) + ' ' + levelBadge(info) + '</div>';
    h += '<div class="tt-sub">' + esc(subParts.join(' · ')) + (info.random ? ' · <span class="tt-random">Random</span>' : '') + '</div></div></div>';
    h += '<div class="tt-costs">' + costPills(info, { cdLeft: cdLeft, paidBy: opts.paidBy }) + '</div>';
    const notes = UI.skillCostNotes(info);
    if (notes.length) h += '<div class="tt-costnote">' + esc(notes.join(' · ')) + (live ? '' : ' (its cost at the start of a turn)') + '</div>';
    if (opts.paidBy) h += '<div class="tt-costnote">🩸 ' + esc(opts.paidBy) + ' pays the ' + info.baseHp + ' HP instead' + (opts.paidWhy ? ' (' + esc(opts.paidWhy) + ')' : '') + '.</div>';
    h += '<div class="tt-target">🎯 ' + esc(tgt.join(' · ')) + '</div>';
    UI.aimNotes(info.def, info.user).forEach(function (n) { h += '<div class="tt-target tt-aimnote">' + esc(n) + '</div>'; });
    if (slot && info.charges) h += '<div class="tt-target">Uses left this fight: ' + Math.max(0, info.charges - num(slot.uses)) + '</div>';
    h += '<div class="tt-desc">' + esc(info.desc || 'No description.') + '</div>';
    if (opts.showNext && info.next) h += '<div class="tt-next"><span>Level ' + U.roman(info.level + 1) + ':</span> ' + esc(info.next) + '</div>';
    if (info.flavor) h += '<div class="tt-flavor">“' + esc(info.flavor) + '”</div>';
    h += '</div>';
    return h;
  };

  function findSlot(unit, skillId) {
    const lists = [unit.skills, unit.skillSlots, [unit.basic], [unit.signature]];
    for (let i = 0; i < lists.length; i++) {
      const l = lists[i];
      if (!l) continue;
      for (let j = 0; j < l.length; j++) if (l[j] && l[j].id === skillId) return l[j];
    }
    return null;
  }

  /**
   * skillCard(skillId, level, { unit, compact, onClick, selected, disabled, badge, showNext, role, hotkey, tooltip = true,
   *                             cls, cdLeft, tipPos })
   */
  UI.skillCard = function (skillId, level, opts) {
    opts = opts || {};
    const info = UI.skillInfo(skillId, level, opts.unit);
    const card = el('div.skill-card', { class: [opts.compact ? 'compact' : '', opts.selected ? 'selected' : '', opts.cls || '', info ? 'kind-' + info.kind : 'missing', opts.role ? 'role-' + opts.role : '', opts.onClick ? 'clickable' : ''] });
    if (!info) {
      card.appendChild(el('div.sc-icon', null, '✖'));
      card.appendChild(el('div.sc-main', null, el('div.sc-name', null, 'Unknown skill'), el('div.sc-desc', null, String(skillId))));
      return card;
    }
    const icon = el('div.sc-icon', null, el('span.sc-emoji', null, info.icon));
    if (info.maxLevel > 1) icon.appendChild(el('span.sc-lvl', null, U.roman(info.level)));
    card.appendChild(icon);
    const main = el('div.sc-main');
    const name = el('div.sc-name', null, info.name);
    main.appendChild(name);
    const meta = el('div.sc-meta', { html: costPills(info, { cdLeft: opts.cdLeft, compact: opts.compact }) + (opts.compact ? '' : '<span class="sc-range">' + esc(info.range + (info.area ? ' · ' + info.area : '')) + '</span>') });
    main.appendChild(meta);
    if (!opts.compact) main.appendChild(el('div.sc-desc', null, info.desc));
    card.appendChild(main);
    if (opts.badge) card.appendChild(el('div.sc-badge', null, opts.badge));
    if (opts.hotkey) card.appendChild(el('span.kbd.sc-key', null, keyLabel(opts.hotkey)));
    if (opts.disabled) card.classList.add('is-disabled');
    if (opts.tooltip !== false) {
      UI.tooltip(card, function () { return UI.skillTooltipHtml(info.id, info.level, opts.unit, { showNext: opts.showNext !== false, role: opts.role, cdLeft: opts.cdLeft }); }, { pos: opts.tipPos || 'top' });
    }
    if (typeof opts.onClick === 'function') {
      card.setAttribute('role', 'button');
      card.addEventListener('click', function (e) {
        if (card.classList.contains('is-disabled')) { UI.sound('error'); return; }
        UI.sound('click');
        DD.safe('skillCard click', opts.onClick, card, [e, info]);
      });
      if (opts.hotkey) UI.bindHotkey(card, opts.hotkey);
    }
    return card;
  };

  // ---- items, consumables, statuses, scars ------------------------------------------------------------------------------------
  const STAT_LABEL = {
    hp: function (v) { return UI.signed(v) + ' max HP'; },
    ap: function (v) { return UI.signed(v) + ' AP'; },
    mov: function (v) { return UI.signed(v) + ' Move'; },
    armor: function (v) { return UI.signed(v) + ' Armor'; },
    dmg: function (v) { return UI.pct(v) + ' damage'; },
    heal: function (v) { return UI.pct(v) + ' healing'; },
    range: function (v) { return UI.signed(v) + ' range (skills with range 2+)'; },
    block: function (v) { return UI.signed(v) + ' Block at combat start'; },
    hype: function (v) { return UI.signed(v) + ' Hype at combat start'; },
  };
  const STAT_ORDER = ['hp', 'ap', 'mov', 'armor', 'dmg', 'heal', 'range', 'block', 'hype'];

  UI.statLines = function (stats) {
    const out = [];
    if (!stats) return out;
    STAT_ORDER.forEach(function (k) {
      const v = num(stats[k]);
      if (v) out.push({ text: STAT_LABEL[k](v), good: v > 0 });
    });
    return out;
  };
  function statListHtml(stats) {
    const lines = UI.statLines(stats);
    if (!lines.length) return '';
    return '<ul class="tt-stats">' + lines.map(function (l) { return '<li class="' + (l.good ? 'good' : 'bad') + '">' + esc(l.text) + '</li>'; }).join('') + '</ul>';
  }

  UI.rarityName = function (r) { return (UI.RARITY[r] && UI.RARITY[r].name) || U.capitalize(r || 'common'); };

  /** Item tooltip. opts: { price, equippedBy } */
  UI.itemTooltipHtml = function (itemId, opts) {
    opts = opts || {};
    const d = typeof itemId === 'object' && itemId ? itemId : DD.getItem(itemId);
    if (!d) return '<div class="tt"><div class="tt-desc">Unknown item.</div></div>';
    const slot = UI.SLOTS[d.slot] ? UI.SLOTS[d.slot].name : U.capitalize(d.slot || 'item');
    const heroOnly = d.hero ? ' · ' + esc(UI.heroName(d.hero)) + ' only' : '';
    let h = '<div class="tt tt-item rarity-' + esc(d.rarity || 'common') + '">';
    h += '<div class="tt-head"><span class="tt-icon">' + esc(d.icon || '❔') + '</span><div class="tt-titles"><div class="tt-title">' + esc(d.name) + '</div>';
    h += '<div class="tt-sub"><span class="rarity-text">' + esc(UI.rarityName(d.rarity)) + '</span> ' + esc(slot) + heroOnly + '</div></div></div>';
    h += statListHtml(d.stats);
    if (d.desc) h += '<div class="tt-desc">' + esc(d.desc) + '</div>';
    if (d.flavor) h += '<div class="tt-flavor">“' + esc(d.flavor) + '”</div>';
    if (opts.equippedBy) h += '<div class="tt-foot">Equipped by ' + esc(opts.equippedBy) + '</div>';
    if (opts.price !== undefined && opts.price !== null) h += '<div class="tt-foot">Price: ' + UI.goldHtml(opts.price) + '</div>';
    h += '</div>';
    return h;
  };

  /** itemCard(itemId, { onClick, price, compact, equipped, disabled, badge, cls, hotkey, tooltip = true, action }) */
  UI.itemCard = function (itemId, opts) {
    opts = opts || {};
    const d = DD.getItem(itemId);
    const rarity = d ? d.rarity || 'common' : 'common';
    const card = el('div.item-card', { class: ['rarity-' + rarity, opts.compact ? 'compact' : '', opts.equipped ? 'equipped' : '', opts.cls || '', opts.onClick ? 'clickable' : ''] });
    if (!d) {
      card.appendChild(el('div.ic-icon', null, '✖'));
      card.appendChild(el('div.ic-main', null, el('div.ic-name', null, 'Unknown item'), el('div.ic-sub', null, String(itemId))));
      return card;
    }
    card.appendChild(el('div.ic-icon', null, d.icon || '❔'));
    const main = el('div.ic-main');
    main.appendChild(el('div.ic-name', null, d.name));
    const slot = UI.SLOTS[d.slot] ? UI.SLOTS[d.slot].name : U.capitalize(d.slot || '');
    main.appendChild(el('div.ic-sub', null, el('span.rarity-text', null, UI.rarityName(rarity)), ' ' + slot + (d.hero ? ' · ' + UI.heroName(d.hero) : '')));
    if (!opts.compact) {
      const lines = UI.statLines(d.stats);
      if (lines.length) main.appendChild(el('div.ic-stats', null, lines.map(function (l) { return el('span.' + (l.good ? 'good' : 'bad'), null, l.text); })));
      if (d.desc) main.appendChild(el('div.ic-desc', null, d.desc));
    }
    card.appendChild(main);
    if (opts.price !== undefined && opts.price !== null) card.appendChild(el('div.ic-price', null, UI.goldText(opts.price)));
    if (opts.badge) card.appendChild(el('div.ic-badge', null, opts.badge));
    if (opts.action) card.appendChild(el('div.ic-action', null, opts.action));
    if (opts.disabled) card.classList.add('is-disabled');
    if (opts.tooltip !== false) UI.tooltip(card, function () { return UI.itemTooltipHtml(itemId, { price: opts.tipPrice }); }, { pos: opts.tipPos || 'top' });
    if (typeof opts.onClick === 'function') {
      card.setAttribute('role', 'button');
      card.addEventListener('click', function (e) {
        if (card.classList.contains('is-disabled')) { UI.sound('error'); return; }
        UI.sound('click');
        DD.safe('itemCard click', opts.onClick, card, [e, d]);
      });
      if (opts.hotkey) UI.bindHotkey(card, opts.hotkey);
    }
    return card;
  };

  /**
   * v2 (user requests): what else a hero's skill / consumable can be aimed at (DD.Targeting.aimsAtObjects /
   * revivesWith) — an explosive object (it goes off; the skill's own effects don't happen) or a downed ally (it gets back
   * up with the healed HP). `unit`: the hero using it (its basic attack counts), or nothing (a stand-in hero). → [lines]
   */
  UI.aimNotes = function (def, unit) {
    const T = DD.Targeting;
    if (!def || !T) return [];
    const user = unit && unit.kind ? unit : { kind: 'hero', side: 'hero', id: '_aimNotes' };
    const out = [];
    if (typeof T.aimsAtObjects === 'function' && DD.safe('Targeting.aimsAtObjects', T.aimsAtObjects, T, [user, def])) {
      out.push('💥 Can also be aimed at an explosive barrel (anything volatile) in range to set it off: the blast happens instead of its usual effect.');
    }
    if (typeof T.revivesWith === 'function' && DD.safe('Targeting.revivesWith', T.revivesWith, T, [user, def])) {
      out.push('🆘 Aimed at a downed ally, it gets that ally back up with the healed HP.');
    }
    return out;
  };

  function consumableTargetLabel(d) {
    const tg = d.target || {};
    if (tg.type === 'self') return 'Self';
    const fake = { target: tg, area: d.area };
    const r = rangeLabel(fake, {}, null, 1);
    const a = areaLabel(fake, {}, null);
    const f = FILTER_LABEL[tg.filter];
    return [r, a, f && r !== 'Self' ? 'Targets ' + f : ''].filter(Boolean).join(' · ');
  }

  UI.consumableTooltipHtml = function (id, opts) {
    opts = opts || {};
    const d = DD.getConsumable(id);
    if (!d) return '<div class="tt"><div class="tt-desc">Unknown consumable.</div></div>';
    let h = '<div class="tt tt-consumable rarity-' + esc(d.rarity || 'common') + '">';
    h += '<div class="tt-head"><span class="tt-icon">' + esc(d.icon || '🧪') + '</span><div class="tt-titles"><div class="tt-title">' + esc(d.name) + '</div>';
    h += '<div class="tt-sub"><span class="rarity-text">' + esc(UI.rarityName(d.rarity)) + '</span> Consumable</div></div></div>';
    h += '<div class="tt-costs"><span class="pill ap">' + num(d.ap, 1) + ' AP</span><span class="pill">Single use</span></div>';
    h += '<div class="tt-target">🎯 ' + esc(consumableTargetLabel(d)) + '</div>';
    UI.aimNotes(d, null).forEach(function (n) { h += '<div class="tt-target tt-aimnote">' + esc(n) + '</div>'; });
    if (d.desc) h += '<div class="tt-desc">' + esc(d.desc) + '</div>';
    if (d.flavor) h += '<div class="tt-flavor">“' + esc(d.flavor) + '”</div>';
    if (opts.price !== undefined && opts.price !== null) h += '<div class="tt-foot">Price: ' + UI.goldHtml(opts.price) + '</div>';
    h += '</div>';
    return h;
  };

  /** consumableCard(id, { onClick, price, compact, disabled, badge, cls, action }) */
  UI.consumableCard = function (id, opts) {
    opts = opts || {};
    const d = DD.getConsumable(id);
    const card = el('div.item-card.consumable-card', { class: ['rarity-' + ((d && d.rarity) || 'common'), opts.compact ? 'compact' : '', opts.cls || '', opts.onClick ? 'clickable' : ''] });
    if (!d) {
      card.appendChild(el('div.ic-icon', null, '✖'));
      card.appendChild(el('div.ic-main', null, el('div.ic-name', null, 'Unknown consumable')));
      return card;
    }
    card.appendChild(el('div.ic-icon', null, d.icon || '🧪'));
    const main = el('div.ic-main', null, el('div.ic-name', null, d.name), el('div.ic-sub', null, el('span.rarity-text', null, UI.rarityName(d.rarity)), ' Consumable · ' + num(d.ap, 1) + ' AP'));
    if (!opts.compact && d.desc) main.appendChild(el('div.ic-desc', null, d.desc));
    card.appendChild(main);
    if (opts.price !== undefined && opts.price !== null) card.appendChild(el('div.ic-price', null, UI.goldText(opts.price)));
    if (opts.badge) card.appendChild(el('div.ic-badge', null, opts.badge));
    if (opts.action) card.appendChild(el('div.ic-action', null, opts.action));
    if (opts.disabled) card.classList.add('is-disabled');
    if (opts.tooltip !== false) UI.tooltip(card, function () { return UI.consumableTooltipHtml(id); }, { pos: opts.tipPos || 'top' });
    if (typeof opts.onClick === 'function') {
      card.setAttribute('role', 'button');
      card.addEventListener('click', function (e) {
        if (card.classList.contains('is-disabled')) { UI.sound('error'); return; }
        UI.sound('click');
        DD.safe('consumableCard click', opts.onClick, card, [e, d]);
      });
    }
    return card;
  };

  /** Status instance tooltip: { id, stacks, turns } (or a status id). */
  UI.statusTooltipHtml = function (st) {
    if (typeof st === 'string') st = { id: st, stacks: 1, turns: -1 };
    const d = st && DD.getStatus(st.id);
    if (!d) return '<div class="tt"><div class="tt-desc">Unknown status.</div></div>';
    const stacks = num(st.stacks, 1);
    let desc = '';
    if (typeof d.desc === 'function') desc = DD.safe('status desc ' + d.id, d.desc, d, [st]) || '';
    else desc = d.desc || '';
    const turns = num(st.turns, -1);
    const dur = turns > 0 ? U.plural(turns, 'turn') + ' left' : turns === 0 ? 'Ends this turn' : 'Until removed';
    let h = '<div class="tt tt-status ' + (d.type === 'buff' ? 'buff' : 'debuff') + '">';
    h += '<div class="tt-head"><span class="tt-icon" style="color:' + esc(d.color || '#ccc') + '">' + esc(d.icon || '?') + '</span><div class="tt-titles"><div class="tt-title">' + esc(d.name) + (stacks > 1 ? ' <span class="tt-stacks">×' + stacks + '</span>' : '') + '</div>';
    h += '<div class="tt-sub">' + (d.type === 'buff' ? 'Buff' : 'Debuff') + ' · ' + esc(dur) + '</div></div></div>';
    if (desc) h += '<div class="tt-desc">' + esc(desc) + '</div>';
    h += '</div>';
    return h;
  };

  /** Small status chip with tooltip (HUD / party views). */
  UI.statusChip = function (st) {
    if (typeof st === 'string') st = { id: st, stacks: 1, turns: -1 };
    const d = DD.getStatus(st.id);
    const chip = el('span.status-chip', { class: d ? (d.type === 'buff' ? 'buff' : 'debuff') : '', style: d && d.color ? { '--sc': d.color } : null });
    chip.appendChild(el('span.st-icon', null, d ? d.icon || '?' : '?'));
    if (num(st.stacks, 1) > 1) chip.appendChild(el('span.st-stacks', null, String(st.stacks)));
    UI.tooltip(chip, function () { return UI.statusTooltipHtml(st); });
    return chip;
  };

  UI.scarTooltipHtml = function (scarId) {
    const d = DD.getScar(scarId);
    if (!d) return '<div class="tt"><div class="tt-desc">Unknown scar.</div></div>';
    let h = '<div class="tt tt-scar"><div class="tt-head"><span class="tt-icon">' + esc(d.icon || '🩹') + '</span><div class="tt-titles"><div class="tt-title">' + esc(d.name) + '</div><div class="tt-sub">Scar · permanent until treated</div></div></div>';
    h += statListHtml(d.stats);
    if (d.desc) h += '<div class="tt-desc">' + esc(d.desc) + '</div>';
    if (d.flavor) h += '<div class="tt-flavor">“' + esc(d.flavor) + '”</div>';
    h += '<div class="tt-foot">Remove at a shop (service) or by resting at a tavern.</div></div>';
    return h;
  };

  UI.scarChip = function (scarId, opts) {
    opts = opts || {};
    const d = DD.getScar(scarId);
    const chip = el('span.scar-chip', null, el('span.st-icon', null, (d && d.icon) || '🩹'), opts.compact ? null : el('span.scar-name', null, d ? d.name : scarId));
    UI.tooltip(chip, function () { return UI.scarTooltipHtml(scarId); });
    return chip;
  };

  // ---- random passives: the Table of Questionable Blessings (views) -------------------------------------------------------------
  const PASSIVE_RARITY_FALLBACK = {
    cursed: { name: 'Cursed', color: '#c06cff', rank: 0 }, common: { name: 'Common', color: '#cfc6b4', rank: 1 },
    uncommon: { name: 'Uncommon', color: '#6fd27a', rank: 2 }, rare: { name: 'Rare', color: '#5aa9ff', rank: 3 },
    legendary: { name: 'Legendary', color: '#ffb52e', rank: 4 },
  };
  UI.PASSIVE_RARITY = PASSIVE_RARITY_FALLBACK;
  UI.MAX_PASSIVES = 4;

  /** Display info for a Blessing entry ('id' | { id, level }) — DD.Passives.describe with a safe fallback. */
  UI.passiveInfo = function (p) {
    if (DD.Passives && typeof DD.Passives.describe === 'function') {
      const d = DD.safe('Passives.describe', DD.Passives.describe, DD.Passives, [p]);
      if (d) return d;
    }
    const id = typeof p === 'string' ? p : p && p.id;
    return { id: id, def: null, known: false, name: String(id || 'Unknown Blessing'), icon: '❔', rarity: 'common', rarityName: 'Unknown',
      color: PASSIVE_RARITY_FALLBACK.common.color, rank: 1, level: 1, maxLevel: 1, desc: '', next: '', prev: '', flavor: '', stats: null, tags: [] };
  };

  function passiveLevelBadge(info) {
    if (info.maxLevel <= 1) return '';
    let pips = '';
    for (let i = 1; i <= info.maxLevel; i++) pips += '<span class="pip' + (i <= info.level ? ' on' : '') + '"></span>';
    return '<span class="lvl-badge">' + U.roman(info.level) + '<span class="pips">' + pips + '</span></span>';
  }
  function passiveLevelEl(info) {
    if (info.maxLevel <= 1) return null;
    return el('span.lvl-badge', null, U.roman(info.level), UI.pips(info.level, info.maxLevel));
  }

  /** Blessing tooltip. opts: { showNext = true, title } */
  UI.passiveTooltipHtml = function (p, opts) {
    opts = opts || {};
    const info = UI.passiveInfo(p);
    let h = '<div class="tt tt-passive rarity-' + esc(info.rarity) + '" style="--rc:' + esc(info.color) + '">';
    h += '<div class="tt-head"><span class="tt-icon">' + esc(info.icon) + '</span><div class="tt-titles"><div class="tt-title">' + esc(info.name) + ' ' + passiveLevelBadge(info) + '</div>';
    h += '<div class="tt-sub"><span class="rarity-text">' + esc(info.rarityName) + '</span> Blessing' + (info.maxLevel > 1 && info.level >= info.maxLevel ? ' · Max level' : '') + '</div></div></div>';
    h += '<div class="tt-desc">' + esc(info.desc || 'No description. Suspicious.') + '</div>';
    if (opts.showNext !== false && info.next) h += '<div class="tt-next"><span>Level ' + U.roman(info.level + 1) + ':</span> ' + esc(info.next) + '</div>';
    if (info.flavor) h += '<div class="tt-flavor">“' + esc(info.flavor) + '”</div>';
    if (opts.foot) h += '<div class="tt-foot">' + esc(opts.foot) + '</div>';
    h += '</div>';
    return h;
  };

  /** A soft hyphen (U+00AD) in each 12+ letter word, before the consonant-vowel pair nearest its middle: a narrow
   *  slot breaks "Overcaf-feinated" instead of "Overcaffeinate-d" (the hyphen only shows where the line breaks;
   *  headless Chrome has no hyphenation dictionary for `hyphens: auto`). */
  function softHyphens(text) {
    const V = /[aeiouy]/i;
    return String(text).replace(/[A-Za-z]{12,}/g, function (w) {
      let best = -1;
      for (let i = 3; i <= w.length - 4; i++) {
        if (!V.test(w[i]) && V.test(w[i + 1]) && (best < 0 || Math.abs(i - w.length / 2) < Math.abs(best - w.length / 2))) best = i;
      }
      return best < 0 ? w : w.slice(0, best) + '­' + w.slice(best);
    });
  }

  /** passiveCard(entry, { compact, badge, onClick, hotkey, cls, tipPos, tooltip = true, showNext }) — a Blessing card. */
  UI.passiveCard = function (p, opts) {
    opts = opts || {};
    const info = UI.passiveInfo(p);
    const card = el('div.passive-card', { class: ['rarity-' + info.rarity, opts.compact ? 'compact' : '', opts.cls || '', opts.onClick ? 'clickable' : ''], style: { '--rc': info.color } });
    const icon = el('div.pc-icon', null, el('span.pc-emoji', null, info.icon));
    if (info.maxLevel > 1) icon.appendChild(el('span.pc-lvl', null, U.roman(info.level)));
    card.appendChild(icon);
    // long names ("Haunted by a Ghost Accountant") get a smaller font and a third line in compact slots
    const main = el('div.pc-main', null,
      el('div.pc-name', { class: String(info.name).length > 16 ? 'long' : null }, softHyphens(info.name)),
      el('div.pc-sub', null, el('span.rarity-text', null, info.rarityName),
        opts.compact ? (info.maxLevel > 1 ? UI.pips(info.level, info.maxLevel) : null) : passiveLevelEl(info)));
    if (!opts.compact) main.appendChild(el('div.pc-desc', null, info.desc));
    card.appendChild(main);
    if (opts.badge) card.appendChild(el('div.pc-badge', null, opts.badge));
    if (opts.hotkey) card.appendChild(el('span.kbd.pc-key', null, keyLabel(opts.hotkey)));
    if (opts.tooltip !== false) UI.tooltip(card, function () { return UI.passiveTooltipHtml(p, { showNext: opts.showNext }); }, { pos: opts.tipPos || 'top' });
    if (typeof opts.onClick === 'function') {
      card.setAttribute('role', 'button');
      card.addEventListener('click', function (e) {
        if (card.classList.contains('is-disabled')) { UI.sound('error'); return; }
        UI.sound('click');
        DD.safe('passiveCard click', opts.onClick, card, [e, info]);
      });
      if (opts.hotkey) UI.bindHotkey(card, opts.hotkey);
    }
    return card;
  };

  /** Small Blessing chip (icon + name + level) with the full tooltip. opts: { compact (icon only), tipPos, role (a
   *  fight-only instance, e.g. Method Actor's role: dashed, 🎭-marked, not one of the 4 slots) } */
  UI.passiveChip = function (p, opts) {
    opts = opts || {};
    const info = UI.passiveInfo(p);
    const chip = el('span.passive-chip', { class: ['rarity-' + info.rarity, opts.role ? 'role' : ''], style: { '--rc': info.color } },
      el('span.pch-icon', null, info.icon),
      opts.compact ? null : el('span.pch-name', null, info.name),
      info.maxLevel > 1 ? el('span.pch-lvl', null, U.roman(info.level)) : null,
      opts.role ? el('span.pch-role', { title: 'This fight only' }, '🎭') : null);
    const foot = opts.role ? 'Method Actor\'s role: this fight only (not one of the 4 Blessing slots).' : null;
    UI.tooltip(chip, function () { return UI.passiveTooltipHtml(p, { foot: foot }); }, { pos: opts.tipPos || 'top' });
    return chip;
  };

  /** One-line text for a hero's Blessings, e.g. "🧦 Lucky Socks II · 🦆 Emotional Support Duck" ('' when none). */
  UI.passiveListText = function (list) {
    return (list || []).map(function (p) {
      const info = UI.passiveInfo(p);
      return info.icon + ' ' + info.name + (info.maxLevel > 1 ? ' ' + U.roman(info.level) : '');
    }).join(' · ');
  };

  /** A RunHero's 4 Blessing slots: filled cards + dashed empty slots. opts: { compact, onPick(slot, entry), badge,
   *  hotkeys, tipPos, emptyText, cls } */
  UI.passiveSlots = function (rh, opts) {
    opts = opts || {};
    const list = (rh && rh.passives) || [];
    const grid = el('div.bless-slots', { class: [opts.compact ? 'compact' : '', opts.cls || ''] });
    for (let i = 0; i < UI.MAX_PASSIVES; i++) {
      const p = list[i];
      if (p) {
        grid.appendChild(UI.passiveCard(p, {
          compact: true, cls: 'bless-slot', badge: opts.badge, tipPos: opts.tipPos || 'right',
          hotkey: opts.hotkeys ? String(i + 1) : null,
          onClick: typeof opts.onPick === 'function' ? function () { opts.onPick(i, p); } : null,
        }));
      } else {
        grid.appendChild(el('div.bless-slot.empty', null, el('span.bs-n', null, String(i + 1)), el('span.bs-text', null, opts.emptyText || 'Empty slot')));
      }
    }
    return grid;
  };

  // ---- heroes & enemies ----------------------------------------------------------------------------------------------------------
  UI.heroTooltipHtml = function (heroId, opts) {
    opts = opts || {};
    const d = DD.getHero(heroId);
    if (!d) return '';
    const st = d.stats || {};
    let h = '<div class="tt tt-hero" style="--hc:' + esc(d.color || '#ccc') + '">';
    h += '<div class="tt-head"><div class="tt-titles"><div class="tt-title">' + esc(d.name) + (d.epithet ? ' <span class="tt-epithet">' + esc(d.epithet) + '</span>' : '') + '</div>';
    h += '<div class="tt-sub">' + esc([d.race, d.cls].filter(Boolean).join(' ')) + (d.role ? ' · ' + esc(d.role) : '') + '</div></div></div>';
    h += '<div class="tt-costs"><span class="pill">❤ ' + num(st.hp) + ' HP</span><span class="pill ap">' + num(st.ap, 3) + ' AP</span><span class="pill">👣 ' + num(st.mov) + ' Move</span>' + (num(st.armor) ? '<span class="pill">🛡 ' + num(st.armor) + ' Armor</span>' : '') +
      '<span class="pill" title="Initiative modifier: added to the d20 when a fight starts">🎲 Init ' + initText(st.init) + '</span></div>';
    if (d.flags && d.flags.flying) h += '<div class="tt-target">' + esc(UI.flyLine(d.name)) + '</div>';
    if (d.passive) h += '<div class="tt-desc"><b>' + esc(d.passive.name || 'Passive') + ':</b> ' + esc(d.passive.desc || '') + '</div>';
    if (opts.locked) h += '<div class="tt-foot">🔒 ' + esc(UI.unlockHint(d)) + '</div>';
    h += '</div>';
    return h;
  };

  /** v2 initiative modifier as shown on cards: "+2", "−1", "+0". */
  function initText(v) { const n = Math.round(num(v)); return (n < 0 ? '−' : '+') + Math.abs(n); }
  UI.initText = initText;

  /** v2 (user request): what flying means, wherever a flyer is described outside a fight. */
  UI.flyLine = function (who) { return '🪽 Flying: ignores floor effects — lava, fire, puddles, traps and pressure plates. Clouds and gases still reach ' + (who || 'it') + '.'; };
  const TIER_LABEL = { minion: 'Minion', normal: 'Enemy', elite: 'Elite', boss: 'Boss' };
  UI.enemyTooltipHtml = function (enemyId) {
    const d = DD.getEnemy(enemyId) || DD.getSummon(enemyId);
    if (!d) return '';
    // v2: the initiative modifier (def.init, else the tier default the engine uses)
    const tierInit = DD.Combat && DD.Combat.TIER_INIT ? num(DD.Combat.TIER_INIT[d.tier]) : 0;
    const init = typeof d.init === 'number' ? d.init : tierInit;
    let h = '<div class="tt tt-enemy tier-' + esc(d.tier || 'normal') + '">';
    h += '<div class="tt-head"><div class="tt-titles"><div class="tt-title">' + esc(d.name) + '</div>';
    h += '<div class="tt-sub">' + esc((d.boss && d.boss.title) || TIER_LABEL[d.tier] || 'Creature') + (d.act ? ' · Act ' + U.roman(d.act) : '') + '</div></div></div>';
    h += '<div class="tt-costs"><span class="pill">❤ ' + num(d.hp) + ' HP</span><span class="pill">👣 ' + num(d.mov, 3) + ' Move</span>' + (num(d.armor) ? '<span class="pill">🛡 ' + num(d.armor) + '</span>' : '') +
      (DD.getEnemy(enemyId) ? '<span class="pill" title="Initiative modifier">🎲 Init ' + initText(init) + '</span>' : '') + '</div>';
    const res = d.resist || {};
    const rl = Object.keys(res).map(function (k) { const v = num(res[k], 1); return v === 0 ? 'Immune to ' + k : v < 1 ? 'Resists ' + k : v > 1 ? 'Weak to ' + k : ''; }).filter(Boolean);
    if (rl.length) h += '<div class="tt-target">' + esc(rl.join(' · ')) + '</div>';
    if (d.flags && d.flags.flying) h += '<div class="tt-target">' + esc(UI.flyLine()) + '</div>';
    const sk = (d.skills || []).map(function (id) { const s = DD.getSkill(id); return s ? (s.icon || '') + ' ' + s.name : null; }).filter(Boolean);
    if (sk.length) h += '<div class="tt-target">Moves: ' + esc(sk.join(', ')) + '</div>';
    if (d.desc) h += '<div class="tt-flavor">' + esc(d.desc) + '</div>';
    h += '</div>';
    return h;
  };

  /**
   * portrait(heroOrSpecOrDefId, size = 64, { dead, locked, cls, frame = true, fallback: emoji, spriteOpts }) → element.
   * Draws the DD.Sprites portrait (transparent background) as an <img> from its cached data URL, or a copy of the
   * cached canvas; falls back to the emoji / initial when sprites are unavailable.
   */
  UI.portrait = function (x, size, opts) {
    opts = opts || {};
    size = size || 64;
    let spec = null, id = null, def = null;
    if (typeof x === 'string') { id = x; def = UI.anyDef(x); }
    else if (x && typeof x === 'object') {
      if (x.base && !x.id) spec = x;
      else { id = x.defId || x.id; def = UI.anyDef(id) || (x.sprite ? x : null); if (!UI.anyDef(id) && x.sprite) spec = x.sprite; }
    }
    const color = (def && def.color) || '#8a6a2a';
    const wrap = el('div.portrait', { class: [opts.dead ? 'dead' : '', opts.locked ? 'locked' : '', opts.frame === false ? 'noframe' : '', opts.cls || ''], style: { width: size + 'px', height: size + 'px', '--pc': color } });
    let media = null;
    if (DD.Sprites && (spec || id)) {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const px = Math.max(16, Math.min(320, Math.round(size * dpr)));
      // Transparent background: the frame (CSS) supplies it, and locked silhouettes stay character-shaped.
      const sOpts = Object.assign({ bg: false }, opts.spriteOpts || {});
      // Prefer the cached data URL (an <img> is cheap to re-create on every re-render); else copy the canvas.
      if (typeof DD.Sprites.portraitURL === 'function') {
        const url = DD.safe('Sprites.portraitURL', DD.Sprites.portraitURL, DD.Sprites, [spec || id, px, sOpts]);
        if (url) media = el('img.portrait-canvas', { src: url, alt: '', draggable: 'false' });
      }
      if (!media && typeof DD.Sprites.portrait === 'function') {
        const src = DD.safe('Sprites.portrait', DD.Sprites.portrait, DD.Sprites, [spec || id, px, sOpts]);
        if (src && typeof src.getContext === 'function' && src.width) {
          media = document.createElement('canvas');
          media.width = src.width;
          media.height = src.height;
          const g = media.getContext('2d');
          if (g) g.drawImage(src, 0, 0);
          media.className = 'portrait-canvas';
        }
      }
    }
    if (media) wrap.appendChild(media);
    else if (opts.fallback) {
      wrap.appendChild(el('div.portrait-fallback.emoji', { style: { fontSize: Math.round(size * 0.6) + 'px' } }, opts.fallback));
    } else {
      const name = (def && def.name) || id || '?';
      wrap.appendChild(el('div.portrait-fallback', { style: { fontSize: Math.round(size * 0.46) + 'px' } }, String(name).charAt(0).toUpperCase()));
    }
    if (opts.locked) wrap.appendChild(el('div.portrait-lock', { style: { fontSize: Math.round(size * 0.34) + 'px' } }, '🔒'));
    return wrap;
  };

  // ---- shared run views -----------------------------------------------------------------------------------------------------------
  /** Compact hero row: portrait, name, level, HP bar, scars. opts.levelHint: a 🎲 next to the level when the hero
   *  is in the running for the next level-up (v2 rotation). */
  UI.heroMini = function (rh, idx, opts) {
    opts = opts || {};
    const d = UI.heroDef(rh);
    const stats = UI.heroStats(rh);
    const next = !rh.dead && typeof idx === 'number' && UI.levelMark(idx);
    const row = el('div.hero-mini',{ class: [rh.dead ? 'dead' : '', next && opts.levelHint ? 'next-level' : '', opts.cls || ''], style: { '--hc': (d && d.color) || '#c9a24f' } });
    row.appendChild(UI.portrait(rh.id, opts.size || 44, { dead: rh.dead }));
    const info = el('div.hm-info');
    info.appendChild(el('div.hm-name', null, el('span', null, UI.heroName(rh)),
      el('span.hm-lvl', null, 'Lv ' + num(rh.level, 1), next && opts.levelHint ? el('span.hm-next', { title: 'In the running for the next level-up' }, ' 🎲') : null)));
    info.appendChild(UI.hpBar(rh.hp, stats.maxHp, { small: true, dead: rh.dead, deadText: 'Written out' }));
    row.appendChild(info);
    const marks = el('div.hm-marks');
    const downs = num(rh.downs);
    if (downs) marks.appendChild(el('span.hm-downs', { title: downs + ' of 3 downs used this run — the third is permanent' }, '💀' + downs + '/3'));
    (rh.scars || []).forEach(function (s) { marks.appendChild(UI.scarChip(s, { compact: true })); });
    if (marks.children.length) row.appendChild(marks);
    if (opts.tooltip !== false) {
      UI.tooltip(row, function () {
        const s = UI.heroStats(rh);
        let h = '<div class="tt"><div class="tt-head"><div class="tt-titles"><div class="tt-title">' + esc(UI.heroName(rh)) + ' <span class="lvl-badge">Lv ' + num(rh.level, 1) + '</span></div><div class="tt-sub">' + esc(d ? [d.race, d.cls].filter(Boolean).join(' ') : '') + '</div></div></div>';
        h += '<div class="tt-costs"><span class="pill">❤ ' + Math.round(num(rh.hp)) + '/' + s.maxHp + '</span><span class="pill ap">' + s.ap + ' AP</span><span class="pill">👣 ' + s.mov + '</span>' + (s.armor ? '<span class="pill">🛡 ' + s.armor + '</span>' : '') + '</div>';
        if (!rh.dead) h += '<div class="tt-target">' + esc(levelLine(rh, idx)) + '</div>';
        if (rh.dead) h += '<div class="tt-foot">Written out of the campaign. Recruit a replacement at a tavern.</div>';
        h += '</div>';
        return h;
      }, { pos: opts.tipPos || 'right' });
    }
    return row;
  };

  /** Top status bar for in-run screens: act, party minis, consumables, gold, optional extra buttons. */
  UI.runBar = function (opts) {
    opts = opts || {};
    const run = UI.run();
    const bar = el('div.run-bar.panel.slim');
    if (!run) return bar;
    const act = UI.ACTS[run.act] || { roman: U.roman(run.act || 1), name: '' };
    bar.appendChild(el('div.rb-act', { title: act.name }, el('span.rb-act-label', null, 'Act'), el('span.rb-act-num', null, act.roman)));
    const party = el('div.rb-party');
    (run.party || []).forEach(function (rh, i) {
      const d = UI.heroDef(rh);
      const st = UI.heroStats(rh);
      const next = !rh.dead && UI.levelMark(i);
      const m = el('div.rb-hero',{ class: [rh.dead ? 'dead' : '', next ? 'next-level' : ''], style: { '--hc': (d && d.color) || '#c9a24f' } }, UI.portrait(rh.id, 34, { dead: rh.dead }),
        UI.hpBar(rh.hp, st.maxHp, { small: true, text: false, dead: rh.dead }), next ? el('span.rb-next', null, '🎲') : null);
      UI.tooltip(m, function () {
        return '<div class="tt"><div class="tt-title">' + esc(UI.heroName(rh)) + ' · Lv ' + num(rh.level, 1) + '</div><div class="tt-desc">' + (rh.dead ? 'Written out of the campaign.' : 'HP ' + Math.round(num(rh.hp)) + ' / ' + st.maxHp) + '</div>' +
          (rh.dead ? '' : '<div class="tt-target">' + esc(levelLine(rh, i)) + '</div>') + '</div>';
      }, { pos: 'bottom' });
      party.appendChild(m);
    });
    bar.appendChild(party);
    bar.appendChild(UI.consumableSlots({ small: true }));
    bar.appendChild(el('div.rb-gold', { title: 'Party gold' }, UI.goldText(run.gold, { big: true })));
    if (opts.buttons) { const bx = el('div.rb-buttons'); append(bx, opts.buttons); bar.appendChild(bx); }
    return bar;
  };

  /** Consumable slots of the run inventory (filled + empty). opts: { small, onClick(index, id) } */
  UI.consumableSlots = function (opts) {
    opts = opts || {};
    const run = UI.run();
    const wrap = el('div.cons-slots' + (opts.small ? '.small' : ''));
    if (!run) return wrap;
    const list = run.consumables || [];
    const max = Math.max(num(run.maxConsumables, 3), list.length);
    for (let i = 0; i < max; i++) {
      const id = list[i];
      const d = id ? DD.getConsumable(id) : null;
      const slot = el('div.cons-slot' + (d ? '.full' : '.empty'), null, d ? d.icon || '🧪' : '');
      if (d) UI.tooltip(slot, function () { return UI.consumableTooltipHtml(id); }, { pos: opts.tipPos || 'bottom' });
      else UI.tooltip(slot, '<div class="tt"><div class="tt-desc">Empty consumable slot.</div></div>', { pos: opts.tipPos || 'bottom' });
      if (d && typeof opts.onClick === 'function') {
        slot.classList.add('clickable');
        slot.addEventListener('click', function () { DD.safe('consumable slot click', opts.onClick, null, [i, id]); });
      }
      wrap.appendChild(slot);
    }
    return wrap;
  };

  /** Standard screen header: big title, subtitle, right-side children. */
  UI.header = function (title, sub, right) {
    const h = el('header.screen-header');
    const t = el('div.sh-titles', null, el('h1.sh-title', null, title));
    if (sub) t.appendChild(el('div.sh-sub', null, sub));
    h.appendChild(t);
    if (right) h.appendChild(el('div.sh-right', null, right));
    return h;
  };

  /** DM narration line (italic, with a little d20 badge). */
  UI.narration = function (text, opts) {
    opts = opts || {};
    if (!text) return null;
    return el('div.narration' + (opts.cls ? '.' + opts.cls : ''), null, el('span.dm-badge', { title: 'The Dungeon Master' }, 'DM'), el('span.narr-text', null, text));
  };

  /**
   * Pick which socketed skill to forget for a new one. cb(replaceIdx): -1 = free slot (nothing forgotten),
   * 0..3 = replace that slot, null = skipped / cancelled. opts: { title, skipLabel, intro, level }
   */
  UI.chooseSkillSlot = function (heroIdx, newSkillId, opts, cb) {
    opts = opts || {};
    const run = UI.run();
    const rh = run && run.party ? run.party[heroIdx] : null;
    const skills = (rh && rh.skills) || [];
    const done = function (v) { if (typeof cb === 'function') DD.safe('chooseSkillSlot callback', cb, null, [v]); };
    if (!rh || skills.length < 4) { done(-1); return null; }
    const name = UI.heroName(rh);
    const newDef = DD.getSkill(newSkillId);
    const body = el('div.replace-picker');
    body.appendChild(el('div.rp-intro', null, opts.intro || (name + ' can only socket 4 skills. Forget one to learn ' + (newDef ? newDef.name : 'the new skill') + '.')));
    const row = el('div.rp-new', null, el('div.rp-label', null, 'New skill'), UI.skillCard(newSkillId, opts.level || 1, { badge: 'NEW', showNext: true, unit: rh }));
    body.appendChild(row);
    body.appendChild(el('div.rp-label', null, 'Forget one:'));
    const grid = el('div.rp-grid');
    body.appendChild(grid);
    const forgetLine = (name === 'Professor Marbles' ? 'He forgets things. This one is on purpose.' : 'The forgotten skill is gone for good. (Professor Marbles does this daily.)');
    body.appendChild(el('div.rp-note', null, forgetLine));
    const m = UI.modal({
      title: opts.title || 'Make Room in That Skull', icon: '🧠', size: 'lg', closable: false, cls: 'modal-replace',
      body: body,
      buttons: [{ label: opts.skipLabel || 'Skip — keep my skills', cls: 'ghost', cancel: true, onClick: function () { done(null); } }],
    });
    skills.forEach(function (s, i) {
      const card = UI.skillCard(s.id, s.level, {
        badge: 'Forget', hotkey: String(i + 1), cls: 'forgettable', unit: rh,
        onClick: function () { m.close('pick'); done(i); },
      });
      grid.appendChild(card);
    });
    return m;
  };

  // ---- THE ROLL MOMENT: one roll on the Table of Questionable Blessings ------------------------------------------------------------
  const ROLL_MS = 1050;
  const ROLL_HEADS = {
    level: function (name, r) { return { title: name + ' reached Level ' + r.lv + '!', sub: 'First, a roll on the Table of Questionable Blessings. Then the boon.' }; },
    event: function (name) { return { title: name + ' rolls on the Table!', sub: 'The event said so. The DM is contractually obligated.' }; },
    shop: function (name) { return { title: name + '\'s Re-roll', sub: 'Gregor slides the dice across the counter. "No refunds. Ever."' }; },
    start: function (name) { return { title: name + '\'s Session Zero Quirk', sub: 'Everyone starts with one. Never cursed. Probably.' }; },
    debug: function (name) { return { title: name + ' Rolls (Debug)', sub: 'The DM fudges a roll. Nobody saw anything.' }; },
  };
  let dieSeq = 0;

  /** The d100 as a faceted d10-style gem (SVG) with the number on top. */
  function rollDie() {
    const gid = 'pr-grad-' + (++dieSeq);
    const svg = '<svg class="pr-die-svg" viewBox="0 0 120 130" aria-hidden="true"><defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" class="pr-g0"/><stop offset="1" class="pr-g1"/></linearGradient></defs>' +
      '<polygon class="pr-die-body" points="60,3 115,49 99,109 60,127 21,109 5,49" fill="url(#' + gid + ')"/>' +
      '<polygon class="pr-die-face" points="60,14 97,55 60,111 23,55"/>' +
      '<path class="pr-die-edge" d="M23,55 L5,49 M23,55 L21,109 M97,55 L115,49 M97,55 L99,109 M60,111 L60,127 M60,14 L60,3"/></svg>';
    const numEl = el('span.pr-die-num', null, '?');
    const die = el('div.pr-die', { html: svg });
    die.appendChild(numEl);
    die.appendChild(el('span.pr-die-label', null, 'd100'));
    return { el: die, num: numEl };
  }
  function pctText(p) { p = num(p); return (p >= 10 ? Math.round(p) : Math.round(p * 10) / 10) + '%'; }

  /**
   * THE ROLL MOMENT for hero heroIdx's current roll (DD.Run.currentRoll): the d100 tumbles (~1 s; click, Space or
   * Enter skips; instant when headless or DD.FX.instant), lands on a rarity-coloured result card (icon, name, level,
   * exact desc, flavor, the rolled number and its table slice, "UPGRADE!" for duplicates), then Keep / Upgrade /
   * Replace (pick one of the 4 slots) / Discard through DD.Run.resolveRoll. opts: { title, instant, animate (force the
   * tumble, tests), cls, onDone(result) }.
   * Returns the modal handle, or null (onDone(null) is called) when the hero has nothing to roll.
   */
  UI.passiveRoll = function (heroIdx, opts) {
    opts = opts || {};
    let finished = false;
    const done = function (res) {
      if (finished) return;
      finished = true;
      if (typeof opts.onDone === 'function') DD.safe('passiveRoll onDone', opts.onDone, null, [res || null]);
    };
    const R = DD.Run;
    const run = UI.run();
    const rh = run && run.party ? run.party[heroIdx] : null;
    const roll = rh && !rh.dead && R && typeof R.currentRoll === 'function' ? DD.safe('Run.currentRoll', R.currentRoll, R, [heroIdx]) : null;
    if (!roll) { done(null); return null; }
    const info = UI.passiveInfo({ id: roll.id, level: roll.level });
    const name = UI.heroName(rh);
    const hd = UI.heroDef(rh) || {};
    const head = (ROLL_HEADS[roll.src] || ROLL_HEADS.event)(name, roll);
    const instant = opts.animate ? false : !!(opts.instant || DD.headless || (DD.FX && DD.FX.instant));

    const die = rollDie();
    const subEl = el('div.pr-head-sub', null, 'The DM rolls behind the screen…');
    const headEl = el('div.pr-head', { style: { '--hc': hd.color || '#c9a24f' } }, UI.portrait(rh.id, 60),
      el('div.pr-head-text', null, el('div.pr-head-title', null, opts.title || head.title), subEl));
    const result = el('div.pr-result', null, el('div.pr-pending', null, el('span.pr-pending-dice', null, '🎲'), el('span', null, 'Consulting the Table of Questionable Blessings…')));
    const stage = el('div.pr-stage', null, el('div.pr-die-wrap', null, die.el), result);
    const quip = el('div.pr-quip');
    const slotsBox = el('div.pr-slots');
    const actions = el('div.pr-actions');
    const m = UI.modal({
      title: 'The Table of Questionable Blessings', icon: '🎲', size: 'lg', closable: false,
      cls: 'modal-roll rarity-' + info.rarity + (opts.cls ? ' ' + opts.cls : ''),
      body: el('div.pr-wrap', null, headEl, stage, quip, slotsBox),
    });
    m.el.appendChild(actions); // outside the scrolling body: the choices stay in view on short screens
    m.el.style.setProperty('--rc', info.color);
    let landed = false, timer = 0, ticks = 0, resolving = false;
    const t0 = Date.now();

    function finish(action, slot) {
      if (finished || resolving) return;
      resolving = true;
      const res = DD.safe('Run.resolveRoll', R.resolveRoll, R, [heroIdx, action, slot]);
      resolving = false;
      if (!res || !res.ok) {
        if (res && res.needsReplace) { showReplace(); return; }
        UI.toast((res && res.text) || 'The dice rolled off the table. Literally.', { icon: '🎲', cls: 'bad' });
        m.close('done');
        done(res);
        return;
      }
      UI.sound(res.action === 'discard' ? 'click' : 'levelup');
      UI.toast(res.text, { icon: res.action === 'discard' ? '🗑️' : info.icon, cls: res.action === 'discard' ? '' : 'good', ms: 3200 });
      m.close('done');
      done(res);
    }

    function renderSlots(replacing) {
      slotsBox.innerHTML = '';
      const list = rh.passives || [];
      const full = list.length >= UI.MAX_PASSIVES;
      slotsBox.classList.toggle('replacing', !!replacing);
      slotsBox.appendChild(el('div.pr-slots-h', null,
        el('span', null, replacing ? 'Pick a Blessing to lose (it is gone for good):' : name + '\'s Blessings'),
        el('span.pr-slots-n', null, list.length + ' / ' + UI.MAX_PASSIVES + (full ? ' — full' : ''))));
      slotsBox.appendChild(UI.passiveSlots(rh, replacing ? {
        badge: 'Replace', hotkeys: true, tipPos: 'top', emptyText: 'Empty slot',
        onPick: function (i) { finish('replace', i); },
      } : { tipPos: 'top', emptyText: 'Empty slot' }));
    }

    function renderChoices() {
      renderSlots(false);
      actions.innerHTML = '';
      m.cancelButton = null;
      const o = DD.Passives ? DD.Passives.options(rh, roll) : { keep: true, replace: false, upgrade: false, full: false };
      let primary = null;
      if (o.upgrade) primary = UI.button('Upgrade to ' + U.roman(roll.level) + '!', function () { finish('upgrade'); }, { cls: 'primary', icon: '⬆️', hotkey: 'k' });
      else if (o.keep) primary = UI.button('Keep it', function () { finish('keep'); }, { cls: 'primary', icon: '✋', hotkey: 'k' });
      const replace = !o.upgrade && o.replace ? UI.button(o.full ? 'Replace a Blessing…' : 'Replace one…', showReplace, {
        cls: primary ? '' : 'primary', icon: '🔁', hotkey: 'r',
        tooltip: '<div class="tt"><div class="tt-desc">' + (o.full ? 'All 4 slots are full. ' : '') + 'Swap one of ' + esc(name) + '\'s Blessings for this one. The old one is gone for good.</div></div>',
      }) : null;
      const discard = UI.button('Discard', function () { finish('discard'); }, {
        cls: 'ghost', icon: '🗑️', hotkey: 'd',
        tooltip: '<div class="tt"><div class="tt-desc">Pass on this roll. ' + esc(name) + ' keeps the Blessings they have.</div></div>',
      });
      [primary, replace, discard].forEach(function (b) { if (b) actions.appendChild(b); });
      m.defaultButton = primary || replace;
    }

    function showReplace() {
      renderSlots(true);
      actions.innerHTML = '';
      const back = UI.button('Back', renderChoices, { cls: 'ghost', icon: '←' });
      actions.appendChild(back);
      m.cancelButton = back;
      m.defaultButton = null;
      // on a short screen a long card can push the slots below the fold: they end the body, so scroll it down
      if (m.body && m.body.scrollHeight > m.body.clientHeight) m.body.scrollTop = m.body.scrollHeight;
    }

    function renderResult() {
      result.innerHTML = '';
      const card = el('div.pr-card', { class: ['rarity-' + info.rarity, roll.upgrade ? 'upgrade' : ''], style: { '--rc': info.color } });
      if (roll.upgrade) card.appendChild(el('div.pr-stamp', null, 'Upgrade!'));
      card.appendChild(el('div.pr-card-top', null,
        el('div.pr-icon', null, info.icon),
        el('div.pr-titles', null,
          el('div.pr-name', null, info.name),
          el('div.pr-meta', null, el('span.rarity-text', null, info.rarityName + ' Blessing'), passiveLevelEl(info)))));
      card.appendChild(el('div.pr-desc', null, info.desc || 'No description. The DM is making it up as he goes.'));
      if (roll.upgrade && info.prev) card.appendChild(el('div.pr-was', null, el('b', null, 'Was (' + U.roman(info.level - 1) + '): '), info.prev));
      if (info.flavor) card.appendChild(el('div.pr-flavor', null, '“' + info.flavor + '”'));
      card.appendChild(el('div.pr-rollinfo', null, '🎲 Rolled ', el('b', null, String(roll.d100)), ' on the d100 · table slice ' +
        (roll.from === roll.to ? roll.from : roll.from + '–' + roll.to) + ' (' + pctText(roll.pct) + ' chance)'));
      result.appendChild(card);
      quip.textContent = DD.Passives ? DD.Passives.quip(roll) : '';
    }

    function land() {
      if (landed || m.closed) return;
      landed = true;
      clearTimeout(timer);
      // the choices just appeared: the Enter / Space / click that skipped the roll (or a quick second one) must not
      // also keep a Blessing nobody has read yet
      noteShown();
      die.num.textContent = String(roll.d100);
      die.el.classList.remove('rolling');
      die.el.classList.add('landed');
      if (roll.d100 === 1) die.el.classList.add('nat1');
      if (roll.d100 === 100) die.el.classList.add('nat100');
      m.el.classList.add('landed');
      subEl.textContent = head.sub;
      renderResult();
      renderChoices();
      UI.sound(info.rarity === 'cursed' ? 'debuff' : info.rarity === 'legendary' || roll.d100 === 100 ? 'crit' : 'magic');
    }

    function tick() {
      if (landed || m.closed) return;
      const t = Date.now() - t0;
      if (t >= ROLL_MS) { land(); return; }
      die.num.textContent = String(DD.rng.int(1, 100)); // cosmetic only
      if (ticks++ % 3 === 0) UI.sound('click');
      timer = setTimeout(tick, 45 + t * 0.14);
    }

    renderSlots(false);
    if (instant) land();
    else {
      die.el.classList.add('rolling');
      stage.addEventListener('click', land);
      const skip = UI.button('Skip', land, { cls: 'small ghost', icon: '⏩', hotkey: ' ' });
      actions.appendChild(skip);
      m.defaultButton = skip;
      tick();
    }
    return m;
  };

  /** Resolve pending Blessing rolls one after another through the roll modal (each hero's front roll first).
   *  filter(pendingRoll) limits which ones (e.g. only event rolls); done() runs when none are left. */
  UI.resolveRolls = function (filter, done) {
    const finish = function () { if (typeof done === 'function') DD.safe('resolveRolls done', done); };
    if (!DD.Run || typeof DD.Run.pendingRolls !== 'function') { finish(); return; }
    let guard = 0;
    const step = function () {
      if (guard++ > 40) { finish(); return; }
      const list = DD.safe('Run.pendingRolls', DD.Run.pendingRolls, DD.Run) || [];
      const front = list.filter(function (r) { return r.index === 0 && (!filter || filter(r)); })[0];
      if (!front) { finish(); return; }
      UI.passiveRoll(front.heroIdx, { onDone: step });
    };
    step();
  };

  /** "1 hour ago" style relative time for history rows. */
  UI.ago = function (ts) {
    const t = num(ts);
    if (!t) return '';
    const s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 90) return 'just now';
    if (s < 3600) return Math.round(s / 60) + ' min ago';
    if (s < 86400) return Math.round(s / 3600) + ' h ago';
    return Math.round(s / 86400) + ' days ago';
  };
  UI.duration = function (ms) {
    const m = Math.max(0, Math.round(num(ms) / 60000));
    return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + (m % 60) + ' min';
  };
})();
