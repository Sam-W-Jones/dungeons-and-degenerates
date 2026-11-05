# RULES notes

Files: `js/engine/{grid,targeting,hooks,actions,ai,combat,autoplay}.js`, `js/data/{statuses,terrain}.js`,
`tests/{fixtures,engine_tests,content_tests}.js` (suites `engine: …` and `content: …`).

> **v2 (initiative, per-unit turns, no telegraphs, no Guard) supersedes everything below about the round flow, enemy
> planning / telegraphs / intents, Guard, combat-start Block and status timing.** See the "v2" section at the end and
> `docs/notes/v2-migration.md` (the content conversion guide).
>
> **Content authors, read "Attacks of opportunity" and "Targeting" in the last section** (v2 AoO role): walking away
> from a melee fighter provokes a free basic attack, and enemies stick to the hero next to them.

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
