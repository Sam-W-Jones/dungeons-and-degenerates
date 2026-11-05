/* Dungeons and Degenerates — js/engine/targeting.js
 * DD.Targeting (ARCHITECTURE §5.2): skill ranges, valid targets, area tiles, skill contexts and HUD previews.
 * preview() runs a DRY-RUN SIMULATION: the combat state is deep-copied (plain data, function refs kept), swapped
 * into DD.Combat.state with FX/events/audio/run-gold silenced, the skill is executed, the per-unit result is
 * diffed and EVERYTHING is restored (also when execute throws, and the RNG state). skill.preview(ctx) overrides.
 * A dry run that rolls the combat RNG never shows its roll: the preview is uncertain and aggregates other rolls.
 */
(function () {
  'use strict';
  const DD = window.DD;
  const U = DD.util;

  function S() { return DD.Combat && DD.Combat.state; }
  function active(u) { return !!u && !u.dead && !u.downed; }
  function hasStatus(u, id) {
    if (!u || !u.statuses) return false;
    for (let i = 0; i < u.statuses.length; i++) if (u.statuses[i].id === id) return true;
    return false;
  }
  function facingDir(u) { return u.lastDir && (u.lastDir.x || u.lastDir.y) ? u.lastDir : { x: u.facing >= 0 ? 1 : -1, y: 0 }; }

  const T = (DD.Targeting = {});

  /**
   * Run a query without touching the combat RNG: content callbacks (canTarget, canUse, preview, custom areas) are
   * called on every hover/frame, so dice they roll are put back. Returns fn's result.
   */
  T.pure = function (fn) {
    const s = S();
    const st = s && s.rng ? s.rng.getState() : null;
    // draws put back are not chance in a preview's outcome (see simulate)
    if (DD.Act) DD.Act._quiet++;
    try { return fn(); } finally {
      if (DD.Act) DD.Act._quiet--;
      if (st !== null && S() === s) s.rng.setState(st);
    }
  };

  /** Normalize a skill reference (slot, def, id; skills or consumables) → { def, slot, level } | null. */
  T.resolve = function (ref) {
    if (!ref) return null;
    if (typeof ref === 'string') {
      const d = DD.getSkill(ref) || DD.getConsumable(ref);
      return d ? { def: d, slot: null, level: 1 } : null;
    }
    if (ref.execute && ref.target) return { def: ref, slot: null, level: 1 };
    if (ref.id) {
      const d = DD.getSkill(ref.id) || DD.getConsumable(ref.id);
      if (!d) return null;
      return { def: d, slot: ref, level: Math.max(1, Math.min(d.maxLevel || (d.levels ? d.levels.length : 1) || 1, ref.level || 1)) };
    }
    return null;
  };

  T.targetSpec = function (def) {
    const tg = (def && def.target) || {};
    return { type: tg.type || 'unit', filter: tg.filter, los: tg.los, straight: !!tg.straight, range: tg.range, canTarget: tg.canTarget };
  };

  /** [min, max] range after rangeBonus (skills with max ≥ 2), hero Dazzle (−1) and modifyRange hooks. */
  T.range = function (user, skill, level) {
    const def = skill && skill.target ? skill : (T.resolve(skill) || {}).def;
    if (!def) return [0, 0];
    const tg = T.targetSpec(def);
    if (tg.type === 'self') return [0, 0];
    if (tg.type === 'dir') return [1, 1];
    const L = DD.skillLevel(def, level || 1);
    let r = DD.resolve(tg.range, L, user, null);
    if (typeof r === 'number') r = [r === 0 ? 0 : 1, r];
    if (!Array.isArray(r) || r.length < 2) r = [1, 1];
    let min = Math.max(0, Math.floor(+r[0] || 0)), max = Math.max(0, Math.floor(+r[1] || 0));
    if (user && max >= 2) {
      max += user.rangeBonus || 0;
      if (user.side === 'hero' && hasStatus(user, 'dazzled')) max -= 1;
    }
    if (user) {
      const m = { unit: user, skill: def, min: min, max: max };
      DD.Hooks.fire('modifyRange', user, m);
      min = Math.max(0, Math.floor(+m.min || 0)); max = Math.floor(+m.max || 0);
    }
    if (max < min) max = min;
    return [min, max];
  };

  /** Unit filter relative to user (§3.2). */
  T.unitMatches = function (user, u, filter, single) {
    if (!u || u.dead) return false;
    if (filter === 'downedAlly') return !!u.downed && u.kind === 'hero' && !DD.Grid.hostile(user, u);
    if (u.downed) return false;
    if (u.flags && u.flags.untargetable) return false;
    const foe = DD.Grid.hostile(user, u);
    if (single && foe && user.side === 'enemy' && hasStatus(u, 'stealth')) return false;
    switch (filter) {
      case 'enemy': return foe;
      case 'ally': return !foe && u !== user;
      case 'allyOrSelf': return !foe;
      case 'notSelf': return u !== user;
      default: return true;
    }
  };

  // ---- v2 (user requests): attacks aimed at barrels, heals aimed at downed allies ---------------------------------
  /** Heroes and hero-side summons: only the player aims at barrels and downed allies (the AI never does). */
  function playerSide(u) {
    return !!u && !u.dead && (u.kind === 'hero' || (u.kind === 'summon' && u.side === 'hero'));
  }
  function isConsumable(def) { return !!def && DD.getConsumable(def.id) === def; }
  /**
   * This skill / consumable can be aimed at a VOLATILE object (an explosive barrel, DD.Act.isVolatile) to set it off:
   * a player-controlled user; a 'unit' target with the 'enemy' filter; and target.objects true, or (unless
   * target.objects is false) kind 'attack', a consumable without a kind, or the user's basic attack. Its normal range
   * and line of sight apply; canTarget is not asked (it is about a unit and the skill's riders, which don't happen).
   */
  T.aimsAtObjects = function (user, skillOrSlot) {
    if (!playerSide(user)) return false;
    const r = T.resolve(skillOrSlot);
    if (!r) return false;
    const def = r.def, tg = def.target || {};
    if ((tg.type || 'unit') !== 'unit' || (tg.filter || 'enemy') !== 'enemy' || tg.objects === false) return false;
    if (tg.objects === true || def.kind === 'attack') return true;
    if (isConsumable(def) && !def.kind) return true;
    return !!(user.basic && user.basic.id === def.id);
  };
  /**
   * This skill / consumable is a single-target heal that can be aimed at a DOWNED ally to get it back up (the heal's
   * amount becomes its HP: DD.Act.heal): a player-controlled user; kind 'heal' or tag 'heal'; a 'unit' target with the
   * 'ally' / 'allyOrSelf' / 'any' filter; no area. target.revive: false opts out, true opts in (any area).
   */
  T.revivesWith = function (user, skillOrSlot) {
    if (!playerSide(user)) return false;
    const r = T.resolve(skillOrSlot);
    if (!r) return false;
    const def = r.def, tg = def.target || {};
    const f = tg.filter || 'enemy';
    if ((tg.type || 'unit') !== 'unit' || tg.revive === false || (f !== 'ally' && f !== 'allyOrSelf' && f !== 'any')) return false;
    if (tg.revive === true) return true;
    if (def.area && def.area.shape && def.area.shape !== 'single') return false;
    return def.kind === 'heal' || (def.tags || []).indexOf('heal') >= 0;
  };
  /** A downed hero of the user's side (a heal aimed at it revives it). */
  function downedAlly(user, u) {
    return !!u && !u.dead && !!u.downed && u.kind === 'hero' && u !== user && !DD.Grid.hostile(user, u);
  }
  /** The volatile object on an otherwise empty tile, or null. */
  function volatileAt(x, y) {
    const t = DD.Grid.tile(x, y);
    if (!t || !t.obj || !DD.Act.isVolatile(t.obj) || DD.Grid.unitAt(x, y)) return null;
    return t.obj;
  }
  T.volatileAt = volatileAt;

  T.tileMatches = function (user, x, y, filter) {
    const G = DD.Grid;
    const t = G.tile(x, y);
    if (!t) return false;
    const u = G.unitAt(x, y);
    switch (filter) {
      case undefined: case null: case 'any': return true;
      case 'empty': return G.isFree(x, y) && !G.isDrop(x, y);
      case 'emptyOrUnit': return (G.isFree(x, y) && !G.isDrop(x, y)) || active(u);
      case 'object': return !!t.obj;
      default: return T.unitMatches(user, u, filter, false);
    }
  };

  function canTargetOk(user, r, target) {
    const tg = r.def.target || {};
    if (typeof tg.canTarget !== 'function') return true;
    const ctx = T.buildCtx(user, r.slot || r.def, target);
    return DD.safe('canTarget of ' + r.def.id, tg.canTarget, r.def, [ctx]) === true;
  }

  /** Valid target tiles for a skill/consumable from the user's current position. */
  T.validTargets = function (user, skillOrSlot) {
    return T.pure(function () { return validTargets(user, skillOrSlot); });
  };
  function validTargets(user, skillOrSlot) {
    const r = T.resolve(skillOrSlot);
    const s = S();
    if (!r || !user || !s) return [];
    const G = DD.Grid;
    const tg = T.targetSpec(r.def);
    const out = [];
    if (tg.type === 'self') {
      const p = { x: user.x, y: user.y };
      return canTargetOk(user, r, p) ? [p] : [];
    }
    if (tg.type === 'dir') {
      for (let i = 0; i < 4; i++) {
        const p = { x: user.x + U.DIRS[i].x, y: user.y + U.DIRS[i].y };
        if (G.inBounds(p.x, p.y) && canTargetOk(user, r, p)) out.push(p);
      }
      return out;
    }
    const rg = T.range(user, r.def, r.level);
    const losNeeded = tg.los !== false;
    function okTile(x, y) {
      const d = Math.abs(x - user.x) + Math.abs(y - user.y);
      if (d < rg[0] || d > rg[1]) return false;
      if (tg.straight && x !== user.x && y !== user.y) return false;
      if (losNeeded && d > 0 && !G.los(user, { x: x, y: y })) return false;
      return true;
    }
    if (tg.type === 'unit') {
      const filter = tg.filter || 'enemy';
      const revive = T.revivesWith(user, skillOrSlot);
      for (let i = 0; i < s.units.length; i++) {
        const u = s.units[i];
        const down = revive && downedAlly(user, u);
        if (!down && !T.unitMatches(user, u, filter, true)) continue;
        if (!okTile(u.x, u.y)) continue;
        const p = { x: u.x, y: u.y };
        if (down) p.revive = true;   // a heal aimed at a downed ally: it gets back up (HUD: highlight it)
        if (canTargetOk(user, r, p)) out.push(p);
      }
      // a volatile object in range and sight (an explosive barrel): the attack sets it off
      if (T.aimsAtObjects(user, skillOrSlot)) {
        // [v2 review] the object test first (cheap), the range / sight test (a LOS ray) only on a volatile object
        const max = rg[1];
        for (let dy = -max; dy <= max; dy++) {
          const rem = max - Math.abs(dy);
          for (let dx = -rem; dx <= rem; dx++) {
            const x = user.x + dx, y = user.y + dy;
            if (!G.inBounds(x, y)) continue;
            const o = volatileAt(x, y);
            if (o && okTile(x, y)) out.push({ x: x, y: y, obj: o.id });
          }
        }
      }
      return out;
    }
    // tile
    const max = rg[1];
    for (let dy = -max; dy <= max; dy++) {
      const rem = max - Math.abs(dy);
      for (let dx = -rem; dx <= rem; dx++) {
        const x = user.x + dx, y = user.y + dy;
        if (!G.inBounds(x, y) || !okTile(x, y)) continue;
        if (!T.tileMatches(user, x, y, tg.filter)) continue;
        const p = { x: x, y: y };
        if (canTargetOk(user, r, p)) out.push(p);
      }
    }
    return out;
  }

  T.isValidTarget = function (user, skillOrSlot, x, y) {
    const list = T.validTargets(user, skillOrSlot);
    for (let i = 0; i < list.length; i++) if (list[i].x === x && list[i].y === y) return true;
    return false;
  };

  /** Area tiles for a skill aimed at target (dir defaults to user → target, else the user's facing). */
  T.area = function (user, skill, level, target, dir, partialCtx) {
    const def = skill && skill.target ? skill : (T.resolve(skill) || {}).def;
    if (!def || !target) return [];
    const L = DD.skillLevel(def, level || 1);
    const ar = def.area || { shape: 'single' };
    const size = Math.max(0, Math.floor(+DD.resolve(ar.size, L, user, 1) || 0));
    const d = dir || (user && (target.x !== user.x || target.y !== user.y) ? U.dirTo(user, target) : (user ? facingDir(user) : { x: 1, y: 0 }));
    const ctx = partialCtx || { user: user, skill: def, level: level || 1, L: L, target: target, dir: d, state: S(), rng: S() ? S().rng : DD.rng };
    return DD.Grid.shape(ar, target, d, size, user, { ctx: ctx });
  };

  /** Full skill context (§3.2). extra: { isIntent, intent, tiles, dir, ... } (other keys are copied onto ctx). */
  T.buildCtx = function (user, skillOrSlot, target, extra) {
    const r = T.resolve(skillOrSlot);
    extra = extra || {};
    const s = S();
    if (!r) return null;
    const def = r.def;
    const L = DD.skillLevel(def, r.level);
    const tg = T.targetSpec(def);
    let tgt = target ? { x: target.x, y: target.y } : null;
    if (!tgt && tg.type === 'self' && user) tgt = { x: user.x, y: user.y };
    const dir = extra.dir || (user && tgt && (tgt.x !== user.x || tgt.y !== user.y) ? U.dirTo(user, tgt) : (user ? facingDir(user) : { x: 1, y: 0 }));
    const ctx = {
      user: user, skill: def, slot: r.slot, level: r.level, L: L,
      target: tgt, targetUnit: null, dir: dir,
      tiles: [], units: [], foes: [], friends: [],
      isIntent: !!extra.isIntent, intent: extra.intent || null,
      state: s, rng: s ? s.rng : DD.rng,
    };
    if (tgt) {
      if (tg.type === 'self') ctx.targetUnit = user;
      else {
        const u = DD.Grid.unitAt(tgt.x, tgt.y);
        if (u && (active(u) || (u.downed && tg.filter === 'downedAlly'))) ctx.targetUnit = u;
        else if (u && downedAlly(user, u) && T.revivesWith(user, skillOrSlot)) {
          // v2: a heal aimed at a downed ally — DD.Act.heal on it (while this skill resolves) gets it back up
          ctx.targetUnit = u;
          ctx.reviveTarget = u;
        } else if (!u && tg.type === 'unit' && volatileAt(tgt.x, tgt.y) && T.aimsAtObjects(user, skillOrSlot)) {
          // v2: an attack aimed at a volatile object — DD.Combat.resolveSkill detonates it instead of running execute
          ctx.targetObj = DD.Grid.tile(tgt.x, tgt.y).obj;
        }
      }
    }
    ctx.tiles = extra.tiles ? extra.tiles.filter(function (p) { return DD.Grid.inBounds(p.x, p.y); })
      : ctx.targetObj ? [{ x: tgt.x, y: tgt.y }] : (tgt ? T.area(user, def, r.level, tgt, dir, ctx) : []);
    const seen = {};
    for (let i = 0; i < ctx.tiles.length; i++) {
      const u = DD.Grid.unitAt(ctx.tiles[i].x, ctx.tiles[i].y);
      if (!active(u) || seen[u.id]) continue;
      seen[u.id] = 1;
      ctx.units.push(u);
      if (user && DD.Grid.hostile(user, u)) ctx.foes.push(u); else ctx.friends.push(u);
    }
    for (const k in extra) {
      if (k === 'tiles' || k === 'dir' || k === 'isIntent' || k === 'intent') continue;
      ctx[k] = extra[k];
    }
    return ctx;
  };

  // ---- dry-run simulation ------------------------------------------------------------------------
  const RUN_MUTATORS = ['addGold', 'spendGold', 'addConsumable', 'removeConsumable', 'addItem', 'damageHero', 'healParty', 'save'];
  // alternative-luck dry runs behind a preview whose outcome depends on the combat RNG
  const SAMPLES = 8;
  T.SAMPLES = SAMPLES;

  /**
   * Run fn(simState, rec) against a deep copy of the combat state with all side effects silenced; always restores.
   * Returns fn's result (undefined if it threw — the error is reported via DD.warn by the caller's DD.safe).
   * opts.seed: the copy's RNG starts from this state instead of the real one (another roll of the dice).
   * opts.record: return the record { result, draws, uncertain } instead: draws = logic draws of the copy's RNG
   * (bookkeeping draws under DD.Act quiet / Targeting.pure don't count), uncertain = DD.Act.markUncertain() was called.
   */
  T.simulate = function (fn, opts) {
    opts = opts || {};
    const real = S();
    if (!real) return undefined;
    const FX = DD.FX;
    const saved = {
      instant: FX.instant, push: FX.push, emit: DD.Events.emit, sim: DD.Act.simulating, simRec: DD.Act._sim,
      act: DD.Act._saveModule(), combat: DD.Combat._saveModule ? DD.Combat._saveModule() : null,
      rng: real.rng.getState(), audio: DD.Audio && DD.Audio.play, toast: DD.UI && DD.UI.toast, run: {},
    };
    const sim = DD.Combat.cloneState(real);
    if (opts.seed !== undefined && opts.seed !== null) sim.rng.setState(opts.seed);
    const rec = { result: undefined, draws: 0, uncertain: false };
    const quietBase = DD.Act._quiet || 0;
    const next = sim.rng.next, fork = sim.rng.fork;
    sim.rng.next = function () { if ((DD.Act._quiet || 0) <= quietBase) rec.draws++; return next(); };
    sim.rng.fork = function (label) { if ((DD.Act._quiet || 0) <= quietBase) rec.draws++; return fork(label); };
    try {
      DD.Act._sim = rec;
      DD.Combat.state = sim;
      FX.instant = true;
      FX.push = function (evt) { return evt; };
      DD.Events.emit = function () {};
      if (DD.Audio && typeof DD.Audio.play === 'function') DD.Audio.play = function () {};
      if (DD.UI && typeof DD.UI.toast === 'function') DD.UI.toast = function () {};
      if (DD.Run) {
        for (let i = 0; i < RUN_MUTATORS.length; i++) {
          const k = RUN_MUTATORS[i];
          if (typeof DD.Run[k] === 'function') { saved.run[k] = DD.Run[k]; DD.Run[k] = function () { return k === 'spendGold' ? true : undefined; }; }
        }
      }
      DD.Act.simulating = true;
      rec.result = DD.safe('preview simulation', fn, null, [sim, rec]);
      return opts.record ? rec : rec.result;
    } finally {
      DD.Combat.state = real;
      FX.instant = saved.instant;
      FX.push = saved.push;
      DD.Events.emit = saved.emit;
      if (saved.audio) DD.Audio.play = saved.audio;
      if (saved.toast) DD.UI.toast = saved.toast;
      if (DD.Run) for (const k in saved.run) DD.Run[k] = saved.run[k];
      DD.Act.simulating = saved.sim;
      DD.Act._sim = saved.simRec;
      DD.Act._restoreModule(saved.act);
      if (saved.combat && DD.Combat._restoreModule) DD.Combat._restoreModule(saved.combat);
      real.rng.setState(saved.rng);
    }
  };

  function statusLabel(id, stacks) {
    const d = DD.getStatus(id);
    return (d ? d.name : id) + (stacks > 1 ? ' ' + stacks : '');
  }

  /** Per-unit diff between the real state and a simulated one. */
  T.diff = function (real, sim, uncertain) {
    const perUnit = {};
    const simById = {};
    for (let i = 0; i < sim.units.length; i++) simById[sim.units[i].id] = sim.units[i];
    for (let i = 0; i < real.units.length; i++) {
      const ru = real.units[i];
      if (ru.dead) continue;
      const su = simById[ru.id];
      if (!su) continue;
      const dHp = ru.hp - su.hp;
      const dBlock = (ru.block || 0) - (su.block || 0);
      const lethal = (!!su.dead && !ru.dead) || (!!su.downed && !ru.downed);
      const revived = !!ru.downed && !su.downed && !su.dead;   // v2: back on its feet ("UP! N HP")
      const added = [], removed = [];
      const before = {};
      for (let k = 0; k < ru.statuses.length; k++) before[ru.statuses[k].id] = ru.statuses[k].stacks;
      const after = {};
      for (let k = 0; k < su.statuses.length; k++) {
        const st = su.statuses[k];
        after[st.id] = st.stacks;
        if (before[st.id] === undefined || st.stacks > before[st.id]) added.push(st.id);
      }
      for (const id in before) if (after[id] === undefined && !lethal) removed.push(id);
      const moved = su.x !== ru.x || su.y !== ru.y ? { x: su.x, y: su.y } : null;
      if (!dHp && !dBlock && !lethal && !revived && !added.length && !removed.length && !moved) continue;
      const e = {
        dmg: Math.max(0, dHp), heal: Math.max(0, -dHp), blocked: Math.max(0, dBlock), block: Math.max(0, -dBlock),
        lethal: lethal, revived: revived, statuses: added, removed: removed, moved: moved, uncertain: !!uncertain, text: '',
      };
      const parts = [];
      if (e.dmg) parts.push('−' + e.dmg);
      if (e.blocked) parts.push(e.blocked + ' blocked');
      if (revived) parts.push('UP! ' + su.hp + ' HP');
      else if (e.heal) parts.push('+' + e.heal);
      if (e.block) parts.push('+' + e.block + ' Block');
      for (let k = 0; k < added.length; k++) parts.push(statusLabel(added[k], after[added[k]]));
      for (let k = 0; k < removed.length; k++) parts.push('no ' + statusLabel(removed[k], 1));
      if (moved) parts.push('moved');
      if (lethal) parts.push(su.downed ? 'DOWNED' : 'KO');
      e.text = (uncertain ? '? ' : '') + parts.join(' · ');
      perUnit[ru.id] = e;
    }
    const realIds = {};
    for (let i = 0; i < real.units.length; i++) realIds[real.units[i].id] = 1;
    const spawned = [];
    for (let i = 0; i < sim.units.length; i++) {
      const u = sim.units[i];
      if (!realIds[u.id] && !u.dead) spawned.push({ defId: u.defId, name: u.name, x: u.x, y: u.y, side: u.side, kind: u.kind });
    }
    const objects = [];
    for (let i = 0; i < real.grid.tiles.length; i++) {
      const ro = real.grid.tiles[i].obj, so = sim.grid.tiles[i] && sim.grid.tiles[i].obj;
      if (!ro || !(ro.maxHp > 0)) continue;
      const destroyed = !so || so.id !== ro.id;
      const dmg = destroyed ? ro.hp : Math.max(0, ro.hp - so.hp);
      if (dmg > 0 || destroyed) objects.push({ x: real.grid.tiles[i].x, y: real.grid.tiles[i].y, id: ro.id, dmg: dmg, destroyed: destroyed });
    }
    return { perUnit: perUnit, spawned: spawned, objects: objects, hype: (sim.hype || 0) - (real.hype || 0) };
  };

  // ---- uncertain outcomes: never show the real roll -----------------------------------------------
  /** Comparable outcome of a dry run (no texts or names: those may differ without changing anything). */
  function signature(res) {
    const per = res.perUnit || {};
    return JSON.stringify([
      Object.keys(per).sort().map(function (id) {
        const e = per[id];
        return [id, e.dmg, e.heal, e.blocked, e.block, !!e.lethal, !!e.revived, (e.statuses || []).slice().sort(), (e.removed || []).slice().sort(), e.moved ? [e.moved.x, e.moved.y] : 0];
      }),
      (res.spawned || []).map(function (p) { return [p.defId, p.x, p.y, p.side]; }),
      (res.objects || []).map(function (o) { return [o.x, o.y, o.id, o.dmg, !!o.destroyed]; }),
      res.hype || 0,
    ]);
  }
  function pct(p) { return Math.round(p * 100) + '%'; }
  function span(min, max) { return min === max ? String(max) : min + '–' + max; }

  /**
   * Expected outcome over several dry runs with other rolls of the dice. Per unit: dmg / heal / blocked / block are
   * the rounded means with xMin / xMax ranges; lethal = more likely than not (lethalChance = the share of runs);
   * statuses / removed = the ones at least half the runs add or remove (statusChance / removedChance per id);
   * moved = the most common landing tile (movedChance); uncertain = true; text like "? −3–9 · Burn 50% · KO 40%".
   * spawned = the most common spawn list, objects = mean damage / majority destroyed, hype = the rounded mean.
   */
  function aggregate(list) {
    const n = list.length;
    const order = [], seen = {};
    list.forEach(function (r) { Object.keys(r.perUnit).forEach(function (id) { if (!seen[id]) { seen[id] = 1; order.push(id); } }); });
    const perUnit = {};
    order.forEach(function (id) {
      const es = list.map(function (r) { return r.perUnit[id] || null; });
      const e = { uncertain: true, samples: n };
      ['dmg', 'heal', 'blocked', 'block'].forEach(function (k) {
        const v = es.map(function (x) { return x ? x[k] || 0 : 0; });
        let sum = 0, mn = Infinity, mx = -Infinity;
        v.forEach(function (a) { sum += a; mn = Math.min(mn, a); mx = Math.max(mx, a); });
        e[k] = Math.round(sum / n); e[k + 'Min'] = mn; e[k + 'Max'] = mx;
      });
      const kos = es.filter(function (x) { return x && x.lethal; }).length;
      e.lethalChance = kos / n;
      e.lethal = kos * 2 >= n && kos > 0;
      const ups = es.filter(function (x) { return x && x.revived; }).length;
      e.revivedChance = ups / n;
      e.revived = ups * 2 >= n && ups > 0;
      ['statuses', 'removed'].forEach(function (k) {
        const cnt = {}, ids = [];
        es.forEach(function (x) { (x ? x[k] || [] : []).forEach(function (sid) { if (!cnt[sid]) ids.push(sid); cnt[sid] = (cnt[sid] || 0) + 1; }); });
        const chance = {};
        e[k] = [];
        ids.forEach(function (sid) { chance[sid] = cnt[sid] / n; if (cnt[sid] * 2 >= n) e[k].push(sid); });
        e[k === 'statuses' ? 'statusChance' : 'removedChance'] = chance;
      });
      const land = {};
      let bestKey = '', bestN = -1;
      es.forEach(function (x) { const key = x && x.moved ? x.moved.x + ',' + x.moved.y : ''; land[key] = (land[key] || 0) + 1; });
      Object.keys(land).forEach(function (key) { if (land[key] > bestN || (land[key] === bestN && key === '')) { bestN = land[key]; bestKey = key; } });
      e.moved = bestKey ? { x: +bestKey.split(',')[0], y: +bestKey.split(',')[1] } : null;
      e.movedChance = 1 - (land[''] || 0) / n;
      const u = DD.Combat.byId(id);
      const parts = [];
      if (e.dmgMax > 0) parts.push('−' + span(e.dmgMin, e.dmgMax));
      if (e.blockedMax > 0) parts.push(span(e.blockedMin, e.blockedMax) + ' blocked');
      if (ups > 0) parts.push('UP! ' + span(e.healMin, e.healMax) + ' HP' + (ups < n ? ' ' + pct(ups / n) : ''));
      else if (e.healMax > 0) parts.push('+' + span(e.healMin, e.healMax));
      if (e.blockMax > 0) parts.push('+' + span(e.blockMin, e.blockMax) + ' Block');
      Object.keys(e.statusChance).forEach(function (sid) {
        const d = DD.getStatus(sid);
        parts.push((d ? d.name : sid) + (e.statusChance[sid] < 1 ? ' ' + pct(e.statusChance[sid]) : ''));
      });
      Object.keys(e.removedChance).forEach(function (sid) {
        const d = DD.getStatus(sid);
        parts.push('no ' + (d ? d.name : sid) + (e.removedChance[sid] < 1 ? ' ' + pct(e.removedChance[sid]) : ''));
      });
      if (e.movedChance > 0) parts.push('moved' + (e.movedChance < 1 ? ' ' + pct(e.movedChance) : ''));
      if (e.lethalChance > 0) parts.push((u && u.kind === 'hero' ? 'DOWNED' : 'KO') + (e.lethalChance < 1 ? ' ' + pct(e.lethalChance) : ''));
      e.text = '? ' + parts.join(' · ');
      perUnit[id] = e;
    });
    // spawns: the most common outcome's list; objects: mean damage, destroyed when most runs destroy it
    const spawnSig = {};
    let spawned = [], sN = -1;
    list.forEach(function (r) {
      const key = JSON.stringify((r.spawned || []).map(function (p) { return [p.defId, p.x, p.y]; }));
      spawnSig[key] = (spawnSig[key] || 0) + 1;
      if (spawnSig[key] > sN) { sN = spawnSig[key]; spawned = r.spawned || []; }
    });
    const objs = {}, objOrder = [];
    list.forEach(function (r) {
      (r.objects || []).forEach(function (o) {
        const key = o.x + ',' + o.y;
        if (!objs[key]) { objs[key] = { x: o.x, y: o.y, id: o.id, dmg: 0, destroyed: 0 }; objOrder.push(key); }
        objs[key].dmg += o.dmg || 0;
        if (o.destroyed) objs[key].destroyed++;
      });
    });
    const objects = objOrder.map(function (key) {
      const o = objs[key];
      return { x: o.x, y: o.y, id: o.id, dmg: Math.round(o.dmg / n), destroyed: o.destroyed * 2 >= n, destroyedChance: o.destroyed / n };
    });
    let hype = 0;
    list.forEach(function (r) { hype += r.hype || 0; });
    return { perUnit: perUnit, spawned: spawned, objects: objects, hype: Math.round(hype / n) };
  }

  /** Mark a (single-outcome) result uncertain: '?' texts, uncertain flags. */
  function markResult(res) {
    for (const id in res.perUnit) {
      const e = res.perUnit[id];
      e.uncertain = true;
      if (e.text && e.text.indexOf('? ') !== 0) e.text = '? ' + e.text;
      else if (!e.text) e.text = '?';
    }
    return res;
  }

  /**
   * HUD preview of using a skill at target: { tiles, units, perUnit: { [id]: { dmg, heal, lethal, text, ... } },
   * uncertain, samples, spawned, objects, hype }. Uses skill.preview(ctx) when defined, otherwise a dry-run simulation.
   * Fairness: the dry run uses a copy of the real RNG, so it would know the next roll. When the run draws from the
   * combat RNG (a 'random' skill, a proc, a wild surge...) the preview is uncertain and never shows that run: it
   * replays the action with SAMPLES other rolls and shows their expected outcome (aggregate: means, ranges, chances),
   * or their common outcome when every roll agrees. Without a draw the outcome is fixed and exact; a 'random' tag,
   * DD.Act.markUncertain() or ctx.uncertain = true during the run still flag it uncertain ("?").
   * So: a preview that is not uncertain predicts the outcome exactly.
   */
  T.preview = function (user, slotOrSkill, target) {
    return T.pure(function () { return preview(user, slotOrSkill, target); });
  };
  function preview(user, slotOrSkill, target) {
    const out = { tiles: [], units: [], perUnit: {}, uncertain: false, samples: 1, spawned: [], objects: [], hype: 0, blast: [] };
    const r = T.resolve(slotOrSkill);
    const real = S();
    if (!r || !user || !target || !real) return out;
    const ctx0 = T.buildCtx(user, slotOrSkill, target);
    out.tiles = ctx0.tiles;
    out.units = ctx0.units;
    const tagged = (r.def.tags || []).indexOf('random') >= 0 && !ctx0.targetObj;   // a detonation rolls nothing of the skill
    out.uncertain = tagged;
    // a def's own preview describes its execute: a detonation or a revive does not run it (the dry run shows them)
    if (typeof r.def.preview === 'function' && !ctx0.targetObj && !ctx0.reviveTarget) {
      const p = DD.safe('preview of ' + r.def.id, r.def.preview, r.def, [ctx0]);
      if (p && typeof p === 'object') {
        for (const id in p) {
          const e = p[id] || {};
          const u = DD.Combat.byId(id);
          const dmg = Math.max(0, Math.round(e.dmg || 0));
          out.perUnit[id] = { dmg: dmg, heal: Math.max(0, Math.round(e.heal || 0)), lethal: !!(u && dmg >= u.hp + (u.block || 0)),
            blocked: Math.max(0, Math.round(e.blocked || 0)), block: Math.max(0, Math.round(e.block || 0)),
            text: e.text || (dmg ? '−' + dmg : e.heal ? '+' + e.heal : ''), uncertain: out.uncertain, statuses: [], removed: [], moved: null };
        }
        return out;
      }
    }
    function run(seed) {
      return T.simulate(function (sim, rec) {
        const su = DD.Combat.byId(user.id);
        if (!su) return null;
        let slot = null;
        if (r.slot) {
          const slots = DD.Combat.slotsOf(su);
          for (let i = 0; i < slots.length; i++) if (slots[i].id === r.slot.id) { slot = slots[i]; break; }
        }
        const ctx = DD.Combat.resolveSkill(su, slot || r.def, target, { pay: !!slot, consumable: !!DD.getConsumable(r.def.id) && !DD.getSkill(r.def.id) });
        if (ctx && ctx.uncertain) rec.uncertain = true;
        const d = T.diff(real, sim, false);
        d.blast = (rec.blasts || []).slice();   // tiles of the explosions it set off (Act.explode)
        return d;
      }, { seed: seed, record: true });
    }
    const p0 = DD.problems.length;
    const first = run();
    if (!first || !first.result) return out;
    let res = first.result;
    let blasts = first.result.blast || [];
    // no dice rolled: the outcome is fixed and shown exactly ('random' / marked skills still say "?")
    let uncertain = tagged || first.uncertain;
    if (first.draws > 0) {
      // dice were rolled (whether they were is fixed by the visible state, so this tells nothing about the roll):
      // the real roll stays hidden and the preview shows SAMPLES other rolls instead
      uncertain = true;
      const base = real.rng.getState();
      const alts = [];
      const seen = {};
      const key = function (m) { return String(m).split('\n')[0]; };   // label + message (stacks differ by call site)
      DD.problems.slice(p0).forEach(function (m) { seen[key(m)] = 1; });
      blasts = [];   // never the real roll's blasts either
      for (let i = 0; i < SAMPLES; i++) {
        const pa = DD.problems.length;
        const a = run((U.hash(base + ':luck:' + i) >>> 0) || 1);
        // a replay that hits the same content error is reported once, not SAMPLES more times
        for (let k = DD.problems.length - 1; k >= pa; k--) { const kk = key(DD.problems[k]); if (seen[kk]) DD.problems.splice(k, 1); else seen[kk] = 1; }
        if (a && a.result) { alts.push(a.result); blasts = blasts.concat(a.result.blast || []); }
      }
      if (alts.length) {
        const sig = signature(alts[0]);
        if (!alts.every(function (a) { return signature(a) === sig; })) { res = aggregate(alts); out.samples = alts.length; }
        // every roll gives the same outcome: show it (the real run's copy only for its cosmetic names)
        else if (signature(res) !== sig) res = alts[0];
      } else res = { perUnit: {}, spawned: [], objects: [], hype: 0 };   // never fall back to the real roll
    }
    if (uncertain && out.samples === 1) markResult(res);
    out.uncertain = uncertain;
    out.perUnit = res.perUnit; out.spawned = res.spawned; out.objects = res.objects; out.hype = res.hype;
    out.blast = uniqTiles(blasts);
    // aimed at a barrel: the area to show is the blast (its tile first)
    if (ctx0.targetObj) { out.tiles = uniqTiles([{ x: target.x, y: target.y }].concat(out.blast)); out.detonates = ctx0.targetObj.id; }
    if (ctx0.reviveTarget) out.revives = ctx0.reviveTarget.id;
    return out;
  }
  function uniqTiles(list) {
    const seen = {}, out = [];
    for (let i = 0; i < list.length; i++) {
      const k = list[i].x + ',' + list[i].y;
      if (!seen[k]) { seen[k] = 1; out.push({ x: list[i].x, y: list[i].y }); }
    }
    return out;
  }
})();
