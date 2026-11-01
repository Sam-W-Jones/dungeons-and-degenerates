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
