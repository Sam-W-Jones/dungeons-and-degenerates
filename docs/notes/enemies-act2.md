# ENEMIES-ACT2 — notes

Files: `js/data/enemies/act2.js` (content), `tests/content/enemies_act2.js` (29 suites `enemies_act2: …`, 27 run by
default, 2 opt-in tools). v1 core fix kept: `js/engine/autoplay.js` `walkApproach` (see "v1 history").
Isolated run: `bash tools/test.sh "suite=enemies_act2&isolate=enemies/act2,enemies_act2"` (add `&verbose=1&sims=3` for
the balance tables; `suite=enemies_act2,content:` adds the generic content suites).
Scratch (v2 pass, not shipped): `.tmp/enemies-act2-v2/` — `mut.html` + `mut.sh "mut=<name>&…"` (load-time mutations of
the act 2 defs to check the suites catch them: `noprovoke`, `cuborder`, `closein`, `nofallback`), `probe=1` probes
(`probe*.js`: idle / stuck units with boards, round-1 downs, damage by enemy skill, replays).

Balance / debug tools (skipped unless their params are passed):
- `suite=enemies_act2: autoplay sims with real heroes&heroes=real&sims=3&verbose=1` (full load, no isolate): random
  parties of 4 real heroes vs every encounter, L2-4. `&battle=<encounter id>` runs one encounter and prints the final
  board of every lost fight.
- `suite=enemies_act2: debug battle log&battle=<encounter id>&lv=<level>&s=<seed>[&heroes=real]&verbose=1`: one
  AutoPlay battle, its log one line per round, and the final board as text.

## v2 — initiative, no telegraphs, attacks of opportunity, reach-aware targeting (this pass)

The v2 conversion of act 2 had been started twice (the HEAD commit + an interrupted attempt): initiative modifiers,
`passive` lines, planners acting at once, the banshee's cone without a wind-up, Mama's Stomp as the one elite wind-up,
the TA doing one thing a turn, Grabby Hands without damage, GARY ANGRY without the extra attack, the coffee machine moved
away from the spawns. All of that was kept. This pass finished the job against the attacks-of-opportunity engine and
the reach-aware targeting (DESIGN §4.2, §8 "Targeting"; `docs/notes/rules.md` "v2 — attacks of opportunity").

### The roster under v2

| id | tier | HP / mov / armor | init | targets as | attack of opportunity | on its turn |
|---|---|---|---|---|---|---|
| `a2_skeleton_intern` | minion | 13 / 4 / 0 | +1 | brute | Paper Cut 5 + Bleed 2 | Paper Cuts the hero next to it, else lobs a Coffee Run (4, range 1-5, cd 1). Dies into a Bone Pile that reassembles |
| `a2_zombie_unpaid` | normal | 28 / 3 / 0 | −2 | brute | Unpaid Overtime 7 | bites the hero next to it; one it can't reach, 2-4 tiles away in a straight line, is yanked up to 3 tiles toward it (next to it on a clear line; never through a coworker) and Rooted (Grabby Hands, cd 2) |
| `a2_brunch_cultist` | normal | 26 / 3 / 0 | 0 | support | — | Mimosa heal 8 (cd 1), serves a Hollandaise Horror (cd 3, 2 charges), Scalding Latte 7 fire + Burn 2 (1-4) |
| `a2_hollandaise` | minion | 12 / 4 / 0 | +1 | brute | Sauce Slap 5 | slaps the hero next to it; dies into an oil slick (radius 1) |
| `a2_wisp` | normal | 24 / 4 / 0, flying, **noProvoke** | +3 | **diver** (skirmisher) | — | blinks to 3+ tiles from the heroes and zaps the weakest it can reach: 6 lightning, then **one** jump (6) to the nearest unit within 2, friend or foe; over a pit / deep water with Lure ready it swaps a hero within 4 into it (cd 3) |
| `a2_owlbear_cub` | normal | 26 / 4 / 0 | +2 | brute | Overexcited Nibble 6 | Cub Charge from where it stands (up to 4 straight, 8 + push 1, cd 2; a dash: provokes nothing), else nibbles |
| `a2_banshee` | normal | 26 / 4 / 0, flying | +1 | ranged (keep 2-3) | — | screams from where she floats (2-tile cone, 6 + Stun, cd 3, spell), else One-Star Review 7 + Weak (1-5) |
| `a2_gargoyle` | normal | 28 / 3 / 1 | −1 | **diver** (assassin) | — | Gutter Dive from its perch on the weakest hero within 5 (a leap; 8 to it and every hero next to it), then Stone Form: 75% less damage, its next turn idle |
| `a2_pixie_swarm` | normal | 24 / 4 / 0, flying | +4 | ranged (keep 2) | Tiny Bites 5 | Glitter Bomb (5 to the target and the foes next to it + Dazzle, lobbed 1-5, cd 1), in between flies in and bites. Swarm: single-target skills deal half |
| `a2_mama_owlbear` | elite | 110 / 4 / 1, large, immovable | +1 | brute | Maul 12 (the walker only) | Maul (3-tile row) or Mama's Coming (leap 1-5, 11 + knockback 2, cd 1); then, with 2+ heroes within 2, ⏳ Earth-Shaking Stomp (13 to every foe within 2 at the start of her next turn, cd 3). Vendetta on a cub's killer |
| `a2_necro_ta` | elite | 100 / 3 / 0 | 0 | summoner (keep 2) | — | one thing: Raise Dead (2 interns + every Bone Pile, cd 3, 2 charges), Detention (bone walls around the closest hero within 3, cd 3) or Red Pen 11 + Vulnerable (1-6). Piles reassemble the same round while he stands |
| `a2_gary` | elite | 110 / 3 / 1, large, immovable | −2 | brute | Clobber 13 + knockback 2 (ends the walk) | Clobber, or Gary Throw (an adjacent ally or a spare limb at a foe 2-6 away: 11 to it and the foes next to it, **cd 2**). Lightning heals him; GARY ANGRY below half HP (Inspired for good) |
| `a2_tesla_coil` | minion | 12 / 0 / 0, immovable | +2 | turret (ranged) | — | arcs 5 lightning into the nearest unit within 4, friend or foe (Gary wins ties: it heals him), else Overcharges (+50% on its next arc) |

Only Mama's Stomp is announced (⏳, interrupted by Stun / Sleep / Freeze / Polymorph). Leaps, charges, the scream and
the dive go off from where the unit stands at its turn start, so heroes counter them with where they end their turn.

### What changed in this pass

- **Targeting styles** (the engine's formula, DESIGN §8): brutes (`BRUTE`) for interns, zombies, Horrors, cubs, Mama and
  Gary — they stick to the hero they start their turn next to; ranged / summoner / support keep their distance and a
  melee hero next to them pins them (stepping off costs an attack of opportunity); **divers only for the wisp
  (`'skirmisher'`) and the gargoyle (`'assassin'`)**: they go for kills, the wounded and the squishy. The wisp keeps 3+
  tiles from every hero while it does (its zap `aiScore` scores each blink spot: −2 per tile closer).
- **Tooltips say how each one behaves**: every `passive.desc` ends with its targeting ("it sticks to that one", "keeps its
  distance", "stays near its friends, out of melee", "Sneaky: … the weakest …", "Never moves"); codex descs too where
  it is the point (wisp, gargoyle).
- **Attacks of opportunity**: each enemy's first ready melee skill is its reaction. The cub now lists its Nibble first
  (its charge was the first melee skill: an 8 + push reaction). Mama's reaction is her Maul (12, the walker's tile
  only), Gary's his Clobber (13, the knockback ends the walker's move) — elite brutes, intended. Ranged units make none.
  The wisp has `flags.noProvoke` (it always teleports; the flag makes the AI's path pricing and the HUD agree).
- **Planners price attacks of opportunity**: `closeIn` (every custom planner's approach / keep-distance move) adds
  `api.aooCost` per destination (a lethal one rules the tile out), so a pinned TA or banshee stays and fights. Melee
  `closeIn` now heads for the nearest **free tile next to a foe** (friends crowding a hero send it round to the open
  side), and its distance field respects heights and treats hostile units, downed heroes included, as walls.
- **`defaultThen(style, keep)`** (interns, zombies, cultists, Horrors, pixies): DD.AI's default turn, then, if it did
  nothing and did not move, one `closeIn` + an attack. The engine's approach field ignores units, so a downed hero
  plugging a corridor parked every default-planner enemy in front of it for the rest of the fight (seen in sims: 6
  turns in a row; regression in the targeting suite; see Requests).
- **Simplified / retuned**: Swamp Gas Zap jumps **once** (was twice: into a party holding the line it hit three heroes
  every turn, ~18 a turn from a normal enemy); Gary Throw got **cooldown 2** (it had none: 80 damage a fight to the
  party with real heroes, 42 after); Cub Scouts fields **2 cubs** as its intro says (was 3: the hardest normal fight with
  real heroes, 5/9).

### Statuses, objects, encounters (v2)

- `a2_stoneform` (1 turn, applied on its own turn: lasts through its next turn, which it spends idle), `a2_vendetta`
  (2 of Mama's turns). Durations count the owner's own turns; Root / Stun / Weak / Vulnerable / Dazzle from enemy turns
  cover the hero's next turn (tested). Bone walls and piles count rounds.
- Objects unchanged: `a2_bone_pile`, `a2_bone_wall`, `a2_chafing_dish` (Unholy Brunch Platter), `a2_coffee_machine`.
- 12 encounters (8 normal, 4 elite, 3 layouts) build and fight under initiative: waves roll on arrival and act from the
  next round, Graveyard Shift is won at the end of round 5, the coffee machine is out of every enemy's first move and
  each of its sides is one move from a hero (body-blocking works: interns and zombies claw at it from its sides), the
  buffet is won by breaking 3 platters. Nobody starts with Block.

### Balance (AutoPlay, normal difficulty, the act 2 level band L2-4: one level-up per won fight, run-v2)

Fixture party (`test_knight, test_cleric, test_mage, test_rogue`), `sims=3` (9 fights each; HP lost can pass 100%:
healing):

| encounter | wins | L2 / L3 / L4 | avg rounds | HP lost | downs/fight |
|---|---|---|---|---|---|
| unpaid_internship | 9/9 | 3 / 3 / 3 | 7.8 | 81% | 1.8 |
| bottomless_brunch | 9/9 | 3 / 3 / 3 | 9.6 | 71% | 1.0 |
| forbidden_buffet | 9/9 | 3 / 3 / 3 | 12.1 | 64% | 1.0 |
| cub_scouts | 9/9 | 3 / 3 / 3 | 6.0 | 69% | 0.7 |
| follow_the_lights | 7/9 | 1 / 3 / 3 | 6.9 | 88% | 2.1 |
| last_coffee (machine −26%) | 9/9 | 3 / 3 / 3 | 5.8 | 64% | 0.9 |
| rooftop_critics | 9/9 | 3 / 3 / 3 | 8.7 | 72% | 1.2 |
| graveyard_shift (survive 5) | 9/9 | 3 / 3 / 3 | 5.0 | 69% | 1.1 |
| mama_bear (elite) | 7/9 | 3 / 1 / 3 | 10.7 | 115% | 3.6 |
| office_hours (elite) | 5/9 | 0 / 2 / 3 | 11.2 | 122% | 3.1 |
| its_alive (elite) | 8/9 | 3 / 2 / 3 | 9.7 | 103% | 1.6 |
| tenure_review (elite) | 6/9 | 2 / 1 / 3 | 12.1 | 119% | 4.7 |

Random real-hero parties (4 of the heroes loaded at the time, L2-4, `sims=3`): normals 8/9-9/9 (5.0-9.1 rounds, 37-69%
HP lost, 0.6-2.6 downs a fight), elites Mama 8/9, Office Hours 6/9, It's Alive 9/9, Tenure Review 7/9 (8.3-11.7
rounds, 72-97% HP lost, 2.1-3.7 downs); total 99/108, 64% HP lost. Same harness at the start of this pass: 57/72
(`sims=2`, 70% HP lost); midway, before the zap / throw / Cub Scouts changes: 89/108 (Cub Scouts 5/9, It's Alive 4/9).

Sanity (every sim, asserted): no timeouts; no one-shots (no enemy turn takes a hero from full HP to down); nobody stuck
(3 idle turns in a row with a hero in its reach, or 4 idle turns, while a walk to a hero exists); the fixture party wins
≥ 50% of every normal fight. Round-1 downs are logged: 1 in 108 fixture fights (Graveyard Shift L2: two zombies yanked
the rogue across a pit twice, then the banshee).

So: regular fights hurt and someone usually goes down; elites are hard (the TA fights at L2 most of all). Numbers are
in one place per enemy for the balance pass.

### Tests (v2)

28 suites, 26 by default (29 / 27 with the review suite, see "Review (v2)"): registry (init modifiers, passive lines, no telegraph wording, only the Stomp mentions a
wind-up), every attack's damage == desc at once, each gimmick on the enemy's own turn (reassembly, mimosas + oil, chain
zap + Lure from over a pit, charges from where the cub stands, the banshee's cone, dive + Stone Form, swarm halving,
Mama's ⏳ Stomp + Vendetta, Raise Dead + Detention, Gary + coils), a sensible turn for every enemy, **targeting**
(style + tooltip per enemy; the engaged zombie bites the knight and not the 5-HP mage a provoking step away, takes the
kill once the knight's reaction is spent; the gargoyle and the wisp dive the wounded mage where a brute would hit the
knight; the wisp blinks off the knight's elbow unprovoked and hovers 3+ away; the banshee and the TA stay pinned next to
the knight, back off once his reaction is spent; a zombie walks round a downed hero plugging a corridor), **attacks of
opportunity** (each enemy's reaction skill; walking off a zombie / Gary / Mama; an intern walking off the knight; the
cub's charge, Mama's pounce, the dive, Grabby Hands and Gary Throw provoke nothing; walking off ranged enemies is
free), durations per own turn, encounters under initiative, odd targets / users / statuses, previews vs reality, builds
on 6 seeds × 2 difficulties, the AutoPlay core-fix regression, 4 sim suites. Mutation-checked through
`.tmp/enemies-act2-v2/mut.sh`: removing the wisp's noProvoke, putting the cub's charge first, zeroing `api.aooCost` and
dropping the `defaultThen` fallback each fail a suite.

### Deviations

- DESIGN §8 lists flyers among the divers; only the wisp and the gargoyle dive. The banshee (loud, not sneaky) and the
  pixie swarm stay ranged: with every flyer diving, Cub Scouts and Rooftop Critics would field three divers each, the
  pattern the user complained about.
- The wisp is a diver that keeps its distance (its zap `aiScore` prices blink spots); the engine's diver positioning
  alone would park it next to its target.
- Leaps, charges and the scream only go off from where the unit stands (kept from the first v2 attempt), but
  `DD.AI.reachOf` (threat shading, AutoPlay) adds the unit's move to them: the shading over-estimates the gargoyle,
  Mama, the cubs and the banshee (safe; see Requests).
- Grabby Hands still pulls a hero across pits on the way (25% max HP per fall): an environmental combo the zombie does
  not aim for (its `aiScore` ignores it).

### Requests

- **RULES (`js/engine/ai.js`, `fieldTo` / `approach`)**: the approach field ignores units, so a downed hero (or any
  hostile unit) plugging a corridor parks every default-planner enemy in front of it for the rest of the fight (act 1
  / act 3 enemies and bosses too). Treating hostile units as walls (the goal tiles aside) fixes it; act 2 works around it
  (`defaultThen` + its own field). Regression: `enemies_act2: targeting …` (the corridor case; with the plain default
  planner the zombie stays put 6 turns).
- **RULES (`DD.AI.reachOf`)**: a way to declare that a skill only goes off from where the unit stands (e.g. a skill flag
  `fromStand: true`), so the threat shading and AutoPlay don't add the walk to the gargoyle's dive, Mama's pounce, the
  cub's charge and the banshee's scream.
- **HUD**: a pill for `flags.noProvoke` ("👻 Can't be pinned") and `flags.noOpportunity` in the enemy inspect panel
  (the wisp's passive says it, but the pills already show flying / immovable).
- **Balance pass**: elites are the hard part (fixture party: Office Hours 0/3 at L2; real heroes 6/9-9/9). Knobs, all in
  `act2.js`: the TA's Raise Dead charges (2) and same-round reassembly, Office Hours' stage (+25% high ground on the Red
  Pen: 14) and its round-4 intern, Mama's Maul (12) / Pounce cooldown (1), Gary Throw's cooldown (2).
- **RULES (`Combat.objectiveText`)** (v1, still open): plurals are name + "s"; a `pluralName` on object defs would let
  "Chafing Dishes" exist.
- **RENDER / RULES** (v1, still open): a status-driven sprite override would replace Stone Form's `FX.call` sprite swap.

### Known issues

- Units boxed in by downed heroes or cliffs wait (nothing to reach): Mama walled in by two downed heroes and a wall, an
  intern behind a downed hero in a one-tile chokepoint. Correct, if dull; the sims' stuck check skips units with no walk
  to a hero.
- The Hollandaise Horror still rarely lands a hit (served in the back, 12 HP, heroes kite it); it is a meat shield + oil.
- Interns lob Coffee Runs (4) more than they Paper Cut when heroes are 2-5 tiles off: the top damage source in the TA
  fights (many interns), chip damage only.
- Real-hero sim numbers move from run to run while the hero kits are in flight (three new heroes this round).
- Layout fights (`last_coffee`, `office_hours`, `its_alive`) are deterministic for AutoPlay, so their sim rows repeat.

## Requests (Nov 3) — content sweep for the user's v2 requests (flyers, barrels, aimed heals)

The engine skips every floor effect for flyers (DD.Grid.feelsFloor / feelsSurface); the wisp, the banshee and the pixie
swarm fly, so hero webs, fire, poison puddles, brambles, runes and traps no longer touch them (walls and attacks still do).
- **Wisp Lure**: `lureValue` is 0 for a flying target (it would just hover over the pit) and lava counts only when it
  can hurt the target (`G().harmlessTo`). With only flyers in reach its turn over a pit is a zap. The passive says "swaps a
  walking hero … (flyers just hover)", the desc "(unless you fly)".
- **Bone Pile**: a stomp is a floor effect (the engine skips object onEnter for flyers); the desc says "flying over it
  doesn't count", and the AutoPlay hint returns 0 for a flyer (AutoPlay already skipped step-only objects for flyers).
- **Barrels / aimed heals**: no act 2 object explodes (the brunch platter spills oil, which is not an explosion), and
  every act 2 skill is an enemy's (the Bottomless Mimosa never revives: enemies don't aim at downed units).
- **Tests**: `enemies_act2: v2 requests (Nov 3) — …` (16 assertions: Lure scores for a flyer vs a walker, a turn over a pit
  with only a flyer in reach, a lured flyer hovering unhurt, bone piles walked vs flown over).
- **Rotation (box prop, plan `.tmp/wf7/rotation-design.md` §7 P2)**: the Coffee Machine is `yawAware: true`, so its body
  and lid stand on the view's ground quad and turn with the board. `machinePt` moves each detail onto its physical side,
  exactly `[px, py]` at yaw 0:
  - the menu screen, ☕, pot and steam on the east front (off the default view the upright pot and ☕ narrow with that
    face);
  - the health light and the sticky note on the south;
  - the front-corner dent when both are in view;
  - vents on the back (north / west), which the default view never shows.

  The default view is pixel-identical (per-state painter hashes, the frozen `renderTo` of `a2_last_coffee` and
  `tools/shot.sh` at rot=0, before vs after). Suite: `enemies_act2: the coffee machine turns with the map (box prop,
  yawAware)`, 11 assertions.

## Review (v2) — adversarial review of the act 2 v2 conversion (ADVERSARIAL REVIEWER role)

Scope: everything above (`act2.js`, its suites, these notes) against v2 + attacks of opportunity + reach-aware
targeting. An earlier attempt at this review was killed by the app hang before it changed anything; its probes
(`.tmp/ea2rev/probe*.js`) found the first two leads below and were kept. Scratch (Chrome-slot aware, not shipped):
`.tmp/ea2rev/run.sh "probes=<file>&suite=<name>&verbose=1"` (`rev.js` targeted turns, `rev2.js` per-enemy turn outcomes
in AutoPlay sims, `rev3.js` replay + board dump of one enemy turn, `rev4.js` what stops Grabby Hands, `probe2.js`
instrumented sims), `.tmp/ea2rev/mut.sh "mut=friends|grab|raise&suite=enemies_act2: review"` (load-time mutations),
`.tmp/ea2rev/shot.sh` (combat screenshot + an enemy's inspect panel: `hov=<defId>`).

### Fixed (regression suite `enemies_act2: review (v2) — …`, 80 assertions; each fix mutation-checked)

1. **Foes-only area attacks were scored as friendly fire, so enemies skipped their gimmick next to a coworker.**
   DD.AI takes 1.2 × the damage estimate off for every friend in an area unless the skill is tagged `'safe'` (a tag the
   skill tooltip would print); it does not know that `strike(…, { foesOnly: true })` spares them. With brutes engaging
   heroes (v2 targeting), a coworker next to the target was the normal case: Gary, unable to walk up, **stood still doing
   nothing** rather than throw at a hero a zombie was fighting; the banshee reviewed instead of screaming (11 of 37
   ready screams skipped in 108 fixture fights); a pixie swarm out of biting range passed; the gargoyle dove a healthy
   hero instead of the wounded one beside an intern. Fix: `sparesFriends(ctx)` (an `aiScore` part that gives the
   penalty back, through `DD.AI.estimate`) on the scream, Gutter Dive, Glitter Bomb and Gary Throw. After: 26 of 29
   ready screams fire (the rest: no hero worth it), Gary throws, the pixies glitter, the gargoyle dives the wounded mage.
2. **Zombies yanked heroes through their own coworkers.** Grabby Hands aims through units (LOS ignores them), so with
   friends crowding the hero it could not reach, a zombie pulled the hero straight into an intern: BONK, 3 to the hero and
   3 to the intern, the hero still out of biting reach (163 damage to act 2 enemies by their own zombies' grabs in 108
   fixture fights; 114 of 172 grabs left the hero short). Fix: `grabBlocker` in its `aiScore` (−50 when a friend stands
   in the line). After: 0 friendly damage; 75 of 143 grabs land the hero next to the zombie, the rest are stopped by an
   object (a gravestone, a crate: 3 bump damage, the push rule), another hero (3 to both) or a pit. The passive and codex
   now say "yanked up to 3 tiles toward it … (never through a coworker)" instead of "next to it".
3. **Raise Dead's second intern could land 4-5 tiles from the TA** ("on empty tiles 1-3 tiles away"): `raiseTiles`
   picked the nearest empty tile to the aimed tile without checking the TA's range. Fix: only tiles within the skill's
   range of the TA. Checked over every valid target on 3 boards (all tiles 1-3) and on his real turn.

### Verified (probes and suites; everything below held)

- **desc == effect** for all 28 skills, 2 statuses, 4 objects and every passive / codex line (read against `execute`;
  damage, riders, ranges, areas, cooldowns). Cooldown cadence on own turns matches the texts: Gary Throw (cd 2) rounds
  1, 4, 7 ("every third turn"), Glitter Bomb and Coffee Run (cd 1) every other turn, the scream (cd 3) rounds 1, 5, 9,
  Cub Charge every third turn, Mama's Stomp lands at the start of her next turn.
- **Attacks of opportunity**: each enemy's reaction skill (the suite's census), Gary's knockback ending the walk, Mama's
  Maul hitting only the walker, leaps / charges / pulls / throws / blinks never provoking, ranged enemies making none.
  In 108 fixture fights: interns 43, zombies 27, pixies 14, Mama 7, Hollandaise 7, cubs 4, Gary 4 reactions; heroes'
  reactions mostly hit interns walking past them.
- **Targeting**: no enemy idles with a hero in its reach (per-enemy outcomes over 108 AutoPlay fights: idle turns with a
  hero in reach ≤ 4 per enemy type, gargoyle idle turns are its Stone Form turns). The "moved only" turns of cubs,
  gargoyles and Hollandaise Horrors start 5-10 tiles from the nearest hero (AutoPlay hangs back; the Horrors chase
  kiting heroes); one cub dithered between two lanes while its friends plugged and unplugged a corridor — correct
  pathing with a changing board. The cultist stays 3-4 tiles out and heals the hurt zombie; pinned ranged units fight
  the hero pinning them.
- **No normal-enemy wind-ups**: only Mama's Stomp (an elite's one signature move). Initiative modifiers fit (pixies +4,
  wisps +3 … zombies and Gary −2). Encounters, waves, survive / protect / destroy objectives: suites green.
- **Visuals**: the act 2 gallery, Mama Bear mid-AutoPlay, It's Alive with Gary's and the wisp's inspect panels, Office
  Hours with the TA's, Bottomless Brunch with the zombie's new passive (`.tmp/ea2rev/*.png`): readable, the targeting
  sentence and the "Holds the line" line show.
- **Balance unchanged by the fixes** (fixture party, `sims=3`): normals 7/9-9/9, Mama 7/9, Office Hours 7/9, It's Alive
  8/9, Tenure Review 5/9 (noise-level vs. the table above); real heroes 99/108 (the same as before), 63% HP lost.
- **Full `bash tools/test.sh`** after the review: 796 suites, 2 failing sections, both in `integration` (unlock
  conditions and "ten real heroes" vs. v2's all-unlocked roster; "no XP" in the Objective Failed step: the U / X codes
  of the migration guide, not act 2). All 27 default `enemies_act2:` suites and the 8 `content:` suites pass; no
  swallowed errors.

### Deviations

- `sparesFriends` mirrors ai.js's friendly-fire weight (1.2 × `DD.AI.estimate`) instead of tagging the skills `'safe'`
  (the tag would print "Safe" in the enemy skill tooltip's subtitle). If the engine weight changes, the review suite's
  four foes-only cases fail (that is the guard).

### Requests

- **RULES (`js/engine/ai.js` `scoreAction`)**: let a skill declare that its area spares friends without a visible tag
  (e.g. a def field `spareFriends: true`, documented in ARCHITECTURE §3.2), or skip the friendly-fire penalty for units
  the preview shows unhurt. Act 1 / act 3 enemies and the bosses also have foes-only areas (`ctx.foes` in act1.js 12×,
  act3.js 16×, the boss files 3-8× each) and very likely skip them next to a coworker the same way. Act 2 would then drop
  `sparesFriends`.
- **Enemies act 1 / act 3, bosses**: check your pulls / grabs aimed through units (a pull bonks into whatever stands in
  the line, friends included).

### Known issues (after the review)

- Grabby Hands still bonks a hero into an object or another hero in its line (3 bump damage each, the push rule) and
  pulls across pits (11 falls in ~145 grabs): environmental, readable, kept.
- In It's Alive the Tesla Coils arc the zombies that spawn within 4 of them until those walk off (the "friend or foe"
  gimmick; 5 a turn, heroes profit).

## v1 history (condensed)

The v1 roster (DESIGN §8 act 2 plus the Hollandaise Horror and Gary's Tesla Coils), 13 enemies, 28 skills, 2 statuses,
4 objects, 12 encounters, was reviewed adversarially (telegraph honesty, previews at every target, robustness, map
builds) before v2. Kept from it:

- **Public API**: `a2_skeleton_intern` is reusable (spawn it and it reassembles; same-round reassembly checks for a
  living `a2_necro_ta`; `DD.Act2.reassemble(tile)` on `DD.Act2.pileTiles()` stands piles up). `a2_hollandaise`,
  `a2_tesla_coil` and every normal can be spawned as adds; encounter ids work with `api.combat(...)`. `DD.Act2`:
  `sprites`, `chainTiles` (custom area: the target + the nearest units within `L.reach`, `L.jumps` times), `chargeTiles`
  / `doCharge`, `reassemble`, `pileTiles`, `throwableAlly`, `arcTarget`, `singleTarget`.
- **Objects**: `a2_bone_pile` (3 HP, walkable, smashable; reassembles at round end, at once while a TA stands; a hero
  stepping on it crushes it; AutoPlay hint 9), `a2_bone_wall` (5 HP, blocks movement + LOS, crumbles at the end of the
  next round; hint 8 when a hero is boxed in), `a2_chafing_dish` (10 HP, heals enemies within 2 for 3 at round end, oil
  when broken), `a2_coffee_machine` (24 HP, the protect target, custom painter).
- **Core fix** (`js/engine/autoplay.js`, `walkApproach`): with a destroy-objective object left, AutoPlay walks toward it
  along the walking distance instead of the straight-line rule that stalled behind walls (`a2_forbidden_buffet`).
  Regression: `enemies_act2: AutoPlay walks around walls to a destroy target (core fix)`.
- Mama, Gary and the coils are `immovable` (push / pull kits trivialized them in v1 sims); Pixie Swarm halves skill
  damage with a single-tile area; Raise Dead has 2 charges; Tesla Coils skip lightning-immune units; Vendetta's +50% is
  in the Stomp wind-up's number (`vendettaFlat`, a skill `telegraphFlat`).
- Sprites: Mama rears up (humanoid `huge`, owl face, pink bow), the cubs stay on all fours with owl tufts; the stone
  gargoyle has a pigeon. Screenshots from v1: `.tmp/enemies-act2/`, `.tmp/enemies-act2-review/`.
