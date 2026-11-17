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
