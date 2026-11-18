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
    // ---- the campaign (V3) ------------------------------------------------------------------------------------------
    // How many acts a campaign has. DD.finalAct() reads it (clamped 3..DD.MAX_ACT); every module asks DD.finalAct().
    // Act 4 "Under the Table" shipped dark at 3 (v2's campaign) until the V3 integrator flipped it to 4 (Nov 15): act 4
    // is live after the act-3 boss. bal=campaign.acts:3 (sims: acts=3) still plays the v2 campaign.
    campaign: { acts: 4 },

    // ---- enemy scaling (DD.Combat.start → state.difficulty = { hp, dmg }) -----------------------------------------
    // A fight's enemy multipliers = difficulty × act × kind (normal / elite / boss fight). Sandbox fights (tests,
    // debug) use the difficulty factor alone, so 'normal' stays neutral there. `dmg` is the one attacker multiplier
    // telegraphs read (DD.AI.intentDmg), so every telegraph stays honest. tierHp scales single enemies by tier.
    // Sustain refit 3 (Nov 13), whole-campaign AutoPlay runs: casual ~74% won, normal ~31%. Brutal's old row (×1.25 HP /
    // ×1.2 damage, older than the act 1 and late-boss rows it now stacks on) won 1%: ×1.15 HP / ×1.05 damage win ~11%,
    // the extra grunt in every regular fight stays (docs/notes/balance.md "Sustain refit - difficulties and economy").
    // Settings / party select describe each row from these numbers (DD.UI.DIFFICULTIES).
    difficulty: {
      casual: { hp: 0.8, dmg: 0.8 },
      normal: { hp: 1, dmg: 1 },
      brutal: { hp: 1.15, dmg: 1.05 },
    },
    // An act row may carry per-fight-kind rows (`normal` / `elite` / `boss`, × on top of the act and kind rows) that
    // reach only that act's fights of that kind.
    act: {
      // balance pass 1: act 1's regular fights hurt (the user: "regular fights should hurt and someone often goes
      // down"). Re-fitted by balance pass 3 (sustain refit, after D9 took the starting heal out again): regular fights
      // ×1.3 damage (was 1.4: healer-less parties reach the boss in better shape), and shorter, deadlier boss fights
      // (×0.9 HP, ×1.35 damage; was ×1 / ×1.2): boss damage costs parties with a healer more than parties without one,
      // boss HP the other way round (docs/notes/balance.md "Sustain refit - act 1")
      1: { hp: 1, dmg: 1, normal: { hp: 1.15, dmg: 1.3 }, elite: { hp: 1.05, dmg: 1.2 }, boss: { hp: 0.9, dmg: 1.35 } },
      2: { hp: 1, dmg: 1 },
      3: { hp: 1, dmg: 1 },
      // V3: act 4 (the gauntlet: every fight a boss-kind fight); read once DD.finalAct() is 4. BAL (Nov 15): at ×1 campaign
      // parties (three acts of items and Blessings, a tavern between doors) won the doors ~99% and Svammiel ~95-100%, a 35%
      // four-act campaign against the user's "about 25%"; ×1.3 damage (HP unchanged: the doors already ran 9-11 rounds)
      // plus the per-door rows below aim the doors at ~97% and Svammiel at ~85% (docs/notes/balance.md "V3")
      4: { hp: 1, dmg: 1.3 },
    },
    kind: { normal: { hp: 1, dmg: 1 }, elite: { hp: 1, dmg: 1 }, boss: { hp: 1, dmg: 1 } },
    // V3: order scaling of the act-4 doors, applied by B.scale(…, { gauntlet: { index } }) (index = lanes beaten before
    // this door): HP × (1 + hpPerBeaten × index), damage × (1 + dmgPerBeaten × index). Off: the order stays a free choice.
    gauntlet: { hpPerBeaten: 0, dmgPerBeaten: 0 },
    // Outlier fixes for single encounters (× on top of the above), keyed by encounter id.
    // The late bosses (sustain refit 2, Nov 13): at ×1 a campaign party won them 95-100%. Damage-heavy rows (shorter,
    // deadlier fights split less by healer than longer ones; HP mostly stretches the Lich's fee clock and Iris's fights)
    // put the act 2 bosses at ~81% and make the DM the hardest boss for the party that reaches him (~72%). The Lich's
    // row multiplies only his notices' base: his Late Fees stay flat (docs/notes/balance.md "Sustain refit - acts 2-3").
    // The Rat King (balance audit, Nov 14): on top of act 1's boss row he was a coin flip for parties without a starting
    // healer (won 51% of 310 fights; Grimble 56%). ×0.9 HP shortens the fight his Swelling Ranks soft timer feeds on:
    // same seeds, healer-less parties beat him 51% -> 57% (with a healer 76% -> 83%), both act 1 bosses 66% -> 69%
    // (docs/notes/balance.md "Balance audit").
    encounters: {
      boss_rat_king: { hp: 0.9 },
      // finish FF-1 (Nov 14): his Late Fees stop at 12 (6 / 7 a turn); ×1.3 HP (was 1.25) keeps him where he was
      // (paired 500 boss fights: 60% -> 64% won, notices downing a 90%+ HP hero 238 -> 15; balance.md "Finish")
      boss_lichtenstein: { hp: 1.3, dmg: 1.5 },
      // finish FF-4 (Nov 14): ×1.1 HP (was 1.2) with her closing time at round 10 (was 14): 2-3 rounds shorter, the same
      // win rate (paired 500 boss fights 63% -> 65%; balance.md "Finish")
      boss_dr_iris: { hp: 1.1, dmg: 1.45 },
      boss_dm: { hp: 1.35, dmg: 1.6 },
      // V3 act 4 (BAL, Nov 15), on top of act[4]: each door tuned on its own to the same campaign band (no order scaling,
      // the order stays a free choice). The long doors trade HP for damage (the Gardener ran 11-13 rounds and stalled once,
      // the goats 10-11); Galbraith and the Coven, the doors that bite hardest, step back a little. Svammiel, the finale,
      // carries the hardest row, ~11-12 rounds (docs/notes/balance.md "V3").
      // V3 balance audit (Nov 16-17): at the pass's rows (500 campaign runs) the goats were the costliest door (95.4%, 1.17
      // downs against ≤ 1.1; the Radio Edit, a whole-fight ban, costs ~4 points in act-4-only sims) and Svammiel won 91.5%
      // of 142 fights (plan 80-85%). The goats' ×1.1 damage -> ×1 pays the Radio Edit back on their own row; Svammiel ×1.1 HP
      // / ×1.3 damage (×1.69 in all). 600 fresh runs: campaign 24.0%, every door 97-98% (the goats 97.8%, 0.89 downs),
      // Svammiel 86% (docs/notes/balance.md "V3 balance audit")
      boss_gardener: { hp: 0.75, dmg: 1.45 },
      boss_league: { dmg: 1.05 },
      boss_galbraith: { dmg: 0.95 },
      boss_coven: { dmg: 0.9 },
      boss_goats: { hp: 0.8 },
      // Conditional-healing pass (Nov 18, heal:balance): the 16 lifts put the campaign at 32.8% and Svammiel at 90.8% (600
      // runs; plan 80-85%). His row first (plan §8 step 1, damage first, one ×0.05 step an iteration on 600 fresh runs):
      // ×1.35 / ×1.4 / ×1.45 / ×1.5 damage read 94.6 / 87.0 / 88.9 / 89.6% (damage barely moves him), then ×1.15 HP: 80.0%,
      // campaign 25.3%. Ellaria's parties fell to 48.9% (pooled over the last two iterations, guard 52%): the pass stopped
      // there and handed the question to the lead (docs/notes/balance.md "Conditional healing pass (Nov 18)"). The final
      // gate read her parties at 53.4% at these rows, and the user kept them ("Keep as is", Nov 18)
      boss_svammiel: { hp: 1.15, dmg: 1.5 },
    },
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

    // ---- the party's starting kit (DD.Run.newRun: consumables into the pockets, items equipped like loot; unknown ids
    // are skipped, the pockets cap the consumables) ------------------------------------------------------------------
    // D9 (the user, Nov 12): no generic heal handed to every party; sustain is character-linked (hero kits and hero
    // items, docs/DESIGN.md §6). Every party starts with a revive: the Bucket of Ice Water only targets a downed ally,
    // so it waits for the moment it matters (often the act 1 boss). start.items stays supported (empty).
    start: { consumables: ['con_ice_bucket'], items: [] },

    // ---- XP (DD.Rewards.combatXp; per hero, downed heroes get half) -----------------------------------------------
    xp: { normal: [10, 12, 14], elite: [20, 24, 28], boss: [40, 50, 60] },

    // ---- gold (DD.Rewards / DD.Run) --------------------------------------------------------------------------------
    // Sustain refit 3 (Nov 13): AutoPlay runs reached the DM with ~245 unspent gold (target: under ~150). Every act map
    // now has two shops (map.minShops), and the gold that lands where nothing can be bought shrinks: the act bosses'
    // payday 80-100 -> 50-70 (still more than an elite's), and regular fights no longer pay more in later acts (+6 / act
    // -> 0). docs/notes/balance.md "Sustain refit - difficulties and economy".
    gold: {
      start: 60,
      fight: { normal: [12, 20], elite: [35, 50], boss: [50, 70] },    // [min, max] per fight
      fightPerAct: { normal: 0, elite: 0, boss: 0 },                      // + this × (act − 1)
      finalBoss: 1,                                                       // × for the last act's boss (the run ends there)
      pile: [30, 45], pilePerAct: 15,                                     // "Suspiciously Heavy Sack" reward
      treasure: [20, 35], treasurePerAct: 10,                             // treasure nodes
    },
    // Shop prices (items without their own price use their rarity's; consumables carry their own).
    // V3: bribe = "Bribe the Floor Boss" (act-4 shops only: Svammiel skips his cameo cheat in the next fight)
    prices: { common: 40, rare: 80, legendary: 150, cursed: 25, consumable: 25, tome: 60, scar: 45, heal: 30, reroll: 40, bribe: 75 },
    // shop price multiplier per act (consumables, items, tomes and services); V3: act 4 is "Svammiel's markup"
    priceAct: { 1: 1, 2: 1, 3: 1, 4: 1.25 },

    // ---- healing outside fights (fractions of max HP) -------------------------------------------------------------
    // reward: Mystery Stew, a pick-1-of-3 choice offered only when someone is hurt (0.3 -> 0.35 by sustain refit 3: the
    // spec's out-of-combat lever for parties without a healer; never a starting heal, D9)
    heal: { actClear: 0.5, tavern: 0.35, shop: 0.3, reward: 0.35 },

    // ---- act maps (DD.RunMap) -----------------------------------------------------------------------------------------
    map: {
      weights: { combat: 44, event: 24, elite: 14, shop: 9, treasure: 7, tavern: 3 },   // node types, rows 1-5
      minShops: 2,   // shops guaranteed per act map (rows 1-5, never two in a row; sustain refit 3: 1 -> 2)
      // V3: the act-4 gauntlet's stops (DD.RunMap: lobby → door → intermission → … → door → last stop → the floor boss);
      // minShops is not read there
      gauntlet: { lobby: ['shop', 'event'], between: ['tavern', 'shop', 'event'], last: ['tavern', 'shop'] },
    },

    // ---- V3: Svammiel's cameos (DD.Cameo) ------------------------------------------------------------------------------
    // Interjections (bubble / quip cameos) per fight: at most perFight, perRound a round, minGap rounds apart; the start
    // cameo, the twist and forced lines never count. comeback: the chance a roasted hero answers back. off: 1 = no
    // cameo (and no cameo cheat) in any fight of this page — Combat.start sets state.noCameo (sims' and debug cameo=0,
    // bal=cameo.off:1); the shipped game keeps 0.
    cameo: { perFight: 3, perRound: 1, minGap: 2, comeback: 0.6, off: 0 },

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
  // the act row of a fight: 1..DD.finalAct() (an act past the campaign's end reads the last act's row)
  function actKey(act) { return Math.max(1, Math.min(DD.finalAct(), Math.floor(+act) || 1)); }
  function kindKey(kind) { return kind === 'elite' || kind === 'boss' ? kind : 'normal'; }
  function diffKey(d) { return typeof d === 'string' && B.difficulty[d] ? d : 'normal'; }

  /** Enemy multipliers of a fight: { id, hp, dmg }. opts.neutral: the difficulty factor alone (sandbox fights);
   *  opts.encounter: an encounter id with its own entry in B.encounters; V3 opts.gauntlet: an act-4 door's
   *  { index } (lanes beaten before it), scaled by B.gauntlet (the callers pass setup.gauntlet / state.data.gauntlet). */
  B.scale = function (difficulty, act, kind, opts) {
    const id = diffKey(difficulty);
    const d = B.difficulty[id];
    let hp = num(d.hp, 1), dmg = num(d.dmg, 1);
    if (!(opts && opts.neutral)) {
      const a = B.act[actKey(act)] || {}, k = B.kind[kindKey(kind)] || {};
      const ak = (a[kindKey(kind)] && typeof a[kindKey(kind)] === 'object' && a[kindKey(kind)]) || {};
      const e = (opts && opts.encounter && B.encounters && B.encounters[opts.encounter]) || {};
      hp *= num(a.hp, 1) * num(ak.hp, 1) * num(k.hp, 1) * num(e.hp, 1);
      dmg *= num(a.dmg, 1) * num(ak.dmg, 1) * num(k.dmg, 1) * num(e.dmg, 1);
      const gi = opts && opts.gauntlet ? Math.max(0, Math.floor(num(+opts.gauntlet.index, 0))) : 0;
      if (gi) {
        const g = B.gauntlet || {};
        hp *= Math.max(0, 1 + num(g.hpPerBeaten, 0) * gi);
        dmg *= Math.max(0, 1 + num(g.dmgPerBeaten, 0) * gi);
      }
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
    // knobs added since the snapshot (B.set on a new path) go too, so the restore is exact
    Object.keys(B).forEach(function (k) { if (typeof B[k] !== 'function' && !(k in snap)) delete B[k]; });
    Object.keys(snap).forEach(function (k) { B[k] = JSON.parse(JSON.stringify(snap[k])); });
  };
})();
