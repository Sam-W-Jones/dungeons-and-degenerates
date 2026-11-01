# RENDER POLISH — notes

Owner files: `js/render/**` (renderer, iso, input, sprites, fx_render, audio, gallery), `tests/render_tests.js`,
`tests/sprite_tests.js`, this file; surgically, the sprite/painter parts of content files (`js/data/bosses/ratking.js`
robe hem, `js/data/heroes/marbles.js` sprite + overlay, `js/data/enemies/act3.js` Death Knight underlay,
`js/data/heroes/josiah.js` miasma painters, `js/data/passives.js` Rocky's look).

## Summary

Every RENDER item of content-digest §5 and the §7 cosmetic items are done, plus fixes from a broad look at the galleries
and fights (acts 1-3 and the boss arenas at 1280×720 and 1920×1080, headless screenshots with autoplay):

- **Units hidden behind bigger units** get the see-through silhouette (team-coloured outline + faint fill), masked by
  the front units' real pixels: Syllamin behind Marwyn/Slate, corgis and the raven behind anyone, minions behind a boss.
  A unit counts as hidden when ≥ 40% of its sprite box is under units painted after it (a same-size unit one row in
  front covers ~25%: no noise in normal crowds). Masks use bare bodies (no spotlight underlays, no status sparkles).
- **HP widgets never sit on a small unit right behind their unit** (the real reason Syllamin vanished in the DM fight:
  one level up behind Marwyn, his body was exactly under Marwyn's HP bar + status row). The widget rises above that body
  (leader line moved to the bar's end so it doesn't cut through the small unit); AP pips of a unit whose feet are behind
  another sprite are not drawn (they read as the front unit's).
- **`spec.underlay(g, t, opts)`**: painted behind the body at ground level (no hover/bob/lean/jump), never tinted. The
  Death Knight's spotlight is a beam from the rafters again.
- **Volumetric surfaces**: content surfaces may define `drawVolume(g, surface, t)` (unclipped, drawn with the objects
  of its row, so units behind are covered). Josiah's Plague Miasma is now a billowing cloud (5 lit puffs per tile rolling
  up 5-22 px) over a lighter ground haze; units inside stand in the fog.
- **`spec.hunch`** (-0.6..1, humanoids): the body shears forward around the feet, the head cranes forward and sinks,
  a hunched back bulges. Professor Marbles uses 0.6; his overlay follows via `g.head` / `g.bodyShear`.
- **Grapples**: no root vines on a unit held by Slate (`sla_grappled`, or any status def with `holds: true` or the
  engine's new `noMove` flag).
- **Throws**: the consecutive per-tile slides of one push play as one flight (steady travel, one arc 18-34 px, squash
  on take-off/landing, HP bar and shadow follow the height). A unit that flies right after another unit lunged at its
  tile was thrown and tumbles (YEET, Personal Space, any lunge-then-push). Slides/jumps accept explicit `arc` / `spin`.
- **Object instance `height`** (tiles, like def.height) paints the object scaled around its base; `googly: true` sticks
  googly eyes on it. Rocky is a 0.45-tile pebble with googly eyes, so he never reads as a blocking boulder.
- **Barks**: several at once (a boss and his cameos, a crowd) no longer overlap — older bubbles keep their spot, newer
  ones move above (or beside, at the top of the screen) with a leader line drawn under every bubble; a bark sits above
  its speaker's HP widget instead of on it.
- **Gallery**: big sprites (Marwyn, Slate, the DM, Dr. Iris, the Rat King's pile) fit their cards using measured
  painted bounds (`DD.Sprites.bounds`); cards grow up to 1.4× when the window has room (1080p). Rat King: ermine hem with
  black tails instead of a flat band.
- **Invulnerable** (the DM behind his screen): a golden force bubble with a sliding glint and a light 10% tint. The old
  25% gold tint washed his whole sprite out into a ghost.
- **`DD.Render.hudMargins`** is public: `{ left, right, top, bottom }` or `fn(w, h)`; garbage sides fall back to the
  defaults, a throwing function warns once and uses the defaults, the sides never eat more than 70% of a dimension, and
  a change refits the board unless the player moved the camera. `DD.Render.margins()` returns the margins in effect.

## Changes

- `js/render/renderer.js`: `drawSprite(…, bare)`; `spriteBox`, `unitOccluders` (UNIT_COVER 0.4) and the mask canvas in
  `drawSilhouettes` (geometry polygons + front sprites), `F.silhouettes`; `liftOf` (render-only jump height → shadow,
  widgets, sprite boxes); `bodiesUnder` + `layoutWidgets(list, zoom)` body avoidance, `overBody` leader, `feetHidden`
  AP pips; `drawSurfaceVolume` content hook; `objScale` + `googlyEyes` + scaled lights; `view.widgets` (unit id → laid-out
  HP widget box) for the FX layer; `hudMargins` / `margins()` / `watchMargins`; `renderTo(...).silhouettes`.
- `js/render/sprites.js`: `underlay`, `hunch`, `heldFast`, `bounds()`, `drawUnit(…, extra)` (`{ underlay: false,
  statusFx: false }`), draw opt `spin` (tumble around mid-body), invulnerable bubble + lighter tint. (Most of this landed
  in the first attempt of this role; finished, documented and tested here.)
- `js/render/fx_render.js`: slide chains (`slideChain`, `INSTANT_FX`), throw detection (`lastLunge`, `justThrown`,
  `spinTurns`), jump `spin`, `clearPose` resets `spin`; bark layout (`barkGeom`, `layoutBarks`, `drawBarkLeaders`).
- `js/render/gallery.js`: card fitting by painted bounds (first attempt), card growth up to 1.4× on big windows.
- Content (painters only): `josiah.js` miasma `drawVolume` + lighter flat haze; `passives.js` Rocky `height: 0.45,
  googly: true`; `marbles.js` `hunch: 0.6` + overlay on `g.head`; `act3.js` Death Knight `underlay`; `ratking.js` ermine
  hem.
- Tests: `render_tests.js` +3 suites (units hidden behind bigger units incl. the widget lift; hudMargins; surface volumes
  and object instance overrides), `sprite_tests.js` +3 suites (underlay / hunch / grapples / bounds / spin; pushes fly as
  one arc and thrown units tumble; barks never pile up). Mutation-checked: disabling the bark layout, the unit occluders,
  the grapple check or the chain arc fails its suite.

## Public API (beyond the contract)

- SpriteSpec: `underlay(g, t, opts)`, `hunch` (-0.6..1). Painter helper `g` in `spec.overlay`: `g.head = { x, y, r }`
  (where the painter put the head), `g.bodyShear` (x shift per px of height for body points; 0 when upright).
- `DD.Sprites.draw` opts: `underlay: false`, `statusFx: false` (bare body), `spin` (rad). `DD.Sprites.drawUnit(ctx,
  unit, sx, sy, zoom, t, extra)` with `extra = { underlay: false, statusFx: false }`. `DD.Sprites.bounds(specOrIdOrUnit,
  flying)` → `{ l, r, t, b, w, h }` painted extent at zoom 1, cached per spec. Unit vis field `spin` (rad, fresh-only).
- Status def flags `holds: true` / `noMove: true` (engine): no root vines while such a status is on the unit.
- Surface def `drawVolume(g, surface, t)`; object instance keys `height` (tiles) and `googly` (render-only).
- FX: `slide` / `jump` events accept `arc` (px) and `spin` (turns; `false` = never). FX views carry `widgets` (unit id →
  `{ x0, x1, y0, y1 }`) when drawn by the renderer.
- `DD.Render.hudMargins`, `DD.Render.margins()`; `renderTo(...)` also returns `silhouettes: [{ id, geometry, units }]`.

## Deviations

- Units now get silhouettes behind other units, not only behind tall geometry (§7.2 says "behind tall geometry").
- A unit's HP widget may sit higher than "above its head" when a small unit stands right behind it; its AP pips are
  skipped while its feet are behind another sprite (the party card still shows AP).
- Forced movement of 2+ tiles is drawn as an arc and thrown units tumble; the logic still resolves tile by tile.
- The `invulnerable` status visual is a golden bubble with a 10% tint (was a 25% gold tint).

## Requests

- **RULES (optional)**: `Act.push(src, target, dir, dist, opts)` could forward an `opts.fx` object (e.g. `{ arc, spin }`)
  to its `FX.slide` calls, so a skill can mark a push as a throw (or not) explicitly instead of the lunge heuristic.
- **hero-slate (optional)**: pass `spin: 1` on the `DD.FX.jump` of Rock Bottom (over the head) and Air Mail (ally toss);
  Personal Space already tumbles (it lunges first). `spin: false` keeps any jump upright.
- **HUD**: set `DD.Render.hudMargins` from the real panel sizes. At 1280×720 the combat log covers the board's top-right
  corner and the objective + DM caption sit over the top rows; the defaults (left 230, bottom 250, top 60, right 24)
  leave units ~30 px tall on a 12×12 map.
- **Content (optional)**: units standing in miasma are only partly hidden by its puffs; if a cloud should hide units
  completely, give the surface a status-like `stealth` look via content (render keeps the cloud translucent on purpose).

## Known issues

- Unit-on-unit occlusion is decided on sprite boxes (the mask is pixel exact); a wide but sparse sprite (the Rat King
  pile, Dr. Iris's stalks) can count as covering a unit that is mostly visible between its pixels.
- A slide chain is computed from the queue when its first slide starts; content that queues slides of one unit with
  only instant events between them but does not mean one flight would get an arc (none does today).
- The gallery detail page draws pose labels over the feet of very big sprites (debug page only).
- Bubbles still cover other units' HP bars while they are on screen (2-3 s); only the speaker's own widget is avoided.
- Full suite at the end of this pass: FAIL — 552 suites, 80,389 ok, 15 failures in 12 sections, all AutoPlay sims
  ("not trivial" / "not a walkover" bars of the act 1-3 enemy and boss sims, Marwyn's AutoPlay battles) and the lich
  honesty suite's hit count. `js/engine/autoplay.js` (and `ai.js`, `lich.js`, `dm.js`) were being edited by other agents
  during this pass, and the failing set changed between runs with their edits (earlier: preview suites, an engine
  status-flag suite, both fixed meanwhile). No failure involves a render file; every render, sprite, gallery and touched
  content suite passes.
