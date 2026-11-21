# HERO-BIZ — Biz the Subcontractor, the 19th hero (h19)

Owner: HERO-BIZ (`h19:hero-biz`, wave 1). Spec: `.tmp/h19/addendum-biz.md` (normative for his content); plan
`.tmp/h19/plan.md` (§0.2 D1-D14, §1.4); the user's words: `.tmp/h19/request.md` (they win over everything). Biz is
he/him; his two constructs take "it" or no pronoun, never he / she.

## Files and run commands
- `js/data/heroes/biz.js` — the kit (hero, 11 skills, 4 construct skills, 2 summons, 3 statuses, the Scrap Heap object,
  3 hero items, 4 tips, painters, `DD.Biz`).
- `tests/content/hero_biz.js` — 25 suites `hero_biz: …` (the addendum's §18 list).
- this file.
- Iterate: `bash tools/test.sh "suite=hero_biz&isolate=heroes/biz,hero_biz"` (26 suites incl. the zz skip; the combo
  suite and the Yardstick / Hjalmar-gag checks log a skip when their content isn't loaded).
- The zz sim (all content): `bash tools/test.sh "suite=hero_biz: zz&sim=1&n=3&verbose=1"`.
- Sanity sims (plan §3.1 seed ledger, HERO-BIZ = 81000 + 100·k): `bash tools/sim.sh
  "debug=1&raw=1&seeds=30&from=81000&stop=2&party=biz,betty,kiri,josiah" .tmp/h19/biz/sanity_81000.txt`, then
  `from=81100&party=biz,betty,kiri,hjalmar`.
- Finish with one full `bash tools/test.sh`.

## The user's brief
"Biz , a lizard-man artificer who relies on his mechanical summons, Hjalmarino (a monkey) and Spooder (a spider) to
fight for him" (Nov 18). Everything else (his voice, "the Subcontractor", the cymbal toy, the teal knockoff fez, the
googly eyes, the warranty and lizard jokes, the Hjalmar gag) is the addendum's proposal and lives only in names, blurb,
flavour, barks and art (open questions Q-B1..Q-B8, plan §5.2).

## Kit table

| Piece | Id | Numbers (I / II / III or Mk I / II / III) | Notes |
|---|---|---|---|
| Hero | `biz` | 22 HP (+3/level; 31 at L4), AP 3, move 4, armor 0, init −1, complexity 3, `#3a86d4`, `pronoun: 'he'`, `unlock: null` | Lizardfolk Artificer, role "Robot commander · hides behind bots" |
| Passive | Batteries Included | both constructs at combat start; a scrapped one reboots at its Scrap Heap at the start of his 3rd turn after, a third of its HP (h19:balance) | `autoplayEnd: baskEnd` |
| Basic | `biz_rivet_gun` Rivet Gun | 3 within 3 (reach), LOS | ranged: Biz makes no attacks of opportunity |
| Starter | `biz_duct_tape` Duct Tape | Block 5 / 6 / 8 within 3 / 3 / 4, cd 1 | Biz or his constructs only |
| Starter | `biz_overclock` Overclock | +2 AP now (3 with the Remote), runs hot; bask 3 / 4 / 4; range 3 / 3 / 4; cd 2 / 2 / 1 (h19:balance) | his ONE heal (`lift:biz`); `forgetWarning` (plan D4) + tag `keystone` |
| Pool | `biz_reboot` Turn It Off and On Again | 2 AP, cd 3 / 2 / 2; III acts at once | targets a heap tile, anywhere, no LOS; full HP |
| Pool | `biz_red_button` Big Red Button | `boom` 8 / 10 / 12 to each adjacent foe; 1 AP, `charges: 1` | key `boom`, never `dmg`; `autoplayValue: boomValue` |
| Pool | `biz_hide` Nothing to See Here | Stealth 1 / 1 / 2 of his turns, cd 3 / 2 / 3 | his robots' hits keep it, his own break it |
| Pool | `biz_firmware` Firmware Update | +1 / +2 / +2 every hit, range 1 / 1 / 3, cd 1 | status `biz_updated` (skill hits + `modifyOpportunity`, `telegraphFlat`) |
| Pool | `biz_www` World Wide Web | Root every foe within 1 / 1 / 2 of Spooder, cd 3 / 2 / 2 | self target, custom area, tag `spooder` (AutoPlay `comboAt`) |
| Pool | `biz_zip_line` Zip Line | Spooder reels Biz or an ally within 4 / 5 / 5 of it next to it, cd 2 / 2 / 1 | a teleport: never provokes |
| Pool | `biz_synergy` Synergy | 4 / 5 / 6 within 4, +3 / +4 / +5 per construct next to the foe; 2 AP, cd 2 | a crate takes the listed 4 / 5 / 6 (D4) |
| Signature | `biz_spoodmarino` Spoodmarino! | reboots scrapped constructs (full HP, no AP), then 12 + Rooted to each foe within 2 of a construct | 100 Hype, 2 AP; the nearest construct is the source (ties: Hjalmarino) |
| Construct | `biz_hjalmarino` Hjalmarino (Mechanical Monkey) | HP 6 + 2 × his level, armor 0, move 4, AP 2, hop, poison-proof (h19:balance) | Monkey Wrench 3 / 4 / 5 (its attacks of opportunity), Cymbal Crash Confused (not bosses) cd 3 / 2 / 1 |
| Construct | `biz_spooder` Spooder (Mechanical Spider) | HP 4 + 2 × his level, armor 0, move 4, AP 2, Root- and poison-proof (h19:balance) | Pew Pew 2 / 3 / 4 within 3, Thwip! Rooted cd 3 / 2 / 2, range 3 / 3 / 4 |
| Items | `biz_universal_remote`, `biz_warranty`, `biz_spare_tail` | rare weapon +10% dmg (Overclock +1 AP); rare trinket (first scrap of each kind: 1 turn); legendary armor +4 HP (a death-save) | no `WORN` entry: the heal is a skill rider |

## Constructs, Mk and the scrap / reboot timeline
- Models by Biz's level: Mk I at L1-3, Mk II at L4-6, Mk III at L7+ (`MK_AT = [4, 7]`, h19:balance; was 3 / 6): the skill levels, the title
  ("Mk II", the HUD card's badge; review:biz, see "Review (h19)") and the look (`MONKEY_LOOKS[mk - 1]`,
  `SPIDER_LOOKS[mk - 1]`). HP 8/6 at L1 … 20/18 at L7 (h19:balance: −2 each).
- `build()` passes `opts.name`, `level`, `hpMult` (no RNG draw); every reader uses `kindOf()` by `defId`, so the
  generic suites' bare summons work.
- Deploy (`startingBots`): Hjalmarino in the zone, nearest the nearest foe; Spooder in the zone, next to Biz when it can,
  farthest from foes; the candidates are the free tiles within 2 of him plus every free zone tile (a zone tile beyond 2
  only when none within 2 is free, nearest him first; review:biz). Never doubled; no room → "No room to unpack Spooder.
  It stays in the box."
- Scrap (`scrapped`, the summon defs' `onDeath`, so it runs while Biz is downed): a `biz_scrap` heap on its tile (or the
  nearest free floor within 3: never over another object, never on a pit / liquid), the record
  `unit.data.biz.scrap[kind] = { left, at, order }`, the 🔧 chip `biz_rebuilding` on Biz (number = the soonest reboot).
- Timeline (h19:balance: `SCRAP_TURNS` 3, `REBOOT_FRAC` 1 / 3): scrapped after his turn T0 (or during it) → T1 start: 2
  left → T2: 1 left → T3 start: it reboots at the heap with `ceil(maxHp / 3)` HP and acts at once. Extended Warranty: a kind's first scrap waits 1 turn. Downed Biz: nothing ticks.
  No room → "No room to reboot Hjalmarino. Biz needs a bigger garage.", retried at his next turn start.
- A reboot is a NEW unit (factory settings: an Update is lost). No `DD.Act.heal` ever aims at a construct.
- `syncHeaps`: a heap other content replaced is re-placed on the nearest free floor at his turn start.

## The bask and the D9 statement
- Overclock's construct gets `biz_overclocked` (`decay: 'turnEnd'`, `skipFresh: false`, 1 turn: gone at the end of THIS
  turn, after the passive's `onTurnEnd` read it). If Biz ends that turn on one of the 4 tiles next to it, `bask()` calls
  `DD.Act.heal(biz, biz, n, { via: 'lift:biz' })` with n = 3 / 4 / 4, after an `active()` check, at most once a turn
  (`D.basked === state.turn`), the bigger number when two robots run hot.
- **D9 statement**: this is Biz's only heal. It grows out of his own verb (commanding his machines) and his race (a
  cold-blooded lizard basking). It heals only Biz, needs him standing (never a revive), reads no HP threshold (the same
  3 at 21/22 and at 3/22, pinned), fires at most once a turn and never at combat start (no shield: HP = max, Block 0).
  Its level key is `bask`, never `heal`. Rebuilds, Duct Tape, Firmware Update, the Big Red Button, Spoodmarino!, the
  Warranty and the Spare Tail are HP-neutral for him (pinned, suite 24). No skill restores HP to a living construct.
- At full HP the bask is one 0-HP call with no log (the sim counts the call).

## Items
- **Universal Remote** (rare weapon, 📡): `{ dmg: 0.1 }`; Overclock's desc and execute read `wears(user, REMOTE)`
  (units and RunHeroes): "gains 3 AP now".
- **Extended Warranty** (rare trinket, 📜): `scrapped()` sets `left = 1` on each kind's first scrap of the fight
  (`D.claimed`); the Button counts. Log "📜 Extended Warranty: Spooder reboots next turn, free of charge."; bark
  `warranty`.
- **Spare Tail** (legendary armor, 🦎): `{ hp: 4 }`; `preventDeath` once a fight (1 HP), `onDeathPrevented` stops a walk
  and teleports him to the safest free tile within 3 (fewest foes next to it, then farthest from foes, then near a
  construct); a death-save, not a heal.

## AutoPlay hooks and known gaps
- `overclockScore` (Overclock `aiScore`): `0.5 × g × bestHit(c, ap + g)` (0.5 with nothing in reach) + `k ×
  healWorth(Biz, bask)`, k = 1.5 for a robot next to him that hits from where it stands (`staysPut`), 0.4 next to him
  but it must walk, 0.5 / 0.2 for one he can walk next to (stays / walks), else 0; 0 on an unable robot or after a bask
  this turn (deviation 10: the addendum had 0.8 for any reachable robot; T8n sanity sims).
- `baskEnd` (passive `autoplayEnd`, engine hook E1): `healWorth(Biz, bask)` on a tile next to his Overclocked robot.
- `boomValue` (Button `autoplayValue`): −20 with < 2 adjacent foes and no kill; exact pass `40 + 1.5 × HP − loss`
  (undoes the dry run's ally-KO price), quick pass blast − loss; `loss = 4 + 0.3 × HP + 2 × bestHit`. Pinned by "AutoPlay
  presses the Button with three 8-HP foes next to Hjalmarino".
- `webScore`, `zipScore`, `hideScore`, `tapeScore`, `firmwareScore`, `synergyScore` (quick pass only): the addendum's §12.
- Known gaps (sims understate a human): a robot overclocked in pass 1 may walk off in pass 2; AutoPlay never stages
  pull → Button chains, swap-rescues or a pre-emptive Nothing to See Here; Biz at full HP takes no step to bask (a 0-HP
  bask is worth nothing).

## Sprites
- Biz: `humanoid` slim + `bizOverlay` (gecko snout with a tongue flick, slit-pupil eyes that blink, brass goggles that
  drop over the eyes when hurt or down, a three-spine crest, a belly stripe, the backpack with a blinking red LED and
  radio arcs when he casts, a wrench in the front hand and a rivet leaving it as he attacks, a blueprint at the back).
- Hjalmarino: `humanoid` tiny + `hjmOverlay` (`this.mk`): painted tin face, never-blinking eyes with an amber glow, a
  toothy grin, the teal knockoff fez tilted the other way (jerky tassel; gold on Mk III), cymbals (chrome from Mk II) that
  crash together on attack, a wind-up key that spins 3× faster while Overclocked, a coiled-spring tail; Mk II antenna,
  Mk III rocket heels; Overclocked glow + steam, Updated hazard tape.
- Spooder: `custom` `drawSpooder` (`this.mk`): far legs, dome, spool (brass from Mk II), antenna LED, near legs with
  tippy-taps / a walk gait / front legs rearing on attack, toy blaster (twin from Mk III), lens dots, two googly eyes
  whose pupils lag (one spins when hurt); the dead-bug pose when down.
- `drawScrap` (tile-local, billboard): the monkey's or the spider's parts, the countdown digit on a tag (`g.text`), smoke
  and a rare spark. `drawCombo` (Spoodmarino FX, projected anchor: right at any yaw).
- Suite 22 draws every spec × pose × facing × option (incl. the status looks), portraits at 26 / 30 / 64, the board at
  yaw 0 / 90 / 180 / 270 / 37.5 with both heaps, `drawScrap` and `drawCombo`; no painter warning.

## Barks and custom keys
- Biz: the 13 standard keys (3-8 lines each), `swap` ×2 (`{ally}`, no hero named), custom keys `overclock`, `bask`,
  `scrap_hjalmarino`, `scrap_spooder`, `reboot`, `boom`, `firmware`, `web`, `zip`, `hide`, `tape`, `tail`, `warranty`,
  `tin_double`. Idle lines naming Hjalmar, Pebbles, Valdris, Betty, Slate or Josiah play only with that hero in the
  fight (party filter); none names Rasma or Phat Gus (D11).
- The constructs: `spawn`, `select`, `attack`, `hurt`, `death` (beeps and clanks, no pronoun). `attack` from their skills
  (20%); `hurt` / `death` from the summon defs' `onTakeDamage` (cosmetic); `select` from the HUD.
- The Hjalmar "tin double" gag (`tinDouble`, his first turn start, Hjalmar and Hjalmarino active, `DD.rng` < 0.5, never
  while simulating): one of four literal lines on Hjalmar's unit, Hjalmarino's `spawn`, Biz's `tin_double`. Hjalmar's
  file is untouched.

## Tests
`tests/content/hero_biz.js`, 25 suites (the addendum's §18): definition (fields, pool, construct defs, statuses, object,
items, 13 bark keys, swap, bubbles ≤ 70, the D8 pronoun lint on his and the constructs' texts, D11, D7, names unique,
the Radio Edit chip, L4 HP, descs pure and capped), Rivet Gun, deploy, scrap and the timed reboot, Hjalmarino and Spooder
at Mk I-III, Duct Tape, Overclock + bask, Turn It Off and On Again, Big Red Button, Nothing to See Here, Firmware
Update, World Wide Web, Zip Line, Synergy, Spoodmarino!, items, HUD previews (every skill × level, every construct
skill × Mk), v2 edge cases, attacks of opportunity + the gag, AutoPlay hooks, AutoPlay battles (L1 / L4 / L7 since h19:balance, items at
7, deterministic), sprites and painters, combos (skipped when not loaded), the conditional heal, the zz sim (sim=1).

Runs this pass: isolated `suite=hero_biz&isolate=heroes/biz,hero_biz` 26 suites PASS (2,787 assertions); the full
`bash tools/test.sh` (Nov 19, voice and seats READY, Rasma and Phat Gus registered in parallel): 1,389 suites, 177,208
assertions, 6 failures in 4 sections, 0 swallowed "Error in" lines. Mine was one layout bug in the combos suite (Spooder
6 tiles from Marwyn), fixed and re-run green with all content (`suite=hero_biz: combos`). The other three are not his:
`hero_rasma: AutoPlay battles` (afterglow 2/5), `hero_gus: attacks of opportunity` (Delegate, no valid targets) and
`kit: registry` (`gus_hangry` uses a generic skill's icon).

## Deviations
From the addendum's own list (§23), recorded as asked: Rivet Gun 3 (the basic band is 4-6: "weak in a straight
fight") · complexity 3 · no spell-kind skill (Silence and Galbraith's Counterspell are blank against him) · a free timed
reboot in the passive · the Big Red Button's 8-12 to adjacent foes for 1 AP (once a fight, costs a robot) · the passive
desc is 40 words (two rules; h19:balance's "a third of its HP") · Overclock's heal key is `bask` · `biz_overclocked` decays the turn it is applied;
`biz_rebuilding` is a display chip with content-managed turns · Mk bands 4 / 7 (h19:balance; the addendum's 3 / 6) · two Root sources in one kit (Thwip!,
World Wide Web) · the starter order `[biz_duct_tape, biz_overclock]` for the sim (Overclock is also protected by its
`forgetWarning`, plan D4).

Build deviations (this pass):
1. **Zip Line has no custom `preview(ctx)`**: the engine's dry run previews it (the reeled unit's entry says "moved" at
   its real landing). A custom preview drops the movement flag, so the HUD's landing and the preview == reality checks
   would lose it. Honest previews win over the addendum's preview text.
2. **Scrap barks**: a Warranty claim barks `warranty` instead of `scrap_<kind>` (one bubble, not two at once on the same
   unit); a Button scrap barks only `boom` (from the skill). Every other scrap barks `scrap_<kind>` as specified.
3. **Biz's head uses `eyes: 'none'`** and the overlay paints the big slit-pupil eyes (the addendum's spec listed
   `eyes: 'normal'` and overlay eyes on top: two pairs).
4. **The constructs' `hurt` / `death` beeps** are played by the summon defs' `onTakeDamage` hook (cosmetic, 15% / 50%):
   the engine barks only for heroes and enemies. An `Act.kill` death (the Button, a generic kill) doesn't beep.
5. **Nothing to See Here** uses `glitter` particles (the FX vocabulary has no `sparkles`).
6. **`heapOk` also refuses liquid tiles** (Benedick's `slimeable` rule): a robot scrapped in shallow water leaves its
   heap on dry floor within 3, or none (then the timer reboots it next to Biz and Turn It Off and On Again can't target it).
7. **`reboot()` never doubles a kind**: if other content summoned a living construct of that def meanwhile, the record and
   its heap are cleared instead (the generic suites re-summon the defs bare).
8. **Spoodmarino!'s log for a lone robot** reads "Spooder goes it alone. SPOODMARINO!".
9. **Content advisories (warnings, not failures)** in the generic "skills execute at every level" suite: Synergy deals a
   base 7/9/11 with one robot next to the foe (a combo number, not a level number), and Spoodmarino's damage is dealt by
   the constructs (the probe counts the user's own hits only).
10. **`overclockScore`'s bask factor** (the plan's first T8n lever, an AutoPlay term in my file): ×1.5 / ×0.4 / ×0.5 /
    ×0.2 by whether the robot is next to him and whether it can hit from where it stands (`staysPut`), instead of the
    addendum's flat ×0.8 when he can end next to it. Measured above; pinned by suite 21.
11. **Hjalmarino's cymbals are held at the chest** (a tiny humanoid's hands hang at its feet, where the cymbals read as
    boots), and the small parts (cymbals, key) are outlined thinner so the outline doesn't swallow them. Art only.

## Requests
- **Integrator (`h19:integrate`)**: `ALL += 'biz'` and `REAL += 'biz'` once all three register (D5); the constructs'
  pronoun sweep (D8: `biz_hjalmarino` / `biz_spooder` name, names, desc, barks; `biz_monkey_wrench`, `biz_cymbal_crash`,
  `biz_pew_pew`, `biz_thwip` name, flavor, descs 1-3) — Biz's own suite already pins it; the optional idle lines naming
  Rasma / Phat Gus (addendum §17: "Rasma, you don't have to say please to the robots. ...Spooder likes it." · "Gus, the
  robots are not snacks. Neither is the toolbox.") are NOT in his file (D11), add them only after all three register.
- **Deferred engine / UI requests (plan D9, digest's open list; every fallback is shipped content)**: R1 RULES
  (`Act.kill` books no damage stat when the credit is the target; fallback: `selfDestruct` subtracts `hp0` via
  `Act.statOf`, pinned), A1 AUTOPLAY (`DD.AutoPlay.summonWorth`; fallback: `boomValue`'s +40 coupling, pinned), H1 HUD
  (a ghost card for a scrapped summon; fallback: the 🔧 chip, the heap digit, the log), H2 HUD (stable summon card / Tab
  order by `def.summons`; fallback: names on the cards), M1 META-UI (party-select summon list; fallback: the blurb and
  passive name both robots), S1 RENDER-SPRITES (gallery Mk II / III looks; fallback: suite 22 and a scratch scene), W1
  RENDER-WORLD (the robots at his campfire seat; fallback: the seat alone).
- **Balance (`h19:balance`)**: the knobs in the addendum's order (plan §3.5). The T8n bask reading from this pass is
  below.
- READY lines checked before the final full run: "READY: h19 voice pools" (`docs/notes/narrative.md`) and "READY: h19
  seats" (`docs/notes/ui-v2.md`) both present.

## Sanity numbers (this pass; normal, 30 seeds, `stop=2`, the HERO-BIZ seed block 81000 + 100·k)

| Reading | party | runs won | `lift:biz` per fight | robots' share of Biz-side damage | Biz taken / fight | errors / DD.warn |
|---|---|---|---|---|---|---|
| 81000, the addendum's `overclockScore` | biz, betty, kiri, josiah | 27/30 (90%) | 0.56 fires · 1.2 HP (overheal 36%) | 26.3 / 45.8 = 57% | 9.8 | 0 / 0 |
| 81000, `staysPut` term (shipped) | biz, betty, kiri, josiah | 25/30 (83%) | 0.64 fires · 1.4 HP (overheal 31%) | 25.8 / 46.4 = 56% | 10.0 | 0 / 0 |
| 81100, `staysPut` term (shipped) | biz, betty, kiri, hjalmar | 21/30 (70%) | 0.65 fires · 1.6 HP (overheal 23%) | 24.1 / 41.7 = 58% | 9.2 | 0 / 0 |

(Run-win rates at n = 30 have 95% intervals ~±15 points: not a balance reading.) The zz sim (`sim=1&n=3`, 102 fixture-free
fights at L2/3/5, random parties): robots 71% of Biz-side damage; Overclock in 99/100 fights of 4+ rounds; bask 0.78
fires and 1.9 HP a fight; scraps 1.76 a fight (report band 0.5-1.5) with 74% back before the fight ends; Biz takes 10.4 a
fight. Its diagnostic: of 250 Overclock turns he ended next to the hot robot in 80 (32%) and was hurt at that turn end in
135 (54%).

**T8n (`lift:biz` 0.8-2 fires and 3-8 HP a fight): under after the AutoPlay fix.** What I changed (the plan's first
lever, in my file): `overclockScore`'s bask term now counts in full (×1.5) only for a robot next to him that can hit from
where it stands (`staysPut`), ×0.4 for one next to him that must walk off, ×0.5 / ×0.2 for one he must walk to (the
addendum's ×0.8 for any reachable robot). The robots act again after him every pass, so a robot that has to walk to a
foe leaves him before his turn ends. Fires 0.56 → 0.64, HP 1.2 → 1.4 on the same seeds. The binding constraint is his
damage taken: he hides behind his robots as designed and takes ~10 HP a fight, so he is at full HP at the end of about
half his Overclock turns, and the other half he is usually not next to the robot that is doing the work. The next levers
are the balance pass's (plan §3.4-§3.5): the bask 3/4/4 → 4/5/5 raises HP only, not fires; or the lead accepts a lower
band for a hero who is rarely hit (a question for the lead, never a reason to touch one of the 17).

## Public API (`DD.Biz`)
Constants `HERO, HJ, SP, KINDS, ORDER, MK_AT, SCRAP_TURNS, OVER, UPDATED, REBUILD, SCRAP, REMOTE, WARRANTY, TAIL,
TIN_LINES`; queries `kindOf, mkOf, hpOf, constructsOf, constructOf, isMine, able, scrapTimers(u), heapOf(u, kind),
data(u), kindAtHeap(u, p), heapSpot, heapOk, zipSpot, tailSpot, comboArea, webArea`; actions (tests / debug) `build,
reboot, scrap(u, kind)` (kills it through the real path), `syncChip, bask, tinDouble`; AutoPlay `bestHit, canEndNextTo,
staysPut, overclockScore, baskEnd, boomValue, webScore, zipScore, hideScore, tapeScore, firmwareScore, synergyScore`; the HUD's
`baskNote(u, x, y, moved)` (the passive's `turnEndNote`, fix:polish); looks
`BIZ_SPRITE, MONKEY_LOOKS, SPIDER_LOOKS`, `painters: { bizOverlay, hjmOverlay, drawSpooder, drawScrap, drawCombo }`.

## Review (h19)
`review:biz` (plan §1.5), Nov 19. A first reviewer pass was killed at the session's end after its fixes 2-4 below and a
mutation run; this pass checked them, kept them and finished the job. Scratch: `.tmp/h19/review-biz/` (first pass) and
`.tmp/h19/review-biz/r2/` (probe pages, sims, shots).

**What ran.** The 26 isolated suites; a probe page (`r2/probe/play.js`, sourcing `tools/chrome_slot.sh`) that plays
16 real debug fights on AutoPlay (parties biz/hjalmar/kiri/josiah, biz/betty/kiri/marwyn, biz/ellaria/josiah/corelos and
the healer-less biz/corelos/slate/hjalmar; a1 normal L1, a1 boss L2, a2 elite L3, a3 normal L6) with spies on
`DD.Act.heal`, every construct's HP, scraps, reboots, heaps, Biz's downs and the barks; 60 combat starts read for the
deploy zone; Biz's turn through the HUD (Tab, Overclock aimed by `pressSlot` + click, Duct Tape, a step, auto-advance,
a robot's attack, End Turn and the bask); a robot Helping a downed Biz up through the HUD; three forced-party sims
(below); shots at rot 0 / 90 / 200 / 37.5 and the Spoodmarino FX at rot 90 (every PNG read); two mutations.

**Fixed (most severe first)**
1. **Spooder started outside the deploy zone** in 24 of 60 combat starts (every Grimble and Rat King start, a1_union_meeting
   and a1_open_mic): `startingBots` looked only at tiles within 2 of Biz, a boss map's zone is a strip, and Hjalmarino
   took the last zone tile there. Deployment can't move a unit outside the zone (`Combat.deployMove` needs the mover in
   it, and the HUD selects only heroes while deploying), so Spooder was stuck where it landed. In 23 of the 24 a zone tile
   was free 3-6 tiles away. Now the candidates are the free tiles within 2 of him plus every free zone tile; the sort is
   in the zone first, then within 2 of him (else the nearest to him), then each robot's own rule. With no deploy zone
   nothing changes. Pinned in suite 3 ("a strip zone"): the old code fails it (mutation run: 2 failures). After the fix
   the 16 probe fights and the Grimble shot (rot 37.5) start both robots in the zone.
2. (first pass, kept) **The HUD card title**: `c.title` was "Mechanical Monkey Mk I". The card shows the title where a
   hero's says "Lv 3", and it cut the names to "H" / "S…" at 1024×640 and "HJA…" at 1280×720. It is now "Mk I" / "Mk II" /
   "Mk III" (the card badge; the tooltip reads "Summon · Mk II · Biz's"; the def name "Mechanical Monkey" stays for
   the codex and gallery). Pinned in suite 3; shots at 1280×720 and 1024×640 show the full names.
3. (first pass, kept) **The 🔧 chip, the heap and the scrap log** said "in 2 of his turns" in a sentence whose subject is
   the robot (D8). They now say "of Biz's turns" (and "at the start of Biz's next turn"). Pinned word for word in suite 1.
4. (first pass, kept) **World Wide Web III**: the desc and the refusal now give its real reach ("within 2 tiles of
   Spooder", "No foe within 2 tiles of Spooder."); I and II say "next to". Pinned in suite 13.

**Checked, no change needed**
- Heals: in the 16 fights every `lift:biz` call healed Biz himself, with a robot he had overclocked that turn next to him,
  never twice in a turn, never while he was down; no heal from his kit ever reached a robot (the only heals on robots were
  Josiah's, Ellaria's and Marwyn's); no robot's HP rose without a heal. HP = max and Block 0 at every combat start.
- Scraps and reboots: every scrap left a `biz_scrap` heap with the right kind and digit (blocksMove false, untargetable);
  every timed reboot came back as a new unit id with `ceil(max / 2)` HP. Mk I / II / III titles, skill levels and looks
  matched L1 / L3 / L6 in every fight.
- HUD: Tab cycles Biz → Hjalmarino → Spooder → Biz; Overclock aimed through the HUD gives the robot 2 → 4 AP and the ♨️
  chip; with Biz's AP spent, auto-advance selects the hot robot; ending the turn next to it healed 16 → 19 through
  `lift:biz`, and ending it two tiles away healed nothing. A downed Biz keeps his slot while the robots can act (robots
  acted while he was down in the probe fights); an adjacent Spooder Helped him Up through the HUD (7 HP, 2 AP); with no
  other hero up the fight is lost at once even with both robots standing (first pass).
- The Hjalmar gag: Biz's `tin_double` played in 6 of the 16 probe fights with Hjalmar (two runs of the 8; once a fight at
  most; cosmetic `DD.rng`, nothing in the state RNG, never while simulating: suite 20).
- Pronouns: the robots' own texts carry no gendered pronoun (suite 1); Biz's lines use he / his for Biz only. No act-4
  word and no other new hero anywhere in his file (grep).
- Distinct from Ellaria's corgis, Corelos's Lawyer, Josiah's Onyx and Hjalmar's traps (two named machines with fixed
  jobs, rebuilt from heaps, no traps, no heal on them).
- The sim keeps Overclock (plan D4): socketed in 284/284, 293/293 and 243/243 fights; one replacement kept it.
- Shots (1280×720 unless named): rot 0 L1 (Mk I), rot 90 L3 (Mk II), rot 200 L6 (Mk III), rot 37.5 a Grimble deploy, the
  four-summoner HUD at 1024×640 mid-fight (each summoner's robots and pets fold into an "entourage" row, no overflow),
  the Spoodmarino FX at rot 90; the first pass read the heaps and every Mk at rot 0 / 90 / 200 and the FX at 0 / 200.
- Mutations (scratch copy, never left in place): `SCRAP_TURNS` 2 → 3 fails 27 assertions (first pass); the bask's
  `dist === 1` → `<= 2` fails 6; the old deploy candidates fail 2.
- Suites: isolated 26 suites / 2,794 assertions PASS; the full `bash tools/test.sh` after the fixes: 1,391 suites,
  177,283 assertions, 0 failures, 0 swallowed "Error in" lines (the generic suite's content advisories for Synergy and
  Spoodmarino are deviation 9, warnings only).

**Sims** (review block 84000 + 100·k; normal, 30 seeds, `stop=2`; 0 errors and 0 DD.warn lines on every page)

| seeds | party | runs won | `lift:biz` per fight | robots' share | Biz taken / fight |
|---|---|---|---|---|---|
| 84000 (before fix 1) | biz, ellaria, josiah, corelos | 28/30 | 0.51 fires · 1.1 HP | 27.9 / 48.5 = 58% | 9.3 |
| 84100 | biz, betty, hjalmar, slate (no healer) | 18/30 | 0.70 fires · 1.8 HP | 27.3 / 48.5 = 56% | 11.3 |
| 84200 | biz, betty, kiri, josiah | 26/30 | 0.51 fires · 1.2 HP | 26.2 / 44.9 = 58% | 10.7 |

The 16 probe fights: robots 64% of Biz-side damage (413 / 649). **T8n is still under** (0.51-0.70 fires and 1.1-1.8 HP
against 0.8-2 and 3-8): the balance pass's (bask 3/4/4 → 4/5/5 for HP; fires need Biz to end next to the hot robot,
and AutoPlay plays the robot after his move, so a robot that walks to a foe leaves him: an engine-side AutoPlay change,
not his file).

**Passed on (not in my files)**
- HUD: a long one-word skill name breaks mid-word on the skill bar ("SPOODMARI / NO!" at 1280×720 and 1024×640,
  "OVERCLOC / K" at 1024×640): shrink the label or hyphenate rather than break. Optional: let deployment select a
  summon (today the HUD selects only heroes while deploying; a robot moves only by a hero swapping onto it).
- Balance: T8n for `lift:biz` (above); scraps ran 1.76 a fight in the owner's zz sim (report band 0.5-1.5).
- Engine / contract (minor): the 🔧 chip is a display-only status but its type is `buff` (the contract has no third
  type), so the act-3 Rules Lawyer's OVERRULED! counts it (+4 to its aim on Biz) and dispels it; the timers live in
  `unit.data.biz`, so the reboot still happens and the chip returns at his next turn start or end. It draws a Silence onto
  a hero with no spells, so it helps the party if anything.

## Balance pass (h19:balance, Nov 20)
Numbers only (plan §3.4-§3.5, D10), every "too strong" knob of the addendum (§20) in its order, two a reading (the lead's
rule for a first reading outside 0.67-1.50×); the kit's verbs, the bask and the AutoPlay terms are unchanged.
Details and every reading: `docs/notes/balance.md` "h19 pass".
| # | knob | before | after |
|---|---|---|---|
| 1 | robot HP (`KINDS` base) | 8 + 2L / 6 + 2L | **6 + 2L / 4 + 2L** |
| 2 | reboot timer (`SCRAP_TURNS`) | 2 of his turns | **3** |
| 3 | Mk bands (`MK_AT`) | 3 / 6 | **4 / 7** |
| 4 | Overclock cooldown I-III | 2 / 1 / 1 | **2 / 2 / 1** |
| 5 | Hjalmarino armor | 1 | **0** |
| 6 | Cymbal Crash | any adjacent foe | **not a boss** ("Bosses have heard the cymbals before.") |
| 7 | a timed reboot (and a Warranty claim) (`REBOOT_FRAC`) | half its HP | **a third of its HP**, rounded up |
Every text reads the constants (the passive, the summon descs, the chip, the log, the tips, the Warranty); the suites pin
each new number. Forced reading (with Josiah, Kiri, Marwyn / Corelos, Slate, Hjalmar; 200 runs a reading): 3.31 → 2.77
→ 2.59 → 2.00 → **2.12 (1.62-2.76)**, random-pool share 1.81× (45.7%, 53/116): still a T5n miss with the list spent (the lead's question, `balance.md`). The bask
stays 3 / 4 / 4: its T8n reading (≈ 0.6-0.7 fires, ≈ 1.6-1.8 HP a fight) is short, but a heal step up would add power to
a hero the pass is cutting (also the lead's question).

### Balance fix pass (fix:balance, Nov 21; the lead's B1-B5)
The lead's levers beyond the addendum's list (tuning, not character facts), in the lead's order, two a reading while
his forced point sat outside 0.67-1.50×. Every desc, tip, test and doc follows the code. Readings, seeds and every
target: `docs/notes/balance.md` "h19 fix pass (Nov 21)".
| # | lever | before | after | iteration |
|---|---|---|---|---|
| B1 | AutoPlay, no power: Monkey Wrench and Pew Pew `aiScore: warmScore` | a hot robot walked off after Biz's last action in 23 of 121 hurt Overclock turns | an attack from a tile next to him is worth his bask (`healWorth`, in full once he can't move, a third while he can): 18 of 122 (zz), 8 of 92 with B3/B4 | 1 |
| B2 | a robot that comes back (the timer, a Warranty claim, Turn It Off and On Again, Spoodmarino!) | the timed reboot acted at once; Overclock could target any robot | it **boots up** that turn: no AP (`ready: false`), and Overclock refuses it until his next turn (`c.data.biz.back === state.turn`, the truth; the ⏳ chip `biz_booting` "Booting Up" shows it, gone at his turn end). Turn It Off and On Again III keeps "It acts at once" (its level's upgrade; Deviations) but still can't be overclocked that turn | 1 |
| B3 | Overclock's AP (`OC_AP`) | +2 (3 with the Remote) | **+1** (2 with the Remote) | 2 |
| B4 | the robots' basics | Monkey Wrench 3 / 4 / 5, Pew Pew 2 / 3 / 4 | **2 / 3 / 4**, **2 / 2 / 3** (never below 2) | 2 |
| B5 | robot HP (`KINDS` base; both steps) | 6 + 2L / 4 + 2L | **4 + 2L / 3 + 2L** (the floors; defs 6 / 5 at level 1) | 3 |

Texts that changed with them: the passive ("…on his third turn after (a third of its HP) and sits that turn out."), the
reboot skill (I / II "It spends this turn booting up (no actions, no Overclock).", III "It acts at once (but can't be
overclocked this turn)."), Spoodmarino! ("…with full HP (booting up)."), Overclock's "gains 1 AP now", the Remote
"(2 instead of 1)", the tip ("…three of Biz's turns later and spends that turn booting up."), the timer's log line
("… (a third of its HP). It is booting up."), the refusal "Hjalmarino is still booting up. Overclock it next turn.".
Suites: "hero_biz: fix:balance — …" pins the passive, the tip, B1's term, B2 (the Warranty too), B3-B5; the scrap /
reboot, reboot-skill, Spoodmarino!, Overclock, Hjalmarino, Spooder, Firmware and definition suites pin the rest, the
robot HP pins read `KINDS`; `integration.js`'s Overclock preview suite reads the level's grant.

Forced reading (R, 200 runs a reading, references paired on the same seeds): 2.07 (the audit) → 1.60 (B1 + B2) → 1.58
(B3 + B4) → **1.44 (1.05-1.97; B5)**; random-pool share 1.80× → 1.08× → **1.45×** (35.2%, 44/125; the median 24.3% outside his
interval). **Still a T5n miss on both readings with B1-B5 spent**: the pass stopped there, as the lead asked (the final
audit's reading and what I would try next are in `balance.md`). The bask stays 3 / 4 / 4: his heal step was allowed only
inside T5n. `lift:biz` reads 0.56 fires and 1.48 HP a fight (it3), short of 0.8-2 / 3-8: Overclock runs fewer turns
(1.76 a fight, was 2.31), and in a third of his hurt Overclock turns he spends his AP from his own tile rather than walk
next to the hot robot (the danger model prices the walk; B1 fixed the robot walking off).

## QA fixes (h19 qa-fix:content, Nov 20)
Findings from `qa:biz` and `qa:voice`, each reproduced and pinned by the new suite "hero_biz: QA fixes — …"; no number
moved (the signature's area is a highlight, not a rule).
- **QA-BIZ-1 (the heap's countdown)**: every Scrap Heap carries a hover label the tile inspect prints
  (`t.obj.label || od.name`): **"Hjalmarino's Scrap Heap (reboots in 3 of Biz's turns)"**, then "… in 2 …", "… at the
  start of Biz's next turn", and "… as soon as there is room" (the no-room branch), kept in step by `setHeapLeft`
  (tickScrap, reboot's no-room branch) and `placeHeap` (scrap, syncHeaps), like Hjalmar's trap labels. The painted tag
  is twice the size (12 × 10.4, digit 9.5 px with no outline stroke: the old 5-px digit wore a 1.5-px outline and read
  as a blob). The object desc says "reboots here (or as near as there is room)". Overhead widgets of units standing next
  to the heap still draw over it (render order: render-ui's, not changed here); the label carries the number in words.
- **QA-BIZ-3 (Spoodmarino!'s highlight)**: `comboArea` centres each scrapped robot on `rebootSpots(u)`, the tiles the
  sequential reboots will really take (its heap when free, else the nearest free safe tile within 3; a heap-less one
  next to Biz), each spot claimed before the next is chosen. `rebootSpot(u, rec, taken)` is shared with `reboot`.
- **QA-BIZ-7**: Spoodmarino!'s execute no longer barks `signature` (Combat.useSkill barks it for every signature
  cast); one line per cast.
- **voice-4**: move "Coming through! Mind the cables." (Valdris's "Coming through. Mind the hair.") is now **"Mobile
  workshop on the move! Watch the toolbox!"**; swap "Pardon me, {ally}. I need to be behind something." (Rasma's swap
  opener and basic) is now **"Quick reshuffle, {ally}. Management stands at the back."** The suite checks his swap
  openers against every other hero's.
- **voice-5 (tin double)**: when Hjalmar's line is "Why is it laughing like me?! Stop that!", Hjalmarino barks its
  laugh ("HEE. HEE. HEE. (Recorded.)", `TIN_LAUGH`) first; otherwise the order is unchanged. Cosmetic `DD.rng`.
- **voice-6 (robot sounds)**: each construct skill barks its own key: `wrench`, `cymbal` (Hjalmarino), `pew`, `thwip`
  (Spooder), three pronoun-free lines each; `attack` stays a generic pool (the suite's BOT_BARKS) with lines that fit
  any swing.
- Debug API additions: `DD.Biz.heapLabel(owner, kind, left)`, `syncHeaps(u)`, `rebootSpots(u)`, `TIN_LAUGH`.
- **Found on the way (the full run's one failure, also in the audit's `test_full.txt`)**: `content: v2 review — every
  barrel-aimable attack sets a barrel off` failed "biz_monkey_wrench aimed at a barrel: the barrel is gone". Its arena
  kills the deployed robots (heaps), summons a fresh Hjalmarino onto the old heap and wrenches a barrel; the barrel killed
  the robot, which could not lie on its own tile (the old heap was there) and so landed on the barrel's empty tile.
  `scrapped()` now removes a kind's previous heap before placing the new one: one heap per kind, where it fell. Pinned at
  the end of the QA suite; the content suite passes.

## Polish (fix:polish, Nov 21)
The release gate's cross-fixer requests for this file that had not landed (`docs/notes/hud-v2.md` "h19 QA fixes"
Requests, QA-BIZ-4's content half; the gate's "small things left"; `docs/notes/h19-digest.md` §7). No number changed.
- **The bask cue (QA-BIZ-4)**: `PASSIVE.turnEndNote(unit, x, y, moved)` → `baskNote` (pure, next to `baskEnd`, exported
  on `DD.Biz`). It reads the robots the way `bask()` does: his living robots Overclocked by him (`st.data.src`),
  orthogonally next to (x, y), the bigger `st.data.bask` first; a robot of his that hovers a move (`moved = { unit, x,
  y }`) counts as standing on the hovered tile. Texts: "♨️ Biz basks on Hjalmarino's hot engine: +3 HP" (the HP the bask
  restores now: min(bask, missing HP)); "… : nothing to heal (full HP)"; "♨️ Biz won't bask here: not next to Hjalmarino"
  ("… Hjalmarino or Spooder" with both hot); '' with no robot of his running hot (someone else's Overclock, a scrapped
  hot robot), once he basked this turn, or when he is down. The HUD shows it in his move hint, his robots' move hints,
  the tile panel and the End Turn tooltip (`combat_hud.js` `turnEndNote`). Display only: nothing in the engine, the AI,
  AutoPlay or the sim reads it (AutoPlay keeps `autoplayEnd: baskEnd`), so no sim number moves.
- **Stale comments**: the header said the Mk bands were "(3 / 6)"; it now reads "Mk II from 4, Mk III from 7: MK_AT".
  Cymbal Crash's comment named another new hero's skill (D11 is about lines, comments included): it now says "refused in
  canTarget with its own words".
- **Tests**: new suite "hero_biz: polish — turnEndNote says where his turn has to end for the bask …" (31 assertions: no
  hot robot → no note; next to it / a diagonal / two away; a hovered robot move toward and away from him, a cold robot's
  move; +2 HP when 2 down, "nothing to heal" at full HP; pure (no bookkeeping, status or heal call); the note agrees with
  the real turn end, "+3" → +3 and "won't bask" → nothing; two hot robots → the bigger bask, both named; someone else's
  Overclock, a scrapped robot, a downed Biz → no note; and a read of `biz.js` itself: the header's bands equal `MK_AT`, no
  line names another new hero). `tests/hud_tests.js` "hud: h19 polish — Biz: …" plays it on the real combat screen (his
  move hint next to / away from the hot robot, Hjalmarino's own move hint, End Turn, then the bask he gets there).
  `hero_biz` isolated: the Overclock, definition and polish suites PASS (1,135 assertions).
