# C3 — GRAND MAGISTER GALBRAITH (act IV, door 3)

Owner: C3 (V3 build, plan `.tmp/v3/design.md` §3.3, §5.3, §6.2, §8.4 Content; voice V §8.3, art V §10.4).
Files: `js/data/bosses/galbraith.js`, `tests/content/boss_galbraith.js`, this file.

## What landed
- **Encounter `boss_galbraith`** — `act: 4`, `kind: 'boss'`, `weight: 0`, `minDepth: 0`, name *Galbraith's Grand Observatory*,
  `shortName` "Galbraith", `icon` 🔭, `banner: false`, `gauntlet: { lane: 'galbraith', order: 3, hint: 'Counters one spell a
  round: steel and arrows go through.' }`, `cameo: { start: 'svam_cameo_galbraith', cheat: 'svam_cameo_one', interjections:
  true }` (Svammiel's *That's a 1 Now* lives in `svammiel.js`, C5), `objective: { type: 'boss', flavor }` (the flavor is a live
  subtitle: bait the counter / crystals left / INTERMISSION / ENCORE), `reward: { goldMult: 0.9, itemRarity: 'rare' }` (lead
  patch P5), intro V §8.3. Theme `a4_observatory` (MAPGEN; RENDER-WORLD has its fallback).
- **The Observatory** (13 × 13, plan §3.3's layout verbatim): the starry void (core `pit`, 36 tiles), custom floors
  `gal_starmarble` (white marble, gold constellations painted with `g.local`, so they turn with the map) and `gal_sigil` (a
  gold rune ring with a "G" under his spawn), three Focus Crystals on h2 pedestals with h1 steps at (6,1), (0,6), (12,6),
  four brass orrery columns (core `pillar`, labelled), deploy on the south rim (12 tiles).
- **Grand Magister Galbraith** (`gal_galbraith`, he; tier boss, `boss.mini`, `boss.title` "Namesake of Every Spell",
  `boss.sting` `grand_spell`; 340 HP, armor 0, move 3 (Encore 5), init +3, flying, large, poison ×0, frost ×0.5, immune
  sleep; xp 50, gold [50, 70]). Kit slots (threat shading) = Frostbite Ray, Chain Lightning, Wall of Force; the teleport,
  the Intermission and the three wind-ups are scripted by his planner (the DM's pattern).
  - **Spell slots**: `boss(u).slots` (0-9) mirrored by the 🔮 status `gal_slots` (buff, never decays) for the HUD. +1 per
    standing Focus Crystal at his turn start (max 9). Slotted spells gate through their `canUse` (so threat shading and
    AutoPlay stay honest).
  - **Galbraith's Frostbite Ray** (cantrip, 0 slots): 14 frost to a foe within 6 he can see.
  - **Chain Lightning (Abridged)** (3 slots, cd 1): 14 lightning to a foe within 6 and up to 2 more foes within 2 of it (the
    nearest; a custom area so the preview shows exactly who).
  - **Wall of Force** (3 slots, cd 3): up to 5 unbreakable tiles within 4 (`gal_force_wall`, blocks movement and sight) until
    the end of the next round; used when 2+ melee heroes are within 3, on the row that walls off the most of them.
  - **Mildly Forbidden Teleport** (1 slot): at his turn start when a foe is adjacent, never two turns running, to the free
    floor tile 4-6 from the nearest foe that sees the most heroes (ties: away from the void).
  - **Counterspell** (fight rule `gal_counterspell`, content-only per plan V20): `modifyIncomingDamage` (the first hero
    spell a round that would damage him, from a caster he sees within 6) and `modifyStatus` (a debuff from a hero spell)
    negate the hit; one counter per resolution (an area spell is countered as one: a flag on the resolution's ctx), 2 slots,
    not while resting / under 2 slots / in the Encore; a spell of an element he ignores (poison) never wastes it. The rule's
    `estimateDealt` mirrors it, so previews, `DD.AI.estimate` and AutoPlay's dry runs say 0 while it is armed. Object hits
    never touch it (the engine runs no hooks on them: P2).
  - **Wind-ups** (alternating, one at a time, when the slots cover them): *Meteoric Displeasure* (5 slots; radius 1 around
    up to 3 heroes at least 3 apart, the most crowded first; 20 fire each) and *Power Word: Ouch* (4 slots; the hero he sees
    within 8 with the lowest HP + Block; 26; tracks the hero; fizzles out of his sight — the engine's tracked wind-up).
  - **Intermission** (`gal_rest`): a turn that starts at 2 or fewer slots (after the crystal refill) is spent resting:
    status `gal_resting` (`takenMult` 1.5, no Counterspell) until his next turn starts, 9 slots at the end of the resting turn.
  - **Phase 2 "Encore"** at 100 of 340 HP (a share of a scaled max HP; damage carries on): banner "AN ENCORE!", the crowned
    skull look, status `gal_overchannel` (`takenMult` 1.5), slots and the Counterspell rule gone, move 5, kit = the ray; each
    turn two Frostbite Rays at two different foes, the *Grand Finale* wind-up (20 to each foe within 3 of him, anchored on
    him) every other turn; each standing crystal heals him 8 at his turn start. Svammiel's `svam_phase` through
    `DD.Cameo.say` (budgeted).
  - **Galbraith's Contingency** (the DM's stun guard): after a stun-like lands, stuns from others are refused ("🎩 Galbraith's
    Contingency: shrugs it off") until the end of the next turn he really plays.
  - **Focus Crystal** (`gal_crystal`, 15 HP, `targetable: true`, blocks movement not sight; desc gives "15 HP" and "any
    single-target damage skill can break it"; AutoPlay hint 14, Encore 18).
  - Live passive line (inspect): slots, crystals standing, Counterspell ready / used / off, the next wind-up, the Encore
    threshold; in the Encore the next Grand Finale and the crystals' heal.
- **Voice** (V §8.3 verbatim + new lines in his voice; all ≤ 70, first person or by name): spawn / attack / windup / landed /
  hurt / phase / stunned / death, plus counter / rest / blink / wall / meteor / pw / finale / crystal; named lines
  (`def.named` = [heroId, line], picked by hero id like the League's, so a hero whose file hasn't landed is never named)
  incl. Benedick's "Galbraith's Escargot, Benedick. A classic. Hold still." (plan §5.3); the Lich-tenstein jab once at
  round 1 (log); narration `galbraith_tip` (the demoted DM whispering, plan §5.3's two tips, round 1), `galbraith_encore`,
  `galbraith_death` (V §8.3); codex desc V §8.3; boss intro V §8.3.
- **Art** (V §10.4; custom painter, scale 2.1, hover 8, `flags.large`, explicit bounds + portrait; a billboard: only the
  facing mirror changes): tall and upright, skull with cyan soul-fire eyes and a gold monocle on a chain, a stage-wide hat
  with orbiting stars, a blue spirit-flame beard to the waist, a midnight robe with a gold constellation, an orrery staff;
  `cast` / `attack`: arms flung wide. **Encore**: a floating crowned skull in cyan / magenta spellfire with a wisp tail.
  Props: Focus Crystal (a floating cyan prism over a gold pedestal; cracks as it loses HP), Wall of Force (translucent
  cyan slab with a "G", flickers on its last round).

## API (others use)
- `DD.Galbraith.stats(state)` → `{ phase, turns, counters, rests, restDmg, blinks, walls, chains, rays, meteors, meteorHits,
  pws, pwLanded, finales, finaleHits, crystals, healed, regen, stuns, refused, lost, encore }` (puzzle engagement for the sims;
  `encore` = the round the Encore began, 0 if never).
- `DD.Galbraith.N` (knobs: hp, p2, slots, restAt, cost.{chain, wall, blink, counter, meteor, pw}, sight, crystalHp,
  crystalHeal, crystalHint(P2), blink / wall / meteor / pw geometry, mov / movP2, takenRest / takenOver, namedChance); the
  damage numbers are the skills' `levels[0].dmg` (`gal_ray` 14, `gal_chain` 14, `gal_meteor` 20, `gal_pw` 26, `gal_finale` 20).
  `SK` / `ST` ids, `boss(u)`, `slotsOf` / `setSlots`, `counterArmed` / `counterable`, `crystalsStanding`, `threshold`,
  `enterEncore`, `wallPlan` / `blinkSpot` / `pwTarget` / `meteorPlan` / `chainTiles`, `passiveText`, painters (tests).
- Boss state: `unit.data.gal = { phase, slots, counteredRound, turns, lastBlink, restTurn, nextWind, p2Turns, guard,
  lostTurn, jabbed, stats }` (previews and dry runs copy it).
- Test params (the AutoPlay suite): `real=1&n=&level=&seed=` (random real parties; needs the hero files:
  `isolate=galbraith,heroes`), `hpx=`, `knobs=key:value,…` (numeric `DD.Galbraith.N` keys), `lv=skill.key:value,…`
  (level-1 numbers), `fights=1` (one line a fight), `where=1` (end positions; always logged for a timeout).

## Numbers (author sims: random real parties of 4 at L5.5 — half level 5, half level 6 — no items / Blessings /
consumables, full HP, normal, the real path with deployment and initiative, no cameo; plan §7.1 band 66-74%)
`tools/test.sh "suite=boss_galbraith: AutoPlay&isolate=galbraith,heroes&real=1&n=80&verbose=1&seed=<s>"`:

| build | seeds × fights | win rate | rounds | downs / fight |
|---|---|---|---|---|
| plan §3.3 as written (ray 10, chain 10) | 1 × 40 | **100%** (40/40) | 9.6 | 0.38 |
| ray 12, chain 12 | 1 × 80 | 86% | 11.3 | 1.75 |
| ray 13, chain 13 | 1 × 40 | 80% | 11.7 | 2.25 |
| ray 14, chain 14 (before the void fix below) | 4 seeds, 280 fights | 68% (190/280), 1 timeout | 13.4 | 3.6-3.9 |
| ray 12, chain 14 (after the fix) | 2 × 80 | 75% | 12.2 | 3.1-3.3 |
| **shipped: ray 14, chain 14 (after the fix)** | 2 × 80 (seeds 31, 41) | **72%** (68% / 76%) | 12.3-12.8 | 3.3-3.6 |
| ray 14, chain 14, HP × 1.1 (374) | 1 × 80 | 68% | 14.2 | 4.05 |

Per fight (shipped): heroes take Chain ~99, ray ~68 (at-once damage: ~13 a round); the wind-ups are dodged by AutoPlay
almost every time (meteor hits 0.1, Power Words landed 0.2 of 1.7, Grand Finale hits 0.2 a fight) — they move the party, as
designed. Galbraith takes ~320 from attacks and ~35 from spells (AutoPlay reads the honest Countered estimate and mostly
swings steel while it is armed: 0.5 counters a fight), rests 1.7 times (~59 damage taken while resting), loses 1.8 crystals,
blinks 2.7 times, reaches the Encore in ~95% of fights, heals ~29 from crystals in it. 0 timeouts after the fix.
Fixture party (test_ heroes, L5.5): wins, ~15 rounds (smoke only).

## Deviations (from the plan, with reasons)
- **Frostbite Ray and Chain Lightning 10 → 14** (plan §3.3 knobs `ray 10, chain 10`). The plan's numbers won 100% of the
  author sims (band 66-74%); his wind-ups are dodgeable by design, so the at-once spells carry the fight. 14 is the top of
  the solo mini-boss hit band (10-14, plan §3.0.5); HP stays 340 (the band's top). BAL owns the campaign numbers.
- **AI: back over the marble, and closer when nothing is in sight** (not in the plan). A push can leave a flyer over the
  void; parked over the corner void (0,1) with the crystals gone he could see nobody, the melee party couldn't reach him, and
  a sim fight stalled 40 rounds (Buga, Betty, Marbles, Corelos). His stand spot now pays 12 for being over the void and,
  when no spell is castable from any reachable spot, prefers spots closer to the party (phase 1 and the Encore). Tested.
- **Desc wording** (desc == execute; same numbers): Wall of Force "a wall of up to 5 tiles within 4 until the end of the
  next round" (plan: "a 5-tile wall … for 2 rounds": tiles on the void, an object or a unit are skipped, and it lasts the
  round it goes up in plus the next); the teleport "to a free floor tile at least 4 tiles from every foe (the nearest within
  6). He does it at the start of his turn when a foe is next to him, never two turns running" (the plan's "4-6 tiles from
  every foe" can't hold with a spread party); Meteor "20 fire damage to each foe in them"; Power Word "if Galbraith can
  still see that hero within 8 (the mark follows the hero)" (no "it" for a hero); Grand Finale "each foe within 3" (it hits
  hero-side summons too). The Intermission and Counterspell descs are the plan's.
- **Narration keys** `galbraith_tip`, `galbraith_encore`, `galbraith_death` (V names `galbraith_death`; the tip and the
  Encore line are new keys in the same family).
- **Extra bark pools** beyond V §8.3: `counter`, `rest`, `blink`, `wall`, `meteor`, `pw`, `finale`, `crystal` (new lines in
  V's voice: possessive spell titles, applause, the gift shop).
- **Named lines are picked by hero id** (`def.named`), with `barks.named` kept as the texts (the League's reason: the engine's
  party filter only knows registered heroes, and Benedick's file is still a stub).
- **A Counterspell never fires on a spell of an element he ignores** (poison ×0): such a spell "would" not damage him, so
  the desc's "would damage or debuff" holds and no counter is wasted.
- **Floors**: two custom terrains (`gal_starmarble`, `gal_sigil`) instead of the theme's generic marble, so the gold star
  charts and the rune ring are painted (rotation-safe through `g.local`).

## Requests
- **RULES (`combat.js Combat.objectiveText`)**: a `boss` objective prints "Defeat Grand Magister Galbraith (the minions will
  flee)", but he has no minions (plan §3.3: "no minions"). Drop the parenthesis when the boss is the encounter's only enemy
  (e.g. when no other non-summon enemy unit exists), or read an `objective.text` override. Cosmetic.
- **BAL / Integrator**: the author-sim table above; the campaign numbers (plan §7.1: 91-95% per door) are yours. Knobs:
  `DD.Galbraith.N` (HP, slots, costs, crystal HP / heal) and the skills' level numbers; engagement via
  `DD.Galbraith.stats(state)`. A campaign party has items and Blessings, so expect him easier there than in these sims.
- **AUTOPLAY (known gap, plan §3.3 "AutoPlay doesn't bait Counterspell")**: AutoPlay doesn't bait the counter on purpose; it
  reads the honest 0 and swings steel instead. A human gets more out of spells than the sims show.

## Tests
`tests/content/boss_galbraith.js`, 15 suites "boss_galbraith: …": registry (unit, statuses, objects, encounter fields, the
crystal's P2 words); the observatory (layout, 36 void tiles, crystals on h2 pedestals with h1 steps, columns block sight,
deploy, the rule and 9 slots at start, intros logged); skills (each desc exact at its level, read from the level numbers;
ray / chain hits and targets, the slot gate, Wall of Force tiles / blocking / expiry, the wall planner, the teleport, the
P3 scaled descs and hits at ×1.5); wind-ups (the meteor plan, the marked number, only the red is hit; Power Word target by
HP + Block, tracking, landing, the fizzle behind a column); spell slots (crystal refill, cap, the Intermission at ≤ 2: rest
only, 9 at its end, no counter, +50% hit and estimate, ends at his next turn; the three-crystal economy never rests);
Counterspell (preview and estimate say 0 while armed and spend nothing, object hits never arm or spend it, 2 slots, once a
round, steel goes through, re-armed next round, range 7 goes through, one counter per resolution and its debuff cancelled,
a pure debuff spell, poison never wastes it, under 2 slots, out of sight); Galbraith's Contingency (refused stuns, a lost
turn keeps the guard, it drops after a played turn, sleep / sheep never land); his turn (teleport and never two turns
running, the Wall vs two melee heroes, Chain on a cluster, the ray, wind-ups alternate and one at a time, out of slots →
Intermission, never ends over the void, **pushed over the void he floats back toward the party in both phases**); the Encore
(at 100, damage carries, no slots / rule, move 5, kit, ×1.5, crystal heal 8, two rays at two foes, the Finale anchored on
him and moving with him, its landing, every other turn); Focus Crystals (AutoPlay hints 14 / 18, aimable from range, the
break, the flavor, the refill drops); *That's a 1 Now* at this door (needs `svammiel.js` + `cameo.js`: the start cameo's
rule and exact desc, a countered spell never spends it, the estimate says 1, only the first hit); voice (lengths, pronouns,
V verbatim lines, the DM's whispers without a Silence tip, named lines name their heroes exactly and never play without
them, Benedick's verbatim, the jab once); sprite and props (both looks × 4 poses × 3 times × 5 yaws, no painter errors, a
portrait); robustness (alone in a bare sandbox he acts, previews leave no trace, a full AutoPlay fight under the content
suite's area watch); AutoPlay battles (fixture smoke; `real=1`: the band check 50-90% and the puzzle engaged).

Runs: `bash tools/test.sh "suite=boss_galbraith&isolate=galbraith,svammiel"` — 15 suites PASS (356 assertions). With
`isolate=galbraith` alone the cheat suite logs that `svammiel.js` is missing and passes. `content:` suites with
`isolate=galbraith,svammiel`: all PASS except the two that need the real hero files ("the rules reach real content"), which
fail in any isolated run.
Full `bash tools/test.sh` (Nov 15, 14:55): 1161 suites, 140,235 assertions, **1 failure, not from these files**:
`kit: finish D1 — object texts … say "any single-target damage skill"` flags `rap_speaker`, `rap_bale` (C6's `goats.js`,
in progress). All 15 `boss_galbraith` suites pass, and so do the content, integration and svammiel_lines sweeps over his
content. 0 swallowed "Error in" lines; missing scripts 4 (the Gardener's and the Coven's files and suites, not landed yet).
Screenshots (`.tmp/galbraith/`): the arena at rot 37.5 (deployment), the gallery at rot 270, the Encore under AutoPlay
(`bosshp=0.25`) with the Grand Finale's marked tiles — they read as intended.

## Known issues
- The objective title says "(the minions will flee)" (RULES request above).
- AutoPlay dodges nearly every wind-up and doesn't bait the Counterspell, so author sims measure his at-once spells; humans
  get a different (more spell-friendly, less perfectly dodging) fight.
- Benedick's file is a stub today: his named line waits for the hero (never plays without him); Galbraith is boss tier and
  flies, so Snail Slime never stops him.

## Review (V3) — adversarial review, Nov 15 (owner of this file since the review)
Verified by running code: the 15 owner suites, new review suites, real-party AutoPlay batches with Benedick in the pool
(17 heroes), That's a 1 Now on (the real start cameo), brutal and casual, pinned all-melee / all-caster parties, and a
screenshot of the door with Benedick (`.tmp/review3/gal.png`: reads as intended). Determinism holds (a batch run twice
is identical). Pronouns: he everywhere ("it" only for spells, walls and crystals); first person in his barks; no
Math.random. Ship dark: act-4 only. Benedick's Escargot line is party-filtered by hero id.

**Fixed (regression test `boss_galbraith: review (V3) — Meteoric Displeasure …`):**
- Meteoric Displeasure's desc said "next turn three meteors land", but `meteorPlan` drops one meteor per hero at least 3
  apart (two heroes side by side get one). It now says "next turn up to three meteors land, radius 1 around up to 3
  heroes: 20 fire damage to each foe in them." (the plan's wording had the same slip); the landing is checked against
  the marks.

**Checked, no change needed:**
- Counterspell honesty with the cheat on: the rule's `estimateDealt` (0 while armed) and That's a 1 Now's (1 for a 10+
  hit) agree in either order, and the real hit is 0 and never spends the cheat. Hero spells deal `cause: 'skill'`
  damage (none of the 17 heroes' spells routes through an explosion), so the counter and its estimate always match.
- Benedick's Snail Slime never snags him (a flying boss). Taunt narrows every spell, wind-up and the Encore's two rays to
  the taunter. A turn lost to a stun refills slots but never counts as a blink turn.
- Whole real fights under the content suite's area watch (normal, brutal, casual): every hit inside its marks, every
  fight ends, no swallowed errors.

**Numbers (author sims, random real parties of 4 from all 17 heroes, L5.5, no items, normal; band 66-74%):**
seeds 31 × 80: 70% · 41 × 80: 76% · 777 × 40: 73% · 4242 × 20: 50% → **70.9% (156 / 220)**, 11.6-13.1 rounds,
2.8-4.4 downs, 0 timeouts. That's a 1 Now on, seed 31: 68% vs 70% (−2, within §7.1's ≤ 3). Composition spread (no coin
flip on one party): all-melee Betty, Basanos, Valdris, Slate 50% (20 fights, 0 spell damage on him); all-caster Kiri,
Zarathor, Marbles, Syllamin 80% (1.5 counters a fight).

**Remaining (not fixed here):**
- RULES: the objective title still reads "Defeat Grand Magister Galbraith (the minions will flee)" for a boss with no
  minions (`Combat.objectiveText`; the owner's request stands).
- AutoPlay dodges almost every wind-up (meteor hits ~0, Power Words landed ~0.1-0.3) and never baits the counter; the
  author sims measure his instant spells.

**Test tooling added (AutoPlay suite):** `cameo=1` (the real start cameo with That's a 1 Now), `party=a,b,c,d`.

## QA fixes (Nov 17, QA FIXER content cluster; the full list: docs/notes/boss-svammiel.md "QA fixes (Nov 17)")
- **voice-5**: `galbraith_encore` #2 reads "A spotlight finds Galbraith, now a floating skull in a crown. He bows ..." (he,
  never it). Suite "boss_galbraith: QA voice-5". **FIGHTS-11** (svammiel.js): That's a 1 Now removes its chip once spent.
