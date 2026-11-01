# META-UI — notes

Owner files: `js/ui/ui.js`, `js/ui/screens/{title,party_select,map,rewards,levelup,event,shop,tavern,party,gameover,settings,hall}.js`,
`css/style.css`, `js/main.js`, `index.html`, `tests/ui_tests.js`.

## Summary

- **DD.UI framework** (`js/ui/ui.js`, ARCHITECTURE §8.1): screen registry + `show/back/refresh/update`, `el`, buttons with
  hotkeys (consumed before DD.Input sees them; blocked under modals), stacked modals (Esc closes the top closable one,
  Enter clicks the primary button, game keys are blocked while a modal is open), `choice` (number-key options),
  `confirm` → Promise, toasts, edge-aware tooltips (flip + clamp; hide when the anchor disappears), and shared views:
  skill / item / consumable / status / scar / hero / enemy tooltips and cards (all numbers: AP, HP cost, cooldown,
  charges, Hype, range, area, LOS, level I/II/III pips, next-level text, flavor), portraits (DD.Sprites, guarded,
  transparent background inside a gold ring), HP / XP bars, gold text, meter, AP pips, run status bar, hero rows,
  consumable slots and the "forget a skill" picker.
- **Theme** (`css/style.css`): dark tavern wood with gold trim + parchment panels, Cinzel / Cinzel Decorative display
  type and Signika body type (Google Fonts with Georgia / Segoe UI fallbacks), rarity + status colors, styled scrollbars,
  responsive from 1024×640 to 1920×1080 (root font scales with the viewport). `#ui` never takes pointer events itself.
- **Screens**: title (renderer campfire diorama behind it when available, rotating taglines, Continue only with a
  save), partySelect (8-card roster with locked silhouettes + unlock hints, details panel, 4 seats, difficulty,
  Roll for Party, remembers the last party), map (left→right act map from `node.x` hints, curved links, party token,
  reachable pulses, tooltips, legend, DM line, act banner, Level Up! call-to-action when choices are pending), rewards
  (gold/XP, per-hero XP bars, casualties with new scars, comedic MVP from the fight's stats, pick 1 of 3, skip),
  levelup (per-hero 3-choice modal, multi-level, forget picker, then queued skill learns), event (parchment page,
  requirements, outcome + change chips), shop (keeper sprite + narrated quips, wares, tomes with forget picker,
  services), tavern (rest / train / recruit), party (hero tabs, sheet, sockets, gear, stash, consumables), gameover
  (TPK, killer, tombstones with epitaphs, stats, unlock progress), victory (act-clear interstitial and final victory,
  confetti), settings, hall (records, heroes, codex, history).
- **Run integration**: screens use META-RUN's flow API — `DD.Run.next()` after rewards / shop / tavern / events,
  `currentEvent/chooseEventOption`, `shop/buy`, `tavern/tavernRest/Train/Recruit`, `takeReward` via `DD.Rewards.apply`,
  `skipRewards`, `levelQueue/levelUpChoices/applyLevelChoice/pendingLearns/resolveLearn`, `resume()`.
- **main.js** (§10.1): boot, settings → FX speed / audio, renderer + input, all debug params, autoplay driver,
  `window.DDdbg` helpers (`DDdbg.help()`).
- **Tests** (`tests/ui_tests.js`, prefix `ui:`): 9 suites — framework, modals/Esc/toasts, tooltip placement, views over
  all registered content, every screen without a run, every screen with a run, and three flow suites (map travel →
  event, rewards pick → level-up, event / shop / tavern / party equip, defeat + victory end screens). Run-based suites
  use the real registries when they are complete enough, otherwise a swapped-in `ui_` sandbox (restored in `finally`).

## Public API (beyond the contract)

`DD.UI`:
- `screen(id, def)` — def also accepts `scene` (DD.Render scene set before mount), `cls`, `history: false`,
  `onKey(e, root, params)` (return true to consume), `update(root, params, reason)` (called on `run:changed` / `run:gold`).
- `show(id, params, { noHistory })`, `back(fallback)`, `refresh(extraParams)`, `update()`, `goNext(next)`
  (`'screenId' | { id, params } | fn`), `resumeRun()`, `currentRoot()`, `clearHistory()`.
- `button(label, onClick, { cls, disabled, tooltip, hotkey, icon, sub, sound, showKey, hoverSound, onDisabled })`,
  `setDisabled(btn, on)`, `isDisabled(btn)`, `bindHotkey(node, key)`, `keyLabel(key)`.
  Button classes: `primary`, `danger`, `ghost`, `danger-ghost`, `small`, `big`, `block`, `icon-only`, `seg`, `tab`.
- `modal({ ..., size: 'sm'|'md'|'lg'|'xl', icon, cls, onClose(reason), backdropClose })` — buttons accept `primary`,
  `cancel`, `hotkey`, `disabled`, `tooltip`, `close: false`; `onClick` returning `false` keeps it open.
  `alert(title, body, opts)`, `topModal()`, `modalCount()`, `closeAllModals(reason)`.
  `choice({ title, text, icon, options: [{ label, desc, icon, content (Node), badge, tooltip, disabled, reason,
  onPick }], cancelLabel, onCancel, closable, size })`, `confirm(text, { title, yes, no, danger, icon })`.
- `toast(text, { cls: 'good'|'bad'|'gold'|'bark', ms, icon, html })`.
- `tooltip(node, content, { pos: 'top'|'bottom'|'left'|'right', delay, cls })`,
  `showTooltip(content, rectOrPoint, opts)` (canvas-anchored tooltips for the HUD), `hideTooltip()`.
- Views: `skillInfo(id, level, unit)`, `skillTooltipHtml(id, level, unit, { showNext, slot, role, cdLeft })`,
  `skillCard(id, level, { unit, compact, onClick, selected, disabled, badge, showNext, role: 'basic'|'signature',
  hotkey, tooltip, cls, cdLeft, tipPos })`, `itemCard(id, { onClick, price, compact, equipped, disabled, badge,
  action, tipPos })`, `itemTooltipHtml(id, { price, equippedBy })`, `consumableCard/consumableTooltipHtml`,
  `statusTooltipHtml(st)`, `statusChip(st)`, `scarTooltipHtml/scarChip`, `heroTooltipHtml(id, { locked })`,
  `enemyTooltipHtml(id)`, `statLines(stats)`.
- `portrait(x, size, { dead, locked, frame, fallback, cls, spriteOpts })`, `hpBar(cur, max, { block, small, big,
  text, label, dead, deadText })`, `xpBar(runHero, { small, text })`, `xpProgress(runHero)`, `xpForLevel(level)`,
  `meter(value, max, { label, color })`, `apPips(cur, max)`, `goldText(n, { big })`, `goldHtml(n)`,
  `stars(n, max)`, `pips(n, max)`, `narration(text)`, `header(title, sub, right)`, `heroMini(runHero, idx, opts)`,
  `runBar()`, `consumableSlots({ small, onClick })`, `chooseSkillSlot(heroIdx, skillId, opts, cb)`.
- Data helpers: `run()`, `meta()`, `settings()`, `heroDef(x)`, `heroName(x)`, `anyDef(x)`, `heroIds()` (display order;
  `test_` fixtures hidden once 4 real heroes exist), `isUnlocked(id)`, `unlockHint(def)`, `heroStats(rh)`,
  `narrate(key, vars, fallbackLines)`, `sound(name)`, `esc`, `signed`, `pct`, `ago`, `duration`.
- Constants: `ACTS`, `NODE_TYPES`, `DIFFICULTIES`, `RARITY`, `SLOTS`, `HERO_ORDER`, `MAX_LEVEL`.

Reusable CSS for the HUD: `.panel` (`.slim`), `.parchment`, `.btn*`, `.kbd`, `.pill` (`.ap`, `.hype`, `.hpcost`, `.cd`,
`.charges`, `.cdleft`), `.chip`, `.status-chip`, `.scar-chip`, `.hpbar`, `.xpbar`, `.meter` (`--mc` color), `.ap-pips`,
`.log-line.{dmg,heal,status,kill,narrator,system,enemy,hero}`, `.narration`, `.dm-badge`, `.skill-card(.compact)`,
`.item-card`, `.portrait`, `.gold-text`, `.lvl-badge`, `.segmented`, `.toggle`, `.scroll`.

`DD.Main` (main.js, not in tests): `applySettings()`, `startDebugCombat(opts)`, `restartCombat()` (for the HUD's
no-run result modal), `debugRun()`, `debugRewards(kind)`, `makeRunHero(id, level)`, `startAutoplay()/stopAutoplay()`,
`speedMult`, `lastCombat`, `lastResult`. Extra debug params: `difficulty=`, `gold=`, `final=1` (victory),
`static=1` (no entrance animations; automatic in headless Chrome).

## Deviations

- The `victory` screen lives in `js/ui/screens/gameover.js` (the manifest has no separate file; I may not edit it).
- Run flow is driven by META-RUN's richer API (`DD.Run.next`, `currentEvent`, `buy`, `tavernRest`, …) rather than
  the screens re-implementing rules; every call is guarded so the UI degrades without it.
- Level-ups are non-blocking in META-RUN (`RunHero.pendingLevels`): the map shows a pulsing **Level Up!** button and the
  rewards → `DD.Run.next()` flow opens the level-up screen automatically.
- Boss rewards (`data.actClear`) show the act-clear interstitial (`victory` with `{ act, unlocked, healed, text }`)
  before `DD.Run.next()`; the final victory comes from `DD.Run.endRun` as `victory { summary }`.
- In headless Chrome the CSS animation timeline barely advances, so main.js adds `.static-ui` (no entrance
  animations) to make `tools/shot.sh` captures show the settled UI. Real browsers animate normally.
- `UI.show('combat')` without a registered HUD still switches the renderer to the combat scene (and warns).
- Portraits are `<img>` elements fed by `DD.Sprites.portraitURL` (cached data URL, `bg: false`), falling back to a
  canvas copy of `DD.Sprites.portrait`; the gold ring / silhouette / grayscale come from CSS.
- Screens using the renderer: title → `title` scene (campfire diorama; the menu moves to a left column), every other
  full screen → `none`; rewards / level-up / end screens keep whatever was behind them (the finished fight).
- Debug combats pass `&difficulty=` to `DD.Combat.start` (MAPGEN noted brutal HP/damage was missing there).
- Autoplay: when no `combat` screen (HUD) is registered, the driver hands a finished run fight back with
  `DD.Run.finishCombat` so `?screen=map&autoplay=1` keeps flowing.

## Requests

- (HUD) Reuse `DD.UI.button` / `modal` / `tooltip` / `showTooltip` / `skillCard(compact)` / `statusChip` / `hpBar` /
  `meter` / `apPips` and the CSS classes above; the HUD's no-run result modal can call `DD.Main.restartCombat()`.
- (HUD) For runs, call `DD.Run.finishCombat(result, state)` after FX are idle (ARCHITECTURE §8.3) — the rewards /
  gameover / victory screens are then shown by the run layer.

## Known issues

- The combat HUD (`combat` screen) had not landed: `screen=combat` shows the battlefield with no controls (a
  "UI.show: unknown screen" warning) until it does. Verified headlessly: debug combat + autoplay reach victory, and a
  real run goes map → fight (autoplay) → rewards → level-up modals → map.
- Real heroes / items / consumables / events / enemies had not landed. Screens were checked with `tests/fixtures.js`
  heroes, the `ui_` test sandbox and a scratch preview page; the hall codex and party select will fill in with content.
- The gallery (`js/render/gallery.js`) had not landed; `screen=gallery` calls `DD.Gallery.show|open|start(which)` if
  present, sets the `gallery` scene and shows a small label + Title button.
- Headless captures: tooltips are hidden by the capture tool's late window resize (resizing hides tooltips by design),
  so `tools/shot.sh` cannot show a hovered tooltip; they were checked with a scratch page (`.tmp/preview/scenario.html`).
- Mouse + keyboard only (no touch / gamepad layouts).
