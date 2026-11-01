# HUD + INTEGRATION — notes

> **v2 (initiative, no telegraphs, no Guard): see `docs/notes/hud-v2.md`.** This file describes the v1 HUD; its Guard
> preview, telegraph / intent bubbles, side-based "Your Turn / Enemy Turn" phases and deployment-by-first-action parts
> are superseded.

Files: `js/ui/combat_hud.js` (the `combat` screen), `tests/hud_tests.js` (suites `hud: …`, 13 suites).
Run: `bash tools/test.sh "suite=hud:"`.

## Summary

- **Combat HUD** (`js/ui/combat_hud.js`, ARCHITECTURE §8.3) — DOM panels over the canvas, sized to sit inside the
  renderer's HUD margins (left 230 / bottom 250 / top 60 px) from 1024×640 to 1920×1080 (rem-based, root font scales):
  - **Top bar**: round number + phase pill (Your Turn / Enemy Turn (pulsing) / Deployment / Autoplay / Victory /
    Defeat), encounter name · fight kind · difficulty, objective with an icon per type + MAPGEN's joke
    (`objective.flavor`) as a subtitle, chips for active rules (`state.rules`, turns left in the tooltip) and incoming
    reinforcements ("Reinforcements in 2 rounds", enemy list + spawn edge in the tooltip), autoplay badge (click to
    stop), animation-speed cycle button, Menu. A DM caption under the objective shows each narrator line as it is
    revealed.
  - **Party panel**: one card per hero with its summons indented under it; portrait in the hero colour, name, level,
    HP bar with a striped Block segment that follows `unit.vis` (bars move with the hit animations, not before),
    AP pips, move, status chips with tooltips, Downed / Stunned / Asleep / Frozen / Sheep tags, spent heroes dimmed.
    Click = select (+30% chance of a `select` bark via `DD.FXRender.bark`, no FX-queue entry), hover = highlights the
    unit on the board, tooltip = stats, passive, items, scars.
  - **Action bar**: header tab with the selected unit (AP, move, Rooted / Stunned / Silenced / Sheep warnings, passive
    tooltip). Heroes always show 6 positions so muscle memory holds: 1 basic, 2-5 sockets (dashed "Empty socket"
    placeholders), 6 signature. Each button: emoji icon on a kind-coloured tile, name (2 lines), AP gem (green when a
    `modifyCost` hook makes it free), HP cost, charges left, level pips, cooldown overlay ("⟳2" over the icon, the
    name stays readable), hotkey.
    Disabled buttons stay hoverable; the tooltip leads with the `canUse` reason ("⛔ Needs 100 Hype.") or "✓ Ready",
    then `DD.UI.skillTooltipHtml`. The signature fills with Hype and pulses/glows at 100. Consumable pockets 7-0
    (party inventory, empty pockets shown, rare ones glow), interaction buttons (Help Up / Smash / object label, E).
    Hovering a skill shows its valid targets on the board.
  - **End cluster**: Hype meter (tooltip explains the sources), Undo (Z, disabled unless `canUndo`), End Turn (Space)
    with the live Guard preview ("Guard +6 🛡", per-hero breakdown in the tooltip); glows when nobody has AP left.
  - **Inspect panel** (hover, or click an enemy to pin it): portrait, tier / boss title / act, turn order "#2", HP
    bar (live), armor, move, flying / immovable / stun-immune, resist & weakness pills, statuses, every intent via
    `DD.AI.describe` (icon, label, damage, ⏳ delay, anchor explanation, dazzled / taunted / silenced notes), codex
    `desc`. For heroes: "⚠ Will be hit by …" (tile threats + tracking shots aimed at them) or "✓ No telegraphed
    attack", passive, blurb. For notable tiles: terrain + elevation + desc, surface with rounds left (or permanent),
    object with HP / interaction, telegraphs landing there. It parks in the top-left or top-right corner, whichever
    covers fewer units (the inspected one weighs 6×); hovering it focuses that enemy's telegraph.
  - **Combat log** (top right, foldable, fold state remembered): lines coloured by `cls`, "Round N" dividers, DM badge
    on narrator lines. Lines are revealed **in step with FX playback** (each `combat:log` entry remembers the last
    queued FX id and appears when playback reaches it), so the enemy turn is not spoiled before it animates.
  - **Hint bar** above the action bar: targeting instructions + preview summary ("Hits 2 foes for 11 · 💀 1 KO ·
    ⚠ hits 1 ally! · +12 Hype · 💥 Explosive Barrel"), deployment instructions, move cost, hazard path warning ("⚠ The
    path crosses Fire"), "telegraphed: 2 attacks land here (≈11 dmg)", edge warnings, out-of-AP advice, and transient
    error explanations (out of range, no line of sight, straight lines only, rooted, too far, empty socket…).
  - **Ribbons**: Your Turn / Deployment / Enemy Turn (non-blocking DOM ribbons — they never lock input), Victory /
    TPK at the end.
- **Overlay** (`DD.Render.overlay`, rewritten on every hover/mode/state change): `selectedId`, `hover`, move tiles
  (deploy tiles excluded and shown green while deploying), path + `pathHazard` from `reachable().hazard`,
  `targetTiles`, `areaTiles` and `previews` from `DD.Combat.preview` (consumables via `DD.Targeting.preview`),
  `interactTiles`, `focusIntentUnitId`. Preview badges carry the full hit (`dmg + blocked`, the renderer splits the bar
  into Block and HP loss) and a compact text: `?` (random), `+N🛡`, status icons, `↷` (moved). Dir skills aim at the
  adjacent tile toward the cursor; self skills preview immediately and fire on a second press / click.
- **Input**: `input:tileHover` / `input:tileClick` / `input:rightClick` from DD.Input; keys through the screen's
  `onKey` (consumed before DD.Input, so WASD / F / wheel stay camera controls). Click a hero = select, enemy = pin,
  reachable tile = move, interactable = interact, downed ally = Help Up, green tile = free redeploy, Shift-click an
  ally = deploy swap. Locks: FX busy (Space then **skips** the animations via `DD.FX.flush`), enemy playback, autoplay,
  fight over. A 380 ms grace period after control returns swallows a double-clicked End Turn. A spent hero hands the
  selection to the next hero with AP.
- **End of fight**: when `state.result` is set and the FX are idle, a Victory / TPK ribbon shows, then after ~2.6 s
  (÷ animation speed, 0.9 s under autoplay; a click / Space / Enter skips) the result goes to
  `DD.Run.finishCombat(result, state)` for run fights (→ rewards / act clear / game over / final victory, all screens
  of the run layer), or a result modal (rounds, kills, damage dealt / taken, healing, Hype; Restart Fight → 
  `DD.Main.restartCombat()`, Title) for debug fights.
- **Menu** (Esc / ☰): animation speed, sound, screen shake, controls list; runs: Quit to Title (Continue resumes the
  running fight; a reload restarts it from the save) and Abandon Run (confirm); debug: Restart Fight, Title.
- **Comedy**: End Turn tooltips ("Pass the Cheetos…"), empty pockets ("Contains: lint, one (1) d4."), ribbons ("read
  the red tiles, then make bad decisions"), pause title ("the DM refills his soda"), TPK subtitle, result lines.
- **Robustness**: every engine/content call goes through `DD.safe`; a skill whose `desc` / `canUse` / `execute` throw
  is contained (tested); no fight → a "No fight in progress" panel with a Title button; the HUD re-adopts a new
  combat state (`combat:start`) and a remounted one (Quit to Title → Continue).

## Public API (beyond the contract)

`DD.HUD` (same code paths as mouse/keyboard; used by `tests/hud_tests.js` and handy in the console):
`mounted() · selected() · mode() · lock() · select(id) · cycle(dir) · pressSlot(pos) · pressConsumable(i) · hover(x, y)
· click(x, y, { shift }) · rightClick() · key(key, { shiftKey, repeat }) · endTurn() · undo() · interact(i) · refresh()
· tick() · hint() · root() · els() · endPending() · skipEnd() · openMenu()`.
Extra keys beyond §8.3: 7-0 consumables, E interact, Enter confirms an armed skill at the hovered target, Space skips
animations while they play. The HUD injects its own stylesheet (`<style id="dd-hud-css">`, classes `hud-*`) so it
stays inside its own file.

## Integration — what I fixed or added outside my file

1. `tests/manifest.js` (lead): added `tests/hud_tests.js`.
2. `js/engine/combat.js` (RULES, request from RENDER-SPRITES): units now start facing (screen x) their nearest foe
   (`faceNearestFoes` in `Combat.start`). Cosmetic only — `lastDir` is untouched, so no gameplay or test changes.
3. `docs/ARCHITECTURE.md` (lead): documented what the code settled on and the next phase (content) needs: the
   `modifyStatus(s)` hook (§5.3), interaction `kind` incl. Smash and the HUD helpers `slotsOf / costOf / consumables /
   canUseConsumable` (§5.5), the HUD key map + `DD.HUD` (§8.3), and the run-flow functions the screens use (§9.2).
   These fulfil the RULES and META-RUN "Lead:" requests; nothing that existed was changed.
4. `.claude/launch.json` (tooling, not game code): a `dd-static` config (PowerShell `HttpListener` serving the folder
   on http://localhost:8765, inline `-Command`, no script file) so the desktop app's browser pane can run the game —
   the pane cannot execute file:// pages. Delete it if unwanted; nothing in the game uses it.
- Requests answered on my side: RULES (slots, costs, canUse reasons, previews incl. `objects/spawned/uncertain`,
  hazard paths, interaction kinds, `AI.describe`, `deployMove`, objective text), MAPGEN (`objective.flavor` subtitle,
  permanent surfaces shown as "permanent"), RENDER-WORLD (overlay re-written in place, previews keyed by unit id,
  `tileClick` for actions, `focusIntentUnitId` on hover/inspect), META-UI (UI.button / modal / tooltip / statusChip /
  meter / skillTooltipHtml / consumableTooltipHtml / portrait reused; `DD.Main.restartCombat`), META-RUN
  (`DD.Run.finishCombat` after FX idle — falls back to `DD.Run.resume()` if the run already resolved it).

## Verification done

- `bash tools/test.sh`: SUMMARY: PASS — 106 suites, 5861 assertions, 0 failures (13 `hud:` suites / 148 assertions).
- Real browser (desktop browser pane via the local server): title → party select → act map → combat (HUD) →
  autoplay victory → rewards → level-up (4 heroes) → map → event → combats → tavern → act-1 boss → act clear →
  act 2 (elite, boss) → act 3 (shop, elite, final boss) → final victory recorded in Meta (16 fights, 3 bosses, all
  unlocks), then a Brutal run → forced TPK → game over; Quit to Title → Continue (same fight resumed), page reload →
  Continue (fight relaunched from the save) → rewards; debug fight → Defeat modal → Restart Fight. No uncaught errors,
  no swallowed `Error in` warnings.
- Headless captures (`tools/shot.sh` + a scratch scenario page in `.tmp/hud_scene.*`) at 1024×640, 1280×720,
  1920×1080: deployment, skill aiming with damage + friendly-fire previews, directional aim, inspect (enemy, boss with
  a delayed ⏳ intent, chest), enemy turn mid-animation (Guard Block, status texts), a hit frozen mid-animation
  (floating "4", lunge, skill-name popups, bark), victory ribbon + barks, result modal (`?autoplay=1` runs to it),
  pause menu, tooltips (skill ready, signature needs Hype, End Turn Guard breakdown, party card), boss arena with
  telegraphs (red hatch + amber delayed tiles) and intent bubbles, act-clear screen over the battlefield.

## Deviations

- Turn banners are non-blocking DOM ribbons instead of `DD.FX.banner` (a blocking banner every round would lock
  input for ~1 s per turn). Engine banners (boss intro, wild magic, reinforcements) are unchanged.
- The combat log reveals lines in step with FX playback rather than when they are logged (state.log is unchanged).
- Space during animations skips them (`DD.FX.flush`) instead of being ignored; it never ends the turn while busy.
- Hero action positions are fixed (basic / 4 sockets / signature = 1-6) even with fewer than 4 skills socketed.

## Requests

- **Content authors**: the HUD shows `skill.icon` (one emoji), `name` (fits ~2 short lines), `kind` (tile colour),
  `levels` (pips), `charges`, `cooldown`, `hpCost`, `hype`; enemy panels show `desc`, `boss.title`, `resist`,
  `flags`; party cards show `hero.color`, `passive`, `blurb`. Narration keys `combat_start / victory / defeat /
  round_start / enemy_turn / signature …` appear in the log and the DM caption — the more the better.
- **RENDER-WORLD (optional)**: a public way to set the HUD margins (`DD.Render.hudMargins = {…}`) would let `fitMap`
  follow the real panel sizes on very large or very small screens; the defaults fit today's layout.

## Known issues (most severe first)

1. Real heroes / enemies / items / events / narration have not landed: everything was exercised with
   `tests/fixtures.js`. Long real skill names wrap to 2 lines and are clipped after that (full name in the tooltip).
2. In a hidden desktop pane or a background tab the browser pauses `requestAnimationFrame`, so the renderer and FX
   playback pause too and the HUD waits (input stays locked while FX are queued). Normal browser behaviour; the game
   resumes when visible.
3. The inspect panel can still cover a few board tiles on maps that fill both upper corners (it picks the corner that
   hides fewer units); it only shows while hovering / pinned.
4. Ribbons use CSS animations: under the headless `.static-ui` rule (screenshots) they end instantly, so turn
   ribbons don't appear in `tools/shot.sh` captures; the end-of-fight ribbon does.
5. Mouse + keyboard only (no touch / gamepad), same as the rest of the UI.

## Integration changes (by the integrator — details in docs/notes/content-digest.md §6)

- Party gold chip (🪙 `.hud-gold`) next to the Hype meter, refreshed with the end cluster (Drip Check, Bribe, Fines,
  Grimble's Levy). Test: `integration: the combat HUD shows the party gold …`.
- End-of-fight ribbon: a defeat with heroes standing reads "Objective Failed" (not "TPK"); the run layer then shows the
  "Objective Failed" rewards step instead of game over.
