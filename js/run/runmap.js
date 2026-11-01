/* Dungeons and Degenerates — js/run/runmap.js
 * Act map generation (DD.RunMap, ARCHITECTURE §9.3, DESIGN §3): 7 rows of 2-4 nodes plus a boss row.
 * Row 0 is all combat, row 6 all taverns (rest before the boss), elites from row 2, at most one shop per row.
 * Links only go to the next row and are built as a monotone "staircase" between consecutive rows, so they never
 * cross and every node is reachable from a start node and leads to the boss.
 * Encounters/events are pre-assigned when the registries have them; DD.Run re-validates them and assigns lazily
 * at travel time when they are missing.
 * ActMap = { act, rows: 8, nodes: { [id]: Node }, start: [ids], boss: id, layout: [[ids per row]], cleared }
 * Node   = { id, row, col, x (0..1 horizontal layout hint), type, links: [ids], encounterId?, eventId?, done }
 */
(function () {
  'use strict';
  const DD = window.DD;

  const ROWS = 7;                 // regular rows 0..6
  const BOSS_ROW = ROWS;          // the boss node sits on row 7
  const TAVERN_ROW = ROWS - 1;
  const ELITE_MIN_ROW = 2;

  const TYPES = {
    combat: { icon: '⚔️', name: 'Combat', desc: 'A regular fight. Gold, one hero levels up, and a reward.' },
    elite: { icon: '💀', name: 'Elite', desc: 'A nasty fight. One hero levels up. Always offers a rare item.' },
    event: { icon: '❓', name: 'Event', desc: 'Something weird happens. Choices matter.' },
    shop: { icon: '🛒', name: 'Shop', desc: 'Ye Olde Overpriced Shoppe: items, skill tomes, potions, services.' },
    tavern: { icon: '🍺', name: 'Tavern', desc: 'Pick one: rest, train a skill or recruit a hero.' },
    treasure: { icon: '💰', name: 'Treasure', desc: 'Free gold and loot. Probably not a mimic.' },
    boss: { icon: '👑', name: 'Boss', desc: 'The act boss. One hero levels up. Always offers a legendary item.' },
  };
  // Type weights for rows 1-5 (DESIGN §5 pacing: roughly 4-5 fights per act on any path).
  const WEIGHTS = { combat: 44, event: 24, elite: 14, shop: 9, treasure: 7, tavern: 3 };
  // These never appear directly after a node of the same type.
  const NO_REPEAT = { elite: true, shop: true, treasure: true, tavern: true };

  function values(obj) { return Object.keys(obj || {}).map(function (k) { return obj[k]; }); }
  function isFight(type) { return type === 'combat' || type === 'elite' || type === 'boss'; }
  function actMatch(def, act) {
    return Array.isArray(def.act) ? def.act.indexOf(act) >= 0 : +def.act === act;
  }
  function actsMatch(acts, act) { return !Array.isArray(acts) || !acts.length || acts.indexOf(act) >= 0; }
  function weightOf(def) { const w = def && def.weight; return typeof w === 'number' && isFinite(w) ? Math.max(0, w) : 1; }

  function rowSize(r, rng) {
    if (r === 0) return rng.weighted([2, 3, 4], function (n) { return n === 3 ? 3 : 1; });
    if (r === TAVERN_ROW) return rng.weighted([2, 3], function (n) { return n === 2 ? 2 : 1; });
    return rng.weighted([2, 3, 4], function (n) { return n === 3 ? 2 : n === 4 ? 1.5 : 1; });
  }

  /** Link row a -> row b with a monotone lattice path from (0,0) to (last,last): no crossings, full coverage. */
  function linkRows(a, b, nodes, rng) {
    let i = 0, j = 0;
    const outDeg = a.map(function () { return 0; });
    const inDeg = b.map(function () { return 0; });
    function link() { nodes[a[i]].links.push(b[j]); outDeg[i]++; inDeg[j]++; }
    link();
    while (i < a.length - 1 || j < b.length - 1) {
      const canI = i < a.length - 1, canJ = j < b.length - 1;
      let step;
      if (canI && canJ) {
        const opts = ['both'];
        if (inDeg[j] < 2) opts.push('i');   // a[i+1] -> b[j]: b[j] gains a parent
        if (outDeg[i] < 2) opts.push('j');  // a[i] -> b[j+1]: a[i] gains a child
        step = rng.weighted(opts, function (s) { return s === 'both' ? 4 : 3; });
      } else {
        step = canI ? 'i' : 'j';
      }
      if (step !== 'j') i++;
      if (step !== 'i') j++;
      link();
    }
  }

  function parentMap(nodes) {
    const parents = {};
    Object.keys(nodes).forEach(function (id) { parents[id] = parents[id] || []; });
    Object.keys(nodes).forEach(function (id) {
      nodes[id].links.forEach(function (c) { (parents[c] = parents[c] || []).push(id); });
    });
    return parents;
  }

  function typeCounts(layout, nodes) {
    const counts = {};
    for (let r = 1; r < TAVERN_ROW; r++) {
      layout[r].forEach(function (id) { const t = nodes[id].type; counts[t] = (counts[t] || 0) + 1; });
    }
    return counts;
  }

  /** Node type weights (DD.Balance.map.weights, else WEIGHTS) and the shops guaranteed per act. [balance] */
  function weights() {
    const w = DD.Balance && DD.Balance.map && DD.Balance.map.weights;
    if (!w) return WEIGHTS;
    const out = {};
    Object.keys(WEIGHTS).forEach(function (k) { out[k] = typeof w[k] === 'number' && w[k] >= 0 ? w[k] : WEIGHTS[k]; });
    return out;
  }
  function minShops() {
    const m = DD.Balance && DD.Balance.map && DD.Balance.map.minShops;
    return typeof m === 'number' && m >= 1 ? Math.floor(m) : 1;
  }

  function assignTypes(layout, nodes, rng) {
    const parents = parentMap(nodes);
    const W = weights();
    layout[0].forEach(function (id) { nodes[id].type = 'combat'; });
    layout[TAVERN_ROW].forEach(function (id) { nodes[id].type = 'tavern'; });
    for (let r = 1; r < TAVERN_ROW; r++) {
      let shops = 0, taverns = 0;
      layout[r].forEach(function (id) {
        const pTypes = parents[id].map(function (p) { return nodes[p].type; });
        const options = Object.keys(W).filter(function (type) {
          if (type === 'elite' && r < ELITE_MIN_ROW) return false;
          if (type === 'shop' && shops >= 1) return false;
          if (type === 'tavern' && (r < 2 || r > TAVERN_ROW - 2 || taverns >= 1)) return false;
          return !(NO_REPEAT[type] && pTypes.indexOf(type) >= 0);
        });
        const type = rng.weighted(options, function (t) {
          return W[t] * (t === 'event' && pTypes.indexOf('event') >= 0 ? 0.5 : 1);
        });
        nodes[id].type = type;
        if (type === 'shop') shops++;
        if (type === 'tavern') taverns++;
      });
      // every row offers at least one fight
      if (!layout[r].some(function (id) { return isFight(nodes[id].type); })) {
        nodes[rng.pick(layout[r])].type = 'combat';
      }
    }
    ensureType(layout, nodes, parents, 'shop', 1, rng, minShops());
    ensureType(layout, nodes, parents, 'elite', ELITE_MIN_ROW, rng);
    ensureType(layout, nodes, parents, 'event', 1, rng);
  }

  /** Guarantee at least `min` (1) nodes of `type` in rows fromRow..5 by converting nodes that can spare their type. */
  function ensureType(layout, nodes, parents, type, fromRow, rng, min) {
    min = Math.max(1, min || 1);
    for (let guard = 0; guard < 6; guard++) {
      const counts = typeCounts(layout, nodes);
      if ((counts[type] || 0) >= min) return;
      const cands = [];
      for (let r = fromRow; r < TAVERN_ROW; r++) {
        if (type === 'shop' && layout[r].some(function (id) { return nodes[id].type === 'shop'; })) continue;
        layout[r].forEach(function (id) {
          const n = nodes[id];
          const rowFights = layout[r].filter(function (x) { return isFight(nodes[x].type); }).length;
          if (isFight(n.type) && rowFights <= 1 && !isFight(type)) return;   // keep the row's only fight
          if ((n.type === 'shop' || n.type === 'elite' || n.type === 'event') && counts[n.type] <= 1) return;
          if (NO_REPEAT[type]) {
            if (parents[id].some(function (p) { return nodes[p].type === type; })) return;
            if (n.links.some(function (c) { return nodes[c].type === type; })) return;
          }
          cands.push(id);
        });
      }
      if (!cands.length) return;
      nodes[rng.pick(cands)].type = type;
    }
  }

  // ---- content picking (shared with DD.Run for lazy assignment) ---------------------------------
  function pickFromRegistry(act, kind, rng, depth, exclude) {
    const all = values(DD.defs.encounters).filter(function (e) { return e && e.id && !e.fallback; });
    const kinds = kind === 'boss' ? ['boss', 'elite', 'normal'] : kind === 'elite' ? ['elite', 'normal'] : ['normal'];
    for (let k = 0; k < kinds.length; k++) {
      const ofKind = all.filter(function (e) { return e.kind === kinds[k]; });
      if (!ofKind.length) continue;
      const tiers = [
        function (e) { return actMatch(e, act) && (e.minDepth || 0) <= depth && exclude.indexOf(e.id) < 0; },
        function (e) { return actMatch(e, act) && exclude.indexOf(e.id) < 0; },
        function (e) { return actMatch(e, act); },
      ];
      for (let t = 0; t < tiers.length; t++) {
        const c = ofKind.filter(tiers[t]);
        if (c.length) return rng.weighted(c, weightOf);
      }
      // no encounter of this kind for the act: use the nearest act's (keeps unfinished content playable)
      let best = Infinity;
      ofKind.forEach(function (e) { best = Math.min(best, Math.abs((+e.act || 1) - act)); });
      const near = ofKind.filter(function (e) { return Math.abs((+e.act || 1) - act) === best; });
      if (near.length) return rng.weighted(near, weightOf);
    }
    return null;
  }

  /** Encounter def for (act, kind) — DD.Encounter.pick when available, else the registry. null if none exist. */
  function pickEncounter(act, kind, rng, opts) {
    opts = opts || {};
    rng = rng || DD.RNG('enc:' + act + ':' + kind);
    const depth = opts.depth != null ? opts.depth : 0;
    const exclude = opts.exclude || [];
    if (DD.Encounter && typeof DD.Encounter.pick === 'function') {
      const def = DD.safe('Encounter.pick', DD.Encounter.pick, DD.Encounter, [act, kind, rng, { depth: depth, exclude: exclude }]);
      if (def && def.id && DD.getEncounter(def.id)) return DD.getEncounter(def.id);
    }
    return pickFromRegistry(act, kind, rng, depth, exclude);
  }

  /** True if an event can be offered now (act, uniqueness, requires(run)). */
  function eventAvailable(def, act, run) {
    if (!def || def.fallback || !Array.isArray(def.choices) || !def.choices.length) return false;
    if (!actsMatch(def.acts, act)) return false;
    const seen = run && Array.isArray(run.seenEvents) ? run.seenEvents : [];
    if (def.unique !== false && seen.indexOf(def.id) >= 0) return false;
    if (typeof def.requires === 'function' && run) return !!DD.safe('requires of event ' + def.id, def.requires, def, [run]);
    return true;
  }

  function pickEvent(act, rng, opts) {
    opts = opts || {};
    rng = rng || DD.RNG('event:' + act);
    const exclude = opts.exclude || [];
    const cands = values(DD.defs.events).filter(function (e) {
      return e && exclude.indexOf(e.id) < 0 && eventAvailable(e, act, opts.run || null);
    });
    if (!cands.length) return null;
    return rng.weighted(cands, weightOf);
  }

  function assignContent(map, rng, opts) {
    const usedEnc = (opts.exclude || []).slice();
    const usedEvents = [];
    map.layout.forEach(function (row) {
      row.forEach(function (id) {
        const n = map.nodes[id];
        if (isFight(n.type)) {
          const enc = pickEncounter(map.act, n.type === 'combat' ? 'normal' : n.type, rng, { depth: n.row, exclude: usedEnc });
          if (enc) { n.encounterId = enc.id; usedEnc.push(enc.id); }
        } else if (n.type === 'event') {
          const ev = pickEvent(map.act, rng, { run: opts.run, exclude: usedEvents });
          if (ev) { n.eventId = ev.id; usedEvents.push(ev.id); }
        }
      });
    });
  }

  /** Build an act map. opts: { run (for event requires), exclude: [encounter ids to avoid] }. */
  function generate(act, rng, opts) {
    opts = opts || {};
    act = Math.max(1, Math.floor(+act) || 1);
    rng = rng || DD.RNG('map:' + act);
    const nodes = {};
    const layout = [];
    for (let r = 0; r < ROWS; r++) {
      const n = rowSize(r, rng);
      const ids = [];
      for (let c = 0; c < n; c++) {
        const id = 'a' + act + '_r' + r + 'c' + c;
        nodes[id] = { id: id, row: r, col: c, x: (c + 0.5) / n, type: null, links: [], done: false };
        ids.push(id);
      }
      layout.push(ids);
    }
    const bossId = 'a' + act + '_boss';
    nodes[bossId] = { id: bossId, row: BOSS_ROW, col: 0, x: 0.5, type: 'boss', links: [], done: false };
    layout.push([bossId]);
    for (let r = 0; r < ROWS - 1; r++) linkRows(layout[r], layout[r + 1], nodes, rng);
    layout[TAVERN_ROW].forEach(function (id) { nodes[id].links.push(bossId); });
    assignTypes(layout, nodes, rng);
    const map = { act: act, rows: BOSS_ROW + 1, nodes: nodes, start: layout[0].slice(), boss: bossId, layout: layout, cleared: false };
    assignContent(map, rng, opts);
    return map;
  }

  /** Structural checks (tests / debug). Returns a list of problems; empty means valid. */
  function validate(map) {
    const out = [];
    if (!map || !map.nodes || !Array.isArray(map.layout)) return ['map is missing nodes/layout'];
    const nodes = map.nodes;
    if (map.rows !== BOSS_ROW + 1 || map.layout.length !== BOSS_ROW + 1) out.push('expected ' + (BOSS_ROW + 1) + ' rows');
    map.layout.forEach(function (row, r) {
      if (r < BOSS_ROW && (row.length < 2 || row.length > 4)) out.push('row ' + r + ' has ' + row.length + ' nodes');
      if (r === BOSS_ROW && row.length !== 1) out.push('boss row must have one node');
      let shops = 0, fights = 0;
      row.forEach(function (id, c) {
        const n = nodes[id];
        if (!n) { out.push('missing node ' + id); return; }
        if (n.row !== r || n.col !== c) out.push(id + ' row/col mismatch');
        if (!TYPES[n.type]) out.push(id + ' has unknown type ' + n.type);
        if (r === 0 && n.type !== 'combat') out.push(id + ': row 0 must be combat');
        if (r === TAVERN_ROW && n.type !== 'tavern') out.push(id + ': row 6 must be tavern');
        if (r === BOSS_ROW && n.type !== 'boss') out.push(id + ': last row must be the boss');
        if (r < BOSS_ROW && n.type === 'boss') out.push(id + ': boss outside the boss row');
        if (n.type === 'elite' && r < ELITE_MIN_ROW) out.push(id + ': elite before row 2');
        if (n.type === 'shop') shops++;
        if (isFight(n.type)) fights++;
        if (r < BOSS_ROW && !n.links.length) out.push(id + ' leads nowhere');
        n.links.forEach(function (l) { if (!nodes[l] || nodes[l].row !== r + 1) out.push(id + ' links outside the next row: ' + l); });
      });
      if (shops > 1) out.push('row ' + r + ' has ' + shops + ' shops');
      if (r > 0 && r < TAVERN_ROW && !fights) out.push('row ' + r + ' has no fight');
    });
    // crossings between consecutive rows
    for (let r = 0; r < BOSS_ROW; r++) {
      const edges = [];
      map.layout[r].forEach(function (id) {
        (nodes[id] ? nodes[id].links : []).forEach(function (l) { if (nodes[l]) edges.push([nodes[id].col, nodes[l].col]); });
      });
      for (let i = 0; i < edges.length; i++) {
        for (let j = i + 1; j < edges.length; j++) {
          const a = edges[i], b = edges[j];
          if ((a[0] - b[0]) * (a[1] - b[1]) < 0) out.push('crossing links on row ' + r + ': ' + a + ' / ' + b);
        }
      }
    }
    // reachability both ways
    const fwd = {};
    const stack = (map.start || []).slice();
    while (stack.length) {
      const id = stack.pop();
      if (fwd[id] || !nodes[id]) continue;
      fwd[id] = true;
      nodes[id].links.forEach(function (l) { stack.push(l); });
    }
    const parents = parentMap(nodes);
    const back = {};
    const st2 = [map.boss];
    while (st2.length) {
      const id = st2.pop();
      if (back[id] || !nodes[id]) continue;
      back[id] = true;
      (parents[id] || []).forEach(function (p) { st2.push(p); });
    }
    Object.keys(nodes).forEach(function (id) {
      if (!fwd[id]) out.push(id + ' is unreachable');
      if (!back[id]) out.push(id + ' does not lead to the boss');
    });
    if ((map.start || []).join() !== (map.layout[0] || []).join()) out.push('start must be the row-0 nodes');
    return out;
  }

  function parents(map, id) { return parentMap(map.nodes)[id] || []; }

  DD.RunMap = {
    ROWS: ROWS,
    BOSS_ROW: BOSS_ROW,
    TAVERN_ROW: TAVERN_ROW,
    TYPES: TYPES,
    WEIGHTS: WEIGHTS,
    generate: generate,
    validate: validate,
    parents: parents,
    isFight: isFight,
    pickEncounter: pickEncounter,
    pickEvent: pickEvent,
    eventAvailable: eventAvailable,
    /** Display info for a node: { icon, name, desc } (boss/elite names come from the assigned encounter). */
    nodeInfo: function (node) {
      if (!node) return null;
      const t = TYPES[node.type] || TYPES.combat;
      const enc = node.encounterId ? DD.getEncounter(node.encounterId) : null;
      return { icon: t.icon, name: node.type === 'boss' && enc && enc.name ? enc.name : t.name, desc: t.desc };
    },
  };
})();
