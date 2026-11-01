# BOSS-DM notes: The Dungeon Master (final boss, Act 3)

Files: `js/data/bosses/dm.js`, `tests/content/boss_dm.js` (17 suites `boss_dm: …`).
Scratch: `.tmp/boss-dm/` (author) and `.tmp/boss-dm-review/` (review: `scene.html` + `scene.js` + `sshot.sh` for
screenshots of exact moments, `probe*.html/js/sh` for balance telemetry and one-off probes).
Isolated runs: `bash tools/test.sh "suite=boss_dm&isolate=bosses/dm,boss_dm"` and
`bash tools/test.sh "suite=content:&isolate=bosses/dm,boss_dm"`. The real-hero sim suite needs a full run
(`bash tools/test.sh "suite=boss_dm"`).

## Summary

The fight takes place on the DM's actual table (theme `dm_table`, 14×11 hand-made layout). He sits behind his three-panel
DM Screen at the head of the table, in an alcove walled in by knee-high sourcebook stacks. Two pencilled train lanes
cross the table. Railroad-crossing Track Switches stand at the lane ends, there are soda cans, d20s and pencils for
cover, and his two giant dice show his rolls.

- **The DM** (`dungeon_master`, act 3 boss, 480 HP, 0 move, immovable, poison ×0.5, 2.0-scale humanoid sprite: wizard
  hat, glasses, stubble, hoodie with a "DM" logo, binder, soda, two d20s orbiting his head). Custom planner + def hooks.
  - **Every round: Rules Lawyering.** He rolls the giant d20 (`die_rule` mark shows the number) on his House Rules table and
    adds one `state.rules` rule (`dm_house_rule`, lasts the round incl. his turn, HUD chip "House Rule: …" showing the
    roll). There are 10 rules, some good, some bad, some both: Milestone XP (nothing), Exploding Dice (+2 per attack, both
    sides), Snack Break (everyone but him heals 4 at turn start), Strict Line of Sight (heroes −1 range), Armor Class Is
    Back (−2 per attack), Flanking Rules (+25% vs units next to 2+ foes), Cheeto Fingers (his hits leave Cheeto dust), DM
    Fiat (his attacks +4), Inspiration for Everyone (heroes Inspired), Speed Factor Initiative (heroes +1 AP; not stunned
    ones). From phase 2 on he **fudges**: a roll that helps the heroes gets re-rolled, in front of everyone. When he's
    stunned at round start, there's no rule. **His telegraphs show the rule** (`telegraphFlat` on every `dm_` skill):
    +2 / −2 / +4, and +25% on a tracked shot at a flanked hero; ⏳ intents keep the base number until they are due.
  - **Phase 1 "Session Zero"**: invulnerable while any **DM Screen panel** stands (an unremovable `flags.invulnerable`
    plus the `invulnerable` status for the HUD and AI; dispelling the status does nothing). Behind the screen his rolls
    are *Roll Behind the Screen* (15, tracking, **no line of sight needed**), which is why you break it fast. Rotation:
    Random Encounter (rounds 1, 4, 7…), otherwise **Rocks Fall** (crosses around up to 3 heroes who keep their distance,
    ⏳1, 26 damage, rubble), plus 2 rolls a round.
  - **Phase 2 "The Railroad"** (≤ 2/3 HP = 320): every round a train is telegraphed ⏳1 on the busiest lane without a
    train (lanes alternate). A train hits every unit on the lane (his minis too) for 28 and knocks it 1 south. Plot Hook
    (10 + pull 3 toward him) on odd rounds, 1-2 Fudged Rolls (15, line of sight: hide behind soda cans and dice),
    Random Encounter every 3rd round.
  - **Phase 3 "Rocks Fall, Everyone Dies"** (≤ 1/3 HP = 160): three Player's Handbooks appear near the party. **ROCKS
    FALL, EVERYONE DIES** is telegraphed over the whole table with ⏳2 (60 damage to every hero and summon in the 3rd
    round; when it fires he restarts the countdown). Rocks Fall and trains alternate, 2 rolls a round, Random Encounter
    every 3rd round. Charmed on the doom round, his "foes" are his own minis: the rocks fall on them instead.
  - **Get Off My Table** (13 + knockback 2 around him) only when 2+ foes crowd him, and at most every other round.
  - **Plot Armor / phase gates**: crossing a threshold flips the phase at once (banner, narration, bark, new patterns;
    the damage carries over). A second threshold in the same round clamps him at it with Plot Armor (invulnerable until
    next round, never longer). He can't die before phase 3, and a phase can't be skipped.
  - **Stun guard**: after a stun-like he can't be stun-like'd again during the next round (his own puzzle stuns always
    land). A stun in phase 3 also pushes the doom back one round ("he lost his place in his notes").
  - Death: banner + log `"Fine. FINE. You win. Same time next week?"` (also his death barks), house rules end, his minis
    flee (boss objective).
- **Puzzles** (all with AutoPlay hints that drop to 0 once done):
  1. **DM Screen** (`dm_screen_panel` ×3, 10 HP, smashable: Smash 1 AP / 5, or any skill that damages objects). Each
     panel that falls reveals a secret from his notes. When the last one falls the screen collapses on him: **60 damage,
     Stunned (his telegraphs cancelled at once), Exposed** (`dm_exposed`: +50% damage taken until phase 2). Hint 30, last
     panel 45.
  2. **Track Switch** (`dm_track_switch` ×2, "Switch Tracks", 1 AP). While a train is due *this* turn (red lane), it
     diverts it onto the DM's own row: the telegraph moves at once. When it fires, **40 damage to him + Vulnerable** (until
     the end of his next turn) and 28 to anyone else on his row. Works whenever a train is due (phase 2 on). **A diverted
     train is the party's**: it runs at the start of his turn even if he is stunned, taunted or dazzled. Hint 34.
  3. **Player's Handbooks** (`dm_handbook` ×3, "Cite the Rules", 1 AP each; summons can cite too). Cite all three during
     the countdown and the doom is cancelled for good; the rocks fall on him: **55 damage, Stunned, Exposed for the rest
     of the fight**. Hint 40 per unused book. Alternatives: stun him (+1 round each, stun guard applies), charm him on
     the doom round, or kill him first. On a table too cramped for three, the books that fit are enough.
- **Random Encounter** (cameo minis): up to 2 per call, 3 minis on his side at most (anything there but him counts, incl.
  split slimes or reassembled skeletons), 6 per fight; never while he's charmed. Cameos are picked **at runtime** from
  `DD.defs.enemies`: a random act, then a minion/normal of that act (acts 1-2) or a minion (act 3). Excluded:
  `test_ wm_ mg_ mgt_ dm_ grim_ rat_ lich_ iris_`, bosses, elites, no skills/sprite. Every cameo gets mini-sized HP
  (×16/hp, clamped 0.4-1.6) and an **unpainted grey sprite** (`unit.sprite` override), and arrives with "🎲 Cameo from
  Act N!". Whatever a cameo leaves behind (splits, reassemblies, summons) is adopted at round start: grey, counted. With
  no act enemies registered it falls back to my own minis.
- **On-screen guidance**: the boss objective's subtitle (`state.objective.flavor`) is rewritten live with the current
  puzzle ("Smash the DM Screen (2 panels left)…", "The Railroad: … pull a Track Switch …", "ROCKS FALL at the end of
  round 4 (⏳2)! Cite all 3 Player's Handbooks (1/3), or stun him to buy a round.", "PLOT ARMOR: …"). The fight opens
  with a DM-voice hint (`dm_start`, like the other bosses' `*_start` keys). There are also banners for every phase and
  payoff, log lines, object names/descs/interaction labels, intent descs in the inspect panel, and glowing "!" books
  and switches while they're live.
- **Balance** (DESIGN §5: 480 HP in 420-520, hits 13-15, big telegraphs 26-28, the doom is a special 60). AutoPlay,
  level 10, starting skills + 2 pool skills at III, no items, normal: **real heroes (random parties) 80-89% wins** (two
  64-fight seed sets; the suite's own 16 fights: 15/16, 8.6 rounds), 8.7-9.5 rounds, 1.0-1.5 downs/fight, phases
  ~3 / 3 / 2.5 rounds, the doom fires in 13-25% of fights and is rules-lawyered in ~25%. Brutal 41% (12 rounds), casual
  100% (7.2 rounds). Fixture party: 50-53%, 12.2-12.7 rounds. Puzzle damage per real-hero fight: trains ~110, screen 62,
  lawyered ~15 (of ~460).

### Every id
- Enemies: `dungeon_master`, `dm_cameo_goblin` (Unpainted Goblin Mini), `dm_cameo_skeleton` (Skeleton Mini (Some
  Assembly Required)), `dm_cameo_imp` (Imp Mini (Still in Blister Pack), flying).
- Skills (owner enemy): `dm_fudged_roll`, `dm_secret_roll`, `dm_rocks_fall`, `dm_railroad`, `dm_plot_hook`, `dm_get_off`,
  `dm_tpk`, `dm_cameo_stab`, `dm_cameo_bone`, `dm_cameo_ember`.
- Objects: `dm_screen_panel`, `dm_track_switch`, `dm_handbook`, `dm_book_stack`. Terrain: `dm_track`. Status: `dm_exposed`.
- Encounter: `boss_dm` (act 3, boss, layout map, objective boss, `onStart` narrates `dm_start`, reward goldMult 1.5 /
  legendary).
- Rule (runtime): `dm_house_rule`. Narration keys: `boss_start` (+1 generic line), `dm_start`, `dm_phase2`, `dm_phase3`,
  `dm_screen`, `dm_rule`, `dm_cameo`, `dm_switch`, `dm_objection`, `dm_defeat` (10 keys in total).
- Layout marks/tags: `boss_spawn`, `lane1`, `lane2`, `book`, `cameo`, `die_rule`, `die_fudge`.

## Public API (others may use)

- `DD.BossDM` (tests / debug only; no game logic depends on it): `N` (numbers: `hp, panelHp, screenDrop, divert, lawyered,
  cameo*, books, doomRounds, p2, p3` (threshold fractions), `rolls1/2/3` (rolls per round)), `HOUSE_RULES`, `LAYOUT`,
  `findDM()`, `boss(unit)` (boss state on `unit.data`: `phase, screenDown, armored, doom {active, solved, at, fired},
  books, booksNeeded, cameos, stunGuard, divert, stats {panels, screen, rules, cameos, switches, diverted, books,
  lawyered, doomFired, stuns, phase2, phase3}`), `lanes(dm)`, `divertable(dm)`, `panelsLeft()`, `rollHouseRule(dm,
  forcedRoll?)`, `randomEncounter(dm)`, `cameoPool()`, `unpainted(spec)`, `syncPhase(dm)`, `syncShield(dm)`, `floorHp(dm)`,
  `threshold(dm, phase)`.
- `dm_exposed` status (+50% damage taken; `decay: never`): reusable by anyone who wants an "exposed" debuff.
- `dm_book_stack` object: knee-high wall that blocks movement but not sight (nice for any DM-table map).
- `dm_track` terrain: pencilled rails on graph paper (`def.draw` overlay).
- The cameo minis (`dm_cameo_*`) are ordinary act-3 minions that other DM-table encounters could reuse.
- Intent flag `data.unstoppable` (see Core fixes): content that fires an intent whatever state its owner is in can set
  it so the inspect panel doesn't say "Incapacitated: this will not happen."

## Deviations

- Puzzle objects are my own object types with **def-level** callbacks (`interact`, `available`, `onDestroyed`,
  `autoplay`, `draw`). Per-instance data (panel index, labels, book pages) is set at combat start or via `placeObject`
  overrides. The legend's object entries carry no `data`, because `fromLayout` would share it between instances.
- The boss objective (type `boss`) keeps its text. The puzzle instructions live in `state.objective.flavor`, which I
  rewrite as the fight progresses (the HUD shows it as the subtitle).
- Plot Armor is enforced in `onTakeDamage`: when a hit crosses a floor in the same round as a phase flip, he is healed
  back up to the floor (`Act.heal`, silent) and made invulnerable. The damage number shown and the damage stats count the
  full hit. The HP bar animates down and back up with a "PLOT ARMOR!" label.
- All of the DM's attacks pass `noHighGround` (his alcove is raised): telegraphed numbers are exact. (Heroes on the
  raised back row, h2, do get high ground on him: a legit flanking spot behind his books.)
- The doom intent is clamped to ⏳2. A mid-turn flip into phase 3 gives the party the rest of that turn plus 3 full rounds.
- Cameo HP is normalized to mini toughness instead of keeping each act's own HP.
- A diverted train is not executed by `AI.executeAll`: the DM's `onTurnStart` (enemy phase, before his intents) resolves
  it through `Combat.resolveSkill` with the recorded row, so his stun / sleep / taunt / dazzle / confusion can't cancel or
  re-aim it. After any status lands on him (`onStatusApplied`) its telegraph is pinned back on his row.
- The house-rule narrator line plays in round 1 and then on ~25% of rounds (cosmetic RNG): the chip, the floating text
  and the log already show the rule, and the narrator caption sits over his intent bubbles for several seconds.

## Core fixes

- `js/engine/ai.js` `describe()` (one line, commented "Review fix, docs/notes/boss-dm.md"): an intent with
  `data.unstoppable` no longer gets "Incapacitated: this will not happen." when its owner is stunned. Used by the DM's
  diverted train, which really does fire. Regression test: `boss_dm: a diverted train is the party's …` (asserts the
  inspect text); `engine:` suites still pass.

## Requests

- **RULES (optional)**: a final-damage hook (after multipliers and before HP, e.g. `modifyFinalDamage(d)` with `d.amount`)
  would let HP gates like Plot Armor clamp cleanly, without healing back afterwards. `DD.AI.estimate` also ignores custom
  damage-taken statuses such as `dm_exposed` (exact previews are right; AutoPlay's quick score just undervalues the DM
  while he's Exposed).
- **RULES (optional)**: a rule-level `telegraphFlat(unit, intent)` in `AI.intentDmg` (like the skill and status ones).
  My skills already show the house rule, but the real act enemies picked as cameos keep their base number under
  Exploding Dice (+2) and Armor Class Is Back (−2).
- **HUD (optional)**: a boss with intents on the back row of a tall arena gets its intent bubbles under the narrator
  caption while it shows (~6 s). I moved the DM deeper into the board (author) and cut the per-round narration
  (review); a caption that fades while the player hovers the board, or sits lower, would fix it for every boss.
- **Lead (FYI)** **[Resolved at integration — see docs/notes/content-digest.md.]** the generic `content: registry` suite requires every engine narration key as soon as more than 10 keys
  exist. In isolated runs I register exactly 10, so it is skipped; in full runs `js/data/narrator.js` covers it.

## Known issues

- Real-hero AutoPlay wins 80-89% on normal (the lich is ~83%, Dr. Iris ~50%). AutoPlay solves every puzzle with exact
  hint values and dodges with exact previews; humans carry items and passives the sims don't. Levers if playtests say
  he's soft: `N.hp` (band tops at 520), `N.divert`, `N.p3` (0.38-0.4 makes the doom matter more but brutal drops to
  ~25%), `N.rolls2/3`.
- AutoPlay rarely uses the train exploits beyond the switch (pushing minis onto a due lane); a human will.
- Area telegraphs (rocks, trains, the doom, Get Off) show the base number under Flanking Rules; only tracked shots show
  the +25% (one number per intent, per-victim bonuses can't be shown).
- The death banner and the death bark can sit under the narrator caption for a moment (the log carries the line too).
- Units on the right end of the raised back row (x ≥ 11, y 0) can sit under the combat log at 1280×720 (pan or fold
  the log); the cameo marks avoid it.

## Review

Adversarial review (third pass; earlier passes were interrupted, their fixes kept: the Plot Armor soft-lock reset in
`onRoundStart`, cameo spots limited to tiles the party can reach, the countdown subtitle matching the ⏳, the Railroad's
"Vulnerable until the end of his next turn" wording). Everything below was verified by running code (probes in
`.tmp/boss-dm-review/probe*.js`, screenshots in `.tmp/boss-dm-review/*.png`).

Fixed, most severe first:
1. **A diverted train vanished when the DM was stunned** (also: a taunt dragged it onto the taunter's row, Dazzled could
   shift it off his row). Stunning him after a switch is the natural combo in phase 3 (a stun delays the doom), and it
   silently threw away the payoff: 7 of ~37 real-hero switch pulls were lost this way. Now the diverted train is the
   party's (see Deviations), its telegraph stays pinned, and the inspect panel no longer says "Incapacitated" (core
   one-liner). Desc: "A diverted train runs even if he is stunned."
2. **Telegraphs lied under 4 of the 10 house rules**: the bubble said 15 / 26 / 28 / 60 while Exploding Dice, Armor Class
   Is Back and DM Fiat changed every hit by +2 / −2 / +4 (Flanking +25%). Every `dm_` skill now has `telegraphFlat`
   (house rule of this round; tracked shots at a flanked hero; ⏳ intents keep their base number).
3. **Balance with the real heroes** (the author only had the fixture party): after fix 1 the real-hero win rate was
   94% at 8.1 rounds with 0.6 downs per fight, and phase 3 was so short the doom almost never mattered. HP 420 → 480 and
   the diverted train 50 → 40: 80-89%, ~9 rounds, 1.0-1.5 downs, the doom fires or is lawyered in ~half the fights,
   brutal 41% (was 56%). Thresholds stay 2/3 and 1/3 (320 / 160).
4. **The narrator caption hid his intent bubbles** for ~6 s at the start of every player phase (the house-rule line was
   narrated every round; screenshots at 1280×720 and 1920×1080). It now narrates in round 1 and ~25% of rounds.
5. **Cameo leftovers escaped the caps**: a cameo slime's splits or a reassembled Skeleton Intern were full-colour,
   uncounted extra units (one blocked a Track Switch in a test). The 3-alive cap counts everything on his side, and
   leftovers are adopted (grey, flagged) at round start.
6. Smaller truths: the doom hits summons too (desc said "every hero"); "stun the DM" only delays it (desc / subtitle /
   log said it stops it); the switch works in phase 3 too (desc said "only during The Railroad"); Speed Factor gave
   stunned heroes a phantom AP pip; the doom on a charmed DM logs that it fell on his minis; a cramped table that fits
   fewer than 3 books asks for the ones that fit; `boss_start` (shared by every boss) lost the finale-only "waited all
   campaign" line, which moved to a new `dm_start` hint (the other bosses all open with one).

Tests: 3 new suites (house-rule telegraphs = damage for every attack × rule, flanking and ⏳; diverted train vs stun /
taunt / dazzle; real-hero AutoPlay sims with puzzle-engagement checks, skipped in isolated runs) and new checks (plot
armor healed above the floor is not a soft-lock, Vulnerable duration, stunned heroes and Speed Factor, one-book table,
`dm_start`). Fragile measurements fixed: HP deltas across a round boundary were blurred by the next round's Snack Break
or Inspired heroes (failed for seeds 1, 2, 2024), and a stray mini could stand on the switch tile (seed 9): hits are now
counted with an `onTakeDamage` watcher and heroes go to any free tile next to a switch. All `boss_dm` suites pass for 10
seeds with full content and 8 seeds isolated. Final full run (2026-10-31): PASS, 507 suites, 0 failures, no warnings
from DM content.

Checked and fine: desc numbers at every level (registry + content suites), previews = reality across phase flips and
plot armor, deployment re-plans deterministic, no `Math.random` in logic (only the cosmetic `DD.rng` for narration),
no swallowed "Error in" warnings, no timeouts, charm (he attacks his own minis, summons nobody), stun guard,
sheep immunity, bare sandbox fallbacks, the sprite (big, distinctive, funny; gallery + in-combat at 1280×720 /
1920×1080) and the puzzle objects' art.

## Phase 4 (engine requests role) — migrations in `js/data/bosses/dm.js`

Both RULES requests above are done in the engine (docs/notes/rules.md "Phase 4") and used here:
- **Plot Armor** clamps the hit in the new `modifyFinalDamage` hook (after armor, before Block) instead of healing him
  back afterwards: a hit carries him at most down to the floor that will hold (`floorOf(u, phase)`), so lifesteal,
  damage stats, the log and the damage number see the HP he really lost. `onTakeDamage` still turns the phase and
  raises the armor; its heal-back is only a safety net now.
- **House rules on every telegraph**: the rule now carries `telegraphFlat: ruleFlat` (engine rule-level telegraph
  flats): Exploding Dice +2, Armor Class Is Back −2 and Flanking's +25% (tracked shots) show on his cameos' telegraphs
  too (they used to lie). His own skills' `houseFlat` keeps only DM Fiat (+4, his alone), so nothing counts twice.
- **Exposed** is `takenMult: 1.5` (declared, applied to all damage like the hook was) so `DD.AI.estimate` and
  AutoPlay's quick score see it.
- Tests (`tests/content/boss_dm.js`): the huge hit at Plot Armor now deals and reports only the HP he loses (no
  heal-back); cameo telegraphs = damage under Exploding Dice / AC / Fiat; the estimate counts Exposed. Each fails on
  the old code (mutation-checked).
