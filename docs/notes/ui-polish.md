# UI POLISH — notes

Role files: `js/ui/**` (screens, `ui.js`, `combat_hud.js`), `css/style.css`, `js/main.js`, `js/run/run.js` and
`js/run/rewards.js` (event API / narration callers only), `tests/ui_tests.js`, `tests/hud_tests.js`, `tests/run_tests.js`.
Brief: content-digest §5 "HUD / META-UI / META-RUN", §7 and the passives' open UI issues.
Run: `bash tools/test.sh "suite=hud:,ui:,run: event"`.

This pass was resumed after the first attempt was killed (machine out of memory). The first attempt had already
landed the sheet-unit skill descriptions and the cost pills in `ui.js` (+ the screens passing RunHeroes to skill cards
and the CSS for the pills); everything else below is from the resumed pass. Screenshots run one Chrome at a time
(`tools/shot.sh`, scratch scenes in `.tmp/uipolish/`).

## Summary

- **Aura threats** (shared definition: enemy def hooks or a status on it, `hooks.threatAt(enemy, unit, tile, extra) →
  number | { dmg, label, ignoreBlock }`, read with `DD.Hooks.fire('threatAt', enemy, enemy, unit, tile)`, throws /
  undefined = 0). Works with the real hooks the AutoPlay pass added to Dr. Iris (`iris_gaze`, "Clinical Gaze") and
  Lich-tenstein (`lich_late_fees`, "Late Fees interest", ignores Block):
  - party cards: `⚠ Clinical Gaze: 8 next turn` (`⚠ 2 auras: 13 next turn` for several; red pulsing + 💀 when it would
    drop the unit — Block soaks only auras that allow it); player phase only; card tooltip lists each aura; summon mini
    cards show a ⚠ marker;
  - move preview (hint bar, the tile the move ends on): `⚠ Ending the turn here: Clinical Gaze 8 next turn.` or, in
    green, `✓ Out of Clinical Gaze here (8 where Zarathor stands).`;
  - inspect panel: a hero lists its auras (`Clinical Gaze (Dr. Iris): 8`, `…, ignores Block`) and no longer claims
    "✓ No telegraphed attack" when an aura hits it; a tile shows `If <hero> ends the turn here` for the selected hero;
    an enemy shows **its def passive** (`passive: { name, desc, icon? }`, desc may be `(unit) => string`) and whom its
    aura hits (`Clinical Gaze (not telegraphed) → Zarathor 8, Marwyn 8`), both above the intents so a boss's three
    intents can't push them out of the panel.
- **DM caption** (narrator lines): sits under the objective, or **low** (above the hint bar) when the top spot would
  cover enemies' intent bubbles (a back-row boss): `placeDm()` scores both spots against unit boxes (an enemy with
  intents weighs 4, other units 1; sizes follow the camera zoom) on every new line, refresh and ~2.5×/s while shown.
  It fades to 14% while the pointer is on a tile / unit under it or the inspect panel sits under it.
- **Blood Price "paid by"**: when the engine's cost (`costOf`) is 0 but the cost without a donor is not, the HUD names
  the payer (nearest Bleeding foe, most stacks on a tie, not invulnerable / charming her): button pill `🩸2` (dark),
  tooltip pill `🩸 −2 HP paid by Goblin Grunt` + `Goblin Grunt pays the 2 HP instead (Bleeding, adjacent).`, aim hint
  `🩸 Goblin Grunt pays the 2 HP`. A hero passive may expose `hpPayer(unit, skill, level)` to answer exactly (Request).
- **Gold pills**: `UI.skillGold` reads gold costs / gains from the exact desc ("Spend 5 gold", "Pay 10 gold" →
  cost; "pockets 2 gold", "gains 8 gold" → gain). Cards and tooltips show `🪙 5 gold` (cost) / `🪙 +2` (gain); HUD
  buttons show `🪙5`, red when the party holds less.
- **Compact summon rows**: a hero with 3+ summons (Release the Corgis, ducks, ravens) gets one `🐾 Ellaria's entourage
  ×10` row of mini cards (portrait, HP sliver, AP count, ⚠ / 💀 / • marker; click = select, hover = highlight,
  tooltip = the unit). If the panel still overflows, every summon group goes compact, then the cards tighten.
  Checked: 4 heroes + 10 corgis + 4 ravens fit at 1024×640 and 1280×720 without scrolling.
- **Narration callers**: `level_up` is the subtitle under "Level Up!" on the level-up screen (DM badge; it stays visible
  above the roll and boon modals; the per-hero step text moved above the lineup); `idle_dm` after 30 s without
  input in the player phase (caption + log; at most once a minute while it stays quiet; any pointer / wheel / key input
  restarts the clock; never during the enemy turn, autoplay, modals or animations).
- **Narration tokens**: `UI.narrate` (first attempt) and now the run layer's `narr()` skip lines with a token the caller
  does not fill; with every line usable the pick is the one `DD.narrate` would make (same single `DD.rng` draw).
- **Event API** (`DD.Run.eventApi`): `api.xp(n, heroIdx)` (one hero; nobody when dead; returns who leveled),
  `api.giveItem({ ..., heroIdx })` (a random item that hero can use, equipped on them when the slot is free, else on
  whoever has room), `api.addScar(idx, scarId)` / `api.removeScar(idx, scarId)` (a dead / missing / scar-less idx falls
  back to a living hero without / with that scar). Old call shapes behave exactly as before.
- **Event choices**: `label` and `hint` may be `(run) => string` (run layer `currentEvent()`, and the event screen for
  stand-alone / older adapters; the picked line repeats the label text).
- **Party screen / out-of-combat text** (first attempt, verified + tested): skill cards and tooltips described through a
  sheet unit (`UI.sheetUnit(rh)`: `Combat.makeHeroUnit` off the board, cached per RunHero until gear / scars /
  Blessings / skills / level / HP change): AP after `modifyCost` (`1 AP ~~2~~`, why in the tooltip: `−1 AP: 🖋️ Cursed:
  Unread Blood Pact`), item-adjusted text (Josiah's Beak Mask +1 Poison). Used by party, level-up, shop tomes, tavern
  training and reward cards.
- **Long Blessing names**: compact cards with 17+ character names use a smaller font and a third line ("Haunted by a
  Ghost Accountant", "Circle of Life (Duck Edition)" now fit in the party screen's slots at 1024×640).
- **Session Zero quirks**: at the start of act 1 the act banner lists each hero's starting Blessing and the map's
  narration box adds a `🎲 Session Zero quirks:` line with an icon chip per hero (full text in the chip tooltips; kept
  to ~2 lines so it never covers the first map nodes). It disappears after the first step.
- **Shop re-roll picker**: cards wear their rarity (border, side stripe, background, badge and label colour) and keep
  hotkeys past 9 (`1-9, 0, A-F` for a full party of 16; `UI.choice` uses `UI.PICK_KEYS`).
- **Level-up modals**: the roll and boon modals start below the title + DM subtitle (`--lu-clear`, 7.4rem; 6.75rem at
  ≤ 760px tall) and are capped to the room left, so the subtitle is never covered (the tallest upgrade card scrolls its
  body a little at 1366×657; the actions stay visible).
- **Party select**: the art gives way first (it shrinks to the row height, its faded feet tucked under the name), names
  over 12 characters use a smaller font, roles / unlock hints clamp at 3 lines and the complexity stars moved to the
  card's top-left corner. Checked at 1024×640, 1280×720 (locked + unlocked), 1600×900, 1920×1080: nothing clips.
- Small: "1 attack land**s** here" grammar in the move hint.

## Changes (by file)

- `js/ui/combat_hud.js`: `auraThreats / auraTotal / auraLethal / auraLine / auraDetail / cardAuras`, `hpPayer`, party card
  `.hc-threat`, mini cards (`makeMini / updateMini / bindCard`, `renderParty` groups + overflow fallback), slot model
  `payer / listedHp / goldCost` + button pills, skill tooltip `paidBy / paidWhy`, aim-hint payer, move-hint auras,
  inspect sections (hero auras, tile auras for the selected hero, enemy passive + aura), `placeDm / unitBoxes /
  coverCost / updateDmPeek`, idle DM (`noteInput / idleCheck`, window input listeners added on mount and removed on
  unmount), CSS for all of it. `DD.HUD` gained `auraThreats(unit, x?, y?)`, `hpPayer(unit, skillId, level)`,
  `idleCheck(at)`, `idleSince()`, `dmPlace()`, `placeDm()`.
- `js/ui/ui.js` (first attempt + this pass): `sheetUnit / describer`, `skillCostNotes`, `skillGold`, cost pills, `UI.narrate`
  token skipping, `PICK_KEYS` in `UI.choice` (+ option `cls / style / hotkey`), long-name class on `passiveCard`.
- `js/ui/screens/levelup.js`: `level_up` subtitle, `.lu-bottom` (step text + lineup); `party.js`, `shop.js`,
  `tavern.js`, `rewards.js`: RunHero described skill cards (first attempt); `shop.js`: re-roll picker rarity classes;
  `map.js`: Session Zero quirks (banner + narration box); `event.js`: function labels / hints; `party_select.js`: long
  name class.
- `js/run/run.js`: `tokensFilled` + token-safe `narr()`, `choiceText` (function labels / hints in `currentEvent`),
  event API `xp / giveItem / addScar / removeScar` extensions.
- `css/style.css`: pills (first attempt), level-up layout + `--lu-clear`, party-select card layout, long Blessing names,
  re-roll picker rarity styles, Session Zero quirk line and banner.
- Tests: `tests/hud_tests.js` +6 suites (`hud: aura threats …`, `hud: Blood Price donor …`, `hud: gold pills …`, `hud: summon
  packs …`, `hud: the idle DM …`, `hud: the DM caption …`); `tests/ui_tests.js` +6 (`ui: out-of-combat skill text …`,
  `ui: shop re-roll picker …`, `ui: the level-up subtitle …`, `ui: event choices accept …`, `ui: the act-1 map …`,
  `ui: UI.narrate skips …`); `tests/run_tests.js` +2 (`run: event API — xp(n, heroIdx) …`, `run: event choices with
  function labels …`). Suites that need real content (Sparrow, Zarathor, the Blessing table, Josiah's mask) skip without it.

## Deviations

- ARCHITECTURE §9.5: `api.xp(n, heroIdx?)`, `api.giveItem({ ..., heroIdx })`, `api.addScar(heroIdx?, scarId?)`,
  `api.removeScar(heroIdx?, scarId?)` extend the listed signatures (backwards compatible). §3.9: choice `label` / `hint`
  may be functions of the run.
- §8.3: the DM caption moves between two spots and fades under the pointer; the idle DM writes a narrator line into
  the HUD log only (not into `state.log`).
- The Blood Price payer is re-derived in the HUD (sparrow.js keeps `donorFor` private); see Requests.
- Out-of-combat skill text and costs use a stand-in combat unit (`UI.sheetUnit`): it takes a unit id from `U.uid` and
  runs `modifyCost` / `desc` hooks outside a fight (hooks that read `DD.Combat.state` see the last fight, or none).

## Requests

- **hero-sparrow**: expose the donor search, e.g. `passive.hpPayer(unit, skill, level) → unit | null` (the HUD calls it
  first when present), so "paid by" never drifts from `donorFor` (range 3 with the Organ Donor Card, charm, stealth…).
- **RULES**: `DD.Act.narrate` passes engine vars but still picks lines whose tokens it does not fill (`combat_start`,
  `enemy_turn`, … are called with `{}`); the same `tokensFilled` filter as `UI.narrate` / the run layer would let authors
  use tokens on every key.
- **Lead**: same for core `DD.narrate` (or document that callers filter); fold the event-API / choice-function
  extensions above into ARCHITECTURE §3.9 / §9.5, and the `threatAt` shape (`{ dmg, label, ignoreBlock }`) into §3.6/§5.3.
- **Narrative**: `level_up` now shows on every level-up screen visit and `idle_dm` after 30 s idle; both keys stay
  token-free. Function labels / hints work; the narrative tests that assert string labels would need to accept them.
- **Content (enemies / bosses)**: `passive: { name, desc, icon? }` on an enemy def now shows in the inspect panel
  (desc may be `(unit) => string`); `threatAt` labels should be short ("Clinical Gaze"), they go on party cards.
- **HUD (optional, not done)**: `DD.Render.hudMargins` could follow the real panel sizes; today's defaults still fit.

## Known issues

- The caption placement and the summon overflow check use live layout; headless tests cover the decision with a stubbed
  `worldToScreen` and a forced panel height, the real behaviour was checked in screenshots (Dr. Iris, the DM, corgis).
- Bubble boxes are estimates (sprite height by tier and zoom); a very tall custom sprite may still peek under the caption.
- `idle_dm` is only spoken in fights (the map and other screens have no idle line).
- At 1366×657 the tallest upgrade roll card scrolls its body by ~15px (actions stay visible).
- Full run at the end of this pass: 552 suites, 80,387 assertions, 16 failures in 13 sections — all AutoPlay / boss sim
  thresholds and one engine status-flag suite that the AutoPlay, balance and rules passes are rewriting in parallel
  (`js/engine/*`, boss files); no swallowed `Error in`. Every `ui:`, `hud:`, `run:` and `passives:` suite passes
  (81 suites, 1,831 assertions).
