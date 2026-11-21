# RULES notes

Files: `js/engine/{grid,targeting,hooks,actions,ai,combat,autoplay}.js`, `js/data/{statuses,terrain}.js`,
`tests/{fixtures,engine_tests,content_tests}.js` (suites `engine: …` and `content: …`).

> **V3 (act 4, Nov 14): READY: DD.Cameo core + E1 + E2 · READY: E13 modifyUse** — see the section "V3 — act 4 'Under the
> Table': DD.Cameo and the engine needs (RULES)" at the end of this file (the API as built, content recipes, deviations).

> **v2 (initiative, per-unit turns, no telegraphs, no Guard) supersedes everything below about the round flow, enemy
> planning / telegraphs / intents, Guard, combat-start Block and status timing.** See the "v2" section at the end and
> `docs/notes/v2-migration.md` (the content conversion guide).
>
> **Content authors, read "Attacks of opportunity" and "Targeting" in the last section** (v2 AoO role): walking away
> from a melee fighter provokes a free basic attack, and enemies stick to the hero next to them.
>
> **Engine requests (Nov 5, last section)**: new optional knobs — skill `windupOnly` / `fromStand`, status `takenFlat` /
> `onRemove`, hooks `estimateDealt` / `estimateTaken` / `onDeathPrevented` / `onStatusRemoved`, `addStatus` `thisTurn`,
> object `loot` (flyers pick it up), surface `cloud`; tile `onEnter(…, cause, from)`; cones stop at walls.

## Summary

- **DD.Grid**: every §5.1 query. Dijkstra movement (terrain cost, +1 per level climbed, up ≤1 / hop ≤2 / flying any,
  flyers ignore pits/liquids/costs, pass through friends but not foes, never end on a unit). Equal-cost paths prefer
  fewer hazard tiles; each reachable entry also has `hazard` (first damaging hazard on the path, incl. destination)
  and `edge` (destination borders a pit / deep water / lava). Supercover LOS (§6.3). All §5.2 shapes.
- **DD.Targeting**: ranges (rangeBonus for max ≥ 2, hero Dazzle −1, `modifyRange`), valid targets for all 4 target
  types and 9 filters (stealthed heroes can't be picked by enemy single-target skills), area tiles, full ctx.
  `preview()` is a **dry-run simulation**: deep copy of the state (functions/defs/run shared, RNG cloned), swapped into
  `DD.Combat.state` with `FX.push`, `Events.emit`, `Audio.play` and the run's gold/consumable mutators stubbed,
  `DD.Act.simulating = true` (no log/narration/barks/run gold). The skill runs through the same code path as a real use
  (costs, execute, `onSkillUsed`, Hype, deaths), the result is diffed per unit and everything is restored in a
  `finally` (also on throw, incl. the RNG state). `skill.preview(ctx)` overrides; tag `random` → `uncertain`.
  Measured in Chrome (no virtual time): median 0.1 ms, worst 1.5 ms.
- **DD.Hooks**: §5.3 source order (+ `unit.hooks` instance hooks after the def), extras as last argument, `DD.safe`.
- **DD.Act**: every §5.4 function with FX, log lines, stats, hooks and Hype. Damage pipeline §6.5 exactly (weak,
  inspired, item dmg, Empowered (consumed after the skill), hero taunt −50%, charmed hero vs charmer = 0, difficulty
  for enemy sources, high ground, target hooks, vulnerable, resist, Wet ×1.5 lightning, Frozen ×1.5 physical, Marked,
  armor (min 1), Block, HP), then sleep wake-up, stealth break, fire thaws, frost freezes the Wet, thorns, deaths.
  Enemies/summons die (+8 Hype, env kills +20 + `env_kill` narration), heroes go downed. Push/pull/knockback with
  bump both ways (units and objects), edge/wall/height blocks, pits & deep water (non-boss enemies and summons YEET;
  heroes/bosses −25% max HP and climb out to the nearest safe tile), lava, water, ice/ice-surface slide +1,
  immovable, `onEnterTile` per tile, traps/plates, Bleed on forced movement. Element table (§6.6) incl. oil fire
  spreading along the slick, steam, webs burning, ice ⇄ water (deep water remembers it was deep), electrified water
  bodies (4 lightning + Stun to every grounded unit in the connected pool), barrel chain explosions, lava → obsidian.
- **statuses.js**: the 25 core statuses with icons, colours, `desc(st)` and DESIGN 4.4 semantics.
- **terrain.js**: every canonical terrain/object/surface id with properties, colours, desc and behaviour, plus the
  element reaction table (`react` on defs).
- **DD.AI**: default planner (positions × usable skills × candidate targets, scored from `L.dmg`/`L.heal`, kills,
  foes hit, friendly fire, debuff/buff value, `aiScore`, summons) with the six styles, hazard/edge/allied-telegraph
  avoidance; approach via a distance field; custom planners get the exact §5.6 api. Execution re-resolves anchors,
  fizzles lost tracking shots, applies dazzle/confuse/taunt/charm/silence/sheep. Measured: `planAll` with 8 enemies on
  12×12 median 2.7 ms (worst 9.8 ms).
- **DD.Combat**: §5.5 + §6.1 round flow, objectives §6.9 with live `objective.text`, reinforcements (uses
  `DD.Encounter.spawnWave` when present), deploy with free swaps (enemies re-plan after each deploy move), undo,
  Guard, AP effects, cooldowns §6.4, charges, Hype, consumables, interactions incl. Help Up and **Smash**, sandbox.
- **DD.AutoPlay**: greedy player (Help Up first, smashes objective objects, uses consumables when clearly worth it, quick-scores every (move, skill, target),
  refines the best 5 with exact previews (so pushes into pits/lava, barrels, kills and heals are valued correctly),
  weighs the end tile's telegraph danger vs Guard, safety moves, approaches). A full fixture fight takes ~20 ms.
- **Tests**: 19 `engine:` suites (~420 assertions) and 8 `content:` suites (validates whatever is registered; today
  the fixtures: 234 skill executions, 12 encounters auto-battled, 2 consumables, 4 items).

## Public API (beyond the contract)

**DD.Grid**: `hostile(a, b)` (charm-aware), `effectiveSide(u)`, `isFlying(u)`, `isDrop(x, y)` (pit/deep water),
`hazardAt(x, y, unit)` → id|null, `isEdge(x, y)`, `stepCost(unit, from, to)`, `pathCost(unit, path, from)`, `objDef`,
`surfaceDef`, `objBlocksMove`, `objBlocksLos`, `emptyTilesRing(x, y, d, unit)`. `isFree(x, y, unit?)`,
`nearestFree(x, y, unit?)` (never a pit/deep tile). `reachable` opts `{ ignoreUnits, from, includeOccupied }`, entries
`{ x, y, cost, path, hazard, edge }`. `path` opts `{ maxCost, ignoreUnits, allowOccupied }`. `shape` accepts an area
object (`{ shape, size, pierce, fn }`) and `opts.ctx` for custom areas.

**DD.Targeting**: `resolve(slot|def|id)` → `{ def, slot, level }` (skills or consumables), `targetSpec(def)`,
`unitMatches(user, u, filter, single)`, `tileMatches(user, x, y, filter)`, `isValidTarget(user, skill, x, y)`,
`area(user, skill, level, target, dir)`, `simulate(fn(sim))`, `diff(real, sim)`. Preview result:
`{ tiles, units, perUnit, uncertain, spawned: [{defId,name,x,y,side,kind}], objects: [{x,y,id,dmg,destroyed}], hype }`;
`perUnit[id]` = `{ dmg (HP lost), blocked, heal, block (gained), lethal, statuses: [added ids], removed: [ids],
moved: {x,y}|null, uncertain, text }` (text like "−6 · Burn 2 · moved · KO").

**DD.Hooks**: `sources(unit)`, `each(unit, cb)`, `has(name, unit)`, `fireRules(name, ...args)` (rule hooks once, not
per unit), `defOf(unit)`. `fireAll(name, ...args)` calls `hooks[name](unit, ...args, extra)` for every active unit.
Extra hook **`modifyStatus(s)`**, `s = { unit, id, stacks, turns, src, cancel }` (set `cancel = true` to block a status,
e.g. debuff immunity).

**DD.Act**: `simulating`, `touch()`, `beginSkill/endSkill/currentSkill`, `withCredit(src, fn)` (credit environmental
kills), `maybeBark(unit, key, chance)`, `bleedTick(unit)`, `fall(unit, src)`, `isImmovable(u)`, `isBoss(u)`,
`face(unit, to)`, `safeSpot(x, y, unit)`, `enterTile(unit, tile, cause)`, `explode(src, x, y, { radius, dmg, element,
surface, turns })`, `splash(x, y, r, surfaceId, turns, src)`, `destroyObject(x, y, src)`, `interactionOf(obj, unit)`,
`waterBody(x, y)`, `giveRandomConsumable(id?)`, `makeSlot(id, level)`, `baseUnit/newEnemyUnit/newSummonUnit`.
Option extras: `applyElement(x, y, el, src, { noUnits })`; `addStatus` opts `{ silent }`; `removeStatus(u, id,
{ silent, text })`; `push` opts `{ bump, stopAt, slide }` and result `hitUnit`; `teleport` opts `{ noEnter, fx }`;
`swap(a, b, { force })`; `spawn` opts `{ side, hpMult, noScale, noFx, silent, noHooks, level }`; `summon` opts
`{ level, hpMult, ready, name, noFx, silent }`. Summon defs may define `names: [...]` (random name per summon,
`unit.title` keeps the def name). Element aliases: ice/cold → frost, electric/shock → lightning, ale → water; any
surface id works as an element (creates that surface).

**DD.Combat**: `DIFFICULTY`, `slotsOf(u)` (display order; heroes basic → skills → signature; summons `u.skills`;
enemies `u.skillSlots`), `consumables()`, `canUseConsumable(u, i)`, `costOf(u, def, level)` → `{ ap, hp }`,
`cooldownOf(u, def, level)`, `effectiveMov(u)`, `moveApCost(u)`, `turnAp(u)`, `isStunned(u)`, `controllable(u)`,
`smashable(obj)`, `resolveSkill(u, slotOrDef, target, opts)`, `checkEnd()`, `finish(result)`, `refreshObjective()`,
`objectiveText()`, `heroStats(rh)`, `makeRunHero({ id, level, skills, items, scars, hp })`, `makeHeroUnit`,
`emptyGrid(w, h, floor)`, `cloneState(s)`, `copyVal(v)`, `changed()`.
`interactions(u)` entries: `{ x, y, label, ap, kind: 'object'|'helpUp'|'smash', objId?, unitId?, dmg? }`.
`start` opts extras: `difficulty` (name or `{ hp, dmg }`; falls back to the run, then `setup.difficulty`), `kind`,
`noPlan`, `deploy`, `summons`, `objects`, `surfaces`, `gold`, `consumables`, `maxConsumables`.
`sandbox(cfg)`: `{ w, h, seed, floor, theme, heroes: [{ id, x, y, level, skills, skillLevel, items, scars, hp }],
enemies: [{ id, x, y, hpMult }], summons: [{ id, x, y, owner }], objects: [{ x, y, id, ...overrides }],
surfaces: [{ x, y, id, turns }], terrain(tile), objective, rules, encounter, reinforcements, deploy + deployTiles,
noPlan, difficulty, gold, consumables, run, onEnd, kind }`.
State extras: `difficultyName`, `kind`, `sandbox`, `sandboxGold`, `consumables` (sandbox inventory),
`maxConsumables`, `mutations` (change counter), `undo`, `reinforcements` (copies with `done`), `heroZone`,
`enemyZone`, `stats.{xp, gold, downs, goldGained, objects}`, `objective.{destroyed, total}`.

**DD.AI**: `targetsFor(u)`, `styleOf(u)`, `estimate(u, o, dmg, element)`, `moveTo(u, x, y, path?)`,
`clearIntents(u, keepDelayed)`, `cancelIntents(u, reason)`, `cancelSpellIntents(u)`, `retarget(u, t)`,
`redirectIntent(u, intent, t)`, `defaultPlan(u)`, `api(u)`. `makeIntent` adds the intent to `unit.intents` (use
`opts.noAdd` to only build it) and starts the skill's cooldown (`opts.noCooldown` to skip); extra opts `dir`,
`level`. Intent extras: `id`, `level`, `pending` (it was planned with a delay; kept until it fires).
`describe()` extras: `uncertain`, `delay`, `targetName`. Planner api extras: `canUse(u, skillId)`, `slot(u, skillId)`,
`style`; `bestAttack(u, { skills, noMove, style })` → `{ moveTo, path, skillId, slot, target, score }`.

**DD.AutoPlay**: `runBattle(maxRounds)` → `{ result, rounds, timeout }`.

**Unit fields**: `lastDir` (last cardinal direction; ctx.dir fallback), `level` + `hypeBonus` (heroes), `isBoss`,
`title` (summons), `fled` (minions that fled a boss fight). **Slot**: `fresh`. **Status instance**: `fresh`.
**Tile**: `melt` (terrain restored when frozen water melts).
**Def extras read by the engine**: statuses `defaultTurns`, `skipFresh`, `enemyDecay: 'afterPlan'`, `stunLike`;
terrain/object/surface `hazard`, surfaces `airborne`, terrain/surfaces `slide`, all three `react` (element table),
objects `init(obj, tile)`, `available(obj, unit)`, `smashable`, `onRoundEnd(obj, tile, state)` (also per instance).

## Deviations (interpretations of the contract)

- LOS: when the line passes exactly through a corner, it is blocked only if **both** side tiles block.
- Shapes: `line` starts next to the **user** (the origin parameter is not used), stops before walls, LOS blockers
  and tiles ≥ 2 higher than the user; `pierce: false` stops at (and includes) the first active unit or blocking
  object. `cone` apex is the user. `ring` size 0 = the origin. `custom` gets `ctx` (partial ctx inside `area()`).
- `damageTiles` default filter is `'foes'` when there is a source (`'all'` without one).
- Environmental causes (`status, surface, terrain, bump, fall, explosion`) skip the source's outgoing modifiers but
  still credit it; `status, surface, terrain, fall` ignore armor by default. High ground only for `cause: 'skill'`.
  Marked is added after the multipliers, before armor. An environmental kill gives +20 Hype **instead of** +8.
- Durations: stun/sleep/frozen applied during the owner's own turn skip their first decay ("loses its NEXT turn").
  On enemy units root/slow/haste/taunt tick **after enemy planning** (not at the enemy turn end), so `turns: 1`
  applied in the player phase covers the enemy's next execution AND its next planning (no move, taunt target).
- Block is not reset at the first player phase, so item Block and `onCombatStart` Block survive into round 1.
- Cooldowns: `slot.cd = N` on use plus a `fresh` flag that skips the first tick at the owner's next turn start, so
  a skill used in round r is usable again in round r+N+1. Enemy cooldowns start when the intent is **planned**.
- Delayed intents carry `pending: true` and survive planning until they fire (delay 0 at the next enemy phase).
- Charmed enemies use flipped hostility for the round (they plan/hit their own side; their old intents then only
  damage units hostile to them). Taunt redirect: unit/ground anchors retarget if range/LOS allow, `dir` skills
  turn toward an adjacent taunter, self-centred areas are kept only if they already cover the taunter.
- Downed heroes are immovable, take no damage and lose their statuses. Summons fall into pits like enemies.
- `setSurface` refuses pits/walls/nonsense liquids and does not trigger `onEnter` for occupants (`applyElement`
  and `splash` affect units). `setSurface(..., -1)` = permanent (MAPGEN's scenery convention).
- `placeObject` refuses a movement-blocking object on an occupied tile (returns null). `Act.interact` runs the
  def/instance `interact.fn` first, then the instance `onInteract` (skipped if `fn` returns `false`).
- **New: Smash** interaction (1 AP, 5 damage) on adjacent destructible objects that are the `destroy` objective's
  targets or flagged `smashable` (totems) — otherwise heroes had no reliable way to break objective objects.
- Summons created mid-turn arrive with 0 AP unless `ready: true`. Units spawned mid-combat get `onCombatStart`.
- Only heroes (not summons) can use consumables. `flags.large` is cosmetic (all units are 1 tile).
- `killAll`/`protect` win as soon as every enemy is dead (pending waves are skipped); `survive` wins early only if
  no wave is pending. The end of combat (`onCombatEnd`, `combat:end`, `onEnd`) is finalized when the outermost
  public action returns; `state.result`/`phase: 'over'` are set immediately.
- `heroes()` = hero units incl. downed; `party()` = all hero-side units incl. summons; `friendsOf(u)` excludes `u`.
- A content `canUse` returning `undefined`/`null` counts as OK (only `false` or a string blocks).

## Requests

- **HUD**: action bar from `DD.Combat.slotsOf(unit)` (summons have `basic`/`signature` = null); costs via
  `costOf`, disabled reasons via `canUse`/`canUseConsumable`; previews via `DD.Combat.preview` (`perUnit[id].text`,
  `lethal`, `uncertain`, `objects`); move paths from `Combat.reachable(u).get(key)` (`path`, `hazard` → red);
  interactions have `kind` (`helpUp`, `smash`, `object`); enemy panel text via `DD.AI.describe`; deploy via
  `deployMove`; show `state.objective.text` (+ MAPGEN's `objective.flavor`).
- **Content authors**: put primary numbers in `levels[i].dmg` / `.heal` (and `push`/`pull`/`stun` when relevant) —
  AI and AutoPlay value skills from them; `desc(L, user)` must work with `user === null`; tag random skills
  `random`; use `DD.Act.*` for every effect; status `turns` follow DESIGN 4.4 (see Deviations for enemy root/taunt).
- **RENDER-SPRITES**: FX the engine emits: `move` (one per tile, has `from`), `slide`, `jump`, `teleport`, `lunge`,
  `damage` (opts `element`, `blocked`, `crit` = high ground, `cause`; `cost: true` for HP costs), `heal`, `block`,
  `status` (`removed: true` on removal), `text`, `bark`, `death` (`cause`), `downed`, `revive`, `spawn`, `explosion`,
  `particles` (coins/dust/fire/zap/smoke/bubbles), `tile` (glow/pulse/crack/splash, optional `color`), `shake`,
  `banner`, `wait`, `sound` (hit, crit, fire, frost, zap, poison, heal, buff, debuff, push, bump, fall, explosion,
  death, downed, coin, summon, click).
- **RENDER-WORLD**: mirrors keep their facing in `obj.data.facing` (and `obj.facing`), `'N'|'E'|'S'|'W'`. FYI: in
  `tools/shot.sh` screenshots of `encounter=test_a1_boss` (with or without `autoplay=1`) the boss intro banner never
  finishes (identical frames at 5 s, 9 s and 12 s, the fight never advances). Pumping `DD.FX.update(16)` by hand with
  the real fx_render handlers drains the same queue in 134 updates, so it looks like frame timing under headless
  virtual time (rAF `ts` deltas, or the banner's `sfx`), not the FX data. Fights without a banner do advance.
- **Lead**: consider documenting `modifyStatus`, the def extras above and the Smash interaction in ARCHITECTURE.

## Known issues

- No real heroes/enemies/items/consumables/encounters exist yet; everything is validated with `tests/fixtures.js`.
  The `content:` suites skip consumables/items until some are registered and only structure-check events
  (resolving event choices needs META's event api).
- `tools/test.sh` runs under virtual time, so `performance.now()` does not advance inside a suite: the timing
  assertions there are trivially true. Real timings were measured with a scratch page without virtual time
  (numbers above).
- The default AI does not value pushing heroes into hazards unless a skill's `aiScore` says so (AutoPlay does,
  through previews).
- AutoPlay is greedy per unit (no cross-unit planning); it uses a consumable only when a preview scores it ≥ 10.

## Integration changes (by the integrator — details in docs/notes/content-digest.md §6)

- `Act.damage`: charm vs the charmer and `resist: 0` immunity set `d.nullified` → 0 damage, flat bonuses included; a
  hook's own `d.mult = 0; d.flat = n` still deals exactly n.
- AutoPlay: `crossedHazard` prices hazards crossed on the way (no more lava walks); `rescueMove` walks a hero with
  move + 2 AP next to a downed ally to Help Up (skipped when a `downedAlly` revive skill is usable).
- `tests/content_tests.js`: narrator-pack detection via `idle_dm`/`gameover_title`; sprite whitelist synced with
  `DD.Sprites.OPTIONS` (asserted). `tests/run_tests.js`: sandbox swaps `enemies` too.

## Phase 4 — engine requests (ENGINE REQUESTS role)

Files: `js/engine/{targeting,actions,combat,ai,grid,hooks}.js`, `js/core/fx_core.js`, `js/data/terrain.js`,
`tests/{engine_tests,content_tests}.js`; surgical content migrations listed below. ARCHITECTURE §5.1–5.6 and §6 now
document all of it (hook list, declarative extras, preview fairness, AI api), so it is the true contract again.

### Summary

- **Fair previews.** The dry run copies the real RNG, so it knew the next roll: Chaos Bolt, Wild Card, every 4th
  Drip Check spell, MAGNIFICENCE surges, Echo Chamber, Gambler's Ruin, the Chaos Crystal... all previewed the exact
  outcome (and AutoPlay used it). Now a dry run counts its combat-RNG draws; when it rolled dice the preview is
  `uncertain` and is computed from `DD.Targeting.SAMPLES` (8) dry runs on other dice: their common outcome if they all
  agree, else the expected outcome (means + `xMin/xMax` ranges, `lethalChance`, `statusChance`, `movedChance`,
  `samples`, text like `"? −3–9 · Burn 50% · KO 40%"`). Whether dice are rolled depends only on the visible state, so
  the flag gives nothing away. Bookkeeping draws (loot gold, summon names, anything under `Targeting.pure`) don't
  count. No draw → exact, as before. `random` tag / `DD.Act.markUncertain()` / `ctx.uncertain = true` still flag it.
  Invariant (checked by every preview suite): **a preview that is not uncertain is exact**. A replay that hits a
  content error reports it once. Def `preview()` entries get `block` / `blocked` = 0.
- **Hooks**: `modifyFinalDamage(d)` (target, after armor + Marked, before Block), `preventDeath(unit, d)` (a veto via
  `Hooks.some`, before any part of a death or down; a refused fall climbs out), `onAnyDeath(unit, dead, d)` (every
  active unit's own sources + each rule once with unit null, via the new `Hooks.fireOwn`), `onAllyDowned(unit,
  downed, d)`, `modifyHeal(h)` (incoming, target), `modifyMoveCost(m)` (`Combat.moveApCost`), `modifyOutgoingPush(p)`
  (pusher, before `modifyPush`), `modifyGuard(g)`, `c.level` in `modifyCost`, `onCostPaid(p)` + `ctx.paid` (what was
  really paid, HP never below 1). `threatAt` (the shared aura-threat query) is documented and accepted by `content:`.
- **Status flags**: `noMove` (bool or fn: like Root for `Combat.reachable`, the planner, `api.reachable`,
  `AI.moveTo`, mid-walk stops; `Act.cantMove` / `Combat.cantMove`), `stunLike` is now read wherever stun / sleep /
  frozen are (`Act.isStunned`, `Combat.isStunned`, canUse, turnAp, intent cancel, `stunImmune`), `takenMult` (number
  or fn: applied next to Vulnerable and read by `AI.estimate`).
- **AI**: rule-level `telegraphFlat(unit, intent, rule)` in `AI.intentDmg`; `styleOf`: function planners go by their
  shortest damage skill, `def.aiStyle` overrides; `AI.defaultPlan(u, style)` / `api.defaultPlan(u, style)`,
  `AI.approach(u, style)` / `api.approach`; planner-aware `recharm` (re-aims only the skills planned for now: a ⏳
  skill never fires early); `AI.turnOn(unit, victim, { src, turns, filter })` and `addStatus(..., { noRecharm })`;
  `estimate` reads `takenMult`. `describe` "fizzles if out of range." for `los: false` was already in (now tested).
- **Tiles**: a tile callback counts as a side effect (no Undo) only if it changed something through DD.Act, called
  `DD.Act.touch()` or rolled the combat RNG (the pressure plate now touches). `DD.Act.stopMove(unit)` ends the current
  walk without a status. `hazard` may be `(unit, tile) => bool` (per side) in `hazardAt`, `hazardDamage` and pathing.
- **FX**: `DD.FX.push` repairs a broken `ms` (NaN, ±Infinity, negative, words → the type default; numeric strings kept).
- **Objective text**: an object def may give a `pluralName` ("Destroy 2 Chafing Dishes"; act 2 request).

### Changes by file

- `targeting.js`: `simulate(fn, { seed, record })` (draw counter on the copy's RNG, `Act._sim` record), `preview`
  sampling + `aggregate` + `signature`, `pure()` marks its draws quiet, `SAMPLES`.
- `actions.js`: `markUncertain`, `_quiet` / `quietly` (loot gold, summon names), `cantMove`, `isStunned`,
  `isStunLike`, `takenMult`, `stopMove`, `tileCall` (mutation-counting tile callbacks), the damage-pipeline hooks,
  `zeroHp` → `preventDeath`, `onAnyDeath` / `onAllyDowned`, `modifyHeal`, `modifyOutgoingPush`, `addStatus`
  `noRecharm`, the stun-like generalisation; `kill` returns false when refused (credit stats only for real kills).
- `combat.js`: `isStunned` / `cantMove` via Act, `moveApCost` hook, Guard hook, `costOf` level, `pay` →
  `onCostPaid` + `ctx.paid`, canUse 'Stunned!' for any stun-like, destroy-objective `pluralName`.
- `ai.js`: `styleOf` / `styleSpec` / `aiStyle`, `noMove` checks, `ruleFlat`, `recharm`, `turnOn`, `copyIntent`,
  `defaultPlan(u, style)`, `approach`, api `defaultPlan(u, style)` / `approach`, `estimate` + takenMult.
- `grid.js`: `hazardFlag`, function hazards in `hazardAt` / `hazardDamage`; custom area fn draws are quiet.
- `hooks.js`: `some`, `fireOwn`, `each(unit, cb, noRules)`.
- `fx_core.js`: `push` sanitizes `ms`. `terrain.js`: the pressure plate calls `DD.Act.touch()`.
- Tests: `engine_tests.js` 6 new `engine: phase 4 — …` suites (previews of rolls, damage / death / heal hooks,
  cost / move / push / guard hooks, status flags, AI, hazards / Undo / stopMove / FX / describe / pluralName); each was
  mutation-checked (reverting the change fails it). `content_tests.js`: uncertain previews are checked for
  well-formedness instead of exactness; the hook-name list knows the new hooks and `threatAt`.

### Content migrations (surgical; each with a regression test in its own test file that fails without it)

| content | workaround | why migrated | now |
|---|---|---|---|
| `bosses/lich.js` | onDeath un-killed him after the death bark, log, XP/gold tally, +8 Hype and onKill | fragile (the author's request) | `preventDeath` → collapse; onDeath only narrates the real death |
| `bosses/dm.js` | Plot Armor healed him back after the hit | buggy: lifesteal, stats and the log saw the whole hit; a heal popup | `modifyFinalDamage` clamps the hit (the heal-back stays as a safety net) |
| `bosses/dm.js` | house-rule telegraph flats only on his own skills | buggy: his cameos (real enemies) lied under Exploding Dice / AC Is Back / Flanking | rule-level `telegraphFlat`; his skills keep only DM Fiat |
| `bosses/dm.js` | `dm_exposed` multiplied in a hook | AI / AutoPlay estimates undervalued an Exposed DM | `takenMult: 1.5` |
| `heroes/marbles.js` | a silent 1-turn Root to stop a slipping walker | buggy: a stray "−Rooted" popup after planning | `DD.Act.stopMove` |
| `heroes/syllamin.js` | emptied the foe's intents around `addStatus('charmed')` to keep recharm off | fragile (relied on recharm's internals) | `addStatus(..., { noRecharm: true })` |

Test updates forced by fair previews (they asserted that random outcomes are previewed exactly, i.e. the leak):
`hero_zarathor` previews (+ a 4th-spell surge must be uncertain), `hero_marwyn` previews (+ surges at 5 stacks
uncertain), `shared.js` `previewThenUse` (Chaos Crystal), `passives.js` Echo Chamber + the random-loadout preview suite
(certain previews still exact). The notes of each area say so.

Not migrated (they work; listed for their owners): Slate's grapple (a core Root with remembered foreign roots;
`noMove` on `sla_grappled` would drop the root, its vines and the merge code, but it is a refactor of a tested system
and `hero_slate` asserts the Root), Corelos' death rule (a rule's `onDeath` fires once per death: fine; `onAnyDeath`
exists now), Revenge Arc polling `state.units` (works; `onAllyDowned` exists), Bedside Manner's second heal and Couch
Potato's Confused (its desc says Confused; `modifyHeal` / `modifyMoveCost` exist), the Hourglass looking the level up
(works; `c.level` exists), Sparrow's HP-cost passives re-deriving the cost (work; `onCostPaid` exists), Josiah's
miasma (not a hazard at all today: `hazard: fn` would make the AI avoid it, a balance call for its author),
`lich_mortal`'s +50% hook (could declare `takenMult`), act 3's re-implemented approach (could use
`api.approach(u, style)`), act 2's explicit melee styles (still fine).

### Deviations

- `preventDeath` also covers heroes (a refused down) and falls (the unit climbs out to the nearest safe tile).
- `onAnyDeath` fires only for deaths (not downs) and not on the dead unit; rules get it once with `unit = null`.
- `modifyHeal` is incoming only (the source's `healBonus` applies first); `modifyFinalDamage` fires on the target only
  and never on a nullified (immune / charmed) hit.
- `modifyOutgoingPush` is skipped for self-pushes. `stopMove` counts as a side effect (no Undo).
- Planner-aware `recharm` restricts the re-aim to the skills of the refunded now-intents; a skill not in the unit's
  slots can't be re-aimed (the attack is called off).
- `styleOf` changed for function planners without `aiStyle` (shortest damage skill instead of the longest).

### Requests

- **HUD**: uncertain entries carry `dmgMin/dmgMax`, `lethalChance`, `statusChance`, `movedChance` and `samples`: a
  "3–9?" badge (or "KO 40%") would read better than the mean. `e.text` already says it.
- **AutoPlay**: use `DD.Combat.cantMove(u)` instead of `has(u, 'root')` (holds) and `DD.Combat.isStunned` for custom
  stun-likes; `DD.Targeting.preview` is fair on its own now (an uncertain preview is already the expected value over
  8 rolls); `DD.AI.estimate` reads `takenMult`.
- **Lead / docs**: cross-reference the declarative extras (§5.3) from §3.2 / §3.3 / §3.7; the §9.6 passives deviations,
  the DD.Run flow functions, `&passives=` (§10.1) and DESIGN §6 Corelos are outside the engine sections.
- **Slate (optional)**: `noMove: true` on `sla_grappled` would retire the grapple's core Root (vines on the held foe,
  the foreign-root merge); the tests asserting `has(g, 'root')` would move to `DD.Combat.cantMove(g)`.
- **Josiah (optional)**: `hazard: function (unit, tile) { … a foe of the brewer … }` on `jos_miasma` if foes should
  avoid it.

### Known issues

- An uncertain preview costs SAMPLES + 1 dry runs (the suite's timing check stays far under its 5 ms budget).
- Sampling estimates: a 5% proc may not show in 8 rolls; the preview still says "?" (it rolled dice), the shown
  numbers are the typical outcome.
- While the AUTOPLAY role's rewrite of `js/engine/autoplay.js` is in progress, AutoPlay sims (enemies_act1–3,
  bosses_act1–2, a hero_marwyn battle, lich honesty hit counts) miss their balance bands in the live tree. With the
  pre-rewrite AutoPlay (`.tmp/autoplay/autoplay_orig.js`) and every other current file the full suite passes;
  `.tmp/engine4/sync.sh` builds that copy in `.tmp/engine4/proj` (it shares the Chrome slot locks).

## v2 — initiative, per-unit turns, no telegraphs, no Guard (ENGINE V2 role)

Files: `js/engine/{combat,ai,actions,autoplay}.js`, `js/core/fx_core.js`, `js/data/{statuses,terrain}.js`,
`tests/{fixtures,engine_tests,content_tests,autoplay_tests}.js`, ARCHITECTURE §4.1, §4.3–4.5, §5.3–5.7, §6.1–6.2,
§6.4–6.5, §6.8, and the content guide `docs/notes/v2-migration.md` (read that first if you convert content).
Untouched: grid, targeting, hooks, mapgen, encounter, events, mapgen tests (all green as they are).

### Summary

- **Initiative.** "Roll for initiative!" (`DD.Combat.rollInitiative()`, also End Turn / the first real action during
  deployment, or `Combat.start` without deployment): every hero and enemy rolls d20 + init with `state.rng`; the order
  is fixed for the fight. Heroes: `stats.init` (def + items / scars / passives, default 0). Enemies: `def.init`, else by
  tier (minion +1, normal 0, elite +1, boss +2); `def.turnsPerRound` 1–4 gives extra entries (`entry.k`). Ties: higher
  total, higher init, heroes, then a pre-rolled coin flip. `modifyInitiative(r)` hook (rolled fights only). Fixed modes
  for tests: `initiative: 'heroesFirst'` (the sandbox default, no dice), `'enemiesFirst'`, plus `order: [...]` (unit
  objects, unit ids or def ids first). Log line, narration key `initiative`, banner + dice texts (not instant),
  `FX.custom('initiative')`, event `initiative:rolled { order, rolled }`.
- **Turns.** One entry at a time (`state.order`, `turnIndex`, `current`, `turn` = turn counter). Turn start: Block → 0
  and AP → `turnAp` + `apBank` for the unit and the summons acting on its turn, `onTurnStart`, `'turnStart'` decay,
  cooldown ticks, due wind-ups. Hero turn: the player acts (only the current turn group is controllable). AI turn:
  `DD.AI.act`. Turn end: AP → 0, `onTurnEnd`, `'turnEnd'` decay, surface / terrain `onTurnEnd`. After the last entry:
  round end (surfaces, objects, rules, encounter, survive) and the next round (reinforcements, `onRoundStart`, joiners).
  `endTurn()` resolves every following AI turn up to the next hero turn someone can play. Dead units drop out; a downed
  hero keeps the slot (skipped unless one of its summons can act); a stunned hero's turn passes by itself.
- **Summons** (`ownerId` chain) act on their owner's turn, both sides; an orphan (owner died) gets its own entry at the
  next round start. **Joiners** (`Act.spawn`, waves) roll on arrival (`initiative:joined`, `Combat.joining()`) and act
  from the next round start; units spawned while a round starts act that round.
- **No telegraphs.** The AI decides and acts at once on its turn; the planner api gained `act` / `windUp`; the old
  `addIntent` / `setIntent` act now (no delay) or wind up (delay / turns / windup). Taunt: offensive actions must reach
  the taunter (re-aimed if the skill can) or fizzle; charm flips hostility for the turn; silence = no spells; sheep
  wanders; stun-likes lose the turn; dazzle / confuse apply to its attacks.
- **Boss wind-ups** (`DD.AI.windUp`): announced (FX text, `FX.custom('windup')`, log, `windup:start`, optional banner),
  stored in `unit.intents` (`windup: true`, `turnsLeft`), land at the start of the unit's next turn (`turns` N = N
  turns), anchors `ground` (default) / `unit` (`track: true`) / `self`; interrupted at once by stun-likes / sheep and by
  death (`windup:cancel`), except `data.unstoppable`. `DD.AI.windups()` lists them (HUD / renderer).
- **No Guard, no combat-start Block.** Guard and `modifyGuard` are gone; unused AP is lost. Block is wiped for every
  unit when initiative is rolled; items' `stats.block` no longer grant Block. Block expires at its owner's next turn
  start (enemies too).
- **Durations per own turn.** `enemyDecay` is gone. Every status applied during its owner's live own turn is `fresh`
  (skips that turn's end tick), so `turns: 1` = "through its next turn"; `skipFresh: false` opts out; statuses applied
  in the start-of-turn phase (onTurnStart hooks) are not fresh.
- **AP banking.** `Act.gainAp` outside the unit's own turn goes to `unit.apBank` (negative too) and is added at its next
  turn start ("+1 AP next turn").
- **AutoPlay v2.** `takeTurn()` plays the current hero's turn group (rolls initiative in deployment); `runBattle`
  loops whole fights. Danger = wind-up tiles + every enemy's reach (`AI.reachOf`: move + damaging skills ready next
  turn, damage shared among the heroes it can reach) + `threatAt` auras; no Guard term; a caution factor shrinks the
  reach term after round 6 so careful parties don't stall (0 timeouts in a 117-fight sweep of every encounter), and
  drops it to 0 once three rounds in a row passed without any HP change (`AP.stall()`; e.g. a doorway plugged by a
  downed hero, the narrative suite's overdue-book fight).

### Changes by file

- `combat.js` (turn engine rewritten): initiative (entries, modes, explicit orders, joiners, orphans, `renumber` →
  `unit.order` = 1-based initiative position), deployment = phase `'deploy'` (round 0) with plain swaps,
  `beginRound` / `beginTurn` / `finishTurn` / `advance` (guards: 5000 turns per call, 200 rounds without a hero turn),
  `endTurn`, `endRound`, `giveTurnTo` / `setOrder` (sandbox), `rollInitiative`, the queries (`current`, `turnGroup`,
  `turnOwner`, `groupOf`, `isTurnOf`, `isActing`, `order`, `joining`, `isDeploying`, `initOf`, `isPlayerControlled`,
  `TIER_INIT`, `noteArrival`), per-turn undo, `canUse` reasons ('Roll for initiative first!', 'Not your turn.',
  "They can't act.", "Not X's turn."), hero `init` from stats, items' Block ignored. Removed: Guard, enemy planning,
  deploy replan, `nextOrder`.
- `ai.js` (rewritten): `act` (turn body), `defaultTurn` (= `defaultPlan`), `useNow`, `windUp`, `resolveWindups`,
  `windups`, `executeIntent` (taunt / dazzle / confuse / silence / sheep / stun / tracking), `reachOf`, `threatMap`,
  api `act` / `windUp` / `entry`, `addIntent` compat; `cancelIntents(u, reason, { keepUnstoppable })` emits
  `windup:cancel`; `describe` tolerates a missing unit / intent. Removed: `planAll`, `plan`, `executeAll`, `recharm`,
  `turnOn`, `retarget`, `cancelSpellIntents`.
- `actions.js`: `gainAp` banking, `isOwnTurn` = `Combat.isActing`, `addStatus` (fresh rule for every status; only
  stun-likes and sheep touch intents = interrupt wind-ups; `noRecharm` ignored), `baseUnit` `init` / `apBank`, enemy
  init by tier, summon init, `arrive` → `Combat.noteArrival`. Removed `Act.retarget`.
- `autoplay.js`: v2 takeTurn / runBattle, reach + wind-up danger model, no Guard, caution factor, `apBank` in sim gains.
- `fx_core.js`: markers `turn` / `initiative` / `windup` (0 ms), `FX.turn(unit, opts)`, `FX.shownTurn` (the unit
  whose turn the playback has reached; reset with the queue).
- `statuses.js`: `skipFresh` / `enemyDecay` flags removed (the engine does it for all), descs for stun / sleep / frozen
  / sheep ("interrupts wind-ups"), taunt, charmed, silenced. `terrain.js`: the cheeto slick's daze is `turns: 1`.
- Tests: `engine_tests.js` 60 suites (14 new v2 suites; the core / review / phase-4 suites ported), `autoplay_tests.js`
  16 suites (incl. two stalemate-breaker suites, mutation-checked), `content_tests.js` 8 suites (2 new: every enemy plays 3 rounds of turns, every encounter auto-battles, both
  with area / wind-up honesty via `watchAreas`), fixtures with init values, the knight's 3 Block at his round-1 turn
  start (was combat start, so other areas' "+3 Overly Prepared" round-1 arithmetic holds) and a boss planner using
  `act` / `windUp`.

### Public API (beyond ARCHITECTURE §5.5–5.7)

`Combat.start(setup, { initiative, order, enemyAi, noPlan, deploy, ... })`; sandbox passes the same. `Combat._beginRound`
(tests). Unit fields: `init`, `apBank`, `order` (initiative position). State: `order`, `turnIndex`, `current`, `turn`,
`joining`, `turnLive`, `initMode`, `initOrder`, `noActFirst`, `aiOff`. Events: `initiative:rolled`, `initiative:joined`,
`round:start`, `round:end`, `turn:start { unit, unitId, round, index, entry, turn }`, `turn:end`, `turn:player` (each
hero turn that waits for input), `turn:enemy` (once per run of AI turns), `windup:start`, `windup:cancel`.
`T.contentHelpers.watchAreas` (alias `watchTelegraphs`).

### Deviations

- Sandboxes default to `initiative: 'heroesFirst'` (deterministic tests); real fights roll. `noPlan` = AI units pass
  their round-1 turns; `enemyAi: false` = they always pass.
- Wind-ups resolve before the unit's normal action on that turn; taunt does not re-aim a wind-up (committed), dazzle /
  confuse / silence still apply when it lands, charm decides who counts as a foe.
- Stun-likes / sheep interrupt wind-ups when applied (not only when they would land).
- Hero AP: start-of-turn AP is computed before `onTurnStart` (a stun from that hook makes the turn pass at once).
- Enemies' Block also expires at their own turn start; enemy cooldowns start when the action happens (they used to
  start at planning).
- `turn:enemy` once per run of consecutive AI turns (compat with the HUD's enemy playback).
- Items' `stats.block` is still summed by `heroStats` (display / old saves) but never applied.
- `state.stats.xp` is still tallied (the RUN role owns XP and now levels one hero per won fight).

### Requests

- **HUD** (`combat_hud.js`): a Roll-for-initiative button in deployment (`Combat.rollInitiative()`; End Turn does it
  too); deployment is `phase 'deploy'`, round 0 (`deployActive` checks round 1 / 'player'; use `Combat.isDeploying()`);
  an initiative tracker from `Combat.order()` / `current()` / `joining()` and the events; follow `FX.shownTurn` during
  playback; select / Tab only within `Combat.turnGroup()` (others say "Not X's turn."); drop the Guard sub-label and
  tooltip; "Acts #N" is now the initiative position; intent bubbles / panel = wind-ups (`AI.windups()`, `describe`);
  threat shading from `AI.threatMap('hero')`; `M.turnPending` per `state.turn` instead of the round.
- **RENDER**: wind-ups are still `unit.intents` (telegraph code keeps working; tiles via `AI.intentTiles`); optional
  handlers for the `turn` / `initiative` / `windup` FX markers.
- **META-UI / lead** (`main.js`): the autoplay loop keys on `st.id + ':' + st.round`, so it plays only the first hero
  turn of a round and ends the others unplayed: key on `st.turn`. ARCHITECTURE outside my sections still says v1 in
  §3.1 (hero `stats.init`), §3.2 (enemy `init` / `turnsPerRound`), §3.4 (items: `stats.block` ignored, `stats.init`),
  §3.6 (status flags), §7.2 (HUD), §8.3 (narration key `initiative`), §10.2.
- **NARRATIVE**: lines for the `initiative` narration key; the Guard tip ("3 AP left -> +6 Block") is obsolete.
- **RUN**: `Run.heroStats` may report `init` (else the engine sums def + items / scars / passives).
- **AUTOPLAY** (future): LOS / walls in the reach estimate, better protect-objective play (enemies now reach the
  protected object before the party reacts).
- **Content owners**: `docs/notes/v2-migration.md` (what was removed, conversions per kind, test recipes, pitfalls).

### Known issues

- Balance: enemies act with full information at once, so many AutoPlay balance bands (enemies / bosses / hero sims)
  miss until the content pass retunes (DESIGN §5 v2 note). Protect fights (`a2_last_coffee`, `a3_snack_heist`) are
  lost early in sims.
- `AI.reachOf` ignores LOS and walls past the walk (an over-estimate, safe for AutoPlay and threat shading).
- Content still written for telegraphs keeps working where it can (compat `addIntent` delays become announced
  wind-ups, also on normal enemies); hero skills that cancel / redirect intents find nothing on normal enemies.

## v2 review — adversarial rules review of the v2 core (ADVERSARIAL RULES REVIEWER role)

Scope: the ENGINE V2 + RUN V2 work (combat / ai / actions / targeting / grid / hooks / mapgen / encounter, fx_core,
events, statuses, terrain, js/run, the run screens and their tests). AutoPlay, the combat HUD and the renderer belong
to the AUTOPLAY V2 / HUD + RENDER V2 roles and were not changed.

### Verified (probes + suites; everything below held)

- Initiative: d20 + init via state.rng, ties (init, heroes, pre-rolled coin), fixed for the fight; whole rolled fights
  (Encounter.build → deployment → rollInitiative → AutoPlay) replay identically from the same seed.
- Turn engine fuzz: 300 fixture fights + 150 real-content fights (random parties, random stun / sleep / frozen / sheep
  / root / taunt / charm / silence / dazzle / confuse / haste / slow / DoTs at random turn starts, random mid-fight
  spawns, deaths): no unit takes two turns per entry per round, dead units never start a turn, every living unit has
  a turn of its own or acts on its owner's once joiners and orphans are merged, durations stay sane, every fight ends,
  no swallowed errors.
- Joiners: spawns / waves / reassembled skeletons roll on arrival and act from the next round (round-start arrivals
  that round, round-end arrivals the next one); orphans get an entry at the next round start; Help Up keeps the slot
  (0 AP if revived on its own turn, e.g. by its own hound).
- Deaths mid-turn: a hero downed on its own turn (lava) can still End Turn and AutoPlay copes; a bomber that blows
  itself up on its own turn; a unit killed before its turn is skipped; the last enemy dying on a hero's turn ends the
  fight at once (one combat:end, endTurn refused afterwards); a wind-up landing on the last hero is a defeat.
- Stun-likes cost exactly one own turn (enemy and hero, off-turn and on-turn application); sleep wakes on damage;
  sheep lasts its 2 turns; statuses and Block of hero summons tick / expire on their owner's turn.
- Survive N rounds ends at the end of round N; rules and surfaces count rounds; undo is per turn.
- FX: endTurn chains queue one `turn` marker per started turn, playback finishes and `FX.shownTurn` catches up.
- Run: reloading the save between every step (fights restarted from their saved seed, rewards, events, level-up
  choices) reproduces the same run (same fights, level-up draws, gold); one level-up per won fight through the
  rotation (d4 → d3 → coin → no roll) holds with real fights.
- No Guard / starting Block anywhere in the engine (doRoll wipes Block; items' stats.block ignored; no content grants
  Block in round-1 onRoundStart). Leftover *texts* elsewhere: see Requests.

### Fixed (each with a regression suite in `tests/engine_tests.js`, mutation-checked)

1. **A wind-up could land with no hero turn in between** (DESIGN §4.1: wind-ups are the heroes' window). Repro: a
   `turnsPerRound: 2` boss whose two entries are rolled back to back winds up on its first turn and it lands at the
   start of its second; a wind-up made in the boss's own `onTurnStart`, in `onRoundStart` while the boss acts first,
   or at combat start without deployment landed at once too. Fix: `state.heroTurns` counts hero-controlled turn
   starts (combat.js); each wind-up records `window` (ai.js `heroWindow`): announced while the player is in control
   (a hero turn or deployment) it is answerable now, otherwise it waits for the next hero turn; `resolveWindups`
   counts a wind-up down only once its window has passed, and each countdown needs one more hero turn. One-entry
   bosses winding up on their own turn (all current content) behave exactly as before. Suite: "engine: v2 review — a
   wind-up never lands before the heroes had a turn".
2. **Summons made `ready` outside their owner's turn showed AP through other units' turns** (Ellaria's combat-start
   corgi had 2 AP during every turn before hers; "AP only on your own turn"). `Act.newSummonUnit` now gives `ready` AP
   only during the owner's turn (the turn start refreshes it anyway). Suite: "engine: v2 review — summons have AP only
   on their owner's turn".
3. **A dead unit's wind-ups vanished without `windup:cancel`** (ARCHITECTURE §5.6 promised the event on death).
   `die()` now emits it (reason `'death'`) when the unit had wind-ups. Suite: "engine: v2 review — a dead unit's
   wind-ups are cancelled".
4. New guard suites: "whole fights are deterministic by seed" and "turn-engine invariants ... (fuzz)" (25 fights by
   default, `n=` for more).

### Deviations

- Wind-ups wait for a hero window (above): `turns: n` = n of the owner's turns that follow a hero turn (identical for
  one-entry bosses). Documented in ARCHITECTURE §4.1 (`heroTurns`, phase `'initiative'`), §4.5 (`window`), §5.6, §6.1,
  §6.2 (`ready` summons) and v2-migration §7 / §10.

### Requests

- **AUTOPLAY V2**: your turn-sequence model (`seqs`) assumes a wind-up lands at its owner's turn number `turnsLeft`;
  with the window rule it lands at the owner's first turn after a hero turn (only differs for multi-entry units or
  wind-ups made outside hero turns: compare `intent.window` with `state.heroTurns`).
- **HUD + RENDER V2**: FYI `windup:cancel` now also fires on death (reason `'death'`), and `AI.describe`'s "lands at
  the start of X's next turn" stays true on hero turns (the window rule only delays wind-ups no hero has seen yet).
- **NARRATIVE** (js/data/narrator.js): three lines still teach Guard — "Somebody please remember to Guard." (round
  start), the tip "Unused AP turns into Guard at the end of your turn: +2 Block for every AP left." and "Poison ignores
  Block. Burn does not. Guard accordingly."
- **KIT** (js/data/skills_generic.js ~581): a heal desc ends "No Guard Block, obviously."
- **PASSIVE TABLE**: Loaded Dice's "2-9 → 4 Block" at the start of each fight is wiped when initiative is rolled (its
  desc is false now); Plot Armor / others are mid-fight and fine.
- **Lead (DESIGN)**: §3 Tavern bullet still says recruits join "at party average level" (code and the §3 Leveling
  bullet: the lowest level). ARCHITECTURE §10.2 still says "every enemy planned/executed".

## v2 — attacks of opportunity + reach-aware targeting (ENGINE AoO role)

User (latest playtest): *"difficulty seems very high. It should be high but the first boss is pretty much unbeatable.
And as mobs seem to prioritize the lowest health hero irrespective of range, melee characters feel very weak"* → the
user chose **attacks of opportunity + smarter targeting** (difficulty "hard but fair").
Files: `js/engine/{actions,grid,combat,ai,autoplay}.js`, `tests/{engine_tests,autoplay_tests,content_tests}.js`, this
file, `docs/notes/autoplay.md`, DESIGN §4.1–4.2 + §8 "Targeting", ARCHITECTURE §5.1, §5.3–5.7, §5.10, §6.2.
Untouched: targeting, hooks, statuses, terrain, fixtures (the fixture kits already cover every case).

### Attacks of opportunity (for content authors)

**The rule** (DESIGN §4.2, ARCHITECTURE §6.2). A **move action** that leaves a tile next to (4-way adjacent) an
**opposing** unit with a **melee basic attack** lets that unit make **one free basic attack** on the mover as it leaves:
- *Move actions*: `DD.Combat.move` (heroes, hero summons), every AI walk (`DD.AI.moveTo`, `api.moveTo`, the default
  turn's walks, a sheep's stroll). Engine-wise: `DD.Act.moveAlong(unit, path, { provoke: true })`.
- *Never*: pushes, pulls, knockbacks, falls, slides, teleports, swaps, throws, jumps, **skill dashes / charges / leaps**
  (`moveAlong` without `provoke`), deployment swaps, spawns. That is what makes mobility skills valuable — say so in
  flavor if you like; the descs need no "doesn't provoke" text (it is a rule).
- *Who strikes* (`DD.Act.opportunityOf`): hostile to the mover (charm-aware: an enemy charmed to fight for the heroes is
  on their side, so no hero strikes it — it still strikes its old friends walking off it), active, not stun-like /
  sheep; AI units also not Dazzled / Confused, and a taunted one only strikes its taunter; a charmed hero never strikes
  its charmer; **at most one per attacker per round** (`unit.oppRound`); `flags.noOpportunity` never strikes. The mover
  is not stealthed / untargetable / `flags.noProvoke`. Nothing before initiative.
- *With what* (`DD.Act.opportunitySlot`): a **hero's basic attack if it is melee** (a damaging 'unit' / 'tile' / 'dir'
  skill whose max range is 1 after `modifyRange`, aimed at foes, **never tagged `'ranged'`**, and an area skill — cone,
  line, row, custom — **only if tagged `'melee'`**: 'dir' skills always read as range 1, so without that a slingshot
  down a line or a dragon's breath cone would be a free reaction); summons and enemies: their **first ready melee
  skill** in list order (off cooldown, charges left, no silenced spell, `canUse` / `canTarget` OK). Free: no AP / HP /
  Hype, no cooldown, no charge, `usedThisTurn` untouched. Normal damage rules **and riders** (a push, a stun, a Bleed
  all apply); Empowered is neither used nor consumed. `ctx.tiles` is the mover's tile only (an area basic hits nobody
  else), and the strike is aimed at the mover even while it passes through a friend (`DD.Grid.onTop`).
- *Interrupts*: several adjacent attackers strike in unit order; when the mover is downed / killed / stun-like / rooted /
  held / moved off the tile / told to stop (`Act.stopMove`), nobody else strikes and **its walk ends there** (the move
  action is spent; a body downed on a friend's tile is moved to the nearest free tile). Walking past a foe provokes (in
  and out of its reach); stepping next to one never does.
- *Paths*: `Combat.reachable` / `Combat.move` / AI walks take the path that provokes the fewest attacks (+ hazards)
  within the move; on a tie (a stab one way, a hazard tile the other) the less harmful walk. A move that provoked
  can't be undone.

Today's melee basics (they now hold the line): Professor Marbles, Marwyn, Slate, Sparrow, Betty, Basanos (sword and
claw) — and every melee summon (corgis, the raven's Peck, imps…). Ranged basics never strike (Zarathor, Syllamin,
Ellaria, Josiah (range 2), Corelos, Buga, Kiri). New heroes: a melee basic = a free bodyguard tool; a ranged one = none.

**What to check in your content**
- **Basic attacks with side effects on the user** (a step, a self-cost, a stack counter, "first basic attack this
  turn" bookkeeping) run on attacks of opportunity too: guard them with `if (ctx.opportunity) …` in `execute`.
  `ctx.opportunity` = `o` (below), set for the whole resolution (`onSkillUsed` sees it as well).
- **Enemy skill order**: an enemy strikes with its first ready melee skill — list its basic attack first. An elite
  whose first melee skill is a 20-damage slam strikes with the slam (intended? then fine; else reorder or opt out).
- **Opt-outs / opt-ins**: `flags: { noOpportunity: true }` (it never strikes: turrets, slimes, totems, a boss that
  should not), `flags: { noProvoke: true }` (it never provokes: ghosts, faeries, slippery things) — valid for heroes,
  enemies and summons (the content registry knows them). Per status / passive / item: hooks `modifyOpportunity(o)`
  (attacker's sources, then the mover's own; a fight rule in `state.rules` runs once, with the attacker's; **must be
  pure**: the HUD's move preview, paths and the AI query it on every hover) — `o = { attacker, mover, from, to, slot,
  skill, level, flat: 0, mult: 1, cancel: false }`:
  `if (o.mover === unit) o.cancel = true` ("can't be opportunity-attacked"), `if (o.attacker === unit) o.flat += 2`
  ("+2 damage on attacks of opportunity"); `onOpportunityAttack(o)` after it resolved (`o.dealt` = HP + Block the
  mover lost; "when you make an attack of opportunity, gain…"); damage hooks see `d.opportunity`.
- **Skills that walk a unit**: `DD.Act.moveAlong(u, path)` (no provoke) is a dash; pass `{ provoke: true }` only if the
  skill really is "a move action". Never call `DD.Combat.move` from a skill.
- **Planners that move** (`api.moveTo`) now provoke on the way: see Targeting below (`api.aooCost`).

**Test recipes**
```js
// a hero walking away from a melee foe
DD.Combat.sandbox({ w: 9, h: 9, enemyAi: false, heroes: [{ id: 'marwyn', x: 2, y: 4 }], enemies: [{ id: 'a1_gob_grunt', x: 3, y: 4 }] });
const m = DD.Combat.heroes()[0], g = DD.Combat.enemies()[0];
DD.Combat.reachable(m).get('0,4').provokes;   // [g.id]
DD.Combat.provokes(m, 0, 4);                   // [{ unitId, name, skillId, skillName, dmg }]
DD.Combat.move(m, 0, 4);                       // g strikes; m walks on (or stops if knocked down / stunned / pushed)
// an enemy walking away from a melee hero (the hero strikes for free, on the enemy's move action)
DD.AI.moveTo(g, 6, 4);                         // or DD.AI.act(g) / DD.Combat.endTurn()
DD.Events.on('opportunity:attack', fn);        // { attacker, mover, skillId, from, to }
// keep an old test free of attacks of opportunity: start positions not adjacent, or
unit.oppRound = DD.Combat.state.round;         // its attack of opportunity of this round is used
unit.flags.noOpportunity = true;               // or: it never makes any
```

### Targeting (for enemy and boss authors)

The default planner — and so `api.bestAttack`, `api.defaultPlan` / `defaultTurn`, `api.approach` — is reach-aware:
- It scores what it can **actually do this turn**: every tile it can walk to × ready skill × target (walk cost ×0.2 per
  point, LOS and ranges through its candidates), `est (damage after armor…) + targetValue + position`.
- **Engaged foes first**: +4 for hitting a foe that stood next to it at the start of its turn (support 2, ranged /
  summoner 1, coward 0) → *brutes stick to the hero next to them*. Then **threat** (+¼ of the foe's best damage number,
  max 3) and damage; a kill +5 (+2 for a hero); low HP only nudges (+1.5 × the share of HP missing). For an AoE the
  kill part counts per foe hit, the focus part (engaged / threat / HP) once, for the best foe in it.
- **Attacks of opportunity are a cost**: the walk's provokes cost their estimated hits × 1.5 + 2 each (`aooCost`), and
  **Infinity if they would drop it** (nobody walks into a lethal one). Paths are the fewest-provoke ones.
- **Divers**: styles `'assassin'` (alias `'skirmisher'`) go for kills (+14, +6 heroes), the wounded (×8) and the squishy
  (low max HP, up to +4), pay attacks of opportunity at ×0.5 and walk cost ×0.05, no engagement. Use them for rogues,
  flyers, imps, assassins, anything "sneaky": `ai: 'assassin'` (default planner) or `aiStyle: 'assassin'` (custom
  planner + `api.bestAttack`). Everyone else: don't dive the weakest hero.
- **Ranged** keep their distance and shoot what is in range; next to a melee hero, stepping away costs an attack of
  opportunity (min-range-2 archers end up pinned — intended).
- **Taunt still forces**: a taunted unit walks to its taunter through attacks of opportunity (0.5 each), unless lethal.
- **Custom planners** (`def.ai(unit, api)`):
  - pick targets with `api.reachableTargets(u, { skills })` → `[{ unit, skillId, target, moveTo, path, cost, provokes,
    aoo, engaged, est }]`, engaged first, then fewest provokes, cheapest walk, most damage — instead of "sort all heroes
    by HP" (keep that only for divers and for boss wind-ups aimed at someone on purpose);
  - when you score your own destinations from `api.reachable(u)` (entries now carry `provokes: [ids]`), subtract
    `api.aooCost(u, e)` (Infinity → skip that tile); `api.engaged(u)` = who would strike if it walked away;
    `api.provokes(u, x, y)` = who a walk there provokes (null: out of reach); `api.moveTo` walks provoke and stop when
    interrupted (re-aim with `noMove` afterwards, as `actSkill`-style helpers already do);
  - `DD.AI.bestAttack(u, { noMove: true })` called with the unit placed virtually on a spot (act 3's `bestWithin`)
    treats that spot as the turn start (engagement is measured from it) and does not price the walk there — add
    `api.aooCost(u, spot)` yourself.
- Numbers to keep honest: `L.dmg` of melee skills is now also the attack-of-opportunity number the HUD shows.

### Summary (implementation)

- **Act** (`actions.js`): `opportunitySlot`, `opportunityOf` (pure, with the mover placed virtually on `from` for
  `canTarget` / hooks), `provokers`, `opportunityAttack` (marks `oppRound`, `touch()`, FX text, log, event, resolves the
  slot through `Combat.resolveSkill` with `extra: { opportunity: o, tiles: [mover tile] }`, `onOpportunityAttack` on
  both), `moveAlong` `opts.provoke` (strikes before each step, stops on interrupts, `.provoked` / `.interrupted` on the
  result), damage pipeline: `d.opportunity`, `o.flat` / `o.mult` on hits to the mover, Empowered skipped; `baseUnit`
  `oppRound: 0`.
- **Grid** (`grid.js`): `opts.aoo` on `reachable` / `path`: per-tile attacker zones (`oppZones`, from `opportunityOf` on
  each eligible unit's 4 neighbours), a Dijkstra over (tile, provokes 0..3+) states (`searchAoo`), best state per tile
  by (provokes + hazard tiles, provokes, cost); entries `provokes: [ids]` (exact, each attacker once); `Grid.provokes`.
  Without `aoo` nothing changed (same search, same paths, no `provokes` field).
- **Combat** (`combat.js`): `reachable` AoO-aware (heroes and enemies), `provokes(unit, x, y)`, `move` with `provoke`
  (no undo after a provoke; true once the action happened).
- **AI** (`ai.js`): `oppDmg` / `opportunityDmg`, `aooCost` (taunt / divers / kamikaze weights, lethal = Infinity),
  `engaged`, `threatOf`, `killBonus` / `focusBonus` / `targetBonus` / `targetValue`, `isDiver`, styles `assassin` /
  `skirmisher`, `bestAttack` (aoo positions and costs, turn-start origin, focus once per action), `approach` /
  `wander` / `moveTo` provoke-aware, `reachableTargets`, `provokes`, `estimate(…, noEmpower)`, planner api `reachable`
  (aoo), `reachableTargets`, `engaged`, `provokes`, `aooCost`. Walk cost weight 0.05 → 0.2 (divers keep 0.05).
- **AutoPlay** (`autoplay.js`): see `docs/notes/autoplay.md` "v2 attacks of opportunity".
- **Tests**: `engine_tests.js` +8 suites (`engine: v2 attacks of opportunity — …` ×6 incl. an invariants fuzz over
  random AutoPlay fights (`n=` for more; at most one per attacker per round, always next to it, never on a friend or
  while incapacitated), `engine: v2 targeting — …` ×2, ~115 assertions: provoke / once per round / next round / walking past / undo; fewest-provoke paths, `Grid.reachable`
  unchanged without aoo, `Grid.path`, `Grid.provokes`, `AI.provokes`, `Combat.provokes`, dry runs; never provoke:
  ranged and range-3 foes, stun / sleep / frozen / sheep / dazzled / confused, stealth, `noProvoke`, `noOpportunity`,
  taunted elsewhere, allies, teleport / push / pull / swap / scripted walk / charge skill / Blink, downed heroes,
  deployment; interrupts by push / lethal hit / stun, heroes and summons strike, several attackers in order; hooks:
  mover cancel (paths know it), attacker flat (estimates know it), `onOpportunityAttack` on both sides with `dealt`,
  `d.opportunity` only on its hits, Empowered kept, Weak applies, area basics hit only the mover; targeting: engaged
  sticks, unengaged kills, spent reaction → it leaves, never into a lethal hit, engaged with a mage still sticks,
  `reachableTargets` / `engaged` / `aooCost` / `opportunityDmg`, assassin and skirmisher dive (not into a lethal hit),
  an archer pinned by the knight vs stepping back from a mage, ranged shoots what is in range, taunt drags through an
  attack of opportunity, taunted foes don't strike others, a custom planner using the api helpers).
  `autoplay_tests.js` +3 suites (see autoplay.md). `content_tests.js`: styles `assassin` / `skirmisher`, hooks
  `modifyOpportunity` / `onOpportunityAttack` and flags `noProvoke` / `noOpportunity` known; `aiStyle` values
  validated. Mutation-checked: dropping `provoke` from `Combat.move`, the AI's attack-of-opportunity cost, the engaged
  bonus, the once-per-round check, the interrupts, the fewest-provoke path choice, the taunt exception, the diver
  styles, AutoPlay's walk cost and its model's disengage cost each fail suites.

### Public API (beyond ARCHITECTURE)

`DD.Act.opportunitySlot(u)`, `opportunityOf(attacker, mover, from?, to?)`, `provokers(mover, path, from?)`,
`opportunityAttack(attacker, mover, to)`; `moveAlong` opts `provoke`, result `.provoked` / `.interrupted`.
`DD.Grid.reachable(u, max, { aoo })` entries `provokes`, `DD.Grid.path(u, x, y, { aoo })`, `DD.Grid.provokes(u, path,
from?)`, (review) `DD.Grid.onTop(unit, fn)` (fn runs with `Grid.unitAt` returning that unit on its tile even when a
friend shares it). `DD.Combat.provokes(u, x, y)`. `DD.AI.reachableTargets(u, opts)`, `engaged(u)`, `provokes(u, x, y)`,
`opportunityDmg(a, m, from?)`, `aooCost(u, pos, style?)`, `aooDamage(u, pos)`, `targetValue(u, o, est, style?, origin?)`,
`targetBonus(style, facts)`, `threatOf(o)`, `isDiver(x)`, `estimate(u, o, dmg, el, noEmpower)`. Event
`opportunity:attack { attacker, attackerId, mover, moverId, skillId, from, to }`. Unit field `oppRound`. Flags
`noProvoke`, `noOpportunity`. Hooks `modifyOpportunity(o)`, `onOpportunityAttack(o)`. DamageCtx `opportunity`. Skill
ctx `opportunity`.

### Deviations (interpretations of the task)

- "Each unit at most once per round" = per attacker, per round number (refreshed at the round start, not at its turn).
- "Melee basic attack" for enemies / summons = their **first ready** melee damaging skill (a cooling-down first skill
  falls through to the next melee one); range is read after `modifyRange` (a reach weapon of 2 is not melee).
- Dazzled / Confused AI units make none (their attacks land off target by rule; a reaction would need a dice roll and
  make the move preview uncertain). Taunted AI units strike only their taunter. A charmed hero never strikes its
  charmer (it could not hurt it). Stealthed and untargetable movers never provoke.
- The attack hits the mover's tile only (`ctx.tiles`), so a row-sweep basic is single-target as a reaction; riders
  still apply. Empowered is neither used nor consumed (it is "your next damaging skill").
- `Combat.move` returns true when the move action happened, also when an attack of opportunity stopped it on the first
  tile (the AP is spent).
- Path choice with `aoo`: the fewest (provokes + hazard tiles) — one hazard tile weighs like one attack of opportunity
  — then (review) on a tie the less harmful walk (estimated hits + each hazard tile's damage, at least 2), then the
  fewest provokes, then the cheapest: a lava walk is never taken just to dodge a stab that hurts less than the lava
  (before the review the tie went to the fewest provokes, i.e. through the lava). The search's per-step count counts an
  attacker again when a path walks round it; (review) the stored paths that count 2+ are recounted exactly when each
  tile's best path is picked, so walking round a foe is no worse than going wide. The reported `provokes` is exact.
- Taunted AI units pay 0.5 per provoked attack (not ×1.5): "taunt still forces".
- AoE focus: the engaged / threat / HP part of the targeting bonus counts once per action (the best foe in the area);
  kills count per foe.
- `AI.reachOf` / `AI.threatMap` (HUD threat shading) ignore attacks of opportunity (where a foe *could* strike).

### Content suites this changes (expected; content agents re-test against it)

Full run after the change: 75 failing sections vs 74 before; 0 engine / autoplay / generic content failures; no
swallowed errors. Newly failing:
- `hero_slate: Hold Still — Grappled …`: its *control* asserts "a free grunt leaves Slate for the wounded mage" — now
  the grunt is engaged with Slate (melee basic: +4 engaged, and Slate's attack of opportunity would cost it 9.5) and
  stays on Slate: the rule working as intended. Fix the control: spend Slate's reaction (`slate.oppRound =
  DD.Combat.state.round`) and start the grunt one tile off, or assert the new behaviour.
- `bosses_act2: lich autoplay sims`: 2/12 wins (17%) vs its 20–85% band (it passed before). Over 36 fights (`seed=0..2`,
  fixture party L7) it is 15/36 before → 8/36 after; ablations (new engine + old AutoPlay 9/36, old engine + new
  AutoPlay 12/36, no attacks of opportunity 11/36, old target formula 10/36) spread the shift over the rule and the
  targeting; in those 12 fights the interns made 14 attacks of opportunity on heroes walking past them (knight 6, rogue
  5, cleric 3) and stuck to them otherwise (0 hero reactions: they never walked away). The fight is close (most losses
  leave the lich under 50 HP): retune against the new rules. Act 1 boss fixture sims over 24 fights: Grimble 4/24 →
  5/24, Rat King 3/24 → 3/24.
Newly passing: `bosses_act1: grimble autoplay sims` (0/8 → winnable).
Campaign sims, act 1 only, the same content before / after (`bash .tmp/aoo/page.sh simbefore|simafter
"seeds=120&from=2000&stop=1"`, before = the HEAD engine files from `.tmp/aoo/old/`), 2 × 120 runs (seeds 2000+ and
5000+): act-1 clears 50% → 52% (Rat King 32/121 → 36/121, Grimble 87/118 → 89/116), normal fights 0.24 → 0.22 downs a
fight, elites 0.28 → 0.39 (the seeds-2000 sample 0.28 → 0.54, the seeds-5000 one 0.27 → 0.25: noise-level). So the
change is about neutral for difficulty and moves the damage off the squishies; it does not fix the first boss (the Rat
King is still ~28%: for the bosses-act1 retune). About 80 attacks of opportunity per 160 act-1 fights, half by heroes
(corgis, the raven, Marwyn, Betty, Slate…), half on heroes; the Rat King is the most-punished mover (its planner walks
away from melee heroes without pricing it). A 12-run full campaign (seeds 300+) ran with 0 errors, 0 warnings, 0
timeouts.

### Requests

- **HUD** (`combat_hud.js`): on move hover show "⚔ provokes N" from `Combat.reachable(u).get(k).provokes` (names and
  damage: `Combat.provokes(u, x, y)`; mark the attackers); a log / FX treatment for `opportunity:attack` (the engine
  already shows "⚔️ Attack of opportunity!" over the attacker); Undo is refused after a provoking move (`canUndo()`
  already says so). Optional: an "Engaged" chip on a hero next to foes that would strike it (`DD.AI.engaged(hero)`).
- **Lead**: ARCHITECTURE §4.3 Unit: add `oppRound` (the round its attack of opportunity was used); §3.1 / §3.6 unit
  flags `noProvoke` / `noOpportunity`; DESIGN §6 hero briefs could say which heroes hold the line (melee basics).
- **Bosses act 1** (`ratking.js`, `grimble.js`): the Rat King walks away from melee heroes without pricing it (17 of 80
  sampled attacks of opportunity hit it): `api.aooCost(u, e)` in its destination scores (or `flags.noProvoke` if "a
  swarm can't be pinned" is the joke). It has no melee skill of its own (Rat Pile is self-targeted), so it never
  strikes back — intended? Rat Lawyers strike with Billable Bite.
- **Enemies act 1–3 / bosses**: mark divers (`ai: 'assassin'` / `aiStyle: 'assassin'`) — rogues, flyers (bats, pixies,
  imps), assassins; check each enemy's first melee skill (it is now its attack of opportunity); custom planners that
  pick "the weakest hero" should use `api.reachableTargets`; act 3's `bestWithin` should add `api.aooCost(u, spot)`.
- **Heroes**: guard user-side effects of melee basics with `ctx.opportunity`; consider one-verb passives / items such
  as "can't be opportunity-attacked" (skirmishers: Marbles, Sparrow, Hjalmar, Pebbles) or "+N on attacks of
  opportunity" (tanks: Marwyn, Slate, Betty, Basanos, Valdris).
- **NARRATIVE**: optional lines / barks for attacks of opportunity ("You provoke an attack of opportunity. You always
  do.").

### Known issues

- `AI.reachOf` / `AI.threatMap` (HUD shading) don't model attacks of opportunity (an over-estimate for pinned foes).
- The planner prices the attacks of opportunity of this turn's walk only; AutoPlay's enemy model approximates an
  engaged enemy's disengage cost from where it stands now.
- Content custom planners keep their own targeting until their owners adopt `api.reachableTargets` / `api.aooCost`.

## v2 AoO review — adversarial review of attacks of opportunity + reach-aware targeting (ADVERSARIAL REVIEWER role)

Scope: the ENGINE AoO change above (`js/engine/{actions,grid,combat,ai,autoplay}.js` and its suites). Files changed by
the review: `js/engine/actions.js`, `js/engine/grid.js`, `tests/engine_tests.js`, this file. Scratch harnesses (Chrome
slot aware): `.tmp/aoorev/run.sh` (+ `probe*.js`, `mut.html` mutation runs, `full.html?m=base` = the full suite on the
pre-review engine), `.tmp/aoorev/perf.sh` (real time, `?old=1` = the HEAD engine).

### Verified (probes + suites; everything below held)

- Provoking: `Combat.move`, AI walks, sheep strolls; never pushes / pulls / teleports / swaps / scripted walks /
  charges / Blink / deployment; interrupts (push, stun, lethal hit), several attackers in unit order, once per attacker
  per round (refreshed at the round start), stealth / `noProvoke` / `noOpportunity`, stunned / asleep / frozen / sheep /
  dazzled / confused / taunted-elsewhere / downed attackers; a mover killed or downed mid-path stops; the last enemy
  dying to a hero's reaction ends the fight on the spot.
- Previews: `Combat.provokes` predicts the real move exactly (who, in which order, how much): 1,196 fixture moves on 40
  random boards, 153 of them provoking, compared with a dry-run `Combat.move`: 0 mismatches (after fix 6).
- Undo is refused after a provoking move and kept for clean ones.
- Real content: 450 AutoPlay fights over every act's encounters with random real parties (seeds 7, 11 and 23 of
  `.tmp/aoorev/probe_fuzz.js`; ~240 attacks of opportunity, a third by the heroes' side): the attacker is next to the
  tile the mover leaves, hostile, not incapacitated, strikes once per round, the hit lands on the mover, no two units
  share a tile at any turn end, no swallowed errors.
- AI targeting (brutes stick, the reaction holds the line, ranged shoot what is in range / stay pinned, assassins and
  skirmishers dive but never into a lethal hit, taunt drags, custom planners with `api.reachableTargets`) and AutoPlay
  (no careless disengage, Blink out, body-blocking) suites re-run green.
- Performance (real time, Chrome, 12×12, 4 heroes vs 8 enemies crowded): `Grid.reachable` with `aoo` ~22 µs a call
  (plain ~6 µs); `AI.act` for all 8 enemies 1.6 ms (HEAD 2.1 ms); `AutoPlay.takeTurn` 5–6 ms (HEAD 5–7 ms); a full
  fixture battle 32 ms (HEAD 30 ms). Not a concern.

### Fixed (regressions in `tests/engine_tests.js` "engine: v2 attacks of opportunity — review: …"; each mutation-checked)

1. **The strike hit the friend the mover was passing.** Paths pass through friends; leaving a friend's tile next to a
   foe provokes, and the attack resolved on that tile through `Grid.unitAt` (the first unit in the list). Real content:
   6 of 97 attacks of opportunity in 150 fights hit the wrong hero (a zombie's swing meant for Basanos hit Corelos).
   Fix: `DD.Grid.onTop(unit, fn)` (`unitAt` returns that unit on its tile while fn runs); `opportunityAttack` resolves
   inside it, and so does `opportunityOf`'s virtual placement (canTarget / hooks on a tile not walked yet).
2. **A mover downed on a friend's tile stayed inside the friend** ("never end inside another unit" only moved active
   units). Fix: `moveAlong` moves any non-dead walker off a shared tile (the body to the nearest free tile; also for
   traps on scripted walks).
3. **Heroes stabbed the enemy they had charmed.** `Grid.hostile(hero, charmedEnemy)` is true (hostility is read from
   the attacker's side and charm flips only the enemy's), so the knight struck the charmed grunt walking off him to
   attack its old friends, and the AI priced that, so the charmed grunt mostly stayed put. Fix: `opportunityOf` also
   needs different effective sides: nobody on the heroes' side strikes a charmed enemy; it still strikes its old friends
   walking off it. (`hero_buga`'s "nobody strikes a colleague on the payroll" fails on the pre-review engine and passes
   now.)
4. **Ranged attacks and breath / beam cones counted as melee.** 'dir' skills always read as range [1, 1], so the
   Goblin Slingshot Kid's 6-tile sling, the Eyeball Intern's 8-tile beam, Dr. Iris's eye beam (13), the Red Dragon's
   breath (16 fire, cone 3), the Mind Flayer's blast, the Banshee's stunning scream and the Hell Hound's breath were
   their free reactions (the scream's stun even ended the hero's walk and next turn). Fix: `meleeDef` rejects
   `'ranged'`-tagged skills and area skills (any shape but single) not tagged `'melee'`. A census of every registered
   hero / enemy / summon: every melee-tagged skill is unchanged; the hound now bites; the kid, the banshee, the flayer,
   the eyeball, the dragon and Dr. Iris make none.
5. **Phantom second attacks in path choice.** The search's layer counts an attacker again when the path leaves two
   tiles next to it (walking round it), but it strikes once per round, so the wide way through fire beat the tight way
   round a grunt. Fix: stored paths that count 2+ are recounted exactly when each tile's best path is picked.
6. **A fight rule's `modifyOpportunity` / `onOpportunityAttack` ran twice per attack** (`state.rules` are among both
   units' sources): "+1 on attacks of opportunity" added 2 and its listener heard each attack twice. Fix: the mover's
   side fires with `Hooks.fireOwn` (rules once, with the attacker's).
7. **A lava walk to dodge a stab.** On a tie of (attacks + hazard tiles) the old second key (fewest attacks) chose the
   hazard: a rogue walked over lava (8) to dodge a 4-damage stab, contrary to the "never" in the deviations above. Fix:
   ties go to the less harmful walk (`walkHarm`: estimated hits + each hazard tile's damage, at least 2), then the
   fewest attacks, then the cheapest; a 14-damage reaction still loses to the lava.
8. The fixture fuzz ("invariants in random fights") now also checks that the hit lands on the mover and that no two
   units share a tile at any turn end.

### Deviations

- What counts as melee (fix 4): never `'ranged'`; area attacks only when tagged `'melee'`. Unchanged: max range 1 after
  `modifyRange`, so reach weapons (the Death Knight's range-2 cleave) and self-centred bursts (the Sewer Slime's
  Splorch, 'self' + adjacent) still make none.
- Charm (fix 3): a charmed enemy is struck by nobody on the heroes' side (nor by another charmed enemy); its old friends
  don't strike it either (as before: they don't see it as a foe at all).
- Path ties (fix 7) are broken by estimated harm before the number of attacks.

### Requests

- **Lead (DESIGN §4.2, ARCHITECTURE §6.2 / §5.1)**: "melee" = a damaging skill at max range 1 after `modifyRange`,
  never tagged `'ranged'`, an area one only if tagged `'melee'`; a charmed enemy fighting for the heroes is not struck
  by them; the strike is aimed at the mover even while it passes through a friend (`DD.Grid.onTop(unit, fn)`, §5.1); a
  body downed on a friend's tile is moved off it; a fight rule's `modifyOpportunity` / `onOpportunityAttack` runs once
  (the attacker's sources, then the mover's own); path ties: the less harmful walk, then the fewest attacks, then the
  cheapest.
- **Enemies act 1–3 / bosses act 2 (beholder.js)**: the Slingshot Kid, Banshee, Mind Flayer, Eyeball Intern, Red
  Dragon and Dr. Iris no longer make attacks of opportunity; if one should strike back up close, list a melee-tagged
  single-target skill first. The Death Knight (range-2 cleave) and the Sewer Slime (self-centred Splorch) make none
  either: give them a range-1 melee skill first if they should hold the line. A first ready melee skill with a cooldown
  is a free reaction every round it is off cooldown (the reaction starts no cooldown): the Owlbear Cub's Charge (8 +
  push, cd 2) and the Gelatinous Cube's Engulf (7 + root, cd 2) — list the plain attack first where that is not
  intended.

### Known issues

- The AI and AutoPlay price an attack of opportunity's damage, not its riders: a push / stun that ends the walk early is
  a surprise (the default turn re-aims from where it stopped; AutoPlay decides again).
- A low-HP `'coward'` (fixture only) pinned next to a melee hero does nothing: fleeing costs the reaction and the coward
  rule refuses its weak attacks.
- Paths that provoke 3+ attacks share one search layer (3+ are alike); `AI.reachOf` / `AI.threatMap` still ignore
  attacks of opportunity (unchanged, see above).

## v2 requests — flyers ignore the floor, hazards per unit, barrels, heals that revive (ENGINE role)

User requests (verbatim): "Flying characters ignore floor effects" · "Allow detonation of barrels by targetting them" ·
"Allow targetting o fheals on downed characters to heal and bring them up". Lead decisions: `.tmp/wf7/requests.md`.
Suites: `engine: v2 requests — …` (4), `autoplay: v2 — …` (4), `content: v2 requests — …` (1, advisories).

### For content authors (the rules as built)

**Flyers** (`DD.Grid.isFlying(u)`: `flags.flying` from the def, an item or a Blessing, or a status def with
`flying: true | (st, unit) => bool`) ignore EVERYTHING on the floor, good and bad. The engine already keeps them away from:
terrain `onEnter` / `onTurnEnd` (lava, water…), every non-airborne surface (`onEnter`, `onTurnEnd`, `splash`), ground
objects' `onEnter` (traps, runes, plates — a flyer never presses a plate, gold piles), ice slides, falls, shocks through
water, floor element reactions (`applyElement(..., { floor: true })`: a slick going up, a spilled brazier), hazards
(`hazardAt` / `hazardDamage`, previews, AI and AutoPlay paths). Still hits flyers: attacks and spells aimed at them or
their area (an element aimed at their tile reacts on them), explosions' blast damage, unit-centred auras, and CLOUDS:
surfaces with `airborne: true` (steam, smoke, `jos_miasma`). Only clouds are airborne (fire, poison, web and holy no
longer are). **Content that implements a floor effect itself** (a hook that reads the unit's tile: `onEnterTile`,
`onTurnStart`, `onTurnEnd`, `onRoundEnd` / `onRoundStart` scans, a "while standing on…" passive, an AI score for pushing
someone into lava) must check `DD.Grid.feelsFloor(unit)` (or `DD.Grid.feelsSurface(unit, surface)`).

**Hazards are per unit** (one place: `DD.Grid.hazardAt` / `hazardDamage` / `surfaceHazard`; previews, paths, AI
`pathRisk` / approach fields, AutoPlay walks, danger and `surfaceGain` all read them): flyers as above, and a hazard
that declares what it does — `hazardElement` (its damage's element) and / or `hazardStatus` (a status id or a list) —
is none for a unit that ignores all of it (`resist[element] === 0`; `flags.immune` / stunImmune via
`DD.Act.immuneTo`; or a status whose def `element` it resists at 0: burn = fire, poison = poison). Core metadata: lava
(fire + burn), fire (burn), poison (poison), live current (lightning). Spikes declare nothing (physical): a hazard for
every walker. Content hazards should declare theirs (`Grid.harmlessTo(def, inst, unit)`). This closes the v2 review
request "hazardAt ignores immunities" (Pebbles warned of the fire that heals him, poison-proof slimes refusing puddles).

**Volatile objects** (`volatile: true` on the def or instance; `DD.Act.isVolatile`): every object that explodes when
destroyed must say so (core: `barrel_explosive`). A player-controlled unit's single-target attack
(`DD.Targeting.aimsAtObjects`: a `'unit'` target with the `'enemy'` filter that is `kind: 'attack'`, the user's basic
attack, or a consumable without a `kind`; `target.objects: true` opts any such skill in, `false` out) may be aimed at one
in its normal range and line of sight (validTargets entry `{ x, y, obj }`; `canTarget` is not asked). `resolveSkill`
pays the use (AP, HP, cooldown, charge, Hype), then `DD.Act.detonate(user, x, y, def)` instead of `execute`: a projectile
(range > 1 or tag `ranged`) or a lunge, a log line, `destroyObject(x, y, user)` → its `onDestroyed` blast credited to the
user (kills, environmental kills, `onKill`, Buga's skim, stats). `onSkillUsed` fires (`ctx.targetObj` set, `ctx.tiles` =
the object's tile, no foes). The AI never aims at objects (enemy users: `aimsAtObjects` false, `buildCtx` sets no
`targetObj`). Previews: `detonates`, `tiles` = the blast, `blast`.

**Heals aimed at a downed ally** (`DD.Targeting.revivesWith`: a player-controlled user; `kind: 'heal'` or tag `'heal'`;
a `'unit'` target with the `'ally'` / `'allyOrSelf'` / `'any'` filter; no area; `target.revive: true` opts in, `false`
out): validTargets lists downed allies in range (`revive: true`), `buildCtx` sets `ctx.targetUnit = ctx.reviveTarget` =
the ally, and `DD.Act.heal(src, thatAlly, n)` during that skill's resolution revives it: HP = the heal after `healBonus`
and `modifyHeal` (`h.revive = true`; `h.cancel` → no revive), at least 1, at most max HP; `Act.revive(..., { hp, by })`
(0 AP, the normal log / FX / `hero_revived` narration / `revive` bark), `onHealed`, the heals stat. Never: area heals,
`cause: 'status'` heals (regen), heals outside an aimed use (lifesteal, passives, round ends), enemy heals. **Content**:
call `DD.Act.heal(user, ctx.targetUnit, n)` even when the target is downed (no `active(t)` early return) and apply the
riders (Empower, Inspire, cleanses) after the heal. Previews: the ally's entry `revived: true`, text `"UP! N HP"`.

### Summary (implementation)

- `grid.js`: `isFlying` reads status defs' `flying`; `feelsFloor`, `feelsSurface`; hazards rebuilt per layer
  (`surfaceHazard` / `terrainHazard` / `objectHazard`) on one `flaggedFor(def, inst, unit, tile)` = the hazard flag
  minus `harmlessTo`; `hazardNumbers` uses it, so `hazardDamage` agrees with `hazardAt`.
- `actions.js`: `enterTile` / `splash` use `feelsFloor` / `feelsSurface`; `applyElement` `opts.floor`; `igniteChain`
  burns the slick's walkers only; `immuneTo`, `isVolatile`, `detonate`; `heal` revives an aimed downed ally
  (`aimedRevive`: the running skill's `ctx.reviveTarget`); `revive(target, frac, { hp, by })`; `explode` records its
  tiles in a preview dry run's record (`Act._sim.blasts`).
- `combat.js`: `tileTurnEnd` per `feelsSurface` / `feelsFloor`; `resolveSkill` detonates on `ctx.targetObj`.
- `targeting.js`: `aimsAtObjects`, `revivesWith`, `volatileAt`; validTargets adds downed allies (`revive: true`) and
  volatile objects (`obj`); `buildCtx` `targetObj` / `reviveTarget`; `diff` → `revived` (+ signature, aggregate
  `revivedChance`); `preview` → `blast`, `detonates`, `revives`, blast `tiles`; a def `preview()` is skipped for both.
- `autoplay.js`: quick value of a barrel shot = a cached dry run of the blast (`blastValue`, from the actor's real
  tile; the exact pass replays the use); revive-capable targets +20 only when `safeToRevive(tm, ally, hp)` (else +2);
  `simGain` +`REVIVE_GAIN` (12) for a safe revive (a `downedAlly` skill or a heal); `healReviveReach`: Help Up and the
  rescue walk wait when a ready heal whose preview says "UP!" reaches the ally; `surfaceGain` per unit
  (`surfaceHazard`); flyers never go for step-only objects (plates) in `bestHint` / `hintedTiles`.
- `terrain.js`: only steam / smoke are airborne; hazard metadata on lava / fire / poison / electric; `barrel_explosive`
  volatile; brazier spill and candles are floor fire; descs say flyers float over (lava: "warm feet").
- `statuses.js`: `element` on burn / poison; header documents `element` and `flying`.

### Deviations

- `canTarget` is not asked for an object target (it is about a unit and the skill's riders, which don't happen). Content
  that must not be aimed at barrels opts out with `target.objects: false`.
- Detonation costs what the use costs (AP, HP cost, cooldown, charge, Hype — a signature aimed at a barrel spends 100
  Hype); costs paid inside `execute` (Throw Money's gold) are not paid (execute doesn't run).
- The revive HP is what `Act.heal` is asked for after bonuses and `modifyHeal`; a content `onHealed` sees it. The revive
  log adds ", thanks to <healer>".
- `Targeting.unitMatches` is unchanged (downed units still match only `'downedAlly'`): the downed and object branches
  live in validTargets / buildCtx.
- A hazard without metadata stays a hazard for every walker, whatever its immunities.

### Requests

- **Content sweep** (per file; the report's content fallout has the details): flag `buga_pork_barrel` volatile; let
  single-target heals revive (`gen_first_aid`, `mar_carrot`, `ell_good_boy`, `spa_blooddrive`, `peb_support`, and the
  consumables' `drinker` for Red Drink, Big Red Drink, Antidote); add `feelsFloor` checks to floor effects implemented
  in hooks (Sparrow's Bloodsucker's Bib, Pebbles' Hot Dog `inFire`, the Swamp Thing Blessing, the wisp's Lure value);
  review the barrel-aimable list (`target.objects: false` where a detonation makes no sense); declare `hazardElement` /
  `hazardStatus` on content hazards; `kir_mist` is a cloud (`airborne: true`).
- **kit** (`tests/content/kit.js`, "Second Wind, First Aid and Power Nap at every level"): asserts First Aid can't be
  aimed at a downed ally ("that is Help Up's job") — the user's new rule says it can; update the assertion.
- **UI**: validTargets entries now carry `obj` (a barrel: highlight it as a target) and `revive: true` (a downed ally:
  highlight it for heals); previews carry `detonates` / `blast` (`tiles` already is the blast area) and `revives` /
  `perUnit[id].revived` ("UP! N HP"). A click on a barrel or a downed ally's tile goes to `useSkill` / `useConsumable`
  like any other target.
- **Render**: a status that grants flight (`flying` on its def) does not hover the sprite (the renderer reads flags / def).
- **Lead**: the `cloud` surface flag request (Ghost Mist over pits) is not done: `setSurface` still lets only steam /
  smoke over pits and lava; `airborne` could become that flag.

### Known issues

- AutoPlay values a barrel shot in the quick pass from the actor's current tile (one dry run per barrel and decision);
  the exact pass replays the use from the tile it would be made from, so a shot that blows up in its own face is caught
  there, but a good shot from a far tile may be under-ranked by the quick estimate.
- Until the content sweep, a heal whose content returns early on a downed target can still be aimed at a downed ally
  (validTargets offers it) and does nothing but cost its AP; AutoPlay never does that (it previews first).

## v2 requests review — adversarial review of flyers / per-unit hazards / barrels / heals that revive (REVIEWER role)

Scope: the ENGINE role's work above (requests 2-4). Probed by running code (scratch suites, then regression suites);
the 4 author suites and the 4 AutoPlay suites were re-read for weak assertions (none found: they assert outcomes, not
calls). Suites added: `engine: v2 requests review — …` (2) and `content: v2 review — every barrel-aimable attack sets a
barrel off; every revive heal does what it previews` (real content, 240 assertions). Mutation-checked: removing the
landing call, the flyer test in `isEdge` or the cloud flag in `setSurface` fails them.

### Verified (probes + suites; everything below held)

- **Flyers vs the floor**: lava / water / mud / ice terrain, every core surface on entry, at turn end and when splashed,
  holy ground (no heal), spikes, plates (never pressed; AutoPlay never walks a flyer onto one), gold piles, content
  traps stepped / pushed / teleported onto, oil slicks going up, brazier spills, candles, water shocks, ice slides,
  `setTerrain` under them, mud cost, hazards in `reachable` / `path` / `AI.pathRisk` / AutoPlay danger. Clouds still
  poison flyers (entry, turn end, splash); an element AIMED at a flyer's tile and an explosion's blast still hit it.
- **Barrels**: range, line of sight (walls block, units never do: a barrel behind a foe is a fair shot), plain barrels
  excluded, opt-in / opt-out, chain reactions, melee whacks (the attacker in its own blast: preview −7 = reality −7),
  summons, consumables, credit (kills, environmental kills, Hype as previewed), AP / cooldown paid and riders skipped,
  undo cleared (`useSkill`), the AI never aims at one (enemy `candidates` iterate units only; `aimsAtObjects` is false for
  enemies, enemy summons and charmed enemies). **All 55 real barrel-aimable skills and consumables** detonate a barrel
  with preview = reality, a pure preview, AP paid and no swallowed hook error (heroes' and items' `onSkillUsed` /
  `onCostPaid` hooks all guard `ctx.targetUnit`; the Echo Blessing re-checks `isValidTarget` and finds the barrel gone).
- **Heals that revive**: HP (heal bonus, `modifyHeal`, ≥ 1, ≤ max HP), a cancelled heal, area heals / regen / heals
  outside an aimed use / enemy heals never revive, the slot this round vs next round, log / FX / narration / bark,
  `onHealed`, consumables. Real content: each of the 9 revive-capable heals does exactly what its preview says (1 gets
  the ally up today; 8 skip downed targets in their content: the content sweep, see the ENGINE role's Requests).
- **Performance**: `validTargets` with the barrel scan ×500 = 6.5 ms (24×24 map); range-40 skill ×100 = 17 ms;
  `Grid.reachable` (aoo) ×300 = 48 ms without statuses, 55 ms with 6 (status-granted flight is read per call: +12%).

### Fixed (regressions in `tests/engine_tests.js` "engine: v2 requests review — …" unless noted)

1. **Flight from a status that ended over a pit or deep water left a walker standing on it** (the new status `flying`
   API): `removeStatus` / `cleanse` (and so turn-end decay) now call `landed(unit, def)`: a unit that no longer flies
   over a drop falls (heroes and bosses climb out −25% max HP; enemies and summons die). A born flyer that also had
   wings stays up.
2. **"Next to a drop" was not per unit**: `Grid.isEdge(x, y, unit?)` is never true for a flyer and counts lava only when
   it can hurt the unit (`harmlessTo`). `Grid.reachable` entries (the HUD's "Next to a drop — easy to get shoved in"),
   the AI's standing-tile `edge` and AutoPlay's push bonuses (+10 quick, +1 exact: pushing a flying foe "towards" a pit
   was worth points) pass the unit.
3. **`Grid.feelsSurface(unit, tile.surface)`** (a surface *instance*, the natural thing for content to pass) read the
   instance's missing `airborne` and said a steam cloud doesn't touch a flyer: it now reads the def.
4. **Clouds over pits and lava** (the open `cloud` flag request): `setSurface` lets every `airborne` surface (not only
   steam / smoke by id) hang over pits and lava, and `setTerrain` keeps a cloud when a tile turns to lava or a pit (it
   used to drop the steam over a new pit). Content clouds (Plague Miasma; Ghost Mist once Kiri's owner flags it) follow.
5. AutoPlay read `flags.flying` directly in two places (`walkSig`, `walkGrid`): status flight now counts there too.
6. `validTargets`' barrel scan tests for a volatile object before the range / sight ray (cheaper; same result).

Real-content regression (`tests/content_tests.js`): every barrel-aimable skill / consumable and every revive heal, as
above.

### Deviations

- Landing only handles drops (pit / deep water): a unit whose wings end over lava, fire or a plate feels them from its
  next step or turn end (no immediate `enterTile` on landing). A `flying` status *function* turning false without the
  status being removed does not land the unit (no hook for it).
- A unit-target attack with an area (`gen_throw_chair`, `cor_rune_bolt`, `sla_rock_bottom`: custom shapes) is still
  barrel-aimable (it is a single-unit `'enemy'` target); its area hits nothing then. Owners can opt out.

### Requests

- **Content sweep** (unchanged from the ENGINE role's list; the new content suite logs them): the 8 heals that skip a
  downed target (AP spent for nothing until fixed), `buga_pork_barrel` `volatile: true`, `kir_mist` `airborne: true`,
  `jos_miasma` `hazardStatus: 'poison'`, the hook-implemented floor effects (Bloodsucker's Bib, Hot Dog, Swamp Thing,
  the wisp's lure).
- **UI**: `reachable` entries' `edge` is per unit now (no "next to a drop" line for a flyer); nothing else changes.

### Known issues

- AutoPlay's quick value of a melee barrel whack is computed from the actor's current tile, so it ignores the blast on
  the tile it would whack from (over-ranks it); the exact pass replays it and drops it. Costs an exact-pass slot only.
- `isFlying` walks the unit's statuses on every call (hot in pathing): +12% on `reachable` with 6 statuses; a per-
  mutation cache would remove it if it ever matters.

## Engine requests (v2-digest §5 "Engine / rules") — ENGINE / AI role, Nov 5

Files: `js/engine/{ai,actions,grid,combat}.js`, `js/data/{terrain,statuses}.js`, `tests/{engine_tests,content_tests}.js`,
ARCHITECTURE §5.1-5.6 / §6.5-6.6, this file. Untouched: targeting, hooks, encounter, mapgen (+ their tests).
Suites: `engine: engine requests — …` (5 suites, ~90 assertions) and `content: engine requests — clouds, loot for flyers,
wind-up-only skills (advisories for content owners)` (real content). Updated: `engine: v2 requests — flyers ignore
everything on the floor` (a flyer now pockets a gold pile: the lead's loot call).

### For content authors (new knobs; all optional, all declarative or pure)

- **Skill flags** `windupOnly: true` (or the tag `'windup'`): a skill its planner only ever winds up. The default
  planner never fires it at once (a planner that names it in `opts.skills` / `api.canUse` still gets it), it is never an
  attack of opportunity, and reach estimates (threat shading, the inspect "reach") skip it, so bosses can keep wind-up
  skills in `def.skills` for the Abilities box and the codex. `fromStand: true`: it only goes off from where the unit
  stands (a pounce, a charge, a scream). The default planner never walks first to use it (not after any walk that
  turn), and reach estimates don't add the walk.
- **Status flat damage-taken**: `takenFlat: number | (st, unit, d) => number` on a status def (−2 = 2 less per hit). The
  engine adds it to `d.flat` for every cause (a function reads `d.cause`) AND `DD.AI.estimate` reads it. Declare it
  instead of a modifyIncomingDamage flat (drop the hook, or it counts twice).
- **Estimate hooks** (pure queries, any hook source): `estimateDealt(e)` (the attacker's sources) / `estimateTaken(e)`
  (the target's own sources), `e = { attacker, target, source, skill, base, element, cause: 'skill', opportunity,
  mult: 1, flat: 0 }`. Mirror a conditional damage hook so enemy planning, the move preview's provokes numbers and
  AutoPlay know it ("+2 on your basic attack", "Taunted foes deal 25% less to him"). Thousands of calls per decision.
- **Per-victim bonuses** need nothing new: reach estimates read the skill's `telegraphFlat(unit, intent)` (and the
  rules') with an action record aimed at each foe (`anchor: 'unit'`, `unitId` = the foe, `windup: false`), so Pack
  Tactics and webbed prey already show on the right heroes. A skill whose telegraphFlat cancels flats for wind-ups only
  (Swelling Ranks, Ill-Gotten Gains) must be windupOnly (they are: tag 'windup').
- **Hooks** `onDeathPrevented(unit, d)` (right after preventDeath refused it; the HP is already set) and
  `onStatusRemoved(unit, st, reason)` ('removed' | 'expired' | 'cleansed'; the status is already gone) on the unit's
  sources; a status def's own `onRemove(unit, st, reason)` runs first. Not on downs / deaths.
- **"This turn only"**: `addStatus(u, id, { thisTurn: true })` = `{ turns: 1, fresh: false }` (gone at the end of the
  current own turn; no more clearing `inst.fresh` by hand). `{ fresh: false }` alone: this turn's end counts.
- **Tile callbacks** get how and from where: terrain `onEnter(unit, tile, cause, from)`, surface `onEnter(unit, tile,
  cause, from)`, object `onEnter(unit, obj, tile, cause, from)` (cause 'move' | 'push' | 'teleport'; `from` = {x,y}).
- **Clouds**: `cloud: true` and `airborne: true` are one flag (`DD.Grid.isCloud`); terrain.js gives every cloud both
  at load, so either works for content and every reader agrees.
- **Loot**: `loot: true` on an object def or instance: picked up by whoever enters it, flyers too (the lead's call).
- **Cones stop at walls** like lines: a cone tile needs the user's line of sight and is no wall, sight-blocker or
  cliff 2+ above the user. Open floors are unchanged.
- **Log**: re-applying a status that changes nothing (same stacks, no longer duration) is no longer logged or popped
  ("The Rat King is Wet." once per wade, not per tile). Ignition chains name the surface ("The Oil Slick goes up...").
- **Barks**: a line naming a hero (any capitalised word of 3+ letters of the hero's name, whole word: "Hjalmar", "Buga",
  "Mayor") who is not in this fight is never picked; a key with no line left stays silent. Literal-text barks are left
  alone.

### Summary (by request)

1. **AI estimates.** `opportunityDmg` adds `o.flat` after the multipliers like `Act.damage` (Betty's hammer 5 + 7 on a
   Vulnerable walker: 13, was 15). `AI.estimate(u, o, dmg, el, noEmpower, skill)` = `round(dmg × mult + flat)`, Marked,
   armor, and now also statuses' `takenFlat`, the `estimateDealt` / `estimateTaken` hooks (their presence cached per
   state mutation counter), Frozen ×1.5 physical, a hero attacker's foreign taunt −50% and 0 vs its charmer,
   `flags.invulnerable`, resist 0 = 0 even with flats. The default planner adds the attacker's status `telegraphFlat`
   (the public estimate still leaves it to the caller: AutoPlay adds it itself).
2. **Reach** (`AI.reachOf` / `threatMap`). The walk = the move action's AoO-aware paths minus those whose attacks of
   opportunity would drop it (or a lethal hazard); ready skills honour content `canUse`; `windupOnly` skipped,
   `fromStand` from its own tile only; aimed / line / cone reach needs sight past the walk (a BFS through tiles that
   don't block line of sight; area extents spread freely past the target; `los: false` skills ignore walls);
   per-victim bonuses on the foe's tile and in the new `units` map; `only` = the active taunter. Wrapped in
   `Targeting.pure`.
3. **Approach field.** Hostile units are walls (the targets aside); walled in with no route, only a step that gets
   closer counts. **Boxed in** (Infinity at its tile) → `squeeze`: a move action with `passDowned` through the bodies
   of downed foes (never ends on one; log "X squeezes past the fallen. Rude."), from the default turn and after a custom
   planner that did nothing at all (no state mutation, same tile). `Grid.reachable / path` and `Act.moveAlong` take
   `passDowned`.
4. **Mid-turn stun.** `AI.moveTo` / `api.moveTo` refuse a stun-like unit or a sheep (the sheep's own stroll uses the
   inner walk); `AI.windUp` / `api.windUp` refuse a unit that is stun-like / a sheep during its own turn (unstoppable
   wind-ups aside).
5. **Taunt on a charmed enemy.** `AI.activeTaunter(u)`: a taunter that is no foe of u is void (targets, candidates,
   `bestAttack`, `reachableTargets`, reach `only`); the attack-of-opportunity rule already checked hostility.
6. **Combat.finish** narrates `objective_failed` when the result is a defeat and a hero still stands; `defeat` for a TPK.
7. **Log noise, names, barks**: above.
8. **Hooks and options**: above (`onDeathPrevented`, `onStatusRemoved` + `onRemove`, `thisTurn` / `fresh: false`,
   `enterTile(unit, tile, cause, from)`, `isCloud`, `isLoot`, cones). A refused instant kill keeps its HP
   (`zeroHp(target, d, keepHp)`).
9. **Loot (the lead's call).** `enterTile` fires a ground object's onEnter for a flyer when `Grid.isLoot(obj)`;
   `gold_pile` is `loot: true` (desc: "Walk or fly a hero (or a hero's summon) over it to pocket 3-6 gold. Flyers swoop
   down for it: Onyx has never once resisted.").

### Deviations

- `windUp` refuses only during the unit's own turn (a mid-turn stun); outside it (scripted content, tests) a stunned
  unit's wind-up is still recorded and is interrupted when it would land, as before (`enemies_act3`'s Unshakeable test
  winds up a stunned dragon by script). `moveTo` refuses a stunned unit at any time.
- The tag `'windup'` counts as `windupOnly` (the three tagged skills, Grimble's Audit and the Rat King's Gnaw and
  Surge, are wind-up only already).
- Reach sight is a BFS through non-blocking tiles from every walk tile: never less than the real line of sight (a
  supercover line of length d is a 4-connected walk of d steps), a little more round corners; it ignores heights and a
  skill's minimum range.
- `takenFlat` applies to every cause (a function decides); content that keeps its modifyIncomingDamage flat and also
  declares takenFlat counts it twice.
- `opportunityDmg` does not add the attacker's status `telegraphFlat`: status flats on attacks of opportunity ride on
  `o.flat` through `modifyOpportunity` (Valdris' Freshly Forged does both; adding telegraphFlat counted it twice).
- The squeeze needs a downed body on the way; a unit walled in by living foes, walls or cliffs still waits.
- Barks: a name word shared by two heroes (the fixtures' "McTest") hides a line naming the one present when the other
  is absent. No real hero shares a name word.

### Requests

- **DESIGN §4.3 (docs agent, this run)**: the loot wording, exactly as built. The docs agent's current bullet already
  says it; keep it: "**Loot is not a floor effect.** Picking something up is a choice, not the floor happening to you,
  so a flyer still swoops down for the money: loot objects (gold piles, a dragon's Hoard Piles) are pocketed by whoever
  enters their tile, flying or not — a hero (or a hero's summon: Onyx has never once resisted a gold pile) flying over
  one pockets it. Everything else on the floor stays below a flyer." Add to the area rules: "Cones stop at walls like
  lines (no breath round corners)."
- **ENEMIES ACT 3** (`act3.js`): `a3_hoard_pile` → `loot: true` (the lead's call: flyers pocket Hoard Piles too), its
  desc "Flyers can't reach down that far." → e.g. "Flyers swoop down for it too.", and its `autoplay` hint without the
  `feelsFloor` check (the content advisory lists it until then). `windupOnly: true` on `a3_dragon_breath`,
  `a3_dk_monologue`, `a3_fiend_audit` (advisory); `fromStand: true` on the Hell Hound's Pounce if it only goes off from
  where it stands. The custom approach field (review fix 6) can use the default one now.
- **ENEMIES ACT 1 / 2**: `windupOnly: true` on `a1_mimic_slam` (advisory) and Mama's Stomp; `fromStand: true` on the
  gargoyle's dive, Mama's pounce, the cub's charge and the banshee's scream (the act 2 request). Act 2's `defaultThen`
  approach workaround can retire.
- **BOSSES** (dm.js, lich.js, beholder.js): `windupOnly: true` on `dm_rocks_fall`, `dm_railroad`, `dm_tpk` (advisory)
  and the Lich / Dr. Iris wind-up skills; they may then go back into `def.skills` (Abilities box, codex) without phantom
  at-once threats. The Rat King's Scurry stays a boss rule (the engine's squeeze only steps over downed bodies).
- **HERO MARWYN**: `mrw_rage` → `takenFlat: function (st, unit, d) { return HIT_CAUSES[d.cause] ? -(st.stacks || 1) : 0; }`
  and drop its modifyIncomingDamage; the Loincloth → `hooks.estimateTaken(e)` mirroring its ×0.75 (estimates then show
  a raging, loinclothed Marwyn's real hits).
- **ITEMS** (`items.js`): the Whetstone (and every item with a conditional flat or mult) → `hooks.estimateDealt(e)` /
  `estimateTaken(e)` mirroring its damage hook (`e.skill`, `e.attacker`, `e.target`).
- **HERO BASANOS**: Hair Trigger can listen to `onDeathPrevented` (after Plot Armor), the form to `onStatusRemoved`.
- **KIT**: the Mystery Potion's sheep can use `addStatus(..., { thisTurn: true })` instead of clearing `inst.fresh`.
- **HERO HJALMAR**: the banana peel's `onEnter(unit, obj, tile, cause, from)` can send a slider on the way it came.
- **AUTOPLAY** (`autoplay.js`, `autoplay_tests.js`): `readySkills` should skip `DD.AI.windupOnly(def)` skills and treat
  `DD.AI.fromStand(def)` ones as no-walk; `DD.AI.reachOf` is now honest about walls, attacks of opportunity, canUse and
  per-victim bonuses (`units`) if you want to use it. The suite "an archer's reach respects walls…" asserted as a
  *premise* that `AI.reachOf` ignores sight past the walk: it no longer does (the engine agrees with AutoPlay now).
- **HUD** (`combat_hud.js`): `AI.reachOf(u).units` (foe id → number with per-victim bonuses) if the inspect panel lists
  who it can reach; `only` is null for a void taunt. Threat shading needs no change.

### Known issues

- Final full run (900 suites, 120,110 assertions): one failure, `hero_marwyn: AutoPlay battles, act 1` ("Marwyn takes
  turns in every fight — expected 5, got 4": the totems fight now ends in round 1), from the AutoPlay agent's
  in-progress `autoplay.js`: with that same autoplay.js and the PRE-change engine files (scratch copy
  `.tmp/eng5/proj_b`) it fails identically. Earlier runs of this pass also caught other AutoPlay suites mid-edit (the
  wind-up step-out, "steps out of the reach…"); they pass now. The new suites fail on the pre-change engine (41
  failures), so they test the change.

### Balance (sims: `tools/sim.sh "seeds=60&from=1000|2000&diff=normal"`, before = the pre-change engine files with the
same autoplay.js, scratch copies `.tmp/eng5/proj_b` / `.tmp/eng5/proj`; reports `.tmp/eng5/simAB*_*.txt`)

| 120 runs (2 × 60) | before | after |
|---|---|---|
| campaign wins | 55 (46%) | 52 (43%) |
| act 1 cleared | 83 (69%) | 83 (69%) |
| Rat King / Grimble | 45/68 (66%) / 38/49 (78%) | 45/68 (66%) / 38/50 (76%) |
| act 2 cleared (of entered) | 67/83 (81%) | 63/83 (76%) |
| act 3 cleared (of entered) | 55/67 (82%) | 52/63 (83%) |
| normal fights: downs / fight | 0.72 · 0.80 | 0.64 · 0.70 |
| elite fights: win · downs / fight | 96% 1.00 · 95% 0.74 | 91% 1.06 · 95% 0.94 |
| boss fights: win · downs / fight | 85% 1.54 · 84% 1.61 | 82% 1.51 · 85% 1.69 |

Noise-level overall (the 95% intervals are ±12%); the first boss and act 1 are unchanged (identical runs up to the
act-1 boss in both batches). What moves difficulty, and which way: harder — enemies no longer park behind a downed
hero (unit-aware approach field + the squeeze) and estimate attacks of opportunity / Frozen / flats correctly; easier —
a hero's Taunt no longer wastes a Charm, a unit that slips mid-turn stops walking and winding up, enemy breath cones
stop at walls (the heroes' cones too). Normal fights lost ~10% of their downs, elites gained a few. No content declares
`windupOnly`, `fromStand`, `takenFlat` or the estimate hooks yet: when the owners adopt them (Requests), AI estimates
and threat shading get more honest (Ginger Rage, Whetstone), not the fights' numbers. Threat shading (reachOf) is HUD
only: AutoPlay doesn't read it, so humans see less false red (behind walls, past a lethal stab).
- `AI.describe` still lists "polymorph" / "sleep" for bosses immune to them (digest item, not in this pass).
- A Hell Hound standing in lava with only hazards around still idles (`positionScore` vs doing nothing; act 3 request).
- The estimate-hook cache keys on `state.mutations`: content that edits `unit.hooks` / items by hand mid-fight should
  call `DD.Act.touch()`.

## Review (balance run) — adversarial review of the engine / AI requests (REVIEWER role, Nov 6)

Scope: the "Engine requests" pass above (`ai.js`, `actions.js`, `combat.js`, `grid.js`, `statuses.js`, `terrain.js`)
and how AutoPlay reads it (AutoPlay itself: `docs/notes/autoplay.md` "Review (balance run)"). Checked by running code:
the suites, scratch probes in `.tmp/rv11/` and whole-campaign sims (normal 2 × 100, act 1 150, casual 60).

### Verified (held)

- **Every new hook / flag has a suite that exercises it for real** (estimate flats after multipliers, `takenFlat`,
  `estimateDealt` / `estimateTaken`, Frozen, charm / taunt; reach vs walls, lethal attacks of opportunity, `canUse`,
  `windupOnly` (flag and tag), `fromStand`, per-victim bonuses; the unit-aware approach field, the squeeze, refusals
  after a mid-turn stun; void taunts, `objective_failed`, log noise, `partyLines`; `onDeathPrevented`,
  `onStatusRemoved` / `onRemove`, `thisTurn` / `fresh: false`, `enterTile` cause + from, clouds, cones, loot).
- **Determinism**: identical per-fight records for the same seeds; the estimate-hook cache (keyed on the state and its
  mutation counter) and `reachOf` / `threatMap` (pure) can't change a later AI decision.
- **Flyers vs the floor** in real campaigns: every object / terrain / non-cloud surface `onEnter` wrapped — never fired
  for a flying unit in 3,000+ fights; loot pocketed by flyers 17-33 times per 100 runs.
- **Enemies don't refuse to engage or kite forever**: 0 timeouts; idle enemy turns 3.3% (3.7-3.9% with the HEAD
  `ai.js`), mostly by design; squeezes 3-10 per 100 runs (act 2 mostly; never by a statue now).
- **Speed**: `DD.AI.threatMap` 0.9 ms on a 16×14 map with 10 enemies; 0.21 s per campaign fight.

### Fixed

- **A gargoyle in Stone Form walked.** The boxed-in squeeze also ran after any custom planner that "did nothing at all"
  — including one that returns at once on purpose: the gargoyle's planner returns in Stone Form ("that turn it does
  nothing", its passive), and boxed into a pocket by a downed hero it squeezed 3 tiles past the body (gargoyle squeezes
  per 100 normal runs, seeds 1000+: 5 before, 3 after — the rest are awake gargoyles whose own walk found nothing).
  Now the squeeze follows a planner only if it looked for
  something to do (called the api's `foes`, `reachable`, `reachableTargets`, `engaged`, `moveTo`, `bestAttack`,
  `defaultPlan` / `defaultTurn`, `approach` or `canUse`) and then did nothing. Suites: `engine: engine requests — the
  approach field, the boxed-in squeeze …` (a planner that looks: squeezed; one that returns at once: stays — new
  assertions) and `content: review (balance run) — a gargoyle in Stone Form does nothing, even boxed in by a downed
  hero` (the real gargoyle; control: out of Stone Form it squeezes). Both fail with the old rule (mutation-checked).

### Deviations

- ARCHITECTURE §5.6: the squeeze after a custom planner needs the planner to have asked the api for something (list
  above). A content planner that reads `DD.AI.*` directly instead of its `api` gets no squeeze (the safe side).

### Requests

- **HUD + engine** (later): `AI.describe` still offers "Stun, sleep, freeze or polymorph" to bosses immune to the
  sheep; dropping the counters a unit is immune to (`DD.Act.immuneTo`) would break `hud_tests.js`' regex on
  `test_boss` ("Stun, sleep, freeze or polymorph"): the HUD owner can loosen it to `/Stun, sleep, freeze/` first.
- Content requests from the pass above still stand (no content declares `windupOnly`, `fromStand`, `takenFlat` or the
  estimate hooks yet; the Hoard Pile still lacks `loot: true`).

### Could not verify

- A human game: everything here was driven headless (tests, sims); threat shading itself is the HUD's area.
- The Hell Hound idling in lava (act 3) and `Combat.provokes` not naming walk-ending riders are still open (listed by
  the pass above, not regressions).

## Rules run — moving through allies, swapping places, breaking objects (ENGINE + AUTOPLAY role, Nov 6)

User (via the lead, `.tmp/wf11/user-decisions.md`): "player characters should be able to move through spaces of other
player characetrs…" → "i'm ok with both being able to move if that is truly the case. I find heroes get congersted when
terrain is around." · "Yes, add swap" · "Also, objects should be tragettable to break them". Suites: `engine: rules run —
…` (6), `autoplay: rules run — …` (3), `content: rules run — …` (1). The rules: ARCHITECTURE §6.2 (moving through allies,
the swap), §6.6 (breakable objects), §5.2 / §5.4 / §5.5 / §5.7 (APIs).

### For content authors (the rules as built)

**Moving through allies (symmetric, unchanged engine rule, now proven).** Heroes, their summons and enemies walk through
their own side and never end on a unit: corridors, doorways, a friend on a step one level up (two up is a cliff with or
without the friend), a friend on a plate (the walker presses it) or bones, a friend standing in fire (the walker burns
crossing it; in the open the path goes round), a web under the friend (the walker is rooted there and moved to the
nearest free tile), an attack of opportunity on the way (aimed at the walker, never the friend), flyers. Nobody walks
through a foe. AutoPlay's walks (`Combat.reachable`, `walkFrom`) pass allies the same way. No engine or AutoPlay change
was needed for this: what made heroes feel blocked is the HUD (requests below).

**Swap places (`DD.Combat.swap`, `swapInfo`, `swapTargets`, `canSwap`; `DD.Act.swapMove`).** A hero or hero-side summon,
on its turn, swaps with an ADJACENT hero-side ally as its move: `moveApCost` AP (a Confused hero pays 2), the ally pays
nothing and keeps its own turn. Both must be able to stand on each other's tile (terrain and objects — a walker never
takes a flyer's place over a pit —, the height rule both ways, the step within the mover's move). Refused with a reason:
a downed ally ("… is down: Help Up instead."), a stunned / asleep / frozen ally ("… is out cold and won't budge."), a
rooted / held ally ("… is stuck in place."), an immovable one (the turret), a rooted or stunned mover, no AP, not its
turn. Enemies never swap (`swapInfo` is null for them). The mover provokes attacks of opportunity as if it walked the
step (an interrupting one — down, stun, root, push, stop, or an ally no longer there / up / free — cancels the swap; the
move is spent); the displaced ally provokes nothing. Both feel their new tiles (the mover with cause `'move'`, the ally
`'teleport'` like `Act.swap`; flyers skip the floor). Bleed and `onMove` (path = the one tile) for the mover only. Log
"X swaps places with Y. <quip>", FX: both slide at once and "⇄ Swap!". Undo (Z) works like a move's (both go back, the
AP comes back) when the swap provoked nothing and its tile effects changed nothing. `Combat.provokes(unit, x, y)` on an
adjacent ally's tile gives the swap's attacks of opportunity. In deployment, a swap rolls initiative first (like a
move); the free deployment swaps (`deployMove`) are unchanged.

**Breaking objects.** Every object with HP left (`maxHp > 0`) is a target for the same single-target attacks that can aim
at barrels (`aimsAtObjects`: a `'unit'` target with the `'enemy'` filter that is `kind: 'attack'`, the basic attack, or a
consumable without a kind; `target.objects: true / false` opts in / out), in range and line of sight, on a tile no unit
stands on — unless the def or instance says `targetable: false`, or it is the protect objective's object (the party
never shoots what it guards; area hits still hurt it). validTargets entries: `{ x, y, obj, dmg, hp, breaks }` (a volatile
one: `{ x, y, obj, detonates: true }`). The use pays its costs, runs no `execute` (no riders) and hits the object for
`DD.Targeting.objectDamage`: the def's `objectDmg` (number | (L, user) => n) or L.dmg, × Weak 0.75, Inspired 1.25 and
1 + dmgBonus (items), rounded — nothing else (no damage hooks: an object is no foe; Empowered is neither used nor
consumed; no high ground). `DD.Act.breakObject` logs "Wizzy McTest takes a shot at the crate: 4 damage (2 HP left)." /
"… whacks the crate: 6 damage. <quip>" and calls `damageObject(attacker, …)`: at 0 HP the object breaks — its
`onDestroyed(obj, tile, src)` (src = the attacker; blasts, splashes, loot credited to it), the puzzle hint read before the
blow (boss fights: a puzzle step), the destroy objective's count (and its victory). Volatile objects still detonate
outright. The AI never aims at objects. Previews: `breaks: { x, y, id, name, dmg, hp, left, destroyed, text }`, text
"Break: Crate − 4 damage, 2 HP left" / "Break: Crate − 2 damage — breaks!", `tiles` = the object + any blast. **Content**:
a skill whose damage is not its L.dmg (a consumable without levels: the Thunder Jar) needs `objectDmg`; a breakable puzzle
object that must be interacted with (or scenery that makes no sense to shoot) says `targetable: false`.

### Summary (implementation)

- `targeting.js`: `objectTargetable`, `breakable`, `breakableAt`, `objectDamage`; `volatileAt` respects `targetable`
  and the protect objective; validTargets lists breakables (`dmg`, `hp`, `breaks`) and marks barrels `detonates: true`;
  `buildCtx` sets `ctx.targetObj` + `ctx.objectDmg` for a breakable; `preview` → `breaks` (`breakInfo`).
- `actions.js`: `Act.breakObject` (FX, log, `damageObject`); `Act.swapMove` (attacks of opportunity via the walk's
  `provokeLeaving`, the trade without bump, enterTile for both, never two on a tile, onMove + Bleed for the mover).
- `combat.js`: `resolveSkill` → `breakObject` when `ctx.objectDmg` is set; `swapInfo` / `swapTargets` / `canSwap` /
  `swap`; `canUndo` / `undo` handle a swap record (`kind: 'swap'`); `provokes` falls back to the swap's.
- `autoplay.js`: `breakValue` (objective / hint value + a dry run of a break that does something: foes, allies,
  surfaces, loot at `GOLD` 0.4 a gold piece; plain cover 0), the exact pass adds the loot of an object-aimed use;
  `bestSwap` (+ `swapLog` against ping-pong), executed by `Combat.swap`; switch `AP.swap = false`.
- `terrain.js`: every core object keeps its HP; all stay targetable (`targetable: true` written out on the totem — a
  destroy-objective target, shooting it is the point — and the brazier — shooting it spills fire all around, kicking it
  over spills 3 tiles away: two tools); descs say the HP ("Destructible cover (6 HP): any single-target attack can break
  it…") and the header documents `targetable`.

### Deviations

- **What an object takes**: the skill's listed damage (`objectDmg`, else L.dmg) with the user's Weak / Inspired / item
  damage bonus only. Damage hooks (`modifyOutgoingDamage`, the Whetstone's flat) are not asked — they are written for a
  unit target and an object is none; Empowered is neither used nor consumed (it waits for a foe, like on an attack of
  opportunity); no high ground. So the number is the one on the skill card, and the preview is always exact.
- `targetable: false` opts an object out of both uses (a volatile one is then no target either). The protect objective's
  object is never a target (not asked by the lead; the party never wants to shoot what it guards). Objects with HP placed
  as instances (Rocky the Pet Rock, 10 HP) are targets unless their instance says otherwise (request below).
- Swap: the ally enters its new tile with cause `'teleport'` (as in `Act.swap`); only the mover gets `onMove` and Bleed
  (the ally took no move action). An immovable MOVER can't swap either (symmetry). "A large unit that doesn't fit": every
  unit is one tile (`flags.large` is only its look), so no extra rule. A sheep ally can be swapped and a sheep can swap
  (sheep can move). A swap during deployment rolls initiative first, like a move (the free deployment swaps stay).
- Swap preview: like a move's, no dry run — `swapInfo` gives the attacks of opportunity (names, skills, estimated damage)
  and both arrival hazards / edges.

### Requests

- **HUD (`js/ui/combat_hud.js`, `js/render/renderer.js` / `input.js`)** — rule A, from the decisions file: in move mode a
  click on a reachable tile moves there even when a friendly sprite covers it (`Combat.reachable(u)` under the cursor wins
  over `DD.Render.unitAtScreen` for allies); ally sprites ghost while a move is aimed; the range reads continuous (an
  ally's tile drawn as pass-through, not a hole); the path preview runs through allies (`reachable` entries' `path`).
  **Swap**: while a move is aimed, hovering an adjacent ally → `Combat.swapInfo(u, x, y)`: `ok === true` → "⇄ Swap with
  <name>" with its `provokes` ("⚔ provokes N", as for a move) and the arrival warnings for both (`hazard`, `allyHazard`,
  `edge`, `allyEdge`); a string → that reason, greyed. Click → `Combat.swap(u, x, y)`; mark `Combat.swapTargets(u)` (⇄).
  Outside move aiming a click on an ally still selects it. Undo (Z) needs nothing (`Combat.canUndo` / `undo`).
  **Breaking**: validTargets entries `{ obj, dmg, hp, breaks }` (breakable) vs `{ obj, detonates: true }` (volatile): the
  💥 marker / "things that go boom" only for `detonates`, another marker (🔨) for breakables; hover shows
  `preview.breaks.text` ("Break: Crate − 4 damage, 2 HP left" / "… — breaks!"); the object inspect panel says its HP and
  whether the party can target it (`DD.Targeting.breakable` / `objectTargetable`). `tests/hud_tests.js` "hud: v2 requests —
  attacks aimed at an explosive barrel…" fails 3 assertions until then: "a plain barrel is no target" (it is a breakable
  now), the renderer's 💥 list (`overlay.objTargets` must keep only `detonates`) and the aim hint ("💥 2 things that go
  boom" counts a crate).
- **UI (`js/ui/ui.js` `UI.aimNotes`)**: add "🔨 Can also hit a breakable object in range (crates, totems…) for N damage;
  it breaks at 0 HP." when `DD.Targeting.objectDamage(user, def) > 0`.
- **Content tests**: `tests/content/hero_marbles.js` "Doddering Jab and Walking Stick Whack" — "whack: only the adjacent
  foe is a target" now also lists the adjacent crate (filter `!q.obj`); `tests/content/kit.js` "kit: v2 requests…" —
  "Throw Chair: a plain barrel does not explode, so it is no target": it is a breakable target now (assert `!q.detonates`,
  or that it is hit for Throw Chair's damage).
- **Object decisions (content owners)** — every breakable def and what I recommend:
  - `js/data/bosses/dm.js` `dm_screen_panel`: **`targetable: false`** (walk up and Smash it, or hit it with an area).
    Shot from range the screen drops in round 1: `boss_dm: AutoPlay sims with the real heroes … hard but fair` went from
    13/16 to 16/16 and fails "not always"; campaign DM fights 7.0 → 6.3 rounds. The desc can say so.
  - `js/data/bosses/lich.js` `lich_shelf`: keep it targetable (its desc already says "or break it (8 HP)"; a mimic shelf
    still bites when broken); write `targetable: true`. Lich sims unchanged (7/12 → 6/12, noise).
  - `js/data/bosses/grimble.js` `grim_cabinet`: targetable (cover that bursts into smoke: a fair trade); optional
    `targetable: true` and "(6 HP, any single-target attack)" in the desc.
  - `js/data/enemies/act1.js` `a1_strike_fund`: targetable (a destroy objective: shooting it is the point; union meeting
    5.3 → 4.8 rounds); desc "Destructible (8 HP): hit it with any single-target attack, or Smash it from next to it".
  - `js/data/enemies/act2.js`: `a2_bone_pile` — decide: keep (its desc already says "3+ damage scatters it"; AutoPlay shot
    151 piles in 60 runs, a new counter to Unpaid Internship) or `targetable: false` to keep "stomp or Smash";
    `a2_bone_wall` targetable (free a boxed-in ally from range); `a2_chafing_dish` targetable (destroy objective;
    Forbidden Buffet 6.6 → 6.1 rounds); `a2_coffee_machine` is a protect objective (never a target while protected).
  - `js/data/enemies/act3.js` `a3_snack_bowl`: a protect objective (never a target). Totems (`a3_kobold_pep_rally`,
    destroy): 7.0 → 5.5 rounds.
  - `js/data/heroes/slate.js` `sla_boulder` (5 HP): targetable is fine (clear your own boulder); optional explicit flag.
  - `js/data/passives.js` Pet Rock (a `rock` instance with 10 HP): add `targetable: false` to `ROCKY` (the party's pet;
    area hits still chip him).
  - `js/data/consumables.js` Thunder Jar: **`objectDmg: 8`** (its 8 lives in `execute`; without it, it only sets off
    barrels — the content suite's advisory).
- **Narrative (`js/data/narrator.js` tips)**: e.g. "Stuck behind the wizard in a corridor? Click them while moving to swap
  places. It costs a move. The wizard pretends not to mind." · "Anything with HP can be hit: a crate, a totem, that Spore
  Pod next to three goblins. Property damage is still damage."
- **Docs (lead)**: DESIGN §4.2 / §4.3 rule text (moving through allies is symmetric; the swap; breakable objects, the
  listed damage, `targetable: false`, volatile unchanged) and a tip; ARCHITECTURE §3.2 (the "what single-target skills can
  be aimed at" paragraph: objects, `objectDmg`) and §3.7 (`targetable`); README "How it plays"; the v2 digest.

### Known issues

- Until the requests above land, the full run fails in other owners' files: `hud_tests` (3 assertions), `hero_marbles`
  (1), `kit` (1), `boss_dm` (1). `hero_marwyn` "AutoPlay battles, act 1" fails as before this run (not mine).
- AutoPlay's swap prices the ally's danger, not the attack spot it gives up (`SWAP_COST` stands in): a ranged ally loses
  little, a melee ally pushed off a foe can walk back. Measured swaps: below.
- Enemies never swap (the user's rule); the enemy AI is unchanged.

### Balance

Sims, normal. "Before" = the pre-run engine files (`.tmp/wf11/eng/before/`: `js/engine/*`, `statuses.js`,
`terrain.js`) with today's content, loaded by `.tmp/wf11/eng/sim_before_c.html`; "after" = the live files; counters for
swaps and object hits: `.tmp/wf11/eng/counters.js`. Same seeds both ways.

| | before | after |
|---|---|---|
| Act 1 only, 200 runs (seeds 1000+): act 1 cleared | 121 (61%) | 122 (61%) |
| … act-1 boss (Grimble / Rat King) | 62% (59% / 65%) | 62% (58% / 66%) |
| … boss downs a fight · elite downs a fight | 2.67 · 0.57 | 2.64 · 0.48 |
| Act 1 only, 100 runs (seeds 5000+): act-1 boss | 78% (downs 2.19) | 77% (downs 1.95) |
| Campaign, 2 × 60 runs (seeds 1000+, 2000+): wins | 51 (42.5%) | 39 (32.5%) |
| … act 1 cleared · act 2 cleared (of entered) · act 3 | 79 (66%) · 60/79 · 51/60 | 68 (57%) · 48/68 · 39/48 |
| … boss fights won | 83% / 81% | 77% / 72% |
| Act-1 boss, all 353 fights pooled | 235 (66.6%) | 230 (65.2%) |

- **The first boss doesn't move**: 66.6% → 65.2% over 353 fights (noise; act-1-only batch of 200: identical). The two
  60-run campaign batches lost act-1 clears (−11 in all) to one changed decision re-rolling the rest of a run: the same
  seeds 1000-1059 are inside the 200-run batch that came out even. Act 2 / 3 conversion is unchanged (76% / 71% of the
  runs that entered act 2 cleared it, 85% / 81% act 3). Campaign wins read −10 points, inside the batches' ±12%.
- **A/B of the parts** (act 1, 200 runs): with everything 62% boss / 61% cleared; without swaps (`AP.swap = false`) 64% /
  61%; without object hits (objectDamage → 0) 65% / 64%; before 62% / 61%. All within noise.
- **What happens**: swaps 0.28-0.41 a fight (a quarter by summons); aimed object hits 0.47 (act 1) to 0.80 a fight, 70% of
  them break the object — Strike Funds (destroy objective), bone piles (act 2: a pile shot is a skeleton that never
  stands up), chafing dishes, totems, DM screen panels, braziers, spore pods. Barrel detonations unchanged (~0.15).
- **Faster objective fights**: Union Meeting 5.8 → 5.0 rounds (act 1, 200 runs), Forbidden Buffet 6.6 → 6.1, Kobold Pep
  Rally 7.0 → 5.5; the DM 7.0 → 6.3 rounds (screen panels shot down; request: opt them out). Boss and elite downs a little
  lower (swaps put the tank in front).
- Wall clock: 200 act-1 runs 4:47 vs 4:43 (+1-4%; the machine was shared).

## Review (balance run) — adversarial review of the rules run (moving through allies, swaps, breaking objects; REVIEWER role, Nov 10)

Verified by running code: the authors' suites, reviewer probes (`.tmp/wf10/rv/eng.js`, `audit*.js` via
`.tmp/wf10/rv/t.sh`), the real game page with synthetic pointer events (`.tmp/wf10/rv/rv.js`, see `docs/notes/hud-v2.md`
"Review (balance run)") and a 100-run campaign sim with counters (`docs/notes/autoplay.md` "Review (balance run)").

### Verified (held)

- **Walking through allies**: both sides walk through their own side, never through a foe, never end on a unit — the
  sim's turn-end check found 0 shared tiles in 935 fights; on 12 real maps every reachable tile is clickable at yaw 0.
- **Swaps**: refusals (downed → Help Up, stunned / asleep, rooted / engulfed (`noMove`), immovable, cliffs, pits, AP,
  turn), the mover's attacks of opportunity, the ally's none, both arrival effects, Undo only when clean, swap → Undo →
  swap again, and "there and straight back" costs two moves (no free shuffle). A strike that **shoves the ally away** or
  **downs it** calls the swap off (the mover stays, the move is spent; nobody shares a tile); one that shoves the mover
  likewise. Enemies never swap (sim: 0). No hero "moved this turn" flags exist that a swap could dodge.
- **Breaking**: every breakable def (25, from crates to Lich-tenstein's shelves) is a target from 1 and 3 tiles exactly
  when `objectTargetable` says so — including the ones that block sight (bookshelf, soda tower, bush, filing cabinet,
  shelf, bone wall) — and a killing hit with units around it previews exactly the HP each unit loses and the break
  (blasts of the barrel / Pork Barrel, the Strike Fund's 3 gold). Opt-outs: the DM's panels, the Coffee Machine, the Snack
  Bowl, Rocky; the protect objective's object. Enemies never aimed at one in the sim (0 of 577 aimed hits).
- **Who can aim** (audit of every def): the hero, summon and generic attacks, basics and consumables that can, with their object damage per
  level; the opt-outs (Fetch!, Pounce, Veinglory, Bling Throw, Slate's grapples, Kiri's lobbed arrow) read right. Damaging
  single-target SPELLS (Heckle, Collect, Hemoglobin, Juice Box, Get Over Here, Anvil) can't break objects — the rule as
  specified ("the attacks that can aim at barrels"); the object descs' "any single-target attack" means kind attack.
- **Boss puzzles** (campaign sim, 100 runs): Grimble 23 / 42, Rat King 38 / 58 (valves: 0 HP, untouched), Lich-tenstein
  14 / 15 (shelves 8 HP: AutoPlay only shoots revealed ones; a mimic shelf broken from range spawns its mimic without the
  surprise bite), Dr. Iris 24 / 25 (mirrors: 0 HP), the DM 32 / 34 in 7.4 rounds (panels opted out; Smash / blasts only).

### Fixed

- HUD: the acting hero's own sprite over an adjacent ally's tile was a dead click (no swap, no Help Up) — fixed in
  `js/ui/combat_hud.js` (`pierce`, `hoveredSwap`); suite `hud: rules run review — …` (details in hud-v2.md).
- Regression coverage added for what held but wasn't pinned: `engine: rules run review — a strike of opportunity that
  shoves or downs the ALLY calls the swap off` (mutation-checked: dropping the ally re-check in `Act.swapMove` fails it)
  and `engine: rules run review — every breakable object def: a target from 1 and 3 tiles unless opted out; a killing hit
  previews exactly what happens`.

### Could not verify

- A human playing in the browser pane (silence rule): everything was driven headless with synthetic pointer events.
- Minor, left as is: a Stealthed hero who breaks a crate stays Stealthed (stealth breaks on damage to a unit); the
  Electric Lute's water shock (previewed) and Echo Chamber's random echo (a second hit) still fire on an object hit (onSkillUsed
  hooks). Slate never swaps (immovable) — the content owner's open design question for the lead.

## Playtest fixes (Nov 12) — fix:engine (engine, run, statuses, terrain)

Source: `.tmp/wf12/confirmed-findings.json` (the six-lens playtest), lead decisions `.tmp/wf12/lead-decisions.md`.
Each fix: reproduced on the current files first (a failing regression test), fixed, re-run. Status per finding id is
kept in the table below AS WE GO (a re-run continues from it). Suites: `engine: playtest fixes — …`.

| id | sev | status | what (engine side) |
|---|---|---|---|
| combat-controls-v1 | major | fixed | rooted pass-through slides into lava (Act.moveAlong / swapMove nearestFree) |
| combat-controls-2 | major | fixed (engine; HUD warning done by fix:ui) | walks route through webs on a tie (Grid tie-break `stops`) |
| combat-controls-1 | major | fixed (engine; HUD lines done by fix:ui) | AoO previews: dry-run the strike (stops, bleed rider, random) |
| combat-controls-4 | major | fixed (engine half: `Combat.swapInfo().outcome` bleedTick / lethal; the swap hint is fix:ui's, done) | swap hint never mentions Bleed |
| robustness-1 | major | fixed | downed body left on a tile that becomes a pit |
| bosses-objectives-2 | major | fixed (engine; renderer "?" done by fix:ui) | Dazzle / Confuse on a pending wind-up: honest landing tiles |
| bosses-objectives-3 | major | fixed (AI.threatMap opts.hero + AI.turnsBefore; HUD by fix:ui, Rat King +1 by fix:content: both done) | threat counts a unit's every turn before the hero's next |
| bosses-objectives-7 | major | skipped here (fix:content's dm.js switchValue covers it; a 0 hint drops the offer in AutoPlay) | AutoPlay prices diverted wind-ups onto allies who can't move |
| first-hour-1 | major | fixed (wind-up text + AI.skillDesc / fightLevel; UI.skillInfo done by fix:ui) | wind-up text in AI.describe at the fight's damage factor |
| first-hour-3 | minor | fixed (stats.combats counts victories only) | 'Fights won' counts the lost fight |
| bosses-objectives-8 | minor | fixed (stall breaker ignores adds while a boss is up) | AutoPlay hides from Dr. Iris after the mirrors |
| bosses-objectives-9 | minor | fixed (ai.js whole-table line; keg desc; objective label) | doom 'Get out of the red'; keg desc 6 HP; objective name |
| bosses-objectives-10 / text-tone-5 | minor | fixed (engine picks hero_downed_self / _friendly; lines are fix:ui's, done) | hero_downed credit is the hero himself / an ally |
| robustness-5 | minor | fixed (test compares DD.Balance.scale) | mapgen test hard-codes brutal multipliers |
| heroes-3 | minor | fixed (Targeting.preview: breaks / detonates for tile-aimed hits) | tile-aimed object hits: no breaks preview |
| heroes-v1 | minor | partly (DD.Targeting.reach helper; fix:content swept its 11 heroes; the 5 deferred hero files remain) | +range items vs 'within N' descs |
| text-tone-2 | minor | partly (engine: named helpers must be up, {downed} token; Marwyn's line is deferred) | ally_down barks name the wrong hero |
| text-tone-3 | minor | fixed (ai.js templates; HUD / act3 / narrator halves are others') | ai.js 'its' templates for named bosses |
| text-tone-9 | minor | fixed (engine: case kept, are/is, no double line; lich.js line is content's) | object names lower-cased, 'is' for plurals |
| text-tone-10 | minor | fixed (statusVerb: is / gains / logVerb; stop() punctuation) | 'Betty is Thief!.' status log |
| text-tone-11 | minor | fixed (terrain.js chest; events / act3 / dm / zarathor / passives are fix:content's) | chest 'a Antidote' (terrain.js) |
| text-tone-20 | polish | fixed (minion / normal death barks 40%) | minion death barks every death |
| text-tone-23 | polish | fixed (terrain.js stone floor + pillar; the rest is content's) | stone floor 'load-bearing' |

Deferred (files held by the sustain builders / docs owner during this run; the post-balance finish run takes them):
heroes-4 (basanos.js Step In: canTarget like Human Shield, drop `force`), heroes-6 (slate.js Short Fuse wording),
heroes-5 (DESIGN "Wet → lightning"; marwyn / ellaria kits), heroes-10 (v2-digest §2 Campaign Promise cost), the
heroes-v1 desc sweep in the five deferred hero files, Marwyn's `ally_down` line "Basanos, get up! …" (text-tone-2: it
names a hero, so it now only fires while Basanos STANDS — write it as "{downed}, get up! …" or as a helper call).

### For content authors (new knobs, all optional)

- **Snags** (combat-controls-2): a surface / terrain / object def may declare `stops: true | (unit, tile) => bool` (entering
  ends the walk: the Web) or `hinders: …` (a nuisance: Cheeto Dust), with `snagStatus` (the status it applies; a unit
  immune to it ignores the snag; default 'root' / 'slow'). Flyers feel only clouds' snags. `DD.Grid.snagAt(x, y, unit)`
  → `{ id, name, stops }`; equal-cost paths avoid snags like hazards; `Grid.reachable` entries carry `stop` (the first
  tile on the path whose floor ends the walk, the destination included: `{ x, y, id, name }`) and `hinder`;
  `Combat.swapInfo` carries `snag` / `allySnag` (the landing tiles). Content with a root-on-enter tile (Ellaria's
  Brambles already is a hazard for foes) can add `stops: true`.
- **AoO dry runs** (combat-controls-1): `Combat.provokes(unit, x, y)` entries now add `at`, `bleed` (Bleed stacks the
  strike adds — they tick when the move ends), `stops` (null or what ends the move there: 'Downed', 'Pushed', 'Stopped' or
  the holding status' name, e.g. 'Engulfed', 'Rooted', 'Stunned'), `random`, `min` / `max`, `skipped` (an earlier strike
  ended the move); `dmg` is the dry run's HP + Block lost (riders, high ground, Block included). The array carries
  `.outcome`; `Combat.moveOutcome(unit, x, y)` gives it for a walk or a swap: `{ strikes, end, arrived (a swap: it
  happens), loss, lossMin, lossMax, bleedTick, lethal (in ANY sampled roll), uncertain }`. Random strikes show the most
  common of 8 other rolls, never the real one. `Combat.swapInfo(...).outcome` the same for swaps. Hooks fire in the dry
  run (DD.Act.simulating is true there): hooks with side effects outside the state check it.
- **Wind-up skew** (bosses-objectives-2): Dazzle / Confuse still move an attack 1 tile off / a quarter turn, but the roll
  happens when the status lands on a unit with wind-ups pending (or when a wind-up starts on a Dazzled / Confused unit),
  stored as `intent.skew = { off, turn }`; `AI.intentTiles` draws the skewed tiles while the status lasts, `executeIntent`
  lands exactly there (`AI.rollSkew(unit, intent)`). `AI.describe` says "✨ Dazzled: it lands 1 tile off, on the tiles
  marked now" and is no longer `uncertain`. Actions used at once roll at execution, as before.
- **Fight numbers** (first-hour-1): `AI.fightLevel(def, level, unit)` (an enemy's damage numbers × the fight's
  `state.difficulty.dmg`) and `AI.skillDesc(def, level, unit)` (the desc with them). `AI.describe` uses it.
- **Turns before a hero** (bosses-objectives-3): `AI.turnsBefore(unit, hero)` (0 / 1 / 2…), `AI.threatMap(side, { hero })`
  multiplies each unit's tile values by it (entries get `turns: { unitId: n }`; without `hero` nothing changes).
- **Desc ranges** (heroes-v1): `DD.Targeting.reach(def, L, user, base)` — base + the user's range changes (item +range,
  Dazzle, modifyRange): `desc: function (L, user) { … 'within ' + DD.Targeting.reach(this, L, user, 4) … }`.
- **Barks** (text-tone-2): `Act.bark(unit, key, { about: unit })` / `Act.maybeBark(unit, key, chance, opts)`; the engine's
  `ally_down` passes the downed hero: a line naming a hero is a helper call (that hero must be up), `{downed}` is filled
  with the downed hero's name. Death barks of minion / normal enemies fire 40% of the time (elites, bosses always).
- **Logs** (text-tone-9 / -10): `Act.objName(o)` ("the Crate", "The Last Keg": own case, no double article); a destroyed
  object gets "The X is / are destroyed." only when its own onDestroyed logged nothing; plural by `def.plural` or the head
  noun. Status lines: `def.logVerb` ('turns into a' for Sheep), else 'is' for adjectives (the core statuses, -ed / -ing /
  -y / -ble / -ous / -ive names) and 'gains' for nouns ("Betty gains Thief!"); no '.' after ! ? . …
- **Narration** (text-tone-5): the engine narrates `hero_downed_self` ({hero}) when the credit is the downed hero and
  `hero_downed_friendly` ({hero}, {enemy} = the ally) when it is a unit on the hero's side (lines in narrator.js, fix:ui).
- **Objectives** (bosses-objectives-9): a protect objective names the placed object's label ("Protect The Last Keg…").

### Summary of the engine behaviour changes

- A walker left on a friend's tile (rooted there, downed there) steps back to the newest tile of its walk it can stand on
  (hazard-free first), never sideways into lava; failing that the nearest free safe tile, felt as an entry (cause 'push').
  Swaps use the same settle. A downed body on a tile that becomes a pit / deep water / wall is moved to a safe spot (no
  fall damage at 0 HP); `Act.revive` stands nobody up over a drop or in a wall.
- `stats.combats` ("Fights won") counts victories only (TPKs and lost objectives no longer count).
- AutoPlay's stalemate breaker counts only the bosses (and objects) while a boss is up.
- Text: the stone floor and pillar tooltips lose "load-bearing"; the keg desc states no HP number; the chest says "an
  Antidote"; the Dazzled / Confused descs say a pending wind-up's marked tiles move.

### Deviations

- bosses-objectives-2: kept the contract (ARCHITECTURE §5.6 "dazzle shifts it 1 tile, confuse turns it") and made the
  board honest (option b) instead of exempting wind-ups (option a). The roll moved from landing time to status time, so
  the combat RNG sequence differs from before in fights with Dazzle / Confuse on a boss.
- text-tone-2: no per-line tags (lines are plain strings everywhere); the rule is "a named hero is a helper", which fits
  every current line except Marwyn's (deferred file).
- bosses-objectives-7: no AutoPlay change: fix:content's `switchValue` (dm.js) prices the stuck allies, and a hint of 0
  never makes an offer (hintedTiles needs ≥ 0.01).

### Requests

- **fix:ui** (combat_hud.js / renderer.js / ui.js):
  - combat-controls-1: read the new `Combat.provokes` fields — the stop line ("⛔ Engulf stops Professor Marbles here: the
    move is spent, the swap won't happen"; `p.stops`, `outcome.arrived`), cut the drawn path at `outcome.end`, ✖ on the
    swap arrows when `si.outcome.arrived === false`, '9?' / '0–18' from `random` / `min` / `max`, the lethal check on
    `outcome.lethal` / `lossMax`, the rider Bleed (`p.bleed`, `outcome.bleedTick`) in the bleed line.
  - combat-controls-2: warn from `e.stop` ("⚠ The path crosses a Web: Rooted there, the walk stops" when it is before
    the destination, "Ends on a Web: Rooted 1 turn" on it) and `e.hinder`; swapHint from `si.snag` / `si.allySnag`.
  - bosses-objectives-2: renderer.js ~4018 marks a wind-up '?' when the unit is Dazzled / Confused; read
    `desc.uncertain` only (false once the skew is rolled — the tiles already moved).
  - bosses-objectives-3: pass the hero to `DD.AI.threatMap('hero', { hero })` for the shading / card / inspect lines
    (or use `DD.AI.turnsBefore`); `max` stays one hit, `dmg` sums the turns.
  - first-hour-1: `UI.skillInfo` for an enemy unit in a live fight: `DD.AI.skillDesc(def, lv, unit)` instead of
    `DD.skillDesc` (the numbers this fight uses).
- **fix:content**: bosses-objectives-3 — the Rat King's numbers for his turns in the NEXT round need the coming Swelling
  Ranks stack (+1): content-side (e.g. a `telegraphFlat` / reach bonus when `DD.AI.turnsBefore` spans a round start).
  heroes-v1 — use `DD.Targeting.reach` in "within N" descs (11 heroes not deferred). text-tone-3 — act3 UNSHAKEABLE_LINE.
  text-tone-9 — lich.js:471 "a phylactery hides…" capitalised. Optional: `stops: true` on root-on-enter tiles.
- **post-balance finish run** (deferred files): see "Deferred" above; DESIGN §4 can state the wind-up skew rule ("Dazzle /
  Confuse a boss mid-wind-up and its marked tiles move to where it will land").

### Balance impact (these land before the refits; the sims measure them)

- bosses-objectives-2 (Dazzle / Confuse skew drawn): heroes and AutoPlay now dodge the real landing tiles. In 24 Lich
  fights (fight3 harness, seeds 500-523, level 3) 0 wind-up hits landed outside the board's marks (the playtest's batch:
  10, every one with the Lich Dazzled; 21/24 won). Easier for parties that Dazzle / Confuse bosses (Lich, Dr. Iris most).
- bosses-objectives-8 (stall breaker): Dr. Iris's longest quiet streak 5 → 3 rounds (24 fights, seeds 600-623; wins 18 →
  17/24, noise). A/B on Rat King / Grimble / Lich (24 each, seeds 900-923, level 2): 14 → 15, 11 → 11, 19 → 19 wins: neutral.
- combat-controls-2 (snag tie-break): both sides take the web-free route on a tie; the AI too. Tiny, slightly easier on
  web maps (a1_web_of_lies) for both players and AutoPlay.
- combat-controls-v1 / robustness-1: rare edge cases (rooted on a friend's tile; Gnaw under a downed hero): slightly
  easier (no lava slide), slightly harder (no free pit-stand after Help Up).
- combat-controls-1 / bosses-objectives-3 / first-hour-1 / heroes-3: previews and texts only; AutoPlay's swap pricing
  reads the dry-run numbers (riders included): marginally more careful swaps. No measurable change expected.
- first-hour-3 and the texts: none.

### Tests

`engine: playtest fixes — …` (12 suites in tests/engine_tests.js), `autoplay: playtest fixes — bosses-objectives-8 …`,
`mapgen: playtest fixes — bosses-objectives-9 …`, and assertions added to `run: v2 leveling …` (first-hour-3) and
`mapgen: encounter build (synthetic encounters)` (robustness-5). Each was run failing on the pre-fix code (combat-controls
-v1 / -2 and bosses-objectives-8 also mutation-checked). Updated for the new contracts: the old "a dazzled wind-up is
marked uncertain" (now: drawn where it lands), the AoO hook tests (dry runs strike copies: compare ids / skip
`DD.Act.simulating`), and the log texts ("the Crate", "the Explosive Barrel").

### Re-check after the restart (Nov 12, ~20:00)

The app closed at ~19:29, right after the table and the suites above landed. The re-run read every owned file (git diff)
and found the fixes complete: the 14 playtest-fix suites pass (100 assertions), and so do the engine / autoplay / mapgen /
run suites (323 suites), except for one failure that is not in this area:

- **Known issue (deferred file)**: `hero_marwyn: AutoPlay battles, acts 2-3` fails "many different skills used": Marwyn
  uses 5 skills besides Ginger Snap and the bar is 6. The bar is a coin flip. The same eight fixture fights over harness
  seeds 1-8 give 5, 6, 5, 6, 5, 8, 6, 6 (scratch probe `.tmp/fe/probe2.js`). Any change to a fight's dice moves the
  default seed 12345 between 5 and 6, and this run made several (the wind-up skew rolls when Dazzle / Confuse lands,
  AutoPlay pricing, content numbers). I found no AutoPlay bug behind it: the dry runs restore the combat RNG
  (Targeting.simulate), switching the snag tie-break off changes no pick (probe), and every other hero's AutoPlay battle
  suite passes. The marwyn owner made the same call (hero-marwyn.md "Known issue").
  **Request (marwyn owner / post-balance finish run)**: lower the bar to `>= 5`, or add a ninth fixture fight.

Full `bash tools/test.sh` (Nov 12, ~20:20): 991 suites, 122813 assertions ok, 2 failing sections, neither from this
area and no "Error in" warnings. One is the Marwyn bar above. The other is `balance: acts 2-3 levers (pass 2)`
(tests/balance_tests.js expects act 2-3 boss rows that js/data/balance.js does not carry yet; both files are held by the
balance owner during this run).

## Review (playtest fixes) — adversarial review of fix:engine / fix:content / fix:ui (REVIEWER role, Nov 12 ~20:45)

Re-ran the repros on the current files with a real-fight harness (`.tmp/rev-pt/fight.js`, AutoPlay boss fights with
fairness tallies; it adds a "board lied" count — a wind-up hit on a tile that was NOT marked at the victim's last turn
end while it stood still — and optional forced Dazzles / Confuses on the boss, `dz=` / `cf=`). Chrome one run at a time.

### Verified (held)

- combat-controls-v1 / robustness-1 (settleOff, downed bodies off new pits, revive on solid floor), combat-controls-2
  (web tie-break; a1_web_of_lies 20/20 won), combat-controls-1 / -4 (dry-run previews restore the combat RNG), heroes-3,
  first-hour-1, first-hour-3 (the failed-objective branch returns before `stats.combats++`), bosses-objectives-3 / -9 /
  -10, text-tone-2 / -5 / -9 / -10 / -20 / -23: code read + their suites.
- bosses-objectives-8: Dr. Iris (24 fights, s600, L3) 17/24 won, longest quiet streak 3 rounds (4 fights), most 1.
- bosses-objectives-1 / -v1 / -5: Grimble and the Rat King (24 each, s900, L2): 0 trapped wind-up hits; longest Injunction
  lock 2 turns.

### Fixed (regressions: `engine: playtest review — bosses-objectives-2 …`, `autoplay: playtest review — …`)

- **bosses-objectives-2 was only half honest.** The skew was drawn whenever the status was on, but it only applies if the
  status is still on when the wind-up LANDS. A 1-turn Dazzle / Confuse on Grimble's or the Rat King's one-round wind-up
  (two turns a round) wears off at the end of their in-between turn, so the board showed moved tiles, the describe said
  "it lands 1 tile off, on the tiles marked now", and it landed on the original ones. Probe: 7 such "board lied" hits in
  24 Grimble fights (s900, heroes Dazzling the boss 12% of turns), 3 in 24 Rat King fights; 0 / 0 after. New
  `AI.lastsToLanding(unit, intent, id)` walks the initiative order the way DD.Combat plays it (hero window, the owner's
  count-down, 'turnEnd' ticks, fresh statuses) and `landing()` applies a skew only while it will hold; the describe says
  "✨ Dazzled, but it wears off before this lands: it hits the tiles marked now" (same for Confused), and a Silenced
  spell's "this spell will fizzle" line uses the same test. The contract (§5.6: the status at resolution) is unchanged.
- **AutoPlay still priced a Dazzled / Confused unit's wind-up tiles at 50%** (`addWindups` fuzzy), though they are now
  exact: only an intent whose skew is not rolled yet counts as a coin flip (autoplay.js).

### Deviations / corrections

- The balance-impact line above ("AutoPlay's swap pricing reads the dry-run numbers") is not what the code does: AutoPlay
  prices a swap with `DD.AI.aooCost` estimates of who provokes (as fix:engine's own report says). No change made.

### Balance (what the behaviour fixes do in sims; harness numbers, not the campaign sim)

- Grimble (s900 + s1000, 48 fights, L2): 27/48 won, 0 trapped and 0 dragged-in Audit hits (the review's Stamp guard,
  bosses-act1.md); Rat King (s900, L2): 15/24, 0 wind-up hits on heroes; DM (s700, L5): 13/16, diverted-train hits on
  heroes 7 → 3, 0 downs (boss-dm.md); Iris 17/24; Lich with heavy Dazzle / Confuse injected 24/24, 0 lies.
- The skew fix makes Dazzle on a two-turn boss's wind-up do what it did before the playtest fix (nothing, if it wears off
  first) while the board stays honest; the AutoPlay pricing fix makes AutoPlay dodge Dazzled wind-ups fully.

## Finish (Nov 14) — fix:engine (engine, run layer, AutoPlay; the last run before release)

Sources: `.tmp/wf12/lead-decisions.md` (D1-D11; D1-D5 and D7 have engine parts), `.tmp/wf11/user-decisions.md`, the nine
findings routed to this role. Each finding was reproduced on the current files first (D8: probes and sims in
`.tmp/wf14/eng/`, one headless Chrome at a time). Suites: `engine: finish — …` (9), `autoplay: finish — …` (4),
`content: finish — …` (2), `mapgen: finish — …` (1), `run: finish — …` (1). Every new engine / AutoPlay suite was
mutation-checked: with its fix reverted it fails (engine: 31 assertions in 8 sections; AutoPlay: 6 in 4), then the files
were restored.

### Lead decisions (engine side)

| decision | status | what |
|---|---|---|
| D1 | built (it was not: desc-sweep-1) | `DD.Targeting.aimsAtObjects` also accepts any skill that is single-target at its level (no area, `'single'`, or a circle / square / ring / cross / row of size 0) and lists damage (`objectDmg` / `L.dmg` > 0): spells and utilities. Kind attack, the basic, kind-less consumables as before; `target.objects: false` opts out, `true` in. Newly aimable in the content: Heckle, Collect, Hemoglobin, Juice Box, Get Over Here, Anvil Drop, Sand in Your Eye (I-II only: at III its circle grows). The content's opt-outs (unchanged): Bling Throw, Fetch!, Veinglory, Hold Still, Rock Bottom, Stress Ball, Beyond, Pounce. Damage only (execute never runs on an object); previews, AutoPlay's dry runs and the HUD markers read the same predicate. A non-weapon skill's log line: "Syllamin turns Heckle on the Crate: 4 damage (2 HP left)." / "… 2 damage. Structural integrity: roasted." The core object descs (crate, explosive barrel, totem) say "any single-target damage skill can break it". |
| D2 | built | `swapProblem` no longer refuses an immovable MOVER; an immovable ally is refused with "Slate is immovable: he can start a swap, you can't move him." (`DD.Act.pronouns(u)`: a unit / def `pronoun`, else Ellaria, Sparrow and Kiri she, the other heroes he, anything else it). |
| D3 | built | `DD.Act.damageObject(src, x, y, n, { cause, reflect })`: src's own hit on an object (cause 'skill' by default) ends its Stealth like a hit on a unit ("Revealed!"); an aimed detonation does too; environmental causes (explosion, bump, status, surface, terrain, fall) and reflections don't. The engine's own callers pass their causes (blasts 'explosion', bumps 'bump', `damageTiles` its opts). |
| D4 | built | `Combat.resolveSkill`: on an object hit (a break or a detonation) `onSkillUsed` still fires — the use counts (Hype, cooldowns, use counters, Pay-to-Win) — with `ctx.objectHit = { x, y, id }` and `ctx.target = null` while the hooks run, so target riders (the Electric Lute's water shock, Echo Chamber's echo) have nothing to ride on. On-hit statuses, lifesteal and rider Hype never fired on objects (no `Act.damage`). |
| D5 | built (engine side) | AutoPlay asks object hints with a 5th argument `how`: 'break' (pricing a hit: an aimed hit, a Smash, an area), 'interact', 'step'. Request to the act 2 owner: the Bone Pile's hint returns 9 for `how === 'break'` whoever asks (today it says 0 to flyers). |
| D7 | built | A swap narrates `swap` ({hero} = the mover, {ally}) 25% of the time, after its own log line; the mover says one of its own `swap` barks ({ally} filled in) 25% of the time when its def has them, else the old 6% move bark. The content owner is adding the lines (narrator.js, hero barks). |

### Findings

| id | sev | status | what |
|---|---|---|---|
| audit-1 | major | fixed | `engine: damage pipeline` reads `DD.Balance.difficulty.brutal` (and checks it raises both); the engine's fallback rows (combat.js `FALLBACK_DIFFICULTY`, encounter.js `DIFFICULTY`, used only without DD.Balance) are 1.15 / 1.05; ARCHITECTURE §6.10 says ×1.15 / ×1.05. Suite `engine: finish — audit-1`. |
| desc-sweep-1 | major | fixed | D1 above. Suites `engine: finish — D1` and `content: finish — D1` (the seven named skills aim, hit a 40-HP crate for exactly their number, nobody else changes, the user only pays its costs). |
| bosses-objectives-9 | minor | fixed (the part still there) | Reproduced: (a) the doom text and the keg desc were already right ("Hits the whole table: there is nowhere to stand clear.", "Destructible."), but (b) the LIVE objective bar (`Combat.objectiveText`, refreshed every action) still said "Protect the Ale Keg": only the encounter's build text had the label. It now names the placed object's label ("Protect The Last Keg and defeat all enemies"). Suite `mapgen: finish — bosses-objectives-9`. |
| audit-3 | minor | fixed | Reproduced seed 43220 (r31 cap). The cause was not the King's targeting: Syllamin dodged his gavel every round (Ultra Instinct), and the party never hit him again because his next point of damage crossed his 66% split: two Rat Lawyers, and AutoPlay's spawn penalty (−(6 + 0.2 × max HP) each) beat every attack; so Buga, helped up each round with full AP, passed and was re-downed. Fix: while the stalemate breaker is on (caution 0) foes a hit calls in weigh 0.25 (`STALL_SPAWN`). Also, generic AI targeting: +30 for a kill that ends the fight (`AI.endsFight`: the last hero standing), in `AI.targetBonus` too so AutoPlay's model agrees. Seed 43220 now ends (an act 1 loss, as it should), 0 timeouts. Suites `autoplay: finish — audit-3` (a splitter that calls in a minion: left alone at round 1, hit in the stalemate) and `engine: finish — audit-3`. |
| audit-7 | minor | fixed (engine); Slate's hook requested | `DD.Act.cantMoveNext(u)`: Rooted / held at the start of its NEXT turn. A noMove status may answer with `heldThrough(st, unit) => bool`; otherwise its decay decides (a 1-turn turnEnd status during the unit's own turn, or a 1-turn turnStart one, is gone by then). `AI.reachOf` (threat shading) and AutoPlay's danger model (`src.mov`) use it. Slate's Grappled counts SLATE's turns (decay 'never'), so it needs its own `heldThrough` (request below); until then it is predicted as before. Suites `engine: finish — audit-7`, `autoplay: finish — audit-7`. |
| FF-3 | minor | fixed | Reproduced seed 80183 (r31 cap, Web of Lies). The cause was not the webs: Pebbles and Marwyn stood in a pocket shut by crates, kegs and 2-high ledges (grid dump, round 15), so no walk reached a tile to attack from; the approach field was Infinity and every move was worth −0.5. Fix: `breakOut(unit)` — a unit sealed off floods the approach field with the breakable blockers the party may aim at as dearer tiles (2 + HP / 4), walks toward the cheapest way out and values hitting a GATE (a blocker on the rim of its area, on that way) at 2 + half the damage (+4 when it breaks). With a way out, cover stays worth 0. Seed 80183: the Web of Lies ends in 12 rounds (Marwyn whacks the crate in round 9), 0 timeouts. Suite `autoplay: finish — FF-3`. |
| text-tone-2 | minor | not reproduced | Probe (`.tmp/wf14/eng/verify.js`, 40 seeds, Kiri down in Kiri / Syllamin / Basanos / Marwyn): 0 barks call a standing hero to get up; Marwyn's line now reads "{downed}, get up! …" (content). Hardened anyway: a line that OPENS by telling a named hero to get up ("Basanos, get up! …") fires only when that hero is the one down (`Act.aboutLines`); the old suite's "never named outright" assertion now expects exactly that. |
| desc-sweep-9 | polish | fixed | `DD.Run.goldPreview(n)`: what `Run.addGold(n)` would add now (gold Blessings and the carried fraction; pure). The gold card reads "Gain 38 gold (35 + 10% from Blessings)." with Trust Fund I, "Gain 42 gold (35 + 20% from Blessings)." at III, "Gain 35 gold." without. Suite `run: finish — desc-sweep-9`. Event hints are content's (request). |
| FF-6 | polish | fixed | `Act.immuneTo` (and so `addStatus`): a status whose def has an `element` (Burning fire, Poisoned poison) never lands on a unit with `resist[element] === 0`: no stacks, no "is Burning (9)" log lines, no "vs Burning" riders on a Hell Hound. Resistant (not immune) units still burn. Suite `engine: finish — FF-6`. |

### For content authors (new knobs, all optional)

- Status defs: `heldThrough(st, unit) => bool` (pure) for a hold that doesn't tick on the held unit's own turns.
- Object hints (`autoplay`): 5th argument `how` ('break' | 'interact' | 'step').
- `DD.AI.endsFight(o)` for custom planners (the Rat King's `rangedTarget` scores knockouts without it).
- Barks: `{ally}` in a 'swap' bark; `{downed}` and `{ally}` both become `opts.about`'s name.
- `DD.Act.pronouns(u)`; a def or unit may set `pronoun`.
- `DD.Act.damageObject(src, x, y, n, { cause })`: pass an environmental cause when it is not src's own hit.
- `onSkillUsed`: `ctx.objectHit` on an object hit (no `ctx.target` then).
- `DD.Run.goldPreview(n)` for texts that promise gold.

### Requests

- **HERO-SLATE (slate.js, audit-7)**: give `sla_grappled` a `heldThrough(st, v)`, e.g. `const h = byId(st.source); if
  (!holdOk(h, v)) return false; return (DD.Act.isOwnTurn(h) ? 1 : 0) + DD.AI.turnsBefore(h, v) < (st.turns > 0 ?
  st.turns : 1) + (st.data && st.data.slaFresh ? 1 : 0);` (false = the hold ends before the victim's next turn).
- **ENEMIES-ACT2 (act2.js, D5)**: Bone Pile hint `function (unit, obj, tile, s, how) { return unit && unit.side === 'hero'
  && (how === 'break' || G().feelsFloor(unit)) ? 9 : 0; }`.
- **BOSSES-ACT1 (ratking.js, audit-3, optional)**: `rangedTarget` could add +30 when the hit knocks out a hero for whom
  `DD.AI.endsFight(f)` holds (the default AI does).
- **CONTENT (D1 wording)**: object descs that still say "any single-target attack" (a1_strike_fund, a2_bone_pile,
  grim_cabinet, lich_shelf, …) and their tests (`integration: rules run — …`, `enemies_act1 / act2`, `bosses_act1 / act2`,
  `hero_slate`); `kit: v2 requests` (Sand in Your Eye is a barrel target at I-II now); narrator.js tips 483 / 489 and their
  checks in `narrative: tips` (and the 140-character cap).
- **CONTENT (desc-sweep-9)**: events.js hints that promise gold ("Gain 50 gold") can print `DD.Run.goldPreview(50)`.
- **DOCS**: ARCHITECTURE §9.2 `goldPreview(n)`; §3 status defs `heldThrough`; DESIGN §4.2 rule text for D1-D4 ("any
  single-target damage skill can break it", "Immovable units can start a swap but can't be swapped", attacking an object
  ends Stealth, no riders on object hits).

### Deviations

- D1 "single-target" = target type 'unit' AND, for skills that are not kind attack, no area at that level (or a
  point-like one of size 0). Attack-kind skills with an area (Throw Chair, Rune Bolt) aim at objects as before; area
  spells (Chain Zap) don't (their areas reach objects their own way).
- D4 nulls `ctx.target` only while `onSkillUsed` runs (it is restored after) instead of asking every rider to check; a hook
  that needs the tile reads `ctx.objectHit`.
- audit-3 was not a targeting loop as the audit described it (the King went for the last hero standing on his first turn
  each round; Ultra Instinct dodged it). The AI bonus is added for the general case anyway.
- FF-3: the stall was a sealed pocket, not the webs; webs need nothing new (a web step already gives progress at caution 0).

### Balance (no number moved; behaviour only)

Paired against the audit's RK batch (`.tmp/audit/runs/a1_rk90_33000.txt`, the same 400 act-1 runs on seeds 33000+; the
files then had the Rat King row, now they also carry this run's other owners' changes):
`tools/sim.sh "seeds=400&from=33000&stop=1&verbose=1"` → `.tmp/wf14/eng/sim/a1_33000.txt`.

| | audit (RK) | finish |
|---|---|---|
| act 1 cleared | 65% (261) | 66% (263) |
| Grimble · without / with a starting healer | 69% (130/188) · 58% / 80% | 68% (129/189) · 57% / 79% |
| Rat King · without / with | 69% (131/190) · 57% / 83% | 71% (134/189) · 59% / 84% |
| regular fights: won · a down in · HP lost net (gross) | 98% · 27% · 17% (27%) | 98% · 28% · 17% (28%) |
| round-cap timeouts | 0 | 0 |

All inside the batch spread (±4 points a boss). What changes: spells now break crates and set off barrels (D1), whole
stalemates end (audit-3, FF-3: seeds 43220 and 80183 no longer reach the round cap), Hell Hounds collect no Burning (FF-6:
`a3_hellhound_walkies` seed 60027 logs 0 "is Burning" lines, 20 before), poison-immune units take no Poisoned stacks. No
campaign batch was run (the user asked to keep the PC load light); nothing here touches the late bosses' numbers.

### Tests

New suites (all pass): `engine: finish — D1 / D2 / D3 / D4 / D7 / audit-1 / audit-3 / audit-7 / FF-6`, `autoplay: finish —
D5 / audit-3 / audit-7 / FF-3`, `content: finish — D1 / D2` (real Heckle, Collect, Hemoglobin, Juice Box, Get Over Here,
Anvil Drop, Sand in Your Eye; the real Slate), `mapgen: finish — bosses-objectives-9`, `run: finish — desc-sweep-9`.
Updated: `engine: damage pipeline` (brutal from DD.Balance) and `engine: playtest fixes — text-tone-2` (a "Name, get up!"
line now fires exactly when Name is the one down).

Full `bash tools/test.sh` (Nov 14, one headless Chrome, 2:40): 1036 suites, 123,579 assertions ok, 9 failures in 5 sections,
none in this role's files and no "Error in" warnings: `hero_marwyn` (a Basanos bark), `hero_betty` (bark keys: the new
optional `swap` key), `enemies_act2` x2 (enemy passives / the gargoyle text) and `narrative: narration` (the new `swap`
key and two D1 tips over 140 characters) — the content owners' in-progress D1 / D7 work in their own files and tests.

## Review (finish) — adversarial review of the finish fixes (REVIEWER role, Nov 14)

Lens: D1-D5 and D7 end to end on REAL content, desc == execute for what the owners touched, determinism, and a fresh
normal batch against the audit. Probes in `.tmp/wf14/rev/` (one headless Chrome at a time).

### The lead's decisions, re-played

| decision | verdict | how it was checked |
|---|---|---|
| D1 | holds; one silent opt-out fixed | `d1.js`: all 562 player-side single-target skill-levels (16 heroes' pools at every level, generic skills, summon skills, consumables) used on a dummy foe; every one that damages its target aims at objects, except the nine listed opt-outs and **Head Over Heels III** (Betty: 5 damage, a utility with a 'custom' landing-tile area, so `singleTargetAt` said no without the skill saying so). It now says `target.objects: false` (a throw), kit.md lists nine. On a 40-HP crate (119 aimable skill-levels) each took exactly its `objectDamage`, which is the tooltip's 🔨 number and `validTargets`' `dmg`; nothing else moved. `d1b.js`: the same 114 aimable skill-levels each set off an explosive barrel, hit a Bone Pile for exactly `objectDamage`, and never listed the DM's panel, the coffee machine or a protect-objective keg as a target (342 checks, 0 bad). Generic props (terrain.js) now say the rule in its words (the keg excepted: as The Last Keg it can't be aimed at). |
| D2 | holds | the real Slate starts a swap with Kiri; Kiri gets "Slate is immovable: he can start a swap, you can't move him."; Human Shield and Step In list no Slate. A swap while he holds a foe frees it ("Test Grunt is free.": the tile it would be dragged into is the ally's) — consistent with Grappled's "free once they are apart"; the swap preview doesn't say so (HUD polish). |
| D3 | holds | the real Kiri: Fade Out, then Ghost Arrow at a crate → revealed; at an explosive barrel → revealed. |
| D4 | holds | `d4.js`: every hero with every item it can hold and every table Blessing (max level), procs forced (rng 0.01), hits a crate standing in a puddle with a foe and an ally in the same water: 2,682 hits, the crate took `objectDamage` each time, no other unit, status, surface or gold changed, no Hype moved, no swallowed error. The only side effect is the Chaos Crystal's wild surge, which fires on any skill use (a use hook, which D4 keeps). |
| D5 | was half built; finished | the Bone Pile's hint still said 0 to flyers (the content request was open). It now answers 9 for `how === 'break'` (any hero) and for a step only to walkers. Suite `enemies_act2: finish review — D5 …` (real pile; rooted walker and flyer each shoot it to bits on their own AutoPlay turn). |
| D7 | holds; its test was blind | narration and barks fire with {hero} / {ally}; but `kit: finish D7`'s "no hero named" checks used `new RegExp('\b' + w + '\b')` (a backspace, never a word boundary), so they could not fail. Fixed (`'\\b'`); the lines pass. |

### Owners' findings, re-played

- fix:engine — audit-1, audit-3 (43220), FF-3 (80183), FF-6, bosses-objectives-9, desc-sweep-9: see the seed checks
  below; the suites fail with their fixes reverted (the owner's mutation run; spot-checked here). audit-7 needed Slate's
  hook: `sla_grappled.heldThrough` landed (hero-slate.md), suite `hero_slate: finish review — Grappled tells …`.
  text-tone-2 "not reproduced" holds (Marwyn's line is `{downed}`; `Act.aboutLines` gates "Name, get up!").
- fix:content — FF-1 (fees stop at 12 via `addFees`, the only writer; the status says "up to 12"), FF-2 (Ultra Instinct
  `estimateTaken`), FF-4 (Iris closing 10; her texts read `N.closing`), FF-5 (the DM's mercy is a whole-fight rule chip;
  his two roll descs say it; only his rolls on heroes), audit-8 (Slate move 4): code read, suites pass. Skipped
  review-open-16 (a per-turn telegraph value needs a contract change; polish) and FF-2's optional part: both hold.
- desc-sweep-9's event half (a content request) done in run.js (`goldHint`): event hints print the gold the party gets
  while a gold Blessing is held. Suite `run: finish — desc-sweep-9 …` extended.

### Requests and leftovers

- UI (combat_hud.js `tileInspect`): an object instance's own text should win over its def's — Rocky (the Pet Rock
  Blessing, a `rock` with `blocksMove: false`) shows the rock's "Blocks movement and line of sight." under his name. Polish.
- UI (polish): the swap preview could say a held foe goes free when Slate swaps away from it.
- DOCS: DESIGN §4.2's opt-out list gains Betty's Head Over Heels (a throw; `docs: …` logs it as unlisted, no failure). Still open from fix:content: DESIGN §6 Slate "move 4" and Short Fuse "hits him, heals him or gives him a buff status (Block doesn't count)" (line ~489 still says "buffs him"); the DM's mercy rule in his section.
- ratking.js (optional request, left alone on purpose): the Rat King's `rangedTarget` +30 for a fight-ending knockout — no loop needs it,
  and it would move act 1 numbers in a run that must not.

### Determinism, seeds and the batch

- Same seed, same fight: the same 8 whole runs twice (`tools/sim.sh "seeds=8&from=53600&verbose=1"`, 83 fights): the
  two reports are identical. All of this run's cosmetic randomness (swap narration and barks, break quips) uses DD.rng.
- Seeds 43220 (audit-3) and 80183 (FF-3) on the current files: no round cap (80183's two Webs of Lies: 12 and 8 rounds).
- Normal campaign, 200 runs on fresh seeds 53000+: 33.0% (the audit's 32.8%); the full comparison, the act 1 boss check
  and the one stall (a long DM grind, not a loop) are in docs/notes/balance.md "Finish (Nov 14)" → "Review (finish)".

### Tests

New: `enemies_act2: finish review — D5 …`, `hero_slate: finish review — Grappled tells predictions …`; extended: `kit:
finish D1` (Head Over Heels opts out by name; terrain.js props state the rule), `kit: finish D7` (the name checks now
work), `run: finish — desc-sweep-9` (event hints). Each fails with its fix reverted (mutation runs: act2 hint 2
failures, Grappled 1, Head Over Heels + props 3, `goldHint` 2), then the files were restored.

### The UI reviewer's two RULES requests (docs/notes/hud-v2.md "Review (finish)"), done

- `swapProblem` (combat.js, D2): an immovable ally that never moves (Zarathor's statue, move 0) is refused with
  "<name> is immovable: you can't move it." — no "it can start a swap" it could never keep; Slate, Ellaria's giant corgi
  and any other walking immovable unit keep the lead's sentence ("Slate is immovable: he can start a swap, you can't move
  him."), as the HUD's 🗿 pill already did.
- statuses.js Stealth: "Breaks when it deals damage or attacks an object." (D3; the behaviour already matched).
- Suite `engine: finish review — a statue that never moves …` (the real statue next to a mage; the Stealth tooltip).

### Full run (review)

`bash tools/test.sh` (Nov 14, 18:38-18:43, one headless Chrome; the PC was in use, hence 4:52): **PASS — 1051 suites,
123,865 assertions ok, 0 failures, 0 failing sections**; no swallowed "Error in" warnings (the `warnings:` lines are the
suites' deliberate ones). The statue / Stealth suite was not mutation-run (its checks are exact strings that the old code
cannot produce); every other new or extended suite was.

### Not verified

- Casual and brutal with this run's changes (light PC load); acts 2-3 on paired seeds.
- The HUD side of the review's changes (the statue's refusal and the Stealth tooltip are shown as the engine words them;
  the UI reviewer covers the HUD).
- A human playtest of Slate's tempo (move 4) and of AutoPlay-free Bone Pile play.

## V3 — act 4 "Under the Table": DD.Cameo and the engine needs (RULES)

READY: DD.Cameo core + E1 + E2
READY: E13 modifyUse

Plan `.tmp/v3/design.md` §4.1, §4.5, §3.6 (E1, E2, E10-E13), §0.3 V3 / V4 / V11; contract ARCHITECTURE §3.13, §5.3,
§5.4, §5.5, §5.11 (as amended by wave 0 and its review, `docs/notes/v3-contract.md` P10-P15). Files: `js/engine/cameo.js`
(new), `js/engine/{combat,actions}.js`, `tests/{engine_tests,fixtures}.js`, and two spots of `tests/content_tests.js`
(RULES-owned since v2: the `modifyUse` hook name and the squad boss-on-board check, see Deviations).

### For content authors (C1-C6, NARRATIVE, HUD, META-RUN, META-UI)
- **E1 `actsWithOwner`**: `DD.Act.spawn(id, x, y, { owner })` (a unit or a unit id) sets `ownerId` before the unit rolls
  initiative. If the def (or `opts.actsWithOwner: true` for that one unit) says `actsWithOwner`, it gets **no entry of its
  own while its owner lives** and acts on the owner's turn, right after it (`Combat.groupOf(owner)` = owner first, then
  its riders in board order); `beginTurn` / `finishTurn` tick it with the owner. When the owner dies it rolls its own
  entry at the next round start (the split). Spawning with `{ owner }` works before initiative (`onStart`, a cheat's
  `apply`: the first roll checks the owner directly) and mid-fight (no joiner entry). An enemy spawned with an owner but
  WITHOUT the flag rolls its own entry (`turnOwnerOf` now follows `ownerId` only for summons and `actsWithOwner` units).
  `DD.Combat.actsWithOwner(u)` answers.
- **E2 `unit.turnsPerRound`**: set it on the instance (a phase that gains or loses a turn); `Combat.entriesPerRound(u)` =
  the unit's own (1-4) else its def's; heroes 1. At the next round start the unit gets exactly that many entries (a
  missing one is rolled like a joiner with the combat RNG and `modifyInitiative`, logged "X now takes N turns a round
  (rolls …)." and announced with `initiative:joined`; extras are dropped from the highest `k`). Never mid-round.
- **Events** (`DD.Events`, muted in previews / dry runs): `combat:ready { state }` — once, in `Combat.start` after
  `encounter.onStart`, before deployment and the roll (phase `'setup'`, round 0); `skill:used { unit, skill, ctx }` —
  after `onSkillUsed`, real uses only (never a preview, a dry run or an attack of opportunity; consumables count).
  `unit:downed` now also carries `killerId` and `cause`.
- **`DD.Act.log(text, cls, extra)`**: `extra` fields are merged into the entry and ride on `combat:log` (round / text / cls
  stay the engine's). Cameo lines: `cls 'cameo'`, `{ speaker, actor, style, key }` (+ `cheat: id` on a cheat line,
  `bribe: true` on a bribe line).
- **`DD.Act.addRule({ silent: true })`** logs no "New rule: …"; `cheat`, `source`, `next` and any other field are kept
  (the HUD reads them). `removeRule` still logs "Rule ended: …".
- **E10 squads**: `objective: { type: 'boss', bossIds: [defIds] }`: victory when every unit of those defs is dead (one
  spawned mid-fight counts; `bossId` and boss-tier units still count too); the rest flee. `objectiveText`: "Defeat the
  League of Villainy (3 left)" (`encounter.shortName`, else `name`; a leading "The" lower-cased).
  `DD.Combat.bossUnits(state?)` is public. Until MAPGEN's `buildObjective` copies `bossIds`, a squad without a boss-tier
  unit falls back to killAll in `Encounter.build` (MAPGEN's contract item, §5.8).
- **E11** `encounter.banner === false`: the boss intros are still logged, the per-boss banners are skipped.
- **E12** `state.stats.swaps`: +1 per hero swap move, −1 when that swap is undone. `stats.cameos` / `stats.cheats` start at
  0 in every fight.
- **E13 `modifyUse(q)`** (any hook source, rules included): `q = { unit, skill (def), slot (or null), level, why: null }`;
  set `q.why` to the reason. Fired in `Combat.canUse` right after the turn checks (before sleep / stun / cooldown / AP,
  so "Bleeped by Svammiel (Radio Edit)." wins over "On cooldown (2)."), wrapped in `DD.Targeting.pure` (dice a hook rolls
  are put back; never change state there). `useSkill`, the HUD's ⛔ line and AutoPlay's `usableSlots` all go through
  `canUse`. `DD.Combat.vetoOf(unit, slotOrDef)` returns just the veto (or null). AutoPlay's `usableSlots` keeps slots
  whose refusal mentions "target" (it reads that as "no target from here"): never put the word "target" in a reason.
  Enemy AI does not ask `canUse` (the veto is for the party's skills, which is what R11 and the Radio Edit need).
- **`state.noCameo`**: a sandbox's `cameo: false` (`Combat.sandbox` forwards it) or a truthy `DD.Balance.cameo.off`
  (P14). `state.data.gauntlet`: a copy of `setup.gauntlet` (`Combat.sandbox({ gauntlet })` too). `difficultyOf` passes
  `gauntlet: setup.gauntlet` to `DD.Balance.scale` (P11).

### DD.Cameo (js/engine/cameo.js) as built
- **API**: `fire(event, payload) → n` (an engine event name or a trigger name), `play(actorId, keyOrText, opts) → text`
  (opts `{ style, vars, cheat, force, speaker, banner, bubble }`; a lower-case key with a pool is a key, anything else is
  literal text), `say(actorId, key, vars, opts) → text` (a bubble, budgeted unless `opts.force`), `cheat(actorId,
  cheatId, opts) → rule | null`, `campaignGoesOn(state)`, `present(state, actorId) → unit | null`, `history(state)`,
  `budget(state) → { used, left, lastRound }`, `keyOf(actorId, name)` (an actor's own pool key, below), `setting()`
  (`'full' | 'short' | 'log'`), `STYLES`, `TOKENS`, `EVENTS`, `stub: false`. Subscribed in `DD.afterLoad` to
  `combat:ready → start`, `round:start → round`, `unit:downed → heroDowned`, `unit:died → kill`, `skill:used →
  signature`, `windup:cancel → windupCancel`, `combat:end → victory`.
- **Guards**: nothing while `DD.Act.simulating`, with `state.noCameo`, or with `encounter.cameo === false`; lines after
  the fight's end only from `victory` triggers. A direct `DD.Cameo.cheat` call (Svammiel's own fight mechanics) is NOT
  stopped by `noCameo` (a mechanic, not flavour); in a preview / dry run it applies its effect and rule only (no log,
  no memory, no stats).
- **Trigger filters** (in this order): `encounter.cameo.actor` (an addition: only that actor serves the fight), `start`
  vs `cameo.start === false` / interjections vs `cameo.interjections === false`, `once` (per fight, set only when it
  played), `act` (the run's act, else the encounter's; a number or a list), `kind` (`encounter.kind`, else the fight's),
  `encounter` (id or list), `from` (round ≥), `squad` (the dead unit's def in `objective.bossIds`), `when(state,
  payload)`; then `keyOf(state, payload)` (a falsy key skips; `shadow` needs no key). Event level: `heroDowned` once per
  hero per fight; `signature` only `skill.hype >= 100`; `windupCancel` not `reason === 'death'`; `victory` only a won
  fight; `start` once per fight. A throwing `when` / `keyOf` counts as false (reported by `DD.safe`).
- **Trigger extras** (additions, all optional): `banner: { title, sub }` and `bubble: 'text'` (the FX event's banner /
  bubble while the log keeps the full line: the twist's "YOU THOUGHT THIS WAS OVER?" + "I, SVAMMIEL, CONTROL ALL."),
  `cheat` (a start trigger's default cheat), `then(state, payload, played)` (after a played cameo, never in previews:
  C5's twist extras — the DM's "Oh no. That's my DM." line, a hero reaction, `DD.Meta.markSeen('bosses', 'svammiel')`),
  `id` (the `once` key; default `<actor>:<index>`).
- **Start cameo** (any `start` trigger; style `swoop` unless the trigger names another blocking style): announcer = the
  encounter's `cameo.start` key (else the trigger's `key`); roast = `def.situation(state, run, usedSituations)` →
  `{ key, vars, heroId | unitId | unit }` (skipped once that key was used this run) → else a hero in the fight not
  roasted this run (`roastPrefix + defId`, picked with `DD.rng`) → else `<prefix>generic`; that hero's comeback
  (`comebackPrefix + defId`) is a bark on the hero with chance `DD.Balance.cameo.comeback`; then the cheat
  (`cameo.cheat`, else the trigger's `cheat`) unless `run.flags.cameo.bribe` (spent; a `<prefix>bribe` line instead; a
  fight without a cheat leaves the bribe alone). The cheat applies even when no line pool exists yet. One FX event
  `{ type: 'cameo', actor, name, title, icon, color, enemy, style, banner: { title: encounter.name, sub: 'Svammiel:
  "<announcer>"', fit: true, frames }, text: <roast>, speaker, cheat: { id, name, icon, desc, quip } | null, bribe, ms,
  parallel }` (`frames`: the encounter's `cameo.frames`, an array or `fn(state)`: the League's stretching name). Logged:
  the announcer, the roast, the cheat line, the DM's counter (narrator). Present (his unit on the board): every line is
  a bark on it, no cameo FX.
- **Actor pool keys**: `def.linePrefix` (default: the `roastPrefix` up to its first `_`, so `svam_`): `svam_generic`,
  `svam_bribe`, `svam_reason` (the cheat's Reason; fallback "none"), `svam_quip_<cheatId>` (the card's quip / his bark; else the cheat's own `quips` list),
  `svam_counter_<cheatId>` (a narrator line). `DD.Cameo.keyOf('svammiel', 'reason')` → `'svam_reason'`.
- **Lines**: the act variant pool (`DD.narrationKey`), minus lines naming a hero missing from the fight
  (`DD.Act.partyLines`), minus lines with a token the trigger doesn't fill, minus indices used this run
  (`run.flags.cameo.lines[key]`, reset per key when its eligible lines are used up); `DD.rng` picks. No run (a sandbox):
  the same memory lives in `state.data.cameo.mem`. Tokens: `{n}` the round, `{enemy}` the opponent (`shortName` /
  `name`) or the foe the event is about, `{hero}` the hero it is about (start: the roasted hero, else the first hero),
  `{name}` only from a situation's `vars`.
- **Budget** (`DD.Balance.cameo`): bubbles and quips only, unless forced: ≤ `perFight` a fight, ≤ `perRound` in one
  round, else ≥ `minGap` rounds after the last; first come (within one event: the first trigger listed) first served.
  Start, entrance, shadow and forced lines never count and are never refused.
- **Cheats**: `when(state)` → `apply(state, ctx)` (`ctx = { state, actor, cheat, id, name, desc, opts }`; may return the
  filled desc string or set `ctx.desc`; `false` = no cheat at all) → `DD.Act.addRule({ id: 'cameo:<id>', name: icon + ' ' +
  name, icon, desc, turns: rounds (default −1), hooks, cheat: true, source, silent: true, next, cheatId, onAdd?,
  onRemove?, telegraphFlat? })` → log "😈 Svammiel cheats: <name>. <desc> Reason: <reason>." (cls cameo, `cheat: id`) →
  the counter → `stats.cheats++`, `run.flags.cameo.cheats` → presentation: folded into the start cameo's card, else its
  own banner "SVAMMIEL'S RULE: <name>" (sub = desc, `#ff4a3a`) plus his quip (a bark when present, else a bubble FX
  carrying the card). **Honesty for a rule**: mirror a damage hook with `estimateDealt` in the rule's hooks (rules are
  the attacker's sources; `DD.AI.estimate` asks `estimateTaken` of the target's OWN sources only, so a rule's
  `estimateTaken` is never read), `threatAt`, or the cheat's `telegraphFlat` field (the fixtures' Rigged Tests).
- **Presentation numbers** (`STYLES`): entrance 4500 / short 2000, swoop 2500 (3300 with a cheat card) / short 1200,
  bubble 0 ms parallel (life 2600), quip no FX, shadow 900 / short 500 (no line). Settings `cameos: 'log'` → no FX.
  Instant mode (tests, sims) applies the event at once.
- **Fixtures** (`tests/fixtures.js`): doors `test_a4_lane_a..d` (lanes `test_a..test_d`, orders 91-94): a no-cheat door;
  Rigged Tests (+1 damage to heroes, `estimateDealt`); a squad door (`bossIds`) with the Mystery Box crate (an `apply`
  that rolls `state.rng`, fills the desc, `onRemove`); a `banner: false`, `interjections: false` door with the Muted Test,
  a whole-fight `modifyUse` ban built like the Radio Edit. `test_a4_finale` (the Heckler on the board: present
  routing), `test_a4_event` (`acts: [4]`, no fight), the cameo actor `test_heckler` (start / round / heroDowned / victory
  triggers on `test_` encounters only), `test_heckler_imp` and `test_creeper` (an `actsWithOwner` minion). Each door names
  `cameo.actor: 'test_heckler'`, so Svammiel never serves them.

### Deviations (from the plan, with reasons)
- **`encounter.cameo.actor`** (new optional field): the fixtures' doors must not get Svammiel's start cameo and cheats once
  C5 lands (and his act-4 triggers must not fire in the Heckler's test fights); a door names the actor that serves it.
  Real doors need not set it (Svammiel is the only real actor).
- **Trigger extras** `banner`, `bubble`, `cheat`, `then`, `id`, the def's `linePrefix` and the situation's third
  argument (`used`): the twist script needs a banner and a bubble other than the logged line and a place for its extras
  (markSeen, the DM's line, a hero reaction) that runs only when the cameo really played; the generic / bribe / reason /
  quip / counter keys needed a prefix rule.
- **`turnOwnerOf` follows `ownerId` only for summons and `actsWithOwner` units** (it followed any `ownerId`): otherwise
  an enemy spawned with an owner but without the flag would act on its owner's turn AND roll its own entry. No shipped
  content sets `ownerId` on an enemy.
- **`DD.Cameo.cheat` ignores `noCameo`** when content calls it directly (Svammiel's round / snap / phase cheats are his
  fight's mechanics; the `cameo=0` sims measure the start cheats). The start cameo's cheat respects it.
- **The test cameo's damage cheat declares `estimateDealt`**, not `estimateTaken` as plan §4.5 says: a fight rule's
  `estimateTaken` is never asked by `DD.AI.estimate`.
- **`unit:downed` gained `killerId` / `cause`** (for `{enemy}` in `svam_down`); ARCHITECTURE §5.11's payload list says so.
- **`tests/content_tests.js`** (RULES-owned since v2, ARCHITECTURE §1; §3.13 gives RULES the hook row): `'modifyUse'` added
  to the hook list; the auto-battle's "the boss is on the board" accepts a squad in `objective.bossIds` (the League, the
  Coven and the goats have no boss-tier unit: it would have failed every squad door).
- **E11 keeps the boss intro log line** (only the banner FX is skipped): the log should still say who walked in.

### Requests
- **Everyone who reads the act-4 registry** (FYI, nothing failing today): the fixtures register act-4 content (plan
  §4.5: four `test_a4_lane_*` doors, `test_a4_finale`, `test_a4_event`, `test_heckler_imp`, `test_creeper`). With the
  five real lanes loaded only one test door fits under the cap of 6. `run_tests` swaps the registries out in its sandbox,
  so its registry checks don't see them (verified in the full run).
- **Lead (ARCHITECTURE §3.8 / §3.13, not RULES sections)**: mirror the optional `encounter.cameo.actor` and the trigger
  extras (`banner`, `bubble`, `cheat`, `then`, `id`; `linePrefix`; `situation`'s third argument; a cheat's `quips`) from
  §5.11's "As built" paragraph if you want them in the data sections too.
- **MAPGEN (`encounter.js buildObjective`)**: keep `objective.type 'boss'` when `bossIds` names enemies of the line-up (no
  boss-tier unit needed); today it warns and falls back to killAll (contract §5.8). The fixtures' squad door also has a
  boss, so it builds either way.
- **HUD**: cameo log entries carry `speaker`, `actor`, `style`, `key` (and `cheat` / `bribe`); a refused skill's reason
  is `Combat.canUse`'s string (`Combat.vetoOf` gives the veto alone, for the "BLEEP" sticker).
- **C5 (Svammiel)**: the trigger extras for the twist (`banner: { title: 'YOU THOUGHT THIS WAS OVER?' }`, `bubble: 'I,
  SVAMMIEL, CONTROL ALL.'`, `then` for the DM's line, a hero reaction and `markSeen`); the Radio Edit and R11 can use E13
  (`hooks.modifyUse`; the fixtures' `test_cheat_mute` is a working template); damage cheats mirror themselves with
  `estimateDealt` in the rule's hooks.
- **AUTOPLAY (`autoplay.js comboSkills`)**: a summon's combo planner reads its owner's self-area skills without
  `canUse`, so a vetoed self-area skill could be planned for a combo and then refused at use (harmless: the use fails and
  the turn goes on; a `DD.Combat.vetoOf(own, sl)` check there closes it).

### Also done
- Optional ask (Benedick's slime trail): `Combat.undo` emits **`move:undone { unit, unitId, kind: 'move' | 'swap', from,
  to, path | allyId }`** (ARCHITECTURE §5.5 events).
- `Combat.giveTurnTo` (sandbox) refuses a unit that is not in the current fight (a stale unit from an earlier fight used
  to crash `beginTurn`; seen while C5's suite was mid-edit).

### Tests
- 16 new suites "engine: V3 …" (E1 ×2, E2, the events / log / silent rules, E10-E12 + `move:undone`, E13 incl. AutoPlay
  and the fixtures' Muted Test, and DD.Cameo: the start cameo, a start cheat before the roll + `apply` / `onRemove` + a
  direct cheat with its own banner and `quips`, previews / dry runs, the budget and priority, routing (absent / present /
  Log only / Short / instant / `cameo: false` / `cameo.off`), determinism, lines, the Bribe, triggers and their payload,
  `campaignGoesOn` + an entrance on a victory + a fixture door end to end under AutoPlay).
- Iterated with `tools/test.sh "suite=engine: V3&isolate=zz_none"` (and with `isolate=svammiel` for C5's suites).
- Full `bash tools/test.sh` (Nov 14, with C5's `svammiel.js` landed): **PASS — 1092 suites, 125,388 assertions, 0
  failures**, 0 swallowed "Error in" lines (missing scripts 12: the V3 files not created yet).

## Review (V3) — adversarial review of RULES' V3 work (REVIEWER, core cluster, Nov 15)
Scope: `js/engine/cameo.js`, the V3 parts of `combat.js` / `actions.js`, `tests/{engine_tests,fixtures}.js`; plan §4.1,
§4.5, §3.6 E1 / E2 / E10-E13, the LEAD PATCHES P10-P14. Scratch harness (not project files): `.tmp/rvcore/` (a test page
with the real content and no fixtures, a probe that plays the twist and the whole gauntlet through `DD.Run` with the
real engine and AutoPlay, and a sim page without Benedick).

### Verified by running
- **The real thing, end to end** (acts 4, 20 runs, `startAtAct(3, level 6)` → the DM → the gauntlet → Svammiel): the
  DM's victory plays the entrance on his board (Svammiel's line logged as a `cameo` entry, the gate opens), every door
  opens with its start cameo (announcer, roast, then its exact cheat: Green Thumb, Nepotism, That's a 1 Now, The Floor Is
  Lava, the Radio Edit), a Bribe skips the next door's cheat, the interjection budget never passed 3, the finale's
  lines are barks on his unit (present routing), and 0 errors / 0 swallowed "Error in" lines over 100+ real fights.
- **Determinism**: a whole act-4 run replayed with the cosmetic RNG shifted gives the same fights (results, rounds, hero
  HP, cheat descs); seeds 11-14 replayed after my cameo.js edits and other owners' pool edits: identical.
- **Ship dark**: `tools/sim.sh` 50 seeds from 1000 with `acts` 3 on a page without Benedick reproduces the wave-0
  re-baseline report line for line (12/50, the same 465 fights): the V3 engine and every act-4 file leave v2 unchanged.
- E1 (the Coven's hags and the vines ride their owner's turn; a stunned owner doesn't take the riders' turns away:
  `aiTurn` runs member by member), E2, E10-E13, `combat:ready` / `skill:used`, `Act.log` extra, `addRule` silent, P11
  (`difficultyOf` passes the gauntlet), P14 (`cameo.off`): suites and code read; the knob-flipped harness
  (`.tmp/metarun/test4.sh`) passes `engine: V3` too.
- Shots (Read): the goats' start cameo (banner, roast bubble, the Radio Edit chip and log line) and the finale's opening.

### Fixed (most severe first; regression suites in `engine_tests.js` / `run_tests.js`)
1. **Ship-dark leak of cameo memory**: `DD.Cameo.fire` created `state.data.cameo` as soon as a trigger matched on act /
   kind / encounter, before its `when` ran, so the act-3 DM's fight under a 3-act knob got an empty cameo memory (the
   twist and the shadow match, `campaignGoesOn` says no) — the notes above claimed it never does. Now the event-level
   checks read the memory without creating it, `once` + `when` pick the live triggers first (pure), and the memory starts
   with the first live one. Suites: `engine: V3 cameo review — triggers whose when refuses…`, and the real-content
   `run: V3 review — the real twist from a v2-shaped act-3 save…`.
2. **NARRATIVE's ask: a hero stood back up is no down** — `unit:downed` is emitted after the `onDowned` /
   `onAllyDowned` hooks, so a hook that revives the hero at once still drew a `svam_down` heckle ("X is napping on my
   floor") and used up that hero's one down. `heroDowned` now skips a hero that is no longer `downed`; the first real
   down still plays. Also `{enemy}` of a down is the foe only: friendly fire or a self-own keeps the opponent (as
   `actions.js` narrates `hero_downed_friendly`). Suite: `engine: V3 cameo review — heroDowned skips a hero a hook stood
   back up…`.

### Deviations (review)
- `heroDowned` "once per hero per fight" now means the hero's first real down (a refused-by-the-budget one still
  counts; a hook revive doesn't). A trigger's `when` runs before the event's bookkeeping (it must be pure anyway).

### Passed on (not this area's files)
- **C5 / lead — the finale has no opponent banner**: `boss_svammiel` has `banner: false` (E11 skips the boss banner
  because "the cameo shows it"), but Svammiel is present in his own fight, so the start cameo becomes barks and no
  banner shows the opponent at all (the first banner is his round cheat). Either drop `banner: false` on the finale (the
  v2 "Svammiel / The Floor Boss" banner) or the lead amends §3.0.1.
- **C5 — the door sulks are budgeted** (plan §4.1 counts a `quip` as an interjection): in the probe 2 of 5 doors per run
  played their `svam_sulk_<lane>`; NARRATIVE measured ~10 in 55. `force: true` on the `sulk` trigger works today (a
  victory quip with force is never refused); a C5 / lead call.
- **C5 — `situation()` starves the hero roasts** (NARRATIVE's measure: 0 hero roasts in 72 start cameos): cameo.js
  follows plan §4.1 (a situation first); the fix is in `situation()` (or the plan's order).
- **C5 — the finale's `shortName` is "The Last Floor"**, so a run lost to him reads "Killed by The Last Floor (he
  cheated)" (run.js uses `shortName || name` for `killedBy`, plan §2.4). `shortName: 'Svammiel'` would read better.
- **Lead (ARCHITECTURE §5.11)**: mirror the `heroDowned` refinement above if wanted.

### Tests (review)
- `bash tools/test.sh "suite=engine: V3&isolate=zz_none"`: 19 suites PASS (2 new). Knob flipped
  (`.tmp/metarun/test4.sh "suite=run:,engine: V3,mapgen: V3,core:"`): 74 suites PASS.
- Full `bash tools/test.sh` (Nov 15, after the fixes): **PASS — 1232 suites, 143,189 assertions, 0 failures**, 0
  swallowed "Error in" lines, missing scripts 0.

## QA fixes (V3, Nov 17) — QA FIXER, core cluster (`combat.js`)
- **FIGHTS-12 (polish), fixed**: `Combat.objectiveText` titled every non-squad boss fight "Defeat X (the minions will
  flee)", so Grand Magister Galbraith and the finale (no minions at the start) read it too (the open request in
  `boss-galbraith.md`). The suffix now shows only while someone is there to flee: any other active enemy unit (summons
  too: `finalize` sends every active enemy) or a reinforcement wave still pending (`wavesPending`). The bar is refreshed
  after every action, so it appears when the finale's imps or the Gardener's vines arrive and goes when the last minion
  drops. Squads (`bossIds`) keep "(N left)". Shots (`tools/shot.sh`, acts 4): "Defeat Grand Magister Galbraith",
  "Defeat Svammiel". Suite: `engine: a boss objective mentions fleeing minions only while there are some (qa
  FIGHTS-12)` (engine_tests.js).
- Not changed: `encounter.js`'s boss joke "The minions flee once the boss drops." (`objective.flavor` from
  `Encounter.build`): every solo act-4 boss replaces its flavor with its own line (Galbraith, Svammiel, the Gardener).
  The HUD tooltip's generic "the minions flee the moment it drops" is HUD's (`combat_hud.js objectiveTip`); I did not
  file a request for it.

## Conditional-healing lift (Nov 18) — heal:engine, phase 1 (plan `.tmp/heal/plan.md` §5 E1-E4)

The user (Nov 18): "I don't wan't Ellaria brought down. I want everyoe else brought up but by conditional healing". The
plan lifts the other 16 heroes, each by one conditional heal in his or her own file; this phase lands the four shared
hooks first, so the hero builders only touch their own files. No hero, no item and nothing of Ellaria's changed here.
No hero defines `autoplayEnd` or passes `via` yet, so AutoPlay and the sim behave exactly as before for today's content
(the new terms are 0; the sim's new section reads "none fired").

### For the hero builders: what you can call
- **The heal** (plan §3): `DD.Act.heal(<the hero unit>, <target>, n, { via: 'lift:<heroId>' })`. `src` is always the
  hero (sim credit, `healBonus`); `via` is only a label (the engine ignores it; `js/engine/actions.js` doc comment,
  ARCHITECTURE §5.4). Check `active(target)` and the hero's own `active` BEFORE the call; then always call when the
  condition holds (it returns 0 at full HP) and gate FX / barks on the return value: the sim counts every labelled call
  as a fire, 0-HP calls included. Never `opts.cause: 'status'`.
- **Labels the sim expects** (one per hero, never Ellaria): `lift:slate`, `lift:hjalmar`, `lift:pebbles` (the fire case
  too), `lift:basanos` (the whole Transform mend), `lift:marbles`, `lift:buga`, `lift:valdris`, `lift:sparrow` (the
  share only; her own drain stays unlabelled), `lift:betty`, `lift:benedick`, `lift:kiri`, `lift:marwyn` (the whole surge
  heal), `lift:corelos`, `lift:syllamin`, `lift:zarathor`, `lift:josiah`. The hero a label belongs to is the one it
  names (its fights started are the denominator).
- **Item-gated labels** (the sim's `WORN` table: "worn" fights = fights the hero started wearing the item; a fire counts
  as worn when the src wears it): `lift:zarathor` → `zar_loyalty_card`, `lift:syllamin` → `syl_tear_jar`,
  `lift:hjalmar` → `hja_canned_laughter`, `lift:benedick` → `ben_mucin_serum`, `lift:pebbles` → `peb_dog_bed`. Keep
  those item ids.
- **E2** `DD.AutoPlay.healWorth(unit, n)` → `min(n, maxHp − hp) × (1.5 if missing > maxHp / 2 else 0.8)`; 0 at full HP,
  for `n ≤ 0` / not a number, and for a downed or dead unit. The shared price for `aiScore` / `autoplayValue` /
  `autoplayEnd` terms (a local copy, like Slate's, is fine).
- **E1** an optional `passive.autoplayEnd(unit, x, y) → number` on the HERO def's passive (only the acting unit's own
  hero passive is asked; summons and Blessings are not): what ending that unit's turn on (x, y) is worth, in AutoPlay
  units (price a heal with `healWorth`). PURE; read the current state (`DD.Combat.state`, `DD.Grid`, `DD.Act.hasStatus`)
  and use x, y, not `unit.x` / `unit.y`. Inside a dry run the state is the copy and `unit` is the copy (post-action HP and
  statuses: the Burn Nibble just applied counts); elsewhere the real state with the unit virtually on (x, y). Called
  through `DD.safe` (a throw is a DD.warn and worth 0; non-finite → 0). `DD.AutoPlay.restAt(unit, x, y)` reads it for
  tests. Pebbles is the one planned user.

### What landed
- **E1** (`js/engine/autoplay.js`): `restAt(ctx, pos, unit = ctx.unit)` (the passive looked up once per decision,
  `ctx.restDef`); `makeCtx` sets `ctx.rest0 = restAt(ctx, here)`; `endValue(ctx, pos, apLeft, used, stay, rest)` adds
  `rest` (or `restAt(ctx, pos)` when no dry run passed one) to the STAY branch only and returns `v − tempo0 − rest0`
  (staying put ≈ 0; the hit-and-run escape ends elsewhere, no rest). Critic fixes: (a) `dryRun` and `dryHint` compute
  `out.rest = restAt(ctx, { x: su.x, y: su.y }, su)` inside `simulate` after the action, next to `out.stay`, and every
  `endValue` that passes `r.stay` passes `r.rest` (`exactTotal` ×2, `bestHint`); (b) `bestMove` adds `restAt(ctx, pos)`
  to its stay branch and subtracts `ctx.rest0` from its total; (c) `bestSwap`'s `fixed` adds `restAt(ctx, pos) −
  ctx.rest0`. Also `utilQuick` (Deviation 1). Header comment and ARCHITECTURE §5.7 (+ a pointer on §3.1's passive line).
- **E2** (`autoplay.js`): `healWorth` and `AP.healWorth`; `AP.restAt(unit, x, y)` (inspection).
- **E3**: `js/engine/actions.js` — `Act.heal`'s doc comment names `opts.via` (no behaviour change). `tests/sim/sim.js` —
  the ledger's `DD.Act.heal` wrapper reads `arguments[3].via` (a non-empty string) and passes it to `ledgerHeal(src,
  target, got, want, revived, ch, via, kind)`, which counts the label BEFORE the hero-side check (`liftHeal`: calls, HP,
  to self / others / summons / foes, overheal, the same per fight kind, worn calls / HP). `fight()` now counts each
  starting hero through `started(heroes0, kind)`: `fights` as before, plus `fk.<kind>` and `worn.<item>` (the WORN
  items). New report section **"== conditional heals"** right after "== healing per hero": per label, the hero's fights,
  fires and HP per fight (self / others / summons), overheal (share of asked), "by kind" (regular / elite / mini / boss,
  per fight of that kind the hero started) and for WORN labels the worn fights (share), fires and HP per worn fight and
  per fight not worn. `raw=1` adds `R heal.<label>.*` (calls, hp, self, others, summons, foes, over; `.k.<kind>.*`;
  `.worn.calls/hp`) and the denominators `hero.<id>.fk.<kind>`, `hero.<id>.worn.<item>`. Header param docs updated;
  `DD_SIM.started`, `DD_SIM.WORN`, `DD_SIM.rawText()` exposed for the tools suite.
- **E4** (docs): DESIGN §6's "Sustain (D9 …)" bullet replaced by the plan's paragraph, word for word; ARCHITECTURE §5.7
  (E1, E2: "Conditional healing (Nov 18, plan E1-E2)") and §5.4 (`heal` opts: `via`).
- **Pooling helper** (scratch, for the balance pass): `.tmp/heal/lifts.awk` pools "== conditional heals" from the R
  lines of 100-seed pages (`awk -f .tmp/heal/lifts.awk <pages>`): per label fires / HP per fight with batch-means 95%
  half-widths, self / others / summons, overheal, by kind, and the worn table (worn share, fires and HP per worn fight).

### Deviations
1. **E1 also feeds `utilQuick`** (the quick estimate that picks which landing tiles of a utility mover — a dash or
   teleport with no dmg / heal numbers, e.g. Pebbles' Hot Zoomies — get one of the `UTIL_REFINE` exact dry runs): `+
   restAt(ctx, t) − ctx.rest0`. Without it a Zoomies landing next to a Burning foe could never be dry-run, so the exact
   pass (which does read it) would never see it. 0 for every unit without `autoplayEnd` (today: all).
2. **`healWorth` returns 0 for a downed or dead unit and for a non-number `n`** (the plan's formula is the quick pass's,
   which only prices active units; a downed hero's "missing HP" would otherwise price a heal these lifts can't give).
3. **`AP.restAt(unit, x, y)`**: an additive inspection helper (tests: the E1 suite, Pebbles' `autoplayEnd` values).
4. **The sim's "foes" column**: a labelled heal on a unit not on the hero side (none planned) is counted in the label's
   calls / HP and shown as "foes", never dropped. The label is counted before the ledger's hero-side check.
5. **"by kind" per fight of that kind**: each kind's fires / HP are divided by the fights of that kind the label's hero
   started (`fk`), so the boss column reads a per-boss-fight number (T8's guard rails).

### Requests
- None blocking. Phase 2 (same builder, after the four groups): apply the 16 "DESIGN §6 brief (Nov 18)" texts from
  `docs/notes/hero-<id>.md`, regenerate the v2-digest §2 kit lines (Ellaria's block unchanged), the Benedick message in
  `tests/balance_tests.js`, a full run, a phase-2 entry here.
- Balance pass: pool "== conditional heals" with `.tmp/heal/lifts.awk` (above); the existing `.tmp/heal/baseline/
  merge.awk` already ignores the new R keys (its hero regex matches `hero.<id>.fights` only).

### Tests
- `tests/autoplay_tests.js` (new last block): `autoplay: a passive's autoplayEnd pulls the turn's end tile (E1: plain
  moves, dry runs, a throwing hook)` — a temp fixture hero (`test_ap_rester`, removed after): a tile its passive values 6
  is where a plain move ends its turn (without the value it walks elsewhere); a 3-AP skill that tucks a foe in (a test
  status) is priced +4 in its exact total when `autoplayEnd` reads that status in the dry run's copy (`restAt` on the real
  state reads 0 before the action); a throwing `autoplayEnd` is worth 0, the turn plays as without it, the DD.warn lines
  are spliced out (expected there only). `autoplay: AutoPlay.healWorth prices a heal like the quick pass (E2)`: 0 / 2.4 /
  4 / 7.5 / capped at missing × 1.5 / 0 for n ≤ 0, NaN, downed, null.
- `tests/docs_tests.js`, `tools: the campaign sim sorts heals by source and runs by healer group` extended: the WORN
  table; two labelled heals for `lift:slate` (one at 0 HP still fires), two for `lift:zarathor` (worn / not, regular /
  boss, self / others); fights by kind and worn; the report's section order, its lines (per fight, by kind, worn); the
  `R heal.*` and `hero.<id>.fk|worn` raw lines.
- Scratch end-to-end probe (not a suite): `.tmp/heal/engine/probe.html` + `probe.js` give every hero a 2-HP labelled
  turn-end heal; `bash .tmp/heal/engine/probe.sh "debug=1&seeds=3&from=777&stop=1&raw=1&healers=ellaria,josiah,valdris"`
  printed the section for 10 heroes (per kind, worn line for Benedick's Serum), 0 errors, 0 DD.warn lines; the R lines
  pooled with `lifts.awk`.
- Isolated: `tools/test.sh "suite=autoplay&isolate=nothing_here"` 73 suites PASS; `suite=tools: the campaign sim` 3 PASS.
- Full `bash tools/test.sh` (Nov 18, all of the above landed): **PASS — 1301 suites, 149,837 assertions, 0 failures**,
  0 swallowed "Error in" lines, missing scripts 0. Stock sim smoke (`tools/sim.sh "debug=1&seeds=2&from=4242&stop=1&
  raw=1"`): "== conditional heals …: none fired", 0 errors, 0 DD.warn lines, the `hero.<id>.fk.*` R lines present.

### Not verified / known
- No suite drives a real swap or a real hinted interaction with an `autoplayEnd` (fixes (c) and the `dryHint` half of
  (a) are code-reviewed, and run in every AutoPlay decision with the term at 0).
- The `opts.via` wrapper path in a real fight is covered by the scratch probe only (the tools suite calls `ledgerHeal`
  directly; installing the sim's wrappers in the test page would wrap `DD.safe` page-wide).

## Conditional-healing lift (Nov 18) — heal:docs, phase 2 (plan `.tmp/heal/plan.md` §5 "Phase 2")

The same engine builder's second phase, after G1-G4 landed and were reviewed. Only shared docs and one test message
changed: no engine code, no hero file, nothing of Ellaria's.

### What landed
- **DESIGN §6** (`docs/DESIGN.md`): the 16 "DESIGN §6 brief (Nov 18)" texts from `docs/notes/hero-<id>.md`, each applied
  with one Edit on the note's anchor, the subsection re-read before each edit (18 edits: Hjalmar and Benedick have two
  anchors; Zarathor's Loyalty Card and Syllamin's Jar of Tears are new bullets after their anchors). Zarathor, Syllamin,
  Marbles, Marwyn, Josiah, Sparrow, Corelos, Slate, Buga, Kiri, Betty, Basanos, Valdris, Hjalmar, Pebbles, Benedick.
  Checked by script: every replacement is in DESIGN (whitespace folded) and every replaced anchor is gone. The pinned
  phrases hold: Basanos "heals him 2–4 HP", Sparrow "Box* (drain a foe within 3:", Valdris "*Forge Armor*" (never
  "Armour"), Slate "move 4" and Short Fuse's "gives him a buff status (Block doesn't count)". Ellaria's subsection is
  byte for byte the committed one (md5 of `### Ellaria` → `### Josiah`). The §6 intro (the E4 paragraph) was already in.
- **v2-digest §2** (`docs/notes/v2-digest.md`): the generator (`tools/test.sh "suite=docs: v2-digest&kits=1&verbose=1"`,
  run on the landed tree) diffed block by block against the digest; the 18 lines the lift changed were replaced by its
  output: the passives of Marwyn, Josiah, Buga, Betty, Hjalmar and Pebbles; Walking Stick Whack, Juice Box, Glyph of
  Warding, Hold Still, Ethereal Step, Transform and Forge Armor; the item lines of Zarathor (+ Loyalty Card), Syllamin
  (+ Jar of Tears) and Hjalmar (Canned Laughter "4 HP more (9 in all)"); and Slate's header (move 3 → 4, a Nov 14 drift
  the same diff showed). Hand notes after the generated text: Glyph "(II: 6 damage, heal 4 …)" and Hold Still "(II: 5
  damage, heal 4 …)" (the generator prints I and III only), Hold Still / Stress Ball "a squeeze replaces that turn's hold
  heal", Transform's live marker "; used this turn" (review:g3's request in hero-basanos.md). A re-diff leaves only the
  hand-merged / annotated lines (Statue of Me, Raven Dive, Murder of Crows, Glyph, Hold Still, Stress Ball, Transform).
  Ellaria's block: byte for byte unchanged. A dated "Nov 18" paragraph in the §2 header says all this.
- **`tests/balance_tests.js`**: the Benedick message "(his only heal, D9)" → "(the Serum's bonus over A Sticky
  Situation's 3)", values unchanged (`SERUM_HEAL` 3, "heals 3 HP" in the Serum desc); the block comment above `A4_ROWS`
  that said "Benedick's only heal" says the same.

### The reviewers' remaining items and the builders' requests
| item (from) | lands in | done |
|---|---|---|
| Basanos: the digest's Transform note "(used this turn)" → "; used this turn" (review:g3) | v2-digest | yes (above) |
| Basanos, Benedick, Corelos, Syllamin: "engine builder, phase 2" (their briefs, digest lines, Benedick's balance message; build:g3) | DESIGN, digest, balance_tests | yes (above); Benedick has no digest block (Deviation 1) |
| Benedick: enemy paths that don't detour around slime, or AutoPlay's danger model seeing snag stops (build:g3 optional, review:g3) | `js/engine/grid.js` / `autoplay.js` | **no**: routed to the lead (Requests) |
| T8 under its fires minimum: Slate ~0.75 (min 1.0), Sparrow ~0.19 (0.25), Valdris 0.56-0.64 (0.8), Kiri 0.11-0.16 (0.4; ceiling ~0.22), Benedick 0.29 (0.4) | balance pass / lead | nothing in my files (no bug found by any review) |
| At the edge: Pebbles 1.53 pooled (1.5), Basanos 2.01 with Ellaria in the party (2.0); worn shares Zarathor 6.5% (51/783), Syllamin 0/206 (a forced-wear scratch read 0.94 fires / 2.4 HP per worn fight) | balance pass report | nothing in my files |

### For the balance pass: where each tunable heal number is quoted
A heal raised inside its plan §7 range changes the hero's desc (built from the constants) and these doc lines, which
nothing checks automatically except the three pinned ones (Basanos' MEND "2–4", Juice Box's range, Forge Armor's name):
DESIGN §6 subsections — Buga "heals him 2 HP"; Basanos "+2 per adjacent foe, max +4" (also the §6 intro: "Basanos'
Transform, +2 per adjacent foe"); Slate "3–4 HP" (hug I/II/III = 3/4/4); Pebbles "heals him 3 HP" (one number for both
cases: raising the neighbour case splits the sentence, plan §4.3); Marbles "5–7 HP"; Hjalmar "heals 5 HP" and Canned
Laughter "(9 in all)"; Valdris "4–6 HP"; Sparrow "half of that, rounded up"; Betty "he heals 3 HP"; Benedick "heals him 3
HP" (passive) and "heals him 3 (his passive) … adds 3 more (6 in all)" (sustain bullet; the balance test's message reads
`MUCIN_HEAL`); Kiri "3–5 HP"; Marwyn "+2 for each foe he has Taunted, max +6" (also the §6 intro: "+2 per foe he
Taunted"); Corelos "3–4 HP"; Syllamin, Zarathor "heals 3 HP"; Josiah "heals 2 HP". The digest §2 line: rerun the
generator and copy the hero's line.

### Deviations
1. **Benedick has no v2-digest §2 block**, so none was regenerated: §2 is v2's "16 kits" and the generator's `ORDER`
   (`tests/docs_tests.js`) lists exactly those 16 (Ellaria in, Benedick out). Adding a 17th block would grow a v2 document
   and the generator past the plan's "no other shared file changes"; his texts live in DESIGN §6 (both briefs applied)
   and `docs/notes/hero-benedick.md`. The plan's "16 changed heroes" therefore reads as 15 blocks here.
2. **Two DESIGN lines re-wrapped** (Marwyn's surge, Benedick's sustain bullet): the briefs' words exactly, wrapped one
   word earlier (as written they ran 121 / 122 columns; the docs wrap at 120 and the tests fold whitespace).
3. **Slate's digest header** was regenerated with his Hold Still line (move 3 → 4): not a lift change, a drift the
   generator diff showed in the same block (DESIGN §6 and the game say move 4 since Nov 14).
4. **The Benedick message builds "A Sticky Situation's N" from `DD.Benedick.MUCIN_HEAL`** (reads 3 today, the plan's
   text) so a balance-pass raise inside [3, 5] keeps it true. The suite's name ("… Benedick's one heal") is unchanged:
   still one heal trigger, and `docs/notes/balance.md` quotes the name.

### Requests
- **Lead (decision, non-blocking): Benedick's T8 fires.** `lift:benedick` reads 0.29 fires a fight against 0.4 on two
  independent pages, and review:g3 found no number in benedick.js that raises the fires (MUCIN_HEAL moves HP only). The
  two engine options are not phase-2 work: (a) enemy paths that walk through slime instead of an equal-cost detour
  (`Grid`, "equal-cost paths also avoid SNAGS") changes every enemy's pathing around every snag and reverses the
  combat-controls-2 playtest fix: an enemy-AI rule change for the lead / the user; (b) AutoPlay's danger model seeing
  stops (`srcPositions` skipping tiles past a stop) prices hero positions only and would not make a foe walk into his
  slime, so it is unlikely to move the fires; plan §5 keeps the engine as phase 1 left it. The plain option is the lead
  revisiting Benedick's T8 fires row (as for Kiri's), with `MUCIN_HEAL` [3, 5] for the HP band.
- **Balance pass:** the T8 readings and edges in the table above; the doc lines to update with any heal raise (above).

### Tests
- `tools/test.sh "suite=docs: v2-digest&kits=1&verbose=1"` (the generator, before and after: the digest re-diff above);
  `tools/test.sh "suite=docs:,balance: V3 act 4"`: 8 suites PASS, 143 assertions (the DESIGN §6 pins, the digest
  costs / Juice Box / Transform / Forge Armor lines, the new Benedick message).
- **Full `bash tools/test.sh` (Nov 18, after phase 2): PASS — 1318 suites, 150,822 assertions, 0 failures**, missing
  scripts 0, 0 swallowed "Error in" lines; the `warnings:` lines are the known deliberate ones (Benedick's move-2 and
  Bark-B-Q content advisories, the junk-content tests). No hero file needed a fix. Output kept in
  `.tmp/heal/docs/full_test.txt` (scratch: the generator output, the per-hero diffs and the brief checks are beside it).

### Not verified / known
- Phase 1's two items stand (no suite drives a real swap or hinted interaction with an `autoplayEnd`; the `opts.via`
  wrapper in a real fight is covered by the scratch probe and, since the builds, by every hero's forced-party sim page).
- No sim was run in phase 2 (docs only); the balance pass measures next (plan §7).

## h19 QA fixes (Nov 20) — QA FIXER, core cluster (`targeting.js`, `combat.js`)
Findings from the `qa:biz` lens (`.tmp/h19/qa/biz/`), most severe first; both polish.
- **QA-BIZ-6, fixed (engine half)**: Overclock's aim showed only ♨️, never the AP it gives: the dry-run diff
  (`Targeting.diff`) tracked HP, Block, statuses and movement but not AP. Each per-unit entry now also carries
  `ap` (AP to spend now: a unit of the acting group, e.g. Overclock's robot) and `apNext` (AP banked for the unit's next
  turn: `Act.gainAp` outside its turn, or a drain), both signed, and the entry's `text` prints them in `Act.gainAp`'s
  words with the previews' minus sign: `"+2 AP · Overclocked"`, `"+1 AP next turn"`, `"−1 AP next turn"`. A unit that
  drops (or stays down) has no AP change. `diff(real, sim, uncertain, opts)` takes an optional `opts { actor, paid }`:
  `Targeting.preview` passes the user and `ctx.paid.ap`, so **the actor's own cost is left out** (the card's pips show
  it) and only AP the action gives or takes shows on the actor (Power Nap's spent rest, a refund). AutoPlay's three
  `diff` callers pass no opts (raw change, which none of them reads: an AP-only entry adds 0 to `simGain`,
  `bigMoment`, `blastValue` and `breakValue`). Uncertain previews: `aggregate` gives `ap` / `apNext` means with
  `apMin` / `apMax` (text `"? +1–2 AP"`); `signature` compares them. A def's own `preview()` may set `ap` / `apNext`
  on an entry (copied, rounded). Shipped AP gifts whose dry-run text now names the AP too: Mayor Buga's Campaign
  Promise, Syllamin's Hype Man and Encore!, Corelos's Dark Bargain, the Energy Drink, and Overclock (`"+2 AP"`, `"+3
  AP"` with the Universal Remote). AutoPlay unchanged: the Biz replay
  `seeds=3&from=68600&party=biz,josiah,kiri,marwyn` (the audit's `replay_fp_biz_68600.txt`) is byte-identical before
  and after (`.tmp/h19/qafix-core/replay_biz_68600_{before,after}.txt`). The HUD half (print the fields on the badge
  and in the hint) is `combat_hud.js`'s: see Requests.
- **QA-BIZ-8, fixed**: the signature log line appended "!" to names that already shout ("Biz unleashes
  Spoodmarino!!", "BEHOLD, MARWYN!!"). `Combat.useSkill` now adds the bang only when the name does not end in "!" or
  "?": "Biz unleashes Spoodmarino!", "Wizzy McTest unleashes Mass Assert!".

### Requests
- **render-ui (`js/ui/combat_hud.js`, owner HUD)**: show the new `ap` / `apNext` of a preview entry (QA-BIZ-6's
  expected "+2 AP" on the robot). `overlayPreviews` (~l. 750-768): after the Block part, e.g.
  `if (num(e.ap)) parts.push((e.ap > 0 ? '+' : '−') + Math.abs(e.ap) + ' AP'); if (num(e.apNext)) parts.push(... + ' AP next turn')`
  (or a compact "+2⚡" badge); `previewSummary` (~l. 795-855): a part for allies other than the actor, e.g.
  `"⚡ Spooder +2 AP"` / `"⚡ Slate +1 AP next turn"`, and for the actor's own non-zero `ap` (a refund, Power Nap's
  spent rest). Uncertain entries carry `apMin` / `apMax` like `healMin` / `healMax`. The engine fields are there now
  (the `text` already reads `"+2 AP · Overclocked"`).
- **lead (`docs/ARCHITECTURE.md` §5.2)**: `PreviewEntry` gains `ap` (AP now, the actor's own cost left out) and
  `apNext` (banked for the unit's next turn), signed; `Targeting.diff(real, sim, uncertain, opts?)` with
  `opts { actor, paid }`.

### Tests
- `engine: h19 QA-BIZ-6 — a preview names the AP an action gives …` (engine_tests.js, fixtures: Good Boy! on the turret
  = "+1 AP" and the real use agrees; on the knight = "+1 AP next turn" banked; a drain "−1 AP next turn"; a self-gift
  "+2 AP"; no actor entry for its own cost; a KO carries no AP; a random gift aggregates; `diff` with / without opts).
- `engine: h19 QA-BIZ-8 — a signature whose name already ends in "!" or "?" is logged with one bang` (engine_tests.js).
- `integration: h19 QA — Overclock's preview gives the robot "+2 AP" (3 with the Universal Remote) …` (integration.js:
  Biz's real Overclock on both robots, with and without the Remote, preview = reality; Spoodmarino!'s log line).
