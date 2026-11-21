/* Dungeons and Degenerates — js/data/bosses/coven.js
 * Act IV door 4 (V3, plan .tmp/v3/design.md §3.4, §5.3, §6.2): THE COVEN, encounter 'boss_coven' ("Tea with the Coven",
 * theme a4_cottage, 14 × 13). Three hags, one turn, one cauldron (squad rules of plan §3.0.1: elites with no `boss`
 * field, the encounter names the squad in objective.bossIds; 320 HP in all):
 *   Cousin Mildred (night hag, she) — holds the Eye and runs the Coven's turn (E1: Granny and Brine are actsWithOwner
 *     units owned by her, so they act on her initiative entry, right after her). Bedtime Hex (Asleep until the end of the
 *     Coven's next turn), Night Terror (10 psychic, 20 on a sleeper); flies on Granny's broom. Her death drops the Eye:
 *     the others roll their own entries from the next round.
 *   Granny Gristle (green hag, she) — the cook and the bruiser: heads for a Stirring Spot, stirs, fights from it; Cheek
 *     Pinch (10 + Root), Eat Your Greens (8 + bog).
 *   Auntie Brine (sea hag, she) — the puller: Undertow (9 + pull 2, heroes off the spots first), I Was Beautiful Once
 *     (Confused within 2); she ends her move where her Hex Threads cross the most heroes.
 * Shared (fight rule cov_coven, a live chip "Brew N/6 · threads N"): Stir the Pot (a hag who starts her turn on a
 * Stirring Spot stirs first: Brew +1, she sips 6 HP; then she acts), the Family Recipe: Hero Pie wind-up at Brew 6 (23 to
 * every hero and hero summon + Slowed; interrupting the cook drops the Brew to 3; tipping the cauldron cancels it), Hex
 * Threads (8 psychic + Weakened on every line between two hags who can see each other within 7, at the end of the
 * Coven's turn), Into the Pot (a fallen hag: Brew +2). The numbers are the plan's after the author sims
 * (docs/notes/boss-coven.md: Night Terror 8 → 10, Greens 7 → 8, Undertow 7 → 9, thread 7 → 8, Hero Pie 20 → 23).
 * Objects: the Family Cauldron (Tip Over, 2 AP), four Stirring Spots, four Swamp Gas Bubbles (volatile: 10 fire + smoke),
 * the gingerbread cottage. Thread lines go to state.data.zones (E8). All fight state lives in state.data.coven (previews
 * and dry runs copy it); cosmetic picks use DD.rng only.
 */
(function () {
  'use strict';
  const DD = window.DD;
  const U = DD.util;

  // ---- ids ------------------------------------------------------------------------------------------------------
  const MILDRED = 'cov_mildred', GRANNY = 'cov_granny', BRINE = 'cov_brine';
  const SISTERS = [MILDRED, GRANNY, BRINE];   // the turn order inside the Coven's entry (and the Hero Pie's cook order)
  const ENC = 'boss_coven', TAG = 'coven', RULE = 'cov_coven';
  const CAULDRON = 'cov_cauldron', SPOT = 'cov_spot', BUBBLE = 'cov_bubble', COTTAGE = 'cov_cottage', EYE_CODEX = 'cov_the_eye';
  const BOG = 'cov_bog';
  const SK = { bedtime: 'cov_bedtime', terror: 'cov_terror', pinch: 'cov_pinch', greens: 'cov_greens', undertow: 'cov_undertow',
    visage: 'cov_visage', stir: 'cov_stir', pie: 'cov_pie', thread: 'cov_thread' };
  const ST = { eye: 'cov_eye' };
  const SHORT = { cov_mildred: 'mildred', cov_granny: 'granny', cov_brine: 'brine' };
  const ATTACKS = { cov_mildred: [SK.terror, SK.bedtime], cov_granny: [SK.pinch, SK.greens], cov_brine: [SK.undertow, SK.visage] };

  // ---- knobs (BAL tunes these; the descs read them) ---------------------------------------------------------------
  const N = {
    hp: { cov_mildred: 105, cov_granny: 115, cov_brine: 100 },
    brewMax: 6,        // the Hero Pie's line
    stirAt: 3,         // below it a hag with a hero next to her fights instead of stirring
    interrupt: 3,      // the Brew after an interrupted Hero Pie
    intoPot: 2,        // a fallen hag's spirit
    range: 7,          // Hex Thread reach (Manhattan)
    tip: 8, tipPoison: 2, bubble: 10, smoke: 2, fall: 15,
    remedy: false,     // Grandma's Remedy: a per-hag stun guard (risk 13's knob; off)
    banterChance: 0.25, banterGap: 2, namedChance: 0.35,
  };
  const SNIPER = { style: 'ranged', keepDistance: 3 };
  const KITER = { style: 'ranged', keepDistance: 2 };
  const MELEE = { style: 'melee', keepDistance: 0 };
  const STYLE = { cov_mildred: SNIPER, cov_granny: MELEE, cov_brine: KITER };

  // ---- small helpers --------------------------------------------------------------------------------------------
  function S() { return DD.Combat && DD.Combat.state; }
  function A() { return DD.Act; }
  function G() { return DD.Grid; }
  function active(u) { return !!u && !u.dead && !u.downed; }
  function has(u, id) { return DD.Act.hasStatus(u, id); }
  function isHag(u) { return !!u && SISTERS.indexOf(u.defId) >= 0; }
  function dist(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }
  function quiet() { return !!(DD.Act && DD.Act.simulating); }
  function incapacitated(u) { return !active(u) || DD.Act.isStunned(u) || has(u, 'sheep'); }
  function asleep(u) { return active(u) && has(u, 'sleep'); }
  function eskill(def) { def.owner = 'enemy'; def.ap = 0; return DD.registerSkill(def); }
  function lvl(id) { const s = DD.getSkill(id); return (s && DD.skillLevel(s, 1)) || {}; }
  /** A skill's numbers as THIS fight deals them for a live unit (DD.AI.fightLevel), the raw level without one. */
  function liveLvl(id, u) {
    const s = DD.getSkill(id);
    if (!s) return {};
    return u && u.side && DD.AI && DD.AI.fightLevel && S() ? DD.AI.fightLevel(s, 1, u) : DD.skillLevel(s, 1);
  }
  function fightDmg() { const s = S(); return (s && s.difficulty && Number(s.difficulty.dmg)) || 1; }
  function byId(id) { return DD.Combat && DD.Combat.byId ? DD.Combat.byId(id) : null; }
  function windupOf(u, id) { return ((u && u.intents) || []).filter(function (i) { return i && i.skillId === id; })[0] || null; }
  /** The Coven's fight memory (created by the encounter's onStart; absent in a bare sandbox). */
  function CD(s) { s = s || S(); return s && s.data ? s.data.coven || null : null; }
  function stat(key, n) { const d = CD(); if (d) d.stats[key] = (d.stats[key] || 0) + (n === undefined ? 1 : n); }
  function hags(s) { s = s || S(); return s ? s.units.filter(function (u) { return active(u) && isHag(u); }) : []; }
  function hagOf(id, s) { return hags(s).filter(function (u) { return u.defId === id; })[0] || null; }
  function sisterOrder(list) {
    return list.slice().sort(function (a, b) { return SISTERS.indexOf(a.defId) - SISTERS.indexOf(b.defId) || (a.id < b.id ? -1 : 1); });
  }
  function bark(u, key, chance) { if (!quiet() && active(u)) A().maybeBark(u, key, chance === undefined ? 1 : chance); }
  /** The attacker multipliers of DD.AI.intentDmg (Weak, Inspired, Empowered, item damage, the fight's difficulty). */
  function mult(u) {
    let m = 1;
    if (has(u, 'weak')) m *= 0.75;
    if (has(u, 'inspired')) m *= 1.25;
    if (has(u, 'empowered')) m *= 1.5;
    if (u.dmgBonus) m *= 1 + u.dmgBonus;
    const s = S();
    if (u.side === 'enemy' && s && s.difficulty) m *= s.difficulty.dmg || 1;
    return m;
  }
  function allTiles(state) {
    const st = state || S();
    return st ? st.grid.tiles.map(function (t) { return { x: t.x, y: t.y }; }) : [];
  }

  // ---- named lines (picked by hero id: a hero whose file has not landed is never "present") -------------------------
  const NAMED = {
    cov_granny: [
      ['marbles', 'Professor Marbles! You were such a sweet little bunny. Look at you.'],
      ['betty', 'Betty! What a lovely name. I\'ll knit it on your shroud.'],
      ['ellaria', 'Lovely corgis, Ellaria. I\'ll knit them jumpers. Cursed ones.'],
      ['benedick', 'Benedick, dearie! I\'ve a lovely garlic butter for you.'],
      // h19 (addendum-rasma §19.4, addendum-biz §19.4, addendum-gus §20.4)
      ['rasma', 'Rasma, dearie! Such lovely manners. Do stay for tea. Forever.'],
      // [h19 review:shared] not "cold-blooded" (Svammiel's joke about Biz): the handyman is wanted at the cauldron
      ['biz', 'Biz, dearie! Come fix Granny\'s cauldron. It\'s only a little cursed.'],
      ['gus', 'Ooh, Phat Gus, dearie! Come closer. Granny\'s got a lovely pie dish.'],
    ],
    cov_brine: [
      ['pebbles', 'Off! Pebbles, off! Hot dog away from my seaweed!'],
      ['hjalmar', 'A MONKEY, Hjalmar? In my kitchen?! No monkeys!'],
    ],
    cov_mildred: [
      ['syllamin', 'A bard, Syllamin? Oh no. Please don\'t sing. I\'m begging.'],
      ['basanos', 'A werewolf, Basanos! Finally, someone else up at night.'],
    ],
  };
  function namedLine(u) {
    const s = S(), list = NAMED[u && u.defId] || [];
    if (!s) return '';
    const here = {};
    s.units.forEach(function (x) { if (x.kind === 'hero' && active(x)) here[x.defId] = 1; });
    const ok = list.filter(function (p) { return here[p[0]]; });
    return ok.length ? ok[Math.floor(DD.rng.next() * ok.length) % ok.length][1] : '';
  }
  function sayNamed(u, chance) {
    if (quiet() || !active(u) || DD.rng.next() >= chance) return '';
    const line = namedLine(u);
    if (line) A().bark(u, line);
    return line;
  }

  // =================================================================================================================
  // The cauldron, the spots and the Brew
  // =================================================================================================================
  function pot(s) {
    const D = CD(s);
    if (!D || !D.pot) return null;
    const t = G().tile(D.pot.x, D.pot.y);
    return t && t.obj && t.obj.id === CAULDRON ? t : null;
  }
  function upright(s) { const D = CD(s); return !!D && !D.tipped && !!pot(s); }
  function spotTile(p) { const t = p ? G().tile(p.x, p.y) : null; return !!t && !!t.obj && t.obj.id === SPOT; }
  function nextToPot(p, s) { const t = pot(s); return !!t && !!p && dist(p, t) === 1; }
  /** The unit stands on a Stirring Spot next to the Family Cauldron. */
  function onSpot(u, s) { return !!u && spotTile(u) && nextToPot(u, s); }
  function spotList(s) {
    s = s || S();
    return s ? s.grid.tiles.filter(function (t) { return t.obj && t.obj.id === SPOT && nextToPot(t, s); }) : [];
  }
  /** Why `u` can't stir right now, or true. */
  function stirWhy(u) {
    const s = S(), D = CD(s);
    if (!D || !pot(s)) return 'Only next to the Family Cauldron.';
    if (D.tipped) return 'The cauldron is tipped over.';
    if (!onSpot(u, s)) return 'Only from a Stirring Spot next to the cauldron.';
    if (D.brew >= N.brewMax) return 'The Brew is ready: it only needs the cook.';
    return true;
  }
  function brewOf(s) { const D = CD(s); return D ? D.brew : 0; }
  function setBrew(n) {
    const s = S(), D = CD(s);
    if (!D) return 0;
    const before = D.brew;
    D.brew = Math.max(0, Math.min(N.brewMax, Math.round(+n || 0)));
    if (D.brew !== before) {
      if (D.brew >= N.brewMax && before < N.brewMax) {
        stat('full');
        if (!quiet()) A().log('The Brew reaches ' + N.brewMax + '. The Coven reaches for the pie dish.', 'enemy');
      }
      sync(s);
    }
    return D.brew;
  }
  function addBrew(n) { return setBrew(brewOf() + n); }

  // =================================================================================================================
  // Hex Threads
  // =================================================================================================================
  /** The tiles strictly between a and b along the walk DD.Grid.los takes (the "straight line" of a thread). */
  function lineTiles(a, b) {
    const out = [];
    const dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y);
    const sx = b.x > a.x ? 1 : -1, sy = b.y > a.y ? 1 : -1;
    let x = a.x, y = a.y, ix = 0, iy = 0;
    while (ix < dx || iy < dy) {
      const dec = (1 + 2 * ix) * dy - (1 + 2 * iy) * dx;
      if (dec === 0) { x += sx; y += sy; ix++; iy++; } else if (dec < 0) { x += sx; ix++; } else { y += sy; iy++; }
      if (x === b.x && y === b.y) break;
      out.push({ x: x, y: y });
    }
    return out;
  }
  /** A hag who weaves threads: up, and in her right mind (not stunned, asleep, frozen, charmed or a sheep). */
  function weaves(u) { return active(u) && isHag(u) && !DD.Act.isStunned(u) && !has(u, 'sheep') && !has(u, 'charmed'); }
  let threadCache = { s: null, sig: '', list: [] };
  /**
   * The live Hex Threads: [{ a, b, tiles, key }] for every two weaving hags within N.range of each other with line of
   * sight (a = the earlier sister: the thread's damage source and the hag whose threatAt reports it). Pure; cached.
   */
  function threadsOf(s) {
    s = s || S();
    if (!s) return [];
    const list = sisterOrder(s.units.filter(weaves));
    const sig = (s.mutations || 0) + '|' + list.map(function (u) { return u.id + ':' + u.x + ',' + u.y; }).join(';');
    if (threadCache.s === s && threadCache.sig === sig) return threadCache.list;
    const out = [];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (dist(a, b) > N.range || !G().los(a, b)) continue;
        out.push({ a: a, b: b, tiles: lineTiles(a, b), key: a.id + '-' + b.id });
      }
    }
    threadCache = { s: s, sig: sig, list: out };
    return out;
  }
  function threadHits(th) {
    const out = [];
    th.tiles.forEach(function (p) { const o = G().unitAt(p.x, p.y); if (active(o) && o.side === 'hero') out.push(o); });
    return out;
  }
  /**
   * Fire the threads with an end in `group` (the hags of the turn that just ended), each at most once a round: every hero
   * or hero summon on a thread takes the thread's damage and is Weakened through its next turn. Returns threads fired.
   */
  function fireThreads(s, group) {
    const D = CD(s);
    if (!D) return 0;
    const ids = group.map(function (u) { return u.id; });
    const def = DD.getSkill(SK.thread), L = lvl(SK.thread);
    let n = 0;
    threadsOf(s).slice().forEach(function (th) {
      if (ids.indexOf(th.a.id) < 0 && ids.indexOf(th.b.id) < 0) return;
      if (D.fired[th.key] === s.round) return;
      D.fired[th.key] = s.round;
      const victims = threadHits(th);
      if (!victims.length) return;
      n++;
      stat('threads');
      if (!quiet()) {
        DD.FX.beam(th.a, th.b, { color: '#c77dff', width: 2 });
        A().log('A Hex Thread between ' + th.a.name + ' and ' + th.b.name + ' snaps taut.', 'enemy');
      }
      victims.forEach(function (v) {
        if (!active(v) || !active(th.a)) return;
        A().damage(th.a, v, L.dmg, { element: 'psychic', skill: def, tags: ['thread'], noHighGround: true });
        stat('threadHits');
        if (active(v)) A().addStatus(v, 'weak', { turns: L.turns }, th.a);
      });
    });
    return n;
  }
  /** threatAt (pure): the thread damage a hero-side unit would take on `tile` from the threads `enemy` heads. */
  function threadThreat(enemy, unit, tile) {
    if (!enemy || !unit || !tile || unit.side !== 'hero' || !CD()) return 0;
    let dmg = 0;
    threadsOf().forEach(function (th) {
      if (th.a !== enemy || !th.tiles.some(function (p) { return p.x === tile.x && p.y === tile.y; })) return;
      dmg += DD.AI.estimate(enemy, unit, lvl(SK.thread).dmg, 'psychic');
    });
    return dmg > 0 ? { dmg: dmg, label: 'Hex Thread' } : 0;
  }
  /** Heroes on the threads `unit` would weave standing at p (with every other weaving sister where she stands). */
  function threadValue(unit, p) {
    if (!weaves(unit) || !CD()) return 0;
    let n = 0;
    hags().forEach(function (h) {
      if (h === unit || !weaves(h) || dist(p, h) > N.range || !G().los(p, h)) return;
      lineTiles(p, h).forEach(function (q) { const o = G().unitAt(q.x, q.y); if (active(o) && o.side === 'hero') n++; });
    });
    return n * lvl(SK.thread).dmg * 0.8;
  }

  // =================================================================================================================
  // The Rite: the Hero Pie, interrupts, the tip
  // =================================================================================================================
  function canCook(u) { return active(u) && isHag(u) && !DD.Act.isStunned(u) && !has(u, 'sheep') && !has(u, 'charmed'); }
  /** At Brew 6, at the end of the Coven's turn: the first hag of that turn who can (the Eye-holder first) winds up the pie. */
  function maybePie(s, group) {
    const D = CD(s);
    if (!D || D.pie || D.brew < N.brewMax || !upright(s)) return null;
    const cook = sisterOrder(group).filter(canCook)[0];
    if (!cook) return null;
    const p = pot(s);
    const it = DD.AI.windUp(cook, SK.pie, { x: p.x, y: p.y }, { anchor: 'ground', tiles: allTiles(s), label: 'Family Recipe: Hero Pie',
      banner: 'The cauldron is about to boil over: tip it, or interrupt ' + cook.name + '!' });
    if (!it) return null;
    D.pie = { unitId: cook.id, round: s.round };
    stat('pies');
    if (!quiet()) { bark(cook, 'pie'); A().narrate('cov_pie_windup', {}); }
    sync(s);
    return it;
  }
  /** The pie's wind-up vanished without landing or a tip: an interrupt (Brew to 3); its cook died: the pie dies with her. */
  function checkPie(s) {
    s = s || S();
    const D = CD(s);
    if (!D || !D.pie) return;
    const w = byId(D.pie.unitId);
    if (w && !w.dead && windupOf(w, SK.pie)) return;
    D.pie = null;
    if (!w || w.dead) { sync(s); return; }
    stat('pieStopped');
    if (!quiet()) A().log('The Hero Pie is interrupted: the Brew drops to ' + N.interrupt + '.', 'hero');
    setBrew(N.interrupt);
    sync(s);
  }
  /** Tip Over (the cauldron's interaction): Brew 0, a pending pie fizzles, the splash, upright again at the end of next round. */
  function tipOver(unit, tile) {
    const s = S(), D = CD(s);
    tile = tile || pot(s);
    if (!D || D.tipped || !tile) return false;
    const cook = D.pie ? byId(D.pie.unitId) : null;
    const hadPie = !!D.pie;
    D.pie = null;
    if (cook && active(cook) && windupOf(cook, SK.pie)) DD.AI.cancelIntents(cook, 'The pie is ruined!');
    D.tipped = s.round + 1;
    stat('tipped');
    if (hadPie) stat('pieTipped');
    setBrew(0);
    DD.FX.particles(tile, { kind: 'poison', count: 18 });
    if (!quiet()) {
      DD.FX.text(tile, 'SPLOSH!', { color: '#9be86a', size: 17 });
      A().log((unit ? unit.name + ' tips over' : 'Over goes') + ' the Family Cauldron' + (hadPie ? ': the Hero Pie fizzles' : '') + '.', 'hero');
      A().narrate('cov_tipped', {});
    }
    const victims = s.units.filter(function (u) { return active(u) && dist(u, tile) <= 1; });
    A().withCredit(unit || null, function () {
      victims.forEach(function (v) {
        if (!active(v)) return;
        A().damage(unit || null, v, N.tip, { cause: 'surface', tags: ['brew'] });
        if (active(v)) A().addStatus(v, 'poison', { stacks: N.tipPoison }, unit || null);
      });
    });
    if (!quiet()) {
      const by = hags(s).filter(function (h) { return !has(h, 'sheep'); });
      if (by.length) bark(by[Math.floor(DD.rng.next() * by.length) % by.length], 'tipped');
    }
    sync(s);
    return true;
  }
  /** AutoPlay: tipping saves a pending pie (its full number on every hero-side unit), or a high Brew; minus the splash. */
  function tipValue(unit, obj, tile, state, how) {
    if (how && how !== 'interact') return 0;
    const s = state || S(), D = CD(s);
    if (!D || D.tipped || !tile) return 0;
    const party = s.units.filter(function (u) { return active(u) && u.side === 'hero'; });
    let v;
    if (D.pie) v = Math.round(lvl(SK.pie).dmg * fightDmg()) * party.length + 6;
    else if (D.brew >= N.stirAt) v = 6 * D.brew;
    else return 0;
    let self = false;
    s.units.forEach(function (u) {
      if (!active(u) || dist(u, tile) > 1) return;
      if (u === unit) self = true;
      if (u.side === 'hero') v -= N.tip; else if (isHag(u)) v += N.tip * 0.75;
    });
    if (!self) v -= N.tip;
    return v;
  }
  /** AutoPlay: a free Stirring Spot a hag could take this round is worth standing on. */
  function spotValue(unit, obj, tile, state, how) {
    if (how && how !== 'step') return 0;
    const s = state || S(), D = CD(s);
    if (!D || D.tipped || !tile || !nextToPot(tile, s)) return 0;
    const reach = hags(s).some(function (h) { return !onSpot(h, s) && dist(h, tile) <= (h.mov || 3) + 1; });
    return reach ? 4 + 3 * D.brew : 0;
  }

  // =================================================================================================================
  // The board: chip, flavour, zones, the cauldron's label
  // =================================================================================================================
  function ruleName(D, n) { return 'Brew ' + D.brew + '/' + N.brewMax + ' · threads ' + n; }
  function ruleDesc() {
    const t = Math.round((lvl(SK.thread).dmg || 0) * fightDmg());
    return 'Hex Threads: at the end of the Coven\'s turn (once the Eye is gone: of each hag\'s turn, for the threads touching her), ' +
      'every two hags within ' + N.range + ' tiles who can see each other (not stunned, asleep, frozen, charmed or a sheep) are joined by ' +
      'a Hex Thread, the straight line between them. Each hero or hero summon on a thread takes ' + t + ' psychic damage and is Weakened ' +
      'through its next turn, once per thread; a thread fires at most once a round. The Rite: a hag who starts her turn on a Stirring Spot ' +
      'stirs the pot first (Brew +1), then acts. At Brew ' + N.brewMax + ', at the end of the Coven\'s turn, a hag of that turn (the Eye-holder first) winds up the ' +
      'Hero Pie. Into the Pot: when a hag falls, the Brew rises by ' + N.intoPot + '.';
  }
  function flavorOf(D) {
    if (D.pie) return 'The Hero Pie is cooking: tip the cauldron, or stun, sleep, freeze or sheep the cook!';
    if (D.tipped) return 'The cauldron is tipped over: no stirring until it rights itself.';
    return 'Brew ' + D.brew + '/' + N.brewMax + '. Hold the stirring spots; tip the pot before it boils over.';
  }
  /** Keep the chip, the objective's flavour line, the thread zones (E8) and the cauldron's label in step with the fight. */
  function sync(s) {
    s = s || S();
    const D = CD(s);
    if (!D) return;
    const ths = threadsOf(s);
    const r = (s.rules || []).filter(function (x) { return x.id === RULE; })[0];
    if (r) { r.name = ruleName(D, ths.length); r.desc = ruleDesc(); r.brew = D.brew; r.threads = ths.length; }
    if (s.objective) s.objective.flavor = flavorOf(D);
    const zones = (s.data.zones || []).filter(function (z) { return !(z && typeof z.id === 'string' && z.id.indexOf('cov_') === 0); });
    ths.forEach(function (th) {
      if (!th.tiles.length) return;
      zones.push({ id: 'cov_thread:' + th.key, tiles: th.tiles.slice(), color: '#c77dff', label: '🧶',
        line: [{ x: th.a.x, y: th.a.y }, { x: th.b.x, y: th.b.y }] });
    });
    s.data.zones = zones;
    const p = pot(s);
    if (p) p.obj.label = 'The Family Cauldron (Brew ' + D.brew + '/' + N.brewMax + (D.tipped ? ', tipped over' : '') + ')';
    A().touch();
  }

  // =================================================================================================================
  // Deaths, the Eye, mourning, falls, Grandma's Remedy
  // =================================================================================================================
  function ensureEye(u) {
    const D = CD();
    if (D && D.eye && u && u.defId === MILDRED && active(u) && !has(u, ST.eye)) A().addStatus(u, ST.eye, { turns: -1, silent: true }, u);
  }
  /** Mildred fell: the Eye rolls under the dresser; the survivors roll their own initiative at the next round start. */
  function eyeDrops(u) {
    const s = S(), D = CD(s);
    if (!D || !D.eye) return;
    D.eye = false;
    D.eyeRound = s.round;
    stat('eyeDropped');
    if (quiet()) return;
    DD.FX.text(u, '👁️ The Eye rolls away!', { color: '#ff5ad1', size: 15 });
    const left = hags(s).filter(function (h) { return h !== u; });
    A().log('The Eye rolls under the dresser.' + (left.length ? ' ' + left.map(function (h) { return h.name; }).join(' and ') +
      (left.length > 1 ? ' take their own turns' : ' takes her own turns') + ' from the next round.' : ''), 'hero');
    A().narrate('cov_eye', {});
    const g = hagOf(GRANNY, s);
    if (g && g !== u) bark(g, 'eye');
    if (DD.Cameo && typeof DD.Cameo.say === 'function' && DD.getCameo && DD.getCameo('svammiel')) DD.Cameo.say('svammiel', 'svam_phase', { enemy: 'the Coven' });
  }
  function fallen(u) {
    const s = S(), D = CD(s);
    if (u.defId === MILDRED) eyeDrops(u);
    if (D) {
      stat('intoPot');
      if (!quiet()) A().log(u.name + '\'s spirit dives into the cauldron: Brew +' + N.intoPot + '.', 'enemy');
      addBrew(N.intoPot);
    }
    checkPie(s);
    sync(s);
    if (quiet()) return;
    const left = hags(s);
    if (!left.length) {
      if (D && !D.over) { D.over = true; A().narrate('cov_death', {}); }
      return;
    }
    const key = 'mourn_' + SHORT[u.defId];
    const mourners = left.filter(function (m) { const def = DD.getEnemy(m.defId); return def && def.barks && def.barks[key] && !has(m, 'sheep'); });
    if (mourners.length) A().bark(mourners[Math.floor(DD.rng.next() * mourners.length) % mourners.length], key);
    if (left.length === 1 && D && !D.last) { D.last = true; bark(left[0], 'last'); }
  }
  /** Squad rule (plan §3.0.1): a hag never dies to a fall; she climbs out with N.fall HP less. */
  function fallGuard(unit, d) {
    if (!d || d.cause !== 'fall') return undefined;
    const before = Math.max(0, unit.hp || 0) + (Number(d.dealt) || 0);
    unit.hp = Math.max(1, (before > 0 ? before : unit.maxHp) - N.fall);
    d.covFall = true;
    return true;
  }
  function remedyCancel(m) {
    if (!N.remedy || !m || !m.unit || !A().isStunLike(m.id)) return;
    if (!(m.unit.data && m.unit.data.covRemedy)) return;
    m.cancel = true;
    if (!quiet()) DD.FX.text(m.unit, '🍵 Grandma\'s Remedy: shrugs it off', { color: '#c6e28a', size: 14 });
  }
  function remedyArm(unit, st) {
    if (!N.remedy || !st || !A().isStunLike(st.id)) return;
    const s = S();
    unit.data.covRemedy = { turn: s ? s.turn : 0, lost: false };
  }
  function remedyTick(unit) {
    const g = unit.data && unit.data.covRemedy, s = S();
    if (!g || !s || s.turn <= g.turn) return;
    if (!g.lost) g.lost = true; else unit.data.covRemedy = null;
  }

  /** The end of a Coven turn (the turn owner's onTurnEnd: every hag of the turn has acted): threads, then the pie. */
  function covenTurnEnd(unit) {
    const s = S(), D = CD(s);
    if (!s || s.result || !active(unit)) return;
    const owner = DD.Combat.turnOwner ? DD.Combat.turnOwner(unit) : unit;
    if (owner && owner !== unit) return;
    wakeSleepers(s);
    if (!D) return;
    const group = (DD.Combat.groupOf ? DD.Combat.groupOf(unit) : [unit]).filter(function (m) { return active(m) && isHag(m); });
    checkPie(s);
    fireThreads(s, group);
    if (!s.result) maybePie(s, group);
    sync(s);
  }

  function hooksFor(extra) {
    return Object.assign({
      onCombatStart: function (unit) { ensureEye(unit); },
      onTurnStart: function (unit) { ensureEye(unit); checkPie(); },
      onTurnEnd: function (unit) { covenTurnEnd(unit); remedyTick(unit); },
      onEnterTile: function () { sync(); },
      onStatusApplied: function (unit, st) { checkPie(); remedyArm(unit, st); sync(); },
      onStatusRemoved: function () { sync(); },
      modifyStatus: function (m) { remedyCancel(m); },
      preventDeath: function (unit, d) { return fallGuard(unit, d); },
      onDeathPrevented: function (unit, d) {
        if (!d || !d.covFall || quiet()) return;
        A().log(unit.name + ' climbs out of the drop, ' + N.fall + ' HP poorer and furious about her hair.', 'enemy');
      },
      onDeath: function (unit) { fallen(unit); },
      threatAt: function (enemy, unit, tile) { return threadThreat(enemy, unit, tile); },
    }, extra || {});
  }

  // =================================================================================================================
  // Skills
  // =================================================================================================================
  function lunge(ctx) { if (ctx.target) DD.FX.lunge(ctx.user, ctx.target); }
  function attackBark(u) { if (!quiet() && !sayNamed(u, 0.12)) A().maybeBark(u, 'attack', 0.25); }
  function sleeperScore(ctx) { return asleep(ctx.targetUnit) ? -8 : 0; }
  function nearSpots(v) { return !!v && spotList().some(function (t) { return dist(t, v) <= 1; }); }

  // -- Cousin Mildred --
  /** Bedtime Hex's pick: a hero with a heal ready, else the hardest hitter (not asleep, not immune). */
  function healReady(h) {
    return DD.Combat.slotsOf(h).some(function (sl) {
      const d = DD.getSkill(sl.id);
      return !!d && !(d.hype > 0) && (d.kind === 'heal' || (d.tags || []).indexOf('heal') >= 0) && !(sl.cd > 0);
    });
  }
  function hexVictim(unit, foes) {
    const ok = foes.filter(function (f) { return active(f) && f.kind === 'hero' && !asleep(f) && !A().immuneTo(f, 'sleep'); });
    const healers = ok.filter(healReady);
    const pool = healers.length ? healers : ok;
    return pool.slice().sort(function (a, b) {
      return (DD.AI.threatOf ? DD.AI.threatOf(b) - DD.AI.threatOf(a) : 0) || a.hp - b.hp || (a.id < b.id ? -1 : 1);
    })[0] || null;
  }
  // Bedtime Hex's sleep lasts until the end of the Coven's next turn (not the sleeper's): whatever the initiative order the
  // sleeper loses exactly one turn, and Night Terror's sleeper number is there for the taking on the Coven's next turn. The core
  // 'sleep' status (stun-like, wakes on damage) with turns -1; covenTurnEnd wakes it (st.data.covTurns counts turn ends).
  eskill({ id: SK.bedtime, name: 'Bedtime Hex', icon: '💤', kind: 'spell', tags: ['ranged', 'debuff', 'sleep'], anchor: 'unit', cooldown: 3,
    levels: [{ r: 5 }], target: { type: 'unit', range: function (L) { return [1, L.r]; }, filter: 'enemy', los: true },
    desc: function (L) { return 'A foe within ' + L.r + ' falls Asleep until the end of the Coven\'s next turn, so it loses its next turn (damage wakes it).'; },
    flavor: 'A bedtime story with no ending. Mildred falls asleep before she gets to it.',
    aiScore: function (ctx) { return ctx.targetUnit && healReady(ctx.targetUnit) ? 10 : 0; },
    execute: function (ctx) {
      ctx.foes.forEach(function (f) {
        if (!active(f)) return;
        DD.FX.beam(ctx.user, f, { color: '#ff5ad1', width: 2 });
        const st = A().addStatus(f, 'sleep', { turns: -1 }, ctx.user);
        if (!st) return;
        st.data.covSleep = true;
        st.data.covTurns = 0;
        stat('sleeps');
      });
      bark(ctx.user, 'hex', 0.5);
    } });
  /** A Coven turn ended: Bedtime Hex sleepers wake at the end of the Coven's turn after the one that put them to sleep. */
  function wakeSleepers(s) {
    s.units.forEach(function (u) {
      const st = active(u) ? u.statuses.filter(function (x) { return x.id === 'sleep' && x.data && x.data.covSleep; })[0] : null;
      if (!st) return;
      st.data.covTurns = (st.data.covTurns || 0) + 1;
      if (st.data.covTurns >= 2) A().removeStatus(u, 'sleep', { text: 'Wakes up!' });
    });
  }
  /** Night Terror's extra on a sleeper, as the reach numbers show it (sleepDmg instead of dmg, at this fight's scale). */
  function terrorFlat(unit, intent) {
    const p = DD.AI.intentTarget(unit, intent), v = p ? G().unitAt(p.x, p.y) : null;
    if (!asleep(v)) return 0;
    const L = lvl(SK.terror), m = mult(unit);
    return Math.round(L.sleepDmg * m) - Math.round(L.dmg * m);
  }
  eskill({ id: SK.terror, name: 'Night Terror', icon: '😱', kind: 'spell', tags: ['ranged', 'psychic'], anchor: 'unit',
    levels: [{ dmg: 10, sleepDmg: 20, r: 5 }], target: { type: 'unit', range: function (L) { return [1, L.r]; }, filter: 'enemy', los: true },
    desc: function (L) { return 'Deal ' + L.dmg + ' psychic damage to a foe within ' + L.r + ', or ' + L.sleepDmg + ' if it is asleep (it wakes up).'; },
    flavor: 'Mostly about forgetting to study for an exam you were never enrolled in. Hags are old-fashioned.',
    telegraphFlat: terrorFlat,
    aiScore: function (ctx) { return asleep(ctx.targetUnit) ? 8 : 0; },
    execute: function (ctx) {
      attackBark(ctx.user);
      ctx.foes.forEach(function (f) {
        if (!active(f)) return;
        const deep = asleep(f);
        DD.FX.beam(ctx.user, f, { color: '#b46cff', width: deep ? 3 : 2 });
        A().damage(ctx.user, f, deep ? ctx.L.sleepDmg : ctx.L.dmg, { element: 'psychic' });
        if (deep) stat('terrors');
      });
    } });

  // -- Granny Gristle --
  eskill({ id: SK.pinch, name: 'Cheek Pinch', icon: '🤏', kind: 'attack', tags: ['melee'], anchor: 'self',
    levels: [{ dmg: 10, turns: 1 }], target: { type: 'unit', range: [1, 1], filter: 'enemy' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to an adjacent foe and Root it through its next turn.'; },
    flavor: 'Look at those cheeks. LOOK at them. You\'re not going anywhere.',
    aiScore: function (ctx) { return sleeperScore(ctx) + (nearSpots(ctx.targetUnit) ? 2 : 0); },
    execute: function (ctx) {
      lunge(ctx);
      attackBark(ctx.user);
      ctx.foes.forEach(function (f) {
        if (!active(f)) return;
        A().damage(ctx.user, f, ctx.L.dmg);
        if (active(f)) A().addStatus(f, 'root', { turns: ctx.L.turns }, ctx.user);
      });
    } });
  /** The ground within 1 of p that turns to bog: walkable, not liquid / a drop / bog already, no blocking object. */
  function bogTiles(p) {
    return G().shape('circle', { x: p.x, y: p.y }, null, 1).filter(function (q) {
      const t = G().tile(q.x, q.y);
      if (!t || t.t === BOG || (t.obj && G().objBlocksMove(t.obj))) return false;
      const td = G().terrain(t);
      return !!td && td.walkable !== false && !td.liquid && !td.pit;
    });
  }
  eskill({ id: SK.greens, name: 'Eat Your Greens', icon: '🥬', kind: 'attack', tags: ['ranged'], anchor: 'unit', cooldown: 2,
    levels: [{ dmg: 8, r: 4 }], target: { type: 'unit', range: function (L) { return [1, L.r]; }, filter: 'enemy', los: true },
    desc: function (L) { return 'Fling mud at a foe within ' + L.r + ': ' + L.dmg + ' damage, and the ground within 1 of it turns to bog for the rest of the fight.'; },
    flavor: 'They\'re good for you. They are also, technically, a curse. The two are not mutually exclusive.',
    aiScore: function (ctx) { return sleeperScore(ctx) + (nearSpots(ctx.targetUnit) ? 3 : 0); },
    execute: function (ctx) {
      attackBark(ctx.user);
      ctx.foes.forEach(function (f) {
        if (!active(f)) return;
        DD.FX.projectile(ctx.user, f, { kind: 'orb', color: '#5a7a2a' });
        const at = { x: f.x, y: f.y };
        A().damage(ctx.user, f, ctx.L.dmg);
        bogTiles(at).forEach(function (q) { A().setTerrain(q.x, q.y, BOG); });
        stat('bogged');
      });
    } });

  // -- Auntie Brine --
  /** Where a pull of n toward `to` leaves v (DD.Act.pull's rule, no side effects). */
  function pullEnd(to, v, n) {
    const dir = U.dirTo(v, to);
    const dx = to.x - v.x, dy = to.y - v.y;
    if (!dir.x && !dir.y) return { x: v.x, y: v.y };
    const along = dx === 0 || dy === 0 ? Math.abs(dx + dy) - 1 : Math.abs(dir.x ? dx : dy);
    const steps = Math.max(0, Math.min(n, along));
    let at = { x: v.x, y: v.y };
    for (let i = 0; i < steps; i++) {
      const nx = at.x + dir.x, ny = at.y + dir.y;
      const t = G().tile(nx, ny);
      if (!t || G().unitAt(nx, ny) || (t.obj && G().objBlocksMove(t.obj)) || G().terrain(t).walkable === false || G().isDrop(nx, ny)) break;
      if (!G().canStep(v, at, { x: nx, y: ny })) break;
      at = { x: nx, y: ny };
    }
    return at;
  }
  function pullScore(user, v) {
    if (!v || A().isImmovable(v)) return asleep(v) ? -8 : 0;
    const end = pullEnd(user, v, lvl(SK.undertow).pull);
    const moved = end.x !== v.x || end.y !== v.y;
    return (moved && onSpot(v) ? 14 : 0) + (asleep(v) ? -8 : 0);
  }
  eskill({ id: SK.undertow, name: 'Undertow', icon: '🌊', kind: 'attack', tags: ['ranged', 'pull'], anchor: 'unit',
    levels: [{ dmg: 9, r: 4, pull: 2 }], target: { type: 'unit', range: function (L) { return [1, L.r]; }, filter: 'enemy', los: true },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to a foe within ' + L.r + ' and pull it ' + L.pull + ' tiles toward her.'; },
    flavor: 'The tide comes in. The tide goes out. You go wherever Auntie Brine wants.',
    aiScore: function (ctx) { return pullScore(ctx.user, ctx.targetUnit); },
    execute: function (ctx) {
      attackBark(ctx.user);
      ctx.foes.forEach(function (f) {
        if (!active(f)) return;
        const held = onSpot(f);
        DD.FX.beam(ctx.user, f, { color: '#4fb0a8', width: 3 });
        A().damage(ctx.user, f, ctx.L.dmg);
        if (!active(f)) return;
        const r = A().pull(ctx.user, f, ctx.user, ctx.L.pull);
        if (r && r.moved && held) { stat('dragged'); bark(ctx.user, 'pull', 0.5); }
      });
    } });
  /** The foes within r of p that can see p (I Was Beautiful Once). */
  function visageVictims(p, foes, r) {
    return foes.filter(function (f) { return active(f) && dist(f, p) <= r && G().los(f, p); });
  }
  eskill({ id: SK.visage, name: 'I Was Beautiful Once', icon: '🪞', kind: 'spell', tags: ['aoe', 'debuff'], anchor: 'self', cooldown: 2,
    levels: [{ r: 2, turns: 1 }], target: { type: 'self' }, area: { shape: 'circle', size: function (L) { return L.r; } },
    desc: function (L) { return 'Every foe within ' + L.r + ' that can see her is Confused through its next turn (moving costs 2 AP).'; },
    flavor: 'She was. Then she was moist. Look upon her and despair, or at least feel a bit awkward.',
    execute: function (ctx) {
      DD.FX.particles(ctx.user, { kind: 'bubbles', count: 14 });
      bark(ctx.user, 'visage', 0.6);
      ctx.foes.forEach(function (f) {
        if (!active(f) || !G().los(f, ctx.user)) return;
        A().addStatus(f, 'confused', { turns: ctx.L.turns }, ctx.user);
      });
    } });

  // -- every hag --
  eskill({ id: SK.stir, name: 'Stir the Pot', icon: '🥄', kind: 'utility', tags: ['coven'], anchor: 'self',
    levels: [{ brew: 1, heal: 6 }], target: { type: 'self' },
    desc: function (L) { return 'Next to the cauldron (Brew below ' + N.brewMax + '): the Brew rises by ' + L.brew + ' and she sips ' + L.heal + ' HP.'; },
    flavor: 'Clockwise for curses, anticlockwise for soup. Granny has never once got it wrong. Granny says.',
    canUse: function (ctx) { return stirWhy(ctx.user); },
    execute: function (ctx) {
      DD.FX.particles(ctx.user, { kind: 'bubbles', count: 8 });
      addBrew(ctx.L.brew);
      A().heal(ctx.user, ctx.user, ctx.L.heal);
      stat('stirs');
      bark(ctx.user, 'stir', 0.35);
    } });
  eskill({ id: SK.pie, name: 'Family Recipe: Hero Pie', icon: '🥧', kind: 'attack', tags: ['aoe'], anchor: 'ground', windupOnly: true,
    levels: [{ dmg: 23, turns: 1 }], target: { type: 'tile', range: [0, 99], filter: 'any', los: false },
    area: { shape: 'custom', fn: function (ctx) { return allTiles(ctx.state); } },
    desc: function (L) {
      return 'Wind-up (Brew ' + N.brewMax + '): next Coven turn the cauldron boils over: ' + L.dmg + ' damage to each hero and hero summon, and ' +
        'each is Slowed (−1 AP) on its next turn; the Brew resets. Interrupt the cook (stun, sleep, freeze, sheep) and the Brew drops to ' +
        N.interrupt + '; tip the cauldron and it fizzles.';
    },
    flavor: 'Serves three. Feeds a coven for a century. Contains heroes.',
    execute: function (ctx) {
      const D = CD(ctx.state);
      if (D) D.pie = null;
      DD.FX.banner('🥧 HERO PIE!', { sub: 'The cauldron boils over.', color: '#ff9a3a', ms: 1000 });
      DD.FX.shake(10, 500);
      const p = pot(ctx.state);
      if (p) DD.FX.particles(p, { kind: 'fire', count: 20 });
      ctx.units.filter(function (u) { return active(u) && u.side === 'hero'; }).forEach(function (v) {
        if (!active(v)) return;
        A().damage(ctx.user, v, ctx.L.dmg, { tags: ['pie'], noHighGround: true });
        if (active(v)) A().addStatus(v, 'slow', { turns: ctx.L.turns }, ctx.user);
      });
      stat('pieLanded');
      setBrew(0);
      if (!quiet()) A().narrate('cov_pie', {});
    } });
  eskill({ id: SK.thread, name: 'Hex Thread', icon: '🧶', kind: 'spell', tags: ['psychic', 'thread'], anchor: 'self', windupOnly: true,
    levels: [{ dmg: 8, turns: 1 }], target: { type: 'self' },
    desc: function (L) {
      return 'At the end of the Coven\'s turn: ' + L.dmg + ' psychic damage to each hero or hero summon on the line between two hags within ' + N.range +
        ' who can see each other, and Weakened through its next turn.';
    },
    flavor: 'Knitted from spite, gossip and one long grey hair. Do not stand on it. Do not pull it.',
    execute: function () { /* the threads fire from the Coven's turn end (fireThreads), never as a skill use */ } });

  // =================================================================================================================
  // Statuses, terrain and objects
  // =================================================================================================================
  DD.registerStatus({ id: ST.eye, name: 'The Eye', icon: '👁️', color: '#ff5ad1', type: 'buff', stacking: 'none', maxStacks: 1,
    decay: 'never', defaultTurns: -1,
    desc: function () {
      return 'She holds the Coven\'s one shared Eye, so she runs the Coven\'s turn: Granny Gristle and Auntie Brine act on it, right after her. ' +
        'When she falls, it rolls under the dresser.';
    } });

  DD.registerTerrain({ id: BOG, name: 'Bog', walkable: true, cost: 2, blocksLos: false,
    colors: { top: '#4f5a2a', left: '#3b4420', right: '#2f3619' },
    desc: 'Costs 2 to move through. Smells like Granny\'s cooking, which is to say: of bog.',
    draw: function (g, t) {
      if (!t) return;
      const k = (t.x * 7 + t.y * 5) % 3;
      g.ellipse(-6 + k * 4, 1, 5, 2, 'rgba(32,26,10,0.45)');
      if ((t.x + t.y) % 2) g.circle(5 - k, -1, 1.2, 'rgba(170,200,95,0.55)', null);
    } });

  function drawCauldron(g, obj) {
    const t = g.t || 0, s = S(), D = CD(s), boil = !!(D && D.pie), tipped = !!(D && D.tipped);
    g.ellipse(0, 3, 17, 7, 'rgba(0,0,0,0.3)');
    if (tipped) {
      g.ellipse(13, 2, 10, 3.5, 'rgba(120,200,90,0.55)');
      g.ellipse(-3, -7, 14, 9, '#2b2a2e', true);
      g.ellipse(9, -7, 5, 8, '#141316', true);
      return;
    }
    [-9, 0, 9].forEach(function (x) { g.line(x, -3, x * 1.15, 3, '#1c1b1f', 3); });
    g.ellipse(0, -9, 15, 11, '#2b2a2e', true);
    g.ellipse(-5, -12, 5, 3, 'rgba(255,255,255,0.12)');
    g.ellipse(0, -18, 13, 4.5, '#1c1b1f', true);
    const brew = boil ? '#ff9a3a' : '#7fd26a';
    g.ellipse(0, -18, 11, 3.4, brew);
    for (let i = 0; i < 4; i++) {
      const p = (t * (boil ? 2 : 1.2) + i * 0.27) % 1;
      g.circle(-7 + i * 4.6, -19 - p * 7, (1.2 + p * 1.6) * (boil ? 1.4 : 1), g.rgba(brew, 1 - p), null);
    }
    g.line(4, -20, 10, -31, '#8a6a3a', 2);
    if (D && obj) g.text(D.brew + '/' + N.brewMax, 0, -37, 7, boil ? '#ffb06a' : '#c8f7a8', { stroke: '#1a1014' });
  }
  DD.registerObject({ id: CAULDRON, name: 'The Family Cauldron', icon: '🫕', blocksMove: true, blocksLos: false, hp: 0, height: 0.9, color: '#2b2a2e',
    codex: true,
    desc: 'Bubbling since 1302; the recipe calls for "a pinch of hero". Tip Over (2 AP, from next to it): the Brew drops to 0 (a pending Hero Pie ' +
      'fizzles), and everyone within 1 of the cauldron, you included, takes ' + N.tip + ' damage and is Poisoned ' + N.tipPoison + '. It rights itself ' +
      'at the end of the next round; nobody can stir it until then.',
    available: function () { const D = CD(); return !!D && !D.tipped; },
    interact: { ap: 2, label: 'Tip Over', fn: function (unit, obj, tile) { tipOver(unit, tile); } },
    autoplay: tipValue,
    draw: drawCauldron });
  function drawSpot(g) {
    g.ellipse(0, 0, 13, 6.5, 'rgba(201,178,122,0.16)', 'rgba(201,178,122,0.75)');
    g.ellipse(0, 0, 8, 4, null, 'rgba(201,178,122,0.4)');
    g.line(-3, 1.5, 3, -1.5, 'rgba(232,214,160,0.8)', 1);
    g.ellipse(4, -2, 1.8, 1.1, 'rgba(232,214,160,0.8)');
  }
  DD.registerObject({ id: SPOT, name: 'Stirring Spot', blocksMove: false, blocksLos: false, hp: 0, height: 0.05, color: '#c9b27a', codex: false,
    desc: 'One of the four spots next to the Family Cauldron a hag must stand on to stir it. Stand here and she can\'t.',
    autoplay: spotValue, draw: drawSpot });
  function drawBubble(g) {
    const t = g.t || 0, w = Math.sin(t * 3 + (g.tile ? g.tile.x * 1.7 + g.tile.y : 0)) * 0.8;
    g.ellipse(0, 2, 10, 4, 'rgba(0,0,0,0.25)');
    g.ellipse(0, -7 - w * 0.5, 9 + w * 0.4, 8 - w * 0.3, 'rgba(150,205,90,0.55)', 'rgba(40,70,25,0.85)');
    g.ellipse(-3, -10 - w * 0.5, 2.6, 1.8, 'rgba(255,255,255,0.55)');
    g.circle(3, -4, 1.2, 'rgba(220,255,160,0.6)', null);
  }
  DD.registerObject({ id: BUBBLE, name: 'Swamp Gas Bubble', blocksMove: true, blocksLos: false, hp: 2, height: 0.6, color: '#8fbf5a', volatile: true,
    codex: false,
    desc: 'Explodes when destroyed, set alight or shot (aim any single-target damage skill at it): ' + N.bubble + ' fire damage within 1, and a ' +
      'puff of smoke there that blocks sight until the end of the next round.',
    react: { fire: { destroy: true } },
    onDestroyed: function (o, tile, src) {
      stat('bubbles');
      DD.Act.explode(src, tile.x, tile.y, { radius: 1, dmg: N.bubble, element: 'fire' });
      G().shape('circle', { x: tile.x, y: tile.y }, null, 1).forEach(function (q) { A().setSurface(q.x, q.y, 'smoke', N.smoke); });
      sync();
    },
    draw: drawBubble });
  function drawCottage(g) {
    const t = g.t || 0, sway = Math.sin(t * 1.3) * 0.6;
    g.ellipse(0, 3, 22, 8, 'rgba(0,0,0,0.3)');
    [-8, 8].forEach(function (x) {   // chicken legs, folded: it is sitting down
      g.line(x, -7, x - 2, 1, '#e8b84a', 2.6);
      g.line(x - 2, 1, x - 6, 2, '#e8b84a', 1.4);
      g.line(x - 2, 1, x - 1, 3, '#e8b84a', 1.4);
      g.line(x - 2, 1, x + 2, 2, '#e8b84a', 1.4);
    });
    g.rect(-15, -34 + sway, 30, 26, '#a0612e', true);
    for (let i = 0; i < 6; i++) g.line(-15 + i * 5, -34 + sway, -12.5 + i * 5, -31 + sway, '#f4efe6', 1.4);
    g.poly([[-19, -33 + sway], [0, -50 + sway], [19, -33 + sway]], '#6b3a1e', true);
    g.rect(-4, -20 + sway, 8, 12, '#5a2e14', true);
    g.rect(7, -28 + sway, 5, 5, 'rgba(255,214,120,0.85)', true);
    g.circle(-9, -26 + sway, 2, '#e04848', null);
    g.circle(-9, -21 + sway, 2, '#4ab0e0', null);
  }
  DD.registerObject({ id: COTTAGE, name: 'The Gingerbread Cottage (on Chicken Legs)', blocksMove: true, blocksLos: true, hp: 0, height: 2, color: '#a0612e',
    codex: false,
    desc: 'Blocks movement and line of sight. Condemned, delicious and sitting down. Baba Yaga\'s walks; this one only does on Sundays.',
    draw: drawCottage });
  // The Eye as a codex entry (Hall: lane things are objects / statuses; a status desc is a function, so the codex text lives here)
  DD.registerObject({ id: EYE_CODEX, name: 'The Eye', icon: '👁️', blocksMove: false, blocksLos: false, hp: 0, height: 0.4, color: '#ff5ad1', codex: true,
    desc: 'The Coven\'s one shared Eye. Cousin Mildred has it. She is USING it. Whoever holds it runs the Coven\'s turn.',
    draw: function (g) { g.circle(0, -12, 6, '#f4efe6', true); g.circle(1, -12, 3, '#ff5ad1', null); g.circle(1.4, -12, 1.4, '#14080a', null); } });

  // =================================================================================================================
  // AI (one shared turn: Mildred → Granny → Brine; each hag's own planner)
  // =================================================================================================================
  /** Stand spots: here + the move action's reachable tiles (never a lethal walk). */
  function standSpots(unit, api) {
    const out = [{ x: unit.x, y: unit.y, cost: 0, path: [], aoo: 0, risk: 0, here: true }];
    if (A().cantMove(unit)) return out;
    api.reachable(unit).forEach(function (e) {
      const risk = DD.AI.pathRisk(unit, e);
      const aoo = api.aooCost(unit, e);
      if (risk.lethal || aoo === Infinity) return;
      out.push({ x: e.x, y: e.y, cost: e.cost || 0, path: e.path, aoo: aoo, risk: risk.penalty || 0, here: false });
    });
    return out;
  }
  /** The best stand spot by value(p) (−Infinity = never) minus its walk's price; null when none is allowed. */
  function bestSpot(unit, api, value) {
    let best = null;
    const ox = unit.x, oy = unit.y;
    try {
      standSpots(unit, api).forEach(function (p) {
        unit.x = p.x; unit.y = p.y;
        const v = value(p);
        if (!isFinite(v)) return;
        const sc = v - p.aoo - p.risk - p.cost * 0.15 + (p.here ? 0.25 : 0);
        if (!best || sc > best.score) best = Object.assign({}, p, { score: sc });
      });
    } finally { unit.x = ox; unit.y = oy; }
    return best;
  }
  function walkTo(unit, p) {
    if (!p || p.here || (p.x === unit.x && p.y === unit.y)) return true;
    DD.AI.moveTo(unit, p.x, p.y, p.path);
    return unit.x === p.x && unit.y === p.y;
  }
  function fire(unit, api, b) {
    const def = DD.getSkill(b.skillId);
    const tu = G().unitAt(b.target.x, b.target.y);
    const aim = def && def.target && def.target.type === 'unit' && active(tu) ? tu : b.target;
    return api.act(unit, b.skillId, aim);
  }
  /** The engine's best attack among `skills`: walk there, then use it (re-aimed if a reaction cut the walk short). */
  function doBest(unit, api, skills, style, noMove) {
    let b = api.bestAttack(unit, { skills: skills, style: style, noMove: !!noMove });
    if (!b) return false;
    if (b.moveTo.x !== unit.x || b.moveTo.y !== unit.y) {
      DD.AI.moveTo(unit, b.moveTo.x, b.moveTo.y, b.path);
      if (incapacitated(unit)) return true;
      if (unit.x !== b.moveTo.x || unit.y !== b.moveTo.y) {
        b = api.bestAttack(unit, { skills: skills, style: style, noMove: true });
        if (!b) return true;
      }
    }
    fire(unit, api, b);
    return true;
  }
  function nearestFoe(p, foes) { let d = Infinity; foes.forEach(function (f) { d = Math.min(d, dist(f, p)); }); return d; }
  function adjacentFoes(p, foes) { return foes.filter(function (f) { return dist(f, p) === 1; }).length; }
  /** Charmed for its turn, a hag simply fights for the other side (her sisters are the foes now); no stirring. */
  function charmedTurn(unit, api) {
    if (!doBest(unit, api, ATTACKS[unit.defId], STYLE[unit.defId])) api.approach(unit, STYLE[unit.defId]);
  }
  /**
   * The pot first: a hag who starts her turn on a Stirring Spot stirs, then acts as usual; a hero next to her while the
   * Brew is below N.stirAt keeps her from stirring (she only fights). Granny (the cook) stirs whenever she can; her
   * sisters below N.stirAt only with nobody in reach.
   */
  function stirFirst(unit, api, cook) {
    if (!CD() || !onSpot(unit) || has(unit, 'charmed') || !api.canUse(unit, SK.stir)) return false;
    const brew = brewOf();
    const foes = api.foes(unit).filter(active);
    if (brew < N.stirAt && adjacentFoes(unit, foes)) return false;
    if (!cook && brew < N.stirAt && api.reachableTargets(unit, { skills: ATTACKS[unit.defId] }).length) return false;
    return api.act(unit, SK.stir, unit);
  }

  // -- Cousin Mildred: Night Terror on a sleeper, else Bedtime Hex on a healer / the hardest hitter; 3 tiles out, threads on heroes --
  function mildredTurn(unit, api) {
    if (incapacitated(unit)) return;
    if (has(unit, 'charmed')) { charmedTurn(unit, api); return; }
    stirFirst(unit, api, false);
    if (incapacitated(unit)) return;
    const foes = api.foes(unit).filter(active);
    if (!foes.length) return;
    const Lt = lvl(SK.terror), Lb = lvl(SK.bedtime);
    const canTerror = api.canUse(unit, SK.terror), canHex = api.canUse(unit, SK.bedtime);
    const hexV = canHex ? hexVictim(unit, foes) : null;
    const plan = function (p) {
      let best = null;
      foes.forEach(function (f) {
        if (!active(f) || dist(p, f) < 1 || !G().los(p, f)) return;
        let v = -Infinity, sk = null;
        if (canTerror && asleep(f) && dist(p, f) <= Lt.r) { v = Lt.sleepDmg + 8; sk = SK.terror; }
        else if (canHex && f === hexV && dist(p, f) <= Lb.r) { v = 15; sk = SK.bedtime; }
        else if (canTerror && dist(p, f) <= Lt.r && !asleep(f)) { v = Lt.dmg + 3 * (1 - f.hp / Math.max(1, f.maxHp)); sk = SK.terror; }
        if (sk && (!best || v > best.v)) best = { skill: sk, target: f, v: v };
      });
      return best;
    };
    const spot = bestSpot(unit, api, function (p) {
      const a = plan(p);
      if (!a) return -Infinity;
      let v = a.v + threadValue(unit, p);
      const near = nearestFoe(p, foes);
      if (near < 3) v -= (3 - near) * 4;
      return v;
    });
    if (!spot) {
      // nothing in reach: keep 3 out and the threads up
      const keep = bestSpot(unit, api, function (p) { const near = nearestFoe(p, foes); return threadValue(unit, p) - (near < 3 ? (3 - near) * 4 : near * 0.5); });
      if (keep && !keep.here) walkTo(unit, keep); else api.approach(unit, SNIPER);
      return;
    }
    walkTo(unit, spot);
    if (incapacitated(unit)) return;
    const a = plan(unit);
    if (a && api.act(unit, a.skill, a.target) && a.skill === SK.terror && !quiet()) attackBark(unit);
  }

  // -- Granny Gristle: the cook (to a free spot and stir), Cheek Pinch / Eat Your Greens otherwise --
  function grannyTurn(unit, api) {
    if (incapacitated(unit)) return;
    if (has(unit, 'charmed')) { charmedTurn(unit, api); return; }
    stirFirst(unit, api, true);
    if (incapacitated(unit)) return;
    const foes = api.foes(unit).filter(active);
    if (onSpot(unit) && upright()) {
      // the cook keeps her spot: she fights from it (Cheek Pinch next to her, Eat Your Greens further out)
      doBest(unit, api, ATTACKS[GRANNY], MELEE, true);
      return;
    } else if (upright() && brewOf() < N.brewMax) {
      const busy = brewOf() < N.stirAt;
      const spot = bestSpot(unit, api, function (p) {
        if (!onSpot(p)) return -Infinity;
        return 20 - (busy ? 4 * adjacentFoes(p, foes) : 0) + (adjacentFoes(p, foes) ? 2 : 0);
      });
      if (spot) {
        walkTo(unit, spot);
        if (incapacitated(unit)) return;
        doBest(unit, api, ATTACKS[GRANNY], MELEE, true);
        return;
      }
    }
    if (doBest(unit, api, ATTACKS[GRANNY], MELEE, onSpot(unit))) return;
    if (!onSpot(unit)) api.approach(unit, MELEE);
  }

  // -- Auntie Brine: I Was Beautiful Once on 2+, else Undertow (spot-holders first), else a free spot; ends on the threads --
  function brineTurn(unit, api) {
    if (incapacitated(unit)) return;
    if (has(unit, 'charmed')) { charmedTurn(unit, api); return; }
    stirFirst(unit, api, false);
    if (incapacitated(unit)) return;
    const foes = api.foes(unit).filter(active);
    if (!foes.length) return;
    const Lu = lvl(SK.undertow), Lv = lvl(SK.visage);
    const canPull = api.canUse(unit, SK.undertow), canVis = api.canUse(unit, SK.visage);
    const potUp = upright() && brewOf() < N.brewMax;
    const plan = function (p) {
      let best = null;
      if (canVis) {
        const n = visageVictims(p, foes, Lv.r).length;
        if (n >= 2) best = { skill: SK.visage, target: null, v: 7 * n };
      }
      if (canPull) foes.forEach(function (f) {
        if (!active(f) || dist(p, f) < 1 || dist(p, f) > Lu.r || !G().los(p, f)) return;
        const v = Lu.dmg + pullScore(p, f);
        if (!best || v > best.v) best = { skill: SK.undertow, target: f, v: v };
      });
      return best;
    };
    const spot = bestSpot(unit, api, function (p) {
      const a = plan(p);
      let v = a ? a.v : (potUp && onSpot(p) ? 6 : -Infinity);
      if (!isFinite(v)) return v;
      v += threadValue(unit, p);
      const near = nearestFoe(p, foes);
      if (near < 2) v -= (2 - near) * 4;
      return v;
    });
    if (!spot) { api.approach(unit, KITER); return; }
    walkTo(unit, spot);
    if (incapacitated(unit)) return;
    const a = plan(unit);
    if (a) api.act(unit, a.skill, a.skill === SK.visage ? unit : a.target);
  }

  // =================================================================================================================
  // Voice
  // =================================================================================================================
  // banter: [speaker def id, line] scripts, at a round start (25%, at most every other round), every speaker standing
  const BANTER = [
    [[GRANNY, 'Who\'s got the Eye?'], [BRINE, 'Mildred had it last.'], [MILDRED, 'Ugh, I\'m USING it.']],
    [[BRINE, 'Pass the Tooth, Granny.'], [GRANNY, 'I\'m chewing, dear.'], [BRINE, 'You\'ve been chewing since 1302.']],
    [[MILDRED, 'Can we order in?'], [GRANNY, 'We ARE ordering in, dear. They walked in.']],
    [[GRANNY, 'Is the cauldron on?'], [BRINE, 'It\'s been on for a century.'], [GRANNY, 'Well, stir it, then!']],
    [[BRINE, 'Svammy never visits.'], [GRANNY, 'He\'s busy, dear. Cheating.'], [MILDRED, 'He\'s SO embarrassing.']],
    [[MILDRED, 'Granny, they\'re staring.'], [GRANNY, 'Let them stare, dear. They\'re in the recipe.']],
    [[MILDRED, 'Why can\'t our cottage walk like Baba Yaga\'s?'], [GRANNY, 'It CAN, dear. It just doesn\'t like you.']],
    [[BRINE, 'Skylla still works for Baba Yaga, you know.'], [GRANNY, 'Good girl. Terrible taste in villains.'], [MILDRED, 'Five of them. FIVE.']],
  ];
  function banter(s) {
    const d = CD(s);
    if (!d || quiet() || s.round < 2 || s.round - d.banterRound < N.banterGap || DD.rng.next() >= N.banterChance) return false;
    const ok = BANTER.map(function (b, i) { return i; }).filter(function (i) {
      return !d.banter[i] && BANTER[i].every(function (l) { const m = hagOf(l[0], s); return m && !has(m, 'sheep'); });
    });
    if (!ok.length) return false;
    const i = ok[Math.floor(DD.rng.next() * ok.length) % ok.length];
    d.banter[i] = 1;
    d.banterRound = s.round;
    BANTER[i].forEach(function (l, k) {
      const m = hagOf(l[0], s);
      if (!m) return;
      if (k > 0 && !DD.FX.instant) DD.FX.wait(600);
      A().bark(m, l[1]);
      A().log(m.name + ': "' + l[1] + '"', 'enemy');
    });
    return true;
  }
  function rollCall(s) {
    SISTERS.forEach(function (id) {
      const m = hagOf(id, s);
      if (m && !sayNamed(m, N.namedChance)) A().maybeBark(m, 'spawn', 0.8);
    });
  }

  // =================================================================================================================
  // Enemies
  // =================================================================================================================
  function grannyOverlay(g, t) {
    if (g.pose === 'downed') return;
    const h = g.head;
    if (h) {
      g.ellipse(h.x + h.r * 0.45, h.y + h.r * 0.12, h.r * 0.32, h.r * 0.22, '#6f9e4a', '#1a1014');   // the nose
      g.circle(h.x + h.r * 0.6, h.y + h.r * 0.02, 0.8, '#4f7a34', null);                               // the wart
      g.rect(h.x + h.r * 0.05, h.y + h.r * 0.48, 1.5, 2.1, '#f4ecd0', '#1a1014');                      // the Tooth
    }
    const f = g.hands && g.hands.front;
    if (f) {
      const k = Math.sin(t * 6) * 0.8;   // knitting
      g.line(f.x - 1, f.y + 1, f.x + 6, f.y - 6 + k, '#d9cfa8', 1);
      g.line(f.x + 1, f.y + 1, f.x + 7 - k, f.y - 4, '#d9cfa8', 1);
      g.circle(f.x + 2, f.y + 4, 2.6, '#8e3b5c', '#1a1014');
      g.line(f.x + 0.5, f.y + 3, f.x + 3.6, f.y + 5, '#b25a7d', 0.6);
    }
  }
  function brineOverlay(g, t) {
    if (g.pose === 'downed') return;
    const h = g.head;
    if (h) {
      [-1, 1].forEach(function (k) {   // barnacles on the shoulders
        g.circle(h.x + k * h.r * 1.0, h.y + h.r * 1.45, 1.5, '#d8d2bc', '#1a1014');
        g.circle(h.x + k * h.r * 1.25, h.y + h.r * 1.75, 1.1, '#c9c2a8', '#1a1014');
      });
      [-1, 1].forEach(function (k) {   // seaweed hanging from her hair, either side of the face
        const x0 = h.x + k * h.r * 1.0, sway = Math.sin(t * 2 + k) * 1.2;
        g.path(function (c) { c.moveTo(x0, h.y); c.quadraticCurveTo(x0 + k * 2.2 + sway, h.y + h.r * 1.2, x0 + k * 0.6, h.y + h.r * 2.4); },
          null, 'rgba(58,107,53,0.95)', 1.3);
      });
    }
    const f = g.hands && g.hands.front;
    if (f) {   // the dripping ladle
      g.line(f.x, f.y, f.x + 4, f.y - 8, '#7a8794', 1.4);
      g.ellipse(f.x + 4.6, f.y - 9, 2.4, 1.6, '#7a8794', '#1a1014');
      const drip = (t * 1.5) % 1;
      g.circle(f.x + 4.6, f.y - 7 + drip * 6, 0.8, 'rgba(120,210,200,' + (1 - drip).toFixed(2) + ')', null);
    }
  }
  function mildredOverlay(g, t) {
    if (g.pose === 'downed') return;
    g.line(-12, 1.5, 12, -0.5, '#7a5230', 1.8);   // Granny's broom, under her
    g.poly([[9, -1.6], [16, -4], [17, 2], [9.6, 1]], '#c9a45a', '#1a1014', 0.8);
    const b = g.hands && g.hands.back;
    if (b) g.glow(b.x, b.y + 5, 7, '#ff5ad1', 0.35);   // the dream lantern burns pink
    const h = g.head;
    if (!h) return;
    // the nightcap: a floppy cone over the crown, its tip drooping down one side, a pompom on the end
    const top = h.y - h.r;
    g.path(function (c) {
      c.moveTo(h.x - h.r * 1.05, h.y - h.r * 0.3);
      c.quadraticCurveTo(h.x - h.r * 0.7, top - h.r * 0.95, h.x + h.r * 0.45, top - h.r * 0.55);
      c.quadraticCurveTo(h.x + h.r * 1.45, top - h.r * 0.2, h.x + h.r * 1.55, h.y + h.r * 0.15);
      c.lineTo(h.x + h.r * 1.15, h.y + h.r * 0.05);
      c.quadraticCurveTo(h.x + h.r * 1.0, top + h.r * 0.2, h.x + h.r * 0.95, h.y - h.r * 0.3);
      c.closePath();
    }, '#3a2a5a', '#1a1014');
    g.path(function (c) { c.moveTo(h.x - h.r * 1.05, h.y - h.r * 0.3); c.quadraticCurveTo(h.x, h.y - h.r * 0.55, h.x + h.r * 0.95, h.y - h.r * 0.3); }, null, '#ff5ad1');
    g.circle(h.x + h.r * 1.4, h.y + h.r * 0.3, 2, '#f4efe6', '#1a1014');   // the pompom
    const u = g.unit;
    if (u && u.statuses && !DD.Act.hasStatus(u, ST.eye)) return;   // the Eye floats over whoever holds it
    const bob = Math.sin(t * 2) * 1.2, ex = h.x, ey = h.y - h.r * 2.2 + bob, look = Math.sin(t * 0.9) * 0.9;
    g.glow(ex, ey, 6, '#ff5ad1', 0.35);
    g.circle(ex, ey, 3.2, '#f4efe6', '#1a1014');
    g.circle(ex + look, ey, 1.6, '#ff5ad1', null);
    g.circle(ex + look, ey, 0.7, '#14080a', null);
  }

  /** The stir rule for Mildred and Brine (Granny, the cook, has her own). */
  function stirLine() {
    return 'Starting her turn on a Stirring Spot at Brew ' + N.stirAt + '+ (or with nobody in reach), she first stirs (Brew +1, she sips ' +
      lvl(SK.stir).heal + ' HP) unless a hero stands next to her below Brew ' + N.stirAt + '.';
  }

  DD.registerEnemy({ id: MILDRED, name: 'Cousin Mildred', act: 4, tier: 'elite', pronoun: 'she', hp: N.hp[MILDRED], mov: 4, armor: 0, init: 1,
    tags: [TAG, 'hag'], flags: { flying: true }, resist: {},
    sprite: { base: 'humanoid', scale: 1.0, build: 'slim', outfit: 'robe',
      palette: { skin: '#6b4a7a', cloth: '#1c1530', cloth2: '#3a2a5a', hair: '#e8e8f0', eye: '#ff5ad1', metal: '#9a8fb0', accent: '#ff5ad1' },
      head: { hair: 'long', eyes: 'sleepy', mouth: 'frown' }, offhand: 'lantern', overlay: mildredOverlay },
    skills: [SK.terror, SK.bedtime, SK.stir], ai: mildredTurn, aiStyle: SNIPER, xp: 15, gold: [5, 9],
    passive: { name: 'The Eye', icon: '👁️', desc: function (u) {
      const Lt = liveLvl(SK.terror, u), Lb = lvl(SK.bedtime);
      return 'She holds the Coven\'s one Eye: Granny Gristle and Auntie Brine act on her turn, right after her; when she falls, the Eye rolls under ' +
        'the dresser and they take their own turns from the next round. On her turn she keeps 3 tiles from the heroes, where her Hex Threads cross ' +
        'them: Night Terror on a sleeping hero (' + Lt.sleepDmg + ' psychic within ' + Lt.r + '), else Bedtime Hex (Asleep until the end of the ' +
        'Coven\'s next turn, within ' + Lb.r + ', cooldown ' + DD.getSkill(SK.bedtime).cooldown + ') on the hero with a heal ready or the hardest hitter, else Night ' +
        'Terror (' + Lt.dmg + '). ' + stirLine() + ' She flies on Granny\'s broom: bog, pools and lava never touch her.';
    } },
    hooks: hooksFor(),
    barks: {
      spawn: ['Ugh, Granny, I\'m NOT a morning person.', 'I\'m a NIGHT hag. Why is everyone so awake?', 'Can you fight quieter? Some of us sleep in.'],
      attack: ['Sweet nightmares. Ugh. Whatever.', 'Go to sleep. Forever, ideally.', 'I\'ll haunt your dreams. Mostly the boring ones.'],
      hurt: ['Ow! Granny, they hit me!', 'This is SO embarrassing.', 'I\'m telling Auntie Brine.'],
      death: ['Finally... a nap...', 'Wake me... never...'],
      hex: ['Nap time. For you. Not me. Sadly.', 'Shh. Bedtime. I\'m counting sheep. You\'re one.'],
      pie: ['Fine. I\'ll do the pie. AGAIN.', 'Hero Pie\'s in. Can I go back to bed now?'],
      stir: ['Stirring. Ugh. Like I\'m not busy.', 'Round and round. This is my whole life.'],
      tipped: ['Great. Now the whole cottage smells like hero.', 'I am NOT mopping that.'],
      last: ['Ugh. I have to do EVERYTHING.'],
      mourn_granny: ['Granny! ...Okay. Now I\'m awake.'],
      mourn_brine: ['Auntie! ...Can I have your shawl?'],
    },
    desc: 'A night hag, the youngest of the Coven at six hundred, and not a morning person. Wears a nightcap into battle. Would rather be asleep. ' +
      'She holds the Coven\'s one shared Eye, so the others act on her turn: take her down and they fall out of step.' });

  DD.registerEnemy({ id: GRANNY, name: 'Granny Gristle', act: 4, tier: 'elite', pronoun: 'she', hp: N.hp[GRANNY], mov: 3, armor: 1, init: 0,
    actsWithOwner: true, tags: [TAG, 'hag'], flags: {}, resist: {},
    sprite: { base: 'humanoid', scale: 1.2, build: 'stocky', outfit: 'rags', hunch: 0.5,
      palette: { skin: '#7fae5a', cloth: '#5a4a3a', cloth2: '#c7b299', hair: '#d9d9d0', eye: '#ffeb3b', metal: '#8a8a8a', accent: '#8e3b5c' },
      head: { hair: 'bun', eyes: 'normal', mouth: 'grin' }, extras: ['scarf'], overlay: grannyOverlay },
    skills: [SK.pinch, SK.greens, SK.stir], ai: grannyTurn, aiStyle: MELEE, xp: 15, gold: [5, 9],
    passive: { name: 'The Cook', icon: '🥄', desc: function (u) {
      const Lp = liveLvl(SK.pinch, u), Lg = liveLvl(SK.greens, u);
      return 'The cook: she heads for a free Stirring Spot and stays there. Starting her turn on one, she first stirs the pot (Brew +1, she sips ' +
        lvl(SK.stir).heal + ' HP) unless a hero stands next to her while the Brew is below ' + N.stirAt + ', then fights from it: Cheek Pinch (' +
        Lp.dmg + ', Rooted through its next turn) next to her, Eat Your Greens (' + Lg.dmg + ' within ' + Lg.r + ', bog around the target) further ' +
        'out. Walk away from her and she pinches (attack of opportunity).';
    } },
    hooks: hooksFor(),
    barks: {
      spawn: ['Visitors! You\'re all skin and bones. I\'ll fix that.', 'Come in, dearies. Mind the cat. Mind the cauldron more.',
        'Sit, sit. Supper\'s nearly ready. You\'re supper.'],
      attack: ['Eat your greens! The greens are curses.', 'Knit one, curse two.', 'Back in my day we cursed people PROPERLY.',
        'That\'s for tracking mud on my floor.'],
      hurt: ['Ooh, cheeky!', 'Mind your manners, dearie!', 'I\'ve had worse from the postman.'],
      death: ['Ooh... the kettle\'s... still on...', 'Tell little Svammy... wings off the furniture...'],
      stir: ['Stir, stir. A watched pot never boils. So watch it.', 'Just a pinch of hero. Maybe two.', 'Family recipe. Older than your grandma.'],
      pie: ['Hero Pie! Bake at full boil, serves three.', 'Supper\'s ready, dearies! You\'re the filling.'],
      tipped: ['My CAULDRON! You\'ll be mopping that up!', 'Seven hundred years and nobody\'s EVER... oh. You did.'],
      eye: ['Who\'s got the Eye? I can\'t see a THING.', 'Somebody find the Eye! Check under the dresser!'],
      last: ['Just me then. Fine. I\'ve buried better.'],
      mourn_brine: ['Brine! Who\'ll do the washing up now?'],
      mourn_mildred: ['My little Mildred! She never learned to cackle properly.'],
    },
    desc: 'A green hag and head of the Coven. Knits shrouds, bakes pies and babysat Svammiel for six centuries. Calls him Svammy. He hates it. ' +
      'The family cook: she heads for the cauldron and stirs. Keep her off the stirring spots.' });

  DD.registerEnemy({ id: BRINE, name: 'Auntie Brine', act: 4, tier: 'elite', pronoun: 'she', hp: N.hp[BRINE], mov: 4, armor: 0, init: 1,
    actsWithOwner: true, tags: [TAG, 'hag'], flags: {}, resist: {},
    sprite: { base: 'humanoid', scale: 1.3, build: 'slim', outfit: 'dress',
      palette: { skin: '#5f9ea0', cloth: '#2f4f4f', cloth2: '#3a6b5a', hair: '#3a6b35', eye: '#e0ffff', metal: '#7a8794', accent: '#4fb0a8' },
      head: { hair: 'long', eyes: 'normal', mouth: 'frown' }, aura: { kind: 'bubbles', color: '#8fd8d0' }, overlay: brineOverlay },
    skills: [SK.undertow, SK.visage, SK.stir], ai: brineTurn, aiStyle: KITER, xp: 15, gold: [5, 9],
    passive: { name: 'Low Tide', icon: '🌊', desc: function (u) {
      const Lu = liveLvl(SK.undertow, u), Lv = lvl(SK.visage);
      return stirLine() + ' Then I Was Beautiful Once (Confused) when 2+ heroes within ' + Lv.r + ' can see her, else Undertow (' + Lu.dmg +
        ', pulled ' + Lu.pull + ' toward her), dragging heroes off the Stirring Spots first; with nobody to pull she takes a free spot. She acts ' +
        'last and ends her move where her Hex Threads cross the most heroes.';
    } },
    hooks: hooksFor(),
    barks: {
      spawn: ['The tide\'s coming in, and so is your doom.', 'Don\'t mind the puddle, darling. The puddle is me.',
        'Visitors! I haven\'t been this excited since the flood.'],
      attack: ['Low tide, high doom!', 'Salt in the wound, darling. Sea salt.', 'Have some brine! It\'s good for the skin. Not yours.'],
      hurt: ['You\'ve ruined my seaweed!', 'I was beautiful once! Then I was moist.', 'How DARE you. I\'m DAMP.'],
      death: ['Return me... to the sea... or a nice bath...', 'Washed up... at last...'],
      visage: ['Behold! I was beautiful once!', 'Look upon me! ...Not too closely.'],
      pull: ['Come here, darling. The current insists.', 'In you come! The water\'s lovely. It isn\'t.'],
      stir: ['A splash of brine for flavour, Granny?', 'Stirring! Clockwise, like the tide.'],
      tipped: ['The broth! It\'s everywhere! Like a flood, but worse!'],
      last: ['Alone? The tide waits for no hag.'],
      mourn_granny: ['Granny! Who has the recipe?! IT\'S IN HER HEAD!'],
      mourn_mildred: ['Mildred! You were finally asleep!'],
    },
    desc: 'A sea hag who has smelled of low tide since the great flood. Insists she was beautiful once. Was moist instead. She drags heroes off ' +
      'the stirring spots with the Undertow, and anyone who looks at her too closely gets Confused.' });

  // =================================================================================================================
  // The arena and the encounter
  // =================================================================================================================
  const LAYOUT = [
    'T..,,,..,,,..T',
    '..h...~~...,,.',
    '.,,....1...,..',
    '..x..........x',
    '...,2..s..3...',
    '~~...,sCs,..~~',
    '~~.,...s...,~~',
    '..T...,,...T..',
    '.,,..x....x,,.',
    '......,,......',
    '...HHHHHHHH...',
    '..HHHHHHHHHH..',
    'T............T',
  ];
  const SPAWN = { terrain: 'moss', zone: 'enemy' };

  function encStart(state) {
    const p = state.grid.tiles.filter(function (t) { return t.obj && t.obj.id === CAULDRON; })[0];
    state.data.coven = {
      brew: 0, pie: null, tipped: 0, eye: false, eyeRound: 0, pot: p ? { x: p.x, y: p.y } : null, fired: {},
      banterRound: -9, banter: {}, rolled: false, last: false, over: false,
      stats: { stirs: 0, full: 0, pies: 0, pieLanded: 0, pieStopped: 0, pieTipped: 0, tipped: 0, threads: 0, threadHits: 0, spotsHeld: 0,
        intoPot: 0, eyeDropped: 0, sleeps: 0, terrors: 0, bubbles: 0, bogged: 0, dragged: 0 },
    };
    // E1: Granny and Brine act on the Eye-holder's turn (their defs say actsWithOwner; the owner is set before the roll)
    const m = state.units.filter(function (u) { return !u.dead && u.defId === MILDRED; })[0];
    if (m) {
      state.units.forEach(function (u) { if (!u.dead && (u.defId === GRANNY || u.defId === BRINE)) u.ownerId = m.id; });
      state.data.coven.eye = true;
      A().addStatus(m, ST.eye, { turns: -1, silent: true }, m);
    }
    A().addRule({ id: RULE, name: ruleName(state.data.coven, 0), icon: '🧪', desc: ruleDesc(), turns: -1, silent: true, brew: 0, threads: 0 });
    A().log('Granny Gristle: "Oh, visitors! Mildred, put the kettle on. Brine, fetch the big pot. The BIG one."', 'enemy');
    A().touch();
    sync(state);
  }
  function encRoundStart(state) {
    const d = CD(state);
    if (!d) return;
    sync(state);
    if (quiet()) return;
    if (!d.rolled) {
      d.rolled = true;
      rollCall(state);
      A().narrate('cov_tip', {});
      return;
    }
    banter(state);
  }
  function encRoundEnd(state) {
    const d = CD(state);
    if (!d) return;
    spotList(state).forEach(function (t) { const o = G().unitAt(t.x, t.y); if (active(o) && o.side === 'hero') stat('spotsHeld'); });
    if (d.tipped && state.round >= d.tipped) {
      d.tipped = 0;
      A().touch();
      if (!quiet()) A().log('The Family Cauldron rights itself with a clang. It can be stirred again.', 'enemy');
    }
    sync(state);
  }

  DD.registerEncounter({ id: ENC, act: 4, kind: 'boss', name: 'Tea with the Coven', shortName: 'The Coven', icon: '🫖', weight: 0, minDepth: 0,
    gauntlet: { lane: 'coven', order: 4, hint: 'Hold the cauldron. Break their line of sight.' },
    banner: false,
    cameo: { start: 'svam_cameo_coven', cheat: 'svam_cameo_lava', interjections: true },
    intro: 'A gingerbread cottage, condemned. Three rocking chairs, one eye on the mantelpiece and a cauldron that smells like a family recipe. ' +
      'The recipe calls for heroes.',
    map: {
      theme: 'a4_cottage', layout: LAYOUT,
      legend: {
        '.': { terrain: 'moss' },
        ',': { terrain: BOG },
        '~': { terrain: 'water' },
        'T': { terrain: 'moss', obj: { id: 'tree', label: 'Gnarled Tree' } },
        'h': { terrain: 'moss', obj: { id: COTTAGE } },
        'C': { terrain: 'moss', obj: { id: CAULDRON } },
        's': { terrain: 'moss', obj: { id: SPOT } },
        'x': { terrain: 'moss', obj: { id: BUBBLE } },
        '1': SPAWN, '2': SPAWN, '3': SPAWN,
        'H': { terrain: 'moss', zone: 'hero' },
      },
    },
    // Mildred first: the shared turn runs owner first, then the units in spawn order (Granny, then Brine)
    enemies: [{ id: MILDRED, n: 1, mark: '1' }, { id: GRANNY, n: 1, mark: '2' }, { id: BRINE, n: 1, mark: '3' }],
    objective: { type: 'boss', bossIds: [MILDRED, GRANNY, BRINE], flavor: 'Brew 0/' + N.brewMax + '. Hold the stirring spots; tip the pot before it boils over.' },
    onStart: encStart, onRoundStart: encRoundStart, onRoundEnd: encRoundEnd,
    reward: { goldMult: 0.9, itemRarity: 'rare' } });

  // =================================================================================================================
  // Narration (the act-4 DM narrates demoted, whispering)
  // =================================================================================================================
  DD.registerNarration('cov_tip', [
    'DM (whispering): "Stand on the stirring spots. They can\'t stir from your seat."',
    'DM (whispering): "That cauldron is cooking something. Tip it over before it\'s done."',
  ]);
  DD.registerNarration('cov_eye', [
    'The Eye rolls under the dresser. From the dark, two voices: "Who\'s got the Eye?" "Not ME."',
    'Without the Eye the Coven falls out of step. Somebody walks into a rocking chair.',
  ]);
  DD.registerNarration('cov_pie_windup', [
    'The cauldron turns a sickly orange and starts to rattle. Somewhere in the cottage, an oven timer begins to tick.',
    'The Brew hits the top line. A pie dish comes off the shelf. It is hero-shaped.',
  ]);
  DD.registerNarration('cov_pie', [
    'The cauldron boils over and the whole bog smells of pastry and regret.',
    'Hero Pie, served piping hot, mostly onto the heroes.',
  ]);
  DD.registerNarration('cov_tipped', [
    'Over goes the Family Cauldron. Seven centuries of recipe soak into the moss.',
    'SPLOSH. The cottage gasps. The cat, judging, moves to a drier chair.',
  ]);
  DD.registerNarration('cov_death', [
    'The cauldron boils over, the Eye rolls under the dresser and the cottage finally goes quiet. Someone should turn the kettle off.',
    'On the mantelpiece, a framed picture of baby Svammiel in a bonnet falls face down. Nobody will ever speak of it.',
  ]);

  // =================================================================================================================
  // Public helpers (tests, sims)
  // =================================================================================================================
  DD.Coven = {
    N: N, SK: SK, ST: ST, ENC: ENC, RULE: RULE, SISTERS: SISTERS.slice(), NAMED: NAMED, BANTER: BANTER, LAYOUT: LAYOUT,
    CAULDRON: CAULDRON, SPOT: SPOT, BUBBLE: BUBBLE, COTTAGE: COTTAGE, EYE_CODEX: EYE_CODEX, BOG: BOG,
    data: CD, brew: brewOf, setBrew: setBrew, addBrew: addBrew,
    pot: pot, upright: upright, onSpot: onSpot, spots: spotList, stirWhy: stirWhy,
    lineTiles: lineTiles, threads: function (s) { return threadsOf(s).slice(); }, fireThreads: fireThreads, threadThreat: threadThreat,
    maybePie: maybePie, checkPie: checkPie, tipOver: tipOver, tipValue: tipValue, spotValue: spotValue, turnEnd: covenTurnEnd,
    sync: sync, ruleDesc: ruleDesc, namedLine: namedLine, hexVictim: hexVictim, pullEnd: pullEnd, bogTiles: bogTiles,
    /** Puzzle engagement this fight (sims): stirs, pies, tips, threads, spots held, … */
    stats: function (s) { const d = CD(s); return d ? Object.assign({}, d.stats) : {}; },
  };
})();
