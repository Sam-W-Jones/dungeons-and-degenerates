# C5 — Svammiel, the Floor Boss (V3, act IV "Under the Table")

Owner: C5 (plan `.tmp/v3/design.md` §8.2 row C5; §3.0.2, §3.5, §4.1, §5.1, §6.2; tests §8.4 Content).

## Files
| File | What |
|---|---|
| `js/data/bosses/svammiel.js` (new) | Svammiel (`svam_svammiel`, he), the Floor Staff Imp, 7 skills, 5 statuses, 3 terrains, 3 objects, the arena + encounter `boss_svammiel` (the finale), the Round / Snap / Phase cheats, Rulings, Rigged and Master Dice, CAUGHT CHEATING, the floor (panels, Floor Collapse, No More Floor), his custom painter; the `svammiel` cameo def (triggers incl. the twist, the start roast's `situation`, the five cameo cheats incl. the Radio Edit, and the finale's cheats in the same catalogue); `svam_finale_open`; named bark #17; `DD.BossSvammiel` (test / debug hooks) |
| `js/data/bosses/dm.js` | the twist cut-off line only: while `DD.Cameo.campaignGoesOn(state)`, the DM's last words are "Fine. FINE. You win. Same time next—" (banner sub and log line); with `DD.finalAct() === 3` unchanged |
| `tests/content/boss_svammiel.js` (new) | 17 suites "boss_svammiel: …" (below) |

Iterate: `bash tools/test.sh "suite=boss_svammiel&isolate=svammiel,bosses/dm"`. Author sims (real heroes, so no isolate):
`bash tools/test.sh "suite=boss_svammiel: zz&sim=1&n=40&verbose=1"` (`level=`, `seed=`, `detail=1|2`, and
`knobs=hp:360,pitchfork:10,…,style:melee` to try numbers without editing the file).

## The fight as built
- **Board**: 17 × 14, the layout of plan §3.5; 20 linoleum panels A1-E4 (3 × 3; `tile.tag = 'panel_C2'`, laid by coordinates
  when the fight starts; `state.data.panels` = their bounds); core B2-D3; A2 (the DM's panel) never drops; the void is
  `svam_void` (a pit). The DM (Demoted) at the kids' table on a stub at (0,6) (`svam_dm_table`, indestructible, can't be
  aimed at); his throne is the core `d20` ("Svammiel's Throne (it only shows 20)"), the table legs core pillars. Three
  Rigged Dice at (5,5), (11,5), (8,8). Panel art (black / gold squares, seams, labels) is the terrain painter
  `drawLinoleum` (yaw-0 ground px, the renderer warps it: rotation-safe).
- **Him**: flies through the status Wings (Graph Paper) (`svam_wings`, CAUGHT removes it); fire and poison ×0.5 while
  uncaught (his `modifyIncomingDamage`, mirrored in `estimateTaken`); a fall costs him a flat 30 (`modifyFinalDamage`);
  phase gates on the DM's pattern (You Can't Skip My Cutscenes: no skipping, no death before phase 3; a chip); the stun
  guard Don't Stun the DM (a visible status while armed). Kit slots: Pitchfork of Petty Grievances, Natural Twenty
  (Allegedly) (cd 1), Wing Buffet (cd 2); after CAUGHT the Honest d20 (tag `random`, `markUncertain`) replaces Natural
  Twenty. Wind-ups (not slots): Floor Collapse (phases 1-2: the present panel with the most grounded heroes, never A2 or a
  cheat-marked panel; it drops, units fall, it returns at the end of the next round, dice tumble first, other objects
  come back with it) and Hellfire Rain (phases 2-3: crosses around up to 3 heroes). Targeting: `api.reachableTargets`
  scored like the AI's own formula + 8 for a hero next to the kids' table + 6 (phase 3) for a hero next to a Master Die;
  Wing Buffet when it knocks a hero into the void or two foes crowd him; his moves never end over the void.
- **Phases**: 1 "The Lobby" (one entry); 2 "I, SVAMMIEL, CONTROL ALL" at 2/3 (banner = the user's line, sub "I go
  twice."; `unit.turnsPerRound = 2` from the next round through E2; without E2 two actions on his one turn); 3 "FINE. NO
  MORE FLOOR." at 1/3 (one entry; Round Cheats stop and the announced one is withdrawn; three Master Dice on walker-
  reachable outer panels farthest from the party, three columns; two outer panels marked a round ahead drop for good at
  every round end, ties clockwise from A1, never A2 or the core; Pencilled HP: up to 5 per standing Master Die of the
  damage he took that round, never above the phase-3 threshold). Each phase: Fudge refilled, +2 Rulings.
- **CAUGHT CHEATING** (every placed Master Die broken): banner + the DM's line, grounded (over the void he falls: 30),
  Caught Red-Handed (`svam_caught`, takenMult 1.25), the Honest d20, no Fudge / pencil / drops / cheats / Rulings, pending
  wind-ups cancelled, one action a turn, no wind-ups.
- **The cheat budget**: one Round Cheat a round (phases 1-2), drawn with the combat RNG from the phase deck (Petty /
  Blatant, plan weights), never last round's, at most twice a phase, never one that would do nothing (R4 without a hero
  skill that hurt him, R12 at 0 Hype, R9 without a free chair next to him, R10 at 4 imps, R1 / R7 / R5 without panels).
  **Timing**: a cheat is announced a whole round before it goes live: at the end of round k the cheat announced for
  round k+1 goes live and the one for round k+2 is drawn and announced (round 2's at fight start; round 1 has none: its
  cheat is the NAT 20). So every round shows this round's cheat and next round's (chips `svam_cheat` and `svam_next`
  with `next: true`, the objective subtitle, his inspect line), and every counter in the plan works (fire your signature
  before No Signatures, spend Hype before Hype Confiscated, a Ruling before Bring a Friend). One Snap Cheat a round while
  he holds a Fudge token (status `svam_fudge`, stacks = tokens; previews see the snaps: they are his hooks). Phase
  cheats at the flips, each a chip and a log line.
- **Each cheat's timing** (desc exact, plan §3.5): start of its round — R4 Skill Ban (`setCooldown` 1), R10 Bring a Friend
  (two imps on the marked tiles, max 4 alive; they clock in for the round they arrive: status `svam_clocking_in`), R12
  Hype Confiscated; during its round — R2 Bonus Action (Petty: +1 attack a turn), R3 No Healing on My Floor
  (`modifyHeal`, min 1; an aimed revive still gets the ally up), R8 Moving Costs Extra (`modifyMoveCost`
  `Math.max(m.ap, 2)` for heroes: the swap move too), R11 No Signatures (E13 `modifyUse` "Banned by Svammiel (No
  Signatures, That's Overpowered)."; without E13 a `modifyCost` of 99 AP), R6 Rule Zero (nothing); end of its round — R1
  The Floor Is Lava (the marked panel becomes lava, scorching grounded units on it; cools at the end of the next round),
  R5 The Tilt (2 tiles toward a landmark, downhill first: bumps 3, the void a fall; flyers and the immovable stay), R7
  Panel Swap (floor, surfaces, objects and grounded units trade panels; flyers stay where they hover), R9 New Seating
  Chart (`DD.Act.swap` without force; a lone sitter `teleport`s after an `isImmovable` check).
- **Rulings** (interact 1 AP next to the kids' table, once a round, 2 a phase carried over, +1 per Rigged Die): cancel this
  round's cheat while it can still be undone (R4 resets the cooldown), else next round's; in phase 3 they postpone the
  marked drop a round. Svammiel takes 10 (credited to the hero). The DM objects in the log, Svammiel barks "Overruled! …".
  AutoPlay's hint = the cancelled cheat's harm (lava 8 per hero on it, falls 25% max HP, a ban the skill's damage, Hype
  30 × 0.3, Rule Zero 0, else 8).
- **Rigged Die** (12 HP, aimable): −1 Fudge now and −1 max, +1 Ruling, +8 Hype (paid by svammiel.js: the engine's puzzle
  Hype is 0). **Master Die** (12 HP, aimable): −5 pencil each; all of them = CAUGHT. AutoPlay hints while he is
  uncaught (`N`): a Master Die 45 to break (`masterHint`), a Rigged Die 10 (`riggedHint`); V3.1 polish: AutoPlay prices
  a hit that leaves a Master Die standing by the share of its HP the hit removes (`autoplay.js objectValue`).
- **Honesty**: `threatAt` on his def declares the floor (this round's lava 8, a Tilt's fall / bump, a pending Floor
  Collapse's fall, this round's drops: 25% of max HP); E8 zones in `state.data.zones` (lava, swap, chairs with a line,
  tilt edge, imps, drops); the snaps and the cameo That's a 1 Now are mirrored in the estimates.
- **Defeat** (his `onDeath`): the tile cracks, `slide_whistle`, banner THE FLOOR GIVES WAY, the narrator line, his
  "…Same time next week?" (cls cameo, speaker Svammiel), `svam_defeat`; his chips go quietly.

## The cameo def (`DD.registerCameo` id `svammiel`)
Triggers (ids): `start` (act 4, swoop) · `twist` (victory of an act-3 boss while the campaign goes on: `svam_twist`,
entrance, forced, banner "YOU THOUGHT THIS WAS OVER?", bubble "I, SVAMMIEL, CONTROL ALL.", `then`: the table shakes, the
DM's "Oh no. That's my DM.", one living hero's `svam_twist_react_<id>` (70%), `DD.Meta.markSeen('bosses', 'svammiel')`) ·
`shadow` (round, act 3, boss_dm, DM phase 3, once) · `down` · `signature` · `member_down` (squad) · `env_kill` (a hero's
kill by surface / terrain / bump / fall / explosion) · `countered` · `long` (round 8+) · `sulk` (`svam_sulk_<lane>` from
`state.encounter.gauntlet.lane`). `situation(state, run, used)` walks plan V §6.2's list (fallen, recruit, first,
last_mini, debt, downed_last, mvp, flawless, from_tavern / shop / event, hurt, fresh, rich, broke, scarred, swapped,
brutal, casual), skips used keys and pools that don't exist, returns `{ key, vars, heroId }`.

Cheat ids (NARRATIVE's `svam_quip_<id>` / `svam_counter_<id>` match them): cameo `svam_green_thumb`, `svam_nepotism`,
`svam_cameo_one`, `svam_cameo_lava`, `svam_cameo_radio`; round R1 `svam_lava`, R2 `svam_bonus`, R3 `svam_no_healing`, R4
`svam_ban`, R5 `svam_tilt`, R6 `svam_rule_zero`, R7 `svam_panel_swap`, R8 `svam_moving_costs`, R9 `svam_swap`, R10
`svam_wander`, R11 `svam_no_signatures`, R12 `svam_hype_tax`; snap S1 `svam_reroll`, S2 `svam_nat1`; phase P-a
`svam_nat20`, P-b `svam_go_twice`, P-c `svam_scheduling`, P-d `svam_no_more_floor`, P-e `svam_retcon`, P-f
`svam_real_dice`. Each def carries inline `quips` / `counter` used only when NARRATIVE's pool is missing.

The five cameo cheats (descs exact, ≤ 90): Green Thumb (two `gard_vine` on the encounter's `cameo` marks, else (5,9) /
(8,9), spawned with `{ owner: the Gardener }`; no Gardener or vine def: no cheat) · Nepotism (`modifyInitiative` +3 for
units tagged `league`) · That's a 1 Now (`modifyFinalDamage`: the first skill hit of 10+ on `gal_galbraith` deals 1, a
flag in `state.data.svamCameoOne`; `estimateDealt` mirror) · The Floor Is Lava (lava on x 6-8, y 7-9, free walkable floor
only; `rounds: 3`; `onRemove` restores) · **the Radio Edit** (below).

**The Radio Edit** (`svam_cameo_radio`, the user's pick): `apply` (deterministic) picks over the heroes in party order and
their socketed slots (never the basic or signature, a `'shapeshift'` skill, a skill with Hype, a `downedAlly` skill or one
`DD.Targeting.revivesWith`) whose current level deals damage (`DD.resolve(L.dmg) > 0`): highest level, then higher L.dmg,
then party order, then slot order; stores `state.data.cameoRadio = { unitId, skillId }`, returns (and sets `ctx.desc`)
"<Skill> (<Hero>) is bleeped: it can't be used this fight.", FX "📻 *BLEEP*". The rule (`rounds: -1`) refuses it through
E13 `modifyUse` ("Bleeped by Svammiel (Radio Edit).") when `DD.Combat.vetoOf` exists, else a 99-AP `modifyCost`. No
candidate: `when` fails, no card. All 61 descs of the 16 registered heroes' damage skills are ≤ 90 characters (tested over the
registry: Benedick's are checked once his file lands).

## API (`DD.BossSvammiel`, tests / debug only)
`N` (knobs), `KIT`, `DECK`, `CHEATS` (finale), `CAMEO_CHEATS`, `LAYOUT`, `CORE`, `SAFE`, `CLOCKWISE`, `LANDMARK`,
`vetoMode` ('auto' | 'veto' | 'cost'), `fight()`, `peek()`, `findSvam()`, `panel(id)`, `present(id)`, `panelIdAt`,
`threshold`, `floorHp`, `syncPhase`, `enterPhase`, `syncKit`, `drawCheat(r)`, `planCheat(id, r)`, `force(id, data, { now,
start })`, `descOf`, `cancelTarget`, `rulingOpen`, `rulingValue`, `askRuling`, `dropPanel`, `placeMasterDice`, `markDrops`,
`caught`, `standingMaster`, `threatAt`, `radioPick`, `radioDesc`, `applyCameoCheat(id)` (a mirror of `DD.Cameo.cheat`
for suites), `situation`, `passiveText`, `updateBoard`, `slideOutcome`, `onRoundStart`, `onRoundEnd`. Fight state:
`state.data.svam` (`phase`, `cur`, `next`, `rulings`, `fudge`, `fudgeMax`, `caught`, `drop`, `gone`, `collapsed`,
`stats { rulings, rigged, master, caught, falls, pencil, drops, collapses, rains, imps, cheats, snaps, … }`).

## Balance (author sims: real random parties, L6, bare; `zz` suite)
| numbers | won |
|---|---|
| the plan's (480 HP, armor 1, 14 / 18 / 8 / 22, two actions in phase 3, Master Dice 20) | 0/10 · 0/20 |
| + armor 0, HP 400, one action in phase 2 (`p2Turns: 1`) | 45-60% (I Go Twice was the wall) |
| everything but the kit off (no wind-ups, Fudge, cheats, doubling) | 75% (21 rounds) |
| HP 380 / armor 0 / 10 / 13 / 6 / 16 / one action in phase 3 / Master Dice 12 | 63% (30, seed 12345) · 43% (40, seed 777) |
| HP 360, the rest as above (as landed; the Round Cheat draw was broken, see Review (V3)) | 60% (40, seed 12345) · 48% (40, seed 777) → 54% of 80 |
| the real weighted deck (V3 review fix), HP 360, 10 / 13 / 6 / 16 | 48 · 50 · 45% (seeds 12345 / 777 / 4242) → 48% of 120; one 41-round stall (seed 9001: the pencil out-healed a healer party) |
| **shipped (V3 review): the real deck, Pencilled HP ≤ half a round's damage, Natural Twenty 12, Hellfire Rain 14** | **65 · 53 · 60 · 63 · 60% (seeds 12345 / 777 / 4242 / 9001 / 31337) → 60% of 200**, 0 timeouts |
Shipped run (V3 review): ~14 rounds, phase 3 reached in ~72%, CAUGHT in ~30% of wins, hero falls ~2.2 a fight, pencil ~32 a
fight, Rulings ~2.1 and Rigged Dice ~2.7 a fight, 0 timeouts in 200. Note the fixture party (tests' `PARTY`) loses to him:
the author band needs real heroes (and the campaign band items and Blessings, like the DM's x1.35 / x1.6 row).

## Deviations
1. **Numbers** (above): HP 480 → 360, armor 1 → 0, Pitchfork 14 → 10, Natural Twenty 18 → 12, Wing Buffet 8 → 6, Hellfire
   Rain 22 → 14, the Honest d20 9 / 18 → 7 / 13, Master Die 20 → 12 HP. Reason: at the plan's numbers AutoPlay parties won
   0% at L6 (the plan's band 55-62%). All are knobs in `N` (BAL). (Natural Twenty 13 → 12 and Hellfire Rain 16 → 14 are the
   V3 review's, after the deck fix: see Review (V3).)
2. **Phase 3: one action a turn** (plan: two, on two heroes). With two the same numbers won 40% (360 HP) and lower HP made
   it worse (the second action decided the end of every long phase 3). `N.p3Acts` = 1 (the knob takes 2).
3. **At most one new wind-up a round** (`N.windsPerRound`): I Go Twice doubles his actions, not his wind-ups (the plan's
   "a wind-up if none is pending across both entries" let him wind up on both entries).
4. **A Round Cheat is announced a whole round before it goes live** (drawn at the end of round k for round k+2; round 2's
   at fight start). The plan says "announced at the end of the previous round", but no hero acts between a round's end
   and the next round's start, so start-of-round cheats (R4, R10, R12) and No Signatures would have had no notice; this
   timing makes the plan's counters ("Fire it now (you have a round's notice)", "Spend it first", "A Ruling before the
   round") and "his inspect line names this round's and next round's cheats" true. The plan's descs stay exact (each is
   written for its own round; R10's "next round" reads from the notice round). **QA (Nov 17, FIGHTS-05):** the same
   timing, but drawn and announced at the START of the round before its own (round 2's as round 1 starts, after
   deployment), and every announcement names its round by number (Deviation 22).
5. **R10 Bring a Friend**: the imps arrive at the start of its round and clock in for that round (a status), acting from
   the round after (its desc). **R12** at the start of its round (as the plan), after a whole round of notice.
6. **Floor Collapse** never on A2 or a cheat-marked panel, and only on a panel with a grounded hero (none: no wind-up); it
   may take a core panel (it comes back). **R1 Lava** never on A2 (the Ruling tile) or a dropped panel.
7. **His moves never end over the void** (a flyer could hover out of every melee hero's reach; the plan's arena assumes he
   can be hit). He still flies over it.
8. **Chip names**: his own chips (`svam_next`, `svam_cheat`, phase chips, Rulings) have plain names (the HUD prints `icon + '
   ' + name`); the "Next round" chip's name starts "Next round: ". The cameo cheats go through `DD.Cameo.cheat` (RULES),
   whose names carry the icon (the contract's `icon + ' ' + name`): a doubled icon on today's HUD (request below).
9. **Rigged Die pays +8 Hype itself** (the engine's puzzle Hype is 0; its desc says so).
10. **That's a 1 Now** (cameo) counts skill hits only (`cause: 'skill'`); its estimate mirror is `estimateDealt` (RULES: a
    fight rule's `estimateTaken` is never read).
11. **`svam_finale_open`** (his opening, the finale's announcer key) is registered in svammiel.js, count-free ("You broke
    all my toys", "You've seen me cheat all act": V §9.1 said "four").
12. **dm.js**: the cut-off replaces both the banner sub and the log line (they are the same line).
13. **A fall costs him 30 before CAUGHT too** (only a dispel could ground him; 25% of his max HP would be 90).
14. **The Lava cameo** skips patch tiles holding a unit or an object; **Green Thumb** is no cheat when no vine fits.
15. **Situations**: hurt / fresh fire once a run (DD.Cameo skips a used key).
16. **E13 detection**: `DD.Combat.vetoOf` exists → the veto, else the 99-AP fallback; `DD.BossSvammiel.vetoMode` forces one
    for tests.
17. **Named barks** go through `namedBark`: only lines naming a hero who stands in this fight (the engine's party filter
    knows registered heroes only, and #17 names Benedick, whose file may land later).
18. **Pencilled HP rubs out at most half a round's damage** (`N.pencilShare` 0.5; V3 review). P-e's desc gains "(never more
    than half of it)". Reason: with "up to 5 per standing Master Die" alone, a low-damage party that never breaks the dice
    deals ≤ 10-15 a round and he erases all of it: a real author sim stalled for 41 rounds (pencil 229). Half keeps the
    designed numbers for an ordinary round (30 taken → 15 erased, as before) and lets the slow road always end.
19. **Bring a Friend's live chip** reads "At the start of this round …" (`live`); the "Next round" chip keeps the plan's
    exact "At the start of next round …" (V3 review: with Deviation 4 the imps are already on the board while it is live).
20. **Skill Ban** never lengthens a cooldown: a skill whose own cooldown already covers the hero's next turn keeps it, any
    other gets one fresh turn of cooldown; a Ruling restores what the ban added, never the skill's own cooldown (V3 review:
    it used to add a turn to a cooling skill, and a Ruling reset the skill's own cooldown to 0).

## Tests (`tests/content/boss_svammiel.js`)
Registry + arena + encounter (exact descs from the knobs, barks ≤ 70, named bark #17, one named line per registered hero,
P2 object descs, panels) · his turn, wind-ups, Floor Collapse (falls, return, threatAt) · the cheat budget (announced a
round ahead, live for its round, never twice in a row, ≤ 2 a phase, the inspect line and subtitle, determinism) · every
Round Cheat's effect and end (R1-R12, R11 with E13 and the fallback) · snaps, Fudge, the stun guard, Rigged Dice · Rulings
· phases (gates, I Go Twice through E2, Master Dice, drops, the core and A2 kept, pencil, CAUGHT, a fall = 30) · NAT 20
initiative (rolled) · the Radio Edit pick (each tie-break, exclusions, the filled desc, ≤ 90 for every hero skill) and its
refusal all fight (veto and fallback, a cooldown reset, `useSkill`, AutoPlay never uses it, the engine's `DD.Cameo.cheat`)
· the other four cameo cheats · each landed door's start cheat (the League's Nepotism today) · the cameo def (triggers,
twist extras, env kill, sulk, situations) · the twist (cut off with acts 4 only; the entrance, the DM's line, markSeen) ·
previews = results with a snap ready, dry-run Rulings, routing to barks in his fight · AutoPlay to the end · `zz` author
sims (sim=1).
Final full run (Nov 14): 1118 suites, 130,146 assertions, 1 failure, not mine: `kit: finish D1` (`lg_body`, C2's
league.js in progress). Every boss_svammiel suite passes (16 + the zz sims, skipped without sim=1); boss_dm unchanged.

## Requests
- **Lead / DOCS (`docs/DESIGN.md` §5 act-4 column, §9 #11)**: Svammiel's row says 480 HP / 14-18 / 22 (and phase 3 "two
  actions"); the game ships 360 / 10-12 / 14 and one action in phase 3, Pencilled HP ≤ half a round's damage (Deviations
  1-2, 18). Update with BAL's final numbers.
- **BAL**: author 60% at L6 (200 fights, after the V3 review's deck fix). Campaign parties carry items / Blessings: measure
  the campaign band (80-85%) and add an `encounters.boss_svammiel` row like the DM's if it runs high. Levers in `N`: `hp`
  (weak: 330-360 moved it ≤ 5 points), the damage numbers (`nat20`, `rain` moved it most), `p2Turns`, `p3Acts`,
  `windsPerRound`, `masterHp`, `pencil`, `pencilShare`, `rulings` (no effect: AutoPlay uses ~2), `fudge`; CAUGHT is ~30% of
  wins (AutoPlay rarely shoots far Master Dice: `masterHint` 30 → 45 changed nothing, see RULES / AUTOPLAY's
  `objectValue` request in boss-league.md).
- **HUD (E7)**: (a) `DD.Cameo.cheat` rule names start with the icon and the chip prints `icon + ' ' + name`: a doubled icon
  ("📻 📻 Radio Edit"); strip a leading icon when it equals `r.icon`. (b) A `next: true` rule whose name already starts
  "Next round: " (his `svam_next`) needs no second prefix. (c) Live-changing chips: `svam_rulings` ("Rulings: N") and the
  objective flavour change mid-round.
- **RENDER-WORLD (E8)**: `state.data.zones` from svammiel.js: labels "🌋 Lava (next round)", "🔀 Swap B2↔D3 (this
  round)", "🪑 Chairs (…)" with a `line`, "↘️ Tilt toward his throne (…)", "👹 Imps arrive (…)", "🧨 Drops end of round N".
- **RENDER-SPRITES**: sounds `svam_sting` (his `boss.sting`), `cheat`, `slide_whistle` (his defeat). The custom painter
  `drawSvammiel` reads `g.pose` and the statuses (`svam_caught` → wings folded under a CAUGHT clip).
- **MAPGEN**: theme `a4_underfloor` (the layout sets its own terrain ids; the theme gives the backdrop and ambient).
- **META-RUN**: the start roast reads `run.fallen`, `run.flags.lastFight { downed, mvp, flawless, swaps }`,
  `run.flags.lastStop` (a type string, or `{ type, used: 'recruit', recruit: heroId }` for the recruit situation),
  `run.flags.gauntlet` / `run.map.beaten`, `run.map.lanes`, `run.gold`, `run.difficulty`, the party's `scars`.
- **NARRATIVE**: thanks for matching the cheat ids; svammiel.js registers `svam_finale_open` and narrates `svam_phase2`,
  `svam_phase3`, `svam_defeat`, `svam_twist_react_<id>`; `svam_sit_<x>` keys as listed above.
- **Integrator (sim.js Svammiel table)**: read `state.data.svam.stats` and `.phase` / `.caught` after his fight.

## Known issues
- AutoPlay catches him in ~35% of wins (plan ≥ 60%): the Master Dice spawn far from the party and AutoPlay's parties kill
  him uncaught; a human splits the party (the DM's counter line says so).
- Author-sim downs run ~5-6 a fight (bare L6 parties); the plan's "≤ 1.5 downs" is a campaign number.
- Until the HUD's E7, cameo cheat chips show a doubled icon (Deviation 8).

## Review (V3)
Adversarial review of svammiel.js, the dm.js cut-off and this suite (Nov 15; the reviewer now owns these files). Verified by
running code: the owners' 17 suites, scratch harness fights on the real path (Combat.start with deployment and rolled
initiative, AutoPlay on both sides) for five real parties at L6 (a no-healer party, two with Slate), 24 random-party fights
counting every drawn cheat, determinism (same seed twice, and a longer cosmetic pool leaves the fight bit-identical), the
Radio Edit at the real goats door with three real parties, R11 against AutoPlay's real signature path, New Seating Chart
with the real Slate and a downed hero, the author sims (`zz`, 200 fights after the fixes), the goats' author sims with and
without the start cameo, and shots (`.tmp/rv/svam_r180.png`, `.tmp/rv/twist_entrance.png`: panels and labels read at rot
180, the zones, the chips, the HELP sign, the twist rising on the DM's board).

Fixed (most severe first; each with a regression suite in `tests/content/boss_svammiel.js`):
1. **The Round Cheat draw always took the deck's first card.** `drawCheat` rolled `st.rng.float()`, which is NaN without
   bounds (`float(a, b)`), so the weighted pick never moved past index 0: Lava every other round, then Bonus Action / No
   Healing, and six of the twelve Round Cheats (Rule Zero, New Seating Chart, Moving Costs Extra, Bring a Friend, No
   Signatures, Hype Confiscated) never came up in a real fight (0 of 24 fights). Now `st.rng.next()`; every card comes up by
   its weight (suite "the Round Cheat draw is weighted over the whole deck").
2. **The phase-3 texts promised two actions a turn**: the PHASE 3 log line ("He acts twice a turn now.") and his inspect
   line ("Two actions a turn") while `N.p3Acts` is 1. Every text that counts his turns, actions or wind-ups now reads the
   knobs (`actsText`, `N.p2Turns`, `N.windsPerRound`; the phase-2 inspect line says "at most one new a round").
3. **A stalled slow road**: Pencilled HP could erase the whole round's damage (up to 5 per standing Master Die), so a
   low-damage party that never breaks the dice could not win the race (a real author sim ran 41 rounds, pencil 229). Now at
   most half a round's damage (`N.pencilShare`; the chip says so: Deviation 18). 0 timeouts in 200 author fights since.
4. **Skill Ban** (R4) lengthened a cooldown that already covered the hero's next turn (its desc says "through <hero>'s next
   turn"), and a Ruling reset the skill's own cooldown to 0 (more than the ban). Now it adds a turn only when needed and a
   Ruling restores what it added (Deviation 20).
5. **Bring a Friend's live chip** still said "At the start of next round …" while its imps were already on the board; it
   says "this round" while live (Deviation 19).
6. **Bonus Action** stopped counting if he flipped into phase 3 during its round (its chip stays up and says "each of his
   turns"); it now adds its attack in phase 3 too.
7. The Radio Edit's `apply` returned `null` without a candidate (DD.Cameo.cheat would have used the template desc); it
   returns `false` ("no card"). Unreachable today (`when` gates it), fixed for safety.
8. Header comments: the stale 480 HP and "two actions" lines.

Balance after the fixes (author sims, real random parties, L6, bare, `zz`): the real deck put him at 48% of 120 (the
broken deck's Lava-heavy rotation measured 54%); with the pencil cap, Natural Twenty 12 and Hellfire Rain 14: **60% of 200**
(seeds 12345 / 777 / 4242 / 9001 / 31337: 65 / 53 / 60 / 63 / 60), plan band 55-62%; ~14 rounds, phase 3 in 72%, CAUGHT in
30% of wins, falls 2.2, pencil 32, Rulings 2.1 and Rigged Dice 2.7 a fight, 0 timeouts. HP is a weak lever (330 / 340 / 360:
51 / 53 / 48% of 120), Rulings +1 and `masterHint` 45 changed nothing (AutoPlay uses ~2 Rulings and rarely chips a die).
The Radio Edit's cost (goats author sims, the same seeds with and without the start cameo, 2 × 60 fights): 84/120 either
way, 0 points (target ≤ 3).

Verified as built (no change needed): one live Round Cheat and at most one snap a round in every real fight; every cheat
log line ends "Reason: <reason>."; announced a whole round ahead with its chip, zones and threatAt; R9 with the real Slate on
either chair, alone, or a downed hero on a chair: nobody moves (`DD.Act.swap` without force; `isImmovable` before the
teleport); R8 prices the swap move at 2 AP (owner's suite); R11 refuses real signatures through E13 and AutoPlay never fires
one; the Radio Edit at the real goats door picks the §15.1 skill (Bling Throw L2 over Gold-Plated Fireball L2 on L.dmg; Slate's
Personal Space with Basanos's Transform and Ellaria's corgi in the party; Sparrow's Hemoglob) and the skill is never used
all fight; CAUGHT reachable (6 of 24 real fights); the floor never drops the core or A2 and every drop is marked a round
ahead; the dm.js cut-off only while `campaignGoesOn`; named bark #17 and every named line only with that hero in the fight;
pronouns; determinism.

Owner requests in my files: the RULES request to C5 (the twist's banner / bubble / `then`, and E13 `modifyUse` for the
Radio Edit and R11) is in place; the wave-0 contract requests to C5 (R9 without force + the `isImmovable` check, R8's
`Math.max(m.ap, 2)`, zones in `state.data.zones`, the env-kill and sulk triggers, The Floor Is Lava's `onRemove`) are in
place and now covered with real heroes.

Left for others (also in the report): RULES — `combat.js rollEntry` has the same `s.rng.float()` (NaN) as its initiative
tie-break since v2, so equal totals fall back to the insertion order, not a coin flip; the twist's narration ("The table
shakes …") logs after Svammiel's line because `then` runs after the line (a `before` hook, or `then` ordering, would match
plan §2.1's order). HUD — E7 is not in yet (cameo cheat chips show a doubled icon; no 😈 badge or "Next round" style).
AUTOPLAY — `objectValue` (boss-league.md's request) keeps CAUGHT at ~30% of wins (plan ≥ 60%). Integrator / BAL — the
campaign band (80-85% at ~6.1) needs `sim.js start=4`, not there yet.

Final full run after the review (Nov 15): `bash tools/test.sh` PASS — 1227 suites, 143,159 assertions, 0 failures (the
boss_svammiel suite file now holds 21 suites: the four "V3 review" regressions above plus the owners' 17).

## QA fixes (Nov 17) — QA FIXER, content cluster
The QA findings of the act-4 content cluster (FIGHTS-01..11, flow-1/3/4/5, voice-1..8, HERO-2/4/6/7), each reproduced on
the current files (by a regression assertion that fails on the old code, or by reading the code where the finding is a
text), fixed most severe first. Files: `js/data/bosses/svammiel.js`, `dm.js`, `goats.js`, `league.js`, `gardener.js`,
`galbraith.js`, `js/data/svammiel_lines.js`, `js/data/heroes/benedick.js`; suites in `tests/content/boss_svammiel.js`
(four new "QA" suites, the twist suite extended), `boss_goats.js` (two), `boss_league.js`, `boss_gardener.js`,
`boss_galbraith.js`, `boss_coven.js`, `svammiel_lines.js`, `hero_benedick.js` (one each), `tests/balance_tests.js` (the
Master Die pin).

Fixed (Svammiel's file unless named):
1. **FIGHTS-01 (major) — I Go Twice wind-ups landed before most heroes could answer.** A wind-up made at his first entry
   landed at his second entry the same round. Now every Floor Collapse / Hellfire Rain waits `windTurns(st, u)` of his
   turns: the order walked forward the way the engine counts a wind-up down (a turn of his counts only after a hero turn
   started, `ai.js heroWindow`), until every hero-side unit had a turn; an entry not rolled yet (phase 2 starts next
   round) is assumed first, so it never lands early. In phase 1 / 3 (one entry) that is 1, as before. The descs say
   "on his first turn after every hero has had one"; the engine's own log says "lands in 2 of Svammiel's turns". Suite
   "QA FIGHTS-01" plays six order shapes (his second entry after one hero, after two, adjacent, last, ...).
2. **FIGHTS-02 (major) — one panel drop made a hero fall two or three times.** `dropPanels(F, ids)` voids every tile of
   the drop before anyone falls, then sets each tile (each unit on it falls once and climbs out on a panel that stays);
   No More Floor drops its two panels together (a hero on one never climbs onto the other). Falls are counted once per
   hero. Suite "QA FIGHTS-02": a hero alone on every tile of six panels, three heroes on one panel, two neighbouring
   outer panels.
3. **FIGHTS-03 — a one-round cheat read "(all fight)".** The live chip is `turns: 1` ("1 round left"); its end-of-round
   effect runs from the chip's `onRemove` (the engine ticks rules before `onRoundEnd`), so the log reads the effect, then
   "Rule ended". CAUGHT and `force` cancel the cheat before removing the chip.
4. **FIGHTS-05 — announcements said "next round" two rounds early.** The draw, the activation and the start-of-round
   effects all happen at round start now (round 2's as round 1 starts), so a line is printed in the round it talks about;
   the "Next round" chip, the banner and the log name the round by number (`aheadDescOf`: "The marked panel turns to
   lava at the end of round 5 and cools at the end of round 6.", Skill Ban "... is banned in round 4: it is on cooldown
   through <hero>'s turn that round."). The DM's counter for an in-round cheat (Lava, Bonus Action, Tilt, Panel Swap,
   Moving Costs Extra, New Seating Chart: `whisper: 'live'`) is whispered as its round starts; the others at the
   announcement, reworded so none says "this round" early (No Healing, No Signatures, Hype Confiscated).
5. **FIGHTS-06 — the Coven's Floor Is Lava hurt the hags.** The cameo cheat's rule spares any `coven`-tagged unit on its
   patch (`modifyIncomingDamage` for the lava's terrain hit, `modifyStatus` for its Burn), with an FX line and a log line
   ("Svammiel's lava knows its friends.", once). Desc: "The patch on the path to the cauldron is lava until the end of
   round 3. Hags don't burn." (88 characters); the DM's counter says so.
6. **FIGHTS-07 — snap cheats never happened.** `N.fudgeFloor` 1: every new phase deals him at least one Fudge token,
   however many Rigged Dice broke (the Fudge status and the Rigged Die desc say so). `snapMin` stays 20 (a big hit).
7. **FIGHTS-08 — 6-HP Master Dice made CAUGHT a formality.** `N.masterHp` 6 -> 12 (the review's number; the plan had
   20). AutoPlay's two-hit `objectValue` stays a RULES / AUTOPLAY request (below).
8. **FIGHTS-09 (goats.js) — the bear could act with no notice.** When his rolled place next round comes before a hero
   who hasn't had a turn since he walked in, he gets the status Mic Check (1 turn): his first turn is a mic check (a
   line, no action). Fixed initiative modes put a joiner last: never.
9. **FIGHTS-10 (league.js)** — The Theme Song narrates `league_song` only when it hit somebody, else the new
   `league_song_whiff` pool.
10. **FIGHTS-11** — That's a 1 Now (Galbraith's door) removes its chip once spent.
11. **flow-1 (dm.js)** — while the twist cuts the DM off, his `barks.death` pool is empty (a getter) and `onDeath` bubbles
    the cut line itself: nothing on screen finishes his sentence. With `DD.finalAct()` 3 unchanged.
12. **flow-3** — the finale drops `banner: false`: Combat.start shows "Svammiel" / "The Floor Boss" (Deviation 23).
13. **flow-4** — the table shakes before his line: dm.js's `onDeath` calls `DD.BossSvammiel.twistShake(state)` (the
    moment the shake cuts the DM off; it logs only when the twist will play: act 4 follows, cameos on, the pool there),
    the entrance's extras log it only if that didn't happen. Order: the DM's cut line, the shake, Svammiel's line, "Oh
    no. That's my DM." (each once).
14. **flow-5** — the kids'-table DM object has `codex: true` (the Hall lists him with Svammiel's group).
15. **voice-1 (svammiel_lines.js)** — "Only the first big hit on him this fight turns into a 1. ...".
16. **voice-2 (goats.js)** — with Billy gone the bear enters with "Who woke me? ...Ah. A verse needs finishing." (never
    "It's a feature, William." to nobody).
17. **voice-3 (gardener.js)** — "[SCANNING] Weeds detected. Scheduling removal." (no party size); a lint over every
    act-4 bark and narration pool.
18. **voice-4** — Skill Ban's "radio edit" callback plays only when run memory (`run.flags.cameo.cheats`) shows the Radio
    Edit landed this run.
19. **voice-5 (galbraith.js)** — "A spotlight finds Galbraith, now a floating skull in a crown. He bows ...".
20. **voice-6** — "Svammiel rolls an honest 1. Everyone saw it. He asks the floor to swallow him. The floor, for once,
    says no."
21. **voice-7** — every CAUGHT text reads `N.caught` (`caughtText()`).
22. **voice-8 (goats.js; a lead / user call, done as the hint suggests)** — Syllamin: "... Bold.|Strum it, small fry.
    We'll eat the strings when the song gets old." (no jab at his mother); Marbles: "Remember us, Marbles? No? Don't
    worry. We'll remind you. LOUDLY." (forgetful, never forgettable). The addendum's lines, softened to its own risk-7
    rule; the lead may restore them.
23. **HERO-2 (benedick.js)** — the passive, the surface and the tip name the exemption: "Grounded foes, bosses and
    spiders aside, ..." (34 words), "(not bosses or spiders)", "any grounded foe (not a boss or a spider)". Exact today:
    the only root-proof foe is the Cellar Spider and every non-boss spider is root-proof (a suite pins both).
24. **HERO-4 (benedick.js)** — a hit on his shell pops "halved" (an `onTakeDamage` on his passive; never in a dry run).
25. **HERO-6 (benedick.js)** — his `move` / `kill` barks are getters on the form: the snail's lines, or the Dragonsnail's
    ALL-CAPS lines (`DD.Benedick.FORM_BARKS`, naming nobody).
26. **HERO-7 (goats.js)** — the goats' Benedick bar: "We dropped this track in the spring. He made the remix.
    Technically." ("last Tuesday" stays Svammiel's).

### Deviations (QA, Nov 17)
21. **Wind-ups wait for every hero** (FIGHTS-01): `opts.turns` from `windTurns`, not the plan's "next turn" (a boss
    with two entries made "next turn" land before most of the party could move).
22. **Round Cheats are drawn, announced and activated at round start** (FIGHTS-05; Deviation 4 amended): the notice is
    the same whole round; the texts name rounds by number; the DM whispers in-round counters as the round starts.
23. **The finale shows its boss banner** (flow-3): `banner: false` dropped (plan §3.0.1's "the start cameo shows the
    opponent" can't on his own board, where the cameo is a bark).
24. **Fudge floor 1 a phase** (FIGHTS-07) and **Master Die 12 HP** (FIGHTS-08, back from BAL's 6).
25. **The cameo lava spares the Coven** (FIGHTS-06): its desc gains "Hags don't burn."

### Requests (QA, Nov 17)
- **RULES / AUTOPLAY (`autoplay.js objectValue`)**: a hit that doesn't break a hinted object scores `dmg x 0.5`, so
  AutoPlay rarely chips the 12-HP Master Dice (FIGHTS-08 restored them for humans). Score a partial hit on a hinted
  object as a share of its hint (e.g. `hint x dmg / maxHp`).
- **HUD (optional)**: a live round cheat now has `turns: 1`; its chip footer reads "1 round left" (fine). "This round
  only" would read better for a `cheat` rule with `turns: 1`.
- **RULES (optional)**: an engine bark-key prefix per form (`unit.barkForm`) would replace Benedick's getters (HERO-6),
  and a cameo trigger `before` callback would let the twist's shake live in svammiel.js alone (flow-4).
- **Lead**: voice-8 changed two of the goats addendum's lines (above); restore them if the user prefers the originals.

### Numbers (QA, Nov 17)
Paired act-4-alone sims on the audit's seeds 16000-16099 (details: docs/notes/balance.md "QA fixes (Nov 17)"): Svammiel 56% ->
**71%** (falls 1.8 -> 0.9, downs 4.5 -> 4.4, rounds 12.5 -> 13.7, CAUGHT 82% -> 41% of his wins, snaps 0.16 -> 0.28), doors 93.4% ->
92.8% (the Coven 95.3% -> 91.7%, the goats unchanged); 0 errors, 0 warnings. No balance row moved: his campaign band
(80-85%) now needs BAL's `encounters.boss_svammiel` row raised (request in balance.md).

### Tests (QA, Nov 17)
Iterated with `tools/test.sh "suite=<x>&isolate=<files>"`; final full `bash tools/test.sh`: **PASS — 1294 suites, 149,729
assertions, 0 failures, 0 "Error in" lines** (`.tmp/qafix-content/test_full2.txt`).

## V3.1 polish (Nov 18) — heal:polish (the release gate's leftovers; summary in docs/notes/v3-digest.md §8)
- **The Radio Edit never bleeps a skill that heals** (the audit's request, D9): `healsWith(def, L, user)` skips kind
  `'heal'`, a `'heal'` / `'drain'` tag, any level field with "heal" in its name worth > 0 at the skill's level (`L.heal`,
  or a rider such as `L.selfHeal` / `L.healOnKill`), or the def's own `heals` flag (true, or `(L, user) → truthy`) for a
  heal its fields don't name. Read from the def, never a list of ids: a heal the healing pass adds is skipped too. The
  pick is otherwise unchanged. `DD.BossSvammiel.healsWith` is exposed for the suites.
- **The twist's order in the debug sandbox** (`encounter=boss_dm&twist=1`, the DM alive): the twist trigger's `keyOf`
  calls `twistShake` as the entrance starts, so "The table shakes…" comes first there too; in a run the DM's death
  already shook it (dm.js) and the call is a no-op. This is the flow-4 `before` callback without an engine change.
- **CAUGHT** (AutoPlay `objectValue`, RULES' file): a chip of a Master Die is now priced as progress toward the break.
  Act 4 alone (seeds 21000-21099): CAUGHT 41% → 75% of his wins, Master Dice broken 1.43 → 2.22 a fight, Svammiel
  72% → 81%. His campaign row is BAL's lever.
- Tests: `boss_svammiel: the Radio Edit never bleeps a skill that heals …` (new), the twist suite's sandbox case.
