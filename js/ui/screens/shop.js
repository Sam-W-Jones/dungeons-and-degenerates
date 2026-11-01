/* Dungeons and Degenerates — js/ui/screens/shop.js
 * Ye Olde Overpriced Shoppe: a shopkeeper with narrated quips (shop_greet / shop_buy / shop_broke / shop_leave),
 * 3 items, 2 skill tomes (for specific heroes), 2 consumables and services (heal 30%, remove a scar, and re-roll a
 * Blessing while the random passive table has entries) at the counter under the shopkeeper (always visible, no
 * scrolling), each once. A re-roll opens THE ROLL MOMENT (DD.UI.passiveRoll) for the hero's fresh roll.
 * The run layer owns the stock and the rules: DD.Run.shop() is the pending stock, DD.Run.buy(section, i, opts)
 * buys (tomes pass the socket to forget as opts.replaceIdx), DD.Run.next() leaves. When a shop is opened without a
 * pending one (debug), a stock is rolled with DD.Rewards.shopInventory and installed as the pending step.
 */
(function () {
  'use strict';
  const DD = window.DD;

  const KEEPER = {
    name: 'Gregor Overcharge',
    title: 'Proprietor, Ye Olde Overpriced Shoppe',
    sprite: {
      base: 'humanoid', scale: 1, build: 'stocky', outfit: 'coat',
      palette: { skin: '#d9a77c', cloth: '#5b2d6e', cloth2: '#d4af37', hair: '#e8e2d6', metal: '#d4af37', eye: '#2b1d14', accent: '#9b59b6', outline: '#1a1014' },
      head: { size: 1.05, ears: 'none', horns: 'none', hair: 'short', beard: 'long', hat: 'tophat', face: 'monocle', eyes: 'normal', mouth: 'grin' },
      mainhand: 'none', offhand: 'lantern', bling: ['chain', 'rings'], extras: ['pouches'],
    },
  };
  const QUIPS = {
    shop_greet: ['Welcome, welcome! Everything is 100% authentic and 300% marked up.', 'Browse all you like. Touching costs extra.', 'Ah, adventurers! My favorite kind of wallet.'],
    shop_buy: ['A wise purchase. Probably.', 'No refunds. No returns. No eye contact.', 'Pleasure doing business. Mostly mine.'],
    shop_broke: ['Gold first, dreams second.', 'This is a shop, not a charity. The charity is two doors down and also a mimic.', 'Come back when you are less poor.'],
    shop_leave: ['Come again! Bring more gold!', 'Don\'t die before your next purchase!', 'Tell your friends. Especially the rich ones.'],
  };

  let st = null;

  function num(v) { v = +v; return isFinite(v) ? v : 0; }
  function R(name) { return DD.Run && typeof DD.Run[name] === 'function' ? DD.Run[name] : null; }
  function quip(key) { return DD.UI.narrate(key, {}, QUIPS[key]); }
  function say(text) {
    if (!st || !st.refs.bubble || !text) return;
    st.refs.bubble.textContent = text;
    st.refs.bubble.classList.remove('pop');
    void st.refs.bubble.offsetWidth;
    st.refs.bubble.classList.add('pop');
  }

  /** The pending stock, installing a freshly rolled one (debug / direct navigation) when there is none. */
  function stock() {
    const run = DD.UI.run();
    let s = R('shop') ? DD.safe('Run.shop', R('shop'), DD.Run) : null;
    if (s) return s;
    if (!run || run.over) return null;
    const p = run.pending;
    if (p && p.type === 'shop' && p.data) return p.data;
    if (!DD.Rewards || typeof DD.Rewards.shopInventory !== 'function') return null;
    const inv = DD.safe('Rewards.shopInventory', DD.Rewards.shopInventory, DD.Rewards, [run.act, DD.Run.rng(), run]);
    if (!inv) return null;
    run.pending = { type: 'shop', data: Object.assign({ nodeId: run.nodeId || null, greeting: quip('shop_greet') }, inv) };
    if (R('save')) DD.safe('Run.save', R('save'), DD.Run);
    return run.pending.data;
  }

  function heroIdxOf(entry, run) {
    if (entry.heroId) { for (let i = 0; i < run.party.length; i++) if (run.party[i].id === entry.heroId) return i; return -1; }
    return typeof entry.heroIdx === 'number' ? entry.heroIdx : -1;
  }

  /** Buy through the run layer; feedback via the shopkeeper bubble + toast. */
  function buy(section, index, opts, icon) {
    const UI = DD.UI;
    if (!R('buy')) { UI.toast('The shopkeeper is on a break (run system unavailable).', { cls: 'bad' }); return null; }
    const res = DD.safe('Run.buy', R('buy'), DD.Run, [section, index, opts || {}]) || { ok: false, text: '' };
    if (!res.ok) {
      UI.sound('error');
      if (res.reason === 'gold') say(res.text || quip('shop_broke'));
      UI.toast(res.text || 'That did not work.', { icon: res.reason === 'gold' ? '🪙' : '✋', cls: 'bad' });
    } else {
      UI.sound('buy');
      say(quip('shop_buy'));
      UI.toast(res.text, { icon: icon || '🛍️', cls: 'gold', ms: 3200 });
    }
    render();
    return res;
  }

  function buyTome(i, e) {
    const UI = DD.UI;
    const run = UI.run();
    const hi = heroIdxOf(e, run);
    const rh = run.party[hi];
    if (!rh || rh.dead) { UI.sound('error'); UI.toast('That tome was for someone who is no longer with us.', { icon: '⚰️' }); return; }
    if (num(run.gold) < num(e.price)) { buy('tomes', i, {}, e.icon); return; }
    UI.chooseSkillSlot(hi, e.id, { skipLabel: 'Never mind' }, function (ri) {
      if (ri === null) return;
      buy('tomes', i, ri >= 0 ? { replaceIdx: ri } : {}, e.icon);
    });
  }

  function buyScar(i, svc) {
    const UI = DD.UI, el = UI.el;
    const run = UI.run();
    const opts = [];
    (run.party || []).forEach(function (rh, hi) {
      if (rh.dead) return;
      (rh.scars || []).forEach(function (sid) {
        const d = DD.getScar(sid);
        opts.push({ icon: (d && d.icon) || '🩹', label: UI.heroName(rh) + ': ' + (d ? d.name : sid), desc: d ? d.desc : '', tooltip: UI.scarTooltipHtml(sid), onPick: function () { buy('services', i, { heroIdx: hi, scarId: sid }, svc.icon); } });
      });
    });
    if (!opts.length) { UI.toast('Nobody has scars. Suspiciously healthy party.', { icon: '✨' }); return; }
    UI.choice({ title: svc.label || 'Remove a Scar', icon: svc.icon || '🩹', text: el('div', null, 'Choose a scar to remove for ', UI.goldText(svc.price), '.'), options: opts, cancelLabel: 'Never mind', size: 'md' });
  }

  /** Re-roll a Blessing: pick which hero's Blessing to toss, pay, then THE ROLL MOMENT for the fresh roll. The cards
   *  wear their rarity colour; a full party (16 Blessings) gets hotkeys 1-9, 0, then A-F (UI.choice). */
  function buyReroll(i, svc) {
    const UI = DD.UI, el = UI.el;
    const run = UI.run();
    const opts = [];
    (run.party || []).forEach(function (rh, hi) {
      if (rh.dead) return;
      (rh.passives || []).forEach(function (p) {
        const info = UI.passiveInfo(p);
        opts.push({
          icon: info.icon, label: UI.heroName(rh) + ': ' + info.name + (info.maxLevel > 1 ? ' ' + DD.util.roman(info.level) : ''),
          desc: info.desc, badge: info.rarityName, tooltip: UI.passiveTooltipHtml(p),
          cls: 'rarity-' + info.rarity, style: { '--rc': info.color },
          onPick: function () {
            const res = buy('services', i, { heroIdx: hi, passiveId: p.id }, svc.icon);
            if (res && res.ok && res.queued) UI.passiveRoll(hi, { onDone: function () { if (st) render(); } });
          },
        });
      });
    });
    if (!opts.length) { UI.toast('Nobody has a Blessing to toss. Level up and roll some first.', { icon: '🎲' }); return; }
    UI.choice({
      title: svc.label || 'Re-roll a Blessing', icon: svc.icon || '🎲', size: 'md', cls: 'modal-reroll', cancelLabel: 'Never mind', options: opts,
      text: el('div.choice-text', null, 'Toss which Blessing? It is gone for good, and its hero rolls a fresh one (never the same) for ', UI.goldText(svc.price), '.'),
    });
  }

  function priceTag(price, sold, afford) {
    const UI = DD.UI;
    return UI.el('div.price-tag', { class: [sold ? 'sold' : '', afford ? '' : 'poor'] }, sold ? 'Sold' : UI.goldText(price));
  }

  /** One ware: card + price + Buy button (disabled with a reason tooltip). */
  function ware(card, entry, fn, blockReason) {
    const UI = DD.UI, el = UI.el;
    const run = UI.run();
    const price = num(entry.price);
    const sold = !!entry.sold;
    const afford = num(run.gold) >= price;
    const reason = sold ? 'Already sold.' : !afford ? 'You need ' + (price - num(run.gold)) + ' more gold.' : blockReason || null;
    const btn = UI.button(sold ? 'Sold' : 'Buy', fn, {
      cls: 'small buy' + (sold ? ' sold' : ''), disabled: !!reason,
      tooltip: reason ? '<div class="tt"><div class="tt-desc">' + UI.esc(reason) + '</div></div>' : null,
      onDisabled: function () { if (!sold && !afford) say(quip('shop_broke')); },
    });
    return el('div.ware', { class: sold ? 'sold' : '' }, card, el('div.ware-foot', null, priceTag(price, sold, afford), btn), sold ? el('div.sold-stamp', null, 'Sold') : null);
  }

  function render() {
    const UI = DD.UI, el = UI.el;
    const run = UI.run();
    const s = stock();
    if (!st || !run || !s) return;
    const bar = UI.runBar();
    st.refs.bar.replaceWith(bar);
    st.refs.bar = bar;
    const box = st.refs.wares;
    box.innerHTML = '';
    const sec = function (title, sub, kids, cls) {
      return el('section.ware-sec' + (cls ? '.' + cls : ''), null, el('div.ware-h', null, el('span', null, title), sub ? el('span.ware-sub', null, sub) : null), el('div.ware-row', null, kids));
    };
    const items = s.items || [], tomes = s.tomes || [], cons = s.consumables || [], services = s.services || [];
    // Blessings with runMods.price change every price here (never below 50%)
    const pm = num(s.priceMult) || 1;
    const priceNote = Math.abs(pm - 1) > 0.001 ? el('span.price-mod', { class: pm < 1 ? 'good' : 'bad', title: 'From your party\'s Blessings. Prices never drop below 50%.' },
      '🎲 Blessings: prices ' + (pm < 1 ? '−' : '+') + Math.round(Math.abs(pm - 1) * 100) + '%') : null;
    box.appendChild(sec('Gear', ['Auto-equipped into an empty slot when possible', priceNote], items.length ? items.map(function (e, i) {
      return ware(UI.itemCard(e.id, { tipPos: 'bottom' }), e, function () { buy('items', i, {}, e.icon); });
    }) : el('div.ware-empty', null, 'Out of stock. Gregor blames the supply chain.'), 'gear'));
    const lower = el('div.ware-split');
    lower.appendChild(sec('Skill Tomes', 'Teach a hero a new skill', tomes.length ? tomes.map(function (e, i) {
      const rh = run.party[heroIdxOf(e, run)];
      const known = rh && (rh.skills || []).some(function (x) { return x.id === e.id; });
      const card = el('div.tome', null, UI.skillCard(e.id, 1, { tipPos: 'bottom', unit: rh && !rh.dead ? rh : null }), rh ? el('div.tome-for', null, UI.portrait(rh.id, 22, { dead: rh.dead }), 'For ' + UI.heroName(rh)) : null);
      return ware(card, e, function () { buyTome(i, e); }, !rh || rh.dead ? 'That hero is no longer with us.' : known ? UI.heroName(rh) + ' already knows it.' : null);
    }) : el('div.ware-empty', null, 'The library is closed.'), 'tomes'));
    const full = (run.consumables || []).length >= (run.maxConsumables || 3);
    lower.appendChild(sec('Potions & Oddities', 'Bag: ' + (run.consumables || []).length + '/' + (run.maxConsumables || 3), cons.length ? cons.map(function (e, i) {
      return ware(UI.consumableCard(e.id, { tipPos: 'bottom' }), e, function () { buy('consumables', i, {}, e.icon); }, full ? 'Your bag is full.' : null);
    }) : el('div.ware-empty', null, 'All potions were drunk by the staff.'), 'cons'));
    box.appendChild(lower);
    renderServices(run, services);
  }

  /**
   * Services (heal, scar removal) live at the counter under the shopkeeper, so they are visible without scrolling
   * the wares at any window size.
   */
  function renderServices(run, services) {
    const UI = DD.UI, el = UI.el;
    const box = st.refs.services;
    if (!box) return;
    box.innerHTML = '';
    if (!services.length) return;
    const hasScars = (run.party || []).some(function (h) { return !h.dead && (h.scars || []).length; });
    const hurt = (run.party || []).some(function (h) { return !h.dead && num(h.hp) < UI.heroStats(h).maxHp; });
    const blessed = (run.party || []).some(function (h) { return !h.dead && (h.passives || []).length; });
    if (box.parentNode) box.parentNode.classList.toggle('svc-3', services.length >= 3); // Gregor shrinks to make room
    box.appendChild(el('div.ks-h', null, 'At the Counter', el('span.ks-sub', null, 'one of each per visit')));
    services.forEach(function (v, i) {
      const isHeal = v.id === 'heal';
      const isReroll = v.id === 'reroll';
      const price = num(v.price);
      const sold = !!v.sold;
      const afford = num(run.gold) >= price;
      const reason = sold ? 'Already used this visit.' : !afford ? 'You need ' + (price - num(run.gold)) + ' more gold.' :
        isHeal ? (hurt ? null : 'Everyone is already at full HP.') : isReroll ? (blessed ? null : 'Nobody has a Blessing to toss.') :
          (hasScars ? null : 'Nobody has any scars.');
      const btn = UI.button(sold ? 'Done' : 'Buy', function () {
        if (isHeal) buy('services', i, {}, v.icon);
        else if (isReroll) buyReroll(i, v);
        else buyScar(i, v);
      }, {
        cls: 'small buy' + (sold ? ' sold' : ''), disabled: !!reason,
        tooltip: reason ? '<div class="tt"><div class="tt-desc">' + UI.esc(reason) + '</div></div>' : null,
        onDisabled: function () { if (!sold && !afford) say(quip('shop_broke')); },
      });
      const row = el('div.ks-row', { class: sold ? 'sold' : '' },
        el('div.sv-icon', null, v.icon || '✚'),
        el('div.ks-main', null, el('div.ks-name', null, v.label || 'Service'), el('div.ks-desc', null, v.desc || '')),
        el('div.ks-foot', null, priceTag(price, sold, afford), btn));
      UI.tooltip(row, '<div class="tt"><div class="tt-title">' + UI.esc((v.icon || '') + ' ' + (v.label || 'Service')) + '</div><div class="tt-desc">' + UI.esc(v.desc || '') + '</div><div class="tt-foot">Price: ' + UI.goldHtml(price) + '</div></div>', { pos: 'right' });
      box.appendChild(row);
    });
  }

  /** Leave (Esc / button). The shop is gone for good afterwards, so an empty-handed exit asks first. */
  function leave() {
    const UI = DD.UI;
    const go = function () {
      UI.toast(quip('shop_leave'), { icon: '👋', ms: 2400 });
      if (R('next')) DD.safe('Run.next', R('next'), DD.Run);
      if (UI.current === 'shop') UI.show(UI.run() ? 'map' : 'title');
    };
    const s = stock();
    const boughtAny = !!s && ['items', 'tomes', 'consumables', 'services'].some(function (k) { return (s[k] || []).some(function (e) { return e && e.sold; }); });
    if (boughtAny) { go(); return; }
    UI.confirm('Leave without buying anything? Once you walk out, this shop is gone. Gregor does not do second chances. Or refunds.', { title: 'Leave the Shoppe?', yes: 'Leave', no: 'Keep browsing', icon: '🚪' })
      .then(function (ok) { if (ok && st) go(); });
  }

  DD.afterLoad(function () {
    if (!DD.UI) return;
    DD.UI.screen('shop', {
      scene: 'none',
      cls: 'full',
      mount: function (root) {
        const UI = DD.UI, el = UI.el;
        const run = UI.run();
        st = { refs: {} };
        const s = run && !run.over ? stock() : null;
        if (!s) {
          root.appendChild(el('div.center-message.panel', null, el('div.es-icon', null, '🛒'), el('h2', null, 'The shop is closed'), el('p', null, 'No campaign, no customers. Gregor is napping.'), UI.button(run ? 'Back to the Map' : 'Title', function () { UI.show(run && !run.over ? 'map' : 'title'); }, { cls: 'primary' })));
          return;
        }
        root.classList.add('act-' + (run.act || 1));
        st.refs.bar = UI.runBar();
        root.appendChild(st.refs.bar);
        st.refs.bubble = el('div.speech');
        st.refs.services = el('div.keeper-services');
        const keeper = el('aside.keeper.panel', null,
          el('div.keeper-sign', null, 'Ye Olde Overpriced Shoppe'),
          el('div.keeper-art', null, UI.portrait(KEEPER.sprite, 150, { frame: false, fallback: '🧙‍♂️' })),
          el('div.keeper-name', null, KEEPER.name),
          el('div.keeper-title', null, KEEPER.title),
          st.refs.bubble,
          st.refs.services,
          el('div.keeper-actions', null,
            UI.button('Party', function () { UI.show('party', { back: 'shop' }); }, { icon: '🎒', cls: 'small ghost', hotkey: 'p' }),
            UI.button('Leave Shop', leave, { icon: '🚪', cls: 'primary', hotkey: 'Escape', showKey: false })));
        st.refs.wares = el('main.wares.panel.scroll');
        root.appendChild(el('div.shop-layout', null, keeper, st.refs.wares));
        say(s.greeting || quip('shop_greet'));
        render();
        // a re-roll interrupted by a reload: show its roll again (it was stored, so it is the same roll)
        const shopRoll = function (r) { return r.src === 'shop'; };
        if (R('pendingRolls') && (DD.safe('Run.pendingRolls', R('pendingRolls'), DD.Run) || []).some(shopRoll) && UI.resolveRolls) {
          UI.resolveRolls(shopRoll, function () { if (st) render(); });
        }
      },
      update: function () { if (st && st.refs.wares) render(); },
      unmount: function () { st = null; },
    });
  });
})();
