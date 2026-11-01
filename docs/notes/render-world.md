# RENDER-WORLD — notes

Owner files: `js/render/iso.js`, `js/render/renderer.js`, `js/render/input.js`, `tests/render_tests.js`.

## Summary

- **`DD.Iso`** (`iso.js`, §7.1): projection (`toWorld`/`fromWorld`, 64×32 diamonds, 16 px per level), hit-testing
  geometry (`inColumn` = top diamond + side faces, `inDiamond`, `inPoly`), deterministic per-tile noise (`hash`, `rand`,
  `stream`) and the painter helper `g` (§7.3-compatible) used for object painters and content `def.draw` hooks.
- **`DD.Render`** (`renderer.js`, §7.2): DPR-aware full-window canvas, rAF loop with `dt` (clamped to 100 ms),
  `DD.FX.update(dt)` every frame, `DD.FX.syncAll(state.units)` whenever FX are idle. Scenes `combat` (draws
  `DD.Combat.state`), `title` (floating campfire diorama under a starry sky with the unlocked heroes idling around
  the fire and the occasional idle bark bubble), `gallery` (dark backdrop + `DD.Gallery.draw(view)` when present),
  `none` (dark backdrop); `registerScene(id, { draw(view), enter(), leave() })` for custom ones.
- **World look** (DESIGN §12): every canonical terrain has its own cached top texture (4 deterministic variants,
  optional mirror): flagstones, cobbles, dirt with pebbles, grass tufts + flowers, wood planks with nails and joints,
  sand ripples, moss, engraved crypt slabs, obsidian with glowing cracks, felt (with snack crumbs), graph paper with
  pencil doodles / coffee rings, gold coins, patterned carpet, sewer grates, veined marble, rubble chunks, a plank
  bridge over a dark gap. Side faces are themed (earth strata with grass lips, stone courses, bricks with moss / slime
  drips / trim, wood, metal, coin stacks, paper stacks, table edge, ice, lava rock, obsidian, marble, rulebook stacks
  on the DM's table). Walls are themed per map theme (cellar bricks, mossy sewer, earthen warren, academy stone with
  violet trim, hellish obsidian, gilded marble, stacks of rulebooks on `dm_table`). Pits are dark holes with inner
  walls (and, sometimes, eyes). Water/deep water shimmer, lava glows and bubbles, ice glints. Contact shadows where
  a taller neighbour stands behind, high ground slightly brighter, a board slab with a soft drop shadow.
- **Surfaces** (flat layer clipped to the tile + a volume layer drawn with objects): fire (flames, embers, light),
  poison (bubbles + vapour), water (ripples), oil (rainbow sheen), ice, blood, web (+ tiny spider), steam/smoke
  puffs, holy (glow, sparkles, light rays), electric (re-rolled arcs), cheeto dust (+ cheeto curls); unknown ids use
  `def.draw(g, surface, t)` or `def.color` with a soft pulse. A surface on its last turn is drawn faded.
- **Objects**: hand-drawn painters for all 31 canonical ids (lever on/off via `data.on`, chest open via
  `data.opened`, fountain drained via `data.used`, pressure plate pressed via `data.pressed` or a unit on it, mirror
  rotated by `data.facing` with a floor arrow, valve state, brazier flame + light, connected fences, d20 showing 20 or
  a natural 1, "MTN DOOM" soda can, giant pencil, NPC statue...). `def.draw(g, obj, t)` overrides; unknown ids get
  an iso block in `def.color`. Damaged destructibles show a small HP bar.
- **Units**: painter-ordered with tiles/objects (per diagonal, then height), positioned from `unit.vis`; shadow
  sized from `DD.Sprites.metrics`, sprite via `DD.Sprites.drawUnit` (fallback figure if missing/broken), selection
  ring, and a team-coloured outline + faint fill (only over the hidden part) where taller geometry in front hides a
  unit. Widgets (screen space):
  HP bar with number pill, damage ghost trail, Block segment + shield badge, flashing preview-damage / heal
  segments, status icons with stacks, AP pips at the feet (hero side, player phase), enemy intent bubbles
  ([order] icon damage, `?` when dazzled/confused/random, ⏳n when delayed), preview badges ("-9" + 💀 when lethal).
  Colliding bubbles/badges are stacked upward with leader lines.
- **Overlay + telegraphs** exactly per §7.2: merged-outline regions for move (blue), deploy (green), interact
  (yellow, pulsing), area (orange); target tiles outlined; dotted animated path with arrow (red + ⚠ if
  `pathHazard`); hover brackets. Telegraphs (player phase, FX idle, `showIntents`): red pulsing marching-hatch tiles
  per intent (`DD.AI.intentTiles`, with a §4.5 fallback), amber for delayed ones with a ⏳n badge, merged outlines
  that stay visible behind walls, dashed tracking line + reticle for `anchor: 'unit'`, focus dimming via
  `focusIntentUnitId`. Lights (lava, fire, braziers, candles, chests, totems, holy, electric) are additive glows.
- **Camera**: `fitMap` fits the board in the area left free by the HUD (left 230, bottom 250, top 60, right 24 px;
  shrunk on small windows), smooth pan/zoom with clamps, zoom keeps the point under the cursor fixed, auto-fit on a
  new combat and on resize until the player moves the camera. Picking: `screenToTile` = frontmost tile column (top
  or side face) under the cursor; `unitAtScreen` = sprite bounds from `DD.Sprites.metrics`.
- **`DD.Input`** (`input.js`, §7.5): `input:*` events, right/middle drag (and left drag past 6 px) pans, WASD/arrows
  pan, wheel and two-finger pinch zoom around the cursor, `F`/Home refit, `+`/`-` zoom; ignores keys while typing.
- **Performance**: tile tops and side faces are cached images (per style / variant / depth / zoom bucket; grid lines
  baked in), liquids animate without clipping, one painter helper per frame. 13×13 map + 10–15 units measured at
  ~10–15 ms/frame in *headless software* rendering on a loaded machine; GPU canvas is far faster.
- **Tests** (`tests/render_tests.js`, 10 suites "render: …"): projection round-trips, picking (terraces, columns,
  walls, pits, side faces, sprites), camera fit/zoom/pan/centerOn, every theme × every terrain/object/surface id
  (+ unknown ids, high zoom/DPR, tiny zoom), overlays/telegraphs/widgets (incl. garbage overlay values), title and
  empty scenes, robustness (broken content painters warn once, odd tiles/units), a real `DD.Combat.sandbox` battle
  with an autoplay round, DD.Input event emission, frame budget smoke test.

## Public API (beyond the contract)

`DD.Iso`: `TILE_W, TILE_H, HALF_W, HALF_H, STEP, HEIGHT_PX` · `toWorld(x,y,h)` · `fromWorld(wx,wy,h)` · `levels(tiles)` ·
`depth(x,y)` · `local(u,v)` · `inColumn(px,py,cx,cy,hw,hh,depthPx)` · `inDiamond` · `inPoly(px,py,points)` · `hash(x,y,salt)` ·
`rand(x,y,salt)` · `stream(seed)` · `diamondPath(ctx,cx,cy,hw,hh)` · `roundRectPath` · `flatPoints` ·
`painter(ctx, { pal, t, lw, outline, obj, tile, zoom })` → `g` with §7.3 methods plus `g.diamond, g.box(cx,cy,hw,hh,height,
{top,left,right},stroke), g.cylinder(cx,cy,rx,ry,height,body,top,stroke), g.glow(x,y,r,color,alpha), g.shade, g.rgba,
g.save/restore`.

`DD.Render` extras:
- `stateOverride` (render this state instead of `DD.Combat.state`; tests/debug) · `fps` · `profile` (set to `{}` to
  accumulate per-phase ms) · `isRunning()` · `getScene()` · `registerScene(id, handler)`.
- `screenToWorld(sx,sy)` · `tileTop(x,y,ground)` (elevation incl. wall height, or ground h) · `panBy(dx,dy)` ·
  `zoomAt(factor, sx?, sy?)` · `size()` → `{ width, height, dpr }` · `resetOverlay()` · `invalidate()` (drop caches).
- `drawFrame(dt)` (one full frame on the main canvas) · `renderTo(canvas, { state, scene, width, height, dpr, camera,
  dt })` → `{ units, objects, lights, telegraphs } | null` (offscreen rendering, used by tests).
- `painters` → `{ terrain, objects, surfaces, themes }` ids with dedicated art (handy for galleries).
- `drawTileAt(ctx, terrainId, sx, sy, zoom, { h, theme, surface, obj, dpr })` and
  `drawObjectAt(ctx, objIdOrInstance, sx, sy, zoom, { theme, dpr })`: the world painters on any canvas (gallery,
  codex, tooltips); `def.draw` overrides are honoured.
- `centerOn(x, y, { instant, ignoreHud })` · `fitMap({ instant })` (both smooth by default while running).

`DD.Input` extras: `enabled` · `mouse {x,y,inside}` · `hover` · `keys` (held keys) · `init(canvas)` (idempotent) ·
`detach()` · `update(dt)` (called by the renderer each frame) · `isTyping()` · `pick(sx,sy)` → `{x,y,unitId}|null` ·
`clearHover()`.

Event payloads: `input:tileHover {x,y,unitId}|null` · `input:tileClick {x,y,button:0,shift,unitId}` ·
`input:unitClick {unitId,x,y,button:0,shift}` · `input:rightClick {x,y,sx,sy}` or `{key:'Escape'}` ·
`input:key {key,code,shift,ctrl,alt,meta}`.

`view` passed to `DD.FXRender.drawWorld/drawScreen` and `DD.Gallery.draw`: the §7.4 fields plus `dpr, camera, state,
scene, shake, toWorld`; `ctx` is in screen CSS px (DPR transform applied, state saved/restored around the call);
`toScreen(x,y,h)` includes the current shake and defaults `h` to the tile's ground height.

## Deviations

- `worldToScreen(x, y, h)` takes **grid** coordinates (like `view.toScreen`), defaults `h` to the tile's ground
  height and ignores screen shake (stable for DOM positioning).
- Render heights: one "tile" of `terrain.tall` / `object.height` = 32 world px = 2 elevation levels (walls with
  `tall: 1.5` rise 48 px above their tile).
- Clicking a unit's sprite emits `input:unitClick` **and then** `input:tileClick` for the unit's tile (with
  `unitId`), so a HUD that only listens to `tileClick` still targets units by their sprite. `tileClick` is only
  emitted for the left button; the right button emits `input:rightClick`.
- Escape emits both `input:key` and `input:rightClick` (§7.5 says Esc → rightClick). Left-drag beyond 6 px also pans.
  In combat, Space / Tab / arrow keys get `preventDefault` (no page scroll / focus walk) unless a DOM control has
  focus; while a button/link/tabbable element is focused, Space and Enter are left to it and not emitted as
  `input:key` (prevents e.g. End Turn firing twice after it was clicked).
- `DD.Input` mirrors the hovered tile into `DD.Render.overlay.hover` (the HUD may overwrite it; same value).
- `DD.Sprites.drawUnit` applies `vis.alpha`, `vis.scale`, `offX/offY`, lift and death/down animations itself, so
  the renderer passes the plain feet position (tile top at `vis.x/y/h`) and the plain zoom; the fallback figure
  applies those fields itself.
- Mirror facing accepts `{x,y}`, `'N'..'NW'`, `'/'`, `'\'`, 0-3 (diagonal quarter turns) or degrees; the engine's
  `data.facing` is `'N'|'E'|'S'|'W'` (the reflective side faces that way; N/W-facing mirrors show their back).
- A camera value written into `DD.Render.camera` from outside becomes the new target and disables auto-fit on
  resize (as if the player had moved the camera).
- In headless Chrome (user agent `HeadlessChrome`, i.e. `tools/shot.sh`) the loop runs on a 100 ms timer instead
  of `requestAnimationFrame`: virtual time cannot advance while heavy rAF frames are queued back to back, which
  made screenshots hang for minutes. `resize()` repaints immediately so a capture never sees a cleared canvas.
  Real browsers are unaffected. This also fixes the RULES report that boss-intro banners never finished in
  `tools/shot.sh` captures (`encounter=test_a1_boss&autoplay=1` now advances: FX play, damage numbers, barks).

## Requests

- HUD: the renderer re-reads `DD.Render.overlay` every frame (arrays may be replaced or mutated in place);
  `previews` is keyed by unit id (`{ dmg, heal, lethal, text }`, `text` shows as a badge, e.g. "?" for random
  skills). Prefer `input:tileClick` for actions (`input:unitClick` is informational, see Deviations). Set
  `focusIntentUnitId` while hovering an enemy or its inspect panel.
- RENDER-SPRITES: `DD.FXRender.drawWorld/drawScreen(view)` are called with a screen-space context (CSS px, DPR
  applied) and `view.toScreen` already includes the shake offset; `shakeOffset()` is ignored when
  `settings.shake === false`. `DD.Gallery.draw(view)` is called every frame in the `gallery` scene if it exists.
  The gallery's **Objects** tab currently draws generic blocks for canonical objects; it could call
  `DD.Render.drawObjectAt(ctx, id, x, y, zoom, { theme })` (and `drawTileAt` for terrain swatches) to show the
  real world art.
- META-UI: nothing required. The renderer sets `#game`'s inline width/height and `touch-action: none`.

## Known issues

- Units moving between tiles are depth-bucketed by the tile they are heading to; a tall tile diagonally in front
  can overlap the walker for a few frames (the silhouette pass softens it).
- Silhouette masks for objects are rectangles (good enough for pillars/trees/shelves, slightly generous).
- The harness clock is virtual (`performance.now()` does not advance during synchronous work), so the
  "frame budget" suite only checks that rendering completes; real timings were measured with a scratch page.
- Telegraphs are only drawn in the player phase while FX are idle (as specified), so they appear once the combat
  start banner has finished playing.
- `js/ui/combat_hud.js` had not landed when I finished: the overlay contract (move/path/targets/area/deploy/
  interact/previews/focus) is covered by tests and scratch renders, but not yet exercised by the real HUD.
- With `fitMap`'s HUD margins a 13×13 board is fitted at ~0.8 zoom on a 1280×720 window (units ~32 px tall);
  1080p gives ~1.3. Players can zoom with the wheel / `+`.
- The title diorama shows the first 8 unlocked heroes (all heroes if `DD.Meta` is missing); with no heroes
  registered it shows the empty campfire scene.
