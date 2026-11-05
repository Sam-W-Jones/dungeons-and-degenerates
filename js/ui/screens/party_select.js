/* Dungeons and Degenerates — js/ui/screens/party_select.js
 * Party select: roster of every hero (v2: all sixteen are available from the start; the lock UI only shows for a hero
 * def with an unlock condition, none today), a details panel (portrait, blurb, role,
 * complexity, stats, passive, basic, signature, starting skills and skill pool with tooltips), four party slots,
 * difficulty picker, "Roll for Party" and Start → DD.Run.newRun(heroIds, difficulty). Remembers the last party.
 */
(function () {
  'use strict';
  const DD = window.DD;

  const FLAG_LABEL = { flying: ['🪽', 'Flying', 'Ignores height, pits, liquids and terrain cost.'], hop: ['🐇', 'Hop', 'Can climb 2 levels in one step.'], large: ['🐘', 'Large', 'A big target. Hard to miss.'], immovable: ['🗿', 'Immovable', 'Cannot be pushed or pulled.'] };
  const EMPTY_SEAT = ['Empty Chair', 'Bring Snacks', 'Seat Reserved', 'Probably Late'];

  let st = null; // { selected: [], focus, difficulty, refs }

  function S() { return DD.UI; }

  function unlockedIds() { return S().heroIds().filter(function (id) { return S().isUnlocked(id); }); }
  function partySize() { return Math.min(4, unlockedIds().length); }

  function statBox(icon, label, value, extra) {
    const el = S().el;
    return el('div.stat-box', { title: label }, el('div.sb-icon', null, icon), el('div.sb-val', null, String(value)), el('div.sb-label', null, label), extra ? el('div.sb-extra', null, extra) : null);
  }

  function renderDetails() {
    const UI = S(), el = UI.el;
    const panel = st.refs.details;
    panel.innerHTML = '';
    const def = DD.getHero(st.focus);
    if (!def) {
      panel.appendChild(el('div.empty-state', null, el('div.es-icon', null, '🎲'), el('div', null, 'Hover a hero to read their questionable résumé.')));
      return;
    }
    const locked = !UI.isUnlocked(def.id);
    panel.style.setProperty('--hc', def.color || '#c9a24f');
    const head = el('div.psd-head',
      UI.portrait(def.id, 104, { locked: locked }),
      el('div.psd-titles',
        el('div.psd-name', null, def.name),
        def.epithet ? el('div.psd-epithet', null, def.epithet) : null,
        el('div.psd-class', null, [def.race, def.cls].filter(Boolean).join(' ')),
        el('div.psd-role', null, el('span.role-tag', null, def.role || 'Adventurer'), el('span.psd-cx', null, 'Complexity ', UI.stars(def.complexity || 1, 3)))));
    panel.appendChild(head);
    if (locked) panel.appendChild(el('div.psd-locked', null, '🔒 ', UI.unlockHint(def)));
    if (def.blurb) panel.appendChild(el('div.psd-blurb', null, def.blurb));

    const s = def.stats || {};
    const stats = el('div.psd-stats',
      statBox('❤️', 'HP', s.hp || 0, '+' + ((def.growth && def.growth.hp) || 0) + '/lvl'),
      statBox('⚡', 'AP', s.ap || 3),
      statBox('👣', 'Move', s.mov || 0),
      statBox('🛡️', 'Armor', s.armor || 0));
    panel.appendChild(stats);
    const flags = Object.keys(def.flags || {}).filter(function (k) { return def.flags[k] && FLAG_LABEL[k]; });
    if (flags.length) {
      panel.appendChild(el('div.psd-flags', null, flags.map(function (k) {
        const f = FLAG_LABEL[k];
        return UI.tooltip(el('span.flag-chip', null, f[0] + ' ' + f[1]), '<div class="tt"><div class="tt-title">' + f[1] + '</div><div class="tt-desc">' + f[2] + '</div></div>');
      })));
    }

    const scroll = el('div.psd-scroll.scroll');
    if (def.passive) {
      scroll.appendChild(el('div.psd-section.passive',
        el('div.psd-h', null, el('span.psd-h-tag', null, 'Passive'), el('span', null, def.passive.name || 'Passive')),
        el('div.psd-p', null, def.passive.desc || '')));
    }
    const kit = el('div.psd-section', el('div.psd-h', null, el('span.psd-h-tag', null, 'Kit'), el('span', null, 'Basic, Signature & Starting Skills')));
    const cards = el('div.psd-cards');
    if (def.basic) cards.appendChild(UI.skillCard(def.basic, 1, { compact: true, role: 'basic', badge: 'Basic', tipPos: 'left' }));
    if (def.signature) cards.appendChild(UI.skillCard(def.signature, 1, { compact: true, role: 'signature', badge: 'Signature', tipPos: 'left' }));
    (def.startingSkills || []).forEach(function (id) { cards.appendChild(UI.skillCard(id, 1, { compact: true, tipPos: 'left' })); });
    kit.appendChild(cards);
    scroll.appendChild(kit);
    const pool = (def.skillPool || []).filter(function (id) { return (def.startingSkills || []).indexOf(id) < 0 && DD.getSkill(id); });
    if (pool.length) {
      const chips = el('div.pool-chips');
      pool.forEach(function (id) {
        const sk = DD.getSkill(id);
        chips.appendChild(UI.tooltip(el('span.pool-chip', null, sk.icon || '✦'), function () { return UI.skillTooltipHtml(id, 1, null, { showNext: true }); }, { pos: 'top' }));
      });
      scroll.appendChild(el('div.psd-section', el('div.psd-h', null, el('span.psd-h-tag', null, 'Learnable'), el('span', null, pool.length + ' more skills via level-ups & tomes')), chips));
    }
    panel.appendChild(scroll);
  }

  function renderSlots() {
    const UI = S(), el = UI.el;
    const box = st.refs.slots;
    box.innerHTML = '';
    for (let i = 0; i < 4; i++) {
      const id = st.selected[i];
      const def = id ? DD.getHero(id) : null;
      const slot = el('div.party-slot' + (def ? '.filled' : '.empty'), { style: def ? { '--hc': def.color || '#c9a24f' } : null });
      if (def) {
        slot.appendChild(UI.portrait(def.id, 52));
        slot.appendChild(el('div.slot-name', null, def.name));
        slot.appendChild(el('button.slot-x', { type: 'button', title: 'Remove', on: { click: function (e) { e.stopPropagation(); toggle(id); } } }, '✕'));
        slot.addEventListener('mouseenter', function () { focus(id); });
      } else {
        slot.appendChild(el('div.slot-empty-icon', null, '🪑'));
        slot.appendChild(el('div.slot-name', null, EMPTY_SEAT[i]));
      }
      box.appendChild(slot);
    }
    const need = partySize();
    const ready = need > 0 && st.selected.length === need;
    UI.setDisabled(st.refs.start, !ready);
    st.refs.count.textContent = st.selected.length + ' / ' + need;
  }

  function renderRoster() {
    st.refs.cards.forEach(function (c) {
      const i = st.selected.indexOf(c.dataset.id);
      c.classList.toggle('selected', i >= 0);
      c.classList.toggle('focused', c.dataset.id === st.focus);
      const badge = c.querySelector('.hc-pick');
      if (badge) badge.textContent = i >= 0 ? String(i + 1) : '';
    });
  }

  function focus(id) {
    if (st.focus === id) return;
    st.focus = id;
    renderDetails();
    renderRoster();
  }

  function toggle(id) {
    const UI = S();
    if (!UI.isUnlocked(id)) { UI.sound('error'); UI.toast(UI.unlockHint(DD.getHero(id)), { icon: '🔒' }); return; }
    const i = st.selected.indexOf(id);
    if (i >= 0) st.selected.splice(i, 1);
    else if (st.selected.length >= partySize()) { UI.sound('error'); UI.toast('The table only seats four. Remove someone first.', { icon: '🪑' }); return; }
    else {
      st.selected.push(id);
      const d = DD.getHero(id);
      const line = d && d.barks && d.barks.select && d.barks.select.length ? DD.util.pick(d.barks.select, DD.rng) : '';
      if (line) UI.toast('<b>' + UI.esc(d.name) + ':</b> ' + UI.esc(line), { html: true, cls: 'bark', ms: 2200 });
    }
    renderSlots();
    renderRoster();
  }

  function roll() {
    const UI = S();
    const pool = unlockedIds();
    if (!pool.length) return;
    UI.sound('magic');
    st.selected = DD.util.shuffle(pool, DD.rng).slice(0, partySize());
    st.refs.rollBtn.classList.add('rolling');
    setTimeout(function () { if (st && st.refs) st.refs.rollBtn.classList.remove('rolling'); }, 650);
    st.focus = st.selected[0];
    renderDetails();
    renderSlots();
    renderRoster();
    st.refs.cards.forEach(function (c) {
      if (st.selected.indexOf(c.dataset.id) >= 0) { c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop'); }
    });
  }

  function setDifficulty(id) {
    const UI = S(), el = UI.el;
    st.difficulty = id;
    st.refs.diffBtns.forEach(function (b) { b.classList.toggle('active', b.dataset.id === id); });
    const d = UI.DIFFICULTIES.filter(function (x) { return x.id === id; })[0];
    if (d && st.refs.diffNote) {
      st.refs.diffNote.innerHTML = '';
      st.refs.diffNote.appendChild(el('div.pdn-title', null, d.icon + ' ' + d.name + ' — ', el('span.pdn-quip', null, d.quip)));
      st.refs.diffNote.appendChild(el('div.pdn-desc', null, d.desc));
    }
  }

  function start() {
    const UI = S();
    const need = partySize();
    if (st.selected.length !== need || !need) { UI.sound('error'); UI.toast('Pick ' + need + ' heroes first. The DM refuses to run a game for nobody.', { icon: '🎲' }); return; }
    if (!DD.Run || typeof DD.Run.newRun !== 'function') { UI.toast('The campaign binder is missing (run system unavailable).', { cls: 'bad' }); return; }
    DD.Storage.set('ui.lastParty', st.selected.slice());
    DD.Storage.set('ui.lastDifficulty', st.difficulty);
    UI.sound('buff');
    const before = UI.run();
    DD.safe('Run.newRun', DD.Run.newRun, DD.Run, [st.selected.slice(), st.difficulty]);
    const after = UI.run();
    if (!after || after === before) { UI.toast('The campaign refused to start. The DM spilled soda on the notes.', { cls: 'bad', icon: '🥤' }); return; }
    if (UI.current === 'partySelect') UI.show('map', { act: after.act, intro: true });
  }

  DD.afterLoad(function () {
    if (!DD.UI) return;
    DD.UI.screen('partySelect', {
      scene: 'none',
      cls: 'full bg-tavern',
      mount: function (root, params) {
        const UI = DD.UI, el = UI.el;
        const ids = UI.heroIds();
        const last = (DD.Storage.get('ui.lastParty', []) || []).filter(function (id) { return DD.getHero(id) && UI.isUnlocked(id); });
        st = { selected: (params && params.selected) || last.slice(0, 4), focus: null, difficulty: DD.Storage.get('ui.lastDifficulty', 'normal') || 'normal', refs: { cards: [], diffBtns: [] } };
        if (st.selected.length > partySize()) st.selected.length = partySize();
        st.focus = st.selected[0] || ids.filter(function (id) { return UI.isUnlocked(id); })[0] || ids[0] || null;

        const diff = el('div.ps-diff', null, el('div.ps-label', null, 'Difficulty'));
        const seg = el('div.segmented');
        UI.DIFFICULTIES.forEach(function (d) {
          const b = UI.button(d.name, function () { setDifficulty(d.id); }, { cls: 'seg', icon: d.icon, tooltip: '<div class="tt"><div class="tt-title">' + d.icon + ' ' + d.name + '</div><div class="tt-desc">' + UI.esc(d.desc) + '</div><div class="tt-flavor">' + UI.esc(d.quip) + '</div></div>', tooltipOpts: { pos: 'bottom' } });
          b.dataset.id = d.id;
          st.refs.diffBtns.push(b);
          seg.appendChild(b);
        });
        diff.appendChild(seg);
        root.appendChild(UI.header('Assemble Your Degenerates', 'Pick four heroes for the campaign. Choose wisely. Or don\'t — that\'s the fun part.',
          [diff, UI.button('Back', function () { UI.show('title'); }, { cls: 'ghost', icon: '←', hotkey: 'Escape', showKey: false })]));

        const body = el('div.ps-body');
        const roster = el('div.ps-roster');
        if (!ids.length) {
          roster.appendChild(el('div.empty-state', null, el('div.es-icon', null, '🪑'), el('div', null, 'No heroes have shown up to Session Zero yet.')));
        }
        ids.forEach(function (id) {
          const d = DD.getHero(id);
          const locked = !UI.isUnlocked(id);
          const card = el('div.hero-card', { class: locked ? 'locked' : '', dataset: { id: id }, style: { '--hc': d.color || '#c9a24f' }, role: 'button' },
            el('div.hc-art', null, UI.portrait(id, 112, { locked: locked, frame: false })),
            el('div.hc-name', { class: !locked && String(d.name || '').length > 12 ? 'long' : null }, locked ? '???' : d.name),
            el('div.hc-role', null, locked ? UI.unlockHint(d) : (d.role || [d.race, d.cls].join(' '))),
            locked ? null : el('div.hc-cx', null, UI.stars(d.complexity || 1, 3)),
            el('div.hc-pick'));
          card.addEventListener('mouseenter', function () { focus(id); });
          card.addEventListener('click', function () { if (!locked) UI.sound('click'); toggle(id); });
          if (!locked) UI.tooltip(card, function () { return st.selected.indexOf(id) >= 0 ? '<div class="tt"><div class="tt-desc">Click to remove from the party.</div></div>' : '<div class="tt"><div class="tt-desc">Click to add to the party.</div></div>'; }, { pos: 'bottom', delay: 600 });
          st.refs.cards.push(card);
          roster.appendChild(card);
        });
        body.appendChild(roster);
        const details = el('aside.ps-details.panel');
        st.refs.details = details;
        body.appendChild(details);
        root.appendChild(body);

        const footer = el('footer.ps-footer.panel.slim');
        const slotsWrap = el('div.ps-slots-wrap', null, el('div.ps-label', null, 'The Party ', st.refs.count = el('span.ps-count')), st.refs.slots = el('div.ps-slots'));
        footer.appendChild(slotsWrap);
        st.refs.diffNote = el('div.ps-diff-note');
        footer.appendChild(st.refs.diffNote);
        const actions = el('div.ps-actions');
        st.refs.rollBtn = UI.button('Roll for Party', roll, { icon: '🎲', cls: 'roll', hotkey: 'r', tooltip: '<div class="tt"><div class="tt-desc">Let the dice pick the party. They always do anyway.</div></div>' });
        st.refs.start = UI.button('Start Campaign', start, { cls: 'primary big', icon: '⚔️', hotkey: 'Enter', showKey: false });
        actions.appendChild(st.refs.rollBtn);
        actions.appendChild(st.refs.start);
        footer.appendChild(actions);
        root.appendChild(footer);

        setDifficulty(UI.DIFFICULTIES.some(function (d) { return d.id === st.difficulty; }) ? st.difficulty : 'normal');
        renderDetails();
        renderSlots();
        renderRoster();
      },
      unmount: function () { st = null; },
    });
  });
})();
