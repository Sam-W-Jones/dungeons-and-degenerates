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
2. (Polish, Nov 5: the fit now keeps units out from under the objective and tiles / units out from under the other panels; see "Polish".) The objective panel sits under the tracker, so on small windows the back tip of the board can hide behind it.
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

## Polish (Nov 5, render / HUD polish pass)

Files: `js/ui/combat_hud.js`, `js/ui/ui.js`, `README.md` (controls rows). Suites: `tests/hud_tests.js` (4 new "hud:
polish — …"), `tests/ui_tests.js` (1 new "ui: polish — …").

- **The board fit keeps out from under the panels.** On mount the HUD installs `DD.Render.hudMargins = fn(w, h, { live })
  → { avoid }` (and puts the previous value back on unmount): the boxes of the round box, each party card, the tracker,
  the objective (`soft`: it fades when something is under it, so only units must clear it), the view-button cluster,
  the combat log, the skill bar and the hype / end panel. Transient things (hint, Roll button, DM caption, inspect,
  ribbons, dice tray) are not reported. Measured at most every 250 ms (a layout read) when the renderer asks; none for
  offscreen renders (`live: false`) and none headless unless `DD.HUD.fitAvoid(true)` (tests). The renderer refits when
  a box change puts something under a panel (until the player moves the camera; changed in the balance-run review). See render-world.md "Polish (Nov 5)" for the fit itself and the
  numbers (things under a panel after a fit: 49 / 120 sampled views → 0).
- **Portraits follow forms.** `DD.UI.portrait(defId, size, { unit })` draws the look the unit shows now (`vis.sprite` ›
  `unit.sprite` › its def; cached per look). Party cards, mini cards, tracker chips, the inspect head, the turn ribbon and
  the dice tray use it; cards / minis swap their portrait when the look changes (`lookKey`: a small id per sprite spec),
  the tracker and inspect signatures include it. Basanos' werewolf, Ellaria's Wild Shape and the DM's cameos show on
  the HUD as on the board (shot: `.tmp/wf10/shots/form_wolf.png`).
- **A skill's own refusal is the hint.** `invalidReason` asks the skill's `target.canTarget` (through
  `DD.Targeting.pure`, a query) once the clicked spot is in range, in a straight line if needed, in sight and the right
  kind of target, and shows the string it returns ("No room for a corgi next to it.", "Needs a corgi."); else the old
  "Needs …" text.
- **Inspect pills**: `flags.noProvoke` → "👻 Can't be pinned" (tooltip: walking away never provokes), `flags.noOpportunity`
  → "🕊 No free hits" (never makes attacks of opportunity), for any unit. Resistances (`resist`) now carry a tooltip with
  the percentage, and status immunities (`flags.immune`, e.g. Pebbles' Burning) get "🔥 Immune: Burning" pills; heroes
  get the same pills as enemies.
- **Abilities box**: every ability the unit has (bosses carry more than four), with the count in the heading when more
  than four; the panel scrolls when long.
- **`UI.statLines`** has `init` → "+2 initiative" (the Adrenaline Jar, Kiri's Name Tag, Valdris' Conditioner), in the
  order HP, AP, Move, Armor, initiative, damage, ...
- **Loaded Dice's extra dice**: a passive that keeps `data.dice` (Loaded Dice: every d20 it rolled, best kept) puts a
  small "🎲 3 · **15** · 9" tag under that hero's card in the dice tray once the die lands (tooltip "Loaded Dice: rolled
  3, 15 and 9, kept the best (15)."), and the inspect initiative badge's tooltip says "(d20s 3 / 15 / 9, kept 15 +2)".
- **The 💥 marker and the UP! badge** are in the renderer's badge-stack layout (render-world.md).
- Tests: `hud: polish — portraits follow forms (party card, tracker, inspect)`, `hud: polish — a skill's own canTarget
  refusal is the hint; inspect pills for noProvoke / noOpportunity / immunities; every ability listed`, `hud: polish —
  Loaded Dice shows every die it rolled on the dice moment and the initiative badge`, `hud: polish — the HUD reports its
  panels so the board fit keeps out from under them` (boxes = the real panels, soft objective, none offscreen /
  headless, nothing under a panel at 45°, the previous hudMargins back after unmount); `ui: polish — item stat lines say
  initiative; UI.portrait(…, { unit }) follows the unit's look`.

### Deviations (polish)
- The objective panel counts as a panel for the fit (soft: units only). The fit may therefore shrink or shift the
  default yaw-0 view when a back-row unit would stand under it (render-world.md, Deviations).

### Requests (polish)
- **ITEMS / HERO-BASANOS**: the Party Balloons add-on overlay and the werewolf's claws (render-sprites.md, Requests).
- **LEAD (docs)**: nothing — ARCHITECTURE §7.2, §7.3, §8.1 and §8.3 were updated by this pass (owned sections).
- **LEAD (v2-digest)**: §5 "HUD / UI / render" and §9 "Still open (owners)" can drop the perf gate, the diagonal-view fit,
  the status-flight hover, threat shading on warm floors, the 9-hero campfire, portraits vs forms, invalidReason vs
  canTarget, the noProvoke / noOpportunity pills, the 4-slot Abilities box, hero resistances, `statLines` initiative,
  Loaded Dice's dice and the marker / badge layout (all done in this pass); "hand positions for overlays" and the Party
  Balloons item move to the content requests above (the render side is in place). Left open here: the optional trap
  counter, a provoking walk's own look. **Done in the balance-run review** (v2-digest §5 / §9 / §11).

## Review (balance run) — HUD polish

Checked by running the game (`.tmp/wf10/rev2/`, see render-world.md "Review (balance run)" for the shots and probes).
- **Fixed — the objective faded with nothing under it.** `unitBoxes` (the objective's peek test and the DM caption's
  placement) guessed every unit 62 px tall (a boss 120) × zoom + 22 at any zoom: at 1920×1080 the Rat King and the DM
  faded the objective with their heads and HP pills well clear of it. It now uses `DD.Sprites.metrics` and the HP pill as
  the renderer draws it (half-width 30 / boss 48 / downed 27 × the widgets' clamped zoom + 9 px; up to the status row),
  the geometry the board fit keeps clear (the old guess stays as the fallback when there are no metrics). The 40-view
  sweep: the objective solid in all 40.
- **Fixed — a resize refitted with the old window's panels**: `hudAvoid` reused its boxes for 250 ms whatever the window
  size; the cache is now keyed by `innerWidth × innerHeight`.
- **Fixed (items.js) — Party Balloons on portraits.** Portraits now draw the look a unit shows, and a balloon holder's
  portrait (party card, tracker, inspect, ribbon, dice tray) had three white strings across the face (the balloons
  themselves cropped off). The balloon overlay now draws only on the board (`o.unit`); suite `items: Party Balloons stay
  off portraits (on the board only)` (mutation-checked).
- Suite `hud: review — the objective fades for the real sprite and HP pill; a resize measures the panels again`
  (mutation-checked: the old guess fails 2 asserts).
- Verified as claimed: canTarget refusal hints, the noProvoke / noOpportunity / immunity pills, every ability listed,
  `statLines` initiative, Loaded Dice's dice, the 💥 marker beside the HP pills (live shot, a1_rats_in_the_cellar), the
  16-seat campfire. Not re-verified by hand: the dice-tray Loaded Dice tag in a live roll (its suite passes).
- Still open: the Party Balloons `unit.overlays` add-on (blocked: `tests/content/hero_basanos.js` asserts the wrapped
  sprite; not mine), the werewolf's claws (`basanos.js`), the optional trap counter, a provoking walk's own look.

## Rules run (Nov 6-10) — moving through allies, swaps, breaking objects (HUD / RENDER role)

User (`.tmp/wf11/user-decisions.md`): "player characters should be able to move through spaces of other player
characetrs" → "My playthrough experience shows heroes cant move through other heroes … I find heroes get congersted when
terrain is around." · "Yes, add swap" · "Also, objects should be tragettable to break them". The engine side (both sides
walk through their own side, the swap, breakable targets) is in `docs/notes/rules.md` "Rules run". What made heroes feel
blocked was the HUD; this is the fix. Contract text: ARCHITECTURE §7.2 (overlay fields), §7.5 (`pick` → `under`), §8.1
(`aimNotes`), §8.3 "Rules run". An earlier attempt at this role was cut off (Nov 6, 21:31); its edits were reviewed,
kept and finished here.

### What it does

- **Click-through (`pierce`)**: `DD.Input.pick` reports `under`, the tile behind a sprite hit. The HUD acts on that tile
  when a hero-side sprite (the selected unit's own too) covers a tile the mode wants: a move / interaction tile (not Help
  Up), a free green deployment tile, the armed skill's target where the ally is none (a crate or a foe behind an ally).
  The ally fades (`overlay.ghosts` 0.35). Enemy sprites are never pierced; Shift+click means the ally itself.
- **Continuous range**: `overlay.passTiles` (allies a walk crosses: lighter fill + dashed ring, the outline runs round
  them) and `overlay.swapTiles` (⇄ ring under each adjacent ally the unit can swap with). A hovered walk fades the allies
  it crosses (0.55) and says "Walks through Zarathor."; a farther ally says it doesn't block. Boxed in (≤ `BOXED_IN` = 3
  reachable tiles) with a swap available: an idle hint says how to get out.
- **Swap**: hover an adjacent ally → "⇄ Swap with <name>: 1 move, N AP; it costs <name> nothing (no AP, no turn)." plus
  attacks of opportunity (badge on the mover, ⚔ over the strikers, "Can't be undone"), both arrival hazards / edges, and
  the arrows (`overlay.swap`, red when it provokes or lands in a hazard). Refusals greyed ("⇄ Can't swap with Wizzy:
  Wizzy is out cold and won't budge."). Click → `Combat.swap`; Z undoes. A summon of this turn is selected by a click
  (Shift+click swaps); a downed neighbour is Help Up; a mover that can't move clicks an ally as before.
- **Breaking**: 🔨 markers (`overlay.breakTargets`, steel blue; 💥 stays for `detonates`); aim hint "or 🔨 the Crate" /
  "or 🔨 4 breakables"; hover "🔨 Break: Crate − 5 damage, 1 HP left" / "… — breaks!" then, on a break, "🎯 Objective
  2/3" ("3/3: that wins the fight!"), "🧩 Puzzle step" (boss fight, `Act.puzzleHint` > 0), "💰 +3 gold" (gold the
  preview's dry run hands out, watched like the blasts), who it hurts; the object's HP bar shows the hit
  (`overlay.objPreview`). Inspect: HP, "🔨 Breakable … any single-target attack", what the armed skill does to it or why
  it can't, the objective line; opt-outs "🚫 Not a target", the protect objective "🛡 Protect it". Clicks the skill can't
  make say why. Skill tooltips: "🔨 Can also hit a breakable object in range (crates, totems…) for N damage; it breaks at
  0 HP." (`UI.aimNotes`, with the level).

### Played (real game page, synthetic pointer events, `.tmp/wf10/rr/`)

`bash .tmp/wf10/rr/run.sh game.html "debug=1&instant=1&screen=combat&encounter=a1_rats_in_the_cellar&seed=5&party=zarathor,syllamin,marbles,ellaria&probe=rr&phase=cellar|tight|break"`
(`&map=corridor|doorway|crates|ledge`, `&yaws=0,30,200`, `&zoom=2.6`; PNGs crop round the action in `out/`, all read).
- Cellar (real map), yaw 0 / 30 / 200: every reachable tile clickable (centres before → now: 19 → 22, 20 → 22 of 22);
  tiles behind Marbles / Zarathor reached through their sprites (moved, Z undone); the walk through Zarathor shows its
  path and fades him; Syllamin ⇄ Biscuit swapped and undone.
- Sandbox corridor (one tile wide, walls both sides), doorway, crates (Marbles boxed in: 1 tile + the swap), ledge
  (height 2 / 1): walks through the whole party, swaps, at 0 / 30 / 200. Ledge: 35 of 35 tiles clickable at every yaw.
- Break phase: 🔨 on crates, a barrel and a totem, "Break: Crate − 5 damage, 1 HP left", the click hit it (6 → 1).

### Deviations

- Allies fade only while aimed through (0.35) or walked through (0.55), not all the time in move mode: a fully ghosted
  party every turn read worse than the tile-first pick, and the default move view stays as before apart from the
  pass / ⇄ marks.
- The adjacent ally is a swap only in move mode and when the ally isn't a unit of this turn (those are selected; Shift
  swaps). The lead's "clicking (or hovering) an adjacent ally previews" is the hover; the click swaps directly (Z undoes).
- No `breakNote` def field (an earlier draft read one): "what breaking does" comes from the engine (objective, puzzle
  hint, the dry run's gold / damage / spawns), so content needs nothing new.

### Requests

- None blocking. ENGINE (optional): carry the gold a preview's dry run hands out on the preview itself (`preview.gold`);
  the HUD watches `DD.Act.gainGold` around the dry run meanwhile, as it does `explode` for blasts.

### Known issues

- Terrain still hides floor tiles at some angles (a one-tile trench at yaw 0, the tiles right behind a tall wall): not
  an ally problem — the probe found none in the real cellar at 0 / 30, two at 200 — and the map turns freely (Q / R). A
  click on the wall in front does nothing there; no x-ray pick for tiles behind terrain.
- Enemy sprites are never clicked through (clicking one inspects it), so a reachable tile behind a foe needs its
  uncovered corner (or a turn of the map).
- The hover can't know Shift: hovering a friendly sprite over a free tile shows the tile (and fades the ally) even while
  Shift is held; the Shift+click itself means the ally.
- A 1 / 6 HP object's bar is mostly dark on a crate (the v2 bar, unchanged).

### Tests

`hud: rules run — …` (6 suites: click-through with real pointer events at yaw 0 / 30 / 200, deployment / aiming / Shift,
corridor range + boxed-in hint, swap preview / click / undo / AoO / refusals / Help Up / summons, breakables (🔨, preview,
HP bar, inspect, the hit, opt-outs) and "what it does" (objective, gold, puzzle step, tooltips)); `hud: v2 requests —
attacks aimed at an explosive barrel` updated (a plain barrel is a 🔨 breakable, never 💥); `render: rules run — …`
(pass tiles, ⇄ rings and arrows, ghosts, 🔨 and the HP preview at yaw 0 / 30 / 200, empty fields pixel-identical, junk
safe). Yaw-0 A/B (`.tmp/rot/run.sh ident_v.html "nothreat=1"`): 28/28 boss frames 0 px (only the title differs, as
before).

### Review (balance run) — adversarial review of the rules run, HUD / input side (REVIEWER role, Nov 10)

Played through the real game page with synthetic pointer events (`.tmp/wf10/rv/rv.js`, run by `.tmp/wf10/rv/run.sh`;
the author's `.tmp/wf10/rr/rr.js` re-run at yaw 45). PNGs read.
- **Reachable tiles on real maps**: 12 encounters (act 1-3 normals, all five bosses' arenas), the first acting hero, every
  reachable tile swept: yaw 0 — 270 / 270 clickable; yaws 45 / 135 / 200 / 315 — 1071 / 1080, the 9 others under a
  boss's own sprite (Dr. Iris, the DM, Lich-tenstein at 45 / 135: enemy sprites are never clicked through). Terrain hid
  none on real maps; the sandbox doorway / corridor walls do hide tiles at 45 (known issue above).
- **Swaps clickable**: every adjacent swap target at 8 yaws on the cellar map, a 5-hero clump, two corridors and the
  doorway: a spot always previews the swap and the click swaps (Z undoes). The author's probe "FAIL a spot on <ally>" at
  45 was its strict feet search; its "💥 barrel" FAIL at 45 was the barrel out of Your Mom Joke's range (5 > 4).
- **Fixed — the acting hero's own sprite over an adjacent ally's tile was a dead zone**: when the ally stands right
  behind (up-screen of) the acting hero, the hero's sprite covers part of the ally's tile; a click there picked the hero
  himself and did nothing (the swap preview didn't show either). Measured on the cellar / clump maps: up to 169 of 397
  spots on the ally (yaw 45). Now `pierce` acts on that ally in move mode — a swap target, a downed ally (Help Up) or a
  unit of this turn (selected) — and the hero fades while aimed through (`hoveredSwap` accepts a hover pierced through
  the unit's own sprite). After: 0 dead spots at every yaw. Suite `hud: rules run review — the acting hero's own sprite
  in front of an adjacent ally: the click swaps / helps up` (yaw 0 / 45 / 200; mutation-checked: 18 assertions fail
  without the fix). ARCHITECTURE §8.3 says so.
- Held: walking through allies (path, ghosts, "Walks through …"), Help Up on a downed neighbour, a summon of this turn
  selected by a click (Shift swaps), 🔨 markers / "Break: Crate − 5 damage, 1 HP left" / the HP bar / the hit at yaw 45,
  the inspect panel's HP and "Breakable" lines.
- Still open (not ally-related): a big boss sprite covers reachable tiles behind it at some yaws (turn the map); sandbox
  walls hide tiles at some yaws (no x-ray pick; the lead's call, see Requests above).

## Playtest fixes (Nov 12) — fix:ui (render, ui, css, README, narrator.js)

Source: `.tmp/wf12/confirmed-findings.json`; lead decisions `.tmp/wf12/lead-decisions.md` (D1-D11). Each finding was
reproduced on the current files (code + the verifier's repro), fixed, and pinned by a suite (`hud: playtest …` in
tests/hud_tests.js, `ui: playtest …` in tests/ui_tests.js, the narrative statics). Status kept AS WE GO; a re-run continues
from this table. Engine halves are fix:engine's (docs/notes/rules.md "Playtest fixes (Nov 12)").

| id | sev | status | what (my side) |
|---|---|---|---|
| first-hour-2 | major | fixed | `pierce`: anywhere on an ADJACENT ally's sprite = that ally (swap / Help Up), never the tile behind; input.js sends `shift` on tileHover (re-sent when Shift goes down / up), the HUD hover honours it |
| first-hour-v1 | major | fixed | hovering a downed ally: "🆘 Click: Help Up X: 2 AP, back up with N HP (25%)…", the AP shortfall, or reviveHow when not adjacent; pierce keeps a downed adjacent ally |
| combat-controls-3 | minor | fixed | same + an interaction tile previews its click ("🖐 Chest — Click or E: Open (1 AP).", "or E" only when E would pick it) |
| combat-controls-4 | major | fixed | swap hint: the Bleed line, 💀 on hits + bleed, red arrows, the mover's HP preview |
| first-hour-7 | minor | fixed | a transient hint belongs to the unit selected + the turn it was said in; arming a skill / consumable clears it |
| first-hour-1 | major | fixed (UI half) | UI.skillInfo: a monster in the live fight describes its skills at the fight's numbers (DD.AI.fightLevel: every damage key × state.difficulty.dmg; L.dmg alone without it), `info.fightMult`, the ability row shows a ×1.4 pill; the wind-up text (AI.describe) is fix:engine's (done) |
| text-tone-v1 | major | fixed | tile panel over loot: "🪽 X flies, but still swoops down for the Gold Pile." (DD.Grid.isLoot); UI.flyLine(who, loot) adds "Loot is not floor"; tip reworded; items.js Party Balloons desc deferred |
| text-tone-3 | minor | fixed (my half; ai.js / act3.js halves done by fix:engine / fix:content) | HUD templates: no it / its for named units (wind-up timing by name, "before X's next turn", foe reach "In N turns, X can reach", hold-the-line, incapacitated / sheep, tooltips, and since the restart the not-your-turn hint "X waits for a turn in the initiative order"); narrator hero_downed line |
| robustness-4 / text-tone-4 / first-hour-5 | minor | fixed | epitaphs pronoun-free, varied by the run seed, no repeats in one party; level-up "so X learned humility"; party sheet "Replace X at a tavern"; Blessing roll "keeps every Blessing as it is" (re-check after the restart found it still said "they have": fixed and now asserted); boxed-in hint "(1 AP, uses the move)" |
| first-hour-3 | minor | fixed (counter by fix:engine; labels mine) | 'Fights won' counts victories only (run.js); the TPK screen labels the after-fight counters "Downs before the wipe" / "Heroes lost before the wipe" (they never include the wipe itself); the victory screen keeps "Times downed" / "Heroes lost" |
| heroes-v1 | minor | partly (UI side done; consumables.js descs + the 5 deferred hero files remain) | fix:content's request (hero-kiri.md): `UI.consumableDesc(d, user)` renders a string desc or desc(L, user) like a skill's; the HUD pocket tooltip passes the selected unit (`consumableTooltipHtml(id, { user })`: text and 🎯 range follow its reach), consumableCard takes `opts.user`, the rewards screen uses consumableDesc; consumables.js can now switch its ranged descs to `DD.Targeting.reach` |
| text-tone-6 | minor | fixed | select barks through DD.Act.partyLines; level-up / recruit barks through UI.partyLines (run party) |
| first-hour-8 / text-tone-15 | minor | fixed | one list DD.UI.CONTROLS for Settings and the in-combat menu (Tab = next unit of this turn, Hold Alt / T, swap, Shift+click, Enter) |
| first-hour-9 / text-tone-16 | minor | fixed | README: release blurb, no Pages setup note, flyers pocket gold, swap / Shift+click / Enter rows |
| text-tone-17 | minor | fixed | round + threat tooltips and README: "bosses and a few elites" wind up; DESIGN 245 / 645 deferred (docs owner) |
| first-hour-6 | minor | fixed | a panel that scrolls itself (.panel.scroll, the inspect panel) carries its rivets as its own background; the ::before frame is off there |
| first-hour-4 | polish | fixed | the "Next level-up" line is hidden until the die lands; chip tooltips wait too |
| first-hour-10 | polish | fixed | fitInspect: the inspect panel's max-height stops above the hint pill (on place and on every hint change) |
| first-hour-11 | polish | fixed | title "Knobs, sliders and the controls cheat sheet."; Elite blurb "the loot on offer always includes a rare item" |
| combat-controls-6 | polish | fixed | aim hint over a unit / object that is no target: "✖ <the click's refusal>"; "No valid targets" names the nearest foe and why |
| heroes-9 | polish | fixed | party select card: 🎲 Init box |
| heroes-v2 | polish | fixed | forget picker: "A forgotten skill goes back in the pile…"; tip reworded |
| heroes-8 | polish | fixed (my half; zarathor.js "an 18-HP" done by fix:content) | rangeLabel: 'Anywhere' at range ≥ 30 (Switcheroo, boss dooms) |
| heroes-1 | minor | partly | chooseSkillSlot shows a skill's `forgetWarning` (string or (L, rh) => string) on its card; basanos.js (deferred) to add it to Transform + fix gate() |
| text-tone-18 | polish | fixed | Hype tooltip from DD.Balance.hype; UI.DIFFICULTIES descs are getters over DD.Balance (difficulty + extraEnemies) |
| text-tone-21 | polish | fixed | map boss tooltip: "The Rat King and the Rat Bar Association", "Grimble, the Goblin Tax Collector" |
| text-tone-22 | polish | fixed | areaLabel: circle / square / cross of size 0 has no chip |
| bosses-objectives-10 | minor | fixed | narrator hero_downed: "…and {enemy} is far too pleased about it." |
| text-tone-5 | minor | fixed | narrator keys hero_downed_self ['hero'] / hero_downed_friendly ['hero','enemy'] (8 lines each); fix:engine's Act.down picks them (actions.js) |
| text-tone-23 | polish | fixed (my lines) | narrator act_intro_3 "load-bearing" line rewritten; the HUD's initiative napkin line too ("Nobody sneeze."); content / terrain thinned theirs (2 left: the DM screen, the slime) |
| combat-controls-1 | major | fixed (HUD half) | reads the engine's dry run (Combat.provokes / swapInfo: stops, bleed, random, min / max, .outcome): "⛔ Stab stops X (Rooted): the move is spent [and the swap won't happen]", dice ranges "0–18", rider bleed "+🩸1", the 💀 from outcome.lethal, the HP preview = outcome.loss, the drawn path cut where the walker stops, swap arrows ✖ (renderer `overlay.swap.blocked`) |
| combat-controls-2 | major | fixed (HUD half) | reachable entries' `stop` / `hinder` and swapInfo `snag` / `allySnag`: "⚠ The path crosses Web: X is Rooted there and the walk stops short." / "🕸 Ends on Web…", red path cut at the web; swap landing on a web warned |
| bosses-objectives-2 | major | fixed (renderer half) | the wind-up badge's "?" now follows DD.AI.describe's `uncertain` (the skew is rolled on the status and drawn), not the bare Dazzled / Confused status; renderTo's `badges[]` carry `unknown` (suite `render: playtest bosses-objectives-2`) |
| bosses-objectives-3 | major | fixed (HUD half) | HUD threatMap(hero) → DD.AI.threatMap('hero', { hero }) per hero (card line: that hero; shading / tile panel: threatHero(); hero panel: that hero); reachersAt × turns, "The Rat King 28 (2 turns)"; the Rat King's +1 stack is ratking.js's |
| heroes-3 | minor | fixed (UI fallback) | previewBreaks / tileDetonates: a tile-aimed hit (Family Hammer, Hard Pass) previews "🔨 Break: Crate − 5 damage, 1 HP left" and the HP bar from the dry run's p.objects; a barrel: the 💥 Detonate line, the blast area, "in the blast" (the engine's `breaks` wins when it sends one) |

### Requests (playtest fixes, Nov 12)
- **fix:engine (text-tone-5)**: narrator.js now has `hero_downed_self` (tokens: hero) and `hero_downed_friendly` (hero, enemy =
  the ally's name), 8 lines each. In Act.down (actions.js ~897): `credit === target` → `Act.narrate('hero_downed_self', { hero })`;
  `credit` hero-side (playerSide) → `'hero_downed_friendly', { hero, enemy: credit.name }`; else `hero_downed` as now.
  `tests/content/narrative.js` NARRATION_KEYS lists both. DONE by fix:engine (actions.js Act.down).
- **fix:engine (first-hour-3)**: run.js S.stats.combats++ below the defeat / failed-objective returns ('Fights won' labels in
  gameover / hall / map stay as they are). DONE by fix:engine.
- **consumables.js owner / post-balance finish run (heroes-v1)**: the UI now renders `desc(L, user)` for consumables
  (`UI.consumableDesc`; the HUD pocket passes the selected unit): the seven ranged descs (Ice Bucket, Flask of Bad
  Decisions, Scroll of Yeet, Bag of d4s, Holy Water, Frost Flask, Thunder Jar) can become functions using
  `DD.Targeting.reach(this, L, user, N)`. Shops, loot and the party sheet pass no unit (the listed number), as for skills.
- **deferred basanos.js (heroes-1)**: add `forgetWarning: 'Without Transform Basanos never changes back mid-fight: Hair
  Trigger still turns him, the wolf stays until the fight ends.'` (or the builder's wording) to bas_transform — the forget
  picker shows it on its card (ui.js chooseSkillSlot, `forgetWarning` string or (L, rh) => string); and gate()'s lock text
  without a socketed Transform ('… (Transform first)' names a skill he no longer has).
- **deferred items.js (text-tone-v1)**: Party Balloons desc "everything on the floor" → add "(loot still counts: flyers pocket gold)".
- **docs owner (text-tone-17)**: DESIGN.md 245 / 645 "only bosses wind up" vs 659 (five elites wind up); ARCHITECTURE §3.10 key
  table: + hero_downed_self / hero_downed_friendly; §8.3 click priority: an adjacent ally's sprite is the ally (swap / Help
  Up) in move mode, input:tileHover carries `shift`; UI.CONTROLS, UI.partyLines, UI.bossWithTitle, UI.fightDmgMult, skill
  `forgetWarning`, overlay.swap.blocked.
- **fix:content**: zarathor.js Statue II "a 18-HP" (heroes-8); act3.js UNSHAKEABLE_LINE "its next 2 turns" on he-enemies
  (text-tone-3); the other "load-bearing" lines (text-tone-23). All three DONE by fix:content.

### Deviations
- New narration keys (hero_downed_self / hero_downed_friendly) beyond ARCHITECTURE §3.10 (requested above).
- An adjacent ally's sprite no longer clicks through to the tile behind it in move mode (ARCH §8.3 said the reachable tile
  behind wins): the tips, README and controls promised "click an ally to swap". Farther allies still click through.

### Tests and checks (playtest fixes)
- tests/hud_tests.js: `hud: playtest …` — first-hour-2 (real pointer at yaw 0 / 135 / 315: every point of an adjacent
  ally's sprite previews the swap, the click swaps, a downed one helps up; Shift keeps a farther ally on hover;
  mutation-checked: 12 assertions fail without the pierce change), first-hour-v1 / combat-controls-3, first-hour-7,
  combat-controls-4, text-tone-v1 / text-tone-3, first-hour-1, combat-controls-6 / text-tone-17 / text-tone-18,
  combat-controls-1 / -2 (the engine's dry-run shape stubbed + a real web), bosses-objectives-3 (a second order entry),
  heroes-3 (Betty's Family Hammer on a crate). Updated wording in older suites (it / its, "uses the move", the taunt
  line, the four-reacher threat case now starts with four grunts in the order).
- tests/ui_tests.js: `ui: playtest …` — controls list, labels / boss titles / Balance-driven difficulty text, they-free
  strings + party-filtered barks + the Init chip + the forget note, CSS (real page: scrolling panel rivets, the hidden
  next-level line, the Init chip inside the panel at 1024), first-hour-10 (real page, 1024×768 + 1280×720; mutation-checked).
- tests/content/narrative.js: the two new keys in NARRATION_KEYS; the flyer tip's in-engine check (fix:content added the
  gold / Hoard Pile pick-up check to my suite after my reword — kept).
- Shots: .tmp/fixui_settings.png, .tmp/fixui_party.png (1024×768) read; a 5-box stat row clipped at 1024, so Init moved to
  a chip beside Complexity.
- After the restart (Nov 12 ~20:15): every row above re-checked against the code; the playtest suites (hud / ui / render
  / narrative, 17) passed as left. Added: `render: playtest bosses-objectives-2` and the ✖ check in `render: rules run`
  (the renderer halves had no test), `ui: playtest heroes-v1 …`, and the Blessing-roll / TPK-label assertions in the
  robustness-4 suite. Runs kept to one headless Chrome at a time (the user asked to spare the machine).
- Full `bash tools/test.sh` (Nov 12 ~20:25): 993 suites, 4 failures in 2 sections, none in my files: `balance: acts 2-3
  levers (pass 2)` (3: the act 2-3 boss rows are still ×1, balance.js / tests/balance_tests.js are the balance pass's,
  deferred) and `hero_marwyn: AutoPlay battles, acts 2-3` ("many different skills used", marwyn.js is a sustain builder's,
  deferred). No "Error in …" warnings.
- Deferred-file findings seen (not mine, for the post-balance finish run): heroes-1 (basanos.js forgetWarning + gate text),
  heroes-4 (basanos.js Step In), heroes-5 (DESIGN Wet → lightning), heroes-6 (slate.js Short Fuse), heroes-10 (v2-digest),
  heroes-v1 (the 5 deferred hero files + consumables.js), text-tone-1 / robustness-2 (DESIGN §4.3 / v2-digest sentences;
  act3.js fixed by fix:content), text-tone-2 (Marwyn's ally_down line), text-tone-17 (DESIGN 245 / 645), text-tone-v1
  (items.js Party Balloons desc).

### Balance impact (playtest fixes)
None in the sims: AutoPlay reads the engine, not the HUD. For a human: the Help Up / swap / AoO-stop / web / bleed previews
and the counted-twice two-turn bosses remove "the preview lied" downs (the playtest saw them in fight 1 and on Grimble /
the Rat King), so human play gets a little safer than before; the scaled enemy ability text (×1.4 in act-1 fights) only
makes the numbers honest.

## Finish (Nov 14) — fix:ui (render, HUD, screens; the last run before release)

Sources: `.tmp/wf12/lead-decisions.md` (D1, D2, D6 are this role's), `.tmp/wf12/finish-findings.json` (text-tone-17,
text-tone-v1). Each finding was reproduced on the current files first (D8). The engine owner landed D1 (any single-target
damage skill aims at objects: `DD.Targeting.aimsAtObjects`) and D2 (an immovable unit's own swap is allowed; the refusal
"<name> is immovable: he can start a swap, you can't move him." through `DD.Act.pronouns`) during this run. The HUD reads
both, so nothing here hard-codes either rule.

| id | sev | status | what |
|---|---|---|---|
| text-tone-v1 | major | not reproduced (fixed pre-balance) | The verifier's own probe (`.tmp/wf12/text-tone-verify/run.sh game.html "probe=vt&part=flyhover&obj=gold_pile"`, then `obj=a3_hoard_pile`): Syllamin hovering the pile reads "🪽 Syllamin flies, but still swoops down for the Gold Pile." / "… for the Hoard Pile.", no "none of it applies". Guarded by `hud: playtest text-tone-v1 / text-tone-3`. Still open outside my files: the items.js Party Balloons desc (request below). |
| text-tone-17 | minor | not reproduced in the HUD / README (fixed pre-balance); one leftover fixed | The round and threat tooltips and README already said "bosses and a few elites" (`hud: playtest combat-controls-6 / text-tone-17 …`). Leftover in my files: the title quip "Nobody telegraphs anything. Except the bosses." → "… Except the bosses and a few show-off elites. You will still stand in it." (title.js; the screen def exposes `taglines` for the test), stale "only boss wind-ups" comments (combat_hud.js, renderer.js) and ARCHITECTURE §7.2. Suite `ui: finish text-tone-17 / balance audit`. DESIGN.md 18 / 247 / 663 still say "only bosses" (docs owner, request below). |
| D1 | decision | done (HUD side) | Markers, aim hint and tooltip lines read the engine (`aimsAtObjects` + `objectDamage`); `UI.aimNotes` now asks `aimsAtObjects` at the tooltip's level too. Texts in D1's words: inspect "🔨 Breakable (6/6 HP): any single-target damage skill can break it (in range and line of sight). It takes the skill's listed damage and nothing else …", "💥 Volatile: any single-target damage skill aimed at it … sets it off …"; tooltip "🔨 … for N damage and nothing else; it breaks at 0 HP." (D1 / D4: no riders); click refusals "<skill> can't break the Crate: any single-target damage skill can, or Smash it from next to it." and, for an opt-out (`target.objects: false`), "<skill> is for foes only, not the Crate: another single-target damage skill can break it."; inspect "· <skill> is for foes only and can't break it." Opt-outs show no 🔨 / 💥 anywhere. Suite `hud: finish D1 …` (a basic attack, a damage spell, an opted-out damage spell, a no-damage utility: every marker / hint / tooltip line equals the engine's verdict; the refusal texts). |
| D2 | decision | done (HUD side) | A refusal whose reason starts with the ally's name is shown as is ("⇄ Slate is immovable: he can start a swap, you can't move him."), never "⇄ Can't swap with Slate: Slate is immovable: …"; other reasons keep "⇄ Can't swap with <name>: <reason>". The 🗿 Immovable pill has a tooltip: hero side "<name> can't be pushed, pulled or swapped, but can start a swap as the move.", foes "<name> can't be pushed or pulled.". Slate's own swap previews, clicks and undoes like anyone's (checked with the real Slate: "⇄ Swap with Wizzy McTest: 1 move, 1 AP; …"). README: "(Slate is immovable: he can start a swap, but nobody can swap him)". Suite `hud: finish D2 …`. |
| D6 | optional | skipped | An outline for a reachable tile hidden by a sprite needs a new over-sprite overlay pass with sprite-bounds occlusion tests in renderer.js: not cheap, and it risks the yaw-0 pixel identity the render suites pin, right before release. Ally sprites already click through to the tile (rules run); turning the map uncovers tiles behind a foe or a boss. |
| balance audit (UI request) | polish | fixed | ui.js brutal fallback desc (shown only without a DD.Balance row) said 25% / 20%; now "Enemies have 15% more HP, deal 5% more damage, and normal fights bring one extra enemy." Asserted against `DD.Balance.difficulty.brutal` in `ui: finish text-tone-17 / balance audit`. |

### Tests (finish)
- New: `hud: finish D1 …` (33 assertions), `hud: finish D2 …` (20, with the real Slate when loaded), `ui: finish
  text-tone-17 / balance audit` (5).
- Updated: the barrel / breakable / tooltip suites used Chain Zap as "a spell that can't aim at objects". After D1 that
  depends on the engine's single-target test, so they now use a registered **Shy Zap** (a single-target damage spell with
  `target.objects: false`, removed in `finally`) and the D1 wording. The stunned-ally swap refusal now reads "⇄ Wizzy
  McTest is out cold and won't budge."
- Mutation check: with the fixes reverted (old texts, old swap refusal, no pill tooltip, old quip, old fallback), 21
  assertions in 7 sections fail; the files were restored byte-identical (cmp).
- Full `bash tools/test.sh` (Nov 14, one headless Chrome): 1003 suites, 123,091 assertions ok, 6 failures in 4 sections,
  none in my files or from my changes: `hero_marwyn: AutoPlay battles, acts 2-3` (the known variety bar),
  `hero_buga: AutoPlay v2 battles` (the Pork Barrel L3 plant cue), `kit: v2 requests` ("Sand in Your Eye: not an attack, so
  no barrel target": D1 now makes it a single-target damage skill at I-II; the check predates D1) and `narrative: tips`
  (the brutal tip vs its old 25% / 20% check). All four are other owners' files, mid-change in this run. No "Error in …".

### Requests (finish)
- **CONTENT (items.js, text-tone-v1)**: the Party Balloons desc (~:697) says "everything on the floor" with no loot
  exception. Suggested: "+1 Move. You fly: you float over height, pits, liquids and everything on the floor (fire,
  puddles, traps) and ignore terrain costs. Loot still counts: you swoop down for gold."
- **DOCS (DESIGN.md, text-tone-17)**: lines 18, 247 and 663 say only bosses wind up; line ~659 (and the game) say five
  elites do too (Mimic, Mama Owlbear, Young Red Dragon, Death Knight, Pit Fiend). Suggested: "only bosses and a few
  elites wind up their biggest attacks".
- **CONTENT / KIT (tests, D1)**: `kit: v2 requests` still expects Sand in Your Eye to be no barrel target; under D1 it is
  one at I-II (the engine's `singleTargetAt` comment names it).

### Deviations (finish)
- Swap refusals: "⇄ <reason>" when the engine's reason starts with the ally's name (ARCHITECTURE §8.3 updated), instead of
  always "⇄ Can't swap with <name>: <reason>".
- The title screen def carries `taglines` (a copy of the quips) for tests.

## Review (finish) — adversarial review of the render / UI and docs / tools fixes (Nov 14, REVIEWER)

Scope: the finish run's fix:ui and fix:docs reports. Every "fixed" entry was re-played on the current files, every
"skipped" / "not reproduced" one re-judged, then the lens: 42 shots (every screen at 1280x720 and 1920x1080; the
goblin ambush and Grimble at yaw 0 / 45 / 200 at both sizes; hell hounds at 45, Dr. Iris at 200; all PNGs read), the
REAL input path (pointer events on `#game`, keys on the body: scratch probe `.tmp/wf14rev/probe/d12.js` / `d3.js`
through the machine-wide Chrome slot) at yaw 0, 45 and 200, and a docs-truth pass (below).

**Re-played (all hold)**
- D1 (HUD): Syllamin arms Heckle (key 2), a real hover on a crate reads "🔨 Breakable (6/6 HP): any single-target damage
  skill can break it … It takes the skill's listed damage and nothing else." and "🎯 Click: Heckle hits it for 4 (2 HP
  left).", the real click takes 4 off and charms nobody (D4), log "Syllamin turns Heckle on the Crate: 4 damage (2 HP
  left).". Ellaria's Fetch! (an opt-out) on a crate: inspect "· Fetch! is for foes only and can't break it.", click
  "Fetch! is for foes only, not the Crate: another single-target damage skill can break it.", crate untouched, no 🔨 /
  💥 tooltip line. Same at yaw 45.
- D2 (HUD): the real Slate's own swap previews "⇄ Swap with Kiri: 1 move, 1 AP; …", a real click swaps, Z undoes; on
  Kiri's turn hovering / clicking Slate reads "⇄ Slate is immovable: he can start a swap, you can't move him." (named
  once) and nobody moves; the 🗿 pill's title states the rule. Same at yaw 200.
- D3 (docs claim): a stealthed Syllamin's basic attack on a crate and on an explosive barrel both end Stealth.
- text-tone-v1 (not reproduced): the verifier's probe over a Hoard Pile reads "🪽 Syllamin flies, but still swoops down
  for the Hoard Pile." — holds. text-tone-17: holds (see the quip fix below). D6 skipped: holds (the lead made it
  optional; an over-sprite pass risks the yaw-0 identity right before release).

**Found and fixed (most severe first; each with a regression test that fails without it)**

| id | sev | what |
|---|---|---|
| rv-finish-1 | minor | The 🗿 pill promised "…but can start a swap as the move." for every immovable hero-side unit, including Zarathor's Tasteful Statue (move 0, AP 0), which never moves. `immovableTip` keeps the "but" only for a unit with move > 0: the statue reads "Zarathor (Gold Ed.) can't be pushed, pulled or swapped." (combat_hud.js). |
| rv-finish-2 | minor | A REFUSED swap (D2: Kiri hovering Slate; out of AP; a stunned ally) drew the same red arrows as an allowed-but-risky one, so the board said "risky, go ahead" while the hint said no. `overlay.swap.blocked` is now also set for a refusal: red arrows with the ✖ (combat_hud.js; renderer comment; ARCHITECTURE §7.2 / §8.3). |
| rv-finish-3 | polish | The finish run's title quip ("Nobody telegraphs anything. Except the bosses and a few show-off elites. You will still stand in it.", 101 characters) wrapped to two lines at 1280x720 and 1920x1080, so the rotating tagline jumped between one and two lines every 6.5 s and its orphan "stand in it." touched the diorama's tree. Now "Nobody telegraphs. Bosses and a few elites wind up. You still stand in it." (74; the integration suite's "Nobody telegraph" exception and the text-tone-17 "elites" check both hold). |

Tests: `hud: review (finish) — a refused swap shows a ✖ …; the 🗿 pill of a unit that never moves promises no swap`
(test fixtures + the real `zar_statue`) and `ui: review (finish) — every title quip fits one line; ARCHITECTURE §3.7 /
§7.5 / §8.1 / §8.3 …` (quips ≤ 76 characters; the doc lines below). Mutation check: with each fix reverted the suites
fail (2 + 2 assertions for the HUD fixes; the 101-character quip fails the length check); files restored (cmp).

**Docs truth (30+ claims spot-checked against the running game; the D1-D4 rule texts word for word)**: 16 heroes, all
`unlock: null`; 3 AP; L1 HP 20–36 (20–35), move 3–5, init −2..+4, growth +3–5; boss HP 160 / 150 / 320 / 220 / 400; Rat
King 122 and Grimble 144 in a campaign (the shot shows 144); gold 60 / 12–20 / 35–50 / 50–70; prices 40 / 80 / 150, tome
60, scar 45, heal 30, consumables 20–35 (20–32); shop heal 30%, tavern 35%; Hype +8 / +20 / +4; the Bucket of Ice Water
start; 7 rows + the boss row; shop 3 items / 2 tomes / 2 consumables; 4 sockets, max level 10, 3 downs; the perks; 4
Blessing slots; the eight D1 opt-outs exactly; a Confused hero's move costs 2; Help Up 2 AP → 25%; §3.10's keys =
`DD.Narrator.TOKENS` (40); README's Enter and + / − keys; §10.3's round cap 30 and the stall report (a `maxr=4` smoke:
12 stalls listed, "boss_grimble 0/0 (+1 stalled)", a stalled run, 0 errors). D1 "any single-target damage skill can
break it" = DESIGN = HUD inspect = crate desc = tip; D2 "Immovable units can start a swap but can't be swapped." =
DESIGN, "Slate is immovable: he can start a swap, you can't move him." = engine = DESIGN; D3 / D4 = DESIGN, and the
game does what they say. Drift found and fixed: ARCHITECTURE §3.7's volatile line still said "single-target attacks"
(now D1's words); §8.3 said "Boss wind-ups" (now "wind-ups of bosses and a few elites"); and mid-review the bosses
owner's FF-4 (Dr. Iris ×1.2 → ×1.1 HP, closing time round 14 → 10) made the docs suite fail — DESIGN §5 and the §9 brief
now follow it.

**Cross-owner requests finished in my files** (review-open-14, the docs owner's request): ARCHITECTURE §7.5 gives the
`input:*` payloads as built (`input:tileHover` carries `shift` and is re-emitted when Shift changes over the same
tile); §8.1 lists `CONTROLS`, `partyLines`, `bossWithTitle`, `consumableDesc` and `chooseSkillSlot` (the forget
picker's `forgetWarning` line); §8.3 says in one place that, while a move is aimed, an adjacent ally's sprite means ⇄
swap, or Help Up when the ally is downed.

**Requests**
- RULES (combat.js `swapProblem`, D2): the immovable refusal says "<name> is immovable: it can start a swap, you can't
  move it." for Zarathor's Tasteful Statue too, which has move 0 and never starts anything. Suggested: drop the middle
  clause when the ally's `mov` is 0 ("Zarathor (Gold Ed.) is immovable: you can't move it."). The HUD shows the
  engine's reason as is.
- RULES (statuses.js, D3 wording, polish): the Stealth tooltip says "Breaks when it deals damage."; DESIGN §4.4 says
  "Broken when it deals damage or attacks an object (D3)". Suggested: "Breaks when it deals damage or attacks an
  object." (the behaviour already matches: checked above).

**Not verified / known**: the deployment-phase "Roll for Initiative!" button can sit over the bottom row of the board
at some sizes and yaws (1920x1080, the goblin ambush at yaw 45) — by design the fit ignores transient panels; pan
(WASD / drag) or roll first. The ✖ of a refused swap sits between the two units and is often half under their sprites
(as the existing "a free hit calls it off" ✖ is); the greyed hint is the primary message. The "1!" of a d4 level-up
roll renders like "I!" in Cinzel (a font trait, pre-existing). Full-run status: see v2-digest §13.
