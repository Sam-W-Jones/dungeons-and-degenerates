# PASSIVES-TABLE notes — the Table of Questionable Blessings

Files: `js/data/passives.js` (every random passive, ids `rp_*`), `tests/content/passives.js` (suites `passive-table: …`).
Run them alone with `bash tools/test.sh "suite=passive-table&isolate=data/passives,content/passives"`; with every
content file loaded (real heroes and encounters join the hero-only and AutoPlay suites): `bash tools/test.sh
"suite=passive-table"`. The run side (DD.Passives, rolls, slots, the level-up rotation weight) is `tests/passive_tests.js`.

## v2 conversion (BLESSINGS role) — what changed

The table now follows the v2 rules (DESIGN §1, §4.1-4.4, §7.1; `docs/notes/v2-migration.md` §8.7): one initiative
turn per unit, per-own-turn durations, no Guard, nobody starts a fight with Block, no enemy telegraphs (only boss
wind-ups), attacks of opportunity, no XP (one hero levels up per won fight). It stays very random and keeps the
DESIGN §7.1 counts: **33 common / 18 uncommon / 11 rare / 6 legendary / 11 cursed**, default weights 10/6/3/1/4 (the
run layer's owned-upgrade weighting `DD.Balance.passives.ownedWeight` is untouched).

| entry | v1 | v2 |
|---|---|---|
| **Loaded Dice** 🎲 (uncommon) | d20 at fight start: 1 Vulnerable / 2-9 **4 Block** (wiped at initiative: the desc was false) / 10-19 Inspired / 20 Inspired 2 + 15 Hype | **the initiative die is loaded**: roll 2 d20s (III: 3) and keep the best (II/III: +2 initiative); a natural 20 → Inspired for 2 turns + 15 Hype. `modifyInitiative` (rolled fights only; fixed-order sandboxes roll nothing) |
| **Overcaffeinated** ☕ | +1 AP round 1 (II/III rounds 1-2), −1 AP round 3 (III no crash) | the same plus **+2/+3/+4 initiative** (`stats.init`): first in line, first to crash |
| **Greased Up** 🧈 | immune Root / +Slow / +Stun | **can't be opportunity-attacked** + the same immunities (`modifyOpportunity` cancel, pure; the holder still makes his own) |
| **Cheap Shot Artist** 🥊 (common, new) | — (replaces Muscle Tank Top, +5/8/12% damage = the level-up perk) | your skill hits on foes **whose turn is still to come this round** deal +2/+3/+4 (a summon's turn is its owner's; a mid-round newcomer has none) |
| **Hall Monitor** 🦺 (common, new, melee only) | — (replaces Participation Trophy, one of six gold commons) | your **attacks of opportunity** deal +3/+5/+5; III: and end the foe's walk right there (`modifyOpportunity` flat, so the AI's disengage cost and the HUD's "⚔ provokes" know it; III `onOpportunityAttack` → `DD.Act.stopMove`). `requires`: a melee basic attack, read like the engine's `meleeDef` |
| **Teacher's Pet** 🍎 | +10/15/25% XP | **you count as 1.5 / 2 / 3 heroes when the DM rolls which lowest-level hero levels up** (`runMods.xp` = 0.5/1/2 = the rotation weight − 1, `DD.Passives.xpMult`; it never jumps the rotation) |
| **Sleepwalker** 😴 III | never into a tile an enemy is aiming at | **a tile no enemy can reach, if there is one** (`DD.AI.threatMap` = the HUD's threat shading, plus hostile wind-up tiles) |
| **Displacer Beast Ancestry** 🐈‍⬛ | avoiding telegraphed tiles | the same "no enemy can reach" preference (no intents to read) |
| **Plot Armor** 📖 | `onTakeDamage` resets HP to 1 after a downing hit | the engine's **`preventDeath`** veto: any down (hits, instant kills, falls) is refused once; nothing of a down happens |
| **Phoenix Feather** 🪶 | spent even if an item revived the hero first | checks the hero is still down first (items request); (review) a hero downed mid-walk (an attack of opportunity) rises where he fell: `DD.Act.stopMove`, like the Phoenix Down Jacket and Buga's toaster |
| **Cardio King** 🏃 | "this turn" = this round (any hero's turn) | your own turn (`state.turn`); walks on others' turns don't count |
| **Extra Attack (Allegedly)** ⚔️ | `phase === 'player'` (any hero's turn), per round | kills on **your own turn**, per turn (no AP banked for later from an ally's turn) |
| **Cooldowns Are a Myth** ⏩ | "first cooldown skill each turn" keyed on the round | keyed on your own turn |
| **Cursed: Unread Blood Pact** 🖋️ | owed per round | per own turn; attacks of opportunity / echoes / skills used on others' turns owe nothing |
| **Cursed: Loud Eater** 🍗 | +2/+3 armor, heal 3/4 a turn; "they plan their attacks on you" | **heal 3/5 a turn, no armor**; "each round starts with enemies within 3 tiles Taunted by you (they must attack you if they can)". In v2 the taunt is real control and the armor sat on the hero it sends every hit to: +16 for ONE holder at level I, above every legendary; now +7 |
| **Cursed: Duck Mafia Debt** 🕶️ | 2/3/4 (II 1/2/3) Hostile Ducks by act | **1/2/3 (II 1/1/2)**: the ducks now act on their own initiative turns (no telegraphs) and the debt was a net loss (−10 for one holder); now +5 |
| **Gold-Plated Ego** 🥇 (rare) | 1 Block / 20-20-15 gold, max 5/7/10 per turn | 1 Block / 30-25-20 gold, **max 3/4/5** (a per-turn shield in a no-free-Block game; measured +22 at 60 gold with the old cap) |
| **Pet Rock** 🪨 | 2/3/5 Block per turn | **2/3/4**; the Block comes with your first turn (deployment and enemies acting first see 0) |
| **Afraid of Even Numbers** 🔢 | even rounds 2/3/4 Block | 2/3/**3** (the strongest common in the v2 sims) |
| attacks of opportunity | — | **Echo Chamber** never echoes one, **Wild Magic Conduit** doesn't count them as skills used, **Blood Bank Card** gives no Block for one (nothing was paid), **Dad Jokes** does tell its joke on one (it is a basic attack) |
| texts | up to 260 chars | ≤ 170 chars, no v1 words (validator): Pet Rock, Frequent Flyer, Method Actor, Ghost Accountant, Dad Jokes, Proud Pet Parent, Bedside Manner, Always on Fire... shortened |

Unchanged and fine under v2 (checked): start-of-turn hooks run after the turn's Block reset and AP refill (Pet Rock,
Garlic Breath, Gravitational Ego, surges, Déjà Vu); `onTurnStart` statuses cover *this* turn (Ghost Accountant's and
Couch Potato's Confused); fight-start statuses cover the hero's first N turns (Inspiring Monologue, Predatory Loan);
foe debuffs from your turn cover the foe's next turn (Resting Villain Face, Dad Jokes, Gravitational Ego III);
Narcoleptic's `onTurnEnd` Sleep is fresh (it costs the next turn); `gainAp` in `onTurnStart` is spendable at once
(Overcaffeinated, Adrenaline Junkie, Frequent Flyer); round-based entries count rounds (Overcaffeinated, Afraid of Even
Numbers, Ultra Instinct, Déjà Vu, Loud Eater's taunt at the round start → it covers each foe's turn that round).

## Summary

- **79 entries**: 33 common, 18 uncommon, 11 rare, 6 legendary, 11 cursed. On the d100 that is common 63.3% · uncommon
  20.7% · rare 6.3% · legendary 1.2% · cursed 8.4% (run-start rolls never give a cursed one).
- Levels: commons, uncommons and rares have 3 levels (II ≈ +50%, III ≈ +100% or a new rider); legendaries and cursed
  have 2. Every desc is exact for its level; the validator requires a different desc per level, ≤ 170 chars, no v1
  words (Guard, telegraphs, intents, planning, XP), a ≤ 30-char name, a unique emoji icon, a ≤ 120-char flavor and
  `Cursed: …` names for (and only for) cursed ones.
- **Very random**: ~20 entries roll the combat dice in a fight (5-60% procs, Wild Magic Overload's 50/100%), the loaded
  initiative die, a random Blessing every fight (Method Actor), random flyer upgrades, 4 Wild Magic entries, 3 duck
  entries, 2 random teleports (now dodging enemy reach), a teleporting pet rock, 2 surface makers, gold makers, a random
  consumable, Hype tricks, odd/even rounds, walls, high ground, exactly 1 HP, surfaces, 4+ tiles walked, a downed ally,
  **initiative** (Cheap Shot Artist, Loaded Dice, Overcaffeinated) and **attacks of opportunity** (Hall Monitor,
  Greased Up), plus run-layer entries (gold, prices, healing, level-up odds).
- **7 hero-specific entries** (`requires(runHero, heroDef)`, defensive: any missing field means "no"; descs end with
  "… only."): Pyromaniac (2+ fire skills → Zarathor, Pebbles, Valdris), Bedside Manner (healers → Ellaria, Josiah,
  Marbles, Pebbles, Sparrow), Proud Pet Parent (summoners → Corelos, Ellaria, Josiah, Sparrow, Zarathor), Frequent Flyer
  Miles (flyers → Syllamin), Blood Bank Loyalty Card (HP payers → Sparrow), Compound Interest (a gold skill → Zarathor,
  Buga, Hjalmar — his Pickpocket is tagged 'gold'), **Hall Monitor** (a melee basic attack → Basanos, Betty, Marbles,
  Marwyn, Pebbles, Slate, Sparrow, Valdris; the test checks it against the engine's own `DD.Act.opportunitySlot` for every
  registered hero).

### Conventions (how every hook is written)

- Instance last: `hook(…args, p)` with `p = { id, level, L, def, data }`. Per-fight state only in `p.data`, plain data
  (unit **ids**, never unit references: previews and deployment copy it).
- **"Your turn" = your own initiative turn**: per-turn bookkeeping is keyed on `state.turn` (constant during one unit's
  turn) and gated by `DD.Act.isOwnTurn(u)`; "each round" keys stay on `state.round`.
- Hooks fired for both sides of an attack of opportunity (`modifyOpportunity`, `onOpportunityAttack`) find their holder
  with `mine(unit, p)` (`p` is in `unit.passives`). `modifyOpportunity`, `modifyCost` and `modifyRange` are queries: pure,
  no dice, no FX.
- Randomness only through `DD.Combat.state.rng` (`roll(pct)` = one `next()`; a 100% roll consumes nothing).
- Every effect through DD.Act; FX are cosmetic plus one log line for the big moments.
- Desc vocabulary: a **hit** is a damage instance of 1+ after armor (Block counts); a **skill hit** has `cause: 'skill'`
  (attacks of opportunity are skill hits); **enemy skill hits** come from a hostile source. Durations use the engine's
  "for N turns" (turns of the unit that has the status).
- Re-entry: damage-on-damage entries use `reflect: true` and a stored id; the Echo Chamber guards itself with
  `p.data.echoing` and marks its ctx `rpEcho` (Conduit, Blood Bank, Blood Pact and Cooldowns ignore echoes and attacks of
  opportunity); healing bonuses use `heal(null, …)`. No hook can trigger itself.

## The table

| Rarity | Entries (id → name: effect at I / II / III) |
|---|---|
| common | `rp_lucky_socks` Lucky Socks: skill hits 10/15/20% for +50% · `rp_thick_skull` Thick Skull: +1 armor / +1 armor +4 HP / +2 armor +4 HP · `rp_big_boned` Big-Boned: +5/8/12 max HP · `rp_cheap_shot` **Cheap Shot Artist**: +2/3/4 on foes whose turn is still to come this round · `rp_hall_monitor` **Hall Monitor** (melee): attacks of opportunity +3/+5/+5 (III: the walk ends) · `rp_coin_magnet` Coin Magnet: your kills → 2/3/5 gold · `rp_pet_rock` Pet Rock: Rocky (10 HP, blocks nothing) beside you again at each of your turn starts → 2/3/4 Block · `rp_snack_pouch` Emergency Snack Pouch: first drop below 50% → heal 4/6/9 · `rp_spicy_blood` Spicy Blood: adjacent attackers Burn 1/2/3 · `rp_allergic_to_goblins` Allergic to Goblins: +2/3/4 vs goblins, goblinoids & kobolds (III: they deal 1 less) · `rp_main_character` Main Character Syndrome: your kills +4/6/8 Hype, allies' kills drain 3/2/1 (a rule) · `rp_overcaffeinated` Overcaffeinated: +2/3/4 initiative, +1 AP round 1 / rounds 1-2, −1 AP round 3 (III: no crash) · `rp_superstitious` Afraid of Even Numbers: odd rounds +1/2/3 dmg, even rounds 2/3/3 Block · `rp_wall_hugger` Wall Hugger: next to a wall/solid object, enemy hits −1/2/3 · `rp_high_ground` I Have the High Ground: +2/3/4 vs lower foes · `rp_clutch_gene` Clutch Gene: ≤30% HP +20/30/30% (III: ×2 at exactly 1 HP) · `rp_ghost_accountant` Haunted by a Ghost Accountant: won fight → 5/8/12 gold; 15/10/5% Confused per turn · `rp_sleepwalker` Sleepwalker: 25% at turn end: random tile within 2 + 3/5/5 Block (III: out of enemy reach if it can) · `rp_rules_lawyer` Rules Lawyer: first 1/2/3 enemy/hazard debuffs per fight cancelled · `rp_trust_fund` Trust Fund: +10/15/20% gold (runMods) · `rp_haggler` Professional Haggler: shop −5/8/12% (runMods) · `rp_teachers_pet` Teacher's Pet: counts as 1.5/2/3 heroes in the level-up roll (runMods.xp) · `rp_second_breakfast` Second Breakfast: +20/35/50% out-of-combat healing (runMods) · `rp_quantum_pockets` Quantum Pockets: 20/30/40% random consumable per fight (runs) · `rp_dad_jokes` Dad Jokes: basic attack (incl. attacks of opportunity) 25/35/50% Weaken · `rp_fireproof_onesie` Fireproof Onesie: immune Burn / +Poison / +Bleed · `rp_garlic_breath` Garlic Breath: 1/2/3 armor-piercing damage to adjacent foes per turn · `rp_leaky_waterskin` Leaky Waterskin: tiles you walk out of → puddle 2/3 rounds, III ice · `rp_frequent_flyer` Frequent Flyer Miles (flyers): 8/6/5 tiles moved → a random +1 AP / 4 Block / Inspired next turn (one per turn) · `rp_compound_interest` Compound Interest (gold users): 5/8/10% of gold per fight (max 5/8/12) · `rp_cardio_king` Cardio King: walked 4+ tiles on your turn → 2/3/4 Block and +2/3/4 on the next hit · `rp_swamp_thing` Swamp Thing: standing on a surface → +2/3/4 · `rp_revenge_arc` Revenge Arc: ally hero downed → +20/30/40%; allied summon dies → 3/4/5 Block |
| uncommon | `rp_adrenaline_junkie` Adrenaline Junkie: an enemy hit of 6/5/4+ → +1 AP next turn · `rp_vampire_wannabe` Vampire Wannabe: heal 20/30/40% of skill damage · `rp_petty_revenge` Petty Revenge: attackers Marked 2/3/4 · `rp_bee_whisperer` Bee Whisperer: your kills poison foes within 2 (2/3/4) · `rp_wild_magic_allergy` Wild Magic Allergy: 15/20/20% surge per turn (III good only) · `rp_resting_villain_face` Resting Villain Face: adjacent / within 2 foes Weak (III +Vulnerable) · `rp_inspiring_monologue` Inspiring Monologue: you + allies within 2/3/3 Inspired 2/2/3 turns at fight start · `rp_parkour` Parkour Enthusiast: +1 move / +hop / +2 move +hop · `rp_loaded_dice` **Loaded Dice**: initiative with 2/2/3 d20s, keep the best (II/III +2 init); natural 20 → Inspired 2 + 15 Hype · `rp_method_actor` Method Actor: a random common / common-or-uncommon / uncommon-or-rare Blessing at level II each fight · `rp_greased_up` **Greased Up**: can't be opportunity-attacked; immune Root / +Slow / +Stun · `rp_displacer_ancestry` Displacer Beast Ancestry: 20/30/40% blink 2-3 tiles after an enemy hit, out of enemy reach if it can · `rp_cat_reflexes` Cat Reflexes: 10/15/20% dodge · `rp_pyromaniac` Pyromaniac (fire users): +2/3/3 fire damage (III Burn 1) · `rp_explosive_personality` Explosive Personality: downed → 8/12/16 fire to adjacent foes · `rp_bedside_manner` Bedside Manner (healers): +20/30/30% healing (III cleanse 1) · `rp_proud_pet_parent` Proud Pet Parent (summoners): summons +4/6/8 HP, +10/20/30% damage · `rp_blood_bank_card` Blood Bank Loyalty Card (HP payers): HP costs −1/−1/−2 (II+: 3 Block when paying) |
| rare | `rp_emotional_support_duck` Emotional Support Duck: a Confused Duck (8 HP) / one with 12 HP / 2 ducks join each fight · `rp_plot_armor` Plot Armor: once per fight a down is refused at 1 HP (+6 Block, III + Invulnerable 1 turn) · `rp_ambidextrous` Ambidextrous: first basic attack each turn free (+1/+2 basic damage) · `rp_bifocals` Bifocals: +1 range (+5/10% damage) · `rp_uno_reverse` Uno Reverse Card: 15/20/25% reflect an enemy hit · `rp_extra_attack` Extra Attack (Allegedly): kills on your turn +1 AP, 1/2/3 times · `rp_circle_of_life` Circle of Life (Duck Edition): 30/45/60% your kills come back as ducks · `rp_wild_conduit` Wild Magic Conduit: every 4th/3rd/3rd skill surges (III good only) · `rp_gold_plated_ego` Gold-Plated Ego: 1 Block per 30/25/20 gold (max 3/4/5) per turn · `rp_deja_vu` Déjà Vu Enthusiast: cooldowns reset every 4th/3rd/3rd round (III +1 AP) · `rp_gravitational_ego` Gravitational Ego: pull foes 2-3/2-4/2-4 tiles away 1 closer each turn (III Vulnerable) |
| legendary | `rp_chosen_one` Chosen One (Self-Declared): +1 AP (II +10% damage) · `rp_cooldowns_social_construct` Cooldowns Are a Myth: no cooldowns; the first cooldown skill each turn costs as usual (II: 1 AP less, min 1), later ones that turn +1 AP · `rp_echo_chamber` Echo Chamber: 25/40% a skill resolves again for free · `rp_phoenix_feather` Phoenix Feather (Probably): first down per fight → rise at 50/75% HP, 6/10 fire around · `rp_ultra_instinct` Ultra Instinct (Unlicensed): first enemy hit each round deals 0 (II: counter 4) · `rp_wild_magic_overload` Wild Magic Overload: 50/100% good surge per turn |
| cursed | `rp_cursed_glass_cannon` Glass Cannon: +40/50% dmg / take +30% · `rp_cursed_kleptomaniac` Kleptomaniac: +2/3 gold per skill hit / shop +40% · `rp_cursed_loud_eater` Loud Eater: heal 3/5 per turn / enemies within 3 Taunted by you every round · `rp_cursed_monkey_paw` Monkey's Paw: +1 AP / 25/20% bad surge per turn · `rp_cursed_couch_potato` Couch Potato: +1 AP, +20/30% dmg / Confused every turn (moving costs 2 AP) · `rp_cursed_narcoleptic` Narcoleptic: +40/50% dmg / 15/10% fall Asleep each turn end (loses the next turn) · `rp_cursed_blood_pact` Unread Blood Pact: 2+ AP skills cost 1 less / pay 3/2 HP at the end of each turn you used one (never below 1) · `rp_cursed_predatory_loan` Predatory Loan: +30/40 Hype per fight / 10 gold per fight or Vulnerable+Weak 2 turns · `rp_cursed_spontaneous_combustion` Always on Fire: +20/35% dmg, immune to fire & Burn / the 4 tiles around you burn at your turn end, allies or not · `rp_cursed_gamblers_ruin` Gambler's Ruin: skill hits 50/60% double, else half · `rp_cursed_duck_mafia` Duck Mafia Debt: +1 AP / 1-2-3 (II 1-1-2) Hostile Ducks join every fight by act |

## Balance (v2)

**Method** (scratch, not shipped: `.tmp/passives-v2/pair.sh "suite=pair&n=…&k=4&lv=1|max&only=…[&one=1]"` — a copy of
the integrator's placebo-baseline harness with v2 settings; `one=1`: only the first eligible hero of the party holds the
Blessing; it sources `tools/chrome_slot.sh`): paired AutoPlay fights on the real act 1-3 normal and elite
encounters, random real 4-hero parties at the **v2 levels** (2 / 4 / 5 by act, skills I-II), **normal difficulty** (no
HP/damage inflation: v2 fights already hurt — baseline 97% won, ~30% party HP lost, 0.5-0.8 downs a fight). Each
Blessing on every eligible hero vs the mean of 4 placebo realizations of the same fights. Score = 100·Δwin + Δ(party HP
lost, points) + 20·Δrounds/rounds + 10·Δdowns (higher = better for the party), ± one standard error. Run-layer entries
score 0 by construction; AutoPlay underrates reactive and positional Blessings (it plays around nothing).

**At max level (48 fights, before the trims below)**: per-turn Block is worth a lot in v2 — Afraid of Even Numbers +22.8
± 5.5, Gold-Plated Ego +22.3 ± 4.0 (at 60 gold, i.e. 4 Block a turn; real runs hold more), Pet Rock +19.9 ± 3.0, Thick
Skull +16.7 ± 3.5, Cat Reflexes +13.5, Cheap Shot Artist +11.7 ± 4.8, Plot Armor +11.2, Big-Boned +11.0, Lucky Socks
+10.6, Cardio King +9.0, Overcaffeinated +7.5 ± 8.1 (was −8 in v1), Greased Up +6.8, Sleepwalker +5.4, Swamp Thing +4.6,
Loaded Dice +3.2 ± 5.2, High Ground +3.1, Extra Attack +1.5, Hall Monitor 0 ± 5.6 (2.2 holders: AoOs are rare — the AI
now avoids disengaging from the holder, which this score can't see), Displacer −3.4 ± 5.1 (noise-level chaos, as in v1).
→ trimmed: Gold-Plated Ego max 3/4/5 at 30/25/20 gold a point (was 5/7/10 at 20/20/15), Afraid of Even Numbers III Block
4 → 3, Pet Rock III 5 → 4.

**Level I, the whole table, every eligible hero holding it** (40 fights, `lv1_all.txt`): mean score by rarity common
+3.5 · uncommon +5.4 · rare +11.3 · cursed +12.4 (Kleptomaniac, gold-only, left out) · legendary +21.8 — **the ladder
holds** (common ≈ uncommon < rare ≈ cursed < legendary). Top: Cursed: Loud Eater +36 (fixed below), Ultra Instinct +33,
Always on Fire +26, Wild Magic Overload +26, Emotional Support Duck +23; strongest commons Pet Rock +15, Thick Skull +15,
Afraid of Even Numbers +15, Cheap Shot Artist +11, Revenge Arc +11; strongest uncommon Vampire Wannabe +19. Lowest:
Glass Cannon −12, Frequent Flyer −11 (one holder, n 7, ±10), Blood Pact −9, Main Character −6.5 (±11), Leaky Waterskin −5.
Run-layer entries are exactly 0. Hall Monitor +0.1, Loaded Dice +2.4 (AutoPlay can't value acting first or a deterrent).

**Level I, ONE holder** (48 fights, `one_cursed.txt` / `one_fix.txt`; the realistic case — a party rarely stacks one
Blessing): every eligible-hero runs compound defensive entries (four armored / shielded heroes rarely go down), so the
single-holder numbers decide: Thick Skull +7.1, Pet Rock +3.8, Lucky Socks +3.5, Afraid of Even Numbers −2.2 ± 7 —
ordinary commons, left as they are (only their III trimmed). Ultra Instinct +13.4, Chosen One +1.8 ± 6. Cursed: Loud
Eater **+16.3 ± 4.3** (above the legendary) → no armor, heal 3/5 → **+7.3 ± 4.2**; Duck Mafia **−10.2 ± 6.1** (a trap) →
1/2/3 ducks → **+5.0 ± 4.0**; Narcoleptic +6.6, Always on Fire +5.2 (its "allies or not" fire is a real cost with one
holder), Couch Potato +4.5, Monkey's Paw +2.9, Gambler's Ruin +2.2, Predatory Loan +1.8, Kleptomaniac −0.8 (gold),
Blood Pact −3.2 ± 8, Glass Cannon −3.8 ± 4.3 (real gambles in a game where defense is king; left as they are).

## Tests (`tests/content/passives.js`, 18 suites, ~7,500 assertions with all content, ~37 s; ~7,100 isolated, ~10 s)

- **Validator**: every rp_ entry — fields, rarity, weight, 1-3 levels, desc at every level (≤ 170 chars, no v1 words, no
  `undefined`/`NaN`, different per level), flavor (no v1 words), unique icon and name, **known hook names only (the v2
  list: `modifyInitiative`, `modifyOpportunity`, `onOpportunityAttack`, `preventDeath`… — no `modifyGuard`)**, stats keys
  (incl. `init`), runMods keys and bounds (xp ≤ 2: the rotation weight), a behaviour spec per entry. Mix suite: counts per
  rarity exactly 33/18/11/6/11, default weights, d100 shares, seeded `DD.Passives.roll`s follow the weights, no cursed
  run-start rolls, initiative / opportunity tags present.
- **requires()**: every hero def and 7 malformed inputs → a boolean, never a throw; the heroes the entries were written
  for get them; **Hall Monitor agrees with the engine's `DD.Act.opportunitySlot` for every registered hero**.
- **One behaviour spec per entry, every level** (5 suites, by rarity): sandboxes on `test_knight` & co. with
  `enemyAi: false` (the AI passes) unless a spec needs enemies to act (Loud Eater's taunt is played out on the grunts'
  real turns). Procs forced both ways by stubbing `state.rng.next` (or a queue: the proc fires, the tile is the real dice)
  and measured over 600-1500 trials (4.5 σ). v2 specifics: Cheap Shot over a fixed order (a minion before the knight,
  grunts after; round 2; a mid-round newcomer); Hall Monitor with real AI walks (`AI.moveTo`), the AI's price
  (`AI.opportunityDmg`), the move preview (`Combat.provokes`), the III stop, the reverse case; Loaded Dice on a deployment
  sandbox rolled with queued dice (keeps the best, +2 init, natural 20) and over 300 real rolled fights (average kept
  die = best of n d20s, natural-20 rate); Greased Up walking away from a grunt (no provoke, no hit; control without it);
  Sleepwalker / Displacer against a real threat map + silent wind-ups (III always lands on the one calm tile, below III
  it may land in reach, no calm tile → still a move); Pet Rock in deployment (no Block) and against enemies acting first;
  per-own-turn Cardio King / Extra Attack / Cooldowns / Blood Pact across hero turns; Narcoleptic's lost turn through the
  real turn flow; Always on Fire burning the ally at *her* turn end; Plot Armor refusing an instant kill (no down event);
  Phoenix Feather kept when something revived first; Duck Mafia's collectors get initiative turns of their own; attacks of
  opportunity: Dad Jokes tells the joke, Echo Chamber never echoes, Conduit doesn't count, (review) Phoenix Feather ends
  the walk of a hero downed mid-walk by one, Blood Bank gives no Block for a free one with an HP-cost melee basic.
- **v2 — no Blessing starts a fight with Block**: every entry at max level, in deployment and on the first enemy turn of
  an enemies-first fight, the heroes have 0 Block.
- **Stats** (heroStats incl. `init`), **Previews** (40 random loadouts: pure; certain previews exact, rolled ones "?"),
  **Echo Chamber** on every hero / generic skill, **AutoPlay** (fixture heroes, real heroes, real encounters incl. bosses;
  no stall, no runaway, no swallowed errors), **Determinism** (same seed → same fight; no `Math.random` / cosmetic
  `DD.rng` from a hook), **Live run** (fees, interest, gold, finds and runMods through `DD.Run`, Teacher's Pet's rotation
  weight), **Real kits** (Pyromaniac, Bedside Manner, Proud Pet Parent, Blood Bank, Frequent Flyer, Compound Interest and
  now Hall Monitor on every eligible real hero: 26 pairs).

## Deviations

- **Teacher's Pet** desc "you count as 1.5 heroes" = `DD.Passives.xpMult` weight 1.5 in the rotation's dN among the
  lowest-level heroes (run-v2 Requests suggested "odds ×1.5"; same thing, fewer words). Values raised (×1.1/1.15/1.25 →
  ×1.5/2/3): a 10% weight in a d4 was invisible.
- **Loaded Dice** only works in rolled fights (every real fight; sandboxes default to a fixed order). It rewrites
  `r.roll` (the kept die, which the HUD's dice moment and tracker show), `r.init` (+bonus) and `r.total`.
- **Hall Monitor**'s `requires` reads the basic attack's def (range 1, aimed at foes, not `'ranged'`, areas only if
  `'melee'`), not a combat unit: a hero whose range bonuses push a melee basic to range 2 mid-fight would still be
  offered it. Its III uses `DD.Act.stopMove` from `onOpportunityAttack` (documented for tile callbacks; `moveAlong`
  checks it after each attack of opportunity).
- **Cheap Shot Artist** reads `state.order` / `turnIndex` (ARCHITECTURE §4.1) and `DD.Combat.turnOwner` for summons.
- Older deviations still hold: Proud Pet Parent raises a summon's `maxHp`/`hp`/`dmgBonus` directly; Unread Blood Pact pays
  HP like skill HP costs (never below 1); Pet Rock is a `rock` object instance (`rockyOf`, `blocksMove: false`, `height`,
  `googly`); Method Actor pushes a fight-only `role: true` instance onto the unit; Main Character Syndrome is a fight
  rule; Couch Potato borrows the core Confused for "moving costs 2 AP".

## Requests

- **HUD** (optional): Loaded Dice keeps its dice in `p.data.dice` (e.g. `[3, 15]`); the initiative dice moment could show
  the extra dice next to the hero's card ("🎲 3 / 15"). Today the hero's card shows the kept die (correct total).
- **Lead (DESIGN §7.1)**: the examples say "Overcaffeinated (+1 AP on round 1, Slowed on round 3)" (it is −1 AP, plus
  initiative now) and "run-layer effects (gold, XP, shop prices, healing)" (XP → level-up odds); the example list could
  mention initiative / attacks-of-opportunity Blessings. The table no longer has Muscle Tank Top or Participation Trophy.
- Done since the last pass: RULES hooks (Phase 4), a pocket-sized googly Rocky (RENDER), AP-cost Blessings on the party
  screen (META-UI / ui-polish), the Method Actor "this fight only" badge (HUD), the Phoenix Feather item clash (items).

## Known issues

- Stacking the same cursed entry on all four heroes changes its character (four Always on Fire heroes are immune to each
  other's fire).
- AutoPlay underrates reactive and positional Blessings and can't value initiative or a deterrent (Loaded Dice, Hall
  Monitor score near 0); human play rates them higher.
- Per-turn Block Blessings (Pet Rock, Afraid of Even Numbers, Gold-Plated Ego) are the strongest defensive picks in v2
  sims when every hero holds them (they compound); for one holder they are ordinary. Gold-Plated Ego grows with the
  party's gold (5 Block a turn at III with 100+ gold). Watch them in playtests.
- Glass Cannon and Blood Pact are slightly negative in AutoPlay at level I (−4 / −3 for one holder, within noise): in v2
  taking more damage hurts. Real gambles; a careful human gets more out of +40% damage.

## Review (v2) — adversarial review of the Blessings v2 work (ADVERSARIAL REVIEWER role)

Lens: v2 correctness (no Guard, no fight-start Block, no intents, per-own-turn durations, leveling texts), attacks of
opportunity, desc == execute at every level, simplicity, comedy, meaningful tests. Verified by running code: the 18
suites isolated and with all content, the generic `content:` suites isolated with the table, scratch probes
(`.tmp/passives-v2-review/probe.sh`, not shipped) and screenshots (deployment with four Rockies, an AutoPlay fight with
Loaded Dice III + Hall Monitor III, the party screen with Hall Monitor / Loaded Dice / Greased Up cards).

**Verified (held)**
- Every hook reads "your turn" as the holder's own initiative turn (`state.turn`, `Act.isOwnTurn`), "each round" as
  `state.round`; statuses from Blessings follow the v2 duration rules (start-phase statuses = this turn, foe debuffs from
  your turn = its next turn, Narcoleptic's turn-end Sleep = the next turn). No hook reads intents; `threatTiles` = the
  HUD's threat map + hostile wind-ups only. No Guard hook, no fight-start Block (the invariant suite, plus a probe of four
  Pet Rock III holders in real act-1 deployments: 0 Block until each hero's own turn).
- Attacks of opportunity: `modifyOpportunity` hooks (Hall Monitor, Greased Up) are pure and find their holder with
  `mine()` (Hall Monitor never boosts a foe's strike on the holder; Greased Up never stops the holder's own strikes).
  Hall Monitor III's `stopMove` ends the walk (probe: a slingshot kid walking away from Marwyn stops on its tile, 14 → 4
  HP). In 20 real AI turns the engaged kid stayed next to Marwyn (with or without the Blessing: walking away was already
  priced too high; the +5 is in `AI.opportunityDmg`), i.e. levels I/II work as a deterrent, III's stop bites divers and
  taunted walkers. Echo / Conduit / Blood Pact / Cooldowns /
  Blood Bank ignore attacks of opportunity; Dad Jokes and Ambidextrous's +damage include them (they are basic attacks).
- Hall Monitor's `requires` = the engine's `opportunitySlot` for all 21 heroes (16 real + 5 fixtures); the other hero-only
  lists match the notes (Compound Interest also reaches Hjalmar: his Pickpocket is tagged 'gold' — notes corrected).
- Loaded Dice in 30 real act-1 fights (4 holders, levels I-III): kept die = the best of `p.L.dice`, total = roll + init on
  every hero. Cheap Shot vs Grimble (two initiative entries, init +2): one of his turns was still to come at the hero's
  first turn in 20 of 40 rolled fights — no "always a cheap shot" against two-turn bosses. Every Blessing at max level on real level-4 parties in real encounters (79 AutoPlay fights): no swallowed
  errors. Loud Eater II on Marwyn in the act-1 boss fights: no trivialisation (Rat King 7/10 vs 6/10 without, Grimble 9/10
  vs 8/10).
- Pet Rock in deployment: Rockies can sit on deploy tiles; deploying a hero onto one works (21/21: he blocks nothing).

**Fixed**
- **Phoenix Feather (Probably)**: a hero downed mid-walk by an attack of opportunity rose at 50/75% and *kept walking*
  the rest of the path (with 0 AP after `revive`), against DESIGN §4.2 ("if the hit downs … its walk ends there") and
  unlike its twins, the Phoenix Down Jacket item and Buga's toaster, which both call `stopMove`. Now `DD.Act.stopMove`
  after the revive (a stale stop outside a walk is harmless: every walk clears it first). Regression in the legendary
  spec (2 assertions, mutation-checked: they fail without the fix).
- **Tests**: Blood Bank's "no Block for an attack of opportunity" guard was untested (no hero has an HP-cost melee basic
  today). The uncommon spec now gives the knight a temporary HP-cost melee basic: a grunt walking away eats it for free
  (no HP paid, no Block); the same bite on his turn pays and gives the Block (mutation-checked).

**Left as is (deliberate)**
- **Plot Armor** mid-walk: the down is refused (`preventDeath`), nothing of a down happens, so the walk goes on at 1 HP
  — the same as the Undying Undies item. The rule ends a walk on a hit that *downs*; this one doesn't.
- **Cheap Shot Artist** counts a stunned foe's coming turn as "still to come" (it is, it will just be lost).
- Hall Monitor I/II score ~0 in AutoPlay (the AI simply stays engaged); for a human that is the point (the goblin keeps
  swinging at the barbarian, not the wizard).
- "Gold-spenders only." (Compound Interest) also covers Hjalmar, who steals gold rather than spends it: the eligibility is
  "a skill tagged 'gold'" (DESIGN §7.1 says gold-spenders); not worth a text change.

## Requests (Nov 3) — flyers ignore the floor (CONTENT SWEEP, shared)

- **Swamp Thing** reads the surface through `DD.Grid.feelsSurface(unit, tile.surface)`: a flyer gets no bonus over a
  puddle, blood, oil or fire, but a cloud (steam, smoke) still counts. Desc: "While you stand in a surface (puddle,
  blood, oil, fire, a cloud...; flyers only count clouds)". Test: the Swamp Thing case in the common-entries suite.
- Checked, no change: no Blessing grants flight (Frequent Flyer needs a born flyer); Leaky Waterskin and Always on Fire
  lay surfaces (they don't read them); Bedside Manner III cleanses `ctx.friends` (a revived ally had no debuffs left);
  Echo Chamber re-checks the target (a detonated barrel is gone); Dad Jokes / Wild Conduit see a barrel shot as a use
  with no foes.

## History (pre-v2 passes, condensed)

- **Author's balance pass (v1)**: AutoPlay pairs with enemies ×2.5 HP / ×3 damage; Cooldowns Are a Myth I measured −26
  and was reworked; Blood Pact paid every turn (−10) → only after discounted turns; Couch Potato's root → Confused; Pet
  Rock became a follower who blocks nothing; Emotional Support Duck moved to rare; Inspiring Monologue 2/2/3 turns.
- **Review**: the two-Rocky adoption bug (`rockyOf`), Frequent Flyer reworked from a second Haggler, Method Actor added,
  determinism / live-run / real-kit suites.
- **Integration**: 400 whole runs, every entry rolled; 91% of held Blessings are level I; placebo-baseline method (the
  harness the v2 balance above reuses); Gravitational Ego's icon 🕳️ → 🪐.
- **Phase 4**: fair previews (rolled hits preview "?"), the hooks this pass now uses (`preventDeath`, `modifyHeal`,
  `onAllyDowned`, `modifyMoveCost`...).
