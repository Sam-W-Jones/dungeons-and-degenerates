/* Dungeons and Degenerates — js/ui/combat_hud.js
 * The combat HUD (ARCHITECTURE §8.3): screen id 'combat', DOM panels over the battlefield canvas. v2 (DESIGN §4.1):
 * rolled initiative, one unit at a time, no telegraphs (only boss wind-ups), no Guard.
 *  - top bar: round + whose turn it is, the INITIATIVE TRACKER (portraits in turn order from the acting unit on,
 *    a divider where the next round starts, units joining next round, downed / stunned marks; hover = highlight on
 *    the board, click = inspect), objective (+ MAPGEN's joke subtitle), active rules, incoming reinforcements,
 *    autoplay badge, animation speed and menu buttons; DM narration caption (moves low when it would hide a
 *    wind-up bubble; fades while the pointer is under it) and an idle_dm line after 30 s without input
 *  - deployment: free swaps in the green zone, then a big "Roll for Initiative!" button (or Space): the dice
 *    moment (DD.FXRender.moments.initiative) shows every unit's d20 + modifier, sorts them, then the tracker
 *  - party panel: portraits, live HP / Block (unit.vis), AP pips on the acting turn only, initiative position,
 *    statuses, aura threats; the current hero glows, the others say when they act
 *  - action bar: basic (1) / 4 skill sockets (2-5) / signature (6), consumables (7-0), Interact / Help Up / Smash
 *    (E), Hype meter, threat toggle, Undo Move (Z), End Turn (Space) naming who acts next — no Block preview
 *  - inspect panel (hover or click a unit / tile / tracker portrait): enemies show move, reach (who they can hit
 *    next turn), initiative, abilities (icon, name, range, cooldown, exact desc), resistances, statuses and boss
 *    wind-ups; heroes show initiative, stats, AP banked for their next turn, auras and Blessings
 *  - THREAT SHADING (hold Alt, or T / the 👁 button to toggle): every tile enemies could hit before this hero's
 *    next turn (DD.AI.threatMap) plus the aura threats (threatAt), tinted by damage, lethal tiles hatched
 *  - combat log revealed in step with FX playback, with "Goblin Grunt's turn" headers (empty turns skipped), turn
 *    ribbons for hero turns, contextual hint bar
 * During AI turns the HUD follows the playback (turn markers): tracker, phase pill and board ring show the unit whose
 * animations are playing, and the camera gently keeps it in view (DD.Render.follow).
 * Aura threats are the enemies' non-telegraphed damage, read from hooks.threatAt(enemy, unit, tile, extra).
 * It writes DD.Render.overlay (move tiles, path + hazard warning, targets, AoE, damage previews, deploy / interact
 * tiles, wind-up focus, turnUnitId, threat, reach) and drives DD.Combat. Player input is ignored while DD.FX.busy().
 * When the fight is over and the FX are idle, the result goes to DD.Run.finishCombat (runs) or a result modal with
 * Restart / Title (debug fights). DD.HUD exposes the same actions for tests and debugging.
 */
(function () {
  'use strict';
  const DD = window.DD;
  const U = DD.util;

  const SKILL_KEYS = ['1', '2', '3', '4', '5', '6'];
  const CONS_KEYS = ['7', '8', '9', '0'];
  const GRACE_MS = 380;      // turn-ending input is ignored this long after control returns (double-click guard)
  const BUSY_DIM_MS = 260;   // the action bar only dims for animations longer than this (no flicker)
  const HINT_MS = 2600;      // transient hint messages
  const LOG_MAX = 160;       // log lines kept in the DOM
  const IDLE_MS = 30000;     // the DM gets bored (idle_dm narration) after this long without input in the player phase
  const MINI_AT = 3;         // a hero's summons collapse into one row of mini cards from this many (corgis, ducks)
  const HEADLESS_UA = /HeadlessChrome/.test((window.navigator && navigator.userAgent) || '');
  const IDLE_FALLBACK = ['The DM drums his fingers on the table. Loudly.', 'The DM checks his phone. Then checks it again.'];
  const INPUT_EVENTS = ['mousemove', 'mousedown', 'keydown', 'wheel'];
  const SPEEDS = [1, 1.5, 2, 3];

  const OBJ_ICON = { lever: '🕹️', chest: '🧰', fountain: '⛲', valve: '🔧', mirror: '🪞', brazier: '🔥', keg: '🍺', totem: '🗿', bookshelf: '📚', d20: '🎲', coffin: '⚰️', statue: '🗽' };
  const OBJECTIVE_ICON = { killAll: '⚔️', boss: '👑', survive: '⏳', destroy: '💥', protect: '🛡️', custom: '📜' };
  const EDGE_NAME = { N: 'top-right edge', E: 'bottom-right edge', S: 'bottom-left edge', W: 'top-left edge', zone: 'enemy side' };
  const FILTER_TEXT = {
    enemy: 'an enemy', ally: 'an ally', allyOrSelf: 'an ally (or yourself)', any: 'any unit', notSelf: 'another unit',
    empty: 'an empty tile', emptyOrUnit: 'a tile', downedAlly: 'a downed ally', object: 'an object',
  };
  const END_TURN_TIPS = [
    'Pass the dice to whoever is next.', 'Pass the Cheetos. Your turn is done.', 'Let the monsters do their monologues.',
    'End your turn. The DM has been waiting to use this mini.',
  ];
  const INIT_LINES = [
    'Roll for initiative! The DM rolls behind the screen. It is a 20. It is always a 20.',
    'Everybody roll a d20. No, the d20. The pointy one. The OTHER pointy one.',
    'Initiative! The DM writes the order on a napkin. The napkin is load-bearing.',
    'Dice clatter everywhere. One rolls off the table. The DM rules it a 1.',
  ];
  const ORDINAL = ['1st', '2nd', '3rd'];
  const TRACK_MAX = 16;       // initiative tracker chips shown at most (one full cycle from the acting unit)
  const MOMENT_MS = 2700;     // the initiative dice moment at speed 1 (+ per unit), skippable

  let M = null;           // the mounted HUD instance (null when the combat screen is not shown)
  let cssDone = false;

  // ---- small helpers -------------------------------------------------------------------------------------------------
  function S() { return DD.Combat ? DD.Combat.state : null; }
  function C() { return DD.Combat; }
  function UI() { return DD.UI; }
  function el() { return DD.UI.el.apply(DD.UI, arguments); }
  function esc(s) { return U.escapeHtml(s); }
  function num(v, fb) { v = +v; return isFinite(v) ? v : (fb || 0); }
  function now() { return window.performance && performance.now ? performance.now() : Date.now(); }
  function active(u) { return !!u && !u.dead && !u.downed; }
  function byId(id) { return id == null || !DD.Combat ? null : DD.Combat.byId(id); }
  function fxBusy() { return !!(DD.FX && DD.FX.busy()); }
  function hasSt(u, id) { return !!u && (u.statuses || []).some(function (s) { return s && s.id === id; }); }
  function key(x, y) { return x + ',' + y; }
  function inList(list, p) { return !!p && (list || []).some(function (t) { return t.x === p.x && t.y === p.y; }); }
  function sound(name) { if (DD.UI && DD.UI.sound) DD.UI.sound(name); }
  function defOf(u) { return u ? DD.getHero(u.defId) || DD.getSummon(u.defId) || DD.getEnemy(u.defId) : null; }
  function overlay() { return DD.Render && DD.Render.overlay ? DD.Render.overlay : null; }
  function autoplayOn() { return !!(DD.Main && DD.Main.autoplay); }
  function settings() { return DD.UI && DD.UI.settings ? DD.UI.settings() : {}; }
  function vis(u, k) { return u.vis && u.vis[k] !== undefined ? u.vis[k] : u[k]; }
  function stunned(u) { return hasSt(u, 'stun') || hasSt(u, 'sleep') || hasSt(u, 'frozen'); }
  function call(label, obj, fn, args) { return obj && typeof obj[fn] === 'function' ? DD.safe(label, obj[fn], obj, args || []) : undefined; }
  function later(fn, ms) { return setTimeout(function () { DD.safe('HUD timer', fn); }, Math.max(0, ms || 0)); }
  function plural(n, w, pw) { return U.plural(n, w, pw); }

  /** Per-refresh memo: cleared whenever the HUD re-reads the combat state (M.gen changes). */
  function memo(k, fn) {
    if (!M) return fn();
    if (M.memo.gen !== M.gen) M.memo = { gen: M.gen, v: {} };
    if (!(k in M.memo.v)) M.memo.v[k] = fn();
    return M.memo.v[k];
  }

  function hazardName(id) {
    const d = DD.getSurface(id) || DD.getTerrain(id) || DD.getObject(id);
    return d ? d.name : String(id || 'something nasty');
  }
  function statusIcon(id) { const d = DD.getStatus(id); return d ? d.icon || '' : ''; }

  // ---- combat queries -----------------------------------------------------------------------------------------------
  function selectedUnit() { return M ? byId(M.sel) : null; }

  /** Hero-side units in panel order: each hero followed by its summons, then orphan summons. */
  function partyUnits() {
    const s = S();
    if (!s) return [];
    const side = s.units.filter(function (u) { return u.side === 'hero' && !u.dead && (u.kind === 'hero' || u.kind === 'summon'); });
    const heroes = side.filter(function (u) { return u.kind === 'hero'; });
    const out = [];
    heroes.forEach(function (h) {
      out.push(h);
      side.forEach(function (u) { if (u.kind === 'summon' && u.ownerId === h.id) out.push(u); });
    });
    side.forEach(function (u) { if (out.indexOf(u) < 0) out.push(u); });
    return out;
  }

  /** The player may act with u now (the engine: a hero-side unit of the current turn group, in a hero turn). */
  function controllable(u) { return !!u && !!C() && C().controllable(u); }
  /** Deployment is open: before initiative, phase 'deploy' (round 0), free swaps in the zone. */
  function deploying(s) {
    s = s || S();
    if (!s || s.result || !s.deploy || !s.deploy.active) return false;
    return C() && typeof C().isDeploying === 'function' ? C().isDeploying() : s.phase === 'deploy';
  }
  function deployActive(s, u) { return deploying(s) && (!u || inList(s.deploy.tiles, u)); }
  /** A hero the player can reposition now (deployment, standing in the zone). */
  function deployable(u) { return !!u && u.kind === 'hero' && u.side === 'hero' && active(u) && deployActive(S(), u); }
  /** Selectable: a member of the acting turn group (hero turn) or a hero to deploy. */
  function selectable(u) { return controllable(u) || deployable(u); }
  function currentUnit() { return (C() && typeof C().current === 'function' ? DD.safe('HUD current', C().current, C()) : null) || null; }
  function turnGroup() { return (C() && typeof C().turnGroup === 'function' ? DD.safe('HUD turnGroup', C().turnGroup, C()) : null) || []; }
  function playerSide(u) { return !!u && (C() && typeof C().isPlayerControlled === 'function' ? C().isPlayerControlled(u) : u.side === 'hero'); }
  function isStunnedU(u) { return !!u && (C() && typeof C().isStunned === 'function' ? !!C().isStunned(u) : stunned(u)); }
  function moveCost(u) { return C().moveApCost ? C().moveApCost(u) : 1; }
  function effMov(u) { return C().effectiveMov ? C().effectiveMov(u) : u.mov; }
  function initMod(u) { return Math.round(num(C() && typeof C().initOf === 'function' ? C().initOf(u) : u.init)); }
  function signed(n) { n = Math.round(num(n)); return (n < 0 ? '−' : '+') + Math.abs(n); }
  function ordinal(n) { return n >= 1 && n <= 3 ? ORDINAL[n - 1] : n + 'th'; }
  function isRunFight(s) { return !!(s && s.run && DD.Run && DD.Run.state === s.run && typeof DD.Run.finishCombat === 'function'); }

  /** Why player input is ignored right now (null = accept input; deployment accepts deploy moves and the roll). */
  function lockReason() {
    const s = S();
    if (!M || !s) return 'none';
    if (s.result || s.phase === 'over') return 'over';
    if (fxBusy()) return 'busy';
    if (s.phase !== 'player' && s.phase !== 'deploy') return 'enemy';
    if (autoplayOn()) return 'autoplay';
    if (DD.UI.modalCount && DD.UI.modalCount() > 0) return 'modal';
    return null;
  }
  /** The lock the panels *display*: short own animations don't grey out the bar (no flicker), AI turns do. */
  function shownLock() {
    const l = lockReason();
    if (M && (M.enemyPlayback || M.moment)) return 'enemy';
    return l === 'busy' || l === 'modal' ? null : l;
  }
  function lockText(l) {
    return { enemy: 'Not your turn.', over: 'The fight is over.', autoplay: 'Autoplay is driving.', busy: 'Wait for the animation to finish.', none: 'No fight in progress.' }[l] || 'Not now.';
  }
  /** Picking a hero is harmless during own animations; AI turns, the dice moment, autoplay and the end block it. */
  function canSelectNow() {
    const s = S();
    return !!(M && s && !s.result && !M.enemyPlayback && !M.moment && !autoplayOn());
  }

  // ---- v2 turn state: initiative order, the turn playback has reached ------------------------------------------------
  function snapEntry(e) { return { unitId: e.unitId, total: num(e.total), roll: num(e.roll), init: num(e.init), k: num(e.k), side: e.side, fixed: !!e.fixed }; }
  /** 'turn:start' (logical): remember which FX marker opens that turn and the order at that moment. */
  function noteTurn(e) {
    const s = S();
    if (!M || !s || !e) return;
    M.turns.push({
      fxId: lastFxId(), turn: num(e.turn, s.turn), index: num(e.index, s.turnIndex), round: num(e.round, s.round), unitId: e.unitId || (e.unit && e.unit.id),
      order: (s.order || []).map(snapEntry), joining: (s.joining || []).map(snapEntry),
    });
    if (M.turns.length > 80) M.turns.splice(0, M.turns.length - 80);
  }
  /**
   * The turn whose animations are on screen: the last one whose 'turn' marker playback has reached (all when idle);
   * { pending: true } while turns were recorded but playback has not reached the first one yet (the dice moment).
   */
  function shownTurn() {
    if (!M || !M.turns.length) return null;
    const q = DD.FX ? DD.FX.queue : [];
    const head = q.length ? q[0].id : Infinity;
    for (let i = M.turns.length - 1; i >= 0; i--) if (M.turns[i].fxId < head) return M.turns[i];
    return { pending: true, turn: -1 };
  }
  /** Is the shown turn the engine's live one (nothing of a later turn is waiting to play)? */
  function showingLive(rec) { const s = S(); return !rec || !s || rec.turn === s.turn; }
  /** The unit whose turn the HUD shows: the animated one during AI playback, else the engine's current unit. */
  function shownTurnUnit() {
    const s = S();
    if (!s || s.result || deploying(s) || !s.order || (M && M.moment)) return null;
    const rec = shownTurn();
    if (rec && rec.pending) return null;
    if (showingLive(rec)) return currentUnit();
    const u = byId(rec.unitId);
    return u && !(u.dead && (!u.vis || u.vis.dead)) ? u : null;
  }

  /**
   * The initiative tracker's model: one cycle of turns from the shown one on — the rest of this round, a divider,
   * then next round's turns (units joining next round merged in by their roll) up to the acting unit again.
   * Deployment: everybody, unrolled. → { deploy, round, items: [{ unit, entry, cur, dist, joiner, divider }] }
   */
  function trackerModel() {
    const s = S();
    if (!s) return { items: [] };
    const gone = function (u) { return !u || (u.dead && (!u.vis || u.vis.dead)); };
    if (!s.order) {
      const list = s.units.filter(function (u) { return active(u) && u.kind !== 'summon'; });
      list.sort(function (a, b) { return (a.side === 'hero' ? 0 : 1) - (b.side === 'hero' ? 0 : 1); });
      return { deploy: true, round: 0, items: list.map(function (u, i) { return { unit: u, entry: null, cur: false, dist: i, unrolled: true }; }) };
    }
    let rec = shownTurn();
    const pending = !!(rec && rec.pending);
    // playback has not reached the first turn yet (the dice moment): the order from the top, nobody acting
    if (pending) rec = M.turns[0];
    const live = !pending && showingLive(rec);
    const order = live ? s.order.map(snapEntry) : rec.order;
    const joining = live ? (s.joining || []).map(snapEntry) : rec.joining;
    let idx = pending ? 0 : live ? s.turnIndex : rec.index;
    const round = live ? s.round : rec.round;
    const hasCur = pending ? false : live ? !!s.current : true;
    if (!(idx >= 0)) idx = 0;
    const items = [];
    const push = function (e, extra) {
      const u = byId(e.unitId);
      if (gone(u) || items.length >= TRACK_MAX) return;
      items.push(Object.assign({ unit: u, entry: e, cur: false, dist: items.length }, extra || {}));
    };
    for (let i = idx; i < order.length; i++) push(order[i], { cur: hasCur && i === idx });
    // next round: the order without the fallen, joiners merged in by their roll (fixed modes: at the end)
    const next = order.filter(function (e) { return !gone(byId(e.unitId)) && !(byId(e.unitId) || {}).dead; }).map(function (e) { return Object.assign({}, e); });
    joining.forEach(function (j) {
      const e = Object.assign({}, j, { joiner: true });
      if (s.initMode === 'roll' && !e.fixed) {
        let i = 0;
        while (i < next.length && (next[i].total > e.total || (next[i].total === e.total && next[i].init >= e.init))) i++;
        next.splice(i, 0, e);
      } else next.push(e);
    });
    const curEntry = order[idx];
    let first = true, cycled = false;
    for (let i = 0; i < next.length && items.length < TRACK_MAX; i++) {
      const e = next[i];
      // one full cycle: stop at the acting entry again — but units joining next round are always listed
      if (!e.joiner && curEntry && e.unitId === curEntry.unitId && e.k === curEntry.k) { cycled = true; continue; }
      if (cycled && !e.joiner) continue;
      if (first) { items.push({ divider: true, round: round + 1, dist: items.length }); first = false; }
      push(e, { joiner: !!e.joiner, nextRound: true });
    }
    let d = 0;
    items.forEach(function (it) { if (!it.divider) it.dist = d++; });
    return { deploy: false, round: round, items: items, live: live };
  }
  /** Where u stands in this round's order: { pos (1-based), of, total, roll, init, acted, cur, inTurns, joining }. */
  function initInfo(u) {
    const s = S();
    if (!s || !u || !s.order) return null;
    const owner = C() && typeof C().turnOwner === 'function' ? C().turnOwner(u) : u;
    const id = (owner || u).id;
    const list = s.order.filter(function (e) { const x = byId(e.unitId); return x && !x.dead; });
    // living entries before the current one: the current entry (alive) sits at that index of the list
    const before = list.filter(function (x) { return s.order.indexOf(x) < Math.max(0, s.turnIndex); }).length;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.unitId !== id) continue;
      const cur = s.current === id && s.order.indexOf(e) === s.turnIndex;
      const acted = i < before;
      const inTurns = cur ? 0 : i >= before ? i - before : list.length - before + i;
      return { pos: i + 1, of: list.length, total: num(e.total), roll: num(e.roll), init: num(e.init), acted: acted, cur: cur, inTurns: Math.max(0, inTurns), summonOf: owner && owner !== u ? owner : null, fixed: !!e.fixed };
    }
    const j = (s.joining || []).filter(function (e) { return e.unitId === id; })[0];
    if (j) return { pos: 0, of: list.length, total: num(j.total), roll: num(j.roll), init: num(j.init), joining: true, inTurns: 0 };
    return null;
  }
  function turnWhen(info) {
    if (!info) return '';
    if (info.joining) return 'joins the order next round';
    if (info.cur) return 'acting now';
    if (info.inTurns === 1) return 'acts next';
    return 'acts in ' + info.inTurns + ' turns' + (info.acted ? ' (next round)' : '');
  }

  function reachOf(u) {
    return memo('reach:' + u.id, function () { return call('HUD reachable', C(), 'reachable', [u]) || new Map(); });
  }
  function interactionsOf(u) {
    return memo('ia:' + u.id, function () { return (call('HUD interactions', C(), 'interactions', [u]) || []).filter(Boolean); });
  }
  function consumableList() { return (call('HUD consumables', C(), 'consumables') || []).slice(); }
  function consumableMax(s) {
    const listLen = consumableList().length;
    const max = s && s.run ? num(s.run.maxConsumables, 3) : num(s && s.maxConsumables, 3);
    return Math.max(max, listLen);
  }

  /** The six action positions of a hero (basic, 4 sockets, signature) or a summon's skills. */
  function barSlots(u) {
    if (!u) return [];
    if (u.kind === 'hero') {
      const out = [{ slot: u.basic || null, role: 'basic' }];
      for (let i = 0; i < 4; i++) out.push({ slot: (u.skills || [])[i] || null, role: 'skill', socket: i });
      out.push({ slot: u.signature || null, role: 'signature' });
      return out;
    }
    return (C().slotsOf(u) || []).slice(0, 6).map(function (sl) { return { slot: sl, role: 'skill' }; });
  }

  // ---- v2 dangers: boss wind-ups (the only telegraphs) and enemy reach -----------------------------------------------
  /** Every pending wind-up on the board: [{ unit, intent, tiles, d (DD.AI.describe) }]. */
  function windupList() {
    return memo('windups', function () {
      const list = DD.AI && typeof DD.AI.windups === 'function' ? DD.safe('HUD windups', DD.AI.windups, DD.AI) || [] : [];
      return list.filter(function (w) { return w && w.unit && w.intent; }).map(function (w) {
        return { unit: w.unit, intent: w.intent, tiles: w.tiles || [], d: DD.safe('HUD describe wind-up', DD.AI.describe, DD.AI, [w.unit, w.intent]) || { label: w.label || '?', dmg: num(w.dmg), turnsLeft: num(w.turnsLeft, 1) } };
      });
    });
  }
  /** Wind-ups that land on a tile (and tracking ones aimed at `unit`). */
  function windupsAt(x, y, unit) {
    return windupList().filter(function (w) { return inList(w.tiles, { x: x, y: y }) || (!!unit && w.intent.anchor === 'unit' && w.intent.unitId === unit.id); });
  }
  function windupWhen(d) { const left = num(d.turnsLeft || d.delay, 1); return left > 1 ? 'in ' + left + ' of its turns' : 'at the start of its next turn'; }
  function windupText(w) {
    return w.unit.name + ' — ⏳ ' + (w.d.label || '?') + (w.d.dmg ? ' (' + w.d.dmg + (w.d.uncertain ? '?' : '') + ')' : '') + ', ' + windupWhen(w.d);
  }
  /** One AI unit's reach on its next turn (DD.AI.reachOf: move + damaging skills ready by then): { tiles: Map, best, only }. */
  function reachInfo(u) {
    return memo('reachOf:' + u.id, function () {
      return (DD.AI && typeof DD.AI.reachOf === 'function' ? DD.safe('HUD reachOf', DD.AI.reachOf, DD.AI, [u]) : null) || { tiles: new Map(), best: 0, only: null };
    });
  }
  /** Every AI unit hostile to the party: Map 'x,y' → { dmg (sum), max, from: [unitIds] } before this hero's next turn. */
  function threatMap() {
    return memo('threatMap', function () {
      return (DD.AI && typeof DD.AI.threatMap === 'function' ? DD.safe('HUD threatMap', DD.AI.threatMap, DD.AI, ['hero']) : null) || new Map();
    });
  }
  /** Who could hit tile (x, y) before the hero's next turn: [{ unit, dmg }], biggest first (an estimate). */
  function reachersAt(x, y) {
    const e = threatMap().get(key(x, y));
    if (!e) return [];
    return (e.from || []).map(function (id) {
      const u = byId(id);
      return u ? { unit: u, dmg: num(reachInfo(u).tiles.get(key(x, y))) } : null;
    }).filter(Boolean).sort(function (a, b) { return b.dmg - a.dmg; });
  }
  function reachText(list) {
    return list.slice(0, 3).map(function (r) { return r.unit.name + ' ' + r.dmg; }).join(', ') + (list.length > 3 ? ' +' + (list.length - 3) : '');
  }
  /** The hero the threat shading is computed for: the selected hero-side unit, else the acting one. */
  function threatHero() {
    const u = selectedUnit();
    if (u && u.side === 'hero' && active(u)) return u;
    const c = currentUnit();
    return c && c.side === 'hero' && active(c) ? c : null;
  }
  function threatOn() { return !!(M && (M.threatHold || M.threatSticky)); }
  /**
   * Threat shading data (DESIGN §4.1 v2): every tile enemies could hit before this hero's next turn (their reach)
   * plus the aura threats (threatAt) for that hero → { tiles: [{ x, y, dmg, reach, aura, lethal }], ref, hero }.
   */
  function threatData() {
    return memo('threat', function () {
      const s = S();
      if (!s || !s.grid) return { tiles: [], ref: 20, hero: null };
      const hero = threatHero();
      const byKey = {};
      const tiles = [];
      const get = function (x, y) {
        const k = key(x, y);
        if (!byKey[k]) { byKey[k] = { x: x, y: y, dmg: 0, reach: 0, aura: 0, lethal: false }; tiles.push(byKey[k]); }
        return byKey[k];
      };
      threatMap().forEach(function (v, k) {
        const p = k.split(',');
        const t = get(+p[0], +p[1]);
        t.reach = Math.round(num(v.dmg));
        t.dmg += t.reach;
      });
      if (hero) {
        s.grid.tiles.forEach(function (t) {
          if (!DD.Grid.isWalkable(t.x, t.y, hero)) return;
          const tot = auraTotal(auraThreats(hero, t.x, t.y));
          if (tot > 0) { const e = get(t.x, t.y); e.aura = tot; e.dmg += tot; }
        });
        const pool = num(hero.hp) + num(hero.block);
        tiles.forEach(function (t) { t.lethal = pool > 0 && t.dmg >= pool; });
      }
      return { tiles: tiles.filter(function (t) { return t.dmg > 0; }), ref: hero ? Math.max(8, num(hero.hp)) : 20, hero: hero };
    });
  }

  /**
   * Aura threats (shared definition): damage `unit` would take standing on (x, y) from enemies' NON-telegraphed
   * effects before the next player phase — auras, gazes, end-of-round effects (Dr. Iris's Clinical Gaze,
   * Lich-tenstein's Late Fees). An enemy (def hooks, or a status on it) may define
   * hooks.threatAt(enemy, unit, tile, extra) → number | { dmg, label, ignoreBlock }; it is read with
   * DD.Hooks.fire('threatAt', enemy, enemy, unit, tile), and throws / undefined count as 0.
   * → [{ unit: enemy, dmg, label, pierce (Block does not help) }] with dmg > 0, biggest first.
   */
  function auraThreats(unit, x, y) {
    const s = S();
    if (!s || !unit || !DD.Hooks || typeof DD.Hooks.fire !== 'function') return [];
    return memo('aura:' + unit.id + ':' + key(x, y), function () {
      const out = [];
      const tile = (DD.Grid && DD.Grid.tile(x, y)) || { x: x, y: y };
      s.units.forEach(function (e) {
        if (e === unit || e.side !== 'enemy' || !active(e)) return;
        let r;
        try { r = DD.Hooks.fire('threatAt', e, e, unit, tile); } catch (err) { r = undefined; }
        const obj = r && typeof r === 'object';
        const dmg = Math.round(num(obj ? r.dmg : r));
        if (!(dmg > 0)) return;
        out.push({ unit: e, dmg: dmg, label: obj && r.label ? String(r.label) : e.name, pierce: !!(obj && (r.ignoreBlock || r.pierce)) });
      });
      out.sort(function (a, b) { return b.dmg - a.dmg; });
      return out;
    });
  }
  function auraTotal(list) { return list.reduce(function (a, t) { return a + t.dmg; }, 0); }
  /** True when the auras would drop u (Block soaks the ones that allow it). */
  function auraLethal(list, u) {
    if (!u || !list.length) return false;
    let soft = 0, pierce = 0;
    list.forEach(function (t) { if (t.pierce) pierce += t.dmg; else soft += t.dmg; });
    return Math.max(0, soft - num(u.block)) + pierce >= num(u.hp);
  }
  /** "⚠ Clinical Gaze: 8 next turn" (one aura) or "⚠ 2 auras: 11 next turn"; '' for none. */
  function auraLine(list, u) {
    if (!list.length) return '';
    return '⚠ ' + (list.length === 1 ? list[0].label : list.length + ' auras') + ': ' + auraTotal(list) + ' next turn' + (auraLethal(list, u) ? ' 💀' : '');
  }
  /** One line per aura: "Clinical Gaze (Dr. Iris): 8", "Late Fees interest (Lich-tenstein): 3, ignores Block". */
  function auraDetail(t) { return t.label + (t.label !== t.unit.name ? ' (' + t.unit.name + ')' : '') + ': ' + t.dmg + (t.pierce ? ', ignores Block' : ''); }
  /** Aura threats on a party card: heroes and summons, in the player phase only (the numbers are for the coming
   *  enemy turn). */
  function cardAuras(u, s) {
    if (!s || s.result || s.phase !== 'player' || M.enemyPlayback || !active(u)) return [];
    return auraThreats(u, u.x, u.y);
  }

  /**
   * Who pays a skill's HP cost instead of its user, or null. Sparrow's Blood Price waives her own HP costs when a
   * Bleeding foe stands in reach and that foe pays (js/data/heroes/sparrow.js keeps its donor search private): when
   * the engine's cost (costOf, every modifyCost hook) is 0 but the cost without a donor is not, the payer is the
   * nearest Bleeding foe (most stacks on a tie) that is not invulnerable or charming her. A hero passive may expose
   * `hpPayer(unit, skill, level)` → unit to answer this exactly.
   */
  function hpPayer(u, def, level, cost) {
    if (!u || !def || u.side !== 'hero' || num(cost && cost.hp) > 0) return null;
    const L = DD.skillLevel(def, level || 1);
    const listed = num(DD.resolve(def.hpCost, L, u, 0));
    if (!(listed > 0)) return null;
    const hd = u.kind === 'hero' ? DD.getHero(u.defId) : null;
    const pv = hd && hd.passive;
    if (pv && typeof pv.hpPayer === 'function') return DD.safe('hpPayer of ' + hd.id, pv.hpPayer, pv, [u, def, level || 1]) || null;
    const raw = { unit: u, skill: def, ap: DD.resolve(def.ap, L, u, 1), hp: listed, noDonor: true, spaNoDonor: true };
    DD.Hooks.fire('modifyCost', u, raw);
    if (!(Math.round(num(raw.hp)) > 0)) return null; // something else made it free: nobody pays
    const s = S();
    const charm = (u.statuses || []).filter(function (x) { return x && x.id === 'charmed'; })[0];
    let best = null, bd = 0, bs = 0;
    (s ? s.units : []).forEach(function (o) {
      if (!active(o) || !DD.Grid.hostile(u, o) || hasSt(o, 'invulnerable') || (o.flags && o.flags.invulnerable)) return;
      if (charm && charm.source === o.id) return;
      const st = (o.statuses || []).filter(function (x) { return x && x.id === 'bleed'; })[0];
      if (!st) return;
      const d = DD.Grid.dist(u, o);
      if (!best || d < bd || (d === bd && num(st.stacks) > bs)) { best = o; bd = d; bs = num(st.stacks); }
    });
    return best;
  }

  // ---- armed skill / consumable ----------------------------------------------------------------------------------------
  function armedDef() {
    if (!M || M.mode.kind === 'move') return null;
    if (M.mode.kind === 'skill') { const r = DD.Targeting.resolve(M.mode.slot); return r ? r.def : null; }
    const id = consumableList()[M.mode.index];
    return id ? DD.getConsumable(id) : null;
  }
  function armedRef() { return M.mode.kind === 'skill' ? M.mode.slot : armedDef(); }
  function armedLevel() { return M.mode.kind === 'skill' && M.mode.slot ? M.mode.slot.level || 1 : 1; }
  function armedTargets(u) {
    return memo('tg:' + u.id + ':' + M.mode.kind + ':' + (M.mode.kind === 'skill' ? M.mode.pos : M.mode.index), function () {
      const ref = armedRef();
      return ref ? (DD.safe('HUD valid targets', DD.Targeting.validTargets, DD.Targeting, [u, ref]) || []) : [];
    });
  }
  /** Where the armed skill would land for a hovered/clicked tile: self skills need no aim, dir skills snap. */
  function aimTarget(u, p) {
    const def = armedDef();
    if (!def || !u) return null;
    const tg = def.target || {};
    const list = armedTargets(u);
    if (tg.type === 'self') return list.length ? { x: list[0].x, y: list[0].y } : null;
    if (!p) return null;
    if (inList(list, p)) return { x: p.x, y: p.y };
    if (tg.type === 'dir') {
      const d = U.dirTo(u, p);
      if (!d.x && !d.y) return null;
      const q = { x: u.x + d.x, y: u.y + d.y };
      return inList(list, q) ? q : null;
    }
    return null;
  }
  function previewAt(u, t) {
    const k = 'pv:' + u.id + ':' + M.mode.kind + ':' + (M.mode.kind === 'skill' ? M.mode.pos : M.mode.index) + ':' + key(t.x, t.y);
    return memo(k, function () {
      if (M.mode.kind === 'skill') return DD.safe('HUD preview', C().preview, C(), [u, M.mode.slot, t.x, t.y]);
      const def = armedDef();
      return def ? DD.safe('HUD preview', DD.Targeting.preview, DD.Targeting, [u, def, { x: t.x, y: t.y }]) : null;
    });
  }
  /** Engine preview → renderer badges: dmg counts Block absorbed too (the HP bar splits it), extras as icons. */
  function overlayPreviews(p) {
    const out = {};
    const per = (p && p.perUnit) || {};
    Object.keys(per).forEach(function (id) {
      const e = per[id] || {};
      const parts = [];
      if (e.uncertain) parts.push('?');
      if (e.block > 0) parts.push('+' + e.block + '🛡');
      (e.statuses || []).slice(0, 3).forEach(function (sid) { const ic = statusIcon(sid); if (ic) parts.push(ic); });
      if (e.moved) parts.push('↷');
      out[id] = { dmg: num(e.dmg) + num(e.blocked), heal: num(e.heal), lethal: !!e.lethal, text: parts.join(' ') };
    });
    return out;
  }
  /** One-line summary of a preview for the hint bar (foes hit, KOs, friendly fire, Hype, objects). */
  function previewSummary(u, p) {
    if (!p) return '';
    const per = p.perUnit || {};
    let foes = 0, allies = 0, kos = 0, heals = 0, total = 0;
    Object.keys(per).forEach(function (id) {
      const t = byId(id), e = per[id];
      if (!t || t === u) return;
      const hostile = DD.Grid.hostile(u, t);
      const hurt = num(e.dmg) + num(e.blocked);
      if (hurt > 0) { if (hostile) { foes++; total += hurt; } else allies++; }
      if (e.lethal && hostile) kos++;
      if (e.heal > 0 && !hostile) heals++;
    });
    const parts = [];
    if (foes) parts.push('Hits ' + plural(foes, 'foe') + ' for ' + total + (p.uncertain ? '?' : ''));
    if (kos) parts.push('💀 ' + kos + ' KO');
    if (heals) parts.push('💚 heals ' + plural(heals, 'ally', 'allies'));
    if (allies) parts.push('⚠ hits ' + plural(allies, 'ally', 'allies') + '!');
    if (p.hype > 0) parts.push('+' + p.hype + ' Hype');
    (p.objects || []).slice(0, 2).forEach(function (o) {
      const d = DD.getObject(o.id);
      if (o.destroyed) parts.push('💥 ' + (d ? d.name : o.id));
    });
    (p.spawned || []).slice(0, 2).forEach(function (sp) { parts.push('✨ ' + sp.name); });
    const self = per[u.id];
    if (self && self.dmg > 0) parts.push('costs you ' + self.dmg + ' HP');
    return parts.join(' · ');
  }
  function invalidReason(u, p) {
    const def = armedDef();
    if (!def || !u) return 'Not a valid target.';
    const tg = def.target || {};
    if (tg.type === 'dir') return 'Aim at a tile next to ' + u.name + '.';
    if (tg.type === 'self') return 'This one only targets ' + u.name + '.';
    const r = DD.safe('HUD range', DD.Targeting.range, DD.Targeting, [u, def, armedLevel()]) || [0, 0];
    const d = Math.abs(p.x - u.x) + Math.abs(p.y - u.y);
    if (d < r[0] || d > r[1]) return 'Out of range (' + (r[0] === r[1] ? r[1] : r[0] + '–' + r[1]) + ' tiles).';
    if (tg.straight && p.x !== u.x && p.y !== u.y) return 'Straight lines only.';
    if (tg.los !== false && d > 0 && !DD.Grid.los(u, p)) return 'No line of sight. Something is in the way.';
    return 'Needs ' + (FILTER_TEXT[tg.filter] || FILTER_TEXT[tg.type === 'unit' ? 'enemy' : 'any']) + '.';
  }
  function targetInstruction(def, u) {
    const tg = def.target || {};
    if (tg.type === 'self') return 'Click ' + u.name + ' (or press the key again) to use it';
    if (tg.type === 'dir') return 'Aim with the mouse and click a direction';
    const r = DD.safe('HUD range', DD.Targeting.range, DD.Targeting, [u, def, armedLevel()]) || [1, 1];
    const rt = r[1] <= 1 ? 'adjacent' : 'range ' + (r[0] === r[1] ? r[1] : r[0] + '–' + r[1]);
    const what = tg.type === 'tile' ? (FILTER_TEXT[tg.filter] && tg.filter !== 'any' ? FILTER_TEXT[tg.filter] : 'a tile') : (FILTER_TEXT[tg.filter || 'enemy'] || 'a target');
    return 'Click ' + what + ' (' + rt + ')';
  }

  // ---- css --------------------------------------------------------------------------------------------------------------
  const CSS = `
.screen-combat { --hl: 14.6rem; --hg: .5rem; font-variant-numeric: tabular-nums; }
.screen-combat .hud-hidden { display: none !important; }
.hud-top { position: absolute; top: var(--hg); left: var(--hg); right: var(--hg); display: flex; align-items: flex-start; gap: var(--hg); pointer-events: none; z-index: 4; }
.hud-round { width: var(--hl); flex: 0 0 auto; display: flex; align-items: center; gap: .65rem; padding: .38rem .7rem .38rem .75rem; min-height: 3.05rem; }
.hud-round .hr-box { display: flex; flex-direction: column; align-items: center; line-height: 1; padding-right: .65rem; border-right: 1px solid rgba(198,156,75,.3); }
.hud-round .hr-label { font-size: .56rem; letter-spacing: .16em; text-transform: uppercase; color: var(--text-3); }
.hud-round .hr-num { font-family: var(--f-display); font-weight: 900; font-size: 1.55rem; color: var(--gold-3); text-shadow: 0 2px 0 rgba(0,0,0,.6); }
.hud-round .hr-right { display: flex; flex-direction: column; align-items: flex-start; gap: .22rem; min-width: 0; }
.hud-round .hr-sub { font-size: .66rem; color: var(--text-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 9.4rem; }
.hud-round .hr-right .hud-phase { align-self: flex-start; }
.hud-phase { display: inline-flex; align-items: center; gap: .35em; padding: .1em .6em; border-radius: 999px; font-family: var(--f-display); font-weight: 800; font-size: .7rem; letter-spacing: .08em; text-transform: uppercase; white-space: nowrap; border: 1px solid; }
.hud-phase.p-player { color: #dcffd5; background: rgba(60,140,60,.38); border-color: rgba(140,230,130,.65); }
.hud-phase.p-enemy { color: #ffdcd5; background: rgba(160,40,30,.45); border-color: rgba(255,130,110,.65); animation: hud-pulse 1.1s ease-in-out infinite; }
.hud-phase.p-deploy { color: #d8edff; background: rgba(40,90,150,.45); border-color: rgba(120,190,255,.65); }
.hud-phase.p-over { color: #2a180a; background: linear-gradient(180deg,#ffe7a3,#d7a94e); border-color: #fff0bd; }
.hud-phase.p-auto { color: #e9ddff; background: rgba(90,60,160,.45); border-color: rgba(190,160,255,.65); }
.hud-center { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: .35rem; }
.hud-obj { max-width: min(44rem, 100%); display: flex; flex-direction: column; align-items: center; gap: .1rem; padding: .3rem 1.1rem .34rem; text-align: center; }
.hud-obj .ho-main { display: flex; align-items: center; gap: .45rem; font-family: var(--f-display); font-weight: 800; font-size: .95rem; color: var(--gold-4); letter-spacing: .02em; line-height: 1.2; }
.hud-obj .ho-icon { font-size: 1.05rem; }
.hud-obj .ho-flavor { font-size: .76rem; font-style: italic; color: var(--text-2); line-height: 1.25; }
.hud-obj .ho-chips { display: flex; flex-wrap: wrap; justify-content: center; gap: .3rem; margin-top: .18rem; }
.hud-obj .ho-chips:empty { display: none; }
.hud-chip { pointer-events: auto; display: inline-flex; align-items: center; gap: .3em; padding: .06em .55em; border-radius: 999px; font-size: .7rem; font-weight: 700; color: var(--text); background: rgba(0,0,0,.38); border: 1px solid rgba(198,156,75,.45); cursor: help; white-space: nowrap; }
.hud-chip.rule { border-color: rgba(190,150,255,.6); color: #ece2ff; }
.hud-chip.wave { border-color: rgba(255,120,100,.65); color: #ffd6cc; }
.hud-chip.wave.soon { animation: hud-pulse 1s ease-in-out infinite; }
.hud-dm { pointer-events: none; display: flex; align-items: flex-start; gap: .5rem; max-width: min(36rem, 100%); padding: .35rem .8rem .4rem .45rem; border-radius: 10px; background: linear-gradient(180deg, rgba(40,26,16,.92), rgba(22,14,9,.92)); border: 1px solid rgba(230,194,108,.45); box-shadow: 0 6px 16px rgba(0,0,0,.5); color: var(--gold-4); font-style: italic; font-size: .84rem; line-height: 1.35; opacity: 0; transform: translateY(-6px); transition: opacity .35s ease, transform .35s ease; }
.hud-dm.show { opacity: 1; transform: none; }
.hud-dm .dm-badge { width: 1.5rem; height: 1.5rem; font-size: .55rem; margin-top: -.05rem; }
.hud-tr { flex: 0 0 auto; display: flex; gap: .35rem; align-items: flex-start; pointer-events: none; }
.hud-tr .btn { min-height: 2.25rem; }
.hud-tr .hud-speed { min-width: 3.4rem; }

.hud-party { position: absolute; left: var(--hg); top: 4.05rem; width: var(--hl); display: flex; flex-direction: column; gap: .38rem; pointer-events: none; max-height: calc(100% - 4.5rem); overflow-y: auto; overflow-x: visible; padding: .1rem .2rem .3rem 0; scrollbar-width: none; }
.hud-party::-webkit-scrollbar { display: none; }
.hud-card { --hc: #c9a24f; position: relative; pointer-events: auto; display: grid; grid-template-columns: auto minmax(0, 1fr); column-gap: .55rem; row-gap: .2rem; align-items: center; padding: .4rem .55rem .42rem .5rem; border-radius: 10px; cursor: pointer; background: linear-gradient(180deg, rgba(58,38,24,.95), rgba(28,18,11,.96)); border: 1px solid rgba(198,156,75,.35); box-shadow: inset 0 1px 0 rgba(255,230,170,.08), 0 4px 12px rgba(0,0,0,.45); transition: border-color .15s ease, box-shadow .15s ease, transform .12s ease, filter .25s ease; }
.hud-card::before { content: ''; position: absolute; left: -1px; top: .55rem; bottom: .55rem; width: 3px; border-radius: 0 3px 3px 0; background: var(--hc); }
.hud-card:hover { border-color: var(--gold-3); transform: translateX(2px); }
.hud-card.sel { border-color: var(--gold-4); background: linear-gradient(180deg, color-mix(in srgb, var(--hc) 24%, #3a2618), rgba(28,18,11,.97)); box-shadow: 0 0 0 1px var(--gold-3), 0 0 16px color-mix(in srgb, var(--hc) 50%, transparent), 0 4px 12px rgba(0,0,0,.45); }
.hud-card.spent:not(.sel) { filter: saturate(.5) brightness(.8); }
.hud-card.downed { filter: grayscale(.85) brightness(.72); border-color: rgba(255,110,90,.6); }
.hud-card.summon { margin-left: 1.05rem; padding-top: .3rem; padding-bottom: .32rem; }
.hud-card .portrait { grid-row: 1 / span 3; }
.hud-card .portrait { box-shadow: 0 0 0 2px #1a0f08, 0 0 0 3.5px var(--hc), 0 0 0 5px #1a0f08, 0 3px 8px rgba(0,0,0,.5); }
.hc-name { display: flex; align-items: baseline; gap: .35rem; min-width: 0; font-family: var(--f-display); font-weight: 700; font-size: .84rem; color: var(--text); line-height: 1.15; }
.hc-name .hc-n { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hc-lvl { margin-left: auto; flex: 0 0 auto; font-family: var(--f-body); font-size: .66rem; font-weight: 700; color: var(--gold-3); }
.hc-row { display: flex; align-items: center; gap: .4rem; min-width: 0; }
.hc-mov { margin-left: auto; font-size: .68rem; color: var(--text-3); white-space: nowrap; }
.hc-status { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: .25rem; padding-top: .1rem; }
.hc-status:empty { display: none; }
.hc-status .status-chip, .hi-status .status-chip { width: 1.4rem; height: 1.4rem; font-size: .8rem; border-radius: 5px; }
.hc-tag { position: absolute; right: .45rem; top: -.5rem; padding: 0 .42em; border-radius: 4px; font-size: .58rem; font-weight: 800; letter-spacing: .07em; text-transform: uppercase; line-height: 1.6; color: #fff; background: #8f2421; border: 1px solid #ff9d90; box-shadow: 0 2px 4px rgba(0,0,0,.5); }
.hc-tag.stun { background: #6a4a10; border-color: #ffd36a; }
.hc-tag.ready { background: #2d6a33; border-color: #a6ec9f; }
.hud-card .ap-pips { gap: 2px; }
.hud-card .ap-pip { width: .62rem; height: .62rem; }

.hud-hp { position: relative; flex: 1 1 auto; min-width: 0; height: .95rem; border-radius: 4px; overflow: hidden; background: linear-gradient(180deg,#170c09,#2b1612); border: 1px solid rgba(0,0,0,.85); box-shadow: inset 0 1px 3px rgba(0,0,0,.7); }
.hud-hp.big { height: 1.2rem; }
.hud-hp .hh-fill { position: absolute; left: 0; top: 0; bottom: 0; background: linear-gradient(180deg,#8fe07f,#3f9a43); box-shadow: inset 0 1px 0 rgba(255,255,255,.35); transition: width .25s ease; }
.hud-hp.mid .hh-fill { background: linear-gradient(180deg,#ffd56a,#d08a1d); }
.hud-hp.low .hh-fill { background: linear-gradient(180deg,#ff7b68,#b3261e); }
.hud-hp.foe .hh-fill { background: linear-gradient(180deg,#ff8f78,#b8322a); }
.hud-hp.summon .hh-fill { background: linear-gradient(180deg,#7fe6d2,#2c9c86); }
.hud-hp .hh-block { position: absolute; top: 0; bottom: 0; background: repeating-linear-gradient(90deg, rgba(127,176,255,.96) 0 3px, rgba(178,210,255,.96) 3px 4px); box-shadow: inset 0 1px 0 rgba(255,255,255,.45); transition: left .25s ease, width .25s ease; }
.hud-hp .hh-text { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: .64rem; font-weight: 800; color: #fff; text-shadow: 0 1px 2px #000, 0 0 3px #000; letter-spacing: .02em; }
.hud-hp.big .hh-text { font-size: .74rem; }

.hud-bottom { position: absolute; left: calc(var(--hl) + var(--hg) * 2); right: var(--hg); bottom: var(--hg); display: flex; align-items: flex-end; justify-content: center; gap: var(--hg); pointer-events: none; z-index: 3; }
.hud-barwrap { position: relative; flex: 0 1 auto; min-width: 0; display: flex; flex-direction: column; align-items: center; margin-right: auto; margin-left: auto; }
.hud-hint { pointer-events: none; max-width: min(46rem, 62vw); margin-bottom: 1.75rem; padding: .32rem .9rem; border-radius: 999px; font-size: .82rem; line-height: 1.3; text-align: center; color: var(--text); background: linear-gradient(180deg, rgba(40,26,16,.94), rgba(22,14,9,.94)); border: 1px solid rgba(198,156,75,.5); box-shadow: 0 6px 16px rgba(0,0,0,.5); }
.hud-hint:empty { display: none; }
.hud-hint b { color: var(--gold-4); }
.hud-hint.warn { border-color: rgba(255,130,100,.8); color: #ffe0d6; }
.hud-hint.bad { border-color: #ff7b68; color: #ffd9cf; animation: hud-shake .3s ease; }
.hud-hint.deploy { border-color: rgba(120,190,255,.75); color: #e2f1ff; }
.hud-hint.target { border-color: var(--gold-3); }
.hud-hint .hh-sum { display: block; font-size: .76rem; color: var(--gold-3); }
.hud-bar { position: relative; display: flex; align-items: flex-end; gap: .4rem; padding: .55rem .6rem .5rem; pointer-events: auto; }
.hud-bar-head { position: absolute; left: .7rem; bottom: 100%; margin-bottom: -.1rem; display: flex; align-items: center; gap: .45rem; padding: .18rem .7rem .22rem; border-radius: 8px 8px 0 0; background: linear-gradient(180deg, var(--wood-3), var(--wood-2)); border: 1px solid var(--gold-1); border-bottom: 0; font-family: var(--f-display); font-weight: 800; font-size: .74rem; color: var(--gold-4); white-space: nowrap; box-shadow: 0 -3px 8px rgba(0,0,0,.35); }
.hud-bar-head .bh-meta { font-family: var(--f-body); font-weight: 600; font-size: .7rem; color: var(--text-2); }
.hud-bar-head .bh-warn { font-family: var(--f-body); font-weight: 700; font-size: .66rem; color: #ffb3a6; text-transform: uppercase; letter-spacing: .06em; }
.hud-group { display: flex; gap: .32rem; align-items: flex-end; }
.hud-sep { width: 1px; align-self: stretch; margin: .3rem .12rem; background: linear-gradient(180deg, transparent, rgba(198,156,75,.5), transparent); }
.hud-skill { position: relative; width: 4.6rem; height: 5.4rem; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; gap: .22rem; padding: .62rem .22rem .3rem; border-radius: 9px; cursor: pointer; pointer-events: auto; color: var(--text); font: inherit; text-align: center; background: linear-gradient(180deg, rgba(78,51,31,.97), rgba(36,23,14,.98)); border: 1px solid rgba(198,156,75,.5); box-shadow: inset 0 1px 0 rgba(255,230,170,.12), 0 3px 8px rgba(0,0,0,.5); transition: transform .1s ease, border-color .15s ease, box-shadow .15s ease, filter .15s ease; outline: none; }
.hud-skill:hover { transform: translateY(-3px); border-color: var(--gold-3); box-shadow: inset 0 1px 0 rgba(255,230,170,.16), 0 0 14px rgba(230,194,108,.35), 0 6px 14px rgba(0,0,0,.5); }
.hud-skill .hs-icon { width: 2.25rem; height: 2.25rem; flex: 0 0 auto; display: flex; align-items: center; justify-content: center; font-size: 1.4rem; line-height: 1; border-radius: 8px; background: radial-gradient(circle at 50% 35%, #6e2f24, #250f0b); border: 1px solid rgba(255,150,120,.55); box-shadow: inset 0 0 8px rgba(0,0,0,.6); }
.hud-skill.kind-spell .hs-icon { background: radial-gradient(circle at 50% 35%, #4a3170, #1a1028); border-color: rgba(190,150,255,.6); }
.hud-skill.kind-heal .hs-icon { background: radial-gradient(circle at 50% 35%, #2f6a3a, #0f2414); border-color: rgba(140,230,150,.6); }
.hud-skill.kind-buff .hs-icon { background: radial-gradient(circle at 50% 35%, #6a5a22, #241e0b); border-color: rgba(255,220,120,.6); }
.hud-skill.kind-summon .hs-icon { background: radial-gradient(circle at 50% 35%, #2c5a6a, #0c1d24); border-color: rgba(120,210,240,.6); }
.hud-skill.kind-move .hs-icon { background: radial-gradient(circle at 50% 35%, #2f4a6e, #0d1626); border-color: rgba(140,180,255,.6); }
.hud-skill.kind-utility .hs-icon { background: radial-gradient(circle at 50% 35%, #4b4b4b, #181818); border-color: rgba(220,220,220,.5); }
.hud-skill .hs-name { font-family: var(--f-display); font-weight: 700; font-size: .6rem; line-height: 1.12; color: var(--gold-4); max-width: 100%; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; word-break: break-word; }
.hud-skill .hs-key { position: absolute; left: .22rem; top: .22rem; font-size: .58rem; min-width: 1.15em; height: 1.2em; }
.hud-skill .hs-ap { position: absolute; right: .2rem; top: .2rem; min-width: 1.1rem; height: 1.1rem; padding: 0 .15rem; border-radius: 999px; display: flex; align-items: center; justify-content: center; font-size: .64rem; font-weight: 900; color: #062433; background: radial-gradient(circle at 35% 30%, #e0f8ff, var(--ap) 60%, #1d6f94); border: 1px solid #c8f1ff; box-shadow: 0 1px 2px rgba(0,0,0,.6); }
.hud-skill .hs-ap.free { color: #06240e; background: radial-gradient(circle at 35% 30%, #eaffe0, #73c96f 60%, #2b6f2c); border-color: #d6ffc8; }
.hud-skill .hs-hp { position: absolute; right: .16rem; top: 1.42rem; font-size: .56rem; font-weight: 800; padding: 0 .25em; border-radius: 4px; color: #fff; background: #9b2a22; border: 1px solid #ff9d90; line-height: 1.35; }
.hud-skill .hs-pips { display: flex; gap: 3px; margin-top: auto; flex: 0 0 auto; }
.hud-skill .hs-pips i { width: 5px; height: 5px; border-radius: 50%; background: rgba(255,255,255,.2); }
.hud-skill .hs-pips i.on { background: var(--gold-3); box-shadow: 0 0 3px rgba(230,194,108,.85); }
.hud-skill .hs-ch { position: absolute; left: .16rem; top: 1.42rem; font-size: .56rem; font-weight: 800; padding: 0 .25em; border-radius: 4px; color: #f1d9ff; background: rgba(110,60,160,.8); border: 1px solid rgba(200,160,255,.6); line-height: 1.35; }
.hud-skill .hs-cd { position: absolute; inset: 0; border-radius: 9px; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; padding-top: .62rem; background: linear-gradient(180deg, rgba(8,5,4,.8) 0%, rgba(8,5,4,.8) 52%, rgba(8,5,4,.38) 100%); }
.hud-skill .hs-cd b { display: flex; align-items: center; justify-content: center; gap: .1em; height: 2.25rem; font-family: var(--f-display); font-weight: 900; font-size: 1.5rem; line-height: 1; color: #fff; text-shadow: 0 2px 4px #000; }
.hud-skill .hs-cd b small { font-size: .9rem; color: var(--gold-3); }
.hud-skill.on-cd .hs-name { opacity: .6; }
.hud-skill.role-basic { border-color: rgba(214,214,224,.55); }
.hud-skill.role-signature { border-color: rgba(255,95,162,.7); background: linear-gradient(0deg, rgba(255,95,162,.42) var(--fill, 0%), rgba(0,0,0,0) var(--fill, 0%)), linear-gradient(180deg, rgba(86,34,58,.97), rgba(40,18,30,.98)); }
.hud-skill.role-signature .hs-name { color: #ffd3e5; }
.hud-skill.role-signature.ready { border-color: #ffe0ee; animation: hud-sig 1.3s ease-in-out infinite; }
.hud-skill.role-signature.ready .hs-icon { animation: hud-wiggle 1.3s ease-in-out infinite; }
.hud-skill.armed { border-color: var(--gold-4); transform: translateY(-5px); box-shadow: 0 0 0 2px var(--gold-3), 0 0 22px rgba(243,211,138,.6), 0 7px 14px rgba(0,0,0,.5); }
.hud-skill.is-disabled { cursor: not-allowed; filter: grayscale(.8) brightness(.6); }
.hud-skill.is-disabled:hover { transform: none; filter: grayscale(.7) brightness(.7); }
.hud-skill.on-cd { filter: grayscale(.45) brightness(.85); }
.hud-skill.empty { cursor: help; background: rgba(0,0,0,.28); border: 1px dashed rgba(198,156,75,.38); box-shadow: none; }
.hud-skill.empty:hover { transform: none; border-color: rgba(198,156,75,.6); }
.hud-skill.empty .hs-icon { background: none; border: 1px dashed rgba(198,156,75,.3); box-shadow: none; color: var(--text-3); font-size: 1rem; }
.hud-skill.empty .hs-name { color: var(--text-3); font-family: var(--f-body); font-weight: 600; }
.hud-skill.act { width: 4.2rem; }
.hud-skill.act .hs-icon { background: radial-gradient(circle at 50% 35%, #5d5122, #201b09); border-color: rgba(255,226,120,.6); }
.hud-skill.act.kind-helpUp .hs-icon { background: radial-gradient(circle at 50% 35%, #2f6a3a, #0f2414); border-color: rgba(140,230,150,.6); }
.hud-skill.act.kind-smash .hs-icon { background: radial-gradient(circle at 50% 35%, #6e3a24, #25130b); }
.hud-cons-col { display: grid; grid-template-columns: repeat(2, auto); gap: .3rem; align-content: end; }
.hud-cons-col.n1, .hud-cons-col.n2 { grid-template-columns: repeat(1, auto); }
.hud-cons { position: relative; width: 2.4rem; height: 2.4rem; display: flex; align-items: center; justify-content: center; font-size: 1.25rem; line-height: 1; border-radius: 8px; cursor: pointer; pointer-events: auto; color: var(--text); font-family: inherit; background: radial-gradient(circle at 50% 35%, #4a3a26, #1b130b); border: 1px solid rgba(198,156,75,.55); box-shadow: inset 0 0 8px rgba(0,0,0,.6), 0 2px 6px rgba(0,0,0,.45); transition: transform .1s ease, border-color .15s ease, box-shadow .15s ease, filter .15s ease; outline: none; padding: 0; }
.hud-cons:hover { transform: translateY(-2px); border-color: var(--gold-3); }
.hud-cons.rare { border-color: rgba(90,169,255,.75); box-shadow: inset 0 0 8px rgba(0,0,0,.6), 0 0 8px rgba(90,169,255,.3); }
.hud-cons .kbd { position: absolute; left: -.3rem; top: -.35rem; font-size: .52rem; min-width: 1.1em; height: 1.15em; }
.hud-cons.empty { cursor: help; background: rgba(0,0,0,.25); border-style: dashed; border-color: rgba(198,156,75,.3); box-shadow: none; }
.hud-cons.empty:hover { transform: none; }
.hud-cons.armed { border-color: var(--gold-4); box-shadow: 0 0 0 2px var(--gold-3), 0 0 16px rgba(243,211,138,.55); transform: translateY(-3px); }
.hud-cons.is-disabled { filter: grayscale(.8) brightness(.62); cursor: not-allowed; }
.hud-end { position: relative; flex: 0 0 auto; display: flex; flex-direction: column; gap: .5rem; padding: .55rem .65rem .6rem; pointer-events: auto; min-width: 14rem; }
.hud-hype { display: flex; align-items: center; gap: .5rem; cursor: help; }
.hud-hype .hy-label { flex: 0 0 auto; font-family: var(--f-display); font-weight: 900; font-size: .7rem; letter-spacing: .12em; color: var(--hype); text-shadow: 0 0 8px rgba(255,95,162,.4); }
.hud-hype .hud-hype-m { flex: 1 1 auto; min-width: 0; }
.hud-hype .meter { width: 100%; height: 1rem; }
.hud-gold { flex: 0 0 auto; display: flex; align-items: center; gap: .2rem; font-weight: 800; font-size: .78rem; color: var(--gold-4); cursor: help; }
.hud-gold .hg-icon { font-size: .8rem; }
.hud-endrow { display: flex; gap: .45rem; align-items: stretch; }
.hud-endrow .btn { min-height: 2.8rem; }
.hud-endrow .hud-undo { flex: 0 0 auto; padding: .3em .7em; flex-direction: column; gap: .1rem; font-size: .68rem; }
.hud-endrow .hud-undo .btn-icon { font-size: 1.1rem; }
.hud-endbtn { flex: 1 1 auto; flex-direction: column; gap: .05rem; padding: .35em .8em; }
.hud-endbtn .btn-label { font-size: .98rem; }
.hud-endbtn .btn-sub { font-size: .68rem; font-weight: 600; }
.hud-endbtn .kbd, .hud-undo .kbd { position: absolute; top: -.5rem; font-size: .54rem; height: 1.25em; box-shadow: 0 1px 3px rgba(0,0,0,.7); background: #1d130d; color: var(--gold-4); }
.hud-endbtn .kbd { right: -.35rem; }
.hud-undo .kbd { left: -.35rem; }
.hud-endbtn.cta { animation: cta-glow 1.4s ease-in-out infinite; }
.screen-combat.hud-busy .hud-bar, .screen-combat.hud-busy .hud-endrow { filter: saturate(.6) brightness(.78); transition: filter .2s ease; }
.screen-combat.hud-locked .hud-skill:not(.empty), .screen-combat.hud-locked .hud-cons:not(.empty) { cursor: wait; }

.hud-inspect { position: absolute; top: 4.05rem; left: calc(var(--hl) + var(--hg) * 2); width: 19.5rem; max-height: calc(100% - 14rem); overflow-x: hidden; overflow-y: auto; scrollbar-width: thin; display: flex; flex-direction: column; gap: .42rem; padding: .6rem .7rem .65rem; pointer-events: auto; z-index: 2; }
.hud-inspect > * { flex: 0 0 auto; }
.hud-inspect.alt { left: auto; right: var(--hg); z-index: 3; }
.hud-inspect.foe { border-color: rgba(255,120,100,.7); }
.hud-inspect.boss { border-color: #ff9a6a; box-shadow: 0 0 22px rgba(255,90,60,.25), var(--shadow-lg); }
.hi-head { display: flex; align-items: center; gap: .6rem; }
.hi-head .portrait { box-shadow: 0 0 0 2px #1a0f08, 0 0 0 3.5px var(--pc2, var(--gold-2)), 0 0 0 5px #1a0f08; }
.hi-titles { min-width: 0; flex: 1 1 auto; }
.hi-name { font-family: var(--f-display); font-weight: 800; font-size: 1rem; color: var(--gold-4); line-height: 1.15; }
.hud-inspect.foe .hi-name { color: #ffb4a0; }
.hud-inspect.boss .hi-name { color: #ff9a6a; }
.hi-sub { font-size: .7rem; color: var(--text-3); text-transform: uppercase; letter-spacing: .05em; }
.hi-order { flex: 0 0 auto; display: flex; flex-direction: column; align-items: center; line-height: 1; padding: .2rem .4rem; border-radius: 7px; background: rgba(120,20,15,.55); border: 1px solid rgba(255,130,110,.6); }
.hi-order b { font-family: var(--f-display); font-size: 1.05rem; color: #fff; }
.hi-order small { font-size: .5rem; letter-spacing: .1em; text-transform: uppercase; color: #ffc9bd; }
.hi-stats { display: flex; flex-wrap: wrap; gap: .3rem; }
.hi-status { display: flex; flex-wrap: wrap; gap: .25rem; }
.hi-status:empty { display: none; }
.hi-sec { font-family: var(--f-display); font-size: .62rem; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; color: var(--gold-2); margin-top: .1rem; }
.hi-intent { display: flex; flex-direction: column; gap: .15rem; padding: .35rem .5rem; border-radius: 8px; background: rgba(120,20,15,.22); border: 1px solid rgba(255,110,90,.4); }
.hi-intent.delayed { background: rgba(140,90,10,.2); border-color: rgba(255,190,90,.45); }
.hi-intent .hii-top { display: flex; align-items: center; gap: .35rem; font-weight: 700; font-size: .84rem; color: #ffe0d8; }
.hi-intent .hii-top .pill { margin-left: auto; }
.hi-intent .hii-text { font-size: .74rem; color: var(--text-2); line-height: 1.35; }
.hi-line { font-size: .78rem; color: var(--text-2); line-height: 1.35; }
.hi-line b { color: var(--gold-4); }
.hi-line.warn { color: #ffc4b8; }
.hi-line.good { color: #b8f0b2; }
.hi-flavor { font-size: .76rem; font-style: italic; color: var(--text-3); line-height: 1.35; border-top: 1px solid rgba(198,156,75,.2); padding-top: .35rem; }

.hud-log { position: absolute; top: 4.05rem; right: var(--hg); width: 17.6rem; display: flex; flex-direction: column; padding: .38rem .45rem .45rem; pointer-events: auto; z-index: 2; }
.hud-log .hl-head { display: flex; align-items: center; gap: .4rem; padding: 0 .2rem; font-family: var(--f-display); font-weight: 800; font-size: .7rem; letter-spacing: .14em; text-transform: uppercase; color: var(--gold-3); cursor: pointer; user-select: none; }
.hud-log .hl-head .hl-toggle { margin-left: auto; font-size: .8rem; color: var(--text-3); transition: transform .2s ease; }
.hud-log.collapsed .hl-toggle { transform: rotate(-90deg); }
.hud-log.collapsed .hl-list { display: none; }
.hud-log .hl-list { max-height: 11.5rem; overflow-y: auto; overflow-x: hidden; margin-top: .3rem; display: flex; flex-direction: column; gap: .14rem; padding: 0 .2rem 0 .15rem; }
.hud-log .hl-round { display: flex; align-items: center; gap: .4rem; margin: .2rem 0 .05rem; font-family: var(--f-display); font-size: .58rem; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; color: var(--text-3); }
.hud-log .hl-round::before, .hud-log .hl-round::after { content: ''; flex: 1 1 auto; height: 1px; background: rgba(198,156,75,.25); }
.hud-log .log-line { font-size: .74rem; line-height: 1.32; animation: hud-rise .25s ease-out both; }
.hud-log .log-line.narrator { display: flex; gap: .35rem; align-items: flex-start; }
.hud-log .log-line .hl-dm { flex: 0 0 auto; font-family: var(--f-display); font-style: normal; font-weight: 900; font-size: .5rem; padding: .08rem .25rem; margin-top: .12rem; border-radius: 3px; color: #2a180a; background: linear-gradient(180deg,#ffe7a3,#d7a94e); }
.hud-log .hl-empty { font-size: .74rem; font-style: italic; color: var(--text-3); padding: .2rem; }

.hud-ribbon { position: absolute; left: 0; right: 0; top: 22%; display: flex; justify-content: center; pointer-events: none; z-index: 5; }
.hud-ribbon .rb-band { position: relative; display: flex; flex-direction: column; align-items: center; gap: .1rem; padding: .45rem 4.5rem .5rem; background: linear-gradient(90deg, transparent, rgba(14,8,6,.86) 18%, rgba(14,8,6,.86) 82%, transparent); animation: hud-ribbon var(--rd, 1.5s) ease both; }
.hud-ribbon .rb-band::before, .hud-ribbon .rb-band::after { content: ''; position: absolute; left: 12%; right: 12%; height: 2px; background: linear-gradient(90deg, transparent, var(--rc, var(--gold-3)), transparent); }
.hud-ribbon .rb-band::before { top: 0; } .hud-ribbon .rb-band::after { bottom: 0; }
.hud-ribbon .rb-title { font-family: var(--f-deco); font-weight: 900; font-size: 1.9rem; letter-spacing: .08em; line-height: 1.05; color: var(--rc, var(--gold-3)); text-shadow: 0 2px 0 rgba(0,0,0,.8), 0 0 18px color-mix(in srgb, var(--rc, #e6c26c) 45%, transparent); }
.hud-ribbon .rb-sub { font-size: .82rem; font-style: italic; color: var(--text-2); }
.hud-ribbon.r-enemy { --rc: #ff8a74; }
.hud-ribbon.r-player { --rc: #f3d38a; }
.hud-ribbon.r-deploy { --rc: #9cd2ff; }
.hud-ribbon.r-victory { --rc: #ffe27a; }
.hud-ribbon.r-victory .rb-title { font-size: 2.8rem; }
.hud-ribbon.r-defeat { --rc: #ff6b5b; }
.hud-ribbon.r-defeat .rb-title { font-size: 2.6rem; }
.hud-ribbon.r-end .rb-band { animation: hud-ribbon-stay .5s ease both; pointer-events: auto; cursor: pointer; }
.hud-ribbon .rb-click { margin-top: .25rem; font-size: .66rem; letter-spacing: .1em; text-transform: uppercase; color: var(--text-3); }

.hud-nofight { position: absolute; left: 50%; top: 45%; transform: translate(-50%, -50%); padding: 1.4rem 1.8rem; display: flex; flex-direction: column; align-items: center; gap: .8rem; text-align: center; pointer-events: auto; }
.hud-nofight h2 { margin: 0; font-family: var(--f-display); color: var(--gold-3); }
.hud-menu { display: flex; flex-direction: column; gap: .8rem; }
.hud-menu .hm-row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
.hud-menu .hm-label { font-family: var(--f-display); font-weight: 700; color: var(--gold-4); }
.hud-menu .hm-desc { font-size: .8rem; color: var(--text-3); }
.hud-menu .hm-controls { display: grid; grid-template-columns: auto 1fr; gap: .25rem .9rem; font-size: .84rem; padding: .6rem .8rem; border-radius: 8px; background: rgba(0,0,0,.25); border: 1px solid rgba(198,156,75,.25); }
.hud-menu .hm-controls .k { font-weight: 700; color: var(--gold-3); white-space: nowrap; }
.hud-result { display: flex; flex-direction: column; gap: .9rem; }
.hud-result .hr-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr)); gap: .5rem; }
.hud-result .hr-stat { display: flex; flex-direction: column; align-items: center; gap: .1rem; padding: .5rem; border-radius: 8px; background: rgba(0,0,0,.28); border: 1px solid rgba(198,156,75,.3); }
.hud-result .hr-stat b { font-family: var(--f-display); font-size: 1.3rem; color: var(--gold-3); }
.hud-result .hr-stat span { font-size: .72rem; text-transform: uppercase; letter-spacing: .08em; color: var(--text-3); }
.tt .tt-why { color: #ffb3a6; font-weight: 700; font-size: .82rem; }
.tt .tt-ok { color: #b8f0b2; font-weight: 700; font-size: .82rem; }
.tt .tt-aura { color: #ffc2a8; font-weight: 700; font-size: .8rem; }

/* aura threats (enemy hooks.threatAt): party cards, inspect panel, move hint */
.hc-threat { grid-column: 1 / -1; display: flex; align-items: center; gap: .3rem; margin-top: .05rem; padding: .06rem .4rem; border-radius: 5px; font-size: .66rem; font-weight: 800; line-height: 1.35; color: #ffe2d6; background: linear-gradient(90deg, rgba(170,50,30,.55), rgba(120,30,20,.25)); border: 1px solid rgba(255,130,100,.55); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hc-threat.lethal { background: linear-gradient(90deg, rgba(200,30,30,.75), rgba(140,20,20,.35)); border-color: #ff8f80; animation: hud-pulse 1.2s ease-in-out infinite; }
.hi-line.aura { color: #ffcfbd; }
.hud-hint.good { border-color: rgba(140,230,130,.7); color: #dcffd5; }

/* skill buttons: party-gold cost, HP cost paid by someone else (Sparrow's Blood Price) */
.hud-skill .hs-gold { position: absolute; right: .16rem; top: 1.42rem; font-size: .56rem; font-weight: 800; padding: 0 .25em; border-radius: 4px; color: #2a1a04; background: linear-gradient(180deg, #ffe7a3, #d9a43a); border: 1px solid #fff0bd; line-height: 1.35; }
.hud-skill .hs-hp ~ .hs-gold { top: 2.42rem; }
.hud-skill .hs-gold.poor { color: #fff; background: #7a2a1a; border-color: #ff9d90; }
.hud-skill .hs-hp.paid { color: #ffd9d4; background: #4a0f1a; border-color: #c7535c; }

/* compact summon rows (Release the Corgis, a pond of ducks): one row of mini cards under the owner */
.hud-minis { pointer-events: auto; margin-left: 1.05rem; display: flex; flex-wrap: wrap; gap: .26rem; padding: .3rem .32rem; border-radius: 9px; background: linear-gradient(180deg, rgba(40,27,17,.92), rgba(22,14,9,.94)); border: 1px solid rgba(198,156,75,.3); box-shadow: 0 3px 10px rgba(0,0,0,.4); }
.hud-minis .hm-count { flex: 0 0 100%; font-size: .6rem; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: var(--text-3); line-height: 1.2; }
.hud-mini { --hc: #46cdb4; position: relative; width: 2.15rem; height: 2.35rem; display: flex; align-items: flex-start; justify-content: center; padding-top: .1rem; border-radius: 6px; cursor: pointer; background: linear-gradient(180deg, rgba(58,38,24,.95), rgba(28,18,11,.96)); border: 1px solid rgba(198,156,75,.35); transition: border-color .15s ease, transform .12s ease, filter .25s ease; }
.hud-mini:hover { border-color: var(--gold-3); transform: translateY(-1px); }
.hud-mini.sel { border-color: var(--gold-4); box-shadow: 0 0 0 1px var(--gold-3), 0 0 10px color-mix(in srgb, var(--hc) 50%, transparent); }
.hud-mini.spent:not(.sel) { filter: saturate(.5) brightness(.8); }
.hud-mini.downed, .hud-mini.stun { filter: grayscale(.85) brightness(.72); }
.hud-mini .portrait { box-shadow: none; }
.hud-mini .hm-hp { position: absolute; left: .18rem; right: .18rem; bottom: .16rem; height: 4px; border-radius: 2px; overflow: hidden; background: #2b1612; box-shadow: 0 0 0 1px rgba(0,0,0,.7); }
.hud-mini .hm-hp i { display: block; height: 100%; width: 100%; background: linear-gradient(180deg,#7fe6d2,#2c9c86); }
.hud-mini .hm-hp.low i { background: linear-gradient(180deg,#ff7b68,#b3261e); }
.hud-mini .hm-ap { position: absolute; right: -.28rem; top: -.3rem; min-width: .82rem; height: .82rem; padding: 0 .12rem; border-radius: 999px; display: flex; align-items: center; justify-content: center; font-size: .5rem; font-weight: 900; color: #062433; background: radial-gradient(circle at 35% 30%, #e0f8ff, var(--ap) 60%, #1d6f94); border: 1px solid #c8f1ff; }
.hud-mini .hm-ap:empty { display: none; }
.hud-mini .hm-warn { position: absolute; left: -.28rem; top: -.3rem; font-size: .62rem; line-height: 1; filter: drop-shadow(0 1px 2px #000); }
.hud-mini .hm-warn:empty { display: none; }
.hud-party.tight { gap: .26rem; }
.hud-party.tight .hud-card { padding-top: .26rem; padding-bottom: .28rem; row-gap: .12rem; }
.hud-party.tight .hud-card .portrait { width: 32px !important; height: 32px !important; }

/* DM caption: under the objective, or low (above the hint) when the top spot would hide wind-up bubbles */
.hud-barwrap > .hud-dm { margin-bottom: .45rem; }
.hud-barwrap > .hud-dm:has(+ .hud-hint:empty) { margin-bottom: 2.1rem; }
.hud-dm.show.peek { opacity: .14; }

/* ---- v2: phase pill, initiative tracker ---------------------------------------------------------------------- */
.hud-phase.p-roll { color: #2a180a; background: linear-gradient(180deg,#ffe7a3,#d7a94e); border-color: #fff0bd; animation: hud-pulse 1s ease-in-out infinite; }
.hud-round .hr-who { display: flex; align-items: center; gap: .3rem; font-size: .7rem; font-weight: 700; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 9.4rem; }
.hud-round .hr-who .hr-pos { font-weight: 600; color: var(--text-3); }
.hud-init { --tk: 2.2rem; --tkc: 2.85rem; pointer-events: auto; display: flex; align-items: center; gap: .4rem; max-width: 100%; padding: .3rem .6rem .34rem .45rem; min-height: 3.2rem; }
.hud-init.n-many { --tk: 1.9rem; --tkc: 2.5rem; gap: .26rem; }
.hud-init.n-crowd { --tk: 1.62rem; --tkc: 2.2rem; gap: .2rem; }
.hud-init .ti-label { flex: 0 0 auto; display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1.05; padding: 0 .4rem 0 .1rem; margin-right: .1rem; border-right: 1px solid rgba(198,156,75,.3); font-family: var(--f-display); font-weight: 800; font-size: .52rem; letter-spacing: .12em; text-transform: uppercase; color: var(--text-3); cursor: help; }
.hud-init .ti-label b { font-size: 1.05rem; letter-spacing: 0; color: var(--gold-3); }
.hud-init .ti-list { display: flex; align-items: center; gap: inherit; min-width: 0; }
.hud-init .ti-empty { font-size: .74rem; font-style: italic; color: var(--text-3); padding: 0 .3rem; }
.tk-chip { --tc: #c9a24f; position: relative; flex: 0 0 auto; width: var(--tk); height: var(--tk); border-radius: 8px; cursor: pointer; background: radial-gradient(circle at 50% 30%, rgba(255,240,210,.14), rgba(0,0,0,.42)); border: 1.5px solid var(--tc); box-shadow: 0 2px 5px rgba(0,0,0,.55); transition: transform .15s ease, opacity .25s ease, filter .25s ease, border-color .15s ease; }
.tk-chip:hover { transform: translateY(-2px); filter: none !important; opacity: 1 !important; }
.tk-chip.foe { --tc: #e2483c; background: radial-gradient(circle at 50% 30%, rgba(255,140,120,.2), rgba(50,6,4,.6)); }
.tk-chip .portrait { position: absolute; inset: 0; width: 100% !important; height: 100% !important; box-shadow: none; border-radius: 7px; background: none; }
.tk-chip .portrait::before, .tk-chip .portrait::after { display: none; }
.tk-chip .tk-tot { position: absolute; right: -.32rem; bottom: -.34rem; min-width: 1.02rem; height: 1.02rem; padding: 0 .16rem; border-radius: 999px; display: flex; align-items: center; justify-content: center; font-size: .58rem; font-weight: 900; line-height: 1; color: #2a180a; background: linear-gradient(180deg,#ffe7a3,#d7a94e); border: 1px solid #fff0bd; box-shadow: 0 1px 3px rgba(0,0,0,.6); z-index: 1; }
.tk-chip.foe .tk-tot { color: #fff; background: linear-gradient(180deg,#ff8a74,#a8261e); border-color: #ffc2b4; }
.tk-chip .tk-mark { position: absolute; left: -.3rem; top: -.36rem; font-size: .72rem; line-height: 1; filter: drop-shadow(0 1px 2px #000); z-index: 1; }
.tk-chip.cur { width: var(--tkc); height: var(--tkc); border-width: 2px; box-shadow: 0 0 0 2px rgba(0,0,0,.65), 0 0 16px color-mix(in srgb, var(--tc) 75%, transparent), 0 3px 8px rgba(0,0,0,.6); }
.tk-chip.cur::after { content: ''; position: absolute; left: 50%; bottom: -.62rem; transform: translateX(-50%); border: .3rem solid transparent; border-bottom-color: var(--tc); filter: drop-shadow(0 1px 1px #000); }
.tk-chip.cur.foe { animation: hud-pulse 1.1s ease-in-out infinite; }
.tk-chip.downed { filter: grayscale(.9) brightness(.6) !important; }
.tk-chip.joiner { border-style: dashed; }
.tk-chip.hl { transform: translateY(-2px); box-shadow: 0 0 0 2px #fff6d0, 0 3px 8px rgba(0,0,0,.6); }
.tk-div { flex: 0 0 auto; align-self: stretch; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: .05rem; padding: 0 .12rem; font-family: var(--f-display); font-weight: 800; font-size: .5rem; letter-spacing: .1em; color: var(--text-3); text-transform: uppercase; }
.tk-div::before, .tk-div::after { content: ''; flex: 1 1 auto; width: 1px; background: linear-gradient(180deg, transparent, rgba(198,156,75,.6), transparent); }
.hud-init.fresh .tk-chip { animation: tk-pop .45s ease-out both; }
@keyframes tk-pop { from { opacity: 0; transform: translateY(-8px) scale(.7); } to { opacity: 1; transform: none; } }

/* ---- v2: party cards say when each hero acts ---------------------------------------------------------------------- */
.hud-card.cur { border-color: var(--gold-3); box-shadow: 0 0 0 1px rgba(243,211,138,.55), 0 0 18px rgba(243,211,138,.28), 0 4px 12px rgba(0,0,0,.45); }
.hud-card.wait:not(.sel):not(.downed) { filter: saturate(.72) brightness(.86); }
.hud-card.wait:hover { filter: none; }
.hc-when { font-size: .66rem; font-weight: 700; color: var(--text-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hc-when.bank { color: #9fe0ff; }
.hc-init { position: absolute; left: .18rem; top: .2rem; min-width: 1.05rem; height: 1.05rem; padding: 0 .16rem; border-radius: 999px; display: flex; align-items: center; justify-content: center; font-size: .56rem; font-weight: 900; color: #2a180a; background: linear-gradient(180deg,#ffe7a3,#d7a94e); border: 1px solid #fff0bd; box-shadow: 0 1px 3px rgba(0,0,0,.6); z-index: 1; pointer-events: none; }
.hc-init:empty { display: none; }
.hud-card.cur .hc-init { background: linear-gradient(180deg,#fff6d0,#f3d38a); box-shadow: 0 0 8px rgba(243,211,138,.8); }

/* ---- v2: deployment roll button, threat toggle --------------------------------------------------------------- */
.hud-rollcta { pointer-events: auto; margin-bottom: .55rem; min-height: 3.1rem; padding: .45em 1.6em; font-size: 1.15rem; animation: cta-glow 1.4s ease-in-out infinite; }
.hud-rollcta .btn-icon { font-size: 1.35rem; }
.hud-rollcta .kbd { margin-left: .5rem; font-size: .62rem; }
.hud-endrow .hud-threat { flex: 0 0 auto; padding: .3em .55em; flex-direction: column; gap: .1rem; font-size: .62rem; }
.hud-endrow .hud-threat .btn-icon { font-size: 1.05rem; }
.hud-endrow .hud-threat.on { border-color: #ffb088; color: #ffd9c4; background: linear-gradient(180deg, rgba(170,60,30,.55), rgba(90,25,12,.65)); box-shadow: 0 0 12px rgba(255,120,70,.45); }
.hud-threat .kbd { position: absolute; top: -.5rem; left: -.35rem; font-size: .54rem; height: 1.25em; box-shadow: 0 1px 3px rgba(0,0,0,.7); background: #1d130d; color: var(--gold-4); }
.hud-endbtn.roll .btn-label { font-size: .9rem; }

/* ---- v2: initiative dice moment --------------------------------------------------------------------------- */
.hud-rollscrim { position: absolute; inset: 0; pointer-events: auto; z-index: 6; cursor: pointer; background: radial-gradient(ellipse at 50% 45%, rgba(8,4,3,.25), rgba(8,4,3,.62)); }
.hud-rolltray { --cw: 5.6rem; position: absolute; left: 50%; top: 46%; transform: translate(-50%, -50%); display: flex; flex-direction: column; align-items: center; gap: .55rem; padding: .9rem 1.3rem 1rem; pointer-events: auto; z-index: 7; cursor: pointer; max-width: calc(100% - 2rem); }
.hud-rolltray .rt-title { font-family: var(--f-deco); font-weight: 900; font-size: 1.85rem; letter-spacing: .05em; line-height: 1.05; color: var(--gold-3); text-shadow: 0 2px 0 rgba(0,0,0,.8), 0 0 18px rgba(230,194,108,.45); white-space: nowrap; }
.hud-rolltray .rt-row { position: relative; height: 8.2rem; width: calc(var(--n) * var(--cw)); max-width: 100%; }
.rt-slot { position: absolute; left: 0; top: .55rem; width: var(--cw); display: flex; justify-content: center; will-change: transform; }
.rt-card { --tc: #c9a24f; position: relative; width: calc(var(--cw) - .45rem); display: flex; flex-direction: column; align-items: center; gap: .16rem; padding: .42rem .2rem .4rem; border-radius: 10px; background: linear-gradient(180deg, rgba(64,42,26,.97), rgba(28,18,11,.98)); border: 1px solid color-mix(in srgb, var(--tc) 60%, transparent); box-shadow: 0 4px 10px rgba(0,0,0,.5); transition: box-shadow .2s ease, border-color .2s ease; }
.rt-card.foe { --tc: #e2483c; background: linear-gradient(180deg, rgba(74,26,20,.97), rgba(30,10,8,.98)); }
.rt-card .portrait { box-shadow: 0 0 0 2px #1a0f08, 0 0 0 3px var(--tc); }
.rt-card .rt-name { max-width: 100%; font-family: var(--f-display); font-weight: 700; font-size: .6rem; line-height: 1.15; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rt-card.foe .rt-name { color: #ffc2b4; }
.rt-card .rt-dice { display: flex; align-items: center; gap: .25rem; height: 2rem; }
.rt-die { width: 1.85rem; height: 1.95rem; display: flex; align-items: center; justify-content: center; font-family: var(--f-display); font-weight: 900; font-size: .88rem; color: #2a180a; background: linear-gradient(160deg, #fff4c9, #e6c26c 55%, #b8862f); clip-path: polygon(50% 0, 95% 25%, 95% 75%, 50% 100%, 5% 75%, 5% 25%); }
.rt-card.foe .rt-die { color: #fff; background: linear-gradient(160deg, #ff9a86, #d2473c 55%, #7a1712); }
.rt-die.landed { filter: drop-shadow(0 0 4px rgba(255,230,160,.8)); }
.rt-die.nat20 { color: #2a180a; background: linear-gradient(160deg, #ffffff, #ffe27a 50%, #ffb52e); filter: drop-shadow(0 0 7px #ffe27a); }
.rt-die.nat1 { color: #ffd9d4; background: linear-gradient(160deg, #6a6a6a, #3a3a3a 55%, #1a1a1a); }
.rt-card .rt-mod { font-size: .72rem; font-weight: 800; color: var(--text-2); opacity: 0; transition: opacity .15s ease; }
.rt-card .rt-total { font-family: var(--f-display); font-weight: 900; font-size: 1.2rem; line-height: 1; color: var(--gold-4); opacity: 0; transition: opacity .15s ease; }
.rt-card.foe .rt-total { color: #ffd2c8; }
.rt-card.math .rt-mod, .rt-card.math .rt-total { opacity: 1; }
.rt-card .rt-nat { position: absolute; top: -.62rem; right: -.2rem; padding: 0 .35em; border-radius: 4px; font-size: .52rem; font-weight: 900; letter-spacing: .05em; color: #2a180a; background: #ffe27a; box-shadow: 0 1px 3px rgba(0,0,0,.6); }
.rt-card .rt-nat.one { color: #fff; background: #8f2421; }
.rt-card .rt-rank { position: absolute; top: -.6rem; left: 50%; transform: translateX(-50%); padding: 0 .45em; border-radius: 999px; font-size: .56rem; font-weight: 900; letter-spacing: .04em; color: #2a180a; background: linear-gradient(180deg,#ffe7a3,#d7a94e); border: 1px solid #fff0bd; opacity: 0; transition: opacity .2s ease; white-space: nowrap; }
.rt-card.ranked .rt-rank { opacity: 1; }
.rt-card.first { border-color: #fff0bd; box-shadow: 0 0 0 1px #fff0bd, 0 0 18px rgba(255,226,122,.55), 0 4px 10px rgba(0,0,0,.5); }
.hud-rolltray .rt-dm { display: flex; align-items: flex-start; gap: .45rem; max-width: 34rem; font-style: italic; font-size: .82rem; line-height: 1.35; color: var(--gold-4); }
.hud-rolltray .rt-dm .dm-badge { width: 1.45rem; height: 1.45rem; font-size: .52rem; flex: 0 0 auto; }
.hud-rolltray .rt-skip { font-size: .6rem; letter-spacing: .12em; text-transform: uppercase; color: var(--text-3); }

/* ---- v2: inspect panel (abilities, reach, initiative) and log turn headers --------------------------------------- */
.hi-order.hero { background: rgba(120,90,20,.5); border-color: rgba(255,215,106,.6); }
.hi-order.hero small { color: #ffe9b0; }
.hi-abil { display: flex; flex-direction: column; gap: .08rem; padding: .26rem .45rem .3rem; border-radius: 7px; background: rgba(0,0,0,.22); border: 1px solid rgba(198,156,75,.22); }
.hi-abil .ha-top { display: flex; align-items: center; gap: .32rem; font-size: .78rem; font-weight: 700; color: var(--text); }
.hi-abil .ha-top b { color: var(--gold-4); }
.hi-abil .ha-meta { margin-left: auto; font-size: .64rem; font-weight: 700; color: var(--text-3); white-space: nowrap; }
.hi-abil .ha-cd { font-size: .62rem; font-weight: 800; padding: 0 .3em; border-radius: 4px; color: #e9ddff; background: rgba(90,60,160,.55); border: 1px solid rgba(190,160,255,.5); }
.hi-abil .ha-desc { font-size: .72rem; line-height: 1.32; color: var(--text-2); }
.hi-abil.off { opacity: .62; }
.hi-intent.windup { background: rgba(140,16,12,.32); border-color: rgba(255,110,90,.7); box-shadow: inset 0 0 12px rgba(255,60,40,.18); }
.hi-line.reach { color: #ffd2c4; }
.hud-log .hl-turn { display: flex; align-items: center; gap: .3rem; margin: .16rem 0 0; font-family: var(--f-display); font-size: .6rem; font-weight: 800; letter-spacing: .06em; color: var(--gold-3); }
.hud-log .hl-turn.foe { color: #ff9a86; }
.hud-log .hl-turn::after { content: ''; flex: 1 1 auto; height: 1px; background: currentColor; opacity: .25; }
.hud-ribbon.r-turn { --rc: #f3d38a; }
.hud-ribbon.r-turn .rb-title { font-size: 1.6rem; }
.hud-ribbon .rb-head { display: flex; align-items: center; gap: .6rem; }
.hud-ribbon .rb-head .portrait { box-shadow: 0 0 0 2px #1a0f08, 0 0 0 3px var(--rc); }
.hud-hint .hh-dim { color: var(--text-3); font-size: .74rem; }
.hud-hint .hh-dim b { color: var(--text-2); }

@keyframes hud-pulse { 0%, 100% { filter: brightness(1); } 50% { filter: brightness(1.35); } }
@keyframes hud-sig { 0%, 100% { box-shadow: 0 0 0 1px rgba(255,95,162,.7), 0 0 10px rgba(255,95,162,.45), 0 3px 8px rgba(0,0,0,.5); } 50% { box-shadow: 0 0 0 2px #ffd3e5, 0 0 26px rgba(255,95,162,.95), 0 3px 8px rgba(0,0,0,.5); } }
@keyframes hud-wiggle { 0%, 100% { transform: rotate(0); } 25% { transform: rotate(-8deg) scale(1.08); } 75% { transform: rotate(8deg) scale(1.08); } }
@keyframes hud-rise { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
@keyframes hud-shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-5px); } 75% { transform: translateX(5px); } }
@keyframes hud-ribbon { 0% { opacity: 0; transform: scaleX(.6); } 14% { opacity: 1; transform: none; } 80% { opacity: 1; } 100% { opacity: 0; transform: translateY(-6px); } }
@keyframes hud-ribbon-stay { from { opacity: 0; transform: scale(.85); } to { opacity: 1; transform: none; } }
@media (max-width: 1180px) {
  .screen-combat { --hl: 13.2rem; }
  .hud-skill { width: 4.25rem; height: 5.2rem; padding-top: .58rem; }
  .hud-skill .hs-icon { width: 2rem; height: 2rem; font-size: 1.22rem; }
  .hud-skill .hs-cd { padding-top: .58rem; }
  .hud-skill .hs-cd b { height: 2rem; }
  .hud-skill .hs-hp, .hud-skill .hs-ch { top: 1.3rem; }
  .hud-skill.act { width: 3.9rem; }
  .hud-end { min-width: 11rem; }
  .hud-log { width: 15.5rem; }
}
@media (max-height: 680px) {
  .hud-log .hl-list { max-height: 7.5rem; }
  .hud-card { padding-top: .3rem; padding-bottom: .3rem; }
}
.static-ui .hud-dm { transition: none; }
`;

  function injectCss() {
    if (cssDone && document.getElementById('dd-hud-css')) return;
    let st = document.getElementById('dd-hud-css');
    if (!st) {
      st = document.createElement('style');
      st.id = 'dd-hud-css';
      document.head.appendChild(st);
    }
    st.textContent = CSS;
    cssDone = true;
  }

  // ---- shared view bits ---------------------------------------------------------------------------------------------
  /** Live HP bar: { el, update(unit) } — reads unit.vis so it follows the damage animations. */
  function hpBar(cls) {
    const fill = el('div.hh-fill'), block = el('div.hh-block'), text = el('div.hh-text');
    const bar = el('div.hud-hp' + (cls ? '.' + cls : ''), null, fill, block, text);
    let last = '';
    return {
      el: bar,
      update: function (u) {
        const max = Math.max(1, num(u.maxHp, 1));
        const downed = !!vis(u, 'downed');
        const hp = downed ? 0 : U.clamp(Math.round(num(vis(u, 'hp'))), 0, max);
        const blk = Math.max(0, Math.round(num(vis(u, 'block'))));
        const sig = hp + '/' + max + '/' + blk + '/' + downed;
        if (sig === last) return;
        last = sig;
        const f = hp / max;
        fill.style.width = (f * 100).toFixed(1) + '%';
        bar.classList.toggle('mid', f <= 0.6 && f > 0.3);
        bar.classList.toggle('low', f <= 0.3);
        if (blk > 0) {
          const bw = Math.max(4, Math.min(100, blk / max * 100));
          block.style.display = '';
          block.style.width = bw.toFixed(1) + '%';
          block.style.left = Math.max(0, Math.min(f * 100, 100 - bw)).toFixed(1) + '%';
        } else block.style.display = 'none';
        text.textContent = downed ? 'DOWNED' : hp + ' / ' + max + (blk > 0 ? '  🛡' + blk : '');
      },
    };
  }

  function statusChips(u) {
    return (u.statuses || []).filter(function (s) { return s && s.id; }).map(function (st) { return DD.UI.statusChip(st); });
  }
  function statusSig(u) { return (u.statuses || []).map(function (s) { return s.id + ':' + s.stacks + ':' + s.turns; }).join('|'); }

  function apPips(cur, max) {
    max = Math.max(num(max), num(cur));
    const s = el('span.ap-pips');
    for (let i = 1; i <= max; i++) s.appendChild(el('span.ap-pip' + (i <= cur ? '.on' : '')));
    return s;
  }

  /** A hero's rolled Blessings (random passives, unit.passives) for tooltips: one line each with the exact text. */
  function blessingsHtml(u) {
    const list = (u.passives || []).filter(function (p) { return p && p.def; });
    if (!list.length || typeof DD.UI.passiveInfo !== 'function') return '';
    let h = '<div class="tt-bless"><div class="tt-bless-h">🎲 Blessings</div>';
    list.forEach(function (p) {
      const info = DD.UI.passiveInfo({ id: p.id, level: p.level });
      // p.role: a fight-only instance (Method Actor's role), not one of the hero's 4 slots
      h += '<div class="tt-bless-row" style="--rc:' + esc(info.color) + '"><b>' + esc(info.icon + ' ' + info.name + (info.maxLevel > 1 ? ' ' + U.roman(info.level) : '')) + ':</b> ' +
        (p.role ? '<span class="tt-role">🎭 this fight only</span> ' : '') + esc(info.desc) + '</div>';
    });
    return h + '</div>';
  }

  /** Rich tooltip for any combat unit (party cards, inspect portrait). */
  function unitTooltipHtml(u) {
    const d = defOf(u) || {};
    const color = d.color || (u.side === 'enemy' ? '#ff8a74' : '#c9a24f');
    let h = '<div class="tt tt-hero" style="--hc:' + esc(color) + '">';
    h += '<div class="tt-head"><div class="tt-titles"><div class="tt-title">' + esc(u.name) + (d.epithet ? ' <span class="tt-epithet">' + esc(d.epithet) + '</span>' : '') + '</div>';
    let sub = '';
    if (u.kind === 'hero') sub = [d.race, d.cls].filter(Boolean).join(' ') + ' · Level ' + num(u.level, 1);
    else if (u.kind === 'summon') { const o = byId(u.ownerId); sub = 'Summon' + (u.title && u.title !== u.name ? ' · ' + u.title : '') + (o ? ' · ' + o.name + '\'s' : ''); }
    else sub = (d.boss && d.boss.title) || ({ minion: 'Minion', normal: 'Enemy', elite: 'Elite', boss: 'Boss' }[u.tier] || 'Enemy');
    h += '<div class="tt-sub">' + esc(sub) + '</div></div></div>';
    h += '<div class="tt-costs"><span class="pill">❤ ' + Math.max(0, Math.round(u.hp)) + ' / ' + u.maxHp + '</span>';
    if (u.block > 0) h += '<span class="pill">🛡 ' + u.block + ' Block</span>';
    if (u.side === 'hero' && controllable(u)) h += '<span class="pill ap">' + num(u.ap) + ' / ' + num(u.maxAp) + ' AP</span>';
    h += '<span class="pill">👣 ' + effMov(u) + ' Move</span>';
    if (u.armor) h += '<span class="pill">Armor ' + u.armor + '</span>';
    if (u.kind !== 'summon' || !u.ownerId) h += '<span class="pill">🎲 Init ' + signed(initMod(u)) + '</span>';
    h += '</div>';
    const ii = M ? initInfo(u) : null;
    if (ii) h += '<div class="tt-target">🎲 ' + esc((ii.summonOf ? 'Acts on ' + ii.summonOf.name + '\'s turn: ' : '') + (ii.joining ? 'rolled ' + ii.total + ', ' : ii.pos ? '#' + ii.pos + ' of ' + ii.of + (ii.fixed ? '' : ' (rolled ' + ii.total + ')') + ', ' : '') + turnWhen(ii)) + '</div>';
    if (u.side === 'hero' && num(u.apBank)) h += '<div class="tt-target">⚡ ' + esc(signed(u.apBank) + ' AP on ' + (ii && ii.summonOf ? 'that' : 'its') + ' next turn') + '</div>';
    if (u.side === 'hero' && M) {
      const auras = cardAuras(u, S());
      if (auras.length) h += '<div class="tt-aura">' + esc(auraLine(auras, u)) + (auras.length > 1 || auras[0].label !== auras[0].unit.name ? ' — ' + esc(auras.map(auraDetail).join(' · ')) : '') + '. Move out of it before you end the turn.</div>';
    }
    if (u.kind === 'hero' && d.passive) h += '<div class="tt-desc"><b>' + esc(d.passive.name || 'Passive') + ':</b> ' + esc(d.passive.desc || '') + '</div>';
    if (u.kind === 'hero') h += blessingsHtml(u);
    if (u.kind !== 'hero' && d.desc) h += '<div class="tt-flavor">' + esc(d.desc) + '</div>';
    const items = (u.items || []).map(function (id) { const it = DD.getItem(id); return it ? (it.icon || '') + ' ' + it.name : null; }).filter(Boolean);
    if (items.length) h += '<div class="tt-target">🎒 ' + esc(items.join(' · ')) + '</div>';
    const scars = (u.scars || []).map(function (id) { const sc = DD.getScar(id); return sc ? (sc.icon || '🩹') + ' ' + sc.name : null; }).filter(Boolean);
    if (scars.length) h += '<div class="tt-target">' + esc(scars.join(' · ')) + '</div>';
    if (u.downed) h += '<div class="tt-foot">Downed. An adjacent ally can Help Up (2 AP) to revive them at 25% HP.</div>';
    else if (u.side === 'hero') h += '<div class="tt-foot">' + (selectable(u) ? 'Click to select · Tab cycles this turn\'s units' : 'Click to inspect · it acts on its own initiative turn') + '</div>';
    h += '</div>';
    return h;
  }

  // ---- layout -----------------------------------------------------------------------------------------------------
  function buildLayout(root) {
    const E = M.els;
    root.classList.add('hud');
    // top bar
    E.round = el('div.hud-round.panel.slim');
    E.obj = el('div.hud-obj.panel.slim');
    // v2 initiative tracker: portraits in turn order from the acting unit on
    E.trackLabel = el('div.ti-label', null, el('span', null, 'Turn'), E.trackRound = el('b', null, '1'));
    E.trackList = el('div.ti-list');
    E.track = el('div.hud-init.panel.slim', null, E.trackLabel, E.trackList);
    DD.UI.tooltip(E.trackLabel, function () { return trackerHelp(); }, { pos: 'bottom' });
    E.dm = el('div.hud-dm', null, el('span.dm-badge', { title: 'The Dungeon Master' }, 'DM'), E.dmText = el('span.dm-text'));
    E.center = el('div.hud-center', null, E.track, E.obj, E.dm);
    E.speed = DD.UI.button(speedLabel(), cycleSpeed, { cls: 'small ghost hud-speed', tooltip: '<div class="tt"><div class="tt-title">Animation speed</div><div class="tt-desc">Click to cycle 1× / 1.5× / 2× / 3×. Also in Settings. Space skips the enemy turn animations.</div></div>' });
    E.menu = DD.UI.button('Menu', openMenu, { cls: 'small ghost', icon: '☰', tooltip: '<div class="tt"><div class="tt-title">Menu (Esc)</div><div class="tt-desc">Speed, sound, controls, and the dignified exits.</div></div>' });
    E.auto = DD.UI.button('Autoplay', function () { if (DD.Main && DD.Main.stopAutoplay) DD.Main.stopAutoplay(); M.dirty = true; refresh(); }, { cls: 'small hud-hidden', icon: '🤖', tooltip: '<div class="tt"><div class="tt-title">Autoplay is on</div><div class="tt-desc">The DM\'s cousin is playing for you. Click to take the dice back.</div></div>' });
    E.tr = el('div.hud-tr', null, E.auto, E.speed, E.menu);
    E.top = el('div.hud-top', null, E.round, E.center, E.tr);
    // party
    E.party = el('div.hud-party');
    // inspect + log
    E.inspect = el('div.hud-inspect.panel.slim.hud-hidden');
    E.inspect.addEventListener('mouseenter', function () { if (M && M.inspected && M.inspected.unit) { M.focusUi = M.inspected.unit.id; applyFocus(); } });
    E.inspect.addEventListener('mouseleave', function () { if (M) { M.focusUi = null; applyFocus(); } });
    E.logList = el('div.hl-list.scroll');
    E.logHead = el('div.hl-head', null, el('span', null, '📜 Combat Log'), el('span.hl-toggle', null, '▾'));
    E.log = el('div.hud-log.panel.slim', null, E.logHead, E.logList);
    E.logHead.addEventListener('click', function () {
      const c = !E.log.classList.contains('collapsed');
      E.log.classList.toggle('collapsed', c);
      DD.Storage.set('hud', Object.assign({}, DD.Storage.get('hud', {}), { logCollapsed: c }));
      sound('click');
    });
    DD.UI.tooltip(E.logHead, '<div class="tt"><div class="tt-desc">Everything that happened, plus the DM\'s running commentary. Click to fold.</div></div>', { pos: 'left' });
    if ((DD.Storage.get('hud', {}) || {}).logCollapsed) E.log.classList.add('collapsed');
    // bottom: (deployment: the big roll button) + hint + action bar + end cluster
    E.hint = el('div.hud-hint');
    E.rollCta = DD.UI.button('Roll for Initiative!', function () { doRoll(); }, { cls: 'primary hud-rollcta hud-hidden', icon: '🎲', tooltip: function () { return rollTip(); } });
    E.rollCta.appendChild(el('span.kbd', null, 'Space'));
    E.barHead = el('div.hud-bar-head');
    E.bar = el('div.hud-bar.panel.slim', null, E.barHead);
    E.barGroups = el('div.hud-group.hud-bar-groups');
    E.bar.appendChild(E.barGroups);
    E.barWrap = el('div.hud-barwrap', null, E.rollCta, E.hint, E.bar);
    E.hypeMeterBox = el('div.hud-hype-m');
    // [integration fix, hero-zarathor / hero-buga requests] party gold in combat: Drip Check, Bribe, Fines and Grimble's
    // Levy all run on it, and it was only visible outside fights
    E.goldVal = el('span.hg-val', null, '0');
    E.gold = el('span.hud-gold', null, el('span.hg-icon', null, '🪙'), E.goldVal);
    DD.UI.tooltip(E.gold, function () {
      return '<div class="tt"><div class="tt-title">Party gold: ' + num(DD.Act && DD.Act.gold ? DD.Act.gold() : 0) + '</div><div class="tt-desc">Some skills spend it or grow with it (Zarathor\'s Drip Check, Mayor Buga\'s Bribe), and some enemies steal it.</div></div>';
    }, { pos: 'top' });
    E.hype = el('div.hud-hype', null, el('span.hy-label', null, 'HYPE'), E.hypeMeterBox, E.gold);
    DD.UI.tooltip(E.hype, function () {
      const s = S();
      const v = s ? num(s.hype) : 0;
      return '<div class="tt"><div class="tt-title" style="color:var(--hype)">Hype ' + v + ' / 100</div><div class="tt-desc">+8 per kill, +20 per environmental kill (pits, lava, explosions), +4 when one skill hits 2+ foes. At 100 a hero can unleash their Signature (key 6).</div><div class="tt-flavor">The crowd goes mild.</div></div>';
    }, { pos: 'top' });
    E.undo = DD.UI.button('Undo', doUndo, { cls: 'ghost hud-undo', icon: '↶', tooltip: function () { return undoTip(); } });
    E.undo.appendChild(el('span.kbd', null, 'Z'));
    E.threatBtn = DD.UI.button('Threat', function () { setThreatSticky(!M.threatSticky); }, { cls: 'ghost hud-threat', icon: '👁', tooltip: function () { return threatTip(); } });
    E.threatBtn.appendChild(el('span.kbd', null, 'Alt'));
    E.endBtn = DD.UI.button('End Turn', function () { doEndTurn(); }, { cls: 'primary hud-endbtn', sub: 'Next: —', tooltip: function () { return endTurnTip(); } });
    E.endBtn.appendChild(el('span.kbd', null, 'Space'));
    E.endSub = E.endBtn.querySelector('.btn-sub');
    E.endLabel = E.endBtn.querySelector('.btn-label');
    E.end = el('div.hud-end.panel.slim', null, E.hype, el('div.hud-endrow', null, E.threatBtn, E.undo, E.endBtn));
    E.bottom = el('div.hud-bottom', null, E.barWrap, E.end);
    E.ribbon = el('div.hud-ribbon');
    // the initiative dice moment (DD.FXRender.moments.initiative): a scrim + tray, click to skip
    E.rollScrim = el('div.hud-rollscrim.hud-hidden');
    E.rollTray = el('div.hud-rolltray.panel.hud-hidden');
    E.rollScrim.addEventListener('click', function () { skipMoment(); });
    E.rollTray.addEventListener('click', function () { skipMoment(); });
    root.appendChild(E.top);
    root.appendChild(E.party);
    root.appendChild(E.inspect);
    root.appendChild(E.log);
    root.appendChild(E.bottom);
    root.appendChild(E.ribbon);
    root.appendChild(E.rollScrim);
    root.appendChild(E.rollTray);
    // clicking the end-of-fight ribbon skips the short wait before the hand-off
    E.ribbon.addEventListener('click', function () { if (M && M.endSkip) M.endSkip(); });
    // a right-click over a HUD panel cancels targeting / unpins, exactly like one on the board
    root.addEventListener('contextmenu', function (e) { e.preventDefault(); onRightClick(); });
  }

  // ---- top bar ----------------------------------------------------------------------------------------------------
  /** Phase pill + "who acts" line for the round box: follows the playback (the unit being animated). */
  function phaseInfo(s) {
    if (s.result) return { cls: 'p-over', text: s.result === 'victory' ? '🏆 Victory' : '💀 Defeat', who: '' };
    if (M.moment) return { cls: 'p-roll', text: '🎲 Initiative!', who: 'Rolling the d20s…' };
    if (deploying(s)) return { cls: 'p-deploy', text: '⛺ Deployment', who: 'Arrange, then roll' };
    const u = shownTurnUnit();
    const ii = u ? initInfo(u) : null;
    const pos = ii && ii.pos ? ii.pos + '/' + ii.of : '';
    const foeTurn = (u && !playerSide(u)) || (!u && (M.enemyPlayback || s.phase === 'enemy'));
    if (autoplayOn()) return { cls: 'p-auto', text: '🤖 Autoplay', who: u ? u.name : '', pos: pos, unit: u };
    if (foeTurn) return { cls: 'p-enemy', text: '👹 Enemy Turn', who: u ? u.name : 'The monsters', pos: pos, unit: u };
    return { cls: 'p-player', text: '⚔️ Your Turn', who: u ? u.name : '', pos: pos, unit: u };
  }

  function trackerHelp() {
    const s = S();
    return '<div class="tt"><div class="tt-title">🎲 Initiative</div><div class="tt-desc">Everyone rolled d20 + their initiative modifier when the fight began; the order stays fixed. ' +
      'Each unit takes one turn in this order, then a new round starts. The strip starts with whoever is acting now; the divider marks the next round.</div>' +
      '<div class="tt-foot">Hover a portrait to find it on the board · click to inspect it' + (s && s.joining && s.joining.length ? ' · dashed = joins next round' : '') + '</div></div>';
  }

  function waveChips(s) {
    return (s.reinforcements || []).filter(function (w) { return w && !w.done && w.round > s.round; }).slice(0, 3).map(function (w) {
      const left = w.round - s.round;
      const names = (w.enemies || []).map(function (e) {
        const d = DD.getEnemy(e.id);
        const n = Array.isArray(e.n) ? e.n[0] + '–' + e.n[1] : (e.n === undefined ? 1 : e.n);
        return n + '× ' + (d ? d.name : e.id);
      }).join(', ');
      const chip = el('span.hud-chip.wave' + (left <= 1 ? '.soon' : ''), null, '🚩 Reinforcements ' + (left <= 1 ? 'next round' : 'in ' + left + ' rounds'));
      DD.UI.tooltip(chip, '<div class="tt"><div class="tt-title">Reinforcements — round ' + w.round + '</div><div class="tt-desc">' + esc(names || 'More enemies') + (w.edge ? ' from the ' + esc(EDGE_NAME[w.edge] || w.edge) : '') + '.</div><div class="tt-flavor">The DM rolled for random encounters. Again.</div></div>', { pos: 'bottom' });
      return chip;
    });
  }

  function ruleChips(s) {
    return (s.rules || []).filter(Boolean).map(function (r) {
      const chip = el('span.hud-chip.rule', null, (r.icon || '📜') + ' ' + (r.name || 'House Rule'));
      DD.UI.tooltip(chip, function () {
        const turns = num(r.turns, -1);
        return '<div class="tt"><div class="tt-title">' + esc((r.icon || '📜') + ' ' + (r.name || 'House Rule')) + '</div><div class="tt-desc">' + esc(r.desc || 'A rule is in effect.') + '</div><div class="tt-foot">' + (turns > 0 ? esc(plural(turns, 'round')) + ' left' : 'In effect for the whole fight') + '</div></div>';
      }, { pos: 'bottom' });
      return chip;
    });
  }

  /** The round the HUD shows: the playback's (AI turns of the next round may still be animating). */
  function shownRound(s) {
    if (!s.order) return 0;
    const rec = shownTurn();
    return showingLive(rec) ? s.round : rec.round;
  }

  function renderTop() {
    const s = S();
    if (!s) return;
    const ph = phaseInfo(s);
    const ob = s.objective || {};
    const enc = s.encounter || {};
    const round = shownRound(s);
    const sig = [round, ph.cls, ph.text, ph.who, ph.pos, ob.text, ob.flavor, enc.name, s.kind, (s.rules || []).map(function (r) { return r.id + ':' + r.turns; }).join(','),
      (s.reinforcements || []).map(function (w) { return w.round + ':' + w.done; }).join(','), s.round, autoplayOn(), s.difficultyName].join('§');
    M.els.auto.classList.toggle('hud-hidden', !autoplayOn());
    M.els.speed.querySelector('.btn-label').textContent = speedLabel();
    if (sig === M.topSig) return;
    M.topSig = sig;
    const E = M.els;
    E.round.innerHTML = '';
    E.round.appendChild(el('div.hr-box', null, el('span.hr-label', null, 'Round'), el('span.hr-num', null, round > 0 ? String(round) : '–')));
    const kindTxt = s.kind === 'boss' ? 'Boss' : s.kind === 'elite' ? 'Elite' : 'Skirmish';
    const diff = s.difficultyName && s.difficultyName !== 'normal' ? ' · ' + U.capitalize(s.difficultyName) : '';
    const who = ph.who ? el('span.hr-who', null, el('span', null, ph.who), ph.pos ? el('span.hr-pos', null, '#' + ph.pos) : null)
      : el('span.hr-sub', null, (enc.name ? enc.name + ' · ' : '') + kindTxt + diff);
    E.round.appendChild(el('div.hr-right', null, el('span.hud-phase.' + ph.cls, null, ph.text), who));
    DD.UI.tooltip(E.round, function () {
      return '<div class="tt"><div class="tt-title">' + (round > 0 ? 'Round ' + round : 'Deployment') + (enc.name ? ' — ' + esc(enc.name) : '') + '</div>' +
        '<div class="tt-desc">Everyone acts once per round in initiative order (the strip at the top). Enemies act on their own turns without warning: hold <b>Alt</b> to see where they can reach. Only bosses wind up their biggest attacks (⏳ red tiles).</div>' +
        '<div class="tt-foot">' + esc(kindTxt + ' fight' + (s.difficultyName ? ' · ' + U.capitalize(s.difficultyName) + ' difficulty' : '')) + '</div></div>';
    }, { pos: 'bottom' });
    E.obj.innerHTML = '';
    E.obj.appendChild(el('div.ho-main', null, el('span.ho-icon', null, OBJECTIVE_ICON[ob.type] || '🎯'), el('span.ho-text', null, ob.text || 'Win the fight')));
    if (ob.flavor) E.obj.appendChild(el('div.ho-flavor', null, ob.flavor));
    E.obj.appendChild(el('div.ho-chips', null, ruleChips(s), waveChips(s)));
    DD.UI.tooltip(E.obj, function () { return objectiveTip(s); }, { pos: 'bottom' });
  }

  // ---- initiative tracker ------------------------------------------------------------------------------------------
  function chipMark(u) {
    if (u.downed) return '💀';
    if (hasSt(u, 'sheep')) return '🐑';
    if (isStunnedU(u)) return hasSt(u, 'sleep') ? '💤' : hasSt(u, 'frozen') ? '🧊' : '💫';
    if ((u.intents || []).length) return '⏳';
    return '';
  }
  function trackerTip(it) {
    const u = it.unit, e = it.entry;
    const def = defOf(u) || {};
    let h = '<div class="tt"><div class="tt-title">' + esc(u.name) + '</div><div class="tt-sub">' + esc(u.side === 'hero' ? (u.kind === 'hero' ? 'Hero' : 'Summon') : (def.boss && def.boss.title) || ({ minion: 'Minion', normal: 'Enemy', elite: 'Elite', boss: 'Boss' }[u.tier] || 'Enemy')) + '</div>';
    if (e) {
      const math = e.fixed || !(e.roll > 0) ? 'Initiative ' + e.total : 'Initiative ' + e.total + ' (d20 ' + e.roll + ' ' + signed(e.init) + ')';
      h += '<div class="tt-desc">' + esc(math) + '</div>';
    } else h += '<div class="tt-desc">Initiative ' + esc(signed(initMod(u))) + ' — not rolled yet.</div>';
    let when = '';
    if (it.cur) when = 'Acting now.';
    else if (it.joiner) when = 'Arrived mid-round: joins the order next round.';
    else if (e) when = it.dist === 1 ? 'Acts next.' : 'Acts in ' + it.dist + ' turns' + (it.nextRound ? ' (next round).' : '.');
    if (u.downed) when += ' Downed: its turn is skipped until someone helps it up.';
    else if (isStunnedU(u)) when += ' Incapacitated: it loses its next turn.';
    if (when) h += '<div class="tt-target">' + esc(when.trim()) + '</div>';
    if ((u.intents || []).length) h += '<div class="tt-aura">⏳ Winding up ' + esc(u.intents.map(function (i) { return i.label || '?'; }).join(', ')) + '</div>';
    return h + '<div class="tt-foot">Click to inspect</div></div>';
  }

  function renderTracker() {
    const s = S();
    if (!s || !M) return;
    const E = M.els;
    const hideAll = !!M.moment || !!s.result;
    E.track.classList.toggle('hud-hidden', hideAll);
    if (hideAll) return;
    const m = trackerModel();
    const items = m.items || [];
    const sig = [m.deploy, m.round].concat(items.map(function (it) {
      if (it.divider) return '|' + it.round;
      const u = it.unit;
      return u.id + ':' + (it.entry ? it.entry.total + '.' + it.entry.k : '?') + ':' + (it.cur ? 'c' : '') + (it.joiner ? 'j' : '') + chipMark(u) + ':' + it.dist;
    })).join(',');
    if (sig === M.trackSig) return;
    M.trackSig = sig;
    E.trackRound.textContent = m.deploy ? '–' : String(Math.max(1, m.round));
    E.trackLabel.firstChild.textContent = m.deploy ? 'Init' : 'Round';
    E.trackList.innerHTML = '';
    M.chipHl = undefined;
    const n = items.filter(function (it) { return !it.divider; }).length;
    E.track.classList.toggle('n-many', n > 9 && n <= 12);
    E.track.classList.toggle('n-crowd', n > 12);
    if (m.deploy) {
      E.trackList.appendChild(el('span.ti-empty', null, '🎲 not rolled yet'));
    }
    items.forEach(function (it) {
      if (it.divider) {
        const dv = el('div.tk-div', null, el('span', null, 'R' + it.round));
        DD.UI.tooltip(dv, '<div class="tt"><div class="tt-desc">Round ' + it.round + ' starts here: everyone acts again in the same order.</div></div>', { pos: 'bottom' });
        E.trackList.appendChild(dv);
        return;
      }
      const u = it.unit;
      const d = defOf(u) || {};
      const foe = u.side !== 'hero';
      const cls = ['tk-chip', foe ? 'foe' : 'hero'];
      if (it.cur) cls.push('cur');
      if (u.downed) cls.push('downed');
      if (it.joiner) cls.push('joiner');
      const chip = el('div', { class: cls, style: { '--tc': foe ? (u.tier === 'boss' || u.isBoss ? '#ff7a4a' : '#e2483c') : (d.color || '#c9a24f') } });
      chip.dataset.unit = u.id;
      chip.appendChild(DD.UI.portrait(u.defId, 40, { fallback: foe ? '👹' : '🐾' }));
      chip.appendChild(el('span.tk-tot', null, it.unrolled ? '?' : String(it.entry ? it.entry.total : '?')));
      const mark = it.joiner ? '🆕' : chipMark(u);
      if (mark) chip.appendChild(el('span.tk-mark', null, mark));
      // upcoming ones fade with distance (the acting one and the next stay crisp; joiners stay readable: they are news)
      if (!it.cur && !m.deploy) {
        const k = Math.min(1, Math.max(0, it.dist - 1) / 8) * (it.joiner ? 0.5 : 1);
        chip.style.opacity = String((1 - 0.3 * k).toFixed(2));
        chip.style.filter = 'saturate(' + (1 - 0.45 * k).toFixed(2) + ') brightness(' + (1 - 0.22 * k).toFixed(2) + ')';
      }
      chip.addEventListener('mouseenter', function () { if (M) { M.trackHover = u.id; computeOverlay(); renderInspect(); highlightChip(); } });
      chip.addEventListener('mouseleave', function () { if (M && M.trackHover === u.id) { M.trackHover = null; computeOverlay(); renderInspect(); highlightChip(); } });
      chip.addEventListener('click', function () { clickTracker(u); });
      DD.UI.tooltip(chip, function () { return trackerTip(it); }, { pos: 'bottom', delay: 300 });
      E.trackList.appendChild(chip);
    });
    if (M.trackFresh) {
      E.track.classList.add('fresh');
      M.trackFresh = false;
      later(function () { if (M) M.els.track.classList.remove('fresh'); }, 900);
    }
    highlightChip();
  }

  /** Light up the tracker portrait(s) of the unit under the pointer (board, party card or the chip itself). */
  function highlightChip() {
    if (!M) return;
    const id = M.trackHover || M.cardHover || (M.hover && (M.hover.unitId || ((DD.Grid.unitAt(M.hover.x, M.hover.y) || {}).id))) || null;
    if (id === M.chipHl) return;
    M.chipHl = id;
    Array.prototype.forEach.call(M.els.trackList.children, function (c) { if (c.dataset && c.dataset.unit !== undefined) c.classList.toggle('hl', !!id && c.dataset.unit === id); });
  }

  /** Tracker click: select a hero of the acting turn, otherwise pin the inspect panel to that unit. */
  function clickTracker(u) {
    if (!M || !u) return;
    if (selectable(u) && canSelectNow()) { select(u.id, { center: true }); return; }
    M.pinned = M.pinned === u.id ? null : u.id;
    sound('click');
    renderInspect();
    computeOverlay();
  }

  function objectiveTip(s) {
    const ob = s.objective || {};
    const what = {
      killAll: 'Defeat every enemy. Summons don\'t count.',
      boss: 'Take down the boss; the minions flee the moment it drops.',
      survive: 'Keep at least one hero standing until the round counter runs out.',
      destroy: 'Smash the marked objects (adjacent heroes can Smash for 1 AP).',
      protect: 'Keep the protected target intact and defeat every enemy.',
      custom: 'This fight has its own rules. Read the room.',
    }[ob.type] || 'Win the fight.';
    const enc = s.encounter || {};
    return '<div class="tt"><div class="tt-title">' + esc(ob.text || 'Objective') + '</div>' + (enc.name ? '<div class="tt-sub">' + esc(enc.name) + '</div>' : '') +
      '<div class="tt-desc">' + esc(what) + ' If every hero is downed, it\'s a TPK.</div>' + (ob.flavor ? '<div class="tt-flavor">' + esc(ob.flavor) + '</div>' : '') + '</div>';
  }

  function speedLabel() { return (+settings().animSpeed || 1) + '×'; }
  function cycleSpeed() {
    const s = settings();
    const cur = +s.animSpeed || 1;
    let i = SPEEDS.indexOf(cur);
    s.animSpeed = SPEEDS[(i + 1) % SPEEDS.length];
    applySettings();
    M.els.speed.querySelector('.btn-label').textContent = speedLabel();
  }
  function applySettings() {
    if (DD.Main && typeof DD.Main.applySettings === 'function') DD.Main.applySettings();
    else if (DD.FX) DD.FX.speed = +settings().animSpeed || 1;
    if (DD.Meta && typeof DD.Meta.save === 'function') DD.safe('Meta.save', DD.Meta.save, DD.Meta);
  }

  // ---- party panel ------------------------------------------------------------------------------------------------
  function makeCard(u) {
    const d = defOf(u) || {};
    const color = d.color || (u.kind === 'summon' ? '#46cdb4' : '#c9a24f');
    const c = { id: u.id, statusSig: null, apSig: null };
    c.portrait = DD.UI.portrait(u.defId, u.kind === 'summon' ? 30 : 40, { fallback: u.kind === 'summon' ? '🐾' : null });
    c.name = el('span.hc-n', null, u.name);
    c.lvl = el('span.hc-lvl');
    c.hp = hpBar(u.kind === 'summon' ? 'summon' : '');
    c.ap = el('span.hc-ap');
    c.when = el('span.hc-when.hud-hidden');
    c.mov = el('span.hc-mov');
    c.status = el('div.hc-status');
    c.threat = el('div.hc-threat.hud-hidden');
    c.tag = el('span.hc-tag.hud-hidden');
    c.init = el('span.hc-init');
    c.el = el('div.hud-card' + (u.kind === 'summon' ? '.summon' : ''), { style: { '--hc': color } },
      c.portrait, el('div.hc-name', null, c.name, c.lvl), c.hp.el, el('div.hc-row', null, c.ap, c.when, c.mov), c.status, c.threat, c.tag, c.init);
    bindCard(c);
    return c;
  }

  /** Is u acting in the turn the HUD shows (the shown unit, or a summon acting on its turn)? */
  function inShownTurn(u) {
    const t = shownTurnUnit();
    if (!t || !u) return false;
    if (t.id === u.id) return true;
    const o = C() && typeof C().turnOwner === 'function' ? C().turnOwner(u) : null;
    return !!o && o.id === t.id;
  }
  /** Where u's turn sits in the tracker as shown (the playback's view during AI turns): { dist, cur, nextRound }. */
  function shownSlot(u) {
    const o = C() && typeof C().turnOwner === 'function' ? C().turnOwner(u) || u : u;
    const it = (trackerModel().items || []).filter(function (x) { return !x.divider && x.unit && x.unit.id === o.id; })[0];
    return it ? { dist: it.dist, cur: !!it.cur, nextRound: !!it.nextRound } : null;
  }
  /** "Acts in 2" / "Acted · acts in 6" / "+1 AP next turn" for a hero card outside its turn (as the tracker shows it). */
  function waitText(u, s) {
    if (deploying(s)) return { text: '⛺ Deploying', cls: '' };
    const ii = initInfo(u);
    const bank = num(u.apBank);
    if (bank) return { text: '⚡ ' + signed(bank) + ' AP next turn', cls: 'bank' };
    if (!ii) return { text: '', cls: '' };
    if (u.downed) return { text: 'Skipped while down', cls: '' };
    if (M.moment || (shownTurn() || {}).pending) return { text: '🎲 #' + ii.pos + ' in the order', cls: '' };
    const sl = shownSlot(u);
    if (!sl) return { text: 'acts in ' + ii.inTurns, cls: '' };
    if (sl.cur) return { text: '▶ Acting now', cls: '' };
    if (sl.dist === 1) return { text: '⏭ Acts next', cls: '' };
    return { text: (sl.nextRound ? '✓ Acted · ' : '') + 'acts in ' + sl.dist, cls: '' };
  }

  /** Click = select (a unit of the acting turn) or inspect (anyone else), hover = highlight on the board, tooltip =
   *  the unit (party cards and mini cards alike). */
  function bindCard(c) {
    c.el.addEventListener('click', function () {
      const v = byId(c.id);
      if (!v) return;
      if (!canSelectNow()) { lockedFeedback(M.enemyPlayback || M.moment ? 'enemy' : lockReason()); return; }
      if (v.downed) { hint(v.name + ' is down. Move an ally next to them and use Help Up (2 AP).', 'warn'); return; }
      if (!selectable(v)) { notTheirTurn(v); return; }
      select(c.id, { bark: true, center: true });
    });
    c.el.addEventListener('mouseenter', function () { M.cardHover = c.id; computeOverlay(); highlightChip(); });
    c.el.addEventListener('mouseleave', function () { if (M.cardHover === c.id) { M.cardHover = null; computeOverlay(); highlightChip(); } });
    DD.UI.tooltip(c.el, function () { const v = byId(c.id); return v ? unitTooltipHtml(v) : ''; }, { pos: 'right', delay: 350 });
  }

  /** A hero that isn't acting now: pin its inspect panel and say when it acts. */
  function notTheirTurn(v) {
    const s = S();
    const cur = currentUnit();
    const ii = initInfo(v);
    M.pinned = v.id;
    renderInspect();
    if (deploying(s)) { hint('Only heroes standing in the green zone can be redeployed.', 'warn'); return; }
    hint(v.name + ' ' + (ii ? turnWhen(ii) : 'waits for its initiative turn') + (cur && cur !== v ? ' — it\'s ' + cur.name + '\'s turn now.' : '.'), 'warn');
  }

  /** Mini card for a summon in a compact row: portrait, HP sliver, AP count, a stun / downed marker. */
  function makeMini(u) {
    const d = defOf(u) || {};
    const c = { id: u.id, mini: true, sig: null };
    c.fill = el('i');
    c.hpBox = el('span.hm-hp', null, c.fill);
    c.ap = el('span.hm-ap');
    c.warn = el('span.hm-warn');
    c.el = el('div.hud-mini', { style: { '--hc': d.color || '#46cdb4' } }, DD.UI.portrait(u.defId, 26, { fallback: '🐾', frame: false }), c.hpBox, c.ap, c.warn);
    c.hp = {
      update: function (v) {
        const max = Math.max(1, num(v.maxHp, 1));
        const hp = vis(v, 'downed') ? 0 : U.clamp(Math.round(num(vis(v, 'hp'))), 0, max);
        const w = (hp / max * 100).toFixed(1) + '%';
        if (c.fill.style.width !== w) c.fill.style.width = w;
        c.hpBox.classList.toggle('low', hp / max <= 0.3);
      },
    };
    bindCard(c);
    return c;
  }

  function updateMini(c, u, s) {
    const myTurn = controllable(u) && !M.enemyPlayback;
    c.el.classList.toggle('sel', M.sel === u.id);
    c.el.classList.toggle('downed', !!u.downed);
    c.el.classList.toggle('stun', !u.downed && (stunned(u) || hasSt(u, 'sheep')));
    c.el.classList.toggle('spent', myTurn && active(u) && num(u.ap) <= 0);
    c.hp.update(u);
    c.ap.textContent = myTurn && active(u) && num(u.ap) > 0 ? String(num(u.ap)) : '';
    const threat = auraTotal(cardAuras(u, s));
    c.warn.textContent = u.downed ? '💀' : threat > 0 ? '⚠' : (u.statuses || []).some(function (x) { return x && x.id; }) ? '•' : '';
  }

  function updateCard(c, u, s) {
    // v2: AP exists on the acting turn only; the other cards say when they act
    const myTurn = controllable(u) && !M.enemyPlayback && !M.moment;
    const cur = !deploying(s) && inShownTurn(u);
    c.el.classList.toggle('sel', M.sel === u.id);
    c.el.classList.toggle('downed', !!u.downed);
    c.el.classList.toggle('cur', cur && !u.downed);
    c.el.classList.toggle('wait', !cur && !deploying(s) && !!s.order && !s.result);
    c.el.classList.toggle('spent', myTurn && active(u) && num(u.ap) <= 0);
    if (c.name.textContent !== u.name) c.name.textContent = u.name;
    c.lvl.textContent = u.kind === 'hero' ? 'Lv ' + num(u.level, 1) : (u.title && u.title !== u.name ? u.title : '');
    c.hp.update(u);
    const w = myTurn ? { text: '', cls: '' } : waitText(u, s);
    const apSig = num(u.ap) + '/' + num(u.maxAp) + '/' + myTurn + '/' + w.text;
    if (apSig !== c.apSig) {
      c.apSig = apSig;
      c.ap.innerHTML = '';
      if (myTurn || !w.text) c.ap.appendChild(apPips(myTurn ? num(u.ap) : 0, Math.max(num(u.maxAp), myTurn ? num(u.ap) : 0)));
      c.ap.classList.toggle('hud-hidden', !myTurn && !!w.text);
      c.when.textContent = w.text;
      c.when.className = 'hc-when' + (w.cls ? ' ' + w.cls : '') + (myTurn || !w.text ? ' hud-hidden' : '');
    }
    const ii = s.order ? initInfo(u) : null;
    const badge = u.kind === 'hero' && ii && ii.pos ? String(ii.pos) : '';
    if (c.init.textContent !== badge) c.init.textContent = badge;
    c.mov.textContent = '👣 ' + effMov(u);
    const ss = statusSig(u);
    if (ss !== c.statusSig) {
      c.statusSig = ss;
      c.status.innerHTML = '';
      statusChips(u).forEach(function (ch) { c.status.appendChild(ch); });
    }
    let tag = '', tcls = '';
    if (u.downed) { tag = 'Downed'; }
    else if (stunned(u)) { tag = hasSt(u, 'sleep') ? 'Asleep' : hasSt(u, 'frozen') ? 'Frozen' : 'Stunned'; tcls = 'stun'; }
    else if (hasSt(u, 'sheep')) { tag = 'Sheep'; tcls = 'stun'; }
    else if (cur && u.kind === 'hero' && !s.result && playerSide(u)) { tag = 'Your turn'; tcls = 'ready'; }
    c.tag.textContent = tag;
    c.tag.className = 'hc-tag' + (tcls ? ' ' + tcls : '') + (tag ? '' : ' hud-hidden');
    // aura threats: "⚠ Clinical Gaze: 8 next turn"; with the threat shading on, the enemy reach on its tile too
    const auras = cardAuras(u, s);
    let line = auraLine(auras, u);
    let lethal = !!line && auraLethal(auras, u);
    if (threatOn() && active(u) && !s.result) {
      const rs = reachersAt(u.x, u.y);
      if (rs.length) {
        const tot = rs.reduce(function (a, r) { return a + r.dmg; }, 0) + auraTotal(auras);
        line = '⚠ ' + plural(rs.length, 'foe') + ' can reach: up to ' + tot;
        lethal = tot >= num(u.hp) + num(u.block);
        if (lethal) line += ' 💀';
      }
    }
    if (c.threat.textContent !== line) c.threat.textContent = line;
    c.threat.classList.toggle('hud-hidden', !line);
    c.threat.classList.toggle('lethal', !!line && lethal);
  }

  /** The panel group a summon belongs to: its owner when the owner has a card, else the orphans' group. */
  function groupOf(u, ids) { return u.kind === 'summon' && u.ownerId && ids[u.ownerId] ? u.ownerId : 'orphans'; }

  /**
   * Party panel: one card per hero, its summons indented under it. A hero with MINI_AT+ summons (Release the
   * Corgis, a pond of ducks) gets one compact row of mini cards instead; when the panel still overflows its
   * height, every summon group goes compact, then the cards tighten, so nobody hides behind a hidden scrollbar.
   */
  function renderParty() {
    const s = S();
    if (!s) return;
    const list = partyUnits();
    const heroIds = {};
    list.forEach(function (u) { if (u.kind !== 'summon') heroIds[u.id] = true; });
    const count = {};
    list.forEach(function (u) { if (u.kind === 'summon') { const g = groupOf(u, heroIds); count[g] = (count[g] || 0) + 1; } });
    const isMini = function (u) { return u.kind === 'summon' && (M.compactAll || count[groupOf(u, heroIds)] >= MINI_AT); };
    const ids = list.map(function (u) { return u.id; }).join(',');
    if (ids !== M.partyIdsRaw) { M.partyIdsRaw = ids; M.compactAll = false; M.els.party.classList.remove('tight'); }
    const sig = list.map(function (u) { return u.id + (isMini(u) ? 'm' : ''); }).join(',');
    if (sig !== M.partyIds) {
      M.partyIds = sig;
      const keep = {};
      M.els.party.innerHTML = '';
      let row = null, rowGroup = null;
      list.forEach(function (u) {
        const mini = isMini(u);
        const old = M.cards[u.id];
        const c = old && !!old.mini === mini ? old : mini ? makeMini(u) : makeCard(u);
        keep[u.id] = c;
        if (!mini) { row = null; M.els.party.appendChild(c.el); return; }
        const g = groupOf(u, heroIds);
        if (!row || rowGroup !== g) {
          const owner = byId(g);
          row = el('div.hud-minis', null, el('span.hm-count', null, '🐾 ' + (owner ? owner.name + '\'s entourage' : 'Summons') + ' ×' + count[g]));
          rowGroup = g;
          M.els.party.appendChild(row);
        }
        row.appendChild(c.el);
      });
      M.cards = keep;
    }
    list.forEach(function (u) { const c = M.cards[u.id]; if (c.mini) updateMini(c, u, s); else updateCard(c, u, s); });
    // still taller than the panel: everything compact, then tighter cards
    const P = M.els.party;
    if (P.isConnected && P.scrollHeight > P.clientHeight + 2) {
      if (!M.compactAll && list.some(function (u) { return u.kind === 'summon'; })) { M.compactAll = true; renderParty(); return; }
      P.classList.add('tight');
    }
  }

  // ---- action bar -------------------------------------------------------------------------------------------------
  function slotModel(u, item, pos, s, lock) {
    const sl = item.slot;
    if (!sl) return { pos: pos, empty: true, role: item.role, key: SKILL_KEYS[pos] };
    const r = DD.Targeting.resolve(sl);
    if (!r) return { pos: pos, empty: true, missing: sl.id, role: item.role, key: SKILL_KEYS[pos] };
    const def = r.def;
    const cost = DD.safe('HUD costOf', C().costOf, C(), [u, def, r.level]) || { ap: num(def.ap), hp: 0 };
    const ok = lock ? lockText(lock) : DD.safe('HUD canUse', C().canUse, C(), [u, sl]);
    const payer = DD.safe('HUD hpPayer', hpPayer, null, [u, def, r.level, cost]) || null;
    const gold = typeof DD.UI.skillGold === 'function' ? DD.safe('UI.skillGold', DD.UI.skillGold, DD.UI, [def, r.level, u]) : null;
    return {
      pos: pos, role: item.role, key: SKILL_KEYS[pos], slot: sl, def: def, level: r.level, maxLevel: def.maxLevel || (def.levels ? def.levels.length : 1),
      ap: cost.ap, hp: cost.hp, cd: num(sl.cd), charges: num(def.charges), uses: num(sl.uses), hype: num(def.hype),
      payer: payer, listedHp: payer ? num(DD.resolve(def.hpCost, DD.skillLevel(def, r.level), u, 0)) : 0,
      goldCost: gold && gold.cost > 0 ? gold.cost : 0,
      ok: ok === true ? true : String(ok || 'Can\'t use that now.'),
      armed: M.mode.kind === 'skill' && M.mode.pos === pos && M.mode.unitId === u.id,
    };
  }

  function barModel(u, s) {
    const lock = shownLock();
    const m = { unit: u, slots: [], cons: [], acts: [], lock: lock };
    if (!u) return m;
    barSlots(u).forEach(function (item, i) { m.slots.push(slotModel(u, item, i, s, lock)); });
    if (u.kind === 'hero') {
      const list = consumableList();
      const max = consumableMax(s);
      for (let i = 0; i < Math.min(max, CONS_KEYS.length); i++) {
        const id = list[i];
        const d = id ? DD.getConsumable(id) : null;
        const ok = !d ? 'Empty slot.' : lock ? lockText(lock) : DD.safe('HUD canUseConsumable', C().canUseConsumable, C(), [u, i]);
        m.cons.push({ index: i, id: id || null, def: d, key: CONS_KEYS[i], ok: ok === true ? true : String(ok || 'Can\'t use that now.'), armed: M.mode.kind === 'cons' && M.mode.index === i });
      }
    }
    if (controllable(u) && !lock) interactionsOf(u).forEach(function (ia, i) { m.acts.push({ ia: ia, i: i, ok: num(u.ap) >= num(ia.ap, 1) && !stunned(u) && !hasSt(u, 'sheep') }); });
    const gold = num(DD.Act && DD.Act.gold ? DD.Act.gold() : 0);
    m.sig = JSON.stringify([u.id, u.ap, u.maxAp, s.hype, lock, M.mode, statusSig(u), gold, s.turn, s.phase, s.turnIndex, !!M.moment, !!M.enemyPlayback,
      m.slots.map(function (x) { return x.empty ? '-' + (x.missing || '') : [x.slot.id, x.level, x.ap, x.hp, x.cd, x.uses, x.ok, x.armed, x.payer ? x.payer.id : 0, x.goldCost]; }),
      m.cons.map(function (x) { return [x.id, x.ok, x.armed]; }),
      m.acts.map(function (x) { return [x.ia.kind, x.ia.x, x.ia.y, x.ia.label, x.ia.ap, x.ok]; })]);
    return m;
  }

  function skillTip(u, x) {
    let h = '';
    if (x.ok !== true) h += '<div class="tt"><div class="tt-why">⛔ ' + esc(x.ok) + '</div></div>';
    else h += '<div class="tt"><div class="tt-ok">✓ Ready — press ' + esc(x.key) + ' or click, then pick a target</div></div>';
    h += DD.UI.skillTooltipHtml(x.slot.id, x.level, u, {
      slot: x.slot, role: x.role === 'basic' ? 'basic' : x.role === 'signature' ? 'signature' : null, cdLeft: x.cd, showNext: false,
      paidBy: x.payer ? x.payer.name : null, paidWhy: x.payer ? 'Bleeding, ' + (DD.Grid.dist(u, x.payer) <= 1 ? 'adjacent' : DD.Grid.dist(u, x.payer) + ' tiles away') : null,
    });
    if (x.role === 'signature') {
      const s = S();
      h += '<div class="tt"><div class="tt-foot">Hype ' + num(s && s.hype) + ' / 100 — signatures cost all 100.</div></div>';
    }
    return h;
  }

  function buildSkillButton(u, x) {
    if (x.empty) {
      const b = el('button.hud-skill.empty', { type: 'button' }, el('span.kbd.hs-key', null, x.key), el('span.hs-icon', null, x.role === 'signature' ? '✦' : '＋'),
        el('span.hs-name', null, x.missing ? 'Unknown skill' : x.role === 'basic' ? 'No basic attack' : x.role === 'signature' ? 'No signature' : 'Empty socket'));
      DD.UI.tooltip(b, '<div class="tt"><div class="tt-title">' + (x.missing ? 'Missing skill "' + esc(x.missing) + '"' : 'Empty skill socket') + '</div><div class="tt-desc">Heroes socket up to 4 skills. Learn more from level-ups, skill tomes and shops.</div><div class="tt-flavor">Room for one more bad idea.</div></div>');
      return b;
    }
    const def = x.def;
    const cls = ['hud-skill', 'kind-' + (def.kind || 'attack'), 'role-' + x.role];
    if (x.armed) cls.push('armed');
    if (x.ok !== true) cls.push('is-disabled');
    if (x.cd > 0) cls.push('on-cd');
    const s = S();
    if (x.role === 'signature' && num(s.hype) >= x.hype && x.ok === true) cls.push('ready');
    const b = el('button', { type: 'button', class: cls });
    if (x.role === 'signature') b.style.setProperty('--fill', U.clamp(num(s.hype), 0, 100) + '%');
    b.appendChild(el('span.kbd.hs-key', null, x.key));
    b.appendChild(el('span.hs-ap' + (x.ap === 0 ? '.free' : ''), { title: x.ap + ' AP' }, String(x.ap)));
    if (x.hp > 0) b.appendChild(el('span.hs-hp', null, '−' + x.hp + '♥'));
    else if (x.payer) b.appendChild(el('span.hs-hp.paid', { title: 'Paid by ' + x.payer.name }, '🩸' + x.listedHp));
    if (x.goldCost > 0) {
      const poor = num(DD.Act && DD.Act.gold ? DD.Act.gold() : 0) < x.goldCost;
      b.appendChild(el('span.hs-gold' + (poor ? '.poor' : ''), { title: 'Spends ' + x.goldCost + ' party gold' + (poor ? ' (not enough)' : '') }, '🪙' + x.goldCost));
    }
    b.appendChild(el('span.hs-icon', null, def.icon || '✦'));
    b.appendChild(el('span.hs-name', null, def.name));
    if (x.maxLevel > 1) {
      const pips = el('span.hs-pips');
      for (let i = 1; i <= x.maxLevel; i++) pips.appendChild(el('i' + (i <= x.level ? '.on' : '')));
      b.appendChild(pips);
    }
    if (x.charges > 0) b.appendChild(el('span.hs-ch', null, '×' + Math.max(0, x.charges - x.uses)));
    if (x.cd > 0) b.appendChild(el('span.hs-cd', { title: 'Ready in ' + plural(x.cd, 'turn') }, el('b', null, el('small', null, '⟳'), String(x.cd))));
    DD.UI.tooltip(b, function () { return skillTip(u, x); }, { pos: 'top' });
    b.addEventListener('click', function () { b.blur(); pressSlot(x.pos, { click: true }); });
    b.addEventListener('mouseenter', function () { M.hoverSlot = x.pos; computeOverlay(); });
    b.addEventListener('mouseleave', function () { if (M.hoverSlot === x.pos) { M.hoverSlot = null; computeOverlay(); } });
    return b;
  }

  function buildConsButton(x) {
    if (!x.def) {
      const b = el('button.hud-cons.empty', { type: 'button' }, el('span.kbd', null, x.key), '');
      DD.UI.tooltip(b, '<div class="tt"><div class="tt-title">Empty pocket</div><div class="tt-desc">Consumables are party-wide and single-use. Buy them in shops or loot them after fights.</div><div class="tt-flavor">Contains: lint, one (1) d4.</div></div>');
      return b;
    }
    const cls = ['hud-cons'];
    if (x.def.rarity === 'rare') cls.push('rare');
    if (x.armed) cls.push('armed');
    if (x.ok !== true) cls.push('is-disabled');
    const b = el('button', { type: 'button', class: cls }, el('span.kbd', null, x.key), x.def.icon || '🧪');
    DD.UI.tooltip(b, function () {
      return (x.ok !== true ? '<div class="tt"><div class="tt-why">⛔ ' + esc(x.ok) + '</div></div>' : '<div class="tt"><div class="tt-ok">✓ Press ' + esc(x.key) + ' or click, then pick a target</div></div>') + DD.UI.consumableTooltipHtml(x.id);
    }, { pos: 'top' });
    b.addEventListener('click', function () { b.blur(); pressConsumable(x.index); });
    return b;
  }

  function iaInfo(ia) {
    const t = DD.Grid.tile(ia.x, ia.y);
    const od = t && t.obj ? DD.getObject(t.obj.id) : null;
    if (ia.kind === 'helpUp') { const o = byId(ia.unitId); return { icon: '🆘', name: 'Help Up', sub: o ? o.name : 'ally', desc: 'Revive ' + (o ? o.name : 'a downed ally') + ' at 25% HP. Costs 2 AP.' }; }
    if (ia.kind === 'smash') return { icon: '🔨', name: 'Smash', sub: od ? od.name : 'object', desc: 'Deal ' + num(ia.dmg, 5) + ' damage to the ' + (od ? od.name : 'object') + ' (' + (t && t.obj ? t.obj.hp + '/' + t.obj.maxHp + ' HP' : '') + ').' };
    return { icon: OBJ_ICON[ia.objId] || '🖐️', name: ia.label || 'Use', sub: od ? od.name : 'object', desc: (od && od.desc) || 'Interact with it and see what happens.' };
  }

  function buildActButton(u, x, i) {
    const info = iaInfo(x.ia);
    const keyName = i === 0 ? 'E' : '';
    const b = el('button', { type: 'button', class: ['hud-skill', 'act', 'kind-' + x.ia.kind, x.ok ? '' : 'is-disabled'] },
      keyName ? el('span.kbd.hs-key', null, keyName) : null,
      el('span.hs-ap', null, String(num(x.ia.ap, 1))), el('span.hs-icon', null, info.icon), el('span.hs-name', null, info.name + ' · ' + info.sub));
    DD.UI.tooltip(b, function () {
      return '<div class="tt"><div class="tt-head"><span class="tt-icon">' + esc(info.icon) + '</span><div class="tt-titles"><div class="tt-title">' + esc(info.name) + '</div><div class="tt-sub">' + esc(info.sub) + ' · ' + num(x.ia.ap, 1) + ' AP</div></div></div>' +
        (x.ok ? '' : '<div class="tt-why">⛔ Not enough AP.</div>') + '<div class="tt-desc">' + esc(info.desc) + '</div>' + (keyName ? '<div class="tt-foot">Hotkey: E · or click the highlighted tile</div>' : '') + '</div>';
    }, { pos: 'top' });
    b.addEventListener('click', function () { b.blur(); doInteract(u, x.ia); });
    b.addEventListener('mouseenter', function () { M.hoverIa = { x: x.ia.x, y: x.ia.y }; computeOverlay(); });
    b.addEventListener('mouseleave', function () { M.hoverIa = null; computeOverlay(); });
    return b;
  }

  function renderBar() {
    const s = S();
    if (!s) return;
    const u = selectedUnit();
    const m = barModel(u, s);
    renderEndCluster(s, m.lock);
    if (m.sig === M.barSig && u) return;
    M.barSig = m.sig || '';
    const E = M.els;
    E.barGroups.innerHTML = '';
    E.barHead.innerHTML = '';
    if (!u) {
      E.barHead.appendChild(el('span', null, 'Nobody selected'));
      E.barGroups.appendChild(el('div.hud-skill.empty', null, el('span.hs-icon', null, '?'), el('span.hs-name', null, 'Click a hero')));
      return;
    }
    const d = defOf(u) || {};
    E.barHead.appendChild(el('span', null, u.name + (u.kind === 'summon' && u.title && u.title !== u.name ? ' (' + u.title + ')' : '')));
    const myTurn = controllable(u);
    const ii = myTurn ? null : initInfo(u);
    const meta = M.moment ? '🎲 rolling initiative · ' : M.enemyPlayback ? '⏳ waiting · ' : myTurn ? num(u.ap) + '/' + num(u.maxAp) + ' AP · ' : deploying(s) ? '⛺ deploying · ' : ii ? turnWhen(ii) + ' · ' : '';
    E.barHead.appendChild(el('span.bh-meta', null, meta + '👣 ' + effMov(u) + (moveCost(u) > 1 ? ' (moves cost 2 AP)' : '')));
    const warn = stunned(u) ? 'Stunned' : hasSt(u, 'sheep') ? 'Sheep — can only move' : hasSt(u, 'root') ? 'Rooted — can\'t move' : hasSt(u, 'silenced') ? 'Silenced — no spells' : '';
    if (warn) E.barHead.appendChild(el('span.bh-warn', null, warn));
    DD.UI.tooltip(E.barHead, u.kind === 'hero' && d.passive
      ? '<div class="tt"><div class="tt-title">' + esc(d.passive.name || 'Passive') + '</div><div class="tt-desc">' + esc(d.passive.desc || '') + '</div>' + blessingsHtml(u) + '</div>'
      : function () { return unitTooltipHtml(u); }, { pos: 'top' });
    const skills = el('div.hud-group');
    m.slots.forEach(function (x) { skills.appendChild(buildSkillButton(u, x)); });
    E.barGroups.appendChild(skills);
    if (m.cons.length) {
      E.barGroups.appendChild(el('div.hud-sep'));
      const col = el('div.hud-cons-col.n' + m.cons.length);
      m.cons.forEach(function (x) { col.appendChild(buildConsButton(x)); });
      E.barGroups.appendChild(col);
    }
    if (m.acts.length) {
      E.barGroups.appendChild(el('div.hud-sep'));
      const acts = el('div.hud-group');
      m.acts.slice(0, 3).forEach(function (x, i) { acts.appendChild(buildActButton(u, x, i)); });
      E.barGroups.appendChild(acts);
    }
  }

  /** The units that act between the end of this turn and the next hero turn (what End Turn plays out). */
  function upcoming() {
    const m = trackerModel();
    const out = [];
    for (let i = 0; i < m.items.length; i++) {
      const it = m.items[i];
      if (it.divider || it.cur) continue;
      out.push(it.unit);
      if (playerSide(it.unit) && !it.unit.downed && !isStunnedU(it.unit)) break;
    }
    return out;
  }
  function endTurnTip() {
    const s = S();
    if (s && deploying(s)) return rollTip();
    const cur = currentUnit();
    const next = upcoming();
    let h = '<div class="tt"><div class="tt-title">End ' + esc(cur ? cur.name + '\'s' : 'the') + ' turn (Space)</div><div class="tt-desc">' + esc(END_TURN_TIPS[(s ? s.turn : 0) % END_TURN_TIPS.length]) + ' Unused AP is lost — there is no Guard.</div>';
    if (next.length) {
      h += '<div class="tt-target"><b>Then:</b> ' + esc(next.map(function (u) { return (playerSide(u) ? '' : '👹 ') + u.name; }).join(' → ')) + '</div>';
      const foes = next.filter(function (u) { return !playerSide(u); }).length;
      if (foes) h += '<div class="tt-foot">' + esc(plural(foes, 'enemy', 'enemies') + ' act before your next hero. Hold Alt to see where they can reach.') + '</div>';
    }
    return h + '</div>';
  }
  function rollTip() {
    return '<div class="tt"><div class="tt-title">🎲 Roll for Initiative! (Space)</div><div class="tt-desc">Ends deployment. Everyone — heroes and monsters — rolls d20 + initiative; the order stays fixed for the whole fight.</div><div class="tt-flavor">The DM has been "pre-rolling" for twenty minutes.</div></div>';
  }
  function threatTip() {
    return '<div class="tt"><div class="tt-title">👁 Threat shading (hold Alt · T toggles)</div><div class="tt-desc">Tints every tile enemies could hit before this hero\'s next turn (where they can walk + reach with an attack that is ready), plus aura damage. Darker = more damage; hatched = enough to drop the selected hero.</div><div class="tt-foot">An estimate: walls are not counted past their walk. Boss wind-ups are always shown (⏳ red tiles).</div></div>';
  }
  function undoTip() {
    const s = S();
    const ok = !!(C() && C().canUndo && C().canUndo());
    const u = ok && s && s.undo ? byId(s.undo.unitId) : null;
    return '<div class="tt"><div class="tt-title">Undo Move (Z)</div><div class="tt-desc">' + (ok ? 'Take back ' + esc(u ? u.name : 'the') + '\'s last move and get the AP back.' : 'Only the last move can be undone, and only if nothing else happened since.') + '</div><div class="tt-flavor">Rewind. The DM sighs audibly.</div></div>';
  }

  function renderEndCluster(s, lock) {
    const E = M.els;
    const hype = U.clamp(num(s.hype), 0, 100);
    if (M.hypeShown !== hype) {
      M.hypeShown = hype;
      E.hypeMeterBox.innerHTML = '';
      E.hypeMeterBox.appendChild(DD.UI.meter(hype, 100, { label: hype + ' / 100' }));
      E.hype.classList.toggle('full', hype >= 100);
    }
    const gold = num(DD.Act && DD.Act.gold ? DD.Act.gold() : 0);
    if (M.goldShown !== gold) { M.goldShown = gold; E.goldVal.textContent = String(gold); }
    const deploy = deploying(s);
    let label = 'End Turn', sub = '';
    if (deploy) { label = '🎲 Roll!'; sub = 'Start the fight'; }
    else if (!s.result) {
      const next = upcoming();
      const n = next[0];
      sub = n ? 'Next: ' + (playerSide(n) ? '' : '👹 ') + n.name : 'Next round';
    }
    if (E.endLabel && E.endLabel.textContent !== label) E.endLabel.textContent = label;
    if (E.endSub.textContent !== sub) E.endSub.textContent = sub;
    E.endBtn.classList.toggle('roll', deploy);
    const canEnd = !lock;
    DD.UI.setDisabled(E.endBtn, !canEnd);
    const anyAp = turnGroup().some(function (u) { return controllable(u) && num(u.ap) > 0 && !stunned(u); });
    E.endBtn.classList.toggle('cta', canEnd && !deploy && !anyAp && !s.result);
    DD.UI.setDisabled(E.undo, !(canEnd && !deploy && C().canUndo && C().canUndo()));
    // deployment: the big roll button above the bar
    E.rollCta.classList.toggle('hud-hidden', !deploy || !!M.moment);
    DD.UI.setDisabled(E.rollCta, !deploy || !!lock);
    E.threatBtn.classList.toggle('on', threatOn());
    DD.UI.setDisabled(E.threatBtn, !!s.result);
  }

  // ---- inspect panel ----------------------------------------------------------------------------------------------
  function tileNotable(t) {
    if (!t) return false;
    const td = DD.getTerrain(t.t) || {};
    const plain = td.walkable !== false && !td.liquid && !td.pit && num(td.cost, 1) <= 1 && !td.hazard && !td.slide && !(td.tall > 0);
    return !!(t.surface || t.obj || !plain || windupsAt(t.x, t.y, null).length || (threatOn() && reachersAt(t.x, t.y).length));
  }

  function inspectTarget() {
    if (M.trackHover) {
      const u = byId(M.trackHover);
      if (u && !u.dead) return { unit: u };
    }
    const h = M.hover;
    if (h) {
      const u = h.unitId ? byId(h.unitId) : DD.Grid.unitAt(h.x, h.y);
      if (u && !u.dead) return { unit: u };
      const t = DD.Grid.tile(h.x, h.y);
      if (tileNotable(t)) return { tile: t };
    }
    if (M.pinned) {
      const u = byId(M.pinned);
      if (u && !u.dead) return { unit: u, pinned: true };
      M.pinned = null;
    }
    return null;
  }

  /** A boss wind-up in the inspect panel: ⏳ label, damage, when it lands and how to stop it (DD.AI.describe). */
  function windupRow(u, it) {
    const d = DD.safe('HUD describe wind-up', DD.AI.describe, DD.AI, [u, it]) || { label: '?', icon: '❔', dmg: 0, text: '' };
    const left = num(d.turnsLeft || d.delay, 1);
    const pills = [];
    if (d.dmg) pills.push(el('span.pill', { style: { color: '#fff', background: 'rgba(170,40,30,.75)', borderColor: '#ff9d90' } }, d.dmg + (d.uncertain ? '?' : '') + ' dmg'));
    pills.push(el('span.pill', { style: { color: '#2a180a', background: '#ffcf7a', borderColor: '#ffe7b0' }, title: left > 1 ? 'Lands in ' + left + ' of its turns' : 'Lands at the start of its next turn' }, '⏳ ' + (left > 1 ? left + ' turns' : 'next turn')));
    return el('div.hi-intent.windup', null,
      el('div.hii-top', null, el('span', null, d.icon || '⚔️'), el('span', null, d.label || '?'), pills),
      d.text ? el('div.hii-text', null, d.text) : null);
  }

  /** An ability in the inspect panel: icon, name, range / area, cooldown, the exact desc for this unit. */
  function abilityRow(u, slot) {
    const r = DD.Targeting.resolve(slot);
    if (!r) return null;
    const info = typeof DD.UI.skillInfo === 'function' ? DD.safe('UI.skillInfo', DD.UI.skillInfo, DD.UI, [r.def, r.level, u]) : null;
    const name = r.def.name || r.def.id;
    const meta = info ? [info.range, info.area].filter(Boolean).join(' · ') : '';
    const cd = num(slot.cd);
    const charges = num(r.def.charges);
    const out = charges > 0 && num(slot.uses) >= charges;
    return el('div.hi-abil' + (cd > 0 || out ? '.off' : ''), null,
      el('div.ha-top', null, el('span', null, r.def.icon || '✦'), el('b', null, name), cd > 0 ? el('span.ha-cd', { title: 'Cooldown: ready again in ' + cd + ' of its turns' }, '⟳' + cd) : null,
        out ? el('span.ha-cd', null, 'used up') : null, meta ? el('span.ha-meta', null, meta) : null),
      el('div.ha-desc', null, (info && info.desc) || DD.skillDesc(r.def, r.level, u) || ''));
  }

  function initBadge(u) {
    const ii = initInfo(u);
    if (!ii) return null;
    const foe = !playerSide(u);
    const tip = ii.joining ? 'Rolled ' + ii.total + ' on arrival: joins the order next round.'
      : 'Initiative ' + ii.total + (ii.fixed || !(ii.roll > 0) ? '' : ' (d20 ' + ii.roll + ' ' + signed(ii.init) + ')') + ' — #' + ii.pos + ' of ' + ii.of + ', ' + turnWhen(ii) + '.';
    return el('div.hi-order' + (foe ? '' : '.hero'), { title: tip }, el('small', null, ii.joining ? 'Joins' : 'Init'), el('b', null, ii.joining ? 'R+1' : '#' + ii.pos));
  }

  function unitInspect(u, pinned) {
    const d = defOf(u) || {};
    const foe = !playerSide(u);
    const boss = foe && (u.isBoss || u.tier === 'boss');
    const box = [];
    const pcolor = foe ? (boss ? '#ff7a4a' : '#e2483c') : (d.color || '#c9a24f');
    const port = DD.UI.portrait(u.defId, 46, { fallback: foe ? '👹' : '🐾' });
    port.style.setProperty('--pc2', pcolor);
    let sub;
    if (u.kind === 'hero') sub = [d.race, d.cls].filter(Boolean).join(' ') + ' · Lv ' + num(u.level, 1);
    else if (u.kind === 'summon') { const o = byId(u.ownerId); sub = 'Summon' + (o ? ' of ' + o.name : ''); }
    else sub = boss ? ((d.boss && d.boss.title) || 'Boss') : ({ minion: 'Minion', normal: 'Enemy', elite: 'Elite' }[u.tier] || 'Enemy') + (d.act ? ' · Act ' + U.roman(d.act) : '');
    const head = el('div.hi-head', null, port, el('div.hi-titles', null, el('div.hi-name', null, u.name), el('div.hi-sub', null, sub + (pinned ? ' · 📌 pinned' : ''))));
    const ib = initBadge(u);
    if (ib) head.appendChild(ib);
    box.push(head);
    const hb = hpBar('big' + (foe ? '.foe' : u.kind === 'summon' ? '.summon' : ''));
    hb.update(u);
    M.inspectHp = { bar: hb, id: u.id };
    box.push(hb.el);
    const stats = [];
    if (!foe && controllable(u)) stats.push(el('span.pill.ap', null, num(u.ap) + '/' + num(u.maxAp) + ' AP'));
    if (u.armor) stats.push(el('span.pill', null, '🛡 Armor ' + u.armor));
    stats.push(el('span.pill', null, '👣 ' + effMov(u) + ' Move'));
    if (!(u.kind === 'summon' && u.ownerId && !foe)) stats.push(el('span.pill', { title: 'Initiative modifier (added to the d20)' }, '🎲 Init ' + signed(initMod(u))));
    if (!foe && num(u.apBank)) stats.push(el('span.pill', { style: { color: '#bfe9ff' } }, '⚡ ' + signed(u.apBank) + ' AP next turn'));
    const fl = u.flags || {};
    if (fl.flying) stats.push(el('span.pill', null, '🪽 Flying'));
    if (fl.immovable) stats.push(el('span.pill', null, '🗿 Immovable'));
    if (fl.stunImmune) stats.push(el('span.pill', null, '💫 Stun-immune'));
    Object.keys(u.resist || {}).forEach(function (k) {
      const v = num(u.resist[k], 1);
      if (v === 1) return;
      stats.push(el('span.pill', { style: { color: v > 1 ? '#ffd2c8' : '#cfe3ff' } }, v === 0 ? 'Immune: ' + k : v < 1 ? 'Resists ' + k : 'Weak to ' + k));
    });
    box.push(el('div.hi-stats', null, stats));
    const chips = statusChips(u);
    if (chips.length) box.push(el('div.hi-status', null, chips));
    if (foe) {
      // enemy-level passive (def.passive: { name, desc, icon? }; desc may be (unit) => string for live numbers)
      const pv = d.passive;
      if (pv && (pv.name || pv.desc)) {
        const pdesc = typeof pv.desc === 'function' ? DD.safe('passive desc of ' + u.defId, pv.desc, pv, [u]) : pv.desc;
        box.push(el('div.hi-line.passive', { html: '<b>' + esc((pv.icon ? pv.icon + ' ' : '') + (pv.name || 'Passive')) + ':</b> ' + esc(pdesc || '') }));
      }
      // its aura (threatAt): who it hits, from where they stand now
      const hits = [];
      partyUnits().forEach(function (h) {
        if (!active(h)) return;
        auraThreats(h, h.x, h.y).forEach(function (t) { if (t.unit === u) hits.push({ h: h, t: t }); });
      });
      if (hits.length) {
        const byLabel = {};
        hits.forEach(function (x) { (byLabel[x.t.label] = byLabel[x.t.label] || []).push(x.h.name + ' ' + x.t.dmg); });
        Object.keys(byLabel).forEach(function (lab) { box.push(el('div.hi-line.aura', null, '⚠ ' + lab + ' (aura) → ' + byLabel[lab].join(', '))); });
      }
      // boss wind-ups: the only telegraphs
      const its = (u.intents || []).filter(Boolean);
      if (its.length) {
        box.push(el('div.hi-sec', null, '⏳ Winding up'));
        its.slice(0, 3).forEach(function (it) { box.push(windupRow(u, it)); });
      }
      // reach: who it could hit on its next turn (move + a ready damaging skill), and when that is
      const ii = initInfo(u);
      const when = ii ? (ii.cur ? 'This turn' : ii.joining ? 'Next round' : ii.inTurns === 1 ? 'Next turn (it acts next)' : 'On its turn (in ' + ii.inTurns + ' turns' + (ii.acted ? ', next round' : '') + ')') : 'On its next turn';
      if (isStunnedU(u)) box.push(el('div.hi-line.good', null, '💫 Incapacitated: it loses its next turn' + (its.length ? ' and its wind-up fizzles.' : '.')));
      else if (hasSt(u, 'sheep')) box.push(el('div.hi-line.good', null, '🐑 A sheep: it can only wander next turn.'));
      else {
        const r = reachInfo(u);
        const inReach = partyUnits().filter(function (h) { return active(h) && r.tiles.has(key(h.x, h.y)); })
          .map(function (h) { return h.name + ' ' + num(r.tiles.get(key(h.x, h.y))); });
        const only = r.only ? byId(r.only) : null;
        if (inReach.length) box.push(el('div.hi-line.reach', null, '⚠ ' + when + ' it can reach: ' + inReach.join(', ') + (only ? ' (taunted: only ' + only.name + ')' : '')));
        else if (r.tiles.size) box.push(el('div.hi-line.good', null, '✓ ' + when + ': no hero within its reach (move ' + effMov(u) + ' + attack).'));
        else box.push(el('div.hi-line', null, when + ': no damaging attack ready.'));
      }
      const slots = (C().slotsOf(u) || []).filter(Boolean);
      if (slots.length) {
        box.push(el('div.hi-sec', null, 'Abilities'));
        slots.slice(0, 4).forEach(function (sl) { const row = abilityRow(u, sl); if (row) box.push(row); });
      }
    } else {
      const ii = initInfo(u);
      if (ii && !deploying(S())) box.push(el('div.hi-line', null, '🎲 ' + (ii.summonOf ? 'Acts on ' + ii.summonOf.name + '\'s turn — ' : '') + U.capitalize(turnWhen(ii)) + (ii.pos ? ' (#' + ii.pos + ' of ' + ii.of + ').' : '.')));
      const auras = u.downed ? [] : auraThreats(u, u.x, u.y);
      const reach = u.downed ? [] : reachersAt(u.x, u.y);
      const wus = u.downed ? [] : windupsAt(u.x, u.y, u);
      if (wus.length) {
        box.push(el('div.hi-sec', null, '⏳ A wind-up lands here'));
        wus.slice(0, 3).forEach(function (w) { box.push(el('div.hi-line.warn', null, windupText(w))); });
      }
      if (reach.length) box.push(el('div.hi-line.reach', null, '⚠ Enemies that can reach this tile before its next turn: ' + reachText(reach)));
      else if (u.side === 'hero' && !u.downed && !auras.length && !wus.length) box.push(el('div.hi-line.good', null, '✓ No enemy can reach this tile before its next turn.'));
      if (auras.length) {
        box.push(el('div.hi-sec', null, '⚠ Auras: ' + auraTotal(auras) + ' before its next turn'));
        auras.slice(0, 4).forEach(function (t) { box.push(el('div.hi-line.aura', null, auraDetail(t))); });
      }
      if (u.kind === 'hero' && d.passive) box.push(el('div.hi-line', { html: '<b>' + esc(d.passive.name || 'Passive') + ':</b> ' + esc(d.passive.desc || '') }));
      const bless = u.kind === 'hero' && typeof DD.UI.passiveChip === 'function' ? (u.passives || []).filter(function (p) { return p && p.def; }) : [];
      if (bless.length) box.push(el('div.hi-bless', null, bless.map(function (p) { return DD.UI.passiveChip({ id: p.id, level: p.level }, { tipPos: 'left', role: !!p.role }); })));
    }
    const flavor = u.kind === 'hero' ? d.blurb : d.desc;
    if (flavor) box.push(el('div.hi-flavor', null, flavor));
    if (foe && !pinned) box.push(el('div.hi-line', { style: { fontSize: '.68rem', color: 'var(--text-3)' } }, 'Click to pin · Right-click to unpin'));
    return box;
  }

  function tileInspect(t) {
    const box = [];
    const td = DD.getTerrain(t.t) || { name: t.t };
    box.push(el('div.hi-head', null, el('div.hi-titles', null, el('div.hi-name', null, td.name || t.t), el('div.hi-sub', null, 'Tile ' + t.x + ', ' + t.y + (t.h ? ' · Elevation ' + t.h : '')))));
    if (td.desc) box.push(el('div.hi-line', null, td.desc));
    if (t.surface) {
      const sd = DD.getSurface(t.surface.id) || { name: t.surface.id };
      const turns = num(t.surface.turns, -1);
      box.push(el('div.hi-line', { html: '<b>' + esc(sd.name) + '</b> ' + (turns > 0 ? '(' + esc(plural(turns, 'round')) + ' left)' : '(permanent)') + (sd.desc ? ' — ' + esc(sd.desc) : '') }));
    }
    if (t.obj) {
      const od = DD.getObject(t.obj.id) || { name: t.obj.id };
      const hp = t.obj.maxHp > 0 ? ' (' + t.obj.hp + '/' + t.obj.maxHp + ' HP)' : '';
      const ia = DD.Act && DD.Act.interactionOf ? DD.safe('HUD interactionOf', DD.Act.interactionOf, DD.Act, [t.obj, selectedUnit()]) : null;
      box.push(el('div.hi-line', { html: '<b>' + esc(t.obj.label || od.name) + '</b>' + esc(hp) + (od.desc ? ' — ' + esc(od.desc) : '') }));
      if (ia) box.push(el('div.hi-line.good', null, '🖐️ ' + ia.label + ' (' + ia.ap + ' AP) from an adjacent tile.'));
    }
    const wus = windupsAt(t.x, t.y, null);
    if (wus.length) {
      box.push(el('div.hi-sec', null, '⏳ Wind-up lands here'));
      wus.slice(0, 4).forEach(function (x) { box.push(el('div.hi-line.warn', null, windupText(x))); });
    }
    const reach = reachersAt(t.x, t.y);
    if (reach.length) box.push(el('div.hi-line.reach', null, '⚠ In enemy reach: ' + reachText(reach)));
    // auras for the selected hero, were they to end the turn here
    const sel = selectedUnit();
    const auras = sel && sel.side === 'hero' && active(sel) && !(t.x === sel.x && t.y === sel.y) ? auraThreats(sel, t.x, t.y) : [];
    if (auras.length) {
      box.push(el('div.hi-sec', null, '⚠ If ' + sel.name + ' ends the turn here'));
      auras.slice(0, 4).forEach(function (x) { box.push(el('div.hi-line.aura', null, auraDetail(x))); });
    }
    return box;
  }

  function renderInspect() {
    if (!M) return;
    const E = M.els;
    const tgt = S() ? inspectTarget() : null;
    M.inspected = tgt;
    if (!tgt) {
      if (M.inspectSig !== '') { M.inspectSig = ''; E.inspect.classList.add('hud-hidden'); M.inspectHp = null; }
      applyFocus();
      return;
    }
    const u = tgt.unit;
    const sig = u ? 'u' + u.id + ':' + M.gen + ':' + !!tgt.pinned + ':' + statusSig(u) + ':' + (u.intents || []).length : 't' + tgt.tile.x + ',' + tgt.tile.y + ':' + M.gen + ':' + M.sel;
    if (sig !== M.inspectSig) {
      M.inspectSig = sig;
      E.inspect.innerHTML = '';
      E.inspect.className = 'hud-inspect panel slim' + (u && u.side === 'enemy' ? ' foe' : '') + (u && (u.isBoss || u.tier === 'boss') ? ' boss' : '');
      if (!u) M.inspectHp = null;
      UI().append(E.inspect, u ? unitInspect(u, tgt.pinned) : tileInspect(tgt.tile));
      placeInspect(u || tgt.tile);
    }
    applyFocus();
  }

  /**
   * Put the inspect panel in the top-left or top-right corner (over the log), whichever hides fewer units —
   * the inspected one counts six times. Board corners are mostly empty on an isometric diamond.
   */
  function placeInspect(p) {
    const E = M.els;
    const s = S();
    if (!DD.Render || DD.headless || !p || !s || typeof DD.Render.worldToScreen !== 'function') return;
    const pts = s.units.filter(function (u) { return !u.dead; }).map(function (u) {
      const q = DD.Render.worldToScreen(u.x, u.y);
      return { x: q.x, y: q.y, w: u === p ? 6 : 1 };
    });
    if (p.id === undefined) { const q = DD.Render.worldToScreen(p.x, p.y); pts.push({ x: q.x, y: q.y, w: 6 }); }
    // v2: the centre column (tracker + objective) is taller now: a panel that would meet it starts below it
    const cols = [E.track, E.obj].filter(function (n) { return n && !n.classList.contains('hud-hidden'); }).map(function (n) { return n.getBoundingClientRect(); });
    let best = null;
    [false, true].forEach(function (alt) {
      E.inspect.classList.toggle('alt', alt);
      E.inspect.style.top = '';
      E.inspect.style.maxHeight = '';
      let r = E.inspect.getBoundingClientRect();
      let top = '';
      const hit = cols.filter(function (b) { return b.width > 0 && r.right > b.left && r.left < b.right && r.top < b.bottom; });
      if (hit.length) {
        const low = Math.max.apply(null, hit.map(function (b) { return b.bottom; })) + 6;
        top = Math.round(low) + 'px';
        E.inspect.style.top = top;
        E.inspect.style.maxHeight = 'calc(100% - ' + Math.round(low) + 'px - 10.5rem)';
        r = E.inspect.getBoundingClientRect();
      }
      // a sprite stands on its tile point and is ~55px tall
      const cost = pts.reduce(function (a, q) { return a + (q.x > r.left - 22 && q.x < r.right + 22 && q.y > r.top && q.y - 55 < r.bottom ? q.w : 0); }, 0);
      if (!best || cost < best.cost) best = { alt: alt, cost: cost, top: top };
    });
    E.inspect.classList.toggle('alt', best.alt);
    E.inspect.style.top = best.top;
    E.inspect.style.maxHeight = best.top ? 'calc(100% - ' + parseInt(best.top, 10) + 'px - 10.5rem)' : '';
  }

  function focusId() {
    if (!M) return null;
    if (M.focusUi) return M.focusUi;
    const t = M.inspected;
    return t && t.unit && t.unit.side === 'enemy' ? t.unit.id : null;
  }
  function applyFocus() {
    const ov = overlay();
    if (ov) ov.focusIntentUnitId = focusId();
  }

  // ---- hint bar ---------------------------------------------------------------------------------------------------
  function hint(text, cls) {
    if (!M) return;
    M.hintMsg = { text: text, cls: cls || '', until: now() + HINT_MS };
    if (cls === 'bad') sound('error');
    renderHint();
  }

  function hintContent() {
    const s = S();
    if (!s) return { text: '' };
    if (M.hintMsg && now() < M.hintMsg.until) return { text: esc(M.hintMsg.text), cls: M.hintMsg.cls };
    M.hintMsg = null;
    if (s.result) return { text: '' };
    if (M.moment) return { text: '🎲 Rolling for initiative… <b>Click</b> or <b>Space</b> to skip.', cls: 'deploy' };
    if (M.enemyPlayback) {
      const t = shownTurnUnit();
      return { text: (t && !playerSide(t) ? '👹 <b>' + esc(t.name) + '</b>\'s turn' : '👹 The monsters act') + '… <b>Space</b> skips the animations.', cls: 'warn' };
    }
    if (autoplayOn()) return { text: '🤖 Autoplay is driving. Sit back and judge its choices.' };
    const u = selectedUnit();
    if (deploying(s)) return deployHint(s, u);
    if (!u) return { text: 'Click a hero (or press <b>Tab</b>) to give orders.' };
    if (!controllable(u)) return { text: u.downed ? esc(u.name) + ' is down. An adjacent ally can <b>Help Up</b> (2 AP).' : '' };
    if (threatOn() && M.hover && M.mode.kind === 'move' && !M.cardHover) {
      const tt = threatHint(u, M.hover);
      if (tt) return tt;
    }
    if (M.mode.kind !== 'move') {
      const def = armedDef();
      if (!def) return { text: '' };
      const t = aimTarget(u, M.hover);
      let sum = '';
      if (t) sum = previewSummary(u, previewAt(u, t));
      // Blood Price: who pays the HP cost instead
      if (M.mode.kind === 'skill') {
        const lvl = armedLevel();
        const cost = DD.safe('HUD costOf', C().costOf, C(), [u, def, lvl]);
        const payer = cost ? DD.safe('HUD hpPayer', hpPayer, null, [u, def, lvl, cost]) : null;
        if (payer) sum = (sum ? sum + ' · ' : '') + '🩸 ' + payer.name + ' pays the ' + num(DD.resolve(def.hpCost, DD.skillLevel(def, lvl), u, 0)) + ' HP';
      }
      return { text: esc((def.icon || '✦') + ' ' + def.name) + ' — ' + esc(targetInstruction(def, u)) + ' · <b>Right-click</b> cancels' + (sum ? '<span class="hh-sum">' + esc(sum) + '</span>' : ''), cls: 'target' };
    }
    const h = M.hover;
    if (h && !M.cardHover && !M.trackHover) {
      const e = reachOf(u).get(key(h.x, h.y));
      if (e) {
        const parts = [];
        if (e.hazard) parts.push('⚠ The path crosses <b>' + esc(hazardName(e.hazard)) + '</b> — it will hurt.');
        const wus = windupsAt(h.x, h.y, null);
        if (wus.length) parts.push('⏳ <b>' + esc(wus.map(function (w) { return w.d.label + (w.d.dmg ? ' ' + w.d.dmg : ''); }).join(' + ')) + '</b> lands here ' + esc(windupWhen(wus[0].d)) + '.');
        // auras (enemy threatAt): what ending the turn on this tile costs, or that it escapes the current one
        const here = auraThreats(u, h.x, h.y);
        const now0 = auraThreats(u, u.x, u.y);
        if (here.length) {
          const lethal = auraLethal(here, u) ? ' 💀' : '';
          parts.push('⚠ Ending the turn here: <b>' + esc(here.map(function (t) { return t.label + ' ' + t.dmg + (t.pierce ? ' (ignores Block)' : ''); }).join(' + ')) + '</b> before its next turn' + lethal + '.');
        }
        if (e.edge) parts.push('Next to a drop — easy to get shoved in.');
        if (parts.length) return { text: parts.join(' '), cls: 'warn' };
        const escape = now0.length ? ' ✓ Out of ' + esc(now0.map(function (t) { return t.label; }).join(' and ')) + ' here (' + auraTotal(now0) + ' where ' + esc(u.name) + ' stands).' : '';
        return { text: 'Move here: ' + moveCost(u) + ' AP' + (e.cost ? ' (path cost ' + e.cost + ' of ' + effMov(u) + ')' : '') + '.' + escape + (escape ? '' : ' <span class="hh-dim">· hold <b>Alt</b> for enemy reach</span>'), cls: escape ? 'good' : '' };
      }
    }
    if (num(u.ap) <= 0) {
      const other = turnGroup().some(function (x) { return x !== u && controllable(x) && num(x.ap) > 0; });
      const n = upcoming()[0];
      return { text: esc(u.name) + ' is out of AP. ' + (other ? '<b>Tab</b> to the next unit or ' : '') + '<b>Space</b> ends the turn' + (n ? ' (next: ' + esc(n.name) + ')' : '') + '.' };
    }
    if (stunned(u)) return { text: esc(u.name) + ' is stunned and loses this turn.' };
    return { text: '' };
  }

  /** Deployment: free repositioning inside the green zone, then the roll. */
  function deployHint(s, u) {
    const h = M.hover;
    if (u && h && !M.cardHover && !M.trackHover && deployable(u) && inList(s.deploy.tiles, h) && !(h.x === u.x && h.y === u.y)) {
      const other = DD.Grid.unitAt(h.x, h.y);
      if (!other || (other.side === 'hero' && active(other))) {
        return { text: (other ? 'Swap ' + esc(u.name) + ' and ' + esc(other.name) : 'Free reposition — click to place ' + esc(u.name) + ' here') + '.', cls: 'deploy' };
      }
    }
    return { text: '⛺ <b>Deployment</b> — click a green tile to place ' + (u ? esc(u.name) : 'a hero') + ' for free, <b>Shift-click</b> an ally to swap. Then <b>🎲 Roll for Initiative!</b> (<b>Space</b>).', cls: 'deploy' };
  }

  /** Threat shading on: what could hit the hovered tile before this hero's next turn. */
  function threatHint(u, h) {
    const rs = reachersAt(h.x, h.y);
    const auras = auraThreats(u, h.x, h.y);
    const wus = windupsAt(h.x, h.y, null);
    if (!rs.length && !auras.length && !wus.length) return { text: '👁 Out of every enemy\'s reach (estimate: their move + a ready attack).', cls: 'good' };
    const parts = [];
    if (rs.length) parts.push(plural(rs.length, 'enemy', 'enemies') + ' can reach this tile: <b>' + esc(reachText(rs)) + '</b>');
    if (auras.length) parts.push('auras: <b>' + esc(auras.map(function (t) { return t.label + ' ' + t.dmg; }).join(' + ')) + '</b>');
    if (wus.length) parts.push('⏳ <b>' + esc(wus.map(function (w) { return w.d.label + (w.d.dmg ? ' ' + w.d.dmg : ''); }).join(' + ')) + '</b> lands here');
    const tot = rs.reduce(function (a, r) { return a + r.dmg; }, 0) + auraTotal(auras) + wus.reduce(function (a, w) { return a + num(w.d.dmg); }, 0);
    const lethal = tot >= num(u.hp) + num(u.block) ? ' 💀 enough to drop ' + esc(u.name) + '.' : '.';
    return { text: '👁 ' + parts.join(' · ') + ' — up to ' + tot + lethal, cls: 'warn' };
  }

  function renderHint() {
    if (!M) return;
    const c = hintContent();
    const sig = (c.cls || '') + '|' + (c.text || '');
    if (sig === M.hintSig) return;
    M.hintSig = sig;
    M.els.hint.className = 'hud-hint' + (c.cls ? ' ' + c.cls : '');
    M.els.hint.innerHTML = c.text || '';
  }

  // ---- overlay ----------------------------------------------------------------------------------------------------
  function clearOverlay(ov) {
    ov.moveTiles = []; ov.path = []; ov.pathHazard = false; ov.targetTiles = []; ov.areaTiles = [];
    ov.previews = {}; ov.deployTiles = []; ov.interactTiles = [];
    ov.threat = null; ov.reach = null;
  }

  /** The enemy being inspected (hover, tracker hover or pin), for its reach on the board. */
  function inspectedFoe() {
    const t = inspectTarget();
    const u = t && t.unit;
    return u && !playerSide(u) && active(u) ? u : null;
  }

  function computeOverlay() {
    const ov = overlay();
    if (!M || !ov) return;
    const s = S();
    clearOverlay(ov);
    ov.showIntents = true;
    ov.focusIntentUnitId = focusId();
    ov.selectedId = null;
    ov.turnUnitId = null;
    if (!s) return;
    const lock = lockReason();
    const u = selectedUnit();
    if (u && !s.result && !u.dead) ov.selectedId = u.id;
    const tu = s.result || M.moment ? null : shownTurnUnit();
    ov.turnUnitId = tu ? tu.id : null;
    const cu = M.trackHover ? byId(M.trackHover) : M.cardHover ? byId(M.cardHover) : null;
    ov.hover = cu ? { x: cu.x, y: cu.y } : M.hover ? { x: M.hover.x, y: M.hover.y } : null;
    // threat shading (hold Alt / toggle) — also during AI turns, so the player can watch the danger move
    if (threatOn() && !s.result && !M.moment) {
      const td = threatData();
      ov.threat = { tiles: td.tiles.map(function (t) { return { x: t.x, y: t.y, dmg: t.dmg, lethal: t.lethal }; }), ref: td.ref };
    } else if (M.mode.kind === 'move' && !s.result && !M.moment) {
      // one inspected enemy's reach on its next turn
      const f = inspectedFoe();
      if (f) {
        const r = reachInfo(f);
        const tiles = [];
        r.tiles.forEach(function (v, k) { const p = k.split(','); tiles.push({ x: +p[0], y: +p[1] }); });
        if (tiles.length) ov.reach = { unitId: f.id, tiles: tiles };
      }
    }
    if (lock && lock !== 'modal') return;
    if (!u) return;
    if (deploying(s)) {
      // deployment: the green zone for any hero standing in it (free swaps)
      if (deployable(u)) s.deploy.tiles.forEach(function (t) { ov.deployTiles.push({ x: t.x, y: t.y }); });
      return;
    }
    if (!controllable(u)) return;
    if (M.mode.kind === 'move') {
      const dset = {};
      const reach = reachOf(u);
      if (M.hoverSlot != null) {
        const item = barSlots(u)[M.hoverSlot];
        if (item && item.slot) ov.targetTiles = DD.safe('HUD valid targets', DD.Targeting.validTargets, DD.Targeting, [u, item.slot]) || [];
        return;
      }
      reach.forEach(function (e, k) { if (!dset[k]) ov.moveTiles.push({ x: e.x, y: e.y }); });
      ov.interactTiles = M.hoverIa ? [M.hoverIa] : interactionsOf(u).map(function (ia) { return { x: ia.x, y: ia.y }; });
      const h = M.hover;
      if (h && !dset[key(h.x, h.y)]) {
        const e = reach.get(key(h.x, h.y));
        if (e) { ov.path = (e.path || []).map(function (p) { return { x: p.x, y: p.y }; }); ov.pathHazard = !!e.hazard; }
      }
      return;
    }
    ov.targetTiles = armedTargets(u).slice();
    const t = aimTarget(u, M.hover);
    if (t) {
      const p = previewAt(u, t);
      if (p) { ov.areaTiles = (p.tiles || []).slice(); ov.previews = overlayPreviews(p); }
    }
  }

  // ---- selection & modes ----------------------------------------------------------------------------------------------
  function setMove() {
    if (!M) return;
    M.mode = { kind: 'move' };
  }

  /** The unit to select by default: the acting hero (or a summon of its turn with AP), else a hero to deploy. */
  function defaultSelection() {
    const s = S();
    const group = turnGroup().filter(function (u) { return controllable(u); });
    const cur = currentUnit();
    if (group.length) {
      if (cur && controllable(cur) && num(cur.ap) > 0 && !stunned(cur)) return cur;
      return group.filter(function (u) { return num(u.ap) > 0 && !stunned(u); })[0] || group[0];
    }
    const list = partyUnits();
    if (deploying(s)) return list.filter(deployable)[0] || list.filter(active)[0] || null;
    // not a hero turn (AI turns playing, fight over): keep showing the next hero up, or anyone standing
    const next = list.filter(function (u) { return u.kind === 'hero' && active(u); });
    return (cur && cur.side === 'hero' && active(cur) ? cur : null) || next[0] || list.filter(active)[0] || null;
  }

  function validateSelection() {
    const s = S();
    const u = selectedUnit();
    if (!u || u.dead || u.side !== 'hero') { const d = defaultSelection(); M.sel = d ? d.id : null; setMove(); return; }
    // v2: during a hero turn only its turn group can be selected (another hero's card only inspects)
    if (s.phase === 'player' && s.current && !s.result && !controllable(u) && turnGroup().some(controllable)) { const d = defaultSelection(); M.sel = d ? d.id : null; setMove(); return; }
    if (M.mode.kind !== 'move') {
      const ok = M.mode.unitId === u.id && !s.result && (M.mode.kind === 'skill'
        ? C().slotsOf(u).indexOf(M.mode.slot) >= 0 && C().canUse(u, M.mode.slot) === true
        : C().canUseConsumable(u, M.mode.index) === true && consumableList()[M.mode.index] === M.mode.id);
      if (!ok) setMove();
    }
  }

  function centerIfOffscreen(u) {
    if (!DD.Render || DD.headless || typeof DD.Render.worldToScreen !== 'function' || typeof DD.Render.centerOn !== 'function') return;
    const p = DD.Render.worldToScreen(u.x, u.y);
    const sz = DD.Render.size ? DD.Render.size() : { width: window.innerWidth, height: window.innerHeight };
    if (p.x < 250 || p.x > sz.width - 60 || p.y < 80 || p.y > sz.height - 200) DD.Render.centerOn(u.x, u.y);
  }
  /** v2: the camera gently keeps the acting unit in view (no-op while it is comfortably on screen). */
  function followUnit(u) {
    if (!u || DD.headless || !DD.Render || typeof DD.Render.follow !== 'function') return false;
    const v = u.vis || u;
    return !!DD.safe('Render.follow', DD.Render.follow, DD.Render, [num(v.x, u.x), num(v.y, u.y)]);
  }

  function select(id, opts) {
    opts = opts || {};
    const u = byId(id);
    if (!M || !u || u.dead || u.side !== 'hero') return false;
    if (!selectable(u) && !opts.force) return false;
    const changed = M.sel !== id;
    M.sel = id;
    setMove();
    M.autoAdvance = null;
    if (changed) {
      if (opts.sound !== false) sound('click');
      if (opts.bark) selectBark(u);
    }
    if (opts.center) centerIfOffscreen(u);
    refreshView();
    return true;
  }

  /** Cosmetic "select" bark through the FX renderer directly (no FX queue entry, so input never locks for it). */
  function selectBark(u) {
    const d = defOf(u);
    const lines = d && d.barks && d.barks.select;
    if (!Array.isArray(lines) || !lines.length || DD.rng.next() > 0.3) return;
    if (DD.FXRender && typeof DD.FXRender.bark === 'function') DD.safe('HUD select bark', DD.FXRender.bark, DD.FXRender, [u, U.pick(lines, DD.rng), 1800]);
  }

  /** Tab: the next unit of this turn (the hero and its summons); in deployment, the next hero to place. */
  function cycle(dir) {
    if (!M) return;
    const list = partyUnits().filter(selectable);
    if (!list.length) return;
    if (list.length === 1 && list[0].id === M.sel && !deploying(S())) {
      const n = upcoming().filter(playerSide)[0];
      hint('Only ' + list[0].name + ' acts this turn' + (n ? ' — ' + n.name + ' acts ' + (upcoming()[0] === n ? 'next' : 'later') : '') + '.', 'warn');
      return;
    }
    const i = list.findIndex(function (u) { return u.id === M.sel; });
    const order = [];
    for (let n = 1; n <= list.length; n++) order.push(list[((i < 0 ? -1 : i) + dir * n + list.length * 4) % list.length]);
    const pick = order.filter(function (u) { return num(u.ap) > 0 && !stunned(u) && u.id !== M.sel; })[0] || order[0];
    if (pick) select(pick.id, { center: true });
  }

  function arm(u, x) {
    if (x.ok !== true) { hint(x.def.name + ': ' + x.ok, 'bad'); return; }
    M.mode = { kind: 'skill', pos: x.pos, slot: x.slot, unitId: u.id };
    M.hoverSlot = null;
    sound('click');
    refreshView();
  }

  /** Hotkey/click on action position `pos`: arm it, or (pressed again) fire it at the aimed target. */
  function pressSlot(pos, opts) {
    opts = opts || {};
    if (!M) return;
    const lock = lockReason();
    if (lock && lock !== 'modal') { lockedFeedback(lock); return; }
    const u = selectedUnit();
    if (deploying(S())) { hint('Deployment: arrange the party, then 🎲 Roll for Initiative! (Space). Skills come after.', 'warn'); return; }
    if (!u || !controllable(u)) { hint(u ? u.name + ' can\'t act right now.' : 'Select a hero first.', 'bad'); return; }
    const item = barSlots(u)[pos];
    if (!item || !item.slot) { hint(item && item.role === 'skill' ? 'That socket is empty.' : 'Nothing on that key.', 'bad'); return; }
    if (M.mode.kind === 'skill' && M.mode.pos === pos && M.mode.unitId === u.id) {
      const t = aimTarget(u, M.hover);
      if (t) { useArmed(u, t); return; }
      setMove();
      sound('click');
      refreshView();
      return;
    }
    const x = slotModel(u, item, pos, S(), null);
    arm(u, x);
  }

  function pressConsumable(index) {
    if (!M) return;
    const lock = lockReason();
    if (lock && lock !== 'modal') { lockedFeedback(lock); return; }
    const u = selectedUnit();
    const id = consumableList()[index];
    const d = id ? DD.getConsumable(id) : null;
    if (!d) { hint('That pocket is empty.', 'bad'); return; }
    if (!u || u.kind !== 'hero') { hint('Only heroes can use consumables.', 'bad'); return; }
    if (M.mode.kind === 'cons' && M.mode.index === index) {
      const t = aimTarget(u, M.hover);
      if (t) { useArmed(u, t); return; }
      setMove(); sound('click'); refreshView();
      return;
    }
    const ok = DD.safe('HUD canUseConsumable', C().canUseConsumable, C(), [u, index]);
    if (ok !== true) { hint(d.name + ': ' + (ok || 'Can\'t use that now.'), 'bad'); return; }
    M.mode = { kind: 'cons', index: index, id: id, unitId: u.id };
    sound('click');
    refreshView();
  }

  function lockedFeedback(lock) {
    const t = M ? shownTurnUnit() : null;
    if (M && M.moment) hint('Rolling for initiative… click or Space to skip.', 'warn');
    else if (lock === 'enemy' || (M && M.enemyPlayback)) hint('It\'s ' + (t && !playerSide(t) ? t.name + '\'s' : 'the enemies\'') + ' turn. Space skips their animations.', 'warn');
    else if (lock === 'busy') hint('Hold on — the dice are still rolling. (Space skips animations.)', 'warn');
    else if (lock === 'autoplay') hint('Autoplay is driving. Click the 🤖 Autoplay button to take over.', 'warn');
    else if (lock === 'over') hint(fxBusy() ? 'The fight is over. Space skips the last animations.' : 'The fight is over.', 'warn');
  }

  // ---- actions ----------------------------------------------------------------------------------------------------
  function useArmed(u, t) {
    if (!M) return false;
    let ok = false;
    if (M.mode.kind === 'skill') ok = DD.safe('HUD useSkill', C().useSkill, C(), [u, M.mode.slot, t.x, t.y]);
    else if (M.mode.kind === 'cons') ok = DD.safe('HUD useConsumable', C().useConsumable, C(), [u, M.mode.index, t.x, t.y]);
    if (!ok) { hint('That didn\'t work. ' + invalidReason(u, t), 'bad'); return false; }
    setMove();
    afterAction(u);
    return true;
  }

  function doMove(u, x, y) {
    const ok = DD.safe('HUD move', C().move, C(), [u, x, y]);
    if (!ok) { hint('Can\'t move there.', 'bad'); return false; }
    afterAction(u);
    return true;
  }

  function doInteract(u, ia) {
    if (!M) return false;
    const lock = lockReason();
    if (lock && lock !== 'modal') { lockedFeedback(lock); return false; }
    if (!u || !ia) return false;
    if (num(u.ap) < num(ia.ap, 1)) { hint('Not enough AP: ' + ia.label + ' costs ' + ia.ap + '.', 'bad'); return false; }
    const ok = DD.safe('HUD interact', C().interact, C(), [u, ia.x, ia.y]);
    if (!ok) { hint('Nothing happens. The DM looks smug.', 'bad'); return false; }
    M.hoverIa = null;
    afterAction(u);
    return true;
  }

  function doDeploy(u, x, y) {
    const ok = DD.safe('HUD deployMove', C().deployMove, C(), [u, x, y]);
    if (!ok) { hint('Can\'t deploy there.', 'bad'); return false; }
    sound('step');
    afterAction(u, true);
    return true;
  }

  function doUndo() {
    if (!M) return;
    const lock = lockReason();
    if (lock && lock !== 'modal') { lockedFeedback(lock); return; }
    if (!C().canUndo()) { hint('Nothing to undo — only the last move, and only if nothing else happened since.', 'bad'); return; }
    const s = S();
    const id = s.undo && s.undo.unitId;
    if (DD.safe('HUD undo', C().undo, C())) {
      if (id) M.sel = id;
      setMove();
      afterAction(byId(id), true);
    }
  }

  function doEndTurn(fromKey) {
    if (!M) return false;
    const s = S();
    // the dice moment: Space / click skips it (only it: the turns after it still play)
    if (M.moment) { skipMoment(); return false; }
    const lock = lockReason();
    // Space always skips playing animations — also the final ones of a finished fight (the hand-off waits for them).
    if (fxBusy() && (lock === 'busy' || lock === 'over')) { skipAnimations(); return false; }
    if (lock && lock !== 'modal') { lockedFeedback(lock); return false; }
    if (now() < M.graceUntil) return false;
    if (s && deploying(s)) return doRoll();
    if (!s || s.phase !== 'player') return false;
    setMove();
    M.pinned = null;
    const ok = DD.safe('HUD endTurn', C().endTurn, C());
    if (!ok && fromKey !== 'silent') hint('Can\'t end the turn right now.', 'bad');
    M.dirty = true;
    if (!fxBusy()) refresh(); else { M.gen++; refreshView(); }
    return !!ok;
  }

  /** "Roll for Initiative!": ends deployment (DD.Combat.rollInitiative); the dice moment plays from the FX queue. */
  function doRoll() {
    if (!M) return false;
    const s = S();
    const lock = lockReason();
    if (lock && lock !== 'modal') { lockedFeedback(lock); return false; }
    if (!s || !deploying(s) || s.order) return false;
    setMove();
    M.pinned = null;
    sound('click');
    const ok = DD.safe('HUD rollInitiative', C().rollInitiative, C());
    if (!ok) { hint('The dice refuse to roll. (No fight to start.)', 'bad'); return false; }
    M.trackFresh = true;
    M.dirty = true;
    if (!fxBusy()) refresh(); else refreshView();
    return true;
  }

  function skipAnimations() {
    if (!DD.FX || !fxBusy()) return;
    DD.safe('HUD skip', DD.FX.flush, DD.FX);
    tick();
  }

  /** After a player action: refresh now (or when the animation ends) and remember to auto-advance a spent hero. */
  function afterAction(u, quiet) {
    if (!M) return;
    if (u && !quiet && num(u.ap) <= 0) M.autoAdvance = u.id;
    M.dirty = true;
    if (!fxBusy()) refresh();
    else { M.gen++; refreshView(); }
  }

  function autoAdvance() {
    const id = M.autoAdvance;
    M.autoAdvance = null;
    if (!id || M.sel !== id) return;
    const u = byId(id);
    if (u && controllable(u) && num(u.ap) > 0) return;
    const next = partyUnits().filter(function (x) { return x.id !== id && controllable(x) && num(x.ap) > 0 && !stunned(x); })[0];
    if (next) { M.sel = next.id; setMove(); centerIfOffscreen(next); }
  }

  // ---- board input ------------------------------------------------------------------------------------------------
  function onHover(p) {
    if (!M) return;
    M.hover = p && p.x !== undefined && p.x !== null ? { x: p.x, y: p.y, unitId: p.unitId || null } : null;
    noteInput();
    computeOverlay();
    renderInspect();
    renderHint();
    updateDmPeek();
    highlightChip();
  }

  function onTileClick(p) {
    if (!M || !p || p.x === undefined || p.x === null) return;
    const s = S();
    if (!s) return;
    if (M.endHandled && M.endSkip) { M.endSkip(); return; }
    const lock = lockReason();
    if (lock && lock !== 'modal') { lockedFeedback(lock); return; }
    M.hover = { x: p.x, y: p.y, unitId: p.unitId || null };
    const u = selectedUnit();
    const clicked = p.unitId ? byId(p.unitId) : DD.Grid.unitAt(p.x, p.y);
    if (M.mode.kind !== 'move') { clickArmed(u, p, clicked); return; }
    clickMove(s, u, p, clicked);
  }

  function clickArmed(u, p, clicked) {
    if (!u) return;
    const t = aimTarget(u, p);
    if (t) { useArmed(u, t); return; }
    const tg = (armedDef() || {}).target || {};
    const friendlyFilter = tg.filter === 'ally' || tg.filter === 'allyOrSelf' || tg.filter === 'downedAlly' || tg.filter === 'any' || tg.filter === 'notSelf';
    if (clicked && clicked !== u && clicked.side === 'hero' && controllable(clicked) && !friendlyFilter) { select(clicked.id, { bark: true }); return; }
    hint(invalidReason(u, p), 'bad');
  }

  function clickMove(s, u, p, clicked) {
    const k = key(p.x, p.y);
    if (clicked && clicked.side === 'hero' && clicked !== u && !clicked.dead) {
      if (u && p.shift && deployable(u) && deployable(clicked)) { doDeploy(u, clicked.x, clicked.y); return; }
      if (selectable(clicked)) { select(clicked.id, { bark: true }); return; }
      if (clicked.downed && u && controllable(u)) {
        const ia = interactionsOf(u).filter(function (i) { return i.kind === 'helpUp' && i.unitId === clicked.id; })[0];
        if (ia) { doInteract(u, ia); return; }
        hint(clicked.name + ' is down. Move next to them and use Help Up (2 AP).', 'warn');
        return;
      }
      if (!clicked.downed) notTheirTurn(clicked);
      return;
    }
    if (clicked && clicked.side !== 'hero' && !clicked.dead) {
      M.pinned = M.pinned === clicked.id ? null : clicked.id;
      sound('click');
      renderInspect();
      computeOverlay();
      return;
    }
    if (deploying(s)) {
      if (u && deployable(u) && inList(s.deploy.tiles, p) && !clicked) { doDeploy(u, p.x, p.y); return; }
      if (M.pinned) { M.pinned = null; renderInspect(); }
      if (clicked !== u) hint(inList(s.deploy.tiles, p) ? 'Select a hero in the green zone first.' : 'Deployment: heroes can only be placed on green tiles. 🎲 Roll for initiative (Space) to start the fight.', 'warn');
      return;
    }
    if (!u || !controllable(u)) { if (!u) hint('Select a hero first (click one or press Tab).', 'warn'); return; }
    const ia = interactionsOf(u).filter(function (i) { return i.x === p.x && i.y === p.y && i.kind !== 'helpUp'; })[0];
    if (ia) { doInteract(u, ia); return; }
    const e = reachOf(u).get(k);
    if (e) { doMove(u, p.x, p.y); return; }
    if (M.pinned) { M.pinned = null; renderInspect(); }
    if (clicked === u) return;
    if (num(u.ap) < moveCost(u)) hint(u.name + ' has no AP left to move.', 'bad');
    else if (hasSt(u, 'root')) hint(u.name + ' is rooted and can\'t move.', 'bad');
    else if (stunned(u)) hint(u.name + ' is stunned.', 'bad');
    else if (DD.Grid.isWalkable(p.x, p.y, u)) hint('Too far: ' + u.name + ' moves ' + effMov(u) + ' per move action.', 'bad');
    else hint('Can\'t stand there.', 'bad');
  }

  function onRightClick() {
    if (!M) return;
    if (M.mode.kind !== 'move') { setMove(); sound('click'); refreshView(); return; }
    if (M.pinned) { M.pinned = null; renderInspect(); }
  }

  /** Screen-level key handler (runs before DD.Input; returning true consumes the key). */
  function onKey(e) {
    if (!M || e.ctrlKey || e.metaKey || e.altKey) return false;
    const k = e.key;
    const lower = String(k || '').toLowerCase();
    if (M.endHandled && M.endSkip && (k === ' ' || k === 'Enter')) { if (!e.repeat) M.endSkip(); return true; }
    if (M.moment && (k === ' ' || k === 'Spacebar' || k === 'Enter' || k === 'Escape')) { if (!e.repeat) skipMoment(); return true; }
    if (k === 'Escape') {
      if (M.mode.kind !== 'move') onRightClick();
      else if (M.pinned) onRightClick();
      else openMenu();
      return true;
    }
    if (k === ' ' || k === 'Spacebar') { if (!e.repeat) doEndTurn('key'); return true; }
    if (k === 'Tab') { if (canSelectNow()) cycle(e.shiftKey ? -1 : 1); else lockedFeedback(lockReason()); return true; }
    if (e.repeat) return SKILL_KEYS.indexOf(k) >= 0 || CONS_KEYS.indexOf(k) >= 0 || lower === 'z' || lower === 'e' || lower === 't';
    if (lower === 't') { setThreatSticky(!M.threatSticky); return true; }
    if (lower === 'z') { doUndo(); return true; }
    if (lower === 'e') {
      const u = selectedUnit();
      const ia = u && controllable(u) ? interactionsOf(u)[0] : null;
      if (ia) doInteract(u, ia); else hint('Nothing to interact with next to ' + (u ? u.name : 'nobody') + '.', 'bad');
      return true;
    }
    if (k === 'Enter') {
      const u = selectedUnit();
      if (M.mode.kind !== 'move' && u) { const t = aimTarget(u, M.hover); if (t) { useArmed(u, t); return true; } }
      return false;
    }
    const si = SKILL_KEYS.indexOf(k);
    if (si >= 0) { pressSlot(si); return true; }
    const ci = CONS_KEYS.indexOf(k);
    if (ci >= 0) { if (consumableMax(S()) > ci) pressConsumable(ci); return true; }
    return false;
  }

  // ---- log, narration, ribbons ------------------------------------------------------------------------------------
  function lastFxId() {
    const F = DD.FX;
    if (!F) return 0;
    if (F.queue.length) return F.queue[F.queue.length - 1].id || 0;
    return 0;
  }

  /**
   * One log line (revealed in step with playback). v2: lines logged during a unit's turn get a "Goblin Grunt's turn"
   * header the first time that turn shows anything — turns where nothing happened leave no trace.
   */
  function appendLog(entry, instant, turn) {
    const E = M.els;
    const list = E.logList;
    const stick = list.scrollTop + list.clientHeight >= list.scrollHeight - 12;
    const empty = list.querySelector('.hl-empty');
    if (empty) empty.remove();
    if (entry.round !== M.logRound && entry.round > 0) {
      M.logRound = entry.round;
      M.logTurnShown = null;
      list.appendChild(el('div.hl-round', null, 'Round ' + entry.round));
    }
    if (turn && turn.turn !== M.logTurnShown) {
      M.logTurnShown = turn.turn;
      list.appendChild(el('div.hl-turn' + (turn.foe ? '.foe' : ''), null, (turn.foe ? '👹 ' : '⚔️ ') + turn.name + '\'s turn'));
    } else if (!turn) M.logTurnShown = null;
    // noise: a pack of arrivals each logs "X rolls initiative: 12 (joins next round)." — one summary line instead
    const join = /^(.+) rolls initiative: (-?\d+) \(joins next round\)\.$/.exec(String(entry.text || ''));
    if (join) {
      const last = list.lastElementChild;
      if (last && last.classList.contains('join')) {
        last.dataset.n = String(num(last.dataset.n) + 1);
        last.textContent = '🎲 Joining next round: ' + last.dataset.list + ', ' + join[1] + ' (' + join[2] + ')';
        last.dataset.list = last.textContent.replace('🎲 Joining next round: ', '');
        if (stick) list.scrollTop = list.scrollHeight;
        return;
      }
      const line = el('div.log-line.system.join', null, '🎲 Joining next round: ' + join[1] + ' (' + join[2] + ')');
      line.dataset.n = '1';
      line.dataset.list = join[1] + ' (' + join[2] + ')';
      if (instant) line.style.animation = 'none';
      list.appendChild(line);
      if (stick) list.scrollTop = list.scrollHeight;
      return;
    }
    const cls = entry.cls || 'system';
    const line = cls === 'narrator'
      ? el('div.log-line.narrator', null, el('span.hl-dm', null, 'DM'), el('span', null, entry.text))
      : el('div.log-line.' + cls, null, entry.text);
    if (instant) line.style.animation = 'none';
    list.appendChild(line);
    while (list.children.length > LOG_MAX) list.removeChild(list.firstChild);
    if (stick) list.scrollTop = list.scrollHeight;
    // the initiative moment shows its DM line in the tray: no second copy in the caption
    if (cls === 'narrator' && !instant && entry.text !== M.momentLine) showDm(entry.text);
  }

  function revealLog() {
    if (!M || !M.logQueue.length) return;
    const q = DD.FX ? DD.FX.queue : [];
    const head = q.length ? q[0].id : Infinity;
    while (M.logQueue.length && M.logQueue[0].fxId < head) { const x = M.logQueue.shift(); appendLog(x.entry, false, x.turn); }
  }

  function showDm(text) {
    const E = M.els;
    E.dmText.textContent = text;
    E.dm.classList.add('show');
    clearTimeout(M.dmTimer);
    M.dmTimer = later(function () { if (M) { E.dm.classList.remove('show'); E.dm.classList.remove('peek'); } }, Math.min(9000, 3200 + String(text).length * 45));
    placeDm();
  }

  /**
   * Screen boxes of the units (sprite + HP widget, plus the intent bubble of an enemy that has intents), each with
   * a weight: covering an intent bubble costs 4, any other unit 1. Sizes follow the camera zoom.
   */
  function unitBoxes() {
    const s = S();
    const z = num(DD.Render.camera && DD.Render.camera.zoom, 1) || 1;
    const out = [];
    (s ? s.units : []).forEach(function (u) {
      if (u.dead) return;
      const q = DD.Render.worldToScreen(u.x, u.y);
      const big = u.tier === 'boss' || u.isBoss;
      const bubble = u.side === 'enemy' && !u.downed && (u.intents || []).length > 0;
      const h = (big ? 120 : 62) * z + 22 + (bubble ? 30 : 0);
      const hw = Math.max(bubble ? 46 : 24, (big ? 40 : 22) * z);
      out.push({ x0: q.x - hw, x1: q.x + hw, y0: q.y - h, y1: q.y + 8 * z, w: bubble ? 4 : 1 });
    });
    return out;
  }
  function coverCost(r, boxes) {
    return boxes.reduce(function (a, b) { return a + (b.x1 > r.left && b.x0 < r.right && b.y1 > r.top && b.y0 < r.bottom ? b.w : 0); }, 0);
  }

  /**
   * Keep the DM caption off the board's busy spots (a boss telegraphing from the back row sits right under it):
   * under the objective by default, or low — above the hint bar — when that hides fewer units / intent bubbles.
   */
  function placeDm(force) {
    if (!M || (DD.headless && !force) || !DD.Render || typeof DD.Render.worldToScreen !== 'function' || !S()) return;
    const E = M.els;
    if (!E.dm.classList.contains('show')) return;
    const boxes = unitBoxes();
    const at = function (where) {
      if (where === 'low') { if (E.dm.parentNode !== E.barWrap) E.barWrap.insertBefore(E.dm, E.hint); }
      else if (E.dm.parentNode !== E.center) E.center.appendChild(E.dm);
      return coverCost(E.dm.getBoundingClientRect(), boxes);
    };
    const top = at('top');
    let best = 'top';
    if (top > 0 && at('low') < top) best = 'low';
    at(best);
    M.dmPlace = best;
    updateDmPeek();
  }

  /** The caption fades while the pointer is on a tile (or a unit's sprite) underneath it. */
  function updateDmPeek() {
    if (!M) return;
    const E = M.els;
    let peek = false;
    if (E.dm.classList.contains('show') && M.hover && !DD.headless && DD.Render && typeof DD.Render.worldToScreen === 'function') {
      const r = E.dm.getBoundingClientRect();
      const q = DD.Render.worldToScreen(M.hover.x, M.hover.y);
      const reach = M.hover.unitId ? 70 * (num(DD.Render.camera && DD.Render.camera.zoom, 1) || 1) : 6;
      peek = q.x > r.left - 8 && q.x < r.right + 8 && q.y + 12 > r.top && q.y - reach < r.bottom;
      // ... or while the inspect panel the player is reading sits under it
      if (!peek && !E.inspect.classList.contains('hud-hidden')) {
        const ir = E.inspect.getBoundingClientRect();
        peek = ir.right > r.left && ir.left < r.right && ir.bottom > r.top && ir.top < r.bottom;
      }
    }
    if (E.dm.classList.contains('peek') !== peek) E.dm.classList.toggle('peek', peek);
  }

  // ---- idle DM (narration key idle_dm) ---------------------------------------------------------------------------
  function noteInput() { if (M) { M.idleSince = now(); M.idleNext = 0; } }
  /** After IDLE_MS without input in the player phase the DM gets bored: an idle_dm line in the caption and the log,
   *  then at most one more every 2 × IDLE_MS while the table stays quiet. `at` overrides the clock (tests). */
  function idleCheck(at) {
    if (!M || lockReason() !== null) return false;
    const t = at === undefined ? now() : at;
    if (t - M.idleSince < IDLE_MS || t < M.idleNext) return false;
    const line = DD.UI.narrate('idle_dm', {}, IDLE_FALLBACK);
    if (!line) return false;
    M.idleNext = t + IDLE_MS * 2;
    const s = S();
    appendLog({ text: line, cls: 'narrator', round: s ? s.round : 0 });
    return true;
  }

  function ribbon(title, sub, cls, ms, extra, head) {
    const E = M.els;
    E.ribbon.innerHTML = '';
    E.ribbon.className = 'hud-ribbon r-' + (cls || 'player');
    const titleEl = el('div.rb-title', null, title);
    const band = el('div.rb-band', { style: { '--rd': ((ms || 1500) / 1000) + 's' } }, head ? el('div.rb-head', null, head, titleEl) : titleEl, sub ? el('div.rb-sub', null, sub) : null, extra || null);
    E.ribbon.appendChild(band);
    clearTimeout(M.ribbonTimer);
    if (ms > 0) M.ribbonTimer = later(function () { if (M && band.parentNode) band.remove(); }, ms + 100);
  }

  /** A hero's turn starts: a short non-blocking ribbon with its portrait, round and who acts after it. */
  function turnRibbon(u, s) {
    if (!u || DD.headless) return;
    const n = upcoming()[0];
    const ap = num(u.ap);
    const sub = 'Round ' + s.round + ' · ' + ap + ' AP' + (n ? ' · then ' + n.name : '');
    ribbon(u.name + '\'s Turn', sub, 'turn', 1250, null, DD.UI.portrait(u.defId, 34, { fallback: '🎲' }));
  }

  // ---- the initiative dice moment (hosted for fx_render's 'initiative' marker) -------------------------------------
  /** fx_render asks: show a moment for this roll? (rolled dice only, and only when someone can see it) */
  function momentWants(evt) {
    return !!M && (!DD.headless || !!M.forceMoments) && !!evt && Array.isArray(evt.order) && evt.order.some(function (r) { return r && r.roll > 0; });
  }
  /** Build the dice tray for an 'initiative' marker; returns how long playback waits for it (ms at speed 1). */
  function startMoment(evt) {
    if (!M) return 0;
    const E = M.els;
    const s = S();
    const order = (evt.order || []).filter(function (r) { return r && byId(r.unitId); });
    const n = order.length;
    if (!n) return 0;
    // the table as it stands (heroes in party order, then the monsters), before the d20s sort it
    const pos = {};
    (s ? s.units : []).forEach(function (u, i) { pos[u.id] = i; });
    const unsorted = order.slice().sort(function (a, b) {
      return ((a.side === 'hero' ? 0 : 1) - (b.side === 'hero' ? 0 : 1)) || (num(pos[a.unitId]) - num(pos[b.unitId])) || (num(a.k) - num(b.k));
    });
    const line = M.rollLine || DD.UI.narrate('initiative', { hero: (order.filter(function (r) { return r.side === 'hero'; })[0] || {}).name || 'the party' }, INIT_LINES);
    E.rollTray.innerHTML = '';
    const cw = n <= 8 ? 5.6 : n <= 11 ? 5 : Math.max(3.9, 56 / n);
    E.rollTray.style.setProperty('--cw', cw + 'rem');
    E.rollTray.style.setProperty('--n', String(n));
    const row = el('div.rt-row');
    const cards = unsorted.map(function (r, i) {
      const u = byId(r.unitId);
      const d = defOf(u) || {};
      const foe = r.side !== 'hero';
      const die = el('span.rt-die', null, '?');
      const mod = el('span.rt-mod', null, signed(r.init));
      const tot = el('span.rt-total', null, String(r.total));
      const rank = el('span.rt-rank', null, ordinal(order.indexOf(r) + 1));
      const nat = r.roll === 20 ? el('span.rt-nat', null, 'NAT 20') : r.roll === 1 ? el('span.rt-nat.one', null, 'NAT 1') : null;
      const card = el('div.rt-card' + (foe ? '.foe' : ''), { style: { '--tc': foe ? (u.tier === 'boss' || u.isBoss ? '#ff7a4a' : '#e2483c') : (d.color || '#c9a24f') } },
        rank, DD.UI.portrait(u.defId, 40, { fallback: foe ? '👹' : '🐾' }), el('span.rt-name', null, u.name + (r.k > 0 ? ' (2nd)' : '')),
        el('span.rt-dice', null, die, mod), tot);
      const slot = el('div.rt-slot', null, card);
      slot.style.transform = 'translateX(' + (i * 100) + '%)';
      row.appendChild(slot);
      return { r: r, from: i, to: order.indexOf(r), slot: slot, card: card, die: die, nat: nat, land: n > 1 ? 0.14 + 0.3 * i / (n - 1) : 0.22, landed: false };
    });
    E.rollTray.appendChild(el('div.rt-title', null, '🎲 Roll for Initiative!'));
    E.rollTray.appendChild(row);
    E.rollTray.appendChild(el('div.rt-dm', null, el('span.dm-badge', null, 'DM'), el('span', null, line)));
    E.rollTray.appendChild(el('div.rt-skip', null, 'Click or Space to skip'));
    E.rollTray.classList.remove('hud-hidden');
    E.rollScrim.classList.remove('hud-hidden');
    E.rollTray.style.opacity = '0';
    E.rollScrim.style.opacity = '0';
    if (E.dmText.textContent === line) E.dm.classList.remove('show');
    M.moment = { evt: evt, cards: cards, n: n, line: line, p: 0 };
    M.momentLine = line;
    M.rollLine = null;
    sound('turn');
    refreshView();
    return Math.min(3900, MOMENT_MS + 45 * n);
  }

  /** Advance the tray from the marker's playback progress (it drives the timing: speed, freezes and skips). */
  function tickMoment() {
    const mo = M && M.moment;
    if (!mo) return;
    const evt = mo.evt;
    const playing = !!DD.FX && DD.FX.active.indexOf(evt) >= 0 && !evt.done;
    if (!playing) { endMoment(); return; }
    const p = U.clamp(num(evt.elapsed) / Math.max(1, num(evt.ms, 1)), 0, 1);
    mo.p = p;
    const E = M.els;
    const fade = p < 0.06 ? p / 0.06 : p > 0.9 ? Math.max(0, 1 - (p - 0.9) / 0.1) : 1;
    E.rollTray.style.opacity = fade.toFixed(3);
    E.rollScrim.style.opacity = fade.toFixed(3);
    const sortK = U.clamp((p - 0.56) / 0.2, 0, 1);
    const ease = sortK < 0.5 ? 2 * sortK * sortK : 1 - Math.pow(-2 * sortK + 2, 2) / 2;
    mo.cards.forEach(function (c) {
      if (p < c.land) {
        c.die.textContent = String(1 + Math.floor(Math.random() * 20));
        c.die.style.transform = 'rotate(' + Math.round((p * 1800 + c.from * 47) % 360) + 'deg) scale(1.08)';
      } else if (!c.landed) {
        c.landed = true;
        c.die.textContent = String(c.r.roll);
        c.die.style.transform = '';
        c.die.classList.add('landed');
        if (c.r.roll === 20) c.die.classList.add('nat20');
        if (c.r.roll === 1) c.die.classList.add('nat1');
        if (c.nat) c.card.appendChild(c.nat);
      }
      c.card.classList.toggle('math', p >= c.land + 0.05);
      const at = c.from + (c.to - c.from) * ease;
      const lift = Math.sin(Math.PI * sortK) * 0.7 * (c.to < c.from ? -1 : c.to > c.from ? 1 : 0);
      c.slot.style.transform = 'translateX(' + (at * 100).toFixed(2) + '%) translateY(' + lift.toFixed(2) + 'rem)';
      c.card.classList.toggle('ranked', p >= 0.7);
      c.card.classList.toggle('first', p >= 0.72 && c.to === 0);
    });
  }

  /** Skip the dice moment (click / Space): the marker finishes on the next frame, the tracker takes over. */
  function skipMoment() {
    const mo = M && M.moment;
    if (!mo) return;
    mo.evt.elapsed = Math.max(num(mo.evt.elapsed), num(mo.evt.ms));
    endMoment();
  }
  function endMoment() {
    if (!M || !M.moment) return;
    M.moment = null;
    const E = M.els;
    E.rollTray.classList.add('hud-hidden');
    E.rollScrim.classList.add('hud-hidden');
    E.rollTray.innerHTML = '';
    M.trackFresh = true;
    M.trackSig = '';
    M.topSig = '';
    refreshView();
  }

  // ---- threat shading (hold Alt / T toggles / the 👁 button) ----------------------------------------------------------
  function threatChanged() {
    if (!M) return;
    M.gen++;
    computeOverlay();
    renderParty();
    renderInspect();
    renderHint();
    if (M.els.threatBtn) M.els.threatBtn.classList.toggle('on', threatOn());
  }
  function setThreatSticky(on) {
    if (!M) return;
    M.threatSticky = !!on;
    DD.Storage.set('hud', Object.assign({}, DD.Storage.get('hud', {}), { threat: M.threatSticky }));
    sound('click');
    threatChanged();
  }
  function setThreatHold(on) {
    if (!M || !!M.threatHold === !!on) return;
    M.threatHold = !!on;
    threatChanged();
  }

  // ---- end of combat ------------------------------------------------------------------------------------------------
  function checkEnd() {
    const s = S();
    if (!M || !s || !s.result || M.endHandled) return;
    if (fxBusy()) return;
    M.endHandled = true;
    setMove();
    M.pinned = null;
    const ov = overlay();
    if (ov) { clearOverlay(ov); ov.selectedId = null; }
    const win = s.result === 'victory';
    const runFight = isRunFight(s);
    sound(win ? 'victory' : 'defeat');
    const heroes = (s.units || []).filter(function (u) { return u.kind === 'hero'; });
    const standing = heroes.filter(active).length;
    // [integration fix] a defeat with heroes standing is a lost objective (protect fights), not a TPK
    const lostObjective = !win && standing > 0;
    const sub = win ? (standing === heroes.length ? 'Flawless-ish. Nobody even needed a nap.' : standing + ' of ' + heroes.length + ' heroes still standing.')
      : lostObjective ? 'The heroes live. The objective does not.' : 'Total party kill. The DM is writing this one down.';
    ribbon(win ? 'Victory!' : lostObjective ? 'Objective Failed' : 'TPK', sub, (win ? 'victory' : 'defeat') + ' r-end', 0, el('div.rb-click', null, runFight ? (win ? 'Click to collect loot' : 'Click to continue') : 'Click to continue'));
    renderTop();
    renderBar();
    renderHint();
    const speed = Math.max(0.5, num(DD.FX && DD.FX.speed, 1));
    const delay = DD.headless ? 0 : (autoplayOn() ? 900 : 2600) / speed;
    let done = false;
    M.endSkip = function () {
      if (done) return;
      done = true;
      clearTimeout(M.endTimer);
      handoff(s, runFight);
    };
    M.endTimer = later(function () { if (M) M.endSkip(); }, delay);
  }

  function handoff(s, runFight) {
    if (!M || S() !== s) return;
    M.endSkip = null;
    if (runFight) {
      if (typeof DD.Run.inCombat !== 'function' || DD.Run.inCombat()) DD.safe('Run.finishCombat', DD.Run.finishCombat, DD.Run, [s.result, s]);
      else if (typeof DD.Run.resume === 'function') DD.safe('Run.resume', DD.Run.resume, DD.Run);
      return;
    }
    showResultModal(s);
  }

  function fightStats(s) {
    let dealt = 0, taken = 0, kills = 0, heals = 0;
    const st = (s.stats && s.stats.units) || {};
    s.units.forEach(function (u) {
      if (u.side !== 'hero') return;
      const x = st[u.id] || {};
      dealt += num(x.dmg); taken += num(x.taken); kills += num(x.kills); heals += num(x.heals);
    });
    return { rounds: s.round, dealt: Math.round(dealt), taken: Math.round(taken), kills: kills, heals: Math.round(heals), hype: num(s.stats && s.stats.hypeGained), env: num(s.stats && s.stats.envKills) };
  }

  function showResultModal(s) {
    const win = s.result === 'victory';
    const f = fightStats(s);
    const narr = DD.UI.narrate(win ? 'victory' : 'defeat', {}, win
      ? ['The dice were kind today. Suspiciously kind.', 'Victory! The DM quietly tears up page 47 of his notes.']
      : ['Everyone is down. The DM offers a "tactical retcon".', 'TPK. The DM pretends to be sad about it.']);
    const stat = function (v, label) { return el('div.hr-stat', null, el('b', null, String(v)), el('span', null, label)); };
    const body = el('div.hud-result', null, DD.UI.narration(narr),
      el('div.hr-grid', null, stat(f.rounds, 'Rounds'), stat(f.kills, 'Kills'), stat(f.dealt, 'Damage dealt'), stat(f.taken, 'Damage taken'), stat(f.heals, 'Healed'), stat(f.hype, 'Hype gained')),
      el('div.hi-line', { style: { color: 'var(--text-3)' } }, 'Debug fight (no campaign run): nothing is saved.'));
    DD.UI.modal({
      title: win ? 'Victory!' : 'Defeat', icon: win ? '🏆' : '💀', size: 'md', closable: false, body: body,
      buttons: [
        { label: 'Title', cls: 'ghost', icon: '🏰', onClick: function () { DD.UI.show('title'); } },
        { label: 'Restart Fight', primary: true, icon: '🎲', hotkey: 'r', onClick: function () { restartFight(); } },
      ],
    });
  }

  function restartFight() {
    if (DD.Main && typeof DD.Main.restartCombat === 'function') { DD.Main.restartCombat(); return; }
    DD.UI.show('title');
  }

  // ---- menu -----------------------------------------------------------------------------------------------------------
  function openMenu() {
    if (!M || (DD.UI.modalCount && DD.UI.modalCount() > 0)) return;
    const s = S();
    const runFight = isRunFight(s);
    const st = settings();
    const seg = el('div.segmented');
    [0.5, 1, 1.5, 2, 3].forEach(function (v) {
      const b = DD.UI.button(v + '×', function () {
        st.animSpeed = v;
        seg.querySelectorAll('.seg').forEach(function (x) { x.classList.toggle('active', +x.dataset.v === v); });
        applySettings();
        if (M) M.els.speed.querySelector('.btn-label').textContent = speedLabel();
      }, { cls: 'seg' + ((+st.animSpeed || 1) === v ? ' active' : '') });
      b.dataset.v = String(v);
      seg.appendChild(b);
    });
    const toggle = function (on, fn) {
      const t = el('button.toggle', { type: 'button', role: 'switch', class: on ? 'on' : '' }, el('span.tg-knob'), el('span.tg-on', null, 'On'), el('span.tg-off', null, 'Off'));
      t.addEventListener('click', function () { on = !on; t.classList.toggle('on', on); sound('click'); fn(on); applySettings(); });
      return t;
    };
    const row = function (label, desc, ctl) { return el('div.hm-row', null, el('div', null, el('div.hm-label', null, label), desc ? el('div.hm-desc', null, desc) : null), ctl); };
    const controls = [['Left click', 'Select · move · use · confirm'], ['Right click / Esc', 'Cancel targeting · unpin'], ['1 – 6', 'Basic, skills, signature'],
      ['7 – 0', 'Consumables'], ['E', 'Interact / Help Up'], ['Tab', 'Next unit of this turn (hero + summons)'], ['Space', 'Roll initiative · end turn · skip animations'],
      ['Z', 'Undo last move'], ['Hold Alt / T', 'Threat shading: where enemies can reach'],
      ['WASD / drag', 'Pan the camera'], ['Wheel', 'Zoom'], ['F', 'Recenter the board']];
    const body = el('div.hud-menu', null,
      row('Animation speed', 'Applies immediately.', seg),
      row('Sound effects', null, toggle(st.sfx !== false, function (on) { st.sfx = on; })),
      row('Screen shake', null, toggle(st.shake !== false, function (on) { st.shake = on; })),
      el('div.hm-controls', null, controls.map(function (c) { return [el('span.k', null, c[0]), el('span', null, c[1])]; })),
      el('div.hm-desc', null, runFight ? 'Quitting keeps your run: Continue on the title screen resumes this fight (restarting it if the game was closed).' : 'Debug fight: nothing here is saved.'));
    const buttons = [];
    if (runFight) {
      buttons.push({ label: 'Abandon Run', cls: 'danger-ghost', onClick: function () { confirmAbandon(); } });
      buttons.push({ label: 'Quit to Title', cls: 'ghost', onClick: function () { DD.UI.show('title'); } });
    } else {
      buttons.push({ label: 'Title', cls: 'ghost', onClick: function () { DD.UI.show('title'); } });
      buttons.push({ label: 'Restart Fight', cls: 'ghost', onClick: function () { restartFight(); } });
    }
    buttons.push({ label: 'Resume', primary: true, cancel: true });
    DD.UI.modal({ title: 'Paused (the DM refills his soda)', icon: '⏸️', size: 'md', body: body, buttons: buttons });
  }

  function confirmAbandon() {
    later(function () {
      DD.UI.confirm('Abandon this run? The party is written out of the campaign and the run counts as a loss.', { title: 'Abandon Run?', yes: 'Abandon', no: 'Keep playing', danger: true, icon: '🏳️' }).then(function (ok) {
        if (!ok) return;
        if (DD.Run && typeof DD.Run.abandon === 'function') DD.safe('Run.abandon', DD.Run.abandon, DD.Run);
        DD.UI.show('title');
      });
    }, 0);
  }

  // ---- refresh & loop ---------------------------------------------------------------------------------------------------
  /** Re-read the combat state: settle the turn if the animations are done, then selection, panels and overlay. */
  function refresh() {
    if (!M) return;
    const s = S();
    if (!s) return;
    if (s.id !== M.stateId) adoptState(s);
    M.dirty = false;
    M.gen++;
    if (!fxBusy()) settle(s);
    validateSelection();
    refreshView();
    checkEnd();
  }

  /** Redraw panels + overlay from the current memoized data (cheap; used on hover/mode changes). */
  function refreshView() {
    if (!M || !S()) return;
    renderTop();
    renderTracker();
    renderParty();
    renderBar();
    renderInspect();
    computeOverlay();
    renderHint();
    M.root.classList.toggle('hud-locked', !!shownLock());
    if (M.els.dm.classList.contains('show')) placeDm();
  }

  /** The FX are idle: the AI turns are over on screen too. Hand control to the hero whose turn it is. */
  function settle(s) {
    M.enemyPlayback = false;
    if (M.turnPending && s.phase === 'player' && !s.result) {
      M.turnPending = 0;
      M.graceUntil = DD.headless ? 0 : now() + GRACE_MS;
      M.autoAdvance = null;
      noteInput(); // the idle clock starts with the turn
      // v2: the acting hero is selected (another hero's card only inspects)
      const cur = selectedUnit();
      if (!cur || !controllable(cur) || num(cur.ap) <= 0 || (currentUnit() && cur.id !== currentUnit().id && cur.ownerId !== currentUnit().id)) {
        const d = defaultSelection(); M.sel = d ? d.id : null; setMove();
      }
      M.pinned = null;
      const u = currentUnit();
      if (u) followUnit(u);
      turnRibbon(u, s);
      sound('turn');
    } else if (deploying(s) && M.deployPending) {
      M.deployPending = false;
      ribbon('Deployment', 'Arrange the party in the green zone, then roll for initiative.', 'deploy', 2200);
    } else if (M.autoAdvance) autoAdvance();
  }

  /** The turn on screen changed (AI playback reached a 'turn' marker): tracker, pill, ring, camera follow. */
  function watchShownTurn() {
    const u = M.moment ? null : shownTurnUnit();
    const id = u ? u.id + ':' + (shownTurn() || {}).turn : '';
    if (id === M.shownTurnSig) return;
    M.shownTurnSig = id;
    renderTop();
    renderTracker();
    renderParty();
    const ov = overlay();
    if (ov) ov.turnUnitId = u ? u.id : null;
    if (u && (M.enemyPlayback || fxBusy())) followUnit(u);
    renderHint();
  }

  function tick() {
    if (!M) return;
    const busy = fxBusy();
    if (M.moment) tickMoment();
    if (busy !== M.busy) {
      M.busy = busy;
      M.busySince = now();
      if (!busy) refresh();
      else refreshView();
    }
    M.root.classList.toggle('hud-busy', busy && now() - M.busySince > BUSY_DIM_MS);
    revealLog();
    if (busy || M.liveDirty) updateLive();
    if (busy) watchShownTurn();
    if (!busy && M.dirty) refresh();
    if (M.hintMsg && now() >= M.hintMsg.until) renderHint();
    if (!busy) idleCheck();
    // the camera settles and units walk while a caption shows: keep it off them (a few checks a second)
    if (M.els.dm.classList.contains('show') && now() >= M.dmCheckAt) { M.dmCheckAt = now() + 400; placeDm(); }
  }

  /** Per-frame cheap updates while animations play: HP/Block bars follow unit.vis. */
  function updateLive() {
    M.liveDirty = false;
    const s = S();
    if (!s) return;
    partyUnits().forEach(function (u) { const c = M.cards[u.id]; if (c) c.hp.update(u); });
    if (M.inspectHp) { const u = byId(M.inspectHp.id); if (u) M.inspectHp.bar.update(u); }
  }

  function startLoop() {
    stopLoop();
    if (DD.headless) return;
    const step = function () {
      if (!M) return;
      DD.safe('HUD tick', tick);
      if (HEADLESS_UA || document.hidden) M.loopTimer = setTimeout(step, 100);
      else M.loopRaf = requestAnimationFrame(step);
    };
    step();
  }
  function stopLoop() {
    if (!M) return;
    if (M.loopRaf) cancelAnimationFrame(M.loopRaf);
    clearTimeout(M.loopTimer);
    M.loopRaf = 0; M.loopTimer = 0;
  }

  // ---- state adoption, events, mount ----------------------------------------------------------------------------------
  function adoptState(s) {
    M.stateId = s.id;
    M.sel = null;
    setMove();
    M.pinned = null;
    M.hover = null;
    M.cards = {};
    M.partyIds = '';
    M.partyIdsRaw = '';
    M.compactAll = false;
    M.idleSince = now();
    M.idleNext = 0;
    M.barSig = ''; M.topSig = ''; M.inspectSig = null; M.hintSig = null; M.hypeShown = null; M.goldShown = null;
    M.trackSig = ''; M.shownTurnSig = null; M.turns = []; M.logTurn = null; M.logTurnShown = null; M.rollLine = null;
    if (M.moment) { M.moment = null; M.els.rollTray.classList.add('hud-hidden'); M.els.rollScrim.classList.add('hud-hidden'); }
    M.logQueue = [];
    M.logRound = null;
    M.endHandled = false;
    M.endSkip = null;
    clearTimeout(M.endTimer);
    M.enemyPlayback = s.phase === 'enemy';
    M.turnPending = s.phase === 'player' && !s.result ? s.turn || 1 : 0;
    M.deployPending = deploying(s);
    M.els.logList.innerHTML = '';
    const log = s.log || [];
    if (!log.length) M.els.logList.appendChild(el('div.hl-empty', null, 'Nothing has happened yet. Savor it.'));
    log.slice(-LOG_MAX).forEach(function (entry) { appendLog(entry, true); });
    const lastNarr = log.filter(function (e) { return e.cls === 'narrator'; }).pop();
    if (lastNarr && s.round <= 1) showDm(lastNarr.text);
    const d = defaultSelection();
    M.sel = d ? d.id : null;
    // a fight already under way (mounted mid-fight, Continue): the current turn is the first one the HUD knows
    const cur = s.current ? byId(s.current) : null;
    if (cur && s.order) {
      noteTurn({ turn: s.turn, index: s.turnIndex, round: s.round, unitId: cur.id });
      M.turns[M.turns.length - 1].fxId = 0;
      M.logTurn = { turn: num(s.turn), name: cur.name, foe: !playerSide(cur), unitId: cur.id };
    }
    if (DD.Render && typeof DD.Render.resetOverlay === 'function') DD.Render.resetOverlay();
  }

  function subscribe() {
    const on = function (name, fn) { M.offs.push(DD.Events.on(name, function (data) { if (M) fn(data); })); };
    on('combat:start', function (e) { const s = (e && e.state) || S(); if (s && s.id !== M.stateId) { adoptState(s); M.dirty = true; } });
    on('combat:changed', function () { M.dirty = true; M.liveDirty = true; if (!fxBusy()) refresh(); });
    on('combat:log', function (entry) {
      if (!entry) return;
      // lines logged while initiative is being rolled wait for the dice moment (no spoilers in the log)
      const s = S();
      const rolling = !!(s && s.phase === 'initiative');
      M.logQueue.push({ entry: entry, fxId: rolling ? Infinity : lastFxId(), turn: M.logTurn, roll: rolling });
      if (!fxBusy()) revealLog();
    });
    on('combat:end', function () { M.dirty = true; if (!fxBusy()) later(function () { if (M) refresh(); }, 0); });
    // v2 turn flow: every turn start is recorded with its FX marker so the HUD can follow the playback
    on('turn:start', function (e) {
      noteTurn(e);
      const u = e && (e.unit || byId(e.unitId));
      M.logTurn = u ? { turn: num(e.turn), name: u.name, foe: !playerSide(u), unitId: u.id } : null;
      M.dirty = true;
    });
    on('turn:end', function () { M.logTurn = null; });
    on('round:end', function () { M.logTurn = null; });
    on('turn:enemy', function () {
      M.enemyPlayback = true;
      setMove();
      M.pinned = null;
    });
    on('turn:player', function () { const s = S(); M.turnPending = (s && s.turn) || 1; });
    on('initiative:rolled', function () {
      // the DM line the engine just narrated (if any) goes into the dice tray instead of a second caption
      const s = S();
      const log = (s && s.log) || [];
      const last = log[log.length - 1];
      M.rollLine = last && last.cls === 'narrator' ? last.text : null;
      // the roll's log lines appear right after the 'initiative' marker (the event pushed just before this one)
      const after = DD.FX && !DD.FX.instant ? lastFxId() + 1 : 0;
      M.logQueue.forEach(function (x) { if (x.roll) { x.fxId = after; x.roll = false; } });
      M.deployPending = false;
      M.trackSig = '';
      M.dirty = true;
      if (!fxBusy()) revealLog();
    });
    on('initiative:joined', function () { M.dirty = true; M.trackSig = ''; });
    on('windup:start', function () { M.dirty = true; });
    on('windup:cancel', function () { M.dirty = true; });
    on('hype:changed', function () { M.dirty = true; });
    on('input:tileHover', onHover);
    on('input:tileClick', function (p) { if (p && p.button !== undefined && p.button !== 0) return; onTileClick(p); });
    on('input:rightClick', function (p) { if (p && p.key === 'Escape') return; onRightClick(); });
  }

  /** Hold Alt = threat shading (the screen's onKey never sees modifier keys, so window listeners do it). */
  function bindThreatKeys() {
    M.onAltDown = function (e) {
      if (!M || e.key !== 'Alt') return;
      e.preventDefault();
      if (!e.repeat) setThreatHold(true);
    };
    M.onAltUp = function (e) {
      if (!M || e.key !== 'Alt') return;
      e.preventDefault();
      setThreatHold(false);
    };
    M.onBlur = function () { if (M) setThreatHold(false); };
    window.addEventListener('keydown', M.onAltDown, true);
    window.addEventListener('keyup', M.onAltUp, true);
    window.addEventListener('blur', M.onBlur);
  }

  function mount(root) {
    if (M) unmount();
    injectCss();
    if (!S()) {
      root.appendChild(el('div.hud-nofight.panel', null, el('h2', null, 'No fight in progress'), el('div', null, 'The DM forgot to prep an encounter.'),
        DD.UI.button('Back to Title', function () { DD.UI.show('title'); }, { cls: 'primary' })));
      return;
    }
    M = {
      root: root, els: {}, offs: [], cards: {}, memo: { gen: -1, v: {} }, gen: 0,
      stateId: null, sel: null, mode: { kind: 'move' }, hover: null, pinned: null, inspected: null, inspectHp: null,
      hoverSlot: null, hoverIa: null, cardHover: null, trackHover: null, focusUi: null,
      busy: false, busySince: 0, enemyPlayback: false, turnPending: 0, deployPending: false, graceUntil: 0, autoAdvance: null,
      endHandled: false, endSkip: null, endTimer: 0, ribbonTimer: 0, dmTimer: 0,
      dirty: true, liveDirty: true, partyIds: '', partyIdsRaw: '', compactAll: false, barSig: '', topSig: '', inspectSig: null, hintSig: null, hintMsg: null, hypeShown: null,
      idleSince: now(), idleNext: 0, dmPlace: 'top', dmCheckAt: 0,
      logQueue: [], logRound: null, loopRaf: 0, loopTimer: 0,
      // v2
      turns: [], trackSig: '', trackFresh: false, chipHl: undefined, shownTurnSig: null, logTurn: null, logTurnShown: null,
      moment: null, rollLine: null, threatHold: false, threatSticky: !!(DD.Storage.get('hud', {}) || {}).threat,
    };
    buildLayout(root);
    subscribe();
    bindThreatKeys();
    // any input (pointer, wheel, keys — over the board or the panels) restarts the idle clock
    M.onInput = function () { noteInput(); };
    INPUT_EVENTS.forEach(function (n) { window.addEventListener(n, M.onInput, { capture: true, passive: true }); });
    // host the initiative dice moment for fx_render's 'initiative' marker
    if (DD.FXRender && DD.FXRender.moments) DD.FXRender.moments.initiative = MOMENT_HOST;
    adoptState(S());
    M.busy = fxBusy();
    refresh();
    startLoop();
  }

  const MOMENT_HOST = { wants: function (evt) { return momentWants(evt); }, start: function (evt) { return startMoment(evt); } };

  function unmount() {
    if (!M) return;
    stopLoop();
    if (M.onInput) INPUT_EVENTS.forEach(function (n) { window.removeEventListener(n, M.onInput, { capture: true }); });
    if (M.onAltDown) window.removeEventListener('keydown', M.onAltDown, true);
    if (M.onAltUp) window.removeEventListener('keyup', M.onAltUp, true);
    if (M.onBlur) window.removeEventListener('blur', M.onBlur);
    if (DD.FXRender && DD.FXRender.moments && DD.FXRender.moments.initiative === MOMENT_HOST) delete DD.FXRender.moments.initiative;
    M.offs.forEach(function (off) { DD.safe('HUD unsubscribe', off); });
    clearTimeout(M.endTimer); clearTimeout(M.ribbonTimer); clearTimeout(M.dmTimer);
    if (DD.UI && DD.UI.hideTooltip) DD.UI.hideTooltip();
    if (DD.Render && typeof DD.Render.resetOverlay === 'function') DD.Render.resetOverlay();
    M = null;
  }

  // ---- registration + debug/test API ---------------------------------------------------------------------------------
  DD.afterLoad(function () {
    if (!DD.UI || typeof DD.UI.screen !== 'function') return;
    DD.UI.screen('combat', {
      scene: 'combat',
      history: false,
      mount: mount,
      unmount: unmount,
      update: function () { if (M) { M.dirty = true; if (!fxBusy()) refresh(); } },
      onKey: function (e) { return DD.safe('HUD key', onKey, null, [e]) === true; },
    });
  });

  /** HUD actions for tests and the console (the same code paths the mouse and keyboard use). */
  DD.HUD = {
    mounted: function () { return !!M; },
    selected: function () { return selectedUnit(); },
    mode: function () { return M ? Object.assign({}, M.mode) : null; },
    lock: function () { return lockReason(); },
    select: function (id) { return M ? select(id && id.id ? id.id : id) : false; },
    cycle: function (dir) { cycle(dir || 1); },
    pressSlot: function (pos) { pressSlot(pos); },
    pressConsumable: function (i) { pressConsumable(i); },
    hover: function (x, y) { onHover(x === null || x === undefined ? null : { x: x, y: y, unitId: (DD.Grid.unitAt(x, y) || {}).id || null }); },
    click: function (x, y, opts) { const u = DD.Grid.unitAt(x, y); onTileClick({ x: x, y: y, button: 0, shift: !!(opts && opts.shift), unitId: u ? u.id : null }); },
    rightClick: function () { onRightClick(); },
    key: function (k, opts) { return M ? onKey(Object.assign({ key: k, repeat: false, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false }, opts || {})) : false; },
    endTurn: function () { return doEndTurn('silent'); },
    undo: function () { doUndo(); },
    interact: function (i) { const u = selectedUnit(); const ia = u ? interactionsOf(u)[i || 0] : null; return ia ? doInteract(u, ia) : false; },
    refresh: function () { if (M) { M.dirty = true; refresh(); } },
    tick: function () { tick(); },
    hint: function () { return M ? M.els.hint.textContent : ''; },
    /** Drop the transient hint message (tests read the standing hint without waiting 2.6 s). */
    clearHint: function () { if (M) { M.hintMsg = null; renderHint(); } },
    root: function () { return M ? M.root : null; },
    els: function () { return M ? M.els : null; },
    endPending: function () { return !!(M && M.endSkip); },
    skipEnd: function () { if (M && M.endSkip) M.endSkip(); },
    openMenu: function () { openMenu(); },
    /** Aura threats (enemy hooks.threatAt) on `unit` were it to stand on (x, y): [{ unit, dmg, label }]. */
    auraThreats: function (unit, x, y) { const u = unit && unit.id ? unit : byId(unit); return M && u ? auraThreats(u, x === undefined ? u.x : x, y === undefined ? u.y : y) : []; },
    /** Who pays a skill's HP cost instead of `unit` (Blood Price), or null. */
    hpPayer: function (unit, skillId, level) {
      const def = DD.getSkill(skillId);
      if (!M || !unit || !def) return null;
      return hpPayer(unit, def, level || 1, C().costOf(unit, def, level || 1));
    },
    /** Run the idle-DM check as if the clock read `at` (ms, performance.now() scale); true when a line was shown. */
    idleCheck: function (at) { return idleCheck(at); },
    idleSince: function () { return M ? M.idleSince : 0; },
    /** Where the DM caption sits: 'top' (under the objective) or 'low' (above the hint bar). */
    dmPlace: function () { return M ? (M.els.dm.parentNode === M.els.barWrap ? 'low' : 'top') : null; },
    placeDm: function () { placeDm(true); },
    // ---- v2 ----
    /** "Roll for Initiative!" (deployment). */
    rollInitiative: function () { return doRoll(); },
    /** The initiative tracker as shown: [{ unitId, name, total, cur, dist, joiner, divider, round, mark }]. */
    tracker: function () {
      if (!M) return [];
      return (trackerModel().items || []).map(function (it) {
        if (it.divider) return { divider: true, round: it.round };
        return { unitId: it.unit.id, name: it.unit.name, side: it.unit.side, total: it.entry ? it.entry.total : null, cur: !!it.cur, dist: it.dist, joiner: !!it.joiner, mark: it.joiner ? '🆕' : chipMark(it.unit) };
      });
    },
    /** The turn the HUD shows (the playback's during AI turns): the unit, or null. */
    shownTurnUnit: function () { return M ? shownTurnUnit() : null; },
    /** Who acts after the current turn, in order, up to the next hero that can act. */
    upcoming: function () { return M ? upcoming() : []; },
    /** Threat shading: set the sticky toggle (true / false) or read it (no argument); hold(on) = holding Alt. */
    threat: function (on) { if (M && on !== undefined) setThreatSticky(!!on); return threatOn(); },
    holdThreat: function (on) { setThreatHold(on !== false); return threatOn(); },
    threatData: function () { return M ? threatData() : null; },
    /** The dice moment: { active, progress, cards: [{ unitId, roll, total, rank }], line } or null; skip it. */
    moment: function () {
      if (!M || !M.moment) return null;
      return { active: true, progress: M.moment.p, line: M.moment.line, cards: M.moment.cards.map(function (c) { return { unitId: c.r.unitId, roll: c.r.roll, total: c.r.total, rank: c.to + 1, from: c.from, landed: c.landed }; }) };
    },
    skipMoment: function () { skipMoment(); },
    /** Tests: host the dice moment even headless (FX must not be instant for the marker to play). */
    forceMoments: function (on) { if (M) M.forceMoments = on !== false; },
    /** Hover a tracker portrait (null clears): the board highlight + inspect panel follow. */
    hoverTracker: function (unitId) { if (!M) return; M.trackHover = unitId && unitId.id ? unitId.id : unitId || null; computeOverlay(); renderInspect(); highlightChip(); },
    clickTracker: function (unitId) { const u = byId(unitId && unitId.id ? unitId.id : unitId); if (u) clickTracker(u); },
  };
})();
