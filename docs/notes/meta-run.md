# META-RUN notes

Files: `js/run/meta.js`, `js/run/run.js`, `js/run/runmap.js`, `js/run/rewards.js`, `js/data/scars.js`, `tests/run_tests.js`
(suite prefix `run:` — `bash tools/test.sh "suite=run:"`).

## Summary

- **DD.Meta** (§4.7/§9.1): defaults, sanitizing load/save (`DD.Storage` key `meta`), unlocks (hero def `unlock: null` =
  starter, `{ act: N }` = first clear of act N, DESIGN fallback map for unregistered ids, `settings.unlockAll` and
  `?debug=1&unlockall=1`), lifetime stats, codex `seen`, last 20 run summaries. Loaded in `afterLoad` (order -100).
- **DD.RunMap** (§9.3): 7 rows of 2-4 nodes + boss row. Row 0 combat, row 6 taverns, elites from row 2, ≤1 shop per row,
  at least one fight per row, at least one elite / event and `DD.Balance.map.minShops` shops per act (2 since sustain
  refit 3, Nov 13: ~98% of maps have room for both; the rest get one), no shop/elite/treasure/tavern directly after the
  same type. Links are a monotone staircase between consecutive rows: never cross, every node reachable and leads to the
  boss (validated over 900 maps per test run). Encounters/events are pre-assigned when registries have them; travel
  re-validates and assigns lazily otherwise. Maps are seeded per act from the run seed.
- **DD.Run** (§4.6/§9.2): whole lifecycle — RunHero creation, `heroStats`, gold/items/equipment/consumables,
  travel/dispatch, combat start (`DD.Encounter.build` → `DD.Combat.start(setup, { run, seed, onEnd, difficulty })` →
  `show('combat')`), `finishCombat` (HP write-back, downs → 1 HP + scar, third down → death, XP with half for downed,
  DESIGN gold, stats, codex), rewards screen, level-ups (learn / upgrade / perk, replace-or-skip), queued skill learns,
  the §9.5 event API, shop, tavern (rest/train/recruit), treasure, act completion (unlocks, 50% heal, next map) and
  victory / game over (recorded in Meta). Saved after every step; `pending` holds the resumable step.
- **DD.Rewards** (§9.4): XP table, combat XP/gold, act-shifted rarity odds, pick-1-of-3 rewards (elite → rare item,
  boss → legendary), skill tomes, upgrades, consumables, gold piles, heal, treasure, shop stock and prices. Empty
  item/consumable/skill registries degrade to gold.
- **Scars** (13): Trick Knee, Bruised Ego, Glass Jaw, Tinnitus (stat penalties); Stage Fright, Permanent Hangover,
  Weak Ankles, Afraid of Fire Now, Imposter Syndrome, Thin Skin, Commitment Issues, Owes the DM Money, Sleep Talker (hooks).
- **Tests**: 22 suites / ~720 assertions. Pure-logic suites run in a sandbox (registries swapped for `rt_` content, a
  scripted fake `DD.Combat`/`DD.Encounter`), including 6 whole simulated 3-act runs with random decisions and a defeat
  run; plus every registered event resolved through the API, a stub-`DD.UI` navigation suite and a real
  `DD.Combat` + `DD.AutoPlay` integration suite (skips when the engine is absent).

## Public API (beyond the contract)

**DD.Meta**: `STARTERS`, `ACT_UNLOCKS`, `defaults()`, `reset(keepSettings = true)`, `unlocksForAct(act)`,
`unlockForAct(act) → newly unlocked ids`, `unlockedHeroes()`, `lockedHeroes()`, `unlockHint(heroId)`, `isSeen(kind, id)`,
`setSetting(key, value)`. `markSeen` accepts singular kinds. Extra stats: `downs, combats, elites, bosses, goldEarned,
actsCleared`. Emits `meta:changed`, `meta:settings`.

**DD.RunMap**: `ROWS, BOSS_ROW, TAVERN_ROW, TYPES ({ icon, name, desc } per type), WEIGHTS`, `generate(act, rng, { run,
exclude })`, `validate(map) → [problems]`, `parents(map, id)`, `isFight(type)`, `pickEncounter(act, kind, rng, { depth,
exclude })` (DD.Encounter.pick first, then registry; nearest act / lower kind as fallback), `pickEvent(act, rng, { run,
exclude })`, `eventAvailable(def, act, run)`, `nodeInfo(node)`. ActMap extras: `rows` = 8 (count, boss row included),
`layout: [[ids per row]]`, `cleared`. Node extras: `x` (0..1 layout hint), `result: 'victory'` once won.

**DD.Rewards**: `xpTable[level]` = cumulative XP to reach that level (index 0 unused), `MAX_LEVEL, COMBAT_XP, PRICES,
RARITY_ODDS, RARITY_NAMES, SLOTS`, `xpForLevel, levelForXp, xpProgress(rh)`, `combatXp(kind, act)`, `combatGold(kind,
act, rng, mult)`, `rarityOdds(act)`, `rollRarity(act, rng, opts)`, `combat(kind, act, rng, run, { goldMult, itemRarity })`,
`treasure(act, rng, run)`, `goldPile, goldReward, healReward, itemReward, consumableReward, upgradeOffer`,
`itemPrice, consumablePrice, price(kind, id)`, `ownedItems(run)`, `describe(reward)`.
`apply(reward, { run, replaceIdx, heroIdx, equip })` → `{ ok, text, reason?, learned?, queued?, skipped?, equippedTo? }`
(reasons: taken, full, known, gone, maxed, invalid). Rewards carry `heroId` (stable across recruits) and `rid` when
they belong to a reward screen.

**DD.Run**
- Constants: `VERSION, SAVE_KEY ('run'), FINAL_ACT, MAX_SKILLS, MAX_LEVEL, START_GOLD, DOWNS_TO_DIE, DIFFICULTIES, PERKS,
  FALLBACK_EVENT`. `useUi`: null = UI calls unless `DD.headless`, true = always, false = never.
- Flow: `resume()` (show the screen for the current state, loading the save if needed; relaunches an interrupted fight),
  `next()` / `leave()` (close the current step → queued event fight → level-ups once → map), `leaveNode()` (=
  `closeStep`, `leaveShop`, `leaveTavern`, `finishEvent`: close the step without navigating).
- Map/combat: `currentNode()`, `currentCombat()`, `inCombat()`; `startCombat(encounter, kind, { nodeId, fromEvent,
  seed })` accepts an id, a def or `{ act, kind }`.
- Party: `hero(idx)`, `indexOf(heroId)`, `aliveHeroes()`, `heroName(idx|rh)`, `makeRunHero(id, level)`, `partyLevel()`,
  `xpInfo(idx)`, `canEquip`, `autoEquip(itemId, preferIdx) → idx|-1` (never cursed), `maxConsumables()`, `healHero`.
- Progression: `grantHeroXp(idx, n)`, `grantXp(n, { half: [idx] })`, `levelQueue()`, `levelQueueFull()` (index repeated
  per pending level), `hasPendingChoices()`, `giveSkill(idx, id, source, replaceIdx)`, `pendingLearns()`,
  `resolveLearn(i, replaceIdx)`, `forgetText`, `learnableFor(rh, { generic })`, `upgradableFor(rh)`,
  `learnableSkills(idx)`, `upgradableSkills(idx)`. `applyLevelChoice` returns `{ ok, text, needsReplace?, reason? }`;
  replaceIdx -1 = skip the new skill.
- Rewards screen: `rewards()`, `takeReward(i, opts)`, `skipRewards()`, `isRewardTaken(r)`, `noteRewardApplied(r)`.
- Events: `currentEvent()`, `chooseEventOption(i) → { text, combat }`, `resolveEvent(eventId, i) → { text, combat,
  learn: [{ heroIdx, heroId, skillId }], levels }` (event-screen adapter: replace-or-skip learns are handed over),
  `openEvent(id, nodeId, { noShow })`, `queueCombat(spec)`, `startQueuedCombat()`.
- Shop: `shop()`, `buy('items'|'tomes'|'consumables'|'services', i, { replaceIdx, heroIdx, scarId })`,
  `shopService('heal'|'scar', opts)`. Tavern: `tavern()`, `tavernRest(scarHeroIdx)`, `tavernTrain(heroIdx, skillIdx)`,
  `tavernRecruit(heroId, replaceIdx)`, `recruitCandidates()`. `endRun(result, extra)`, `summary()`.
- State extras: `learnQueue, fallen, fought, queuedCombat, over, summary, seq`, `stats.actsCleared`. RunHero extras:
  `perks, pendingLevels, levelChoices`.
- Pending data: rewards `{ id, source: 'combat'|'boss'|'treasure', kind, act, gold, xp, xpByHero, levelsGained,
  leveled (one entry per pending level), downed, scars: [{ heroIdx, scarId }], deaths, kills, encounterId,
  encounterName, boss, title?, text, actClear, choices (with rid), taken, skipped }`; event `{ eventId, nodeId,
  resolved, choice, outcome, combat }`; shop = `DD.Rewards.shopInventory` + `{ nodeId, greeting }`; tavern `{ nodeId,
  used, greeting, recruits }`.
- Built-in fallback event `run_dm_unprepared` (`fallback: true`, weight 0): only used when no other event is available.

## Deviations

1. **Eager act completion.** The act-boss victory completes the act inside `finishCombat` (unlocks, 50% heal, next act
   map) before the rewards screen. The rewards data carries `actClear: { act, nextAct, unlocked, healed, text }`, which
   the rewards screen turns into the act-clear interstitial before `DD.Run.next()`. `completeAct()` stays public and
   idempotent. The final boss goes straight to `victory` with `{ summary, final: true, act: 3, unlocked }` (no loot
   screen).
2. Per-fight gold/XP follow DESIGN §5 (× `encounter.reward.goldMult`, `itemRarity` honoured). The combat state's
   enemy-def tallies (`state.stats.gold`) are not added on top (double counting).
3. `availableNodes()` returns node objects; `travel()` accepts ids or nodes. `ActMap.rows` is the row count (8).
4. Level-ups apply HP growth immediately; the choice is deferred (`pendingLevels`) and never blocks travel.
5. Downs count only for heroes still downed at the end of a **won** fight (Help Up saves you the scar). Nothing is
   counted on a TPK (the run ends).
6. No mid-fight saves: the save is taken when a fight starts; a reload restarts that fight (same encounter + seed).
7. Recruits are auto-built to the living party's average level (pool skills until 4 socketed, then the lowest skill is
   upgraded, then +HP perks); a replaced hero's equipment goes back to the bag; the fallen cannot be recruited.
8. Tavern Rest removes one scar in total (chosen hero, else the most scarred hero's latest). Shop services are once
   per visit each. Skipping loot is allowed.
9. Event API: `heal(x)` with x ≤ 1 is a fraction (1 = full heal); `damage(x)` with 0 < x < 1 is a fraction; `hasHero` /
   `heroIdx` count living heroes only; `gold()` without args reads; `xp(n)` returns the indices that leveled;
   `giveItem` with an empty item registry gives the rarity's price in gold and returns null.
10. Josiah's +1 consumable slot is read from `consumableSlots` on the hero def or its passive; `state.maxConsumables`
    is recomputed when the party changes.
11. When an event fight is queued, `travel()` starts that fight instead of travelling (returns false).

## Requests

- **META-UI**: nothing open. Their screens use `resume()`, `next()`, `currentEvent/chooseEventOption`, `buy`, the
  tavern functions and the level-up/learn queue. Two safety nets stay in place in case a screen goes straight to the
  map: a queued event fight starts, and an interrupted fight relaunches (both via `ui:screen`).
- **HUD**: as per §8.3, call `DD.Run.finishCombat(result, state)` once FX are idle. With the UI on, `onEnd` does
  nothing, so without that call the game stays on the combat screen.
- **Josiah (content)**: set `consumableSlots: 1` on the hero def (or its passive) instead of changing
  `run.maxConsumables` in a hook (a hook would stack the slot every fight).
- **Hero content**: `unlock: { act: 1 }` Josiah, `{ act: 2 }` Sparrow, `{ act: 3 }` Corelos, `null` for the 5 starters.
- **Lead**: consider listing `resume/next/takeReward/resolveEvent/buy/tavern*` in ARCHITECTURE §9.2. META-UI already
  uses most of them.

## Known issues

- The combat HUD had not landed, so the real-UI combat → rewards hand-off is untested. It is covered headlessly
  through `onEnd` (real `DD.Combat` + `DD.AutoPlay`) and with a stub `DD.UI`.
- Real heroes, items, consumables, events and encounters had not landed. Tests used RULES' `test_` fixtures and my
  sandbox content. The "every registered event" suite will cover real events once `js/data/events.js` exists.
- Balance was checked only by simulation with random play: about L4 before the act 1 boss and L7-8 at act 2
  (DESIGN: ~4 / ~7). Gold income vs. prices has not been tuned against real items.

## Integration changes (by the integrator — details in docs/notes/content-digest.md §6)

- `resolveCombat`: a `defeat` with heroes still standing outside a boss fight (a lost protect objective: the keg, the
  coffee machine, the snack bowl) no longer ends the run. It becomes an "Objective Failed" step: a rewards entry with
  `kind: 'failed'`, `failed: true`, no gold / XP / loot, the node marked `done` with `result: 'defeat'`,
  `S.stats.failed++`; downed heroes are back on 1 HP with no down counted. A TPK, or any lost boss fight, is still game
  over. Tests: `integration: losing a protect objective …` and `integration: the HUD hands a lost objective …`; the
  run/HUD defeat suites now down every hero first (a real TPK).
- The victory rewards text is a `hero_death` line when a hero was written out in that fight.

## Economy (sustain refit 3, Nov 13) — data only

No code in `js/run/*.js` changed; the economy moved through `DD.Balance` (owner: the balance passes):
`map.minShops` 1 → 2 (`runmap.js` already read it), boss gold 80-100 → 50-70, regular-fight gold no longer grows per act
(+6 → 0), Mystery Stew (`heal.reward`) 0.3 → 0.35. `tests/run_tests.js`: the loot-table suite reads the gold rows from
`DD.Balance.gold` instead of DESIGN's old numbers, and the reward-apply suite reads the Stew's fraction (and checks its
desc names it). The measurements and the rejected levers (act price inflation, a bigger stock, more shop weight) are in
`docs/notes/balance.md` "Sustain refit - difficulties and economy". The "Gold income vs. prices has not been tuned"
known issue above is superseded by it.

## Finish (Nov 14) — fix:engine

- `DD.Run.goldPreview(n)` (new, pure): the gold `Run.addGold(n)` would add now, Blessings included; the reward card uses it
  (desc-sweep-9, `docs/notes/run-v2.md`). Nothing else in the meta / run layer changed.

## Review (finish, Nov 14) — REVIEWER

- `Run.goldPreview` re-played (card text = gold added, Trust Fund I / III). Event hints now print it too while a gold
  Blessing is held (`goldHint` in run.js; `docs/notes/run-v2.md` "Review (finish)").

## V3 — act 4 "Under the Table" (META-RUN, plan §2.1-2.6, §4.3, §0.3 V7 V8; tests §8.4)

Files: `js/run/{run,runmap,rewards,meta}.js`, `tests/run_tests.js`. Iterate with
`bash tools/test.sh "suite=run:&isolate=narrator"`; the V3 suites are `suite=run: V3`.

### What landed
- **The act knob**: `DD.Run.FINAL_ACT` is a getter on `DD.finalAct()`; every former `FINAL_ACT` / `Math.min(3, …)` site
  of the run layer asks it (`normalize`, `resolveEncounter`, `queueCombat`, `resolveCombat`, `completeAct`,
  `rewards.js actIdx`). Nothing in the run layer counts lanes or heroes (lanes: `map.lanes.length` / the registry).
- **The twist** (`completeAct`): beating the act-3 boss while the campaign goes on pays his loot (`resolveCombat` →
  rewards, shown at last; the text is `narr('twist_loot')`), heals `heal.actClear`, sets `S.act = 4`, `S.map =
  makeMap(4)` (the gauntlet) and returns `actClear = { act, nextAct, unlocked, healed, twist: true, text:
  narr('act_clear_twist') || narr('act_clear') }`; `S.flags.twistSeen = true`; no `endRun`, no `recordRun`. The
  spoiler gate `seen.bosses.svammiel` is also set here (idempotent safety net beside the entrance cameo).
- **The gauntlet** (`DD.RunMap`): `gauntletLanes(act)` (encounters with that act and `gauntlet`: real before `test_`,
  then `gauntlet.order`, then id; one per lane id; at most `MAX_LANES` = 6), `finaleOf(act)`, `isGauntlet(act)`,
  `generateGauntlet(act, rng, { run, lanes, finale })`, `gauntletStops()` (`DD.Balance.map.gauntlet`, de-duplicated),
  `sealLane(map, lane, nodeId)`. `generate` builds the gauntlet for a gauntlet act (or `opts.lanes` / `shape:
  'gauntlet'`; `shape: 'rows'` forces the classic map). Rows = 2L + 2: the lobby, door rows 1, 3, …, 2L − 1 (one
  `miniboss` node per lane in lane order, `x` = the lane's column), intermissions (`between`, shuffled), the last stop
  (`last`), the boss (the finale, else `pickEncounter(act, 'boss')`); complete links between consecutive rows. Node ids
  `a4_s<k>c<c>` (stops), `a4_d<k>_<lane>` (door row k), `a4_boss`. `validate` has a gauntlet branch (rows, lane order,
  the knob's stop types, complete links, the boss alone last, beaten ⊆ lanes and every door of a beaten lane sealed,
  reachability; no crossing check). `TYPES.miniboss` (😈 "Mini-boss"), `isFight('miniboss')`; `nodeInfo` gives a door
  `{ icon (the encounter's), name (shortName), desc, lane, hint (gauntlet.hint), sealed }` and the floor boss its icon,
  shortName and "The floor boss. Beat him and the campaign is over (for real this time)." Random picks
  (`pickEncounter`, its registry fallback) never return a `gauntlet` / `finale` encounter.
- **Doors** (`run.js`): `travel` / `enterFight` / `normalizeKind` know `'miniboss'` (a boss fight). `startCombat` puts
  `lane` and `gauntlet: { lane, index: map.beaten.length, beaten }` in `pending.data`; `launchCombat` passes it to
  `Encounter.build(…, { gauntlet })` and puts it on the setup when the builder didn't (→ `Combat.start` →
  `state.data.gauntlet`). A won door seals its lane (`DD.Run.sealLane(lane, nodeId)`: map + `run.flags.gauntlet`),
  counts `stats.miniBosses` (not `stats.bosses`) and gets reward data `{ miniboss: true, lane, title: 'Mini-boss
  Defeated!' }` (its loot is the encounter's `reward`: a rare, boss gold × 0.9). Losing a door is game over (boss
  kind). The floor boss (`finale`) won sets `run.flags.floorBoss` and ends the campaign.
- **Events**: `queueCombat` refuses in a gauntlet act (returns false, silently), so `api.combat` and an outcome's
  `combat` start nothing there. The fallback event has an under-the-table text in the gauntlet (the demoted DM in a
  paper hat).
- **Shops**: `RARITY_ODDS[4]`; prices × `priceAct` through `actIdx` (act 4's markup once the knob is 4). The Bribe
  (`💸 Bribe the Floor Boss`, `DD.Balance.prices.bribe` × the markup) is a service of shops in a gauntlet act while a
  door is left; `shopService('bribe')` sets `run.flags.cameo.bribe = 1` (DD.Cameo spends it at the next start cameo
  that has a cheat); refused while a bribe is unspent (`'bribed'`), with no door left (`'noDoors'`), when broke
  (`'gold'`), or a second time in a visit (`'sold'`).
- **Saves**: no migration. `normalize` fills `stats.miniBosses / cameos / cheats`, a gauntlet map's `lanes` /
  `beaten`, sanitizes `flags.gauntlet` and `flags.cameo` (`cameoMemory`). A save whose act is past the knob (an act-4
  save under acts 3) loads clamped to the last act with a fresh map of that act (pending fight/stop dropped). A v2
  act-3 save meets the twist.
- **Summary** (`buildSummary`): `acts` (`DD.finalAct()`), `gauntlet` (lane ids in the order beaten), `gauntletLanes`
  (`map.lanes.length` of the run's gauntlet, 0 before it), `floorBoss`, `killedByEncounter`; `killedBy` uses
  `shortName` when the encounter has one.
- **Run memory for Svammiel's roasts**: `run.flags.lastFight = { downed: [heroIds that ended the fight downed], mvp:
  heroId with the most kills (summons' included) | null, flawless: nobody went down (state.stats.downs too), swaps:
  state.stats.swaps }` after every fight; `run.flags.lastStop` = the type of the node the party just came from
  ('shop' | 'tavern' | 'event' | 'treasure' | a fight type | null at an act's start). Run stats `cameos` / `cheats` sum
  each fight's `state.stats.cameos / cheats`.
- **`DD.Run.startAtAct(act, { level, gear: 'auto' | 'none', gold, beaten, noShow })`**: a fresh run fast-forwarded to
  `act` (clamped to 1..`DD.finalAct()`): the party rebuilt as recruits of `level` (default 1 + round(1.2 × (act − 1)),
  5 for act 4), gear 'auto' = a weapon and an armor per hero (rarity rolled with the previous act's odds, never cursed,
  hero items allowed), `gold`, `stats.actsCleared = act − 1`, the act's map; in a gauntlet `beaten` (array or 'a,b',
  unknown ids ignored) seals those lanes in order, counts them and puts the party on the last door beaten (its stop row
  is next). Deterministic per run seed.
- **Meta**: `STAT_KEYS` += `dmDefeated` (runs with `actsCleared ≥ DM_ACT`), `miniBosses` (summed); `settings.cameos:
  'full'` (sanitized to `CAMEO_SETTINGS` = full / short / log); `DM_ACT` = 3 (the DM's act, not "the last act");
  `unlockHint` says "Beat the Dungeon Master" for the DM's act only.
- **`narr`** (wave-0 request): filters the pool `DD.narrate` will draw from (`DD.narrationKey(key)`), so act variants
  (`shop_greet@a4`, …) work in the run layer.

### API added (beyond ARCHITECTURE §9.2-9.4)
`DD.Run`: `startAtAct`, `sealLane(lane, nodeId)`, `unbeatenLanes()`, `inGauntlet()`, `cameoMemory()` (creates and
sanitizes `run.flags.cameo`), `FINAL_ACT` (getter). `DD.RunMap`: `MAX_LANES`, `finaleOf`, `generateGauntlet`,
`gauntletStops`, `sealLane(map, lane, nodeId)`, `generate(act, rng, { lanes, shape })`. `DD.Meta`: `DM_ACT`,
`CAMEO_SETTINGS`. Summary: `killedByEncounter`. Reward data: `miniboss`, `lane`, `title`. Run flags: `floorBoss`.

### Deviations
1. **`isGauntlet(act)` is also true for a floor boss alone** (an act with a `finale` but no doors): partial content
   (`isolate=svammiel`) gets lobby → floor boss instead of a classic map whose random picks can't find act-4
   encounters. ARCHITECTURE §9.3 says "encounters with that act and `gauntlet`".
2. **L = 0**: rows = 2L + 2 = 2, so the lobby doubles as the last stop (its types: the lobby's, then the last stop's
   missing ones: shop, event, tavern). The systems design said "Lobby, Last stop, boss" (3 rows), against the plan's
   2L + 2.
3. **`sealLane`**: ARCHITECTURE names `DD.RunMap.sealLane(lane)`. Built: `DD.RunMap.sealLane(map, lane, nodeId)` (pure
   on a map) and `DD.Run.sealLane(lane, nodeId)` (the run's map + `run.flags.gauntlet`).
4. **The twist is "the next act is a gauntlet"** (`completeAct` reads the new map's shape) rather than a literal
   "act 3 to 4": with no act-4 content at all the run goes on with a classic map and no Twist panel.
5. **Doors count in `stats.miniBosses`, not `stats.bosses`** (bosses = act bosses: 4 in a won 4-act run).
6. **The Bribe is not on sale once no door is left** (the plan: "it does nothing in Svammiel's own fight; the shop line
   says so"); the desc says so too, and `shopService` refuses `'noDoors'` / `'bribed'`.
7. **The twist's loot text**: `twist_loot`, unless a hero was written out in that fight (then `hero_death`, as for any
   fight: the integration fix's priority).
8. **`startAtAct`'s gear** follows the plan ("auto gear with act-3 odds"): a weapon and an armor per hero, rarities
   rolled with the previous act's odds (the systems design said "a rare weapon and a common armor").
9. **A save past the knob** gets a fresh map of the clamped act (the plan only clamps `act`): a stale act-4 gauntlet
   would otherwise be played as act 3 and end at the floor boss as a 3-act win.
10. **`seen.bosses.svammiel`** is also set by `completeAct` on the twist (the plan: the entrance cameo sets it): with
    cameos off (`cameo.off`, Log only) the gate still opens with what the player sees.
11. **`DM_ACT` = 3** in meta.js (`dmDefeated`, the unlock hint): it is the Dungeon Master's act (dm.js), not "the last
    act", so it isn't `DD.finalAct()`. The v3-contract table suggested `DD.finalAct()` for the dormant unlock hint;
    that would print "Clear Act 3" for the DM after the flip.
12. The sandbox's classic acts stay a fixture list (`CLASSIC_ACTS` in run_tests); the suites that assert v2's 3-act
    campaign (act completion, whole runs, UI mode) pin the knob to 3 with `withActs`, so they hold before and after the
    flip; the V3 suites set it to 4.

### Requests
- **Lead (ARCHITECTURE §9.2-9.4)**: note the API above, deviations 1, 3 and 5, and that `startCombat`'s gauntlet object
  is `{ lane, index, beaten }` (as §4.1 has it; §9.2 says `{ index, beaten }`).
- **META-UI**: `main.js act=4` → `DD.Run.startAtAct(4, { level, gear: 'auto', gold, beaten: params.beaten })` (a comma
  string is fine; `noShow: true` if the debug flow shows its own screen); the Twist panel from
  `rewards.actClear.twist`; the floor-boss counts from `summary.gauntlet.length` / `summary.gauntletLanes` (0 = never
  reached the gauntlet); " (he cheated)" when `DD.getEncounter(summary.killedByEncounter).finale`; the map tooltip
  from `DD.RunMap.nodeInfo(node)` (`hint`, `lane`, `sealed`); the Settings choices `DD.Meta.CAMEO_SETTINGS`; the
  rewards title is already in `data.title` ('Mini-boss Defeated!').
- **C5 (Svammiel's `situation(state, run)`)**: read `run.flags.lastFight`, `run.flags.lastStop`, `run.map.beaten` /
  `run.flags.gauntlet`, `run.map.lanes.length`, `run.fallen`, the party ids (recruits): shapes above.
- **Integrator (`sim.js`)**: `start=4` → `DD.Run.startAtAct(4, { level, gear: 'auto', gold })` after `newRun`; door
  nodes are `type: 'miniboss'` with `node.lane`; `DD.Run.unbeatenLanes()`; the Bribe's refusals; run stats
  `miniBosses / cameos / cheats`; summary `acts / gauntlet / gauntletLanes / floorBoss`. A scratch harness that runs
  suites with the knob flipped: `bash .tmp/metarun/test4.sh "suite=run:&isolate=narrator"` (real-page ui suites can't
  load their iframe from there).
- **MAPGEN**: `Encounter.build(…, { gauntlet })` → `setup.gauntlet` (run.js passes it for doors only, and also sets it
  on the setup itself until the builder does).
- **NARRATIVE**: run.js reads `twist_loot` and `act_clear_twist` (falls back to `act_clear`) at the twist; every other
  run-layer key now follows its `@a4` variant automatically.

### Tests (run_tests.js)
New suites (`run: V3 …`): the knob (acts 3 ends at the DM; acts 4 goes on: rewards, `actClear.twist`, act 4, the
gauntlet, no endRun / recordRun, the heal, the gate; the UI flow rewards to the act-4 map); gauntlet validate for 300
seeds × L = 0..6 (path counts L + 1 stops / L doors, the stop knob, corruption caught, the registry's lane order / test
lanes / cap / finale, no leaks into random picks, nodeInfo); the registry's real gauntlet (skips without act-4 content);
travel for L = 0, 1, 3, 6 (door row k offers exactly the L − k unbeaten lanes, gauntlet data into `Encounter.build`,
lastStop, sealing, mini-boss loot, miniBosses === map.lanes.length, the last stop's tavern, the floor boss to victory,
summary, Meta); rewards (act-4 odds, door loot, the markup, the Bribe only in act-4 shops and its refusals); act-4
events never start fights, the fallback text; saves (gauntlet round trip, a mid-door reload, a v2 act-3 save reaching
the twist, an act-4 save under acts 3); startAtAct (party, gear, gold, defaults, gear none, beaten, determinism, the
clamp); summary / lastFight / Meta (dmDefeated, miniBosses, bestAct, cameo settings, an act-4 defeat); whole 4-act
headless runs; a door with the real engine (`state.data.gauntlet`, sealed on a win). Existing suites: act loops read
the knob or `DD.MAX_ACT`; the 3-act assertions pin acts 3.
- `bash tools/test.sh "suite=run:&isolate=narrator"`: 43 suites PASS, also with the knob flipped
  (`.tmp/metarun/test4.sh`).
- Full `bash tools/test.sh` (Nov 14, end of the pass): 1084 suites, 124,703 assertions ok, 5 failures, all in RULES'
  new `engine: V3 cameo …` suites (engine_tests.js / fixtures.js / cameo.js landed minutes before, still in progress:
  "heroes take 1 more: estimate 7, dealt 6", "the door's squad objective … (1 left)", "the preview downs the knight",
  "one interjection a round", "reported once through DD.safe"; sandbox fights, no run layer). Every `run:` suite
  passes; no swallowed "Error in" lines. An earlier full run before RULES' test file landed: 1068 suites, 0 failures.

### Known issues
- No real act-4 content had landed (only RULES' fixture lanes `test_a4_lane_a..d`): the gauntlet was exercised with
  sandbox and fixture lanes. The registry suite checks the real gauntlet once it exists (rows from its L).
- `integration: cross-content consistency` (integrator) fails with the knob flipped while act 4 has no real content
  ("act 4: 6+ normal encounters"): expected until the act-4 content lands (it counts non-test encounters only).

## Review (V3) — adversarial review of META-RUN's V3 work (REVIEWER, core cluster, Nov 15)
Scope: `js/run/{run,runmap,rewards,meta}.js`, `tests/run_tests.js`; plan §2.1-2.6, §4.3, §8.4 (META-RUN). Scratch
harness: `.tmp/rvcore/` (real content, real engine, AutoPlay; not project files).

### Verified by running
- **The twist from a v2-shaped act-3 save** (no V3 stats or flags), real engine: with `acts` 3 the DM ends the run as a
  classic win (no cameo line, no cameo memory, the gate shut, `summary.acts` 3); with `acts` 4 the same save plays the
  entrance on his board, pays his loot, marks the act clear `twist`, opens the registry's gauntlet (valid) and the twist
  rewards survive a reload.
- **The whole gauntlet with the five real lanes** (20 real runs; `.tmp/rvcore/probe.js`): 12 rows; door rows offered
  5, 4, 3, 2, 1 lanes; `map.beaten` == `flags.gauntlet` (the order chosen), `stats.miniBosses` == lanes sealed, `bosses`
  counts only the act bosses; every door got `state.data.gauntlet { lane, index, beaten }`; won runs end with `summary {
  acts: 4, gauntlet (5 lanes in order), gauntletLanes: 5, floorBoss: true }`, lost ones name the door (`killedBy` = its
  shortName, `killedByEncounter`). Bribes bought in the probe's shops skipped the next door's cheat.
- **Reloads**: mid-gauntlet (beaten lanes, sealed doors, the same open doors) and mid-fight: `save()` is skipped while a
  fight runs, so a reload relaunches the door from the pre-fight save — the same seed, the same start cheat (the Radio
  Edit picked the same skill) and a spent Bribe comes back and is spent again (no gold lost).
- `startAtAct(4, { beaten: 'goats, league' })`: lanes sealed in that order (spaces trimmed), the party on the League's
  door of row 2, door row 3 offers the other three.
- Knob flipped (`.tmp/metarun/test4.sh "suite=run:,engine: V3,mapgen: V3,core:"`): 74 suites PASS. `grep` of `js/run`:
  no literal last act, door or lane count (`RUN_STATS`, summary and Meta read `map.lanes.length` / the registry).

### Fixed (regression suites in `tests/run_tests.js`)
1. **NARRATIVE's ask (plan §2.6): a new run ignored `run_start_seen`.** `newRun` now opens with `runStartText()`: before
   the spoiler gate exactly v2's single draw from `run_start`; after it (`seen.bosses.svammiel`) one more cosmetic draw
   picks `run_start_seen` or `run_start` by pool size. Suite `run: V3 review — a new run's opening line…`.
2. **`startAtAct` twice in one run** (`DDdbg.act` twice) kept the first gauntlet's `flags.gauntlet` and `miniBosses`, so
   `summary.gauntlet` repeated lanes: the fast-forward now starts both afresh with the map it builds. Asserted at the end
   of `run: V3 startAtAct …`.

### Tests added (review)
- `run: V3 review — the real lanes over 300 seeds`: the registry's real lanes (no `test_` door), rows 2L + 2, one random
  path per seed sealed as `DD.Run` does — L + 1 stops, L doors (door row k offers L − k + 1 open doors before the pick),
  act-4 events only, valid after every lane is sealed; the registry with the fixtures' lane keeps the real ones first
  under `MAX_LANES` (5 real + `test_a` in this harness).
- `run: V3 review — the real twist from a v2-shaped act-3 save (real engine)`: acts 3 dark, acts 4 twist + gauntlet +
  reload, a door's start cheat replayed identically after a mid-fight reload (skips without the content).

### Not changed (checked)
- `FALLBACK_EVENT` keeps `acts: [1, 2, 3]` (weight 0; `enterEvent` fetches it by id in any act and its text already has
  the under-the-table branch).
- `run.js launchCombat` still puts `p.gauntlet` on the setup when the builder doesn't: MAPGEN's `build` does it now, so
  it is a harmless belt-and-braces.

### Full run (review)
- `bash tools/test.sh` (Nov 15, after the fixes): **PASS — 1232 suites, 143,189 assertions, 0 failures**, 0 swallowed
  "Error in" lines, missing scripts 0 (every V3 file has landed).

## QA fixes (V3, Nov 17) — QA FIXER, core cluster (`meta.js`)
- **flow-2 (minor), fixed on the meta side**: a v2 veteran's meta has no `stats.dmDefeated`, so `merge` left it at 0
  ("The DM defeated 0" behind the gate; 1 after one act-4 run), and the Hall counted classic wins from the 20-entry
  history (15 of 25 in the QA harness, shrinking as new runs push the v2 entries out). Now:
  - `STAT_KEYS` += `classicWins`: a lifetime count of won campaigns that ended at the DM (`result: 'victory'` and no
    `acts` past `DM_ACT`: every v2 win, a 3-act one). `recordRun` adds 1 for such a win.
  - `merge` (`Meta.load`): stored stats without `dmDefeated` (a pre-V3 meta) take `dmDefeated = wins` (every v2 win beat
    the DM); stored stats without `classicWins` take `wins` minus the four-act wins their history still shows (a v2
    meta: `wins`; a V3 meta saved before this fix: its best guess). Loading twice seeds the same; no stored meta: zeros.
  - ARCHITECTURE §4.7 lists `stats.classicWins` and the seeding.
  - Suite: `run: V3 Meta — a v2 veteran's lifetime stats migrate (dmDefeated, classicWins; qa flow-2)` (run_tests.js;
    the QA harness's veteran: 25 / 25 after load; an act-4 abandon, a four-act win and a 3-act win → dmDefeated 28,
    wins 27, classic 26; 20 more runs push the v2 entries out of the history and classic stays 26).

### Requests (QA fixes)
- **META-UI (`js/ui/screens/hall.js` `records()`)**: read the lifetime count instead of filtering the history —
  `const classic = seen4 ? num(s.classicWins) : 0;` (`isClassicWin` stays for the History tab). Until then the Hall's
  "(of which classic: N)" still counts the 20-entry history; "The DM defeated" is already right (meta-side).
  `tests/ui_tests.js` (the Hall suite that sets `stats { runs: 3, wins: 2, dmDefeated: 2, miniBosses: 9 }` and expects
  "of which classic: 1") then needs `classicWins: 1` in those two `Object.assign`s.

### Full run (QA fixes)
- `bash tools/test.sh` (Nov 17, after both QA fixes): **PASS — 1277 suites, 149,518 assertions, 0 failures**, missing
  scripts 0, 0 swallowed "Error in" lines. No sim number moves (the objective title and the meta stats are not read by
  AutoPlay, the sim or any rule).
