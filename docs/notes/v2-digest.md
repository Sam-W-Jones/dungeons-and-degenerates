# V2 DIGEST — the whole v2 game, integrated (briefing for the balance pass, playtests and polish)

Written by the **v2 integrator** after every v2 area (engine, attacks of opportunity, 16 heroes, enemies acts 1-3,
bosses, items, kit, Blessings, narrative, UI) landed and was reviewed. Everything below was measured with every file
loaded together. Owner notes (`docs/notes/<area>.md`) stay the source of truth for each area's details; this file is
the map, the numbers and the open threads. The v1 digest (`content-digest.md`) is kept for history only. §9 covers the
user's Nov 3 requests (Onyx, flyers, barrels, heals that revive, map rotation), built after this digest was written.

**State.** `bash tools/test.sh` → **PASS** (see §8 for the final count), no swallowed `Error in` warnings. The only
`warnings:` lines are deliberate (junk-content tests in mapgen / run / wild magic, and the documented `peb_bbq`
content advisory: Bark-B-Q only hits Burning foes, the generic arena has none). The loader reports
`missing scripts (1): tests/balance_tests.js`: the manifest reserves it for the balance pass (missing files are
skipped by design). 600 whole-campaign AutoPlay runs (~4,650 fights) across difficulties: 0 errors, 0 `DD.warn` lines,
0 timeouts on normal and brutal (3 on casual, an AutoPlay Help-Up loop, §6).

The v2 rules in one breath (user requests): roll for initiative, every unit takes one turn in that order; no enemy
telegraphs (only bosses' biggest attacks and at most one elite signature move wind up, ⏳); no Guard and no
combat-start Block; durations count the owner's own turns; one hero levels up per won fight (the DM's rotation, no
XP); all 16 heroes unlocked from the start; attacks of opportunity (walking away from an adjacent melee foe gives it
one free hit; pushes, pulls, teleports, swaps, jumps and skill dashes never provoke) and reach-aware enemies (brutes
stick to the hero next to them, only sneaky divers go for the weakest); skills are one verb plus at most one rider.

---------------------------------------------------------------------------------------------------------------------

## 1. Content map

**Counts** (real content, test fixtures excluded): 16 heroes · 187 hero skills (basic + signature + 8-10 pool each) ·
12 generic skills · 51 enemies (15 minions, 22 normals, 9 elites, 5 bosses) with 119 enemy skills · 6 hero summons ·
39 encounters · 99 items (50 shared: 19 common, 16 rare, 7 legendary, 8 cursed; 49 hero items) · 14 consumables ·
79 Blessings (33 common, 18 uncommon, 11 rare, 6 legendary, 11 cursed) · 13 scars · 36 events (18 hero events) ·
62 statuses · 61 objects · 19 surfaces · 65 narration keys (437 lines, 75 tips).

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
| `valdris` | Valdris | he/him | forge support / frontline buffer | 28 (+4) | 3 | 1 | 0 | Flame-Forged Edge, Forge Armour |
| `hjalmar` | Hjalmar | he/him | trapper & trickster (hop) | 22 (+3) | 5 | 0 | +4 | Banana Peel, Bear Trap |
| `pebbles` | Pebbles | he/him | melee skirmisher & fire control (fireproof) | 26 (+4) | 5 | 0 | +3 | Hot Zoomies, Fetch Quest |

Who makes attacks of opportunity (melee basic): Marbles, Marwyn, Sparrow, Slate, Betty, Basanos (both forms),
Valdris, Pebbles, plus summons whose first ready skill is melee (corgis, the raven, the Blood Clone, Steve).
Ranged basics (never strike walkers): Zarathor, Syllamin, Ellaria (Chomp in Wild Shape is melee), Josiah (cane reach 2),
Corelos, Buga, Kiri, Hjalmar.

Each hero has 3 hero items (Josiah 4: the Portable Alembic carries his old brewing) and one hero event (Slate and Buga
two). Hero summons: `zar_statue`, `cor_imp`, `jos_raven`, `ell_corgi`, `spa_clone` (+ item summon `steve_torchbearer`).

### Enemies by act (`js/data/enemies/act*.js`, `js/data/bosses/*.js`; init modifier in brackets)
- **Act 1**: rat (+3), goblin grunt (+2), slingshot kid (+3), kobold union rep (−2), sewer slime (−1) → slimelets (+1),
  spore bro (−1), cellar spider (+2, the act's diver), critic (+1); elites mimic (+2, Lid Slam is the act's one elite
  wind-up), bugbear (−1), gelatinous cube (−3). Bosses **Grimble** (+2, 2 turns a round; interns) and **the Rat King**
  (+2, 2 turns a round; plaintiff rats, rat lawyers).
- **Act 2**: skeleton intern (+1), unpaid zombie (−2), brunch cultist (0) → hollandaise horror (+1), wisp (+3, diver),
  owlbear cub (+2), banshee (+1), gargoyle (−1, diver), pixie swarm (+4); elites mama owlbear (+1, Stomp wind-up),
  necromancer TA (0), flesh golem Gary (−2), tesla coil (+2). Bosses **Lich-tenstein** (interns, bookshelf mimics) and
  **Dr. Iris** (eye floaters), one turn a round each, tier-default init.
- **Act 3**: imp influencer (+3, the act's diver), hell hound (+2), mind flayer (+1), eyeball intern (+2), rules lawyer
  (0), natural 1 golem (−2), kobold dragonshield (+1), succubus dating coach (0), skeletal backup dancer (+2); elites
  young red dragon (+1, Hoard Breath wind-up), death knight (−1, Villain Monologue), pit fiend accountant (+1, Hostile
  Audit). Boss **the Dungeon Master** (+2; cameo goblin / skeleton / imp).
- Tier-default init (no explicit value; minion +1, normal 0, elite +1, boss +2): `grim_intern`, `rat_plaintiff`,
  `rat_lawyer`, `lichtenstein`, `lich_intern`, `lich_mimic`, `dr_iris`, `iris_floater`.

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
- **Consumables (14)**: Red Drink, Big Red Drink, Flask of Bad Decisions, Smoke Bomb, Energy Drink (+2 AP), Antidote,
  Liquid Courage, Scroll of Yeet, Bag of d4s, Holy Water, Frost Flask, Thunder Jar, Mystery Potion, Pocket Sand.
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
- *Passive* **MAGNIFICENCE**: Each of his skills that reaches a foe adds 1 MAGNIFICENCE. At 5, his next skill also unleashes a MAGNIFICENT SURGE (random good wild magic, +10 party Hype) and resets the meter.
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
- **Keg Stand** `mrw_keg_stand` (1 AP, cd 1, 2 charges): Heal 4/6/8 HP and splash water on every tile within 1/1/2 (units there get Wet). 2 kegs per fight.
- *Items*: **Gauntlets of Competitive Yeeting** (rare weapon): +5% damage. YEET throws 2 tiles further. · **Loincloth of Unearned Confidence** (rare armor): +6 max HP. Foes Taunted by Marwyn deal 25% less damage to him. · **Hand Mirror of Self-Admiration** (legendary trinket): His MAGNIFICENT SURGEs unleash two different good wild magic effects instead of one.

### Ellaria the Corgi Whisperer (`ellaria`, she/her)
*Corgi summoner / healer / control* · 26 HP (+4/lvl) · move 4 · armor 0 · init +1
- *Passive* **Pack Leader**: Starts each fight with a corgi. A fallen corgi Inspires the party for their next turn. AVENGE BISCUIT!
- **Thorn Whip** `ell_thorn_whip` *(basic)* (1 AP): Deal 4 damage to a foe and pull it 1 tile toward you.
- **Release the Corgis** `ell_release` *(signature)* (2 AP, 100 Hype): A corgi pounces beside each of up to 6 foes (nearest first), bites it for 6 damage and Taunts it.
- **Summon Corgi** `ell_summon_corgi` *(starter)* (2 AP, cd 3→2): Summon a corgi (HP 8 + your level, Bite 3, Bark taunts). Max 3 corgis. **III:** Summon a corgi (HP 8 + your level, Bite 3, Bark taunts). Max 3 corgis. It acts at once.
- **Healing Spring** `ell_spring` *(starter)* (2 AP, cd 2): Heal yourself and allies in radius 1 for 5/6/8 HP; puddles (Wet) fill the rest of the area.
- **Entangling Roots** `ell_roots` (2 AP, cd 2): Brambles fill radius 1 for 2/2/3 rounds. Foes caught or entering take 3/4/5 damage and are Rooted.
- **Barkskin** `ell_barkskin` (1 AP, cd 1): Give yourself or an ally 5/7/9 Block, and Thorns 2/2/3 through their next turn.
- **Who's a Good Boy?** `ell_good_boy` (1 AP, cd 2→1): Heal an ally, a corgi or yourself for 3/5/6 HP and Empower them (next damaging skill +50%).
- **Fetch!** `ell_fetch` (1 AP, cd 2): The corgi nearest the foe dashes in, bites it for 3/4/5 damage and drags it up to 2/3/3 tiles toward you.
- **Zoomies** `ell_zoomies` (2 AP, cd 2): Each foe next to one of your corgis takes 4 damage and is pushed 1 tile away from it. **III:** Each foe next to one of your corgis takes 6 damage and is pushed 2 tiles away from it.
- **The Ol' Switcheroo** `ell_switcheroo` (1 AP, cd 2→1): Swap places with one of your corgis anywhere on the field; the corgi gains 4/6/8 Block.
- **Wild Shape: Absolute Unit** `ell_wildshape` (1 AP, 1 charge): Once per fight: become an immovable giant corgi through your next turn. Thorn Whip becomes Chomp (7 damage, knockback 1). **III:** Once per fight: become an immovable giant corgi through your next 2 turns. Thorn Whip becomes Chomp (10 damage, knockback 1).
- *Items*: **The Good Stick** (rare weapon): +10% damage. Corgi attacks deal +2 damage: Bite, Fetch!, Zoomies and Release the Corgis. · **Robe of Perpetual Shedding** (common armor): +4 max HP. Foes that hit you in melee are Dazzled until the end of their next turn. · **Flower Crown of the Corgi Queen** (legendary trinket): +15% healing. Lost a corgi? A new one bounds in near you at the start of your next turn (up to 3 corgis).

### Josiah the Medically Dubious (`josiah`, he/him)
*Poison healer & raven wrangler (Onyx)* · 26 HP (+4/lvl) · move 4 · armor 0 · init +0 · flags noOpportunity
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
- **Juice Box** `spa_juicebox` *(starter)* (2 AP, cd 2): Drain a foe within 2: deal 5/7/8 damage +3/3/4 per Bleed on it, and heal half the damage dealt (rounded up).
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
- *Passive* **Short Fuse**: Gains 1 Rage (max 5) whenever someone else hits, heals or buffs him. At 3+ Rage his runes flare: his skills deal +2 damage.
- **Love Tap** `sla_love_tap` *(basic)* (1 AP): Deal 5 damage to an adjacent foe.
- **Tectonic Tantrum** `sla_tantrum` *(signature)* (2 AP, 100 Hype): The ground heaves: every foe within 2 tiles takes 15 damage and is knocked 2 tiles away from you. Then your Rage maxes out.
- **Hold Still** `sla_hold_still` *(starter)* (1 AP, cd 2): Grab an adjacent foe: 4 damage, and it is Grappled through its next turn (can't move; dragged along when you walk). **III:** Grab an adjacent foe: 6 damage, and it is Grappled through its next 2 turns (can't move; dragged along when you walk).
- **Personal Space** `sla_personal_space` *(starter)* (2 AP, cd 1): Throw an adjacent foe or object up to 3/3/4 tiles: it and the foe it hits take 7/9/11 damage. Objects shatter.
- **Hard Pass** `sla_rocks_fall` (2 AP, cd 2): Lob a boulder up to 5/5/6 tiles, over walls: 7/9/10 damage to the foe or object there. On empty floor, the Boulder stays.
- **Air Mail** `sla_air_mail` (1 AP, cd 2→1): Throw an adjacent ally up to 3/4/4 tiles onto a safe empty tile. Foes next to the landing take 3/4/5 damage.
- **Putting My Foot Down** `sla_foot_down` (2 AP, cd 2): Stomp: foes in a cone of 2 take 4 damage and are pushed 1 tile back. **III:** Stomp: foes in a cone of 3 take 6 damage and are pushed 2 tiles back.
- **Get Off My Lawn** `sla_lawn` (1 AP, cd 2): Yell: every foe within 2/2/3 tiles is Taunted for its next turn, and you gain 4/6/8 Block.
- **Rock Bottom** `sla_rock_bottom` (2 AP, cd 2): Slam an adjacent foe onto the tile behind you (if there's room): 10 damage. **III:** Slam an adjacent foe onto the tile behind you (if there's room): 12 damage, and it is Stunned for its next turn.
- **Blow a Gasket** `sla_gasket` (2 AP, cd 3): Vent all your Rage: every foe in the 8 tiles around you takes 3/5/5 damage + 2/2/3 per Rage spent.
- **Get Over Here** `sla_get_over_here` (1 AP, cd 2): Rune-chain a foe up to 4/5/6 tiles away in a line: 2/3/4 damage, and pull it next to you.
- *Items*: **Mitts of Unreasonable Velocity** (rare weapon): +10% damage. Personal Space and Air Mail throw 1 tile further. · **Cardigan of Disapproval** (rare armor): +6 max HP. Slate gains 2 Block for every Rage he gains. · **The Grudge Ledger** (legendary trinket): +10% damage. Short Fuse gives Slate 2 Rage instead of 1 (every grudge is recorded twice).

### Mayor Buga the Toast of the Town (`buga`, he/him)
*Support · manipulator · loot* · 24 HP (+4/lvl) · move 4 · armor 0 · init +0
- *Passive* **Skimming Off the Top**: Whenever an ally (or a foe he bribed) defeats an enemy while Buga stands, he takes the credit: +2 gold.
- **Campaign Pamphlet** `buga_pamphlet` *(basic)* (1 AP): Deal 4 damage to a foe within 4 tiles.
- **Toast of the Town** `buga_toast_of_the_town` *(signature)* (2 AP, 100 Hype): Point at a foe within 6 tiles: every ally who can hit it makes 2 free basic attacks on it.
- **Delegate** `buga_delegate` *(starter)* (1 AP, cd 2→1): Point at a foe within 6 tiles: the best-placed ally makes a free basic attack on it. **III:** Point at a foe within 6 tiles: the 2 best-placed allies make free basic attacks on it.
- **Loitering Fine** `buga_fine` *(starter)* (1 AP, cd 1): Deal 4/5/6 damage to a foe within 3 tiles and pocket 2/2/3 gold.
- **Campaign Promise** `buga_promise` (1→2 AP, cd 3→2): An ally within 5 tiles gains 1/1/2 AP on its next turn.
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
- **Ramming Speed!** `bet_ram` *(starter)* (2 AP, cd 2): Charge up to 3/3/4 tiles in a straight line. The first foe in the way takes 6/8/9 damage and is pushed 2/2/3 tiles.
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
- **Transform** `bas_transform` *(starter)* (1 AP): Switch between human and werewolf. Werewolf: +2 move; basic attack Claw (4/5/5 damage, 1/1/2 Bleed).
- **Shoulder Check** `bas_shoulder_check` *(starter)* (1 AP, cd 1): Human form: deal 5 damage to an adjacent foe and push it 1 tile. **III:** Human form: deal 7 damage to an adjacent foe and push it 2 tiles.
- **Silver Slash** `bas_silver_slash` (2 AP, cd 1): Human form: deal 8 damage to an adjacent foe; it is Vulnerable for 1 turn. **III:** Human form: deal 12 damage to an adjacent foe; it is Vulnerable for 2 turns.
- **Hold the Line** `bas_hold_the_line` (1 AP, cd 2): Human form: Taunt every foe within 2/2/3 tiles for 1 turn and gain 4/5/6 Block.
- **Step In** `bas_step_in` (1 AP, cd 2): Human form: swap places with an ally within 3/4/5 tiles and gain 4/5/6 Block.
- **Rend** `bas_rend` (1 AP, cd 1): Werewolf form: deal 3/4/5 damage to an adjacent foe and apply 3/4/5 Bleed.
- **Pounce** `bas_pounce` (2 AP, cd 3): Werewolf form: leap next to a foe within 3/4/5 tiles, deal 4/6/8 damage and Stun it.
- **Howl** `bas_howl` (1 AP, cd 3): Werewolf form: you and allies within 2 tiles are Inspired (+25% damage) for 1 turn. **III:** Werewolf form: you and allies within 3 tiles are Inspired (+25% damage) for 2 turns.
- **Savage Bite** `bas_savage_bite` (2 AP, cd 1): Werewolf form: deal 9/11/13 damage to an adjacent foe. If that kills it, heal 6/8/10.
- **Frenzy** `bas_frenzy` (2 AP, cd 2): Werewolf form: deal 4/5/6 damage and apply 1/1/2 Bleed to every adjacent foe.
- *Items*: **Flea Collar** (rare trinket): Your first Transform each turn costs 0 AP. · **Wolfsbane-Lined Coat** (rare armor): +4 max HP. When Hair Trigger turns you into the werewolf, heal 6. · **Moonfang** (legendary weapon): +10% damage. The Bleed your skills apply is doubled.

### Valdris the Well-Conditioned (`valdris`, he/him)
*Forge support / frontline buffer* · 28 HP (+4/lvl) · move 3 · armor 1 · init +0
- *Passive* **Strike While the Iron's Hot**: Valdris deals +3 damage to Burning foes, attacks of opportunity included.
- **Percussive Maintenance** `val_basic` *(basic)* (1 AP): Deal 5 damage to an adjacent foe.
- **Divine Forge** `val_signature` *(signature)* (2 AP, 100 Hype): Valdris and every ally deal +3 damage with every hit until the end of their next turn, and gain 8 Block.
- **Flame-Forged Edge** `val_flame_edge` *(starter)* (1 AP, cd 1): Valdris or an ally within 3: its next damaging skill sets each foe it hits Burning 3/4/5.
- **Forge Armour** `val_forge_armour` *(starter)* (1 AP, cd 1): Valdris or an ally within 3 gains 6/8/10 Block (until the start of its next turn).
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
- **Pickpocket** `hja_pickpocket` (1 AP, cd 2): Steal 3 gold from an adjacent foe; it is Weak through its next turn. **III:** Steal 5 gold from an adjacent foe; it is Weak through its next 2 turns.
- **Swing Away** `hja_swing` (1 AP, cd 2→1): Leap to an empty tile within 3/4/5 that Hjalmar can see.
- **Bait and Switch** `hja_switch` (1 AP, cd 3→2): Swap places with a foe within 2/3/4.
- *Items*: **Coconut of Unusual Size** (rare weapon): +10% damage. Coconut Toss knocks its target 1 tile away from Hjalmar. · **Greased Fur Pomade** (rare trinket): +1 move. Hjalmar can't be opportunity-attacked. · **Bottomless Sack of Props** (legendary armor): +6 max HP. The first trap Hjalmar sets each turn costs 0 AP.

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

## 3. Whole-campaign sims (the balance pass starts here)

`tools/sim.sh` (`tests/sim/sim.js`, updated for v2 by the integrator: attacks of opportunity per fight, boss wind-ups,
start HP per fight kind, boss results split by a starting healer, `healers=`, `dump=1` for capped fights). Random
4-hero parties from all 16 heroes, DD.Run + DD.AutoPlay play the whole run (items, consumables, Blessings, events,
shops, taverns; smart route). Reports are in `.tmp/v2int/sim/` (scratch). AutoPlay is a decent but not a great player:
it dodges almost every boss wind-up, but it almost never fires signatures and rarely plays setup skills (§4).

### 3.1 Campaign outcome by difficulty
| difficulty | runs | campaign wins | act 1 cleared | act 2 cleared (of entered) | act 3 cleared | levels at bosses (act 1/2/3) |
|---|---|---|---|---|---|---|
| casual | 60 | **72%** (CI 59-81) | 80% | 94% | 96% | 2.1 / 3.3 / 4.6 |
| **normal** | 200 (2 × 100) | **42.5%** (85/200) | **66.5%** | 74% | 87% | 2.0-2.1 / 3.2-3.3 / 4.6 |
| normal, act 1 only | 200 (fresh seeds) | — | **67%** (CI 60-73) | — | — | 2.1 |
| brutal | 80 | **0%** (CI 0-5) | 33% | 4% (1/26) | — | 2.0 / 3.3 / — |
| brutal, hp ×1.1 dmg ×1.1 (lever test) | 60 | 10% | 47% | 25% | 86% | 2.0 / 3.2 / 4.4 |

Reference, v1 integrator sims: normal 92%, brutal 68%, casual 100%. v2 is much harder, as the user asked.

### 3.2 Bosses (normal; win rate, avg rounds, party HP lost, downs per fight)
| boss | all parties | with a starting healer (Ellaria / Josiah) | without | rounds | HP lost | downs |
|---|---|---|---|---|---|---|
| Grimble | **66%** (56/85) + 66% (67/101) act-1 batch | 80% / 84% | **48% / 49%** | 8.3 | 56% | 2.7 |
| Rat King | **69%** (77/112) + 69% (66/96) act-1 batch | 87% / 94% | **53% / 53%** | 9.3 | 53% | 2.5 |
| Lich-tenstein | 93% (49/53) | 94% | 88% | 8.6 | 37% | 1.9 |
| Dr. Iris | 91% (49/54) | 87% | 100% (14/14) | 9.7 | 42% | 1.1 |
| Dungeon Master | 94% (85/91) | 98% | 79% | 7.6 | 23% | 0.8 |

Parties reach the act-1 boss at ~85% HP. Casual: Grimble 83%, Rat King 75%. Brutal: Grimble 35%, Rat King 53%.

### 3.3 By fight kind (normal, 200 runs; ranges = the two 100-run batches)
| kind | win | HP lost (net) | rounds | fights with downs | downs/fight | signatures/fight | Hype reached 100 |
|---|---|---|---|---|---|---|---|
| act 1 normal | 99-100% | 13% | 4.6-4.8 | 13-15% | 0.18-0.26 | 0.15-0.19 | 27-31% |
| act 1 elite | 100% | 13-17% | 6.6 | 24-26% | 0.4-0.5 | ~0 | 0-2% |
| act 1 boss | 66-69% | 53-56% | 8.7-9.0 | 70-80% | 2.5-2.7 | 0.06 | 16-18% |
| act 2 normal | 94-95% | 19-20% | 6.2-6.3 | 49-60% | 1.1-1.4 | 0.18 | 25-28% |
| act 2 elite | 82-88% | 18-25% | 7.5 | 52-57% | 1.2-1.4 | 0.3-0.4 | 24-46% |
| act 2 boss | 90-93% | 39-40% | 9.1-9.2 | 48-51% | 1.3-1.6 | 0.04 | 5-8% |
| act 3 normal | 98% | 16% | 5.9 | 40% | 0.9 | 0.02 | 5% |
| act 3 elite | 95-97% | 12-18% | 7.5-8.0 | 50% | 1.1 | 0 | 7% |
| act 3 boss | 91-96% | 22% | 7.5 | 39% | 1.0 | 0 | 5% |

Attacks of opportunity are rare and mostly a deterrent: per normal fight 0.11-0.14 by heroes (0.4-0.5 damage) and
0.28-0.35 by enemies (1.2-1.5 damage); elites 0.3-0.5 by heroes; bosses ~0.25 each way. Enemies that start next to a
melee hero stay and fight (reach-aware targeting works: see the hero owners' notes).

Boss wind-ups (normal): ~9 announced per boss fight, 1.6-1.8 interrupted, ~6 land and hit someone ~1 time a fight
(13-15 HP + Block a fight). AutoPlay reads them exactly and steps out; humans will be hit more.

### 3.4 Encounters (normal, 200 runs; win · rounds · party HP lost · downs per fight)
- Act 1 normal: slime_time 100% · 4.4 · 7% · 0.0 · rats_in_the_cellar 100% · 4.0 · 8% · 0.0 · web_of_lies 100% · 5.1 ·
  8% · 0.3 · big_flush 100% · 5.0 · 5% · 0.2 · fungus 100% · 4.4 · 11% · 0.1 · open_mic 99% · 4.6 · 21% · 0.5 ·
  union_meeting 98% · 5.4 · 20% · 0.6 · goblin_ambush 100% · 4.8 · 25% · 0.3.
- Act 1 elite: cube 100% · 9% · mimic 100% · 16% · last_call 100% · 17% (0.2-0.7 downs).
- Act 2 normal: forbidden_buffet 98% · 7% · bottomless_brunch 100% · 14% · rooftop_critics **87%** · 16% · 1.7 downs ·
  last_coffee **86%** · 17% · 1.6 · unpaid_internship 95% · 21% · graveyard_shift 98% · 24% · follow_the_lights **91%** ·
  27% · **2.2 downs** · cub_scouts 100% · 28% · 1.1.
- Act 2 elite: office_hours **65%** (n 14) · 35% · 2.4 downs · its_alive 80% (n 10) · mama_bear 95% · tenure_review 100%.
- Act 3 normal: 92-100% (influencer_collab 92%, snack_heist 94%), 9-25% HP lost, 0.3-1.4 downs. Act 3 elite 95-100%.

### 3.5 Hero downs by cause (normal, share of all 1,920 hero downs in 200 runs)
wisp Swamp Gas Zap 5.8% · skeleton intern Coffee Run 5.4% · Rat King Tangled Tails 4.7% · Grimble Rubber Stamp 4.1% ·
Lich Overdue Notice 3.9% · Rat Pile 3.6% · cultist latte 3.5% · imp Hot Take 3.4% · Rat King gavel 3.4% · Grimble
Garnish Wages 2.9% · zombie 2.8% · banshee 2.7% · imp Go Live! 2.6% · eyeball stare 2.6% · Grimble's Audit 2.2%. Downs by act:
706 / 793 / 421 (acts 1 / 2 / 3, all runs; fewer runs reach act 3).

### 3.6 Heroes (normal, 200 runs; per fight; AoO = attacks of opportunity made / suffered)
| hero | runs | run wins | dmg | summon dmg | kills | taken | heals | downs | AoO m/s |
|---|---|---|---|---|---|---|---|---|---|
| `ellaria` | 51 | 76% | 48.9 | 8.6 | 2.05 | 12.0 | 15.2 | 0.16 | 0.16/0.12 |
| `josiah` | 53 | 68% | 35.9 | 4.5 | 1.35 | 12.2 | 19.7 | 0.11 | 0.06/0.11 |
| `kiri` | 48 | 52% | 61.1 | 0.1 | 2.46 | 10.8 | 0.7 | 0.21 | 0.00/0.02 |
| `zarathor` | 51 | 47% | 61.0 | 0.3 | 2.65 | 10.0 | 0.9 | 0.22 | 0.01/0.03 |
| `betty` | 51 | 45% | 30.0 | 0.3 | 1.20 | 15.4 | 4.9 | 0.16 | 0.04/0.07 |
| `syllamin` | 57 | 44% | 49.7 | 0.3 | 2.10 | 10.2 | 0.4 | 0.26 | 0.00/0.03 |
| `marbles` | 39 | 41% | 33.0 | 0.1 | 1.51 | 13.9 | 1.8 | 0.27 | 0.02/0.10 |
| `sparrow` | 63 | 38% | 35.5 | 0.7 | 1.39 | 10.1 | 3.6 | 0.40 | 0.05/0.07 |
| `buga` | 55 | 38% | 34.8 | 0.4 | 1.52 | 11.2 | 0.3 | 0.24 | 0.00/0.05 |
| `valdris` | 55 | 38% | 19.7 | 0.3 | 0.86 | 9.6 | 0.1 | 0.13 | 0.04/0.04 |
| `pebbles` | 53 | 37% | 36.7 | 0.6 | 1.40 | 13.1 | 2.8 | 0.23 | 0.09/0.07 |
| `slate` | 50 | 34% | 32.3 | 0.1 | 1.29 | 12.9 | 0.5 | 0.19 | 0.04/0.07 |
| `hjalmar` | 46 | 30% | 39.0 | 0.6 | 1.79 | 10.3 | 0.3 | 0.26 | 0.01/0.06 |
| `basanos` | 40 | 28% | 27.4 | 0.2 | 1.26 | 16.6 | 1.8 | 0.36 | 0.07/0.17 |
| `corelos` | 44 | 27% | 47.8 | 0.7 | 2.00 | 11.3 | 0.3 | 0.35 | 0.01/0.07 |
| `marwyn` | 44 | 27% | 25.9 | 0.4 | 1.00 | 15.6 | 0.7 | 0.29 | 0.11/0.07 |

Median run-win share ~38%. Skill usage per socketed fight (normal): basics lead everywhere (Kiri 7.3, Hjalmar 6.3,
Corelos' Rune Bolt 6.2, Syllamin 6.2); starters are used 0.5-4 times a fight except Basanos' Shoulder Check (0.2),
Marwyn's YEET (0.3) and Kiri's Phase Shot / Ethereal Step (0.5). **Signatures are almost never fired** (0-0.1 a fight
for every hero; Hype reaches 100 in ~23% of normal fights). Never used while socketed ≥ 10 fights: only Sucker Punch on
ranged heroes (Josiah, Kiri).

### 3.7 Gold and loot (normal, per run)
Earned ~540 gold; spent in shops ~200 (1.1-1.3 visits, ~240 gold on entry); events +9 to +16; gold at the final boss
~375; ~330 left unspent at the end. Rewards taken per 100 runs: ~475 items, ~215 heals, ~165 skills, ~150 upgrades.
Level-up boons: ~510 learns, ~390 upgrades, ~48 perks per 100 runs. ~9 permanent hero deaths per 100 runs.

---------------------------------------------------------------------------------------------------------------------

## 4. Balance observations (for the balance pass; nothing below was retuned by the integrator)

1. **The first boss is on target on average and swings hard with party composition.** Grimble 66% and the Rat King
   69% over ~400 boss fights (target 60-70%). But a party with Ellaria or Josiah (the only heroes who *start* with an ally
   heal) wins 80-94%, a party without them 48-53%. Over whole runs: no starting healer → 18% campaign wins and 49% die
   in act 1 (105 runs); one → 66% / 17% (86 runs); both → 9/9. Run-win share: Ellaria 76%, Josiah 68% against a median
   of ~38%. Parties reach the boss at ~85% HP on average; the healers heal 15-20 HP a fight on top.
   This probably *is* the user's "first boss is pretty much unbeatable" for some parties. Levers to test: more
   healing access for everyone (a heal in more starting kits or as an early generic tome / reward, Help Up for more HP),
   or a slightly softer act-1 boss with a stronger act 2-3 (see 2).
2. **The difficulty curve is inverted after act 1.** Act 2 bosses 91-93% and the DM 94% (boss authors measured 63-75%
   with item-less, Blessing-less parties; the campaign gives levels 3.2 / 4.6 plus loot). Most campaign losses happen in
   act 1 (115 of 200 runs lost: 67 in act 1, 35 in act 2, 13 in act 3). "A full campaign is a real achievement" holds
   at 42.5%, but the end bosses are the easy part. The act 2 normal fights and the act 2 elites (Office Hours 65%) are
   the real middle wall.
3. **Act 1 regular fights are mild.** 13% HP lost, a down in 13-15% of fights (user: "regular fights hurt and someone
   often goes down"). Openers (slime_time, rats_in_the_cellar, web_of_lies, big_flush) cost 5-8% HP and ~0 downs.
   Act 2 normal fights (49-60% with downs, 1.1-1.4 downs) are where the user's target already holds.
4. **Brutal is unwinnable for AutoPlay** (0/80 runs; act 2 normal fights 54% wins, 3.3 downs a fight). Its knobs
   (`DD.Balance.difficulty.brutal` hp 1.25 / dmg 1.2 + `extraEnemies.brutal.normal: 1`) were set for v1 (68% wins).
   hp/dmg 1.1 alone gives 10% (act 2 cleared 25%), so the extra act-2 grunt is the bigger lever. Casual (72%) is fine.
5. **Signatures barely fire** in AutoPlay (it holds Hype for a crowd or a boss, and boss fights rarely reach 100).
   Humans will fire them, so sims understate the party a little; the Hype economy itself looks fine (100 Hype in ~23%
   of normal fights, mostly from kills and environmental kills).
6. **Gold piles up** (~330 unspent at the end, ~375 at the DM). Shops are visited ~1.2 times a run. More gold sinks or
   less gold income would both be fine; Zarathor's Drip Check (max at 150 gold) is always maxed late.
7. **Divers top the downs list**: the act-2 wisp's Swamp Gas Zap is the #1 cause of hero downs (5.8%), the act-3
   imp is #8. Both are deliberate "sneaky" divers; worth watching given the user's "mobs dive the lowest-health hero".
8. Hero spread (run-win share, normal): healers on top (see 1); Kiri 52%, Zarathor 47%, Betty 45%, Syllamin 44% next;
   Corelos 27%, Marwyn 27%, Basanos 28%, Hjalmar 30% at the bottom (n 40-63 runs each, ±7%). Damage per fight: Kiri and
   Zarathor 61, Syllamin 50, Ellaria 49, Corelos 48; Valdris 20 (his value is in allies' hits), Marwyn 26, Basanos 27.
   Attacks of opportunity made per fight are ≤ 0.16 for every hero (Ellaria's corgis lead): the rule works as deterrence.

---------------------------------------------------------------------------------------------------------------------

## 5. Open requests (collected from every area's notes; owner → request)

**Lead (docs, design decisions)**
- DESIGN §6 hero briefs still describe v1 for Zarathor (wild surges in the passive, chaos bolt), Syllamin ("telegraph
  manipulation", Heckle redirect), Marbles (Thumper, deflect/counter, chain-dash signature), Marwyn, Josiah (unlock,
  brewing passive, Healing Draught), Sparrow (unlock, v1 passive), Corelos (unlock, cancel intents, Terms &
  Conditions), Slate (unlock, grapple cancels telegraphs, Rage drain, Stone Skin), Buga (v1 kit, unlock). Betty, Hjalmar,
  Pebbles and Valdris briefs can list their final kits (Valdris: Reinforce became Spiked Pauldrons). §3 still says
  "all 10 heroes"; §11 lists hero events for ten. Each owner's notes have the v2 text.
- Document the attack-of-opportunity details (DESIGN §4.2, ARCHITECTURE §6.2 / §5.1): melee = max range 1, never tagged
  `ranged`, area skills only if tagged `melee`; nobody on the heroes' side strikes a charmed enemy; the strike is aimed
  at the mover even on a friend's tile (`DD.Grid.onTop`); a body downed on a friend's tile is moved off; fight rules'
  opportunity hooks run once; path ties go to the less harmful walk.
- ARCHITECTURE §3.4 items (`stats.block` ignored, `stats.init`), §3.6 the enemy-level `passive: { name, icon, desc }`
  field, §3.10 narration keys `initiative` and `objective_failed`, §3.1 `resist` / `flags.immune` on heroes, §8 UI
  (combat consumes Enter, input guards, `UI.inShowGuard`, long `UI.choice`, `screen=levelup`, `DDdbg.levelUp`).
- DESIGN §5 / §9 the DM is 400 HP with 20-damage rolls (v2 shape: one action + one wind-up a turn, two actions in
  phase 3); §7 "Energy Drink (+2 AP)", Tactical Retreat = generic Disengage, armor wording, Overcaffeinated example;
  §8 name the divers (Cellar Spider; wisp + gargoyle; imp) and the elite wind-ups.
- Design calls left open by the owners: Zarathor's starters (Throw Money + Wild Card for the wild-magic identity;
  needs the ui test's POOL updated); overlapping skills from the briefs (Fabulous Strut ≈ Hot Zoomies; Butt Out ≈ Use
  Your Head; Get Off My Lawn ≈ LOOK AT MARWYN! ≈ Hold the Line; Power Ballad text = Howl; Hjalmar's Firecracker /
  Bear Trap ≈ Corelos' glyphs); Plot Armor keeps a walk going at 1 HP (Phoenix Feather ends it).

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
  The registry suite asks for 9-11 pool skills (DESIGN: 8-10).

**AutoPlay (`js/engine/autoplay.js`)**
- Signatures almost never fire; melee heroes spend 23-34% of turns only walking (statusGain's flat 1.5 for self-buffs);
  it plays the hero before its summons (Zoomies, Murder of Crows, Switcheroo rarely used); no two-step disengage
  (Tactical Retreat); deterrents and acting first are invisible to it (Hall Monitor, Loaded Dice, the Polearm); no
  next-turn-buff term (Valdris, Bedazzle); Infernal Debt / Debt costs are unmodelled; fire treated as a hazard by
  Pebbles. New from the integrator: a Help-Up loop against a boss that re-downs the helped heroes every round (3 casual
  boss fights hit the 30-round cap: two Rat King, one DM; `dump=1` shows Buga and Slate helping Betty and Syllamin up
  every round while the King downs both again).

**HUD / UI / render**
- Threat shading nearly invisible on warm floors (renderer fill / outline); a provoking walk's own look; the title
  campfire still uses a 9-hero order (`renderer.js` HERO_ORDER: the six new heroes never sit at the fire); portraits
  don't follow forms (werewolf, Wild Shape); `invalidReason` never shows a skill's canTarget refusal; inspect pills for
  `noProvoke` / `noOpportunity`; the Abilities box shows 4 slots; hero resistances in the inspect panel; the DM's head
  behind the objective panel; `UI.statLines` has no initiative line; Loaded Dice's extra dice; optional trap counter.

**Items / sprites / narrative**
- Items: `balloonSprite` wraps the on-screen pin, so Party Balloons vanish after a Basanos Transform until his next
  skill (FX queued). Render-sprites: hand positions for overlays (werewolf claws); unit-behind-unit silhouettes.
- Narrative (optional): an `opportunity` narration key.

**Balance pass**: §4, and the owners' documented knobs (each enemy / boss notes file lists its knobs; Syllamin, Kiri,
Zarathor and Buga notes list hero levers). `tests/balance_tests.js` is reserved in the manifest.

---------------------------------------------------------------------------------------------------------------------

## 6. Known issues (cross-cutting; per-area lists are in the owners' notes)

- AutoPlay sims understate human play in some ways (signatures, setup skills, summons) and overstate it in others
  (it dodges ~95% of wind-ups and solves every boss puzzle from exact hints). Treat sim numbers as a floor/ceiling mix.
- A Help-Up loop can stall a boss fight under AutoPlay (casual only so far: 3 of 759 fights hit the cap). Not a game
  bug: a human party is not forced to keep helping up.
- The display names "Chew Toy" (Pebbles / hell hound bite), "Chomp" (Ellaria / mimic), "Glitter Bomb" (Syllamin /
  pixies), "Pounce" (Basanos / hell hound), "Red Tape" (Buga / Grimble) and "Objection!" (imp lawyer / rules lawyer /
  rat) are shared between a hero skill and an enemy skill; the combat log names the user, so it reads fine.
- Enemies without an explicit init use the tier default (both act-2 bosses and five boss minions).
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
- **Perf gate (render-world).** At rest, 135° on boss_dm (+3.1 ms) and 30° on boss_lichtenstein (+2 to +3 ms) exceed
  the +1.5 ms budget. The cost is extra silhouettes only; frames stay far under 16.7 ms.
- **Fit at diagonal views (HUD).** After `fitMap`, 2-9 tiles can sit under the combat log; the HUD needs to report the
  log's box to `computeFit`.
- **Render.** A status that grants flight doesn't hover the sprite (no content uses one yet).
- **Design call.** Under the floor rule, flyers can no longer pocket Hoard Piles or gold piles: keep it or carve it out.
- **Balance pass.** Flying enemies now ignore hero floor effects (a small buff). Re-sim a2_follow_the_lights, the act 3
  imp encounters, a3_hoarders_lair and the act 2 bosses.
- **This digest.** §2 kit texts other than Josiah's predate small Nov 3 desc tweaks (Glitter, Keg Stand, Brambles /
  Entangling Roots now say "grounded"). narrator.js gained 4 tips (flyers, barrels, aimed heals, turning the map) and an
  idle-DM line.
- **AutoPlay.** The Rat King Help-Up loop (§6) still fails `bosses_act1: rat king autoplay sims` in isolated fixture
  runs.
