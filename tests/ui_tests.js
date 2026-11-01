/* Dungeons and Degenerates — tests/ui_tests.js
 * META-UI suites (prefix "ui:"): DD.UI framework (el, buttons + hotkeys, modals / choice / confirm, Esc, toasts,
 * edge-aware tooltips), shared cards and tooltips over ALL registered content, and every screen mounted / unmounted
 * headlessly — without a run, and with a run built from whatever heroes are registered (fixtures or real) — plus the
 * main interactive flows (map travel, rewards pick, level-up, event choice, shop buy, tavern, party equip).
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
})();
