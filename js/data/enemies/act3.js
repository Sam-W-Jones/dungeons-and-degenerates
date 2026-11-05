/* Dungeons and Degenerates — js/data/enemies/act3.js
 * Act 3 "Behind the DM Screen": regular enemies, three elite mini-bosses and the act's encounters
 * (hellscape, hoard, dm_table). v2: every enemy decides and acts at once on its initiative turn (no telegraphs); only
 * each elite's one signature move winds up (announced, lands at the start of its next turn). Each def states in
 * def.passive (the inspect panel) what it does on its turn and how it picks its target, and its codex desc sums it up:
 *   Imp Influencer (init +3, the act's diver) — blinks up to 5 tiles instead of walking and livestreams the weakest
 *     hero it can reach; Go Live! Marks them (+3 on the next hit).
 *   Hell Hound (+2) — fire-immune; runs, then bites or Pounces up to 4 tiles; Hot Dog Breath leaves the floor burning.
 *   Mind Flayer Life Coach (+1) — keeps its distance; Unsolicited Life Advice charms, Hustle Culture cone confuses.
 *   Floating Eyeball Intern (+2) — keeps its distance; beams pierce coworkers too; the overtime beam, then a nap.
 *   Rules Lawyer (Devil, Esq.) (0) — OBJECTION! strips buffs + silences; Motion to Dismiss shoves (into pits).
 *   Natural 1 Golem (−2) — every swing is a d20 roll (1 hits itself, 20 doubles); lobs dice that double on doubles.
 *   Kobold Dragonshield (+1) — Shield Wall: Block for itself and adjacent allies until their next turns.
 *   Succubus Dating Coach (0) — keeps her distance; Terrible Pickup Line charms; You Deserve Better! Inspires allies.
 *   Skeletal Backup Dancer (+2) — minion that shimmies in to kick; arrives with the Death Knight's intermission.
 *   Elites (all Unshakeable after a stun lands: no stun-locks): Young Red Dragon (+1, Hoarder: guards its hoard and
 *   basks in it for Block at the end of its turns, gold pickers become hunted Thieves; wind-up: Hoard Breath), Death
 *   Knight (−1, Very Dramatic: wind-up Villain Monologue, interruptible by damage; chain + swing; intermission dancers),
 *   Pit Fiend Accountant (+1, compounding Infernal Debt; wind-up: Hostile Audit along a whole line).
 * Targeting (DESIGN §8): brutes (default planner 'melee', custom planners aiStyle 'melee') stick to the hero next to
 * them, the flayer / eyeball / succubus keep their distance ('ranged'), the imp is the one diver ('assassin'). Walks
 * are move actions: every planner prices the attacks of opportunity a walk would provoke (api.aooCost; never a lethal
 * one); leaps, swoops, shimmies, blinks and pulls never provoke. Each enemy's first melee skill is its attack of
 * opportunity: the hound's bite, the lawyer's Motion, the golem's roll, the kobold's jab, the Death Knight's swing and
 * the fiend's smack (the rest make none).
 * Extras: statuses a3_thief / a3_monologue / a3_debt / a3_unshakeable, objects a3_hoard_pile / a3_snack_bowl.
 * Planners share plan() (best attack for a chosen movement style, approach, act now or wind up) — every id is a3_.
 */
(function () {
  'use strict';
  const DD = window.DD;

  // ---- tuning ----------------------------------------------------------------------------------------------
  const BLINK_RANGE = 5;     // Imp Influencer teleport range (instead of walking)
  const BREATH_MIN = 14;     // Young Red Dragon only winds up its breath at a worthwhile cone
  const HOARD_BLOCK = 3;     // Block per hoard pile, at the end of each of the dragon's turns
  const HOARD_MAX = 15;
  const HOARD_RANGE = 3;     // piles count while the dragon sits within 3 tiles of them
  const THIEF_BONUS = 4;     // extra damage dragons deal to Thieves
  const MONO_BREAK = 20;     // damage that interrupts the Death Knight's monologue (v2: act-3 parties are levels 4-6)
  const MONO_HYPE = 10;
  const DEBT_MAX = 5;
  const DEBT_PAYOFF = 2;
  // v2 targeting styles (DD.AI.targetBonus): brutes stick to the hero they are engaged with, ranged units keep their
  // distance and shoot what is in range, divers go for the weakest hero they can reach
  const MELEE = { style: 'melee', keepDistance: 0 };
  const SNIPER = { style: 'ranged', keepDistance: 3 };
  const KITER = { style: 'ranged', keepDistance: 2 };
  const DIVER = { style: 'assassin', keepDistance: 3 };

  // ---- helpers ------------------------------------------------------------------------------------------------
  function A() { return DD.Act; }
  function G() { return DD.Grid; }
  function S() { return DD.Combat.state; }
  function active(u) { return !!u && !u.dead && !u.downed; }
  function has(u, id) { return DD.Act.hasStatus(u, id); }
  function eskill(def) { def.owner = 'enemy'; def.ap = 0; return DD.registerSkill(def); }
  /** Level-1 numbers of an act-3 skill (passive descs read them, so the inspect panel never drifts from the skills). */
  function lvl(id) { const s = DD.getSkill(id); return (s && DD.skillLevel(s, 1)) || {}; }
  function lunge(ctx) { if (ctx.target) DD.FX.lunge(ctx.user, ctx.target); }
  function shoot(ctx, kind, color, extra) {
    if (ctx.target) DD.FX.projectile(ctx.user, ctx.target, Object.assign({ kind: kind, color: color }, extra || {}));
  }
  function attackBark(u, chance) { A().maybeBark(u, 'attack', chance === undefined ? 0.3 : chance); }
  /** Damage every foe of the user on the skill's tiles (re-checked: earlier hits may have killed). */
  function hitFoes(ctx, dmg, opts) {
    ctx.foes.forEach(function (f) { if (active(f)) A().damage(ctx.user, f, dmg, opts); });
  }
  /** Damage every unit on the skill's tiles except the user (friends included). */
  function hitUnits(ctx, dmg, opts) {
    ctx.units.forEach(function (u) { if (u !== ctx.user && active(u)) A().damage(ctx.user, u, dmg, opts); });
  }
  function hitObject(src, p, dmg) {
    const t = G().tile(p.x, p.y);
    if (t && t.obj && t.obj.maxHp > 0 && t.obj.hp > 0) A().damageObject(src, p.x, p.y, dmg);
  }
  /** Fire on a tile: element reactions first (oil spreads, water steams, barrels blow), then fire on dry floor. */
  function ignite(x, y, src, rounds) {
    const t = G().tile(x, y);
    if (!t) return;
    A().applyElement(x, y, 'fire', src, { noUnits: true });
    const td = G().terrain(t);
    if (td.liquid || td.pit || td.walkable === false || t.surface) return;
    if (t.obj && G().objBlocksMove(t.obj)) return;
    A().setSurface(x, y, 'fire', rounds);
  }
  function countObjects(id) {
    const s = S();
    let n = 0;
    if (s) s.grid.tiles.forEach(function (t) { if (t.obj && t.obj.id === id) n++; });
    return n;
  }
  function nearestDist(p, list) {
    let d = Infinity;
    list.forEach(function (o) { d = Math.min(d, Math.abs(o.x - p.x) + Math.abs(o.y - p.y)); });
    return d;
  }
  function buffCount(u) {
    let n = 0;
    (u.statuses || []).forEach(function (st) { const d = DD.getStatus(st.id); if (d && d.type === 'buff') n++; });
    return n;
  }
  /** A unit with a spell it could cast next turn (what OBJECTION!'s Silence takes away). */
  function hasSpell(u) {
    return DD.Combat.slotsOf(u).some(function (sl) { const d = DD.getSkill(sl.id); return !!d && d.kind === 'spell' && !(sl.cd > 1); });
  }
  /** AI value of shoving `target` dist tiles along dir: pits, deep water and lava ahead (or a bump). */
  function pushBonus(target, dir, dist) {
    if (!target || !dir || A().isImmovable(target) || G().isFlying(target)) return 0;
    let x = target.x, y = target.y;
    for (let i = 0; i < dist; i++) {
      const nx = x + dir.x, ny = y + dir.y;
      const t = G().tile(nx, ny);
      if (!t) return 2;
      if (G().isDrop(nx, ny)) return target.kind === 'hero' ? 10 : 0;
      const td = G().terrain(t);
      if (G().unitAt(nx, ny) || (t.obj && G().objBlocksMove(t.obj)) || td.walkable === false) return 2;
      if (td.liquid === 'lava' && !G().harmlessTo(td, null, target)) return 8;   // v2: lava can't hurt a fire-proof target
      x = nx; y = ny;
    }
    return 0;
  }
  function addDebt(target, n, src) { if (active(target)) A().addStatus(target, 'a3_debt', { stacks: n }, src); }

  // ---- planner helpers (v2: an enemy decides and acts on its own turn) ----------------------------------------------
  /** Its pending wind-up (of that skill, or any), else null. Only the elites' signature moves ever wind up. */
  function windupOf(u, id) {
    const list = (u && u.intents) || [];
    for (let i = 0; i < list.length; i++) if (list[i] && list[i].windup && (!id || list[i].skillId === id)) return list[i];
    return null;
  }
  function incapacitated(u) { return !active(u) || DD.Combat.isStunned(u) || has(u, 'sheep'); }

  /**
   * Walk toward the foes along a distance field (walls, lava rivers...), stopping `keep` tiles short.
   * Same idea as the engine's approach, but with a style chosen by the planner. within(p) (optional) limits the
   * destinations; a unit standing outside them takes any allowed tile. The attacks of opportunity a walk would provoke
   * are a cost (api.aooCost), and a walk they would drop it on is never taken. Returns true if it set off (its move is
   * spent, even when a reaction stopped the walk on its first tile).
   */
  function approach(unit, api, keep, within) {
    if (A().cantMove(unit)) return false;
    const foes = api.foes(unit);
    if (!foes.length) return false;
    const g = S().grid, W = g.w;
    const dist = new Float64Array(W * g.h).fill(Infinity);
    const q = [];
    foes.forEach(function (f) { const i = f.y * W + f.x; dist[i] = 0; q.push(i); });
    for (let h = 0; h < q.length; h++) {
      const i = q[h], x = i % W, y = (i / W) | 0;
      for (let d = 0; d < 4; d++) {
        const nx = x + DD.util.DIRS[d].x, ny = y + DD.util.DIRS[d].y;
        if (!G().inBounds(nx, ny) || !G().isWalkable(nx, ny, unit)) continue;
        const from = { x: nx, y: ny }, to = { x: x, y: y };
        if (!G().canStep(unit, from, to)) continue;
        // a hostile body it can't walk through (a downed hero in a doorway) is no shortcut to the foes behind it
        const o = G().unitAt(nx, ny);
        if (o && o !== unit && !o.dead && G().hostile(unit, o)) continue;
        const j = ny * W + nx;
        const c = dist[i] + G().stepCost(unit, from, to) + (G().hazardAt(nx, ny, unit) ? 3 : 0);
        if (c < dist[j]) { dist[j] = c; q.push(j); }
      }
    }
    const here = within && !within(unit) ? Infinity : dist[unit.y * W + unit.x];
    let best = null, bestV = Infinity;
    api.reachable(unit).forEach(function (e) {
      if (within && !within(e)) return;
      const risk = DD.AI.pathRisk(unit, e);
      const aoo = api.aooCost(unit, e);
      if (risk.lethal || aoo === Infinity) return;
      const nd = nearestDist(e, foes);
      let v = dist[e.y * W + e.x];
      if (!isFinite(v)) v = 200 + nd;
      if (keep && nd < keep) v += (keep - nd) * 2;
      v += risk.penalty + aoo + e.cost * 0.01;
      if (v < bestV) { bestV = v; best = e; }
    });
    if (!best || (isFinite(here) && bestV >= here)) return false;
    DD.AI.moveTo(unit, best.x, best.y, best.path);
    return true;
  }

  /**
   * DD.AI.bestAttack on a unit placed virtually on `spot` measures "engaged" (the brute's +4 for the hero next to it)
   * from that spot; re-base it on the tile the unit really started its turn on. The focus part of the targeting bonus
   * counts once per action, for the best foe in its area (DD.AI.targetValue with no damage = that focus part).
   */
  function engagedFix(unit, b, spot, origin, style) {
    if (spot.x === origin.x && spot.y === origin.y) return 0;
    const def = DD.getSkill(b.skillId);
    if (!def) return 0;
    let atSpot = 0, atHome = 0;
    DD.Targeting.area(unit, def, (b.slot && b.slot.level) || 1, b.target).forEach(function (q) {
      const o = G().unitAt(q.x, q.y);
      if (!active(o) || !G().hostile(unit, o)) return;
      atSpot = Math.max(atSpot, DD.AI.targetValue(unit, o, 0, style, spot));
      atHome = Math.max(atHome, DD.AI.targetValue(unit, o, 0, style, origin));
    });
    return atHome - atSpot;
  }

  /**
   * api.bestAttack restricted to destinations where within(p) holds (staying put counts only if within(here)).
   * bonus(p) (optional) adds a positional preference. Walks are priced like the engine does (walk cost, hazards, the
   * attacks of opportunity they provoke; never a lethal one). Same result shape: { moveTo, path, skillId, slot, target,
   * score, actionScore } | null.
   */
  function bestWithin(unit, api, skills, style, within, bonus) {
    const ox = unit.x, oy = unit.y, origin = { x: ox, y: oy }, spots = [];
    if (within(unit)) spots.push({ x: ox, y: oy, cost: 0, path: [] });
    api.reachable(unit).forEach(function (e) { if (within(e)) spots.push(e); });
    let best = null;
    try {
      spots.forEach(function (p) {
        const walked = p.path && p.path.length;
        const risk = walked ? DD.AI.pathRisk(unit, p) : { lethal: false, penalty: 0 };
        const aoo = walked ? api.aooCost(unit, p) : 0;
        if (risk.lethal || aoo === Infinity) return;
        unit.x = p.x; unit.y = p.y;
        const b = DD.AI.bestAttack(unit, { skills: skills, style: style, noMove: true });
        const fix = b ? engagedFix(unit, b, p, origin, style) : 0;
        unit.x = ox; unit.y = oy;
        if (!b) return;
        const sc = b.score + fix - risk.penalty - aoo - (p.cost || 0) * 0.2 + (bonus ? bonus(p) : 0);
        if (!best || sc > best.score) {
          best = { moveTo: { x: p.x, y: p.y }, path: p.path, skillId: b.skillId, slot: b.slot, target: b.target, score: sc, actionScore: b.actionScore };
        }
      });
    } finally { unit.x = ox; unit.y = oy; }
    return best;
  }

  /**
   * One action on its turn: the best (move, skill, target) for some skills and a movement style, walk there, then use
   * it at once — or wind it up (opts.windUp: wind-up options; only an elite's signature). Nothing in reach: approach
   * (keep tiles short) and try again from where it stands. opts: { skills, style, noMove, keep (false = don't approach),
   * within (destination filter), bonus (positional preference inside `within`), windUp, minScore (the action's own score
   * it must still reach after an interrupted walk) }.
   * Returns { done, moved, skillId, target (the unit it aimed at, or null), windup }; it never moves twice, so callers
   * can chain a fallback with noMove when `moved` is set.
   */
  function plan(unit, api, opts) {
    const res = { done: false, moved: false, skillId: null, target: null, windup: null };
    if (incapacitated(unit)) return res;
    const style = opts.style || api.style, skills = opts.skills || null;
    const x0 = unit.x, y0 = unit.y;
    let b = opts.within && !opts.noMove ? bestWithin(unit, api, skills, style, opts.within, opts.bonus)
      : api.bestAttack(unit, { skills: skills, style: style, noMove: !!opts.noMove });
    if (!b && !opts.noMove && opts.keep !== false) {
      const set = approach(unit, api, opts.keep || 0, opts.within);
      res.moved = set || unit.x !== x0 || unit.y !== y0;
      if (incapacitated(unit)) return res;
      b = api.bestAttack(unit, { skills: skills, style: style, noMove: true });
    } else if (b && (b.moveTo.x !== x0 || b.moveTo.y !== y0)) {
      const ok = DD.AI.moveTo(unit, b.moveTo.x, b.moveTo.y, b.path);
      res.moved = true;   // its move is spent, also when a reaction stopped it on its first tile
      if (incapacitated(unit)) return res;
      if (!ok) b = api.bestAttack(unit, { skills: skills, style: style, noMove: true });
    }
    // a reaction cut the walk short and the re-aimed action is no longer worth it (a breath at an empty cone)
    if (!b || (opts.minScore && !(b.actionScore >= opts.minScore))) return res;
    const def = DD.getSkill(b.skillId);
    const tu = G().unitAt(b.target.x, b.target.y);
    res.skillId = b.skillId;
    res.target = active(tu) && def && def.target && def.target.type === 'unit' ? tu : null;
    const aim = res.target || b.target;
    if (opts.windUp) { res.windup = api.windUp(unit, b.skillId, aim, opts.windUp); res.done = !!res.windup; }
    else res.done = api.act(unit, b.skillId, aim);
    return res;
  }

  // =============================================================================================================
  // Statuses
  // =============================================================================================================
  DD.registerStatus({
    id: 'a3_thief', name: 'Thief!', icon: '💰', color: '#ffd23f', type: 'debuff', stacking: 'none', maxStacks: 1,
    decay: 'never', defaultTurns: -1,
    desc: function () { return 'Pocketed gold from a dragon\'s hoard: Young Red Dragons deal +' + THIEF_BONUS + ' damage to it and hunt it first.'; },
  });

  DD.registerStatus({
    id: 'a3_monologue', name: 'Monologuing', icon: '🎭', color: '#b48cff', type: 'debuff', stacking: 'none', maxStacks: 1,
    decay: 'never', defaultTurns: -1,
    desc: function (st) {
      const left = Math.max(0, MONO_BREAK - ((st && st.data && st.data.taken) || 0));
      return 'Mid-monologue (it lands at the start of his next turn): ' + left + ' more damage interrupts it (he is left Vulnerable and the party gains ' +
        MONO_HYPE + ' Hype). A stun or silence also stops it.';
    },
    hooks: {
      onTakeDamage: function (d, st) {
        const u = d.target;
        if (!u || u.dead) return;
        const it = windupOf(u, 'a3_dk_monologue');
        if (!it || u.hp <= 0) { A().removeStatus(u, 'a3_monologue', { silent: true }); return; }
        st.data.taken = (st.data.taken || 0) + (d.dealt || 0) + (d.blocked || 0);
        if (st.data.taken >= MONO_BREAK) interruptMonologue(u);
      },
    },
  });

  // Elite tenacity: after a stun-like status lands, the elite can't be stunned / slept / frozen again for 2 of its turns.
  DD.registerStatus({
    id: 'a3_unshakeable', name: 'Unshakeable', icon: '🗿', color: '#c9b48f', type: 'buff', stacking: 'refresh', maxStacks: 1,
    decay: 'turnEnd', defaultTurns: 2,
    desc: function (st) {
      return 'Just shook off a stun: no stun, sleep or freeze can land on it' + (st && st.turns > 0 ? ' (' + st.turns + ' more turn' + (st.turns === 1 ? '' : 's') + ')' : '') + '.';
    },
  });
  /** Hooks for elite defs: cancel stun-likes while Unshakeable; become Unshakeable after one lands. */
  const TENACITY = {
    modifyStatus: function (s) {
      if (!s.unit || !A().isStunLike(s.id) || !has(s.unit, 'a3_unshakeable')) return;
      s.cancel = true;
      DD.FX.text(s.unit, 'Shrugs it off!', { color: '#e8dcc0', size: 14 });
    },
    onStatusApplied: function (unit, inst) {
      if (inst && A().isStunLike(inst.id) && active(unit)) A().addStatus(unit, 'a3_unshakeable', { turns: 2 }, null);
    },
  };
  function withTenacity(hooks) {
    const own = hooks || {};
    const out = Object.assign({}, TENACITY, own);
    if (own.onStatusApplied) {
      out.onStatusApplied = function (unit, inst, src, extra) {
        TENACITY.onStatusApplied(unit, inst, src, extra);
        own.onStatusApplied(unit, inst, src, extra);
      };
    }
    return out;
  }
  const UNSHAKEABLE_LINE = 'Unshakeable: after a stun, sleep or freeze lands, no other can for its next 2 turns.';

  DD.registerStatus({
    id: 'a3_debt', name: 'Infernal Debt', icon: '🧾', color: '#ff8a3a', type: 'debuff', stacking: 'stack', maxStacks: DEBT_MAX,
    decay: 'never', defaultTurns: -1,
    desc: function (st) {
      return 'At the start of its turn: loses ' + st.stacks + ' HP (ignores Block), then the Debt grows by 1 (max ' + DEBT_MAX +
        '). Each skill hit it lands on a Pit Fiend Accountant pays off ' + DEBT_PAYOFF + '. Forgiven when he dies.';
    },
    hooks: {
      onTurnStart: function (unit, st) {
        const src = st.source && DD.Combat.byId(st.source);
        DD.FX.text(unit, '🧾 Interest!', { color: '#ff8a3a', size: 14 });
        A().damage(src || null, unit, st.stacks, { cause: 'status', ignoreBlock: true, tags: ['debt'] });
        if (active(unit) && A().getStatus(unit, 'a3_debt') === st) st.stacks = Math.min(DEBT_MAX, st.stacks + 1);
      },
      onDealDamage: function (d, st) {
        const u = d.source, tgt = d.target;
        // a hit = skill damage (a Poison or Bleed ticking on him is not a payment)
        if (!u || !tgt || tgt.defId !== 'a3_pit_fiend' || d.cause !== 'skill' || !((d.dealt || 0) + (d.blocked || 0) > 0)) return;
        if (A().getStatus(u, 'a3_debt') !== st) return;
        st.stacks -= DEBT_PAYOFF;
        if (st.stacks <= 0) A().removeStatus(u, 'a3_debt', { text: 'Debt paid!' });
        else DD.FX.text(u, '−' + DEBT_PAYOFF + ' Debt', { color: '#ffd76a', size: 13 });
      },
    },
  });

  // =============================================================================================================
  // Objects
  // =============================================================================================================
  /** Hoard piles within HOARD_RANGE of a unit (a dragon is only invincible while sitting on its hoard). */
  function hoardNear(u) {
    const s = S();
    let n = 0;
    if (s) s.grid.tiles.forEach(function (t) { if (t.obj && t.obj.id === 'a3_hoard_pile' && Math.abs(t.x - u.x) + Math.abs(t.y - u.y) <= HOARD_RANGE) n++; });
    return n;
  }
  /** A living hoarder guards this tile (the pile is worth more than its gold to grab). */
  function guarded(tile) {
    const s = S();
    return !!s && s.units.some(function (u) { return active(u) && u.defId === 'a3_red_dragon' && Math.abs(tile.x - u.x) + Math.abs(tile.y - u.y) <= HOARD_RANGE; });
  }

  /** A hero-side unit walks onto a hoard pile: pockets its gold and is branded a Thief. */
  function pocketHoard(unit, o, tile) {
    if (!active(unit) || unit.side !== 'hero') return;
    const s = S();
    const gold = o.data && o.data.gold > 0 ? o.data.gold : s.rng.int(4, 8);
    A().removeObject(tile.x, tile.y);
    A().gainGold(gold);
    DD.FX.particles(tile, { kind: 'coins', count: 14 });
    DD.FX.text(unit, '+' + gold + ' gold', { color: '#ffd76a' });
    A().log(unit.name + ' pockets ' + gold + ' gold from the hoard. Bold.', 'hero');
    A().addStatus(unit, 'a3_thief', {}, null);
    s.units.forEach(function (u) { if (active(u) && u.defId === 'a3_red_dragon') A().bark(u, 'thief'); });
  }

  DD.registerObject({
    id: 'a3_hoard_pile', name: 'Hoard Pile', blocksMove: false, blocksLos: false, hp: 0, height: 0.45, color: '#f4c430',
    desc: 'A dragon\'s hoard. At the end of each of its turns a Young Red Dragon gains ' + HOARD_BLOCK + ' Block per pile within ' + HOARD_RANGE +
      ' tiles of it (max ' + HOARD_MAX + '). Walk over it to pocket the gold (and be branded a Thief). Flyers can\'t reach down that far.',
    // pocketing is a floor effect (v2: flyers float over the gold); AutoPlay checks it too, the hint says it anyway
    autoplay: function (unit, obj, tile) { return unit && !G().feelsFloor(unit) ? 0 : tile && guarded(tile) ? 10 : 3; },
    onEnter: function (unit, o, tile) { pocketHoard(unit, o, tile); },
    draw: function (g, obj, t) {
      const tw = Math.sin(t * 2.6 + ((obj.data && obj.data.gold) || 0));
      g.ellipse(0, 3, 16, 6.5, 'rgba(0,0,0,0.28)', false);
      g.ellipse(0, 0, 14.5, 6.2, '#a87810', true);
      g.ellipse(-1, -3.5, 11, 5, '#e3ad1e', true);
      g.ellipse(-2, -7, 7, 3.4, '#ffd23f', true);
      [[-9, -1], [7, -2], [-3, 1.5], [3, -6], [10, 1], [-6, -6]].forEach(function (c) { g.ellipse(c[0], c[1], 2.3, 1.2, '#fff2a8', '#9a6f08'); });
      // a goblet and a ruby, because a hoard needs props
      g.rect(-10, -15, 4.6, 5.5, '#ffd23f', true, 1);
      g.ellipse(-7.7, -15, 2.6, 1.2, '#fff2a8', true);
      g.line(-7.7, -9.5, -7.7, -7.5, '#c99a12', 1.6);
      g.poly([[5, -11], [8, -14.5], [11, -11], [8, -7.5]], '#e0245e', true);
      g.glow(8, -11, 7 + tw, '#ff6a8a', 0.4);
      if (tw > 0.55) { g.line(-3, -13, -3, -7, '#ffffff', 1); g.line(-6, -10, 0, -10, '#ffffff', 1); }
    },
  });

  DD.registerObject({
    id: 'a3_snack_bowl', name: "DM's Snack Bowl", blocksMove: true, blocksLos: false, hp: 48, height: 0.7, color: '#ff8c1a',
    desc: 'Cheese puffs of destiny (48 HP). Hell hounds want it badly. If it is eaten, the session is over.',
    draw: function (g, obj, t) {
      const c = g.ctx;
      g.ellipse(0, 3, 16, 6.5, 'rgba(0,0,0,0.3)', false);
      c.beginPath(); c.moveTo(-14, -9); c.quadraticCurveTo(-12, 5, 0, 5); c.quadraticCurveTo(12, 5, 14, -9); c.closePath();
      c.fillStyle = '#2f8fd8'; c.fill(); c.strokeStyle = g.outline; c.lineWidth = g.lw; c.stroke();
      g.line(-11, -2, 11, -2, '#ffd23f', 1.6);
      g.ellipse(0, -9, 14, 5.2, '#1d6aa8', true);
      // the heap of cheese puffs (rendered in loving detail)
      const puffs = [[-8, -10], [-3, -11], [3, -10.5], [8, -9.5], [-5, -13.5], [1, -14], [6, -13], [-1, -17]];
      puffs.forEach(function (p, i) { g.ellipse(p[0], p[1], 3.3, 1.8, i % 2 ? '#ff9a2a' : '#ff7a12', '#a64b00', 0.5 * ((i % 3) - 1)); });
      g.glow(0, -12, 12, '#ffb347', 0.2 + 0.08 * Math.sin(t * 3));
      g.text('DM', 0, 0, 6, '#ffffff');
    },
  });

  // =============================================================================================================
  // Imp Influencer (minion) — blinks instead of walking, Livestream marks
  // =============================================================================================================
  eskill({
    id: 'a3_imp_golive', name: 'Go Live!', icon: '📱', kind: 'spell', tags: ['ranged', 'fire', 'mark'], anchor: 'unit', cooldown: 1,
    // v2 (imps now dive the weakest hero): 6 + Mark 3 (was 7 + 4) keeps the act's most common minion in its 6-8 band
    levels: [{ dmg: 6, mark: 3, r: 6 }], target: { type: 'unit', range: function (L) { return [1, L.r]; }, filter: 'enemy', los: false },
    desc: function (L) { return 'Deal ' + L.dmg + ' fire damage to a target up to ' + L.r + ' tiles away (no line of sight needed) and Mark it: the next damage it takes is +' + L.mark + '.'; },
    flavor: 'Smash that like button. With your face.',
    execute: function (ctx) {
      shoot(ctx, 'orb', '#ff5fa2');
      attackBark(ctx.user);
      ctx.foes.forEach(function (f) {
        if (!active(f)) return;
        A().damage(ctx.user, f, ctx.L.dmg, { element: 'fire' });
        if (!active(f)) return;
        A().addStatus(f, 'marked', { stacks: ctx.L.mark }, ctx.user);
        DD.FX.text(f, '🔴 LIVE', { color: '#ff5fa2', size: 15 });
      });
    },
    aiScore: function (ctx) { const u = ctx.targetUnit; return u && !has(u, 'marked') ? 3 : 0; },
  });

  eskill({
    id: 'a3_imp_hottake', name: 'Hot Take', icon: '🌶️', kind: 'spell', tags: ['ranged', 'fire'], anchor: 'unit',
    levels: [{ dmg: 7, r: 5 }], target: { type: 'unit', range: function (L) { return [1, L.r]; }, filter: 'enemy', los: true },
    desc: function (L) { return 'Deal ' + L.dmg + ' fire damage to a target up to ' + L.r + ' tiles away.'; },
    flavor: 'Controversial opinion: you, but on fire.',
    execute: function (ctx) {
      shoot(ctx, 'fireball', '#ff6a1a', { size: 0.7 });
      attackBark(ctx.user, 0.2);
      hitFoes(ctx, ctx.L.dmg, { element: 'fire' });
    },
    aiScore: function (ctx) { const u = ctx.targetUnit; return u && has(u, 'marked') ? 4 : 0; },
  });

  /**
   * Best tile within BLINK_RANGE to attack from (the imp's own tile included): the diver's pick of target (the weakest
   * hero it can reach, DD.AI 'assassin' targeting) from a spot about 3 tiles from the nearest hero (never next to one).
   */
  function blinkSpot(unit, api) {
    const foes = api.foes(unit);
    if (!foes.length) return null;
    const ox = unit.x, oy = unit.y, R = BLINK_RANGE;
    let best = null;
    try {
      for (let dy = -R; dy <= R; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          if (Math.abs(dx) + Math.abs(dy) > R) continue;
          const x = ox + dx, y = oy + dy, stay = !dx && !dy;
          if (!stay) {
            const t = G().tile(x, y);
            // a web only snares a walker (v2: the imp flies over it, unless something grounds it)
            if (!t || !G().isFree(x, y, unit) || G().hazardAt(x, y, unit) || (t.surface && t.surface.id === 'web' && G().feelsSurface(unit, t.surface))) continue;
          }
          unit.x = x; unit.y = y;
          const b = DD.AI.bestAttack(unit, { noMove: true });
          const near = nearestDist(unit, foes);
          let sc = b ? b.score : -Math.abs(near - 3) - 5;
          if (near <= 1) sc -= 6;
          else if (near === 2) sc -= 1;   // influencers film from a safe distance
          if (!stay) sc -= 0.75;
          if (!best || sc > best.sc) best = { x: x, y: y, sc: sc };
        }
      }
    } finally { unit.x = ox; unit.y = oy; }
    return best && (best.x !== ox || best.y !== oy) ? best : null;
  }

  /** Its turn: blink (a teleport: never provokes) to the best spot to shoot from (not while Rooted / held), then shoot. */
  function impPlan(unit, api) {
    if (!A().cantMove(unit)) {
      const spot = blinkSpot(unit, api);
      if (spot) {
        const from = { x: unit.x, y: unit.y };
        if (A().teleport(unit, spot.x, spot.y)) {
          DD.FX.particles(from, { kind: 'glitter', count: 10 });
          DD.FX.text(unit, '✨ Blink!', { color: '#ff8ad8', size: 13 });
        }
      }
    }
    plan(unit, api, { noMove: true });
  }

  function impOverlay(g, t) {
    const b = Math.sin(t * 3) * 0.6;
    g.line(4, -8, 11, -24 + b, '#2a2a33', 1.7);
    g.arc(12.5, -29 + b, 7, 0, Math.PI * 2, 'rgba(255,240,190,0.75)', 1.4);
    g.rect(9.5, -33.5 + b, 6.5, 9.5, '#1d1d26', undefined, 1.4);
    g.rect(10.6, -32.4 + b, 4.3, 7.3, '#7af0ff', null, 0.8);
    g.circle(17, -34 + b, 1.7, Math.sin(t * 6) > 0 ? '#ff2a4a' : '#6a0f1d', null);
  }

  DD.registerEnemy({
    id: 'a3_imp_influencer', name: 'Imp Influencer', act: 3, tier: 'minion', hp: 18, mov: 5, armor: 0, init: 3,
    tags: ['devil', 'imp'], flags: { flying: true, noProvoke: true }, resist: { fire: 0.5 },
    sprite: { base: 'flyer', scale: 0.78, shape: { body: 'imp' }, outfit: 'tunic',
      palette: { skin: '#e8485a', cloth: '#ff5fa2', cloth2: '#2a1d33', hair: '#2a1d33', eye: '#fff36b', accent: '#ff5fa2', wing: '#7a1f3a', metal: '#ffd23f' },
      head: { eyes: 'glow', mouth: 'grin', face: 'sunglasses', hair: 'mohawk' }, bling: ['chain'],
      aura: { kind: 'sparkles', color: '#ff8ad8' }, overlay: impOverlay },
    // the act's diver: it picks on the weakest hero it can reach (DD.AI 'assassin' targeting); blinks never provoke
    skills: ['a3_imp_golive', 'a3_imp_hottake'], ai: impPlan, aiStyle: DIVER, xp: 3, gold: [1, 3],
    passive: { name: 'Blink', icon: '✨', desc: function () {
      return 'Sneaky: on its turn it teleports up to ' + BLINK_RANGE + ' tiles instead of walking (never provoking; not while Rooted) to a spot out of melee reach ' +
        '(3+ tiles from the heroes when it can), then shoots the weakest hero it can reach (the wounded and the squishy first). Go Live! needs no line of sight.';
    } },
    barks: {
      spawn: ['Hey hellions, we\'re LIVE!', 'Don\'t forget to like and subscribe!', 'Ooh, this dungeon has great lighting.'],
      attack: ['Going live in 3, 2...', 'Hot take incoming!', 'This is SO going on my story.', 'Ratio + you fell off + fireball.'],
      hurt: ['Ow! That\'s going in the vlog.', 'My ring light!', 'Unfollowed. Blocked. Reported.'],
      death: ['Stream... ending... smash... like...', 'Clear my search history!', 'I was about to get verified...'],
    },
    desc: 'Sneaky: it blinks up to 5 tiles instead of walking (you can\'t pin it down) and livestreams the weakest hero it can reach; Go Live! ' +
      'Marks them for the next hit. Always first to post (initiative +3). 2.3 million followers, every one of them another imp.',
  });

  // =============================================================================================================
  // Hell Hound — fire cone that sets the floor alight
  // =============================================================================================================
  eskill({
    id: 'a3_hound_breath', name: 'Hot Dog Breath', icon: '🌭', kind: 'attack', tags: ['fire', 'aoe', 'objects'], anchor: 'self', cooldown: 2,
    levels: [{ dmg: 9 }], target: { type: 'dir' }, area: { shape: 'cone', size: 2 },
    desc: function (L) { return 'Breathe fire in a 2-deep cone in front (4 tiles): ' + L.dmg + ' fire damage to everyone and every object there (friends too). The floor there burns until the end of next round.'; },
    flavor: 'Somebody fed it the spicy kibble again.',
    execute: function (ctx) {
      attackBark(ctx.user);
      ctx.tiles.forEach(function (p, i) { DD.FX.particles(p, { kind: 'fire', count: 10, parallel: i > 0 }); });
      DD.FX.sound('fire');
      hitUnits(ctx, ctx.L.dmg, { element: 'fire' });
      ctx.tiles.forEach(function (p) { hitObject(ctx.user, p, ctx.L.dmg); ignite(p.x, p.y, ctx.user, 2); });
    },
  });

  /** Free, walkable tile next to `target`, closest to `u` (hazard-free first). */
  function landingNextTo(u, target) {
    let best = null, bestScore = Infinity;
    DD.util.DIRS.forEach(function (d) {
      const x = target.x + d.x, y = target.y + d.y;
      if (!G().isFree(x, y, u) || G().isDrop(x, y)) return;
      const hz = G().hazardDamage(x, y, u);
      if (hz && hz.enter >= u.hp + (u.block || 0)) return;   // never leap to its own death (a 14-HP dancer into lava)
      const sc = Math.abs(x - u.x) + Math.abs(y - u.y) + (hz || G().hazardAt(x, y, u) ? 50 : 0);
      if (sc < bestScore) { bestScore = sc; best = { x: x, y: y }; }
    });
    return best;
  }
  /** Leap (pounce / swoop / shimmy) next to `f` unless already adjacent. Tile effects apply on landing. True if adjacent after. */
  function leapTo(u, f) {
    if (G().dist(u, f) <= 1) return true;
    if (A().cantMove(u)) { DD.FX.text(u, 'Rooted: can\'t leap!', { color: '#9fdc7a', size: 13 }); return false; }
    const spot = landingNextTo(u, f);
    if (!spot) { DD.FX.text(u, 'No room to land!', { color: '#d0d0d0', size: 13 }); return false; }
    const from = { x: u.x, y: u.y };
    A().face(u, spot);
    u.x = spot.x; u.y = spot.y;
    A().touch();
    DD.FX.jump(u, from, spot);
    A().enterTile(u, G().tile(spot.x, spot.y), 'move');
    return active(u) && active(f) && G().dist(u, f) <= 1;
  }

  eskill({
    id: 'a3_hound_pounce', name: 'Pounce', icon: '🐾', kind: 'attack', tags: ['melee', 'leap'], anchor: 'unit', cooldown: 1,
    levels: [{ dmg: 11, r: 4 }], target: { type: 'unit', range: function (L) { return [1, L.r]; }, filter: 'enemy', los: true },
    desc: function (L) { return 'Leap next to a target up to ' + L.r + ' tiles away (not while Rooted) and bite it for ' + L.dmg + ' damage.'; },
    flavor: 'Fetch! (The stick is your leg.)',
    execute: function (ctx) {
      const u = ctx.user, f = ctx.targetUnit;
      if (!f || !active(f) || !DD.Grid.hostile(u, f) || !leapTo(u, f)) return;
      DD.FX.lunge(u, f);
      attackBark(u, 0.25);
      if (active(f)) A().damage(u, f, ctx.L.dmg);
    },
  });

  eskill({
    id: 'a3_hound_bite', name: 'Chew Toy', icon: '🦴', kind: 'attack', tags: ['melee', 'objects'], anchor: 'self',
    levels: [{ dmg: 9 }], target: { type: 'dir' },
    desc: function (L) { return 'Bite the adjacent tile: ' + L.dmg + ' damage to the foe (or the object) there.'; },
    flavor: 'Who\'s a good boy? Not him. Never him.',
    execute: function (ctx) {
      lunge(ctx);
      attackBark(ctx.user, 0.2);
      hitFoes(ctx, ctx.L.dmg);
      if (ctx.target && !ctx.foes.length) hitObject(ctx.user, ctx.target, ctx.L.dmg);
    },
  });

  function houndOverlay(g, t) {
    const glow = 0.55 + 0.25 * Math.sin(t * 4);
    g.glow(-1, -15, 9, '#ff7a1a', 0.35 * glow);
    g.line(-8, -17, -4, -14, 'rgba(255,170,60,' + glow.toFixed(2) + ')', 1.3);
    g.line(-4, -14, -1, -17, 'rgba(255,170,60,' + glow.toFixed(2) + ')', 1.3);
    g.line(2, -15, 6, -13, 'rgba(255,170,60,' + glow.toFixed(2) + ')', 1.3);
    // smoke puffing from the nostrils
    const p = (t * 0.9) % 1;
    g.circle(23 + p * 4, -21 - p * 7, 1.2 + p * 1.6, 'rgba(120,110,120,' + (0.7 * (1 - p)).toFixed(2) + ')', null);
  }

  DD.registerEnemy({
    id: 'a3_hell_hound', name: 'Hell Hound', act: 3, tier: 'normal', hp: 34, mov: 4, armor: 0, init: 2,
    tags: ['devil', 'beast'], resist: { fire: 0, frost: 1.5 },
    sprite: { base: 'quadruped', scale: 1.02, shape: { legs: 'long', body: 'long', snout: 'long' },
      // ember-red fur: the old near-black body vanished against the hellscape's obsidian floor
      palette: { skin: '#76291f', cloth2: '#ff9a3a', belly: '#ff9a3a', hair: '#3d1513', eye: '#ffd23f', accent: '#ff4d1a', collar: '#2a2a33', horn: '#2a1416' },
      head: { size: 1.15, ears: 'pointy', horns: 'demon', eyes: 'glow', mouth: 'fangs' }, tail: 'devil', extras: ['collar'],
      aura: { kind: 'flames', color: '#ff6a1a' }, overlay: houndOverlay },
    // a brute: it sticks to the hero next to it; Chew Toy is its attack of opportunity (the breath and the pounce are not)
    skills: ['a3_hound_breath', 'a3_hound_pounce', 'a3_hound_bite'], ai: MELEE, xp: 5, gold: [3, 6],
    passive: { name: 'Off the Leash', icon: '🐾', desc: function () {
      return 'On its turn it runs up to 4 tiles, then bites the hero next to it (it sticks to that one), Pounces on a hero up to ' + lvl('a3_hound_pounce').r +
        ' tiles away or breathes fire in a short cone that leaves the floor burning. Walk away from it and it bites (attack of opportunity).';
    } },
    barks: {
      spawn: ['*sizzling woof*', 'BORK. (Ominously.)', '*sniffs you, smokes slightly*'],
      attack: ['*flaming growl*', 'Who\'s a bad boy? HIM.', '*hot dog noises*'],
      hurt: ['*sad sizzle*', '*yelps in Infernal*'],
      death: ['*whimper* ...good boy?', '*goes to live on a farm (Hell)*', '*final ember*'],
    },
    desc: 'Runs up and bites, or pounces on a hero up to 4 tiles further (walls and corners break its sight), or breathes fire that leaves the ' +
      'floor burning. It sticks to whoever is next to it and bites anyone who walks away. Quick off the leash (initiative +2). Immune to fire, ' +
      'weak to frost. Fetches souls; does not drop them.',
  });

  // =============================================================================================================
  // Mind Flayer Life Coach — charm + confusing psychic cone
  // =============================================================================================================
  eskill({
    id: 'a3_flayer_blast', name: 'Mind Blast: Hustle Culture', icon: '🧠', kind: 'spell', tags: ['psychic', 'aoe'], anchor: 'self', cooldown: 2,
    levels: [{ dmg: 9 }], target: { type: 'dir' }, area: { shape: 'cone', size: 3 },
    desc: function (L) { return 'Psychic blast in a 3-deep cone in front (9 tiles): ' + L.dmg + ' psychic damage to foes there, and they are Confused for their next turn (moving costs 2 AP).'; },
    flavor: 'Rise and grind. Mostly grind. Your brain, specifically.',
    execute: function (ctx) {
      attackBark(ctx.user);
      ctx.tiles.forEach(function (p, i) { DD.FX.tile(p.x, p.y, 'glow', { color: '#c48aff', parallel: i > 0 }); });
      ctx.foes.forEach(function (f) {
        if (!active(f)) return;
        A().damage(ctx.user, f, ctx.L.dmg, { element: 'psychic' });
        if (active(f)) A().addStatus(f, 'confused', { turns: 1 }, ctx.user);
      });
    },
  });

  eskill({
    id: 'a3_flayer_advice', name: 'Unsolicited Life Advice', icon: '💬', kind: 'spell', tags: ['psychic', 'ranged', 'charm'], anchor: 'unit', cooldown: 1,
    levels: [{ dmg: 8, r: 5 }], target: { type: 'unit', range: function (L) { return [1, L.r]; }, filter: 'enemy', los: false },
    desc: function (L) { return 'Deal ' + L.dmg + ' psychic damage to a target up to ' + L.r + ' tiles away (no line of sight needed) and Charm it for its next turn (it can\'t damage the Life Coach and has 1 less AP).'; },
    flavor: 'Have you considered simply not being stabbed?',
    execute: function (ctx) {
      shoot(ctx, 'orb', '#c48aff');
      attackBark(ctx.user);
      ctx.foes.forEach(function (f) {
        if (!active(f)) return;
        A().damage(ctx.user, f, ctx.L.dmg, { element: 'psychic' });
        if (active(f)) { A().addStatus(f, 'charmed', { turns: 1 }, ctx.user); DD.FX.particles(f, { kind: 'hearts', count: 6 }); }
      });
    },
    aiScore: function (ctx) { const u = ctx.targetUnit; return u && !has(u, 'charmed') ? 2 : -2; },
  });

  function flayerOverlay(g, t) {
    // four face tentacles, curling outward at the tips
    for (let i = 0; i < 4; i++) {
      const x = 1 + i * 2.2, sway = Math.sin(t * 3 + i * 1.3) * 1.3, out = (i - 1.5) * 1.6;
      g.limb(x, -21.5, x + out + sway, -14 + (i % 2) * 1.5, 1.05, i % 2 ? '#7d4f9e' : '#b48ad8', x + sway * 0.5, -17.5);
    }
    // headset: a life coach is always on a call
    g.arc(0, -29, 12.5, Math.PI * 1.05, Math.PI * 1.95, '#1d1d26', 1.6);
    g.line(9.5, -24, 6.5, -20.5, '#1d1d26', 1.2);
    g.circle(6.2, -20.2, 1.3, '#1d1d26', null);
  }

  DD.registerEnemy({
    id: 'a3_mind_flayer', name: 'Mind Flayer Life Coach', act: 3, tier: 'normal', hp: 36, mov: 3, armor: 0, init: 1,
    tags: ['aberration'], resist: { psychic: 0.5 },
    sprite: { base: 'humanoid', scale: 1.02, build: 'slim', outfit: 'coat',
      palette: { skin: '#9b6fc4', cloth: '#1f7a6e', cloth2: '#f4f1e8', eye: '#ffffff', accent: '#c48aff', metal: '#ffd23f', book: '#f4f1e8' },
      head: { size: 1.15, hair: 'none', ears: 'pointy', eyes: 'glow', mouth: 'none' }, mainhand: 'book', bling: ['rings'], extras: ['collar'],
      aura: { kind: 'runes', color: '#c48aff' }, overlay: flayerOverlay },
    skills: ['a3_flayer_blast', 'a3_flayer_advice'], ai: KITER, xp: 5, gold: [3, 6],
    passive: { name: 'Life Coaching', icon: '🧠', desc: function () {
      return 'On its turn it keeps 2 tiles from the heroes and coaches whoever is in range: Unsolicited Life Advice charms a hero up to ' +
        lvl('a3_flayer_advice').r + ' tiles away (no line of sight needed), or Hustle Culture confuses everyone in its 3-deep cone. It makes no attacks of opportunity.';
    } },
    barks: {
      spawn: ['Your brain is your greatest asset. I would know.', 'Let\'s unlock your potential. And your skull.'],
      attack: ['Have you tried waking up at 4 AM?', 'Sounds like a mindset problem.', 'Visualize success. Now visualize me eating it.'],
      hurt: ['This is a growth opportunity.', 'Rude. One star.'],
      death: ['My seminar... is non-refundable...', 'Remember... it\'s all... mindset...'],
    },
    desc: 'Keeps its distance and charms a hero up to 5 tiles away (that hero can\'t hurt it and has 1 less AP next turn) or confuses everyone ' +
      'in a big cone. Up at 4 AM every day (initiative +1). Sells a brain-boosting course. Ingredients: your brain.',
  });

  // =============================================================================================================
  // Floating Eyeball Intern — piercing beams (coworkers included), the overtime beam knocks it out
  // =============================================================================================================
  /**
   * Tiles of a ray from the user through the target, len tiles long (stops at walls / sight blockers): a straight
   * "gaze" toward its target that pierces everyone on the way.
   */
  function rayTiles(ctx) {
    const u = ctx.user, tg = ctx.target, len = (ctx.L && ctx.L.len) || 5;
    if (!u || !tg || (tg.x === u.x && tg.y === u.y)) return [];
    const dx = tg.x - u.x, dy = tg.y - u.y, n = Math.max(Math.abs(dx), Math.abs(dy));
    const out = [];
    for (let k = 1; k <= len; k++) {   // one step along the major axis per tile
      const x = u.x + Math.round(dx * k / n), y = u.y + Math.round(dy * k / n);
      const t = G().tile(x, y);
      if (!t) break;
      const td = G().terrain(t);
      if (G().blocksLos(x, y) || (td.walkable === false && !td.pit && !td.liquid)) break;
      out.push({ x: x, y: y });
    }
    return out;
  }

  eskill({
    id: 'a3_eye_stare', name: 'Piercing Stare', icon: '👁️', kind: 'attack', tags: ['ranged', 'pierce'], anchor: 'unit',
    levels: [{ dmg: 9, len: 5 }], target: { type: 'unit', range: [1, 5], filter: 'enemy', los: true }, area: { shape: 'custom', fn: rayTiles },
    desc: function (L) { return 'A ' + L.len + '-tile ray toward a target up to 5 tiles away (stops at walls): ' + L.dmg + ' damage to every unit along it, coworkers included.'; },
    flavor: 'It was told to "really look at" the problem.',
    execute: function (ctx) {
      const end = ctx.tiles[ctx.tiles.length - 1];
      if (end) DD.FX.beam(ctx.user, end, { color: '#ff3a3a', width: 4 });
      attackBark(ctx.user, 0.25);
      hitUnits(ctx, ctx.L.dmg);
    },
  });

  eskill({
    id: 'a3_eye_overtime', name: 'Unpaid Overtime Beam', icon: '⏰', kind: 'attack', tags: ['ranged', 'pierce'], anchor: 'self', cooldown: 3,
    levels: [{ dmg: 12, len: 8 }], target: { type: 'dir' }, area: { shape: 'line', size: function (L) { return L.len; } },
    desc: function (L) {
      return 'Fire an ' + L.len + '-tile beam in a straight line (stops at walls): ' + L.dmg + ' damage to every unit in it, coworkers included. ' +
        'Then it passes out: Stunned for its next turn.';
    },
    flavor: 'No lunch break, no weekends, no mercy. Then a nap under the desk.',
    execute: function (ctx) {
      const end = ctx.tiles[ctx.tiles.length - 1];
      if (end) DD.FX.beam(ctx.user, end, { color: '#ff1a4a', width: 9 });
      DD.FX.shake(7, 300);
      attackBark(ctx.user, 0.5);
      hitUnits(ctx, ctx.L.dmg);
      if (active(ctx.user)) {
        A().addStatus(ctx.user, 'stun', { turns: 1 }, null);
        A().bark(ctx.user, 'overtime');
      }
    },
    // saved for a line holding two or more of its foes (it knocks itself out)
    aiScore: function (ctx) { return ctx.foes.filter(active).length >= 2 ? 0 : -100; },
  });

  function eyeOverlay(g, t) {
    // bloodshot from the night shift
    g.line(-8, -6, -5, -8, '#e0526a', 0.8); g.line(-5, -8, -4, -11, '#e0526a', 0.8);
    g.line(-9, -14, -6, -13, '#e0526a', 0.8); g.line(-4, -18, -2, -16, '#e0526a', 0.8);
    // lanyard + intern badge
    g.line(-5, -3, 0, 4, '#3f8fd8', 1);
    g.line(5, -3, 0, 4, '#3f8fd8', 1);
    g.rect(-2.6, 3.5, 5.2, 6, '#ffffff', undefined, 1);
    g.rect(-2.6, 3.5, 5.2, 1.8, '#3f8fd8', null);
    // propeller beanie
    g.arc(0, -19.5, 6.5, Math.PI, Math.PI * 2, undefined, undefined, '#e23b3b');
    g.rect(-6.5, -20.2, 13, 1.6, '#ffd23f', null);
    g.line(0, -26, 0, -29, '#2a2a33', 1);
    const s = Math.sin(t * 18) * 6;
    g.ellipse(0, -29.5, Math.abs(s) + 0.6, 1.2, '#3f8fd8', undefined);
  }

  DD.registerEnemy({
    id: 'a3_eyeball_intern', name: 'Floating Eyeball Intern', act: 3, tier: 'normal', hp: 30, mov: 3, armor: 0, init: 2,
    tags: ['aberration'], flags: { flying: true }, resist: { lightning: 1.5 },
    sprite: { base: 'flyer', scale: 0.92, shape: { body: 'orb' },
      palette: { skin: '#f4ece6', eye: '#3fb06a', accent: '#3f8fd8' }, head: { mouth: 'none' },
      aura: { kind: 'glow', color: '#ff6a6a' }, overlay: eyeOverlay },
    skills: ['a3_eye_stare', 'a3_eye_overtime'], ai: SNIPER, xp: 5, gold: [3, 6],
    passive: { name: 'Unpaid Overtime', icon: '⏰', desc: function () {
      return 'On its turn it keeps 3 tiles from the heroes and stares at one in range: the ' + lvl('a3_eye_stare').len + '-tile ray pierces everyone on it, its ' +
        'coworkers too. When it can line up two heroes (or their summons) in a straight line from it, it fires the ' + lvl('a3_eye_overtime').len +
        '-tile overtime beam instead, then passes out for its next turn.';
    } },
    barks: {
      spawn: ['Hi! I\'m new! Where\'s the coffee?', 'Is this the beam meeting?'],
      attack: ['Sorry! I\'ll aim better next time!', 'Is this a ray? Am I doing rays?', 'My manager said to stare harder.'],
      hurt: ['This isn\'t in my job description!', 'Ow! HR! HR!'],
      death: ['Finally... a day off...', 'Tell my manager... I quit...'],
      overtime: ['*passes out on the keyboard*', 'Five... more... minutes...'],
    },
    desc: 'Keeps its distance; its beams pierce everyone in the line, its coworkers too: never line up in front of it. When it can line up two heroes ' +
      'in a straight line it pulls an overtime beam and then passes out for a turn. Over-caffeinated (initiative +2). Unpaid. Mostly vitreous humour.',
  });

  // =============================================================================================================
  // Rules Lawyer (Devil, Esq.) — OBJECTION! (dispel + silence), Motion to Dismiss (shove)
  // =============================================================================================================
  eskill({
    id: 'a3_lawyer_objection', name: 'OBJECTION!', icon: '☝️', kind: 'spell', tags: ['ranged', 'silence', 'dispel'], anchor: 'unit', cooldown: 2,
    levels: [{ r: 6 }], target: { type: 'unit', range: function (L) { return [1, L.r]; }, filter: 'enemy', los: false },
    desc: function (L) { return 'Overrule a target up to ' + L.r + ' tiles away (no line of sight needed): it loses every buff (even Invulnerable) and is Silenced for its next turn (no spells).'; },
    flavor: 'Page 312, paragraph 4: your fun is not rules-as-written.',
    execute: function (ctx) {
      DD.FX.text(ctx.user, 'OBJECTION!', { color: '#ffe14a', size: 22 });
      shoot(ctx, 'bolt', '#ffe14a');
      ctx.foes.forEach(function (f) {
        if (!active(f)) return;
        A().cleanse(f, 'buff');
        A().addStatus(f, 'silenced', { turns: 1 }, ctx.user);
      });
    },
    // overrules the buffed and the casters first; never objects twice to a hero who is already silenced
    aiScore: function (ctx) { const u = ctx.targetUnit; return u ? buffCount(u) * 4 + (hasSpell(u) ? 3 : 0) + (has(u, 'silenced') ? -10 : 0) : 0; },
  });

  eskill({
    id: 'a3_lawyer_motion', name: 'Motion to Dismiss', icon: '📜', kind: 'attack', tags: ['melee', 'push'], anchor: 'self',
    levels: [{ dmg: 8, push: 2 }], target: { type: 'unit', range: [1, 1], filter: 'enemy' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to an adjacent target and push it ' + L.push + ' tiles away.'; },
    flavor: 'Dismissed. With prejudice. Into the lava.',
    execute: function (ctx) {
      lunge(ctx);
      attackBark(ctx.user, 0.25);
      ctx.foes.forEach(function (f) {
        if (!active(f)) return;
        A().damage(ctx.user, f, ctx.L.dmg);
        if (active(f)) A().push(ctx.user, f, ctx.dir, ctx.L.push);
      });
    },
    aiScore: function (ctx) { return ctx.targetUnit ? pushBonus(ctx.targetUnit, ctx.dir, ctx.L.push) : 0; },
  });

  function lawyerOverlay(g, t) {
    g.poly([[0.2, -19], [2.2, -19], [1.9, -16.5], [3, -10], [1.2, -8], [-0.6, -10], [0.5, -16.5]], '#c0102a', undefined);
  }

  DD.registerEnemy({
    id: 'a3_rules_lawyer', name: 'Rules Lawyer (Devil, Esq.)', act: 3, tier: 'normal', hp: 34, mov: 3, armor: 1, init: 0,
    tags: ['devil'], resist: { fire: 0.5 },
    sprite: { base: 'humanoid', scale: 1, build: 'normal', outfit: 'coat',
      palette: { skin: '#c23a2e', cloth: '#16141c', cloth2: '#efe9d8', hair: '#f2efe6', eye: '#ffe14a', accent: '#c0102a', metal: '#d4af37', book: '#6b2a1a' },
      head: { horns: 'demon', hair: 'long', face: 'monocle', mouth: 'grin' }, tail: 'devil', mainhand: 'book', offhand: 'scroll',
      extras: ['collar'], overlay: lawyerOverlay },
    // a brute: he sticks to the hero next to him; the Motion is his attack of opportunity (OBJECTION! deals no damage)
    skills: ['a3_lawyer_objection', 'a3_lawyer_motion'], ai: MELEE, xp: 5, gold: [4, 7],
    passive: { name: 'Rules As Written', icon: '⚖️', desc: function () {
      const Lm = lvl('a3_lawyer_motion');
      return 'On his turn he walks up and files a Motion to Dismiss on the hero next to him (' + Lm.dmg + ' damage, pushed ' + Lm.push + ' tiles: into pits and lava ' +
        'given the chance; he sticks to that one), or OBJECTS to a hero up to ' + lvl('a3_lawyer_objection').r + ' tiles away: every buff gone and no spells ' +
        'next turn. Walk away from him and he files the Motion (attack of opportunity).';
    } },
    barks: {
      spawn: ['Per page 312, this encounter is perfectly legal.', 'I\'d like to see the DM\'s notes.'],
      attack: ['OBJECTION!', 'Actually, RAW says...', 'Sustained. By me.', 'Counterpoint: no.'],
      hurt: ['That\'s not how flanking works!', 'I\'ll see you in court!'],
      death: ['I demand... a retcon...', 'The errata... was on my side...'],
    },
    desc: 'Shoves the hero next to him 2 tiles (into pits and lava, given the chance), also when they try to walk away, or objects from up to 6 ' +
      'tiles away: every buff gone and no spells next turn. Silence him first: the Objection is a spell. Bills in six-minute increments of your suffering.',
  });

  // =============================================================================================================
  // Natural 1 Golem — d20 attacks (a natural 1 hits itself), 2d6 dice lob
  // =============================================================================================================
  // v2 simplicity: one roll, three outcomes (the old 2-9 / 10-19 split averaged out to the same 9 a swing)
  eskill({
    id: 'a3_golem_roll', name: 'Roll to Hit', icon: '🎲', kind: 'attack', tags: ['melee', 'aoe', 'random'], anchor: 'self',
    levels: [{ dmg: 9, crit: 18, oops: 10 }], target: { type: 'dir' }, area: { shape: 'row', size: 1 },
    desc: function (L) {
      return 'Roll a d20 and smash the 3 tiles in front: ' + L.dmg + ' damage to each foe there; a 20 deals ' + L.crit + '; a 1 hits itself for ' + L.oops +
        ' instead and Stuns it for its next turn.';
    },
    flavor: 'Statistically it should hit half the time. Statistically.',
    execute: function (ctx) {
      const u = ctx.user, L = ctx.L;
      const roll = ctx.rng.int(1, 20);
      DD.FX.text(u, '🎲 ' + roll + (roll === 1 ? ' NAT 1!' : roll === 20 ? ' NAT 20!' : ''), { color: roll === 1 ? '#ff8a8a' : roll === 20 ? '#fff36b' : '#ffffff', size: roll === 1 || roll === 20 ? 22 : 18 });
      A().log(u.name + ' rolls a ' + roll + '.', 'enemy');
      if (roll === 1) {
        A().bark(u, 'fumble');
        A().damage(null, u, L.oops, { cause: 'other', ignoreArmor: true, tags: ['fumble'] });
        if (active(u)) A().addStatus(u, 'stun', { turns: 1 }, null);
        return;
      }
      if (roll === 20) { A().bark(u, 'crit'); DD.FX.shake(9, 350); } else attackBark(u, 0.2);
      lunge(ctx);
      hitFoes(ctx, roll === 20 ? L.crit : L.dmg);
    },
  });

  eskill({
    id: 'a3_golem_toss', name: 'Throw the Bones', icon: '🎲', kind: 'attack', tags: ['ranged', 'aoe', 'random'], anchor: 'unit', cooldown: 1,
    levels: [{ dmg: 8, doubles: 16, r: 7 }], target: { type: 'unit', range: function (L) { return [1, L.r]; }, filter: 'enemy', los: false }, area: { shape: 'circle', size: 1 },
    desc: function (L) {
      return 'Lob a giant pair of dice at a target up to ' + L.r + ' tiles away (no line of sight needed): every unit within 1 tile of it (friends too, never the golem itself) takes ' +
        L.dmg + ' damage, or ' + L.doubles + ' if the dice come up doubles (1 in 6).';
    },
    flavor: 'Snake eyes or boxcars, someone is getting flattened.',
    execute: function (ctx) {
      const a = ctx.rng.int(1, 6), b = ctx.rng.int(1, 6), dbl = a === b;
      if (ctx.target) {
        DD.FX.projectile(ctx.user, ctx.target, { kind: 'rock', arc: true, color: '#f2efe6', size: 1.6 });
        DD.FX.explosion(ctx.target, { radius: 1, color: '#f2efe6' });
        DD.FX.text(ctx.target, '🎲 ' + a + ' & ' + b + (dbl ? ' DOUBLES!' : ''), { color: dbl ? '#fff36b' : '#ffffff', size: dbl ? 20 : 17 });
      }
      A().log(ctx.user.name + ' rolls ' + a + ' and ' + b + (dbl ? ': doubles!' : '.'), 'enemy');
      if (dbl) A().bark(ctx.user, 'crit');
      hitUnits(ctx, dbl ? ctx.L.doubles : ctx.L.dmg);
    },
  });

  /** Its turn: a hero within a step gets the d20 swing; else the dice lob when ready; else it lumbers closer (and swings). */
  function golemPlan(unit, api) {
    let r = plan(unit, api, { skills: ['a3_golem_roll'], style: MELEE, keep: false });
    if (r.done || incapacitated(unit)) return;
    let moved = r.moved;
    if (api.canUse(unit, 'a3_golem_toss')) {
      r = plan(unit, api, { skills: ['a3_golem_toss'], style: SNIPER, keep: false, noMove: moved });
      if (r.done || incapacitated(unit)) return;
      moved = moved || r.moved;
    }
    plan(unit, api, { skills: ['a3_golem_roll'], style: MELEE, keep: 1, noMove: moved });
  }

  /** Custom painter: a golem built out of cursed dice (d20 torso showing a 1, d6 head whose single pip is the eye). */
  function drawNat1Golem(g, t) {
    const pal = g.pal, red = pal.skin, dark = g.shade(red, -0.32), lite = g.shade(red, 0.22), ink = pal.accent;
    const bob = Math.sin(t * 2.2) * 0.8, atk = g.pose === 'attack', hurt = g.pose === 'hurt';
    const lean = hurt ? -1.5 : atk ? 1.5 : 0;
    // legs: chunky d10 kites
    [-6, 6].forEach(function (x, i) {
      g.poly([[x - 4.2, -11], [x + 4.2, -11], [x + 3.2, -3.5], [x, 0.5], [x - 3.2, -3.5]], i ? red : dark);
      g.line(x, -11, x, 0, g.shade(red, -0.5), 0.8);
    });
    const cy = -25 + bob, R = 13.5;
    // back arm + d8 fist
    g.limb(-11 + lean, cy - 3, -16 + lean, cy + 8, 4.6, dark);
    g.poly([[-16 + lean, cy + 6], [-12.5 + lean, cy + 10], [-16 + lean, cy + 14], [-19.5 + lean, cy + 10]], dark);
    // torso: a d20 (hexagon outline, central face, facets)
    const hex = [];
    for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + i * Math.PI / 3; hex.push([Math.cos(a) * R + lean, cy + Math.sin(a) * R]); }
    g.poly(hex, red);
    const tri = [[lean, cy - 8.5], [7.6 + lean, cy + 5], [-7.6 + lean, cy + 5]];
    g.poly(tri, lite, null);
    [[0, 0], [0, 1], [1, 1], [1, 2], [2, 3], [2, 4], [0, 5]].forEach(function (pq) { g.line(tri[pq[0]][0], tri[pq[0]][1], hex[pq[1]][0], hex[pq[1]][1], g.shade(red, -0.45), 0.8); });
    g.poly(tri, null, g.shade(red, -0.45), 0.8);
    g.text('1', lean, cy + 1.2, 10, ink, g.outline);
    // head: a d6 cube whose single pip is a glowing eye
    const hx = lean * 1.3, hy = cy - R - 6.5;
    g.poly([[hx - 6, hy - 4], [hx + 1, hy - 7.5], [hx + 7, hy - 4], [hx, hy - 0.5]], lite);
    g.poly([[hx - 6, hy - 4], [hx, hy - 0.5], [hx, hy + 7.5], [hx - 6, hy + 4]], dark);
    g.poly([[hx, hy - 0.5], [hx + 7, hy - 4], [hx + 7, hy + 4], [hx, hy + 7.5]], red);
    if (!g.blink) {
      g.glow(hx + 3.5, hy + 2, 5, pal.eye, 0.7);
      g.circle(hx + 3.5, hy + 2, 1.8, pal.eye, null);
    } else g.line(hx + 2, hy + 2.5, hx + 5, hy + 1.5, g.outline, 1);
    // front arm (winds up when attacking)
    const fx = atk ? 17 : 14, fy = atk ? cy - 12 : cy + 9;
    g.limb(10 + lean, cy - 3, fx + lean, fy, 4.8, red);
    g.poly([[fx + lean, fy - 3.5], [fx + 3.5 + lean, fy], [fx + lean, fy + 3.5], [fx - 3.5 + lean, fy]], lite);
  }

  DD.registerEnemy({
    id: 'a3_nat1_golem', name: 'Natural 1 Golem', act: 3, tier: 'normal', hp: 40, mov: 3, armor: 1, init: -2,
    tags: ['construct'], resist: { poison: 0, fire: 1.5 },
    sprite: { base: 'custom', scale: 1.08, height: 50, width: 36, headY: -40,
      palette: { skin: '#c0392b', eye: '#ffe14a', accent: '#ffffff', outline: '#1a1014' }, draw: drawNat1Golem,
      portrait: { x: 0, y: -30, r: 22 } },
    // a brute: it sticks to the hero next to it; Roll to Hit is its attack of opportunity (a natural 1 still backfires)
    skills: ['a3_golem_roll', 'a3_golem_toss'], ai: golemPlan, aiStyle: MELEE, xp: 5, gold: [3, 7],
    passive: { name: 'Rolls for Everything', icon: '🎲', desc: function () {
      const Lr = lvl('a3_golem_roll');
      return 'On its turn it lumbers up and rolls a d20 at the 3 tiles in front (' + Lr.dmg + ' to each foe; a 20 deals ' + Lr.crit + ', a 1 hits itself and Stuns it), ' +
        'sticking to the hero next to it; with nobody in reach it lobs dice instead. Walk away from it and it rolls at you (attack of opportunity).';
    } },
    barks: {
      spawn: ['*rattle of cursed dice*', 'Statistically, I am a menace.'],
      attack: ['ROLLING!', 'Come on, big money!', 'Daddy needs a new d20!'],
      hurt: ['*clatters*', 'Ow! My polyhedrons!'],
      death: ['*rolls under the couch forever*', 'Nat... one...'],
      fumble: ['NOT AGAIN.', 'Who weighted me?!', 'Natural one. Classic.'],
      crit: ['NAT 20! NAT 20!', 'CRITICAL HIT, BABY!'],
    },
    desc: 'Every swing is a d20 roll: 20 = double damage, a natural 1 hits itself and stuns it. It sticks to whoever is next to it (walking away ' +
      'gets a roll too); out of reach it lobs dice that double on doubles. Lumbering (initiative −2). Built from every die that ever betrayed a player.',
  });

  // =============================================================================================================
  // Kobold Dragonshield (minion) — Shield Wall
  // =============================================================================================================
  eskill({
    id: 'a3_kobold_wall', name: 'Shield Wall', icon: '🛡️', kind: 'buff', tags: ['block', 'aoe'], anchor: 'self', cooldown: 1,
    levels: [{ block: 6 }], target: { type: 'self' }, area: { shape: 'circle', size: 1 },
    desc: function (L) { return 'It and every adjacent ally gain ' + L.block + ' Block (each keeps it until the start of its next turn).'; },
    flavor: 'Kobold tactics: hide behind the biggest thing available.',
    execute: function (ctx) {
      DD.FX.particles(ctx.user, { kind: 'sparks', count: 8 });
      ctx.friends.forEach(function (f) { if (active(f)) A().addBlock(f, ctx.L.block); });
    },
    // only allies whose Block will meet a hero turn count (Block is gone at the start of the ally's own next turn: an ally
    // acting next, before any hero, would lose it unused)
    aiScore: function (ctx) {
      let s = 0;
      ctx.friends.forEach(function (f) { if (f !== ctx.user && blockHolds(f)) s += f.tier === 'elite' || f.isBoss ? 9 : 4; });
      return s;
    },
  });

  /** Block given now to `u` meets at least one hero-side turn before u's own next turn start wipes it. */
  function blockHolds(u) {
    const s = S(), order = s && s.order;
    if (!order || !order.length || s.turnIndex < 0) return true;
    for (let k = 1; k <= order.length; k++) {
      const o = DD.Combat.byId(order[(s.turnIndex + k) % order.length].unitId);
      if (!o || o.dead) continue;
      if (o === u) return false;
      if (!o.downed && G().hostile(u, o)) return true;
    }
    return true;
  }

  eskill({
    id: 'a3_kobold_spear', name: 'Pointy Stick', icon: '🔱', kind: 'attack', tags: ['melee'], anchor: 'self',
    levels: [{ dmg: 7 }], target: { type: 'dir' }, area: { shape: 'line', size: 2, pierce: false },
    desc: function (L) { return 'Jab the first unit within 2 tiles in front: ' + L.dmg + ' damage if it is a foe.'; },
    flavor: 'Technically a spear. Emotionally a stick.',
    execute: function (ctx) {
      lunge(ctx);
      attackBark(ctx.user, 0.2);
      hitFoes(ctx, ctx.L.dmg);
    },
  });

  function koboldOverlay(g, t) {
    // the tower shield is taller than the kobold's legs and most of its self-esteem
    g.poly([[2, -17], [15, -17], [15, -5], [8.5, 2], [2, -5]], '#a61e1e', undefined);
    g.poly([[3.8, -15.3], [13.2, -15.3], [13.2, -5.6], [8.5, -0.3], [3.8, -5.6]], null, '#ffd23f', 1.2);
    g.ellipse(8.5, -9, 3.1, 4.1, '#ffd23f', undefined);
    g.ellipse(8.5, -9, 0.9, 3.2, '#1a1014', null);
  }

  DD.registerEnemy({
    id: 'a3_kobold_shield', name: 'Kobold Dragonshield', act: 3, tier: 'minion', hp: 16, mov: 3, armor: 1, init: 1,
    tags: ['kobold'], resist: { fire: 0.5 },
    sprite: { base: 'humanoid', scale: 0.78, build: 'tiny', outfit: 'armor',
      palette: { skin: '#d9622b', cloth: '#7a2a1a', cloth2: '#ffd23f', metal: '#c9a227', eye: '#ffe14a', accent: '#c0392b' },
      head: { ears: 'pointy', hat: 'helmet', eyes: 'angry', mouth: 'open' }, tail: 'lizard', mainhand: 'spear', overlay: koboldOverlay },
    // Pointy Stick (the first melee skill: Shield Wall deals no damage) is its attack of opportunity
    skills: ['a3_kobold_wall', 'a3_kobold_spear'], ai: MELEE, xp: 3, gold: [1, 3],
    passive: { name: 'Shield Wall', icon: '🛡️', desc: function () {
      return 'On its turn it huddles next to its biggest ally and raises Shield Wall (' + lvl('a3_kobold_wall').block + ' Block for itself and every adjacent ally ' +
        'until their next turns); otherwise it jabs the first unit within 2 in front, sticking to the hero next to it. Walk away from it and it jabs ' +
        '(attack of opportunity).';
    } },
    barks: {
      spawn: ['For the Big Red!', 'Shields up, scales out!'],
      attack: ['Poke poke poke!', 'Kobold tactics!', 'Stay back from the Boss!'],
      hurt: ['Yip! Shield too heavy!', 'Union break! Union break!'],
      death: ['Tell the dragon... I tried...', 'Was... a good shield...'],
    },
    desc: 'Huddles next to its biggest ally and raises Shield Wall: 6 Block for itself and every adjacent ally until their next turns. ' +
      'Kill it first or hit around it. Sworn to protect the dragon. Mostly from accountability.',
  });

  // =============================================================================================================
  // Succubus Dating Coach — charm + motivational nonsense (Inspired allies)
  // =============================================================================================================
  const PICKUP_LINES = [
    'Are you a natural 20? Because you\'re critical to me.',
    'Is your name Wi-Fi? Because I\'m feeling a connection.',
    'You must be a dungeon map, because I\'m lost in you.',
    'Are you a mimic? You just ate my heart. And my hand.',
    'Do you have a Bag of Holding? Because hold me.',
  ];
  eskill({
    id: 'a3_succubus_line', name: 'Terrible Pickup Line', icon: '😘', kind: 'spell', tags: ['ranged', 'psychic', 'charm'], anchor: 'unit', cooldown: 1,
    levels: [{ dmg: 8, r: 6 }], target: { type: 'unit', range: function (L) { return [1, L.r]; }, filter: 'enemy', los: true },
    desc: function (L) { return 'Deal ' + L.dmg + ' psychic damage to a target up to ' + L.r + ' tiles away and Charm it for its next turn (it can\'t damage her and has 1 less AP).'; },
    flavor: 'It works on nobody. It works on everybody. It works on you.',
    execute: function (ctx) {
      A().bark(ctx.user, DD.util.pick(PICKUP_LINES, DD.rng));
      shoot(ctx, 'orb', '#ff5fa2');
      ctx.foes.forEach(function (f) {
        if (!active(f)) return;
        A().damage(ctx.user, f, ctx.L.dmg, { element: 'psychic' });
        if (active(f)) { A().addStatus(f, 'charmed', { turns: 1 }, ctx.user); DD.FX.particles(f, { kind: 'hearts', count: 8 }); }
      });
    },
    aiScore: function (ctx) { const u = ctx.targetUnit; return u && !has(u, 'charmed') ? 2 : -2; },
  });

  eskill({
    id: 'a3_succubus_pep', name: 'You Deserve Better!', icon: '💅', kind: 'buff', tags: ['aoe', 'inspire'], anchor: 'self', cooldown: 3,
    levels: [{ turns: 2, r: 3 }], target: { type: 'self' }, area: { shape: 'circle', size: function (L) { return L.r; } },
    desc: function (L) { return 'Every other ally within ' + L.r + ' tiles becomes Inspired (+25% damage) for its next ' + L.turns + ' turns.'; },
    flavor: 'You are a strong, independent minion and that hero does NOT deserve you.',
    execute: function (ctx) {
      A().bark(ctx.user, DD.util.pick(['You deserve better, sweetie!', 'Go get \'em, tiger!', 'Manifest that damage, babe!'], DD.rng));
      ctx.friends.forEach(function (f) {
        if (f === ctx.user || !active(f)) return;
        A().addStatus(f, 'inspired', { turns: ctx.L.turns }, ctx.user);
        DD.FX.particles(f, { kind: 'hearts', count: 5 });
      });
    },
    aiScore: function (ctx) {
      let n = 0;
      ctx.friends.forEach(function (f) { if (f !== ctx.user && !has(f, 'inspired')) n++; });
      return n ? n * 5 : -50;
    },
  });

  function succubusOverlay(g, t) {
    g.arc(0, -30, 11.5, Math.PI * 1.05, Math.PI * 1.95, '#1d1d26', 1.4);
    g.line(9, -25, 6, -21.5, '#1d1d26', 1.1);
    g.circle(5.8, -21.2, 1.2, '#1d1d26', null);
    const p = (t * 0.6) % 1;
    g.heart(-10 + Math.sin(p * 6) * 1.5, -34 - p * 10, 2.6, 'rgba(255,111,174,' + (1 - p).toFixed(2) + ')', null);
  }

  DD.registerEnemy({
    id: 'a3_succubus_coach', name: 'Succubus Dating Coach', act: 3, tier: 'normal', hp: 32, mov: 4, armor: 0, init: 0,
    tags: ['devil'], resist: { fire: 0.5, psychic: 0.5 },
    sprite: { base: 'humanoid', scale: 1, build: 'slim', outfit: 'coat',
      palette: { skin: '#e8768f', cloth: '#5a2d82', cloth2: '#ffd1e3', hair: '#2b1030', eye: '#ffe14a', accent: '#ff5fa2', wing: '#5a2140', metal: '#ffd23f', wand: '#ff5fa2' },
      head: { horns: 'tiefling', hair: 'long', eyes: 'big', mouth: 'smile', face: 'glasses' }, wings: 'demon', tail: 'devil', mainhand: 'wand',
      bling: ['earrings'], aura: { kind: 'sparkles', color: '#ff8ad8' }, overlay: succubusOverlay },
    skills: ['a3_succubus_line', 'a3_succubus_pep'], ai: KITER, xp: 5, gold: [3, 6],
    passive: { name: 'Dating Coach', icon: '💘', desc: function () {
      const Lp = lvl('a3_succubus_pep');
      return 'On her turn she keeps 2 tiles from the heroes and charms whoever she can see within ' + lvl('a3_succubus_line').r + ' with a terrible pickup line ' +
        '(it can\'t hurt her and has 1 less AP next turn), or pep-talks every other ally within ' + Lp.r + ' into Inspired (+25% damage, ' + Lp.turns + ' turns). ' +
        'She makes no attacks of opportunity.';
    } },
    barks: {
      spawn: ['Hi! I\'m your dating coach. First: posture.', 'Rule one: confidence. Rule two: horns.'],
      attack: ['Are you a natural 20? You\'re critical to me.', 'Is your name Wi-Fi? I feel a connection.', 'You must be a dungeon map. I\'m lost in you.'],
      hurt: ['Ugh, red flag!', 'You are NOT ready for a relationship.'],
      death: ['I\'m... taking a break... from dating...', 'Swipe... left...'],
    },
    desc: 'Keeps her distance and charms a hero with a terrible pickup line (it can\'t hurt her and has 1 less AP next turn), or pep-talks her ' +
      'allies within 3 into Inspired (+25% damage). Five stars on Yelp (Hell). Zero successful matches.',
  });

  // =============================================================================================================
  // Skeletal Backup Dancer (minion) — the Death Knight's intermission act
  // =============================================================================================================
  eskill({
    id: 'a3_dancer_kick', name: 'Kick Ball Change', icon: '💃', kind: 'attack', tags: ['melee', 'leap'], anchor: 'unit',
    levels: [{ dmg: 7, r: 2 }], target: { type: 'unit', range: function (L) { return [1, L.r]; }, filter: 'enemy', los: true },
    desc: function (L) { return 'Shimmy next to a target up to ' + L.r + ' tiles away (not while Rooted) and kick it for ' + L.dmg + ' damage.'; },
    flavor: 'Five, six, seven, eight, SHIN.',
    execute: function (ctx) {
      const u = ctx.user, f = ctx.targetUnit;
      if (!f || !active(f) || !DD.Grid.hostile(u, f) || !leapTo(u, f)) return;
      DD.FX.lunge(u, f);
      attackBark(u, 0.25);
      if (active(f)) A().damage(u, f, ctx.L.dmg);
    },
  });

  DD.registerEnemy({
    id: 'a3_backup_dancer', name: 'Skeletal Backup Dancer', act: 3, tier: 'minion', hp: 14, mov: 4, armor: 0, init: 2,
    tags: ['undead'], resist: { poison: 0, holy: 1.5 },
    sprite: { base: 'humanoid', scale: 0.82, build: 'slim', outfit: 'tunic',
      palette: { skin: '#ece5d3', cloth: '#1c1a22', cloth2: '#d4af37', eye: '#b48cff', metal: '#d4af37', accent: '#b48cff', hat: '#1c1a22' },
      head: { face: 'skull', eyes: 'glow', hat: 'tophat' }, mainhand: 'cane', extras: ['sash'], aura: { kind: 'notes', color: '#b48cff' } },
    // the shimmy-kick reaches 2 tiles, so it is no attack of opportunity: dancers never strike anyone walking away
    skills: ['a3_dancer_kick'], ai: MELEE, xp: 2, gold: [0, 2],
    passive: { name: 'Jazz Hands', icon: '💃', desc: function () {
      return 'On its turn it dances up to 4 tiles and shimmies up to ' + lvl('a3_dancer_kick').r + ' more to kick a hero (it sticks to the one next to it). ' +
        'Too busy dancing to strike anyone walking away.';
    } },
    barks: {
      spawn: ['Five, six, seven, eight!', '*jazz hands*'],
      attack: ['Kick ball change!', 'Jazz hands of DOOM!'],
      hurt: ['My tibia!', 'Break a leg? Not like THAT!'],
      death: ['*collapses on the beat*', 'And... scene.'],
    },
    desc: 'Moves up to 4 tiles and shimmies 2 more to kick a hero. Undead: holy damage hurts it more. Arrives when the Death Knight ' +
      'calls an intermission. Always on the beat (initiative +2). Has rhythm. No skin.',
  });

  // =============================================================================================================
  // ELITE: Young Red Dragon (Hoarder) — hoard piles = Block, Thieves get hunted, wind-up: Hoard Breath
  // =============================================================================================================
  function thiefScore(ctx) {
    let s = 0;
    (ctx.foes || []).forEach(function (f) { if (has(f, 'a3_thief')) s += 6; });
    return s;
  }
  /** Free, safe, empty floor tile next to the dragon for a freshly stolen pile. */
  function stashSpot(u) {
    const near = G().emptyTilesNear(u.x, u.y, 2);
    for (let i = 0; i < near.length; i++) {
      const p = near[i], t = G().tile(p.x, p.y);
      if (!t.obj && !G().isDrop(p.x, p.y) && !G().hazardAt(p.x, p.y, null) && !G().terrain(t).liquid) return p;
    }
    return null;
  }

  eskill({
    id: 'a3_dragon_breath', name: 'Hoard Breath', icon: '🔥', kind: 'attack', tags: ['fire', 'aoe', 'objects'], anchor: 'ground', cooldown: 2,
    levels: [{ dmg: 16 }], target: { type: 'dir' }, area: { shape: 'cone', size: 3 },
    desc: function (L) {
      return 'Wind-up: it inhales, marking the 3-deep cone in front of it (9 tiles). At the start of its next turn: ' + L.dmg +
        ' fire damage to everyone and every object there (friends too), and the floor there burns until the end of the next round.';
    },
    flavor: 'Smells like burnt toast and capital gains.',
    execute: function (ctx) {
      A().bark(ctx.user, 'breath');
      ctx.tiles.forEach(function (p, i) { DD.FX.particles(p, { kind: 'fire', count: 14, parallel: i > 0 }); });
      DD.FX.shake(10, 400);
      DD.FX.sound('fire');
      hitUnits(ctx, ctx.L.dmg, { element: 'fire' });
      ctx.tiles.forEach(function (p) { hitObject(ctx.user, p, ctx.L.dmg); ignite(p.x, p.y, ctx.user, 2); });
    },
    aiScore: thiefScore,
  });

  /** Wind-up truth for the dragon's attacks: +THIEF_BONUS when the targeted unit is a Thief. */
  function thiefFlat(unit, intent) {
    const tu = intent && intent.unitId && DD.Combat.byId(intent.unitId);
    return tu && has(tu, 'a3_thief') ? THIEF_BONUS : 0;
  }

  eskill({
    id: 'a3_dragon_bite', name: 'Greedy Bite', icon: '🦷', kind: 'attack', tags: ['melee', 'gold'], anchor: 'unit',
    levels: [{ dmg: 15, steal: 5, r: 4 }], target: { type: 'unit', range: function (L) { return [1, L.r]; }, filter: 'enemy', los: true },
    desc: function (L) {
      return 'Swoop next to a target up to ' + L.r + ' tiles away (not while Rooted) and bite it: ' + L.dmg + ' damage. If the bite lands it steals up to ' +
        L.steal + ' party gold and stashes it, plus 3, in a new hoard pile next to itself.';
    },
    flavor: 'Finders keepers. Biters keepers too.',
    telegraphFlat: thiefFlat,
    execute: function (ctx) {
      const u = ctx.user, f = ctx.targetUnit;
      if (!f || !active(f) || !DD.Grid.hostile(u, f) || !leapTo(u, f)) return;
      DD.FX.lunge(u, f);
      attackBark(u, 0.3);
      const hp0 = f.hp, block0 = f.block || 0;
      A().damage(u, f, ctx.L.dmg);
      // an Invulnerable (or otherwise untouched) target keeps its purse
      if (!active(u) || (f.hp === hp0 && (f.block || 0) === block0)) return;
      const stolen = A().loseGold(ctx.L.steal);
      const spot = stashSpot(u);
      if (!spot) return;
      A().placeObject(spot.x, spot.y, 'a3_hoard_pile', { data: { gold: stolen + 3 } });
      DD.FX.particles(spot, { kind: 'coins', count: 10 });
      A().log(u.name + (stolen ? ' swipes ' + stolen + ' gold and stashes it in a new hoard pile.' : ' finds no gold to steal and stashes some lint instead.'), 'enemy');
    },
    aiScore: thiefScore,
  });

  eskill({
    id: 'a3_dragon_tail', name: 'Tail Sweep', icon: '🐉', kind: 'attack', tags: ['melee', 'aoe', 'push'], anchor: 'self', cooldown: 2,
    levels: [{ dmg: 12, push: 1 }], target: { type: 'self' }, area: { shape: 'adjacent' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to every adjacent foe and push them ' + L.push + ' tile away.'; },
    flavor: 'Please do not touch the exhibits.',
    execute: function (ctx) {
      attackBark(ctx.user, 0.3);
      DD.FX.particles(ctx.user, { kind: 'dust', count: 12 });
      ctx.foes.forEach(function (f) {
        if (!active(f)) return;
        A().damage(ctx.user, f, ctx.L.dmg);
        if (active(f)) A().knockback(ctx.user, f, ctx.L.push);
      });
    },
    aiScore: function (ctx) {
      let s = thiefScore(ctx);
      (ctx.foes || []).forEach(function (f) { s += pushBonus(f, DD.util.dirTo(ctx.user, f), ctx.L.push); });
      return s;
    },
  });

  /**
   * Guarding its hoard: while piles remain and no Thief is in sight, the dragon only moves to tiles within
   * HOARD_RANGE of a pile (it still swoops out to bite, then flies home). A Thief (or a taunt) sends it anywhere.
   */
  function hoardLeash(unit, api) {
    if (!countObjects('a3_hoard_pile') || has(unit, 'taunt') || api.foes(unit).some(function (f) { return has(f, 'a3_thief'); })) return null;
    return function (p) { return hoardNear(p) > 0; };
  }

  /** Hoarder: Block for every pile within reach of where it sits for the heroes' turns (at the end of its turn). */
  function bask(unit) {
    if (!active(unit)) return;
    const n = hoardNear(unit);
    if (!n) return;
    const b = Math.min(HOARD_MAX, n * HOARD_BLOCK);
    A().addBlock(unit, b);
    A().log(unit.name + ' basks in its hoard (' + n + ' pile' + (n === 1 ? '' : 's') + ' within ' + HOARD_RANGE + '): +' + b + ' Block.', 'enemy');
  }
  /** Planner preference for fighting from the gold: the hoard Block it would bask in at p (0..6). */
  function hoardValue(p) { return Math.min(HOARD_MAX, HOARD_BLOCK * hoardNear(p)) * 0.4; }

  /**
   * Nothing to bite or burn from inside the leash: settle back onto the richest reachable spot of the hoard (the
   * one nearest the party on ties) instead of creeping to the edge of the leash, where the piles no longer cover it.
   */
  function goHome(unit, api) {
    if (A().cantMove(unit)) return false;
    const foes = api.foes(unit), piles = [];
    S().grid.tiles.forEach(function (t) { if (t.obj && t.obj.id === 'a3_hoard_pile') piles.push(t); });
    if (!piles.length) return false;
    const cap = HOARD_MAX / HOARD_BLOCK;
    const value = function (p) { return Math.min(cap, hoardNear(p)) * 10 - nearestDist(p, piles) - nearestDist(p, foes) * 0.1; };
    let best = { x: unit.x, y: unit.y, path: null, sc: value(unit) };
    api.reachable(unit).forEach(function (e) {
      const risk = DD.AI.pathRisk(unit, e);
      const aoo = api.aooCost(unit, e);
      if (risk.lethal || aoo === Infinity) return;
      const sc = value(e) - risk.penalty - aoo - e.cost * 0.01;
      if (sc > best.sc + 0.5) best = { x: e.x, y: e.y, path: e.path, sc: sc };
    });
    return best.path ? DD.AI.moveTo(unit, best.x, best.y, best.path) : false;
  }

  /** On the turn it inhales it only sweeps its tail at heroes right next to it (it does not swoop off its mark). */
  function tailSweep(unit, api) {
    if (incapacitated(unit) || !api.canUse(unit, 'a3_dragon_tail')) return;
    if (api.foes(unit).some(function (f) { return G().dist(f, unit) === 1; })) plan(unit, api, { skills: ['a3_dragon_tail'], noMove: true });
  }

  /** Its turn: wind up the breath at a worthwhile cone (+ a tail sweep), else one bite or tail sweep from its hoard. */
  function dragonPlan(unit, api) {
    const melee = ['a3_dragon_bite', 'a3_dragon_tail'];
    const within = hoardLeash(unit, api), bonus = within ? hoardValue : null;
    if (!windupOf(unit, 'a3_dragon_breath') && api.canUse(unit, 'a3_dragon_breath')) {
      const b = within ? bestWithin(unit, api, ['a3_dragon_breath'], MELEE, within, bonus) : api.bestAttack(unit, { skills: ['a3_dragon_breath'], style: MELEE });
      if (b && b.actionScore >= BREATH_MIN) {
        const r = plan(unit, api, { skills: ['a3_dragon_breath'], style: MELEE, windUp: { label: 'Hoard Breath', anchor: 'ground' }, within: within, bonus: bonus,
          minScore: BREATH_MIN });
        if (r.done) { tailSweep(unit, api); return; }
        // the walk to its mark was cut short (an attack of opportunity): no breath, it strikes from where it is
        if (r.moved) { if (!incapacitated(unit)) plan(unit, api, { skills: melee, style: MELEE, noMove: true }); return; }
      }
    }
    if (within) {
      // guarding: strike from the hoard when someone is in reach, otherwise settle back onto the gold
      const r = plan(unit, api, { skills: melee, style: MELEE, keep: false, within: within, bonus: bonus });
      if (!r.done && !r.moved && goHome(unit, api)) plan(unit, api, { skills: melee, noMove: true });
    } else plan(unit, api, { skills: melee, style: MELEE, keep: 1 });
  }

  function dragonOverlay(g, t) {
    // back spines
    [[-10, -21], [-5, -23], [0, -22.5], [5, -21]].forEach(function (p) { g.poly([[p[0] - 2, p[1] + 2.5], [p[0] + 2, p[1] + 2.5], [p[0], p[1] - 2]], '#f2e6c8', undefined); });
  }

  DD.registerEnemy({
    id: 'a3_red_dragon', name: 'Young Red Dragon (Hoarder)', act: 3, tier: 'elite', hp: 145, mov: 4, armor: 1, init: 1,
    tags: ['dragon'], flags: { flying: true, large: true }, resist: { fire: 0, frost: 1.5 },
    sprite: { base: 'quadruped', scale: 1.5, shape: { legs: 'long', body: 'long', snout: 'long' },
      palette: { skin: '#d23a24', cloth2: '#ffcf6b', belly: '#ffcf6b', hair: '#8e1f12', eye: '#ffe14a', metal: '#ffd23f', accent: '#e0245e', wing: '#8e1f12', horn: '#f2e6c8' },
      // swept-back horns (ram horns read as a goat, and the Pit Fiend already wears them)
      head: { horns: 'tiefling', eyes: 'angry', mouth: 'fangs' }, wings: 'demon', tail: 'lizard', bling: ['crown', 'chain'], overlay: dragonOverlay },
    skills: ['a3_dragon_breath', 'a3_dragon_bite', 'a3_dragon_tail'], ai: dragonPlan, aiStyle: MELEE, xp: 15, gold: [12, 18],
    passive: {
      name: 'Hoarder', icon: '💰',
      desc: function (u) {
        const n = u && S() ? hoardNear(u) : null;
        return 'At the end of each of its turns: +' + HOARD_BLOCK + ' Block per hoard pile within ' + HOARD_RANGE + ' tiles of it (max ' + HOARD_MAX + ')' +
          (n === null ? '' : '; ' + n + ' in range now') + '. While piles remain it guards them: it stays within ' + HOARD_RANGE + ' tiles of one, swoops out to bite ' +
          '(it sticks to the hero next to it) and settles back on the gold. Whoever pockets a pile is a Thief: +' + THIEF_BONUS + ' damage from it, and it ' +
          'leaves its hoard to hunt them. Flying, it makes no attacks of opportunity. ' + UNSHAKEABLE_LINE;
      },
    },
    hooks: withTenacity({
      // it basks once its turn is over (also when it lost the turn to a stun: it still sits on its gold)
      onTurnEnd: function (unit) { bask(unit); },
      modifyOutgoingDamage: function (d) {
        if (d.cause === 'skill' && d.target && has(d.target, 'a3_thief')) d.flat += THIEF_BONUS;
      },
    }),
    barks: {
      spawn: ['MINE. All of it. Even the lint.', 'You wiped your feet on my GOLD?'],
      attack: ['MINE!', 'You owe me rent!', 'Feel the burn of compound interest!'],
      hurt: ['You scratched my scales! Those are collectible!', 'That\'s coming out of your deposit!'],
      death: ['My hoard... count it... for me...', 'Tell my mom... I was rich...'],
      thief: ['THIEF! THIEF! I SAW THAT!', 'PUT. IT. BACK.', 'That was my FAVORITE coin!'],
      breath: ['*deep, expensive inhale*', 'HOARD BREATH!'],
    },
    desc: 'Hoarder: guards its hoard and basks in it for Block (+' + HOARD_BLOCK + ' per pile within ' + HOARD_RANGE + ', max ' + HOARD_MAX + '). Walk over a pile to pocket it: ' +
      'you become a Thief (+' + THIEF_BONUS + ' damage from it) and it leaves its hoard to hunt you. Its breath winds up for a turn first: get out of the cone. ' +
      'Otherwise it sticks to whoever is next to it. Shrugs off back-to-back stuns. Flies. Immune to fire.',
  });

  // =============================================================================================================
  // ELITE: Death Knight (Very Dramatic) — wind-up: an interruptible monologue; chain + swing; intermission dancers
  // =============================================================================================================
  /** The speech was called off by something else (a stun, a sleep...): drop the Monologuing status at once. */
  function syncMonologue(u) {
    if (!has(u, 'a3_monologue') || windupOf(u, 'a3_dk_monologue')) return;
    A().removeStatus(u, 'a3_monologue', { text: 'Speech cancelled' });
  }

  function interruptMonologue(u) {
    DD.AI.cancelIntents(u, 'Interrupted!');
    A().removeStatus(u, 'a3_monologue', { text: 'Interrupted!' });
    DD.FX.text(u, 'Lost his train of thought!', { color: '#ffe14a', size: 16 });
    A().bark(u, 'interrupted');
    A().log(u.name + ' loses his train of thought. The monologue is cancelled!', 'status');
    A().addStatus(u, 'vulnerable', { turns: 1 }, null);
    A().gainHype(MONO_HYPE, 'monologue interrupted');
  }

  // v2: a plain melee arc (it was "a target up to 2 tiles away and its sides"): he holds the line, and it is his attack
  // of opportunity
  eskill({
    id: 'a3_dk_cleave', name: 'Overly Dramatic Swing', icon: '⚔️', kind: 'attack', tags: ['melee', 'aoe'], anchor: 'self',
    levels: [{ dmg: 14 }], target: { type: 'dir' }, area: { shape: 'row', size: 1 },
    desc: function (L) { return 'A sweeping greatsword arc at the 3 tiles in front of him: ' + L.dmg + ' damage to each foe there.'; },
    flavor: 'He practised this in front of a mirror. For a century.',
    execute: function (ctx) { lunge(ctx); attackBark(ctx.user, 0.3); hitFoes(ctx, ctx.L.dmg); },
  });

  eskill({
    id: 'a3_dk_grip', name: 'Come Hither, Darling', icon: '⛓️', kind: 'spell', tags: ['ranged', 'pull', 'frost'], anchor: 'unit', cooldown: 2,
    // a spectral chain: no line of sight needed
    levels: [{ dmg: 9, pull: 3 }], target: { type: 'unit', range: [2, 6], filter: 'enemy', los: false },
    desc: function (L) {
      return 'A spectral chain grabs a target 2-6 tiles away (no line of sight needed): ' + L.dmg + ' frost damage, then it is pulled up to ' +
        L.pull + ' tiles toward him.';
    },
    flavor: 'Every great scene needs a captive audience. Literally.',
    execute: function (ctx) {
      ctx.foes.forEach(function (f) {
        if (!active(f)) return;
        DD.FX.beam(ctx.user, f, { color: '#7af0ff', width: 3 });
        A().damage(ctx.user, f, ctx.L.dmg, { element: 'frost' });
        if (active(f)) A().pull(ctx.user, f, ctx.user, ctx.L.pull);
      });
    },
    // the yank sets up the swing: a hero the pull can bring next to him is worth more
    aiScore: function (ctx) {
      const f = ctx.targetUnit;
      return f && !A().isImmovable(f) && G().dist(ctx.user, f) <= ctx.L.pull + 1 ? 4 : 0;
    },
  });

  eskill({
    id: 'a3_dk_monologue', name: 'Villain Monologue', icon: '🎭', kind: 'spell', tags: ['aoe'], anchor: 'self', cooldown: 3,
    levels: [{ dmg: 16, r: 2, brk: MONO_BREAK, hype: MONO_HYPE }], target: { type: 'self' }, area: { shape: 'circle', size: function (L) { return L.r; } },
    desc: function (L) {
      return 'Wind-up: he starts monologuing. At the start of his next turn: ' + L.dmg + ' damage to every foe within ' + L.r + ' tiles of him (push him and it ' +
        'moves with him). Deal him ' + L.brk + '+ damage before then to interrupt it (he is left Vulnerable and the party gains ' + L.hype +
        ' Hype); a stun or silence also stops it.';
    },
    flavor: 'It all began on a dark and stormy night. Get comfortable.',
    execute: function (ctx) {
      const u = ctx.user;
      A().removeStatus(u, 'a3_monologue', { silent: true });
      DD.FX.text(u, '...AND THAT IS WHY YOU MUST DIE!', { color: '#d9b8ff', size: 16 });
      DD.FX.explosion(u, { radius: ctx.L.r, color: '#8a4fff' });
      DD.FX.shake(10, 400);
      hitFoes(ctx, ctx.L.dmg, { element: 'necrotic' });
    },
  });

  /**
   * Reachable tile (or here) with the most foes within 2: worth stopping to monologue at. The walk's attacks of
   * opportunity are a cost (never a lethal one).
   */
  function monologueSpot(unit, api) {
    const foes = api.foes(unit);
    const opts = [{ x: unit.x, y: unit.y, cost: 0, aoo: 0 }];
    api.reachable(unit).forEach(function (e) {
      if (e.hazard || DD.AI.pathRisk(unit, e).lethal) return;
      const aoo = api.aooCost(unit, e);
      if (aoo !== Infinity) { e.aoo = aoo; opts.push(e); }
    });
    let best = null;
    opts.forEach(function (p) {
      const n = audience(p, foes);
      const sc = n * 10 - (p.cost || 0) * 0.1 - (p.aoo || 0);
      if (n >= 2 && (!best || sc > best.sc)) best = { x: p.x, y: p.y, path: p.path || null, sc: sc };
    });
    return best;
  }
  /** Foes within the monologue's 2 tiles of p. */
  function audience(p, foes) {
    let n = 0;
    foes.forEach(function (f) { if (Math.abs(f.x - p.x) + Math.abs(f.y - p.y) <= 2) n++; });
    return n;
  }

  function intermission(unit) {
    DD.FX.banner('INTERMISSION', { sub: unit.name + ' needs a moment. Cue the backup dancers.', color: '#b48cff', ms: 900 });
    A().bark(unit, 'intermission');
    A().log(unit.name + ' calls an intermission. Skeletal Backup Dancers take the stage!', 'enemy');
    const spots = G().emptyTilesNear(unit.x, unit.y, 2).filter(function (p) { return !G().isDrop(p.x, p.y) && !G().hazardAt(p.x, p.y, null); });
    spots.slice(0, 2).forEach(function (p) { A().spawn('a3_backup_dancer', p.x, p.y); });
  }

  /**
   * His turn: with 2+ heroes within 2 of a reachable tile he stops there and winds up the monologue (+ one swing);
   * otherwise he swings at whoever he can reach (sticking to the hero next to him), or chains a straggler in and swings
   * at them if they land next to him.
   */
  function dkPlan(unit, api) {
    if (has(unit, 'a3_monologue') && !windupOf(unit, 'a3_dk_monologue')) A().removeStatus(unit, 'a3_monologue', { silent: true });
    let walked = false;
    if (!windupOf(unit, 'a3_dk_monologue') && api.canUse(unit, 'a3_dk_monologue')) {
      const spot = monologueSpot(unit, api);
      if (spot) {
        // a walk that a reaction stopped on its first tile still spent his move
        walked = spot.x !== unit.x || spot.y !== unit.y;
        if (walked) DD.AI.moveTo(unit, spot.x, spot.y, spot.path);
        if (incapacitated(unit)) return;
        // an attack of opportunity can stop the walk short (a stun, a push, a hold): he only starts the speech where
        // the audience still is, otherwise he takes a plain turn from where he ended up
        if (audience(unit, api.foes(unit)) >= 2) {
          if (api.windUp(unit, 'a3_dk_monologue', unit, { anchor: 'self', label: 'Villain Monologue' })) {
            A().addStatus(unit, 'a3_monologue', {}, unit);
            A().bark(unit, 'monologue');
          }
          plan(unit, api, { skills: ['a3_dk_cleave'], style: MELEE, noMove: true });
          return;
        }
      }
    }
    const chainReady = api.canUse(unit, 'a3_dk_grip');
    const r = plan(unit, api, { skills: ['a3_dk_cleave'], style: MELEE, noMove: walked, keep: chainReady ? false : 1 });
    if (r.done || incapacitated(unit) || !chainReady) return;
    const moved = walked || r.moved;
    // yank and swing: the chain first, then the swing at the same hero once the pull brought them next to him
    const g = plan(unit, api, { skills: ['a3_dk_grip'], style: MELEE, noMove: moved, keep: false });
    if (g.done && active(g.target) && !incapacitated(unit) && G().dist(unit, g.target) === 1) api.act(unit, 'a3_dk_cleave', g.target);
    else if (!g.done && !moved && !g.moved) plan(unit, api, { skills: ['a3_dk_cleave'], style: MELEE, keep: 1 });
  }

  function dkUnderlay(g, t) {
    // he brought his own spotlight: a beam from the rafters (behind him) and a pool of light at his feet
    const c = g.ctx, a = 0.12 + 0.04 * Math.sin(t * 2);
    c.save();
    c.globalCompositeOperation = 'lighter';
    const beam = c.createLinearGradient(0, -80, 0, 3);
    beam.addColorStop(0, 'rgba(255,248,215,0)');
    beam.addColorStop(0.55, 'rgba(255,248,215,' + (a * 0.55).toFixed(3) + ')');
    beam.addColorStop(1, 'rgba(255,248,215,' + (a * 0.9).toFixed(3) + ')');
    g.poly([[-6, -80], [6, -80], [21, 2.5], [-21, 2.5]], beam, null);
    c.restore();
    g.ellipse(0, 2.5, 21, 4.2, 'rgba(255,248,215,' + a.toFixed(3) + ')', null);
    g.ellipse(0, 2.5, 13, 2.6, 'rgba(255,248,215,' + (a + 0.05).toFixed(3) + ')', null);
  }

  function dkOverlay(g, t) {
    // dust dancing in his spotlight and a single red rose, for the drama
    for (let i = 0; i < 3; i++) {
      const p = (t * 0.5 + i / 3) % 1;
      g.star(-14 + i * 14, -6 - p * 22, 1.6 * (1 - p) + 0.4, 'rgba(255,248,215,' + (0.9 * (1 - p)).toFixed(2) + ')', null, 4, 0.35);
    }
    g.line(6, -28, 10, -22, '#2f7a3a', 1.1);
    g.circle(5.6, -28.6, 2, '#e0245e', undefined);
  }

  DD.registerEnemy({
    id: 'a3_death_knight', name: 'Death Knight (Very Dramatic)', act: 3, tier: 'elite', hp: 135, mov: 3, armor: 2, init: -1,
    tags: ['undead'], resist: { poison: 0, frost: 0.5, holy: 1.5 },
    sprite: { base: 'humanoid', scale: 1.42, build: 'huge', outfit: 'armor',
      palette: { skin: '#3a3f4a', cloth: '#1a1c24', cloth2: '#6a1f8a', metal: '#4a5060', eye: '#7af0ff', accent: '#b48cff', cape: '#4a0f5a', hat: '#2e323c', horn: '#d8d4e8' },
      head: { hat: 'helmet', horns: 'demon', eyes: 'glow', face: 'skull', mouth: 'none' }, mainhand: 'greatsword', extras: ['cape'],
      aura: { kind: 'smoke', color: '#6a3a8a' }, underlay: dkUnderlay, overlay: dkOverlay },
    skills: ['a3_dk_cleave', 'a3_dk_grip', 'a3_dk_monologue'], ai: dkPlan, aiStyle: MELEE, xp: 15, gold: [12, 18],
    passive: {
      name: 'Very Dramatic', icon: '🎭',
      desc: 'On his turn he swings at the 3 tiles in front of him, sticking to the hero next to him; walk away from him and he swings (attack of ' +
        'opportunity). Nobody in reach: he chains a hero 2-6 tiles away and swings if they land next to him. With 2+ heroes within 2 tiles of a spot ' +
        'he can reach, he stops there and winds up his monologue. The first time his turn starts at half HP or less he calls an INTERMISSION: two ' +
        'Skeletal Backup Dancers join the fight. ' + UNSHAKEABLE_LINE,
    },
    hooks: withTenacity({
      // a stun-like interrupts the speech at once (the engine), so does a silence (his monologue is a spell)
      onStatusApplied: function (unit, inst) {
        if (inst && inst.id === 'silenced' && windupOf(unit, 'a3_dk_monologue')) DD.AI.cancelIntents(unit, 'Silenced!');
        syncMonologue(unit);
      },
      onTurnStart: function (unit) {
        const d = unit.data;
        if (!d.intermission && unit.hp <= unit.maxHp * 0.5) { d.intermission = true; intermission(unit); }
      },
    }),
    barks: {
      spawn: ['*thunder rolls, exactly on cue*', 'At last... an audience worthy of my entrance.'],
      attack: ['Behold! My... swing!', 'Witness me!', '*dramatic gasp* Take THAT!'],
      hurt: ['How DARE you interrupt my scene!', 'A flesh wound! A DRAMATIC flesh wound!'],
      death: ['I die... as I lived... dramatically.', 'Lower the curtain... slowly...'],
      monologue: ['You fools! Did you really think...', 'Allow me to explain my plan. In detail.', 'It all began on a stormy night...'],
      interrupted: ['You RUINED my moment!', 'I had a whole SPEECH!', '...I\'ve lost my place.'],
      intermission: ['INTERMISSION! Dancers!', 'Cue the music!'],
    },
    desc: 'Very Dramatic: his monologue winds up for a turn and then blasts everyone within 2, unless you deal him ' + MONO_BREAK + '+ damage first ' +
      '(he is left Vulnerable, +' + MONO_HYPE + ' Hype) or stun or silence him. His chain reels in heroes 2-6 tiles away, straight into his swing, and ' +
      'nobody walks away from him unpunished. At half HP: an intermission, with backup dancers. Fashionably late (initiative −1). Shrugs off ' +
      'back-to-back stuns. Weak to holy.',
  });

  // =============================================================================================================
  // ELITE: Pit Fiend Accountant — Infernal Debt (compounding, paid off by hitting him), wind-up: Hostile Audit
  // =============================================================================================================
  eskill({
    // v2: cooldown 2 (was 1): acting at once, a sight-free cross every other turn buried the party under Debt
    id: 'a3_fiend_invoice', name: 'Itemized Invoice', icon: '🧾', kind: 'spell', tags: ['fire', 'aoe', 'ranged'], anchor: 'unit', cooldown: 2,
    levels: [{ dmg: 13, debt: 2, r: 8 }], target: { type: 'unit', range: function (L) { return [1, L.r]; }, filter: 'enemy', los: false }, area: { shape: 'cross', size: 1 },
    desc: function (L) { return 'Rain flaming paperwork on a target up to ' + L.r + ' tiles away (no line of sight needed) and the 4 tiles around it: ' + L.dmg + ' fire damage and ' + L.debt + ' Infernal Debt to every foe there.'; },
    flavor: 'Line 47: "Breathing (premium tier)."',
    execute: function (ctx) {
      attackBark(ctx.user, 0.3);
      if (ctx.target) { DD.FX.projectile(ctx.user, ctx.target, { kind: 'fireball', color: '#ff8a3a' }); DD.FX.explosion(ctx.target, { radius: 1, color: '#ff8a3a' }); }
      ctx.foes.forEach(function (f) {
        if (!active(f)) return;
        A().damage(ctx.user, f, ctx.L.dmg, { element: 'fire' });
        addDebt(f, ctx.L.debt, ctx.user);
      });
    },
  });

  eskill({
    id: 'a3_fiend_audit', name: 'Hostile Audit', icon: '📊', kind: 'spell', tags: ['aoe'], anchor: 'ground', cooldown: 3,
    levels: [{ dmg: 16, debt: 1 }], target: { type: 'tile', range: [1, 12], filter: 'any', los: false }, area: { shape: 'row', size: 12 },
    desc: function (L) {
      return 'Wind-up: he marks a whole line across the arena through a target. At the start of his next turn: ' + L.dmg + ' damage and ' + L.debt +
        ' Infernal Debt to every foe on it.';
    },
    flavor: 'Every line. Every column. Every receipt you ate.',
    execute: function (ctx) {
      A().bark(ctx.user, 'audit');
      ctx.tiles.forEach(function (p, i) { DD.FX.tile(p.x, p.y, 'glow', { color: '#ff8a3a', parallel: i > 0 }); });
      DD.FX.shake(8, 350);
      ctx.foes.forEach(function (f) {
        if (!active(f)) return;
        A().damage(ctx.user, f, ctx.L.dmg);
        addDebt(f, ctx.L.debt, ctx.user);
      });
    },
  });

  eskill({
    id: 'a3_fiend_smack', name: 'Fiscal Smackdown', icon: '👊', kind: 'attack', tags: ['melee'], anchor: 'self',
    levels: [{ dmg: 15, debt: 1 }], target: { type: 'unit', range: [1, 1], filter: 'enemy' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to an adjacent target and add ' + L.debt + ' Infernal Debt.'; },
    flavor: 'A fully itemized beating.',
    execute: function (ctx) {
      lunge(ctx);
      attackBark(ctx.user, 0.3);
      ctx.foes.forEach(function (f) {
        if (!active(f)) return;
        A().damage(ctx.user, f, ctx.L.dmg);
        addDebt(f, ctx.L.debt, ctx.user);
      });
    },
  });

  /** The line (row or column through a foe, perpendicular to the way he faces it) that audits the most foes. */
  function auditTarget(unit, api) {
    let best = null;
    api.foes(unit).forEach(function (f) {
      const d = Math.abs(f.x - unit.x) + Math.abs(f.y - unit.y);
      if (d < 1 || d > 12) return;
      let sc = 0;
      api.tilesFor(unit, 'a3_fiend_audit', f).forEach(function (p) {
        const o = G().unitAt(p.x, p.y);
        if (!active(o) || o === unit) return;
        sc += G().hostile(unit, o) ? 10 : -6;
      });
      if (!best || sc > best.sc) best = { x: f.x, y: f.y, sc: sc };
    });
    return best && best.sc > 0 ? best : null;
  }

  /** His turn: mark a line for an audit when it is ready (it lands at the start of his next turn), then one attack. */
  function fiendPlan(unit, api) {
    if (!windupOf(unit, 'a3_fiend_audit') && api.canUse(unit, 'a3_fiend_audit')) {
      const a = auditTarget(unit, api);
      if (a && api.windUp(unit, 'a3_fiend_audit', { x: a.x, y: a.y }, { label: 'Hostile Audit', anchor: 'ground' })) A().maybeBark(unit, 'audit', 0.6);
    }
    plan(unit, api, { skills: ['a3_fiend_smack', 'a3_fiend_invoice'], style: MELEE, keep: 1 });
  }

  function fiendOverlay(g, t) {
    g.poly([[-0.4, -23], [2.6, -23], [2.1, -20], [3.8, -10], [1.1, -7], [-1.4, -10], [0.1, -20]], '#c0102a', undefined);
    // a calculator that only does addition (to your debt)
    g.rect(-14, -15, 5.5, 7.5, '#2a2a33', undefined, 1);
    g.rect(-13.2, -14.2, 3.9, 2, '#9fe3a0', null);
  }

  DD.registerEnemy({
    id: 'a3_pit_fiend', name: 'Pit Fiend Accountant', act: 3, tier: 'elite', hp: 150, mov: 3, armor: 1, init: 1,
    tags: ['devil'], flags: { immovable: true, large: true }, resist: { fire: 0, poison: 0.5, holy: 1.5 },
    sprite: { base: 'humanoid', scale: 1.5, build: 'huge', outfit: 'coat',
      palette: { skin: '#a3241c', cloth: '#22202a', cloth2: '#f2eee2', hair: '#1a1014', eye: '#ffe14a', metal: '#d4af37', accent: '#ff6a1a', wing: '#5a1410', horn: '#2a1a14', quill: '#f2eee2' },
      head: { horns: 'ram', face: 'glasses', eyes: 'angry', mouth: 'fangs' }, wings: 'demon', tail: 'devil', mainhand: 'quill', offhand: 'book',
      bling: ['rings'], aura: { kind: 'flames', color: '#ff5a1a' }, overlay: fiendOverlay },
    skills: ['a3_fiend_invoice', 'a3_fiend_audit', 'a3_fiend_smack'], ai: fiendPlan, aiStyle: MELEE, xp: 15, gold: [12, 18],
    passive: {
      name: 'Infernal Debt', icon: '🧾',
      desc: 'His hits add Infernal Debt: at the start of each of its turns an indebted hero loses its Debt in HP, then the Debt grows by 1 (max ' + DEBT_MAX +
        '). Every skill hit on him pays off ' + DEBT_PAYOFF + '. Forgiven when he dies. On his turn he marks an audit line when it is ready, then smacks the hero ' +
        'next to him (he sticks to that one) or invoices a hero up to 8 tiles away. Walk away from him and he smacks you (attack of opportunity). ' +
        UNSHAKEABLE_LINE,
    },
    hooks: withTenacity({
      onDeath: function (unit) {
        const s = S();
        if (!s) return;
        let n = 0;
        s.units.forEach(function (u) { if (!u.dead && has(u, 'a3_debt')) { A().removeStatus(u, 'a3_debt', { text: 'Debt forgiven!' }); n++; } });
        if (n) A().log('With the accountant gone, every Infernal Debt is forgiven. Nobody else knows how the ledger works.', 'system');
      },
    }),
    barks: {
      spawn: ['Your souls are past due.', 'Let\'s review your expenses. All of them.'],
      attack: ['Here\'s your invoice!', 'Interest compounds daily!', 'Deductible? Not on this plane.'],
      hurt: ['That\'s an unauthorized withdrawal!', 'I\'m writing that off!'],
      death: ['Debts... forgiven... (ugh)...', 'Audit... me... gently...'],
      audit: ['Prepare to be AUDITED.', 'Every line. Every column.'],
    },
    desc: 'Infernal Debt: indebted heroes lose HP at the start of every turn and the debt grows; every hit on him pays off ' + DEBT_PAYOFF +
      '. His audit marks a whole line and lands at the start of his next turn: step off it. Up close he smacks, also anyone walking away. ' +
      'Shrugs off back-to-back stuns. Immovable. Immune to fire.',
  });

  // =============================================================================================================
  // Encounters
  // =============================================================================================================
  const NOT_A_HIT = { status: 1, surface: 1, terrain: 1 };
  function enc(def) {
    if (def.weight === undefined) def.weight = 1;
    def.reward = def.reward || { goldMult: 1, itemRarity: def.kind === 'elite' ? 'rare' : null };
    return DD.registerEncounter(def);
  }

  enc({
    id: 'a3_hellhound_walkies', act: 3, kind: 'normal', name: 'Walkies in the Nine Hells', weight: 1, minDepth: 0,
    intro: 'Two imps are walking three hell hounds. There are no leashes. Two of the hounds are on fire. Both imps are filming it.',
    map: { theme: 'hellscape', w: 11, h: 11, features: ['lava', 'oil', 'barrels'], density: 1 },
    enemies: [{ id: 'a3_hell_hound', n: 3 }, { id: 'a3_imp_influencer', n: 2 }],
    objective: { type: 'killAll' },
  });

  enc({
    id: 'a3_influencer_collab', act: 3, kind: 'normal', name: 'Influencer Collab Stream', weight: 1, minDepth: 1,
    intro: 'Two imps, their dating coach and an eyeball intern (camera duty) are filming a collab with a hell hound. You are the content now.',
    map: { theme: 'hellscape', w: 10, h: 9, features: ['fire', 'hills', 'chokepoint'], density: 1 },
    // v2: two imps (was three): three of them diving the weakest hero made it the act's deadliest normal fight (5 downs)
    enemies: [{ id: 'a3_imp_influencer', n: 2 }, { id: 'a3_succubus_coach', n: 1 }, { id: 'a3_hell_hound', n: 1 }, { id: 'a3_eyeball_intern', n: 1 }],
    objective: { type: 'killAll' },
  });

  enc({
    id: 'a3_self_help_seminar', act: 3, kind: 'normal', name: 'Mandatory Self-Help Seminar', weight: 0.8, minDepth: 1,
    intro: 'Welcome to "Unlock Your Inner Lich: A Five-Round Journey". Attendance is mandatory. The exits are on fire.',
    map: { theme: 'dm_table', w: 11, h: 11, features: ['cheeto', 'water'], density: 1 },
    enemies: [{ id: 'a3_mind_flayer', n: 1 }, { id: 'a3_succubus_coach', n: 2 }, { id: 'a3_eyeball_intern', n: 1 }, { id: 'a3_kobold_shield', n: 1 }],
    objective: { type: 'survive', rounds: 5 },
    reinforcements: [{ round: 3, enemies: [{ id: 'a3_imp_influencer', n: 2 }], edge: 'N', text: 'Two imps arrive late to the seminar and livestream the Q&A.' }],
  });

  enc({
    id: 'a3_trial_by_combat', act: 3, kind: 'normal', name: 'Trial by Combat (Rules As Written)', weight: 1, minDepth: 2,
    intro: 'The court of the DM\'s table is now in session. The judge is a d20. The court reporter is an eyeball intern. Nobody reads the minutes.',
    map: {
      theme: 'dm_table',
      layout: [
        '###########',
        '#P.EBJBE.P.',
        '#...EsE....',
        '#.f.....f..',
        '#.f..E..f..',
        '#..........',
        '#___.__.___',
        '#..........',
        '#.P..X..P..',
        '#..HHHHH...',
        '#..HHHHH...',
      ],
      heights: [
        '00000000000',
        '00022222000',
        '00011111000',
        '00000000000',
        '00000000000',
        '00000000000',
        '00000000000',
        '00000000000',
        '00000000000',
        '00000000000',
        '00000000000',
      ],
      legend: {
        J: { obj: { id: 'd20', label: 'The Honorable Judge d20' } },
        B: { terrain: 'paper' },
        s: { terrain: 'paper' },
        f: { obj: { id: 'fence', label: 'Jury Box Rail' } },
        X: { obj: { id: 'barrel_explosive', label: 'Exhibit B (Volatile)' } },
      },
    },
    // v2: no imp (it went first, Marked the weakest hero and the bench's high ground did the rest: a round-1 down in 1
    // fight of 6 at level 4)
    enemies: [{ id: 'a3_rules_lawyer', n: 2 }, { id: 'a3_eyeball_intern', n: 1 }, { id: 'a3_nat1_golem', n: 1 }],
    objective: { type: 'killAll' },
    reinforcements: [{ round: 3, enemies: [{ id: 'a3_hell_hound', n: 1 }], edge: 'N', text: 'The bailiff releases his dog. It is on fire. Objection overruled.' }],
  });

  enc({
    id: 'a3_cursed_dice_night', act: 3, kind: 'normal', name: 'Cursed Dice Night', weight: 1, minDepth: 2,
    intro: 'Two golems made of every die that ever rolled a 1 have come for revenge. A rules lawyer is here to check their math.',
    map: { theme: 'dm_table', w: 12, h: 11, features: ['pits', 'cheeto'], density: 1 },
    enemies: [{ id: 'a3_nat1_golem', n: 2 }, { id: 'a3_imp_influencer', n: 2 }, { id: 'a3_rules_lawyer', n: 1 }, { id: 'a3_kobold_shield', n: 1 }],
    objective: { type: 'killAll' },
  });

  enc({
    id: 'a3_kobold_pep_rally', act: 3, kind: 'normal', name: 'Kobold Pep Rally', weight: 0.8, minDepth: 1,
    intro: 'Kobolds are holding a pep rally for their dragon. The totems power their Spirit Fingers. Smash the totems before the pep squad arrives.',
    map: { theme: 'hoard', w: 11, h: 11, features: ['pits', 'chest'], density: 1 },
    enemies: [{ id: 'a3_kobold_shield', n: 2 }, { id: 'a3_hell_hound', n: 2 }, { id: 'a3_imp_influencer', n: 1 }],
    objective: { type: 'destroy', objId: 'totem', count: 3 },
    reinforcements: [{ round: 4, enemies: [{ id: 'a3_succubus_coach', n: 1 }, { id: 'a3_imp_influencer', n: 1 }], edge: 'N', text: 'The pep squad arrives: a succubus dating coach and an imp with a megaphone.' }],
    rules: [{
      id: 'a3_spirit_fingers', name: 'Spirit Fingers', icon: '📣', turns: -1,
      desc: 'While a totem stands, enemies take 1 less damage from every hit (Burn, Poison, Bleed and hazard ticks are unaffected).',
      hooks: {
        // v2: 1 (was 2): with enemies acting at once, a party of small hitters spent the whole fight chipping. A hit is
        // an attack, a blast or a bump: status ticks and hazards (cause 'status' / 'surface' / 'terrain') are not hits
        modifyIncomingDamage: function (d) {
          if (!d.target || d.target.side !== 'enemy' || !countObjects('totem') || NOT_A_HIT[d.cause]) return;
          d.flat -= 1;
        },
      },
    }],
    onStart: function (state) {
      state.grid.tiles.forEach(function (t) { if (t.obj && t.obj.id === 'totem') t.obj.label = 'Pep Rally Totem'; });
    },
    // nobody left to cheer (and nobody coming): the remaining totems topple over in shame, so the fight can't stall
    onRoundEnd: function (state) {
      if (state.result || state.units.some(function (u) { return u.side === 'enemy' && !u.dead; })) return;
      if ((state.reinforcements || []).some(function (w) { return !w.done; })) return;
      const left = state.grid.tiles.filter(function (t) { return t.obj && t.obj.id === 'totem'; });
      if (!left.length) return;
      DD.Act.log('With no kobolds left to cheer, the remaining totems topple over in embarrassment.', 'narrator');
      left.forEach(function (t) { DD.Act.destroyObject(t.x, t.y, null); });
    },
  });

  enc({
    id: 'a3_snack_heist', act: 3, kind: 'normal', name: 'The Great Snack Heist', weight: 0.7, minDepth: 1,
    intro: 'Three hell hounds have smelled the DM\'s cheese puffs. If the snack bowl falls, the session is over. Forever.',
    // 12 wide: on a 10×10 table the bowl sometimes spawned 1-2 tiles from the hounds and was eaten before the party
    // could react; the extra room keeps it tense but answerable
    map: { theme: 'dm_table', w: 12, h: 10, features: ['cheeto', 'cover'], density: 1 },
    enemies: [{ id: 'a3_hell_hound', n: 3 }, { id: 'a3_imp_influencer', n: 1 }, { id: 'a3_kobold_shield', n: 1 }],
    objective: { type: 'protect', objId: 'a3_snack_bowl' },
  });

  enc({
    id: 'a3_intern_orientation', act: 3, kind: 'normal', name: 'Intern Orientation Day', weight: 1, minDepth: 3,
    intro: 'Three eyeball interns are being shown around the hoard by HR (a devil lawyer). Their beams do not care who is in the way.',
    map: { theme: 'hoard', w: 12, h: 12, features: ['pillars', 'open'], density: 1 },
    enemies: [{ id: 'a3_eyeball_intern', n: 3 }, { id: 'a3_rules_lawyer', n: 1 }, { id: 'a3_kobold_shield', n: 1 }],
    objective: { type: 'killAll' },
    reinforcements: [{ round: 3, enemies: [{ id: 'a3_imp_influencer', n: 1 }], edge: 'E', text: 'An imp from Marketing crashes the orientation. It brought a ring light.' }],
  });

  // ---- elites ------------------------------------------------------------------------------------------------
  enc({
    id: 'a3_hoarders_lair', act: 3, kind: 'elite', name: 'The Hoarder\'s Lair', weight: 1, minDepth: 2,
    intro: 'A young red dragon naps on a mountain of other people\'s gold, guarded by two kobolds and a very good (evil) dog. Every pile you pocket weakens it.',
    map: {
      theme: 'hoard',
      layout: [
        '############',
        '#P...G....P.',
        '#..GgggG....',
        '#..ggEgg.D..',
        '#..GKgKG....',
        '#....__.....',
        '#.$..__..^^.',
        '#........^^.',
        '#.P......P..',
        '#..HHHHHH...',
        '#..HHHHHH...',
      ],
      heights: [
        '000000000000',
        '000000000000',
        '000111110000',
        '000112110000',
        '000111110000',
        '000000000000',
        '000000000000',
        '000000000000',
        '000000000000',
        '000000000000',
        '000000000000',
      ],
      legend: {
        g: { terrain: 'gold' },
        G: { obj: 'a3_hoard_pile' },
        K: { terrain: 'gold', zone: 'enemy', mark: 'K' },
        D: { zone: 'enemy', mark: 'D' },
      },
    },
    enemies: [{ id: 'a3_red_dragon', n: 1 }, { id: 'a3_kobold_shield', n: 2, mark: 'K' }, { id: 'a3_hell_hound', n: 1, mark: 'D' }],
    objective: { type: 'killAll' },
    reward: { goldMult: 1.2, itemRarity: 'rare' },
  });

  enc({
    id: 'a3_very_dramatic_entrance', act: 3, kind: 'elite', name: 'A Very Dramatic Entrance', weight: 1, minDepth: 2,
    intro: 'Fog machines hiss. Thunder rolls on cue. A Death Knight descends a staircase that was not there a second ago.',
    map: { theme: 'hellscape', w: 12, h: 11, features: ['lava', 'braziers'], density: 1 },
    enemies: [{ id: 'a3_death_knight', n: 1 }, { id: 'a3_backup_dancer', n: 2 }, { id: 'a3_succubus_coach', n: 1 }],
    objective: { type: 'killAll' },
    reward: { goldMult: 1.2, itemRarity: 'rare' },
  });

  enc({
    id: 'a3_tax_season', act: 3, kind: 'elite', name: 'Tax Season in the Nine Hells', weight: 1, minDepth: 2,
    intro: 'Welcome to the Infernal Revenue Office. Take a number. The number is your remaining HP.',
    map: {
      theme: 'hellscape',
      layout: [
        '############',
        '#K.K.....K..',
        '#...dEd..E..',
        '#...........',
        '#.dd..^..dd.',
        '#.E....E....',
        '#.dd..^..dd.',
        '#....w......',
        '#.X......X..',
        '#...HHHHH...',
        '#...HHHHH...',
      ],
      heights: [
        '000000000000',
        '011111111100',
        '011111111100',
        '000000000000',
        '000000000000',
        '000000000000',
        '000000000000',
        '000000000000',
        '000000000000',
        '000000000000',
        '000000000000',
      ],
      legend: {
        K: { obj: { id: 'bookshelf', label: 'Filing Cabinet' } },
        d: { obj: { id: 'crate', label: 'Desk' } },
        w: { obj: { id: 'fountain', label: 'Water Cooler' } },
        X: { obj: { id: 'barrel_explosive', label: 'Industrial Shredder' } },
      },
    },
    // v2: the fiend and his two imps (the Rules Lawyer and a second late imp made it a 6-enemy pile-up under initiative)
    enemies: [{ id: 'a3_pit_fiend', n: 1 }, { id: 'a3_imp_influencer', n: 2 }],
    objective: { type: 'killAll' },
    reinforcements: [{ round: 4, enemies: [{ id: 'a3_imp_influencer', n: 1 }], edge: 'N', text: 'An imp is back from its lunch break. It brought receipts (and a ring light).' }],
    reward: { goldMult: 1.3, itemRarity: 'rare' },
  });
})();
