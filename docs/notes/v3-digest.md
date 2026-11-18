# V3 DIGEST — act 4 "Under the Table" and the 17th hero, integrated (the map of V3 for the lead and the balance pass)

Owner: the integrator (plan `.tmp/v3/design.md` §8.2 row I, §4.12, §7.2, §7.3, §8.4). The plan is the build plan; the
user's words are `.tmp/v3/request.md`; the v2 rules that bind V3 are `.tmp/wf12/lead-decisions.md` (D1-D11); the contract
is `docs/ARCHITECTURE.md` (V3 rows) with `docs/notes/v3-contract.md` (the lead patches P1-P15 against shipped v2). Every
area's own notes are `docs/notes/<area>.md`; this file maps them and holds the integrator's numbers.

**Status (Nov 15).** Everything in the plan's build split has landed and been reviewed (RULES, META-RUN, MAPGEN,
RENDER-SPRITES, RENDER-WORLD, HUD, META-UI, NARRATIVE, C1-C6, HERO-BENEDICK; seven adversarial reviews). The integrator
wrote the V3 sims and integration suites and **flipped the knob: `DD.Balance.campaign.acts` is 4** (`js/data/balance.js`,
one line). A normal campaign now goes on after the Dungeon Master: the twist ("You thought this was over? I, SVAMMIEL,
CONTROL ALL."), a gauntlet of five mini-boss doors in the party's chosen order, then Svammiel. Benedick, the 17th hero,
is live in every act from the start. The full suite passes (§5). The first four-act numbers against plan §7.1 are in §4;
**the balance pass (BAL) comes next** — nothing was tuned here. In one line: the 3-act game is v2 (32.5% over 200 runs);
act 4 is far too easy for campaign parties (doors ~99%, Svammiel ~95-100%, act 4 cleared 89-97% against 55-65%), so a
normal four-act campaign wins 35% against "about 25%"; Benedick's random-party share is low (0.68× the median).

**Release gate (Nov 18): READY** (§7). Tests twice green and identical (1294 suites, 149,729 assertions); 900 fresh-seed
sim runs with 0 errors; the four-act campaign 24.0%; act 4 secret until reached; Benedick live from the start. Two
explained misses stay with the lead: Svammiel 90.6% (plan 80-85%) and CAUGHT ~38% of his wins (plan ≥ 60%).

**V3.1 polish (Nov 18)** (§8): the gate's ten leftovers are done. AutoPlay now chips two-hit hinted objects: CAUGHT 41% →
75% of his wins in act-4-alone sims (which also lifts him there, 72% → 81%: BAL's row); the Radio Edit skips heals;
acts 1-3 unchanged; 1298 suites green.

---------------------------------------------------------------------------------------------------------------------

## 1. What V3 is, file by file

| Area (owner) | Files | What it is | Notes |
|---|---|---|---|
| Lead (wave 0) | `js/core/namespace.js`, `js/data/balance.js` (V3 rows), both manifests, `tests/core_tests.js`, ARCHITECTURE / DESIGN V3 sections | `DD.finalAct()` (= `campaign.acts` clamped 3..`DD.MAX_ACT` 4), `DD.registerCameo`, narration act variants (`key@a4`), the act-4 balance rows (`act[4]`, `gauntlet` order scaling off, `prices.bribe` 75, `priceAct[4]` 1.25, `map.gauntlet`, `cameo` budget 3 / 1 / 2 and `cameo.off`) | `v3-contract.md` |
| RULES | `js/engine/cameo.js` (new, ~520 lines), `combat.js`, `actions.js`, `tests/{engine_tests,fixtures}.js` | **`DD.Cameo`**: start cameos (banner + roast + comeback + cheat card), the twist, interjections (≤ 3 a fight, ≤ 1 a round, 2 rounds apart), cheats as silent `cameo:<id>` rules, the Bribe, Full / Short / Log only, cosmetic RNG only, never in previews; engine E1 (`actsWithOwner` shared turns), E2 (extra initiative entries), E10 (squad `objective.bossIds`), E11, E12 (`stats.swaps / cameos / cheats`), E13 (`modifyUse` veto: the Radio Edit, R11) | `rules.md` |
| META-RUN | `js/run/{run,runmap,rewards,meta}.js` | the twist (the DM's loot at last, 50% heal, act 4), the gauntlet map (rows 2L+2: lobby, a door row per lane, intermissions, last stop, the floor boss; lanes from the registry), doors (`miniboss` nodes, sealed lanes, `stats.miniBosses`), the Bribe (act-4 shops), act-4 odds and prices, `startAtAct`, summaries (`acts`, `gauntlet`, `gauntletLanes`, `floorBoss`), saves (a v2 act-3 save meets the twist) | `meta-run.md` |
| MAPGEN | `js/engine/encounter.js`, `js/data/themes.js`, `js/data/wildmagic.js` | random picks never return a door or the finale; squad boss objectives; the six act-4 themes (`a4_conservatory`, `a4_lair`, `a4_observatory`, `a4_cottage`, `a4_barn`, `a4_underfloor`) | `mapgen.md` |
| RENDER-SPRITES | `js/render/{fx_render,audio}.js` | the `cameo` FX (entrance / swoop / shadow / bubble), banner `fit` + `frames` (the 72-letter League name), 14 stingers with fallbacks | `render-sprites.md` |
| RENDER-WORLD | `js/render/renderer.js` | act-4 arena looks and ambients (pollen, stars, notes), E8 content zones (`state.data.zones`), Benedick's campfire seat [4, 6] | `render-world.md` |
| HUD | `js/ui/combat_hud.js` | the cameo moment host (skip with Space / Enter / Esc / click), Svammiel's speaker chips, cheat chips (😈, "Next round"), live rule chips, "Mini-boss" / "Floor Boss" labels, the BLEEP sticker | `hud-v2.md` |
| META-UI | `js/ui/ui.js`, screens, `js/main.js`, `css/style.css` | the act-4 map, the Twist panel, the four-act victory and act-4 game over ("(he cheated)"), the Hall's Act IV codex and records (behind the `seen.bosses.svammiel` gate), the cameo setting, 17-card party select / Hall, debug `acts= act=4 beaten= twist= final= cameo= bosshp= gate=` | `ui-v2.md` |
| NARRATIVE | `js/data/narrator.js`, `js/data/svammiel_lines.js` (new), `js/data/events_act4.js` (new), `events.js` (`ev_ben_bistro`) | every `svam_*` pool (17 heroes × 6 roasts / 3 comebacks / 1 twist reaction, 8 announcer lines per door, 19 situations, 25 cheats' quips and the DM's counters), 10 act-4 keys + 19 `@a4` variants, 7 act-4 events, 19 act-4 tips | `narrative.md` |
| C1 the Gardener (it) | `js/data/bosses/gardener.js` | "The Overgrown Conservatory": a brass spider, Strangler Vines on its turn, Pump-kabooms, Weed-B-Gone drums, gnomes that jam Mow the Lawn; 320 HP | `boss-gardener.md` |
| C2 the League | `js/data/bosses/league.js` | the user's Evil Champions (Kelek, Warduke, Skylla she, Zarak — the orc everyone calls a dwarf — Zargash): Villain Hype, the Theme Song, bodies to break, the Trapdoor Lever; 322 HP in all | `boss-league.md` |
| C3 Galbraith (he) | `js/data/bosses/galbraith.js` | "Galbraith's Grand Observatory": spell slots, Counterspell (a fight rule), Focus Crystals, the Intermission, the Encore phase; 340 HP | `boss-galbraith.md` |
| C4 the Coven (she) | `js/data/bosses/coven.js` | "Tea with the Coven": Granny Gristle, Auntie Brine, Cousin Mildred (the Eye: one shared turn until she falls), the Brew and the Hero Pie, Hex Threads, the cauldron; 320 HP | `boss-coven.md` |
| C5 Svammiel (he) | `js/data/bosses/svammiel.js`, `dm.js` (the cut-off line) | "The Last Floor": 12 Round Cheats announced a round ahead, snap and phase cheats, the DM's Rulings, Rigged and Master Dice, CAUGHT CHEATING, No More Floor; the `svammiel` cameo def (start, twist, shadow, interjections, the five door cheats incl. the Radio Edit); 360 HP | `boss-svammiel.md` |
| C6 the Rapping Goats (he) | `js/data/bosses/goats.js` | "The Barn Burner": Herd Mentality (Billy Bleatz, Lil' Kid, DJ Turnip), the Verse and Bar None, Clap Backs, the bass, Ursa Verse the Paw-et Laureate at the crew's combined half HP; 285 + 110 HP | `boss-goats.md` |
| HERO-BENEDICK (he) | `js/data/heroes/benedick.js` | Benedick the Inevitable, Snail (Dragon, Allegedly), Knight of the Margins: move 2, the slime trail, Coming Out of My Shell → 2 turns as the Dragonsnail, Snail Mail, The Inevitable; his only heal is the Snail Mucin Serum (D9) | `hero-benedick.md` |
| Integrator | `tests/sim/sim.js`, `tests/content/integration.js`, `tests/content/shared.js` (`REAL`), `tests/content/kit.js` (one list), `README.md`, the flip, this file | §2 | this file |

**Act 4 at a glance.** After the act-3 boss: the twist; the lobby (a shop or an event); five door rows (the party picks
any open lane; a won lane is sealed on every row), each followed by a stop (tavern / shop / event); a last stop; Svammiel.
Every door opens with Svammiel's start cameo (an announcer line, a roast, maybe a hero's comeback, one small announced
cheat: Green Thumb, Nepotism, That's a 1 Now, The Floor Is Lava, the Radio Edit); doors pay 45-63 gold and a rare item.
Ship-dark rules held until the flip: with `campaign.acts` 3 the game is v2 line for line (the core review's 50-seed
check), and act 4 stays a secret in the game until reached (title, tips, codex, Hall, README).

---------------------------------------------------------------------------------------------------------------------

## 2. The integrator's changes (this pass)

### 2.1 `tests/sim/sim.js` (plan §7.2)
- Sized and looped to `DD.finalAct()`; `stop=` defaults to it. A gauntlet door is fight kind `miniboss` in every table
  (`mini` in the labels); the act boss of the last act is the final boss (gold and level "at the final boss").
- New params: `start=N` (`DD.Run.startAtAct` after `newRun`; a gauntlet act defaults to level 5 and 450 gold), `level=`,
  `gold=`, `order=random | fixed:a,b,… (lanes left out follow in the registry's order) | lowhp` (the lane the party has
  the best record against on this page), `cameo=0` (`DD.Balance.cameo.off = 1`, lead patch P14), `acts=N` (sugar for
  `bal=campaign.acts:N`).
- Gauntlet routing: doors by `order=`; stops — a tavern under 70% HP or with 2+ scars, a shop with 120+ gold, else an
  event; the Bribe is bought with 200+ gold.
- **The shapeshift rule**: a new skill (level-up, tome, reward) never replaces a skill tagged `'shapeshift'` (Benedick's
  shell, Basanos's Transform and Blood Moon, Ellaria's Wild Shape); the lowest-level other skill goes instead, and with
  nothing else the new skill is skipped. The report counts how often v2's rule would have forgotten one.
- New report sections: the header ("N acts", "random 4 of all N heroes", the door order, cameos off, the
  "(N−1)-act equivalent" next to the campaign rate); `== act 4` (entered / cleared with a CI, the twist after the
  act-3 boss's wins, permanent deaths and rounds of fighting per act-4 run); the gauntlet **by lane** (n, win % of decided
  fights with a CI, rounds, HP lost, downs, ≤ 2-round wins, timeouts, level, start HP) with each door's puzzle counters
  from its `DD.<Module>.stats(state)` (the goats: bars hung, Clap Backs, Bar None landed / interrupted / fizzled, speakers
  broken, the bear's arrival round and rate); **by position** 1..L (points against all doors); the order (first doors,
  full orders); the **Svammiel** table (phase reached, CAUGHT, Rulings, dice, falls, pencil HP, cheats, panels, imps; gold
  and level at him); **cameos** (start cameo rate, cameos and cheats per fight, budget violations and any cameo memory
  outside act 4 and the act-3 boss as error lines); run length; gold left at the end of won runs.
- `window.DD_SIM` also exposes `replaceIdx`, `isShapeshift`, `LANE_STATS` (the integration suite tests the rule).

### 2.2 `tests/content/integration.js` (plan §8.4 "Integrator")
- `ALL` += `'benedick'` (he); `PENDING_HEROES` emptied (he landed); the campaign smoke draws from the registry.
- Act coverage to `DD.finalAct()`: act 4 = the registry's L lanes (all of them on the run map) + one boss-tier finale.
- New suites "integration: V3 — …": the twist line on the act-3 boss's board with acts 4 and never with acts 3 (and
  the gate); the DM's cameo pool never picks an act-4 enemy (with acts 3 and 4); the **pronoun sweep** (2,708 texts:
  every act-4 enemy's desc / passive / barks / named lines / intro, act-4 skills, statuses, objects, terrains and
  encounters, every narration pool, the act-4 events, the fight files' line banks; a sentence naming exactly one
  character — a villain, the DM, Baba Yaga or a hero — uses only that character's pronouns, an unnamed one its text's
  owner's or the subject carried from the sentence before; mourning barks are about the member mourned; probes prove it
  catches a wrong pronoun of every kind; every named villain def's `pronoun` as the user gave it); **four-act campaigns**
  (from the DM's act and from act 4: the twist exactly when the DM falls, the gauntlet's shape, no door twice, a won run
  is `acts 4`, `floorBoss`, every lane beaten); **determinism** (an act-4 door fought by AutoPlay twice, the second time
  with an extra line in every cosmetic pool and every act-4 bark list: result, round, combat RNG state, Hype, every unit's
  HP and tile and the cheats are bit-identical); the sim's shapeshift rule for every skill tagged `'shapeshift'`.
- `tests/content/shared.js`: `REAL` += `'benedick'`.

### 2.3 Fixes in other owners' files (each blocked the flip's full run; the smallest safe change)
- `tests/content/kit.js` 'kit: finish D1': `OPT_OUT` += `'ben_inevitable'` (DESIGN §4.2 already names The Inevitable;
  the integrator holds an optional row of this file, the heroes-v1 list, which is already registry-driven).
- `tests/content/boss_dm.js` 'boss_dm: robustness': with act 4 after him the DM's defeat line is cut off ("Same time
  next—", C5's `dm.js` change); the assert now expects the cut line exactly when `DD.Cameo.campaignGoesOn` says so.
- `tests/content/narrative.js` 'narration tokens are filled in practice': once Svammiel's spoiler gate is open on the
  page (an earlier suite's DM win plays the twist), a new run opens from `run_start` or `run_start_seen`; either counts.

### 2.4 README
"Pick 4 of 17 heroes" and Benedick's line (no act-4 spoiler: still "three acts … and, finally, the Dungeon Master").

---------------------------------------------------------------------------------------------------------------------

## 3. The flip
`js/data/balance.js`: `campaign: { acts: 4 }`. `DD.finalAct()` is 4: the DM's win is the twist, act 4 is the gauntlet,
act-4 fights read `act[4]` (×1 / ×1) and act-4 shops `priceAct[4]` 1.25. `acts=3` (sims) and `bal=campaign.acts:3` (any
page) still give the v2 campaign.

---------------------------------------------------------------------------------------------------------------------

## 4. First numbers against plan §7.1 (normal unless stated; the balance pass reads these)

Stock `tools/sim.sh` after the flip, 50-seed batches, one headless Chrome at a time; reports in `.tmp/v3/int/`
(`rebase3_*`, `a4_normal_*`, `s4_*`, `a4_brutal_3000`, `a4_casual_4000`, `party_*`; pooled with `.tmp/v3/int/heroes.awk`
and `lanes.awk`). Random 4 of all 17 heroes, smart route, AutoPlay. **All 4,600+ fights: 0 errors, 0 round-cap stalls,
0 `DD.warn` lines, 0 cameo budget violations, 0 cameo memories outside act 4 and the act-3 boss.**

**The headline: act 4 is far too easy in campaign play.** Campaign parties (items, Blessings, level ~5.1-6.3, the 50%
twist heal) win the doors ~99% and Svammiel ~95-100%, against bands of 91-95% and 80-85%. The owners tuned every fight
to its *author* band (bare parties, 63-74%, Svammiel 55-62%), and v2's mapping "author 65-70% → campaign 90%+" held, but
overshot. So a normal four-act campaign wins **35%**, above the user's "about 25%". The act-4 row `DD.Balance.act[4]`
(×1 HP / ×1 damage today) is the obvious first lever, as act 1's rows were in v2; the per-fight knobs come after.

### 4.1 The 3-act re-baseline (`acts=3`, 200 runs: seeds 1000, 2000, 5000, 6000 × 50; 4 of 17 heroes)
| measure | v2 release gate (300 runs, 4 of 16) | re-baseline | |
|---|---|---|---|
| campaign wins | 30.7% (CI 26-36) | **32.5%** (65/200, CI 26-39) | same within noise |
| act 1 / 2 / 3 cleared | audit 67% / 69% / 70% | 69% / 67% / 71% | same |
| party level at the act 1 / 2 / 3 boss | 2.0 / 3.2 / 4.5 | 2.0 / 3.3 / 4.5 | same |
| Grimble · Rat King · Lich-tenstein · Dr. Iris · the DM | 70% · 77% · 84.5% · 83% · 72% | 74% · 76% · 82% · 87% · **82%** (65/79) | the DM +10 (z ≈ 1.9; n 79) |
| errors / stalls / warnings / cameo leaks | 0 / 0 / 0 | 0 / 0 / 0 / 0 | ship-dark holds |

Seeds 1000 and 2000 play acts 1-3 identically under `acts=3` and `acts=4` (the same 17 + 19 parties reach the DM), so
nothing V3 touches before the twist changed v2's fights.

### 4.2 The four-act campaign (normal, 100 runs: seeds 1000 and 2000 × 50)
| plan §7.1 measure | target | measured | |
|---|---|---|---|
| 4-act campaign wins | ~25% | **35%** (35/100, CI 26-45) | MISS (high) |
| 3-act equivalent (act 3 cleared) | the re-baseline | 36% (36/100) | — |
| the twist | every act-3 boss win | 36 / 36 | PASS |
| act 4 cleared (of the parties that enter) | 55-65% | **97%** (35/36, CI 86-100) | MISS (high) |
| each door | 91-95%, no position worse than −6 | **99.4%** (177/178) | MISS (high) |
| Svammiel (party level ~6.1) | 80-85% | **100%** (35/35) at level 6.0-6.1 | MISS (high) |
| act-4 permanent deaths | ≤ 0.6 per act-4 run | 0.06 (2 in 36) | PASS |
| rounds of fighting in act 4 | ≤ ~55 a run | 55 (53.2 / 56.5) | PASS (edge) |
| gold at Svammiel / left at the end of a won run | — / 100-150 | 95 / **103** (n 35) | PASS (low edge) |
| start cameo in every act-4 fight; budget | 100%; 0 over | 213 / 213; 0 over (3.3 cameo lines a fight) | PASS |
| casual: 4-act campaign / act 4 cleared | ~55% / ~80% | 68% (27/40) / 96% (27/28) | MISS (high) |
| brutal: act 4 cleared | ≥ 30% | 1 / 1 (the campaign 1/40 = 3%; v2's brutal 13% → its 3-act equivalent here is 3%, n 40) | — |

### 4.3 Act 4 alone (`start=4&level=5`: 450 gold, auto gear; 400 runs: random order, both fixed orders, `cameo=0`)
| | n | win | rounds | HP lost | downs a fight | plan |
|---|---|---|---|---|---|---|
| **all doors** | 1,951 | **98.7%** | 10.3 | 24% | 0.82 | 91-95%, 7-10 rounds, ≤ 1.3 downs |
| the Gardener | 389 | 99.5% | 12.5 | 17% | 0.78 | (long: armor 2 and Photosynthesis) |
| the League | 389 | 99.5% | 9.8 | 20% | 0.71 | |
| Galbraith | 392 | 97.2% | 8.9 | 28% | 1.00 | |
| the Coven | 390 | 98.2% | 9.4 | 27% | 0.86 | ≤ 1.1 downs |
| the Rapping Goats | 391 | 99.2% | 11.2 | 29% | 0.74 | 8-10 rounds, ≤ 1.1 downs |
| door 1 / 2 / 3 / 4 / 5 | 400 / 399 / 389 / 385 / 378 | 99.8% / 97.5% / 99.0% / 98.2% / 99.2% | 10.0-10.7 | 32% → 20% | 0.50-1.05 | no position −6: PASS |
| **Svammiel** | 375 | **94.9%** | 11.3 | 32% | 1.96 | 80-85%, 10-12 rounds, ≤ 1.5 downs |
| **act 4 cleared** | 400 runs | **89%** (random 89, fixed A 90, fixed B 90, cameos off 87) | ~61 rounds a run | | 0 deaths | 55-65%; ≤ ~55 rounds |

Fixed orders: A = coven, galbraith, league, gardener, goats; B = its reverse with the goats first. The order moves nothing
measurable (every lane 97-100% wherever it stands).

**Puzzle engagement per fight** (four of the batches; every counter > 0 over a batch, as plan §7.2 asks):
- the Gardener: gnome jams 0.4 · drums 0.6 · vines weeded 4.4 · gourds popped 1.2 · mows 5.4 (1.5 hit) · its
  `overgrowth` counter ~7.9 · Photosynthesis healed ~32.
- the League: bodies 5.9 (0.9 broken, 0.9 raised) · songs 0.95 (0.27 hits) · lever 0.63 (0.64 dropped) · Expendable 0.97.
- Galbraith: Counterspells 0.23 · rests 0.75 (~36 damage taken resting) · crystals broken 1.4 · meteor hits 0.14 ·
  Power Words landed 0.17 · crystal heal ~12.5.
- the Coven: stirs 4.4 · pies 0.6 (0.12 landed) · tips 1.1 · spot-rounds held 6.0 · thread hits 2.7 · the Eye dropped in
  ~99% · sleeps 1.15.
- the goats: bars hung 2.9 · Clap Backs 1.6 · Bar None landed 0.77 (≤ 2.0: PASS) · interrupted 0.30 · fizzled 0.13 ·
  speakers broken 0.30 · tributes 2.6 · bass hits 0.56 · **the bear arrived in 198 / 198 fights** at round ~5.3 (PASS).
- Svammiel: phase 3 in ~98% · **CAUGHT ~20% of wins** (6-32% by batch; plan ≥ 60%: MISS, AutoPlay rarely chips the
  far Master Dice: ~1.15 broken a fight) · Rulings 2.1 · Rigged Dice 2.7 · falls 1.7 · pencil HP ~35 · Round Cheats 10.3
  and snap cheats 0.28 a fight · panels dropped ~4.

**What the cameo cheats cost** (`cameo=0` against cameos on, the same seeds 7000-7099): doors 98.1% off / 99.0% on,
Svammiel 95.6% / 93.7%, act 4 cleared 87 / 89. No cost is measurable at these rates (each lane within 3 points: PASS
trivially; the ceiling hides any cost). The Bribe was bought ~1.4 times an act-4 run, so ~0.75 of the doors had a cheat.
The goats review's paired author batch (bare, L5.5) put the Radio Edit at ~6 points there: BAL re-measures once the
doors come down.

### 4.4 Benedick (plan §7.1 row; `addendum-benedick.md` §20)
| measure | target | measured | |
|---|---|---|---|
| run-win share, random parties (the 3-act re-baseline, 200 runs) | 0.85-1.15× the median | **19.4%** (12/62) = **0.68×** the median 28.6% (CI ≈ 11-31%) | MISS (low; n 62) |
| … in the 4-act campaigns (100 runs) | | 21.8% (7/32) = 0.62× the median 34.9% | MISS (low; n 32) |
| his seat against Slate's (fixed party benedick / slate, betty, kiri, josiah; seeds 1000-1049, 4 acts) | — | **50%** (25/50) vs 28% (14/50); act 3 cleared 52% vs 32% | strong with a healer |
| damage taken a fight | 14-19 | 11.5 (random) · 14.5 (the fixed party) | MISS (low) in random parties |
| downs a fight | ≤ the roster median (0.31) | 0.20 | PASS |
| shell socketed | every fight | 776 / 776 fights of the fixed party (the shapeshift rule; the review counted 616 / 630 before it) | PASS |
| shell / Dragonsnail / slime stops / Snail Mail | ≥ 70% / 30-45% / ≥ 0.5 / ≥ 1.2 | not re-measured: the owner's `zz` batch (101/101, 45%, 0.40, 1.05) | — |
| guard rails: Basanos, Pebbles within ±5 points of v2 | v2 25.7%, 25.6% | 28.6% (+2.9, n 42), 29.2% (+3.6, n 55) | PASS (noisy) |

**The re-baselined per-hero table** (normal, 3 acts, 200 runs, random 4 of 17; median 28.6%; n 37-62 runs a hero, so
±12 points): Ellaria 72.1% (2.52×) · Josiah 53.9% (1.89×) · Zarathor 49.9% (1.75×) · Syllamin 41.9% (1.47×) · Marbles 36.3%
(1.27×) · Hjalmar 34.9% (1.22×) · Betty 32.7% (1.14×) · Pebbles 29.2% (1.02×) · Basanos 28.6% (1.00×) · Buga 27.9% (0.98×) ·
Corelos 27.1% (0.95×) · Marwyn 25.7% (0.90×) · Kiri 24.4% (0.85×) · Valdris 23.3% (0.82×) · Sparrow 20.9% (0.73×) · **Benedick
19.4% (0.68×)** · Slate 10.8% (0.38×). The order matches v2's (Ellaria, Josiah, Zarathor on top; Slate at the bottom).
Benedick's per fight: 41.2 damage, 11.5 taken, 0.7 healed (all from the Serum), 0.20 downs. His low share with random
companions against his strong fixed-party seat is BAL's to read (a healer partner, or AutoPlay's slime and Snail Mail
gaps — the owner's notes list them); D11 holds (Ellaria untouched).

### 4.5 After the balance pass and the independent audit (Nov 17; `docs/notes/balance.md` "V3" and "V3 balance audit")
The numbers above are the integrator's, at ×1. BAL then added `act[4]` ×1.3 damage and a row per fight (Master Die 12 → 6
HP, hint 30 → 45); the auditor moved two of those rows on fresh seeds: the goats ×0.8 HP (their ×1.1 damage dropped: the
costliest door, 95.4% and 1.17 downs, where the plan pays the Radio Edit back) and Svammiel ×1.1 HP / ×1.3 damage (was
×1.05 / ×1.25: 91.5% of 142 fights). The rows now: `act[4]` ×1 HP / ×1.3 damage; the Gardener ×0.75 / ×1.45, the League
×1.05 damage, Galbraith ×0.95, the Coven ×0.9, the goats ×0.8 HP, Svammiel ×1.1 / ×1.3. Normal, 600 four-act runs (500 on
seeds BAL never used, 12000-12299 and 15000-15199, and BAL's own C6 check 11000-11099 replayed with the new rows):
| plan §7.1 measure | target | measured | |
|---|---|---|---|
| four-act campaign | ~25% (the user) | **24.0%** (144/600, CI 21-28) | PASS |
| three-act equivalent | v2 30.7% | 31.0%; `acts=3` byte-identical to §4.1's seeds 1000 | v2 unchanged |
| act 4 cleared | 55-65% (plan) / ~80% (P6's default) | 77.4% (144/186) | PASS (P6) |
| each door | 91-95% (plan) / ~97% (P6) | 97.1-98.3% (n 174-179 each), positions 96.5-100% | PASS (P6) |
| door downs / rounds | ≤ 1.3 (≤ 1.1 Coven, goats) / 7-10 | 0.64-0.99 / 8.2-9.8 | PASS |
| Svammiel | 80-85%, 10-12 rounds, ≤ 1.5 downs, CAUGHT ≥ 60% of wins | 86.2% (144/167), 11.6, **2.76**, 72% | edge / PASS / MISS / PASS |
| act-4 deaths · rounds · gold left (won) | ≤ 0.6 · ≤ ~55 · 100-150 | 0.13 · 53.7 · 145 | PASS |
| cameos | start cameo every fight, 0 over budget | 1,051 / 1,051, 0 | PASS |
| each cameo cheat ≤ 3 points | | Green Thumb 3.4, the Radio Edit 2.3 (4.0 at BAL's goats row), the rest ≤ 1.9 (act 4 alone, ±2.3) | PASS (estimate) |
| errors / stalls | 0 / ≤ 1% | 0 / 0 campaign act-4 stalls (act 4 alone: 4 in 1,760 doors) | PASS |
| Benedick share | 0.85-1.15× | 0.97× (three acts) / 1.00× (four), downs 0.22 (median 0.30), taken 13.5 (target 14-19) | PASS / MISS (taken, low) |
| guard rails | Basanos, Pebbles ±5 of v2 | −3.5 / −1.7 | PASS |
Casual (100 runs): four-act 69%, act 4 cleared 94.5%, doors 99.2%, Svammiel 98.6% (plan ~55% / ~80% / ≥ 97% / ≥ 92%: the
floors hold, casual's act 4 is easier than planned; a casual-only act-4 row needs a `B.scale` shape change: the lead's
call). Brutal (100 runs): 16 reach act 4, 13 clear it (81%), doors 80/80, Svammiel 13/16, 0.44 act-4 deaths (floors
PASS; n 16). What the averages hide (compositions, positions, cheats, the Radio Edit's picks, the Clap Back farm,
Svammiel's dice, Benedick's shell and slime) is in `balance.md` "V3 balance audit".

---------------------------------------------------------------------------------------------------------------------

## 5. Test status
Final full `bash tools/test.sh` after the flip and every change above: **PASS — 1273 suites, 149,450 assertions, 0
failures**, 0 swallowed "Error in" lines, missing scripts 0 (13 suites skip by design: diagnostics and `sim=1` batches).
The first full run after the flip had 2 failures, both caused by the flip and fixed in §2.3 (`boss_dm: robustness`, the
cut-off defeat line; `narrative: narration tokens are filled in practice`, `run_start_seen`). The integrator's suites:
`integration: V3 — …` (6 new) and the widened cross-content and campaign-smoke suites all pass. In the four-act smoke's
logged run (seed a0, the targeted run) a party from the DM's act beat the DM, played the twist, all six doors (the five
real lanes and a fixture lane the test page registers: the test page's map has 6 lanes) and Svammiel.

---------------------------------------------------------------------------------------------------------------------

## 6. The open list (owner → request; collected from every V3 report and review, checked against the code Nov 15)

Done since they were filed (no action): HUD E7 (one icon per chip, "Next round" once, live chips, the moment host);
MAPGEN's squad objective and `setup.gauntlet`; RENDER-WORLD's zones and ambient fallbacks; META-UI's 17-card fits, the
Twist panel, tips, `UI.HERO_ORDER`; META-RUN's `run_start_seen` and cameo memory; RULES' `heroDowned` revive skip; C2's
`lg_body` wording and Svammiel's "dwarf" lines; C6's and C1's D1 wordings; Benedick's DESIGN §4.2 entry and race; the
League and Gardener stingers; Svammiel's banner `sting`. The integrator's own (ALL / REAL, the sim's shapeshift rule and
V3 run flow, README, kit `OPT_OUT`) are done above.

**Balance (BAL — next).** The §4 numbers; the levers each owner listed (`DD.Gardener.N`, `DD.League.N`, `DD.Galbraith.N`,
`DD.Coven.N`, `DD.Goats.N`, `DD.BossSvammiel.N`, the skills' `levels`), `DD.Balance.encounters.<id>` rows, the gold levers
(Bribe 75 → 85, `priceAct[4]`), the open campaign target (lead patch P6: "about 25%" vs §7.1's act-4 bands), the Radio
Edit's cost at the goats (the goats review measured ~6 points in a 50-fight author batch; the ban stays whole-fight, lead
decision — take it back on the goats' own numbers), the Gardener's long author fights (17-20 rounds, ~1% timeouts),
Benedick's §7.1 row. **D11: no pass changes Ellaria.**

**C5 (`js/data/bosses/svammiel.js`).**
- `situation()` matches at nearly every start cameo (`mvp` after every fight), so the 17 heroes' personal roasts and
  comebacks almost never play (NARRATIVE: 0 hero roasts in 72 start cameos). Make at most every other start cameo a
  situation (first / last_mini excepted), or roll the always-true ones at 50%.
- The door sulk (`svam_sulk_<lane>`) is budgeted as a quip and usually refused: `force: true` on the `sulk` trigger.
- No counter whisper for the snap cheats and the silent phase rules (the `svam_counter_*` pools exist).
- The finale shows no opponent banner (`banner: false` + Svammiel on his own board turns the start cameo into barks);
  drop `banner: false` or amend plan §3.0.1.
- The finale's `shortName` 'The Last Floor' reads "Killed by The Last Floor (he cheated)"; `shortName: 'Svammiel'` reads
  better.
- The kids'-table DM object lacks `codex: true` (the Floor Boss codex shows 4 of plan §5.8's 5 cards).
- The twist logs Svammiel's line before "The table shakes…" (plan §2.1 has the shake first; RULES' `then` order).
- Opening Meta's spoiler gate from a sandbox twist (`twistExtras` → `markSeen`) leaks across test suites and onto a debug
  page's saved meta: consider marking only in a run (`DD.Combat.state.run`), as `run.js completeAct` already does.

**C2 (`js/data/bosses/league.js`).** `intentVictim` uses `G().hostile`: a member charmed after his wind-up shows a number
on a hero and then hits nobody (the goats review fixed the same bug in goats.js; wind-ups ignore charm, land by side).

**RULES.** `combat.js rollEntry` `tie: s.rng.float()` is NaN (no bounds; a v2 bug): equal initiative totals keep insertion
order instead of a coin flip (`s.rng.next()` keeps the draw count, so determinism holds; it moves v2's sims a little).
`Combat.objectiveText` titles a solo boss without minions "(the minions will flee)" (Galbraith). AutoPlay:
`comboSkills` plans a vetoed skill (`DD.Combat.vetoOf`); `objectValue` prices a two-hit hinted object at dmg × 0.5 (bodies,
Master Dice under-broken; CAUGHT in ~30% of Svammiel wins vs plan ≥ 60%); Stirring Spots priced only on the step; optional:
a per-unit terrain cost (Granny in the bog), `srcPositions` that respect stops (Benedick's slime), `AI.intentDmg`'s raw
number in the wind-up tooltip.

**Lead (docs, loader).** DESIGN §5 / §9 to the shipped numbers (Gardener 320 HP / Mow 26 / Overgrowth 160 / Shears 14 /
Trimmer 11 / Spitter 8 / Tendril 7 / Weed and Feed 16; League 322 HP, Unholy Water 12; Galbraith ray and chain 14; Coven
Hero Pie 23, Hex Threads 8, stir-then-act, Bedtime to the Coven's next turn; goats WHAT?! 8, 285 + 110 HP, Bar None
22 / 26; Svammiel 360 HP, Pitchfork 10, Natural Twenty 12, Hellfire Rain 14, one action in phase 3, Pencilled HP ≤ half a
round). ARCHITECTURE: §3.8 / §3.13 (`cameo.actor`, `cameo.frames`, trigger fields, `linePrefix`, cheat `quips`), §5.11
(`heroDowned` refinement), §7.2 / §7.4 / §7.6 (renderer and FX APIs, banner fit / `sting`), §8.1 / §10.1 (DD.UI helpers,
`gate=1`, `screen=hall&tab=`, `start=`, `bosshp`'s fallback, `DD.<Module>.CODEX`), §9.2-9.4 (`startAtAct`, `sealLane`,
`unbeatenLanes`, `killedByEncounter`, the pending `{ lane, index, beaten }`, `isGauntlet` counting a lone finale, doors in
`stats.miniBosses`). `js/loader.js`: the isolate filter should always load `svammiel_lines.js` / `events_act4.js` (P9).
`docs/notes/kit.md`: the reason for `ben_inevitable`'s D1 opt-out (he arrives next to a foe, a crate is not worth the
trip, his basic still bites one).

**Optional / cosmetic.** META-UI: print a status's function desc in the codex (then `cov_the_eye` can go). RENDER-SPRITES:
a gallery view of a hero's extra looks (Benedick's shell and Dragonsnail); Svammiel's gallery preview at scale 2.4 spills
into the Statuses panel. HUD: the generic sleep tooltip doesn't say "until the end of the Coven's next turn". Headless
Chrome draws 😈 / 🤡 as boxes (no emoji font). The user's tone call: the goats' two Sparrow blood-magic lines.

---------------------------------------------------------------------------------------------------------------------

## 7. The V3 release gate (Nov 18) — READY

The gate ran on the tree as the QA fixers left it (after the audit's rows and the three QA fix passes: FIGHTS-01..13,
flow-1..5, voice-1..8, HERO-1..8). **It changed no game or test file.** Scratch: `.tmp/v3/gate/` (test logs `test1.txt`
/ `test2.txt`, sim reports `n4_* s4_* s4c0_* cas_* bru_* a3_*`, the pooling script `pool.awk` and `h3.awk`, the shots
under `shots/`, the chains `sims.sh` / `sims2.sh` / `shots.sh`). One headless Chrome at a time throughout.

### 7.1 Tests (twice)
`bash tools/test.sh` twice: **PASS — 1294 suites, 149,729 assertions, 0 failures** both times (1281 pass, 13 skip by
design: diagnostics and `sim=1` batches). The two logs are identical line for line (timings aside), console included:
every "Error in …" line comes from a suite that throws on purpose (`boom`, `exploded`, `intentional test error`,
`balloon popped`); the one content advisory is Benedick's move 2 (on purpose, Q19). Nothing flaky.

### 7.2 Fresh-seed sims (seeds from 13000; stock `tools/sim.sh`, 50-seed batches)
900 runs, 7,782 fights: **0 errors, 0 `DD.warn` lines, 0 round-cap stalls, 0 timeouts, 0 cameo budget violations, 0
cameo memories before act 4.** Normal four-act = seeds 13000-13199 (200 runs); act 4 alone = `start=4&level=5`, the same
seeds (200, plus 200 paired with `cameo=0`); casual and brutal 100 each (casual replays the audit's casual seeds: acts
1-3 identical, so its act 4 is a paired check of the QA fixes); `acts=3` 100 (13000-13099: acts 1-3 replay the four-act
runs fight for fight — the same boss results — so V3 changed nothing before the twist).

| plan §7.1 measure (normal unless stated) | target | gate | audit (Nov 17) | |
|---|---|---|---|---|
| four-act campaign | ~25% (the user) | **24.0%** (48/200, CI 19-30) | 24.0% (600) | PASS |
| three-act equivalent · `acts=3` | v2 30.7% | 28.5% (57/200) · **30.0%** (30/100) | 31.0% | PASS (v2 unchanged) |
| the twist after every act-3 boss win | 100% | 57/57 (+ casual 73/73, brutal 9/9) | | PASS |
| act 4 cleared | 55-65% plan / ~80% P6 | 84.2% (48/57) | 77.4% | PASS (P6), within noise |
| each door | 91-95% plan / ~97% P6 | 98.5% (268/272): Gardener 98.2 · League 100 · Galbraith 98.2 · Coven 96.4 · goats 100 (n 53-56) | 97.9% | PASS (P6) |
| no position worse than −6 | | doors 1-5: 96.5 / 98.2 / 98.1 / 100 / 100 | | PASS |
| door downs ≤ 1.3 (≤ 1.1 Coven, goats) | | 0.77: Gardener 1.31 · League 0.34 · Galbraith 0.78 · Coven 0.66 · goats 0.73 | 0.80 | PASS (Gardener at the line, n 55; audit 0.99) |
| door rounds 7-10 (goats 8-10) | | 9.2: Gardener 10.3 · League 8.7 · Galbraith 8.8 · Coven 9.0 · goats 9.6 | 9.1 | PASS (Gardener at the line; audit 9.7) |
| Svammiel 80-85% at ~6.1 | | **90.6%** (48/53, CI 80-96) at 6.11 | 86.2% | **MISS (high), explained** — below |
| Svammiel 10-12 rounds · ≤ 1.5 downs | | 12.1 · **2.25** | 11.6 · 2.76 | edge · MISS (structural, as the audit) |
| CAUGHT in ≥ 60% of his wins | | **~38%** (0-63% by batch); act 4 alone ~42% | 72% | **MISS, explained** — below |
| act-4 deaths ≤ 0.6 · act-4 rounds ≤ ~55 | | 0.14 · 55.4 | 0.13 · 53.7 | PASS (rounds at the line) |
| gold left at the end of a won run 100-150 | | 137 (n 48) | 145 | PASS |
| start cameo in every act-4 fight; 0 over budget | | 325/325 (every batch with cameos on: 1,833/1,833); 0 | | PASS |
| each cameo cheat ≤ 3 points (`cameo=0` vs on, act 4 alone, 200 paired runs) | | Green Thumb 2.3 · Nepotism 1.1 · That's a 1 Now −0.7 · Floor Is Lava −0.5 · **Radio Edit 3.4** (each ±~2) | GT 3.4, RE 2.3 | PASS as an estimate; the Radio Edit at the line (in the campaign the goats won 53/53) |
| the goats: the bear in 100% of fights reaching half; Bar None ≤ 2.0; engagement > 0 | | the bear 53/53 (act 4 alone 176/176); Bar None 0.61; bars hung 2.0-2.7, Clap Backs 0.8-1.4, interrupted 0.2-0.4, speakers 0.2-0.9 a fight | | PASS |
| errors / warnings / timeouts | 0 / 0 / ≤ 1% | 0 / 0 / 0 | | PASS |
| Benedick share 0.85-1.15× the median | | three-act 23.8% = **0.97×** (median 24.5%), four-act 21.3% = **1.03×** (n 42) | 0.97× / 1.00× | PASS |
| … damage taken 14-19 · downs ≤ the median (0.31) | | 14.0 · 0.20 | 13.5 · 0.22 | PASS (taken at the line) |
| … shell / dragon / slime stops / Snail Mail | | not re-measured | 100% · ~44% · 0.40 · 1.05 | audit stands (slime / mail MISS: AutoPlay never baits) |
| guard rails (three-act shares within ±5 of v2) | Basanos 25.7, Pebbles 25.6 | Basanos 21.7 (−4.0) · Pebbles 25.0 (−0.6) (n 46 / 56) | −3.5 / −1.7 | PASS |
| act 4 alone (`start=4&level=5`) | — | cleared 49.5% · doors 93.3% · Svammiel **70.2%** (99/141) | 40% · 93.4% · 56.3% (QA fixer: 71.0%) | the QA fixes' shift, reproduced |
| casual | ~55% / ~80% / ≥ 97% / ≥ 92% | four-act 70% · act 4 cleared 95.9% · doors 99.4% · Svammiel 98.6% (70/71) | 69 · 94.5 · 99.2 · 98.6 | floors PASS; campaign and act 4 MISS high (as the audit) |
| brutal | floors ≥ 70% doors, ≥ 55% Svammiel, ≥ 30% act 4 | doors 45/45 · Svammiel 7/9 · act 4 cleared 7/9; four-act 7% (three-act 9%, v2 13%, n 100) | 80/80 · 13/16 · 13/16 | PASS (n 9) |

**The two explained drifts.** Both come from the content cluster's QA fixes, which changed Svammiel's fight after the
audit (`docs/notes/balance.md` "QA fixes (Nov 17)"): FIGHTS-01 (a phase-2 wind-up now waits until every hero has had a
turn) and FIGHTS-02 (one fall per panel drop) make him easier; FIGHTS-08 (Master Dice back to 12 HP from BAL's 6) makes
CAUGHT rarer for AutoPlay, whose `objectValue` under-prices a two-hit object. Act 4 alone reproduces the QA fixer's paired
measurement (Svammiel 70.2% here, 71.0% there; audit 56.3%). In the campaign he reads 90.6% (n 53; within the audit's
noise, but the act-4-alone shift says it is real), and the four-act campaign stays at **24.0%**: the user's number holds.
Not a release blocker; the lever is BAL's open request (`encounters.boss_svammiel`, ×1.1 HP / ×1.3 damage today) plus
RULES / AUTOPLAY's `objectValue` request for CAUGHT. Pulling him back to 80-85% would put the campaign near ~21-22%.

### 7.3 Screenshots (plan §8.5 + each fight at rot 200 + secrecy; 48 PNGs, every one read)
All read cleanly at 1024×640, 1280×720, 1600×900 and 1920×1080: the gauntlet map (5 lanes × 12 columns, sealed doors
"✓ Beaten", the 😈 legend only on the gauntlet), the Twist panel (the exact line, the five-lane cast card with the goats
"(feat. ???)", the heal line, "Descend to Act IV"), the twist entrance on the DM's board, every door's swoop and
deployment (banner, roast, 😈 cheat chip and exact log line, the DM's whispered counter), the League's 72-letter banner,
Galbraith's and Svammiel's titles without "(the minions will flee)", the Radio Edit's BLEEP sticker and chip, Betty's
first verse, the goats' paired bubbles, the four goat galleries (farm-and-stagecraft looks), Zarak, Svammiel, Benedick's
gallery and combat (the "1+" shell badge), 17 party-select cards at 1024 and 1920, the campfire with Benedick, the final
victory ("5 / 5", the order chips) and the act-4 game over ("(he cheated)", "0 / 5"), and the six fights at rot 200.
Console: only the debug-mode banner. Seen, not blocking: the debug sandbox twist (`encounter=boss_dm&twist=1`, the DM
alive) still logs Svammiel's line before "The table shakes…" (the real twist, through `dm.js onDeath`, is in order);
the bear shot (`autoplay=1`, 20 s; also `bosshp=0.52`) ends at round 3 with the crew just above half, so the bear's
entrance rests on the sims (176/176) and the QA fights lens.

### 7.4 Secrecy, the twist, pronouns, counts
- Fresh profile, before the gate: the title (taglines and tips classic; Benedick at the campfire), the Hall (records
  without the V3 cards, codex 3 acts / 52 entries, "0 / 17" heroes), Settings (no cameo row), the act-1 and act-3 maps
  (classic legend; act 3 still "This is where it ends."), party select (17 cards, nothing about act 4) and README ("three
  acts … finally, the Dungeon Master"; "pick 4 of 17"; Benedick named openly). Benedick's file names neither act 4 nor
  Svammiel; the classic narration pools hold no act-4 line.
- The twist line: "You thought this was over? I, SVAMMIEL, CONTROL ALL." (`svammiel_lines.js` TWIST, the cameo banner
  and bubble, `gameover.js`), exactly the user's words; integration's twist suite green (acts 4 plays it, acts 3 never).
- The pronoun sweep (2,708 texts) green in both runs; a name-to-pronoun grep over the act-4, goats and Benedick files
  found no mismatch (the goats and the bear he, Benedick he, Skylla and the hags she, the Gardener it).
- Counts: "N / M" floor bosses from `map.lanes.length` / `gauntletLanes` (seen as 5 / 5 and 0 / 5), heroes from
  `UI.heroIds()` ("0 / 17", 17 cards); no literal 4, 5, 16 or 17 behind a count in `js/ui`, `js/run` or the content.

### 7.5 Left for the lead (none blocks the release)
- **BAL**: Svammiel's row (90.6% vs 80-85%); casual's act 4 (a casual-only row needs a `B.scale` slot); P6 settled as
  the user's ~25% (doors ~98%).
- **RULES / AUTOPLAY**: `objectValue` for two-hit objects (CAUGHT ~38% vs ≥ 60%); slime / parcel baiting; the sim still
  buys the Bribe with `cameo=0`.
- **QA-fix requests still open**: META-UI `hall.js records()` should read `stats.classicWins` (a v2 veteran with more
  than 20 runs sees a short "of which classic" count; the meta side is fixed); goats.js the bass wind-up `tint` (the hint
  says gold, the tiles read salmon); benedick.js `showTurns: true` on `ben_dragon` (the countdown); RULES `custom: true`
  on def-preview entries.
- **The user's call**: voice-8's two softened goat lines (Syllamin, Marbles); the README's "Version 2" box could become a
  v3 line (Benedick only, no act-4 spoiler).
- **Housekeeping**: `bash.exe.stackdump` at the repo root is a Git Bash crash dump — don't commit it.

---------------------------------------------------------------------------------------------------------------------

## 8. V3.1 polish (Nov 18) — the gate's leftovers (heal:polish)

Done first because several change what the sims measure (the healing pass's baseline). No hero's sustain or numbers,
nothing of Ellaria. Each fix has a regression assertion in its owner's tests.

| # | file(s) | what | regression |
|---|---|---|---|
| 1 | `js/ui/screens/hall.js` | `records()` reads the lifetime `stats.classicWins` (meta.js keeps it) instead of counting the 20-entry history; the unused `isClassicWin` went | `tests/ui_tests.js` Hall suite: `classicWins: 1` in the stats, a v2 veteran (25 classic, 1 in the history) reads 25, 0 reads plain "Campaigns won" |
| 2 | `js/data/bosses/goats.js` | the bass wind-up passes `tint` = the named colour's own tile top (`FLOOR_TINT`: gold `#d9b44a`, pink `#e83aa3`); the hint text is unchanged | `boss_goats` skills suite: hint "Bass → gold squares" with the gold tiles' colour |
| 3 | `js/data/heroes/benedick.js` | `showTurns: true` on `ben_dragon` (display only) | `hero_benedick` shell suite: the flag, the chip reads 2 then 1 |
| 4 | `js/engine/targeting.js` | def-preview entries carry `custom: true` (the HUD's shape check stays as the fallback) | `engine: phase 4 — previews…`: custom on a def's own entry, none on a dry run's |
| 5 | `js/data/bosses/svammiel.js` | the Radio Edit never bleeps a skill that heals: `healsWith(def, L, user)` (kind `'heal'`, tag `'heal'` / `'drain'`, any level field with "heal" in its name worth > 0 at the skill's level, or the def's own `heals` flag / function); the pick is otherwise unchanged | `boss_svammiel: the Radio Edit never bleeps a skill that heals…` (8 shapes on a fixture skill, a 0 at its level, Stress Ball / Juice Box / Prescribe Leeches / Savage Bite at III lose to a plain skill at I) |
| 6 | `js/engine/autoplay.js` | `objectValue`: see below | `autoplay: V3.1 — a hit on a two-hit hinted object…` (the numbers via the new `DD.AutoPlay.objectValue`, a chip beats a boss hit, a kill beats a chip) |
| 7 | `tests/sim/sim.js` | `wantsBribe`: never the Bribe with `cameo=0` (no door cheat to skip) | `tools: the campaign sim buys the Bribe…` (docs_tests.js) |
| 8 | `README.md` | the version box gains a "Version 3" line: Benedick the Inevitable, the snail knight, the 17th hero; nothing of act 4 | `docs: V3.1 — …` (the line, and no act-4 / Svammiel / twist word anywhere in the README) |
| 9 | `docs/DESIGN.md`, `docs/notes/boss-svammiel.md` | §5 "Balance rows" quotes the act-4 rows as landed (`act[4]` ×1.3 damage; each door's row; the goats ×0.8 HP, no damage row, 285 → 228 and the bear 110 → 88; Svammiel ×1.1 / ×1.3, ×1.69 in all, 360 → 396); §9 #10 / #11 the same HP and rows, 12-HP Master Dice, the Radio Edit skips heals; the svammiel notes give the hints (`masterHint` 45, `riggedHint` 10) | `docs: V3.1 — …` (every number read from `DD.Balance`, the defs and `DD.BossSvammiel.N`) |
| 10 | `js/data/bosses/svammiel.js` | the debug sandbox twist logs "The table shakes…" first: the twist trigger's `keyOf` calls `twistShake` as the entrance starts (a no-op in a run, where the DM's death already shook it) | `boss_svammiel: the twist…`: a sandbox twist with the DM alive, shake < his line < "Oh no", once |

**6, AutoPlay `objectValue`.** A hit that leaves a hinted object standing was worth `dmg × 0.5`, so a 12-HP Master Die
(hint 45) chipped for 8 scored 4 against 8 for hitting Svammiel, and AutoPlay rarely started a die it could not break in
one hit. Now a chip is progress toward the break: the hint × the share of the object's max HP the hit removes, never less
than `dmg × 0.5` (low hints price as before) and at most `dmg + CHIP_EDGE` (10) — a killing blow adds 15 + the foe's
threat to its damage, so AutoPlay never chases a chip over a kill. The break itself is unchanged (`dmg × 0.5` + the
hint), as are destroy objectives and gates. Smashes were never priced here (the hint offer pays them the whole hint).
Other hinted breakables move with it (the League's bodies, Galbraith's crystals, the speakers, Rigged Dice, blasts on
the DM's panels, the Lich's shelves), each still capped under a kill.

**The measure** (`tools/sim.sh "seeds=100&from=21000&start=4&level=5"`, one page each, the same seeds and parties; both
runs carry fixes 1-5 and 7-10, so the pair isolates #6; reports `.tmp/v31/caught_before.txt` / `caught_after.txt`):

| act 4 alone, normal | before | after |
|---|---|---|
| CAUGHT (% of Svammiel fights · % of his wins) | 32% · **41%** | 63% · **75%** (plan ≥ 60%: PASS) |
| Master Dice broken per Svammiel fight (of 3) | 1.43 | 2.22 |
| Svammiel won | 72% (49/68) | **81%** (55/68) |
| doors | 92% (394/426) | 93% (402/434): the League 88 → 92 (bodies broken 0.8 → 1.66, raised 0.83 → 0.26), Galbraith's crystals 1.36 → 1.83 a fight |
| act 4 cleared | 49% | 55% |
| errors / `DD.warn` / timeouts | 0 / 0 / 0 | 0 / 0 / 0 |

Acts 1-3 do not move: `acts=3`, seeds 13000-13099 (the gate's own `a3_*` seeds) 31% (31/100) against the gate's 30%,
every act-3 and earlier boss within a fight of it (the DM 31/41 vs 30/42; `.tmp/v31/a3_after.txt`). **For BAL / the
healing pass:** AutoPlay now catches him as the plan asks, and catching him makes him easier — act 4 alone Svammiel
+9 points (n 68). In the campaign he read 90.6% at the gate (plan 80-85%), so expect him higher there; the lever is his
row (`encounters.boss_svammiel`, ×1.1 HP / ×1.3 damage) or `N.masterHp` / `N.caught`, never a hero. The four-act
campaign was not re-measured here (the healing pass's baseline run does it).

**Look (#2).** `tools/shot.sh "debug=1&screen=combat&encounter=boss_goats&acts=4&seed=3&autoplay=1&fast=1"` at 27 s
(`.tmp/v31/bass3.png`, 1920×1080): "Turnip the Bass 13" pending, the marked squares read gold under the danger tape and
red outline, the pink ones stay pink.

**Tests.** Iterated with `isolate`; final full `bash tools/test.sh` (Nov 18, `.tmp/v31/test_full.txt`): **PASS — 1298
suites, 149,790 assertions, 0 failures**, missing scripts 0; the console's "Error in" lines are the gate's own 28
intentional ones, line for line (`boom`, `intentional test error`, `exploded`, …), none from these files.

### Left open
- The rest of the lead's DESIGN §5 / §9 numbers request (§6 "Lead (docs)": the Gardener, the League, Galbraith, the Coven,
  WHAT?! 8, Bar None, Svammiel's hits; the act-4 band table in §5 still lists the plan's 255 / 480): not in this pass.
- The healing pass designs the 16 lifts next; the Radio Edit already skips any heal it adds (a `heal` / `drain` tag, a
  level field with "heal" in its name, or `heals: true` on a heal its fields don't name).

---------------------------------------------------------------------------------------------------------------------

## Deviations
- **`miniboss` as a sim fight kind.** The engine plays a door as kind `boss`; the sim books it as `miniboss` (the run's node
  type) so the act-3 boss / Svammiel rows, the "boss fights" line and the healer split stay act bosses only, and a door
  has its own kind row, Hype and damage tables. The DD_SIM tools suite is unchanged.
- **`order=lowhp`** follows the systems design's definition (the lane with the best record so far on the page, a 1-in-2
  prior for an unseen lane), not a reading of its name.
- **Act clears count from the start act**: a `start=4` run books act 4 entered / cleared only (startAtAct sets
  `actsCleared` 3; counting acts 1-3 as cleared would inflate them).
- **The shapeshift rule** keeps every skill tagged `'shapeshift'` (Ellaria's Wild Shape and Basanos's Blood Moon too, lead
  patch P7: a change of AutoPlay's picks, not of a kit); a reward skill whose only replaceable sockets are transforms is
  skipped, not forced in.
- **Three fixes in other owners' test files** (§2.3), each the smallest change that unblocked the flip's full run.
- **The pronoun sweep** checks one-character sentences, an owner's (and a carried subject's) pronouns for unnamed
  sentences, and drops speaker tags; Ringlerun (no pronoun from the user) only counts as a name. Event outcome texts are
  left to NARRATIVE's events_act4 suite (they name heroes without pronouns).

## Requests
- **BAL**: §4 and §6 "Balance". First lever suggested by the numbers: `DD.Balance.act[4]` (HP / damage rows for the doors
  and the finale, ×1 today), then the per-door knobs; re-measure with `start=4&level=5` (fast) and confirm with full
  campaigns. Benedick's share and the Radio Edit's cost need the doors brought down first.
- **Lead (ARCHITECTURE §10's sims line, `tools/sim.sh` doc)**: the new sim params `start= level= gold= order= cameo=0
  acts=` and the report sections (§2.1).
- **C5, C2, RULES, Lead**: §6.
- **The DM's test owner (`tests/content/boss_dm.js`) and NARRATIVE (`tests/content/narrative.js`)**: the two asserts the
  integrator widened for the flip (§2.3) — keep or reword.
