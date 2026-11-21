/* Dungeons and Degenerates — js/data/heroes/gus.js
 * Phat Gus the Unfathomable, Squirrel (Mostly Cheeks), Snackromancer (he/him; h19, the 20th hero; available from the
 * start). Spec: .tmp/h19/addendum-gus.md (plan .tmp/h19/plan.md §1.4). An actual squirrel with weird eldritch forest
 * powers who eats food: acorns fall into his cheeks from a tree that isn't there, and every one he eats lets the woods
 * whisper, bite and stare through him.
 *   The acorn loop: status gus_cheeks (stacks = acorns; none at 0) holds CAP 3 (4 with Cheeks of Holding); he starts a
 *   fight with START 1 (2); at the start of each of his turns (stunned, asleep or a sheep too) one more falls in, and at
 *   the cap it BONKs off his head. Skills whose desc starts "Eat an acorn:" / "Eat 2 acorns:" / "Eat every acorn" pay in
 *   the passive's onCostPaid (an object hit still eats; an Echo Chamber echo eats nothing; previews and AutoPlay dry
 *   runs pay on the copy). Acorns never touch the party's consumable pockets.
 *   Stress eating (his ONE conditional heal, Nov 18, D9): once per turn, when an active foe stands next to him after an
 *   eating skill resolved (never on an object hit), he heals STRESS_HEAL 3 (+ COAT_HEAL 2 with the Winter Coat (Built
 *   In)), through DD.Act.heal(u, u, n, { via: 'lift:gus' }); a meal at full HP heals 0 and leaves the turn's heal unused.
 *   Never a button, an HP threshold, a revive or a combat-start shield.
 * Registers: hero gus, 11 skills (gus_*), status gus_cheeks, 3 hero items, 3 loading tips. Test / debug API: DD.Gus.
 */
(function () {
  'use strict';
  const DD = window.DD;
  const U = DD.util;

  const HERO = 'gus', CHEEKS = 'gus_cheeks', INCISOR = 'gus_incisor';
  const CAP = 3, START = 1, HOLD_CAP = 4, HOLD_START = 2;
  const STRESS_HEAL = 3, COAT_HEAL = 2, NOMICON_DMG = 2, NOMICON_RANGE = 3;
  const ACORN_VALUE = 3;   // AutoPlay: a held acorn ≈ the edge one eater has over a basic attack
  const NOMICON = 'gus_nomnomicon', HOLDING = 'gus_cheeks_of_holding', COAT = 'gus_winter_coat';
  const PLUM = '#a05a9c', WRONG = '#c6e04a', CRUMB = '#8a5a2b', SNACK = '#e8c48a';
  // the woods' voice: lowercase, never a name (FX text, picked with the cosmetic DD.rng, never while simulating)
  const WHISPERS = ['...more...', '...feed us...', '...good squirrel...', '...the roots remember...', '...we see you, little one...',
    '...one more... one more...', '...there is a forest under every floor...', '...ph\'nom... ph\'nom...', '...not yet...', '...crunchy...'];

  // ---- helpers ------------------------------------------------------------------------------------------------
  function A() { return DD.Act; }
  function G() { return DD.Grid; }
  function S() { return DD.Combat && DD.Combat.state; }
  function active(u) { return !!u && !u.dead && !u.downed; }
  function dist(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }
  function byPos(a, b) { return a.y - b.y || a.x - b.x; }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
  function isGus(u) { return !!u && u.kind === 'hero' && u.defId === HERO; }
  /** A real fight with this unit in it (descs and canUse of the codex / party select see no fight). */
  function inFight(u) { const s = S(); return !!s && !!u && Array.isArray(s.units) && s.units.indexOf(u) >= 0; }
  /** A foe by effective side: a charmed enemy is on loan to the party and doesn't count; objects never do. */
  function isFoe(u, f) {
    return active(u) && active(f) && f !== u && G().effectiveSide(f) !== G().effectiveSide(u);
  }
  /** Engine hostility (the targeting's ctx.foes) for skill hits. */
  function foeOf(u, f) { return active(u) && active(f) && G().hostile(u, f); }
  /** Item check for combat units (items array), RunHeroes (slot object) or null. */
  function hasItem(user, id) {
    if (!user) return false;
    const items = user.items;
    if (Array.isArray(items)) return items.indexOf(id) >= 0;
    if (items && typeof items === 'object') { for (const k in items) if (items[k] === id) return true; }
    return !!(user.runHero && user.runHero !== user && hasItem(user.runHero, id));
  }
  /** A skill's target reach for this user: the base number plus his range items (DD.Targeting.reach). */
  function reach(user, id, L, base) {
    const d = DD.getSkill(id);
    if (!user || !d || !DD.Targeting || typeof DD.Targeting.reach !== 'function') return base;
    return DD.Targeting.reach(d, L || d.levels[0], user, base);
  }
  function dataOf(u) {
    const d = u.data || (u.data = {});
    return d.gus || (d.gus = { stress: -1, meal: null });
  }
  /** Read-only view of his bookkeeping (queries, descs and scores never create it). */
  function peek(u) { return (u && u.data && u.data.gus) || null; }
  /** Active foes next to `at` (a tile; default his own), by position. */
  function adjacentFoesAt(u, at) {
    const s = S();
    if (!s || !u) return [];
    const p = at || u;
    return s.units.filter(function (f) { return isFoe(u, f) && dist(f, p) === 1; }).sort(byPos);
  }
  /** AutoPlay's shared heal price (DD.AutoPlay.healWorth, E2), with the same formula as a fallback. */
  function healWorth(u, n) {
    if (DD.AutoPlay && typeof DD.AutoPlay.healWorth === 'function') return DD.AutoPlay.healWorth(u, n);
    n = Number(n);
    if (!active(u) || !(n > 0)) return 0;
    const miss = (u.maxHp || 0) - (u.hp || 0);
    return miss > 0 ? Math.min(n, miss) * (miss > u.maxHp / 2 ? 1.5 : 0.8) : 0;
  }

  // ---- the acorns ---------------------------------------------------------------------------------------------
  function cheeks(u) {
    const st = u && Array.isArray(u.statuses) ? A().getStatus(u, CHEEKS) : null;
    return st ? Math.max(0, st.stacks || 0) : 0;
  }
  function capOf(u) { return hasItem(u, HOLDING) ? HOLD_CAP : CAP; }
  function startOf(u) { return hasItem(u, HOLDING) ? HOLD_START : START; }
  /** What one stress eat heals him: STRESS_HEAL, + COAT_HEAL with the Winter Coat (Built In). */
  function stressOf(u) { return STRESS_HEAL + (hasItem(u, COAT) ? COAT_HEAL : 0); }

  /**
   * The cheeks on screen follow FX playback (Basanos' showSprite pattern): the count changes at once, the sprite keeps
   * the count it showed (unit.vis.gusCheeks) until playback reaches the change. Read only while the queue is busy, so a
   * pin never outlives a flush or a re-init. Cosmetic: previews skip it.
   */
  const pins = new WeakMap();
  function pin(u, before, after) {
    if (A().simulating || !u.vis) return;
    if (typeof u.vis.gusCheeks !== 'number' || !DD.FX.busy()) u.vis.gusCheeks = before;
    const k = (pins.get(u) || 0) + 1;
    pins.set(u, k);
    DD.FX.call(function () { if (u.vis) u.vis.gusCheeks = pins.get(u) === k ? null : after; });
  }
  /** The cheek count a painter draws: the pinned one while FX play back, else the real one; 1 for a gallery sprite. */
  function shownCheeks(o) {
    const u = o && o.unit;
    if (!u || !Array.isArray(u.statuses)) return 1;
    const v = u.vis && u.vis.gusCheeks;
    return DD.FX && DD.FX.busy() && typeof v === 'number' ? v : cheeks(u);
  }
  /** Set the acorns he holds (clamped to his cap): the chip is the truth; no status at 0. Silent (no log per acorn). */
  function setCheeks(u, n) {
    if (!u || !Array.isArray(u.statuses)) return 0;
    const cap = capOf(u);
    n = Math.max(0, Math.min(cap, Math.floor(+n || 0)));
    const before = cheeks(u);
    let st = A().getStatus(u, CHEEKS);
    if (n <= 0) {
      if (st) A().removeStatus(u, CHEEKS, { silent: true });
      if (before !== 0) pin(u, before, 0);
      return 0;
    }
    if (!st) {
      st = A().addStatus(u, CHEEKS, { stacks: n, silent: true }, u);
      if (!st) return cheeks(u);
    }
    if (st.stacks !== n) { st.stacks = n; A().touch(); }
    st.data = st.data || {};
    st.data.cap = cap;
    if (before !== n) pin(u, before, n);
    return n;
  }
  /** His turn start: one acorn falls in from a tree that isn't there; at the cap it bonks off his head. */
  function drop(u) {
    if (!isGus(u) || !active(u)) return false;
    const have = cheeks(u), cap = capOf(u);
    fxDrop(u, have < cap);
    if (have < cap) { setCheeks(u, have + 1); return true; }
    A().log('An acorn bonks ' + u.name + ' on the head. His cheeks are full, so it rolls away.', 'hero');
    A().maybeBark(u, 'bonk', 0.4);
    return false;
  }
  /** canUse of an eater: the exact shortfall (true outside a fight: the codex, party select). */
  function canEat(n, text) {
    return function (ctx) {
      const u = ctx && ctx.user;
      if (!u || !inFight(u)) return true;
      const have = cheeks(u);
      if (have >= n) return true;
      return text ? text.replace('{have}', have) : 'Needs ' + plural(n, 'acorn') + ' (his cheeks hold ' + have + ').';
    };
  }
  /** The last paid meal of this skill (All You Can Eat's Echo Chamber echo repeats it). */
  function mealOf(u, id) { const d = peek(u); return d && d.meal && d.meal.skill === id ? d.meal.n || 0 : 0; }

  /**
   * onCostPaid: a paid use of his eating skill eats L.acorns (every acorn for All You Can Eat; Fine, Have One spends one
   * without eating). Never a consumable, never an unpaid resolution (echoes, attacks of opportunity).
   */
  function paid(p) {
    const u = p && p.unit;
    if (!isGus(u) || !active(u) || p.consumable || !p.skill || p.skill.owner !== HERO) return;
    const L = DD.skillLevel(p.skill, p.level);
    const have = cheeks(u);
    const n = Math.min(have, p.skill.eatsAll ? have : (L.acorns | 0));
    if (!(n > 0)) return;
    const d = dataOf(u);
    p.gusAte = p.skill.shares ? 0 : n;
    d.meal = { skill: p.skill.id, n: p.gusAte };
    if (p.gusAte > 0) eatMoment(u, n);
    setCheeks(u, have - n);
    if (p.gusAte > 0) {
      A().log(n === 1 ? u.name + ' eats an acorn. Something in the woods is pleased.' :
        u.name + ' eats ' + n + ' acorns. Something in the woods is ' + (n >= 3 ? 'VERY ' : '') + 'pleased.', 'hero');
    }
  }
  /**
   * Crumbs (cosmetic): brown dust and a few dark leaves. [QA gus-gold-crumbs] not the 'coins' kind, whose palette drew
   * about 30% of them as spinning gold coins (fx_render keeps the passed colour for 70% of particles only).
   */
  function crumbs(u, n) {
    DD.FX.particles(u, { kind: 'dust', count: n, color: CRUMB, parallel: true });
    DD.FX.particles(u, { kind: 'leaves', count: Math.max(1, Math.round(n / 3)), color: '#2f3a1a', parallel: true });
  }
  /** The eat moment: CHOMP, crumbs, a whisper from the woods (cosmetic; skipped while simulating). */
  function eatMoment(u, n) {
    if (A().simulating) return;
    DD.FX.text(u, n >= 3 ? 'CHOMP CHOMP CHOMP!' : n === 2 ? 'CHOMP CHOMP!' : 'CHOMP!', { color: SNACK, size: 16 });
    crumbs(u, 6);
    DD.FX.sound('hit', { vol: 0.6 });
    DD.FX.text(u, U.line(WHISPERS, DD.rng), { color: WRONG, size: 12, life: 1500, parallel: true });
  }

  /**
   * Stress eating (Nov 18, D9): his ONE conditional heal. After an eating skill resolved, once per turn, if an active
   * foe (effective side) stands next to him, he heals stressOf(u). Checked after the skill: tunnelling into a crowd heals,
   * out of one doesn't; killing the only foe in his face first costs him the heal. The call is made at any HP (no
   * threshold); "once per turn" is the heal itself (fix:polish, the addendum's text): a meal at full HP heals 0 and leaves
   * the turn's stress eating for a later meal that turn.
   */
  function stressEat(u) {
    const s = S();
    if (!isGus(u) || !active(u) || !s) return 0;
    const d = dataOf(u);
    if (d.stress === s.turn || !adjacentFoesAt(u).length) return 0;
    const healed = A().heal(u, u, stressOf(u), { via: 'lift:gus' });
    if (healed > 0) {
      d.stress = s.turn;   // s.turn: the per-unit-turn counter (Combat beginTurn)
      DD.FX.text(u, '🌰 Stress eating!', { color: '#ffd1a1', size: 14, parallel: true });
      A().log(u.name + ' stress-eats with a monster in his face. It helps.', 'hero');
      A().maybeBark(u, 'stress', 0.4);
    }
    return healed;
  }
  /** The Nom-Nom-Nomicon reads the recipe aloud: after an eating skill, the nearest awake foe within 3 takes 2 per acorn. */
  function nomiconTarget(u) {
    const s = S();
    if (!s) return null;
    return s.units.filter(function (f) { return isFoe(u, f) && dist(f, u) <= NOMICON_RANGE && !A().hasStatus(f, 'sleep'); })
      .sort(function (a, b) { return dist(a, u) - dist(b, u) || ((a.hp || 0) + (a.block || 0)) - ((b.hp || 0) + (b.block || 0)) || byPos(a, b); })[0] || null;
  }
  function nomicon(u, ate) {
    if (!isGus(u) || !active(u) || !hasItem(u, NOMICON) || !(ate > 0)) return 0;
    const f = nomiconTarget(u);
    if (!f) return 0;
    const n = NOMICON_DMG * ate;
    DD.FX.projectile(u, f, { kind: 'orb', color: '#efe6c8' });
    DD.FX.text(f, '📖 nom', { color: SNACK, size: 13 });
    const dealt = A().damage(u, f, n, { element: 'psychic', tags: ['nomicon'], cause: 'other' });
    A().log('The Nom-Nom-Nomicon reads a recipe aloud. ' + f.name + ' takes ' + dealt + ' psychic damage.', 'hero');
    return dealt;
  }
  /**
   * onSkillUsed: after a paid eating skill (never an echo: ctx.paid is null there; never an attack of opportunity: no
   * eater is a basic), stress eating first, then the Nomicon; neither on an object hit (nothing rides on one, finish D4).
   */
  function afterMeal(ctx) {
    const u = ctx && ctx.user;
    if (!isGus(u) || ctx.opportunity || !ctx.paid || !(ctx.paid.gusAte > 0)) return;
    // [QA gus-crate-stress-heal] nothing rides on an object hit (DESIGN D4): the acorn is spent (the cost), no stress
    // eating, no Nomicon, and the turn's stress eating stays unused
    if (ctx.objectHit) { A().maybeBark(u, 'eat', 0.2); return; }
    const healed = stressEat(u);
    if (!(healed > 0)) A().maybeBark(u, 'eat', 0.2);
    nomicon(u, ctx.paid.gusAte);
  }
  /** modifyOpportunity (pure): Incisor Decision's +mad on a Confused walker (estimates read 7, never 9). */
  function incisorOpportunity(o) {
    if (!o || !isGus(o.attacker) || !o.skill || o.skill.id !== INCISOR || !o.mover) return;
    if (A().hasStatus(o.mover, 'confused')) o.flat += DD.skillLevel(o.skill, o.level).mad || 0;
  }
  /** A dispel of his buffs confiscates the acorns (like every hero meter). */
  function confiscated(u, st, reason) {
    if (!isGus(u) || !st || st.id !== CHEEKS || reason !== 'cleansed' || !active(u)) return;
    DD.FX.text(u, 'Acorns confiscated!', { color: '#ffb0a0', size: 14 });
    A().bark(u, 'confiscated');
  }
  function start(u) {
    if (!isGus(u)) return;
    const d = dataOf(u);
    d.stress = -1;
    d.meal = null;
    setCheeks(u, startOf(u));
    if (!A().simulating) DD.FX.text(u, '🌰', { color: SNACK, size: 14 });
    snackBowl(u);
  }
  /** The act-3 DM's Snack Bowl on the board: one optional, cosmetic bark (it is never a target, never eaten). */
  function snackBowl(u) {
    const s = S();
    if (A().simulating || !s || !s.grid) return;
    if (s.grid.tiles.some(function (t) { return t.obj && t.obj.id === 'a3_snack_bowl'; })) A().maybeBark(u, 'snackbowl', 0.5);
  }

  // ---- AutoPlay (content-side prices; the exact pass dry-runs every use with pay: true) ----------------------------
  /**
   * Acorns never cross fights: with one foe left standing (summons aside) there is nothing to save them for, so each is
   * priced like one the next drop would bonk anyway (HERO-GUS sanity pass: AutoPlay hoarded in short fights).
   */
  function lastFoe(u) {
    const s = S();
    return !!s && s.units.filter(function (f) { return isFoe(u, f) && f.kind !== 'summon'; }).length <= 1;
  }
  /**
   * What eating / giving n acorns now costs (pure; the real pre-use state): ACORN_VALUE each, 1 for one the next drop
   * would bonk anyway (full cheeks) and 1 each against the last foe.
   */
  function priceOf(u, n) {
    let have = cheeks(u), v = 0;
    const cap = capOf(u), last = lastFoe(u);
    for (let i = 0; i < n; i++, have--) v += have >= cap || last ? 1 : ACORN_VALUE;
    return v;
  }
  /** What gaining n acorns now is worth (the last slot spills next turn: half). */
  function gainWorth(u, n) {
    let have = cheeks(u), v = 0;
    const cap = capOf(u);
    for (let i = 0; i < n && have < cap; i++, have++) v += have + 1 >= cap ? 1.5 : ACORN_VALUE;
    return v;
  }
  /** autoplayValue of an eater: minus the acorns' price. */
  function eatValue(ctx) {
    const u = ctx && ctx.user;
    if (!u || !ctx.skill) return 0;
    return -priceOf(u, ctx.skill.eatsAll ? cheeks(u) : ((ctx.L && ctx.L.acorns) | 0));
  }
  /** aiScore of an eater, quick pass only (the exact pass dry-runs the real heal): the stress heal it would get. */
  function stressQuick(ctx) {
    const u = ctx && ctx.user, s = S();
    if (!ctx || ctx.autoplay || !active(u) || !s || ctx.targetObj) return 0;   // an object hit: nothing rides on it (D4)
    const d = peek(u);
    if (d && d.stress === s.turn) return 0;
    const at = ctx.skill && ctx.skill.id === 'gus_hole' && ctx.target ? ctx.target : u;
    return adjacentFoesAt(u, at).length ? healWorth(u, stressOf(u)) : 0;
  }
  /** Can this ally act on its next turn? (Stunned, asleep, frozen, a sheep or downed: no.) */
  function canActNext(a) {
    return active(a) && !A().isStunned(a) && !A().hasStatus(a, 'sleep') && !A().hasStatus(a, 'frozen') && !A().hasStatus(a, 'sheep');
  }
  /** Fine, Have One's autoplayValue: what a fourth AP buys the ally (its best ready hit), minus the acorn. */
  function shareValue(ctx) {
    const u = ctx && ctx.user, a = ctx && ctx.targetUnit;
    if (!u || !a || a === u || !canActNext(a) || !DD.Combat || !DD.Combat.slotsOf) return 0;
    const ap = (DD.Combat.turnAp ? DD.Combat.turnAp(a) : a.maxAp || 3) + 1;
    let best = 0;
    DD.Combat.slotsOf(a).forEach(function (sl) {
      const def = sl && DD.getSkill(sl.id);
      if (!def || def.hype > 0 || (sl.cd || 0) > 1) return;
      const L = DD.skillLevel(def, sl.level || 1);
      if (DD.Combat.costOf(a, def, sl.level || 1).ap <= ap && L.dmg > best) best = L.dmg;
    });
    return Math.min(8, 0.6 * best) - priceOf(u, 1);
  }
  /**
   * The Tree That Isn't There's autoplayValue: the acorn it brings. The exact pass already counts the chip gaining a
   * stack as a buff (about 1.5), so there the net is gainWorth (nothing to subtract at the cap: no stack is gained).
   */
  function treeValue(ctx) {
    const u = ctx && ctx.user;
    if (!u) return 0;
    return gainWorth(u, (ctx.L && ctx.L.gain) || 1) - (ctx.autoplay && cheeks(u) < capOf(u) ? 1.5 : 0);
  }
  /** Incisor Decision's quick-pass hint: the quick estimate reads L.dmg only (the exact pass dry-runs the bite). */
  function incisorQuick(ctx) {
    const f = ctx && ctx.targetUnit;
    return !ctx || ctx.autoplay || !f || !A().hasStatus(f, 'confused') ? 0 : 0.9 * (ctx.L.mad || 0);
  }
  /** All You Can Eat's quick term: the binge on every foe in reach. */
  function bingeQuick(ctx) {
    const u = ctx && ctx.user;
    if (!ctx || ctx.autoplay || !active(u)) return 0;
    const L = ctx.L || {};
    const n = S() ? S().units.filter(function (f) { return foeOf(u, f) && dist(f, u) <= (L.r || 1); }).length : 0;
    return 0.8 * (L.per || 0) * cheeks(u) * n;
  }

  // ---- FX painters (cosmetic; yaw-safe: ground shapes are circles or on view.local axes, the rest is vertical) ----
  function zoomOf(view) { return (view && view.zoom) || 1; }
  /** A ground offset (u along +x, v along +y, in tiles) to screen px at this view (yaw-safe), zoom included. */
  function loc(view, u, v) {
    const z = zoomOf(view);
    const p = view && typeof view.local === 'function' ? view.local(u, v) : { x: (u - v) * 32, y: (u + v) * 16 };
    return { x: p.x * z, y: p.y * z };
  }
  function clamp01(p) { return Math.max(0, Math.min(1, +p || 0)); }
  function ease(p) { p = clamp01(p); return 1 - (1 - p) * (1 - p); }
  /** An almond eye (open 0..1), centred at (x, y), width w. */
  function almond(c, x, y, w, open, iris) {
    const h = w * 0.42 * clamp01(open);
    c.beginPath();
    c.moveTo(x - w / 2, y);
    c.quadraticCurveTo(x, y - h * 2, x + w / 2, y);
    c.quadraticCurveTo(x, y + h * 2, x - w / 2, y);
    c.closePath();
    if (h > 0.2) {
      c.fillStyle = iris || WRONG; c.fill();
      c.fillStyle = '#0a0a06';
      c.beginPath(); c.ellipse(x, y, Math.max(0.4, w * 0.07), Math.max(0.4, h * 0.95), 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#ffffff';
      c.beginPath(); c.arc(x - w * 0.12, y - h * 0.4, Math.max(0.4, w * 0.06), 0, Math.PI * 2); c.fill();
    }
    c.strokeStyle = '#141c0b'; c.lineWidth = Math.max(0.8, w * 0.08); c.stroke();
  }
  /** Root Canal: four gnarled roots erupt around the foe's tile, hold, and go back down. */
  function drawRoots(c, x, y, p, view) {
    const z = zoomOf(view), k = p < 0.45 ? ease(p / 0.45) : p > 0.75 ? Math.max(0, 1 - (p - 0.75) / 0.25) : 1;
    c.save();
    if (p < 0.25) {
      c.fillStyle = 'rgba(74,58,36,' + (0.7 * (1 - p / 0.25)).toFixed(2) + ')';
      for (let i = 0; i < 7; i++) { const a = i * 0.9, r = (4 + 14 * p) * z; c.beginPath(); c.arc(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.5 - 3 * z * p, 1.6 * z, 0, Math.PI * 2); c.fill(); }
    }
    [[0.28, 0.2], [-0.28, 0.2], [0.28, -0.2], [-0.28, -0.2]].forEach(function (b, i) {
      const base = loc(view, b[0], b[1]), bx = x + base.x, by = y + base.y;
      const h = 22 * z * k, lean = (i % 2 ? -1 : 1) * 4 * z * k, sway = Math.sin(p * 18 + i) * 1.5 * z;
      if (h < 0.5) return;
      c.beginPath();
      c.moveTo(bx - 3 * z, by);
      c.quadraticCurveTo(bx - 2 * z + lean, by - h * 0.55, bx + lean * 1.4 + sway, by - h);
      c.quadraticCurveTo(bx + 2 * z + lean, by - h * 0.5, bx + 3 * z, by);
      c.closePath();
      c.fillStyle = '#3a2614'; c.fill();
      c.strokeStyle = '#1c1209'; c.lineWidth = 1.2 * z; c.stroke();
      c.beginPath(); c.moveTo(bx, by - 2 * z); c.quadraticCurveTo(bx + lean * 0.6, by - h * 0.5, bx + lean * 1.2 + sway, by - h * 0.9);
      c.strokeStyle = WRONG; c.lineWidth = 0.7 * z; c.stroke();
    });
    c.restore();
  }
  /** The Hollow Hungers: a dark void opens flat on the floor with a rim of pale teeth that snaps shut, then closes. */
  function drawMouth(c, x, y, p, view) {
    const z = zoomOf(view);
    const open = p < 0.55 ? ease(p / 0.55) : p < 0.7 ? 1 - (p - 0.55) / 0.15 * 0.7 : 0.3 * Math.max(0, 1 - (p - 0.7) / 0.3);
    const R = 24 * z * Math.max(0.05, open), Ry = R * 0.5;
    c.save();
    c.beginPath(); c.ellipse(x, y, R, Ry, 0, 0, Math.PI * 2);
    c.fillStyle = '#141c0b'; c.fill();
    c.strokeStyle = 'rgba(198,224,74,0.5)'; c.lineWidth = 1.2 * z; c.stroke();
    const bite = p >= 0.55 && p < 0.7 ? 0.45 : 1;
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * Math.PI * 2, w = 0.22;
      const ix = x + Math.cos(a) * R * (1 - 0.35 * bite), iy = y + Math.sin(a) * Ry * (1 - 0.35 * bite);
      c.beginPath();
      c.moveTo(x + Math.cos(a - w) * R, y + Math.sin(a - w) * Ry);
      c.lineTo(ix, iy - 2 * z);
      c.lineTo(x + Math.cos(a + w) * R, y + Math.sin(a + w) * Ry);
      c.closePath();
      c.fillStyle = '#efe6d2'; c.fill();
      c.strokeStyle = '#3a3226'; c.lineWidth = 0.6 * z; c.stroke();
    }
    c.restore();
  }
  /** Down the Squirrel Hole: a dark hole on the old tile; two almond eyes inside blink twice and close. */
  function drawHole(c, x, y, p, view) {
    const z = zoomOf(view), fade = p > 0.85 ? Math.max(0, 1 - (p - 0.85) / 0.15) : 1;
    const R = 12 * z * (p < 0.15 ? ease(p / 0.15) : 1);
    c.save();
    c.globalAlpha *= fade;
    c.beginPath(); c.ellipse(x, y, R, R * 0.5, 0, 0, Math.PI * 2);
    c.fillStyle = '#120d07'; c.fill();
    c.strokeStyle = '#4a3a24'; c.lineWidth = 1.5 * z; c.stroke();
    const blink = Math.abs(p - 0.3) < 0.04 || Math.abs(p - 0.7) < 0.04 ? 0.1 : p > 0.82 ? Math.max(0, 1 - (p - 0.82) / 0.1) : 1;
    if (R > 3) { almond(c, x - 4 * z, y - 0.5 * z, 5 * z, blink); almond(c, x + 4 * z, y - 0.5 * z, 5 * z, blink); }
    c.restore();
  }
  /** Too Many Eyes: over a Marked foe an eye opens, stares, blinks and fades. */
  function drawEye(c, x, y, p, view) {
    const z = zoomOf(view), open = p < 0.3 ? ease(p / 0.3) : Math.abs(p - 0.6) < 0.05 ? 0.1 : 1;
    c.save();
    c.globalAlpha *= p > 0.8 ? Math.max(0, 1 - (p - 0.8) / 0.2) : 1;
    almond(c, x, y - 34 * z, 12 * z, open, '#f4f0c8');
    c.restore();
  }
  /** The Tree That Isn't There: a translucent gnarled tree with eyes in the canopy rises, shakes and fades. */
  function drawTree(c, x, y, p, view) {
    const z = zoomOf(view), rise = ease(Math.min(1, p / 0.3)), shake = Math.sin(p * 60) * 2 * (1 - p) * z;
    const alpha = (0.35 + 0.2 * Math.sin(p * Math.PI)) * (p > 0.85 ? Math.max(0, 1 - (p - 0.85) / 0.15) : 1);
    const H = 46 * z * rise, tx = x + shake;
    c.save();
    c.globalAlpha *= alpha;
    c.strokeStyle = '#2a1c10'; c.lineCap = 'round';
    c.lineWidth = 6 * z; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(tx - 3 * z, y - H * 0.5, tx, y - H * 0.75); c.stroke();
    c.lineWidth = 2.4 * z;
    [[-1, 0.62, 14], [1, 0.7, 12], [-0.4, 0.82, 9]].forEach(function (b) {
      c.beginPath(); c.moveTo(tx, y - H * b[1]); c.quadraticCurveTo(tx + b[0] * b[2] * 0.5 * z, y - H * b[1] - 8 * z * rise, tx + b[0] * b[2] * z, y - H * (b[1] + 0.12)); c.stroke();
    });
    c.fillStyle = '#26361a';
    c.beginPath(); c.ellipse(tx, y - H * 0.92, 18 * z * rise, 11 * z * rise, 0, 0, Math.PI * 2); c.fill();
    c.globalAlpha = Math.min(1, c.globalAlpha * 1.8);
    if (rise > 0.3) for (let i = 0; i < 5; i++) almond(c, tx + (i - 2) * 6 * z, y - H * 0.92 + ((i % 2) * 2 - 1) * 3 * z, 3.4 * z, 1);
    c.restore();
  }
  /** The Acorn That Should Not Be: a shadow grows, a colossal acorn with seven eyes drops, cracks and crumbles. */
  function drawGiantAcorn(c, x, y, p, view) {
    const z = zoomOf(view);
    c.save();
    // the shadow on the floor over the radius-2 area (a circle on the ground: the same ellipse at any yaw)
    const sh = p < 0.45 ? ease(p / 0.45) : p < 0.6 ? 1 : Math.max(0, 1 - (p - 0.6) / 0.4);
    c.fillStyle = 'rgba(30,18,36,' + (0.45 * sh).toFixed(3) + ')';
    c.beginPath(); c.ellipse(x, y, 80 * z * sh + 0.1, 40 * z * sh + 0.1, 0, 0, Math.PI * 2); c.fill();
    if (p >= 0.45) {
      const fall = p < 0.6 ? 1 - (p - 0.45) / 0.15 : 0, crumble = p > 0.6 ? (p - 0.6) / 0.4 : 0;
      const cy = y - 4 * z - 260 * z * fall, s = 22 * z * (1 - 0.35 * crumble);
      c.globalAlpha *= 1 - 0.75 * crumble;
      c.fillStyle = '#b47a3e'; c.strokeStyle = '#2a150a'; c.lineWidth = 2 * z;
      c.beginPath(); c.ellipse(x, cy - s, s * 0.8, s, 0, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = '#6a4425';
      c.beginPath(); c.ellipse(x, cy - s * 1.75, s * 0.95, s * 0.42, 0, 0, Math.PI * 2); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(x, cy - s * 2.15); c.lineTo(x + 3 * z, cy - s * 2.5); c.stroke();
      for (let i = 0; i < 7; i++) {
        const shut = crumble * 7 > i ? 0.05 : 1;
        almond(c, x + (i - 3) * s * 0.24, cy - s * (1.72 + (i % 2) * 0.12), s * 0.2, shut);
      }
      if (p >= 0.6) {
        c.strokeStyle = '#1a0d06'; c.lineWidth = 1.5 * z;
        c.beginPath(); c.moveTo(x - s * 0.5, cy - s * 1.3); c.lineTo(x - s * 0.1, cy - s * 0.9); c.lineTo(x - s * 0.3, cy - s * 0.5); c.lineTo(x + s * 0.2, cy - s * 0.1); c.stroke();
      }
    }
    c.restore();
  }
  function tileAt(p) { return { x: p.x, y: p.y, h: DD.FX.tileH ? DD.FX.tileH(p.x, p.y) : 0 }; }
  function fxCustom(p, ms, draw) {
    if (A().simulating) return;
    DD.FX.custom('custom', { at: tileAt(p), ms: ms, layer: 'world', draw: draw });
  }
  /** The drop at his turn start: an acorn falls on him (+🌰), or bonks off at the cap. */
  function fxDrop(u, lands) {
    if (A().simulating) return;
    const h = DD.FX.tileH ? DD.FX.tileH(u.x, u.y) : 0;
    DD.FX.projectile({ x: u.x, y: u.y, h: h + 3 }, u, { kind: 'rock', color: CRUMB, arc: 0, size: 0.7 });
    if (lands) {
      DD.FX.text(u, '+🌰', { color: SNACK, size: 14 });
      DD.FX.sound('coin', { vol: 0.5 });
      return;
    }
    DD.FX.text(u, 'BONK!', { color: '#ffd27a', size: 16 });
    DD.FX.text(u, '(cheeks full)', { color: SNACK, size: 12, parallel: true });
    DD.FX.particles(u, { kind: 'dust', count: 6, parallel: true });
    DD.FX.sound('bump');
  }

  // ---- the sprite: a very round russet squirrel on his haunches, the eyed tail, the murk -------------------------------
  const CHEEK_R = [2.4, 4.8, 6.3, 7.5, 8.6];   // the near cheek's radius at 0-4 acorns (it clears the head from 1)
  const P = { fur: '#a8582c', furD: '#7a3b1b', furL: '#cf7b45', belly: '#f2dcb4', bellyD: '#d8b986', cheek: '#e9b98c',
    blush: '#e3a07a', nose: '#2a1710', eye: '#140c08', glint: '#ffffff', tooth: '#fff4d6', nut: '#b47a3e',
    cap: '#6a4425', capD: '#4a2e18', wrong: WRONG, wrongD: '#7ea51c', murk: 'rgba(43,58,38,0.40)',
    murkV: 'rgba(80,40,90,0.30)', root: '#4a3a24', outline: '#2a150a', skin: '#a8582c', accent: WRONG };

  /** A point on the tail's S curve (f 0..1), base (−10, −8) up and forward to (−9, −38). */
  function tailPoint(f) {
    const a = 1 - f;
    const p0 = [-10, -8], p1 = [-24, -15], p2 = [-24, -37], p3 = [-9, -38];
    return [a * a * a * p0[0] + 3 * a * a * f * p1[0] + 3 * a * f * f * p2[0] + f * f * f * p3[0],
      a * a * a * p0[1] + 3 * a * a * f * p1[1] + 3 * a * f * f * p2[1] + f * f * f * p3[1]];
  }
  /** Eye i of the three in his tail: open in cast / attack and on a creepy idle cycle; shut on still frames. */
  function tailEyeOpen(i, t, pose, still, lying) {
    if (still) return 0;
    if (lying > 0.5) return i === 1 ? 1 : 0;   // downed: one eye stays open (the woods are still watching)
    if (pose === 'cast' || pose === 'attack') return 1;
    const ph = (t + 2.3 * i) % 7.5;
    return ph < 0.7 ? Math.sin(ph / 0.7 * Math.PI) : 0;
  }
  function drawTail(g, t, o, walking) {
    const c = g.ctx, still = !!o.still, sway = still ? 0 : Math.sin(t * 1.6) * 0.07 * (walking ? 2 : 1);
    c.save();
    c.translate(-10, -8); c.rotate(sway); c.translate(10, 8);
    // one bushy tube along the S (thick in the middle), outlined once, cel-lit toward the front, with fur tufts
    const blobs = [];
    for (let i = 0; i <= 14; i++) { const f = i / 14, q = tailPoint(f); blobs.push([q[0], q[1], 6 + 3.4 * Math.sin(Math.PI * Math.min(1, f * 1.15))]); }
    for (let pass = 0; pass < 3; pass++) {
      blobs.forEach(function (b) {
        c.beginPath(); c.arc(b[0] + (pass === 2 ? 1.3 : 0), b[1] - (pass === 2 ? 1 : 0), Math.max(0.5, b[2] - (pass === 2 ? 1.8 : 0)), 0, Math.PI * 2);
        if (pass === 0) { c.strokeStyle = g.outline; c.lineWidth = g.lw * 2; c.stroke(); } else { c.fillStyle = pass === 1 ? P.furD : P.fur; c.fill(); }
      });
    }
    [0.2, 0.42, 0.66, 0.88].forEach(function (f) {
      const q = tailPoint(f), r = 6 + 3.4 * Math.sin(Math.PI * Math.min(1, f * 1.15));
      g.arc(q[0] + 0.6, q[1] - 0.4, r - 2.4, Math.PI * 1.1, Math.PI * 1.6, P.furL, 0.9);
      g.line(q[0] - r + 0.4, q[1], q[0] - r - 1.6, q[1] - 1.2, P.outline, 0.8);
    });
    [[0.35, 2.2], [0.6, 2.6], [0.82, 2]].forEach(function (e, i) {
      const q = tailPoint(e[0]), open = tailEyeOpen(i, t, g.pose, still, o.lying || 0);
      if (open > 0.15) almond(c, q[0] - 1, q[1], e[1] * 2.2, open);
      else g.arc(q[0] - 1, q[1] - 0.6, e[1] * 0.9, Math.PI * 0.15, Math.PI * 0.85, P.outline, 0.8);
    });
    c.restore();
  }
  /** Three dark leaves with chartreuse veins drift UP behind him in a slow spiral (leaves should fall: these don't). */
  function drawAura(g, t) {
    for (let k = 0; k < 3; k++) {
      const ph = ((t * 0.18 + k / 3) % 1 + 1) % 1, a = Math.sin(ph * Math.PI) * 0.6;
      const x = -6 + Math.sin(ph * Math.PI * 3 + k * 2.1) * 13, y = -4 - ph * 44, r = ph * 6 + k;
      g.ctx.save();
      g.ctx.globalAlpha *= a;
      g.ctx.translate(x, y); g.ctx.rotate(r);
      g.ellipse(0, 0, 2.6, 1.2, '#2f3a1a', null);
      g.line(-2.2, 0, 2.2, 0, WRONG, 0.5);
      g.ctx.restore();
    }
  }
  /** The acorn-cap beanie (his only garment), perched between the ears; tumbled beside him when he is down. */
  function drawBeanie(g, x, y, s) {
    g.ellipse(x, y, 5.6 * s, 3.1 * s, P.cap, undefined);
    g.arc(x, y + 0.6 * s, 5.4 * s, Math.PI * 1.05, Math.PI * 1.95, P.capD, 0.9);
    for (let i = 0; i < 5; i++) g.circle(x - 3.4 * s + i * 1.7 * s, y - 0.8 * s + (i % 2) * 1.1 * s, 0.45 * s, P.capD, null);
    g.line(x + 0.4 * s, y - 2.9 * s, x + 1.4 * s, y - 5 * s, P.capD, 1.1);
  }
  /** Painter (custom base): origin at his feet, facing +x. Rotation-safe: a billboard (only the facing mirrors it). */
  function drawGus(g, t, o) {
    o = o || {};
    const c = g.ctx, still = !!o.still, pose = g.pose, lying = o.lying || 0;
    const atk = pose === 'attack', cast = pose === 'cast', hurt = pose === 'hurt';
    const pt = typeof g.poseT === 'number' ? g.poseT : 0.5;
    const n = Math.max(0, Math.min(4, shownCheeks(o)));
    const cap = o.unit && Array.isArray(o.unit.statuses) ? capOf(o.unit) : CAP;
    const walking = typeof o.walk === 'number' && !still;
    const hop = walking ? -Math.abs(Math.sin(o.walk * Math.PI)) * 2.5 : 0;
    const land = walking ? Math.max(0, 1 - Math.abs(Math.sin(o.walk * Math.PI)) * 4) * 0.06 : 0;
    const breath = still ? 0 : Math.sin(t * 2.2) * 0.025;
    const squash = (hurt ? 0.12 : 0) + land;
    if (!still && lying < 0.5) drawAura(g, t);
    c.save();
    c.translate(0, hop);
    c.scale(1 + breath + squash * 0.5, 1 - breath - squash);
    drawTail(g, t, o, walking);
    // the ball (cel shadow low on the back), then the cream belly
    g.shaded(function (p) { p.ellipse(0, -13, 14.5, 13, 0, 0, Math.PI * 2); }, P.fur, { dx: 1.4, dy: -1.8, dark: P.furD, hl: [-4.5, -20.5, 3.4, 1.8, -0.5] });
    g.ellipse(4, -11, 8.5, 9.5, P.belly, null);
    g.arc(4, -11, 8.5, Math.PI * 0.2, Math.PI * 0.8, P.bellyD, 1.2);
    // hind feet poking out at the bottom
    g.ellipse(-4, -1, 4, 2.2, P.furD, undefined);
    g.ellipse(7, -1, 4, 2.2, P.furD, undefined);
    // the emergency acorn in his paws (lifted and glowing wrong while he casts)
    const ax = cast ? 11 : 10.5, ay = cast ? -30 - Math.sin(pt * Math.PI) * 1.5 : -14;
    if (cast) g.glow(ax, ay, 7, WRONG, 0.75);
    g.ellipse(ax, ay + 0.6, 3, 3.6, P.nut, undefined);
    g.ellipse(ax, ay - 2.4, 3.4, 1.6, P.cap, undefined);
    g.circle(ax - 1, ay - 2.5, 0.35, P.capD, null);
    g.circle(ax + 1, ay - 2.2, 0.35, P.capD, null);
    g.circle(ax - 2, ay + (cast ? 2 : 1), 2, P.furL, undefined);
    g.circle(ax + 1.6, ay + (cast ? 2 : 1), 2, P.furL, undefined);
    // the head, merged into the top of the ball (it lunges when he bites)
    const hx = atk ? 3 * Math.sin(Math.PI * pt) : 0, hurtX = hurt ? -1 : 0;
    c.save();
    c.translate(hx + hurtX, 0);
    const wob = hurt && !still ? Math.sin(t * 30) * 0.6 : 0;
    // [QA gus-sprite-tells-hidden] a steep low end: the cheek clears the head's outline from the first acorn, so 0, 1
    // and 2 read apart at board zoom (it used to grow 2.4 + 1.55 per acorn, inside the outline until 2)
    const R = CHEEK_R[Math.round(n)] || CHEEK_R[0];
    // far ear and far cheek (behind the head edge)
    g.poly([[1, -32], [2.5, -38.5], [5, -33]], P.furD, undefined);
    g.ellipse(4.5, -22, R * 0.92, R * 0.86 + wob, g.shade(P.cheek, -0.12), undefined);
    g.shaded(function (p) { p.arc(7, -26, 9, 0, Math.PI * 2); }, P.fur, { dx: 1, dy: -1.2, dark: P.furD, hl: [4, -31, 2.6, 1.3, -0.4] });
    // near ear with a tuft
    g.poly([[5.5, -33], [8, -40], [11, -33.5]], P.fur, undefined);
    g.line(8, -40, 7.2, -42, P.furD, 0.8);
    g.line(8, -40, 9, -41.8, P.furD, 0.8);
    // the near cheek: the acorn meter (CHEEK_R by acorns), a highlight and a blush dot
    g.ellipse(11, -21.5, R, R * 0.92 + wob, P.cheek, undefined);
    g.ellipse(11 - R * 0.3, -21.5 - R * 0.38, R * 0.35, R * 0.2, 'rgba(255,255,255,0.55)', null);
    g.circle(11 + R * 0.25, -21.5 + R * 0.15, Math.max(0.6, R * 0.18), P.blush, null);
    // the muzzle, the nose, the teeth (open mouth when he bites)
    g.circle(13.5, -24, 4, P.furL, undefined);
    g.ellipse(16.6, -25.6, 1.3, 1, P.nose, null);
    if (atk) g.poly([[13.5, -22.4], [17.3, -21.6], [14, -18.6]], '#3a1414', undefined);
    // [QA gus-sprite-tells-hidden] the teeth and the cheek-full acorn take a thin edge (the painter's default stroke,
    // lw 1.9 at scale 1, swallowed their fill whole): at the cap an acorn pokes out under the teeth, held in them
    const lw0 = g.lw;
    g.lw = 0.45;
    if (n >= cap && n > 0) {
      g.ellipse(15.6, -19.4, 1.6, 1.9, P.nut, P.outline);
      g.ellipse(15.6, -20.9, 2.2, 1.05, P.capD, P.outline);
      g.circle(15.1, -21.1, 0.3, P.cap, null);
    }
    const ty = atk ? -22.7 : -22.9, th = atk ? 2.9 : 2.6;
    g.rect(13.9, ty, 1.6, th, P.tooth, P.outline);
    g.rect(15.6, ty + 0.2, 1.6, th, P.tooth, P.outline);
    g.lw = lw0;
    // whiskers, with a twitch every few seconds
    const tw = still ? 0 : (t % 3.2 < 0.4 ? Math.sin(t * 9) * 0.4 : 0);
    g.line(16.5, -24.5, 21, -26 + tw, P.outline, 0.45);
    g.line(16.5, -24, 21.2, -23.6 - tw, P.outline, 0.45);
    // the eye: glossy black, a glint, a pin of chartreuse low-left (something else looks out); wrong while casting
    const ex = 11.5, ey = -27.5;
    if (lying > 0.5) g.arc(ex, ey + 0.4, 2, Math.PI * 1.1, Math.PI * 1.9, P.outline, 0.9);
    else if (hurt) { g.line(ex - 1.6, ey - 1.4, ex + 1.2, ey, P.outline, 1); g.line(ex + 1.2, ey, ex - 1.6, ey + 1.4, P.outline, 1); }
    else if (g.blink) g.arc(ex, ey, 2.2, Math.PI * 0.1, Math.PI * 0.9, P.outline, 1);
    else {
      g.circle(ex, ey, 2.3, cast ? WRONG : P.eye, undefined);
      if (cast) g.ellipse(ex, ey, 0.5, 1.8, P.eye, null);
      g.circle(ex + 0.7, ey - 0.8, 0.7, P.glint, null);
      g.circle(ex - 1, ey + 1, 0.4, WRONG, null);
    }
    // the beanie: on his head, or tumbled beside him when he is down
    if (lying > 0.5) drawBeanie(g, -8, -3, 0.9); else drawBeanie(g, 6.6, -34.6, 1);
    c.restore();
    c.restore();
  }
  /** Underlay: a dark green-violet murk pool, a faint pulsing rim, root tendrils and tiny eyes that blink in it. */
  function woodsMurk(g, t, o) {
    o = o || {};
    const still = !!o.still, cast = g.pose === 'cast';
    g.ellipse(0, 0.5, 17, 4.5, P.murkV, null);
    g.ellipse(0, 0.5, 15.5, 3.8, P.murk, null);
    if (still) return;
    const rim = 0.12 + 0.06 * Math.sin(t * 2);
    g.ellipse(0, 0.5, 17, 4.5, null, g.rgba(WRONG, rim));
    [[-14, 1.4, -19, 2.6], [12, 2.2, 18, 3.8], [3, 3.8, 7, 6]].forEach(function (r) {
      g.ctx.beginPath(); g.ctx.moveTo(r[0], r[1]); g.ctx.quadraticCurveTo((r[0] + r[2]) / 2, r[3] + 1.2, r[2], r[3]);
      g.ctx.strokeStyle = 'rgba(74,58,36,0.75)'; g.ctx.lineWidth = 0.6; g.ctx.stroke();
    });
    [[-8, 1.5], [9, 0.6], [1, 2.6]].forEach(function (e, k) {
      const open = cast ? 1 : Math.sin(t * 0.9 + k * 1.7) > 0.3 ? 1 : 0;
      if (open) almond(g.ctx, e[0], e[1], 2.6, 0.8);
    });
  }
  const GUS_SPRITE = { base: 'custom', look: 'gus', scale: 1, height: 38, width: 38, headY: -27,
    portrait: { x: 7, y: -25, r: 13 }, palette: P, draw: drawGus, underlay: woodsMurk };

  // ---- status -------------------------------------------------------------------------------------------------
  DD.registerStatus({
    id: CHEEKS, name: 'Cheekful of Acorns', icon: '🌰', color: '#b47a3e', type: 'buff', stacking: 'stack', maxStacks: HOLD_CAP,
    decay: 'never', defaultTurns: -1,
    showStacks: true,   // h19 D9 (H19-SEATS landed it): one acorn reads "1" on the chip and over him
    desc: function (st) {
      const cap = (st && st.data && st.data.cap) || CAP, n = Math.max(0, (st && st.stacks) || 0);
      // [QA gus-cap-promises] full cheeks: the next drop bonks off, wasted
      return 'Cheeks: ' + n + ' / ' + cap + ' acorns. Skills that say Eat eat them; ' + (n >= cap ?
        'full: the next one bonks off his head, wasted. Eat one first.' : 'another falls in at the start of each of his turns.');
    },
  });

  // ---- basic attack -------------------------------------------------------------------------------------------
  DD.registerSkill({
    id: INCISOR, name: 'Incisor Decision', owner: HERO, icon: '😬', kind: 'attack', tags: ['melee', 'bite'],
    ap: 1, cooldown: 0,
    levels: [{ dmg: 5, mad: 2 }],
    target: { type: 'unit', range: [1, 1], filter: 'enemy' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to an adjacent foe (' + (L.dmg + L.mad) + ' if it is Confused).'; },
    flavor: 'Squirrel teeth never stop growing. Neither does Gus.',
    aiScore: incisorQuick,
    execute: function (ctx) {
      const u = ctx.user, f = ctx.targetUnit;
      if (!foeOf(u, f)) return;
      const confused = A().hasStatus(f, 'confused');
      DD.FX.lunge(u, f);
      DD.FX.sound('hit');
      if (confused) DD.FX.text(f, 'Snack-ident!', { color: WRONG, size: 14 });
      // an attack of opportunity's +mad comes through modifyOpportunity (o.flat), so estimates read it once
      A().damage(u, f, ctx.L.dmg + (confused && !ctx.opportunity ? ctx.L.mad : 0), { tags: ['melee', 'bite'] });
    },
  });

  // ---- starters ------------------------------------------------------------------------------------------------
  DD.registerSkill({
    id: 'gus_root_canal', name: 'Root Canal', owner: HERO, icon: '🦷', kind: 'attack', tags: ['ranged', 'roots', 'weak', 'eldritch', 'acorn'],
    ap: 1, cooldown: 1,
    levels: [{ acorns: 1, dmg: 5, range: 4, turns: 1 }, { acorns: 1, dmg: 6, range: 5, turns: 1 }, { acorns: 1, dmg: 8, range: 5, turns: 2 }],
    target: { type: 'unit', range: function (L) { return [1, L.range]; }, los: false, filter: 'enemy' },
    canUse: canEat(1),
    desc: function (L, user) {
      return 'Eat an acorn: roots burst up under a foe within ' + reach(user, 'gus_root_canal', L, L.range) + ' (no sight needed): ' + L.dmg +
        ' damage, and it is Weakened for ' + plural(L.turns, 'turn') + '.';
    },
    flavor: 'The roots go in. The roots come out. Nobody bites properly for a while.',
    aiScore: stressQuick, autoplayValue: eatValue,
    execute: function (ctx) {
      const u = ctx.user, f = ctx.targetUnit;
      if (!foeOf(u, f)) return;
      fxCustom(f, 700, drawRoots);
      DD.FX.sound('hit');
      A().damage(u, f, ctx.L.dmg, { tags: ['roots', 'eldritch'] });
      if (active(f)) A().addStatus(f, 'weak', { turns: ctx.L.turns }, u);
      DD.FX.text(f, 'ROOT CANAL!', { color: WRONG, size: 14 });
      // [QA voice-1] no pronoun after an engine-supplied name (Grimble is he, Dr. Iris and Granny Gristle she)
      A().log('Roots burst up under ' + f.name + '. No proper biting for a while.', 'hero');
    },
  });

  DD.registerSkill({
    id: 'gus_whispers', name: 'Don\'t Listen to the Trees', owner: HERO, icon: '🍂', kind: 'spell',
    tags: ['psychic', 'aoe', 'confuse', 'eldritch', 'acorn'], ap: 2, cooldown: 2,
    levels: [{ acorns: 1, dmg: 4, r: 2 }, { acorns: 1, dmg: 5, r: 2 }, { acorns: 1, dmg: 6, r: 3 }],
    target: { type: 'self' }, area: { shape: 'circle', size: function (L) { return L.r; } },
    canUse: canEat(1),
    desc: function (L) {
      return 'Eat an acorn: the trees whisper to every foe within ' + L.r + ' of you: ' + L.dmg + ' psychic damage, and each is Confused for 1 turn.';
    },
    flavor: 'They\'re saying something about you. Something old. Something about acorns.',
    aiScore: stressQuick, autoplayValue: eatValue,
    execute: function (ctx) {
      const u = ctx.user;
      if (!active(u)) return;
      DD.FX.particles(u, { kind: 'leaves', count: 14, color: '#2f3a1a' });
      DD.FX.text(u, '*rustling intensifies*', { color: WRONG, size: 13 });
      DD.FX.sound('magic', { vol: 0.7 });
      const foes = ctx.foes.slice().sort(byPos);
      foes.forEach(function (f, i) {
        if (!foeOf(u, f)) return;
        A().damage(u, f, ctx.L.dmg, { element: 'psychic', tags: ['psychic', 'whisper'] });
        if (active(f)) A().addStatus(f, 'confused', { turns: 1 }, u);
        if (!A().simulating) DD.FX.text(f, ['psst', '...', 'they know'][i % 3], { color: WRONG, size: 11, parallel: true });
      });
      A().maybeBark(u, 'whisper', 0.3);
      A().log('The trees start whispering to everyone near ' + u.name + '. Nobody should listen. Everybody listens.', 'hero');
    },
  });

  // ---- the pool --------------------------------------------------------------------------------------------------
  DD.registerSkill({
    id: 'gus_hollow', name: 'The Hollow Hungers', owner: HERO, icon: '👄', kind: 'attack', tags: ['eldritch', 'bite', 'root', 'acorn'],
    ap: 2, cooldown: 2,
    levels: [{ acorns: 2, dmg: 12 }, { acorns: 2, dmg: 15 }, { acorns: 2, dmg: 18 }],
    target: { type: 'unit', range: [1, 3], los: true, filter: 'enemy' },
    canUse: canEat(2),
    desc: function (L, user) {
      return 'Eat 2 acorns: the floor under a foe within ' + reach(user, 'gus_hollow', L, 3) + ' opens and bites: ' + L.dmg + ' damage, and it is Rooted for 1 turn.';
    },
    flavor: 'Floors shouldn\'t have teeth. This one does, and it has been waiting.',
    aiScore: stressQuick, autoplayValue: eatValue,
    execute: function (ctx) {
      const u = ctx.user, f = ctx.targetUnit;
      if (!foeOf(u, f)) return;
      fxCustom(f, 850, drawMouth);
      DD.FX.shake(5, 260);
      DD.FX.sound('crit');
      A().damage(u, f, ctx.L.dmg, { tags: ['bite', 'hollow', 'eldritch'] });
      if (active(f)) A().addStatus(f, 'root', { turns: 1 }, u);
      DD.FX.text(f, 'CHOMP.', { color: WRONG, size: 15 });
      A().log('The floor opens under ' + f.name + ' and bites. Floors shouldn\'t do that.', 'hero');
    },
  });

  DD.registerSkill({
    id: 'gus_binge', name: 'All You Can Eat', owner: HERO, icon: '🍽️', kind: 'attack', tags: ['psychic', 'aoe', 'acorn', 'binge'],
    ap: 2, cooldown: 2, eatsAll: true,
    // key `per`, not `dmg`: AutoPlay's quick estimate would read it as the hit (the exact pass dry-runs the meal)
    levels: [{ per: 3, r: 1 }, { per: 4, r: 1 }, { per: 4, r: 2 }],
    target: { type: 'self' }, area: { shape: 'circle', size: function (L) { return L.r; } },
    canUse: function (ctx) {
      const u = ctx && ctx.user;
      if (!u || !inFight(u)) return true;
      if (cheeks(u) < 1) return 'Nothing to eat: his cheeks are empty.';
      const r = (ctx.L && ctx.L.r) || 1;
      return S().units.some(function (f) { return foeOf(u, f) && dist(f, u) <= r; }) ? true : 'Nobody close enough to watch.';
    },
    desc: function (L, user) {
      const who = L.r > 1 ? 'each foe within ' + L.r + ' of you' : 'each foe next to you';
      let s = 'Eat every acorn in your cheeks (at least 1): ' + who + ' takes ' + L.per + ' psychic damage per acorn eaten.';
      if (user && inFight(user) && active(user)) { const n = cheeks(user); s += ' (now: ' + plural(n, 'acorn') + ', ' + n * L.per + ' each)'; }
      return s;
    },
    flavor: 'He was saving those. He was saving them for exactly this.',
    aiScore: function (ctx) { return stressQuick(ctx) + bingeQuick(ctx); },
    autoplayValue: eatValue,
    execute: function (ctx) {
      const u = ctx.user;
      if (!active(u)) return;
      const n = ctx.paid ? ctx.paid.gusAte || 0 : ctx.rpEcho ? mealOf(u, 'gus_binge') : 0;
      if (!(n > 0)) return;
      if (!A().simulating) {
        for (let i = 0; i < n; i++) DD.FX.text(u, 'CHOMP', { color: SNACK, size: 15, ms: 120 });
        crumbs(u, 6 * n);
        (ctx.tiles || []).forEach(function (p) { DD.FX.tile(p.x, p.y, 'glow', { color: WRONG, parallel: true }); });
      }
      DD.FX.shake(3 + n, 240);
      A().bark(u, 'binge');
      ctx.foes.slice().sort(byPos).forEach(function (f) {
        if (foeOf(u, f)) A().damage(u, f, ctx.L.per * n, { element: 'psychic', tags: ['psychic', 'binge'] });
      });
      A().log(u.name + ' eats everything. The woods scream with delight.', 'hero');
    },
  });

  DD.registerSkill({
    id: 'gus_hole', name: 'Down the Squirrel Hole', owner: HERO, icon: '🕳️', kind: 'move', tags: ['teleport', 'confuse', 'eldritch', 'acorn'],
    ap: 1, cooldown: function (L) { return L.cd; },
    levels: [{ acorns: 1, range: 4, cd: 2 }, { acorns: 1, range: 5, cd: 2 }, { acorns: 1, range: 5, cd: 1 }],
    target: {
      type: 'tile', range: function (L) { return [1, L.range]; }, los: false, filter: 'empty',
      canTarget: function (ctx) {
        const p = ctx && ctx.target, u = ctx && ctx.user;
        if (!p) return true;
        return !G().isDrop(p.x, p.y) && !G().hazardAt(p.x, p.y, u) ? true : 'The woods won\'t put you there.';
      },
    },
    canUse: function (ctx) {
      const ok = canEat(1)(ctx);
      if (ok !== true) return ok;
      const u = ctx && ctx.user;
      if (!u || !inFight(u) || !A().cantMove(u)) return true;
      // [QA gus-hole-engulfed-wording] name only a cause he has: Rooted, else any other hold (Engulfed, a grapple)
      return (A().hasStatus(u, 'root') ? 'Rooted.' : 'Can\'t move right now.') + ' Even the roots won\'t take you.';
    },
    desc: function (L, user) {
      return 'Eat an acorn: tunnel to an empty tile within ' + reach(user, 'gus_hole', L, L.range) +
        ' (no sight needed). Foes next to the tile you left are Confused for 1 turn.';
    },
    flavor: 'He fits. Nobody knows how he fits. The hole keeps talking after he leaves.',
    aiScore: stressQuick, autoplayValue: eatValue,
    execute: function (ctx) {
      const u = ctx.user, to = ctx.target;
      if (!active(u) || !to) return;
      const from = { x: u.x, y: u.y };
      DD.FX.particles(from, { kind: 'dust', count: 10 });
      if (!A().teleport(u, to.x, to.y, { fx: false })) return;
      DD.FX.jump(u, from, to, { ms: 300 });
      DD.FX.particles(to, { kind: 'dust', count: 10, parallel: true });
      fxCustom(from, 1100, drawHole);
      DD.FX.text(u, 'Pop!', { color: SNACK, size: 14 });
      const s = S();
      (s ? s.units : []).filter(function (f) { return foeOf(u, f) && dist(f, from) === 1; }).sort(byPos).forEach(function (f) {
        A().addStatus(f, 'confused', { turns: 1 }, u);
        if (!A().simulating) DD.FX.text(f, '...psst...', { color: WRONG, size: 11, parallel: true });
      });
      A().maybeBark(u, 'hole', 0.5);
      A().log(u.name + ' goes down a squirrel hole and pops up somewhere else. The hole keeps whispering.', 'hero');
    },
  });

  DD.registerSkill({
    id: 'gus_eyes', name: 'Too Many Eyes', owner: HERO, icon: '👁️', kind: 'spell', tags: ['mark', 'aoe', 'ranged', 'eldritch', 'acorn'],
    ap: 1, cooldown: 1,
    levels: [{ acorns: 1, mark: 3 }, { acorns: 1, mark: 4 }, { acorns: 1, mark: 5 }],
    target: { type: 'tile', range: [1, 5], los: true, filter: 'any' }, area: { shape: 'circle', size: 1 },
    canUse: canEat(1),
    desc: function (L, user) {
      return 'Eat an acorn: eyes open in the bark around a tile within ' + reach(user, 'gus_eyes', L, 5) + '. Each foe on or next to it is Marked ' +
        L.mark + ' (the next damage it takes is +' + L.mark + ').';
    },
    flavor: 'The bark opens its eyes. All of them. The forest would like a word.',
    aiScore: stressQuick, autoplayValue: eatValue,
    execute: function (ctx) {
      const u = ctx.user;
      if (!active(u)) return;
      if (!A().simulating) (ctx.tiles || []).forEach(function (p) { DD.FX.tile(p.x, p.y, 'pulse', { color: WRONG, parallel: true }); });
      DD.FX.sound('debuff');
      ctx.foes.slice().sort(byPos).forEach(function (f) {
        if (!foeOf(u, f)) return;
        fxCustom(f, 900, drawEye);
        A().addStatus(f, 'marked', { stacks: ctx.L.mark }, u);
      });
      A().log('Eyes open in the bark. Every foe there is being watched.', 'hero');
    },
  });

  DD.registerSkill({
    id: 'gus_tree', name: 'The Tree That Isn\'t There', owner: HERO, icon: '🌳', kind: 'attack', tags: ['aoe', 'ranged', 'forage'],
    ap: 2, cooldown: 2,
    levels: [{ dmg: 4, gain: 1 }, { dmg: 5, gain: 1 }, { dmg: 6, gain: 1 }],
    target: { type: 'tile', range: [1, 4], los: true, filter: 'any' }, area: { shape: 'circle', size: 1 },
    desc: function (L, user) {
      // [QA gus-cap-promises / voice-8] at full cheeks nothing lands: the condition is in the text
      return 'Acorns rain on every foe on or next to a tile within ' + reach(user, 'gus_tree', L, 4) + ': ' + L.dmg + ' damage each. One lands in your cheeks ' +
        'if there\'s room (+' + L.gain + ' acorn).';
    },
    flavor: 'Gus shakes it. It isn\'t there. Acorns fall anyway. Best not to look up.',
    autoplayValue: treeValue,
    execute: function (ctx) {
      const u = ctx.user, p = ctx.target;
      if (!active(u) || !p) return;
      fxCustom(p, 900, drawTree);
      if (!A().simulating) (ctx.tiles || []).forEach(function (q, i) { DD.FX.projectile({ x: q.x, y: q.y, h: (DD.FX.tileH ? DD.FX.tileH(q.x, q.y) : 0) + 4 }, q, { kind: 'rock', color: CRUMB, arc: 0, parallel: i > 0 }); });
      ctx.foes.slice().sort(byPos).forEach(function (f) { if (foeOf(u, f)) A().damage(u, f, ctx.L.dmg, { tags: ['acorn', 'forage'] }); });
      if (!active(u)) return;
      const have = cheeks(u);
      if (have < capOf(u)) {
        if (!A().simulating) DD.FX.projectile(p, u, { kind: 'rock', color: CRUMB });
        setCheeks(u, have + (ctx.L.gain || 1));
        DD.FX.text(u, '+🌰', { color: SNACK, size: 14 });
      } else DD.FX.text(u, '(cheeks full)', { color: SNACK, size: 12 });
      A().log(u.name + ' shakes the tree that isn\'t there. Acorns fall anyway.', 'hero');
    },
  });

  DD.registerSkill({
    // 😠, not the addendum's 😤: that is Come At Me, Bro's (a generic skill's icon is its own on the action bar)
    id: 'gus_hangry', name: 'Hangry', owner: HERO, icon: '😠', kind: 'buff', tags: ['self', 'empower'],
    ap: 0, cooldown: function (L) { return L.cd; },
    levels: [{ cd: 3 }, { cd: 2 }, { cd: 2, inspire: 1 }],
    target: { type: 'self' },
    canUse: function (ctx) {
      const u = ctx && ctx.user;
      if (!u || !inFight(u)) return true;
      return cheeks(u) > 0 ? 'Not hangry yet: his cheeks aren\'t empty.' : true;
    },
    desc: function (L) {
      return 'Only with empty cheeks: you are Empowered (your next damaging skill deals +50% damage)' +
        (L.inspire ? ' and Inspired until the end of this turn (+25% damage).' : '.');
    },
    flavor: 'You wouldn\'t like him when he\'s hungry. He\'s hungry every eleven minutes.',
    execute: function (ctx) {
      const u = ctx.user;
      if (!active(u)) return;
      A().addStatus(u, 'empowered', {}, u);
      if (ctx.L.inspire) A().addStatus(u, 'inspired', { turns: 1, thisTurn: true }, u);
      DD.FX.particles(u, { kind: 'smoke', count: 8, color: '#ff6a4a' });
      DD.FX.text(u, 'HANGRY', { color: '#ff6a4a', size: 18 });
      DD.FX.sound('debuff');
      A().bark(u, 'hangry');
      A().log(u.name + ' is out of acorns, and out of patience.', 'hero');
    },
  });

  DD.registerSkill({
    // 🎁, not the addendum's 🤲: he never has "hands" (the user, Nov 18), and 🤲 is the Ambidextrous Blessing's icon
    id: 'gus_have_one', name: 'Fine, Have One', owner: HERO, icon: '🎁', kind: 'buff', tags: ['haste', 'ally', 'share'],
    ap: 1, cooldown: function (L) { return L.cd; }, shares: true,
    levels: [{ acorns: 1, range: 1, cd: 3 }, { acorns: 1, range: 2, cd: 3 }, { acorns: 1, range: 3, cd: 2 }],
    target: {
      type: 'unit', range: function (L) { return [1, L.range]; }, los: true, filter: 'ally',
      canTarget: function (ctx) {
        const a = ctx && ctx.targetUnit;
        if (!a) return true;
        if (!active(a)) return 'They can\'t chew right now.';
        return A().hasStatus(a, 'haste') ? 'Already Hasted.' : true;
      },
    },
    canUse: canEat(1, 'Needs an acorn to share (his cheeks hold {have}).'),
    desc: function (L, user) {
      return 'Give an ally ' + (L.range > 1 ? 'within ' + reach(user, 'gus_have_one', L, L.range) : 'next to you') +
        ' one of your acorns (reluctantly): it is Hasted for its next turn (+1 AP).';
    },
    flavor: 'It\'s his second-favourite acorn. He will bring this up at your wedding.',
    autoplayValue: shareValue,
    execute: function (ctx) {
      const u = ctx.user, a = ctx.targetUnit;
      if (!active(u) || !active(a) || G().hostile(u, a)) return;
      if (!A().simulating) DD.FX.projectile(u, a, { kind: 'flask', color: '#c99a52' });
      A().addStatus(a, 'haste', { turns: 1 }, u);
      DD.FX.text(a, '🌰 +1 AP', { color: SNACK, size: 14 });
      A().bark(u, 'share');
      A().log(u.name + ' shares an acorn with ' + a.name + '. This has never happened before.', 'hero');
    },
  });

  // ---- signature ----------------------------------------------------------------------------------------------------
  DD.registerSkill({
    id: 'gus_acorn', name: 'The Acorn That Should Not Be', owner: HERO, icon: '☄️', kind: 'attack', tags: ['aoe', 'eldritch', 'confuse', 'signature'],
    ap: 2, cooldown: 0, hype: 100,
    levels: [{ dmg: 16 }],
    target: { type: 'tile', range: [0, 5], los: false, filter: 'any' }, area: { shape: 'circle', size: 2 },
    desc: function (L, user) {
      return 'A colossal acorn with far too many eyes drops on a tile within ' + reach(user, 'gus_acorn', L, 5) + ' (no sight needed): every foe within 2 of it takes ' +
        L.dmg + ' damage and is Confused for 1 turn. Then your cheeks fill up.';
    },
    flavor: 'It fell from a tree that isn\'t there onto a world that wasn\'t ready. Gus takes a bite.',
    // the refill is spent next turn: half its worth (the big-moment gate still decides when)
    autoplayValue: function (ctx) { const u = ctx && ctx.user; return u ? 0.5 * gainWorth(u, capOf(u) - cheeks(u)) : 0; },
    execute: function (ctx) {
      const u = ctx.user, p = ctx.target;
      if (!active(u) || !p) return;
      DD.FX.banner('THE ACORN THAT SHOULD NOT BE', { sub: 'It has eyes. Why does it have eyes?', color: WRONG });
      DD.FX.sound('swoop');
      fxCustom(p, 1400, drawGiantAcorn);
      DD.FX.flash('#3a1f3f', 220);
      DD.FX.shake(9, 420);
      DD.FX.sound('explosion');
      DD.FX.sound('evil_chord', { vol: 0.5 });
      ctx.foes.slice().sort(byPos).forEach(function (f) {
        if (!foeOf(u, f)) return;
        A().damage(u, f, ctx.L.dmg, { tags: ['aoe', 'eldritch', 'signature'] });
        if (active(f)) A().addStatus(f, 'confused', { turns: 1 }, u);
      });
      if (!active(u)) return;
      if (!A().simulating) for (let i = 0; i < 3; i++) DD.FX.projectile(p, u, { kind: 'rock', color: CRUMB, parallel: i > 0 });
      const before = cheeks(u), cap = capOf(u);
      setCheeks(u, cap);
      if (cap > before) DD.FX.text(u, '+' + '🌰'.repeat(cap - before), { color: SNACK, size: 15 });
      A().bark(u, 'burp');
      A().log('THE ACORN THAT SHOULD NOT BE lands. ' + u.name + ' takes a bite out of what\'s left. Then he burps.', 'hero');
    },
  });

  // ---- passive: The Woods Provide ---------------------------------------------------------------------------------
  /**
   * The passive's text with his live numbers: desc is the base text (null: 3 / 1 / 3) for party select, the Hall and
   * recruit; liveDesc(who) (a combat unit or a RunHero) is what DD.UI.passiveText shows for this Phat Gus (his items).
   */
  function passiveDesc(user) {
    return 'An acorn falls into Phat Gus\'s cheeks at the start of each of his turns (they hold ' + capOf(user) + '; he starts with ' +
      startOf(user) + '). Stress eating: once per turn, if a foe is next to him after he eats, he heals ' + stressOf(user) + ' HP.';
  }
  const PASSIVE = {
    name: 'The Woods Provide',
    desc: passiveDesc(null),
    liveDesc: passiveDesc,   // fix:polish (gus-passive-live-numbers): the HUD, the party sheet and the inspect panel
    hooks: {
      onCombatStart: start,
      onTurnStart: drop,
      onCostPaid: paid,
      onSkillUsed: afterMeal,
      modifyOpportunity: incisorOpportunity,
      onStatusRemoved: confiscated,
    },
  };

  // ---- hero ------------------------------------------------------------------------------------------------------------
  DD.registerHero({
    id: HERO, name: 'Phat Gus', epithet: 'the Unfathomable', race: 'Squirrel (Mostly Cheeks)', cls: 'Snackromancer',
    role: 'Eldritch control · runs on acorns', complexity: 2,
    blurb: 'A very round squirrel with weird eldritch forest powers and cheeks that are bigger on the inside. Acorns fall ' +
      'into them from a tree that isn\'t there, and every one Phat Gus eats lets the deep woods whisper, bite and stare ' +
      'through him. He stress-eats when monsters get close, and he does not share (usually).',
    color: PLUM, unlock: null, pronoun: 'he',
    stats: { hp: 30, ap: 3, mov: 4, armor: 0, init: 2 }, growth: { hp: 4 }, flags: {}, resist: {},
    sprite: GUS_SPRITE,
    basic: INCISOR, signature: 'gus_acorn',
    passive: PASSIVE,
    startingSkills: ['gus_whispers', 'gus_root_canal'],
    skillPool: ['gus_whispers', 'gus_root_canal', 'gus_hollow', 'gus_binge', 'gus_hole', 'gus_eyes', 'gus_tree', 'gus_hangry', 'gus_have_one'],
    summons: [],
    barks: {
      select: ['Phat Gus. With a P-H. It stands for Pretty Hungry.', 'Snacks packed. Cheeks loaded. Woods... listening.',
        'Mmf. Hang on. Chewing. Okay. Ready.', 'The woods say hi. I\'d wave back. Don\'t.', 'Got acorns? No? That\'s fine. They come to me.'],
      start: ['Right. Snack first, then the end of all things.', 'Everybody relax. The trees are just looking.',
        'Everybody stay calm. I brought snacks. They\'re for me.', 'Something under this floor is hungry. Relatable.',
        'Okay, woods. Do the thing. The creepy thing.'],
      move: ['Rolling, rolling, rolling.', 'I don\'t climb anymore. I get climbed.', 'On my way. Is that a crumb? It\'s a crumb.',
        'Every step burns a calorie. Very rude of it.', 'Don\'t rush me. Gravity and I have an arrangement.'],
      kill: ['Nothing personal. You were between me and lunch.', 'The woods say thank you. Please don\'t ask what for.',
        'Down you go. The roots will take it from here.', 'Nobody touches the acorns. NOBODY.', 'And THAT is why you don\'t poke the round one.'],
      hurt: ['Ow! Not the cheeks! There\'s food in there!', 'Hey! That\'s prime squirrel you\'re bruising!', 'Careful! I\'m carrying groceries!',
        'Rude! I was MID-CHEW!'],
      lowhp: ['Not like this. Not on an empty stomach.', 'Woods? Now would be a great time. Woods?', 'Things are bad. I\'m down to my emergency acorn.',
        'Okay. Okay. Deep breaths. Deep snacks.'],
      downed: ['Bury me... somewhere I\'ll forget...', 'Tell the acorns... I\'m sorry I ate them...', 'The trees... are so... loud...', 'Save... my... cheeks...'],
      revive: ['I\'m up! Did anyone eat my acorns? I counted them.', 'The woods spat me back out. Said I was too much.',
        'Thanks. I\'d offer you a snack, but no.', 'Back! Hungrier than ever, if that\'s possible. It is.'],
      ally_down: ['{downed}! Get up! I\'ll share an acorn! Half an acorn!', 'Get up, {downed}! There\'s still food!',
        'Someone\'s down! This calls for stress eating.', 'Woods! WOODS! A little help over here!'],
      levelup: ['I\'ve grown! Mostly outward.', 'Bigger cheeks. Bigger dreams.', 'Stronger, wiser, rounder.', 'The woods taught me something. It was horrible. Anyway.'],
      victory: ['Victory! Snack break! Mandatory snack break!', 'Good fight. Who\'s got crisps?', 'The woods are pleased. They\'d like you to leave now.',
        'We won! Somebody check those goblins for trail mix.'],
      idle: ['Betty, that\'s a chair. You\'re eating a chair. I have STANDARDS.', 'Mayor Buga, you smell like breakfast. I mean that as a compliment.',
        'Pebbles, every time you yell SQUIRREL, I drop an acorn.', 'Benedick, your lettuce is safe with me. The woods? Less so.',
        'Ellaria, your trees are lovely. Mine have more eyes.', 'Anybody else hear the floor whispering? Just me? Cool.'],
      signature: ['Behold! The Acorn That Should Not Be!', 'I\'ve been saving this one since the dawn of time.', 'Look up. No, further. FURTHER.',
        'It\'s an acorn. It has eyes. Don\'t ask.', 'Open wide, woods. Dinner\'s on me.'],
      // [QA voice-4] his own openers (not Ellaria's "Scoot over", Betty's "coming through", Benedick's "After you")
      swap: ['Budge up, {ally}. The woods want me over there.', 'You first, {ally}? No. Me first. I\'m hungrier.',
        'Swap, {ally}? Sure. You were blocking the snacks.'],
      eat: ['Om nom nom.', 'Mmf. Crunchy.', 'Acorn o\'clock.', 'Chew, chew, eldritch.'],
      stress: ['I eat when I\'m nervous. I\'m always nervous.', 'Big scary foe. Big comfort snack.', 'Don\'t look at me while I eat! ...Okay, look.',
        'Mmf. Feeling better. You, less so.'],
      bonk: ['Ow! Cheeks are full! Bad tree!', 'Mmf! No room! Mmmf!', 'BONK. Okay, okay, I\'ll eat some.'],
      hangry: ['NOBODY. TALK. TO ME.', 'I\'m not mad. I\'m EMPTY.', 'Out of acorns. Out of patience.'],
      binge: ['ALL OF IT. I\'M EATING ALL OF IT.', 'Second breakfast! Third breakfast! FOURTH!', 'No regrets. Okay, some regrets. No.'],
      share: ['Fine. FINE. Have one. Just one. Don\'t make it weird.', 'Here. My second-favourite acorn. Treasure it.',
        'I\'m sharing. Write it down. It won\'t happen again.'],
      hole: ['Down I go! Save my seat!', 'If I\'m not back, I\'m in the roots.', 'Back in a sec. Don\'t eat anything.'],
      whisper: ['Listen. The trees have notes.', 'Shh. They\'re saying your name.', 'Don\'t listen to them. They lie. Mostly about acorns.'],
      burp: ['...excuse me.', 'Pardon. That one had a forest in it.'],
      confiscated: ['My acorns! You can\'t confiscate food!', 'Those were EVIDENCE?! They were LUNCH!'],
      snackbowl: ['Protect the snack bowl? Finally, a mission I understand.', 'A bowl of snacks I\'m not allowed to eat. This is torture.'],
    },
  });

  // ---- hero items (legendary weapon, rare trinket, rare armor) ------------------------------------------------------------
  DD.registerItem({
    id: NOMICON, name: 'The Nom-Nom-Nomicon', slot: 'weapon', rarity: 'legendary', icon: '📖', hero: HERO,
    stats: { dmg: 0.1 },
    desc: '+10% damage. Whenever Phat Gus eats, the book reads the recipe aloud: after that skill, the nearest awake foe within ' + NOMICON_RANGE +
      ' takes ' + NOMICON_DMG + ' psychic damage per acorn eaten.',
    flavor: 'A forbidden cookbook bound in bark. Every recipe is acorns. Some of the recipes are looking at you.',
    hooks: {},   // the passive's onSkillUsed reads it (after stress eating; never on an echo or an object hit)
  });
  DD.registerItem({
    id: HOLDING, name: 'Cheeks of Holding', slot: 'trinket', rarity: 'rare', icon: '👝', hero: HERO,
    stats: {},
    desc: 'Phat Gus\'s cheeks hold ' + HOLD_CAP + ' acorns, and he starts each fight with ' + HOLD_START + '.',
    flavor: 'Bigger on the inside. Nobody has found the bottom. Two adventurers went looking. They\'re fine. They\'re in there.',
    hooks: {},   // capOf / startOf read it
  });
  DD.registerItem({
    id: COAT, name: 'Winter Coat (Built In)', slot: 'armor', rarity: 'rare', icon: '🧥', hero: HERO,
    stats: { hp: 5 },
    desc: '+5 max HP. Stress eating heals Phat Gus ' + COAT_HEAL + ' more HP (' + (STRESS_HEAL + COAT_HEAL) + ' in all).',
    // [QA voice-9] "fat" is his word only (DESIGN §6): he says it, the narrator doesn't
    flavor: '"It\'s not fat. It\'s a winter coat. It\'s built in." He has been getting ready for winter since birth.',
    hooks: {},   // stressOf reads it: the same heal made bigger (tests/sim/sim.js WORN['lift:gus'])
  });

  // ---- loading-screen tips ------------------------------------------------------------------------------------------------
  DD.registerNarration('tips', [
    'An acorn falls into Phat Gus\'s cheeks every turn and his Eat skills eat them. They hold 3: spend one before the next lands.',
    'Phat Gus heals when he eats with a foe next to him, once a turn. Stress eating is a valid tactic.',
    'Confused foes swing a quarter turn off and may hit their friends. Phat Gus bites them for 7.',
  ]);

  // ---- test / debug API -----------------------------------------------------------------------------------------------------
  DD.Gus = {
    HERO: HERO, CHEEKS: CHEEKS, CAP: CAP, START: START, HOLD_CAP: HOLD_CAP, HOLD_START: HOLD_START, STRESS_HEAL: STRESS_HEAL,
    COAT_HEAL: COAT_HEAL, NOMICON_DMG: NOMICON_DMG, NOMICON_RANGE: NOMICON_RANGE, ACORN_VALUE: ACORN_VALUE,
    GUS_SPRITE: GUS_SPRITE, WHISPERS: WHISPERS, PASSIVE: PASSIVE,
    cheeks: cheeks, capOf: capOf, startOf: startOf, stressOf: stressOf, setCheeks: setCheeks, drop: drop, canEat: canEat,
    mealOf: mealOf, stressEat: stressEat, nomiconTarget: nomiconTarget, priceOf: priceOf, gainWorth: gainWorth, eatValue: eatValue,
    stressQuick: stressQuick, shareValue: shareValue, treeValue: treeValue, incisorQuick: incisorQuick, bingeQuick: bingeQuick, shownCheeks: shownCheeks,
    passiveDesc: passiveDesc, adjacentFoesAt: adjacentFoesAt,
    painters: { drawGus: drawGus, woodsMurk: woodsMurk, drawRoots: drawRoots, drawMouth: drawMouth, drawHole: drawHole, drawEye: drawEye,
      drawTree: drawTree, drawGiantAcorn: drawGiantAcorn },
  };
})();
