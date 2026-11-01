/* Dungeons and Degenerates — js/engine/autoplay.js
 * DD.AutoPlay (ARCHITECTURE §5.7): a greedy but fair player for tests, balance sims and ?autoplay=1. Fair = it only uses
 * what a player sees: the initiative order, every enemy's position, move, skills and statuses (the inspect panel), boss
 * wind-ups, HUD previews (dry runs) and aura threats (threatAt); outcomes that depend on dice are valued by their
 * expected value (dry runs on other dice, never on the real ones). It never runs the enemies' planners.
 * v2 (initiative, no telegraphs): takeTurn() plays the CURRENT hero's turn (the hero, then the summons acting on its turn);
 * unused AP is simply lost (no Guard). Stalemates: the reach term weighs less after round 6 and not at all after three
 * rounds in a row without any HP change (caution, AP.stall()).
 *
 * Danger model (no telegraphs): the horizon is the current turn owner's next turn. turnPlan() lists who acts before
 * then, in initiative order (the rest of this round, next round up to the owner's slot, joiners by their roll). For
 * every AI enemy and each of its turns in the horizon (a stunned / asleep / frozen / sheep one loses the first): where it
 * can strike from any tile its walk reaches (walls, units in the way, line of sight for single-target shots, straight
 * lines, ranges and areas of its damaging skills ready by then), whom it will likely pick (a soft choice like its AI:
 * kills first, then the wounded, then the most damage after armor; taunt → the taunter only; ¼ "anyone in reach"), and
 * the expected damage of that hit — as many hits a turn as it was seen to deal so far this fight (hitsPerTurn: a player
 * learns that the Rat King hits three times). A hit is weighed by
 *   urgency  1 if the enemy acts before the victim's own next turn (the actor: always), else RESPOND (the victim gets to
 *            step away or deal with it first; more when it is rooted, 1 when it will lose its turn), and
 *   sigma    ×(1 − ALLY_FIRST × its odds) for every ally acting before that enemy that could reach and hurt it.
 * Protect objectives: the protected object competes for the enemies' attention (with skills that can hurt objects), and
 * plain moves onto the tiles next to it get the allies' danger (the object's included) recomputed: standing guard counts.
 * Boss wind-ups land at the start of their owner's turn in that list (fixed / self / tracked tiles); threatAt auras,
 * hazards, Burn and Poison add certain damage. Per unit, the hits give the exact odds of the HP it loses and of going
 * down (a small dynamic program over the damage, after its Block): cost = riders + HP × HURT + P(down) × downCost.
 * So killing, stunning, rooting, pushing or taunting the enemy that acts next (before an ally can) saves the most,
 * stepping out of the reach of the enemies acting next matters most, and allies whose turn comes late get protected.
 *
 * Every decision step of a unit ranks candidates by one damage-equivalent number (ending the turn = 0):
 *   total = gain + FP(end tile, AP left) + (D0 − D1) − small costs
 *   gain  damage and kills, heals, Block, statuses by kind (stun-likes, DoTs, debuffs on foes, buffs on friends), AP and
 *         cooldowns given to allies, cleanses, displacement (off high ground, onto edges and hazards, clustering foes for
 *         an ally's AoE), objects and puzzle hints, summons, Hype, skill aiScore(ctx) ×0.75 and autoplayValue(ctx).
 *   D     party danger (above); D0 now, D1 after the action from its dry run (kills, stuns, pushes, taunts, teleports,
 *         stealth, Block, body-blocking and drawing attacks all count). The best plain moves get the same treatment.
 *   FP    what the unit can still do with its AP from there (best value per AP at that tile, or after one more move): it
 *         attacks twice and then steps out of reach instead of hiding at once or standing in a gaze all turn.
 * Candidates: Help Up, objective smashes and walks to a downed ally first (not while the ally's tile is about to take
 * more than it would get up with); then (move +) skill from every reachable tile (a quick estimate for all, exact dry
 * runs for the best few, for utility skills and for consumables), puzzle hints and plain moves (cover, or progress
 * toward the fight by walking distance when nothing is in reach). The best total above 0.5 is done; otherwise the unit
 * walks toward the fight once (walking distance, around walls) and stops. Signatures wait for a big moment or the end
 * of the fight. Units given AP or made mid-turn (summons) act in a later pass of the same turn.
 * Content hooks (all optional): skill aiScore(ctx) / autoplayValue(ctx) → number (ctx.autoplay = { preview } when exact);
 * object `autoplay: number | (unit, obj, tile, state) => number` puzzle hints (§5.7); enemy def or status
 * hooks.threatAt(enemy, unit, tile, extra) → number | { dmg, label, ignoreBlock } for damage that is not a wind-up.
 * runBattle() always terminates. AP.measure = true records decision times in AP.samples { unit: [ms], step: [ms] }.
 */
(function () {
  'use strict';
  const DD = window.DD;
  const U = DD.util;

  const AP = (DD.AutoPlay = {});
  const REFINE = 8;          // exact dry runs of the best quick-scored (move +) skill options per decision
  const UTIL_REFINE = 3;     // exact dry runs per utility skill (no dmg / heal numbers), from the current tile
  const CONS_REFINE = 4;     // targets tried per consumable
  const EV_SAMPLES = 3;      // dry runs averaged when the outcome depends on dice
  const FP_RATE = 0.8;       // share of the best value per AP that leftover AP is worth
  const DOWN_COST = 20;      // a hero going down: lost turns, 2 AP to Help Up, a Scar, the third down kills
  const HURT = 1.25;         // a hero's HP is worth more than a foe's (it carries through the run); summons 0.8
  const PROGRESS = 1;        // a tile of walking distance toward the fight, when nothing is in reach
  const MAX_STEPS = 12;
  // v2 danger model (see the header)
  const RESPOND = 0.35;      // an enemy turn after the victim's own next turn: it can step away or deal with it first
  const RESPOND_ROOTED = 0.7;
  const ALLY_FIRST = 0.2;    // per ally acting before an enemy that could reach it and kill it: it may stop it first
  const SIGMA_MIN = 0.5;
  const TARGET_T = 2.5;      // softness of an enemy's target choice (score points per e-fold)
  const TARGET_MIX = 0.25;   // share of "it may go for anyone in reach" (custom planners, styles, position)
  const TARGET_REF = 20;     // score offset inside exp() (keeps the weights small)
  const MOVE_OTHERS = 4;     // plain moves whose effect on the allies' danger (body-blocking, drawing attacks) is computed
  const DP_CAP = 400;        // HP + Block cap of the damage-odds table
  const OFF = { x: -99, y: -99 };
  const STUNLIKE = { stun: 1, sleep: 1, frozen: 1, sheep: 1 };
  const ELEMENTS = ['fire', 'frost', 'lightning', 'poison', 'holy'];
  // what a hit costs on top of its damage, even fully Blocked (riders: statuses, pulls, lost turns)
  const RIDER_TAGS = ['root', 'poison', 'bleed', 'burn', 'weak', 'vulnerable', 'silence', 'mark', 'dazzle', 'confuse', 'pull', 'push', 'knockback'];
  const LOCK_TAGS = ['stun', 'sleep', 'freeze', 'frozen', 'charm', 'sheep', 'polymorph'];

  function S() { return DD.Combat.state; }
  function G() { return DD.Grid; }
  function active(u) { return !!u && !u.dead && !u.downed; }
  function has(u, id) { return DD.Act.hasStatus(u, id); }
  function key(x, y) { return x + ',' + y; }
  function num(v) { return typeof v === 'number' && isFinite(v) ? v : 0; }
  function stacksOf(u, id) { const st = DD.Act.getStatus(u, id); return st ? (st.stacks || 1) : 0; }
  function isBoss(u) { return !!u && (u.tier === 'boss' || !!u.isBoss); }
  function clock() { return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now(); }
  function dist(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }

  // ---- threat model ------------------------------------------------------------------------------------------------
  function incapacitated(e) { return DD.Combat.isStunned(e) || has(e, 'sheep'); }

  const riderMemo = {};
  /** Cost of being hit by this skill beyond its damage: 1, +1.5 for riders (statuses, displacement), +5 for lock-downs. */
  function riderCost(def) {
    if (!def) return 1;
    if (riderMemo[def.id] !== undefined) return riderMemo[def.id];
    const tags = def.tags || [];
    const L = DD.skillLevel(def, 1) || {};
    const any = function (list) { return list.some(function (t) { return tags.indexOf(t) >= 0 || L[t]; }); };
    return (riderMemo[def.id] = 1 + (any(RIDER_TAGS) ? 1.5 : 0) + (any(LOCK_TAGS) ? 5 : 0));
  }

  /**
   * Rounds in a row in which the party wore nothing down (no enemy lost HP or fell, no damageable object lost HP),
   * measured at each new round outside dry runs. A long streak is a stalemate: a chokepoint plugged by a downed hero
   * whom nobody dares to Help Up while the enemies can't get past, or a last hero kiting a boss it never hits.
   */
  const stall = { s: null, round: 0, hp: 0, n: 0, quiet: 0 };
  function wornSig(s) {
    let hp = 0, n = 0;
    for (let i = 0; i < s.units.length; i++) { const u = s.units[i]; if (u.side === 'enemy' && active(u)) { hp += u.hp || 0; n++; } }
    for (let i = 0; i < s.grid.tiles.length; i++) { const o = s.grid.tiles[i].obj; if (o && o.hp > 0) hp += o.hp; }
    return { hp: hp, n: n };
  }
  function quietRounds() {
    const s = S();
    if (!s) return 0;
    if (DD.Act.simulating) return stall.round === s.round ? stall.quiet : 0;
    if (stall.s !== s) { const w = wornSig(s); stall.s = s; stall.round = s.round; stall.hp = w.hp; stall.n = w.n; stall.quiet = 0; return 0; }
    if (stall.round !== s.round) {
      const w = wornSig(s);
      stall.quiet = w.hp < stall.hp || w.n < stall.n ? 0 : stall.quiet + Math.max(1, s.round - stall.round);
      stall.hp = w.hp; stall.n = w.n;
      stall.round = s.round;
    }
    return stall.quiet;
  }
  /**
   * v2 stalemate breaker: the longer a fight drags on, the less the enemies' reach (an estimate, not a telegraph) holds the
   * party back: 1 up to round 6, then −0.1 a round down to 0.3 (and walking toward the fight is worth more, progressAt);
   * after round 6, three rounds in a row without wearing anything down (quietRounds) drop it to 0 until the party makes
   * progress again. Survive objectives keep the schedule only (holding out is the point there).
   */
  function caution() {
    const s = S();
    const r = (s && s.round) || 1;
    const quiet = quietRounds();
    if (r <= 6) return 1;
    const hold = s && s.objective && s.objective.type === 'survive';
    return quiet >= 3 && !hold ? 0 : Math.max(0.3, 1 - 0.1 * (r - 6));
  }

  // ---- what the enemies were seen doing ---------------------------------------------------------------------------------
  /**
   * A player learns from watching: an enemy that hit twice as hard as one of its attacks (the Rat King's tails, pile and
   * gavel in one turn, an AoE across two heroes) will likely do it again. Per fight, for every AI unit acting alone on
   * its turn (no AI summons mixing in) and landing no wind-up then: the HP + Block its foes lost during its turn, in units
   * of its best single hit on each of them. hitsPerTurn = that average (prior: 1 hit), between 1 and 4.
   */
  const seen = { s: null, units: {}, snap: null };
  function seenNow() {
    const s = S();
    if (!DD.Act.simulating && seen.s !== s) { seen.s = s; seen.units = {}; seen.snap = null; }
    return seen;
  }
  function hitsPerTurn(e) {
    if (AP.learn === false) return 1;
    const o = seenNow().units[e.id];
    if (!o || !o.n) return 1;
    return Math.max(1, Math.min(4, (o.eq + 0.5) / (o.n + 0.5)));
  }
  function onTurnStart(ev) {
    const u = ev && ev.unit, s = S();
    if (!s || !u || DD.Act.simulating) return;
    const o = seenNow();
    o.snap = null;
    if (!active(u) || DD.Combat.isPlayerControlled(u) || G().effectiveSide(u) !== 'enemy' || incapacitated(u)) return;
    if (DD.Combat.groupOf(u).some(function (m) { return m !== u && !m.dead && !DD.Combat.isPlayerControlled(m); })) return;
    if ((u.intents || []).some(function (it) { return (it.turnsLeft || it.delay || 1) <= 1; })) return;   // a wind-up lands: priced as one
    const sk = readySkills(u)[0];
    if (!sk) return;
    const hp = {};
    for (let i = 0; i < s.units.length; i++) {
      const h = s.units[i];
      if (h.side !== 'hero' || !active(h)) continue;
      hp[h.id] = { v: (h.hp || 0) + (h.block || 0), one: Math.max(1, DD.AI.estimate(u, h, sk.base, sk.el) + sk.flat) };
    }
    o.snap = { id: u.id, hp: hp };
  }
  function onTurnEnd(ev) {
    const o = seenNow(), snap = o.snap;
    o.snap = null;
    if (!snap || !ev || !ev.unit || ev.unit.id !== snap.id) return;
    let eq = 0;
    for (const id in snap.hp) {
      const h = DD.Combat.byId(id), was = snap.hp[id];
      const now = !h || h.dead || h.downed ? 0 : (h.hp || 0) + (h.block || 0);
      if (now < was.v) eq += Math.min(3, (was.v - now) / was.one);
    }
    if (eq <= 0) return;   // nobody hurt this time (out of reach, busy): says nothing about how hard it hits
    const r = o.units[snap.id] || (o.units[snap.id] = { n: 0, eq: 0 });
    r.n++; r.eq += eq;
  }
  DD.afterLoad(function () { DD.Events.on('turn:start', onTurnStart); DD.Events.on('turn:end', onTurnEnd); });

  // ---- who acts when (initiative) -----------------------------------------------------------------------------------
  /** Rolled initiative order (as DD.Combat sorts it): higher total, then higher init, then heroes, then the coin flip. */
  function cmpEntries(a, b) {
    return (b.total - a.total) || (b.init - a.init) || ((b.side === 'hero' ? 1 : 0) - (a.side === 'hero' ? 1 : 0)) || ((b.tie || 0) - (a.tie || 0));
  }
  /**
   * Who acts when until the current turn owner's next turn (the horizon). seq 0 = this turn; 1, 2... = the turns after
   * it in initiative order: the rest of this round, then next round's turns before the owner's slot (joiners merged by
   * their roll, as the engine does). { known, L (the owner's next turn), ownerId, seqs: { id: [seq] } (AI units: the turns
   * they act on, summons on their owner's), next: { id: seq } (hero-side units: their next own turn; this turn's units
   * with AP left 0.5 = later this turn; the owner L) }. Without an order (deployment) every enemy acts at seq 1.
   */
  function turnPlan() {
    const s = S();
    const cur = DD.Combat.current();
    const plan = { known: false, L: 2, ownerId: cur ? cur.id : null, seqs: {}, next: {} };
    if (!s || !s.order || !cur) return plan;
    plan.known = true;
    const list = [];
    for (let i = Math.max(0, s.turnIndex + 1); i < s.order.length; i++) list.push(s.order[i]);
    const nextRound = s.order.slice();
    (s.joining || []).forEach(function (e) {
      if (s.initMode === 'roll' && !e.fixed) {
        let i = 0;
        while (i < nextRound.length && cmpEntries(nextRound[i], e) <= 0) i++;
        nextRound.splice(i, 0, e);
      } else nextRound.push(e);
    });
    for (let i = 0; i < nextRound.length; i++) { if (nextRound[i].unitId === cur.id) break; list.push(nextRound[i]); }
    let seq = 0;
    for (let i = 0; i < list.length; i++) {
      const u = DD.Combat.byId(list[i].unitId);
      if (!u || u.dead) continue;
      seq++;
      const group = DD.Combat.groupOf(u);
      for (let k = 0; k < group.length; k++) {
        const m = group[k];
        if (m.dead) continue;
        if (DD.Combat.isPlayerControlled(m)) { if (plan.next[m.id] === undefined) plan.next[m.id] = seq; }
        else (plan.seqs[m.id] || (plan.seqs[m.id] = [])).push(seq);
      }
    }
    plan.L = seq + 1;
    DD.Combat.groupOf(cur).forEach(function (m) { plan.next[m.id] = m !== cur && (m.ap || 0) > 0 && !DD.Combat.isStunned(m) ? 0.5 : plan.L; });
    return plan;
  }
  function seqsOf(plan, u) { return plan.known ? plan.seqs[u.id] || [] : [1]; }
  /** A hero-side unit's next chance to act in the plan (summons made in a dry run: their owner's, or later this turn). */
  function nextOf(plan, u) {
    let n = plan.next[u.id];
    if (n !== undefined) return n;
    if (u.ownerId && u.ownerId === plan.ownerId) return (u.ap || 0) > 0 ? 0.5 : plan.L;
    if (u.ownerId && plan.next[u.ownerId] !== undefined) return plan.next[u.ownerId];
    return plan.L;
  }
  /** Weight of an enemy turn that comes after u's own next turn: u can step away or deal with it first. */
  function respond(u) {
    if (DD.Combat.isStunned(u) || has(u, 'sheep')) return 1;   // its next turn is lost
    if (DD.Combat.cantMove(u)) return RESPOND_ROOTED;
    return RESPOND;
  }
  /** How much a hit at turn seq q matters for u: the actor always 1; others 1 if it comes before their own next turn. */
  function urgency(tm, u, q, asActor) {
    if (asActor || !tm.plan.known) return 1;
    return q < nextOf(tm.plan, u) ? 1 : respond(u);
  }

  // ---- enemy reach ------------------------------------------------------------------------------------------------------
  function elementOf(def) {
    const tags = def.tags || [];
    for (let i = 0; i < ELEMENTS.length; i++) if (tags.indexOf(ELEMENTS[i]) >= 0) return ELEMENTS[i];
    return null;
  }
  /** Attacker-side damage multiplier (as DD.AI estimates it): Weak, Inspired, Empowered, item damage, difficulty. */
  function outMult(u) {
    let m = 1;
    if (has(u, 'weak')) m *= 0.75;
    if (has(u, 'inspired')) m *= 1.25;
    if (has(u, 'empowered')) m *= 1.5;
    if (u.dmgBonus) m *= 1 + u.dmgBonus;
    if (u.side === 'enemy') m *= (S().difficulty && S().difficulty.dmg) || 1;
    return m;
  }
  /** Defender side of a hit of raw damage (wind-ups: the number already holds the attacker's multipliers). */
  function defend(u, raw, el) {
    if (has(u, 'invulnerable')) return 0;
    let m = 1;
    if (has(u, 'vulnerable')) m *= 1.25;
    m *= DD.Act.takenMult(u);
    if (el && u.resist && typeof u.resist[el] === 'number') m *= u.resist[el];
    if (el === 'lightning' && has(u, 'wet')) m *= 1.5;
    let v = Math.round(raw * m);
    const mk = DD.Act.getStatus(u, 'marked');
    if (v > 0 && mk) v += mk.stacks || 0;
    if (v > 0 && u.armor) v = Math.max(1, v - u.armor);
    return v;
  }
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
   * The damaging skills an AI unit has ready for its next turn (charges left, not cooling down then, no spells while
   * silenced), best first: { def, base (L.dmg), raw, flat, el, single (one target, needs range / sight / a straight
   * line), r0, r1, los, straight, reach / rmin (areas: how far from where it stands it can hit), obj, ride }.
   */
  function readySkills(e) {
    const out = [];
    const mult = outMult(e);
    const flat = DD.AI.telegraphFlat ? num(+DD.AI.telegraphFlat(e)) : 0;
    DD.Combat.slotsOf(e).forEach(function (sl) {
      const def = DD.getSkill(sl.id);
      if (!def) return;
      if (def.charges > 0 && (sl.uses || 0) >= def.charges) return;
      if ((sl.cd || 0) > 1 || ((sl.cd || 0) === 1 && sl.fresh)) return;   // still cooling down on its next turn
      if (def.kind === 'spell' && has(e, 'silenced')) return;
      const lvl = sl.level || 1;
      const L = DD.skillLevel(def, lvl);
      if (!L || !(L.dmg > 0)) return;
      const tg = DD.Targeting.targetSpec(def);
      const rg = DD.Targeting.range(e, def, lvl);
      const shape = (def.area && def.area.shape) || 'single';
      const size = Math.max(0, Math.floor(+DD.resolve(def.area && def.area.size, L, e, 1) || 0));
      const single = shape === 'single' && tg.type !== 'self' && tg.type !== 'dir';
      let reach = rg[1], rmin = rg[0];
      if (!single) {
        const ext = areaExtent(shape, size);
        if (shape === 'all_foes') reach = 99;
        else if (shape === 'line') reach = Math.max(size, tg.type === 'tile' || tg.type === 'unit' ? rg[1] : 1);
        else if (shape === 'cone') reach = Math.max(1, 2 * size - 1);
        else if (tg.type === 'self') reach = ext;
        else if (tg.type === 'dir') reach = 1 + ext;
        else reach = rg[1] + ext;
        rmin = tg.type === 'self' || tg.type === 'dir' || shape === 'line' || shape === 'cone' ? 1 : Math.max(0, rg[0] - ext);
      }
      const tags = def.tags || [];
      out.push({ def: def, base: L.dmg, raw: Math.max(0, Math.round(L.dmg * mult) + flat), flat: flat, el: elementOf(def),
        single: single, r0: rg[0], r1: rg[1], los: tg.los !== false, straight: !!tg.straight, reach: reach, rmin: rmin,
        obj: tg.filter === 'object' || tags.indexOf('objects') >= 0, units: tg.filter !== 'object', ride: riderCost(def) });
    });
    out.sort(function (a, b) { return b.raw - a.raw; });
    return out;
  }

  /**
   * Walk signature of an AI unit: its tile, move, flying, and the units and objects around it (they block or stop its
   * walk). Equal signatures → equal walks, so threat models of one decision (the real state, dry runs, virtual moves)
   * share them (ctx.posCache).
   */
  function walkSig(e, mov, hide) {
    const s = S();
    const r = mov + 1;
    let sig = e.id + '@' + e.x + ',' + e.y + ':' + mov + (e.flags && e.flags.flying ? 'f' : '') + '|';
    for (let i = 0; i < s.units.length; i++) {
      const o = s.units[i];
      if (o === e || o.dead || o === hide || dist(o, e) > r) continue;
      sig += (G().hostile(e, o) ? 'h' : 'f') + o.x + ',' + o.y + ';';
    }
    const g = s.grid;
    for (let dy = -r; dy <= r; dy++) {
      const y = e.y + dy;
      if (y < 0 || y >= g.h) continue;
      const rem = r - Math.abs(dy);
      for (let dx = -rem; dx <= rem; dx++) {
        const x = e.x + dx;
        if (x < 0 || x >= g.w) continue;
        const t = g.tiles[y * g.w + x];
        if (t && t.obj) sig += 'o' + x + ',' + y + t.obj.id + ';';
      }
    }
    return sig;
  }
  /** Tiles an AI unit can strike from on its turn: where it stands + its walk (hide: that unit is not in the way). */
  function srcPositions(tm, src, hide) {
    const k = hide ? 'h' + hide.id : 'n';
    let arr = src.pos[k];
    if (arr) return arr;
    const e = src.e;
    if (src.mov <= 0) arr = [{ x: e.x, y: e.y }];
    else {
      const sig = tm.posCache ? walkSig(e, src.mov, hide) : null;
      arr = sig ? tm.posCache.get(sig) : null;
      if (!arr) {
        const list = [{ x: e.x, y: e.y }];
        const walk = function () { G().reachable(e, src.mov).forEach(function (p) { list.push({ x: p.x, y: p.y }); }); };
        if (hide) at(hide, OFF, walk); else walk();
        arr = list;
        if (sig) tm.posCache.set(sig, arr);
      }
    }
    return (src.pos[k] = arr);
  }
  function losCached(tm, a, b) {
    const w = S().grid.w;
    const k = (a.y * w + a.x) * 65536 + (b.y * w + b.x);
    let v = tm.los.get(k);
    if (v === undefined) { v = G().los(a, b); tm.los.set(k, v); }
    return v;
  }
  /** Can skill sk hit tile X from one of the positions (not X itself when a unit will stand there)? */
  function canHitFrom(tm, sk, positions, X, hide) {
    for (let i = 0; i < positions.length; i++) {
      const P = positions[i];
      if (hide && P.x === X.x && P.y === X.y) continue;
      const d = Math.abs(P.x - X.x) + Math.abs(P.y - X.y);
      if (sk.single) {
        if (d < sk.r0 || d > sk.r1) continue;
        if (sk.straight && P.x !== X.x && P.y !== X.y) continue;
        if (sk.los && d > 1 && !losCached(tm, P, X)) continue;
        return true;
      }
      if (d <= sk.reach && d >= sk.rmin) return true;
    }
    return false;
  }
  /** The best skill with which the source can hit tile pos (memoized per threat model), or null. */
  function hitSkill(tm, src, pos, hide, objOnly) {
    if (dist(src.e, pos) > src.mov + src.maxReach + 1) return null;
    const mk = (objOnly ? 'o' : '') + (hide ? hide.id : '') + '|' + pos.x + ',' + pos.y;
    let sk = src.memo.get(mk);
    if (sk !== undefined) return sk;
    sk = null;
    const positions = srcPositions(tm, src, hide);
    for (let i = 0; i < src.skills.length && !sk; i++) {
      const k = src.skills[i];
      if (objOnly ? !k.obj : !k.units) continue;
      if (canHitFrom(tm, k, positions, pos, hide)) sk = k;
    }
    src.memo.set(mk, sk);
    return sk;
  }
  /** Expected damage of the source's best hit on u standing on pos (after u's armor, Vulnerable, Marked...), or 0. */
  function hitOn(tm, src, u, pos, hide) {
    const sk = hitSkill(tm, src, pos, hide, false);
    if (!sk) return 0;
    const est = pos.x === u.x && pos.y === u.y ? DD.AI.estimate(src.e, u, sk.base, sk.el) : at(u, pos, function () { return DD.AI.estimate(src.e, u, sk.base, sk.el); });
    return Math.max(0, est + (est > 0 ? sk.flat : 0));
  }
  /** How attractive u is to an AI attacker (like its planner: a kill first, then the wounded, then the most damage). */
  function targetScore(u, est, hp) {
    let sc = est + 3 * (1 - hp / Math.max(1, u.maxHp || 1));
    if (est >= hp + (u.block || 0)) sc += 12 + (u.kind === 'hero' ? 6 : 0);
    return sc;
  }
  function attackReach(tm, a) {
    let r = tm.ar[a.id];
    if (r === undefined) {
      let best = 0;
      DD.Combat.slotsOf(a).forEach(function (sl) {
        const def = DD.getSkill(sl.id);
        const L = def && DD.skillLevel(def, sl.level || 1);
        if (L && L.dmg > best && !(a.signature && sl === a.signature)) best = L.dmg;
      });
      r = tm.ar[a.id] = { range: attackRange(a)[1], dmg: best };
    }
    return r;
  }
  /**
   * sigma of an enemy turn at seq q: every ally acting before it (not the actor) that could walk up and hit it may kill
   * or disable it first: ×(1 − ALLY_FIRST × its odds), odds = twice its best hit against the enemy's HP + Block.
   */
  function sigmaFor(tm, e, q) {
    if (!tm.plan.known) return 1;
    let sg = 1;
    for (let i = 0; i < tm.party.length; i++) {
      const a = tm.party[i];
      if (a.id === tm.actorId || DD.Combat.isStunned(a) || nextOf(tm.plan, a) >= q) continue;
      const ar = attackReach(tm, a);
      if (!(ar.dmg > 0) || dist(a, e) > DD.Combat.effectiveMov(a) + ar.range) continue;
      sg *= 1 - ALLY_FIRST * Math.min(1, 2 * ar.dmg / Math.max(1, (e.hp || 0) + (e.block || 0)));
    }
    return Math.max(SIGMA_MIN, sg);
  }

  /**
   * Danger in the current state (the real one, or a dry run's copy): { plan, srcs (AI enemies with their turns, ready
   * skills, victims and target weights), wind (wind-up hits per tile), tracked (tracked wind-ups), auras, ... }.
   * ctx (a decision of ctx.unit) shares its turn plan and walk cache; actorUnit: whose perspective (default the current).
   */
  function threatModel(ctx, actorUnit) {
    const s = S();
    const actor = ctx ? ctx.unit : actorUnit || DD.Combat.current();
    const tm = {
      plan: (ctx && ctx.plan) || turnPlan(), actorId: actor ? actor.id : null, srcs: [], bySrc: {}, wind: {}, tracked: [],
      auras: [], caution: caution(), los: new Map(), posCache: ctx ? ctx.posCache : null, ar: ctx ? ctx.ar : {}, party: [], objs: [],
    };
    for (let i = 0; i < s.units.length; i++) if (active(s.units[i]) && s.units[i].side === 'hero') tm.party.push(s.units[i]);
    const ob = s.objective;
    if (ob && ob.type === 'protect' && ob.objId) {
      for (let i = 0; i < s.grid.tiles.length; i++) {
        const tl = s.grid.tiles[i];
        if (tl.obj && tl.obj.id === ob.objId && tl.obj.hp > 0) tm.objs.push({ x: tl.x, y: tl.y, hp: tl.obj.hp, k: key(tl.x, tl.y) });
      }
    }
    for (let i = 0; i < s.units.length; i++) {
      const e = s.units[i];
      if (!active(e)) continue;
      if (e.side === 'enemy' && DD.Hooks.has('threatAt', e)) tm.auras.push(e);
      if (DD.Combat.isPlayerControlled(e) || G().effectiveSide(e) !== 'enemy') continue;
      const seqs = seqsOf(tm.plan, e);
      if (e.intents && e.intents.length) addWindups(tm, e, seqs);
      const lost = incapacitated(e);   // it loses its next turn
      const entries = [];
      for (let k = lost ? 1 : 0; k < seqs.length; k++) entries.push({ q: seqs[k], sig: sigmaFor(tm, e, seqs[k]) });
      if (!entries.length) continue;
      const skills = readySkills(e);
      if (!skills.length) continue;
      let maxReach = 0;
      for (let k = 0; k < skills.length; k++) maxReach = Math.max(maxReach, skills[k].single ? skills[k].r1 : skills[k].reach);
      const taunt = DD.AI.taunter ? DD.AI.taunter(e) : null;
      const src = {
        e: e, entries: entries, skills: skills, maxReach: Math.min(maxReach, 99), mov: DD.Combat.cantMove(e) ? 0 : DD.Combat.effectiveMov(e),
        only: taunt ? taunt.id : null, fuzzy: has(e, 'dazzled') || has(e, 'confused') ? 0.6 : 1, m: hitsPerTurn(e),
        ride: skills.reduce(function (m, k) { return Math.max(m, k.ride); }, 1), pos: {}, memo: new Map(), victims: {}, Z: 0, n: 0, objV: null, threat: 0,
      };
      // whom it could hit from where everybody stands now: its pick is shared among them by attractiveness
      for (let k = 0; k < tm.party.length; k++) {
        const u = tm.party[k];
        if (has(u, 'stealth') || (u.flags && u.flags.untargetable) || (src.only && src.only !== u.id)) continue;
        const est = hitOn(tm, src, u, u, null);
        if (!(est > 0)) continue;
        const w = Math.exp((targetScore(u, est, u.hp || 0) - TARGET_REF) / TARGET_T);
        src.victims[u.id] = { w: w, est: est, u: u };
        src.Z += w; src.n++;
      }
      // protect objectives: the AI goes for the protected object with skills that can hurt objects
      if (tm.objs.length && !src.only) {
        for (let k = 0; k < tm.objs.length; k++) {
          const o = tm.objs[k];
          const sk = hitSkill(tm, src, o, null, true);
          if (!sk) continue;
          const est = sk.raw;
          const w = Math.exp((est + 8 + (est >= o.hp ? 20 : 0) - TARGET_REF) / TARGET_T);
          if (!src.objV || w > src.objV.w) src.objV = { w: w, est: est, o: o };
        }
        if (src.objV) { src.Z += src.objV.w; src.n++; }
      }
      // what it is expected to deal before the owner's next turn (the value of stopping it, for the quick pass)
      for (const id in src.victims) {
        const v = src.victims[id];
        const P = (1 - TARGET_MIX) * v.w / src.Z + TARGET_MIX / src.n;
        for (let k = 0; k < entries.length; k++) src.threat += P * v.est * entries[k].sig * urgency(tm, v.u, entries[k].q, v.u.id === tm.actorId);
      }
      src.threat *= src.fuzzy * tm.caution * src.m;
      tm.srcs.push(src);
      tm.bySrc[e.id] = src;
    }
    return tm;
  }

  /**
   * An AI unit's wind-ups: each lands at the start of its turn number turnsLeft in the plan (later than the horizon: a
   * quarter). Fixed / self-anchored ones per tile, tracked ones (anchor 'unit') per target.
   */
  function addWindups(tm, e, seqs) {
    const off = incapacitated(e) || has(e, 'charmed');
    const fuzzy = has(e, 'dazzled') || has(e, 'confused') ? 0.5 : 1;
    for (let k = 0; k < e.intents.length; k++) {
      const it = e.intents[k];
      const sure = !!(it.data && it.data.unstoppable);
      if (off && !sure) continue;
      const def = DD.getSkill(it.skillId);
      if (!sure && def && def.kind === 'spell' && has(e, 'silenced')) continue;
      const left = Math.max(1, Math.round(it.turnsLeft !== undefined && it.turnsLeft !== null ? it.turnsLeft : it.delay || 1) || 1);
      const lands = seqs.length >= left;
      const hit = {
        e: e, raw: Math.max(1, num(DD.AI.intentDmg(e, it))), el: def ? elementOf(def) : null, q: lands ? seqs[left - 1] : tm.plan.L,
        p: (lands ? 1 : 0.25) * (sure ? 1 : fuzzy), ride: lands ? riderCost(def) * (sure ? 1 : fuzzy) : 0,
      };
      if (it.anchor === 'unit') {
        const tr = { e: e, it: it, def: def, hit: hit, tiles: [], live: false };
        const t = DD.Combat.byId(it.unitId);
        if (def && active(t)) { tr.live = reaches(tr, t, t); if (tr.live) tr.tiles = DD.AI.intentTiles(e, it); }
        tm.tracked.push(tr);
        continue;
      }
      const tiles = DD.AI.intentTiles(e, it);
      for (let j = 0; j < tiles.length; j++) {
        const kk = key(tiles[j].x, tiles[j].y);
        (tm.wind[kk] || (tm.wind[kk] = [])).push(hit);
      }
    }
  }

  /** Would a tracked shot still find u standing on pos: range, line of sight, a straight line if asked, not stealthed. */
  function reaches(tr, u, pos) {
    if (!tr.def) return false;
    if (has(u, 'stealth') && G().hostile(tr.e, u)) return false;
    const rg = DD.Targeting.range(tr.e, tr.def, tr.it.level || 1);
    const d = Math.abs(tr.e.x - pos.x) + Math.abs(tr.e.y - pos.y);
    if (d < rg[0] || d > rg[1]) return false;
    const tg = tr.def.target || {};
    if (tg.straight && pos.x !== tr.e.x && pos.y !== tr.e.y) return false;
    return tg.los === false || d === 0 || G().los(tr.e, pos);
  }

  /** An enemy's non-telegraphed threat to u on tile (hooks.threatAt): { dmg, pierce }; throws and junk count as 0. */
  function aura(e, u, tile) {
    const r = DD.Hooks.fire('threatAt', e, e, u, { x: tile.x, y: tile.y });
    if (typeof r === 'number') return { dmg: r > 0 && isFinite(r) ? r : 0, pierce: false };
    if (r && typeof r === 'object') { const d = num(+r.dmg); return { dmg: d > 0 ? d : 0, pierce: !!(r.ignoreBlock || r.pierce) }; }
    return { dmg: 0, pierce: false };
  }

  function windHit(tm, out, u, w, asActor) {
    const d = defend(u, w.raw, w.el);
    const p = Math.min(1, w.p * urgency(tm, u, w.q, asActor));
    if (d > 0 && p > 0) out.hits.push({ p: p, d: d, ride: w.ride });
  }
  /**
   * What could hit u standing on pos before the horizon: { hits: [{ p, d, ride }] (independent chances), flat (certain,
   * Block helps), pierce (certain, it does not), aura }. asActor: u is deciding now (every enemy turn counts in full);
   * else u's own next turn decides (urgency). hp: u's HP for the enemies' target choice (a revive's HP).
   */
  function exposure(tm, u, pos, asActor, hp) {
    const out = { hits: [], flat: 0, pierce: 0, aura: 0 };
    const k = key(pos.x, pos.y);
    const home = pos.x === u.x && pos.y === u.y;
    if (hp === undefined) hp = u.hp || 0;
    const wl = tm.wind[k];
    if (wl) for (let i = 0; i < wl.length; i++) windHit(tm, out, u, wl[i], asActor);
    for (let i = 0; i < tm.tracked.length; i++) {
      const tr = tm.tracked[i];
      if (tr.it.unitId === u.id) { if (reaches(tr, u, pos)) windHit(tm, out, u, tr.hit, asActor); }
      else if (tr.live && home) {
        // the splash of a shot tracking somebody else (where everybody stands now)
        for (let j = 0; j < tr.tiles.length; j++) if (tr.tiles[j].x === pos.x && tr.tiles[j].y === pos.y) { windHit(tm, out, u, tr.hit, asActor); break; }
      }
    }
    if (u.side === 'hero' && !has(u, 'stealth') && !(u.flags && u.flags.untargetable)) {
      const hide = home ? null : u;
      for (let i = 0; i < tm.srcs.length; i++) {
        const src = tm.srcs[i];
        if (src.only && src.only !== u.id) continue;
        const d = hitOn(tm, src, u, pos, hide);
        if (!(d > 0)) continue;
        const w = Math.exp((targetScore(u, d, hp) - TARGET_REF) / TARGET_T);
        const mine = src.victims[u.id];
        const Z = src.Z - (mine ? mine.w : 0) + w, n = src.n - (mine ? 1 : 0) + 1;
        const P = (1 - TARGET_MIX) * w / Z + TARGET_MIX / n;
        for (let j = 0; j < src.entries.length; j++) {
          const en = src.entries[j];
          const p = Math.min(1, P * en.sig * urgency(tm, u, en.q, asActor) * src.fuzzy * tm.caution);
          if (p <= 0.003) continue;
          // an enemy seen hitting more than once a turn: that many chances (the last one partial)
          for (let r = src.m; r > 0.05; r -= 1) out.hits.push({ p: p * Math.min(1, r), d: d, ride: src.ride });
        }
      }
    }
    for (let i = 0; i < tm.auras.length; i++) {
      const e = tm.auras[i];
      const a = aura(e, u, pos);
      if (!(a.dmg > 0)) continue;
      const sq = seqsOf(tm.plan, e);
      const v = a.dmg * urgency(tm, u, sq.length ? sq[0] : tm.plan.L, asActor);
      out.aura += v;
      if (a.pierce) out.pierce += v; else out.flat += v;
    }
    // ending the turn on a hazard (lava 8, fire / poison puddles 1 + their status); entering one is a walking cost
    const hz = G().hazardDamage(pos.x, pos.y, u);
    if (hz && hz.end > 0) out.flat += (hz.end + 2) * (asActor ? 1 : respond(u));
    out.flat += stacksOf(u, 'burn');
    out.pierce += stacksOf(u, 'poison');
    return out;
  }

  const dpBuf = new Float64Array(DP_CAP + 2);
  /**
   * Odds of the HP lost from independent hits [{ p, d }] plus certain damage (flat: Block helps; pierce: it does not):
   * { exp (expected HP lost, capped by hp), down (chance it reaches hp) }. Exact: a table over the damage taken.
   */
  function lossOf(hits, flat, pierce, block, hp) {
    if (!(hp > 0)) return { exp: 0, down: 0 };
    const cap = Math.min(DP_CAP, Math.max(0, Math.ceil(hp + block - flat - pierce)));
    const f = dpBuf;
    for (let i = 0; i <= cap; i++) f[i] = 0;
    f[0] = 1;
    let top = 0;
    for (let k = 0; k < hits.length; k++) {
      const h = hits[k];
      const d = Math.max(0, Math.round(h.d)), p = h.p;
      if (!(p > 0) || d <= 0) continue;
      for (let i = Math.min(top, cap); i >= 0; i--) {
        const v = f[i];
        if (!v) continue;
        f[i] = v * (1 - p);
        const t = Math.min(cap, i + d);
        f[t] += v * p;
      }
      top = Math.min(cap, top + d);
    }
    let exp = 0, down = 0;
    for (let i = 0; i <= Math.min(top, cap); i++) {
      const pr = f[i];
      if (!pr) continue;
      if (i >= cap) { exp += pr * hp; down += pr; continue; }
      const eff = Math.max(0, flat + i - block) + pierce;
      exp += pr * Math.min(eff, hp);
      if (eff >= hp && eff > 0) down += pr;
    }
    return { exp: exp, down: down };
  }

  /** A hero going down costs a lot (more on a third down, much more for the last one standing); summons less. */
  function downCost(u) {
    const s = S();
    const ob = s.objective;
    if (ob && ob.type === 'protect' && ob.unitId && ob.unitId === u.id) return 150;
    if (u.kind !== 'hero') return 3 + 0.1 * (u.maxHp || 0);
    let c = DOWN_COST;
    if (u.runHero && (u.runHero.downs || 0) >= 2) c += 25;
    let up = 0;
    for (let i = 0; i < s.units.length; i++) if (s.units[i].kind === 'hero' && active(s.units[i])) up++;
    if (up <= 1) c += 60;
    return c;
  }

  /**
   * Danger cost of u given its exposure: the riders of the hits (Block does not stop them), the HP it is expected to lose
   * (heroes ×HURT, summons ×0.8) and the odds of going down × its down cost.
   */
  function costOf(u, ex, hp) {
    if (has(u, 'invulnerable')) return 0;
    const hero = u.kind === 'hero';
    let ride = 0;
    for (let i = 0; i < ex.hits.length; i++) ride += ex.hits[i].p * (ex.hits[i].ride || 0);
    ride *= hero ? 1 : 0.5;
    const L = lossOf(ex.hits, ex.flat, ex.pierce, u.block || 0, hp !== undefined ? hp : u.hp || 0);
    if (L.exp <= 0 && L.down <= 0) return ride;
    return ride + (hero ? HURT : 0.8) * L.exp + L.down * downCost(u);
  }
  function costAt(tm, u, asActor) { return costOf(u, exposure(tm, u, u, asActor)); }

  /**
   * Danger of everybody but the actor in the current state (each by its own turn order), + protected objects (wind-ups
   * on them and the enemies going for them, 2.5 per HP and 120 × the odds of losing them). The actor's own share is
   * valued separately (see endValue).
   */
  function othersCost(tm, actorId) {
    let sum = 0;
    for (let i = 0; i < tm.party.length; i++) {
      const u = tm.party[i];
      if (u.id === actorId) continue;
      sum += costAt(tm, u, false);
    }
    for (let i = 0; i < tm.objs.length; i++) {
      const o = tm.objs[i];
      const hits = [];
      const wl = tm.wind[o.k];
      if (wl) for (let j = 0; j < wl.length; j++) hits.push({ p: wl[j].p, d: wl[j].raw });
      for (let j = 0; j < tm.srcs.length; j++) {
        const src = tm.srcs[j];
        if (!src.objV || src.objV.o.k !== o.k) continue;
        const P = (1 - TARGET_MIX) * src.objV.w / src.Z + TARGET_MIX / src.n;
        for (let k = 0; k < src.entries.length; k++) {
          const p = Math.min(1, P * src.entries[k].sig * src.fuzzy * tm.caution);
          for (let r = src.m; r > 0.05; r -= 1) hits.push({ p: p * Math.min(1, r), d: src.objV.est });
        }
      }
      if (!hits.length) continue;
      const L = lossOf(hits, 0, 0, 0, o.hp);
      sum += L.exp * 2.5 + L.down * 120;
    }
    return sum;
  }
  /** Expected damage an AI enemy deals before the horizon (stopping it is worth that), from a threat model. */
  function threatOf(tm, e) { const src = tm && tm.bySrc[e.id]; return src ? src.threat : 0; }

  // ---- objectives & puzzle hints ------------------------------------------------------------------------------------
  function objectiveObj(id) { const ob = S().objective; return !!ob && ob.type === 'destroy' && (!ob.objId || ob.objId === id); }
  function protectedObj(id) { const ob = S().objective; return !!ob && ob.type === 'protect' && ob.objId === id; }
  function objectiveTiles() {
    const out = [];
    S().grid.tiles.forEach(function (tl) { if (tl.obj && objectiveObj(tl.obj.id) && tl.obj.hp > 0) out.push({ x: tl.x, y: tl.y }); });
    return out;
  }
  function hintOf(obj, unit, tl) {
    if (!obj) return 0;
    const def = DD.getObject(obj.id) || {};
    const srcs = [obj, obj.interact, def, def.interact];
    let h;
    for (let i = 0; i < srcs.length && h === undefined; i++) if (srcs[i] && srcs[i].autoplay !== undefined) h = srcs[i].autoplay;
    if (typeof h === 'function') h = DD.safe('AutoPlay hint ' + obj.id, h, null, [unit, obj, tl, S()]);
    return typeof h === 'number' && isFinite(h) ? h : 0;
  }
  function hintAt(unit, x, y) { const tl = G().tile(x, y); return tl && tl.obj ? hintOf(tl.obj, unit, tl) : 0; }
  function hintedTiles(unit, min) {
    const out = [];
    S().grid.tiles.forEach(function (tl) { if (tl.obj && hintOf(tl.obj, unit, tl) >= min) out.push({ x: tl.x, y: tl.y }); });
    return out;
  }
  /** Value of damaging an object: destroy-objective targets and hinted objects (0 for anything else). */
  function objectValue(unit, tl, dmg, destroyed) {
    if (!tl || !tl.obj) return 0;
    if (objectiveObj(tl.obj.id)) return dmg + (destroyed ? 15 : 0);
    const v = hintOf(tl.obj, unit, tl);
    return v > 0 ? dmg * 0.5 + (destroyed ? v : 0) : 0;
  }

  // ---- helpers ---------------------------------------------------------------------------------------------------
  /** Run fn with the unit virtually standing on pos (always restored). */
  function at(unit, pos, fn) {
    const ox = unit.x, oy = unit.y;
    unit.x = pos.x; unit.y = pos.y;
    try { return fn(); } finally { unit.x = ox; unit.y = oy; }
  }

  /**
   * [integration fix, enemies-act3 request — docs/notes/content-digest.md] Cost of the hazards entered on the way to pos,
   * the destination included (lava 8, spikes 5, a fire / poison puddle's status ~2), weighted like HP, so AutoPlay never
   * walks across (or into) lava to save a step. Ending the turn on one is priced by the danger model.
   */
  function walkCost(unit, pos) {
    const dmg = walkDamage(unit, pos);
    if (!dmg) return 0;
    return dmg * (unit.kind === 'hero' ? HURT : 0.8) + (dmg >= (unit.hp || 0) ? downCost(unit) : 0);
  }
  function walkDamage(unit, pos) {
    const path = pos.path || [];
    let dmg = 0;
    for (let i = 0; i < path.length; i++) {
      const hz = G().hazardDamage(path[i].x, path[i].y, unit);
      if (hz) dmg += Math.max(hz.enter, 2);
    }
    return dmg;
  }

  function hookCtx(unit, ref, target) { return DD.Targeting.buildCtx(unit, ref, target); }
  function hookScore(def, ctx, exact) {
    let v = 0;
    if (typeof def.aiScore === 'function') v += num(+DD.safe('aiScore of ' + def.id, def.aiScore, def, [ctx])) * (exact ? 0.75 : 1);
    if (typeof def.autoplayValue === 'function') v += num(+DD.safe('autoplayValue of ' + def.id, def.autoplayValue, def, [ctx]));
    return v;
  }
  function hasHooks(def) { return typeof def.aiScore === 'function' || typeof def.autoplayValue === 'function'; }

  /** The unit's usable slots ignoring targets (they depend on the tile): [{ slot, def, L, ap, cd, util, sig }]. */
  function usableSlots(unit) {
    const out = [];
    DD.Combat.slotsOf(unit).forEach(function (sl) {
      const why = DD.Combat.canUse(unit, sl);
      if (why !== true && !(typeof why === 'string' && /target/i.test(why))) return;
      const def = DD.getSkill(sl.id);
      if (!def) return;
      const L = DD.skillLevel(def, sl.level || 1) || {};
      out.push({
        slot: sl, def: def, L: L, ap: DD.Combat.costOf(unit, def, sl.level).ap,
        cd: DD.Combat.cooldownOf(unit, def, sl.level) > 0 || def.charges > 0,
        util: !(L.dmg > 0 || L.heal > 0), sig: !!unit.signature && sl === unit.signature,
      });
    });
    return out;
  }

  function targetsFrom(unit, slot) {
    let list = DD.Targeting.validTargets(unit, slot);
    if (list.length > 14) {
      const units = DD.Combat.active();
      list = list.map(function (p) {
        let near = 99;
        units.forEach(function (o) { near = Math.min(near, Math.abs(o.x - p.x) + Math.abs(o.y - p.y)); });
        return { p: p, near: near };
      }).sort(function (a, b) { return a.near - b.near; }).slice(0, 14).map(function (e) { return e.p; });
    }
    return list;
  }

  /**
   * Cheap estimate of a (skill, target) from where the unit stands: { q, base } (base: no kill / objective bonus). v2: a
   * kill or a stun is also worth the damage that enemy would deal before the owner's next turn (threatOf).
   */
  function quickScore(ctx, sk, target) {
    const unit = ctx.unit, def = sk.def, L = sk.L;
    const lvl = sk.slot.level || 1;
    const tiles = DD.Targeting.area(unit, def, lvl, target);
    const dmg = L.dmg > 0 ? L.dmg : 0;
    const heal = L.heal > 0 ? L.heal : 0;
    const tags = def.tags || [];
    const pushy = tags.indexOf('push') >= 0 || tags.indexOf('pull') >= 0 || L.push || L.pull;
    const stunny = tags.indexOf('stun') >= 0 || L.stun;
    let sc = 0, bonus = 0;
    const seen = {};
    for (let i = 0; i < tiles.length; i++) {
      const p = tiles[i];
      const tl = dmg ? G().tile(p.x, p.y) : null;
      if (tl && tl.obj && tl.obj.hp > 0) bonus += objectValue(unit, tl, Math.min(dmg, tl.obj.hp), dmg >= tl.obj.hp);
      const o = G().unitAt(p.x, p.y);
      if (!o || seen[o.id]) continue;
      // [core fix, hero-josiah] revive skills (target filter 'downedAlly', e.g. Smelling Salts): value like a big heal
      if (o.downed && !o.dead && def.target && def.target.filter === 'downedAlly' && !G().hostile(unit, o)) { seen[o.id] = 1; sc += 20; continue; }
      if (!active(o)) continue;
      seen[o.id] = 1;
      if (G().hostile(unit, o)) {
        const thr = threatOf(ctx.tm0, o);
        if (dmg) {
          const est = DD.AI.estimate(unit, o, dmg, null);
          sc += est + (1 - o.hp / Math.max(1, o.maxHp)) * 4;
          if (est >= o.hp + (o.block || 0)) bonus += 15 + thr;
        } else sc += 3;
        if (pushy && G().isEdge(o.x, o.y)) sc += 10;
        // v2: a stun costs a foe its whole next turn (more when it is winding something up)
        if (stunny && !incapacitated(o)) sc += 2 + thr + (o.intents && o.intents.length ? 4 : 0);
      } else {
        if (dmg && o !== unit) sc -= DD.AI.estimate(unit, o, dmg, null) * 1.5;
        if (heal) { const miss = o.maxHp - o.hp; sc += Math.min(heal, miss) * (miss > o.maxHp * 0.5 ? 1.5 : 0.8); }
        if (def.kind === 'buff') sc += 3;
      }
    }
    if (def.kind === 'summon' || tags.indexOf('summon') >= 0) sc += 8;
    if (hasHooks(def)) sc += hookScore(def, hookCtx(unit, sk.slot, target), false);
    return { q: sc + bonus, base: sc };
  }

  /** The n targets whose area covers the most foes, then units (stable: earlier targets win ties). [core fix, kit] */
  function busiestTargets(unit, def, targets, n) {
    return targets.map(function (p, i) {
      let foes = 0, units = 0;
      DD.Targeting.area(unit, def, 1, p).forEach(function (q) {
        const o = G().unitAt(q.x, q.y);
        if (!active(o)) return;
        units++;
        if (G().hostile(unit, o)) foes++;
      });
      return { p: p, v: foes * 100 + units * 10, i: i };
    }).sort(function (a, b) { return b.v - a.v || a.i - b.i; }).slice(0, n).map(function (e) { return e.p; });
  }

  // ---- decision context ------------------------------------------------------------------------------------------
  function makeCtx(unit) {
    const s = S();
    const ap = unit.ap || 0;
    const moveCost = DD.Combat.moveApCost(unit);
    const here = { x: unit.x, y: unit.y, cost: 0, path: [], moving: false };
    const positions = [here];
    if (!DD.Combat.cantMove(unit)) DD.Combat.reachable(unit).forEach(function (e) { positions.push({ x: e.x, y: e.y, cost: e.cost, path: e.path, moving: true }); });
    const ctx = {
      unit: unit, ap: ap, moveCost: moveCost, here: here, positions: positions, inc: {}, fp: {}, walkBest: 0,
      canWalk: positions.length > 1, slots: usableSlots(unit), nextHit: {}, aoeReady: null, esc: {},
      mov: DD.Combat.effectiveMov(unit), plan: turnPlan(), posCache: new Map(), ar: {}, dud: {},
    };
    ctx.tm0 = threatModel(ctx);
    ctx.others0 = othersCost(ctx.tm0, unit.id);
    ctx.my0 = myCost(ctx, here, ap);
    ctx.consCost = consumableCost(s, ctx.tm0, unit);
    return ctx;
  }

  /**
   * The actor's end-of-turn value on pos with apLeft AP: the better of staying there (leftover AP potential minus the
   * danger of ending the turn there; stay = that danger when a dry run already knows it) and acting with all but a move
   * then stepping to the safest tile within reach (hit and run: poke out from behind a pillar, then back into cover).
   */
  function endValue(ctx, pos, apLeft, used, stay) {
    let v = fpAt(ctx, pos, apLeft, used) - (stay !== undefined ? stay : myCost(ctx, pos, apLeft));
    if (ctx.canWalk && apLeft >= ctx.moveCost) {
      const a = apLeft - ctx.moveCost;
      const esc = escapeCost(ctx, pos, a);
      if (esc !== null) v = Math.max(v, fpAt(ctx, pos, a, used) - esc - 0.5);
    }
    return v;
  }
  /** Danger of the safest tile one move away from pos (a real walk: walls, heights, foes in the way), keeping apAfter. */
  function escapeCost(ctx, pos, apAfter) {
    const k = pos.x + ',' + pos.y + ':' + apAfter;
    if (ctx.esc[k] !== undefined) return ctx.esc[k];
    let best = null;
    const tiles = walkFrom(ctx, pos);
    for (let i = 0; i < tiles.length; i++) {
      const c = myCost(ctx, tiles[i], apAfter);
      if (best === null || c < best) best = c;
      if (best === 0) break;
    }
    return (ctx.esc[k] = best);
  }
  /** The actor's passability for this decision: walkable, terrain cost, height, who stands where (its own tile free). */
  function walkGrid(ctx) {
    if (ctx.wg) return ctx.wg;
    const s = S(), g = s.grid, n = g.w * g.h, unit = ctx.unit;
    const wg = { w: g.w, h: g.h, walk: new Uint8Array(n), cost: new Uint8Array(n), hgt: new Int16Array(n), occ: new Uint8Array(n),
      fly: !!(unit.flags && unit.flags.flying), up: unit.flags && unit.flags.hop ? 2 : 1, memo: {} };
    for (let i = 0; i < n; i++) {
      const t = g.tiles[i];
      if (!t) continue;
      wg.walk[i] = G().isWalkable(t.x, t.y, unit) ? 1 : 0;
      wg.cost[i] = wg.fly ? 1 : Math.max(1, Math.min(9, G().terrain(t).cost || 1));
      wg.hgt[i] = t.h || 0;
    }
    for (let i = 0; i < s.units.length; i++) {
      const u = s.units[i];
      if (u.dead || u === unit || u.x < 0 || u.y < 0 || u.x >= g.w || u.y >= g.h) continue;
      wg.occ[u.y * g.w + u.x] = G().hostile(unit, u) ? 2 : 1;
    }
    return (ctx.wg = wg);
  }
  /** Free tiles the actor could walk to with one move from pos (Dijkstra over walkGrid, like DD.Grid.reachable). */
  function walkFrom(ctx, pos) {
    const wg = walkGrid(ctx), k = pos.x + ',' + pos.y;
    if (wg.memo[k]) return wg.memo[k];
    const out = [];
    const mov = ctx.mov, w = wg.w;
    const start = pos.y * w + pos.x;
    const best = new Map([[start, 0]]), queue = [start];
    // label-correcting search (a handful of tiles): a tile is re-queued when a cheaper way to it turns up
    for (let q = 0; q < queue.length; q++) {
      const i = queue[q], c = best.get(i), x = i % w, y = (i / w) | 0;
      for (let d = 0; d < 4; d++) {
        const nx = x + U.DIRS[d].x, ny = y + U.DIRS[d].y;
        if (nx < 0 || ny < 0 || nx >= w || ny >= wg.h) continue;
        const j = ny * w + nx;
        if (!wg.walk[j] || wg.occ[j] === 2) continue;
        const climb = wg.hgt[j] - wg.hgt[i];
        if (!wg.fly && climb > wg.up) continue;
        const nc = c + (wg.fly ? 1 : wg.cost[j] + Math.max(0, climb));
        if (nc > mov) continue;
        const old = best.get(j);
        if (old !== undefined && old <= nc) continue;
        best.set(j, nc);
        queue.push(j);
      }
    }
    best.forEach(function (c, i) { if (i !== start && !wg.occ[i]) out.push({ x: i % w, y: (i / w) | 0 }); });
    return (wg.memo[k] = out);
  }

  /**
   * What using up a consumable costs: they are saved for when they matter — cheap in boss fights and emergencies (a hero
   * likely to go down), dearer in elite fights, dear in ordinary ones; cheaper when the bag is full anyway.
   */
  function consumableCost(s, tm, unit) {
    let c = 8;
    const foes = DD.Combat.enemies();
    if (foes.some(isBoss) || s.kind === 'boss') c = 3;
    else if (s.kind === 'elite' || foes.some(function (f) { return f.tier === 'elite'; })) c = 5;
    if (c > 4) {
      const sos = tm.party.some(function (u) {
        if (u.kind !== 'hero') return false;
        const ex = exposure(tm, u, u, u.id === unit.id);
        return lossOf(ex.hits, ex.flat, ex.pierce, u.block || 0, u.hp || 0).down >= 0.4;
      });
      if (sos) c = 4;
    }
    const max = s.maxConsumables || (s.run && s.run.maxConsumables) || 3;
    if (DD.Combat.consumables().length >= max) c *= 0.6;
    return c;
  }

  /** The actor's own danger cost on pos (cached per tile; v2: leftover AP does not help, no Guard). */
  function myCost(ctx, pos) {
    const k = key(pos.x, pos.y);
    let c = ctx.inc[k];
    if (c === undefined) c = ctx.inc[k] = costOf(ctx.unit, exposure(ctx.tm0, ctx.unit, pos, true));
    return c;
  }
  /** Leftover-AP potential on pos: what the AP can still do there (or after one more move). */
  function fpAt(ctx, pos, apLeft, used, noLazy) {
    if (apLeft <= 0) return 0;
    const k = key(pos.x, pos.y);
    let row = ctx.fp[k];
    if (row === undefined) row = noLazy ? [] : (ctx.fp[k] = fpRow(ctx, pos));
    let best = 0;
    for (let i = 0; i < row.length; i++) {
      const r = row[i];
      if (r.ap > apLeft || (used && r.id === used.id && r.cd) || ctx.dud[r.id]) continue;
      if (r.perAP > best) best = r.perAP;
    }
    let v = apLeft * best;
    if (ctx.canWalk && ctx.walkBest > 0 && apLeft > ctx.moveCost) v = Math.max(v, (apLeft - ctx.moveCost) * ctx.walkBest);
    return FP_RATE * v;
  }
  /** Best quick value per AP of each usable slot from pos (lazy, for tiles the quick pass did not visit). */
  function fpRow(ctx, pos) {
    const unit = ctx.unit, row = [];
    at(unit, pos, function () {
      ctx.slots.forEach(function (sk) {
        if (sk.sig) return;
        let best = 0;
        targetsFrom(unit, sk.slot).forEach(function (t) { const q = quickScore(ctx, sk, t); if (q.base > best) best = q.base; });
        if (best > 0) row.push({ id: sk.slot.id, ap: Math.max(1, sk.ap), cd: sk.cd, perAP: best / Math.max(1, sk.ap) });
      });
    });
    return row;
  }

  /** Best damage number among a unit's skills, signature aside (for Empowered / Inspired). */
  function nextHit(ctx, u) {
    if (ctx.nextHit[u.id] !== undefined) return ctx.nextHit[u.id];
    let best = 0;
    DD.Combat.slotsOf(u).forEach(function (sl) {
      if (u.signature && sl.id === u.signature.id) return;
      const def = DD.getSkill(sl.id);
      const L = def && DD.skillLevel(def, sl.level || 1);
      if (L && L.dmg > best) best = L.dmg;
    });
    return (ctx.nextHit[u.id] = best);
  }
  /** Is there a hero-side unit with AP and a ready area attack (worth pulling foes together for)? */
  function aoeReady(ctx) {
    if (ctx.aoeReady !== null) return ctx.aoeReady;
    ctx.aoeReady = DD.Combat.party().some(function (u) {
      if (!active(u) || (u.ap || 0) <= 0) return false;
      return DD.Combat.slotsOf(u).some(function (sl) {
        const def = DD.getSkill(sl.id);
        if (!def || sl.cd > 0) return false;
        const L = DD.skillLevel(def, sl.level || 1);
        const sh = def.area && def.area.shape;
        return !!(L && L.dmg > 0 && sh && sh !== 'single');
      });
    });
    return ctx.aoeReady;
  }

  // ---- exact evaluation (dry runs) -----------------------------------------------------------------------------------
  /** Expected number of hits coming at u before the horizon (thorns, retaliation buffs). */
  function hitsOn(ctx, u) {
    const ex = exposure(ctx.tm0, u, u, u.id === ctx.unit.id);
    let n = 0;
    for (let i = 0; i < ex.hits.length; i++) n += ex.hits[i].p;
    return n;
  }

  /** Value of a status change on u (n stacks added, or removed) for the actor's side. */
  function statusGain(ctx, actor, ru, su, id, n, removed) {
    const def = DD.getStatus(id);
    if (!def) return 0;
    const foe = G().hostile(actor, ru);
    const debuff = def.type === 'debuff';
    if (removed) {
      if (foe) return debuff ? -1.5 : 2;
      return debuff ? 2.5 : -0.5;
    }
    if (foe) {
      if (!debuff) return -1.5;
      if (STUNLIKE[id] || def.stunLike) return 4 + (isBoss(ru) ? 4 : 0);
      switch (id) {
        case 'charmed': return 5;
        case 'burn': case 'poison': return Math.min(n, 8) * 1.5;
        case 'bleed': return Math.min(n, 8);
        case 'vulnerable': return 3;
        case 'marked': return 1 + Math.min(n, 5);
        case 'weak': case 'root': return 2;
        case 'silenced': case 'dazzled': case 'confused': return 1.5;
        case 'taunt': case 'slow': return 1;
        default: return 1.5 + Math.min(n, 4) * 0.5;
      }
    }
    if (debuff) return -2 * Math.min(n, 3);
    switch (id) {
      case 'empowered': return 0.5 * nextHit(ctx, su);
      case 'inspired': return 0.25 * nextHit(ctx, su) * Math.max(1, Math.min(3, su.ap || 0));
      case 'haste': return 2.5;
      case 'regen': return Math.min(n * 2, Math.max(0, (ru.maxHp || 0) - (ru.hp || 0))) * 0.6;
      case 'stealth': return 1.5;
      case 'invulnerable': return 1;
      case 'thorns': return Math.min(n, 5) * 0.5 * (1 + hitsOn(ctx, ru));
      default:
        // retaliation / mitigation buffs (Hellish Rebuke...): worth more on whoever is about to be hit
        return 1.5 + (def.hooks && (def.hooks.onTakeDamage || def.hooks.modifyIncomingDamage) ? 2.5 * hitsOn(ctx, ru) : 0);
    }
  }

  function cooldownGain(ru, su, used) {
    const a = DD.Combat.slotsOf(ru), b = DD.Combat.slotsOf(su);
    let g = 0;
    for (let i = 0; i < a.length && i < b.length; i++) {
      if (used && a[i].id === used.id) continue;
      const before = a[i].cd || 0, after = b[i].cd || 0;
      if (after < before) g += (before - after) + (after === 0 ? 1.5 : 0);
      if ((b[i].uses || 0) < (a[i].uses || 0)) g += 2 * ((a[i].uses || 0) - (b[i].uses || 0));
    }
    return g;
  }

  function foePairs(state, actor) {
    const foes = state.units.filter(function (o) { return active(o) && G().hostile(actor, o); });
    let n = 0;
    for (let i = 0; i < foes.length; i++) for (let j = i + 1; j < foes.length; j++) if (Math.abs(foes[i].x - foes[j].x) + Math.abs(foes[i].y - foes[j].y) <= 1) n++;
    return n;
  }

  /**
   * Hazard surfaces the action laid down (a fire trail, brambles, a miasma...): under a foe they hurt (+2), next to foes
   * they deny ground (+0.4 per foe within 2), next to friends they are in the way (−0.5). Capped.
   */
  function surfaceGain(real, sim, actor) {
    const rt = real.grid.tiles, st = sim.grid.tiles;
    let g = 0;
    for (let i = 0; i < st.length && i < rt.length; i++) {
      const b = st[i].surface, a = rt[i].surface;
      if (!b || (a && a.id === b.id)) continue;
      const sd = DD.getSurface(b.id);
      if (!sd || !sd.hazard) continue;
      const x = st[i].x, y = st[i].y;
      for (let k = 0; k < sim.units.length; k++) {
        const o = sim.units[k];
        if (!active(o)) continue;
        const d = Math.abs(o.x - x) + Math.abs(o.y - y);
        if (d > 2) continue;
        if (G().hostile(actor, o)) g += d === 0 ? 2 : 0.4;
        else if (d <= 1 && o.id !== actor.id) g -= 0.5;
      }
    }
    return Math.max(-4, Math.min(6, g));
  }

  /** Gains of a dry run that need both states (units, statuses, AP, cooldowns, summons, Hype, the result). */
  function simGain(ctx, real, sim, actor, su, o, diff) {
    let g = 0, moved = false;
    const realById = {};
    for (let i = 0; i < real.units.length; i++) realById[real.units[i].id] = real.units[i];
    const pu = diff.perUnit;
    for (const id in pu) {
      const e = pu[id], ru = realById[id];
      if (!ru) continue;
      if (G().hostile(actor, ru)) {
        g += e.dmg + e.blocked * 0.5 - e.heal - e.block * 0.5;
        if (e.lethal) g += 15 + Math.min(10, (ru.maxHp || 0) * 0.1) + (isBoss(ru) ? 25 : 0);
        if (e.moved && !e.lethal) {
          moved = true;
          g += 0.5;
          const ta = real.grid.tiles[ru.y * real.grid.w + ru.x], tb = G().tile(e.moved.x, e.moved.y);
          if (ta && tb && (tb.h || 0) < (ta.h || 0)) g += 1.5;
          if (G().isEdge(e.moved.x, e.moved.y)) g += 1;
          const sv = DD.Combat.byId(id);
          if (sv && G().hazardAt(e.moved.x, e.moved.y, sv)) g += 2;
        }
      } else {
        const self = id === actor.id;
        g -= e.dmg * (self ? 0.7 : 1.5) + (e.lethal ? 40 : 0);
        const miss = (ru.maxHp || 0) - (ru.hp || 0);
        g += e.heal * (miss > ru.maxHp * 0.5 ? 1.5 : 0.8) + e.block * 0.1;
      }
    }
    for (let i = 0; i < real.units.length; i++) {
      const ru = real.units[i];
      if (ru.dead) continue;
      const sv = DD.Combat.byId(ru.id);
      if (!sv || sv.dead) continue;
      const before = {};
      for (let k = 0; k < ru.statuses.length; k++) before[ru.statuses[k].id] = ru.statuses[k].stacks || 1;
      const seen = {};
      for (let k = 0; k < sv.statuses.length; k++) {
        const st = sv.statuses[k];
        seen[st.id] = 1;
        const was = before[st.id];
        const n = (st.stacks || 1) - (was || 0);
        if (was === undefined || n > 0) g += statusGain(ctx, actor, ru, sv, st.id, Math.max(1, n), false);
      }
      if (!sv.downed) for (const id in before) if (!seen[id]) g += statusGain(ctx, actor, ru, sv, id, before[id], true);
      if (sv.side !== 'hero' || G().hostile(actor, ru)) continue;
      if (ru.id !== actor.id) {
        // v2: AP given outside the ally's turn is banked for its next turn (apBank), worth a little less
        const dAp = (sv.ap || 0) - (ru.ap || 0), dBank = (sv.apBank || 0) - (ru.apBank || 0);
        if (dAp > 0 && active(sv) && !DD.Combat.isStunned(sv)) g += dAp * (sv.kind === 'hero' ? 3 : 2);
        else if (dAp < 0) g += dAp * 2;
        if (dBank > 0 && active(sv)) g += dBank * (sv.kind === 'hero' ? 2.5 : 1.6);
        else if (dBank < 0) g += dBank * 2;
      }
      g += cooldownGain(ru, sv, ru.id === actor.id ? o.slot : null);
    }
    // summons (they keep fighting: bulk + bite, more if it acts right away, less when the fight is nearly won) and spawns
    let foesLeft = 0;
    for (let i = 0; i < sim.units.length; i++) if (active(sim.units[i]) && G().hostile(actor, sim.units[i])) foesLeft++;
    const stay = foesLeft >= 3 ? 1 : foesLeft === 2 ? 0.8 : 0.5;
    for (let i = 0; i < sim.units.length; i++) {
      const u = sim.units[i];
      if (realById[u.id] || u.dead) continue;
      if (u.side === actor.side) {
        const bite = nextHit(ctx, u);
        g += (5 + 0.2 * (u.maxHp || 0) + bite + (active(u) && (u.ap || 0) > 0 ? 0.8 * bite : 0)) * stay;
      } else g -= 6 + 0.2 * (u.maxHp || 0);
    }
    if (moved && aoeReady(ctx)) g += 0.75 * Math.max(0, foePairs(sim, actor) - foePairs(real, actor));
    g += surfaceGain(real, sim, actor);
    g += Math.max(0, diff.hype || 0) * 0.15;
    if (sim.result === 'victory') g += 100;
    else if (sim.result === 'defeat') g -= 300;
    return g;
  }

  /**
   * One dry run of option o on other dice than the real ones (sample k; never the real roll, a player can't see it):
   * { gain, others1, stay, x, y, ap, ok, over, dice (the outcome depended on dice), diff, objects } or null.
   */
  function dryRun(ctx, o, k) {
    const real = S(), unit = ctx.unit;
    const r0 = real.rng.getState();
    const seed = (U.hash(r0 + ':autoplay:' + k) >>> 0) || 1;
    real.rng.setState(seed);   // engines without simulate's opts.seed clone the real RNG: give them the other dice
    try {
      return at(unit, o.pos, function () {
        const ret = DD.Targeting.simulate(function (sim, rec) {
          const su = DD.Combat.byId(unit.id);
          if (!su) return null;
          su.ap = o.apLeft;            // the walk there is paid
          let ref = o.def;
          if (o.slot) {
            ref = null;
            const slots = DD.Combat.slotsOf(su);
            for (let i = 0; i < slots.length; i++) if (slots[i].id === o.slot.id) { ref = slots[i]; break; }
            if (!ref) return null;
          }
          const d0 = sim.rng.getState();
          const used = DD.Combat.resolveSkill(su, ref, { x: o.target.x, y: o.target.y }, { pay: true, consumable: !!o.cons });
          // dice: logic draws of the copy's RNG (the engine's record skips bookkeeping draws) or a marked-uncertain run
          const dice = rec && typeof rec.draws === 'number' ? rec.draws > 0 || !!rec.uncertain : sim.rng.getState() !== d0;
          const out = { dice: dice || !!(used && used.uncertain), over: sim.result || null, ok: active(su), x: su.x, y: su.y, ap: active(su) ? su.ap || 0 : 0 };
          const diff = DD.Targeting.diff(real, sim, false);
          out.diff = diff;
          out.objects = diff.objects || [];
          out.gain = simGain(ctx, real, sim, unit, su, o, diff);
          out.others1 = 0; out.stay = 0;
          if (!sim.result) {
            const tm1 = threatModel(ctx);
            out.others1 = othersCost(tm1, unit.id);
            if (out.ok) out.stay = costAt(tm1, su, true);
          }
          return out;
        }, { seed: seed, record: true });
        // engines with opts.record return { result, draws, uncertain }; older ones the result itself
        if (ret && typeof ret.draws === 'number' && 'result' in ret && !('gain' in ret)) return ret.result || null;
        return ret || null;
      });
    } finally {
      if (S() === real) real.rng.setState(r0);
    }
  }

  /**
   * Is this a moment for a signature? It hits 2+ foes or a boss, or affects 3+ allies, or brings 2+ units, or pulls the
   * party out of real danger, or the fight is nearly over (sigReserve 0). One lone minion is not worth 100 Hype.
   */
  function bigMoment(ctx, r) {
    const unit = ctx.unit, pu = r.diff ? r.diff.perUnit : {};
    let foes = 0, friends = 0, boss = false;
    for (const id in pu) {
      const u = DD.Combat.byId(id), e = pu[id];
      if (!u) continue;
      if (G().hostile(unit, u)) {
        if (e.dmg > 0 || e.lethal || (e.statuses && e.statuses.length)) { foes++; if (isBoss(u)) boss = true; }
      } else if (e.heal > 0 || e.block > 0 || (e.statuses && e.statuses.length)) friends++;
    }
    const spawned = r.diff ? (r.diff.spawned || []).length : 0;
    const saved = ctx.my0 + ctx.others0 - r.stay - r.others1;
    return foes >= 2 || boss || friends >= 3 || spawned >= 2 || saved >= 15 || sigReserve() === 0;
  }

  /** Holding a signature for a better moment: costly to fire early unless the fight is nearly over. */
  function sigReserve() {
    let n = 0, boss = null;
    DD.Combat.enemies().forEach(function (f) { if (f.kind === 'summon') return; n++; if (isBoss(f)) boss = f; });
    if (n <= 1) return 0;
    if (boss && boss.hp <= boss.maxHp * 0.35) return 0;
    return n <= 2 ? 4 : 10;
  }

  /** Exact total of option o (averaged over dice when the outcome is random): { total, gain } or null. */
  function exactTotal(ctx, o) {
    const unit = ctx.unit;
    const first = dryRun(ctx, o, 0);
    if (!first) return null;
    const runs = [first];
    if (first.dice || (o.def.tags || []).indexOf('random') >= 0) {
      for (let k = 1; k < EV_SAMPLES; k++) { const r = dryRun(ctx, o, k); if (r) runs.push(r); }
    }
    const hctx = hasHooks(o.def) ? at(unit, o.pos, function () { return hookCtx(unit, o.slot || o.def, o.target); }) : null;
    let total = 0, gain = 0;
    for (let i = 0; i < runs.length; i++) {
      const r = runs[i];
      let g = r.gain;
      r.objects.forEach(function (ob) {
        if (protectedObj(ob.id) && ob.destroyed) g -= 60;
        else g += objectValue(unit, G().tile(ob.x, ob.y), ob.dmg || 0, ob.destroyed);
      });
      if (hctx) { hctx.autoplay = { preview: r.diff }; g += hookScore(o.def, hctx, true); }
      if (o.sk && o.sk.cd) {
        const cd = DD.Combat.cooldownOf(unit, o.def, o.slot.level);
        g -= cd * 0.3;
        if (o.def.charges > 0) g -= o.def.charges - (o.slot.uses || 0) <= 1 ? 3 : 1.5;
      }
      if (o.cons) g -= ctx.consCost;
      const end = r.ok ? endValue(ctx, { x: r.x, y: r.y }, r.ap, o.slot, r.stay) : 0;
      gain += g;
      total += g + end + ctx.my0 + (ctx.others0 - r.others1);
    }
    gain /= runs.length;
    total = total / runs.length - (o.moving ? 0.5 + walkCost(unit, o.pos) : 0) - 0.25 * o.ap;
    if (o.sk && o.sk.sig) {
      if (gain < 12 || !bigMoment(ctx, first)) return null;
      total -= sigReserve();
    }
    // an option must do something: a free no-op would otherwise "keep the potential" forever
    if (gain <= (o.ap > 0 ? 0.25 : 1) && ctx.my0 + ctx.others0 - first.stay - first.others1 <= 0.25) return null;
    return { total: total, gain: gain };
  }

  // ---- candidates ------------------------------------------------------------------------------------------------------
  function optKey(o) { return (o.cons ? 'c' + o.consIndex : o.slot.id) + '@' + o.pos.x + ',' + o.pos.y + '>' + o.target.x + ',' + o.target.y; }

  /** Quick pass over every reachable tile × usable skill × target; fills the leftover-AP table ctx.fp. */
  function quickPass(ctx) {
    const unit = ctx.unit, opts = [];
    ctx.positions.forEach(function (pos) {
      const apLeft = ctx.ap - (pos.moving ? ctx.moveCost : 0);
      if (apLeft <= 0) { ctx.fp[key(pos.x, pos.y)] = []; return; }
      const row = [];
      at(unit, pos, function () {
        ctx.slots.forEach(function (sk) {
          if (sk.ap > apLeft) return;
          let best = 0;
          targetsFrom(unit, sk.slot).forEach(function (t) {
            const q = quickScore(ctx, sk, t);
            if (q.base > best) best = q.base;
            if (q.q > 0) opts.push({ pos: pos, moving: pos.moving, slot: sk.slot, def: sk.def, sk: sk, target: t, quick: q.q, ap: sk.ap, apLeft: apLeft });
          });
          if (best > 0 && !sk.sig) row.push({ id: sk.slot.id, ap: Math.max(1, sk.ap), cd: sk.cd, perAP: best / Math.max(1, sk.ap) });
        });
      });
      ctx.fp[key(pos.x, pos.y)] = row;
    });
    refreshWalkBest(ctx);
    return opts;
  }
  /** Walking somewhere else first: the best value per AP over the tiles one move away (skills that proved duds aside). */
  function refreshWalkBest(ctx) {
    ctx.walkBest = 0;
    if (!ctx.canWalk) return;
    ctx.positions.forEach(function (pos) {
      if (!pos.moving) return;
      (ctx.fp[key(pos.x, pos.y)] || []).forEach(function (r) { if (!ctx.dud[r.id] && r.perAP > ctx.walkBest) ctx.walkBest = r.perAP; });
    });
  }

  function utilQuick(ctx, sk, t) {
    const unit = ctx.unit, def = sk.def, tg = def.target || {}, tags = def.tags || [];
    let q = hasHooks(def) ? hookScore(def, hookCtx(unit, sk.slot, t), false) : 0;
    const tu = G().unitAt(t.x, t.y);
    const mover = def.kind === 'move' || tags.indexOf('move') >= 0 || tags.indexOf('teleport') >= 0;
    if (mover && tg.type === 'tile') {
      const left = ctx.ap - sk.ap;
      q += ctx.my0 - myCost(ctx, t, left) + 0.5 * fpAt(ctx, t, left, sk.slot, true) + 0.5 * progressAt(ctx, t);
    } else if (tu && !G().hostile(unit, tu)) {
      q += 0.5 * costAt(ctx.tm0, tu, tu === unit) + (tu === unit ? 0 : 1) + 0.25 * DD.Combat.slotsOf(tu).filter(function (sl) { return sl.cd > 0; }).length;
    } else if (tu && G().hostile(unit, tu)) q += 0.5 * threatOf(ctx.tm0, tu) + (tu.intents && tu.intents.length ? 2 : 0);
    return q;
  }

  /** Utility skills (no damage / heal numbers): the best few targets from the current tile, by a cheap estimate. */
  function utilityOptions(ctx) {
    const unit = ctx.unit, out = [];
    ctx.slots.forEach(function (sk) {
      if (!sk.util || sk.sig || sk.ap > ctx.ap) return;
      const cands = DD.Targeting.validTargets(unit, sk.slot).map(function (t) { return { t: t, u: utilQuick(ctx, sk, t) }; });
      cands.sort(function (a, b) { return b.u - a.u; });
      for (let i = 0; i < cands.length && i < UTIL_REFINE; i++) {
        out.push({ pos: ctx.here, moving: false, slot: sk.slot, def: sk.def, sk: sk, target: cands[i].t, ap: sk.ap, apLeft: ctx.ap });
      }
    });
    return out;
  }

  /** Consumables from the current tile (heroes only): the targets covering the most units for thrown ones. */
  function consumableOptions(ctx) {
    const unit = ctx.unit, out = [];
    if (unit.kind !== 'hero') return out;
    const list = DD.Combat.consumables();
    const seen = {};
    for (let i = 0; i < list.length; i++) {
      const id = typeof list[i] === 'object' && list[i] ? list[i].id : list[i];
      if (seen[id]) continue;
      seen[id] = 1;
      if (DD.Combat.canUseConsumable(unit, i) !== true) continue;
      const def = DD.getConsumable(id);
      if (!def) continue;
      const targets = DD.Targeting.validTargets(unit, def);
      // [core fix, kit — docs/notes/kit.md] thrown bombs: the targets whose area covers the most units (foes first)
      const pick = targets.length <= CONS_REFINE ? targets : busiestTargets(unit, def, targets, CONS_REFINE);
      const cost = def.ap === undefined ? 1 : def.ap;
      pick.forEach(function (tg) { out.push({ pos: ctx.here, moving: false, cons: true, consIndex: i, def: def, target: tg, ap: cost, apLeft: ctx.ap }); });
    }
    return out;
  }

  /**
   * A hinted object whose interaction may be dry-run: its callback is the registered object def's (content written
   * against the state it is handed); per-instance callbacks (onInteract / interact on the instance) may close over
   * outside state, so they are never simulated.
   */
  function dryable(x, y) {
    const tl = G().tile(x, y), o = tl && tl.obj;
    if (!o || typeof o.onInteract === 'function' || o.interact !== undefined) return false;
    const def = DD.getObject(o.id);
    return !!(def && def.interact && typeof def.interact.fn === 'function');
  }
  /**
   * Dry run of a hinted interaction from pos with ap AP (on other dice): what it does to the danger — a lever that drops
   * the vault on the boss, the last Handbook that cancels the doom. { ok, ap, others1, stay, result } or null.
   */
  function dryHint(ctx, pos, ix, ap) {
    const real = S(), unit = ctx.unit;
    const r0 = real.rng.getState();
    const seed = (U.hash(r0 + ':autoplay:hint') >>> 0) || 1;
    real.rng.setState(seed);
    try {
      return at(unit, pos, function () {
        return DD.Targeting.simulate(function (sim) {
          const su = DD.Combat.byId(unit.id);
          if (!su) return null;
          su.ap = ap;
          if (!DD.Combat.interact(su, ix.x, ix.y)) return null;
          const out = { ok: active(su), ap: active(su) ? su.ap || 0 : 0, others1: 0, stay: 0, result: sim.result || null };
          if (!sim.result) {
            const tm1 = threatModel(ctx);
            out.others1 = othersCost(tm1, unit.id);
            if (out.ok) out.stay = costAt(tm1, su, true);
          }
          return out;
        }, { seed: seed });
      });
    } finally {
      if (S() === real) real.rng.setState(r0);
    }
  }

  /**
   * Best hinted interaction or plate from here, after one move, or two moves away (then the first move is done and the
   * unit decides again): { kind: 'hint', pos, moving, ix, total }. The value is the object's hint; the best two
   * dry-runnable interactions also count what they do to the danger (D0 − D1), like a skill's preview.
   */
  function bestHint(ctx) {
    const unit = ctx.unit;
    const hinted = hintedTiles(unit, 0.01);
    if (!hinted.length) return null;
    const offers = [];
    const offer = function (pos, moving, ix, v, apCost, at2) {
      const end = at2 || pos;
      const moves = (moving ? 1 : 0) + (at2 ? 1 : 0);
      const left = ctx.ap - moves * ctx.moveCost - apCost;
      const costs = (moving ? 0.5 + walkCost(unit, pos) : 0) + (at2 ? 0.5 : 0) + 0.25 * apCost;
      offers.push({ kind: 'hint', pos: pos, moving: moving, ix: at2 ? null : ix, target: ix, end: end, v: v, left: left, costs: costs,
        total: v + endValue(ctx, end, left, null) + ctx.my0 - costs });
    };
    const near = {};
    ctx.positions.forEach(function (pos) {
      const apLeft = ctx.ap - (pos.moving ? ctx.moveCost : 0);
      if (pos.moving && apLeft >= 0) {
        const tl = G().tile(pos.x, pos.y);
        const v = tl && tl.obj && !G().objBlocksMove(tl.obj) ? hintOf(tl.obj, unit, tl) : 0;
        if (v > 0) offer(pos, true, null, v, 0);
      }
      if (apLeft <= 0) return;
      at(unit, pos, function () {
        DD.Combat.interactions(unit).forEach(function (ix) {
          if ((ix.kind !== 'object' && ix.kind !== 'smash') || ix.ap > apLeft) return;
          const v = hintAt(unit, ix.x, ix.y);
          if (v > 0) { near[key(ix.x, ix.y)] = 1; offer(pos, pos.moving, ix, v, ix.ap); }
        });
      });
    });
    // two moves away: a worthwhile interaction (hint ≥ 10) the unit can still reach and use this turn
    if (AP.hint2 !== false && ctx.canWalk && ctx.ap >= 2 * ctx.moveCost + 1) {
      hinted.forEach(function (p) {
        if (near[key(p.x, p.y)] || hintAt(unit, p.x, p.y) < 10 || !dryable(p.x, p.y)) return;
        const tl = G().tile(p.x, p.y), def = DD.getObject(tl.obj.id) || {};
        const ia = def.interact || {}, cost = ia.ap === undefined ? 1 : ia.ap;
        if (ctx.ap < 2 * ctx.moveCost + cost) return;
        const v = hintAt(unit, p.x, p.y);
        let best = null;
        ctx.positions.forEach(function (first) {
          if (!first.moving) return;
          walkFrom(ctx, first).forEach(function (q) {
            if (dist(q, p) !== 1) return;
            const sc = -myCost(ctx, q) - walkCost(unit, first);
            if (!best || sc > best.sc) best = { first: first, q: q, sc: sc };
          });
        });
        if (best) offer(best.first, true, { x: p.x, y: p.y, ap: cost, kind: 'object' }, v, cost, best.q);
      });
    }
    if (!offers.length) return null;
    offers.sort(function (a, b) { return b.total - a.total; });
    // dry runs: the best two interactions within a move, and every two-move detour (a detour is only worth it when the
    // interaction itself takes real danger off the party, e.g. the last Handbook before the doom lands)
    let n = 0;
    for (let i = 0; i < offers.length; i++) {
      const h = offers[i], far = h.end !== h.pos;
      if (!far && n >= 2) continue;
      if (AP.hintDry === false || !h.target || (h.target.kind !== 'object' && h.target.kind !== 'smash') || !dryable(h.target.x, h.target.y)) continue;
      if (!far) n++;
      const r = dryHint(ctx, h.end, h.target, h.left + (h.target.ap || 0));
      if (!r) { if (far) h.total = -Infinity; continue; }
      if (r.result === 'victory') { h.total += 100; continue; }
      if (r.result === 'defeat') { h.total -= 300; continue; }
      const saved = ctx.my0 + ctx.others0 - r.stay - r.others1;
      if (far && saved < 40) { h.total = -Infinity; continue; }
      h.total = h.v + (r.ok ? endValue(ctx, h.end, r.ap, null, r.stay) : 0) + ctx.my0 + (ctx.others0 - r.others1) - h.costs;
      h.dry = true;
    }
    offers.sort(function (a, b) { return b.total - a.total; });
    const top = offers.filter(function (h) { return isFinite(h.total) && (h.end === h.pos || h.dry); })[0];
    if (!top) return null;
    if (AP.trace === 'all') AP.log.push({ cand: 'hint at ' + key(top.end.x, top.end.y) + (top.target ? ' > ' + key(top.target.x, top.target.y) : '') + (top.end !== top.pos ? ' (via ' + key(top.pos.x, top.pos.y) + ')' : ''), total: Math.round(top.total * 10) / 10 });
    return top;
  }

  /**
   * Best plain move: into cover / out of the reach of the enemies acting next, or toward the fight (walking-distance
   * progress, see progressAt): { kind: 'move', pos, total }. v2: the best few also count what the move does to the allies'
   * danger (standing in an enemy's way, drawing its attention away from a wounded ally).
   */
  function bestMove(ctx) {
    if (!ctx.canWalk || ctx.ap < ctx.moveCost) return null;
    const unit = ctx.unit, left = ctx.ap - ctx.moveCost;
    const list = [];
    ctx.positions.forEach(function (pos) {
      if (!pos.moving) return;
      // staying there keeps the progress toward the fight; walking on to cover afterwards gives it up again
      let v = fpAt(ctx, pos, left, null) - myCost(ctx, pos, left) + progressAt(ctx, pos);
      if (ctx.canWalk && left >= ctx.moveCost) {
        const esc = escapeCost(ctx, pos, left - ctx.moveCost);
        if (esc !== null) v = Math.max(v, fpAt(ctx, pos, left - ctx.moveCost, null) - esc - 0.5);
      }
      list.push({ kind: 'move', pos: pos, total: v + ctx.my0 - 0.5 - pos.cost * 0.05 - walkCost(unit, pos) });
    });
    if (!list.length) return null;
    list.sort(function (a, b) { return b.total - a.total; });
    if (ctx.others0 > 0.5 || ctx.tm0.objs.length) {
      // the best few by the unit's own value, plus every tile next to a protected object (standing guard)
      const objs = ctx.tm0.objs;
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        const guard = objs.some(function (o) { return dist(o, c.pos) === 1; });
        if (i >= MOVE_OTHERS && !guard) continue;
        const others = at(unit, c.pos, function () { return othersCost(threatModel(ctx), unit.id); });
        c.total += ctx.others0 - others;
      }
      list.sort(function (a, b) { return b.total - a.total; });
    }
    return list[0];
  }

  /**
   * Value of being on pos instead of here for the next turns when nothing is in reach: PROGRESS per tile of walking
   * distance gained toward the fight (destroy-objective targets, puzzle objects worth ≥ 10, else tiles to attack a foe
   * from), 0 when the unit can already act. The field is a flood fill, so walls and chasms are walked around.
   */
  function progressAt(ctx, pos) {
    if (ctx.prog === undefined) ctx.prog = approachField(ctx);
    const f = ctx.prog;
    if (!f) return 0;
    const g = S().grid;
    const v = f.dist[pos.y * g.w + pos.x];
    if (!isFinite(v) || v >= f.here) return 0;
    return PROGRESS * (2 - caution()) * Math.min(f.here - v, ctx.mov + 2);
  }
  /** The approach field for this decision: { dist, here } or null (in reach already, nothing to walk to, rooted). */
  function approachField(ctx) {
    const unit = ctx.unit;
    if (!ctx.canWalk) return null;
    const row = ctx.fp[key(unit.x, unit.y)];
    if (row && row.length && row.some(function (r) { return r.perAP >= 3 && !ctx.dud[r.id]; })) return null;   // something worth doing in reach
    if (nextHit(ctx, unit) <= 0 && !objectiveTiles().length) return null;   // healers / buffers don't charge in
    const goal = approachGoals(unit);
    if (!goal) return null;
    const dist = distField(unit, goal.tiles, goal.adjacent);
    const here = dist[unit.y * S().grid.w + unit.x];
    if (!isFinite(here) || here === 0 || (goal.adjacent && here <= 1)) return null;
    return { dist: dist, here: here };
  }

  /** Best candidate for the unit right now (skills, consumables, hints, moves), or null. */
  function decide(ctx) {
    const quick = quickPass(ctx);
    quick.forEach(function (o) {
      const left = o.apLeft - o.ap;
      o.est = o.quick + endValue(ctx, o.pos, left, o.slot) + ctx.my0 - (o.moving ? 0.5 + walkCost(ctx.unit, o.pos) : 0) - 0.25 * o.ap;
    });
    quick.sort(function (a, b) { return b.est - a.est; });
    const pick = [], seen = {};
    const add = function (o) { const k = optKey(o); if (!seen[k]) { seen[k] = 1; pick.push(o); } };
    let n = 0, sig = 0;
    for (let i = 0; i < quick.length && (n < REFINE || sig < 2); i++) {
      const o = quick[i];
      if (o.sk.sig) { if (sig < 2) { sig++; add(o); } } else if (n < REFINE) { n++; add(o); }
    }
    utilityOptions(ctx).forEach(add);
    consumableOptions(ctx).forEach(add);
    let best = null;
    const consider = function (c) { if (c && isFinite(c.total) && (!best || c.total > best.total)) best = c; };
    const tried = {}, worked = {};
    pick.forEach(function (o) {
      const ex = exactTotal(ctx, o);
      if (AP.trace === 'all') {
        AP.log.push({ cand: (o.cons ? o.def.id : o.slot.id) + (o.moving ? ' from ' + key(o.pos.x, o.pos.y) : '') + ' > ' + key(o.target.x, o.target.y),
          est: o.est === undefined ? null : Math.round(o.est * 10) / 10, total: ex ? Math.round(ex.total * 10) / 10 : null, gain: ex ? Math.round(ex.gain * 10) / 10 : null });
      }
      if (!o.cons && o.slot) { tried[o.slot.id] = 1; if (ex && ex.gain > 0.25) worked[o.slot.id] = 1; }
      if (ex) consider({ kind: o.cons ? 'consumable' : 'skill', o: o, total: ex.total, gain: ex.gain });
    });
    // a skill whose quick estimate promised something its exact previews never delivered is no leftover-AP potential
    // either (else the unit walks back and forth toward a phantom)
    let dud = false;
    for (const id in tried) if (!worked[id]) { ctx.dud[id] = 1; dud = true; }
    if (dud) { refreshWalkBest(ctx); ctx.prog = undefined; }
    consider(bestHint(ctx));
    const mv = bestMove(ctx);
    if (AP.trace === 'all' && mv) AP.log.push({ cand: 'move to ' + key(mv.pos.x, mv.pos.y), total: Math.round(mv.total * 10) / 10 });
    consider(mv);
    return best;
  }

  // ---- movement helpers ---------------------------------------------------------------------------------------------
  /**
   * Walking distance (path cost) to the nearest goal tile for every tile, flooded out from the goals over walkable
   * tiles (heights and terrain cost included). adjacent: goals are things to stand next to (foes, levers), so the first
   * step off a goal ignores the height rule.
   */
  function distField(unit, goals, adjacent) {
    const g = S().grid;
    const dist = new Float64Array(g.w * g.h).fill(Infinity), queue = [];
    goals.forEach(function (p) { const i = p.y * g.w + p.x; if (dist[i] !== 0) { dist[i] = 0; queue.push(i); } });
    for (let h = 0; h < queue.length; h++) {
      const i = queue[h], x = i % g.w, y = (i / g.w) | 0;
      const fromGoal = adjacent && dist[i] === 0;
      for (let d = 0; d < 4; d++) {
        const nx = x + U.DIRS[d].x, ny = y + U.DIRS[d].y;
        if (!G().inBounds(nx, ny) || !G().isWalkable(nx, ny, unit)) continue;
        if (!fromGoal && !G().canStep(unit, { x: nx, y: ny }, { x: x, y: y })) continue;
        const j = ny * g.w + nx, c = dist[i] + (fromGoal ? 1 : G().stepCost(unit, { x: nx, y: ny }, { x: x, y: y }));
        if (c < dist[j]) { dist[j] = c; queue.push(j); }
      }
    }
    return dist;
  }

  /** Longest range of the unit's damaging skills (melee = 1), capped. */
  function attackRange(unit) {
    let r = 1, minR = 1;
    DD.Combat.slotsOf(unit).forEach(function (sl) {
      const def = DD.getSkill(sl.id);
      const L = def && DD.skillLevel(def, sl.level || 1);
      if (!L || !(L.dmg > 0) || (def.target || {}).type === 'self') return;
      const rg = DD.Targeting.range(unit, def, sl.level || 1);
      if (rg[1] > r) { r = rg[1]; minR = Math.max(1, rg[0]); }
    });
    return [minR, Math.min(r, 8)];
  }

  /** Tiles from which the unit could hit a foe with its longest-range attack (line of sight). */
  function attackSpots(unit, foes) {
    const rg = attackRange(unit);
    const out = [];
    S().grid.tiles.forEach(function (tl) {
      if (!G().isWalkable(tl.x, tl.y, unit)) return;
      for (let i = 0; i < foes.length; i++) {
        const f = foes[i], d = Math.abs(f.x - tl.x) + Math.abs(f.y - tl.y);
        if (d >= rg[0] && d <= rg[1] && G().los(tl, f)) { out.push({ x: tl.x, y: tl.y }); return; }
      }
    });
    return out;
  }

  /**
   * Where to walk when nothing is in reach: destroy-objective targets first, then puzzle objects worth ≥ 10, else the
   * tiles to attack a foe from with the longest-range attack (melee: next to it). { tiles, adjacent } or null.
   */
  function approachGoals(unit) {
    let goals = objectiveTiles(), adjacent = true;
    if (!goals.length) goals = hintedTiles(unit, 10);
    if (!goals.length) {
      const foes = DD.Combat.foesOf(unit).filter(function (f) { return !has(f, 'stealth'); });
      if (!foes.length) return null;
      const rg = attackRange(unit);
      if (rg[1] <= 1) goals = foes.map(function (f) { return { x: f.x, y: f.y }; });
      else { goals = attackSpots(unit, foes); adjacent = false; }
      if (!goals.length) { goals = foes.map(function (f) { return { x: f.x, y: f.y }; }); adjacent = true; }
    }
    return { tiles: goals, adjacent: adjacent };
  }

  /**
   * Fallback walk toward the fight by walking distance (a flood fill around walls, gravestone rows and chasms; Manhattan
   * steps walked into dead ends), the least dangerous of the tiles that get closer. [core fix, enemies-act2 / act 1 /
   * buga requests]
   */
  function approachMove(ctx) {
    const unit = ctx.unit;
    if (!ctx.canWalk || ctx.ap < ctx.moveCost) return false;
    const goal = approachGoals(unit);
    if (!goal) return false;
    const g = S().grid;
    const dist = distField(unit, goal.tiles, goal.adjacent);
    const here = dist[unit.y * g.w + unit.x];
    if (here === 0 || (goal.adjacent && here <= 1)) return false;
    const left = ctx.ap - ctx.moveCost;
    let best = null, bestSc = -Infinity;
    ctx.positions.forEach(function (e) {
      if (!e.moving) return;
      const v = dist[e.y * g.w + e.x];
      if (!isFinite(v) || v >= here) return;
      const sc = -v * 2 - myCost(ctx, e, left) - walkCost(unit, e);
      if (sc > bestSc) { best = e; bestSc = sc; }
    });
    return best ? DD.Combat.move(unit, best.x, best.y) : false;
  }

  /**
   * [integration fix, bosses-act2 request — docs/notes/content-digest.md] A reachable tile next to a downed ally from
   * which Help Up (2 AP) is still affordable and that is not likely lethal to stand on (the safest), or null. Skipped
   * when a usable revive skill (target 'downedAlly', e.g. Smelling Salts) does it cheaper.
   */
  function rescueMove(unit, tm) {
    if (unit.kind !== 'hero' || DD.Combat.cantMove(unit)) return null;
    const moveCost = DD.Combat.moveApCost(unit);
    if ((unit.ap || 0) < moveCost + 2) return null;
    const downed = DD.Combat.heroes().filter(function (h) { return h.downed && !h.dead && h !== unit && !G().hostile(unit, h) && safeToRevive(tm, h); });
    if (!downed.length) return null;
    if (DD.Combat.slotsOf(unit).some(function (sl) {
      const def = sl && DD.getSkill(sl.id);
      return def && def.target && def.target.filter === 'downedAlly' && DD.Combat.canUse(unit, sl) === true;
    })) return null;
    let best = null, bestSc = -Infinity;
    DD.Combat.reachable(unit).forEach(function (e) {
      if (!downed.some(function (h) { return Math.abs(h.x - e.x) + Math.abs(h.y - e.y) === 1; })) return;
      const ex = exposure(tm, unit, e, true);
      if (lossOf(ex.hits, ex.flat + walkDamage(unit, e), ex.pierce, unit.block || 0, unit.hp || 0).down >= 0.5) return;
      const sc = -costOf(unit, ex) - walkCost(unit, e) - e.cost * 0.05;
      if (sc > bestSc) { best = e; bestSc = sc; }
    });
    return best;
  }

  /**
   * Help Up a downed ally now only if it would likely live until it can act: it comes back with ¼ HP and 0 AP (acting
   * on its own slot later), while a downed hero takes no damage (waiting a round is free).
   */
  function safeToRevive(tm, h) {
    if (!h || !tm) return !!h;
    const hp = Math.max(1, Math.round((h.maxHp || 0) * 0.25));
    const ex = exposure(tm, h, h, false, hp);
    const L = lossOf(ex.hits, ex.flat, ex.pierce, 0, hp);
    return L.down < 0.4;
  }

  // ---- acting -----------------------------------------------------------------------------------------------------
  function trace(unit, what, c) {
    if (!AP.trace) return;
    AP.log.push({ round: S().round, unit: unit.defId, what: what, skill: c && c.o ? (c.o.slot ? c.o.slot.id : c.o.def.id) : null,
      target: c && c.o ? { x: c.o.target.x, y: c.o.target.y } : c && c.pos ? { x: c.pos.x, y: c.pos.y } : null, total: c ? Math.round(c.total * 10) / 10 : null });
  }

  function execute(unit, c) {
    if (c.kind === 'move') return DD.Combat.move(unit, c.pos.x, c.pos.y);
    if (c.kind === 'hint') {
      if (c.moving && !DD.Combat.move(unit, c.pos.x, c.pos.y)) return false;
      return !c.ix || DD.Combat.interact(unit, c.ix.x, c.ix.y) || c.moving;
    }
    const o = c.o;
    if (o.moving && !DD.Combat.move(unit, o.pos.x, o.pos.y)) return false;
    // the walk may have changed things (a trap, a plate): a vanished target just means "decide again"
    if (o.cons) {
      const list = DD.Combat.consumables();
      const idOf = function (v) { return v && typeof v === 'object' ? v.id : v; };
      let idx = o.consIndex;
      if (idOf(list[idx]) !== o.def.id) idx = list.map(idOf).indexOf(o.def.id);
      return idx >= 0 && DD.Combat.useConsumable(unit, idx, o.target.x, o.target.y);
    }
    return DD.Combat.useSkill(unit, o.slot, o.target.x, o.target.y) || o.moving;
  }

  function actUnit(unit, approached) {
    const s = S();
    for (let step = 0; step < MAX_STEPS; step++) {
      if (DD.Combat.state !== s || !DD.Combat.isPlayerTurn() || !active(unit) || (unit.ap || 0) <= 0) return;
      const t0 = AP.measure ? clock() : 0;
      const helps = DD.Combat.interactions(unit).filter(function (o) { return o.kind === 'helpUp' && o.ap <= unit.ap; });
      const tmH = helps.length ? threatModel(null, unit) : null;
      const help = helps.filter(function (o) { return safeToRevive(tmH, DD.Combat.byId(o.unitId)); })[0];
      if (help && DD.Combat.interact(unit, help.x, help.y)) { trace(unit, 'helpUp'); continue; }
      const smash = DD.Combat.interactions(unit).filter(function (o) { return o.kind === 'smash' && objectiveObj(o.objId) && o.ap <= unit.ap; })[0];
      if (smash && DD.Combat.interact(unit, smash.x, smash.y)) { trace(unit, 'smash'); continue; }
      const ctx = makeCtx(unit);
      const rescue = rescueMove(unit, ctx.tm0);
      if (rescue && DD.Combat.move(unit, rescue.x, rescue.y)) { trace(unit, 'rescue'); continue; }
      const best = decide(ctx);
      if (AP.measure) AP.samples.step.push(clock() - t0);
      if (best && best.total > 0.5) {
        trace(unit, best.kind, best);
        if (execute(unit, best)) continue;
        return;
      }
      // nothing worth doing here: walk toward the fight once, otherwise stop (v2: leftover AP is lost)
      if (!approached.done && step === 0 && approachMove(ctx)) { approached.done = true; trace(unit, 'approach'); continue; }
      const useful = DD.Combat.interactions(unit).filter(function (o) { return o.kind === 'object' && o.ap <= unit.ap && /Drink|Open/.test(o.label); })[0];
      if (useful && DD.Combat.interact(unit, useful.x, useful.y)) { trace(unit, 'interact'); continue; }
      trace(unit, 'pass');
      return;
    }
  }

  /**
   * Greedy control of the CURRENT turn (v2: the current hero and the hero-side summons acting on its turn; does not end
   * the turn): the hero first, then its summons; later passes let units that gained AP, summons made mid-turn and units
   * whose situation changed act again. In deployment it rolls initiative first.
   */
  AP.takeTurn = function () {
    let s = S();
    if (!s) return;
    if (DD.Combat.isDeploying && DD.Combat.isDeploying()) DD.Combat.rollInitiative();
    s = S();
    if (!s || !DD.Combat.isPlayerTurn() || !DD.Combat.current()) return;
    const turn = s.turn;
    const approached = {};
    const mark = {};
    for (let pass = 0; pass < 3; pass++) {
      let acted = false;
      const order = DD.Combat.turnGroup().filter(function (u) { return active(u) && DD.Combat.controllable(u) && (u.ap || 0) > 0; }).sort(function (a, b) {
        if (a.kind !== b.kind) return a.kind === 'hero' ? -1 : 1;
        return 0;
      }).map(function (u) { return u.id; });
      for (let i = 0; i < order.length; i++) {
        if (DD.Combat.state !== s || !DD.Combat.isPlayerTurn() || s.turn !== turn) return;
        const u = DD.Combat.byId(order[i]);
        if (!active(u) || (u.ap || 0) <= 0 || !DD.Combat.controllable(u)) continue;
        // again only with more AP than it finished with, or after the board changed since
        if (mark[u.id] && (u.ap || 0) <= mark[u.id].ap && s.mutations === mark[u.id].m) continue;
        const ap0 = u.ap, m0 = s.mutations;
        const t0 = AP.measure ? clock() : 0;
        actUnit(u, approached[u.id] || (approached[u.id] = {}));
        if (AP.measure) AP.samples.unit.push(clock() - t0);
        mark[u.id] = { ap: u.ap || 0, m: s.mutations };
        if (u.ap !== ap0 || s.mutations !== m0) acted = true;
      }
      if (!acted) break;
    }
  };

  /**
   * Autoplay a whole combat: rolls initiative if deployment is open, then plays every hero turn (takeTurn + endTurn;
   * AI turns resolve inside endTurn) until the end or maxRounds (default 30). { result, rounds, timeout }. Always ends.
   */
  AP.runBattle = function (maxRounds) {
    maxRounds = maxRounds || 30;
    const s = S();
    if (!s) return { result: null, rounds: 0, timeout: false };
    if (!s.result && DD.Combat.isDeploying && DD.Combat.isDeploying()) DD.Combat.rollInitiative();
    let guard = 0;
    while (DD.Combat.state === s && !s.result && s.round <= maxRounds && guard++ < maxRounds * 16 + 8) {
      if (DD.Combat.isPlayerTurn()) DD.safe('AutoPlay.takeTurn', AP.takeTurn);
      if (s.result || DD.Combat.state !== s) break;
      if (!DD.Combat.endTurn()) break;
    }
    return { result: s.result || null, rounds: s.round, timeout: !s.result };
  };

  // ---- inspection (tests, HUD experiments, sims) -----------------------------------------------------------------------
  AP.measure = false;
  AP.samples = { unit: [], step: [] };
  AP.trace = false;
  AP.log = [];
  function summary(unit, ex) {
    let dmg = ex.flat, hits = 0, ride = 0;
    for (let i = 0; i < ex.hits.length; i++) { const h = ex.hits[i]; dmg += h.p * h.d; hits += h.p; ride += h.p * (h.ride || 0); }
    const L = lossOf(ex.hits, ex.flat, ex.pierce, unit.block || 0, unit.hp || 0);
    return { dmg: dmg, pierce: ex.pierce, hits: hits, ride: ride, aura: ex.aura, down: L.down, loss: L.exp, list: ex.hits.slice() };
  }
  /**
   * Expected damage unit would take ending its turn on (x, y), as if it were deciding now (every enemy turn until the
   * current owner's next turn counts in full; allies acting first lower it a little): { dmg (expected, after armor; Block
   * not subtracted), pierce, hits (expected number), ride, aura, down (odds of going down, after Block), loss, list }.
   */
  AP.incomingAt = function (unit, x, y) { return summary(unit, exposure(threatModel(null, unit), unit, { x: x, y: y }, true)); };
  /** The same from the current actor's point of view for an ally: weighed by the ally's own turn order (urgency). */
  AP.incomingAsAlly = function (unit, x, y, actor) { return summary(unit, exposure(threatModel(null, actor || DD.Combat.current()), unit, { x: x, y: y }, false)); };
  /** Non-wind-up threat of one enemy to unit on (x, y) via its threatAt hooks: { dmg, pierce }. */
  AP.auraAt = function (enemy, unit, x, y) { return aura(enemy, unit, { x: x, y: y }); };
  /** Walking distance field (Float64Array, index y*w+x) to the goal tiles. */
  AP.distField = function (unit, goals, adjacent) { return distField(unit, goals, adjacent !== false); };
  /** The stalemate breaker's view of the current fight: { quiet: rounds in a row without any HP change, caution }. */
  AP.stall = function () { const q = quietRounds(); return { quiet: q, caution: caution() }; };
  /** Who acts when until the current owner's next turn: { known, L, ownerId, seqs: { id: [seq] }, next: { id: seq } }. */
  AP.turnPlan = function () { return turnPlan(); };
  /**
   * Per AI enemy, what AutoPlay expects it to do before the horizon (from actor's point of view, default the current
   * unit): [{ id, defId, threat (expected damage), turns: [{ q, sig }], victims: { unitId: { p, est } }, obj }].
   */
  AP.threats = function (actor) {
    const tm = threatModel(null, actor || DD.Combat.current());
    return tm.srcs.map(function (src) {
      const v = {};
      for (const id in src.victims) {
        const x = src.victims[id];
        v[id] = { p: (1 - TARGET_MIX) * x.w / src.Z + TARGET_MIX / src.n, est: x.est };
      }
      return { id: src.e.id, defId: src.e.defId, threat: src.threat, turns: src.entries.slice(), victims: v, hitsPerTurn: src.m,
        obj: src.objV ? { p: (1 - TARGET_MIX) * src.objV.w / src.Z + TARGET_MIX / src.n, est: src.objV.est } : null };
    });
  };
  /** Danger cost of every hero-side unit right now (actor: in full, others by their own turn order): { unitId: cost }. */
  AP.danger = function (actor) {
    actor = actor || DD.Combat.current();
    const tm = threatModel(null, actor);
    const out = {};
    tm.party.forEach(function (u) { out[u.id] = costAt(tm, u, !!actor && u.id === actor.id); });
    return out;
  };
  /** Odds table (exposed for tests): lossOf(hits [{ p, d }], flat, pierce, block, hp) → { exp, down }. */
  AP.lossOf = lossOf;
  /** How many of its single hits an AI unit was seen to deal per turn in this fight (1 until it showed more; max 4). */
  AP.hitsPerTurn = function (unit) { return unit ? hitsPerTurn(unit) : 1; };
})();
