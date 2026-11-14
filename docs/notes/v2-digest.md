# V2 DIGEST — the whole v2 game, integrated (briefing for the balance pass, playtests and polish)

Written by the **v2 integrator** after every v2 area (engine, attacks of opportunity, 16 heroes, enemies acts 1-3,
bosses, items, kit, Blessings, narrative, UI) landed and was reviewed. Everything below was measured with every file
loaded together. Owner notes (`docs/notes/<area>.md`) stay the source of truth for each area's details; this file is
the map, the numbers and the open threads. The v1 digest (`content-digest.md`) is kept for history only. §9 covers the
user's Nov 3 requests (Onyx, flyers, barrels, heals that revive, map rotation), built after this digest was written;
§10 the Nov 5 docs and content cleanup (DESIGN / ARCHITECTURE caught up with v2, enemy-side renames, explicit boss
initiative, the Party Balloons fix, the `opportunity` narration key).

**State.** `bash tools/test.sh` → **PASS** (see §8 for the final count), no swallowed `Error in` warnings. The only
`warnings:` lines are deliberate (junk-content tests in mapgen / run / wild magic, and the documented `peb_bbq`
content advisory: Bark-B-Q only hits Burning foes, the generic arena has none). (Nov 5: the loader reported
`missing scripts (1): tests/balance_tests.js`, reserved for the balance pass; it ships now, so nothing is missing.) 600 whole-campaign AutoPlay runs (~4,650 fights) across difficulties: 0 errors, 0 `DD.warn` lines,
0 timeouts on normal and brutal (3 on casual, an AutoPlay Help-Up loop, §6).

The v2 rules in one breath (user requests): roll for initiative, every unit takes one turn in that order; no enemy
telegraphs (only bosses' biggest attacks and at most one elite signature move wind up, ⏳); no Guard and no
combat-start Block; durations count the owner's own turns; one hero levels up per won fight (the DM's rotation, no
XP); all 16 heroes unlocked from the start; attacks of opportunity (walking away from an adjacent melee foe gives it
one free hit; pushes, pulls, teleports, swaps, jumps and skill dashes never provoke) and reach-aware enemies (brutes
stick to the hero next to them, only sneaky divers go for the weakest); skills are one verb plus at most one rider.

---------------------------------------------------------------------------------------------------------------------

## 1. Content map

**Counts** (real content, test fixtures excluded): 16 heroes · 188 hero skills (basic + signature + 9-10 pool each, + Chomp and Claw) ·
12 generic skills · 51 enemies (15 minions, 22 normals, 9 elites, 5 bosses) with 119 enemy skills · 6 hero summons ·
39 encounters · 101 items (51 shared: 20 common, 16 rare, 7 legendary, 8 cursed; 50 hero items) · 15 consumables ·
79 Blessings (33 common, 18 uncommon, 11 rare, 6 legendary, 11 cursed) · 13 scars · 36 events (18 hero events; one is the run layer's fallback) ·
62 statuses · 61 objects · 19 surfaces · 66 narration keys (452 lines, 79 tips; Nov 5: +4 tips, +1 idle-DM line, the new `opportunity` key).
Updated Nov 12 (D9 sustain, `.tmp/wf13/sustain-spec.md`): hero skills, items and consumables are counted from the code
(Slate's pool 9 → 10 with Stress Ball; Hjalmar's 4th hero item, Canned Laughter; balance pass 1's First-Aid Fanny Pack,
now ordinary common loot, and Bucket of Ice Water, every party's starting kit). The other counts are still the Nov 5
ones and were not recounted (D9 alone added loading tips for Slate, Basanos, Sparrow, Marwyn and Hjalmar).

### Heroes (16, `js/data/heroes/*.js`, all `unlock: null`)
| id | name | pronouns | role | HP (+/lvl) | move | armor | init | starters |
|---|---|---|---|---|---|---|---|---|
| `zarathor` | Zarathor | he/him | ranged fire, bling and wild magic | 24 (+4) | 4 | 0 | +1 | Gold-Plated Fireball, Throw Money At It |
| `syllamin` | Syllamin | he/him | support · debuffs · crowd control (flying) | 20 (+3) | 5 | 0 | +4 | Heckle, Power Ballad |
| `marbles` | Professor Marbles | he/him | mobile melee skirmisher / control | 28 (+4) | 4 | 0 | +2 | Walking Stick Whack, Marble Scatter |
| `marwyn` | Marwyn | he/him | tank / taunts | 35 (+5) | 3 | 0 | 0 | LOOK AT MARWYN!, YEET |
| `ellaria` | Ellaria | she/her | corgi summoner / healer / control | 26 (+4) | 4 | 0 | +1 | Summon Corgi, Healing Spring |
| `josiah` | Josiah | he/him | poison healer & raven wrangler | 26 (+4) | 4 | 0 | 0 | Plague Flask, Mostly Medicine |
| `sparrow` | Sparrow | she/her | high-risk bleed assassin | 22 (+3) | 5 | 0 | +3 | Hemo-Glob, Juice Box |
| `corelos` | Corelos | he/him | rune traps & dark bargains | 24 (+4) | 4 | 0 | +1 | Glyph of Warding, Dark Bargain |
| `slate` | Slate | he/him | grappler / thrower / bruiser | 32 (+4) | 3 | 1 | −2 | Hold Still, Personal Space |
| `buga` | Mayor Buga | he/him | support · manipulator · loot | 24 (+4) | 4 | 0 | 0 | Delegate, Loitering Fine |
| `kiri` | Kiri | she/her | ranged precision & ethereal mobility | 24 (+4) | 4 | 0 | +3 | Phase Shot, Ethereal Step |
| `betty` | Betty | he/him | frontline charger, holds the line (hop) | 32 (+4) | 4 | 0 | +1 | Ramming Speed!, Butt Out |
| `basanos` | Basanos | he/him | melee in two forms: swordsman and werewolf | 28 (+4) | 4 | 0 | +2 | Transform, Shoulder Check |
| `valdris` | Valdris | he/him | forge support / frontline buffer | 28 (+4) | 3 | 1 | 0 | Flame-Forged Edge, Forge Armor |
| `hjalmar` | Hjalmar | he/him | trapper & trickster (hop) | 22 (+3) | 5 | 0 | +4 | Banana Peel, Bear Trap |
| `pebbles` | Pebbles | he/him | melee skirmisher & fire control (fireproof) | 26 (+4) | 5 | 0 | +3 | Hot Zoomies, Fetch Quest |

Who makes attacks of opportunity (melee basic): Marbles, Marwyn, Sparrow, Slate, Betty, Basanos (both forms),
Valdris, Pebbles, plus summons whose first ready skill is melee (corgis, the raven, the Blood Clone, Steve).
Ranged basics (never strike walkers): Zarathor, Syllamin, Ellaria (Chomp in Wild Shape is melee), Josiah (cane reach 2),
Corelos, Buga, Kiri, Hjalmar.

Each hero has 3 hero items (Josiah and Hjalmar 4: Josiah's Portable Alembic carries his old brewing, Hjalmar's Canned
Laughter is his D9 sustain) and one hero event (Slate and Buga two). Hero summons: `zar_statue`, `cor_imp`, `jos_raven`, `ell_corgi`, `spa_clone` (+ item summon `steve_torchbearer`).

### Enemies by act (`js/data/enemies/act*.js`, `js/data/bosses/*.js`; init modifier in brackets)
- **Act 1**: rat (+3), goblin grunt (+2), slingshot kid (+3), kobold union rep (−2), sewer slime (−1) → slimelets (+1),
  spore bro (−1), cellar spider (+2, the act's diver), critic (+1); elites mimic (+2, Lid Slam is the act's one elite
  wind-up), bugbear (−1), gelatinous cube (−3). Bosses **Grimble** (+2, 2 turns a round; interns +1) and **the Rat
  King** (+2, 2 turns a round; plaintiff rats +1, rat lawyers 0).
- **Act 2**: skeleton intern (+1), unpaid zombie (−2), brunch cultist (0) → hollandaise horror (+1), wisp (+3, diver),
  owlbear cub (+2), banshee (+1), gargoyle (−1, diver), pixie swarm (+4); elites mama owlbear (+1, Stomp wind-up),
  necromancer TA (0), flesh golem Gary (−2), tesla coil (+2). Bosses **Lich-tenstein** (+2; interns +1, bookshelf
  mimics 0) and **Dr. Iris** (+2; eye floaters +1), one turn a round each.
- **Act 3**: imp influencer (+3, the act's diver), hell hound (+2), mind flayer (+1), eyeball intern (+2), rules lawyer
  (0), natural 1 golem (−2), kobold dragonshield (+1), succubus dating coach (0), skeletal backup dancer (+2); elites
  young red dragon (+1, Hoard Breath wind-up), death knight (−1, Villain Monologue), pit fiend accountant (+1, Hostile
  Audit). Boss **the Dungeon Master** (+2; cameo goblin / skeleton / imp).
- Every enemy states its init (Nov 5): the eight boss-fight enemies that used the tier default (`grim_intern`,
  `rat_plaintiff`, `rat_lawyer`, `lichtenstein`, `lich_intern`, `lich_mimic`, `dr_iris`, `iris_floater`) now carry it
  explicitly, at the same values. Only the wild-magic duck (`wm_duck_foe`, mapgen) still uses the tier default.

### Encounters (39; objective in brackets when not kill-all)
- **Act 1** normal: rats_in_the_cellar, goblin_ambush, slime_time, fungus_among_us, web_of_lies, union_meeting
  (destroy), open_mic (protect), big_flush (survive) · elite: mimic_hoard, last_call, cube_cleanup · boss: boss_grimble,
  boss_rat_king.
- **Act 2** normal: unpaid_internship, bottomless_brunch, cub_scouts, follow_the_lights, forbidden_buffet (destroy),
  last_coffee (protect), rooftop_critics, graveyard_shift (survive) · elite: mama_bear, office_hours, its_alive,
  tenure_review · boss: boss_lichtenstein, boss_dr_iris.
- **Act 3** normal: hellhound_walkies, influencer_collab, self_help_seminar (survive), trial_by_combat,
  cursed_dice_night, kobold_pep_rally (destroy), snack_heist (protect), intern_orientation · elite: hoarders_lair,
  very_dramatic_entrance, tax_season · boss: boss_dm.
- Every encounter's enemies and reinforcement waves exist (tested); placed only by others: `a1_slimelet`,
  `rat_plaintiff`, `lich_mimic`, the three `dm_cameo_*`.

### Shared content
- **Generic skills (12)**: Throw Chair, Second Wind, Dodge Roll, Rude Shove, Rally the Troops, First Aid, Sand in Your
  Eye, Come At Me Bro, Sucker Punch, Barrel Toss, Power Nap, Tactical Retreat (the generic Disengage: a walk that
  provokes nothing).
- **Consumables (15)**: Red Drink, Big Red Drink, Bucket of Ice Water (revive a downed ally within 2 at 50%; every
  party's starting kit, `DD.Balance.start`), Flask of Bad Decisions, Smoke Bomb, Energy Drink (+2 AP), Antidote,
  Liquid Courage, Scroll of Yeet, Bag of d4s, Holy Water, Frost Flask, Thunder Jar, Mystery Potion, Pocket Sand.
- **Starting kit (D9, Nov 12)**: the Bucket of Ice Water only, no generic heal. The First-Aid Fanny Pack (common
  trinket: at the start of your turn, the most hurt of you and the allies next to you heals 3 HP) left the kit and is
  one of the 20 ordinary commons in loot and shops.
- **Items**: no item gives Block at combat start; armor and HP are the defensive stats; `stats.init` exists (the Jar
  of Questionable Adrenaline, Kiri's Name Tag, Valdris' Conditioner). New: Polearm of Passive Aggression (an attack of
  opportunity stops the walker), Mithril Shirt (never provokes).
- **Blessings (79)**: new Cheap Shot Artist, Hall Monitor (attacks of opportunity), Loaded Dice (initiative dice),
  Greased Up (can't be opportunity-attacked); Teacher's Pet weights the level-up rotation (no XP).
- **Events / narration**: no event grants XP; level-ups go through the DM's rotation (named level-ups are rare and
  cost something). New narration key `initiative`; 75 tips, all checked true in v2.

---------------------------------------------------------------------------------------------------------------------

## 2. The 16 kits (generated from the registered defs: `a/b/c` = levels I/II/III; "III:" when level III adds a rider;
costs show level I→III when they change)

Regenerated Nov 5 (docs cleanup) with `.tmp/docs/kits.js` (a copy of the integrator's `.tmp/v2int/kits.js`: a page that
loads the game manifest and prints every hero's role, stats, passive, basic, signature, pool and hero items from the
registered defs; run it with `.tmp/docs/page.sh kits`). Raven Dive and Murder of Crows keep a hand-merged "a/b/c …
**III:** … and" line where the generator prints levels I and III in full. The Nov 3 "grounded" wording (Keg Stand,
Entangling Roots) is in; DESIGN §6 summarizes the same kits.
Nov 12 (D9 sustain, `.tmp/wf13/sustain-spec.md`): Hold Still, Stress Ball (new), Transform, Juice Box, the MAGNIFICENCE
passive, the Wolfsbane-Lined Coat and Canned Laughter (new) were copied by hand from the registered descs, in the
generator's format; a short "(D9 …)" note follows the lines whose rule the desc alone doesn't show. The other lines were
not regenerated.
Nov 14 (finish run, docs + tools): the generator now lives in `tests/docs_tests.js` (`tools/test.sh "suite=docs:
v2-digest&kits=1&verbose=1"` prints every kit) and prices a skill by its own `ap` / `hpCost` / `cooldown` / `charges`,
the way the engine charges it — the old one read `levels[i].ap` (the AP Campaign Promise *grants*) as the cost
(heroes-10). Every line was compared with a fresh run: Campaign Promise (0 AP), Juice Box (within 3), Transform
(2/3/4), Forge Armor, Healing Spring, Ramming Speed! (through allies), Pickpocket (Weakened) and Slate's Short Fuse were
stale and now read as the game does; the hand-merged / annotated lines (Raven Dive, Murder of Crows, Statue of Me, Hold
Still, Stress Ball, Transform's D9 note) say the same as the generator. Content changed after Nov 14 13:00 is not in.

### Zarathor the Bedazzled (`zarathor`, he/him)
*Ranged fire, bling and wild magic* · 24 HP (+4/lvl) · move 4 · armor 0 · init +1
- *Passive* **Drip Check**: At the start of each of his turns: +10% damage for every 50 gold the party holds (max +30%).
- **Eldritch Bling** `zar_basic` *(basic)* (1 AP): Deal 5 fire damage to a foe within 4 (+2 if it is Burning).
- **Bling Supernova** `zar_signature` *(signature)* (2 AP, 100 Hype): Deal 18 fire damage to every foe within 2 tiles of the target and Dazzle the survivors.
- **Gold-Plated Fireball** `zar_fireball` *(starter)* (2 AP, cd 1): Deal 5/6/7 fire damage to every foe in radius 1. Ignites oil, webs and explosive barrels there.
- **Throw Money At It** `zar_bling_throw` *(starter)* (1 AP, cd 2): Spend 5 gold: hit a foe within 5 for 8/10/12 damage and Dazzle it.
- **Tacky Hex** `zar_hex` (1 AP, cd 2): Hex a foe within 5: it is Vulnerable (+25% damage taken) for its next 2 turns. **III:** Hex a foe within 5 and every foe next to it: they are Vulnerable (+25% damage taken) for their next 3 turns.
- **Bedazzle** `zar_bedazzle` (1 AP, cd 1): Bedazzle an ally within 4: its next damaging skill deals +4/5/6 damage to each foe it hits.
- **Hellish Rebuke** `zar_rebuke` (1 AP, cd 2): Ward himself or an ally within 4 until its next turn: enemies whose attacks hit it take 5/7/9 fire damage.
- **Bling Lasso** `zar_lasso` (1 AP, cd 2): Lash a foe in a straight line within 4/5/5: deal 3/4/5 damage and pull it up to 3/3/4 tiles toward him.
- **Fabulous Strut** `zar_strut` (1 AP, cd 2): Strut up to 3/4/5 tiles in a straight line, leaving fire (2/2/3 rounds) on every tile he leaves.
- **Gold Plating** `zar_gold_plating` (1 AP, cd 2): Spend 6 gold: gold-plate himself or an ally within 4 for 8/10/12 Block.
- **Statue of Me** `zar_statue` (2 AP, 1 charge): Unveil a 12/18/24-HP gold statue of himself within 3. It Taunts foes within 2/2/3 now and whenever his turn starts. Once per combat.
- **Wild Card** `zar_wild_card` (1 AP, cd 1, 2 charges): Set off a Wild Surge (mostly good, sometimes not). 2 uses per combat. **III:** Set off two good Wild Surges. 2 uses per combat.
- *Items*: **Ring of Excessive Bling** (rare trinket): +5% damage. Drip Check counts every 30 gold instead of every 50 (still max +30%). · **Platinum Hellcard** (rare weapon): +10% damage. When the party can't afford one of his gold skills, he pays the missing gold in HP instead (1 HP per gold). · **Shades of Indoor Brilliance** (legendary armor): +6 max HP, +1 armor. Enemies whose attacks hit him are Dazzled.

### Syllamin the Roastmaster General (`syllamin`, he/him)
*Support · debuffs · crowd control* · 20 HP (+3/lvl) · move 5 · armor 0 · init +4 · flags flying
- *Passive* **Heckler**: His damaging skills Roast each foe they hit. At 3 Roasted the foe suffers Emotional Damage: the stacks clear, it is Stunned (elites and bosses: Weakened for 2 turns instead) and the party gains 6 Hype.
- **Your Mom Joke** `syl_basic` *(basic)* (1 AP): Deal 5 psychic damage to a foe up to 4 tiles away.
- **Diss Track** `syl_signature` *(signature)* (2 AP, 100 Hype): 3 verses: every foe takes 4 psychic damage per verse (12 total). Each verse Roasts.
- **Heckle** `syl_heckle` *(starter)* (2 AP, cd 2): Deal 4/5/6 psychic damage to a foe up to 4/4/5 tiles away and Charm it: on its next turn it fights for your side.
- **Power Ballad** `syl_power_ballad` *(starter)* (1 AP, cd 2): You and allies within 2 tiles are Inspired (+25% damage) for 1 turn. **III:** You and allies within 3 tiles are Inspired (+25% damage) for 2 turns.
- **Hype Man** `syl_hype_man` (1 AP, cd 2→1): An ally up to 5 tiles away gains 1/1/2 AP on its next turn and is Empowered (its next damaging skill deals +50%).
- **Discordant Shriek** `syl_shriek` (2 AP, cd 2): Deal 4 psychic damage to foes in a 2-deep cone and push them 1 tile away. **III:** Deal 6 psychic damage to foes in a 3-deep cone and push them 2 tiles away.
- **Glitter Bomb** `syl_glitter_bomb` (2 AP, cd 2): Dazzle foes in radius 1/1/2 and leave slippery Glitter there for 2/3/3 rounds (not over other surfaces).
- **Lullaby of Mediocrity** `syl_lullaby` (2 AP, cd 3): Foes in radius 1 fall Asleep for 1 turn (damage wakes them up). **III:** Foes in radius 1 fall Asleep for 2 turns (damage wakes them up) and are Marked 3.
- **Encore!** `syl_encore` (2→1 AP, 2 charges): Reset every skill cooldown of an ally up to 5 tiles away. 2 uses per combat. **III:** Reset every skill cooldown of an ally up to 5 tiles away and it gains 1 AP on its next turn. 2 uses per combat.
- **Fae Blink** `syl_fae_blink` (1 AP, cd 2): Teleport an ally 2-6/7/8 tiles away to a free tile next to you. It gains 3/4/6 Block.
- **Mosh Pit** `syl_mosh_pit` (1 AP, cd 2): Foes within 2 tiles of the target tile take 2 damage and are pulled up to 1 tile toward it. **III:** Foes within 3 tiles of the target tile take 3 damage and are pulled up to 2 tiles toward it.
- **Mic Drop** `syl_mic_drop` (3 AP, 1 charge): Once per combat: deal 15/18/22 damage to a foe up to 4 tiles away (no line of sight needed) and Stun it.
- *Items*: **The Electric Lute** (rare weapon): +10% damage. Your Mom Joke deals lightning damage and electrifies the water its target stands in (it shocks everyone in that water, allies too). · **Tiny Studded Jacket** (common armor): +4 max HP. A foe that damages him from an adjacent tile is Roasted (a comeback). · **Platinum Diss Mixtape** (legendary trinket): +15 Hype at combat start. Each Emotional Damage gives the party 4 more Hype.

### Professor Marbles the Forgetful Fist (`marbles`, he/him)
*Mobile melee skirmisher / control* · 28 HP (+4/lvl) · move 4 · armor 0 · init +2 · flags hop
- *Passive* **Absent-Minded Mastery**: At the start of each of his turns he suddenly remembers one random ready socketed skill: its first use that turn costs 0 AP.
- **Doddering Jab** `mar_jab` *(basic)* (1 AP): Deal 5 damage to an adjacent foe.
- **Forgot I Was Retired** `mar_signature` *(signature)* (2 AP, 100 Hype): Every foe within 3 tiles takes 8 damage and is Stunned (it loses its next turn).
- **Walking Stick Whack** `mar_whack` *(starter)* (1 AP, cd 1): Deal 5/6/7 damage to an adjacent foe and push it 2/2/3 tiles.
- **Marble Scatter** `mar_scatter` *(starter)* (1 AP, cd 2): Scatter marbles on a 5-tile plus for 3 rounds (other surfaces stay). Grounded foes there or moving in slip: Vulnerable for their next turn. **III:** Scatter marbles on a 3x3 square for 4 rounds (other surfaces stay). Grounded foes there or moving in slip: Vulnerable for their next turn.
- **Rabbit Punch** `mar_punch` (2 AP, cd 3→2): Deal 6/8/10 damage to an adjacent foe and Stun it (it loses its next turn).
- **Flurry of Paws** `mar_flurry` (2 AP, cd 1): Strike an adjacent foe 3 times for 3/4/5 damage each (9/12/15 total).
- **Back In My Day...** `mar_backinmyday` (1 AP, cd 2): Gain 4 Block and Taunt adjacent foes: on their next turn they must attack him. **III:** Gain 8 Block and Taunt foes within 2 tiles: on their next turn they must attack him.
- **Lecture** `mar_lecture` (3→2 AP, cd 3): Adjacent foes fall Asleep for 2 turns (damage wakes them). **III:** Foes within 2 tiles fall Asleep for 2 turns (damage wakes them).
- **Carrot Toss** `mar_carrot` (1 AP, 3 charges): Heal an ally within 4 tiles (or himself) for 6/8/10 HP. He packs 3 carrots per fight.
- **Hare-Brained Leap** `mar_leap` (1 AP, cd 2): Leap to an empty tile up to 3 tiles away, over anything. **III:** Leap to an empty tile up to 4 tiles away, over anything. He lands with a THUMP: 3 damage to adjacent foes.
- **Vaudeville Hook** `mar_hook` (1 AP, cd 2): Hook a foe in a straight line 2-3/4/5 tiles away: 3/4/5 damage and yank it next to him.
- **Wax On, Wax Off** `mar_waxon` (1 AP, cd 2): An ally within 3 tiles is Empowered: its next damaging skill deals +50%. **III:** An ally within 5 tiles is Empowered: its next damaging skill deals +50%. It also gets +1 AP on its next turn.
- *Items*: **Cane of Unsolicited Advice** (rare weapon): +10% damage. His pushes move units 1 tile further. · **Robes of Many Pockets** (rare armor): +5 max HP. At the end of each of his turns, Loose Marbles spill onto the 4 tiles around him (other surfaces stay) until the end of the next round. · **Grandpa's Pill Organizer** (legendary trinket): Absent-Minded Mastery remembers 2 skills each turn instead of 1.

### Marwyn the Magnificent (`marwyn`, he/him)
*Tank / bruiser / taunts* · 35 HP (+5/lvl) · move 3 · armor 0 · init +0
- *Passive* **MAGNIFICENCE**: Each of his skills that reaches a foe adds 1 MAGNIFICENCE. At 5, his next skill also unleashes a MAGNIFICENT SURGE (random good wild magic, +10 party Hype, and he heals 8 HP) and resets the meter.
- **Ginger Snap** `mrw_ginger_snap` *(basic)* (1 AP): Deal 5 damage to an adjacent foe.
- **BEHOLD, MARWYN!** `mrw_behold` *(signature)* (2 AP, 100 Hype): EVERY enemy is Taunted and Marwyn gains 15 Block.
- **LOOK AT MARWYN!** `mrw_war_cry` *(starter)* (1 AP, cd 2): Taunt every foe within 2/2/3 tiles and gain 4/6/8 Block.
- **YEET** `mrw_yeet` *(starter)* (2 AP, cd 2): Throw an adjacent friend or foe 3/3/4 tiles away; on a crash, it and what it hits take 6/8/10 damage.
- **Glorious Cleave** `mrw_cleave` (2 AP, cd 1): Deal 5 damage to every foe on the 3 tiles in front of him. **III:** Deal 7 damage to every foe on the 3 tiles in front of him and knock them back 1 tile.
- **Use Your Head** `mrw_headbutt` (2 AP, 2 HP, cd 3→2): Deal 7/8/10 damage to an adjacent foe and Stun it. Costs him 2 HP.
- **Hero Landing** `mrw_hero_landing` (2 AP, cd 2): Leap up to 3/4/5 tiles, then Taunt every foe next to him.
- **Gun Show** `mrw_gun_show` (1 AP, cd 2): Flex: Root every adjacent foe and gain Thorns 2/3/4 (adjacent attackers take 2/3/4 back).
- **Ginger Rage** `mrw_rage` (1 AP, cd 3): Until the end of his next turn, every hit deals 2/3/4 less damage to him. Gain 2 MAGNIFICENCE.
- **Center of Attention** `mrw_magnetism` (3 AP, cd 3): Wild magic: pull every foe within 3/4/4 tiles up to 2/2/3 tiles toward him, then Taunt them.
- **Keg Stand** `mrw_keg_stand` (1 AP, cd 1, 2 charges): Heal 4/6/8 HP and splash water on every tile within 1/1/2 (grounded units there get Wet). 2 kegs per fight.
- *Items*: **Gauntlets of Competitive Yeeting** (rare weapon): +5% damage. YEET throws 2 tiles further. · **Loincloth of Unearned Confidence** (rare armor): +6 max HP. Foes Taunted by Marwyn deal 25% less damage to him. · **Hand Mirror of Self-Admiration** (legendary trinket): His MAGNIFICENT SURGEs unleash two different good wild magic effects instead of one.

### Ellaria the Corgi Whisperer (`ellaria`, she/her)
*Corgi summoner / healer / control* · 26 HP (+4/lvl) · move 4 · armor 0 · init +1
- *Passive* **Pack Leader**: Starts each fight with a corgi. A fallen corgi Inspires the party for their next turn. AVENGE BISCUIT!
- **Thorn Whip** `ell_thorn_whip` *(basic)* (1 AP): Deal 4 damage to a foe and pull it 1 tile toward you.
- **Release the Corgis** `ell_release` *(signature)* (2 AP, 100 Hype): A corgi pounces beside each of up to 6 foes (nearest first), bites it for 6 damage and Taunts it.
- **Summon Corgi** `ell_summon_corgi` *(starter)* (2 AP, cd 3→2): Summon a corgi (HP 8 + your level, Bite 3, Bark taunts). Max 3 corgis. **III:** Summon a corgi (HP 8 + your level, Bite 3, Bark taunts). Max 3 corgis. It acts at once.
- **Healing Spring** `ell_spring` *(starter)* (2 AP, cd 2): Heal allies in radius 1, yourself too if inside, for 5/6/8 HP; puddles (Wet) fill the rest of the area.
- **Entangling Roots** `ell_roots` (2 AP, cd 2): Brambles fill radius 1 for 2/2/3 rounds. Foes caught, and grounded foes entering, take 3/4/5 damage and are Rooted.
- **Barkskin** `ell_barkskin` (1 AP, cd 1): Give yourself or an ally 5/7/9 Block, and Thorns 2/2/3 through their next turn.
- **Who's a Good Boy?** `ell_good_boy` (1 AP, cd 2→1): Heal an ally, a corgi or yourself for 3/5/6 HP and Empower them (next damaging skill +50%).
- **Fetch!** `ell_fetch` (1 AP, cd 2): The corgi nearest the foe dashes in, bites it for 3/4/5 damage and drags it up to 2/3/3 tiles toward you.
- **Zoomies** `ell_zoomies` (2 AP, cd 2): Each foe next to one of your corgis takes 4 damage and is pushed 1 tile away from it. **III:** Each foe next to one of your corgis takes 6 damage and is pushed 2 tiles away from it.
- **The Ol' Switcheroo** `ell_switcheroo` (1 AP, cd 2→1): Swap places with one of your corgis anywhere on the field; the corgi gains 4/6/8 Block.
- **Wild Shape: Absolute Unit** `ell_wildshape` (1 AP, 1 charge): Once per fight: become an immovable giant corgi through your next turn. Thorn Whip becomes Chomp (7 damage, knockback 1). **III:** Once per fight: become an immovable giant corgi through your next 2 turns. Thorn Whip becomes Chomp (10 damage, knockback 1).
- *Items*: **The Good Stick** (rare weapon): +10% damage. Corgi attacks deal +2 damage: Bite, Fetch!, Zoomies and Release the Corgis. · **Robe of Perpetual Shedding** (common armor): +4 max HP. Foes that hit you in melee are Dazzled until the end of their next turn. · **Flower Crown of the Corgi Queen** (legendary trinket): +15% healing. Lost a corgi? A new one bounds in near you at the start of your next turn (up to 3 corgis).

### Josiah the Medically Dubious (`josiah`, he/him)
*Poison healer & raven wrangler* · 26 HP (+4/lvl) · move 4 · armor 0 · init +0 · flags noOpportunity
- *Passive* **Unlicensed Apothecary**: Starts each fight with Onyx, his raven. Poison is contagious: when a Poisoned foe dies, adjacent foes catch all of its Poison. +1 consumable slot.
- **House Call** `jos_cane` *(basic)* (1 AP): Poke a foe up to 2 tiles away with your cane: 4 damage, 6 if it is Poisoned.
- **Pandemic** `jos_pandemic` *(signature)* (2 AP, 100 Hype): Uncork Jar #7: every foe takes 8 poison damage and is Poisoned 4.
- **Plague Flask** `jos_plague_flask` *(starter)* (2 AP, cd 2): Lob a flask: foes in radius 1 take 2/3/4 poison damage and are Poisoned 3/4/5.
- **Mostly Medicine** `jos_draught` *(starter)* (1 AP, cd 1): Toss a potion to an ally within 3 (or drink it yourself): heal 7/9/11 HP.
- **Raven Dive** `jos_raven_dive` (1 AP, cd 1): Onyx (called back if gone) swoops next to a foe within 5 and pecks it for 4/5/6 damage. **III:** … and Dazzles it.
- **Prescribe Leeches** `jos_leeches` (2 AP, cd 2): Deal 6/8/10 damage to a foe within 3 and heal yourself for the HP it lost.
- **Plague Miasma** `jos_miasma` (2 AP, cd 3): Fill radius 1 with Plague Miasma for 2/2/3 rounds: foes inside are Poisoned 2/3/3, and again on each Miasma tile they enter. Flammable.
- **Quarantine** `jos_quarantine` (1 AP, cd 3): A foe within 4 is Rooted for 1 turn and Vulnerable (+25% damage taken) for 2 turns. **III:** A foe within 4 is Rooted for 2 turns and Vulnerable (+25% damage taken) for 3 turns.
- **Vaccinate** `jos_vaccinate` (1 AP, cd 2): Cure an ally within 3 (or yourself) of all debuffs; it is immune to new ones for 1 turn. **III:** Cure an ally within 3 (or yourself) of all debuffs; it is immune to new ones for 2 turns and gains 5 Block.
- **Volatile Brew** `jos_volatile` (2 AP, cd 2): Lob a bomb: every unit in radius 1 takes 5 fire damage (allies too) and is pushed 1 tile outward. **III:** Lob a bomb: every unit in radius 1 takes 7 fire damage (allies too) and is pushed 2 tiles outward.
- **Murder of Crows** `jos_murder` (3 AP, cd 3): Onyx calls the flock: every foe within 2 tiles of him takes 7/9/10 damage. **III:** … and is Marked 3.
- **Smelling Salts** `jos_salts` (1 AP, 1 charge): Revive a downed ally within 4 at 30/40/50% HP. Once per combat.
- *Items*: **Herb-Stuffed Beak Mask** (rare armor): +4 max HP. Every Poison Josiah applies has +1 stack. · **Suspicious Raven Treats** (rare trinket): Onyx, Josiah's raven, has double max HP. · **Portable Alembic** (rare trinket): After every won fight, 50% chance that Josiah brews a random potion for the party (if the bag has room). · **The Plague Bell** (legendary weapon): +10% damage. Contagion reaches every foe within 2 tiles of the dead, not just adjacent ones.

### Sparrow the Hemogoblin (`sparrow`, she/her)
*High-risk bleed assassin* · 22 HP (+3/lvl) · move 5 · armor 0 · init +3
- *Passive* **Blood Price**: Her skills' HP costs are paid by an adjacent Bleeding foe instead of her, when there is one.
- **Shiv Happens** `spa_basic` *(basic)* (1 AP): Deal 4 damage and Bleed 1.
- **Crimson Tide** `spa_signature` *(signature)* (2 AP, 100 Hype): Costs half your current HP. Every foe within 3 tiles takes 16 damage and gains Bleed 3.
- **Hemo-Glob** `spa_hemoglob` *(starter)* (1 AP, 2 HP, cd 1): Lob blood at a foe within 5: deal 6/8/9 damage and Bleed 1/1/2.
- **Juice Box** `spa_juicebox` *(starter)* (2 AP, cd 2): Drain a foe within 3: deal 5/7/8 damage +3/3/4 per Bleed on it, and heal the damage dealt.
- **Thousand Paper Cuts** `spa_papercuts` (2 AP, 2 HP, cd 2): Blood confetti on a tile within 4: every foe in radius 1 takes 4/5/6 damage and gains Bleed 2/2/3.
- **Say It, Don't Spray It** `spa_spray` (2 AP, 2 HP, cd 2): Spray a cone of length 2/2/3: foes take 4/5/6 damage and are Dazzled (their next attacks land 1 tile off).
- **Scab Armor** `spa_scab` (1 AP, 3 HP, cd 2): Gain 8 Block. **III:** Gain 10 Block, plus Thorns 3 until the end of your next turn.
- **Goblin Mode** `spa_goblinmode` (1 AP, cd 3): Teleport to an empty tile within 4/5/6 and turn Stealthed until the end of your next turn (enemies ignore you).
- **Blood Puppet Show** `spa_puppet` (1 AP, 2 HP, cd 2): Drag every Bleeding foe within 4/5/5 tiles 2/2/3 tiles in the chosen direction.
- **Evil Twin** `spa_twin` (2 AP, 4 HP, cd 1, 2 charges): Summon a Blood Clone (8 HP) within 3; foes next to it are Taunted. 2 per fight. **III:** Summon a Blood Clone (14 HP) within 3; foes within 2 tiles of it are Taunted. 2 per fight.
- **Blood Drive** `spa_blooddrive` (1 AP, 3 HP, cd 2): An ally within 4 heals 4/6/8 HP and is Empowered (its next damaging skill deals +50%).
- **Vein Glory** `spa_veinglory` (3 AP, 4 HP, cd 3): Dart next to a foe within 3 and gut it for 15/19/22 damage.
- *Items*: **Shiv of Sharing** (rare weapon): Every Bleed Sparrow applies is 1 stack stronger. · **Bloodsucker's Bib** (rare armor): Stepping into blood while hurt slurps it up: Sparrow heals 3 HP. · **Organ Donor Card (Not Hers)** (legendary trinket): Sparrow's blood price can be paid by a Bleeding foe up to 3 tiles away.

### Corelos the Undersigned (`corelos`, he/him)
*Rune traps & dark bargains* · 24 HP (+4/lvl) · move 4 · armor 0 · init +1
- *Passive* **Collateral Damage**: Bargains cost Debt, paid in HP at the start of his next turn. Every foe that dies before then pays off 4 of it.
- **Rune Bolt** `cor_rune_bolt` *(basic)* (1 AP): Deal 4 damage. Your runes on or next to the target burst.
- **Read the Fine Print** `cor_fine_print` *(signature)* (2 AP, 100 Hype): Every foe is Stunned: it skips its next turn.
- **Glyph of Warding** `cor_glyph` *(starter)* (1 AP): Inscribe a rune (max 3): when a foe steps on it, foes on and next to it take 5 damage. **III:** Inscribe a rune (max 3): when a foe steps on it, that foe is Rooted and foes on and next to it take 6 damage.
- **Dark Bargain** `cor_bargain` *(starter)* (0 AP, cd 2): Gain 2/2/3 AP. Take 6/4/6 Debt.
- **Runic Detonation** `cor_detonate` (1 AP, cd 1): All your runes burst at once, each dealing +2/3/4 damage.
- **You've Been Served** `cor_served` (1 AP, cd 2): Deal 3/4/6 damage to a foe in a straight line and pull it up to 3/4/4 tiles toward you.
- **Restraining Order** `cor_restraining` (1 AP, cd 2): Deal 2/3/4 damage to each adjacent foe and push it 2/2/3 tiles away.
- **Cease & Desist** `cor_cease` (2→1 AP, cd 3→2): Stun a foe: it skips its next turn.
- **Sign Here, Please** `cor_sign_here` (2 AP, cd 3): Charm a foe (not a boss): on its next turn it fights for you. Take 5 Debt. **III:** Charm a foe (not a boss): on its next 2 turns it fights for you. Take 3 Debt.
- **Soul Contract** `cor_soul_contract` (1 AP, cd 2): Give yourself or an ally 8/11/14 Block. Take 4 Debt.
- **Infernal Lawyer** `cor_lawyer` (2 AP, 1 charge): Summon an Infernal Lawyer (12 HP, flies): Billable Poke deals 3, Objection! taunts. Once per combat. **III:** Summon an Infernal Lawyer (18 HP, flies): Billable Poke deals 5, Objection! taunts. Once per combat. It acts at once.
- **Collect Debt** `cor_collect` (2 AP, cd 2): Deal 7/9/11 damage, +1 per point of your Debt (max +10).
- *Items*: **Quill of Questionable Provenance** (rare weapon): Corelos' runes deal +2 damage. · **Platinum Soul Card** (rare trinket): Every foe that dies pays off 7 of Corelos' Debt (instead of 4). · **Notarized Soul (Photocopy)** (legendary armor): +6 max HP. Once per combat, instead of going down Corelos stays up at half his max HP and takes 10 Debt.

### Slate the Unamused (`slate`, he/him)
*Grappler / thrower / bruiser* · 32 HP (+4/lvl) · move 3 · armor 1 · init -2 · flags immovable
- *Passive* **Short Fuse**: Gains 1 Rage (max 5) whenever someone else hits him, heals him or gives him a buff status (Block doesn't count). At 3+ Rage his runes flare: his skills deal +2 damage.
- **Love Tap** `sla_love_tap` *(basic)* (1 AP): Deal 5 damage to an adjacent foe.
- **Tectonic Tantrum** `sla_tantrum` *(signature)* (2 AP, 100 Hype): The ground heaves: every foe within 2 tiles takes 15 damage and is knocked 2 tiles away from you. Then your Rage maxes out.
- **Hold Still** `sla_hold_still` *(starter)* (1 AP, cd 2): Grab an adjacent foe: 4 damage, and it is Grappled until the end of your next turn (can't move; dragged along when you walk). **III:** Grab an adjacent foe: 6 damage, and it is Grappled until the end of your next 2 turns (can't move; dragged along when you walk). (II: 5 damage. D9: the hold counts Slate's turns; the foe is still held for 1/1/2 of its own turns.)
- **Personal Space** `sla_personal_space` *(starter)* (2 AP, cd 1): Throw an adjacent foe or object up to 3/3/4 tiles: it and the foe it hits take 7/9/11 damage. Objects shatter.
- **Hard Pass** `sla_rocks_fall` (2 AP, cd 2): Lob a boulder up to 5/5/6 tiles, over walls: 7/9/10 damage to the foe or object there. On empty floor, the Boulder stays.
- **Air Mail** `sla_air_mail` (1 AP, cd 2→1): Throw an adjacent ally up to 3/4/4 tiles onto a safe empty tile. Foes next to the landing take 3/4/5 damage.
- **Putting My Foot Down** `sla_foot_down` (2 AP, cd 2): Stomp: foes in a cone of 2 take 4 damage and are pushed 1 tile back. **III:** Stomp: foes in a cone of 3 take 6 damage and are pushed 2 tiles back.
- **Get Off My Lawn** `sla_lawn` (1 AP, cd 2): Yell: every foe within 2/2/3 tiles is Taunted for its next turn, and you gain 4/6/8 Block.
- **Rock Bottom** `sla_rock_bottom` (2 AP, cd 2): Slam an adjacent foe onto the tile behind you (if there's room): 10 damage. **III:** Slam an adjacent foe onto the tile behind you (if there's room): 12 damage, and it is Stunned for its next turn.
- **Blow a Gasket** `sla_gasket` (2 AP, cd 3): Vent all your Rage: every foe in the 8 tiles around you takes 3/5/5 damage + 2/2/3 per Rage spent.
- **Get Over Here** `sla_get_over_here` (1 AP, cd 2): Rune-chain a foe up to 4/5/6 tiles away in a line: 2/3/4 damage, and pull it next to you.
- **Stress Ball** `sla_stress_ball` (1 AP, cd 1): Squeeze the foe you're holding: 3/4/5 damage, and you heal 4/5/6 HP. (D9; only the foe he holds is a target; his own heal gives no Rage.)
- *Items*: **Mitts of Unreasonable Velocity** (rare weapon): +10% damage. Personal Space and Air Mail throw 1 tile further. · **Cardigan of Disapproval** (rare armor): +6 max HP. Slate gains 2 Block for every Rage he gains. · **The Grudge Ledger** (legendary trinket): +10% damage. Short Fuse gives Slate 2 Rage instead of 1 (every grudge is recorded twice).

### Mayor Buga the Toast of the Town (`buga`, he/him)
*Support · manipulator · loot* · 24 HP (+4/lvl) · move 4 · armor 0 · init +0
- *Passive* **Skimming Off the Top**: Whenever an ally (or a foe he bribed) defeats an enemy while Buga stands, he takes the credit: +2 gold.
- **Campaign Pamphlet** `buga_pamphlet` *(basic)* (1 AP): Deal 4 damage to a foe within 4 tiles.
- **Toast of the Town** `buga_toast_of_the_town` *(signature)* (2 AP, 100 Hype): Point at a foe within 6 tiles: every ally who can hit it makes 2 free basic attacks on it.
- **Delegate** `buga_delegate` *(starter)* (1 AP, cd 2→1): Point at a foe within 6 tiles: the best-placed ally makes a free basic attack on it. **III:** Point at a foe within 6 tiles: the 2 best-placed allies make free basic attacks on it.
- **Loitering Fine** `buga_fine` *(starter)* (1 AP, cd 1): Deal 4/5/6 damage to a foe within 3 tiles and pocket 2/2/3 gold.
- **Campaign Promise** `buga_promise` (0 AP, cd 3→2): An ally within 5 tiles gains 1/1/2 AP on its next turn.
- **Human Shield** `buga_human_shield` (1 AP, cd 2): Swap places with an ally within 3/4/5 tiles; it gains 4/6/8 Block.
- **Bribe** `buga_bribe` (1 AP, cd 3): Pay 10 gold to Charm a foe within 3 tiles (not a boss): on its next turn it fights for you. **III:** Pay 8 gold to Charm a foe within 4 tiles (not a boss): on its next 2 turns it fights for you.
- **Butter Up** `buga_butter_up` (1 AP, cd 2→1): An ally within 3 tiles is Empowered: its next damaging skill deals +50%. **III:** An ally within 5 tiles is Empowered: its next damaging skill deals +50%, and it is Inspired (+25% damage) through its next turn.
- **Red Tape** `buga_red_tape` (1 AP, cd 2): Pull a foe 2-4/4/5 tiles away up to 2/3/4 tiles toward Buga and Root it for its next turn.
- **Photo Op** `buga_photo_op` (1 AP, cd 2): Allies within 2 tiles are Inspired (+25% damage) through their next turn. **III:** Allies within 3 tiles are Inspired (+25% damage) through their next turn; +3 Hype for each of them.
- **Pork Barrel** `buga_pork_barrel` (2 AP, cd 1, 2 charges): Plant a Pork Barrel within 4 tiles. It explodes at round end, or when hit or lit: 8 fire damage within 1 tile. **III:** Plant a Pork Barrel within 4 tiles. It explodes at round end, or when hit or lit: 12 fire damage within 1 tile, +3 gold.
- **Crumb Trail** `buga_crumbs` (1 AP, cd 2): Scatter flammable crumbs on the bare floor of a 5/9/9-tile cross within 4 for 3/3/5 rounds: grounded foes there are Slowed (−2 move).
- *Items*: **Mightier-Than-the-Sword Pen** (rare weapon): +10% damage. Campaign Pamphlet also Marks its target: the next hit it takes deals +2 damage. · **Chain of Office (Gold-Plated)** (rare trinket): +10 Hype at combat start. Skimming Off the Top pays 3 gold per credit instead of 2. · **The Re-Election Toaster** (legendary armor): +6 max HP, +1 armor. Once per combat, when Buga goes down he pops right back up with 50% HP. Ding!

### Kiri the Half-There (`kiri`, she/her)
*Ranged precision & ethereal mobility* · 24 HP (+4/lvl) · move 4 · armor 0 · init +3
- *Passive* **Between Worlds**: Kiri's own skills ignore line of sight: walls, pillars, trees and smoke don't stop her. She aims through the ethereal plane.
- **Ghost Arrow** `kir_basic` *(basic)* (1 AP): Deal 5 damage to a foe within 5, through walls and cover.
- **Rain from the Other Side** `kir_signature` *(signature)* (2 AP, 100 Hype): Deal 16 damage to every foe within 2 of a tile within 6, ignoring Block and armor.
- **Phase Shot** `kir_phase` *(starter)* (1 AP, cd 1): Deal 4/5/6 damage to every foe in a straight line of 5 tiles, through walls and units.
- **Ethereal Step** `kir_step` *(starter)* (1 AP, cd 1): Teleport to an empty tile up to 3/4/5 tiles away in a straight line, through walls and units.
- **Spirit Mark** `kir_mark` (1 AP, cd 1): Mark a foe within 6: the next damage it takes is +5/7/9.
- **Pinning Shot** `kir_pin` (2 AP, cd 2): Deal 7 damage to a foe within 5 and Root it for its next turn. **III:** Deal 10 damage to a foe within 5 and Root it for its next 2 turns.
- **Banishing Shot** `kir_banish` (1 AP, cd 2): Deal 3/4/5 damage to a foe within 4 and push it 2/2/3 tiles away from Kiri.
- **Haunted Volley** `kir_volley` (2 AP, cd 2): Deal 4/5/6 damage to every foe within 1 of a tile within 5.
- **Arrow from Beyond** `kir_beyond` (3 AP, cd 2): A foe within 7 takes 18/22/26 damage at the start of Kiri's next turn, wherever it is.
- **Fade Out** `kir_fade` (1 AP, cd 3→2): Kiri is Stealthed until the end of her next turn: enemies ignore her. **III:** Kiri is Stealthed until the end of her next turn: enemies ignore her, and she sheds her debuffs.
- **Mist Opportunity** `kir_mist` (1 AP, cd 3): Ghost mist blocks line of sight around a tile within 5 (radius 1/1/2, for 2/3/3 rounds, not over other surfaces).
- *Items*: **Ghostwood Longbow** (rare weapon): +10% damage. +1 range to skills with a range of 2 or more. · **"Hello, I'm the Elf One" Name Tag** (rare trinket): +2 initiative, +4 max HP. · **Cloak of Being Somewhere Else** (legendary armor): +6 max HP, +1 armor. Ethereal Step costs 0 AP.

### Betty the G.O.A.T. (`betty`, he/him)
*Frontline charger / knockback / holds the line* · 32 HP (+4/lvl) · move 4 · armor 0 · init +1 · flags hop
- *Passive* **Eats Anything**: Whenever Betty kills a foe or one of his skills breaks an object, he eats it and heals 4 HP. Don't ask.
- **The Family Hammer** `bet_family_hammer` *(basic)* (1 AP): Deal 5 damage to an adjacent foe or breakable object.
- **G.O.A.T.** `bet_goat` *(signature)* (2 AP, 100 Hype): Charge up to 6 tiles in a straight line, right through every foe in the way: each takes 15 damage and is Stunned.
- **Ramming Speed!** `bet_ram` *(starter)* (2 AP, cd 2): Charge up to 3/3/4 tiles in a straight line, through allies. The first foe in the way takes 6/8/9 damage and is pushed 2/2/3 tiles.
- **Butt Out** `bet_headbutt` *(starter)* (2 AP, cd 3→2): Deal 6/7/9 damage to an adjacent foe and Stun it (it skips its next turn).
- **Head Over Heels** `bet_horn_toss` (1 AP, cd 2): Flip an adjacent foe over Betty onto the tile behind him. It is Vulnerable (+25% damage taken) for 1 turn. **III:** Flip an adjacent foe over Betty onto the tile behind him. It takes 5 damage and is Vulnerable (+25% damage taken) for 2 turns.
- **Bleat of Defiance** `bet_bleat` (1 AP, cd 2→1): BAAAH! Every foe within 2/3/3 tiles is Taunted: on its next turn it must attack Betty.
- **Stomping Grounds** `bet_stomp` (2 AP, cd 2): Deal 4/5/6 damage to every foe on the 8 tiles around Betty and Slow them (−2 move on their next turn).
- **Goat Yoga** `bet_goat_yoga` (1 AP, cd 2): Betty or an adjacent ally gains 6/8/10 Block (until the start of its next turn).
- **Five-Second Rule** `bet_snack` (1 AP, cd 3): Betty eats something off the floor: heal 6 HP. **III:** Betty eats something off the floor: heal 8 HP and remove one debuff (he eats that too).
- **Mountain Goat** `bet_mountain_goat` (1 AP, cd 2): Leap to an empty tile up to 3/4/5 tiles away, whatever its height and whatever is in between.
- **Kick 'Em While They're Down** `bet_kick` (1 AP, cd 1): Deal 5/6/7 damage to an adjacent foe, or 10/12/14 if it is Stunned or Rooted (asleep, frozen and held count too).
- **You Shall Not Pasture!** `bet_pasture` (1 AP, cd 1): Until his next turn, Betty's attacks of opportunity deal +3/5/7 damage and Root the foe where it stands.
- *Items*: **Great-Grandma Betty's Mallet** (rare weapon): +10% damage. Betty's pushes go 1 tile further. · **Breastplate That Says BETTY** (rare armor): +6 max HP and +1 armor. · **Championship Cowbell** (legendary trinket): Once per turn, when Betty kills a foe, he gains 1 AP (a kill outside his turn: +1 AP on his next turn).

### Basanos the Mostly Housebroken (`basanos`, he/him)
*Melee in two forms: swordsman and werewolf* · 28 HP (+4/lvl) · move 4 · armor 0 · init +2
- *Passive* **Hair Trigger**: When damage leaves him below half HP, he turns into the werewolf for free (+2 move, Claw basic attack, wolf skills). Sorry in advance.
- **Silvered Sword** `bas_sword` *(basic)* (1 AP): Human form: deal 5 damage to an adjacent foe.
- **Blood Moon** `bas_blood_moon` *(signature)* (2 AP, 100 Hype): Become the werewolf and maul every foe within 2 tiles: 14 damage and 3 Bleed each.
- **Transform** `bas_transform` *(starter)* (1 AP): Switch between human and werewolf. Your first Transform each turn heals you 2/3/4 HP. Werewolf: +2 move; basic attack Claw (4/5/5 damage, 1/1/2 Bleed). (D9; in a fight the desc adds "(used this turn)" once the heal is spent; Hair Trigger and Blood Moon never heal.)
- **Shoulder Check** `bas_shoulder_check` *(starter)* (1 AP, cd 1): Human form: deal 5 damage to an adjacent foe and push it 1 tile. **III:** Human form: deal 7 damage to an adjacent foe and push it 2 tiles.
- **Silver Slash** `bas_silver_slash` (2 AP, cd 1): Human form: deal 8 damage to an adjacent foe; it is Vulnerable for 1 turn. **III:** Human form: deal 12 damage to an adjacent foe; it is Vulnerable for 2 turns.
- **Hold the Line** `bas_hold_the_line` (1 AP, cd 2): Human form: Taunt every foe within 2/2/3 tiles for 1 turn and gain 4/5/6 Block.
- **Step In** `bas_step_in` (1 AP, cd 2): Human form: swap places with an ally within 3/4/5 tiles and gain 4/5/6 Block.
- **Rend** `bas_rend` (1 AP, cd 1): Werewolf form: deal 3/4/5 damage to an adjacent foe and apply 3/4/5 Bleed.
- **Pounce** `bas_pounce` (2 AP, cd 3): Werewolf form: leap next to a foe within 3/4/5 tiles, deal 4/6/8 damage and Stun it.
- **Howl** `bas_howl` (1 AP, cd 3): Werewolf form: you and allies within 2 tiles are Inspired (+25% damage) for 1 turn. **III:** Werewolf form: you and allies within 3 tiles are Inspired (+25% damage) for 2 turns.
- **Savage Bite** `bas_savage_bite` (2 AP, cd 1): Werewolf form: deal 9/11/13 damage to an adjacent foe. If that kills it, heal 6/8/10.
- **Frenzy** `bas_frenzy` (2 AP, cd 2): Werewolf form: deal 4/5/6 damage and apply 1/1/2 Bleed to every adjacent foe.
- *Items*: **Flea Collar** (rare trinket): Your first Transform each turn costs 0 AP. · **Wolfsbane-Lined Coat** (rare armor): +4 max HP. When Transform turns you back into a human, gain 5 Block. · **Moonfang** (legendary weapon): +10% damage. The Bleed your skills apply is doubled.

### Valdris the Well-Conditioned (`valdris`, he/him)
*Forge support / frontline buffer* · 28 HP (+4/lvl) · move 3 · armor 1 · init +0
- *Passive* **Strike While the Iron's Hot**: Valdris deals +3 damage to Burning foes, attacks of opportunity included.
- **Percussive Maintenance** `val_basic` *(basic)* (1 AP): Deal 5 damage to an adjacent foe.
- **Divine Forge** `val_signature` *(signature)* (2 AP, 100 Hype): Valdris and every ally deal +3 damage with every hit until the end of their next turn, and gain 8 Block.
- **Flame-Forged Edge** `val_flame_edge` *(starter)* (1 AP, cd 1): Valdris or an ally within 3: its next damaging skill sets each foe it hits Burning 3/4/5.
- **Forge Armor** `val_forge_armour` *(starter)* (1 AP, cd 1): Valdris or an ally within 3 gains 6/8/10 Block (until the start of its next turn).
- **Forge Weapon** `val_forge_weapon` (1 AP, cd 1): An ally within 3 deals +2/3/4 damage with every hit until the end of its next turn.
- **Spiked Pauldrons** `val_spiked` (1 AP, cd 1): Valdris or an ally within 3 gains Thorns 3/4/5 through its next turn: adjacent attackers that hurt it take 3/4/5.
- **Temper** `val_temper` (1 AP, cd 2→1): Valdris or an ally within 3 sheds all its debuffs. **III:** Valdris or an ally within 3 sheds all its debuffs and heals 5 HP.
- **Hammer of Faith** `val_hammer_faith` (2 AP, cd 1): Deal 7/9/11 damage to an adjacent foe and push it 2/2/3 tiles away.
- **Molten Spray** `val_molten` (2 AP, cd 2): Deal 4/5/6 fire damage and Burn 2/2/3 to every foe in a cone 2 tiles deep. Ignites oil and explosive barrels.
- **Anvil Drop** `val_anvil` (3 AP, cd 3): A holy anvil falls on a foe within 4: 10/13/16 damage, and it is Stunned (loses its next turn).
- **Hair Flip** `val_hair_flip` (1 AP, cd 3→2): Valdris flips his glorious hair: foes within 1/1/2 are Dazzled through their next turn.
- *Items*: **"Kiss the Smith" Apron** (rare armor): +6 max HP, +1 armor. Valdris takes half damage from fire. · **Forge-Proof Conditioner** (rare trinket): +2 initiative, +4 max HP. · **Brightforge, the Unreasonably Large Hammer** (legendary weapon): +10% damage. Flame-Forged Edge costs 0 AP.

### Hjalmar the Menace (`hjalmar`, he/him)
*Trapper & trickster* · 22 HP (+3/lvl) · move 5 · armor 0 · init +4 · flags hop
- *Passive* **Monkey Business**: Every time a foe springs one of Hjalmar's traps, the party gains 5 Hype. The crowd loves a pratfall.
- **Coconut Toss** `hja_basic` *(basic)* (1 AP): Deal 4 damage to a foe within 4.
- **Prank War** `hja_signature` *(signature)* (2 AP, 100 Hype): Every foe within 2 of a tile within 5 takes 8 damage and slips: it can't act until the end of its turn.
- **Banana Peel** `hja_peel` *(starter)* (1 AP, cd 3→2): Set a banana peel within 3/4/4: the first foe to step on it slips and can't act until the end of its turn.
- **Bear Trap** `hja_bear_trap` *(starter)* (1 AP, cd 1): Set a bear trap within 3: the first foe to step on it takes 5/7/9 damage and is Rooted through its next turn.
- **Whoopee Cushion** `hja_cushion` (1 AP, cd 2→1): Set a whoopee cushion within 3: the first foe to step on it is Taunted by Hjalmar through its next turn. **III:** Set a whoopee cushion within 3: the first foe to step on it is Taunted by Hjalmar through its next 2 turns.
- **Paint Bucket** `hja_paint` (1 AP, cd 2→1): Set a paint bucket within 3: the first foe to step on it is Dazzled through its next turn. **III:** Set a paint bucket within 3: the first foe to step on it is Dazzled through its next 2 turns.
- **Firecracker Bundle** `hja_firecracker` (2 AP, cd 2): Set a firecracker bundle within 3: when a foe steps on it, every foe within 1 takes 6/7/9 fire damage.
- **Spring Glove** `hja_glove` (1 AP, cd 2→1): Set a spring glove within 3, aimed away from Hjalmar: the first foe to step on it is knocked 2/3/3 tiles that way.
- **Pickpocket** `hja_pickpocket` (1 AP, cd 2): Steal 3 gold from an adjacent foe; it is Weakened through its next turn. **III:** Steal 5 gold from an adjacent foe; it is Weakened through its next 2 turns.
- **Swing Away** `hja_swing` (1 AP, cd 2→1): Leap to an empty tile within 3/4/5 that Hjalmar can see.
- **Bait and Switch** `hja_switch` (1 AP, cd 3→2): Swap places with a foe within 2/3/4.
- *Items*: **Coconut of Unusual Size** (rare weapon): +10% damage. Coconut Toss knocks its target 1 tile away from Hjalmar. · **Greased Fur Pomade** (rare trinket): +1 move. Hjalmar can't be opportunity-attacked. · **Bottomless Sack of Props** (legendary armor): +6 max HP. The first trap Hjalmar sets each turn costs 0 AP. · **Canned Laughter** (rare trinket): Whenever a foe springs one of Hjalmar's traps, he heals 4 HP.

### Pebbles the Goodest Boy (`pebbles`, he/him)
*Melee skirmisher & fire control* · 26 HP (+4/lvl) · move 5 · armor 0 · init +3 · flags immune
- *Passive* **Hot Dog**: Pebbles is made of fire: fire damage and Burn can't hurt him, and ending his turn on fire or lava heals him 3 HP.
- **Spicy Nibble** `peb_basic` *(basic)* (1 AP): Deal 4 damage to an adjacent foe and Burn 1.
- **Hot Diggity Dog!** `peb_signature` *(signature)* (2 AP, 100 Hype): Deal 16 damage to every foe within 2 tiles. Pebbles and every ally are Inspired until the end of their next turn.
- **Hot Zoomies** `peb_zoomies` *(starter)* (1 AP, cd 2): Dash up to 4/5/6 tiles, leaving fire (2/2/3 rounds) on every tile Pebbles leaves, except under allies.
- **Fetch Quest** `peb_fetch` *(starter)* (1 AP, cd 2): Deal 3/4/5 fire damage to a foe 2-4/4/5 tiles away and pull it 2/2/3 tiles toward Pebbles.
- **Chew Toy** `peb_chew_toy` (2 AP, cd 1): Deal 7/9/11 damage to an adjacent foe and Root it for its next turn.
- **Big Wag** `peb_wag` (2 AP, cd 2): Deal 4 fire damage to every adjacent foe and push each 1 tile away from Pebbles. **III:** Deal 6 fire damage to every adjacent foe and push each 2 tiles away from Pebbles.
- **Bork!** `peb_bork` (1 AP, cd 3→2): Every foe within 2/3/3 tiles is Taunted: on its next turn it must attack Pebbles.
- **Emotional Support Dog** `peb_support` (1 AP, cd 2): An adjacent ally heals 4/6/8 HP and is Inspired (+25% damage) until the end of its next turn.
- **This Is Fine** `peb_this_is_fine` (1 AP, cd 3): Set Pebbles' tile and every tile within 1/1/2 on fire for 2/3/3 rounds, except under allies.
- **Bark-B-Q** `peb_bbq` (2 AP, cd 3): Deal 6/8/10 fire damage to every Burning foe within 3 tiles.
- **Puppy Eyes** `peb_puppy_eyes` (2 AP, cd 4→3): Charm a foe within 3/4/4 (not a boss): on its next turn it fights for your side.
- *Items*: **Chewed-Up Fire Extinguisher** (rare weapon): +10% damage. Spicy Nibble Burns 2 instead of 1. · **Fireproof Dog Bed** (rare armor): +6 max HP, +1 armor. Hot Dog heals 5 instead of 3. · **Collar of the Eternal Flame** (legendary trinket): +4 max HP. Once per fight, when Pebbles would go down, he flares back up at 8 HP instead.


---------------------------------------------------------------------------------------------------------------------

## 3. Whole-campaign sims (re-measured by the balance audit, Nov 14; the release gate's final check in §3.0)

### 3.0 Release gate (Nov 14, the shipped files): the final numbers

The last check before release, on the files with the finish run landed (Lich Late Fees capped at 12 and ×1.3 HP, Dr.
Iris closing at round 10 and ×1.1 HP, the DM's "Fudged in Your Favour", Slate move 4, Ultra Instinct's estimate hook,
AutoPlay's break-out / split / hold fixes). Stock `tools/sim.sh`, fresh seeds, one headless Chrome at a time; reports in
`.tmp/wf12/gate/`: **N** normal `seeds=300&from=9000` (2,985 fights) · **A1** normal act 1 only `seeds=300&from=9300&stop=1`
(1,410) · **C** casual `seeds=120&from=9000` (1,649) · **B** brutal `seeds=120&from=9000` (821). All 6,865 fights:
**0 errors, 0 round-cap stalls, 0 `DD.warn` lines**. Act 1 rows pool N + A1 (549 boss fights, 2,009 regular fights).

| target | the audit (§3.1-3.6) | release gate | |
|---|---|---|---|
| campaign normal 30-40% | 32.8% (400) | **30.7%** (92/300, CI 26-36; X 12.8% / H 50.0%) | PASS |
| campaign casual 65-80% | 80.5% (200; 76.6% of 700) | **83.3%** (100/120, CI 76-89; X 73% / H 95%) | MISS (+3, top edge; z 0.8 vs the audit) |
| campaign brutal 5-15% | 10.5% (800) | **13.3%** (16/120, CI 8-21; X 3% / H 24%) | PASS |
| act 1 bosses 60-70% | 70.0% (756) | **73.2%** (402/549; Grimble 70.0%, Rat King 76.6%) | MISS (+3.2; z 1.3 vs the audit) |
| act 1 bosses without a starting healer ≥ 55% | 58.0% | **62.1%** (157/253) | PASS |
| act 1 bosses with one ≤ ~80% | 82.5% | **82.8%** (245/296) | MISS (soft cap, as before) |
| act 1 regular fights won 95%+ | 98.0% | **97%** (N 97.1% of 1,015 · A1 97% of 994) | PASS |
| act 1 regular fights: party HP lost ~20-30% | 17-18% net / 27-28% gross | **18% net / 29% gross** | MISS net / PASS gross (as before) |
| act 1 regular fights: a down in ~25-40% | 27.0% | **29%** (both batches) | PASS |
| act 2 regular fights: a down in ~50-60% | 48.0% | **46%** (599) | MISS (−4, as before) |
| act 2 elites won 75-85% | 91.7% | **93%** (103) | MISS (over, as before) |
| act 2 bosses 65-80% | Lich 79.0%, Iris 83.7% | **Lich 84.5%** (71/84), **Iris 82.6%** (71/86) | MISS (Lich +4.5, z 1.2; Iris as before) |
| the DM 60-75% | 76.7% | **71.9%** (92/128) | PASS |
| heroes 0.6-1.5× the median | Ellaria 2.06× … Slate 0.54× | median 27%: Ellaria 2.22×, Syllamin 1.63×, Josiah 1.59×, Zarathor 1.52× · lowest Slate 0.67×, Hjalmar 0.74× (n 61-89 a hero) | MISS (high side only; nobody under 0.6×) |
| unspent gold under ~150 | DM start median 136 / avg 187 | DM start avg 196; end of run median 147 (avg 185) | mean MISS (as before) |
| shops worth a visit | 1.7 visits, ~213 spent | 1.6 visits, 214 spent | PASS |
| no generic party heal (D9) | the Bucket only | the Bucket only (`DD.Balance.start`) | PASS |

**Drift since the audit: none beyond noise.** Every gap is under 2σ against the audit's own batches. The act 1 bosses
are the one number that crossed a range edge (70.0% → 73.2%): every fresh post-finish batch reads 71-77% (the four pooled:
73.5% of 1,027, z 1.6), while the review's paired batch on the audit's own seeds reads 70.0% (audit 69%). So the shift
is seed spread plus at most a point or two from the finish run's AutoPlay fixes (it now pushes the Rat King past his
split) and Slate's move 4 (healer-less parties gained the most: 58 → 62%). AutoPlay dodges nearly every boss wind-up, so
these boss rates are ceilings for human play. Left for the lead and the playtest; no number was moved.

`tools/sim.sh` (`tests/sim/sim.js`) plus the balance passes' read-only add-ons (`.tmp/bal3/split.js`: every fight kind
split by a starting healer; `.tmp/bal3/econ.js`: shops and gold). Random 4-hero parties from all 16 heroes; DD.Run +
DD.AutoPlay play the whole run (items, consumables, Blessings, events, shops, taverns; smart route). These numbers
replace the integrator's Nov 5 tables: since then D9 (no starting heal; character-linked sustain), the act 1 rows, the
late-boss rows, the economy, the brutal row and the Rat King row landed (`docs/notes/balance.md`, the sustain refits
1-3 and the "Balance audit"). Every batch below ran on fresh seeds; reports in `.tmp/audit/runs/`. **H** = a party with
Ellaria or Josiah (the two heroes who start with an ally heal), **X** = a party with neither (~55% of random parties).
AutoPlay is a decent but not a great player: it dodges almost every boss wind-up and solves boss puzzles from exact
hints (boss rates are ceilings), but it almost never fires signatures, rarely plays setup skills and learns the first
offered pool skill (the party is underplayed).
Stalls (audit-4, fixed Nov 14): the audit's sim still counted a fight that hit the 30-round cap as a win — 3 of about
11,600 fights, so every rate below moves by under 0.1 point. `tests/sim/sim.js` now reports them as stalls: neither a
win nor a loss in any rate, a run whose result hangs on one is a "stalled run", and the "== stalls" section lists each.

### 3.1 Campaign outcome by difficulty (the current files)
| difficulty | runs | campaign wins | X / H | act 1 cleared | act 2 cleared (of entered) | act 3 cleared | levels at bosses (act 1/2/3) |
|---|---|---|---|---|---|---|---|
| casual | 200 | **80.5%** (CI 74-85; 76.6% over all 700 casual runs since refit 3) | 67% / 95% | 93% | 92% | 94% | — |
| **normal** | 400 | **32.8%** (CI 28-37) | 19% / 49% | **67%** | 69% | 70% | 2.0 / 3.2 / 4.5 |
| normal, act 1 only | 400 | — | — | **65%** | — | — | 2.0 |
| brutal | 200 (+ 600 before the Rat King row) | **8.5%** (10.5% over 800) | 2% / 19-24% | 35-43% | 47-50% | 49-58% | — |

Targets: normal 30-40%, casual 65-80%, brutal 5-15%. Before the Rat King row (800 normal runs) the campaign was 29.6%.

### 3.2 Bosses (normal; act 1 = 756 fights on the current files, acts 2-3 = 1,200 runs)
| boss | all parties | with a starting healer | without | rounds | downs a fight | target |
|---|---|---|---|---|---|---|
| Grimble | **69.6%** | 80.5% | **58.5%** | 7.6 | 2.5 | 60-70%, X ≥ 55, H ≤ ~80 |
| Rat King (×0.9 HP row) | **70.3%** | 85.5% | **57.0%** (51% before the row) | 8.1 | 2.5 | same |
| Lich-tenstein | 79.0% | 82.6% | 72.4% | 10.3 | 3.5-3.8 | 65-80% |
| Dr. Iris | 83.7% | 86.3% | 79.3% | 11.4 | 1.9-2.0 | 65-80% |
| Dungeon Master | 76.7% | 80.9% | 65.0% | 9.4 | 2.3-2.5 | 60-75%, the hardest |

Parties reach every boss at ~87% HP. Casual: act 1 bosses 93%, act 2 95%, the DM 95%. Brutal: act 1 bosses 49-61%
(X 38-44%), act 2 bosses 77-81%, the DM 71-79%.

### 3.3 By fight kind (normal; act 1 on the current files, acts 2-3 over 1,200 runs)
| kind | win (X / H) | HP lost net (gross) | rounds | fights with downs (X / H) | downs/fight | signatures/fight | Hype reached 100 |
|---|---|---|---|---|---|---|---|
| act 1 normal | 98% (97 / 99.5) | 18% (28%) | 4.9 | **27%** (36 / 18); the run's first fight 15% | 0.51 | 0.18 | 30% |
| act 1 elite | 98.5% | 16% (31%) | 6.5 | 26% | 0.49 | 0.01 | 2% |
| act 1 boss | 70% (58 / 82.5) | 53% (72%) | 7.9 | 78% | 2.5 | 0.04 | 13% |
| act 2 normal | 96% (92 / 98) | 19% (41%) | 5.9 | 48% (65 / 38) | 1.09 | 0.15 | 26% |
| act 2 elite | 92% (82 / 96) | 20-22% (49-53%) | 7.6 | 56% | 1.6 | 0.3 | 34% |
| act 2 boss | 81% (76 / 84) | 48-51% (87%) | 10.7 | 77% | 2.7 | 0.05 | 8% |
| act 3 normal | 97% (94 / 98) | 16% (36%) | 5.5 | 43% | 0.87 | 0.03 | 9% |
| act 3 elite | 97% | 9-13% (33-41%) | 7.3 | 40% | 0.9 | 0.03 | 8% |
| act 3 boss (the DM) | 77% (65 / 81) | 43-47% (72-74%) | 9.3 | 72% | 2.4 | 0.01 | 1-4% |

Attacks of opportunity stay a deterrent: per normal fight ~0.15 by heroes and ~0.3 by enemies (1.5-2 damage). Boss
wind-ups: ~6 a fight in act 1, ~21 at the act 2 bosses, ~7.5 at the DM; AutoPlay steps out of nearly all of them.

### 3.4 Encounters (normal, the 400-run batches; win · party HP lost · downs per fight)
- Act 1 normal: slime_time, rats_in_the_cellar, big_flush, web_of_lies 99-100% · 5-12% · 0.0-0.7; fungus 99% · 14% ·
  0.3; goblin_ambush 99% · 35% · 0.7; **open_mic 95% · 24% · 1.2; union_meeting 92% · 28-33% · 1.5-1.7** (most of the
  act 1 regular-fight losses).
- Act 1 elite: cube 100%, mimic 99%, last_call 98% (12-21% HP lost, 0.1-0.8 downs).
- Act 2 normal: 89-98%; follow_the_lights the hardest (89-93%, 1.6-1.8 downs), forbidden_buffet the gentlest (6% HP).
- Act 2 elite: **office_hours 81-83%** (2-2.6 downs), mama_bear 92-97%, tenure_review 91-92%, its_alive 97-100%.
- Act 3 normal: 89-100% (intern_orientation 89-90% the hardest). Act 3 elite: 94-100% (hoarders_lair 100%, 4-7% HP lost).

### 3.5 Hero downs by cause (normal, 400 runs on the current files, share of 4,540 hero downs)
Lich Overdue Notice 9% (30% of them on a hero at 60%+ HP) · goblin grunt Poke 6% · the DM's Fudged Roll 5% · Grimble's
Rubber Stamp 5% · wisp Swamp Gas Zap 4% · Rat King Tangled Tails 4% · skeleton intern Coffee Run 4% · Grimble Garnish
Wages 3% · Rat King gavel 3% · cultist latte 3%. Downs by act: 1,714 / 1,831 / 995.

### 3.6 Heroes (normal; run-win share over 1,200 runs, median 26.6%; per fight from the 400 on the current files)
| hero | run wins (×median) | dmg | taken | heals (self + others) | downs |
|---|---|---|---|---|---|
| `ellaria` | 54.9% (**2.06×**) | 44.0 (+8.6 corgis) | 11.5 | 16.0 | 0.14 |
| `josiah` | 48.2% (**1.81×**) | 37.6 | 13.7 | 20.1 | 0.15 |
| `zarathor` | 45.9% (**1.72×**; 2.2× among X parties) | 66.4 | 12.5 | 1.3 | 0.28 |
| `syllamin` | 35.5% (1.33×) | 50.5 | 11.5 | 0.2 | 0.32 |
| `betty` | 30.3% (1.14×) | 33.2 | 17.9 | 6.2 | 0.22 |
| `valdris` | 29.7% (1.12×) | 28.5 | 14.0 | 0.6 | 0.27 |
| `corelos` | 29.0% (1.09×) | 45.8 | 12.1 | 0.5 | 0.32 |
| `kiri` | 26.7% (1.00×) | 60.9 | 11.8 | 0.8 | 0.26 |
| `buga` | 26.5% (1.00×) | 35.1 | 13.1 | 0.6 | 0.32 |
| `basanos` | 25.7% (0.97×) | 34.1 | 21.7 | 6.6 | 0.37 |
| `pebbles` | 25.6% (0.96×) | 38.4 | 15.1 | 2.4 | 0.28 |
| `marbles` | 25.3% (0.95×) | 37.0 | 18.3 | 2.7 | 0.42 |
| `marwyn` | 24.7% (0.93×) | 28.7 | 23.1 | 4.6 | 0.42 |
| `hjalmar` | 24.3% (0.91×) | 40.1 | 10.7 | 0.5 | 0.29 |
| `sparrow` | 21.6% (0.81×) | 36.6 | 12.0 | 7.3 | 0.38 |
| `slate` | 14.4% (**0.54×**) | 34.9 | 16.2 | 0.8 | 0.28 |

Character-linked sustain (D9), HP a regular / boss fight: Basanos' Transform 5.4 / 8.2 (10.0 / 13.7 wearing the Flea
Collar), Sparrow's Juice Box 5.3 / 8.7, Marwyn's surge 3.1 / 6.9, Hjalmar 4.2 a regular fight wearing Canned Laughter,
Slate 0.6 / 1.0 (Stress Ball is a pool pick AutoPlay rarely takes). Josiah (12.4 / 18.0) and Ellaria (11.2 / 11.9 to
others) stay the healers. Signatures are almost never fired by AutoPlay (0.0-0.2 a fight for every hero).

### 3.7 Gold and loot (normal, per run, the current files)
Earned ~400 gold; two shops on every act map: 1.7 visits a run, ~213 spent, 1-2% of visits buy nothing; gold at the
DM's start median 136 / avg 187 (p75 253, p90 444: ~30% of act 3 runs never pass a shop on AutoPlay's greedy route);
end of run: all 179, lost 132, won 276 (median 229, the DM's 50-70 payout included). The Bucket of Ice Water (every
party's starting revive) is splashed in ~98% of runs.

---------------------------------------------------------------------------------------------------------------------

## 4. Balance observations (balance audit, Nov 14; details and requests in `docs/notes/balance.md` "Balance audit")

**At release (the gate, §3.0).** The audit's picture holds on the shipped files: normal ~31-33%, casual ~80-83%, brutal
~11-13%. The finish run fixed the feel problems the audit left (Lich notices no longer one-shot full-HP heroes: fees cap
at 12; Dr. Iris fights end around round 10; the DM's rolls never take a 75%+ HP hero straight to 0; no round-cap loops in
6,865 gate fights) without moving the difficulty beyond noise. Still for the lead: the act 1 bosses at the top of
60-70% (73% fresh, 70% paired), the late bosses and act 2 elites over their ranges against the campaign target (point 3),
Ellaria (D11), Syllamin, Josiah and Zarathor over 1.5× the median, and Slate (0.67×, up from 0.54×) and Hjalmar at the
bottom.

1. **The healer gap is the one big lever left.** Parties with Ellaria or Josiah overshoot every target and parties
   without undershoot it (act 1 bosses 82.5% / 58%, act 2 elites 96 / 82, the DM 81 / 65, campaign 49% / 19%). Rows move
   both sides about equally, so the act 1 cap (H ≤ ~80%) and floor (X ≥ 55%) can't both hold with a row; the floor was
   put first. D9 / D11 rule out a generic heal and trimming Ellaria; the gap closes only from the heroes' own sustain.
2. **The Rat King was a coin flip for healer-less parties** (51% of 310 fights): his Swelling Ranks punish long fights.
   A ×0.9 HP row (`DD.Balance.encounters.boss_rat_king`) lifted them to 57% on paired seeds and evened out the two act 1
   bosses (~70% each).
3. **The targets conflict at the campaign level** (refit 2's open lead decision): the late bosses (Lich 79%, Iris 84%,
   the DM 77%) and the act 2 elites (92%) sit a few points over their ranges, and moving them in would take the
   campaign (33%) back under 30%.
4. **Slate is the weakest hero** (0.54×; with him in every party the campaign drops from ~25% to 18.5% for the same
   healer mix). Not his sustain (Stress Ball socketed from the start changes nothing in AutoPlay's hands) and not his
   grabs (without them it is worse): tempo and output in acts 2-3. A kit question for his owner and a human playtest.
5. **Zarathor carries healer-less parties** (1.72× overall, 2.2× among X parties, the most damage in the game);
   flagged, not trimmed: a trim costs the X parties first.
6. **Brutal is a mode for parties with a healer** (~2% of healer-less runs won, ~22% with one).
7. **Act 3 elites are trivial** (97%, 9-13% HP lost) and **Lich-tenstein is down-heavy** (3.5-3.8 downs a fight, his
   Overdue Notice 9% of all downs).
8. **AI loops at the round cap** are rare (3 in ~11,600 fights) but real: a lone hero Helping Up a friend the Rat King
   downs again every round; a Hoarder's Lair stall; one DM fight. The audit's sim counted them as wins; since the Nov 14
   finish run it reports them as stalls (neither side of any rate, listed under "== stalls").
9. **No generic heal crept back in** (D9): the kit is the Bucket of Ice Water only; the only generic heal number that
   moved is the Mystery Stew reward (30% → 35%, refit 3, opt-in).

---------------------------------------------------------------------------------------------------------------------

## 5. Open requests (collected from every area's notes; owner → request)

**Open at release (release gate, Nov 14)** — nothing here blocks v2; each is a lead call, a playtest question or polish.
- *Lead / balance (no number moved by the gate)*: the act 1 bosses read 73% on fresh seeds (target 60-70; 70% on the
  audit's paired seeds); the late bosses (Lich 84.5%, Iris 82.6%) and act 2 elites (93%) sit over their ranges against
  the campaign target (refit 2's open decision); casual 83% (top edge); hero spread: Ellaria 2.2× (D11: never trimmed),
  Syllamin 1.6×, Josiah 1.6×, Zarathor 1.5×, Slate 0.67×, Hjalmar 0.74×. The Mystery Stew's 35% is the one generic heal
  number moved since D9 (the audit's note: 30% if D9 is read strictly).
- *Lead / hero owners (design calls)*: Wet pays off only through items and wild surges (heroes-5: a cheap kit lightning
  or frost hit?); Zarathor's starters and Plot Armor (below).
- *UI polish (known, not fixed)*: the rewards line's d4 face "1" reads like "I" in Cinzel; the "Roll for Initiative!"
  button can cover the board's bottom row during deployment (1920×1080, yaw 45); the ✖ on a refused swap often sits half
  under the two sprites; Rocky the Pet Rock's tile inspect quotes the generic rock ("Blocks movement…") although Rocky
  doesn't block; the swap preview doesn't say Slate swapping away frees the foe he holds; D6 (optional): no outline for
  a reachable tile hidden behind an enemy or boss sprite (turning the map uncovers it); hover inspect panels may cover the
  board's edge (temporary panels, the fit ignores them by design).
- *Engine / AutoPlay (optional)*: the Rat King's own `rangedTarget` lacks the default AI's +30 for a fight-ending
  knockout (no loop needs it); review-open-16 (AutoPlay's swap choice ignores dry-run stops; a per-turn telegraph value
  needs a contract change); barks may name heroes who aren't in the party (project-wide convention).
- *Closed by the gate*: DESIGN §4.2 now names Head Over Heels among the D1 opt-outs (docs test: every opt-out named);
  DESIGN §6 Slate's move 4 and Short Fuse wording, §9 the DM's "Fudged in Your Favour"; the act-1 start map's intro box
  no longer covers a node (it did on 40 of 40 start maps at 1280×720; `js/ui/screens/map.js` lays the map out below it
  while it is up; suite `ui: release gate — the act-1 intro box never covers a map node …`).

**Lead (docs, design decisions)** — the Nov 5 docs and content cleanup closed most of this list (§10).
- ~~DESIGN §6 hero briefs still describe v1~~ **Done (Nov 5)**: all 16 briefs follow the registered kits (passive,
  basic, starters, pool, signature, combos; pronouns exact); §3 / §1 / §2 say 16 heroes, §11 lists every hero event.
- ~~Document the attack-of-opportunity details~~ **Done in DESIGN §4.2 (Nov 5)** (melee = max range 1, never tagged
  `ranged`, area skills only if tagged `melee`; no strike on a charmed enemy; aimed at the mover on a friend's tile; a
  mover downed there is moved off; rule hooks once; route ties). ARCHITECTURE §5.1 / §6.2 belong to the engine agent.
- ~~ARCHITECTURE §3.4 / §3.6 / §3.10 / §3.1~~ **Done (Nov 5)**: items `stats.init` and the ignored `stats.block`;
  enemy `init` / `turnsPerRound` / `aiStyle` / `passive`; narration `initiative`, `objective_failed`, `opportunity` and
  the token contract; hero `stats.init`, `resist`, `flags.immune` / `noOpportunity` / `noProvoke`; §1 ownership rows;
  §10.1 `screen=levelup`, `hero=`, `passives=`, `DDdbg.levelUp`. **Still open (render / UI agent, ARCHITECTURE §8)**:
  combat consumes Enter, input guards, `UI.inShowGuard`, long `UI.choice`.
- ~~DESIGN §5 / §9 / §7 / §8 corrections~~ **Done (Nov 5)**: the DM's 400 HP, 20-damage rolls and turn shape (and every
  shipped boss) in §5 and §9; Energy Drink (+2 AP), Tactical Retreat = the generic Disengage, armor wording, no
  combat-start Block, the Overcaffeinated example in §7; the divers and the elite wind-ups in §8.
- ~~Overlapping skills from the briefs~~ **Documented (Nov 5)** as DESIGN §6.1 "Design notes" (no redesign). **Still
  open (design calls)**: Zarathor's starters (Throw Money + Wild Card for the wild-magic identity; needs the ui test's
  POOL updated); Plot Armor keeps a walk going at 1 HP (Phoenix Feather ends it).
- ~~Flyers and loot~~ **Decided (Nov 5)**: flyers DO pocket gold piles and Hoard Piles (picking up loot is not a floor
  effect; DESIGN §4.3, ARCHITECTURE §3.7 `loot`). The engine agent implements it (`DD.Grid.isLoot`; `gold_pile` is
  flagged). ~~The act 3 Hoard Pile still needs `loot: true`~~ **Closed**: the pre-balance playtest fixes flagged it
  (`loot: true`, "Flyers swoop down for it too", AutoPlay values it for flyers); the Nov 14 finish run took the
  "still lacks" note out of DESIGN §4.3 (review-open-8).

**Finish run (Nov 14) — docs + tools: what this run closes** (details: §12)
- ~~Lead decisions D1-D4 in DESIGN §4~~ **Done**: §4.2 states each in the game's words — D1 "any single-target damage
  skill can break it" (attack or spell, the opt-outs named), D2 "Immovable units can start a swap but can't be swapped"
  (the refusal quoted; the old "Slate swaps with nobody" is gone), D3 "Attacking an object ends Stealth exactly as
  attacking a unit does" (also the §4.4 stealth row), D4 "No riders on objects" (AP, cooldowns, charges and Hype for
  using a skill still count).
- ~~heroes-5 / review-open-4: DESIGN advertises "Wet → lightning" no kit cashes in~~ **Docs side done**: §6 names the
  real payoffs (the Thunder Jar, the Frost Flask, Syllamin's Electric Lute) for Keg Stand and Healing Spring's Wet, and
  warns that Wet foes can't Burn. **Still open (lead / hero owners, a design call)**: a cheap kit-side lightning or frost
  hit, if the lead wants Wet to pay off without items.
- ~~heroes-10 / review-open-5: §2 Campaign Promise "1→2 AP"~~ **Fixed** (0 AP) and the generator fixed (§2 note).
- ~~review-open-13: DESIGN "only bosses wind up", "Forge Armour"~~ **Fixed**: §1, §4.1, §4.4, §8 and §12 say "only
  bosses and a few elites wind up their biggest attacks" (the HUD's words); §6 spells Forge Armor (digest §1 and §2 too).
- ~~review-open-14 (docs part)~~ **Fixed here**: ARCHITECTURE §3.10 `hero_downed_self` / `hero_downed_friendly` /
  `swap` and the `{ally}` token; §3.2 `forgetWarning`; DESIGN §4.1 the wind-up skew rule as built (the marked tiles move
  only if the Dazzle or Confuse lasts until the wind-up lands). **Still open (UI / render owners, ARCHITECTURE §7-8)**:
  §8.3 an adjacent ally's sprite = swap / Help Up, §7.5 `input:tileHover` carries `shift`, §8.1 the new UI APIs
  (`UI.CONTROLS`, `partyLines`, `bossWithTitle`, `consumableDesc`).
- ~~audit-6 / desc-sweep-8: stale numbers~~ **Fixed in DESIGN**: §5 balance rows (act 1, the Rat King ×0.9 HP = 122 HP
  in a campaign, the late bosses, casual / brutal), the gold line (boss 50–70, no per-act growth), §3 two shops a map,
  §6 Juice Box within 3, Transform 2–4, §9 the Rat King's campaign HP; digest §2 Juice Box / Transform / Campaign
  Promise. Closed by their owners in the same run: ARCHITECTURE §6.10 (brutal ×1.15 HP / ×1.05 damage, +1 enemy per
  normal encounter) and `js/ui/ui.js`'s fallback brutal text (15% / 5% / one extra enemy).
- ~~audit-4: the sim counts a round-cap fight as a win~~ **Fixed**: stalls (§3 note, ARCHITECTURE §10.3).
- New: `tests/docs_tests.js` checks the lines above against the game (so they can't drift back unnoticed).

**Engine / rules (`js/engine/*`)**
- AI estimates: `DD.AI.opportunityDmg` adds the flat bonus before multipliers (Act.damage adds it after);
  `AI.estimate` ignores item / status flat changes (a `takenFlat` hook: Ginger Rage, Loincloth, Whetstone…);
  `reachOf` / `threatMap` ignore attacks of opportunity, `canUse`, line of sight past the walk and per-victim bonuses,
  and count wind-up-only and "from where it stands" skills as instant (`windupOnly` / `fromStand` flags requested by
  bosses and act 2/3).
- `Grid.hazardAt` ignores immunities (Pebbles in fire, hounds and the pit fiend in lava, poison-immune slimes vs
  puddles). The default approach field ignores units (a downed hero in a doorway parks enemies; act 2/3 work around it).
  A generic fallback for boxed-in AI units. `moveTo` / `windUp` should refuse after a mid-turn stun (banana peel).
- A hero-side taunt on a charmed enemy wastes the charm. Combat.provokes could say whether a rider ends the walk.
  `enterTile` could pass cause / from to object onEnter (a sliding banana peel). A `cloud` surface flag (Ghost Mist over
  pits). `onDeathPrevented` / `onStatusRemoved` hooks (Basanos' form). A "this turn only" addStatus option (Mystery
  Potion). Cones ignore walls. `AI.describe` lists counters that can't work ("polymorph" on bosses, "get out of the red"
  for the whole-table doom). Log noise ("The Rat King is Wet." per tile; a raw surface id in the element-chain line).
  The bark picker names heroes who aren't in the party. `Combat.finish` still narrates `defeat` for a lost objective.
  ~~The registry suite asks for 9-11 pool skills (DESIGN: 8-10).~~ Closed Nov 5: DESIGN now says 9-10, the shipped range
  (inside the suite's 9-11).

**AutoPlay (`js/engine/autoplay.js`)**
- Signatures almost never fire; melee heroes spend 23-34% of turns only walking (statusGain's flat 1.5 for self-buffs);
  it plays the hero before its summons (Zoomies, Murder of Crows, Switcheroo rarely used); no two-step disengage
  (Tactical Retreat); deterrents and acting first are invisible to it (Hall Monitor, Loaded Dice, the Polearm); no
  next-turn-buff term (Valdris, Bedazzle); Infernal Debt / Debt costs are unmodelled; fire treated as a hazard by
  Pebbles. New from the integrator: a Help-Up loop against a boss that re-downs the helped heroes every round (3 casual
  boss fights hit the 30-round cap: two Rat King, one DM; `dump=1` shows Buga and Slate helping Betty and Syllamin up
  every round while the King downs both again).

**HUD / UI / render**
- ~~Threat shading nearly invisible on warm floors; the title campfire's 9-hero order; portraits that don't follow
  forms; `invalidReason` ignoring canTarget refusals; `noProvoke` / `noOpportunity` pills; the 4-slot Abilities box;
  hero resistances; the DM's head behind the objective; `UI.statLines` without initiative; Loaded Dice's extra dice~~
  **Done (Nov 5, render / HUD polish; re-checked in the balance-run review, §11)**.
- Still open: a provoking walk's own look; the optional trap counter.

**Items / sprites / narrative**
- ~~Items: `balloonSprite` wraps the on-screen pin~~ **Fixed (Nov 5)**: the balloons wrap the logical look
  (`unit.sprite`, else the def's), never `unit.vis.sprite`; suite `items: Party Balloons survive a Basanos Transform
  while FX play back (the on-screen pin)` (mutation-checked). Render-sprites (still open): hand positions for overlays
  (werewolf claws); unit-behind-unit silhouettes.
- ~~Narrative (optional): an `opportunity` narration key~~ **Added (Nov 5)**: 10 token-free lines in `narrator.js`.
  **Open (engine)**: whether and when to narrate it (`DD.Act.narrate('opportunity')`, e.g. the first attack of
  opportunity of a fight; any vars or none).

**Balance pass**: §4, and the owners' documented knobs (each enemy / boss notes file lists its knobs; Syllamin, Kiri,
Zarathor and Buga notes list hero levers). ~~`tests/balance_tests.js` is reserved in the manifest.~~ It ships (nine
balance suites since the sustain refits and the audit).

---------------------------------------------------------------------------------------------------------------------

## 6. Known issues (cross-cutting; per-area lists are in the owners' notes)

- AutoPlay sims understate human play in some ways (signatures, setup skills, summons) and overstate it in others
  (it dodges ~95% of wind-ups and solves every boss puzzle from exact hints). Treat sim numbers as a floor/ceiling mix.
- A Help-Up loop can stall a boss fight under AutoPlay (casual only so far: 3 of 759 fights hit the cap). Not a game
  bug: a human party is not forced to keep helping up.
- ~~Shared display names~~ **Fixed (Nov 5)**: the enemy side was renamed (hero names stay) — mimic CHOMP → **Gold
  Digger**, pixie Glitter Bomb → **Fairy Dust-Up**, hell hound Pounce → **Lap Dog** and Chew Toy → **Ankle Biter**,
  Grimble's Red Tape → **Please Hold**, the Rules Lawyer's OBJECTION! → **OVERRULED!**, the Rat Lawyer's OBJECTION! →
  **Strike That!** and its Cease and Desist (≈ Corelos' Cease & Desist) → **Temporary Injunction**. Suite
  `enemies_act1: (all acts) no enemy or boss skill shares a display name with a hero-side skill` keeps it that way.
- ~~Enemies without an explicit init~~ **Fixed (Nov 5)**: every boss-fight enemy states its init (same values).
- Barks name heroes who are not in the party (project-wide convention; a party filter is requested above).

---------------------------------------------------------------------------------------------------------------------

## 7. Integrator changes (this pass)

- `tests/content/integration.js` (owned): "cross-content consistency" is v2 now: 16 heroes, all `unlock: null`,
  `stats.init` in −2..+4, 3+ hero items each, hero items name real heroes, every boss registered with an encounter and
  unlocking nobody, every encounter's enemies and waves exist, every hero has a hero event, and a **pronoun sweep**
  (every sentence naming exactly one hero in the heroes' barks / blurbs / skills / items and the narration uses that
  hero's pronouns; a hero's own skill / item text that names nobody uses the owner's). "Losing a protect objective"
  checks "no level-up" instead of `xp === 0`. The campaign smoke runs all 16 heroes, checks a fresh profile has
  everyone unlocked, logs every fight, and accepts an act-1 loss (v2 is hard; it picks nodes at random).
- New suite **"integration: v2 screens have no unlock cheat, unlock progress or telegraph talk (core fix)"** for these
  surgical UI fixes (each commented `v2 (integrator)`):
  - `js/ui/screens/title.js`: the tagline "Every enemy telegraphs its attacks…" → "Nobody telegraphs anything. Except
    the bosses. You will still stand in it."; the three v1 fallback tips (telegraphs / red tiles, "push its attack",
    Guard Block) → v2 lines (initiative, attacks of opportunity, unused AP is lost).
  - `js/ui/screens/gameover.js`: no "Heroes unlocked: 16 / 16" bar and "🔒 Next" when no hero def has a lock.
  - `js/ui/screens/settings.js`: the "I'm the DM's Favorite: unlock every hero" cheat only shows while some hero has a
    lock; reset texts no longer promise to delete unlocks; subtitle "…and absolutely no cheats. Allegedly."; Space is
    "Roll for initiative · end turn · skip animations".
  - `js/ui/screens/tavern.js`: "Unlock more heroes!" / "an unlocked hero" / "No unlocked heroes outside the party." →
    bar wording.
- `js/ui/combat_hud.js`: a melee hero's inspect line read "takes a free The Family Hammer"; now "takes a free hit (The
  Family Hammer), once per round." (seen in the screenshot tour; the HUD suite's regex still holds).
- `tests/sim/sim.js`: v1 telegraph accounting replaced by v2 metrics (attacks of opportunity by side with damage, boss
  wind-ups announced / interrupted / landed / hit, per-hero AoO made / suffered, start HP per fight kind, boss results
  by a starting healer with `healers=`, `dump=1` for capped fights), "random 4 of all 16".
- `docs/notes/content-digest.md`: marked superseded by this file.
- Screenshot tour (headless, `.tmp/v2int/shots/`, all `debug=1`): party select with 16 heroes; Kiri / Betty / Basanos
  / Valdris and Hjalmar / Pebbles / Valdris / Kiri in combat; the "Provokes 1 attack of opportunity… Can't be undone"
  move preview and the "⚔️ Attack of opportunity!" moment; the Rat King's Gnaw wind-up (⏳2, tile hint); the rewards
  screen's "The DM rolls a d4… Betty levels up!" and the Table of Questionable Blessings level-up. Nothing else glaring.

---------------------------------------------------------------------------------------------------------------------

## 8. Test status (final integrator run)

`bash tools/test.sh` → **PASS — 801 suites, 117,629 assertions, 0 failures, 0 failing sections**. No swallowed
`Error in` warnings; the `warnings:` lines are the deliberate junk-content tests (mapgen `mgt_junk`, `spawnWave`
unknown enemy, a nameless wild surge, `newRun` with no heroes) and the documented content advisory (`peb_bbq` and the
fixture `test_ring_of_fire` deal damage only to Burning foes, which the generic arena lacks). The loader's
`missing scripts (1): tests/balance_tests.js` is the balance pass's reserved file.

Re-run the numbers: `tools/sim.sh "seeds=100&from=1000&diff=normal&verbose=1"` (and `from=2000`), `"seeds=200&from=5000&
stop=1"` (act 1 only), `"seeds=80&from=3000&diff=brutal"`, `"seeds=60&from=4000&diff=casual"`; lever tests with
`bal=difficulty.brutal.hp:1.1,difficulty.brutal.dmg:1.1` etc. Each 100-run campaign batch takes ~6 minutes.

---------------------------------------------------------------------------------------------------------------------

## 9. Requests (Nov 3) — Onyx, flyers, barrels, heals that revive, map rotation (verified and integrated Nov 5)

User, verbatim ("In this build as well"): "rename Josiah's raven "Onyx"" · "Flying characters ignore floor effects" ·
"Allow detonation of barrels by targetting them" · "Allow targetting o fheals on downed characters to heal and bring them
up" · "And we really need a rotate map ability, it is very hard to see tiles sometimes" → "…can we rotate freely by
mousewheel down?". The rules are DESIGN §4.2 / §4.3 / §12 and ARCHITECTURE §5.1 / §6 / §7 / §8.3. Per-area details are
in `rules.md` ("v2 requests" and its review), `render-world.md` / `render-sprites.md` / `hud-v2.md` (rotation),
`ui-v2.md` and each content owner's "Requests (Nov 3)" section.

**What the player gets**
- **Onyx.** `jos_raven` is always named Onyx (`names: ['Onyx']`: one RNG draw, so seeded fights are unchanged),
  re-summoned or not. Combat shows "Onyx · Raven" and the log "Josiah summons Onyx the Raven!". Josiah's passive, Raven
  Dive, Murder of Crows, the Treats, the canUse reasons ("Needs Onyx."), the barks ("Onyx, take notes…", "Don't worry.
  Onyx always comes back. Ravens are like that.") and the Plague-Rat Union event use the name. Skill and item names stay
  ("Raven Dive").
- **Flyers ignore the floor**, good and bad: terrain, every non-cloud surface (fire, poison, web and holy ground are no
  longer `airborne`), ground objects, traps and plates (never pressed), standing-in ticks, floor element reactions.
  Clouds (steam, smoke, Plague Miasma, Ghost Mist) still reach them; so do aimed attacks, blasts and auras. Hazards are
  per unit everywhere (`DD.Grid.hazardAt(x, y, unit)`: previews, AI, AutoPlay). That also closes two §5 requests:
  "hazardAt ignores immunities" (Pebbles in fire, poison-proof slimes) and the `cloud` flag (clouds now hang over pits
  and lava).
- **Shoot the barrel.** Any player-controlled single-target attack (basic attacks, `kind: 'attack'`, thrown consumables
  without a kind) can aim at a `volatile` object (explosive barrel, Pork Barrel, encounter barrels) in range and line of
  sight. It detonates, credited to the attacker (kills, environmental Hype, gold hooks); AP and cooldown are paid, riders
  are skipped. Opted out (`target.objects: false`): Throw Money At It, Fetch!, Vein Glory, Hold Still, Rock Bottom, Arrow
  from Beyond, Pounce. Enemies never aim at objects; AutoPlay does when its dry run says it pays. HUD: a 💥 marker and
  the exact blast preview.
- **Heals bring the downed up.** A single-target heal aimed at a downed ally revives it with the healed HP, at 0 AP, on
  its own initiative slot. This covers skills and consumables: Mostly Medicine, Carrot Toss, Who's a Good Boy?, Blood
  Drive, Emotional Support Dog, Temper III, First Aid, Red Drink, Big Red Drink, Antidote. Area heals, regen, lifesteal,
  passives and Blessings never revive. HUD: a 💚 marker, an "UP! N HP" badge, "💚 Heal back up (2)" on the party card.
- **Map rotation.**
  - Middle drag (hold the wheel) turns the board to any angle, and it stays there. Q / R turn 90° (animated; a double
    tap turns 180°). ⟲ · compass (reset) · ⟳ buttons sit top right. Home resets, F refits. Shift + wheel, a sideways
    swipe or a two-finger twist also turn it.
  - The angle is remembered in `settings.viewYaw`; `rot=<deg>` sets it for screenshots. Combat screen only.
  - Everything follows the view: picking, depth order, faces, shadows, overlays, FX, sprite mirroring, HUD edge names.
    N/W border walls are cut away and tall border props fade as they turn toward the camera (never at yaw 0). 13
    content box props turn with the board (`yawAware`).
  - Purely visual: no engine, AI, AutoPlay or RNG change.

**Verification (requests-verify, Nov 5)**
- **Real game, real input.** `.tmp/verify/e2e.js` on `.tmp/verify/game.html` sends key presses and canvas pointer
  events at a turned view; enemies are idle via `state.aiOff`.
  - **Yaw 30, flyer.** Syllamin flew over fire + spikes, poison + plate, lava + web and live current + gold pile, and
    ended his turn on fire. Result: 0 damage, no statuses, the plate unpressed, the gold untouched, no hazard warning.
    Marbles walking the same tiles was warned and paid. Syllamin flying into Plague Miasma was poisoned.
  - **Yaw 30 and 200, barrels.** Eldritch Bling (ranged basic) and Doddering Jab (melee basic) were each aimed at an
    explosive barrel and at a Pork Barrel. Each was listed as a target with the 💥 marker, each detonation equalled its
    hover preview (damage and KOs), each cost 1 AP and was credited to the attacker. AutoPlay set a barrel off among
    three hurt slimes. Enemies: 0 object targets over every skill, and none detonated a barrel over several live turns.
  - **Yaw 200, heals.** Mostly Medicine on downed Marbles showed "UP! 7 HP"; he got up with 7 HP and 0 AP and acted
    next round on his own slot. A Red Drink on downed Zarathor showed "UP! 10 HP"; he got up with 10 HP and the potion
    was used up. Healing Spring over a downed ally revived nobody.
  - **Rotation input** (`.tmp/rot/rv2/probe.js`). A 100 px middle drag turned the view −35° with 0 clicks. Q, R, Home,
    ⟲, ⟳ and the compass all work. Nothing turns under a modal, while typing, or on the title / codex / rewards
    screens. The angle is remembered in settings.
- **Yaw 0 pixel identity.**
  - `.tmp/rot/ident_v.html` (HEAD's iso.js + renderer.js vs live; 4 bosses × 7 views + the title, plus 0 → 90 → 30 → 0
    leak checks): 0 px differ everywhere. HEAD's painter gets the C7 helpers grafted in (`.tmp/rot/graft_v.js`) so the
    yawAware box props run under both renderers.
  - `.tmp/rot/sf/ident_sf.html` (sprites + FX): 0 px differ.
  - The box props' yaw-0 painter hashes (`.tmp/wf7/boxes/ab.html`) equal their pre-change `before.txt`.
- **QA shots** (`.tmp/verify/qa/`, `.tmp/verify/hl/`; every one read): plan §12 #1 (0 / 30 / 135 / 270), #2 (180),
  #3 (90 / 200), #4 (90), #5 (60), #8 (180), #9 (120), #10 (Rat King FX at 135), #11 (1920×1080 at 30), #12 (title at
  90 = 0); an AutoPlay fight at 250; the barrel and downed-heal highlights at 30 and 200.
- **Perf** (`.tmp/rot/perf/run3.sh`, boss_dm, GPU headless 1904×985):

  | condition | vs yaw 0 | note |
  |---|---|---|
  | yaw 0 vs HEAD | +0.1 ms | |
  | at rest, 30° | +1.5 ms | |
  | at rest, 135° | +3.1 ms | 5 silhouettes vs 1; median 9.2 ms; 0 frames over 20 ms |
  | spinning | +1.6 ms | p90 8.3 ms |

- **Tests**: full `bash tools/test.sh` → PASS, 872 suites, 119,743 assertions, 0 failures; only the deliberate §8
  warnings and the reserved `tests/balance_tests.js`.

**Fixed in this pass**
- `js/engine/actions.js` `Act.revive`: every revive (now every aimed heal too) logged "Professor Marbles is back on
  **their** feet". It is now pronoun-free: "Professor Marbles is back up (7 HP), thanks to Josiah.", following the
  narrator.js convention that a line naming a hero uses no pronoun for them. Tests updated (engine, hero_josiah,
  hero_marbles).
- `js/ui/combat_hud.js` `upWhen` (revive hints): "(0 AP now; acts in 4 turns (next round))" → "(0 AP now; acts in 4
  turns, next round)", and the fallback "on its own turn" after a hero's name → "acts in initiative order". New suite
  `hud: v2 requests verify — a downed ally whose turn already passed…` in tests/hud_tests.js.
- Docs:
  - DESIGN §4.2 named a nonexistent "Patch Notes" heal; it now says Mostly Medicine. DESIGN §4.3 and the Josiah brief
    name Onyx.
  - ARCHITECTURE §7.2: the overlay fields `objTargets`, `reviveTargets` and the revive badge. §8.1: `aimNotes` /
    `flyLine`. §8.3: the rotation cluster, `edgeName`, and the barrel / revive / flyer HUD.
  - README: 16 heroes (it said 13) and the three new rules under "How it plays".
  - §2 above: the Josiah kit text says Onyx.

**Still open (owners)**
- ~~**Perf gate (render-world).**~~ **Done (Nov 5)**: kept silhouettes; re-run in the balance-run review (§11): boss_dm
  rest 30 +0.8, rest 135 0.0, spin +1.5 (p90 15.3); Lich-tenstein +1.1 / −1.4 / +1.0, all PASS.
- ~~**Fit at diagonal views (HUD).**~~ **Done (Nov 5)**: the HUD reports its panels (`hudMargins.avoid`); the review
  (§11) stopped the mid-fight refits it caused and made the fit clear whole HP pills.
- ~~**Render.** A status that grants flight doesn't hover the sprite~~ **Done (Nov 5)**.
- ~~**Design call.** Under the floor rule, flyers can no longer pocket Hoard Piles or gold piles: keep it or carve it
  out.~~ **Decided Nov 5**: carve it out — loot is not a floor effect, flyers pocket gold piles and Hoard Piles (DESIGN
  §4.3; the engine agent implements it; the Hoard Pile text needs its act 3 owner, §5).
- **Balance pass.** Flying enemies now ignore hero floor effects (a small buff). Re-sim a2_follow_the_lights, the act 3
  imp encounters, a3_hoarders_lair and the act 2 bosses.
- ~~**This digest.** §2 kit texts other than Josiah's predate small Nov 3 desc tweaks~~ **Done Nov 5**: §2 regenerated
  from the registered defs, §1 counts include the 4 new tips, the idle-DM line and the `opportunity` key.
- **AutoPlay.** The Rat King Help-Up loop (§6) still fails `bosses_act1: rat king autoplay sims` in isolated fixture
  runs.

---------------------------------------------------------------------------------------------------------------------

## 10. Docs and content cleanup (Nov 5)

The "Lead" list of §5 and the cross-cutting issues of §6, closed by the docs / content clean-up role. No balance
number changed; the default map view is untouched (no render file was edited).

**Docs**
- **DESIGN**: §1 / §2 / §3 say 16 heroes (all available; recruits join at the lowest level among those who stay; the
  Hall of Fame as shipped) and spell out the pronouns. §4.2 has the attack-of-opportunity fine print; §4.3 the Nov 5
  design call **loot is not a floor effect** (flyers pocket gold piles and Hoard Piles; the engine agent's
  `DD.Grid.isLoot`). §5 lists every shipped boss (the DM: 400 HP, 20-damage rolls, one action + one wind-up a turn, two
  actions in phase 3). §6: all 16 hero briefs rewritten from the registered kits (v1 leftovers gone: Zarathor's surge
  passive and chaos bolt, Syllamin's telegraph manipulation, Marbles' Thumper, Josiah's brewing passive, Sparrow's and
  Corelos' v1 passives, Slate's telegraph-cancelling grapple and Stone Skin, Buga's v1 kit, every "unlock:" line; Betty,
  Basanos, Valdris, Hjalmar, Pebbles and Kiri list their final kits), pools 9–10, a "display names are unique per side"
  rule, and **§6.1 Design notes**: the open overlaps (Fabulous Strut ≈ Hot Zoomies, Butt Out ≈ Use Your Head, Get Off
  My Lawn ≈ LOOK AT MARWYN! ≈ Hold the Line, Power Ballad = Howl, Hjalmar's traps ≈ Corelos' glyphs) plus Zarathor's
  starters and Plot Armor, documented, not redesigned. §7 generic skill names, Tactical Retreat = the generic
  Disengage, item counts and armor wording (no combat-start Block), Energy Drink (+2 AP), the Overcaffeinated example,
  79 Blessings. §8 the divers per act, the elite wind-ups, the renamed enemy skills, the Skeletal Backup Dancer. §9 every
  boss as shipped (docket / rotation / wind-ups / puzzles / stun guards). §11 all 18 hero events, 35 events, no XP.
- **ARCHITECTURE** (§1-4, §9-10 only; the engine agent owns §5-6, the render agent §7-8): §1 ownership rows (HUD and
  AutoPlay tests, Blessings, Balance, content suites, integration); §3.1 hero `stats.init`, `resist`, `flags.immune` /
  `noOpportunity` / `noProvoke`, `unlock: null` for all; §3.2 the display-name rule; §3.4 items `stats.init` and the
  ignored `stats.block`; §3.6 enemy `init` / `turnsPerRound` / `aiStyle` / `passive` and the diver style; §3.7 the
  object `loot` flag and the `cause, from` onEnter arguments; §3.10 `initiative`, `objective_failed`, `opportunity` and
  the token contract; §9.2 `completeAct` unlocks nothing; §10 every debug URL param main.js reads (`screen=levelup`,
  `hero=`, `passives=`, `difficulty=`, `gold=`, `static=`), the `DDdbg` helpers, isolated runs, real FX playback in
  tests, `tools/sim.sh` and the Chrome cap.
- **This digest**: §1 counts, §2 regenerated from the registered defs, §5 / §6 / §9 marked as closed above; owner notes
  updated (`enemies-act1/2/3`, `bosses-act1/2`, `boss-dm`, `items`, `narrative`: a "Docs and content cleanup (Nov 5)"
  section each, Lead requests struck through).

**Content**
- **Enemy-side renames** (hero names stay; ids unchanged): mimic CHOMP → **Gold Digger**; pixie Glitter Bomb →
  **Fairy Dust-Up**; hell hound Pounce → **Lap Dog**, Chew Toy → **Ankle Biter**; Grimble's Red Tape → **Please Hold**;
  Rules Lawyer OBJECTION! → **OVERRULED!**; Rat Lawyer OBJECTION! → **Strike That!** and Cease and Desist (≈ Corelos'
  Cease & Desist, found by the new guard) → **Temporary Injunction**. Passive lines, codex texts, FX texts and the barks
  that quoted them follow; so do the enemy / boss suites' labels and the Grimble docket regexes. Guard suite:
  `enemies_act1: (all acts) no enemy or boss skill shares a display name with a hero-side skill`.
- **Explicit init** on `grim_intern` +1, `rat_plaintiff` +1, `rat_lawyer` 0, `lichtenstein` +2, `lich_intern` +1,
  `lich_mimic` 0, `dr_iris` +2, `iris_floater` +1 (the tier defaults they had); suites `bosses_act1/2: every boss-fight
  enemy states its initiative`.
- **Party Balloons** keep their balloons through a Basanos Transform played back with FX (they wrap the logical look,
  not the on-screen pin); suite `items: Party Balloons survive a Basanos Transform while FX play back`.
- **Narration key `opportunity`**: 10 token-free lines; the engine decides whether it fires (request in `narrative.md`).

**Tests** (Nov 5, while the engine and render agents were still editing `js/engine/*` / `js/render/*`): the new and
touched suites pass, isolated and in the full run; full `bash tools/test.sh` → 879 suites, 119,830 assertions, 5
failures, none in a file this pass touched: `render: title diorama` (passed on a re-run), `hero_marwyn` / `hero_betty`
AutoPlay battles (AutoPlay was mid-edit; Betty passed on a re-run), `hero_valdris: Forge Weapon` ("the AI knows leaving
the forged knight costs 8 — got 11": the engine's new `opportunityDmg` order, §5) and `enemies_act3: elites shrug off
back-to-back stuns` (the engine's new rule "a stunned unit starts no wind-up" refuses the test's second breath, wound up
while the dragon is still stunned; the test should end the stunned turn first, or the engine agent adjusts it). No
swallowed `Error in` warnings; only the deliberate §8 warnings.

**Still open after this pass**: the engine narrating `opportunity`; the act 3 Hoard Pile's `loot` flag / desc /
AutoPlay hint (act 3 owner); ARCHITECTURE §8 UI details (render / UI agent: combat consumes Enter, input guards,
`UI.inShowGuard`, long `UI.choice`); the design calls in DESIGN §6.1; everything under Engine, AutoPlay, HUD and
Balance in §5.

---------------------------------------------------------------------------------------------------------------------

## 11. Review (balance run) — render / HUD polish and docs / content clean-up

Adversarial review of the two Nov 5 passes above (§10 and the render / HUD polish), by running the game. Owners'
details: `render-world.md`, `hud-v2.md` (both "Review (balance run)").

**Verified**
- Shots at yaw 0 / 45 / 135 / 200 / 315 of boss_dm, a3_intern_orientation, boss_rat_king and a1_last_call at 1280×720
  and 1920×1080 (40 views; every PNG read; `.tmp/wf10/rev2/`), plus yaw 0 of a1_rats_in_the_cellar and boss_grimble. An
  independent probe (5×5 samples of every tile top, 5×7 of every sprite box with its HP pill) found no tile under a hard
  panel and no unit under any panel in any view after the fixes below, and the objective solid in all 40.
- Threat shading reads on the cellar's wood at 0° and 45° (76 tiles); the 💥 markers sit beside the HP pills (no overlap);
  the title campfire seats all 16 heroes. Yaw-0 A/B (`.tmp/rot/ident_v.html`, nothreat): 33/33 boss frames 0 px; only
  the title differs (16 heroes, intended). Perf gate PASS on boss_dm and Lich-tenstein (§9 Still open).
- Docs: 40+ DESIGN / ARCHITECTURE claims checked against the registered content and engine
  (`.tmp/wf10/rev2/claims.js`: heroes, stats, pools, boss HP / turns / init, prices, gold, Hype, heals, generic skills,
  item / consumable / Blessing / event / tip counts, divers, init of the boss-fight enemies, narration keys, display
  names; plus the attack-of-opportunity fine print, the damage multipliers, Help Up and every §10.1 URL param in code).
  Only miss: DESIGN §4.3 says flyers pocket Hoard Piles; the act 3 Hoard Pile has no `loot` flag yet (now noted there).
- Enemy renames complete: the old names survive only as hero-side skills (Buga's Red Tape, Basanos' Pounce, Pebbles' Chew
  Toy, Syllamin's Glitter Bomb, Corelos' Cease & Desist, the Infernal Lawyer's Objection!), item / FX text ("CHOMP!",
  "OBJECTION! (p. N)" on the DM's floor puzzle) and comments; the guard suite passes.

**Fixed (with regression tests)**
1. **The board re-framed itself mid-fight** (high). Every panel change (a party card's status line, a portrait leaving
   the tracker, the next hero's skill bar) refitted with the units where they stood: an 8-round AutoPlay fight on
   a3_intern_orientation zoomed 0.73 → 0.66 → 0.68 → 0.70 → 0.73 with one 291 px jump (7 refits). Now a panel change
   refits only when it puts something under a panel at the current view (deployment: tiles under hard panels or units
   under any; under way: tiles under hard panels) and never to grow back: 0 refits in the same fights. Suite `render: a
   panel change mid-fight refits only to clear a panel, never back and forth; HP pills clear whole`.
2. **The fit kept only the HP pill's centre clear** (medium): at yaw 0 an eyeball intern's pill end sat under the
   objective, which faded at fight start (a3_intern_orientation, both sizes). The fit now clears the whole pill and its
   status row (the widgets' clamped zoom). Cost at yaw 0: 0-11% zoom on 3 of 6 maps at 1280×720 (author's version
   0-6%), 0-6% at 1920×1080.
3. **The objective faded with nothing under it** (medium): its peek test guessed every boss 120 px tall at any zoom (the
   Rat King and the DM faded it at 1920×1080 with their heads well clear). It now uses the sprite metrics and the HP
   pill, the geometry the fit keeps clear. Suite `hud: review — the objective fades for the real sprite and HP pill; a
   resize measures the panels again`.
4. **A resize refitted with the old window's panel boxes** (low; cached 250 ms): the cache is now keyed by window size.
5. Docs: ARCHITECTURE §7.2 (fit, refits, objective fade), DESIGN §4.3 (Hoard Pile pending), this digest's §5 / §9.

**Not verified / still open**
- Live frames at yaw 0 are no longer bit-identical frame by frame: kept silhouettes trail the idle bob by up to ~0.35 s
  (faint fill + outline over an occluder; the A/B harness renders exactly). Accepted as the perf trade.
- The default yaw-0 framing is smaller on maps with a back-row unit near the objective (above); the 250 px bottom
  margin, not the panels, is what stops the board sliding down instead of shrinking.
- Party Balloons as a `unit.overlays` add-on (render request) not done: `tests/content/hero_basanos.js` (not mine)
  asserts the wrapped sprite. Portraits now follow the look, so a balloon holder's portrait shows the balloons.
- `opportunity` narration, the Hoard Pile `loot` flag, DESIGN §6.1 calls: unchanged (owners in §5).

---------------------------------------------------------------------------------------------------------------------

## 12. Finish (Nov 14) — docs, tools and the test harness

The last run before release (lead decisions D1-D11, `.tmp/wf12/lead-decisions.md`). This role owns `docs/DESIGN.md`,
ARCHITECTURE §1-4 and §9-10, this digest, `tests/sim/*`, `tests/docs_tests.js` (new) and the test runner files. Every
finding was reproduced first: the new docs suites failed on the files as they were (49 failed assertions over 6 suites),
then pass.

**Lead decisions in the docs.** DESIGN §4.2 states D1-D4 in one short paragraph each, in the game's words (the HUD's
"any single-target damage skill can break it", the engine's "Slate is immovable: he can start a swap, you can't move
him."): D1 *Break things* (attack or spell, the eight opt-outs named), D2 *Immovable units* (the old "Slate swaps with
nobody" was wrong since D2 and is gone), D3 *Stealth and objects* (and the §4.4 stealth row), D4 *No riders on objects*.
D5-D7 were built and reviewed in the rules run and are documented where they live (AutoPlay §5.7, render §7, the `swap`
narration key in §3.10).

**Findings (10 routed here)**
- heroes-5 / review-open-4 (minor, docs side fixed): no hero skill deals lightning or frost, so DESIGN §6 now names the
  real payoffs for Keg Stand's and Healing Spring's Wet (the Thunder Jar, the Frost Flask, Syllamin's Electric Lute) and
  says Wet foes can't Burn; the §6 combo list does too. The kit-side alternative (a cheap lightning / frost hit for one
  hero) is a design call left to the lead and the hero owners.
- heroes-10 / review-open-5 (polish, fixed): Campaign Promise is "(0 AP, cd 3→2)"; the generator (now in
  `tests/docs_tests.js`) reads the def's `ap`, not `levels[i].ap`. A full regeneration found five more stale lines
  (§2 note), now fixed.
- review-open-8 (minor, fixed): DESIGN §4.3 no longer calls the Hoard Pile an open request (it is `loot: true`); §5 here
  closed.
- review-open-13 (minor, fixed): "only bosses wind up" → "only bosses and a few elites wind up their biggest attacks"
  in DESIGN §1, §4.1, §4.4, §8, §12; "Forge Armour" → Forge Armor (DESIGN §6, digest §1 / §2).
- review-open-14 (minor, docs part fixed): ARCHITECTURE §3.10 `hero_downed_self` / `hero_downed_friendly` / `swap` and
  `{ally}`; §3.2 `forgetWarning`, `objectDmg`, D1's aim rule, `ctx.objectDmg` / `ctx.objectHit`; §3.1 `pronoun`; §3.7
  `targetable`; §4.5 `intent.skew`; DESIGN §4.1 the wind-up skew rule as built. The ARCHITECTURE §7-8 parts are the
  render / UI owners' (requests below).
- audit-4 (minor, fixed): `tests/sim/sim.js` reports a round-cap fight as a **stall** — counted in no win rate (fights,
  encounters, fight kinds, bosses and their healer split, the campaign, hero shares), a run whose result hangs on one is
  a stalled run, and "== stalls" lists each (seed, encounter, round, who stood). The report keeps every old line and
  field (the header adds "stalled runs N (in no win rate)"; boss tallies read "w/n (+k stalled)"), and json records add
  `outcome`. The tallies are exposed as `window.DD_SIM`; the sim starts only on a page with `<pre id="out">`.
- audit-6 (minor, fixed): DESIGN §5 has a "Balance rows" bullet — act 1's rows, the Rat King ×0.9 HP (122 HP in a
  campaign, damage unchanged), the late bosses, casual ×0.8 / ×0.8 and brutal ×1.15 HP / ×1.05 damage plus one extra
  enemy in regular fights — and §9 gives the Rat King's campaign HP.
- desc-sweep-8 (minor, fixed in my files): DESIGN §5 gold (boss 50–70, no per-act growth), §3 two shops a map, §6 Juice
  Box within 3 and Transform 2–4; digest §2 Juice Box, Transform, Campaign Promise. ARCHITECTURE §6.10 and the ui.js
  fallback were fixed by their owners in the same run.
- Mid-run: the content owner's FF-1 (the Lich's Late Fees stop at 12; his row ×1.25 → ×1.3 HP) landed while this ran;
  DESIGN §5 / §9 follow it (the docs suite caught the drift).

**Regression tests** (`tests/docs_tests.js`, registered in `tests/manifest.js` after `tests/sim/sim.js`): five `docs:`
suites read DESIGN / ARCHITECTURE / this digest (and the HUD / engine files for their exact rule words) through a
synchronous file:// request and check what the docs claim against the registered defs and `DD.Balance` (D1-D4, wind-ups,
the Hoard Pile, Wet payoffs, §5 rows and gold, the Rat King's HP, Juice Box, Transform, Forge Armor, §2 costs, §3.10
keys, §3.2 / §3.7 / §4.5 fields); one `tools:` suite plays three runs through `DD_SIM` (a stalled boss fight, a real
loss, a clean win) and reads the report. They only test claims, never "every X is listed", so new content can't fail
them; changing a number a doc quotes does — then update the doc line (the failure says which).

**Requests (other owners)**
- RENDER / UI (ARCHITECTURE §7.5 / §8, review-open-14): §8.3 — clicking or hovering an adjacent ally's sprite = swap
  (move aiming) / Help Up (downed); §7.5 — `input:tileHover` carries `shift`; §8.1 — the new UI APIs `UI.CONTROLS`,
  `UI.partyLines`, `UI.bossWithTitle`, `UI.consumableDesc`, and the forget picker's use of `forgetWarning`.
- README.md (lead): nothing to do; lines 22-23 already say "only bosses and a few elites wind up".
- LEAD / hero owners (heroes-5, design call): whether Wet should pay off without items (a cheap lightning or frost
  hit in one kit, e.g. Syllamin's or Zarathor's pool).
- NARRATIVE (`tests/content/narrative.js:50`): its hard-coded `NARRATION_KEYS` lacks `swap` (D7's key, in
  `DD.Narrator.TOKENS` and now in ARCHITECTURE §3.10), so "narration — every key" fails; two tips that now say "any
  single-target damage skill" run 141-142 characters, over that suite's length cap (shorten them or raise the cap).

**Sim smoke** (`tools/sim.sh "seeds=2&from=43220&stop=1&maxr=5&verbose=1"`): the real path works — 3 capped fights
(the mimic, the Rat King twice) are listed under "== stalls", both runs are stalled runs, boss fights read
"boss_rat_king 0/0 (+2 stalled)", 0 errors, 0 `DD.warn` lines.

**Full run** (Nov 14 ~17:15, one Chrome): `bash tools/test.sh` → 1,042 suites, 123,685 assertions ok, 9 failures in 5
sections, none in this role's files; all six new `docs:` / `tools:` suites pass, no swallowed `Error in` warnings,
nothing missing. The failures are other owners' work in progress this run: `hero_marwyn` (a bark for Basanos),
`hero_betty` (bark keys), `enemies_act2` ×2 (passives for the zombie, banshee and gargoyle; the gargoyle's targeting
text), `narrative` (the `swap` key and two tip lengths, above).

## 13. Review (finish) — render / UI and docs / tools (Nov 14, REVIEWER)

The adversarial review of this run's fix:ui and fix:docs work. Every "fixed" entry was re-played (the real input path:
pointer events on `#game` at yaw 0 / 45 / 200; scratch probes `.tmp/wf14rev/probe/`), every skipped / not-reproduced
one re-judged (all hold: D6, text-tone-v1, text-tone-17's HUD part, heroes-5's kit side), 42 shots read (every screen at
1280x720 and 1920x1080, four fights at yaw 0 / 45 / 200), and 30+ doc claims checked against the running game (list
in docs/notes/hud-v2.md "Review (finish)"). D1-D4 read word for word the same in the lead's decisions, DESIGN §4.2, the
HUD, the engine's refusal and the object texts, and the game does what they say (D3 and D4 played, not just read).

**Fixed** (each with a regression test that fails without it):
- rv-finish-1 (minor): the 🗿 pill told a move-0 unit (Zarathor's Tasteful Statue) it "can start a swap as the move".
- rv-finish-2 (minor): a refused swap (Slate under D2, no AP, a stunned ally) drew the same red arrows as an allowed
  risky one; it now gets the ✖ (`overlay.swap.blocked`).
- rv-finish-3 (polish): the finish run's 101-character title quip wrapped at both sizes (the rotating tagline jumped);
  now one line.
- Docs: ARCHITECTURE §3.7 volatile line in D1's words; §8.3 "wind-ups of bosses and a few elites"; DESIGN §5 / §9
  follow the bosses owner's FF-4 (Dr. Iris ×1.1 HP, closing time from round 10), which had turned the docs suite red.
- Cross-owner requests finished (review-open-14): ARCHITECTURE §7.5 input payloads (`shift` on `input:tileHover`),
  §8.1 the UI APIs (`CONTROLS`, `partyLines`, `bossWithTitle`, `consumableDesc`, `chooseSkillSlot` / `forgetWarning`),
  §8.3 the adjacent-ally click (⇄ swap / Help Up).

**Requests** (RULES): the immovable swap refusal for a move-0 unit ("…it can start a swap…" is untrue for the statue);
the Stealth tooltip to say "or attacks an object" (D3) like DESIGN §4.4.

**Sim smoke** (`tools/sim.sh "seeds=1&from=500&maxr=4"`): 12 capped fights listed under "== stalls", one stalled run,
boss tallies "w/n (+k stalled)", 0 errors, 0 `DD.warn` lines. (A capped fight reports "round 5" for a cap of 4: the
round counter had already turned; cosmetic.)

**Full run** (Nov 14 ~17:20, one Chrome): `bash tools/test.sh` → 1,045 suites, 123,725 assertions ok, 9 failures in 5
sections, none in the render / UI / docs / tools files: `hero_marwyn` (a bark for Basanos), `hero_betty` (bark keys),
`enemies_act2` ×2 (passives for the zombie, banshee and gargoyle; the gargoyle's targeting text), `narrative` (the
`swap` key and two tip lengths) — the same five as at the start of this review, other owners' work in progress. No
swallowed "Error in" warnings, nothing missing. (A mid-review run caught the DM owner mid-edit — `dm_mercy`'s "DM is not
defined" — fixed by its owner before this run.)
