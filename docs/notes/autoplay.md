# AUTOPLAY notes

## v2 requests — barrels, heals that revive, flyers and per-unit hazards (ENGINE role)

Rules: `docs/notes/rules.md` "v2 requests — …". What changed in `js/engine/autoplay.js`:

- **Barrels**: validTargets now lists volatile objects for single-target attacks, so the quick pass sees them; their
  quick value is `blastValue(ctx, tile)`: one dry run per barrel and decision (from the actor's real tile, on other
  dice) of `destroyObject` credited to the actor — foes' damage + Block × 0.5 + (15 + their threat) per kill, − allies'
  damage × 1.5 − 40 per ally down, − 60 for a protected object lost, ±100 / 300 for a won / lost fight. The exact pass
  replays the real use (`resolveSkill` detonates), so a shot that would hurt the actor or its friends is caught there.
  The adjacent Smash interaction is unchanged (objective objects only).
- **Heals aimed at a downed ally**: a revive-capable target (a `downedAlly` skill or, v2, a heal `revivesWith`) is
  worth +20 in the quick pass only when `safeToRevive(tm, ally, hp)` (the Help Up check, now with the heal's HP), else
  +2; `simGain` adds `REVIVE_GAIN` (12) for a revived ally (`diff.perUnit[id].revived`) when it is safe; the danger it
  is in after the run counts through the allies' danger as before. Help Up and the rescue walk wait for an ally that a
  ready heal can get up from where the unit stands (`healReviveReach`: only heals whose preview says "UP!", so content
  that skips downed targets doesn't block Help Up).
- **Flyers**: `bestHint` never offers stepping on a plate to a flyer, and `hintedTiles` (approach goals) skips
  step-only objects (no interaction, not smashable) for flyers: it can't press them.
- **Per-unit hazards**: walks, danger and approach fields read `DD.Grid.hazardAt` / `hazardDamage`, now per unit
  (flyers, immunities); `surfaceGain` counts a laid-down hazard surface only for the units it can hurt
  (`DD.Grid.surfaceHazard`). Closes the open request "fire treated as a hazard by Pebbles".
- Suites: `autoplay: v2 — it shoots the barrel when the blast is worth more, never into its friends`, `… a heal aimed at a
  downed ally gets it up from range (and Help Up waits for it)`, `… a flyer never walks onto a plate to press it; a
  walker does`, `… lava is no hazard for a fireproof hero or a flyer`. Mutation-checked: disabling `healReviveReach` or
  the flyer plate checks fails them.
- **Review** (`docs/notes/rules.md` "v2 requests review"): pushing a foe next to a drop is worth the +10 quick / +1 exact
  bonus only when the drop can hurt that foe (`DD.Grid.isEdge(x, y, foe)`: never a flyer, lava never a fireproof one);
  `walkSig` and `walkGrid` read `DD.Grid.isFlying` (status flight) instead of `flags.flying`. Known: the quick value
  of a melee barrel whack is taken from the actor's current tile (it ignores the blast on the tile it would whack from);
  the exact pass replays it.

## v2 attacks of opportunity + reach-aware enemies (ENGINE AoO role)

Engine rule and AI targeting: `docs/notes/rules.md` "v2 — attacks of opportunity + reach-aware targeting". What changed
in `js/engine/autoplay.js` (and why):

- **The enemy model follows the new AI** (`targetScore(tm, src, u, est, hp, pos)`): the victim weights now use the AI's
  own formula, `DD.AI.targetBonus(style, { kill, hurt, engaged, thr, maxHp, hero })` — engaged foes first for most
  styles (a victim standing next to the enemy), threat and damage, kills +5/+7, divers (`assassin` / `skirmisher`) go
  for kills, the wounded and the squishy. Each source carries `style` and `leave` = what walking away from the
  hero-side units next to it costs it in attacks of opportunity (`DD.AI.aooCost` over the heroes that would strike:
  `DD.Act.opportunityOf(hero, enemy)`; Infinity when they would drop it). A victim it can only reach by walking
  (`hitsFromHere` false, not adjacent) loses `leave` from its score (and is dropped at Infinity), and its share of the
  "it may go for anyone in reach" mix is ×0.3. So **an enemy engaged with a melee hero is expected to stick to it**:
  standing next to an enemy shields the backline (body-blocking), and once the hero's reaction is spent
  (`oppRound`), the model knows nothing holds the enemy any more. `AP.threats()` entries report `leave`.
- **Walks are priced with the attacks of opportunity they provoke**: `makeCtx` positions carry `provokes` from
  `Combat.reachable` (whose paths already provoke as few as possible); `walkDamage` adds each provoker's estimated hit
  (`DD.AI.opportunityDmg`), `walkCost` adds 1.5 per attack (riders, a walk cut short) and the down cost when the hits
  (after Block) would drop the hero. Every move-taking candidate uses it: (move +) skill options (quick and exact),
  plain moves, approach moves, rescue walks (their lethality check too).
- **Hit and run is not free next to a brute**: `escapeCost(ctx, pos, ap)` (attack, then step to the safest tile) adds
  `leaveCost(ctx, pos)` — the attacks of opportunity of the enemies next to `pos` (stepping off a tile leaves the reach
  of everyone next to it).
- **Teleports / dashes to disengage** fall out of the above: their exact dry runs move the hero without provoking, so a
  hero engaged by deadly melee foes Blinks rather than walks (suite below).
- **Body-blocking candidates**: `bestMove` recomputes the allies' danger for up to MOVE_OTHERS (4) extra tiles next to
  an enemy that threatens the others (`src.threat > 2`), besides the best 4 and the protect-guard tiles.
- `TARGET_MIX` per victim (`mw`): Z / M sums replace the plain victim count (`src.M`), in `threatModel`, `exposure`,
  `othersCost` and `AP.threats`.

Tests (`tests/autoplay_tests.js`, 3 new suites, mutation-checked: without the AoO walk cost the first two fail, without
the model's disengage cost / engaged formula the model suite fails):
- `autoplay: v2 attacks of opportunity — the enemy model knows engaged foes stick and pay to walk past a melee hero`
  (a grunt next to the knight: the knight's odds > 0.7, the wounded mage's < 0.25, `leave` > 9; the knight's reaction
  spent → the mage is the likely target; not engaged at all → the kill).
- `… — it does not walk away from a melee foe carelessly, it Blinks out` (a healthy mage next to a grunt fights from
  where she stands; a wounded mage between a rooted brute and a rooted grunt, every walk provoking both lethally,
  Blinks out without provoking anything).
- `… — the knight engages the grunt heading for the wounded cleric (body-blocking)` (premise: left alone the grunt
  walks up and downs the cleric; with AutoPlay the knight steps next to it and the engaged grunt sticks to him).

Measurements: act-1 campaign sims, the same content with the engine before / after this pass (rules.md "Content
suites this changes"): 2 × 120 runs, clears 50% → 52%, normal-fight downs 0.24 → 0.22 a fight; with the new engine and
the pre-pass AutoPlay (`.tmp/aoo/sim_oldap.html`) 40 runs gave the same boss win rate as with this one (38% / 38%, a
noisy small sample), so the difficulty shift comes from the rule, not from AutoPlay. Full campaign (12 runs): no errors,
warnings or timeouts.

Known issues: the model prices only the disengage cost from where the enemy stands now (not attacks of opportunity
deeper in its walk); `walkFrom` (the escape walk) ignores attacks of opportunity on the way (only those of the tile it
leaves); the HUD threat shading (`AI.threatMap`) still ignores pins.

## v2 — AUTOPLAY V2 (initiative order, no telegraphs, no Guard)

Files (mine): `js/engine/autoplay.js`, `tests/autoplay_tests.js` (29 suites `autoplay: …`), this file. No other file
touched. Scratch (not shipped): `.tmp/apv2/` — `autoplay_before.js` (the ENGINE V2 port this pass started from),
`sim.js` + `sim.html` / `simbefore.html` (integrate's whole-campaign harness + a per-fight-kind summary: wins, party HP
lost, damage taken, downs; before = the same page with `autoplay_before.js` loaded over the shipped file), `page.sh`,
`perf.js` + `perf.html` / `perfbefore.html` + `run.sh` (real-time decision timing), `test_before.html` +
`test_page.sh` (any suite against the before AutoPlay), `probe.*` (traced scenes), `runs/` (outputs).

### Summary

AutoPlay plays v2 one hero turn at a time in initiative order (the hero, then the summons acting on its turn) and reads
the board like a player who knows the turn order and has watched the enemies — it never runs an enemy planner and never
sees a telegraph that is not there.

- **Horizon and turn plan** (`turnPlan`, `AP.turnPlan()`): who acts between now and the current owner's next turn, in
  initiative order — the rest of this round, then next round's turns before the owner's slot, joiners merged by their
  roll like the engine does (a unit spawned now acts only if its slot comes before ours), `turnsPerRound` = several
  turns, summons on their owner's turn. Every hero-side unit gets its *next own turn* in that list.
- **Danger without telegraphs** (`threatModel`, `exposure`): for every AI enemy and each of its turns in the horizon
  (a stun-like / sheep loses the first): where it can strike from any tile its walk reaches (a real walk: walls, units
  in the way, heights; single-target shots need range, **line of sight** and a straight line when the skill says so;
  areas spread past cover), with its damaging skills that are ready then (cooldowns, charges, Silence); **whom it will
  likely pick**: a soft choice modelled on the AI's own scoring — a kill first (+12, heroes +18), then the wounded, then
  the most damage after armor — mixed with ¼ "anyone it can reach"; taunt = the taunter only; protect objectives = the
  object competes for its attention with its object-hurting skills; and the **expected damage** after the victim's
  armor, Vulnerable, Marked, resists. Boss wind-ups land at the start of their owner's turn in the plan (fixed, self and
  tracked tiles as before); `threatAt` auras, hazards, Burn and Poison add certain damage.
- **Turn-order weights**: a hit counts in full if the enemy acts before the victim's own next turn (for the deciding
  unit: always), else ×0.35 (`RESPOND`: the victim gets to step away or deal with it first; ×0.7 when rooted, ×1 when
  it will lose its turn). Every ally acting before an enemy that could walk up and hurt it lowers that enemy's turn by
  up to 20% (`ALLY_FIRST`, scaled by twice its best hit against the enemy's HP + Block; floor 0.5).
- **Odds, not averages** (`lossOf`): per unit, the independent chances of every hit go through a small dynamic program
  over the damage (after its Block) → the exact expected HP lost and the **odds of going down**. Cost = riders + HP ×
  1.25 (summons 0.8) + P(down) × down cost (20, +25 on a third down, +60 for the last hero standing, 150 for a protected
  unit). Protected objects: 2.5 per HP + 120 × the odds of losing them.
- **Learned hit rates** (`hitsPerTurn`, `AP.hitsPerTurn(u)`): per fight, AutoPlay watches each AI unit's turns (alone
  on its turn, no wind-up landing) and measures the HP + Block its foes lost in units of its best single hit on each.
  An enemy seen dealing two or three hits a turn (the Rat King's tails + pile + gavel, an AoE across two heroes) is
  then expected to do so again (average with a prior of 1, capped at 4). Fair: it is what the player saw happen.
- **What that buys** (all through the same `total = gain + FP + (D0 − D1)` ranking, dry runs unchanged): killing,
  stunning, rooting, pushing, taunting the enemy that acts next (before an ally can) saves the most; Block / heals /
  revives go to the allies hit before they can act; a downed ally is helped up into a wind-up only when her own turn
  comes first (she then walks out herself); the deciding hero steps out of the reach of the enemies acting next rather
  than of those an ally may stop first; cover against shooters works (LOS); standing in an enemy's way or drawing its
  attention away from a wounded ally counts (dry runs, and the best 4 plain moves get their allies' danger recomputed).
- **Kept from phase 4**: the exact-preview scoring (dry runs on other dice, expected values), utility / consumable /
  signature valuation, puzzle hints, Help Up / rescue / objective smashes, walking-distance approach, the lava rule,
  the stall breaker (caution) and `runBattle` termination.
- **Puzzles priced like skills**: a hinted interaction whose callback is the registered object def's (`dryable`: no
  per-instance `onInteract` / `interact`, which may close over outside state) gets a dry run, so what it does to the
  danger counts (the last Player's Handbook cancels the DM's 60-damage doom on every hero). Hinted interactions two
  moves away (hint ≥ 10, AP for two moves + the interaction) are offered too, but only when that dry run shows the
  interaction itself takes ≥ 40 danger off the party (an emergency detour; Lich-style bookshelf lookups are not worth
  walking two moves for). The first move is made and the unit decides again.
- **Stalemates**: the breaker now counts rounds in which the party wore nothing down (no enemy HP lost, no enemy
  fell, no damageable object lost HP) instead of rounds without any HP change, so a last hero kiting a boss it never
  hits engages after round 6 + 3 such rounds; survive objectives keep only the round schedule.
- **Fixed on the way**: the hit-and-run escape step walked through walls (Manhattan): it is a real walk now
  (`walkFrom`, a tiny Dijkstra over a per-decision passability grid), so a shooter no longer plans "shoot, then hide"
  behind a wall it cannot reach; a plain move no longer banks "progress toward the fight" when its plan is to walk back
  to cover (no more out-and-back moves); a skill whose quick estimate promised something its exact previews never
  delivered (e.g. `cor_bargain` with nothing to bargain) no longer counts as leftover-AP potential, which had a lone
  Corelos walking back and forth between two tiles for twenty rounds; plain moves onto the tiles next to a protected
  object always get the allies' (and the object's) danger recomputed (standing guard).

### Changes

- `js/engine/autoplay.js`: new danger model (turn plan, per-enemy reach with walls / LOS / ranges / areas, target
  choice, turn-order weights, damage odds, learned hit rates, protect objects), order-aware quick scores (a kill or stun
  is also worth the damage that enemy would deal before our next turn), real-walk escapes, move candidates with the
  allies' danger (best 4 + guard tiles), revive by turn order, dud skills out of the leftover-AP potential, dry-run
  puzzle interactions + emergency two-move detours, progress-based stall breaker. Debug switches (default on):
  `AP.learn`, `AP.hint2`, `AP.hintDry` (false disables learned hit rates / two-move detours / hint dry runs). Removed:
  the `DD.AI.reachOf`-based shared reach term (the HUD keeps using `AI.reachOf` / `AI.threatMap`).
- `tests/autoplay_tests.js`: 29 suites (16 ported + 13 new; 3 ported ones updated to v2 rules — wind-up damage is
  reported after armor, Help Up now depends on the downed ally's turn, the stall breaker counts progress). New: cover
  vs an archer (LOS), likely target (kill > wounded > damage; taunt), exact odds, the turn plan (rest of round / next
  round / joiners / stunned / two turns a round), finish the foe that acts next, stun the foe that acts before the ally
  it threatens, Block the ally hit before its turn, step away from the enemy acting next (each in both initiative
  orders, so the choice flips with the order), learned hit rates, a rooted mage Blinks out (utility exact previews),
  guarding a protected keg, summons act on their owner's turn only, and "never runs an enemy planner" (spies on
  DD.AI). 12 of the new suites fail with the AutoPlay this pass started from (checked with `.tmp/apv2/test_page.sh`).

### API (additive; ARCHITECTURE §5.7's takeTurn / runBattle unchanged)

```
DD.AutoPlay.incomingAt(unit, x, y) → { dmg (expected, after armor), pierce, hits (expected number), ride, aura,
                                       down (odds of going down, after Block), loss (expected HP lost), list: [{ p, d }] }
                                     // as if unit were deciding now (every enemy turn up to the owner's next turn)
DD.AutoPlay.incomingAsAlly(unit, x, y, actor?) → same, weighed by unit's own turn order (how the actor sees it)
DD.AutoPlay.turnPlan() → { known, L, ownerId, seqs: { unitId: [seq] }, next: { unitId: seq } }
DD.AutoPlay.threats(actor?) → [{ id, defId, threat, turns: [{ q, sig }], victims: { unitId: { p, est } }, obj, hitsPerTurn }]
DD.AutoPlay.danger(actor?) → { unitId: cost }      DD.AutoPlay.hitsPerTurn(unit) → 1..4
DD.AutoPlay.lossOf(hits [{ p, d }], flat, pierce, block, hp) → { exp, down }
kept: auraAt, distField, stall, trace / log, measure / samples
```

### Deviations

- `incomingAt(...).dmg` is now after the victim's armor (it was before armor for wind-ups); Block is not subtracted in
  `dmg` (it is in `down` / `loss`).
- AutoPlay subscribes to `turn:start` / `turn:end` via `DD.afterLoad` to watch enemy turns (read-only; nothing is
  emitted during dry runs).
- Puzzle interactions on registered objects are now dry-run (`Combat.interact` inside `Targeting.simulate`). Content
  rule for object defs with `interact.fn` + an `autoplay` hint: change only the state you are handed (the object, the
  units, `DD.Act`), never module-level variables — per-instance callbacks are never simulated.
- The reach estimate is AutoPlay's own (walls, LOS, units in the way); the engine's `AI.reachOf` / `AI.threatMap`
  (HUD shading) still ignore walls and sight past the walk.

### Requests

- **Boss owners (bosses-act1 / act2 / dm)**: the Rat King's planner does tails + Rat Pile + 1–2 gavels in one turn and
  Grimble several actions too (compat `addIntent` = now). AutoPlay learns that after the first turn, but a player reading
  the inspect panel cannot see it beforehand: either make each turn one action (+ a wind-up) as DESIGN §6/§9 suggest,
  or declare the extra hits with `hooks.threatAt`. **Puzzle hints that never fire in v2**: Dr. Iris's `mirrorHint`
  (beholder.js) keeps only `iris_eye_beam` intents with `!(it.delay > 0)`, and the DM's `divertable` (dm.js) only
  `dm_railroad` intents with `!(i.delay > 0)` — but every v2 wind-up has `delay = turnsLeft ≥ 1` while pending (and
  instant beams leave no intent at all), so both return 0: AutoPlay never turns a mirror (0 reflections in every Iris
  sim, before and after this pass) and never pulls the Track Switch. Test `it.windup && it.turnsLeft <= 1` (lands at
  the boss's next turn start) instead, or make the beams wind-ups.
- **HUD / ENGINE (reviewer)**: the HUD threat shading (`AI.threatMap`) ignores walls and sight; `DD.AutoPlay.incomingAt`
  / `threats()` give LOS-aware per-tile numbers and target odds if the HUD wants them (pure queries).
- **META-UI / lead** (repeat of ENGINE V2's): `?autoplay=1` in `js/main.js` keys its loop on `st.round`; key it on
  `st.turn` so every hero turn of a round is played.
- **Lead (ARCHITECTURE §5.7)**: replace "Danger it reads (v2, no telegraphs): wind-ups (`DD.AI.windups` data), every AI
  enemy's `DD.AI.reachOf` (its best hit shared among the hero-side units it can reach) and `threatAt` auras." with
  "Danger it reads (v2, no telegraphs): the initiative order up to the current owner's next turn; for every AI enemy and
  each of its turns in it, where it can strike from its walk (walls, units in the way, line of sight, ranges and areas
  of its ready damaging skills), whom it will likely pick (kill > wounded > most damage; taunt; protected objects) and
  how many hits a turn it has been seen to deal in this fight; boss wind-ups; `threatAt` auras. A hit weighs less when
  its victim acts before the enemy (it can respond) or when allies acting first may stop the enemy; per unit, the odds
  of the HP lost and of going down are exact." and list the helpers `incomingAt(unit, x, y) → { dmg, pierce, hits, ride,
  aura, down, loss, list }`, `incomingAsAlly`, `turnPlan()`, `threats()`, `danger()`, `hitsPerTurn(unit)`, `lossOf()`.
- **Balance / content owners**: AutoPlay-calibrated bands (see Known issues) need re-measuring with this AutoPlay after
  the content pass; small-sample bands (3 or 8 fights) flip on noise.

### Measurements

Same code base and seeds; **before** = the ENGINE V2 port of AutoPlay this pass started from (`.tmp/apv2/
autoplay_before.js` loaded over the shipped file), **after** = this pass. Other areas were mid-conversion (content
still v1-shaped), so absolute numbers say more about the content than about AutoPlay; the deltas are the point.

Whole campaigns (`.tmp/apv2/page.sh sim|simbefore "seeds=N&from=S&diff=D"`; a copy of integrate's harness with random
4-hero parties of all 10 heroes, items, Blessings; it needed no change for v2 leveling — `DD.Run.levelQueue` /
`levelUpChoices` / `applyLevelChoice` still drive the one-hero-per-win level-ups — my copy only adds a per-fight-kind
summary; outputs in `.tmp/apv2/runs/before_*` and `final_*`):

| | normal 80 (seeds 300+) | brutal 30 (500+) | casual 20 (700+) |
|---|---|---|---|
| campaign wins | 9 (11%) → **17 (21%)** | 0 → 0 | 7 (35%) → **9 (45%)** |
| act 1 / 2 / 3 cleared (of entered) | 46 / 49 / 50% → **63 / 58 / 59%** | 23 / 14 / 0% → 27 / 38 / 0% | 55 / 73 / 88% → 75 / 60 / 100% |
| fights won (all kinds) | 87% → **92%** | 76% → 76% | 94% → 95% |
| boss fights won | 52% → **66%** | 28% → **38%** | 67% → **75%** |
| Rat King (act 1 killer) | 5/34 → **17/34** (1 of them a 30-round timeout) | 2/12 → 3/12 | 2/10 → 5/10 |
| other bosses | Grimble 32/46 → 33/46, Iris 4/14 → 8/21, Lich 14/16 → 21/23, DM 9/13 → 17/21 | Grimble 5/14 → 5/13, Lich 1/1 → 3/3 | Grimble 9/10 → 10/10, Iris 4/7 → 4/10, DM 7/8 → 9/9 |
| hero downs per fight | 1.2 → 1.1 (elites 1.3 → 0.7) | 1.9 → **1.4** | 1.0 → **0.6** |
| damage taken per fight | 49.1 → 51.7 (later, harder fights: avg level 2.1 → 2.3) | 59.8 → **56.1** | 40.4 → **37.1** |
| party HP lost per fight | 20% → 19% (bosses 62% → 52%) | 27% → 28% | 16% → 15% |
| permanent deaths | 5 → 5 | 1 → 0 | 2 → 0 |

The earlier 40-run batch (seeds 200+, before the hint / dud / stall work): wins 4 → 6, downs 486 → 354 (−27%),
normal-fight downs 0.9 → 0.5, damage taken per fight 50.1 → 47.1, permanent deaths 2 → 0. Campaign win counts are
noisy (runs diverge after the first different decision); per-fight numbers are the steadier signal.

Fixture-party / content sims from the test suites (more seeds than the suites' own bands; `test_page.sh` = before):

- Lich-tenstein (L7, 24 fights): 7/24 → **9/24**; with only the core model (before the puzzle work) 5/12 vs 0/12.
- Grimble (L4, 24): 5/24 → 6/24 · Rat King (L4, 24): 1/24 → **4/24** · Rat King with random real L2 parties (16):
  0/16 → **3/16** (King HP left 95 → 79 on average mid-pass, no timeouts now).
- The DM (real L10 parties, 16): 13/16 → 12/16, the doom fired in 2 → 4 fights; with the core model alone it had
  dropped to 7/16 (the third Handbook two moves away was never fetched) — the hint dry runs and emergency detours
  brought it back. Fixture party L10 (12): **0/12 → 3/12**.
- Dr. Iris (L7, 12): 0/12 → 0/12 (0 reflections both: her mirror hints are dead under v2, see Requests).
- Act 3 elites (9 each): Hoarder's Lair 4/9 → 4/9 (damage 450 → 411, downs 12.8 → 10.9), Very Dramatic Entrance
  8/9 → 9/9 (193 → 132, 2.6 → 0.7), Tax Season 3/9 → 6/9.
- Protect fights: Snack Heist 1/3 → 3/3 (the bowl lost 35 → 28 HP), Last Coffee 2/4 → 3/4 (the machine lost 95% →
  74% of its HP), Office Hours 3/4 → 4/4. Act-1 normal encounters (fixture L1-4): `a1_open_mic` 2/8 → passing.
- Perf scenes (below): 9 fights, wins 2 → 3, hero damage taken 1252 → 1095.

Decision time, real time (`.tmp/apv2/run.sh perf.html|perfbefore.html "seeds=9&turns=24"`: 12×12 academy board, 4 real
L5 heroes vs 8 act-2 enemies, rolled initiative, pillars / crate / barrel / mud; before → after, same machine load):

| | median | p90 | worst |
|---|---|---|---|
| per decision step | 2.6 → **2.6 ms** | 6.4 → 6.3 | 19.6 → 16.1 |
| per unit-turn (a hero or a summon) | 6.1 → **6.3 ms** | 14.1 → 13.1 | 34.9 → 24.4 |
| per hero turn (`takeTurn`) | 6.9 → **7.9 ms** | 16.4 → 15.0 | 34.9 → 28.5 |

(n = 584 steps / 251 unit-turns / 211 hero turns; repeated runs vary ±0.3 ms with machine load.) Whole test suite:
2m33 with the before AutoPlay vs 2m35–2m56 with this one on the same code base (machine load varies).

Full `tools/test.sh` on the same code base: **173 failing sections with the before AutoPlay → 159 with this one**
(vs 168 in ENGINE V2's baseline before other areas moved on); newly passing: my 12 new suites, `bosses_act2: lich
autoplay sims`, `enemies_act1: autoplay sims (normal …)`, `enemies_act3: AutoPlay sims — normal encounters`,
`hero_marwyn: AutoPlay battles, acts 1-2`; newly failing: `bosses_act1: grimble autoplay sims` and `rat king autoplay
sims` (both "the fight is winnable: 0/8" — 8-seed bands around a ~15–25% win rate; over 24 seeds they are 6/24 and
4/24 now vs 5/24 and 1/24 before, and they pass in a filtered run, the full run's other suites shift their dice).

### Known issues

1. **AutoPlay-calibrated bands in other areas' suites** (B, owners: content / balance): `bosses_act1` Grimble and Rat
   King "winnable 0/8" (noise, see above); still failing as before for content reasons: Dr. Iris (dead mirror hints),
   the DM's Track Switch (dead hint) and the fixture DM's "fight length" (17.8 rounds; the party now survives longer),
   `enemies_act3` `a3_intern_orientation` 0/3, `hero_syllamin` "AutoPlay heckles" (v1 redirect mechanics),
   `hero_marwyn` acts 2-3 "Marwyn acted". All are v1-calibrated; re-measure after the content pass.
2. A multi-action enemy surprises AutoPlay on its first turn (the learned hit rate needs one watched turn), and an
   enemy's AoE splash counts as one hit until it has been seen hitting several heroes.
3. Approximations: an enemy's second turn of a round (`turnsPerRound: 2`) reaches from where it stands now; the walk
   cache of one decision ignores terrain changed inside a dry run (rare); target choice is a model of the default
   planner, so custom planners can surprise (the Rat King's gavel always goes for the most hurt hero); allies acting
   first are assumed to maybe stop an enemy (`ALLY_FIRST`) without any coordination of who does it.
4. Two fights out of 796 hit the 30-round cap in the normal batch (one Rat King, one `a2_follow_the_lights`); the
   integrate harness counts a capped fight as a win (`timeout=victory`).
5. Protect fights stay hard: enemies acting before the party in round 1 reach the object at once (brutal Last Coffee
   1/4); AutoPlay guards and kills attackers but cannot undo an initiative roll.
6. Puzzle interactions with per-instance callbacks are never dry-run (by design, see Deviations), and an interaction
   two moves away is only fetched in an emergency (≥ 40 danger saved by the interaction itself).

## Phase 4 (v1) — AUTOPLAY FIDELITY (superseded where the v2 section above says so: no Guard, no telegraphs)

Files: `js/engine/autoplay.js` (rewritten), `tests/autoplay_tests.js` (new, 21 suites `autoplay: …`), and — surgically,
only to add `threatAt` hooks — `js/data/bosses/beholder.js` (Dr. Iris) and `js/data/bosses/lich.js` (Lich-tenstein).
Scratch (not shipped): `.tmp/autoplay/` — `sim.js`/`sim.html` (whole-campaign harness, integrate's + skill-usage /
never-used / signature tallies), `simold.html` (same with the original AutoPlay, `autoplay_orig.js`), `test_old.html` +
`test_old.sh` (any suite against the original AutoPlay), `perf.html` + `run.sh` (real-time decision timing), `probe*.js`
(traced scenes), `batches.sh` (before/after batches, one Chrome at a time), `runs/` (outputs).

### Summary

AutoPlay now plays like a careful human who reads the board: it ranks every candidate action by one damage-equivalent
number and never peeks at the real dice.

- **One number per candidate**: `total = gain + endValue(end tile, AP left) + my0 + (others0 − others1) − small costs`
  (ending the turn = Guard = 0; the best total above 0.5 is done).
  - **gain** (from an exact dry run): damage, kills (+15, bosses +25 more), heals (×1.5 on badly hurt allies), Block,
    statuses by kind (stun-likes 4 (+4 on bosses), Charm 5, Burn / Poison ×1.5 per stack, Vulnerable 3, Weak / Root 2,
    content debuffs 1.5+; buffs on friends: Empowered / Inspired from the friend's best hit, Haste 2.5, Regen, Thorns and
    retaliation buffs such as Hellish Rebuke by the hits coming at the holder), AP given to allies (3 per AP), cooldowns
    reset (Δcd + 1.5 when it is ready again), cleanses (2.5 per debuff), stripped enemy buffs, displacement (knocked off
    high ground, onto an edge or a hazard, foes pulled together when an ally has an area attack ready), hazard surfaces
    laid around foes (a Strut fire trail), summons (bulk + bite, more if it can act now, less when the fight is nearly
    won), objects and puzzle hints, Hype, a won / lost fight, skill `aiScore(ctx)` ×0.75 and `autoplayValue(ctx)`.
    Costs: cooldown ×0.3, the last charges, consumables (see below), signature reserve.
  - **Danger** (`threatModel` / `incomingAt` / `costOfInc`): what each hero-side unit loses before the next player
    phase — `self`/`ground` telegraphs per tile, tracked (`unit`) shots only where they still reach (range, line of
    sight, **`target.straight`**, not stealthed), splash of shots tracking an ally, **`threatAt` auras**, ending on a
    hazard, Burn / Poison stacks — after Block and the **Guard** the unit will make (2 per leftover AP; finished units
    Guard with what they kept, units yet to act are assumed to spend theirs), ×1.25 for heroes (their HP carries through
    the run), ×0.8 for summons, + a **rider cost** per telegraphed hit that Block does not stop (1, +1.5 for statuses /
    pulls / pushes, +5 for stun / sleep / freeze / charm), + a **down cost** (20, +25 on a hero's third down, +60 for the
    last hero standing, 150 for a protected unit; protected objects 2.5 per HP + 120 for losing them). Stunned /
    asleep / frozen / sheep / charmed enemies threaten nothing, silenced ones no spells, dazzled / confused ones half.
    D before (real state) vs after
    (inside the dry run) values kills of whoever is about to hit, stuns that cancel, taunts that redirect, pushes that
    move `self` attacks away, teleports and swaps out of the red, Smoke / stealth, Block.
  - **endValue** = the better of (a) staying: leftover-AP potential `FP` minus the danger of ending the turn there, and
    (b) **hit and run**: act with all but one move, then step to the safest tile within reach. `FP(tile, AP)` = 0.8 × AP ×
    (best quick value per AP from that tile − the Guard it gives up there), or after one more move. This is what makes
    it poke out from behind a pillar, attack, and step back, instead of hiding all turn or standing in a gaze.
- **Candidates**: Help Up, objective smashes and walks to a downed ally first (new: not while the ally lies in a
  telegraph that would drop it again — it gets up with ¼ HP and 0 AP, and a downed hero takes no damage); then every
  reachable tile ×
  usable skill × target gets a quick estimate (now with `aiScore` / `autoplayValue`), the best 8 + up to 2 signature
  options + the best 3 targets of every utility skill (no damage / heal numbers: moves, teleports, buffs, wards) + up to
  4 targets per consumable get an exact dry run; puzzle hints; plain moves (cover, or **progress toward the fight by
  walking distance** when nothing is in reach — 1 per tile, so it can close in over several moves when that is safe).
  The old one-move Manhattan-ish approach stays as a fallback (now a walking-distance flood fill for every goal: destroy
  targets, puzzle objects worth ≥ 10, tiles to attack a foe from with the unit's longest attack; healers don't charge).
- **Fair dice**: every dry run starts from other dice (a seed hashed from the real state + sample index; also passed as
  the engine's new `simulate(fn, { seed, record })`), never the real roll. When the run drew dice (`rec.draws`, a
  marked-uncertain run, or a `random` tag) it is replayed 3× and averaged (expected value).
- **Consumables** are saved for when they matter: cost 8 in ordinary fights, 5 in elite fights, 3 in boss fights, 4 when a
  hero is about to go down, ×0.6 with a full bag. Smoke Bombs, Energy Drinks, Liquid Courage, Antidotes are now valued
  through the same model (stealth vs tracked shots, AP, Empowered, cleanses).
- **Signatures** wait for a big moment: only when the dry run hits 2+ foes or a boss, affects 3+ allies, brings 2+
  units, saves the party ≥ 15 danger, or the fight is nearly over; minus a reserve (10, 4 with two foes left, 0 for the
  last foe or a boss under 35%).
- **Turn order**: heroes, then summons; up to 3 passes — a unit acts again if it gained AP (Encore, Energy Drink, Toast)
  or the board changed since it finished, and **summons that arrive ready act the same turn**.
- **Speed** (real time, `perf.html`: 12×12, 4 real L5 heroes vs 8 act-2 enemies, pillars / crate / barrel / mud): see
  "Measurements". Under the test harness (virtual time) timings are meaningless, so no suite asserts them.

### Changes

- `js/engine/autoplay.js`: rewritten scoring (above). Kept: puzzle hints (`autoplay` on objects, §5.7), Help Up first,
  objective smashes, `rescueMove` (walk to a downed ally), the lava rule (`walkCost`, now including the destination's
  entry damage), `busiestTargets` for thrown consumables, the Josiah revive estimate, `runBattle` termination.
  New inspection API: `DD.AutoPlay.incomingAt(unit, x, y)` → `{ dmg, pierce, hits, ride, aura }`,
  `DD.AutoPlay.auraAt(enemy, unit, x, y)` → `{ dmg, pierce }`, `DD.AutoPlay.distField(unit, goals, adjacent)`;
  `AP.measure` / `AP.samples { unit, step }` (decision times), `AP.trace = true | 'all'` / `AP.log` (decisions, and
  with 'all' every exactly-scored candidate with its estimate, total and gain).
- `js/data/bosses/beholder.js`: `iris_gaze` status `hooks.threatAt` → `gazeThreat(iris, hero, tile)`: the same reach,
  cover, X-ray and closing-time rules as `clinicalGaze`, `{ dmg, label: 'Clinical Gaze' }`; 0 for summons, stealthed
  heroes, cover, a stunned Iris. (Owner: bosses-act2. Pure; no other behaviour changed.)
- `js/data/bosses/lich.js`: `lich_late_fees` status `hooks.threatAt` → `interestThreat(lich, hero, st)`:
  `{ dmg: ceil(fees × ¾), label: 'Late Fees interest', ignoreBlock: true }` for every hero wherever it stands; 0 for
  summons, a pile of bones, waived fees. (Owner: bosses-act2. Pure; no other behaviour changed.)
- `tests/autoplay_tests.js` (already listed in `tests/manifest.js`): 21 suites. 18 of them fail on the original AutoPlay
  (checked with `.tmp/autoplay/test_old.sh "suite=autoplay: "`): Hellish Rebuke on the ally about to be mobbed (and not
  without telegraphs), Fabulous Strut out of a telegraph across mud, Encore! on an ally whose skills are on cooldown and
  the refreshed skill used the same turn, Fae Blink of a rooted ally out of a lethal telegraph, the Ol' Switcheroo with a
  corgi, Goblin Mode when rooted under tracking arrows, Dodge Roll out of the red (and not for nothing), Tactical
  Retreat of a walled-in hero, Power Nap when badly hurt with nothing to do, straight-line tracked shots, keeping AP for
  Guard when the hit would down it (and attacking when healthy), not helping up an ally lying in a lethal telegraph
  (and helping at once otherwise), walking around a wall, Clinical Gaze / Late Fees
  `threatAt` numbers (incl. the gaze dealing exactly what the hook said), stepping behind a pillar out of the gaze, a
  Smoke Bomb when swarmed by tracking shots (and not for one arrow), dice valued by expected value (a 1-in-1000 jackpot
  is never pulled even when the real next roll is the jackpot), a signature held vs one lone grunt and fired into a
  crowd, a ready corgi acting the turn it arrives, and two whole sandbox fights with real kits.

### Deviations

- ARCHITECTURE §5.7 only promises `takeTurn` / `runBattle` + puzzle hints; the extra API above is additive.
- `threatAt` results may carry `ignoreBlock: true` (Late Fees); callers that only read `dmg` are unaffected (the HUD
  pass already reads it). AutoPlay sums every enemy's `DD.Hooks.fire('threatAt', enemy, enemy, unit, tile)` (the last
  non-undefined source per enemy, as `fire` returns), treating throws and junk as 0.
- Guard is assumed to be 2 Block per leftover AP (the engine's new `modifyGuard` hook is not consulted: it is not a
  pure query).
- `canUse` reasons containing "target" are treated as "no target from this tile" (the skill may still be usable after
  a move); every other reason rules the skill out for the decision.

### Requests

- **Content owners / BALANCE — recalibrate the AutoPlay-calibrated bars** (they were measured with the old AutoPlay;
  the fixture party now plays them better, so they fail although nothing is broken). Full run at the end of this pass:
  see "Known issues" for the exact list and numbers. Options per bar: retune the encounter (BALANCE's job next), lower
  the bar, or count something AutoPlay cannot dodge. The two honesty suites only need more samples (more seeds / longer
  fights), and Marwyn's "acted" check a fight long enough for a 3-move tank.
- **RULES / ENGINE**: (1) a structured "no target here" reason from `Combat.canUse` (AutoPlay matches /target/i);
  (2) a pure `Combat.guardOf(unit, ap)` so AutoPlay can honour `modifyGuard`; (3) `AI.executeIntent` does not check
  `target.straight` for tracked shots (content does it in `execute`, AutoPlay's danger model now does); (4)
  `Grid.hazardAt` / `hazardDamage` are side-blind, so hero-side traps (d4s, runes) also look like hazards to heroes.
- **Content authors**: `autoplayValue(ctx)` is now honoured at full weight (`ctx.autoplay.preview` = the dry-run diff
  when scored exactly; called with a plain ctx in the quick pass). Worth adding where the payoff comes later than the
  dry run can see (e.g. Buga's Bribe and Pork Barrel, Corelos' contracts, setup skills). `aiScore` is honoured too
  (×1 quick, ×0.75 exact) — several hero aiScores (Encore +6, Taunt +3 per foe, Rally +3 per friend) are now live.
- **bosses-act2 (FYI)**: the two `threatAt` hooks above live in your files; keep them in sync if the gaze / interest
  rules change (`tests/autoplay_tests.js` checks the gaze against her real turn end).
- **Lead (docs)**: ARCHITECTURE §5.7 could list the `incomingAt` / `auraAt` / `distField` helpers and the
  `autoplayValue(ctx)` skill hook (§3.2).

### Measurements

Whole-campaign harness (`.tmp/autoplay/sim.html` = integrate's harness + skill tallies; random 4-hero parties of all
10 heroes, items and Blessings in play), the same seeds before (original AutoPlay, `simold.html`) and after; outputs in
`.tmp/autoplay/runs/simold_*` and `final_*`. Content as of 31 Oct ~19:00 (the engine's fair previews included).

| | normal 60 (seeds 200+) | brutal 40 (500+) | casual 30 (700+) |
|---|---|---|---|
| campaign wins | 92% → **100%** | 68% → **100%** | 100% → 100% |
| boss wins | Iris 28/32 → 32/32, Grimble 26/27 → 27/27, rest 100% | Iris 9/14 → 15/15, DM 27/32 → 40/40, Lich 23/25 → 25/25, Grimble 19/20 → 20/20 | all 100% |
| hero downs (permanent deaths) | 135 (0) → **12** (0) | 220 (1) → **39** (1) | 12 → 1 |
| downs to Clinical Gaze | 47 → 2 | 35 → 3 | 6 → 0 |
| party HP lost at Dr. Iris / Grimble / DM | 56% / 19% / 20% → 24% / 5% / 6% | 68% / 29% / 42% → 30% / 14% / 12% | 40% / 8% / 10% → 13% / 1% / 4% |
| skills never used (socketed ≥ 10 fights) | 13 → 3 | 9 → 0 | 8 → 3 |
| signatures per 100 hero-fights | 3.9 → 3.7 | 8.6 → 7.6 | 4.1 → 2.7 |
| consumables used | 184 → 352 | 107 → 239 | 78 → 165 |

- **Downs by cause** (normal, before → after): Dr. Iris status (gaze) 47 → 2, Rat Pile 17 → 0, Grimble's Garnish 9 → 0,
  eye beams 6 → 1, terrain 6 → 0, Imp Go Live! 6 → 0, DM Railroad 5 → 2, Grimble's Audit 5 → 0. Brutal: gaze 35 → 3,
  DM's TPK 19 → 0, fudged roll 17 → 4, eye beams 16 → 2, Railroad 15 → 1, Go Live! 14 → 5, Rat Pile 14 → 2, Audit 14 → 3.
- **Formerly never-used skills** (uses per socketed fight, normal before → after): `zar_rebuke` 0 → 0.9, `zar_strut` 0 →
  0.1 (a niche escape), `syl_encore` 0 → 1.0, `syl_fae_blink` 0 → 0.7, `ell_switcheroo` 0 → 0.8, `spa_goblinmode` 0 →
  1.1, `gen_dodge_roll` 0 → 0.6–1.2, `gen_tactical_retreat` 0 → 1.2–1.3, `gen_power_nap` 0–0.8 → 0–1.1 (situational),
  `buga_bribe` 0.1 → 1.0. Brutal: Encore 1.8, Goblin Mode 1.6, Tactical Retreat 1.9, Rebuke 1.2. Still unused: `jos_salts`
  (nobody stays down long enough to need it: 12 downs in 60 runs), Power Nap on Josiah / Corelos (healthy heroes).
- **Per hero** (brutal run wins before → after): Sparrow 44 → 100%, Slate 55 → 100%, Syllamin 56 → 100%, Buga 60 → 100%,
  Marwyn 60 → 100%, Zarathor 73, Ellaria 77, Marbles 79, Corelos 92, Josiah 93 → all 100%. Damage per fight (normal):
  Zarathor 69, Josiah 51, Marbles 50, Corelos 49, Syllamin 47, Ellaria 47 (incl. corgis 15), Sparrow 45, Buga 35, Slate
  34, Marwyn 26 (similar to before: AutoPlay mostly stopped taking damage, it did not start dealing much more).
- Signatures stay Hype-bound (kill-driven Hype, content-digest §4.3); the big-moment rule trims casual / brutal use a
  little (it no longer fires them on one lone minion).
- Fixture-party calibration suites, old → new AutoPlay (party HP lost or damage taken per fight): `a2_unpaid_internship`
  16% → 4%, `a2_bottomless_brunch` 15% → 8%, `a2_cub_scouts` 9% → 6%, `a2_rooftop_critics` 11% → 2%, `a2_office_hours`
  28% → 7%, `a2_mama_bear` 26% → 9%, `a3_self_help_seminar` 60 → 17, `a3_snack_heist` 17 → 2 (bowl 28 → 1 HP lost),
  `a3_very_dramatic_entrance` 87 → 22, `a3_tax_season` 136 → 94; act 1 `a1_union_meeting` 15 → 0, `a1_open_mic` 17 → 0;
  Grimble / Rat King / Lich-tenstein / Dr. Iris (fixture party) won 8/8, 8/8, 100%, 100%.
- **Decision time** (real time, `bash .tmp/autoplay/run.sh perf.html "seeds=12&rounds=5"`: 12×12 board, 4 real L5 heroes
  with 4 skills each vs 8 act-2 enemies, pillars, crate, barrel, mud): **per unit-turn median 4.5 ms, p90 9.3 ms, worst
  30.6 ms** (n = 315); per decision step median 1.7 ms, p90 5.5, worst 12.2 (n = 651); whole-party turn median 27.5 ms,
  worst 54 ms. Original AutoPlay on the same page: 3.9 ms per unit, 19.9 ms per party turn. Whole campaigns: ~2 s per run
  (60 normal runs in 114 s, one headless page).

### Known issues

1. **Calibration bars in other areas' suites fail because AutoPlay plays better** (11 sections, 16 assertions in the
   last full run; every one passes with the original AutoPlay, checked with `.tmp/autoplay/test_old.sh`). Nothing is
   broken: the fixture party now dodges, takes cover and finishes faster, so bars measured against the old AI no longer
   hold. Owners (see Requests; numbers in Measurements):
   - `tests/content/hero_marwyn.js` "AutoPlay battles, acts 1-2": `test_a1_normal L4: Marwyn acted` — the fight ends in
     round 2 (was 3) before the 3-move tank reaches anyone.
   - `tests/content/enemies_act1.js` "autoplay sims (normal …)": `a1_union_meeting` / `a1_open_mic`: "the enemies land
     hits" (0 damage over 8 fights; traced: every attack is killed first or dodged — the Rep's tracked memo loses its
     target, pokes hit empty tiles).
   - `tests/content/enemies_act2.js` "autoplay sims" (graveyard and brunch, hauntwood, academy): "not trivial (≥ 8% HP)"
     for `a2_unpaid_internship`, `a2_bottomless_brunch`, `a2_cub_scouts`, `a2_rooftop_critics`, `a2_office_hours`.
   - `tests/content/enemies_act3.js` "AutoPlay sims — normal encounters": "not trivial (avg damage ≥ 20)" for
     `a3_self_help_seminar` (17) and `a3_snack_heist` (2).
   - `tests/content/bosses_act1.js` Grimble and Rat King sims: "not a walkover" (8/8).
   - `tests/content/bosses_act2.js` Lich-tenstein and Dr. Iris sims: "win rate in the moderate band" (100%, fixture party
     L7); "lich previews and telegraph honesty": `checked 9 hits` (> 20 wanted), `watched 10 intents` (> 10) — fewer hits
     land, so the honesty check needs more seeds rather than a fix.
   The DM's "phase transitions and plot armor" failure seen mid-pass belonged to the engine pass (`modifyFinalDamage`)
   and is gone.
2. The game is now much easier for AutoPlay than the content-digest numbers said (every campaign won on every
   difficulty in these batches). That is the intended input for the BALANCE pass, not an AutoPlay bug.
3. In `a2_last_coffee` the protected coffee machine loses 45% of its HP on average (old AutoPlay 25%; never destroyed):
   heroes get out of the way, so the enemy AI turns on the machine more. Protect objects are weighted 2.5 per HP + 120
   for losing them; heroes cannot body-block in this engine.
4. Approximations: Guard is 2 per AP (no `modifyGuard`); the escape step checks Manhattan reach, not a path; leftover-AP
   potential comes from quick estimates (it assumes the targets are still there); enemies re-plan after the player
   phase, so a safe tile now can be targeted next round (as for a human). Side-blind hazards: hero-made traps (d4s,
   runes) look like hazards to heroes too.
5. Josiah's Smelling Salts is still never used — heroes rarely stay down now (Help Up first; and a downed ally lying in a
   lethal telegraph is left down for a round, since downed heroes take no damage and get up with 0 AP).
