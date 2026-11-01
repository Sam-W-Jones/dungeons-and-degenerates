# RENDER-SPRITES — notes

Files: `js/render/sprites.js`, `js/render/fx_render.js`, `js/render/audio.js`, `js/render/gallery.js`, `tests/sprite_tests.js`.

## Summary

- **`DD.Sprites`** (sprites.js) — procedural chibi painter for every SpriteSpec option in ARCHITECTURE §3.11:
  humanoid (5 builds, 8 outfits, 10 ears, 6 horns, 8 hair, 5(+1) beards, 13(+1) hats, 8 faces, 7 eyes, 8 mouths, 5 wings, 7 tails,
  22 main-hand + 9 off-hand props, 6 bling, 8 extras, 9 auras), quadruped (`legs`/`snout`/`body`/`fluff`), blob
  (`wobble`/`translucent`/`cube`), flyer (`bird`/`bat`/`imp`/`orb`/`wisp`), swarm (`rat`/`bat`/`bee`/`pixie`), construct
  (`golem`/`armor`/`totem`), `custom` (`spec.draw`) and `overlay`. Style: big heads, bold outlines (≈2 px at zoom 1),
  cel shading from the palette, idle bob + breathing + blinking, walk cycle, poses (idle/attack/cast/hurt/downed — downed
  lies on its back with X eyes and circling stars), facing flip, white hit flash, alpha, scale, status visuals
  (frozen = blue tint + ice, poison = green + bubbles, burn = flicker + flames, stealth = translucent, **sheep = a sheep**,
  stun stars, sleep Zzz, charmed hearts, confused ?, wet drips, root vines, invulnerable gold). A medium humanoid is ~38–40 px
  tall at zoom 1. Units with no/invalid sprite draw as an "unpainted miniature" (grey hooded mini on a base).
- **Portraits** — `DD.Sprites.portrait(idOrDefOrSpecOrUnit, size, opts)`: head-and-shoulders framing per base, radial
  background in the hero's `color` (else palette accent), vignette; cached per spec object + options.
- **`DD.FXRender`** (fx_render.js) — handlers for every `DD.FX` type (move, slide, jump, teleport, lunge, projectile (11
  kinds + custom), beam, explosion, particles (16 kinds), damage, heal, block, status, text, bark, death, downed, revive,
  spawn, shake, banner, flash, wait, call, tile, sound, custom) plus the drawWorld/drawScreen/shakeOffset layers.
  Respects `DD.FX.speed`; every visual has a lifetime (tested: the effect list drains to 0); visuals are cleared on
  `combat:start` and when the UI leaves the combat screen.
- **`DD.Audio`** (audio.js) — all 34 names of §7.6 as tiny WebAudio recipes (oscillator glides + filtered noise) through a
  compressor; lazy AudioContext on the first pointer/key/touch gesture; per-name 40 ms throttle, 14-voice cap, ±4% random
  pitch; follows `DD.Meta.data.settings.sfx/volume` unless `mute()`/`setVolume()` were called; silent no-op headless.
- **`DD.Gallery`** (gallery.js) — UI screen `gallery` (registered in `DD.afterLoad`, `scene: 'none'`, own full-window
  canvas): grid of every registered hero/summon/enemy with a big animated idle sprite, a zoom-1 pose strip
  (attack loop, cast, hurt, downed) and a portrait; click a cell (or `gallery=<id>`) for a detail page (all poses, walk,
  facing, 8 status variants, portraits 128/64/40/gray, in-game zoom-1 preview next to a reference adventurer, palette).
  Filters: `heroes | summons | enemies | bosses | act1 | act2 | act3 | objects | all | specs | specs:<group> | <id>`,
  comma lists merge (e.g. `gallery=specs:hats,specs:faces`). Spec sheets show `DD.Sprites.samples` (~190 samples covering
  every option + a showcase of hero/enemy-like specs). Wheel/arrows scroll, Esc goes back. Objects tab paints the world
  renderer's real object art (`DD.Render.drawTileAt`).
- **Tests**: 13 suites `sprites: …` (every option × pose × facing paints pixels, samples + portraits, drawUnit with
  vis/poses/statuses/overrides/placeholder, portrait cache + DOM-copy rule, broken content contained, metrics, all FX
  handlers start/update/end, queue playback convergence + speed, no leaks, FXRender bad input, audio, gallery).

## Public API (beyond the contract)

`DD.Sprites`
- `draw(ctx, spec, sx, sy, zoom, opts)` extra opts: `poseT` (0..1 attack swing progress), `walk` (stride phase),
  `lying` (0..1 fall-over amount), `phase` (idle desync), `still` (no idle motion), `blink` (bool override),
  `statuses` (Set/array/object of status ids), `tint`/`tintAmt`, `flashColor`, `squash` (-1..1), `lean`, `offX/offY/lift`
  (zoom-1 px), `scale` (extra multiplier), `hover` (true/px — flying lift), `dizzy` (stars when lying), `id` (for warnings).
- `drawUnit` reads `unit.vis`: `x/y/h` are the renderer's; it applies `alpha`, `flash`, `scale`, `offX/offY`, `downed`,
  `hidden`, `dead` + render-only fields written by fx_render (`pose, poseT, facing, lift, squash, walk, deathT, downT,
  reviveT, spawnT, flashColor`, honoured only while `vis._fxAt` is < 450 ms old so an interrupted FX can't leave a unit
  stuck mid-pose). Facing = `vis.facing` (set by move/lunge/projectile FX) else `unit.facing`. `def.flags.flying` → hover.
  Sprite override: `unit.sprite` or `unit.vis.sprite` = a SpriteSpec or a hero/enemy/summon id (e.g. Wild Shape).
- `metrics(specOrUnitOrId)` → `{ height, width, headY, hover, scale }` in px at zoom 1 (spec scale applied, `vis.scale`
  not) — for HP bars, barks, intent icons.
- `drawShadow(ctx, specOrUnit, sx, sy, zoom, alpha)`, `specFor(unit)`, `portraitURL(...)` (cached PNG data URL),
  `paint(ctx, x, y, scale, fn(g, t), palette, t)` and `painter(ctx, palette, t)` (use the `g` helper anywhere, e.g. object
  painters / UI icons), `invalidate(spec)`, `clearCache()`, `OPTIONS`, `DEFAULT_PALETTE`, `PLACEHOLDER`, `samples`,
  `sampleGroups`, `stats.portraitRenders`.
- `portrait(x, size, opts)` opts: `bg` (false = transparent, or a colour), `color`, `pose`, `facing`, `gray`, `border`
  (true/colour), `fill` (framing zoom), `square`, `t`. **If the cached canvas is already in the DOM a copy is returned**,
  so the same portrait can be shown in two places.
- Painter helper `g` (spec.draw / overlay): contract methods plus `g.limb(x1,y1,x2,y2,width,color,cx,cy)` (outlined
  capsule), `g.path(fn, fill, stroke, width)`, `g.shaded(fn, base, {dx,dy,hl,dark,light,stroke})` (cel shading),
  `g.glow(x,y,r,color,alpha)`, `g.star(x,y,r,fill,stroke,points,inner)`, `g.heart`, `g.flame(x,y,w,h,fill,stroke,lean)`,
  `g.note`, `g.shade(c,amt)`, `g.rgba(c,a)`; fields `g.pose, g.poseT, g.facing, g.blink, g.unit, g.spec, g.scale, g.zoom`.
  Stroke convention: `undefined`/`true` → outline colour at `g.lw`, `null`/`false` → none, string → that colour.
  `g.text` is never mirrored by the facing flip. Optional extra palette keys: `horn, ear, inner, wing, tail, beard, hat,
  mask, boots, pants, leather, belt, sash, scarf, cape, collar, fur, shield, book, wood, grip, lute, wand, quill, beak,
  belly, blush, glasses, cast, parchment`.
- Extra option values (backwards-compatible additions to §3.11): `head.hat: 'mushroom'` (spotted toadstool cap — spore
  folk), `head.beard: 'tentacles'` (mind flayers), quadruped `shape.legs: 'spider'` (8 jointed legs, head on the
  front of the body — cellar spiders), quadruped `shape.snout: 'beak'` (owlbears).
- Extra spec keys: `hover` (true/px), `mini` (draw a miniature base), `bounds {l,r,t,b}` (buffer bounds for custom
  painters that draw very wide), `portrait {x,y,r}` (portrait framing for custom painters; otherwise auto-measured),
  `height/width/headY` (metrics for `base: 'custom'`), `shape.stalks` (orb flyer eye-stalks = beholder),
  `shape.contents: 'bones'|'coins'` (translucent blob), `shape.socks: false`, `head.blush: false`.
- Unknown option values / bad colours draw as the default and `DD.warn('Sprite "<id>": unknown hat "x" …')` once.
  A throwing `spec.draw` warns once, then the unit draws as the placeholder; a throwing `overlay` is disabled.

`DD.FXRender`
- FX event extras: any event `sound: false | 'name'` (override the default sound); `move`/`text`/`particles`
  `sound: 'name'`; `particles { oy, spread }`; `projectile { arc: true|false|px, size, trail, draw(ctx,x,y,p,view,evt) for
  kind 'custom' }`; `beam { kind: 'lightning' | zigzag: true }`; `explosion { shake: false, kind }`; `tile { color, dur }`;
  `damage { cost: true }` (HP-cost number, purple); `death { cause: 'flee' }` (runs off and fades), `{ cause: 'fall' }`
  (shrinks into the pit); `custom` events with `draw(ctx, x, y, p, view, evt)` + `at`/`layer`.
- `clear()`, `count()`, `addEffect({ layer, at, life, draw(ctx, e, view), tick(e, dt) })`, `burst(atOrUnit, kind, count,
  color, oy)`, `text(unitOrTile, text, opts)`, `bark(unit, text, dur)`, `PARTICLE_KINDS`, `PROJECTILE_KINDS`,
  `ELEMENT_COLORS`, `handlers`.
- Sound sync: a `FX.sound` queued directly after a visual (the engine's `FX.damage(); FX.sound('hit')` pattern) is played
  when the visual **starts** and is then skipped by the sound handler — otherwise sounds would trail the animation by its
  duration. Default sounds per visual only play when no such queued sound exists.

`DD.Audio`: `names`, `isMuted()`, `getVolume()`, `ready()`, `unlock()`; `play` opts `{ vol 0..2, pitch, delay, exact }`.

`DD.Gallery`: `mount(root, params)`, `unmount()`, `show(which)` (main.js calls it), `draw(view)` (renders into the
world renderer's `gallery` scene only while the screen is not mounted), `resolve(filter)`.

## Deviations

- `portrait()` returns the cached canvas, or a fresh copy when the cached one is already attached to the DOM (a canvas
  can only live in one place). Identity caching still holds for off-DOM use.
- `drawUnit` applies `vis.offX/offY`, `vis.alpha` and `vis.scale` itself (the contract leaves the split open; the
  renderer's own comment agrees). Jump arcs/walk bob use the render-only `vis.lift` so the renderer's shadow stays on
  the ground.
- `DD.Audio.play` returns a boolean (true when scheduled).

## Requests

- **RULES** (`actions.js`): units start with `facing: side === 'hero' ? 1 : -1` regardless of map orientation, so on
  maps where the hero zone is screen-right the party faces away from the enemy until it moves. Setting the initial
  facing toward the nearest foe (screen dx) would read better.
- **RULES**, re your note about `encounter=test_a1_boss` screenshots freezing on the intro banner: that was the banner's
  `shadowBlur` glow — far too slow on headless software canvases, which stalls virtual time. Replaced with a stroked
  glow; the boss fight now advances in `tools/shot.sh` captures.
- **RENDER-WORLD** (done on your side, thanks): plain zoom / alpha into `drawUnit` — no double `vis.scale`/`vis.alpha`.
  FYI: back-to-back heavy canvas frames can stall headless Chrome's virtual time; the gallery redraws on a 250 ms timer
  when the UA is HeadlessChrome. The gallery's Objects tab now uses your `DD.Render.drawTileAt(..., { obj })`.

## Known issues

- Content authors design the real hero/enemy SpriteSpecs; my `showcase` samples only demonstrate what is possible.
- Very dark palettes (black raven, black-haired red tiefling) rely on the board's mid-tone tiles for contrast; there is
  no automatic rim light.
- Painting cost is roughly 0.3–0.6 ms per sprite at zoom 2 (auras with additive flames are the priciest); fine for the
  15-unit renderer budget test, but bosses with many layers + several flaming auras are the first thing to profile.
- Headless screenshots of the real `index.html` occasionally hang for unrelated reasons (remote Google Fonts + virtual
  time); retry or use a short virtual-time budget.
