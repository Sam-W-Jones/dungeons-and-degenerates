# HUD + RENDER v2 — notes

Role: HUD + RENDER V2 (initiative tracker, roll moment, turn flow, wind-ups, threat shading, inspect panel, log).
Files: `js/ui/combat_hud.js`, `js/ui/ui.js` (hero / enemy tooltips: initiative), `js/render/renderer.js`,
`js/render/fx_render.js`, `js/main.js` (combat debug helpers), `tests/hud_tests.js`, `tests/render_tests.js`,
`tests/sprite_tests.js`, ARCHITECTURE §7.2 / §7.4 / §8.3. Built on ENGINE V2 (`docs/notes/rules.md` v2 section,
`docs/notes/v2-migration.md`). Run: `bash tools/test.sh "suite=hud:,render:,sprites:,ui:"`.

## Summary

- **Initiative tracker** (top center, above the objective): portraits in turn order **starting with the unit whose turn
  is on screen** — the rest of the round, a "R n+1" divider, next round's turns up to the acting unit again, plus units
  that joined mid-round (dashed, 🆕, merged in by their roll). The acting portrait is bigger with a glow and a pointer;
  upcoming ones fade with distance; every portrait carries its total; marks: 💀 downed (turn skipped), 💫 / 💤 / 🧊
  stunned-likes, 🐑 sheep, ⏳ winding up. Hover a portrait → the unit is highlighted on the board and its inspect panel
  opens (and hovering a unit on the board lights up its portrait); click → inspect (pin), or select a unit of the acting
  turn. Tooltip: "Initiative 17 (d20 14 +3)", when it acts, why it is skipped. In deployment it lists everyone with "?".
- **Deployment + Roll for Initiative**: deployment is phase `deploy` (round 0). Heroes in the green zone can be selected,
  repositioned and Shift-click swapped for free; skills, consumables and tiles outside the zone explain that the roll
  comes first (no accidental start). A big **🎲 Roll for Initiative!** button sits above the action bar; End Turn reads
  "Roll! / Start the fight"; Space rolls too.
- **The dice moment**: `DD.FXRender.moments.initiative` (new, fx_render) lets the HUD host the engine's `initiative`
  FX marker: the marker blocks playback for the moment (2.7 s + 45 ms per unit at speed 1, scaled by the animation
  speed), the engine's "Roll for initiative!" banner right before it is folded in (no double announcement). A scrim + tray
  shows every unit's card (portrait, name, a tumbling d20 that lands on its roll, "+mod", the total, NAT 20 / NAT 1
  badges), then the cards slide into initiative order with "1st / 2nd …" ranks, the first one glowing, and a DM line (the
  engine's `initiative` narration when NARRATIVE adds lines, else a HUD fallback). Click / Space / Enter / Esc skips. The
  timeline is driven by the marker's progress (`evt.elapsed / evt.ms`), so speed changes, freezes and skips just work.
  Instant FX (tests) / headless: no moment. Log lines logged during the roll are held until after it (no spoilers).
- **Turn flow**: the phase pill + round box say whose turn is on screen ("👹 Enemy Turn · Goblin Grunt #2/8"). During a
  hero turn only that hero and the summons acting on its turn can be selected; Tab cycles them ("Only Zarathor acts this
  turn" otherwise); clicking another hero's card, portrait or sprite pins its inspect panel and says when it acts.
  Party cards: the acting hero glows with a "Your turn" tag and AP pips; the others show their initiative position and
  "acts in N" / "⏭ Acts next" / "✓ Acted · acts in N" / "⚡ +1 AP next turn" (banked AP), all as the tracker shows it.
  End Turn shows **"Next: 👹 Goblin Grunt"** (tooltip: everybody who acts before the next hero, "Unused AP is lost —
  there is no Guard"), glows when the acting hero is out of AP. After End Turn the AI turns play out: the HUD records
  every `turn:start` with its FX `turn` marker id and follows the playback (tracker, pill, round number, party cards, board
  ring, log headers), input is locked, Space skips the animations, the camera gently keeps the acting unit in view, and
  the next hero gets a short ribbon ("Syllamin's Turn · Round 2 · 3 AP · then Goblin Grunt").
- **No telegraphs / boss wind-ups**: normal enemies show nothing ahead of time (no bubbles, red tiles or order numbers).
  Wind-ups (everything in `unit.intents` now) are red pulsing tiles with a cream/red "danger tape" hatch and a bright
  outline, a **"⏳ Audit (row) 20"** badge at the area's centre (⏳2 when it lands in 2+ of its owner's turns), a "⏳📄20"
  bubble over the boss, ⏳ on its tracker portrait, "⏳ Winding up" rows in the inspect panel (label, damage pill, "next
  turn" / "n turns", DD.AI.describe text: how to stop it), "⏳ A wind-up lands here" on heroes / tiles, and the move hint
  ("⏳ Audit (row) 20 lands here at the start of its next turn."). The renderer shows them **in step with playback**: an
  announced wind-up appears when its `windup` marker plays (its tiles flash red); a landed one stays until its owner's
  `turn` marker plays.
- **Threat shading** — hold **Alt**, or **T** / the 👁 Threat button to toggle (remembered per browser): every tile
  enemies could hit before this hero's next turn (`DD.AI.threatMap('hero')`: each AI enemy's move + a ready damaging
  skill) plus the aura threats (`threatAt`) for the selected hero, tinted orange by damage (relative to its HP), tiles
  that would drop it hatched red. The hint names who can reach the hovered tile ("3 enemies can reach this tile: Goblin
  Grunt 6, … — up to 15. 💀 enough to drop Zarathor."), safe tiles say so, party cards show "⚠ 2 foes can reach: up to 9".
- **Inspect panel** (hover / pin a unit, tile or tracker portrait; now scrolls when long): enemies — initiative position
  badge, HP, armor, move, "🎲 Init +2", flying / immovable / stun-immune, resistances, statuses, def passive, aura hits,
  wind-ups, **reach** ("⚠ On its turn (in 3 turns) it can reach: Zarathor 6, Syllamin 4"; "✓ no hero within its reach";
  "💫 Incapacitated: it loses its next turn"), while inspected its reach is outlined on the board (`overlay.reach`), and
  **Abilities**: icon, name, range / area, cooldown, the exact desc for that unit. Heroes — AP (acting), move, initiative
  modifier, banked AP, when it acts, wind-ups / reach / auras on its tile ("✓ No enemy can reach this tile before its
  next turn"), passive, Blessing chips.
- **Combat log**: in step with playback as before, plus "⚔️ Zarathor's turn" / "👹 Goblin Grunt's turn" headers inserted
  the first time a turn logs anything (empty turns leave no trace); round dividers kept; a pack of arrivals' "X rolls
  initiative: 12 (joins next round)." lines collapse into one "🎲 Joining next round: X (12), Y (7)…" line.
- **Renderer**: acting unit's turn ring (red for AI) + chevron; AP pips only on the acting turn group; wind-up drawing in
  every phase (was player phase + idle only); threat / reach overlays; `DD.Render.follow`; `renderTo` reports
  `windups`, `badges`, `threatTiles`, `reachTiles`. **fx_render**: handlers for `turn`, `windup`, `initiative`; hosted
  moments; banner folding.
- **ui.js**: hero tooltips (party select / hall) and enemy codex tooltips show the initiative modifier (`UI.initText`).
- **main.js** (combat debug helpers): the autoplay loop keys on `state.turn` (it played only the first hero turn of each
  round under initiative); the debug RunHero fallback has no `xp`.

## Public API (beyond the contract)

`DD.HUD` (tests / console) adds: `rollInitiative()`, `tracker()` → `[{ unitId, name, side, total, cur, dist, joiner,
mark } | { divider, round }]`, `shownTurnUnit()`, `upcoming()`, `threat(on?)`, `holdThreat(on)`, `threatData()` →
`{ tiles: [{ x, y, dmg, reach, aura, lethal }], ref, hero }`, `moment()` → `{ active, progress, line, cards: [{ unitId,
roll, total, rank, from, landed }] } | null`, `skipMoment()`, `forceMoments(on)` (tests: host the moment headless),
`hoverTracker(id)`, `clickTracker(id)`, `clearHint()`. `select(id)` now refuses a unit outside the acting turn group.

`DD.Render.follow(x, y, opts)`, overlay fields `turnUnitId`, `threat`, `reach` (§7.2). `DD.FXRender.moments` (§7.4).
`DD.UI.initText(n)` → "+2" / "−1" / "+0".

## Deviations

- The tracker is a rotating strip (from the acting unit on, wrapping into the next round) rather than a fixed round
  list: it always reads "who's next" left to right. Units joining next round are always listed, even past the point
  where one full cycle would end.
- Wind-ups are drawn for any unit that has one (the compat path still gives some normal enemies wind-ups: mimic,
  bugbear, cube, banshee, Mama Owlbear, act 3 eye / dragon / death knight / fiend). Hiding a real pending attack would be
  unfair; content owners will make those immediate (ENGINE V2 note).
- The engine's initiative banner is folded into the dice moment whenever a screen hosts it (it reads "X goes first"
  before the dice land); without a host it plays as before.
- Threat shading follows `DD.AI.reachOf`, which ignores walls / line of sight past the walk (an over-estimate, safe).
- Hero turns get a short non-blocking ribbon each (4 per round with a full party); AI turns get none (the tracker, pill,
  ring and log headers carry them).
- `hud-v2.md` replaces nothing: `docs/notes/hud.md` (v1 HUD) stays as history; its Guard / telegraph parts are obsolete.

## Requests

- **NARRATIVE**: lines for the `initiative` key (the dice tray shows the engine's line; until then a HUD fallback).
  `round_start` / `enemy_turn` / `combat_start` lines still mention telegraphs, red tiles and Guard ("Read the red
  tiles…", "Somebody please remember to Guard", "Here come the telegraphed attacks") — reword for v2.
- **META-UI** (`js/ui/screens/title.js`): the tip "Every enemy telegraphs its attacks. You will still stand in them." is
  v1. `js/main.js` run helpers (not combat): `Main.debugRewards` still grants XP and `screen=levelup` / `DDdbg.xp` use
  the XP shims (RUN's request).
- **Content owners**: give `def.passive` / ability descs short, exact text — the enemy inspect panel now lists every
  ability's desc. Keep `L.dmg` honest (reach numbers and threat shading read it). Boss wind-ups should set a short
  `label` (the badge cuts at ~22 characters).
- **ENGINE (optional)**: a `rolled` flag on the `initiative` FX marker (today the HUD infers it from `roll > 0`).

## Tests

- Last full run: `hud:` 25 suites / 349 assertions, `render:` 18 / 158, `sprites:` 17 / 258, `ui:` 24 / 337 — all pass;
  the 161 failing sections of the full run are all content suites written for v1 (ENGINE V2's list); no swallowed errors.
- `tests/hud_tests.js` — 25 suites. New / rewritten for v2: mounts (tracker, "Next:", no Guard, cards say when they
  act), only the acting turn group is selectable (cards / board / Tab / summons / End Turn hands over), deployment + Roll
  (button, Space, zone-only moves, skills wait), the dice moment (hosted, blocks playback, banner folded, sorted ranks,
  skip, log held back, none in instant mode), the tracker (order from the acting unit, divider, joiners, marks, hover /
  click both ways, dead units leave), AI playback follows the turn markers (pill, round, tracker, ring, locked input,
  Space), inspect (enemy move / reach / init / abilities / resistances / stunned; hero init / when / AP / Blessings / tile
  reach), boss wind-ups (panel, ⏳ mark, focus, move hint, hero tile warning, stun interrupts), threat shading (Alt hold
  via real key events, T, button, threatMap coverage, auras, lethal, cards), log turn headers (empty turns skipped).
- `tests/render_tests.js` — overlays suite updated (wind-ups in every phase, badges, none after the fight) + 3 suites:
  wind-ups in step with playback (pending announcement hidden, landed one kept until its owner's turn marker, interrupt
  vanishes, windup marker pulses), threat / reach / turn ring / AP pips on the acting turn only, `DD.Render.follow`.
- `tests/sprite_tests.js` — handler coverage incl. `turn` / `initiative` / `windup`, `DD.FXRender.moments`, + 1 suite: a
  hosted moment blocks playback and folds the banner, a fixed order keeps its banner, a throwing host is contained.
- Screenshots (`.tmp/hudv2/scene.html` + `scene.js` + `shot.sh`, one Chrome at a time): deployment, the roll moment
  (tumbling and sorted), a hero turn, an enemy turn mid-animation, threat shading, enemy inspect with reach, Grimble's
  Audit wind-up (board, bubble, inspect, tile) at 1280×720, 1920×1080 and 1024×640.

## Known issues

1. Content still written for v1 (hero / enemy / boss / items / kit / narrative suites) fails as ENGINE V2 listed; the
   HUD shows whatever the content does (e.g. "Heckle" finds no intents to redirect).
2. The objective panel sits under the tracker, so on small windows the back tip of the board can hide behind it.
   `DD.Render.hudMargins` is left at its defaults (a bigger top margin would shrink every board).
3. The dice moment needs the renderer's FX playback; in a hidden tab (rAF paused) it waits like every other animation.
4. Turn ribbons and the tracker's pop-in are CSS animations: under `.static-ui` (headless screenshots) they end
   instantly, so ribbons do not appear in `tools/shot.sh` captures.

## Rotation

Role: UI for the map rotation (rotation plan `.tmp/wf7/rotation-design.md` §3.5, checkpoint C5). Files: the rotation
additions in `js/ui/combat_hud.js` (view cluster, compass, `render:view` handler, edge names, in-combat controls list)
and `js/ui/screens/settings.js` (CONTROLS, the rotSnap toggle), with suites in `tests/hud_tests.js` and
`tests/ui_tests.js`. Purely visual: nothing here touches game logic, AI, AutoPlay or RNG.

### What it does

- **View cluster** (top-right, between the speed button and Menu): three small ghost buttons joined like a segmented
  control. ⟲ calls `DD.Render.turn(-1)` (tooltip "⟲ Turn the map (Q)"), the **compass** calls `DD.Render.resetView()`
  ("🧭 Reset view (Home)"), ⟳ calls `DD.Render.turn(1)` ("⟳ Turn the map (R)"). The tooltips mention middle-drag, Home,
  and the current angle ("Classic view." / "Turned 30° clockwise." / "Turned 90° counter-clockwise."). The buttons
  have no `hotkey`: Q, R and Home live in `DD.Input`. Every `DD.Render` call is guarded with `typeof`. The cluster is
  hidden when `DD.Render.turn` is missing.
- **Compass**: an SVG needle (red north half, cream south half) in a dark ring. CSS rotation =
  `atan2(2·n.y, n.x) + 90°` with `n` = the screen offset of the ground vector (0, −1) at the live yaw, i.e. `yaw + 45°`:
  up-right at yaw 0, turning clockwise with the board. The angle is kept unwrapped, so its 0.1 s transition never
  spins the long way round (350° → 10° moves 20°). The ring lights up gold while the map is turned.
- **`render:view` handler**: every event updates the compass; `moving: false` (the settle) re-runs `placeInspect` when
  the inspect panel is open. `updateCompass()` also runs at mount, so `rot=` or a remembered angle shows at once.
- **Edge names**: `edgeName(edge, yaw?)` names a board edge (N / E / S / W, by outward normal) by where it is on screen
  at the view: one of 8 words + " edge" ('zone' = "enemy side"). At yaw 0 the names are the old table. The
  reinforcement chip's tooltip is a function now, so it uses the angle at hover time.
- **Help**: the in-combat menu lists "Middle drag: Rotate the map to any angle", "Q / R: Turn the map 90°",
  "Shift + wheel: Rotate the map (or swipe · twist)", "Home: Reset the view" and "F: Recenter the board". Settings
  CONTROLS lists "Right / left drag: Pan the camera", "Middle drag", "Q / R", "Shift + wheel: Rotate the map (or a
  sideways swipe)", "Two-finger twist: Rotate the map (touch)", "Home: Reset the view" and "F: Recenter the camera" (F
  and Home were one row).
- **Settings → Game → "Snap rotation to the classic views"** (`settings.rotSnap`, absent = on; `DD.Render.endRotate`
  reads it): "A middle-drag let go within 4° of a classic view lands on it. Hold Shift while letting go to leave it
  exactly where it is."
- `DD.HUD.edgeName(edge, yaw?)` and `DD.HUD.compass()` (the needle's CSS rotation, [0, 360)) for tests and the console.

### Rotation build log (C5, UI)

- **Done.** Everything in plan §3.5 (buttons, compass, `render:view`, `EDGE_NAME` from the view, the in-combat
  controls list, the Settings CONTROLS and the rotSnap toggle) and test T14:
  - `hud: map rotation — view buttons, the compass, edge names and the help rows follow the view` (42 assertions):
    cluster placement and order, no hotkeys, tooltips, the buttons call `turn(±1)` / `resetView()` (spies that pass
    through), the needle at 0 / 90 / 180 / 270 and across 350 → 10, the lit state, `edgeName` at 0 / 180 / 45 and the
    reinforcement chip at 0 and 180, an inspect panel pinned through a turn, a drag with `rotSnap` on and off, and the
    menu rows. It restores yaw 0, `settings.viewYaw` / `rotSnap`, `R.turn` / `R.resetView` and the scene.
  - `hud: map rotation — no view buttons when the renderer cannot turn; the help rows stay`.
  - `ui: map rotation — Settings lists the rotation keys and the "Snap rotation to the classic views" toggle`.
  - `ui: map rotation — the HUD view buttons fit the top-right cluster at 1024×640, 1280×720 and 1920×1080; rot=30
    turns the compass (real page)`: an iframe of `index.html?debug=1&screen=combat&encounter=boss_lichtenstein&seed=7
    &rot=30`. It checks that the yaw is 30, the needle reads 75°, the compass is lit and N is the "right edge", and that
    each button is at least 28 px, on screen, inside `.hud-tr`, and overlaps none of the round box, tracker, objective,
    log, party, speed or Menu.
  - Visual QA (`tools/shot.sh`, `debug=1`, boss_lichtenstein seed 7): rot 0 and 30 at 1280×720 and 1920×1080, and
    rot 200 at 1024×640. The cluster fits beside the tracker at every size, nothing overlaps, and the needle points
    up-right at 0, right (a little up) at 30 and left (a little down) at 200. The in-combat menu and the Settings
    controls were also checked (`.tmp/rotui/`).
- **Next (C6 / C7).** If C4 ships horizontal-wheel / Shift+wheel rotation or the touch twist, add a row to both help
  lists (`combat_hud.js` `openMenu` controls, `settings.js` CONTROLS). README.md is the lead's (requested below).
- **Deviations.**
  - Edge words use the map-like angle (the 2:1 squash undone, the same angle as the needle), not the raw screen angle
    of `local(n)`. Each word then covers exactly ±22.5° of yaw, with the quarter views in the middle of their sectors.
    The raw angle would flip N to "right edge" by yaw 6°.
  - The compass and edge names read `DD.Iso.makeView(DD.Render.getYaw())`, the same matrix as `DD.Iso.local` inside a
    frame. It also holds between frames, and in headless tests, where `UI.show('combat')` never sets the combat scene,
    so `DD.Iso.view()` stays at yaw 0. Without `DD.Iso.makeView`, they fall back to yaw-0 axes.
  - The in-combat controls list is two pairs per row, like the Settings screen. With the 3 new rows, the menu modal
    scrolled by 71 px at 1280×720; now it fits.
  - Small additions beyond §3.5: the gold-lit compass when turned, the angle in the tooltips, `DD.HUD.edgeName` /
    `DD.HUD.compass`, and the cluster hidden without `DD.Render.turn`.
- **Gotchas.**
  - Headless `UI.show('combat')` does not call `Render.setScene`, so `beginRotate()` returns false in a HUD suite unless
    the suite sets the scene itself (the rotation suite does, then restores it).
  - Without the live loop, `turn` / `setYaw` / `resetView` are instant and each fires one `render:view {moving:false}`,
    so the compass can be asserted right after a click.
  - Tooltips shown programmatically do not appear in `tools/shot.sh` captures, though the DOM says shown. Their text
    is checked in the suites (`tipOf`) and in the console log of `.tmp/rotui/scene.js`.
  - The Settings text promises "Hold Shift while letting go": that is C4's `endRotate({ snap: !e.shiftKey })` in
    `input.js` (plan §3.3).

### Review (Nov 5, rotation review: geometry and visuals)

- **Fixed:** the help lists had no row for the two shipped extra ways to turn the map (sideways wheel / Shift+wheel and
  the two-finger twist; C6 asked for them). Added one pair to the in-combat menu (16 pairs = 8 full rows; the menu
  still fits at 1280×720 with no scroll, `.tmp/rot/rv/shots/menu_1280.png`) and two to Settings (short keys, so no chip
  wraps). The hud / ui rotation suites assert the new rows.
- **Checked, fine:** the view cluster in every real-game shot (`.tmp/rot/rv/shots/`, rot 0 … 300) sits clear of the
  tracker and Menu; compass crops at 60 / 135 / 300 (`crop_*.png`) show the red tip at yaw + 45° (right-and-down,
  straight down, up-and-a-bit-left) and the lit ring; `edgeName` follows the needle's unsquashed angle (N = "right
  edge" at 45°, where that border really is).
- **Not fixed (layout, HUD-owned, low):** at the diagonal views a fitted board's top-right corner sits under the combat
  log (2-9 tiles, sometimes a unit's head). See RENDER-WORLD's request (`docs/notes/render-world.md`, review): the HUD
  would need to report the log's box for `fitMap` to avoid it.

### Review 2 (Nov 5, rotation review: input / camera / UI / state)

Run in the real game (`.tmp/rot/rv2/`, see RENDER-WORLD's "Review 2"):

- **Fixed:** the three icon-only view buttons had no accessible name; they carry `aria-label`s now ("Turn the map
  counter-clockwise (Q)", "Reset the view (Home)", "Turn the map clockwise (R)"); the hud rotation suite checks them.
- **Fixed (in `js/render/input.js`, found from here):** the rewards / level-up screens keep the battlefield drawn behind
  them, and Q / R / Home turned it (and remembered the angle). Rotation is now for the combat screen only.
- **Checked, fine:** clicking ⟳ / ⟲ / the compass leaves the focus on `<body>` (`DD.UI.button` blurs), so Space still
  ends the turn; the buttons are real targets (`elementFromPoint` hits them; `.hud-view` is `pointer-events: none`,
  the buttons `auto`); the compass follows every `render:view` (drag steps, animation steps, the settle) and reads
  `yaw + 45°` at mount for `rot=` / a remembered angle; the debug result modal's R is Restart Fight only (`DD.UI`'s
  capture listener consumes it before `DD.Input`: new suite); Q / R under the menu modal do nothing; edge names at 0 /
  90 / 180 / 270 match the needle; the help rows, Settings CONTROLS and README match the bindings in `input.js`.
- **New suites (`tests/hud_tests.js`, end of file):** the result-modal R guard, and `no suite so far left the view
  turned, turning or remembered` (a leak check after the render / sprite / run / ui / hud suites).
- Unchanged, low: the diagonal-view fit under the combat log (Review 1's request stands).

### Rotation requests

- **LEAD (docs)**:
  - README.md controls: Middle drag = rotate the map to any angle, Q / R = turn 90°, Home = reset the view, F =
    recenter; "Right / middle drag pans" → "Right / left drag".
  - ARCHITECTURE §8.3: the top-right cluster has ⟲ (Q) · a compass (reset, Home; it turns with the board on
    `render:view`) · ⟳ (R), and reinforcement edges are named for the current view.
  - §4.7: `settings.rotSnap` is the Settings toggle "Snap rotation to the classic views".
- **RENDER-WORLD (C4)**:
  - Keep emitting `render:view` for every applied change: the animation steps (≤ 66 ms apart) and exactly one
    `moving: false` at the end. The compass and the inspect re-placement depend on it.
  - Shift on release must skip the snap (the Settings text says so).
