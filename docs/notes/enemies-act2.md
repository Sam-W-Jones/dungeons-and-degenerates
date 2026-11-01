# ENEMIES-ACT2 — notes

Files: `js/data/enemies/act2.js` (content), `tests/content/enemies_act2.js` (24 suites `enemies_act2: …`, 22 run by
default, 2 opt-in tools). Review core fix: `js/engine/autoplay.js` `walkApproach` (see Core fixes).
Isolated run: `bash tools/test.sh "suite=enemies_act2&isolate=enemies/act2,enemies_act2"` (add `&verbose=1&sims=3` for
the balance tables). Scratch (sprite sheet page, shots, logs): `.tmp/enemies-act2/`, review probes and shots:
`.tmp/enemies-act2-review/`.

Balance / debug tools (skipped unless their params are passed):
- `suite=enemies_act2: autoplay sims with real heroes&heroes=real&sims=3&verbose=1` (full load, no isolate): random
  parties of 4 real heroes vs every encounter, L4-7. Add `&battle=<encounter id>` to run one encounter and print the
  final board of every lost fight.
- `suite=enemies_act2: debug battle log&battle=<encounter id>&lv=<level>&s=<seed>[&heroes=real]&verbose=1`: one
  AutoPlay battle, its log one line per round, and the final board as text.

## Summary

Act 2 (*The Hauntwood & the Necromancy Academy (Accredited)*) regular enemies, elites and encounters: the DESIGN §8 act 2
roster plus two helpers (the cultists' Hollandaise Horror and Gary's Tesla Coils). Every id carries the `a2_` prefix.
13 enemies, 28 skills, 2 statuses, 4 objects, 12 encounters.

### Enemies (13) and their skills (28)

| id | name | tier | HP / mov / armor | skills (anchor) | gimmick |
|---|---|---|---|---|---|
| `a2_skeleton_intern` | Skeleton Intern | minion | 13 / 4 / 0 | `a2_intern_papercut` Paper Cut 5 + Bleed 2, adjacent, hits objects (self) · `a2_intern_coffee` Coffee Run 4, lobbed range 1-5, cd 1 (unit) | **Reassembles**: dies into an `a2_bone_pile` that stands back up at half HP at the end of the next round (the same round while a Necromancer TA stands). Fire or holy kills, falls, a hero walking over the pile or a Smash end it for good. Poison immune. |
| `a2_zombie_unpaid` | Zombie (Unpaid) | normal | 28 / 3 / 0 | `a2_zombie_overtime` Unpaid Overtime 7, hits objects (self) · `a2_zombie_grab` Grabby Hands 4 + pull 3 + Root 1, straight line 1-4, LOS, cd 2 (unit) | yanks a hero into biting range and roots it; fire ×1.5, poison immune |
| `a2_brunch_cultist` | Cultist of the Forbidden Brunch | normal | 26 / 3 / 0 | `a2_cultist_mimosa` Bottomless Mimosa heal 8, range 0-4, cd 1 (unit) · `a2_cultist_latte` Scalding Latte 7 fire + Burn 2, range 1-4 (unit) · `a2_cultist_summon` Brunch Is Served: a Hollandaise Horror on a tile 1-2 away, cd 3, 2 charges (ground) | support AI: heals the most hurt ally, serves sauce, throws lattes |
| `a2_hollandaise` | Hollandaise Horror | minion | 12 / 4 / 0 | `a2_hollandaise_slap` Sauce Slap 5 (self) | dies into an oil slick (radius 1): bring fire; fire ×1.5 |
| `a2_wisp` | Will-o'-the-Wisp | normal | 24 / 4 / 0, flying | `a2_wisp_zap` Swamp Gas Zap 6 lightning, range 1-6, LOS, then jumps to the nearest other unit within 2, twice, friend or foe (unit, custom area) · `a2_wisp_lure` Lure: swap places with a foe 1-4 (no LOS), cd 3, fails on immovable units (unit) | blinks (teleports) instead of walking; only Lures when it hovers over a pit, deep water or lava; immune to lightning and poison, frost ×1.5 |
| `a2_owlbear_cub` | Owlbear Cub | normal | 26 / 4 / 0 | `a2_cub_charge` Cub Charge: up to 4 tiles straight, stops at the first foe, 8 + push 1, cd 2 (self, custom line) · `a2_cub_nibble` Overexcited Nibble 6 (self) | the charge stops at walls, pits, friends and objects: stand off its lines |
| `a2_banshee` | Banshee (Wants to Speak to the Manager) | normal | 26 / 4 / 0, flying | `a2_banshee_scream` Speak to the Manager ⏳1: 3-tile cone, 6 + Stun 1, cd 3, spell (self) · `a2_banshee_review` One-Star Review 7 + Weak 1, range 1-5, LOS (unit) | the cone always winds up a round (she stays put, still reviews); Silence or Stun cancel it, a push moves it (self anchor); holy ×1.5 |
| `a2_gargoyle` | Gargoyle | normal | 28 / 3 / 1 | `a2_gargoyle_dive` Gutter Dive: lands on a free tile next to a foe 1-5 away (no LOS; no free tile = no dive, and the planner skips it), 8 to it and every foe next to it (unit, circle 1) · `a2_gargoyle_stone` Stone Form: `a2_stoneform` until the end of its next turn (self) | dive, then a statue for a round (75% less damage, plans nothing, stone sprite with a pigeon); poison immune |
| `a2_pixie_swarm` | Pixie Swarm | normal | 24 / 4 / 0, flying | `a2_pixie_glitter` Glitter Bomb 5 + Dazzle 1 to the target and every foe next to it, lobbed range 1-5, cd 1, spell (unit, circle 1) · `a2_pixie_bite` Tiny Bites 5 (self) | **Swarm**: single-target skills deal half damage to it, area skills full; ranged AI, keepDistance 2 |
| `a2_mama_owlbear` | Mama Owlbear | elite | 110 / 4 / 1, large, immovable | `a2_mama_maul` Maul 12 on the 3 tiles in front (self, row) · `a2_mama_pounce` Mama's Coming: leap onto a free tile next to a foe 1-5 away (no LOS; no free tile = no pounce, and the planner skips it), 11 + knockback 2, cd 1 (unit) · `a2_mama_stomp` Earth-Shaking Stomp ⏳1: 13 to every foe within 2, cd 3 (self) | **Vendetta**: kill one of her cubs and she gains `a2_vendetta` (+50% damage to that hero, 2 turns, shown on her telegraphs) and prefers that target; attacks first, then winds up the Stomp when heroes crowd her. Drawn rearing up (humanoid bear body, owl face, pink bow); the cubs stay on all fours |
| `a2_necro_ta` | Necromancer TA | elite | 100 / 3 / 0 | `a2_ta_redpen` Red Pen of Doom 11 + Vulnerable 2, range 1-6, LOS, spell (unit) · `a2_ta_raise` Raise Dead: 2 Skeleton Interns on the marked tiles + every Bone Pile stands up, cd 3, 2 charges (ground, custom) · `a2_ta_detention` Detention: Bone Walls on the empty tiles around a foe 1-5 away, cd 3, spell (ground, custom ring) | while he stands, Bone Piles reassemble at the end of the same round; summoner AI, keepDistance 2 |
| `a2_gary` | Flesh Golem Gary | elite | 110 / 3 / 1, large, immovable | `a2_gary_clobber` Clobber 13 + knockback 2 (self) · `a2_gary_throw` Gary Throw: hurls an adjacent ally (or a spare limb) at a foe 2-6 away (no LOS), 11 to it and every foe next to it; the ally lands beside it (unit, circle 1) | lightning heals him (absorbed: coils, chain zaps, shocked water); **GARY ANGRY** at ≤ 50% HP: permanent Inspired and a second, different attack every round; fire ×1.5, poison immune |
| `a2_tesla_coil` | Tesla Coil | minion | 12 / 0 / 0, immovable | `a2_coil_arc` Arc Discharge 5 lightning into the nearest unit 1-4 away, friend or foe (unit) · `a2_coil_overcharge` Overcharge: Empowered (+50% on the next arc) when nobody is in reach (self) | Gary first on ties (heals him; telegraphed as "Recharge Gary", no damage number), taunt-aware, skips lightning-immune units (other coils, wisps); immune to lightning and poison |

HP sits inside the DESIGN §5 act 2 bands (minions 12-13, normals 24-28, elites 100-110). Hits: minions 4-5, normals
6-8 (the utility hits are lower: Grabby Hands 4 with pull + Root, the pixies' 5 with an area and Dazzle), elites 11-13.
Normals and minions use explicit AI styles or small planners (`wispPlan`, `bansheePlan`, `gargoylePlan`,
`coilPlan`); the elites have custom planners (`mamaPlan`, `taPlan`, `garyPlan`): one move per plan, approach by path
distance (BFS field, so walls don't strand them), up to two intents a round. The two big area hits (Banshee cone, Stomp)
are always planned with `delay: 1` and their desc says so. Tracking (unit-anchored) attacks score targets by how
deep inside their range they stand (`slack`, up to +4.5), so one step back does not escape them.

### Statuses (2)

- `a2_stoneform` (buff, refresh, 1 turn, `decay: 'turnEnd'`, `skipFresh`): takes 75% less damage
  (`modifyIncomingDamage`, mult ×0.25). A gargoyle with it plans nothing; its sprite turns to stone (with a pigeon).
- `a2_vendetta` (buff, refresh, 2 turns): +50% outgoing damage against `st.source` (the hero who killed a cub).

### Objects (4)

- `a2_bone_pile` (3 HP, smashable, walkable, low): a fallen Skeleton Intern. `data: { timer, times }`. At round end
  the timer drops by 1 (by 2 while a Necromancer TA stands); at 0 it stands back up as a half-HP intern (`Can't get up!`
  if the tile is occupied, retries next round). A hero entering the tile crushes it; AutoPlay hint 9 for heroes.
- `a2_bone_wall` (5 HP, smashable, blocks movement and LOS): Detention. Crumbles at the end of the next round
  (`data.turns`, default 2). AutoPlay hint 8 when a hero is boxed in.
- `a2_chafing_dish` "Unholy Brunch Platter" (10 HP, smashable, blocks movement, not LOS): heals every enemy within 2
  for 3 at round end; breaking it splashes oil (radius 1). Destroy target of `a2_forbidden_buffet`.
- `a2_coffee_machine` "Coffee Machine" (24 HP, blocks movement): the protect target of `a2_last_coffee`; custom painter
  with a health light, steam, a sticky note and a dent below half HP.

### Encounters (12: 8 normal, 4 elite; 3 handcrafted layouts)

| id | kind | theme / map | enemies (+ waves) | objective | minDepth |
|---|---|---|---|---|---|
| `a2_unpaid_internship` | normal | graveyard 9×10 gravestones, pits, mud | 2 interns, 2 zombies, banshee, cultist; r2 +2 interns (N) | killAll | 0 |
| `a2_bottomless_brunch` | normal | hauntwood 10×10 pools, bushes | 2 cultists, 2 zombies, pixie swarm, hollandaise | killAll | 0 |
| `a2_cub_scouts` | normal | hauntwood 9×10 trees, hills | 3 cubs, 2 pixie swarms, wisp | killAll | 0 |
| `a2_follow_the_lights` | normal | hauntwood 10×11 deep water, pools, mud | 2 wisps, 2 zombies, 2 interns; r3 +zombie (zone) | killAll | 1 |
| `a2_forbidden_buffet` | normal | graveyard 11×10 gravestones, mud | 2 cultists, 2 interns, zombie; r3 +2 hollandaise (zone) | destroy 3 `a2_chafing_dish` | 1 (weight 0.8) |
| `a2_last_coffee` | normal | **layout** academy 11×10 (break room: the machine in the middle, tables, candles, bookshelves) | 3 interns, 2 zombies, banshee; r3 +2 interns (N) | protect `a2_coffee_machine` | 1 (weight 0.8) |
| `a2_rooftop_critics` | normal | academy 10×11 terraces, cliffs, pits | 2 gargoyles, banshee, 2 interns, pixie swarm | killAll | 2 |
| `a2_graveyard_shift` | normal | graveyard 11×11 gravestones, coffins, chokepoint | 2 zombies, 2 interns, banshee, wisp; r2 +2 interns (N), r3 +2 zombies (W), r4 +2 interns + gargoyle (zone) | survive 5 | 2 (weight 0.8) |
| `a2_mama_bear` | elite | hauntwood 11×10 trees, bushes, hills | Mama Owlbear, 2 cubs, pixie swarm | killAll | 2 |
| `a2_office_hours` | elite | **layout** academy 12×9 (lecture hall: the TA on a height-2 stage behind lecture desks, bookshelves, braziers) | TA (mark N, on the stage), 3 interns, gargoyle; r4 +intern (N) | killAll | 2 |
| `a2_its_alive` | elite | **layout** graveyard 12×11 (mausoleum lab: Gary by the operating slabs, 2 Tesla Coils, water puddles, a gravestone row) | Gary (mark G), 2 coils (mark Z), wisp, 2 zombies | killAll | 3 |
| `a2_tenure_review` | elite | graveyard 12×11 gravestones, pits, fence | TA, 2 zombies, banshee; r3 +2 interns (N) | killAll | 4 (weight 0.8) |

Normal rewards `{ goldMult: 1, itemRarity: null }`, elites `{ goldMult: 1.2, itemRarity: 'rare' }`. Normal fights start
with 5-6 enemies (DESIGN: 4-6).

## Public API (for other authors)

- `a2_skeleton_intern` is reusable as-is (Lich-tenstein's skeleton interns, events): spawn it and it reassembles by
  itself. Same-round reassembly checks for a living `a2_necro_ta` only; a boss that wants it can call
  `DD.Act2.reassemble(tile)` on `DD.Act2.pileTiles()` itself (that is what Raise Dead does).
- `a2_hollandaise`, `a2_tesla_coil` and every normal above can be spawned as adds. Encounter ids work with the event
  API, e.g. `api.combat('a2_mama_bear')` ("you find two adorable cubs"), `api.combat('a2_last_coffee')`.
- Statuses `a2_stoneform` (75% less damage on anyone; the "plans nothing" part is the gargoyle's planner) and
  `a2_vendetta` (+50% damage vs its source). Objects `a2_bone_pile`, `a2_bone_wall`, `a2_chafing_dish`,
  `a2_coffee_machine`.
- `DD.Act2` helpers (read-only, no state): `sprites` (sprite specs: `intern`, `zombie`, `cultist`, `hollandaise`, `wisp`,
  `cub`, `banshee`, `gargoyle`, `gargoyleStone`, `pixies`, `mama`, `ta`, `gary`, `coil`), `chainTiles` (custom area:
  target + nearest units within `L.reach`, `L.jumps` times), `chargeTiles` / `doCharge` (straight charge of `L.len`
  ending on the first foe; `L.dmg`, `L.push`), `reassemble(tile, why)`, `pileTiles()`, `throwableAlly(user, preferId)`,
  `arcTarget(coil)`, `singleTarget(skillDef)`.

## Balance (AutoPlay sims, normal difficulty)

Fixture party `test_knight, test_cleric, test_mage, test_rogue`, L4-7, 3 seeds per level (`&sims=3`, 12 fights each):

| encounter | wins | avg rounds | HP lost (% of party max) | downs/fight |
|---|---|---|---|---|
| unpaid_internship | 12/12 | 5.5 | 12% | 0.0 |
| bottomless_brunch | 12/12 | 5.3 | 14% | 0.1 |
| forbidden_buffet | 12/12 | 8.1 | 29% | 0.3 |
| cub_scouts | 12/12 | 5.0 | 16% | 0.0 |
| follow_the_lights | 12/12 | 5.4 | 15% | 0.0 |
| last_coffee | 12/12 | 5.0 | 5% (the machine loses 29% of its HP) | 0.0 |
| rooftop_critics | 12/12 | 6.6 | 12% | 0.0 |
| graveyard_shift (survive 5) | 12/12 | 5.0 | 17% | 0.1 |
| mama_bear | 12/12 | 7.3 | 21% | 0.0 |
| office_hours | 12/12 | 9.4 | 28% | 0.1 |
| its_alive | 12/12 | 7.5 | 29% | 0.0 |
| tenure_review | 12/12 | 10.3 | 43% | 0.6 |

(Numbers re-run at review time, after the review fixes.)

Random real-hero parties (4 of the 10 loaded heroes, L4-7, 3 per level): every encounter 12/12 (the old buffet
timeout is gone, see Core fixes), 3.7-6.8 rounds, only **1-10% of party HP lost** per fight (coffee 1%, cubs/Mama 4%,
internship/brunch/buffet/rooftop 5%, office 7%, shift/Gary 8%, lights 9%, tenure 10%), no downs. Brutal, real heroes
(2 per level): 95/96 won (one Last Coffee lost with the machine), 5.0-7.6 rounds, 6-28% HP lost.

Tests guard (4 sim suites, 1 seed per level by default): no timeouts, every fight winnable, normal fights won ≥ 50%,
not trivial (the party loses ≥ 8% of its HP on average; for the protect fight, either that or the machine loses
≥ 25%). The TA fights run long for the fixture party (Raise Dead twice + same-round reassembly); real kits end them in
5-7 rounds.

## Deviations

- Mama Owlbear and Gary are `immovable` (and `large`): in early sims push/pull kits trivialized them (Mama got pushed
  into a pit on turn 1). Consequence: Slate's lifts slam them in place (his kit text says immovable foes are too
  heavy), Lure and knockbacks don't move them. Tesla Coils are immovable too (mov 0).
- Tracking attacks that should not be dodged by one step are lobbed or leaps (`los: false`): Coffee Run, Gutter Dive,
  Glitter Bomb, Mama's Coming, Gary Throw, Lure, Arc Discharge. Breaking range still dodges them. Their areas
  (circle 1 around the tracked unit) are recomputed with the unit, so the telegraph stays honest. Detention is
  ground-anchored: the walls rise around the tile the hero stood on when it was planned.
- Stone Form's look is a render-only sprite swap (`unit.vis.sprite = DD.Act2.sprites.gargoyleStone`) done through
  `DD.FX.call` when the status lands and refreshed at round start / planning; there is no core hook for
  status-driven sprites.
- Pixie Swarm halves any skill damage whose area is a single tile (`DD.Act2.singleTarget`: no area or `single`),
  heroes' basics included; DoTs, surfaces, bumps and falls are not skill damage and hit in full.
- Raise Dead has 2 charges (DESIGN gives no number) and also stands every Bone Pile on the map back up.
- The destroy object `a2_chafing_dish` is named "Unholy Brunch Platter": `Combat.objectiveText` pluralizes with a
  bare "s" ("Destroy 3 Chafing Dishs"). See Requests.
- Tesla Coil arcs hit friends and foes (`filter: 'notSelf'`), so the coils heal Gary and zap his zombies; they skip
  lightning-immune units (other coils, wisps), which they used to waste arcs on.

## Core fixes

- **`js/engine/autoplay.js` (RULES), `approachMove` → new `walkApproach`** (review, marked `[core fix, enemies-act2]`):
  with a destroy-objective object left, AutoPlay now steps toward it along the walking distance (a BFS field over
  walkable tiles, heights included, like `DD.AI`'s approach field) before trying the old straight-line (Manhattan) rule.
  The Manhattan rule stalled behind walls and gravestone rows, or paced in and out of dead-end pockets that are closer
  as the crow flies, until the 30-round timeout (`a2_forbidden_buffet`, real heroes marwyn/corelos/marbles/zarathor,
  L6, sim seed 6; 1 in 32 buffet fights). Fights without a destroy objective are unchanged; players are not affected.
  Regression: suite `enemies_act2: AutoPlay walks around walls to a destroy target (core fix)` (a straight wall and a
  dead-end pocket; both time out on the old code). After the fix the real-hero buffet went 32/32 (5.8 rounds); the
  act 1 (`a1_union_meeting`) and act 3 (`a3_kobold_pep_rally`) destroy fights still win 12/12, and the act 1, act 3
  and `engine:` suites pass.

## Requests

- **RULES (`js/engine/combat.js`, `Combat.objectiveText`)**: plurals are name + "s"; a `pluralName` on object defs
  (or an `objective.label`) would let "Chafing Dishes" exist.
- **RULES (`js/engine/autoplay.js`, `approachMove`)**: done for destroy objectives (see Core fixes). Approaches toward
  foes and puzzle hints (≥ 10) still use the Manhattan rule; switching them to `walkApproach` too would help boss
  puzzles behind walls, but it changes every fight's AutoPlay, so it is left to RULES / the lead.
- **RULES (`js/engine/ai.js`, `styleOf`)**: a function planner with any damage skill reaching ≥ 3 gets `ranged`,
  keepDistance 3, so melee bruisers with a leap hang back unless every `api.bestAttack` call passes an explicit
  melee style (my planners do). Defaulting function planners to the style of their shortest skill would avoid it.
- **RENDER / RULES**: a status-driven sprite override (e.g. `vis` on a status def) would replace the Stone Form
  `FX.call` swap and fix the "stone look lingers after a cleanse" issue below.
- **Lead / balance**: same as act 1. Real hero kits beat act 2 under AutoPlay losing 1-10% of party HP per fight,
  elites included, while the fixture party loses 5-43%. Review measurement, same harness for every act (real parties,
  typical levels act 1 L2-4, act 2 L5-7, act 3 L8-10): act 1 2% HP lost per fight, act 2 8%, act 3 15%, so act 2 sits
  where it should on the curve, but the whole curve is low. My numbers already sit at the top of the act 2 bands. If
  act 2 should bite, the global knobs are the HP bands, enemy counts or difficulty scaling (or hero tuning); my numbers
  are in one place per enemy and easy to retune.

## Known issues

- If Stone Form is cleansed or dispelled during the player phase, the gargoyle keeps its stone sprite until the next
  round start (render only; it acts normally).
- Lure fails on immovable heroes such as Slate ("Won't budge!"); the wisp's AI never plans it on them.
- Real-hero sim results change from run to run while other areas are in flight (hero kits change between runs).
- Layout fights (`last_coffee`, `office_hours`, `its_alive`) are deterministic for AutoPlay, so their sim rows repeat
  across seeds.
- The Hollandaise Horror's poached-egg face reads a little like an eyeball at low zoom.
- (review) The Hollandaise Horror almost never lands a hit: in a 72-fight real-hero sweep 43 Horrors executed 2 slaps
  for 0 damage. Cultists serve them in round 1, 1-2 tiles from themselves, and heroes kill them on the way in. They
  still earn their keep as 12-HP meat shields (plus the oil): a review experiment that held the summon until it could
  be served next to a hero made the cultists walk in and die sooner, and both brunch fights got easier (fixture party
  HP lost 14% → 10% and 30% → 17%), so it was reverted.
- (review) Tracking shots fizzle a lot against AutoPlay, which steps out of range of every telegraphed one: Grabby
  Hands 64%, Coffee Run 52%, Gutter Dive 53%, Glitter Bomb 50% (act 1 and 3 shooters fizzle at similar rates). By
  design (DESIGN §4.1: breaking range dodges them); a human dodges less.
- (review) `a2_last_coffee` is the easiest fight with real heroes (3.7 rounds, 1-4% HP, the machine loses ~11%); on
  brutal the machine is the real threat (fixture party 4/8, real heroes 7/8).

## Screenshots

`.tmp/enemies-act2/g.png`, `g2.png` (gallery=act2), `g_a2_skeleton_intern.png`, `g_a2_hollandaise.png`, `g_mama.png`
(detail pages), `g_obj.png`, `g_obj2.png`, `g_obj2_crop.png` (objects: bone pile, bone wall, platter, coffee machine),
`spr.png` (sprite sheet incl. the stone gargoyle, from `spr.html`), `c_brunch.png`, `c_mama.png`, `c_a2_office_hours.png`,
`c_a2_its_alive.png`, `c_a2_last_coffee.png`, `c_a2_forbidden_buffet.png`, `c_a2_follow_the_lights.png`,
`c_office_auto.png` (in combat).
Review: `.tmp/enemies-act2-review/g_act2.png` (gallery=act2 after the review), `g_mama.png` → `g_mama2.png` (Mama
before → after), `spr.png` (sprite variants tried), `c_a2_mama_bear.png` → `c_a2_mama_bear2.png` (in combat, before →
after), `c_a2_cub_scouts2.png`, `c_a2_rooftop_critics.png`, `c_its_alive.png`.

Full `tools/test.sh` (no isolate) at hand-off: 478 suites, every `enemies_act2:` and `content:` suite passes, no
missing scripts; the 9 failing sections belong to other areas in flight (`bosses_act1` grimble ×8, `passive-table`
cursed Spontaneous Combustion ×1).

## Review

Adversarial review (resumed after an interrupted first pass; the content files were still the author's hand-off, the
first pass had only left scratch probes in `.tmp/enemies-act2-review/`). Everything below was checked by running code:
scratch probe suites in `.tmp/enemies-act2-review/` (`probe.html` + `probe.sh "…&probe=<file>"`, files `probe.js`,
`rprobe.js`, `r2.js`…`r10.js`).

**Verified, no change needed**
- Telegraph honesty under the content-test watcher over every a2 encounter, 8 fights each, fixture and real parties:
  0 hits outside a telegraph, no odd base numbers.
- Previews: every a2 enemy skill at **every** valid target from a busy test spot (110 previews): 0 mismatches, no state
  leaks. Pixie halving, Gary's lightning heal and Stone Form all preview exactly.
- Robustness: 40 random a2 skirmishes with status chaos every round (stun, root, charm, silence, sheep, taunt, dazzle,
  confuse, frozen, sleep, stealth, invulnerable…) on maps with pits, water, lava and heights, under AutoPlay: no
  swallowed errors, no insane states. 80 builds per encounter (normal + brutal): valid maps, safe spawns, the 3
  platters / the machine always placed and reachable.
- Mechanics edge cases: Lure onto lava (8 + Burn 2), a yeeted cub still grants Vendetta, a charmed statue plans
  nothing, Detention after the hero left (walls ring the marked tile, as telegraphed), Grabby Hands on a hero who
  stepped off the line (still lands, pulls along the long axis), Gary in shocked water (heals and is stunned).

**Fixed (most severe first)**
1. **AutoPlay idled until the 30-round timeout in `a2_forbidden_buffet`** (1 in 32 real-hero fights): with the enemies
   dead it walked toward the last platter by straight-line distance and stalled behind gravestone rows, or paced in and
   out of a dead-end pocket. Core fix in `js/engine/autoplay.js` (see Core fixes), destroy objectives only; regression
   suite with a wall and a pocket (both time out on the old code). Real-hero buffet now 32/32.
2. **Vendetta lied on the telegraph**: Mama's Maul showed 12 and dealt 18 to the culprit (Pounce 11 → 17, Stomp
   13 → 20). New `vendettaFlat` (a skill `telegraphFlat`, read by `DD.AI.intentDmg`) adds the +50% when the culprit
   stands in the attack; same multipliers as the engine's telegraph (Weak, Inspired, Empowered, items, difficulty).
3. **Gutter Dive hit from range when it had nowhere to land** (all four tiles next to the target taken): it dealt 8 to
   the target and its neighbours without moving, unlike its desc and unlike Mama's pounce ("No room to pounce!"). It
   now fizzles ("No room to land!"); both leaps' `aiScore` (`leapScore`) refuses targets without a free tile next to
   them, so such a dive is never telegraphed. Descs say so.
4. **Tesla Coils wasted arcs on lightning-immune units** (an adjacent wisp or coil was "the nearest unit"); they now skip
   them. An arc into Gary (who heals from it) was telegraphed as a red 5: it now reads "Recharge Gary" (💚, no damage
   number). Codex desc updated.
5. **Codex texts that contradicted the mechanics**: Banshee "push her … to cancel it" (a push moves the self-anchored
   cone, it does not cancel it); Zombie "yanks a hero 2-3 tiles away" (range is up to 4, in a straight line); Gargoyle
   "hitting it and everyone next to it" (only heroes; the dive is foes-only).
6. **Mama Owlbear's silhouette**: the long-legged quadruped read as a brown dog with a duck bill, 46 px at zoom 1 (about
   a hero's height) and vanished behind hauntwood trees. She now rears up: a `huge` humanoid bear body at scale 1.6
   (71 px), owl face (beak, ear tufts, feathered chest) and the pink bow, via `mamaOverlay`. The cubs stay quadrupeds and
   get owl ear tufts (`cubOverlay`) and a browner coat, so the family reads at a glance (`g_mama2.png`,
   `c_a2_mama_bear2.png`).
7. **Tests added** (`tests/content/enemies_act2.js`): Vendetta telegraph numbers (Maul 18 / Pounce 17 vs 11 / a Maul
   that misses the culprit 12); coils skip immune neighbours and label Gary's recharge; a boxed-in hero is never dived
   on (no move, no damage, never telegraphed); the brunch platter's +3 heal reaches 2 tiles and not 6, its oil splash on
   breaking; a zombie next to the coffee machine goes for it (7) and losing the machine is a defeat; the AutoPlay
   regression suite above.

**Tried and reverted**: serving the Hollandaise Horror next to a hero (summon held until it could be) made the brunch
fights easier, not harder (see Known issues); the author's round-1 meat shield stays.

**Balance** (re-run after the fixes; tables above). Fixture party: every encounter 12/12, 5.0-10.3 rounds, 5-43% HP
lost. Real heroes: 12/12 everywhere, 3.7-6.8 rounds, 1-10% HP lost; brutal 95/96, 6-28%. Same harness for all three
acts at their typical levels: act 1 2%, act 2 8%, act 3 15% HP lost per fight, so act 2 sits where it should on the
curve; the curve itself is low because real kits under AutoPlay dodge almost every telegraph (tracking shots fizzle
50-64% of the time, in every act). Elites are rarely locked down (Mama stunned in 2 of 37 enemy phases), they just get
dodged. All numbers stay inside DESIGN §5; nothing was retuned.

**Left as is**: Stone Form's look lingering after a buff cleanse (no hero cleanses enemy buffs today); the Horror's
weak offence; Last Coffee being the easiest fight; the `styleOf` / status-sprite / plural requests above.

Final runs: isolated `suite=enemies_act2,content:&isolate=enemies/act2,enemies_act2` PASS (32 suites, 6503
assertions); full `tools/test.sh` PASS (506 suites, 61454 assertions, 0 failures, no `a2_` warnings).
