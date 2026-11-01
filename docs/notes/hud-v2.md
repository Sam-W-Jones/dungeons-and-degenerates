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
