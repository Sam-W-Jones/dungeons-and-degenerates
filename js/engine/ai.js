/* Dungeons and Degenerates — js/engine/ai.js
 * DD.AI (ARCHITECTURE §5.6, §6.1): what AI-controlled units do on their initiative turn and boss WIND-UPS.
 * v2: no telegraphs. AI.act(unit) is a whole turn body: stunned / asleep / frozen → the turn is lost; sheep → wanders;
 * else the custom planner def.ai(unit, api) or the default one decides and acts at once. Default planner: every
 * reachable tile × usable skill × candidate target is scored from L.dmg / L.heal estimates (kills, foes hit, friendly
 * fire, statuses, skill.aiScore) plus a positional score per AI style (melee / ranged keepDistance / support / coward /
 * summoner / kamikaze), avoiding hazards; it walks there and uses the skill.
 * Every action is an intent record executed at once (executeIntent): taunt = it must hit the taunter or the attack
 * fizzles, dazzle = it lands 1 tile off, confuse = a quarter turn, silence = no spells, charm = hostility flipped.
 * Wind-ups (AI.windUp) are the only pending actions: they stay in unit.intents (windup: true, turnsLeft) and resolve at
 * the START of the unit's next turn (AI.resolveWindups, called by DD.Combat), unless it is stunned / asleep / frozen /
 * polymorphed or dead by then. AI.reachOf / AI.threatMap estimate where AI units could strike before their foes' next
 * turn (HUD threat shading, AutoPlay's danger model).
 */
(function () {
  'use strict';
  const DD = window.DD;
  const U = DD.util;

  const AI = (DD.AI = {});
  const ELEMENTS = ['fire', 'frost', 'lightning', 'poison', 'holy'];

  function S() { return DD.Combat.state; }
  function G() { return DD.Grid; }
  function active(u) { return !!u && !u.dead && !u.downed; }
  function has(u, id) { return DD.Act.hasStatus(u, id); }
  function getSt(u, id) { return DD.Act.getStatus(u, id); }
  function defOf(u) { return DD.Hooks.defOf(u); }
  function skillOf(id) { return DD.getSkill(id); }
  function stunned(u) { return DD.Act.isStunned(u); }
  function slotFor(u, id) {
    const slots = DD.Combat.slotsOf(u);
    for (let i = 0; i < slots.length; i++) if (slots[i].id === id) return slots[i];
    return null;
  }

  // ---- who the AI cares about --------------------------------------------------------------------
  function taunter(u) {
    const st = getSt(u, 'taunt');
    if (!st || !st.source) return null;
    const t = DD.Combat.byId(st.source);
    return active(t) ? t : null;
  }
  AI.taunter = taunter;
  /** Units the AI wants to hurt: hostile, active, not stealthed; only the taunter while taunted. */
  AI.targetsFor = function (u) {
    const t = taunter(u);
    if (t && G().hostile(u, t)) return [t];
    return S().units.filter(function (o) { return active(o) && G().hostile(u, o) && !has(o, 'stealth'); });
  };
  function isFoe(u, o, taunt) {
    if (!active(o) || !G().hostile(u, o) || has(o, 'stealth')) return false;
    return !taunt || o === taunt;
  }

  function styleSpec(ai) {
    if (ai && typeof ai === 'object') return { style: ai.style || 'melee', keepDistance: ai.keepDistance !== undefined ? ai.keepDistance : (ai.style === 'ranged' || ai.style === 'summoner' ? 3 : 0) };
    if (typeof ai === 'string' && ai !== 'default') return { style: ai, keepDistance: ai === 'ranged' || ai === 'summoner' ? 3 : 0 };
    return null;
  }
  /**
   * Positioning style: def.ai as a style ('ranged' / { style, keepDistance }), else def.aiStyle (for function
   * planners), else from the damage skills' reach: the default planner goes by the longest one (≥ 3: ranged), a
   * function planner by its shortest one (a bruiser with one long leap is still a bruiser). [phase 4, act 2 request]
   */
  function styleOf(unit) {
    const def = defOf(unit);
    const ai = def && def.ai;
    const own = styleSpec(ai);
    if (own) return own;
    const custom = typeof ai === 'function';
    if (custom && def.aiStyle) { const st = styleSpec(def.aiStyle); if (st) return st; }
    let maxR = 1, minR = Infinity;
    DD.Combat.slotsOf(unit).forEach(function (sl) {
      const d = skillOf(sl.id);
      if (!d || !(d.levels || []).some(function (L) { return L && L.dmg; })) return;
      const r = DD.Targeting.range(unit, d, sl.level)[1];
      maxR = Math.max(maxR, r);
      minR = Math.min(minR, r);
    });
    const reach = custom && isFinite(minR) ? minR : maxR;
    return reach >= 3 ? { style: 'ranged', keepDistance: Math.min(3, reach - 1) } : { style: 'melee', keepDistance: 0 };
  }
  AI.styleOf = styleOf;
  function noMove(u) { return DD.Act.cantMove(u); }

  function usableSlots(unit, onlyIds) {
    return DD.Combat.slotsOf(unit).filter(function (sl) {
      const d = skillOf(sl.id);
      if (!d) return false;
      if (onlyIds && onlyIds.indexOf(sl.id) < 0) return false;
      if (sl.cd > 0) return false;
      if (d.charges > 0 && (sl.uses || 0) >= d.charges) return false;
      if (d.kind === 'spell' && has(unit, 'silenced')) return false;
      if (typeof d.canUse === 'function') {
        const ok = DD.safe('canUse of ' + d.id, d.canUse, d, [DD.Targeting.buildCtx(unit, sl, null)]);
        if (ok === false || typeof ok === 'string') return false;
      }
      return true;
    });
  }

  // ---- damage estimates ---------------------------------------------------------------------------
  function elementOf(def) {
    const tags = def.tags || [];
    for (let i = 0; i < ELEMENTS.length; i++) if (tags.indexOf(ELEMENTS[i]) >= 0) return ELEMENTS[i];
    return null;
  }
  function outMult(u) {
    let m = 1;
    if (has(u, 'weak')) m *= 0.75;
    if (has(u, 'inspired')) m *= 1.25;
    if (has(u, 'empowered')) m *= 1.5;
    if (u.dmgBonus) m *= 1 + u.dmgBonus;
    if (u.side === 'enemy') m *= (S().difficulty && S().difficulty.dmg) || 1;
    return m;
  }
  /** Rough damage of `dmg` from u to o (ignores hooks; reads statuses' declared takenMult, e.g. the DM's Exposed). */
  function estimate(u, o, dmg, element) {
    let m = outMult(u);
    const tu = G().tile(u.x, u.y), to = G().tile(o.x, o.y);
    if (tu && to && (tu.h || 0) > (to.h || 0)) m *= 1.25;
    if (has(o, 'vulnerable')) m *= 1.25;
    m *= DD.Act.takenMult(o);
    if (element && o.resist && typeof o.resist[element] === 'number') m *= o.resist[element];
    if (element === 'lightning' && has(o, 'wet')) m *= 1.5;
    if (has(o, 'invulnerable')) return 0;
    let v = Math.round(dmg * m);
    const mk = getSt(o, 'marked');
    if (v > 0 && mk) v += mk.stacks;
    if (v > 0 && o.armor) v = Math.max(1, v - o.armor);
    return v;
  }
  AI.estimate = estimate;

  /**
   * Flat damage modifiers from statuses on the attacker. A status def may declare a pure telegraphFlat(st, unit) →
   * number when its hooks change the attacker's damage by a flat amount (d.flat in modifyOutgoingDamage), e.g.
   * syl_roasted (−1 per stack), so wind-up numbers and reach estimates tell the truth like they do for Weak.
   */
  function telegraphFlat(u) {
    let f = 0;
    const list = (u && u.statuses) || [];
    for (let i = 0; i < list.length; i++) {
      const sd = DD.getStatus(list[i].id);
      if (sd && typeof sd.telegraphFlat === 'function') f += Number(DD.safe('telegraphFlat of ' + sd.id, sd.telegraphFlat, sd, [list[i], u])) || 0;
    }
    return f;
  }
  AI.telegraphFlat = telegraphFlat;

  /** The damage number of an action of def (before target modifiers): L.dmg × attacker multipliers + status flats. */
  function intentDmg(unit, def, level) {
    const L = DD.skillLevel(def, level);
    if (!L || !(L.dmg > 0)) return 0;
    return Math.max(0, Math.round(L.dmg * outMult(unit)) + telegraphFlat(unit));
  }

  // ---- scoring ----------------------------------------------------------------------------------
  function isSummonSkill(def) { return def.kind === 'summon' || (def.tags || []).indexOf('summon') >= 0; }

  /**
   * protect { objId } objectives: enemies go for the thing the heroes must protect, with skills that can hurt
   * objects (target filter 'object', or tagged 'objects' = "damages objects in its area").
   */
  function protectedObjectScore(unit, def, tiles, dmg) {
    const ob = S().objective;
    if (!ob || ob.type !== 'protect' || !ob.objId || G().effectiveSide(unit) !== 'enemy') return 0;
    if (!(def.target && def.target.filter === 'object') && (def.tags || []).indexOf('objects') < 0) return 0;
    let sc = 0;
    for (let i = 0; i < tiles.length; i++) {
      const t = G().tile(tiles[i].x, tiles[i].y);
      if (t && t.obj && t.obj.id === ob.objId && t.obj.hp > 0) sc += (dmg || 4) + 8 + (dmg >= t.obj.hp ? 20 : 0);
    }
    return sc;
  }
  function isSupportSkill(def, L) { return def.kind === 'heal' || def.kind === 'buff' || (L && L.heal > 0 && !(L.dmg > 0)); }

  function scoreAction(unit, slot, def, target, style, taunt) {
    const L = DD.skillLevel(def, slot.level);
    const tiles = DD.Targeting.area(unit, def, slot.level, target);
    const dmg = L && L.dmg > 0 ? L.dmg : 0;
    const heal = L && L.heal > 0 ? L.heal : 0;
    const el = elementOf(def);
    let score = 0, foesHit = 0, hitsTaunter = false;
    const seen = {};
    for (let i = 0; i < tiles.length; i++) {
      const o = G().unitAt(tiles[i].x, tiles[i].y);
      if (!active(o) || seen[o.id]) continue;
      seen[o.id] = 1;
      if (taunt && o === taunt) hitsTaunter = true;
      if (isFoe(unit, o, taunt)) {
        foesHit++;
        if (dmg) {
          const est = estimate(unit, o, dmg, el);
          score += est;
          if (est >= o.hp + (o.block || 0)) score += 12 + (o.kind === 'hero' ? 6 : 0);
          score += (1 - o.hp / Math.max(1, o.maxHp)) * 3;
        } else if (!isSupportSkill(def, L)) score += 3;
      } else if (!G().hostile(unit, o)) {
        if (dmg && (def.tags || []).indexOf('safe') < 0 && o !== unit) score -= estimate(unit, o, dmg, el) * 1.2;
        if (heal) {
          const missing = o.maxHp - o.hp;
          score += Math.min(heal, missing) * (style.style === 'support' ? 1.6 : 1) + (missing > o.maxHp * 0.5 ? 3 : 0);
        }
        if (def.kind === 'buff') score += style.style === 'support' ? 5 : 3;
      }
    }
    if (taunt && !hitsTaunter) return -1;
    score += protectedObjectScore(unit, def, tiles, dmg);
    if (isSummonSkill(def)) {
      const mine = S().units.filter(function (o) { return active(o) && o.side === unit.side && o.kind === 'summon' && o.ownerId === unit.id; }).length;
      const spawned = S().units.filter(function (o) { return active(o) && o.side === unit.side; }).length;
      score += (style.style === 'summoner' ? 14 : 7) - mine * 3 - Math.max(0, spawned - 6) * 2;
    }
    if (foesHit >= 2) score += 2;
    if (typeof def.aiScore === 'function') {
      const ctx = DD.Targeting.buildCtx(unit, slot, target);
      const extra = DD.safe('aiScore of ' + def.id, def.aiScore, def, [ctx]);
      if (typeof extra === 'number' && isFinite(extra)) score += extra;
    }
    return score;
  }

  function nearestDist(p, list) {
    let best = Infinity;
    for (let i = 0; i < list.length; i++) { const d = Math.abs(p.x - list[i].x) + Math.abs(p.y - list[i].y); if (d < best) best = d; }
    return best;
  }

  /**
   * Hazard cost of walking pos.path (destination included) and then standing on pos, from DD.Grid.hazardDamage:
   * lethal when the immediate damage on the way would drop the unit before it could act; otherwise a penalty of
   * 5 per hazard tile + 1.5 per expected point of damage (+4 for ending the move on a hazard).
   */
  function pathRisk(unit, pos) {
    const path = pos.path || [];
    let enter = 0, tiles = 0;
    for (let i = 0; i < path.length; i++) {
      const hz = G().hazardDamage(path[i].x, path[i].y, unit);
      if (hz) { enter += hz.enter; tiles++; }
    }
    const here = G().hazardDamage(pos.x, pos.y, unit);
    return {
      lethal: enter > 0 && enter >= (unit.hp || 0) + (unit.block || 0),
      penalty: tiles * 5 + 1.5 * (enter + (here ? here.end : 0)) + (here ? 4 : 0),
    };
  }
  AI.pathRisk = pathRisk;

  function positionScore(unit, pos, style, foes, friends) {
    let sc = 0;
    const risk = pathRisk(unit, pos);
    if (risk.lethal) return -Infinity;
    sc -= risk.penalty;
    if (pos.edge) sc -= 1;
    const d = foes.length ? nearestDist(pos, foes) : 0;
    const lowHp = unit.hp < unit.maxHp * 0.5;
    switch (style.style) {
      case 'ranged': case 'summoner': {
        const keep = style.keepDistance || 3;
        if (d < keep) sc -= (keep - d) * 3; else sc -= (d - keep) * 0.25;
        const t = G().tile(pos.x, pos.y);
        if (t) sc += (t.h || 0) * 0.4;
        break;
      }
      case 'support': {
        if (friends.length) sc -= nearestDist(pos, friends) * 0.4;
        if (d < 2) sc -= 3;
        break;
      }
      case 'coward':
        sc += d * (lowHp ? 1.6 : 0.8);
        break;
      case 'kamikaze':
        sc -= d * 0.6;
        break;
      default:
        sc -= d * 0.3;
    }
    sc -= (pos.cost || 0) * 0.05;
    return sc;
  }

  function shapeReach(area, size) {
    switch (area && area.shape) {
      case 'circle': case 'ring': case 'cross': case 'row': return size;
      case 'square': return size * 2;
      case 'custom': return 2;
      default: return 0;
    }
  }

  /** Candidate targets from the unit's (possibly virtual) position for a slot. */
  function candidates(unit, slot, def, taunt) {
    const T = DD.Targeting;
    const tg = T.targetSpec(def);
    const out = [];
    if (tg.type === 'self') return [{ x: unit.x, y: unit.y }];
    function checkCanTarget(p) {
      if (typeof tg.canTarget !== 'function') return true;
      return DD.safe('canTarget of ' + def.id, tg.canTarget, def, [T.buildCtx(unit, slot, p)]) === true;
    }
    if (tg.type === 'dir') {
      for (let i = 0; i < 4; i++) {
        const p = { x: unit.x + U.DIRS[i].x, y: unit.y + U.DIRS[i].y };
        if (G().inBounds(p.x, p.y) && checkCanTarget(p)) out.push(p);
      }
      return out;
    }
    const rg = T.range(unit, def, slot.level);
    const los = tg.los !== false;
    function ok(x, y) {
      const d = Math.abs(x - unit.x) + Math.abs(y - unit.y);
      if (d < rg[0] || d > rg[1]) return false;
      if (tg.straight && x !== unit.x && y !== unit.y) return false;
      if (los && d > 0 && !G().los(unit, { x: x, y: y })) return false;
      return true;
    }
    const s = S();
    if (tg.type === 'unit') {
      const filter = tg.filter || 'enemy';
      for (let i = 0; i < s.units.length; i++) {
        const o = s.units[i];
        if (!T.unitMatches(unit, o, filter, true)) continue;
        if (filter === 'enemy' && !isFoe(unit, o, taunt)) continue;
        if (!ok(o.x, o.y)) continue;
        const p = { x: o.x, y: o.y };
        if (checkCanTarget(p)) out.push(p);
      }
      return out;
    }
    // tile targets: tiles around relevant units (or free tiles near the user for summons)
    const seen = {};
    const L = DD.skillLevel(def, slot.level);
    function consider(x, y) {
      const k = x + ',' + y;
      if (seen[k]) return;
      seen[k] = 1;
      if (!G().inBounds(x, y) || !ok(x, y) || !T.tileMatches(unit, x, y, tg.filter)) return;
      const p = { x: x, y: y };
      if (checkCanTarget(p)) out.push(p);
    }
    const shape = (def.area && def.area.shape) || 'single';
    if (isSummonSkill(def) && tg.filter === 'empty') {
      const near = G().emptyTilesNear(unit.x, unit.y, Math.max(1, rg[1]));
      for (let i = 0; i < near.length && out.length < 6; i++) consider(near[i].x, near[i].y);
      return out;
    }
    if (tg.filter === 'object') {
      // smash / use objects: every object in reach (aiScore or a protect objective gives them value)
      const tiles = s.grid.tiles;
      for (let i = 0; i < tiles.length && out.length < 40; i++) if (tiles[i].obj) consider(tiles[i].x, tiles[i].y);
      return out;
    }
    if (shape === 'single' && tg.filter === 'empty') {
      // teleports and traps: empty tiles around the foes and around the user (valued by the skill's aiScore)
      const foes = AI.targetsFor(unit);
      for (let a = 0; a < foes.length; a++) {
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (Math.abs(dx) + Math.abs(dy) <= 2) consider(foes[a].x + dx, foes[a].y + dy);
      }
      for (let i = 0; i < 4; i++) consider(unit.x + U.DIRS[i].x, unit.y + U.DIRS[i].y);
      return out;
    }
    if (shape === 'line' || shape === 'cone' || shape === 'adjacent' || shape === 'all_foes' || shape === 'all_allies') {
      for (let i = 0; i < 4; i++) {
        for (let k = Math.max(1, rg[0]); k <= rg[1]; k++) {
          const x = unit.x + U.DIRS[i].x * k, y = unit.y + U.DIRS[i].y * k;
          const before = out.length;
          consider(x, y);
          if (out.length > before) break;
        }
      }
      return out;
    }
    const size = Math.max(0, Math.floor(+DD.resolve(def.area && def.area.size, L, unit, 1) || 0));
    const reach = shapeReach(def.area, size);
    const anchors = isSupportSkill(def, L) ? S().units.filter(function (o) { return active(o) && !G().hostile(unit, o); }) : AI.targetsFor(unit);
    for (let a = 0; a < anchors.length; a++) {
      const o = anchors[a];
      for (let dy = -reach; dy <= reach; dy++) {
        const rem = reach - Math.abs(dy);
        for (let dx = -rem; dx <= rem; dx++) consider(o.x + dx, o.y + dy);
      }
    }
    return out;
  }

  /**
   * Best (move, skill, target) for a unit without committing. opts: { skills: [ids], noMove, style }.
   * Returns { moveTo: {x,y}, path, skillId, slot, target: {x,y}, score } | null.
   */
  AI.bestAttack = function (unit, opts) {
    opts = opts || {};
    if (!active(unit)) return null;
    const style = opts.style || styleOf(unit);
    const taunt = taunter(unit);
    const slots = usableSlots(unit, opts.skills);
    if (!slots.length) return null;
    const foes = AI.targetsFor(unit);
    const friends = S().units.filter(function (o) { return active(o) && o !== unit && !G().hostile(unit, o); });
    const positions = [{ x: unit.x, y: unit.y, cost: 0, path: [], hazard: null, edge: G().isEdge(unit.x, unit.y) }];
    if (!opts.noMove && !noMove(unit)) {
      DD.Grid.reachable(unit, DD.Combat.effectiveMov(unit)).forEach(function (e) { positions.push(e); });
    }
    let best = null;
    const ox = unit.x, oy = unit.y;
    try {
      for (let p = 0; p < positions.length; p++) {
        const pos = positions[p];
        unit.x = pos.x; unit.y = pos.y;
        const ps = positionScore(unit, pos, style, foes, friends);
        for (let i = 0; i < slots.length; i++) {
          const def = skillOf(slots[i].id);
          const cands = candidates(unit, slots[i], def, taunt);
          for (let c = 0; c < cands.length; c++) {
            const sc = scoreAction(unit, slots[i], def, cands[c], style, taunt);
            if (!(sc > 0)) continue;
            const total = sc + ps;
            if (total > 0 && (!best || total > best.score)) best = { moveTo: { x: pos.x, y: pos.y }, path: pos.path, skillId: def.id, slot: slots[i], target: cands[c], score: total, actionScore: sc };
          }
        }
      }
    } finally { unit.x = ox; unit.y = oy; }
    if (best && style.style === 'coward' && unit.hp < unit.maxHp * 0.5 && best.actionScore < 10) return null;
    return best;
  };

  // ---- movement --------------------------------------------------------------------------------
  /** Walk along the cheapest path within the unit's movement, now (an AI move on its turn). */
  AI.moveTo = function (unit, x, y, path) {
    if (!active(unit) || noMove(unit)) return false;
    if (unit.x === x && unit.y === y) return true;
    const p = path && path.length ? path : G().path(unit, x, y, { maxCost: DD.Combat.effectiveMov(unit) });
    if (!p || !p.length) return false;
    const walked = DD.Act.moveAlong(unit, p);
    return walked.length > 0 && unit.x === x && unit.y === y;
  };

  /** Distance field (movement cost to reach a tile next to any of the targets) for approach moves. */
  function fieldTo(unit, targets) {
    const g = S().grid;
    const n = g.w * g.h;
    const dist = new Float64Array(n).fill(Infinity);
    const queue = [];
    targets.forEach(function (t) { const i = t.y * g.w + t.x; dist[i] = 0; queue.push(i); });
    // simple label-correcting search (maps are small)
    let head = 0;
    while (head < queue.length) {
      const i = queue[head++];
      const x = i % g.w, y = (i / g.w) | 0;
      for (let d = 0; d < 4; d++) {
        const nx = x + U.DIRS[d].x, ny = y + U.DIRS[d].y;
        if (!G().inBounds(nx, ny) || !G().isWalkable(nx, ny, unit)) continue;
        if (!G().canStep(unit, { x: nx, y: ny }, { x: x, y: y })) continue;
        const j = ny * g.w + nx;
        const c = dist[i] + G().stepCost(unit, { x: nx, y: ny }, { x: x, y: y }) + (G().hazardAt(nx, ny, unit) ? 3 : 0);
        if (c < dist[j]) { dist[j] = c; queue.push(j); }
      }
    }
    return dist;
  }

  function approach(unit, style) {
    if (noMove(unit)) return false;
    const foes = AI.targetsFor(unit);
    if (!foes.length) return false;
    const reach = G().reachable(unit, DD.Combat.effectiveMov(unit));
    if (!reach.size) return false;
    const g = S().grid;
    let best = null, bestScore;
    if (style.style === 'coward') {
      const here = nearestDist(unit, foes);
      reach.forEach(function (e) {
        const risk = pathRisk(unit, e);
        if (risk.lethal) return;
        const sc = nearestDist(e, foes) * 2 - risk.penalty - e.cost * 0.1;
        if (sc > here * 2 && (best === null || sc > bestScore)) { best = e; bestScore = sc; }
      });
    } else {
      const field = fieldTo(unit, foes);
      const keep = style.style === 'ranged' || style.style === 'summoner' ? style.keepDistance || 0 : 0;
      const hereVal = field[unit.y * g.w + unit.x];
      reach.forEach(function (e) {
        const risk = pathRisk(unit, e);
        if (risk.lethal) return;
        let v = field[e.y * g.w + e.x];
        if (!isFinite(v)) v = 200 + nearestDist(e, foes);
        if (keep && nearestDist(e, foes) < keep) v += (keep - nearestDist(e, foes)) * 2;
        v += risk.penalty + e.cost * 0.01;
        if (best === null || v < bestScore) { best = e; bestScore = v; }
      });
      if (best && isFinite(hereVal) && bestScore >= hereVal) best = null;
    }
    if (!best) return false;
    return AI.moveTo(unit, best.x, best.y, best.path);
  }

  function wander(unit) {
    const reach = G().reachable(unit, 2);
    const list = [];
    reach.forEach(function (e) { if (!G().hazardAt(e.x, e.y, unit) && !e.hazard) list.push(e); });
    if (!list.length) { DD.FX.text(unit, 'Baa.', { color: '#ffffff', size: 14 }); return; }
    const e = list[S().rng.int(0, list.length - 1)];
    AI.moveTo(unit, e.x, e.y, e.path);
    DD.FX.text(unit, 'Baa.', { color: '#ffffff', size: 14 });
  }

  // ---- intents: actions now, wind-ups later ----------------------------------------------------------
  /**
   * The hero-turn count a wind-up waits for before it may count down: a wind-up announced while the player is in
   * control (a hero-controlled turn, or deployment: the marked tiles can be deployed out of) is answerable at once;
   * one announced anywhere else (an AI turn, a turn start, a round start, combat start without deployment) needs one
   * more hero turn to start first. So two boss turns back to back (turnsPerRound 2) or a wind-up made in an onTurnStart
   * / onRoundStart hook never lands without the heroes getting a turn.
   */
  function heroWindow() {
    const s = S();
    if (!s) return 0;
    const c = s.current ? DD.Combat.byId(s.current) : null;
    const now = (!!c && DD.Combat.isPlayerControlled(c)) || s.phase === 'deploy';
    return (s.heroTurns || 0) + (now ? 0 : 1);
  }

  /**
   * Build an intent record (not stored). target: {x,y} or a Unit. opts: anchor ('self' | 'ground' | 'unit'), tiles,
   * label, icon, dmg, data, dir, level, noCooldown, turns (wind-ups). Starts the skill's cooldown unless noCooldown.
   * 'ground' intents freeze their tiles (and direction) right here: fixed tiles, even for shapes drawn from the user.
   */
  function buildIntent(unit, skillId, target, opts, windup) {
    opts = opts || {};
    const def = skillOf(skillId);
    if (!unit || !def) { DD.warn('AI: unknown skill "' + skillId + '"'); return null; }
    const slot = slotFor(unit, skillId);
    const level = opts.level || (slot ? slot.level : 1);
    const isUnit = target && target.id !== undefined && target.hp !== undefined;
    const tp = target ? { x: target.x, y: target.y } : { x: unit.x, y: unit.y };
    let anchor = opts.anchor || def.anchor || 'self';
    let dir = opts.dir || U.dirTo(unit, tp);
    if (!dir.x && !dir.y) dir = unit.lastDir || { x: -1, y: 0 };
    const turns = windup ? Math.max(1, Math.round(+(opts.turns || opts.delay) || 1)) : 0;
    const intent = {
      id: U.uid('int'), skillId: skillId, anchor: anchor, rel: null, abs: null, unitId: null, dir: { x: dir.x, y: dir.y },
      tiles: opts.tiles ? opts.tiles.map(function (p) { return Object.assign({}, p); }) : null,
      windup: !!windup, turnsLeft: turns, delay: turns, pending: !!windup,
      label: opts.label || def.name, icon: opts.icon || def.icon || '⚔️',
      dmg: opts.dmg !== undefined ? opts.dmg : intentDmg(unit, def, level), dmgAuto: opts.dmg === undefined, data: opts.data || {}, level: level,
      ownerId: unit.id, round: S() ? S().round : 0,
    };
    if (windup) intent.window = heroWindow();
    if (anchor === 'unit') {
      const tu = isUnit ? target : G().unitAt(tp.x, tp.y);
      if (tu && !tu.dead) intent.unitId = tu.id;
      else { intent.anchor = anchor = 'ground'; }
    }
    if (anchor === 'ground') {
      intent.abs = { x: tp.x, y: tp.y };
      if (!intent.tiles) { intent.tiles = DD.Targeting.area(unit, def, level, tp, intent.dir); intent.autoTiles = true; }
    }
    if (anchor === 'self') intent.rel = { dx: tp.x - unit.x, dy: tp.y - unit.y };
    if (slot && !opts.noCooldown) {
      const cd = DD.Combat.cooldownOf(unit, def, level);
      slot.cd = cd;
      slot.fresh = cd > 0;
      slot.uses = (slot.uses || 0) + 1;
    }
    DD.Act.face(unit, tp);
    DD.Act.touch();
    return intent;
  }

  /**
   * Store a pending action on the unit (a wind-up resolving at the start of its next turn, or in opts.turns /
   * opts.delay of its turns), without announcing it. opts.noAdd: only build the record (an action for executeIntent).
   * Content normally uses AI.windUp (announced) or the planner api.
   */
  AI.makeIntent = function (unit, skillId, target, opts) {
    opts = opts || {};
    const it = buildIntent(unit, skillId, target, opts, !opts.noAdd);
    if (it && !opts.noAdd) unit.intents.push(it);
    return it;
  };

  /**
   * Boss wind-up: a visible pending action that resolves at the START of the unit's next turn (opts.turns: of its
   * turns, default 1). Fixed tiles by default ('ground': the area now); opts.track (or anchor 'unit') follows the target
   * unit (fizzles out of range / sight), anchor 'self' follows the boss. Announced (FX text + 'windup' marker, log,
   * 'windup:start' event; opts.banner: a banner too). Stun / sleep / frozen / sheep / death interrupts it.
   * Other opts as AI.makeIntent (tiles, label, icon, dmg, data, dir, level, noCooldown). Returns the intent or null.
   */
  AI.windUp = function (unit, skillId, target, opts) {
    opts = Object.assign({}, opts || {});
    if (!active(unit)) return null;
    if (!opts.anchor) opts.anchor = opts.track ? 'unit' : 'ground';
    const it = buildIntent(unit, skillId, target, opts, true);
    if (!it) return null;
    unit.intents.push(it);
    const tiles = AI.intentTiles(unit, it);
    DD.FX.text(unit, '⏳ ' + it.label + '!', { color: '#ff8a5c', size: 16 });
    DD.FX.custom('windup', { unitId: unit.id, intentId: it.id, label: it.label, tiles: tiles.map(function (p) { return { x: p.x, y: p.y }; }), ms: 0 });
    if (opts.banner) DD.FX.banner('⏳ ' + it.label, { sub: typeof opts.banner === 'string' ? opts.banner : unit.name + ' winds up!' });
    DD.Act.log(unit.name + ' winds up ' + it.label + (it.turnsLeft > 1 ? ' (lands in ' + it.turnsLeft + ' of its turns)!' : ' (lands at the start of its next turn)!'), 'enemy');
    DD.Act.emit('windup:start', { unit: unit, unitId: unit.id, intent: it });
    return it;
  };

  /**
   * Do it now: build the action and execute it at once (taunt / dazzle / confuse / silence apply). Returns the intent
   * record (resolved: whether it fired) or null.
   */
  AI.useNow = function (unit, skillId, target, opts) {
    if (!active(unit)) return null;
    const it = buildIntent(unit, skillId, target, opts || {}, false);
    if (!it) return null;
    it.resolved = AI.executeIntent(unit, it);
    return it;
  };

  /** Planner api addIntent / setIntent (v2): delay / turns / windup → a wind-up, else the action happens now. */
  function compatIntent(unit, skillId, target, opts) {
    opts = opts || {};
    if ((opts.delay || 0) > 0 || (opts.turns || 0) > 0 || opts.windup) {
      const o = Object.assign({}, opts, { turns: opts.turns || opts.delay || 1 });
      if (!o.anchor) { const d = skillOf(skillId); o.anchor = (d && d.anchor) || 'self'; }
      return AI.windUp(unit, skillId, target, o);
    }
    return AI.useNow(unit, skillId, target, opts);
  }

  /** keepDelayed (compat): keep the wind-ups (every stored intent is one in v2), i.e. clear nothing. */
  AI.clearIntents = function (unit, keepDelayed) {
    if (!unit) return;
    unit.intents = keepDelayed ? (unit.intents || []).filter(function (i) { return i.windup || i.delay > 0 || i.pending; }) : [];
    DD.Act.touch();
  };

  /** A tracked unit the shot can no longer follow: gone, downed, or a stealthed foe (§4.4 stealth). */
  function lostTrack(unit, t) {
    return !active(t) || (G().hostile(unit, t) && has(t, 'stealth'));
  }

  /** Current target tile of an intent (after pushes); null if a tracked unit is gone or stealthed. */
  AI.intentTarget = function (unit, intent) {
    if (!unit || !intent) return null;
    if (intent.anchor === 'ground') return intent.abs ? { x: intent.abs.x, y: intent.abs.y } : null;
    if (intent.anchor === 'unit') {
      const t = DD.Combat.byId(intent.unitId);
      return lostTrack(unit, t) ? null : { x: t.x, y: t.y };
    }
    const r = intent.rel || { dx: 0, dy: 0 };
    return { x: unit.x + (r.dx || 0), y: unit.y + (r.dy || 0) };
  };

  function currentDir(unit, intent, tp) {
    if (intent.anchor === 'self' || intent.anchor === 'ground' || !tp) return intent.dir;
    const d = U.dirTo(unit, tp);
    return d.x || d.y ? d : intent.dir;
  }

  function explicitTiles(unit, intent, tp) {
    if (intent.anchor === 'ground') return intent.tiles.map(function (p) { return { x: p.x, y: p.y }; });
    const base = intent.anchor === 'unit' ? tp : { x: unit.x, y: unit.y };
    return intent.tiles.map(function (p) { return { x: base.x + (p.dx || 0), y: base.y + (p.dy || 0) }; });
  }

  /** Current area tiles of an intent (follows the unit for 'self' anchors). Pure: drawn every frame. */
  AI.intentTiles = function (unit, intent) {
    if (!unit || !intent) return [];
    const tp = AI.intentTarget(unit, intent);
    if (!tp) return [];
    if (intent.tiles) return explicitTiles(unit, intent, tp).filter(function (p) { return G().inBounds(p.x, p.y); });
    const def = skillOf(intent.skillId);
    if (!def) return [];
    return DD.Targeting.area(unit, def, intent.level || 1, tp, currentDir(unit, intent, tp));
  };

  function intentHits(unit, intent, t) {
    const tiles = AI.intentTiles(unit, intent);
    for (let i = 0; i < tiles.length; i++) if (tiles[i].x === t.x && tiles[i].y === t.y) return true;
    return false;
  }

  /** Point an intent at a unit if the skill can reach it from where the unit stands; false if it can't. */
  function redirect(unit, intent, t) {
    const def = skillOf(intent.skillId);
    if (!def || !active(t)) return false;
    if (intentHits(unit, intent, t)) return true;
    const T = DD.Targeting;
    const tg = T.targetSpec(def);
    const d = G().dist(unit, t);
    if (tg.type === 'self') return false;
    if (tg.type === 'dir') {
      const shape = def.area && def.area.shape;
      if (d !== 1 && !((shape === 'line' || shape === 'cone') && (t.x === unit.x || t.y === unit.y))) return false;
      const dir = U.dirTo(unit, t);
      intent.anchor = 'self';
      intent.rel = { dx: dir.x, dy: dir.y };
      intent.dir = dir;
      intent.tiles = null;
      intent.autoTiles = false;
      return intentHits(unit, intent, t);
    }
    const rg = T.range(unit, def, intent.level || 1);
    if (d < rg[0] || d > rg[1]) return false;
    if (tg.los !== false && !G().los(unit, t)) return false;
    if (tg.straight && t.x !== unit.x && t.y !== unit.y) return false;
    const old = AI.intentTarget(unit, intent);
    const nd = U.dirTo(unit, t);
    if (nd.x || nd.y) intent.dir = nd;
    if (intent.anchor === 'unit') intent.unitId = t.id;
    else if (intent.anchor === 'ground') {
      // engine-frozen areas are re-drawn at the new target; explicit content tiles are moved along with it
      if (intent.autoTiles) intent.tiles = DD.Targeting.area(unit, def, intent.level || 1, t, intent.dir);
      else if (intent.tiles && old) { const dx = t.x - old.x, dy = t.y - old.y; intent.tiles = intent.tiles.map(function (p) { return { x: p.x + dx, y: p.y + dy }; }); }
      intent.abs = { x: t.x, y: t.y };
    } else intent.rel = { dx: t.x - unit.x, dy: t.y - unit.y };
    intent.data = intent.data || {};
    intent.data.redirected = true;
    // a pattern that still misses the unit does not count
    return intentHits(unit, intent, t);
  }
  /** Re-aim an intent (e.g. a wind-up) at unit t if its skill can reach t from where the owner stands. */
  AI.redirectIntent = redirect;

  /**
   * Interrupt (drop) a unit's pending wind-ups with feedback. opts.keepUnstoppable: keep those whose data says
   * unstoppable (content that must fire whatever its owner's state). Returns how many were dropped.
   */
  AI.cancelIntents = function (unit, reason, opts) {
    if (!unit || !unit.intents || !unit.intents.length) return 0;
    const keep = opts && opts.keepUnstoppable ? unit.intents.filter(function (it) { return it && it.data && it.data.unstoppable; }) : [];
    const n = unit.intents.length - keep.length;
    if (!n) return 0;
    unit.intents = keep;
    DD.Act.touch();
    DD.FX.text(unit, reason || 'Interrupted!', { color: '#ffe14d', size: 15 });
    DD.Act.log(unit.name + '\'s wind-up is interrupted' + (reason ? ' (' + String(reason).replace(/!$/, '') + ')' : '') + '.', 'status');
    DD.Act.emit('windup:cancel', { unit: unit, unitId: unit.id, reason: reason || null });
    return n;
  };

  // ---- execution ----------------------------------------------------------------------------------
  function fizzle(unit, text) {
    DD.FX.text(unit, text, { color: '#d0d0d0', size: 15 });
    DD.Act.log(unit.name + ': ' + text, 'enemy');
  }
  /** An attack the taunt rule applies to: it deals damage or aims at foes. */
  function offensive(def, level) {
    const L = DD.skillLevel(def, level || 1);
    return !!(L && L.dmg > 0) || def.kind === 'attack' || (def.target && def.target.filter === 'enemy');
  }

  /**
   * Execute an action or a due wind-up now. Wind-ups (and data.unstoppable) ignore taunt; a taunted unit's own action
   * must reach the taunter (it is re-aimed if the skill can) or it fizzles. Then: a tracked shot needs range and (unless
   * target.los === false) sight; confused → a quarter turn; dazzled → 1 tile off; silenced spells fizzle. Returns true
   * if the skill resolved.
   */
  AI.executeIntent = function (unit, intent) {
    const s = S();
    if (!active(unit) || !intent) return false;
    const idx = unit.intents ? unit.intents.indexOf(intent) : -1;
    if (idx >= 0) unit.intents.splice(idx, 1);
    const def = skillOf(intent.skillId);
    if (!def) return false;
    const sure = !!(intent.data && intent.data.unstoppable);
    if (!sure && (stunned(unit) || has(unit, 'sheep'))) { fizzle(unit, has(unit, 'sheep') ? 'Baa?' : 'Interrupted!'); return false; }
    if (!sure && def.kind === 'spell' && has(unit, 'silenced')) { fizzle(unit, 'Silenced!'); return false; }
    if (!sure && !intent.windup) {
      const taunt = taunter(unit);
      if (taunt && G().hostile(unit, taunt) && offensive(def, intent.level) && !redirect(unit, intent, taunt)) { fizzle(unit, 'Taunted, can\'t reach!'); return false; }
    }
    let tp = AI.intentTarget(unit, intent);
    if (!tp) { fizzle(unit, 'Lost track of them!'); return false; }
    if (intent.anchor === 'unit') {
      const tg = DD.Targeting.targetSpec(def);
      const rg = DD.Targeting.range(unit, def, intent.level || 1);
      const d = G().dist(unit, tp);
      if (d < rg[0] || d > rg[1] || (tg.los !== false && d > 0 && !G().los(unit, tp))) { fizzle(unit, 'Lost track of them!'); return false; }
    }
    let dir = currentDir(unit, intent, tp);
    let tiles = intent.tiles ? explicitTiles(unit, intent, tp) : null;
    if (has(unit, 'confused') && !sure) {
      // a quarter turn around the attacker (areas drawn from the target are re-drawn in the new direction)
      const k = s.rng.chance(0.5) ? 1 : 3;
      const rel = U.rotateDir({ x: tp.x - unit.x, y: tp.y - unit.y }, k);
      tp = { x: unit.x + rel.x, y: unit.y + rel.y };
      dir = U.rotateDir(dir, k);
      if (tiles) tiles = tiles.map(function (p) { const r = U.rotateDir({ x: p.x - unit.x, y: p.y - unit.y }, k); return { x: unit.x + r.x, y: unit.y + r.y }; });
      DD.FX.text(unit, '😵 Confused!', { color: '#d77bff', size: 14 });
    }
    if (!tiles) tiles = DD.Targeting.area(unit, def, intent.level || 1, tp, dir);
    if (has(unit, 'dazzled') && !sure) {
      // the whole attack lands one tile off, whatever its shape (cones and lines drawn from the attacker too)
      const d4 = U.DIRS[s.rng.int(0, 3)];
      tp = { x: tp.x + d4.x, y: tp.y + d4.y };
      tiles = tiles.map(function (p) { return { x: p.x + d4.x, y: p.y + d4.y }; });
      DD.FX.text(unit, '✨ Dazzled!', { color: '#fff3a3', size: 14 });
    }
    tiles = tiles.filter(function (p) { return G().inBounds(p.x, p.y); });
    const slot = slotFor(unit, intent.skillId);
    DD.Combat.resolveSkill(unit, slot || def, tp, { extra: { isIntent: true, intent: intent, tiles: tiles, dir: dir } });
    return true;
  };

  /**
   * Start of the unit's turn (DD.Combat): every wind-up counts one of its turns down; due ones resolve now unless the
   * unit is stunned / asleep / frozen / polymorphed (interrupted; data.unstoppable fires anyway). A wind-up only counts
   * down once a hero turn has started since it was announced (or last counted down): see heroWindow. Returns how many
   * fired.
   */
  AI.resolveWindups = function (unit) {
    if (!unit || !unit.intents || !unit.intents.length) return 0;
    const s = S();
    let n = 0;
    const list = unit.intents.slice();
    for (let i = 0; i < list.length; i++) {
      const it = list[i];
      if (s.result || !active(unit)) break;
      if (unit.intents.indexOf(it) < 0) continue;
      // no hero turn since it was announced: the heroes get their window first (it keeps its turnsLeft)
      if (typeof it.window === 'number' && (s.heroTurns || 0) < it.window) continue;
      const left = Math.max(0, (it.turnsLeft !== undefined && it.turnsLeft !== null ? it.turnsLeft : (it.delay || 1)) - 1);
      it.turnsLeft = left;
      it.delay = left;
      it.window = (s.heroTurns || 0) + 1;
      DD.Act.touch();
      if (left > 0) {
        DD.FX.text(unit, '⏳ ' + it.label + ' (' + left + ')...', { color: '#ffcf7a', size: 14 });
        DD.Act.log(unit.name + ' keeps winding up ' + it.label + '...', 'enemy');
        continue;
      }
      if (!(it.data && it.data.unstoppable) && (stunned(unit) || has(unit, 'sheep'))) {
        unit.intents.splice(unit.intents.indexOf(it), 1);
        fizzle(unit, it.label + ': interrupted!');
        continue;
      }
      if (AI.executeIntent(unit, it)) n++;
    }
    return n;
  };

  /** Every pending wind-up on the board, for the HUD / renderer: [{ unit, unitId, intent, tiles, turnsLeft, label, icon, dmg, skillId }]. */
  AI.windups = function () {
    const s = S();
    if (!s) return [];
    return DD.Targeting.pure(function () {
      const out = [];
      s.units.forEach(function (u) {
        if (!active(u) || !u.intents || !u.intents.length) return;
        u.intents.forEach(function (it) {
          out.push({ unit: u, unitId: u.id, intent: it, tiles: AI.intentTiles(u, it), turnsLeft: it.turnsLeft || it.delay || 1,
            label: it.label, icon: it.icon, dmg: AI.intentDmg(u, it), skillId: it.skillId });
        });
      });
      return out;
    });
  };

  // ---- the AI turn ---------------------------------------------------------------------------------
  /** Default turn: the best scored attack (walking first if needed), else approach / keep distance and try again. */
  function defaultTurn(unit, style) {
    style = style || styleOf(unit);
    const best = AI.bestAttack(unit, { style: style });
    if (best) {
      const moved = best.moveTo.x === unit.x && best.moveTo.y === unit.y ? true : AI.moveTo(unit, best.moveTo.x, best.moveTo.y, best.path);
      if (!active(unit) || stunned(unit) || has(unit, 'sheep')) return null;
      if (!moved) {
        // the walk was interrupted (trap, web...): aim again from where it ended up
        const again = AI.bestAttack(unit, { style: style, noMove: true });
        return again ? AI.useNow(unit, again.skillId, aimAt(unit, again), {}) : null;
      }
      return AI.useNow(unit, best.skillId, aimAt(unit, best), {});
    }
    approach(unit, style);
    if (!active(unit) || stunned(unit) || has(unit, 'sheep')) return null;
    const after = AI.bestAttack(unit, { style: style, noMove: true });
    return after ? AI.useNow(unit, after.skillId, aimAt(unit, after), {}) : null;
  }
  /** style: optional override ('melee' | { style, keepDistance }), else styleOf(unit). */
  function styleArg(unit, style) { return (style && styleSpec(style)) || styleOf(unit); }
  /** The default turn (v2: decides and acts now). Returns the action's intent record or null. */
  AI.defaultPlan = function (unit, style) { return defaultTurn(unit, styleArg(unit, style)); };
  AI.defaultTurn = AI.defaultPlan;
  /** Approach the unit's foes (or keep distance / flee, by style) with one move now. Returns true if it moved. */
  AI.approach = function (unit, style) { return active(unit) ? !!approach(unit, styleArg(unit, style)) : false; };

  /** 'unit'-anchored skills track the unit standing on the chosen tile. */
  function aimAt(unit, choice) {
    const def = skillOf(choice.skillId);
    if (def && def.anchor === 'unit') {
      const u = G().unitAt(choice.target.x, choice.target.y);
      if (u && active(u)) return u;
    }
    return choice.target;
  }

  /**
   * The api a custom planner def.ai(unit, api) gets on the unit's turn (§5.6). act / addIntent / setIntent happen now
   * (addIntent with delay / turns / windup: a wind-up); windUp records a boss wind-up; moveTo walks now.
   */
  function makeApi(unit) {
    const s = S();
    const entry = s.order && s.turnIndex >= 0 ? s.order[s.turnIndex] : null;
    return {
      state: s, rng: s.rng, round: s.round, unit: unit, entry: entry ? Object.assign({}, entry) : null,
      heroes: function () { return DD.Combat.active('hero'); },
      foes: function (u) { return AI.targetsFor(u || unit); },
      friends: function (u) { return DD.Combat.friendsOf(u || unit); },
      reachable: function (u) { u = u || unit; return noMove(u) ? new Map() : G().reachable(u, DD.Combat.effectiveMov(u)); },
      moveTo: function (u, x, y) { return AI.moveTo(u, x, y); },
      act: function (u, skillId, target, opts) { const it = AI.useNow(u || unit, skillId, target, opts); return !!(it && it.resolved); },
      windUp: function (u, skillId, target, opts) { return AI.windUp(u || unit, skillId, target, opts); },
      setIntent: function (u, skillId, target, opts) { return compatIntent(u || unit, skillId, target, opts); },
      addIntent: function (u, skillId, target, opts) { return compatIntent(u || unit, skillId, target, opts); },
      clearIntents: function (u) { AI.clearIntents(u || unit, false); },
      bestAttack: function (u, opts) { return AI.bestAttack(u, opts); },
      defaultPlan: function (u, style) { return defaultTurn(u || unit, styleArg(u || unit, style)); },
      defaultTurn: function (u, style) { return defaultTurn(u || unit, styleArg(u || unit, style)); },
      approach: function (u, style) { return AI.approach(u || unit, style); },
      tilesFor: function (u, skillId, target) {
        const d = skillOf(skillId);
        const sl = slotFor(u, skillId);
        return d && target ? DD.Targeting.area(u, d, sl ? sl.level : 1, target) : [];
      },
      canUse: function (u, skillId) { return usableSlots(u, [skillId]).length > 0; },
      slot: function (u, skillId) { return slotFor(u, skillId); },
      dist: function (a, b) { return G().dist(a, b); },
      los: function (a, b) { return G().los(a, b); },
      randomEmptyTile: function (filter) { return G().randomEmptyTile(s.rng, filter); },
      style: styleOf(unit),
    };
  }
  AI.api = makeApi;

  /**
   * The unit's turn body (DD.Combat calls it on AI turns; tests may call it directly): a stun-like loses the turn, a
   * sheep wanders, else the custom planner or the default turn decides and acts at once. Returns true if it acted.
   */
  AI.act = function (unit) {
    const s = S();
    if (!s || s.result || !active(unit)) return false;
    if (stunned(unit)) {
      const st = unit.statuses.filter(function (x) { return DD.Act.isStunLike(x.id); })[0];
      const d = st ? DD.getStatus(st.id) : null;
      DD.FX.text(unit, has(unit, 'sleep') ? 'Zzz...' : (d ? d.name : 'Stunned') + '!', { color: '#ffe14d', size: 15 });
      DD.Act.log(unit.name + ' loses the turn (' + (d ? d.name : 'Stunned') + ').', 'status');
      return false;
    }
    if (has(unit, 'sheep')) { wander(unit); return true; }
    const def = defOf(unit);
    if (def && typeof def.ai === 'function') DD.safe('AI planner of ' + def.id, def.ai, def, [unit, makeApi(unit)]);
    else defaultTurn(unit, styleOf(unit));
    return true;
  };

  // ---- reach estimates (HUD threat shading, AutoPlay) ---------------------------------------------------
  function areaExtent(shape, size) {
    switch (shape) {
      case 'circle': case 'cross': case 'ring': case 'row': return size;
      case 'square': return 2 * size;
      case 'custom': return 2;
      case 'adjacent': return 1;
      default: return 0;
    }
  }
  /** How far from where the unit stands a skill can deal damage (range + area; 99 = anywhere). */
  function skillReach(unit, def, level, L) {
    const tg = DD.Targeting.targetSpec(def);
    const shape = (def.area && def.area.shape) || 'single';
    const size = Math.max(0, Math.floor(+DD.resolve(def.area && def.area.size, L, unit, 1) || 0));
    if (shape === 'all_foes') return 99;
    if (shape === 'line') return Math.max(size, tg.type === 'tile' || tg.type === 'unit' ? DD.Targeting.range(unit, def, level)[1] : 1);
    if (shape === 'cone') return Math.max(1, 2 * size - 1);
    if (tg.type === 'self') return areaExtent(shape, size);
    if (tg.type === 'dir') return 1 + areaExtent(shape, size);
    return DD.Targeting.range(unit, def, level)[1] + areaExtent(shape, size);
  }
  /**
   * Where an AI unit could strike on its next turn (an estimate: its move, then the reach of its damaging skills that
   * are ready by then; walls and sight ignored past the walk): { tiles: Map 'x,y' → best damage number, best, only,
   * unitId } (only: the taunter's id while taunted). Empty for units that lose their next turn (stun-likes), sheep
   * and units without a damaging skill.
   */
  AI.reachOf = function (unit) {
    const out = { tiles: new Map(), best: 0, only: null, unitId: unit ? unit.id : null };
    if (!active(unit) || stunned(unit) || has(unit, 'sheep')) return out;
    const skills = [];
    DD.Combat.slotsOf(unit).forEach(function (sl) {
      const d = skillOf(sl.id);
      if (!d) return;
      if (d.charges > 0 && (sl.uses || 0) >= d.charges) return;
      if ((sl.cd || 0) > 1 || ((sl.cd || 0) === 1 && sl.fresh)) return;   // still cooling down on its next turn
      if (d.kind === 'spell' && has(unit, 'silenced')) return;
      const L = DD.skillLevel(d, sl.level);
      if (!L || !(L.dmg > 0)) return;
      skills.push({ dmg: intentDmg(unit, d, sl.level), reach: skillReach(unit, d, sl.level, L) });
    });
    if (!skills.length) return out;
    let maxReach = 0;
    skills.forEach(function (k) { if (k.reach > maxReach) maxReach = k.reach; if (k.dmg > out.best) out.best = k.dmg; });
    const g = S().grid;
    const dist = new Int16Array(g.w * g.h).fill(-1), q = [];
    const startAt = function (x, y) { const i = y * g.w + x; if (dist[i] < 0) { dist[i] = 0; q.push(i); } };
    startAt(unit.x, unit.y);
    if (!noMove(unit)) DD.Grid.reachable(unit, DD.Combat.effectiveMov(unit)).forEach(function (e) { startAt(e.x, e.y); });
    const cap = Math.min(maxReach, g.w + g.h);
    for (let h = 0; h < q.length; h++) {
      const i = q[h], d = dist[i];
      if (d >= cap) continue;
      const x = i % g.w, y = (i / g.w) | 0;
      for (let k = 0; k < 4; k++) {
        const nx = x + U.DIRS[k].x, ny = y + U.DIRS[k].y;
        if (nx < 0 || ny < 0 || nx >= g.w || ny >= g.h) continue;
        const j = ny * g.w + nx;
        if (dist[j] < 0) { dist[j] = d + 1; q.push(j); }
      }
    }
    for (let i = 0; i < dist.length; i++) {
      const d = dist[i];
      if (d < 0) continue;
      let best = 0;
      for (let k = 0; k < skills.length; k++) if (skills[k].reach >= d && skills[k].dmg > best) best = skills[k].dmg;
      if (maxReach >= 99) best = Math.max(best, out.best);
      if (best > 0) out.tiles.set((i % g.w) + ',' + ((i / g.w) | 0), best);
    }
    const t = taunter(unit);
    if (t) out.only = t.id;
    return out;
  };
  /**
   * Tiles the AI units hostile to `side` (default 'hero') could hit on their next turns (AI.reachOf of each; wind-ups
   * are separate, see AI.windups): Map 'x,y' → { dmg (sum), max, from: [unitIds] }.
   */
  AI.threatMap = function (side) {
    side = side || 'hero';
    const s = S(), map = new Map();
    if (!s) return map;
    DD.Targeting.pure(function () {
      s.units.forEach(function (e) {
        if (!active(e) || DD.Combat.isPlayerControlled(e) || G().effectiveSide(e) === side) return;
        AI.reachOf(e).tiles.forEach(function (dmg, k) {
          let c = map.get(k);
          if (!c) map.set(k, c = { dmg: 0, max: 0, from: [] });
          c.dmg += dmg; c.max = Math.max(c.max, dmg); c.from.push(e.id);
        });
      });
    });
    return map;
  };

  // ---- HUD text --------------------------------------------------------------------------------------
  /**
   * Wind-up damage right now: the planned number, re-evaluated with the attacker's current modifiers (Weak,
   * Inspired, Empowered...) unless content set an explicit `dmg` on the intent.
   */
  AI.intentDmg = function (unit, intent) {
    if (!intent) return 0;
    if (!intent.dmgAuto) return intent.dmg || 0;
    const def = skillOf(intent.skillId);
    if (!def || !unit) return intent.dmg || 0;
    const v = intentDmg(unit, def, intent.level || 1);
    if (!(v > 0)) return v;
    // A skill may declare a pure telegraphFlat(unit, intent) → number for flat bonuses that depend on the target
    // (pack tactics, vendetta...), added like d.flat so the number tells the truth; and so may a rule in state.rules:
    // telegraphFlat(unit, intent, rule) → number, for fight-wide flat changes ("+2 to every attack").
    let flat = typeof def.telegraphFlat === 'function' ? Number(DD.safe('telegraphFlat of ' + def.id, def.telegraphFlat, def, [unit, intent])) || 0 : 0;
    flat += ruleFlat(unit, intent);
    return Math.max(0, v + flat);
  };
  function ruleFlat(unit, intent) {
    const s = S();
    const rules = (s && s.rules) || [];
    let f = 0;
    for (let i = 0; i < rules.length; i++) {
      const r = rules[i];
      if (r && typeof r.telegraphFlat === 'function') f += Number(DD.safe('telegraphFlat of rule ' + r.id, r.telegraphFlat, r, [unit, intent, r])) || 0;
    }
    return f;
  }
  AI.ruleFlat = ruleFlat;

  /** { label, icon, dmg, text, uncertain, delay, turnsLeft, windup, targetName } for the HUD inspect panel / badges. */
  AI.describe = function (unit, intent) {
    if (!unit || !intent) return { label: '?', icon: '❔', dmg: 0, text: '', uncertain: false, delay: 0, turnsLeft: 0, windup: false, targetName: null };
    return DD.Targeting.pure(function () { return describe(unit, intent); });
  };
  function describe(unit, intent) {
    const def = skillOf(intent.skillId);
    const parts = [];
    let targetName = null;
    const left = intent.turnsLeft || intent.delay || 1;
    const sure = !!(intent.data && intent.data.unstoppable);
    parts.push(left > 1 ? '⏳ Wind-up: lands in ' + left + ' of ' + unit.name + '\'s turns.' : '⏳ Wind-up: lands at the start of ' + unit.name + '\'s next turn.');
    if (def) parts.push(def.name + ': ' + DD.skillDesc(def, intent.level || 1, unit));
    if (intent.anchor === 'self') parts.push('Aimed relative to ' + unit.name + ': push it and the attack moves with it.');
    else if (intent.anchor === 'ground') parts.push('Hits the marked tiles. Get out of the red.');
    else {
      const t = DD.Combat.byId(intent.unitId);
      targetName = t ? t.name : null;
      if (t && active(t) && G().hostile(unit, t) && has(t, 'stealth')) parts.push(t.name + ' is stealthed: this shot will lose track.');
      // a target.los === false skill ignores line of sight, so it only fizzles out of range
      else parts.push('Tracks ' + (t ? t.name : 'its target') + '; fizzles if out of ' + (def && def.target && def.target.los === false ? 'range.' : 'range or sight.'));
    }
    const uncertain = has(unit, 'dazzled') || has(unit, 'confused');
    if (has(unit, 'dazzled')) parts.push('? Dazzled: will land 1 tile off.');
    if (has(unit, 'confused')) parts.push('? Confused: will swing a quarter turn off.');
    if (has(unit, 'charmed')) parts.push('Charmed: it now fights for your side.');
    // intent.data.unstoppable: content fires it whatever state its owner is in (the DM's diverted train)
    if (stunned(unit) && !sure) parts.push('Incapacitated: this will not happen.');
    else if (!sure) parts.push('Stun, sleep, freeze or polymorph ' + unit.name + ' to interrupt it.');
    if (def && def.kind === 'spell' && has(unit, 'silenced') && !sure) parts.push('Silenced: this spell will fizzle.');
    return {
      label: intent.label || (def ? def.name : '?'), icon: intent.icon || (def ? def.icon : '⚔️'),
      dmg: AI.intentDmg(unit, intent), text: parts.join(' '), uncertain: uncertain, delay: left, turnsLeft: left, windup: true,
      targetName: targetName,
    };
  }
})();
