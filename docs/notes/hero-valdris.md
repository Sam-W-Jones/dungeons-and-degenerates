# HERO — Valdris, the Well-Conditioned (notes)

Files: `js/data/heroes/valdris.js`, `tests/content/hero_valdris.js` (21 suites `hero_valdris: …`), this file.
Run: `bash tools/test.sh "suite=hero_valdris&isolate=heroes/valdris,hero_valdris"` and `bash tools/test.sh "suite=content:&isolate=heroes/valdris,hero_valdris"`;
the real-hero combo checks in the review suite only run without `isolate` (`bash tools/test.sh "suite=hero_valdris"`).
Looks: `bash tools/shot.sh "debug=1&fixtures=1&isolate=heroes/valdris,hero_valdris&screen=gallery&gallery=valdris" .tmp/valdris/g.png 1280x720 4000`;
in combat: `bash tools/shot.sh "debug=1&fixtures=1&isolate=heroes/valdris,hero_valdris&screen=combat&party=valdris,test_knight,test_cleric,test_mage&encounter=test_a1_boss&seed=5&autoplay=1&fast=1" .tmp/valdris/c2.png 1280x720 9000`.
Scratch (not shipped) in `.tmp/valdris/`: `sprites.html` (big sprite, every pose and facing, attack swing frames, a "stock hammer in
red" leak check, portraits), `faces.html` (beard / mouth variants), `shot.sh` (screenshots a page there; takes a machine-wide
Chrome slot like `tools/*.sh`). Review scratch in `.tmp/valdris-review/` (gallery / combat shots, the act-1 sims, the baseline run).

## Summary

Built from scratch, v2-native (initiative, one turn per unit, no telegraphs, no Guard, no combat-start Block, attacks of
opportunity). User brief: *"Valdris (male) a human forge cleric with long blonde hair. Focuses on forging weapon and armour"* —
he/him. DESIGN §6 "Valdris" + "Simplicity": one verb per skill, power from combinations. A devout smith-priest of the forge god
who forges weapons and armour for the party mid-fight, sets their blades on fire, hammers the dents out of their armour while
they are still wearing it, and is very, very protective of his long golden hair ("Mind the hair."). Role: forge support /
frontline buffer. Complexity 2, `unlock: null`, 28 HP (+4/level), 3 AP, move 3, **armor 1**, **initiative 0**, colour `#f2c14e`.
His basic attack is a melee hammer, so he **holds the line**: foes that walk away from him take a swing (attack of opportunity).

**Passive — Strike While the Iron's Hot** (one rule): *Valdris deals +3 damage to Burning foes, attacks of opportunity
included.* `modifyOutgoingDamage` adds it to his own skill hits (`d.cause === 'skill'`, not `d.opportunity`); his attacks of
opportunity get it through `modifyOpportunity` (`o.flat += 3`, pure), so the HUD's move preview, AI paths and
`DD.AI.opportunityDmg` see it (no double count: the damage hook skips `d.opportunity`). His Burn ticking (a status) and his
Thorns (a reflection) are never boosted (tested). The smithing idiom is the joke and the play pattern: light them up (his own
Flame-Forged Edge / Molten Spray, Zarathor, Pebbles, oil, lava), then hammer.

**Kit** (ids `val_*`; ⭐ starting; numbers I / II / III):

| Skill | id | Cost | Effect (one verb + at most one rider) | Pairs with |
|---|---|---|---|---|
| Percussive Maintenance (basic) | `val_basic` | 1 AP | 5 damage to an adjacent foe (also his attack of opportunity) | anything Burning (+3) |
| Flame-Forged Edge ⭐ | `val_flame_edge` | 1 AP, cd 1 | Valdris or an ally within 3: its next damaging skill sets each foe it hits Burning 3 / 4 / 5 | area attackers (Zarathor's Fireball, Kiri's Haunted Volley, a cleave, a cone light a crowd), then his passive, Zarathor's Burn payoff |
| Forge Armour ⭐ | `val_forge_armour` | 1 AP, cd 1 | Valdris or an ally within 3 gains 6 / 8 / 10 Block (until the start of its next turn) | the tank holding the line; allies who already acted this round |
| Forge Weapon | `val_forge_weapon` | 1 AP, cd 1 | an ally within 3 (allies only; summons count) deals +2 / +3 / +4 with every hit until the end of its next turn | multi-hit and area attackers (cleaves, cones, volleys), corgis' many bites, melee allies' attacks of opportunity |
| Spiked Pauldrons | `val_spiked` | 1 AP, cd 1 | Valdris or an ally within 3 gains Thorns 3 / 4 / 5 through its next turn | taunters (Marwyn, Betty, Basanos), anyone holding the line; stacks with Ellaria's Barkskin |
| Temper | `val_temper` | 1 AP, cd 2 / 1 / 1 | Valdris or an ally within 3 sheds all its debuffs (III: and heals 5) | a stunned / rooted / charmed / sheeped ally whose turn comes after his |
| Hammer of Faith | `val_hammer_faith` | 2 AP, cd 1 | 7 / 9 / 11 to an adjacent foe and push it 2 / 2 / 3 tiles away | pits (YEET), lava, water (Wet → lightning), allies' traps and clouds; frees an engaged ally (pushes never provoke) |
| Molten Spray | `val_molten` | 2 AP, cd 2 | 4 / 5 / 6 fire damage and Burn 2 / 2 / 3 to every foe in a cone 2 tiles deep (from him; aimed at a tile up to 2 away in a straight line); ignites oil and explosive barrels | oil slicks, Josiah's miasma, Buga's crumbs (fire on the floor), then the passive |
| Anvil Drop | `val_anvil` | 3 AP, cd 3 | a foe within 4 (line of sight): 10 / 13 / 16 damage and Stunned (loses its next turn) | interrupting a boss wind-up; a stunned foe makes no attacks of opportunity (free disengage) |
| Hair Flip | `val_hair_flip` | 1 AP, cd 3 / 2 / 2 | foes within 1 / 1 / 2 of Valdris are Dazzled through their next turn | Dazzled foes make no attacks of opportunity: the whole line walks away free; their next attack lands a tile off |
| Divine Forge (signature) | `val_signature` | 2 AP, 100 Hype | Valdris and every ally (summons too, anywhere) deal +3 with every hit until the end of their next turn, and gain 8 Block | the whole party's next turn |

Pool = 9 (+ basic + signature): AP 1 / 2 / 3 mixed, one big skill (Anvil Drop, 3 AP cd 3). Only Anvil Drop (a prayer) is a
`spell` (Silence stops it; his smithing it doesn't). Every desc is ≤ 24 words (longest 21, the hero average is 16 like the
rest of the cast), no conditions (tested). The two starting skills are a weapon and an armour (the user's words), and
Flame-Forged Edge turns the passive on from level 1 (the ally lights a foe, Valdris strikes while the iron's hot). Forge Weapon
is allies-only on purpose: on himself it would last his current turn *and* his next (a self-buff applied on his own turn is
`fresh`), twice the value of forging for a friend — and he forges for the party. Cooldown 1 = every other turn (ARCHITECTURE
§6.4), so his self-Thorns never overlap and never snowball (tested over six rounds).

**Statuses**:
- `val_forged` "Freshly Forged" (⚒️ buff, `refresh`, `turnEnd`, default 1 turn, stacks = bonus): `modifyOutgoingDamage` +stacks
  on its holder's own skill hits on foes; `modifyOpportunity` +stacks on its holder's attacks of opportunity (pure; the
  estimates see it); `telegraphFlat` = stacks. Forge Weapon (+2/+3/+4) and Divine Forge (+3) give it; `refresh` keeps the
  bigger bonus (Forge Weapon III then Divine Forge stays +4).
- `val_flame_edge` "Flame-Forged Edge" (♨️ buff, `refresh`, `decay: 'never'`, stacks = Burn): `onDealDamage` — each foe its
  holder's own skill hits (d.amount > 0, so a hit soaked by Block counts) gets Burn `stacks`, once per foe per skill; it is spent
  in `onSkillUsed` after that skill (or at once when the damage came from outside a skill resolution, e.g. Kiri's Arrow from
  Beyond landing at her turn start — tested with the real arrow and with a bare delayed hit). Attacks of opportunity neither use
  nor spend it (like Empowered); a skill that deals no damage to a foe (a buff, a whiff, friendly fire) leaves it.

**Items** (all `hero: 'valdris'`, no `stats.block`):
- `val_apron` "Kiss the Smith" Apron (armor, rare): +6 max HP, +1 armor; Valdris takes half damage from fire
  (`modifyIncomingDamage` d.mult × 0.5 on `element === 'fire'`, Burn ticks and lava included; his own fire on foes is untouched).
- `val_conditioner` Forge-Proof Conditioner (trinket, rare): +2 initiative, +4 max HP (the hair stays soot-free).
- `val_brightforge` Brightforge, the Unreasonably Large Hammer (weapon, legendary): +10% damage; **Flame-Forged Edge costs 0 AP**
  (`modifyCost`, the wielder's own skill only; its cooldown still applies). It is the legendary narrative's
  `ev_val_forge_god` hands him for his hair. (v2 review: it used to set foes hit by his attacks of opportunity Burning 3,
  which the reach-aware AI almost never lets happen — see Review (v2).)

**Sprite**: humanoid, stocky, scale 1.06, `armor` outfit (steel chainmail + pauldrons) under a leather forge **apron** (pocket,
chisel, scorch marks), a gold **holy anvil charm** on a chain, **long flowing golden hair** (the stock `long` cut plus an
overlay mane over the back shoulder to the waist, a lock over the front shoulder outside the face, a highlight band and a
twinkle), blond stubble, blue eyes, a grin, no blush; an **unreasonably large smithing hammer** (a blocky sledge head with two
striking faces, a gold collar and a gold anvil sigil, one face glowing ember-warm) painted over the stock `hammer` in the stock
item's own frame (`hammerGrip` replicates sprites.js `armAngles` / `itemRotation` for a stocky build; the `.tmp/valdris`
leak check draws the stock hammer in red/magenta underneath: nothing shows); ember `glow` aura and drifting embers at his heels
(underlay). Checked in the gallery (every pose and facing, statuses, portraits 128 / 64 / 40), the scratch sheet (swing frames)
and in combat (again at the v2 review: `.tmp/valdris-review/gallery.png`, `combat1.png`, `combat2.png`,
`.tmp/valdris/review_sheet.png`).

**Barks**: 13 keys × 4-6 lines, ≤ 70 characters, his voice (the hair, percussive maintenance, "I'll hammer the dents out
tonight"), cameos for Kiri, Ellaria, Josiah, Buga, Marwyn, Zarathor, Slate, Hjalmar and Pebbles (Betty gets the Conditioner's
flavor line); extra keys `opportunity`
(his swing at a foe walking off him), `iron` (the passive fires), `hair` (Hair Flip). No she/her about him anywhere (tested).

## Tests (`tests/content/hero_valdris.js`, 21 suites, ~1040 assertions)

registry / identity / numbers / descs at every level (numbers shown, ≤ 24 words, no conditions, levels differ) / barks /
pronouns / no v1 words · sprite + portrait (every pose, facing and swing frame, golden hair in the portrait, the grip math) ·
Strike While the Iron's Hot (5 vs 8, after armor, Wet can't burn, not for allies, Molten Spray on a Burning foe, the attack of
opportunity estimate 5 → 8 and the real swing 8, charmed → 0) · Percussive Maintenance · Flame-Forged Edge I-III (the knight's
cleave lights three, a war shout doesn't spend it, spent after, the next hit lights nothing, on himself → the follow-up is +3,
waits rounds, Block-soaked hits count, Wet sizzles, attacks of opportunity keep it, range 3 through walls) · Forge Armour I-III
(Block present on the enemy turn, soaked the stab, gone at the knight's next turn start; on himself) · Forge Weapon I-III (+N on
each cleave hit and the slash, gone after the knight's turn; forged after the knight's turn: his attack of opportunity on the
enemy turn is +N, still there on his round-2 turn, then gone; the AI's estimate knows; the mage's spells count) · Spiked
Pauldrons I-III (the grunt takes N back, Thorny through the knight's next turn) · Temper I-III (every debuff gone, buffs stay,
III heals 5, cooldowns, the knight's stun lifted in time) · Hammer of Faith I-III (pit YEET + env Hype, lava, water → Wet puts
out Burn, wall / edge bumps, immovable, lethal hit no push) · Molten Spray I-III (cone of 4, foes only, ally spared, multi-hit
Hype, the oil goes up along the slick, Wet foe no Burn, map edge, empty cone) · Anvil Drop I-III (range 4, the stunned grunt
loses its turn next to the knight, Stun gone after, line of sight, interrupts a boss wind-up with `windup:cancel`, stun-immune) ·
Hair Flip I-III (radius, exactly one foe turn, friends spared, Dazzled foes make no attacks of opportunity: he and the knight walk
off free) · Divine Forge (Hype, every ally anywhere, his own whack +3 at once, the mage's Block gone on its turn but the bonus
not, expiries per own turn) · items (Apron, Conditioner, Brightforge's free edge with its cooldown kept, +10% on his attack of
opportunity) · previews == reality for every skill at every level (pits, lava, walls, oil, lethal, Block predicted) · attacks of
opportunity (his swing, once per round, new round, kill Hype, walking away provokes with the HUD numbers and no undo, pushes /
teleports / Blink never provoke, stunned / asleep / sheep / downed Valdris doesn't swing, Thorns + the swing as it leaves) · v2
edge cases (stunned by an enemy turn, silenced (only Anvil Drop), sheep, charmed (−1 AP, no damage to the charmer, the forge
still works), not enough AP, not his turn, a foe dying mid-cone, the last foes dying ends the fight, an edge on a downed ally,
initiative 0, level-5 HP) · combos (the fixture mage's Oil Slick + Molten Spray → the whole slick burns → his hammer +3;
Flame-Forged Edge + the knight's cleave; Forge Weapon × three cleave hits; Hammer of Faith into water → the mage's Chain Zap on a
Wet foe; Anvil Drop's Stun → the knight disengages for free) · **review (v2)** (his Burn ticks 2, not 5; his Thorns at a Burning
attacker 3, not 6; a delayed hit lights the foe and spends the edge at once; six rounds of self-Pauldrons never exceed one coat;
the apron never halves his own fire; Forge Weapon and Divine Forge reach a summon, whose bite is then +3; the signature text
gives the Block no "until the end"; with real heroes loaded: Pebbles' Spicy Nibble → his whack 8, Flame-Forged Edge on
Zarathor's Fireball lights every foe in it → his whack 8, the edge on Kiri waits for Arrow from Beyond and lights its target when
it lands) · AutoPlay: 12 fixture fights (acts 1-3, normal / elite / boss) with party Valdris + test knight / cleric / mage at
levels 1 / 3 / 5 (five loadouts), plus deterministic turns: Divine Forge with 100 Hype and the party engaged, Hammer of Faith into
a pit, Molten Spray on a crowd, Hair Flip when surrounded.

Last runs (v2 review, 2026-11-04): `hero_valdris` 21/21 with full content and isolated; `content:` 8/8 isolated with his content.
AutoPlay fixture fights: 12/12 won; skill uses over the suite: Flame-Forged Edge 13, basic 13, Spiked Pauldrons 12, Forge Weapon
8, Forge Armour 6, Molten Spray 4, Anvil Drop 2, Temper / Hammer of Faith / Hair Flip / Divine Forge 1 each (all nine pool
skills used). Full `tools/test.sh`: see Review (v2).

## Public API (for tests / other content)

`DD.Valdris = { IRON, FORGED, EDGE, DENTED, DENT_RULE, DENTS, hammerGrip(g) → { x, y, r }, foesInReach(u) → [Units],
ensureDents() }` (read-only helpers; `BRIGHT_BURN` is gone with Brightforge's old rider; Nov 18: `DENTED` 'val_dented',
`DENT_RULE` 'val_dents', `DENTS` [4, 5, 6] = Forge Armor I-III's `dents`, `ensureDents()` adds the rule once per fight).

## Deviations

- **Passive**: DESIGN's brief suggested *Master Smith* (a combat-start blade for one ally, or "+1 armor with every forge buff").
  The first is a starting freebie (the user asked for the starting shield to go; a starting blade is the same idea for damage)
  and the second is a hidden rider on every skill. *Strike While the Iron's Hot* is one rule, a smithing pun, changes how he is
  played (light them, then hammer) and is the Burn payoff DESIGN's Pebbles brief names ("Burning foes for Valdris' and Zarathor's
  payoffs"); the forging itself lives in his skills (two of the nine forge weapons, two forge armour).
- **Reinforce (+2 armor)** → **Spiked Pauldrons (Thorns)**: a temporary armor stat would have to patch `unit.armor` (cleanses and
  removals have no hook to undo it) or be a hook the AI's and AutoPlay's estimates can't read; Thorns is a core status every
  system already understands and gives the armour side a second, different verb (Block soaks, Thorns punishes).
- **Divine Forge** is +3 with every hit + 8 Block for everyone (DESIGN: "big damage bonus and fire on hit, plus Block"): the fire
  rider was dropped to keep the signature at one effect + one rider (Simplicity); Flame-Forged Edge is the fire weapon.
- **Masterwork (Empowered)** was considered and cut to keep the pool at 9 sharp skills (three weapon buffs read as fiddly; Ellaria's
  Good Boy already Empowers).
- **Molten Spray is aimed at a tile** (straight, 1-2 tiles away; the cone always starts at him, so both tiles of a row give the
  same cone) rather than a `'dir'` target. Same cone, a bigger click target — and the passive-table suite's "Pyromaniac on
  <hero>: a fire skill of the real kit was tested" check aims fire skills at a foe 2 tiles away (`kitArena` / `useOn`), which a
  `'dir'` cone can't be (it failed for Valdris with `'dir'`; it passes now: "Molten Spray deals +3 (4 → 7)").
- **Brightforge** (v2 review): "+10% damage. Flame-Forged Edge costs 0 AP." instead of "+10% damage; foes hit by his attacks of
  opportunity are set Burning 3" (see Review (v2) for why).

## Requests

None blocking. Suggestions for other areas:
- **ENGINE / RULES (FYI, low priority)**: `Grid.shape('cone')` ignores walls (lines stop at them), so every cone — Molten Spray,
  Slate's, Sparrow's, Syllamin's, the act 2/3 breaths, the beholder's — reaches foes standing behind a wall tile in front of the
  caster (probed: Valdris sprays at a wall next to him and both grunts behind it take 4). Honest (the area preview shows those
  tiles), just odd for molten metal and dragon breath; a cone that drops tiles behind walls would be one engine change for all.
- **HERO PEBBLES / HERO ZARATHOR (FYI)**: Valdris's passive pays off on *any* Burning foe (+3 on each of his hits), so every Burn you
  apply is a set-up for him; his Flame-Forged Edge on you makes your next damaging skill Burn each foe it hits (3 / 4 / 5). Both
  are now tested with your real skills (Spicy Nibble, Gold-Plated Fireball) when your files are loaded.
- **HERO KIRI (FYI)**: Flame-Forged Edge waits through Arrow from Beyond's cast and lights the target when the arrow lands (tested
  with your real skill); Haunted Volley lights every foe in it.
- **HERO JOSIAH / BUGA / ELLARIA (FYI)**: Molten Spray applies the fire element to every tile of its cone (`applyElement` with
  `noUnits`), so it lights oil, Plague Miasma, Crumb Trail and Brambles placed in front of him. Ellaria: Barkskin's Thorns and his
  Spiked Pauldrons stack on the same ally (Thorns `stack`), and Forge Weapon / Divine Forge work on corgis (tested with a fixture
  summon).
- **AUTOPLAY (optional)**: buffs that pay out on the ally's next turn (Freshly Forged, Flame-Forged Edge) are valued through my
  `aiScore` (bonus × expected hits; Burn × 2 when the ally has fresh foes in reach); a generic "next-turn damage bonus" term in
  `statusGain` (e.g. read a status `telegraphFlat` on friends × their hits per turn) would make such content need no aiScore.
- **Lead / INTEGRATION** (`tests/content/integration.js`): "ten real heroes — expected 10" counts 16 now (Kiri, Betty, Basanos,
  Valdris, Hjalmar, Pebbles); the unlock-condition asserts there predate v2's `unlock: null` for everyone.
- ~~NARRATIVE: a Valdris hero event~~ — done by NARRATIVE (`ev_val_forge_god`, "The Forge God Would Like a Trim": his hair for a
  legendary, which is Brightforge).
- ~~PASSIVE TABLE: the Pyromaniac check failed for melee / `'dir'` fire kits~~ — passes for every hero in the v2 review's full run.

## Known issues

- In the fast fixture fights (2-9 rounds) Valdris often deals little damage himself (move 3; AutoPlay spends many of his turns
  forging for the knight and the mage): intended for a support, but his hammer shines mostly in longer fights and next to
  Burning foes. Real-content sims credit his forging to the forged (act-1 sim at the review: 10.6 damage a fight, the lowest of
  his party; Marbles' review sim: 19.4, the lowest of 16).
- AutoPlay's danger model reads Dazzled foes as fuzzy (×0.6), so Hair Flip is picked when two or three foes stand next to him
  (tested), rarely otherwise. AutoPlay never cast Divine Forge in the act-1 sim (0 of 39 fights; it held Hype or another hero
  acted first) although a deterministic turn shows it does with 100 Hype and the party engaged.
- Attacks of opportunity *by* heroes are rare in AutoPlay fights (the reach-aware AI won't walk off a melee hero; 0 by Valdris in
  12 real and 12 fixture fights): his hammer holds the line as a deterrent, which is the point.

## Review (v2)

Adversarial review of the v2 build (author's report: `.tmp/wf8/reports/build-hero-valdris.json`). No earlier review pass had
touched the files (their timestamps matched the author's last edit; the notes had no review section). Everything below was
verified by running code (a temporary probe suite in the test file, since removed; sandbox fights with fixture and real heroes;
two act-1 campaign sims; shots), not by reading alone.

**Verified, no change needed**
- desc == execute at every level for all 11 skills, the 2 statuses and 3 items (the preview suite runs all 46 skill × level
  cases against reality; numbers shown at every level; damage pipeline read: his +3 is a flat added after multipliers, so "+3"
  is exact with Brightforge's +10%, Inspired or high ground).
- v2 semantics: durations per own turn (Forge Weapon / Pauldrons / Hair Flip / Anvil Drop all "its next turn" exactly), Block
  until the owner's next turn start, cooldown 1 = every other turn (no self-Thorns snowball, probed over six rounds), no v1
  leftovers (no intents, Guard, XP, combat-start Block; `telegraphFlat` on Freshly Forged is the v2 reach number), `init: 0` set,
  `unlock: null`.
- Attacks of opportunity: his basic is his reaction (`opportunitySlot`), the passive and Freshly Forged reach the estimates via
  pure `modifyOpportunity` without double counting, a charmed Valdris never swings at his charmer but does at others, Dazzled /
  stunned foes give the party free exits (Hair Flip, Anvil Drop), Hammer of Faith's push never provokes. Melee hero holds the
  line; slow (move 3) but with three disengage tools.
- Edge cases probed: Temper lifts sheep (move restored) and charm; the forge can't target a charmed enemy; Molten Spray on an ally
  standing in oil ignites it under him (the desc says it ignites oil; direct damage still spares him); Flame-Forged Edge on Kiri's
  Haunted Volley lights each foe once, on Arrow from Beyond waits and lights the target when it lands, on Zarathor's Fireball
  lights both grunts; Divine Forge reaches corgis.
- Hero lens: every skill is one verb + at most one rider and reads in one breath (avg 16 words, the cast's norm; passive 11
  words, the shortest); 3+ clear cross-hero combos (Burn payoff for Zarathor / Pebbles / oil; Flame-Forged Edge and Forge Weapon on
  area attackers; Hammer of Faith into hazards and allies' traps; Anvil Drop vs wind-ups; Hair Flip as a party disengage); the
  passive is one rule and a smith pun that changes how he plays; the kit reads as the user's character (two starters are a
  weapon and an armour; the hair is a skill, an item and a running gag in the barks); he/him everywhere; distinct (the only forge
  buffer — Forge Armour + Spiked Pauldrons together resemble Ellaria's Barkskin, but each is a single bigger verb on his
  forging theme).
- Visuals: gallery (poses, facings, statuses, portraits), the swing sheet (no stock hammer leaking, red check) and two combat
  shots: long golden hair, stubble, apron, anvil charm, big hammer, ember glow; his bar reads cleanly in the HUD.
- Real-content sims (act 1, 8 runs, seeds 300-307, party Valdris / Marwyn / Zarathor / Kiri): 7/8 cleared (bosses 7/8), 0 errors,
  0 warnings; he forges every other turn (edge 2.6, Forge Weapon 2.4, Forge Armour 2.2 a fight) and was downed 0.13 times a
  fight. Same seeds with Ellaria in his slot: 6/8 cleared (bosses 6/8), but normal fights cost 5% HP instead of 12% and end in
  4.1 rounds instead of 4.7 — her healing (9.9 a fight) beats his prevention in short fights, while his party cleared one more
  run. n = 8 each and the routes diverge: within noise, no retune from this.

**Fixed**
1. **Brightforge was dead text** (most severe: his own hero event's legendary). Its only rider fired on Valdris's attacks of
   opportunity, which the reach-aware AI almost never allows (probed: 0 AoOs by Valdris in 12 real fights across acts 1-3 and 12
   fixture fights; 3 AoOs by anyone in the real ones, all enemies on heroes), and the AI's `aooCost` doesn't read
   `onOpportunityAttack` effects, so it didn't even deter. Sacrificing his hair in `ev_val_forge_god` bought "+10% damage".
   Now: "+10% damage. Flame-Forged Edge costs 0 AP." — one rule (`modifyCost`, like Kiri's cloak), on his forging theme, feeds
   the combo engine (an extra edge every other turn), no snowball. (Rejected: "his basic sets foes Burning 1" — Pebbles' Spicy
   Nibble already is that, and three whacks a turn grow a boss's Burn by 2 a round.) Items test rewritten (free edge, cooldown
   kept, other skills still cost AP, +10% on his attack of opportunity).
2. **Divine Forge's text implied the Block lasts until the end of the next turn** ("gain 8 Block and deal +3 … until the end of
   their next turn"); Block ends at the start of its owner's next turn (the signature suite already showed the mage's Block gone
   at its own turn start). Reordered: "Valdris and every ally deal +3 damage with every hit until the end of their next turn, and
   gain 8 Block." (same 21 words; tested that no "until the end" follows the Block).
3. **Tests that claimed more than they checked**: the passive suite's "Burn ticks are never boosted" had no assertion, the AoO
   suite's "Thorns *and* the swing as it leaves" only checked the Thorns, and the edge's "spent at once outside a skill" path was
   untested. New suite `hero_valdris: review (v2) …` (18 assertions with real heroes, 13 isolated) covers them plus the self-
   Pauldrons cap, the apron vs his own fire, summons (Forge Weapon target, Divine Forge Block + bonus, the hound's bite +3) and
   guarded real-hero combos (Pebbles, Zarathor, Kiri: skipped with a log line when their files aren't loaded or their skill no
   longer does what the check needs). The AoO suite now also checks the swing as it leaves. `arena()` takes `summons`.
4. A test message misgendered the bearded fixture gnome mage ("her turn" → "its turn").
5. Notes: Brightforge, the signature text, the review suite, stale Requests (the Valdris event exists; the Pyromaniac check
   passes), a new ENGINE FYI (cones pass through walls), Known issues (AutoPlay never cast the signature in the sim; hero AoOs
   are rare).

**Left as is (judgement calls)**
- Molten Spray reaches behind a wall tile because every cone does (engine shape; Request filed). A custom area just for him
  would make his cone behave unlike the cast's other cones.
- Spiked Pauldrons' desc (20 words) keeps its "adjacent attackers that hurt it take N" gloss: exact, and within the cast's range.
- Flame-Forged Edge waits through skills that hit no foe (a whiff, a buff, friendly fire): player-friendly and consistent with
  "sets each foe it hits".
- Balance: his own damage is low by design (support); the act-1 sim party cleared 88% (boss 7/8) — at or above the user's
  60-70% first-boss target for a well-played party, a matter for the boss / balance owners rather than one support's numbers.

**Runs at the end of the review**: `hero_valdris` 21/21 (1031 assertions isolated; the real-hero checks add 5 more with full
content); `hero_valdris` + `content:` on full content 29/29. Full `bash tools/test.sh`: 794 suites, 3 failing sections, none
his — `bosses_act1: rat king swelling ranks…` (mid-flight boss work) and two `integration:` sections (v1 unlock asserts, "ten
real heroes" = 16, an "XP" wording check); `tests/balance_tests.js` is listed but missing (not his). No swallowed or uncaught
errors. (Baseline before the review: 790 suites, 7 failing sections, the same owners.)

## Requests (Nov 3) — flyers ignore the floor, barrels, heals that revive (CONTENT SWEEP heroes-2)

- **Heals**: Temper III (heals 5) is a single-target heal, so aimed at a downed ally it gets it back up with 5 HP, then
  sheds its debuffs. It is a utility skill tagged `cleanse`, so it opts in with `target.revive: true`; a `canTarget`
  keeps Temper I-II (no heal) off the downed ("Only Temper III mends. Help them up first."). On a standing ally nothing
  changes (cleanse, then heal 5). The desc is unchanged: like every heal, the HUD preview says "UP! 5 HP".
- **Barrels**: Percussive Maintenance and Hammer of Faith can be aimed at a volatile object (the push is a rider:
  skipped). Anvil Drop is a spell, not an attack: not aimable (left as is). Molten Spray already ignites barrels.
- **Flyers**: he has no floor effects of his own (no forge zones exist); Molten Spray is aimed at its area, so it hits
  flyers there.
- **Tests**: `hero_valdris: v2 requests — …`: Temper I-II can't be aimed at a downed knight; Temper III can (`revive:
  true`, preview "UP! 5 HP", 5 HP, 1 AP), then on the standing knight it sheds Weak and heals 5; Percussive Maintenance
  and Hammer of Faith at a barrel (preview = reality, no push, AP paid).
- **Requests**: none.

## Playtest fixes (Nov 12)

- **text-tone-25 (polish, fixed)**: the skill is named "Forge Armor" (US spelling, like the Armor stat and slot it sits
  next to; it grants Block). The id stays `val_forge_armour`; the barks and blurb keep his British voice. DESIGN's
  mentions are the docs owner's (deferred).
- **heroes-v1 (fixed)**: the target-range numbers in his descs follow his real reach (range items, Dazzle) through `reach()` → `DD.Targeting.reach`; details and the cross-hero suite in hero-kiri.md.

## Review (finish, Nov 14) — REVIEWER

- D1: Anvil Drop now breaks a crate for exactly its 🔨 number and stuns nothing (a spell: "Valdris turns Anvil Drop on the Crate…"); his Forge Armour on Slate gives Block and, as Short Fuse now says, no Rage.

## Conditional healing (Nov 18) — "Hammer Out the Dents" (build:g2, plan §4.7)

The user (Nov 18): "I want everyoe else brought up but by conditional healing". Valdris is the third healer of others
(skill-rider on his starting **Forge Armor**), so his lift heals mostly allies. Ellaria untouched.

**What.** When Block soaks a foe's hit on a unit of his side, that unit is **Dented**; his next Forge Armor on it hammers
the dents out: Block as before, then the status goes and it heals **4 / 5 / 6** (Forge Armor I / II / III, level key
`dents`, `DD.Valdris.DENTS`).
- **The rule** `val_dents` ("Dents", 🔨, `silent: true`, `turns: -1`): added once per fight by his passive's new
  `onCombatStart` through `ensureDents()` (the `ensureContagion` pattern). Silent = no "New rule" log line; the HUD chip stays,
  with the plan's desc: "Valdris is here: when Block soaks a foe's hit on his side, the one it hit is Dented; his next Forge
  Armor on it hammers the dents out and heals it." Its `onTakeDamage(d)` (rule hooks fire for every unit) dents the target when
  `d.blocked > 0`, the target is active **with `hp > 0`** (the hook runs before the down / death check), `d.source` is hostile
  to it **or null** (a friendly bump or splash never dents), some non-dead Valdris is not hostile to it (himself and summons
  included), and it is not Dented already. `addStatus(target, 'val_dented', {}, null)`: source null, so no Rage for Slate.
- **The status** `val_dented` "Dented": icon 🔨, type `'buff'` (debuff cleanses leave it), `refresh`, max 1, decay `'never'`,
  `defaultTurns: -1`; desc (a function, like every status desc: the content registry suite calls `desc(st)`) "Its Block
  soaked a hit. Valdris's next Forge Armor on it hammers the dents out and heals it."
- **Forge Armor** (`val_forge_armour`): levels `{ block: 6, dents: 4 }`, `{ 8, 5 }`, `{ 10, 6 }`; `kind 'buff'`, tags unchanged
  (no `'heal'`), `target.revive: false` (never an aimed revive). Execute: Block; if the target is Dented, remove it (silent),
  then, both units active, `DD.Act.heal(Valdris, target, L.dents, { via: 'lift:valdris' })`, always called on a Dented target
  (0 at full HP); the FX text and the `dents` bark (0.35) only when it healed. Desc (I): "Valdris or an ally within 3 gains 6
  Block (until the start of its next turn). If it is Dented (its Block soaked a hit), he hammers the dents out: it heals 4 HP."
  (II 8 / 5, III 10 / 6; the range from `reach()`; "Armor", never "Armour".)
- **Barks** (new key `dents`, exactly the plan's three): "Hold still. This'll only sting a lot." / "Good as new. Better,
  actually: I used conditioner." / "Every dent tells a story. This one says 'ow'."
- **AutoPlay.** The exact pass dry-runs the heal (it is in the execute; the rule dents inside dry runs too). New Forge Armor
  `aiScore`, quick pass only (0 when `ctx.autoplay`): `healWorth(target, L.dents)` on a Dented target (`DD.AutoPlay.healWorth`,
  E2, with a local fallback of the same formula). It only adds to the utility quick estimate (`utilQuick`), which picks the
  targets the exact pass dry-runs; Forge Armor puts no outgoing-damage status, so `ctx.ownValue` changes nothing else.
- **Code:** `js/data/heroes/valdris.js`: the `DENTED` / `DENT_RULE` / `DENTS` constants, the status + `smithFor` +
  `DENT_HOOKS` + `ensureDents` after the forge statuses, Forge Armor, the passive's `onCombatStart`, `barks.dents`, the
  `DD.Valdris` exports.

**Tests** (`tests/content/hero_valdris.js`, new suite "hero_valdris: conditional heal (Nov 18)", 67 assertions isolated, 69
with `isolate=valdris,slate`): exports; the desc word for word at I-III (numbers from `L`), no `heal` key, kind / tags /
`target.revive: false`, `revivesWith` false; the status fields and desc; the three barks; the rule in once (a second
`onCombatStart` / `ensureDents()` adds nothing), silent (no "New rule" line), the chip's name / icon / desc, no rule without
Valdris; dents: a foe's hit soaked by Block → Dented; no Block → not; an ally's bump into a Blocking ally → not; a sourceless
soaked hit → Dented; a foe's Block soaking a hero's hit → never; a soaked hit that downs the target → not; Valdris himself →
Dented; a debuff cleanse and a round end leave it; the heal at I-III (+4 / +5 / +6 on a hurt knight, Block as before, status
gone, his heals stat grows by it, `previewThenUse` exact with `+N` on the knight, the call is
`heal(Valdris, target, N, { via: 'lift:valdris' })`); not Dented → Block only, no lift call; Dented at full HP → status gone,
the call made, 0 healed; on himself (II: +5, 8 Block); a downed Dented ally is no target and stays down; Slate (with
`isolate=valdris,slate`; slate.js read only): the grunt's hit gives 1 Rage and Dented none, Valdris' heal +4 HP and +1 Rage
(Short Fuse: another src; the Block none); `aiScore` 0 / `healWorth(target, 6)` / 0 in the exact pass / 0 at full HP;
AutoPlay forges the Dented one of two mirror-image hurt knights, on either side (+4).
**Updated assertion** (registry suite): Forge Armor's desc is checked as one breath of Block (≤ 24 words, no "if") plus
exactly the Dented rider (≤ 34 words, one "If" in all), the other skills as before; `dents` joins the shown-number keys; the
pronoun sweep reads the Dented desc and the `dents` barks.

**Sanity sims** (`bash tools/sim.sh "debug=1&raw=1&seeds=30&from=…&stop=2&party=…"`, `== conditional heals`, normal,
acts 1-2):

| party (from) | fights | fires / fight | HP / fight (self · others) | fires by kind |
|---|---|---|---|---|
| valdris, corelos, hjalmar, zarathor (50100) | 232 | 0.56 | 2.2 (1.0 · 1.2 = 55%) | regular 0.51 · elite 0.54 · boss 0.73 |
| valdris, betty, basanos, marbles (50500) | 192 | 0.74 | 3.0 (1.1 · 1.9 = 63%) | regular 0.72 · elite 0.70 · boss 0.86 |
| pooled | 424 | 0.64 | 2.6 (others 59%) | |

T8 for `lift:valdris`: min 0.8 fires, band 2.5-10 HP, to others ≥ 60%. **Short of the minimum** (0.64 pooled, about 80% of it;
the HP at the band's floor; to others 55-63%), not "far under". A scratch probe (`.tmp/g2/probe.js` on a copy of the sim page,
run by `.tmp/g2/simx.sh`; 30 seeds, the first party): of his 1,132 turns, 268 started with Forge Armor ready and a hurt Dented
unit on his side; he forged the Dented one in 125 (47%), another unit in 41, and spent his AP elsewhere in 102 (the exact pass
prices 4 HP at 0.8-1.5 per HP, below a basic attack's 5 damage or Flame-Forged Edge); 114 of 232 fights ended with a hero
still Dented. So the quick-pass term does its job (it picks the Dented target 3 to 1); what is left is the exact pass's price
of a small heal against damage. I kept the plan's term as written (an exact-pass top-up would count the heal twice). The
plan's lever (§7 T6 / T8) is `dents` 4 → 5 → … inside [4, 7]: a bigger heal wins more of those 102 turns and raises HP per
fire. Boss fights already fire more (0.73-0.86). 0 errors, 0 DD.warn lines on both pages.

**Full run** (`bash tools/test.sh`, Nov 18, after the G2 build): 1310 suites PASS, 0 failures, 0 swallowed "Error in" lines.

### DESIGN §6 brief (Nov 18)

For the engine builder (phase 2). Anchor in `### Valdris the Well-Conditioned — Human Forge Cleric (he/him)` (unique,
DESIGN.md line ~653, the end of the "Basic" bullet), this whole line:

```
  skill sets each foe it hits Burning) and *Forge Armor* (Block for him or an ally).
```

Replace it with these two lines (keeps "*Forge Armor*", never "Forge Armour"):

```
  skill sets each foe it hits Burning) and *Forge Armor* (Block for him or an ally; if its Block soaked a foe's hit,
  it is Dented, and he hammers the dents out: it heals 7–9 HP, by level).
```

### Deviations (Nov 18)

- None from the plan's mechanics, numbers or texts. Two notes: the rule skips a unit that is already Dented (re-adding a
  `refresh` / max-1 / never-decaying status changes nothing but would float "+Dented" again on every soaked hit); and the
  registry suite's "no if" rule now exempts exactly Forge Armor's Dented rider (plan §2.10: Forge Armor keeps one rider),
  with the exact rider text asserted in its place.

### Requests (Nov 18)

- **Lead / balance pass (FYI)**: `lift:valdris` measured 0.64 fires and 2.6 HP a fight (pooled, acts 1-2) against T8's
  0.8 / 2.5-10; the probe says the gap is the exact pass preferring damage to a 4-HP heal, which the plan's own lever (`dents`
  inside [4, 7]) addresses. T6 (Valdris to others ≥ 1.25× every non-healer) will want the same lever.

### Review (Nov 18) — review:g2

Adversarial review of "Hammer Out the Dents" against plan §4.7 (code path read end to end, suites run, a sim, a shot).
- **Holds:** the rule is added once by the passive's `onCombatStart`, silent (no "New rule" line) and shows as the 🔨 Dents
  chip with the plan's desc (shot `debug=1&screen=combat&party=valdris,kiri,betty,buga&act=1&kind=normal&seed=3`); it
  dents only on `d.blocked > 0`, `hp > 0`, a hostile or null source and a non-hostile Valdris (the single `onTakeDamage`
  site in actions.js fires rules); Forge Armor heals `dents` 4/5/6 only on a Dented target, removes the status even at full
  HP, `target.revive: false`, both units checked `active` before `DD.Act.heal`; desc == execute at I-III; no heal at combat
  start (Block is cleared at fight start), no HP threshold, no self-feeding loop (the heal makes no Block soak). Svammiel's
  floor halves it (an ordinary `modifyHeal`); the Radio Edit never picks Forge Armor (no `dmg`). Adding an `aiScore` sets
  AutoPlay's `ctx.ownValue`, which only touches `modifyOutgoingDamage` statuses: Forge Armor puts none, so nothing else
  changes. The Rules Lawyer's OVERRULED! counts Dented as a buff (+4 in its target pick) and strips it: intended (a buff).
- **Mutations** (reasoned against the suite): DENTS changed, the Dented gate dropped, the `hp > 0` or hostile-source check
  dropped, the `active` check dropped: each fails an assertion.
- **Sim** (`tools/sim.sh "debug=1&raw=1&seeds=30&from=55000&stop=2&party=valdris,slate,syllamin,pebbles"`, normal,
  acts 1-2): 223 fights, **0.56 fires / 2.3 HP a fight** (self 1.0, others 1.3 = 57%; regular 0.53 / 2.1, elite 0.64 / 2.3,
  boss 0.64 / 2.8); 0 errors, 0 DD.warn lines, 0 stalls. Confirms the builder's T8 shortfall (min 0.8, band 2.5-10, others
  ≥ 60%): the exact pass prices a 4-HP heal on a less-than-half-hurt ally at 3.2 (0.8 a HP) against a 5-damage hit, and
  Dented never decays, so deferring is not a loss to it. The quick-pass term does change which ally gets forged. Left to the
  plan's lever (`dents` inside [4, 7], balance pass); no AutoPlay change (an exact-pass top-up would count the heal twice).
- **Fixes:** none needed in valdris.js / hero_valdris.js.

### Balance pass (Nov 18) — heal:balance: `DENTS` 4/5/6 → 7/8/9 (T6 first, T8)
The conditional-healing balance pass (`docs/notes/balance.md` "Conditional healing pass (Nov 18)") measured him at the
plan's numbers on 600 fresh campaign runs (seeds 30000-30599, normal): `lift:valdris` **0.72 fires, 3.0 HP a fight, 53% of
it to others** (T8: min 0.8 fires, band 2.5-10, others ≥ 60%), and healing done to other heroes **1.9 HP a fight against
Sparrow's 3.2** (T6: Valdris ≥ 1.25× every non-healer). The plan's rule (§7 T6): "If Valdris misses, raise `dents` inside
its range before anything else": one step a iteration, `dents` I 4 → 5 (iteration 1: 2.4 to others against Sparrow's
2.5) → 6 (iteration 2: 2.5 against 2.8) → 7 (iteration 3, the top of [4, 7]; II / III = I + 1 / + 2). Only the constant
moved (`DENTS = [7, 8, 9]`; the levels, the desc and the aiScore read it); the suite's pin and its literal checks read
the constant now; DESIGN §6, v2-digest §2 and the brief above say 7–9 / 7/8/9. Forge Armor's Block (6/8/10) is
unchanged. What the top step measured, and whether T6 holds there, is in the balance notes.
At the top step (iterations 3-6, 2,400 campaign runs, his numbers unchanged across them) `lift:valdris` read **0.75-0.84
fires and 5.2-5.8 HP a fight** (pooled 0.81 and 5.55; the fires minimum met in three of the four 600-run iterations;
53-59% of it to others, pooled 55%, against T8's 60%), and healing done to other heroes **3.45 HP a fight against
Sparrow's 2.85 = 1.21×** (pooled iterations 3-6; T6 asks 1.25×; iteration 4 alone 1.36×, iteration 5 alone 1.13×).
T6 is short by a hair with `dents` at its limit: reported to the lead (the remaining lever would be a number outside
the plan's range; Sparrow's share is never cut).

### QA fixes (Nov 18, qa-fix:heal)
- **[heal QA-1] the log says why it healed.** Forge Armor on a Dented target that heals (> 0) now logs, right after the
  engine's heal line ("Sir Testsalot heals 7 HP (Valdris)."): "Valdris hammers the dents out of <target>. Good as new.
  Better, even." ("himself" on himself). Test: "hero_valdris: conditional heal (Nov 18)" (ally and self; none at full HP).
  No number changed.
