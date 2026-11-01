# Dungeons and Degenerates — Game Design

> *"A tactical roguelike for people who should be doing their homework."*

An isometric, turn-based tactical roguelike. You draft a party of four "degenerates" — a fake D&D party built from the
player's real campaign characters — and drag them through **The Campaign**: three acts of branching encounters, each
ending in a boss, with **The Dungeon Master** himself as the final boss. Combat is tactical (v2: everyone acts in
rolled initiative order and enemies act without telegraphs; positioning, pushes, terrain, control and timing
matter). It is **not** D&D: no d20 to-hit rolls, no spell slots, no saving throws — the only d20 is initiative —
just clean, deterministic tactics with a little wild-magic chaos on top.

Technical contract: `docs/ARCHITECTURE.md`. This doc is the design intent + content guidance.

---------------------------------------------------------------------------------------------------------------------

## 1. Pillars
1. **Initiative and improvisation (v2).** Everyone rolls initiative and acts in turn order, heroes and monsters
   alike. Enemies act without warning (only bosses wind up their biggest attacks), so you read the board — threat
   ranges, positioning, terrain — not a script. Fights are hard: no free Block, no Guard. Losing a hero should feel
   like *your* mistake. Bosses are puzzles with patterns, not damage sponges.
2. **Build your degenerates.** Slow, shared levels, 4 socketed skills (I → II → III upgrades, replacing to learn new
   ones), items, scars, random Blessings, Hype-powered signature moves. **Skills are simple; combinations are strong**
   — synergy between heroes is the fun.
3. **Comedy everywhere.** Skill names, barks, enemy names, items, events, narration, death screens — every surface
   gets a joke, but mechanics text stays crystal clear.
4. **One more run.** Short runs (~45–75 min), branching maps, random rewards, unlockable heroes.

## 2. Tone & comedy guide
- Voice: an affectionate roast of tabletop gaming. The narrator is **The DM** — snarky, sleep-deprived, secretly
  proud of the players, fudges dice, eats Cheetos, threatens "rocks fall" whenever annoyed.
- Comedy sources: tabletop in-jokes (rules lawyers, natural 1s, the bard seducing things, session zero, snacks,
  "I check for traps", murderhobos, the party splitting, the DM's pet NPC), character personality, puns,
  bureaucratic monsters (tax goblins, union kobolds, overdue-library liches), mundane problems in a fantasy world.
- Keep it PG-13. Mild innuendo OK; no slurs, no punching down, no real-world politics. The eight heroes are the
  player's real campaign characters — roast them **affectionately**; never make them pathetic or mean-spirited.
- Mechanics text is plain and exact ("Deal 8 fire damage. Push 2."). Jokes go in names, `flavor`, barks and narration.
- Lines are short. Barks ≤ 70 characters. Flavor ≤ 120. Event text 2–5 sentences.

## 3. Run structure & meta progression
- **Party select**: choose 4 unlocked heroes + difficulty (Casual / Normal / Brutal). "Roll for Party" randomizes.
- **Acts** (3): each act is a branching map of 7 rows + a boss row. Node types: ⚔ Combat, 💀 Elite, ❓ Event,
  🛒 Shop, 🍺 Tavern, 💰 Treasure, 👑 Boss. Row 0 is always combat; row 6 is always taverns (rest before the boss);
  elites only from row 2; at most one shop per row. Moving is always forward along links.
  - Act 1 — *The Leaky Flagon's Basement* (cellar, sewers, goblin warrens).
  - Act 2 — *The Hauntwood & the Necromancy Academy (Accredited)* (forest, graveyard, haunted library).
  - Act 3 — *Behind the DM Screen* (hellscape, dragon hoard, the DM's actual table).
- **After combat**: gold, **one hero levels up** (below), then **pick 1 of 3 rewards** (item / skill tome for a hero /
  consumable / gold pile / skill upgrade). Elites always offer a rare item; bosses a legendary.
- **Leveling is slow and shared (v2, user request).** There is no XP. After every won fight exactly **one** living
  hero gains a level. The rotation is fair and random: the hero is drawn at random from those with the **lowest**
  level, so every hero reaches level N before anyone reaches N+1 (a party of 4 each levels about once per 4 fights).
  The rewards screen announces who it is ("The DM rolls a d4... Marwyn levels up!"). Events/treasures that "grant
  experience" grant extra level-ups through the same rotation (or to a named hero). Recruits join at the party's
  lowest level. Dead heroes are skipped. Max level 10 (a long run ends around level 5–6).
- **Level-ups**: +HP growth, a **roll on the Table of Questionable Blessings** (random passive, see
  §7.1), then choose 1 of 3: *learn a new skill* (from that hero's pool), *upgrade a socketed skill* (+1 level,
  max III) or a *perk* (+4 max HP / +5% damage / +1 move once at L5+).
  Heroes socket **4 skills max**: learning a 5th forces you to **replace** one (the replaced skill is forgotten —
  "Professor Marbles forgot it. He forgets things.") or skip. Heroes also hold **4 random passives max** (§7.1),
  on top of their own built-in passive.
- **Shop** (*Ye Olde Overpriced Shoppe*): 3 items, 2 skill tomes, 2 consumables, services (heal 30%, remove a scar).
- **Tavern**: choose one — *Rest* (heal 35% max HP, remove 1 scar), *Train* (upgrade one skill), or *Recruit*
  (swap a party member — dead or alive — for an unlocked hero not in the party, at party average level).
- **Death**: a downed hero revives after combat at 1 HP with a **Scar** (comedic permanent debuff, e.g.
  "Trick Knee: −1 move", "Bruised Ego: −5% damage"). The **third** down in a run kills them permanently
  ("written out of the campaign"). All heroes downed in combat = **TPK** → game over.
- **Unlocks (v2, user request): all 10 heroes are available from the start** — every hero def has `unlock: null`.
  The unlock machinery (`unlock: { act }` / `{ boss }`, DD.Meta unlock lists, the act-clear unlock banner, the
  "I'm the DM's Favorite" toggle) stays in the code for possible future use but unlocks nothing today.
  (Previously: Josiah after Act 1, Sparrow after Act 2, Corelos after the DM, Mayor Buga after Grimble, Slate after
  Lich-tenstein.)
- Hall of Fame: runs, wins, best act, kills, deaths, unlocked heroes, enemy codex.

## 4. Combat
### 4.1 Flow — initiative and individual turns (v2, user request)
1. **Deployment** — heroes may swap and reposition freely in the green start zone.
2. **Roll for initiative!** Every hero and enemy rolls **d20 + its initiative modifier** (`init`; heroes and enemies
   each have one — quick faeries and goblins high, golems and gelatinous cubes low). Ties: higher modifier, then
   heroes, then a coin flip. The order is shown on the **initiative tracker** and stays fixed for the fight (a
   dramatic dice moment + DM line). Units that join later (reinforcements, enemy summons) roll on arrival and act
   from the next round. Hero summons (corgis, the raven, imps, ducks) act during their owner's turn.
3. **Rounds** — every unit takes one turn in initiative order; when the last one is done a new round starts
   (round-based effects, surfaces, reinforcements and "survive N rounds" count rounds).
   - **Hero turn**: that hero (and its summons) gets 3 AP — move, skills, consumables, interactions — then End
     Turn. **Unused AP is lost: there is no Guard.**
   - **Enemy turn**: the enemy decides and acts at once (move + attack). **No telegraphs** — read the board: the
     inspect panel shows each enemy's move, reach and abilities, and a hold-to-show **threat shading** marks every
     tile enemies could hit before your hero's next turn.
   - **Boss wind-ups**: a boss's few biggest attacks announce themselves when it begins them (banner, marked tiles,
     ⏳) and land at the start of its next turn — your window to dodge, shove, stun or work the puzzle.
4. **Block** only comes from skills (and a few items/passives used mid-fight). Nobody starts a fight with Block;
   Block lasts until the start of its owner's next turn.

Positioning still matters: enemies act from where they stand, so pushing a goblin out of reach, rooting the
charger, stunning the caster before its turn or killing the archer first all change what happens next.

### 4.2 Actions
- **Move** (1 AP): up to `mov` path cost. Several moves per turn are allowed if AP remains.
- **Basic attack** (usually 1 AP) — always available, themed per hero.
- **4 socketed skills** (1–3 AP, cooldowns, some HP costs).
- **Signature** (100 Hype + AP) — one dramatic, comedic ultimate per hero.
- **Consumables** (1 AP, party inventory of 3). **Interact** (levers, chests, fountains: usually 1 AP).
  **Help Up** a downed adjacent ally (2 AP → revive at 25% HP).
- **No Guard** (v2): unused AP is simply lost.
- **Deployment**: before initiative is rolled, heroes may be freely swapped within the green start zone.
- **Undo move**: the current hero's last move can be undone if nothing else happened since.

### 4.3 Battlefield
- **Elevation** 0–4. Climbing costs +1 per level, max +1 per step (Professor Marbles hops +2; flyers ignore).
  Attacking from higher ground: **+25% damage**. Tall terrain blocks line of sight.
- **Terrain**: floors per theme · walls · water (cost 2, makes Wet, puts out Burn) · deep water · mud (cost 2) ·
  ice (pushed units slide 1 extra) · lava (8 fire damage + Burn on entry) · pits (pushed non-boss enemies die
  instantly — "YEET"; heroes/bosses take 25% max HP and climb out) · rubble.
- **Objects**: crates/barrels (destructible cover), explosive barrels (fire explosion r1), pillars/trees/rocks
  (block movement + LOS), bushes, spikes (damage on entry), pressure plates, levers (puzzle wiring), chests
  (interact: bonus loot), fountains (interact: heal), braziers (knock over → fire), totems (objective targets),
  bookshelves, mirrors (boss puzzle), giant dice (DM table).
- **Surfaces** (temporary tile layers): fire, poison, water, oil, ice, blood, web (root on entry), steam/smoke
  (block LOS), holy ground (heals heroes), cheeto dust (DM table, comedic slow).
- **Elements**: fire ignites oil, evaporates water into steam, burns webs, melts ice, detonates barrels; frost
  freezes water; lightning electrifies whole water bodies (damage + stun everyone standing in them); water
  extinguishes fire and cools lava to stone. Push enemies into hazards — **environmental kills** grant big Hype.

### 4.4 Status semantics (normative; `js/data/statuses.js`)
| id | Effect |
|---|---|
| burn | End of its turn: take `stacks` fire damage, then stacks −1. Removed by water/Wet. |
| poison | Start of its turn: take `stacks` poison damage (ignores Block), then stacks −1. |
| bleed | Each move action or forced movement (push/pull): take `stacks` damage and leave blood. Stacks −1 at its turn end. |
| stun | Loses its next turn (heroes: 0 AP; enemies: intents cancelled at once). Removed at the end of that turn. `stunImmune` ignores. |
| root | Can't take move actions (can still be pushed). |
| weak | Deals 25% less damage. |
| vulnerable | Takes 25% more damage. |
| taunt | (enemy) Its intents are redirected at the taunter if possible, otherwise cancelled; next planning must target the taunter. (hero) −50% damage vs targets other than the taunter. |
| haste | Heroes/summons +1 AP at turn start; enemies +2 move. |
| slow | Heroes/summons −1 AP (min 1); enemies −2 move (min 1). |
| regen | Start of its turn: heal `stacks`. |
| stealth | Can't be targeted by enemy single-target skills; AI ignores it. Broken when it deals damage. |
| marked | The next damage it takes is increased by `stacks`; then removed. |
| dazzled | (enemy) At execution its intent target shifts 1 tile in a random direction (telegraph shows "?"). (hero) −1 max range. |
| confused | (enemy) At execution its attack direction rotates by a random quarter turn (may hit friends). (hero) Move costs 2 AP. |
| charmed | (enemy) Plans and attacks against its own side this round. (hero) Can't damage the charmer; −1 AP. |
| inspired | Deals 25% more damage. |
| wet | Can't Burn; takes +50% lightning damage; frost makes it Frozen. |
| silenced | Can't use `kind: 'spell'` skills; enemy spell intents are cancelled. |
| sleep | Like stun, but wakes when damaged. |
| invulnerable | Takes no damage. |
| frozen | Like stun; takes +50% physical damage; fire damage thaws it. |
| thorns | When an adjacent attacker damages it, deal `stacks` damage back. |
| empowered | Its next damaging skill deals +50% (consumed). |
| sheep | Polymorphed: can only move (mov 2), no skills, enemies have no intents. "Baa." |

v2 (initiative, no telegraphs): durations count the **owner's own turns** — `turns` ticks at the end of the
owner's turn, so a debuff with `turns: 1` applied to an enemy covers that enemy's next turn, and a hero buff with
`turns: 1` lasts until the end of that hero's next turn. Rows above that mention intents now mean the enemy's next
turn: stun/sleep/frozen = it skips its next turn; taunt = on its next turn it must attack the taunter if it can;
dazzled = its next attack lands 1 tile off in a random direction; confused = its next attack's direction is
rotated; charmed = on its next turn it fights for your side; silenced = no spells on its next turn; sheep = can
only move.

### 4.5 Hype & signatures
Party Hype 0–100 (starts at 0 + items). +8 per kill, +20 per environmental kill, +4 when one hero skill hits 2+
foes; passives add more (Syllamin, Marwyn). A signature costs 100 Hype — roughly one per fight if you play well.
Signatures should feel like a set-piece: banner text, big FX, a bark.

### 4.6 Objectives
Kill all (default) · Kill the boss · Survive N rounds · Destroy N objects (e.g. summoning totems) · Protect an
object (e.g. "Protect the Last Keg") · Custom (boss puzzles). Optional chests on the map give bonus loot.

## 5. Numbers & balance targets
| | Act 1 | Act 2 | Act 3 |
|---|---|---|---|
| Minion HP / hit | 6–9 / 2–4 | 10–14 / 4–6 | 14–18 / 6–8 |
| Normal HP / hit | 12–20 / 4–6 | 20–30 / 6–8 | 28–40 / 8–11 |
| Elite HP / hit | 45–70 / 7–10 | 80–110 / 10–13 | 120–150 / 12–16 |
| Boss HP / hit / big telegraph | 150–200 / 8–12 / 18–25 | 260–320 / 10–14 / 22–30 | 420–520 (phases) / 12–16 / 25–35 |
| Enemies per normal fight | 3–5 | 4–6 | 4–6 |

- v2 note: the enemy numbers in the table above predate initiative order, the removal of Guard and the slower
  leveling; the v2 balance pass retunes them (and this section) for **challenging** fights.
- Heroes L1: HP 20–36, AP 3, move 3–5, initiative modifier −2..+4. Growth +3–5 HP/level. With one level-up per won
  fight (v2) a party is about level 2 at the Act 1 boss, 3–4 at the Act 2 boss and 5 at the DM.
- Hero basic attack 4–6. Skill (L1): single target 7–10 for 2 AP, AoE 4–6 per target for 2 AP, cooldown 1–3.
  Level II ≈ +25%, level III ≈ +50% or one added rider. Signature: 15–25 damage or a game-changing effect.
- Fights last 4–7 rounds. Expect to take damage every round; positioning, control and healing keep it fair.
- No XP (v2): one hero levels up per won fight (§3).
- Gold: start 60. Normal fight 12–20 (+6/act), elite 35–50, boss 80–100. Prices: common item 40, rare 80,
  legendary 150, consumable 20–35, skill tome 60, scar removal 45, heal 30.

## 6. Heroes
Every hero file (`js/data/heroes/<id>.js`) registers: the hero, its passive (with hooks), a basic attack, a
signature, a pool of **9–11 skills** (2 of them starting), any custom statuses/summons it needs, a distinctive
SpriteSpec, and 3–6 barks per key. Requirements for every kit:
- A clear role, tools that control enemy turns (stun, sleep, root, taunt, charm, push out of reach) and positioning
  (push, pull, teleport, terrain, surfaces). At least 2 skills that create combos with *other* heroes.
- **Simplicity (v2, user request: "skills are too overcomplicated, doing too much each — simplify them so that it's
  the combinations of effects that feel strong")**:
  - **One verb per skill**: a primary effect (damage, heal, move, buff, debuff, summon, terrain) plus **at most one**
    simple rider (one status, one push/pull, or one surface). No if/else chains, no hidden extra clauses, no
    "and then also", no per-skill mini-systems. The desc reads in one breath (about 12 words + numbers).
  - **Levels**: II = bigger numbers; III = bigger numbers or ONE added simple rider.
  - **Combos carry the power**: shared statuses (Wet → lightning, oil → fire, Marked, Vulnerable, Rooted, Stunned,
    the hero's own signature status), positioning (pull into a cleave, push into pits/lava/allies), surfaces and
    Hype. Each hero has 2–3 clear setup or payoff skills that pair with other heroes.
  - **Passive**: one clear rule, still the character's comedic core.
  - Pool of **8–10 skills** (2 starting): fewer, sharper skills beat many fiddly ones. Comedy stays in names,
    flavor and barks — not in rules text.
- Mix of AP costs (1–3), cooldowns and one or two "big" skills with charges/long cooldowns.
- Three meaningful levels per skill (numbers and/or a new rider at III). `desc` always exact for the level.
- The passive is the character's comedic core and must change how you play them.

### Zarathor, the Bedazzled — Tiefling Warlock *(starter)*
Fire-wielding tiefling obsessed with wild magic and **bling**. Gold chains, rings, gold tooth, maybe sunglasses
indoors. Thinks fire looks better with sequins. Role: ranged fire / chaos damage. ~24 HP, move 4.
Ideas: passive *Drip Check* (more damage the more gold the party holds; fire skills sometimes trigger a Wild
Surge via `DD.WildMagic.surge`). Skills that **spend gold** for power (Bling Throw, Gold Plating), a gaudy
Fireball, a tacky Hex (Vulnerable), Hellish Rebuke-style counter, chaos bolt that bounces, a strut-teleport that
leaves a fire trail, deliberately triggering wild magic. Signature: *Bling Supernova* (huge fire blast, dazzles
everyone, coins rain).

### Syllamin — Faerie Bard *(starter)*
Tiny, flying, foul-mouthed faerie (**he/him** — Syllamin is male) who **trash-talks** everything. Lute. Role:
support / debuff / telegraph manipulation. ~20 HP, move 5, flying. Ideas: passive *Heckler* — his damaging skills stack **Roasted**
(custom status: −damage per stack; at 3 stacks the target suffers *Emotional Damage* and is stunned). Basic
"Your Mom Joke". Skills: Hype Man (ally +AP), Inspiring Ballad (Inspired), **Heckle** (redirect an enemy's
intent onto another enemy), Discordant Shriek (cone push), Glitter Bomb (Dazzle), Fae Blink (teleport an ally),
Encore (reset an ally's cooldown), Lullaby of Mediocrity (Sleep). Generates extra Hype. Signature: *Diss Track*.

### Professor Marbles — Rabbitfolk Monk *(starter)*
Ancient, doddering rabbitfolk monk — forgetful, mumbling, naps mid-fight — and terrifyingly good at kung fu.
Spectacles, walking cane, one floppy ear. Role: mobile melee skirmisher / control. ~28 HP, move 4, `hop`.
Ideas: passive *Absent-Minded Mastery* — each turn he randomly "remembers" one socketed skill, which costs 0 AP
that turn (he also occasionally "forgets" — keep it net positive). Skills: Walking Stick Whack (push),
Flurry of Paws, Rabbit Punch (stun), **Marble Scatter** (marbles surface: enemies slip), Back In My Day
(deflect/counter), Thumper (stomp push AoE), Lecture (adjacent enemies fall asleep from boredom), Carrot Toss
(heal), Hare-Brained Leap. Signature: *Forgot I Was Retired* (chain-dash through up to 5 enemies).

### Marwyn the Magnificent — Human Barbarian *(starter)*
Huge ginger barbarian with wild-magic outbursts who refers to himself as **MAGNIFICENT** — often in the third
person, often in capitals. Enormous beard, furs, greataxe. Role: tank / bruiser / taunts. ~36 HP, move 3,
resists pushes. Ideas: passive *MAGNIFICENCE* — stacks from hitting, being hit and kills, each stack +damage;
at 5 stacks his next skill causes a **MAGNIFICENT SURGE** (wild magic). Skills: Magnificent Cleave, War Cry
("I AM MAGNIFICENT!" taunt + Block), Ginger Rage, Whirlwind, **Yeet** (throw an adjacent unit — friend or
foe — 3 tiles; collisions!), Headbutt (stun), Unstoppable Charge, Flex (Block + Thorns). Signature:
*BEHOLD, MARWYN!* (leap, slam, taunt everything, huge Block).

### Ellaria — Elf Druid *(starter)*
Serene elf druid who solves every problem by **summoning corgis**. Flower crown, leafy robe. Role: summoner /
healer / control. ~26 HP, move 4. Ideas: passive *Pack Leader* — starts each combat with a corgi; when a corgi
falls, allies are Inspired ("AVENGE BISCUIT!"). Corgi summon (`registerSummon`): small, 2 AP, bite, bark-taunt,
random names (Biscuit, Waffles, Sir Fluffington III, Nugget, Captain Loaf…). Skills: Thorn Whip (pull), Summon
Corgi, Entangling Roots, Barkskin, Fetch! (a corgi drags a target), Healing Spring (surface), Zoomies, Wild
Shape: Absolute Unit (become a giant corgi). Signature: *Release the Corgis!*

### Josiah — Plague Doctor *(unlock: clear Act 1)*
Beaked plague doctor who brews questionable potions and commands a raven. Long coat, wide hat, smoke from the
beak. Role: healer / poison DoT / summon. ~26 HP, move 4. Ideas: passive *Apothecary* — +1 consumable slot and
a chance to brew a potion after each victory (via `state.run`/`onCombatEnd`); starts combat with his raven
(summon, flying, Peck + Mark). Skills: Plague Flask (Poison), Healing Draught, Miasma (poison cloud),
Leeches (drain), Raven Dive, Quarantine (root + vulnerable), Vaccinate (cleanse + debuff immunity), Volatile
Concoction (fire explosion), Smelling Salts (revive at range), Murder of Crows. Signature: *Pandemic*.

### Sparrow — Goblin Blood Mage *(unlock: clear Act 2)*
Small, scrappy, edgy goblin who pays for spells **in blood** (theirs, ideally someone else's). Daggers, red
runes on skin. Role: high-risk assassin / caster. ~22 HP, move 5. Ideas: passive *Blood Price* — more damage
the lower their HP; healing when standing in blood. Many skills cost HP. Skills: Shiv (Bleed), Hemorrhage
(AoE Bleed), Blood Bolt, Sanguine Shield (HP → Block), Exsanguinate (drain bleeding target), Goblin Scramble
(dash + stealth), Blood Puppet (move an enemy by its blood), Pocket Sand, Blood Clone (decoy summon).
Signature: *Crimson Tide*.

### Corelos — Runic Sorcerer *(unlock: beat the DM)*
Sorcerer whose skin and staff glow with runes, with a terrible habit of **making dark bargains** — he signs
anything. Role: rune traps + bargain burst. ~24 HP, move 4. Ideas: runes are tile traps that explode when
enemies enter or when detonated (enemies move during planning — runes punish their paths); *Bargain* skills
are overtuned but cost HP / impose a debt or curse that comes due. Skills: Rune Bolt, Glyph of Warding, Runic
Detonation, Dark Bargain (+AP for HP), Soul Contract (share damage), Sign Here, Please (charm), Infernal
Lawyer (imp summon), Collect Debt (execute), Terms & Conditions (silence). Signature: *Read the Fine Print*
(cancel every enemy intent this round; detonate all runes).

### Slate — Grumpy Golem *(unlock: defeat Lich-tenstein)*
User's brief: *a grumpy golem (pale blue stone + runes) who can rage to flare his runes. He throws things and
grapples things.* Ancient pale-blue stone golem covered in carved runes that stay dull until he gets angry —
and he is always getting angry (noise, being touched, being healed "without consent", kids these days). Talks in
grunts and short complaints ("Hmph." "No." "Get off my lawn."). Role: grappler / thrower / bruiser —
positional control by **throwing things** (enemies, allies, crates, explosive barrels, chunks of floor) and
**grappling** (hold an enemy so it can't act or move; drag it along; slam it). ~34 HP, move 3, flag
`immovable` (pushes and pulls don't budge him), slow but hits like a landslide. Ideas: passive *Short Fuse* —
gains **Rage** stacks (custom status `sla_rage`) when damaged, bumped, healed or when allies are hit next to him;
at 3+ Rage his runes **flare** (glowing aura) and his skills gain riders (throws travel further and stun on
impact, grapples crush, stomps crack the floor); some skills spend Rage. Rage drains slowly when nothing annoys
him. Skills: Hurl (throw an adjacent unit or object 3 tiles — collisions damage both; thrown explosive barrels
explode), Rock Toss (rip up a chunk of floor (leaves rubble) and lob it at range), Grapple (seize an adjacent
enemy: it is held — its telegraphed attacks are cancelled and it moves with him — until he lets go or it breaks
free), Suplex (slam a held/adjacent enemy onto the tile behind him), Seismic Stomp (cone/area push + rubble),
Stone Skin (Block + Thorns), Get Off My Lawn (taunt + push adjacent foes), Toss a Friend (throw an ally to a far
tile — a repositioning combo for the party; they land with Block), Rune Flare (active: spend Rage for a burst of
arcane damage around him), Bedrock (become Rooted + huge Block, reflects melee). Signature: *Tectonic Tantrum*
(runes blaze, the ground heaves: every unit within 2 is thrown 2 tiles outward, collisions hurt, max Rage).
Sprite: big `construct` golem (or a big blocky humanoid) in pale blue-grey stone (#9fb7c9-ish) with cyan rune
lines; rune aura only while raging.

### Mayor Buga — Anthropomorphic Toast *(unlock: defeat Grimble the Goblin Tax Collector)*
User's brief: *an anthropomorphic piece of toast who is all about the loot and manipulating allies.* A slice of
lightly buttered toast with tiny arms and legs, a mayor's sash, chain of office, top hat and the soul of a
small-town politician: shameless, greedy, smiling for the cameras, taking credit for everything. Role: support /
manipulator / loot engine — he makes his **allies** do the work (grants and redirects their actions, swaps them
into danger, buffs them with strings attached) and squeezes **gold and loot** out of every fight. ~24 HP, move 4.
Ideas: passive *Skimming Off the Top* — every enemy the party kills drops extra gold for the run (a "civic
fee"), and Buga gains Hype when an *ally* scores a kill he "delegated" (allies he buffed/commanded this round).
Skills: Delegate (an ally immediately makes its basic attack against a target Buga picks — free for the ally),
Campaign Promise (ally gains +1 AP now; next round it loses 1 AP — promises are cheap), Human Shield (swap places
with an ally; the ally takes the hit he was about to), Photo Op (allies adjacent to him gain Inspired; he gains
Hype), Bribe (spend gold to Charm an enemy or cancel its telegraph), Tax Break (steal gold from an enemy + Weak),
Butter Up (ally gains Empowered — and is Wet-like slippery: moves +1 but slides), Crumb Trail (surface that slows
enemies; allies on it heal a little), Executive Order (move an ally 2 tiles for free; it keeps its AP), Kickback
(heal an ally, Buga pockets gold), Loot Goblin (open/smash chests and objects from range, double gold).
Signature: *Toast of the Town* (rousing speech: every ally gains +1 AP and Inspired, enemies are Dazzled, the
party pockets a pile of gold). Sprite: `custom` painter — toast slice (golden-brown body, darker crust rim, butter
pat on top), dot eyes, big grin, stubby limbs, top hat, sash, gold chain (bling).

### Kiri — Half-Elven Ranger (she/her) *(available from the start)*
User's brief: *Kiri (female) half-elven ranger. Can send her arrows into the ethereal plane and move ethereally.*
Dry, competent, slightly spooky ranger whose arrows (and occasionally she herself) slip into the ethereal plane;
tired of being asked whether she's "the elf or the human one". Role: precise ranged damage + ethereal mobility.
~24 HP, move 4, init +3. v2-simple kit ideas (one verb each): passive *Between Worlds* (one rule, e.g. her bow
shots ignore line of sight from objects — they travel through the ethereal plane); Ghost Arrow (single target,
ignores line of sight), Phase Shot (pierces every unit in a line), Ethereal Step (teleport a few tiles straight
through walls and enemies — "moving ethereally"), Fade Out (Ethereal until her next turn: can't be targeted, can't
attack), Arrow from Beyond (an arrow sent into the ethereal plane that lands on its target at the start of her next
turn, wherever it is), Spirit Mark (Marked), Pinning Shot (Root), Volley (small area). Signature: *Rain from the
Other Side* (ethereal arrows hit every foe in a large area, ignoring everything). Combos: Marked / Rooted setups for
allies; pierce lines through foes bunched up by others. Sprite: half-elf (short pointed ears), hooded green-grey
ranger cloak, longbow, quiver, ghostly violet-blue glow on her arrows and steps.

### Betty — Goat-Man Warrior (he/him) *(available from the start)*
User's brief: *Betty (goat-man warrior).*
A big goatfolk warrior named Betty ("It's a family name."): horns, beard, hooves, armor, a heavy weapon. Bleats
mid-sentence ("BAAAttle!"), calls everyone "kid", eats anything (the loot, the map, the DM's notes). Role: frontline
warrior who charges, rams and knocks enemies around; sure-footed on high ground. ~32 HP, move 4, init +1, `hop`
(goats climb). v2-simple kit ideas: passive *Eats Anything* (one rule, e.g. once per turn he may eat an adjacent
destructible object for free to heal a little); Ram (charge up to 3 tiles in a line, push the first foe 2),
Headbutt (damage + Stun), Horn Toss (throw an adjacent foe over him), Bleat of Defiance (taunt nearby foes), Hoof
Stomp (small area + Slow), Shield Up (Block — skill Block only), Cleave, Goat Rush (dash). Signature: *G.O.A.T.*
(charge through every foe in a line, knocking each aside). Combos: rams into pits, lava, allies' traps and
Corelos' runes; Stun before the enemy's turn. Sprite: stocky humanoid with ram horns, goat ears, white goat beard,
brown-and-white fur, armor with "BETTY" stamped on the breastplate, greataxe or hammer.

### Basanos — Human Werewolf (he/him) *(available from the start)*
User's brief: *Basanos, human who can transform into a werewolf.*
An apologetic, scruffy monster-hunter who IS the monster once things get bad ("I'm not a dog." "Sorry about the
sheep."). Role: **melee in both forms** (user: "in melee form should be a melee fighter") — as a human he is a
disciplined swordsman (steady hits, shoves, parries, protecting allies); as a werewolf he is a savage, fast
skirmisher (bleeds, leaps, sheer aggression). ~28 HP, move 4, init +2. v2-simple core: ONE clear transformation —
*Transform* (cheap; swaps forms): wolf form gives +2 move, turns his basic attack into Claw (+ Bleed) and enables his
wolf skills; human form uses his sword basic attack and enables his fighter skills (skills are tagged human or wolf;
the other form's skills are greyed out). Passive (one rule, e.g. *Moonstruck*: transforming is free once per turn,
or he transforms automatically below half HP). Human: Silver Slash (solid single hit), Shoulder Check (push 1),
Parry (Block until his next turn — skill Block), Hold the Line (taunt adjacent); Wolf: Rend (Bleed), Pounce (leap +
Stun), Howl (allies Inspired), Savage Bite (heals on kill). Signature: *Blood Moon* (becomes a huge dire wolf and
savages every adjacent foe). Sprite: human swordsman (worn coat over mail, silvered sword, stubble, a few too many
scratches) and a werewolf form via the sprite override (grey fur, snout, ears, claws, a little bigger).

## 7. Shared content
- **Generic skills** (`owner: 'generic'`, ~12, learnable by anyone via tomes): Throw Chair, Second Wind, Dodge
  Roll, Shove, Rally, First Aid, Pocket Sand, Taunt, Sucker Punch, Barrel Toss, Power Nap, Tactical Retreat.
- **Items** (~50): weapons (damage riders), armor (HP/armor/Block), trinkets (weird hooks). Include
  hero-specific items for every hero and 5+ **cursed** items with big upsides and hilarious downsides.
- **Consumables** (~14): Red Drink (heal), Big Red Drink, Flask of Bad Decisions (fire AoE), Smoke Bomb,
  Energy Drink (haste), Antidote, Liquid Courage, Scroll of Yeet, Bag of Marbles, Holy Water, Frost Flask,
  Thunder Jar, Pocket Sand, Mystery Potion.
- **Wild magic** (~24 surges, mostly beneficial, some chaotic): gold shower, swap places with a random unit,
  turn a random enemy into a sheep, accidental fireball, summon a confused duck, everyone pushed 1 tile south,
  heal everyone (enemies too), grow huge (+50% damage), bees, rain (extinguish + water), etc.
- **Scars** (~12): small permanent debuffs with funny names; removable at shops/taverns.

### 7.1 Random passives — *The Table of Questionable Blessings* (user request: "very random", 4 slots)
Every hero keeps their built-in passive (their identity) and ALSO collects up to **4 random passives** rolled on a
big d100 table. The table is the most chaotic thing in the game: some entries are clean stat boosts, many are
weird, conditional, proc-based or two-edged, a few are build-defining legendaries, and the cursed ones are huge
upsides with hilarious, mechanically real downsides.
- **Earning**: every level-up rolls once (before the skill choice); at the start of a run every hero rolls once
  ("Session Zero character quirks", never cursed). Events can grant extra rolls; the shop sells a re-roll.
- **The roll** is shown as a d100 (the number maps to the entry's slice of the weighted table) with a rarity-coloured
  result card. Rolling a passive you already own **upgrades** it (I → II → III, like skills); maxed ones can't
  be rolled. With a free slot the new passive is socketed; with all 4 slots full you **replace** one (it's gone)
  or **discard** the roll.
- **Rarity** (default weights): common 10, uncommon 6, rare 3, legendary 1, cursed 4. ~75 entries: ~30 common,
  ~18 uncommon, ~10 rare, ~6 legendary, ~11 cursed. Mostly hero-agnostic; some only appear for heroes they suit
  (`requires`: summoners, flyers, HP-payers, gold-spenders...).
- **Power budget**: a common ≈ a third of a skill level (+1 armor, +2 damage in a niche, a small proc); rare ≈ a
  strong item; legendary changes how the hero plays; cursed = legendary upside + a real cost. Levels II/III
  scale ≈ +50% / +100% or add a rider.
- **Very random** means: random procs (10–30% chances), wild magic triggers, ducks, teleports, weird conditions
  (adjacent to a wall, on high ground, at exactly 1 HP, on odd rounds, when an ally says something...), run-layer
  effects (gold, XP, shop prices, healing), and pure chaos — always exact in the text, always tested.
- Examples: *Lucky Socks* (crits... sort of), *Main Character Syndrome* (+Hype from your kills, allies get less),
  *Plot Armor* (once per fight, a lethal hit leaves you at 1 HP), *Allergic to Goblins*, *Pet Rock*, *Spicy Blood*
  (attackers catch fire), *Haunted by a Ghost Accountant* (+gold, sometimes Confused), *Sleepwalker*, *Coin Magnet*,
  *Overcaffeinated* (+1 AP on round 1, Slowed on round 3), *Quantum Pockets* (random consumable some fights),
  *Emotional Support Duck* (summons a duck), *Cursed: Glass Cannon*, *Cursed: Kleptomaniac*, *Cursed: Loud Eater*.

## 8. Enemies
Design rules: every enemy has a **readable gimmick** shown in its tooltip/inspect panel and visible in how it
behaves; 1–3 skills; an AI style; an initiative modifier; a strong silhouette (SpriteSpec); 2–4 barks per key; a
codex `desc` joke. v2: enemies act on their initiative turn without telegraphs (only bosses wind up big attacks).
Each act ships ~8 normal/minion enemies + 3 elites + 8–12 encounters (normal + elite) using its themes.
- **Act 1**: Dire-ish Rat (packs, bleed), Goblin Grunt, Goblin Slingshot Kid (line shot), Kobold Union Rep
  (buffs allies: "Strike Action"), Sewer Slime (splits on death), Spore Bro (walks up and explodes into poison),
  Cellar Spider (web root), Bandit Bard Critic ("Bad Review": Weak). Elites: Mimic (Disappointed), Bugbear
  Bouncer (grabs + throws heroes), Gelatinous Cube (engulfs, immovable).
- **Act 2**: Skeleton Intern (reassembles unless finished properly), Zombie (Unpaid) (grab/root), Cultist of the
  Forbidden Brunch (heals with mimosas, summons), Will-o'-the-Wisp (teleport + chain lightning), Owlbear Cub
  (charge), Banshee (Wants to Speak to the Manager) (cone stun), Gargoyle (stone form), Pixie Swarm (dazzle).
  Elites: Mama Owlbear, Necromancer TA (raise dead, bone walls), Flesh Golem Gary (lightning heals him; throws).
- **Act 3**: Imp Influencer (teleports, "Livestream" marks), Hell Hound (fire cone), Mind Flayer Life Coach
  (charm, psychic cone), Floating Eyeball Intern (piercing beam), Rules Lawyer (Devil, Esq.) ("Objection!"
  silence; cancels buffs), Natural 1 Golem (random d20 attacks), Kobold Dragonshield, Succubus Dating Coach.
  Elites: Young Red Dragon (Hoarder), Death Knight (Very Dramatic), Pit Fiend Accountant.

## 9. Bosses (each its own file, handcrafted arena, phases, puzzle)
v2: bosses act on their initiative turn like everyone else (a boss may have two initiative entries if its design
needs it), without telegraphs — except **wind-ups**: the 1–3 signature attacks below that were "telegraphed" or
"delayed" are announced when the boss begins them (banner, marked tiles, ⏳) and land at the start of its next turn.
The puzzles hang off these wind-ups and the arena objects.
1. **Grimble, Goblin Tax Collector** (Act 1, tax office/vault). *Levy* steals party gold (gains Block);
   *Audit* — telegraphed paperwork barrages along whole rows/columns (delayed); *Hire Intern* summons goblins.
   Puzzle: three "Tax Loophole" levers; pulling all three drops the vault door on him (huge damage + stun +
   strips his shield). Phase 2 (<50%): *Hostile Takeover* — double audits, faster interns.
2. **The Rat King & the Rat Bar Association** (Act 1, sewer junction). A crowned swarm of conjoined rats; splits
   into Rat Lawyers at thresholds; *Gnaw* collapses floor into pits; *Sewer Surge* floods channel rows
   (pushes everyone in them). Puzzle: valves (levers) that flood channels on your terms — wash rats into pits.
3. **Lich-tenstein, the Overdue Librarian** (Act 2, haunted library). *SHHHH!* (big Silence), *Late Fees*
   (damage grows every round), *Bookfall* (checkerboard telegraph), skeleton interns. Puzzle: three phylactery
   "overdue books" hidden in bookshelves (some shelves are mimics); while any remain, the lich reforms.
4. **Dr. Iris, Beholder Optometrist** (Act 2, clinic). Eye beams in rotating patterns, *Eye Exam* (telegraphs
   shaped like an eye chart "E"), anti-magic cone (Silence), *Disintegrate* (delay 2). Puzzle: rotatable
   mirrors (interact) reflect beams back into her; pillars give cover.
5. **The Dungeon Master** (Act 3 final, the DM's table: felt floor, giant dice, a Mountain Dew can tower, Cheeto
   dust). Phase 1 *Session Zero*: hides behind the DM Screen (invulnerable until its panels are destroyed),
   *Rules Lawyering* (adds a random global rule each round), *Random Encounter* (summons cameo monsters from all
   acts), *Rocks Fall* (delayed ground telegraphs). Phase 2 *The Railroad*: a train thunders down marked lanes.
   Phase 3 *Rocks Fall, Everyone Dies*: a 3-round countdown wipe unless heroes interact with "Player's Handbook"
   objects to rules-lawyer back (or stun him). Defeat line: "Fine. FINE. You win. Same time next week?"

## 10. Map themes
| Theme | Act | Look | Features |
|---|---|---|---|
| cellar | 1 | wood planks, stone walls, barrels, kegs | crates, explosive barrels, ale puddles (water) |
| sewer | 1 | wet stone, grates, green water channels | water channels, slime (poison), pipes |
| warren | 1 | dirt, roots, mushrooms | pits, rocks, spore puffs |
| hauntwood | 2 | dark grass, twisted trees, fog | trees, bushes, mud, gravestones |
| academy | 2 | crypt tiles, bookshelves, candles | braziers, bookshelves, pits, magic circles |
| graveyard | 2 | dirt, graves, iron fences | gravestones, mud, coffins |
| hellscape | 3 | obsidian, lava rivers, brimstone | lava, rocks, fire vents |
| hoard | 3 | gold piles, treasure, marble | chests, gold piles (difficult), pillars |
| dm_table | 3 | green felt / graph paper, giant dice, snacks | d20 pillars, soda cans, pencils, cheeto dust |

## 11. Events & narration
~25 events (2–3 choices each, at least one with a risk/reward trade), several **hero-specific** (only when that
hero is in the party): Zarathor and a bling merchant; Syllamin's rap battle; Professor Marbles' lost marbles;
Marwyn and a MAGNIFICENT mirror; Ellaria and a lost corgi; Josiah's plague-rat union; Sparrow's blood bank;
Corelos' patron's fine print; Slate and the noisy kids (or a sculptor who wants to "fix" him); Mayor Buga's
re-election campaign (or a toaster cult that worships him). Generic: The Dice Goblin (gamble), A Wizard Did It, Session Cancelled (Real Life),
Fountain of Questionable Youth, Cursed Ring Clearance Sale, The Rules Lawyer's Office, Snack Run, Retcon…
Narrator lines for every key in ARCHITECTURE §3.10 (8+ lines for common keys), plus 30+ loading-screen tips.

## 12. Visual & audio direction
- Isometric, chunky, readable. Procedural canvas art only (no image files): diamond tiles with subtle per-tile
  noise, darker side faces for elevation, animated water/lava/fire. Chibi units (big heads, bold dark outline,
  idle bob, squash on hit, white hit-flash, lunge on attack, fade + tumble on death).
- v2: the **initiative tracker** (portraits in turn order, current turn highlighted, rolls shown) and **boss
  wind-ups** (red pulsing tiles with hatching + ⏳) must be unmissable; hold-to-show threat shading for enemy reach.
  No per-enemy telegraphs.
- UI: dark tavern wood + parchment panels + gold trim; fantasy display font (e.g. Google "Cinzel"/"MedievalSharp"
  with Georgia fallback) and a clean readable body font. Big readable numbers. Every interactive thing has a tooltip.
- Audio: procedural WebAudio blips/whooshes/thuds; corgi yips; raven caws; mute + volume in settings.
