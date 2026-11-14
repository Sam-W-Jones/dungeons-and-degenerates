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
   alike. Enemies act without warning (only bosses and a few elites wind up their biggest attacks), so you read the
   board — threat ranges, positioning, terrain — not a script. Fights are hard: no free Block, no Guard. Losing a hero
   should feel like *your* mistake. Bosses are puzzles with patterns, not damage sponges.
2. **Build your degenerates.** Slow, shared levels, 4 socketed skills (I → II → III upgrades, replacing to learn new
   ones), items, scars, random Blessings, Hype-powered signature moves. **Skills are simple; combinations are strong**
   — synergy between heroes is the fun.
3. **Comedy everywhere.** Skill names, barks, enemy names, items, events, narration, death screens — every surface
   gets a joke, but mechanics text stays crystal clear.
4. **One more run.** Short runs (~45–75 min), branching maps, random rewards, all 16 heroes from the first run.

## 2. Tone & comedy guide
- Voice: an affectionate roast of tabletop gaming. The narrator is **The DM** — snarky, sleep-deprived, secretly
  proud of the players, fudges dice, eats Cheetos, threatens "rocks fall" whenever annoyed.
- Comedy sources: tabletop in-jokes (rules lawyers, natural 1s, the bard seducing things, session zero, snacks,
  "I check for traps", murderhobos, the party splitting, the DM's pet NPC), character personality, puns,
  bureaucratic monsters (tax goblins, union kobolds, overdue-library liches), mundane problems in a fantasy world.
- Keep it PG-13. Mild innuendo OK; no slurs, no punching down, no real-world politics. The sixteen heroes are the
  player's real campaign characters — roast them **affectionately**; never make them pathetic or mean-spirited.
- Pronouns are exact: **she/her** for Ellaria, Sparrow and Kiri; **he/him** for everyone else (Zarathor, Syllamin,
  Professor Marbles, Marwyn, Josiah, Corelos, Slate, Mayor Buga, Betty, Basanos, Valdris, Hjalmar, Pebbles). Lines that
  only get a hero's name from the engine (`{hero}`) use no pronoun for them.
- Mechanics text is plain and exact ("Deal 8 fire damage. Push 2."). Jokes go in names, `flavor`, barks and narration.
- Lines are short. Barks ≤ 70 characters. Flavor ≤ 120. Event text 2–5 sentences.

## 3. Run structure & meta progression
- **Party select**: choose 4 of the 16 heroes + difficulty (Casual / Normal / Brutal). "Roll for Party" randomizes.
- **Starting kit**: every run starts with a Bucket of Ice Water in the pockets (`DD.Balance.start`: a revive for a
  downed ally). There is no generic starting heal (the user, Nov 12, D9): sustain comes from the heroes themselves (§6).
- **Acts** (3): each act is a branching map of 7 rows + a boss row. Node types: ⚔ Combat, 💀 Elite, ❓ Event,
  🛒 Shop, 🍺 Tavern, 💰 Treasure, 👑 Boss. Row 0 is always combat; row 6 is always taverns (rest before the boss);
  elites only from row 2; two shops per act map (a few maps only have room for one), at most one per row. Moving is
  always forward along links.
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
  (swap a party member — dead or alive — for any hero not in the party; recruits join at the lowest level among the
  heroes who stay).
- **Death**: a downed hero revives after combat at 1 HP with a **Scar** (comedic permanent debuff, e.g.
  "Trick Knee: −1 move", "Bruised Ego: −5% damage"). The **third** down in a run kills them permanently
  ("written out of the campaign"). All heroes downed in combat = **TPK** → game over.
- **Unlocks (v2, user request): all 16 heroes are available from the start** — every hero def has `unlock: null`.
  The unlock machinery (`unlock: { act }` / `{ boss }`, DD.Meta unlock lists, the act-clear unlock banner, the
  "I'm the DM's Favorite" toggle) stays in the code for possible future use but unlocks nothing today.
  (Previously: Josiah after Act 1, Sparrow after Act 2, Corelos after the DM, Mayor Buga after Grimble, Slate after
  Lich-tenstein.)
- Hall of Fame: records (runs, wins, best act, kills, deaths), every hero's campaign record, the enemy codex, the
  Table of Questionable Blessings (entries never rolled show as ???) and past runs.

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
   - **Wind-ups (bosses and a few elites)**: a boss's few biggest attacks, and at most one signature move per elite
     (§8), announce themselves when it begins them (banner, marked tiles, ⏳) and land at the start of its next turn —
     your window to dodge, shove, stun or work the puzzle. The marked tiles always show where it will really land.
     Dazzle or Confuse its owner and the wind-up goes off course (1 tile off, or a quarter turn, rolled once when the
     status lands): the marked tiles move only if the Dazzle or Confuse lasts until the wind-up lands; one that wears
     off first leaves them where they were (the inspect panel: "✨ Dazzled, but it wears off before this lands: it hits
     the tiles marked now.").
4. **Block** only comes from skills (and a few items/passives used mid-fight). Nobody starts a fight with Block;
   Block lasts until the start of its owner's next turn.

Positioning still matters: enemies act from where they stand, so pushing a goblin out of reach, rooting the
charger, stunning the caster before its turn or killing the archer first all change what happens next. And since
walking away from a melee fighter provokes an **attack of opportunity** (§4.2) and enemies weigh that cost, melee
heroes **hold the line**: a goblin next to the barbarian keeps swinging at the barbarian instead of strolling past him
to the wizard.

### 4.2 Actions
- **Move** (1 AP): up to `mov` path cost. Several moves per turn are allowed if AP remains.
- **Moving through allies** (v2, user request: heroes got "congested when terrain is around"; the user is fine with
  both sides doing it). Every unit walks **through its own side** — heroes and their summons through heroes, monsters
  through monsters — but **never through a foe**, and **never ends a move on an occupied tile**. The tiles it crosses
  count as usual (path cost, climbing, hazards, plates, webs; an attack of opportunity on the way is aimed at
  the walker, never the friend). In move mode the range runs through allies, the path preview passes over them and a
  click on a reachable tile behind a hero's sprite moves there.
- **Swap places** (v2, user request: "Yes, add swap"). A hero or a hero-side summon can, **as its move**, swap places
  with an **adjacent ally** on the heroes' side: the AP of one move (a Confused hero pays 2); the ally pays nothing and
  keeps its own turn. Both must be able to stand on the other's tile (terrain, objects, the climbing rule both ways,
  the step within the mover's move). Not with a **downed** ally (that is Help Up), a stunned / asleep / frozen, rooted /
  held or immovable one, nor when the mover is rooted, stunned or out of AP. **Enemies never swap.** The mover
  **provokes attacks of opportunity as if it walked the step** (one that downs, stuns, roots or moves it cancels the
  swap; the move is spent); the displaced ally provokes nothing. Both feel their new tiles (flyers excepted); Bleed and
  on-move effects are the mover's only. While a move is aimed, hover an adjacent ally (⇄) for "⇄ Swap with <name>" and
  click to swap; outside move aiming a click on an ally still selects it. Undo (Z) works as for a move.
- **Immovable units** (lead decision D2). **Immovable units can start a swap but can't be swapped**: a swap Slate
  starts is his own move (he steps onto the ally's tile, the ally takes his), but nobody can move him — pushes, pulls
  and an ally's swap all fail. The refusal reads "Slate is immovable: he can start a swap, you can't move him." Allies
  still walk through him. The same rule holds for every immovable hero-side unit (Ellaria as the Absolute Unit;
  nobody can swap with Zarathor's Statue of Me either).
- **Basic attack** (usually 1 AP) — always available, themed per hero.
- **4 socketed skills** (1–3 AP, cooldowns, some HP costs).
- **Signature** (100 Hype + AP) — one dramatic, comedic ultimate per hero.
- **Consumables** (1 AP, party inventory of 3). **Interact** (levers, chests, fountains: usually 1 AP).
  **Help Up** a downed adjacent ally (2 AP → revive at 25% HP).
- **Heals bring the downed back up** (v2, user request). A single-target heal (a skill or a consumable: Mostly Medicine,
  Carrot Toss, a Red Drink…) can be **aimed at a downed ally**: it gets back on its feet with the healed amount as HP
  (after healing bonuses; at least 1, at most its max HP), with 0 AP, and acts on its own initiative slot as usual (if
  its slot already passed this round, next round). The preview shows "UP! 7 HP". Area heals, regeneration, lifesteal,
  passives, Blessings and round-end heals don't revive anyone — you have to mean it. Help Up and revive skills
  (Smelling Salts) work as before.
- **Shoot the barrel** (v2, user request). Any single-target damage skill — basic attacks and consumables thrown at a
  foe included — can be **aimed at a volatile object** (an explosive barrel, Mayor Buga's Pork Barrel) within its
  normal range and line of sight: it **detonates** outright, and the blast is yours (kills, Hype, gold). It costs the
  skill's AP and cooldown; the skill's own riders don't happen (there is nothing to poison). The preview shows the
  whole blast. The enemies never do this on purpose — barrels are a hero tool. Adjacent heroes can still Smash
  objective objects.
- **Break things** (v2, user request: "objects should be targetable to break them"; lead decision D1). **Any
  single-target damage skill can break it**: every single-target skill that deals damage — attack or spell, a hero's or
  a hero-side summon's, basic attacks and thrown consumables included — can be aimed at a **breakable object** (one with
  HP: crates, barrels, kegs, totems, Spore Pods, Strike Funds, bone piles, filing cabinets, Restricted Section
  shelves…) in range and line of sight, on a tile nobody stands on. It deals its **listed damage** (the number on the
  card, with Weak, Inspired and item damage bonuses; no high ground, Empowered not spent) and the object **breaks at 0
  HP** with everything that comes with it (smoke, oil, spores, gold, a puzzle step, an objective), credited to the
  attacker. Volatile objects still detonate outright. The preview reads "Break: Crate − 4 damage, 2 HP left" / "… —
  breaks!". A few skills opt out because the grab, the throw, the dash or the gold is the point (`target.objects: false`;
  their tooltips have no 🔨 line): Fetch!, Throw Money At It, Pounce, Arrow from Beyond, Vein Glory, Head Over Heels,
  and Slate's Hold Still, Rock Bottom and Stress Ball.
- **No riders on objects** (lead decision D4). On an object a skill deals its damage and nothing else: no statuses,
  pulls or pushes, lifesteal, stolen gold or heals, and no item, status or passive riders either (the Electric Lute's
  water shock, the Echo Chamber Blessing's second hit, on-hit statuses). What counts the use itself does not change:
  AP, cooldowns, charges and Hype for using a skill still count. Previews and AutoPlay's dry runs match.
- **Stealth and objects** (lead decision D3). Attacking an object ends Stealth exactly as attacking a unit does (the
  same exceptions: hazards, surfaces, bumps, falls, explosions and Thorns don't count as attacking). Whacking a crate
  is not subtle.
- **Not targets**: objects that say `targetable: false` — the DM's laminated screen panels (Smash them from next to
  them, or blast them), Rocky the Pet Rock — and whatever the party protects (the Last Keg, the Coffee Machine, the
  Snack Bowl); explosions, bumps and throws still hit them (attacks aimed at a tile — the Family Hammer, Hard Pass —
  leave them alone too). Enemies never aim at objects on purpose (only their own scripts do: hounds chewing the Snack
  Bowl).
- **No Guard** (v2): unused AP is simply lost.
- **Attacks of opportunity** (v2, user request: melee should be able to hold the line). When a unit uses a **Move**
  action and leaves a tile next to an opposing unit that has a **melee basic attack**, that unit makes **one free
  basic attack** on it as it leaves ("Attack of opportunity!"): heroes with their basic attack if it is melee (range
  1), enemies and summons with their first ready melee skill; normal damage rules, no AP, no cooldown. It works both
  ways (heroes punish enemies that walk away from them, on the enemy's turn).
  - Each unit makes **at most one per round**. Stunned / asleep / frozen / polymorphed / downed units can't, nor can
    Dazzled or Confused enemies, nor an enemy taunted by someone else (it only strikes its taunter).
  - **Never provoke**: pushes, pulls, knockbacks, teleports, swapping skills (The Ol' Switcheroo), throws, jumps, and
    skill-based dashes, charges and leaps — that is what makes mobility skills valuable — plus deployment swaps.
    Stealthed units slip away. The **swap move** is a step: its mover provokes like a walker; the ally it displaces
    doesn't.
  - If the hit downs, stuns, puts to sleep, freezes, roots or moves the mover, **its walk ends there**. Several
    adjacent foes each strike once (each step off a tile next to a foe leaves its reach; with 4-way adjacency every
    step off such a tile does).
  - Paths avoid provoking when a route within the move exists; the move preview shows "⚔ provokes N" with who and
    how hard. A move that provoked can't be undone.
  - Content can opt in: "can't be opportunity-attacked" (mover), "never makes them" (attacker), "+N damage on attacks
    of opportunity" (hooks `modifyOpportunity` / `onOpportunityAttack`, flags `noProvoke` / `noOpportunity`).
  - The fine print: a **melee** skill reaches 1 tile at most and is never tagged `ranged` (an area skill counts only if
    it is tagged `melee`), so Josiah's 2-tile cane and every archer never strike walkers. Nobody on the heroes' side
    strikes a **charmed** enemy (it is on loan). The strike is aimed at the mover even while it passes over a friend's
    tile, and a mover downed there is moved off onto a free tile. A fight rule's opportunity hooks run once per attack.
    Between two routes of the same length, the walk takes the less harmful one.
- **Deployment**: before initiative is rolled, heroes may be freely swapped within the green start zone.
- **Undo move**: the current hero's last move (or swap) can be undone if nothing else happened since (not one that
  provoked an attack of opportunity).

### 4.3 Battlefield
- **Elevation** 0–4. Climbing costs +1 per level, max +1 per step (Professor Marbles hops +2; flyers ignore).
  Attacking from higher ground: **+25% damage**. Tall terrain blocks line of sight.
- **Terrain**: floors per theme · walls · water (cost 2, makes Wet, puts out Burn) · deep water · mud (cost 2) ·
  ice (pushed units slide 1 extra) · lava (8 fire damage + Burn on entry) · pits (pushed non-boss enemies die
  instantly — "YEET"; heroes/bosses take 25% max HP and climb out) · rubble.
- **Objects**: crates/barrels (destructible cover: any single-target damage skill can break one, §4.2 "Break things"),
  explosive barrels (fire explosion r1; aim any single-target damage skill at one to set it off, §4.2), pillars/trees/rocks
  (block movement + LOS), bushes, spikes (damage on entry), pressure plates, levers (puzzle wiring), chests
  (interact: bonus loot), fountains (interact: heal), braziers (knock over → fire), totems (objective targets),
  bookshelves, mirrors (boss puzzle), giant dice (DM table).
- **Surfaces** (temporary tile layers): fire, poison, water, oil, ice, blood, web (root on entry), steam/smoke
  (block LOS), holy ground (heals heroes), cheeto dust (DM table, comedic slow).
- **Elements**: fire ignites oil, evaporates water into steam, burns webs, melts ice, detonates barrels; frost
  freezes water; lightning electrifies whole water bodies (damage + stun everyone standing in them); water
  extinguishes fire and cools lava to stone. Push enemies into hazards — **environmental kills** grant big Hype.
- **Flyers ignore the floor** (v2, user request). A flying unit (by nature — Syllamin, Onyx the raven, the imp, wisps, the
  Beholder, the Lich — or thanks to an item, a Blessing or a status) ignores **everything on the floor, good and bad**:
  terrain effects (lava, water, ice slides, mud…), surfaces (fire, poison, oil, ice, water, blood, webs, holy ground,
  live current, cheeto dust, every trail and crumb a hero leaves), ground objects and traps (bear traps, runes, banana
  peels — and **a flyer never presses a pressure plate**), anything that ticks for "standing in it", and the
  floor's element reactions (a lit oil slick doesn't burn the flyer above it). What still hits a flyer: attacks and
  spells aimed at it or its area, an explosion's blast, auras around a unit, and **clouds and gases** (steam, smoke,
  Plague Miasma). Previews, enemy paths and AutoPlay know it (no fire warning for a flyer), and in the same way a
  hazard that can't hurt a unit isn't one for it (Pebbles strolls through fire; poison-proof slimes cross poison).
  Puzzles stay solvable by walkers.
- **Loot is not a floor effect** (Nov 5 design call). Picking something up is a choice, not the floor happening to
  you, so a flyer still swoops down for the money: loot objects (gold piles, a dragon's Hoard Piles) are pocketed by
  whoever enters their tile, flying or not — a hero (or a hero's summon: Onyx has never once resisted a gold pile)
  flying over one pockets it, with everything that comes with it (fly off with the dragon's gold and it calls you a
  Thief). Everything else on the floor stays below a flyer. Both are flagged `loot`: Syllamin, Onyx or anyone holding
  the Bundle of Party Balloons who flies over a Hoard Pile pockets it ("Flyers swoop down for it too: gold is not a
  floor effect, it is a lifestyle."), and AutoPlay values it for flyers too.

### 4.4 Status semantics (normative; `js/data/statuses.js`)
| id | Effect |
|---|---|
| burn | End of its turn: take `stacks` fire damage, then stacks −1. Removed by water/Wet. |
| poison | Start of its turn: take `stacks` poison damage (ignores Block), then stacks −1. |
| bleed | Each move action or forced movement (push/pull): take `stacks` damage and leave blood. Stacks −1 at its turn end. |
| stun | Loses its next turn (heroes: 0 AP) and any wind-up it was charging is interrupted. Removed at the end of that turn. `stunImmune` ignores. |
| root | Can't take move actions (can still be pushed). |
| weak | Deals 25% less damage. |
| vulnerable | Takes 25% more damage. |
| taunt | (enemy) On its next turn it must attack the taunter if it can (no other attacks). (hero) −50% damage vs anyone but the taunter. |
| haste | Heroes/summons +1 AP at turn start; enemies +2 move. |
| slow | Heroes/summons −1 AP (min 1); enemies −2 move (min 1). |
| regen | Start of its turn: heal `stacks`. |
| stealth | Can't be targeted by enemy single-target skills; AI ignores it. Broken when it deals damage or attacks an object (D3). |
| marked | The next damage it takes is increased by `stacks`; then removed. |
| dazzled | (enemy) Its attacks land 1 tile off in a random direction. (hero) −1 max range. |
| confused | (enemy) Its attacks turn a random quarter turn (may hit friends). (hero) Moving costs 2 AP. |
| charmed | (enemy) On its next turn it fights for the other side. (hero) Can't damage the charmer; −1 AP. |
| inspired | Deals 25% more damage. |
| wet | Can't Burn; takes +50% lightning damage; frost makes it Frozen. |
| silenced | Can't use `kind: 'spell'` skills; a spell wind-up fizzles. |
| sleep | Like stun, but wakes when damaged. |
| invulnerable | Takes no damage. |
| frozen | Like stun; takes +50% physical damage; fire damage thaws it. |
| thorns | When an adjacent attacker damages it, deal `stacks` damage back. |
| empowered | Its next damaging skill deals +50% (consumed). |
| sheep | Polymorphed: can only move (mov 2), no skills; interrupts wind-ups. "Baa." |

v2 (initiative, no telegraphs): durations count the **owner's own turns** — `turns` ticks at the end of the
owner's turn, so a debuff with `turns: 1` applied to an enemy covers that enemy's next turn, and a hero buff with
`turns: 1` lasts until the end of that hero's next turn. So stun / sleep / frozen = it skips its next turn; taunt,
dazzled, confused, charmed and silenced cover its next turn; sheep = it can only move. Enemies keep no plans between
turns (no telegraphs): only wind-ups (bosses and a few elites) wait, and a stun, sleep, freeze or sheep interrupts them.

### 4.5 Hype & signatures
Party Hype 0–100 (starts at 0 + items). +8 per kill, +20 per environmental kill, +4 when one hero skill hits 2+
foes; passives add more (Syllamin, Marwyn). A signature costs 100 Hype — roughly one per fight if you play well.
Signatures should feel like a set-piece: banner text, big FX, a bark.

### 4.6 Objectives
Kill all (default) · Kill the boss · Survive N rounds · Destroy N objects (e.g. summoning totems: Smash them, or aim
any single-target damage skill at them, §4.2 "Break things") · Protect an object (e.g. "Protect the Last Keg": the party's
attacks are never aimed at it, its blasts are not so polite) · Custom (boss puzzles). Optional chests on the map give
bonus loot.

## 5. Numbers & balance targets
| | Act 1 | Act 2 | Act 3 |
|---|---|---|---|
| Minion HP / hit | 6–9 / 2–4 | 10–14 / 4–6 | 14–18 / 6–8 |
| Normal HP / hit | 12–20 / 4–6 | 20–30 / 6–8 | 28–40 / 8–11 |
| Elite HP / hit | 45–70 / 7–10 | 80–110 / 10–13 | 120–150 / 12–16 |
| Boss HP / hit / big wind-up | 150–200 / 8–12 / 18–25 | 260–320 / 10–14 / 22–30 | 420–520 (phases) / 12–16 / 25–35 |
| Enemies per normal fight | 3–5 | 4–6 | 4–6 |

- v2 note: the enemy numbers in the table above predate initiative order, the removal of Guard and the slower
  leveling; the v2 balance passes kept the content numbers and tuned whole fights with the balance rows below (the
  user's ask: "hard but fair", a well-played party beats the first boss about 60-70% of the time).
- The bosses' content numbers as shipped in v2 (§9; their notes list the knobs; the balance rows below scale them in
  a campaign): **Grimble** 160 HP, two turns a round, hits of 3–13, the Audit wind-up 18 · **the Rat King** 150 HP,
  two turns a round, hits of 6–10 plus his growing swarm, wind-ups 8 (they also collapse the floor or flush the
  channel) · **Lich-tenstein** 320 HP, a 12 notice a turn plus Late Fees (+1 damage each, at most 12), wind-ups 9–20 ·
  **Dr. Iris** 220 HP, hits of 6–9 (her cone, her gaze), wind-ups 12 (Disintegrate 26) · **the Dungeon Master**
  **400 HP**, **20-damage rolls**, wind-ups 24–26 and the phase-3 doom (60); one action and one wind-up a turn, two
  actions a turn in phase 3.
- **Balance rows** (`js/data/balance.js`, `DD.Balance`; measured with the whole-campaign sims, `docs/notes/balance.md`).
  Each multiplies the content numbers on top of the others:
  - Act 1 (`act[1]`): regular fights ×1.15 HP / ×1.3 damage, elites ×1.05 HP / ×1.2 damage, bosses ×0.9 HP / ×1.35
    damage. Acts 2 and 3 have no act rows.
  - Single encounters (`encounters`): the Rat King ×0.9 HP, damage unchanged (balance audit, Nov 14: with act 1's boss
    row he has 122 HP in a campaign; Grimble 144); Lich-tenstein ×1.3 HP / ×1.5 damage, Dr. Iris ×1.1 HP / ×1.45
    damage, the Dungeon Master ×1.35 HP / ×1.6 damage (damage-heavy rows: at ×1 a campaign party won them 95-100%;
    the Lich's row scales his notices, his Late Fees stay flat; finish run, Nov 14: his fees stop at 12 and his row
    went from ×1.25 to ×1.3 HP to keep him where he was; Dr. Iris went from ×1.2 to ×1.1 HP with her closing time
    moved from round 14 to round 10, so her fights stop being 13-round dodge-slogs at the same win rate).
  - Difficulty (`difficulty`, `extraEnemies`): Casual ×0.8 HP / ×0.8 damage · Normal ×1 · Brutal ×1.15 HP / ×1.05
    damage, plus one extra enemy in every regular fight.
  - Where that lands (the balance audit, normal unless stated): the act 1 bosses are won ~70%, the campaign ~33%
    (casual ~77-80%, brutal ~10%).
- Heroes L1: HP 20–36, AP 3, move 3–5, initiative modifier −2..+4. Growth +3–5 HP/level. With one level-up per won
  fight (v2) a party is about level 2 at the Act 1 boss, 3–4 at the Act 2 boss and 5 at the DM.
- Hero basic attack 4–6. Skill (L1): single target 7–10 for 2 AP, AoE 4–6 per target for 2 AP, cooldown 1–3.
  Level II ≈ +25%, level III ≈ +50% or one added rider. Signature: 15–25 damage or a game-changing effect.
- Fights last 4–7 rounds. Expect to take damage every round; positioning, control and healing keep it fair.
- No XP (v2): one hero levels up per won fight (§3).
- Gold: start 60. Normal fight 12–20, elite 35–50, boss 50–70 (no per-act growth). Prices: common item 40, rare 80,
  legendary 150, consumable 20–35, skill tome 60, scar removal 45, heal 30 (the same in every act).

## 6. Heroes
Every hero file (`js/data/heroes/<id>.js`) registers: the hero, its passive (with hooks), a basic attack, a
signature, a pool of **9–10 skills** (2 of them starting), any custom statuses/summons it needs, a distinctive
SpriteSpec, and 3–6 barks per key. Requirements for every kit:
- A clear role, tools that control enemy turns (stun, sleep, root, taunt, charm, push out of reach) and positioning
  (push, pull, teleport, terrain, surfaces). At least 2 skills that create combos with *other* heroes.
- **Simplicity (v2, user request: "skills are too overcomplicated, doing too much each — simplify them so that it's
  the combinations of effects that feel strong")**:
  - **One verb per skill**: a primary effect (damage, heal, move, buff, debuff, summon, terrain) plus **at most one**
    simple rider (one status, one push/pull, or one surface). No if/else chains, no hidden extra clauses, no
    "and then also", no per-skill mini-systems. The desc reads in one breath (about 12 words + numbers).
  - **Levels**: II = bigger numbers; III = bigger numbers or ONE added simple rider.
  - **Combos carry the power**: shared statuses (oil → fire, Marked, Vulnerable, Rooted, Stunned, the hero's own
    signature status; Wet foes for lightning or frost — no hero skill deals either, so the payoff is the Thunder Jar,
    the Frost Flask or Syllamin's Electric Lute, and a Wet foe can't Burn), positioning (pull into a cleave, push into
    pits/lava/allies), surfaces and Hype. Each hero has 2–3 clear setup or payoff skills that pair with other heroes.
  - **Passive**: one clear rule, still the character's comedic core.
  - Pool of **9–10 skills** (2 starting): fewer, sharper skills beat many fiddly ones. Comedy stays in names,
    flavor and barks — not in rules text.
  - **Display names are unique per side**: an enemy or boss skill never borrows a hero-side name (hero, hero summon or
    generic skill), so the log and the codex never confuse the hell hound's leap with Basanos' Pounce.
- **Sustain (D9, the user: "linked to the characters themselves ... without overloading each character with a
  self-heal").** No party gets a generic heal (§3). Healing others belongs to the healers (Ellaria, Josiah; part-time:
  Marbles' Carrot Toss, Pebbles' Emotional Support Dog, Sparrow's Blood Drive). Self-sustain grows out of each hero's
  own verbs and is spread across delivery types: skills (Slate's Stress Ball, Basanos' Transform, Sparrow's Juice Box,
  Betty's Five-Second Rule, Marwyn's Keg Stand, Basanos' Savage Bite, Josiah's Leeches), passives (Betty's Eats
  Anything, Pebbles' Hot Dog, Marwyn's MAGNIFICENT SURGE) and hero items (Sparrow's Bloodsucker's Bib, Pebbles'
  Fireproof Dog Bed, Hjalmar's Canned Laughter). Kiri, Corelos, Syllamin, Zarathor, Buga and Valdris get no self-heal
  (Valdris' Temper adds 5 HP only at III): range, stealth, Debt, Block and death-saves instead. Death-saves aside, no
  hero heals on an HP threshold (Hair Trigger only changes Basanos' form), and the D9 heals (Stress Ball, Transform,
  Juice Box, the surge, Canned Laughter) only heal the hero who earned them: they never revive or cleanse.
- Mix of AP costs (1–3), cooldowns and one or two "big" skills with charges/long cooldowns.
- Three meaningful levels per skill (numbers and/or a new rider at III). `desc` always exact for the level.
- The passive is the character's comedic core and must change how you play them.

Every brief below matches the registered kit (`js/data/heroes/<id>.js`; level-by-level texts in
`docs/notes/v2-digest.md` §2 and each hero's notes, which win if this section ever drifts). Numbers are level I unless
a range is shown. All 16 heroes are available from the start (§3).

### Zarathor the Bedazzled — Tiefling Warlock (he/him)
Fire-wielding tiefling obsessed with wild magic and **bling**: gold chains, rings, a gold tooth, sunglasses indoors.
Thinks fire looks better with sequins. Role: ranged fire, bling and wild magic. 24 HP (+4/level), move 4, init +1.
- Passive *Drip Check*: at the start of each of his turns, +10% damage for every 50 gold the party holds (max +30%).
- Basic *Eldritch Bling* (5 fire, range 4; +2 against a Burning foe). Starters: *Gold-Plated Fireball* (fire in
  radius 1; ignites oil, webs and explosive barrels) and *Throw Money At It* (spend 5 gold: 8 damage and Dazzle).
- Pool: Tacky Hex (Vulnerable), Bedazzle (an ally's next damaging skill +4 per foe hit), Hellish Rebuke (a ward:
  attackers take fire), Bling Lasso (line pull), Fabulous Strut (a straight dash that leaves fire behind), Gold Plating
  (spend gold: Block), Statue of Me (a gold statue that Taunts, once per fight), Wild Card (set off a Wild Surge on
  purpose: his wild magic lives here now, not in the passive).
- Signature *Bling Supernova*: 18 fire to every foe within 2 of the target; the survivors are Dazzled.
- Combos: Hex and Bedazzle before an ally's big hit; Lasso foes into the Fireball; Burning foes feed Valdris and
  Pebbles. Every coin he throws (Throw Money At It, Gold Plating) is a coin his Drip Check no longer counts.

### Syllamin the Roastmaster General — Faerie Bard (he/him)
Tiny, flying, foul-mouthed faerie (Syllamin is male) who **trash-talks** everything, lute in hand. Role: support,
debuffs, crowd control. 20 HP (+3/level), move 5, init +4, flying.
- Passive *Heckler*: his damaging skills Roast each foe they hit. At 3 Roasted the foe suffers *Emotional Damage*:
  the stacks clear, it is Stunned (elites and bosses: Weakened for 2 turns instead) and the party gains 6 Hype.
- Basic *Your Mom Joke* (5 psychic, range 4). Starters: *Heckle* (psychic damage and Charm: on its next turn the foe
  fights for your side) and *Power Ballad* (he and allies within 2 are Inspired).
- Pool: Hype Man (an ally gains AP and is Empowered), Discordant Shriek (cone push), Glitter Bomb (Dazzle and
  slippery glitter), Lullaby of Mediocrity (Sleep), Encore! (reset an ally's cooldowns), Fae Blink (teleport an ally
  next to him, with Block), Mosh Pit (pull foes together), Mic Drop (a big hit and Stun, once per fight).
- Signature *Diss Track*: three verses of 4 psychic damage to every foe, each verse Roasting.
- Combos: any of his hits Roasts, so area skills (Mosh Pit, Shriek, Diss Track) stack Emotional Damage fast; Hype Man
  and Encore! on the party's big hitter; Mosh Pit bunches foes for fireballs and cleaves.

### Professor Marbles the Forgetful Fist — Rabbitfolk Monk (he/him)
Ancient, doddering rabbitfolk monk — forgetful, mumbling, naps mid-fight — and terrifyingly good at kung fu.
Spectacles, walking cane, one floppy ear. Role: mobile melee skirmisher / control. 28 HP (+4/level), move 4, init +2,
`hop` (climbs 2 levels a step).
- Passive *Absent-Minded Mastery*: at the start of each of his turns he suddenly remembers one random ready socketed
  skill: its first use that turn costs 0 AP.
- Basic *Doddering Jab* (5, adjacent). Starters: *Walking Stick Whack* (hit and push 2) and *Marble Scatter* (loose
  marbles: grounded foes on them slip and are Vulnerable).
- Pool: Rabbit Punch (hit and Stun), Flurry of Paws (three quick hits), Back In My Day... (Block and Taunt adjacent
  foes), Lecture (adjacent foes fall Asleep), Carrot Toss (heal, 3 carrots a fight), Hare-Brained Leap (leap over
  anything), Vaudeville Hook (yank a foe next to him), Wax On, Wax Off (an ally is Empowered).
- Signature *Forgot I Was Retired*: every foe within 3 takes 8 damage and is Stunned.
- Combos: pushes into pits, lava and allies' traps; his marbles hand the party Vulnerable targets; the Hook drags an
  archer into a cleave.

### Marwyn the Magnificent — Human Barbarian (he/him)
Huge ginger barbarian with wild-magic outbursts who refers to himself as **MAGNIFICENT** — often in the third person,
often in capitals. Enormous beard, furs, greataxe. Role: tank / bruiser / taunts. 35 HP (+5/level), move 3, init 0.
- Passive *MAGNIFICENCE*: each of his skills that reaches a foe adds 1 MAGNIFICENCE. At 5, his next skill also unleashes
  a **MAGNIFICENT SURGE** (random good wild magic, +10 party Hype, and he heals 8 HP) and the meter resets.
- Basic *Ginger Snap* (5, adjacent). Starters: *LOOK AT MARWYN!* (Taunt every foe within 2 and gain Block) and *YEET*
  (throw an adjacent friend or foe 3 tiles; on a crash it and what it hits take damage).
- Pool: Glorious Cleave (the 3 tiles in front), Use Your Head (hit and Stun; costs him 2 HP), Hero Landing (leap,
  then Taunt the foes next to him), Gun Show (Root adjacent foes and gain Thorns), Ginger Rage (hits deal less to him;
  +2 MAGNIFICENCE), Center of Attention (pull foes in, then Taunt them), Keg Stand (heal and splash water: Wet).
- Signature *BEHOLD, MARWYN!*: EVERY enemy is Taunted and he gains 15 Block.
- Combos: YEET foes into pits and lava (or a friend out of trouble); Center of Attention bunches foes for area skills;
  Keg Stand's splash puts out a Burning ally and leaves the foes around him Wet for a Thunder Jar or a Frost Flask
  (not right before Pebbles or Valdris: Wet foes can't Burn).

### Ellaria the Corgi Whisperer — Elf Druid (she/her)
Serene elf druid who solves every problem by **summoning corgis**. Flower crown, leafy robe. Role: corgi summoner /
healer / control. 26 HP (+4/level), move 4, init +1.
- Passive *Pack Leader*: she starts each fight with a corgi. A fallen corgi Inspires the party for their next turn
  ("AVENGE BISCUIT!").
- Corgis (`ell_corgi`): HP 8 + her level, a melee Bite 3 (so they make attacks of opportunity), a Bark that taunts,
  random names (Biscuit, Waffles, Sir Fluffington III, Nugget, Captain Loaf…), up to 3, acting on her turn.
- Basic *Thorn Whip* (4 and pull 1). Starters: *Summon Corgi* and *Healing Spring* (heal herself and allies in radius
  1; puddles fill the rest of the area).
- Pool: Entangling Roots (brambles: damage and Root), Barkskin (Block and Thorns), Who's a Good Boy? (heal and
  Empower), Fetch! (the nearest corgi bites a foe and drags it toward her), Zoomies (foes next to her corgis take
  damage and are pushed away), The Ol' Switcheroo (swap places with a corgi), Wild Shape: Absolute Unit (once per
  fight: an immovable giant corgi whose basic attack is Chomp).
- Signature *Release the Corgis*: a corgi pounces beside each of up to 6 foes, bites it for 6 and Taunts it.
- Combos: corgis hold the line and soak hits; Healing Spring's puddles leave foes Wet for a Thunder Jar, a Frost Flask
  or Syllamin's Electric Lute (and put out their Burns); Fetch! and Thorn Whip pull foes into allies' cleaves and traps.

### Josiah the Medically Dubious — Human Plague Doctor (he/him)
Beaked plague doctor who brews questionable potions and commands a raven named **Onyx** (user request: always Onyx,
re-summoned or not). Long coat, wide hat, smoke from the beak. Role: poison healer and raven wrangler. 26 HP
(+4/level), move 4, init 0. His cane reaches 2 tiles, so he makes no attacks of opportunity.
- Passive *Unlicensed Apothecary*: he starts each fight with Onyx. Poison is contagious: when a Poisoned foe dies,
  adjacent foes catch all of its Poison. +1 consumable slot. (His old post-fight brewing lives on the Portable Alembic.)
- Basic *House Call* (a cane poke up to 2 tiles away: 4, or 6 against a Poisoned foe). Starters: *Plague Flask*
  (poison in radius 1) and *Mostly Medicine* (heal an ally within 3, or himself).
- Pool: Raven Dive (Onyx swoops in and pecks), Prescribe Leeches (drain), Plague Miasma (a flammable poison cloud),
  Quarantine (Root and Vulnerable), Vaccinate (cleanse and a short debuff immunity), Volatile Brew (a fire bomb that
  pushes everyone outward, allies too), Murder of Crows (Onyx's flock hits every foe around the raven), Smelling Salts
  (revive at range, once per fight).
- Signature *Pandemic*: every foe takes 8 poison damage and is Poisoned 4.
- Combos: contagious Poison rewards area kills; Quarantine marks a Vulnerable target for the party; the Brew pushes
  foes into hazards; fire turns his Miasma into a bonfire.

### Sparrow the Hemogoblin — Goblin Blood Mage (she/her)
Small, scrappy, edgy goblin who pays for her spells **in blood** — hers, ideally someone else's. Daggers, red runes on
her skin. Role: high-risk bleed assassin. 22 HP (+3/level), move 5, init +3.
- Passive *Blood Price*: her skills' HP costs are paid by an adjacent Bleeding foe instead of her, when there is one.
- Basic *Shiv Happens* (4 and Bleed 1, adjacent). Starters: *Hemo-Glob* (2 HP: a ranged hit and Bleed) and *Juice
  Box* (drain a foe within 3: more damage per Bleed on it, and she heals the damage dealt).
- Pool: Thousand Paper Cuts (area Bleed), Say It, Don't Spray It (cone and Dazzle), Scab Armor (HP for Block), Goblin
  Mode (teleport and Stealth), Blood Puppet Show (drag every Bleeding foe), Evil Twin (a taunting Blood Clone), Blood
  Drive (heal an ally and Empower it), Vein Glory (dart in and gut a foe).
- Signature *Crimson Tide*: costs half her current HP; every foe within 3 takes 16 damage and Bleeds 3.
- Combos: Bleeding foes take damage every time they move or get pushed, so every shove in the party hurts more;
  Blood Puppet drags foes into hazards and traps; a Bleeding foe next to her pays her bills.

### Corelos the Undersigned — Human (Mostly) Runic Sorcerer (he/him)
Sorcerer whose skin and staff glow with runes, with a terrible habit of **making dark bargains** — he signs anything.
Role: rune traps and dark bargains. 24 HP (+4/level), move 4, init +1.
- Passive *Collateral Damage*: his bargains cost Debt, paid in HP at the start of his next turn. Every foe that dies
  before then pays off 4 of it.
- Basic *Rune Bolt* (4; his runes on or next to the target burst). Starters: *Glyph of Warding* (a rune, max 3: when
  a foe steps on it, foes on and next to it take damage) and *Dark Bargain* (0 AP: gain 2 AP, take Debt).
- Pool: Runic Detonation (all his runes burst at once), You've Been Served (line pull), Restraining Order (push
  adjacent foes away), Cease & Desist (Stun), Sign Here, Please (Charm a non-boss; Debt), Soul Contract (Block for
  Debt), Infernal Lawyer (a flying imp lawyer: Billable Poke, and Objection! taunts; once per fight), Collect Debt
  (damage plus his Debt).
- Signature *Read the Fine Print*: every foe is Stunned (it skips its next turn).
- Combos: runes punish the paths enemies walk on their own turns, and allies' pushes and pulls drop foes onto them;
  kills pay his Debt, so he bargains right before the party's big turn.

### Slate the Unamused — Stone Golem Guardian (Retired) (he/him)
User's brief: *a grumpy golem (pale blue stone + runes) who can rage to flare his runes. He throws things and grapples
things.* Ancient pale-blue stone golem covered in carved runes that stay dull until he gets angry — and he is always
getting angry (noise, being touched, being healed "without consent", kids these days). Talks in grunts and short
complaints ("Hmph." "No." "Get off my lawn."). Role: grappler / thrower / bruiser. 32 HP (+4/level), move 4, armor 1,
init −2, `immovable` (pushes and pulls don't budge him).
- Passive *Short Fuse*: he gains 1 Rage (max 5) whenever someone else hits him, heals him or gives him a buff status
  (Block doesn't count). At 3+ Rage his runes flare: his skills deal +2 damage.
- Basic *Love Tap* (5, adjacent). Starters: *Hold Still* (grab an adjacent foe: it is Grappled until the end of his next
  turn — it can't move and is dragged along when he walks) and *Personal Space* (throw an adjacent foe or object; it and
  what it hits take damage).
- Pool: Hard Pass (lob a boulder over walls), Air Mail (throw an ally onto a safe tile; foes next to the landing take
  damage), Putting My Foot Down (cone stomp and push), Get Off My Lawn (Taunt foes within 2 and gain Block), Rock
  Bottom (slam an adjacent foe onto the tile behind him), Blow a Gasket (vent all his Rage around him), Get Over Here
  (rune-chain pull), Stress Ball (squeeze the foe he is holding: damage, and he heals; his own heal never gives him
  Rage).
- Signature *Tectonic Tantrum*: every foe within 2 takes 15 damage and is knocked 2 tiles away; then his Rage maxes out.
- Combos: throws and slams into pits, lava and allies' traps; Air Mail drops a melee ally into the fight; the party's
  heals and buffs feed his Rage (he hates it); grab, then squeeze, drag or throw it on his next turn.
- Sprite: big `construct` golem in pale blue-grey stone (#9fb7c9-ish) with cyan rune lines; rune aura only while raging.

### Mayor Buga the Toast of the Town — Toast (Sourdough) Mayor (he/him)
User's brief: *an anthropomorphic piece of toast who is all about the loot and manipulating allies.* A slice of lightly
buttered toast with tiny arms and legs, a mayor's sash, chain of office, top hat and the soul of a small-town
politician: shameless, greedy, smiling for the cameras, taking credit for everything. Role: support, manipulator,
loot. 24 HP (+4/level), move 4, init 0.
- Passive *Skimming Off the Top*: whenever an ally (or a foe he bribed) defeats an enemy while Buga stands, he takes
  the credit: +2 gold.
- Basic *Campaign Pamphlet* (4, range 4). Starters: *Delegate* (point at a foe: the best-placed ally makes a free basic
  attack on it) and *Loitering Fine* (a hit that pockets gold).
- Pool: Campaign Promise (an ally gains AP on its next turn), Human Shield (swap places with an ally; it gains Block),
  Bribe (pay gold to Charm a non-boss), Butter Up (an ally is Empowered), Red Tape (pull a foe and Root it), Photo Op
  (nearby allies are Inspired), Pork Barrel (plant a barrel that explodes at round end, or when hit or lit), Crumb Trail
  (flammable crumbs that Slow grounded foes).
- Signature *Toast of the Town*: point at a foe within 6; every ally who can hit it makes 2 free basic attacks on it.
- Combos: Delegate and the Toast spend the party's basic attacks (and their riders) on his target; Butter Up or a
  Campaign Promise right before an ally's big skill; shoot his Pork Barrel or light it; Red Tape pulls foes into cleaves.
- Sprite: `custom` painter — toast slice (golden-brown body, darker crust rim, butter pat on top), dot eyes, big grin,
  stubby limbs, top hat, sash, gold chain (bling).

### Kiri the Half-There — Half-Elf Ranger (she/her)
User's brief: *Kiri (female) half-elven ranger. Can send her arrows into the ethereal plane and move ethereally.*
Dry, competent, slightly spooky ranger whose arrows (and occasionally she herself) slip into the ethereal plane; tired
of being asked whether she's "the elf or the human one". Role: ranged precision and ethereal mobility. 24 HP
(+4/level), move 4, init +3.
- Passive *Between Worlds*: her own skills ignore line of sight — walls, pillars, trees and smoke don't stop her.
- Basic *Ghost Arrow* (5, range 5). Starters: *Phase Shot* (every foe in a straight 5-tile line, through walls and
  units) and *Ethereal Step* (teleport up to 3 tiles in a straight line, through walls and units).
- Pool: Spirit Mark (the foe's next damage taken is bigger), Pinning Shot (hit and Root), Banishing Shot (hit and push
  2), Haunted Volley (radius 1), Arrow from Beyond (lands at the start of her next turn, wherever the foe went), Fade
  Out (Stealthed until the end of her next turn), Mist Opportunity (ghost mist that blocks everyone's sight but hers).
- Signature *Rain from the Other Side*: 16 damage to every foe within 2 of a tile within 6, ignoring Block and armor.
- Combos: Marked and Rooted setups for allies' big hits; Phase Shot down the lines allies' pulls create; her mist
  blinds the enemy archers while she shoots through it.
- Sprite: half-elf (short pointed ears), hooded green-grey ranger cloak, longbow, quiver, ghostly violet-blue glow on
  her arrows and steps.

### Betty the G.O.A.T. — Goatfolk Warrior (he/him)
User's brief: *Betty (goat-man warrior).* A big goatfolk warrior named Betty ("It's a family name."): horns, beard,
hooves, a breastplate stamped "BETTY", the family hammer. Bleats mid-sentence ("BAAAttle!"), calls everyone "kid",
eats anything (the loot, the map, the DM's notes). Role: frontline charger, knockback, holds the line. 32 HP
(+4/level), move 4, init +1, `hop` (goats climb).
- Passive *Eats Anything*: whenever Betty kills a foe or one of his skills breaks an object, he eats it and heals 4 HP.
  Don't ask.
- Basic *The Family Hammer* (5 to an adjacent foe or breakable object). Starters: *Ramming Speed!* (charge up to 3
  tiles in a straight line: the first foe in the way takes damage and is pushed 2) and *Butt Out* (hit and Stun).
- Pool: Head Over Heels (flip a foe over him: Vulnerable), Bleat of Defiance (Taunt foes within 2), Stomping Grounds
  (the 8 tiles around him, and Slow), Goat Yoga (Block for him or an adjacent ally), Five-Second Rule (eat something
  off the floor: heal), Mountain Goat (leap, any height), Kick 'Em While They're Down (double damage against a Stunned
  or Rooted foe), You Shall Not Pasture! (until his next turn his attacks of opportunity hit harder and Root).
- Signature *G.O.A.T.*: charge up to 6 tiles in a straight line, right through every foe in the way: 15 damage each
  and Stunned.
- Combos: rams into pits, lava, traps and Corelos' runes; anyone's Stun or Root sets up Kick 'Em; You Shall Not
  Pasture! turns him into a wall the party hides behind.

### Basanos the Mostly Housebroken — Human (Werewolf) Monster Hunter (he/him)
User's brief: *Basanos, human who can transform into a werewolf.* An apologetic, scruffy monster-hunter who IS the
monster once things get bad ("I'm not a dog." "Sorry about the sheep."). Role: melee in both forms (user: "in melee
form should be a melee fighter") — as a man a disciplined swordsman, as a werewolf a savage, fast skirmisher. His
skills are tagged human or wolf; the other form's skills are greyed out. 28 HP (+4/level), move 4, init +2.
- Passive *Hair Trigger*: when damage leaves him below half HP, he turns into the werewolf for free (+2 move, the Claw
  basic attack, wolf skills). Sorry in advance.
- Basic *Silvered Sword* (5, adjacent) as a man, *Claw* (4–5 and Bleed 1–2, by his Transform level) as the wolf.
  Starters: *Transform* (1 AP: switch forms; his first Transform each turn heals him 2–4 HP, by level — Hair Trigger and
  Blood Moon never heal) and *Shoulder Check* (human: hit and push).
- Human pool: Silver Slash (a big hit and Vulnerable), Hold the Line (Taunt foes within 2 and gain Block), Step In
  (swap places with an ally and gain Block). Wolf pool: Rend (Bleed), Pounce (leap next to a foe and Stun it), Howl (he
  and allies within 2 are Inspired), Savage Bite (heals him on a kill), Frenzy (every adjacent foe, and Bleed).
- Signature *Blood Moon*: he becomes the werewolf (a huge dire wolf for that turn) and mauls every foe within 2: 14
  damage and 3 Bleed each.
- Combos: his Bleed feeds Sparrow's Juice Box and every shove; Step In pulls a squishy ally out of trouble; Pounce
  stuns the caster before its turn comes up.
- Sprite: human swordsman (worn coat over mail, silvered sword, stubble) and a werewolf form via the sprite override
  (grey fur, snout, ears, claws, a little bigger).

### Valdris the Well-Conditioned — Human Forge Cleric (he/him)
User's brief: *Valdris (male), a human forge cleric with long blonde hair. Focuses on forging weapons and armour.*
A devout smith-priest of the forge god who tempers steel with prayer and is very, very protective of his long, golden,
somehow soot-free hair ("Mind the hair."). Role: forge support / frontline buffer. 28 HP (+4/level), move 3, armor 1,
init 0.
- Passive *Strike While the Iron's Hot*: Valdris deals +3 damage to Burning foes, attacks of opportunity included.
- Basic *Percussive Maintenance* (5, adjacent). Starters: *Flame-Forged Edge* (an ally's, or his own, next damaging
  skill sets each foe it hits Burning) and *Forge Armor* (Block for him or an ally).
- Pool: Forge Weapon (an ally deals +2 damage with every hit until the end of its next turn), Spiked Pauldrons
  (Thorns), Temper (shed every debuff), Hammer of Faith (hit and push 2), Molten Spray (fire cone and Burn), Anvil Drop
  (a heavy hit and Stun), Hair Flip (Dazzle the foes around him).
- Signature *Divine Forge*: Valdris and every ally deal +3 damage with every hit until the end of their next turn, and
  gain 8 Block.
- Combos: buff the party's big hitters (Marwyn, Betty, Basanos) right before their turn; Flame-Forged Edge on an area
  skill sets a crowd Burning for his passive and Pebbles' Bark-B-Q.
- Sprite: armored human cleric with long flowing blonde hair, forge apron over chainmail, a big smithing hammer, a
  holy-symbol anvil charm, ember-orange glow.

### Hjalmar the Menace — Monkey Trickster (he/him)
User's brief: *Hjalmar (male), a monkey. Very mischievous, focuses on comedic traps.* A small, gleeful menace of a monkey
who steals hats, rigs everything and laughs at his own pranks. Role: trapper and trickster. 22 HP (+3/level), move 5,
init +4, `hop` (climbs everything).
- Passive *Monkey Business*: every time a foe springs one of his traps, the party gains 5 Hype. The crowd loves a
  pratfall.
- Basic *Coconut Toss* (4, range 4). Starters: *Banana Peel* (the first foe to step on it slips: it can't act until the
  end of its turn) and *Bear Trap* (damage and Root).
- Traps, one verb each, set within 3 (the first foe to step on one springs it): Whoopee Cushion (Taunted by Hjalmar),
  Paint Bucket (Dazzled), Firecracker Bundle (fire damage to every foe within 1), Spring Glove (knocked away from him).
  Plus Pickpocket (steal gold and Weaken), Swing Away (leap to a tile he can see) and Bait and Switch (swap places with
  a foe).
- Signature *Prank War*: every foe within 2 of a tile within 5 takes 8 damage and slips.
- Combos: allies' pushes and pulls (and his own Bait and Switch) put foes on his traps; trapped, Rooted foes feed
  Betty's Kick 'Em. Traps lie on the floor, so flyers float over them.
- Hero item *Canned Laughter* (rare trinket): he heals 4 HP whenever a foe springs one of his traps.
- Sprite: small monkey (brown fur, pale face and belly, long curly tail), a tiny fez or vest, a huge grin, a sack of
  props.

### Pebbles the Goodest Boy — Fire Dog (he/him)
User's brief: *Pebbles (male), a dog made of fire. A good boy.* A living bonfire in the shape of a happy dog: wags his
tail and sets the carpet on fire, brings back sticks that are now torches, loves everyone. Role: melee skirmisher and
fire control. 26 HP (+4/level), move 5, init +3; fire can't hurt him (fire resist 0, immune to Burn).
- Passive *Hot Dog*: Pebbles is made of fire: fire damage and Burn can't hurt him, and ending his turn on fire or lava
  heals him 3 HP.
- Basic *Spicy Nibble* (4 and Burn 1, adjacent). Starters: *Hot Zoomies* (dash up to 4 tiles, leaving fire on every
  tile he leaves, except under allies) and *Fetch Quest* (a fire hit that pulls the foe toward him).
- Pool: Chew Toy (hit and Root), Big Wag (adjacent foes take fire damage and are pushed), Bork! (Taunt foes within 2),
  Emotional Support Dog (an adjacent ally heals and is Inspired), This Is Fine (sets the floor around him on fire),
  Bark-B-Q (fire damage to every Burning foe within 3), Puppy Eyes (Charm a non-boss).
- Signature *Hot Diggity Dog!*: 16 damage to every foe within 2; Pebbles and every ally are Inspired until the end of
  their next turn.
- Combos: oil plus his fire; Burning foes for Valdris' passive and Bark-B-Q; pulls into allies' cleaves. Wet foes
  can't Burn (mind Ellaria's puddles and Marwyn's keg).
- Sprite: quadruped dog made of flames (orange-yellow body, darker ember core, flickering flame aura, glowing eyes, a
  little collar tag reading "PEBBLES").

### 6.1 Design notes — open overlaps (documented, not redesigned)
Skills from the user's briefs that ended up doing nearly the same job. They are fine in play (different heroes,
different forms); a later design pass may differentiate them. Nothing here changes the game.
- **Fabulous Strut** (Zarathor) ≈ **Hot Zoomies** (Pebbles): a 1-AP dash that leaves fire on the tiles behind it
  (Strut: a straight line of 3–5; Zoomies: any route of 4–6 that spares tiles under allies).
- **Butt Out** (Betty) ≈ **Use Your Head** (Marwyn): a 2-AP adjacent hit that Stuns, cooldown 3 → 2 (Marwyn's hits a
  little harder and costs him 2 HP).
- **Get Off My Lawn** (Slate) ≈ **LOOK AT MARWYN!** (Marwyn) ≈ **Hold the Line** (Basanos, human form): 1 AP, Taunt
  every foe within 2 (3 at level III) and gain Block. Bleat of Defiance (Betty) and Bork! (Pebbles) are the same taunt
  without the Block.
- **Power Ballad** (Syllamin) = **Howl** (Basanos, wolf form): the same text — he and allies within 2 are Inspired for
  1 turn (III: within 3, for 2 turns); Howl has the longer cooldown (3 vs 2).
- **Hjalmar's traps ≈ Corelos' glyphs**: Firecracker Bundle and Bear Trap are floor traps that hurt the first foe to
  step on them, like Glyph of Warding (which also bursts next to it, can be detonated, and Roots at level III like the
  Bear Trap).
- Other open calls: Zarathor's starters (Throw Money At It + Wild Card would put his wild magic in his hands from
  turn 1; the ui suite's POOL list moves with them); the Plot Armor Blessing keeps a walk going at 1 HP where the
  Phoenix Feather ends it.

## 7. Shared content
- **Generic skills** (`owner: 'generic'`, 12, learnable by anyone via tomes): Throw Chair, Second Wind, Dodge
  Roll, Rude Shove, Rally the Troops, First Aid, Sand in Your Eye, Come At Me, Bro, Sucker Punch, Barrel Toss, Power
  Nap, and **Tactical Retreat** — the generic Disengage: walk up to 3 tiles (5 at level III) without provoking attacks
  of opportunity.
- **Items** (51 shared: 20 common, 16 rare, 7 legendary, 8 cursed; plus 3 hero items per hero, Josiah and Hjalmar 4;
  the First-Aid Fanny Pack is ordinary common loot since D9, §3): weapons
  (damage riders), armor (max HP, **armor** — each point takes 1 off every attack, down to a minimum of 1 damage —
  retaliation and resistances),
  trinkets (weird hooks; an `init` bonus lives here). **No item gives Block at combat start** — nobody starts a fight
  with Block (§4.1); Block only comes from skills and a few mid-fight effects. Cursed items have big upsides and
  hilarious, mechanically real downsides.
- **Consumables** (15): Red Drink (heal), Big Red Drink, Bucket of Ice Water (revive a downed ally within 2 at 50%;
  every party starts with one), Flask of Bad Decisions (fire AoE), Smoke Bomb, **Energy
  Drink (+2 AP**: you now, or an adjacent ally on its next turn), Antidote, Liquid Courage, Scroll of Yeet, Bag of d4s,
  Holy Water, Frost Flask, Thunder Jar, Pocket Sand (Family Size), Mystery Potion.
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
- **Rarity** (default weights): common 10, uncommon 6, rare 3, legendary 1, cursed 4. 79 entries: 33 common,
  18 uncommon, 11 rare, 6 legendary, 11 cursed. Mostly hero-agnostic; some only appear for heroes they suit
  (`requires`: summoners, flyers, HP-payers, gold-spenders...).
- **Power budget**: a common ≈ a third of a skill level (+1 armor, +2 damage in a niche, a small proc); rare ≈ a
  strong item; legendary changes how the hero plays; cursed = legendary upside + a real cost. Levels II/III
  scale ≈ +50% / +100% or add a rider.
- **Very random** means: random procs (10–30% chances), wild magic triggers, ducks, teleports, weird conditions
  (adjacent to a wall, on high ground, at exactly 1 HP, on odd rounds, when an ally says something...), run-layer
  effects (gold, shop prices, healing, a heavier weight in the level-up roll — there is no XP), and pure chaos — always
  exact in the text, always tested.
- Examples: *Lucky Socks* (crits... sort of), *Main Character Syndrome* (+Hype from your kills, allies get less),
  *Plot Armor* (once per fight, a lethal hit leaves you at 1 HP), *Allergic to Goblins*, *Pet Rock*, *Spicy Blood*
  (attackers catch fire), *Haunted by a Ghost Accountant* (+gold, sometimes Confused), *Sleepwalker*, *Coin Magnet*,
  *Overcaffeinated* (+2 initiative, +1 AP in round 1, −1 AP in round 3: the crash), *Quantum Pockets* (random
  consumable some fights),
  *Emotional Support Duck* (summons a duck), *Cursed: Glass Cannon*, *Cursed: Kleptomaniac*, *Cursed: Loud Eater*.

## 8. Enemies
Design rules: every enemy has a **readable gimmick** shown in its tooltip/inspect panel and visible in how it
behaves; 1–3 skills; an AI style; an initiative modifier; a strong silhouette (SpriteSpec); 2–4 barks per key; a
codex `desc` joke. v2: enemies act on their initiative turn without telegraphs (only bosses and a few elites wind up
their biggest attacks: "Elite wind-ups" below).
Each act ships ~8 normal/minion enemies + 3 elites + 8–12 encounters (normal + elite) using its themes.
- **Targeting (v2, user request: "mobs seem to prioritize the lowest health hero irrespective of range, and melee
  characters feel very weak")**: enemies attack what they can actually **reach this turn** (walk cost, line of sight,
  the attacks of opportunity a walk would provoke count as a cost). Brutes **stick to the hero next to them**
  (engaged), then weigh threat (how hard a hero hits) and damage; low HP is only a tiebreak, though a sure kill still
  tempts an unengaged enemy. Ranged enemies keep their distance and shoot what is in range (a melee hero next to an
  archer pins it). Taunt still forces: a taunted enemy walks to its taunter through attacks of opportunity. Only
  **sneaky types dive the weakest hero**: give rogues, flyers, imps and assassins the `'assassin'` (alias
  `'skirmisher'`) AI style — they go for kills, the wounded and the squishy and shrug off attacks of opportunity
  (though never a lethal one). Nobody walks into an attack of opportunity that would drop it.
- **Divers** (the `'assassin'` / `'skirmisher'` style, one kind per act so the act's fights stay readable): the
  **Cellar Spider** (act 1), the **Will-o'-the-Wisp** and the **Gargoyle** (act 2), the **Imp Influencer** (act 3).
  Everyone else sticks to whoever is next to them or keeps its distance.
- **Elite wind-ups**: each elite announces at most one signature move (⏳, lands at the start of its next turn, a stun
  interrupts it): the Mimic's **Lid Slam** (act 1's only one), Mama Owlbear's **Earth-Shaking Stomp** (act 2's only
  one), the Young Red Dragon's **Hoard Breath**, the Death Knight's **Villain Monologue** (silence or 20+ damage also
  stop it) and the Pit Fiend's **Hostile Audit** (act 3). Everything else happens at once.
- **Act 1**: Dire-ish Rat (packs, Bleed), Goblin Grunt (a spear that reaches 2 tiles), Goblin Slingshot Kid (line
  shot), Kobold Union Rep (Strike Action!: allies Inspired), Sewer Slime (splits on death), Spore Bro (walks up and
  explodes into poison), Cellar Spider (webs and Root; the diver), Bandit Bard Critic ("Bad Review": Weak). Elites:
  Mimic (Disappointed) (Gold Digger swallows party gold; the Lid Slam), Bugbear Bouncer (throws heroes), Gelatinous
  Cube (engulfs).
- **Act 2**: Skeleton Intern (reassembles unless finished properly), Zombie (Unpaid) (yanks a hero in and Roots it),
  Cultist of the Forbidden Brunch (heals with mimosas, serves Hollandaise Horrors), Will-o'-the-Wisp (blinks, chain
  lightning; a diver), Owlbear Cub (charge), Banshee (Wants to Speak to the Manager) (cone Stun), Gargoyle (dives from
  its perch, then Stone Form; a diver), Pixie Swarm (Fairy Dust-Up: Dazzle; single-target hits deal half). Elites:
  Mama Owlbear (leaps and mauls; the Stomp), Necromancer TA (raises dead, bone walls), Flesh Golem Gary (lightning heals
  him; throws; Tesla Coils).
- **Act 3**: Imp Influencer (blinks, livestreams; the diver), Hell Hound (fire breath, Lap Dog leap, Ankle Biter),
  Mind Flayer Life Coach (charm, psychic cone), Floating Eyeball Intern (piercing beam, then passes out), Rules Lawyer
  (Devil, Esq.) (OVERRULED!: every buff gone and Silenced; Motion to Dismiss shoves), Natural 1 Golem (d20 attacks),
  Kobold Dragonshield (Shield Wall), Succubus Dating Coach, Skeletal Backup Dancer. Elites: Young Red Dragon (Hoarder:
  guards its Hoard Piles), Death Knight (Very Dramatic), Pit Fiend Accountant (Infernal Debt).
- Enemy skill names never reuse a hero-side name (§6 "Display names are unique per side").

## 9. Bosses (each its own file, handcrafted arena, phases, puzzle)
v2: bosses act on their initiative turn like everyone else (a boss may have two initiative entries if its design
needs it), without telegraphs — except **wind-ups**: the 1–3 signature attacks below that were "telegraphed" or
"delayed" are announced when the boss begins them (banner, marked tiles, ⏳) and land at the start of its next turn.
The puzzles hang off these wind-ups and the arena objects.
Every boss's inspect panel names what it does on its turn and what comes next. Each shrugs off further stuns for a
little while after one lands (Appeal Pending, Recess, Speed-Reading, Squinting, the DM's stun guard); the stun that
lands interrupts the wind-up it was charging (the DM's phase-3 doom is only pushed back). Numbers: §5; knobs: each
boss's notes.
1. **Grimble, Goblin Tax Collector** (Act 1, tax office/vault; 160 HP, **two turns a round**, init +2). Each turn ONE
   action: the Rubber Stamp of Denial on a hero next to him, else his docket — *Levy* (steals party gold, gains Block;
   needs line of sight: filing cabinets are cover), *Please Hold* (Root anywhere), *Levy*, *Hire Intern* — then he winds
   up an *Audit* (a paperwork barrage down a whole row or column, one round later). Gold he holds makes him hit harder.
   Puzzle: three Tax Loophole levers; pulling all three drops the vault door on the DROP ZONE (huge damage, Stun, his
   Block gone, the gold back). Phase 2 *Hostile Takeover* (below half HP, or from round 10): crossing Audits, Garnish
   Wages through walls, Hasted interns, and he leaves the desk.
2. **The Rat King & the Rat Bar Association** (Act 1, sewer junction; 150 HP, 122 in a campaign (act 1's boss row and
   his own ×0.9 HP row, §5), **two turns a round**, init +2, immovable). A crowned swarm of conjoined rats that grows stronger every round; Tangled Tails reels a hero in and
   Roots them, and a Rat Pile hits everyone around him; wind-ups *Gnaw* (collapses rotten floor into pits) and *Sewer
   Surge* (washes a channel into the drain). Splits into Rat Lawyers (Strike That!, Temporary Injunction) at 66% and
   33%. Puzzle: two sluice valves flush a channel on your terms — wash the King (30, Stunned, his swarm reset) and his
   lawyers down the drain.
3. **Lich-tenstein, the Overdue Librarian** (Act 2, haunted library; 320 HP, one turn a round). An Overdue Notice to
   the nearest hero every turn (no line of sight: it's mail), *Late Fees* that grow every turn up to 12 (the fine print
   has a ceiling; shredding a phylactery resets them), and one
   wind-up at a time: *Bookfall* (checkerboard) and its *Second Printing*, *SHHHH!* (Silence), skeleton interns; phase
   2 *FINAL NOTICE* (whole rows, QUIET!!!). Puzzle: three phylactery "overdue books" hidden in the deepest shelves
   (some shelves are mimics; Card Catalogs point the way); while any remain, the lich reforms from his bones.
4. **Dr. Iris, Beholder Optometrist** (Act 2, clinic; 220 HP, one turn a round). *Eye Exam* (an eye-chart "E"
   wind-up: the gaps are safe), the anti-magic cone (Silence), *Disintegrate* (a 2-turn wind-up that tracks its
   target), Optic Rays in a rotating lighthouse pattern, and a Clinical Gaze on every hero she can see at her turn end
   (except right next to her). Puzzle: turn the Exam Mirrors so a charged ray bounces back into her (each mirror once);
   pillars give cover — until closing time: from round 10 nothing hides you from the Gaze and it deals 2 more each
   round, so no fight stalls behind a pillar (finish run, Nov 14: was round 14).
5. **The Dungeon Master** (Act 3 final, the DM's table: felt floor, giant dice, a Mountain Dew can tower, Cheeto
   dust; **400 HP**, one turn a round, init +2). Each turn: **one action** (a **20-damage roll**, Get Off My Table,
   a Random Encounter of cameo minis, a Plot Hook on a hero hiding from him) and **one wind-up**; **two actions** a
   turn in phase 3. *House rules* (a random global rule each round). Phase 1 *Session Zero*: invulnerable behind the
   DM Screen until its panels fall (then it collapses on him); *Rocks Fall* wind-ups. Phase 2 *The Railroad*: trains
   thunder down the pencilled lanes; a Track Switch sends one through his own row. Phase 3 *Rocks Fall, Everyone Dies*:
   a doom that lands in 3 of his turns (stuns only delay it) unless the heroes cite all three Player's Handbooks to
   rules-lawyer back. He never moves and makes no attacks of opportunity (his cameo minis hold the line for him).
   Whole-fight rule *Fudged in Your Favour* (a rule chip): a roll of his (Fudged Roll, Roll Behind the Screen) never
   takes a hero with 75%+ of their HP straight to 0; at worst it leaves 1 HP.
   Defeat line: "Fine. FINE. You win. Same time next week?"

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
35 events (2–3 choices each, at least one with a risk/reward trade; none grants XP — a level-up goes through the
DM's rotation, and a named level-up is rare and costs something). **Every hero has a hero event** (only when that hero
is in the party; Slate and Mayor Buga have two): Zarathor and a bling merchant (Glimmerjaw); Syllamin's rap battle;
Professor Marbles' lost marbles; Marwyn and a MAGNIFICENT mirror; Ellaria and a lost corgi; Josiah's Plague-Rat Union;
Sparrow's blood bank; Corelos' patron's fine print; Slate and the noisy kids, or a sculptor who wants to "fix" him;
Mayor Buga's re-election campaign, or a toaster cult that worships him; Kiri's ethereal lost and found; the Betty
family reunion; Basanos and the mystery of who ate Dolly; Valdris and a forge god who wants to trim his hair; Hjalmar
and the Prank King of the Underdark; Pebbles at a dog show. Generic (17): The Dice Goblin (gamble), A Wizard Did It,
Session Cancelled (Real Life), Fountain of Questionable Youth, Cursed Ring Clearance Sale, Bracket & Bracket (Rules
Lawyers), Snack Run, Retcon, I Check for Traps, Mimics Anonymous, the Infernal DMV…
Narrator lines for every key in ARCHITECTURE §3.10 (8+ lines each), plus 30+ loading-screen tips (79 today), each one
mechanically true.

## 12. Visual & audio direction
- Isometric, chunky, readable. Procedural canvas art only (no image files): diamond tiles with subtle per-tile
  noise, darker side faces for elevation, animated water/lava/fire. Chibi units (big heads, bold dark outline,
  idle bob, squash on hit, white hit-flash, lunge on attack, fade + tumble on death).
- The camera turns (middle-drag to any angle, Q / R quarter turns, Home resets): art must read from every side.
- v2: the **initiative tracker** (portraits in turn order, current turn highlighted, rolls shown) and **wind-ups**
  (bosses and a few elites: red pulsing tiles with hatching + ⏳) must be unmissable; hold-to-show threat shading for
  enemy reach.
  No per-enemy telegraphs.
- UI: dark tavern wood + parchment panels + gold trim; fantasy display font (e.g. Google "Cinzel"/"MedievalSharp"
  with Georgia fallback) and a clean readable body font. Big readable numbers. Every interactive thing has a tooltip.
- Audio: procedural WebAudio blips/whooshes/thuds; corgi yips; raven caws; mute + volume in settings.
