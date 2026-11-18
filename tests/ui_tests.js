/* Dungeons and Degenerates — tests/ui_tests.js
 * META-UI suites (prefix "ui:"): DD.UI framework (el, buttons + hotkeys, modals / choice / confirm, Esc, toasts,
 * edge-aware tooltips), shared cards and tooltips over ALL registered content, and every screen mounted / unmounted
 * headlessly — without a run, and with a run built from whatever heroes are registered (fixtures or real) — plus the
 * main interactive flows (map travel, rewards pick, level-up, event choice, shop buy, tavern, party equip).
 * V3 ("ui: V3 —"): act IV's screens (Svammiel's floor map and its fit, the Twist panel, the four-act end screens,
 * the Hall behind the spoiler gate, the cameo setting, the act-4 shop and tavern, the League's long name, the V3 debug
 * params).
 */
(function () {
  'use strict';
  const T = window.DD_TEST;
  const DD = window.DD;
  if (!T) return;

  const SCREENS = ['title', 'partySelect', 'map', 'rewards', 'levelup', 'event', 'shop', 'tavern', 'party', 'gameover', 'victory', 'settings', 'hall'];

  function tick(ms) { return new Promise(function (r) { setTimeout(r, ms || 0); }); }
  function key(k, target) {
    const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
    (target || document.body).dispatchEvent(e);
    return e;
  }
  function root() { return DD.UI.currentRoot(); }
  function q(sel) { const r = root(); return r ? r.querySelector(sel) : null; }
  function qa(sel) { const r = root(); return r ? Array.prototype.slice.call(r.querySelectorAll(sel)) : []; }
  function modalEl() { const m = DD.UI.topModal(); return m ? m.el : null; }
  function reset() {
    if (!DD.UI) return;
    DD.UI.closeAllModals('test');
    DD.UI.hideTooltip();
  }

  // ---- sandbox content (only when fewer than 4 heroes are registered) ---------------------------------------------
  const SWAP = ['heroes', 'skills', 'items', 'consumables', 'events', 'encounters'];

  function registerUiContent() {
    const heroes = [['ui_a', null, '#e25822'], ['ui_b', null, '#c86bff'], ['ui_c', null, '#9fb7c9'], ['ui_d', null, '#d9692b'], ['ui_e', { act: 1 }, '#5cbf5a']];
    heroes.forEach(function (h, n) {
      const id = h[0];
      const pool = [1, 2, 3, 4, 5, 6].map(function (k) { return id + '_s' + k; });
      pool.forEach(function (sid, i) {
        DD.registerSkill({
          id: sid, name: 'Skill ' + sid, owner: id, icon: '✦', kind: i % 2 ? 'spell' : 'attack', ap: 1 + (i % 2), cooldown: i % 3,
          levels: [{ dmg: 5 + i }, { dmg: 7 + i }, { dmg: 9 + i }], target: { type: 'unit', range: [1, 3], los: true, filter: 'enemy' },
          area: i === 2 ? { shape: 'circle', size: 1 } : { shape: 'single' },
          desc: function (L) { return 'Deal ' + L.dmg + ' damage.'; }, flavor: 'Test flavor.', execute: function () {},
        });
      });
      DD.registerSkill({ id: id + '_basic', name: 'Poke', owner: id, icon: '👉', levels: [{ dmg: 4 }], target: { type: 'unit', range: [1, 1], filter: 'enemy' }, desc: function (L) { return 'Deal ' + L.dmg + ' damage.'; }, execute: function () {} });
      DD.registerSkill({ id: id + '_sig', name: 'Big Finish', owner: id, icon: '🌟', hype: 100, levels: [{ dmg: 20 }], target: { type: 'self' }, desc: function (L) { return 'Deal ' + L.dmg + ' damage to everyone.'; }, execute: function () {} });
      DD.registerHero({
        id: id, name: 'UI Hero ' + String.fromCharCode(65 + n), epithet: 'the Testable', race: 'Human', cls: 'Tester', role: 'Clicks buttons', complexity: 1 + (n % 3),
        blurb: 'Exists only inside UI tests.', color: h[2], unlock: h[1], stats: { hp: 20 + n * 2, ap: 3, mov: 4, armor: 0 }, growth: { hp: 4 },
        sprite: { base: 'humanoid', palette: { skin: h[2] } }, basic: id + '_basic', signature: id + '_sig',
        passive: { name: 'Test Passive', desc: 'Does nothing at all.', hooks: {} },
        startingSkills: [pool[0], pool[1]], skillPool: pool, barks: { select: ['Ready to be tested.'], levelup: ['I leveled!'] },
      });
    });
    [['ui_w', 'weapon', 'common', { dmg: 0.1 }], ['ui_a1', 'armor', 'common', { hp: 5, armor: 1 }], ['ui_t', 'trinket', 'rare', { range: 1 }],
      ['ui_w2', 'weapon', 'rare', { dmg: 0.2 }], ['ui_a2', 'armor', 'legendary', { hp: 12, block: 3 }], ['ui_t2', 'trinket', 'legendary', { hype: 10 }],
      ['ui_cursed', 'trinket', 'cursed', { dmg: 0.3, hp: -6 }]].forEach(function (x) {
      DD.registerItem({ id: x[0], name: 'Item ' + x[0], slot: x[1], rarity: x[2], icon: '🗡️', stats: x[3], desc: 'Test item.', flavor: 'Test joke.' });
    });
    DD.registerItem({ id: 'ui_a_only', name: 'Hero A Trinket', slot: 'trinket', rarity: 'rare', hero: 'ui_a', icon: '💍', stats: { hype: 10 }, desc: 'Only for hero A.' });
    [['ui_pot', 'common'], ['ui_pot2', 'rare'], ['ui_pot3', 'common']].forEach(function (c) {
      DD.registerConsumable({ id: c[0], name: 'Potion ' + c[0], rarity: c[1], icon: '🧪', target: { type: 'self' }, desc: 'Test potion.', execute: function () {} });
    });
    DD.registerEvent({
      id: 'ui_ev', acts: [1, 2, 3], icon: '🎁', title: 'A Very Testable Chest', text: function () { return 'A chest sits here.\n\nIt looks testable.'; },
      choices: [
        { label: 'Open it.', hint: 'Gold and a scratch.', resolve: function (api) { api.gold(20); api.damage(3); api.xp(5); return 'Gold! Also splinters.'; } },
        { label: 'Lick it.', hint: 'Needs a brave hero', requires: function () { return false; }, resolve: function () { return 'Nope.'; } },
        { label: 'Leave.', resolve: function () { return 'You leave.'; } },
      ],
    });
  }

  /** Real content is used once it is complete enough for every UI path; otherwise swapped-in test content. */
  function contentComplete() {
    const realEvents = Object.keys(DD.defs.events).filter(function (id) { return !DD.defs.events[id].fallback; });
    return DD.UI.heroIds().length >= 4 && Object.keys(DD.defs.items).length >= 6 && Object.keys(DD.defs.consumables).length >= 2 && realEvents.length > 0;
  }

  /** Run fn with complete content: the registered content, or swapped-in test content (restored after). */
  async function uiSandbox(t, fn) {
    if (!DD.Run || !DD.Rewards || !DD.RunMap || !DD.Meta) { t.skip('run layer not available yet'); return; }
    if (contentComplete()) { await fn(); return; }
    const saved = {};
    const savedMeta = DD.util.deepClone(DD.Meta.data);
    SWAP.forEach(function (k) { saved[k] = DD.defs[k]; DD.defs[k] = {}; });
    try {
      registerUiContent();
      Object.keys(saved.events).forEach(function (id) { if (saved.events[id].fallback) DD.defs.events[id] = saved.events[id]; });
      await fn();
    } finally {
      SWAP.forEach(function (k) { DD.defs[k] = saved[k]; });
      DD.Run.state = null;
      DD.Storage.remove(DD.Run.SAVE_KEY || 'run');
      DD.Meta.data = savedMeta;
      DD.Meta.save();
      reset();
    }
  }

  /**
   * A run for screen tests: DD.Run.newRun with 4 registered heroes. The run layer skips screen changes in headless
   * mode unless DD.Run.useUi === true, so it is switched on here (endRun() restores it). Returns the run or null.
   */
  let useUiBefore = null, useUiForced = false;
  function makeRun(t) {
    if (!DD.Run || typeof DD.Run.newRun !== 'function') { t.skip('DD.Run not available yet'); return null; }
    const ids = DD.UI.heroIds();
    if (ids.length < 4) { t.skip('fewer than 4 heroes registered'); return null; }
    if (!useUiForced) { useUiBefore = DD.Run.useUi; useUiForced = true; }
    DD.Run.useUi = true;
    const s = DD.UI.settings();
    const had = s.unlockAll;
    s.unlockAll = true;
    t.tryRun('Run.newRun', function () { DD.Run.newRun(ids.slice(0, 4), 'normal', 4242); });
    s.unlockAll = had;
    const run = DD.UI.run();
    t.ok(run && run.party && run.party.length === 4, 'newRun created a 4-hero run');
    return run || null;
  }
  function endRun(t) {
    reset();
    if (DD.Run && typeof DD.Run.clear === 'function') t.tryRun('Run.clear', function () { DD.Run.clear(); });
    if (DD.Run && useUiForced) { DD.Run.useUi = useUiBefore; useUiForced = false; }
    t.tryRun('show title', function () { DD.UI.show('title'); });
  }
  function owned(run, itemId) {
    return (run.inventory || []).indexOf(itemId) >= 0 || run.party.some(function (h) { return h.items && (h.items.weapon === itemId || h.items.armor === itemId || h.items.trinket === itemId); });
  }
  /** Resolve open Blessing roll modals (random passives): Keep / Upgrade when offered, else Discard. Returns how many. */
  function resolveRollModals(t) {
    let n = 0;
    while (DD.UI.topModal() && modalEl().classList.contains('modal-roll') && n < 12) {
      const btns = Array.prototype.slice.call(modalEl().querySelectorAll('.pr-actions .btn'));
      const b = btns.filter(function (x) { return /Keep|Upgrade/.test(x.textContent); })[0] || btns.filter(function (x) { return /Discard/.test(x.textContent); })[0];
      if (!b) break;
      t.tryRun('resolve the Blessing roll', function () { b.click(); });
      n++;
    }
    return n;
  }

  // ---- framework --------------------------------------------------------------------------------------------------
  T.suite('ui: framework — init, el, button, hotkeys', function (t) {
    const UI = DD.UI;
    t.ok(UI && typeof UI.init === 'function', 'DD.UI exists');
    UI.init();
    t.ok(document.getElementById('ui') === UI.root, '#ui root exists (created if missing)');
    t.ok(UI.root.querySelector('.ui-screens') && UI.root.querySelector('.ui-modals') && UI.root.querySelector('.ui-tips'), 'layers created');

    let clicked = 0;
    const node = UI.el('div.a.b#idx', { class: 'c', style: { color: 'red', '--x': '3' }, dataset: { foo: 'bar' }, title: 'T', on: { click: function () { clicked++; } } }, 'hi', [UI.el('span', null, 'x'), null, false], 5);
    t.eq(node.tagName, 'DIV', 'tag');
    t.ok(node.classList.contains('a') && node.classList.contains('b') && node.classList.contains('c'), 'classes from tag and attrs');
    t.eq(node.id, 'idx', 'id from tag');
    t.eq(node.style.color, 'red', 'style object');
    t.eq(node.style.getPropertyValue('--x'), '3', 'css variable');
    t.eq(node.dataset.foo, 'bar', 'dataset');
    t.eq(node.getAttribute('title'), 'T', 'plain attribute');
    t.eq(node.textContent, 'hix5', 'children: text, arrays, null/false skipped, numbers');
    node.click();
    t.eq(clicked, 1, 'on.click handler');
    const n2 = UI.el('p', 'child text');
    t.eq(n2.textContent, 'child text', 'attrs may be omitted');

    let hits = 0;
    const scr = UI.el('div');
    UI.root.querySelector('.ui-screens').appendChild(scr);
    const b = UI.button('Go', function () { hits++; }, { hotkey: 'g', cls: 'primary', tooltip: 'tip' });
    scr.appendChild(b);
    t.ok(b.classList.contains('btn') && b.classList.contains('primary'), 'button classes');
    t.ok(b.querySelector('.kbd'), 'hotkey badge');
    b.click();
    t.eq(hits, 1, 'button click');
    key('g');
    t.eq(hits, 2, 'hotkey clicks the button');
    UI.setDisabled(b, true);
    b.click();
    key('g');
    t.eq(hits, 2, 'disabled button ignores clicks and hotkeys');
    UI.setDisabled(b, false);
    const m = UI.modal({ title: 'Blocker', body: 'x' });
    key('g');
    t.eq(hits, 2, 'hotkeys of buttons under a modal are blocked');
    m.close();
    key('g');
    t.eq(hits, 3, 'hotkey works again after the modal closes');
    scr.remove();
    key('g');
    t.eq(hits, 3, 'removed buttons no longer receive hotkeys');
    reset();
  });

  T.suite('ui: modal, choice, confirm, Esc, toast', async function (t) {
    const UI = DD.UI;
    UI.init();
    reset();
    let closed = null, clickedBtn = 0;
    const m = UI.modal({ title: 'Hello', body: '<b>bold</b>', buttons: [{ label: 'Stay', close: false, onClick: function () { clickedBtn++; } }, { label: 'OK', primary: true }], onClose: function (r) { closed = r; } });
    t.eq(UI.modalCount(), 1, 'modal opened');
    t.ok(m.body.querySelector('b'), 'HTML string body');
    const btns = m.el.querySelectorAll('.modal-buttons .btn');
    btns[0].click();
    t.eq(clickedBtn, 1, 'button onClick');
    t.eq(UI.modalCount(), 1, 'close:false keeps it open');
    key('Escape');
    t.eq(UI.modalCount(), 0, 'Esc closes a closable modal');
    t.eq(closed, 'escape', 'onClose reason');

    const nc = UI.modal({ title: 'Stuck', body: 'no escape', closable: false, buttons: [{ label: 'Leave', primary: true }] });
    key('Escape');
    t.eq(UI.modalCount(), 1, 'Esc does not close a non-closable modal');
    t.ok(!nc.el.querySelector('.modal-x'), 'no close button when not closable');
    key('Enter');
    t.eq(UI.modalCount(), 0, 'Enter clicks the primary button');

    const outer = UI.modal({ title: 'Outer', body: 'a' });
    UI.modal({ title: 'Inner', body: 'b' });
    t.eq(UI.modalCount(), 2, 'stacked modals');
    key('Escape');
    t.eq(UI.modalCount(), 1, 'Esc closes only the top modal');
    t.ok(UI.topModal() === outer, 'outer remains');
    reset();

    let picked = null;
    UI.choice({ title: 'Pick', text: 'Choose', options: [{ label: 'A', onPick: function () { picked = 'A'; } }, { label: 'B', desc: 'second', onPick: function () { picked = 'B'; } }, { label: 'C', disabled: true, reason: 'nope', onPick: function () { picked = 'C'; } }] });
    const opts = modalEl().querySelectorAll('.choice-option');
    t.eq(opts.length, 3, 'choice options rendered');
    opts[2].click();
    t.eq(picked, null, 'disabled option cannot be picked');
    key('2');
    t.eq(picked, 'B', 'number hotkey picks an option');
    t.eq(UI.modalCount(), 0, 'choice closes after picking');

    const p1 = UI.confirm('Sure?');
    modalEl().querySelector('.btn.primary').click();
    t.eq(await p1, true, 'confirm resolves true');
    const p2 = UI.confirm('Sure?');
    key('Escape');
    t.eq(await p2, false, 'confirm resolves false on Esc');
    t.eq(UI.modalCount(), 0, 'no modals left');

    const toast = UI.toast('Hello there', { cls: 'good', ms: 30 });
    t.ok(toast.isConnected && toast.classList.contains('good'), 'toast shown');
    await tick(400);
    t.ok(!toast.isConnected, 'toast removed after its time');
    reset();
  });

  T.suite('ui: tooltips are edge-aware and hide with their anchor', async function (t) {
    const UI = DD.UI;
    UI.init();
    reset();
    const vw = window.innerWidth, vh = window.innerHeight;
    const big = '<div class="tt"><div class="tt-title">A fairly long tooltip title</div><div class="tt-desc">' + 'Lorem ipsum dolor sit amet. '.repeat(6) + '</div></div>';
    [[vw - 2, vh - 2], [2, 2], [vw - 2, 2], [2, vh - 2], [vw / 2, vh / 2]].forEach(function (p) {
      const tip = UI.showTooltip(big, { x: p[0], y: p[1] });
      const r = tip.getBoundingClientRect();
      t.ok(r.left >= 0 && r.top >= 0 && r.right <= vw + 0.5 && r.bottom <= vh + 0.5, 'tooltip inside viewport at ' + p.map(Math.round).join(','));
    });
    UI.hideTooltip();
    const tipEl = UI.root.querySelector('.ui-tooltip');
    t.ok(tipEl && tipEl.style.display === 'none', 'hideTooltip hides');

    const host = UI.el('div', { style: { position: 'fixed', left: '40px', top: '40px', width: '60px', height: '30px' } }, 'hover me');
    UI.root.querySelector('.ui-screens').appendChild(host);
    let calls = 0;
    UI.tooltip(host, function () { calls++; return '<div class="tt">dynamic</div>'; }, { delay: 0, pos: 'top' });
    host.dispatchEvent(new MouseEvent('mouseenter'));
    await tick(20);
    t.eq(calls, 1, 'content function evaluated on hover');
    t.ok(tipEl.classList.contains('show') && tipEl.textContent.indexOf('dynamic') >= 0, 'tooltip visible with content');
    t.ok(tipEl.getBoundingClientRect().top >= 0, 'flipped below when there is no room above');
    host.remove();
    document.dispatchEvent(new MouseEvent('mousemove'));
    t.ok(tipEl.style.display === 'none', 'tooltip hides when its anchor is removed');
    reset();
  });

  // ---- shared views over all content ---------------------------------------------------------------------------------
  T.suite('ui: skill / item / consumable / status / scar views for all content', function (t) {
    const UI = DD.UI;
    UI.init();
    let n = 0;
    Object.keys(DD.defs.skills).forEach(function (id) {
      const d = DD.defs.skills[id];
      const max = d.maxLevel || 1;
      for (let lv = 1; lv <= max; lv++) {
        const html = t.tryRun('skillTooltipHtml ' + id, function () { return UI.skillTooltipHtml(id, lv, null, { showNext: true }); }) || '';
        if (html.indexOf(UI.esc(d.name)) < 0) t.fail('skill tooltip of ' + id + ' lacks its name');
        if (html.indexOf(' AP') < 0) t.fail('skill tooltip of ' + id + ' lacks its AP cost');
        n++;
      }
      const card = t.tryRun('skillCard ' + id, function () { return UI.skillCard(id, max, { showNext: true }); });
      if (!card || !card.classList.contains('skill-card')) t.fail('skillCard ' + id);
      const info = UI.skillInfo(id, 1, null);
      if (!info || typeof info.ap !== 'number' || !isFinite(info.ap)) t.fail('skillInfo AP of ' + id + ' is not a number');
    });
    t.ok(true, n + ' skill-level tooltips rendered');
    Object.keys(DD.defs.items).forEach(function (id) {
      const html = t.tryRun('itemTooltipHtml ' + id, function () { return UI.itemTooltipHtml(id, { price: 50 }); }) || '';
      if (html.indexOf(UI.esc(DD.defs.items[id].name)) < 0) t.fail('item tooltip of ' + id + ' lacks its name');
      t.tryRun('itemCard ' + id, function () { UI.itemCard(id, { price: 10 }); UI.itemCard(id, { compact: true }); });
    });
    Object.keys(DD.defs.consumables).forEach(function (id) {
      t.tryRun('consumable views ' + id, function () { UI.consumableTooltipHtml(id); UI.consumableCard(id, { price: 20 }); });
    });
    Object.keys(DD.defs.statuses).forEach(function (id) {
      const html = t.tryRun('statusTooltipHtml ' + id, function () { return UI.statusTooltipHtml({ id: id, stacks: 3, turns: 2, source: null, data: {} }); }) || '';
      if (html.indexOf('2 turns left') < 0) t.fail('status tooltip of ' + id + ' lacks its duration');
      t.tryRun('statusChip ' + id, function () { UI.statusChip({ id: id, stacks: 2, turns: -1, data: {} }); });
    });
    Object.keys(DD.defs.scars).forEach(function (id) {
      t.tryRun('scar views ' + id, function () { UI.scarTooltipHtml(id); UI.scarChip(id); });
    });
    Object.keys(DD.defs.heroes).forEach(function (id) {
      const p = t.tryRun('portrait ' + id, function () { return UI.portrait(id, 64); });
      if (!p || !p.classList.contains('portrait')) t.fail('portrait of ' + id);
      if (DD.Sprites && DD.Sprites.portrait && p && !p.querySelector('.portrait-canvas')) t.fail('portrait of ' + id + ' has no sprite image');
      t.tryRun('heroTooltipHtml ' + id, function () { UI.heroTooltipHtml(id, { locked: true }); });
    });
    Object.keys(DD.defs.enemies).forEach(function (id) { t.tryRun('enemyTooltipHtml ' + id, function () { UI.enemyTooltipHtml(id); }); });
    t.ok(UI.skillTooltipHtml('nope_missing', 1).indexOf('Unknown') >= 0, 'missing skill handled');
    t.ok(UI.itemCard('nope_missing').classList.contains('item-card'), 'missing item handled');
    const mp = UI.portrait('nope_missing', 40);
    t.ok(mp.querySelector('.portrait-fallback') || mp.querySelector('.portrait-canvas'), 'missing portrait falls back (placeholder sprite or initial)');
    const bar = UI.hpBar(5, 20, { block: 3 });
    t.ok(parseFloat(bar.querySelector('.hp-fill').style.width) === 25 && bar.classList.contains('hp-low'), 'hpBar fill + color class');
    t.ok(bar.textContent.indexOf('5 / 20') >= 0 && bar.querySelector('.hp-block'), 'hpBar text + block');
    t.ok(UI.goldText(42).textContent === '42', 'goldText');
    t.ok(!UI.xpBar && !UI.xpProgress, 'no XP bar views (v2 leveling has no XP)');
    t.eq(UI.andList(['A']) + '|' + UI.andList(['A', 'B']) + '|' + UI.andList(['A', 'B', 'C']), 'A|A and B|A, B and C', 'andList');
    if (!UI.run()) t.eq(UI.nextLevelUp(), null, 'nextLevelUp without a run → null');
  });

  // ---- screens -------------------------------------------------------------------------------------------------------
  T.suite('ui: every screen mounts and unmounts without a run', async function (t) {
    const UI = DD.UI;
    UI.init();
    reset();
    if (DD.Run && typeof DD.Run.clear === 'function') t.tryRun('Run.clear', function () { DD.Run.clear(); });
    if (DD.Run) DD.Run.state = null;
    SCREENS.forEach(function (id) {
      t.ok(!!UI.screens[id], 'screen registered: ' + id);
      if (!UI.screens[id]) return;
      t.tryRun('show ' + id, function () { UI.show(id, {}); });
      t.eq(UI.current, id, 'current is ' + id);
      t.ok(root() && root().children.length > 0, id + ' rendered something');
      reset();
    });
    t.tryRun('show final victory', function () { UI.show('victory', { act: 3, final: true }); });
    t.ok(q('.end-title'), 'final victory renders');
    await tick(10);
    t.tryRun('back to title', function () { UI.show('title'); });
    t.ok(qa('.menu-item').length >= 4, 'title menu has its items');
    reset();
  });


  T.suite('ui: every screen mounts with a run (map, rewards, event, shop, tavern, party, end screens)', function (t) {
    return uiSandbox(t, function () { return screensWithRun(t); });
  });
  async function screensWithRun(t) {
    const UI = DD.UI;
    UI.init();
    reset();
    const run = makeRun(t);
    if (!run) return;
    t.eq(UI.current, 'map', 'newRun shows the map');
    t.ok(qa('.map-node').length > 0, 'map nodes rendered');
    t.ok(qa('.map-node.s-reachable').length > 0, 'reachable nodes highlighted');
    t.eq(qa('.side-party .hero-mini').length, 4, 'party sidebar shows 4 heroes');
    SCREENS.forEach(function (id) {
      if (!UI.screens[id]) return;
      const params = id === 'levelup' ? { queue: [0], next: 'map' } : id === 'victory' ? { act: 1 } : id === 'party' ? { back: 'map', hero: 1 } : {};
      t.tryRun('show ' + id, function () { UI.show(id, params); });
      t.ok(root() && root().children.length > 0, id + ' rendered with a run');
      reset();
    });
    t.tryRun('party screen', function () { UI.show('party', { back: 'map' }); });
    t.eq(qa('.hero-tab').length, 4, 'party tabs');
    t.eq(qa('.socket').length, 4, 'four skill sockets');
    key('3');
    t.ok(qa('.hero-tab')[2].classList.contains('active'), 'number key switches hero tab');
    key('Escape');
    t.eq(UI.current, 'map', 'Esc goes back from the party screen');
    endRun(t);
  }

  T.suite('ui: flow — map travel, rewards pick and level-up choices', function (t) {
    return uiSandbox(t, function () { return travelRewardsLevelup(t); });
  });
  async function travelRewardsLevelup(t) {
    const UI = DD.UI;
    UI.init();
    reset();
    const run = makeRun(t);
    if (!run) return;
    // Make the first start node an event so travelling does not need the combat HUD.
    const startId = run.map.start[0];
    run.map.nodes[startId].type = 'event';
    t.tryRun('refresh map', function () { UI.refresh(); });
    const node = qa('.map-node.s-reachable').filter(function (n) { return n.dataset.id === startId; })[0];
    t.ok(node && node.classList.contains('t-event'), 'reachable event node rendered');
    if (node) {
      t.tryRun('travel click', function () { node.click(); });
      t.eq(DD.UI.run().nodeId, startId, 'clicking a reachable node travels there');
      t.eq(UI.current, 'event', 'travelling to an event node shows the event screen');
    }
    reset();
    if (!DD.Rewards || typeof DD.Rewards.combat !== 'function') { t.skip('DD.Rewards not available'); endRun(t); return; }
    const r = DD.UI.run();
    r.pending = null;
    t.tryRun('level up hero 0', function () { DD.Run.levelUp(0); });
    t.ok(r.party[0].pendingLevels > 0 || r.party[0].pendingLevels === undefined, 'hero 0 owes a level-up choice');
    const rw = t.tryRun('Rewards.combat', function () { return DD.Rewards.combat('normal', r.act, DD.Run.rng(), r); });
    t.ok(rw && Array.isArray(rw.choices) && rw.choices.length === 3, 'three reward choices generated');
    if (!rw) { endRun(t); return; }
    t.tryRun('show rewards', function () { UI.show('rewards', { gold: rw.gold, choices: rw.choices, kind: 'normal', leveled: [0], next: 'map' }); });
    const cards = qa('.reward-card');
    t.eq(cards.length, rw.choices.length, 'one card per reward choice');
    const pick = rw.choices.map(function (c, i) { return { c: c, i: i }; }).filter(function (x) { return x.c.type !== 'skill' && x.c.type !== 'consumable'; })[0];
    if (pick) {
      const goldBefore = r.gold;
      t.tryRun('pick reward', function () { cards[pick.i].click(); });
      t.eq(qa('.reward-card.picked').length, 1, 'picked card marked');
      t.eq(qa('.reward-card.gone').length, cards.length - 1, 'other cards greyed out');
      if (pick.c.type === 'gold') t.ok(DD.UI.run().gold > goldBefore, 'gold reward applied');
      if (pick.c.type === 'item') t.ok(owned(DD.UI.run(), pick.c.id), 'item reward is owned');
    } else {
      t.tryRun('skip loot', function () { q('.rw-actions .btn').click(); });
      if (UI.topModal()) UI.topModal().el.querySelector('.btn.primary').click();
      await tick(0);
    }
    const cont = q('.rw-actions .btn.primary');
    t.ok(cont, 'continue button after picking');
    if (cont) t.tryRun('continue', function () { cont.click(); });
    t.eq(UI.current, 'levelup', 'level-up flow follows the rewards');
    // with a passive table, each level opens with a roll on the Table of Questionable Blessings (tests/passive_tests.js)
    const rolled = resolveRollModals(t);
    if (DD.Passives && DD.Passives.count() > 0) t.ok(rolled > 0, 'the level-up opened with a Blessing roll');
    t.ok(UI.topModal() && modalEl().querySelectorAll('.choice-option').length === 3, 'three level-up choices shown');
    let guard = 0;
    while (UI.topModal() && guard++ < 16) {
      if (resolveRollModals(t)) continue;
      const before = JSON.stringify(DD.UI.run().party);
      const optEls = modalEl().querySelectorAll('.choice-option, .rp-grid .skill-card');
      t.tryRun('pick level choice', function () { optEls[optEls.length - 1].click(); });
      t.ok(JSON.stringify(DD.UI.run().party) !== before || UI.topModal(), 'the choice changed the party (or opened the next step)');
    }
    await tick(20);
    t.eq(UI.current, 'map', 'back on the map after the level-ups');
    t.ok(!DD.Run.hasPendingChoices || !DD.Run.hasPendingChoices(), 'no level-up choices left');
    endRun(t);
  }

  T.suite('ui: flow — event choice, shop purchase, tavern rest, party equip', function (t) {
    return uiSandbox(t, function () { return eventShopTavernParty(t); });
  });
  async function eventShopTavernParty(t) {
    const UI = DD.UI;
    UI.init();
    reset();
    const run = makeRun(t);
    if (!run) return;
    const evIds = Object.keys(DD.defs.events).filter(function (id) { return !DD.defs.events[id].fallback; });
    const evId = evIds[0] || (DD.Run.FALLBACK_EVENT && DD.getEvent(DD.Run.FALLBACK_EVENT) ? DD.Run.FALLBACK_EVENT : null);
    if (evId && DD.Run.openEvent) {
      t.tryRun('open event', function () { DD.Run.openEvent(evId); });
      t.eq(UI.current, 'event', 'event screen shown');
      t.ok(q('.ev-title'), 'event title rendered');
      const choice = qa('.ev-choice').filter(function (b) { return !b.classList.contains('is-disabled'); })[0];
      t.ok(choice, 'an available event choice');
      if (choice) {
        t.tryRun('choose', function () { choice.click(); });
        t.ok(q('.ev-outcome'), 'outcome text shown');
        t.ok(DD.UI.run().pending && DD.UI.run().pending.data.resolved, 'the run recorded the resolved event');
        const cont = q('.ev-actions .btn');
        t.ok(cont, 'continue / fight button');
        if (cont && !DD.UI.run().queuedCombat) {
          t.tryRun('continue', function () { cont.click(); });
          let guard = 0;
          while (UI.topModal() && guard++ < 8) { const b = modalEl().querySelector('.choice-option, .modal-buttons .btn'); if (b) b.click(); else break; }
          await tick(20);
          t.eq(UI.current, 'map', 'continue returns to the map');
        }
      }
    }
    reset();
    const r = DD.UI.run();
    if (r.pending && r.pending.type !== 'shop') r.pending = null;
    r.queuedCombat = null;
    r.gold = 999;
    t.tryRun('show shop', function () { UI.show('shop', {}); });
    t.ok(qa('.ware').length > 0, 'shop wares rendered');
    const s = DD.Run.shop ? DD.Run.shop() : null;
    t.ok(s && s.items, 'the shop is the pending run step');
    const buyBtn = qa('.ware-sec.gear .btn.buy').filter(function (b) { return !b.classList.contains('is-disabled'); })[0];
    if (buyBtn && s && s.items.length) {
      const id = s.items[0].id;
      t.tryRun('buy item', function () { buyBtn.click(); });
      t.ok(owned(DD.UI.run(), id), 'bought item is owned (bag or auto-equipped)');
      t.ok(DD.UI.run().gold < 999, 'gold was spent');
      t.eq(qa('.ware-sec.gear .ware.sold').length, 1, 'ware marked sold');
    }
    t.tryRun('shop → party → shop', function () { UI.show('party', { back: 'shop' }); key('Escape'); });
    t.eq(UI.current, 'shop', 'returned to the shop');
    t.eq(qa('.ware-sec.gear .ware.sold').length, buyBtn ? 1 : 0, 'stock (and sold marks) persisted across screens');
    const leave = qa('.keeper-actions .btn.primary')[0];
    t.tryRun('leave shop', function () { leave.click(); });
    await tick(10);
    t.ok(UI.current === 'map' || UI.current === 'levelup', 'leaving the shop moves on');
    reset();

    const r2 = DD.UI.run();
    r2.pending = null;
    r2.party.forEach(function (h) { if (!h.dead) h.hp = 1; });
    t.tryRun('show tavern', function () { UI.show('tavern', {}); });
    const rest = q('.tav-option.k-rest .btn');
    t.ok(rest, 'rest option');
    t.tryRun('rest', function () { rest.click(); });
    if (UI.topModal()) t.tryRun('pick scar patient', function () { modalEl().querySelector('.choice-option').click(); });
    t.ok(DD.UI.run().party.every(function (h) { return h.dead || h.hp > 1; }), 'resting healed the party');
    t.ok(q('.tav-option.k-train .btn').classList.contains('is-disabled'), 'other tavern options locked after choosing');
    t.ok(q('.tav-result'), 'tavern result shown');
    reset();

    const r3 = DD.UI.run();
    r3.pending = null;
    const free = Object.keys(DD.defs.items).filter(function (id) { const d = DD.defs.items[id]; return !d.hero && d.rarity !== 'cursed'; })[0];
    if (free) {
      t.tryRun('addItem', function () { DD.Run.addItem(free); });
      t.tryRun('show party', function () { UI.show('party', { back: 'map', hero: 0 }); });
      const slot = DD.getItem(free).slot;
      if (DD.UI.run().party[0].items[slot]) t.tryRun('unequip first', function () { DD.Run.unequip(0, slot); UI.refresh(); });
      const row = qa('.stash-row').filter(function (rw) { return rw.querySelector('.ic-name') && rw.querySelector('.ic-name').textContent === DD.getItem(free).name; })[0];
      const eq = row ? row.querySelector('.btn') : null;
      t.ok(eq && !eq.classList.contains('is-disabled'), 'equip button for the stash item');
      if (eq) {
        t.tryRun('equip', function () { eq.click(); });
        t.eq(DD.UI.run().party[0].items[slot], free, 'item equipped on the hero');
        t.ok(qa('.gear-slot.filled').length >= 1, 'equipped slot shown');
      }
    }
    endRun(t);
  }

  T.suite('ui: flow — defeat and victory end screens from the run layer', function (t) {
    return uiSandbox(t, function () { return endScreens(t); });
  });
  function endScreens(t) {
    const UI = DD.UI;
    UI.init();
    reset();
    const run = makeRun(t);
    if (!run) return;
    if (!DD.Run.endRun) { t.skip('DD.Run.endRun not available'); endRun(t); return; }
    t.tryRun('endRun defeat', function () { DD.Run.endRun('defeat', { killedBy: 'A Very Rude Goblin' }); });
    t.eq(UI.current, 'gameover', 'defeat shows the game over screen');
    t.ok(q('.end-title') && /party kill/i.test(q('.end-title').textContent), 'TPK title');
    t.eq(qa('.tomb').length, 4, 'a tombstone per hero');
    t.ok(q('.end-killer') && q('.end-killer').textContent.indexOf('A Very Rude Goblin') >= 0, 'killer shown');
    t.ok(qa('.end-actions .btn').length >= 2, 'end buttons');
    reset();
    const run2 = makeRun(t);
    if (!run2) return;
    t.tryRun('endRun victory', function () { DD.Run.endRun('victory', { unlocked: [] }); });
    t.eq(UI.current, 'victory', 'victory shows the victory screen');
    t.ok(q('.end-title') && /victory/i.test(q('.end-title').textContent), 'final victory title');
    t.ok(q('.end-stats'), 'run stats shown');
    endRun(t);
  }

  // ---- regressions found by the VERIFY-UX playtest ---------------------------------------------------------------------
  /**
   * Elements inside #ui that are (effectively) invisible but would still catch the mouse — they silently swallow clicks
   * meant for the map or the panels underneath. Returns short descriptions.
   */
  function invisibleBlockers() {
    const out = [];
    const all = DD.UI.root ? DD.UI.root.querySelectorAll('*') : [];
    for (let i = 0; i < all.length; i++) {
      const e = all[i];
      const cs = getComputedStyle(e);
      if (cs.pointerEvents === 'none' || cs.visibility === 'hidden' || cs.display === 'none') continue;
      const r = e.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      let alpha = 1, animating = false;
      for (let p = e; p && p !== DD.UI.root; p = p.parentElement) {
        alpha *= +getComputedStyle(p).opacity;
        if (p.getAnimations && p.getAnimations().length) animating = true; // fading in right now: not a blocker
      }
      if (alpha < 0.05 && !animating) out.push((e.className && e.className.baseVal === undefined ? String(e.className) : e.tagName) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
    }
    return out;
  }

  T.suite('ui: no invisible element swallows clicks (screens + combat HUD)', function (t) {
    const UI = DD.UI;
    UI.init();
    reset();
    const scan = function (label) {
      const bad = invisibleBlockers();
      t.eq(bad.length, 0, label + ': no invisible click blockers' + (bad.length ? ' (' + bad.slice(0, 4).join(' | ') + ')' : ''));
    };
    ['title', 'partySelect', 'settings', 'hall'].forEach(function (id) {
      if (!UI.screens[id]) return;
      t.tryRun('show ' + id, function () { UI.show(id, {}); });
      scan(id);
    });
    if (DD.Combat && UI.screens.combat && DD.getHero('test_knight') && DD.getEnemy('test_grunt')) {
      t.tryRun('sandbox fight', function () {
        DD.Combat.sandbox({ w: 8, h: 8, seed: 9, theme: 'cellar', heroes: [{ id: 'test_knight', x: 2, y: 5 }, { id: 'test_mage', x: 3, y: 6 }], enemies: [{ id: 'test_grunt', x: 5, y: 2 }] });
        UI.show('combat');
      });
      scan('combat HUD');
      t.tryRun('narrator line', function () { DD.Act.log('The DM clears his throat.', 'narrator'); });
      const dm = root() && root().querySelector('.hud-dm');
      if (dm) {
        dm.classList.remove('show'); // the caption fades out after a few seconds
        t.eq(getComputedStyle(dm).pointerEvents, 'none', 'the DM caption never blocks the board, shown or hidden');
      }
      scan('combat HUD after a narrator line');
    }
    reset();
    t.tryRun('back to title', function () { UI.show('title'); });
  });

  // ---- map rotation (rotation plan §3.5, T14) ---------------------------------------------------------------------------
  T.suite('ui: map rotation — Settings lists the rotation keys and the "Snap rotation to the classic views" toggle', function (t) {
    const UI = DD.UI;
    if (!DD.Meta || !DD.Meta.data || !UI.screens.settings) { t.skip('meta or the settings screen missing'); return; }
    UI.init();
    reset();
    const s = UI.settings();
    const had = Object.prototype.hasOwnProperty.call(s, 'rotSnap'), old = s.rotSnap;
    const snapRow = function () { return qa('.set-row').filter(function (r) { const l = r.querySelector('.set-label'); return l && /Snap rotation to the classic views/.test(l.textContent); })[0] || null; };
    try {
      delete s.rotSnap;
      t.tryRun('show settings', function () { UI.show('settings', {}); });
      const rows = qa('.controls .ctrl').map(function (c) { return c.querySelector('.ctrl-key').textContent + ' = ' + c.querySelector('.ctrl-desc').textContent; });
      ['Middle drag = Rotate the map to any angle', 'Q / R = Turn the map 90°', 'Home = Reset the view', 'F = Recenter the camera', 'Right / left drag = Pan the camera',
        'Shift + wheel = Rotate the map (or a sideways swipe)', 'Two-finger twist = Rotate the map (touch)'].forEach(function (r) {
        t.ok(rows.indexOf(r) >= 0, 'controls list: ' + r);
      });
      t.ok(!rows.some(function (r) { return /middle/i.test(r) && /Pan/.test(r); }), 'middle drag no longer pans');
      t.ok(!rows.some(function (r) { return /^F \/ Home/.test(r); }), 'F and Home are separate rows (Home resets the view)');
      const row = snapRow();
      t.ok(row, 'a "Snap rotation to the classic views" row');
      const tg = row ? row.querySelector('.toggle') : null;
      t.ok(tg && tg.classList.contains('on'), 'on by default (settings.rotSnap absent)');
      t.ok(row && /4°/.test(row.textContent) && /Shift/.test(row.textContent), 'its description gives the 4° window and Shift');
      if (tg) {
        tg.click();
        t.eq(s.rotSnap, false, 'switching it off writes settings.rotSnap = false (what DD.Render.endRotate reads)');
        tg.click();
        t.eq(s.rotSnap, true, '...and back on');
      }
      s.rotSnap = false;
      t.tryRun('re-open settings', function () { UI.show('title'); UI.show('settings', {}); });
      const tg2 = snapRow() && snapRow().querySelector('.toggle');
      t.ok(tg2 && !tg2.classList.contains('on'), 'a remembered "off" shows as off');
    } finally {
      if (had) s.rotSnap = old; else delete s.rotSnap;
      if (DD.Meta.save) DD.Meta.save();
      reset();
      UI.show('title');
    }
  });

  T.suite('ui: map rotation — the HUD view buttons fit the top-right cluster at 1024×640, 1280×720 and 1920×1080; rot=30 turns the compass (real page)', async function (t) {
    if (!DD.getEncounter || !DD.getEncounter('boss_lichtenstein')) { t.skip('real encounters not loaded'); return; }
    const sizes = [[1024, 640], [1280, 720], [1920, 1080]];
    for (let i = 0; i < sizes.length; i++) {
      const w = sizes[i][0], h = sizes[i][1], tag = w + '×' + h + ': ';
      const f = await gameFrame('debug=1&screen=combat&encounter=boss_lichtenstein&seed=7&rot=30', w, h);
      try {
        const W = f.contentWindow;
        const ok = await frameUntil(function () { return W.DD && W.DD.HUD && W.DD.HUD.mounted() && W.document.querySelector('.hud-tr .hud-view'); }, 15000);
        t.ok(ok, tag + 'the combat HUD is up');
        if (!ok) continue;
        await tick(80);
        const doc = W.document;
        if (typeof W.DD.Render.getYaw !== 'function') { t.skip('the renderer has no map rotation'); return; }
        t.near(W.DD.Render.getYaw(), 30, 1e-9, tag + 'rot=30 turned the map');
        t.near(W.DD.HUD.compass(), 75, 1e-6, tag + 'the compass needle reads 75° (right, a little up)');
        t.ok(doc.querySelector('.hud-vbtn.hv-compass').classList.contains('turned'), tag + 'the compass is lit (the map is turned)');
        t.eq(W.DD.HUD.edgeName('N'), 'right edge', tag + 'the classic top-right edge is on the right now');
        const box = function (n) { return n.getBoundingClientRect(); };
        const hit = function (a, b) { return a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1; };
        const btns = Array.prototype.slice.call(doc.querySelectorAll('.hud-tr .hud-view .hud-vbtn'));
        t.eq(btns.length, 3, tag + 'three view buttons');
        const tr = box(doc.querySelector('.hud-tr'));
        const others = ['.hud-round', '.hud-init', '.hud-obj', '.hud-log', '.hud-party', '.hud-tr .hud-speed', '.hud-tr > .btn:last-child'].map(function (sel) { return { sel: sel, n: doc.querySelector(sel) }; })
          .filter(function (o) { return o.n && W.getComputedStyle(o.n).display !== 'none'; });
        btns.forEach(function (b, k) {
          const r = box(b);
          t.ok(r.width >= 28 && r.height >= 28, tag + 'button ' + k + ' is a decent target (' + Math.round(r.width) + '×' + Math.round(r.height) + ')');
          t.ok(r.left >= 0 && r.top >= 0 && r.right <= w && r.bottom <= h, tag + 'button ' + k + ' is on screen');
          t.ok(r.left >= tr.left - 1 && r.right <= tr.right + 1 && r.top >= tr.top - 1 && r.bottom <= tr.bottom + 1, tag + 'button ' + k + ' sits inside the top-right cluster');
          const bad = others.filter(function (o) { return hit(r, box(o.n)); }).map(function (o) { return o.sel; });
          t.eq(bad.length, 0, tag + 'button ' + k + ' overlaps nothing' + (bad.length ? ' (' + bad.join(', ') + ')' : ''));
        });
      } finally { f.remove(); }
    }
  });

  // review: a won run fight hands off to the rewards screen with the board still drawn behind it (scene 'combat'); the
  // rotation keys there used to turn that board and remember the angle
  T.suite('ui: map rotation — Q / R / Home on the rewards screen leave the board behind it alone (real page)', async function (t) {
    if (!DD.getEncounter || !DD.getEncounter('boss_lichtenstein')) { t.skip('real encounters not loaded'); return; }
    const f = await gameFrame('debug=1&seed=5', 1280, 720);
    try {
      const W = f.contentWindow;
      const booted = await frameUntil(function () { return W.DDdbg && W.DD.UI.current === 'title'; }, 15000);
      t.ok(booted, 'the title is up');
      if (!booted) return;
      if (typeof W.DD.Render.turn !== 'function') { t.skip('the renderer has no map rotation'); return; }
      const press = function (k) {
        W.document.body.dispatchEvent(new W.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
        W.document.body.dispatchEvent(new W.KeyboardEvent('keyup', { key: k, bubbles: true, cancelable: true }));
      };
      W.DDdbg.newRun();
      W.DDdbg.fight('normal');
      t.ok(await frameUntil(function () { return W.DD.UI.current === 'combat' && W.DD.HUD.mounted(); }, 10000), 'a run fight is up');
      W.DD.Render.setYaw(30, { keepFocus: false });
      W.DDdbg.win();
      const rewards = await frameUntil(function () { return W.DD.UI.current === 'rewards'; }, 30000);
      t.ok(rewards, 'the win hands off to the rewards screen');
      if (!rewards) return;
      t.eq(W.DD.Render.getScene(), 'combat', 'the board is still drawn behind it');
      press('r'); await tick(350);
      press('q'); await tick(350);
      press('Home'); await tick(350);
      t.eq(W.DD.Render.getYaw(), 30, 'Q / R / Home there do not turn it');
      await tick(700);
      t.ok(W.DD.Meta.data.settings.viewYaw === undefined, '...and no angle is remembered');
      W.DDdbg.fight('normal');
      t.ok(await frameUntil(function () { return W.DD.UI.current === 'combat' && W.DD.HUD.mounted(); }, 10000), 'the next fight is up');
      press('r');
      t.ok(await frameUntil(function () { return W.DD.Render.getYaw() === 90; }, 3000), 'on the battlefield R turns it again (30 → 90)');
    } finally {
      // that last turn is a remembered gesture: keep it out of the file:// localStorage the later real-page suites share
      try { const D = f.contentWindow.DD; if (D && D.Meta && D.Meta.data) { delete D.Meta.data.settings.viewYaw; D.Meta.save(); } } catch (e) { /* frame gone */ }
      f.remove();
    }
  });

  T.suite('ui: Enter never confirms a destructive dialog', async function (t) {
    const UI = DD.UI;
    UI.init();
    reset();
    const p1 = UI.confirm('Abandon everything?', { danger: true, yes: 'Abandon', no: 'Keep playing' });
    key('Enter');
    t.eq(await p1, false, 'Enter on a danger confirm keeps things as they are');
    t.eq(UI.modalCount(), 0, 'and closes it');
    const p2 = UI.confirm('Abandon everything?', { danger: true, yes: 'Abandon' });
    const yes = modalEl().querySelector('.btn.danger');
    t.ok(yes, 'the destructive button is still there to click');
    yes.click();
    t.eq(await p2, true, 'clicking it confirms');
    const p3 = UI.confirm('Harmless?');
    key('Enter');
    t.eq(await p3, true, 'Enter still confirms a harmless dialog');
    reset();
  });

  T.suite('ui: shop services sit at the counter (no scrolling) and work', function (t) {
    return uiSandbox(t, function () {
      const UI = DD.UI;
      UI.init();
      reset();
      const run = makeRun(t);
      if (!run) return;
      try {
        run.gold = 500;
        DD.Run.damageHero(0, 10);
        t.tryRun('open the shop', function () { UI.show('shop', { debug: true }); });
        const rows = qa('.keeper .keeper-services .ks-row');
        // + "Re-roll a Blessing" while the random passive table has entries (tests/passive_tests.js)
        const reroll = !!(DD.Passives && DD.Passives.count() > 0);
        t.eq(rows.length, reroll ? 3 : 2, 'heal + scar' + (reroll ? ' + re-roll' : '') + ' services under the shopkeeper');
        if (reroll) t.ok(rows[2] && /Re-roll a Blessing/.test(rows[2].textContent), 'the Blessing re-roll is the third service');
        t.eq(qa('.wares .ware-sec.services').length, 0, 'not buried at the bottom of the wares any more');
        const healBtn = rows[0] && rows[0].querySelector('.btn.buy');
        t.ok(healBtn && !healBtn.classList.contains('is-disabled'), 'heal is buyable while a hero is hurt');
        const hpBefore = DD.UI.run().party[0].hp, goldBefore = DD.UI.run().gold;
        if (healBtn) t.tryRun('buy heal', function () { healBtn.click(); });
        t.ok(DD.UI.run().party[0].hp > hpBefore, 'the hurt hero was healed');
        t.ok(DD.UI.run().gold < goldBefore, 'and it cost gold');
        const after = qa('.keeper .keeper-services .ks-row')[0];
        t.ok(after && after.classList.contains('sold'), 'the service is marked as used for this visit');
        const scarBtn = qa('.keeper .keeper-services .ks-row')[1].querySelector('.btn.buy');
        t.ok(scarBtn && scarBtn.classList.contains('is-disabled'), 'scar cream is disabled without scars');
      } finally {
        endRun(t);
      }
    });
  });

  function titleButton(re) {
    return qa('.title-menu .btn').filter(function (b) { return re.test(b.textContent); })[0] || null;
  }

  T.suite('ui: combat HUD — Space skips the last animations of a finished fight', async function (t) {
    if (!DD.Combat || !DD.HUD || !DD.UI.screens.combat || !DD.FX) { t.skip('engine or combat HUD missing'); return; }
    if (!DD.getHero('test_knight') || !DD.getEnemy('test_grunt')) { t.skip('tests/fixtures.js not loaded'); return; }
    const UI = DD.UI;
    const FX = DD.FX;
    const wasInstant = FX.instant;
    UI.init();
    reset();
    try {
      DD.Combat.sandbox({ w: 8, h: 8, seed: 5, theme: 'cellar', heroes: [{ id: 'test_knight', x: 2, y: 5 }], enemies: [{ id: 'test_grunt', x: 5, y: 2 }] });
      UI.show('combat');
      t.ok(DD.HUD.mounted(), 'HUD mounted on the sandbox fight');
      FX.instant = false;
      FX.wait(600000); // a ten-minute "animation" (content bug)
      t.tryRun('finish the fight', function () { DD.Combat.finish('victory'); });
      t.eq(DD.HUD.lock(), 'over', 'input is locked: the fight is over');
      t.ok(FX.busy() && !DD.HUD.endPending(), 'the hand-off waits for the animations');
      t.tryRun('press Space', function () { DD.HUD.key(' '); });
      t.ok(!FX.busy(), 'Space skipped the remaining animations');
      for (let i = 0; i < 5 && UI.current === 'combat' && !UI.topModal(); i++) await tick(5);
      t.ok(UI.topModal() && /Victory/.test(UI.topModal().el.textContent), 'the result is handed off (debug fight: result modal)');
    } finally {
      FX.reset();
      FX.instant = wasInstant;
      reset();
      UI.show('title');
    }
  });

  T.suite('ui: right-click never opens the browser menu; on a HUD panel it cancels targeting', function (t) {
    const UI = DD.UI;
    UI.init();
    reset();
    t.tryRun('title', function () { UI.show('title'); });
    const btn = qa('.title-menu .btn')[0];
    if (btn) {
      const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 });
      btn.dispatchEvent(ev);
      t.ok(ev.defaultPrevented, 'right-click on a menu button: no browser context menu');
    }
    if (!DD.Combat || !UI.screens.combat || !DD.getHero('test_mage') || !DD.getEnemy('test_grunt')) { t.skip('fixtures or combat HUD missing'); return; }
    try {
      t.tryRun('sandbox fight', function () {
        // the grunt starts in Magic Missile range (v2: enemies no longer walk up during a planning phase first)
        DD.Combat.sandbox({ w: 8, h: 8, seed: 9, theme: 'cellar', heroes: [{ id: 'test_mage', x: 2, y: 5 }], enemies: [{ id: 'test_grunt', x: 4, y: 3 }] });
        UI.show('combat');
        // v2 engine: deployment ends when initiative is rolled (sandbox fights put heroes first); then pick the hero
        if (typeof DD.Combat.isDeploying === 'function' && DD.Combat.isDeploying()) DD.Combat.rollInitiative();
        const mage = DD.Combat.heroes ? DD.Combat.heroes()[0] : null;
        if (mage) DD.HUD.select(mage);
      });
      t.tryRun('arm the basic attack', function () { DD.HUD.pressSlot(0); });
      t.eq(DD.HUD.mode() && DD.HUD.mode().kind, 'skill', 'a skill is armed' + (DD.HUD.mode() && DD.HUD.mode().kind !== 'skill' ? ' (hint: ' + DD.HUD.hint() + ')' : ''));
      const panel = root() && root().querySelector('.hud-bar');
      t.ok(panel, 'action bar present');
      if (panel) {
        const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 });
        panel.dispatchEvent(ev);
        t.ok(ev.defaultPrevented, 'no browser context menu over the HUD');
        t.eq(DD.HUD.mode() && DD.HUD.mode().kind, 'move', 'right-click on the action bar cancelled targeting');
      }
    } finally {
      reset();
      UI.show('title');
    }
  });

  T.suite('ui: Continue after Quit to Title resumes the live fight; a fresh page restarts it', function (t) {
    const ids = ['test_knight', 'test_mage', 'test_cleric', 'test_rogue'];
    if (!DD.Run || !DD.Meta || !DD.Combat || !DD.UI.screens.combat) { t.skip('run layer, engine or combat HUD missing'); return; }
    if (!ids.every(function (id) { return DD.getHero(id); }) || !DD.getEncounter('test_a1_normal')) { t.skip('tests/fixtures.js not loaded'); return; }
    const UI = DD.UI;
    const useUi = DD.Run.useUi;
    const meta = DD.util.deepClone(DD.Meta.data);
    const s = UI.settings();
    const unlock = s.unlockAll;
    UI.init();
    reset();
    try {
      DD.Run.useUi = true;
      s.unlockAll = true;
      DD.Run.newRun(ids, 'normal', 4343);
      s.unlockAll = unlock;
      t.tryRun('start fight', function () { DD.Run.startCombat('test_a1_normal', 'normal'); });
      const live = DD.Combat.state;
      t.eq(UI.current, 'combat', 'the fight is on screen');
      // v2 engine: endTurn ends one hero's turn in initiative order; endRound passes the rest of the round
      t.tryRun('end round 1', function () { (DD.Combat.endRound || DD.Combat.endTurn).call(DD.Combat); });
      t.eq(live.round, 2, 'the fight reached round 2');
      t.tryRun('quit to title', function () { UI.show('title'); });
      const cont = titleButton(/Continue/);
      t.ok(cont, 'the title offers Continue');
      if (cont) t.tryRun('continue', function () { cont.click(); });
      t.eq(UI.current, 'combat', 'Continue goes back to the fight');
      t.ok(DD.Combat.state === live, 'it is the same fight, not a restart');
      t.eq(DD.Combat.state && DD.Combat.state.round, 2, 'still in round 2');
      t.ok(DD.HUD && DD.HUD.mounted() && DD.HUD.lock() === null, 'the HUD took the fight back and accepts input');
      // a fresh page has no live run: Continue loads the save and the interrupted fight starts over
      t.tryRun('quit again', function () { UI.show('title'); });
      DD.Run.state = null;
      const cont2 = titleButton(/Continue/);
      if (cont2) t.tryRun('continue from the save', function () { cont2.click(); });
      t.eq(UI.current, 'combat', 'Continue from the save relaunches the fight');
      // (v2 engine: a fresh fight sits in deployment, round 0, until initiative is rolled)
      t.ok(DD.Combat.state && DD.Combat.state !== live && DD.Combat.state.round <= 1, 'the relaunched fight starts over (round ' + (DD.Combat.state && DD.Combat.state.round) + ')');
      // storage unavailable (private mode, file:// restrictions): the live run can still be continued
      DD.Storage.remove(DD.Run.SAVE_KEY || 'run');
      t.tryRun('quit without a save', function () { UI.show('title'); });
      t.ok(titleButton(/Continue/), 'Continue is offered for the live run even without a save');
    } finally {
      s.unlockAll = unlock;
      DD.Run.useUi = useUi;
      DD.Run.state = null;
      DD.Storage.remove(DD.Run.SAVE_KEY || 'run');
      DD.Meta.data = meta;
      if (DD.Meta.save) DD.Meta.save();
      reset();
      UI.show('title');
    }
  });

  // ---- UI polish ----------------------------------------------------------------------------------------------------
  function tipOf(node) { const c = node && node._ddTip ? node._ddTip.content : null; return typeof c === 'function' ? c(node) : c || ''; }
  /** A run with these real heroes (UI on), restored by the caller's finally through endRun(t). */
  function runWith(t, ids) {
    if (!DD.Run || ids.some(function (id) { return !DD.getHero(id); })) { t.skip('heroes ' + ids.join(', ') + ' not registered'); return null; }
    if (!useUiForced) { useUiBefore = DD.Run.useUi; useUiForced = true; }
    DD.Run.useUi = true;
    const s = DD.UI.settings();
    const had = s.unlockAll;
    s.unlockAll = true;
    t.tryRun('Run.newRun', function () { DD.Run.newRun(ids, 'normal', 5150); });
    s.unlockAll = had;
    resolveRollModals(t);
    return DD.UI.run();
  }
  function skillCardNamed(name) { return qa('.skill-card').filter(function (c) { const n = c.querySelector('.sc-name'); return n && n.textContent === name; })[0] || null; }

  T.suite('ui: out-of-combat skill text and costs follow items and Blessings (party screen)', function (t) {
    const UI = DD.UI;
    if (!DD.getPassive || !DD.getPassive('rp_cursed_blood_pact') || !DD.getItem('jos_beak_mask') || !DD.getSkill('zar_fireball') || !DD.getSkill('jos_plague_flask')) { t.skip('real heroes / items / Blessings not registered'); return; }
    const meta = DD.util.deepClone(DD.Meta.data);
    try {
      const run = runWith(t, ['zarathor', 'josiah', 'syllamin', 'marwyn']);
      if (!run) return;
      const fb = DD.getSkill('zar_fireball');
      const listed = UI.skillInfo('zar_fireball', 1).ap;
      t.ok(listed >= 2, 'Gold-Plated Fireball is listed at ' + listed + ' AP');
      run.party[0].passives = [];
      DD.Run.addPassive(0, 'rp_cursed_blood_pact', 1);
      const info = UI.skillInfo('zar_fireball', 1, run.party[0]);
      t.eq(info.baseAp, listed, 'baseAp keeps the listed cost');
      t.eq(info.ap, listed - 1, 'a RunHero is described through its sheet unit: the Blood Pact takes 1 AP off');
      t.ok(UI.skillCostNotes(info).some(function (n) { return /Unread Blood Pact/.test(n); }), 'the cost note names the Blessing: ' + UI.skillCostNotes(info).join(' | '));
      t.ok(UI.sheetUnit(run.party[0]) && UI.sheetUnit(run.party[0]).sheet === true, 'the sheet unit is a stand-in combat unit (never placed)');
      UI.show('party', { hero: 0 });
      const card = skillCardNamed(fb.name);
      const ap = card && card.querySelector('.pill.ap');
      t.ok(ap && ap.textContent.indexOf((listed - 1) + ' AP') === 0 && ap.querySelector('s') && ap.querySelector('s').textContent === String(listed), 'party screen: "' + (listed - 1) + ' AP" with the listed ' + listed + ' struck (' + (ap && ap.textContent) + ')');
      t.ok(/Unread Blood Pact/.test(tipOf(card)), 'its tooltip says why');
      // item bonuses reach the text: Josiah's Beak Mask adds 1 Poison to what he applies
      const base = DD.skillDesc(DD.getSkill('jos_plague_flask'), 1, null);
      const before = UI.skillInfo('jos_plague_flask', 1, run.party[1]).desc;
      t.eq(before, base, 'without the mask the text is the base text');
      DD.Run.addItem('jos_beak_mask');
      DD.Run.equip(1, 'jos_beak_mask');
      const after = UI.skillInfo('jos_plague_flask', 1, run.party[1]).desc;
      t.ok(after !== before, 'with the Beak Mask the text changes: ' + after);
      UI.show('party', { hero: 1 });
      const pf = skillCardNamed(DD.getSkill('jos_plague_flask').name);
      t.ok(pf && pf.querySelector('.sc-desc') && pf.querySelector('.sc-desc').textContent === after, 'the party screen card shows the item-adjusted text');
      // the cache follows gear changes
      DD.Run.unequip(1, 'armor');
      t.eq(UI.skillInfo('jos_plague_flask', 1, run.party[1]).desc, base, 'unequipped: back to the base text');
    } finally {
      endRun(t);
      DD.Meta.data = meta;
      DD.Meta.save();
    }
  });

  T.suite('ui: shop re-roll picker — rarity colours and hotkeys past 9', function (t) {
    const UI = DD.UI;
    if (!DD.Passives || DD.Passives.count() < 16 || !contentComplete()) { t.skip('needs the real Blessing table and heroes'); return; }
    const meta = DD.util.deepClone(DD.Meta.data);
    try {
      const run = makeRun(t);
      if (!run) return;
      resolveRollModals(t);
      const pool = DD.Passives.defs().filter(function (d) { return !d.requires; });
      const byRarity = {};
      pool.forEach(function (d) { (byRarity[d.rarity] = byRarity[d.rarity] || []).push(d); });
      const pick = [];
      for (let r = 0; pick.length < 16 && r < 40; r++) Object.keys(byRarity).forEach(function (k) { const d = byRarity[k][r]; if (d && pick.length < 16 && pick.indexOf(d) < 0) pick.push(d); });
      run.party.forEach(function (rh, i) { rh.passives = []; for (let k = 0; k < 4; k++) DD.Run.addPassive(i, pick[i * 4 + k].id, 1); });
      run.gold = 500;
      UI.show('shop', { debug: true });
      const row = qa('.keeper-services .ks-row').filter(function (r) { return /Re-roll/.test(r.textContent); })[0];
      t.ok(row, 'the shop offers the Blessing re-roll');
      if (!row) return;
      row.querySelector('.btn.buy').click();
      const m = modalEl();
      t.ok(m && m.classList.contains('modal-reroll'), 'the picker opens');
      const opts = Array.prototype.slice.call(m.querySelectorAll('.choice-option'));
      t.eq(opts.length, 16, 'a full party: 16 Blessings to choose from');
      const keys = opts.map(function (o) { return o.querySelector('.co-key').textContent; }).join(' ');
      t.eq(keys, '1 2 3 4 5 6 7 8 9 0 A B C D E F', 'hotkeys 1-9, 0, then letters');
      t.ok(opts.every(function (o) { return /\brarity-(common|uncommon|rare|legendary|cursed)\b/.test(o.className) && o.style.getPropertyValue('--rc'); }), 'every card wears its rarity class and colour');
      const rars = {};
      opts.forEach(function (o) { rars[o.className.match(/rarity-(\w+)/)[1]] = 1; });
      t.ok(Object.keys(rars).length >= 3, 'several rarities side by side: ' + Object.keys(rars).join(', '));
      const target = opts[12];
      const label = target.querySelector('.co-label').textContent;
      const gold0 = run.gold;
      key('c');
      t.ok(!m.isConnected, 'C picked the 13th card and closed the picker');
      t.ok(run.gold < gold0, 'and paid for the re-roll (' + gold0 + ' → ' + run.gold + ')');
      const heroIdx = 3, gone = pick[12].id;
      t.ok(!(run.party[heroIdx].passives || []).some(function (p) { return p.id === gone; }), 'the 13th Blessing (' + label + ') was tossed');
      resolveRollModals(t);
    } finally {
      endRun(t);
      DD.Meta.data = meta;
      DD.Meta.save();
    }
  });

  T.suite('ui: the level-up subtitle is the DM\'s level_up line', function (t) {
    const UI = DD.UI;
    return uiSandbox(t, function () {
      const meta = DD.util.deepClone(DD.Meta.data);
      try {
        const run = makeRun(t);
        if (!run) return;
        resolveRollModals(t);
        DD.Run.levelUp(0);
        UI.show('levelup', { queue: [0] });
        const sub = q('.lu-status .narration');
        const lines = ((DD.defs.narration || {}).level_up || []).concat(['Level up! The DM reluctantly turns the page of your character sheet.', 'Numbers are going up. The DM is taking notes.']);
        t.ok(sub && sub.querySelector('.dm-badge') && lines.indexOf(sub.querySelector('.narr-text').textContent) >= 0, 'the subtitle under "Level Up!" is a level_up line with the DM badge: ' + (sub && sub.textContent));
        t.ok(q('.lu-bottom .lu-step') && q('.lu-bottom .lu-lineup'), 'the step text sits with the lineup at the bottom');
        t.ok(/rolls on the Table|choosing a boon|found a skill tome/.test(q('.lu-step').textContent), 'and names what the hero is doing: ' + q('.lu-step').textContent);
        let guard = 0;
        while (DD.UI.topModal() && guard++ < 20) {
          if (resolveRollModals(t)) continue;
          const opt = modalEl().querySelector('.choice-option:not(.is-disabled)');
          if (opt) opt.click(); else DD.UI.closeAllModals('test');
        }
      } finally {
        endRun(t);
        DD.Meta.data = meta;
        DD.Meta.save();
      }
    });
  });

  T.suite('ui: event choices accept (run) => string labels and hints', function (t) {
    const UI = DD.UI;
    const id = 'ui_fn_labels';
    return uiSandbox(t, function () {
      const meta = DD.util.deepClone(DD.Meta.data);
      try {
        const run = makeRun(t);
        if (!run) return;
        resolveRollModals(t);
        DD.registerEvent({
          id: id, acts: [1, 2, 3], weight: 0, icon: '🧮', title: 'The Sliding Scale', text: 'Prices scale with the act.',
          choices: [
            { label: function (r) { return 'Pay ' + (r.act * 10) + ' gold.'; }, hint: function (r) { return 'Act ' + r.act + ' prices.'; }, resolve: function (api) { api.gold(-10); return 'Paid.'; } },
            { label: 'Haggle.', hint: null, resolve: function () { return 'The goblin is unmoved.'; } },
          ],
        });
        t.ok(DD.Run.openEvent(id), 'event opened');
        const cur = DD.Run.currentEvent();
        t.eq(cur.choices[0].label, 'Pay 10 gold.', 'currentEvent() calls a function label with the run');
        t.eq(cur.choices[0].hint, 'Act 1 prices.', '... and a function hint');
        t.eq(cur.choices[1].hint, '', 'a missing hint is ""');
        t.eq(UI.current, 'event', 'event screen shown');
        const labels = qa('.ev-choice .evc-label').map(function (n) { return n.textContent; });
        t.eq(labels[0], 'Pay 10 gold.', 'the screen shows the label text');
        t.eq(q('.ev-choice .evc-hint') && q('.ev-choice .evc-hint').textContent, 'Act 1 prices.', '... and the hint text');
        qa('.ev-choice')[0].click();
        t.ok(q('.ev-picked') && q('.ev-picked').textContent.indexOf('Pay 10 gold.') >= 0, 'the picked line repeats the label text');
      } finally {
        delete DD.defs.events[id];
        endRun(t);
        DD.Meta.data = meta;
        DD.Meta.save();
      }
    });
  });

  T.suite('ui: the act-1 map names each hero\'s Session Zero quirk', function (t) {
    const UI = DD.UI;
    if (!DD.Passives || DD.Passives.count() < 1) { t.skip('no Blessings registered'); return; }
    return uiSandbox(t, function () {
      const meta = DD.util.deepClone(DD.Meta.data);
      try {
        const run = makeRun(t);
        if (!run) return;
        resolveRollModals(t);
        UI.show('map', { act: 1 });
        const blessed = run.party.filter(function (rh) { return !rh.dead && (rh.passives || []).length; });
        t.ok(blessed.length > 0, 'Session Zero rolled Blessings');
        const rows = qa('.map-narration .sz-quirks .sz-hero');
        t.eq(rows.length, blessed.length, 'one entry per hero with a quirk');
        t.ok(rows.every(function (r, i) { return r.querySelector('.sz-name').textContent === UI.heroName(blessed[i]) && r.querySelector('.passive-chip'); }), 'each names the hero and shows the Blessing chip');
        t.ok(/Table of Questionable Blessings/.test(tipOf(q('.sz-quirks .sz-head'))), 'the heading explains what a quirk is');
        // once the party has moved on, the map is just the map
        run.nodeId = Object.keys(run.map.nodes)[0];
        UI.show('map', { act: 1 });
        t.eq(qa('.sz-quirks').length, 0, 'no quirk line after the first step');
      } finally {
        endRun(t);
        DD.Meta.data = meta;
        DD.Meta.save();
      }
    });
  });

  T.suite('ui: UI.narrate skips lines with unfilled tokens', function (t) {
    const UI = DD.UI;
    const k = 'ui_test_tokens';
    try {
      DD.registerNarration(k, ['{hero} trips over a mimic.', 'Somebody trips over a mimic.']);
      const seen = {};
      for (let i = 0; i < 40; i++) seen[UI.narrate(k, {})] = 1;
      t.eq(Object.keys(seen).join('|'), 'Somebody trips over a mimic.', 'without vars only the token-free line is used');
      const both = {};
      for (let i = 0; i < 80; i++) both[UI.narrate(k, { hero: 'Marwyn' })] = 1;
      t.ok(both['Marwyn trips over a mimic.'] && both['Somebody trips over a mimic.'], 'with vars every line is usable and filled');
      DD.registerNarration(k + '_2', ['{gold} gold, says {name}.']);
      t.eq(UI.narrate(k + '_2', {}, ['Fallback {hero}', 'Plain fallback.']), 'Plain fallback.', 'nothing usable: the fallback (also token-checked)');
      t.eq(UI.narrate(k + '_2', {}, []), '', 'nothing at all: ""');
    } finally {
      delete DD.defs.narration[k];
      delete DD.defs.narration[k + '_2'];
    }
  });

  // ---- v2 leveling (no XP: one hero levels up per won fight, the lowest level first) ----------------------------------
  const V2SWAP = ['heroes', 'skills', 'items', 'consumables', 'events', 'encounters', 'passives'];
  const V2PARTY = ['ui_a', 'ui_b', 'ui_c', 'ui_d'];

  /** A scripted stand-in for DD.Combat / DD.Encounter (the run layer only needs start / build and the end state). */
  function v2Engine() {
    const eng = { starts: [] };
    eng.Encounter = {
      build: function (def, party) {
        return { grid: null, theme: 'cellar', encounter: def, objective: { type: 'killAll' }, rules: [], deployTiles: [], reinforcements: [],
          heroes: party.map(function (rh, i) { return { runHero: rh, x: i, y: 0 }; }), enemies: [] };
      },
    };
    eng.Combat = {
      start: function (setup, opts) {
        const st = { id: 'uifake' + eng.starts.length, result: null, run: opts.run, stats: { units: {} },
          units: setup.heroes.map(function (h, i) { return { id: 'h' + i, kind: 'hero', side: 'hero', defId: h.runHero.id, runHero: h.runHero, hp: h.runHero.hp, downed: false, dead: false }; }) };
        eng.starts.push({ opts: opts, state: st });
        return st;
      },
    };
    eng.last = function () { return eng.starts[eng.starts.length - 1]; };
    return eng;
  }

  /** fn(eng) with test heroes (ui_*), encounters, a 2-entry Blessing table, a fake engine and the UI on; restored after. */
  async function v2Sandbox(t, fn) {
    if (!DD.Run || !DD.Rewards || !DD.RunMap || !DD.Meta || !DD.UI.screens.rewards) { t.skip('run layer / screens not available yet'); return; }
    const UI = DD.UI;
    const saved = {};
    V2SWAP.forEach(function (k) { saved[k] = DD.defs[k]; DD.defs[k] = {}; });
    const savedCombat = DD.Combat, savedEnc = DD.Encounter, savedUi = DD.Run.useUi;
    const savedMeta = DD.util.deepClone(DD.Meta.data);
    const eng = v2Engine();
    try {
      registerUiContent();
      [1, 2, 3].forEach(function (act) {
        ['normal', 'elite', 'boss'].forEach(function (kind) {
          DD.registerEncounter({ id: 'ui_enc_' + act + '_' + kind, act: act, kind: kind, name: 'UI ' + kind + ' fight', map: { theme: 'cellar', w: 8, h: 8 }, enemies: [{ id: 'ui_enemy', n: 2 }], reward: { goldMult: 1 } });
        });
      });
      DD.registerPassive({ id: 'test_rp_ui_pebble', name: 'UI Lucky Pebble', icon: '🪨', rarity: 'common', levels: [{ a: 1 }, { a: 2 }], stats: function (L) { return { armor: L.a }; }, desc: function (L) { return '+' + L.a + ' armor.'; } });
      DD.registerPassive({ id: 'test_rp_ui_socks', name: 'UI Loud Socks', icon: '🧦', rarity: 'common', levels: [{}], desc: 'Very loud. Does nothing.' });
      Object.keys(saved.events).forEach(function (id) { if (saved.events[id].fallback) DD.defs.events[id] = saved.events[id]; });
      DD.Combat = eng.Combat;
      DD.Encounter = eng.Encounter;
      DD.Meta.reset(false);
      DD.Meta.data.settings.unlockAll = true;
      DD.Run.state = null;
      DD.Storage.remove(DD.Run.SAVE_KEY || 'run');
      DD.Run.useUi = true;
      UI.init();
      reset();
      await fn(eng);
    } finally {
      reset();
      V2SWAP.forEach(function (k) { DD.defs[k] = saved[k]; });
      DD.Combat = savedCombat;
      DD.Encounter = savedEnc;
      DD.Run.useUi = savedUi;
      DD.Run.state = null;
      DD.Storage.remove(DD.Run.SAVE_KEY || 'run');
      DD.Meta.data = savedMeta;
      DD.Meta.save();
      UI.show('title');
    }
  }

  /** Win a fight on the next map node the way the HUD hands it over: the fake engine has no board, so the screens stay
   *  off while it starts, then DD.Run.finishCombat shows the rewards screen. Returns finishCombat's result. */
  function v2Fight(eng, kind) {
    const s = DD.Run.state;
    const node = DD.Run.availableNodes()[0];
    node.type = kind === 'elite' || kind === 'boss' ? kind : 'combat';
    node.encounterId = 'ui_enc_' + s.act + '_' + (kind || 'normal');
    DD.Run.useUi = false;
    try { DD.Run.travel(node.id); } finally { DD.Run.useUi = true; }
    return DD.Run.finishCombat('victory', eng.last().state);
  }
  /** Click through the level-up screen (Blessing rolls, boons, the forget picker) until no modal is left. */
  async function v2LevelUps(t) {
    let guard = 0;
    while (DD.UI.topModal() && guard++ < 24) {
      if (resolveRollModals(t)) continue;
      const opts = modalEl().querySelectorAll('.choice-option:not(.is-disabled), .rp-grid .skill-card');
      if (!opts.length) break;
      t.tryRun('pick a level-up option', function () { opts[opts.length - 1].click(); });
    }
    await tick(20);
  }
  function v2Levels() { return DD.Run.state.party.map(function (h) { return h.level; }).join(','); }
  function json(v) { return JSON.stringify(v); }
  function noXpText(t, label) {
    const r = root();
    t.ok(r && !/\bXP\b/.test(r.textContent), label + ': no "XP" on screen');
  }

  T.suite('ui: v2 leveling — the rewards screen announces the level-up (the DM\'s d4), no XP anywhere, Continue levels only that hero', function (t) {
    return v2Sandbox(t, async function (eng) {
      const UI = DD.UI;
      DD.Run.newRun(V2PARTY, 'normal', 777);
      t.eq(UI.current, 'map', 'the run starts on the map');
      noXpText(t, 'map');
      t.eq(qa('.xpbar').length, 0, 'map: no XP bars');
      const side = q('.side-next');
      t.ok(side && /anyone \(the DM rolls a d4\)/.test(side.textContent), 'the sidebar: the next level-up can go to anyone (' + (side && side.textContent) + ')');
      t.eq(qa('.hero-mini.next-level').length, 0, 'no 🎲 markers while the whole party is level');
      t.ok(qa('.side-party .hero-mini').every(function (m) { return !/\bXP\b/.test(tipOf(m)); }), 'hero tooltips carry no XP');
      const out = v2Fight(eng, 'normal');
      t.ok(out && out.outcome === 'rewards' && UI.current === 'rewards', 'a won fight shows the rewards screen');
      const lu = DD.Run.rewards().levelUps[0];
      const name = UI.heroName(DD.Run.state.party[lu.heroIdx]);
      const row = q('.rw-level .rwl-row');
      t.ok(row && row.classList.contains('d4') && row.classList.contains('landed'), 'the level-up: a d4, landed at once headless');
      t.ok(/The DM rolls a d4/.test(q('.rwl-lead').textContent), 'lead: ' + q('.rwl-lead').textContent);
      t.eq(q('.rwl-result b').textContent, lu.face + '! ' + name + ' levels up!', 'the result names the face and the hero');
      t.ok(/Level 1 → 2/.test(q('.rwl-result').textContent), 'and the level');
      t.eq(q('.rwl-face').textContent, String(lu.face), 'the die shows the face');
      t.eq(qa('.rwl-hero').length, 4, 'the lineup shows the four heroes');
      const won = qa('.rwl-hero.won');
      t.ok(won.length === 1 && won[0].querySelector('.rwl-hname').textContent === name, 'the winner is highlighted');
      t.ok(won.length === 1 && won[0].querySelector('.rwl-facebadge').textContent === String(lu.face) && /Lv 1 → 2/.test(won[0].textContent), 'its badge matches the die; Lv 1 → 2');
      t.eq(qa('.rwl-hero .rwl-facebadge').length, 4, 'every candidate wears its face number');
      const others = DD.Run.state.party.filter(function (h, i) { return i !== lu.heroIdx; }).map(function (h) { return UI.heroName(h); });
      const next = q('.rwl-next');
      t.ok(next && others.every(function (n) { return next.textContent.indexOf(n) >= 0; }) && next.textContent.indexOf(name) < 0, 'next level-up: random among the three others (' + (next && next.textContent) + ')');
      noXpText(t, 'rewards');
      t.eq(qa('.xpbar, .rw-xp, .rw-stat.xp, .rwh-gain').length, 0, 'no XP bars, XP stat or XP gains');
      // take loot, Continue → the level-up flow for that hero only
      const choices = DD.Run.rewards().choices;
      const pickIdx = choices.findIndex(function (c) { return c.type !== 'skill' && c.type !== 'consumable'; });
      if (pickIdx >= 0) qa('.reward-card')[pickIdx].click(); else DD.Run.skipRewards();
      if (pickIdx < 0) UI.refresh();
      const cont = q('.rw-actions .btn.primary');
      t.ok(cont && /Level Up/.test(cont.textContent), 'Continue — Level Up!');
      if (cont) cont.click();
      t.eq(UI.current, 'levelup', 'the level-up screen follows');
      const active = q('.lu-hero.active .lu-name');
      t.ok(active && active.textContent === name, 'it is ' + name + '\'s turn (' + (active && active.textContent) + ')');
      t.eq(qa('.lu-pending').length, 1, 'only one hero has anything pending');
      const rolled = resolveRollModals(t);
      t.eq(rolled, 1, 'one Blessing roll for the one level gained');
      t.ok(UI.topModal() && modalEl().querySelectorAll('.choice-option').length === 3, 'then one boon with three choices');
      await v2LevelUps(t);
      t.eq(UI.current, 'map', 'back on the map');
      t.ok(!DD.Run.hasPendingChoices(), 'nothing left to choose');
      const marked = qa('.hero-mini.next-level');
      t.eq(marked.length, 3, 'three 🎲 markers: the heroes still at level 1');
      t.ok(marked.every(function (m) { return m.querySelector('.hm-name span').textContent !== name; }), 'the leveled hero is not marked');
      t.ok(/random among/.test(q('.side-next').textContent), 'sidebar: ' + q('.side-next').textContent);
      // three more fights: everyone reaches level 2 before anyone reaches 3
      const order = [lu.heroIdx];
      for (let k = 0; k < 3; k++) {
        v2Fight(eng);
        const l = DD.Run.rewards().levelUps[0];
        t.ok(l.from === 1 && order.indexOf(l.heroIdx) < 0, 'fight ' + (k + 2) + ': a level-1 hero levels up (' + UI.heroName(DD.Run.state.party[l.heroIdx]) + ')');
        order.push(l.heroIdx);
        t.ok(q('.rwl-row').classList.contains(k === 2 ? 'no-roll' : 'd' + (3 - k)), 'the die shrinks with the candidates (' + q('.rwl-row').className + ')');
        if (k === 2) t.ok(/nothing to roll/.test(q('.rwl-lead').textContent), 'the last one: nothing to roll');
        if (k === 0) t.ok(/coin|d3/.test(q('.rwl-lead').textContent), 'a d3 for three candidates: ' + q('.rwl-lead').textContent);
        if (k === 1) t.ok(/flips a coin/.test(q('.rwl-lead').textContent) && /^(Heads|Tails)!/.test(q('.rwl-result b').textContent), 'a coin for two: ' + q('.rwl-result b').textContent);
        DD.Run.skipRewards();
        DD.Run.next();
        await v2LevelUps(t);
      }
      t.eq(v2Levels(), '2,2,2,2', 'all four at level 2');
      t.eq(UI.current, 'map', 'on the map');
      t.ok(/anyone/.test(q('.side-next').textContent), 'and the next level-up can go to anyone again');
    });
  });

  T.suite('ui: v2 leveling — map, party, tavern and run bar show levels and who is next; a recruit joins at the lowest level', function (t) {
    return v2Sandbox(t, async function () {
      const UI = DD.UI;
      DD.Run.newRun(V2PARTY, 'normal', 778);
      DD.Run.levelUp(0);
      DD.Run.levelUp(1);
      [0, 1].forEach(function (i) { DD.Run.autoResolveRolls(i); DD.Run.applyLevelChoice(i, 2, -1); });
      t.ok(!DD.Run.hasPendingChoices(), 'two heroes at level 2, nothing pending');
      const R = DD.Run.state;
      const C = UI.heroName(R.party[2]), D = UI.heroName(R.party[3]);
      UI.show('map');
      t.eq(q('.side-next').textContent.replace('🎲', '').trim(), 'Next level-up: random among ' + C + ' and ' + D + '.', 'map sidebar names the two heroes behind');
      const rows = qa('.side-party .hero-mini');
      t.ok(rows[2].classList.contains('next-level') && rows[3].classList.contains('next-level') && !rows[0].classList.contains('next-level'), '🎲 on the heroes behind only');
      t.ok(/In the running for the next level-up/.test(tipOf(rows[2])), 'a candidate\'s tooltip: ' + tipOf(rows[2]).replace(/<[^>]+>/g, ' ').slice(0, 160));
      t.ok(tipOf(rows[0]).indexOf('random among') >= 0 && !/\bXP\b/.test(tipOf(rows[0])), 'a hero ahead: who is next, no XP');
      noXpText(t, 'map');
      // party screen
      UI.show('party', { back: 'map', hero: 2 });
      const sn = q('.sheet-next');
      t.ok(sn && sn.classList.contains('in-running') && /In the running for the next level-up \(the DM rolls among 2\)/.test(sn.textContent), 'party sheet of a candidate: ' + (sn && sn.textContent));
      t.ok(/🎲/.test(qa('.hero-tab')[2].textContent) && !/🎲/.test(qa('.hero-tab')[0].textContent), 'the hero tabs mark who is next');
      t.eq(qa('.xpbar').length, 0, 'party: no XP bar');
      t.ok(!/Starting Block/.test(root().textContent), 'no "Starting Block" stat (nobody starts a fight with Block in v2)');
      t.ok(qa('.sheet-stat').some(function (r) { return /Initiative/.test(r.textContent); }), 'the sheet shows the initiative modifier');
      noXpText(t, 'party');
      UI.show('party', { back: 'map', hero: 0 });
      t.ok(/Next level-up: random among/.test(q('.sheet-next').textContent) && !q('.sheet-next').classList.contains('in-running'), 'a hero ahead: ' + q('.sheet-next').textContent);
      // tavern: the run bar marks who is next; recruits join at the lowest level
      UI.show('tavern', {});
      t.eq(qa('.run-bar .rb-hero.next-level').length, 2, 'run bar: two 🎲 markers');
      t.ok(/In the running/.test(tipOf(qa('.run-bar .rb-hero')[3])), 'run bar tooltip says who is in the running');
      t.ok(/lowest level/.test(q('.tav-option.k-recruit .to-desc').textContent), 'recruit option: ' + q('.tav-option.k-recruit .to-desc').textContent);
      noXpText(t, 'tavern');
      q('.tav-option.k-recruit .btn').click();
      const leave = modalEl() && modalEl().querySelectorAll('.choice-option');
      t.ok(leave && leave.length === 4, 'who leaves: the four heroes');
      if (leave) leave[0].click(); // a level-2 hero leaves
      const join = modalEl();
      t.ok(join && /join at level 1 \(the lowest level of the heroes who stay\)/.test(join.textContent), 'who joins: the level the recruit gets');
      const opt = join && join.querySelector('.choice-option');
      if (opt) opt.click();
      t.ok(R.party[0].id === 'ui_e' && R.party[0].level === 1 && !('xp' in R.party[0]), 'UI Hero E joins at level 1 (the lowest of those who stay)');
      t.ok(/joins at level 1/.test(q('.tav-result').textContent), 'the tavern result says so: ' + q('.tav-result').textContent);
      t.eq(json(DD.Run.levelUpCandidates()), json([0, 2, 3]), 'the recruit is in the running with the other level-1 heroes');
    });
  });

  T.suite('ui: v2 leveling — event level-ups show as chips; an XP-era rewards screen renders without XP', function (t) {
    return v2Sandbox(t, async function (eng) {
      const UI = DD.UI;
      DD.Run.newRun(V2PARTY, 'normal', 779);
      t.ok(DD.Run.openEvent('ui_ev'), 'event opened');
      qa('.ev-choice')[0].click(); // api.gold(20); api.damage(3); api.xp(5): one level-up through the rotation
      const chips = qa('.ev-changes .change-chip').map(function (c) { return c.textContent; });
      const up = DD.Run.state.party.filter(function (h) { return h.level === 2; });
      t.eq(up.length, 1, 'the event leveled one hero');
      t.ok(chips.some(function (c) { return c.indexOf(UI.heroName(up[0]) + ' levels up to 2') >= 0; }), 'a chip names the level-up: ' + chips.join(' | '));
      t.ok(chips.every(function (c) { return !/\bXP\b/.test(c); }), 'no XP chips');
      noXpText(t, 'event outcome');
      q('.ev-actions .btn').click();
      t.eq(UI.current, 'levelup', 'Continue → that hero\'s level-up');
      await v2LevelUps(t);
      t.eq(UI.current, 'map', 'then the map');
      // an XP-era rewards screen (old save): no XP shown, no level-up block
      v2Fight(eng);
      DD.Run.save();
      const raw = JSON.parse(JSON.stringify(DD.Storage.get(DD.Run.SAVE_KEY)));
      raw.party.forEach(function (h) { h.xp = 37; });
      raw.pending.data.xp = 10;
      raw.pending.data.xpByHero = { 0: 10, 1: 5, 2: 10, 3: 10 };
      delete raw.pending.data.levelUps;
      DD.Storage.set(DD.Run.SAVE_KEY, raw);
      DD.Run.state = null;
      UI.show('title');
      t.ok(DD.Run.load(), 'the XP-era save loads');
      t.eq(DD.Run.resume(), 'rewards', 'resumes on the rewards screen');
      t.eq(UI.current, 'rewards', 'rewards shown');
      noXpText(t, 'old rewards screen');
      t.ok(q('.rw-level') && q('.rw-level').style.display === 'none', 'no level-up block for a screen without level-up records');
      t.eq(qa('.reward-card').length, 3, 'the loot is still there');
    });
  });

  // ---- v2: every hero available; the real game page in a frame of an exact size ---------------------------------------
  // V3: the hero count is the registry's (UI.heroIds(): the registered non-test heroes), never a literal, so a 17th (or
  // an 18th) hero breaks nothing here
  const NEW_HEROES = ['kiri', 'betty', 'basanos', 'valdris', 'hjalmar', 'pebbles'];
  // V3: the 17th hero joins after the v2 six (plan §4.12: "he arrives last, obviously")
  const V3_HEROES = ['benedick'];
  const SIZES = [[1024, 640], [1280, 720], [1600, 900], [1920, 1080]];

  /**
   * V3 (plan §4.12, §8.4): until Benedick registers (and for an 18th hero after him), the fit suite pads the frame's
   * roster with cloned heroes up to `n`: the clone carries the longest role, name, race, class and epithet of the
   * roster, the worst case for a card (the V3 review added race / class / epithet: Benedick's two-line "Snail (Dragon,
   * Allegedly) Knight of the Margins" overflowed the Hall at 1600×900 while the role-only clones fit). Returns the ids
   * added (unpadHeroes removes them).
   */
  function padHeroes(W, n) {
    const ids = W.DD.UI.heroIds();
    const defs = ids.map(function (id) { return W.DD.getHero(id); });
    const byLen = function (k) { return defs.slice().sort(function (a, b) { return String(b[k] || '').length - String(a[k] || '').length; })[0]; };
    const role = byLen('role');
    const worst = { name: byLen('name').name, race: byLen('race').race, cls: byLen('cls').cls, epithet: byLen('epithet').epithet };
    const added = [];
    for (let k = 0; W.DD.UI.heroIds().length < n && k < 8; k++) {
      const id = 'zzpad' + k;
      W.DD.registerHero(Object.assign({}, role, worst, { id: id, unlock: null }));
      added.push(id);
    }
    return added;
  }
  function unpadHeroes(W, ids) { ids.forEach(function (id) { delete W.DD.defs.heroes[id]; }); }

  /** The real game (index.html — js/main.js boots there, debug URL params work) in an iframe of exactly w × h px. */
  function gameFrame(query, w, h) {
    return new Promise(function (resolve) {
      const f = document.createElement('iframe');
      f.style.cssText = 'position:fixed;left:0;top:0;border:0;opacity:0;pointer-events:none;width:' + w + 'px;height:' + h + 'px';
      let done = false;
      const finish = function () { if (!done) { done = true; resolve(f); } };
      f.onload = finish;
      setTimeout(finish, 20000);
      f.src = '../index.html?' + query;
      document.body.appendChild(f);
    });
  }
  async function frameUntil(fn, ms) {
    const end = Date.now() + (ms || 10000);
    while (Date.now() < end) { let ok = false; try { ok = !!fn(); } catch (e) { ok = false; } if (ok) return true; await tick(50); }
    return false;
  }
  /** Layout problems of `cards` (elements) inside a frame: descendants outside their card, cut text. → [string] */
  function cardProblems(W, cards, textSel) {
    const bad = [];
    cards.forEach(function (c) {
      const b = c.getBoundingClientRect();
      c.querySelectorAll('*').forEach(function (n) {
        const cs = W.getComputedStyle(n);
        if (cs.display === 'none' || cs.visibility === 'hidden') return;
        const r = n.getBoundingClientRect();
        if (!r.width || !r.height) return;
        if (r.top < b.top - 1 || r.bottom > b.bottom + 1 || r.left < b.left - 1 || r.right > b.right + 1) bad.push((n.className || n.tagName) + ' sticks out of ' + (c.dataset.id || c.textContent.slice(0, 16)));
      });
      c.querySelectorAll(textSel).forEach(function (n) {
        const cs = W.getComputedStyle(n);
        const label = '"' + n.textContent.trim().slice(0, 30) + '"';
        // a clipping box (ellipsis, line clamp): its content must fit; a visible one: its text must stay in the card
        if (/hidden|clip/.test(cs.overflowX + cs.overflowY)) {
          if (n.scrollWidth > n.clientWidth + 1 || n.scrollHeight > n.clientHeight + 1) bad.push('cut text ' + label);
        } else {
          const rg = n.ownerDocument.createRange();
          rg.selectNodeContents(n);
          const r = rg.getBoundingClientRect();
          if (r.width && (r.left < b.left - 1 || r.right > b.right + 1 || r.top < b.top - 1 || r.bottom > b.bottom + 1)) bad.push('text out of its card ' + label);
        }
      });
      if (b.bottom > W.innerHeight + 1 || b.right > W.innerWidth + 1) bad.push('off screen: ' + c.textContent.trim().slice(0, 16));
    });
    return bad;
  }

  T.suite('ui: v2 — every registered hero is in UI.HERO_ORDER, all available: party select and the hall roster list everyone, no lock UI', function (t) {
    const UI = DD.UI;
    UI.init();
    reset();
    t.ok(NEW_HEROES.every(function (id) { return UI.HERO_ORDER.indexOf(id) >= 10; }), 'Kiri, Betty, Basanos, Valdris, Hjalmar and Pebbles join after the original ten');
    const lastV2 = Math.max.apply(null, NEW_HEROES.map(function (id) { return UI.HERO_ORDER.indexOf(id); }));
    t.ok(V3_HEROES.every(function (id) { return UI.HERO_ORDER.indexOf(id) > lastV2; }) && UI.HERO_ORDER[UI.HERO_ORDER.length - 1] === V3_HEROES[V3_HEROES.length - 1],
      'V3: Benedick joins after the v2 six, last in UI.HERO_ORDER');
    // the registered real heroes, in the display order (an id in HERO_ORDER that is not registered is ignored)
    const real = UI.HERO_ORDER.filter(function (id) { return !!DD.getHero(id); });
    const registered = Object.keys(DD.defs.heroes).filter(function (id) { return id.indexOf('test_') !== 0; });
    if (real.length < 4 || !NEW_HEROES.every(function (id) { return !!DD.getHero(id); })) { t.skip('real hero content not loaded (' + real.length + ' heroes)'); return; }
    const N = registered.length;
    t.ok(registered.every(function (id) { return UI.HERO_ORDER.indexOf(id) >= 0; }), 'every registered hero is in UI.HERO_ORDER (' + N + ' heroes)' +
      (real.length < N ? ': missing ' + registered.filter(function (id) { return UI.HERO_ORDER.indexOf(id) < 0; }).join(', ') : ''));
    // UI.heroIds(): HERO_ORDER first, then (sorted last) any registered hero the order does not list yet
    const order = UI.heroIds();
    t.ok(order.length === N && order.slice(0, real.length).join(',') === real.join(','), 'UI.heroIds() lists the ' + N + ' heroes in the display order (' + order.length + ')');
    t.ok(order.every(function (id) { return UI.isUnlocked(id) && !DD.getHero(id).unlock; }), 'every hero is available (unlock: null)');
    t.tryRun('party select', function () { UI.show('partySelect', {}); });
    const cards = qa('.ps-roster .hero-card');
    t.eq(cards.length, N, N + ' hero cards');
    t.eq(cards.map(function (c) { return c.dataset.id; }).join(','), order.join(','), 'in the display order');
    t.ok(!qa('.hero-card.locked').length && !/\?\?\?|🔒|to unlock/i.test(q('.ps-roster').textContent), 'no locked cards, "???" or unlock hints');
    t.ok(cards.every(function (c) { const d = DD.getHero(c.dataset.id); return c.querySelector('.hc-name').textContent === d.name && c.querySelector('.hc-role').textContent.length > 3; }), 'each card shows the name and the role');
    t.tryRun('hall roster', function () { UI.show('hall', { tab: 'heroes' }); });
    const hh = qa('.hall-heroes .hh-card');
    t.eq(hh.length, N, 'the hall roster lists all ' + N);
    t.ok(!qa('.hh-card.locked').length && !/\?\?\?|unlock/i.test(q('.hall-body').textContent), 'no lock grid, no unlock hints');
    t.ok(hh.every(function (c) { return /Never played|campaign/.test(c.querySelector('.hh-rec').textContent); }), 'each card has a campaign record line');
    t.tryRun('records', function () { UI.show('hall', { tab: 'records' }); });
    t.ok(!/unlocked/i.test(q('.hall-body').textContent) && /Heroes who braved a campaign/.test(q('.hall-body').textContent), 'Records count heroes who played, not unlocks');
    // long pick lists (the tavern's twelve recruits) get the compact four-column layout; short ones keep theirs
    const opts = function (n) { const o = []; for (let i = 0; i < n; i++) o.push({ label: 'Hero ' + i, onPick: function () {} }); return o; };
    UI.choice({ title: 'Twelve', options: opts(12) });
    t.ok(modalEl().querySelector('.choice-list.many') && modalEl().querySelectorAll('.choice-option').length === 12, 'a 12-option choice uses the compact long-list layout');
    reset();
    UI.choice({ title: 'Three', options: opts(3) });
    t.ok(!modalEl().querySelector('.choice-list.many'), 'a 3-option choice does not');
    reset();
    UI.show('title');
  });

  T.suite('ui: v2 — the hall roster shows each hero\'s record from the run history', function (t) {
    const UI = DD.UI;
    if (!DD.Meta || !DD.Meta.data || !DD.getHero('kiri')) { t.skip('meta or real heroes missing'); return; }
    UI.init();
    reset();
    const hist = DD.Meta.data.history;
    try {
      DD.Meta.data.history = [
        { result: 'victory', act: 3, party: [{ id: 'kiri', level: 6, kills: 30 }, { id: 'betty', level: 6, kills: 41, dead: false }] },
        { result: 'defeat', act: 1, party: [{ id: 'kiri', level: 2, kills: 4 }, { id: 'pebbles', level: 2, kills: 7, dead: true }] },
        // review: Hjalmar was written out and replaced by a recruit — only the summary's `fallen` still names him
        { result: 'victory', act: 3, party: [{ id: 'betty', level: 7, kills: 2 }], fallen: ['hjalmar'] },
      ];
      UI.show('hall', { tab: 'heroes' });
      const card = function (id) { return qa('.hh-card').filter(function (c) { return c.querySelector('.hh-name').textContent === DD.getHero(id).name; })[0]; };
      const rec = function (id) { const c = card(id); return c ? c.querySelector('.hh-rec').textContent : ''; };
      t.ok(/^2 campaigns · 👑 1 · 💀 34 · best Lv 6$/.test(rec('kiri')), 'Kiri: two campaigns, one win, 34 kills, best level 6: ' + rec('kiri'));
      t.ok(/1 campaign · 💀 7 · best Lv 2 · ⚰️ 1/.test(rec('pebbles')), 'Pebbles: written out once: ' + rec('pebbles'));
      t.ok(/Never played/.test(rec('valdris')) && card('valdris').classList.contains('fresh'), 'Valdris: never played');
      t.eq(rec('hjalmar'), '1 campaign · ⚰️ 1', 'Hjalmar (fallen, replaced by a recruit) still has his campaign, no crown');
      const N = UI.heroIds().length;   // V3: the registry's count, never a literal
      t.ok(new RegExp('4 of ' + N + ' heroes have braved a campaign').test(q('.hall-roster .narration').textContent), 'the DM counts who has played (4 of ' + N + ')');
      DD.Meta.data.history = [{ result: 'defeat', act: 1, party: UI.heroIds().map(function (id) { return { id: id, level: 1 }; }) }];
      UI.show('hall', { tab: 'heroes' });
      t.ok(new RegExp('All ' + N + ' heroes have braved a campaign').test(q('.hall-roster .narration').textContent) && !/The rest/.test(q('.hall-roster .narration').textContent), 'everyone played: no "the rest" line');
    } finally {
      DD.Meta.data.history = hist;
      reset();
      UI.show('title');
    }
  });

  T.suite('ui: review — the Enter that skips the Blessing roll (or a quick second one) never also keeps the Blessing', async function (t) {
    const UI = DD.UI;
    UI.init();
    reset();
    const run = makeRun(t);
    if (!run) return;
    if (typeof DD.Run.grantRoll !== 'function') { t.skip('run layer without grantRoll'); endRun(t); return; }
    UI.realInput(true);
    try {
      DD.Run.grantRoll(0, 'event');
      let done = null;
      const m = UI.passiveRoll(0, { animate: true, onDone: function (r) { done = r || 'none'; } });
      t.ok(!!m && !m.el.classList.contains('landed'), 'the d100 is rolling');
      t.ok(key('Enter').defaultPrevented && !m.el.classList.contains('landed'), 'an Enter right as the modal opens is swallowed');
      await tick(340);
      t.ok(key('Enter').defaultPrevented && m.el.classList.contains('landed') && !m.closed, 'Enter skips the roll: the Blessing is shown');
      t.ok(key('Enter').defaultPrevented && !m.closed && done === null, 'a quick second Enter does not keep a Blessing nobody has read yet');
      await tick(340);
      key('Enter');
      t.ok(m.closed && done && done.ok, 'a deliberate Enter after reading it keeps it (' + (done && done.action) + ')');
    } finally {
      UI.realInput(false);
      endRun(t);
    }
  });

  T.suite('ui: v2 — party select and the hall roster fit every registered hero at 1024×640, 1280×720, 1600×900 and 1920×1080 (real page)', async function (t) {
    if (!DD.getHero('kiri')) { t.skip('real hero content not loaded'); return; }
    for (let i = 0; i < SIZES.length; i++) {
      const w = SIZES[i][0], h = SIZES[i][1];
      const f = await gameFrame('debug=1&screen=partySelect', w, h);
      try {
        const W = f.contentWindow;
        // N: the game page's registered heroes (V3: never a literal count)
        const heroN = function () { return W.DD && W.DD.UI && typeof W.DD.UI.heroIds === 'function' ? W.DD.UI.heroIds().length : 0; };
        const ok = await frameUntil(function () { return W.DD && W.DD.UI && W.DD.UI.current === 'partySelect' && heroN() >= 4 && W.document.querySelectorAll('.hero-card').length >= heroN(); }, 15000);
        t.ok(ok, w + '×' + h + ': the party select is up');
        if (!ok) continue;
        await tick(80);
        // V3 (plan §4.12): the registered roster, then (padded with cloned worst-case cards) 17 until Benedick has
        // landed, and 18 for the next hero after him
        const real = heroN();
        const counts = [real];
        if (real < 17) counts.push(17);
        if (real < 18) counts.push(18);
        for (let c = 0; c < counts.length; c++) {
          const pad = counts[c] > real ? padHeroes(W, counts[c]) : [];
          try {
            if (pad.length) { W.DD.UI.show('title'); W.DD.UI.show('partySelect', {}); await tick(80); }
            await fitRoster(t, W, w, h, pad.length ? ' (padded to ' + counts[c] + ')' : '');
          } finally { unpadHeroes(W, pad); }
        }
      } finally { f.remove(); }
    }
  });
  /** The fit checks of one roster (party select, hall roster, the tavern's recruit pick) in frame W at w × h. */
  async function fitRoster(t, W, w, h, tag) {
    const N = W.DD.UI.heroIds().length;
    const doc = W.document;
    const at = w + '×' + h + tag;
    const cards = Array.prototype.slice.call(doc.querySelectorAll('.ps-roster .hero-card'));
    t.eq(cards.length, N, at + ': ' + N + ' hero cards');
    const bad = cardProblems(W, cards, '.hc-name, .hc-role');
    t.eq(bad.length, 0, at + ': ' + N + ' hero cards, nothing clipped or off screen' + (bad.length ? ' — ' + bad.slice(0, 4).join(' | ') : ''));
    const roster = doc.querySelector('.ps-roster');
    t.ok(roster.scrollHeight <= roster.clientHeight + 1, at + ': the roster needs no scrolling');
    const start = doc.querySelector('.ps-actions .btn.primary').getBoundingClientRect();
    t.ok(start.bottom <= h && start.right <= w, at + ': Start Campaign is on screen');
    // [V3 review] the `.many` grid narrows the details panel below 1280 px: its four stat boxes and the Init chip stay
    // inside it (0 ARMOR poked out at 1024×640 and 1024×768 once Benedick made 17)
    const panel = doc.querySelector('.ps-details');
    if (panel) {
      const pr = panel.getBoundingClientRect();
      const out = Array.prototype.slice.call(doc.querySelectorAll('.psd-stats .stat-box, .ps-details .psd-init'))
        .filter(function (b) { const r = b.getBoundingClientRect(); return r.right > pr.right - 2 || r.left < pr.left; });
      t.eq(out.length, 0, at + ': the details panel\'s stat boxes and Init chip stay inside it' + (out.length ? ' — ' + out.map(function (b) { return b.textContent; }).join(' | ') : ''));
    }
    W.DD.UI.show('hall', { tab: 'heroes' });
    await tick(80);
    const hh = Array.prototype.slice.call(doc.querySelectorAll('.hall-heroes .hh-card'));
    const body = doc.querySelector('.hall-body');
    t.eq(hh.length, N, at + ': the hall roster has ' + N + ' cards');
    const bad2 = cardProblems(W, hh, '.hh-name, .hh-sub, .hh-role, .hh-rec');
    t.eq(bad2.length, 0, at + ': hall cards: nothing clipped or off screen' + (bad2.length ? ' — ' + bad2.slice(0, 4).join(' | ') : ''));
    t.ok(body && body.scrollHeight <= body.clientHeight + 2, at + ': all ' + N + ' fit without scrolling (' + (body && body.scrollHeight) + ' / ' + (body && body.clientHeight) + ')');
    t.ok(new RegExp('(All ' + N + ' heroes|of ' + N + ' heroes|whole table)').test(doc.querySelector('.hall-roster .narration').textContent), at + ': the DM\'s count reads the registry (' + N + ')');
    // the tavern's "who joins?" pick: every hero outside the party (UI.choice, compact columns)
    if (W.DD.Main && typeof W.DD.Main.debugRun === 'function' && W.DD.Main.debugRun()) {
      W.DD.UI.show('tavern', { debug: true });
      await tick(60);
      const rb = doc.querySelector('.tav-option.k-recruit .to-actions .btn');
      if (rb) rb.click();
      const leave = doc.querySelector('.modal .choice-option');
      if (leave) leave.click();
      await tick(60);
      const opts = Array.prototype.slice.call(doc.querySelectorAll('.modal .choice-list.many .choice-option'));
      const mb = doc.querySelector('.modal .modal-body');
      const outside = N - ((W.DD.Run.state && W.DD.Run.state.party) || []).length;
      t.eq(opts.length, outside, at + ': the recruit pick lists the ' + outside + ' heroes outside the party');
      const bad3 = cardProblems(W, opts, '.ro-name, .ro-role');
      t.eq(bad3.length, 0, at + ': recruit cards: nothing clipped' + (bad3.length ? ' — ' + bad3.slice(0, 4).join(' | ') : ''));
      t.ok(mb && mb.scrollHeight <= mb.clientHeight + 2, at + ': the pick needs no scrolling (' + (mb && mb.scrollHeight) + ' / ' + (mb && mb.clientHeight) + ')');
      W.DD.UI.closeAllModals('test');
      // a fresh run for the next roster size (its tavern rolls the recruits again)
      if (W.DD.Run && typeof W.DD.Run.clear === 'function') W.DD.Run.clear();
      W.DD.Run.state = null;
    }
  }

  /**
   * [release gate, Nov 14] The act-1 start map's intro box (the DM's line + the Session Zero quirks) covered a
   * first-column node on 40 of 40 start maps at 1280×720 (26 of 40 at 1920×1080). While it is up the map is laid out
   * below it; once the party has moved on the plain layout is back.
   */
  T.suite('ui: release gate — the act-1 intro box never covers a map node (1024×640, 1280×720, 1920×1080, real page)', async function (t) {
    if (!DD.getHero('kiri')) { t.skip('real hero content not loaded'); return; }
    const parties = [['zarathor', 'syllamin', 'ellaria', 'slate'], ['marbles', 'marwyn', 'josiah', 'sparrow'], ['corelos', 'buga', 'kiri', 'betty'], ['basanos', 'valdris', 'hjalmar', 'pebbles']];
    const sizes = [[1024, 640], [1280, 720], [1920, 1080]];
    for (let i = 0; i < sizes.length; i++) {
      const w = sizes[i][0], h = sizes[i][1];
      const f = await gameFrame('debug=1&screen=map&seed=4&party=' + parties[0].join(','), w, h);
      try {
        const W = f.contentWindow;
        const ok = await frameUntil(function () { return W.DD && W.DD.UI && W.DD.UI.current === 'map' && W.document.querySelector('.map-node'); }, 15000);
        t.ok(ok, w + '×' + h + ': the map is up');
        if (!ok) continue;
        if (W.document.fonts && W.document.fonts.ready) await W.document.fonts.ready;
        const doc = W.document;
        const hits = [];
        let boxes = 0, squeezed = 0;
        for (let s = 1; s <= 12; s++) {
          W.DD.Run.newRun(parties[s % 4], 'normal', 7000 + s);
          W.DD.UI.show('map');
          await tick(20);
          const narr = doc.querySelector('.map-narration');
          if (!narr || !narr.querySelector('.sz-quirks')) continue;
          boxes++;
          if (doc.querySelector('.map-board.intro')) squeezed++;
          const b = narr.getBoundingClientRect();
          doc.querySelectorAll('.map-node').forEach(function (nd) {
            const r = nd.getBoundingClientRect();
            if (Math.min(b.right, r.right) - Math.max(b.left, r.left) > 0 && Math.min(b.bottom, r.bottom) - Math.max(b.top, r.top) > 0) hits.push('seed ' + (7000 + s) + ' ' + nd.dataset.id);
          });
        }
        t.ok(boxes >= 10, w + '×' + h + ': the start maps show the quirks box (' + boxes + ' of 12)');
        t.eq(hits.length, 0, w + '×' + h + ': no map node under the intro box' + (hits.length ? ' — ' + hits.slice(0, 4).join(' | ') : ''));
        t.ok(squeezed === boxes, w + '×' + h + ': each start map is laid out below its intro box (' + squeezed + ' of ' + boxes + ')');
        // the camp, the party token and the links' start follow the squeezed layout (the camp sits mid-way down the area)
        const board = doc.querySelector('.map-board'), camp = doc.querySelector('.map-start'), nodes = doc.querySelector('.map-nodes');
        if (board && camp && nodes && board.classList.contains('intro')) {
          const nb = nodes.getBoundingClientRect(), cb = camp.getBoundingClientRect();
          t.ok(Math.abs((cb.top + cb.bottom) / 2 - (nb.top + nb.height / 2)) <= 3, w + '×' + h + ': the camp is centred on the squeezed node area');
        }
        // the party moves on without leaving the map (run:changed → update): the quirks and the squeeze go
        const run = W.DD.UI.run();
        run.nodeId = (run.map.start || [])[0];
        run.visited = [run.nodeId];
        W.DD.UI.update('run:changed');
        await tick(20);
        t.ok(!doc.querySelector('.map-board.intro') && !doc.querySelector('.map-narration .sz-quirks'), w + '×' + h + ': after the first step the quirks line and the squeeze are gone');
      } finally { f.remove(); }
    }
  });

  T.suite('ui: v2 — debug screen=rewards (js/main.js) shows the level-up block; screen=levelup levels one hero; DDdbg.levelUp', async function (t) {
    if (!DD.getHero('kiri') || !DD.Run || typeof DD.Run.grantLevelUps !== 'function') { t.skip('real heroes or the v2 run layer missing'); return; }
    let f = await gameFrame('debug=1&screen=rewards&seed=12&party=kiri,betty,valdris,pebbles', 1280, 720);
    try {
      const W = f.contentWindow;
      const ok = await frameUntil(function () { return W.DD && W.DD.UI && W.DD.UI.current === 'rewards' && W.document.querySelector('.rw-level'); }, 15000);
      t.ok(ok, 'the debug rewards screen is up');
      if (ok) {
        const data = W.DD.Run.state.pending && W.DD.Run.state.pending.data;
        t.ok(data && Array.isArray(data.levelUps) && data.levelUps.length === 1 && data.xp === undefined && data.xpByHero === undefined, 'its data has one LevelUp record and no XP fields');
        const lv = data && data.levelUps[0];
        const party = W.DD.Run.state.party;
        t.ok(lv && party[lv.heroIdx].level === 2 && party.filter(function (h) { return h.level === 1; }).length === 3, 'exactly one hero leveled (the rotation)');
        t.ok(data && data.leveled.indexOf(lv.heroIdx) >= 0, 'and the level-up flow queue has that hero');
        const block = W.document.querySelector('.rw-level');
        t.ok(block.style.display !== 'none' && block.textContent.indexOf(lv.name + ' levels up') >= 0, 'the level-up block names the hero: ' + block.textContent.slice(0, 90));
        t.ok(!/\bXP\b/.test(W.document.querySelector('.screen').textContent), 'no XP anywhere');
        t.ok(typeof W.DDdbg.levelUp === 'function' && !/xp\(n\)/.test(W.DDdbg.help.toString()), 'DDdbg.levelUp replaces the XP helper');
        const before = party.map(function (h) { return h.level; }).join(',');
        const p3 = party[3].level;
        const r = W.DDdbg.levelUp(3);
        t.ok(r && r.heroIdx === 3 && party[3].level === p3 + 1 && W.DD.UI.current === 'levelup', 'DDdbg.levelUp(3) levels Pebbles (named) and opens the flow (' + before + ' → ' + party.map(function (h) { return h.level; }).join(',') + ')');
      }
    } finally { f.remove(); }
    f = await gameFrame('debug=1&screen=levelup&seed=12&party=kiri,betty,valdris,pebbles', 1280, 720);
    try {
      const W = f.contentWindow;
      const ok = await frameUntil(function () { return W.DD && W.DD.UI && W.DD.UI.current === 'levelup'; }, 15000);
      t.ok(ok, 'screen=levelup shows the level-up flow');
      if (ok) {
        const lv = W.DD.Run.state.party.map(function (h) { return h.level; });
        t.eq(lv.filter(function (x) { return x === 2; }).length, 1, 'after one rotation level-up (' + lv.join(',') + ')');
      }
    } finally { f.remove(); }
  });

  // ---- render / HUD polish (wf10) ------------------------------------------------------------------------------------
  T.suite('ui: polish — item stat lines say initiative; UI.portrait(…, { unit }) follows the unit\'s look', function (t) {
    const lines = DD.UI.statLines({ hp: 4, init: 2, mov: -1 }).map(function (l) { return l.text; });
    t.ok(lines.indexOf('+2 initiative') >= 0, 'an init stat has its line: ' + lines.join(' | '));
    t.ok(lines.indexOf('+4 max HP') < lines.indexOf('+2 initiative'), 'in the stat order (HP, AP, Move, Armor, initiative, ...)');
    t.ok(DD.UI.statLines({ init: -1 }).some(function (l) { return l.text === '−1 initiative' || l.text === '-1 initiative'; }) &&
      DD.UI.statLines({ init: -1 })[0].good === false, 'a negative one is marked bad');
    if (DD.getItem && DD.getItem('adrenaline_jar')) {
      const tip = DD.UI.itemTooltipHtml ? DD.UI.itemTooltipHtml('adrenaline_jar') : '';
      t.ok(!tip || /initiative/.test(tip), 'the Adrenaline Jar tooltip lists its initiative');
    }
    // portraits of a live unit follow its look (vis.sprite / unit.sprite / its def)
    const heroId = Object.keys(DD.defs.heroes)[0];
    if (!heroId || !DD.Sprites) { t.skip('no hero or sprites'); return; }
    const u = { id: 'ui_port_u', defId: heroId, kind: 'hero', side: 'hero', name: 'Test', x: 0, y: 0, statuses: [], flags: {}, vis: {} };
    const src = function (el) { const img = el.querySelector('img'); return img ? img.getAttribute('src') : (el.querySelector('canvas') ? 'canvas' : ''); };
    const plain = src(DD.UI.portrait(heroId, 40));
    t.eq(src(DD.UI.portrait(heroId, 40, { unit: u })), plain, 'a unit in its own look: the def portrait');
    u.sprite = { base: 'quadruped', palette: { skin: '#8f8c98' } };
    const wolf = src(DD.UI.portrait(heroId, 40, { unit: u }));
    t.ok(wolf && wolf !== plain, 'unit.sprite (a form): another portrait');
    u.vis.sprite = { base: 'blob', palette: { skin: '#59d36a' } };
    t.ok(src(DD.UI.portrait(heroId, 40, { unit: u })) !== wolf, 'the on-screen pin (vis.sprite) wins');
    t.ok(DD.UI.portrait(heroId, 40, { unit: u }).style.getPropertyValue('--pc') !== '', 'the frame keeps the hero colour');
  });

  // ---- playtest fixes (Nov 12; .tmp/wf12/confirmed-findings.json) -----------------------------------------------------------
  const THEY = /\b(they|them|their|theirs|themselves|themself)\b/i;

  T.suite('ui: playtest first-hour-8 / text-tone-15 — Settings and the combat menu share one current controls list', function (t) {
    const UI = DD.UI;
    reset();
    try {
      t.ok(Array.isArray(UI.CONTROLS) && UI.CONTROLS.length >= 15, 'DD.UI.CONTROLS');
      t.tryRun('show settings', function () { UI.show('settings', {}); });
      const rows = qa('.controls .ctrl').map(function (c) { return c.querySelector('.ctrl-key').textContent + ' = ' + c.querySelector('.ctrl-desc').textContent; });
      ['Tab = Next unit of this turn (hero + summons)', 'Hold Alt / T = Threat shading: where enemies can reach',
        'Click an adjacent ally = While moving: swap places (costs the move; the ally pays nothing)',
        'Shift + click an ally = Swap with a summon of this turn (a plain click selects it)'].forEach(function (r) {
        t.ok(rows.indexOf(r) >= 0, 'Settings lists: ' + r);
      });
      t.ok(!rows.some(function (r) { return /Cycle heroes/.test(r); }), 'no v1 "Cycle heroes"');
      t.eq(rows.length, UI.CONTROLS.length, 'every shared row, no other');
    } finally { reset(); }
  });

  T.suite('ui: playtest text-tone-22 / heroes-8 / text-tone-21 / text-tone-18 — area and range labels, boss titles, Balance-driven difficulty text', function (t) {
    const UI = DD.UI;
    ['gen_pocket_sand', 'gen_taunt'].forEach(function (id) {
      if (!DD.getSkill(id)) return;
      const info = UI.skillInfo(id, 1);
      t.ok(!/Radius 0/.test(info.area), id + ': no "Radius 0" chip (' + JSON.stringify(info.area) + ')');
    });
    if (DD.getSkill('ell_switcheroo')) t.eq(UI.skillInfo('ell_switcheroo', 1).range, 'Anywhere', 'The Ol\' Switcheroo reaches anywhere');
    t.eq(UI.bossWithTitle('The Rat King', 'and the Rat Bar Association'), 'The Rat King and the Rat Bar Association', 'a title that starts with "and"');
    t.eq(UI.bossWithTitle('Grimble', 'The Goblin Tax Collector'), 'Grimble, the Goblin Tax Collector', 'a title that starts with "The"');
    t.eq(UI.bossWithTitle('Dr. Iris', ''), 'Dr. Iris', 'no title');
    const brutal = UI.DIFFICULTIES.filter(function (d) { return d.id === 'brutal'; })[0];
    if (!DD.Balance || !brutal) { t.skip('no DD.Balance'); return; }
    const row = DD.Balance.difficulty.brutal, hp0 = row.hp;
    try {
      const want = Math.round((row.hp - 1) * 100) + '% more HP';
      t.ok(brutal.desc.indexOf(want) >= 0 && brutal.desc.indexOf(Math.round((row.dmg - 1) * 100) + '% more damage') >= 0, 'Brutal reads DD.Balance: ' + brutal.desc);
      row.hp = 1.5;
      t.ok(/50% more HP/.test(brutal.desc), 'and follows it when the balance changes: ' + brutal.desc);
    } finally { row.hp = hp0; }
    t.eq(UI.DIFFICULTIES.filter(function (d) { return d.id === 'normal'; })[0].desc, 'Standard enemy HP and damage.', 'Normal stays plain');
  });

  T.suite('ui: finish text-tone-17 / balance audit — the title quips say bosses AND a few elites wind up; brutal\'s fallback text matches DD.Balance', function (t) {
    const sc = DD.UI.screens && DD.UI.screens.title;
    const tl = sc && sc.taglines;
    t.ok(Array.isArray(tl) && tl.length > 5, 'the title screen exposes its quips (' + (tl && tl.length) + ')');
    const tele = (tl || []).filter(function (s) { return /telegraph|wind[- ]?up/i.test(s); });
    t.ok(tele.length > 0, 'the telegraph quip is still there');
    tele.forEach(function (s) { t.ok(/elite/i.test(s), 'a quip about who telegraphs names the few elites too: ' + s); });
    // the fallback desc (shown only without a DD.Balance row) says the same numbers as the row
    const brutal = DD.UI.DIFFICULTIES.filter(function (d) { return d.id === 'brutal'; })[0];
    if (!DD.Balance || !DD.Balance.difficulty || !DD.Balance.difficulty.brutal || !brutal) { t.skip('no DD.Balance'); return; }
    const B = DD.Balance, rows = B.difficulty, row = rows.brutal;
    const want = [Math.round((row.hp - 1) * 100) + '% more HP', Math.round((row.dmg - 1) * 100) + '% more damage'];
    let fb = '';
    try {
      B.difficulty = {};
      fb = brutal.desc;
    } finally { B.difficulty = rows; }
    t.ok(fb.indexOf(want[0]) >= 0 && fb.indexOf(want[1]) >= 0, 'the fallback says ' + want.join(' / ') + ': ' + fb);
    t.ok(/one extra enemy/.test(fb), 'and the extra grunt');
  });

  T.suite('ui: review (finish) — every title quip fits one line; ARCHITECTURE §3.7 / §7.5 / §8.1 / §8.3 say what the UI and input do', function (t) {
    const sc = DD.UI.screens && DD.UI.screens.title;
    const tl = (sc && sc.taglines) || [];
    t.ok(tl.length > 5, 'the title screen exposes its quips (' + tl.length + ')');
    // the tagline box is 38rem of 1.02rem italics with the title scene (~88 characters to a line) and 1.15rem without it
    // (~78), quotes included: a longer quip wraps, and the rotating tagline jumps between one and two lines (the finish
    // run's 101-character telegraph quip did, at 1280x720 and 1920x1080)
    tl.forEach(function (s) { t.ok(s.length <= 76, 'one line (≤ 76 characters, ' + s.length + '): ' + s); });
    // the docs: read through the page (tools/test.sh allows file:// reads); a page that can't read files skips
    let arch = null;
    try {
      const x = new XMLHttpRequest();
      x.open('GET', (window.DD_BASE || '../') + 'docs/ARCHITECTURE.md', false);
      if (x.overrideMimeType) x.overrideMimeType('text/plain; charset=utf-8');
      x.send();
      if ((x.status === 0 || x.status === 200) && x.responseText) arch = x.responseText.replace(/\s+/g, ' ');
    } catch (e) { arch = null; }
    if (!arch) { t.skip('this page can\'t read docs/ARCHITECTURE.md (run it through tools/test.sh)'); return; }
    t.ok(/volatile: false, \/\/ v2: it explodes when destroyed \(onDestroyed → DD\.Act\.explode\): any single-target damage skill \/\/ can be aimed at it/.test(arch),
      '§3.7: the volatile flag quotes D1 ("any single-target damage skill"), not "single-target attacks"');
    t.ok(arch.indexOf('single-target attacks can be aimed') < 0, '§3.7: no pre-D1 wording left');
    t.ok(/`input:tileHover \{x, y, unitId, under\?, shift\} \| null`/.test(arch), '§7.5: input:tileHover carries shift');
    ['CONTROLS', 'partyLines', 'bossWithTitle', 'consumableDesc', 'chooseSkillSlot'].forEach(function (k) {
      t.ok(new RegExp('\\b' + k + '[ (→]').test(arch) && DD.UI[k] !== undefined, '§8.1 documents DD.UI.' + k + ' and it exists');
    });
    t.ok(/forgetWarning/.test(arch) && /means \*\*⇄ swap\*\* with that ally, or \*\*Help Up\*\* when the ally is downed/.test(arch), '§8.1 / §8.3: forgetWarning and the adjacent-ally click');
    t.ok(/a ✖ between them when blocked: refused, or a free hit calls it off/.test(arch), '§7.2: overlay.swap.blocked covers a refused swap');
  });

  T.suite('ui: playtest heroes-v1 — a consumable\'s text and range can follow the holder\'s reach (desc(L, user), the HUD pocket passes the unit)', function (t) {
    const UI = DD.UI;
    if (!DD.Targeting || typeof DD.Targeting.reach !== 'function') { t.skip('no DD.Targeting.reach'); return; }
    const id = 'test_ui_reach_jar';
    DD.defs.consumables[id] = { id: id, name: 'Jar of Reach', icon: '🫙', rarity: 'common', ap: 1, area: { shape: 'single' }, flavor: '',
      target: { type: 'unit', filter: 'enemy', range: [1, 4] },
      desc: function (L, user) { return 'Throw it at a foe within ' + DD.Targeting.reach(this, L, user, 4) + '.'; },
      execute: function () {} };
    try {
      const holder = { id: 'ui_rj', kind: 'hero', side: 'hero', x: 0, y: 0, statuses: [], rangeBonus: 1, flags: {}, tags: [] };
      const plain = UI.consumableTooltipHtml(id), held = UI.consumableTooltipHtml(id, { user: holder });
      t.ok(/within 4\./.test(plain) && /Range 1–4/.test(plain), 'no holder: the listed numbers');
      t.ok(/within 5\./.test(held) && /Range 1–5/.test(held), 'a holder with +1 range: the text and the 🎯 range agree on 5');
      t.eq(UI.consumableDesc(DD.getConsumable(id)), 'Throw it at a foe within 4.', 'UI.consumableDesc without a unit');
      t.eq(UI.consumableDesc({ desc: 'Plain.' }, holder), 'Plain.', 'a string desc stays as it is');
      const card = UI.consumableCard(id, { user: holder });
      t.ok(/within 5\./.test(card.textContent), 'the card prints the holder\'s reach: ' + card.textContent);
    } finally { delete DD.defs.consumables[id]; }
  });

  T.suite('ui: playtest robustness-4 / text-tone-4 / text-tone-6 / heroes-9 / heroes-v2 — no "they" for a named hero, party-filtered barks, Init on the card, the forget note', function (t) {
    const UI = DD.UI;
    const meta = DD.util.deepClone(DD.Meta.data);
    try {
      const run = runWith(t, ['ellaria', 'josiah', 'syllamin', 'slate']);
      if (!run) return;
      // barks out of a fight skip heroes who aren't in the party (Ellaria's Pebbles line, Josiah's Valdris line)
      const lines = ['Pebbles and the corgis signed a ceasefire.', 'Valdris, forge me a smaller beak.', 'Josiah, hold my staff.', 'Nobody named here.'];
      t.eq(UI.partyLines(lines).join(' | '), 'Josiah, hold my staff. | Nobody named here.', 'UI.partyLines keeps lines that name only party members');
      t.eq(UI.partyLines(lines, ['pebbles', 'valdris']).length, 3, 'an explicit party list');
      // the TPK tombstones: no they / their, no repeats in one party, by the run seed
      UI.show('gameover', { summary: { act: 1, party: ['syllamin', 'sparrow', 'josiah', 'betty'].map(function (id) { return { id: id, level: 2 }; }), stats: {}, seed: 99 } });
      const eps = qa('.tomb-ep').map(function (e) { return e.textContent; });
      t.eq(eps.length, 4, 'four epitaphs');
      t.ok(!eps.some(function (e) { return THEY.test(e); }), 'none uses they / their: ' + eps.join(' | '));
      t.eq(eps.filter(function (e, i) { return eps.indexOf(e) !== i; }).length, 0, 'no epitaph twice in one party');
      // [first-hour-3] downs only count after a fight someone survived: the TPK screen says "before the wipe"
      const labels = qa('.end-stat .es-label').map(function (e) { return e.textContent; });
      t.ok(labels.indexOf('Downs before the wipe') >= 0 && labels.indexOf('Heroes lost before the wipe') >= 0 && labels.indexOf('Times downed') < 0,
        'the TPK stat labels: ' + labels.join(' | '));
      // [playtest review] the act-clear unlock banner names one hero: no "Recruit them…"
      UI.show('victory', { act: 1, unlocked: ['valdris'] });
      const ub = qa('.ub-role').map(function (e) { return e.textContent; });
      t.ok(ub.length === 1 && !THEY.test(ub[0]), 'the unlock banner has no they / them: ' + ub.join(' | '));
      // party sheet of a hero written out; the Blessing roll's Discard tooltip
      run.party[3].dead = true;
      UI.show('party', { hero: 3 });
      t.ok(/Replace Slate at a tavern/.test((q('.sheet-dead') || {}).textContent || ''), 'a written-out hero\'s sheet names him: ' + ((q('.sheet-dead') || {}).textContent || ''));
      run.party[3].dead = false;
      if (typeof DD.Run.grantRoll === 'function') {
        DD.Run.grantRoll(0, 'event');
        const pm = UI.passiveRoll(0, { instant: true });
        const btns = pm ? Array.prototype.slice.call(pm.el.querySelectorAll('button')) : [];
        const disc = btns.filter(function (b) { return /Discard/.test(b.textContent); })[0];
        const tip = disc && disc._ddTip ? String(disc._ddTip.content) : '';
        t.ok(/Ellaria keeps every Blessing as it is/.test(tip) && !THEY.test(tip), 'the Blessing roll\'s Discard tooltip has no "they": ' + tip);
        UI.closeAllModals('test');
      }
      // the party select card shows the initiative modifier
      UI.show('partySelect', {});
      const initTxt = (q('.psd-init') || {}).textContent || '';
      t.ok(/🎲 Init [+−]\d/.test(initTxt), 'the party select card shows Init: ' + initTxt);
      // the forget picker: a forgotten skill goes back in the pile; a skill's forgetWarning shows on its card
      const rh = run.party[0];
      const pool = DD.Run.learnableFor ? DD.Run.learnableFor(rh, { generic: true }) : [];
      while (rh.skills.length < 4 && pool.length) rh.skills.push({ id: pool.shift(), level: 1 });
      const sk0 = DD.getSkill(rh.skills[0].id);
      const had = Object.prototype.hasOwnProperty.call(sk0, 'forgetWarning'), old = sk0.forgetWarning;
      sk0.forgetWarning = 'Without it nothing works.';
      try {
        const m = UI.chooseSkillSlot(0, pool[0] || rh.skills[0].id, {}, function () {});
        const body = m ? m.el.textContent : '';
        t.ok(/A forgotten skill goes back in the pile/.test(body) && !/gone for good/.test(body.replace(/Pick a Blessing to lose \(it is gone for good\)/, '')), 'the note: the skill can come back');
        t.ok(m && m.el.querySelector('.rp-warn') && /Without it nothing works\./.test(m.el.querySelector('.rp-warn').textContent), 'the keystone warning shows on its card');
        UI.closeAllModals('test');
      } finally { if (had) sk0.forgetWarning = old; else delete sk0.forgetWarning; }
    } finally {
      endRun(t);
      DD.Meta.data = meta;
      DD.Meta.save();
    }
  });

  T.suite('ui: playtest first-hour-10 — the inspect panel ends above the hint pill at 1024×768 and 1280×720 (real page)', async function (t) {
    if (!DD.getEnemy('a1_kid') && !DD.getEncounter('a1_goblin_ambush')) { t.skip('real content not loaded'); return; }
    const sizes = [[1024, 768], [1280, 720]];
    for (let i = 0; i < sizes.length; i++) {
      const w = sizes[i][0], h = sizes[i][1];
      const f = await gameFrame('debug=1&screen=combat&encounter=a1_goblin_ambush&party=zarathor,syllamin,marbles,marwyn&seed=3', w, h);
      try {
        const W = f.contentWindow;
        const ok = await frameUntil(function () { return W.DD && W.DD.HUD && W.DD.HUD.mounted() && W.DD.Combat.state; }, 15000);
        t.ok(ok, w + '×' + h + ': the fight is up');
        if (!ok) continue;
        await tick(120);
        const foes = W.DD.Combat.state.units.filter(function (u) { return u.side === 'enemy' && !u.dead; });
        let checked = 0, bad = [];
        foes.forEach(function (u) {
          W.DD.HUD.hover(u.x, u.y);
          const els = W.DD.HUD.els();
          const ir = els.inspect.getBoundingClientRect(), hr = els.hint.getBoundingClientRect();
          if (els.inspect.classList.contains('hud-hidden') || !hr.height || hr.right <= ir.left || hr.left >= ir.right) return;
          checked++;
          if (ir.bottom > hr.top) bad.push(u.name + ' (' + Math.round(ir.bottom) + ' > ' + Math.round(hr.top) + ')');
        });
        t.ok(checked > 0, w + '×' + h + ': ' + checked + ' inspected foes share the hint\'s column');
        t.eq(bad.length, 0, w + '×' + h + ': over ' + checked + ' inspected foes sharing the hint\'s column, the panel never runs under the pill' + (bad.length ? ': ' + bad.join(', ') : ''));
      } finally { f.remove(); }
    }
  });

  T.suite('ui: playtest first-hour-6 / first-hour-4 / heroes-9 — scrolling panels keep their rivets fixed; the next level-up hides until the die lands; the Init box fits (real page)', async function (t) {
    const f = await gameFrame('debug=1&screen=settings', 1024, 768);
    try {
      const W = f.contentWindow;
      const ok = await frameUntil(function () { return W.DD && W.DD.UI && W.DD.UI.current === 'settings' && W.document.querySelector('.settings-panel'); }, 15000);
      t.ok(ok, 'the settings screen is up');
      if (!ok) return;
      const doc = W.document;
      const sc = doc.querySelector('.settings-panel');
      t.ok(sc.classList.contains('scroll') && sc.scrollHeight > sc.clientHeight, 'at 1024×768 the settings panel scrolls (' + sc.scrollHeight + ' / ' + sc.clientHeight + ')');
      t.eq(W.getComputedStyle(sc, '::before').display, 'none', 'a scrolling panel has no ::before frame (it would scroll with the content)');
      t.ok(/radial-gradient/.test(W.getComputedStyle(sc).backgroundImage) && W.getComputedStyle(sc).backgroundAttachment.split(',')[0].trim() === 'scroll', 'its rivets are its own background, fixed to the panel');
      const host = doc.createElement('div');
      host.innerHTML = '<div class="panel" style="position:fixed;left:0;top:0;width:50px;height:50px"></div><div class="rwl-row"><span class="rwl-next">x</span></div>';
      doc.body.appendChild(host);
      t.ok(W.getComputedStyle(host.children[0], '::before').display !== 'none', 'a plain panel keeps its frame');
      const row = host.children[1];
      t.eq(W.getComputedStyle(row.firstChild).visibility, 'hidden', 'the "Next level-up" line is hidden while the die rolls');
      row.classList.add('landed');
      t.eq(W.getComputedStyle(row.firstChild).visibility, 'visible', 'and shows once it lands');
      host.remove();
      // the party select card: the 🎲 Init chip and the four stat boxes sit inside the details panel at 1024
      W.DD.UI.show('partySelect', {});
      await tick(80);
      const panel = doc.querySelector('.ps-details');
      const init = doc.querySelector('.ps-details .psd-init');
      t.ok(init && /🎲 Init [+−]\d/.test(init.textContent), 'the hero card shows the initiative modifier: ' + (init && init.textContent));
      const pr = panel.getBoundingClientRect();
      const out = Array.prototype.slice.call(doc.querySelectorAll('.psd-stats .stat-box')).concat(init ? [init] : []).filter(function (b) { const r = b.getBoundingClientRect(); return r.right > pr.right - 2 || r.left < pr.left; });
      t.eq(out.length, 0, 'nothing pokes out of the panel at 1024×768' + (out.length ? ': ' + out.map(function (b) { return b.textContent; }).join(' | ') : ''));
    } finally { f.remove(); }
  });

  // ==== V3: act IV "Under the Table" (plan §2.1-2.6, §4.10, §8.4 META-UI) =============================================
  // Every count here is read from the registry or the run (map.lanes.length, summary.gauntletLanes, UI.heroIds()),
  // never a literal number of doors or heroes. Act IV ships dark: these suites set the knob themselves (withActs).
  const TWIST_LINE = 'You thought this was over? I, SVAMMIEL, CONTROL ALL.';
  const GOATS_TEASER = '🐐 The Rapping Goats — three goats, one mic, a verse about each of you. (feat. ???)';
  // the League's full name (plan V19: 56 letters in the word, 72 characters in all) when league.js is not loaded
  const LEAGUE_FULL = 'The ' + 'l'.repeat(10) + 'e'.repeat(11) + 'a'.repeat(12) + 'g' + 'u'.repeat(13) + 'e'.repeat(9) + ' of Villainy';

  /** Run fn with the campaign knob at n acts (every Balance knob restored after). */
  async function withActs(n, fn) {
    const snap = DD.Balance.snapshot();
    try {
      DD.Balance.campaign.acts = n;
      return await fn();
    } finally { DD.Balance.restore(snap); }
  }
  /** Run fn with the spoiler gate (DD.Meta seen.bosses.svammiel) open or shut; the meta data is restored after. */
  async function withGate(open, fn) {
    const saved = DD.util.deepClone(DD.Meta.data);
    try {
      const bag = DD.Meta.data.seen.bosses;
      if (open) bag.svammiel = Date.now(); else delete bag.svammiel;
      return await fn();
    } finally {
      DD.Meta.data = saved;
      DD.Meta.save();
    }
  }
  /** A run on Svammiel's floor: makeRun, then DD.Run.startAtAct(4, opts) (the knob must say 4). → run | null. */
  function gauntletRun(t, opts) {
    if (!DD.RunMap || typeof DD.RunMap.isGauntlet !== 'function' || !DD.RunMap.isGauntlet(4) || typeof DD.Run.startAtAct !== 'function') {
      t.skip('no act-4 gauntlet content (or DD.Run.startAtAct) loaded');
      return null;
    }
    const run = makeRun(t);
    if (!run) return null;
    t.tryRun('Run.startAtAct(4)', function () { DD.Run.startAtAct(4, Object.assign({ gear: 'none', noShow: true }, opts || {})); });
    const r = DD.UI.run();
    if (!r || r.act !== 4 || !r.map || r.map.shape !== 'gauntlet') { t.fail('DD.Run.startAtAct(4) built no gauntlet'); return null; }
    return r;
  }
  function textOf(sel) { const n = q(sel); return n ? n.textContent : ''; }
  function nodeRow(run, el) { const n = run.map.nodes[el.dataset.id]; return n ? n.row || 0 : -1; }
  /** Hover a node (its tooltip shows after UI.tooltip's delay) → the tooltip's text. */
  async function hoverText(node) {
    node.dispatchEvent(new MouseEvent('mouseenter'));
    await tick(160);
    const tt = document.querySelector('.ui-tooltip');
    const s = tt && tt.style.display !== 'none' ? tt.textContent : '';
    node.dispatchEvent(new MouseEvent('mouseleave'));
    DD.UI.hideTooltip();
    return s;
  }
  function poolOf(key, fallback) { const p = DD.defs.narration && DD.defs.narration[key]; return Array.isArray(p) && p.length ? p : fallback; }

  T.suite('ui: V3 — Svammiel\'s floor: a door per lane on every door row, only open and travelled links, sealed lanes, the legend, "Act IV"', function (t) {
    return uiSandbox(t, function () { return withActs(4, function () { return gauntletBoard(t); }); });
  });
  async function gauntletBoard(t) {
    const UI = DD.UI;
    UI.init();
    reset();
    const run = gauntletRun(t);
    if (!run) { endRun(t); return; }
    try {
      const map = run.map, L = map.lanes.length;
      t.ok(L >= 1, 'the run\'s gauntlet has ' + L + ' lanes (read from the registry)');
      t.tryRun('show the map', function () { UI.show('map', { act: 4 }); });
      t.ok(q('.map-board.gauntlet'), 'the gauntlet board (Svammiel\'s floor plan)');
      t.ok(root().classList.contains('act-4'), 'the act-4 look');
      t.eq(textOf('.mc-act'), 'Act IV', 'the cartouche says Act IV');
      t.eq(textOf('.mc-name'), 'Under the Table', 'and names the act');
      t.eq(textOf('.mc-sub'), UI.ACTS[4].sub, 'with its count-free sub');
      const doors = qa('.map-node.t-miniboss');
      t.eq(doors.length, L * L, 'a door per lane on each of the ' + L + ' door rows (' + doors.length + ')');
      map.lanes.forEach(function (lane) {
        const li = UI.laneInfo(lane);
        const mine = doors.filter(function (d) { return d.dataset.lane === lane.id; });
        t.eq(mine.length, L, lane.id + ': one door per door row');
        t.ok(mine.every(function (d) { return d.querySelector('.mn-lane').textContent === li.shortName && d.querySelector('.mn-badge').textContent === li.icon; }),
          lane.id + ': every door shows the lane\'s shortName and icon (' + li.icon + ' ' + li.shortName + ')');
        t.ok(mine.every(function (d) { return !!d.querySelector(li.portrait ? '.mn-portrait' : '.mn-icon'); }), lane.id + ': ' + (li.portrait ? 'the mini-boss portrait (' + li.portrait + ')' : 'its icon'));
      });
      // the door rows hold the lanes in lane order (track by track)
      const row1 = doors.filter(function (d) { return nodeRow(run, d) === 1; }).sort(function (a, b) { return parseFloat(a.style.top) - parseFloat(b.style.top); });
      t.eq(row1.map(function (d) { return d.dataset.lane; }).join(','), map.lanes.map(function (l) { return l.id; }).join(','), 'door row 1 lists the lanes top to bottom in lane order');
      const boss = q('.map-node.t-boss');
      t.ok(boss && /Floor Boss/.test(boss.textContent) && boss.classList.contains('door'), 'the floor boss is the last node, labelled Floor Boss');
      t.ok(q('.g-doodle-svam') && q('.g-doodle-dm'), 'the doodles: smug Svammiel over his node, the DM in the margin asking for help');
      // only the lobby's links (complete rows would be a hairball)
      t.eq(qa('.map-links .link.open').length, map.start.length, 'only the open links are drawn: the lobby\'s ' + map.start.length);
      t.eq(qa('.map-links .link.done').length, 0, 'nothing travelled yet');
      t.eq(qa('.map-node.s-reachable').length, map.start.length, 'the lobby stops are reachable');
      const legend = textOf('.map-legend');
      t.ok(/Mini-boss/.test(legend) && /Floor Boss/.test(legend) && !/Combat|Elite|Treasure/.test(legend), 'the legend lists what the board shows: ' + legend);
      // a door's tooltip: its full name, the teaser (when the lane has one), the hint, the state
      const d0 = row1[0];
      const li0 = UI.laneInfo(map.lanes[0]);
      const tip = await hoverText(d0);
      t.ok(tip.indexOf(li0.name) >= 0 && (!li0.hint || tip.indexOf(li0.hint) >= 0) && (!li0.teaser || tip.indexOf(li0.teaser) >= 0), 'the door tooltip: name, teaser and hint: ' + tip.slice(0, 160));
      t.ok(/Mini-boss/.test(tip) && /sealed/.test(tip), 'it says a mini-boss, and that a win seals the lane');
      const btip = await hoverText(boss);
      t.ok(/Floor Boss/.test(btip), 'the floor boss\'s tooltip: ' + btip.slice(0, 120));
      // the goats' door (the fifth lane in the full build): 🐐, the teaser, Billy Bleatz's portrait (the bear stays a surprise)
      t.eq(UI.laneInfo({ id: 'goats' }).teaser, GOATS_TEASER, 'the goats\' teaser, exactly');
      t.eq(UI.laneInfo({ id: 'goats' }).castNote, '(feat. ???)', 'and their cast-card aside');
      const goats = map.lanes.filter(function (l) { return l.id === 'goats'; })[0];
      if (goats) {
        const gi = UI.laneInfo(goats);
        t.eq(gi.icon, '🐐', 'the goats\' door icon');
        t.eq(gi.portrait, DD.getEncounter(goats.encounterId).objective.bossIds[0], 'the goats\' door portrait is the first squad def (Billy Bleatz)');
        t.ok(gi.shortName.length <= 24, 'the goats\' label is a shortName (' + gi.shortName + ')');
      } else t.log('goats.js not loaded: the goats\' door is checked from the teaser table only');

      // a lane beaten: every door of it sealed, the party at the door it beat, the next door row offers the others
      const first = map.lanes[0].id;
      t.tryRun('startAtAct(4, beaten: ' + first + ')', function () { DD.Run.startAtAct(4, { gear: 'none', noShow: true, beaten: first }); });
      const run2 = UI.run();
      // the path a party really walks: a lobby stop, then the door (startAtAct puts it at the door directly)
      run2.visited = [run2.map.start[0], run2.nodeId];
      t.tryRun('show the map', function () { UI.show('map', { act: 4 }); });
      const laneDoors = qa('.map-node.t-miniboss').filter(function (d) { return d.dataset.lane === first; });
      const cur = q('.map-node.s-current');
      t.ok(cur && cur.dataset.id === run2.nodeId && cur.dataset.lane === first && cur.classList.contains('fought'), 'the party stands at the door it beat');
      t.eq(cur ? cur.querySelector('.mn-lane').textContent : '', '✓ ' + UI.laneInfo(map.lanes[0]).shortName, 'that door reads "✓ ' + UI.laneInfo(map.lanes[0]).shortName + '"');
      const sealed = laneDoors.filter(function (d) { return d !== cur; });
      t.ok(laneDoors.length === L && sealed.every(function (d) { return d.classList.contains('s-sealed'); }), 'every other door of the beaten lane is sealed (' + sealed.length + ')');
      t.eq(qa('.map-node.t-miniboss.s-sealed').filter(function (d) { return d.dataset.lane !== first; }).length, 0, 'and only that lane\'s');
      t.ok(sealed.every(function (d) { return d.querySelector('.mn-lane').textContent === '✓ Beaten'; }), 'its other doors read "✓ Beaten"');
      if (sealed.length) t.ok(/Beaten/.test(await hoverText(sealed[0])), 'a sealed door\'s tooltip says it is beaten');
      const row3 = qa('.map-node.t-miniboss').filter(function (d) { return nodeRow(run2, d) === 3; });
      t.eq(row3.filter(function (d) { return !d.classList.contains('s-sealed'); }).length, L - 1, 'the next door row offers the ' + (L - 1) + ' unbeaten lanes');
      const avail = qa('.map-node.s-reachable');
      t.ok(avail.length > 0 && avail.every(function (d) { return nodeRow(run2, d) === 2; }), 'the intermission after the door is reachable');
      t.eq(qa('.map-links .link.done').length, 2, 'the travelled links are drawn: camp → lobby → door');
      t.eq(qa('.map-links .link.open').length, avail.length, 'plus the open ones, nothing else');
    } finally {
      endRun(t);
    }
  }

  T.suite('ui: V3 — the Twist panel: the user\'s line, the cast card built from the lanes, the heal with his blessing, Space completes it, "Descend to Act IV" goes down', function (t) {
    return uiSandbox(t, function () { return withActs(4, function () { return twistPanelFlow(t); }); });
  });
  async function twistPanelFlow(t) {
    const UI = DD.UI;
    UI.init();
    reset();
    const run = gauntletRun(t);
    if (!run) { endRun(t); return; }
    try {
      const L = run.map.lanes.length;
      // the rewards screen's Continue after the act-3 boss: actClear.twist → the Twist panel
      t.tryRun('rewards with a twist act clear', function () {
        UI.show('rewards', { kind: 'boss', boss: true, choices: [], gold: 0, encounterName: 'Behind the DM Screen', actClear: { act: 3, nextAct: 4, twist: true, healed: 0.5, unlocked: [], text: '' } });
      });
      const cont = qa('.btn.primary').filter(function (b) { return /Continue/.test(b.textContent); })[0];
      t.ok(cont, 'the rewards screen has Continue');
      if (cont) cont.click();
      t.eq(UI.current, 'victory', 'Continue opens the victory screen');
      t.ok(root().classList.contains('twist'), 'as the Twist panel');
      t.ok(root().classList.contains('tw-done'), 'headless: mounted fully drawn');
      t.eq(textOf('.tw-headline'), 'YOU THOUGHT THIS WAS OVER?', 'the typed headline');
      t.eq(textOf('.tw-control'), 'I, SVAMMIEL, CONTROL ALL.', 'then his name in gold');
      const pool = poolOf('svam_twist', [TWIST_LINE]);
      t.eq((textOf('.tw-headline') + ' ' + textOf('.tw-control')).toLowerCase(), pool[0].toLowerCase(), 'together: the user\'s line (svam_twist)');
      t.eq(pool[0], TWIST_LINE, 'svam_twist is exactly the user\'s words');
      t.ok(/Act III Cleared/.test(textOf('.tw-clear')), 'it starts as the act-3 clear');
      t.ok(/Fine\. FINE\. You win\. Same time next week\?/.test(textOf('.tw-dm-yield')), 'with the DM yielding');
      const chips = qa('.twc-lane');
      t.eq(chips.length, L, 'the cast card lists the ' + L + ' lanes of his floor');
      t.eq(chips.map(function (c) { return c.querySelector('.twc-lname').textContent; }).join(' | '), run.map.lanes.map(function (l) { return UI.laneInfo(l).shortName; }).join(' | '), 'by shortName, in lane order');
      const gchip = chips.filter(function (c) { return /Rapping Goats/.test(c.textContent); })[0];
      if (gchip) t.ok(/🐐/.test(gchip.textContent) && /\(feat\. \?\?\?\)/.test(gchip.textContent), 'the goats: 🐐 "(feat. ???)" (the bear stays a surprise)');
      t.ok(/SVAMMIEL/.test(textOf('.twc-name')) && /The Floor Boss/.test(textOf('.twc-title')) && /Dungeon Master of Dungeon Masters/.test(textOf('.twc-epithet')), 'the cast card: SVAMMIEL · The Floor Boss · Dungeon Master of Dungeon Masters');
      const sv = q('.tw-svam-line');
      t.ok(sv && sv.querySelector('.speaker-badge') && sv.querySelector('.speaker-badge').textContent === '😈', 'his line wears his 😈 badge, not the DM\'s');
      t.ok(sv && poolOf('svam_twist_panel', []).concat(['Did you think HE ran this game? Adorable. He\'s my player.']).indexOf(sv.querySelector('.narr-text').textContent) >= 0, 'his line is from svam_twist_panel');
      t.ok(/heals 50% of their max HP\./.test(textOf('.tw-heal')) && /\(Svammiel allowed it\. Healthy players last longer\.\)/.test(textOf('.tw-heal')), 'the heal line, with his blessing');
      const go = q('.tw-go');
      t.ok(go && /Descend to Act IV/.test(go.textContent), 'the button: Descend to Act IV');
      const n = UI.numberWord(L);
      t.eq(textOf('.end-next'), 'Next: Under the Table — Svammiel\'s floor. ' + DD.util.capitalize(n) + ' mini-boss' + (L === 1 ? '' : 'es') + ' in any order, then him.', 'the next line counts the lanes in words (' + n + ')');
      t.ok(!q('.confetti'), 'no confetti: nobody celebrates for long');
      // off headless: the reveal plays; Space completes it, then Enter descends
      const head = DD.headless, snd = UI.sound;
      UI.sound = function () {};
      try {
        DD.headless = false;
        try {
          t.tryRun('show the panel (animated)', function () { UI.show('victory', { act: 3, nextAct: 4, twist: true, healed: 0.5, unlocked: [] }); });
        } finally { DD.headless = head; }
        t.ok(!root().classList.contains('tw-done') && textOf('.tw-headline') === '', 'animated: the headline is not typed yet');
        key(' ');
        t.ok(root().classList.contains('tw-done') && textOf('.tw-headline') === 'YOU THOUGHT THIS WAS OVER?', 'Space completes every step at once');
        t.eq(UI.current, 'victory', 'and does not go on yet');
        key('Enter');
      } finally { UI.sound = snd; }
      t.eq(UI.current, 'map', 'Enter descends: the map');
      t.ok(q('.map-board.gauntlet') && UI.run().act === 4, 'Svammiel\'s floor, act IV');
    } finally {
      endRun(t);
    }
  }

  T.suite('ui: V3 — the four-act victory (campaign_won, his last word, floor bosses N / M and the order) vs a classic win; game over in act IV (floor bosses beaten, "(he cheated)")', function (t) {
    return uiSandbox(t, function () { return withActs(4, function () { return endScreens4(t); }); });
  });
  async function endScreens4(t) {
    const UI = DD.UI;
    UI.init();
    reset();
    if (DD.Run && typeof DD.Run.clear === 'function') DD.Run.clear();
    DD.Run.state = null;
    const lanes = DD.RunMap && DD.RunMap.gauntletLanes ? DD.RunMap.gauntletLanes(4) : [];
    const ids = lanes.map(function (l) { return l.id; });
    const M = Math.max(ids.length, 2);
    while (ids.length < M) ids.push('lane' + ids.length);
    const fin = DD.RunMap && DD.RunMap.finaleOf ? DD.RunMap.finaleOf(4) : null;
    const party = UI.heroIds().slice(0, 4).map(function (id) { return { id: id, level: 6 }; });
    const base = { act: 4, acts: 4, party: party, stats: { combats: 20, kills: 90, bosses: 4, miniBosses: ids.length }, difficulty: 'normal' };
    // the four-act win
    t.tryRun('the four-act victory', function () { UI.show('victory', { final: true, summary: Object.assign({}, base, { result: 'victory', gauntlet: ids.slice(), gauntletLanes: M, floorBoss: true }) }); });
    t.eq(textOf('.end-kicker'), 'The Campaign Is Over (For Real This Time)', 'the kicker');
    t.ok(root().classList.contains('four-act'), 'the four-act look');
    const narr = qa('.narration .narr-text').map(function (n) { return n.textContent; });
    t.ok(narr.some(function (s) { return poolOf('campaign_won', ['The DM picks up his screen, dusts it off and grins. "So. Who wants to play again?"']).indexOf(s) >= 0; }), 'the DM\'s line is campaign_won');
    t.ok(narr.indexOf('Fine. FINE. You win. Same time next week?') < 0, 'not the old hard-coded DM line');
    const last = q('.narration.by-speaker');
    t.ok(last && last.querySelector('.speaker-badge').textContent === '😈' && poolOf('victory_final', ['Svammiel, from somewhere far below: "Fine. FINE. ...Same time next week?"']).indexOf(last.querySelector('.narr-text').textContent) >= 0,
      'then Svammiel\'s last word from below (victory_final, 😈)');
    const floor = qa('.end-stat').filter(function (s) { return /Floor bosses/.test(s.textContent); })[0];
    t.ok(floor && floor.querySelector('.es-val').textContent === ids.length + ' / ' + M, 'the stat grid: floor bosses ' + ids.length + ' / ' + M + ' (that run\'s own lane count)');
    t.eq(qa('.end-order .lo-lane').length, ids.length + 1, 'the order: every lane beaten, then him');
    // a classic (v2: no `acts`) win
    t.tryRun('a classic victory', function () { UI.show('victory', { final: true, summary: { result: 'victory', act: 3, party: party, stats: { combats: 15 } } }); });
    t.eq(textOf('.end-kicker'), 'The Campaign Is Over', 'a classic win keeps its kicker');
    t.ok(qa('.narration .narr-text').some(function (n) { return n.textContent === 'Fine. FINE. You win. Same time next week?'; }), 'and the DM\'s line');
    t.ok(!q('.end-order') && !qa('.end-stat').some(function (s) { return /Floor bosses/.test(s.textContent); }), 'no floor bosses on a classic win');
    // game over in act IV: the floor boss (he cheated), floor bosses beaten N / M with their names
    const sub = ids.slice(0, 2);
    if (fin) {
      t.tryRun('game over to the floor boss', function () {
        UI.show('gameover', { summary: Object.assign({}, base, { result: 'defeat', gauntlet: sub, gauntletLanes: M, killedBy: fin.shortName || fin.name, killedByEncounter: fin.id }) });
      });
      const k = UI.killerOf({ killedBy: fin.shortName, killedByEncounter: fin.id });
      t.eq(textOf('.end-killer'), 'Felled by ' + k.name + ' in Act IV (he cheated).', 'the killer: ' + textOf('.end-killer'));
      t.ok(!/\bthey\b/.test(textOf('.end-killer')), 'never "they"');
      t.eq(textOf('.end-floor'), '😈 Floor bosses beaten: ' + sub.length + ' / ' + M + ' (' + sub.map(function (id) { return UI.laneShort(id); }).join(', ') + ')', 'floor bosses beaten, by name');
    } else t.log('no act-4 finale loaded: the floor boss\'s game over is not checked');
    if (lanes.length) {
      const enc = DD.getEncounter(lanes[0].encounterId);
      t.tryRun('game over at a door', function () {
        UI.show('gameover', { summary: Object.assign({}, base, { result: 'defeat', gauntlet: [], gauntletLanes: M, killedBy: enc.shortName || enc.name, killedByEncounter: enc.id }) });
      });
      t.eq(textOf('.end-killer'), 'Felled by ' + (enc.shortName || enc.name) + ' in Act IV.', 'a door\'s killer: its shortName, no cheating claimed');
      t.eq(textOf('.end-floor'), '😈 Floor bosses beaten: 0 / ' + M, '0 / ' + M);
    }
    t.tryRun('a v2 game over', function () { UI.show('gameover', { summary: { result: 'defeat', act: 2, party: party, killedBy: 'Grimble', stats: {} } }); });
    t.eq(textOf('.end-killer'), 'Felled by Grimble in Act II.', 'a v2 summary: as before');
    t.ok(!q('.end-floor'), 'and no floor bosses');
    t.tryRun('title', function () { UI.show('title'); });
  }

  T.suite('ui: V3 — the Hall: the codex hides Act IV and act-4 defs (groups, Miscellaneous Horrors, counts) until Svammiel is met; then records, history and the classic label', function (t) {
    return withActs(4, function () { return hallGate(t); });
  });
  async function hallGate(t) {
    const UI = DD.UI;
    UI.init();
    reset();
    if (DD.Run && typeof DD.Run.clear === 'function') DD.Run.clear();
    DD.Run.state = null;
    const real = Object.keys(DD.defs.enemies).filter(function (id) { return id.indexOf('test_') !== 0; }).map(function (id) { return DD.defs.enemies[id]; });
    const act4 = real.filter(function (e) { return +e.act === 4; });
    const party = UI.heroIds().slice(0, 4).map(function (id) { return { id: id, level: 5 }; });
    const fin = DD.RunMap.finaleOf(4);
    const lanes = DD.RunMap.gauntletLanes(4);
    const history = [
      { result: 'victory', act: 3, party: party, stats: {}, endedAt: 1000 },                                                   // v2: classic
      { result: 'victory', act: 4, acts: 4, party: party, stats: {}, gauntlet: lanes.map(function (l) { return l.id; }), gauntletLanes: lanes.length, floorBoss: true, endedAt: 3000 },
      { result: 'defeat', act: 4, acts: 4, party: party, stats: {}, gauntlet: lanes.slice(0, 2).map(function (l) { return l.id; }), gauntletLanes: 7,
        killedBy: fin ? fin.shortName : 'Svammiel', killedByEncounter: fin ? fin.id : null, endedAt: 2000 },
    ];
    await withGate(false, async function () {
      DD.Meta.data.history = history.slice();
      Object.assign(DD.Meta.data.stats, { runs: 3, wins: 2, dmDefeated: 2, miniBosses: 9 });
      act4.forEach(function (e) { DD.Meta.data.seen.enemies[e.id] = 1; });   // even seen, they stay hidden before the gate
      t.tryRun('codex (gate shut)', function () { UI.show('hall', { tab: 'codex' }); });
      const heads = qa('.codex-h').map(function (h) { return h.textContent; });
      t.ok(!heads.some(function (h) { return /Act IV|Under the Table/.test(h); }), 'no Act IV group: ' + heads.join(' | '));
      t.eq(qa('.hall-codex .cx-card').length, real.length - act4.length, 'every non-act-4 enemy has a card, no act-4 one (' + (real.length - act4.length) + ')');
      t.ok(!/Svammiel/.test(q('.hall-body').textContent), 'nothing names Svammiel');
      t.tryRun('records (gate shut)', function () { UI.show('hall', { tab: 'records' }); });
      const rec = q('.hall-body').textContent;
      t.ok(!/The DM defeated|Floor bosses|classic/.test(rec), 'records: no act-IV cards');
      const prog = qa('.prog-h').filter(function (p) { return /Codex entries/.test(p.textContent); })[0];
      t.ok(prog && new RegExp('/ ' + (real.length - act4.length) + '$').test(prog.textContent), 'the codex count leaves act-4 defs out: ' + (prog && prog.textContent));
      t.tryRun('history (gate shut)', function () { UI.show('hall', { tab: 'history' }); });
      t.ok(qa('.hist-title').some(function (h) { return /^Victory!/.test(h.textContent); }) && !/classic/.test(q('.hall-body').textContent), 'a classic win is just "Victory!" while act IV is a secret');
    });
    await withGate(true, async function () {
      DD.Meta.data.history = history.slice();
      Object.assign(DD.Meta.data.stats, { runs: 3, wins: 2, dmDefeated: 2, miniBosses: 9, classicWins: 1 });
      t.tryRun('records (gate open)', function () { UI.show('hall', { tab: 'records' }); });
      const card = function (re) { return qa('.rec-card').filter(function (c) { return re.test(c.querySelector('.rc-label').textContent); })[0]; };
      t.ok(card(/^The DM defeated$/) && card(/^The DM defeated$/).querySelector('.rc-val').textContent === '2', 'records: the DM defeated');
      t.ok(card(/^Floor bosses beaten$/) && card(/^Floor bosses beaten$/).querySelector('.rc-val').textContent === '9', 'records: floor bosses beaten (the lifetime sum)');
      t.ok(card(/Campaigns won \(of which classic: 1\)/), 'records: campaigns won, of which classic');
      // V3.1 polish: the classic count is the lifetime stat, not the 20-entry history (a v2 veteran with 25 classic wins
      // whose history holds one of them still reads 25)
      Object.assign(DD.Meta.data.stats, { runs: 30, wins: 26, classicWins: 25 });
      t.tryRun('records (a v2 veteran)', function () { UI.show('hall', { tab: 'records' }); });
      t.ok(card(/Campaigns won \(of which classic: 25\)/), 'records: of which classic reads stats.classicWins (25), not the history (1)');
      Object.assign(DD.Meta.data.stats, { runs: 3, wins: 2, classicWins: 0 });
      t.tryRun('records (no classic win)', function () { UI.show('hall', { tab: 'records' }); });
      t.ok(card(/^Campaigns won$/), 'records: no classic win in the lifetime stat: plain "Campaigns won" (the history\'s v2 win is not counted)');
      Object.assign(DD.Meta.data.stats, { runs: 3, wins: 2, classicWins: 1 });
      t.tryRun('history (gate open)', function () { UI.show('hall', { tab: 'history' }); });
      const rows = qa('.hist-row');
      const titles = rows.map(function (r) { return r.querySelector('.hist-title').textContent; });
      t.ok(titles.some(function (s) { return /^Won \(classic, 3 acts\)/.test(s); }), 'the v2 win: "Won (classic, 3 acts)"');
      t.ok(titles.some(function (s) { return /^Victory! The floor boss, floored/.test(s); }), 'the four-act win');
      if (fin) {
        const k = UI.killerOf({ killedBy: fin.shortName, killedByEncounter: fin.id });
        t.ok(titles.some(function (s) { return s === 'Fell in Act IV to ' + k.name + ' (he cheated)'; }), 'the floor boss\'s kill: "Fell in Act IV to ' + k.name + ' (he cheated)"');
      }
      const floors = qa('.hist-floor').map(function (f) { return f.textContent; });
      t.ok(floors.some(function (s) { return s.indexOf('Act IV · 2 / 7 floor bosses') === 0; }), 'a run\'s own lane count: "Act IV · 2 / 7 floor bosses" (' + floors.join(' | ') + ')');
      t.ok(floors.some(function (s) { return s.indexOf('Act IV · ' + lanes.length + ' / ' + lanes.length + ' floor bosses') === 0; }), 'the won run: every lane');
      t.eq(qa('.hist-row')[1] ? qa('.hist-row')[1].querySelectorAll('.hist-lanes span').length : -1, Math.min(2, lanes.length), 'the lanes beaten as icons');
      t.tryRun('codex (gate open)', function () { UI.show('hall', { tab: 'codex' }); });
      const h4 = q('.codex-h.act-4');
      if (act4.length) {
        t.ok(h4 && /^Act IV — Under the Table/.test(h4.textContent), 'the Act IV group: ' + (h4 && h4.textContent));
        t.eq(qa('.hall-codex .cx-card:not(.cx-thing)').length, real.length, 'every real enemy has a card now (' + real.length + ')');
        const subs = qa('.codex-sub').map(function (s) { return s.textContent; });
        t.ok(subs.length >= 1, 'one sub-group per lane, then the floor boss: ' + subs.join(' | '));
        const goats = lanes.filter(function (l) { return l.id === 'goats'; })[0];
        if (goats) {
          const head = qa('.codex-sub').filter(function (s) { return /The Rapping Goats \(Herd Mentality, feat\. Ursa Verse\)/.test(s.textContent); })[0];
          t.ok(head, 'the goats\' group: "The Rapping Goats (Herd Mentality, feat. Ursa Verse)"');
          const grid = head && head.nextElementSibling;
          t.eq(grid ? grid.querySelectorAll('.cx-card').length : 0, 8, 'with its 8 entries (4 units, the Mic Stand, the Golden Mic, the Speaker Stack, the Hay Bale)');
        } else t.log('goats.js not loaded: the goats\' codex group is not checked');
      } else {
        t.ok(!h4, 'no real act-4 enemy loaded: no Act IV group');
        t.log('no real act-4 content loaded: the Act IV group itself is not checked');
      }
    });
    t.tryRun('title', function () { UI.show('title'); });
  }

  T.suite('ui: V3 — settings: "Svammiel\'s cameos" (Full / Short / Log only) shows only after the gate and persists', function (t) {
    return withGate(false, async function () {
      const UI = DD.UI;
      UI.init();
      reset();
      const before = DD.Meta.data.settings.cameos;
      t.tryRun('settings (gate shut)', function () { UI.show('settings', {}); });
      t.ok(!/Svammiel|cameo/i.test(root().textContent), 'gate shut: Settings names no Svammiel and no cameos');
      DD.Meta.data.seen.bosses.svammiel = Date.now();
      try {
        t.tryRun('settings (gate open)', function () { UI.show('settings', {}); });
        const row = qa('.set-row').filter(function (r) { return /Svammiel's cameos/.test(r.querySelector('.set-label').textContent); })[0];
        t.ok(row, 'gate open: the "Svammiel\'s cameos" row');
        const segs = row ? Array.prototype.slice.call(row.querySelectorAll('.seg')) : [];
        const choices = DD.Meta.CAMEO_SETTINGS || ['full', 'short', 'log'];
        t.eq(segs.map(function (s) { return s.textContent.trim(); }).join(' / '), 'Full / Short / Log only', 'Full / Short / Log only');
        t.eq(segs.map(function (s) { return s.dataset.v; }).join(','), choices.join(','), 'from DD.Meta.CAMEO_SETTINGS');
        const short = segs.filter(function (s) { return s.dataset.v === 'short'; })[0];
        if (short) short.click();
        t.eq(DD.Meta.data.settings.cameos, 'short', 'a click sets settings.cameos');
        t.eq((DD.Storage.get(DD.Meta.KEY || 'meta', {}) || {}).settings.cameos, 'short', 'and it is saved');
        t.tryRun('settings again', function () { UI.show('settings', {}); });
        const act = qa('.cameo-seg .seg.active');
        t.ok(act.length === 1 && act[0].dataset.v === 'short', 'it persists: Short is selected');
      } finally {
        DD.Meta.data.settings.cameos = before;
        UI.show('title');
      }
    });
  });

  T.suite('ui: V3 — spoilers and counts: act IV unnamed before the gate (act-1 map legend, act-3 clear with a 3-act knob, title tagline and tips); UI.ACTS[4].sub names no number', function (t) {
    return uiSandbox(t, function () { return spoilers(t); });
  });
  async function spoilers(t) {
    const UI = DD.UI;
    UI.init();
    reset();
    const a4 = UI.ACTS[4];
    t.ok(a4 && a4.roman === 'IV' && a4.name === 'Under the Table', 'UI.ACTS[4]: Act IV, Under the Table');
    t.ok(a4 && !/\d|\b(one|two|three|four|five|six|seven)\b/i.test(a4.sub), 'its sub is count-free: ' + (a4 && a4.sub));
    await withGate(false, async function () {
      for (const acts of [3, 4]) {
        await withActs(acts, async function () {
          const run = makeRun(t);
          if (!run) return;
          try {
            UI.show('map', {});
            t.ok(!/Mini-boss/.test(textOf('.map-legend')), 'acts=' + acts + ': an act-1 map\'s legend has no Mini-boss entry');
            t.ok(!/Svammiel|Act IV|Under the Table/.test(root().textContent), 'acts=' + acts + ': the act-1 map names neither Svammiel nor act IV');
          } finally { endRun(t); }
        });
      }
      await withActs(3, async function () {
        t.tryRun('the act-3 clear (3-act knob)', function () { UI.show('victory', { act: 3 }); });
        t.ok(!/Act IV|Under the Table|Svammiel/.test(root().textContent), 'a 3-act knob: the act-3 clear names no act IV');
      });
      // the title: a forced pick of the last tagline and of an act-4 tip (when the pool exists) shows neither
      const rnd = Math.random, next = DD.rng.next;
      const tips4 = poolOf('tips_act4', []);
      try {
        Math.random = function () { return 0.9999; };
        DD.rng.next = function () { return 0; };
        UI.show('title');
        t.ok(textOf('.tagline').indexOf('Now with a fourth act') < 0, 'gate shut: the title tagline never says "a fourth act"');
        t.ok(tips4.indexOf(textOf('.title-tip span:last-child')) < 0, 'gate shut: no tips_act4 line');
        DD.Meta.data.seen.bosses.svammiel = Date.now();
        UI.show('title');
        t.eq(textOf('.tagline'), '“Now with a fourth act. Allegedly.”', 'gate open: the tagline joins the rotation');
        if (tips4.length) t.ok(tips4.indexOf(textOf('.title-tip span:last-child')) >= 0, 'gate open: tips_act4 join the loading tips');
      } finally {
        Math.random = rnd;
        DD.rng.next = next;
        UI.show('title');
      }
    });
  }

  T.suite('ui: V3 — the shop under new management (the demoted DM, the Bribe) and the tavern rug, only under the table', function (t) {
    return uiSandbox(t, function () { return withActs(4, function () { return shopTavern4(t); }); });
  });
  async function shopTavern4(t) {
    const UI = DD.UI;
    UI.init();
    reset();
    const run = gauntletRun(t);
    if (!run) { endRun(t); return; }
    try {
      run.gold = 900;
      t.tryRun('the act-4 shop', function () { UI.show('shop', { debug: true }); });
      t.eq(textOf('.keeper-sign'), 'Ye Olde Overpriced Shoppe (Under New Management)', 'the sign');
      t.eq(textOf('.keeper-name'), 'The DM (Demoted)', 'the DM works the counter');
      const bribe = qa('.keeper .ks-row').filter(function (r) { return /Bribe/.test(r.textContent); })[0];
      t.ok(bribe, 'the Bribe is at the counter while a door is left');
      const btn = bribe && bribe.querySelector('.btn.buy');
      t.ok(btn && !btn.classList.contains('is-disabled'), 'and buyable');
      if (btn) btn.click();
      t.eq(UI.run().flags.cameo && UI.run().flags.cameo.bribe, 1, 'buying it sets run.flags.cameo.bribe');
      t.tryRun('the act-4 tavern', function () { UI.show('tavern', { debug: true }); });
      t.ok(/NO DEMONS PAST THE RUG/.test(textOf('.tav-rug-sign')) && root().classList.contains('under-table'), 'the tavern: the rug and its sign');
    } finally { endRun(t); }
    const run1 = makeRun(t);
    if (!run1) return;
    try {
      run1.gold = 900;
      UI.show('shop', { debug: true });
      t.ok(!/Under New Management|Demoted|Bribe/.test(root().textContent), 'an act-1 shop: Gregor, no Bribe');
      UI.show('tavern', { debug: true });
      t.ok(!q('.tav-rug-sign') && !root().classList.contains('under-table'), 'an act-1 tavern: no rug');
    } finally { endRun(t); }
  }

  /** In a game frame: the run's map rebuilt as a gauntlet of exactly L lanes (the registry's, then stand-ins that
   *  reuse a real lane's encounter under a new lane id — the worst-case label — when fewer are loaded). */
  function frameGauntlet(W, L) {
    const D = W.DD;
    const lanes = D.RunMap.gauntletLanes(4).slice(0, L);
    const long = lanes.slice().sort(function (a, b) { return String((D.getEncounter(b.encounterId) || {}).shortName || '').length - String((D.getEncounter(a.encounterId) || {}).shortName || '').length; })[0];
    for (let k = 0; lanes.length < L && long; k++) lanes.push({ id: 'test_ui_pad' + k, encounterId: long.encounterId, order: 90 + k });
    const run = D.Run.state;
    run.map = D.RunMap.generate(4, D.RNG('ui:gauntlet:' + L), { run: run, lanes: lanes, shape: 'gauntlet' });
    run.nodeId = null;
    run.visited = [];
    D.UI.show('map', { act: 4 });
    return run.map;
  }
  function overlaps(a, b, pad) { pad = pad || 0; return a.left < b.right - pad && b.left < a.right - pad && a.top < b.bottom - pad && b.top < a.bottom - pad; }

  T.suite('ui: V3 — Svammiel\'s floor fits five and six doors a row (12 and 14 rows) at 1280×720 and 1024×640: no overlap, no scrolling, no cut label (real page)', async function (t) {
    const sizes = [[1280, 720], [1024, 640]];
    for (let i = 0; i < sizes.length; i++) {
      const w = sizes[i][0], h = sizes[i][1];
      const f = await gameFrame('debug=1&acts=4&screen=map&act=4&seed=7', w, h);
      try {
        const W = f.contentWindow;
        const ok = await frameUntil(function () { return W.DD && W.DD.UI && W.DD.UI.current === 'map' && W.document.querySelector('.map-board.gauntlet'); }, 15000);
        t.ok(ok, w + '×' + h + ': debug act=4 opens Svammiel\'s floor');
        if (!ok) continue;
        t.log(w + '×' + h + ': the registry has ' + W.DD.RunMap.gauntletLanes(4).length + ' lanes');
        for (let L = 5; L <= 6; L++) {
          const map = frameGauntlet(W, L);
          await tick(120);
          const at = w + '×' + h + ' L=' + L;
          t.eq(map.lanes.length, L, at + ': ' + L + ' lanes, ' + map.rows + ' rows');
          const doc = W.document;
          const board = doc.querySelector('.map-board.gauntlet');
          const br = board.getBoundingClientRect();
          const nodes = Array.prototype.slice.call(doc.querySelectorAll('.map-board .map-node'));
          t.eq(nodes.length, Object.keys(map.nodes).length, at + ': every node drawn (' + nodes.length + ')');
          const xs = {};
          nodes.forEach(function (n) { xs[Math.round(n.getBoundingClientRect().left + n.getBoundingClientRect().width / 2)] = 1; });
          t.eq(Object.keys(xs).length, map.rows, at + ': one column per row (' + map.rows + ')');
          const nr = nodes.map(function (n) { return n.getBoundingClientRect(); });
          const outside = nr.filter(function (r) { return r.left < br.left - 1 || r.right > br.right + 1 || r.top < br.top - 1 || r.bottom > br.bottom + 1; });
          t.eq(outside.length, 0, at + ': every node on the board');
          let hit = 0;
          for (let a = 0; a < nr.length; a++) for (let b = a + 1; b < nr.length; b++) if (overlaps(nr[a], nr[b], 1)) hit++;
          t.eq(hit, 0, at + ': no two nodes overlap');
          const labels = Array.prototype.slice.call(doc.querySelectorAll('.map-board .mn-lane, .map-board .mn-label'));
          const lr = labels.map(function (l) { return l.getBoundingClientRect(); });
          const cut = labels.filter(function (l) { return l.scrollHeight > l.clientHeight + 1 || l.scrollWidth > l.clientWidth + 1; }).map(function (l) { return l.textContent; });
          t.eq(cut.length, 0, at + ': no label is cut' + (cut.length ? ': ' + cut.slice(0, 3).join(' | ') : ''));
          let lhit = 0, lnode = 0;
          const bad = [];
          for (let a = 0; a < lr.length; a++) {
            for (let b = a + 1; b < lr.length; b++) if (overlaps(lr[a], lr[b], 1)) { lhit++; bad.push(labels[a].textContent + ' × ' + labels[b].textContent); }
            const own = labels[a].closest('.map-node');
            nodes.forEach(function (n, k) { if (n !== own && overlaps(lr[a], nr[k], 1)) { lnode++; bad.push(labels[a].textContent + ' × node ' + n.dataset.id); } });
            if (lr[a].left < br.left - 1 || lr[a].right > br.right + 1 || lr[a].bottom > br.bottom + 1) { lnode++; bad.push(labels[a].textContent + ' off the board'); }
          }
          t.eq(lhit + lnode, 0, at + ': labels clear of each other, of other nodes and of the board edge' + (bad.length ? ': ' + bad.slice(0, 3).join(' | ') : ''));
          const others = ['.map-narration', '.map-legend', '.g-doodle-svam', '.g-doodle-dm'].map(function (s) { return doc.querySelector('.map-board ' + s); })
            .filter(function (e) { return e && W.getComputedStyle(e).display !== 'none'; });
          const clash = [];
          others.forEach(function (e) {
            const r = e.getBoundingClientRect();
            nodes.forEach(function (n, k) { if (!(e.classList.contains('g-doodle-svam') && n.classList.contains('t-boss')) && overlaps(r, nr[k], 1)) clash.push(e.className + ' × ' + n.dataset.id); });
            lr.forEach(function (l, k) { if (overlaps(r, l, 1)) clash.push(e.className + ' × ' + labels[k].textContent); });
          });
          t.eq(clash.length, 0, at + ': the narration box, the legend and the doodles cover no node or label' + (clash.length ? ': ' + clash.slice(0, 3).join(' | ') : ''));
          t.ok(board.scrollHeight <= board.clientHeight + 1 && board.scrollWidth <= board.clientWidth + 1, at + ': the board needs no scrolling');
        }
      } finally { f.remove(); }
    }
  });

  T.suite('ui: V3 — the act-4 counter (heal, scar, re-roll and the Bribe) fits 1024×640 and 1280×720: every service and both buttons on screen, nothing cut (real page)', async function (t) {
    const sizes = [[1024, 640], [1280, 720]];
    for (let i = 0; i < sizes.length; i++) {
      const w = sizes[i][0], h = sizes[i][1];
      const f = await gameFrame('debug=1&acts=4&screen=shop&act=4&seed=7&gold=500', w, h);
      try {
        const W = f.contentWindow;
        const ok = await frameUntil(function () { return W.DD && W.DD.UI && W.DD.UI.current === 'shop' && W.document.querySelector('.keeper .ks-row'); }, 15000);
        t.ok(ok, w + '×' + h + ': the act-4 shop is up');
        if (!ok) continue;
        await tick(80);
        const doc = W.document;
        const keeper = doc.querySelector('.keeper');
        const kr = keeper.getBoundingClientRect();
        const rows = Array.prototype.slice.call(doc.querySelectorAll('.keeper .ks-row'));
        t.ok(rows.some(function (r) { return /Bribe/.test(r.textContent); }) && keeper.classList.contains('svc-4'), w + '×' + h + ': four services, the Bribe among them (' + rows.length + ')');
        const parts = rows.concat(Array.prototype.slice.call(doc.querySelectorAll('.keeper-actions .btn')));
        const off = parts.filter(function (n) { const r = n.getBoundingClientRect(); return r.bottom > kr.bottom + 1 || r.right > kr.right + 1 || r.left < kr.left - 1 || r.bottom > h; });
        t.eq(off.length, 0, w + '×' + h + ': every service row and both buttons inside the keeper column' + (off.length ? ': ' + off.map(function (n) { return n.textContent.trim().slice(0, 20); }).join(' | ') : ''));
        const cut = Array.prototype.slice.call(doc.querySelectorAll('.keeper .btn-label, .keeper .ks-name, .keeper-sign, .keeper-name')).filter(function (n) {
          return W.getComputedStyle(n).display !== 'none' && (n.scrollWidth > n.clientWidth + 1 || n.getBoundingClientRect().right > n.closest('.btn, .ks-row, .keeper').getBoundingClientRect().right + 1);
        });
        t.eq(cut.length, 0, w + '×' + h + ': no label is cut' + (cut.length ? ': ' + cut.map(function (n) { return n.textContent; }).join(' | ') : ''));
        t.eq(doc.querySelector('.keeper-sign').textContent, 'Ye Olde Overpriced Shoppe (Under New Management)', w + '×' + h + ': under new management');
      } finally { f.remove(); }
    }
  });

  T.suite('ui: V3 — the League\'s full name never overflows: map tooltip, rewards banner, game-over killer, Hall history (real page)', async function (t) {
    const w = 1024, h = 640;
    const f = await gameFrame('debug=1&acts=4&screen=map&act=4&seed=7', w, h);
    try {
      const W = f.contentWindow;
      const ok = await frameUntil(function () { return W.DD && W.DD.UI && W.DD.UI.current === 'map' && W.document.querySelector('.map-board.gauntlet'); }, 15000);
      t.ok(ok, 'Svammiel\'s floor is up');
      if (!ok) return;
      const D = W.DD, doc = W.document;
      D.Meta.save = function () { return true; };   // this frame never writes the shared meta save
      const FULL = (D.League && D.League.FULL) || LEAGUE_FULL;
      t.eq(FULL.length, 72, 'the full name: 72 characters');
      const fits = function (sel, label) {
        const n = doc.querySelector(sel);
        if (!n) { t.fail(label + ': ' + sel + ' missing'); return; }
        const r = n.getBoundingClientRect();
        t.ok(n.scrollWidth <= n.clientWidth + 1 && r.left >= -1 && r.right <= w + 1, label + ': it wraps inside its box (' + n.scrollWidth + ' / ' + n.clientWidth + ', right ' + Math.round(r.right) + ')');
      };
      const run = D.Run.state;
      const lane = run.map.lanes.filter(function (l) { return (D.getEncounter(l.encounterId) || {}).name === FULL; })[0];
      if (lane) {
        const door = Array.prototype.slice.call(doc.querySelectorAll('.map-node.t-miniboss')).filter(function (n) { return n.dataset.lane === lane.id && n.classList.contains('s-reachable'); })[0] ||
          doc.querySelector('.map-node.t-miniboss[data-lane="' + lane.id + '"]');
        door.dispatchEvent(new W.MouseEvent('mouseenter'));
        await tick(200);
        const tt = doc.querySelector('.ui-tooltip');
        t.ok(tt && tt.style.display !== 'none' && tt.textContent.indexOf(FULL) >= 0, 'the door tooltip names the League in full');
        if (tt) {
          const r = tt.getBoundingClientRect();
          t.ok(r.left >= 0 && r.right <= w && r.top >= 0 && r.bottom <= h, 'the tooltip stays on screen');
          const wide = Array.prototype.slice.call(tt.querySelectorAll('.tt-title, .tt-desc, .tt-target')).filter(function (n) { return n.scrollWidth > n.clientWidth + 1; });
          t.eq(wide.length, 0, 'map tooltip: every line wraps inside it');
        }
        door.dispatchEvent(new W.MouseEvent('mouseleave'));
        D.UI.hideTooltip();
      } else t.log('league.js not loaded: the map tooltip is not checked');
      D.UI.show('rewards', { title: 'Mini-boss Defeated!', encounterName: FULL, kind: 'boss', boss: true, choices: [], gold: 0 });
      await tick(60);
      fits('.rw-banner-sub', 'rewards banner');
      const party = D.UI.heroIds().slice(0, 4).map(function (id) { return { id: id, level: 5 }; });
      D.UI.show('gameover', { summary: { result: 'defeat', act: 4, acts: 4, party: party, killedBy: FULL, gauntlet: [], gauntletLanes: 5, stats: {} } });
      await tick(60);
      fits('.end-killer', 'game-over killer');
      D.Meta.data.history = [{ result: 'defeat', act: 4, acts: 4, party: party, killedBy: FULL, gauntlet: ['league'], gauntletLanes: 5, stats: {}, endedAt: Date.now() }];
      D.Meta.data.seen.bosses.svammiel = Date.now();
      D.UI.show('hall', { tab: 'history' });
      await tick(60);
      fits('.hist-title', 'Hall history');
      fits('.hist-row', 'Hall history row');
    } finally { f.remove(); }
  });

  T.suite('ui: V3 — debug params: acts, act=4, beaten, twist=1, final=1, game over in act IV, cameo, bosshp (real page)', async function (t) {
    async function open(query, until) {
      const f = await gameFrame(query, 1280, 720);
      const W = f.contentWindow;
      const ok = await frameUntil(function () { return W.DD && W.DD.UI && until(W); }, 15000);
      t.ok(ok, query + ': up');
      return { f: f, W: W, ok: ok };
    }
    let p = await open('debug=1&acts=4&screen=map&act=4&seed=7', function (W) { return W.DD.UI.current === 'map'; });
    let ids = [];
    try {
      if (p.ok) {
        const D = p.W.DD;
        t.eq(D.finalAct(), 4, 'acts=4 sets the knob for the page');
        t.ok(D.Run.state.act === 4 && D.Run.state.map.shape === 'gauntlet', 'act=4: the run is on Svammiel\'s floor');
        t.ok(D.Run.state.party.every(function (h) { return h.level >= 4; }), 'with a party at the act\'s level');
        t.ok(D.UI.act4Seen(), 'a debug run below the table has met him: the spoiler gate is open for the page');
        ids = D.Run.state.map.lanes.map(function (l) { return l.id; });
      }
    } finally { p.f.remove(); }
    if (ids.length >= 2) {
      const beaten = [ids[1], ids[0]];
      p = await open('debug=1&acts=4&screen=map&act=4&seed=7&beaten=' + beaten.join(','), function (W) { return W.DD.UI.current === 'map'; });
      try {
        if (p.ok) {
          const S = p.W.DD.Run.state;
          t.eq((S.map.beaten || []).join(','), beaten.join(','), 'beaten= seals the lanes in that order');
          const both = Array.prototype.slice.call(p.W.document.querySelectorAll('.map-node.t-miniboss')).filter(function (n) { return beaten.indexOf(n.dataset.lane) >= 0; });
          t.ok(both.length === 2 * ids.length && both.every(function (n) { return n.classList.contains('s-sealed') || n.classList.contains('s-current'); }), 'every door of both lanes is sealed (the party stands on one)');
          t.eq(S.map.nodes[S.nodeId].lane, beaten[1], 'the party stands at the last door beaten');
        }
      } finally { p.f.remove(); }
    }
    p = await open('debug=1&acts=4&screen=map&start=4&seed=7', function (W) { return W.DD.UI.current === 'map'; });
    try {
      if (p.ok) t.ok(p.W.DD.Run.state.act === 4 && p.W.DD.Run.state.map.shape === 'gauntlet', 'start=4 (the sims\' name) works like act=4');
    } finally { p.f.remove(); }
    p = await open('debug=1&acts=3&screen=map&act=4&seed=7', function (W) { return W.DD.UI.current === 'map'; });
    try {
      if (p.ok) t.ok(p.W.DD.finalAct() === 3 && p.W.DD.Run.state.act === 3 && p.W.DD.Run.state.map.shape !== 'gauntlet', 'acts=3: act=4 clamps to act 3 (no act IV without the knob)');
    } finally { p.f.remove(); }
    p = await open('debug=1&acts=4&screen=victory&act=3&twist=1&seed=7', function (W) { return W.DD.UI.current === 'victory' && W.document.querySelector('.tw-go'); });
    try {
      if (p.ok) {
        const doc = p.W.document;
        t.ok(/YOU THOUGHT THIS WAS OVER\?/.test(doc.querySelector('.tw-headline').textContent) && /Descend to Act IV/.test(doc.querySelector('.tw-go').textContent), 'twist=1: the Twist panel');
        t.eq(doc.querySelectorAll('.twc-lane').length, ids.length || doc.querySelectorAll('.twc-lane').length, 'its cast card lists the lanes');
        const sc = doc.querySelector('.end-scroll');
        t.ok(sc && sc.scrollHeight <= sc.clientHeight + 2, 'the panel fits 1280×720 without scrolling (' + (sc && sc.scrollHeight) + ' / ' + (sc && sc.clientHeight) + ')');
      }
    } finally { p.f.remove(); }
    p = await open('debug=1&acts=4&screen=victory&final=1&act=4&seed=7', function (W) { return W.DD.UI.current === 'victory'; });
    try {
      if (p.ok) {
        const doc = p.W.document;
        t.ok(doc.querySelector('.screen.four-act, .four-act') && /For Real This Time/.test(doc.querySelector('.end-kicker').textContent), 'final=1&act=4: the four-act victory');
        const floor = Array.prototype.slice.call(doc.querySelectorAll('.end-stat')).filter(function (s) { return /Floor bosses/.test(s.textContent); })[0];
        t.ok(floor && floor.querySelector('.es-val').textContent === ids.length + ' / ' + ids.length, 'every lane beaten: ' + (floor && floor.querySelector('.es-val').textContent));
        const stats = Array.prototype.slice.call(doc.querySelectorAll('.end-stat')).map(function (s) { return Math.round(s.getBoundingClientRect().top); });
        t.ok(stats.every(function (y) { return y === stats[0]; }), 'the stat grid stays one row at 1280×720 (' + stats.length + ' stats)');
      }
    } finally { p.f.remove(); }
    p = await open('debug=1&acts=4&screen=gameover&act=4&seed=7', function (W) { return W.DD.UI.current === 'gameover'; });
    try {
      if (p.ok) {
        const k = p.W.document.querySelector('.end-killer');
        t.ok(k && / in Act IV \(he cheated\)\.$/.test(k.textContent), 'gameover in act 4: ' + (k && k.textContent));
        t.ok(/Floor bosses beaten: 0 \/ \d+/.test(p.W.document.querySelector('.end-floor').textContent), 'with the floor bosses beaten');
      }
    } finally { p.f.remove(); }
    p = await open('debug=1&screen=hall&tab=codex', function (W) { return W.DD.UI.current === 'hall' && W.document.querySelector('.hall-codex'); });
    try {
      if (p.ok) t.ok(!p.W.document.querySelector('.codex-h.act-4') && !/Svammiel/.test(p.W.document.querySelector('.hall-body').textContent), 'screen=hall&tab=codex: no Act IV before the gate');
    } finally { p.f.remove(); }
    p = await open('debug=1&gate=1&screen=hall&tab=codex', function (W) { return W.DD.UI.current === 'hall' && W.document.querySelector('.hall-codex'); });
    try {
      if (p.ok) {
        const doc = p.W.document;
        const h4 = doc.querySelector('.codex-h.act-4');
        t.ok(h4 && /Act IV — Under the Table/.test(h4.textContent), 'gate=1: the codex shows Act IV');
        const subs = Array.prototype.slice.call(doc.querySelectorAll('.codex-sub'));
        t.ok(subs.length >= ids.length, 'a sub-group per lane, then the floor boss (' + subs.map(function (s) { return s.textContent; }).join(' | ') + ')');
        const wide = subs.concat(Array.prototype.slice.call(doc.querySelectorAll('.codex-h, .cx-name'))).filter(function (n) { return n.scrollWidth > n.clientWidth + 1; });
        t.eq(wide.length, 0, 'no codex header or name overflows at 1280×720');
      }
    } finally { p.f.remove(); }
    p = await open('debug=1&cameo=short&screen=title', function (W) { return W.DD.UI.current === 'title'; });
    try { if (p.ok) t.eq(p.W.DD.Meta.data.settings.cameos, 'short', 'cameo=short sets the page\'s cameo setting'); } finally { p.f.remove(); }
    p = await open('debug=1&cameo=0&screen=title', function (W) { return W.DD.UI.current === 'title'; });
    try { if (p.ok) t.eq(p.W.DD.Balance.cameo.off, 1, 'cameo=0 switches every cameo off (DD.Balance.cameo.off)'); } finally { p.f.remove(); }
    p = await open('debug=1&fixtures=1&acts=4&screen=combat&encounter=test_a4_lane_c&seed=3&bosshp=0.5', function (W) { return W.DD.UI.current === 'combat' && W.DD.Combat.state && W.DD.Combat.state.units; });
    try {
      if (p.ok) {
        const bosses = p.W.DD.Combat.state.units.filter(function (u) { return u.side === 'enemy' && (u.defId === 'test_boss' || u.defId === 'test_brute'); });
        t.ok(bosses.length === 2 && bosses.every(function (u) { return u.hp === Math.max(1, Math.round(u.maxHp * 0.5)); }), 'bosshp=0.5: the squad starts at half HP (' + bosses.map(function (u) { return u.hp + '/' + u.maxHp; }).join(', ') + ')');
      }
    } finally { p.f.remove(); }
  });

  // ---- V3 QA fixes (render-ui cluster) -------------------------------------------------------------------------------
  T.suite('ui: QA HERO-8 — a tile skill open to anything targets "a tile" in its tooltip, not "any unit"', function (t) {
    const UI = DD.UI;
    const tileAny = Object.keys(DD.defs.skills).map(function (id) { return DD.defs.skills[id]; }).filter(function (d) {
      return d && d.target && d.target.type === 'tile' && (!d.target.filter || d.target.filter === 'any');
    });
    if (!tileAny.length) { t.skip('no tile skill open to anything is registered'); return; }
    const bad = tileAny.filter(function (d) { return UI.skillInfo(d.id, 1).target !== 'a tile'; });
    t.eq(bad.map(function (d) { return d.id; }).join(', '), '', 'every one of the ' + tileAny.length + ' says "a tile"');
    const id = DD.getSkill('ben_mail') ? 'ben_mail' : tileAny[0].id;
    const tip = UI.skillTooltipHtml(id, 1, null);
    t.ok(/Targets a tile/.test(tip) && !/Targets any unit/.test(tip), id + '\'s tooltip: "Targets a tile"');
    // the other labels stay as they were
    const enemy = Object.keys(DD.defs.skills).map(function (k) { return DD.defs.skills[k]; }).filter(function (d) { return d && d.target && d.target.type === 'unit' && d.target.filter === 'enemy'; })[0];
    if (enemy) t.eq(UI.skillInfo(enemy.id, 1).target, 'an enemy', enemy.id + ': "an enemy"');
    const empty = Object.keys(DD.defs.skills).map(function (k) { return DD.defs.skills[k]; }).filter(function (d) { return d && d.target && d.target.type === 'tile' && d.target.filter === 'empty'; })[0];
    if (empty) t.eq(UI.skillInfo(empty.id, 1).target, 'an empty tile', empty.id + ': "an empty tile"');
  });

  T.suite('ui: QA HERO-5 — a timed form that opts in (status def showTurns) shows its turns left on its chip; others show stacks only', function (t) {
    const UI = DD.UI;
    const id = DD.getStatus('ben_dragon') ? 'ben_dragon' : DD.getStatus('inspired') ? 'inspired' : null;
    if (!id) { t.skip('no status to try'); return; }
    const d = DD.getStatus(id);
    const had = Object.prototype.hasOwnProperty.call(d, 'showTurns'), was = d.showTurns;
    try {
      d.showTurns = false;
      let chip = UI.statusChip({ id: id, stacks: 1, turns: 2 });
      t.ok(!chip.querySelector('.st-turns'), 'without the flag: no turns badge');
      d.showTurns = true;
      chip = UI.statusChip({ id: id, stacks: 1, turns: 2 });
      const b = chip.querySelector('.st-turns');
      t.ok(b && b.textContent === '2' && /2 turns left/.test(b.title), id + ' with showTurns: "2" (' + (b && b.title) + ')');
      chip = UI.statusChip({ id: id, stacks: 1, turns: 1 });
      t.ok(chip.querySelector('.st-turns') && chip.querySelector('.st-turns').textContent === '1', 'then "1"');
      chip = UI.statusChip({ id: id, stacks: 1, turns: -1 });
      t.ok(!chip.querySelector('.st-turns'), 'a permanent one shows none');
      t.ok(/turns? left/.test(UI.statusTooltipHtml({ id: id, stacks: 1, turns: 2 })), 'the tooltip still says it in words');
      if (id === 'ben_dragon' && !had) t.log('ben_dragon does not set showTurns yet (a request to HERO-BENEDICK): the chip shows the turns once it does');
    } finally {
      if (had) d.showTurns = was; else delete d.showTurns;
    }
  });
})();
