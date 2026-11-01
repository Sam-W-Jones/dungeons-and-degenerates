# PASSIVES-SYSTEM notes — the Table of Questionable Blessings (run layer + UI)

User request: *"passives should also have a random table (make it very random) whereby characters can earn passives by
level-ups, again with 4 slots"*. Contract: ARCHITECTURE §3.12 / §5.3 / §9.5 / §9.6, DESIGN §3 / §7.1. The table itself
(`js/data/passives.js`, 79 entries) is the table author's; the engine side (hooks, `unit.passives`, stats) is the lead's.

Files: `js/run/passives.js` (new, `DD.Passives`), `js/run/run.js`, `js/run/rewards.js`, `js/run/meta.js`, `js/ui/ui.js`,
`js/ui/screens/{levelup,party,shop,event,hall}.js`, `js/ui/combat_hud.js` (display only), `css/style.css`, `js/main.js`,
`tests/passive_tests.js` (new, suites `passives: …`), small updates to `tests/run_tests.js` and `tests/ui_tests.js`.
Run: `bash tools/test.sh "suite=passives:"`.

## Summary

- **DD.Passives** (`js/run/passives.js`): pure logic over RunHero-like objects. `MAX = 4`; the d100 `table(rh?, opts)`
  (weighted slices of 1..100, cursed entries at the bottom = NAT 1s, legendaries at the top, `requires(rh, heroDef)`
  filter, owned-below-max → upgrade, maxed excluded, `noCursed` / `exclude`), `roll(rh, rng, opts)`, `refresh` (re-checks
  a stored roll), `describe` / `quip`, `options`, the headless `policy`, `apply` (keep / upgrade / replace / discard /
  auto) and run modifiers (`heroMods`, `partyMods`, `goldMult`, `priceMult` ≥ 0.5, `xpMult`, `healMult`). An empty
  registry means no rolls and no errors.
- **Run flow** (`DD.Run`): every hero rolls once at run start ("Session Zero", never cursed, auto-kept) and once per
  level gained; events (`api.rollPassive`) and the shop's **Re-roll a Blessing** service (40 gold, once per visit) grant
  extra rolls. Pending rolls live on the RunHero (`passiveRolls`), are rolled lazily on their own RNG stream and
  stored, so reloading never re-rolls. With the UI they wait for THE ROLL MOMENT; without it (headless, AutoPlay sims,
  recruits, migrations) the policy resolves them at once. Recruits arrive with start + one roll per level. Old saves
  are migrated (retroactive rolls). Dead heroes drop pending rolls. Saves round-trip everything.
- **runMods**: party-wide `gold` (every gold gain through `DD.Run.addGold`, exact over many small gains via a fractional
  carry) and `price` (every shop price, clamped to ≥ 50%, follows the party live), per hero `xp` and `heal`
  (out-of-combat healing). Rewards data now reports the gold / XP actually gained.
- **UI**: THE ROLL MOMENT (`DD.UI.passiveRoll`): a faceted d100 tumbles (~1 s; click / Space / Enter skips; instant when
  headless or `DD.FX.instant`), lands on a rarity-coloured card (icon, name, level badge, exact desc, "Was (I)" for
  upgrades, flavor, rolled number + table slice + chance, UPGRADE! stamp), a stable comedy quip (NAT 1 / NAT 100 /
  cursed / legendary / maxed …), the hero's 4 slots, then Keep (K) / Upgrade / Replace… (R → click one of the 4 slots,
  1-4, Back / Esc) / Discard (D). Level-up screen: each level's roll comes before that level's boon. Party screen: Blessing
  slots at the top of the loadout column (cards with level pips + tooltips, dashed empties, "Roll!" for waiting rolls).
  Combat HUD: party-card tooltip + action-bar header list the Blessings with exact text; the inspect panel shows chips.
  Shop: the re-roll service (pick a Blessing to toss → roll); prices show a "🎲 Blessings: prices −25%" chip when
  modified. Event screen: event rolls open the roll right after the choice; outcome chips list gained / upgraded / lost
  Blessings. Hall of Fame: a **Blessings** codex tab (discovered by rarity, ??? otherwise) + "Blessings discovered" progress.
- **Debug**: `DDdbg.passive(i, id, lvl)`, `DDdbg.roll(i)`, `DDdbg.table(i)`; `&passives=id[:lvl],…` gives every debug hero
  those Blessings; debug runs at `&level=N` roll their Blessings like recruits; `screen=levelup` shows a roll first.
- **Tests** (`tests/passive_tests.js`, 16 suites; 2 from the review, 2 from the integration pass): slices / weights /
  order / requires / maxed / empty table, seeded determinism + weighted distribution, apply + policy + sanitize, run-start rolls, level-up rolls + nextLevelStep + save /
  load never re-rolls, old-save migration, recruits, event API, shop re-roll (incl. refusals), debug helpers, runMods,
  4 whole headless runs (policy audited on every resolution), a real-engine run with Blessing hooks firing, and DOM flows
  (level-up roll → keep / replace / discard → boon, tumble + skip + hotkey; party slots; shop re-roll; event roll; Hall
  codex; HUD tooltip + inspect). Suites register their own `test_rp_*` passives and restore the real table, except the
  integration suite that plays whole AutoPlay runs with the real table (it skips without it).

## Public API

**DD.Passives**: `MAX, ORDER, RARITY ({ name, color, rank } per rarity), QUIPS`, `defs()`, `count()`, `list(rh)`,
`sanitize(arr)`, `owned(rh, id)`, `indexOf(rh, id)`, `isMaxed(entry)`, `hasFreeSlot(rh)`, `maxLevel(idOrDef)`,
`rank(x)`, `weight(def)`, `eligible(rh, opts)`, `table(rh?, opts) → [{ id, def, weight, rarity, from, to, pct, lo, hi,
total, upgrade, level }]`, `entryAt(table, u) → { entry, d100 }`, `roll(rh, rng, opts) → { id, level, upgrade, d100,
rarity, from, to, pct } | null`, `refresh(rh, roll)`, `describe(entry)`, `quip(roll)`, `options(rh, roll) → { upgrade,
keep, replace, discard, full }`, `weakestSlot(rh)`, `policy(rh, roll) → { action, slot? }`, `apply(rh, roll, action,
slot)`, `mods(entry)`, `heroMods(rh)`, `partyMods(run)`, `goldMult(run)`, `priceMult(run)`, `xpMult(rh)`, `healMult(rh)`.
opts: `{ noCursed, exclude: [ids] }`.

**DD.Run** (new): `pendingRolls(idx?) → [{ heroIdx, heroId, index, src, lv, rolled }]`, `rollQueue()`,
`currentRoll(idx) → { heroIdx, heroId, src, lv, pending, …roll } | null`, `resolveRoll(idx, 'upgrade'|'keep'|'replace'|
'discard'|'auto', slot) → { ok, action, entry, replaced?, roll, src, text } | { ok: false, needsReplace?, reason, text }`,
`nextLevelStep(idx) → 'roll'|'choice'|null`, `grantRoll(idx, src, opts)` (queues; `opts { lv, noCursed, exclude, auto }`),
`autoResolveRolls(idx, max)`, `addPassive(idx, id, level, slot)`, `removePassive(idx, idOrSlot)`,
`autoRollPassives(idx)`, `passiveMods()`, `passiveRng()`, `xpGain(rh, n)`. `addGold(n, { raw })`. `shopService('reroll',
{ heroIdx, slot | passiveId })`. `hasPendingChoices()` also counts pending rolls. `resolveEvent()` returns `rolls`.
RunHero: `passives: [{ id, level }]`, `passiveRolls: [{ src: 'start'|'level'|'event'|'shop'|'debug', lv, noCursed,
exclude, roll }]`. RunState: `passiveRngState`, `goldCarry`. Summaries list each hero's `passives`.

**Event API**: `api.rollPassive(idx?, { noCursed }) → { heroIdx, heroId, queued, results } | null`,
`api.hasPassive(id, idx?)`.

**DD.Rewards**: `PRICES.reroll = 40`; shops add the `{ id: 'reroll' }` service while `DD.Passives.count() > 0`.
**DD.Meta**: codex kind `passives` (`markSeen('passive'|'passives', id)`).

**DD.UI**: `PASSIVE_RARITY`, `MAX_PASSIVES`, `passiveInfo(entry)`, `passiveTooltipHtml(entry, { showNext, foot })`,
`passiveCard(entry, { compact, badge, onClick, hotkey, cls, tipPos })`, `passiveChip(entry, { compact })`,
`passiveListText(list)`, `passiveSlots(rh, { onPick, badge, hotkeys, emptyText, cls, tipPos })`,
`passiveRoll(heroIdx, { title, cls, instant, animate, onDone })`, `resolveRolls(filter, done)`.
CSS: `.passive-card`, `.passive-chip`, `.bless-slots`, `.tt-passive`, `.tt-bless`, `.pr-*` (roll modal), `.bx-*` (codex),
`.price-mod`, `--r-uncommon`.

## Deviations (from ARCHITECTURE §9.6 / §3.12 — improvements, backwards compatible)

1. **Own RNG stream** for rolls (`seed + ':passives'`, saved as `passiveRngState`): rolls never shift loot / encounters and
   stay deterministic per seed.
2. **Lazy, stored rolls**: a level-up queues a roll job; it is rolled when first shown (or resolved at once headless) and
   stored. A stored roll is re-checked at display time (`refresh`): if the hero got that Blessing meanwhile it becomes
   an upgrade; only when it can no longer apply (maxed / unknown id) is it re-rolled.
3. **Queue order**: level rolls queue at the back; event / shop / debug rolls jump to the front (their screen shows them
   right away). The level-up screen interleaves roll → boon per level (`nextLevelStep`).
4. **Choices**: Discard is always offered (also for upgrades and with free slots); Replace is offered whenever the hero
   owns a Blessing (swapping out a cursed one even with a free slot). The headless policy follows §9.6 exactly.
5. **Table slices**: `table()` entries carry `rarity, pct, lo, hi, total, upgrade, level` too; `roll()` also returns
   `from, to, pct`. Cursed entries take the low numbers, legendaries the top. A slice smaller than 1% may share its number
   with a neighbour (the shown d100 = ⌊u·100⌋+1, clamped into the slice; "the DM's screen hides the decimals").
6. **runMods.gold** applies to every positive `DD.Run.addGold` (combat loot, treasure, events, gold rewards, in-fight
   `DD.Act.gainGold`) with a fractional carry; `{ raw: true }` opts out. **runMods.price** is applied on every
   `DD.Run.shop()` read (entries keep `basePrice`), so prices follow the party during a visit; the stock gets `priceMult`.
7. **Old saves** (no `passives`): start roll + one roll per level already chosen (policy) and a pending roll per level
   still waiting for its boon. Same save version.
8. **api.rollPassive** returns `{ heroIdx, heroId, queued, results }` (null when nobody can roll / empty table); added
   `api.hasPassive(id, idx?)`.
9. **Party screen**: the 4 slots sit at the top of the loadout column (with gear), not in the character-sheet column —
   heroes with long passive texts (Syllamin) overflowed the sheet even at 1600×900.

## Requests

- **Lead (docs)**: fold deviations 1-8 into ARCHITECTURE §9.6 / §9.5 and list the new DD.Run / DD.UI functions; §10.1 could
  mention `&passives=` and `DDdbg.passive / roll / table`.
- **Map screen owner**: the run-start "Session Zero" quirks are rolled silently (auto-kept per §9.6). A line on the act-1
  intro ("Everyone rolled a Session Zero quirk — see the Party screen") would make them discoverable.
- **Table author**: `tests/content/passives.js` can lean on `DD.Passives.table / roll / describe / policy`; `requires`
  is called for every table build (keep it cheap and side-effect free; a throw is reported and excludes the entry).

## Known issues

- `tests/content/passives.js` (the table author's 12 `passive-table:` suites) has landed since and passes against this
  run layer (also with `isolate=data/passives,content/passives`).
- The full run (`bash tools/test.sh`) fails only in other areas' in-progress content (bosses act 1, act-2 enemy sims,
  boss_dm, narration registry keys); every `passives:`, `run:`, `ui:` and `hud:` suite passes.
- Headless captures (`static-ui`) disable the CSS tumble; the number still cycles (timers), so screenshots show the
  landed result. Tooltips were captured as static clones in a scratch scene (`.tmp/passives-system/scene.html`).
- With 3 services at the counter, Gregor's portrait shrinks to keep "Leave Shop" visible at 1280×720 (the keeper title
  hides below 780 px of height).

## Review

An adversarial pass over the run layer and the UI, verified by running code: the `passives:` / `run:` / `ui:` / `hud:`
suites, scratch probes (`.tmp/passives-review/probe*.js`, loaded by `.tmp/passives-review/probe.html`) and headless
screenshots at 1024×640, 1280×720 and 1600×900 (`.tmp/passives-review/shots/`, real `rp_*` table).

**Verified**
- **Determinism**: lazy rolls give the same results with or without reloads in between. Stored level, event and shop
  rolls survive a reload: the shop re-shows the same roll on mount, and the service stays sold.
- **Slots and choices**, through the API and the DOM (clicks and keys K / R / 1-4 / Esc / Enter / D): the 4-slot limit,
  upgrades, maxed entries excluded, replace (also with a free slot) and discard.
- **Run-start and recruit rolls**: `api.rollPassive`, with `noCursed` respected over 60 rolls, the shop re-roll and
  runMods.
- **Edges**: an empty table (every screen), a def removed after a save, all 4 slots maxed and nothing left to roll, a
  hero who dies with pending rolls (also after a reload), and 3 queued level-ups across 2 heroes.
- **Old saves**: a level-9 save with 3 pending levels and a dead hero migrates, and the level-up screen plays 3 rolls and
  3 boons.
- **Whole runs**: 8 AutoPlay runs with the real engine, real heroes and the real 78-entry table all reach the final
  victory. Invariants hold and nothing is swallowed (174 keeps, 16 upgrades, 52 replaces, 145 discards).

**Fixed**
1. `levelup.js`: the boon header named the hero's current level. With several pending levels the roll said
   "reached Level 2" and that level's boon said "Level 3". The header now names the level being chosen (the oldest
   pending one), which matches its roll.
2. `passives.js` `rank()`: a Blessing whose def was removed after a save ranked as a common. The headless policy and the
   shop's default re-roll target protected it over real commons. It now ranks -1, so it is replaced first (never by a
   cursed one when full).
3. `shop.js`: the re-roll picker's text was a plain div, not `.choice-text`, so its second line ran into the first
   card's rarity badge.
4. `run.js` `tavernRecruit`: recruits roll their Blessings off-screen through the policy, so the player never saw them.
   The result line now says "Blessings in tow: …".
5. `run.js` `autoResolveRolls`: tolerates a RunHero without `passiveRolls` (hand-built states). The fallback event's
   outcome ("The DM slides you N gold") now states the gold actually gained, which gold Blessings can raise.
6. Tests: two new suites in `tests/passive_tests.js`. One covers the edges: a removed def, the empty table, maxed slots,
   a death with pending rolls. The other covers queued level-ups (roll and boon name the same level), the keyboard flow,
   the recruit text, the picker text and the empty-table UI.

**Notes (not changed)**
- Deviation 5 undersells the sharing: any slice boundary that falls inside a number is shared, not just slices under
  1% (curse 1-12 and rock 12-42 in the 34-weight test table). This is cosmetic; the shown d100 always lies in the
  rolled entry's slice.
- Session Zero quirks are still silent; the request to the map owner stands. Recruits now say theirs.
- At 1024×640 the longest upgrade card (Loud Eater II with its "Was (I)" line) covers the "Level Up!" title but fits
  without scrolling. At 1280×720 and up, the level-up lineup peeks out under the roll modal. Both are cosmetic.
- Enter skips the tumble and a second Enter takes the primary action. Each needs a fresh key press (repeats are
  ignored), so this was kept.
- XP runMods round per grant (±0.5 XP), while gold carries its fractions. This is acceptable.

### Pass 2 (the review resumed after an app restart)

Re-checked from the current files. All pass-1 fixes are in place, and the pass-1 probes (`.tmp/passives-review/`) still
pass against the table as updated after pass 1. New scratch probes are in `.tmp/prv2/p2.js` (run with
`.tmp/prv2/probe.sh "suite=p2:&verbose=1"`). Screenshot scenes are in `.tmp/prv2/scene.js`, with shots in
`.tmp/prv2/shots/`.

**Verified**
- **API fuzz**: 80 seeds × 160 random operations, each seed run twice, with rolls left pending (UI mode). The
  operations cover XP, event rolls, resolving with every action (including bad actions and bad slots), reloads, shop
  re-rolls, add / remove, boons and deaths. After every operation:
  - at most 4 slots, no duplicates, levels in range;
  - no rolls on dead heroes, HP in range, every stored d100 inside its slice;
  - a reload never changes anything.
  The second run of each seed ends identical to the first.
- **DOM fuzz** on the real level-up screen: 20 seeds of random clicks and keys (K / R / D / Enter / Space / Esc / 1-5,
  die, slots, Back, boons, the forget-a-skill picker). Every one ends on the map with nothing pending and no
  swallowed errors.
- **Reload between a roll and its boon**: the boon comes back for the same level, and the roll is not shown again.
- **An event that levels everyone and grants a roll**: the event screen shows only the event roll, and its chip names
  the Blessing. Continue then gives roll → boon for each hero.
- **A shop re-roll while a level roll waits**: the shop resolves only its own roll. Leaving the shop goes to that
  level's roll, then its boon.
- **Recruits**: 25 recruits at levels 6-9 arrive at full HP (HP Blessings included), with 1-4 Blessings, the
  "Blessings in tow" text and nothing pending.
- **Screenshots**: the worst-case cards (Pet Rock II upgrade at 200 + 200 characters, Always on Fire), replace view,
  party slots with the longest names, the HUD tooltip with the 4 longest Blessings, and the event roll and its chip.
  Sizes: 1024×640, 1280×625, 1280×720, 1366×657 and 1600×900.

**Fixed**
1. **`ui.js` / `style.css`: on short screens the roll modal hid its buttons and lost its bottom edge.**
   - The buttons sat at the end of the scrolling body. A long card (the Pet Rock II upgrade with its "Was (I)" line)
     pushed Upgrade / Discard below the fold at 1366×657 and 1280×625, which is what a 1366×768 or 1280×720 screen
     gives once the browser takes its share.
   - On the level-up screen the modal's max-height ignored the 4.8rem top padding under "Level Up!", so its bottom
     edge left the screen.
   - Now the actions sit below the scrolling body and are always visible. The level-up roll modal is capped at
     `100vh − 4.6rem`, screens 760px tall or less tighten a few gaps, and Replace scrolls the slots into view.
   - The worst case now fits with no scrolling at 1280×720 and 1024×640, with the title visible, and keeps its
     buttons on screen at 1280×625.
2. **`run.js` `nextLevelStep`: a boon could come before its own roll.**
   - It decided "roll first" by counting level rolls against pending levels. When a later level was gained while the
     hero's table was empty, that level had no roll, and the earlier level's boon came before its own roll.
   - It now compares the front roll's level with the level whose boon is next.
   - A test is added to the edges suite.

**Notes (not changed)**
- The shop's re-roll picker shows the rarity in the generic gold choice badge, not in rarity colours. A full party
  gives 16 cards: the list scrolls, but hotkeys stop at 9. Both are cosmetic.
- `DD.Act.gainGold` (engine) returns the raw amount, while gold Blessings make the run gain more. Both descs stay true.
- The final full run's failures are other areas' work in progress. At this pass they were enemies / bosses / AI, and
  a `passive-table:` legendary (`rp_cooldowns_social_construct`) whose data and test were being rewritten at the
  same minute. None of it is in this system's files.

## Integration (the real table × this system)

The system and the table (`js/data/passives.js`, 79 entries) were built and reviewed apart; this pass ran them
together with the real heroes and encounters. Scratch tools (not shipped) are in `.tmp/passives-integrate/`:
`scene.html` + `shot.sh` (screenshot scenes), `sim.html` + `sim.sh` + `sim.js` (whole-run AutoPlay sims),
`pair.html` + `pair.sh` + `pair.js` (paired single-fight sims). The table side of the findings is in
`docs/notes/passives-table.md` → Integration.

**Screenshot tour** (real table, natural rolls: the scene searches seeds until the unforced roll is the wanted kind;
`.tmp/passives-integrate/shots/`): level-up rolls for a new Blessing, an upgrade, a MAXED-OUT upgrade to III, a NAT 100
legendary, two cursed results and the replace picker (1024×640 to 1366×768); the real `screen=levelup` route; the party
screen with 4 rolled Blessings (1024, 1280, 1600 with a waiting "Roll!"); the HUD party-card tooltip and inspect panel
in a run fight; the shop counter, re-roll picker and shop roll; a real event's roll (`ev_dm_notes`); the Blessings
codex with every entry. What looked wrong, and what was done:
1. **Long names broke mid-word** in the 4-slot rows ("OVERCAFFEINATE / D" at 1280×720 and 1024×640): compact cards
   used `overflow-wrap: anywhere`. `UI.passiveCard` now puts a soft hyphen in each 12+ letter word (before the
   consonant-vowel pair nearest its middle: "Overcaf-feinated", "Gravita-tional"; it only shows where the line
   breaks) and the CSS asks for `overflow-wrap: break-word; hyphens: auto`. Tooltips keep the plain name.
2. **Method Actor's role looked like a 5th Blessing** in the HUD (requested by the table author and its reviewer):
   role instances (`role: true`) now read "🎭 this fight only" in the party-card / bar tooltips and get a dashed chip
   with 🎭 and a tooltip foot in the inspect panel (`UI.passiveChip(entry, { role })`, `combat_hud.js` display only).
3. **`&passives=` did nothing on `screen=combat` sandbox fights** (requested by both table passes): `main.js` now gives
   every sandbox RunHero those Blessings at full HP (`debugCombatPassives`), e.g.
   `debug=1&screen=combat&encounter=a1_goblin_ambush&passives=rp_method_actor:3,rp_emotional_support_duck:2`.
4. Gravitational Ego's 🕳️ was a black smudge on the dark icon disc → 🪐 (table data).
Checked and fine: Keep / Upgrade / Replace / Discard / Back always on screen, the cursed card and NAT 1 / NAT 100 die
colours, "Was (I)" lines, slot counts, the queued roll → boon order, the event roll's head line, the shop picker
text. Still cosmetic and open: the re-roll picker's rarity badge is the generic gold one; names with many words clamp
to 2 lines with an ellipsis on 1024-wide party screens ("Chosen One (Self-…", full name in the tooltip).

**Whole-run sims** (`bash .tmp/passives-integrate/sim.sh "suite=pint&runs=200&from=1&diff=normal,brutal,brutal,casual"
<out>`): headless runs (every roll resolved by the §9.6 policy) with random real 4-hero parties, AutoPlay fights, random
boons / rewards / event choices, shops that buy the Blessing re-roll 60% of the time, taverns that recruit. Every
`DD.Passives.roll` / `apply` is instrumented (the per-roll expected rarity comes from that roll's own table). Two
independent batches of 200 runs (seeds 1-200 and 1001-1200; 5,799 fights; 70% won: casual 99%, normal 85%, brutal 48%):
- **Nothing broke**: 0 thrown errors, 0 stuck runs, 0 AutoPlay timeouts, 0 invariant breaks (≤ 4 slots, no duplicates,
  levels in range, nothing pending headless, every d100 inside its slice, start rolls never cursed, hero-only Blessings
  only on qualifying heroes), 0 warnings that mention a Blessing. Damage events per fight: mean 157, max 654.
- **Rolls per run**: mean 39.7 (8-58; a won run makes 43.5, about 11 per hero): 4 Session Zero, 32 level-ups, 0.75 shop
  re-rolls, 0.3 event rolls, 2.6 from recruits. Blessings per hero in fights: act 1 2.4, act 2 4.0, act 3 4.0.
- **Resolutions**: keep 45.5% · upgrade 4.5% · replace 14.6% · discard 35.5% (per run: 5.8 replaced, 14 discarded,
  1.8 upgrades). Upgrades: 675 to II, 34 to III. **Held at run end: 90.8% level I, 8.6% II, 0.5% III**, so the
  table's level II / III texts are rarely seen (see Requests).
- **Rarity vs weights**: observed / per-roll expected over 15,855 rolls — common 64.9% / 65.1%, uncommon 18.4% / 18.8%,
  rare 7.0% / 6.9%, legendary 1.24% / 1.25%, cursed 8.5% / 8.0% (z 2.8 in batch 1, 0.3 in batch 2; the second batch also
  logs the dice: 8,115 draws, uniform deciles, χ² 12 on 9 df). Uncommons sit under their static d100 share (20.7%)
  because the 4 hero-only uncommons are off the table for most heroes; start rolls drop cursed.
- At run end the policy has kept almost no cursed Blessings (9 of 790 living heroes in batch 1): it replaces the
  weakest (cursed first). Held at the end: common 41.5%, uncommon 39.1%, rare 16.5%, legendary 2.7%, cursed 0.3%.

**Tests added** (`tests/passive_tests.js`):
- `passives: integration — role instances marked "this fight only", long names break with a hyphen`.
- `passives: integration — whole AutoPlay runs with the real table (every roll and resolution audited)`: 2 seeded whole
  runs (`&n=` for more); fails on an illegal roll / resolution / slot list or a warning that mentions a Blessing, logs
  other areas' warnings; skips without the real table and heroes. About 2 s.

**Requests**
- **Lead (design)**: with 79 entries an owned Blessing comes up on about 1 roll in 15 even with 4 slots full, so
  upgrades are 4.5% of resolutions and 0.5% of held Blessings reach III. If upgrades should matter, one option is to
  weigh owned-below-max entries ×3 on the d100 (the slices stay exact; about 3× the upgrades). Not changed: §9.6 says
  the table is weighted by `weight`.
- **Map screen owner** (unchanged): a line about the Session Zero quirks on the act-1 intro.
