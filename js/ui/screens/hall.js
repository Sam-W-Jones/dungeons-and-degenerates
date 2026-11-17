/* Dungeons and Degenerates — js/ui/screens/hall.js
 * Hall of Fame (all persistent DD.Meta data): Records (runs, wins, best act, kills, deaths), Heroes (v2: the whole
 * roster — every hero is available from the start — with each hero's campaign record from the run history), Codex
 * (every registered enemy and boss; unseen ones are silhouettes), Blessings (every entry of the Table of
 * Questionable Blessings by rarity; ones never rolled are ???) and History (past runs).
 * Params: { back: screenId, tab: 'records'|'heroes'|'codex'|'blessings'|'history' }.
 * V3 (plan §2.4, §2.6, §5.8): behind the spoiler gate (DD.UI.act4Seen: Svammiel met once) the codex gains the Act IV
 * group — one sub-group per gauntlet lane (its encounter's units, their spawns by id prefix, a content module's CODEX
 * export, its breakable objects and any object / status flagged `codex: true`), then the floor boss — and act-4 defs
 * stay out of "Miscellaneous Horrors" and every seen count until then. Records add "The DM defeated" and "Floor bosses beaten" and split classic (3-act)
 * wins; History shows a run's "Act IV · N / M floor bosses" (M: that run's own lane count) with the lanes' icons.
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

  /** V3: the codex acts shown (act IV once the gate is open) and whether a def belongs to a hidden act. */
  function codexActs() {
    const last = typeof DD.MAX_ACT === 'number' ? DD.MAX_ACT : 3;
    const out = [];
    for (let a = 1; a <= last; a++) if (a <= 3 || DD.UI.act4Seen()) out.push(a);
    return out;
  }
  function hiddenAct(d) { const a = num(d && d.act); return a > 3 && !DD.UI.act4Seen(); }
  /** A history entry's win: classic (a v2 summary has no `acts`, or a 3-act campaign) vs the four-act one. */
  function isClassicWin(h) { return (h.result === 'victory' || h.result === 'win' || h.won === true) && !(num(h.acts) >= 4); }

  function records() {
    const UI = DD.UI, el = UI.el;
    const m = meta();
    const s = m.stats || {};
    const runs = num(s.runs), wins = num(s.wins);
    const rate = runs ? Math.round(wins / runs * 100) : 0;
    const quip = !runs ? 'No campaigns yet. The DM is waiting. Impatiently.' : rate === 0 ? 'A flawless losing record. The DM is thrilled.' : rate < 30 ? 'Some wins! The DM is mildly concerned.' : rate < 70 ? 'A respectable record. Suspiciously respectable.' : 'Unstoppable. The DM is considering a career change.';
    const card = function (icon, val, label, cls) { return el('div.rec-card', { class: cls || null }, el('div.rc-icon', null, icon), el('div.rc-val', null, String(val)), el('div.rc-label', null, label)); };
    const box = el('div.hall-records');
    // V3 (gated): the classic wins split out, the DM defeated, the floor bosses beaten
    const seen4 = UI.act4Seen();
    const classic = seen4 ? (m.history || []).filter(isClassicWin).length : 0;
    const cards = [
      card('🎲', runs, 'Campaigns finished'),
      card('👑', wins, seen4 && classic ? 'Campaigns won (of which classic: ' + classic + ')' : 'Campaigns won'),
      card('📈', rate + '%', 'Win rate'),
      card('🗺️', num(s.bestAct) ? 'Act ' + DD.util.roman(num(s.bestAct)) : '—', 'Furthest reached'),
      card('⚔️', num(s.combats), 'Fights won'),
      card('💀', num(s.kills), 'Monsters slain'),
      card('🐲', num(s.elites) + ' / ' + num(s.bosses), 'Elites / bosses felled'),
      card('🪙', num(s.goldEarned), 'Gold earned'),
      card('⚰️', num(s.deaths), 'Heroes lost')];
    if (seen4) cards.push(card('🎭', num(s.dmDefeated), 'The DM defeated', 'v3'), card('😈', num(s.miniBosses), 'Floor bosses beaten', 'v3'));
    box.appendChild(el('div.rec-grid', null, cards));
    box.appendChild(UI.narration(quip, { cls: 'center' }));
    const ids = UI.heroIds();
    const enemies = Object.keys(DD.defs.enemies || {}).filter(function (id) { return id.indexOf('test_') !== 0 && !hiddenAct(DD.defs.enemies[id]); });
    const seenCount = enemies.filter(function (id) { return seen('enemies', id) || seen('bosses', id); }).length;
    const bless = blessingDefs();
    // v2: every hero is available from the start: the collection is "who has played a campaign", not unlocks
    const recs = heroRecords();
    box.appendChild(el('div.rec-progress', null,
      progress('Heroes who braved a campaign', ids.filter(function (id) { return !!recs[id]; }).length, ids.length),
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

  /** Per-hero records from the run history: { runs, wins, kills, best (level), fallen (written out) }. */
  function heroRecords() {
    const out = {};
    const rec = function (id) { return out[id] || (out[id] = { runs: 0, wins: 0, kills: 0, best: 0, fallen: 0 }); };
    (meta().history || []).forEach(function (h) {
      const won = h.result === 'victory' || h.result === 'win' || h.won === true;
      const seen = {};
      (h.party || h.heroes || []).forEach(function (p) {
        const id = typeof p === 'string' ? p : p && p.id;
        if (!id || seen[id]) return;
        seen[id] = true;
        const r = rec(id);
        r.runs++;
        if (won && !(p && p.dead)) r.wins++;
        if (p && typeof p === 'object') {
          r.kills += num(p.kills);
          r.best = Math.max(r.best, num(p.level));
          if (p.dead) r.fallen++;
        }
      });
      // a hero written out and replaced by a recruit is no longer in the final party: the summary's `fallen` names them
      (Array.isArray(h.fallen) ? h.fallen : []).forEach(function (id) {
        if (typeof id !== 'string' || seen[id]) return;
        seen[id] = true;
        const r = rec(id);
        r.runs++;
        r.fallen++;
      });
    });
    return out;
  }

  /** v2: every hero is available from the start — the roster with each hero's campaign record (no lock grid). */
  function heroes() {
    const UI = DD.UI, el = UI.el;
    const recs = heroRecords();
    const box = el('div.hall-roster');
    const ids = UI.heroIds();
    // more than a 4 × 4 grid: still 4 columns, one more row; `.many` tightens each card a little (CSS) so 17 and 18 fit
    // 1024×640 to 1920×1080 (the fit suite checks it, worst-case cards included)
    const grid = el('div.hall-heroes', { class: ids.length > 4 * 4 ? 'many' : null });
    ids.forEach(function (id) {
      const d = DD.getHero(id);
      const r = recs[id];
      const line = r ? [plural(r.runs, 'campaign'), r.wins ? '👑 ' + r.wins : '', r.kills ? '💀 ' + r.kills : '', r.best ? 'best Lv ' + r.best : ''].filter(Boolean).join(' · ')
        : 'Never played. Yet.';
      const card = el('div.hh-card', { class: r ? 'played' : 'fresh', style: { '--hc': d.color || '#c9a24f' } },
        UI.portrait(id, 56),
        el('div.hh-text', null,
          el('div.hh-name', { class: String(d.name || '').length > 12 ? 'long' : null }, d.name),
          el('div.hh-sub', null, [d.race, d.cls].filter(Boolean).join(' ')),
          el('div.hh-role', null, d.role || ''),
          el('div.hh-rec', null, line + (r && r.fallen ? ' · ⚰️ ' + r.fallen : ''))));
      UI.tooltip(card, function () { return UI.heroTooltipHtml(id, {}); });
      grid.appendChild(card);
    });
    if (!grid.children.length) grid.appendChild(el('div.empty-state', null, el('div.es-icon', null, '🪑'), el('div', null, 'No heroes registered.')));
    const played = Object.keys(recs).filter(function (id) { return !!DD.getHero(id); }).length;
    const total = grid.querySelectorAll('.hh-card').length;
    box.appendChild(UI.narration(!played ? 'The whole table is free. Every hero is ready for Session Zero.' :
      played >= total ? 'All ' + total + ' heroes have braved a campaign. The DM is running out of excuses to kill them.' :
        played + ' of ' + total + ' heroes have braved a campaign. The rest are "still making their character".', { cls: 'center' }));
    box.appendChild(grid);
    return box;
  }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }

  function isSeenEnemy(id) { return seen('enemies', id) || seen('bosses', id); }
  function byTierName(a, b) { return (TIER_ORDER[a.tier] || 9) - (TIER_ORDER[b.tier] || 9) || String(a.name).localeCompare(String(b.name)); }
  /** One enemy codex card (unseen: a silhouette and ???). label: the tier line (V3 groups say Mini-boss / Floor Boss). */
  function enemyCard(e, label) {
    const UI = DD.UI, el = UI.el;
    const isSeen = isSeenEnemy(e.id);
    const card = el('div.cx-card', { class: [isSeen ? '' : 'unseen', 'tier-' + (e.tier || 'normal')] },
      UI.portrait(e.id, 56, { locked: !isSeen, frame: false }),
      el('div.cx-name', null, isSeen ? e.name : '???'),
      el('div.cx-tier', null, label || (e.tier === 'boss' ? 'Boss' : e.tier === 'elite' ? 'Elite' : e.tier === 'minion' ? 'Minion' : 'Enemy')));
    UI.tooltip(card, isSeen ? function () { return UI.enemyTooltipHtml(e.id); } : '<div class="tt"><div class="tt-desc">Not encountered yet. Go get hit by it.</div></div>');
    return card;
  }
  /** A codex card for a lane's object or status (known once its lane's units have been met). */
  function thingCard(d, kind, known) {
    const UI = DD.UI, el = UI.el;
    const icon = d.icon || (kind === 'status' ? '✨' : '📦');
    const card = el('div.cx-card.cx-thing', { class: [known ? '' : 'unseen', 'kind-' + kind] },
      el('div.cx-thing-icon', null, known ? icon : '?'),
      el('div.cx-name', null, known ? d.name : '???'),
      el('div.cx-tier', null, kind === 'status' ? 'Status' : 'Object'));
    const desc = typeof d.desc === 'function' ? '' : String(d.desc || '');
    UI.tooltip(card, known ? '<div class="tt"><div class="tt-title">' + UI.esc(d.name) + '</div>' + (desc ? '<div class="tt-desc">' + UI.esc(desc) + '</div>' : '') +
      (kind === 'object' && num(d.hp) > 0 ? '<div class="tt-target">' + num(d.hp) + ' HP</div>' : '') + '</div>' : '<div class="tt"><div class="tt-desc">Not encountered yet.</div></div>');
    return card;
  }
  /** The id prefix a lane's units share ('rap_', 'lg_', 'svam_'): their spawns and things carry it too. */
  function prefixOf(ids) {
    const count = {};
    ids.forEach(function (id) { const m = /^([a-z0-9]+_)/.exec(id); if (m) count[m[1]] = (count[m[1]] || 0) + 1; });
    let best = '', n = 0;
    Object.keys(count).forEach(function (k) { if (count[k] > n) { best = k; n = count[k]; } });
    return best;
  }
  /**
   * Codex exports of content modules: DD.<Module>.CODEX = { group, entries: [{ id, name, icon, text }] } (the goats'
   * DD.Goats.CODEX: their Golden Mic is a status, their Mic Stand an unbreakable object, so neither is found by the
   * generic rules below). → [CODEX]
   */
  function codexExports() {
    const out = [];
    Object.keys(DD).forEach(function (k) {
      let m = null;
      try { m = DD[k]; } catch (e) { m = null; }
      if (m && typeof m === 'object' && m.CODEX && typeof m.CODEX === 'object' && Array.isArray(m.CODEX.entries)) out.push(m.CODEX);
    });
    return out;
  }
  /** An exported codex entry as a thing card's def ({ id, name, icon, desc, hp }) and kind ('status' | 'object'). */
  function exportedThing(x) {
    const st = (DD.defs.statuses || {})[x.id], ob = (DD.defs.objects || {})[x.id];
    const d = { id: String(x.id), name: String(x.name || (st || ob || {}).name || x.id), icon: x.icon || (st || ob || {}).icon || null,
      desc: String(x.text || x.desc || ''), hp: ob ? num(ob.hp) : 0 };
    return { def: d, kind: st && !ob ? 'status' : 'object' };
  }
  /**
   * The Act IV codex: per lane (gauntlet order), then the floor boss, then any other act-4 def. A group lists its
   * encounter's units, every act-4 enemy sharing their id prefix (spawns: the goats' bear, Svammiel's imps), the
   * entries of a content module's CODEX export whose ids share that prefix (or whose `group` is the lane's codex title),
   * its breakable objects (hp > 0) and any object or status flagged `codex: true` (never one flagged `codex: false`).
   * → [{ title, note, enemies: [def], things: [{ def, kind }] }]
   */
  function act4Groups(all) {
    const UI = DD.UI;
    const act4 = all.filter(function (e) { return num(e.act) === 4; });
    const used = {};
    const lanes = UI.gauntletLanes(null).filter(function (l) { return l.id.indexOf('test_') !== 0; });
    const fin = DD.RunMap && DD.RunMap.finaleOf ? DD.RunMap.finaleOf(4) : null;
    const encs = lanes.map(function (l) { return { info: UI.laneInfo(l), enc: DD.getEncounter(l.encounterId) }; });
    if (fin && fin.id.indexOf('test_') !== 0) encs.push({ info: UI.laneInfo(fin.id), enc: fin });
    const exports = codexExports();
    const groups = encs.map(function (x) {
      const ids = UI.encounterUnitIds(x.enc);
      const pre = prefixOf(ids);
      const enemies = act4.filter(function (e) { return !used[e.id] && (ids.indexOf(e.id) >= 0 || (pre && e.id.indexOf(pre) === 0)); });
      enemies.forEach(function (e) { used[e.id] = true; });
      const exp = exports.filter(function (c) {
        return c.group === x.info.codex.title || (pre && c.entries.some(function (en) { return en && String(en.id || '').indexOf(pre) === 0; }));
      })[0] || null;
      const things = exp ? exp.entries.filter(function (en) { return en && en.id; }).map(exportedThing) : [];
      const listed = {};
      things.forEach(function (th) { listed[th.def.id] = true; });
      if (pre) {
        [['objects', 'object'], ['statuses', 'status']].forEach(function (k) {
          const bag = DD.defs[k[0]] || {};
          Object.keys(bag).sort().forEach(function (id) {
            const d = bag[id];
            if (id.indexOf(pre) !== 0 || !d || d.codex === false || listed[id]) return;
            if (d.codex === true || (k[1] === 'object' && num(d.hp) > 0 && d.desc)) things.push({ def: d, kind: k[1] });
          });
        });
      }
      const title = x.info.finale ? 'The Floor Boss — ' + (enemies.filter(function (e) { return e.tier === 'boss'; })[0] || { name: x.info.shortName }).name :
        (exp && exp.group) || x.info.codex.title;
      return { title: title, note: x.info.codex.note || '', icon: x.info.icon, enemies: enemies.sort(byTierName), things: things, bossIds: ids };
    }).filter(function (g) { return g.enemies.length || g.things.length; });
    const rest = act4.filter(function (e) { return !used[e.id]; }).sort(byTierName);
    if (rest.length) groups.push({ title: 'Also Under the Table', note: '', icon: '🕳️', enemies: rest, things: [], bossIds: [] });
    return groups;
  }

  function codex() {
    const UI = DD.UI, el = UI.el;
    // V3: act-4 defs stay out of the codex (every group and count) until Svammiel has been met
    const all = Object.keys(DD.defs.enemies || {}).map(function (k) { return DD.defs.enemies[k]; })
      .filter(function (e) { return e.id.indexOf('test_') !== 0 && !hiddenAct(e); });
    const box = el('div.hall-codex');
    if (!all.length) { box.appendChild(el('div.empty-state', null, el('div.es-icon', null, '📖'), el('div', null, 'The monster manual is blank. Suspicious.'))); return box; }
    const acts = codexActs();
    acts.concat([0]).forEach(function (act) {
      if (act === 4) { codexAct4(box, all); return; }
      const list = all.filter(function (e) { return act ? num(e.act) === act : acts.indexOf(num(e.act)) < 0; }).sort(byTierName);
      if (!list.length) return;
      const info = UI.ACTS[act];
      const known = list.filter(function (e) { return isSeenEnemy(e.id); }).length;
      box.appendChild(el('div.codex-h', null, el('span', null, info ? 'Act ' + info.roman + ' — ' + info.name : 'Miscellaneous Horrors'), el('span.codex-count', null, known + ' / ' + list.length)));
      const grid = el('div.codex-grid');
      list.forEach(function (e) { grid.appendChild(enemyCard(e)); });
      box.appendChild(grid);
    });
    return box;
  }

  /** V3: the Act IV group (only reached behind the gate): a sub-group per lane, then the floor boss. */
  function codexAct4(box, all) {
    const UI = DD.UI, el = UI.el;
    const groups = act4Groups(all);
    if (!groups.length) return;
    const info = UI.ACTS[4];
    const enemies = [].concat.apply([], groups.map(function (g) { return g.enemies; }));
    const known = enemies.filter(function (e) { return isSeenEnemy(e.id); }).length;
    box.appendChild(el('div.codex-h.act-4', null, el('span', null, 'Act ' + info.roman + ' — ' + info.name), el('span.codex-count', null, known + ' / ' + enemies.length)));
    groups.forEach(function (g) {
      const met = g.enemies.some(function (e) { return isSeenEnemy(e.id); });
      const sub = el('div.codex-sub', null, el('span.cs-title', null, g.icon + ' ' + g.title), g.note ? el('span.cs-note', null, ' ' + g.note) : null);
      box.appendChild(sub);
      const grid = el('div.codex-grid');
      g.enemies.forEach(function (e) {
        const label = e.tier === 'boss' ? (e.boss && e.boss.mini ? 'Mini-boss' : 'Floor Boss') : g.bossIds.indexOf(e.id) >= 0 ? 'Mini-boss' : null;
        grid.appendChild(enemyCard(e, label));
      });
      g.things.forEach(function (t) { grid.appendChild(thingCard(t.def, t.kind, met)); });
      box.appendChild(grid);
    });
  }

  function history() {
    const UI = DD.UI, el = UI.el;
    const list = (meta().history || []).slice();
    const ts = function (e) { return num(e && (e.endedAt || e.date || e.time || e.at)); };
    list.sort(function (a, b) { return ts(b) - ts(a); });
    const box = el('div.hall-history');
    const seen4 = UI.act4Seen();
    if (!list.length) { box.appendChild(el('div.empty-state', null, el('div.es-icon', null, '⏳'), el('div', null, 'No finished campaigns yet. History is written by the survivors, and so far there are none.'))); return box; }
    list.slice(0, 40).forEach(function (h) {
      const won = h.result === 'victory' || h.result === 'win' || h.won === true;
      const abandoned = h.result === 'abandon' || h.result === 'abandoned';
      const party = (h.party || h.heroes || []).map(function (x) { return typeof x === 'string' ? { id: x } : x; }).filter(function (x) { return x && x.id; });
      const diff = UI.DIFFICULTIES.filter(function (d) { return d.id === h.difficulty; })[0];
      const stats = h.stats || {};
      const kills = h.kills !== undefined ? num(h.kills) : stats.kills !== undefined ? num(stats.kills) : null;
      const act = DD.util.roman(num(h.act) || 1);
      // V3: the floor boss's fight is named after him (he cheated); classic wins say so once act IV is known
      const killer = UI.killerOf(h);
      const fourAct = num(h.acts) >= 4;
      const title = won ? (fourAct ? 'Victory! The floor boss, floored' : seen4 ? 'Won (classic, 3 acts)' : 'Victory!') :
        abandoned ? 'Abandoned in Act ' + act : 'Fell in Act ' + act + (killer ? ' to ' + killer.name + UI.cheatedText(killer) : '');
      const meta = [ts(h) ? UI.ago(ts(h)) : '', diff ? diff.icon + ' ' + diff.name : '', kills !== null ? '💀 ' + kills + ' kills' : '',
        stats.durationMs ? '⏱️ ' + UI.duration(stats.durationMs) : ''].filter(Boolean).join(' · ');
      // V3: a run that reached Svammiel's floor: "Act IV · 3 / 5 floor bosses" (M: that run's lane count) + the lanes beaten
      const fc = UI.floorCounts(h);
      const floor = fc.m > 0 ? el('div.hist-floor', null, 'Act ' + DD.util.roman(Math.max(4, num(h.act))) + ' · ' + fc.n + ' / ' + fc.m + ' floor bosses',
        fc.order.length ? el('span.hist-lanes', null, fc.order.map(function (id) { const li = UI.laneInfo(id); return el('span', { title: li.shortName }, li.icon); })) : null) : null;
      box.appendChild(el('div.hist-row', { class: won ? 'won' : abandoned ? 'abandoned' : 'lost' },
        el('div.hist-result', null, won ? '👑' : abandoned ? '🏳️' : '💀'),
        el('div.hist-main', null,
          el('div.hist-title', null, title, h.title ? el('span.hist-sub', null, ' — “' + h.title + '”') : null),
          floor,
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
