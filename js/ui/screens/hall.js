/* Dungeons and Degenerates — js/ui/screens/hall.js
 * Hall of Fame (all persistent DD.Meta data): Records (runs, wins, best act, kills, deaths), Heroes (unlock grid with
 * hints), Codex (every registered enemy and boss; unseen ones are silhouettes), Blessings (every entry of the Table of
 * Questionable Blessings by rarity; ones never rolled are ???) and History (past runs).
 * Params: { back: screenId, tab: 'records'|'heroes'|'codex'|'blessings'|'history' }.
 */
(function () {
  'use strict';
  const DD = window.DD;

  const TABS = [['records', '📜', 'Records'], ['heroes', '🧙', 'Heroes'], ['codex', '📖', 'Codex'], ['blessings', '🎲', 'Blessings'], ['history', '⏳', 'History']];
  const BLESS_ORDER = ['legendary', 'rare', 'uncommon', 'common', 'cursed'];
  const TIER_ORDER = { boss: 0, elite: 1, normal: 2, minion: 3 };

  let st = null;

  function num(v) { v = +v; return isFinite(v) ? v : 0; }
  function meta() {
    return DD.UI.meta() || { unlocked: [], stats: {}, seen: { enemies: {}, bosses: {}, events: {} }, history: [] };
  }
  function seen(kind, id) {
    const s = meta().seen || {};
    const bag = s[kind];
    if (!bag) return false;
    if (Array.isArray(bag)) return bag.indexOf(id) >= 0;
    return !!bag[id];
  }

  function records() {
    const UI = DD.UI, el = UI.el;
    const m = meta();
    const s = m.stats || {};
    const runs = num(s.runs), wins = num(s.wins);
    const rate = runs ? Math.round(wins / runs * 100) : 0;
    const quip = !runs ? 'No campaigns yet. The DM is waiting. Impatiently.' : rate === 0 ? 'A flawless losing record. The DM is thrilled.' : rate < 30 ? 'Some wins! The DM is mildly concerned.' : rate < 70 ? 'A respectable record. Suspiciously respectable.' : 'Unstoppable. The DM is considering a career change.';
    const card = function (icon, val, label) { return el('div.rec-card', null, el('div.rc-icon', null, icon), el('div.rc-val', null, String(val)), el('div.rc-label', null, label)); };
    const box = el('div.hall-records');
    box.appendChild(el('div.rec-grid', null,
      card('🎲', runs, 'Campaigns finished'),
      card('👑', wins, 'Campaigns won'),
      card('📈', rate + '%', 'Win rate'),
      card('🗺️', num(s.bestAct) ? 'Act ' + DD.util.roman(num(s.bestAct)) : '—', 'Furthest reached'),
      card('⚔️', num(s.combats), 'Fights won'),
      card('💀', num(s.kills), 'Monsters slain'),
      card('🐲', num(s.elites) + ' / ' + num(s.bosses), 'Elites / bosses felled'),
      card('🪙', num(s.goldEarned), 'Gold earned'),
      card('⚰️', num(s.deaths), 'Heroes lost')));
    box.appendChild(UI.narration(quip, { cls: 'center' }));
    const ids = UI.heroIds();
    const enemies = Object.keys(DD.defs.enemies || {}).filter(function (id) { return id.indexOf('test_') !== 0; });
    const seenCount = enemies.filter(function (id) { return seen('enemies', id) || seen('bosses', id); }).length;
    const bless = blessingDefs();
    box.appendChild(el('div.rec-progress', null,
      progress('Heroes unlocked', ids.filter(function (id) { return UI.isUnlocked(id); }).length, ids.length),
      progress('Codex entries', seenCount, enemies.length),
      bless.length ? progress('Blessings discovered', bless.filter(function (d) { return seen('passives', d.id); }).length, bless.length) : null));
    return box;
  }

  /** Registered Blessings (random passives) for the codex; test_ entries hidden once real ones exist. */
  function blessingDefs() {
    const all = Object.keys(DD.defs.passives || {}).map(function (k) { return DD.defs.passives[k]; }).filter(function (d) { return d && d.id; });
    const real = all.filter(function (d) { return d.id.indexOf('test_') !== 0; });
    return real.length ? real : all;
  }

  /** "Blessings discovered": every entry of the Table of Questionable Blessings by rarity; unrolled ones are ???. */
  function blessings() {
    const UI = DD.UI, el = UI.el;
    const all = blessingDefs();
    const box = el('div.hall-codex.hall-bless');
    if (!all.length) { box.appendChild(el('div.empty-state', null, el('div.es-icon', null, '🎲'), el('div', null, 'The Table of Questionable Blessings is blank. The DM forgot to print it.'))); return box; }
    const known = all.filter(function (d) { return seen('passives', d.id); }).length;
    box.appendChild(UI.narration(known === all.length ? 'Every Blessing found. The DM is out of tricks. For now.' :
      known ? known + ' of ' + all.length + ' Blessings rolled so far. The table has more. It always has more.' :
        'Nothing rolled yet. Level up and the DM rolls on the Table of Questionable Blessings.', { cls: 'center' }));
    BLESS_ORDER.forEach(function (rar) {
      const list = all.filter(function (d) { return (UI.PASSIVE_RARITY[d.rarity] ? d.rarity : 'common') === rar; })
        .sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
      if (!list.length) return;
      const info = UI.PASSIVE_RARITY[rar];
      const n = list.filter(function (d) { return seen('passives', d.id); }).length;
      box.appendChild(el('div.codex-h', null, el('span', { style: { color: info.color } }, info.name), el('span.codex-count', null, n + ' / ' + list.length)));
      const grid = el('div.codex-grid');
      list.forEach(function (d) {
        const isSeen = seen('passives', d.id);
        const card = el('div.bx-card', { class: [isSeen ? '' : 'unseen', 'rarity-' + rar], style: { '--rc': info.color } },
          el('div.bx-icon', null, isSeen ? d.icon || '🎲' : '?'),
          el('div.cx-name', null, isSeen ? d.name : '???'),
          el('div.cx-tier', null, info.name));
        UI.tooltip(card, isSeen ? function () { return UI.passiveTooltipHtml({ id: d.id, level: 1 }); } :
          '<div class="tt"><div class="tt-desc">Not rolled yet. Level up and pray to the dice.</div></div>');
        grid.appendChild(card);
      });
      box.appendChild(grid);
    });
    return box;
  }

  function progress(label, a, b) {
    const el = DD.UI.el;
    return el('div.prog', null, el('div.prog-h', null, el('span', null, label), el('span', null, a + ' / ' + b)), el('div.up-bar', null, el('div.up-fill', { style: { width: (b ? a / b * 100 : 0).toFixed(1) + '%' } })));
  }

  function heroes() {
    const UI = DD.UI, el = UI.el;
    const grid = el('div.hall-heroes');
    UI.heroIds().forEach(function (id) {
      const d = DD.getHero(id);
      const locked = !UI.isUnlocked(id);
      const card = el('div.hh-card', { class: locked ? 'locked' : '', style: { '--hc': d.color || '#c9a24f' } },
        UI.portrait(id, 84, { locked: locked }),
        el('div.hh-name', null, locked ? '???' : d.name),
        el('div.hh-sub', null, locked ? UI.unlockHint(d) : [d.race, d.cls].filter(Boolean).join(' ')),
        locked ? null : el('div.hh-role', null, d.role || ''));
      UI.tooltip(card, function () { return UI.heroTooltipHtml(id, { locked: locked }); });
      grid.appendChild(card);
    });
    if (!grid.children.length) grid.appendChild(el('div.empty-state', null, el('div.es-icon', null, '🪑'), el('div', null, 'No heroes registered.')));
    return grid;
  }

  function codex() {
    const UI = DD.UI, el = UI.el;
    const all = Object.keys(DD.defs.enemies || {}).map(function (k) { return DD.defs.enemies[k]; }).filter(function (e) { return e.id.indexOf('test_') !== 0; });
    const box = el('div.hall-codex');
    if (!all.length) { box.appendChild(el('div.empty-state', null, el('div.es-icon', null, '📖'), el('div', null, 'The monster manual is blank. Suspicious.'))); return box; }
    [1, 2, 3, 0].forEach(function (act) {
      const list = all.filter(function (e) { return act ? num(e.act) === act : !(num(e.act) >= 1 && num(e.act) <= 3); })
        .sort(function (a, b) { return (TIER_ORDER[a.tier] || 9) - (TIER_ORDER[b.tier] || 9) || String(a.name).localeCompare(String(b.name)); });
      if (!list.length) return;
      const info = UI.ACTS[act];
      const known = list.filter(function (e) { return seen('enemies', e.id) || seen('bosses', e.id); }).length;
      box.appendChild(el('div.codex-h', null, el('span', null, info ? 'Act ' + info.roman + ' — ' + info.name : 'Miscellaneous Horrors'), el('span.codex-count', null, known + ' / ' + list.length)));
      const grid = el('div.codex-grid');
      list.forEach(function (e) {
        const isSeen = seen('enemies', e.id) || seen('bosses', e.id);
        const card = el('div.cx-card', { class: [isSeen ? '' : 'unseen', 'tier-' + (e.tier || 'normal')] },
          UI.portrait(e.id, 56, { locked: !isSeen, frame: false }),
          el('div.cx-name', null, isSeen ? e.name : '???'),
          el('div.cx-tier', null, e.tier === 'boss' ? 'Boss' : e.tier === 'elite' ? 'Elite' : e.tier === 'minion' ? 'Minion' : 'Enemy'));
        UI.tooltip(card, isSeen ? function () { return UI.enemyTooltipHtml(e.id); } : '<div class="tt"><div class="tt-desc">Not encountered yet. Go get hit by it.</div></div>');
        grid.appendChild(card);
      });
      box.appendChild(grid);
    });
    return box;
  }

  function history() {
    const UI = DD.UI, el = UI.el;
    const list = (meta().history || []).slice();
    const ts = function (e) { return num(e && (e.endedAt || e.date || e.time || e.at)); };
    list.sort(function (a, b) { return ts(b) - ts(a); });
    const box = el('div.hall-history');
    if (!list.length) { box.appendChild(el('div.empty-state', null, el('div.es-icon', null, '⏳'), el('div', null, 'No finished campaigns yet. History is written by the survivors, and so far there are none.'))); return box; }
    list.slice(0, 40).forEach(function (h) {
      const won = h.result === 'victory' || h.result === 'win' || h.won === true;
      const abandoned = h.result === 'abandon' || h.result === 'abandoned';
      const party = (h.party || h.heroes || []).map(function (x) { return typeof x === 'string' ? { id: x } : x; }).filter(function (x) { return x && x.id; });
      const diff = UI.DIFFICULTIES.filter(function (d) { return d.id === h.difficulty; })[0];
      const stats = h.stats || {};
      const kills = h.kills !== undefined ? num(h.kills) : stats.kills !== undefined ? num(stats.kills) : null;
      const act = DD.util.roman(num(h.act) || 1);
      const title = won ? 'Victory!' : abandoned ? 'Abandoned in Act ' + act : 'Fell in Act ' + act + (h.killedBy ? ' to ' + h.killedBy : '');
      const meta = [ts(h) ? UI.ago(ts(h)) : '', diff ? diff.icon + ' ' + diff.name : '', kills !== null ? '💀 ' + kills + ' kills' : '',
        stats.durationMs ? '⏱️ ' + UI.duration(stats.durationMs) : ''].filter(Boolean).join(' · ');
      box.appendChild(el('div.hist-row', { class: won ? 'won' : abandoned ? 'abandoned' : 'lost' },
        el('div.hist-result', null, won ? '👑' : abandoned ? '🏳️' : '💀'),
        el('div.hist-main', null,
          el('div.hist-title', null, title, h.title ? el('span.hist-sub', null, ' — “' + h.title + '”') : null),
          el('div.hist-meta', null, meta)),
        el('div.hist-party', null, party.map(function (p) {
          const port = UI.portrait(p.id, 34, { dead: !!p.dead });
          UI.tooltip(port, '<div class="tt"><div class="tt-title">' + UI.esc(p.name || UI.heroName(p.id)) + (p.level ? ' · Lv ' + num(p.level) : '') + '</div>' + (p.dead ? '<div class="tt-desc">Written out of the campaign.</div>' : '') + (p.kills !== undefined ? '<div class="tt-target">' + num(p.kills) + ' kills · ' + num(p.downs) + ' downs</div>' : '') + '</div>');
          return port;
        }))));
    });
    return box;
  }

  function render() {
    const UI = DD.UI;
    st.refs.tabs.forEach(function (b) { b.classList.toggle('active', b.dataset.tab === st.tab); });
    const body = st.refs.body;
    body.innerHTML = '';
    const view = st.tab === 'heroes' ? heroes() : st.tab === 'codex' ? codex() : st.tab === 'blessings' ? blessings() : st.tab === 'history' ? history() : records();
    body.appendChild(view);
    body.scrollTop = 0;
    DD.Storage.set('ui.hallTab', st.tab);
    UI.hideTooltip();
  }

  DD.afterLoad(function () {
    if (!DD.UI) return;
    DD.UI.screen('hall', {
      scene: 'none',
      cls: 'full bg-tavern',
      history: false,
      mount: function (root, params) {
        const UI = DD.UI, el = UI.el;
        params = params || {};
        const saved = DD.Storage.get('ui.hallTab', 'records');
        st = { tab: params.tab || saved || 'records', refs: { tabs: [] } };
        if (!TABS.some(function (t) { return t[0] === st.tab; })) st.tab = 'records';
        const back = function () { UI.show(params.back && UI.screens[params.back] ? params.back : 'title'); };
        root.appendChild(UI.header('Hall of Fame', 'Glory, shame and an alarming number of goblins.', UI.button('Back', back, { icon: '←', cls: 'ghost', hotkey: 'Escape', showKey: false })));
        const tabs = el('nav.tabs');
        TABS.forEach(function (t, i) {
          const b = UI.button(t[2], function () { st.tab = t[0]; render(); }, { icon: t[1], cls: 'tab', hotkey: String(i + 1), showKey: false });
          b.dataset.tab = t[0];
          st.refs.tabs.push(b);
          tabs.appendChild(b);
        });
        st.refs.body = el('div.hall-body.panel.scroll');
        root.appendChild(el('div.hall-wrap', null, tabs, st.refs.body));
        render();
      },
      unmount: function () { st = null; },
    });
  });
})();
