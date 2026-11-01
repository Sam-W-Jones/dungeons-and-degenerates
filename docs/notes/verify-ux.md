# VERIFY-UX — notes

Adversarial playtest + fixes of the player experience. Scope: `js/ui/*`, `js/render/*`, `js/run/*`, `js/main.js`,
`css/style.css`, `index.html`, tests in `tests/{ui_tests,run_tests,render_tests,sprite_tests}.js`.
Engine files (`js/engine/*`, engine data) were not touched (another reviewer owns them now).

## Summary

How it was played (real content had not landed, so everything ran on `tests/fixtures.js`):
- **Browser pane** (`http://localhost:8765/index.html?debug=1&fixtures=1`, the file:// URL is mapped there): title → party
  select → map → fights → rewards → level-ups → reload mid level-up → Continue → second fight → menu → Quit to Title →
  Continue; tavern recruit; party screen equip / unequip / discard; DOM/JS-driven inputs during own and enemy FX. The pane
  window was covered all session (no screenshots, `requestAnimationFrame` paused), so clicks went through DOM `click()` /
  `DD.HUD` (the same code paths as mouse and keys) with a timer pumping `DD.Render.drawFrame`.
- **Headless scenario driver** (`.tmp/vux/scene.html` + `scene.js`, runner `.tmp/vux/vux.sh shot|dom`): scripted
  steps + screenshots at 1280×720 and 1600×900 of every screen, crowded fights, aiming, inspect, enemy turn, long-name /
  many-status stress (`VUX_LONGIFY`).
- **Soak**: a whole campaign (3 acts, ~20 nodes, final victory) driven only through UI clicks + autoplay turns — no errors,
  no stuck screens. **Reload soak**: 2 × 30 random page reloads + Continue at random points (fights, rewards, victory
  interstitial, level-ups): the run, gold, HP and levels always survived; no reward double-dips.
- **Real-time perf probe** (`.tmp/vux/perf.sh`, headless without virtual time): per-phase frame cost of crowded fights.

Found and fixed (most severe first):
1. **Soft-lock: a fight could never end.** One FX event with a bad duration (NaN / Infinity / negative / non-number, e.g.
   from content) kept `DD.FX.busy()` true forever; when the fight was already won, Space did nothing (`lock === 'over'`
   was checked before `busy`) and the hand-off to rewards never happened. Fixes: the renderer repairs bad durations and
   finishes any event still "playing" 6 s past its end (one `DD.warn`), and Space skips animations also after the fight
   ended (the hand-off waits for them). Tests: `render: a broken FX duration never freezes the game`,
   `ui: combat HUD — Space skips the last animations of a finished fight`.
2. **Quit to Title → Continue restarted the running fight** (round 1, full HP — a free re-roll and the opposite of what
   the pause menu promises). The title's Continue reloaded the save over the live run. Now the live run is resumed (the
   fight continues where it was; a fight won during its victory ribbon still hands off to the rewards); only a fresh page
   loads the save. Continue is also offered for the live run when storage is unavailable (private mode / file://
   restrictions). Test: `ui: Continue after Quit to Title resumes the live fight; a fresh page restarts it`.
3. **Unreadable HP bars**: units on neighbouring iso tiles drew their HP bars / numbers / status rows on top of each other
   (a back unit's HP number fully hidden). The renderer now lays the widgets out like the intent bubbles: front units
   keep their spot, a colliding widget rises just above (max 4 rows) with a thin team-coloured leader line; intent
   bubbles and preview badges also avoid other units' HP widgets. `DD.Render.renderTo` returns the boxes (`widgets`).
   Test: `render: HP widgets of crowded units never overlap` (zoom 0.6 / 1 / 1.6).
4. **Invisible click blockers**: the faded-out DM caption under the objective kept `pointer-events: auto` (an invisible
   box over the top of the board swallowing clicks), and the act banner on the map swallowed clicks for ~3 s after it
   was dismissed. Both are click-through now. Test: `ui: no invisible element swallows clicks (screens + combat HUD)`
   (generic scan for effectively invisible, pointer-catching elements).
5. **Frame-time cliff**: the occlusion silhouette pass and buffered (tinted / flashing / translucent) sprites composite
   small offscreen canvases into each other every frame; once Chrome promoted those canvases to the GPU path, a crowded
   fight went from ~1 ms to **40+ ms** per frame for silhouettes alone (reproduced headless and in the pane). The scratch
   canvases are CPU-backed now (`willReadFrequently`): stable ~3.5 ms silhouettes / 6–8 ms per frame over 480 frames.
6. **Browser context menu** opened on any right-click over the UI (right-click = cancel in combat). Suppressed globally
   (text fields excepted); right-click on a HUD panel now cancels targeting / unpins like on the board. Test:
   `ui: right-click never opens the browser menu; on a HUD panel it cancels targeting`.
7. **Enter confirmed destructive dialogs** (`N` then `Enter` on the title abandoned the current campaign; same for
   Abandon Run, Reset Progress, Discard). Danger confirms now default to "keep". Test: `ui: Enter never confirms a
   destructive dialog`.
8. **Shop services hidden below the fold** at 1280×720 and 1600×900 (heal / scar removal needed scrolling). They now sit
   "At the Counter" under the shopkeeper (always visible; the portrait shrinks first when the column is short; the
   description moves to a tooltip on short windows). Gear cards fill the row (`auto-fit`). Test: `ui: shop services sit
   at the counter (no scrolling) and work`.
9. Polish: party-select seat labels were clipped ("Seat Reservea"); Settings → Controls was missing 7–0 consumables, E,
   Enter and +/− zoom; the tavern keeper portrait was clipped at the top on short windows.

Checked and fine (no change needed): every screen at 1280×720 / 1600×900 (title, party select, map, combat, rewards,
level-up, event, shop, tavern, party, settings, hall, game over, act clear, final victory); defeat → game over → title
(no Continue left); event → Fight! → combat, and the queued fight surviving a reload; reload during rewards / level-up /
act clear; tavern recruit; party equip / unequip / restricted items / discard confirm; spam of every combat key during
own and enemy animations; Esc / menu during the victory ribbon; long names + 10 statuses per unit; no console errors or
swallowed `Error in` warnings in any session (one transient engine `ReferenceError` while ai.js was being edited by
its owner, gone a minute later).

## Public API (beyond the contract)

- `DD.Render.renderTo(...)` result has `widgets: [{ id, x0, x1, y0, y1, dy }]` — laid-out HP widget boxes (screen px).
- Renderer internal: FX duration guard (`FX_STALL_MS = 6000`) runs before every `DD.FX.update`.
- `DD.UI.confirm(text, { danger: true })`: Enter / the default button is "no"; the destructive button must be clicked.
- Title: `Continue` resumes `DD.Run.state` when it is live (not over) and only calls `DD.Run.load()` otherwise.

## Deviations

- Renderer mutates `evt.ms` of FX events with invalid or endless durations (repair, not contract behaviour) and warns once.
- `contextmenu` is prevented document-wide (except inputs / textareas / contenteditable).
- Shop services render in the keeper column (`.keeper-services`) instead of a "Services" section of the wares panel.

## Requests

- **Lead (`js/core/fx_core.js`)**: sanitize `ms` in `FX.push` (non-finite / negative → default) so headless tests and
  any non-renderer consumer are protected too; the renderer guard covers the game today.
- **RULES**: none blocking. FYI the reviewer's in-progress `ai.js` briefly threw `protectedObjectScore is not defined`
  inside `Combat.start`; the run layer then skips the fight as a free victory (see Known issues 4).
- **Content authors**: HP widgets now stack in crowds, so huge status lists make tall stacks — keep custom statuses
  meaningful (the row shows 6 + "+N").

## Known issues (ranked)

1. Real heroes / enemies / bosses / items / events / narration had not landed when this pass ended: all play used the
   fixtures (plus synthetic long names). Re-run `.tmp/vux` soaks once content exists.
2. The browser pane was occluded the whole session: no real mouse play and no visible-GPU frame timings; GPU behaviour of
   the CPU-backed scratch canvases is inferred (they are small; uploads are cheap), measured only headless + occluded.
3. A page reload in the middle of a fight restarts it from round 1 (META-RUN design: no mid-fight saves) — a reload is a
   free re-roll of a bad fight. Quit to Title no longer is.
4. If `DD.Combat.start` throws (content/engine bug) the run layer skips the fight and pays it out as a victory (better
   than a stuck screen, but it hides the bug from players; it is logged via `DD.warn`).
5. Combat camera fit uses fixed HUD margins (bottom 250 px): on 1280×720 the board sits at ~0.8 zoom with some unused
   space above the action bar; a measured-margin fit could gain ~15%.
6. Very dense crowds (6+ units in a 3×3 block) can stack HP widgets 3–4 rows high; beyond the 4-row cap a widget may
   overlap again rather than drift away from its unit.
7. Keyboard-only: on non-combat screens a Tab-focused card + Enter triggers the screen's Enter hotkey (e.g. Continue),
   not the focused control.
8. Hover tooltips cannot be captured by `tools/shot.sh` (the capture's resize hides them); they were checked via DOM.
