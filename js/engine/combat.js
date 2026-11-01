/* Dungeons and Degenerates — js/engine/combat.js
 * DD.Combat (ARCHITECTURE §5.5, §6.1-6.4, §6.8-6.10): combat state, initiative and individual turns (v2), the player
 * action API, objectives, reinforcements, deployment, undo, cooldowns/charges/Hype costs, consumables, interactions
 * (incl. Help Up) and the sandbox used by tests and debug tools.
 * v2 flow: deployment → rollInitiative() (every hero and enemy rolls d20 + init; hero summons act on their owner's
 * turn) → rounds in that fixed order. A hero turn waits for the player and endTurn() ends it; AI turns resolve at once
 * (DD.AI.act), so endTurn() also runs every following AI turn until the next hero turn or the end of the fight.
 * Block and AP refresh at the start of a unit's own turn; statuses and cooldowns tick per own turn.
 * Public actions emit 'combat:changed'; the end of combat (hooks, 'combat:end', onEnd) is finalized when the
 * outermost public action completes, so effects never run on a half-resolved state.
 */
(function () {
  'use strict';
  const DD = window.DD;
  const U = DD.util;

  // Difficulty factors live in DD.Balance.difficulty (js/data/balance.js); this copy is the fallback without it.
  const FALLBACK_DIFFICULTY = { casual: { hp: 0.8, dmg: 0.8 }, normal: { hp: 1, dmg: 1 }, brutal: { hp: 1.25, dmg: 1.2 } };
  function diffTable() { return (DD.Balance && DD.Balance.difficulty) || FALLBACK_DIFFICULTY; }

  const Combat = (DD.Combat = { state: null });
  Object.defineProperty(Combat, 'DIFFICULTY', { enumerable: true, get: diffTable });

  // initiative modifier of an enemy whose def gives no `init` (DESIGN §4.1)
  const TIER_INIT = { minion: 1, normal: 0, elite: 1, boss: 2 };
  Combat.TIER_INIT = TIER_INIT;
  const INIT_MODES = { roll: 1, heroesFirst: 1, enemiesFirst: 1 };
  // safety nets: turns one endTurn() may resolve, rounds in a row without a hero turn
  const MAX_TURNS = 5000, MAX_IDLE_ROUNDS = 200;

  // module state (saved/restored around preview simulations)
  let depth = 0;
  let pendingEnd = false;
  let endCb = null;
  let endState = null;
  Combat._saveModule = function () { return { depth: depth, pendingEnd: pendingEnd }; };
  Combat._restoreModule = function (m) { depth = m.depth; pendingEnd = m.pendingEnd; };

  function S() { return Combat.state; }
  function active(u) { return !!u && !u.dead && !u.downed; }
  function hasSt(u, id) { return DD.Act.hasStatus(u, id); }
  /** Stun / Sleep / Frozen or a content status with stunLike: the unit loses its turn. */
  function stunned(u) { return DD.Act.isStunned(u); }
  Combat.isStunned = stunned;
  /** Can't take move actions: Rooted or held (a status def with noMove). */
  Combat.cantMove = function (u) { return DD.Act.cantMove(u); };
  function emit(name, data) { if (DD.Act && DD.Act.emit) DD.Act.emit(name, data); else DD.Events.emit(name, data); }

  function changed() { if (!DD.Act.simulating && S()) DD.Events.emit('combat:changed', { state: S() }); }
  Combat.changed = changed;

  /** Run a public action: nested-safe; finalizes a pending combat end afterwards; emits combat:changed. */
  function action(fn) {
    depth++;
    let r;
    try { r = fn(); } finally {
      depth--;
      if (depth === 0) flushEnd();
    }
    changed();
    return r;
  }
  Combat._action = action;

  // ---- unit queries ------------------------------------------------------------------------------
  Combat.units = function () { const s = S(); return s ? s.units.filter(function (u) { return !u.dead; }) : []; };
  Combat.active = function (side) { const s = S(); return s ? s.units.filter(function (u) { return active(u) && (!side || u.side === side); }) : []; };
  Combat.heroes = function () { const s = S(); return s ? s.units.filter(function (u) { return u.kind === 'hero' && !u.dead; }) : []; };
  Combat.party = function () { const s = S(); return s ? s.units.filter(function (u) { return u.side === 'hero' && !u.dead; }) : []; };
  Combat.enemies = function () { return Combat.active('enemy'); };
  Combat.foesOf = function (u) { const s = S(); return s ? s.units.filter(function (o) { return active(o) && DD.Grid.hostile(u, o); }) : []; };
  Combat.friendsOf = function (u) { const s = S(); return s ? s.units.filter(function (o) { return active(o) && o !== u && !DD.Grid.hostile(u, o); }) : []; };
  Combat.unitAt = function (x, y) { return DD.Grid.unitAt(x, y); };
  Combat.byId = function (id) {
    const s = S();
    if (!s || id == null) return null;
    for (let i = 0; i < s.units.length; i++) if (s.units[i].id === id) return s.units[i];
    return null;
  };
  /** Every usable SkillSlot of a unit in display order (heroes: basic, skills, signature). */
  Combat.slotsOf = function (u) {
    if (!u) return [];
    if (u.kind === 'hero') {
      const out = [];
      if (u.basic) out.push(u.basic);
      for (let i = 0; i < u.skills.length; i++) out.push(u.skills[i]);
      if (u.signature) out.push(u.signature);
      return out;
    }
    if (u.kind === 'summon') return u.skills || [];
    return u.skillSlots || [];
  };
  /** Party consumable inventory (run, or the sandbox list). */
  Combat.consumables = function () {
    const s = S();
    if (!s) return [];
    if (s.run) return s.run.consumables || (s.run.consumables = []);
    return s.consumables || (s.consumables = []);
  };
  /** Movement allowance: sheep 2; enemies ±2 for haste/slow (Slow: min 1, and never gives a stationary unit movement). */
  Combat.effectiveMov = function (u) {
    if (hasSt(u, 'sheep')) return 2;
    let m = Math.max(0, Number(u.mov) || 0);
    if (u.side === 'enemy') {
      if (hasSt(u, 'haste')) m += 2;
      if (hasSt(u, 'slow') && m > 0) m = Math.max(1, m - 2);
    }
    return m;
  };
  /**
   * AP of one move action: 1 (a Confused hero 2), then the unit's modifyMoveCost(m) hooks, m = { unit, ap }
   * (rounded, min 0). [phase 4, passives-table request]
   */
  Combat.moveApCost = function (u) {
    if (!u) return 1;
    const m = { unit: u, ap: u.side === 'hero' && hasSt(u, 'confused') ? 2 : 1 };
    DD.Hooks.fire('modifyMoveCost', u, m);
    const ap = Math.round(+m.ap);
    return isFinite(ap) ? Math.max(0, ap) : 1;
  };

  // ---- initiative order & turn ownership ---------------------------------------------------------------
  /** Played by the player: heroes and hero-side summons. Everything else is AI-controlled on its own turn. */
  function playerSide(u) { return !!u && (u.kind === 'hero' || (u.kind === 'summon' && u.side === 'hero')); }
  Combat.isPlayerControlled = playerSide;

  function entryIndex(s, u, from) {
    if (!s || !s.order || !u) return -1;
    for (let i = from || 0; i < s.order.length; i++) if (s.order[i].unitId === u.id) return i;
    return -1;
  }
  /** The unit whose turn u acts on: itself when it has an initiative entry, else its owner's (summons); null if none. */
  function turnOwnerOf(u) {
    const s = S();
    if (!s || !s.order || !u) return null;
    let cur = u;
    for (let guard = 0; cur && guard < 8; guard++) {
      if (entryIndex(s, cur) >= 0) return cur;
      if (!cur.ownerId) return null;
      const o = Combat.byId(cur.ownerId);
      if (!o || o.dead) return null;
      cur = o;
    }
    return null;
  }
  Combat.turnOwner = turnOwnerOf;
  /** The units of a turn: its owner plus every (non-dead) summon acting on that turn. */
  function groupOf(owner) {
    const s = S();
    if (!s || !owner) return [];
    const out = [owner];
    for (let i = 0; i < s.units.length; i++) {
      const u = s.units[i];
      if (u !== owner && !u.dead && u.ownerId && turnOwnerOf(u) === owner) out.push(u);
    }
    return out;
  }
  Combat.groupOf = groupOf;
  /** The unit whose turn it is (null before initiative, between turns and in deployment). */
  Combat.current = function () { const s = S(); return s && s.current ? Combat.byId(s.current) : null; };
  /** The units acting this turn: the current unit and its summons. */
  Combat.turnGroup = function () { const c = Combat.current(); return c ? groupOf(c) : []; };
  /** Is it u's turn (u is the current unit or acts on its turn)? */
  Combat.isTurnOf = function (u) {
    const s = S();
    if (!s || !s.current || !u) return false;
    const o = turnOwnerOf(u);
    return !!o && o.id === s.current;
  };
  /**
   * u's turn is under way between its start-of-turn ticks and its end-of-turn decay (DD.Act marks statuses applied now
   * `fresh`: the end of this turn does not count for them). A stun from an onTurnStart hook costs this turn only.
   */
  Combat.isActing = function (u) { const s = S(); return !!s && !!s.turnLive && Combat.isTurnOf(u); };
  /**
   * This round's initiative order (living units; downed heroes keep their slot): copies of the entries
   * { unitId, roll, init, total, side, k, unit, index, current, acted, downed }.
   */
  Combat.order = function () {
    const s = S();
    if (!s || !s.order) return [];
    const out = [];
    s.order.forEach(function (e, i) {
      const u = Combat.byId(e.unitId);
      if (!u || u.dead) return;
      out.push(Object.assign({}, e, { unit: u, index: i, current: i === s.turnIndex && s.current === u.id, acted: i < s.turnIndex, downed: !!u.downed }));
    });
    return out;
  };
  /** Units that rolled initiative mid-round and join the order at the next round start: entries with `unit`. */
  Combat.joining = function () {
    const s = S();
    if (!s || !s.joining) return [];
    return s.joining.map(function (e) { return Object.assign({}, e, { unit: Combat.byId(e.unitId) }); }).filter(function (e) { return e.unit && !e.unit.dead; });
  };
  Combat.isDeploying = function () { const s = S(); return !!s && !s.result && s.phase === 'deploy'; };

  /** A unit's initiative modifier: heroes stats.init (+ items, scars, passives), enemies def.init or by tier. */
  function initOf(u) {
    if (typeof u.init === 'number' && isFinite(u.init)) return u.init;
    if (u.kind === 'enemy') return TIER_INIT[u.tier] || 0;
    return 0;
  }
  Combat.initOf = initOf;
  /** How many initiative entries a unit gets per round (enemy / summon def turnsPerRound, e.g. a boss with two). */
  function entriesPerRound(u) {
    if (u.kind === 'hero') return 1;
    const def = DD.Hooks.defOf(u);
    const n = def ? Math.round(+def.turnsPerRound || 1) : 1;
    return U.clamp(isFinite(n) ? n : 1, 1, 4);
  }
  /** One initiative entry. Roll mode: d20 + init via state.rng, then the unit's modifyInitiative(r) hooks. */
  function rollEntry(s, u, k) {
    const init = initOf(u);
    const roll = s.initMode === 'roll' ? s.rng.int(1, 20) : 0;
    const r = { unit: u, roll: roll, init: init, total: roll + init, k: k || 0 };
    if (s.initMode === 'roll') DD.Hooks.fire('modifyInitiative', u, r);
    const total = Math.round(+r.total);
    return {
      unitId: u.id, roll: r.roll, init: Math.round(+r.init) || 0, total: isFinite(total) ? total : roll + init, side: u.side,
      tie: s.initMode === 'roll' ? s.rng.float() : 0, k: k || 0, fixed: s.initMode !== 'roll',
    };
  }
  function entriesFor(s, u) {
    const out = [];
    for (let k = 0, n = entriesPerRound(u); k < n; k++) out.push(rollEntry(s, u, k));
    return out;
  }
  /** Rolled order: higher total, then higher init, then heroes, then the pre-rolled coin flip. */
  function cmpEntries(a, b) {
    return (b.total - a.total) || (b.init - a.init) || ((b.side === 'hero' ? 1 : 0) - (a.side === 'hero' ? 1 : 0)) || (b.tie - a.tie);
  }
  /** Units named by an explicit order (unit objects, unit ids or def ids) → { unitId: rank }. */
  function explicitRanks(s, list) {
    const rank = {};
    let n = 0;
    (list || []).forEach(function (sel) {
      let u = null;
      if (sel && typeof sel === 'object' && sel.id) u = Combat.byId(sel.id);
      else if (typeof sel === 'string') {
        u = Combat.byId(sel);
        if (!u) u = s.units.filter(function (x) { return !x.dead && x.defId === sel && rank[x.id] === undefined; })[0] || null;
      }
      if (u && rank[u.id] === undefined) rank[u.id] = n++;
    });
    return rank;
  }
  /** Put a fresh list of entries in initiative order for the fight's mode (fixed modes number their totals). */
  function arrange(s, list) {
    if (s.initMode === 'roll' && !s.initOrder) { list.sort(cmpEntries); return list; }
    const pos = {};
    s.units.forEach(function (u, i) { pos[u.id] = i; });
    const rank = explicitRanks(s, s.initOrder);
    const heroFirst = s.initMode !== 'enemiesFirst';
    const key = function (e) {
      const u = Combat.byId(e.unitId);
      const listed = rank[e.unitId] !== undefined;
      const sideRank = (u && u.side === 'hero') === heroFirst ? 0 : 1;
      return [e.k || 0, listed ? 0 : 1, listed ? rank[e.unitId] : 0, s.initMode === 'roll' ? -e.total : sideRank, u && u.kind === 'hero' ? 0 : 1, pos[e.unitId] || 0];
    };
    const keyed = list.map(function (e) { return { e: e, k: key(e) }; });
    keyed.sort(function (a, b) { for (let i = 0; i < a.k.length; i++) if (a.k[i] !== b.k[i]) return a.k[i] - b.k[i]; return 0; });
    list.length = 0;
    keyed.forEach(function (x, i) {
      if (x.e.fixed) { x.e.total = keyed.length - i; x.e.roll = 0; }
      list.push(x.e);
    });
    return list;
  }
  /** Insert a joiner into next round's order (rolled: by its total; fixed modes: at the end). */
  function insertEntry(s, e) {
    if (s.initMode === 'roll' && !e.fixed) {
      let i = 0;
      while (i < s.order.length && cmpEntries(s.order[i], e) <= 0) i++;
      s.order.splice(i, 0, e);
    } else {
      e.total = 0;
      s.order.push(e);
    }
  }
  /** Keep unit.order = 1-based position of its first entry (HUD badges). */
  function renumber(s) {
    if (!s.order) return;
    const seen = {};
    s.order.forEach(function (e, i) {
      if (seen[e.unitId]) return;
      seen[e.unitId] = 1;
      const u = Combat.byId(e.unitId);
      if (u) u.order = i + 1;
    });
  }

  /**
   * A unit arrived mid-fight (Act.spawn / Act.summon call this): if it needs a turn of its own (not a summon acting on
   * its owner's turn) it rolls initiative now and joins the order at the next round start. Returns the entry or null.
   */
  Combat.noteArrival = function (u) {
    const s = S();
    if (!s || !s.order || !u || u.dead || DD.Act.simulating) return null;
    if (turnOwnerOf(u)) return null;
    if ((s.joining || []).some(function (j) { return j.unitId === u.id; })) return null;
    const list = entriesFor(s, u);
    s.joining = (s.joining || []).concat(list);
    if (s.initMode === 'roll') {
      DD.Act.log(u.name + ' rolls initiative: ' + list[0].total + ' (joins next round).', 'system');
      if (!DD.FX.instant) DD.FX.text(u, '🎲 ' + list[0].total, { color: '#ffe08a', size: 15 });
    }
    emit('initiative:joined', { unit: u, unitId: u.id, entries: list.map(function (e) { return Object.assign({}, e); }) });
    return list[0];
  };

  /** Round start: drop the dead, give orphans (summons whose owner died) an entry, merge the joiners. */
  function mergeJoiners(s) {
    if (!s.order) return;
    s.order = s.order.filter(function (e) { const u = Combat.byId(e.unitId); return !!u && !u.dead; });
    s.joining = (s.joining || []).filter(function (e) { const u = Combat.byId(e.unitId); return !!u && !u.dead; });
    s.units.forEach(function (u) {
      if (!active(u) || turnOwnerOf(u) || s.joining.some(function (j) { return j.unitId === u.id; })) return;
      entriesFor(s, u).forEach(function (e) { s.joining.push(e); });
    });
    const add = s.joining;
    s.joining = [];
    add.forEach(function (e) { insertEntry(s, e); });
    renumber(s);
  }

  // ---- state cloning (previews) ------------------------------------------------------------------------
  function copyVal(v, memo, depthLeft) {
    if (v === null || typeof v !== 'object') return v;
    const hit = memo.get(v);
    if (hit !== undefined) return hit;
    if (depthLeft <= 0) return v;
    if (Array.isArray(v)) {
      const a = new Array(v.length);
      memo.set(v, a);
      for (let i = 0; i < v.length; i++) a[i] = copyVal(v[i], memo, depthLeft - 1);
      return a;
    }
    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) return v;
    const o = {};
    memo.set(v, o);
    for (const k in v) if (Object.prototype.hasOwnProperty.call(v, k)) o[k] = copyVal(v[k], memo, depthLeft - 1);
    return o;
  }
  Combat.copyVal = function (v) { return copyVal(v, new Map(), 14); };

  /** Deep copy of a combat state: plain data copied, functions/defs/run shared, RNG cloned at the same state. */
  Combat.cloneState = function (s) {
    const memo = new Map();
    const rng = DD.RNG(1);
    rng.setState(s.rng.getState());
    memo.set(s.rng, rng);
    if (s.run) memo.set(s.run, s.run);
    if (s.encounter) memo.set(s.encounter, s.encounter);
    memo.set(s.log, s.log.slice());
    return copyVal(s, memo, 14);
  };

  // ---- unit construction ------------------------------------------------------------------------------
  function itemList(items) {
    if (!items) return [];
    if (Array.isArray(items)) return items.filter(Boolean);
    const out = [];
    for (const k in items) if (items[k]) out.push(items[k]);
    return out;
  }
  Combat.itemList = itemList;

  /** Sum of one stat over a RunHero's items, scars and random passives. */
  function statSum(rh, key) {
    let n = 0;
    itemList(rh.items).forEach(function (id) { const it = DD.getItem(id); if (it && it.stats) n += Number(it.stats[key]) || 0; });
    (rh.scars || []).forEach(function (id) { const sc = DD.getScar(id); if (sc && sc.stats) n += Number(sc.stats[key]) || 0; });
    (rh.passives || []).forEach(function (p) { const ps = DD.passiveStats(p); if (ps) n += Number(ps[key]) || 0; });
    return n;
  }

  /** Stats of a RunHero: DD.Run.heroStats when available, else def stats + growth + items + scars. */
  Combat.heroStats = function (rh) {
    const def = DD.getHero(rh.id);
    if (DD.Run && typeof DD.Run.heroStats === 'function') {
      const st = DD.safe('Run.heroStats', DD.Run.heroStats, DD.Run, [rh]);
      if (st && st.maxHp > 0) return st;
    }
    const base = (def && def.stats) || {};
    const lvl = Math.max(1, rh.level || 1);
    const st = { maxHp: (base.hp || 20) + ((def && def.growth && def.growth.hp) || 4) * (lvl - 1), ap: base.ap || 3,
      mov: base.mov || 4, armor: base.armor || 0, dmg: 0, heal: 0, range: 0, block: 0, hype: 0, init: base.init || 0 };
    const add = function (stats) {
      if (!stats) return;
      st.maxHp += stats.hp || 0; st.ap += stats.ap || 0; st.mov += stats.mov || 0; st.armor += stats.armor || 0;
      st.dmg += stats.dmg || 0; st.heal += stats.heal || 0; st.range += stats.range || 0; st.block += stats.block || 0; st.hype += stats.hype || 0;
      st.init += stats.init || 0;
    };
    itemList(rh.items).forEach(function (id) { const it = DD.getItem(id); if (it) add(it.stats); });
    (rh.scars || []).forEach(function (id) { const sc = DD.getScar(id); if (sc) add(sc.stats); });
    (rh.passives || []).forEach(function (p) { add(DD.passiveStats(p)); });
    st.maxHp = Math.max(1, st.maxHp); st.ap = Math.max(1, st.ap); st.mov = Math.max(1, st.mov);
    return st;
  };

  /** RunHero-shaped record for sandbox/debug heroes: { id, level, skills, items, scars, passives, hp }. */
  Combat.makeRunHero = function (h) {
    const def = DD.getHero(h.id);
    const lvl = Math.max(1, h.level || 1);
    const skills = (h.skills || (def ? def.startingSkills : []) || []).slice(0, 4).map(function (sk) {
      return typeof sk === 'string' ? { id: sk, level: h.skillLevel || 1 } : { id: sk.id, level: sk.level || 1 };
    });
    let items = h.items || { weapon: null, armor: null, trinket: null };
    if (Array.isArray(items)) {
      const o = { weapon: null, armor: null, trinket: null };
      items.forEach(function (id) { const it = DD.getItem(id); if (it) o[it.slot] = id; });
      items = o;
    }
    const passives = (h.passives || []).slice(0, 4).map(function (p) {
      return typeof p === 'string' ? { id: p, level: 1 } : { id: p.id, level: p.level || 1 };
    });
    return { id: h.id, level: lvl, xp: 0, hp: h.hp, skills: skills, items: items, scars: (h.scars || []).slice(), passives: passives, downs: 0, dead: false, kills: 0 };
  };

  /** A hero's initiative modifier: stats.init from DD.Run.heroStats when it reports one, else def + items/scars/passives. */
  function heroInit(rh, def, st) {
    if (st && typeof st.init === 'number' && isFinite(st.init)) return Math.round(st.init);
    return Math.round((Number(def && def.stats && def.stats.init) || 0) + statSum(rh, 'init'));
  }

  Combat.makeHeroUnit = function (rh, x, y) {
    const def = DD.getHero(rh.id);
    if (!def) { DD.warn('Combat: unknown hero "' + rh.id + '"'); return null; }
    const st = Combat.heroStats(rh);
    const u = DD.Act.baseUnit(def, 'hero', 'hero', x, y);
    u.maxHp = Math.max(1, Math.round(st.maxHp));
    u.hp = rh.hp === undefined || rh.hp === null ? u.maxHp : U.clamp(Math.round(rh.hp), 1, u.maxHp);
    u.armor = st.armor || 0;
    u.maxAp = st.ap || 3;
    u.mov = isFinite(Number(st.mov)) && st.mov !== null ? Math.max(1, Math.round(Number(st.mov))) : 4;
    u.dmgBonus = st.dmg || 0;
    u.healBonus = st.heal || 0;
    u.rangeBonus = st.range || 0;
    // v2: items' stats.block no longer grant Block at combat start (nobody starts a fight with Block)
    u.block = 0;
    u.hypeBonus = st.hype || 0;
    u.init = heroInit(rh, def, st);
    u.level = rh.level || 1;
    u.runHero = rh;
    u.basic = def.basic ? DD.Act.makeSlot(def.basic, 1) : null;
    u.signature = def.signature ? DD.Act.makeSlot(def.signature, 1) : null;
    u.skills = (rh.skills || []).slice(0, 4).map(function (sk) {
      return typeof sk === 'string' ? DD.Act.makeSlot(sk, 1) : DD.Act.makeSlot(sk.id, sk.level || 1);
    });
    u.items = itemList(rh.items);
    u.scars = (rh.scars || []).slice();
    // rolled table passives: fresh instances (own `data`) every fight
    u.passives = (rh.passives || []).slice(0, 4).map(DD.passiveInstance).filter(Boolean);
    return u;
  };

  function emptyGrid(w, h, floor) {
    const tiles = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) tiles.push({ x: x, y: y, h: 0, t: floor || 'stone', surface: null, obj: null, zone: null, tag: null });
    return { w: w, h: h, tiles: tiles };
  }
  Combat.emptyGrid = emptyGrid;

  /**
   * Enemy multipliers of a fight. opts.difficulty (name, { id } or a custom { hp, dmg } without id) → run difficulty →
   * setup.difficulty (Encounter.build) → normal. Named difficulties go through DD.Balance.scale (difficulty × act ×
   * fight kind); sandbox fights use the difficulty factor alone, so a 'normal' sandbox stays neutral. [balance]
   */
  function difficultyOf(opts, run, setup) {
    const DIFFICULTY = diffTable();
    let src = opts.difficulty;
    if (!src && !run && setup && setup.difficulty) src = setup.difficulty;
    if (src && typeof src === 'object') {
      const named = typeof (src.id || src.name) === 'string' && DIFFICULTY[src.id || src.name];
      if (!named && (typeof src.hp === 'number' || typeof src.dmg === 'number')) return { name: src.id || src.name || 'custom', hp: src.hp || 1, dmg: src.dmg || 1 };
      src = src.id || src.name;
    }
    const name = typeof src === 'string' && DIFFICULTY[src] ? src : (run && DIFFICULTY[run.difficulty] ? run.difficulty : 'normal');
    const enc = setup && setup.encounter;
    const act = (setup && setup.act) || (enc && enc.act) || (run && run.act) || 1;
    const kind = opts.kind || (setup && setup.kind) || (enc && enc.kind) || 'normal';
    if (DD.Balance && typeof DD.Balance.scale === 'function') {
      const sc = DD.Balance.scale(name, act, kind, { neutral: !!opts.sandbox, encounter: enc && enc.id });
      return { name: name, hp: sc.hp, dmg: sc.dmg };
    }
    const d = DIFFICULTY[name];
    return { name: name, hp: d.hp, dmg: d.dmg };
  }

  // ---- objectives (§6.9) ------------------------------------------------------------------------------
  function objName(id) { const d = DD.getObject(id); return d ? d.name : (id || 'object'); }
  /** Plural for objective text: the def's pluralName ("Chafing Dishes"), else name + "s". [phase 4, act 2 request] */
  function objPlural(id) { const d = DD.getObject(id); return d && d.pluralName ? d.pluralName : objName(id) + 's'; }
  function countObjects(s, id) {
    let n = 0;
    for (let i = 0; i < s.grid.tiles.length; i++) { const o = s.grid.tiles[i].obj; if (o && (!id || o.id === id)) n++; }
    return n;
  }
  /** The named boss (objective.bossId: def or unit id) plus every boss-tier enemy, e.g. a phase spawned as a new unit. */
  function bossUnits(s) {
    const id = s.objective && s.objective.bossId;
    const named = id ? s.units.filter(function (u) { return u.side === 'enemy' && (u.defId === id || u.id === id); }) : [];
    return named.concat(s.units.filter(function (u) { return u.side === 'enemy' && DD.Act.isBoss(u) && named.indexOf(u) < 0; }));
  }
  /** Units a protect { unitId } objective is about: that unit id, else every unit of that def id (encounter defs). */
  function vipUnits(s, id) {
    const byId = s.units.filter(function (u) { return u.id === id; });
    return byId.length ? byId : s.units.filter(function (u) { return u.defId === id; });
  }
  function foesLeft(s) { return s.units.some(function (u) { return u.side === 'enemy' && u.kind !== 'summon' && active(u); }); }
  function wavesPending(s) { return (s.reinforcements || []).some(function (w) { return !w.done && w.round > s.round; }); }

  Combat.objectiveText = function (s, ob) {
    s = s || S();
    ob = ob || s.objective;
    switch (ob.type) {
      case 'boss': {
        const b = bossUnits(s)[0];
        return 'Defeat ' + (b ? b.name : 'the boss') + ' (the minions will flee)';
      }
      case 'survive': return 'Survive ' + ob.rounds + ' rounds (' + Math.min(s.round, ob.rounds) + '/' + ob.rounds + ')';
      case 'destroy': {
        const total = ob.count || ob.total || 1;
        return 'Destroy ' + total + ' ' + (total === 1 ? objName(ob.objId) : objPlural(ob.objId)) + ' (' + Math.min(total, ob.destroyed || 0) + '/' + total + ')';
      }
      case 'protect': {
        const u = ob.unitId ? vipUnits(s, ob.unitId)[0] : null;
        return 'Protect ' + (u ? u.name : 'the ' + objName(ob.objId)) + ' and defeat all enemies';
      }
      case 'custom': return ob.label || (s.encounter && s.encounter.objectiveText) || 'Complete the objective';
      default: {
        const n = s.units.filter(function (u) { return u.side === 'enemy' && u.kind !== 'summon' && active(u); }).length;
        return 'Defeat all enemies' + (n ? ' (' + n + ' left)' : '');
      }
    }
  };
  Combat.refreshObjective = function () {
    const s = S();
    if (!s || !s.objective) return;
    if (s.objective.type === 'custom' && s.objective.fixedText) s.objective.text = s.objective.fixedText;
    else s.objective.text = Combat.objectiveText(s, s.objective);
  };

  function normalizeObjective(ob) {
    const o = Object.assign({ type: 'killAll' }, ob || {});
    if (['killAll', 'boss', 'survive', 'destroy', 'protect', 'custom'].indexOf(o.type) < 0) {
      DD.warn('Combat: unknown objective type "' + o.type + '", using killAll');
      o.type = 'killAll';
    }
    if (o.type === 'survive') o.rounds = Math.max(1, o.rounds || 5);
    if (o.type === 'custom' && o.text) { o.fixedText = o.text; o.label = o.text; }
    o.destroyed = o.destroyed || 0;
    return o;
  }

  function evaluate(s) {
    if (!s.units.some(function (u) { return u.kind === 'hero' && active(u); })) return 'defeat';
    const ob = s.objective;
    switch (ob.type) {
      case 'boss': {
        const bosses = bossUnits(s);
        if (!bosses.length) return foesLeft(s) ? null : 'victory';
        return bosses.every(function (b) { return b.dead; }) ? 'victory' : null;
      }
      case 'survive':
        return !foesLeft(s) && !wavesPending(s) ? 'victory' : null;
      case 'destroy': {
        if ((ob.destroyed || 0) >= (ob.count || ob.total || 1)) return 'victory';
        return countObjects(s, ob.objId) === 0 ? 'victory' : null;
      }
      case 'protect': {
        if (ob.unitId) {
          // a VIP that never showed up (not spawned yet / misnamed) is not a loss; one that went down is
          if (vipUnits(s, ob.unitId).some(function (u) { return u.dead || u.downed; })) return 'defeat';
        } else if (ob.objId && countObjects(s, ob.objId) === 0) return 'defeat';
        return foesLeft(s) ? null : 'victory';
      }
      case 'custom': {
        const enc = s.encounter;
        const fn = (enc && enc.checkObjective) || ob.check;
        if (typeof fn === 'function') {
          const r = DD.safe('checkObjective', fn, enc || ob, [s]);
          return r === 'victory' || r === 'defeat' ? r : null;
        }
        return foesLeft(s) ? null : 'victory';
      }
      default:
        return foesLeft(s) ? null : 'victory';
    }
  }

  /** Evaluate victory/defeat now (not while start() builds the fight); the end is finalized when the current public action completes. */
  Combat.checkEnd = function () {
    const s = S();
    if (!s) return null;
    if (s.result) return s.result;
    if (s.phase === 'setup') return null;
    Combat.refreshObjective();
    const r = evaluate(s);
    if (r) Combat.finish(r);
    return r;
  };

  Combat.finish = function (result) {
    const s = S();
    if (!s || s.result) return;
    s.result = result === 'defeat' ? 'defeat' : 'victory';
    s.phase = 'over';
    if (DD.Act.simulating) return;
    if (depth > 0) { pendingEnd = true; return; }
    finalize(s);
  };

  function flushEnd() {
    const s = S();
    if (pendingEnd && s && s.result && !s._finalized && !DD.Act.simulating) { pendingEnd = false; finalize(s); }
    pendingEnd = false;
  }

  function finalize(s) {
    if (s._finalized) return;
    s._finalized = true;
    const result = s.result;
    if (result === 'victory' && s.objective.type === 'boss') {
      s.units.forEach(function (u) {
        if (u.side === 'enemy' && active(u)) {
          u.dead = true; u.fled = true; u.intents = [];
          DD.FX.text(u, 'Flees!', { color: '#ffe08a', size: 16 });
          DD.FX.death(u, { cause: 'flee' });
        }
      });
    }
    s.units.slice().forEach(function (u) { if (!u.dead) DD.Hooks.fire('onCombatEnd', u, u, result); });
    Combat.refreshObjective();
    DD.Act.log(result === 'victory' ? 'Victory!' : 'Defeat...', 'system');
    DD.Act.narrate(result === 'victory' ? 'victory' : 'defeat', { hero: (Combat.heroes()[0] || {}).name || 'the party' });
    if (result === 'victory') {
      const up = Combat.active('hero').filter(function (u) { return u.kind === 'hero'; });
      if (up.length) DD.Act.bark(up[Math.floor(DD.rng.next() * up.length)], 'victory');
    }
    DD.Events.emit('combat:end', { result: result, state: s });
    if (endCb && endState === s) DD.safe('combat onEnd', endCb, null, [result, s]);
  }

  // ---- start / sandbox ------------------------------------------------------------------------------
  /** Cosmetic: every unit starts looking (screen x) toward its nearest foe, whatever the map orientation. */
  function faceNearestFoes(s) {
    s.units.forEach(function (u) {
      let best = null, bd = Infinity;
      s.units.forEach(function (o) {
        if (o === u || o.side === u.side || o.dead) return;
        const d = Math.abs(o.x - u.x) + Math.abs(o.y - u.y);
        if (d < bd) { bd = d; best = o; }
      });
      const sdx = best ? (best.x - best.y) - (u.x - u.y) : 0;
      if (sdx) u.facing = sdx > 0 ? 1 : -1;
    });
  }

  /**
   * Start a combat from DD.Encounter.build() output. opts: { run, seed, headless, onEnd, difficulty, kind, noPlan,
   * deploy, initiative ('roll' | 'heroesFirst' | 'enemiesFirst'), order: [unit or def ids], enemyAi: false, ... }.
   * With deploy tiles the fight waits in deployment (phase 'deploy') for rollInitiative(); otherwise it rolls at once.
   */
  Combat.start = function (setup, opts) {
    setup = setup || {};
    opts = opts || {};
    if (opts.headless) DD.FX.instant = true;
    DD.FX.reset();
    const run = opts.run || null;
    const enc = setup.encounter || null;
    const seed = opts.seed !== undefined ? opts.seed : (setup.seed !== undefined ? setup.seed : DD.newSeed());
    const diff = difficultyOf(opts, run, setup);
    let mode = opts.initiative || (opts.sandbox ? 'heroesFirst' : 'roll');
    if (!INIT_MODES[mode]) { DD.warn('Combat: unknown initiative mode "' + mode + '", rolling'); mode = 'roll'; }
    const s = {
      id: U.uid('combat'), seed: seed, rng: DD.RNG(seed), round: 0, phase: 'setup',
      grid: setup.grid || emptyGrid(8, 8), theme: setup.theme || (enc && enc.map && enc.map.theme) || 'cellar',
      units: [], hype: 0, encounter: enc,
      objective: normalizeObjective(setup.objective || (enc && enc.objective) || { type: 'killAll' }),
      rules: [], deploy: { active: false, tiles: [] }, log: [],
      stats: { units: {}, envKills: 0, hypeGained: 0, xp: 0, gold: 0, downs: 0, goldGained: 0, objects: {} },
      result: null, difficulty: { hp: diff.hp, dmg: diff.dmg, tiers: !opts.sandbox, mov: !opts.sandbox && DD.Balance && DD.Balance.enemyMov ? Object.assign({}, DD.Balance.enemyMov) : null }, difficultyName: diff.name,
      run: run, kind: opts.kind || (enc && enc.kind) || 'normal',
      reinforcements: (setup.reinforcements || (enc && enc.reinforcements) || []).map(function (w) { return Object.assign({}, w, { done: false }); }),
      heroZone: setup.heroZone || null, enemyZone: setup.enemyZone || null,
      sandbox: !!opts.sandbox, sandboxGold: opts.gold || 0, consumables: (opts.consumables || []).slice(), maxConsumables: opts.maxConsumables || 3,
      mutations: 0, undo: null, _finalized: false,
      // v2 initiative & turns (§4.1): order = [{ unitId, roll, init, total, side, k, tie, fixed }], turnIndex into it,
      // current = id of the unit whose turn it is, turn = turns started so far, joining = rolled mid-round
      // heroTurns = hero-controlled turns started so far (a boss wind-up only counts down after one, see DD.AI)
      order: null, turnIndex: -1, current: null, turn: 0, heroTurns: 0, joining: [], turnLive: false,
      initMode: mode, initOrder: Array.isArray(opts.order) ? opts.order.slice() : null,
      noActFirst: !!opts.noPlan, aiOff: opts.enemyAi === false,
      // free-form scripting state for encounters / rules / bosses: previews copy it
      data: {}, startHooksFired: false,
    };
    Combat.state = s;
    endCb = typeof opts.onEnd === 'function' ? opts.onEnd : null;
    endState = s;
    depth = 0;
    pendingEnd = false;
    const Act = DD.Act;
    depth++;
    try {
      (opts.objects || []).forEach(function (o) { Act.placeObject(o.x, o.y, o.id, o); });
      (opts.surfaces || []).forEach(function (o) { Act.setSurface(o.x, o.y, o.id, o.turns); });
      (setup.rules || (enc && enc.rules) || []).forEach(function (r) { s.rules.push(Object.assign({ name: 'Rule', icon: '📜', desc: '', hooks: {}, turns: -1 }, r)); });
      (setup.heroes || []).forEach(function (h) {
        const rh = h.runHero || (typeof h.id === 'string' ? Combat.makeRunHero({ id: h.id, level: h.level }) : null);
        if (!rh) return;
        const u = Combat.makeHeroUnit(rh, h.x, h.y);
        if (!u) return;
        const pos = DD.Grid.isFree(h.x, h.y, u) ? { x: h.x, y: h.y } : DD.Grid.nearestFree(h.x, h.y, u);
        if (!pos) { DD.warn('Combat: no room for hero ' + u.name); return; }
        u.x = pos.x; u.y = pos.y;
        s.units.push(u);
      });
      (setup.enemies || []).forEach(function (e) {
        Act.spawn(e.id, e.x, e.y, { noFx: true, silent: true, noHooks: true, hpMult: e.hpMult, level: e.level });
      });
      (opts.summons || []).forEach(function (sm) {
        const owner = sm.owner ? (typeof sm.owner === 'string' ? Combat.byId(sm.owner) || Combat.heroes().filter(function (h) { return h.defId === sm.owner; })[0] : sm.owner)
          : Combat.heroes()[0] || null;
        Act.summon(owner || null, sm.id, sm.x, sm.y, { noFx: true, silent: true, noHooks: true, level: sm.level, ready: true });
      });
      faceNearestFoes(s);
      s.units.forEach(function (u) { DD.FX.initVis(u); });
      const tiles = setup.deployTiles || [];
      s.deploy = { active: !!(tiles.length && (opts.deploy !== false) && !opts.sandbox) || (!!opts.deploy && tiles.length > 0), tiles: tiles.map(function (t) { return { x: t.x, y: t.y }; }) };
      let hype = 0;
      s.units.forEach(function (u) { hype += u.hypeBonus || 0; });
      s.hype = U.clamp(Math.round(hype), 0, 100);
      if (s.objective.type === 'destroy' && !s.objective.count) s.objective.count = Math.max(1, countObjects(s, s.objective.objId));
      s.objective.total = s.objective.count || s.objective.total;
      Combat.refreshObjective();
      if (enc && enc.intro) Act.log(enc.intro, 'narrator');
      Act.narrate(s.kind === 'boss' ? 'boss_start' : s.kind === 'elite' ? 'elite_start' : 'combat_start', {});
      bossUnits(s).forEach(function (b) {
        const def = DD.getEnemy(b.defId);
        if (def && def.boss) {
          if (def.boss.intro) Act.log(def.boss.intro, 'enemy');
          if (!DD.FX.instant) DD.FX.banner(b.name, { sub: def.boss.title || '' });
        }
      });
      const hs = Combat.heroes();
      if (hs.length) Act.maybeBark(hs[Math.floor(DD.rng.next() * hs.length)], 'start', 0.8);
      DD.Events.emit('combat:start', { state: s });
      s.startHooksFired = true;
      DD.Hooks.fireAll('onCombatStart');
      if (enc && typeof enc.onStart === 'function') DD.safe('encounter onStart', enc.onStart, enc, [s]);
      if (s.deploy.active) s.phase = 'deploy';
      else doRoll(s);
    } finally {
      depth--;
      flushEnd();
    }
    changed();
    return s;
  };

  /**
   * Test/debug combat: { w, h, theme, seed, floor, heroes: [{ id, x, y, level, skills, items, hp }],
   * enemies: [{ id, x, y, hpMult }], summons: [{ id, x, y, owner }], objects: [{ x, y, id, ...overrides }],
   * surfaces: [{ x, y, id, turns }], terrain(tile) (mutate or return overrides), objective, rules, encounter,
   * reinforcements, deployTiles + deploy: true, noPlan (enemies pass their round-1 turns), enemyAi: false (enemies
   * always pass), initiative ('heroesFirst' default | 'enemiesFirst' | 'roll'), order: [unit or def ids], difficulty,
   * gold, consumables, run, onEnd }.
   */
  Combat.sandbox = function (cfg) {
    cfg = cfg || {};
    const w = cfg.w || 8, h = cfg.h || 8;
    const grid = emptyGrid(w, h, cfg.floor);
    if (typeof cfg.terrain === 'function') {
      grid.tiles.forEach(function (t) {
        const r = DD.safe('sandbox terrain', cfg.terrain, null, [t]);
        if (r && typeof r === 'object' && r !== t) Object.assign(t, r);
      });
    }
    const setup = {
      grid: grid, theme: cfg.theme || 'cellar',
      heroes: (cfg.heroes || []).map(function (hh) { return { runHero: Combat.makeRunHero(hh), x: hh.x, y: hh.y }; }),
      enemies: (cfg.enemies || []).map(function (e) { return { id: e.id, x: e.x, y: e.y, hpMult: e.hpMult, level: e.level }; }),
      objective: cfg.objective, rules: cfg.rules || [], encounter: cfg.encounter || null,
      deployTiles: cfg.deployTiles || [], reinforcements: cfg.reinforcements || [],
    };
    return Combat.start(setup, {
      seed: cfg.seed !== undefined ? cfg.seed : 1, sandbox: true, noPlan: !!cfg.noPlan, difficulty: cfg.difficulty,
      summons: cfg.summons, deploy: !!cfg.deploy, gold: cfg.gold, consumables: cfg.consumables, objects: cfg.objects,
      surfaces: cfg.surfaces, run: cfg.run || null, onEnd: cfg.onEnd, kind: cfg.kind,
      initiative: cfg.initiative, order: cfg.order, enemyAi: cfg.enemyAi,
    });
  };

  // ---- initiative (§6.1) ------------------------------------------------------------------------------
  function endDeploy(s) { if (s.deploy && s.deploy.active) s.deploy.active = false; }

  /** "Roll for initiative!": the order for the fight, then round 1 and its first turns. */
  function doRoll(s) {
    endDeploy(s);
    s.phase = 'initiative';
    // v2: nobody starts a fight with Block (items, passives or onCombatStart hooks that granted some lose it here)
    s.units.forEach(function (u) { if (!u.dead) u.block = 0; });
    const list = [];
    s.order = list;
    // every hero and enemy rolls; summons act on their owner's turn (one without a living owner rolls for itself)
    s.units.forEach(function (u) { if (!u.dead && u.kind !== 'summon') entriesFor(s, u).forEach(function (e) { list.push(e); }); });
    s.units.forEach(function (u) { if (!u.dead && u.kind === 'summon' && !turnOwnerOf(u)) entriesFor(s, u).forEach(function (e) { list.push(e); }); });
    arrange(s, list);
    s.turnIndex = -1;
    s.current = null;
    s.joining = [];
    renumber(s);
    announce(s);
    beginRound(s);
    if (!s.result) advance(s);
    return true;
  }

  function announce(s) {
    const rolls = s.order.map(function (e) {
      const u = Combat.byId(e.unitId);
      return { unitId: e.unitId, name: u ? u.name : '?', side: e.side, roll: e.roll, init: e.init, total: e.total, k: e.k };
    });
    const rolled = s.initMode === 'roll' && !s.initOrder;
    DD.Act.log((rolled ? 'Roll for initiative! ' : 'Initiative (fixed): ') + rolls.map(function (r) { return r.name + (rolled ? ' ' + r.total : ''); }).join(' · '), 'system');
    DD.Act.narrate('initiative', { hero: (rolls.filter(function (r) { return r.side === 'hero'; })[0] || {}).name || 'the party' });
    if (!DD.FX.instant) {
      DD.FX.banner('Roll for initiative!', { sub: rolls.length ? rolls[0].name + ' goes first' : '' });
      if (rolled) s.order.forEach(function (e, i) { const u = Combat.byId(e.unitId); if (u) DD.FX.text(u, '🎲 ' + e.total, { color: '#ffe08a', size: 16, parallel: i > 0 }); });
    }
    DD.FX.custom('initiative', { order: rolls, ms: 0 });
    emit('initiative:rolled', { order: rolls, rolled: rolled, state: s });
  }

  /** End deployment and roll initiative ("Roll for initiative!" button). false when already rolled / no fight. */
  Combat.rollInitiative = function () {
    const s = S();
    if (!s || s.result || s.order) return false;
    return action(function () { return doRoll(s); });
  };

  // ---- rounds & turns (§6.1) ---------------------------------------------------------------------------
  /**
   * Durations tick per own turn. A status applied during its owner's own turn is `fresh`: the end of that turn does
   * not count (turns: 1 = through its NEXT turn) unless its def says skipFresh: false. 'turnStart' decay ignores it.
   */
  function decay(u, when) {
    const sts = u.statuses.slice();
    for (let i = 0; i < sts.length; i++) {
      const st = sts[i];
      if (u.statuses.indexOf(st) < 0) continue;
      const def = DD.getStatus(st.id);
      if (!def || (def.decay || 'turnEnd') !== when) continue;
      if (st.turns < 0) { st.fresh = false; continue; }
      if (when === 'turnEnd' && st.fresh && def.skipFresh !== false) { st.fresh = false; continue; }
      st.fresh = false;
      st.turns--;
      if (st.turns <= 0) DD.Act.removeStatus(u, st.id);
    }
  }
  function tickCooldowns(u) {
    const slots = Combat.slotsOf(u);
    for (let i = 0; i < slots.length; i++) {
      const sl = slots[i];
      sl.usedThisTurn = false;
      if (sl.cd > 0) { if (sl.fresh) sl.fresh = false; else sl.cd--; }
      else sl.fresh = false;
    }
  }
  function tileTurnEnd(u) {
    const t = DD.Grid.tile(u.x, u.y);
    if (!t) return;
    const fly = DD.Grid.isFlying(u);
    if (t.surface) {
      const sd = DD.getSurface(t.surface.id);
      if (sd && typeof sd.onTurnEnd === 'function' && (!fly || sd.airborne)) DD.safe('surface ' + sd.id + ' onTurnEnd', sd.onTurnEnd, sd, [u, t]);
    }
    if (!active(u) || fly) return;
    const td = DD.Grid.terrain(t);
    if (typeof td.onTurnEnd === 'function') DD.safe('terrain ' + td.id + ' onTurnEnd', td.onTurnEnd, td, [u, t]);
  }

  /** AP at the start of a hero-side turn: stun-likes 0, haste +1, slow −1 (min 1), charmed −1. */
  Combat.turnAp = function (u) {
    if (stunned(u)) return 0;
    let ap = u.maxAp || 0;
    if (hasSt(u, 'haste')) ap += 1;
    if (hasSt(u, 'slow')) ap = Math.max(1, ap - 1);
    if (hasSt(u, 'charmed')) ap = Math.max(0, ap - 1);
    return ap;
  };

  function spawnReinforcements(s) {
    (s.reinforcements || []).forEach(function (w) {
      if (w.done || w.round !== s.round) return;
      w.done = true;
      if (DD.Encounter && typeof DD.Encounter.spawnWave === 'function') {
        DD.safe('Encounter.spawnWave', DD.Encounter.spawnWave, DD.Encounter, [s, w]);
        return;
      }
      DD.Act.log(w.text || 'Reinforcements arrive!', 'enemy');
      (w.enemies || []).forEach(function (e) {
        const n = Array.isArray(e.n) ? s.rng.int(e.n[0], e.n[1]) : (e.n === undefined ? 1 : e.n);
        for (let i = 0; i < n; i++) {
          const p = edgeTile(s, w.edge);
          if (p) DD.Act.spawn(e.id, p.x, p.y);
        }
      });
    });
  }
  function edgeTile(s, edge) {
    const g = s.grid;
    const cands = [];
    g.tiles.forEach(function (t) {
      if (!DD.Grid.isFree(t.x, t.y) || DD.Grid.isDrop(t.x, t.y)) return;
      let ok;
      switch (edge) {
        case 'N': ok = t.y === 0; break;
        case 'S': ok = t.y === g.h - 1; break;
        case 'W': ok = t.x === 0; break;
        case 'E': ok = t.x === g.w - 1; break;
        case 'zone': ok = t.zone === 'enemy' || (s.enemyZone || []).some(function (z) { return z.x === t.x && z.y === t.y; }); break;
        default: ok = t.x === 0 || t.y === 0 || t.x === g.w - 1 || t.y === g.h - 1;
      }
      if (ok) cands.push(t);
    });
    if (!cands.length) return DD.Grid.randomEmptyTile(s.rng);
    return cands[s.rng.int(0, cands.length - 1)];
  }

  /** Round start: counter, reinforcements, round hooks, joiners merged into the order (they act this round). */
  function beginRound(s) {
    if (!s || s.result) return;
    s.round++;
    s.turnIndex = -1;
    s.current = null;
    DD.Events.emit('round:start', { round: s.round });
    spawnReinforcements(s);
    if (s.result) return;
    if (s.encounter && typeof s.encounter.onRoundStart === 'function') DD.safe('encounter onRoundStart', s.encounter.onRoundStart, s.encounter, [s]);
    DD.Hooks.fireAll('onRoundStart', s.round);
    mergeJoiners(s);
    Combat.checkEnd();
    if (s.result) return;
    if (s.round > 1 && DD.rng.next() < 0.2) DD.Act.narrate('round_start', { n: s.round });
  }
  Combat._beginRound = function () { const s = S(); if (s) beginRound(s); };

  /** Round end: surfaces and rules tick, objects' onRoundEnd, encounter.onRoundEnd, 'survive' objectives. */
  function roundEnd(s) {
    s.grid.tiles.forEach(function (t) {
      if (t.surface && t.surface.turns > 0) {
        t.surface.turns--;
        if (t.surface.turns <= 0) { t.surface = null; s.mutations++; }
      }
      if (t.obj) {
        const od = DD.getObject(t.obj.id);
        const fn = typeof t.obj.onRoundEnd === 'function' ? t.obj.onRoundEnd : od && od.onRoundEnd;
        if (typeof fn === 'function') DD.safe('object ' + t.obj.id + ' onRoundEnd', fn, t.obj, [t.obj, t, s]);
      }
    });
    s.rules.slice().forEach(function (r) {
      if (r.turns > 0) { r.turns--; if (r.turns <= 0) DD.Act.removeRule(r.id); }
    });
    if (s.encounter && typeof s.encounter.onRoundEnd === 'function') DD.safe('encounter onRoundEnd', s.encounter.onRoundEnd, s.encounter, [s]);
    if (s.result) return;
    emit('round:end', { round: s.round });
    if (s.objective.type === 'survive' && s.round >= s.objective.rounds) { Combat.refreshObjective(); Combat.finish('victory'); return; }
    Combat.refreshObjective();
    Combat.checkEnd();
  }

  /** Can anyone of this turn act (a player-controlled member with AP that is not stunned)? */
  function groupCanAct(u) {
    return groupOf(u).some(function (m) { return active(m) && playerSide(m) && !stunned(m) && (m.ap || 0) > 0; });
  }
  /** Next entry from `from` whose unit takes a turn (dead units drop out; a downed hero with nobody acting is skipped). */
  function nextIndex(s, from) {
    for (let i = Math.max(0, from); i < s.order.length; i++) {
      const u = Combat.byId(s.order[i].unitId);
      if (!u || u.dead) continue;
      if (u.downed && !groupOf(u).some(active)) continue;
      return i;
    }
    return -1;
  }

  /**
   * Start entry idx's turn: Block expires and AP refreshes (+ AP banked by gainAp outside the turn) for the unit and
   * its summons, then their onTurnStart hooks, 'turnStart' decay and cooldown ticks, then due wind-ups resolve.
   */
  function beginTurn(s, idx) {
    const e = s.order[idx];
    const u = Combat.byId(e.unitId);
    s.turnIndex = idx;
    s.current = u.id;
    s.turnLive = false;
    s.turn = (s.turn || 0) + 1;
    s.undo = null;
    const ctrl = playerSide(u);
    if (ctrl) s.heroTurns = (s.heroTurns || 0) + 1;
    if (!ctrl && s.phase !== 'enemy') {
      emit('turn:enemy', { round: s.round, unit: u });
      if (DD.rng.next() < 0.1) DD.Act.narrate('enemy_turn', {});
    }
    s.phase = ctrl ? 'player' : 'enemy';
    DD.FX.turn(u, { round: s.round });
    emit('turn:start', { unit: u, unitId: u.id, round: s.round, index: idx, entry: Object.assign({}, e), turn: s.turn });
    const members = groupOf(u).filter(active);
    members.forEach(function (m) {
      m.block = 0;
      if (playerSide(m)) {
        const bank = Math.round(+m.apBank || 0) || 0;
        m.apBank = 0;
        m.ap = stunned(m) ? 0 : Math.max(0, Combat.turnAp(m) + bank);
      }
    });
    members.forEach(function (m) {
      if (!active(m)) return;
      DD.Hooks.fire('onTurnStart', m, m);
      if (!active(m)) return;
      decay(m, 'turnStart');
      tickCooldowns(m);
    });
    if (s.result) return;
    if (DD.AI && DD.AI.resolveWindups) {
      members.forEach(function (m) { if (!s.result && active(m) && m.intents && m.intents.length) DD.AI.resolveWindups(m); });
    }
    s.turnLive = !s.result;
    Combat.refreshObjective();
    Combat.checkEnd();
  }

  /** End the current turn: AP is lost, onTurnEnd hooks, 'turnEnd' decay (Burn, Bleed...), ending a turn on a tile. */
  function finishTurn(s) {
    const u = Combat.byId(s.current);
    if (!u) { s.current = null; return; }
    const members = groupOf(u);
    members.forEach(function (m) { if (playerSide(m)) m.ap = 0; });
    members.forEach(function (m) { if (active(m)) DD.Hooks.fire('onTurnEnd', m, m); });
    s.turnLive = false;
    if (!s.result) members.forEach(function (m) { if (active(m)) decay(m, 'turnEnd'); });
    if (!s.result) members.forEach(function (m) { if (active(m)) tileTurnEnd(m); });
    emit('turn:end', { unit: u, unitId: u.id, round: s.round, turn: s.turn });
    s.current = null;
    s.undo = null;
    if (!s.result) { Combat.refreshObjective(); Combat.checkEnd(); }
  }

  /** An AI turn: the unit (and AI-controlled summons acting on its turn) decide and act at once. */
  function aiTurn(s, u) {
    const idle = s.aiOff || (s.noActFirst && s.round === 1);
    let acted = false;
    groupOf(u).forEach(function (m) {
      if (idle || s.result || !active(m) || playerSide(m) || !DD.AI || !DD.AI.act) return;
      DD.AI.act(m);
      acted = true;
    });
    if (acted && !DD.FX.instant) DD.FX.wait(140);
  }

  function skipNote(u) {
    if (!active(u) || !stunned(u)) return;
    const st = u.statuses.filter(function (x) { return DD.Act.isStunLike(x.id); })[0];
    const d = st ? DD.getStatus(st.id) : null;
    DD.FX.text(u, (d ? d.name : 'Stunned') + ': turn lost', { color: '#ffe14d', size: 15 });
    DD.Act.log(u.name + ' loses the turn (' + (d ? d.name : 'Stunned') + ').', 'status');
  }

  /**
   * Run turns from the one after turnIndex: AI turns resolve at once, hero turns nobody can play are passed; stops at
   * the next hero turn someone can act in (phase 'player') or the end of the fight. Rounds roll over as needed.
   */
  function advance(s) {
    let turns = 0, idleRounds = 0;
    while (!s.result) {
      const idx = nextIndex(s, s.turnIndex + 1);
      if (idx < 0) {
        roundEnd(s);
        if (s.result) return;
        if (++idleRounds > MAX_IDLE_ROUNDS) { DD.warn('Combat: ' + MAX_IDLE_ROUNDS + ' rounds without a hero turn; the fight is stuck'); s.phase = 'player'; return; }
        beginRound(s);
        continue;
      }
      if (++turns > MAX_TURNS) { DD.warn('Combat: ' + MAX_TURNS + ' turns in one go; stopping'); s.phase = 'player'; return; }
      beginTurn(s, idx);
      if (s.result) return;
      const u = Combat.byId(s.order[idx].unitId);
      if (playerSide(u)) {
        if (groupCanAct(u)) {
          idleRounds = 0;
          s.phase = 'player';
          emit('turn:player', { round: s.round, unit: u });
          return;
        }
        skipNote(u);
        finishTurn(s);
        continue;
      }
      aiTurn(s, u);
      if (s.result) return;
      finishTurn(s);
    }
  }

  /**
   * End the current hero turn (unused AP is lost), then resolve every following AI turn until the next hero turn or
   * the end of the fight. In deployment it rolls initiative instead. Returns true if something happened.
   */
  Combat.endTurn = function () {
    const s = S();
    if (!s || s.result) return false;
    if (!s.order) return s.phase === 'deploy' ? Combat.rollInitiative() : false;
    if (s.phase !== 'player' || !s.current) return false;
    return action(function () {
      finishTurn(s);
      if (!s.result) advance(s);
      return true;
    });
  };

  /**
   * Pass every remaining hero turn of this round (AI turns resolve as usual). Returns at the first hero turn of the next
   * round (AI units ahead of it in the order have acted by then) or at the end of the fight.
   */
  Combat.endRound = function () {
    const s = S();
    if (!s || s.result) return false;
    return action(function () {
      if (!s.order) doRoll(s);
      const r = s.round;
      for (let guard = 0; !s.result && s.round === r && s.phase === 'player' && s.current && guard < 500; guard++) {
        finishTurn(s);
        if (!s.result) advance(s);
      }
      return true;
    });
  };

  /**
   * Sandbox only: make it `unit`'s turn now. The current turn is abandoned (no end-of-turn ticks); the unit's turn (or its
   * owner's, for a summon) starts with the usual start-of-turn ticks; an AI unit acts at once and play continues from
   * its place in the order. A unit without an entry (joining, orphan) gets one right here.
   */
  Combat.giveTurnTo = function (unit) {
    const s = S();
    if (!s || !s.sandbox || s.result || !unit || unit.dead) return false;
    return action(function () {
      if (!s.order) doRoll(s);
      if (s.result) return false;
      let owner = turnOwnerOf(unit);
      if (!owner) {
        const waiting = (s.joining || []).filter(function (e) { return e.unitId === unit.id; });
        s.joining = (s.joining || []).filter(function (e) { return e.unitId !== unit.id; });
        const add = waiting.length ? waiting : entriesFor(s, unit);
        s.order.splice(Math.max(0, s.turnIndex + 1), 0, add[0]);
        renumber(s);
        owner = unit;
      }
      let idx = entryIndex(s, owner, Math.max(0, s.turnIndex));
      if (idx < 0) idx = entryIndex(s, owner);
      s.current = null;
      beginTurn(s, idx);
      if (s.result) return true;
      if (playerSide(owner)) {
        if (groupCanAct(owner)) { s.phase = 'player'; emit('turn:player', { round: s.round, unit: owner }); return true; }
        skipNote(owner);
        finishTurn(s);
      } else {
        aiTurn(s, owner);
        if (!s.result) finishTurn(s);
      }
      if (!s.result) advance(s);
      return true;
    });
  };

  /**
   * Sandbox only: rewrite the initiative order (unit objects, unit ids or def ids first, in that order; everybody else
   * after them in their old order). The current turn keeps going.
   */
  Combat.setOrder = function (list) {
    const s = S();
    if (!s || !s.sandbox || !s.order) return false;
    const rank = explicitRanks(s, list);
    const keyed = s.order.map(function (e, i) { return { e: e, r: rank[e.unitId] !== undefined && !(e.k > 0) ? rank[e.unitId] : 1000 + i }; });
    keyed.sort(function (a, b) { return a.r - b.r; });
    s.order = keyed.map(function (x, i) { x.e.total = keyed.length - i; x.e.fixed = true; return x.e; });
    s.turnIndex = s.current ? entryIndex(s, Combat.byId(s.current)) : -1;
    renumber(s);
    changed();
    return true;
  };

  /** The player is in control: a hero-controlled turn (or deployment, where the first action rolls initiative). */
  Combat.isPlayerTurn = function () { const s = S(); return !!s && !s.result && (s.phase === 'deploy' || (s.phase === 'player' && !!s.current)); };
  Combat.isOver = function () { const s = S(); return !!s && !!s.result; };

  Combat.addRule = function (rule) { return action(function () { return DD.Act.addRule(rule); }); };
  Combat.removeRule = function (id) { return action(function () { return DD.Act.removeRule(id); }); };

  // ---- player action API (§5.5) ------------------------------------------------------------------------
  /** The player may act with u now: it is a hero or hero-side summon, active, and it is its turn. */
  function controllable(u) {
    const s = S();
    return !!s && !s.result && s.phase === 'player' && !!s.current && active(u) && playerSide(u) && Combat.isTurnOf(u);
  }
  Combat.controllable = controllable;
  /** In deployment the first real action rolls initiative (then it counts only if it is that unit's turn). */
  function startIfDeploying(s) { if (s && s.phase === 'deploy' && !s.order && !s.result) Combat.rollInitiative(); }

  /** Tiles the unit can move to with one move action (needs AP for a move, not rooted / held). */
  Combat.reachable = function (unit) {
    if (!unit || !active(unit)) return new Map();
    if (!playerSide(unit)) return Combat.cantMove(unit) ? new Map() : DD.Grid.reachable(unit, Combat.effectiveMov(unit));
    if (!controllable(unit) || Combat.cantMove(unit) || stunned(unit)) return new Map();
    if ((unit.ap || 0) < Combat.moveApCost(unit)) return new Map();
    return DD.Grid.reachable(unit, Combat.effectiveMov(unit));
  };

  Combat.move = function (unit, x, y) {
    const s = S();
    startIfDeploying(s);
    if (!controllable(unit)) return false;
    const reach = Combat.reachable(unit);
    const e = reach.get(x + ',' + y);
    if (!e) return false;
    return action(function () {
      const from = { x: unit.x, y: unit.y };
      const ap0 = unit.ap, facing0 = unit.facing, dir0 = unit.lastDir;
      const m0 = s.mutations;
      unit.ap -= Combat.moveApCost(unit);
      const walked = DD.Act.moveAlong(unit, e.path);
      const clean = s.mutations === m0 && walked.length === e.path.length && active(unit) && unit.x === x && unit.y === y;
      s.undo = clean ? { unitId: unit.id, from: from, to: { x: x, y: y }, ap: ap0, facing: facing0, lastDir: dir0, path: walked, mutations: s.mutations, turn: s.turn } : null;
      DD.Act.maybeBark(unit, 'move', 0.06);
      return walked.length > 0;
    });
  };

  Combat.canUndo = function () {
    const s = S();
    if (!s || s.result || s.phase !== 'player' || !s.undo || s.undo.turn !== s.turn) return false;
    const u = Combat.byId(s.undo.unitId);
    return !!u && controllable(u) && s.mutations === s.undo.mutations && u.x === s.undo.to.x && u.y === s.undo.to.y &&
      DD.Grid.isFree(s.undo.from.x, s.undo.from.y, u);
  };

  Combat.undo = function () {
    const s = S();
    if (!Combat.canUndo()) return false;
    const rec = s.undo;
    const u = Combat.byId(rec.unitId);
    return action(function () {
      const back = rec.path.slice(0, -1).reverse();
      back.push(rec.from);
      u.x = rec.from.x; u.y = rec.from.y;
      u.ap = rec.ap; u.facing = rec.facing; u.lastDir = rec.lastDir;
      DD.FX.move(u, back, { ms: 60 * back.length });
      s.undo = null;
      DD.Act.log(u.name + ' takes that back.', 'system');
      return true;
    });
  };

  /** AP/HP cost of a skill for a unit after modifyCost hooks: { unit, skill, level, ap, hp }. */
  Combat.costOf = function (unit, def, level) {
    const L = DD.skillLevel(def, level || 1);
    const c = { unit: unit, skill: def, level: level || 1, ap: DD.resolve(def.ap, L, unit, def.owner === 'enemy' ? 0 : 1), hp: DD.resolve(def.hpCost, L, unit, 0) };
    DD.Hooks.fire('modifyCost', unit, c);
    c.ap = Math.max(0, Math.round(+c.ap || 0));
    c.hp = Math.max(0, Math.round(+c.hp || 0));
    return c;
  };
  Combat.cooldownOf = function (unit, def, level) {
    return Math.max(0, Math.round(+DD.resolve(def.cooldown, DD.skillLevel(def, level || 1), unit, 0) || 0));
  };

  function ownsSlot(u, slot) { return Combat.slotsOf(u).indexOf(slot) >= 0; }

  /** Why the unit can't act now (deployment, another unit's turn...), or null. */
  function turnProblem(s, unit) {
    if (!s || s.result) return 'The fight is over.';
    if (s.phase === 'deploy' || !s.order) return 'Roll for initiative first!';
    if (s.phase !== 'player' || !s.current) return 'Not your turn.';
    if (!unit || !active(unit) || !playerSide(unit)) return 'They can\'t act.';
    if (!Combat.isTurnOf(unit)) return 'Not ' + unit.name + '\'s turn.';
    return null;
  }

  /** true, or a short reason why the unit can't use this skill slot right now. */
  Combat.canUse = function (unit, slot) {
    const s = S();
    const why = turnProblem(s, unit);
    if (why) return why;
    const r = DD.Targeting.resolve(slot);
    if (!r) return 'Unknown skill.';
    if (r.slot && !ownsSlot(unit, r.slot)) return 'Not their skill.';
    if (hasSt(unit, 'sleep') && !hasSt(unit, 'stun') && !hasSt(unit, 'frozen')) return 'Asleep. Zzz.';
    if (stunned(unit)) return 'Stunned!';
    if (hasSt(unit, 'sheep')) return 'Baa. (Sheep can only move.)';
    const def = r.def;
    if (def.kind === 'spell' && hasSt(unit, 'silenced')) return 'Silenced!';
    if (r.slot && r.slot.cd > 0) return 'On cooldown (' + r.slot.cd + ').';
    if (r.slot && def.charges > 0 && (r.slot.uses || 0) >= def.charges) return 'No charges left.';
    const c = Combat.costOf(unit, def, r.level);
    if ((unit.ap || 0) < c.ap) return 'Not enough AP.';
    if (c.hp > 0 && unit.hp <= 1) return 'Not enough HP.';
    if (def.hype > 0 && (s.hype || 0) < def.hype) return 'Needs ' + def.hype + ' Hype.';
    if (typeof def.canUse === 'function') {
      // a query: content that rolls dice in canUse must not advance the combat RNG (the HUD asks every hover)
      const ok = DD.Targeting.pure(function () {
        return DD.safe('canUse of ' + def.id, def.canUse, def, [DD.Targeting.buildCtx(unit, slot, null)]);
      });
      if (ok === false) return 'Can\'t use that now.';
      if (typeof ok === 'string') return ok;
    }
    if (!DD.Targeting.validTargets(unit, slot).length) return 'No valid targets.';
    return true;
  };

  Combat.targets = function (unit, slot) { return DD.Targeting.validTargets(unit, slot); };
  Combat.preview = function (unit, slot, x, y) { return DD.Targeting.preview(unit, slot, { x: x, y: y }); };

  /**
   * Pay a use: AP, HP (never below 1), cooldown, charge, Hype. Then the user's onCostPaid(p) hooks with what was
   * really paid, p = { unit, skill, level, slot, ap, hp, hpCost, hype, consumable } (hp = HP lost, hpCost = asked).
   * [phase 4, hero-sparrow request] Returns p (also ctx.paid of the use).
   */
  function pay(unit, r, opts) {
    const def = r.def;
    const p = { unit: unit, skill: def, level: r.level, slot: r.slot || null, ap: 0, hp: 0, hpCost: 0, hype: 0, consumable: !!opts.consumable };
    if (opts.consumable) {
      const ap0 = unit.ap || 0;
      unit.ap = Math.max(0, ap0 - Math.max(0, def.ap === undefined ? 1 : def.ap));
      p.ap = ap0 - unit.ap;
    } else {
      const c = Combat.costOf(unit, def, r.level);
      const ap0 = unit.ap || 0;
      unit.ap = Math.max(0, ap0 - c.ap);
      p.ap = ap0 - unit.ap;
      p.hpCost = c.hp;
      if (c.hp > 0) {
        const paid = Math.min(c.hp, unit.hp - 1);
        if (paid > 0) {
          unit.hp -= paid;
          p.hp = paid;
          DD.FX.damage(unit, paid, { cost: true });
          DD.Act.log(unit.name + ' pays ' + paid + ' HP.', 'dmg');
        }
      }
      if (r.slot) {
        const cd = Combat.cooldownOf(unit, def, r.level);
        r.slot.cd = cd;
        r.slot.fresh = cd > 0;
        r.slot.uses = (r.slot.uses || 0) + 1;
        r.slot.usedThisTurn = true;
      }
      if (def.hype > 0) p.hype = -DD.Act.gainHype(-def.hype, 'spent');
    }
    DD.Act.touch();
    DD.Hooks.fire('onCostPaid', unit, p);
    return p;
  }

  /**
   * Resolve a skill/consumable use (shared by heroes, AI actions, wind-ups and previews). opts: pay, consumable,
   * extra (buildCtx extras such as isIntent/intent/tiles/dir), quiet (no name popup).
   */
  Combat.resolveSkill = function (unit, slotOrDef, target, opts) {
    opts = opts || {};
    const r = DD.Targeting.resolve(slotOrDef);
    if (!r || !unit) return null;
    const def = r.def;
    const paid = opts.pay ? pay(unit, r, opts) : null;
    if (target) DD.Act.face(unit, target);
    const ctx = DD.Targeting.buildCtx(unit, slotOrDef, target, opts.extra);
    ctx.paid = paid;
    if (!opts.quiet) DD.FX.text(unit, (def.icon ? def.icon + ' ' : '') + def.name, { color: unit.side === 'hero' ? '#ffe9a8' : '#ffb0a0', size: 14 });
    DD.Act.beginSkill(unit, def, ctx);
    try {
      DD.safe('execute of ' + def.id, def.execute, def, [ctx]);
    } finally {
      DD.Act.endSkill();
    }
    DD.Hooks.fire('onSkillUsed', unit, ctx);
    Combat.refreshObjective();
    Combat.checkEnd();
    return ctx;
  };

  Combat.useSkill = function (unit, slot, x, y) {
    const s = S();
    startIfDeploying(s);
    if (Combat.canUse(unit, slot) !== true) return false;
    if (!DD.Targeting.isValidTarget(unit, slot, x, y)) return false;
    return action(function () {
      s.undo = null;
      const r = DD.Targeting.resolve(slot);
      if (r.slot && unit.signature === r.slot) {
        DD.Act.bark(unit, 'signature');
        DD.Act.narrate('signature', { hero: unit.name });
        DD.Act.log(unit.name + ' unleashes ' + r.def.name + '!', 'hero');
      }
      Combat.resolveSkill(unit, slot, { x: x, y: y }, { pay: true });
      return true;
    });
  };

  /** true or reason for a consumable at index. */
  Combat.canUseConsumable = function (unit, index) {
    const s = S();
    const id = Combat.consumables()[index];
    const def = id ? DD.getConsumable(id) : null;
    if (!def) return 'Nothing there.';
    const why = turnProblem(s, unit);
    if (why) return why;
    if (unit.kind !== 'hero') return 'Only heroes can use consumables.';
    if (stunned(unit)) return 'Stunned!';
    if (hasSt(unit, 'sheep')) return 'Baa.';
    if ((unit.ap || 0) < (def.ap === undefined ? 1 : def.ap)) return 'Not enough AP.';
    if (!DD.Targeting.validTargets(unit, def).length) return 'No valid targets.';
    return true;
  };

  Combat.useConsumable = function (unit, index, x, y) {
    const s = S();
    startIfDeploying(s);
    if (Combat.canUseConsumable(unit, index) !== true) return false;
    const list = Combat.consumables();
    const id = list[index];
    const def = DD.getConsumable(id);
    if (!DD.Targeting.isValidTarget(unit, def, x, y)) return false;
    return action(function () {
      s.undo = null;
      const before = list.length;
      if (s.run && DD.Run && DD.Run.state === s.run && typeof DD.Run.removeConsumable === 'function') DD.Run.removeConsumable(index);
      const now = Combat.consumables();
      if (now.length === before && now[index] === id) now.splice(index, 1); // never usable twice
      DD.Act.log(unit.name + ' uses ' + def.name + '.', 'hero');
      Combat.resolveSkill(unit, def, { x: x, y: y }, { pay: true, consumable: true });
      return true;
    });
  };

  const SMASH_DMG = 5;
  /** Destructible objects heroes can hit directly: the destroy objective's targets and defs/instances flagged smashable. */
  Combat.smashable = function (o) {
    if (!o || !(o.maxHp > 0) || !(o.hp > 0)) return false;
    const s = S();
    const ob = s && s.objective;
    if (ob && ob.type === 'destroy' && (!ob.objId || ob.objId === o.id)) return true;
    if (o.smashable !== undefined) return !!o.smashable;
    const d = DD.getObject(o.id);
    return !!(d && d.smashable);
  };

  /** Interactions available to a unit: adjacent objects, smashable objects (1 AP, 5 damage) and downed allies (Help Up, 2 AP). */
  Combat.interactions = function (unit) {
    const out = [];
    if (!active(unit) || unit.side !== 'hero') return out;
    const spots = [{ x: unit.x, y: unit.y }].concat(U.DIRS.map(function (d) { return { x: unit.x + d.x, y: unit.y + d.y }; }));
    spots.forEach(function (p, i) {
      const t = DD.Grid.tile(p.x, p.y);
      if (!t) return;
      if (t.obj) {
        const ia = DD.Act.interactionOf(t.obj, unit);
        if (ia && (i > 0 || !DD.Grid.objBlocksMove(t.obj))) out.push({ x: p.x, y: p.y, label: ia.label, ap: ia.ap, kind: 'object', objId: t.obj.id });
        else if (i > 0 && Combat.smashable(t.obj)) out.push({ x: p.x, y: p.y, label: 'Smash', ap: 1, kind: 'smash', objId: t.obj.id, dmg: SMASH_DMG });
      }
      const o = i > 0 ? DD.Grid.unitAt(p.x, p.y) : null;
      if (o && o.downed && !o.dead && o.kind === 'hero' && !DD.Grid.hostile(unit, o)) {
        out.push({ x: p.x, y: p.y, label: 'Help Up', ap: 2, kind: 'helpUp', unitId: o.id });
      }
    });
    return out;
  };

  Combat.interact = function (unit, x, y) {
    const s = S();
    startIfDeploying(s);
    if (!controllable(unit) || stunned(unit) || hasSt(unit, 'sheep')) return false;
    const opt = Combat.interactions(unit).filter(function (o) { return o.x === x && o.y === y; })[0];
    if (!opt || (unit.ap || 0) < opt.ap) return false;
    return action(function () {
      s.undo = null;
      unit.ap -= opt.ap;
      if (opt.kind === 'helpUp') {
        const o = Combat.byId(opt.unitId);
        DD.Act.face(unit, o);
        DD.FX.lunge(unit, o);
        DD.Act.log(unit.name + ' helps ' + o.name + ' up.', 'heal');
        DD.Act.revive(o, 0.25);
      } else if (opt.kind === 'smash') {
        DD.Act.face(unit, { x: x, y: y });
        DD.FX.lunge(unit, { x: x, y: y });
        DD.Act.log(unit.name + ' smashes the ' + String((DD.getObject(opt.objId) || {}).name || opt.objId).toLowerCase() + '.', 'hero');
        DD.Act.damageObject(unit, x, y, SMASH_DMG);
      } else {
        DD.Act.interact(unit, x, y);
      }
      Combat.refreshObjective();
      Combat.checkEnd();
      return true;
    });
  };

  // ---- deployment ------------------------------------------------------------------------------------
  /** Free reposition/swap inside the deploy zone while deployment is open (before initiative is rolled). */
  Combat.deployMove = function (unit, x, y) {
    const s = S();
    if (!s || !s.deploy || !s.deploy.active || s.phase !== 'deploy' || s.order) return false;
    if (!unit || unit.side !== 'hero' || !active(unit)) return false;
    const inZone = function (p) { return s.deploy.tiles.some(function (t) { return t.x === p.x && t.y === p.y; }); };
    if (!inZone({ x: x, y: y }) || !inZone(unit)) return false;
    const other = DD.Grid.unitAt(x, y);
    if (other === unit) return false;
    if (other && (other.side !== 'hero' || !active(other))) return false;
    if (!other && !DD.Grid.isFree(x, y, unit)) return false;
    return action(function () {
      if (other) DD.Act.swap(unit, other, { force: true, noEnter: true });
      else DD.Act.teleport(unit, x, y, { noEnter: true });
      return true;
    });
  };
})();
