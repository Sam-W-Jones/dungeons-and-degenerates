/* Dungeons and Degenerates — js/data/bosses/svammiel.js
 * Act IV's floor boss: SVAMMIEL (he), the Dungeon Master's Dungeon Master, fought directly under the DM's table
 * (encounter 'boss_svammiel', the gauntlet's finale, theme a4_underfloor), plus the `svammiel` cameo def that heckles
 * every act-4 fight, bursts in at the act-3 twist and carries the five cameo cheats (Green Thumb, Nepotism, That's a 1
 * Now, The Floor Is Lava, the Radio Edit). Plan .tmp/v3/design.md §3.0.2, §3.5, §4.1, §5.1, §6.2.
 *   The board: 20 black-and-gold linoleum panels (A1-E4, 3×3 tiles each) over the void. He flies (the status Wings
 *   (Graph Paper)) and cheats out loud, under a hard budget: one Round Cheat a round in phases 1-2, drawn with the
 *   combat RNG and announced a whole round before it goes live ("Next round" chip, marked tiles, threatAt); one Snap
 *   Cheat a round while he holds a Fudge token; phase cheats at the flips. The party answers with Rulings (the demoted
 *   DM at the kids' table) and by breaking his dice.
 *   Phase 1 "The Lobby" (full HP → 2/3): one entry; each turn one action, then a Floor Collapse wind-up.
 *   Phase 2 "I, SVAMMIEL, CONTROL ALL" (≤ 2/3): I Go Twice (a second initiative entry through E2: unit.turnsPerRound;
 *     without E2, two actions on his one turn); Floor Collapse and Hellfire Rain wind-ups take turns (N.windsPerRound
 *     new ones a round).
 *   Phase 3 "FINE. NO MORE FLOOR." (≤ 1/3): one entry, N.p3Acts actions a turn (1 shipped; the plan's 2 is a knob),
 *     Hellfire Rain only; two marked outer panels drop for good at every round end; Pencilled HP; three Master Dice:
 *     break them all and he is CAUGHT CHEATING (grounded over his own void, an honest d20, N.caught damage taken, 30 a
 *     fall, no more cheats). Every text that counts his turns or actions reads the knobs (actsText).
 *   Phase gates as the DM's: no skipping phases, no death before phase 3.
 * All fight state lives in state.data.svam (previews and dry runs copy it). DD.BossSvammiel: test / debug hooks.
 */
(function () {
  'use strict';
  const DD = window.DD;
  const U = DD.util;

  const SVAM = 'svam_svammiel', IMP = 'svam_imp', ACTOR = 'svammiel', ENC = 'boss_svammiel';
  const TABLE = 'svam_dm_table', RIGGED = 'svam_rigged_die', MASTER = 'svam_master_die';
  const FLOOR = 'svam_linoleum', VOID = 'svam_void', STUB = 'svam_stub';
  const WINGS = 'svam_wings', FUDGE = 'svam_fudge', CAUGHT = 'svam_caught', GUARD = 'svam_guard', CLOCK = 'svam_clocking_in';
  const NEXT_RULE = 'svam_next', CUR_RULE = 'svam_cheat', RULINGS_RULE = 'svam_rulings';
  const PHASE_RULE = { nat20: 'svam_p_nat20', twice: 'svam_p_twice', cutscenes: 'svam_p_cutscenes', floor: 'svam_p_floor',
    pencil: 'svam_p_pencil', dice: 'svam_p_dice' };
  // Knobs. Author sims (real random parties, L6, bare: tests/content/boss_svammiel.js "zz", sim=1) put the plan's numbers
  // (480 HP, armor 1, 14 / 18 / 8 / 22, two actions in phase 3, Master Dice 20) at 0-5% won: phase 2's second turn and
  // phase 3's second action decided it. Tuned (docs/notes/boss-svammiel.md "Balance"): 360 HP, armor 0, 10 / 13 / 6 / 16,
  // one action a turn in phase 3, one new wind-up a round, Master Dice 12 HP. V3 review: the Round Cheat draw had always
  // taken the deck's first card (lava every other round); with the real weighted deck, the pencil capped at half a
  // round's damage (no stalls) and Natural Twenty 12 / Hellfire Rain 14: 60% won at L6 (200 fights; plan band 55-62%).
  const N = {
    hp: 360, armor: 0, p2: 2 / 3, p3: 1 / 3, init: 4, mov: 5,
    pitchfork: 10, nat20: 12, nat20Range: 6, buffet: 6, buffetPush: 2, rain: 14, rainCenters: 3, honest: 13, honestLow: 7,
    // BAL (Nov 15) cut the Master Die 12 -> 6 HP for AutoPlay (two-hit objects barely score for it); QA FIGHTS-08 (Nov 17):
    // back to 12, so phase 3 stays a puzzle for a human (at 6 every die fell to one hit); AutoPlay's objectValue is RULES'.
    // fudgeFloor: every new phase gives him at least that many Fudge tokens, however many Rigged Dice broke (FIGHTS-07)
    rulings: 2, rulingDmg: 10, fudge: 3, fudgeFloor: 1, dieHp: 12, dieHype: 8, masterHp: 12, masterDice: 3,
    pencil: 5, pencilShare: 0.5, dropPerRound: 2, fall: 30, caught: 1.25, fallShare: 0.25,
    p2Turns: 2,          // I Go Twice: initiative entries a round in phase 2 (E2)
    p3Acts: 1,           // actions a turn in phase 3 (the plan: 2; see above)
    windsPerRound: 1,    // new wind-ups a round (I Go Twice doesn't double them)
    walkPenalty: 0, roundCheats: 1, masterHint: 45, riggedHint: 10,
    impHp: 18, jab: 7, impsPer: 2, impsAlive: 4, hypeTax: 30, tiltDist: 2, tiltBump: 3, lava: 8, moveAp: 2,
    nearTable: 8, nearDie: 6, snapMin: 20, cameoOneMin: 10,
    // the cameo cheats' targets (other owners' ids: C1 the Gardener, C3 Galbraith, C2 the League's tag)
    vine: 'gard_vine', gardener: 'gard_gardener', galbraith: 'gal_galbraith', leagueTag: 'league', covenTag: 'coven', nepotism: 3,
    lavaPatch: { x0: 6, y0: 7, x1: 8, y1: 9 }, lavaRounds: 3, vinePos: [{ x: 5, y: 9 }, { x: 8, y: 9 }],
  };
  // Round Cheat weights (plan §3.5): damaging / positional 3, Rule Zero 1, the rest 2
  const WEIGHT = { svam_lava: 3, svam_tilt: 3, svam_panel_swap: 3, svam_wander: 3, svam_rule_zero: 1 };
  const DECK = {
    petty: ['svam_lava', 'svam_bonus', 'svam_no_healing', 'svam_ban', 'svam_tilt', 'svam_rule_zero', 'svam_swap'],
    blatant: ['svam_lava', 'svam_no_healing', 'svam_ban', 'svam_tilt', 'svam_panel_swap', 'svam_moving_costs', 'svam_swap',
      'svam_wander', 'svam_no_signatures', 'svam_hype_tax'],
  };
  // his immediate attacks by state (wind-ups are scripted, never slots: threat shading shows what he does at once)
  const KIT = { normal: ['svam_pitchfork', 'svam_nat20', 'svam_buffet'], caught: ['svam_pitchfork', 'svam_honest', 'svam_buffet'] };

  // ---- the board: 5 columns A-E (x 1-3 … 13-15) × 4 rows (y 1-3 … 10-12) of 3×3 panels over the void ------------
  const COLS = 'ABCDE';
  const CORE = ['B2', 'C2', 'D2', 'B3', 'C3', 'D3'];
  const SAFE = 'A2';   // the DM's panel: his kids' table hangs off it, it never drops
  const CLOCKWISE = ['A1', 'B1', 'C1', 'D1', 'E1', 'E2', 'E3', 'E4', 'D4', 'C4', 'B4', 'A4', 'A3'];
  const OUTER = CLOCKWISE.concat([SAFE]);
  // directions by landmark, never by compass (the map turns)
  const LANDMARK = {
    throne: { dir: { x: 0, y: -1 }, text: 'toward his throne' },
    table: { dir: { x: -1, y: 0 }, text: 'toward the kids\' table' },
    stuff: { dir: { x: 0, y: 1 }, text: 'toward your stuff' },
    nice: { dir: { x: 1, y: 0 }, text: 'toward the nice side' },
  };
  const LANDMARK_KEYS = ['throne', 'table', 'stuff', 'nice'];
  const REASONS = ['none', 'no', 'because', 'wings', 'it\'s funnier', 'I said so', 'see Rule Zero', 'the vibes', 'it\'s Tuesday',
    '[REDACTED]', 'you wouldn\'t understand', 'I\'m the DM', 'my floor', 'I was bored', 'the dice told me (I told the dice)', 'spite'];

  // ---- small helpers ----------------------------------------------------------------------------------------
  function S() { return DD.Combat && DD.Combat.state; }
  function G() { return DD.Grid; }
  function active(u) { return !!u && !u.dead && !u.downed; }
  function has(u, id) { return DD.Act.hasStatus(u, id); }
  /** A painter's status list (a Set of ids, an id array, an { id: true } map or status instances). */
  function hasSt(st, id) {
    if (!st) return false;
    if (st instanceof Set) return st.has(id);
    if (Array.isArray(st)) return st.some(function (s) { return s === id || (s && s.id === id); });
    return typeof st === 'object' ? !!st[id] : false;
  }
  function sim() { return !!DD.Act.simulating; }
  function roundOf(st) { st = st || S(); return st ? st.round : 0; }
  function isSvam(u) { return !!u && u.defId === SVAM; }
  function key(p) { return p.x + ',' + p.y; }
  function onList(list, p) { for (let i = 0; i < list.length; i++) if (list[i].x === p.x && list[i].y === p.y) return true; return false; }
  function grounded(u) { return !G().isFlying(u); }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
  /** "Reroll!" stays "Reroll!", "Pencilled HP" becomes "Pencilled HP." (a name that opens a sentence in the log). */
  function dotted(name) { return /[.!?]$/.test(name) ? name : name + '.'; }
  function words(n) { return ['no', 'one', 'two', 'three', 'four', 'five', 'six'][n] || String(n); }
  function capFirst(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  /** "One action a turn" / "Two actions a turn": phase 3's actions as the knob sets them (texts never hard-code it). */
  function actsText() { return capFirst(plural(N.p3Acts, 'action').replace(/^\d+/, words(N.p3Acts))) + ' a turn'; }
  /** Caught Red-Handed's extra damage taken, from the knob ("+25%"). */
  function caughtText() { return '+' + Math.round((N.caught - 1) * 100) + '%'; }
  /** Pencilled HP's share of a round's damage, in words ("half"). */
  function shareText() { return N.pencilShare === 0.5 ? 'half' : Math.round(N.pencilShare * 100) + '%'; }
  function findSvam(st) {
    st = st || S();
    if (!st) return null;
    for (let i = 0; i < st.units.length; i++) if (isSvam(st.units[i]) && !st.units[i].dead) return st.units[i];
    return null;
  }
  function heroes(st) { return (st || S()).units.filter(function (u) { return active(u) && u.kind === 'hero'; }); }
  function fallDmg(u) { return Math.max(1, Math.ceil(u.maxHp * N.fallShare)); }
  function quietPick(list) { return list && list.length ? list[Math.floor(DD.rng.next() * list.length)] : ''; }
  function pool(key, fallback) {
    const lines = DD.defs.narration[key];
    return lines && lines.length ? lines : (fallback || []);
  }

  // ---- fight state (state.data.svam: created at combat start, before any pure query can ask for it) --------------
  function newFight() {
    return {
      phase: 1, lastShift: -1, armored: false, armoredAt: -1, guard: null, lostTurn: false,
      rulings: N.rulings, rulingRound: -1, fudge: N.fudge, fudgeMax: N.fudge, snapRound: -1,
      rigged: 0, master: 0, masterPlaced: 0, caught: false,
      cur: null, next: null, drawn: {}, lastId: null, dmg: {}, collapsed: [], gone: [], lava: [], drop: null, taken: 0,
      twiceFrom: 0, windNext: 'svam_collapse', reasons: [], panels: {}, panelOrder: [], base: {},
      stats: { rulings: 0, rigged: 0, master: 0, caught: 0, falls: 0, pencil: 0, drops: 0, collapses: 0, rains: 0, imps: 0,
        cheats: 0, snaps: 0, refused: 0, stuns: 0, turns: 0, phase2: 0, phase3: 0, lost: 0, cancelled: 0 },
    };
  }
  /** The fight state (created when missing; never call from a pure query: use peek). */
  function fight(st) {
    st = st || S();
    if (!st) return null;
    if (!st.data) st.data = {};
    return st.data.svam || (st.data.svam = newFight());
  }
  function peek(st) { st = st || S(); return st && st.data ? st.data.svam || null : null; }

  // ---- panels ---------------------------------------------------------------------------------------------------
  function panelIdAt(x, y) {
    if (x < 1 || y < 1) return null;
    const c = Math.floor((x - 1) / 3), r = Math.floor((y - 1) / 3);
    return c < 5 && r < 4 ? COLS.charAt(c) + (r + 1) : null;
  }
  function tagId(tag) { const m = /^panel_([A-E][1-4])$/.exec(tag || ''); return m ? m[1] : null; }
  /**
   * The arena's panel tags (tile.tag 'panel_C2'): the layout gives every linoleum tile of the 15 × 12 board its terrain;
   * the tags are laid by coordinates here (idempotent), then the panel table is built from the tags.
   */
  function ensurePanels(st) {
    const F = fight(st);
    if (F.panelOrder.length) return F;
    const tiles = st.grid.tiles;
    if (!tiles.some(function (t) { return tagId(t.tag); })) {
      tiles.forEach(function (t) { const id = panelIdAt(t.x, t.y); if (id && t.t === FLOOR) t.tag = 'panel_' + id; });
    }
    const byId = {};
    tiles.forEach(function (t) {
      const id = tagId(t.tag);
      if (!id) return;
      const p = byId[id] || (byId[id] = { id: id, col: COLS.indexOf(id.charAt(0)), row: +id.charAt(1), tiles: [], x0: 99, y0: 99, x1: -1, y1: -1 });
      p.tiles.push({ x: t.x, y: t.y });
      p.x0 = Math.min(p.x0, t.x); p.y0 = Math.min(p.y0, t.y); p.x1 = Math.max(p.x1, t.x); p.y1 = Math.max(p.y1, t.y);
      F.base[key(t)] = t.t;
    });
    Object.keys(byId).sort(function (a, b) { return (+a.charAt(1) - +b.charAt(1)) || a.charCodeAt(0) - b.charCodeAt(0); }).forEach(function (id) {
      const p = byId[id];
      p.tiles.sort(function (a, b) { return a.y - b.y || a.x - b.x; });
      p.cx = Math.round((p.x0 + p.x1) / 2); p.cy = Math.round((p.y0 + p.y1) / 2);
      p.core = CORE.indexOf(id) >= 0; p.safe = id === SAFE;
      F.panels[id] = p;
      F.panelOrder.push(id);
    });
    st.data.panels = F.panelOrder.map(function (id) { const p = F.panels[id]; return { id: id, x0: p.x0, y0: p.y0, x1: p.x1, y1: p.y1 }; });
    return F;
  }
  function panel(F, id) { return F && F.panels ? F.panels[id] || null : null; }
  function isGone(F, id) { return F.gone.indexOf(id) >= 0; }
  function isCollapsed(F, id) { return F.collapsed.some(function (c) { return c.id === id; }); }
  function present(F, id) { return !!panel(F, id) && !isGone(F, id) && !isCollapsed(F, id); }
  function panelOfTile(F, p) { const t = G().tile(p.x, p.y); const id = t ? tagId(t.tag) : null; return id && F.panels[id] ? id : null; }
  function groundedHeroesOn(st, F, id) {
    const p = panel(F, id);
    if (!p) return 0;
    return heroes(st).filter(function (h) { return grounded(h) && onList(p.tiles, h); }).length;
  }
  /** The present panel with the most grounded heroes (ties: board order), null when nobody stands on one. */
  function busiestPanel(st, F, not) {
    let best = null, n = 0;
    F.panelOrder.forEach(function (id) {
      if (!present(F, id) || (not && not.indexOf(id) >= 0)) return;
      const k = groundedHeroesOn(st, F, id);
      if (k > n) { n = k; best = id; }
    });
    return best;
  }
  function partyCentre(st) {
    const hs = heroes(st);
    if (!hs.length) return null;
    let x = 0, y = 0;
    hs.forEach(function (h) { x += h.x; y += h.y; });
    return { x: x / hs.length, y: y / hs.length };
  }
  /** Panels a cheat marks for this or the next round (Floor Collapse avoids them). */
  function cheatPanels(F) {
    const out = [];
    [F.cur, F.next].forEach(function (c) {
      if (!c || c.cancelled || !c.data) return;
      if (c.data.panel) out.push(c.data.panel);
      if (c.data.panels) c.data.panels.forEach(function (id) { out.push(id); });
    });
    return out;
  }

  // ---- dice on the floor ------------------------------------------------------------------------------------------
  function isDie(o) { return !!o && (o.id === RIGGED || o.id === MASTER); }
  /** A free floor tile of a panel that stays (not one of `leaving`), nearest to p: dice tumble there. */
  function tumbleSpot(F, p, leaving) {
    const g = S().grid;
    let best = null, bd = Infinity;
    g.tiles.forEach(function (t) {
      const id = tagId(t.tag);
      if (!id || leaving.indexOf(id) >= 0 || !present(F, id) || t.obj || G().unitAt(t.x, t.y) || G().isDrop(t.x, t.y)) return;
      const d = Math.abs(t.x - p.x) + Math.abs(t.y - p.y);
      if (d < bd || (d === bd && best && (t.y < best.y || (t.y === best.y && t.x < best.x)))) { bd = d; best = t; }
    });
    return best ? { x: best.x, y: best.y } : null;
  }
  function moveObject(from, to) {
    const o = DD.Act.removeObject(from.x, from.y);
    if (!o) return null;
    const keep = { hp: o.hp, maxHp: o.maxHp, data: o.data, label: o.label };
    return DD.Act.placeObject(to.x, to.y, o.id, keep);
  }
  /** Dice never fall with his floor: every die on a panel that drops rolls to the nearest panel that stays. */
  function tumbleDice(F, ids) {
    let n = 0;
    ids.forEach(function (id) {
      const p = panel(F, id);
      if (!p) return;
      p.tiles.forEach(function (q) {
        const t = G().tile(q.x, q.y);
        if (!t || !isDie(t.obj)) return;
        const to = tumbleSpot(F, q, ids);
        if (to && moveObject(q, to)) { n++; DD.FX.tile(to.x, to.y, 'pulse', { color: '#ffd34d' }); }
      });
    });
    if (n && !sim()) { DD.Act.log('Dice roll. (' + plural(n, 'die') + ' tumbled off the dropping floor.)', 'system'); }
    return n;
  }

  /**
   * Panels drop into the void together: their dice tumble first, other objects fall with them (a temporary drop keeps
   * them for the return), and every grounded unit on them falls exactly once (heroes and bosses: the engine's fall, then
   * they climb out). QA FIGHTS-02: every tile of the drop is the void BEFORE anyone falls, so the climb-out (the
   * engine's nearest free floor) always lands on a panel that stays, never on a later tile of the same drop.
   */
  function dropPanels(F, ids, opts) {
    opts = opts || {};
    const list = [];
    ids.forEach(function (id) {
      const p = panel(F, id);
      if (!p || isGone(F, id) || list.some(function (e) { return e.id === id; })) return;
      const wasCollapsed = isCollapsed(F, id);
      if (wasCollapsed && opts.temporary) return;
      list.push({ id: id, p: p, was: wasCollapsed });
    });
    if (!list.length) return 0;
    const fresh = list.filter(function (e) { return !e.was; });
    tumbleDice(F, fresh.map(function (e) { return e.id; }));
    list.forEach(function (e) {
      e.objs = [];
      e.p.tiles.forEach(function (q) { const t = G().tile(q.x, q.y); if (t && t.obj && !isDie(t.obj)) e.objs.push({ x: q.x, y: q.y, id: t.obj.id, over: { hp: t.obj.hp, maxHp: t.obj.maxHp, data: t.obj.data, label: t.obj.label } }); });
    });
    const tiles = [];
    fresh.forEach(function (e) { e.p.tiles.forEach(function (q) { tiles.push(q); }); });
    tiles.forEach(function (q) {
      const u = G().unitAt(q.x, q.y);
      if (u && active(u) && grounded(u) && u.kind === 'hero') F.stats.falls++;
      const t = G().tile(q.x, q.y);
      if (t) t.t = VOID;
    });
    // then each tile is set properly (surfaces and objects go, the unit on it falls once and climbs out elsewhere)
    DD.Act.withCredit(opts.src || null, function () { tiles.forEach(function (q) { DD.Act.setTerrain(q.x, q.y, VOID); }); });
    list.forEach(function (e) {
      if (opts.temporary) F.collapsed.push({ id: e.id, back: roundOf() + 1, objs: e.objs });
      else {
        F.collapsed = F.collapsed.filter(function (c) { return c.id !== e.id; });
        F.gone.push(e.id);
      }
    });
    DD.FX.shake(6, 300);
    DD.Act.touch();
    return list.length;
  }
  function dropPanel(F, id, opts) { return dropPanels(F, [id], opts) > 0; }
  function restorePanel(F, entry) {
    const p = panel(F, entry.id);
    F.collapsed = F.collapsed.filter(function (c) { return c !== entry; });
    if (!p || isGone(F, entry.id)) return false;
    p.tiles.forEach(function (q) { if (G().isDrop(q.x, q.y)) DD.Act.setTerrain(q.x, q.y, F.base[key(q)] || FLOOR); });
    (entry.objs || []).forEach(function (o) { const t = G().tile(o.x, o.y); if (t && !t.obj && !G().unitAt(o.x, o.y)) DD.Act.placeObject(o.x, o.y, o.id, o.over); });
    if (!sim()) DD.Act.log('Panel ' + entry.id + ' clicks back into place. Svammiel acts like it never left.', 'system');
    DD.Act.touch();
    return true;
  }

  // ---- the cheat budget: Round Cheats (one a round, phases 1-2), announced a whole round before they go live --------
  function surface(c) { return c ? CH[c.id] : null; }
  function descOf(c) {
    const def = surface(c);
    if (!def) return '';
    return typeof def.fill === 'function' ? def.fill(c.data || {}) : def.desc;
  }
  /** The chip while the cheat is live (a cheat whose announcement said "next round" for an effect at its round's start). */
  function liveDescOf(c) { const def = surface(c); return def && def.live ? def.live : descOf(c); }
  /**
   * QA FIGHTS-05: the cheat's text for its own round, by number ("At the end of round 5 …"). It is announced a round
   * ahead, so "this round" / "next round" would be read against the round the announcement is printed in.
   */
  function aheadDescOf(c) {
    const def = surface(c);
    if (!def) return '';
    const r = c.round;
    if (typeof def.ahead === 'function') return def.ahead(c.data || {}, r);
    return liveDescOf(c)
      .replace(/^This round /, 'In round ' + r + ' ')
      .replace(/\b([Aa]t the (?:end|start) of) this round\b/g, '$1 round ' + r)
      .replace(/ this round\b/g, ' in round ' + r)
      .replace(/\bat the end of the next\./, 'at the end of round ' + (r + 1) + '.')
      .replace(/\bthe round after\b/, 'round ' + (r + 1));
  }
  /** The banner's line for an announced cheat: its text for its round (naming the round when the text doesn't). */
  function aheadSubOf(c) { const t = aheadDescOf(c); return /\bround \d+\b/.test(t) ? t : 'Round ' + c.round + ': ' + t; }
  /** Did the Radio Edit (the goats' cameo cheat) land in this run? (Run memory: DD.Cameo's cheats list.) */
  function radioLanded(st) {
    const m = st && st.run && st.run.flags && st.run.flags.cameo;
    return !!(m && Array.isArray(m.cheats) && m.cheats.indexOf('svam_cameo_radio') >= 0);
  }
  function reasonLine(F) {
    const list = pool('svam_reason', REASONS);
    let free = [];
    for (let i = 0; i < list.length; i++) if (F.reasons.indexOf(i) < 0) free.push(i);
    if (!free.length) { F.reasons = []; free = list.map(function (l, i) { return i; }); }
    const i = free[Math.floor(DD.rng.next() * free.length)];
    F.reasons.push(i);
    return String(list[i]).replace(/^\s*Reason:\s*/i, '').replace(/[.\s]+$/, '');
  }
  function sayQuip(u, def) {
    if (!u || sim()) return '';
    let lines = DD.Act.partyLines(pool('svam_quip_' + def.id, def.quips));
    // QA voice-4: Skill Ban's callback to the goats' Radio Edit only when that bleep really happened this run
    if (def.id === 'svam_ban' && !radioLanded(S())) lines = lines.filter(function (l) { return !/radio edit/i.test(l); });
    const text = quietPick(lines);
    if (text) DD.Act.bark(u, text);
    return text;
  }
  function counterWhisper(def) {
    if (sim()) return;
    const line = quietPick(pool('svam_counter_' + def.id, def.counter ? [def.counter] : []));
    if (line) DD.Act.log(line, 'narrator');
  }
  function cheatLog(F, text) {
    if (sim()) return;
    DD.Act.log('😈 Svammiel cheats: ' + text + ' Reason: ' + reasonLine(F) + '.', 'cameo', { speaker: 'Svammiel', actor: ACTOR });
  }
  function countCheat(st, F, id) {
    F.stats.cheats++;
    st.stats.cheats = (st.stats.cheats || 0) + 1;
    const d = F.drawn[F.phase] || (F.drawn[F.phase] = {});
    d[id] = (d[id] || 0) + 1;
  }

  /** Can this cheat do what it promises for round `r` (decided now, at the announcement)? Returns its data or null. */
  function planCheat(st, F, id, r) {
    const svam = findSvam(st);
    switch (id) {
      case 'svam_lava': {
        const not = [SAFE].concat(F.collapsed.map(function (c) { return c.id; }));
        let p = busiestPanel(st, F, not);
        if (!p) {
          const c = partyCentre(st);
          let bd = Infinity;
          F.panelOrder.forEach(function (pid) {
            if (!present(F, pid) || not.indexOf(pid) >= 0) return;
            const q = F.panels[pid], d = c ? Math.abs(q.cx - c.x) + Math.abs(q.cy - c.y) : 0;
            if (d < bd) { bd = d; p = pid; }
          });
        }
        return p ? { panel: p } : null;
      }
      case 'svam_ban': {
        const log = F.dmg[r - 2] || {};
        let best = null, bn = 0;
        Object.keys(log).sort().forEach(function (k) {
          const parts = k.split('|'), h = DD.Combat.byId(parts[0]);
          if (!active(h) || !(h.skills || []).some(function (sl) { return sl.id === parts[1]; })) return;
          if (log[k] > bn) { bn = log[k]; best = { unitId: h.id, skillId: parts[1], hero: h.name, skill: (DD.getSkill(parts[1]) || {}).name || parts[1] }; }
        });
        return best;
      }
      case 'svam_tilt': {
        const k = LANDMARK_KEYS[st.rng.int(0, LANDMARK_KEYS.length - 1)];
        return F.panelOrder.length ? { dir: k } : null;
      }
      case 'svam_panel_swap': {
        const not = [SAFE];
        const a = busiestPanel(st, F, not);
        const others = F.panelOrder.filter(function (id) { return present(F, id) && not.indexOf(id) < 0 && id !== a; });
        if (!a || !others.length) return null;
        const b = others[st.rng.int(0, others.length - 1)];
        return { panels: [a, b] };
      }
      case 'svam_swap': {
        if (!svam) return null;
        const hs = heroes(st);
        if (!hs.length) return null;
        hs.sort(function (x, y) { return x.hp / x.maxHp - y.hp / y.maxHp || st.units.indexOf(x) - st.units.indexOf(y); });
        const a = { x: hs[0].x, y: hs[0].y };
        const spots = U.DIRS.map(function (d) { return { x: svam.x + d.x, y: svam.y + d.y }; }).filter(function (p) {
          return G().isFree(p.x, p.y) && !G().isDrop(p.x, p.y) && !(p.x === a.x && p.y === a.y);
        });
        if (!spots.length) return null;
        spots.sort(function (p, q) { return (Math.abs(p.x - a.x) + Math.abs(p.y - a.y)) - (Math.abs(q.x - a.x) + Math.abs(q.y - a.y)) || p.y - q.y || p.x - q.x; });
        return { a: a, b: spots[0] };
      }
      case 'svam_wander': {
        const alive = st.units.filter(function (u) { return active(u) && u.defId === IMP; }).length;
        const n = Math.min(N.impsPer, N.impsAlive - alive);
        if (n <= 0) return null;
        const c = partyCentre(st) || { x: st.grid.w / 2, y: st.grid.h / 2 };
        const cands = st.grid.tiles.filter(function (t) {
          if (!G().isFree(t.x, t.y) || G().isDrop(t.x, t.y) || t.obj) return false;
          const d = Math.abs(t.x - c.x) + Math.abs(t.y - c.y);
          return d >= 3 && d <= 6 && heroes(st).every(function (h) { return G().dist(h, t) >= 2; });
        }).map(function (t) { return { x: t.x, y: t.y }; });
        if (cands.length < n) return null;
        const picks = [];
        st.rng.shuffle(cands).forEach(function (p) { if (picks.length < n && picks.every(function (q) { return G().dist(p, q) >= 3; })) picks.push(p); });
        return picks.length === n ? { tiles: picks } : null;
      }
      case 'svam_hype_tax': return (st.hype || 0) > 0 ? {} : null;
      default: return {};
    }
  }
  /** Draw the Round Cheat for round r from the phase deck (combat RNG), never last round's, each at most twice a phase. */
  function drawCheat(st, F, r) {
    if (F.caught || F.phase >= 3 || !N.roundCheats) return null;
    const deck = F.phase >= 2 ? DECK.blatant : DECK.petty;
    const used = F.drawn[F.phase] || {};
    const prev = F.next && F.next.round === r - 1 ? F.next.id : F.cur && F.cur.round === r - 1 ? F.cur.id : F.lastId;
    const cands = [];
    deck.forEach(function (id) {
      if (id === prev || (used[id] || 0) >= 2) return;
      if ((id === 'svam_lava' || id === 'svam_panel_swap' || id === 'svam_tilt') && !F.panelOrder.length) return;
      cands.push(id);
    });
    // weighted draws until one can do what it promises (each is tried at most once)
    while (cands.length) {
      const ws = cands.map(function (id) { return WEIGHT[id] || 2; });
      // rng.next() in [0, 1): rng.float(a, b) needs its bounds (float() is NaN, which always took the first card)
      let roll = st.rng.next() * ws.reduce(function (a, b) { return a + b; }, 0);
      let k = 0;
      while (k < cands.length - 1 && roll >= ws[k]) { roll -= ws[k]; k++; }
      const id = cands.splice(k, 1)[0];
      const data = planCheat(st, F, id, r);
      if (data) return { id: id, round: r, data: data };
    }
    return null;
  }
  function nextRuleOf(c) {
    const def = surface(c);
    return { id: NEXT_RULE, name: 'Next round: ' + def.name, icon: def.icon, desc: aheadDescOf(c), turns: -1, hooks: {},
      cheat: true, next: true, source: ACTOR, silent: true };
  }
  /**
   * Announce c at the start of the round before its own (a whole round of notice): chip, banner, his quip, the log
   * line, marks, and the DM's whisper for the cheats a party answers ahead (whisper 'notice'). Every text names its
   * round by number (QA FIGHTS-05).
   */
  function announce(st, F, c) {
    const def = surface(c);
    if (!def) return;
    F.next = c;
    DD.Act.addRule(nextRuleOf(c));
    countCheat(st, F, c.id);
    const u = findSvam(st);
    if (!sim()) {
      DD.FX.banner('😈 ' + def.name, { sub: aheadSubOf(c), color: '#ff4a3a', ms: 1200, fit: true });
      DD.FX.sound('cheat');
      sayQuip(u, def);
      cheatLog(F, def.name + ' (round ' + c.round + '). ' + aheadDescOf(c));
      if (def.whisper !== 'live') counterWhisper(def);
    }
    updateBoard(st);
  }
  /**
   * Its round starts: the announced cheat goes live (the chip loses its "Next round"; it lasts this round: turns 1, and
   * its end-of-round effect plays as the chip ends: QA FIGHTS-03). The DM whispers the in-round counters now.
   */
  function activate(st, F, c) {
    const def = surface(c);
    F.next = null;
    F.cur = c;
    const r = st.rules.filter(function (x) { return x.id === NEXT_RULE; })[0];
    const live = { id: CUR_RULE, name: def.name, icon: def.icon, desc: liveDescOf(c), turns: 1, hooks: def.hooks || {},
      cheat: true, next: false, source: ACTOR, silent: true, cheatId: c.id,
      // the engine ticks rules at round end before the encounter's onRoundEnd: the effect first, then "Rule ended"
      onRemove: function () { const f = peek(); if (f && f.cur === c && !c.cancelled) endEffects(S(), f, c); } };
    if (r) { for (const k in r) if (k !== 'id') delete r[k]; Object.assign(r, live); DD.Act.touch(); }
    else DD.Act.addRule(live);
    const u = findSvam(st);
    if (u && !sim()) {
      DD.FX.text(u, def.icon + ' ' + def.name + '!', { color: '#ff7a5c', size: 15 });
      DD.Act.log('😈 ' + def.name + ' is on this round: ' + liveDescOf(c), 'enemy');
      if (def.whisper === 'live') counterWhisper(def);
    }
  }
  /** At the start of its round: the cheats that act right away (Skill Ban, Bring a Friend, Hype Confiscated). */
  function startEffects(st, F, c) {
    const def = surface(c);
    if (!def || c.cancelled || c.started) return;
    c.started = true;
    if (typeof def.start === 'function') def.start(st, F, c);
    updateBoard(st);
  }
  /** At the end of its round: the cheats that act then (The Floor Is Lava, The Tilt, Panel Swap, New Seating Chart). */
  function endEffects(st, F, c) {
    const def = surface(c);
    if (!def || c.cancelled || c.resolved) return;
    c.resolved = true;
    if (typeof def.end === 'function') def.end(st, F, c);
  }
  /** What a Ruling would cancel now: this round's cheat while it can still be undone, else next round's. */
  function cancelTarget(F) {
    if (F.cur && !F.cur.cancelled && !F.cur.resolved && !(surface(F.cur).once && F.cur.started)) return F.cur;
    if (F.next && !F.next.cancelled) return F.next;
    return null;
  }
  function cancelCheat(st, F, c) {
    const def = surface(c);
    c.cancelled = true;
    F.stats.cancelled++;
    if (c === F.cur) {
      if (typeof def.cancel === 'function') def.cancel(st, F, c);
      DD.Act.removeRule(CUR_RULE);
    } else if (c === F.next) DD.Act.removeRule(NEXT_RULE);
    if (!sim()) DD.Act.log('⚖️ Ruling: ' + def.name + ' is cancelled' + (c === F.next ? ' before it starts.' : '.'), 'hero');
    updateBoard(st);
  }

  // ---- the round cheats (exact descs; plan §3.5) --------------------------------------------------------------------
  function heroSideHeal(h) { return !!h && !!h.unit && h.unit.side === 'hero'; }
  function vetoReady() {
    const m = DD.BossSvammiel && DD.BossSvammiel.vetoMode;
    if (m === 'veto') return true;
    if (m === 'cost') return false;
    // E13 (RULES): Combat.canUse fires modifyUse and DD.Combat.vetoOf exists; without it the 99-AP modifyCost fallback
    return !!(DD.Combat && typeof DD.Combat.vetoOf === 'function');
  }
  function signatureOf(unit, skill) { return !!unit && unit.kind === 'hero' && !!skill && !!unit.signature && unit.signature.id === skill.id; }
  const CH = {};
  function cheat(def) { CH[def.id] = def; return def; }
  cheat({ id: 'svam_lava', name: 'The Floor Is Lava', icon: '🌋', rounds: 1, next: true, deck: 'both', whisper: 'live',
    desc: 'The marked panel turns to lava at the end of this round and cools at the end of the next.',
    quips: ['The floor is lava. I\'m the floor boss. I\'m allowed.', 'Hot floor! Not for me. I fly. Ha.'],
    counter: 'DM (whispering): "Get off the marked panel before the round ends. Flyers float, Pebbles likes it."',
    end: function (st, F, c) {
      const p = panel(F, c.data.panel);
      if (!p || !present(F, p.id)) return;
      const tiles = [];
      p.tiles.forEach(function (q) { if (!G().isDrop(q.x, q.y) && G().tile(q.x, q.y).t !== 'lava') { tiles.push(q); DD.Act.setTerrain(q.x, q.y, 'lava'); } });
      F.lava.push({ tiles: tiles, until: st.round + 1 });
      if (!sim()) DD.Act.log('Panel ' + p.id + ' is lava now. It cools at the end of next round.', 'enemy');
    } });
  cheat({ id: 'svam_bonus', name: 'Bonus Action', icon: '⏱️', rounds: 1, next: true, whisper: 'live',
    desc: 'This round each of his turns has one extra attack (no extra wind-up).',
    quips: ['Bonus action! And a bonus bonus action!', 'Monster Manual, page "mine": I get two.'],
    counter: 'DM (whispering): "Two hits from him this round. Spread out and keep your Block up."' });
  cheat({ id: 'svam_no_healing', name: 'No Healing on My Floor', icon: '🚫', rounds: 1, next: true,
    desc: 'This round heals on heroes and their summons heal half (a heal aimed at a downed ally still gets it up).',
    quips: ['Healing? On MY floor? Halved.', 'Half a heal. Whole attitude.'],
    counter: 'DM (whispering): "Heals get halved for one round. Heal before it, or after. A downed friend still gets up."',
    hooks: { modifyHeal: function (h) { if (heroSideHeal(h)) h.amount = Math.max(1, Math.floor(h.amount / 2)); } } });
  cheat({ id: 'svam_ban', name: 'Skill Ban', icon: '⛔', rounds: 1, next: true, once: false,
    desc: '<Skill> is banned: it is on cooldown through <hero>\'s next turn.',
    fill: function (d) { return (d.skill || 'Your best skill') + ' is banned: it is on cooldown through ' + (d.hero || 'its hero') + '\'s next turn.'; },
    // announced a round ahead, by number: the ban starts as its round starts and covers the hero's turn in that round
    ahead: function (d, r) { return (d.skill || 'Your best skill') + ' is banned in round ' + r + ': it is on cooldown through ' + (d.hero || 'its hero') + '\'s turn that round.'; },
    quips: ['That skill? Banned. Too good. Nerfed. Live.', 'I\'m putting that skill in time-out.'],
    counter: 'DM (whispering): "One skill, one turn. Use the other three. A Ruling gets it back."',
    start: function (st, F, c) {
      const h = DD.Combat.byId(c.data.unitId);
      if (!active(h)) return;
      const sl = (h.skills || []).filter(function (x) { return x.id === c.data.skillId; })[0];
      if (!sl) return;
      c.data.prevCd = sl.cd || 0;
      c.data.prevFresh = !!sl.fresh;
      // "through <hero>'s next turn", no longer: cooldowns tick at their owner's turn start (a fresh one skips that
      // tick), so a cooldown that already covers the next turn stays as it is; otherwise one fresh turn of cooldown
      c.data.set = !(sl.fresh ? (sl.cd || 0) >= 1 : (sl.cd || 0) >= 2);
      if (c.data.set) DD.Act.setCooldown(h, sl.id, 1);
      if (!sim()) { DD.FX.text(h, '⛔ ' + c.data.skill + ' banned!', { color: '#ff7a5c', size: 14 }); DD.Act.log(c.data.skill + ' (' + h.name + ') is banned through ' + h.name + '\'s next turn.', 'enemy'); }
    },
    // a Ruling undoes the ban (what it added), never the skill's own cooldown
    cancel: function (st, F, c) {
      const h = DD.Combat.byId(c.data.unitId);
      if (!h || !c.started || !c.data.set) return;
      (h.skills || []).forEach(function (sl) {
        if (sl.id !== c.data.skillId || !(sl.cd > 0)) return;
        sl.cd = Math.min(sl.cd, c.data.prevCd || 0);
        sl.fresh = sl.cd > 0 && !!c.data.prevFresh;
      });
      DD.Act.touch();
    } });
  cheat({ id: 'svam_tilt', name: 'The Tilt', icon: '↘️', rounds: 1, next: true, whisper: 'live',
    desc: 'At the end of this round every grounded unit slides ' + N.tiltDist + ' tiles <landmark direction>.',
    fill: function (d) { return 'At the end of this round every grounded unit slides ' + N.tiltDist + ' tiles ' + ((LANDMARK[d.dir] || LANDMARK.throne).text) + '.'; },
    quips: ['The floor tilts toward my throne. Because I said so.', 'Everybody lean! No? The floor will.'],
    counter: 'DM (whispering): "Put something solid on your downhill side. Flyers and the immovable stay put."',
    end: function (st, F, c) { tilt(st, F, (LANDMARK[c.data.dir] || LANDMARK.throne).dir); } });
  cheat({ id: 'svam_rule_zero', name: 'Rule Zero: I\'m Handsome', icon: '🪞', rounds: 1, next: true,
    desc: 'Svammiel is handsome. That\'s the rule.',
    quips: ['Rule zero, written just now: I\'m handsome.', 'New rule. Look at me. That\'s it. That\'s the rule.'],
    counter: 'DM (whispering): "That one does nothing. Do not waste a Ruling on his ego."' });
  cheat({ id: 'svam_panel_swap', name: 'Panel Swap', icon: '🔀', rounds: 1, next: true, whisper: 'live',
    desc: 'At the end of this round the two marked panels swap, with everything standing on them.',
    quips: ['Panels! Swap! Everything on them too.', 'Rearranging the furniture. You are the furniture.'],
    counter: 'DM (whispering): "Step off the marked panels, or step on for a free lift. Flyers stay where they hover."',
    end: function (st, F, c) { swapPanels(st, F, c.data.panels[0], c.data.panels[1]); } });
  cheat({ id: 'svam_moving_costs', name: 'Moving Costs Extra', icon: '🐌', rounds: 1, next: true, whisper: 'live',
    desc: 'This round a hero\'s move costs ' + N.moveAp + ' AP (the swap move too). Dashes, leaps, teleports and pulls are unaffected.',
    quips: ['Walking is 2 AP now. Read the fine print.', 'Floor tax! Every step, every hero.'],
    counter: 'DM (whispering): "Fight from where you stand this round. Skills that move you still cost what they cost."',
    hooks: { modifyMoveCost: function (m) { if (m.unit && m.unit.kind === 'hero') m.ap = Math.max(m.ap, N.moveAp); } } });
  cheat({ id: 'svam_swap', name: 'New Seating Chart', icon: '🪑', rounds: 1, next: true, whisper: 'live',
    desc: 'At the end of this round, whoever stands on the two marked chairs swaps places (someone on only one of them moves to the other).',
    quips: ['You two. Swap. No reason. Chaos is my love language.', 'New seating chart! You sit there now. Why? Wings.'],
    counter: 'DM (whispering): "Step off the first chair, or put your sturdiest friend on it. The swap move does that in one step."',
    end: function (st, F, c) { seating(st, F, c.data.a, c.data.b); } });
  cheat({ id: 'svam_wander', name: 'Bring a Friend', icon: '👹', rounds: 1, next: true, once: true,
    desc: 'At the start of next round ' + words(N.impsPer) + ' Floor Staff Imps arrive on the marked tiles (they act from the round after; at most ' + N.impsAlive + ' alive).',
    // its live chip (the imps arrive as its round starts: Deviations, "a round's notice")
    live: 'At the start of this round ' + words(N.impsPer) + ' Floor Staff Imps arrive on the marked tiles (they act from the round after; at most ' + N.impsAlive + ' alive).',
    quips: ['I invited some floor staff.', 'Random encounter! Random like a loaded die.'],
    counter: 'DM (whispering): "They are 18 HP each and they clock in for a round first. Area damage. Or a Ruling before they come."',
    start: function (st, F, c) { bringImps(st, F, c.data.tiles); } });
  cheat({ id: 'svam_no_signatures', name: 'No Signatures, That\'s Overpowered', icon: '🙅', rounds: 1, next: true,
    desc: 'Signature moves can\'t be used this round.',
    quips: ['Signature moves? Banned. Balance.', 'No big moves on my floor. Small moves only.'],
    counter: 'DM (whispering): "Signatures get banned for one round. Fire yours before it, or bank the Hype for after."',
    hooks: {
      modifyUse: function (q) { if (vetoReady() && signatureOf(q.unit, q.skill)) q.why = 'Banned by Svammiel (No Signatures, That\'s Overpowered).'; },
      modifyCost: function (c) { if (!vetoReady() && signatureOf(c.unit, c.skill)) c.ap = 99; },
    } });
  cheat({ id: 'svam_hype_tax', name: 'Hype Confiscated', icon: '🫳', rounds: 1, next: true, once: true,
    desc: 'At the start of this round the party loses ' + N.hypeTax + ' Hype.',
    quips: ['Your Hype? Confiscated. Evidence.', 'Your excitement is mine now. Mmm. Tangy.'],
    counter: 'DM (whispering): "Spend your Hype before he takes it. Kills earn it back."',
    start: function (st) {
      const lost = -DD.Act.gainHype(-N.hypeTax, 'Hype Confiscated');
      if (!sim()) DD.Act.log('Svammiel confiscates ' + lost + ' Hype. "Evidence."', 'enemy');
    } });
  // snap cheats (one a round while he holds a Fudge token) and phase cheats: chips and lines only, the hooks are his
  cheat({ id: 'svam_reroll', name: 'Reroll!', icon: '🎲', snap: true,
    desc: 'The first stun, sleep, freeze or root that would land on him this round doesn\'t.',
    quips: ['Ooh, a stun? Reroll.', 'I rolled again. I liked the second one better.'],
    counter: 'DM (whispering): "He fudges one a round. Bait it with something cheap, then stun him for real."' });
  cheat({ id: 'svam_nat1', name: 'That\'s a 1 Now', icon: '1️⃣', snap: true,
    desc: 'The first hit of ' + N.snapMin + '+ damage on him this round deals 1.',
    quips: ['That roll? It was a 1. I saw it. Nobody else did.', 'Natural 1! Trust me. I\'m a professional.'],
    counter: 'DM (whispering): "One big hit a round turns into a 1. Poke first, then swing."' });
  cheat({ id: 'svam_nat20', name: 'Initiative? Natural 20.', icon: '🎯', phase: true,
    desc: 'His round-1 initiative roll is a 20.',
    quips: ['Natural 20! Take my word for it. My word is law.', 'Twenty! Again! The odds? One. The odds are one.'],
    counter: 'DM (whispering): "He goes first. Put the sturdy one in front and keep the squishy ones off the edge."' });
  cheat({ id: 'svam_go_twice', name: 'I Go Twice', icon: '⏩', phase: true, desc: 'He takes ' + words(N.p2Turns) + ' turns a round.',
    quips: ['Initiative? I take two. I, SVAMMIEL, CONTROL ALL.'],
    counter: 'DM (whispering): "Two turns now. A stun costs him one of them. Save it for a wind-up."' });
  cheat({ id: 'svam_scheduling', name: 'You Can\'t Skip My Cutscenes', icon: '🎬', phase: true,
    desc: 'His phases can\'t be skipped, and he can\'t die before phase 3.',
    quips: ['You can\'t skip my phases. I wrote them.', 'Can\'t kill me yet. Scheduling conflict.'],
    counter: 'DM (whispering): "Each phase holds until the next round. Burst after the flip, not across it."' });
  cheat({ id: 'svam_no_more_floor', name: 'No More Floor', icon: '🧨', phase: true,
    desc: 'At the end of every round the two marked outer panels drop for good.',
    quips: ['FINE. NO MORE FLOOR.', 'I own the floor. I can remove the floor.'],
    counter: 'DM (whispering): "Read the marks and fight toward the middle. A Ruling saves one round\'s floor."' });
  cheat({ id: 'svam_retcon', name: 'Pencilled HP', icon: '✏️', phase: true,
    desc: 'At the end of each round he erases up to ' + N.pencil + ' of the damage he took that round per standing Master Die (never more than ' + shareText() + ' of it).',
    quips: ['I had more HP than that. I wrote it in pencil.', 'Continuity error! Fixed. You never hit me.'],
    counter: 'DM (whispering): "Every Master Die you break is five less he can rub out."' });
  cheat({ id: 'svam_real_dice', name: 'My REAL Dice', icon: '🎲', phase: true,
    desc: 'Three Master Dice appear on far panels. Break all three to catch him cheating.',
    quips: ['Fine. My REAL dice. Don\'t touch them.', 'These dice are honest. Honestly mine.'],
    counter: 'DM (whispering): "Shooters on the dice, fighters on him. Break all three and I can finally call it."' });

  /** End of a Tilt round: every grounded, movable unit slides that way (downhill first): bumps 3, the void = a fall. */
  function tilt(st, F, dir) {
    const svam = findSvam(st);
    const list = st.units.filter(function (u) { return active(u) && grounded(u) && !DD.Act.isImmovable(u); });
    list.sort(function (a, b) { return (b.x * dir.x + b.y * dir.y) - (a.x * dir.x + a.y * dir.y) || st.units.indexOf(a) - st.units.indexOf(b); });
    let falls = 0;
    list.forEach(function (u) {
      if (!active(u) || !grounded(u)) return;
      const r = DD.Act.push(svam || null, u, dir, N.tiltDist, { bump: N.tiltBump });
      if (r && r.fell) { falls++; if (u.kind === 'hero') F.stats.falls++; }
    });
    DD.FX.shake(5, 300);
    if (!sim()) DD.Act.log('The floor tilts. Everything not nailed down slides' + (falls ? ' (' + plural(falls, 'fall') + ')' : '') + '.', 'enemy');
  }
  /** End of a New Seating Chart round: the units on the two chairs trade places (DD.Act.swap / teleport, never provoking). */
  function seating(st, F, a, b) {
    const ua = G().unitAt(a.x, a.y), ub = G().unitAt(b.x, b.y);
    const okFor = function (u, p) { return !G().isDrop(p.x, p.y) || G().isFlying(u); };
    let moved = false;
    if (ua && ub && !ua.dead && !ub.dead) moved = okFor(ua, b) && okFor(ub, a) && DD.Act.swap(ua, ub);
    else if (ua || ub) {
      const u = ua || ub, to = ua ? b : a;
      if (!u.dead && !DD.Act.isImmovable(u) && G().isFree(to.x, to.y, u) && okFor(u, to)) moved = DD.Act.teleport(u, to.x, to.y);
    }
    if (!sim()) DD.Act.log(moved ? 'New seating chart! Somebody is sitting somewhere else now.' : 'New seating chart: nobody moved. Svammiel pretends that was the plan.', 'enemy');
  }
  /** End of a Panel Swap round: units (grounded, movable), objects, terrain and surfaces trade panels, same offsets. */
  function swapPanels(st, F, aId, bId) {
    const A = panel(F, aId), B = panel(F, bId);
    if (!A || !B || !present(F, aId) || !present(F, bId)) return false;
    const movers = [], dest = {};
    A.tiles.forEach(function (ta, i) {
      const tb = B.tiles[i];
      if (!tb) return;
      [[ta, tb], [tb, ta]].forEach(function (pair) {
        const u = G().unitAt(pair[0].x, pair[0].y);
        if (u && !u.dead && grounded(u) && !DD.Act.isImmovable(u)) { movers.push(u); dest[u.id] = { x: pair[1].x, y: pair[1].y }; }
      });
    });
    // the tiles themselves (floor, lava, surfaces, objects) ride their panel
    A.tiles.forEach(function (qa, i) {
      const qb = B.tiles[i];
      if (!qb) return;
      const ta = G().tile(qa.x, qa.y), tb = G().tile(qb.x, qb.y);
      const sw = function (k) { const v = ta[k]; ta[k] = tb[k]; tb[k] = v; };
      sw('t'); sw('surface'); sw('obj');
    });
    // lava from an earlier cheat rides along (it still cools on time)
    F.lava.forEach(function (L) {
      L.tiles = L.tiles.map(function (q) {
        const ia = A.tiles.findIndex(function (p) { return p.x === q.x && p.y === q.y; });
        if (ia >= 0 && B.tiles[ia]) return { x: B.tiles[ia].x, y: B.tiles[ia].y };
        const ib = B.tiles.findIndex(function (p) { return p.x === q.x && p.y === q.y; });
        return ib >= 0 && A.tiles[ib] ? { x: A.tiles[ib].x, y: A.tiles[ib].y } : q;
      });
    });
    const from = {};
    movers.forEach(function (u) { from[u.id] = { x: u.x, y: u.y }; u.x = -99; u.y = -99; });
    movers.forEach(function (u) {
      let to = dest[u.id];
      if (!G().isFree(to.x, to.y, u)) {
        // its seat is taken (a flyer hovering there): the nearest free tile of the panel it rides, else the nearest at all
        const home = onList(A.tiles, to) ? A : B;
        const spare = home.tiles.filter(function (q) { return G().isFree(q.x, q.y, u) && !G().isDrop(q.x, q.y); })
          .sort(function (p, q) { return (Math.abs(p.x - to.x) + Math.abs(p.y - to.y)) - (Math.abs(q.x - to.x) + Math.abs(q.y - to.y)) || p.y - q.y || p.x - q.x; })[0];
        to = spare || G().nearestFree(to.x, to.y, u) || from[u.id];
      }
      u.x = to.x; u.y = to.y;
      DD.FX.teleport(u, from[u.id], to, { parallel: true });
    });
    // an object that landed under a unit that stayed (a flyer, the immovable) rolls off to the nearest free tile
    A.tiles.concat(B.tiles).forEach(function (q) {
      const t = G().tile(q.x, q.y), here = G().unitAt(q.x, q.y);
      if (t.obj && here && G().objBlocksMove(t.obj)) {
        const to = tumbleSpot(F, q, []);
        if (to) moveObject(q, to); else t.obj = null;
      }
    });
    DD.Act.touch();
    DD.FX.shake(4, 260);
    if (!sim()) DD.Act.log('Panels ' + aId + ' and ' + bId + ' swap places, with everything on them.', 'enemy');
    return true;
  }
  /** Bring a Friend: up to two imps on the marked tiles (at most four alive); they clock in for the round they arrive. */
  function bringImps(st, F, tiles) {
    const alive = st.units.filter(function (u) { return active(u) && u.defId === IMP; }).length;
    let n = Math.min(N.impsPer, N.impsAlive - alive);
    const names = [];
    (tiles || []).forEach(function (p) {
      if (n <= 0) return;
      const u = DD.Act.spawn(IMP, p.x, p.y, { silent: true });
      if (!u) return;
      n--;
      u.data.clockIn = st.round;
      DD.Act.addStatus(u, CLOCK, { turns: 1, silent: true }, null);
      names.push(u.name);
      F.stats.imps++;
    });
    if (names.length && !sim()) DD.Act.log(words(names.length).charAt(0).toUpperCase() + words(names.length).slice(1) + ' Floor Staff ' + (names.length === 1 ? 'Imp clocks' : 'Imps clock') + ' in. They act from next round.', 'enemy');
    return names.length;
  }

  // ---- Rulings: the demoted DM at the kids' table -------------------------------------------------------------------
  function rulingOpen(st, F) {
    st = st || S(); F = F || peek(st);
    if (!st || !F || F.caught || F.rulings <= 0 || F.rulingRound === st.round || st.round < 1 || !findSvam(st)) return false;
    return F.phase >= 3 ? !!F.drop : !!cancelTarget(F);
  }
  /** What the Ruling would save the party right now (AutoPlay's hint: the cancelled cheat's harm; Rule Zero 0). */
  function rulingValue(st) {
    st = st || S();
    const F = peek(st);
    if (!rulingOpen(st, F)) return 0;
    const hs = heroes(st).filter(grounded);
    if (F.phase >= 3) {
      let v = 0;
      F.drop.ids.forEach(function (id) { const p = panel(F, id); if (p) hs.forEach(function (h) { if (onList(p.tiles, h)) v += fallDmg(h); }); });
      return v;
    }
    const c = cancelTarget(F);
    switch (c.id) {
      case 'svam_rule_zero': return 0;
      case 'svam_lava': { const p = panel(F, c.data.panel); return p ? hs.filter(function (h) { return onList(p.tiles, h); }).length * N.lava : 0; }
      case 'svam_tilt': {
        const dir = (LANDMARK[c.data.dir] || LANDMARK.throne).dir;
        let v = 0;
        hs.forEach(function (h) { if (!DD.Act.isImmovable(h)) { const o = slideOutcome(h, h, dir); v += o.fall ? fallDmg(h) : o.bump ? N.tiltBump : 0; } });
        return v;
      }
      case 'svam_ban': { const sk = DD.getSkill(c.data.skillId); const L = sk ? DD.skillLevel(sk, 1) : null; return L && L.dmg > 0 ? L.dmg : 8; }
      case 'svam_hype_tax': return Math.round(Math.min(N.hypeTax, st.hype || 0) * 0.3);
      default: return 8;
    }
  }
  function askRuling(unit, o, tile) {
    const st = S(), F = fight(st), svam = findSvam(st);
    if (!rulingOpen(st, F)) { DD.FX.text(tile, 'No ruling needed.', { color: '#d0d0d0', size: 14 }); return false; }
    F.rulings--;
    F.rulingRound = st.round;
    F.stats.rulings++;
    if (!sim()) {
      DD.FX.text(tile, 'OBJECTION!', { color: '#ffe680', size: 17 });
      DD.Act.log('The DM, from the kids\' table: "OBJECTION! That is not Rules As Written!"', 'narrator');
    }
    if (F.phase >= 3) {
      F.drop.round++;
      if (!sim()) DD.Act.log('⚖️ Ruling: the next panel drop (' + F.drop.ids.join(', ') + ') is cancelled. It happens a round later.', 'hero');
    } else cancelCheat(st, F, cancelTarget(F));
    if (svam) {
      DD.Act.bark(svam, 'ruling');
      DD.Act.withCredit(unit, function () { DD.Act.damage(null, svam, N.rulingDmg, { cause: 'other', ignoreArmor: true, tags: ['ruling'] }); });
    }
    syncRulings(st, F);
    updateBoard(st);
    return true;
  }
  function syncRulings(st, F) {
    const r = st.rules.filter(function (x) { return x.id === RULINGS_RULE; })[0];
    if (F.caught) { if (r) DD.Act.removeRule(RULINGS_RULE); return; }
    const name = 'Rulings: ' + F.rulings;
    const desc = 'Ask the DM at the kids\' table (interact, 1 AP, from the panel next to him, once a round): cancels this round\'s cheat (or next ' +
      'round\'s, if none is active); in phase 3, the next panel drop. Svammiel takes ' + N.rulingDmg + ' damage. +' + N.rulings +
      ' each phase, +1 per Rigged Die broken.';
    if (r) { if (r.name !== name) { r.name = name; r.desc = desc; DD.Act.touch(); } }
    else DD.Act.addRule({ id: RULINGS_RULE, name: name, icon: '⚖️', desc: desc, turns: -1, hooks: {}, silent: true, source: ACTOR });
  }

  // ---- Fudge tokens and the snap cheats ----------------------------------------------------------------------------
  function syncFudge(u, F) {
    if (!u || u.dead) return;
    const st = (u.statuses || []).filter(function (s) { return s.id === FUDGE; })[0];
    if (F.fudge > 0 && !F.caught) {
      if (!st) DD.Act.addStatus(u, FUDGE, { stacks: F.fudge, turns: -1, silent: true }, u);
      else if (st.stacks !== F.fudge) { st.stacks = F.fudge; DD.Act.touch(); }
      const now = (u.statuses || []).filter(function (s) { return s.id === FUDGE; })[0];
      if (now && now.stacks !== F.fudge) { now.stacks = F.fudge; DD.Act.touch(); }
    } else if (st) DD.Act.removeStatus(u, FUDGE, { silent: true });
  }
  function snapReady(st, F) { return !!F && !F.caught && F.fudge > 0 && F.snapRound !== st.round && st.round >= 1; }
  function spendSnap(st, F, u, id, extra) {
    F.fudge--;
    F.snapRound = st.round;
    F.stats.snaps++;
    syncFudge(u, F);
    const def = CH[id];
    if (!sim()) {
      DD.FX.text(u, def.icon + ' ' + def.name, { color: '#ff7a5c', size: 16 });
      sayQuip(u, def);
      cheatLog(F, dotted(def.name) + ' ' + def.desc + (extra || '') + ' (Fudge left: ' + F.fudge + '.)');
    }
  }

  // ---- phases (the DM's gates: no skipping, no death before phase 3) -------------------------------------------------
  function threshold(u, phase) { return Math.ceil(u.maxHp * (phase === 2 ? N.p2 : N.p3)); }
  function floorOf(u, phase) { return phase === 1 ? threshold(u, 2) : phase === 2 ? threshold(u, 3) : 0; }
  function floorHp(u, F) { return floorOf(u, F.phase); }
  function phaseChip(st, which, on) {
    const id = PHASE_RULE[which];
    const map = { nat20: 'svam_nat20', twice: 'svam_go_twice', cutscenes: 'svam_scheduling', floor: 'svam_no_more_floor', pencil: 'svam_retcon', dice: 'svam_real_dice' };
    const def = CH[map[which]];
    const have = st.rules.some(function (r) { return r.id === id; });
    if (on && !have) DD.Act.addRule({ id: id, name: def.name, icon: def.icon, desc: def.desc, turns: which === 'nat20' ? 1 : -1,
      hooks: which === 'nat20' ? { modifyInitiative: nat20Init } : {}, cheat: true, source: ACTOR, silent: true });
    else if (!on && have) DD.Act.removeRule(id);
  }
  function phaseCheatLine(st, F, id) {
    const def = CH[id];
    countCheat(st, F, id);
    if (sim()) return;
    sayQuip(findSvam(st), def);
    cheatLog(F, dotted(def.name) + ' ' + def.desc);
    counterWhisper(def);
  }
  function enterPhase(u, phase) {
    const st = S(), F = fight(st);
    F.phase = phase;
    F.lastShift = st.round;
    F.armored = false;
    F.stats['phase' + phase] = st.round || 1;
    // QA FIGHTS-07: broken Rigged Dice lower the refill, but a new phase always deals him at least N.fudgeFloor
    F.fudge = Math.max(N.fudgeFloor, F.fudgeMax);
    F.rulings += N.rulings;
    if (phase === 2) {
      F.twiceFrom = st.round + 1;
      u.turnsPerRound = N.p2Turns;
      if (!sim()) {
        DD.FX.banner('I, SVAMMIEL, CONTROL ALL', { sub: 'I go twice.', color: '#ff4a3a', ms: 1400, fit: true });
        DD.FX.shake(8, 380);
        DD.Act.log('PHASE 2: I, SVAMMIEL, CONTROL ALL. From next round he takes ' + words(N.p2Turns) + ' turns a round; Floor Collapse and Hellfire Rain take turns. Fudge refilled, +' +
          N.rulings + ' Rulings.', 'enemy');
        DD.Act.narrate('svam_phase2', {});
        DD.Act.bark(u, 'phase2');
      }
      phaseChip(st, 'twice', true);
      phaseCheatLine(st, F, 'svam_go_twice');
    } else if (phase === 3) {
      u.turnsPerRound = 1;
      F.twiceFrom = 0;
      F.taken = 0;
      phaseChip(st, 'twice', false);
      // Round Cheats stop (he is busy): the announced one never goes live; this round's plays out
      if (F.next) { DD.Act.removeRule(NEXT_RULE); F.next = null; }
      const placed = placeMasterDice(st, F);
      markDrops(st, F, st.round + 1);
      if (!sim()) {
        DD.FX.banner('FINE. NO MORE FLOOR.', { sub: 'Break his ' + words(placed) + ' Master Dice before the floor runs out.', color: '#ff4a3a', ms: 1400, fit: true });
        DD.FX.shake(12, 500);
        DD.Act.log('PHASE 3: FINE. NO MORE FLOOR. Two marked outer panels drop for good at the end of every round. ' + (placed ? words(placed).charAt(0).toUpperCase() +
          words(placed).slice(1) + ' Master Dice appeared: break ' + (placed > 1 ? 'all of them' : 'it') + ' to catch him cheating.' : 'No room for his Master Dice: no catching him this time.') +
          ' One turn a round again: ' + actsText().toLowerCase() + ', Hellfire Rain wind-ups. Fudge refilled, +' + N.rulings + ' Rulings.', 'enemy');
        DD.Act.narrate('svam_phase3', {});
        DD.Act.bark(u, 'phase3');
      }
      phaseChip(st, 'floor', true);
      phaseChip(st, 'pencil', true);
      phaseChip(st, 'dice', true);
      phaseCheatLine(st, F, 'svam_no_more_floor');
    }
    syncFudge(u, F);
    syncRulings(st, F);
    updateBoard(st);
  }
  function syncPhase(u) {
    const F = fight();
    const want = u.hp <= threshold(u, 3) ? 3 : u.hp <= threshold(u, 2) ? 2 : 1;
    while (F.phase < want) enterPhase(u, F.phase + 1);
  }
  function syncKit(u) {
    const F = fight();
    const want = F.caught ? KIT.caught : KIT.normal;
    const cur = u.skillSlots || [];
    if (cur.length === want.length && cur.every(function (sl, i) { return sl.id === want[i]; })) return;
    u.skillSlots = want.map(function (id) { return cur.filter(function (sl) { return sl.id === id; })[0] || DD.Act.makeSlot(id, 1); });
    DD.Act.touch();
  }

  // ---- phase 3: Master Dice, No More Floor, Pencilled HP; CAUGHT CHEATING -------------------------------------------
  /** Three Master Dice on the walker-reachable outer panels farthest from the party, in three different columns. */
  function placeMasterDice(st, F) {
    const c = partyCentre(st) || { x: st.grid.w / 2, y: st.grid.h };
    const walkers = heroes(st).filter(grounded);
    const reach = {};
    (walkers.length ? walkers : heroes(st)).forEach(function (h) {
      reach[key(h)] = 1;
      G().reachable(h, 60, { ignoreUnits: true }).forEach(function (e) { reach[e.x + ',' + e.y] = 1; });
    });
    const free = function (q) { const t = G().tile(q.x, q.y); return !!t && !t.obj && !G().unitAt(q.x, q.y) && !G().isDrop(q.x, q.y); };
    const reachable = function (q) { return reach[key(q)] || U.DIRS.some(function (d) { return reach[(q.x + d.x) + ',' + (q.y + d.y)]; }); };
    const cands = OUTER.filter(function (id) { return present(F, id); }).map(function (id) {
      const p = F.panels[id];
      const spot = p.tiles.filter(function (q) { return free(q) && reachable(q); })
        .sort(function (a, b) { return (Math.abs(a.x - p.cx) + Math.abs(a.y - p.cy)) - (Math.abs(b.x - p.cx) + Math.abs(b.y - p.cy)) || a.y - b.y || a.x - b.x; })[0];
      return spot ? { id: id, col: p.col, spot: spot, d: Math.abs(p.cx - c.x) + Math.abs(p.cy - c.y) } : null;
    }).filter(Boolean);
    cands.sort(function (a, b) { return b.d - a.d || OUTER.indexOf(a.id) - OUTER.indexOf(b.id); });
    const picks = [];
    cands.forEach(function (k) { if (picks.length < N.masterDice && picks.every(function (q) { return q.col !== k.col; })) picks.push(k); });
    picks.forEach(function (k, i) {
      DD.Act.placeObject(k.spot.x, k.spot.y, MASTER, { hp: N.masterHp, maxHp: N.masterHp, label: 'Master Die (' + (i + 1) + '/' + picks.length + ')', data: { n: i + 1 } });
      DD.FX.particles(k.spot, { kind: 'glitter', count: 14, color: '#ffd34d' });
      DD.FX.tile(k.spot.x, k.spot.y, 'glow', { color: '#ffd34d' });
    });
    F.masterPlaced = picks.length;
    F.master = 0;
    return picks.length;
  }
  function standingMaster() { return G().allTiles().filter(function (t) { return t.obj && t.obj.id === MASTER; }).length; }
  /** Mark the next outer panels to drop for good at the end of round r (most grounded heroes first, ties clockwise from A1). */
  function markDrops(st, F, r) {
    const cands = CLOCKWISE.filter(function (id) { return panel(F, id) && !isGone(F, id); });
    cands.sort(function (a, b) { return groundedHeroesOn(st, F, b) - groundedHeroesOn(st, F, a) || CLOCKWISE.indexOf(a) - CLOCKWISE.indexOf(b); });
    const ids = cands.slice(0, N.dropPerRound);
    F.drop = ids.length ? { ids: ids, round: r } : null;
    if (F.drop && !sim()) DD.Act.log('Next panels to drop for good (end of round ' + r + '): ' + ids.join(', ') + '.', 'enemy');
    updateBoard(st);
  }
  function dropFloor(st, F) {
    if (!F.drop || F.drop.round > st.round) return 0;
    const u = findSvam(st);
    const ids = F.drop.ids.filter(function (id) { return !isGone(F, id); });
    tumbleDice(F, ids);
    // both marked panels at once: a hero on one never climbs out onto the other (QA FIGHTS-02)
    dropPanels(F, ids, { src: u });
    F.stats.drops += ids.length;
    if (ids.length && !sim()) {
      DD.FX.shake(10, 450);
      DD.Act.log('Panels ' + ids.join(' and ') + ' fall into the void for good.', 'enemy');
    }
    F.drop = null;
    markDrops(st, F, st.round + 1);
    return ids.length;
  }
  function pencil(st, F, u) {
    if (F.caught || F.phase < 3 || !active(u)) return 0;
    const n = standingMaster();
    const cap = Math.max(0, threshold(u, 3) - u.hp);
    // never more than a share of the round's damage: the slow road (no dice broken) always gets somewhere
    const amount = Math.min(Math.floor(F.taken * N.pencilShare), N.pencil * n, cap);
    F.taken = 0;
    if (amount <= 0) return 0;
    const healed = DD.Act.heal(null, u, amount, { silent: true, cause: 'status' });
    F.stats.pencil += healed;
    if (healed > 0 && !sim()) {
      DD.FX.text(u, '✏️ +' + healed + ' (pencil)', { color: '#ffe680', size: 15 });
      DD.Act.log('Svammiel rubs out ' + healed + ' damage. He used a pencil.', 'enemy');
    }
    return healed;
  }
  function caughtCheating(u, src) {
    const st = S(), F = fight(st);
    if (F.caught) return;
    F.caught = true;
    F.stats.caught = st.round || 1;
    F.drop = null;
    F.fudge = 0;
    // the live cheat is cancelled before its chip goes (its end-of-round effect never plays)
    if (F.cur) { F.cur.cancelled = true; F.cur = null; }
    [NEXT_RULE, CUR_RULE, PHASE_RULE.floor, PHASE_RULE.pencil, PHASE_RULE.dice, PHASE_RULE.twice].forEach(function (id) { DD.Act.removeRule(id); });
    F.next = null;
    u.turnsPerRound = 1;
    syncFudge(u, F);
    syncRulings(st, F);
    DD.AI.cancelIntents(u, 'Caught!', {});
    DD.Act.addStatus(u, CAUGHT, { turns: -1 }, src || null);
    syncKit(u);
    if (!sim()) {
      DD.FX.banner('CAUGHT CHEATING', { sub: 'The DM: "I\'ve waited four editions for this."', color: '#ffd34d', ms: 1500, fit: true });
      DD.FX.shake(12, 500);
      DD.Act.log('CAUGHT CHEATING! His wings fold, his dice are honest, and the floor stops listening to him: ' + caughtText() + ' damage taken, every fall costs him ' + N.fall +
        ', one action a turn, no wind-ups, no cheats.', 'hero');
      DD.Act.log('The DM, from the kids\' table: "CAUGHT. CHEATING. I\'ve waited four editions for this."', 'narrator');
      DD.Act.bark(u, 'caught');
    }
    // grounded last: over his own void he drops at once (a flight status gone over a pit is a fall: 30 for him)
    DD.Act.withCredit(src || null, function () { DD.Act.removeStatus(u, WINGS, { text: 'Grounded!' }); });
    updateBoard(st);
  }

  // ---- marks on the board (E8 zones), the objective subtitle and his inspect line ------------------------------------
  function updateBoard(st) {
    st = st || S();
    const F = peek(st);
    if (!st || !F) return;
    const zones = [];
    const add = function (tiles, color, label, line) { if (tiles && tiles.length) zones.push({ tiles: tiles.map(function (q) { return { x: q.x, y: q.y }; }), color: color, label: label, line: line || null }); };
    [F.cur, F.next].forEach(function (c) {
      if (!c || c.cancelled || c.resolved) return;
      const def = surface(c), when = c === F.next ? 'next round' : 'this round';
      const d = c.data || {};
      if (d.panel && panel(F, d.panel)) add(panel(F, d.panel).tiles, '#ff6a1f', def.icon + ' Lava (' + when + ')');
      if (d.panels) d.panels.forEach(function (id) { if (panel(F, id)) add(panel(F, id).tiles, '#7a2cff', def.icon + ' Swap ' + d.panels.join('↔') + ' (' + when + ')'); });
      if (d.a && d.b) add([d.a, d.b], '#ff4fa3', def.icon + ' Chairs (' + when + ')', [d.a, d.b]);
      if (d.tiles && c.id === 'svam_wander' && !c.started) add(d.tiles, '#ffd34d', def.icon + ' Imps arrive (' + when + ')');
      if (d.dir && c.id === 'svam_tilt') {
        const L = LANDMARK[d.dir] || LANDMARK.throne;
        const edge = [];
        F.panelOrder.forEach(function (id) { if (present(F, id)) F.panels[id].tiles.forEach(function (q) { if (G().isDrop(q.x + L.dir.x, q.y + L.dir.y) || G().isDrop(q.x + 2 * L.dir.x, q.y + 2 * L.dir.y) || !G().inBounds(q.x + L.dir.x, q.y + L.dir.y)) edge.push(q); }); });
        add(edge, '#b03aff', def.icon + ' Tilt ' + L.text + ' (' + when + ')');
      }
    });
    if (F.drop) F.drop.ids.forEach(function (id) { if (panel(F, id)) add(panel(F, id).tiles, '#ff2a2a', '🧨 Drops end of round ' + F.drop.round); });
    st.data.zones = zones;
    updateFlavor(st);
    DD.Act.touch();
  }
  function cheatName(c) { return c && !c.cancelled ? surface(c).name + (c.id === 'svam_tilt' ? ' (' + (LANDMARK[c.data.dir] || LANDMARK.throne).text + ')' : '') : 'none'; }
  function updateFlavor(st) {
    st = st || S();
    const F = peek(st), u = findSvam(st);
    if (!st || !F || !st.objective || !u) return;
    let text;
    if (F.caught) text = 'CAUGHT CHEATING: no more cheats. Knock him into the void (' + N.fall + ' a fall) and finish him!';
    else if (F.phase >= 3) {
      text = 'Master Dice ' + standingMaster() + '/' + F.masterPlaced + ' standing · next drop: ' + (F.drop ? F.drop.ids.join(', ') + ' (end of round ' + F.drop.round + ')' : 'none') +
        ' · Rulings ' + F.rulings + ' · Fudge ' + F.fudge;
    } else {
      text = 'This round: ' + cheatName(F.cur) + ' · Next cheat: ' + cheatName(F.next) + ' · Rulings ' + F.rulings + ' · Fudge ' + F.fudge;
      if (F.armored) text = 'PLOT ARMOR: he can\'t drop below ' + floorHp(u, F) + ' HP this round. · ' + text;
    }
    if (st.objective.flavor !== text) { st.objective.flavor = text; DD.Act.touch(); }
  }
  function passiveText(u) {
    const st = S();
    const F = u && st && st.units.indexOf(u) >= 0 ? peek(st) : null;
    const snaps = 'Fudge tokens ' + (F ? F.fudge : N.fudge) + ' (snap cheats Reroll! / That\'s a 1 Now, at most one a round).';
    if (!F) return 'He cheats. Each round one cheat, announced a round ahead. ' + snaps + ' Each turn: the attack he wound up lands, one action, then a wind-up.';
    if (F.caught) return 'CAUGHT CHEATING: grounded, an honest d20, ' + caughtText() + ' damage taken, ' + N.fall + ' a fall. One action a turn, no wind-ups, no cheats.';
    if (F.phase >= 3) {
      return 'FINE. NO MORE FLOOR. This round: no round cheat (he is busy). The floor drops ' + N.dropPerRound + ' panels a round (next: ' +
        (F.drop ? F.drop.ids.join(', ') : 'none') + '). Pencilled HP: he erases up to ' + N.pencil + ' per standing Master Die (' + standingMaster() +
        ' standing) of the damage he took each round (never more than ' + shareText() + ' of it). ' + actsText() + ', Hellfire Rain wind-ups. ' + snaps + ' Break all the Master Dice to catch him.';
    }
    const turns = F.phase === 2 ? 'He takes ' + words(N.p2Turns) + ' turns a round. Each turn: one action, then a wind-up if none is pending (at most ' +
      words(N.windsPerRound) + ' new a round; Floor Collapse and Hellfire Rain take turns). A wind-up lands on his first turn after every hero has had one.'
      : 'Each turn: the wind-up from his last turn lands, one action, then a Floor Collapse wind-up on the busiest panel.';
    return 'He cheats. This round: ' + cheatName(F.cur) + '. Next round: ' + cheatName(F.next) + '. ' + snaps + ' ' + turns +
      ' Rulings ' + F.rulings + '.';
  }

  // ---- honest floor threats (threatAt on his def: pure) ----------------------------------------------------------------
  /** Where a 2-tile slide from p would end for unit u: { fall, bump } (other units ignored; walls and objects stop it). */
  function slideOutcome(u, p, dir) {
    let x = p.x, y = p.y;
    for (let k = 0; k < N.tiltDist; k++) {
      const nx = x + dir.x, ny = y + dir.y;
      if (!G().inBounds(nx, ny)) return { bump: true };
      const t = G().tile(nx, ny);
      if (t.obj && G().objBlocksMove(t.obj)) return { bump: true };
      if (G().isDrop(nx, ny)) return { fall: true };
      const td = G().terrain(t);
      if (td.walkable === false) return { bump: true };
      x = nx; y = ny;
    }
    return {};
  }
  function threatAt(enemy, unit, tile) {
    const st = S(), F = peek(st);
    if (!F || !unit || !tile || unit.side !== 'hero' || !isSvam(enemy) || G().isFlying(unit)) return 0;
    let dmg = 0, label = '', fall = false;
    const take = function (n, l, f) { if (n > dmg) { dmg = n; label = l; fall = !!f; } };
    const c = F.cur;
    if (c && !c.cancelled && !c.resolved) {
      if (c.id === 'svam_lava' && panel(F, c.data.panel) && onList(panel(F, c.data.panel).tiles, tile) && !(unit.resist && unit.resist.fire === 0)) take(N.lava, 'The Floor Is Lava');
      if (c.id === 'svam_tilt' && !DD.Act.isImmovable(unit)) {
        const o = slideOutcome(unit, tile, (LANDMARK[c.data.dir] || LANDMARK.throne).dir);
        if (o.fall) take(fallDmg(unit), 'The Tilt (into the void)', true); else if (o.bump) take(N.tiltBump, 'The Tilt (bump)');
      }
    }
    (enemy.intents || []).forEach(function (it) {
      if (it.skillId === 'svam_collapse' && onList(it.tiles || [], tile)) take(fallDmg(unit), 'Floor Collapse', true);
    });
    if (F.drop && F.drop.round <= st.round) F.drop.ids.forEach(function (id) { const p = panel(F, id); if (p && onList(p.tiles, tile)) take(fallDmg(unit), 'No More Floor', true); });
    return dmg > 0 ? { dmg: dmg, label: label, ignoreBlock: fall } : 0;
  }

  // ---- hooks on Svammiel ---------------------------------------------------------------------------------------------
  function nat20Init(r) {
    const st = S();
    if (!r || !isSvam(r.unit) || !st || st.round !== 0 || r.k) return;
    r.roll = 20;
    r.total = 20 + (r.init || 0);
  }
  function trackDamage(st, F, d) {
    const h = d.credit;
    if (!h || h.kind !== 'hero' || !d.skill || !(d.dealt > 0)) return;
    if (!(h.skills || []).some(function (sl) { return sl.id === d.skill.id; })) return;
    const log = F.dmg[st.round] || (F.dmg[st.round] = {});
    const k = h.id + '|' + d.skill.id;
    log[k] = (log[k] || 0) + d.dealt;
  }
  const HOOKS = {
    onCombatStart: function (unit) {
      const st = S();
      const F = fight(st);
      if (st.grid && st.grid.tiles.some(function (t) { return t.t === FLOOR; })) ensurePanels(st);
      if (!F.caught && !has(unit, WINGS)) DD.Act.addStatus(unit, WINGS, { turns: -1, silent: true }, unit);
      syncFudge(unit, F);
      syncKit(unit);
    },
    onTurnStart: function (unit) { if (isSvam(unit)) fight().lostTurn = DD.Act.isStunned(unit); },
    onTurnEnd: function (unit) {
      if (!isSvam(unit)) return;
      const F = fight(), st = S();
      if (F.lostTurn) F.stats.lost++;
      else if (F.guard && st && st.turn > F.guard.turn) {
        F.guard = null;
        if (has(unit, GUARD)) DD.Act.removeStatus(unit, GUARD, { silent: true });
      }
      F.lostTurn = false;
      updateFlavor(st);
    },
    /** Don't Stun the DM (the stun guard), then Reroll! (a snap cheat: one Fudge token, one a round). */
    modifyStatus: function (m) {
      if (!isSvam(m.unit) || m.src === m.unit) return;
      const st = S(), F = peek(st);
      if (!F) return;
      const stunLike = DD.Act.isStunLike(m.id);
      if (stunLike && F.guard) {
        m.cancel = true;
        F.stats.refused++;
        if (!sim()) DD.FX.text(m.unit, '😈 Don\'t Stun the DM: shrugs it off', { color: '#dddddd', size: 14 });
        return;
      }
      if ((stunLike || m.id === 'root') && snapReady(st, F)) {
        m.cancel = true;
        spendSnap(st, F, m.unit, 'svam_reroll', ' (' + ((DD.getStatus(m.id) || {}).name || m.id) + ' refused.)');
      }
    },
    onStatusApplied: function (unit, inst) {
      if (!isSvam(unit) || !inst || !DD.Act.isStunLike(inst.id)) return;
      const F = fight(), st = S();
      F.stats.stuns++;
      F.guard = { turn: st ? st.turn : 0 };
      if (!has(unit, GUARD)) DD.Act.addStatus(unit, GUARD, { turns: -1, silent: true }, unit);
      DD.Act.maybeBark(unit, 'stunned', 0.7);
    },
    /** Fire and poison ×0.5 while he flies uncaught (mirrored in estimateTaken). */
    modifyIncomingDamage: function (d) {
      if (!isSvam(d.target)) return;
      const F = peek();
      if (F && !F.caught && (d.element === 'fire' || d.element === 'poison')) d.mult *= 0.5;
    },
    estimateTaken: function (e) {
      if (!isSvam(e.target)) return;
      const st = S(), F = peek(st);
      if (!F || F.caught) return;
      if (e.element === 'fire' || e.element === 'poison') e.mult *= 0.5;
      if (snapReady(st, F) && (e.base || 0) * e.mult + (e.flat || 0) >= N.snapMin) { e.mult = 0; e.flat = 1; }
    },
    /**
     * The last word on a hit: a fall costs him a flat 30; That's a 1 Now (a snap cheat) turns the round's first 20+ hit
     * into 1; then the phase gate clamps (You Can't Skip My Cutscenes: the DM's Plot Armor pattern).
     */
    modifyFinalDamage: function (dd) {
      const u = dd.target;
      if (!isSvam(u) || u.dead) return;
      const st = S(), F = fight(st);
      if (dd.cause === 'fall') dd.amount = N.fall;
      else if (dd.cause === 'skill' && dd.amount >= N.snapMin && snapReady(st, F)) {
        const was = dd.amount;
        dd.amount = 1;
        spendSnap(st, F, u, 'svam_nat1', ' (' + was + ' became 1.)');
      }
      const fl0 = floorHp(u, F);
      if (fl0 <= 0) return;
      const absorb = dd.ignoreBlock ? 0 : Math.min(u.block || 0, dd.amount);
      const after = u.hp - (dd.amount - absorb);
      if (after > fl0) return;
      const fl = F.lastShift !== st.round ? floorOf(u, F.phase + 1) : fl0;
      if (fl > 0 && after < fl) dd.amount = Math.max(0, u.hp - fl + absorb);
    },
    onTakeDamage: function (dd) {
      const u = dd.target;
      if (!isSvam(u) || u.dead) return;
      const st = S(), F = fight(st);
      F.taken += dd.dealt || 0;
      trackDamage(st, F, dd);
      if (floorHp(u, F) <= 0 || u.hp > floorHp(u, F)) { updateFlavor(st); return; }
      if (F.lastShift !== st.round) enterPhase(u, F.phase + 1);
      const fl = floorHp(u, F);
      if (fl > 0 && u.hp <= fl) {
        if (u.hp < fl) DD.Act.heal(null, u, fl - u.hp, { silent: true, cause: 'status' });
        if (!F.armored) {
          F.armored = true;
          F.armoredAt = st.round;
          if (!sim()) {
            DD.FX.text(u, '🎬 You can\'t skip my cutscenes!', { color: '#ffe680', size: 16 });
            DD.Act.log('You Can\'t Skip My Cutscenes: Svammiel refuses to drop below ' + fl + ' HP until next round.', 'enemy');
          }
        }
      }
      updateFlavor(st);
    },
    onDeath: function (unit) {
      const st = S(), F = fight(st);
      // his chips go quietly with him (no "Rule ended" spam on the victory screen)
      const mine = [NEXT_RULE, CUR_RULE, RULINGS_RULE].concat(Object.keys(PHASE_RULE).map(function (k) { return PHASE_RULE[k]; }));
      st.rules = st.rules.filter(function (r) { return mine.indexOf(r.id) < 0; });
      F.next = null; F.cur = null; F.drop = null;
      st.data.zones = [];
      DD.FX.tile(unit.x, unit.y, 'crack');
      DD.FX.sound('slide_whistle');
      DD.FX.banner('THE FLOOR GIVES WAY', { sub: 'I CONTROL... ALL... except... graaavityyyy...', color: '#ff4a3a', ms: 1600, fit: true });
      DD.Act.log('Svammiel falls through his own floor. The floor boss, floored.', 'narrator');
      DD.Act.log('"Fine. FINE. You win." A very long pause, from very far below. "...Same time next week?"', 'cameo', { speaker: 'Svammiel', actor: ACTOR });
      DD.Act.narrate('svam_defeat', {});
    },
    threatAt: threatAt,
  };

  // ---- his turn ------------------------------------------------------------------------------------------------------
  function entriesOf(st, u) { return st.order ? st.order.filter(function (e) { return e.unitId === u.id; }).length : 1; }
  function adjacentTo(p, q) { return Math.abs(p.x - q.x) + Math.abs(p.y - q.y) === 1; }
  /** Target value biases: he hates Rulings (+8 next to the kids' table) and, in phase 3, hands on his dice (+6). */
  function bias(st, F, o) {
    let b = 0;
    if (o.kind === 'hero') {
      if (G().allTiles().some(function (t) { return t.obj && t.obj.id === TABLE && adjacentTo(t, o); })) b += N.nearTable;
      if (F.phase >= 3 && !F.caught && G().allTiles().some(function (t) { return t.obj && t.obj.id === MASTER && adjacentTo(t, o); })) b += N.nearDie;
    }
    return b;
  }
  /** Would Wing Buffet knock a grounded, movable hero next to him into the void? */
  function buffetIntoVoid(u, f) {
    if (!active(f) || f.kind !== 'hero' || !grounded(f) || DD.Act.isImmovable(f) || !adjacentTo(u, f)) return false;
    const dir = U.dirTo(u, f);
    return !!slideOutcome(f, f, dir).fall;
  }
  function pickTarget(u, api, st, F, not, noMove) {
    const style = DD.AI.styleOf(u);
    const origin = { x: u.x, y: u.y };
    let best = null, bestSc = -Infinity;
    api.reachableTargets(u, noMove ? { noMove: true } : undefined).forEach(function (e) {
      if (not && e.unit === not) return;
      // he admires his floor from above it: his moves end over a panel, never out over the void (melee can reach him)
      if (e.moveTo && (e.moveTo.x !== u.x || e.moveTo.y !== u.y) && G().isDrop(e.moveTo.x, e.moveTo.y)) return;
      const moves = e.moveTo && (e.moveTo.x !== u.x || e.moveTo.y !== u.y);
      const sc = e.est + DD.AI.targetValue(u, e.unit, e.est, style, origin) - (e.aoo || 0) - (e.cost || 0) * 0.2 + bias(st, F, e.unit) - (moves ? N.walkPenalty : 0);
      if (sc > bestSc) { bestSc = sc; best = e; }
    });
    return best;
  }
  /**
   * A named bark (party-filtered): only lines that name a hero standing in this fight (the engine's party filter only
   * knows registered heroes, and a line may name one whose file has not landed yet).
   */
  function namedBark(u, st) {
    const words = [];
    st.units.forEach(function (h) {
      if (h.kind !== 'hero' || h.dead) return;
      String(h.name || '').split(/[^A-Za-z]+/).forEach(function (w) { if (w.length >= 3 && /^[A-Z]/.test(w) && w !== 'The') words.push(w); });
    });
    const lines = DD.Act.partyLines(BARKS.named).filter(function (l) { return words.some(function (w) { return new RegExp('\\b' + w + '\\b').test(l); }); });
    const text = quietPick(lines);
    if (text) DD.Act.bark(u, text);
    return text;
  }
  /** One action: Wing Buffet when it knocks someone into the void (or two foes crowd him), else his best attack. */
  function actOnce(u, api, st, F, not) {
    const foes = api.foes(u);
    if (!foes.length) return null;
    const near = foes.filter(function (f) { return adjacentTo(u, f) && active(f); });
    if (api.canUse(u, 'svam_buffet') && (near.length >= 2 || near.some(function (f) { return buffetIntoVoid(u, f); }))) {
      if (api.act(u, 'svam_buffet', { x: u.x, y: u.y })) return near[0] || true;
    }
    let best = pickTarget(u, api, st, F, not, false) || (not ? pickTarget(u, api, st, F, null, false) : null);
    if (!best) { api.approach(u); return null; }
    if (best.moveTo && (best.moveTo.x !== u.x || best.moveTo.y !== u.y)) {
      api.moveTo(u, best.moveTo.x, best.moveTo.y);
      if (!active(u) || st.result) return null;
      if (u.x !== best.moveTo.x || u.y !== best.moveTo.y) best = pickTarget(u, api, st, F, not, true);
      if (!best) return null;
    }
    if (api.act(u, best.skillId, best.target)) {
      if (DD.rng.next() < 0.2) namedBark(u, st); else DD.Act.maybeBark(u, 'attack', 0.25);
      return best.unit;
    }
    return null;
  }
  /**
   * QA FIGHTS-01: how many of his own turns a new wind-up waits, so that it lands on his first turn after EVERY hero has
   * had a turn (I Go Twice puts his two entries anywhere in the order: "lands at his next turn" could land before most
   * of the party moved). Walks the initiative order forward the way DD.Combat / DD.AI count a wind-up down (his turn
   * counts it down only once a hero turn has started since the last count). Next round's order: his entries as
   * entriesPerRound says; an entry not rolled yet (phase 2 starts next round) is assumed first, so it never lands early.
   */
  function windTurns(st, u) {
    const order = st.order;
    if (!order || !order.length || st.turnIndex === undefined || st.turnIndex === null) return 1;
    const C = DD.Combat;
    const ctrl = function (x) { return C.isPlayerControlled ? C.isPlayerControlled(x) : x.side === 'hero'; };
    const acts = function (x) { return !!x && !x.dead && (!x.downed || (C.groupOf ? C.groupOf(x).some(active) : false)); };
    const need = {};
    let left = 0;
    order.forEach(function (e) { const x = C.byId(e.unitId); if (x && ctrl(x) && acts(x) && !need[x.id]) { need[x.id] = 1; left++; } });
    if (!left) return 1;
    const mineNow = order.filter(function (e) { return e.unitId === u.id; }).length;
    const mineNext = C.entriesPerRound ? C.entriesPerRound(u) : mineNow;
    const rest = order.slice(st.turnIndex + 1);
    let next = order.filter(function (e) { return e.unitId !== u.id || (e.k || 0) < mineNext; });
    for (let k = mineNow; k < mineNext; k++) next = [{ unitId: u.id, k: k }].concat(next);
    const walk = rest.concat(next, next, next);
    let turns = 0, since = 0;
    for (let i = 0; i < walk.length; i++) {
      const x = C.byId(walk[i].unitId);
      if (x === u) {
        if (since > 0) { turns++; since = 0; if (left <= 0) return turns; }
      } else if (x && ctrl(x) && acts(x)) {
        since++;
        if (need[x.id] === 1) { need[x.id] = 2; left--; }
      }
    }
    return Math.max(1, turns);
  }
  /** Floor Collapse: the panel with the most grounded heroes drops (never A2, never a cheat's marked panel). */
  function windCollapse(u, api, st, F) {
    const id = busiestPanel(st, F, [SAFE].concat(cheatPanels(F)));
    if (!id) return false;
    const p = F.panels[id];
    if (!api.windUp(u, 'svam_collapse', { x: p.cx, y: p.cy }, { anchor: 'ground', tiles: p.tiles.slice(), label: 'Floor Collapse (' + id + ')', data: { panel: id },
      turns: windTurns(st, u) })) return false;
    F.stats.collapses++;
    return true;
  }
  /** Hellfire Rain: crosses around up to 3 heroes (the ones farthest from him first: the plot finds the hiders). */
  function windRain(u, api, st, F) {
    const foes = api.foes(u).filter(function (f) { return f.kind === 'hero'; });
    const list = (foes.length ? foes : api.foes(u)).slice().sort(function (a, b) { return api.dist(b, u) - api.dist(a, u) || st.units.indexOf(a) - st.units.indexOf(b); });
    const centers = [];
    list.forEach(function (f) { if (centers.length < N.rainCenters && !centers.some(function (c) { return api.dist(c, f) <= 2; })) centers.push({ x: f.x, y: f.y }); });
    if (!centers.length) return false;
    const out = [];
    centers.forEach(function (c) {
      G().shape('cross', c, null, 1).forEach(function (p) { if (!onList(out, p) && !(p.x === u.x && p.y === u.y) && G().inBounds(p.x, p.y)) out.push(p); });
    });
    if (!api.windUp(u, 'svam_rain', centers[0], { anchor: 'ground', tiles: out, label: 'Hellfire Rain', data: { centers: centers }, turns: windTurns(st, u) })) return false;
    F.stats.rains++;
    return true;
  }
  function windNext(u, api, st, F) {
    if (F.phase >= 3) return windRain(u, api, st, F);
    if (F.phase === 1) return windCollapse(u, api, st, F);
    const first = F.windNext === 'svam_rain' ? windRain : windCollapse;
    const second = first === windRain ? windCollapse : windRain;
    const ok = first(u, api, st, F) || second(u, api, st, F);
    if (ok) F.windNext = (u.intents[u.intents.length - 1] || {}).skillId === 'svam_rain' ? 'svam_collapse' : 'svam_rain';
    return ok;
  }
  function svamTurn(u, api) {
    const st = api.state, F = fight(st);
    syncPhase(u);
    syncKit(u);
    F.stats.turns++;
    let acts = 1;
    if (!F.caught) {
      if (F.phase >= 3) acts = N.p3Acts;
      // I Go Twice without E2 (no second initiative entry): two actions on his one turn
      else if (F.phase === 2 && F.twiceFrom && st.round >= F.twiceFrom && entriesOf(st, u) < N.p2Turns) acts = N.p2Turns;
      // Bonus Action keeps its chip's word for the whole round, also when he flips into phase 3 during it
      if (F.cur && !F.cur.cancelled && F.cur.id === 'svam_bonus') acts++;
    }
    let first = null;
    for (let k = 0; k < acts && active(u) && !st.result; k++) {
      const r = actOnce(u, api, st, F, F.phase >= 3 ? first : null);
      if (r && typeof r === 'object' && !first) first = r;
    }
    // one wind-up pending at a time, at most N.windsPerRound new ones a round (I Go Twice doesn't double them)
    if (!F.caught && active(u) && !st.result && !(u.intents || []).length && (F.windRound !== st.round || (F.windsThisRound || 0) < N.windsPerRound)) {
      if (windNext(u, api, st, F)) {
        if (F.windRound !== st.round) { F.windRound = st.round; F.windsThisRound = 0; }
        F.windsThisRound++;
      }
    }
    updateFlavor(st);
  }
  function impTurn(u, api) {
    if (u.data && u.data.clockIn === api.round) {
      if (!sim()) DD.FX.text(u, 'Clocking in…', { color: '#d0d0d0', size: 13 });
      return;
    }
    api.defaultTurn(u, 'assassin');
  }

  // ---- skills ----------------------------------------------------------------------------------------------------------
  function eskill(def) { def.owner = 'enemy'; def.ap = 0; return DD.registerSkill(def); }
  function scripted() { return 'Only Svammiel\'s own script uses this.'; }
  function hit(ctx, v, amount, opts) { return DD.Act.damage(ctx.user, v, amount, Object.assign({ noHighGround: true }, opts || {})); }
  eskill({ id: 'svam_pitchfork', name: 'Pitchfork of Petty Grievances', icon: '🔱', kind: 'attack', tags: ['melee'], anchor: 'unit',
    levels: [{ dmg: N.pitchfork }], target: { type: 'unit', range: [1, 1], filter: 'enemy' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to an adjacent foe.'; },
    flavor: 'Three prongs, each one a grudge from a session in 1987.',
    execute: function (ctx) {
      if (ctx.target) DD.FX.lunge(ctx.user, ctx.target);
      ctx.foes.forEach(function (f) { if (active(f)) hit(ctx, f, ctx.L.dmg, { tags: ['pitchfork'] }); });
    } });
  eskill({ id: 'svam_nat20', name: 'Natural Twenty (Allegedly)', icon: '🎲', kind: 'attack', tags: ['ranged'], anchor: 'unit', cooldown: 1,
    levels: [{ dmg: N.nat20 }], target: { type: 'unit', range: [1, N.nat20Range], filter: 'enemy', los: true },
    desc: function (L) { return 'He rolls a d20 where nobody can see it. It\'s a 20. Deal ' + L.dmg + ' damage to a foe within ' + N.nat20Range + ' he can see.'; },
    flavor: 'The die is behind his back. The die is always behind his back.',
    execute: function (ctx) {
      DD.FX.text(ctx.user, '🎲 20. (Trust me.)', { color: '#ffe08a', size: 14 });
      if (ctx.targetUnit) DD.FX.projectile(ctx.user, ctx.targetUnit, { kind: 'magic', color: '#ffd34d', arc: 30, ms: 320 });
      ctx.foes.forEach(function (f) { if (active(f)) hit(ctx, f, ctx.L.dmg, { tags: ['dice'] }); });
    } });
  eskill({ id: 'svam_buffet', name: 'Wing Buffet', icon: '🦇', kind: 'attack', tags: ['melee', 'aoe', 'push'], anchor: 'self', cooldown: 2,
    levels: [{ dmg: N.buffet, push: N.buffetPush }], target: { type: 'self' }, area: { shape: 'adjacent' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to each adjacent foe and knock it back ' + L.push + ' tiles.'; },
    flavor: 'Graph paper hurts more than you think. Ask anyone who has had a map thrown at them.',
    execute: function (ctx) {
      DD.FX.shake(4, 220);
      ctx.foes.forEach(function (f) {
        if (!active(f)) return;
        DD.FX.lunge(ctx.user, f);
        hit(ctx, f, ctx.L.dmg, { tags: ['wing'] });
        if (active(f)) DD.Act.knockback(ctx.user, f, ctx.L.push);
      });
    } });
  eskill({ id: 'svam_collapse', name: 'Floor Collapse', icon: '🕳️', kind: 'utility', tags: ['aoe'], anchor: 'ground', windupOnly: true,
    levels: [{}], target: { type: 'tile', range: [0, 40], filter: 'any', los: false },
    area: { shape: 'custom', fn: function (ctx) {
      const F = peek(ctx.state), id = ctx.intent && ctx.intent.data && ctx.intent.data.panel;
      const p = F && id ? panel(F, id) : null;
      return p ? p.tiles.slice() : ctx.target ? [{ x: ctx.target.x, y: ctx.target.y }] : [];
    } },
    canUse: scripted,
    desc: function () { return 'Wind-up: on his first turn after every hero has had one, the marked panel drops into the void: each grounded unit on it falls once (heroes: 25% of max HP, then climb out). It comes back at the end of the next round.'; },
    flavor: 'Mind the gap. He just made the gap.',
    execute: function (ctx) {
      const st = ctx.state, F = fight(st), id = ctx.intent && ctx.intent.data && ctx.intent.data.panel;
      if (!id || !present(F, id)) return;
      if (!sim()) DD.Act.log('Floor Collapse! Panel ' + id + ' drops into the void.', 'enemy');
      dropPanel(F, id, { temporary: true, src: ctx.user });
      updateBoard(st);
    } });
  eskill({ id: 'svam_rain', name: 'Hellfire Rain', icon: '🔥', kind: 'attack', tags: ['aoe', 'fire'], anchor: 'ground', windupOnly: true,
    levels: [{ dmg: N.rain }], target: { type: 'tile', range: [0, 40], filter: 'any', los: false }, area: { shape: 'cross', size: 1 },
    canUse: scripted,
    desc: function (L) { return 'Wind-up: on his first turn after every hero has had one, hellfire rains on a cross around up to ' + N.rainCenters + ' heroes: ' + L.dmg + ' fire damage.'; },
    flavor: 'Brimstone, artisanal, locally sourced from directly under the table.',
    execute: function (ctx) {
      const centers = (ctx.intent && ctx.intent.data && ctx.intent.data.centers) || (ctx.target ? [ctx.target] : []);
      centers.forEach(function (c, i) { DD.FX.projectile({ x: c.x, y: c.y, h: 10 }, c, { kind: 'fireball', arc: false, ms: 260, parallel: i > 0 }); });
      DD.FX.shake(7, 320);
      ctx.foes.forEach(function (f) { if (active(f)) hit(ctx, f, ctx.L.dmg, { element: 'fire', tags: ['hellfire'] }); });
    } });
  eskill({ id: 'svam_honest', name: 'The Honest d20', icon: '🎲', kind: 'attack', tags: ['ranged', 'random'], anchor: 'unit',
    levels: [{ dmg: N.honest, lowDmg: N.honestLow }], target: { type: 'unit', range: [1, N.nat20Range], filter: 'enemy', los: true },
    desc: function (L) { return 'He has to roll where everyone can see it now. 1: nothing. 2-10: ' + L.lowDmg + ' damage. 11-20: ' + L.dmg + ' damage, to a foe within ' + N.nat20Range + ' he can see.'; },
    flavor: 'In public. With witnesses. He hates it.',
    execute: function (ctx) {
      DD.Act.markUncertain();
      const roll = ctx.rng.int(1, 20);
      DD.FX.text(ctx.user, '🎲 ' + roll + (roll === 1 ? ' (in public!)' : ''), { color: '#ffe08a', size: 15 });
      if (roll === 1) { if (!sim()) DD.Act.log('Svammiel rolls an honest 1. Everyone saw it. He asks the floor to swallow him. The floor, for once, says no.', 'hero'); return; }
      const n = roll <= 10 ? ctx.L.lowDmg : ctx.L.dmg;
      ctx.foes.forEach(function (f) { if (active(f)) hit(ctx, f, n, { tags: ['dice'] }); });
    } });
  eskill({ id: 'svam_jab', name: 'Clipboard Jab', icon: '📋', kind: 'attack', tags: ['melee'], anchor: 'unit',
    levels: [{ dmg: N.jab }], target: { type: 'unit', range: [1, 1], filter: 'enemy' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to an adjacent foe.'; },
    flavor: 'Sign here. And here. And OW.',
    execute: function (ctx) {
      if (ctx.target) DD.FX.lunge(ctx.user, ctx.target);
      ctx.foes.forEach(function (f) { if (active(f)) hit(ctx, f, ctx.L.dmg); });
    } });

  // ---- statuses ----------------------------------------------------------------------------------------------------------
  DD.registerStatus({ id: WINGS, name: 'Wings (Graph Paper)', icon: '🪽', color: '#efe7d2', type: 'buff', stacking: 'none', maxStacks: 1,
    decay: 'never', defaultTurns: -1, flying: true,
    desc: function () { return 'He flies: lava, the void, the Tilt and every floor cheat never touch him. Until somebody catches him cheating.'; } });
  DD.registerStatus({ id: FUDGE, name: 'Fudge Tokens', icon: '🎲', color: '#ff7a5c', type: 'buff', stacking: 'refresh', maxStacks: 9,
    decay: 'never', defaultTurns: -1,
    desc: function (st) { return 'Fudge tokens: ' + st.stacks + '. Each one is a snap cheat (Reroll! or That\'s a 1 Now), at most one a round. Each Rigged Die you break takes one away for good; a new phase still deals him ' +
      plural(N.fudgeFloor, 'token') + ' at least.'; } });
  DD.registerStatus({ id: CAUGHT, name: 'Caught Red-Handed', icon: '🫵', color: '#ffd34d', type: 'debuff', stacking: 'none', maxStacks: 1,
    decay: 'never', defaultTurns: -1, takenMult: N.caught,
    desc: function () { return 'Caught cheating: ' + caughtText() + ' damage taken. No more cheats.'; } });
  DD.registerStatus({ id: GUARD, name: 'Don\'t Stun the DM', icon: '🛡️', color: '#dddddd', type: 'buff', stacking: 'none', maxStacks: 1,
    decay: 'never', defaultTurns: -1,
    desc: function () { return 'Stun-proof until he has played a turn again.'; } });
  DD.registerStatus({ id: CLOCK, name: 'Clocking In', icon: '⏱️', color: '#d0d0d0', type: 'debuff', stacking: 'none', maxStacks: 1,
    decay: 'turnEnd', defaultTurns: 1,
    desc: function () { return 'Just arrived: it acts from next round.'; } });

  // ---- terrain & objects -----------------------------------------------------------------------------------------------
  /** The linoleum panel art (yaw-0 ground px, the renderer warps it onto the view): black or gold squares, seams, labels. */
  function drawLinoleum(g, tile) {
    const id = tagId(tile && tile.tag) || (tile ? panelIdAt(tile.x, tile.y) : null);
    if (!id) return;
    const col = COLS.indexOf(id.charAt(0)), row = +id.charAt(1);
    const gold = (col + row) % 2 === 0;
    g.poly([[0, -16], [32, 0], [0, 16], [-32, 0]], gold ? '#c9a227' : '#1b1620', null);
    g.poly([[0, -12], [24, 0], [0, 12], [-24, 0]], gold ? 'rgba(255,240,180,0.10)' : 'rgba(255,215,90,0.06)', null);
    const seam = gold ? '#7a5c12' : '#d4af37';
    const same = function (dx, dy) { return panelIdAt(tile.x + dx, tile.y + dy) === id; };
    if (!same(1, 0)) g.line(32, 0, 0, 16, seam, 1.6);
    if (!same(-1, 0)) g.line(0, -16, -32, 0, seam, 1.6);
    if (!same(0, 1)) g.line(0, 16, -32, 0, seam, 1.6);
    if (!same(0, -1)) g.line(0, -16, 32, 0, seam, 1.6);
    const c = COLS.indexOf(id.charAt(0)) * 3 + 2, r = (row - 1) * 3 + 2;
    if (tile.x !== c || tile.y !== r) return;
    // the label stays upright at any map rotation: undo the renderer's ground warp around the tile's centre
    const V = DD.Iso && DD.Iso.view ? DD.Iso.view() : null;
    const w = V && !V.legacy && V.warp, det = w ? w[0] * w[3] - w[1] * w[2] : 0;
    if (w && Math.abs(det) > 1e-6) { g.ctx.save(); g.ctx.transform(w[3] / det, -w[1] / det, -w[2] / det, w[0] / det, 0, 0); }
    g.text(id, 0, 1, 9, gold ? '#3a2a08' : '#e8c55a', { bold: true });
    if (w && Math.abs(det) > 1e-6) g.ctx.restore();
  }
  DD.registerTerrain({ id: FLOOR, name: 'Linoleum Panel', walkable: true, cost: 1, blocksLos: false,
    colors: { top: '#c9a227', left: '#8a6d16', right: '#6e560f' },
    desc: 'One of Svammiel\'s floor panels: black-and-gold linoleum over the void. He drops them, swaps them, tilts them and sets them on fire, always with a round\'s notice.',
    draw: drawLinoleum });
  DD.registerTerrain({ id: VOID, name: 'The Void Under the Floor', walkable: false, pit: true,
    colors: { top: '#07040a', left: '#040206', right: '#030104' },
    desc: 'Nothing down there but dropped dice and regrets. A grounded hero who falls in loses 25% of max HP and climbs out on the nearest panel; once caught, Svammiel loses ' + N.fall + '.' });
  DD.registerTerrain({ id: STUB, name: 'Kids\' Table Mat', walkable: true, cost: 1, blocksLos: false,
    colors: { top: '#3a6fb0', left: '#2a5288', right: '#1f3e68' },
    desc: 'A foam play mat on a stub of floor at the edge of the board. The kids\' table stands on it.' });

  function drawRiggedDie(g, obj, t) {
    g.ellipse(0, 3, 16, 7, 'rgba(0,0,0,0.28)');
    g.box(0, 0, 12, 6, 13, { top: '#e8443a', left: '#b02a22', right: '#8a1d17' }, true);
    const pips = [[-4, -16], [0, -16], [4, -16], [-4, -12.5], [0, -12.5], [4, -12.5]];
    pips.forEach(function (p) { g.circle(p[0], p[1], 0.9, '#fff3e0', null); });
    if (obj.maxHp > 0 && obj.hp < obj.maxHp) g.line(-6, -8, 2, -3, '#3a0a08', 1.2);
  }
  function drawMasterDie(g, obj, t) {
    const live = !(peek() && peek().caught);
    if (live) g.glow(0, -22, 26, '#ffd34d', 0.22 + 0.1 * Math.sin(t * 3));
    g.ellipse(0, 3, 15, 7, 'rgba(0,0,0,0.3)');
    const cy = -21 + Math.sin(t * 1.6) * 1.2, R = 15;
    const pts = [];
    for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + i * Math.PI / 3; pts.push([Math.cos(a) * R, cy + Math.sin(a) * R]); }
    g.poly(pts, '#d4af37', '#5a3a08');
    g.poly([[0, cy - R], [R * 0.866, cy + R * 0.5], [-R * 0.866, cy + R * 0.5]], '#ffd34d', '#8a6010');
    g.line(0, cy - R, 0, cy + R, 'rgba(90,58,8,0.6)', 0.8);
    g.text('20', 0, cy + 2, 8, '#5a1a08', { bold: true });
    if (obj.maxHp > 0 && obj.hp < obj.maxHp) g.line(-8, cy - 4, 3, cy + 6, '#3a1a08', 1.3);
  }
  function drawDMTable(g, obj, t) {
    const open = rulingOpen();
    if (open) g.glow(0, -14, 28, '#ffe680', 0.22 + 0.14 * Math.sin(t * 5));
    g.ellipse(0, 3, 22, 9, 'rgba(0,0,0,0.25)');
    // the kids' table: a little round top on one stubby leg
    g.line(4, -2, 4, -10, '#8a6a3a', 2.4);
    g.ellipse(4, -11, 10, 4, '#e8d4a8', '#8a6a3a');
    g.rect(1, -15, 5, 3.5, '#b0302a', null, 0.6);
    // the DM on a tiny chair: knees up, wizard hat, holding the HELP sign
    g.rect(-12, -7, 8, 2, '#3a6fb0', null, 0.5);
    g.ellipse(-8, -14, 5.5, 7, '#3b3550', null);
    g.circle(-8, -24, 4.5, '#f1c9a5', null);
    g.poly([[-12.5, -27], [-3.5, -27], [-8, -38]], '#5b2a86', null);
    g.circle(-8, -38, 1.2, '#ffd34d', null);
    g.line(-14, -10, -16, -30, '#8a6a3a', 1.4);
    g.rect(-24, -38, 16, 8, '#fff8e6', '#5a3a14', 1);
    g.text('HELP', -16, -34, 4.6, '#b0302a', { bold: true });
    if (open) g.text('!', 2, -32 - 2 * Math.abs(Math.sin(t * 4)), 13, '#ffe680', { stroke: '#3a2a10', strokeWidth: 3 });
  }
  // codex: true (QA flow-5): the Hall's Act IV codex lists him with Svammiel's group (plan §5.8), although he has no HP
  DD.registerObject({ id: TABLE, name: 'The DM (Demoted), at the Kids\' Table', blocksMove: true, blocksLos: false, hp: 0, height: 0.9, color: '#e8d4a8',
    targetable: false, codex: true,
    desc: 'The DM, at the kids\' table. He has his Player\'s Handbook and nothing left to lose. Can\'t be hurt or moved. Interact (1 AP, from next to him, once a round): ' +
      'a Ruling cancels this round\'s cheat (or next round\'s, if none is active), or in phase 3 the next panel drop, and Svammiel takes ' + N.rulingDmg + ' damage.',
    available: function (o, unit) { return rulingOpen(); },
    interact: { ap: 1, label: 'Ask for a Ruling', fn: function (unit, o, tile) { askRuling(unit, o, tile); } },
    autoplay: function (unit, o, tile, state, how) { return how === 'break' ? 0 : rulingValue(); },
    draw: drawDMTable });
  DD.registerObject({ id: RIGGED, name: 'Rigged Die', blocksMove: true, blocksLos: false, hp: N.dieHp, height: 0.6, color: '#e8443a', yawAware: true,
    targetable: true,
    desc: 'A d6 with six sixes. ' + N.dieHp + ' HP; any single-target damage skill can break it. Blocks movement, not sight. Breaking it: Svammiel loses a Fudge token now ' +
      'and one for the rest of the fight (a new phase still deals him ' + plural(N.fudgeFloor, 'token') + '), the party gains a Ruling and ' + N.dieHype + ' Hype.',
    autoplay: function (unit, o, tile, state, how) { const F = peek(); return F && !F.caught ? N.riggedHint : 0; },
    onDestroyed: function (o, tile, src) { riggedBroken(src, tile); },
    draw: drawRiggedDie });
  DD.registerObject({ id: MASTER, name: 'Master Die', blocksMove: true, blocksLos: false, hp: N.masterHp, height: 1.2, color: '#d4af37',
    targetable: true,
    desc: 'His REAL d20, the size of a hero. ' + N.masterHp + ' HP; any single-target damage skill can break it. Blocks movement, not sight. While it stands, his Pencilled HP ' +
      'can rub out ' + N.pencil + ' more damage a round. Break every one: CAUGHT CHEATING.',
    autoplay: function () { const F = peek(); return F && !F.caught ? N.masterHint : 0; },
    onDestroyed: function (o, tile, src) { masterBroken(src, tile); },
    draw: drawMasterDie });

  function riggedBroken(src, tile) {
    const st = S(), F = fight(st), u = findSvam(st);
    F.rigged++;
    F.stats.rigged++;
    F.fudgeMax = Math.max(0, F.fudgeMax - 1);
    F.fudge = Math.max(0, Math.min(F.fudge - 1, F.fudgeMax));
    F.rulings++;
    DD.Act.gainHype(N.dieHype, 'rigged die');
    if (u) { syncFudge(u, F); DD.Act.maybeBark(u, 'dice', 0.8); }
    syncRulings(st, F);
    if (!sim()) {
      DD.FX.text(tile, 'Six sixes!', { color: '#ffd34d', size: 15 });
      DD.Act.log((src ? src.name : 'Somebody') + ' breaks a Rigged Die: six sixes, zero chill. Svammiel\'s Fudge drops to ' + F.fudge + ' (max ' + F.fudgeMax + '); +1 Ruling, +' +
        N.dieHype + ' Hype.', 'hero');
    }
    updateBoard(st);
  }
  function masterBroken(src, tile) {
    const st = S(), F = fight(st), u = findSvam(st);
    F.master++;
    F.stats.master++;
    const left = standingMaster();
    if (!sim()) {
      DD.FX.text(tile, 'Honest at last!', { color: '#ffd34d', size: 15 });
      DD.Act.log((src ? src.name : 'Somebody') + ' breaks a Master Die (' + left + ' left).', 'hero');
    }
    if (u) DD.Act.maybeBark(u, 'dice', 0.8);
    if (u && !F.caught && left === 0 && F.masterPlaced > 0) caughtCheating(u, src);
    updateBoard(st);
  }

  // ---- sprites ---------------------------------------------------------------------------------------------------------
  function rot(px, py, ox, oy, a) { const c = Math.cos(a), s = Math.sin(a); return [ox + (px - ox) * c - (py - oy) * s, oy + (px - ox) * s + (py - oy) * c]; }
  /** One graph-paper bat wing (side −1 / +1): three finger bones, a scalloped membrane with a blue grid and doodles. */
  function drawWing(g, side, flap) {
    const ox = side * 6, oy = -36, a = -side * flap;
    const P = function (x, y) { return rot(side * x, y, ox, oy, a); };
    const tips = [P(40, -64), P(46, -42), P(36, -22)];
    const elbow = P(22, -50);
    const mem = [P(6, -36), elbow, tips[0], P(38, -50), tips[1], P(36, -32), tips[2], P(24, -22), P(10, -26)];
    const c = g.ctx;
    c.save();
    c.beginPath();
    mem.forEach(function (p, i) { if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); });
    c.closePath();
    c.fillStyle = '#efe7d2';
    c.fill();
    c.clip();
    c.strokeStyle = 'rgba(143,179,217,0.75)';
    c.lineWidth = 0.4;
    for (let k = -50; k <= 50; k += 5) {
      c.beginPath(); c.moveTo(k, -80); c.lineTo(k, 0); c.stroke();
      c.beginPath(); c.moveTo(-60, -80 + (k + 50)); c.lineTo(60, -80 + (k + 50)); c.stroke();
    }
    // pencil doodles: the party as stick figures (left), a crossed-out "DM" (right)
    if (side < 0) {
      for (let i = 0; i < 4; i++) {
        const p = P(18 + i * 5, -36 + (i % 2) * 2);
        g.circle(p[0], p[1] - 3, 1, null, '#4a4a55');
        g.line(p[0], p[1] - 2, p[0], p[1] + 1.5, '#4a4a55', 0.5);
      }
    } else {
      const p = P(24, -38);
      g.text('DM', p[0], p[1], 4.5, '#4a4a55');
      g.line(p[0] - 4, p[1] + 2, p[0] + 4, p[1] - 2, '#c0213a', 0.8);
    }
    c.restore();
    c.strokeStyle = '#3a1a14';
    c.lineWidth = 1;
    c.beginPath(); mem.forEach(function (p, i) { if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); }); c.closePath(); c.stroke();
    const sh = P(6, -36);
    g.line(sh[0], sh[1], elbow[0], elbow[1], '#2a1a1f', 2.2);
    tips.forEach(function (tp) { g.line(elbow[0], elbow[1], tp[0], tp[1], '#2a1a1f', 1.4); });
  }
  function drawSvammiel(g, t, o) {
    const st = o && o.statuses;
    const caught = hasSt(st, CAUGHT) || !!(o && o.unit && o.unit.data && peek() && peek().caught && isSvam(o.unit));
    const pose = g.pose;
    const cast = pose === 'cast' || pose === 'attack';
    const hurt = pose === 'hurt';
    const flap = caught ? 0 : Math.sin(t * 4.4) * 0.12 + (cast ? 0.2 : 0);
    if (!caught) {
      g.glow(0, -30, 34, '#c0213a', 0.12);
      drawWing(g, -1, flap);
      drawWing(g, 1, flap);
    } else {
      // folded, pinned with a big red CAUGHT paper clip
      [-1, 1].forEach(function (sd) { g.poly([[sd * 5, -36], [sd * 14, -44], [sd * 16, -14], [sd * 8, -10]], '#efe7d2', '#3a1a14'); });
      g.rect(-4, -48, 8, 22, null, '#c0213a', 2);
      g.text('CAUGHT', 0, -50, 4.6, '#c0213a', { bold: true });
    }
    // devil tail with a dice bag
    const sw = Math.sin(t * 2.2) * 3;
    g.line(4, -6, 14, -2 + sw * 0.3, '#b3262e', 2);
    g.line(14, -2 + sw * 0.3, 20 + sw, -8, '#b3262e', 1.6);
    g.circle(21 + sw, -6, 2.6, '#7a2cff', '#3a1a14');
    // the cape: his old DM screen, three panels
    [-14, -5, 4].forEach(function (x, i) { g.rect(x, -36, 10, 32, i === 1 ? '#6a1f30' : '#5b1a2a', '#2a0a14', 1); });
    g.text('S', 0.5, -18, 7, '#d4af37', { bold: true });
    // body: robe with gold trim and a belt of dice
    g.poly([[-9, -38], [9, -38], [12, -2], [-12, -2]], '#1d1424', '#14080a');
    g.line(-9, -38, -12, -2, '#d4af37', 1);
    g.line(9, -38, 12, -2, '#d4af37', 1);
    for (let i = 0; i < 4; i++) g.rect(-8 + i * 4.2, -20, 3, 3, ['#ffd34d', '#c0213a', '#7a2cff', '#ffd34d'][i], '#14080a', 0.4);
    // the DM lanyard
    g.line(-3, -37, 0, -28, '#c0213a', 0.8);
    g.line(3, -37, 0, -28, '#c0213a', 0.8);
    g.rect(-3, -28.5, 6, 4.2, '#fff8e6', '#14080a', 0.6);
    g.text('DM', 0, -26.3, 3, '#c0213a', { bold: true });
    // arms: a gold d20 that always shows 20 (right), the PLAYER TEARS goblet or a clipboard (left)
    const dy = cast ? -8 : Math.sin(t * 2) * 0.8;
    g.line(8, -35, 14, -24 + dy, '#b3262e', 2.6);
    const dx = 15, dyy = -24 + dy;
    const hex = [];
    for (let i = 0; i < 6; i++) { const ang = -Math.PI / 2 + i * Math.PI / 3 + (cast ? t * 6 : 0); hex.push([dx + Math.cos(ang) * 4, dyy + Math.sin(ang) * 4]); }
    g.poly(hex, '#ffcf4d', '#8a6010');
    g.text('20', dx, dyy + 0.4, 3.4, '#5a1a08', { bold: true });
    g.line(-8, -35, -14, -24, '#b3262e', 2.6);
    if (cast) {
      g.rect(-20, -34, 9, 12, '#e8d4a8', '#5a3a14', 0.8);
      g.text('RULES', -15.5, -30, 2.4, '#5a1a08', { bold: true });
      g.text('(DRAFT)', -15.5, -27, 2, '#5a1a08');
    } else {
      g.poly([[-18, -27], [-11, -27], [-12.5, -21], [-16.5, -21]], '#d4af37', '#8a6010');
      g.line(-14.5, -21, -14.5, -18, '#d4af37', 1.2);
      g.text('TEARS', -14.5, -24.6, 1.9, '#5a1a08', { bold: true });
    }
    // head: long sharp face, slicked hair, goatee, curling horns with gold rings, a crown of gold d4s, a pencil
    const hy = -44 + (hurt ? 1 : 0);
    g.poly([[-5.5, hy - 4], [5.5, hy - 4], [4, hy + 4], [0, hy + 7], [-4, hy + 4]], '#b3262e', '#14080a');
    g.poly([[-5.8, hy - 4], [5.8, hy - 4], [4, hy - 7], [-4, hy - 7]], '#14080a', null);
    g.poly([[-1.5, hy + 4], [1.5, hy + 4], [0, hy + 8.5]], '#14080a', null);
    g.circle(-2.2, hy - 0.8, 1, '#ffe14d', null);
    g.circle(2.2, hy - 0.8, 1, '#ffe14d', null);
    g.line(-2.5, hy + 2.6, 2.5, hy + 2.6, '#14080a', 0.7);
    g.poly([[-1.6, hy + 2.6], [-1.1, hy + 3.6], [-0.6, hy + 2.6]], '#fff3e0', null);
    [-1, 1].forEach(function (sd) {
      g.poly([[sd * 3, hy - 6], [sd * 9, hy - 11], [sd * 13, hy - 8], [sd * 11, hy - 4], [sd * 9, hy - 7], [sd * 5, hy - 4]], '#2a1a1f', '#14080a');
      g.circle(sd * 8, hy - 9, 1.1, null, '#d4af37');
    });
    g.circle(-12, hy - 3, 1.2, '#ffcf4d', null);
    for (let i = 0; i < 4; i++) { const x = -4.5 + i * 3; g.poly([[x - 1.2, hy - 7], [x + 1.2, hy - 7], [x, hy - 10]], '#ffcf4d', '#8a6010'); }
    g.rect(6, hy - 8, 1.4, 6, '#f1c40f', null, 0.3);
    if (!caught) g.glow(0, -2, 10, '#ff7a1a', 0.12 + 0.05 * Math.sin(t * 3));
  }
  function impOverlay(g) {
    g.rect(5, -22, 6, 8, '#e8d4a8', '#5a3a14', 0.6);
    g.line(6, -19, 10, -19, '#5a3a14', 0.5);
    g.line(6, -17, 10, -17, '#5a3a14', 0.5);
  }

  // ---- enemies -----------------------------------------------------------------------------------------------------------
  DD.registerEnemy({ id: IMP, name: 'Floor Staff Imp', act: 4, tier: 'minion', hp: N.impHp, mov: 5, armor: 0, init: 3,
    tags: ['demon', 'imp', 'svammiel'], flags: { flying: true }, skills: ['svam_jab'], ai: impTurn, aiStyle: 'assassin', xp: 2, gold: [0, 1],
    sprite: { base: 'flyer', scale: 0.8, shape: { body: 'imp' }, palette: { skin: '#c0213a', eye: '#ffe14d', accent: '#d4af37', outline: '#14080a' },
      head: { horns: 'demon', mouth: 'fangs' }, overlay: impOverlay },
    barks: { spawn: ['Clocking in! Where do I sign?', 'Floor staff! Mind the wet sign!'], attack: ['Sign here!', 'Initial here! And here!'],
      hurt: ['That\'s a workplace injury!', 'I\'m filing a grievance!'], death: ['Clocking out... forever...', 'Tell HR I tried...'] },
    desc: 'Floor staff: clipboard, lanyard, zero job security. Clocks in for a round, then goes for whoever looks weakest.' });

  const BARKS = {
    spawn: ['You broke all my toys. Fine. Play with ME.', 'Final floor. Final boss. Final rule: I win.', 'You\'ve seen me cheat all act. That was the WARM-UP.',
      'Welcome to the last floor. All of it is mine. Even under your feet.', 'No more mini-bosses. Just the maxi-boss. Hello.',
      'The DM is watching. Let\'s show him how a REAL DM does it.'],
    attack: ['Natural 20. Want to see? No.', 'That hits. Because I said so.', 'Roll to dodge. Kidding. You can\'t.', 'I don\'t need to hit. I just need to WANT to hit.',
      'Wing buffet! It\'s in the rules. My rules.'],
    hurt: ['That\'s... technically allowed. I\'ll be changing that.', 'OW. Who taught you that? Was it HIM?', 'Retcon! RETCON! ...It\'s still there.',
      'I\'m writing your name in my book. In RED.'],
    lowhp: ['This isn\'t fair! ...Yes. I hear it.', 'You\'re CHEATING! With the rules?! The worst kind!', 'Best of three? Best of five? Best of ALL of them?'],
    kill: ['Floored! Get it? FLOORED!', 'Down you go. Mind the gum.'],
    stunned: ['You can\'t stun a DM! ...Apparently you can.', 'Who rolled that? WHO ROLLED THAT?'],
    death: ['I CONTROL... ALL... except... graaavityyyy...', 'Fine. FINE. You win. ...Same time next week?'],
    phase2: ['Enough rules. Let\'s play by MY rules.', 'These were always my rules. Now they\'re LOUDER.'],
    phase3: ['You want to see me cheat? THIS is me cheating.', 'Reason? REASON? I have WINGS!'],
    ruling: ['Overruled! By me! I\'m the judge! ...Fine. Sustained.', 'Objection noted. Objection HATED. ...Sustained.'],
    dice: ['My dice! Those were LOADED. Lovingly.', 'Who breaks a demon\'s dice?! Barbarians!'],
    caught: ['This is entrapment! ...With MY dice!', 'Okay. OKAY. Maybe a little cheating.'],
    // party-filtered (DD.Act.partyLines): a line names exactly one hero, by the exact capitalisation of the name
    named: ['Your bling, Zarathor. I\'m melting it into a crown.', 'Roast me now, Syllamin. I dare you. ...Not that hard.',
      'Remember this, Marbles? No? Perfect. Again!', 'Marwyn. MARVIN. ...I\'ll stop when you stop hitting me.',
      'Call off the corgis, Ellaria! One is on my tail!', 'Your bird has my d20, Josiah. MY d20.', 'Stop bleeding on my floor, Sparrow! It stains!',
      'You can\'t sign away my turn, Corelos! ...Can you?', 'Stop throwing my furniture, Slate!', 'No, Buga, I will NOT endorse you.',
      'Stop shooting through my walls, Kiri! They\'re load-bearing!', 'Betty, that\'s my wing! Stop chewing my wing!',
      'Bad dog, Basanos! Bad! ...Okay, good bite.', 'That hair is blinding me, Valdris! Tie it up!', 'Hjalmar! Give back my crown! HJALMAR!',
      'Pebbles, you\'re setting my floor on fire! ...It\'s fine.', 'Stop sliming my floor, Benedick! It\'s LINOLEUM!'],
  };
  DD.registerEnemy({ id: SVAM, name: 'Svammiel', act: 4, tier: 'boss', hp: N.hp, mov: N.mov, armor: N.armor, init: N.init, pronoun: 'he',
    shortName: 'Svammiel', tags: ['demon', 'boss', 'svammiel'], flags: { large: true },
    sprite: { base: 'custom', scale: 2.4, height: 64, width: 46, headY: -44, hover: 10,
      palette: { skin: '#b3262e', cloth: '#1d1424', cloth2: '#d4af37', hair: '#14080a', metal: '#ffcf4d', eye: '#ffe14d', accent: '#7a2cff', outline: '#14080a' },
      bounds: { l: -60, r: 60, t: -96, b: 20 }, portrait: { x: 0, y: -44, r: 14 }, draw: drawSvammiel },
    // his immediate attacks (the HUD's reach and AutoPlay read them); Floor Collapse and Hellfire Rain are wind-ups
    skills: KIT.normal.slice(),
    ai: svamTurn, aiStyle: 'skirmisher', xp: 80, gold: [0, 0], hooks: HOOKS,
    passive: { name: 'Rule Zero Incarnate', icon: '😈', desc: passiveText },
    barks: BARKS,
    desc: 'The Dungeon Master\'s Dungeon Master: a winged demon who lives under the table, owns every floor down there and cheats openly, every turn, for no reason at all. Hates rugs.',
    boss: { title: 'The Floor Boss', intro: 'Welcome to the last floor. I own the floor. I own the table. I own the rules. And I am not. Going. To. Play. FAIR.',
      sting: 'svam_sting', music: null } });

  // ---- the arena: directly under the DM's table (17 × 14: a 15 × 12 board of 20 panels over the void) -------------------
  //  _ the void · D the DM (Demoted) at the kids' table, on a stub of floor off the board · T his throne (the lost d20) ·
  //  p giant table legs · B Svammiel · r Rigged Dice · H deploy (B4-D4)
  const LAYOUT = [
    '_________________',
    '_.......T......._',
    '_...p...B...p..._',
    '_..............._',
    '_..............._',
    '_....r.....r...._',
    'D..............._',
    '_..............._',
    '_.......r......._',
    '_..............._',
    '_...HHHHHHHHH..._',
    '_...HHHHHHHHH..._',
    '_..............._',
    '_________________',
  ];
  function encOnStart(st) {
    const F = ensurePanels(st);
    const u = findSvam(st);
    phaseChip(st, 'nat20', true);
    phaseChip(st, 'cutscenes', true);
    syncRulings(st, F);
    if (u) {
      phaseCheatLine(st, F, 'svam_nat20');
      // without the cameo engine (or with cameos off) he opens with his own line
      if ((DD.Cameo && DD.Cameo.stub) || st.noCameo) DD.Act.bark(u, 'spawn');
    }
    // round 2's cheat is drawn as round 1 starts (after deployment: its marks follow where the party stands)
    updateBoard(st);
  }
  /**
   * Round start: the announced cheat goes live, its start-of-round effect plays, and next round's cheat is drawn and
   * announced (a whole round of notice). Both happen here, not at the previous round's end, so every line about them is
   * printed in the round it talks about (QA FIGHTS-05; the announcement names its round by number).
   */
  function encRoundStart(st) {
    const F = peek(st);
    if (!F) return;
    F.taken = 0;
    if (F.armored && !(F.armoredAt >= st.round)) F.armored = false;
    const u = findSvam(st);
    if (F.next && F.next.round <= st.round) {
      if (F.next.cancelled || F.next.round < st.round) { DD.Act.removeRule(NEXT_RULE); F.next = null; }
      else activate(st, F, F.next);
    }
    if (F.cur && F.cur.round === st.round) startEffects(st, F, F.cur);
    if (!F.next && active(u)) {
      const c = drawCheat(st, F, st.round + 1);
      if (c) announce(st, F, c);
    }
    updateBoard(st);
  }
  function encRoundEnd(st) {
    const F = peek(st), u = findSvam(st);
    if (!F || !u) return;
    const k = st.round;
    // this round's cheat does its end-of-round thing (normally already done as its one-round chip ended), then ends
    if (F.cur) {
      if (F.cur.round <= k) {
        if (!F.cur.cancelled) endEffects(st, F, F.cur);
        DD.Act.removeRule(CUR_RULE);
        F.lastId = F.cur.id;
        F.cur = null;
      }
    }
    // upkeep: lava cools, collapsed panels come back, phase 3's floor and pencil
    F.lava = F.lava.filter(function (L) {
      if (L.until > k) return true;
      L.tiles.forEach(function (q) { const t = G().tile(q.x, q.y); if (t && t.t === 'lava') DD.Act.setTerrain(q.x, q.y, F.base[key(q)] || FLOOR); });
      if (!sim()) DD.Act.log('The lava cools. Svammiel blows on it, smugly.', 'system');
      return false;
    });
    F.collapsed.slice().forEach(function (c) { if (c.back <= k) restorePanel(F, c); });
    if (F.phase >= 3 && !F.caught && active(u)) { pencil(st, F, u); dropFloor(st, F); }
    syncRulings(st, F);
    updateBoard(st);
  }
  DD.registerEncounter({ id: ENC, act: 4, kind: 'boss', name: 'The Last Floor', shortName: 'The Last Floor', icon: '😈', weight: 0, minDepth: 0,
    // QA flow-3: the game's last boss gets his title card (Combat.start's banner: "Svammiel" / "The Floor Boss")
    finale: true, cameo: { start: 'svam_finale_open', cheat: null, interjections: true },
    intro: 'Directly under the DM\'s table: chewing gum overhead, a lost d20 the size of a boulder, a Cheeto the size of a canoe and a demon on a throne of dice.',
    map: { theme: 'a4_underfloor', layout: LAYOUT, legend: {
      '.': { terrain: FLOOR },
      '_': { terrain: VOID },
      'D': { terrain: STUB, obj: { id: TABLE } },
      'T': { terrain: FLOOR, obj: { id: 'd20', label: 'Svammiel\'s Throne (it only shows 20)' } },
      'p': { terrain: FLOOR, obj: { id: 'pillar', label: 'Giant Table Leg' } },
      'B': { terrain: FLOOR, zone: 'enemy', tag: 'boss_spawn' },
      'r': { terrain: FLOOR, obj: { id: RIGGED } },
      'H': { terrain: FLOOR, zone: 'hero' },
    } },
    enemies: [{ id: SVAM, n: 1 }],
    onStart: encOnStart, onRoundStart: encRoundStart, onRoundEnd: encRoundEnd,
    objective: { type: 'boss', flavor: 'He cheats out loud: read the "Next round" chip. Ask the DM for Rulings; break his Rigged Dice.' },
    reward: { goldMult: 0, itemRarity: null } });

  // his opening line in his own fight (the start cameo's announcer key: he is present, so it is a bark on his unit)
  DD.registerNarration('svam_finale_open', BARKS.spawn.slice());

  // ---- the cameo actor: Svammiel at every act-4 fight, the twist on the DM's table, and the five cameo cheats --------------
  /**
   * The twist's extras once the entrance played (plan §2.1 step 2): the table shakes, the DM's four quiet words, one
   * living hero reacts (70%, cosmetic RNG), and the spoiler gate opens (DD.Meta.markSeen).
   */
  const TWIST_SHAKE = 'The table shakes. The Cheeto dust rises off the felt and hangs in the air. Something under the table laughs in capital letters.';
  /**
   * The twist's first beat (plan §2.1: the table shakes, then his line). QA flow-4: the DM's death (dm.js onDeath, the
   * moment the shake cuts him off) logs it ahead of the entrance when the twist will play; the entrance's extras log it
   * only if that didn't happen. → whether it logged now.
   */
  function twistShake(s) {
    s = s || S();
    if (!s || sim() || s.noCameo || !s.data || s.data.svamShake || !pool('svam_twist').length) return false;
    if (!(DD.Cameo && !DD.Cameo.stub && DD.Cameo.campaignGoesOn && DD.Cameo.campaignGoesOn(s))) return false;
    s.data.svamShake = true;
    DD.Act.log(TWIST_SHAKE, 'narrator');
    return true;
  }
  function twistExtras(s) {
    twistShake(s);
    DD.Act.log('The Dungeon Master, very quietly, from under the wreckage of his screen: "Oh no. That\'s my DM."', 'narrator');
    const hs = heroes(s);
    if (hs.length && DD.rng.next() < 0.7) {
      const h = hs[Math.floor(DD.rng.next() * hs.length) % hs.length];
      const line = quietPick(DD.Act.partyLines(pool('svam_twist_react_' + h.defId)));
      if (line) DD.Act.bark(h, line);
    }
    if (DD.Meta && typeof DD.Meta.markSeen === 'function') DD.Meta.markSeen('bosses', ACTOR);
  }
  function dmPhase3() {
    const dm = DD.BossDM && DD.BossDM.findDM ? DD.BossDM.findDM() : null;
    return !!(dm && dm.data && dm.data.phase === 3);
  }
  function unitsOf(state, pred) { return state && state.units ? state.units.filter(function (u) { return !u.dead && pred(u); }) : []; }
  /**
   * A skill that heals at this level (the Radio Edit never bleeps one: D9 makes a hero's heal his own sustain, and a
   * whole-fight ban of it cuts deeper than a turn of damage). Read from the def, never a list of ids, so a heal added
   * later is skipped too: kind 'heal', a 'heal' or 'drain' tag, a level field named for a heal (L.heal, or a rider such
   * as L.selfHeal / L.healOnKill: any key with "heal" in it) worth more than 0, or the def's own `heals` flag (true, or
   * a function (L, user) → truthy) for a heal its fields don't name.
   */
  function healsWith(def, L, u) {
    if (def.kind === 'heal') return true;
    const tags = def.tags || [];
    if (tags.indexOf('heal') >= 0 || tags.indexOf('drain') >= 0) return true;
    for (const k in (L || {})) if (/heal/i.test(k) && (+DD.resolve(L[k], L, u, 0) || 0) > 0) return true;
    if (typeof def.heals === 'function') return !!DD.safe('heals of ' + def.id, def.heals, def, [L, u]);
    return !!def.heals;
  }
  /**
   * The Radio Edit's pick (deterministic, no RNG): over the heroes in the fight (party order) and each one's socketed
   * skills (never the basic, the signature, a 'shapeshift' skill, a revive or a skill that heals: healsWith), the skills
   * whose current level deals damage now; the highest level, then the higher L.dmg, then party order, then slot order.
   * → { unit, slot, def, level, dmg } | null.
   */
  function radioPick(state) {
    let best = null, hi = 0;
    unitsOf(state, function (u) { return u.kind === 'hero'; }).forEach(function (u) {
      const ui = hi++;
      (u.skills || []).forEach(function (sl, si) {
        const def = DD.getSkill(sl.id);
        if (!def || (def.tags || []).indexOf('shapeshift') >= 0 || (def.hype || 0) > 0) return;
        if ((u.basic && u.basic.id === def.id) || (u.signature && u.signature.id === def.id)) return;
        if ((def.target && def.target.filter === 'downedAlly') || (DD.Targeting && DD.Targeting.revivesWith && DD.Targeting.revivesWith(u, sl))) return;
        const level = sl.level || 1, L = DD.skillLevel(def, level);
        if (healsWith(def, L, u)) return;
        const dmg = +DD.resolve(L.dmg, L, u, 0) || 0;
        if (!(dmg > 0)) return;
        const c = { unit: u, slot: sl, def: def, level: level, dmg: dmg, ui: ui, si: si };
        if (!best || c.level > best.level || (c.level === best.level && (c.dmg > best.dmg || (c.dmg === best.dmg && (c.ui < best.ui || (c.ui === best.ui && c.si < best.si)))))) best = c;
      });
    });
    return best;
  }
  function radioDesc(pick) { return pick.def.name + ' (' + pick.unit.name + ') is bleeped: it can\'t be used this fight.'; }
  function radioHit(q) {
    const st = S(), r = st && st.data && st.data.cameoRadio;
    return !!(r && q && q.unit && q.skill && q.unit.id === r.unitId && q.skill.id === r.skillId);
  }
  function cameoOneTarget(u) { return !!u && u.defId === N.galbraith; }
  const CAMEO_CHEATS = {
    svam_green_thumb: { id: 'svam_green_thumb', name: 'Green Thumb', icon: '🌱', rounds: -1,
      desc: 'Svammiel planted two Strangler Vines for the Gardener.',
      quips: ['I did a little gardening. For it. Against you.'],
      when: function (state) { return !!DD.getEnemy(N.vine) && unitsOf(state, function (u) { return u.defId === N.gardener; }).length > 0; },
      apply: function (state) {
        const g = unitsOf(state, function (u) { return u.defId === N.gardener; })[0];
        const marks = state.grid.tiles.filter(function (t) { return t.tag === 'cameo'; }).map(function (t) { return { x: t.x, y: t.y }; });
        const spots = (marks.length ? marks : N.vinePos.slice()).filter(function (p) { return G().inBounds(p.x, p.y); });
        let n = 0;
        spots.forEach(function (p) {
          if (n >= 2) return;
          const v = DD.Act.spawn(N.vine, p.x, p.y, { owner: g, silent: true });
          if (v) n++;
        });
        return n > 0 ? undefined : false;
      } },
    svam_nepotism: { id: 'svam_nepotism', name: 'Nepotism', icon: '🤝', rounds: -1,
      desc: 'The League are Svammiel\'s favourites: +' + N.nepotism + ' initiative for every League member.',
      quips: ['They\'re my favourites. Favourites go first.'],
      when: function (state) { return unitsOf(state, function (u) { return (u.tags || []).indexOf(N.leagueTag) >= 0; }).length > 0; },
      hooks: { modifyInitiative: function (r) { if (r && r.unit && (r.unit.tags || []).indexOf(N.leagueTag) >= 0) r.total += N.nepotism; } } },
    svam_cameo_one: { id: 'svam_cameo_one', name: 'That\'s a 1 Now', icon: '1️⃣', rounds: -1,
      desc: 'The first hit of ' + N.cameoOneMin + ' or more damage on Galbraith this fight deals 1 instead.',
      quips: ['First big hit? That\'s a 1. I saw it.'],
      when: function (state) { return unitsOf(state, cameoOneTarget).length > 0; },
      hooks: {
        modifyFinalDamage: function (d) {
          const st = S();
          if (!st || !cameoOneTarget(d.target) || d.cause !== 'skill' || d.amount < N.cameoOneMin || (st.data && st.data.svamCameoOne)) return;
          st.data.svamCameoOne = true;
          const was = d.amount;
          d.amount = 1;
          if (!sim()) {
            DD.FX.text(d.target, '1️⃣ That\'s a 1 Now!', { color: '#ff7a5c', size: 16 });
            DD.Act.log('That\'s a 1 Now: Svammiel turns ' + was + ' damage on Galbraith into 1. "I saw it."', 'cameo', { speaker: 'Svammiel', actor: ACTOR });
            // QA FIGHTS-11: a one-time cheat, spent: its chip goes (it would promise a 1 nobody gets any more)
            DD.Act.removeRule('cameo:svam_cameo_one');
          }
        },
        // honesty: a fight rule is an attacker's source, so the estimate mirror is estimateDealt (RULES' notes)
        estimateDealt: function (e) {
          const st = S();
          if (!st || !cameoOneTarget(e.target) || (st.data && st.data.svamCameoOne)) return;
          if ((e.base || 0) * e.mult + (e.flat || 0) >= N.cameoOneMin) { e.mult = 0; e.flat = 1; }
        },
      } },
    // QA FIGHTS-06: his lava knows its friends: shoved across the patch, the hags took 8 a tile and stacking Burn, so the
    // cheat helped the party; it never touches a Coven member (damage or Burn), and says so
    svam_cameo_lava: { id: 'svam_cameo_lava', name: 'The Floor Is Lava', icon: '🌋', rounds: N.lavaRounds,
      desc: 'The patch on the path to the cauldron is lava until the end of round ' + N.lavaRounds + '. Hags don\'t burn.',
      quips: ['The floor is lava. I\'m the floor boss. I\'m allowed.'],
      when: function (state) { return lavaPatch(state).length > 0; },
      hooks: {
        modifyIncomingDamage: function (d) {
          if (d.cause !== 'terrain' || (d.tags || []).indexOf('lava') < 0 || !onCameoLava(d.target)) return;
          d.mult = 0;
          d.nullified = true;
          spared(d.target);
        },
        modifyStatus: function (m) { if (m.id === 'burn' && !m.src && onCameoLava(m.unit)) m.cancel = true; },
      },
      apply: function (state) {
        const tiles = lavaPatch(state);
        state.data.svamCameoLava = tiles.map(function (p) { return { x: p.x, y: p.y, t: G().tile(p.x, p.y).t }; });
        tiles.forEach(function (p) { DD.Act.setTerrain(p.x, p.y, 'lava'); });
        return { tiles: tiles.length };
      },
      onRemove: function (state) {
        ((state && state.data && state.data.svamCameoLava) || []).forEach(function (p) { const t = G().tile(p.x, p.y); if (t && t.t === 'lava') DD.Act.setTerrain(p.x, p.y, p.t); });
        if (state && state.data) state.data.svamCameoLava = [];
      } },
    svam_cameo_radio: { id: 'svam_cameo_radio', name: 'Radio Edit', icon: '📻', rounds: -1,
      desc: '<Skill> (<Hero>) is bleeped: it can\'t be used this fight.',
      quips: ['Radio edit! That skill had language in it.', 'Bleep! Your best move is off the air. Family show.'],
      when: function (state) { return !!radioPick(state); },
      apply: function (state, ctx) {
        const p = radioPick(state);
        if (!p) return false;   // no candidate: no cheat (DD.Cameo.cheat reads false as "no card")
        state.data.cameoRadio = { unitId: p.unit.id, skillId: p.def.id };
        const desc = radioDesc(p);
        if (ctx && typeof ctx === 'object') ctx.desc = desc;
        if (!sim()) DD.FX.text(p.unit, '📻 *BLEEP*', { color: '#ff7ad9', size: 16 });
        DD.Act.touch();
        return desc;
      },
      hooks: {
        modifyUse: function (q) { if (vetoReady() && radioHit(q)) q.why = 'Bleeped by Svammiel (Radio Edit).'; },
        modifyCost: function (c) { if (!vetoReady() && radioHit(c)) c.ap = 99; },
      } },
  };
  /** A Coven member standing on the cameo's lava patch (his lava spares them). */
  function onCameoLava(u) {
    const st = S();
    if (!u || (u.tags || []).indexOf(N.covenTag) < 0 || !st || !st.data) return false;
    return (st.data.svamCameoLava || []).some(function (p) { return p.x === u.x && p.y === u.y; });
  }
  function spared(u) {
    const st = S();
    if (sim() || !st || !st.data) return;
    DD.FX.text(u, '🌋 Not her! Family!', { color: '#ffb06a', size: 14 });
    if (st.data.svamLavaSpared) return;
    st.data.svamLavaSpared = true;
    DD.Act.log('The lava parts politely around ' + u.name + '. Svammiel\'s lava knows its friends.', 'cameo', { speaker: 'Svammiel', actor: ACTOR });
  }
  /** The Coven arena's patch (x 6-8, y 7-9): walkable, unoccupied floor that isn't liquid already. */
  function lavaPatch(state) {
    const P = N.lavaPatch, out = [];
    if (!state || !state.grid) return out;
    for (let y = P.y0; y <= P.y1; y++) {
      for (let x = P.x0; x <= P.x1; x++) {
        const t = G().tile(x, y);
        if (!t || t.obj || G().unitAt(x, y)) continue;
        const td = G().terrain(t);
        if (td.walkable === false || td.pit || td.liquid) continue;
        out.push({ x: x, y: y });
      }
    }
    return out;
  }
  /**
   * Apply a cameo cheat the way DD.Cameo.cheat does (when → apply → the rule with its fields → the log line): what the
   * suites and debug pages use while the engine is the core stand-in. Returns the rule or null.
   */
  function applyCameoCheat(cheatId, state) {
    state = state || S();
    const def = CAMEO_CHEATS[cheatId];
    if (!def || !state || (def.when && !def.when(state))) return null;
    const ctx = { state: state, id: def.id, name: def.name, desc: def.desc };
    let desc = def.desc;
    if (typeof def.apply === 'function') {
      const r = def.apply(state, ctx);
      if (r === false) return null;
      desc = typeof r === 'string' && r ? r : ctx.desc;
    }
    const rule = DD.Act.addRule({ id: 'cameo:' + def.id, name: def.icon + ' ' + def.name, icon: def.icon, desc: desc, turns: def.rounds,
      hooks: def.hooks || {}, onAdd: def.onAdd, onRemove: def.onRemove, telegraphFlat: def.telegraphFlat, cheat: true, source: ACTOR, silent: true });
    if (!sim()) DD.Act.log('😈 Svammiel cheats: ' + def.name + '. ' + desc + ' Reason: ' + quietPick(pool('svam_reason', REASONS)).replace(/[.\s]+$/, '') + '.', 'cameo', { speaker: 'Svammiel', actor: ACTOR });
    return rule;
  }

  // ---- the start roast's situation (V §6.2 priority list; each at most once a run: DD.Cameo skips a used key) ------------
  const SITS = ['fallen', 'recruit', 'first', 'last_mini', 'debt', 'downed_last', 'mvp', 'flawless', 'from_tavern', 'from_shop', 'from_event', 'hurt',
    'fresh', 'rich', 'broke', 'scarred', 'swapped', 'brutal', 'casual'];
  function situation(state, run, usedKeys) {
    if (!state || !run) return null;
    const used = (Array.isArray(usedKeys) ? usedKeys : (run.flags && run.flags.cameo && run.flags.cameo.situations) || []).map(String);
    const times = function (k) { return used.filter(function (x) { return x === k || x === 'svam_sit_' + k; }).length; };
    const party = (run.party || []).filter(function (h) { return h && !h.dead; });
    const name = function (id) { const d = DD.getHero(id); return d ? d.name : id; };
    const units = unitsOf(state, function (u) { return u.kind === 'hero'; });
    const flags = run.flags || {};
    const last = flags.lastFight || {}, stop = flags.lastStop;
    const stopType = typeof stop === 'string' ? stop : stop && (stop.type || stop.kind);
    const lanes = (run.map && run.map.lanes) || [];
    const beaten = flags.gauntlet || (run.map && run.map.beaten) || [];
    const door = !!(state.encounter && state.encounter.gauntlet);
    const checks = {
      fallen: function () { const f = (run.fallen || []).slice(-1)[0]; return f ? { name: name(f) } : null; },
      recruit: function () { const id = stop && typeof stop === 'object' && (stop.recruit || (stop.used === 'recruit' && stop.heroId)); return id && party.some(function (h) { return h.id === id; }) ? { hero: name(id) } : null; },
      first: function () { return door && !beaten.length ? {} : null; },
      last_mini: function () { return door && lanes.length > 1 && beaten.length === lanes.length - 1 ? {} : null; },
      debt: function () { const h = party.filter(function (x) { return (x.scars || []).indexOf('scar_owes_the_dm') >= 0; })[0]; return h ? { hero: name(h.id) } : null; },
      downed_last: function () { const id = (last.downed || []).filter(function (x) { return party.some(function (h) { return h.id === x; }); })[0]; return id ? { hero: name(id) } : null; },
      mvp: function () { return last.mvp && party.some(function (h) { return h.id === last.mvp; }) ? { hero: name(last.mvp) } : null; },
      flawless: function () { return last.flawless ? {} : null; },
      from_tavern: function () { return stopType === 'tavern' && DD.rng.next() < 0.5 ? {} : null; },
      from_shop: function () { return stopType === 'shop' && DD.rng.next() < 0.5 ? {} : null; },
      from_event: function () { return stopType === 'event' && DD.rng.next() < 0.5 ? {} : null; },
      hurt: function () { let hp = 0, mx = 0; units.forEach(function (u) { hp += u.hp; mx += u.maxHp; }); return mx && hp / mx < 0.5 ? {} : null; },
      fresh: function () { return units.length && units.every(function (u) { return u.hp >= u.maxHp; }) ? {} : null; },
      rich: function () { return (run.gold || 0) >= 250 ? {} : null; },
      broke: function () { return (run.gold || 0) < 30 ? {} : null; },
      scarred: function () { const h = party.filter(function (x) { return (x.scars || []).length >= 2; })[0]; return h ? { hero: name(h.id) } : null; },
      swapped: function () { return (last.swaps || 0) > 0 ? {} : null; },
      brutal: function () { return run.difficulty === 'brutal' ? {} : null; },
      casual: function () { return run.difficulty === 'casual' ? {} : null; },
    };
    // the hero a situation names (for the comeback): its def id from the name it filled in
    const idOf = function (nm) { const h = party.filter(function (x) { return name(x.id) === nm; })[0]; return h ? h.id : null; };
    for (let i = 0; i < SITS.length; i++) {
      const k = SITS[i], key = 'svam_sit_' + k;
      if (times(k) >= 1) continue;
      if (!(DD.defs.narration[key] && DD.defs.narration[key].length)) continue;
      const vars = checks[k]();
      if (!vars) continue;
      const out = { key: key, vars: vars, id: k };
      if (vars.hero) { const hid = idOf(vars.hero); if (hid) out.heroId = hid; }
      return out;
    }
    return null;
  }

  DD.registerCameo({
    id: ACTOR, name: 'Svammiel', title: 'The Floor Boss', icon: '😈', color: '#c0213a', enemy: SVAM,
    triggers: [
      { id: 'start', on: 'start', act: 4, style: 'swoop' },
      // keyOf runs as the entrance starts: the table shakes first (plan §2.1). In a run the DM's death already shook it
      // (dm.js → twistShake, a no-op here); the debug sandbox twist (encounter=boss_dm&twist=1, the DM alive) shakes it now
      { id: 'twist', on: 'victory', act: 3, kind: 'boss', when: function (s) { return DD.Cameo.campaignGoesOn(s); }, key: 'svam_twist', style: 'entrance', force: true,
        keyOf: function (s) { twistShake(s); return 'svam_twist'; },
        banner: { title: 'YOU THOUGHT THIS WAS OVER?' }, bubble: 'I, SVAMMIEL, CONTROL ALL.', then: twistExtras },
      { id: 'shadow', on: 'round', act: 3, encounter: 'boss_dm', when: function (s) { return DD.Cameo.campaignGoesOn(s) && dmPhase3(); }, style: 'shadow', once: true },
      { id: 'down', on: 'heroDowned', act: 4, key: 'svam_down', style: 'bubble' },
      { id: 'signature', on: 'signature', act: 4, key: 'svam_signature', style: 'bubble', once: true },
      { id: 'member_down', on: 'kill', act: 4, squad: true, key: 'svam_member_down', style: 'bubble', once: true },
      { id: 'env_kill', on: 'kill', act: 4, key: 'svam_env_kill', style: 'bubble', once: true,
        when: function (s, e) { const k = e && DD.Combat.byId(e.killerId); return !!k && k.side === 'hero' && /^(surface|terrain|bump|fall|explosion)$/.test(e.cause || ''); } },
      { id: 'countered', on: 'windupCancel', act: 4, key: 'svam_countered', style: 'bubble', once: true },
      { id: 'long', on: 'round', act: 4, from: 8, key: 'svam_long', style: 'bubble', once: true },
      { id: 'sulk', on: 'victory', act: 4, keyOf: function (s) { const g = s && s.encounter && s.encounter.gauntlet; return g ? 'svam_sulk_' + g.lane : null; }, style: 'quip' },
    ],
    situation: situation,
    roastPrefix: 'svam_hero_', comebackPrefix: 'svam_back_',
    cheats: (function () {
      const out = {};
      Object.keys(CAMEO_CHEATS).forEach(function (k) { out[k] = CAMEO_CHEATS[k]; });
      // the finale's cheats share the catalogue (his own fight runs them through its announce / activate cycle)
      Object.keys(CH).forEach(function (k) { out[k] = CH[k]; });
      return out;
    })(),
  });

  // ---- test / debug hooks (no game logic depends on them, but dm.js's call of twistShake at the DM's death) ---------------
  /** Make cheat `id` next round's (or, with opts.now, this round's) Round Cheat; data defaults to the cheat's own plan. */
  function force(id, data, opts) {
    const st = S(), F = fight(st);
    opts = opts || {};
    const r = opts.now ? st.round : st.round + 1;
    const c = { id: id, round: r, data: data || planCheat(st, F, id, r) || {} };
    if (opts.now) {
      const old = F.cur;
      F.cur = null;
      if (old) DD.Act.removeRule(CUR_RULE);
      announce(st, F, c);
      activate(st, F, c);
      if (opts.start !== false) startEffects(st, F, c);
    } else {
      if (F.next) DD.Act.removeRule(NEXT_RULE);
      announce(st, F, c);
    }
    updateBoard(st);
    return c;
  }
  DD.BossSvammiel = {
    N: N, KIT: KIT, DECK: DECK, CHEATS: CH, CAMEO_CHEATS: CAMEO_CHEATS, LAYOUT: LAYOUT, CORE: CORE, SAFE: SAFE, CLOCKWISE: CLOCKWISE, LANDMARK: LANDMARK,
    vetoMode: 'auto', vetoReady: vetoReady,
    fight: fight, peek: peek, findSvam: findSvam, ensurePanels: ensurePanels, panel: function (id) { return panel(peek(), id); }, present: function (id) { return present(peek(), id); },
    panelIdAt: panelIdAt, threshold: threshold, floorHp: function (u) { return floorHp(u, fight()); }, syncPhase: syncPhase, enterPhase: enterPhase, syncKit: syncKit,
    drawCheat: function (r) { return drawCheat(S(), fight(), r); }, planCheat: function (id, r) { return planCheat(S(), fight(), id, r); }, force: force,
    descOf: descOf, cancelTarget: function () { return cancelTarget(fight()); }, rulingOpen: rulingOpen, rulingValue: rulingValue, askRuling: askRuling,
    dropPanel: function (id, opts) { return dropPanel(fight(), id, opts); }, placeMasterDice: function () { return placeMasterDice(S(), fight()); },
    markDrops: function (r) { return markDrops(S(), fight(), r); }, caught: caughtCheating, standingMaster: standingMaster, threatAt: threatAt,
    radioPick: radioPick, healsWith: healsWith, radioDesc: radioDesc, applyCameoCheat: applyCameoCheat, situation: situation, passiveText: passiveText, updateBoard: updateBoard,
    slideOutcome: slideOutcome, onRoundEnd: encRoundEnd, onRoundStart: encRoundStart, namedBark: namedBark,
    // twistShake: called at runtime by dm.js (the twist's first beat as the DM dies); the rest: suites
    twistShake: twistShake, windTurns: function (u) { return windTurns(S(), u || findSvam()); }, aheadDescOf: aheadDescOf, radioLanded: radioLanded,
  };
})();
