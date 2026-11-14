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
 * v2 targeting: reach-aware - what it can hit THIS turn (walk cost, LOS, attacks of opportunity its walk would provoke as
 * a cost, never a lethal one); foes it is engaged with first, then threat and damage, low HP only a tiebreak; divers
 * ('assassin' / 'skirmisher') go for the weak. Walks are move actions (fewest-provoke paths; they provoke).
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
  /**
   * The taunter whose taunt binds u now, or null. [engine requests, hero-betty] A taunt from a unit that is no longer
   * its foe is void: a hero's taunt on an enemy Charmed to fight for the heroes would otherwise waste the charm.
   */
  function activeTaunter(u) { const t = taunter(u); return t && G().hostile(u, t) ? t : null; }
  AI.activeTaunter = activeTaunter;
  /** Units the AI wants to hurt: hostile, active, not stealthed; only the taunter while taunted. */
  AI.targetsFor = function (u) {
    const t = activeTaunter(u);
    if (t) return [t];
    return S().units.filter(function (o) { return active(o) && G().hostile(u, o) && !has(o, 'stealth'); });
  };
  function isFoe(u, o, taunt) {
    if (!active(o) || !G().hostile(u, o) || has(o, 'stealth')) return false;
    return !taunt || o === taunt;
  }

  // v2 targeting (DESIGN §8 "Targeting"): divers go for the weak; everyone else sticks to the foe it is engaged with
  const DIVERS = { assassin: 1, skirmisher: 1 };
  // bonus for hitting a foe that stood next to it at the start of its turn ("engaged"), by style
  const ENGAGED = { melee: 4, kamikaze: 4, support: 2, summoner: 1, ranged: 1, coward: 0, assassin: 0, skirmisher: 0 };
  function isDiver(style) { return !!(style && DIVERS[style.style]); }

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

  /**
   * [engine requests, bosses / act 2-3] Declarative skill flags: `windupOnly: true` (or the tag 'windup') = a skill its
   * planner only ever winds up: the default planner never uses it at once (unless a planner names it in opts.skills),
   * it is no attack of opportunity and reach estimates skip it (its marked tiles show it). `fromStand: true` = it only
   * goes off from where the unit stands (a leap, a charge, a scream): the default planner never walks first to use it
   * and reach estimates don't add the unit's walk to it.
   */
  function windupOnly(def) { return !!def && (def.windupOnly === true || (def.tags || []).indexOf('windup') >= 0); }
  function fromStand(def) { return !!def && def.fromStand === true; }
  AI.windupOnly = windupOnly;
  AI.fromStand = fromStand;

  function usableSlots(unit, onlyIds) {
    return DD.Combat.slotsOf(unit).filter(function (sl) {
      const d = skillOf(sl.id);
      if (!d) return false;
      if (onlyIds && onlyIds.indexOf(sl.id) < 0) return false;
      if (!onlyIds && windupOnly(d)) return false;
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
  // Which units have sources declaring the estimate query hooks (1 estimateDealt, 2 estimateTaken) or statuses declaring
  // takenFlat (4): cached per state and mutation counter, because the estimate runs thousands of times per decision.
  const estCache = new WeakMap();
  function estFlags(u) {
    const s = S();
    if (!s || !u) return 0;
    let c = estCache.get(s);
    const m = s.mutations || 0;
    if (!c || c.m !== m) { c = { m: m, by: {} }; estCache.set(s, c); }
    let v = c.by[u.id];
    if (v !== undefined) return v;
    v = 0;
    DD.Hooks.each(u, function (hooks) {
      if (typeof hooks.estimateDealt === 'function') v |= 1;
      if (typeof hooks.estimateTaken === 'function') v |= 2;
      return false;
    });
    const sts = u.statuses || [];
    for (let i = 0; i < sts.length; i++) { const sd = DD.getStatus(sts[i].id); if (sd && sd.takenFlat !== undefined && sd.takenFlat !== null) v |= 4; }
    c.by[u.id] = v;
    return v;
  }

  /**
   * Damage of `dmg` from u to o, as Act.damage would deal it: round(dmg × multipliers + flats), then Marked, armor (no
   * Block). Reads the attacker's multipliers (Weak, Inspired, Empowered, item dmg, difficulty; a hero's foreign taunt
   * −50%, its charmer 0), high ground, Vulnerable, statuses' takenMult and takenFlat, resist (0 = immune: flats don't
   * leak), Wet lightning, Frozen physical, invulnerability, and the pure query hooks estimateDealt(e) (the attacker's
   * sources) / estimateTaken(e) (the target's own sources) that mirror content's flat / mult damage hooks (Whetstone,
   * Ginger Rage, the Loincloth...): e = { attacker, target, skill, base, element, cause: 'skill', opportunity, mult: 1,
   * flat: 0 }. noEmpower: an attack of opportunity (Empowered is neither used nor consumed by it). skill: the def (for
   * hooks that only touch one skill). flat: extra flat bonus added after the multipliers (an attack of opportunity's
   * o.flat, the attacker's status telegraphFlat — the public AI.estimate leaves the latter to the caller, as before).
   */
  function estimate(u, o, dmg, element, noEmpower, skill, flat) {
    let m = outMult(u);
    if (noEmpower && has(u, 'empowered')) m /= 1.5;
    if (u.side === 'hero') {
      const tt = getSt(u, 'taunt');
      if (tt && tt.source && tt.source !== o.id) m *= 0.5;
      const ch = getSt(u, 'charmed');
      if (ch && ch.source === o.id) return 0;
    }
    const tu = G().tile(u.x, u.y), to = G().tile(o.x, o.y);
    if (tu && to && (tu.h || 0) > (to.h || 0)) m *= 1.25;
    if (has(o, 'vulnerable')) m *= 1.25;
    m *= DD.Act.takenMult(o);
    if (element && o.resist && typeof o.resist[element] === 'number') {
      if (o.resist[element] === 0) return 0;
      m *= o.resist[element];
    }
    if (element === 'lightning' && has(o, 'wet')) m *= 1.5;
    if ((!element || element === 'physical') && has(o, 'frozen')) m *= 1.5;
    if (has(o, 'invulnerable') || (o.flags && o.flags.invulnerable)) return 0;
    let f = Number(flat) || 0;
    const fu = estFlags(u), fo = estFlags(o);
    if ((fu & 1) || (fo & 6)) {
      const e = { attacker: u, target: o, source: u, skill: skill || null, base: dmg, element: element || null, cause: 'skill',
        opportunity: !!noEmpower, mult: 1, flat: 0 };
      if (fo & 4) e.flat += DD.Act.takenFlat(o, e);
      if (fu & 1) DD.Hooks.fire('estimateDealt', u, e);
      if (fo & 2) DD.Hooks.fireOwn('estimateTaken', o, e);
      const em = Number(e.mult);
      if (isFinite(em) && em >= 0) m *= em;
      f += Number(e.flat) || 0;
    }
    let v = Math.round(dmg * m + f);
    if (!(v > 0)) return 0;
    const mk = getSt(o, 'marked');
    if (mk) v += mk.stacks;
    if (o.armor) v = Math.max(1, v - o.armor);
    return v;
  }
  AI.estimate = function (u, o, dmg, element, noEmpower, skill) {
    if (!u || !o) return 0;
    return estimate(u, o, dmg, element, noEmpower, skill && skill.id ? skill : skill ? skillOf(skill) : null, 0);
  };

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

  // ---- attacks of opportunity (DD.Act.opportunityOf) -------------------------------------------------
  /**
   * Estimated damage of attacker's attack of opportunity on mover (after armor, before Block). from: the tile the mover
   * would leave (its modifyOpportunity flat / mult are read there); without it, the attacker's opportunity skill as is.
   */
  function oppDmg(attacker, mover, from) {
    const o = from ? DD.Act.opportunityOf(attacker, mover, from) : null;
    if (from && !o) return 0;
    const sl = o ? o.slot : DD.Act.opportunitySlot(attacker);
    const def = sl && skillOf(sl.id);
    if (!def) return 0;
    const L = DD.skillLevel(def, sl.level || 1);
    if (!(L && L.dmg > 0) && !(o && o.flat > 0)) return 0;
    // [engine requests, hero-betty] like Act.damage: o.mult with the multipliers, o.flat after them — the hammer's 5 + 7
    // on a Vulnerable walker is round(5 × 1.25) + 7 = 13, not round(12 × 1.25). (Status flats on attacks of opportunity
    // ride on o.flat through modifyOpportunity, ARCHITECTURE §6.2: no telegraphFlat here, it would count them twice.)
    const mult = o && typeof o.mult === 'number' && isFinite(o.mult) && o.mult >= 0 ? o.mult : 1;
    return estimate(attacker, mover, (L && L.dmg > 0 ? L.dmg : 0) * mult, elementOf(def), true, def, o ? Number(o.flat) || 0 : 0);
  }
  AI.opportunityDmg = function (attacker, mover, from) { return attacker && mover ? DD.Targeting.pure(function () { return oppDmg(attacker, mover, from); }) : 0; };

  /**
   * What walking pos.path costs the AI in attacks of opportunity (pos.provokes from a reachable({ aoo: true }) entry):
   * Infinity if their estimated hits would drop it, else the damage × 1.5 (divers 0.5, kamikazes 0.75) + 2 per attack.
   * A taunted unit goes for its taunter whatever it costs (0.5 per attack), unless that would drop it.
   */
  function aooCost(unit, pos, style, taunted) {
    const ids = pos && pos.provokes;
    if (!ids || !ids.length) return 0;
    const dmg = aooHits(unit, pos);
    if (dmg >= (unit.hp || 0) + (unit.block || 0)) return Infinity;
    if (taunted) return 0.5 * ids.length;
    const w = isDiver(style) ? 0.5 : style && style.style === 'kamikaze' ? 0.75 : 1.5;
    return dmg * w + 2 * ids.length;
  }
  /** The first tile of the walk to pos (its start, then the path, the destination aside) that is next to attacker a. */
  function leavingNext(a, unit, pos) {
    if (Math.abs(a.x - unit.x) + Math.abs(a.y - unit.y) === 1) return { x: unit.x, y: unit.y };
    const path = pos.path || [];
    for (let i = 0; i < path.length - 1; i++) if (Math.abs(a.x - path[i].x) + Math.abs(a.y - path[i].y) === 1) return path[i];
    return null;
  }
  /** Estimated damage of the attacks of opportunity on the walk to pos (each read on the tile it is left from). */
  function aooHits(unit, pos) {
    const ids = (pos && pos.provokes) || [];
    let dmg = 0;
    for (let i = 0; i < ids.length; i++) {
      const a = DD.Combat.byId(ids[i]);
      if (a) dmg += oppDmg(a, unit, leavingNext(a, unit, pos) || { x: unit.x, y: unit.y });
    }
    return dmg;
  }
  function tauntedNow(u) { const t = taunter(u); return !!t && G().hostile(u, t); }
  AI.aooCost = function (unit, pos, style) {
    return DD.Targeting.pure(function () { return aooCost(unit, pos, style ? styleArg(unit, style) : styleOf(unit), tauntedNow(unit)); });
  };
  /** The estimated damage (after armor, before Block) of the attacks of opportunity a walk to pos provokes (pos.provokes). */
  AI.aooDamage = function (unit, pos) {
    if (!unit || !pos || !pos.provokes || !pos.provokes.length) return 0;
    return DD.Targeting.pure(function () { return aooHits(unit, pos); });
  };

  /** Opposing units next to u that would make an attack of opportunity if it walked away now. Pure. */
  AI.engaged = function (u) {
    if (!active(u)) return [];
    return DD.Targeting.pure(function () {
      return S().units.filter(function (a) { return !a.dead && G().dist(a, u) === 1 && !!DD.Act.opportunityOf(a, u, null); });
    });
  };

  /** The best damage number of a unit's damaging skills (its "threat" to the AI), signature aside. */
  function threatOf(o) {
    let best = 0;
    DD.Combat.slotsOf(o).forEach(function (sl) {
      if (o.signature && sl === o.signature) return;
      const d = skillOf(sl.id);
      const L = d && DD.skillLevel(d, sl.level || 1);
      if (L && L.dmg > best) best = L.dmg;
    });
    return best;
  }

  /**
   * How much an AI unit wants to hit foe o for est damage, on top of est (v2 targeting), from the facts { kill, hurt
   * (0..1 HP missing), engaged, thr, maxHp, hero, last }. Most styles: +4 for the foe it is engaged with (next to it at the
   * start of its turn: melee brutes stick; support 2, ranged / summoner 1, coward 0), up to +3 for a dangerous foe (¼ of
   * its best damage number), +5 for a kill (+2 heroes), low HP only as a nudge (×1.5). Divers ('assassin' /
   * 'skirmisher'): +14 for a kill (+6 heroes), the wounded ×8 and the squishy (low max HP) up to +4, no engagement.
   * Every style: +30 more when the kill ends the fight (last: the last hero standing, AI.endsFight).
   * The kill part counts for every foe an action hits, the focus part (who it would rather hit) once per action, for the
   * best foe in its area (an AoE is not worth more just for touching several engaged heroes).
   * tc: { origin: {x,y} where it started its turn, thr: threat cache }.
   */
  function killBonus(style, f) {
    if (!f.kill) return 0;
    // [finish audit-3] knocking out the last hero standing ends the fight: worth far more than re-downing one just helped up
    return (isDiver(style) ? 14 + (f.hero ? 6 : 0) : 5 + (f.hero ? 2 : 0)) + (f.last ? LAST_STANDING : 0);
  }
  const LAST_STANDING = 30;
  /** Knocking o out would end the fight: o is a hero and every other hero is down or dead. */
  function endsFight(o) {
    if (!o || o.kind !== 'hero' || !active(o) || !S()) return false;
    return !S().units.some(function (u) { return u !== o && u.kind === 'hero' && active(u); });
  }
  /** AI.endsFight(o): knocking o out ends the fight (the last hero standing). Content planners can weigh it too. */
  AI.endsFight = endsFight;
  function focusBonus(style, f) {
    if (isDiver(style)) return (f.hurt || 0) * 8 + Math.max(0, Math.min(4, (30 - (f.maxHp || 30)) / 4));
    let b = (f.hurt || 0) * 1.5 + Math.min(3, 0.25 * (f.thr || 0));
    if (f.engaged) { const e = ENGAGED[style && style.style]; b += e === undefined ? 4 : e; }
    return b;
  }
  function bonusOf(style, f) { return killBonus(style, f) + focusBonus(style, f); }
  function targetFacts(o, est, tc) {
    let thr = tc && tc.thr ? tc.thr[o.id] : undefined;
    if (thr === undefined) { thr = threatOf(o); if (tc && tc.thr) tc.thr[o.id] = thr; }
    const origin = tc && tc.origin;
    const kill = est > 0 && est >= o.hp + (o.block || 0);
    return { kill: kill, hurt: 1 - o.hp / Math.max(1, o.maxHp), thr: thr, maxHp: o.maxHp, last: kill && endsFight(o),
      hero: o.kind === 'hero', engaged: !!origin && Math.abs(o.x - origin.x) + Math.abs(o.y - origin.y) === 1 };
  }
  function targetBonus(u, o, est, style, tc) { return bonusOf(style, targetFacts(o, est, tc)); }
  /** AI.targetValue(u, o, est, style?, origin?) — the targeting bonus above for u hitting o (origin: u's turn-start tile). */
  AI.targetValue = function (u, o, est, style, origin) {
    if (!u || !o) return 0;
    return targetBonus(u, o, est || 0, style ? styleArg(u, style) : styleOf(u), { origin: origin || { x: u.x, y: u.y }, thr: {} });
  };
  /** AI.targetBonus(style, { kill, hurt, engaged, thr, maxHp, hero }) — the same formula from facts (AutoPlay's model). */
  AI.targetBonus = function (style, facts) { return bonusOf(style && style.style ? style : styleSpec(style) || { style: 'melee' }, facts || {}); };
  AI.threatOf = threatOf;
  AI.isDiver = function (styleOrUnit) {
    if (styleOrUnit && styleOrUnit.style) return isDiver(styleOrUnit);
    return styleOrUnit && styleOrUnit.id !== undefined ? isDiver(styleOf(styleOrUnit)) : !!DIVERS[styleOrUnit];
  };

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

  /** tc (v2 targeting): { origin: the tile it started its turn on, thr: threat cache } — see targetBonus. */
  function scoreAction(unit, slot, def, target, style, taunt, tc) {
    const L = DD.skillLevel(def, slot.level);
    const tiles = DD.Targeting.area(unit, def, slot.level, target);
    const dmg = L && L.dmg > 0 ? L.dmg : 0;
    const heal = L && L.heal > 0 ? L.heal : 0;
    const el = elementOf(def);
    let score = 0, foesHit = 0, hitsTaunter = false, focus = 0;
    const seen = {};
    for (let i = 0; i < tiles.length; i++) {
      const o = G().unitAt(tiles[i].x, tiles[i].y);
      if (!active(o) || seen[o.id]) continue;
      seen[o.id] = 1;
      if (taunt && o === taunt) hitsTaunter = true;
      if (isFoe(unit, o, taunt)) {
        foesHit++;
        if (dmg) {
          const est = estimate(unit, o, dmg, el, false, def, tc && tc.tf);
          const f = targetFacts(o, est, tc);
          score += est + killBonus(style, f);
          focus = Math.max(focus, focusBonus(style, f));
        } else if (!isSupportSkill(def, L)) score += 3;
      } else if (!G().hostile(unit, o)) {
        if (dmg && (def.tags || []).indexOf('safe') < 0 && o !== unit) score -= estimate(unit, o, dmg, el, false, def, tc && tc.tf) * 1.2;
        if (heal) {
          const missing = o.maxHp - o.hp;
          score += Math.min(heal, missing) * (style.style === 'support' ? 1.6 : 1) + (missing > o.maxHp * 0.5 ? 3 : 0);
        }
        if (def.kind === 'buff') score += style.style === 'support' ? 5 : 3;
      }
    }
    if (taunt && !hitsTaunter) return -1;
    score += focus;
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

  /** pos.aoo: its aooCost (computed while the unit still stands on its own tile). */
  function positionScore(unit, pos, style, foes, friends) {
    let sc = 0;
    const risk = pathRisk(unit, pos);
    if (risk.lethal || pos.aoo === Infinity) return -Infinity;
    sc -= risk.penalty + (pos.aoo || 0);
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
    // v2: what it reaches this turn: a long walk is a (small) cost, except for divers
    sc -= (pos.cost || 0) * (isDiver(style) ? 0.05 : 0.2);
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
   * Best (move, skill, target) for a unit without committing. opts: { skills: [ids], noMove, style, walked (it already
   * walked this turn: no fromStand skill) }.
   * Returns { moveTo: {x,y}, path, skillId, slot, target: {x,y}, score } | null.
   */
  AI.bestAttack = function (unit, opts) {
    opts = opts || {};
    if (!active(unit)) return null;
    const style = opts.style || styleOf(unit);
    const taunt = activeTaunter(unit);
    const slots = usableSlots(unit, opts.skills);
    if (!slots.length) return null;
    const foes = AI.targetsFor(unit);
    const friends = S().units.filter(function (o) { return active(o) && o !== unit && !G().hostile(unit, o); });
    const positions = [{ x: unit.x, y: unit.y, cost: 0, path: [], hazard: null, edge: G().isEdge(unit.x, unit.y, unit), provokes: [] }];
    if (!opts.noMove && !noMove(unit)) {
      // a move action: the paths provoke as few attacks of opportunity as possible, and those they do are a cost
      DD.Grid.reachable(unit, DD.Combat.effectiveMov(unit), { aoo: true }).forEach(function (e) { positions.push(e); });
      for (let p = 1; p < positions.length; p++) positions[p].aoo = aooCost(unit, positions[p], style, !!taunt);
    }
    let best = null;
    const ox = unit.x, oy = unit.y;
    const tc = { origin: { x: ox, y: oy }, thr: {}, tf: telegraphFlat(unit) };
    try {
      for (let p = 0; p < positions.length; p++) {
        const pos = positions[p];
        unit.x = pos.x; unit.y = pos.y;
        const ps = positionScore(unit, pos, style, foes, friends);
        if (ps === -Infinity) continue;
        for (let i = 0; i < slots.length; i++) {
          const def = skillOf(slots[i].id);
          if ((p > 0 || opts.walked) && fromStand(def)) continue;   // it goes off from where the unit stands: no walk first
          const cands = candidates(unit, slots[i], def, taunt);
          for (let c = 0; c < cands.length; c++) {
            const sc = scoreAction(unit, slots[i], def, cands[c], style, taunt, tc);
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

  /**
   * Every foe the unit could hit THIS turn (AI.targetsFor: taunt and stealth respected) with the cheapest way to do it
   * using a ready damaging skill: [{ unit, skillId, target: {x,y}, moveTo: {x,y}, path, cost, provokes: [unitIds],
   * aoo (their cost, see aooCost), engaged (it stood next to the foe at the start), est (damage estimate) }], one per
   * foe (fewest attacks of opportunity, then the cheapest walk, then the most damage), sorted engaged first, then fewest
   * attacks of opportunity, cheapest walk, most damage. opts: { skills: [ids], noMove, style }. Pure. For custom
   * planners that pick their own target: prefer list[0] (or a diver's pick) over "the weakest hero on the map".
   */
  AI.reachableTargets = function (unit, opts) {
    opts = opts || {};
    if (!active(unit) || !S()) return [];
    return DD.Targeting.pure(function () {
      const style = opts.style ? styleArg(unit, opts.style) : styleOf(unit);
      const taunt = activeTaunter(unit);
      const slots = usableSlots(unit, opts.skills).filter(function (sl) {
        const d = skillOf(sl.id), L = d && DD.skillLevel(d, sl.level);
        return !!(L && L.dmg > 0);
      });
      if (!slots.length) return [];
      const positions = [{ x: unit.x, y: unit.y, cost: 0, path: [], provokes: [], aoo: 0 }];
      if (!opts.noMove && !noMove(unit)) {
        G().reachable(unit, DD.Combat.effectiveMov(unit), { aoo: true }).forEach(function (e) {
          const c = aooCost(unit, e, style, !!taunt);
          if (c !== Infinity && !pathRisk(unit, e).lethal) { e.aoo = c; positions.push(e); }
        });
      }
      const origin = { x: unit.x, y: unit.y };
      const best = {};
      const ox = unit.x, oy = unit.y;
      const tf = telegraphFlat(unit);
      try {
        for (let p = 0; p < positions.length; p++) {
          const pos = positions[p];
          unit.x = pos.x; unit.y = pos.y;
          for (let i = 0; i < slots.length; i++) {
            const def = skillOf(slots[i].id), L = DD.skillLevel(def, slots[i].level);
            if (p > 0 && fromStand(def)) continue;
            const el = elementOf(def);
            const cands = candidates(unit, slots[i], def, taunt);
            for (let c = 0; c < cands.length; c++) {
              const tiles = DD.Targeting.area(unit, def, slots[i].level, cands[c]);
              for (let k = 0; k < tiles.length; k++) {
                const o = G().unitAt(tiles[k].x, tiles[k].y);
                if (!o || !isFoe(unit, o, taunt)) continue;
                const e = { unit: o, skillId: def.id, target: { x: cands[c].x, y: cands[c].y }, moveTo: { x: pos.x, y: pos.y }, path: pos.path,
                  cost: pos.cost || 0, provokes: (pos.provokes || []).slice(), aoo: pos.aoo || 0,
                  engaged: Math.abs(o.x - origin.x) + Math.abs(o.y - origin.y) === 1, est: estimate(unit, o, L.dmg, el, false, def, tf) };
                const cur = best[o.id];
                if (!cur || e.provokes.length < cur.provokes.length || (e.provokes.length === cur.provokes.length &&
                  (e.cost < cur.cost || (e.cost === cur.cost && e.est > cur.est)))) best[o.id] = e;
              }
            }
          }
        }
      } finally { unit.x = ox; unit.y = oy; }
      const out = Object.keys(best).map(function (k) { return best[k]; });
      out.sort(function (a, b) {
        return (b.engaged ? 1 : 0) - (a.engaged ? 1 : 0) || a.provokes.length - b.provokes.length || a.cost - b.cost || b.est - a.est;
      });
      return out;
    });
  };

  /** Who would make an attack of opportunity on the unit if it walked to (x, y) now ([unitIds]), or null if it can't. */
  AI.provokes = function (unit, x, y) {
    if (!active(unit) || noMove(unit)) return null;
    if (unit.x === x && unit.y === y) return [];
    const e = G().reachable(unit, DD.Combat.effectiveMov(unit), { aoo: true }).get(x + ',' + y);
    return e ? e.provokes.slice() : null;
  };

  // ---- movement --------------------------------------------------------------------------------
  /**
   * Walk there now (an AI move action on its turn): the given path, else the one provoking the fewest attacks of
   * opportunity within its movement, then the cheapest. Leaving tiles next to opposing units provokes their attacks of
   * opportunity (one that downs, stuns, roots or moves it ends the walk). True if it arrived.
   */
  AI.moveTo = function (unit, x, y, path) {
    if (!active(unit) || has(unit, 'sheep')) return false;   // a sheep only strolls (its own wander)
    return walk(unit, x, y, path, null);
  };
  /**
   * The walk itself. [engine requests, hero-hjalmar] Refused once the unit lost its turn mid-way (a banana peel, a stun
   * rune, an attack of opportunity's stun rider: any stun-like), like a held / rooted one. opts.passDowned: it may step
   * over the bodies of downed foes on the way (the boxed-in fallback, squeeze).
   */
  function walk(unit, x, y, path, opts) {
    if (!active(unit) || noMove(unit) || stunned(unit)) return false;
    if (unit.x === x && unit.y === y) return true;
    const pass = !!(opts && opts.passDowned);
    const p = path && path.length ? path : G().path(unit, x, y, { maxCost: DD.Combat.effectiveMov(unit), aoo: true, passDowned: pass });
    if (!p || !p.length) return false;
    const walked = DD.Act.moveAlong(unit, p, { provoke: true, passDowned: pass });
    return walked.length > 0 && unit.x === x && unit.y === y;
  }

  /**
   * Distance field (movement cost to reach a tile next to any of the targets) for approach moves. [engine requests,
   * act 2/3] Units hostile to the walker are walls (it can't pass them: a downed hero in a doorway sends it the other
   * way, or leaves it boxed in), the targets' own tiles aside; opts.passDowned: downed bodies can be stepped over.
   */
  function fieldTo(unit, targets, opts) {
    const g = S().grid;
    const n = g.w * g.h;
    const dist = new Float64Array(n).fill(Infinity);
    const pass = !!(opts && opts.passDowned);
    const wall = new Uint8Array(n);
    S().units.forEach(function (o) {
      if (o.dead || o === unit || !G().inBounds(o.x, o.y) || !G().hostile(unit, o) || (pass && o.downed)) return;
      wall[o.y * g.w + o.x] = 1;
    });
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
        if (wall[j]) continue;
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
    const reach = G().reachable(unit, DD.Combat.effectiveMov(unit), { aoo: true });
    if (!reach.size) return false;
    const g = S().grid;
    const taunted = tauntedNow(unit);
    let best = null, bestScore;
    if (style.style === 'coward') {
      const here = nearestDist(unit, foes);
      reach.forEach(function (e) {
        const risk = pathRisk(unit, e);
        const aoo = aooCost(unit, e, style, taunted);
        if (risk.lethal || aoo === Infinity) return;
        const sc = nearestDist(e, foes) * 2 - risk.penalty - aoo - e.cost * 0.1;
        if (sc > here * 2 && (best === null || sc > bestScore)) { best = e; bestScore = sc; }
      });
    } else {
      const field = fieldTo(unit, foes);
      const keep = style.style === 'ranged' || style.style === 'summoner' ? style.keepDistance || 0 : 0;
      const hereVal = field[unit.y * g.w + unit.x];
      reach.forEach(function (e) {
        const risk = pathRisk(unit, e);
        const aoo = aooCost(unit, e, style, taunted);
        if (risk.lethal || aoo === Infinity) return;
        let v = field[e.y * g.w + e.x];
        if (!isFinite(v)) v = 200 + nearestDist(e, foes);
        if (keep && nearestDist(e, foes) < keep) v += (keep - nearestDist(e, foes)) * 2;
        v += risk.penalty + aoo + e.cost * 0.01;
        if (best === null || v < bestScore) { best = e; bestScore = v; }
      });
      // no route to any foe from here (walled in): only a step that gets closer counts (no pointless shuffle)
      if (best && bestScore >= (isFinite(hereVal) ? hereVal : 200 + nearestDist(unit, foes))) best = null;
    }
    if (!best) return false;
    return walk(unit, best.x, best.y, best.path, null);
  }

  /**
   * [engine requests, bosses-act1 / act 2] The generic fallback for a BOXED-IN unit: it can move but no free route
   * leads to any foe (its approach field is Infinity where it stands: downed bodies, walls, cliffs). If stepping over the
   * bodies of downed foes opens one, it squeezes past them (a move action: it provokes as usual, and never ends on a
   * body). Returns true if it moved.
   */
  function boxedIn(unit, foes) {
    if (noMove(unit) || stunned(unit) || !(DD.Combat.effectiveMov(unit) > 0) || !foes.length) return false;
    return !isFinite(fieldTo(unit, foes)[unit.y * S().grid.w + unit.x]);
  }
  function squeeze(unit, style) {
    if (!active(unit) || style.style === 'coward') return false;
    const s = S();
    if (!s.units.some(function (o) { return !o.dead && o.downed && G().hostile(unit, o); })) return false;
    const foes = AI.targetsFor(unit);
    if (!boxedIn(unit, foes)) return false;
    const w = s.grid.w;
    const field = fieldTo(unit, foes, { passDowned: true });
    let best = null, bestScore = field[unit.y * w + unit.x];
    if (!isFinite(bestScore)) return false;
    const taunted = tauntedNow(unit);
    G().reachable(unit, DD.Combat.effectiveMov(unit), { aoo: true, passDowned: true }).forEach(function (e) {
      const v0 = field[e.y * w + e.x];
      if (!isFinite(v0)) return;
      const risk = pathRisk(unit, e);
      const aoo = aooCost(unit, e, style, taunted);
      if (risk.lethal || aoo === Infinity) return;
      const v = v0 + risk.penalty + aoo + e.cost * 0.01;
      if (v < bestScore) { best = e; bestScore = v; }
    });
    if (!best) return false;
    const over = best.path.some(function (p) { const o = G().unitAt(p.x, p.y); return !!o && o.downed; });
    const x0 = unit.x, y0 = unit.y;
    const moved = walk(unit, best.x, best.y, best.path, { passDowned: true });
    const went = moved || unit.x !== x0 || unit.y !== y0;   // its move action is spent even if a reaction stopped it
    if (over && went) DD.Act.log(unit.name + ' squeezes past the fallen. Rude.', 'enemy');
    return went;
  }
  AI.squeeze = function (unit, style) { return active(unit) ? squeeze(unit, styleArg(unit, style)) : false; };

  function wander(unit) {
    // a sheep's stroll is a move action too: walking away from a hero's elbow provokes ("Baa." *bonk*)
    const reach = G().reachable(unit, 2, { aoo: true });
    const list = [];
    reach.forEach(function (e) { if (!G().hazardAt(e.x, e.y, unit) && !e.hazard) list.push(e); });
    if (!list.length) { DD.FX.text(unit, 'Baa.', { color: '#ffffff', size: 14 }); return; }
    const e = list[S().rng.int(0, list.length - 1)];
    walk(unit, e.x, e.y, e.path, null);
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
    // [engine requests, hero-hjalmar] a unit that lost its turn mid-way (a stun-like or sheep during its own turn: a banana
    // peel) starts no wind-up; outside its turn (scripted content) the stun interrupts it when it would land, as before
    if ((stunned(unit) || has(unit, 'sheep')) && DD.Act.isOwnTurn(unit) && !(opts.data && opts.data.unstoppable)) return null;
    if (!opts.anchor) opts.anchor = opts.track ? 'unit' : 'ground';
    const it = buildIntent(unit, skillId, target, opts, true);
    if (!it) return null;
    unit.intents.push(it);
    AI.rollSkew(unit, it);
    const tiles = AI.intentTiles(unit, it);
    DD.FX.text(unit, '⏳ ' + it.label + '!', { color: '#ff8a5c', size: 16 });
    DD.FX.custom('windup', { unitId: unit.id, intentId: it.id, label: it.label, tiles: tiles.map(function (p) { return { x: p.x, y: p.y }; }), ms: 0 });
    if (opts.banner) DD.FX.banner('⏳ ' + it.label, { sub: typeof opts.banner === 'string' ? opts.banner : unit.name + ' winds up!' });
    // [playtest text-tone-3] no pronoun for a named boss: the unit's name
    DD.Act.log(unit.name + ' winds up ' + it.label + (it.turnsLeft > 1 ? ' (lands in ' + it.turnsLeft + ' of ' + unit.name + '\'s turns)!'
      : ' (lands at the start of ' + unit.name + '\'s next turn)!'), 'enemy');
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

  /**
   * Current area tiles of an intent (follows the unit for 'self' anchors), where it will really land: a stored
   * Dazzle / Confuse skew applies while the status lasts (playtest fix bosses-objectives-2). Pure: drawn every frame.
   */
  AI.intentTiles = function (unit, intent) {
    if (!unit || !intent) return [];
    const tp = AI.intentTarget(unit, intent);
    if (!tp) return [];
    const land = landing(unit, intent, skillOf(intent.skillId), tp);
    return land ? land.tiles.filter(function (p) { return G().inBounds(p.x, p.y); }) : [];
  };

  /**
   * Playtest fix (bosses-objectives-2): where a Dazzled / Confused unit's attack lands is rolled ONCE per intent and
   * stored on it — when the status lands on a unit with wind-ups pending (DD.Act.addStatus calls this), when a wind-up
   * starts on a unit that already has it, or at the latest when the action executes — as intent.skew = { off: {x, y}
   * (Dazzled: the whole attack 1 tile off), turn: 1 | 3 (Confused: a quarter turn around the attacker) }. Draws use the
   * combat RNG (never from a render path). Unstoppable intents (data.unstoppable) ignore both. Returns the intent.
   */
  AI.rollSkew = function (unit, intent) {
    const s = S();
    if (!unit || !intent || !s || !s.rng || (intent.data && intent.data.unstoppable)) return intent;
    const sk = intent.skew || {};
    if (has(unit, 'confused') && !sk.turn) sk.turn = s.rng.chance(0.5) ? 1 : 3;
    if (has(unit, 'dazzled') && !sk.off) { const d = U.DIRS[s.rng.int(0, 3)]; sk.off = { x: d.x, y: d.y }; }
    if (sk.turn || sk.off) { intent.skew = sk; DD.Act.touch(); }
    return intent;
  };
  /**
   * Will unit's status `id` still be on it when this intent lands? An action used now, or a wind-up landing now
   * (turnsLeft 0): whether it has it. A pending wind-up: walks the initiative order forward the way DD.Combat plays it
   * (a hero-controlled turn start feeds the hero window, the owner's turn start counts the wind-up down and lands it at
   * 0, its turn end ticks a 'turnEnd' status, a fresh one skipping that once). Playtest review (bosses-objectives-2): a
   * 1-turn Dazzle on Grimble's or the Rat King's one-round wind-up wears off at the end of their other turn, so the
   * board must not draw the skew it will never land with. Pure.
   */
  AI.lastsToLanding = function (unit, intent, id) {
    const s = S();
    const st = unit && DD.Act.getStatus(unit, id);
    if (!st) return false;
    if (!intent || !intent.windup || !(intent.turnsLeft > 0)) return true;
    if (!(st.turns >= 0) || !s || !s.order || !s.order.length) return true;   // permanent (turns -1)
    const def = DD.getStatus(id) || {};
    const at = def.decay || 'turnEnd';
    if (at !== 'turnEnd' && at !== 'turnStart') return true;
    let turns = st.turns, fresh = !!st.fresh, heroTurns = s.heroTurns || 0, left = intent.turnsLeft, win = intent.window;
    const mine = function (o) { return !!o && (o === unit || DD.Combat.groupOf(o).indexOf(unit) >= 0); };
    const tickEnd = function () {
      if (at !== 'turnEnd') return;
      if (fresh && def.skipFresh !== false) { fresh = false; return; }
      fresh = false;
      turns--;
    };
    // its own turn now: this turn's end comes first
    if (s.current && mine(DD.Combat.byId(s.current))) tickEnd();
    if (turns <= 0) return false;
    const n = s.order.length;
    const from = Math.max(-1, s.turnIndex === undefined || s.turnIndex === null ? -1 : s.turnIndex);
    for (let k = 1; k <= n * 8; k++) {
      const e = s.order[(from + k) % n];
      const o = e && DD.Combat.byId(e.unitId);
      if (!o || o.dead || (o.downed && !DD.Combat.groupOf(o).some(active))) continue;
      if (DD.Combat.isPlayerControlled(o)) heroTurns++;
      if (!mine(o)) continue;
      if (at === 'turnStart' && --turns <= 0) return false;
      if (!(typeof win === 'number' && heroTurns < win)) {
        left = Math.max(0, left - 1);
        win = heroTurns + 1;
        if (left <= 0) return true;
      }
      tickEnd();
      if (turns <= 0) return false;
    }
    return true;
  };
  /**
   * The landing of an intent aimed at tp: { tp, dir, tiles, confused, dazzled } with the stored skew applied while the
   * unit is still Confused / Dazzled when it lands (a quarter turn first, then 1 tile off); null without a def or
   * explicit tiles.
   */
  function landing(unit, intent, def, tp) {
    let dir = currentDir(unit, intent, tp);
    let tiles = intent.tiles ? explicitTiles(unit, intent, tp) : null;
    if (!tiles && !def) return null;
    const sk = !(intent.data && intent.data.unstoppable) && intent.skew;
    const confused = !!(sk && sk.turn && AI.lastsToLanding(unit, intent, 'confused'));
    const dazzled = !!(sk && sk.off && AI.lastsToLanding(unit, intent, 'dazzled'));
    if (confused) {
      // a quarter turn around the attacker (areas drawn from the target are re-drawn in the new direction)
      const k = sk.turn;
      const rel = U.rotateDir({ x: tp.x - unit.x, y: tp.y - unit.y }, k);
      tp = { x: unit.x + rel.x, y: unit.y + rel.y };
      dir = U.rotateDir(dir, k);
      if (tiles) tiles = tiles.map(function (p) { const r = U.rotateDir({ x: p.x - unit.x, y: p.y - unit.y }, k); return { x: unit.x + r.x, y: unit.y + r.y }; });
    }
    if (!tiles) tiles = DD.Targeting.area(unit, def, intent.level || 1, tp, dir);
    if (dazzled) {
      // the whole attack lands one tile off, whatever its shape (cones and lines drawn from the attacker too)
      const d4 = sk.off;
      tp = { x: tp.x + d4.x, y: tp.y + d4.y };
      tiles = tiles.map(function (p) { return { x: p.x + d4.x, y: p.y + d4.y }; });
    }
    return { tp: tp, dir: dir, tiles: tiles, confused: confused, dazzled: dazzled };
  }

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
    // Confused → a quarter turn, Dazzled → 1 tile off: a wind-up lands where its rolled skew says (drawn since the status
    // landed), an action used now rolls it here
    if (!sure) AI.rollSkew(unit, intent);
    const land = landing(unit, intent, def, tp);
    if (land.confused) DD.FX.text(unit, '😵 Confused!', { color: '#d77bff', size: 14 });
    if (land.dazzled) DD.FX.text(unit, '✨ Dazzled!', { color: '#fff3a3', size: 14 });
    tp = land.tp;
    const dir = land.dir;
    const tiles = land.tiles.filter(function (p) { return G().inBounds(p.x, p.y); });
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
    const x0 = unit.x, y0 = unit.y;
    const best = AI.bestAttack(unit, { style: style });
    if (best) {
      const moved = best.moveTo.x === unit.x && best.moveTo.y === unit.y ? true : AI.moveTo(unit, best.moveTo.x, best.moveTo.y, best.path);
      if (!active(unit) || stunned(unit) || has(unit, 'sheep')) return null;
      if (!moved) {
        // the walk was interrupted (trap, web...): aim again from where it ended up
        const again = AI.bestAttack(unit, { style: style, noMove: true, walked: !(unit.x === x0 && unit.y === y0) });
        return again ? AI.useNow(unit, again.skillId, aimAt(unit, again), {}) : null;
      }
      return AI.useNow(unit, best.skillId, aimAt(unit, best), {});
    }
    if (!squeeze(unit, style)) approach(unit, style);
    if (!active(unit) || stunned(unit) || has(unit, 'sheep')) return null;
    const walked = !(unit.x === x0 && unit.y === y0);   // fromStand skills don't go off after a walk this turn
    const after = AI.bestAttack(unit, { style: style, noMove: true, walked: walked });
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
      // v2: move-action paths (fewest attacks of opportunity first); entries carry provokes: [unitIds]
      reachable: function (u) { u = u || unit; return noMove(u) ? new Map() : G().reachable(u, DD.Combat.effectiveMov(u), { aoo: true }); },
      reachableTargets: function (u, opts) { return AI.reachableTargets(u || unit, opts); },
      provokes: function (u, x, y) { return AI.provokes(u || unit, x, y); },
      engaged: function (u) { return AI.engaged(u || unit); },
      aooCost: function (u, pos) { return AI.aooCost(u || unit, pos); },
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
  // the api calls that mean "a planner looked for something to do" (AI.act: the squeeze fallback after a planner)
  const LOOKS = ['foes', 'reachable', 'reachableTargets', 'engaged', 'moveTo', 'bestAttack', 'defaultPlan', 'defaultTurn', 'approach', 'canUse'];

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
    if (def && typeof def.ai === 'function') {
      const m0 = s.mutations || 0, x0 = unit.x, y0 = unit.y;
      const api = makeApi(unit);
      // [review] the boxed-in fallback (squeeze) also covers a custom planner that looked for something to do (asked the
      // api for foes, an attack, a walk...) and found nothing at all. One that returns at once on purpose is left alone: a
      // gargoyle in Stone Form "does nothing" that turn, and used to squeeze 3 tiles past a downed hero.
      let looked = false;
      LOOKS.forEach(function (k) { const f = api[k]; api[k] = function () { looked = true; return f.apply(this, arguments); }; });
      DD.safe('AI planner of ' + def.id, def.ai, def, [unit, api]);
      if (looked && !s.result && active(unit) && (s.mutations || 0) === m0 && unit.x === x0 && unit.y === y0) squeeze(unit, styleOf(unit));
    } else defaultTurn(unit, styleOf(unit));
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
  /**
   * How a skill reaches from a tile it is used from: { any } (every foe: all_foes), else { r, sight, ext }: r steps to
   * its target (or along its line / cone), through tiles that don't block line of sight when `sight` (walls, pillars,
   * smoke stop it: aimed skills, lines, cones), then ext steps of area past the target (areas ignore walls).
   */
  function reachSpec(unit, def, level, L) {
    const tg = DD.Targeting.targetSpec(def);
    const shape = (def.area && def.area.shape) || 'single';
    const size = Math.max(0, Math.floor(+DD.resolve(def.area && def.area.size, L, unit, 1) || 0));
    if (shape === 'all_foes') return { any: true };
    if (shape === 'line') return { r: Math.max(size, tg.type === 'tile' || tg.type === 'unit' ? DD.Targeting.range(unit, def, level)[1] : 1), sight: true, ext: 0 };
    if (shape === 'cone') return { r: Math.max(1, 2 * size - 1), sight: true, ext: 0 };
    if (tg.type === 'self') return { r: 0, sight: false, ext: areaExtent(shape, size) };
    if (tg.type === 'dir') return { r: 1, sight: true, ext: areaExtent(shape, size) };
    return { r: DD.Targeting.range(unit, def, level)[1], sight: tg.los !== false, ext: areaExtent(shape, size) };
  }
  /** Multi-source BFS from tile indices `starts` up to r steps; sight: line-of-sight blockers are reached, not passed. */
  function spread(g, starts, r, blocks) {
    const dist = new Int16Array(g.w * g.h).fill(-1);
    const q = [];
    for (let k = 0; k < starts.length; k++) if (dist[starts[k]] < 0) { dist[starts[k]] = 0; q.push(starts[k]); }
    const cap = Math.min(r, g.w + g.h);
    for (let h = 0; h < q.length; h++) {
      const i = q[h], d = dist[i];
      if (d >= cap || (blocks && d > 0 && blocks[i])) continue;
      const x = i % g.w, y = (i / g.w) | 0;
      for (let k = 0; k < 4; k++) {
        const nx = x + U.DIRS[k].x, ny = y + U.DIRS[k].y;
        if (nx < 0 || ny < 0 || nx >= g.w || ny >= g.h) continue;
        const j = ny * g.w + nx;
        if (dist[j] < 0) { dist[j] = d + 1; q.push(j); }
      }
    }
    return dist;
  }
  /**
   * The per-victim flat of a strike from unit with skill def on v right now (what d.flat would get: Pack Tactics, the
   * spider vs webbed prey, Vendetta, house rules): the skill's telegraphFlat and the rules' telegraphFlat, read with an
   * action record aimed at v. Wind-up-only skills never get here (their telegraphFlat may cancel flats on purpose).
   */
  function victimFlat(unit, def, level, v) {
    const s = S();
    const hasRule = s && s.rules && s.rules.some(function (r) { return r && typeof r.telegraphFlat === 'function'; });
    if (typeof def.telegraphFlat !== 'function' && !hasRule) return 0;
    const it = { id: 'reach', skillId: def.id, anchor: 'unit', unitId: v.id, abs: null, rel: null, dir: U.dirTo(unit, v), tiles: null,
      windup: false, turnsLeft: 0, delay: 0, pending: false, data: {}, level: level, ownerId: unit.id, round: s ? s.round : 0 };
    let f = typeof def.telegraphFlat === 'function' ? Number(DD.safe('telegraphFlat of ' + def.id, def.telegraphFlat, def, [unit, it])) || 0 : 0;
    if (hasRule) f += ruleFlat(unit, it);
    return f;
  }
  /**
   * Where an AI unit could strike on its next turn (an estimate): { tiles: Map 'x,y' → best damage number, units: Map
   * unitId → best number on that foe, best, only, unitId } (only: the taunter's id while taunted). [engine requests]
   * Honest about: its walk (the paths a move action takes; tiles behind an attack of opportunity that would drop it, or a
   * lethal hazard, are left out), the skills ready by then (cooldowns, charges, silence, content canUse; never a
   * windupOnly one — its marked tiles show it; a fromStand one only from where it stands), line of sight past the walk
   * (walls, pillars and smoke stop aimed shots, lines and cones; areas spread past their target), and per-victim
   * bonuses (the number on a foe's tile is what that foe would take before its own defences: Pack Tactics, webbed prey).
   * Empty for units that lose their next turn (stun-likes), sheep and units without a damaging skill. Pure.
   */
  AI.reachOf = function (unit) {
    const out = { tiles: new Map(), units: new Map(), best: 0, only: null, unitId: unit ? unit.id : null };
    if (!active(unit) || stunned(unit) || has(unit, 'sheep') || !S()) return out;
    return DD.Targeting.pure(function () { return reachOf(unit, out); });
  };
  function reachOf(unit, out) {
    const skills = [];
    DD.Combat.slotsOf(unit).forEach(function (sl) {
      const d = skillOf(sl.id);
      if (!d || windupOnly(d)) return;
      if (d.charges > 0 && (sl.uses || 0) >= d.charges) return;
      if ((sl.cd || 0) > 1 || ((sl.cd || 0) === 1 && sl.fresh)) return;   // still cooling down on its next turn
      if (d.kind === 'spell' && has(unit, 'silenced')) return;
      const L = DD.skillLevel(d, sl.level);
      if (!L || !(L.dmg > 0)) return;
      if (typeof d.canUse === 'function') {
        const ok = DD.safe('canUse of ' + d.id, d.canUse, d, [DD.Targeting.buildCtx(unit, sl, null)]);
        if (ok === false || typeof ok === 'string') return;
      }
      skills.push({ def: d, level: sl.level || 1, dmg: intentDmg(unit, d, sl.level), spec: reachSpec(unit, d, sl.level, L), stand: fromStand(d) });
    });
    if (!skills.length) return out;
    skills.forEach(function (k) { if (k.dmg > out.best) out.best = k.dmg; });
    const g = S().grid, n = g.w * g.h;
    const here = unit.y * g.w + unit.x;
    const walkTo = [here];
    // [finish audit-7] held now but free by its next turn (a hold that ends first): it walks then
    if (!DD.Act.cantMoveNext(unit) && skills.some(function (k) { return !k.stand && !k.spec.any; })) {
      const style = styleOf(unit), taunted = tauntedNow(unit);
      G().reachable(unit, DD.Combat.effectiveMov(unit), { aoo: true }).forEach(function (e) {
        if (pathRisk(unit, e).lethal || aooCost(unit, e, style, taunted) === Infinity) return;
        walkTo.push(e.y * g.w + e.x);
      });
    }
    const blocks = new Uint8Array(n);
    for (let i = 0; i < n; i++) if (G().blocksLos(i % g.w, (i / g.w) | 0)) blocks[i] = 1;
    // every skill's hit tiles (BFS results shared between skills with the same shape of reach)
    const memo = {};
    const val = new Float64Array(n);
    const hits = [];
    for (let k = 0; k < skills.length; k++) {
      const sk = skills[k], sp = sk.spec;
      if (sp.any) { for (let i = 0; i < n; i++) if (sk.dmg > val[i]) val[i] = sk.dmg; hits.push(null); continue; }
      const key = (sk.stand ? 's' : 'w') + sp.r + (sp.sight ? 'L' : '') + ':' + sp.ext;
      let hit = memo[key];
      if (!hit) {
        const base = spread(g, sk.stand ? [here] : walkTo, sp.r, sp.sight ? blocks : null);
        if (sp.ext > 0) {
          const from = [];
          for (let i = 0; i < n; i++) if (base[i] >= 0) from.push(i);
          hit = spread(g, from, sp.ext, null);
        } else hit = base;
        memo[key] = hit;
      }
      hits.push(hit);
      for (let i = 0; i < n; i++) if (hit[i] >= 0 && sk.dmg > val[i]) val[i] = sk.dmg;
    }
    // per victim: the number on a foe's own tile includes the bonuses that depend on who stands there
    const foes = S().units.filter(function (o) { return active(o) && G().hostile(unit, o) && G().inBounds(o.x, o.y); });
    for (let f = 0; f < foes.length; f++) {
      const v = foes[f], i = v.y * g.w + v.x;
      let best = 0, any = false;
      for (let k = 0; k < skills.length; k++) {
        if (hits[k] && hits[k][i] < 0) continue;
        any = true;
        const dv = Math.max(0, skills[k].dmg + victimFlat(unit, skills[k].def, skills[k].level, v));
        if (dv > best) best = dv;
      }
      if (!any) continue;
      val[i] = best;
      if (best > 0) out.units.set(v.id, best);
    }
    for (let i = 0; i < n; i++) if (val[i] > 0) out.tiles.set((i % g.w) + ',' + ((i / g.w) | 0), val[i]);
    const t = activeTaunter(unit);
    if (t) out.only = t.id;
    return out;
  }
  /**
   * Tiles the AI units hostile to `side` (default 'hero') could hit on their next turns (AI.reachOf of each; wind-ups
   * are separate, see AI.windups): Map 'x,y' → { dmg (sum), max, from: [unitIds], turns: { unitId: n } }.
   * Playtest fix (bosses-objectives-3): with opts.hero (a unit or id) each unit counts once per turn it gets before that
   * hero's next turn (AI.turnsBefore: a two-turn boss acting twice first counts twice — dmg is the sum, max one hit;
   * a unit that only acts after the hero's next turn counts nothing). Without it, every unit counts once.
   */
  AI.threatMap = function (side, opts) {
    side = side || 'hero';
    opts = opts || {};
    const s = S(), map = new Map();
    if (!s) return map;
    const hero = typeof opts.hero === 'string' ? DD.Combat.byId(opts.hero) : opts.hero || null;
    DD.Targeting.pure(function () {
      s.units.forEach(function (e) {
        if (!active(e) || DD.Combat.isPlayerControlled(e) || G().effectiveSide(e) === side) return;
        const n = hero ? AI.turnsBefore(e, hero) : 1;
        if (n <= 0) return;
        AI.reachOf(e).tiles.forEach(function (dmg, k) {
          let c = map.get(k);
          if (!c) map.set(k, c = { dmg: 0, max: 0, from: [], turns: {} });
          c.dmg += dmg * n; c.max = Math.max(c.max, dmg); c.from.push(e.id); c.turns[e.id] = n;
        });
      });
    });
    return map;
  };

  /** Rolled order (as DD.Combat sorts it): higher total, then higher init, then heroes, then the coin flip. */
  function cmpEntries(a, b) {
    return (b.total - a.total) || (b.init - a.init) || ((b.side === 'hero' ? 1 : 0) - (a.side === 'hero' ? 1 : 0)) || ((b.tie || 0) - (a.tie || 0));
  }
  /**
   * Playtest fix (bosses-objectives-3): how many turns `unit` (an AI unit; summons act on their owner's) gets from now
   * until `hero`'s next turn (the hero's own turn now: until its next one): the rest of this round's order, then next
   * round's (joiners merged by their roll, as the engine does) up to the hero's slot. 0 = it only acts after that;
   * 2 = a two-turn boss acting twice first. Before initiative (deployment): 1. Pure.
   */
  AI.turnsBefore = function (unit, hero) {
    const s = S();
    if (!s || !unit || !hero) return 0;
    if (!s.order || !s.order.length) return 1;
    const owner = function (u) { return u && u.kind === 'summon' && u.ownerId ? DD.Combat.byId(u.ownerId) || u : u; };
    const h = owner(hero), me = owner(unit);
    const list = [];
    for (let i = Math.max(0, s.turnIndex + 1); i < s.order.length; i++) list.push(s.order[i]);
    const next = s.order.slice();
    (s.joining || []).forEach(function (e) {
      if (s.initMode === 'roll' && !e.fixed) {
        let i = 0;
        while (i < next.length && cmpEntries(next[i], e) <= 0) i++;
        next.splice(i, 0, e);
      } else next.push(e);
    });
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      if (list[i].unitId === h.id) return n;
      if (list[i].unitId === me.id) n++;
    }
    for (let i = 0; i < next.length; i++) {
      if (next[i].unitId === h.id) return n;
      if (next[i].unitId === me.id) n++;
    }
    return n;
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

  // level keys that hold a damage number (dmg, crit, acidDmg, splashDamage...), scaled for enemies by AI.fightLevel
  const DMG_KEY = /^(dmg|damage|crit)$|dmg|Dmg|Damage/;
  /**
   * Playtest fix (first-hour-1): a skill's level numbers as THIS fight uses them — for an enemy-side unit every damage
   * number (keys dmg, crit, *dmg*, *Damage*) × the fight's damage multiplier (state.difficulty.dmg: difficulty × act ×
   * kind, the factor Act.damage and AI.intentDmg apply), rounded. Hero-side numbers are unchanged. A shallow copy. Pure.
   */
  AI.fightLevel = function (def, level, unit) {
    const L = DD.skillLevel(def, level);
    const s = S();
    const f = unit && unit.side === 'enemy' && s && s.difficulty ? Number(s.difficulty.dmg) || 1 : 1;
    if (f === 1) return L;
    const out = {};
    for (const k in L) out[k] = typeof L[k] === 'number' && DMG_KEY.test(k) ? Math.round(L[k] * f) : L[k];
    return out;
  };
  /** A skill's desc with AI.fightLevel's numbers (the HUD shows enemy abilities with it: what the hit will really be). */
  AI.skillDesc = function (def, level, unit) {
    if (!def) return '';
    if (typeof def.desc !== 'function') return String(def.desc || '');
    const s = DD.safe('desc of ' + def.id, def.desc, def, [AI.fightLevel(def, level || 1, unit), unit || null]);
    return s == null ? '' : String(s);
  };
  /** Every walkable tile of the board is among tiles (a doom over the whole table). */
  function wholeBoard(tiles) {
    const g = S() && S().grid;
    if (!g || !tiles || !tiles.length) return false;
    const inT = {};
    tiles.forEach(function (p) { inT[p.x + ',' + p.y] = 1; });
    for (let i = 0; i < g.tiles.length; i++) { const t = g.tiles[i]; if (G().isWalkable(t.x, t.y) && !inT[t.x + ',' + t.y]) return false; }
    return true;
  }

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
    // [playtest first-hour-1] the numbers this fight really uses (an enemy's damage × the fight's multiplier)
    if (def) parts.push(def.name + ': ' + AI.skillDesc(def, intent.level || 1, unit));
    // [playtest text-tone-3] no pronoun for a named boss
    if (intent.anchor === 'self') parts.push('Aimed relative to ' + unit.name + ': push ' + unit.name + ' and the attack moves along.');
    else if (intent.anchor === 'ground') {
      // [playtest bosses-objectives-9] a doom over the whole table has no "out of the red"
      parts.push(wholeBoard(AI.intentTiles(unit, intent)) ? 'Hits the whole table: there is nowhere to stand clear.' : 'Hits the marked tiles. Get out of the red.');
    } else {
      const t = DD.Combat.byId(intent.unitId);
      targetName = t ? t.name : null;
      if (t && active(t) && G().hostile(unit, t) && has(t, 'stealth')) parts.push(t.name + ' is stealthed: this shot will lose track.');
      // a target.los === false skill ignores line of sight, so it only fizzles out of range
      else parts.push('Tracks ' + (t ? t.name : 'the target') + '; fizzles if out of ' + (def && def.target && def.target.los === false ? 'range.' : 'range or sight.'));
    }
    // [playtest bosses-objectives-2] the skew is rolled when the status lands: the marked tiles already show it
    // (review: only while the status will still be on it when this lands; a 1-turn one can wear off first)
    const sk = !sure && intent.skew;
    const dzOn = has(unit, 'dazzled') && !sure, cfOn = has(unit, 'confused') && !sure;
    const dz = dzOn && AI.lastsToLanding(unit, intent, 'dazzled'), cf = cfOn && AI.lastsToLanding(unit, intent, 'confused');
    const uncertain = (dz && !(sk && sk.off)) || (cf && !(sk && sk.turn));
    if (dz) parts.push(sk && sk.off ? '✨ Dazzled: it lands 1 tile off, on the tiles marked now.' : '? Dazzled: it will land 1 tile off.');
    else if (dzOn) parts.push('✨ Dazzled, but it wears off before this lands: it hits the tiles marked now.');
    if (cf) parts.push(sk && sk.turn ? '😵 Confused: it swings a quarter turn off, onto the tiles marked now.' : '? Confused: it will swing a quarter turn off.');
    else if (cfOn) parts.push('😵 Confused, but it wears off before this lands: it hits the tiles marked now.');
    if (has(unit, 'charmed')) parts.push('Charmed: ' + unit.name + ' now fights for your side.');
    // intent.data.unstoppable: content fires it whatever state its owner is in (the DM's diverted train)
    if (stunned(unit) && !sure) parts.push('Incapacitated: this will not happen.');
    else if (!sure) parts.push('Stun, sleep, freeze or polymorph ' + unit.name + ' to interrupt it.');
    if (def && def.kind === 'spell' && has(unit, 'silenced') && !sure) {
      parts.push(AI.lastsToLanding(unit, intent, 'silenced') ? 'Silenced: this spell will fizzle.' : 'Silenced, but it wears off before this lands.');
    }
    return {
      label: intent.label || (def ? def.name : '?'), icon: intent.icon || (def ? def.icon : '⚔️'),
      dmg: AI.intentDmg(unit, intent), text: parts.join(' '), uncertain: uncertain, delay: left, turnsLeft: left, windup: true,
      targetName: targetName,
    };
  }
})();
