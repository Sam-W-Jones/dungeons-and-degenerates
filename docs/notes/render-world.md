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
- **`DD.Input`** (`input.js`, §7.5): `input:*` events, right drag (and left drag past 6 px) pans, WASD/arrows
  pan, wheel and two-finger pinch zoom around the cursor, `F` refits, `+`/`-` zoom; map rotation: a middle drag turns
  the map to any angle, a sideways wheel / trackpad swipe or a two-finger twist turns it too, Q / R turn it 90°
  (animated), Home resets the view (yaw 0 + fit); ignores keys while typing; rotation never clicks.
- **Performance**: tile tops and side faces are cached images (per style / variant / depth / zoom bucket; grid lines
  baked in), liquids animate without clipping, one painter helper per frame. 13×13 map + 10–15 units measured at
  ~10–15 ms/frame in *headless software* rendering on a loaded machine; GPU canvas is far faster.
- **Tests** (`tests/render_tests.js`, 33 suites "render: …"): projection round-trips, picking (terraces, columns,
  walls, pits, side faces, sprites), camera fit/zoom/pan/centerOn, every theme × every terrain/object/surface id
  (+ unknown ids, high zoom/DPR, tiny zoom), overlays/telegraphs/widgets (incl. garbage overlay values), title and
  empty scenes, robustness (broken content painters warn once, odd tiles/units), a real `DD.Combat.sandbox` battle
  with an autoplay round, DD.Input event emission, frame budget smoke test; map rotation: rotation math, painter's
  order at any yaw, picking at any yaw (+ a pixel truth buffer), rotated frames keep yaw 0 intact, wall cutaway,
  silhouettes at other yaws, camera keeps the focus while turning (an off-board focus holds the board's nearest point),
  Q / R / Home turn the map, middle drag / sideways wheel / animated turns, the moving view's level of detail, blocks
  that turn with the board, the turn prefetch, the touch twist (see "Rotation build log" and "Review").
- **Map rotation** (rotation plan C0-C7 built: free yaw, perf gate + QA + docs, polish): the whole world pass is drawn
  through a view yaw (`DD.Iso.view()`); `renderTo({ yaw })` renders any angle. The live yaw turns freely with a middle drag (0.35° per
  px; released within 4° of a classic view it eases onto it unless Shift is held) or a sideways wheel, and in 90° steps
  with Q / R (250 ms ease-in-out, a double tap turns 180°); Home eases back to 0 and refits. The board-area centre stays
  put, the angle is remembered (`settings.viewYaw`) and `rot=<deg>` sets it for screenshots. While the view moves,
  frames draw a cheaper level of detail (flat textures from the nearest quarter's bake through the exact residual warp,
  upright ones from 7.5° buckets, half-resolution silhouettes, hover frozen); exact bakes follow under a 2.5 ms per
  frame budget once it settles. N / W border walls sink to a stub with a section cap and tall border props fade as
  those borders turn toward the camera (never at yaw 0). Yaw 0 stays pixel-identical to the pre-rotation renderer
  (A/B harness `.tmp/rot/ident.html`). HUD buttons / compass: C5 (UI agent). Built-in blocks (crates, chests,
  bookshelves, totems, plinths, plates) turn with the board; content opts in with `def.yawAware` (see "Content authors:
  blocks that turn with the board"). A Q / R / Home turn bakes the view it lands on during the animation.

## Public API (beyond the contract)

**Map rotation (view yaw).** `DD.Iso` is view-aware: `toWorld`, `fromWorld`, `local`, `depth` follow the current view
(yaw 0 returns today's exact expressions). New: `K`, `RISE` · `view()` (the current immutable view, fields in iso.js and
the rotation plan §2.1; `corners` / `unit` / chains are `[x, y]` arrays, plus `edgeList`, `backIdx`, `frontIdx`) ·
`makeView(deg)` (memoised per 1e-3 deg, LRU 400) · `setYaw(deg | V)` (DD.Render only) · `withYaw(deg | V, fn)`
(push / pop, try / finally) · `normYaw(deg)` · `local0(u, v)` (always yaw 0) · `quadPath(ctx, cx, cy, hw, hh, V?)`
(== `diamondPath` at the quarter views) · `rayHitsColumn(wx, wy, tx, ty, bot, top)` · `screenFacing(facing, lastDir,
prev)` · `painter(ctx, { ground: true })` (g.diamond = the view's quad) and `g.local(u, v)` → `[x, y]`, `g.yaw`, `g.view`.
`DD.Render`: `getYaw()` · `renderTo(cv, { …, yaw, live })` (renders that view; the live yaw is untouched; the title is
always yaw 0; `live: true` draws like a live frame — moving-view LOD and the per-frame bake budget — instead of full
detail; the result also has `silScale`) · `_rot` (tests / perf: `stats` counters incl. `warpDraws`, `fallbacks`,
`budgetMax` (most budgeted bake ms in one frame), `prefetched` (bakes done ahead for a running turn's landing view),
`reset()`, `caches()` (+ `sil`, `silBytes`), `order(gw, gh)` = the
depth groups at the current view, `yawTarget()`, `initYaw()`, `anim()` → `{ from, to (unwrapped), dur }` | null,
`baked()` → `{ styleKey: [baked yaws] }`, `sim(on)` / `step(ms)` (a stepped test clock under which turns animate and
settle as in the live loop), `clock(fn | null)` (time bakes with a fake clock)). The FX `view` gains `yaw`,
`local(u, v)` and `axes { ax, bx, ay, by }`.

**Live yaw (rotation plan §2.2, final API; the battlefield only, title / gallery / painters stay at 0):**
- `getYaw()` → live (animated) yaw, [0, 360), positive = clockwise on screen.
- `setYaw(deg, { keepFocus = true, persist = false, animate = false, instant })` → target yaw. keepFocus holds the ground
  point under the board-area centre (HUD margins aside) in place; persist remembers it on settle; animate eases there
  the short way over 250 ms (only while the loop runs on the battlefield; otherwise, with `instant`, with
  `keepFocus: false` or during a rotate drag it is instant).
- `rotateBy(deltaDeg, { animate = true })` (that way round, any size, from the target; a player gesture: persisted) ·
  `turn(dir)` (+1 = R, clockwise; −1 = Q: the next classic view from the target, skipping one within 1°; eased over
  250 ms from where the view is, pressing again mid-turn goes on from the target, so a double tap turns 180°) ·
  `resetView()` (eases to 0 the short way, then `fitMap()`).
- `beginRotate()` (cancels a running turn; the drag goes on from the animated yaw with the same pivot) ·
  `rotateDrag(dxCssPx)` (yaw −= 0.35° per px: dragging right moves the near edge right) · `endRotate({ snap = true })`
  (within 4° of a classic view it eases there over 120 ms unless `settings.rotSnap === false`; any other angle stays).
- `isViewMoving()` → a rotate drag, a turn animation, or < 150 ms since the last change (live loop only).
- Event `render:view { yaw, moving }`: `moving: true` at most every 66 ms while moving, exactly one `moving: false` when
  it settles. Without the live loop (tests, headless) every change settles at once (one `moving: false`).
- While a turn holds its pivot: `follow()` returns false; `fitMap()` is deferred until the view stops (then it fits at
  that angle); `centerOn(x, y)` makes that tile the pivot; `panBy` moves the pivot along; zooming zooms around it; the
  camera clamp waits until the turn ends.
- `settings.viewYaw` (0.1°) is written 500 ms after a player gesture settles; `rot=<deg>` wins at boot and is never
  written.

`DD.Input` (combat only; rotation never emits a click, a key or a hover):
- Middle button: a drag turns the map (horizontal motion only, 0.35° per px counted from the press point once it has
  moved 3 px; vertical motion ignored); release → `endRotate({ snap: !shift })`; `pointercancel` → no snap; a middle
  click does nothing; a left / right button chorded into it is no click either. Left drag (past 6 px) and right drag
  still pan.
- A horizontal-dominant wheel (|dX| > 2|dY|, no Ctrl: trackpad swipes, tilt wheels, Shift+wheel on Windows) turns by
  −0.25° per px (lines ×33, pages ×400; ±90° per event at most); it ends 150 ms after the last such event (no snap).
  A vertical wheel or Ctrl+wheel still zooms.
- Keys (no Ctrl / Alt / Meta, not auto-repeat, not while typing): Q / R turn 90° counter-clockwise / clockwise, Home
  resets the view (yaw 0 + fit), F refits at the current yaw.
- Two fingers (touch / pen): the midpoint pans, the spread zooms, and a twist turns the map with the fingers once it
  passes 8° (the whole twist counts; a plain pinch never turns it). Lifting a finger ends it with the 4° snap; a
  `pointercancel` ends it without. Never a click.
- Hover is frozen while the view moves (drag, animation, the 150 ms after) and re-picked once it settles.

`DD.Iso.painter(ctx, { yawAware: true })` (rotation plan C7.3): `g.box` and `g.diamond` stand on the view's ground quad
(blocks turn with the board; exactly the billboard helpers at yaw 0), plus `g.faces(cx, cy, hw, hh)` (the visible side
faces left → right: `{ dir, shade, frame, x0, y0, x1, y1, at(s, up), apply() }`), `g.on(cx, cy, hw, hh, u, w, up)` (a
ground point of the footprint, raised), `g.quad(cx, cy, hw, hh)` (its 4 corners NW, NE, SE, SW) and `g.mix(left, right,
t)` (the face colour blend). `g.faces` / `g.on` / `g.quad` / `g.mix` exist on every painter (they read the current view);
only `yawAware` changes `g.box` / `g.diamond`. The renderer hands this painter to content objects whose def sets
`yawAware: true` and to its own blocks (crate, chest, bookshelf, totem, pillar, statue, lever, pressure plate, spikes,
the generic block for ids without a painter).

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
- Rotation (C0 + C1, against `.tmp/wf7/rotation-design.md`):
  - `renderTo` bakes without the 2.5 ms texture budget (offscreen renders are not frame-bound, and tests need
    deterministic pictures); the budget (and its nearest-bake fallback) applies to live frames only (`draw`).
  - R31 (occluders by depth window + view column hull) is built in C1 already, not C2: without it odd-angle silhouettes
    were wrong. C2 keeps R17 (cutaway), the R28 fade and R32 (silhouette canvases).
  - Texture bake keys use `~` before the view key (`style.key` already contains `|` for themed walls).
  - The face cache keeps the quarter (role-stroked) and odd-angle (bare) images in one 24 MB LRU; the texture cache is a
    32 MB LRU (both were count caps with `clear()`).
  - The board shadow is centred on `bounds.maxY - V.hy` (was `- HH`; equal at yaw 0).
- Rotation (C2 + C3):
  - `settings.viewYaw` and `settings.rotSnap` are render-owned settings fields, written via `DD.Meta.setSetting` (meta
    accepts unknown keys). `rot=<deg>` is read by the renderer (`DD.params.rot` in `init`), although main.js owns the
    §10.1 param list.
  - Turns are instant in C3 (the plan's checkpoint split): `setYaw` accepts `animate` but ignores it until C4.
    `beginRotate` / `rotateDrag` / `endRotate` (planned for C4) are built already so the §2.2 API is final; only the input
    binding (middle drag, horizontal wheel) waits for C4.
  - `renderTo` always draws at full detail (`lodOff`): no half-resolution silhouettes or moving texture buckets in
    offscreen renders, even while the live view moves.
  - The cutaway applies to tall tiles with more than half a level of wall (`levels > 0.5`), never raises a low one, and
    the border prop fade uses the drawn height (`objHeight × instance scale ≥ 30 px`).
  - The silhouette pool is byte-capped (24 MB of scratch canvases, LRU by size bucket) rather than count-capped.
- Rotation (C4):
  - `ROT_DEG_PER_PX` (0.35) and `SNAP_DEG` (4) live in renderer.js (`rotateDrag` / `endRotate` own them), not in input.js
    as plan §3.3 lists; input.js has `ROT_DEAD_PX`, `WHEEL_ROT_DEG_PER_PX` and `WHEEL_ROT_IDLE_MS`.
  - Camera calls during a turn (not in the plan, which only pauses `follow`): `fitMap` is deferred until the view stops,
    `centerOn` makes its tile the pivot, `panBy` (WASD, drags) moves the pivot's screen point, a zoom zooms around the
    pivot, and `clampTarget` waits until the pivot is dropped. Without this they were overridden by the pivot every frame
    (lost, or a one-frame jitter).
  - `rotateBy` turns that way round (any size), `setYaw(…, { animate })` the short way, `turn` in its own direction (so a
    double tap from 0 reaches 180 clockwise, not the short way). `setYaw` also takes `instant: true` (plan §10 wording).
  - The hover freeze covers every hover update (pointer moves included) while `isViewMoving()`, not only the per-frame
    recheck.
  - A lost release guard: a real mouse `pointermove` with no button down ends a middle drag (with the snap).
  - The wheel turn clamps each event to ±360 px (±90°).
  - Test hooks beyond the plan: `renderTo({ live: true })` and `silScale` in its result; `_rot.sim / step / clock / anim /
    baked`; `stats.budgetMax`.
- Rotation (C6 + C7):
  - **Perf gate, "at rest at 30° / 135° ≤ yaw-0 median + 1.5 ms": not met by the letter on two of four rest views**
    (boss_dm 135°: +4.0 to +5.1 ms; boss_lichtenstein 30°: +2.1 to +3.3 ms). The whole difference is silhouettes: those
    views hide more units behind geometry (boss_dm 1 silhouette at yaw 0, 5 at 135°; lich 2 at yaw 0, 5 at 30°), and each
    silhouette costs what it costs at yaw 0 (≈ 1.2-1.5 ms on a quiet machine: CPU raster of the sprite into scratch
    canvases, HEAD's design). With the silhouette pass taken out, every rest and spinning view is within +0.7 ms of yaw 0.
    Every frame stays under 16.7 ms at the median on a quiet machine. The plan's contingencies target the moving view:
    (1) the 0.4 silhouette scale while moving was measured and gave no gain (the cost is per operation, not per pixel:
    S silhouettes 6.78 vs 6.88 ms at 0.5 / 0.4), so it is **not applied** (it would only blur them); (2) the per-unit
    sprite bitmap LOD is not needed (unit drawing does not grow while moving: S w.units = A w.units ± 0.2 ms). Both
    spinning conditions passed on the quiet runs (median +2.1 to +2.8 ms, p90 13.1-16.2 ms). Details under "Rotation
    build log".
  - **C7.1 title orbit: cut** (the plan's cut-first item). The title diorama stays the classic view; T6 / the A/B harness
    keep asserting that it ignores the yaw.
  - **C7.3, physical sides:** details that belong to one side of a built-in block (the chest's lock, the totem's carved
    faces, the statue plinth's "NPC") stay on its south side (front-left at yaw 0) and hide while that side faces away;
    a crate's planks / braces and a bookshelf's books are on every side (one book stream per physical side, so a side
    keeps its books when it changes role). The open chest's lid stands on the top's back edges at every view. At yaw 0
    every built-in object draws exactly as before (A/B: 32 objects × 5 flag sets, 0 px; the four bosses, 0 px).
  - **C7.3 helpers on every painter:** `g.faces` / `g.on` / `g.quad` / `g.mix` are on every painter (additive names);
    only `yawAware` changes `g.box` / `g.diamond` (the plan put all of it behind `def.yawAware`).
  - **C7.4 prefetch also bakes faces:** the landing view's quarter face images, not only top textures. Prefetching
    spends the frame's leftover 2.5 ms bake budget only (counted in `budgetMax`), and only while a turn animates.
  - **C7.2 twist:** an 8° dead zone (a pinch never turns the board), then the whole twist counts; lifting a finger
    snaps within 4° (`settings.rotSnap` honoured), `pointercancel` does not.
  - Docs: I edited ARCHITECTURE §4.7 (settings line), §5.10 (`render:view`), §7.1-§7.5 and §10.1 (`rot=`), DESIGN §12
    (one line) and README.md (controls table) directly, as assigned to this checkpoint; the LEAD docs requests below are
    therefore done.
- Rotation (review, Nov 5):
  - **Off-board pivot (plan §1.11 amended).** When the ground point under the board-area centre lies off the board (zoomed
    in past an edge or corner, or the floor behind a tall border wall), `capturePivot` holds the board's nearest point
    (clamped to `[-0.5, w - 0.5] × [-0.5, h - 0.5]`, at that tile's ground h) where it is on screen now, instead of the
    empty point. Turning around an empty point 3 tiles off a corner used to leave 10 of 100 tiles on screen after 180°;
    now the board turns around its own edge (worst measured 41 of 100). On the board nothing changes (the focus point
    itself stays put). ARCHITECTURE §7.2 says so.
- Rotation (second review, input / camera / UI / state, Nov 5) — all in `js/render/input.js`, ARCHITECTURE §7.5 says so:
  - **Rotation belongs to the combat SCREEN, not just the 'combat' scene.** A won run fight hands off to the rewards
    (then level-up) screen without changing the renderer's scene, so the board stays drawn behind it; Q / R / Home /
    a middle drag / a sideways wheel there turned that board and remembered the angle. `onBoardScreen()` = in combat
    and (`stateOverride`, or `DD.UI.current === 'combat'`, or no combat screen registered). Home off the combat screen
    falls back to the old `fitMap`.
  - **A mouse turns the map only while its middle button is down.** Letting go of the middle button with a chorded
    left / right button still held used to keep turning with the left button; now the turn ends there (snap unless
    Shift) and the rest of that press is inert (no turn, pan or click).
  - **The middle button never pans**, also where the map cannot turn (it used to pan the board behind the rewards
    screen once rotation was gated there).
  - **Shift+wheel always turns.** Chrome on Windows reports it as `deltaX`; a browser that reports it as `deltaY` used
    to zoom instead of doing what the help rows say. `shiftKey && !ctrlKey && !deltaX` now reads `deltaY` as sideways.
  - **Window blur ends a turn in progress** (no snap): an Alt+Tab mid-drag left the view "moving" (hover frozen, follow
    and `fitMap` deferred) until the mouse came back over the canvas.

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
- LEAD (docs), map rotation: ARCHITECTURE §7.1 — the projection is `A(yaw) = A0 · R(yaw)` with the view API listed under
  Public API (yaw 0 = today's formulas); §7.2 — `renderTo(cv, { …, yaw })`, `getYaw()`, and the painter's order is "depth
  groups by `DD.Iso.depth` (x + y diagonals at yaw 0)" instead of "by x + y"; `painter(ctx, { ground: true })`,
  `g.local`, `g.yaw`, `g.view`. (C6 adds §7.5 bindings, §5.10 `render:view`, §10.1 `rot=`, §4.7 settings.)
- LEAD (docs), map rotation C2 + C3, now live: ARCHITECTURE §7.2 — the live-yaw API under Public API ("Live yaw": `getYaw`,
  `setYaw`, `rotateBy`, `turn`, `resetView`, `beginRotate` / `rotateDrag` / `endRotate`, `isViewMoving`); §5.10 — event
  `render:view { yaw, moving }` (moving at most every 66 ms, one `moving: false` on settle); §7.5 — Q / R turn 90°,
  Home resets the view, F refits (middle drag rotates from C4); §10.1 — `rot=<deg>` sets the battlefield yaw (never
  remembered); §4.7 — settings `viewYaw` (deg, 0.1 steps, absent = 0) and `rotSnap` (absent = true). README.md controls:
  Q / R, Home, F (and middle drag after C4).
- UI (rotation C5, agent B): the §2.2 API above is final and live. Guard calls with `typeof DD.Render.turn === 'function'`.
  The compass can read `DD.Iso.local(0, -1)` inside a `render:view` handler (the live view is applied before the event
  fires). Help / controls lists: `F` no longer shares a row with Home (Home = reset view).
- LEAD (docs), map rotation C4, now live: ARCHITECTURE §7.5 — the middle button no longer pans: a middle drag turns the
  map to any angle (0.35° per px of horizontal motion, after 3 px; released within 4° of a classic view it eases there
  unless Shift is held or `settings.rotSnap === false`); a sideways wheel / trackpad swipe turns it (−0.25° per px,
  Ctrl+wheel still zooms); Q / R / Home animate (250 ms ease-in-out; a double tap turns 180°); rotation never emits
  clicks; hover is frozen while the view moves. §7.2 — `setYaw` `animate` / `instant`, `rotateBy` any size, `renderTo`
  `live`. README.md controls: "Middle drag: rotate the map to any angle", "Q / R: turn the map 90°", "Home: reset the
  view", "F: recenter", "Right / left drag: pan", "Shift + wheel (or a sideways swipe): rotate".
- UI (rotation C5, agent B): help / controls rows can now say "Middle drag — rotate the map to any angle" and "Right /
  left drag — pan" (the middle button no longer pans). `turn` / `resetView` animate in the live game; the buttons need
  nothing else. `render:view` arrives at most every 66 ms while moving plus one `moving: false`.
- **(C6) All the LEAD (docs) requests above are DONE** — written by this checkpoint into ARCHITECTURE §4.7, §5.10, §7.1,
  §7.2, §7.3, §7.4, §7.5 and §10.1, DESIGN §12 and README.md. Still open for whoever owns §8.3: the UI agent's request
  (the top-right ⟲ · compass · ⟳ cluster, `DD.HUD.edgeName`).
- UI (help rows, `combat_hud.js` controls list and `settings.js` CONTROLS): two more ways to turn the map shipped and
  have no row yet — "Shift + wheel / sideways swipe" = "Rotate the map" and "Two-finger twist" = "Rotate the map
  (touch)". README.md already lists them.
- HUD (review, Nov 5; low): at the diagonal views (45° + k·90°) a fitted board fills the top-right corner of the board
  area, under the combat log (2-9 tiles, sometimes a unit's head; `.tmp/rot/rv/fitlog.html`). If that matters, the HUD
  could report the log's box (e.g. `DD.Render.hudMargins` as a function returning `{ …, avoid: [{ x0, y0, x1, y1 }] }`)
  and RENDER-WORLD would teach `computeFit` to keep the board's hull out of it (no change at yaw 0, where the diamond
  leaves that corner empty). Collapsing the log or panning works today.
- CONTENT SWEEP (rotation plan §7; owners of those files; nothing is required for the game to run):
  - **P0 `js/data/heroes/hjalmar.js` `isoStep`** (the spring-glove floor arrow that shows the knock-back direction) is
    drawn in yaw-0 axes, so it points the wrong way at any other angle:
    `function isoStep(d, k) { const L = DD.Iso.local(d.x * k, d.y * k); return { x: L.x, y: L.y }; }`.
  - P1 `js/data/bosses/dm.js` `drawPanel`'s `P(u, v, h)`: the DM-screen panels lie across the wrong axis at 90° (seen
    in QA shot `dm_90`): `const L = DD.Iso.local(u, v); return [L.x, L.y - (h || 0)];`. Its train (`isoPt` / `isoBlock`
    / `drawTrain`, axes `32·dir, 16·dir` and `(−32b, 16b)`) keeps its yaw-0 heading: take the axes from the FX
    `view.axes` / `DD.Iso.local(dir, 0)` / `DD.Iso.local(0, 1)`.
  - P1 `js/data/wildmagic.js` "pushed 1 tile south (toward the bottom-left)": the screen word is wrong at other views;
    drop the parenthesis (or "south, away from the compass needle").
  - P2 content boxes drawn with `g.box` (grimble desk / vault / cabinet / loophole, lich shelf / catalog / desk, dm book
    / switch / stack, beholder chair, act2 coffee machine, hjalmar glove box): add `yawAware: true` to the object def
    and put side details on `g.faces(...)` (see "Content authors: blocks that turn with the board"). Until then they are
    billboards (exact at the quarter views, turned against the grid at odd angles).
  - Guideline for content notes: anything that points along the grid uses `g.local(u, v)` / `DD.Iso.local`; terrain
    `draw` painters are pure ground art (no text, nothing upright).

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
- Map rotation: a middle drag that starts outside combat (title, menus) does nothing (it no longer pans anywhere).
  Retargeting a turn restarts the ease (it slows into the new target rather than keeping its speed).
- Map rotation perf: every silhouette costs ≈ 1.2-1.5 ms on a quiet machine at any yaw (sprite raster into CPU scratch
  canvases); views that hide more units cost that much more (boss_dm at 135°: 5 silhouettes, frame median 12.6-14.2 ms
  vs 9.1-10.1 at yaw 0). See Deviations (C6 + C7) for the gate.
- Content billboards: box-shaped content objects without `yawAware` (desks, shelves, the DM's panels) look turned
  against the grid at odd angles; the DM-screen panels lie across the wrong axis at 90° and Hjalmar's glove arrow points
  in yaw-0 axes (content sweep, under Requests).
- T4 (truth buffer vs an ID buffer) was never built (optional in the plan); T2 / T3 cover order and picking.

## Rotation build log

Plan: `.tmp/wf7/rotation-design.md` (frozen API §2, change map §3, checkpoints §6, tests §10). Scratch: `.tmp/rot/`.

### C0 + C1 (render-world, Nov 4) — done

- **C0, `js/render/iso.js`:** the view factory (§1.1-1.6: exact quarter matrices, f / r vectors, corners / unit / order,
  hx / hy, inscribed ellipse, warp `W(yaw)` in canvas order, edges N/E/S/W with face pair, overlay pair, nf / nr,
  front / back, shade, shadowW, cut, opp; visible `faces` with ROLE frames L / R; back / front chains), view memo (LRU
  400), `setYaw` / `withYaw` / `view` / `makeView` / `normYaw`, view-aware `toWorld` / `fromWorld` / `local` / `depth`
  with the yaw-0 short-circuit, `local0`, `quadPath`, `rayHitsColumn`, `screenFacing` (±3° hysteresis band), painter
  `ground` / `g.local` / `g.yaw` / `g.view`. **Final for RENDER-SPRITES:** `DD.Iso.local(u, v)` (ground offset at the
  current view, `{x, y}`; at yaw 0 bit-identical to today's `(u - v)·32, (u + v)·16`), `quadPath(ctx, cx, cy, hw, hh, V?)`,
  `screenFacing(unit.facing, unit.lastDir, prev)`, `withYaw(deg | V, fn)`. The live view is set by DD.Render at the
  start of every frame (`combat` → live yaw, other scenes → 0), so FX / sprites drawn inside a frame or a `renderTo`
  see the right view through `DD.Iso` directly.
- **C1, `js/render/renderer.js`:** R1-R16, R18-R31, R33-R42, R45-R50, R52 (R31 pulled forward from C2, see Deviations).
  P / P0, inUV and `diamond` follow the view; textures baked per yaw under `withYaw` (32 MB LRU, quarter = on demand,
  settled odd angle = 0.1° bake while the frame budget lasts, else nearest cached within 15° through the residual warp,
  else the quarter; flipped variants = mirror of the bake at -yaw); paintTop on the quad with rims on the chains;
  contact shadows on every edge (W, N, E, S order) weighted by shadowW; content terrain painters under `V.warp`;
  liquids / ice glint [Q] analytic diamond at quarters, inscribed ellipse elsewhere; faces per visible edge — quarter
  views draw role-frame images with physical-side patterns (salt / stream per N E S W, book spines on S / W) at
  identity, odd angles shear bare images onto the real top edge with an L/R colour cross-fade + per-frame verticals;
  general pits (inner walls under back edges, mix by opp.shade, rims on chains); overlays (`quadEdges` = physical-edge
  strokes, region outlines, hover brackets on the quad); objects: spikes / pencil / pipe on P0, fence / coffin / mirror
  on P, mirror front by `Iso.depth`, chest lid + rubble chunks billboards; depth-group painter's order (`depthOrder`,
  memo per grid size + view; yaw 0 = today's diagonals, units by today's formula), unit groups at other views = the
  front-most cell its feet overlap; occluders by depth window + view hull; picking = groups front → back +
  `rayHitsColumn`; title / drawTileAt / drawObjectAt always yaw 0; mapBounds / board shadow on hx / hy; stateBounds memo
  keyed by view; `renderTo({ yaw })`; `getYaw()` (always 0 until C3); `_rot` counters; `invalidate` clears the new caches.
- **Tests (tests/render_tests.js):** T1 `render: rotation math`, T2 `render: painter's order at any yaw` (Iso.depth every
  3° + DD.Render's groups every 9°), T3 `render: picking at any yaw` (yaw 0 == the classic column test on 1500 random
  points; 24 yaws × every tile top; side faces / wall / pit at 45, 180, 300; unitAtScreen at 90), T5 (the every-id
  suite also renders each theme at 30 and 90), T6 `render: rotated frames keep yaw 0 intact` (hash 0 → 30 / 90 / 200 /
  333.3 → 0 equal; `warpDraws` 0 at yaw 0 and at 90; the title ignores the yaw), frame-budget suite renders yaw 30 too
  (ratio checked only when the clock is measurable: the harness clock is virtual). T4 (truth buffer) not built.
- **Exit (all met):** A/B identity 0 px on boss_lichtenstein, boss_dm, boss_rat_king, boss_grimble (grid on / off, busy /
  plain overlay, intents off, zoom 1.7 @ dpr 2, zoom 0.45) and the title (dpr 1 / 2); leak 0 → 90 → 30 → 0 identical on
  all five; render suites green; full `tools/test.sh`: only `kit: Second Wind, First Aid and Power Nap` fails (First Aid
  vs downed allies, tests/content/kit.js — the engine agent's request-4 work in progress, not render).
- **Perf (software canvas, real time, `.tmp/rot/runrt.sh ident.html "enc=…&perf=10&title=0"`):** yaw 0 == HEAD
  (boss_dm 22.5 vs 23.1 ms, boss_lichtenstein 81.9 vs 80.5). Odd angles: boss_dm 30° 28.7, 135° 45.6; lich 30° 112, 135°
  90. The world pass barely moves (tiles 1.1 → 1.4-1.6 ms); **silhouettes** dominate (dm 4.9 → 35 ms at 135°, lich 15 →
  39 ms at 30°): R32 (exact-size pooled canvases, ½ res while moving) and the cutaway are the fix (C2).

### C2 + C3 (render-world, Nov 4) — done (ship point A: quarter turns fully usable)

- **C2, cutaway / fade / silhouettes (`renderer.js`):**
  - R17: `cutK(t)` = max(N.cut if y = 0, W.cut if x = 0) of the current view; `topLevel` sinks tiles with
    `levels > 0.5` on those borders to `h + max(0.5, round(levels·(1 − 0.8k)·4)/4)`. Faces, contact shadows, picking,
    `tileTop`, `mapBounds`, occluders and widgets all follow (they all read `topLevel`).
  - Section cap in `drawTop`: quad fill `rgba(24,14,12,0.42k)` plus an inset rim `rgba(255,230,200,0.35k)` (1.2 px).
  - R28: in `drawObject`, a prop on those borders with drawn height ≥ 30 px gets `globalAlpha *= 1 − 0.55k`.
  - R32: `silCanvases(pw, ph)` pools {sil, ring, mask} CPU canvases per 32-px size bucket (24 MB LRU), so the full-canvas
    composites touch only the unit's box. Half resolution (`SD = DPR × 0.5`, `F.silScale`) while `viewMoving()`.
  - R31 was already done in C1.
- **C3, live yaw (`renderer.js`, section "View yaw"):**
  - State: `liveYaw`, `yawTarget`, `yawAnim` (null until C4), `yawPivot`, `yawChangedAt`, `rotDragging`, the settle /
    event / persist flags.
  - `applyYaw(deg, persist)` sets `Iso.setYaw` at once (combat scene), re-places the pivot (camera and target, `lastCam`
    synced), and emits `render:view` (moving, throttled) or settles at once without the loop.
  - `updateYaw()` runs in `frame()` right after the time step: it settles the view. This is where the C4 animation steps.
  - `capturePivot()` / `placePivot()` per §1.11. `initYaw()` (`rot=` › `settings.viewYaw`) runs in `init` and is retried
    on the first live frame if Meta was not loaded.
  - Also: `setScene` applies the scene view at once; `follow` returns false while moving; `renderTo` sets `lodOff`;
    `invalidate` clears the silhouette pool.
  - Public API: see "Live yaw" under Public API (final §2.2).
- **C3 input (`input.js`):** Q / R → `turn(∓1)`, Home → `resetView()`, F → `fitMap()`. Each is guarded by `typeof`. The
  hover recheck signature has the yaw, and hover is skipped while `isViewMoving()`. Middle drag still pans until C4.
- **Tests (`tests/render_tests.js`):**
  - T8 `render: wall cutaway`: tops at 0 / 90 / 180 / 270; interior walls are never cut; a monotone sweep in ¼ levels;
    the floor behind a cut wall picks itself at 180; a content prop's `globalAlpha` (0.45 on the N border at 180, 1
    inside); yaw-0 hash unchanged afterwards.
  - T9 `render: silhouettes at other yaws`: a column in front at 0 / 20 / 340 makes a silhouette, but none at 160-200; at
    180 an interior wall still hides a unit, while a cut border wall hides nobody; the pool is in use.
  - T10 `render: camera keeps the focus while turning`: the pivot stays within 0.5 px over 37 / 250 / 0 with HUD margins;
    one settled `render:view` per instant turn; `fitMap` at 45°; `turn` targets (30 → 90 / 0, 0 → 180 twice, 0 → 270,
    89.5 → 180); `rotateBy`; `resetView`; the drag API (100 px → 325, snap at 1.75 → 0, snap off); `follow` false while
    dragging; `rot=30` is applied but not written; `viewYaw` is used without `rot=`.
  - T12 (keys part) `render: Q / R / Home turn the map`: R / R / Q / Caps-Q; repeat, Ctrl and typing are ignored; no
    clicks; hover re-picks after a turn; Home resets; no turning outside combat.
- **Exit (all met):**
  - T8-T10 green.
  - A/B 0 px at yaw 0 (4 bosses × all flags + title; leak 0 → 90 → 30 → 0 identical).
  - Shots `.tmp/rot/c3/{slime,lich}_{0,90,180,270}.png` + `slime_135.png`: the cut works, nothing is hidden, the board
    is centred.
  - Full `tools/test.sh`: 820 suites, only `kit: Second Wind, First Aid and Power Nap` fails (tests/content/kit.js,
    First Aid vs downed allies: the engine agent's request-4 work in progress, as at C1).
- **Perf (software canvas, real time, `runrt.sh ident.html "enc=boss_dm,boss_lichtenstein&perf=10&title=0"`, renderTo =
  full detail):**
  - boss_dm: HEAD 22.3 ms; live 19.4 at yaw 0, 21.6 at 30°, 28.0 at 135°. Silhouettes 1.6 / 2.9 / 5.9 ms (C1: 4.9 → 35).
  - lich: HEAD 23.8 ms; live 18.1 at yaw 0, 21.5 at 30°, 19.3 at 135°. Silhouettes 1.0 / 2.3 / 0.6 ms (C1: 15 → 39).

### C4 (render-world, Nov 4) — done (ship point B: free yaw)

- **Animation (`renderer.js`, "View yaw"):** `headTo(toU, dur, persist, fit)` eases (`easeInOut` cubic) from the animated
  yaw to an unwrapped target on the renderer clock (`time`, independent of FX speed): `yawAnim { from, to, t0, dur,
  persist, fit }`, stepped in `updateYaw()` each frame. Instant when the clock does not tick (`loopOn()` = running or the
  test clock), off the battlefield, during a rotate drag, or for a zero-length turn. Retargeting keeps the pivot and goes
  on from the current animated yaw; `turn` adds its own direction to the unwrapped target (a double tap = 180°, Q Q from
  0 targets −180), `setYaw(animate)` / `resetView` go the short way, `rotateBy` that way round. Landing drops the pivot,
  runs the reset's `fitMap`, then the 150 ms settle → one `moving: false`.
- **Release snap:** `endRotate` eases onto the classic view over 120 ms (`SNAP_S`), keeping the drag's pivot.
- **Input (`input.js`):** pointers carry `mode: 'pan' | 'rotate'` (button 1 in combat = rotate); 3 px dead zone counted
  from the press point; `rotateDrag(Δx)` per move; the hover is frozen (no `updateHover`, and `updateHover` itself skips
  while `isViewMoving()`); release → `endRotate({ snap: !shift })` then a re-pick; cancel → no snap; never a click
  (also for chorded buttons). Sideways wheel → `beginRotate` + `rotateBy(−0.25·dX, { animate: false })`, ended by a
  150 ms idle timer (`endWheelRotate`, no snap); a middle press hands over from a wheel turn; `detach` ends any turn.
- **Camera during a turn:** `updateCamera` re-places the pivot instead of the zoom anchor / clamp while `yawPivot` is set;
  `panBy` moves the pivot; `centerOn` re-pivots on its tile; `fitMap` defers (`fitWhenStill`, run by `stillNow()`).
- **LOD:** `bakeYawFor` (moving: flat → nearest quarter through the residual warp, upright → budgeted 7.5° buckets;
  settled → 0.1° bakes under the 2.5 ms budget with the nearest-bake fallback) and the half-res silhouettes were in place;
  C4 adds the per-frame `budgetMax` counter, a swappable bake clock and `renderTo({ live: true })` so tests can drive
  live-frame LOD without the loop.
- **Tests (`tests/render_tests.js`):** T12 `render: input rotates the map with a middle drag, a sideways wheel and
  animated Q / R` (dead zone; 100 px → 325; vertical ignored; hover frozen, no hover events, re-picked on release; no
  clicks (drag, middle click, chord); one settled `render:view`; snap at 2.1° / Shift / `rotSnap` false; left and right
  drags pan; wheel dX 100 → 335, more → 325, vertical zooms, Ctrl never turns, ends after 150 ms without snap; with the
  stepped clock: Q eases counter-clockwise, the pivot holds, Q again → −180, lands after 250 ms, settles 150 ms later,
  `moving: true` ≥ 66 ms apart then exactly one `moving: false` at 180; a drag cancels a running R and goes on from the
  animated yaw; the snap eases 120 ms; Home from 300 goes to 360; pan / zoom / `centerOn` mid-turn work around the pivot;
  a mid-turn `fitMap` fits once it lands; instant without the loop). T13 `render: a turning view draws cheaper, then
  settles to exact bakes under the frame budget` (fake bake clock 0.3 ms per bake: moving frames at 20° have half-res
  silhouettes, the flat styles only the yaw-0 bake (drawn warped), grass 7.5° buckets, ≤ 3.5 ms of budgeted bakes a
  frame; after release 5 frames to the exact set (20° and its mirror 340°), full-res silhouettes, and the settled live
  frame equals the full-detail `renderTo`; an animating turn is a moving view until 150 ms after it lands).
- **Exit (all met):**
  - T12, T13 green; all 28 render suites green.
  - A/B 0 px at yaw 0 (4 bosses × all flags + title; leak 0 → 90 → 30 → 0 identical).
  - Real drag in the running game (`.tmp/rot/drag.html`: synthetic mouse PointerEvents on `#game`, the live loop and
    DD.Input; `VTB=17000 .tmp/rot/run.sh drag.html "debug=1&screen=combat&encounter=boss_dm&seed=7&yaws=30,135,333"`):
    shots `.tmp/rot/out/drag_{mid,rest}_{30,135,333}.png` (+ `zoom=2.4` close-ups for 30 / 135) and `turn_{mid,rest}`
    (R key mid-animation at 23°, landed at 90). The board-area centre holds, the mid-drag frames use the moving LOD
    (warped quarter bakes), the rest frames are crisp, `render:view` went `m…` then one `s` each time, no render errors.
  - Full `tools/test.sh`: 829 suites, 2 failing, neither render: `hero_buga: AutoPlay v2 battles` ("Pork Barrel L3:
    AutoPlay plants it between three grunts", the barrel request in progress) and `kit: Second Wind, First Aid and Power
    Nap` (First Aid vs downed allies, as at C1-C3). Plus the old `missing scripts: tests/balance_tests.js` manifest line.
- **Perf (software canvas, real time, `.tmp/rot/runrt.sh drag.html "debug=1&screen=combat&encounter=boss_dm&seed=7&sync=1
  &frames=20&also=30,135,0"`, live `drawFrame` + a 1-px readback per frame, intro FX cleared):** yaw 0 at rest 12.4-12.8
  ms; a middle drag at 3°/frame 15.0 ms median, p90 18.9 (world 3.1 → 4.0 ms, silhouettes 1.1 → 0.8 at half res); the
  first settled frames (bakes) 13.9; at rest 30° 13.7, 60° 13.0, 135° 12.9. Gotcha: after ~180 live frames this page
  slows to ~50 ms a frame at ANY yaw (yaw 0 too; not rotation) — compare phases inside the first ~150 frames.

### C6 + C7 (render-world, Nov 4) — done (the rotation build is complete)

- **C6 perf gate (§11)**, `.tmp/rot/perf/run3.sh raf_ab.html "run=1&debug=1&enc=<id>&frames=600&blk=20&spin=3" gpu`
  (GPU headless, 1904×985, one Chrome, real rAF; blocks of 20 frames rotate H = HEAD's renderer at yaw 0 on its own
  canvas, A = live renderer at yaw 0, R30 / R135 = at rest, S = a rotate drag spinning 3°/frame; JS ms per `drawFrame`):

  | quiet runs | H | A | R30 | R135 | S median / p90 | silhouettes A / R30 / R135 |
  |---|---|---|---|---|---|---|
  | boss_dm #1 | 9.30 | 10.10 | 12.20 | 14.80 | 12.60 / 16.20 | 1 / 2 / 5 |
  | boss_dm #2 | 9.00 | 9.10 | 11.40 | 14.20 | 11.90 / 15.60 | 1 / 2 / 5 |
  | boss_dm #3 (rest 135 only) | 7.80 | 8.60 | — | 12.60 | 10.70 / 13.10 | 1 / — / 5 |
  | boss_lichtenstein | 7.00 | 6.50 | 9.80 | 6.40 | 7.60 / 10.50 | 2 / 5 / 1 |

  - yaw 0 new vs HEAD: +0.8 / +0.1 / +0.8 / −0.5 ms (noise ±0.8; the world pass costs ≈ +0.25 ms of JS per frame at yaw 0)
    → PASS on average (≤ 0.5). Spinning: +2.5 / +2.8 / +2.1 / +1.1 ms, p90 ≤ 16.2 ms → PASS (one run 0.3 over).
    Budgeted bakes ≤ 2.6 ms a frame, mandatory quarter sets ≤ 2.4 ms a frame; texture LRU 1.0-1.5 MB, faces 0.9-1.7 MB
    → PASS. Rest at 30° / 135°: FAIL by the letter where the view hides more units (see Deviations C6 + C7: entirely
    silhouettes, ≈ 1.2-1.5 ms each, the same per silhouette as at yaw 0; without them every view is within +0.7 ms).
  - Sub-phase profile (boss_dm, 135°, 5 silhouettes, 7.2 ms): sprite into scratch 1.9, ring 2.1, front sprites 1.4,
    upload to the main canvas 1.3, masks 0.3. Half resolution while moving barely changes it (overhead-bound).
  - Later runs on a loaded machine (other agents' Chrome) are 1.5-3× slower across the board; only same-page ratios mean
    anything there. The harness prints "without silhouettes" deltas for exactly that reason.
- **C6 QA (§12)**, `.tmp/rot/qa/shots.sh` (tools/shot.sh one at a time, all `debug=1`), PNGs in `.tmp/rot/qa/`, every one
  read: lich 0 / 30 / 45 / 90 / 135 / 180 / 270 / 333, slime 0 / 90 / 180 / 270, dm 0 / 30 / 90 / 135 / 200, iris 90 /
  180, hound 22.5 / 60, kobold 22.5 / 60 / 180, tenure 0 / 120 / 180, bear 0 / 180 / 300, grimble 30 / 120, rat king
  autoplay at 135 (FX mid-fight), lich 1920×1080 at 30 (HUD cluster + compass), title 0 / 90 and gallery 0 / 45 (both
  classic at any `rot=`). Overlay yard: `VTB=60000 .tmp/rot/run.sh yard.html "debug=1&yaws=0,30,45,90,180&zoom=2.2"`
  (`.tmp/rot/out/yard_z2p2_*.png`) and the blocks yard `…&objs=1&tag=objs` (`yard_objs_*.png`). Verdict: yaw 0 is the
  classic look; cutaway walls and border fades work on every map; textures / rails / water / lava / ice / pits / gold
  stacks / grass tufts / fences / coffins / mirrors (glass side by `Iso.depth`) read right; overlays (move, path, AoE,
  targets, threat, reach, wind-up hatch + badges, hover brackets) sit on the turned quads with merged outlines;
  silhouettes appear behind interior columns and not behind cut border walls. Found only content issues (Requests:
  the DM-screen panels at 90°, the content billboards).
- **C7.3 built-in blocks in face space** (`iso.js` painter `yawAware`, `renderer.js` `YAW_OBJ`, `southPt`, `crateV`,
  `chestV`, `bookshelfV`; totem, statue and spikes inline): see Public API and "Content authors" below.
- **C7.4 prefetch** (`renderer.js` `prefetchYaw` / `prefetchTop` / `prefetchFaces`): while a turn animates, each tile
  bakes the landing view's top texture (and mirrored variant) and quarter face images with the frame's leftover bake
  budget. Measured in the new suite: the landing frame of a Q turn bakes 0 images (17 without the prefetch).
- **C7.2 touch twist** (`input.js` `updatePinch` / `endPinch`).
- **C7.1 title orbit: cut** (Deviations).
- **Tests** (`tests/render_tests.js`, 3 new suites): `render: blocks turn with the board (yawAware painter, built-in
  boxes)` (yaw-0 pixel identity of the yawAware box / diamond, billboards ignore the yaw, faces / frames / shades per
  quarter, `g.faces` / `g.on` / `g.quad` / `apply()` geometry at 37°, `def.yawAware` routing, every built-in block at
  30 / 45 / 90 / 135 / 200 with no errors); `render: a Q / R turn bakes the view it lands on ahead (prefetch)`;
  `render: a two-finger twist turns the map on touch` (pinch only zooms, a 6° wobble does nothing, 30° and −58° twists,
  the 4° snap on release, no clicks).
- **Exit:** gate as above (rest-view overage documented); QA read; A/B 0 px at yaw 0 after C7 (4 bosses × all flags +
  title; leak 0 → 90 → 30 → 0 identical) plus the object A/B (`.tmp/rot/run.sh objab.html`: 32 built-in objects × 5 flag
  sets through HEAD's and the live `drawObjectAt`, 0 px); docs written; full `tools/test.sh`: PASS, 856 suites, 0
  failures (plus the old `missing scripts: tests/balance_tests.js` manifest line, not render's).
- **Harness map (`.tmp/rot/`):** `ident.html` (A/B yaw-0 identity + leak), `objab.html` (built-in objects A/B),
  `perf/raf_ab.html` + `perf/run3.sh` (the GPU gate; `rest=30,135`, `spin=3`, `zoom=`), `qa/shots.sh` (the §12 list),
  `yard.html` (`objs=1` for the blocks), `shots.html`, `drag.html` (real drags in the running game), `sf/` (sprites / FX
  identity). Every page idles without `run=1` (perf, yard and drag also need `debug=1`).

### Review (Nov 5): adversarial pass, geometry and visuals

Scratch: `.tmp/rot/rv/` (every page idles without `run=1&debug=1`; run with `.tmp/rot/run.sh rv/<page>.html "debug=1&…"`).

- **Yaw-0 identity: holds.** `.tmp/rot/run.sh ident.html`: 0 px on the four bosses × every flag set + the title
  (dpr 1 / 2), leak 0 → 90 → 30 → 0 identical; `sf/ident_sf.html` (sprites / FX at FX 15 / 50 / 85 %): 0 px. Re-run
  after the fixes below: still 0 px.
- **Picking vs the painter's order: exact.** `rv/pick.html`: an ID buffer of every column hull (visual top, so cut
  walls included, down to the slab) filled in `_rot.order` vs `screenToTile` at every 3rd pixel, 3 random rough boards
  (border and inner walls, pits, h 0-4) × 21 yaws (0, 1, 7, 30, 44.9, 45, 60, 89.9, 90, 90.1 … 333, 359), and zoomed
  2.6× so the board crosses the screen edges: **0 mismatches in 6.8 M pixels**. Kept as a permanent suite (plan T4,
  never built): `render: picking agrees with the painter's order pixel for pixel (truth buffer)`; a mutation (picking
  that ignores the cutaway) fails it.
- **Fuzz: clean.** `rv/fuzz.html`: 260 random boards (every terrain / object / surface id, h 0-5, random heroes and
  enemies incl. downed, every overlay, a wind-up, random theme) at random yaw / zoom 0.35-3.2 / dpr 1-2, 40 % with the
  moving-view LOD: 0 exceptions, 0 render problems, 0 blank frames.
- **Painter's order with big units / tall props.** Close-ups (`rv/units.html`: bugbear, cube, Rat King, pillars, walls,
  terraces at 0-85°, 44.8 / 45 / 45.2, 89.8 / 90 / 90.2): no pops across 45° / 90°, faces continuous, silhouettes only
  where a later column / prop covers the unit. Known billboard limit (not fixed): off the quarter views a neighbour's
  floor quad that starts slightly behind a unit's feet is drawn after it (Δdepth < half a tile's depth extent, e.g. the
  (x+1, y−1) tile at yaw 5° or (x, y+1) at 30°); it reaches at most ~8 px above the feet line ~28-35 px to the side
  (zoom 1), i.e. only shadow / selection-ring edges of the widest units, never a sprite body in the shots.
- **Overlays / cutaway / fade / FX / mirroring** at 15 / 30 / 90 / 135 / 200 / 270 / 333 (yard, `rv2` / `rv`) and on real
  fights (`rv/shots/`: intern 0 / 60 / 180 / 210, last call 300 + autoplay 250, dice night 135, rat king autoplay 200,
  grimble autoplay 95, dm 90 / autoplay 200, mama bear 180 close-up): merged outlines on the turned quads, hatch / badges /
  path / hover brackets right, N / W walls cut, border trees faded, side details (NPC label) on their physical side,
  sprites mirrored per view, floating texts / barks / wind-up markers in place mid-fight, DM panels now along the
  grid. Moving LOD vs rest at 20° (grass 7.5° bucket vs exact bake): indistinguishable.
- **Perf on the biggest maps** (12×12 `a3_intern_orientation`, 12×11 `a3_cursed_dice_night`; GPU rAF A/B, 1904×985):
  JS / frame median 3.1 / 3.1 / 3.3 / 4.7 / 4.3 ms (HEAD / yaw 0 / 30° / 135° / spinning) and 6.1 / 5.9 / 6.0 / 4.3 /
  4.9 ms; p90 ≤ 7.2 ms; the only > 1.5 ms rest delta is one extra silhouette (intern 135°: +1.6 ms).
- **Fixed — a turn whose focus is off the board swung the board out of view.** Zoomed in near a corner (reachable within
  the camera clamp), the board-area centre looked at empty ground and Q / R / a drag turned the board around that
  empty point: 10 of 100 tiles left on screen after 180° (`rv/pivot.html`). Now the board's nearest point is held
  (Deviations, review). Regression suite: `render: a turn whose focus is off the board holds the board's nearest point`
  (fails without the fix: worst 10 of 100). The input suite's Q-animation check now re-centres on the board first (its
  earlier drags had panned the focus off the 8×8 board, so it was exercising this very case).
- **Fixed — help rows.** The in-combat controls list and Settings' CONTROLS had no row for the sideways wheel /
  Shift+wheel and the two-finger twist (both live, README already listed them): added, with the hud / ui suites
  extended.
- **Not fixed (low; HUD-owned layout):** at the diagonal views (45° + k·90°) the fitted board is a near-rectangle that
  fills the board area's top-right corner, where the combat log sits: 2-9 tiles (once in a while a unit's head) end up
  under the log after `fitMap` (`rv/fitlog.html`; 0 at every other tested yaw, as at yaw 0). Request below.
- **Checked, not an issue:** high ground (h ≥ 2, not walls) on the N / W borders is not cut, but it is as common on
  row 1 (280 vs 296 tiles over 117 maps × 3 seeds, `rv/border.html`) and on the S / E borders at yaw 0, so a turned
  view shows nothing worse than the classic one; faded border props still count as occluders (the unit shows through
  the 45 % prop plus its outline) — harmless.

### Review 2 (Nov 5): adversarial pass, input / camera / UI / state

Method: the REAL game driven by synthetic DOM events (live loop, `DD.Input` on `#game`, the HUD, UI hotkeys and
modals): `.tmp/rot/rv2/game.html?probe=<probe|probe2|probe3>` through `.tmp/rot/run.sh` (idles without
`run=1&debug=1`). `probe` = keys / modals / typing / buttons / chords / AutoPlay / result modal / title / hall;
`probe2` = a run fight won for real (HUD hand-off to rewards), `rot=30` boot, deployment roll + dice tray; `probe3` = a
whole AutoPlay boss fight (boss_grimble, fast) with 202 random gestures (Q / R / Home / F, middle drags with and without
Shift, sideways wheels, the HUD buttons) mid-move, mid wind-up (9) and mid tray.

- **Fixed — the board behind the rewards / level-up screens turned.** Those screens leave the renderer's scene at
  'combat' (the board is their backdrop), so Q / R / Home and a middle drag turned it and wrote `settings.viewYaw`
  (`probe2`: 30 → 0, remembered). Gated on the combat screen (Deviations). Regressions: the input suite (stubbed
  `DD.UI.current`) and `ui: map rotation — Q / R / Home on the rewards screen leave the board behind it alone (real
  page)` (a real run fight won → rewards; fails without the gate).
- **Fixed — a chorded release kept turning.** Middle down, left joins, middle up, move: the map kept turning with only
  the left button held (`probe` S5: 318 → 283). Also a middle press released inside its 3 px dead zone with the left
  still down started a turn on the next move. Now the turn lasts while the middle button is down; the rest of the
  press is inert. Regression: the input suite (`pointerType: 'mouse'` chords, both orders).
- **Fixed — Shift+wheel could zoom** where the browser reports it as vertical; now it always turns (input suite).
- **Fixed — Alt+Tab mid-drag** left the view "moving" until the mouse came back over the canvas; a window blur ends the
  turn where it is (input suite).
- **Fixed (small) — icon-only view buttons had no accessible name**: `aria-label`s on ⟲ / compass / ⟳ (hud suite).
- **New guards:** `hud: map rotation — R on the debug result modal restarts the fight and does not also turn the map`
  (it does not: `DD.UI`'s capture listener consumes the hotkey; Q / R under the menu modal do nothing either) and
  `hud: map rotation — no suite so far left the view turned, turning or remembered` (runs after the render / sprite /
  run / ui / hud suites: yaw 0, no animation, no drag, `DD.Iso` at 0, `settings.viewYaw` / `rotSnap` unset, after the
  500 ms "remember" timer).
- **Checked, fine (by running):** Q in deployment and during the initiative dice tray; R R mid-animation (180°);
  Q / R / Home / F under the in-combat menu: nothing; typing in a text input or a focused slider: nothing; clicking ⟳ /
  the compass leaves the focus on `<body>` (Space still ends the turn); the debug result modal's R restarts the fight
  and the yaw stays (90 → 90; after the restart the board fits at 90°: 90 / 90 tiles on screen, compass 135°); the
  title and the hall / codex draw at yaw 0 while the live yaw stays 90 and comes back with the next fight; `rot=30`
  boots at 30 (compass 75°) and is never written; a gesture is remembered 500 ms after it settles (`viewYaw` 270, also
  in storage), Home writes 0; the AutoPlay boss fight with 202 gestures: no errors, no clicks emitted, the fight went on
  (7 rounds), the view settled, every on-screen tile centre picks a tile.
- **Not fixed, by design / low:**
  - The "remember" timer reads the yaw when it fires, so a programmatic `setYaw` within 500 ms of a gesture's settle
    would be the one remembered. Only tests and `rot=` (boot) set the yaw programmatically, so the game never hits it,
    and reading it late is what keeps the tests' `setYaw(0)` clean-ups from leaving a remembered angle behind.
  - A player gesture under `rot=` is remembered (the param itself never is).
  - The fit at the diagonal views: besides the log corner (Review 1's request), the back row's sprites reach under the
    top HUD as the one back-corner unit does at yaw 0 (the fit pads 30 world px above the topmost tile edge; at 45° that
    edge is a whole row). The objective panel peeks through as designed.

### Content authors: blocks that turn with the board

A content object whose painter draws a block with `g.box` is a billboard: it keeps its yaw-0 look while the board turns
(exact at the quarter views, turned against the grid at odd angles). Opt in with `yawAware: true` on the object def:
the painter's `g.box` / `g.diamond` then stand on the view's ground quad, and `g.faces` tells you which sides show.
At yaw 0 everything draws exactly as before, so opting in never changes the default view.

```js
DD.registerObject({
  id: 'grimble_desk', name: 'Accounts Payable Desk', height: 1, yawAware: true,
  draw: function (g, obj, t) {
    g.box(0, 0, 20, 10, 18, { top: '#8a5a32', left: '#6e4426', right: '#55331c' }, true);
    // side details: per visible face, s = 0..1 along its bottom edge (left -> right on screen), up = px above it
    g.faces(0, 0, 20, 10).forEach(function (f) {
      const a = f.at(0.15, 12), b = f.at(0.85, 12);
      g.line(a[0], a[1], b[0], b[1], '#d9a83a', 1.4);                // a brass trim strip on every side
      if (f.dir === 'S') {                                             // the drawer pulls only on the front (south) side
        const p = f.at(0.5, 8);
        g.circle(p[0], p[1], 1.6, '#e8c84a', true);
      }
    });
    // things standing on the top: g.on(cx, cy, hw, hh, u, w, up) is a ground point of the footprint (u, w in tiles)
    const lamp = g.on(0, -18, 20, 10, 0.25, -0.2);
    g.glow(lamp[0], lamp[1] - 6, 10, '#ffd65a', 0.5);
  },
});
```

- `g.faces(cx, cy, hw, hh)` → `[{ dir, shade, frame, x0, y0, x1, y1, at(s, up), apply() }]`, left → right; `dir` is the
  physical side ('N' | 'E' | 'S' | 'W'; at yaw 0 you see 'S' then 'E'), `shade` 0 = the left colour … 1 = the right.
  `apply()` multiplies the context by the face map (x = s, y = −up) for patterns painted in face space (wrap it in
  `ctx.save()` / `restore()`).
- `g.quad(cx, cy, hw, hh)` → the footprint corners [NW, NE, SE, SW]; `g.mix(left, right, t)` → the face colour blend.
- Upright details (lamps, labels, faces, flames) stay billboards: place them with `g.on` / `f.at` and draw them with
  the usual `g.circle` / `g.text` / `g.rect`.
- Anything that points along the grid without being a block (arrows, rows, rails) uses `g.local(u, v)` → `[x, y]`.

### Gotchas (harness)

- `.tmp/rot/run.sh ident.html` = A/B identity (HEAD's iso + renderer as `window.R0`) + the leak check; `png=1` dumps
  frames, differing frames always land in `.tmp/rot/out/`. `shots.html` renders real fights at any yaws
  (`enc=…&yaws=…&zoom=2.2&tag=z_&busy=0`). `runrt.sh` = real-time variant (perf). All pages idle without `run=1`.
- Chrome rasterises an unread canvas a level off in rare pixels: read back (1 px) after every frame you compare. FX
  effects age every time they are drawn (shared by A and B): `DD.FXRender.clear()` before comparing. The first frame
  of a fight warms shared sprite caches: render one discarded frame per renderer first. The harness freezes
  `performance.now` while rendering (unfreeze for perf: `ROT_UNFREEZE`).
- `isolate=` breaks `render: units hidden behind bigger units get a silhouette` (its widget-lift fixture needs real hero
  sprite metrics): iterate on render suites WITHOUT `isolate` (`tools/test.sh "suite=render:"`, ~3 s).
- The test page never calls `DD.Render.init` / `start`: `running` is false, so every yaw change settles at once and
  `isViewMoving()` is only true during a rotate drag. Tests that change the live yaw must restore it with
  `r.setYaw(0, { keepFocus: false })` in `finally` (and `setScene(prev)`; `stateOverride` makes `DD.Input` think it is
  in combat even on another scene).
- Player gestures (`turn`, `rotateBy`, `resetView`, drags) schedule a 500 ms `viewYaw` write. It writes the yaw current
  at that moment and only if it differs from the stored value, so tests that end at 0 write nothing. `initYaw()` cancels
  a pending write.
- `tools/shot.sh "debug=1&screen=combat&encounter=…&rot=90"` captures any angle at boot. Use `.tmp/rot/run.sh shots.html
  "enc=…&yaws=…&zoom=2&turns=0&busy=0&tag=…"` for close-ups.
- `.tmp/rot/drag.html` boots the REAL game (main.js, the live loop, DD.Input on `#game`) and drives it with synthetic
  mouse PointerEvents; it stays idle unless the query has both `run=1` and `debug=1` (debug = silent; writing an .html
  file can pop it into the browser pane). Give it a short virtual-time budget (`VTB=17000 .tmp/rot/run.sh drag.html …`):
  the game loop never idles, so the default 600 s budget would run for many minutes. `sync=1` (with `runrt.sh`) times
  live frames synchronously from the window `load` event instead.
- Tests that need animated turns: `r._rot.sim(true)` + `r._rot.step(ms)` (and `sim(false)` in `finally`, which lands a
  running animation). Live-frame LOD without the loop: `renderTo(cv, { …, live: true })`; the harness clock is virtual,
  so budget tests swap in `r._rot.clock(fn)` (and restore it with `clock(null)`).
