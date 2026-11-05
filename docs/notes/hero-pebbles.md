# HERO — Pebbles, the Goodest Boy (notes)

Files: `js/data/heroes/pebbles.js`, `tests/content/hero_pebbles.js` (20 suites `hero_pebbles: …`, ~940 assertions), this
file. Run: `bash tools/test.sh "suite=hero_pebbles&isolate=heroes/pebbles,hero_pebbles"` and
`bash tools/test.sh "suite=content:&isolate=heroes/pebbles,hero_pebbles"`.
Looks: `bash tools/shot.sh "debug=1&fixtures=1&isolate=heroes/pebbles,hero_pebbles&screen=gallery&gallery=pebbles" .tmp/pebbles/g.png 1280x720 4000`,
in combat: `… &screen=combat&party=pebbles,test_knight,test_cleric,test_mage&encounter=test_a1_normal&seed=4&autoplay=1&fast=1`.

## Summary

Built from scratch, v2-native (initiative, one turn per unit, no telegraphs, no Guard, no combat-start Block, attacks of
opportunity). User brief: *"Pebbles (male) a dog made of fire. A good boy."* — he/him. DESIGN §6 "Pebbles" +
"Simplicity": one verb per skill, power from combinations. A living bonfire shaped like a very happy dog: wags his tail
and the carpet catches fire, loves everyone (goblins included, until they hurt his friends). Role: **melee skirmisher &
fire control**. Complexity 2, `unlock: null`, 26 HP (+4/level), 3 AP, move 5, **initiative +3**, colour `#ff9d2e`.

**Fireproof (data on the def)**: `resist: { fire: 0 }` (fire damage — skills, lava, fire explosions, Burn ticks — is
nullified, "Immune!") and `flags: { immune: ['burn'] }` (Burn never sticks: fire surfaces, lava, oil fires). Both are read
by `Act.baseUnit` / `Act.damage` / `Act.addStatus` like on enemies, and `DD.AI.estimate` reads the resist, so enemies
don't waste fire on him — unless Bork! makes them.

**Passive — Hot Dog** (one rule, the comedic core): *fire can't hurt Pebbles, and ending his turn on fire or lava heals him
3 HP* (`onTurnEnd`: a fire surface or lava terrain under him → `heal 3`, "🔥 Cozy!"; 5 with the Fireproof Dog Bed). It
changes how he plays: he wants to finish his turns in fire — his own trails and This Is Fine, Zarathor's strut lane, a
burning oil slick, act-3 lava — where enemies won't follow.

**Kit** (ids `peb_*`; ⭐ starting; numbers I / II / III):

| Skill | id | Cost | Effect (one verb + at most one rider) | Pairs with |
|---|---|---|---|---|
| Spicy Nibble (basic) | `peb_basic` | 1 AP | 4 damage to an adjacent foe and Burn 1 (melee: also his attack of opportunity) | Bark-B-Q, Zarathor's Burn payoff |
| Hot Zoomies ⭐ | `peb_zoomies` | 1 AP, cd 2 | dash up to 4 / 5 / 6 tiles (any route), leaving fire (2 / 2 / 3 rounds) on every tile he leaves | oil (the slick goes up), Fetch / pushes into the trail; escaping melee (a dash never provokes) |
| Fetch Quest ⭐ | `peb_fetch` | 1 AP, cd 2 | 3 / 4 / 5 fire damage to a foe 2-4 / 2-4 / 2-5 tiles away and pull it 2 / 2 / 3 toward him | pull archers into the knight / Marwyn / Betty, through fire / lava, into pits (YEET) |
| Chew Toy | `peb_chew_toy` | 2 AP, cd 1 | 7 / 9 / 11 damage to an adjacent foe and Root it for its next turn ("he won't let go") | Rooted-foe payoffs (Betty's Kick 'Em…), keep a foe in fire |
| Big Wag | `peb_wag` | 2 AP, cd 2 | 4 / 5 / 6 fire damage to every adjacent foe, push each 1 / 1 / 2 away | pits, lava, water, walls, allies' traps |
| Bork! | `peb_bork` | 1 AP, cd 3 / 3 / 2 | every foe within 2 / 3 / 3 is Taunted: on its next turn it must attack Pebbles | fire-breathing foes (they can't hurt him), protecting squishies |
| Emotional Support Dog | `peb_support` | 1 AP, cd 2 | an adjacent ally heals 4 / 6 / 8 and is Inspired until the end of its next turn | the party's big hitters right before their turn |
| This Is Fine | `peb_this_is_fine` | 1 AP, cd 3 | his tile and every tile within 1 / 1 / 2 catch fire for 2 / 3 / 3 rounds, except under allies | Hot Dog's heal, oil, Josiah's miasma, Ellaria's brambles, explosive barrels (he is fine) |
| Bark-B-Q | `peb_bbq` | 2 AP, cd 3 | 6 / 8 / 10 fire damage to every Burning foe within 3 | everybody's Burn: his nibbles, fire surfaces, oil, Zarathor, Valdris |
| Puppy Eyes | `peb_puppy_eyes` | 2 AP, cd 4 / 4 / 3 | Charm a foe within 3 / 4 / 4 (not a boss): on its next turn it fights for your side | a brute next to its friends |
| Hot Diggity Dog! (signature) | `peb_signature` | 2 AP, 100 Hype | 16 damage to every foe within 2; Pebbles and every ally Inspired until the end of their next turn | the whole party's next round |

Pool = 9 (+ basic + signature): AP 1 / 2, long cooldowns on Bork!, This Is Fine, Bark-B-Q and Puppy Eyes. Nothing is a
`spell` (a dog doesn't cast: Silence never stops him). Every desc is ≤ 18 words (the signature ≤ 22) with no conditions (tested); the only
"rule text" outside the descs is the passive and the fireproof data.

**Combos (setups → payoffs, each pinned by a test)**
1. *Oil + his fire*: Hot Zoomies leaving (or This Is Fine reaching) one oil tile ignites the whole slick (`igniteChain`),
   every unit on it Burns 2 → Bark-B-Q for 6 each in the same turn (1 + 2 AP).
2. *Fire trail → displacement*: Hot Zoomies back toward the party, then Fetch Quest drags a foe into the trail (Burn 2);
   Big Wag / allies' pushes do the same. Fire is a hazard to the AI, so trails also fence enemies off.
3. *Fetch Quest into the party*: an archer pulled off the back line lands next to the knight, who slashes it (3 + 5);
   pulls never provoke attacks of opportunity (no free swing for the knight either).
4. *Fire on top of him*: the party's fire AoEs (the mage's Fire Fixture, Zarathor's Fireball, barrels) can be dropped on
   Pebbles' tile — he takes 0, the foes around him burn.
5. *Bork! vs fire-breathers*: a taunted fire enemy wastes its turn on him (the test bomber's Self-Destruct: 0 damage).
   *Frost + fire*: ice frozen over deep water (a Frost Flask, frost skills) melts back under his fire — a foe standing on
   it sinks (his environmental kill: his fire is lit `withCredit` him). He never melts the ice under his own feet.
6. *Emotional Support Dog → big hitter*: Inspired (+25%) on the ally acting next (the knight's 5 → 6).
7. *Burn for others*: every bite (and every attack of opportunity) adds Burn 1 — Zarathor's Eldritch Bling +2 vs Burning
   foes, Valdris' Burn payoffs. Anti-synergy (DESIGN): Wet foes can't Burn (Ellaria's water, rain, puddles).

**Attacks of opportunity** (DESIGN §4.2, rules.md "v2 — attacks of opportunity"): his basic is melee, so he holds the
line a little — a foe walking off him takes Spicy Nibble *and* Burn 1 (bark key `opportunity`, cosmetic, guarded by
`ctx.opportunity`). He walks off melee foes like anybody (it provokes); his outs, one verb each: **Hot Zoomies** (a dash:
never provokes, ignores mud, passes allies), **Fetch Quest** / **Big Wag** (move the foe instead: pushes and pulls never
provoke). Stunned / asleep / sheep Pebbles makes none (tested). A grunt next to him keeps biting him instead of walking
to the wounded mage (tested with the AI on).

**Items** (all `hero: 'pebbles'`, no `stats.block`): `peb_extinguisher` Chewed-Up Fire Extinguisher (rare weapon: +10%
damage, Spicy Nibble Burns 2 — the desc of the basic shows it with the item), `peb_dog_bed` Fireproof Dog Bed (rare
armor: +6 max HP, +1 armor, Hot Dog heals 5), `peb_collar` Collar of the Eternal Flame (legendary trinket: +4 max HP;
once per fight, when he would go down, he flares back up at 8 HP — `preventDeath`, `unit.data.pebRekindled`).

**Sprite**: `quadruped` (long legs, long snout, long body, head 1.12), orange body / yellow belly-muzzle palette with a
dark ember outline, big happy eyes, smile, soft `glow` aura (the core `flames` aura's foreground flames hid his legs, so
the flames are drawn by the overlay instead). `overlay`: glowing cores down the legs (the painter's long legs are mostly
outline), an ember core with pulsing cracks in the chest, a big wagging flame tail, a flame mane along the back, two
tall flame ears perked up, little flames licking up from the paws, a pink tongue out, the blue collar redrawn over the
neck (the painter's sits under the head) with a gold "P" tag, rising sparks; lying down he only smoulders. `underlay`:
a warm pool of firelight. `portrait` framing on his face. Checked in the gallery (every pose, both facings, statuses,
portraits 128 / 64 / 40, zoom 1) and in combat (HUD portraits, tracker, board).

**Barks**: 13 keys × 5-6 lines + `opportunity` (4), ≤ 70 characters, joyful dog voice ("ZOOMIES!", "SQUIRREL!", "BORK
BORK! That means hello. And also you're toast."), naming Slate, Valdris, Hjalmar, Kiri, Zarathor, Josiah and Ellaria with
the right pronouns (tested: she/her only next to Ellaria / Sparrow / Kiri; nothing about him says she/her).

## Tests (`tests/content/hero_pebbles.js`, 20 suites)

registry / identity / numbers / descs at every level (numbers shown, ≤ 18 words, signature ≤ 22, no conditions, no v1 words, levels
differ) / no name clashes with Ellaria / barks / pronouns · sprite + portrait (every pose and facing, walk + status
tints, warm pixels, no warnings) · **Hot Dog** (fire damage 0, Burn refused, plain and frost damage still hurt, a fire
explosion and the mage's Fire Fixture on his tile hurt only the grunts, lava walk-in, +3 at the end of a turn on lava /
in fire, again on a stunned turn, none out of fire, none while downed, `AI.estimate` 0) · Spicy Nibble (4 + Burn 1,
stacking, Burn tick at its turn end, Wet refuses Burn, kill Hype) · **attacks of opportunity** (walking off provokes
exactly one stab and the move preview knows it; Hot Zoomies off the same grunt: nothing; a grunt walking off him gets
nibbled + Burned, once per round; stunned / asleep / sheep make none; Fetch drags a foe off the knight without a swing;
the engaged grunt sticks to him) · Hot Zoomies I-III (distance, past an ally, fire on exactly the tiles left for exactly
L.turns rounds, cooldown 2 per own turn, walls make it longer, mud doesn't, foes block, pits, Rooted, Dazzled, oil
ignition Burns the grunt on the slick, water) · Fetch Quest I-III (range 2-N, LOS, pull distance, pit YEET + env Hype,
lava, fire, immovable, diagonal, a fire-immune foe still comes, lethal) · Chew Toy I-III (Rooted on exactly one of its turns with the AI on, lethal,
cooldown 1) · Big Wag I-III (each adjacent foe, push, ally spared, pit, lava, water, wall bump, map edge, immovable,
fire-immune foe still pushed, a kill mid-wag) · Bork! I-III (radius, exactly one taunted turn, it leaves the mage next
to it for Pebbles, the bomber blows itself up on him for 0) · Emotional Support Dog I-III (adjacent ally only, heal,
Inspired through the knight's turn: 5 → 6, gone after) · This Is Fine I-III (tiles, not under the knight, rounds, his
+3 at turn end, the grunt's Burn 1, oil slick, explosive barrel, water, frozen deep water: the grunt sinks (env Hype),
his own ice holds) · Bark-B-Q I-III (refused with nothing Burning, Burning foes within 3 only, Burn kept, nibble →
barbecue, fire-immune) · Puppy Eyes I-III (range, exactly one charmed
turn in which it stabs its friend, not twice, not bosses, not charm-immune) · combos (oil → Bark-B-Q, trail → Fetch,
fetch into the knight's slash, Fire Fixture on the dog) · signature (100 Hype, 16 within 2, ally spared, Pebbles + near +
far allies Inspired through their own next turn, not a charmed foe, a boss's armor) · items (extinguisher numbers and
desc, dog bed heal, collar once per fight, rolled initiative d20 + 3) · previews == reality for every skill at every
level (oil, lava, pits, barrels, Burning foes, lethal) · v2 edge cases (stunned by an enemy turn, silenced, sheep,
charmed: −1 AP and the wag spares the charmer, not enough AP, not his turn, Dazzled range, a final wag wins the fight, a
downed dog in fire) · AutoPlay: 12 fixture fights (acts 1-3, normal / elite / boss) with party Pebbles + test knight /
cleric / mage at levels 1 / 3 / 5 (two loadouts each), plus a signature turn, a pit wag and a barbecue turn.

Sim (`tools/sim.sh "seeds=24&from=900&party=pebbles,marwyn,ellaria,zarathor&stop=1"`, act 1 only, real content of
every area as of this pass; report in `.tmp/pebbles/sim/a1_pebbles.txt`): 24 / 24 act-1 clears, 122 fights, 0 errors,
0 warnings, 0 timeouts. Pebbles 27.3 damage per fight (Ellaria 33.5, Marwyn 13.8, Zarathor 54.9), 1.4 kills, 6.3 taken,
0.06 downs. Uses per socketed fight: Spicy Nibble 2.5, Emotional Support Dog 1.7, Fetch Quest 1.7, Puppy Eyes 0.8,
Bork! 0.6, Chew Toy 0.5, Hot Zoomies 0.3, Bark-B-Q 0.2, This Is Fine 0.1, Big Wag 0.1 — every pool skill used. (The one
"FRIENDLY:pebbles · fall" down in it is the Rat King's sluice: the hero who pulls the valve is credited with whoever the
flush drains — AutoPlay's puzzle play, not a Pebbles skill.)

## Public API (for tests / other content)

`DD.Pebbles = { FLAME, COZY_HEAL, COZY_HEAL_BED, REKINDLE_HP, zoomPath(u, to, len) → [{x,y}] | null, inFire(u),
cozyHeal(u), fineTiles(u, r), burningFoes(u, r) }`.

## Deviations

- The hero def carries `resist` and `flags.immune` (ARCHITECTURE §3.1 lists neither for heroes; §3.6 has them for
  enemies). `Act.baseUnit` copies both from any def and the damage / status / AI code reads them, so it needs no engine
  change; the content registry knows `immune` as a unit flag.
- Skill names avoid Ellaria's (her notes' request): Zoomies → **Hot Zoomies**, Fetch! → **Fetch Quest**, Good Boy! →
  **Emotional Support Dog**, signature WHO'S A GOOD BOY?! → **Hot Diggity Dog!** (tested: no shared names).
- DESIGN brief ideas not used: *Roll in the Embers* (a self-Empowered with no partner), *Sit. Stay.* (Root + Block)
  became **This Is Fine** — the sitting-dog meme, fire around him instead of Block (Block + taunt is Marwyn's / Basanos' /
  Betty's job, and his heal-in-fire passive makes the fire the defensive part). *Fire Bite* is split into the basic (bite
  + Burn) and Chew Toy (bite + Root). Added **Bark-B-Q** (the Burn payoff the brief's combos ask for) and **Puppy Eyes**
  (control; charm like Corelos' Sign Here and Buga's Bribe, bosses excluded the same way).
- Hot Zoomies counts tiles, not path cost ("zoomies ignore mud"), and never goes through foes; it is a dash (no attack of
  opportunity, blocked by Root). Fetch Quest has a minimum range of 2 (an adjacent foe can't be pulled closer).
- The signature's damage is untyped (fire FX) so the fire-immune devils of act 3 still feel it; Fetch Quest, Big Wag and
  Bark-B-Q are fire damage (resisted by them — a real counter, like Zarathor's fire; the pull and the push still work),
  his bites (Spicy Nibble, Chew Toy) are physical. Fetch Quest is fire so the Pyromaniac Blessing has a targeted fire
  skill to boost (the passive-table suite checks it: "Fetch Quest deals +3").
- This Is Fine skips his own tile when it is ice (fire can't lie on ice or water anyway; ice frozen over deep water would
  sink him). His fire is lit `withCredit` him, so foes it drowns / blows up count as his environmental kills.
- Bark-B-Q keeps its number in `L.dmg` (the per-target damage, the AI convention); in the generic content arena nothing
  Burns, so `content:` lists "peb_bbq L1-3: levels[].dmg but no damage dealt" in its advisory line (soft note, expected).

## Requests

None blocking.
- **RULES / AUTOPLAY (optional)**: `DD.Grid.hazardAt` is immunity-blind — fire surfaces and lava count as hazards for
  Pebbles (resist fire 0, immune to Burn), so his paths prefer to avoid them and AutoPlay never plans to end his turn in
  fire, although Hot Dog heals him there. A per-unit skip (a surface / terrain whose element the unit resists at 0 and
  whose status it is immune to) would let sims use the passive. Players can do it by hand today. **Player-facing part
  (review v2, probed)**: `DD.Combat.reachable(pebbles)` flags fire and lava tiles as `hazard: 'fire' / 'lava'`, so the
  HUD's move preview tells the player "⚠ The path crosses Fire — it will hurt." when he walks into the fire that heals
  him (`combat_hud.js` reads `e.hazard`). The same per-unit check in `hazardAt` fixes both (his content can't: the
  `hazard` flags live on the terrain / surface defs).
- **HUD (optional)**: the hero inspect panel could show resistances / immunities ("Fireproof") the way the enemy panel
  shows enemy resistances.
- **Lead (DESIGN §6 Pebbles)**: the brief can name the final kit (table above).
- **ZARATHOR / VALDRIS / JOSIAH / ELLARIA (FYI)**: Pebbles' Burn sources are every bite (Burn 1, attacks of opportunity
  included), his fire trails / This Is Fine (Burn 2 on entering, Burn 1 for ending a turn there) and oil he ignites;
  Bark-B-Q pays off anybody's Burn. He takes no damage from your fire, so aim it at him. Wet foes can't Burn.
- **PASSIVE TABLE (FYI, optional, `tests/content/passives.js`)**: "hero-only Blessings work with the real kits" tries
  Pyromaniac only with fire skills aimed at a foe 2 tiles away (no self-centred AoEs); Pebbles passes through Fetch Quest
  ("deals +3 (3 → 6)"). Accepting `target.type === 'self'` areas next to the foe (Big Wag) would also cover kits whose
  fire is all around the hero.

## Review (v2) — adversarial review (ADVERSARIAL REVIEWER role, 2026-11-04)

Verified by running code: the 20 suites, the generic `content:` suites isolated, scratch probes with all real content
loaded (`.tmp/pebrev2/q1-q3.js`), mutation runs (`.tmp/pebrev2/runmut.sh`), a real-content AutoPlay sim and screenshots.
An earlier review pass was cut off by the app hang; its code / test fix is kept (first item under Fixed).

**Verdict.** The kit reads instantly as the user's character ("a dog made of fire, a good boy"): zoomies, fetch, chew toy,
wag, bork, emotional support, puppy eyes, the "This is fine" meme, Bark-B-Q, Hot Diggity Dog!; he/him everywhere,
she/her only in the Kiri bark. Every skill is one verb + at most one rider (damage + Burn / pull / Root / push, a move +
a fire trail, a heal + Inspired, one status, one surface, one payoff); levels only raise numbers; descs are 10-18 words
(signature 22), no conditions. The passive is one rule and changes play (he wants to end turns in fire: This Is Fine L1
= +3 on each of 2 turns, foes standing in it Burn). Combos with other heroes are real and tested (oil, Burn for
Zarathor / Valdris and Bark-B-Q, pulls into the knight's reach, the party's fire dropped on his tile, Bork! into allies'
attacks of opportunity). No v1 leftovers (no intents / Guard / Block / XP; init +3; `unlock: null`). Distinct from the
other canine (Basanos: silver sword / werewolf; Ellaria's corgis) — no shared hero skill names (an act-3 enemy skill is
also called "Chew Toy"; harmless).

**Attacks of opportunity (probed with the real act-1 goblin grunt):** a grunt walking off him takes Spicy Nibble 3
(armor) + Burn 1 (Burn 2 with the Extinguisher), once per round, `opportunity` bark key reaches `maybeBark`; he walking
off a foe provokes (move preview lists it); Hot Zoomies off a foe, or between two grunts, provokes nothing; pulls never
give the knight a swing; stunned / asleep / sheep he makes none; a Rooted foe (Chew Toy) can't walk past him at all.
Melee hero who holds the line + a real disengage (the dash) — both halves of the new rule work for him.

**Fixed**
1. *(earlier, interrupted review pass — kept)* Hot Zoomies took the first shortest route, straight through a poison
   puddle / spikes / a live current with a clean route right next to it. Now the route with the fewest tiles that would
   hurt him, then the shortest (fire and lava don't count: he is fireproof); with no way round he still goes through.
   Tests: poison, spikes, electric, lava, fire, "no way round" (Hot Zoomies suite).
2. **Stale Hot Zoomies routes.** The route table is cached per board, keyed on `state.mutations` + turn + his tile — but a
   plain walk (`DD.Act.moveAlong`) doesn't bump `state.mutations`, so a foe walking into a corridor after the cache was
   warmed left a route straight through it (targeting said yes; the dash then stopped at the foe). The key now includes
   where the foes stand. Regression in the Hot Zoomies suite (a grunt walks into the corridor → no route), mutation-
   checked (fails with the old key).
3. **Hot Zoomies desc** trimmed from 21 to 17 words ("Dash up to 4 tiles, leaving fire (2 rounds) on every tile
   Pebbles leaves, except under allies."); the registry suite's cap is now 18 words (signature 22) instead of 24.
4. **Bark "I'll guard! BORK!"** read like the removed Guard action → "I'll stand watch! BORK!"; the registry suite now
   also checks barks for v1 words (guard / intent / telegraph / XP), mutation-checked.

**Probed, no change needed**
- Oil: This Is Fine / Hot Zoomies lighting an oil slick that runs under an ally sets the ally's tile alight too (the
  knight Burns 2). That is the shared oil rule ("fire spreads along the whole slick"), not his skill: his own tiles skip
  allies as the desc says. Players see the slick.
- Fire can't lie on holy ground, blood, smoke or water (steam): his trail skips those tiles; webs / cheeto / poison / ice
  react to fire as the terrain table says; a web on the route Roots him and ends the dash (like any walk).
- Bark-B-Q hits a Burning foe behind a wall (areas ignore walls, like every circle AoE; `canUse` and the area agree).
- Lava does 8 to a foe fetched onto it (not a kill); Emotional Support Dog can't target a downed ally (Help Up does that)
  or a charmed foe; Puppy Eyes works on elites (like the other charms), never bosses; Bleed ticks on a dash (a move).
- Collar: `unit.data` is per fight, so "once per fight" holds.
- Visuals (`.tmp/pebrev2/g1.png`, `gh.png`, `c1.png`, `c2.png`, `port.png`): the flame dog is the most distinct card in
  the hero gallery; big happy eyes, flame ears, tongue, blue collar + gold "P" tag in the portrait (128 / 64 / 40 and the
  HUD); legs visible under the flame mane; statuses tint correctly.

**Balance (real content, `.tmp/pebrev/real.js`, 72 AutoPlay fights, Pebbles + 3 random real heroes, v2 levels):** win
78% (act 1 normal / elite 100%, act-1 boss 50%), Pebbles 21% of the party's damage (party average 25%; melee peers
Slate 27, Betty 26, Sparrow 26, Marbles 22, Basanos 20, Marwyn 17), downed in 26% of fights, 1.1 kills; no swallowed
errors. Mid-pack melee — no numbers changed. AutoPlay rarely uses Big Wag (1), Bark-B-Q (1), This Is Fine (3) or Chew
Toy (5) in those fights: they are positioning / combo skills (a wag wants 2 foes or a hazard behind them; Bark-B-Q
wants Burn that lasts — two nibbles on one foe, This Is Fine's fire or oil set it up for his next turn) and AutoPlay
treats his fire as a hazard (Requests). The suite's scripted turns cover all three.

**Remaining (not his files):** the HUD warns "⚠ … Fire — it will hurt." when he walks into fire or lava (immunity-blind
`hazardAt`, see Requests — the most visible issue left for this hero).

## Last full run

`bash tools/test.sh` (2026-11-04, end of the v2 review): 795 suites, 2 failing sections, **none from Pebbles** — both in
`integration` (the pre-v2 unlock conditions / "ten real heroes" check, and the "Objective Failed" step's XP line).
All 20 `hero_pebbles` suites pass (~940 assertions), `passive-table: hero-only Blessings` passes, no swallowed
"Error in …". (`tests/balance_tests.js` is listed in the test manifest but missing — someone else's file in flight.)

Earlier, `bash tools/test.sh` (2026-11-03, end of the build pass): 766 suites, 76 failing sections, **none from Pebbles** — all 20
`hero_pebbles` suites pass (858 assertions), the 8 generic `content:` suites pass with him registered, and
`passive-table: hero-only Blessings` passes (Pyromaniac on Fetch Quest, Bedside Manner on Emotional Support Dog). The
failures are other areas mid-flight: bosses_act1 (18), bosses_act2 (17), boss_dm (15), items (13), kit (4), narrative
(4), passive-table (3: common / uncommon / cursed entries), integration (2: the pre-v2 "ten real heroes" + unlock checks,
16 heroes now). No swallowed "Error in …" from his file.

## Known issues

- In the fixture AutoPlay fights he mostly bites (Spicy Nibble ~3 uses a fight) and fetches; Bark-B-Q fires in real
  fights only when something already Burns (the fixture party has no Burn source besides his bites, whose Burn 1 ticks
  off before his next turn) — it is a combo skill. All nine pool skills get used across the suite's loadouts.
- AutoPlay treats fire / lava as hazards for him (see Requests), so sims under-use Hot Dog.

## Requests (Nov 3) — flyers ignore the floor, barrels, heals that revive (CONTENT SWEEP heroes-2)

- **Flyers**: Hot Dog's `inFire` checks `DD.Grid.feelsFloor` (a flying Pebbles, from Frequent Flyer or item flight,
  hovers over fire and lava: no cosy heal), and This Is Fine's `aiScore` (worth his turn-end heal) is 0 for a flyer.
  `hurts()` is now `DD.Grid.hazardAt(x, y, u)`, which is per unit (his fire immunity and flight are built in), so a flying
  Pebbles zooms straight over a poison puddle; the zoom route cache key includes flight. His fire trails and This Is
  Fine's fire are core `fire` surfaces (floor): the engine keeps them away from flyers.
- **Barrels**: Spicy Nibble, Fetch Quest and Chew Toy can be aimed at a volatile object (riders skipped: no Burn, pull or
  Root). A bite puts him in the fire blast, which he ignores (fireproof).
- **Heals**: Emotional Support Dog aimed at a downed ally gets it up with the heal as its HP, then Inspires it (no early
  return on a downed target: heal first, Inspire if it is up).
- **Tests**: `hero_pebbles: v2 requests — …` (35 assertions): walking vs flying over fire (heal / no heal, `aiScore`),
  zoomies around vs over poison, Emotional Support Dog I-III on a downed knight (target `revive: true`, preview "UP! N
  HP", N HP, Inspired, 1 AP, it acts on its own slot with full AP), Spicy Nibble at a barrel (preview = reality,
  Pebbles unhurt).
- **Requests**: none.
