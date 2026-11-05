# Dungeons and Degenerates — Technical Architecture (THE CONTRACT)

Every module is written against this document. If you must deviate, stay backwards compatible and record it in
`docs/notes/<your-area>.md` under **Deviations**. Game design (rules intent, numbers, tone) lives in `docs/DESIGN.md`.

---------------------------------------------------------------------------------------------------------------------

## 0. Ground rules

- Vanilla JavaScript (ES2020). No build step, no npm, no ES modules, no external JS libraries, no `fetch`/XHR.
  The game must run by double-clicking `index.html` (file://). Google Fonts `<link>` is allowed (graceful fallback).
- Each file is an IIFE: `(function () { 'use strict'; const DD = window.DD; ... })();`
- Load order is `js/manifest.js` (sequential classic scripts via `js/loader.js`). **At load time** a file may only
  attach to `DD`, call `DD.register*()`, `DD.registerNarration()` and `DD.afterLoad(fn)`. Cross-module calls happen
  at runtime only (after `dd:loaded`), so data files can load in any order after `js/core/*`.
- Game-logic randomness uses RNG instances (`DD.Combat.state.rng`, `DD.Run.rng()`), never `Math.random()`.
  Cosmetic-only randomness (particles, idle animations) may use `Math.random()` / `DD.rng`.
- Content hooks are called through `DD.safe()`; a broken hook logs `DD.warn('Error in …')` instead of crashing.
  Tests treat swallowed errors as failures.
- Grid coordinates: `x` = column (grows East), `y` = row (grows South). Cardinal directions only:
  N `{x:0,y:-1}` E `{x:1,y:0}` S `{x:0,y:1}` W `{x:-1,y:0}`. Distances are **Manhattan** unless stated.
- Player-facing text: English, comedic (see DESIGN.md). Keep tooltips short and numbers explicit.

## 1. Files & ownership

| Area | Owner | Files |
|---|---|---|
| Core | lead | `js/core/{namespace,util,rng,events,storage,fx_core}.js`, `js/loader.js`, `js/manifest.js`, `tests/harness.js`, `tests/test.html`, `tests/manifest.js`, `tools/*.sh`, docs |
| Rules engine | RULES | `js/engine/{grid,targeting,hooks,actions,ai,combat,autoplay}.js`, `js/data/{statuses,terrain}.js`, `tests/{fixtures,engine_tests,content_tests}.js` |
| Map generation | MAPGEN | `js/engine/{mapgen,encounter}.js`, `js/data/{themes,wildmagic}.js`, `tests/mapgen_tests.js` |
| World rendering | RENDER-WORLD | `js/render/{iso,renderer,input}.js`, `tests/render_tests.js` |
| Sprites / FX / audio | RENDER-SPRITES | `js/render/{sprites,fx_render,audio,gallery}.js`, `tests/sprite_tests.js` |
| Run / meta | META-RUN | `js/run/{meta,run,runmap,rewards}.js`, `js/data/scars.js`, `tests/run_tests.js` |
| UI shell & screens | META-UI | `js/ui/ui.js`, `js/ui/screens/*.js`, `css/style.css`, `js/main.js`, `index.html` (may add font link), `tests/ui_tests.js` |
| Combat HUD | HUD | `js/ui/combat_hud.js` |
| Content | per file | `js/data/heroes/*.js`, `js/data/enemies/*.js`, `js/data/bosses/*.js`, `js/data/{skills_generic,items,consumables,events,narrator}.js` |

Notes/hand-offs: `docs/notes/<area>.md` (owned by that area). Never edit another area's files; if you need a change
there, write it under **Requests** in your notes file (the lead integrates).

## 2. Core (already implemented — read the source)

- `DD.util` — clamp, lerp, key/unkey, manhattan, dirTo, rotateDir, DIRS, pick/shuffle/weightedPick/sample(rng),
  deepClone, uid, escapeHtml, fmt, roman, plural, shade/rgba/parseColor, hash.
- `DD.RNG(seed)` → `{next, float, int(a,b inclusive), chance, pick, shuffle, sample, weighted, fork, getState, setState}`.
- `DD.Events` — `on(name, fn) → off`, `once`, `off`, `emit`, `clear`.
- `DD.Storage` — `get(key, fallback)`, `set`, `remove` (memory store in tests).
- `DD.FX` — visual event queue, see §7.4. Logic pushes; renderer plays; `DD.FX.busy()` locks combat input.
- `DD.safe(label, fn, this, args)`, `DD.warn(msg)`, `DD.params` (URL), `DD.debug`, `DD.headless`.
- Registries `DD.defs.*` + `DD.register*` + getters `DD.getHero/getSkill/getStatus/getItem/getConsumable/getEnemy/
  getSummon/getTerrain/getObject/getSurface/getEncounter/getEvent/getScar`.
- `DD.skillLevel(def, level)` → `levels[level-1]`; `DD.skillDesc(def, level, user)`; `DD.resolve(v, L, user, fb)`.
- `DD.registerNarration(key, lines)`, `DD.narrate(key, vars, rng)`; `DD.afterLoad(fn, order)`.

---------------------------------------------------------------------------------------------------------------------

## 3. Data definitions

### 3.1 Hero — `DD.registerHero(def)`
```js
{
  id: 'zarathor', name: 'Zarathor', epithet: 'the Bedazzled', race: 'Tiefling', cls: 'Warlock',
  role: 'Ranged fire chaos', complexity: 2,            // 1-3
  blurb: '2-3 funny sentences for party select.',
  color: '#e25822',                                    // UI accent
  unlock: null,                                        // null = starter; { act: N } = unlocked by first clear of act N;
                                                       // { boss: enemyId } = unlocked the first time that boss is beaten
  stats: { hp: 26, ap: 3, mov: 4, armor: 0 },          // level-1 base
  growth: { hp: 4 },                                   // per level-up
  flags: {},                                           // flying | hop (climb 2 levels) | large | immovable
  sprite: SpriteSpec,                                  // §3.11
  basic: 'zar_basic',                                  // skill id — always available, never socketed
  signature: 'zar_signature',                          // skill id — costs 100 Hype (skill.hype = 100), never socketed
  passive: { name: 'Drip Check', desc: '...', hooks: { /* §5.3 */ } },
  startingSkills: ['zar_fireball', 'zar_hex'],         // exactly 2 (socketed at run start)
  skillPool: [ /* 9-11 hero skill ids incl. startingSkills */ ],
  summons: [],                                         // optional: summon ids this hero can create (for codex/tests)
  barks: { select:[], start:[], move:[], kill:[], hurt:[], lowhp:[], downed:[], revive:[], ally_down:[],
           levelup:[], victory:[], idle:[], signature:[] },  // 3-6 lines each
}
```

### 3.2 Skill — `DD.registerSkill(def)` (heroes, generic, enemy and summon skills)
```js
{
  id: 'zar_fireball',             // prefix with owner abbreviation (zar_, syl_, mar_, mrw_, cor_, jos_, ell_, spa_, gen_, a1_, ...)
  name: 'Gold-Plated Fireball',
  owner: 'zarathor',              // hero id | 'generic' | 'enemy' | 'summon'
  icon: '🔥',                     // one emoji
  kind: 'spell',                  // 'attack'|'spell'|'buff'|'heal'|'summon'|'move'|'utility'  (silenced blocks 'spell')
  tags: ['fire','aoe','ranged'],  // free-form; conventional: melee ranged aoe fire frost lightning poison push pull heal summon
  ap: 2,                          // AP cost (heroes/summons; enemies ignore). number | (L, user) => number
  hpCost: 0,                      // HP paid on use (never below 1). number | (L, user) => number
  cooldown: 2,                    // number | (L) => number. See §6.4
  charges: 0,                     // max uses per combat (0 = unlimited)
  hype: 0,                        // Hype cost (signatures: 100)
  levels: [ { dmg: 7, r: 1 }, { dmg: 9, r: 1 }, { dmg: 11, r: 2 } ],   // 1-3 entries; maxLevel = levels.length
  target: {
    type: 'unit',                 // 'unit' (click a unit) | 'tile' | 'self' | 'dir' (one of the 4 adjacent tiles)
    range: [1, 5],                // [min, max] Manhattan; may be (L, user) => [min, max]
    los: true,                    // needs line of sight to the target tile
    filter: 'enemy',              // 'enemy'|'ally'|'allyOrSelf'|'any'|'notSelf'|'empty'|'emptyOrUnit'|'downedAlly'|'object'
    straight: false,              // target must share the user's row or column
    canTarget: null,              // optional (ctx) => true | 'reason'
    objects: undefined,           // v2: false = never aimed at a volatile object; true = may be (see below)
    revive: undefined,            // v2: false = a heal never aimed at a downed ally; true = may be (any area)
  },
  area: { shape: 'circle', size: 1 },   // §5.2 shapes; size may be (L, user) => n. Default { shape: 'single' }
  anchor: 'self',                 // enemy intents only: 'self' | 'ground' | 'unit' (§6.1)
  desc: (L, user) => `Deal ${L.dmg} fire damage in radius ${L.r}. Ignites oil.`,   // must be correct for every level
  flavor: 'A fireball is just a hot opinion with range.',
  canUse: null,                   // optional (ctx) => true | 'reason'  (checked before targeting)
  execute(ctx) { /* effects via DD.Act — see §5.4 */ },
  aiScore: null,                  // optional (ctx) => number  — extra desirability for AI/autoplay
  preview: null,                  // optional (ctx) => { [unitId]: { dmg?, heal?, text? } } for HUD previews
}
```
**ctx** (built by `DD.Targeting.buildCtx(user, skillOrSlot, target)`):
```js
{ user, skill, slot /* SkillSlot|null */, level, L /* levels[level-1] */,
  target /* {x,y}|null */, targetUnit /* Unit|null */, dir /* cardinal {x,y} from user toward target, or user's facing */,
  tiles /* [{x,y}] affected (area applied, in-bounds) */, units /* active units on tiles */,
  foes /* units on tiles hostile to user */, friends /* units on tiles friendly to user (incl. user) */,
  isIntent /* true when executed as an enemy intent */, intent /* Intent|null */,
  state /* DD.Combat.state */, rng /* state.rng */,
  targetObj /* v2: the volatile object aimed at (execute does not run: it detonates), else absent */,
  reviveTarget /* v2: the downed ally a heal is aimed at (DD.Act.heal on it revives it), else absent */ }
```
**v2 (user requests) — what single-target skills can be aimed at** (`DD.Targeting.aimsAtObjects` / `revivesWith`; the
player's units only — heroes and hero-side summons; the AI never does either):
- **Volatile objects** (barrels): a `'unit'` target with the `'enemy'` filter that is `kind: 'attack'`, the user's basic
  attack, or a consumable without a `kind` (`target.objects: true` opts any such skill in, `false` opts out) can be aimed
  at a volatile object (§3.7) within its range and line of sight (`canTarget` is not asked). The use pays its costs
  (AP, HP, cooldown, charge, Hype) and **detonates** the object (`DD.Act.detonate`: destroyed, its `onDestroyed` blast
  credited to the user); `execute` does not run (no riders). validTargets entries carry `obj: objectId`.
- **Downed allies**: a `'unit'` target with the `'ally'` / `'allyOrSelf'` / `'any'` filter, `kind: 'heal'` or tag `'heal'`,
  no area (`target.revive: true` opts in, `false` out) can be aimed at a downed ally (validTargets entries carry
  `revive: true`; `ctx.targetUnit` = `ctx.reviveTarget` = the ally). Its `DD.Act.heal` on that ally gets it back up with
  the healed amount as HP (§6.8). **Content**: an aimed heal must call `DD.Act.heal(user, ctx.targetUnit, n)` even when the
  target is downed (no `active()` early return) and apply its riders after the heal.
Hero/summon skills: `execute` should use `ctx.foes`/`ctx.friends`/`ctx.targetUnit` and DD.Act. Damage numbers in
`desc` must match `execute`. Enemy skills use the same schema with `owner: 'enemy'` and (usually) `ap: 0`.
**Conventions**: put the primary damage per affected foe in `levels[i].dmg` and primary healing in `levels[i].heal` —
the default AI planner and autoplay estimate value from them (plus `aiScore`). Tag skills with random outcomes `'random'`
(HUD previews show "?"). `execute` must tolerate `ctx.targetUnit === null` for tile/dir skills and units that died
mid-resolution (always re-check `unit.dead` after damage). Enemy `telegraph` text comes from `name` + `desc`.

### 3.3 Status — `DD.registerStatus(def)`
```js
{ id: 'burn', name: 'Burning', icon: '🔥', color: '#ff7a1a', type: 'debuff',  // 'buff' | 'debuff'
  stacking: 'stack',   // 'stack': stacks add, turns = max · 'refresh': stacks = max, turns = max · 'none': ignore re-apply
  maxStacks: 99, decay: 'turnEnd',   // when `turns` ticks down: 'turnEnd' | 'turnStart' | 'never'
  desc: (st) => `Takes ${st.stacks} fire damage at the end of its turn.`,
  hooks: { onTurnEnd(unit, st) { ... } } }   // §5.3 hook names; status hooks receive the instance `st` as LAST arg
```
Instance on a unit: `{ id, stacks, turns, source /* unit id|null */, data: {} }`; `turns: -1` = until removed.
Content may register extra statuses (prefix with owner abbreviation, e.g. `syl_roasted`). Core list: §6.5.

### 3.4 Item — `DD.registerItem(def)`
```js
{ id: 'ring_excessive_bling', name: 'Ring of Excessive Bling', slot: 'trinket',   // 'weapon'|'armor'|'trinket'
  rarity: 'rare',                    // 'common'|'rare'|'legendary'|'cursed'
  icon: '💍',
  stats: { hp: 0, ap: 0, mov: 0, armor: 0, dmg: 0.10, heal: 0, range: 0, block: 0, hype: 0 },
      // dmg/heal: fractional bonuses to damage dealt / healing done · range: +max range of skills with max range ≥ 2
      // block: Block at combat start · hype: Hype at combat start (party total)
  hero: null,                        // optional hero id restriction
  desc: 'One sentence of mechanics.', flavor: 'One joke.',
  hooks: {},                         // §5.3 (item hooks receive the item def as LAST arg)
  price: null }                      // default by rarity: 40 / 80 / 150 / cursed 25
```

### 3.5 Consumable — `DD.registerConsumable(def)`
`{ id, name, icon, rarity: 'common'|'rare', desc, flavor, ap: 1, target: {...}, area: {...}, execute(ctx), price }`
Party-wide inventory (max 3 by default). Using one costs `ap` (default 1) and removes it. `ctx` as for skills.

### 3.6 Enemy — `DD.registerEnemy(def)` (also bosses and enemy-side summons)
```js
{ id: 'a1_gob_grunt', name: 'Goblin Grunt', act: 1, tier: 'normal',   // 'minion'|'normal'|'elite'|'boss'
  hp: 14, mov: 3, armor: 0,
  tags: ['goblin'], flags: { flying: false, immovable: false, stunImmune: false, large: false },
  resist: { fire: 1 },               // element -> damage multiplier (0 = immune, 0.5 = resist, 1.5 = weak)
  sprite: SpriteSpec,
  skills: ['a1_gob_stab'],           // enemy skill ids (owner 'enemy'); cooldowns apply
  ai: 'default',                     // 'default' | { style: 'melee'|'ranged'|'support'|'coward'|'summoner'|'kamikaze', keepDistance: n }
                                     // | function plan(unit, api) — custom planner (§5.6)
  xp: 4, gold: [2, 5],
  hooks: {},                         // §5.3 (e.g. onDeath: split into two smaller slimes)
  barks: { spawn: [], attack: [], hurt: [], death: [] },
  desc: 'Codex / tooltip flavor.',
  boss: null }                       // bosses: { title: 'The Tax Collector', intro: 'line', music: null }
```
Hero summons use `DD.registerSummon(def)`: same shape (no act/tier) plus `ap` (default 2); they are player-controlled,
side `'hero'`, `kind: 'summon'`, die at combat end and never count for victory/defeat.

### 3.7 Terrain / Object / Surface
```js
DD.registerTerrain({ id: 'stone', name: 'Stone', walkable: true, cost: 1, blocksLos: false,
  pit: false,            // true: impassable hole; pushed units fall (§6.6)
  liquid: null,          // 'water' | 'lava' | 'deep' (affects elements/rendering)
  tall: 0,               // extra visual height in tiles (walls ~1.5)
  colors: { top: '#777', left: '#555', right: '#444' },
  onEnter(unit, tile, cause) {}, onTurnEnd(unit, tile) {}, desc: '' });

DD.registerObject({ id: 'crate', name: 'Crate', blocksMove: true, blocksLos: false,
  hp: 6,                 // 0 = indestructible
  height: 0.8,           // render height in tiles
  interact: null,        // { ap: 1, label: 'Pull', fn(unit, obj, tile) {} } — adjacent hero spends AP
  onEnter(unit, obj, tile) {},            // for non-blocking objects (plates, spikes) — walkers only (v2: never flyers)
  onDestroyed(obj, tile, src) {},
  volatile: false,       // v2: it explodes when destroyed (onDestroyed → DD.Act.explode): single-target attacks can be
                         //   aimed at it to set it off (§3.2). Every exploding object must say so (instances may too)
  desc: '', draw: null /* optional (g, obj, t) custom painter, see §7.3 */ });

DD.registerSurface({ id: 'fire', name: 'Fire', color: 'rgba(255,110,20,0.55)', turns: 3, blocksLos: false,
  airborne: false,       // v2: true = a CLOUD (steam, smoke, gases): it touches flyers too, and it may hang over pits and
                         //   lava (setSurface / setTerrain keep it there). Everything else lies on the floor, and flyers
                         //   ignore the floor (§6.6). Only clouds are airborne.
  onEnter(unit, tile) {}, onTurnEnd(unit, tile) {}, desc: '' });
```
**Flyers and the floor (v2, user request).** A flying unit (`DD.Grid.isFlying`: `flags.flying` from its def, an item or a
Blessing, or a status def with `flying`) ignores everything on the floor, good and bad: terrain `onEnter` / `onTurnEnd`,
non-airborne surfaces, ground objects and traps (`onEnter`: plates are never pressed), floor element reactions (a slick
going up), shocks through water, ice slides, falls; hazards are none for it (§5.1). Attacks and spells aimed at it or its
area, explosions' blast damage, unit-centred auras and clouds (`airborne`) still hit it. **Content** that implements a
floor effect itself (an `onEnterTile` / `onTurnStart` / `onRoundEnd` hook that reads the unit's tile, a passive "while
standing on…") checks `DD.Grid.feelsFloor(unit)` (or `DD.Grid.feelsSurface(unit, surface)`).

Object **instance** on a tile: `{ id, hp, maxHp, data: {}, facing?, label?, interact?, onInteract?, onDestroyed?, onEnter? }`.
Instance-level callbacks override the definition's (bosses wire puzzles this way via `DD.Act.placeObject(x, y, id, overrides)`).
Puzzle objects also set `autoplay` (§5.7) so AutoPlay can solve them.

**Canonical core ids** (RULES registers them in `js/data/terrain.js`; RENDER-WORLD draws them nicely; anything else
falls back to the def's `colors`/`color`/`height` or its own `draw`):
- Terrain — floors: `stone, cobble, dirt, grass, wood, sand, moss, crypt, obsidian, felt, paper, gold, carpet, grate,
  marble` · special: `wall, pit, water, deep_water, lava, mud, ice, rubble, bridge`.
- Objects: `crate, barrel, barrel_explosive, keg, pillar, rock, tree, dead_tree, bush, mushroom, gravestone, coffin,
  statue, lever, pressure_plate, chest, fountain, brazier, spikes, totem, bookshelf, candles, mirror, d20, soda_can,
  pencil, gold_pile, bones, fence, pipe, valve`.
- Surfaces: `fire, poison, water, oil, ice, blood, web, steam, smoke, holy, electric, cheeto`.
Content-specific terrain/objects/surfaces use an owner prefix (e.g. `mar_marbles`, `cor_rune`, `dm_screen`) and should
provide `colors`/`color` (and optionally `draw`).

### 3.8 Encounter — `DD.registerEncounter(def)`
```js
{ id: 'a1_goblin_ambush', act: 1, kind: 'normal',      // 'normal' | 'elite' | 'boss'
  name: 'Goblin Ambush', intro: 'Narrator line shown at start.', weight: 1,
  minDepth: 0,                                         // earliest act-map row this can appear on
  map: { theme: 'cellar', w: 10, h: 10, features: ['barrels', 'water'], density: 1 }      // procedural (§5.8)
     | { theme: 'cellar', layout: ['..#..', ...], heights: ['00110', ...], legend: { 'L': { obj: 'lever' } } },
  enemies: [ { id: 'a1_gob_grunt', n: [2, 3] }, { id: 'a1_gob_slinger', n: 1 } ],   // n: number | [min,max]
  objective: { type: 'killAll' },                      // §6.9
  reinforcements: [ { round: 3, enemies: [ { id: 'a1_gob_grunt', n: 2 } ], edge: 'N' } ],  // edge: N|E|S|W|'zone'
  rules: [],                                           // global rule objects (§5.5)
  onStart(state) {}, onRoundStart(state) {}, onRoundEnd(state) {},   // optional scripting
  reward: { goldMult: 1, itemRarity: null } }
```

### 3.9 Event — `DD.registerEvent(def)`
```js
{ id: 'mimic_hug', acts: [1, 2], weight: 1, unique: true, icon: '🎁',
  title: 'A Chest That Wants a Hug',
  text: (run) => 'Narration paragraph (2-5 sentences).',
  requires: (run) => true,                             // optional
  choices: [
    { label: 'Hug it.', hint: 'Lose HP, gain loot?', requires: (run) => true,
      resolve: (api, run) => { api.damage(6); api.giveItem({ rarity: 'rare' }); return 'Outcome text.'; } },
    { label: 'Walk away.', resolve: (api) => 'It looks so sad.' } ] }
```
`resolve` returns outcome text (string) or `{ text, combat: encounterIdOrSpec }` to start a fight afterwards. API §9.5.

### 3.10 Narration keys
`DD.registerNarration(key, lines)`; tokens `{hero} {enemy} {n} {gold} {name}`. Keys used by engine/UI:
`combat_start, elite_start, boss_start, victory, defeat, kill, env_kill, overkill, multi_kill, hero_downed, hero_revived,
hero_death, level_up, signature, round_start, enemy_turn, shop_greet, shop_buy, shop_broke, shop_leave, tavern_greet,
rest, recruit, map_enter, act_intro_1, act_intro_2, act_intro_3, act_clear, treasure, tips, gameover_title,
victory_title, run_start, idle_dm`.

### 3.11 SpriteSpec (procedural sprites; renderer §7.3)
```js
{ base: 'humanoid',        // 'humanoid'|'quadruped'|'blob'|'flyer'|'swarm'|'construct'|'custom'
  scale: 1,                // 0.6 tiny · 0.8 small · 1 medium · 1.3 large · 1.8-2.4 boss
  palette: { skin: '#c0392b', cloth: '#3b1f4a', cloth2: '#f1c40f', hair: '#222222', metal: '#d4af37',
             eye: '#ffeb3b', accent: '#ff6f00', outline: '#1a1014' },
  build: 'normal',         // humanoid: 'tiny'|'slim'|'normal'|'stocky'|'huge'
  outfit: 'robe',          // 'robe'|'tunic'|'armor'|'furs'|'coat'|'rags'|'dress'|'none'
  head: { size: 1,
    ears: 'none',          // 'none'|'elf'|'goblin'|'rabbit'|'rabbit_floppy'|'cat'|'dog'|'bear'|'pointy'|'rat'
    horns: 'none',         // 'none'|'tiefling'|'ram'|'demon'|'antlers'|'unicorn'
    hair: 'none',          // 'none'|'short'|'long'|'wild'|'mohawk'|'bun'|'ponytail'|'braids'
    beard: 'none',         // 'none'|'stubble'|'short'|'long'|'wild'
    hat: 'none',           // 'none'|'wizard'|'hood'|'crown'|'tophat'|'plague'|'helmet'|'viking'|'beret'|'flowers'|'bandana'|'mortarboard'|'cowl'
    face: 'none',          // 'none'|'plague_mask'|'skull'|'bandit_mask'|'glasses'|'monocle'|'sunglasses'|'eyepatch'
    eyes: 'normal',        // 'normal'|'glow'|'angry'|'sleepy'|'big'|'cyclops'|'none'
    mouth: 'none' },       // 'none'|'smile'|'grin'|'fangs'|'tusks'|'frown'|'open'|'gold_teeth'
  wings: 'none',           // 'none'|'fairy'|'bat'|'bird'|'demon'
  tail: 'none',            // 'none'|'devil'|'rabbit'|'cat'|'lizard'|'dog'|'rat'
  mainhand: 'none',        // 'none'|'staff'|'sword'|'greatsword'|'axe'|'greataxe'|'dagger'|'bow'|'crossbow'|'lute'|'book'|'wand'|'cane'|'flask'|'scythe'|'club'|'spear'|'orb'|'torch'|'scroll'|'quill'|'hammer'
  offhand: 'none',         // 'none'|'shield'|'flask'|'book'|'orb'|'torch'|'lantern'|'scroll'|'dagger'
  bling: [],               // gold accessories in palette.metal: 'chain'|'rings'|'earrings'|'crown'|'grill'|'bracelets'
  extras: [],              // 'scarf'|'cape'|'belt'|'bandolier'|'sash'|'pouches'|'satchel'|'collar'
  aura: null,              // { kind: 'flames'|'glow'|'sparkles'|'smoke'|'runes'|'blood'|'notes'|'leaves'|'bubbles', color }
  shape: {},               // base-specific knobs: quadruped { legs:'short'|'long', snout:'long'|'short'|'flat', fluff:bool, body:'long'|'round' }
                           //   blob { wobble: 1, translucent: bool, cube: bool } · flyer { body:'bird'|'bat'|'imp'|'orb'|'wisp' }
                           //   swarm { count: 5, of: 'rat'|'bat'|'bee'|'pixie' } · construct { kind:'golem'|'armor'|'totem' }
  draw: null,              // custom painter (g, t, opts) used when base === 'custom'
  overlay: null }          // painter (g, t, opts) drawn after the base for extra details
```

### 3.12 Random passive — `DD.registerPassive(def)` (the Table of Questionable Blessings, DESIGN §7.1)
```js
{ id: 'rp_lucky_socks',          // prefix 'rp_'
  name: 'Lucky Socks', icon: '🧦',
  rarity: 'common',               // 'common' | 'uncommon' | 'rare' | 'legendary' | 'cursed'
  weight: 10,                     // table weight; default by rarity: 10 / 6 / 3 / 1 / cursed 4
  levels: [ { pct: 10 }, { pct: 15 }, { pct: 25 } ],   // 1-3 levels; rolling an owned passive upgrades it (maxLevel = levels.length)
  stats: null,                    // optional { hp, ap, mov, armor, dmg, heal, range, block, hype } or (L, level) => {...}
  hooks: {},                      // §5.3 combat hooks; LAST arg = the instance { id, level, L, def, data } (data: per-fight scratch)
  runMods: null,                  // optional run-layer modifiers: (L, level) => { gold, xp, price, heal } fractions (§9.6)
  requires: null,                 // optional (runHero, heroDef) => bool — may this hero roll it?
  tags: [],
  desc: (L, level) => 'Exact mechanics for this level.',   // or a string
  flavor: 'One joke.' }
```
RunHero `passives: [{ id, level }]` (max 4). In combat, hero units carry `unit.passives` = fresh instances
(`DD.passiveInstance`) and their hooks fire after scars (§5.3); their stats add to `heroStats` like items. Helpers:
`DD.getPassive(id)`, `DD.passiveInstance(entry)`, `DD.passiveStats(entry)`, `DD.passiveDesc(entry)`. The sandbox
accepts `heroes: [{ id, passives: ['rp_x', { id: 'rp_y', level: 2 }] }]`.

---------------------------------------------------------------------------------------------------------------------

## 4. Runtime state shapes

### 4.1 Combat state — `DD.Combat.state`
```js
{ id, seed, rng,                 // rng = DD.RNG
  round: 0,                      // 0 = before initiative (deployment); round 1 starts when initiative is rolled
  phase: 'setup'|'deploy'|'initiative'|'player'|'enemy'|'over',
                                 // deploy: deployment open, no initiative yet · initiative: the order is being rolled and
                                 // round 1 is starting (only 'initiative:rolled' / round-1 'round:start' and onRoundStart
                                 // see it) · player: a hero-controlled turn waits for input · enemy: AI turns resolving
                                 // (inside endTurn: only listeners see it) · over: result set
  // v2 initiative & turns (§6.1)
  order: null | [ { unitId, roll, init, total, side, k, tie, fixed } ],   // fixed for the fight; k = entry # of that unit
  turnIndex: -1,                 // index in order of the current (or last) turn
  current: null | unitId,        // whose turn it is (null before initiative and between turns)
  turn: 0,                       // turns started so far (a cheap "a new turn began" key)
  heroTurns: 0,                  // hero-controlled turns started so far (the wind-up window, §5.6)
  turnLive: false,               // the current turn is past its start-of-turn ticks (statuses applied now are `fresh`)
  joining: [ entry ],            // units that rolled mid-round; they join `order` at the next round start
  initMode: 'roll'|'heroesFirst'|'enemiesFirst', initOrder: null | [unit or def ids],   // start / sandbox options
  grid: { w, h, tiles: Tile[] }, // index y*w+x — use DD.Grid.tile(x, y)
  theme: 'cellar',
  units: Unit[],                 // includes dead units (dead: true) — always filter
  hype: 0,                       // 0..100
  encounter, objective: { type, text, ...progress },
  rules: [ Rule ],               // §5.5
  deploy: { active: true, tiles: [{x,y}] },
  log: [ { round, text, cls } ], // cls: 'dmg'|'heal'|'status'|'kill'|'narrator'|'system'|'enemy'|'hero'
  stats: { units: { [unitId]: { dmg, taken, kills, heals } }, envKills, hypeGained, xp, gold, downs, goldGained, objects },
  result: null | 'victory' | 'defeat',
  difficulty: { hp: 1, dmg: 1 },
  run: RunState | null,          // null in sandbox/tests
  noActFirst, aiOff,             // sandbox: AI units pass in round 1 (noPlan) / always (enemyAi: false)
  data: {} }                     // free-form scripting state for encounters / rules / bosses (previews copy it)
```

### 4.2 Tile
`{ x, y, h /*0..4*/, t /*terrain id*/, surface: null|{ id, turns, data }, obj: null|ObjInstance, zone: null|'hero'|'enemy', tag: null|string }`

### 4.3 Unit
```js
{ id: 'u7', defId: 'zarathor', kind: 'hero'|'enemy'|'summon', side: 'hero'|'enemy', name,
  x, y, hp, maxHp, block: 0, armor: 0,
  ap: 0, maxAp: 3, mov: 4,
  flags: {},  tags: [],  resist: {},
  statuses: [ StatusInstance ],
  dmgBonus: 0, healBonus: 0, rangeBonus: 0,       // from items/scars (fractions / tiles)
  // heroes
  runHero: RunHero|null, basic: SkillSlot, signature: SkillSlot, skills: SkillSlot[], items: [itemIds], scars: [scarIds],
  // enemies
  skillSlots: SkillSlot[], intents: Intent[] /* v2: pending WIND-UPS only (§4.5) */, tier,
  // summons
  ownerId: unitId|null,
  // shared (v2)
  init: 0,                  // initiative modifier: heroes stats.init (+ items / scars / passives), enemies def.init or by
                            //   tier (minion +1, normal 0, elite +1, boss +2), summons def.init (used only if orphaned)
  apBank: 0,                // AP given outside the unit's turn (DD.Act.gainAp), added at the start of its next turn
  order: n,                 // 1-based position of its first initiative entry (HUD badges); 0 = none
  facing: 1|-1, data: {} /* free-form content state */, dead: false, downed: false,
  vis: {...} }                                    // render-only, managed by DD.FX
```
"Active" = `!dead && !downed`. Downed heroes stay on their tile (they occupy it, cannot act, are not targetable) and
keep their initiative slot.

### 4.4 SkillSlot
`{ id, level, cd: 0, uses: 0, usedThisTurn: false, fresh }` (`fresh`: the cooldown started this turn, the next tick is
skipped; `usedThisTurn` resets at the start of its owner's turn).

### 4.5 Intent — v2: boss WIND-UPS (and the record of an AI action)
Normal enemies keep no intents between turns: an AI action is an intent record built and executed at once (`ctx.isIntent`,
`ctx.intent`). The only stored intents are **wind-ups** (`DD.AI.windUp`): visible pending actions that resolve at the
START of their owner's next turn (or after `turnsLeft` of its turns), unless it is stunned / asleep / frozen / sheep or
dead by then. A wind-up never lands before the heroes had a turn to answer it (`window`, §5.6).
```js
{ id, skillId, windup: true,     // false on an action resolved at once
  turnsLeft: 1,             // own turns until it lands; delay = turnsLeft and pending = true (pre-v2 names, kept)
  window: n,                // state.heroTurns it waits for before it may count down (made on a hero turn or in
                            //   deployment: now; anywhere else: the next hero turn to start) — reset to "one more hero
                            //   turn" per countdown
  anchor: 'ground'|'unit'|'self',
  abs: { x, y },            // 'ground' (the wind-up default): fixed target tile; its area is frozen into `tiles`
  unitId,                   // 'unit' (opts.track): follows that unit, fizzles if out of range / sight (or stealthed)
  rel: { dx, dy },          // 'self': relative to its owner (push the boss and the attack moves with it)
  dir: { x, y }, tiles,     // tiles: absolute for 'ground', offsets {dx,dy} for 'self' / 'unit'
  label, icon, dmg, dmgAuto, data: {}, level, ownerId, round }   // data.unstoppable: no stun / sheep interrupts it
```

### 4.6 Run state — `DD.Run.state`
```js
{ version: 1, seed, rngState, difficulty: 'casual'|'normal'|'brutal',
  act: 1, map: ActMap, nodeId: null, visited: [],
  party: [ RunHero ],                // 4 entries (dead heroes stay with dead: true until replaced)
  gold: 60, inventory: [itemIds], consumables: [consumableIds], maxConsumables: 3,
  stats: { combats, kills, damage, goldEarned, downs, deaths, elites, bosses, actsCleared, levelUps, startedAt },
  flags: {}, seenEvents: [], pending: null }   // pending: resumable UI step, e.g. { type: 'rewards', data }
RunHero = { id /*hero id*/, level: 1, hp, skills: [ { id, level } ] /*≤4*/,
            items: { weapon: null, armor: null, trinket: null }, scars: [], downs: 0, dead: false, kills: 0,
            perks: [], pendingLevels: 0, levelChoices: null,   // levels gained whose boon is not chosen yet
            passives: [ { id, level } ] /*≤4, §3.12*/, passiveRolls: [] }
```
v2 (DESIGN §3): **there is no XP.** A RunHero has no `xp`; `level` rises only through level-ups (§9.2 "Leveling"),
each applying its HP growth at once and leaving a pending boon (`pendingLevels`) plus a Blessing roll. Saves from the
XP era load as they are: `xp` fields (heroes, pending rewards data `xp` / `xpByHero` / `levelsGained`) are dropped,
levels and pending choices kept; the rotation evens out uneven old levels (lowest first).

### 4.7 Meta — `DD.Meta.data` (persists across runs)
`{ unlocked: [heroIds], stats: { runs, wins, bestAct, deaths, kills }, settings: { animSpeed: 1, sfx: true, volume: 0.6,
shake: true, unlockAll: false, showGrid: true, viewYaw: 0, rotSnap: true }, seen: { enemies: {}, bosses: {}, events: {} },
history: [] }`. Render-owned settings (written by `DD.Render` through `DD.Meta.setSetting`): `viewYaw` = the remembered
battlefield view angle in degrees (0.1 steps, absent = 0; written 500 ms after a player's turn of the map settles, never
from `rot=`), `rotSnap` = a released rotate drag snaps to a classic view within 4° (absent = true; the Settings toggle
"Snap rotation to the classic views").

---------------------------------------------------------------------------------------------------------------------

## 5. Engine APIs

### 5.1 `DD.Grid` (RULES) — map queries on `DD.Combat.state.grid`
```
tile(x,y) → Tile|null            inBounds(x,y)            key(x,y)            allTiles() → Tile[]
unitAt(x,y) → Unit|null (non-dead; downed count)
neighbors(x,y) → Tile[] (4-dir)   dist(a,b) (Manhattan)    dirTo(a,b)
terrain(tile) → def               isPit(x,y)               blocksLos(x,y)
isWalkable(x, y, unit?)           // terrain walkable, no blocking object, no pit (flying ignores pit/liquid)
isFree(x, y)                      // walkable and no unit (dead units don't count; downed do)
canStep(unit, from, to)           // height rule: up ≤1 (hop ≤2, flying any), down any
los(a, b) → bool                  // §6.3
path(unit, x, y, opts) → [{x,y}]|null           // excludes start; opts.maxCost, aoo (fewest attacks of opportunity, §6.2)
reachable(unit, maxCost, opts) → Map<key, { x, y, cost, path, hazard, edge, provokes? }>   // passes through friends, not foes
                                  // opts.aoo (a MOVE action, §6.2): each path provokes as few attacks of opportunity as
                                  // possible within maxCost (then the cheapest); entries get provokes: [unitIds] in order
provokes(unit, path, from?) → [unitIds]         // who would make an attack of opportunity on that walk (DD.Act.provokers)
line(from, dir, len, opts) → [{x,y}]           // opts.stopAtBlock, stopAtUnit, includeUnitTile
shape(shape, origin, dir, size, user) → [{x,y}] // §5.2 (in-bounds only)
emptyTilesNear(x, y, r) → [{x,y}]  randomEmptyTile(rng, filterFn)  nearestFree(x, y)
hazardAt(x, y, unit?) → id|null                 // damaging hazard for this unit (§5.3 `hazard`, per unit if a function)
hazardDamage(x, y, unit?) → { id, enter, end }|null   // rough numbers for AI risk (hazardDmg / hazardEnd)
                                  // v2: both PER UNIT, the one place hazard checks are made (move previews, paths, the AI,
                                  //   AutoPlay): a flyer only feels airborne surfaces; a hazard declaring what it does
                                  //   (hazardElement / hazardStatus, §5.3) is none for a unit that ignores all of it
surfaceHazard(x, y, unit?) → id|null · harmlessTo(def, inst, unit) → bool       // the same, per layer / per def
hostile(a, b) · effectiveSide(u) · isFlying(u) · isDrop(x, y) · stepCost(unit, from, to)
isEdge(x, y, unit?)               // next to a pit / deep water / lava; per unit (v2): never a flyer, lava only if it can hurt it
feelsFloor(unit) → bool           // v2: not flying — the floor (terrain, surfaces, ground objects) touches it
feelsSurface(unit, surface) → bool  // surface (def, id, tile.surface instance or tile): clouds touch everyone, the rest walkers
```

### 5.2 `DD.Targeting` (RULES) — skills ↔ tiles
```
range(user, skill, level) → [min, max]   (applies rangeBonus/modifyRange, never < min)
validTargets(user, skillOrSlot) → [{x,y}]
area(user, skill, level, target) → [{x,y}]
buildCtx(user, skillOrSlot, target {x,y}|null, extra) → ctx (§3.2)
preview(user, slot, target) → { tiles, units, perUnit: { [id]: PreviewEntry }, uncertain, samples, spawned, objects, hype }
simulate(fn(sim, rec), opts) → fn's result   // dry run on a copy (opts.seed: other dice; opts.record → { result, draws, uncertain })
pure(fn) → fn()                               // a query: combat-RNG draws inside are put back
// v2 (user requests, §3.2)
aimsAtObjects(user, skillOrSlot) → bool       // can be aimed at a volatile object (validTargets entries { x, y, obj })
revivesWith(user, skillOrSlot) → bool         // a single-target heal that can be aimed at a downed ally ({ x, y, revive })
volatileAt(x, y) → obj|null                   // a volatile object on a tile no unit stands on
```
Previews (v2): aimed at a barrel, `detonates: objectId` and `tiles` = the blast (the object's tile + every tile its
explosions reached, for the HUD's area); every preview has `blast: [{x,y}]` (the tiles of the explosions it set off, never
those of the real roll); aimed at a downed ally, `revives: unitId` and that ally's entry has `revived: true` (`heal` = its
new HP, text `"UP! 7 HP"`; uncertain: `revivedChance`). A def `preview()` override is skipped for both.
`preview` is a **dry run**: the skill resolves on a deep copy of the state (same code path as a real use: costs,
hooks, Hype, deaths) with FX / events / log / run gold silenced, then everything is restored. `PreviewEntry = { dmg
(HP lost), blocked, heal, block (gained), lethal, statuses: [added ids], removed: [ids], moved: {x,y}|null,
uncertain, text }` (text like `"−6 · Burn 2 · moved · KO"`); `spawned: [{ defId, name, x, y, side, kind }]`,
`objects: [{ x, y, id, dmg, destroyed }]`, `hype` (gained). A def `preview(ctx)` override returns
`{ [unitId]: { dmg, heal, blocked, block, text } }` (missing numbers are 0).
**Fairness — previews never give a roll away.** The copy would know the next roll, so when the dry run draws from the
combat RNG (a `random` skill, a proc, a Wild Surge) the preview is `uncertain` and is computed from `SAMPLES` (8) dry
runs on *other* dice: their common outcome when they all agree, else their **expected outcome** — per entry `dmg /
heal / blocked / block` = rounded means with `dmgMin`/`dmgMax`… ranges, `lethal` = at least half the runs
(`lethalChance`), `statuses` / `removed` = at least half (`statusChance` / `removedChance` per id), `moved` = the most
common tile (`movedChance`), `text` like `"? −3–9 · Burn 50% · KO 40%"`, `samples` = runs averaged. Whether dice are
rolled depends only on the visible state, so the flag itself tells nothing. Engine bookkeeping draws (loot gold,
summon names) and draws undone by `pure` don't count. Without a draw the outcome is fixed and shown exactly; a
`random` tag, `DD.Act.markUncertain()` or `ctx.uncertain = true` during the run still flag it uncertain.
**A preview that is not `uncertain` predicts the outcome exactly** (the `content:` suites check every skill).
Area shapes (origin = target tile unless noted; `dir` = cardinal from user to target):
`single` · `circle` (Manhattan radius `size`) · `square` (Chebyshev radius) · `ring` (Manhattan distance == size) ·
`cross` (plus with arms of length `size`) · `line` (from the tile next to the user toward dir, length size; stops at
walls; `pierce:false` → stops at first unit) · `cone` (from user: row k has width 2k-1, k=1..size) · `row`
(perpendicular to dir through target, half-width size) · `adjacent` (4 tiles around the user) · `all_foes`/`all_allies`
(every such unit's tile) · `custom` (`area.fn(ctx) → tiles`).

### 5.3 `DD.Hooks` (RULES) — passives, items, statuses, scars, rules
Hook sources of a unit (in order): hero passive / enemy or summon def `hooks` → `unit.hooks` → items → scars → random
passives (§3.12) → statuses → `state.rules`.
`DD.Hooks.fire(name, unit, ...args)` calls each source's `hooks[name](...args, sourceExtra)` (passive / def, item def,
scar def, random-passive instance, status instance or rule object as LAST argument), wrapped in `DD.safe`; the last
non-undefined result is returned. `DD.Hooks.fireAll(name, ...args)` fires for every active unit (unit prepended).
`some(name, unit, ...args)` (true if any source returned true: veto hooks), `fireOwn(name, unit, ...)` (without the
`state.rules` sources), `fireRules(name, ...args)` (each rule once), `each(unit, cb, noRules)`, `has(name, unit)`.
Hook names (all optional; `unit` = the unit whose sources fire, i.e. `fire(name, unit, unit, …)`):
```
onCombatStart(unit)           onCombatEnd(unit, result)        onRoundStart(unit, round)
onTurnStart(unit)             onTurnEnd(unit)                  // v2: the unit's OWN turn (summons: their owner's), §6.1
modifyInitiative(r)           // v2, the unit's sources when it rolls initiative: r = { unit, roll, init, total, k };
                              //   mutate r.total ("+5 initiative", "always first") — rolled fights only
onMove(unit, path)            onEnterTile(unit, tile, cause)   // cause 'move'|'push'|'teleport'|'spawn'
modifyOpportunity(o)          // v2 attacks of opportunity (§6.2), the attacker's sources, then the mover's: o = { attacker,
                              //   mover, from, to, slot, skill, level, flat: 0, mult: 1, cancel: false } — set cancel
                              //   ("can't be opportunity-attacked"), add flat / mult ("+2 damage on attacks of
                              //   opportunity"). PURE: the HUD's move preview, paths and the AI query it
onOpportunityAttack(o)        // after one resolved, the attacker's sources then the mover's: o + dealt (HP + Block lost)
onSkillUsed(ctx)              // after a skill resolves (user's sources); ctx.paid = what onCostPaid got (or null)
modifyCost(c)                 // c = { unit, skill, level, ap, hp } mutate to change costs
onCostPaid(p)                 // after paying a use: p = { unit, skill, level, slot, ap, hp (HP lost), hpCost (asked),
                              //   hype, consumable } — what was really paid (HP costs never go below 1 HP)
modifyRange(r)                // r = { unit, skill, min, max }
modifyMoveCost(m)             // m = { unit, ap }: AP of one move action (1; a Confused hero 2), rounded, min 0
modifyOutgoingDamage(d)       modifyIncomingDamage(d)          // d = DamageCtx, mutate d.mult / d.flat
modifyFinalDamage(d)          // target's sources: the last word on d.amount (after armor and Marked, before Block);
                              //   e.g. HP gates: to lose at most n HP, d.amount = Math.min(d.amount, n + block absorbed)
onDealDamage(d)               onTakeDamage(d)                  // after damage applied
preventDeath(unit, d)         // before a unit dies or (hero) is downed: return true to refuse it — nothing of a death
                              //   happens (no bark, log, loot, Hype, onDeath/onKill); the unit keeps the HP the hook
                              //   set (else 1 after damage, its HP before an instant kill; a refused fall climbs out)
onKill(d)                     onDeath(unit, d)                 onDowned(unit, d)
onAllyDeath(unit, deadUnit)   // same side, active
onAllyDowned(unit, downed, d) // a hero of the unit's side went down (heroes are downed, not killed)
onAnyDeath(unit, dead, d)     // every active unit's own sources; each state.rules rule once, with unit = null
modifyHeal(h)                 // target's sources, incoming healing: h = { unit, src, base, amount, cause, cancel }
onHealed(unit, amount, src)   onStatusApplied(unit, st, src)
modifyStatus(s)               // s = { unit, id, stacks, turns, src, cancel }: mutate, or set cancel = true to block it
modifyPush(p)                 // target's sources, forced movement: p = { unit, src, dir, dist, cancel }
modifyOutgoingPush(p)         // the pusher's sources, same p, BEFORE modifyPush ("your pushes go 1 tile further")
threatAt(enemy, unit, tile)   // QUERY, enemy def or a status on it: damage `unit` would take on `tile` from this enemy's
                              //   effects other than its own actions and wind-ups before that unit's next turn (auras,
                              //   gazes, end-of-round fees) → number | { dmg, label, ignoreBlock }. Callers (AutoPlay,
                              //   HUD): fire('threatAt', enemy, enemy, unit, tile), throws / undefined = 0. Must be pure.
```
v2: `modifyGuard` is gone with Guard (unused AP is simply lost); a content hook of that name is reported as unknown.
`DamageCtx = { source, target, base, amount, mult: 1, flat: 0, element, skill, tags, cause, ignoreBlock, ignoreArmor,
dealt, blocked, killed, overkill, highGround, credit, nullified, prevented, opportunity }` (`cause`: 'skill'|'status'|
'surface'|'terrain'|'bump'|'fall'|'explosion'|'other'; `nullified`: charm / resist 0 — nothing gets through;
`prevented`: the death was refused; `opportunity`: a hit of an attack of opportunity, §6.2). A hook's own
`d.mult = 0; d.flat = n` deals exactly n.
**Declarative extras the engine reads** (pure, so AI estimates, wind-up numbers and previews can use them):
- Status defs: `defaultTurns`; `skipFresh: false` (v2 default true: a status applied during its owner's own turn skips
  the tick at the end of that turn, so `turns: 1` = "through its next turn"; false = that turn's end counts),
  `stunLike` (it loses its next turn like Stun: 0 AP / the AI turn passes, wind-ups interrupted, `stunImmune` covers it),
  `noMove: true | (st, unit) => bool` (can't take move actions, like Root: a grapple, a hold; pushes still work),
  `takenMult: number | (st, unit) => number` (damage-taken multiplier, applied next to Vulnerable and read by
  `DD.AI.estimate`), `telegraphFlat(st, unit) → number` (flat change of the unit's damage numbers: wind-ups and reach
  estimates, see §5.6). The pre-v2 `enemyDecay: 'afterPlan'` is gone (no planning phase). v2: `element` (the element of
  the damage it deals: burn 'fire', poison 'poison' — a unit with resist 0 to it can't be hurt by it, so hazards that only
  apply it are none for that unit), `flying: true | (st, unit) => bool` (its unit flies while it has it).
- Skill defs: `telegraphFlat(unit, intent) → number`; rules in `state.rules`: `telegraphFlat(unit, intent, rule)` (both
  for wind-up numbers). Enemy / summon defs (v2): `init` (initiative modifier; default by tier), `turnsPerRound` (1-4
  initiative entries, e.g. a boss with two turns a round).
- Terrain / object / surface defs (and object instances): `hazard: true | (unit, tile) => bool` (per-unit: a cloud
  that only hurts its brewer's foes warns only them; `unit` may be null = anyone), `hazardDmg` (on entry, default 4),
  `hazardEnd` (ending a turn there), v2 `hazardElement` (the element of its damage) and `hazardStatus` (a status id or a
  list it applies) — a unit that shrugs off all of it (resist 0, flags.immune, a status whose element it ignores) gets
  no warning (Pebbles in fire, slimes in poison): declare them on every hazard; surfaces `airborne` (a cloud: flyers
  feel it, §3.7), terrain/surfaces `slide`, `react` (§6.6), objects `init(obj, tile)`, `available(obj, unit)`,
  `smashable`, `volatile` (§3.7), `onRoundEnd(obj, tile, state)`, `autoplay` (§5.7).
- Unit flags (v2, §6.2): `noProvoke` (its move actions never provoke attacks of opportunity), `noOpportunity` (it never
  makes them).

### 5.4 `DD.Act` (RULES) — every gameplay effect goes through here (FX + hooks + log + stats)
```
damage(src, target, amount, opts) → dealt            // opts: element, skill, tags, cause, ignoreBlock, ignoreArmor, noHighGround, silent
damageTiles(src, tiles, amount, opts) → [{unit, dealt}]   // opts.filter: 'foes'|'friends'|'all' (relative to src), hitObjects: true
damageObject(src, x, y, amount) → destroyed (bool)
heal(src, target, amount, opts) → healed
addBlock(target, n)
addStatus(target, id, { stacks = 1, turns }, src) → instance|null     // turns default: def.defaultTurns ?? -1
removeStatus(target, id) · hasStatus(target, id) · getStatus(target, id) · cleanse(target, 'debuff'|'buff', count)
push(src, target, dir, dist, opts) → { moved, blockedBy, fell, to }   // opts.bump (default 3); dir = cardinal
pull(src, target, toward {x,y}, dist, opts)          knockback(src, target, dist)   // away from src
teleport(target, x, y, opts) → bool                  swap(a, b) → bool               moveAlong(unit, path, opts)
spawn(enemyId, x, y, opts) → Unit|null               // enemy-side by default; opts: side, hpMult, noFx
summon(owner, summonId, x, y, opts) → Unit|null      // hero-side controllable summon
kill(target, src, opts)                              revive(target, hpFraction)
setSurface(x, y, id|null, turns) · applyElement(x, y, element, src)   // §6.6 interactions
setTerrain(x, y, terrainId) · setHeight(x, y, h) · placeObject(x, y, objId, overrides) → obj · removeObject(x, y)
interact(unit, x, y) → bool
gainHype(n, reason) · gainAp(unit, n) · setCooldown(unit, skillId, n) · resetCooldowns(unit)
                                 // gainAp v2: spendable now on the unit's own turn, else banked (unit.apBank, ± n) and added
                                 // at the start of its next turn ("+1 AP next turn")
cancelIntents(unit, reason)      // interrupt its pending wind-ups (v2: there is no taunt retarget of intents any more)
isOwnTurn(unit)                  // its own turn is under way (past the start-of-turn ticks): statuses applied now are fresh
bark(unit, keyOrText) · log(text, cls) · narrate(key, vars)
gold() · gainGold(n) · spendGold(n) → bool · loseGold(n) → actual   // run gold (sandbox uses state.sandboxGold)
addRule(rule) · removeRule(id) · endCombat(result)
stopMove(unit)                   // from a tile callback / onEnterTile: the current walk ends on this tile (no status)
markUncertain()                  // during a preview dry run: its outcome depends on chance (§5.2); no-op otherwise
cantMove(u) · isStunned(u) · isStunLike(statusId) · takenMult(u)   // Root/noMove · stun-likes · takenMult product
touch()                          // count a side effect done without DD.Act (Undo, deploy, previews see it)
// v2 attacks of opportunity (§6.2)
opportunitySlot(u) → slot|null   // what it strikes with: a hero's melee basic; summons / enemies: first ready melee skill
opportunityOf(attacker, mover, from?, to?) → o|null   // would it strike the mover leaving `from` (default its tile)? PURE
provokers(mover, path, from?) → [Units]               // who would strike on that walk, each once, in order. PURE
opportunityAttack(attacker, mover, to) → o|null       // resolve one now (moveAlong does it for move actions)
// v2 user requests (§3.2, §3.7, §6.6, §6.8)
isVolatile(obj) → bool · detonate(src, x, y, skill) → bool   // set off a volatile object (Combat.resolveSkill does it)
immuneTo(unit, statusId) → bool  // can't get it (flags.immune, stunImmune for stun-likes / sheep, bosses vs sheep). Pure
heal(...)                        // a heal AIMED at a downed ally (ctx.reviveTarget of the running skill) revives it with the
                                 //   healed amount (after healBonus and modifyHeal — h.revive = true — min 1, max HP)
revive(target, hpFraction, { hp, by })   // opts.hp: exactly that HP · applyElement(..., { noUnits, floor })
```
`moveAlong(unit, path, opts)`: `opts.provoke` = a MOVE action (DD.Combat.move, AI walks): leaving a tile next to opposing
units triggers their attacks of opportunity (§6.2); without it (skill dashes, scripted walks) nothing provokes. Returns the
walked tiles with `.provoked` (attacks made) and `.interrupted` (one ended the walk).
Extras: `damage` opts `noHighGround, silent, reflect`; `addStatus` opts `{ silent }` (a stun-like or `sheep` interrupts
the target's wind-ups at once, except `data.unstoppable` ones; v2 drops `noRecharm`: charm re-aims nothing, it flips the
unit's side for its next turn); `kill(...)` → false when `preventDeath` refused it;
`push` opts `{ bump, stopAt, slide }` → `{ moved, blockedBy, fell, to, hitUnit }`; `teleport` opts `{ noEnter, fx }`;
`swap(a, b, { force, noEnter, src })`; `withCredit(src, fn)` (credit environmental kills), `fall(unit, src)`,
`explode(src, x, y, { radius, dmg, element, surface, turns })`, `splash(x, y, r, surfaceId, turns, src)`,
`destroyObject(x, y, src)`, `enterTile(unit, tile, cause)`, `isBoss(u)`, `isImmovable(u)`, `face(unit, to)`.
Tile callbacks (`onEnter` of terrain / surface / object) count as a side effect (a move that triggered one can't be
undone) only if they change something through DD.Act, call `touch()`, or roll the combat RNG.

### 5.5 `DD.Combat` (RULES) — state + initiative + turn flow + player action API
```
start(setup, opts) → state      // setup from DD.Encounter.build(); opts: { run, seed, headless, onEnd(result, state),
                                //   difficulty, kind, deploy (false: skip deployment), initiative ('roll' default |
                                //   'heroesFirst' | 'enemiesFirst'), order: [unit or def ids] (listed first), noPlan, enemyAi }
                                // with deploy tiles the fight waits in phase 'deploy'; otherwise it rolls initiative at once
sandbox(cfg) → state            // tests/debug: { w, h, theme, seed, floor, heroes: [{ id, x, y, level, skills, items, hp,
                                //   passives }], enemies: [{ id, x, y, hpMult }], summons, objects, surfaces, terrain(tile),
                                //   objective, rules, encounter, reinforcements, deploy + deployTiles, difficulty, gold,
                                //   consumables, run, onEnd, initiative (default 'heroesFirst': no dice), order,
                                //   noPlan (AI units pass their round-1 turns), enemyAi: false (AI units always pass) }
state
units() · active(side?) · heroes() · party() · enemies() · foesOf(u) · friendsOf(u) · unitAt(x,y) · byId(id)
// v2 initiative & turns
rollInitiative() → bool         // "Roll for initiative!": ends deployment, rolls, starts round 1 (false if already rolled)
order() → [{ unitId, roll, init, total, side, k, unit, index, current, acted, downed }]   // this round, living units
current() → Unit|null           // whose turn it is · turnGroup() → [Unit] (it + the summons acting on its turn)
isTurnOf(u) · isActing(u)       // u acts on the current turn · ... and that turn is past its start-of-turn ticks
turnOwner(u) → Unit|null        // the unit whose turn u acts on (itself with an entry; a summon's owner)
joining() → [entry]             // rolled mid-round, join at the next round start · noteArrival(u) (Act.spawn/summon)
isPlayerControlled(u)           // heroes and hero-side summons; everything else is AI-controlled on its own turn
isDeploying() · initOf(u) · TIER_INIT
endTurn() → bool                // ends the current hero turn (unused AP is lost), then resolves every following AI turn
                                //   (FX queued) until the next hero turn or the end; in deployment = rollInitiative()
endRound() → bool               // passes every remaining hero turn of the round; returns at the next round's first hero turn
giveTurnTo(u) → bool            // SANDBOX ONLY: abandon the current turn (no end ticks) and start u's (its owner's for a
                                //   summon); an AI unit acts at once, then play continues from its place in the order
setOrder([unit or def ids])     // SANDBOX ONLY: those first, the rest in their old order
isPlayerTurn()                  // a hero-controlled turn waits for input, or deployment is open · isOver()
// actions (only for a unit whose turn it is: controllable(u); in deployment the first one rolls initiative)
reachable(unit) → Map           // needs the AP of a move (moveApCost), not rooted / held (noMove) / stunned; v2: AoO-aware
                                //   paths (fewest attacks of opportunity), entries carry provokes: [unitIds] ("⚔ provokes N")
provokes(unit, x, y) → [{ unitId, name, skillId, skillName, dmg }]   // that move's attacks of opportunity (dmg: estimate
                                //   after armor, before Block); [] if none or unreachable. Pure
move(unit, x, y) → bool         // moveApCost AP (1); walks path; onEnterTile per tile; a MOVE action: provokes attacks of
                                //   opportunity (§6.2; one that downs / stuns / roots / moves it ends the walk); true once
                                //   the action happened
canUse(unit, slot) → true | 'reason'    // 'Roll for initiative first!', "Not X's turn.", 'Stunned!', 'Not enough AP.'...
targets(unit, slot) → [{x,y}]
preview(unit, slot, x, y) → (see Targeting.preview)
useSkill(unit, slot, x, y) → bool      // pays AP/HP/cooldown/hype, executes, fires hooks, checks end
useConsumable(unit, index, x, y) → bool
interactions(unit) → [{ x, y, label, ap, kind }] · interact(unit, x, y) → bool
                                // kind 'object' | 'helpUp' (2 AP) | 'smash' (1 AP, 5 damage to destroy-objective
                                // targets and objects flagged smashable)
slotsOf(u) · costOf(u, def, level) → { unit, skill, level, ap, hp } · consumables() · canUseConsumable(u, i)   // HUD helpers
moveApCost(u) (modifyMoveCost) · effectiveMov(u) · turnAp(u) · isStunned(u) · cantMove(u) · cooldownOf(u, def, level)
resolveSkill(u, slotOrDef, target, { pay, consumable, extra, quiet }) → ctx   // shared by heroes, AI actions, previews
                                // v2: ctx.targetObj (aimed at a volatile object) → it pays, then DD.Act.detonate instead
                                //   of execute (onSkillUsed still fires)
deployMove(unit, x, y) → bool   // free swaps inside deploy tiles while deployment is open (no tile entries, no cost)
canUndo() · undo() → bool       // the current turn's last move action, if nothing else happened since (no side effect;
                                //   never a move that provoked an attack of opportunity)
addRule(rule) / removeRule(id)  // Rule = { id, name, icon, desc, hooks, turns /* rounds; -1 = permanent */, telegraphFlat?, onAdd?, onRemove? }
```
Events emitted on `DD.Events`: `combat:start`, `combat:changed` (after every public mutation), `combat:log`,
`combat:end` ({result}), `initiative:rolled` ({ order: [{ unitId, name, side, roll, init, total, k }], rolled: bool } —
the dice moment), `initiative:joined` ({ unit, entries }), `round:start` ({round}), `round:end` ({round}),
`turn:start` / `turn:end` ({ unit, unitId, round, turn, index, entry }), `turn:player` ({ round, unit }: a hero turn
waits for input), `turn:enemy` ({ round, unit }: once per run of AI turns), `windup:start` / `windup:cancel`
({ unit, intent | reason }), `opportunity:attack` ({ attacker, attackerId, mover, moverId, skillId, from, to }: right
before an attack of opportunity resolves), `unit:died`, `unit:downed`, `hype:changed`. FX markers for playback (no
duration of their own): `turn` (FX.turn: `DD.FX.shownTurn = { unitId, round }` follows it), `initiative` ({ order }),
`windup`.

### 5.6 `DD.AI` (RULES) — AI turns (no telegraphs) and boss wind-ups
```
act(unit) → bool                // the unit's whole turn body (DD.Combat calls it on AI turns): a stun-like → the turn is
                                //   lost ("loses the turn"); sheep → wanders; else def.ai(unit, api) or the default turn
useNow(unit, skillId, target, opts) → Intent|null   // build an action and execute it at once (intent.resolved)
windUp(unit, skillId, target, opts) → Intent|null   // boss WIND-UP (below); opts: turns (1), track, anchor, tiles, label,
                                //   icon, dmg, data (unstoppable), dir, level, noCooldown, banner
resolveWindups(unit) → n        // start of its turn (DD.Combat): count down, land the due ones (or interrupt them)
windups() → [{ unit, unitId, intent, tiles, turnsLeft, label, icon, dmg, skillId }]   // HUD / renderer list
executeIntent(unit, intent) → bool              // resolve an action / due wind-up now (taunt, dazzle, confuse, silence)
makeIntent(unit, skillId, target, opts) → Intent // a SILENT pending action on the unit (a wind-up resolving at its next
                                //   turn start; opts.turns / delay); opts.noAdd: only build the record
intentTarget(unit, intent) → {x,y}|null · intentTiles(unit, intent) → [{x,y}]   // current, after pushes
intentDmg(unit, intent) → number   // the live wind-up number (see below)
describe(unit, intent) → { label, icon, dmg, text, uncertain, delay, turnsLeft, windup, targetName }
reachOf(unit) → { tiles: Map 'x,y' → dmg, best, only, unitId }   // where it could strike on its next turn (estimate)
threatMap(side = 'hero') → Map 'x,y' → { dmg, max, from: [unitIds] }   // every AI unit hostile to that side
styleOf(u) → { style, keepDistance } · estimate(u, o, dmg, element, noEmpower?) → number · defaultPlan(u, style?)
  (= defaultTurn: decides and acts now) · approach(u, style?) · bestAttack(u, { skills, noMove, style }) → { moveTo, path,
  skillId, slot, target, score } | null · targetsFor(u) · taunter(u) · pathRisk(u, pos)
// v2 attacks of opportunity + reach-aware targeting (below, §6.2)
reachableTargets(u, { skills, noMove, style }) → [{ unit, skillId, target, moveTo, path, cost, provokes, aoo, engaged,
  est }]                        // every foe it can hit THIS turn, the cheapest way; engaged first, then fewest provokes
engaged(u) → [Units]            // opposing units next to u that would strike if it walked away now
provokes(u, x, y) → [unitIds] | null   // its move action there would provoke these (null: can't get there)
opportunityDmg(attacker, mover, from?) → number · aooCost(u, pos, style?) → number (Infinity = lethal) · aooDamage(u, pos)
targetValue(u, o, est, style?, origin?) · targetBonus(style, { kill, hurt, engaged, thr, maxHp, hero }) · threatOf(o)
  · isDiver(styleOrUnit)        // the targeting formula (AutoPlay models the AI with it)
clearIntents(u, keepWindups) · cancelIntents(u, reason, { keepUnstoppable }) → n · redirectIntent(u, intent, t)
api (passed to custom planners): { state, rng, round, unit, entry (its initiative entry), style, heroes(), foes(u),
  friends(u), reachable(u) (AoO-aware, entries with provokes), reachableTargets(u, opts), engaged(u), provokes(u, x, y),
  aooCost(u, pos), moveTo(u, x, y) (a move action: fewest-provoke path, provokes), act(u, skillId, target, opts) → bool
  (now), windUp(u, skillId, target, opts), addIntent / setIntent(u, skillId, target, opts) (v2: now, or a wind-up when
  opts.delay / turns / windup), clearIntents(u), bestAttack(u, opts), defaultPlan / defaultTurn(u, style?),
  approach(u, style?), tilesFor(u, skillId, target), canUse(u, skillId), slot(u, skillId), dist, los,
  randomEmptyTile(filter) }
```
v2 removed `planAll`, `plan`, `executeAll`, `recharm`, `turnOn`, `retarget`, `cancelSpellIntents` (no planning phase, no
re-aiming of telegraphs; see `docs/notes/v2-migration.md`).
Custom planner: `def.ai = function (unit, api) { ... }` runs ON THE UNIT'S TURN and acts: `api.moveTo` walks now,
`api.act` / `api.addIntent` (no delay) resolve the skill now, `api.windUp` (or `addIntent` with `delay`) records a wind-up.
- **Wind-ups**: a visible pending action that resolves at the START of its owner's next turn (`turns: n` → after n of its
  turns). Default anchor `'ground'` (fixed tiles: the area now), `track: true` → `'unit'` (follows the target, fizzles out
  of range / sight or when the target is stealthed), `anchor: 'self'` → relative to the owner (pushes move it).
  Announced (FX text + `windup` marker, log, `windup:start`; `opts.banner` → a banner). A stun-like or `sheep` interrupts
  it at once (`windup:cancel`), so does the owner's death (`windup:cancel`, reason `'death'`); `data.unstoppable` ignores
  those. At resolution taunt does NOT re-aim it; dazzle shifts it 1 tile, confuse turns it, a silenced spell fizzles,
  charm flips who counts as a foe.
  **The heroes always get a window**: a wind-up counts down (and lands) only at an owner's turn start that comes after a
  hero turn started since it was announced or last counted down (`intent.window` vs `state.heroTurns`). Announced while
  the player is in control (a hero's turn, or deployment: deploy out of the red), that is the window (so a one-entry
  boss lands it at its very next turn, as above); announced on an AI turn, at a turn or round start, or at combat start
  without deployment, it waits for the next hero turn first. So a boss with two entries back to back
  (`turnsPerRound: 2`) or a wind-up made in its own `onTurnStart` never lands without warning; `turns: n` = n of its
  turns that follow a hero turn.
- **Actions now**: taunted → an attack (L.dmg > 0, kind 'attack' or an 'enemy' target filter) must reach the taunter
  (re-aimed if the skill can) or it fizzles ("Taunted, can't reach!"); the default planner only scores the taunter
  (out of reach: it walks toward it). Dazzled: lands 1 tile off; confused: a quarter turn; silenced: no spells (the
  planner skips them, execution fizzles them); charmed: hostility flipped for its turn (it attacks its own side);
  sheep: wanders; stun-like: no turn. Cooldowns start when the action happens (a wind-up: when it is made).
- **Style** (`styleOf`): `def.ai` as a style (`'ranged'` or `{ style, keepDistance }`), else `def.aiStyle` (for function
  planners), else by reach of the damage skills: the default planner by its longest (≥ 3: ranged, keepDistance ≤ 3), a
  function planner by its shortest (a bruiser with one long leap stays a bruiser). `style` args take the same forms.
  Styles: `melee` (default), `ranged`, `support`, `coward`, `summoner`, `kamikaze`, and (v2) the divers `assassin` /
  `skirmisher` (same behaviour).
- **Targeting (v2, reach-aware)**: the default planner scores every (tile it can walk to this turn × ready skill ×
  target) — what it can actually reach now (walk cost ×0.2, LOS and ranges via its candidates) — as
  `est (damage after armor…) + targetValue + position`, with `targetValue` (= `targetBonus`): most styles +4 for a foe
  it is **engaged** with (next to its turn-start tile; support 2, ranged / summoner 1, coward 0), + min(3, ¼ × the foe's
  best damage number) (threat), +5 for a kill (+2 if a hero), + 1.5 × the share of HP the foe is missing (a tiebreak).
  Divers (`assassin` / `skirmisher`): +14 for a kill (+6 hero), + 8 × HP share missing, up to +4 for a low max HP, no
  engagement bonus, walk cost ×0.05. The walk's **attacks of opportunity** (its `provokes`) cost `aooCost` = their
  estimated hits × 1.5 (divers 0.5, kamikaze 0.75) + 2 each, and **Infinity if they would drop it** (it never walks into
  a lethal one); a taunted unit pays 0.5 each (taunt drags it to its taunter). Paths are the fewest-provoke ones.
  `approach` (nothing in reach) adds the same cost. Custom planners: `api.reachableTargets(u)` lists what it can hit
  this turn, engaged foes first — prefer it to "the weakest hero on the map" unless the unit is meant to dive.
- **Wind-up numbers** (`intentDmg`, honest by contract: it deals what it shows): `round(L.dmg × attacker multipliers
  (Weak, Inspired, Empowered, item dmg, difficulty)) + Σ status telegraphFlat(st, unit)`, then, if > 0,
  `+ skill.telegraphFlat(unit, intent) + Σ rule.telegraphFlat(unit, intent, rule)` (min 0). An explicit `dmg` shows that.
- **Reach** (`reachOf`, for the HUD's threat shading and AutoPlay): its tile + `DD.Grid.reachable` with its move, then
  every tile within the reach of a damaging skill ready on its next turn (range + area extent; walls and sight ignored past
  the walk), valued at that skill's number. Empty for stun-likes, sheep and units with no such skill; `only` = the
  taunter while taunted. Pure.
- **estimate** reads the attacker multipliers, high ground, Vulnerable, statuses' `takenMult`, resist, Wet lightning,
  Marked, armor and invulnerability (no hooks: it runs thousands of times per decision); `noEmpower` (attacks of
  opportunity) leaves Empowered out.
- Held (`noMove`) / rooted units decide without moving. `moveTo` / `api.moveTo` walks are move actions (they provoke);
  a walk ended early by an attack of opportunity makes the default turn aim again from where it stopped.

### 5.7 `DD.AutoPlay` (RULES)
`takeTurn()` — greedy control of the CURRENT turn (v2: the current hero and the hero-side summons acting on it; in
deployment it rolls initiative first); it does not end the turn.
`runBattle(maxRounds = 30) → { result, rounds, timeout }` — rolls initiative if needed, then loops takeTurn + endTurn
(AI turns resolve inside endTurn) until the end; always terminates (used by tests, sims, `?autoplay=1`).
Danger it reads (v2, no telegraphs): the initiative order up to the current owner's next turn; for every AI enemy and
each of its turns in it, where it can strike from its walk (walls, units in the way, line of sight, ranges and areas of
its ready damaging skills), whom it will likely pick (the AI's own targeting formula, `DD.AI.targetBonus`: engaged foes
first for most styles, divers go for the weak; minus the attacks of opportunity it would provoke walking away from the
heroes next to it; taunt; protected objects) and how many hits a turn it has been seen to deal in this fight; boss
wind-ups; `threatAt` auras. A hit weighs less when its victim acts before the enemy (it can respond) or when allies
acting first may stop the enemy; per unit, the odds of the HP lost and of going down are exact. v2 attacks of
opportunity: walks are priced with the hits they provoke (`provokes` of `Combat.reachable`), and so is stepping off a
tile after acting (hit and run next to a brute is not free), so it doesn't walk away from melee foes carelessly,
teleports / dashes out instead, and values standing next to an enemy that threatens an ally (body-blocking).
Stalemates: the reach term is weighed by a caution factor, 1 up to round 6, then −0.1 a round down to 0.3, and 0
after round 6 once three rounds in a row passed without the party wearing anything down (until something happens
again). Unused AP is worth nothing (no Guard). Helpers: `incomingAt(unit, x, y) → { dmg, pierce, hits, ride, aura,
down, loss, list }`, `incomingAsAlly(unit, x, y, actor?)`, `turnPlan()`, `threats(actor?)` (per enemy: victims with
their odds, `leave` = its disengage cost), `danger(actor?)`, `hitsPerTurn(unit)`, `lossOf(...)`, `auraAt(enemy, unit,
x, y)`, `distField(unit, goals, adjacent)`, `stall() → { quiet, caution }`, `trace` / `log`, `measure` / `samples`.
**Puzzle hints**: an object def, instance or its `interact` may set `autoplay: number | (unit, obj, tile, state) =>
number` — the damage-equivalent value of interacting with it (levers, valves, mirrors, books), stepping on it
(non-blocking objects such as plates) or destroying it (smashable / damageable panels) *right now*; ≤ 0 = ignore.
AutoPlay compares it with its best attack, walks over (values ≥ 10 are approached from afar) and acts. Return 0
once a puzzle step is done. Boss puzzles must set these so balance sims and tests exercise them. v2: a flyer never
walks to an object that only works by being stepped on (a plate: no interaction, not smashable) — it can't press it.
v2 (user requests): it aims attacks at volatile objects when the blast is worth it (a dry run: foes hurt / killed minus
allies hurt), and aims heals at downed allies (valued like a revive, with Help Up's safety check: the ally must likely
live until it acts); Help Up and the walk to a downed ally wait when such a heal can get it up from where it stands.
Hazards are per unit (flyers, immunities) in its walks, its danger model and the surfaces it lays down.

### 5.8 `DD.MapGen` / `DD.Encounter` (MAPGEN)
```
DD.MapGen.generate({ theme, w, h, rng, features, density }) → { grid, heroZone: [{x,y}], enemyZone: [{x,y}] }
DD.MapGen.fromLayout(layoutDef, rng) → { grid, heroZone, enemyZone, marks: { [char]: [{x,y}] } }
DD.Themes[themeId] = { id, name, act, floors: [terrainIds], walls, obstacles: [objIds], decor, hazards, liquids,
                       bg: { top, bottom }, ambient: 'dust'|'spores'|'embers'|'fog'|null }     // js/data/themes.js
DD.Encounter.build(encounterDef, party /* RunHero[] | hero ids */, opts { rng, difficulty, act }) → setup
  setup = { grid, theme, heroes: [{ runHero|id, x, y }], enemies: [{ id, x, y }], objective, rules, encounter,
            deployTiles: [{x,y}], reinforcements }
DD.Encounter.pick(act, kind, rng, { depth, exclude }) → encounterDef
DD.Encounter.spawnWave(state, wave)    // reinforcements (called by combat at round start)
```
Layout legend defaults: `.` floor · `#` wall · `~` water · `^` lava · `_` pit · `,` mud · `*` ice · `"` grass/bush ·
`H` hero deploy · `E` enemy spawn · `B` boss spawn · `C` crate · `X` explosive barrel · `P` pillar · `T` tree ·
`L` lever · `S` spikes · `O` pressure plate · `$` chest · `F` fountain. `heights` rows give per-tile elevation digits.

### 5.9 `DD.WildMagic` (MAPGEN) — shared surge table
`register({ id, name, weight, good: true|false|null, text, apply(unit, ctx) })` · `surge(unit, opts { good, source }) → effect`

### 5.10 Event names (DD.Events)
Combat: §5.5. Render/input: `input:tileHover {x,y}|null`, `input:tileClick {x,y,button,shift}`, `input:unitClick
{unitId}`, `input:rightClick`, `input:key {key, code}`, `render:view {yaw, moving}` (the battlefield view angle changed:
`moving: true` at most every 66 ms while it turns, then exactly one `moving: false` once it has rested 150 ms; the new
view is already applied when it fires). UI: `ui:screen {id}`. Run: `run:changed`, `run:gold`.

---------------------------------------------------------------------------------------------------------------------

## 6. Combat rules (normative — see DESIGN.md for intent and numbers)

### 6.1 Round structure (v2: initiative, one unit at a time)
```
start → onCombatStart(all) → encounter.onStart → deployment (phase 'deploy', round 0: free swaps, deployMove) or at once:
rollInitiative()  ("Roll for initiative!"; End Turn or the first real action in deployment does it too)
          → every unit's Block → 0 (nobody starts a fight with Block: items' stats.block and onCombatStart Block are gone)
          → entries: every hero and every non-summon unit rolls d20 + init via state.rng (then its modifyInitiative(r));
            summons act on their owner's turn (one whose owner chain has no entry rolls for itself); turnsPerRound n → n
            entries. Sorted: total ↓, init ↓, heroes first, a pre-rolled coin flip. 'initiative:rolled' → beginRound()
beginRound: round++ → 'round:start' → reinforcements → encounter.onRoundStart → onRoundStart(all)
          → joiners (rolled on arrival) and orphans merged into the order, dead units dropped → check end
each entry in order (dead: dropped; a downed hero with nobody acting on its turn: skipped):
  turn start ('turn:start'; a hero-controlled one counts in state.heroTurns): for the unit and the summons acting on its
          turn: Block → 0, AP → turnAp (+ apBank; heroes and hero summons) → onTurnStart → 'turnStart' decay → cooldown
          ticks → due wind-ups land (interrupted if it is stun-like / sheep; only those whose hero window has passed,
          §5.6) → the turn is live (statuses applied from now on are `fresh`)
  hero-controlled: someone of the turn can act (active, not stunned, AP > 0) → wait for the player ('turn:player');
          nobody can (stunned, downed with no summon) → the turn passes
  AI-controlled: DD.AI.act(unit) for it and its AI summons (stun-like → "loses the turn")
  turn end: AP → 0 (unused AP is lost) → onTurnEnd (Burn ticks...) → 'turnEnd' decay → surface / terrain onTurnEnd
          → 'turn:end' → check end
after the last entry: surfaces tick → objects onRoundEnd → rules tick → encounter.onRoundEnd → 'round:end'
          → survive check → check end → beginRound()
```
`endTurn()` ends the current hero turn and resolves every following AI turn (FX queued) up to the next hero turn or the
end of the fight. Units that arrive after initiative (spawns, waves, enemy summons) roll on arrival (`initiative:joined`)
and act from the next round start (arrivals at a round start act that round). Downed heroes keep their slot; a revived
hero acts on its slot (0 AP if revived during its own turn). The order is fixed for the fight.
Wind-up anchors (§4.5): `ground` → fixed tiles (default); `unit` → tracks a unit, fizzles if it is out of range / LOS
(range only for `target.los: false`) or stealthed; `self` → relative to its owner. A stun-like or sheep interrupts a
wind-up at once.

### 6.2 AP, movement, elevation
- Heroes: 3 AP at the start of their own turn (`turnAp`: stun-likes 0, Haste +1, Slow −1 min 1, Charmed −1, plus AP
  banked by `gainAp` outside the turn). **Unused AP is lost at the end of the turn — there is no Guard.** **Move** = 1
  AP for up to `mov` cost (a hero may move several times if it has AP); a Confused hero pays 2, and `modifyMoveCost`
  hooks have the last word. Rooted or held (`noMove` status) units can't take move actions (they can still be pushed).
  Skills cost `ap` (+`hpCost`). Basic attacks are usually 1 AP. Summons have their own AP (default 2), refreshed at the
  start of their owner's turn, and act during it (`Act.summon(..., { ready: true })` gives that AP at once only during
  the owner's turn; outside it the summon has 0 AP until the owner's turn starts). AI units ignore AP.
- **Block** only comes from skills (and hooks) mid-fight and lasts until the start of its owner's next turn.
- A walk stops early when a tile on the way roots, holds or stuns the walker, or a tile callback calls
  `DD.Act.stopMove(unit)` (a slip). A move whose tile callbacks changed nothing (and that provoked nothing) can be undone.
- Path cost: terrain `cost` (1; mud/water/rubble 2), +1 per level stepped up. Up ≤1 level per step (hop ≤2,
  flying ignores height, pits, liquids and terrain cost). Down any. Can pass through friends, not foes; can't end on a unit.
- High ground: attacker standing higher than its target deals +25% damage.
- **Attacks of opportunity (v2).** A **move action** — `DD.Combat.move`, an AI walk (`AI.moveTo`, `api.moveTo`, the
  default turn, a sheep's stroll), i.e. `Act.moveAlong(..., { provoke: true })` — that leaves a tile next to (Manhattan
  distance 1) an **opposing** unit lets that unit strike the mover once, as it leaves (the mover still stands there):
  - **Who** (`Act.opportunityOf`): active, `Grid.hostile(attacker, mover)` (charm-aware), not stun-like / sheep,
    AI-controlled ones also not Dazzled / Confused and, if taunted, only against their taunter; a charmed hero never
    strikes its charmer; its reaction unused this round (`unit.oppRound !== state.round`: **at most one per attacker
    per round**, refreshed when a round starts); not `flags.noOpportunity`; and it has an opportunity skill
    (`Act.opportunitySlot`): a hero's **basic attack if it is melee**, summons / enemies their **first ready melee
    skill** (melee = a damaging skill targeting 'unit' / 'tile' / 'dir' at max range 1 after `modifyRange` that can hit a
    foe there; ready = off cooldown, charges left, no silenced spell, its `canUse` and `canTarget` agree). The mover is
    not stealthed, not `untargetable`, not `flags.noProvoke`. Then `modifyOpportunity(o)` on the attacker's sources and
    the mover's (cancel / flat / mult; pure). Before initiative (deployment) nothing provokes.
  - **The attack**: `opportunity:attack` event, FX "⚔️ Attack of opportunity!", a log line, then the skill resolves on the
    mover's tile only (`resolveSkill`, `ctx.opportunity = o`, `ctx.tiles` = that tile): normal damage rules, its riders
    too, but free (no AP / HP / Hype, no cooldown or charge, `usedThisTurn` untouched) and it neither uses nor consumes
    Empowered. Its hits carry `d.opportunity` and o.flat / o.mult. `onOpportunityAttack(o)` (attacker's sources, then
    the mover's; `o.dealt`). `onSkillUsed` fires as for any resolved skill.
  - **Interrupts**: several attackers next to the tile strike in unit order; once the mover is downed / dead, stun-like,
    rooted / held, moved off the tile (a push) or told to stop (`Act.stopMove`), nobody else strikes and **the walk ends
    there** ("Stopped!"). The move action is spent (`Combat.move` returns true). With 4-way adjacency every step off a
    tile next to a foe leaves its reach; walking past a foe provokes too; stepping next to one never does.
  - **Never provoke**: pushes, pulls, knockbacks, falls, slides, teleports, swaps, throws, jumps, skill dashes / charges
    / leaps (`moveAlong` without `provoke`), deployment swaps, spawns.
  - **Paths** (`Grid.reachable / path` with `aoo`, used by `Combat.reachable / move` and every AI walk): within the move,
    the fewest attacks of opportunity + hazard tiles on the way (each tile's zones from `opportunityOf`), then the fewest
    attacks, then the cheapest; entries carry `provokes: [unitIds]`. `Combat.provokes(unit, x, y)` gives names, skills and estimated
    damage for the HUD's "⚔ provokes N". A move that provoked can't be undone.

### 6.3 Line of sight
Bresenham/supercover between tile centers; blocked by an intermediate tile whose terrain/object/surface blocks LOS,
or whose `h ≥ max(hA, hB) + 2`. Units never block LOS (line-area projectiles stop at units separately).

### 6.4 Costs & cooldowns
`cooldown N` = after use, the skill is unusable during its owner's next N turns (use in round r → usable again in
round r+N+1); cooldowns tick at the start of the owner's own turn (an AI skill's cooldown starts when it is used, a
wind-up's when it is wound up). Charges = uses per combat. Hype cost is paid from the party pool. Costs can be modified via `modifyCost`
(`c.level` = the slot's level); an HP cost never takes the user below 1 HP; `onCostPaid(p)` reports what was really
paid (also `ctx.paid` in `onSkillUsed`).

### 6.5 Damage & statuses
Damage pipeline (`DD.Act.damage`): target invulnerable/dead → 0 · outgoing modifiers (source hooks, Weak −25%,
Inspired +25%, item `dmg`, Empowered ×1.5 (consumed after the skill), a taunted hero −50% vs others, difficulty for
enemy sources) — not for environmental causes (status, surface, terrain, bump, fall, explosion) · high ground +25%
(skills) · incoming modifiers (target hooks, Vulnerable +25%, statuses' `takenMult`, `resist[element]` (0 = immune:
nothing gets through), Wet ×1.5 vs lightning, Frozen ×1.5 vs physical) · `final = round(amount × mult + flat)` (a
charmed hero vs its charmer: 0) · Marked adds its stacks (consumed) · armor subtracts (min 1 if final > 0, unless
`ignoreArmor`; status/surface/terrain/fall ignore armor by default) · **modifyFinalDamage** (target) · Block absorbs
first (unless `ignoreBlock`) · HP · onDealDamage / onTakeDamage · thorns · death/downed (unless **preventDeath**).
Death of enemies/summons: `dead = true`, removed from the board (keep in `state.units`), xp/gold tally, onDeath, onKill,
onAllyDeath, onAnyDeath, +Hype. Heroes at 0 HP become **downed** (§6.8; onDowned, onAllyDowned).
Stun-likes (`stun, sleep, frozen` and any status def with `stunLike`): the unit loses its next turn (heroes: 0 AP and
the turn passes; AI: no action) and its wind-ups are interrupted.
Core statuses (`js/data/statuses.js`, RULES): `burn, poison, bleed, stun, root, weak, vulnerable, taunt, haste, slow,
regen, stealth, marked, dazzled, confused, charmed, inspired, wet, silenced, sleep, invulnerable, frozen, thorns,
empowered, sheep`. Semantics in DESIGN.md §4.4 (v2 note). **Durations count the owner's own turns**: `decay: 'turnEnd'`
(default) ticks `turns` at the end of each of the owner's turns, `'turnStart'` at the start, `'never'` never. A status
applied during its owner's own live turn (after the start-of-turn ticks) is `fresh` and skips the tick at the end of that
turn (def `skipFresh: false` opts out), so `turns: 1` always means "through its next turn": a debuff from a hero's turn
covers the enemy's next turn, a self-buff lasts through the hero's next turn, a Stun from an enemy hit costs the hero its
next turn and a stun applied in an onTurnStart hook costs that very turn. Summons tick on their owner's turn.

### 6.6 Displacement, falls, surfaces, elements
- `push(dir, dist)`: step by step; a blocked step (wall, object, unit, edge, step up ≥2) stops the push and deals
  `bump` damage (default 3) to the pushed unit (and to the unit it hit). Pits: non-boss enemies die ("yeeted");
  heroes/bosses take 25% max HP and are placed on the nearest free tile. Lava: 8 fire damage + Burn 2 on entry.
  Water removes Burn and applies Wet. `immovable` units ignore pushes. Every entered tile fires onEnterTile/surfaces/traps.
  The distance goes through the pusher's `modifyOutgoingPush`, then the target's `modifyPush` (either may cancel).
- Hazards (AI and AutoPlay avoid them; paths prefer fewer): defs with `hazard` (§5.3), per unit when it is a function;
  v2: always per unit (`DD.Grid.hazardAt`): flyers, and units that ignore what the hazard does (hazardElement /
  hazardStatus vs resist 0 and immunities), get no hazard there.
- Elements (`applyElement`): fire → ignites oil (fire spreads along oil), evaporates water to **steam** (blocks LOS
  1 round), burns webs, melts ice to water, detonates explosive barrels, applies Burn to the unit there;
  frost → water→ice, removes fire; lightning → electrifies a connected water body (damage + stun to units in it);
  water → extinguishes fire, lava→obsidian (stone); poison → poison surface; blood → blood surface; oil → oil surface.
  v2: a reaction that comes from the floor (`opts.floor`: a slick going up, a spilled brazier) leaves flyers alone; an
  element aimed at a tile (a skill) still reaches the flyer there. Water shocks only grounded units.
- **Flyers (v2, user request)** ignore the floor entirely: terrain onEnter / onTurnEnd, non-airborne surfaces (onEnter,
  onTurnEnd, splashes), ground objects and traps (plates are never pressed), ice slides, falls, floor reactions, hazards.
  Clouds (`airborne`: steam, smoke, gases), attacks and spells aimed at them or their area, explosions' blast damage and
  unit-centred auras still hit them (§3.7). Flight from a status (`flying` on its def) that ends (removed, dispelled,
  run out) over a pit or deep water drops the unit in (a fall); other floor effects reach it from its next step / turn end.
- **Volatile objects (v2, user request)**: a player's single-target attack aimed at one detonates it (§3.2): destroyed, its
  blast credited to the attacker (kills, environmental kills +20 Hype, stats, onKill / gold hooks). The AI never aims at
  objects; area attacks, fire and explosions set them off as before; the adjacent Smash interaction is unchanged.
- Environmental kill (death caused by push/fall/hazard/bump/explosion credited to a hero) → +20 Hype and narration.

### 6.7 Hype & signatures
Party Hype 0–100: +8 per kill by the hero side, +20 per environmental kill, +4 when a hero lands a skill that hits
2+ foes, plus passives/items. Signature skills cost 100 Hype (and their AP). Hype starts each combat at 0 + item bonuses.

### 6.8 Downed heroes, revive, defeat
At 0 HP a hero is **downed** (stays on its tile, can't act, untargetable; it keeps its initiative slot, its turn is
skipped unless its summons act on it). An adjacent ally can **Help Up** (interact, 2 AP) → revive at 25% max HP with 0 AP;
it acts again on its own slot. v2 (user request): a single-target heal (skill or consumable, §3.2) **aimed at** a downed
ally also gets it up, with the healed amount as HP (after healBonus and modifyHeal; at least 1, at most max HP), 0 AP, on
its own slot (one already passed: next round); a cancelled heal does not. Area heals, regeneration, lifesteal, passives,
Blessings and round-end heals never revive. 'downedAlly' revive skills are unchanged. Combat ends in defeat when no hero
is active. After combat, downed heroes revive at
1 HP, `downs++` and gain a random Scar; the third down in a run kills the hero permanently (they can be replaced at a
tavern). Summons die at 0 HP.

### 6.9 Objectives
`killAll` (default: all enemy-side non-summon units dead) · `boss` (the unit with `tier: 'boss'` dies; minions flee) ·
`survive` `{ rounds }` (victory at the end of that round) · `destroy` `{ objId, count }` (objects destroyed) ·
`protect` `{ objId | unitId }` (defeat if it is destroyed; victory by killAll) · `custom` (`encounter.checkObjective(state)
→ 'victory'|'defeat'|null`). The HUD shows `state.objective.text` (object defs may give a `pluralName` for it).

### 6.10 Difficulty
casual: enemy HP ×0.8, damage ×0.8 · normal: ×1 · brutal: HP ×1.25, damage ×1.2, +1 enemy per normal encounter.

---------------------------------------------------------------------------------------------------------------------

## 7. Rendering (RENDER)

### 7.1 Projection — `DD.Iso`
Tile diamond 64×32 px at zoom 1, elevation step 16 px. `DD.Iso.toWorld(x, y, h) → { x: (x - y) * 32, y: (x + y) * 16 - h * 16 }`
(tile **top-face center**). Camera: `DD.Render.camera = { x, y, zoom }` (world point at screen center).

**Map rotation (view yaw).** The ground plane turns by the yaw θ (degrees, [0, 360), positive = the board turns
clockwise on screen) before the 2:1 projection: `A(θ) = A0·R(θ)`, `A0 = [[32, −32], [16, 16]]`. Elevation stays a pure
−16 px per level at every yaw. θ = 0 is the classic view and every helper returns exactly the formulas above there; the
quarter views (90 / 180 / 270) are exact lattice symmetries. Purely visual: game logic never reads the yaw.
```
view() → V (the current immutable view) · makeView(deg) → V (memoised per 1e-3°) · normYaw(deg) → [0, 360)
setYaw(deg | V) (DD.Render only) · withYaw(deg | V, fn) → fn() (push / pop around fn: bakes, isolated paints, tests)
toWorld(x, y, h) · fromWorld(wx, wy, h) · local(u, v) → {x, y} (a ground offset at the current view) · local0(u, v) (always
  yaw 0: billboards) · depth(x, y) = (c + s)·x + (c − s)·y (x + y at yaw 0; larger = nearer the viewer)
quadPath(ctx, cx, cy, hw, hh, V?) (the tile quad scaled like a (hw, hh) diamond; = diamondPath at the quarter views)
rayHitsColumn(wx, wy, tx, ty, bot, top) (picking) · screenFacing(facing, lastDir, prev) → ±1 (the sprite mirror)
K = 32·√2 · RISE = 1/√2 · inColumn / inDiamond / diamondPath: unchanged yaw-0 helpers
V = { yaw, quarter (0..3 | −1), legacy (yaw 0), key, c, s, ax, bx, ay, by, fx, fy (toward the viewer), rx, ry (screen right),
  corners[4] (NW, NE, SE, SW px), unit[4], order[4], hx, hy (quad half-extents), ea, eb (inscribed ellipse), warp [a, b, c, d]
  (yaw-0 tile px → this view, canvas order), edges { N, E, S, W } ({ dir, dx, dy, nf, nr, front, back, shade, shadowW, cut,
  pa, pb, frame, opp, … }), edgeList, faces (visible side faces left → right), backChain, frontChain }
```
Painters: `painter(ctx, opts)` is a billboard helper as before; `opts.ground === true` makes `g.diamond` draw the view's
quad (surfaces); every `g` also has `g.local(u, v) → [x, y]`, `g.yaw`, `g.view`. **Content rule:** anything drawn in a
painter that points along the grid (arrows, rows of panels, a train's heading) uses `g.local` / `DD.Iso.local`; terrain
`draw` painters are pure ground art (no text, nothing upright). `g.box` / `g.diamond` are yaw-0 billboards unless the
object def sets `yawAware: true`: then they stand on the view's ground quad (the block turns with the board; identical at
yaw 0), and `g.faces(cx, cy, hw, hh)` / `g.on(…)` / `g.quad(…)` place details on its visible sides and top
(docs/notes/render-world.md, "Content authors: blocks that turn with the board").

### 7.2 Renderer — `DD.Render`
```
init(canvas) · start() · stop() · resize() · setScene('combat'|'none'|'gallery'|'title')
camera · centerOn(x, y, { instant, ignoreHud }) · fitMap() · follow(x, y, { pad, ms, height, instant }) → bool
worldToScreen(x, y, h) → {x,y} · screenToTile(sx, sy) → {x,y}|null · unitAtScreen(sx, sy) → Unit|null
overlay (below) · hudMargins / margins() · renderTo(canvas, opts) → { units, telegraphs, windups, badges, threatTiles,
reachTiles, widgets, silhouettes, … } · theme background from DD.Themes[state.theme].bg
map rotation (the battlefield only; title, gallery, drawTileAt / drawObjectAt always draw at yaw 0):
getYaw() → deg · setYaw(deg, { keepFocus = true, persist = false, animate = false, instant }) → target
rotateBy(deltaDeg, { animate = true }) · turn(dir) (+1 = R clockwise, −1 = Q: the next classic view, 250 ms ease; a double
tap turns 180°) · resetView() (to 0 the short way, then fitMap) · beginRotate() · rotateDrag(dxCssPx) (yaw −= 0.35°/px) ·
endRotate({ snap = true }) (eases onto a classic view within 4° unless settings.rotSnap === false) · isViewMoving()
renderTo(canvas, { …, yaw, live }) (render that view; the live yaw is untouched; live: true = live-frame level of detail)
```
The view keeps the ground point under the board-area centre in place while it turns (or, when that point is off the
board, the board's nearest point where it is on screen, so a turn never swings the board out of view; a pivot per gesture; `follow`
returns false and `fitMap` waits until the view stops); every change emits `render:view` (§5.10). `rot=<deg>` (§10.1)
or the remembered `settings.viewYaw` (§4.7) sets the starting angle. Everything follows the view: picking (a ray
through each column, front group first), depth order, visible side faces (the classic left / right colours sweep with
the face's angle), contact shadows, overlays, objects, silhouettes, sprites (§7.3), FX (§7.4) and widgets. A tall wall on
the N or W border sinks toward half a level (with a dark section cap) and a tall border prop fades as that border turns
toward the camera, render-only and never at yaw 0. While the view turns, silhouettes draw at half resolution and top
textures come from the nearest cached bake; exact bakes follow once it rests.
Each frame: `DD.FX.update(dt)`; if FX idle → `DD.FX.syncAll(units)`; draw back-to-front by depth groups (cells of equal
`DD.Iso.depth`: the x + y diagonals at yaw 0, members by x; per group tiles, then objects, then units by h): tile blocks
(top + side faces) → surfaces → overlay highlights (deploy, move, threat shading, one enemy's reach, interact, wind-up
tiles, targets, AoE) → objects → units (turn ring, selection ring, shadow, sprite) → HP bar, block, status icons, AP pips
(acting turn only), turn chevron, wind-up bubbles + preview badges → wind-up outlines / tracking lines → ⏳ badges → FX
layer → floating texts/barks → banner. Units hidden behind tall geometry get a translucent silhouette pass.
**v2 — wind-ups only** (every stored intent is a boss wind-up, §4.5): red pulsing tiles with a cream/red "danger tape"
hatch and a bright outline, a "⏳ label damage" badge at the area's centre (⏳n when it lands in n ≥ 2 of its owner's
turns) and a "⏳ icon damage" bubble over the owner — no order numbers, no per-enemy telegraphs. They are drawn in every
phase, **in step with FX playback**: a wind-up whose `windup` marker is still queued stays hidden, and one that already
resolved in logic stays on the board until playback reaches its owner's `turn` marker (then it lands). `showIntents:
false` or a finished fight hides them. `follow` pans the least amount (slow ease) that brings a tile — the acting unit —
inside the board area (HUD margins inset by `pad`); it does nothing while the unit is comfortably visible, never zooms.

**Overlay contract** (HUD writes, renderer reads every frame):
```js
DD.Render.overlay = {
  selectedId: null,        // selection ring
  hover: null,             // {x,y} cursor tile
  moveTiles: [],           // reachable tiles (blue)
  path: [], pathHazard: false,   // move preview (red if it crosses hazards)
  targetTiles: [],         // valid targets for the armed skill (outlined)
  areaTiles: [],           // AoE under cursor (orange)
  previews: {},            // unitId -> { dmg, heal, lethal, text } floating preview badges
  deployTiles: [],         // deployment zone (green)
  interactTiles: [],       // interactables (yellow)
  showIntents: true, focusIntentUnitId: null,   // highlight one boss's wind-ups (hover)
  // v2
  turnUnitId: null,        // whose turn is on screen: a glow ring under it (red for AI units) + a bouncing chevron
  threat: null,            // threat shading { tiles: [{ x, y, dmg, lethal }], ref }: orange by dmg / ref, lethal hatched
  reach: null,             // one inspected enemy's reach { unitId, tiles: [{x,y}] }: red outlined region
  // v2 requests (Nov 3); empty / absent = nothing drawn (yaw 0 stays pixel-identical)
  objTargets: [],          // [{x,y}] volatile objects the armed attack can set off: a pulsing 💥 above each (bigger on hover)
  reviveTargets: [],       // [unitId] downed allies the armed heal gets back up: green DOWNED label + pulsing 💚
}
// previews[id] may also be { revive: true, heal: 0, text: 'UP! 7 HP' } (a heal aimed at a downed ally): a green badge
```

### 7.3 Sprites — `DD.Sprites`
```
draw(ctx, spec, sx, sy, zoom, opts) — opts { t, facing: 1|-1, flash 0..1, alpha, bob, pose: 'idle'|'attack'|'hurt'|'downed'|'cast' }
drawUnit(ctx, unit, sx, sy, zoom, t)  — looks up the def sprite (hero/enemy/summon), applies vis/status tints; a resting
  unit is mirrored for the view: DD.Iso.screenFacing(unit.facing, unit.lastDir, last shown) (unit.facing stays engine
  data in yaw-0 screen space); facingOf(unit) → the mirror shown last (±1 | undefined)
portrait(specOrDefId, size = 64, opts) → HTMLCanvasElement   // cached; used by UI
painter helper `g` for spec.draw/overlay: origin at the feet, +y down, ~40 px = medium creature height before scale.
  g.ctx · g.pal · g.t · g.circle(x,y,r,fill,stroke) · g.ellipse(x,y,rx,ry,fill,stroke,rot) · g.rect(x,y,w,h,fill,stroke,radius)
  g.poly(points,fill,stroke) · g.line(x1,y1,x2,y2,color,width) · g.arc(...) · g.text(str,x,y,size,color) · g.lw · g.outline
```

### 7.4 FX playback (`js/render/fx_render.js`, RENDER-SPRITES)
Registers `DD.FX.register(type, { start, update, end })` handlers for every FX type in `js/core/fx_core.js`
(move, slide, jump, teleport, lunge, projectile, beam, explosion, particles, damage, heal, block, status, text, bark,
death, downed, revive, spawn, shake, banner, flash, wait, tile, sound, custom). Handlers animate `unit.vis`
(x/y/h interpolation, `offX/offY` lunge offsets in screen px at zoom 1, `flash`, `alpha`, `scale`) and spawn
non-blocking visuals (floating text, barks, particles, projectiles, beams, explosions) into an FX-owned list.
The world renderer draws them through:
```
DD.FXRender = {
  drawWorld(view),    // world-space effects (projectiles, beams, explosions, particles, tile pulses) — after units
  drawScreen(view),   // screen-space: floating numbers/text, speech bubbles, banner, flash — after everything
  shakeOffset() → { x, y },   // current screen shake in px (renderer offsets the camera)
}
view = { ctx, zoom, t /*s*/, dt /*ms*/, width, height, toScreen(x, y, h) → { x, y } /*screen px of tile top center*/,
  yaw, local(u, v) → {x, y} /*ground offset at the view*/, axes { ax, bx, ay, by } }
```
FX grid directions follow the view yaw (§7.1): `DD.FXRender.screenDelta(a, b)` / `facingToward(a, b)` (walk, slide,
jump, lunge, projectile and beam facings; lunges re-aim if the view turns mid-animation), tile pulses and wind-up glows
on the view's quad. Content FX painters that point along the grid use `view.local` / `DD.Iso.local`.
`DD.Meta.data.settings.animSpeed` → `DD.FX.speed` (set by main.js / settings screen).
**v2 markers** (0 ms from the engine): `turn` (fx_core's applyEnd moves `DD.FX.shownTurn`), `windup` (a red glow on the
announced tiles + a sound), `initiative`. **Hosted moments**: a screen may register `DD.FXRender.moments.initiative =
{ wants(evt) → bool, start(evt) → ms }` (the combat HUD's dice tray). When the host wants an `initiative` marker (rolled
dice, not a fixed order) the marker lasts the ms `start` returns — playback (and every AI turn after it) waits — and the
host may finish it early by setting `evt.elapsed = evt.ms`; the engine's "Roll for initiative!" banner right before it
(only dice texts in between) is folded into the moment (0 ms, not drawn). Without a host, or in instant mode, nothing
waits. A throwing host is contained (`DD.safe`).

### 7.5 Input — `DD.Input`
`init(canvas)`; emits `input:*` events (§5.10). Camera: drag with the right (or left, past 6 px) mouse button,
WASD/arrow keys pan, wheel zoom, `F` refits the board. Left click → `input:tileClick`. Esc / right-click →
`input:rightClick`. **Map rotation (on the combat screen only — not the rewards / level-up screens that keep the board
drawn behind them, where `Home` just refits; it never emits a click or hover):** a middle-button drag (hold the
wheel) turns the map to any angle (horizontal motion only, 0.35° per px after 3 px; it lasts while the middle button is
down, so a chorded left / right button never carries it on; released within 4° of a classic view it eases there unless
Shift is held or `settings.rotSnap === false`; the angle stays where it is left; the middle button never pans); a
sideways wheel / trackpad swipe / Shift+wheel (even where the browser reports it vertical) turns it (−0.25° per px;
Ctrl+wheel still zooms); a two-finger twist turns it on touch; `Q` / `R` turn 90° counter-clockwise / clockwise
(animated, a double tap turns 180°); `Home` resets the view (yaw 0 + fit). The window losing focus ends a turn in
progress where it is. Hover is frozen while the view moves and re-picked once it settles.

### 7.6 Audio — `DD.Audio`
Procedural WebAudio SFX (no files): `play(name, opts)`, `setVolume(v)`, `mute(bool)`. Names: click, hover, hit, crit,
fire, frost, zap, poison, heal, buff, debuff, push, bump, fall, explosion, death, downed, levelup, coin, buy, error,
turn, victory, defeat, bark, corgi, caw, roar, magic, summon, step, slash, arrow, splash.

---------------------------------------------------------------------------------------------------------------------

## 8. UI (META, HUD)

### 8.1 `DD.UI`
```
root (#ui) · init() · screen(id, { mount(root, params), unmount(), update? }) · show(id, params) · current
el(tag, attrs, ...children)        // attrs: class, style{}, text, html, title, on:{click}, dataset{}, any attribute
button(label, onClick, { cls, disabled, tooltip, hotkey })
modal({ title, body, buttons: [{ label, cls, onClick, close = true }], closable }) → { close() }
choice({ title, text, options: [{ label, desc, onPick, disabled }] })  · confirm(text) → Promise<bool>
toast(text, { cls, ms }) · tooltip(el, contentOrFn) · hideTooltip()
skillCard(skillId, level, { unit, compact, onClick }) · skillTooltipHtml(skillId, level, unit)
itemCard(itemId, opts) · itemTooltipHtml(itemId) · statusTooltipHtml(statusInstance)
portrait(heroOrSpecOrDefId, size) → element · hpBar(cur, max, opts) → element · goldText(n)
aimNotes(def, unit?) → html   // v2 requests: "💥 Can also be aimed at an explosive barrel…" / "🆘 Aimed at a downed ally…"
flyLine(who) → text            // v2 requests: "🪽 Flying: ignores floor effects … Clouds and gases still reach <name|it>."
```

### 8.2 Screens & flow
`title` → `partySelect` (pick 4 unlocked heroes + difficulty) → `map` (act map) → node:
`combat` (HUD) → `rewards` → `levelup` (modal flow per hero) → `map` · `event` → `map` · `shop` · `tavern` (rest /
train / recruit) · `party` (manage skills, items, consumables; reachable from map) · boss victory → act transition →
next act or `victory` · defeat → `gameover` → `title`. Also `settings`, `hall` (unlocks, stats, codex).

### 8.3 Combat HUD (`js/ui/combat_hud.js`, screen id `combat`) — v2: initiative, no telegraphs, no Guard
Top bar: round + phase pill + who acts ("Goblin Grunt #2/8"), the **initiative tracker** (portraits in turn order from
the acting unit on — the rest of this round, a "R n+1" divider, next round's turns up to the acting unit again, units
joining next round (dashed, 🆕); the acting portrait is bigger and glows, upcoming ones fade with distance; totals on
each; marks 💀 downed / 💫 💤 🧊 stunned-likes / 🐑 sheep / ⏳ winding up; hover = highlight the unit on the board + its
inspect panel, click = inspect (pin) or select a unit of the acting turn), objective + rules + reinforcements, DM caption.
**Deployment** (phase `deploy`, round 0): free swaps in the green zone, skills wait, then a big **🎲 Roll for
Initiative!** button (also End Turn / Space) → `Combat.rollInitiative()` → the **dice moment** (hosted for fx_render's
`initiative` marker, §7.4): a tray with every unit's portrait, a tumbling d20 that lands, "+mod", the total, NAT 20 / NAT
1 badges, then the cards slide into initiative order with ranks, a DM line (the engine's `initiative` narration, else a
HUD fallback); click / Space / Esc skips; none in instant mode / headless. Log lines logged during the roll appear after it.
**Turn flow**: during a hero turn only that hero and the summons acting on its turn can be selected (Tab cycles them);
another hero's card / portrait / board click inspects it and says when it acts. Party cards: the acting hero glows ("Your
turn", AP pips), the others show their initiative position and "acts in N" / "⏭ Acts next" / "✓ Acted · acts in N" /
"+1 AP next turn". End Turn (Space) shows **"Next: <unit>"** (no Block preview, no Guard); then the AI turns play out:
the HUD follows the playback through the engine's `turn` markers (tracker, phase pill, round, board ring
`overlay.turnUnitId`, log headers), the camera gently keeps the acting unit in view (`DD.Render.follow`), input is
locked and Space skips the animations; a short ribbon greets the next hero.
**No telegraphs**: normal enemies show nothing ahead of time. Boss **wind-ups** (§5.6) show as red hatched tiles with ⏳
badges (§7.2), a ⏳ mark on the tracker, "⏳ Winding up" rows in the inspect panel (label, damage, "next turn" / "n turns",
DD.AI.describe text) and a move hint ("⏳ Audit 20 lands here at the start of its next turn").
**Threat shading** (hold **Alt**, **T** or the 👁 button toggles; remembered): `overlay.threat` = every tile in
`DD.AI.threatMap('hero')` plus the aura threats (`threatAt`) for the selected hero, tinted by damage, lethal ones hatched;
the hint names who can reach the hovered tile, party cards show "⚠ 2 foes can reach: up to 9".
**Inspect panel**: enemies — HP, armor, move, initiative modifier + position badge, flying / immovable / stun-immune,
resistances, statuses, def passive, aura hits, wind-ups, **reach** ("On its turn (in 3 turns) it can reach: Zarathor 6";
the board shades its reach as `overlay.reach` while inspected), **abilities** (icon, name, range / area, cooldown, exact
desc via `DD.UI.skillInfo`), codex text. Heroes — AP (acting), move, initiative modifier, "+n AP next turn", when it
acts, wind-ups / reach / auras on its tile, passive, Blessings. Tiles — terrain, surface, object, wind-ups, reach.
**Log**: revealed in step with playback; lines of a turn get a "⚔️ Zarathor's turn" / "👹 Goblin Grunt's turn" header
the first time that turn logs anything (empty turns leave no trace).
Interaction: click hero → move tiles; click tile → move; click/hotkey skill (1-6) → target mode with AoE + damage
previews; click target → use; right-click/Esc cancels. Input is ignored while `DD.FX.busy()`. On `combat:end`, after FX
idle: run → `DD.Run.finishCombat(result, state)`; no run (debug) → result modal with Restart / Title.
Keys (as built): 1 basic · 2-5 skill sockets · 6 signature · 7-0 consumables · E interact / Help Up · Tab next unit of
this turn · Space roll initiative / end turn / skip animations (and the dice moment) · Z undo · Alt (hold) / T threat
shading · Esc cancel / unpin / menu. `DD.HUD` exposes the same actions for tests and the console (`select`, `pressSlot`,
`hover`, `click`, `key`, `endTurn`, `rollInitiative`, `tracker`, `shownTurnUnit`, `upcoming`, `threat`, `holdThreat`,
`threatData`, `moment`, `skipMoment`, `hoverTracker`, `clickTracker`, …).
**Map rotation** (top-right cluster, between the speed button and Menu): ⟲ (`DD.Render.turn(-1)`, Q) · a compass that turns
with the board on `render:view` and resets the view on click (`resetView`, Home; it glows while the map is turned) · ⟳
(`turn(1)`, R); the keys and the middle drag live in `DD.Input` (§7.5). Reinforcement edges are named for the current
view (`DD.HUD.edgeName(edge, yaw?)`: at yaw 180 the N edge is "bottom-left"); `DD.HUD.compass()` reads the needle.
**v2 requests (Nov 3)**: an armed attack that can set a barrel off (`Targeting.aimsAtObjects`) lists volatile objects in
`targetTiles` and `overlay.objTargets`; hovering one previews the whole blast (`areaTiles` = preview.tiles, a badge per
unit, "💥 Detonate: Explosive Barrel — 8 fire damage within 1 tile · Hits 2 foes for 14 · ⚠ hits Marwyn!"); the inspect
panel of a volatile object says how to set it off. An armed heal that revives (`Targeting.revivesWith`) lists downed
allies (`revive: true` targets, `overlay.reviveTargets`); hovering one shows "UP! N HP" and "🆘 UP! Marwyn gets back up
with 7 HP (0 AP now; acts next)"; a downed hero's card says "💚 Heal back up (2)" when the acting unit has such a heal
ready (`DD.HUD.reviveOptions(id)`), and the card / inspect tooltips (`DD.HUD.unitTip(id)`) explain Help Up and aimed
heals. Flyers get no floor-hazard path warnings (per-unit hazards, §5.1) and a "🪽 Flying: ignores floor effects" line.

---------------------------------------------------------------------------------------------------------------------

## 9. Run layer (META)

### 9.1 `DD.Meta`
`data` (§4.7) · `load()` · `save()` · `isUnlocked(heroId)` · `unlock(heroId) → bool (newly)` · `recordRun(summary)` ·
`settings` shortcut · `markSeen(kind, id)`.

### 9.2 `DD.Run`
```
state · rng() · hasSave() · load() → bool · save() · clear() · abandon()
newRun(heroIds, difficulty, seed?)        // builds RunHeroes (startingSkills, full HP), act 1 map → shows 'map'
availableNodes() · travel(nodeId)         // enters node: combat/elite/boss/event/shop/tavern/treasure
startCombat(encounterDef, kind)           // DD.Encounter.build → DD.Combat.start(setup, { run, onEnd }) → show 'combat'
finishCombat(result, combatState)         // HP write-back, downs/scars/deaths, the fight's level-up, gold, stats → rewards | gameover | act clear
heroStats(runHero) → { maxHp, ap, mov, armor, dmg, heal, range, block, hype, init }   // base + growth + items + scars + perks + Blessings (init: v2 initiative modifier)
addGold(n) · spendGold(n) → bool · addItem(id) · equip(heroIdx, itemId) · unequip(heroIdx, slot)
addConsumable(id) → bool · removeConsumable(i)
levelUp(heroIdx?, { src }) → LevelUp|null // a named hero, or (idx omitted) the next hero in the rotation
grantLevelUps(n, src) → [LevelUp] · levelUpCandidates() → [heroIdx] · nextLevelUp() → { candidates, ids, names, level, maxed }
levelUpsPerWin(kind) · LEVEL_UPS_PER_WIN · recruitLevel(replaceIdx)
grantXp(n) → [heroIdx] · grantHeroXp(idx, n) → 0|1   // XP-era aliases: one rotation / named level-up (see Leveling)
levelUpChoices(heroIdx) → [Choice] · applyLevelChoice(heroIdx, choice, replaceIdx)
learnSkill(heroIdx, skillId, replaceIdx) · upgradeSkill(heroIdx, skillIdx)
healParty(fraction) · damageHero(idx, n) · addScar(idx, scarId?) · removeScar(idx, scarId) · recruit(heroId, replaceIdx)
completeAct()                             // unlocks, next act map or victory
resume() · next() · inCombat()            // flow used by the screens: show the current step / leave it / fight running?
rewards() · takeReward(i, opts) · skipRewards() · currentEvent() · chooseEventOption(i) · shop() · buy(kind, i, opts)
tavern() · tavernRest() · tavernTrain(h, s) · tavernRecruit(id, i) · levelQueue() · pendingLearns() · resolveLearn(i, r)
```
**Leveling (v2, DESIGN §3 — no XP).**
- After every **won** fight (normal, elite, boss, event fight; also the act boss before the act clears) exactly
  `levelUpsPerWin(kind)` heroes level up: `DD.Rewards.LEVEL_UPS_PER_WIN = 1`, the one constant, overridable by
  `DD.Balance.leveling.perWin` (a number, or `{ normal, elite, boss }`). A lost objective, a TPK and treasure give none.
- **The rotation**: the hero is drawn with the run RNG from the living heroes with the **lowest** level below 10 (the
  DM's "d4": a dN among the N candidates, one `rng().next()` draw; none when only one hero is behind), so every hero
  reaches level N before anyone reaches N+1 and the living party never spans more than one level. Dead heroes are
  skipped. A candidate's weight is `1 + runMods.xp` of its Blessings (§9.6), 1 for everyone by default.
- A level-up applies the HP growth at once and leaves one pending boon (learn / upgrade / perk, `pendingLevels`) and
  one Blessing roll (§9.6), resolved on the level-up screen for that hero.
- **Named level-ups** (`levelUp(idx)`, `api.levelUp(idx)`, the XP aliases with a hero) level that hero regardless of the
  rotation (events about one hero); null for a dead, missing or level-10 hero.
- **XP-era aliases**: `grantXp(n)` / `api.xp(n)` = one rotation level-up, `grantHeroXp(idx, n)` / `api.xp(n, idx)` = that
  hero; n ≤ 0 does nothing; while an event choice resolves, all of them together level up **at most once** (old
  content calls them freely). Outside a choice every call is one level-up.
- **Recruits** join at `recruitLevel(slot)`: the lowest level among the living heroes who stay (else the replaced
  hero's), auto-built, Blessings rolled for every level (headless policy), nothing pending.
- `LevelUp = { heroIdx, heroId, name, from, to, src: 'fight'|'event'|'named'|'debug', rotation, die /*N, 0 = named*/,
  face /*1..N*/, candidates: [heroIdx], candidateIds }`. Rewards data (`pending.data` of type `rewards`) carries
  `levelUps: [LevelUp]` (the step's own level-ups; the screen's "The DM rolls a d4… 3! Marwyn levels up!") and
  `leveled` (every pending boon, one entry per level); `stats.levelUps` counts all levels gained.

### 9.3 `DD.RunMap.generate(act, rng) → ActMap`
`{ act, rows, nodes: { [id]: { id, row, col, type, links: [ids], encounterId?, eventId?, done } }, start: [ids], boss: id }`
Types: `combat, elite, event, shop, tavern, treasure, boss`.

### 9.4 `DD.Rewards`
`LEVEL_UPS_PER_WIN` · `levelUpsFor(kind)` (v2: no XP table) · `combat(kind, act, rng, run) → { gold, levelUpCount,
choices: [Reward] }` · `apply(reward, opts)` ·
`randomItem({ rarity, act, slot, hero }, rng)` · `randomConsumable(rng)` · `skillTome(heroIdx, rng)` ·
`Reward = { type: 'item'|'skill'|'upgrade'|'consumable'|'gold'|'heal', id?, heroIdx?, amount?, label, desc }`.

### 9.5 Event API (`api` passed to `choice.resolve`)
```
api.gold(n)                      // +/- (clamped at 0)
api.heal(fractionOrN, heroIdx?)  api.damage(n, heroIdx?)     // default: whole party; never kills (min 1 HP)
api.giveItem({ id } | { rarity, slot })  → itemId           api.giveConsumable(id?) → id|null
api.giveSkill(heroIdx?, skillId?)  // queues the learn/replace flow
api.upgradeSkill(heroIdx?)       api.addScar(heroIdx?, scarId?)   api.removeScar(heroIdx?, scarId?)
api.levelUp(heroIdx?) → LevelUp|null   // v2: hero idx, else the next hero in the rotation (§9.2 Leveling); each call = 1
api.xp(n, heroIdx?) → [heroIdx]  // XP-era alias: one level-up (rotation / that hero), at most once per choice
api.combat(encounterIdOrSpec)    // fight after the event: id, or { act, kind: 'normal'|'elite' }
api.hasHero(id) → bool           api.heroIdx(id) → idx|-1    api.randomHeroIdx() → idx (alive)
api.party → RunHero[]            api.flag(name, value?)      api.rng                    api.heroName(idx)
api.rollPassive(idx)             // grant a roll on the Table of Questionable Blessings (§9.6), resolved through the UI
```

### 9.6 Random passive table — `DD.Passives` (`js/run/passives.js`) and the run flow
- `DD.Passives.MAX = 4`; `table(rh?)` → eligible entries `{ id, def, weight, from, to }` (`from..to` = the entry's
  slice of 1..100); `roll(rh, rng, { noCursed })` → `{ id, level, upgrade, d100, rarity }` (weighted; owned passives
  below max level come back as upgrades; maxed ones are excluded; `requires(rh, heroDef)` filters).
- Rolls happen at run start (one per hero, no cursed, auto-kept), on every level gained (one per level, resolved on
  the level-up screen before the skill choice), from events (`api.rollPassive`) and from the shop's re-roll service.
  A pending roll is stored on the RunHero once rolled (reloading never re-rolls). Resolution: upgrade (owned) /
  keep (free slot) / replace slot i / discard.
- Headless policy (no UI, AutoPlay runs, recruits): upgrades and free slots are taken; when full, replace the
  weakest owned passive (cursed first, then lowest rarity) only if the new one is better; never take cursed when full.
- `runMods` (summed over living heroes for party-wide keys): `gold` (+fraction of gold income), `price` (shop price
  change, clamped to ≥ 50%), and per hero `xp` (v2, no XP: + the hero's weight in the level-up rotation draw among the
  lowest-level heroes, weight = `DD.Passives.xpMult(rh)` = 1 + xp; it never lets a hero jump the rotation), `heal`
  (+fraction of out-of-combat healing).
- Every level gained rolls once (§9.2 Leveling: one hero per won fight), so a hero rolls about once per four fights.

---------------------------------------------------------------------------------------------------------------------

## 10. Debug & testing

### 10.1 URL params (implemented in `js/main.js`)
`index.html?debug=1` plus: `screen=title|partySelect|map|combat|rewards|event|shop|tavern|party|gameover|victory|hall|
settings|gallery` · `party=zarathor,marwyn,syllamin,ellaria` · `encounter=<id>` or `act=1&kind=normal|elite|boss` ·
`seed=<n>` · `level=<n>` · `autoplay=1` · `fast=1` (FX speed ×4) · `instant=1` · `event=<id>` · `gallery=heroes|enemies|
summons|objects|all|<id>` · `unlockall=1` · `sound=1` (debug pages are silent without it) · `rot=<deg>` (the battlefield
view angle at boot, e.g. `rot=30`; read by `DD.Render.init`, never remembered) · `isolate=a,b` (loader: only content files and content
tests whose path contains a substring are loaded; core always loads) · `fixtures=1` (the loader also loads `tests/fixtures.js`: test heroes,
enemies and encounters with `test_` ids — lets the whole game run before real content exists). With `debug=1`,
`window.DDdbg` exposes helpers in the console. `js/main.js` must do nothing when `window.DD_TEST` is set.
`tests/fixtures.js` only registers content (it must not reference `DD_TEST`); it includes at least 4 test heroes,
6 test enemies (incl. an elite and a boss), 2 test summons and test encounters for every act × kind.

### 10.2 Tests
`tests/test.html` loads the manifest + `tests/manifest.js` files + `tests/harness.js`. Register suites with
`DD_TEST.suite(name, fn, { tags })`. Run `tools/test.sh ["suite=a,b&n=5"]`. Suites run headless (`DD.headless`,
`DD.FX.instant`, memory storage). Generic content suites (RULES) validate **all** registered content automatically:
registry references, desc() for every level, every skill executed in a sandbox, every enemy planned/executed, every
encounter auto-battled, every event choice resolved.

### 10.3 Screenshots
`tools/shot.sh "<query>" out.png [WxH] [virtual-ms]` → headless screenshot of `index.html?<query>`; view with Read.
