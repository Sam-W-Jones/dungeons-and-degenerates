# C4 — THE COVEN (act IV, door 4)

Owner: C4 (V3 build, plan `.tmp/v3/design.md` §3.4, §5.3, §6.2, §8.4 Content; names unchanged by the Nov 6 overrides).
Files: `js/data/bosses/coven.js`, `tests/content/boss_coven.js`, this file.

## What landed
- **Encounter `boss_coven`** — "Tea with the Coven", `act: 4`, `kind: 'boss'`, `weight: 0`, `gauntlet: { lane: 'coven', order: 4,
  hint: 'Hold the cauldron. Break their line of sight.' }`, `shortName` "The Coven", `icon` 🫖, `banner: false`, `cameo: { start:
  'svam_cameo_coven', cheat: 'svam_cameo_lava', interjections: true }`, `objective: { type: 'boss', bossIds: [the three], flavor }`
  (a squad boss fight: no boss-tier unit, MAPGEN's `buildObjective` keeps it), `reward: { goldMult: 0.9, itemRarity: 'rare' }` (P5).
  Theme `a4_cottage` (MAPGEN). Intro = V §8.4's; Granny's intro line is logged at the start (squad members have no `boss` field).
- **The bog garden** (14 × 13, plan §3.4's layout verbatim): mossy ground (`moss`), bog (`cov_bog`, cost 2), pools (`water`), six
  gnarled trees (`tree`, labelled), the gingerbread cottage on chicken legs (`cov_cottage`, blocks movement and sight) at (2,1), the
  Family Cauldron (`cov_cauldron`) at (7,5), four Stirring Spots (`cov_spot`) on its neighbours (7,4) (6,5) (8,5) (7,6), four Swamp
  Gas Bubbles (`cov_bubble`) at (2,3) (13,3) (5,8) (10,8). Spawns: Mildred (7,2), Granny (4,4), Brine (10,4); deploy rows 10-11. The
  cameo's lava patch (x 6-8, y 7-9) is 9 open floor tiles, as C5's `lavaPatch` expects.
- **The three** (act-4 elites, tags `coven` + `hag`, no `boss` field, `pronoun: 'she'`; HP 105 / 115 / 100 = 320, the plan's):
  - **Cousin Mildred** (night hag; init +1, move 4, flies on Granny's broom) — holds **the Eye** (status `cov_eye`): the encounter's
    `onStart` makes her the owner of Granny and Brine, whose defs say `actsWithOwner` (E1), so the Coven has one initiative entry,
    Mildred → Granny → Brine. **Bedtime Hex** (Asleep until the end of the Coven's next turn, within 5, cd 3; on the hero with a heal
    ready, else the hardest hitter), **Night Terror** (10 psychic within 5, 20 on a sleeper, who wakes; the skill's `telegraphFlat`
    shows the 20 in reach / threat numbers). Keeps 3 out, prefers tiles that put a Hex Thread through heroes. Her death drops the
    Eye: a log line, `cov_eye` narration, Granny's `eye` bark, `DD.Cameo.say('svammiel', 'svam_phase')`; Granny and Brine get
    their own entries at the next round start (`mergeJoiners`).
  - **Granny Gristle** (green hag; armor 1, move 3) — the cook: heads for a free Stirring Spot and stays; there she stirs first and
    then fights from it. **Cheek Pinch** (10 + Rooted through its next turn; her attack of opportunity), **Eat Your Greens** (8
    within 4, cd 2; the ground within 1 of the target turns to bog: walkable, non-liquid tiles without a blocking object).
  - **Auntie Brine** (sea hag; move 4) — **Undertow** (9 within 4 + pull 2 toward her; the AI pulls spot-holders off first: +14),
    **I Was Beautiful Once** (Confused through its next turn, every foe within 2 that can see her; cd 2; on 2+ heroes). With nobody
    to pull she takes a free spot. She acts last and picks her end tile for the most heroes on her threads.
- **The Rite** (fight rule `cov_coven`, chip "🧪 Brew N/6 · threads N", live name/desc; the objective's flavour line mirrors the Brew
  and the pie, the E7 fallback the HUD already hashes):
  - **Stir the Pot** (every hag's slot; `canUse` refuses with a reason off a spot, with the cauldron tipped, or at Brew 6): a hag who
    starts her turn on a spot stirs first (Brew +1, she sips 6 HP), then acts — unless a hero stands next to her while the Brew is
    below 3. Granny stirs whenever she can; Mildred and Brine below Brew 3 only with nobody in reach.
  - **Family Recipe: Hero Pie** (`cov_pie`, `windupOnly`, not a slot): at Brew 6, at the end of the Coven's turn, the first hag of
    that turn who can (the Eye-holder first; not stunned / asleep / frozen / sheep / charmed) winds it up over the whole board
    (marked tiles = every tile, like the DM's doom). It lands at that hag's next turn start: 23 to each hero and hero summon on the
    marked tiles and Slowed on its next turn; Brew 0. An interrupt (stun, sleep, freeze, sheep) drops the Brew to 3 (`checkPie`, run
    from the hags' `onStatusApplied` / `onTurnStart` / turn end and deaths); the cook's death kills the pie (no drop; Into the Pot
    +2, capped at 6, so the next Coven turn winds again); a tip cancels it (Brew 0).
  - **Hex Threads** (`cov_thread` holds the number, 8): at the end of the Coven's turn (the turn owner's `onTurnEnd`, after every hag
    has acted; after the split, the end of each hag's own turn for the threads touching her) every two weaving hags (not stunned,
    asleep, frozen, charmed or a sheep) within 7 with line of sight are joined by a thread = the tiles of `DD.Grid.los`'s walk
    between them. Each hero-side unit on a thread takes 8 psychic (from the thread's first sister, so Weak / difficulty apply) and is
    Weakened through its next turn, once per thread; each thread fires at most once a round. A pure `threatAt` on each hag reports the
    threads she heads (no double counting); threads are drawn as E8 zones in `state.data.zones` (ids `cov_thread:<a>-<b>`).
  - **Into the Pot**: a fallen hag, Brew +2.
- **Objects**: the **Family Cauldron** (hp 0, blocks movement not sight, `codex: true`; **Tip Over** 2 AP from next to it, only in
  the Coven's fight and upright): Brew 0, a pending pie fizzles (`cancelIntents`: Svammiel's `svam_countered` can fire), everyone
  within 1 incl. the tipper takes 8 (cause `surface`: no armor, no multipliers; kills credited to the tipper as environmental) and
  Poisoned 2; it rights itself at the end of the next round (no stirring meanwhile); label "The Family Cauldron (Brew N/6)"; AutoPlay
  hint: pending pie = its number × the party + 6, Brew 3+ = 6 × Brew, minus 8 per hero-side unit within 1 (the tipper too), plus 6
  per hag within 1. **Stirring Spot** (non-blocking, hp 0; AutoPlay 'step' hint 4 + 3 × Brew while a hag off the spots could reach
  it). **Swamp Gas Bubble** (hp 2, volatile, fire sets it off): 10 fire within 1, then smoke on those 5 tiles until the end of the
  next round (cuts threads). **The cottage**. **The Eye** codex entry (`cov_the_eye`, an unplaced object: see Deviations).
- **Squad rules**: a hag never dies to a fall (`preventDeath` on `cause: 'fall'`: climbs out 15 HP poorer); Grandma's Remedy (a
  per-hag stun guard, V's name) exists as the knob `DD.Coven.N.remedy`, off (like the League's union rules).
- **Voice** (≤ 70 per bubble, first person or by name, she/her only): V §8.4's spawn / attack / hurt / death / named lines per hag,
  plus stir, pie, tipped, last, hex, visage, pull, Granny's `eye`, and the sister-falls matrix (`mourn_<sister>`, every fallen hag
  has both sisters' lines). Named lines by hero id (`DD.Coven.NAMED`; Benedick's verbatim: "Benedick, dearie! I've a lovely garlic
  butter for you."). Banter: V's six + two Baba Yaga nods (Skylla's patron), round starts from round 2, 25%, at most every other
  round. Roll call at round 1. Narration `cov_tip` (the plan's two DM whispers), `cov_eye`, `cov_pie_windup`, `cov_pie`,
  `cov_tipped`, `cov_death` (V's two). Codex descs V's, with one mechanics sentence each.
- **Art** (humanoid + overlays, rotation-safe billboards; bog green + teal + plum): Granny stocky and hunched (green skin, bun,
  warty nose, the one Tooth, knitting needles and a ball of yarn), Brine tall and slim (teal skin, long seaweed hair, barnacles,
  a dripping ladle, a bubbles aura), Mildred slim in a nightgown (long white hair, a floppy nightcap with a pompom, sleepy eyes, a
  pink dream lantern, Granny's broom under her, the Eye floating over her head while she holds it). Painters: the cauldron (pot,
  legs, bubbling green brew that turns orange while the pie cooks, ladle, "N/6"; on its side while tipped), the spot (a worn ring
  and a spoon), the bubble (a wobbling translucent dome), the cottage (gingerbread house on folded chicken legs, icing, gumdrops),
  bog tiles (dark puddles). Checked at rot 0 / 90 / 180 / 200 / 270 (`.tmp/cov/*.png`).

## API (others use)
- `DD.Coven = { N, SK, ST, ENC, RULE, SISTERS, NAMED, BANTER, LAYOUT, ids…, data(state), brew(state), setBrew(n), addBrew(n), pot(state),
  upright(state), onSpot(unit), spots(state), stirWhy(unit), lineTiles(a, b), threads(state), fireThreads(state, group),
  threadThreat(enemy, unit, tile), maybePie(state, group), checkPie(state), tipOver(unit, tile), tipValue(…), spotValue(…),
  turnEnd(unit), sync(state), ruleDesc(), namedLine(unit), hexVictim(unit, foes), pullEnd(to, v, n), bogTiles(p), stats(state) }`.
- `DD.Coven.stats(state)` → puzzle engagement for the sims: `{ stirs, full, pies, pieLanded, pieStopped, pieTipped, tipped, threads,
  threadHits, spotsHeld (hero-side units on spots at round ends), intoPot, eyeDropped, sleeps, terrors (sleeper hits), bubbles,
  bogged, dragged }`.
- Fight state: `state.data.coven = { brew, pie: { unitId, round } | null, tipped: <round it rights at the end of> | 0, eye, eyeRound,
  pot: { x, y }, fired: { [threadKey]: round }, banterRound, banter, rolled, last, over, stats }`.
- Test params (the AutoPlay suite): `real=1&n=&level=&seed=` (random real parties; `level=5.5` alternates 5 and 6; needs the hero
  files: `isolate=coven,heroes`), `hpx=`, `knobs=key:value,…` (`DD.Coven.N`), `lv=skill.key:value,…`, `fights=1`.

## Numbers (author sims: random real parties of 4 at L5.5, no items / Blessings / consumables, full HP, normal, the real path)
`tools/test.sh "suite=boss_coven: AutoPlay&isolate=coven,heroes&real=1&verbose=1&n=80&seed=<s>"`:

| build | seeds × fights | win rate | rounds | downs / fight |
|---|---|---|---|---|
| plan §3.4 numbers, stir as the hag's action, 1-turn sleep | default × 40 | 90% | 11.2 | 1.6 |
| plan numbers, Bedtime until the Coven's next turn | default × 40 | 90% | 11.6 | 1.6 |
| + stir first, then act | default × 40, 31 × 80, 41 × 80 | 88 / 80 / 90% (≈ 86%) | 11.6-11.9 | 2.1-2.4 |
| Terror 9/18, Greens 8, Undertow 8, thread 8, pie 22 | 3 × 80 | 81 / 79 / 79% | 12.1-12.6 | 2.6-3.4 |
| Terror 10/20, Pinch 11, Greens 9, Undertow 9, thread 8, pie 24 | default × 40, 31 × 80, 41 × 80 | 75 / 60 / 59% | 11.9-12.3 | 3.2-3.6 |
| Terror 10/20, Greens 8, Undertow 9, thread 8, pie 22 | 3 × 80 | 79 / 66 / 76% (74%) | 12.6-12.7 | 3.2-3.5 |
| … pie 24 | 4 × 80 | 69 / 63 / 70 / 65% (67%) | 12.2-12.7 | 3.0-3.6 |
| **shipped: Terror 10/20, Pinch 10, Greens 8, Undertow 9, thread 8, pie 23** | 12345, 31, 41, 61 × 80 | **73 / 63 / 73 / 68% (69%)** | 12.3-12.8 | 3.2-3.6 |

Band (plan §7.1, five doors): author 66-74% at L5.5 → **69%**. Every squad hit stays in the act-4 band 7-11 (§3.0.5); the pie is the
squad's one big wind-up (20-26 band of the solo mini-bosses). Per fight (shipped, seed 12345, 80 fights): heroes take Night Terror 48,
the Hero Pie 33, Undertow 22, threads 21, Cheek Pinch 14, their own tips 11, Eat Your Greens 10; the Coven takes ~295 from the heroes
(~24 a round) and sips 16. Engagement a fight: 7.4 stirs, 1.1 Brew 6, 1.1 pies (0.5 landed, 0.4 tipped, 0.1 interrupted), 1.1 tips,
5.3 hero-held spot-rounds, 3.6 thread hits, 1.8 sleeps and 1.0 Night Terror on a sleeper, 0.8 bubbles, 0.5 drags. Order of the
fallen: Brine (round ~7), Mildred (~10, the Eye drops in 80% of fights), Granny (~12). 0 timeouts in ~1,900 sims, no "Error in".
Author sims run long and down a lot (item-less parties at ~24 damage a round; the League's shipped author numbers: 13-13.7 rounds,
3.0-3.8 downs); BAL owns the campaign numbers (plan: 7-10 rounds, ≤ 1.1 downs).

## Deviations (from the plan, with reasons)
- **Bedtime Hex: "Asleep until the end of the Coven's next turn, so it loses its next turn"** (plan: "through its next turn"). With
  the plan's duration the sleeper always woke at the end of its own lost turn, which always comes before the Coven acts again, so
  Night Terror's sleeper damage could never land (author sims: 0 a fight). Now the hero still loses exactly one turn whatever the
  initiative order, and the Coven's next turn can cash it in (1.0 a fight). Built on the core `sleep` (stun-like, wakes on damage,
  the HUD's "Asleep. Zzz.") with `turns: -1`; `covenTurnEnd` wakes it at the second Coven turn end (`st.data.covTurns`).
- **Stir first, then act** (plan §3.4's AI: a hag next to the cauldron stirs *instead* of fighting). As an action the pot only
  delayed the hags' damage (six hag-turns traded for one wind-up the party tips) and its pace depended on whether a hero was in reach.
  Now a hag who starts her turn on a spot stirs and still acts; "a hero next to her while the Brew is below 3" stops the stir (the
  plan's "fights instead" became "doesn't stir"). Stir the Pot's desc is unchanged and exact; the passives and the rule say it.
- **Numbers after the author sims**: Night Terror 8/16 → 10/20, Eat Your Greens 7 → 8, Undertow 7 → 9, Hex Thread 7 → 8, Hero Pie
  20 → 23 (the plan's §3.4 knobs: thread, pie). HP stays 105 / 115 / 100. The plan's numbers won ~86% (band 66-74%); HP is §7.1's
  lever for an easier door, damage for a harder one, and the fights already run long.
- **"Bog costs her 1" (Granny) is not built**: `DD.Grid.stepCost` reads the terrain's cost only (no per-unit hook). She pays 2 like
  everyone (an optional RULES request below).
- **Hex Threads after the split** fire at the end of each hag's own turn for the threads touching her, and **each thread at most once
  a round** (else the last thread would fire twice a round). Hags who are stunned, asleep, frozen, charmed or a sheep don't weave.
- **The Hero Pie's cook**: the first hag of the turn who can (the Eye-holder first). A stunned / charmed Eye-holder can't wind up
  (`AI.windUp` refuses or it would be interrupted at once), so the next hag of the turn cooks; after the split, the hag whose turn
  just ended. The pie hits hero-side units on its marked tiles (every tile; a Dazzled / Confused cook's skew shows on the marks), so
  a charmed cook still boils the heroes, not her sisters (desc: "each hero and hero summon").
- **Tip Over's splash** is cause `surface` (exactly 8, no armor, no multipliers) and credited to the tipper (a hag it kills is an
  environmental kill: Hype, `env_kill`, Svammiel's `svam_env_kill`).
- **Smoke from a bubble lasts until the end of the next round** (turns 2; plan: "1 round"): a 1-turn surface made mid-round would be
  gone before the next Coven turn and never cut a thread. The desc says so. Smoke replaces whatever the fire left on those tiles.
- **The Eye in the codex is an unplaced object `cov_the_eye`** (`codex: true`, V's text). The Hall lists a lane's objects and
  statuses flagged `codex: true` but prints only string descs, and status descs must be functions (content suites call them). The
  in-fight Eye is the status `cov_eye` on Mildred. Spots, bubbles and the cottage are `codex: false` (plan §5.8's list: the three,
  the cauldron, the Eye).
- **Narration keys use the file prefix** `cov_` (ARCHITECTURE §3.10), so V's `coven_death` is `cov_death`.
- **Two extra banters** (the Baba Yaga nods the task asked for); V's six unchanged.
- **Mildred's hair is `long`** (V: `wild`) so the nightcap reads at 37 px.

## Requests
- **Lead (`docs/DESIGN.md` §9 item 9)**: the Coven's numbers and rules as built — Hero Pie 23 (not 20), Hex Threads 8 (not 7); "a hag
  who starts her turn next to the Family Cauldron stirs first (Brew +1), then acts"; Bedtime Hex lasts until the end of the Coven's
  next turn. (The plan's §3.4 keeps its numbers; BAL may move them again.)
- **AUTOPLAY / RULES (`autoplay.js`)**: a Stirring Spot is priced only for the move onto it ('step'); a hero already on one has no
  reason to stay, so the sims hold the spots less than a human (5.3 hero spot-rounds a fight) — an end-tile term for hinted
  non-blocking objects (say `how: 'hold'`) would let them. Also the tip hint counts the splash on the tipper, but AutoPlay still pays
  ~11 HP a fight to its own tips: fine, but worth knowing for BAL.
- **RULES (optional, `grid.js stepCost`)**: a per-unit terrain cost (a def / unit `terrainCost: { cov_bog: 1 }`) would let Granny wade
  the bog as plan §3.4 says. Nothing depends on it.
- **META-UI (optional, `hall.js` `thingCard`)**: print a status's function desc (or a `codexDesc` string) so the Eye's codex entry can be
  the status itself; then `cov_the_eye` can go.
- **Integrator / BAL**: the door's knobs are `DD.Coven.N` (HP, `brewMax`, `stirAt`, `interrupt`, `intoPot`, `range`, `tip`, `bubble`) and
  the skill levels (`cov_terror`, `cov_pinch`, `cov_greens`, `cov_undertow`, `cov_thread`, `cov_pie`); engagement via
  `DD.Coven.stats(state)` for the sims' per-lane table (plan §7.2: "cauldron tipped or spots held > 0").

## Tests
- `tools/test.sh "suite=boss_coven&isolate=coven,svammiel"`: 14 suites, 675 assertions, PASS (Benedick's slime suite skips until his
  file lands; Svammiel's lava suite needs `svammiel` in the isolate list).
- Suites: registry and encounter · the bog garden · one shared turn (E1) and the split · the six skills (incl. reach numbers on a
  sleeper, bog tiles, pull, sight) · the Rite (stir, Brew 6, the pie's tiles / number / landing, every interrupt, the cook's death, a
  stunned Eye-holder) · the cauldron (Tip Over 2 AP, the splash on everyone within 1, upright after the next round, AutoPlay hints)
  · the spots (the cook's AI, busy below 3, all spots held, held through a swap, D2 immovable spot-holder, Brine drags) · Hex
  Threads (line, range, sight, who weaves, damage + Weakened, once a round, threatAt = the hit, the split, zones, smoke) · Into the
  Pot and the bubbles · The Floor Is Lava (9 tiles, restored after round 3, the pie honest with the cheat on) · voice (lengths,
  she / her sweep, named lines, Benedick verbatim, mourning matrix, banter, DM whispers) · robustness (alone in a bare sandbox,
  charmed / sheeped turns, lethal previews leave no trace, threatAt pure) · Benedick's slime · AutoPlay battles (`real=1` band).
- Full run `bash tools/test.sh`: **PASS — 1223 suites, 142,866 assertions, 0 failures**, missing scripts 0.

## Known issues
- Author sims run ~12.5 rounds with ~3.4 downs (item-less parties); campaign numbers are BAL's.
- AutoPlay doesn't deliberately hold the spots (see Requests); humans should find the door a little easier than the sims.

## Review (V3) — adversarial review, Nov 15 (owner of this file since the review)
Verified by running code: the 14 owner suites (Benedick's slime suite now runs: his file has landed), new review suites,
real-party AutoPlay batches with Benedick in the pool (17 heroes), The Floor Is Lava on (the real start cameo), brutal
and casual, and a screenshot of the door with Benedick, Ellaria's corgis and the lava (`.tmp/review3/cov.png`: the Eye,
the thread zone, the lava patch and the Brew chip read as intended). Determinism holds (a batch run twice is identical).
She / her for the three hags everywhere ("he" only for Svammiel in the banter and Granny's codex); no Math.random.
Ship dark: act-4 only. Granny's garlic-butter line is party-filtered by hero id.

**Checked against the engine (no change needed):**
- E1 glue: `Combat.finishTurn` fires every group member's `onTurnEnd`, so the Coven's threads and pie run once, from
  Mildred's (the owner's); a stunned or charmed Mildred still lets Granny and Brine act (`aiTurn` runs the group; a
  charmed hag stays AI-controlled). After the split each hag's own turn end fires the threads touching her.
- The thread cache (`threadsOf`) is keyed on the state, its mutation counter and the weavers' positions: smoke, objects,
  terrain and surface expiry all bump the counter, so a cut thread never fires from a stale cache.
- Benedick's Snail Slime stops Granny and Auntie Brine (elites, grounded), never Cousin Mildred (she flies on Granny's
  broom). The owner's suite only checked that Granny missed the spot; it now also checks the snag per hag and that Brine
  walking across the slime stops on it.
- Whole real fights under the content suite's area watch (normal, brutal, casual): every hit inside its marks, every
  fight ends, no swallowed errors.

**Numbers (author sims, random real parties of 4 from all 17 heroes, L5.5, no items, normal; band 66-74%):**
seeds 31 × 80: 66% · 41 × 80: 81% · 777 × 40: 78% · 4242 × 20: 65% → **73.6% (162 / 220)**, the top of the band (the
owner's 69% was measured with 16 heroes); 11.6-12.6 rounds, 2.5-3.3 downs, 0 timeouts. The Floor Is Lava on, seed 777:
78% vs 78% (0 points).

**Remaining (not fixed here):**
- BAL: with Benedick in the pool the door sits at the top of the author band (73.6%); one more Night Terror point or a
  2-3 point HP trim is the lever if the campaign comes out easy. AutoPlay still does not hold spots on purpose.
- Bedtime Hex's sleep is the core `sleep` status with `turns: -1`: the HUD's generic sleep tooltip does not say "until
  the end of the Coven's next turn" (the skill desc and Mildred's line do). HUD, optional.

**Test tooling added (AutoPlay suite):** `cameo=1` (the real start cameo with The Floor Is Lava), `party=a,b,c,d`.

## QA fixes (Nov 17, QA FIXER content cluster; the full list: docs/notes/boss-svammiel.md "QA fixes (Nov 17)")
- **FIGHTS-06** (svammiel.js): Svammiel's The Floor Is Lava spares every `coven`-tagged unit on its patch (no damage, no
  Burn: "his lava knows its friends"); its desc is now "The patch on the path to the cauldron is lava until the end of
  round 3. Hags don't burn." The Floor Is Lava suite here checks it at the real door (Granny shoved across: nothing).
