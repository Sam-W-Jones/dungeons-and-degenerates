# Hero: Professor Marbles — notes

Files: `js/data/heroes/marbles.js`, `tests/content/hero_marbles.js` (suites `hero_marbles: …`).
Run: `bash tools/test.sh "suite=hero_marbles&isolate=heroes/marbles,hero_marbles"`.
Balance sim (manual, needs the other content): `bash tools/test.sh "suite=hero_marbles: zz&sim=1&n=3&verbose=1"`.

## Summary

**Professor Marbles, the Forgetful Fist** — ancient rabbitfolk monk, starter (`unlock: null`). Mobile melee
skirmisher / control. 28 HP (+4/level), 3 AP, move 4, `flags.hop` (climbs 2 levels). Saffron UI accent `#e8a33d`.

**Passive — Absent-Minded Mastery** (`hooks.onTurnStart`, rolls with `state.rng`): at the start of each of his turns he
"remembers" one random socketed skill that is ready this turn (cooldown after this turn's tick, charges left): its
**first use that turn costs 0 AP** (status `mar_remembered` 💡, FX text "💡 Skill!", log line "💡 Professor Marbles
suddenly remembers X! (first use this turn costs 0 AP)", sometimes a bark). With a 25% chance per turn he also
**forgets** a different ready skill: +1 AP that turn (status `mar_forgot` ❓ "Senior Moment", FX + log). Both statuses
leave silently at his turn end. Stunned/asleep/frozen/sheep: no roll. Net positive by design (the free skill is worth
1-3 AP every turn; the forget is rare and never the free one). The HUD shows the free skill's AP gem as a green 0 and
the status chip names the skill.

**Basic** `mar_jab` Doddering Jab (👊, 1 AP): 5 damage to an adjacent foe.

**Signature** `mar_signature` Forgot I Was Retired (🐇, 2 AP + 100 Hype, unit 1-5, no LOS): banner + flash + shake;
5 strikes of 5 damage: the first on the target, each next one dashes (jump FX + teleport to the safest free tile next
to the foe, nearest first) to the nearest foe within 3 tiles not struck yet, or pummels the last one again; walled-in
foes and foes he can't hurt (Invulnerable status or flag, his charmer) are never chained to; stops if he goes down
(thorns). The last foe struck is Stunned. Max 25 damage.

**Skill pool (11; starters `mar_whack`, `mar_scatter`)** — I / II / III:

| id | name | AP / cd | I → II → III |
|---|---|---|---|
| `mar_whack` | Walking Stick Whack 🏑 (dir) | 1 / 1 | 5 dmg push 2 → 6 push 2 → 7 push 3. Allies are shoved (no whack or bump damage; pits/lava still hurt); objects take the damage. |
| `mar_scatter` | Marble Scatter 🔮 (tile 0-4, LOS) | 1 / 2 | Loose Marbles on a plus (5 tiles) 3 rounds, slip 2 → slip 3 → 3x3 square, 4 rounds, slip 3. Foes under it slip at once. |
| `mar_punch` | Rabbit Punch 🥊 | 2 / 3,3,2 | 6 → 8 → 9 dmg + Stun (cancels the telegraph); cooldown 2 at III. |
| `mar_flurry` | Flurry of Paws 🐾 | 2 / 1 | 3×3 (9) → 3×4 (12) → 3×5 (15); leftovers hop to another adjacent foe he can hurt if the target drops. |
| `mar_backinmyday` | Back In My Day... 👴 (self) | 1 / 2 | Block 4 + Thorns 2 → 6 + 3 → 7 + 3; taunts adjacent foes (within 2 at III). Thorns lasts through his next turn. |
| `mar_thumper` | Thumper 🦶 (self) | 2 / 2 | 4 → 5 → 6 dmg to adjacent foes + push 1; III hits all 8 surrounding tiles. |
| `mar_lecture` | Lecture 📚 (self, **spell**) | 3,3,2 / 3 | Adjacent foes Asleep 2 turns → within 2 → within 2 for 2 AP. Silence blocks it. |
| `mar_carrot` | Carrot Toss 🥕 (ally/self 0-4) | 1 / 0, **3 charges** | Heal 6 → 8 → 9 + remove 1 debuff. Custom carrot projectile. |
| `mar_leap` | Hare-Brained Leap 🐰 (empty tile) | 1 / 2 | Leap 3 → 4 → 4 + THUMP: adjacent foes 3 dmg + push 1. Jump FX, any height. |
| `mar_hook` | Vaudeville Hook 🪝 (straight 2-r, LOS) | 1 / 2 | 3 dmg pull 2 (r 3) → 4 pull 3 → 5 pull 3 (r 4). Allies are hauled (no hook or bump damage; pits/lava still hurt). |
| `mar_waxon` | Wax On, Wax Off 🧽 (ally 1-3) | 1 / 2 | Empowered → + 4 Block → + 4 Block + 1 AP now. |

Telegraph tools: cancel (Punch stun, Lecture sleep), redirect (Back In My Day taunt), reposition (Whack/Hook shove or
haul allies out of red tiles, Thumper, Leap), defend (Block + Thorns, Carrot). Combos with other heroes: marbles make
every pusher's shove slide 1 extra tile and leave foes Vulnerable (+25% for the whole party); Hook drags foes into an
ally's AoE / onto marbles; Wax On, Wax Off empowers an ally's next big hit.

**Surface `mar_marbles` (Loose Marbles)**: `slide: true` (pushed units slide +1, engine), `onEnter` → slip; own
`draw` painter (7 glossy marbles per tile, stable per-tile layout, twinkles). Slip rules (enemy side, grounded only):
`tile.surface.data.dmg` damage (default 2, cause `surface`, credited to `data.src` → slip kills are environmental
kills, +20 Hype) + Vulnerable 1 turn (2 when it slips during its own turn, so the party's next turn is covered).
Walking in during enemy planning also stops the walk (silent 1-turn Root,
removed right after planning by the engine) and **uses those marbles up**. Pushed/teleported in: no root, marbles stay
(so the slide still happens). Heroes, hero-side summons and flyers never slip. Not flagged `hazard` (goblins never look
down), never placed over another surface.

**Statuses**: `mar_remembered` (buff, 💡, `data: { ids, used }`, hooks `modifyCost` = 0 for a free id,
`onSkillUsed` marks it used and removes the status when all are used, `onTurnEnd` removes it silently), `mar_forgot`
(debuff, ❓, `data: { id }`, `modifyCost` +1, `onTurnEnd` removes it silently; cleansable).

**Items** (`hero: 'marbles'`):
- `mar_cane` Cane of Unsolicited Advice (weapon, rare, 🏒): +10% damage; Whack / Thumper / Hook / Leap move units 1 extra tile.
- `mar_robes` Robes of Many Pockets (armor, rare, 🥋): +5 max HP; at the end of each of his turns Loose Marbles (2 slip
  damage, 2 rounds = until the end of next round) spill onto the 4 tiles around him (not over other surfaces).
- `mar_pills` Grandpa's Pill Organizer (trinket, legendary, 💊): +10 Hype at combat start; remembers 2 skills per turn, never forgets.

**Sprite**: humanoid slim, scale 1 (37 px tall at zoom 1), warm grey fur, saffron robe + maroon sash, brass round
spectacles, sleepy eyes, `rabbit_floppy` ears, rabbit tail, cane; an `overlay` adds the long wispy kung-fu-master beard,
droopy moustache, bushy white brows (drooping at the outer ends, above the lenses) and a marble pouch with two marbles
peeking out. Portrait via `DD.Sprites.portrait`.

**Barks**: 4-6 lines for every key (≤ 70 chars), referencing Josiah, Zarathor, Ellaria, Marwyn, Sparrow, Syllamin,
Slate and Mayor Buga.

Every id: `hero:marbles`, skills `mar_jab mar_signature mar_whack mar_scatter mar_punch mar_flurry mar_backinmyday
mar_thumper mar_lecture mar_carrot mar_leap mar_hook mar_waxon`, statuses `mar_remembered mar_forgot`, surface
`mar_marbles`, items `mar_cane mar_robes mar_pills`.

**Tests** (13 suites, 777 assertions, + a `zz` balance sim that skips unless `sim=1`): registration/numbers/barks; every skill at
every level (damage vs armor-free fixture grunts, statuses + turns, push/pull distances, costs, cooldowns, charges);
the surface (slip on cast, slip + slide when pushed, a planning walk stopped and the marbles used up, flyers/heroes
immune, expiry, slip kills = environmental); the passive (free once, forget ~25% and never the free one, cooldowns /
charges / stun respected, determinism, Pill Organizer); the signature (chain, single foe, target dying mid-chain,
walled-in foe, downed mid-chain); items; previews exact and side-effect free for every skill × level × up to 6 targets;
edge cases (stun / sheep / charm / silence / not enough AP, null and dead targets, pits / lava / water, map edges and
corners, hop); review regressions (Flurry beats its previous level at armor 0/1/2, the signature and Flurry spill-over
never waste strikes on Invulnerable foes or his charmer, no turn-end popups for the memory statuses, scatter leaves other
surfaces alone, Leap III + Cane, an ally whacked toward a pit only takes the fall, tooltip wording); AutoPlay with
`['marbles', 'test_knight', 'test_cleric', 'test_mage']` vs fixture acts 1-3 at levels 1 / 4 / 7 / 10 (+ a second L10
loadout), counting skill usage (all 11 pool skills, the jab and the signature get used).

## Public API

- `DD.Marbles.scatter(src, tiles, { dmg = 2, turns = 3, slipNow })` → tiles that got Loose Marbles (skips tiles with
  another surface; `src` gets the credit; `slipNow` makes enemies already standing there slip).
- `DD.Marbles.slip(unit, tile)` → bool: apply the slip rules to a unit on a marbles tile (false for heroes, summons,
  flyers, or no marbles).
- Surface `mar_marbles`: other content may `DD.Act.setSurface(x, y, 'mar_marbles', turns)`; set
  `tile.surface.data = { dmg, src: unitId }` for slip damage/credit (defaults: 2, nobody).
- Statuses `mar_remembered` / `mar_forgot` are Marbles-specific (their `data` drives the cost hooks).

## Deviations

- "Walking" vs "pushed" slips are told apart by `state.planning` (enemies move under their own power during planning;
  surface `onEnter` gets no cause). The stop uses the core Root (silent on apply; the engine's after-planning decay shows
  a brief "−Rooted"). An enemy that runs over marbles inside an attack during its execution (e.g. an act-2 charge that
  walks via `moveAlong`) slips (damage + Vulnerable, 2 turns there so it still covers the party's next turn) but keeps
  going and the marbles stay; the tooltips therefore say "a foe walking in on its move".
- Thorns from Back In My Day uses `turns: 2` so it covers the enemy phase; it therefore also lasts through his next
  player turn (the desc says "through his next turn").
- The DESIGN's "slightly hunched" posture is not expressible with the humanoid painter (the head is drawn on top of the
  body at a fixed spot); the cane, spectacles and beard carry the age instead.

## Core fixes

- None.

## Requests

- **RULES (optional)**: a way to stop a walking unit without a status (e.g. `unit.data.stopMove` checked by
  `moveAlong`, or a `stopMove` return from surface `onEnter`) would let slips avoid the "−Rooted" popup after planning.
- **RENDER-SPRITES (optional)**: a spec-level `lean` / `hunch` knob for humanoids (DESIGN asks for a slightly hunched
  Professor Marbles). The draw option `lean` rotates the whole body around the feet, which reads as tipping over.
- **RULES (optional, review)**: AutoPlay's exact score gives a Sleep the same +2.5 as any status, so it seldom casts
  Lecture (0.4 uses per fight when socketed vs 0.9-1.7 for every other skill), although Sleep cancels intents like Stun.
  Valuing stun-like statuses (`stunLike`) on foes with intents in `exactScore` (as `quickScore` already does for the
  `stun` tag) would fix it for every sleep/freeze skill, Syllamin's Lullaby included.
- **RULES (optional, review)**: `enterTile` bumps `mutations` before any surface `onEnter`, so a hero walking over
  Loose Marbles (a no-op for heroes) loses Undo. With the Robes of Many Pockets marbles lie around him every turn, so
  his allies hit this often. E.g. let `onEnter` return `false` for "nothing happened", or compare `mutations` around
  the call for surfaces.

## Balance

- Fixture AutoPlay (13 + 2 battles): 15/15 wins, 2-4 rounds each.
- Real-encounter sim (`zz`, 34 non-boss encounters × 3, random partners, shuffled turn order, levels 2/5/8):
  102/102 wins; damage per fight — Syllamin 38.2, **Marbles 34.0**, Zarathor 33.1, Josiah 29.8, Sparrow 28.9,
  Corelos 27.5, Slate 20.9, Buga 19.9, Ellaria 18.0, Marwyn 12.4; Marbles 1.58 kills/fight, downed once in 102 fights.
  Upper end for a control hero (the free skill per turn is a strong engine); first knobs if he proves too strong:
  Flurry III, Marble Scatter slip damage, the 25% forget chance.
- Review re-runs (2026-10-30, all real content, other heroes still changing between runs so the numbers drift):
  - `zz` sim, same seeds, after the review fixes: 102/102 wins; damage per fight — Zarathor 49.7, **Marbles 46.2**,
    Syllamin 42.5, Josiah 41.6, Corelos 38.5, Sparrow 37.2, Slate 30.8, Buga 25.1, Marwyn 19.3, Ellaria 18.8; Marbles
    2.00 kills/fight, downed once. (Before the fixes, same day: Marbles 42.5, 4th behind Zarathor 50.5, Syllamin 45.9
    and level with Josiah 42.3: his share moves with the other heroes' edits, not only his own.)
  - Passive on/off (scratch sim, 34 encounters × 3, levels 3/6/9, identical seeds): with Absent-Minded Mastery
    Marbles deals 45.3 per fight and the fights last 4.76 rounds; with the passive switched off 41.8 and 4.89 rounds
    (+8% damage under AutoPlay, which spends the free skill on 5 turns in 7; a human gets more out of it).
  - Skill uses per fight when socketed (AutoPlay): Back In My Day 1.72, Scatter 1.50, Hook 1.40, Wax On 1.39,
    Whack 1.37, Carrot 1.33, Flurry 1.30, Punch 1.00, Leap 0.97, Thumper 0.89, Lecture 0.40 (see Requests); jab
    144 and signature 6 in 102 fights.
  - Damage dealt counts bump damage and the remaining HP of yeeted foes, so pushers (his Whack is a starter) read high.

## Known issues

- Full `tools/test.sh` at review time (2026-10-30, final run): 416 suites, 12 failing sections, none of them Marbles':
  9 in `bosses_act1` (Grimble and the Rat King, in progress; `bosses_act1` alone fails the same way with and without
  Marbles loaded), `hero_ellaria: signature` and `passive-table: cursed` (identical with and without Marbles), and
  `hero_josiah: passive` (passes alone even on the full manifest with Marbles, so it is order-dependent or was a
  concurrent edit). Every `hero_marbles` suite passes and no warning mentions `mar_` content.
- Full `tools/test.sh` (2026-10-30, author's run, other authors mid-flight): every `hero_marbles` suite passes; the failures are in
  other areas' files and do not change with or without Marbles loaded (checked with `isolate=` on/off) — last run:
  `enemies_act1`, `enemies_act3`, `bosses_act1` (Grimble / Rat King; `rat_king` planner throws "plaintiffs is not
  defined", which also fails the generic `content: every enemy plans…` / `content: encounters…` suites), and
  `content: registry cross-references` (narration keys not registered yet, `a1_spore_bro` hat "mushroom" missing from
  the content test's option list). Earlier runs also showed `hero_zarathor` / `hero_marwyn` / `hero_josiah` /
  `hero_buga` failures that came and went with those authors' edits. With only this hero loaded, all `content:` and
  `hero_marbles` suites pass.
- After a slip during planning the engine's Root decay shows a short "−Rooted" text on that enemy (see Requests).
- Walking a hero across marbles makes that move non-undoable (the engine counts every surface `onEnter` as a side
  effect — same as walking through a puddle or fire).
- Marbles are not an AI hazard on purpose: enemies walk into them (they are a trap, used up on contact). AutoPlay
  only values Marble Scatter for the immediate slips on foes already in the area, not for the trap it leaves.
- Marbles block other surfaces that only form on bare tiles (`splash`/`applyElement` puddles, blood from Bleed), and
  `setSurface` callers (fire trails, holy ground...) overwrite marbles. Intentional: marbles never bury another hero's
  surface.
- Barks name other heroes ("Ellaria, dear, send a corgi...") even when they are not in the party; the engine's bark
  picker has no party filter (same for every hero file).
- The deployment replay re-rolls the round-1 memory from the restored RNG, but enemy planning runs first and may draw a
  different number of times after a swap, so swapping heroes in the deploy zone can change which skill he remembers in
  round 1.

## Review (adversarial pass, 2026-10-30)

Verified by running code (scratch probes in `.tmp/hero-marbles-review/`, isolated suites, the generic `content:`
suites, sims), then fixed, most severe first:

1. **Signature wasted strikes on foes he can't hurt.** The chain picked the nearest unstruck foe even if it was
   Invulnerable (e.g. the DM behind his screen, `flags.invulnerable`) or his charmer: probe — 1 strike on the target,
   then 4 strikes for 0 on an Invulnerable grunt, which also got the Stun. `nextStrike` (and Flurry's spill-over) now
   skip foes he can't hurt (`canHurt`: Invulnerable status or flag, the source of his Charm).
2. **Flurry of Paws III was worse than II against armor.** Armor applies to every strike: 5×3 vs armor 2 dealt 5,
   while II (3×4) dealt 6; vs armor 1 only +1. Now 3×5 (still 15): 9/12/15 at armor 0, 6/9/12 at armor 1, 3/6/9 at
   armor 2, so every level beats the one before it.
3. **Sprite looked angry, not doddering.** The overlay's white brows sloped down toward the nose ("\ /") and hid the
   sleepy eyes behind the lenses. They now droop at the outer ends and sit above the spectacles, so the eyes show
   (checked at 6×, at zoom 1-2 and in the 256 px portrait). The Loose Marbles tile tint went from 10% to 18% so the
   trap's footprint reads at zoom 1, not only the marbles.
4. **Popup noise every turn.** The engine's decay removed `mar_remembered` / `mar_forgot` with a "−Remembered!" /
   "−Senior Moment" popup at every turn end (14 popups in 12 turns). They now leave silently via their own `onTurnEnd`.
5. **Tooltips not exact.** Whack / Hook said allies take "no damage", but a shove into a pit or lava still hurts
   (preview showed −8): now "(the whack and bumps don't hurt it)". Scatter silently skipped tiles with another surface
   and flyers never slip: now "(other surfaces stay)" and "Grounded foes". Walking-in stops only apply to an enemy's
   own move (not to a charge during its attack): now "a foe walking in on its move". The passive said "One turn in
   four" for a 25% roll: now "a 25% chance". Grammar in Wax On II ("…+50%), gain 4 Block.") and Back In My Day. The
   Lecture flavor said "Not a spell, technically" while Silence blocks it: now "It counts as a spell."
6. **A slip during the enemy's own turn gave a useless Vulnerable.** A real Owlbear Cub charge across marbles (probe)
   slipped and kept going (as intended), but its Vulnerable 1 was applied during its own turn and expired at that turn's
   end, before the party could use it. `slip` now gives 2 turns when it is the enemy's own turn (`Act.isOwnTurn`), so
   it lasts through the party's next turn like every other slip.

Added suite `hero_marbles: review regressions` (36 assertions; it fails when the fixes are mutated back: Flurry
3/6/5 vs armor 2, 14 popups). Checked and fine: desc(L, null) at every level, previews vs reality, null / dead
targets, stunned / asleep / frozen / sheep (no roll), charm, silence, pits / lava / water / edges, no `Math.random`
in logic, no swallowed errors, the Robes moat during real planning (the grunt slips and stops adjacent, Vulnerable for
the party's turn), deploy replays (instant FX, no bark spam), AutoPlay spending the free skill (5 of 7 turns).
Not changed: the numbers (he sits in the top damage group without dominating; see Balance), the planning "−Rooted"
popup and the Undo wart (engine; see Requests).

## Phase 4 (engine requests role)

Both RULES requests above are done (docs/notes/rules.md "Phase 4"):
- **Undo**: a tile callback only counts as a side effect when it changes something (through DD.Act, `touch()` or a
  roll of the combat RNG), so a hero walking over Loose Marbles keeps Undo. No change needed here.
- **Stop without a status**: `slip()` ends a walking enemy's move with `DD.Act.stopMove(unit)` instead of a silent
  1-turn Root (which popped a stray "−Rooted" right after planning). Tests (`hero_marbles: Marble Scatter and Loose
  Marbles`): no Root comes and goes during the slip; walking over his own marbles can be undone (both fail on the old
  code).
