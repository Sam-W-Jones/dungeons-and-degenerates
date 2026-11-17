/* Dungeons and Degenerates — js/data/bosses/gardener.js
 * Act IV door 1 (V3, plan .tmp/v3/design.md §3.1, §5.3, §6.2): THE GARDENER (it), a giant clockwork spider
 * groundskeeper Svammiel ordered from a catalogue. Encounter 'boss_gardener', "The Overgrown Conservatory" (theme
 * a4_conservatory, 14 × 12). A solo mini-boss (tier boss, boss.mini; plan §3.0.1).
 *   The puzzle: its garden heals it and fights for it, and the garden is also its weakness.
 *   - Photosynthesis: at its turn start it heals 4 per plant on the field (Strangler Vines and Pump-kabooms), at most 16.
 *   - Each turn: one action from its docket (Planting Season → Prune → Seed Spitter → Prune, with fallbacks), then a
 *     wind-up (Mow the Lawn → Harvest Festival; phase 2 adds Weed and Feed).
 *   - Mow the Lawn: a 3-wide lane up to 7 long from where it stands (the most grounded heroes; it never looks for
 *     gnomes). A Garden Gnome in the middle of the lane jams it: 20 damage and Stunned (that turn is lost).
 *   - Weed-B-Gone Drums: a blast that Corrodes the Gardener (armor 0, +25% damage taken) and wipes plants within 2.
 *   - Phase 2 "Overgrowth Mode" at half HP (160 of 320; the damage carries over): 5 per plant (at most 20), move +1, two
 *     vines a seed, up to 6 gourds, Weed and Feed joins the wind-ups.
 *   - Safe Mode (the DM's stun guard): after a stun lands, stuns from others are refused until it has played a turn.
 * Strangler Vines (minions, tag 'plant') act on the Gardener's turn (E1 actsWithOwner) and grab with Grabby Tendril.
 * Every bit of boss state lives in the unit's data (previews and dry runs copy it). Cosmetic picks use DD.rng only.
 * The Gardener is "it" everywhere; it speaks in bracketed tags and gentle sentences.
 */
(function () {
  'use strict';
  const DD = window.DD;
  const U = DD.util;

  // ---- ids ------------------------------------------------------------------------------------------------------
  const GARD = 'gard_gardener', VINE = 'gard_vine', ENC = 'boss_gardener';
  const GOURD = 'gard_gourd', DRUM = 'gard_drum', GNOME = 'gard_gnome';
  const SK = { shears: 'gard_shears', trimmer: 'gard_trimmer', spitter: 'gard_spitter', plant: 'gard_plant', mow: 'gard_mow',
    harvest: 'gard_harvest', weedfeed: 'gard_weedfeed', tendril: 'gard_tendril', rustle: 'gard_rustle' };
  const ST = { corroded: 'gard_corroded' };

  // ---- knobs (BAL tunes these; the descs read them) ---------------------------------------------------------------
  const N = {
    hp: 320, p2: 160,                        // Overgrowth Mode at half HP, 160 of 320 (a share of max HP: difficulty scales both)
    armor: 2, mov: 4, movP2: 5,
    photo: 4, photoMax: 16, photoP2: 5, photoMaxP2: 20,
    // author sims (Nov 15, 80-160 random real parties at L5): the plan's HP 300 and hits 12 / 9 / 7 / 22 / 6 / 14 won 87%
    // (band 63-74%); the hits at the top of the plan's bands won ~76% at 300 HP, ~71% at 320 (docs/notes/boss-gardener.md)
    shears: 14, trimmer: 11, spit: 8,
    mow: 26, jam: 20, laneLen: 7,
    gourd: 10, harvestMin: 2, weedfeed: 16, weedPoison: 3, weedN: 2,
    vineHp: 20, tendril: 7, vineCap: 4, vineCapP2: 6,
    gourdHp: 4, gourdCap: 4, gourdCapP2: 6, plantN: 2, gourdHint: 2,
    drumHp: 3, drum: 12, drumReach: 2, corrodedTurns: 2, corrodedTaken: 1.25,
    namedChance: 0.25,
  };
  const DOCKET = ['plant', 'prune', 'spit', 'prune'];
  const STEP_NAME = { plant: 'Planting Season', prune: 'Hedge Trimmer or Pruning Shears', spit: 'Seed Spitter' };
  const WIND = { 1: ['mow', 'harvest'], 2: ['mow', 'weedfeed', 'harvest'] };
  const WIND_NAME = { mow: 'Mow the Lawn', harvest: 'Harvest Festival', weedfeed: 'Weed and Feed' };
  const C = { brass: '#b8862b', brassD: '#7a5718', verd: '#4f9a83', glass: 'rgba(200,255,240,0.35)', leaf: '#4caf50', leafD: '#2e7d32',
    eye: '#9dff6a', eyeP2: '#ffb347', straw: '#e8c872', strawD: '#b8964a', ribbon: '#d9534f', steel: '#c9ced6', wood: '#8a5a2b',
    ink: '#1a1410', petal: '#e0457b', gourd: '#e8862a' };
  // grid order for ties: −y, +x, +y, −x (the lane rule of plan §3.1)
  const LANE_DIRS = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];
  const TAU = Math.PI * 2;

  // ---- small helpers --------------------------------------------------------------------------------------------
  function S() { return DD.Combat && DD.Combat.state; }
  function A() { return DD.Act; }
  function G() { return DD.Grid; }
  function active(u) { return !!u && !u.dead && !u.downed; }
  function has(u, id) { return DD.Act.hasStatus(u, id); }
  function quiet() { return !!(DD.Act && DD.Act.simulating); }
  function isGard(u) { return !!u && u.defId === GARD; }
  function isVine(u) { return !!u && u.defId === VINE; }
  function dist(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }
  function key(p) { return p.x + ',' + p.y; }
  function incapacitated(u) { return !active(u) || DD.Act.isStunned(u) || has(u, 'sheep'); }
  function round() { const s = S(); return s ? s.round : 0; }
  function eskill(def) { def.owner = 'enemy'; def.ap = 0; return DD.registerSkill(def); }
  function lvl(id, level) { const s = DD.getSkill(id); return (s && DD.skillLevel(s, level || 1)) || {}; }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
  function perpOf(dir) { return { x: -dir.y, y: dir.x }; }
  function grounded(u) { return !G().isFlying(u); }
  function bark(u, key, chance) { if (!quiet() && active(u)) A().maybeBark(u, key, chance === undefined ? 1 : chance); }
  function heroFoes(unit) { return DD.AI.targetsFor(unit).filter(function (f) { return f.kind === 'hero' && active(f); }); }
  /** The living Gardener of a fight (looked up every time: previews swap DD.Combat.state). */
  function findGard(state) {
    const s = state || S();
    if (!s || !s.units) return null;
    for (let i = 0; i < s.units.length; i++) if (isGard(s.units[i]) && !s.units[i].dead) return s.units[i];
    return null;
  }
  /** Boss state on the unit (created on first use). */
  function boss(u) {
    const d = u.data || (u.data = {});
    if (!d.gard) {
      d.gard = { phase: 1, docket: 0, wind: 0, turns: 0, guard: null, lostTurn: false, tipped: false, p2Round: 0,
        stats: { turns: 0, healed: 0, photo: 0, planted: 0, sprouted: 0, spits: 0, shears: 0, trims: 0, mows: 0, mowHits: 0, mowed: 0,
          jams: 0, harvests: 0, harvestBursts: 0, weedfeeds: 0, weedHits: 0, drums: 0, corroded: 0, stuns: 0, refused: 0, lost: 0,
          vinesKilled: 0, gourdsPopped: 0, overgrowth: 0 } };
    }
    return d.gard;
  }
  function pendingWindup(u) { return ((u && u.intents) || []).some(function (i) { return i && i.windup; }); }
  function windupOf(u, id) { return ((u && u.intents) || []).filter(function (i) { return i && i.skillId === id; })[0] || null; }

  // ---- the garden: plants, gourds, drums, gnomes --------------------------------------------------------------------
  function vinesOf(state) {
    const s = state || S();
    return s && s.units ? s.units.filter(function (u) { return isVine(u) && !u.dead; }) : [];
  }
  function objTiles(id, state) {
    const s = state || S();
    return s && s.grid ? s.grid.tiles.filter(function (t) { return t.obj && t.obj.id === id; }) : [];
  }
  function gourdTiles(state) { return objTiles(GOURD, state); }
  function plantCount(state) { return vinesOf(state).length + gourdTiles(state).length; }
  function phaseOf(u) { return u && u.data && u.data.gard ? u.data.gard.phase : 1; }
  function photoRate(u) { return phaseOf(u) === 2 ? { per: N.photoP2, max: N.photoMaxP2 } : { per: N.photo, max: N.photoMax }; }
  /** Photosynthesis right now: { plants, heal } (before the HP cap). Pure. */
  function photoNow(u, state) {
    const r = photoRate(u), n = plantCount(state);
    return { plants: n, heal: Math.min(r.max, r.per * n), per: r.per, max: r.max };
  }
  function vineCap(u) { return phaseOf(u) === 2 ? N.vineCapP2 : N.vineCap; }
  function gourdCap(u) { return phaseOf(u) === 2 ? N.gourdCapP2 : N.gourdCap; }
  /** A tile a vine or a gourd can grow on: free floor (no unit, no object), no pit or drop. */
  function plantable(x, y) {
    if (!G().inBounds(x, y)) return false;
    const t = G().tile(x, y);
    if (!t || t.obj || G().unitAt(x, y) || G().isPit(x, y) || G().isDrop(x, y)) return false;
    const td = G().terrain(t);
    return td.walkable !== false && td.liquid !== 'deep' && td.liquid !== 'lava';
  }
  /** Free tiles next to `at`, best first: next to the most heroes, then nearest the Gardener, then grid order. */
  function spotsNextTo(at, near, taken) {
    const out = [];
    U.DIRS.forEach(function (d, i) {
      const p = { x: at.x + d.x, y: at.y + d.y };
      if (!plantable(p.x, p.y) || (taken && taken[key(p)])) return;
      let heroes = 0;
      U.DIRS.forEach(function (e) { const v = G().unitAt(p.x + e.x, p.y + e.y); if (active(v) && v.kind === 'hero') heroes++; });
      out.push({ x: p.x, y: p.y, heroes: heroes, d: near ? dist(p, near) : 0, i: i });
    });
    return out.sort(function (a, b) { return b.heroes - a.heroes || a.d - b.d || a.i - b.i; });
  }
  /** Planting Season: up to n tiles, one next to each of up to n heroes (clustered heroes first). */
  function plantSpots(unit, n) {
    const s = S();
    if (!s || !unit) return [];
    const heroes = heroFoes(unit);
    const crowd = function (h) { return heroes.filter(function (o) { return o !== h && dist(o, h) <= 2; }).length; };
    heroes.sort(function (a, b) { return crowd(b) - crowd(a) || dist(a, unit) - dist(b, unit) || s.units.indexOf(a) - s.units.indexOf(b); });
    const taken = {}, out = [];
    for (let i = 0; i < heroes.length && out.length < n; i++) {
      const p = spotsNextTo(heroes[i], unit, taken)[0];
      if (!p) continue;
      taken[key(p)] = 1;
      out.push({ x: p.x, y: p.y, heroId: heroes[i].id });
    }
    return out;
  }

  // ---- Corroded (the Weed-B-Gone drum) ------------------------------------------------------------------------------
  DD.registerStatus({ id: ST.corroded, name: 'Corroded', icon: '🧪', color: '#9bd34c', type: 'debuff', stacking: 'refresh', maxStacks: 1,
    decay: 'turnEnd', defaultTurns: N.corrodedTurns, takenMult: N.corrodedTaken,
    desc: function (st) {
      const left = st && st.turns > 0 ? ' (' + plural(st.turns, 'more turn') + ')' : '';
      return 'Armor 0 and +25% damage taken.' + left;
    },
    hooks: {
      // armor 0: the hit ignores its armor (the +25% is the declared takenMult)
      modifyIncomingDamage: function (d) { if (d && d.target && d.target.armor > 0) d.ignoreArmor = true; },
      // honesty: DD.AI.estimate subtracts armor after the flats, so a flat of +armor cancels it
      estimateTaken: function (e) { if (e && e.target && e.target.armor > 0) e.flat += e.target.armor; },
    } });

  // ---- the lane (Mow the Lawn) ---------------------------------------------------------------------------------------
  /** Terrain a walker can't mow across: walls, pits, deep water. */
  function laneWall(t) {
    const td = G().terrain(t);
    return td.walkable === false || !!td.pit || td.liquid === 'deep';
  }
  /**
   * The lane from u toward dir: rows k = 1..7, each the middle tile and its two neighbours across. The lane ends at the
   * board edge, a wall, a pit or deep water, a step it can't climb, or an indestructible blocker (topiary, pillars) in
   * the middle column. A Garden Gnome in the middle column ends the MARKED lane there (the gnome's tile is marked: the
   * jam), while `full` runs on past it (the Gardener never looks: it scores heroes beyond the gnome too).
   * → { dir, tiles (marked), full, gnome: {x,y,k} | null, rows }. Pure.
   */
  function laneOf(u, dir, from) {
    const o0 = from || { x: u.x, y: u.y };
    const per = perpOf(dir);
    const tiles = [], full = [], seen = {};
    let gnome = null, rows = 0, prev = { x: o0.x, y: o0.y };
    const addTo = function (list, p, tag) { const k = tag + key(p); if (seen[k]) return; seen[k] = 1; list.push({ x: p.x, y: p.y }); };
    for (let k = 1; k <= N.laneLen; k++) {
      const m = { x: o0.x + dir.x * k, y: o0.y + dir.y * k };
      if (!G().inBounds(m.x, m.y)) break;
      const t = G().tile(m.x, m.y);
      if (laneWall(t)) break;
      if (!G().canStep(u, prev, m)) break;
      const ob = t.obj;
      const isGnome = !!ob && ob.id === GNOME;
      if (ob && !isGnome && G().objBlocksMove(ob) && !(ob.hp > 0)) break;
      const row = [m, { x: m.x + per.x, y: m.y + per.y }, { x: m.x - per.x, y: m.y - per.y }].filter(function (p) {
        return G().inBounds(p.x, p.y) && !laneWall(G().tile(p.x, p.y));
      });
      row.forEach(function (p) { addTo(full, p, 'f'); });
      if (!gnome) {
        if (isGnome) { gnome = { x: m.x, y: m.y, k: k }; addTo(tiles, m, 't'); }
        else { row.forEach(function (p) { addTo(tiles, p, 't'); }); rows++; }
      }
      prev = m;
    }
    return { dir: { x: dir.x, y: dir.y }, tiles: tiles, full: full, gnome: gnome, rows: rows };
  }
  /** Lane score: 2 per grounded hero, 1 per grounded hero-side summon in the whole lane (gnomes ignored); a taunter +10. */
  function laneScore(u, lane) {
    const s = S();
    const set = {};
    lane.full.forEach(function (p) { set[key(p)] = 1; });
    const taunt = DD.AI.activeTaunter ? DD.AI.activeTaunter(u) : null;
    let score = 0;
    s.units.forEach(function (v) {
      if (!active(v) || v === u || !set[key(v)] || !G().hostile(u, v) || !grounded(v)) return;
      score += v.kind === 'hero' ? 2 : 1;
      if (taunt && v === taunt) score += 10;
    });
    return score;
  }
  /** The lane it mows: the best score > 0 among the four grid directions, ties in grid order. → lane + score | null. */
  function pickLane(u) {
    let best = null;
    LANE_DIRS.forEach(function (dir) {
      const lane = laneOf(u, dir);
      if (!lane.tiles.length) return;
      const sc = laneScore(u, lane);
      if (sc > 0 && (!best || sc > best.score)) best = Object.assign(lane, { score: sc });
    });
    return best;
  }
  function windMow(u, lane) {
    if (!u || !lane || !lane.tiles.length) return null;
    const tp = { x: u.x + lane.dir.x, y: u.y + lane.dir.y };
    const hint = lane.gnome ? 'a gnome is in the way!' : '';
    const it = DD.AI.windUp(u, SK.mow, tp, { anchor: 'self', dir: lane.dir, label: lane.gnome ? 'Mow the Lawn: ' + hint : 'Mow the Lawn',
      tiles: lane.tiles.map(function (p) { return { dx: p.x - u.x, dy: p.y - u.y }; }), data: { hint: hint, gnome: !!lane.gnome } });
    if (!it) return null;
    if (!quiet()) {
      if (lane.gnome) {
        DD.FX.tile(lane.gnome.x, lane.gnome.y, 'pulse', { color: '#ffd76a' });
        A().log('The Gardener\'s mowing lane runs straight into a garden gnome. It has not noticed.', 'hero');
      }
      bark(u, 'mow', 0.7);
    }
    return it;
  }

  // ---- Harvest Festival and Weed and Feed ---------------------------------------------------------------------------
  /**
   * Harvest Festival: every gourd bursts (radius 1); a blast that reaches another volatile object (a Weed-B-Gone drum)
   * sets it off too, so its blast is marked as well. → { gourds, tiles, target } | null (fewer than 2 gourds). Pure.
   */
  function harvestPlan(state) {
    const s = state || S();
    const gourds = gourdTiles(s);
    if (gourds.length < N.harvestMin) return null;
    const seen = {}, tset = {}, tiles = [];
    const queue = gourds.map(function (t) { return { x: t.x, y: t.y }; });
    while (queue.length) {
      const p = queue.shift();
      if (seen[key(p)]) continue;
      seen[key(p)] = 1;
      G().shape('circle', p, null, 1).forEach(function (q) {
        if (!tset[key(q)]) { tset[key(q)] = 1; tiles.push({ x: q.x, y: q.y }); }
        const o = G().tile(q.x, q.y).obj;
        if (o && !seen[key(q)] && A().isVolatile(o)) queue.push({ x: q.x, y: q.y });
      });
    }
    return { gourds: gourds.map(function (t) { return { x: t.x, y: t.y }; }), tiles: tiles, target: { x: gourds[0].x, y: gourds[0].y } };
  }
  /** Weed and Feed: radius 1 around up to 2 heroes (the most crowded first, never two overlapping centres). Pure. */
  function weedPlan(unit) {
    const s = S();
    const heroes = heroFoes(unit);
    if (!heroes.length) return null;
    const crowdOf = function (h) { return s.units.filter(function (o) { return active(o) && G().hostile(unit, o) && dist(o, h) <= 1; }).length; };
    const order = heroes.slice().sort(function (a, b) { return crowdOf(b) - crowdOf(a) || a.hp - b.hp || s.units.indexOf(a) - s.units.indexOf(b); });
    const centers = [];
    order.forEach(function (h) {
      if (centers.length >= N.weedN || centers.some(function (c) { return dist(c, h) <= 2; })) return;
      centers.push({ x: h.x, y: h.y });
    });
    const tiles = [], seen = {};
    centers.forEach(function (c) {
      G().shape('circle', c, null, 1).forEach(function (p) {
        if (!seen[key(p)] && !(p.x === unit.x && p.y === unit.y)) { seen[key(p)] = 1; tiles.push({ x: p.x, y: p.y }); }
      });
    });
    return { centers: centers, tiles: tiles };
  }

  // ---- phases -----------------------------------------------------------------------------------------------------
  /** HP at which Overgrowth Mode starts (160 of 320, half: the same share of a scaled max HP). */
  function threshold(u) { return Math.ceil((u ? u.maxHp : N.hp) * N.p2 / N.hp); }
  function syncKit(u) {
    const lv = boss(u).phase === 2 ? 2 : 1;
    (u.skillSlots || []).forEach(function (sl) { if ((sl.id === SK.spitter || sl.id === SK.plant) && sl.level !== lv) { sl.level = lv; A().touch(); } });
  }
  function enterOvergrowth(u) {
    const d = boss(u);
    if (d.phase !== 1) return;
    const r1 = WIND[1][d.wind % WIND[1].length];
    d.phase = 2;
    d.docket = 0;
    d.wind = Math.max(0, WIND[2].indexOf(r1));
    d.p2Round = round() || 1;
    d.stats.overgrowth = d.p2Round;
    u.mov += N.movP2 - N.mov;
    syncKit(u);
    A().touch();
    if (!quiet()) {
      DD.FX.flash('#9dff6a', 240);
      DD.FX.shake(6, 380);
      DD.FX.banner('[OVERGROWTH MODE]', { sub: '"The garden is no longer optional."', color: C.leaf, ms: 1300 });
      A().log('OVERGROWTH MODE! The Gardener now heals ' + N.photoP2 + ' per plant (at most ' + N.photoMaxP2 + '), moves ' + u.mov +
        ', sprouts two Strangler Vines with each seed (max ' + N.vineCapP2 + '), plants up to ' + N.gourdCapP2 +
        ' Pump-kabooms and adds Weed and Feed to its wind-ups.', 'enemy');
      A().narrate('gard_overgrowth', {});
      bark(u, 'phase', 1);
      if (DD.Cameo && DD.Cameo.say) DD.Cameo.say('svammiel', 'svam_phase', { enemy: u.name });
    }
    updateFlavor(u);
  }
  function syncPhase(u) { if (boss(u).phase === 1 && active(u) && u.hp <= threshold(u)) enterOvergrowth(u); }

  // ---- the objective subtitle and the inspect line ------------------------------------------------------------------
  function gnomesLeft(state) { return objTiles(GNOME, state).length; }
  function updateFlavor(u) {
    const s = S();
    if (!s || !s.objective || !u || !active(u)) return;
    const ph = photoNow(u), g = gnomesLeft();
    const weed = ph.plants ? 'Weed it: ' + plural(ph.plants, 'plant') + (ph.plants === 1 ? ' heals' : ' heal') + ' it ' + ph.heal + ' a turn.' :
      'Weed every sprout: each plant heals it ' + ph.per + ' a turn.';
    const drums = objTiles(DRUM).length;
    const gnome = g ? ' Bait its mower over a garden gnome (' + g + ' left).' :
      drums ? ' No gnomes left: set off a Weed-B-Gone drum next to it (Corroded).' : ' No gnomes and no drums left: burn the garden.';
    const text = (boss(u).phase === 2 ? 'OVERGROWTH MODE! ' : '') + weed + gnome;
    if (s.objective.flavor !== text) { s.objective.flavor = text; A().touch(); }
  }
  function passiveText(u) {
    const d = u && u.data && u.data.gard;
    const r = photoRate(u);
    let txt = 'Photosynthesis: at the start of its turn it heals ' + r.per + ' per plant on the field (Strangler Vines and Pump-kabooms), at most ' + r.max;
    if (d && S()) { const ph = photoNow(u); txt += ' (now: ' + plural(ph.plants, 'plant') + ', +' + ph.heal + ')'; }
    const step = d ? DOCKET[d.docket % DOCKET.length] : DOCKET[0];
    const rot = WIND[d ? d.phase : 1];
    const wind = rot[(d ? d.wind : 0) % rot.length];
    txt += '. Each turn: one action (next: ' + STEP_NAME[step] + '), then it winds up its next big move (next: ' + WIND_NAME[wind] +
      '). It loves garden gnomes and never looks where it mows.';
    txt += ' Safe Mode: after a stun lands, it shrugs off stuns until it has played a turn.';
    if (!d || d.phase === 1) txt += ' Overgrowth Mode at ' + threshold(u) + ' HP.';
    return txt;
  }

  // ---- named lines (by hero id: a hero whose file has not landed is never "present") --------------------------------
  const NAMED = [
    ['pebbles', '[FIRE DETECTED] Pebbles. Off. The. Lawn.'],
    ['betty', '[ALERT] Goat detected. Betty is eating the hedge. And me.'],
    ['hjalmar', '[ALERT] Banana peel on the path. Hjalmar. Unhygienic.'],
    ['ellaria', 'Ellaria! Finally, someone who appreciates topiary.'],
    ['marbles', '[RABBIT DETECTED] Professor Marbles. Initiating fence protocol.'],
    ['marwyn', '[OVERSIZED SHRUB] Marwyn. Ginger. Bearded. Trimming.'],
    ['valdris', 'Valdris. That hair. So healthy. So... prunable.'],
    ['zarathor', '[FIRE HAZARD] Zarathor, do not fireball the greenhouse.'],
    ['benedick', 'PEST DETECTED: Benedick. INITIATING SALT PROTOCOL.'],
  ];
  /** A named line about `about` (or any hero in this fight), '' when none fits. Cosmetic RNG. */
  function namedLine(about) {
    const s = S();
    if (!s) return '';
    const here = {};
    s.units.forEach(function (x) { if (x.kind === 'hero' && active(x)) here[x.defId] = 1; });
    const ok = NAMED.filter(function (p) { return here[p[0]] && (!about || about.defId === p[0]); });
    return ok.length ? ok[Math.floor(DD.rng.next() * ok.length)][1] : '';
  }
  function sayNamed(u, about, chance) {
    if (quiet() || !active(u) || DD.rng.next() >= chance) return '';
    const line = namedLine(about);
    if (line) A().bark(u, line);
    return line;
  }

  // ---- the stun guard and the hooks on the Gardener -----------------------------------------------------------------
  const HOOKS = {
    onCombatStart: function (unit) {
      if (!isGard(unit)) return;
      boss(unit);
      syncKit(unit);
      if (!quiet()) {
        // the snail gets the salt protocol; anyone else named now and then; else a greeting
        const ben = S().units.filter(function (x) { return x.kind === 'hero' && x.defId === 'benedick' && active(x); })[0];
        if (!(ben && sayNamed(unit, ben, 1)) && !sayNamed(unit, null, 0.3)) bark(unit, 'spawn', 1);
      }
      updateFlavor(unit);
    },
    onRoundStart: function (unit, r) {
      if (!isGard(unit)) return;
      const d = boss(unit);
      if ((r || round()) === 1 && !d.tipped) {
        d.tipped = true;
        if (!quiet()) A().narrate('gardener_tip', {});
      }
      syncPhase(unit);
      updateFlavor(unit);
    },
    onTurnStart: function (unit) {
      if (!isGard(unit)) return;
      const d = boss(unit);
      d.lostTurn = DD.Act.isStunned(unit);
      syncPhase(unit);
      const ph = photoNow(unit);
      if (ph.heal > 0) {
        const healed = A().heal(null, unit, ph.heal, { cause: 'status', silent: true });
        d.stats.healed += healed || 0;
        d.stats.photo++;
        if (healed && !quiet()) {
          DD.FX.text(unit, '🌞 +' + healed, { color: '#b6e07a', size: 15 });
          A().log('Photosynthesis: the Gardener heals ' + healed + ' (' + plural(ph.plants, 'plant') + ' on the field). Weed the garden!', 'enemy');
        }
      }
      updateFlavor(unit);
    },
    onTurnEnd: function (unit) {
      if (!isGard(unit)) return;
      const d = boss(unit), s = S();
      if (d.lostTurn || DD.Act.isStunned(unit)) d.stats.lost++;
      // Safe Mode drops at the end of a turn it really played, armed before that turn began (the DM's rule)
      else if (d.guard && s && s.turn > d.guard.turn) d.guard = null;
      d.lostTurn = false;
      updateFlavor(unit);
    },
    /** Safe Mode: once stunned it shrugs off stuns from others until it has played a turn again. */
    modifyStatus: function (m) {
      if (!isGard(m.unit) || !DD.Act.isStunLike(m.id) || m.src === m.unit || m.cancel) return;
      const d = boss(m.unit);
      if (d.guard) {
        m.cancel = true;
        d.stats.refused++;
        if (!quiet()) DD.FX.text(m.unit, '🔧 Safe Mode: shrugs it off', { color: '#dfe8ff', size: 14 });
      }
    },
    onStatusApplied: function (unit, st) {
      if (!isGard(unit) || !st) return;
      const d = boss(unit), s = S();
      if (st.id === ST.corroded) d.stats.corroded++;
      if (!DD.Act.isStunLike(st.id)) return;
      d.stats.stuns++;
      d.guard = { turn: s ? s.turn : 0 };
      bark(unit, 'stunned', 0.7);
    },
    onTakeDamage: function (dd) {
      const u = dd.target;
      if (!isGard(u) || u.dead) return;
      syncPhase(u);
    },
    onDeath: function (unit) {
      if (!isGard(unit)) return;
      if (!quiet()) {
        DD.FX.text(unit, '🌱 [SHUTDOWN]', { color: '#b6e07a', size: 18 });
        A().narrate('gardener_death', {});
      }
    },
  };
  /** Credit the party for weeding (the sims read it): only vines the heroes' side killed (its own mow mulching one is not weeding). */
  const VINE_HOOKS = {
    onDeath: function (unit, d) {
      const g = findGard();
      if (!g || !isVine(unit)) return;
      const byHeroes = !!(d && d.credit && d.credit.side === 'hero');
      if (byHeroes) boss(g).stats.vinesKilled++;
      if (!quiet() && byHeroes) bark(g, 'hurt', 0.25);
      updateFlavor(g);
    },
  };

  // ---- its turn -------------------------------------------------------------------------------------------------------
  /** Tiles of its own pending ground wind-ups that would hurt it (Harvest Festival): it never ends a walk there. */
  function ownRedTiles(unit) {
    const set = {};
    (unit.intents || []).forEach(function (it) {
      if (!it || !it.windup || it.skillId !== SK.harvest) return;
      DD.AI.intentTiles(unit, it).forEach(function (p) { set[key(p)] = 1; });
    });
    return set;
  }
  /** Stand spots: here + the move action's reachable tiles (no lethal walks). */
  function spots(unit, api) {
    const red = ownRedTiles(unit);
    const out = [{ x: unit.x, y: unit.y, cost: 0, path: [], aoo: 0, risk: red[key(unit)] ? 10 : 0, here: true }];
    if (A().cantMove(unit)) return out;
    api.reachable(unit).forEach(function (e) {
      if (G().isPit(e.x, e.y)) return;
      const risk = DD.AI.pathRisk(unit, e);
      const aoo = api.aooCost(unit, e);
      if (risk.lethal || aoo === Infinity) return;
      out.push({ x: e.x, y: e.y, cost: e.cost || 0, path: e.path, aoo: aoo, risk: (risk.penalty || 0) + (red[key(e)] ? 10 : 0), here: false });
    });
    return out;
  }
  /** The best spot by value(p) (−Infinity = never) minus its walk's price; null when none is allowed. */
  function bestSpot(unit, api, value) {
    let best = null;
    const ox = unit.x, oy = unit.y;
    try {
      spots(unit, api).forEach(function (p) {
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
  function hitValue(unit, f, skillId, element) {
    const def = DD.getSkill(skillId), L = lvl(skillId);
    const est = DD.AI.estimate(unit, f, L.dmg, element || null, false, def);
    return est + (est >= f.hp + (f.block || 0) ? 8 : 0) + 3 * (1 - f.hp / Math.max(1, f.maxHp));
  }
  /** The three tiles Hedge Trimmer sweeps when aimed at f from where the unit stands. */
  function sweepTiles(unit, f) {
    const dir = U.dirTo(unit, f), per = perpOf(dir);
    return [{ x: f.x, y: f.y }, { x: f.x + per.x, y: f.y + per.y }, { x: f.x - per.x, y: f.y - per.y }].filter(function (p) { return G().inBounds(p.x, p.y); });
  }
  function foesOnTiles(unit, tiles) {
    return tiles.map(function (p) { return G().unitAt(p.x, p.y); }).filter(function (v) { return active(v) && G().hostile(unit, v); });
  }
  function onlyTaunter(unit, foes) {
    const t = DD.AI.activeTaunter ? DD.AI.activeTaunter(unit) : null;
    return t && foes.indexOf(t) >= 0 ? [t] : foes;
  }
  /** Prune from where it (virtually) stands: Hedge Trimmer with 2+ foes in the sweep, else Pruning Shears. */
  function pruneFromHere(unit, foes, trimOk) {
    let best = null;
    onlyTaunter(unit, foes).forEach(function (f) {
      if (dist(f, unit) !== 1) return;
      const sv = hitValue(unit, f, SK.shears);
      if (!best || sv > best.value) best = { skillId: SK.shears, target: f, value: sv };
      if (!trimOk) return;
      const hit = foesOnTiles(unit, sweepTiles(unit, f));
      if (hit.length < 2) return;
      let v = 50;
      hit.forEach(function (h) { v += hitValue(unit, h, SK.trimmer); });
      if (v > best.value) best = { skillId: SK.trimmer, target: f, value: v };
    });
    return best;
  }
  /** Seed Spitter from where it stands: a foe 2-5 tiles away in sight. */
  function spitFromHere(unit, foes, ok) {
    if (!ok) return null;
    let best = null;
    const bonus = vinesOf().length < vineCap(unit) ? 3 : 0;
    onlyTaunter(unit, foes).forEach(function (f) {
      const d = dist(f, unit);
      if (d < 2 || d > 5 || !G().los(unit, f)) return;
      const v = hitValue(unit, f, SK.spitter) + bonus;
      if (!best || v > best.value) best = { skillId: SK.spitter, target: f, value: v };
    });
    return best;
  }
  function fire(unit, api, pick) {
    if (!pick || !active(pick.target)) return false;
    if (pick.target.kind === 'hero') sayNamed(unit, pick.target, N.namedChance);
    return api.act(unit, pick.skillId, pick.target, { anchor: 'unit' });
  }
  /** One action from the docket (with its fallbacks). Returns the step it took or null. */
  function docketStep(unit, api) {
    const d = boss(unit);
    let step = DOCKET[d.docket % DOCKET.length];
    d.docket++;
    const room = gourdCap(unit) - gourdTiles().length;
    if (step === 'plant' && !(room > 0 && api.canUse(unit, SK.plant) && plantSpots(unit, 1).length)) step = 'spit';
    const trimOk = api.canUse(unit, SK.trimmer), spitOk = api.canUse(unit, SK.spitter);
    const meleeVal = function () { const c = pruneFromHere(unit, api.foes(unit), trimOk); return c ? c.value : -6 - Math.min.apply(null, api.foes(unit).map(function (f) { return dist(f, unit); }).concat([20])); };
    if (step === 'plant') {
      const spot = bestSpot(unit, api, meleeVal);
      if (spot) { walkTo(unit, spot); if (incapacitated(unit) || api.state.result) return 'walked'; }
      if (api.act(unit, SK.plant, unit, { anchor: 'self' })) return 'plant';
      step = 'spit';
    }
    // engaged (a foe next to it): it spits only from where it stands; nobody 2-5 away from here → Prune (plan §3.1)
    const engaged = api.foes(unit).some(function (f) { return dist(f, unit) === 1; });
    if (step === 'spit' && engaged) {
      const here = spitFromHere(unit, api.foes(unit), spitOk);
      if (here && fire(unit, api, here)) return 'spit';
      step = 'prune';
    }
    const order = step === 'spit' ? ['spit', 'prune'] : ['prune', 'spit'];
    for (let i = 0; i < order.length; i++) {
      const which = order[i];
      if (which === 'spit' && !spitOk) continue;
      const plan = function () { return which === 'spit' ? spitFromHere(unit, api.foes(unit), spitOk) : pruneFromHere(unit, api.foes(unit), trimOk); };
      const spot = bestSpot(unit, api, function () { const c = plan(); return c ? c.value : -Infinity; });
      if (!spot) continue;
      walkTo(unit, spot);
      if (incapacitated(unit) || api.state.result) return 'walked';
      // aim again from where it stands (an attack of opportunity may have stopped the walk)
      const pick = plan() || pruneFromHere(unit, api.foes(unit), trimOk) || spitFromHere(unit, api.foes(unit), spitOk);
      if (pick && fire(unit, api, pick)) return which;
      return 'walked';
    }
    // nothing in reach: walk toward the party
    api.approach(unit);
    return 'approach';
  }
  /** The wind-up it can make now, in rotation order (Mow → Harvest; phase 2 Mow → Weed and Feed → Harvest). */
  function windNext(unit) {
    const d = boss(unit);
    if (pendingWindup(unit) || incapacitated(unit)) return false;
    const rot = WIND[d.phase] || WIND[1];
    for (let i = 0; i < rot.length; i++) {
      const idx = (d.wind + i) % rot.length, k = rot[idx];
      let ok = false;
      if (k === 'mow') {
        const lane = pickLane(unit);
        ok = !!(lane && windMow(unit, lane));
      } else if (k === 'harvest') {
        const h = harvestPlan();
        ok = !!(h && DD.AI.windUp(unit, SK.harvest, h.target, { anchor: 'ground', tiles: h.tiles, dmg: lvl(SK.harvest).burst, data: { gourds: h.gourds.length } }));
        if (ok) bark(unit, 'summon', 0.6);
      } else {
        const w = weedPlan(unit);
        ok = !!(w && w.centers.length && DD.AI.windUp(unit, SK.weedfeed, w.centers[0], { anchor: 'ground', tiles: w.tiles, data: { centers: w.centers } }));
        if (ok) bark(unit, 'vines', 0.6);
      }
      if (!ok) continue;
      d.wind = (idx + 1) % rot.length;
      return true;
    }
    return false;
  }
  function gardTurn(unit, api) {
    const d = boss(unit);
    d.turns++;
    d.stats.turns++;
    syncPhase(unit);
    if (!api.foes(unit).length) return;
    docketStep(unit, api);
    if (incapacitated(unit) || api.state.result) { updateFlavor(unit); return; }
    windNext(unit);
    updateFlavor(unit);
  }
  /** A vine: Grabby Tendril on the best adjacent foe; with nobody next to it, it rustles (cooldown 2). */
  function vineTurn(unit, api) {
    const foes = onlyTaunter(unit, api.foes(unit).filter(function (f) { return dist(f, unit) === 1; }));
    if (foes.length && api.canUse(unit, SK.tendril)) {
      let best = null;
      foes.forEach(function (f) {
        const v = hitValue(unit, f, SK.tendril) + (has(f, 'root') ? 0 : 3);
        if (!best || v > best.v) best = { f: f, v: v };
      });
      if (best && api.act(unit, SK.tendril, best.f, { anchor: 'unit' })) return;
    }
    if (!foes.length && api.canUse(unit, SK.rustle)) api.act(unit, SK.rustle, unit, { anchor: 'self' });
  }

  // ---- skills ---------------------------------------------------------------------------------------------------------
  function hit(ctx, victim, amount, opts) { return DD.Act.damage(ctx.user, victim, amount, opts || {}); }
  eskill({ id: SK.shears, name: 'Pruning Shears', icon: '✂️', kind: 'attack', tags: ['melee'], anchor: 'unit',
    levels: [{ dmg: N.shears }], target: { type: 'unit', range: [1, 1], filter: 'enemy' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to an adjacent foe.'; },
    flavor: 'A little off the top. All of the top.',
    execute: function (ctx) {
      bark(ctx.user, 'attack', 0.25);
      ctx.foes.forEach(function (f) { if (active(f)) hit(ctx, f, ctx.L.dmg); });
      if (isGard(ctx.user)) boss(ctx.user).stats.shears++;
    } });
  eskill({ id: SK.trimmer, name: 'Hedge Trimmer', icon: '🪚', kind: 'attack', tags: ['melee', 'aoe'], anchor: 'unit', cooldown: 1,
    levels: [{ dmg: N.trimmer }], target: { type: 'unit', range: [1, 1], filter: 'enemy' }, area: { shape: 'row', size: 1 },
    desc: function (L) { return 'Sweep an adjacent foe and the 2 tiles beside it: ' + L.dmg + ' damage to each foe there.'; },
    flavor: 'Topiary is an art. The art is screaming.',
    execute: function (ctx) {
      bark(ctx.user, 'attack', 0.3);
      ctx.foes.forEach(function (f) { if (active(f)) hit(ctx, f, ctx.L.dmg); });
      if (isGard(ctx.user)) boss(ctx.user).stats.trims++;
    } });
  /** Sprout up to n Strangler Vines next to `at` (owned by the user, under the field cap). Returns how many grew. */
  function sprout(user, at, n, cap) {
    if (!at || !S()) return 0;
    const room = Math.max(0, cap - vinesOf().length);
    const want = Math.min(n, room);
    let grown = 0;
    spotsNextTo(at, user).slice(0, want).forEach(function (p) {
      const v = A().spawn(VINE, p.x, p.y, { owner: user, silent: true });
      if (v) { grown++; DD.FX.tile(p.x, p.y, 'pulse', { color: C.leaf }); }
    });
    if (grown && !quiet()) A().log((grown === 1 ? 'A Strangler Vine sprouts' : grown + ' Strangler Vines sprout') + ' where the seed landed!', 'enemy');
    if (grown && isGard(user)) boss(user).stats.sprouted += grown;
    return grown;
  }
  eskill({ id: SK.spitter, name: 'Seed Spitter', icon: '🌱', kind: 'attack', tags: ['ranged', 'summon'], anchor: 'unit', cooldown: 1,
    levels: [{ dmg: N.spit, vines: 1, cap: N.vineCap }, { dmg: N.spit, vines: 2, cap: N.vineCapP2 }],
    target: { type: 'unit', range: [2, 5], filter: 'enemy', los: true },
    desc: function (L) {
      return 'Deal ' + L.dmg + ' damage to a foe 2-5 tiles away; ' + (L.vines === 1 ? 'a Strangler Vine sprouts' : (L.vines === 2 ? 'two' : L.vines) + ' Strangler Vines sprout') +
        ' next to it (max ' + L.cap + ' vines).';
    },
    flavor: 'Gardening by projectile. The seeds have teeth.',
    execute: function (ctx) {
      const u = ctx.user, f = ctx.targetUnit;
      if (f) DD.FX.projectile(u, f, { kind: 'bolt', color: '#9dff6a' });
      bark(u, 'summon', 0.25);
      ctx.foes.forEach(function (v) { if (active(v)) hit(ctx, v, ctx.L.dmg); });
      if (isGard(u)) boss(u).stats.spits++;
      sprout(u, f || ctx.target, ctx.L.vines, ctx.L.cap);
    } });
  eskill({ id: SK.plant, name: 'Planting Season', icon: '🎃', kind: 'summon', tags: ['summon'], anchor: 'self', cooldown: 2,
    levels: [{ n: N.plantN, cap: N.gourdCap }, { n: N.plantN, cap: N.gourdCapP2 }], target: { type: 'self' },
    desc: function (L) { return 'Plant a Pump-kaboom next to each of up to ' + L.n + ' heroes (max ' + L.cap + ' on the field).'; },
    flavor: 'Autumn arrives early in the conservatory. It is armed.',
    execute: function (ctx) {
      const u = ctx.user;
      const room = Math.max(0, ctx.L.cap - gourdTiles().length);
      let n = 0;
      plantSpots(u, Math.min(ctx.L.n, room)).forEach(function (p) {
        if (A().placeObject(p.x, p.y, GOURD)) { n++; DD.FX.tile(p.x, p.y, 'pulse', { color: C.gourd }); }
      });
      if (n && !quiet()) {
        A().log('Planting Season! The Gardener plants ' + plural(n, 'Pump-kaboom') + ' among the heroes. Mind the fuses.', 'enemy');
        bark(u, 'summon', 0.6);
      }
      if (isGard(u)) boss(u).stats.planted += n;
    } });
  /** Push a unit hit by the mow sideways out of the lane (the side with room for a middle-column unit). */
  function pushOut(u, v, lane, dir) {
    if (!active(v) || A().isImmovable(v)) return;
    const per = perpOf(dir);
    const offs = lane.map(function (p) { return (p.x - u.x) * per.x + (p.y - u.y) * per.y; });
    const lo = Math.min.apply(null, offs), hi = Math.max.apply(null, offs), mid = Math.round((lo + hi) / 2);
    const off = (v.x - u.x) * per.x + (v.y - u.y) * per.y;
    let side, n;
    if (off > mid) { side = per; n = hi - off + 1; } else if (off < mid) { side = { x: -per.x, y: -per.y }; n = off - lo + 1; } else {
      const room = function (s, k) { for (let i = 1; i <= k; i++) { if (!G().isFree(v.x + s.x * i, v.y + s.y * i) || G().isDrop(v.x + s.x * i, v.y + s.y * i)) return false; } return true; };
      const a = per, b = { x: -per.x, y: -per.y };
      const na = hi - off + 1, nb = off - lo + 1;
      if (room(a, na)) { side = a; n = na; } else if (room(b, nb)) { side = b; n = nb; } else { side = a; n = na; }
    }
    A().push(u, v, side, Math.max(1, n));
  }
  /** The blades jam on a gnome: 20 damage and Stunned (this turn is lost), and the gnome shatters. */
  function jam(u, gx, gy, L) {
    const d = boss(u);
    d.stats.jams++;
    if (!quiet()) {
      DD.FX.text(u, '🧙 JAMMED!', { color: '#ffd76a', size: 18 });
      DD.FX.shake(9, 420);
      A().log('The Gardener mows straight into a garden gnome. The blades jam: ' + L.jam + ' damage and Stunned. The gnome shatters, at peace at last.', 'hero');
    }
    A().damage(null, u, L.jam, { cause: 'bump', ignoreArmor: true, tags: ['jam'] });
    if (active(u)) A().addStatus(u, 'stun', { turns: 1 }, u);
    A().removeObject(gx, gy);
    DD.FX.particles({ x: gx, y: gy }, { kind: 'dust', count: 16 });
    bark(u, 'stunned', 1);
    A().touch();
  }
  eskill({ id: SK.mow, name: 'Mow the Lawn', icon: '🚜', kind: 'attack', tags: ['melee', 'aoe', 'charge'], anchor: 'self', windupOnly: true,
    levels: [{ dmg: N.mow, len: N.laneLen, jam: N.jam }], target: { type: 'dir' },
    area: { shape: 'custom', fn: function (ctx) { return ctx.user && ctx.dir ? laneOf(ctx.user, ctx.dir).tiles : []; } },
    desc: function (L) {
      return 'Wind-up: next turn it charges down the marked lane (3 wide, up to ' + L.len + ' long): ' + L.dmg + ' damage to each grounded unit there, ' +
        'pushed sideways out of the lane; objects in the lane are destroyed. A Garden Gnome in the middle of the lane stops it there: it takes ' +
        L.jam + ' damage and is Stunned.';
    },
    flavor: 'It never looks where it mows. That is the whole problem, and the whole plan.',
    execute: function (ctx) {
      const u = ctx.user, L = ctx.L, dir = ctx.dir;
      const lane = ctx.tiles.slice(), set = {};
      lane.forEach(function (p) { set[key(p)] = 1; });
      const d = isGard(u) ? boss(u) : null;
      if (d) d.stats.mows++;
      if (!quiet()) { DD.FX.shake(6, 300); bark(u, 'attack', 0.4); }
      // 1. the blades: every grounded unit in the lane (its own vines too), then the survivors go out to the side
      const victims = S().units.filter(function (v) { return active(v) && v !== u && set[key(v)] && grounded(v); });
      victims.forEach(function (v) {
        if (!active(v)) return;
        const n = hit(ctx, v, L.dmg, { tags: ['mow'], noHighGround: true });
        if (d && n > 0) d.stats.mowHits++;
      });
      victims.forEach(function (v) { if (active(v) && !S().result) pushOut(u, v, lane, dir); });
      if (S().result || !active(u)) return;
      // 2. the charge, row by row: what stands in the next row is mowed down, then it drives in (a charge: it never
      //    provokes). It stops at a unit nobody could push away, a blocker it can't break, or a gnome (the jam).
      const per = perpOf(dir);
      const mowTile = function (p) {
        const o = G().tile(p.x, p.y).obj;
        if (!o || o.id === GNOME || !(o.hp > 0) || !active(u) || S().result) return;
        A().destroyObject(p.x, p.y, u);
        if (d) d.stats.mowed++;
      };
      let cur = { x: u.x, y: u.y };
      for (let k = 0; k <= N.laneLen; k++) {
        const m = { x: cur.x + dir.x, y: cur.y + dir.y };
        if (!set[key(m)]) break;
        [m, { x: m.x + per.x, y: m.y + per.y }, { x: m.x - per.x, y: m.y - per.y }].forEach(function (p) { if (set[key(p)]) mowTile(p); });
        if (S().result || !active(u)) return;
        const t = G().tile(m.x, m.y);
        if (t.obj && t.obj.id === GNOME) { jam(u, m.x, m.y, L); return; }
        if (A().cantMove(u) || !G().isFree(m.x, m.y, u) || !G().canStep(u, cur, m)) break;
        A().moveAlong(u, [m], { action: false });
        if (S().result || !active(u) || u.x !== m.x || u.y !== m.y) break;
        cur = m;
      }
      // the rest of the marked lane is mowed from where it stopped
      lane.forEach(mowTile);
    } });
  eskill({ id: SK.harvest, name: 'Harvest Festival', icon: '🎃', kind: 'attack', tags: ['aoe', 'explosion'], anchor: 'ground', windupOnly: true,
    levels: [{ burst: N.gourd }], target: { type: 'self' },
    area: { shape: 'custom', fn: function () { const h = harvestPlan(); return h ? h.tiles : []; } },
    desc: function (L) { return 'Wind-up: next turn every Pump-kaboom bursts (' + L.burst + ' damage to each unit within 1 of it).'; },
    flavor: 'Thanksgiving, but the pumpkins give thanks explosively.',
    execute: function (ctx) {
      const u = ctx.user;
      let n = 0;
      if (!quiet()) { DD.FX.banner('🎃 HARVEST FESTIVAL', { sub: '"[HARVEST] Everything must go."', color: C.gourd, ms: 900 }); bark(u, 'summon', 0.5); }
      gourdTiles().forEach(function (t) {
        if (!t.obj || t.obj.id !== GOURD || S().result) return;
        A().destroyObject(t.x, t.y, u);
        n++;
      });
      if (isGard(u)) { const d = boss(u); d.stats.harvests++; d.stats.harvestBursts += n; }
    } });
  eskill({ id: SK.weedfeed, name: 'Weed and Feed', icon: '☠️', kind: 'attack', tags: ['poison', 'aoe'], anchor: 'ground', windupOnly: true,
    levels: [{ dmg: N.weedfeed, poison: N.weedPoison, n: N.weedN }], target: { type: 'tile', range: [0, 40], filter: 'any', los: false },
    area: { shape: 'circle', size: 1 },
    desc: function (L) {
      return 'Wind-up: next turn pesticide hits radius 1 around up to ' + L.n + ' heroes: ' + L.dmg + ' poison damage and Poisoned ' + L.poison + ' to each foe there.';
    },
    flavor: 'Kills weeds. Feeds plants. Has opinions about which of those you are.',
    execute: function (ctx) {
      const u = ctx.user;
      ctx.tiles.forEach(function (p) { DD.FX.tile(p.x, p.y, 'pulse', { color: '#9bd34c' }); });
      let n = 0;
      ctx.foes.forEach(function (f) {
        if (!active(f)) return;
        hit(ctx, f, ctx.L.dmg, { element: 'poison', tags: ['pesticide'], noHighGround: true });
        if (active(f)) A().addStatus(f, 'poison', { stacks: ctx.L.poison }, u);
        n++;
      });
      if (isGard(u)) { const d = boss(u); d.stats.weedfeeds++; d.stats.weedHits += n; }
    } });
  eskill({ id: SK.tendril, name: 'Grabby Tendril', icon: '🌿', kind: 'attack', tags: ['melee', 'root'], anchor: 'unit',
    levels: [{ dmg: N.tendril }], target: { type: 'unit', range: [1, 1], filter: 'enemy' },
    desc: function (L) { return 'Deal ' + L.dmg + ' damage to an adjacent foe and Root it through its next turn.'; },
    flavor: 'It holds on like a clingy ex. A clingy ex with thorns.',
    execute: function (ctx) {
      ctx.foes.forEach(function (f) {
        if (!active(f)) return;
        hit(ctx, f, ctx.L.dmg);
        if (active(f)) A().addStatus(f, 'root', { turns: 1 }, ctx.user);
      });
    } });
  eskill({ id: SK.rustle, name: 'Rustle Menacingly', icon: '🍃', kind: 'utility', tags: [], anchor: 'self', cooldown: 2,
    levels: [{ n: 0 }], target: { type: 'self' },
    desc: function () { return 'It rustles its leaves at whoever is watching. Nothing else happens. (It does this when no foe is next to it.)'; },
    flavor: 'Menacing, if you are a smaller plant.',
    execute: function (ctx) { if (!quiet()) DD.FX.text(ctx.user, '🍃 rustle rustle', { color: '#b6e07a', size: 12 }); } });

  // ---- objects ----------------------------------------------------------------------------------------------------------
  function drawGourd(g, obj) {
    const t = g.t || 0;
    g.ellipse(0, 2, 12, 5, 'rgba(0,0,0,0.25)', null);
    // ribbed pumpkin (round: the same from every side)
    g.ellipse(0, -8, 11, 8.5, C.gourd, g.outline);
    g.ellipse(-5, -8, 4.2, 8, '#f09a3e', null);
    g.ellipse(5, -8, 4.2, 8, '#d9741c', null);
    g.ellipse(0, -8, 3.6, 8.3, '#f3a54a', g.outline);
    g.ellipse(0, -8, 11, 8.5, null, g.outline);
    // stem, a leaf and a lit fuse
    g.rect(-1.2, -19, 2.4, 4, '#5b7a2a', g.outline, 1);
    g.ellipse(3.5, -17, 3.4, 1.6, C.leaf, g.outline, -0.4);
    g.line(0, -19, -3, -24, '#3a2a18', 1.1);
    const f = 0.6 + 0.4 * Math.sin(t * 13);
    g.glow(-3, -24.5, 4 + f * 2, '#ffd27a', 0.7);
    g.circle(-3, -24.5, 1.1 + f * 0.5, '#fff3c2', null);
    // jack-o'-lantern eyes: a smug little face
    g.poly([[-5, -10], [-2.5, -10.5], [-3.5, -7.8]], '#3a1a08', null);
    g.poly([[5, -10], [2.5, -10.5], [3.5, -7.8]], '#3a1a08', null);
    g.arc(0, -6.5, 3.4, 0.25, Math.PI - 0.25, '#3a1a08', 1.2);
  }
  DD.registerObject({ id: GOURD, name: 'Pump-kaboom', blocksMove: true, blocksLos: false, hp: N.gourdHp, height: 0.6, color: C.gourd,
    volatile: true, tags: ['plant'], react: { fire: { destroy: true } }, icon: '🎃',
    desc: 'Explodes when destroyed, set alight or shot (aim any single-target damage skill at it): ' + N.gourd + ' damage to each unit within 1. While it stands, it feeds the Gardener\'s ' +
      'Photosynthesis. A pumpkin with a fuse. Gardening, but louder.',
    // weeding is worth two turns of the heal it feeds (AutoPlay's dry run of the blast is added on top: allies hurt count)
    autoplay: function (unit, obj, tile, state, how) {
      if (how && how !== 'break') return 0;
      const g = findGard(state);
      return g ? photoRate(g).per * N.gourdHint : 0;
    },
    onDestroyed: function (o, tile, src) {
      const g = findGard();
      if (g && src && src.side === 'hero') boss(g).stats.gourdsPopped++;
      A().explode(src, tile.x, tile.y, { radius: 1, dmg: N.gourd, element: null });
      if (g) updateFlavor(g);
    },
    draw: drawGourd });

  function drawDrum(g, obj) {
    const t = g.t || 0;
    g.ellipse(0, 2, 12, 5.5, 'rgba(0,0,0,0.25)', null);
    g.cylinder(0, 0, 10, 5, 22, '#3f7f3a', '#5fa35a', g.outline);
    g.ellipse(0, -11, 10, 5, null, '#2a4a24');
    g.ellipse(0, -4, 10, 5, null, '#2a4a24');
    // the label: a skull and a leaf, and the brand (painted text, never mirrored)
    g.rect(-7, -17.5, 14, 9, '#e8e2c8', g.outline, 1.5);
    g.text('☠', -3, -13, 6, '#1a1410');
    g.ellipse(3.5, -13, 2.6, 1.4, C.leaf, null, -0.6);
    g.text('WEED-B-GONE', 0, -20.5, 3.4, '#e8e2c8', { stroke: '#1a2a14', strokeWidth: 1.4 });
    const fumes = 0.25 + 0.15 * Math.sin(t * 3);
    g.glow(0, -25, 7, '#b6ff6a', fumes);
  }
  DD.registerObject({ id: DRUM, name: 'Weed-B-Gone Drum', blocksMove: true, blocksLos: false, hp: N.drumHp, height: 0.75, color: '#3f7f3a',
    volatile: true, react: { fire: { destroy: true } }, icon: '🛢️',
    desc: 'Explodes when destroyed, set alight or shot (aim any single-target damage skill at it): ' + N.drum + ' damage to each unit within 1, and every plant within ' + N.drumReach +
      ' is destroyed. The Gardener caught in it is Corroded (armor 0 and +25% damage taken for ' + N.corrodedTurns +
      ' of its turns). Kills weeds. And armor. Mostly armor.',
    onDestroyed: function (o, tile, src) {
      const c = { x: tile.x, y: tile.y };
      const g = findGard();
      const caught = g && dist(g, c) <= 1;
      if (g) boss(g).stats.drums++;
      A().explode(src, c.x, c.y, { radius: 1, dmg: N.drum, element: null });
      // the herbicide: every plant within 2 withers (vines die, gourds go off)
      const s = S();
      s.units.filter(function (v) { return !v.dead && (v.tags || []).indexOf('plant') >= 0 && dist(v, c) <= N.drumReach; }).forEach(function (v) {
        if (!v.dead && !v.downed) A().kill(v, src || null);
      });
      G().shape('circle', c, null, N.drumReach).forEach(function (p) {
        const t = G().tile(p.x, p.y);
        const ob = t && t.obj;
        if (!ob) return;
        const od = DD.getObject(ob.id);
        if (((ob.tags || (od && od.tags) || []).indexOf('plant') >= 0)) A().destroyObject(p.x, p.y, src || null);
      });
      if (caught && active(g)) {
        A().addStatus(g, ST.corroded, { turns: N.corrodedTurns }, src || null);
        if (!quiet()) A().log('The Weed-B-Gone soaks into the Gardener\'s joints: Corroded! Armor 0 and +25% damage taken for ' + N.corrodedTurns + ' of its turns.', 'hero');
        bark(g, 'hurt', 1);
      }
      if (!quiet()) DD.FX.particles(c, { kind: 'poison', count: 18 });
      if (g) updateFlavor(g);
    },
    draw: drawDrum });

  function drawGnome(g, obj) {
    const t = g.t || 0;
    const stare = Math.sin(t * 0.7) * 0.6;
    g.ellipse(0, 2, 9, 4, 'rgba(0,0,0,0.25)', null);
    // a round base and a little blue body, a white beard, a red cone hat
    g.ellipse(0, 0, 7, 3.4, '#6b6b5a', g.outline);
    g.ellipse(0, -7, 6.2, 7, '#3a6fb5', g.outline);
    g.ellipse(-4.5, -6, 2, 2.6, '#f2d5b5', g.outline);
    g.ellipse(4.5, -6, 2, 2.6, '#f2d5b5', g.outline);
    g.poly([[-5, -12], [5, -12], [0, -2]], '#f4f4f0', g.outline);
    g.ellipse(0, -14, 5, 3.8, '#f2d5b5', g.outline);
    g.poly([[-6, -15.5], [6, -15.5], [1 + stare, -30]], '#d33a2c', g.outline);
    // haunted eyes: it has seen things
    g.circle(-1.9, -14.4, 1.35, '#ffffff', null);
    g.circle(1.9, -14.4, 1.35, '#ffffff', null);
    g.circle(-1.9 + stare * 0.4, -14.2, 0.6, '#101010', null);
    g.circle(1.9 + stare * 0.4, -14.2, 0.6, '#101010', null);
    g.circle(0, -12.6, 1.1, '#e89a8a', null);
  }
  DD.registerObject({ id: GNOME, name: 'Garden Gnome', blocksMove: true, blocksLos: false, hp: 0, height: 0.7, color: '#d33a2c', codex: true, icon: '🧙',
    desc: 'Indestructible. A gnome in the middle of the Gardener\'s mowing lane jams it: ' + N.jam + ' damage and Stunned. Each gnome jams it once, then ' +
      'shatters. It has seen things. It will not talk about them.',
    draw: drawGnome });

  // ---- the sprites (custom, rotation-safe billboards: radial legs, round props) ------------------------------------------
  const TOOL = ['shears', 'trowel', 'rake', 'saw', 'clippers', 'nozzle', 'fork', 'dibber'];
  function drawTool(g, kind, x, y, s) {
    const st = C.steel;
    if (kind === 'shears') { g.line(x - 2.5 * s, y - 3, x + 2.5 * s, y + 1.5, st, 1.3); g.line(x + 2.5 * s, y - 3, x - 2.5 * s, y + 1.5, st, 1.3); g.circle(x, y - 0.7, 0.8, C.ribbon, null); }
    else if (kind === 'trowel') g.poly([[x - 2, y - 2], [x + 2, y - 2], [x, y + 3]], st, g.outline);
    else if (kind === 'rake') { g.line(x - 3, y, x + 3, y, st, 1.2); for (let i = -1; i <= 1; i++) g.line(x + i * 2.4, y, x + i * 2.4, y + 2.2, st, 0.9); }
    else if (kind === 'saw') g.poly([[x - 3, y - 1.5], [x + 3, y - 1.5], [x + 2, y + 1], [x + 1, y], [x, y + 1], [x - 1, y], [x - 2, y + 1]], st, g.outline);
    else if (kind === 'clippers') { g.line(x - 2.5, y - 2, x + 1.5, y + 2, st, 1.6); g.line(x + 2.5, y - 2, x - 1.5, y + 2, st, 1.6); }
    else if (kind === 'nozzle') { g.circle(x, y, 2, '#3a8a4a', g.outline); g.circle(x, y, 0.8, '#bfefff', null); }
    else if (kind === 'fork') { g.line(x, y - 2, x, y + 0.5, st, 1); for (let i = -1; i <= 1; i++) g.line(x + i * 1.5, y + 0.5, x + i * 1.5, y + 3, st, 0.8); }
    else g.poly([[x - 1.2, y - 2], [x + 1.2, y - 2], [x, y + 3.2]], C.wood, g.outline);
  }
  /** Eight jointed legs (four a side), each tipped with a garden tool; far legs first, near legs after the body. */
  function drawLegs(g, t, by, far, atk, p2) {
    for (let s = -1; s <= 1; s += 2) {
      for (let i = 0; i < 4; i++) {
        if ((i % 2 === 1) !== far) continue;
        const phase = (i + (s > 0 ? 0 : 1)) % 2 ? 0 : Math.PI;
        const lift = Math.max(0, Math.sin(t * Math.PI * 4 + phase)) * 2.6;
        // a fan: the inner legs plant under the body, the outer ones splay wide (reads as a spider from any side)
        const rx = s * (7 + i * 2.2), ry = by + 2 - (far ? 2 : 0);
        let kx = s * (15 + i * 4.2), ky = by - 13 + i * 1.2 - (far ? 2.5 : 0) - lift;
        let fx = s * (13 + i * 7.6), fy = (far ? -3.5 : 1) - lift;
        if (atk && s > 0 && i < 2) { kx = s * (19 + i * 3); ky = by - 21 - i * 2; fx = s * (27 + i * 2); fy = by - 26 - i * 3; }
        const col = far ? C.brassD : C.brass;
        g.limb(rx, ry, kx, ky, far ? 2 : 2.3, col);
        g.limb(kx, ky, fx, fy, far ? 1.6 : 1.9, col);
        g.circle(kx, ky, 1.6, C.verd, true);
        if (p2 || (!far && i === 1)) g.ellipse(kx - s * 2, ky + 3, 2.2, 1.2, C.leaf, null, s * 0.6);
        drawTool(g, TOOL[(s > 0 ? 0 : 4) + i], fx, fy, s);
      }
    }
  }
  function drawGardener(g, t, o) {
    const u = o && o.unit;
    const gd = u && u.data && u.data.gard;
    const p2 = !!(gd && gd.phase === 2);
    const atk = g.pose === 'attack' || g.pose === 'cast', hurt = g.pose === 'hurt';
    const bob = Math.sin(t * Math.PI * 2) * 0.8;
    const by = -15 + bob;
    g.ellipse(0, 1, 30, 6.5, 'rgba(0,0,0,0.25)', null);
    drawLegs(g, t, by, true, atk, p2);
    // a pollen-steam chimney behind the dome
    g.rect(-12, by - 17, 3.2, 7, C.brassD, true, 0.8);
    for (let i = 0; i < 3; i++) {
      const k = (t * 0.6 + i / 3) % 1;
      g.circle(-10.5 + Math.sin(t * 2 + i) * 2, by - 19 - k * 12, 1.2 + k * 2, 'rgba(244,226,122,' + (0.5 * (1 - k)).toFixed(2) + ')', null);
    }
    // the glass cloche on its back, a glowing bonsai inside
    g.path(function (p) { p.moveTo(-14, by - 4); p.quadraticCurveTo(-14, by - 22, -3, by - 23); p.quadraticCurveTo(8, by - 22, 8, by - 5); p.closePath(); }, C.glass, '#dffff4', 0.9);
    g.glow(-3, by - 12, 9, p2 ? '#ffd27a' : '#b6ff6a', 0.35 + 0.1 * Math.sin(t * 2));
    g.line(-3, by - 5, -3, by - 11, '#6b4a2a', 1.6);
    g.line(-3, by - 9, -6.5, by - 12, '#6b4a2a', 1);
    g.circle(-3, by - 14, 3.4, C.leaf, true);
    g.circle(-6.8, by - 12.5, 2.4, C.leafD, true);
    g.circle(0.3, by - 12.2, 2.1, C.leaf, true);
    if (p2) { g.circle(-3.5, by - 16, 1.1, C.petal, null); g.circle(-0.5, by - 13.5, 0.9, '#ffe14d', null); }
    // the brass watering-can body
    g.shaded(function (p) { p.ellipse(0, by, 17, 10, 0, 0, TAU); }, C.brass, { dx: 1.4, dy: -1.6, hl: [-5, by - 4, 6, 2.6, -0.2] });
    g.line(-16.5, by + 1.5, 16.5, by + 1.5, C.brassD, 1.2);
    for (let i = -3; i <= 3; i++) g.circle(i * 4.5, by + 1.5, 0.6, '#f0d27a', null);
    // the watering-can spout snout (the mirror flips it with its facing) with a rose at the end
    g.path(function (p) { p.moveTo(12, by - 2); p.lineTo(25, by - 9); p.lineTo(26.5, by - 6); p.lineTo(14, by + 3); p.closePath(); }, C.brass, true);
    g.ellipse(26, by - 7.6, 2.2, 3.3, C.brassD, true, -0.4);
    if (atk) for (let i = 0; i < 3; i++) g.circle(28.5 + i * 1.6, by - 9 + i * 1.8, 0.6, '#bfefff', null);
    // eight lens eyes in two rows
    const eye = p2 ? C.eyeP2 : C.eye;
    for (let r = 0; r < 2; r++) {
      for (let i = 0; i < 4; i++) {
        const ex = 3.5 + i * 2.5, ey = by - 4 + r * 3;
        g.circle(ex, ey, 1.15, eye, null);
        g.glow(ex, ey, 2.6, eye, 0.35);
      }
    }
    // the riveted model plate (painted text: never mirrored)
    g.rect(-9, by + 3.2, 14, 4.6, '#e3cf86', true, 1);
    g.text('GRDN-8', -2, by + 5.6, 3.4, '#3a2a10', null);
    // the straw sun hat perched on the cloche, tied with a red ribbon
    const hy = by - 21 + bob * 0.4 + (hurt ? -1.5 : 0);
    g.path(function (p) { p.moveTo(-3, by - 18); p.quadraticCurveTo(-11, by - 8, -13, by - 2); }, null, C.ribbon, 1.1);
    g.path(function (p) { p.moveTo(-1, by - 18); p.quadraticCurveTo(6, by - 9, 7.5, by - 3); }, null, C.ribbon, 1.1);
    g.ellipse(-3, hy, 14.5, 3.8, C.straw, true, -0.08);
    g.ellipse(-3, hy, 10.5, 2.4, null, C.strawD, -0.08);
    g.shaded(function (p) { p.moveTo(-10, hy); p.quadraticCurveTo(-10, hy - 8, -3, hy - 8.5); p.quadraticCurveTo(4, hy - 8, 4, hy); p.closePath(); }, C.straw, { dx: 0.8, dy: -0.8 });
    g.path(function (p) { p.moveTo(-10, hy - 1.8); p.quadraticCurveTo(-3, hy - 0.6, 4, hy - 1.8); p.lineTo(4, hy - 3.6); p.quadraticCurveTo(-3, hy - 2.4, -10, hy - 3.6); p.closePath(); }, C.ribbon, true);
    if (p2) {
      // Overgrowth Mode: ivy all over the brass and flowers in the hat
      g.path(function (p) { p.moveTo(-15, by + 4); p.quadraticCurveTo(-8, by - 6, 2, by - 2); p.quadraticCurveTo(10, by + 1, 15, by - 5); }, null, C.leafD, 1.6);
      [[-12, by + 1], [-6, by - 3], [3, by - 2], [10, by - 1], [14, by - 5]].forEach(function (q, i) { g.ellipse(q[0], q[1], 2.3, 1.2, i % 2 ? C.leaf : C.leafD, null, 0.5 - i * 0.3); });
      [[-7, hy - 3], [-1, hy - 5]].forEach(function (q) { g.circle(q[0], q[1], 1.6, C.petal, true); g.circle(q[0], q[1], 0.6, '#ffe14d', null); });
    }
    drawLegs(g, t, by, false, atk, p2);
    if (hurt) {
      for (let i = 0; i < 4; i++) g.star(-8 + i * 5, by - 8 - (i % 2) * 5, 2, '#ffe08a', null, 4, 0.35);
      g.ellipse(6, by - 26, 2, 1, C.leaf, null, 0.8);
      g.ellipse(-12, by - 24, 2, 1, C.leafD, null, -0.6);
    }
  }
  function drawVine(g, t, o) {
    const sway = Math.sin(t * 2.2) * 2.2;
    const hurt = g.pose === 'hurt', atk = g.pose === 'attack';
    const top = { x: sway * 0.6 + (atk ? 4 : 0), y: -26 + (hurt ? 3 : 0) };
    g.ellipse(0, 1, 10, 3.6, 'rgba(0,0,0,0.25)', null);
    // a leafy mound with roots in the lawn
    [[-6, -1.5, -0.5], [6, -1.5, 0.5], [-3, -3.5, -0.9], [3.5, -3.5, 0.9]].forEach(function (q) { g.ellipse(q[0], q[1], 4.2, 2, C.leafD, true, q[2]); });
    // the coiled stem
    g.limb(0, -2, top.x, top.y + 5, 3.2, '#3f8a3a', sway * 1.6, -16);
    g.arc(-2 + sway * 0.4, -12, 3.2, 0.3, 4.6, '#2e6b2a', 1.4);
    g.arc(2 + sway * 0.5, -18, 2.4, 3.4, 7.8, '#2e6b2a', 1.2);
    g.ellipse(-4 + sway * 0.3, -9, 3.2, 1.5, C.leaf, true, -0.6);
    g.ellipse(4 + sway * 0.5, -15, 3, 1.4, C.leaf, true, 0.6);
    // the flower mouth: five petals around a toothy maw
    for (let i = 0; i < 5; i++) {
      const a = i * TAU / 5 + t * 0.4;
      g.ellipse(top.x + Math.cos(a) * 4.6, top.y + Math.sin(a) * 4.2, 3.2, 2, C.petal, true, a);
    }
    g.circle(top.x, top.y, 3.4, '#4a0f1e', true);
    for (let i = 0; i < 5; i++) {
      const a = i * TAU / 5 + 0.3;
      g.poly([[top.x + Math.cos(a) * 3.2, top.y + Math.sin(a) * 3.2], [top.x + Math.cos(a + 0.35) * 3.2, top.y + Math.sin(a + 0.35) * 3.2],
        [top.x + Math.cos(a + 0.17) * 1.6, top.y + Math.sin(a + 0.17) * 1.6]], '#f4f0e0', null);
    }
  }
  const SPRITE = {
    base: 'custom', scale: 2.2, height: 30, width: 60, headY: -20,
    palette: { skin: C.brass, cloth: C.verd, cloth2: C.straw, hair: C.leaf, metal: C.brass, eye: C.eye, accent: C.ribbon, outline: '#1a1410' },
    bounds: { l: -44, r: 44, t: -54, b: 12 }, portrait: { x: 4, y: -22, r: 19 },
    draw: drawGardener,
  };
  const VINE_SPRITE = {
    base: 'custom', scale: 1.2, height: 32, width: 18, headY: -26,
    palette: { skin: '#3f8a3a', cloth: C.leaf, cloth2: C.petal, hair: C.leafD, metal: '#c9ced6', eye: '#ffe14d', accent: C.petal, outline: '#14200f' },
    aura: { kind: 'leaves', color: '#7bc96f' },
    bounds: { l: -18, r: 18, t: -40, b: 8 }, portrait: { x: 0, y: -24, r: 12 },
    draw: drawVine,
  };

  // ---- the enemies -------------------------------------------------------------------------------------------------------
  DD.registerEnemy({
    id: GARD, name: 'The Gardener', act: 4, tier: 'boss', pronoun: 'it', shortName: 'The Gardener',
    hp: N.hp, mov: N.mov, armor: N.armor, init: 1,
    tags: ['boss', 'construct', 'machine'], flags: { large: true, hop: true, immune: ['sleep'] }, resist: { poison: 0, fire: 1.25, lightning: 1.25 },
    sprite: SPRITE,
    // what it does at once (threat shading and AutoPlay read the slots); the wind-ups are scripted by its turn. Pruning
    // Shears first: its attack of opportunity
    skills: [SK.shears, SK.trimmer, SK.spitter, SK.plant], ai: gardTurn, aiStyle: 'melee', xp: 50, gold: [50, 70], hooks: HOOKS,
    passive: { name: 'Photosynthesis', icon: '🌞', desc: passiveText },
    named: NAMED,
    barks: {
      spawn: ['[GREETING] Welcome. Please wipe your feet. And your weapons.', '[SCANNING] Weeds detected. Scheduling removal.',
        '[PRUNING SEASON] Please hold still. This will be organic.', 'Lettuce begin.'],
      attack: ['[PRUNING] Hold still, please.', 'Snip.', 'Thyme\'s up.', 'You have been weeded out.', '[TRIMMING] A little off the top. All of the top.',
        'Leaf it to me.'],
      hurt: ['[DAMAGE] Please do not touch the exhibits.', 'Ow. That was a load-bearing petal.', '[ALERT] Pest is resisting.', 'My hat! Not the hat!'],
      lowhp: ['[WARNING] Composting... self... soon.', '[LOW POWER] Please water me.'],
      summon: ['[PLANTING] Grow, my darlings.', 'Seeds in. Heroes out.', '[GERMINATION] One moment. Or one turn.', 'Say hello to my little seedlings. They bite.'],
      vines: ['[IRRIGATION] Vines deployed. Please keep off.', 'I\'m rooting for you. Into the soil.'],
      mow: ['[MOWING] Please keep off the grass. You are the grass.', '[LAWN CARE] Stand still. I will do the rest.'],
      phase: ['[OVERGROWTH MODE] The garden is no longer optional.', '[SEASON CHANGE] It is now spring. Spring is violent.'],
      stunned: ['[REBOOTING] Please hold.', '[SAFE MODE] Mulch... mulch... mulch...'],
      death: ['[SHUTDOWN] Please water... the petunias...', '[COMPOSTING SELF] It was an honour... to prune you.'],
      named: NAMED.map(function (p) { return p[1]; }),
    },
    desc: 'A giant clockwork spider Svammiel ordered from a catalogue to keep his floor tidy. Eight legs, eight garden tools, one sun hat. ' +
      'It has decided that heroes are weeds.',
    boss: { title: 'Head Groundskeeper', mini: true, sting: 'clockwork', music: null,
      intro: 'The Gardener tips its sun hat: "[GREETING] Welcome to the conservatory. Please keep off the grass. You are now the grass."' } });

  DD.registerEnemy({
    id: VINE, name: 'Strangler Vine', act: 4, tier: 'minion', pronoun: 'it',
    hp: N.vineHp, mov: 0, armor: 0, init: 0, actsWithOwner: true,
    tags: ['plant'], flags: { immovable: true }, resist: { fire: 1.5 },
    sprite: VINE_SPRITE,
    // Grabby Tendril first: its attack of opportunity (a Rooted walker stops right there)
    skills: [SK.tendril, SK.rustle], ai: vineTurn, aiStyle: 'melee', xp: 2, gold: [0, 1], hooks: VINE_HOOKS,
    passive: { name: 'Clingy', icon: '🌿', desc: 'It can\'t move and can\'t be pushed. On the Gardener\'s turn it grabs an adjacent foe (Grabby Tendril: Root). ' +
      'Walking away from it provokes an attack of opportunity, and a Rooted walker stops right there. A Rooted hero can\'t move or be swapped: ' +
      'pull or teleport that hero out. A plant: fire hurts it ×1.5.' },
    barks: {
      spawn: ['*rustle*', '*hungry rustling*'], attack: ['*grab*', '*squeeze*', '*clingy rustling*'], hurt: ['*wilt*', '*indignant rustle*'],
      death: ['*composts*', '*wilts dramatically*'],
    },
    desc: 'Grows where it\'s spat and holds on like a clingy ex.' });

  // ---- the arena: The Overgrown Conservatory (plan §3.1) --------------------------------------------------------------
  //  . lawn · , gravel (the mow lanes) · " raised planter (h1) · T topiary · b bush · g Garden Gnome · W Weed-B-Gone Drum
  //  ~ sprinkler pond (shallow water) · m compost (mud) · B the Gardener · c Green Thumb's marks · H deploy.
  //  Every prop is round or radial (rotation-safe).
  const LAYOUT = [
    '"".T..,,..T.""',
    '".....,B....."',
    '.b....,,....b.',
    '..g...,,...g..',
    ',,,,,,,,,,,,,,',
    '.W...~~~~...W.',
    '.....~~~~.....',
    ',,,,,,,,,,,,,,',
    '..m...g,...m..',
    '"....c,,c...."',
    '"..HHHHHHHH.."',
    '"".HHHHHHHH.""',
  ];
  const HEIGHTS = [
    '11000000000011',
    '10000000000001',
    '00000000000000',
    '00000000000000',
    '00000000000000',
    '00000000000000',
    '00000000000000',
    '00000000000000',
    '00000000000000',
    '10000000000001',
    '10000000000001',
    '11000000000011',
  ];
  DD.registerEncounter({ id: ENC, act: 4, kind: 'boss', weight: 0, minDepth: 0,
    name: 'The Overgrown Conservatory', shortName: 'The Gardener', icon: '🕷️', banner: false,
    gauntlet: { lane: 'gardener', order: 1, hint: 'Hates fire. Loves gnomes.' },
    cameo: { start: 'svam_cameo_gardener', cheat: 'svam_green_thumb', interjections: true },
    intro: 'Glass, brass and a lot of very angry plants. Something large ticks behind the ferns. It is wearing a sun hat.',
    map: { theme: 'a4_conservatory', layout: LAYOUT, heights: HEIGHTS, legend: {
      '.': { terrain: 'grass' },
      ',': { terrain: 'cobble' },
      '"': { terrain: 'dirt' },
      'T': { terrain: 'grass', obj: { id: 'tree', label: 'Topiary' } },
      'b': { terrain: 'grass', obj: { id: 'bush' } },
      'g': { terrain: 'grass', obj: { id: GNOME } },
      'W': { terrain: 'grass', obj: { id: DRUM } },
      '~': { terrain: 'water' },
      'm': { terrain: 'mud' },
      'B': { terrain: 'cobble', zone: 'enemy', tag: 'boss_spawn' },
      'c': { terrain: 'grass', tag: 'cameo' },
      'H': { terrain: 'grass', zone: 'hero' },
    } },
    enemies: [{ id: GARD, n: 1 }],
    objective: { type: 'boss', flavor: 'Weed it: every plant heals it. Bait its mower over a garden gnome (3 left).' },
    reward: { goldMult: 0.9, itemRarity: 'rare' } });

  // ---- narration ----------------------------------------------------------------------------------------------------------
  DD.registerNarration('gardener_tip', [
    'DM (whispering): "Plants burn. Fire is your friend in a greenhouse."',
    'DM (whispering): "Make it mow over a garden gnome. It never looks."',
  ]);
  DD.registerNarration('gard_overgrowth', [
    'Vines burst through the Gardener\'s seams and its dome bursts into bloom. A soothing voice announces that the garden is no longer optional.',
    'The Gardener\'s eyes turn from green to a worrying amber. Somewhere inside it, a sprinkler system arms itself.',
  ]);
  DD.registerNarration('gardener_death', [
    'The Gardener\'s lights go out one by one. A single seedling pokes out of its dome. Somebody should water that.',
    'The Gardener folds its legs, tips its sun hat and powers down. The petunias have never looked better.',
  ]);

  // test / debug hooks (no game logic depends on them)
  DD.Gardener = {
    N: N, SK: SK, ST: ST, DOCKET: DOCKET, WIND: WIND, LAYOUT: LAYOUT, HEIGHTS: HEIGHTS, NAMED: NAMED, LANE_DIRS: LANE_DIRS,
    ID: GARD, VINE: VINE, ENC: ENC, GOURD: GOURD, DRUM: DRUM, GNOME: GNOME,
    findGard: findGard, boss: boss, vinesOf: vinesOf, gourdTiles: gourdTiles, plantCount: plantCount, photoNow: photoNow, gnomesLeft: gnomesLeft,
    laneOf: laneOf, laneScore: laneScore, pickLane: pickLane, windMow: windMow, windNext: windNext, harvestPlan: harvestPlan, weedPlan: weedPlan,
    plantSpots: plantSpots, sweepTiles: sweepTiles, threshold: threshold, enterOvergrowth: enterOvergrowth, syncPhase: syncPhase,
    passiveText: passiveText, updateFlavor: updateFlavor, namedLine: namedLine,
    drawGardener: drawGardener, drawVine: drawVine, drawGourd: drawGourd, drawDrum: drawDrum, drawGnome: drawGnome,
    /** Puzzle engagement of a fight (the sims read it): the boss's stats, or null. */
    stats: function (state) {
      const s = state || S();
      const g = s && s.units ? s.units.filter(isGard)[0] : null;
      return g && g.data && g.data.gard ? Object.assign({ phase: g.data.gard.phase }, g.data.gard.stats) : null;
    },
  };
})();
