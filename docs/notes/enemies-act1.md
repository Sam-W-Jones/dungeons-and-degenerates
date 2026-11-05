# ENEMIES-ACT1 — notes

Files: `js/data/enemies/act1.js` (content), `tests/content/enemies_act1.js` (13 suites `enemies_act1: …`).
Isolated run: `bash tools/test.sh "suite=enemies_act1&isolate=enemies/act1,enemies_act1"` (add `&verbose=1&n=6` for the
sim tables). Scratch: `.tmp/enemies-act1-v2/` — real-hero / fixture balance probe:
`bash .tmp/enemies-act1-v2/probe.sh "probe=probe.js&party=real&lv=1,2&runs=6&verbose=1"` (`party=fixture`, `enc=<substr>`,
`kind=normal|elite`; per-skill fired / landed / damage tally). Older v1 scratch: `.tmp/enemies-act1/`, `.tmp/enemies-act1-review/`.

## v2 — initiative, no telegraphs, attacks of opportunity, reach-aware targeting (ACT 1 ENEMIES role)

User requests this answers: initiative turns, no enemy telegraphs (elites at most one wind-up for their signature),
no starting Block, simpler skills, and the latest playtest ("mobs prioritize the lowest health hero irrespective of
range, melee feel weak" → attacks of opportunity + reach-aware targeting; difficulty "hard but fair").

### Summary

- **Every act 1 enemy acts on its own initiative turn, at once** (move first, then one skill). Normal enemies never keep
  a pending action; the **Mimic's Lid Slam is the act's one wind-up** (announced on its turn, lands at the start of its
  next one; a stun / sleep / freeze / sheep interrupts it). The Bugbear and the Cube have none (Bar Stool and Jiggle Slam
  are immediate).
- **Initiative modifiers** (explicit on every enemy, shown in the inspect panel and most codex texts): rat +3, grunt +2,
  kid +3, **Rep −2** ("he reads the minutes first"), slime −1, slimelet +1, Spore Bro −1, spider +2, **critic +1**
  ("quick to judge"), **Mimic +2** ("waiting nine years for someone to touch it"), Bugbear −1, Cube −3.
- **AI styles for the reach-aware targeting**: brutes stick to the hero next to them (`melee`: rat, grunt, slime,
  slimelet; custom planners with `aiStyle: 'melee'`: Mimic, Bugbear, Cube), the kid and the critic keep their distance
  (`ranged`, keepDistance 3), the Rep stays behind his friends (`support`), the Spore Bro goes for the biggest bunch
  (`kamikaze`), and **the Cellar Spider is the act's one diver** (`skirmisher`: the wounded, the squishy and webbed prey,
  even past the front line; it braves attacks of opportunity but never a lethal one).
- **Tooltips** (`def.passive.desc`, the HUD inspect panel) all start "On its/his turn …" and say how it picks targets
  ("keeps biting the one it is next to", "keeps his distance", "goes for the weakest prey it can reach") and how it
  reacts to walkers (below).
- **Attacks of opportunity** (engine rule: the first ready melee skill; review: Pack Tactics and the spider's webbed-prey
  +3 ride on the reaction's `o.flat` via `modifyOpportunity`, so the move preview shows the real bite): rat Ankle Nibble (2 + Bleed), grunt Pointy
  Stick (6, the leaver's tile only), slimelet Glorp (3), spider Sticky Snack (5/8), critic Lute (6), Mimic CHOMP (9 + 4
  gold) **except while its lid is open** (Lid Slam wound up: `modifyOpportunity` cancels it, so stepping out of the slam is
  a real, free window), **Bugbear: the throw** ("walking out on him gets you thrown out": 7 + 3-tile throw, ends the walk),
  **Cube: Engulf** while it is ready (7 + Engulfed, ends the walk). None: the kid, the Rep, the Spore Bro and the **slime**
  ("too gooey to swing at anyone walking away", stated in its tooltip).
- **Custom planners price attacks of opportunity**: `spotsOf` tags every reachable spot with `api.aooCost` and drops
  lethal walks; the Mimic's crowd spot and the shared `approach` subtract it; the Bugbear's throw / stool scores subtract
  it and add `DD.AI.targetValue` (engaged first, threat, kills). E.g. he steps around a knight (eating the slash) to
  throw him into a pit, but not just for a wall bump.
- **Simplified skills** (one verb + at most one rider; done in the first v2 pass, kept and tested): Bear Hug removed;
  Sticky Tongue = damage + pull (no Root); CHOMP = a plain bite (no hop); Engulf = damage + one status (`a1_engulfed`:
  can't move, 3 acid at the start of each of the victim's turns, 10 damage to the Cube frees everyone; no AP drain, no
  separate Root); Sporesplosion leaves no cloud (only a Spore Bro killed by someone else pops); Web Spit = Root + webs (no
  damage); Strike Action = Inspired only (no Block).
- **No combat-start Block**: nothing grants Block at the start. The union hall's **Hazard Pay** rule gives 2 Block to an
  enemy that *starts its turn* within 2 tiles of a Strike Fund (mid-fight, positional, it lasts until its next turn
  start; smash the funds). Rule `a1_hazard_pay`, declared by the encounter and by any placed fund (`init`), paid once per
  turn.
- **Durations** count the owner's own turns (Root / Taunt 1 = its next turn, Weak 2 / Inspired 2 / Engulfed 2 = its
  next two turns; webs 3 rounds).
- **Encounters under initiative**: waves arrive at a round start and act that round; survive 5 (Big Flush) ends at the
  end of round 5; protect (Open Mic): the Last Keg has 30 HP and the round-2 wave kicks in the **east** kitchen door
  (5+ tiles from the keg) instead of spawning next to it; destroy (Union Meeting): 3 funds + Hazard Pay.

### Enemies (12)

| id | tier | HP / mov / armor | init | style | skills (L1) | attack of opportunity |
|---|---|---|---|---|---|---|
| `a1_rat` Dire-ish Rat | minion | 9 / 5 / 0 | +3 | melee | Ankle Nibble 2 + Bleed 1, Pack Tactics +1 per other rat next to the victim (max +2) | nibble |
| `a1_gob_grunt` Goblin Grunt | normal | 18 / 4 / 1 | +2 | melee | Pointy Stick 6 on the 2 tiles in front (friend / foe / object) · Rock Toss 4 lobbed, range 1-5, cd 1 | spear |
| `a1_gob_kid` Slingshot Kid | normal | 14 / 4 / 0 | +3 | ranged 3 | Slingshot 5 to the first unit down a 6-tile line · Nyah Nyah! Taunt 1, cd 3 | — |
| `a1_kobold_rep` Union Rep | normal | 16 / 3 / 1 | −2 | support | Strike Action! self + allies within 2 Inspired 2, cd 2 · Memo 5, range 1-6 | — |
| `a1_slime` Sewer Slime | normal | 20 / 3 / 0 | −1 | melee | Splorch 5 to every adjacent foe; splits into 2 slimelets unless fire / a pit | — |
| `a1_slimelet` Slimelet | minion | 7 / 3 / 0 | +1 | melee | Glorp 3 | glorp |
| `a1_spore_bro` Spore Bro | normal | 15 / 4 / 0 | −1 | kamikaze | Sporesplosion 6 poison to adjacent units, dies; killed otherwise: poison cloud (Poison 2) | — |
| `a1_spider` Cellar Spider | normal | 16 / 4 / 1 | +2 | **skirmisher** | Web Spit: cross, Root 1 + webs 3 rounds, lobbed 2-5, cd 2 · Sticky Snack 5, +3 vs Rooted / web-standing prey | bite |
| `a1_critic` Bandit Bard Critic | normal | 17 / 3 / 0 | +1 | ranged 3 | Bad Review 4 + Weak 2, range 1-6 LOS, cd 1, spell · Lute 6 | lute |
| `a1_mimic` Mimic | elite | 68 / 3 / 2 | +2 | custom (melee) | Sticky Tongue 4 + pull 3, straight 2-4, cd 2 · CHOMP 9 + 4 gold · **Lid Slam** wind-up: 7 to the 3×3, knockback 1, cd 3 | CHOMP (not while the lid is open) |
| `a1_bugbear` Bugbear Bouncer | elite | 70 / 3 / 2 | −1 | custom (melee) | You're Not On The List 7 + throw 3 (bump 4 both, pits) · Bar Stool 6 r1, lobbed 2-5, cd 2 | the throw |
| `a1_cube` Gelatinous Cube | elite | 70 / 2 / 2 | −3 | custom (melee) | Engulf 7 + Engulfed 2, cd 2 · Spit 4 lobbed 1-5 + bones, cd 1 · Jiggle Slam 8 to the 3×3, cd 3 (2+ foes around) | Engulf (when ready) |

Elite planners: Mimic — crowded by 2+ foes (diagonals count) it winds up the Lid Slam (its whole turn), else CHOMPs a hero
it can walk up to, else licks one in a straight line, else walks closer by walking distance. Bugbear — the best throw
(walls, friends, explosive barrels, pits; he walks around his victim if it pays) or a stool into a group, else walks
closer. Cube — Jiggle Slam when 2+ foes are around, else Engulf, else spit; it never moves while digesting and never
re-engulfs the hero it holds.

### Encounters (11: 8 normal, 3 elite; 3 handcrafted layouts) — unchanged except the Open Mic

| id | kind | map | enemies (+ waves) | objective | minDepth |
|---|---|---|---|---|---|
| `a1_rats_in_the_cellar` | normal | cellar 10×10 | 5 rats; r2 +2 (S) +2 (E); r3 +2 (zone) | killAll | 0 |
| `a1_goblin_ambush` | normal | warren 10×10 | 2 grunts, kid, rat; r2 grunt + kid (S) | killAll | 0 |
| `a1_slime_time` | normal | sewer 10×10 | 3 slimes, rat; r2 +2 rats (S) | killAll | 0 |
| `a1_fungus_among_us` | normal | warren 11×11 | 2 spore bros, grunt, kid, rat; r3 spore bro | killAll | 1 |
| `a1_web_of_lies` | normal | cellar 10×10 | 2 spiders, critic, 2 rats; r2 spider | killAll | 1 |
| `a1_union_meeting` | normal | layout 11×11 union hall | Rep (soapbox), 2 grunts, kid; r3 +2 rats; Hazard Pay | destroy 3 funds | 2 |
| `a1_open_mic` | normal | layout 11×11 stage + bar | critic, 2 grunts, rat; r2 grunt + kid (**E**, the kitchen door) | protect the Last Keg (**30 HP**) | 2 |
| `a1_big_flush` | normal | sewer 11×11 | slime, 2 rats; r2 +slime +2 rats (E), r3 slime + rat (S), r4 2 spore bros + rat (W) | survive 5 | 3 |
| `a1_mimic_hoard` | elite | layout 11×11 treasure room | mimic (dais), 3 rats; r2 2 grunts (S) | killAll | 2 |
| `a1_last_call` | elite | cellar 12×11 | bugbear, grunt, kid; r2 +2 rats (S) | killAll | 2 |
| `a1_cube_cleanup` | elite | sewer 11×11 | cube, slime, rat | killAll | 3 |

### Balance (AutoPlay, normal difficulty, levels 1-2 = where act 1 is played in v2)

Fixture party (knight / cleric / mage / rogue), the sim suites at `n=6` (12 fights per encounter):

| encounter | L1 | L2 | avg rounds | HP lost (of the party) |
|---|---|---|---|---|
| rats_in_the_cellar | 6/6, 20%, 0 downs | 6/6, 15% | 4.3 | 18% |
| goblin_ambush | 6/6, 52%, 0.5 downs | 6/6, 38% | 5.0 | 45% |
| slime_time | 6/6, 10% | 6/6, 12% | 3.8 | 11% |
| fungus_among_us | 6/6, 26% | 6/6, 20% | 5.1 | 23% |
| web_of_lies | 6/6, 24% | 6/6, 24%, 0.3 downs | 5.4 | 24% |
| union_meeting | 6/6, 50%, 1.3 downs | 6/6, 48%, 0.8 downs | 6.8 | 49% |
| open_mic | 6/6, 52%, 0.5 downs | 6/6, 40% | 5.1 | 46% |
| big_flush | 6/6, 17% | 6/6, 28%, 0.2 downs | 4.9 | 22% |
| **normal** | | | **5.0** | **29.7%, 0.23 downs a fight, 0 round-1 downs, won 96/96** |
| mimic_hoard | 6/6, 70%, 0.7 downs | 6/6, 42% | 6.7 | 56% |
| last_call | 6/6, 55% | 6/6, 69%, 0.8 downs | 10.1 | 62% |
| cube_cleanup | 6/6, 38% | 6/6, 33% | 9.7 | 35% |
| **elite** | | | **8.8** | **51.1%, 0.31 downs a fight, won 36/36** |

Real heroes (random 4 of the 16, L1-2, starting kit + 1 skill at L2; probe, 12 fights per encounter): normal fights won
96/96, 4.8 rounds, **20.1%** of the party's HP lost, 0.10 downs a fight (openers: slime_time 6%, rats 9%; hardest: union
35%, open mic 32%, ambush 27%); elites won 36/36, 7.4 rounds, **38.4%**, 0.42 downs (last_call 48%, mimic 34%, cube 33%).
The Last Keg ended at 12-30 of 30 HP (never lost). Landing rates (fired → hit a hero-side unit): bounce 100%, stool 100%,
poke 93%, rock 100%, sling 99%, CHOMP 96%, tongue 93%, nibble 100%, spider bite 100%, engulf 94%, Jiggle Slam 100%,
**Lid Slam 1 of 6** (AutoPlay always steps out of the marked square: the counterplay works; it costs the party tempo).
Attacks of opportunity per fight (fixture sims): heroes 0.1, enemies 0.6 — brutes stay engaged, so heroes rarely get to
punish walkers; enemies punish heroes who walk away.
Brutal (real heroes, L1-2, 8 fights per encounter): normal fights won 59/64, 5.8 rounds, 40% HP, 0.83 downs (union hall
L1 2/4 and open mic L1 2/4 the hardest, one keg lost); elites 24/24, 8.5 rounds, 51%, 0.67 downs.

Tests guard (light balance): no timeouts, every encounter winnable, normal fights won ≥ 50% by the fixture party at
L1-2, ≥ 2.5 rounds on average, the enemies land hits, heroes rarely go down in round 1 (≤ 5% of fights; measured 0),
attacks of opportunity happen both ways, elites cost ≥ 1.2× the normal fights' HP share and last at least as long.

### Tests (`tests/content/enemies_act1.js`, rewritten for v2; 13 suites, ~3200 assertions)

registry (DESIGN bands, explicit init and AI style per enemy, `DD.AI.styleOf` / `isDiver` / `Act.opportunitySlot` on
real units, tooltips "On its turn …", no telegraph wording, only the Lid Slam says "Wind-up", waves in rounds 2-5, no
start-of-fight scripting) · sprites · every skill fired at once (`DD.AI.useNow`: damage == desc, riders, friendly fire,
Inspired +25%) · elite skills (tongue, CHOMP and gold, the Lid Slam wind-up: announced, listed, 3×3, lands at the
Mimic's next turn start, knockback without bump, a stun interrupts it, no CHOMP while the lid is open; throws, stool at
once, Engulf in the real turn flow) · attacks of opportunity with every act 1 skill (preview names and numbers, the throw,
Engulf, the slime / kid / Rep / Spore Bro make none, a cooling-down Engulf makes none) · splits, pops, Hazard Pay at turn
start · AI turns (every enemy acts 3 rounds with only its own skills and no pending action; brutes stick to the knight; the
spider dives the wounded mage through the knight's attack of opportunity but not into a lethal one; the kid shoots from
range and is pinned by the knight; the Spore Bro hugs two heroes; the Rep buffs / memos; the critic reviews a non-Weak hero;
the spider webs out of reach; the Mimic winds up when crowded (the mage steps out free, the cleric eats 7), licks in a
straight line, walks up and CHOMPs, walks around walls; the Bugbear's pit throw, wall-vs-pit attack-of-opportunity pricing,
stool; the Cube digests in place) · HUD previews (splits, cooked slimes, spores, Engulf release, Mimic gold, the move
preview's "provokes" damage == the real attacks of opportunity) · odd states (10 statuses × 12 enemies × 2 rounds; empty /
no target / dead user) · gimmicks in the turn flow (a rat pack arriving bites 2 + 3 + 4, webbed bite 8 after the Root wore
off, tongue / slam / CHOMP range, two-meal Engulf, a grunt pokes the keg, the east-door wave) · encounters on 12 seeds ×
2 difficulties · AutoPlay sims (normal / elite, fixture L1-2, area-honesty watch).
Mutation-checked: the spider as `melee`, the Bugbear ignoring the attack-of-opportunity cost and the Mimic biting while
its lid is open each fail their tests. Isolated runs pass on seeds 1-3 (with the generic `content:` enemy / encounter
suites). Last full `tools/test.sh` (no isolate): 704 suites, 67 failing sections, none in `enemies_act1:` or `content:`,
no swallowed errors; the failures are other areas' v1 tests (bosses act 1-2 / DM calling `DD.AI.plan`, items, kit,
passives, narrative XP, integration unlocks, act 2 sim bands).

### Deviations

- The Mimic makes **no attacks of opportunity while the Lid Slam is wound up** (its `modifyOpportunity` hook): without it,
  "step away" (the wind-up's counterplay) cost the first hero a 9-damage CHOMP, so standing in the slam was usually the
  better choice for a lone hero. Stated in the passive and the skill desc.
- The Bugbear's attack of opportunity is his throw and the Cube's is Engulf (the engine picks the first ready melee skill);
  kept on purpose (it is their joke) and stated in the tooltips. The slime makes none (its Splorch targets itself).
- The spider is the only diver (`skirmisher`): DESIGN lists rogues / flyers / imps / assassins; act 1 has none of those,
  and an ambush predator fits. Rats stay brutes (they are the act's most common enemy; diving rat packs would bring back
  the "they all go for the squishy" complaint).

## Requests

- **RULES / HUD (`js/engine/ai.js` `reachOf`, threat shading)**: per-victim flat bonuses are not in the reach numbers
  (the inspect panel's "can reach: X 2", the threat shading): Pack Tactics (+1 / +2) and the spider's +3 vs webbed prey
  live in hooks. The skill-level `telegraphFlat(unit, intent)` only reaches wind-ups; `reachOf` could ask it with a
  virtual intent per victim. (The attack-of-opportunity numbers are exact since the review: see Review (v2).) The
  throw's bump (+4) is a rider (engine known issue).
- **RULES (`js/data/terrain.js`, review)**: the Poison Puddle surface is `hazard: true` for everyone, so poison-immune
  units (Sewer Slime, Slimelet, Spore Bro, Gelatinous Cube: `resist.poison: 0`) refuse to step in harmless puddles:
  a slime with the only way to a hero through a puddle stands still (probe: slime / slimelet / spore bro / cube all
  stayed put; the rat, who is not immune, rightly too). Sewers and warrens spawn puddles and the Spore Bro's pop makes
  them. Suggest `hazard: function (unit) { return !(unit && unit.resist && unit.resist.poison === 0); }` (the engine
  already supports per-unit hazard tests; `Grid.hazardAt` / `hazardDamage` / paths / `pathRisk` follow).
- **Balance pass**: with real heroes act 1 normal fights cost ~20% of the party's HP and 0.1 downs a fight (elites ~38%,
  0.4 downs). If "someone often goes down" is the target for regular fights, the cheapest per-encounter knobs here are
  the openers (`a1_slime_time` 6%, `a1_rats_in_the_cellar` 9%: one more wave or enemy), Hazard Pay's Block, the keg's
  HP, and the Lid Slam (dodged 5 of 6 times). All numbers are in one place per enemy / encounter.
- **Lead (DESIGN §8 Act 1)**: could name the Cellar Spider as the act's diver and the Mimic's Lid Slam as its one elite
  wind-up.

## Known issues

- Rats walking up one by one bite 2 / 3 / 4 as the pack grows; the threat shading and the inspect panel's reach line
  show 2 per rat (see Requests). The move preview's attack-of-opportunity numbers include the pack (review).
- Poison-immune act 1 enemies avoid poison puddles like everyone else (see Requests, RULES terrain).
- The Lid Slam is almost always dodged by AutoPlay (it steps out of the 3×3 for free); real players pay the AP.
- Fixture parties lose more HP than real kits in normal fights (no stuns / taunts / corgis); elites are close.
- `killAll` / `protect` fights end once the board is clear, so a fast party can skip a later wave (engine rule).
- Engulfed heroes are shown by the status icon (🫧); there is no "inside the cube" sprite. The Mimic chest and the strike
  fund piggy bank are custom canvas art (small at zoom < 0.7).

## Screenshots

`.tmp/enemies-act1-v2/c_web.png` (Web of Lies under AutoPlay, round 1-2: webs, the initiative tracker, the round-2 spider
joining). v1 shots: `.tmp/enemies-act1/`, `.tmp/enemies-act1-review/`. Review: `.tmp/a1rev3/` (below).

## Requests (Nov 3) — content sweep for the user's v2 requests (flyers, barrels, aimed heals)

Act 1 has no flying enemy, so the sweep is about how act 1 treats flying heroes and summons (the engine skips every
floor effect for flyers: DD.Grid.feelsFloor / feelsSurface).
- **Cellar Spider**: "standing in a web" (Sticky Snack's +3, the diver's webbed-prey pick, its wind-up number) checks
  `G().feelsSurface(u, tile.surface)`: a flyer over a web is not in it.
- **Spore Bro**: the pop's spores are a Poison Puddle on the floor (Act.splash, which skips flyers). The passive, the desc
  and the log line say so now ("his spores settle on the floor … flyers float over it"); they used to say "cloud".
- **Bugbear Bouncer**: throwValue never values a pit for a flyer (it sails over; the tiles beyond are scored instead), and
  any volatile object (DD.Act.isVolatile, not only `barrel_explosive`) is the +3 slam. The throw desc adds "(a flyer
  sails over)".
- **Barrels / aimed heals**: no act 1 object explodes (the Strike Fund spills gold), and no act 1 skill is a hero's, so
  nothing is volatile, opted out or revive-capable here. The Leaky Flagon's barrels are the core `barrel_explosive`.
- **Resolved**: the Requests item "Poison Puddle is a hazard for poison-immune units" (the engine's per-unit hazards:
  `hazardStatus: 'poison'`).
- **Tests**: `enemies_act1: v2 requests (Nov 3) — …` (12 assertions: the web bonus for walkers vs flyers, the spores vs a
  flyer, the Bouncer picks the walker into a wall over the flyer by a pit (mutation-checked), a hero's attack sets off a
  barrel and the blast hits the rat next to it).

## Review (v2) — adversarial review of the act 1 v2 work (ADVERSARIAL REVIEWER role)

Scope: this file's v2 conversion (initiative, no telegraphs, attacks of opportunity, reach-aware targeting). Files changed
by the review: `js/data/enemies/act1.js`, `tests/content/enemies_act1.js`, this file. Scratch (Chrome-slot aware):
`.tmp/a1rev3/probe.sh "probe=pN.js&verbose=1"` (p1 brute targets, p2 behaviour census, p3 idle reasons, p5 stuck census,
p6 board clutter, p7 AoO previews / taunt / charm / Engulf / Lid Slam, p8 idle-melee board dumps, p9 poison puddles and
webs), `.tmp/a1rev3/shot.sh` (+ `view.html`: `inspect=<defId>`, `turns=<n>`, `windup=1` opens the Mimic's lid).
An interrupted earlier attempt (`.tmp/a1rev2/`, probes only, no edits) was reused for the census / idle probes.

### Verified (probes + suites; held)

- **desc == effect** for all 20 skills (one level each), the Engulfed status, the Strike Fund and Hazard Pay: every
  number fired at once (`DD.AI.useNow`), in the turn flow and as attacks of opportunity; Taunt (−50% to others),
  Weak (−25%), Inspired (+25%), Bleed, the spore cloud (Poison 2 puddle, cross radius 1) as the descs say.
- **v2 turns**: every enemy acts once on its own turn (move, then one skill); the only pending action after a turn is the
  Mimic's Lid Slam (wound up, lands at its next turn start, then it acts that turn: e.g. slam 7 + CHOMP 9 on a hero who
  stayed; stepping out is free while the lid is open); cooldowns: cd 1 = every other turn (Rock Toss, Bad Review, Spit).
- **Attacks of opportunity**: the right skill per enemy (rat nibble, grunt spear on the leaver's tile only, slimelet,
  spider, critic lute, Mimic CHOMP except while the lid is open, Bugbear throw, Cube Engulf while ready; none for the
  kid, Rep, Spore Bro, slime); Engulf by reaction ends the walk next to the Cube; hero reactions on act 1 movers.
- **Targeting**: taunted elites aim their custom planners at the taunter (Bar Stool / tongue / Spit at a far taunter);
  charmed elites fight their own side; brutes stick when engaged; unengaged brutes pick the hero they can hurt most
  (the knight's armor and the mage's threat send a rat past the nearer knight); the spider dives (never into a lethal
  reaction); the kid stays pinned; Hazard Pay pays once per turn (`s.turn` is per unit turn).
- **Idle turns** (real heroes, 132 fights): rats 68%, slimes 83%, Spore Bros 88% of turns without a skill — traced
  (p3 / p8 board dumps): walking (mov 3-5 across 10×10-11×11 maps), queueing at channel bridges / chokepoints behind
  friends, out of reach; 1-3% "could attack but didn't". Not a planner bug.
- **Visuals**: `g_enemies.png` (all 12 sprites), `i_mimic.png` (inspect panel: tooltip, "Holds the line: … CHOMP ≈9",
  Engaged chip on Marwyn), `w_mimic2.png` (Lid Slam: 3×3 hatched square + "Lid Slam 7" + ⏳ on the tracker),
  `c_web.png` (webs; a rat Rooted by its own team's web — funny, kept).
- Real-hero census (L1-2, normal, 132 fights): won 132/132, 5.3 rounds, 23.3% of party HP lost, 0.12 downs a fight,
  0 round-1 downs; elites 27-32% HP. Enemy friendly fire is rare (grunt 24 HP over 376 turns). Brutal (88 fights):
  won 85/88, 41% HP, 0.51 downs, 0 round-1 downs (Open Mic 5/8: the keg; Union Meeting 1.75 downs).
- Suites: isolated `enemies_act1` + the generic `content:` suites green on seeds 1-3; full `tools/test.sh` after the
  review: 796 suites, 2 failing sections, both `integration:` (v1 hero unlocks / "no XP" step: other areas), none in
  `enemies_act1:` or `content:`, no swallowed "Error in" warnings.

### Fixed (each with a regression assertion; mutation-checked)

1. **Attack-of-opportunity previews lied for packs and webs.** Pack Tactics and the spider's +3 lived only in
   `modifyOutgoingDamage`, so the move preview, the fewest-harm path choice and the AI / AutoPlay walk prices used the
   base bite: three rats around the mage previewed 2 + 2 + 2 and bit 4 + 4 + 4 (+3 Bleed on the step); a spider next to
   a web-standing hero previewed 5 and bit 8. Now both bonuses ride on the reaction itself (`modifyOpportunity` →
   `o.flat`, guarded once per `o`; the damage hooks skip `d.opportunity`). Tests: "rat pack: the preview shows 2 + 2
   packmates…", "three nibbles of 4 … as previewed", "spider: leaving a web costs 5 + 3…" (fail with the hooks removed).
2. **Tooltips said "the nearest hero"** for the rat and the Sewer Slime; the reach-aware targeting does not pick the
   nearest (probe p1: a rat runs past the nearer knight to bite the mage). Now "a hero it can reach (whoever it can hurt
   most)" / "a hero it can reach …, sticking to the one it is next to".
3. **A reaction CHOMP swallowed gold silently** (the log line was gated on `ctx.isIntent`, which reactions don't set).
   It now logs "swallows N gold coins" on attacks of opportunity too (test asserts the line).

### Deviations

- None new. Kept the author's: the Mimic makes no reactions while its lid is open; the Bugbear's reaction is the throw and
  the Cube's is Engulf; the spider is the act's one diver.

### Requests (also listed under Requests above)

- RULES (`terrain.js`): Poison Puddles should not be hazards for poison-immune units (slimes, Spore Bros, the Cube).
- RULES / HUD: per-victim flat bonuses in `reachOf` (threat shading / inspect reach line).
- BALANCE: act 1 normal fights stay mild for real heroes (~23% HP, 0.12 downs); the openers (Slime Time 9%, Rats 13%,
  Big Flush 14%) are the cheapest knobs. Left to the v2 balance pass (DESIGN §5 v2 note; `tests/balance_tests.js` is in
  the manifest but not on disk yet, so a balance phase is mid-flight) rather than retuned in a review.

### Known issues

- Threat shading / the inspect panel's reach line show a rat's 2 and a spider's 5 (Requests).
- The Bugbear's reaction throw previews 7; a wall / friend bump (+4) or a pit is a rider the preview does not price.
- In isolated runs (`isolate=…`) the loader reports `tests/balance_tests.js` missing (another area's file in flight).

-----------------------------------------------------------------------------------------------------------------------

## History (v1, before initiative) — condensed

The v1 roster, encounters and review fixes (honest telegraph numbers via a skill-level `telegraphFlat`, the spider's
webbed-prey bonus, the tongue's no-bump pull, Engulf's "first meal" counter, the Mimic's tracked CHOMP, the keg raid,
the Big Flush waves) are described in this file's git history. Still relevant in v2: the core fix in `DD.AI.intentDmg`
(a skill def may declare a pure `telegraphFlat(unit, intent)` added to a wind-up's number; act 1 keeps it on
`a1_rat_nibble` / `a1_spider_bite` for content that winds them up), the `a1_engulfed` / `a1_strike_fund` defs and the
three handcrafted layouts. Deviations kept from v1: the Spore Bro's toadstool cap is an `overlay` painter; `last_call` is
procedural and `union_meeting` the third layout (every fund reachable down open chair columns); lobbed shots
(`los: false`) and tracked shots with min range 1 are deliberate.
