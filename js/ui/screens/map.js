/* Dungeons and Degenerates — js/ui/screens/map.js
 * Act map: a parchment board with the act's branching nodes (rows run left → right toward the boss), curved links,
 * the party token at the current node, reachable nodes pulsing (click → DD.Run.travel), hover tooltips, a legend and
 * a DM narration line. Sidebar: party HP / levels with who is next in the level-up rotation (v2: no XP — one hero
 * levels up per won fight, the lowest level first), consumables, gold, Party / Settings / Save & Quit.
 * Shows a big act title banner the first time an act's map is opened. At the start of act 1 the banner and the
 * narration box also name each hero's Session Zero quirk (the Blessing rolled at run start).
 */
(function () {
  'use strict';
  const DD = window.DD;

  const LEGEND = ['combat', 'elite', 'event', 'shop', 'tavern', 'treasure', 'boss'];
  const SVGNS = 'http://www.w3.org/2000/svg';
  const MAP_ENTER_FALLBACK = [
    'The party consults the map. The map consults the party. Nobody is reassured.',
    'Somewhere ahead: loot, glory and at least one goblin with a grudge.',
    'Choose a path. The DM has prepared exactly one of them.',
  ];

  let bannerShownFor = null;
  let timers = [];

  function nodeList(map) {
    const out = [];
    if (!map || !map.nodes) return out;
    const n = map.nodes;
    if (Array.isArray(n)) return n.filter(Boolean);
    for (const k in n) if (n[k]) out.push(n[k]);
    return out;
  }

  /** Percent coordinates for every node (x by row, y by column), deterministic jitter for an organic look. */
  function layout(map) {
    const nodes = nodeList(map);
    const pos = {};
    if (!nodes.length) return pos;
    let maxRow = 0, maxCol = 0;
    const perRow = {};
    nodes.forEach(function (n) {
      maxRow = Math.max(maxRow, n.row || 0);
      maxCol = Math.max(maxCol, n.col || 0);
      (perRow[n.row || 0] = perRow[n.row || 0] || []).push(n);
    });
    const lattice = nodes.some(function (n) { return (n.col || 0) >= perRow[n.row || 0].length; });
    const maxInRow = Math.max.apply(null, Object.keys(perRow).map(function (r) { return perRow[r].length; }));
    nodes.forEach(function (n) {
      const row = n.row || 0;
      const x = 11 + (maxRow ? row / maxRow : 0.5) * 82;
      let y;
      if (n.type === 'boss' || n.id === map.boss) y = 50;
      else if (typeof n.x === 'number' && isFinite(n.x)) y = 10 + DD.util.clamp(n.x, 0, 1) * 80; // RunMap's 0..1 hint
      else if (lattice && maxCol > 0) y = 13 + ((n.col || 0) / maxCol) * 74;
      else {
        const list = perRow[row].slice().sort(function (a, b) { return (a.col || 0) - (b.col || 0); });
        const rank = list.indexOf(n);
        const spacing = Math.min(74 / Math.max(1, maxInRow - 1), 24);
        y = 50 + (rank - (list.length - 1) / 2) * spacing;
      }
      const h = DD.util.hash(String(n.id));
      const jx = n.type === 'boss' ? 0 : ((h % 100) / 100 - 0.5) * 2.4;
      const jy = n.type === 'boss' ? 0 : (((h >>> 8) % 100) / 100 - 0.5) * 4;
      pos[n.id] = { x: x + jx, y: DD.util.clamp(y + jy, 8, 92) };
    });
    return pos;
  }

  function availableIds(run) {
    let list = [];
    if (DD.Run && typeof DD.Run.availableNodes === 'function') list = DD.safe('Run.availableNodes', DD.Run.availableNodes, DD.Run) || [];
    return list.map(function (n) { return typeof n === 'object' && n ? n.id : n; });
  }

  function svg(tag, attrs) {
    const e = document.createElementNS(SVGNS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  function curve(a, b) {
    const dx = (b.x - a.x) * 0.5;
    return 'M ' + a.x.toFixed(2) + ' ' + a.y.toFixed(2) + ' C ' + (a.x + dx).toFixed(2) + ' ' + a.y.toFixed(2) + ', ' + (b.x - dx).toFixed(2) + ' ' + b.y.toFixed(2) + ', ' + b.x.toFixed(2) + ' ' + b.y.toFixed(2);
  }

  function nodeTooltip(node, state) {
    const UI = DD.UI;
    const info = UI.NODE_TYPES[node.type] || { icon: '❔', name: DD.util.capitalize(node.type || 'Unknown'), desc: '' };
    let extra = '';
    if (node.type === 'boss' && node.encounterId) {
      const enc = DD.getEncounter(node.encounterId);
      if (enc) {
        const bossId = (enc.enemies || []).map(function (e) { return e.id; }).filter(function (id) { const d = DD.getEnemy(id); return d && d.tier === 'boss'; })[0];
        const bd = bossId ? DD.getEnemy(bossId) : null;
        extra = '<div class="tt-target">👑 ' + UI.esc(bd ? bd.name + (bd.boss && bd.boss.title ? ', ' + bd.boss.title : '') : enc.name || 'Unknown horror') + '</div>';
      }
    }
    const status = state === 'reachable' ? '<div class="tt-foot good">Click to travel here.</div>' :
      state === 'current' ? '<div class="tt-foot">The party is here.</div>' :
        state === 'visited' ? '<div class="tt-foot">Already visited.</div>' :
          state === 'skipped' ? '<div class="tt-foot">The road not taken.</div>' : '<div class="tt-foot">Not reachable yet.</div>';
    return '<div class="tt tt-node"><div class="tt-head"><span class="tt-icon">' + info.icon + '</span><div class="tt-titles"><div class="tt-title">' + UI.esc(info.name) + '</div><div class="tt-sub">Row ' + ((node.row || 0) + 1) + '</div></div></div>' +
      '<div class="tt-desc">' + UI.esc(info.desc) + '</div>' + extra + status + '</div>';
  }

  function travel(nodeId) {
    const UI = DD.UI;
    if (!DD.Run || typeof DD.Run.travel !== 'function') { UI.toast('The road is closed (run system unavailable).', { cls: 'bad' }); return; }
    UI.sound('step');
    DD.safe('Run.travel', DD.Run.travel, DD.Run, [nodeId]);
  }

  function renderBoard(board, run) {
    const UI = DD.UI, el = UI.el;
    board.innerHTML = '';
    const map = run.map;
    const nodes = nodeList(map);
    if (!nodes.length) {
      board.appendChild(el('div.empty-state', null, el('div.es-icon', null, '🗺️'), el('div', null, 'The map is blank. The DM is still drawing it.')));
      return;
    }
    const pos = layout(map);
    const visited = (run.visited || []).slice();
    const avail = availableIds(run);
    const current = run.nodeId;
    const visitedSet = {};
    visited.forEach(function (id) { visitedSet[id] = true; });
    if (current) visitedSet[current] = true;
    const curNode = current && map.nodes ? (Array.isArray(map.nodes) ? map.nodes.filter(function (n) { return n.id === current; })[0] : map.nodes[current]) : null;
    const curRow = curNode ? curNode.row || 0 : -1;
    const start = { x: 3.2, y: 50 };

    const links = svg('svg', { class: 'map-links', viewBox: '0 0 100 100', preserveAspectRatio: 'none' });
    function addLink(a, b, cls) {
      const d = curve(a, b);
      links.appendChild(svg('path', { d: d, class: 'link-shadow ' + cls, 'vector-effect': 'non-scaling-stroke' }));
      links.appendChild(svg('path', { d: d, class: 'link ' + cls, 'vector-effect': 'non-scaling-stroke' }));
    }
    const traveled = {};
    for (let i = 1; i < visited.length; i++) traveled[visited[i - 1] + '>' + visited[i]] = true;
    if (current && visited[visited.length - 1] !== current && visited.length) traveled[visited[visited.length - 1] + '>' + current] = true;
    const firstVisited = visited[0] || current;
    (map.start || []).forEach(function (id) {
      if (!pos[id]) return;
      addLink(start, pos[id], id === firstVisited ? 'done' : !current ? 'open' : 'faded');
    });
    nodes.forEach(function (n) {
      (n.links || []).forEach(function (to) {
        if (!pos[to] || !pos[n.id]) return;
        let cls = 'future';
        if (traveled[n.id + '>' + to]) cls = 'done';
        else if (n.id === current && avail.indexOf(to) >= 0) cls = 'open';
        else if ((n.row || 0) < curRow || (current && (n.row || 0) === curRow && n.id !== current)) cls = 'faded';
        addLink(pos[n.id], pos[to], cls);
      });
    });
    board.appendChild(links);

    const startMark = el('div.map-start', { style: { left: start.x + '%', top: start.y + '%' } }, el('span', null, '🏕️'));
    UI.tooltip(startMark, '<div class="tt"><div class="tt-title">Party Camp</div><div class="tt-desc">Where the campaign begins. The fire is mostly for ambience.</div></div>', { pos: 'right' });
    board.appendChild(startMark);

    const layer = el('div.map-nodes');
    nodes.forEach(function (n) {
      const p = pos[n.id];
      if (!p) return;
      const isCur = n.id === current;
      const isAvail = avail.indexOf(n.id) >= 0;
      const isVisited = !isCur && (visitedSet[n.id] || n.done);
      const skipped = !isCur && !isVisited && !isAvail && ((n.row || 0) <= curRow);
      const state = isCur ? 'current' : isAvail ? 'reachable' : isVisited ? 'visited' : skipped ? 'skipped' : 'locked';
      const info = UI.NODE_TYPES[n.type] || { icon: '❔', name: n.type };
      const node = el('button.map-node', { type: 'button', class: ['t-' + (n.type || 'unknown'), 's-' + state], style: { left: p.x + '%', top: p.y + '%' }, dataset: { id: n.id } },
        el('span.mn-ring'), el('span.mn-icon', null, info.icon),
        n.type === 'boss' ? el('span.mn-label', null, 'Boss') : null,
        isVisited ? el('span.mn-check', null, '✓') : null);
      UI.tooltip(node, function () { return nodeTooltip(n, state); }, { pos: p.y < 30 ? 'bottom' : 'top' });
      node.addEventListener('click', function () {
        if (state !== 'reachable') { UI.sound('error'); return; }
        travel(n.id);
      });
      layer.appendChild(node);
    });
    board.appendChild(layer);

    const tokenAt = curNode && pos[current] ? pos[current] : start;
    const lead = (run.party || []).filter(function (h) { return !h.dead; })[0] || (run.party || [])[0];
    const token = el('div.party-token', { style: { left: tokenAt.x + '%', top: tokenAt.y + '%' } }, lead ? UI.portrait(lead.id, 30) : el('span', null, '🛡️'));
    UI.tooltip(token, '<div class="tt"><div class="tt-desc">Your party. Allegedly heroes.</div></div>');
    board.appendChild(token);

    board.appendChild(el('div.map-legend', null, LEGEND.map(function (t) {
      const i = UI.NODE_TYPES[t];
      return el('span.lg-item', null, el('span.lg-icon', null, i.icon), i.name);
    })));
    board.appendChild(el('div.compass', { html: '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".5"/><circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" stroke-width=".8" opacity=".4"/><polygon points="50,6 57,50 50,94 43,50" fill="currentColor" opacity=".55"/><polygon points="6,50 50,43 94,50 50,57" fill="currentColor" opacity=".35"/><text x="50" y="22" text-anchor="middle" font-size="11" font-family="Cinzel,Georgia,serif" fill="currentColor">N</text></svg>' }));
  }

  function renderSide(side, run) {
    const UI = DD.UI, el = UI.el;
    side.innerHTML = '';
    side.appendChild(el('div.side-h', null, 'The Party'));
    const list = el('div.side-party');
    (run.party || []).forEach(function (rh, i) {
      const row = UI.heroMini(rh, i, { levelHint: true, tipPos: 'right' });
      row.classList.add('clickable');
      row.addEventListener('click', function () { UI.sound('click'); UI.show('party', { back: 'map', hero: i }); });
      list.appendChild(row);
    });
    side.appendChild(list);
    const next = UI.nextLevelUp();
    if (next && next.text) {
      const line = el('div.side-next', null, el('span.sn-icon', null, '🎲'), el('span', null, next.text));
      UI.tooltip(line, '<div class="tt"><div class="tt-title">Level-ups</div><div class="tt-desc">No XP: every won fight levels up one hero, picked at random among the living heroes with the lowest level. Everyone reaches a level before anyone gets the next one.</div></div>', { pos: 'right' });
      side.appendChild(line);
    }
    side.appendChild(el('div.side-h', null, 'Supplies'));
    side.appendChild(el('div.side-supplies', null, el('div.side-gold', { title: 'Party gold' }, UI.goldText(run.gold, { big: true })), UI.consumableSlots({ tipPos: 'right' })));
    const stats = run.stats || {};
    const diff = UI.DIFFICULTIES.filter(function (d) { return d.id === run.difficulty; })[0];
    side.appendChild(el('div.side-stats', null,
      diff ? UI.tooltip(el('span.chip', null, diff.icon + ' ' + diff.name), '<div class="tt"><div class="tt-desc">' + UI.esc(diff.desc) + '</div></div>', { pos: 'right' }) : null,
      el('span.chip', { title: 'Fights won' }, '⚔️ ' + (stats.combats || 0)),
      el('span.chip', { title: 'Kills' }, '💀 ' + (stats.kills || 0))));
    const btns = el('div.side-buttons');
    if (pendingChoices(run)) {
      btns.appendChild(UI.button('Level Up!', function () { UI.show('levelup', { next: 'map' }); }, {
        icon: '✨', cls: 'block primary levelup-cta', hotkey: 'l',
        tooltip: '<div class="tt"><div class="tt-desc">A level-up boon (or a new skill, or a Blessing roll) is waiting. Choose it before your next fight!</div></div>',
      }));
    }
    btns.appendChild(UI.button('Party & Loadout', function () { UI.show('party', { back: 'map' }); }, { icon: '🎒', cls: 'block', hotkey: 'p' }));
    btns.appendChild(el('div.side-row', null,
      UI.button('Settings', function () { UI.show('settings', { back: 'map' }); }, { cls: 'small ghost' }),
      UI.button('Save & Quit', function () {
        if (DD.Run && typeof DD.Run.save === 'function') DD.safe('Run.save', DD.Run.save, DD.Run);
        UI.toast('Campaign saved. The DM will remember everything.', { icon: '💾' });
        UI.show('title');
      }, { cls: 'small ghost' })));
    btns.appendChild(UI.button('Abandon Campaign', function () {
      UI.confirm('Abandon this campaign? It counts as a loss and the save is deleted. The goblins will tell everyone.', { title: 'Abandon Campaign?', yes: 'Abandon', danger: true, icon: '🏳️' }).then(function (ok) {
        if (!ok) return;
        if (DD.Run && typeof DD.Run.abandon === 'function') DD.safe('Run.abandon', DD.Run.abandon, DD.Run);
        UI.show('title');
      });
    }, { cls: 'small danger-ghost block' }));
    side.appendChild(btns);
  }

  /** Living heroes with the Blessings they hold: at the start of act 1 these are the Session Zero quirks (one roll per
   *  hero at run start, never cursed, auto-kept — DD.Run, §9.6). [] without the table or Blessings. */
  function quirkHeroes(run) {
    if (!DD.Passives || !run || (run.act || 1) !== 1) return [];
    return (run.party || []).filter(function (rh) { return rh && !rh.dead && (rh.passives || []).length; });
  }

  /** "Session Zero quirks" line under the act-1 intro: each hero's starting Blessing as an icon chip (full text in
   *  its tooltip), kept to about one line so the narration box never covers the first map nodes. */
  function quirkBox(run) {
    const UI = DD.UI, el = UI.el;
    const list = quirkHeroes(run);
    if (!list.length || typeof UI.passiveChip !== 'function') return null;
    const head = el('span.sz-head', null, '🎲 Session Zero quirks:');
    UI.tooltip(head, '<div class="tt"><div class="tt-title">Session Zero quirks</div><div class="tt-desc">Everyone rolled one Blessing on the Table of Questionable Blessings before the campaign (never cursed). Hover an icon for its text; the Party screen lists them all.</div><div class="tt-flavor">Character backstory, but random.</div></div>', { pos: 'bottom' });
    return el('div.sz-quirks', null, head, list.map(function (rh) {
      return el('span.sz-hero', null, el('span.sz-name', null, UI.heroName(rh)), rh.passives.map(function (p) { return UI.passiveChip(p, { compact: true, tipPos: 'bottom' }); }));
    }));
  }

  function showActBanner(root, run) {
    const UI = DD.UI, el = UI.el;
    const act = UI.ACTS[run.act] || { roman: DD.util.roman(run.act || 1), name: '', sub: '' };
    const intro = UI.narrate('act_intro_' + (run.act || 1), {}, []);
    const quirks = !run.nodeId && !(run.visited && run.visited.length) ? quirkHeroes(run) : [];
    const banner = el('div.act-banner', null,
      el('div.ab-act', null, 'Act ' + act.roman),
      el('div.ab-name', null, act.name),
      intro ? el('div.ab-intro', null, intro) : el('div.ab-intro', null, act.sub),
      quirks.length ? el('div.ab-quirks', null, el('span.abq-h', null, '🎲 Session Zero quirks'), quirks.map(function (rh) {
        return el('span.abq-hero', null, el('b', null, UI.heroName(rh) + ':'), ' ' + rh.passives.map(function (p) {
          const info = UI.passiveInfo(p);
          return info.icon + ' ' + info.name + (info.level > 1 ? ' ' + DD.util.roman(info.level) : '');
        }).join(', '));
      })) : null);
    // Dismissed by a click or after a few seconds; while fading out it no longer swallows clicks on the map.
    function dismiss() {
      if (banner.classList.contains('out')) return;
      banner.classList.add('out');
      timers.push(setTimeout(function () { if (banner.parentNode) banner.parentNode.removeChild(banner); }, 750));
    }
    banner.addEventListener('click', dismiss);
    root.appendChild(banner);
    UI.sound('turn');
    timers.push(setTimeout(dismiss, 3600));
  }

  function mount(root, params) {
    const UI = DD.UI, el = UI.el;
    const run = UI.run();
    params = params || {};
    timers = [];
    if (!run) {
      root.appendChild(el('div.center-message.panel', null, el('div.es-icon', null, '🗺️'), el('h2', null, 'No campaign in progress'), el('p', null, 'Start a new campaign to get a map. Maps are free. Survival costs extra.'),
        UI.button('New Campaign', function () { UI.show('partySelect'); }, { cls: 'primary' }), UI.button('Title', function () { UI.show('title'); }, { cls: 'ghost' })));
      return;
    }
    root.classList.add('act-' + (run.act || 1));
    const act = UI.ACTS[run.act] || { roman: DD.util.roman(run.act || 1), name: 'Uncharted', sub: '' };
    const top = el('div.map-top',
      el('div.map-cartouche', null,
        el('div.mc-act', null, 'Act ' + act.roman),
        el('div.mc-titles', null, el('div.mc-name', null, act.name), el('div.mc-sub', null, act.sub))));
    root.appendChild(top);
    const body = el('div.map-body');
    const side = el('aside.map-side.panel');
    const board = el('main.map-board');
    body.appendChild(side);
    body.appendChild(board);
    root.appendChild(body);
    renderSide(side, run);
    renderBoard(board, run);
    const atStart = !run.nodeId && !(run.visited && run.visited.length);
    const line = params.text || UI.narrate(atStart ? 'act_intro_' + (run.act || 1) : 'map_enter', {}, MAP_ENTER_FALLBACK);
    const quirks = atStart ? quirkBox(run) : null;
    if (line || quirks) board.appendChild(el('div.map-narration', null, UI.narration(line), quirks));
    const bannerKey = (run.seed || '') + ':' + (run.act || 1);
    if ((atStart || params.intro) && bannerShownFor !== bannerKey && !DD.headless) {
      bannerShownFor = bannerKey;
      showActBanner(root, run);
    }
  }

  /** Level-ups / skill learns waiting for a decision (non-blocking in the run layer). */
  function pendingChoices(run) {
    if (DD.Run && typeof DD.Run.hasPendingChoices === 'function') return !!DD.safe('Run.hasPendingChoices', DD.Run.hasPendingChoices, DD.Run);
    return (run.party || []).some(function (h) { return !h.dead && +h.pendingLevels > 0; });
  }

  DD.afterLoad(function () {
    if (!DD.UI) return;
    DD.UI.screen('map', {
      scene: 'none',
      cls: 'full',
      mount: mount,
      update: function (root) {
        const run = DD.UI.run();
        const side = root.querySelector('.map-side');
        const board = root.querySelector('.map-board');
        if (!run || !side || !board) return;
        renderSide(side, run);
        const narr = board.querySelector('.map-narration');
        renderBoard(board, run);
        if (narr) board.appendChild(narr);
      },
      unmount: function () {
        timers.forEach(function (t) { clearTimeout(t); });
        timers = [];
      },
    });
  });
})();
