/* Dungeons and Degenerates — js/data/balance.js
 * DD.Balance: the one place for the game's global difficulty, Hype and economy knobs (balance phase). Plain data,
 * read at runtime by the engine (DD.Combat / DD.Act / DD.Encounter) and the run layer (DD.Rewards / DD.Run /
 * DD.RunMap / DD.Passives); nothing here calls another module. The helpers at the bottom only combine this data.
 * Per-enemy / per-skill numbers stay in their content files; this file scales whole fights and the run economy.
 * Tuned with the whole-campaign AutoPlay sims (tools/sim.sh, docs/notes/balance.md).
 */
(function () {
  'use strict';
  const DD = window.DD;

  const B = (DD.Balance = {
    // ---- enemy scaling (DD.Combat.start → state.difficulty = { hp, dmg }) -----------------------------------------
    // A fight's enemy multipliers = difficulty × act × kind (normal / elite / boss fight). Sandbox fights (tests,
    // debug) use the difficulty factor alone, so 'normal' stays neutral there. `dmg` is the one attacker multiplier
    // telegraphs read (DD.AI.intentDmg), so every telegraph stays honest. tierHp scales single enemies by tier.
    difficulty: {
      casual: { hp: 0.8, dmg: 0.8 },
      normal: { hp: 1, dmg: 1 },
      brutal: { hp: 1.25, dmg: 1.2 },
    },
    act: { 1: { hp: 1, dmg: 1 }, 2: { hp: 1, dmg: 1 }, 3: { hp: 1, dmg: 1 } },
    kind: { normal: { hp: 1, dmg: 1 }, elite: { hp: 1, dmg: 1 }, boss: { hp: 1, dmg: 1 } },
    // Outlier fixes for single encounters (× on top of the above), keyed by encounter id.
    encounters: {},
    tierHp: { minion: 1, normal: 1, elite: 1, boss: 1 },
    enemyMov: { minion: 0, normal: 0, elite: 0, boss: 0 },   // + move for enemies that move at all (real fights)
    // Extra copies of the encounter's own grunts (non-elite, non-boss entries) per difficulty × fight kind
    // (DD.Encounter.build). A fraction is a chance (0.5 = one extra enemy half the time).
    extraEnemies: {
      casual: { normal: 0, elite: 0, boss: 0 },
      normal: { normal: 0, elite: 0, boss: 0 },
      brutal: { normal: 1, elite: 0, boss: 0 },
    },
    // A reinforcement wave of the encounter's own grunts per difficulty × fight kind: { round, n, edge } (or null).
    // Only for kill-all / boss fights that script no waves of their own.
    waves: {
      casual: { normal: null, elite: null, boss: null },
      normal: { normal: null, elite: null, boss: null },
      brutal: { normal: null, elite: null, boss: null },
    },

    // ---- Hype (DD.Act; party pool 0..100, signatures cost their skill's `hype`, 100) ------------------------------
    hype: {
      kill: 8,              // a hero-side kill
      envKill: 20,          // a hero-credited environmental kill (pit, hazard, bump, explosion)
      multiHit: 4,          // one hero skill damaging 2+ foes
      eliteKill: 0,         // extra for killing an elite-tier enemy (on top of kill / envKill)
      dealtPer: 0,          // +1 Hype per this much damage the hero side deals to enemies (0 = off)
      takenPer: 0,          // +1 Hype per this much HP heroes (not summons) lose (0 = off)
      bossQuarter: 0,       // each quarter of a boss's max HP knocked off (75 / 50 / 25%), once per boss unit
      puzzle: 0,            // a puzzle step: a hero interacts with / destroys an object whose AutoPlay hint is > 0
      puzzlePerRound: 2,    // at most this many rewarded puzzle steps per round
    },

    // ---- XP (DD.Rewards.combatXp; per hero, downed heroes get half) -----------------------------------------------
    xp: { normal: [10, 12, 14], elite: [20, 24, 28], boss: [40, 50, 60] },

    // ---- gold (DD.Rewards / DD.Run) --------------------------------------------------------------------------------
    gold: {
      start: 60,
      fight: { normal: [12, 20], elite: [35, 50], boss: [80, 100] },   // [min, max] per fight
      fightPerAct: { normal: 6, elite: 0, boss: 0 },                      // + this × (act − 1)
      finalBoss: 1,                                                       // × for the last act's boss (the run ends there)
      pile: [30, 45], pilePerAct: 15,                                     // "Suspiciously Heavy Sack" reward
      treasure: [20, 35], treasurePerAct: 10,                             // treasure nodes
    },
    // Shop prices (items without their own price use their rarity's; consumables carry their own).
    prices: { common: 40, rare: 80, legendary: 150, cursed: 25, consumable: 25, tome: 60, scar: 45, heal: 30, reroll: 40 },
    priceAct: { 1: 1, 2: 1, 3: 1 },   // shop price multiplier per act (consumables, items, tomes and services)

    // ---- healing outside fights (fractions of max HP) -------------------------------------------------------------
    heal: { actClear: 0.5, tavern: 0.35, shop: 0.3, reward: 0.3 },

    // ---- act maps (DD.RunMap) -----------------------------------------------------------------------------------------
    map: {
      weights: { combat: 44, event: 24, elite: 14, shop: 9, treasure: 7, tavern: 3 },   // node types, rows 1-5
      minShops: 1,   // shops guaranteed per act map (rows 1-5, never two in a row)
    },

    // ---- the Table of Questionable Blessings (DD.Passives) -------------------------------------------------------------
    passives: {
      ownedWeight: 1,   // weight multiplier of a Blessing the hero owns below its max level (rolled again = upgrade)
    },

    // ---- "Objective Failed" (a lost protect fight with heroes still standing; DD.Run.finishCombat) -------------------
    objectiveFailed: {
      goldLoss: 0,        // fraction of the party's gold the DM bills for the damages
      xpMult: 0,          // × the fight's XP (downed heroes get half of that)
      countDowns: false,  // heroes downed in it get their down + scar, like a won fight
    },
  });

  // ---- helpers (pure: they only combine the data above) ---------------------------------------------------------------
  function num(v, fb) { return typeof v === 'number' && isFinite(v) ? v : fb; }
  function actKey(act) { return Math.max(1, Math.min(3, Math.floor(+act) || 1)); }
  function kindKey(kind) { return kind === 'elite' || kind === 'boss' ? kind : 'normal'; }
  function diffKey(d) { return typeof d === 'string' && B.difficulty[d] ? d : 'normal'; }

  /** Enemy multipliers of a fight: { id, hp, dmg }. opts.neutral: the difficulty factor alone (sandbox fights);
   *  opts.encounter: an encounter id with its own entry in B.encounters. */
  B.scale = function (difficulty, act, kind, opts) {
    const id = diffKey(difficulty);
    const d = B.difficulty[id];
    let hp = num(d.hp, 1), dmg = num(d.dmg, 1);
    if (!(opts && opts.neutral)) {
      const a = B.act[actKey(act)] || {}, k = B.kind[kindKey(kind)] || {};
      const e = (opts && opts.encounter && B.encounters && B.encounters[opts.encounter]) || {};
      hp *= num(a.hp, 1) * num(k.hp, 1) * num(e.hp, 1);
      dmg *= num(a.dmg, 1) * num(k.dmg, 1) * num(e.dmg, 1);
    }
    return { id: id, hp: Math.round(hp * 1000) / 1000, dmg: Math.round(dmg * 1000) / 1000 };
  };
  /** HP multiplier for one enemy tier (minion / normal / elite / boss). */
  B.tierHpOf = function (tier) { return num(B.tierHp[tier] !== undefined ? B.tierHp[tier] : B.tierHp.normal, 1); };
  /** Extra grunts for an encounter (may be fractional: the caller rolls the remainder as a chance). */
  B.extraOf = function (difficulty, kind) {
    const e = B.extraEnemies[diffKey(difficulty)] || {};
    return Math.max(0, num(e[kindKey(kind)], 0));
  };
  /** Shop price multiplier of an act. */
  B.priceMultOf = function (act) { return Math.max(0, num(B.priceAct[actKey(act)], 1)); };

  /** Read a knob by dotted path ('hype.kill'), or undefined. */
  B.get = function (path) {
    return String(path).split('.').reduce(function (o, k) { return o !== null && o !== undefined ? o[k] : undefined; }, B);
  };
  /** Set a knob by dotted path (sims and tests). Returns the previous value. Only numbers / arrays of numbers. */
  B.set = function (path, value) {
    const keys = String(path).split('.');
    let o = B;
    for (let i = 0; i < keys.length - 1; i++) {
      if (o[keys[i]] === null || typeof o[keys[i]] !== 'object') o[keys[i]] = {};
      o = o[keys[i]];
    }
    const last = keys[keys.length - 1];
    const prev = o[last];
    o[last] = value;
    return prev;
  };
  /** A deep copy of every knob (no helpers), e.g. to restore after a test: DD.Balance.restore(snap). */
  B.snapshot = function () {
    const out = {};
    Object.keys(B).forEach(function (k) { if (typeof B[k] !== 'function') out[k] = JSON.parse(JSON.stringify(B[k])); });
    return out;
  };
  B.restore = function (snap) {
    if (!snap) return;
    Object.keys(snap).forEach(function (k) { B[k] = JSON.parse(JSON.stringify(snap[k])); });
  };
})();
