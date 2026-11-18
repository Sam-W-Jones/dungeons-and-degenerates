# HERO — Benedick the Inevitable, the 17th hero (notes)

Owner: HERO-BENEDICK (V3). Files: `js/data/heroes/benedick.js` (replaced the phase-0 stub), `tests/content/hero_benedick.js`
(replaced the stub), this file. Normative spec: `.tmp/v3/addendum-benedick.md` (plan §4.12); the user's answers (Nov 13)
stand: the shell burst, move 2, available from the start, the draft personality.

Run: `bash tools/test.sh "suite=hero_benedick&isolate=heroes/benedick,hero_benedick"` (iterate) · the cast combos and the
Party Balloons checks need the full content (no `isolate`) · `VTB=3000000 bash tools/test.sh "suite=hero_benedick: zz&sim=1&n=3&verbose=1"` (author sim).

## Summary
The user: *"Benedick - a snail, who can transform into a "dragonsnail""* (he/him). A courteous snail knight from the
margins of old manuscripts (where the snail always beats the knight): bucket helm, lance and pennant, fears salt and
"garlic butter", hoards lettuce (Betty eats it). Calm snail voice; ALL-CAPS dragon voice (caps lines name nobody).
`unlock: null`; playable in acts 1-3 while `campaign.acts` is 3. Nothing in his file mentions act 4 or Svammiel (his
Svammiel lines live in NARRATIVE's gated `svam_*` pools; the goats' bars about him in C6's file).

| | |
|---|---|
| Stats | 28 HP (+4/level), AP 3, **move 2**, **armor 2**, init −2, complexity 3, `#5fcf9b`, role "Slow shell tank · a dragon in bursts" |
| Passive | **A Sticky Situation**: at the end of his turn, Snail Slime on the bare floor of every tile he crawled off (3 rounds); grounded foes, bosses aside, that walk onto it stop there |
| Basics | Snail **Fourteen Thousand Teeth** (5, 10 on a `plant`; melee: he makes attacks of opportunity, from the shell too) · Dragonsnail **Slow Burn** (4/5/6 fire + Burn 1, range 3, by the shell's level; ranged: no attacks of opportunity) |
| Switch | **Coming Out of My Shell** (starter; 1 AP + all the AP left; cd 4/3/3): In His Shell (takenMult 0.5) until his next turn start, then the Dragonsnail for 2 of his turns (status `ben_dragon`: flying, +3 move, Slow Burn), then he lands; III bursts out for 6 fire on adjacent foes |
| Either form | Slime Line (starter) · I'll Wait · Lettuce Pray · Shellacking · Spit Shine · Snail Mail |
| Dragonsnail only | Morning Breath · Wing It · Riddle Me This (`canUse` gate) |
| Signature | **The Inevitable** (100 Hype, 2 AP): appear next to any foe (no LOS), 18 + Stun; `target.objects: false` |
| Items | Snail Mucin Serum (rare trinket, his only heal) · Racing Stripes (rare armor, +3 HP +1 move) · Do Not Disturb Sign (legendary weapon, +10% damage, a once-a-fight death-save into the shell) |

### Kit texts (level by level, exactly as the code prints them with no user)
- Teeth: "Snail form: deal 5 damage to an adjacent foe (10 if it is a plant)."
- Slow Burn I/II/III: "Dragonsnail form: deal 4 / 5 / 6 fire damage to a foe within 3 and apply Burn 1."
- Shell I/II: "Spend all your AP hiding in your shell: half damage until your next turn. Then burst out as the Dragonsnail for 2 turns: flying, +3 move, Slow Burn basic (4 / 5 fire damage within 3, Burn 1)." III adds "(6 fire damage to adjacent foes)" after "burst out" and prints 6.
- Slime Line: "Deal 3 / 4 / 5 damage to a foe 2 to 3 / 4 / 4 tiles away and pull it 2 / 2 / 3 tiles toward you."
- I'll Wait: "Taunt a foe within 4 / 5 / 6 for its next turn and gain 4 / 5 / 6 Block."
- Lettuce Pray: "You and every ally within 1 / 1 / 2 tile(s) gain 4 / 5 / 6 Block."
- Shellacking: "Deal 8 / 10 / 12 damage to an adjacent foe; it is Dazzled for 1 / 1 / 2 turn(s)."
- Spit Shine: "Cover a tile within 3 / 4 / 5 and the 4 tiles around it in Snail Slime for 3 / 3 / 4 rounds (bare floor only)."
- Snail Mail: "Post a parcel to a tile within 5 (no sight needed). At the start of your next turn, every foe on or next to it takes 9 / 11 / 13 damage."
- Morning Breath: "Dragonsnail only: deal 5 / 6 / 7 fire damage to every foe in a cone 2 / 2 / 3 tiles deep; each is Weakened for 1 turn."
- Wing It: "Dragonsnail only: deal 2 / 3 / 4 damage to every adjacent foe and push each one 2 / 2 / 3 tiles away."
- Riddle Me This (spell): "Dragonsnail only: Stun a foe within 3 / 4 / 4 (it skips its next turn)." (cd 3 / 3 / 2)
- The Inevitable: "Appear next to any foe on the battlefield (no line of sight needed): deal 18 damage and Stun it."
Every "within N" prints `DD.Targeting.reach` (a +range item shows; the shell's "within 3" is Slow Burn's reach).

## Forms, timeline and bookkeeping
- Statuses are the source of truth: `ben_in_shell` (buff, decay never, `takenMult: 0.5`: `Act.damage`, `DD.AI.estimate`
  and AutoPlay all read it) and `ben_dragon` (buff, `flying: true`, decay turnEnd, `skipFresh: false`, 2 turns).
- `unit.data.ben = { dragon, mov, look, pos, steps, dnd, dndNow }`; `syncForm(u)` (Basanos's pattern) makes the move bonus,
  the basic slot (`setBasic` keeps `usedThisTurn / uses / cd / fresh`) and the look follow the statuses; it runs from the
  passive's onCombatStart / onRoundStart / onTurnStart / onTurnEnd / onStatusApplied / onStatusRemoved / onHealed /
  onSkillUsed / onOpportunityAttack / onDowned. `peek(u)` is the read-only view (descs, canUse, scores never create data).
- The look: the shell wins (a shelled dragon after the Sign is a floating shell), then the dragon, else the def's snail.
  `showSprite` pins the old look on screen until FX playback reaches the change (Basanos's), so wrappers (Party Balloons)
  survive and previews never touch it.
- Turn start order (`onTurnStart`): parcels are delivered → the shell bursts (dragon added first, then the shell
  removed: no snail frame between) → `syncForm` → a fresh crawl record. A status added in onTurnStart is not fresh, so
  the dragon's 2 turns are exactly 2 of his turns (a stunned / asleep turn counts: he still bursts at its start).
- Cooldown semantics (verified): used on T0 with cd N → locked T1…TN. Level I: dragon 2 of 5 turns; II/III: 2 of 4.
- Landing: `ben_dragon` expires at the end of his 2nd dragon turn → `onStatusRemoved` → `syncForm` + `land()` (dust,
  "Snail again.", bark `land`, log). A dispel lands him at once (the same path).
- Safe landing (`glideIfNeeded`, in onTurnEnd while `ben_dragon.turns === 1`, before the decay and before lava ticks): a
  ground proxy (his statuses minus the dragon) decides; nothing else keeps him up (balloons) and his tile is a drop or a
  walker hazard → `Act.safeSpot` for the proxy, `teleport` + `FX.jump`, bark `glide`. A dispel over a pit still drops him
  (engine: `removeStatus` → `landed()` runs before content hooks) — documented, pinned by a test.
- Edge rules (each tested): downed in the shell → statuses gone, revived a snail, cooldown spent; shell dispelled → no
  emergence; sheep in the shell → bursts anyway (a flying sheep); an Echo Chamber echo of the shell is a no-op; every
  fight starts him a snail.

## The slime
- Recording: `onEnterTile` (his own sources) pushes `{ from, to, crawl }`; `crawl` = cause `'move'` on his turn while he
  feels the floor (his walks and his step in a swap move; pushes, pulls, teleports, The Inevitable, the glide, being
  swapped, flying never). `from` is the last recorded position; RULES' `move:undone` (a silent `Combat.undo`) moves that
  record back with him; a walk step whose record still looks stale takes the tile behind his facing.
- Laying (`onTurnEnd`, `layTrail`): `trailTiles(u)` walks the steps back from where he stands; a step that does not end
  where the chain is was taken back (skipped). Exact for every Undo the engine allows; three cases pinned (walk + undo →
  none; walk, undo, walk elsewhere → the second only; two walks, undo the second → the first only). Undo keeps working
  because nothing is laid mid-walk.
- `laySlime(x, y, turns, u)`: bare floor only (no other surface — his own is refreshed —, walkable for walkers, no pit,
  no liquid); a unit standing there doesn't matter, so Spit Shine's 5 tiles include his own (review V3; the trail never
  lists the tile he ends on: `trailTiles` skips it); `tile.surface.data.src = u.id`.
- Surface `ben_slime`: `stops: sticks(unit)` with `snagStatus: 'root'` (the shipped snag: paths, move previews and the
  walk planner know it), `react: { fire: { surface: null } }` (fire dries it), `onEnter` with cause `'move'` →
  `stuck()`: `Act.stopMove`, "Stuck!", log, the owner's `stuck` bark (35%) and the Serum heal. `sticks(u)`: alive,
  `effectiveSide === 'enemy'` (charm counts), not `Act.isBoss` (squad elites DO stick), feels the floor, not root-proof.

## Snail Mail lifecycle
Post → object `ben_parcel` (non-blocking, `targetable: false`, `hp: 0`, may sit under a unit; refused on an object tile,
a drop or an unwalkable tile; an echo can't double-post) with `data { dmg, src }` → his next turn start, first thing (even
stunned, shelled or a dragon): removed, every active foe on or next to the tile THEN takes the damage
(`noHighGround`, credited to him: kills give Hype) → if he is downed first, `returnToSender` removes it. Custom
`preview`: each foe in the footprint shows `📦 N next turn`, 0 damage now (honest); N = `mailHit(u, f, L.mail)`, what
the parcel would take off that foe if it landed now (`DD.AI.estimate` from a stand-in on the foe's tile: his Weak and
item multipliers, its armor, resist and takenMult — a cheat's included; its current Block is not counted, it expires
at the start of its own turn). Review V3: it printed the raw `L.mail` before (9 against an armoured or shelled foe).

## Items and sustain (D9)
- **His only heal is the Snail Mucin Serum**: 3 HP each time a foe gets stuck in his slime, only while he is up. No heal
  on withdraw, emergence, landing, the glide or the Sign (the D9 guard test wraps `Act.heal` through all of them).
- Do Not Disturb Sign: `preventDeath` (once a fight, `data.ben.dnd`) sets 1 HP; `onDeathPrevented` (only when the Sign
  did it: `dndNow`) stops a walk, withdraws (drains AP on his turn; no cooldown used) — a death-save, not a heal. As the
  Dragonsnail he keeps flying under the shell; the burst at his next turn start refreshes the dragon to 2 turns.
- Racing Stripes: `stats { hp: 3, mov: 1 }` → move 3 as a snail, 6 as the dragon.

## AutoPlay hooks and known gaps
- `shellScore` (the switch's aiScore, pure): the dragon's next two turns over the snail's (×2 ×0.7), + the III burst,
  + (quick pass only) 0.4 × the hits the shell would halve (`AutoPlay.incomingAt`), − what the drained AP could still
  buy as a snail, − 2. So he acts first and tucks in with his last AP, and shells early when a move-2 snail reaches
  nothing. 0 as a dragon or in the shell.
- `mailScore` (Snail Mail): Σ min(mailHit, HP) × stay × 0.9 over foes on / next to the tile (stay 0.95 stunned /
  held / asleep / frozen / sheep, 0.7 engaged, 0.6 holding a wind-up, else 0.35). `spitScore` (Spit Shine): AutoPlay's
  danger model can't see stops, so the patch is priced: min(7, 1.5 × stickable unengaged foes within 3 + 0.3 × fresh tiles),
  0 with no foe within 4.
- Gaps (sims understate a human): AutoPlay doesn't draw trail lines on purpose, doesn't bait foes onto Snail Mail, and its
  danger model ignores slime stops (V8). No enemy AI change: slime is the engine's snag, the shell is `takenMult`.

## Sprites and painters
One custom painter `drawBenedick` (three specs, `this.look`): **snail** (glossy foot with a ripple walk, spiral shell, the
lance strapped on with a red pennant, a bucket helm with an eye slit and the eyestalks through two holes; poses: hurt
retracts the stalks, cast spreads them, attack shows six teeth, blink flattens the eyes), **In His Shell** (shell on a
rim of foot, sealed door, a **BRB** sign on a nail via `g.text` — never mirrored —, pulsing ember cracks, an eyestalk
peeking every ~5 s), **Dragonsnail** (scale 1.22, hover 7: ember shell with a glowing spiral and dorsal spikes, two bat
wings with four finger bones, ivory horns, slit eyes, nostril smoke, a fire grin on attack / cast, the bucket helm hung on
the back horn, the foot dangling a slime drip; portrait framed on the head, horns and helm — review V3: it was framed
on the shell top and cut his face off). Downed: the engine's fall-over is undone and the shell lies tipped with a
white flag on a toothpick. Underlay: a slime gloss. `drawSlime` (tile-local, `g.local` placement, iridescent on its last
round) and `drawParcel` (sack, twine, stamp, a **LATE** tag) are yaw-free; The Inevitable's streak is an FX `custom` that
projects both tiles through the view. QA shots: `.tmp/hb/` (sprite sheet `s3.png`, the shell / dragon in a real fight
`sc_shell.png` / `sc_dragon.png`, `combat.png`); scratch pages `.tmp/hb/sprites.html`, `scene.html` (+ `shot.sh`, which
sources `tools/chrome_slot.sh`).

## Barks
The 13 standard keys (3-6 lines), `swap` (2, finish D7) and the custom keys `shell`, `emerge`, `land`, `glide`, `stuck`,
`mail`, `delivery`, `breath`, `riddle`, `dnd`; every line ≤ 70; the dragon's caps lines (`emerge`, `breath`, `riddle`) name
nobody; idle lines name Betty, Pebbles, Syllamin, Josiah, Kiri, Slate (party-filtered by the engine).

## Tests (`tests/content/hero_benedick.js`, 21 suites, ~3270 assertions with the full content)
definition · basics · the shell and the Dragonsnail (timeline, cooldowns 4/3/3, gates, III burst, **D9 guard**, stun /
down / dispel / sheep / echo / fight start) · safe landing (pit, deep water, lava, fire, floor, dispel over a pit, balloons)
· the trail (turn-end laying, 3 rounds, three Undo cases, swap move, nothing from pushes / teleports / the signature /
being swapped / flying / balloons, bare floor only) · Snail Slime (AI walk and scripted walk stop, the move preview's
`stop`, who passes, pulls never stop, one slime tile a walk, equal-cost paths go round, fire dries it, a taunted foe stops
short) · either-form skills at every level in both forms · dragon skills at every level (+ stunImmune, a modifyStatus stun
guard, Silence) · Snail Mail (levels, left / arrived / allies, crate and pit refusals, echo, stunned / shelled / dragon,
mail before the burst, kill credit + Hype, return to sender) · The Inevitable · items · HUD previews (every skill, level,
form) + an enemy hit on the shell · v2 edge cases · attacks of opportunity · AutoPlay scores · AutoPlay battles at L1/3/5
(+ bit-identical rerun) · the look (dispels, downs, sheep, FX pin, previews, balloons) · sprites and painters at five yaws
(renderTo) · combos with the cast (Valdris, Bark-B-Q, Kick 'Em, Hjalmar's bear trap; skipped per missing hero) · review (V3)
regressions (Spit Shine's 5 tiles, the Snail Mail preview = the hit that lands, the Sign mid-walk, a stunned last flight)
· zz sim.

## Numbers (author sims; BAL owns the balance)
- `hero_benedick: zz` (sim=1, n=3: 102 regular act 1-3 fights, random real parties with him, his starters + 1-2 pool
  skills, no items): wins 102/102 · his damage 39.6 a fight (roster 23.0-54.6), kills 1.73 · the shell in 101/101 fights of
  4+ rounds, the Dragonsnail 45% of his turns · slime stops 0.40 a fight · Snail Mail 1.05 foes a post · damage taken
  8.7 a fight · downed once.
- Fixture battles (10, L1/3/5, items at 5): 10/10 wins, the shell in every fight of 4+ rounds, dragon 15/30 turns.
- Below the spec's targets (§20) in regular fights: slime stops (0.40 < 0.5), mail (1.05 < 1.2), damage taken (8.7 <
  14-19: foes see the shell and armor 2). Measured in easy regular fights only; the campaign table (integrator) is the
  real read. Knobs in order: spec §20.

## Deviations
- ~~Race 'Snail' instead of 'Snail (Dragon, Allegedly)'~~ — **closed in review (V3)**: META-UI's Hall roster now fits
  the two-line race + class (its fit suite pads with the longest race / class / epithet), so the race is the spec's
  again; the fit suite passes at 1024×640 … 1920×1080 with it (and the 1024×768 Init-box suite), and a 1600×900 Hall
  shot shows the card on two lines (`.tmp/rvb/hall_1600.png`).
- Morning Breath's icon is 🐲, not the spec's 🌬️ (the generic Second Wind owns 🌬️; kit suite: no hero skill uses a
  generic skill's icon).
- A second gate text when the switch is not socketed: "Dragonsnail only (and Coming Out of My Shell is not socketed)."
  (Basanos's heroes-1 precedent), plus a `forgetWarning` on Coming Out of My Shell.
- The spec's step chain alone (its fallback) can't place a step taken after an Undo when the record's position is stale
  (a shorter walk the same way, a teleport): RULES' optional `move:undone` landed, so the file listens to it (registered
  in `DD.afterLoad`) and moves the recorded position back with him; a walk step whose record still looks stale takes
  the tile behind his facing (`moveAlong` / `swapMove` face him along each step). Both cases are pinned in the suite.
- Snail Mail's delivery bark is 60% (`delivery`, spec: "bark delivery"), the stuck heal logs "<name> moisturises.", and
  the slime log names the owner ("… gets stuck in Benedick's slime.").
- Two `swap` barks (finish D7: "content adds a few comedic lines"); the spec lists none.
- The emergence adds `ben_dragon` before removing `ben_in_shell` (no snail frame between the looks).
- Words: the shell's III desc is 41 words by a whitespace count (the spec says 40), so the suite's cap is 42; the other
  descs ≤ 28 (Snail Mail 28; the spec says 26).
- Spec deviations already listed in §23 hold (move 2, armor 2, complexity 3, the long transform desc, the trail at turn
  end, slime stops elites but not bosses, the glide, Slow Burn follows the shell's level).

## Requests
- ~~META-UI: the Hall roster fits a two-line race + class; the fit suite pads with the longest race + class~~ — **done**
  (META-UI); the race is the spec's again (review V3).
- ~~META-UI: the party select's details panel at 1024×768 with 17 cards~~ — **done** (META-UI; the fit suite now checks
  the stat boxes and the Init chip; the full run passes).
- **Integrator (`tests/content/kit.js`, optional owner)**: add `'ben_inevitable'` to `OPT_OUT` in "kit: finish D1 —
  object texts and tips say …" (the list of `target.objects: false` skills; reason: he arrives next to a foe, a crate is
  not worth the trip — his basic still bites one; DESIGN §4.2 now names it), and its reason in `docs/notes/kit.md`.
- ~~Lead (`docs/DESIGN.md` §6 heading)~~ — moot: the race is "Snail (Dragon, Allegedly)" again, as the heading says
  (review V3). I appended *The Inevitable* to §4.2's opt-out sentence (the
  lead's permission, that one sentence).
- **Integrator**: add `'benedick'` to `ALL` (pronoun he) in `tests/content/integration.js` and to `REAL` in
  `tests/content/shared.js` (he is registered now); `tests/sim/sim.js` header "random 4 of all N" and **`takeRewards`
  never replaces a `'shapeshift'` skill** (not landed yet: today the sim can swap out his Coming Out of My Shell, tagged
  `'shapeshift'`); README "pick 4 of 17" + his line (not an act-4 spoiler).
- **RENDER-SPRITES (optional)**: the gallery could show a def's `looks` (his shell and Dragonsnail); fallback: the
  scratch pages in `.tmp/hb/`.
- **AUTOPLAY / RULES (optional)**: `autoplay.js srcPositions` skipping tiles past a stop would let the danger model see
  slime and webs (fallback in place: `spitScore`).

## Shared pieces held by other owners (checked Nov 15)
NARRATIVE: `svam_hero_benedick` ×6, `svam_back_benedick` ×3, `svam_twist_react_benedick`, `ev_ben_bistro` — landed.
RENDER-WORLD: the fallback order ends with him, TITLE_SLOTS seat [4, 6] — landed. META-UI: `UI.HERO_ORDER` ends with
'benedick' — landed (the Hall fit: see Requests). C1-C4 named lines (Gardener, Galbraith, Granny, Zarak), C6's goat bars and
moments (`ben_dragon` read by goats.js) — landed. C5 named bark #17 ("Stop sliming my floor, Benedick! It's LINOLEUM!")
— landed. The
Coven's suite "Benedick's Snail Slime stops a hag" now runs against the real surface.

## Public API (tests / debug): `DD.Benedick`
Constants `SHELL_ST, DRAGON, SLIME, PARCEL, DRAGON_MOV, DRAGON_TURNS, SLIME_TURNS, SERUM_HEAL, SLOW_BURN, DRAGON_GATE,
DRAGON_GATE_NONE`; specs `SNAIL_SPRITE, SHELL_SPRITE, DRAGON_SPRITE`; `isDragon, inShell, shellLevel, withdraw(u, L, why),
emerge, syncForm, glideIfNeeded, sticks, laySlime(x, y, turns, u), trailTiles, parcels, deliver, landingTile, formValue,
shellScore, mailScore, spitScore, mailHit(u, f, dmg), lookOf, baseMov, enterForm(u, 'snail' | 'shell' | 'dragon')`; `painters { drawBenedick,
drawSlime, drawParcel, drawStreak, slimeGloss }`.

## Review (V3)
Adversarial review of the landed Benedick (`review:benedick`, Nov 15). Played through the real input path
(`DD.Combat.move` / `useSkill` / `endTurn` / `undo`, `DD.AutoPlay.takeTurn`), probes in `.tmp/rvb/` (`probe*.js` on a
scratch copy of the test page; `run.sh` and `shot.sh` source `tools/chrome_slot.sh`), two 50-seed campaign sims and
shots of all three looks at rot 0 / 90 / 200 (every PNG read).

**Fixed (most severe first; each pinned by "hero_benedick: review (V3) — …" or an updated assertion)**
1. **Snail Mail's preview lied against armour, Weak and takenMult.** It printed the raw `L.mail` ("📦 9 next turn")
   while the parcel landed through `Act.damage` (a 9 against armour 1 + his Weak + a takenMult status landed 6 / 3).
   Now `mailHit(u, f, L.mail)` (pure, `DD.AI.estimate` from a stand-in on the foe's tile: no high ground, as
   delivered; Block not counted, it expires at the foe's own turn start) is what the HUD prints and what `mailScore`
   prices. Regression: at levels I-III against an armoured, Blocking brute and a takenMult'd grunt, the preview's
   number equals the HP the delivery takes. A cheat's takenMult / estimateTaken mirror reads the same.
2. **Spit Shine covered 4 tiles, not the desc's 5, when aimed next to him** (`slimeable` refused the tile he stood
   on — a rule meant for the trail, which `trailTiles` already enforces). desc == execute again; the trail is
   unchanged (never the tile he ends on).
3. **The Dragonsnail's portrait cut his face off** (framed on the shell top: `{ 12, −22 }` with hover 7 left the head
   on the bottom edge). Now `{ x: 14, y: −15, r: 13 }`: head, glowing eye, horns and the helm on its horn (the HUD
   card while he flies, the turn order). Sheet: `.tmp/rvb/sheet_after.png`.
4. **Race restored to the spec's "Snail (Dragon, Allegedly)"** (the owner's deviation): META-UI's Hall roster now fits
   the two-line race + class — the ui fit suite (4 sizes, real roster) and the 1024×768 Init-box suite pass with it,
   and `.tmp/rvb/hall_1600.png` shows the card. The definition suite pins the exact race; DESIGN §6's heading matches.

**Checked and holding** (probes / runs, no change needed)
- The "act first, then tuck in" turn (1 AP + the rest; AP 0; the burst next turn start after the parcels), the shell's
  half damage in `Act.damage`, `DD.AI.estimate` and the HUD; the Dragonsnail's exactly-2 turns (also when stunned: the
  lost turn counts) and the glide — **also on a stunned last flight over a pit** (the skipped turn still runs onTurnEnd
  before the decay: no fall; now pinned); the landing; D9 (no heal on withdraw / emerge / land / glide / the Sign; the
  Serum is the only heal; campaign sim: his heals 0.9 a fight, all Serum).
- The trail through the real input path: walk + walk, Undo offered after each clean walk, slime laid at turn end on
  the tiles crawled off (2 walks → 4 tiles); the three Undo cases; the Sign mid-walk (an attack of opportunity at 1 HP
  ends the walk where the strike lands, drains the AP left, shells him, no Undo after it, slime on the tile he crawled
  off, a 1-HP Dragonsnail next turn, the switch's cooldown untouched — now pinned).
- The slime stops grounded non-boss walkers only (charm, flyers, root-proof, bosses pass; elites stick); attacks of
  opportunity (snail and shell bite, dragon never); previews of every skill at every level in both forms; dry runs deep
  copy `unit.data.ben` (`Combat.cloneState`), so previews never touch his crawl record or the Sign's charge;
  `maybeBark` draws the cosmetic RNG only (determinism).
- The Radio Edit can bleep Slime Line / Shellacking / Breath / Wing It (they deal `dmg` now), never the shell
  (`'shapeshift'`) or Snail Mail (`mail`, nothing now): honest.
- Basanos and Pebbles keep their verbs (no heal on his transform; his fire makes no floor fire); nothing of his file,
  tips, barks or event mentions act 4 or Svammiel; every hero list in his suite reads the registry.

**Numbers (review)**
- Campaign sim, `tools/sim.sh "seeds=50&from=1000&party=benedick,betty,kiri,josiah"` (acts 3, normal): 27/50 runs won
  (54%, CI 40-67), acts cleared 88 / 82 / 75%, 633 fights, **0 errors, 0 stalls, 0 DD.warn**. Benedick: 44.8 damage
  and 1.7 kills a fight (Kiri 68.2, Josiah 32.9, Betty 31.8), taken 12.5, heals 0.9 (all Serum), downs 0.13 (the
  party's lowest). His shell was socketed in only 616 of 630 fights: the sim's `takeRewards` swapped it out in 14 (the
  integrator's `'shapeshift'` rule has not landed: Remaining).
- The same with `bal=campaign.acts:4`: identical acts 1-3, but the sim never enters act 4 (the 27 DM wins are booked as
  act-4 losses "to boss_dm"): `tests/sim/sim.js` has no V3 run flow yet (integrator / BAL). So act 4 was played in a
  probe instead: all six act-4 fights (five doors and Svammiel's finale), twice each, party Benedick / Betty / Kiri /
  Josiah at level 5, AutoPlay, cameos and cheats on: 11 wins and 1 loss (Svammiel), 0 errors, 0 stalls; and at the first
  hero turn of each fight, with that door's cheat chip on (Green Thumb, Nepotism, That's a 1 Now, The Floor Is Lava,
  Initiative? Natural 20. / You Can't Skip My Cutscenes / New Seating Chart, Radio Edit), 61 of his previews compared
  with the use in a deep copy: all equal.
- His suite: 21 suites, 3,271 assertions (isolated), 0 failures. Full `tools/test.sh`: 1267 suites, 149,212 assertions,
  1 failure — `tests/content/kit.js` "finish D1" `OPT_OUT` lacks `ben_inevitable` (the integrator's file; DESIGN §4.2
  already names it).

**Remaining (not in my files)** — see the report: the sim's `'shapeshift'` rule and V3 run flow (integrator / BAL),
`ALL` / `REAL` (integration.js / shared.js), kit.js `OPT_OUT` (+ `ben_inevitable`), README "pick 4 of N" + his line,
the sim header "random 4 of all N"; RENDER-SPRITES `def.looks` in the gallery and AUTOPLAY's stop-aware `srcPositions`
stay optional.

## QA fixes (Nov 17, QA FIXER content cluster; the full list: docs/notes/boss-svammiel.md "QA fixes (Nov 17)")
- **HERO-2**: the passive, the Snail Slime surface and the loading tip name the exemption ("bosses and spiders aside",
  "not bosses or spiders", "not a boss or a spider"): root-proof foes walk through, and today the only one is the
  Cellar Spider (a suite pins "every root-proof foe is a spider, every non-boss spider is root-proof"). Passive 34 words.
- **HERO-4**: a hit on the shell pops "🐚 halved" (`onTakeDamage` on the passive; never in a dry run).
- **HERO-6**: `barks.move` / `barks.kill` are getters on the fight's Benedick: the snail's lines, or the Dragonsnail's ALL-CAPS
  lines (`DD.Benedick.FORM_BARKS`). Request (RULES, optional): a per-form bark-key prefix in `Act.bark`.
- Suite "hero_benedick: QA HERO-2/4/6".

## Conditional heal (Nov 18) — "Moisturising Routine" (build:g3; plan `.tmp/heal/plan.md` §4.10, the user's Nov 18 request)

The user (Nov 18): "I want everyone else brought up but by conditional healing" (D9: "linked to the characters
themselves"). Benedick's D9 heal (the Snail Mucin Serum's) moves into his passive: snail mucin is skincare, and a monster
stuck in his slime is a spa day. The Serum becomes an amplifier that keeps its old bonus.

- **What:** a foe gets stuck in **his** Snail Slime (`stuck(foe, tile)`, the surface's `onEnter`, owner from
  `tile.surface.data.src`; trail and Spit Shine slime alike; the unchanged stop rule: grounded, non-boss, root-able foes)
  → the owner, when he is a standing Benedick, heals `mucinOf(u)` = `MUCIN_HEAL` **3** + `SERUM_HEAL` **3** with the
  Serum (6). Slime laid by nobody or by another unit heals nobody (the slime still holds). Self only; no cap (bounded by
  stops). His transform still never heals (the D9 guard suite passes unchanged).
- **Constants:** new `MUCIN_HEAL = 3`; `SERUM_HEAL = 3` keeps its value as the Serum's bonus (tests/balance_tests.js pins
  it and "heals 3 HP"). Exported on `DD.Benedick`: `MUCIN_HEAL`, `mucinOf`, `waitScore`, `slimeBetween`, `slimeEnd`,
  `trailFor`. Tuning range: MUCIN_HEAL 3 [3, 5]; SERUM_HEAL fixed 3.
- **The call:** `A().heal(owner, owner, mucinOf(owner), { via: 'lift:benedick' })`, always called (0 HP at full HP);
  the "Moisturised!" pop-up and the "<name> moisturises." log line only when it healed. The `stuck` bark (0.35, as
  before) gained three lines: "Moisturised." / "Mucin. Very good for the complexion. Yours less so." / "I did say I'd
  wait." (6 lines).
- **Texts (desc == execute):** passive `At the end of his turn, Benedick leaves Snail Slime on the bare floor of every tile
  he crawled off (3 rounds). Grounded foes, bosses and spiders aside, that walk onto it stop there, and each one that does
  heals him 3 HP.` (43 words); Serum `Whenever a foe gets stuck in Benedick's Snail Slime, he heals 3 HP more (6 in all).`
  Both built from the constants. File header updated.
- **AutoPlay (the plan's two terms):** `spitScore` adds `n × healWorth(u, mucin) × 0.5` (n = its likely-stop count, after
  its own min(7, …)); `ben_wait` gets an `aiScore` (`waitScore`, both passes: the stop happens on the foe's turn):
  `1 + healWorth(u, mucin) × 0.6` when the target foe `sticks()` and one of HIS slime tiles lies in the box between the
  foe and him (the foe's own tile excluded), else 0.
- **AutoPlay (added, Deviation 1 below):** `PASSIVE.autoplayEnd(unit, x, y)` (engine hook E1) = `slimeEnd`: the slime he
  lays at turn end if he ends on (x, y) (`trailFor`: the recorded crawl, in a dry run the copy's own walk; for a plain move
  the `Grid.path` from where he really stands, the unit put back for the query and restored at once). Each fresh trail
  tile that a foe which sticks can reach next turn and that lies on its way to a hero-side unit (the tile it comes to
  stand on to hit that unit 0.5; a tile its straight-line walk crosses 0.4) is a likely stop, worth
  `healWorth(him, mucin)` each (at most 1.5 stops; 0 at full HP, as the Dragonsnail, in the shell or when he lays nothing).
- **Existing assertions updated to the new truth** (none deleted): the items suite's Serum desc and its +3 / 0 case (now
  +6 with the Serum / +3 without: the passive), the passive's word cap 34 → 43 (twice: definition and QA HERO-2), the items
  suite title ("his only heal" → "the bonus on his slime heal"), the zz sim's log label ("slime heals").
- **Tests:** new suite `hero_benedick: conditional heal (Nov 18)` (50 assertions): constants; passive and Serum descs word
  for word; the new `stuck` lines; a grunt walks onto his slime → +3 / +6 with the Serum (src Benedick, one labelled call);
  two stops → +3 each; full HP → one 0-HP call; a flyer, a boss and a root-proof foe walk across → no call; slime laid by
  nobody or by the knight → no heal call at all (the grunts still stop); a downed Benedick → no call, the slime holds;
  Spit Shine's and I'll Wait's previews show no heal (delayed); `spitScore` + healWorth × 0.5 with one likely stop;
  `waitScore` 0 / 1 + healWorth × 0.6 / 1 at full HP / priced at 6 with the Serum / 0 for another owner's slime, for slime
  only under the foe, for a flyer; the I'll Wait play on the foe's own turn (taunted across his slime → stuck → +3);
  `autoplayEnd` (a step back from a grunt slimes the tile it comes to → 0.5 × healWorth; a step toward it → 0; staying →
  0; pure; the same through `DD.AutoPlay.restAt` and after the real step; 0 at full HP, with the grunt stunned, as the
  Dragonsnail); AutoPlay taunts the grunt whose walk crosses his slime (two grunts alike otherwise).
- **Sanity sims** (`bash tools/sim.sh "debug=1&raw=1&seeds=30&from=50800&stop=2&party=benedick,kiri,betty,slate"`, 30 runs,
  acts 1-2; `.tmp/heal/g3/benedick*.txt`):
  - with the plan's terms only (`benedick_v1.txt`, 221 fights): `lift:benedick` **0.22 fires, 0.4 HP a fight** (overheal
    45%); regular 0.23 / 0.3, elite 0.3 / 0.7, boss 0.14 / 0.3; Serum worn in 18 fights (8%).
  - with `autoplayEnd` (shipped; `benedick.txt` = `benedick_v2.txt`, 242 fights): **0.29 fires, 0.6 HP a fight** (overheal
    32%); regular 0.3 / 0.6, elite 0.48 / 1.2, boss 0.13 / 0.4; Serum worn in 24 fights (10%): 0.17 fires, 0.9 HP a worn
    fight. 0 errors, 0 DD.warn lines.
  - a variant that also priced the stop itself (+1 a likely stop, at any HP; `benedick_v3_stopvalue.txt`): 0.28 fires,
    0.6 HP: no better, so not shipped (the heal-only term stays closest to E1's contract).
  - **T8 (min 0.4 fires, HP 0.9-3.6 a fight): still under** (0.29 / 0.6). The stops are bounded outside his file: enemy
    paths take an equal-cost detour around slime (Grid: "equal-cost paths also avoid SNAGS"), the Dragonsnail lays no trail
    and the shell turn walks nowhere (he is a crawling snail on well under half his turns), and I'll Wait / Spit Shine are
    pool skills (socketed in ~5-10% of his fights). The balance pass's T8 lever is the next step: raise `MUCIN_HEAL` inside
    [3, 5] (each +1 is about +0.2 HP a fight at this stop rate); an engine option (out of my files) would be AutoPlay's
    danger model seeing stops (the old optional request above: `srcPositions` skipping tiles past a stop).
- **Deviations:**
  1. **`PASSIVE.autoplayEnd` (E1) added**, which the plan does not list for Benedick (its AutoPlay terms are `spitScore` and
     `ben_wait`). Reason: the sanity sim put the lift at 0.22 fires a fight against T8's 0.4 minimum, and the build rule is
     "fix its AutoPlay term (your file)": his trail is laid at turn end, so a turn-end tile value is the one place AutoPlay
     can see it. Effect: +30% fires (0.22 → 0.29), still under the minimum (above). Pure, heal-priced (E1's contract).
  2. `waitScore`'s box also skips **his own tile** (the plan excludes the foe's own tile only): a foe never walks onto the
     tile he stands on, so slime under him is never "between".
  3. A stuck foe in slime **owned by another unit** heals nobody (the plan: "slime laid by nobody / another owner → 0"); the
     owner check is `defId === 'benedick'` on a hero unit, so another unit's slime (none exists today but a test's) still
     stops walkers and lets its owner bark, as before.

### DESIGN §6 brief (Nov 18)
Anchor 1 (unique in `docs/DESIGN.md`, `### Benedick the Inevitable`, lines 709-710 today):

```
- Passive *A Sticky Situation*: at the end of his turn the tiles he crawled off become Snail Slime (3 rounds); grounded
  foes, bosses aside, that walk onto it stop there.
```

Replacement 1:

```
- Passive *A Sticky Situation*: at the end of his turn the tiles he crawled off become Snail Slime (3 rounds); grounded
  foes, bosses aside, that walk onto it stop there, and each one that does heals him 5 HP.
```

Anchor 2 (unique, lines 720-721 today):

```
- Sustain (D9): his hero item *Snail Mucin Serum* heals him 3 whenever a foe gets stuck in his slime; the transform never
  heals.
```

Replacement 2:

```
- Sustain (D9 and Nov 18): each foe stuck in his slime heals him 5 (his passive); his hero item *Snail Mucin Serum* adds 3
  more (8 in all); the transform never heals.
```

### Conditional heal: test runs (Nov 18, build:g3)
`tools/test.sh "suite=hero_benedick&isolate=heroes/benedick,hero_benedick"` while iterating (all pass); then ONE full `bash tools/test.sh`: **1317 suites, 150,775 assertions ok, 0 failures**, 0 swallowed "Error in" lines.

### Conditional heal: requests (Nov 18, non-blocking)
- **Engine builder, phase 2:** apply the two DESIGN §6 briefs above; regenerate his v2-digest §2 lines (passive, Serum);
  `tests/balance_tests.js`' Benedick message ("his only heal (D9)" → "the Serum's bonus over A Sticky Situation's 3";
  values unchanged).
- **Balance pass (T8):** `lift:benedick` read 0.29 fires / 0.6 HP a fight in the sanity sim (min 0.4 / band 0.9-3.6):
  the next lever is `MUCIN_HEAL` inside [3, 5]; his AutoPlay terms (the plan's two plus `autoplayEnd`) are in.
- **AUTOPLAY (optional, engine):** a danger model that sees snag stops (`srcPositions` skipping tiles past a stop) would
  let AutoPlay value his slime on the enemies' turn directly.

### Conditional heal: adversarial review (Nov 18, review:g3)
Code path read end to end (`stuck` → owner from the surface's `src`, `active` and a Benedick hero before `DD.Act.heal`,
`mucinOf`; `slimeEnd` / `trailFor` pure: the unit is put back in a `finally`); descs == execute; the suites pass.
Forced-party sim (`seeds=30&from=55000&stop=2&party=benedick,marwyn,josiah,hjalmar`, `.tmp/heal/review_g3/benedick.txt`,
264 fights): `lift:benedick` **0.29 fires, 0.6 HP a fight** (regular 0.34 / 0.6, elite 0.31 / 0.7, boss 0.11 / 0.3;
Serum worn in 12 fights: 1.25 fires / 2.8 HP a worn fight), overheal 46% (Josiah in the party): the same reading as the
build's, still **under T8** (0.4 fires, 0.9-3.6 HP). No bug found behind it: the stops are bounded by the engine's
snag-avoiding paths and the trail's geometry (above). The balance pass's lever (`MUCIN_HEAL` inside [3, 5]) moves the HP
only (5 would read about 0.8-1.0 HP a fight at this stop rate, at the band's floor); the fires minimum (0.4) needs more
stops, which no number in this file buys: an engine change (enemy paths that do not detour around slime, or the
danger-model request above) or the lead revisiting the T8 fires row. 0 errors, 0 DD.warn, 0 stalls.

### Balance pass (Nov 18) — heal:balance: `MUCIN_HEAL` 3 → 5 (T8)
The conditional-healing balance pass (`docs/notes/balance.md` "Conditional healing pass (Nov 18)") measured
`lift:benedick` at the plan's numbers on 600 fresh campaign runs (seeds 30000-30599, normal): **0.27 fires and 0.54 HP a
fight** (± 0.12 / ± 0.31; regular 0.30 / 0.58, boss 0.14 / 0.43), under T8's minimum (0.4 fires) and band (0.9-3.6 HP), as
the build and the review found. The plan's T8 rule: his AutoPlay terms are in (the plan's two and `autoplayEnd`), so his
number moves one step a iteration inside its range: `MUCIN_HEAL` 3 → 4 (iteration 1: 0.31 fires, 0.79 HP a fight) → 5
(iteration 2, the top of [3, 5]). `SERUM_HEAL` stays 3 (fixed by the plan; the Serum reads "heals 3 HP more (8 in all)",
so `tests/balance_tests.js`' "heals 3 HP" pin holds). Only the constant moved (the passive and Serum descs, `mucinOf`
and the AutoPlay prices read it); his suites read the constant now (the pins say 5 / 8); the DESIGN §6 brief above and
DESIGN §6 say 5 / 8. The fires stay under 0.4 (the snag-avoiding enemy paths: reported to the lead in the balance notes).

### QA fixes (Nov 18, qa-fix:heal)
- **[heal QA-4] the moisturised lines only when the slime healed him.** "Moisturised." / "Mucin. Very good for the
  complexion. Yours less so." / "I did say I'd wait." moved from `barks.stuck` (back to its three old lines) to a new key
  `barks.moisturised`. `stuck()` now heals first, then barks once (0.35, unchanged): on a stop that healed him (> 0) half
  the time from `moisturised` (cosmetic `DD.rng`, never while simulating), otherwise from `stuck`. A slime owner other
  than Benedick still barks `stuck`.
- Tests: "hero_benedick: conditional heal (Nov 18)" (the two pools; at full HP only `stuck`; a stop that healed him may
  use `moisturised`). No number changed.

### Deviations (Nov 18, qa-fix:heal)
- Plan §4.10 added the three lines to the `stuck` pool. QA-4 (the lead decides): their own key, played only on a stop
  that healed him, so a full-HP Benedick never says "Moisturised." about a heal that did not happen.
