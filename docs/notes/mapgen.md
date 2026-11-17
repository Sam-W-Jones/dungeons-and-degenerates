# MAPGEN notes

Files: `js/engine/mapgen.js`, `js/engine/encounter.js`, `js/data/themes.js`, `js/data/wildmagic.js`,
`tests/mapgen_tests.js` (suites `mapgen: …`).

## Summary

- **Themes** (`DD.Themes`): all 9 DESIGN §10 themes with the contract fields (floors, walls, obstacles, decor,
  hazards, liquids, bg, ambient) plus generation knobs (`gen`). `DD.Themes.forAct(act)` → theme ids of that act.
  Helpers are non-enumerable, so `Object.keys(DD.Themes)` is exactly the 9 theme ids.
- **Procedural maps** (`DD.MapGen.generate`): 5×5 to 24×24 (designed for 9–13). Pipeline (canonical orientation,
  heroes along the bottom): reserve deploy zones → elevation (`flat` dais, `hills` value noise + optional sheer mesa,
  `terraces` stacked plateaus, some sheer) → optional mid-map **barrier with 2–3 gaps** (wall line, object line,
  water/deep channel with bridges, meandering water or lava river with bridges/fords, pit chasm) → 1–2 theme
  **hazard features** (pools, pits / open graves, mud/rubble/ice patches, poison/oil/web/cheeto/fire/water surface
  patches) + optional set dressing (wall segments, a holy magic circle, gold-pile mounds) → coherent floor patches
  (blobs, rects, carpet strips, dirt paths; raised floors per theme) → **repair** (heights → carve → plug) →
  objective objects → cover clusters (spread, prefer the middle band and elevation edges) → explosive barrels
  (near enemies, far from heroes, sometimes in pairs, next to oil) → braziers (next to oil/webs) → occasional
  chest (flanks / high ground) → decor → mirror + rotate so heroes start on **S or E** (the camera side) and
  enemies on the opposite edge → walls / trees / fences along the two back edges (N, W) → final validation.
  Liquids sit in valleys (banks step down to them) so anyone pushed in can climb out.
- **Guarantees** (checked by `DD.MapGen.validate`; failing attempts retry with a forked rng, then a flat fallback):
  every *safe* walkable tile can reach every other one under the height rule (up ≤ 1, down any); every walkable
  hazard tile (lava…) can walk back to safety; zones are clean dry cost-1 floor (no object/surface/liquid);
  hero zone ≥ 6 tiles (8–10), enemy zone ≥ 8 (grows with the enemy count); deterministic per rng state.
  "Safe" = walkable and not lava/deep/`hazard` terrain, no fire/poison/electric/web (or `hazard`) surface, no
  hazard object. Object instance `blocksMove`/`hazard` overrides are honoured (same rule as `DD.Grid`).
  Measured on 441 maps per test run: 0 invalid, 0 fallbacks, ~1 ms per map, cliff edges 0–2% of steps.
- **Layouts** (`DD.MapGen.fromLayout`): §5.8 legend + custom legend entries `{ terrain, obj, h, zone, surface,
  mark, tag, turns }`; marks returned for every char and every named mark.
- **Encounters** (`DD.Encounter`): `build` (counts, brutal +1, map, placement, objective text, deploy tiles,
  normalized waves), `pick` (act/kind/depth/exclude/weight with graceful fallbacks), `spawnWave` (edge or zone
  spawns on free safe tiles away from heroes, banner + log).
- **Wild magic** (`DD.WildMagic`): 30 surges (17 good, 9 chaos, 4 backfires; ≈57/30/13% by weight), act-scaled
  numbers, banner + log + DM quip per surge; 22 are `enemySafe`. Registers `wm_duck` (summon, random names, acts
  immediately) and `wm_duck_foe` (act-1 minion enemy) with skills `wm_duck_honk` / `wm_duck_peck`.

## Public API (beyond the contract)

### DD.MapGen
- `generate(opts)` extra opts: `seed` (when no rng), `heroSide: 'S'|'E'|'N'|'W'` (default random S/E),
  `objects: [{ id, count, where: 'enemy'|'hero'|'mid'|'any' }]` (objective objects, kept reachable from 2+
  sides), `enemyZoneSize` (tiles wanted). Result extras: `theme`, `meta { style, heroSide, enemySide, barrier,
  features[], unknownFeatures[], required[], splitEnemyZone, attempts, fallback }`.
- `map.features` vocabulary (case/space-insensitive, plurals OK): `barrels`/`explosive`, `crates`, `kegs`,
  `cover`, `open`, `water`, `river`, `channel`, `pools`, `lava`, `lava_river`, `pits`, `chasm`, `mud`, `ice`,
  `deep_water`, `rubble`, `poison`/`slime`, `oil`, `web`, `cheeto`, `fire`, `holy`, `blood`, `electric`,
  `smoke`, `hills`, `terraces`, `flat`, `cliffs`, `walls`, `chokepoint`, `bridge`, `chest`/`treasure`,
  `braziers`, `fountain`, `spikes`, plus any object id (`trees`, `gravestones`, `totems`…), any terrain id (patches)
  and any surface id. Unknown words are ignored (listed in `meta.unknownFeatures`; warned only with `?debug=1`).
- `fromLayout`: extra default legend chars `=` bridge, `%` rubble, `&` deep water, space = floor. Legend terrain
  aliases `'floor' | 'wall' | 'liquid' | 'deep'` resolve per theme; `obj` may be `'obstacle'`/`'decor'` (random
  theme object) or `{ id, ...instance overrides }`; a string entry is shorthand for a terrain (or object) id.
  Legend `h` beats the heights row. Unknown chars are plain floor but still marked. `E`/`B` tiles get tags
  `enemy_spawn`/`boss_spawn`; `mark: 'name'` sets `tile.tag = 'name'`. Layouts without `H` (or `E`/`B`) get an
  automatic zone on the bottom (top) rows. Result extras: `theme`, `meta.layout`.
- `fromDef(mapDef, rng, opts)` (layout or procedural), `validate(map, { minHero, minEnemy, layout })` →
  `{ ok, problems }`, `isWalkableTile(t)`, `isSafeTile(t)`, `isCleanTile(t)`, `terrainInfo(id)`,
  `objectInfo(id)`, `makeObject(id, overrides)`, `parseFeatures(list)`, `LEGEND`, `FEATURES`, `CANON`,
  `SURFACE_TURNS` (-1: pre-placed surfaces are permanent scenery; `combat.js` only ticks `turns > 0`).

### DD.Themes
Extra theme fields: `flavor`, `floorWeights`, `floorPatch`, `raisedFloor`/`raisedMin`, `obstacleWeights`,
`decorWeights`, `surfaces`, `gen` (see the header of `js/data/themes.js`). `bg.top` is the lighter colour.
Helpers: `ids()`, `forAct(act)`, `get(id)` (cellar fallback), `has(id)`, `random(act, rng)`.

### DD.Encounter
- `build(def | id, party, opts)` extra opts: `seed`. Setup extras: `marks`, `heroZone`, `enemyZone`,
  `difficulty { id, hp, dmg }` (§6.10 numbers), `act`, `kind`, `name`, `mapMeta`. Hero entries carry both
  `runHero` and `id`. Enemy entry placement hints: `{ id, x, y }`, `{ id, at: {x,y} }`, `{ id, mark: 'R' }`;
  bosses go to `B` marks / the deepest central zone tile, others to `E` marks then spread over the zone,
  overflow to the nearest free tiles (≥ 3 from heroes when possible). String entries (`'a1_gob_grunt'`) count 1.
  `map.seed` pins a procedural map; `map.heroSide` picks the deploy edge.
- Objectives: `text` is instruction first, joke second (e.g. "Defeat all enemies. Murderhobo responsibly.") and
  the joke alone is also in `objective.flavor` (combat replaces `text` with live progress). A string objective
  (`objective: 'survive'`) is accepted; unknown types fall back to killAll with a warning. `boss` fills `bossId`
  from the first boss-tier enemy (no boss-tier enemy and no `bossId` → killAll + warning); `survive` defaults to
  5 rounds; `destroy` places `count` objects (`objId` default `totem`) on procedural maps and clamps `count` to
  what exists (none → killAll + warning); `protect { objId }` places the object in front of the hero zone;
  `custom` uses `objective.text` or `def.objectiveText`.
- `pickFrom(list, act, kind, rng, opts)`; `synthesize(act, kind, rng, { register })` (stand-in encounter from
  registered enemies, registered as `mg_fallback_a<act>_<kind>` unless `register: false`); `marks(state)`;
  `difficulty(id)`; `objectiveText(o, def, rng?)`; `requiredObjects(objective)`; `resolveEnemies(entries, rng)`.
- `pick` relaxation order: depth → exclude → real content before `test_`/synthetic → kind (boss → elite →
  normal; normal ↔ elite) → act (nearest). Weight-0 encounters only when nothing weighted exists for that
  act/kind. Optional `maxDepth` on encounter defs is honoured.
- Waves: `edge` accepts `N/E/S/W/zone` and `north/east/south/west`; extra `mark` (spawn around marked tiles) and
  `text` (custom announcement). Unknown enemy ids are skipped with a warning.

### DD.WildMagic
`surge(unit, { good, kind: 'good'|'bad'|'chaos', source, silent })`, `apply(id, unit, opts)`, `list()`, `get(id)`,
`pool(unit, opts)`, `describe(idOrDef, act)`. `good: true` → good only; `good: false` → bad or chaos. Defs may add
`icon`, `quip`, `enemySafe`, `canApply(unit, ctx)`. `apply` returns an effect; emits `wildmagic:surge` (effect)
on `DD.Events`. ctx: `{ state, rng, act, n (act-scaled numbers), source, units(), foes(), friends(), others(),
within(list, r), freeTiles(x, y, r), tile(x, y), pick(list), isBoss(u), immovable(u) }`.

## Deviations

- Pre-placed map surfaces use `turns: -1` (permanent scenery). The contract has no permanent marker for
  surfaces; -1 matches statuses and `combat.js`, which only ticks surfaces with `turns > 0`.
- `generate()` size is clamped to 5..24 (the contract talks about 9..13 maps; other requests are honoured
  within that range).
- `setup.difficulty` is an object `{ id, hp, dmg }` (same shape as `state.difficulty` plus `id`).

## Requests

- HUD: show `state.objective.flavor` (the objective joke) as a small subtitle under the objective;
  `Combat.refreshObjective` replaces `objective.text` with progress text, so the joke would otherwise be lost.
  Surfaces with `turns: -1` are permanent scenery (no countdown in tooltips).
- RULES: `Combat.start` could fall back to `setup.difficulty` (`{ id, hp, dmg }`) when neither `opts.difficulty`
  nor a run is given (debug combats from `main.js` currently pass neither, so `&difficulty=brutal` adds the
  brutal +1 enemy but keeps normal HP/damage).
- RULES: `spawnReinforcements` logs a generic "Reinforcements arrive!" right before `DD.Encounter.spawnWave`,
  which logs its own (edge-aware, comedic) line and shows a banner; the generic line could be skipped when
  `spawnWave` exists.

## Known issues

- Visual check: every theme was checked through the real `DD.Render` (with `tests/fixtures.js` units) via the
  scratch page `.tmp/render_view.html?theme=<id>&seed=N`, which builds a setup and drives the renderer directly,
  plus a scratch iso viewer (`.tmp/mapview.html`) for bulk views of sizes, barriers and placement. The official
  `tools/shot.sh "debug=1&fixtures=1&screen=combat…"` flow cannot show a fight yet because `js/ui/combat_hud.js`
  (the `combat` screen) had not landed when I finished; `.tmp/combat_view.html?debug=1&screen=combat&encounter=
  scratch_<theme>&seed=N` (the real game + one scratch encounter per theme) is ready for when it does.
- Wall terrain stays off the two camera-facing edges (S, E) except the two side corners the back-edge border
  shares with them; tall objects (trees, bookshelves, pillars) may still stand on the front edges and rely on
  the renderer's silhouette pass for anything behind them.
- No real hero/enemy/encounter content existed yet, so the registered-encounters, spawnWave, combat-integration
  and wild-magic-sandbox suites currently run against `tests/fixtures.js` (12 test encounters, test heroes and
  enemies). They pass with the real `combat.js`/`actions.js`/`grid.js`/AI.
- Layout maps (boss arenas) are only soft-validated: `DD.MapGen.validate(map, { layout: true })` reports walled-off
  zones or stranded tiles, and the registered-encounters suite logs such problems as content notes instead of
  failing (layouts are their authors' responsibility).
- The hoard's raised `gold` floor (cost 2) makes its treasure mounds slow to cross; intended as difficult
  terrain, worth a look in playtesting.

## Requests (Nov 3) — wild magic and the turning map (CONTENT SWEEP, shared)

- `wm_continental_drift`: "pushed 1 tile south (away from the compass needle)" — the old "(toward the bottom-left)" was
  a screen direction, wrong once the map turns (rotation plan §7 P1). The HUD compass needle points grid north.
- `wm_smite`: a flying foe stands in no water, so the bolt no longer electrifies the pool under it (v2: flyers ignore the
  floor); the text ("Water it stands in") already said so.
- `wm_barrel_roll` places `barrel_explosive` (volatile in terrain.js): heroes can shoot those barrels. `wm_duck_honk`
  (the Confused Duck, hero side) can set one off too. Checked by "integration: v2 requests — … no screen-direction words".

## Playtest fixes (Nov 12) — fix:engine

- **bosses-objectives-9** (fixed): a protect objective names the placed object by its label when the map gives one
  (`objective.objLabel`: "Protect The Last Keg and defeat all enemies."). Suite `mapgen: playtest fixes — …`.
- **robustness-5** (fixed): `mapgen: encounter build (synthetic encounters)` compares the build's difficulty info with
  `DD.Balance.scale(…)` (difficulty × act × kind) instead of a literal row, and checks brutal > normal.

## Finish (Nov 14) — fix:engine

- **bosses-objectives-9** (the part still there): the build text already said "Protect The Last Keg…", but the LIVE
  objective bar (`DD.Combat.objectiveText`, refreshed after every action) still used the def name ("Protect the Ale
  Keg"). It now takes `objective.objLabel` or the label of the placed object. Suite `mapgen: finish — bosses-objectives-9`.
- audit-1: `encounter.js` DIFFICULTY (the fallback used only without DD.Balance) now matches DD.Balance (brutal 1.15 / 1.05).
- Full record: `docs/notes/rules.md` "Finish (Nov 14)".

## Review (finish, Nov 14) — REVIEWER

- bosses-objectives-9 re-played: the live bar says "Protect The Last Keg and defeat all enemies". The Ale Keg's own desc
  stays "Destructible." without the D1 sentence on purpose: as The Last Keg it is the protect objective and nobody may aim
  at it (the HUD shows the def's desc for every keg). Every other breakable generic prop in terrain.js now says "any
  single-target damage skill can break it" (`kit: finish D1` asserts it).

## V3 (act IV "Under the Table", Nov 14) — MAPGEN

Plan `.tmp/v3/design.md` §4.6, §6.3, §0.3 V7 / V17, §8.4 MAPGEN; contract ARCHITECTURE §3.8, §5.8, §6.10; lead patches
P8, P9, P11 (`docs/notes/v3-contract.md`). Files: `js/engine/encounter.js`, `js/data/themes.js`, `tests/mapgen_tests.js`,
this file, and `js/data/wildmagic.js` (a v2 MAPGEN file: the wave-0 request, see Deviations).

### What landed
- **`DD.finalAct()` everywhere** (no literal last act): `encounter.js clampAct` → 1..`DD.finalAct()` (exported as
  `DD.Encounter.clampAct`); `pickFrom`'s act list is bounded by `DD.finalAct()`; `themes.js forAct` clamps to
  1..`DD.finalAct()`; `wildmagic.js` reads the last `SCALE` row for any later act (`scaleRow`, data-driven: act 4 reads
  act 3's numbers, the intended clamp). With `campaign.acts` 3 every pick, theme and build is exactly v2 (ship dark):
  an act-4 encounter builds as act 3 (`setup.act` 3, act 3's row), `forAct(4)` / `random(4)` give act-3 themes.
- **Random picks never return a door or the finale**: `DD.Encounter.isScripted(def)` (= `gauntlet` or `finale`);
  `pickFrom` drops those before anything else (all acts and kinds, weighted or not), so `pick`, act-map nodes and
  `api.combat` never get one; a list of doors only → `null` (then `pick` synthesizes). `synthesize` also never uses an
  enemy of an act past `DD.finalAct()` or of a gauntlet act (act-4 units need their own encounter's scripting), unless
  nothing else is registered.
- **Squads (E10)**: `buildObjective` copies `objective.bossIds` (a new array of the string ids; `flavor` kept as
  before) and keeps a `boss` objective whose squad has no boss-tier unit (v2 fell back to killAll: the League's
  `bossId: KELEK` workaround is no longer needed). The build text names the squad by `shortName` like the live bar
  (`Combat.objectiveText`): "Defeat the Test Squad. They came as a set. They leave as a set." A squad of unknown ids
  and no boss-tier unit still warns and falls back to killAll.
- **The gauntlet order knob (P11)**: `build(def, party, { …, gauntlet })` keeps `opts.gauntlet` as `setup.gauntlet`
  (the same object; absent without it) and `difficultyInfo` passes it to `DD.Balance.scale(…, { gauntlet })`, so
  `setup.difficulty` matches what `Combat.start` plays (RULES' `difficultyOf` reads `setup.gauntlet`). The knob ships
  off (`DD.Balance.gauntlet` 0 / 0). `DD.Encounter.difficulty(d, act, kind, encId, gauntlet)` takes it too.
- **Six act-IV themes** (`act: 4`, plan §6.3; DESIGN §10): `a4_conservatory` The Overgrown Conservatory (grass / gravel
  paths / moss, planters h1, hedges, a sprinkler pond, compost, weedkiller; `pollen`), `a4_lair` The League's Clubhouse
  (obsidian / carpet runway / marble dais, the Shark Tank moat and pools, Evil Powder Kegs 2-3; `embers`),
  `a4_observatory` Galbraith's Grand Observatory (marble, orrery columns, mirrors, the starry void as pits and a chasm,
  loose starlight, a rune ring; `stars`), `a4_cottage` Tea with the Coven (moss / grass / dirt hills, a bog creek, bog,
  pools, a spilled brew; `fog`), `a4_barn` **The Barn Burner** (worn planks with loose straw, the hayloft stage, a
  walled barn: border walls 90% + stall partitions, barn posts, stall fences, feed crates, loose hay = rubble patches,
  lantern oil, the water trough; **no pits**; `dust`) and `a4_underfloor` The Last Floor (obsidian / graph-paper
  panels, giant table legs, lost dice, missing panels = pits and a chasm, Cheeto dust, spilled soda; `dust`). bg
  colours as plan §6.3. Every hand-made act-4 fight reads the theme's floors for its `.` tiles (see Requests).
- **The barn's hay bales**: theme field `borrow: { obstacles: { rap_bale: 5 } }`: `themes.js` adds the goats' Hay
  Bale to the barn's obstacles in `DD.afterLoad`, only when `goats.js` registered it (isolated runs and the stub keep
  crates and barrels as stand-ins). The bale burns (its own `react` / `onDestroyed`).
- **New ambients** `pollen` (conservatory) and `stars` (observatory) carry `ambientFallback` ('fireflies' / 'dust'); a
  renderer that doesn't know the kind today draws no particles (no error).

### Numbers (the suites)
- 15 themes × 49 maps in "generate 300+ maps" (735 maps): 0 invalid, 0 fallbacks, avg 1.00 attempts. Act IV: elevated
  100% · 4+ objects 100% · hazards 98-100% · cliff edges 0.0-1.1% of steps; barrier 37-63%; the Lair has barrels in 100%.
- V3 arena suite: 6 themes × 5 sizes (15 × 14, the goats' arena size, included) × 20 seeds = 600 maps, 0 invalid,
  0 fallbacks; the barn: 0 pits, barn walls in ≥ 80% (bales in ≥ 50% of barn maps once goats.js lands).
- Picks: 500 seeds × acts 0..`MAX_ACT`+1 × 3 kinds × knob 3 and 4, list and registry: 0 doors / finales returned.
- Look: `tools/shot.sh "debug=1&acts=4&screen=combat&encounter=boss_league&seed=3"` (`.tmp/v3/mapgen/lair.png`): the
  League's layout on `a4_lair` (violet backdrop, embers), "Defeat the League of Villainy (5 left)".

### Tests (`tests/mapgen_tests.js`)
- Widened: `THEME_IDS` = the 9 classic + `A4_THEMES` (every map suite runs the act-IV arenas: themes, 300+ maps,
  determinism, combat integration, DD.Grid agreement, reinforcements; the combat defs set `cameo: false`); `AMBIENT`
  adds `pollen` / `stars` / `notes` (a new kind must name a v2 `ambientFallback`); `forAct` clamps high to
  `DD.finalAct()`; wild magic: act IV reads the last row.
- New suites `mapgen: V3 — …`: the six arenas at every seed (the barn's no-pits / walls / bales); `forAct`, `random`,
  `clampAct` and the build act under `campaign.acts` 3 and 4 (knob set and restored with `DD.Balance.snapshot()`);
  random picks never a door or the finale (500 seeds, list + registry, both knob values; a regular act-4 fight only
  after the flip); build: squad objective (copied `bossIds`, text, flavor, killAll fallback for junk), `setup.gauntlet`
  identity, the order knob (off = no change; on: HP × 1.2 / damage × 1.1 at index 2 = `DD.Balance.scale`; map and
  line-up unchanged; junk index / object ignored; `Combat.start` plays the same numbers, keeps `state.data.gauntlet`
  and counts the squad); stand-ins never use a gauntlet-act enemy.
- `bash tools/test.sh "suite=mapgen&isolate=goats"`: 21 suites, 3054 assertions, PASS (with
  `isolate=league,svammiel,goats`: 3062, PASS). Full run (Nov 14): 1137 suites, 138,605 assertions, 1 failure outside
  MAPGEN (`kit: finish D1` on `lg_body`, C2's `league.js`), 0 swallowed "Error in" lines, missing scripts 6 (the
  Gardener, Galbraith and the Coven, not yet created).

### Deviations
- **`js/data/wildmagic.js`** is not in this role's V3 file list, but ARCHITECTURE §1 keeps it with MAPGEN (v2 row) and
  the wave-0 contract addressed its `Math.min(3, …)` clamps to MAPGEN: made data-driven (two lines + a helper).
- **Theme floors are canonical terrain ids** (no new terrain registered in `themes.js`): lawn = `grass`, gravel =
  `cobble`, black marble = `obsidian`, linoleum panels = `obsidian` / `paper`, barn planks = `wood`, straw = `sand`. The
  fights' own terrains (the goats' stage and squares, Svammiel's floor, the Shark Tank) live in their layouts' legends.
- **New theme fields** `ambientFallback` and `borrow` (documented in `themes.js`'s header): the plan names "fallbacks"
  for the new ambients and "scattered bales" for the barn's gen without a mechanism; `borrow` keeps `themes.js` free of a
  load-order dependency on a boss file.
- **Squad objective text and joke** ("They came as a set. They leave as a set.") and the stand-in filter in
  `synthesize` are beyond the plan's list (each closes a gap: a squad door's build text would otherwise read "Defeat
  the boss.", and a stand-in fight could borrow a League member without its encounter).
- **`DD.Encounter.clampAct` / `isScripted`** are new public helpers (tests, and any caller that needs the rule).

### Requests
- **RENDER-WORLD (`renderer.js`)**: when `AMBIENT_N[kind]` is missing, use `DD.Themes[theme].ambientFallback`
  (`a4_conservatory` 'pollen' → 'fireflies', `a4_observatory` 'stars' → 'dust') until the new kinds exist; THEME_LOOK /
  WALLS fallbacks for the six `a4_*` ids (plan §4.7; bg values are in `themes.js`).
- **C1, C3, C4, C6 (hand-made act-4 arenas)**: a layout's `.` takes the theme's floor mix (patches of its secondary
  floors: the barn has ~10% `sand` straw on `wood`). For a uniform floor set `legend['.'] = { terrain: '<id>' }` (as the
  League and Svammiel do).
- **C6 (goats)**: the barn's gen borrows the object id `rap_bale`; if it is renamed, tell MAPGEN (the theme just stops
  borrowing it, nothing breaks).
- **C2 (League)**: `objective.bossId: KELEK` is no longer needed for a squad boss objective (harmless if kept). The full
  run's only failure is in your file: `kit: finish D1 — … terrain.js props name the rule too (the keg excepted): lg_body`
  (`tests/content/kit.js` matches `/any single-target damage skill/` case-sensitively; the Villain's Body desc says
  "Any single-target…"). Either C2 writes "any" in lower case, or the integrator (owner of `kit.js`) makes the match
  case-insensitive / adds the act-4 prefixes to its `OWN` list.

### Known issues
- Until RENDER-WORLD adds `pollen` / `stars` (or reads `ambientFallback`), the conservatory and the observatory draw no
  ambient particles.

## Review (V3) — adversarial review of MAPGEN's V3 work (REVIEWER, core cluster, Nov 15)
Scope: `js/engine/encounter.js`, `js/data/themes.js` (and the `wildmagic.js` clamp), `tests/mapgen_tests.js`.
- **Verified by running**: `mapgen: V3` suites PASS, also with the knob flipped (`.tmp/metarun/test4.sh`); the six
  act-IV arenas with `n=100` (3,000 maps over the five sizes incl. the goats' 15 × 14): 0 invalid, the barn never has a
  pit and borrows `rap_bale` now that goats.js registers it; random picks never return a door or the finale (suite +
  `DD.RunMap.pickEncounter` in run_tests); a squad door builds a boss objective from `bossIds` with its shortName text;
  `opts.gauntlet` → `setup.gauntlet` → `state.data.gauntlet` in every door of 20 real act-4 runs (`.tmp/rvcore/`); the
  acts-3 sim without Benedick reproduces the wave-0 re-baseline exactly (the act-4 themes and encounters leave v2's
  picks and maps unchanged).
- **Requests to MAPGEN, both done** (checked in code and suites): RULES' "keep `objective.type 'boss'` for a squad in
  `bossIds`" and META-RUN's "`Encounter.build(…, { gauntlet })` → `setup.gauntlet`".
- **No fixes needed** in MAPGEN's files.
