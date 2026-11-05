# kit — notes (generic skills + consumables)

Files: `js/data/skills_generic.js` (12 generic skills, owner `'generic'`, ids `gen_*`), `js/data/consumables.js`
(14 consumables `con_*` + the surface `con_d4s`), `tests/content/kit.js` (16 suites `kit: …`; the real-hero preview
suite skips itself in isolated runs).

Isolated runs: `bash tools/test.sh "suite=kit&isolate=skills_generic,consumables,content/kit"` (16 suites, 1 skipped) and
`bash tools/test.sh "suite=content:&isolate=skills_generic,consumables,content/kit"` (the generic content suites).

Scratch (v2, all Chrome-slot aware): `.tmp/kitv2/` — `sim.sh "act=1&level=2&n=3&variants=base,pool,kit,cons&gen=0"`
(AutoPlay balance sims with real heroes and encounters; `gen` = which half of the kit the party gets), `dump.sh` (every
desc at every level), `shot.sh` + `scene.html?scene=aimretreat|aimroll|aimshove|aimchair` (HUD shots);
`.tmp/kitmut/run.sh "suite=kit&isolate=skills_generic,consumables,content/kit&mut=<name>"` — mutation checks: the page
loads `mut.js` after everything and patches the kit at runtime (never on disk), `mut=probe` adds AutoPlay probe suites.
v1 scratch (`.tmp/kit/`, `.tmp/kit-review/`) predates v2 and the Chrome slot cap: don't run it.

## v2 conversion (this pass)

The user: *"skills are too overcomplicated, doing too much each — simplify them so that it's the combinations of
effects that feel strong"*, plus initiative turns, no telegraphs, no Guard, no combat-start Block, attacks of
opportunity. DESIGN §6 "Simplicity": one verb + at most one rider, desc in one breath, II = bigger numbers, III = bigger
numbers or one rider. What changed, skill by skill:

| skill | v1 | v2 |
|---|---|---|
| Throw Chair | III: splinters on every other foe next to it | III: the chair knocks the foe back 1 (a push: pits, lava, crashes) |
| Second Wind | II cleanses one debuff; III every debuff + 1 AP | heal only; III shakes off every debuff (no AP) |
| Dodge Roll | works while Rooted, III shakes off Root | refused while Rooted (like every walking skill); Block 2/3/5 |
| Rude Shove | push + 2-3 damage to foes | push only (2/3/4); crashes still deal 3 to both |
| Rally the Troops | Block 2/4/4 + Inspired "this turn" | Inspired until the end of each one's next turn; no Block; III radius 4 + cooldown 2 |
| First Aid | II also Poison, III revives a downed ally | heal + cure Bleeding and Poison at every level; no revive (Help Up does that) |
| Sand in Your Eye | II+ also Weakened; aiScore counted intents | damage + Dazzle only; III hits the foes next to it |
| Come At Me, Bro | "its attacks turn on you" (intent redirect) | Taunt (on its next turn it must attack you) + Block |
| Sucker Punch | doubled vs Taunted too; III Weakens | doubled vs Dazzled / Stunned / Asleep / Frozen; no rider |
| Barrel Toss | III throws everyone 1 tile outward | one verb: the blast (5/6/7, range 4/4/5) + the fire element |
| Power Nap | "No Guard Block, obviously." | the AP you'd lose anyway → HP; heals for what the use really cost (`ctx.paid`) |
| Tactical Retreat | leap next to an ally, out of telegraphs, Block for both | **the generic Disengage**: walk up to 3/4/5 tiles without provoking attacks of opportunity |

Consumables: Smoke Bomb's Stealth and Rally's Inspired are `turns: 1` (= through each one's next turn; v1 needed 2 for
the old side-phase tick); Energy Drink is just "+2 AP" (spendable now, banked for an ally's next turn — no Haste);
Liquid Courage lost its 5 Block (nobody gets a free shield; the drawback is Dazzled until the end of the drinker's next
turn); the Mystery Potion's sheep lasts the rest of this turn (`inst.fresh = false`, see Deviations) and its
Invulnerable `turns: 1`; Smoke Bomb's "shots tracking you fizzle" is gone (only boss wind-ups track); Holy Water hits
exactly what its desc names (undead, devils, demons — the unused `fiend` tag was dropped). Every desc shortened.

## Summary

**Generic skills** — bar-fight basics any hero can learn. Skill tomes offer one some of the time (or whenever the
hero's own pool is exhausted); level-up "learn" choices fall back to them once the hero's own pool is used up
(`DD.Run.learnableFor(rh, { generic: true })`). None is `kind: 'spell'`, so Silence never stops them. Every one has 3+
literal speech-bubble quips (`DD.Kit.QUIPS`, ≤ 70 chars, cosmetic `DD.rng`, silent in previews). No `aiScore`s (AutoPlay
dry-runs them; enemies never use them).

| id | name | AP / cd | L1 → L2 → L3 (exact descs: `bash .tmp/kitv2/dump.sh`) |
|---|---|---|---|
| `gen_throw_chair` | Throw Chair 🪑 | 2 / 2 | foe within 4 (LOS): 7 → 9 → 10 damage; III knocks it back 1 tile. Tags `ranged`, `throw` |
| `gen_second_wind` | Second Wind 🌬️ | 0 / –, 1 charge | heal 6 → 8 → 10; III shakes off every debuff. Refused at full HP (III: unless debuffed) |
| `gen_dodge_roll` | Dodge Roll 🤸 | 1 / 1 | roll 2 → 3 → 3 tiles straight, past anyone (walls/objects/pits/deep water/cliffs stop it; flyers only walls/objects); Block 2 → 3 → 5. Not while Rooted |
| `gen_shove` | Rude Shove 👐 | 1 / 1 | push the adjacent unit (friend or foe) 2 → 3 → 4 tiles; a crash deals 3 to it and what it hits. Area = the slide path |
| `gen_rally` | Rally the Troops 📯 | 1 / 3 → 3 → 2 | you + allies within 2 → 3 → 4: Inspired (+25%) until the end of their next turn |
| `gen_first_aid` | First Aid 🚑 | 1 / 2 | self or adjacent ally: heal 6 → 8 → 10, cure Bleeding and Poison |
| `gen_pocket_sand` | Sand in Your Eye 🏖️ | 1 / 2 | foe within 2 → 3 → 3: 2 → 3 → 3 damage + Dazzled through its next turn; III also every foe next to it |
| `gen_taunt` | Come At Me, Bro 😤 | 1 / 2 | Taunt a foe within 3 → 4 → 4 (III: + every foe next to it) through its next turn; Block 3 → 5 → 6 |
| `gen_sucker_punch` | Sucker Punch 🤛 | 1 / 1 | adjacent foe: 4 → 5 → 6, doubled vs Dazzled / Stunned / Asleep / Frozen (`DD.Kit.HELPLESS`) |
| `gen_barrel_toss` | Barrel Toss 🛢️ | 2 / 2 | tile 2-4 → 2-4 → 2-5 away, no LOS: 5 → 6 → 7 fire to everyone within 1 (allies too) + the fire element (oil, webs, barrels, water → steam) |
| `gen_power_nap` | Power Nap 😴 | 1 / 2 | spend all your AP (this use included): heal 3 → 4 → 5 per AP spent. Refused at full HP or with 0 AP |
| `gen_tactical_retreat` | Tactical Retreat 🏳️ | 1 / 2 | walk up to 3 → 4 → 5 tiles (steps; through friends, never foes; fewest hazard tiles, then fewest steps) without provoking attacks of opportunity. Area = the route. Not while Rooted |

**The combos** (tested in `kit: v2 combos`): Sand → Sucker Punch (2 + 8); Sand → walk away (a Dazzled foe makes no
attack of opportunity); Rude Shove frees an ally from melee (forced movement never provokes); Come At Me, Bro drags the
foe off the mage (it walks to the taunter, through attacks of opportunity) and shields an ally's getaway (a foe taunted by
someone else makes no attack of opportunity on her); Smoke Bomb → walk away (Stealthed movers never provoke); Rally →
the next ally's big turn; Barrel Toss on anybody's oil; Throw Chair III / Rude Shove into pits and lava. With hero
kits: stuns / sleeps / freezes / Dazzles (Zarathor's Supernova, Syllamin's Lullaby, Ellaria's frost) all set up Sucker
Punch; Wet + Frost Flask freezes.

**Consumables** — 1 AP each, party pockets (3 by default), never usable by summons. Commons 20-25 gold, rares 30-32.

| id | name | rarity / price | effect (exact desc in the def) |
|---|---|---|---|
| `con_red_drink` | Red Drink 🥤 | common 20 | heal self or adjacent ally 10 |
| `con_big_red_drink` | Big Red Drink 🍹 | rare 32 | heal self or adjacent ally 20 |
| `con_bad_decisions` | Flask of Bad Decisions 🍾 | rare 30 | tile ≤ 4, r1: 8 fire to everyone (allies too), floor burns 2 rounds, fire element |
| `con_smoke_bomb` | Smoke Bomb 💨 | common 22 | smoke (blocks LOS) within 1 of you for 2 rounds (not over hazards); you + allies within 1 Stealthed until the end of their next turn (also one on a hazard tile the smoke skips) |
| `con_energy_drink` | Energy Drink ⚡ | common 25 | +2 AP now for you, or +2 AP on an adjacent ally's next turn (`gainAp` banking) |
| `con_antidote` | Antidote 💊 | common 20 | self or adjacent ally: remove every debuff, heal 5 |
| `con_liquid_courage` | Liquid Courage 🍺 | common 22 | self or adjacent ally: Empowered; Dazzled (−1 max range) until the end of their next turn |
| `con_scroll_of_yeet` | Scroll of Yeet 📜 | rare 30 | any unit ≤ 4 in a straight line (LOS, not immovable): pushed 3 away from you, crash 5 to it and what it hits; area = the flight |
| `con_bag_of_d4s` | Bag of d4s 🎲 | common 22 | tile ≤ 3, r1: `con_d4s` on dry floor for 3 rounds; the first enemy on each tile takes 4 (ignores armor); heroes and flyers safe; fire melts them; kills credit the thrower |
| `con_holy_water` | Holy Water 😇 | common 24 | tile ≤ 3, r1: undead / devils / demons take 10 holy; Holy Ground on dry floor for 3 rounds |
| `con_frost_flask` | Frost Flask 🧊 | common 25 | tile ≤ 4, r1: foes take 5 frost + Slowed through their next turn; Wet foes freeze; frost element (water → ice, fire out) |
| `con_thunder_jar` | Thunder Jar 🌩️ | rare 32 | foe ≤ 4, LOS: 8 lightning, jumps to 2 more foes (each within 2 of the last; nearest, then weakest) for 4; water under any struck foe is electrified once (4 + Stun to everyone in that pool, heroes too) |
| `con_pocket_sand` | Pocket Sand (Family Size) ⏳ | common 20 | cone 3 deep: every foe Dazzled + Weakened through its next turn |
| `con_mystery_potion` | Mystery Potion 🧪 | common 20 | tag `random`; d6 from `ctx.rng`: 1 sheep for the rest of this turn · 2 Poison 3 · 3 heal 12 · 4 +2 AP · 5 Invulnerable until the end of your next turn · 6 a good Wild Magic surge (only when `DD.WildMagic.pool(u, { good: true })` is non-empty, else heal 12). Own `preview` (a bare "?") so the HUD can't give the roll away |

Surface `con_d4s` ("Loose d4s", 3 turns default): custom painter (six seeded little d4 pyramids per tile), `onEnter`
→ 4 damage to a non-hero, non-flying unit (cause `'surface'`, source = the thrower) and the tile is cleared;
`react: { fire: { surface: null } }`. Not flagged `hazard` (heroes are safe on it, so AI/AutoPlay path through freely).

## Public API

`DD.Kit` (both files add to it; all pure unless noted):
- `GENERIC_IDS`, `CONSUMABLE_IDS` — the 12 / 14 ids in display order. `QUIPS` — `{ skillId: [lines] }`.
- `HELPLESS` = `['dazzled', 'stun', 'sleep', 'frozen']`; `isHelpless(unit)` (Sucker Punch's condition).
- `pushPath(unit, dir, n, src)` → tiles a forced push by `src` would carry `unit` through (after `modifyPush` hooks,
  incl. `DD.Act.push`'s one-tile slide when the last step lands on ice terrain or a `slide` surface), plus the tile it
  would crash into (the HUD area of Rude Shove, the chair's knockback, the Scroll of Yeet; reusable by any push skill's
  `area: { shape: 'custom', fn }`). `pushDist(src, unit, dir, n)` → the distance after `modifyPush` hooks, fired
  quietly (FX pushes and log/barks/events suppressed for the call).
- `rollPath(user, target)` → straight-line tiles to `target` or `null` (Dodge Roll's rule).
- `retreatPath(user, to, n)` → Tactical Retreat's walk (excluding the start) of at most n steps to a free tile, fewest
  hazard tiles then fewest steps, through friends but never foes; `null` if none. One walk tree per (state, unit,
  position, n, flying / hop, mutation counter, turn, foes' positions) is cached in a WeakMap (targeting asks per tile).
- `drawChair`, `drawBarrel` — FX painters: `DD.FX.projectile(a, b, { kind: 'custom', draw: DD.Kit.drawChair })`.
- `coverable(x, y)` — may a thrown potion lay a surface here. `chainNext(user, last, struck)` — Thunder Jar's next jump.
  `unholy(unit)` — tags undead / devil / demon. `D4_DMG` = 4.
- Removed in v2 (intent tools): `telegraphed()`, `retreatSpot()`, `aidTarget()`.
- Surface `con_d4s` (any content may place it with `DD.Act.setSurface(x, y, 'con_d4s', turns)`; put
  `tile.surface.data = { src: unitId }` to credit kills).
- Damage-event tags other content can key on: Throw Chair's hit `['ranged', 'throw']` and the Barrel Toss blast
  `['fire', 'aoe', 'barrel', 'throw']` (Slate's Mitts of Unreasonable Velocity add +2 to both), Sucker Punch
  `['melee', 'punch']`, Sand in Your Eye `['ranged', 'sand']`, d4s `['d4']` (cause `'surface'`). Consumable damage is
  not tagged `throw`. Rude Shove deals no damage of its own any more (only the engine's `bump`).

## Deviations

- **Names** (DESIGN §7 lists working titles; ids keep them): Shove → *Rude Shove*, Rally → *Rally the Troops*,
  Pocket Sand (skill) → *Sand in Your Eye* and Pocket Sand (consumable) → *Pocket Sand (Family Size)*, Taunt → *Come At
  Me, Bro*, Bag of Marbles → *Bag of d4s* (the marbles stay Professor Marbles'). The registry suite asserts no
  display-name clash with any other skill, consumable or item, and no generic skill icon that a hero skill also uses.
- **Energy Drink** is "+2 AP" (DESIGN §7 says "(haste)"): one verb; v2's `gainAp` banking makes it work for an ally
  too (its next turn). Haste on top would be a second effect.
- **Tactical Retreat** changed jobs: v1's "leap next to an ally" was mostly about leaving telegraphed tiles; v2's
  version is the task's suggested Disengage. It counts steps, not move cost (mud and climbs count 1, like Pebbles'
  Hot Zoomies), and it is a skill walk (`DD.Act.moveAlong` without `provoke`): tile effects apply on the way (the route
  avoids hazards when it can, the preview shows the rest), Bleed ticks like any move.
- **Dodge Roll** now refuses while Rooted (v1 rolled out of roots): every walking skill does (Strut, Zoomies); simpler.
- **Mystery Potion face 1** "a sheep for the rest of this turn": the core `sheep` status has no `skipFresh: false`, so
  the potion clears the fresh flag on the instance it gets back (`st.fresh = false`) and the end of this turn counts.
  See Requests (a per-application option would be cleaner).
- **Second Wind** is a free action (0 AP) with `charges: 1` rather than a cooldown — the "once per fight" panic button.
- **Power Nap** heals per AP actually paid (`ctx.paid.ap`, so a passive that makes it free counts 0; a use resolved by
  another effect without paying counts 0) plus every AP left; with 0 AP in total it is refused instead of healing 0.
- **Rally III** improves its radius (3 → 4) and its cooldown (3 → 2). (Before the v2 review only the cooldown changed, so the
  level-up card read exactly like "Was: …"; the registry suite now checks every upgrade reads differently.)
- **Dodge Roll / Throw Chair III / Rude Shove** mention neither crashes into walls nor high ground: engine rules.

## Core fixes

- (v1, still in place) `js/engine/autoplay.js` `busiestTargets` (`[core fix, kit]`): AutoPlay previews the consumable
  targets whose area holds the most foes, so thrown bombs land on clusters. Regression tests in `kit: AutoPlay uses
  consumables sensibly`.

## Requests

- **RULES** (small, optional): a per-application "this turn only" for `DD.Act.addStatus` (e.g. `{ turns: 1, fresh:
  false }`), so content need not clear `inst.fresh` by hand for core statuses without `skipFresh: false` (the Mystery
  Potion's sheep does today; behaviour tested).
- **Lead (DESIGN §7)**: "Energy Drink (haste)" → "Energy Drink (+2 AP)"; the generic-skill list could name the v2 roles
  (Tactical Retreat = the generic Disengage).
- **AutoPlay** (FYI, not a bug): AutoPlay uses Dodge Roll to get a wounded hero out of a three-grunt pocket, but a
  3-tile Tactical Retreat it rarely picks (mov-3 melee foes can follow; the value is in skipping the attacks of
  opportunity, then walking on with a normal move — a two-step plan its one-step search doesn't see). It never drinks
  Energy Drink / Smoke Bomb / Liquid Courage unprompted (tested as "leaves them alone when nothing calls for them").

## Known issues

- None open in my files. Final full run after the v2 review (2026-11-04, others mid-flight): 798 suites, 115435
  assertions ok; all 16 `kit:` suites pass (30165 real-hero preview assertions with all 16 heroes), every `content:`
  suite passes, no swallowed "Error in …". The 3 failing sections are other areas': `integration:` cross-content (the
  pre-v2 unlock conditions / "ten real heroes") and the protect-objective step (it still expects "no … XP" text), and
  `bosses_act2: lich review (v2)` (expected `lich_shhh`, got `lich_bookfall`; it passes alone, with or without the
  Rally change, so it depends on suite order or the owner's in-flight work). None uses a generic skill or a consumable.
- The real HUD shows Tactical Retreat's valid tiles and the hint "Click an empty tile (range 1–4)": the range is the
  Manhattan target range, the walk itself is checked per tile (`.tmp/kitv2/aimretreat*.png`).

## Tests (`tests/content/kit.js`, 16 suites)

Registry (no v1 words in any desc / flavor, one-breath descs ≤ 140 chars for skills and ≤ 210 for consumables, ≤ 3
numbers per level, no code reading intents / telegraphs, no Block on any consumable, every level visibly better and
every upgrade reading differently from the level before (the level-up card shows "Was: …"), icons, names, prices);
every skill at every level (Throw Chair, Sucker Punch, Sand; Shove, Barrel Toss; Second Wind, First Aid,
Power Nap; Rally and Come At Me with v2 durations over real turn order; Dodge Roll and Tactical Retreat with attack-of-
opportunity controls); `kit: v2 combos`; drinks (Energy Drink banking, Liquid Courage on self and ally, all six Mystery
faces with v2 durations); throwables; Smoke Bomb over a real round (the ally's Stealth ends with her turn, the user's
lasts through his next); edge cases (null targets, thorns, edges, lava, impaired users, not your turn, summons); HUD
previews vs reality (fixture knight; every real hero in full runs); AutoPlay with consumables and the whole kit; the
run layer (tomes, rewards, shop, learn + upgrade, a real run fight on the knight's initiative turn).
**Mutation-checked** (`.tmp/kitmut`, 11 mutants, each fails at least one suite): Tactical Retreat / Dodge Roll walking
with `provoke`, Smoke Bomb / Rally with `turns: 2`, Energy Drink + Haste, the sheep's fresh flag kept, Taunt counted as
helpless, Power Nap ignoring `ctx.paid`, Liquid Courage + 5 Block, Sand without its Dazzle, a hazard-blind retreat route.

## Balance (AutoPlay sims, `.tmp/kitv2/sim.sh`, real heroes and encounters, rolled initiative)

Party Zarathor / Syllamin / Marbles / Marwyn vs every normal encounter of the act. **base** = the 2 starting skills;
**pool** = +2 of the hero's own pool skills; **kit** = +2 generic skills each at I (half A, `gen=0`: Throw Chair +
Second Wind, Dodge Roll + Rude Shove, Rally + First Aid, Sand + Come At Me; half B, `gen=8`: Sucker Punch + Barrel
Toss, Power Nap + Tactical Retreat, Throw Chair + Second Wind, Dodge Roll + Rude Shove); **cons** = a fresh Red Drink +
Flask of Bad Decisions + Frost Flask every fight (an upper bound: real pockets refill far more slowly). Cells: win ·
rounds · party HP lost · fights in which someone went down.

| | base | pool | kit A | kit B | cons |
|---|---|---|---|---|---|
| Act 1 normal, L2 (8 × 3) | 96% · 4.3 · 22.0 · 13% | 100% · 4.3 · 22.5 · 0% | 100% · 4.4 · 14.2 · 4% | 100% · 4.1 · 18.1 · 4% | (8 × 2) 100% · 3.9 · 9.8 · 0% |
| Act 2 normal, L4 (8 × 2) | 100% · 6.4 · 77.1 · 69% | 100% · 5.6 · 65.1 · 50% | 100% · 6.9 · 62.1 · 31% | 100% · 6.6 · 67.0 · 69% | 100% · 6.1 · 61.1 · 31% |

Two generic skills help about as much as two more of the hero's own skills: the support half (Rally, First Aid, Second
Wind, Taunt, Sand) saves the most HP because AutoPlay plays it well; the damage half is level with the pool. Neither is
dominant, and Act 2 fights still hurt (someone goes down in a third to two thirds of them), as the v2 target wants.
Level I numbers sit inside DESIGN §5 (single target 7 for 2 AP; AoE 5 for 2 AP); level III ≈ +40-67 % or one rider.
AutoPlay's favourites: Rally and First Aid nearly every time they are ready, Throw Chair, Dodge Roll (rolling out of
melee), Sand, Taunt; least used: Tactical Retreat, Power Nap, Rude Shove.

## Review (v2)

Adversarial review of the v2 conversion (2026-11-04; reviewer now owns these files). Method: re-read both files
against DESIGN §4.1-4.4 / §6 "Simplicity", the migration guide and rules.md "Attacks of opportunity"; ran probes in a
scratch page that loads the real game + fixtures (`.tmp/kitrev2/run.sh "suite=probe&verbose=1&isolate=…"`, `probe.js`;
it now holds the review mutants `?mut=rally_r3|smoke_in_it`); HUD shots with `.tmp/kitrev2/shot.sh` (`scene.js`: d4s,
smoke, holy ground, Barrel Toss III aimed) plus the author's `.tmp/kitv2` aim scenes (Tactical Retreat, Rude Shove).

**Verified by running code**: every desc at every level vs `execute` (dumped all 36 skill descs + 14 consumable descs);
no Guard, no starting / consumable Block, no intent or telegraph code; per-own-turn durations (Sand, Taunt, Rally,
Liquid Courage, Smoke Bomb, Mystery 1 and 5); attacks of opportunity: Dodge Roll / Tactical Retreat / Rude Shove /
Throw Chair III / Scroll of Yeet provoke nothing, a Dazzled foe and a foe taunted by someone else make none, a Stealthed
mover provokes none; Tactical Retreat stopped by a web or downed by lava on a friend's tile ends on the nearest free tile
(as a plain move does) and the preview says so; Bleed costs a retreat one tick like a plain move (a Dodge Roll none),
previews exact; areas are Manhattan (Sand III / Come At Me III "next to it" = the 4 neighbours; Barrel Toss, min range
2, never catches its thrower); visuals OK (custom d4 painter, smoke, holy ground, shove path, retreat tiles, Barrel
Toss III preview "Hits 3 foes for 21").

**Fixed**
1. *Smoke Bomb desc ≠ effect*: "every ally **in it**" — the code Stealths every ally within 1, also one standing on a
   hazard tile the smoke skips. Desc now "within 1"; test pins it (mutant `smoke_in_it` fails it).
2. *Rally the Troops II → III read the same*: only the cooldown changed, so the level-up upgrade card showed exactly
   the "Was: …" text. III is now radius 4 (and still cooldown 2). The registry suite checks every upgrade's desc
   differs from the level before (mutant `rally_r3` fails it); the Rally suite checks a hero 4 tiles away only at III.
3. *Missing attack-of-opportunity combo tests*: `kit: v2 combos` now also covers Come At Me, Bro shielding an ally's
   getaway (with an untaunted control that does provoke) and Smoke Bomb → walk out of melee for free.

**Left as is (rules, not kit bugs)**
- Tactical Retreat's walk and Dodge Roll's roll are skill *ranges*: hero Dazzle (Liquid Courage, the DM's house rule)
  shortens them by 1 and "+1 range" items (Yardstick, Longbow) lengthen them, exactly as those effects' texts say and
  as for every hero dash (`DD.Targeting.range`, max ≥ 2). Liquid Courage's flavor ("melee heroes never notice the
  range part") is a joke, not a promise.
- Energy Drink given to your own summon (it acts on your turn): the 2 AP arrive at once — `gainAp` treats the owner's
  turn as the summon's; better than "on its next turn", never worse.
- Power Nap's "Nap away the rest of your turn" frames "spend all your AP": 0-AP actions (Second Wind) stay possible.

## Requests (Nov 3) — flyers, barrels, heals on the downed (CONTENT SWEEP, shared)

User requests: "Flying characters ignore floor effects" · "Allow detonation of barrels by targetting them" · "Allow
targetting o fheals on downed characters to heal and bring them up". Engine rules: `docs/notes/rules.md` (v2 requests).

- **Heals revive**: First Aid, Red Drink, Big Red Drink and the Antidote, aimed at a downed adjacent ally, get them up
  with the healed HP (heal bonus included). First Aid and the drinks' `drinker(ctx)` accept the engine's
  `ctx.reviveTarget` (no early return on a downed target); the cures / cleanse come after the heal (the Antidote heals a
  downed ally first: their debuffs went when they dropped). Energy Drink and Liquid Courage are not heals: no change.
- **Barrels**: Throw Chair, Sucker Punch and the Thunder Jar can be aimed at an explosive barrel (the engine detonates
  it; no knockback, no chain). All three make sense on a barrel, so nobody opts out. Sand in Your Eye, Come At Me, Bro
  and the Scroll of Yeet are not attacks: no barrel targets.
- **Flyers**: Loose d4s use `DD.Grid.feelsFloor`; Holy Water's desc says "grounded heroes" heal (a flyer floats above
  Holy Ground); the Flask of Bad Decisions still hits a flyer in its blast but its burning floor never Burns one.
- Tests: "kit: v2 requests — aimed heals get downed allies up, attacks set barrels off, flyers skip the floor" (every
  First Aid level, the three drinks, +50% healing, preview = reality; barrels for Chair / Punch / Jar; Holy Water and the
  Flask with flyers). "Second Wind, First Aid and Power Nap": First Aid now accepts a downed adjacent ally.

## History

v1 (2026-10-31, kit + review): telegraph-era versions of these skills (Tactical Retreat's landing tile out of
telegraphs, Sand's intent-counting aiScore, "No Guard Block" jokes), fixed in review: the Mystery Potion's preview
giving the roll away (kept: its own preview), push highlights ignoring `modifyPush` (kept: `pushDist`), icon clashes on
the action bar (kept: 🤛 👐 🚑 and the registry check), desc exactness (kept as a rule).
