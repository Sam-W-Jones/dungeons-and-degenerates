# RULES notes

Files: `js/engine/{grid,targeting,hooks,actions,ai,combat,autoplay}.js`, `js/data/{statuses,terrain}.js`,
`tests/{fixtures,engine_tests,content_tests}.js` (suites `engine: …` and `content: …`).

> **v2 (initiative, per-unit turns, no telegraphs, no Guard) supersedes everything below about the round flow, enemy
> planning / telegraphs / intents, Guard, combat-start Block and status timing.** See the "v2" section at the end and
> `docs/notes/v2-migration.md` (the content conversion guide).

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
