# C1 — THE GARDENER (V3, act IV door 1)

READY: `js/data/bosses/gardener.js` + `tests/content/boss_gardener.js` (19 suites "boss_gardener: …").

Plan `.tmp/v3/design.md` §3.1 (fight), §3.0 (shared rules), §5.3 (voice), §6.2 (art), §8.4 (tests); voice V §8.1,
fights F §2; lead patches P2-P5, P10-P13 (`docs/notes/v3-contract.md`). Owner files: `js/data/bosses/gardener.js`,
`tests/content/boss_gardener.js`, this note.

## As built
- **The Gardener** `gard_gardener` (it; `tier: 'boss'`, `boss: { title: 'Head Groundskeeper', mini: true, sting:
  'clockwork' }`, `pronoun: 'it'`, `shortName` 'The Gardener'): **320 HP**, armor 2, move 4 (Overgrowth +1), init +1,
  large, hop, immune to sleep; poison ×0, fire ×1.25, lightning ×1.25. Slots (the at-once kit, threat shading and
  AutoPlay read them): Pruning Shears (first: its attack of opportunity), Hedge Trimmer, Seed Spitter, Planting Season.
  The wind-ups (Mow the Lawn, Harvest Festival, Weed and Feed) are `windupOnly` skills its planner winds up.
- **Photosynthesis** (def hook `onTurnStart`, before the due wind-up lands): heals 4 per plant on the field (living
  Strangler Vines + Pump-kaboom objects), at most 16; Overgrowth 5 / 20. Logged "Photosynthesis: the Gardener heals N
  (k plants on the field). Weed the garden!". The live passive line counts them ("now: 3 plants, +12") and names the
  next docket step and the next wind-up.
- **Its turn** (`gardTurn`, one entry): one action from the docket `Planting Season → Prune → Seed Spitter → Prune`
  (Prune = Hedge Trimmer when 2+ foes stand in a sweep from a reachable spot, else Pruning Shears; Planting Season at the
  gourd cap / on cooldown / with no free tile → Seed Spitter; **engaged** (a foe next to it) it spits only from where it
  stands, and with nobody 2-5 away from there it prunes; nothing reachable → `api.approach`), then one wind-up in
  rotation `Mow → Harvest` (Overgrowth: `Mow → Weed and Feed → Harvest`; a step that can't be made is skipped; one wind-up
  at a time). Walks are reach-aware (AoO-priced, never lethal) and never end on its own pending Harvest tiles. Taunt:
  actions only aim at the taunter; the lane score gives the taunter +10.
- **Mow the Lawn** (`gard_mow`, anchor `'self'`: push it and the lane moves with it): the four grid lanes from its
  tile (3 wide, up to 7 long; cut at the edge, walls, pits, deep water, a step it can't climb, or an indestructible
  blocker such as the topiary); score 2 per grounded hero + 1 per grounded hero summon in the WHOLE lane (it ignores
  gnomes), ties in grid order −y, +x, +y, −x; best score 0 → no mow. The marked lane ends at a gnome in the middle column,
  whose tile is marked (the jam); the label reads "Mow the Lawn: a gnome is in the way!" (`intent.data.hint` too, for
  E7) and the log says so. Landing: every grounded unit in the marked lane (its own vines included) takes the hit, the
  survivors are pushed sideways out of the lane (side columns 1 tile outward, the middle column 2 tiles to the side with
  room; bump 3 when blocked; immovable units stay); then it drives row by row (a charge: `moveAlong`, no provoking): each
  row's breakable objects are destroyed first (credited to it: its own drum next to it Corrodes it, gourds burst), it stops
  before a unit nobody could clear or an unbreakable blocker; the rest of the marked lane is mowed from there. A gnome
  ahead jams it: 20 damage (cause `bump`, through its armor) and Stunned (applied during its turn-start wind-up resolve:
  that very turn is lost), the gnome shatters. Flyers float over it (not hit, not pushed).
- **Harvest Festival** (`gard_harvest`, anchor `'ground'`): needs 2+ gourds; the marked tiles are every gourd's blast
  plus the blast of any volatile object a blast reaches (a chained drum). The shown number is the gourd's burst (10,
  explicit `dmg`); every gourd is destroyed (each explodes for 10 around it, credited to the Gardener).
- **Weed and Feed** (`gard_weedfeed`, Overgrowth): radius 1 around up to 2 heroes (the most crowded first, centres more
  than 2 apart); 16 poison damage and Poisoned 3 to each foe there (the Gardener: poison ×0).
- **Overgrowth Mode** at half HP (160 of 320, a share of max HP; flipped in `onTakeDamage` and at turn / round start,
  the damage carries over): banner "[OVERGROWTH MODE]", log, narration `gard_overgrowth`, bark, `DD.Cameo.say('svammiel',
  'svam_phase', { enemy })`; Seed Spitter II and Planting Season II (slot levels), move +1, the docket restarts, the
  rotation keeps its place (by name).
- **Safe Mode** (the DM's stun guard): after a stun-like lands, stuns from others are refused ("🔧 Safe Mode: shrugs it
  off") until the end of a turn it really played; its own jam stun is not refused (and arms the guard).
- **Strangler Vine** `gard_vine` (minion, 20 HP, move 0, armor 0, init 0, immovable, tag `plant`, fire ×1.5,
  `actsWithOwner: true`): Grabby Tendril (7 + Root through its next turn; its attack of opportunity, so a walker that
  provokes it is Rooted on the spot). With no foe next to it, it uses **Rustle Menacingly** (does nothing, cooldown 2) —
  see Deviations. Sprouts: Seed Spitter (next to the target: the free tile next to the most heroes, then nearest the
  Gardener), Svammiel's Green Thumb (C5, on the `cameo` marks).
- **Objects**: Pump-kaboom `gard_gourd` (4 HP, volatile, `react.fire.destroy`, tag `plant`, an AutoPlay hint: 2 turns of
  the heal it feeds), Weed-B-Gone Drum `gard_drum` (3 HP, volatile, fire sets it off: 12 around it, every plant within 2
  destroyed (vines killed, gourds burst), the Gardener within 1 Corroded for 2 of its turns), Garden Gnome `gard_gnome`
  (indestructible, blocks movement not sight, `codex: true`). Object descs end with the plan's codex jokes (the Hall's
  codex shows the object desc).
- **Corroded** `gard_corroded` (debuff, 2 turns): `takenMult` 1.25 + `modifyIncomingDamage` `ignoreArmor`, mirrored by
  `estimateTaken` (+armor flat: `DD.AI.estimate` subtracts armor after the flats).
- **Encounter** `boss_gardener` "The Overgrown Conservatory" (theme `a4_conservatory`, the plan's 14 × 12 layout: gravel
  mow lanes on rows 4 / 7 and columns 6-7, raised planters h1 in the corners, topiary `tree` objects labelled "Topiary",
  bushes, three gnomes (2,3) (11,3) (6,8), two drums (1,5) (12,5), the pond (water) x 5-8 y 5-6, compost (mud), the
  Gardener on `boss_spawn` (7,1), deploy rows 10-11, `cameo` tags at (5,9) and (8,9)); `act 4, kind 'boss', weight 0`,
  `gauntlet { lane: 'gardener', order: 1, hint: 'Hates fire. Loves gnomes.' }`, `shortName` 'The Gardener', icon 🕷️,
  `banner: false`, `cameo { start: 'svam_cameo_gardener', cheat: 'svam_green_thumb', interjections: true }`, objective
  boss with a live flavor (plants, their heal, gnomes left), `reward { goldMult: 0.9, itemRarity: 'rare' }` (P5).
- **Voice** (V §8.1 verbatim, + `mow` barks): barks, named lines (party-filtered: Pebbles, Betty, Hjalmar, Ellaria,
  Professor Marbles, Marwyn, Valdris, Zarathor and **Benedick "PEST DETECTED: Benedick. INITIATING SALT PROTOCOL."**, in
  `barks.named` and `DD.Gardener.NAMED`; Benedick in the fight gets it at combat start), narration `gardener_tip` (the
  DM's two whispers, one at round 1), `gard_overgrowth`, `gardener_death` (onDeath). Pronoun "it" everywhere.
- **Art**: `drawGardener` (custom, scale 2.2, radial billboard: a brass watering-can body, a glass cloche with a glowing
  bonsai, a straw sun hat with a red ribbon, eight jointed legs in a fan tipped with garden tools, eight lens eyes,
  `g.text('GRDN-8')`, a pollen chimney; Overgrowth: ivy, flowers, amber eyes; attack: the front legs rear up with the
  shears), `drawVine` (scale 1.2, a coiled stem, a toothy flower mouth, `leaves` aura), `drawGourd` / `drawDrum`
  (`g.cylinder`, painted label) / `drawGnome` — all round or radial (rotation-safe). Shots: `.tmp/gard/*.png`.

## API (`DD.Gardener`, tests / sims only; no game logic depends on it)
`N` (knobs), `SK`, `ST`, `DOCKET`, `WIND`, `LAYOUT`, `HEIGHTS`, `NAMED`, ids (`ID`, `VINE`, `ENC`, `GOURD`, `DRUM`,
`GNOME`), `findGard(state)`, `boss(u)`, `vinesOf`, `gourdTiles`, `plantCount`, `photoNow(u)`, `gnomesLeft`,
`laneOf(u, dir, from?)`, `laneScore`, `pickLane(u)`, `windMow(u, lane)`, `windNext(u)`, `harvestPlan`, `weedPlan(u)`,
`plantSpots(u, n)`, `sweepTiles(u, f)`, `threshold(u)`, `enterOvergrowth(u)`, `syncPhase`, `passiveText(u)`,
`updateFlavor(u)`, `namedLine(about)`, the painters, and **`stats(state)`** → the fight's engagement counters
(`turns, healed, photo, planted, sprouted, spits, shears, trims, mows, mowHits, mowed, jams, harvests, harvestBursts,
weedfeeds, weedHits, drums, corroded, stuns, refused, lost, vinesKilled, gourdsPopped, overgrowth`) + `phase` (for the
integrator's gauntlet table: jams, drums, vines weeded, gourds popped).

## Numbers (author sims: random real parties of 4, level 5, no items / Blessings / consumables, full HP, normal)
`tools/test.sh "suite=boss_gardener: AutoPlay&isolate=gardener,heroes&real=1&verbose=1&n=40&seed=<s>"` (probe params
`hpx=`, `knobs=key:value,…` (N), `lv=skill.key:value,…`, `cameo=1`, `fights=1`):

| build | fights | win rate | rounds | downs / fight |
|---|---|---|---|---|
| the plan's numbers (HP 300; Shears 12, Trimmer 9, Spitter 7, Mow 22, Tendril 6, Weed and Feed 14) | 100 (seeds 1, 11, 12) | **85-90%** | 16.4-17.1 | 2.6-3.4 |
| + the gourd hint and "engaged: spit from here or prune" | 80 (11, 12) | 87.5% | 16.6-17.1 | 3.1 |
| hits at the top of the plan's bands (14 / 11 / 8 / 26 / 7 / 16), HP 300 | 160 (11-14) | 75.6% | 16.7-18.4 | 3.7-5.0 |
| **shipped: the same hits, HP 320** | 160 (13-16) | **70.6%** (74 / 68%) | 17.2-18.8 | 4.0-4.6 |

Band (plan §7.1, five doors): author 63-74% at L5 → shipped ~71%. 0 timeouts in the last 160 fights (1 in 80 with the
plan's photosynthesis and HP 300). Per fight (shipped): heroes take ~150 (Shears 52-65, Trimmer 25-34, Mow 22-28,
Spitter 20-24, Tendril 11-15, Harvest 6-8, Weed and Feed 6-7); it heals 50-65 (Photosynthesis on ~8 turns); engagement
per fight: vines weeded ~4.5 of ~5 sprouted, gourds popped ~1.8 of ~7 planted, mows ~7 (~2.5 heroes hit: AutoPlay reads
the red), harvests ~2, jams ~0.4 (AutoPlay never baits: accidents only), drums ~0.8, Corroded ~0.2, Overgrowth in ~95%.
Fixture party (test_ heroes, L5): smoke only. Author fights run long (~17-18 rounds, ~4 downs): armor 2 eats a lot of
AutoPlay's small hits (~21 a round from the heroes) — the campaign (items, levels 5-6) is BAL's measure (plan: 7-9
rounds, ≤ 1.0 downs, 91-95% per door).

## Deviations
- **Numbers raised inside the plan's bands** (author band, plan §7.1): HP 300 → **320** (solo band 300-340; Overgrowth
  stays at half: 160), Pruning Shears 12 → **14**, Hedge Trimmer 9 → **11**, Seed Spitter 7 → **8**, Mow the Lawn 22 →
  **26** (big wind-up band 20-26), Grabby Tendril 6 → **7** (minion hit band 6-7), Weed and Feed 14 → **16**. The plan's
  numbers won 85-90% in 180 author fights (band 63-74%); shipped ~71% (160 fights). The jam (20), the gourd (10), the
  drum (12), Photosynthesis (4 / 16, 5 / 20), the caps (4 / 6) and vine HP (20) are the plan's. All knobs in
  `DD.Gardener.N`; every desc and test reads them.
- **Mow the Lawn desc**: "…pushed sideways out of the lane" instead of the plan's "pushed 1 tile out of the lane": a
  middle-column unit needs 2 tiles to leave a 3-wide lane (F §2.5's 1 tile left it in the lane). Side columns go 1.
- **The mow's lane is anchored on the Gardener** (`'self'`): a pushed Gardener mows from where it stands (the marked
  tiles follow it, the HUD stays honest). Its marked lane ends at a gnome in the middle column (the gnome's tile is
  marked); units past the gnome are safe (the plan: "a gnome … stops it there"), while the lane CHOICE still counts heroes
  past the gnome ("it ignores gnomes": that is the bait).
- **Rustle Menacingly** (`gard_rustle`, a do-nothing utility, cooldown 2) is a second vine skill the plan doesn't have.
  Reason: `content: every enemy takes its turns for 3 rounds` requires every enemy with skills to use one within 3
  rounds in a bare sandbox, and an immobile vine with only a melee skill never can. It changes nothing in play.
- **Harvest Festival's marked tiles include a chained drum's blast** (a gourd blast reaching a drum sets it off): the
  plan marks "every gourd's blast"; the extra tiles keep the red honest.
- **Pump-kaboom AutoPlay hint** (`autoplay`: 2 × the per-plant heal on 'break'): the plan says AutoPlay's dry-run
  valuation handles gourds; without a hint it never popped them next to allies-free spots (0.7 a fight) and the
  Gardener out-healed the party. With it ~1.8 a fight. The gnome has no hint (plan).
- **Object descs end with the codex jokes** (plan §5.3's plant codex lines; the Hall's act-4 codex shows the object desc),
  and the volatile ones say "(aim any single-target damage skill at it)" after "set alight or shot" like the core
  barrel (lead patch P2; the kit suite's D1 rule requires the words on every aimable object).
- The Gardener says Benedick's PEST line at combat start when he is in the party (100%); other named lines 30% at
  start, 25% when it attacks that hero.

## Requests
- **Lead (`docs/DESIGN.md` §9 entry 6)**: the shipped numbers are HP 320, Mow the Lawn 26, Overgrowth at half HP (160),
  hits 14 / 11 / 8 (Shears / Trimmer / Spitter), Grabby Tendril 7, Weed and Feed 16; DESIGN still says 300 HP, 22 and
  150 HP. (Not mine to edit; no docs test reads them today.)
- **HUD (E7)**: the mow's wind-up carries `intent.data.hint` ('a gnome is in the way!'); today the label carries it too.
- **Integrator (`tests/sim/sim.js` gauntlet table)**: `DD.Gardener.stats(state)` has the door's engagement (jams, drums,
  vinesKilled, gourdsPopped, mows, mowHits, harvests, overgrowth). Plan §7.2's "gnome jams > 0 over a batch" holds in the
  author sims (~0.4 a fight, accidents: AutoPlay never baits).
- **BAL**: campaign numbers for the door; author fights are long (~17-18 rounds). Levers in order: `N.hp` (320),
  `N.photo` / `N.photoMax`, the hits (`N.shears` …), `N.gourdHint` (AutoPlay's weeding).
- **RULES (optional)**: none needed. E1 (actsWithOwner), the jam's turn-start stun and the cameo's Green Thumb work as
  shipped.

## Tests (`tests/content/boss_gardener.js`, 19 suites)
Registry (exact descs from the knobs, bands, the encounter fields); the conservatory (layout, props, marks, deploy,
intros); skills (Shears, Trimmer sweep, Spitter sprouts + caps I / II, Planting Season caps I / II, Tendril Root, P3
scaled texts: damage keys scale, the jam and the burst don't); Photosynthesis (count, caps, Overgrowth, the live line,
the flavor); Mow the Lawn lane (3 × 7, edges, grid-order ties, flyers don't count, topiary cuts, gnome ends the marks
but not the count, the label); the landing (both columns hit and pushed out, its own vine mulched, a crate mowed, the
charge to the end, flyers spared, an immovable hero stops it, its own drum Corrodes it); the jam (20 through armor,
Stunned, the turn lost, no action or wind-up, the gnome gone, Safe Mode up); Harvest (2+ gourds, the chained drum's marks,
the shown 10 = the blast, every gourd bursts, nobody off the red); Weed and Feed (centres, the marked number, poison,
the Gardener immune); drums and Corroded (12, plants within 2, Corroded 2 turns, estimate = hit with armor 0 and ×1.25,
back after 2 turns, fire sets drums and gourds off); its turn (docket, Planting Season at the cap → Seed Spitter, the
rotation, one wind-up at a time); Overgrowth (half HP, damage carries over, II skills, move +1, docket restart, rotation
by name, log, flavor); Safe Mode; the vines (E1 group, no entry, Root, immovable, the Rooting attack of opportunity,
the orphan's own entry, Rustle); Green Thumb (with svammiel.js: two vines on the marks, owned, exact desc, they feed
Photosynthesis); voice (lengths, "it", generic lines name no hero, named lines incl. Benedick's verbatim, the party
filter, the DM's tip once); sprites (both modes × 4 poses × 3 times × 5 yaws, the props, bounds, portrait); robustness
(alone it acts, previews leave no trace, a whole real fight under the area watch); AutoPlay battles (fixture smoke;
`real=1` asserts 45-90% and engagement).
- Isolated: `tools/test.sh "suite=boss_gardener&isolate=gardener,svammiel"` → 19 suites, 411 assertions, 0 failures.

## Review (V3) — adversarial review, Nov 15 (owner of this file since the review)
Verified by running code: the 19 owner suites, new review suites, real-party AutoPlay batches with Benedick in the pool
(17 heroes), the real door with Svammiel's start cameo on (Green Thumb), brutal and casual, and screenshots
(`.tmp/review3/gard.png`, `gard_p2.png`: Benedick in the party, the Overgrowth look at rot 200 — they read as intended).
Determinism: the same seed gives the same fights (a review batch run twice is identical; replaying fight #16 alone with
`only=16` reproduces it, so game logic never draws from the cosmetic `DD.rng`). Pronoun "it" everywhere; no Math.random.
Ship dark: act-4 only (weight 0, gauntlet lane), nothing reachable at acts = 3; Benedick's PEST line is a named line
(party-filtered by hero id, and the engine's bark filter skips a line naming an absent hero).

**Fixed (with regression tests in `boss_gardener: review (V3) — …`):**
- The objective's live subtitle said "Weed it: 1 plant heal it 4 a turn." → "1 plant heals it 4 a turn" (two: "heal");
  with every gnome gone it said "the drums Corrode it" even with no drum left: now "set off a Weed-B-Gone drum next to
  it (Corroded)" while one stands, else "No gnomes and no drums left: burn the garden."
- `stats.vinesKilled` (the sims' "vines weeded" engagement column, and the AutoPlay suite's puzzle check) counted vines
  the Gardener mulched itself (its own mow, its Harvest blasts): it now counts only kills credited to the heroes' side
  (a drum a hero set off is the hero's).
- Plan §3.0.4 ("a Rooted hero can't be swapped out … the counter text says so"): the Strangler Vine's line now ends
  "A Rooted hero can't move or be swapped: pull or teleport that hero out." (tested: the swap with a Rooted ally is
  refused by the engine).

**Checked, no change needed (tests added where the owner had none):**
- Benedick's Snail Slime never stops the Gardener (boss tier): no snag for it, its walk plan and a real walk run straight
  across (the vines are immovable anyway). The vines and Pump-kabooms keep tag `plant` (Benedick's teeth: "Salad!").
- A mow that moved with it after the wind-up (pushed to the board's edge, into a pillar) and a Dazzled or Confused mow
  land only on the marks they showed; the charge stops before the pillar; no swallowed errors.
- Whole real fights (deployment, initiative, the start cameo and its cheat, real heroes, Benedick in the first party)
  under the content suite's area watch: every enemy hit inside its marked tiles / area, every fight ends (normal,
  brutal, casual).
- desc == execute at both levels and in Overgrowth (Spitter I/II, Planting Season I/II, the mow's numbers, the jam and
  the burst unscaled because they are environmental damage, every `dmg` key scaled by P3); the stun guard; E1 vines.

**Numbers (author sims, random real parties of 4 from all 17 heroes, L5, no items, normal; plan §7.1 band 63-74%):**
seeds 777 × 40: 70% · 13 × 50: 74% · 14 × 50: 72% · 15 × 50: 74% → **72.6% (138 / 190)**, 17.5-20.6 rounds,
3.8-5.5 downs a fight, **2 timeouts in 190 (~1%)**. Green Thumb (cameo on) on seed 13: 72% vs 74% (−2, within §7.1's
≤ 3 points). Engagement a fight: ~6 vines weeded, ~1.6 gourds popped, ~9 mows (~3.4 heroes hit), ~0.4 jams, ~0.8 drums.

**Remaining (not fixed here):**
- **Long fights (BAL)**: the author fights run 18-21 rounds with 4-6 downs, against ~12-13 rounds / ~3 downs for
  Galbraith and the Coven; armor 2 against many small hits plus Photosynthesis (~55-65 a fight) make it a slog for
  low-damage parties. The two timeouts: seed 14 #22 (Josiah, Slate, Marwyn, Ellaria) hit the 40-round cap with the
  Gardener at 30 HP and closing; seed 777 #16 (Basanos, Corelos, Hjalmar, Marwyn) was a lost fight that never ended —
  three heroes down and a 1-HP Hjalmar kiting it for 13 rounds, Rooting and Slipping it with his traps. The suite's
  `real=1` "no timeouts" check therefore fails about one batch in three at n ≥ 40; the plan's limit is ≤ 1% of
  act-4 fights. Campaign parties (items, levels 5-6) should be quicker; BAL measures and owns the lever (`N.armor`,
  `N.hp`, `N.photo`). Replay a fight with `only=<i>&trace=1&tracelog=<round>` (new probe params).
- AutoPlay never baits the mow over a gnome (jams are accidents, ~0.4 a fight).

**Test tooling added (AutoPlay suite):** `party=a,b,c,d` (pin the party; the draw still happens), `only=<i>` (one fight
of a batch), `trace=1` (its HP, plants and the heroes each round), `tracelog=<round>` (the combat log from that round).

## QA fixes (Nov 17, QA FIXER content cluster; the full list: docs/notes/boss-svammiel.md "QA fixes (Nov 17)")
- **voice-3**: the spawn bark "[SCANNING] Weeds detected. Scheduling removal." (no party size: permanent deaths reach act 4).
  Suite "boss_gardener: QA voice-3" lints every act-4 bark and narration pool for a written hero count.
