# BOSSES-ACT2 notes: Lich-tenstein and Dr. Iris

Files: `js/data/bosses/lich.js`, `js/data/bosses/beholder.js`, `tests/content/bosses_act2.js` (25 suites `bosses_act2: …` incl. 2 debug-only,
~480 assertions, ~25 s isolated with the sims), this file.
Isolated runs: `bash tools/test.sh "suite=bosses_act2&isolate=bosses/lich,bosses/beholder,bosses_act2"` (fixture party) and
`bash tools/test.sh "suite=content:&isolate=bosses/lich,bosses/beholder,bosses_act2"`.
Real-hero sims (the balance target): add `heroes/` to `isolate` and `&real=1&verbose=1` (options: `n=`, `seed=`,
`level=`, `fights=1` (a line per fight), `telemetry=1` (damage by source), `trace=1&only=<i>` (round by round),
`party=a,b,c,d`, `nopuzzle=1`, `tune=lich.N.notice=11;lichtenstein.hp=280;iris_eye_beam.dmg=10`). Sim logs only print
with `verbose=1` (the harness shows 60 log lines per suite).
Scratch (v2): `.tmp/bosses-act2-v2/` — `scene.html` + `scene.js` + `shot.sh` (takes a Chrome slot) stage a fight moment:
`bash .tmp/bosses-act2-v2/shot.sh "debug=1&screen=combat&encounter=boss_dr_iris&seed=5&party=marwyn,zarathor,valdris,kiri&level=4&scene=iris_reflect&hover=boss" out.png 1280x720 16000`
(`scene=lich|lich_p2|lich_bones|iris|iris_reflect|iris_p2`; use ~16000 ms so the playback settles). Shots: `lich.png`,
`lich_p2.png`, `iris.png`. The v1 scratch dirs (`.tmp/bosses-act2*`) use removed APIs.

## v2 summary (initiative, boss wind-ups, no telegraphs)

Both bosses take ONE initiative turn a round (boss init +2, no `turnsPerRound`). On it: their due wind-ups land first
(engine), then they act at once and charge at most the next step of a rotation. Their big attacks are `DD.AI.windUp`s
(banner, marked tiles, ⏳, land at the start of their next turn; a stun / freeze interrupts them, so does death). The
wind-up skills are registered but **not in `def.skills`**: the rotation drives them, so the HUD's threat shading /
reach line and AutoPlay only count what the boss can really do at once (see Deviations). An enemy-level `passive`
(the HUD's inspect panel shows it, live text) states each boss's rule and **what comes next**.

### Lich-tenstein, the Overdue Librarian (`lich.js`)
- Arena unchanged ("The Restricted Section", 14×12, 8 Restricted Section Shelves, 2 Card Catalogs, the chute).
- **Boss**: 320 HP (review v2; was 300), move 2, flying, large, immune poison / sleep, frost ×0.5, holy ×1.5. Desk-bound: he only drifts when
  nobody is in reach, he stands in a hazard or he was shoved off his desk rows (walks pay attacks of opportunity).
- **His turn**: (a Pile of Bones reforms: that is the whole turn) → phase 2 at ≤ 50% → an **Overdue Notice** at once
  (12 + Late Fees to the NEAREST foe however far, ties: the most HP; no line of sight: "it's mail"; review v2, was "the best target anywhere") → the next rotation step:
  - phase 1: **Bookfall** ⏳ (checkerboard over the party's box, 11) → its **Second Printing** ⏳ (the other squares of
    the same region, charged after the first wave landed) → **SHHHH!** ⏳ (radius 2 around him, 9 + Silenced 1; shouts
    are attacks, not spells) → **Unpaid Internship** (2 skeletons at once, cap 3, cooldown 2).
  - phase 2 "FINAL NOTICE": **Final Notice** ⏳ (2 rows or columns, 20) → Bookfall ⏳ → Second Printing ⏳ →
    **QUIET!!!** ⏳ (radius 3, 12 + Silenced) → Unpaid Internship.
  - Never more than one wind-up a turn. Fallbacks: silenced → no notice, no spell wind-ups (a shout instead); nobody
    within a step of the shout circle → Bookfall; an interrupted first wave leaves no Second Printing (the shout step
    instead). (Review v2) A first wave that **lands** is always followed by its Second Printing, as its banner promises:
    if a fallback Bookfall or the phase change put another step there, the Second Printing takes that turn and the
    rotation waits a turn. A collapse (or a stun) in the middle of his own turn ends it: the bones never act or walk.
- **Late Fees** (status, one rule now): +4 at the end of each of his turns (+5 below half HP, review v2; was +3 / +4; `N.feeRate` / `N.feeRate2`), +1 per living skeleton,
  no cap; +1 damage per fee on his attacks (wind-up numbers include them live via `telegraphFlat`). Shredding a
  phylactery waives them all. v1's interest, cap and closing time are gone: the uncapped fees are his clock.
- **Puzzle** (unchanged shape): 3 phylacteries among the 6 deepest shelves, 2 mimics, 3 plain shelves (+5 HP now, was
  Block-or-HP). Card Catalog (1 AP, once a round each) makes the nearest hidden phylactery glow; Search (1 AP) or break
  it (8 HP): **25 damage, fees waived, Stunned** (interrupts his pending wind-up; not while Speed-Reading). None left:
  **Mortal Again** = he can no longer reform (`N.mortal` is a damage-taken knob, 0 now; v1 +50%). While one is left, 0
  HP → invulnerable **Pile of Bones**; his next turn he **reforms** (25% HP, burns the farthest phylactery, reveals
  another, enters phase 2) and does nothing else that turn. Shredding the last one while he is bones finishes him.
  While he is bones his skills cool down through the reform turn (`holdSkills`: `Act.setCooldown(…, 1)`), so the HUD's
  reach line / threat shading and AutoPlay (`AI.reachOf`) don't count a notice that is not coming.
- **Speed-Reading**: any stun-like (stun, frozen, `stunLike` statuses) or charm buys immunity for the turn he loses plus
  his next 2 (`N.focus` 3).
- **Minions**: Work-Study Skeleton (12 HP, move 4, OVERDUE Stamp 5 + Marked 2, melee: its stamp is its attack of
  opportunity), Bookshelf Mimic (20 HP, Paperback Chomp 6 + Root 1). Default reach-aware melee AI.

### Dr. Iris, Beholder Optometrist (`beholder.js`)
- Arena unchanged ("The Optometry Wing", 13×12, 6 Exam Mirrors, 4 pillars, eye chart, exam chair, waiting room).
- **Boss**: 220 HP, move 0, immovable, flying, large, immune sleep, poison ×0.5.
- **Her turn**: charged wind-ups land (Eye Exam / Disintegrate first, rays last) → phase 2 at ≤ 50% → the next step:
  - phase 1: **Eye Exam** ⏳ (a tumbling 5×5 eye-chart "E", 12, the gaps are safe) → **Anti-Magic Cone** (at once,
    4-tile cone, 9 + Silenced 1, cooldown 2) → **Disintegrate** ⏳⏳ (26, tracks its target, lands in 2 of her turns,
    fizzles out of sight) + **Next Patient, Please!** (2 floaters at once, cap 3, cooldown 2).
  - phase 2 "SECOND OPINION": two Eye Exams → cone + floaters → Disintegrate.
  - → then she charges **Optic Rays** ⏳ (12; three parallel rays per line, 2 lines of her 4 in a clockwise lighthouse,
    3 in phase 2, skipping a line that already bounces back). They land at her next turn start and follow the mirrors
    live (anchor 'self', custom traced area). Rays are attacks (silence doesn't stop them); Exam / Disintegrate are
    spells.
- **Puzzle — mirrors** (core `mirror` + instance callbacks): turn one (1 AP, from next to it, 2 quarter turns per mirror
  per round) so a charged ray runs back into her → **REFLECTED: 20 damage to her, that mirror SHATTERS** (each mirror
  reflects once) and she **flinches** (her other charged rays fizzle: review v2, her `onTurnStart` puts a ray that
  bounces back first, so even rays charged before it fizzle). v1's "she spins the mirror back next turn" was
  farmable once rays became wind-ups (AutoPlay reflected every round: 10 reflections = her whole HP).
- **Clinical Gaze** (her `passive` + def hooks `onTurnEnd` / `threatAt`): at the end of her turn every hero she can see
  takes 6 — whole room, line of sight — **except right next to her** (far-sighted: melee heroes holding the line on her
  are spared). Pillars and mirrors block it; phase 2: 7 and X-ray (only mirrors block); **closing time** from round 14 (review v2; was 12):
  nothing blocks it, +2 a round (no stall behind cover). A stunned Iris doesn't stare. The `iris_gaze` status is gone.
- **Squinting**: as Speed-Reading (lost turn + 2).
- **Eye Floater**: 12 HP, flying, move 4, Blurry Vision 5 + Dazzled 1, ranged (keep distance 2).
- **AutoPlay hint** (`mirrorHint`): reads the charged ray WIND-UPS (the v1 `!(delay > 0)` filter found nothing in v2: 0
  reflections in every sim); value = reflection gained + hero hits avoided per quarter turn, else (nothing to gain on a
  charged line) 0.3 × a reflection for PREPARING a mirror two turns short of one of her lines.

## Balance (AutoPlay v2, normal, full HP, no items or Blessings)

Real heroes = random parties of 4 of the 16 loaded heroes with the v2 run loadout (2 starting skills + one boon per level
gained), 32 fights per batch. Numbers drift a little while other areas edit hero files.

| | L4 real heroes (pooled batches) | L3 real heroes | L4 fixture party |
|---|---|---|---|
| Lich-tenstein (review v2: nearest-foe notice, 320 HP, fees +4/+5) | **~75%** (72 / 66 / 88% in 3 batches of 32, seeds 0–2), ~10.2 rounds, 3.2 downs, 64–69% HP lost | **~65%** (66 / 63 / 66%, seeds 0–2), ~9.9 rounds, 2.8–3.6 downs, 73–77% | passes its band |
| Lich-tenstein (author, old notice rule, 300 HP, fees +3/+4) | ~79% (seeds 0–2: 78 / 75 / 84%), 3.1–3.8 downs, 56–62% HP lost | 66–69% | 50%, 15.3 rounds |
| Dr. Iris (review v2: flinch first, closing time round 14; re-run with today's hero files) | **~71%** (81 / 63 / 69%, seeds 0–2), 12.2–14.0 rounds, 1.5–2.8 downs, 61–76% HP lost | **~56%** (66 / 38 / 66%), 14–15 rounds, 2.2–3.4 downs, 77–85% | 8%, 18.3 rounds (author) |
| Dr. Iris (before the review, same hero files) | ~72% (84 / 56 / 75%) | ~49% (59 / 47 / 41%: closing time at round 12 caught the average L3 fight, 13.6 rounds) | |

Review v2 A/B over 128 fights per level (seeds 3 + 5, n=64 each): old notice rule L3 67% / L4 78% (downs 4.4 / 3.5);
nearest-foe rule alone L3 80% / L4 86% (downs 2.7 / 2.2: much easier); nearest + 320 HP + fees +4/+5 (shipped) L3 67% /
L4 81% (downs 3.6–4.0 / 2.8–3.2). Same win rate as before, fewer downs, and the notices land on whoever stands in front
(probe, 24 L4 fights: on the lowest-HP hero 23% of the time, was 50%; on a hero at ≤ 30% HP 13%, was 27%; hero downs
67, was 81).

No timeouts anywhere. Puzzle use per fight: lich 3 look-ups + 3 shreds (every fight); Iris ~3.3 reflections, ~6 quarter
turns. Damage to heroes per real L4 fight: lich — notices ~110, skeletons ~10, Final Notice 7, Bookfall 6, SHHHH! 2;
Iris — gaze ~68, floaters ~27, cone ~20, rays ~11, Eye Exam 2. AutoPlay dodges nearly every wind-up (it reads them
exactly); humans will get hit more, so the human difficulty is likely a notch above these numbers.
The suites guard: no timeouts, puzzle engagement, fixture band (not a walk; won now and then or the boss left under
35%), and with `real=1` the strict band 55–92% in ≤ 14 rounds.

Tuning history (v2): first cut (lich 230 HP / notice 9 / LOS / range 8; Iris 240 HP, v1 mirrors): both 100%, wind-ups
fully dodged, Iris killed by ~10 reflections. Then: fees +2/+3 uncapped, Bookfall always reprinted, Mortal bonus off,
notices ignore LOS, Iris mirrors shatter, whole-room far-sighted gaze, X-ray phase 2, closing time; the lich stalled
twice (boxed in by downed heroes while the last hero kited outside 8 tiles) → notices reach any foe, then he needed 300
HP (he no longer drifts away from melee). Later fees +3/+4. Review v2: notices to the nearest foe, 320 HP, fees +4/+5.

## Tests (`tests/content/bosses_act2.js`, 23 suites + 2 debug-only, ~480 assertions)
Lich: arena / roles / registry (skill list = at-once skills, wind-ups named in the codex, passive text) · attacks deal
their desc damage (notice through shelves and from the far corner, Bookfall squares, SHHHH! / QUIET!!! radii and spared
staff, Final Notice rows + fallback, stamp + mark, chomp + root, minions' attacks of opportunity) · wind-ups land at his
next turn start (announced, HUD-listed, live number with fees), the heroes' window, a stun on a hero turn interrupts
(windup:cancel) and costs his turn, Speed-Reading for the lost turn + 2 · Late Fees (end-of-turn growth, skeletons, phase
2 rate, flat on hits, live wind-up numbers with Weak, no cap, waiver, none while bones) · rotation (5 turns of phase 1,
fallbacks: nobody close, silenced; phase 2 order; Second Printing = the other colour of the same region; no reprint after
an interrupted first wave) · puzzle (catalog, shred = 25 + stun interrupting his wind-up + waiver, mimic, plain shelf,
broken shelves) · bones / reform takes the turn / final page / Mortal Again / preventDeath · caps + control (stun,
frozen, charm, sleep; a charmed lich turns on his staff) · previews + honesty (scripted: heroes standing in 14 turns of
wind-ups with Weak / fee changes, both phases; AutoPlay fights; areas) · AutoPlay sims.
Iris: arena / registry / mirror setup · beam tracing · charged rays (land at her turn start, reflection + credit +
shatter + flinch, skipped bouncing lines, floaters hit, a stun interrupts all) · rays follow the mirrors live, mirror
budget + labels · Eye Exam gaps, cone, Disintegrate (2 turns, LOS fizzle) · rotation + phase 2 (lighthouse, two Exams,
rays last) · gaze (cover, whole room, far-sighted, threatAt / AutoPlay.auraAt, stunned, X-ray, closing time, subtitle) ·
cap + squinting · mirror hints (charged rays, budget, preparing, AutoPlay rotates and reflects in a real fight) ·
previews + honesty · AutoPlay sims.
Review (v2) suite "lich review (v2): the bones never act or walk, the Second Printing always follows": a collapse
mid-turn (thorns) charges nothing, no reach while bones (also stunned bones), an attack of opportunity collapse stops the
walk, the fallback Bookfall's Second Printing comes and the rotation resumes, the phase change keeps it, the passive's
Next after an interrupted wave, the notice to the nearest foe / its passive "now:" / a taunt redirects it. The desc
suite also checks the nearest-foe rule and its tie. Review (v2) suite "review (v2): a collapse at his turn start leaves
the heroes a turn; a reflection fizzles every other ray". Debug only: `zz probe notice targets` (`probe=1&real=1`).

## Public API
- `DD.Act2Bosses.lich`: `N` (review v2: `N.noticeNearest` 1 = notices to the nearest foe), `ROTATION`, `WINDUPS`, `plan`, `findLich`, `data(u)` (turn / step / phase / renewals /
  collapsed / reprint), `fight()` (lookups, searches, shredded, spent, mimics), `shelves`, `phylacteryTiles`,
  `hiddenPhylacteries`, `setupLibrary(state)`, `reveal(from, who)`, `fees(u)`, `addFees(u, n)`, `waiveFees(u)`,
  `teleDmg(u, base)`, `checkerRegion(foes)`, `checkerTiles(region, parity)`, `spawnInterns(lich, n)`, `collapse(u)`,
  `reassemble(u)`, `isBones(u)`, `makeMortal(u)`, `nextStep(u)`, `passiveText(u)`, `noticeTarget(u, foes)`.
- `DD.Act2Bosses.iris`: `N`, `WINDUPS`, `plan`, `findIris`, `data(u)` (turn / phase / rot / exam), `fight()` (reflections,
  rotations, flinches, shattered), `traceRay(from, dir, home)` / `traceBeam(from, dir)`, `eGlyph` / `examTiles`,
  `beamDirs(d, u)`, `mirrorHint(unit, mirrorObj)`, `mirrorReady(obj)`, `setupClinic(state)`, `spawnFloaters(u, n)`,
  `gaze(u)` (runs the end-of-turn gaze), `gazeRange()`, `gazeNow(u)` → `{ dmg, range, xray, closing }`,
  `gazeThreat(u, hero, tile)`, `setFacing(obj, 'N'|'E'|'S'|'W')`, `passiveText(u)`, `chargedBeams(u)`.
- Removed since v1: lich `interest`; iris `nudgeMirrors`, the `iris_gaze` status, `data.burned`.

## Deviations
- **Wind-up skills outside `def.skills`** (lich: Bookfall, SHHHH!, QUIET!!!, Final Notice; Iris: Optic Ray, Eye Exam,
  Disintegrate). `AI.reachOf` (threat shading, the inspect panel's reach line) and AutoPlay's `readySkills` treat every
  ready damaging skill in the list as something the unit can do at once; a 30-range custom-area wind-up skill there
  shades the whole board and made AutoPlay expect a Final Notice-sized hit on anyone, every turn. Outside the list they
  are wound up by id (`api.windUp`: level 1, the planner tracks its own rotation); the passive line and the codex
  `desc` ("Moves: …") name them. The HUD's Abilities box (first 4 slots) lists only the at-once skills.
- Enemy-level `passive: { name, icon, desc(u) }` on both bosses (the HUD reads it; the contract's §3.6 doesn't list it).
- **Late Fees grow at the end of his turn**, not at the round start: a round-start growth raised a wind-up's number
  after the heroes' last turn before it landed (the scripted honesty test catches it).
- **Overdue Notice**: `target.los: false`, range 30; the planner sends it to the nearest foe (ties: the most HP; review v2, `N.noticeNearest` 0 = the old engine scoring); desc "to the nearest foe, however far (on a tie, the one with the most HP) … walls and shelves don't stop it".
- Tests start the real arenas with `DD.Combat.start(setup, { sandbox: true, initiative: 'heroesFirst', enemyAi })` so
  turns can be handed out with `giveTurnTo` (an abandoned hero turn emits no `turn:end`, hence `scriptedHonesty`
  snapshots the numbers itself; `watchNumbers` snapshots at hero `turn:end`s for AutoPlay fights).

## Core fixes
None.

## Requests
- **ENGINE / AUTOPLAY (+ HUD)**: a declarative skill flag, e.g. `windupOnly: true`, that `DD.AI.reachOf`, `DD.AI.threatMap`
  and AutoPlay's `readySkills` skip (and the default planner never uses at once). Bosses could then keep their wind-up
  skills in `def.skills` (Abilities box with cooldowns, codex "Moves") without phantom at-once threats. Every boss with a
  wind-up skill in its list has the same distortion today (the fixture boss's Meteor, range 12).
- **HUD**: the Abilities box shows `slotsOf(u).slice(0, 4)`; a boss passive line is the only place for the rest. If the
  flag above lands, list wind-up skills there too, tagged ⏳.
- **Lead (ARCHITECTURE §3.6)**: document enemy `passive: { name, icon?, desc: string | (unit) => string }` (HUD-read).
- (Review v2) **ENGINE** (`ai.js` `describe`): every wind-up's hover text ends "Stun, sleep, freeze or polymorph X to
  interrupt it." Bosses are immune to polymorph (`Act` refuses sheep on bosses), both act 2 bosses are immune to sleep,
  and while Speed-Reading / Squinting (3 turns after a stun) they shrug off stuns and freezes too: the hint tells players
  to try things that cannot work. List only the counters that would land now (a pure immunity / `modifyStatus` dry
  run), or say "can't be interrupted right now (Speed-Reading)".
- (Review v2) **ENGINE**: `AI.reachOf` ignores a skill's `canUse` (AI `usableSlots` honours it). With it, content could
  say "not on its next turn" declaratively; the lich's Pile of Bones uses `Act.setCooldown(…, 1)` on his skills instead.

## Requests (Nov 3) — content sweep for the user's v2 requests (flyers, barrels, aimed heals)

Lich-tenstein, Dr. Iris and her Eye Floaters fly, so the engine now skips every floor effect for them: hero fire, poison
puddles, webs, brambles, runes and traps under them do nothing (attacks, blasts and clouds still do). Neither arena has
plates, lava or boss surfaces, and both puzzles are interactions (shelves, the catalog, mirrors), so they stay solvable
by walkers and nothing in the boss code reads the floor under a flyer (the lich's "stands in something nasty" drift uses
the per-unit `hazardAt`, which is now clouds only for him). No code or text change was needed. No object here explodes
(shelves, mimics and the chair don't); no skill here is a hero's (nothing to opt out, nothing that revives).
- **Tests**: `bosses_act2: v2 requests (Nov 3) — …` (16 assertions: for the lich, Dr. Iris and a floater: they fly, fire
  under them is no hazard for them, they end a turn over fire without Burn (with a walking-knight control that does
  Burn), steam still reaches them).
- **Rotation (box props, plan `.tmp/wf7/rotation-design.md` §7 P2)**: `lich_shelf`, `lich_catalog`, `lich_desk` and
  `iris_chair` are `yawAware: true`, so their boxes stand on the view's ground quad and turn with the board.
  - Shelf books and catalog drawers run along each visible face's bottom edge (`f.x0 … f.y1`, the classic face edges at
    yaw 0). Every side of a shelf holds books: one seeded stream walks S, E, N, W, so the classic two faces keep their
    books and every side keeps its own as the map turns. The OVERDUE sticker stays on the south side.
  - The desk's bell and returns slip lie on its top. The exam chair's seat, backrest and lamp are mapped as raised points
    over its base, so they turn with it.

  The default view is pixel-identical (per-state painter hashes, the frozen `renderTo` arenas and `tools/shot.sh` at
  rot=0, before vs after). Suite: `bosses_act2: the library furniture and the exam chair turn with the map (box props,
  yawAware)`, 25 assertions.

## Review (v2) — adversarial review of the act 2 bosses (ADVERSARIAL REVIEWER role)

Scope: `lich.js`, `beholder.js`, `tests/content/bosses_act2.js`, this file. Everything was checked by running code
(isolated suites, probes, mutation runs, real-hero AutoPlay sims, `.tmp/bosses-act2-v2/shot.sh` screenshots in
`.tmp/ba2rev/`: lich, lich phase 2, bones, Iris reflect, Iris phase 2).

**Verified (held)**: every desc number is what lands (all levels: bosses have one), wind-up numbers live and honest
(scripted 14-turn checks + AutoPlay fights + area checks), a hero turn always between a wind-up and its landing, a stun
on a hero turn interrupts (windup:cancel) and costs the boss's turn, Speed-Reading / Squinting = the lost turn + 2, no
stun-lock, sheep refused (bosses), sleep immune; caps (3 interns, 3 floaters, 2 mimics only by gambling) hold over long
passive fights; no soft-lock (bones always reform or die; a stunned pile of bones just reforms a turn later; all four of
Iris's lines pre-aimed only switches her rays off); phases land with banners; the puzzles are discoverable (subtitle +
narration name the next action) and AutoPlay engages both every fight (lich 3 look-ups + 3 shreds; Iris ~3.3
reflections); attacks of opportunity: interns' stamp and mimics' chomp are their reactions, the lich and Iris (casters)
make none, the lich's walks price them (`aooCost`), Iris and her floaters have no melee; the minions use the
reach-aware default AI. Iris: flinch removal is safe inside `resolveWindups` (it skips intents no longer listed),
mirrors are indestructible (core `hp: 0`), the gaze spares adjacent heroes (melee holds the line). Visuals: wind-up
tiles, labels and numbers readable; phase 2 of Iris is busy (3 ray lines + 2 E's) but every line is labelled and safe
tiles remain (AutoPlay takes ~4 Eye Exam damage a fight).

**Fixed** (regressions in the two "… review (v2) …" suites and the desc-damage suite; each mutation-checked):
1. **A pile of bones kept acting.** A collapse in the middle of his own turn (a thorny hero's retaliation on his notice;
   an attack of opportunity on a walk) let the planner go on: the bones fired notices and charged a Final Notice that
   then landed, from the bones, before the reform. Now the turn ends at once (`done()` after the walk and the notice).
2. **The bones walked on.** A collapse from an attack of opportunity didn't stop the walk (collapse isn't down / stun /
   root). `collapse` calls `Act.stopMove`.
3. **"A Second Printing follows" was a broken promise.** A fallback Bookfall (the SHHHH! step with nobody close) and the
   phase-2 change both carried the banner "(a Second Printing follows)" and the desc "follows on his next turn", but the
   rotation moved on (interns / Final Notice). Now a first wave that lands is always followed by its Second Printing
   (the rotation waits a turn); the desc reads "When a first wave lands, he charges its Second Printing on the other
   squares" (true for the Second Printing's own hover too); the passive's "Next:" names it while a first wave is
   charged, and names SHHHH! when a first wave was interrupted (the reprint step then is the shout step, with its
   Bookfall fallback).
4. **Phantom threat from the bones.** The HUD reach line / threat shading (and AutoPlay) showed "Lich-tenstein 12" on
   every tile while he was a pile of bones whose next turn is the reform. His skills now cool down through it.
5. **The notice sniped the weakest hero anywhere** — the user's "mobs prioritize the lowest health hero irrespective of
   range" in boss form: scored like a normal shooter with infinite range, half of the notices hit the lowest-HP hero
   (27% a hero at ≤ 30% HP, e.g. just Helped Up) and they caused 75 of 81 hero downs in 24 L4 fights. Now it goes to the
   **nearest foe** (ties: the most HP), stated in the desc and live in the passive ("now: Marwyn"); a taunt still
   redirects it. Melee heroes in front of his desk shield the backline. Counter-tuned to keep the win rate (HP 300 →
   320, fees +3/+4 → +4/+5): see Balance.
6. **He reformed in the turn he collapsed.** His own landing wind-up hitting a thorny hero at his turn start collapsed
   him, and the planner (which runs right after the wind-ups) reformed him at once: a phylactery burnt and no hero turn
   against the bones. A collapse during his own turn now waits for his next one (`collapsedOwn`, cleared at his turn
   end). ("bosses_act2: review (v2): a collapse at his turn start …")
7. **Dr. Iris: rays charged before the reflecting one still landed.** Wind-ups land in the order charged, so a
   reflection only fizzled the rays after it, while the desc says "her other rays fizzle". Her `onTurnStart` (it fires
   before wind-ups land) now puts a ray that bounces back first among her rays. (same suite)
8. **Dr. Iris at level 3: 49%** (59 / 47 / 41% over 3 batches; the author measured one batch, 69%). Closing time at
   round 12 hit the average L3 fight (13.6 rounds). Now round 14: L3 ~56%, L4 unchanged (~71%).
9. Stale numbers: the notes said fees +2/+3 (code +3/+4), both file headers had old gaze / fee numbers.
An earlier, interrupted attempt at this review left probes in `.tmp/ba2rev/probe*.js` (fixes 1, 6 and 7 were its
findings too) and baseline sims in `.tmp/ba2rev/sims_base.txt`; nothing of it had reached the source files.

**Remaining / not changed**: Dr. Iris's Disintegrate still aims at the foe in sight closest to dropping (a 2-turn
wind-up with line-of-sight counterplay: allowed by the targeting rules for wind-ups aimed on purpose; ~1 damage a
fight in sims). Iris's flinch removes rays without a `windup:cancel` event (the HUD reads `unit.intents` live). The
generic interrupt hint and `reachOf` / `canUse` are requested above.

**Last full `bash tools/test.sh`** (end of the review): 800 suites, 2 failing sections, both `integration` ("cross-content
consistency": v1 hero unlocks / "ten real heroes"; "losing a protect objective": the "Objective Failed … XP" step) —
not this area. All 23 `bosses_act2` suites (+2 debug-only skips) and all 8 `content:` suites pass; no swallowed errors.

## Known issues
- AutoPlay dodges almost every wind-up (it reads them exactly), so in sims the bosses' pressure is the notices + fees and
  the gaze; the wind-ups mostly cost AP and position. Humans will eat more of them.
- 32-fight batches swing ±10–15% with party composition (Iris: 63% vs 88%); pool batches before drawing conclusions.
- The fixture party (weak kit) rarely beats Dr. Iris (8–25%); real kits do (63–88%). The default (isolated) sim band is
  therefore loose; the strict band needs `real=1`.
- AutoPlay solves the phylactery puzzle in every fight by round ~5 (3 look-ups, 3 shreds), so the Pile of Bones /
  reform path almost never happens in sims (unit-tested); it never searches an unrevealed shelf, so mimics only meet
  players who gamble.
- AutoPlay doesn't know the lich's rotation (it sees each turn as "a notice"); charged wind-ups are read once announced.
- (Review v2) `AI.reachOf` shows his notice on every tile at full damage although only the nearest foe gets it (an
  over-estimate for the heroes behind the front line). AutoPlay doesn't know the nearest-foe rule either.
- (Review v2) Lich fights still average ~3 downs at L4 (3.6 at L3): the uncapped fees make a long fight brutal by
  design (shred to reset them).

## History (v1, superseded)
v1 (telegraph era, fixture party at level 7): Lich-tenstein 260 HP with a notice + 3-step rotation every planning,
Late Fees with interest / cap 8 / closing time, Mortal Again +50%; Dr. Iris 280 HP with telegraphed beams planned and
fired in the enemy phase, a mirror she spun back after each reflection, a 6-tile gaze with X-ray / overtime / closing
time. Balance then: lich 58–71%, Iris 54–71% (fixture L7). The v1 review (frozen telegraph numbers, "everyone" descs,
stale subtitles, renewal skipping the phase-2 banner, Final Notice fallback area, `preventDeath` for instant kills) is
all carried over: live wind-up numbers, "each of his foes" descs, subtitles that name the next step, `enterPhase2` on
reform, the two-row fallback, `preventDeath`.
