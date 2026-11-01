# kit — notes (generic skills + consumables)

Files: `js/data/skills_generic.js` (12 generic skills, owner `'generic'`, ids `gen_*`), `js/data/consumables.js`
(14 consumables `con_*` + the surface `con_d4s`), `tests/content/kit.js` (15 suites `kit: …`; the real-hero preview
suite skips itself in isolated runs).
Scratch: `.tmp/kit/` (`scene.html?scene=board|d4|chair|barrel|aim|aimcons|aimshove|sand|yeet|thunder|rally|tipskill|tipcons&real=1` +
`shot.sh` for HUD/FX shots, `sim.html` + `sim.sh` for AutoPlay balance sims, `dump.html` + `dump.sh` prints every desc);
review scratch in `.tmp/kit-review/` (`probe.html?p=…`, `scene.html` with `aimretreat|aimmystery` and `sel=<hero index>`).

Isolated runs: `bash tools/test.sh "suite=kit&isolate=skills_generic,consumables,content/kit"` (15 suites, 1 skipped) and
`bash tools/test.sh "suite=content:&isolate=skills_generic,consumables,content/kit"` (the generic content suites).

## Summary

**Generic skills** — bar-fight basics any hero can learn. Skill tomes offer one 35% of the time (or whenever the hero's
own pool is exhausted); level-up "learn" choices fall back to them once the hero's own pool is used up
(`DD.Run.learnableFor(rh, { generic: true })`). Three levels each. None is `kind: 'spell'`, so Silence never stops
them. Every one has 3+ literal speech-bubble quips (`DD.Kit.QUIPS`, ≤ 70 chars, cosmetic `DD.rng`, silent in previews).

| id | name | AP / cd | L1 → L2 → L3 |
|---|---|---|---|
| `gen_throw_chair` | Throw Chair 🪑 | 2 / 2 | chair at a foe, range 1-4, LOS: 7 → 9 → 10 dmg; III: splinters deal 3 to every other foe next to it. Custom tumbling-chair projectile |
| `gen_second_wind` | Second Wind 🌬️ | 0 / –, 1 charge | self heal 6 → 8 + shake off the newest debuff → 10 + every debuff + gain 1 AP. Refused at full HP (and no debuff) below III |
| `gen_dodge_roll` | Dodge Roll 🤸 | 1 / 1 | roll 2 → 3 → 3 tiles straight, past units (walls/objects stop it; pits/deep water/cliffs too unless you fly), works while Rooted; Block 2 → 3 → 4; III shakes off Root |
| `gen_shove` | Rude Shove 👐 | 1 / 1 | push the adjacent unit (friend or foe) 2 → 2 → 3 tiles; foes take 2 → 3 → 3; crash 3 (engine default) to it and what it hits; pits/lava/water do the rest. Area preview shows the slide path (modifyPush hooks included) |
| `gen_rally` | Rally the Troops 📯 | 1 / 3 | you + allies within 2 → 2 → 3: Block 2 → 4 → 4 and Inspired (+25% dmg) this turn → this turn → through your next turn |
| `gen_first_aid` | First Aid 🚑 | 1 / 2 | self or adjacent ally: heal 6 → 8 → 10, cure Bleed → Bleed + Poison → same; III also revives a downed adjacent hero at 6 HP |
| `gen_pocket_sand` | Sand in Your Eye 🏖️ | 1 / 2 | foe at range 2 → 2 → 3 (III: + every foe next to it): 2 → 2 → 3 dmg + Dazzled 1 turn; II+: Weakened 1 turn |
| `gen_taunt` | Come At Me, Bro 😤 | 1 / 2 | Taunt a foe at range 3 → 4 → 4 (III: + every foe next to it) for 1 turn; Block 3 → 5 → 6 |
| `gen_sucker_punch` | Sucker Punch 🤛 | 1 / 1 | adjacent foe: 4 → 5 → 6, doubled vs Dazzled/Stunned/Asleep/Frozen/Taunted (`DD.Kit.HELPLESS`); III: Weakened 1 turn |
| `gen_barrel_toss` | Barrel Toss 🛢️ | 2 / 2 | lob 2-4 → 2-4 → 2-5 tiles, no LOS: 5 → 6 → 7 fire to every unit within 1 (allies too) + fire element on the blast (oil, webs, barrels, water → steam); III: everyone around the impact thrown 1 outward. Custom lit-barrel projectile |
| `gen_power_nap` | Power Nap 😴 | 1 / 2 | spend this + all remaining AP, heal 3 → 4 → 5 per AP spent (at least 1). Refused at full HP |
| `gen_tactical_retreat` | Tactical Retreat 🏳️ | 1 / 2 | ally within 4 → 5 → 6: hop to the free tile beside them nearest to you, never a hazard, out of enemy telegraphs if possible (adjacent = stay); the area shows the landing tile; both gain Block 3 → 4 → 6. Not while Rooted |

**Consumables** — 1 AP each, party pockets (3 by default), never usable by summons. Commons 20-25 gold, rares 30-32.

| id | name | rarity / price | effect (exact desc in the def) |
|---|---|---|---|
| `con_red_drink` | Red Drink 🥤 | common 20 | heal self or adjacent ally 10 |
| `con_big_red_drink` | Big Red Drink 🍹 | rare 32 | heal self or adjacent ally 20 |
| `con_bad_decisions` | Flask of Bad Decisions 🍾 | rare 30 | tile ≤ 4, r1: 8 fire to every unit (allies too), floor burns 2 rounds, fire element (oil/webs/barrels) |
| `con_smoke_bomb` | Smoke Bomb 💨 | common 22 | smoke (blocks LOS) on the tiles within 1 of you for 2 rounds (not over hazards, as the desc says); you + allies in it Stealthed through your next turn |
| `con_energy_drink` | Energy Drink ⚡ | common 25 | self or adjacent ally: +2 AP now and Hasted (+1 AP at the start of the next turn) |
| `con_antidote` | Antidote 💊 | common 20 | self or adjacent ally: remove every debuff, heal 5 |
| `con_liquid_courage` | Liquid Courage 🍺 | common 22 | self or adjacent ally: Empowered + 5 Block, and Dazzled for the rest of this turn (−1 max range) |
| `con_scroll_of_yeet` | Scroll of Yeet 📜 | rare 30 | any unit ≤ 4 in a straight line (LOS, not immovable): pushed 3 tiles away from you, crash 5 to it and what it hits; area preview shows the flight |
| `con_bag_of_d4s` | Bag of d4s 🎲 | common 22 | tile ≤ 3, r1: surface `con_d4s` on dry, unblocked floor for 3 rounds; the first enemy onto each tile (or standing there) takes 4 (ignores armor) and kicks those dice away; heroes and flyers safe; fire melts them; kills credit the thrower (environmental kill) |
| `con_holy_water` | Holy Water 😇 | common 24 | tile ≤ 3, r1: Holy Ground on dry floor for 3 rounds; undead/devils/demons/fiends in the splash take 10 holy |
| `con_frost_flask` | Frost Flask 🧊 | common 25 | tile ≤ 4, r1: foes take 5 frost + Slowed 1 turn; Wet foes freeze; frost element (water → ice, fire out) |
| `con_thunder_jar` | Thunder Jar 🌩️ | rare 32 | foe ≤ 4, LOS: 8 lightning, jumps to 2 more foes (each within 2 of the last; nearest, then weakest) for 4; water under any struck foe is electrified once (4 + Stun to everyone in that pool, heroes too) |
| `con_pocket_sand` | Pocket Sand (Family Size) ⏳ | common 20 | cone 3 deep: every foe Dazzled + Weakened 1 turn |
| `con_mystery_potion` | Mystery Potion 🧪 | common 20 | tag `random`; d6 from `ctx.rng`: 1 sheep this turn · 2 Poison 3 · 3 heal 12 · 4 +2 AP · 5 Invulnerable through your next turn · 6 a good Wild Magic surge (`DD.WildMagic.surge(u, { good: true, source: 'con_mystery_potion' })`, only when `DD.WildMagic.pool(u, { good: true })` is non-empty, since `surge` alone falls back to any surge; otherwise heal 12, as the desc says). Own `preview` (a bare "?" on the drinker) so the HUD can't show the face the dry run rolled |

Surface `con_d4s` ("Loose d4s", 3 turns default): custom painter (six seeded little d4 pyramids per tile), `onEnter`
→ 4 damage to a non-hero, non-flying unit (cause `'surface'`, source = the thrower) and the tile is cleared;
`react: { fire: { surface: null } }`. Not flagged `hazard` (heroes are safe on it, so AI/AutoPlay path through freely).

Visual checks (`.tmp/kit/*.png`): chair and barrel projectiles mid-flight, d4s / holy ground / smoke / fire on the
board at zoom 1 and 2, Barrel Toss and Frost Flask aiming previews, skill and consumable tooltips; re-shot with the
real heroes (`r_*.png`): board, d4s (dice drawn ~15% bigger since, for zoom 1), chair / barrel in flight, the Rude
Shove aim over ice (the slide tile is highlighted), and the shop (a generic skill tome next to Red Drink / Antidote).

## Public API

`DD.Kit` (both files add to it; all pure unless noted):
- `GENERIC_IDS`, `CONSUMABLE_IDS` — the 12 / 14 ids in display order. `QUIPS` — `{ skillId: [lines] }`.
- `HELPLESS` = `['dazzled', 'stun', 'sleep', 'frozen', 'taunt']`; `isHelpless(unit)` (Sucker Punch's condition).
- `pushPath(unit, dir, n, src)` → tiles a forced push by `src` would carry `unit` through (after `modifyPush` hooks,
  incl. `DD.Act.push`'s one-tile slide when the last step lands on ice terrain or a `slide` surface), plus the tile it
  would crash into (HUD area of a push; reusable by any push skill's `area: { shape: 'custom', fn }`).
  `pushDist(src, unit, dir, n)` → the distance after `modifyPush` hooks, fired quietly (FX pushes and log/barks/events
  suppressed for the call, the same switches a preview dry run uses), so asking for a highlight never shows Marwyn's
  "Too MAGNIFICENT to move!" or the Barrel Armor's "Rolling!".
- `rollPath(user, target)` → straight-line tiles to `target` or `null` (Dodge Roll's rule; flyers only stop at walls
  and objects).
- `telegraphed()` → `{ 'x,y': 1 }` for every tile under a live enemy telegraph (`DD.AI.intentTiles`; stunned or
  sheeped enemies' intents are void).
- `retreatSpot(user, ally)` → the free tile beside `ally` that is not a pit, deep water or hazard: outside telegraphs
  first, then nearest to `user`, then N/E/S/W; `null` if there is none.
- `aidTarget(ctx)` → First Aid's friendly unit on `ctx.target` (downed heroes only when `ctx.L.revive`).
- `drawChair`, `drawBarrel` — FX painters: `DD.FX.projectile(a, b, { kind: 'custom', draw: DD.Kit.drawChair })`.
- `coverable(x, y)` — may a thrown potion lay a surface here (dry walkable floor, no blocking object, no hazard or
  permanent surface). `chainNext(user, last, struck)` — Thunder Jar's next jump. `unholy(unit)` — tags undead / devil
  / demon / fiend. `D4_DMG` = 4.
- Surface `con_d4s` (any content may place it with `DD.Act.setSurface(x, y, 'con_d4s', turns)`; put
  `tile.surface.data = { src: unitId }` to credit kills).
- Damage-event tags other content can key on: Throw Chair's hit `['ranged', 'throw']` and the Barrel Toss blast
  `['fire', 'aoe', 'barrel', 'throw']` (so Slate's Mitts of Unreasonable Velocity add +2 to both — tested with a probe
  rule), splinters `['splinter']`, Rude Shove `['melee', 'push']`, Sucker Punch `['melee', 'punch']`, Sand in Your
  Eye `['ranged', 'sand']`, d4s `['d4']` (cause `'surface'`). Consumable damage is not tagged `throw` (party potions,
  not Slate's throws).

## Deviations

- **Names** (DESIGN §7 lists working titles; ids keep them): Shove → *Rude Shove*, Rally → *Rally the Troops*,
  Pocket Sand (skill) → *Sand in Your Eye* and Pocket Sand (consumable) → *Pocket Sand (Family Size)* (DESIGN uses
  the one name for both), Taunt → *Come At Me, Bro*, Bag of Marbles → *Bag of d4s* (`con_bag_of_d4s`; the marbles
  stay Professor Marbles'). The registry suite asserts no display-name clash with any other skill, consumable or item,
  and no generic skill icon that a hero skill also uses (they share the action bar).
- **Energy Drink "(haste)"**: +2 AP right now *and* Haste with `turns: 2` (= +1 AP at the start of the next player
  turn), i.e. net +2 AP over two turns for 1 AP.
- **Second Wind** is a free action (0 AP) with `charges: 1` rather than a cooldown — the "once per fight" panic button.
- **Power Nap** heals per AP actually paid (`DD.Combat.costOf`, so a passive that makes it free counts 0) plus every
  AP left, minimum 1 AP's worth; it zeroes your AP so Guard gives nothing.
- **Throw Chair III** keeps cooldown 2 (an earlier draft also cut it to 1 on top of +43% damage and splinters, which
  was well past DESIGN's "level III ≈ +50% and/or an extra effect").
- **Dodge Roll / Tactical Retreat** are hops (`DD.Act.teleport` + `FX.jump`): only the landing tile's terrain and
  surface apply; tiles rolled over are not entered.

## Core fixes

- `js/engine/autoplay.js` (`bestConsumable` + new `busiestTargets`, ~13 lines, marked `[core fix, kit]`): AutoPlay
  previewed only 4 evenly spaced valid targets per consumable, so tile-thrown bombs (Flask of Bad Decisions, Frost
  Flask, Holy Water, Bag of d4s) almost never landed on the cluster and were used by luck. It now previews the 4
  targets whose area holds the most foes, then units (stable order). Regression tests: `kit: AutoPlay uses consumables
  sensibly` (Flask thrown at 4 clustered foes; kept when the only blast that gets both foes also burns an ally; thrown
  at the same two foes without the ally).

## Requests

- RULES / AutoPlay (wish, not a bug): `bestConsumable` only values exact preview numbers (damage, heals), so AutoPlay
  never drinks Smoke Bomb, Energy Drink or Liquid Courage, and only uses Antidote for its 5 HP. Fine for the player
  (they stay in the bag), but a sim could value Stealth under a lethal telegraph, or +AP before an expensive skill.
- RULES (small, review): a def's own `preview(ctx)` (the contract's override; the Mystery Potion now has one) yields
  `perUnit` entries without `block` / `blocked`, so `AutoPlay.exactScore` returns `NaN` for them. Harmless today
  (`NaN > 0` is false, so AutoPlay simply never drinks the potion, which is right for a gamble), but defaulting both
  to 0 in `Targeting.preview` would make it explicit.
- RULES / HUD (FYI, review): a `random`-tagged skill's preview is still a dry run with the real RNG state, so the
  badge shows the exact outcome next to the "?" (the next real use rolls the same numbers). That is why the Mystery
  Potion now has its own preview. Same thing elsewhere, if it is not intended: Zarathor's Chaos Bolt preview reads
  "? −7 · Poisoned 2" exactly when the bolt is about to roll poison (checked with a probe).
- AutoPlay ignores `aiScore` (only the enemy planner reads it), and its quick score gives 0 to skills without
  `dmg` / `heal` / `kind: 'buff'`, so it never uses Dodge Roll or Tactical Retreat (or hero move skills). By design for
  a greedy sim; noted so nobody reads "unused in sims" as "useless".

## Known issues

- None open in my files. AutoPlay leaving the utility bottles alone is by design (tested).
- Mystery Potion face 6 depends on `DD.WildMagic` (core data); if no good surge is eligible it heals 12 instead and
  never rolls a bad one (tested with the good pool stubbed empty).
- Full runs on 2026-10-31 (all content landed, passives and boss files still being edited by their authors): 491
  suites, every `kit:`, `content:` and `run:` suite green; the only failures were other areas' in-flight work
  (earlier runs: `enemies_act3` Young Red Dragon / Death Knight, `bosses_act2` lich control resistance — both fixed by
  their authors since; last run: `bosses_act1` rat king patterns / exact damage / sluice puzzle, which fail the same
  way with my files left out, `isolate=bosses,act1`) — none of them uses a generic skill or a consumable.

## Balance (AutoPlay sims, `.tmp/kit/sim.html`, real heroes and encounters)

Party Zarathor / Syllamin / Marbles / Marwyn vs every real encounter of the act. Variants: **base** = the 2 starting
skills; **pool** = +2 more of the hero's own pool skills; **kit** = +2 generic skills each at I (Zarathor Barrel Toss +
Dodge Roll, Syllamin Sand in Your Eye + First Aid, Marbles Sucker Punch + Rude Shove, Marwyn Come At Me, Bro + Throw
Chair); **cons** = pockets of Red Drink + Flask of Bad Decisions + Frost Flask. Cells: win rate · avg rounds · avg party
HP lost.

| | base | pool | kit | cons |
|---|---|---|---|---|
| Act 1 elite, L4 (3 encounters × 4 seeds) | 100% · 4.7 · 6.5 | 100% · 4.6 · 3.6 | 100% · 4.4 · 2.8 | 100% · 4.0 · 8.6 |
| Act 2 normal, L6 (8 × 3) | 100% · 5.3 · 26.0 | 100% · 5.3 · 21.1 | 100% · 5.3 · 18.6 | 100% · 4.9 · 20.4 |
| Act 3 normal, L9 (8 × 2) | 100% · 6.4 · 52.2 | 100% · 5.6 · 51.2 | 100% · 6.0 · 40.6 | 100% · 5.9 · 47.1 |

- Two generic skills help about as much as two more hero skills under AutoPlay (a little more on HP): they are
  simple, always-on-target tools AutoPlay plays well (Throw Chair, Barrel Toss, Taunt onto the barbarian), while
  hero pool skills carry synergies it doesn't exploit. Level I numbers sit inside DESIGN §5 (single target 7 for 2 AP
  at the bottom of 7-10; AoE 5 for 2 AP inside 4-6); level III ≈ +40-50% and/or one extra effect.
- Consumables end fights 0.4-0.7 rounds sooner; AutoPlay throws about one Flask and one Frost Flask per fight. The
  Act 1 elite HP gap (cons 8.6 vs 6.5) shrinks with 36 fights to 6.8 vs 5.2: AP spent throwing instead of Guarding,
  plus 10 HP of Flask friendly fire over 36 throws (AutoPlay accepts an ally in the blast only when foes outweigh it).
- Prices: commons 20-25 (heal 10, cleanse, utility), rares 30-32 (heal 20, AoE 8 fire, chain lightning 16, Yeet).
- Re-run 2026-10-31 with every hero, enemy and boss landed: Act 1 elite L4 (3 × 3) base 100% · 4.4 · 6.4, kit 100% ·
  4.2 · 2.8, cons 100% · 3.7 · 8.7. Act 2 normal L6 with the late heroes Slate / Buga / Josiah / Ellaria (8 × 2;
  kit = Shove + Taunt, Rally + Throw Chair, Power Nap + Throw Chair, Rally + First Aid): base 100% · 6.4 · 9.4, kit
  100% · 6.7 · 4.2, cons 100% · 5.4 · 4.3. AutoPlay fires Throw Chair and Rally nearly every time they are off
  cooldown (both are honest, always-useful picks). Rude Shove's 15 HP of friendly fire there (16 fights, 12 shoves: 7
  foes, 5 allies) is all "bowling": each ally shove crashed the ally (3) into a foe that the crash finished off (logged
  with `.tmp/kit/sim_dbg.html`) — a legit kill for 3 HP, which AutoPlay's lethal bonus rightly takes.

## Review (2026-10-31, adversarial pass by a fresh reviewer)

Everything below was checked by running code: scratch probes (`.tmp/kit-review/probe.html?p=…` + `probe.sh`), the
author's sims (`.tmp/kit/sim.sh`) and screenshots (`.tmp/kit-review/shot.sh`, a copy of the author's scene driver with
`aimretreat`, `aimmystery` and `sel=<hero index>` added). Before any change: 14/14 `kit:` suites green; a probe with
every one of the 10 real heroes as the user (their passives, Rage, Drip Check, corgis... in play) compared 1188
previews with reality for every generic skill level and consumable: 0 mismatches.

**Fixed** (most severe first):
1. **The Mystery Potion's preview gave the roll away.** A preview is a dry run with the real RNG state, so the HUD
   badge showed the face the drink was about to roll ("? +12", "? Sheep", "? Poisoned 3", "? Invulnerable",
   "? Hasted" for a surge): hover, peek, only drink good rolls. It now has its own `preview` (a bare "?" on the
   drinker). Test: the same preview for all six rigged faces, no numbers or statuses, fight untouched.
2. **Tactical Retreat could leap into lava** (or fire, spikes, poison) when that was the only free tile next to the
   ally, although the desc promised "the nearest safe one" (probe: −8 and Burning). Now a hazard tile is never chosen
   (no safe tile = not a valid target, "No safe room next to them."), tiles under enemy telegraphs are skipped when
   another one is free (a retreat into the red tiles is no retreat), and the area highlight shows the landing tile
   (like Fae Blink and the push paths) so players see where they will land. Desc says exactly that. Tests: lava-only,
   near tile telegraphed, every tile telegraphed, a cancelled telegraph, the area tiles.
3. **Push highlights ignored `modifyPush`.** Rude Shove / Scroll of Yeet on Marwyn showed one tile too many, on a
   Barrel Armor wearer two too few. `pushPath` now gets the distance from the hooks (`pushDist`), fired quietly so the
   hooks' pop-ups and log lines belong to the real push only. Tests: a stand-in rule (±), the query pushes no FX, no
   log line and changes no state, the real push still fires the hook; real Marwyn and Barrel Armor in full runs.
4. **Icon clashes on the action bar** (a generic skill sits next to the hero's own): Sucker Punch 👊 = Marbles' and
   Slate's basic attacks, Rude Shove ✋ = Slate's Personal Space and Corelos' Cease & Desist, First Aid 🩹 = Sparrow's
   Scab Armor. Now 🤛, 👐 and 🚑. The registry suite asserts the 12 icons are unique and unused by any hero skill.
   (Consumable icons that match a hero skill, e.g. 🎲 / Chaos Bolt, sit in the separate pockets group; left alone.)
5. **Desc exactness.** Smoke Bomb said "fills every tile within 1" but skips hazard tiles (by design: it must not
   smother fire); Dodge Roll did not mention deep water, and flyers (Syllamin) do roll over pits, deep water and
   cliffs. Both descs now say so; test for the flyer case.
6. **Tests.** New suite `kit: previews match reality with every real hero as the user` (full runs only; ~18k
   assertions, ~0.15 s), the stale "Sparrow's turf" assertion removed (no hero owns a "Pocket Sand" any more; DESIGN
   just uses the name twice), shared `keys` / `fxDuring` helpers.

**Checked and kept** (judgement calls):
- Numbers are inside DESIGN §5 (chair 7 single-target for 2 AP, barrel 5 AoE for 2 AP, punch 4 / 8 for 1 AP,
  cooldowns 1-3, Level III ≈ +40-67 % or a rider; consumables 20-32 gold, rares 30-32).
- Second Wind I (6 HP, once, free) is the weakest pick, but it costs no AP and II / III add a cleanse and +1 AP; not
  a trap. Power Nap (3-5 HP per AP for the whole turn vs Guard's 2 Block per AP) is a real "rest" option.
- Range bonuses and hero Dazzle stretch / shrink Dodge Roll and Tactical Retreat like every hero move skill
  (Marbles' Leap, Fae Blink); Charmed enemies count as allies for Rally and Smoke Bomb (engine hostility). Edge cases.
- AutoPlay never uses Dodge Roll, Tactical Retreat or the utility bottles (see Requests); that is the sim, not the
  skills.

**Sims after the fixes** (win · avg rounds · avg party HP lost; kit = +2 generic skills each at I, cons = Red Drink,
Flask of Bad Decisions, Frost Flask):

| | base | kit | cons |
|---|---|---|---|
| Act 1 normal L3, Zarathor / Syllamin / Marbles / Marwyn (8 × 3) | 100% · 4.0 · 3.0 | 100% · 4.0 · 1.7 | 100% · 3.6 · 3.6 |
| Act 2 elite L6, Slate / Buga / Josiah / Ellaria (4 × 3; cons 4 × 8) | 100% · 7.1 · 10.4 | 100% · 7.1 · 6.2 | 100% · 7.3 · 12.8 |
| Act 3 normal L9, Sparrow / Corelos / Zarathor / Marwyn (8 × 5) | 95% · 6.7 · 68.0 | 100% · 7.3 · 64.5 | (8 × 2) 100% · 6.6 · 58.6 |

The kit makes parties safer (HP lost −5 to −45 %, the only Act 3 losses were without it) without being dominant; in
Act 3 AutoPlay spends AP on Barrel Toss / Taunt / Second Wind, so fights run ~0.6 rounds longer. Consumables in
AutoPlay's hands are roughly neutral (Flask friendly fire 8 HP over 32 elite throws; the rest is noise from
Ellaria's whip).

**Screenshots**: `.tmp/kit-review/aimretreat.png` (landing tile beside Ellaria, her telegraphed tiles skipped, "+3🛡"
and "↷" badges), `aimmystery.png` (a lone "?"), `bar_syllamin.png` (🚑 / 🤛 on the bar), `board_z2.png`, `d4_z1.png`
and `d4_z1_crop.png` (the dice read as little coloured tetrahedra at zoom 1; kept).

**Full run after the review**: PASS — 507 suites, 79918 assertions, 0 failures (`kit:` 15 suites incl. the new one;
the only "Error in" console lines are other suites' deliberate test errors).
