# META-RUN notes

Files: `js/run/meta.js`, `js/run/run.js`, `js/run/runmap.js`, `js/run/rewards.js`, `js/data/scars.js`, `tests/run_tests.js`
(suite prefix `run:` — `bash tools/test.sh "suite=run:"`).

## Summary

- **DD.Meta** (§4.7/§9.1): defaults, sanitizing load/save (`DD.Storage` key `meta`), unlocks (hero def `unlock: null` =
  starter, `{ act: N }` = first clear of act N, DESIGN fallback map for unregistered ids, `settings.unlockAll` and
  `?debug=1&unlockall=1`), lifetime stats, codex `seen`, last 20 run summaries. Loaded in `afterLoad` (order -100).
- **DD.RunMap** (§9.3): 7 rows of 2-4 nodes + boss row. Row 0 combat, row 6 taverns, elites from row 2, ≤1 shop per row,
  at least one fight per row, at least one shop / elite / event per act, no shop/elite/treasure/tavern directly after the
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
