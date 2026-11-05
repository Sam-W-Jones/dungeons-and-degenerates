# HERO — Betty, the G.O.A.T. (notes)

Files (mine): `js/data/heroes/betty.js`, `tests/content/hero_betty.js` (16 suites `hero_betty: …` + 1 opt-in sim), this file.
Run: `bash tools/test.sh "suite=hero_betty&isolate=heroes/betty,hero_betty"`; generic validation:
`bash tools/test.sh "suite=content:&isolate=heroes/betty,hero_betty"`.
Looks: `bash tools/shot.sh "debug=1&fixtures=1&isolate=heroes/betty,hero_betty&screen=gallery&gallery=betty" .tmp/betty/g.png 1280x720 4000`;
in combat: `bash tools/shot.sh "debug=1&fixtures=1&isolate=heroes/betty,hero_betty&screen=combat&party=betty,test_knight,test_cleric,test_mage&encounter=test_a1_elite&seed=5&autoplay=1&fast=1" .tmp/betty/c2.png 1280x720 9000`.
Balance sim (manual): `bash tools/test.sh "suite=hero_betty: zz&sim=1&n=3&verbose=1"` (real encounters, Betty + 3 random real
heroes at level 2 / 3 / 5 by act); `&fixtures=1` = the fixture party on the fixture fights, `&enc=<id>` one encounter,
`&trace=1` prints his AutoPlay decisions in the first fight.
Scratch (not shipped) in `.tmp/betty/`: `sprites.html` (big gridded sprite, poses, portraits), `scene.html` + `scene.js`
(scripted fights in the real renderer + HUD: `scene=ram|toss|goat|goatdo|ramdo|pasture|aoo`; open them with
`&fixtures=1&isolate=heroes/betty&debug=1&screen=combat&party=betty,test_knight,test_cleric,test_mage&encounter=test_a1_normal`),
`shot.sh` (screenshots a page there; takes a machine-wide Chrome slot like `tools/*.sh`).

## Summary

User brief: *"Betty (goat-man warrior)"* — **he/him** ("It's a family name."). DESIGN §6 "Betty" + "Simplicity", v2-native
(initiative order, one turn per unit, no telegraphs, no Guard, no combat-start Block, attacks of opportunity). A big
goatfolk warrior who bleats mid-sentence ("BAAAttle!"), calls everyone "kid" and eats anything (the loot, the map, the DM's
notes). Role: **frontline charger / knockback / holds the line**, complexity 1, `unlock: null`, colour `#b07a4f`.
Stats: 32 HP (+4/level), 3 AP, move 4, armor 0, **initiative +1**, `flags.hop` (goats climb: up 2 levels a step).

**Passive — Eats Anything** (one rule): *whenever Betty kills a foe or one of his skills breaks an object, he eats it and
heals 4 HP.* Kills: `onKill` with `d.credit` = Betty (his attacks of opportunity and environmental kills he caused count;
an ally's kill doesn't). Objects: the engine has no "object broken by" hook, so the passive bookmarks the fight's
broken-object count (`state.stats.objects`) when he pays for a skill (`onCostPaid`, not a consumable) and eats what his
skill added (`onSkillUsed`); a free re-use in the same turn (an echo) counts from the last bookmark, a consumable never
does. HUD previews show the snack (+4 per kill / object).

**Kit** (ids `bet_*`; ⭐ starting; numbers I / II / III). Nothing is a `spell` (Silence never stops a goat).

| Skill | id | Cost | Effect (one verb + at most one rider) | Pairs with |
|---|---|---|---|---|
| The Family Hammer (basic) | `bet_family_hammer` | 1 AP | 5 damage to an adjacent foe or breakable object; **his attack of opportunity** | barrels (Eats Anything) |
| Ramming Speed! ⭐ | `bet_ram` | 2 AP, cd 2 | charge up to 3 / 3 / 4 tiles in a line; the first foe in the way takes 6 / 8 / 9 and is pushed 2 / 2 / 3 | pits (YEET), lava, water (Wet → lightning), explosive barrels, runes, traps |
| Butt Out ⭐ | `bet_headbutt` | 2 AP, cd 3 / 3 / 2 | 6 / 7 / 9 to an adjacent foe + Stun (it skips its next turn; interrupts a boss wind-up) | Kick 'Em, anyone's big hit, freeing an engaged ally |
| Head Over Heels | `bet_horn_toss` | 1 AP, cd 2 | flip an adjacent foe over him onto the tile behind; Vulnerable 1 / 2 / 2 turns; III: + 5 damage | drop it into the party's melee / AoE, pits and lava behind him |
| Bleat of Defiance | `bet_bleat` | 1 AP, cd 2 / 2 / 1 | Taunt every foe within 2 / 3 / 3 (its next turn: it must attack Betty) | allies walk away from taunted foes for free; foes walk to him through the allies' attacks of opportunity |
| Stomping Grounds | `bet_stomp` | 2 AP, cd 2 | 4 / 5 / 6 to every foe on the 8 tiles around him + Slow (−2 move, its next turn) | clusters made by pulls, taunts |
| Goat Yoga | `bet_goat_yoga` | 1 AP, cd 2 | Betty or an adjacent ally gains 6 / 8 / 10 Block (until the start of its next turn) | the squishy next to him |
| Five-Second Rule | `bet_snack` | 1 AP, cd 3 | heal 6 / 8 / 8 HP; III: + remove one debuff | — (sustain) |
| Mountain Goat | `bet_mountain_goat` | 1 AP, cd 2 | leap to an empty tile up to 3 / 4 / 5 away, any height (high ground +25%) | escaping an engagement (a leap never provokes) |
| Kick 'Em While They're Down | `bet_kick` | 1 AP, cd 1 | 5 / 6 / 7 to an adjacent foe, or 10 / 12 / 14 if it is Stunned or Rooted (asleep, frozen, held count) | every Stun / Root / Sleep / Freeze / hold in the party (Kiri, Hjalmar, Marwyn, Slate, Ellaria…) |
| You Shall Not Pasture! | `bet_pasture` | 1 AP, cd 1 | until his next turn, his attacks of opportunity deal +3 / +5 / +7 and Root the foe where it stands | Kick 'Em next turn; protects the backline from divers and pins archers |
| G.O.A.T. (signature) | `bet_goat` | 2 AP, 100 Hype | charge up to 6 tiles in a line through every foe: each takes 15 and is Stunned | lines of foes, a boss mid-wind-up |

Pool = 10 (+ basic + signature; DESIGN 8–10, 2 starting). AP 1 / 2 mixed, cooldowns 1–3, no charges (the "big" skill is
the signature). Every desc is ≤ 25 words (tested) and exact per level. Icons: 🔨 🐏 💫 ⤴️ 📢 🦶 🧘 🥫 ⛰️ 🦵 🚧 🏆 — all
different, and none a generic skill's (tested; Head Over Heels was 🤸 until the full run showed Dodge Roll owns it). Durations count the owner's own turns (v2): Stun /
Taunt / Slow on a foe from his turn = its next turn; Vulnerable 2 = its next two turns; Block until the start of its
owner's next turn. Charges / leaps refuse while he is rooted or held (`DD.Act.cantMove`): "Rooted: no running start."

**Status** `bet_pasture` **"Territorial"** 🚧 (buff, `decay: 'turnStart'`, 1 turn, stacks = the bonus; tooltip "… Lasts
until his next turn."): `modifyOpportunity`
adds `o.flat` when its holder is the attacker (pure: the HUD's provoke numbers, paths, `DD.AI.opportunityDmg` and the AI's
`aooCost` all read it), `onOpportunityAttack` Roots the mover (the engine then ends the walk on that tile). Named
"Territorial" because the log reads "Betty is Territorial (5)." (the skill name made "Betty is You Shall Not Pasture!").

**Items** (all `hero: 'betty'`, no `stats.block`):
- `bet_grandmas_mallet` Great-Grandma Betty's Mallet (rare weapon): +10% damage; his pushes go 1 tile further
  (`modifyOutgoingPush`; the Ram desc shows the extra tile when he holds it).
- `bet_name_plate` Breastplate That Says BETTY (rare armor): +6 max HP, +1 armor.
- `bet_cowbell` Championship Cowbell (legendary trinket): once per turn, when Betty kills a foe, he gains 1 AP (a kill
  outside his turn — an attack of opportunity on a foe's turn, a delegated swing on an ally's — banks it: +1 AP on his
  next turn).

**Sprite**: stocky humanoid (scale 1.08), `furs` outfit (white chest fur around the plate, dark pelt hem), brown fur,
ram horns, goat ears, dog tail, hammer, belt; the `overlay` paints a steel breastplate stamped BETTY, a pale muzzle with
nostrils, a white goatee, horizontal goat pupils and split hooves (all in body coordinates: it flips and lies down with
the sprite). Looked at: gallery (every pose, statuses, portraits 128 / 64 / 40, zoom 1), in-combat shots (`c2.png`) and the
scripted scenes (`sc_ram.png`, `sc_aoo.png`): horns + hammer read at game zoom, the portrait reads in the initiative
tracker and the party cards.

**Barks**: every standard key + his extras (`ram`, `toss`, `bleat`, `eat`, `opportunity`, `pasture`), 4–6 lines each,
≤ 70 chars, "kid" ×8+, bleats ×5+, "It's a family name." as a running gag; cross-party lines for Corelos, Slate, Marbles,
Josiah, Pebbles, Valdris, Hjalmar (no she/her anywhere in his texts: tested). No line repeated, and none word for word
another character's (review: four were; a copy of one of his lines by anyone else shows up as a `hero_betty advisory`
warning in the definition suite, not a failure).

## Attacks of opportunity (how he plays with them)

- **His hammer holds the line**: The Family Hammer is melee, so a foe walking away from him takes 5 (once per round, free,
  on the foe's turn). The AI knows (`DD.AI.opportunityDmg` = 5), so engaged foes stick to him; a swing that kills feeds
  Eats Anything (and rings the Cowbell). He barks about it (`opportunity`, 50%).
- **You Shall Not Pasture!** makes the swing bigger (+3 / +5 / +7, visible to the AI and every estimate) and Roots the
  walker where it stands (its walk ends next to him; a Root applied on its own turn also covers its next turn — tested).
  Against divers (`assassin` / `skirmisher`) who shrug off a plain swing to reach the squishy, it pins them; at III a
  swing that would drop the foe keeps even a diver from trying (the AI never walks into a lethal one — tested).
- **His mobility never provokes**: Ramming Speed! (a dash: `moveAlong` without `provoke`), Mountain Goat (a leap),
  G.O.A.T. (a charge) — he can leave an engagement or dive past the front to pin an archer; Head Over Heels is a throw,
  so the flipped foe leaves an ally's side without a swing. Walking away from a foe himself provokes it like anyone
  (the move preview shows it; such a move can't be undone).
- **Freeing allies**: a foe he Stuns (Butt Out) makes no attacks of opportunity, and a foe he Taunts (Bleat) strikes only
  him — so the ally it was pinning walks away for free (both tested with the knight).
- Nothing in his basic needed a `ctx.opportunity` guard (no user-side effects); the passive's object bookkeeping only
  counts during his own paid turn, so a swing on a foe's turn never miscounts.

## Combos (setups and payoffs with the other heroes)

- **Stun / Root → Kick 'Em While They're Down** (10 / 12 / 14): his own Butt Out and You Shall Not Pasture!, and
  everyone's Stuns, Roots, Sleeps, Freezes and holds (tested: the cleric's Boring Sermon → 10; a stance-Rooted runner → 10).
- **Rams and flips into hazards**: pits (YEET, +20 Hype, Betty eats its lunch), lava (8 + Burn), water (Wet → the mage's
  Chain Zap +50% and the puddle Stuns: tested), explosive barrels (KABOOM: tested), allies' traps and runes.
- **Head Over Heels → Vulnerable** next to the party's heavy hitters (tested: the knight's Wide Cleave ×1.25).
- **Bleat / Stun as bodyguard tools** (above), Goat Yoga's Block on the squishy behind him.

## Tests (`tests/content/hero_betty.js`)

Suites: definition, pool, barks, items, sprite · Eats Anything · The Family Hammer and Ramming Speed! (every level, pits,
lava, water, deep water, walls, edges, allies, climbing, AI hint) · Butt Out and Kick 'Em (every level, own-turn Stun,
wind-up interrupt, frozen) · Head Over Heels (every level, landings, bosses, blocked, every direction) · Bleat, Stomp,
Goat Yoga (every level, Block timing) · Five-Second Rule and Mountain Goat (every level, high ground) · G.O.A.T. (walls,
crowds, point blank, empty, rooted, boss wind-up) · items (incl. a Cowbell kill on a foe's turn) · HUD previews match
reality (every skill, every level, exact) · v2 edge cases (stunned / silenced / sheep / charmed Betty, AP, not his turn,
deaths mid-skill, downed + Help Up) · durations (own turns, enemies first) · combos · **attacks of opportunity** (his
swing, once a round, kill → snack, walking away provokes + preview + no undo, Ram / Mountain Goat / G.O.A.T. / Head Over
Heels never provoke, stunned / asleep / sheep / downed / charmed Betty) · **You Shall Not Pasture!** (every level, +N, Root,
once a round, lasts until his next turn start incl. foes acting before him, cooldown, Root on the walker's own turn,
Kick 'Em payoff, divers pinned / deterred, his own walks unaffected, lethal swing, aiScore, AutoPlay walks to the fight
instead of planting in the open) · AutoPlay battles at levels 1 / 3 / 5 (9 fixture fights, 0 errors, his skills used) ·
`zz balance sim` (opt-in). Mutation-checked: removing the Root rider, the +N bonus, or the attacker-only guard each fails
the You Shall Not Pasture! suite. Review additions: the HUD previews of his own way through a hazard (a charge over lava,
a leap onto it, a G.O.A.T. ending on it), a delegated kill on an ally's turn banking the Cowbell's AP, the Territorial
tooltip's duration, no repeated bark (+ the copy advisory); 26 of 27 review mutants fail a suite (Review (v2) below).

## Balance (AutoPlay, 2026-11-03; other heroes are mid-conversion, so it drifts)

`suite=hero_betty: zz&sim=1&n=3&seed=3` — 102 real non-boss fights, Betty + 3 random real heroes, level 2 / 3 / 5 by act:
93% wins. Betty: 28.8 damage / fight, 25.3 taken, 1.30 kills, **8 downs in 102 fights** (the hardest hero to drop in
the sample). Other frontliners: Basanos 28.7 / 32.1 taken, Marwyn 29.1 / 18.6, Slate 37.6 / 19.0, Pebbles 33.0 / 20.5;
strikers 44–68. Skill uses per fight when socketed: Ram 0.88, Butt Out 0.89, Goat Yoga 1.89, Bleat 1.28, Five-Second
Rule 1.16, Kick 'Em 0.89, Head Over Heels 0.52, Stomp 0.32, Mountain Goat 0.29, You Shall Not Pasture! 0.16; hammer
~2.6 / fight; G.O.A.T. 3 in 102 fights (a normal fight rarely reaches 100 Hype). Attacks of opportunity: by him 0.12 /
fight, on him 0.09 / fight — foes stay engaged with him rather than walk off (the deterrent working).
Fixture AutoPlay suite: 9 / 9 wins.

**Review re-run (2026-11-04, all 16 heroes loaded).** `zz&sim=1&n=1&seed=11`: 34 fights, 97% wins; Betty 24.9 damage /
fight, 25.0 taken, 1.29 kills, 2 downs. Controlled comparison (`.tmp/bettyrev/sim.html`: the same 34 non-boss encounters,
seeds and random teammates, only the fixed hero changes; level 2 / 3 / 5 by act), seeds 11 + 12, then the act-1 bosses
(8 fights each, level 2, seed 21):

| fixed hero | wins (68) | dmg / fight | taken / fight | downs | walk-only turns | Grimble | Rat King |
|---|---|---|---|---|---|---|---|
| Betty | 65 | 28.9 | 24.3 | 6 | 34% | 4 / 8 | 5 / 8 |
| Basanos | 62 | 30.3 | 24.1 | 6 | 24% | 3 / 8 | 5 / 8 |
| Marwyn | 68 | 25.3 | 20.0 | 3 | 24% | 4 / 8 | 3 / 8 |
| Slate | 68 | 38.0 | 14.4 | 0 | 33% | — | — |

He is in the melee band (Slate's ranged throws put him above it). Why Betty walks more is under Review (v2) → AutoPlay.

## Deviations

- Eats Anything is a rule (kills and objects his skills break heal 4), not the brief's "once per turn he may eat an
  adjacent object" action: no extra button, and it rewards his rams into barrels.
- G.O.A.T. Stuns every foe it tramples (one big effect that interrupts boss wind-ups) instead of "knocking each aside".
- Pool of 10 (the top of DESIGN's 8–10): the 10th, You Shall Not Pasture!, is his attack-of-opportunity tool (the task:
  "a frontline that makes opportunity attacks matter").
- Status name "Territorial" differs from its skill's name (log grammar, above).

## Requests

- **AUTOPLAY** (`js/engine/autoplay.js`): melee heroes spend many turns only walking. In the sim above, walk-only turns
  (moves, no skill): Betty 34%, Slate 29%, Basanos 27%, Pebbles 26%, Marwyn 23%, Marbles 20% vs ranged heroes 3–11%. The
  fixture `test_a2_normal` trace (`&fixtures=1&enc=test_a2_normal&trace=1`) shows Betty (32 HP, full health) hovering in
  the back rows for 4 rounds against a mortar, a necromancer and a coward, valuing every approach below 0.5 — a
  frontliner should accept some incoming fire to close in and pin ranged foes (a melee hero next to an archer pins it).
  Also: any self-buff gets a flat 1.5 in `statusGain`, which beats the 0.5 "walk toward the fight" fallback (Betty's
  stance works around it with a negative `aiScore` in the open). Review (2026-11-04, controlled sim): Betty 34% walk-only
  vs Basanos / Marwyn 24% on identical fights, with his wins and damage in their band; much of it is real (rooted, or
  no reachable tile next to a foe), but against the Rat King AutoPlay walks him away at half HP instead of swinging
  (a move away scored 101.2 vs a hammer on a Rat Lawyer 89 at 16 / 32 HP; repro `PAGE=sim bash .tmp/bettyrev/run.sh
  "suite=sim&hero=betty&n=8&seed=21&enc=boss_rat_king&tf=1&verbose=1"`).
- **RULES** (`js/engine/ai.js`, review): a Taunt from a hero on an enemy that is Charmed wastes the charm — on its turn it
  attacks nobody (control probe: charmed alone it stabs its friend 14 → 10; charmed + Betty's Bleat it does nothing).
  `AI.targetsFor` ignores a taunter that is no longer hostile, but `isFoe(u, o, taunt)` / `candidates` keep the taunt
  filter. Every taunt does this (Bleat, LOOK AT MARWYN!, Hold the Line, Get Off My Lawn, Bork, the clone's and the
  corgis' taunts) against Buga's / Corelos' / anyone's charms; suggest: a taunt whose taunter is not hostile is void.
- **RULES** (minor): `DD.AI.opportunityDmg` multiplies `o.flat` by the target's multipliers, the real hit adds it after
  them (`round(amount × mult + flat)`): the hammer's 5 + 7 on a Vulnerable walker estimates 15 for a real 13. Harmless.
- **Lead**: DESIGN §6 Betty brief could list You Shall Not Pasture! (his attack-of-opportunity stance) and the 10-skill pool.
  `tests/content/integration.js` "cross-content consistency" still expects the pre-v2 unlocks and "ten real heroes"
  (there are 15+ now, all `unlock: null`): not Betty's, but it fails in every full run.
- **Lead** (review, overlaps — both sides come from DESIGN §6 briefs): Betty's starter Butt Out and Marwyn's Use Your Head
  are the same skill (2 AP, damage + Stun, cd 3 / 3 / 2; Marwyn's costs 2 HP and hits 1 harder); Head Over Heels lands a
  foe on the tile behind him like Slate's Rock Bottom (different riders: Vulnerable vs damage + Stun); Mountain Goat's leap
  3 / 4 / 5 matches Marwyn's Hero Landing (his taunts on landing). Fine as tank staples; decide if one should move.
- **NARRATIVE / RULES** (low): barks are plain lists, so cross-party lines ("Pebbles, sit. Good boy.") play when that hero
  isn't in the party (every hero's `idle` key is mostly such banter). An optional presence tag (e.g. a line that starts
  with `@pebbles ` plays only when Pebbles is in the fight) would fix it for everyone.

## Known issues

- AutoPlay's danger model sees the stance's +N (through `modifyOpportunity`) but not its Root, so it undervalues the
  stance; `aiScore` adds value next to divers (6) and ranged / support foes (4).
- The stance rarely triggers against brutes (they stick to him anyway): it is a tool against divers and archers.
- The generic `content:` skill arena never executes Head Over Heels ("no valid target": that arena puts an ally on the tile
  behind the hero). His own suites run it at every level with exact previews.
- A charge on foot burns: Ramming Speed! runs through lava / fire like a walk (8 + Burn on lava; previewed exactly), while
  G.O.A.T. only takes the tile it ends on (it is a trample-teleport). Both are what the HUD shows; noted in case it surprises.

## Review (v2) — adversarial review of the v2 kit (ADVERSARIAL REVIEWER role, 2026-11-04)

Scope: `js/data/heroes/betty.js`, `tests/content/hero_betty.js`, this file. Verified by running code: his suites
(isolated, with all content, and under seeds 1–5 besides the default), the generic `content:` suites, 27 mutants of
`betty.js` (`.tmp/bettyrev/mkmut.sh` + `mut.html`), probes (`.tmp/bettyrev/probe.html` — lava / bosses / Kick 'Em
conditions / stance edge cases / Slate's grapple / charm), a controlled AutoPlay sim (`.tmp/bettyrev/sim.html`, Balance
above), and shots: gallery, party select with his detail panel, an AutoPlay fight, the scripted stance + attack of
opportunity HUD scene. Full `bash tools/test.sh` (final files): 794 suites, 3 failing sections, none from his files —
`bosses_act1` ×1 (the Rat King's swelling ranks, mid-conversion) and `integration` ×2 (v1 unlocks, "ten real heroes", the
"… or XP" step). Every `hero_betty` suite and every `content:` suite passes; no swallowed errors, no bark advisories.

### Verified (held)
- **desc == effect at every level**: the per-skill suites check every number of every level, the previews suite compares
  preview and real use for all 12 skills × levels; the review read each desc against `execute` (Head Over Heels III deals
  its 5 before the Vulnerable, as written; Kick 'Em's "Stunned or Rooted" = `isStunned || cantMove`, so a sheep, charmed,
  Dazzled, Slowed, Weak or Confused foe takes the plain 5 — probed).
- **v2**: `init: 1`, `unlock: null`, no Guard, no starting Block, no intents / telegraphs / XP / planning code; durations
  count the owner's turns (Stun / Taunt / Slow = the foe's next turn, Vulnerable 2 = two of its turns, Block and the stance
  until his next turn start); cooldowns tick on his own turns (cd 1 = every other turn).
- **Attacks of opportunity**: The Family Hammer is his reaction (once a round, free, Eats Anything and the Cowbell on a
  kill); Ramming Speed! (a dash), Mountain Goat (a leap), G.O.A.T. (a trample) never provoke and Head Over Heels is a
  throw; walking away from a foe provokes (previewed, no undo); no swing when stunned / asleep / sheep / downed, never at
  his charmer; the stance's +N is in every estimate, its Root ends the walk next to him, a foe walking past him is pinned
  too (probed), his own walks stay plain, a re-cast never stacks (`refresh` = max).
- **Cross-hero**: Slate's grapple: flipping or ramming a held foe releases it cleanly ("Slips free!", no stale hold, no
  errors); his Stun / Bleat free an engaged ally; Kick 'Em pays off every Stun / Root / Sleep / Freeze / hold in the party.
- **Bosses**: Bleat taunts a boss, Butt Out and G.O.A.T. interrupt wind-ups; the real Rat King, Lich, Dr. Iris and DM are
  immovable or flying (no pit flips); Grimble is not (the shared fall rule: 25% max HP, same for anyone's push).
- **Previews can't leak**: the Cowbell's and Eats Anything's `u.data` bookkeeping lives on deep-copied preview units.
- **Mutation**: 26 of 27 mutants fail a suite — every rider (Stun, Root, Vulnerable, push, Slow, Block, cleanse),
  Eats Anything (kills, objects, the heal), the Cowbell (bank, once a turn), dashes / leaps that provoke, the stance
  (bonus, Root, attacker-only, decay, aiScore), numbers, G.O.A.T.'s end tile, the immovable check, damage-before-
  Vulnerable. The survivor (Ram's internal range clamp removed) is equivalent: targeting already limits the target tile.
- **Robustness**: the suites pass under seeds 1–5 (different AutoPlay maps), isolated and with all 16 heroes.
- **Visuals**: horns, goat ears, white muzzle and goatee, the BETTY breastplate and the hammer read in every pose and at
  game zoom; the party-select panel (role, blurb, 32 HP, Hop chip, passive) and the HUD (Territorial chip, "Engaged: 2
  foes, up to 8", the log's "Betty gets an attack of opportunity…" / "Test Grunt is Rooted.") are right.
- **Pronouns**: he/him everywhere (tested over every text of his); the cross-party lines name only he/him heroes.

### Fixed (most severe first; reverting 1, 3 or 4 fails an assertion; reverting 2's exact copies raises the advisory)
1. **The Cowbell's desc missed a case**: "(a kill on a foe's turn: +1 AP on his next turn)", but a kill on an *ally's*
   turn (a delegated swing — Buga's Delegate) banks the AP too. Now "(a kill outside his turn: +1 AP on his next turn)";
   new assertion: a delegated kill on the knight's turn banks 1 AP and he starts his turn with 4.
2. **Copied barks** (a probe over every hero / enemy / summon line): "Where do you think YOU'RE going?" was Valdris'
   reaction line word for word, "Next!" Slate's, "Ow. Rude." Ellaria's and Slate's, and "Hey, ugly! Yeah, you. BAAAH!" was
   Sparrow's Blood Clone's "Hey, ugly! Yeah, you!" plus a bleat. Now "Where d'you think you're GOAT-ing, kid?", "Next!
   Form an orderly line, kids.", "Hey! Not the horns!", "Oi! Eyes on the goat! BAAAH!". New: no line of his repeated
   (assert); any character copying one of his lines raises a `hero_betty advisory` warning (checked with a mutant that
   puts Slate's "Next." back).
3. **The Territorial tooltip** said "Ends at the start of the next turn.", which reads like the next unit's turn (it lasts
   through every foe's turn until his). Now "Lasts until his next turn." (the skill's own words); asserted.
4. **Coverage gap**: no preview case moved Betty himself through a hazard. New cases: a charge over lava (he runs through
   it: 8 + Burn), a leap onto lava (8), a G.O.A.T. that ends on lava (8) — previews exact.
5. **Distinctness**: Butt Out's floating "BONK!" was Marwyn's Use Your Head's (and three others'): "BAAA-BONK!".
6. Notes: suite count (16 + the opt-in sim, not 17 + 1), the Cowbell text, the review's balance table and requests.

### Hero lens
- **Simple**: one verb + at most one rider each (the charges' push / Stun, the throw's Vulnerable, the stomp's Slow, the
  stance's Root); Head Over Heels III and Five-Second Rule III add their one rider; descs 9–24 words (≤ 25 tested; the
  longest is Head Over Heels III), most of the length is a reminder of what a status does. Pool of 10, 2 starting, no charges (the signature is the big one).
- **Combos** (2–3 clear ones and then some): Kick 'Em While They're Down cashes in every Stun / Root / Sleep / Freeze /
  hold in the party (Kiri, Hjalmar, Ellaria, Josiah, Syllamin, Slate, Marbles, Basanos, Valdris); Head Over Heels drops a
  Vulnerable foe next to the heavy hitters; Ramming Speed! feeds pits, lava, water (Wet → lightning), traps and runes;
  Bleat and Butt Out let engaged allies walk away free.
- **Passive**: one rule (he eats what he destroys) and the comedic core; it nudges last hits and barrel smashing.
- **Reads as Betty** (goat-man warrior, he/him, "It's a family name."): rams, headbutts, horn flips, bleats, hooves,
  climbing, eating everything, calling everyone "kid".
- **Attacks of opportunity**: a real line-holder (his hammer, the stance) who still disengages for free (dash, leap,
  trample).
- **Distinct**: the only rammer / climber / eater; overlaps with Marwyn and Slate are DESIGN-given tank staples (Requests).

### AutoPlay: why he walks more (controlled sim, Balance above)
Betty's wins and damage sit in the melee band, but 34% of his turns are walk-only (Basanos / Marwyn 24%) and he idles
fully more often. Traced causes: (1) rooted with nothing in reach (the spider fight's webs, the Rat King's roots);
(2) no reachable tile next to a foe — e.g. `a1_last_call` rounds 4–7: the bugbear boxed in by a cask, Buga and a corgi,
its free side 5 tiles off (beyond move 4 and a level-I Mountain Goat's 3) — common when he acts after faster allies
(init +1) who took the spots, while Basanos walks 6 in wolf form; (3) his own pushes move foes out of reach (his distance
to the nearest foe barely shrinks over a turn: 4.60 → 4.56, Marwyn 4.06 → 3.47); (4) AutoPlay walking him away from the
Rat King at half HP (Requests). Without Ramming Speed! in his loadout it gets worse (51%): the ram is his gap closer.
Nothing in his kit misleads AutoPlay (the Mountain Goat candidates it rejects are honest; the stance's negative
`aiScore` in the open holds).

### Remaining (not fixed here)
- AutoPlay's retreat from the Rat King and the melee walk-only share (AUTOPLAY request); a Taunt cancelling an ally's
  Charm (RULES request); presence-gated cross-party barks (NARRATIVE / RULES, low); the Butt Out / Use Your Head overlap
  (Lead).

## Requests (Nov 3) — flyers ignore the floor, barrels, heals that revive (CONTENT SWEEP heroes-2)

- **Barrels**: Butt Out and Kick 'Em While They're Down can be aimed at a volatile object (no Stun: a rider). The
  barrel counts as an object his skill broke, so Eats Anything heals him 4 after the blast (`onCostPaid` / `onSkillUsed`
  fire on a detonation). The Family Hammer is a tile skill and already hit objects. No opt-outs.
- **Flyers**: his push / toss hints were already per unit (`pushHazard`, `tossLanding`); no floor effects of his own.
- **Heals**: Five-Second Rule is a self heal (not a revive).
- **Tests**: `hero_betty: v2 requests — …`: both skills at a barrel (preview = reality on Betty and the grunt, the 4-HP
  snack, no Stun, AP and cooldown paid).
- **Requests**: none.
