# BOSSES-ACT2 notes: Lich-tenstein and Dr. Iris

Files: `js/data/bosses/lich.js`, `js/data/bosses/beholder.js`, `tests/content/bosses_act2.js` (21 suites `bosses_act2: …`).
Scratch: `.tmp/bosses-act2/` (`scene.html` + `scene_extra.js` + `shot_scene.sh` stage exact fight moments for screenshots:
`?scene=lich_glow|lich_p2|lich_bones|lich_mortal|iris_open|iris_reflect|iris_p2|iris_closing&hover=boss`).
Isolated runs: `bash tools/test.sh "suite=bosses_act2&isolate=bosses/lich,bosses/beholder,bosses_act2"` and
`bash tools/test.sh "suite=content:&isolate=bosses/lich,bosses/beholder,bosses_act2"`.
Balance options for the sim suites (debug only): `n=`, `seed=`, `verbose=1`, `telemetry=1` (damage by source),
`curve=1` / `trace=1` (round-by-round), `only=<i>`, `party=a,b,c,d` (real heroes), `nopuzzle=1` (AutoPlay ignores the
puzzle objects), `tune=lich.N.mortal=0.4;lichtenstein.hp=270;iris_eye_beam.reflect=22` (enemy fields, a module's `N`,
a skill's level-1 numbers).

## Summary

### 1. Lich-tenstein, the Overdue Librarian (`lich.js`)
- **Arena** `boss_lichtenstein` "The Restricted Section" (act 2, kind boss, theme academy, 14×12 layout): his
  Circulation Desk at the top (walls N + W), aisles of 8 Restricted Section Shelves, 2 Card Catalogs on the side walls,
  a green Reading-Room Rug runner and the book-return chute (a pit, mark `lich_chute`) in the middle, the party deploys
  at the bottom. Starts with 2 Work-Study Skeletons. The objective subtitle tracks the puzzle live and always names the
  next step ("Phylacteries shredded 1 · left 2. Look Up a Card Catalog (1 AP), then Search the shelf that glows." →
  "Search the glowing shelf…" → "He is a Pile of Bones and renews next turn: …" → "He is Mortal Again…: finish him!").
  `onStart` deals the shelf roles with the combat RNG and the DM drops a hint ("…Libraries have a whole system for
  finding things. The Card Catalog.").
- **Boss** `lichtenstein`: 260 HP, move 2, flying, large, immune to poison and sleep, frost ×0.5, holy ×1.5. Big custom
  sprite (scale 2.1): skeleton librarian with a grey bun + pencil, half-moon glasses on a bead chain, mustard cardigan,
  library-card lanyard, an open glowing tome, a LATE date stamp, tattered purple robe, orbiting books, green soul-fire
  eyes; a "...renewing" bone pile while collapsed.
- **Planner** (custom `ai`): an **Overdue Notice** every turn (tracking, 11 + Late Fees, range 8, fizzles out of
  LOS/range) plus a 3-step rotation:
  - Phase 1: **Bookfall** (checkerboard over the party's bounding box, ⏳1, 12) → **SHHHH!** (radius 2 around him,
    ⏳1, 10 + Silenced 1; he stays put while it charges) + **Unpaid Internship** (2 skeletons, cap 3, cooldown 3) →
    **Bulk Mailing** (a second notice).
  - Phase 2 "FINAL NOTICE" (≤ 50% HP; banner + narration + bark): Bulk Mailing every turn, and **Bookfall with a
    Second Printing** (the other colour of the same region is telegraphed ⏳1 as the first wave lands: red now, amber
    next) → **Final Notice** (2 whole rows or columns, ⏳1, 24) + interns → **QUIET!!!** (radius 3, ⏳1, 14 + Silenced).
  - Desk-bound: he only drifts when nobody is in sight (about 3 tiles from the nearest hero, never far from his desk).
- **Late Fees** (`lich_late_fees`, a stacking buff on him): +2 a round from round 2 (+3 in phase 2) plus 1 per living
  skeleton, max 8. Every stack adds +1 to his skill hits, and at the end of his turn every hero pays ⌈¾ × fees⌉ HP of
  interest (ignores Block). Telegraph numbers include the fees and refresh whenever they change. **Closing time**: from
  round 13 the cap lifts (banner + DM aside), so a stalled fight always ends.
- **Puzzle — the overdue books**: 3 of the 8 shelves (`lich_shelf`) hide phylacteries (always among the 6 deepest),
  2 are mimics, 3 are just books (+5 Block or +5 HP). **Card Catalog** (`lich_catalog`, Look Up, 1 AP, once per round
  each) makes the nearest hidden phylactery shelf glow green ("Restricted Shelf — PHYLACTERY INSIDE!"). **Search**
  (1 AP) or break a shelf (8 HP):
  - phylactery → **shredded**: 25 damage to him (ignores Block), Late Fees waived, Stunned (not while Speed-Reading);
    banner, narration, bark, a green beam from the shelf to him;
  - mimic → a **Bookshelf Mimic** bursts out (6-damage surprise bite);
  - last phylactery gone (shredded, or burnt by a renewal) → **Mortal Again** (`lich_mortal`): +50% damage taken.
  - While any phylactery remains, 0 HP makes him collapse into an invulnerable **Pile of Bones** (`lich_bonepile`) at
    1 HP; at his next planning he **renews** at 25% HP by burning the phylactery farthest from the heroes (its shelf is
    scorched), reveals another hiding place and goes to phase 2. Shredding the last one while he is bones is the final
    page ("RETURNED. PERMANENTLY."). Instant kills (`Act.kill`) collapse him too.
- **Control**: any stun / freeze / charm (the puzzle's too) buys **Speed-Reading** (`lich_focus`, 2 turns immune).
- **Minions**: `lich_intern` **Work-Study Skeleton** (12 HP, move 4, OVERDUE Stamp: 6 + Marked 3; cap 3 alive, climbs
  out of the chute) and `lich_mimic` **Bookshelf Mimic** (20 HP, move 3, Paperback Chomp: 7 + Root 1).
- **Comedy**: barks for spawn / attack / hurt / death / phase / phylactery / collapse / renew; Slate cameo (the death
  bark "My golem... never even said goodbye...", the victory line where a pale blue golem peels off its name badge and
  quits, the codex desc); book titles ("Eat, Pray, Lich", "Fifty Shades of Grey Ooze") and phylactery titles ("My
  Immortal" (A Lich's Poetry Journal)).

### 2. Dr. Iris, Beholder Optometrist (`beholder.js`)
- **Arena** `boss_dr_iris` "The Optometry Wing" (act 2, kind boss, theme academy, 13×12): she floats on her exam spot
  mid-room; 6 Exam Mirrors (core `mirror`) stand on her four lines and two corners, 4 pillars give cover, a Snellen eye
  chart (`iris_chart`, blocks LOS), an exam chair (`iris_chair`), a waiting room (`iris_lino`, floater spawn).
  `onStart` gives every mirror the puzzle callbacks and a random starting angle (on-line mirrors 1–2 clockwise turns
  short of facing her, never pre-aimed), randomises her lighthouse / eye-chart offsets, and the DM drops a hint. The
  objective subtitle explains the mirrors and what currently hides you from her gaze (pillars and mirrors → X-ray: only
  mirrors → closing time: nothing, with the live damage), refreshed at each of her plannings.
- **Boss** `dr_iris`: 280 HP, move 0, flying, large, immovable, immune to sleep, poison ×0.5. Big custom sprite (scale
  2.0): a pink-veined eyeball with five eyestalks (one wears glasses, one sunglasses), teal iris, lab-coat collar,
  stethoscope, "DR." badge, head mirror, too many teeth; shows "!!" and sweat drops when a planned beam is lined up
  back at her.
- **Planner**: **Optic Rays** every turn (13; three parallel rays: the central one from her tile and two starting
  diagonally in front, so the tiles beside her stay safe) in a clockwise lighthouse — 2 lines in phase 1, 3 in phase 2,
  skipping a line that already bounces back at her. Rays pierce units, stop at walls / pillars / furniture and leave
  every mirror the way it faces; the telegraph follows the mirrors live. The rotation is planned before the beams:
  - Phase 1: **Eye Exam** (a 5×5 tumbling eye-chart "E", ⏳1, 14, the gaps are safe) → **Anti-Magic Cone** (4-tile
    cone, 7 + Silenced 1) → **Disintegrate** (tracking, ⏳2, 26, fizzles out of LOS) + **Next Patient, Please!** (2
    floaters, cap 3, cooldown 2) → Anti-Magic Cone.
  - Phase 2 "SECOND OPINION" (≤ 50%): **two** Eye Exams on two groups → cone + floaters → Disintegrate.
- **Clinical Gaze** (`iris_gaze`, a status on her whose tooltip shows the live numbers): at the end of her turn every
  hero she can see within 6 tiles takes 8 (10 in phase 2, when her X-ray vision sees through pillars but not mirrors).
  From round 8 her reach grows by 1 a round; from round 12 ("closing time") nothing blocks it and it deals 2 more each
  round, so no fight stalls.
- **Puzzle — mirrors**: Rotate a mirror (1 AP, from next to it; at most two quarter turns per mirror per round, label
  "creaky" when spent) so a beam's red line runs back into her → **REFLECTED**: 24 damage to her (credited to whoever
  turned a mirror on that path last) and she **flinches** (her beams still to come this turn fizzle). At her next
  planning she telekinetically spins every mirror that burned her around (two quarter turns to line it up again).
- **Control**: any stun / freeze / charm buys **Squinting** (`iris_squint`, 3 turns immune).
- **Minion**: `iris_floater` **Eye Floater** (12 HP, flying, move 4, keeps distance 2, Blurry Vision: 4 + Dazzled 1).

### All registered ids
- lich.js — enemies `lichtenstein`, `lich_intern`, `lich_mimic`; skills `lich_overdue_notice`, `lich_bookfall`,
  `lich_shhh`, `lich_quiet`, `lich_interns`, `lich_final_notice`, `lich_intern_stamp`, `lich_mimic_chomp`; statuses
  `lich_late_fees`, `lich_bonepile`, `lich_focus`, `lich_mortal`; objects `lich_shelf`, `lich_catalog`, `lich_desk`;
  terrain `lich_rug`; encounter `boss_lichtenstein`; narration `boss_start` (appended), `lich_start`,
  `lich_phylactery`, `lich_renew`, `lich_phase2`, `lich_victory`.
- beholder.js — enemies `dr_iris`, `iris_floater`; skills `iris_eye_beam`, `iris_eye_exam`, `iris_antimagic`,
  `iris_disintegrate`, `iris_next_patient`, `iris_floater_blur`; statuses `iris_squint`, `iris_gaze`; objects
  `iris_chart`, `iris_chair`; terrain `iris_lino`; encounter `boss_dr_iris`; narration `boss_start` (appended),
  `iris_start`, `iris_reflect`, `iris_phase2`, `iris_victory`. Uses the core `mirror`, `pillar`, `bookshelf`, `candles`.

### Balance (AutoPlay, fixture party at level 7)
| | wins | avg rounds | timeouts | puzzle use |
|---|---|---|---|---|
| Lich-tenstein (72 fights, 3 seed batches) | 65% (47/72) | 10.4 | 0 | catalog + ~3/3 shreds every fight |
| Dr. Iris (72 fights, 3 seed batches) | 57% (41/72) | 11.1 | 0 | ~7 reflections, ~16 rotations a fight |
| Lich, puzzle ignored (`nopuzzle=1`, 24) | 0% | 14.0 | 0 | — |
| Iris, puzzle ignored (24) | 0% | 12.0 | 0 | — |

The default 12-fight suites (seed 12345, about 1 s each): Lich 8/12 (67%) in 10.1 rounds, Iris 9/12 (75%) in 10.3.
Real-hero party (zarathor, marwyn, syllamin, ellaria, debug loadout, level 7, 16 fights): Lich 94% in 6.9 rounds
(6% without the puzzle), Iris 88% in 9.7 rounds (0% without it).
Tuning history: the first version let every shred stun him through Speed-Reading; AutoPlay shredded in 3 consecutive
rounds and he did nothing until round 5, then capped fees broke the party (67% wins, 11.4 rounds, long stalls). Now the
stun respects Speed-Reading, fees grow faster (+2/+3) and the payoff moved to Mortal Again (+50%). Iris's damage came
73% from the gaze and fights ran 13.6 rounds: reflection 18 → 24, gaze 7/9 → 8/10, overtime / closing time 9/15 → 8/12.

## Public API
- `DD.Act2Bosses.lich`: `N` (all numbers), `plan`, `findLich`, `data(u)` (turn / phase / renewals / collapsed / closing),
  `fight()` (per-fight puzzle stats: lookups, searches, shredded, spent, mimics), `shelves`, `phylacteryTiles`,
  `hiddenPhylacteries`, `setupLibrary(state)`, `reveal(from, who)`, `fees(u)`, `addFees(u, n)`, `waiveFees(u)`,
  `interest(u)`, `teleDmg(u, base)`, `checkerRegion(foes)`, `checkerTiles(region, parity)`, `spawnInterns(lich, n)`,
  `collapse(u)`, `reassemble(u)`, `isBones(u)`, `makeMortal(u)`.
- `DD.Act2Bosses.iris`: `N`, `plan`, `findIris`, `data(u)` (turn / phase / rot / exam / burned), `fight()` (reflections,
  rotations, flinches), `traceRay(from, dir, home)` / `traceBeam(from, dir)` (mirror-aware line tracing:
  `{ tiles, self, mirrors, segs }`), `eGlyph(size, rot)` / `examTiles(cx, cy, rot, size)`, `beamDirs(d, u)`,
  `mirrorHint(unit, mirrorObj)`, `mirrorReady(obj)`, `setupClinic(state)`, `nudgeMirrors(u)`, `spawnFloaters(u, n)`,
  `gaze(u)`, `gazeRange()`, `gazeNow(u)`, `setFacing(obj, 'N'|'E'|'S'|'W')`.
- Reusable statuses: `lich_late_fees` (stacking +1 flat skill damage per stack; the interest is the lich's own hook),
  `lich_mortal` (+50% damage taken, permanent), `lich_focus` / `iris_squint` (display of a stun-immunity window: the
  immunity itself lives in the boss defs' `modifyStatus`). `iris_gaze` only does anything on Dr. Iris.
- Minions `lich_intern`, `lich_mimic`, `iris_floater` are boss-specific (the DM's cameo pool already skips `lich_` /
  `iris_`).

## Deviations
- **Un-killing for instant kills**: a lich with phylacteries left that is killed outright (`Act.kill`) collapses in
  his `onDeath` hook (`unit.dead = false` + Pile of Bones) instead of dying. Tested: no premature victory, renewal works.
- **Collapsed state** lives in `unit.data.lich.collapsed` as well as the `lich_bonepile` status, so dispelling the status
  can't leave him invulnerable forever.
- **Minor DM asides** (catalog look-up, mimic, collapse, closing time) are logged as narrator lines by a local helper
  (`quip`, cosmetic `DD.rng`, skipped while simulating) instead of registered narration keys: the generic registry check
  in `tests/content_tests.js` treats more than 10 narration keys as "the narrator pack is loaded" and would then fail
  every isolated run. My two files register exactly 10 keys (incl. the shared `boss_start`).
- **Telegraph numbers** (review): the planners never pass an explicit `dmg`, so `DD.AI.intentDmg` computes every
  number live; the Late Fees reach the telegraphs through `telegraphFlat` on the `lich_late_fees` status (added after
  the multipliers, where the pipeline adds `d.flat`). `teleDmg(u, base)` stays as a helper with the same formula.
- `lich_late_fees` has `maxStacks: 99`; the real cap (8) is enforced in `addFees` so it can lift at closing time.
- The `iris_gaze` status desc reads the live combat state (round, her phase) for its numbers; the gaze needs the status
  (a dispel skips one gaze; she puts it back on at her next planning).
- Mirrors are the core `mirror` object: the puzzle callbacks (`autoplay`, `available`, `onInteract`, `onRoundEnd`,
  `label`) are set per instance in `onStart`, and the layout legend never carries a `data` object (MapGen copies legend
  entries by reference into every fight).
- Eye beams are `anchor: 'self'` intents with a `dir` and a custom area that traces the room, so the telegraph (and the
  hit) follows mirrors rotated mid-turn. Her beams and the Bookfall also hit her own minions (by design, said in desc).

## Core fixes
None.

## Requests
- **AutoPlay** **[Resolved at integration — see docs/notes/content-digest.md.]** heroes downed far from the healer are never walked to and helped up; a lone cleric then heals himself
  for several rounds without attacking. Every boss sim (mine, the DM's) drags 3–7 rounds at the end because of it.
- **AutoPlay**: no notion of end-of-turn auras such as Clinical Gaze (heroes never seek pillar cover). An optional
  per-enemy hint (e.g. `def.ai.dangerAt(unit, tile)`) would let AutoPlay value cover.
- **HUD**: an enemy-level `passive: { name, desc }` shown in the inspect panel (today only heroes' passives show; I used
  a status to expose Clinical Gaze).
- **tests/content_tests.js** **[Resolved at integration — see docs/notes/content-digest.md.]** base the narration-key check on a narrator-owned key (e.g. `tips` or `idle_dm`) rather than
  "more than 10 keys registered", so content files with many keys can be tested in isolation.
- **RULES (review)**: a pre-death hook (e.g. `preventDeath(unit, d)` fired in `Act.kill`/`die` before the death bark,
  "is defeated!" log, loot tally, +8 Hype and `onKill`) so a renewable boss can refuse an instant kill cleanly. Today the
  lich's `onDeath` un-kills him after all of that has happened, so his XP/gold would be tallied twice. Unreachable with
  current content (nothing calls `Act.kill` on a flying boss), but fragile.
- **HUD / RENDER (review)**: a channel for end-of-turn aura threats (Clinical Gaze, Late Fees interest) on hero cards and
  the hero inspect panel ("⚠ In Dr. Iris's gaze: 8 at the end of her turn"), e.g. an optional enemy-def
  `threats(unit) → [{ unitId, dmg, text }]` the HUD reads. Content can't fake it with a per-hero status: passives that
  cancel the first N debuffs of a fight, or debuff immunity, would eat it.

## Known issues
- Real-hero parties find both bosses easier than the fixture yardstick, the lich much more so (review, 24 random real
  parties at level 7: Lich 100% in 6.9 rounds, Iris 62% in 8.8); worth a retune after playtests with real items and the
  random passives. Same pattern as the Act 1 bosses (94% for real heroes).
- Clinical Gaze is still ~73% of the damage Dr. Iris's side deals to the fixture party under AutoPlay (171 of ~233 a
  fight), and it is the one threat with no per-hero heads-up on the board: the status tooltip, the objective subtitle,
  the DM hint and the per-turn log line explain it, but nothing marks which heroes are in her sight (see the HUD / RENDER
  request). Humans who use cover take far less than AutoPlay does.
- Ignoring the puzzles is very hard: 0% for the fixture party on both, 6% (lich) / 0% (Iris) for the real party. Both
  stay beatable in principle (renewals burn phylacteries and then he is Mortal; Iris has no invulnerability, and humans
  can use pillar cover that AutoPlay ignores), but Iris without mirrors may be too steep; her closing time (round 12) is
  the lever.
- AutoPlay never searches an unrevealed shelf (hint 0, by design), so mimics only show up for players who gamble, and
  the bone-pile / renewal path never happens in fixture sims (AutoPlay shreds all three first); both are unit-tested.
- AutoPlay fight lengths (10–11 rounds) sit at the top of the 6–10 target; real kits finish faster (6.9–9.7).

## Review (adversarial pass after the author)
Verified by running code: a scratch probe harness (`.tmp/bosses-act2-review/probe.{html,sh,js}`: every test file + probe
suites) for telegraph numbers vs the damage pipeline, charm / silence / sheep / stun on both bosses, `desc(null)` of
every status, 24 random real-hero parties per boss with invariants checked after every change (lich never invulnerable
without bones, minion caps, Iris never off her chair, no unit on an unwalkable tile, no intent tracking a missing unit),
a random-action fuzz (random moves / skills / interactions, previews included), brutal difficulty, a Burn tick
collapsing the lich on his own turn and Iris dying to her own reflection. Gallery + staged in-combat screenshots in
`.tmp/bosses-act2-review/` (`g_*.png`, `c_*.png`, `s_*.png`).

What I changed, most severe first:
1. **Telegraph numbers lied** (both bosses). Every intent carried an explicit `dmg` frozen at planning. Dr. Iris never
   refreshed hers, so a hero's Weak after she planned left the board showing 13 while the beam hit for 10, and a ⏳
   Disintegrate planned while she was Weak showed 20 and hit for 26 once the Weak ran out (probe with real heroes: 19 of
   79 hits wrong). The lich refreshed on status / fee changes, but not once the fees were capped. Now no planner passes
   `dmg`: `DD.AI.intentDmg` computes every number live, and the Late Fees reach it through `telegraphFlat` on
   `lich_late_fees` (`refreshTelegraphs` removed). Result: 0 mismatches against the pipeline's own attacker-side number
   (fixture, real heroes, brutal). New test helper `watchNumbers` + Weakened AutoPlay fights in both "previews and
   telegraph honesty" suites (mutation-checked: reintroducing a frozen beam `dmg` fails 3 assertions).
2. **Descs said "everyone" for foe-only attacks**: SHHHH! / QUIET!!! / Final Notice / Anti-Magic Cone execute on
   `ctx.foes` (his skeletons are spared) — now "each of his / her foes" (tested with a skeleton inside the SHHHH! circle).
   Bookfall says "his own minions too" (mimics are hit as well, not just skeletons).
3. **Objective subtitles went stale**: the lich's always said "Check the Card Catalog, then Search the glowing shelf",
   even with no phylacteries left; Iris's promised "Pillars block her gaze" through phase 2 (X-ray) and closing time.
   Both now name the next step / the current cover rule and update on look-ups, shreds, collapse, renewal and each of
   her plannings (tested at every state).
4. **Renewing from phase 1 skipped the FINAL NOTICE announcement** (`reassemble` set `phase = 2` silently, so a party
   that burst him from above half HP to 0 never got the banner explaining Bulk Mailing and the faster fees): it now
   calls `enterPhase2` (tested).
5. **Fallback Final Notice area was one row** while the desc says two (the default AI aims it, e.g. while charmed): the
   area fn now covers the target row and the next one (tested).
6. **Discoverability**: an Exam Mirror's label (shown in the tile inspect) now states its budget ("2 quarter turns a
   round" → "1 more quarter turn this round" → "creaky"), previously the limit only showed once spent; the shelf desc now
   says what the plain shelves give (+5 Block or +5 HP).
7. **DESIGN §5**: the Bookshelf Mimic is tier `normal` but had 16 HP (Act 2 normal: 20–30) → 20.
8. **Tests**: removed a tautology (`t.ok(!los(...) || true, ...)`) and turned four `if (los) assert else log` branches
   into hard assertions (the scenarios now assert their own premise, e.g. "the pillar hides the rogue"); dropped dead
   setup lines. 21 suites, 326 assertions (was 291), all deterministic, ~1 s for the two sim suites.

Checked and left alone: no `Math.random` in logic; `desc(L, null)` for every skill and `desc(null)` / `desc({})` for every
status; sheep can't land on either boss (engine: bosses are sheep-immune); a stun / frost / charm on the bone pile only
delays the renewal one round (Speed-Reading blocks the next); silence cancels their spell intents (a Corelos counter by
design); no hero content can move Dr. Iris (Slate checks immovable / boss, swaps respect immovable); deployment re-plans
restore their per-fight data; previews of AoEs that break a phylactery shelf preview the shred correctly. Interest still
ticks while the lich is stunned or charmed (it is his fees' status effect, like a hero's Burn); a design call, not a bug.

Balance after the review (AutoPlay, level 7, no timeouts anywhere):
| | fixture party | real random parties (24) |
|---|---|---|
| Lich-tenstein | 58% / 63% / 71% (3 batches of 24), 10.3–10.5 rounds; ~3 lookups + ~3 shreds a fight | 100%, 6.9 rounds |
| Dr. Iris | 54% / 54% / 71%, 10.3–11.7 rounds; ~7 reflections, ~16 rotations a fight | 62%, 8.8 rounds |
Damage to heroes per fixture fight: Lich — interest 96, notices 73, Bookfall 27, QUIET!!! 15, Final Notice 13; Iris —
gaze 171, beams 34, Disintegrate 15, Eye Exam 6, floaters 4, cone 3.

## Phase 4 (engine requests role) — migration in `js/data/bosses/lich.js`

The pre-death hook asked for above exists: `preventDeath(unit, d)` (docs/notes/rules.md "Phase 4"). The lich's
`onDeath` un-kill (which ran after the death bark, the "is defeated!" log, the XP/gold tally, +8 Hype and onKill) is
replaced by `preventDeath`: with a phylactery left he collapses before any of a death happens; `onDeath` now only
narrates his real death. `onTakeDamage`'s collapse at 0 HP is unchanged. Test (`bosses_act2: lich bone pile, renewal
and the final page`): an `Act.kill` on a renewable lich tallies no XP/gold, gives no Hype, fires no onKill and logs
no "is defeated!" (fails on the old code). `lich_mortal` (+50% taken, a hook) could declare `takenMult` so AI
estimates see it; not changed.
