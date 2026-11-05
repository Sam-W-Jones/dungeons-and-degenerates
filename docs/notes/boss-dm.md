# BOSS-DM notes: The Dungeon Master (final boss, Act 3) — v2

Files: `js/data/bosses/dm.js`, `tests/content/boss_dm.js` (21 suites `boss_dm: …`, 2 of them diagnostics).
Scratch: `.tmp/boss-dm-v2/` (v1 copies of both files, `scene.html` + `scene.js` + `sshot.sh` for screenshots of exact
moments — `sshot.sh` sources `tools/chrome_slot.sh` — and the screenshots `rocks.png`, `train.png`, `doom.png`).
Isolated runs: `bash tools/test.sh "suite=boss_dm&isolate=bosses/dm,boss_dm"` and
`bash tools/test.sh "suite=content:&isolate=bosses/dm,boss_dm"`. The real-hero sims need the hero files:
`bash tools/test.sh "suite=boss_dm: AutoPlay sims with the real&isolate=bosses/dm,boss_dm,heroes/,enemies/,skills_generic,items&verbose=1&n=64"`.
Diagnostics: `…&suite=boss_dm: balance probe&probe=1&n=48` (damage by source, phase lengths; `level=`, `diff=`) and
`…&suite=boss_dm: battle log&dump=1&party=a,b,c,d` (one line per round; `simkey=<label><seed>:<#>` replays a sim fight,
e.g. `simkey=real%20L512345:2` with that fight's party).

## Summary (v2: initiative, wind-ups, no telegraphs)

The fight is on the DM's actual table (theme `dm_table`, 14×11 hand-made layout, unchanged): he sits behind his
three-panel DM Screen at the head of the table, two pencilled train lanes cross it, Track Switches stand at the lane
ends, soda cans / d20s / pencils are cover, his giant dice show his rolls.

- **One initiative entry** (`init: 2`, no `turnsPerRound`). His turn: the wind-up from his last turn lands (engine,
  turn start), he does **one thing at once** (two in phase 3), then **winds up his next big attack**.
  - At once: a **roll** at the best target he can reach (`api.bestAttack`, the AI's own reach-aware scoring — what the
    HUD's threat shading and AutoPlay model), or **Get Off My Table** (13 + knockback 2) when 2+ foes crowd him (not two
    turns in a row; screen down only — it is in his kit from then on), or a **Random Encounter** (his 1st, 4th, 7th… turn in phase 1, every 3rd turn later), or — when he
    can see **nobody** — a **Plot Hook** (10 + pull 3, no line of sight needed: "the plot always finds you") on a hero
    hiding from him.
  - Wind-ups (`DD.AI.windUp`, fixed tiles, ⏳1): **Rocks Fall** (26, crosses around up to 3 heroes: the ones he can't
    see first, then those keeping their distance; leaves rubble) in phase 1; **The Railroad** (24 + knocked 1 south,
    the busiest lane, lanes take turns on a tie) in phase 2; phase 3 alternates rocks and trains. One regular wind-up at
    a time. A stun / sleep / frozen interrupts it (engine), so do his own puzzle stuns.
  - His **wind-up skills are not skill slots**: his slots are his immediate kit, swapped by state (`KIT`): screen up
    `dm_secret_roll`; after it `dm_fudged_roll`, `dm_plot_hook`, `dm_get_off`. So `AI.reachOf` / threat shading /
    AutoPlay's reach model see a 20-damage roll (and a 10 hook), not a 60-damage doom everywhere.
  - The inspect panel line (`def.passive`, live per phase) says what he does on his turn.
- **Phase 1 "Session Zero"**: invulnerable while any DM Screen panel stands (flag + status). Behind it his roll is
  **Roll Behind the Screen** (20, no line of sight). The last panel falls → the screen collapses on him: **60, Stunned
  (he loses his next turn and the Rocks Fall he was winding up), Exposed** (+50% damage taken until phase 2). Then his
  rolls need line of sight: cover works, but a party that hides completely gets Plot Hooked and rocked.
- **Phase 2 "The Railroad"** (≤ 2/3 HP): one roll a turn + a train wind-up. **Track Switch** (1 AP, either switch)
  while a train winds up (`divertable`: the pending `dm_railroad` wind-up with `turnsLeft` ≤ 1 — the v1 test
  `!(delay > 0)` never matched a v2 wind-up, so the switch was dead for players *and* AutoPlay): the wind-up is re-aimed
  onto his row and made `unstoppable` (the party's train: his stun / taunt / dazzle / confusion can't stop or turn it;
  the engine keeps and lands unstoppable wind-ups). It hits **everyone on his row, him included, for the same badge
  number** (24, house rules apply), and he is Vulnerable until the end of his next turn (`turns: 2`, applied at his turn
  start).
- **Phase 3 "Rocks Fall, Everyone Dies"** (≤ 1/3 HP): three Player's Handbooks appear near the party and the **doom**
  is wound up at once: an unstoppable wind-up over **3 of his turns** (⏳3 → ⏳2 → ⏳1), 60 to every hero and summon;
  when it lands he restarts it. **Each stun pushes it back a turn** (`turnsLeft` +1) instead of cancelling it. Cite all
  three books (1 AP each; summons can cite too) → **rules-lawyered**: the doom is gone for good, the rocks fall on him
  (55) and he is Exposed for the rest of the fight (no stun any more: a stunned DM made phase 3 a formality).
  Desperate, he **rolls two dice a turn** (two different heroes) + rocks or a train.
- **Plot Armor / phase gates** (unchanged): crossing a threshold flips the phase at once; a second threshold in the
  same round clamps him there (invulnerable until next round, reset at round start: no soft-lock). He can't die before
  phase 3; phases are never skipped.
- **Stun guard (v2)**: once a stun-like lands (any source; his own puzzle stuns always land and arm it too), he
  shrugs off stuns from others until the end of the next turn he actually plays. So: stun → lost turn → a played turn →
  stunnable again; he can lose at most every other turn, and every wind-up can still be interrupted.
- **House rules** (unchanged rules, v2 numbers): rolled on the giant d20 at each round start, lasting the round;
  re-rolled if they help the heroes from phase 2 on. Wind-up badges show the rule only if the wind-up lands this round
  (`landsThisRound`: his entry is still ahead in this round's order, or his turn is starting); a wind-up landing next
  round lands under next round's rule, so it shows its base number. Actions always show it.
- **Random Encounters**: up to 2 cameos per call, 3 minis alive, 6 per fight; never while charmed. Cameos roll
  initiative as they arrive (`Act.spawn`) and act from the next round with their own (reach-aware) AI. Picked at
  runtime from `DD.defs.enemies` (unchanged rules: act 1-2 minions/normals, act 3 minions; unpainted grey; mini HP).
  Own fallback minis: goblin `melee`, skeleton `ranged`, imp `skirmisher` (a flyer: dives the wounded); explicit init.
- Death: banner + `"Fine. FINE. You win. Same time next week?"`, house rules end, minis flee (boss objective).
- **Attacks of opportunity (v2 AoO rule)**: he makes **none** — every kit he has is ranged (rolls, Plot Hook) or his
  self-centred shove (`dm_get_off`, target `self`: not a melee basic for `Act.opportunitySlot`), and he never moves
  (mov 0, immovable), so he never provokes either. Walking out of his alcove is free; his minis are the ones who punish
  leavers (the fallback goblin stabs; skeleton and imp shoot; real act cameos follow their own kits). His Plot Hook
  (pull), Get Off My Table (knockback) and trains (push south) never provoke, even past his minis (engine rule).
  Suite `boss_dm: attacks of opportunity …`.

### Numbers (N, skills)
HP 400 · panels 10 · screen drop 60 · rolls 20 · Plot Hook 10 + pull 3 · Get Off 13 + push 2 · Rocks Fall 26 ·
The Railroad 24 + push 1 (= what a diverted one deals him) · doom 60 over 3 of his turns · lawyered 55 · Exposed ×1.5 ·
cameos 2 / 3 alive / 6 a fight at 16 HP · thresholds 2/3, 1/3.

### Balance (AutoPlay v2, random 4-hero parties of the 16 real heroes, the v2 level band)
Parties: 2 starting skills + one boon per level gained (learn 2 more, then upgrades), no items / Blessings /
consumables, full HP, normal difficulty, the real path (deployment → rolled initiative → `AutoPlay.runBattle`).

**Review (v2, 2026-11-04), after the attacks-of-opportunity engine change and the hero retunes, HP 380 → 400:**

| level | fights | win rate | rounds | downs / fight |
|---|---|---|---|---|
| 4 | 48 | 58% | 9.5 | 2.9 |
| **5** (the DM's band) | 192 (3 × 64) + 48 probe | **67%** (69 / 70 / 63; probe 52%) | 9.4-9.9 | 2.3-2.4 |
| 6 | 48 | 75% | 9.4 | 2.2 |

At 380 HP the same three level-5 batches had drifted up to 77 / 80 / 67% (74.5%). Probe at 400 (48 fights): phases
3.0 / 3.5 / 3.5 rounds; hero-side HP lost per fight: rolls 67 + secret rolls 8, cameos 33, Get Off 16 (+ 16 bumps),
Plot Hook 14, doom 12, train 6, rocks 3.5; DM HP lost: heroes 186, diverted trains 78, screen 63, lawyered 34. No
timeouts; the longest fights (14-19 rounds) are low-damage parties (e.g. Valdris + Hjalmar + Corelos + Slate lost a
16-round fight in phase 1 once Corelos went down) — attrition, not a stall.

Author's table (2026-11-03, HP 380, before the hero retunes):

| level | fights | win rate | rounds | downs / fight |
|---|---|---|---|---|
| 4 | 32 | 59% | 9.5 | 3.0 |
| **5** (the DM's band) | 176 (64 + 64 + 48) | **69%** (70 / 69 / 67) | 9.2-9.5 | 2.0-2.3 |
| 6 | 32 | 84% | 9.0 | 1.8 |

Level 5 brutal 31% (10.7 rounds, 4.0 downs), casual 91% (7.5 rounds). Phases ~2.6 / 3.4 / 3.2 rounds. The doom fires
in ~16% of fights and is rules-lawyered in ~70%; the screen comes down in every fight (round 2); the switch is pulled
in ~98% of phase-2 fights (~3 trains diverted a fight). 0 timeouts in ~350 sims, longest fight 15 rounds.
Hero-side HP lost per fight: rolls 63 + secret rolls 8, cameos 34, Get Off 17 (+ 16 from bumps into his sourcebooks),
Plot Hook 11, wind-ups 12 (doom 5, train 4, rocks 3: they are dodged). DM HP lost: heroes 185, diverted trains 72,
screen 63, lawyered 34. Fixture party (L5): 25%, 11.7 rounds (its suite checks the puzzles and phases, not wins).

How it got there (each step measured over 32-128 fights): the straight v1→v2 port won 88% with 0.8 downs (he acted
once a round and lost a third of his turns to the screen, a hero stun and the lawyered stun; every train got diverted
for 40). Rolls 15 → 20, divert 40 → 20 → (= train 24), HP 480 → 380, two dice in phase 3, no lawyered stun, cameo caps
back to 3/6 (8 cameos made fights 11-12 rounds). A turtle-stall (AutoPlay hiding the party from his rolls behind cover
while cameos shot down from the raised marks: 22-27-round fights) is gone since the Plot Hook ignores line of sight and
comes for a fully hidden party, and Rocks Fall picks hidden heroes first.

### Every id
- Enemies: `dungeon_master`, `dm_cameo_goblin`, `dm_cameo_skeleton`, `dm_cameo_imp`.
- Skills (owner enemy): `dm_fudged_roll`, `dm_secret_roll`, `dm_plot_hook`, `dm_get_off` (his slots, by state) and the
  scripted wind-ups `dm_rocks_fall`, `dm_railroad`, `dm_tpk` (`canUse` refuses them; no slots); cameo skills
  `dm_cameo_stab`, `dm_cameo_bone`, `dm_cameo_ember`.
- Objects: `dm_screen_panel`, `dm_track_switch`, `dm_handbook`, `dm_book_stack`. Terrain: `dm_track`. Status: `dm_exposed`.
- Encounter: `boss_dm`. Rule (runtime): `dm_house_rule`. Narration: `boss_start` (1 generic line), `dm_start`,
  `dm_phase2`, `dm_phase3`, `dm_screen`, `dm_rule`, `dm_cameo`, `dm_switch`, `dm_objection`, `dm_defeat`.
- Layout marks: `boss_spawn`, `lane1`, `lane2`, `book`, `cameo`, `die_rule`, `die_fudge`.

## Public API (tests / debug only; no game logic depends on it)

`DD.BossDM`: `N`, `KIT`, `HOUSE_RULES`, `LAYOUT`, `findDM()`, `boss(unit)` (state on `unit.data`: `phase, screenDown,
armored, doom {active, solved, fired}, books, booksNeeded, cameos, guard, p1/p2/p3` (his played turns per phase),
`stats {panels, screen, rules, cameos, switches, diverted, books, lawyered, doomFired, stuns, refused, pushed, turns,
lost, rolls, hooks, shoves, rocks, trains, phase2, phase3}`), `lanes(dm)`, `divertable(dm)`, `panelsLeft()`,
`rollHouseRule(dm, roll?)`, `randomEncounter(dm)`, `cameoPool()`, `unpainted(spec)`, `syncPhase`, `syncShield`,
`syncKit`, `kitOf`, `floorHp`, `threshold`, `windupOf(u, skillId)`, `landsThisRound(u, intent)`, `windDoom(dm, again)`,
`passiveText(u)`. Reusable: `dm_exposed` (+50% taken, `takenMult`), `dm_book_stack` (blocks moves, not sight),
`dm_track` terrain, the cameo minis.

## Deviations

- Wind-up skills have no skill slots (the planner winds them up through `api.windUp` with the def). Reason: AutoPlay's
  `readySkills` and `AI.reachOf` ignore `canUse`, so a slotted `dm_tpk` read as a 60-damage attack on every tile.
- The doom is `data.unstoppable` on purpose (the task allows deliberate exceptions): a stun pushes it back one of his
  turns (his `onStatusApplied`), it is not cancelled — otherwise every stun would restart a 3-turn countdown and the
  Handbooks would not matter.
- The diverted train is an ordinary wind-up re-aimed onto his row with `data.unstoppable` (the v1 pin / run-at-turn-start
  machinery and its `onTurnStart` hook are gone; the engine's `keepUnstoppable` does it). It hits him through the same
  `dmHit` as everyone on the row (source = the DM, so DM Fiat's +4 applies to his own train: it is his attack, and the
  badge says so), with kill credit to the switcher.
- Phase 3 gives him two actions a turn (said in the inspect line and the phase-3 log) instead of `turnsPerRound: 2`.
- House-rule wind-up numbers follow `landsThisRound` (above), not `delay > 0`.
- The rules-lawyered rocks no longer stun him (55 + permanent Exposed); the screen collapse still does.
- Plot Hook needs no line of sight (`target.los: false`), only used when he can see nobody (or charmed: at his minis).
- Unchanged from v1 (see History): object defs with def-level callbacks (AutoPlay dry-runs them; they only touch the
  state they are handed), the objective subtitle rewritten live (`state.objective.flavor`), Plot Armor via
  `modifyFinalDamage`, `noHighGround` on all his attacks, cameo HP normalized, the house-rule narrator line on round 1
  and ~25% of rounds.

## Requests

- **ENGINE / HUD (`AI.describe`, optional)**: a ground wind-up always gets "Hits the marked tiles. Get out of the red."
  The doom marks the whole table, so that line is impossible advice there (its desc explains the books). Suggest
  skipping it when the marked tiles cover the board, or letting content set `intent.data.hint`.
- **AUTOPLAY / ENGINE (FYI)**: `readySkills` (autoplay.js) and `AI.reachOf` (ai.js) count skills whose `canUse`
  refuses them (scripted boss skills) as ready attacks. I worked around it (no slots); other bosses with
  `canUse: scripted` slots over-estimate their threat in AutoPlay and the HUD shading.
- **BOSSES ACT 2 (beholder.js, FYI)**: the same dead-hint pattern as my switch — `mirrorHint` keeps `iris_eye_beam`
  intents with `!(it.delay > 0)`, never true for a v2 wind-up. The v2 test: `it.windup && (it.turnsLeft || 1) <= 1`.
- **Lead (DESIGN §5 / §9)**: the DM is now 400 HP (review; outside the v1 act-3 band 420-520; tuned for level-5
  heroes) with 20-damage rolls; §9's DM line could note the v2 shape (one action + one wind-up a turn, two in phase 3;
  Plot Hook finds hiding heroes; the switch works on the train he winds up; stuns push the doom back a turn; he makes no
  attacks of opportunity).
- **HUD (review, optional)**: on the default camera (1280×720 and 1600×900) the DM's head and his wind-up badge
  (`⏳ 🪨 26`, `⏳3 ☠ 60`) sit under the semi-transparent objective panel, right behind its subtitle — the phase-3
  subtitle ("ROCKS FALL in 3 of his turns… Cite all 3 Player's Handbooks (0/3)…") is the hardest to read. Any back-row
  boss has this; a more opaque subtitle strip (or keeping unit badges out from under the panel) would fix it.

## Known issues

- AutoPlay sims have no items, Blessings or consumables (real parties are stronger) and full HP (real ones come in
  from a tavern at ~35% heal); they solve every puzzle with exact hint values. The balance pass will fine-tune: levers
  `N.hp`, the roll `dmg`, `N.train`, `N.lawyered`, the phase-3 second action, `N.cameo*`.
- Cameos are real act enemies picked at runtime: their damage moves with the act authors' v2 retunes (they do ~34 a
  fight now, and shoot from the raised cameo marks with high ground).
- Rocks and trains are dodged in AutoPlay ~95% of the time (they land 3-4 a fight): they are an AP tax and a punisher
  for stunned / rooted heroes, by design.
- The doom's inspect row repeats "Wind-up" (the engine's "⏳ Wind-up: lands in N of his turns" + the desc's
  "Wind-up over 3 of his turns: …"); harmless.
- Party compositions without ranged damage or object smashing are slower (the alcove only has 3 tiles next to him and
  Get Off My Table shoves melee into his sourcebooks): the longest fights are melee-heavy parties.
- Cameos are whatever the act authors made: an act-2 Cultist of the Forbidden Brunch heals *him* 8 HP every other turn
  and serves Hollandaise Horrors (adopted as minis: they count toward the 3-alive cap, not the 6-per-fight one). That is
  a fair "kill the healer first" twist (a 16-HP mini), but AutoPlay doesn't prioritise it.

## Requests (Nov 3) — content sweep for the user's v2 requests (flyers, barrels, aimed heals, map rotation)

- **Map rotation (plan `.tmp/wf7/rotation-design.md` §7, P1)**: everything drawn along the grid goes through
  `gridPx(u, v)` = `DD.Iso.local` (the classic iso offset at the default view; a fallback formula if DD.Iso is absent).
  `P(u, v, h)` (DM Screen panels, the used Handbook's pages) and the train's `isoPt` / `isoBlock` / `drawTrain` use it,
  and they now draw the faces the viewer sees: the panel's visible end and broad face (its logo reads left to right from
  either side), the open book's far page first, the train's visible end and long side (wheels and the PLOT label on that
  side), and the coal car behind or in front depending on whether the nose faces the viewer. At the default view all of
  it is pixel-identical (A/B test against the old painters). Test-only exports on `DD.BossDM`: `gridPx`, `panelPt`,
  `trainFrame`, `isoPt`, `drawTrain`, `drawPanel`. The P2 box props (book, switch, stack) followed in the box-props pass
  (next item).
- **Rotation (box props, plan §7 P2)**: the Player's Handbook, Track Switch and Stack of Sourcebooks are `yawAware: true`,
  so their boxes stand on the view's ground quad and turn with the board.
  - The switch's crossing-sign post stands at a ground point on the base's back corner, so it walks round the base.
  - Each sourcebook's 1.5 px askew offset turns with the grid. Off the default view a book keeps its spine on the east
    side and page edges on the other three, lit like the view's faces; the classic view still uses its old `g.box`
    colours.

  The default view is pixel-identical (per-state painter hashes, the frozen `renderTo` arena and `tools/shot.sh` at
  rot=0, before vs after). Suite: `boss_dm: handbooks, track switches and sourcebook stacks turn with the map (box props,
  yawAware)`, 21 assertions.
- **Flyers**: the DM doesn't fly; the imp mini does (hero floor effects no longer touch it). Cheeto Fingers says "(Slowed
  on entry; flyers float over it)". Rocks Fall and the train are aimed areas: they still hit flyers. Handbook fallback
  placement reads the walkers' reach only (a book only a flyer could reach would leave the puzzle unsolvable once the flyer
  is down); `cameoSpots` already did this.
- **Barrels / aimed heals**: no DM object explodes (screen panels fall on him, they don't blow up), and no skill here is
  a hero's.
- **Tests**: `boss_dm: v2 requests (Nov 3) — …` (33 assertions: classic offsets and pixel identity of the panel and both
  trains at yaw 0; panel points and the train frame follow DD.Iso.local at 90 / 180 / 270 / 37.5°; the panel and train
  paint at every view with the logo reading left to right; yaw 180 shows the other face; Cheeto dust Slows the walker and
  not the flyer). Screenshots: `.tmp/sweepeb/dm0.png`, `dm90.png`, `dm180.png` (rot=0 / 90 / 180).

## Tests (`tests/content/boss_dm.js`)

19 suites + 2 diagnostics: registry / arena / deployment (one entry, explicit init, his kit = immediate attacks, reach
= the 20 roll, "Wind-up" descs, no v1 telegraph wording); his turn (last wind-up lands, one action, one wind-up per
phase, cameos join the order, two rolls at two different heroes in phase 3); hiding (no target → Plot Hook on a hidden
hero, rocks on the hidden); wind-ups land on the marked tiles, a dodge works, stun / sleep / frozen interrupt
(`windup:cancel`) and cost the turn; the screen (invulnerable, smash, 60 + stun interrupting Rocks Fall + Exposed, kit
swap); house rules; shown number = damage for every action and wind-up under Milestone / Exploding / AC / Fiat
(landing this round) and the base number for one landing next round, flanking, cameos; Get Off cadence (+ his inspect
line says it); attacks of opportunity (none from him in any kit, a walk off him is free, the goblin mini strikes and the
skeleton / imp don't, his Plot Hook / Get Off / train move heroes past goblins without provoking); every attack's
damage = its desc (numbers read from the defs); phases + plot armor (no heal-back, previews, overkill, no soft-lock);
the switch (regression: `divertable` finds the v2 wind-up the `!(delay > 0)` test missed; hint 34 → 0; same 24 to him
and anyone on his row; Vulnerable through his next turn); the diverted train vs stun / taunt / dazzle (and DM Fiat:
he takes exactly the badge); Handbooks (hint 40, lawyered: doom cancelled with `windup:cancel`, 55, Exposed, no stun);
the doom (⏳3 → lands at his 3rd turn, restarts, stun +1 turn, stun guard refuses until he has played a turn); cameos
(caps, runtime pool, unpainted, initiative on arrival); robustness (bare sandbox, fallback lanes / books, charm: his
roll and rocks go to his minis, previews across the phase flip, an AutoPlay dry run of the switch leaves the real train
alone, death, a one-book table); AutoPlay sims (fixture L5: puzzles + phases, no timeouts; real heroes L5, full runs
only: 35-95% wins, 6-14 rounds, puzzles engaged, no timeouts, honest areas / wind-ups via `watchAreas`).
Final full run (review, 2026-11-04): 798 suites, 4 failing sections, none of them `boss_dm` (all 19 DM suites pass,
the real-hero sims included): 2 `integration` (v1 unlocks / ten heroes / an XP line) and 2 `bosses_act2` lich suites
whose files were being edited by their author during the run; no swallowed "Error in" warnings. (Author's run,
2026-11-03: 786 suites, 21 failing sections, none `boss_dm`.)

## Review (v2)

Adversarial review (2026-11-04) of the v2 conversion, after the engine's attacks-of-opportunity + reach-aware targeting
pass. Everything below was checked by running code (suites, a scratch probe page `.tmp/dmrev2/probe.*`, AutoPlay sims,
battle-log replays, screenshots `.tmp/dmrev2/{rocks,train,doom,doom720}.png`).

Fixed (most severe first):
1. **Balance drift**: with today's heroes and the AoO rule the 380-HP DM had drifted to 74.5% wins at level 5 (77 / 80
   / 67% over 3 × 64 fights). **HP 380 → 400**: 67% (69 / 70 / 63%) + 52% in a 48-fight probe, L4 58%, L6 75%, 9.4-9.9
   rounds, 2.3-2.4 downs, no timeouts — "hard but fair" for the final boss without items or Blessings.
2. **His inspect line wasn't exact**: it said "Each turn: one roll" (phase 3: "rolls two dice a turn") while he also
   calls a Random Encounter every third turn and uses Get Off My Table when two foes crowd him (not two turns running),
   either of which takes a roll's place. All four phase lines now say so; the Get Off and Random Encounter suites check
   the wording.
3. **Get Off My Table behind the screen**: `api.act` doesn't need a slot, so two heroes who got into his sealed alcove
   (a teleport, Kiri's ethereal walk, a flyer) were shoved for 13 + 2 although the shove was neither in his screened
   slots (threat shading, AutoPlay's reach model) nor in his inspect line. `actNow` now shoves only with `dm_get_off` in
   his kit (screen down); regression check in the Get Off suite.
4. **Cheeto Fingers chip** said "every tile the DM's attacks hit"; the doom and diverted trains (deliberately) leave no
   dust. It now lists them: "the DM's rolls, hooks, shoves, rocks and trains".
5. **Track Switch desc** said the diverted train runs *him* over; it hits everyone on his row (same 24, knocked south).
   Now: "24 damage to him and anyone on his row; he is Vulnerable".
6. **No attack-of-opportunity coverage**: new suite `boss_dm: attacks of opportunity (he makes none; his hooks, shoves
   and trains never provoke)` — no AoO slot in any of his kits, walking off him is free (`Combat.provokes` agrees), the
   goblin mini strikes and the skeleton / imp don't, and Plot Hook / Get Off / the train move heroes past goblins
   without provoking (a walk the same way does).

Verified, no change needed:
- **Wind-ups**: one initiative entry; rocks / trains are wound at the end of his turn and land at the start of his next
  one, so every hero gets exactly one turn in between. Stun / sleep / frozen interrupt them (sheep: bosses are immune).
- **The doom**: a stun at ⏳1 makes it ⏳2; his stunned turn still counts down, so it lands exactly one of his turns later;
  the stun guard refuses a second stun until he has played a turn (probe: stunned at ⏳1 in round 3 → lands round 4).
  Phase 3 entered at his own turn start (a diverted train across 1/3 HP) winds it ⏳3 and it lands 3 of his turns
  later; he still rolls twice that turn. Phase 3 entered on a hero's turn: lands at the start of his 3rd turn.
- **Diverted train**: unstoppable (his stun / taunt / dazzle), lands for the badge number, and Vulnerable (`turns: 2`
  from his turn start) covers one full round of hero turns whether he acts first or last in the order.
- **Taunt**: his roll goes to the taunter and Rocks Fall centres on the taunter only; the doom ignores it.
- **AutoPlay** engages every puzzle with real heroes: screen 64/64, switch in 61-63 of 63-64 phase-2 fights, phase 3
  engaged in every fight, lawyered in ~70%; no timeouts in ~600 review sims.
- **Visuals**: Rocks Fall crosses, the diverted train's red row + "Diverted onto the DM 24" badge, the whole-table doom
  with the books' "!" markers and the inspect panel (phase line, ⏳ countdown, 60 dmg) all read well at 1280×720 and
  1600×900. The objective subtitle under his head is the one readability problem (HUD request above).

Still open (not in this file's power): the engine's "Get out of the red." on the whole-table doom (ENGINE request), the
objective-panel overlap (HUD request), `readySkills` / `reachOf` ignoring `canUse` (AUTOPLAY FYI), and the healer
cameo (Known issues).

## History (v1, before initiative)

- v1 author + review (2026-10-31): 480 HP, telegraphed intents planned per round (2 Fudged Rolls + Rocks Fall or a
  train + Plot Hook / Get Off), a diverted train pinned and run at his turn start, doom at the end of round N+3, stun
  guard by rounds, real-hero AutoPlay at level 10 80-89%. Review fixes kept in spirit: the diverted train survives his
  stun / taunt / dazzle, house rules show on every number, cameo leftovers adopted and capped, Plot Armor never
  outlives its round, the countdown subtitle matches the badge.
- Phase 4 (engine requests): Plot Armor clamps in `modifyFinalDamage`; the house rule carries a rule-level
  `telegraphFlat`; Exposed is a declared `takenMult`. All still in use.
