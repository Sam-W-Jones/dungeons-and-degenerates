# PASSIVES-TABLE notes — the Table of Questionable Blessings

Files: `js/data/passives.js` (every random passive, ids `rp_*`), `tests/content/passives.js` (suites `passive-table: …`).
Run them alone with `bash tools/test.sh "suite=passive-table&isolate=data/passives,content/passives"`; the engine side is
`bash tools/test.sh "suite=random passives"`, the run side (DD.Passives, rolls, slots) is `tests/passive_tests.js`.

## Summary

- **79 entries**: 33 common, 18 uncommon, 11 rare, 6 legendary, 11 cursed (default weights 10/6/3/1/4). On the d100
  that is common 63.3% · uncommon 20.7% · rare 6.3% · legendary 1.2% · cursed 8.4% (about one legendary every two runs
  of four heroes; run-start rolls never give a cursed one).
- Levels: the 62 commons, uncommons and rares have 3 levels (II ≈ +50%, III ≈ +100% or a new rider); the 17 legendaries
  and cursed have 2. Every desc is exact for its level; the validator also requires a different desc per level, a
  ≤ 30-char name (two lines on a Blessing card), a unique emoji icon, a ≤ 120-char flavor and `Cursed: …` names for
  (and only for) cursed ones.
- "Very random": 15 entries roll procs on `DD.Combat.state.rng` (5-60%, plus Wild Magic Overload's 50/100%), a d20 at
  fight start (Loaded Dice), a random Blessing every fight (Method Actor), random flyer upgrades (Frequent Flyer Miles),
  4 Wild Magic entries (`DD.WildMagic.surge`: good-only / any / bad-only), 3 duck entries (`wm_duck` summons,
  `wm_duck_foe` spawns), 2 random teleports, a teleporting pet rock, 2 surface makers, 5 gold makers
  (`DD.Act.gainGold`), a random consumable (`DD.Act.giveRandomConsumable`, runs only), Hype tricks (incl. a fight-long
  rule), odd/even rounds, walls, high ground, exactly 1 HP, standing in a surface, walking 4+ tiles, a downed ally, and
  5 run-layer `runMods` entries (gold, price, xp, heal).
- 6 hero-specific entries (`requires(runHero, heroDef)`, defensive: any missing field means "no"): fire users
  (Pyromaniac: 2+ fire skills → Zarathor), healers (Bedside Manner: a heal skill that reaches others, or 2+ `heal`-tagged
  skills → Ellaria, Josiah, Marbles, Sparrow), summoners (Proud Pet Parent → Corelos, Ellaria, Josiah, Sparrow,
  Zarathor), flyers (Frequent Flyer Miles → Syllamin), HP-payers (Blood Bank Loyalty Card: 2+ HP-cost or `blood`
  skills, or Sparrow by id → Sparrow), gold users (Compound Interest: a `gold`-tagged skill, or Zarathor/Buga by id).
  Their descs end with "… only." so players see why.

### Conventions (how every hook is written)

- Instance last: `hook(…args, p)` with `p = { id, level, L, def, data }`. Per-fight state only in `p.data`, and only
  plain data (unit **ids**, never unit references: previews and deployment re-planning deep-copy it).
- Randomness only through `DD.Combat.state.rng` (`roll(pct)` = one `next()`; a 100% roll consumes nothing). Never in
  query hooks (`modifyCost`, `modifyRange`), which the HUD calls on every hover; those only read `p.data`.
- Every effect through DD.Act (damage, heal, statuses, Block, AP, gold, summons, spawns, teleports, surfaces, objects,
  rules); FX are cosmetic (`DD.FX.text`/`particles`/`explosion`) plus one log line for the big moments.
- Desc vocabulary: a **hit** is a damage instance of 1+ after armor (Block counts: `d.amount > 0`); a **skill hit** has
  `cause: 'skill'`; **enemy skill hits** come from a hostile source. Durations use the engine's "for N turns" wording.
- Re-entry: damage-on-damage entries use `reflect: true` (no thorns, no outgoing modifiers) and a stored id; the Echo
  Chamber guards itself with `p.data.echoing` and marks its ctx `rpEcho` (Conduit, Blood Bank, Blood Pact and the
  Cooldown entry ignore echoes); healing bonuses use `heal(null, …)` so they never stack with heal hooks. No hook can
  trigger itself.

## The table

| Rarity | Entries (id → name: effect at I / II / III) |
|---|---|
| common | `rp_lucky_socks` Lucky Socks: skill hits 10/15/20% for +50% · `rp_thick_skull` Thick Skull: +1 armor / +1 armor +4 HP / +2 armor +4 HP · `rp_big_boned` Big-Boned: +5/8/12 max HP · `rp_muscle_tank_top` Muscle Tank Top: +5/8/12% damage · `rp_participation_trophy` Participation Trophy: won a fight without a kill → 5/8/12 gold · `rp_coin_magnet` Coin Magnet: your kills → 2/3/5 gold · `rp_pet_rock` Pet Rock: Rocky (10 HP, blocks nothing) starts beside you and is somehow beside you again at each of your turn starts → 2/3/5 Block · `rp_snack_pouch` Emergency Snack Pouch: first drop below 50% → heal 4/6/9 · `rp_spicy_blood` Spicy Blood: adjacent attackers Burn 1/2/3 · `rp_allergic_to_goblins` Allergic to Goblins: +2/3/4 vs goblins, goblinoids & kobolds (III: they deal 1 less) · `rp_main_character` Main Character Syndrome: your kills +4/6/8 Hype, allies' kills drain 3/2/1 (a rule) · `rp_overcaffeinated` Overcaffeinated: +1 AP round 1 / rounds 1-2, −1 AP round 3 (III: no crash) · `rp_superstitious` Afraid of Even Numbers: odd rounds +1/2/3 dmg, even rounds 2/3/4 Block · `rp_wall_hugger` Wall Hugger: next to a wall/solid object, enemy hits −1/2/3 · `rp_high_ground` I Have the High Ground: +2/3/4 vs lower foes · `rp_clutch_gene` Clutch Gene: ≤30% HP +20/30/30% (III: ×2 at exactly 1 HP) · `rp_ghost_accountant` Haunted by a Ghost Accountant: won fight → 5/8/12 gold; 15/10/5% Confused per turn · `rp_sleepwalker` Sleepwalker: 25% at turn end: 3/5/5 Block + random tile within 2 (III: never into a telegraph) · `rp_rules_lawyer` Rules Lawyer: first 1/2/3 enemy/hazard debuffs per fight cancelled · `rp_trust_fund` Trust Fund: +10/15/20% gold (runMods) · `rp_haggler` Professional Haggler: shop −5/8/12% (runMods) · `rp_teachers_pet` Teacher's Pet: +10/15/25% XP (runMods) · `rp_second_breakfast` Second Breakfast: +20/35/50% out-of-combat healing (runMods) · `rp_quantum_pockets` Quantum Pockets: 20/30/40% random consumable per fight (runs) · `rp_dad_jokes` Dad Jokes: basic attack 25/35/50% Weaken · `rp_fireproof_onesie` Fireproof Onesie: immune Burn / +Poison / +Bleed · `rp_garlic_breath` Garlic Breath: 1/2/3 armor-piercing damage to adjacent foes per turn · `rp_leaky_waterskin` Leaky Waterskin: tiles you walk out of → puddle 2/3 rounds, III ice · `rp_frequent_flyer` Frequent Flyer Miles (flyers): every 8/6/5 tiles moved → next turn a random +1 AP / 4 Block / Inspired (one per turn, miles carry over) · `rp_compound_interest` Compound Interest (gold users): 5/8/10% of gold per fight (max 5/8/12) · `rp_cardio_king` Cardio King: walked 4+ tiles this turn → 2/3/4 Block and +2/3/4 on the next hit · `rp_swamp_thing` Swamp Thing: standing on a surface → +2/3/4 · `rp_revenge_arc` Revenge Arc: ally hero downed → +20/30/40%; allied summon dies → 3/4/5 Block |
| uncommon | `rp_adrenaline_junkie` Adrenaline Junkie: an enemy hit of 6/5/4+ → +1 AP next turn · `rp_vampire_wannabe` Vampire Wannabe: heal 20/30/40% of skill damage · `rp_petty_revenge` Petty Revenge: attackers Marked 2/3/4 · `rp_bee_whisperer` Bee Whisperer: your kills poison foes within 2 (2/3/4) · `rp_wild_magic_allergy` Wild Magic Allergy: 15/20/20% surge per turn (III good only) · `rp_resting_villain_face` Resting Villain Face: adjacent / within 2 foes Weak (III +Vulnerable) · `rp_inspiring_monologue` Inspiring Monologue: you + allies within 2/3/3 Inspired 2/2/3 turns at fight start · `rp_parkour` Parkour Enthusiast: +1 move / +hop / +2 move +hop · `rp_loaded_dice` Loaded Dice: d20 (+0/+2/+4) at fight start: Vulnerable / 4 Block / Inspired / Inspired 2 + 15 Hype · `rp_method_actor` Method Actor: a random common / common-or-uncommon / uncommon-or-rare Blessing at level II for each fight (in-fight effects only, never one you have) · `rp_greased_up` Greased Up: immune Root / +Slow / +Stun · `rp_displacer_ancestry` Displacer Beast Ancestry: 20/30/40% blink 2-3 tiles after an enemy hit, avoiding telegraphed tiles when it can · `rp_cat_reflexes` Cat Reflexes: 10/15/20% dodge · `rp_pyromaniac` Pyromaniac (fire users): +2/3/3 fire damage (III Burn 1) · `rp_explosive_personality` Explosive Personality: downed → 8/12/16 fire to adjacent foes · `rp_bedside_manner` Bedside Manner (healers): +20/30/30% healing (III cleanse 1) · `rp_proud_pet_parent` Proud Pet Parent (summoners): summons +4/6/8 HP, +10/20/30% damage · `rp_blood_bank_card` Blood Bank Loyalty Card (HP payers): HP costs −1/−1/−2 (II+: 3 Block when paying) |
| rare | `rp_emotional_support_duck` Emotional Support Duck: a Confused Duck (8 HP) / one with 12 HP / 2 ducks (8 HP) join each fight · `rp_plot_armor` Plot Armor: once per fight a downing hit leaves 1 HP (+6 Block, III + Invulnerable 1 turn) · `rp_ambidextrous` Ambidextrous: first basic attack each turn free (+1/+2 basic damage) · `rp_bifocals` Bifocals: +1 range (+5/10% damage) · `rp_uno_reverse` Uno Reverse Card: 15/20/25% reflect an enemy hit · `rp_extra_attack` Extra Attack (Allegedly): kills in your turn +1 AP, 1/2/3 times · `rp_circle_of_life` Circle of Life (Duck Edition): 30/45/60% your kills come back as ducks · `rp_wild_conduit` Wild Magic Conduit: every 4th/3rd/3rd skill surges (III good only) · `rp_gold_plated_ego` Gold-Plated Ego: 1 Block per 20/20/15 gold (max 5/7/10) per turn · `rp_deja_vu` Déjà Vu Enthusiast: cooldowns reset every 4th/3rd/3rd round (III +1 AP) · `rp_gravitational_ego` Gravitational Ego: pull foes 2-3/2-4/2-4 tiles away 1 closer each turn (III Vulnerable) |
| legendary | `rp_chosen_one` Chosen One (Self-Declared): +1 AP (II +10% damage) · `rp_cooldowns_social_construct` Cooldowns Are a Myth: no cooldowns; the first cooldown skill each turn costs as usual (II: 1 AP less, min 1), later ones that turn +1 AP · `rp_echo_chamber` Echo Chamber: 25/40% a skill resolves again for free · `rp_phoenix_feather` Phoenix Feather (Probably): first down per fight → rise at 50/75% HP, 6/10 fire around · `rp_ultra_instinct` Ultra Instinct (Unlicensed): first enemy hit each round deals 0 (II: counter 4) · `rp_wild_magic_overload` Wild Magic Overload: 50/100% good surge per turn |
| cursed | `rp_cursed_glass_cannon` Glass Cannon: +40/50% dmg / take +30% · `rp_cursed_kleptomaniac` Kleptomaniac: +2/3 gold per skill hit / shop +40% · `rp_cursed_loud_eater` Loud Eater: +2/3 armor, heal 3/4 per turn / enemies within 3 Taunted by you every round · `rp_cursed_monkey_paw` Monkey's Paw: +1 AP / 25/20% bad surge per turn · `rp_cursed_couch_potato` Couch Potato: +1 AP, +20/30% dmg / Confused every turn (moving costs 2 AP) · `rp_cursed_narcoleptic` Narcoleptic: +40/50% dmg / 15/10% fall Asleep each turn end · `rp_cursed_blood_pact` Unread Blood Pact: 2+ AP skills cost 1 less / pay 3/2 HP at the end of each turn you used one (never below 1) · `rp_cursed_predatory_loan` Predatory Loan: +30/40 Hype per fight / 10 gold per fight or Vulnerable+Weak 2 turns · `rp_cursed_spontaneous_combustion` Always on Fire: +20/35% dmg, immune to fire & Burn / the 4 tiles around you burn at your turn end, allies or not · `rp_cursed_gamblers_ruin` Gambler's Ruin: skill hits 50/60% double, else half · `rp_cursed_duck_mafia` Duck Mafia Debt: +1 AP / 2-4 (II 1-3) Hostile Ducks join every fight by act |

## Balance

**Method** (scratch, not shipped: `.tmp/passives-table/bal2_sim.js`, variants in `bal3_*.js`). 80 paired AutoPlay fights
on the real act 1-3 normal and elite encounters with random real 4-hero parties (level 4/7/10 by act, 4 skills),
enemies ×2.5 HP and ×3 damage so that the fights carry signal (baseline: 93% won, 9.5 rounds, 25.6% party HP lost,
1.0 downs per fight). Each Blessing at its **max level on every eligible hero** vs the very same fights without it.
Score = 100·Δwin + Δ(party HP lost, points) + 20·Δrounds/rounds + 10·Δdowns (higher = better for the party), ± one
standard error (about 5-7: gaps under ~10 are noise). Hero-only entries ran with 1-2 holders (score per holder is
higher than it looks). Run-layer entries (gold, prices, XP, healing) score 0 here by construction. About 6,400 fights,
no swallowed errors.

| Rarity | Mean score | Strongest | Weakest |
|---|---|---|---|
| common (26 with a combat effect) | +5 | Afraid of Even Numbers +13, Pet Rock +13, Garlic Breath +11, Big-Boned +10 | Overcaffeinated −8, Leaky Waterskin −4, Lucky Socks 0 |
| uncommon (17) | +5.5 | Blood Bank Card +15 (Sparrow alone), Cat Reflexes +12, Wild Magic Allergy +11, Pyromaniac +10 (Zarathor alone) | Explosive Personality −2, Petty Revenge +0.5, Greased Up +1, Displacer +1 |
| rare (11) | +13 | Emotional Support Duck +27, Wild Magic Conduit +23, Ambidextrous +17, Uno Reverse +15 | Plot Armor +4, Gold-Plated Ego +4, Extra Attack +4.5 |
| legendary (6) | +22 | Ultra Instinct +37, Wild Magic Overload +32, Chosen One +21 | Cooldowns Are a Myth +9, Phoenix Feather +13 |
| cursed (10 with a combat effect) | +14 | Always on Fire +26, Loud Eater +20, Predatory Loan +18, Gambler's Ruin +17 | Blood Pact +6, Glass Cannon +6.5, Narcoleptic +7 (Kleptomaniac: gold only) |

The ladder holds: common ≈ uncommon < rare ≈ cursed < legendary, every legendary and every cursed entry is a net gain,
and nothing outside the legendaries is a runaway. Uncommons sit at the common level in AutoPlay because most of them
are reactive (procs on being hit, kills, downs, immunities) and AutoPlay does not play around them; a human gets more
out of Greased Up against a stunning boss or Explosive Personality as a melee deterrent.

**Changes from this pass** (each measured before/after with the same fights):
- **Cooldowns Are a Myth** I (+1 AP on every cooldown skill) measured **−26**: a legendary that made you worse. Now I is
  the old II (the first cooldown skill each turn costs as usual, later ones +1 AP) → +13; II makes that first one 1 AP
  cheaper (min 1) → +8-9 (AutoPlay spends the spare AP poorly; mechanically it is strictly better).
- **Cursed: Unread Blood Pact** paid 3/2 HP every turn: **−10 to −12**. Now it pays only at the end of turns in which you
  used a discounted skill → +4 to +6 (the "monthly installments" joke still lands).
- **Cursed: Couch Potato** was Rooted on odd rounds: **−5** (rooted heroes can't leave a telegraph; every-other-round and
  every-third-round roots and +40% damage all stayed negative). Now Confused every turn (moving costs 2 AP — getting
  up is hard), which eats the bonus AP whenever you move → +14.
- **Pet Rock**: a static Rocky that blocks movement measured −1 to −10 (he walls in his own hero and blocks the
  sidestep out of a telegraph); a Rocky who follows you but still blocks −10. Now he blocks nothing and is "somehow
  beside you again" at each of your turn starts (if there is room) → +13.
- **Emotional Support Duck** moved uncommon → rare: a `wm_duck` honks twice a turn (3 damage + Confused), so one duck
  is worth +14 and two +27, a rare's power. II is now 12 HP (was 16) and III two 8-HP ducks (was 16 each); duck HP
  barely matters (measured), duck count does.
- **Inspiring Monologue**: Inspired 2/2/3 turns (was 1/1/2; a 1-turn opener mostly expired while the party walked up),
  now +8. **Displacer Beast Ancestry** avoids tiles enemies are aiming at when it can (was −1.4 in the easy sim, now
  +1.4; still a coin flip, by design). **Allergic to Goblins** also counts `goblinoid`s (the act-1 bugbear).

**Left alone on purpose**: Overcaffeinated (−8) and Lucky Socks (0) are pure upside — the extra round-1 AP makes
AutoPlay charge into the first telegraphs, a human won't. Leaky Waterskin (−4) is two-edged chaos (puddles make you Wet
for lightning; III ice makes pushes slide either way). Ghost Accountant / Sleepwalker trade combat chaos for gold or
Block by design. Always on Fire is the strongest cursed in AutoPlay because AutoPlay rarely hugs allies; for a human the
"allies or not" fire is the real price.

## Tests (`tests/content/passives.js`, 17 suites, ~6,600 assertions, ~6 s)

- **Validator**: every rp_ entry — fields, rarity enum, weight > 0, 1-3 levels, maxLevel, desc at every level (no
  `undefined`/`NaN`, ≤ 260 chars, different per level), flavor, unique icon and name, known hook names only, stats keys
  (`hp ap mov armor dmg heal range block hype`, finite) and runMods keys (`gold xp price heal`, |v| ≤ 1) per level,
  every entry has a behaviour spec. Mix suite: counts per rarity, d100 shares, 4000 seeded `DD.Passives.roll`s follow
  the weights, run-start (noCursed) rolls never give a cursed one.
- **requires()**: every hero def (fixtures + real) and 7 malformed inputs → a boolean, never a throw; the real heroes
  the entries were written for get them when registered (Zarathor, Syllamin, Ellaria, Josiah, Sparrow, Buga).
- **One behaviour spec per entry, every level** (5 suites, by rarity): sandbox fights on `test_knight` & co. against
  fixture foes. Procs are forced both ways by stubbing `state.rng.next` (0 → fires, 0.999 → doesn't) and their odds are
  measured over 600-1500 real-RNG trials (4.5 σ tolerance); fight-start rolls (Loaded Dice) are checked against an
  oracle `DD.RNG(seed)`. Stats are checked on `heroStats` and on the combat unit; runMods through `DD.Passives`.
- **Stats**: every entry at every level adds exactly its stats to `DD.Combat.heroStats`.
- **Previews**: 40 random 4-passive loadouts × 3 basic attacks: the HUD preview never changes the real fight and
  predicts the damage exactly (120/120, including echoes, lucky socks, gambling).
- **Echo Chamber** resolves every hero and generic skill a second time (forced echo): no errors, sane state, previews
  stay pure and exact.
- **AutoPlay** (3 suites): random 4-passive loadouts (dealt from a shuffled deck so every entry plays) at levels
  1/4/7/10 — fixture heroes on fixture encounters with toughened foes (32 fights), real heroes on the same (16), and
  real heroes on the **real** act 1-3 encounters incl. every boss (16; `&n=20` → 80, all clean); half start with a
  deploy swap (re-planning with passives). Checked: the fight resolves or runs out the clock (no stall), < 2500
  hits/statuses/heals per fight (no runaway hook loop), a sane state, no swallowed errors and no table warnings.
- **Determinism** (review): 24 fixture fights with random 4-Blessing loadouts (every entry in play) replay identically
  from the same seed, and no hook rolls `Math.random` or the cosmetic `DD.rng` itself (a stack-checked spy; the
  engine's own cosmetic barks are fine). Mutation-tested: one `Math.random()` in `roll()` fails it.
- **Live run** (review): the run-side Blessings in a real `DD.Run` — Predatory Loan's fee and Compound Interest move
  `run.gold` through `DD.Run`, Quantum Pockets fills the run's bag (never past its size), Coin Magnet / Ghost Accountant /
  Participation Trophy pay through `run:gold`, and the run reads Trust Fund / Kleptomaniac runMods live.
- **Real kits** (review): every real hero a hero-only entry is offered to gets it tested on its own kit — Pyromaniac's
  +dmg on Zarathor's fire skill, Bedside Manner on each healer's heal skill, Proud Pet Parent on every summon each
  summoner brings (+HP, +damage), Blood Bank's HP costs on Sparrow's skills, Frequent Flyer's miles on Syllamin,
  Compound Interest for Zarathor and Buga (14 pairs today; skips in isolation).

## Deviations

- **Proud Pet Parent** raises a summon's `maxHp`/`hp`/`dmgBonus` directly (+ `DD.Act.touch()`): DD.Act has no
  "max HP" effect. **Unread Blood Pact** pays HP at turn end the way skill HP costs are paid in `combat.js` (direct HP
  loss + `FX.damage({ cost: true })`, never below 1, no damage hooks), so it can never down you.
- **Pet Rock** places a `rock` object instance with overrides `{ label: 'Rocky', hp: 10, maxHp: 10, blocksLos: false,
  blocksMove: false, rockyOf: <owner unit id> }` and moves it with `removeObject` + `placeObject` (keeping its HP).
  Units may step onto his tile (other authors' summons can even be placed there); at his owner's next turn start he
  slides out from under them. `rockyOf` keeps two holders in one party from adopting each other's Rocky.
  The table's own spawns and teleports (`safeTiles`) never pick a tile with any object on it.
- **Method Actor** pushes a fight-only fifth instance (`DD.passiveInstance`, marked `role: true`) onto the hero
  *unit's* `passives` at combat start; the RunHero keeps its 4 slots. `Hooks.each` re-reads `unit.passives.length`, so
  the role's own `onCombatStart` runs in the same chain; the deploy snapshot and previews copy it like any instance.
  Roles never have `stats` (those only count when the unit is built), `runMods` or `requires`.
- **Main Character Syndrome** adds a fight-long `state.rules` entry (`rp_main_character:<unitId>`) because "allies'
  kills" is a cross-unit trigger; it shows in the HUD's rule list like any house rule.
- **Couch Potato** uses the core `confused` status for "moving costs 2 AP" (the only move-cost modifier the engine
  has), so the HUD shows him as Confused; a cleanse frees him until his next turn.

## Requests

- **RULES**: a cross-unit `onAllyDowned(unit, downed)` hook (heroes are downed, not killed, so `onAllyDeath` never sees
  them; Revenge Arc polls `state.units` instead), a `modifyHeal(h)` hook for incoming healing (bonus-heal passives
  currently have to add a second heal), and a `modifyMoveCost` hook (Couch Potato borrows Confused for it).
- **RENDER-WORLD**: honour an object instance `height` override (a small pet rock would read better than a boulder).
- **META-UI**: the party screen's skill cards show the def's AP cost; with AP-cost Blessings (Blood Pact, Cooldowns
  Are a Myth, Ambidextrous) the in-combat HUD is right but the party screen is not (costs need a combat unit).
- **HUD** (review): Method Actor's role shows as a normal Blessing chip in the inspect panel and the party-card tooltip
  (correct text, see `.tmp/passives-table-review/scene/ma1.png`); badging instances with `role: true` as "this fight
  only" would explain why the hero suddenly has five. The combat log already says it ("tonight, Zarathor plays someone
  with Gravitational Ego II").
- **META-UI** (review): the `&passives=` debug param only reaches debug runs, not `screen=combat&encounter=…` pages
  (the table author hit it too); the review screenshots use the scratch page `.tmp/passives-table-review/scene/`.

## Known issues

- Stacking the same cursed entry on all four heroes changes its character: four Always on Fire heroes are immune to each
  other's fire (the downside vanishes).
- The headless policy (DD.Passives, not this table) takes a cursed roll into a free slot; that is now a net gain for
  every cursed entry in the sims above.
- AutoPlay underrates reactive and positional Blessings (see Balance); human play will rate the uncommons higher.

## Review (adversarial review of the table, after the author's balance pass)

**Verdict**: solid work that holds up under attack. Every entry registers cleanly, every desc matched its hooks at every
level, every proc rolls the combat RNG, and nothing loops or runs away. I fixed one bug, reworked the one redundant
entry, added one new uncommon (the most random thing on the table) and three test suites. The table now has 79 entries
(33 / 18 / 11 / 6 / 11).

**What I ran** (scratch probes in `.tmp/passives-table-review/`, not shipped):
- Every entry at max level on 4 random real heroes in a real act 1-3 fight (78 fights): all won, no warnings, at most
  ~300 damage events in a fight.
- Ten "chaos stacks" × 3 fights: the same 4 wild Blessings at level 10 on all four heroes (Echo + Overload + Conduit +
  Uno Reverse; Duck Mafia + Circle of Life + Duck + Pet Parent; Always on Fire + Waterskin + Pyromaniac + Spicy Blood;
  Sleepwalker + Displacer + Gravitational Ego + Pet Rock; …) on real encounters incl. 4 bosses: no errors, no stalls,
  at most 362 hits in a 12-round boss fight.
- Determinism: 39 paired real fights with 4-Blessing loadouts replay identically from the same seed. The only `DD.rng`
  calls under `passives.js` frames are the engine's cosmetic barks and narration.
- Previews: 300 previews of every slotted real skill with random loadouts: none changed the fight, all exact.
- A live `DD.Run` with the run-side Blessings over 6 fights. Gold, fees, interest and finds all go through the run.
- Kleptomaniac I over 60 real fights: +16 gold a fight on average (Marwyn 4, Corelos 37) against +40% shop prices.
  That is break-even overall, a win for AoE heroes and a loss for single-target ones: a real choice. Kept.
- Allergic to Goblins: goblins, goblinoids or kobolds appear in 7/13 act-1 and 6/12 act-3 encounters, none in act 2.
  Niche but not dead, and it is a DESIGN example. Kept.
- requires() on the real heroes: Marwyn and Slate qualify for no hero-only entry. Fine: none fits them.

**Bug fixed — Pet Rock with two holders in one party.** When one Rocky was smashed and the other holder's Rocky later
stood on its old tile, the first holder "adopted" it at his next turn start. Both heroes got the Block, and the real owner
lost his Rocky for good. Rocky now carries `rockyOf: <owner unit id>`. Regression test in the Pet Rock spec.

**Reworked — Frequent Flyer Miles (common, flyers only).** It was a second Professional Haggler (shop −10/15/15%) for a
single hero. It is now flyer-themed and random: every 8 / 6 / 5 tiles moved earn a random free upgrade at the start of
the next turn (+1 AP, 4 Block or Inspired for 1 turn; one per turn, spare miles carry over). Paired sim on Syllamin:
+6 ± 10, common level. runMods entries: 6 → 5.

**Added — Method Actor (uncommon, 🎭).** Every fight it improvises a random Blessing for that fight only, at level II:
common (I), common or uncommon (II), uncommon or rare (III). Roles have in-fight effects only: never a stat boost, a
hero-only entry or one the hero already has. It reuses the other entries' tested hooks, so it adds the most variety for
the least new risk. Paired sim at III: +13 ± 7 (top of the uncommons). Uncommons 17 → 18, the DESIGN target.

**Tests added** (all passing, alone and in the full run):
- Specs: the new Frequent Flyer (miles, one upgrade per turn, carry-over, each upgrade forced, ⅓ shares over 900
  rolls), Method Actor (the role matches a `DD.RNG(seed)` oracle on 90 seeds per level, coverage, fight-only, never an
  owned one, the role's own hooks play) and the two-Rocky regression.
- Determinism and dice hygiene (see Tests). Mutation-tested: one stray `Math.random()` in `roll()` fails it.
- A live `DD.Run` suite and a real-kit suite (see Tests).
- The validator also fails on any registry warning about the table.

**Judged as a player** (left as is, with reasons):
- *Very random*: yes. About 20 entries roll dice in a fight, plus surges, ducks, teleports, a d20 and now a random role
  every fight. The deterministic ones mostly have weird conditions (odd rounds, walls, high ground, exactly 1 HP,
  surfaces, 4+ tiles walked, a downed ally).
- *Funny*: names and flavor are strong throughout. A few descs carry tiny jokes ("Objection!", "(the crash)"). They are
  harmless and left in.
- *Varied*: about 23 entries are "+N under a condition", but the conditions all differ. The only true duplicate is gone.
  Three cursed entries share the +1 AP upside (Monkey's Paw, Couch Potato, Duck Mafia), but their downsides differ sharply.
- *Rarity balance*: the author's ladder holds (common ≈ uncommon < rare ≈ cursed < legendary).
  - No must-pick below legendary.
  - Gold-Plated Ego III (10 Block at 150+ gold) matches the legendary Gilded Breastplate item. That fits a rare taken to III.
- *Legendary moments*: about 1.2% a roll by DESIGN weights, so a legendary shows up in roughly 40% of runs (about
  40 rolls a run). The in-fight moments keep the table exciting in between: Phoenix, Echo, Plot Armor, a natural 20,
  Uno Reverse, surges, ducks and Method Actor's casting.
- *Cursed downsides*: real for everyone except Loud Eater on a tank (Marwyn, Slate), who wants the taunt. That is fine
  for a hero-dependent cursed entry.
- *Previews show proc outcomes*: the HUD dry-run replays the same dice, so hovering shows whether Lucky Socks or
  Gambler's Ruin will fire. That is engine design (exact previews), not this table's to change.

## Integration (the table in whole runs, with the run layer and UI)

The table and the run layer / UI (`docs/notes/passives-system.md`) were built and reviewed apart; this pass played
them together. Scratch tools (not shipped) are in `.tmp/passives-integrate/`; the run-side numbers, the screenshot
tour and the UI fixes are in the system notes → Integration.

**How the table is met in runs** (two batches of 200 headless whole runs, random real parties, AutoPlay fights,
15,855 rolls, every roll resolved by the §9.6 policy):
- Every entry was rolled (none missing); each batch matches its own per-roll expectation (one entry beyond |z| 3.5 in
  158 checks: Trust Fund 216 vs 169 in batch 2, its slice sits in that batch's busiest dice decile; batch 1 had it at
  171 vs 161). Rarest: the hero-only ones (Blood Bank Card 16 rolls in 400 runs, Pyromaniac 27, Frequent Flyer 26) and
  the legendaries (about 17 each per 200 runs).
- **Most Blessings are met at level I**: 90.8% of the Blessings held at run end are level I, 8.6% II and 0.5% III (an
  owned entry comes up on about 1 roll in 15). The balance pass above measured every entry at its max level.
- Held longest: uncommons and the run-layer commons (Bee Whisperer, Rules Lawyer, Inspiring Monologue, Trust Fund,
  Garlic Breath, Vampire Wannabe: 800-940 hero-fights each per batch). Held least: cursed entries (40-60 hero-fights
  each; the policy replaces them first) and the hero-only ones. Replaced or discarded most: commons. Method Actor's
  roles spread over the whole eligible pool (25-30 different roles per batch; none above 46 of 765 role-fights).
- In 5,799 fights no hook threw, looped or stalled: no warning mentions a Blessing, the most damage events in a fight
  was 654 (mean 157), no AutoPlay timeout.

**Level I, measured** (`bash .tmp/passives-integrate/pair.sh "suite=pair&n=80&lv=1&k=6"`, 80 paired real fights per
entry, party L3/6/9 by act, enemies HP ×2.5 / damage ×3, the bal3 score). One correction to the method: any entry that
changes a fight makes its dice diverge, so a comparison with ONE fixed baseline realization adds that baseline's luck
to every such score (regression to the mean; here +6.2 ± 4.9). The baseline per fight is now the mean of 6 placebo
realizations (a no-op passive that only draws 1-6 numbers from the combat RNG). The scores in the Balance section
above came from the fixed-baseline method, so they carry such an offset too (its size depends on that sample).
- Mean score by rarity at level I (combat entries): legendary +19, rare +10, cursed +8, uncommon 0, common −1.
- Top: Ultra Instinct +38 ± 7, Always on Fire +26, Chosen One +25, Emotional Support Duck +21, Ambidextrous +19.
- **No entry is significantly below zero** (none with score + 2 SE < 0). Lowest: Narcoleptic −10 ± 8, Blood Pact −10 ± 8,
  Glass Cannon −7 ± 7 (cursed at level I: a real gamble now; at II they were positive above), Fireproof Onesie −8 ± 6
  (pure upside, noise). Pure run-layer entries are exactly 0 when compared with the fixed baseline (no divergence).
- Uncommons sit at the common level at I too (AutoPlay plays reactive entries poorly, as noted above).

**Whole-run outcome associations** (each holder vs the same hero in the same act and fight kind without it): the
method is overdispersed, because a run's fights share party, items and picks. Trust Fund, which has no combat effect,
reached z 3.2 on downs in one batch. Only effects that show in both batches with the expected sign count:
- Ultra Instinct, Vampire Wannabe and Thick Skull lower their holder's HP loss in both batches (combined z −3.2 to
  −4.6). Gold-Plated Ego also reaches −3.0 combined, but almost all of it comes from batch 2.
- Batch 1 flagged Sleepwalker (more downs), Bedside Manner and Clutch Gene. Batch 2 did not repeat it, and the paired
  level-I check has them at +3 ± 7, −3 ± 5 and −1 ± 7. **Not broken; not changed.** Quantum Pockets holders lost a little
  more HP in both batches (combined z 3.2), but the paired check gives +5 ± 5, so it stays a watch item.

**Changed in this pass**
- Gravitational Ego's icon 🕳️ → 🪐: the hole emoji was a black smudge on the dark icon disc of slot cards (still unique).
- Done for the requests above: the HUD marks Method Actor's role instances "🎭 this fight only" (tooltip row and a dashed
  inspect chip), and `&passives=` now reaches `screen=combat&encounter=…` pages.

**Still open**: RULES (`onAllyDowned`, `modifyHeal`, `modifyMoveCost`), RENDER-WORLD (a smaller Rocky), META-UI (AP costs
on the party screen). Upgrades are rare by construction (a design question for the lead, see the system notes).

## Phase 4 (engine requests role)

The RULES requests above exist (docs/notes/rules.md "Phase 4"): `onAllyDowned(unit, downed, d)`, `modifyHeal(h)`
(incoming, `h = { unit, src, base, amount, cause, cancel }`), `modifyMoveCost(m)` (`m = { unit, ap }`), plus
`onAnyDeath`, `preventDeath`, `onCostPaid`, `modifyFinalDamage`. `passives.js` is unchanged (Revenge Arc, Bedside
Manner and Couch Potato work as written; switching them is the table owner's call). `rp_phoenix_feather` could now use
`preventDeath` instead of reviving after `onDowned`.
Fair previews: a hit that rolls dice (Echo Chamber, Gambler's Ruin, Lucky Socks...) previews `uncertain` (the
expected outcome of 8 other rolls) instead of the real roll. `tests/content/passives.js`: Echo Chamber's legendary
check now asserts the preview never gives the echo away (40/40 uncertain, expected 5–10); the random-loadout preview
suite checks certain previews exactly and uncertain ones for their "?" flags.
