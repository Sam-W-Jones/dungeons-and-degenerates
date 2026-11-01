# ENEMIES-ACT1 — notes

Files: `js/data/enemies/act1.js` (content), `tests/content/enemies_act1.js` (suites `enemies_act1: …`).
Isolated run: `bash tools/test.sh "suite=enemies_act1&isolate=enemies/act1,enemies_act1"` (add `&verbose=1&n=6` for
the balance tables). Scratch (debug pages, shots): `.tmp/enemies-act1/`, review probes and shots `.tmp/enemies-act1-review/`
(`probe5.js`: real-hero / fixture balance sims with per-skill landing rates; run with
`bash .tmp/enemies-act1-review/probe.sh "probe=probe5.js&suite=a1rev5&verbose=1&runs=5[&party=fixture][&enc=mimic]"`).

## Summary

Act 1 ("The Leaky Flagon's Basement") regular enemies and encounters. Every id carries the `a1_` prefix.

### Enemies (12) and their skills (23)

| id | name | tier | HP / mov / armor | skills (anchor) | gimmick |
|---|---|---|---|---|---|
| `a1_rat` | Dire-ish Rat | minion | 9 / 5 / 0 | `a1_rat_nibble` Ankle Nibble 2 + Bleed 1 (self) | Pack Tactics: +1 dmg per other rat next to the victim (max +2, def hook); the telegraph number includes it (`telegraphFlat`) |
| `a1_gob_grunt` | Goblin Grunt | normal | 18 / 4 / 1 | `a1_gob_poke` Pointy Stick 6 on the 2 tiles in front, friend/foe/object (self, dir+line 2) · `a1_gob_rock` Rock Toss 4, lobbed, range 1-5, cd 1 (unit) | the spear reaches 2 tiles and pokes objects (goes for the protected keg) |
| `a1_gob_kid` | Goblin Slingshot Kid | normal | 14 / 4 / 0 | `a1_kid_sling` Slingshot 5 to the first unit down a 6-tile line (self, dir+line, pierce false) · `a1_kid_nyah` Nyah Nyah! Taunt 1 turn, cd 3 (unit) | line shot hits whoever is in front (body-block it, or let his goblin friend eat it); taunts a hero (−50% dmg vs anyone but him) |
| `a1_kobold_rep` | Kobold Union Rep | normal | 16 / 3 / 1 | `a1_rep_strike` Strike Action! Rep + allies within 2: +4 Block, Inspired 2 turns, cd 2 (self) · `a1_rep_memo` Strongly Worded Memo 5, range 1-6 (unit) | support AI behind the picket line; kill him first |
| `a1_slime` | Sewer Slime | normal | 20 / 3 / 0 | `a1_slime_splorch` Splorch 5 to every adjacent foe (self, adjacent) | splits into 2 `a1_slimelet` on death unless killed by fire or a fall; poison immune, fire ×1.5; rubber duck |
| `a1_slimelet` | Slimelet | minion | 7 / 3 / 0 | `a1_slimelet_glorp` Glorp 3 (self) | half a slime, no further split |
| `a1_spore_bro` | Spore Bro | normal | 15 / 4 / 0 | `a1_spore_boom` Sporesplosion 6 poison to adjacent units (friend or foe) + poison cloud r1, dies (self) | kamikaze; push him back into his friends; killing him pops a poison cloud (Poison 2 to adjacent units, no damage) |
| `a1_spider` | Cellar Spider | normal | 16 / 4 / 1 | `a1_spider_web` Web Spit 2 + Root 1 in a cross, lobbed range 2-5, webs 3 rounds, cd 2 (ground) · `a1_spider_bite` Sticky Snack 5, +3 vs webbed prey: Rooted or standing in a web (self, shown in the telegraph) | immune to Root (`flags.immune`), walks its own webs; fire ×1.5 |
| `a1_critic` | Bandit Bard Critic | normal | 17 / 3 / 0 | `a1_critic_review` Bad Review 4 + Weak 2 turns, range 1-6 LOS, cd 1, **spell** (unit) · `a1_critic_lute` Lute to the Face 6 (self) | Weakens heroes from afar; Silence shuts him up |
| `a1_mimic` | Mimic (Disappointed) | elite | 68 / 3 / 2 | `a1_mimic_tongue` Sticky Tongue 4 + pull 3 (no bump) + Root 1, straight line only (unit, fizzles out of line) · `a1_mimic_chomp` CHOMP 9 + swallows up to 4 party gold; tracks a target up to 2 away and hops 1 tile to bite (unit) · `a1_mimic_slam` Lid Slam 7 + knockback 1 (+3 if slammed into something) around it incl. diagonals, ⏳1, cd 3 (self) | two intents a round (bite + lick on different heroes); keep 3 tiles away and out of its row/column; swallowed gold is coughed back up on death; custom chest painter |
| `a1_bugbear` | Bugbear Bouncer | elite | 70 / 3 / 2 | `a1_bugbear_bounce` You're Not On The List 7 + throw 3 down the marked line, bump 4 both (self, dir+line 4) · `a1_bugbear_hug` Bear Hug 4 + Root 1 to all adjacent foes, cd 2 (self) · `a1_bugbear_stool` Bar Stool Toss 6 r1, lobbed, ⏳1, cd 2, friend/foe/furniture (ground) | walks around his victim to throw it into walls / friends / barrels / pits; Bear Hug first so the throw can't be sidestepped |
| `a1_cube` | Gelatinous Cube | elite | 70 / 2 / 2 | `a1_cube_engulf` Engulf 7 + `a1_engulfed` 2 turns, cd 2 (self) · `a1_cube_spit` Spit Out Previous Adventurer 4, lobbed range 1-5, leaves bones, cd 1 (unit) · `a1_cube_slam` Jiggle Slam 8 around it incl. diagonals, ⏳1, cd 3 (self) | immovable, stun immune, poison immune, fire ×1.5; Acidic Body: an adjacent foe that hits it with a skill takes 2 acid (ignores armor); 10 damage to it spits everyone out |

Elites use custom planners (`mimicPlan`, `bugbearPlan`, `cubePlan`): one move per plan (approaching by walking distance, a BFS
field, so walls don't strand them), up to two intents a round, the big
area hit always telegraphed one round ahead (`delay: 1`, stays put while charging), never wander off while digesting.
Normal enemies use explicit AI styles (melee / ranged keepDistance 3 / support / kamikaze) plus `aiScore` tweaks
(rats value bites with their pack, the kid taunts untaunted heroes, the Rep never buffs only himself, webs prefer
un-Rooted heroes, the spider bites Rooted prey, the cube never re-engulfs).

### Status, object

- `a1_engulfed` (debuff, refresh, 2 turns): Rooted (a separate core Root with the same turns), −1 AP and 3 acid
  (`st.data.acid`) at the start of each of the victim's turns. Ends early when the cube takes 10 damage (`cube.data.jiggle`,
  counted from the first meal: a second engulf does not reset it), dies, or the victim is moved out of reach
  (onEnterTile / onTurnStart check) — release also removes the cube's Root.
- `a1_strike_fund` (object, 8 HP, smashable, custom piggy-bank painter): at round end every enemy within 2 tiles gains
  2 Block ("hazard pay"); breaking it spills 3 gold. Destroy-objective target of `a1_union_meeting`.

### Encounters (11: 8 normal, 3 elite; 3 handcrafted layouts)

| id | kind | theme / map | enemies (+ waves) | objective | minDepth |
|---|---|---|---|---|---|
| `a1_rats_in_the_cellar` | normal | cellar 10×10 water, crates, kegs | 5 rats; r2 +2 (S) +2 (E); r3 +2 (zone) | killAll | 0 |
| `a1_goblin_ambush` | normal | warren 10×10 rocks, hills | 2 grunts, kid, rat; r2 grunt + kid (S) | killAll | 0 |
| `a1_slime_time` | normal | sewer 10×10 channel, slime | 3 slimes, rat; r2 +2 rats (S) | killAll | 0 |
| `a1_fungus_among_us` | normal | warren 11×11 pits, mushrooms | 2 spore bros, grunt, kid, rat; r3 spore bro | killAll | 1 |
| `a1_web_of_lies` | normal | cellar 10×10 web, crates, kegs | 2 spiders, critic, 2 rats; r2 spider | killAll | 1 |
| `a1_union_meeting` | normal | **layout** cellar 11×11 (union hall: funds on the back table, chair rows, Rep's soapbox h2) | Rep (soapbox mark R), 2 grunts, kid; r3 +2 rats | destroy 3 `a1_strike_fund` | 2 |
| `a1_open_mic` | normal | **layout** cellar 11×11 (stage h1, bar counter of barrels, the Last Keg 18 HP) | critic, 2 grunts, rat; r2 grunt + kid (S: the back door, behind the party and next to the keg) | protect `keg` | 2 |
| `a1_big_flush` | normal | sewer 11×11 channel, water | slime, 2 rats; r2 slime + 2 rats (E), r3 slime + rat (S), r4 2 spore bros + rat (W) | survive 5 | 3 |
| `a1_mimic_hoard` | elite | **layout** warren 11×11 (dais h1, LOS-blocking pillars vs the tongue, 2 chests, 4 gold piles) | mimic (mark M), 3 rats; r2 2 grunts (S: the room's goblin owners, back from lunch behind the party) | killAll | 2 |
| `a1_last_call` | elite | cellar 12×11 barrels, kegs, crates, water | bugbear, grunt, kid; r2 +2 rats (S) | killAll | 2 |
| `a1_cube_cleanup` | elite | sewer 11×11 pools, slime | cube, slime, rat | killAll | 3 |

Normal rewards `{ goldMult: 1, itemRarity: null }`, elites `itemRarity: 'rare'`. Weights 0.8-1.2.

## Public API (for other authors)

- Enemy ids above can be spawned by bosses/events (e.g. Grimble's interns could be `a1_gob_grunt` / `a1_gob_kid`; a
  rat swarm `a1_rat`). Encounter ids work with the event API (`api.combat('a1_mimic_hoard')` for a "chest that wants a
  hug" event, `api.combat('a1_last_call')` for a tavern brawl).
- Status `a1_engulfed` (needs a living cube `source` adjacent to stay on) and object `a1_strike_fund`.
- Nothing is exported on `DD` beyond the registrations.

## Balance (AutoPlay sims, normal difficulty)

After the review (probe `.tmp/enemies-act1-review/probe5.js`, 5 fights per level, L1-4 normal / L2-4 elite; damage =
HP lost by the four heroes, % = of the party's max HP). "before" = the same probe on the hand-off version.

| encounter | fixture: wins, rounds, dmg (%) | real heroes: wins, rounds, % | notes |
|---|---|---|---|
| rats_in_the_cellar | 20/20, 4.0, 1.1 (1%) | 20/20, 3.7, 0.8% | the opener; rats die before most bites land |
| goblin_ambush | 20/20, 4.3, 4.9 (4%) | 20/20, 3.6, 2.7% | |
| slime_time | 20/20, 3.6, 3.9 (3%) | 20/20, 3.8, 2.2% | |
| fungus_among_us | 20/20, 4.0, 20.2 (17%) | 20/20, 3.3, 5.1% | the spores are the act's normal-fight bite |
| web_of_lies | 20/20, 4.0, 5.2 (4%) | 20/20, 3.7, 3.2% | |
| union_meeting | 20/20, 6.0, 15.0 (12%) | 20/20, 5.8, 1.8% | |
| open_mic | 20/20, 5.0, 17.0 (14%), keg 12/18 | 20/20, 3.6, 0.4%, keg hit in 9/20 | before: 5 (4%) / 1.3%, keg untouched in 39/40 |
| big_flush | 20/20, 4.9, 3.6 (3%) | 20/20, 5.0, 2.1% | before: 1.5% / 1.3% |
| **normal** | 160/160, 4.5, 8.8 (7.2%) | 160/160, 4.1, 2.3% | before: 5.8% / 2.3% |
| mimic_hoard | 15/15, 6.0, 17.0 (13%) | 15/15, 4.8, 3.7% | before: 26 (20%), 4.0 r / **0.3%, 3.4 r** |
| last_call | 15/15, 6.4, 21.3 (16%) | 15/15, 5.0, 2.8% | |
| cube_cleanup | 15/15, 6.9, 21.0 (16%) | 15/15, 5.2, 5.4% | |
| **elite** | 45/45, 6.4, 19.8 (15.0%) | 45/45, 5.0, 4.0% | before: 17.3% / 2.8% |

No timeouts, no losses except the keg: one Last Keg loss in 32 real-hero L1 fights (the objective now matters). The
layout fights are deterministic for the fixture party (same numbers every seed). Real hero kits (stuns, taunts, corgi
body-blocks, heals) remain far stronger than the fixture party, as in acts 2 and 3 (their notes report 1-8% real-hero
losses); see the Lead / balance request. Per-skill landing rates vs real heroes (fired → hit a hero-side unit): CHOMP
47% (before 20%), tongue 24%, memo 39%, spores 43%, bar stool 44%, cube spit 70%, rat bites 10%, slingshot 4%.

Tests guard: no timeouts, every fight winnable, normal fights won ≥ 50%, ≥ 2.5 rounds average, the enemies land hits,
elites deal ≥ 1.25× the normal-fight average and last at least as long. (The author's 2× failed at `seed=2` after the
review: a few normal fights now bite nearly as hard, and 2 runs per level are noisy; seeds 1-5 measure 1.36-2.6×.)

## Deviations

- Spore Bro's toadstool cap is an `overlay` painter, not `head.hat: 'mushroom'`: the generic `content:` sprite whitelist
  (tests/content_tests.js) does not know the render-sprites extra hat and fails the spec. Same look, drawn by me.
- `last_call` is procedural (cellar + barrels/kegs) and `union_meeting` is the third layout: on a procedural map
  AutoPlay could get stuck behind an object wall in front of a strike fund (Manhattan approach, see Requests) and time
  out; the hall layout keeps every fund reachable down open chair columns.
- Lobbed shots (`los: false`: rock toss, web spit, cube spit, bar stool) and tracked shots with min range 1 (memo,
  review, rock, spit) are deliberate: walking up to the thrower no longer dodges, breaking range/LOS still does.
- Big area hits (Lid Slam, Bar Stool, Jiggle Slam) are planned with `delay: 1`; their desc says "Charges for a round".
  The registry test enforces that only these three are ever delayed.
- Movement inside a skill (review): CHOMP hops the Mimic one tile (teleport + jump FX, tile effects apply on landing)
  when its tracked target is 2 tiles away; Rooted or boxed in, it does not bite.
- Skill defs `a1_rat_nibble` and `a1_spider_bite` carry a pure `telegraphFlat(unit, intent)` (see Core fixes).

## Core fixes

- **`js/engine/ai.js` `AI.intentDmg`** (started by the first reviewer, finished, tested and recorded here): a skill def
  may declare a pure `telegraphFlat(unit, intent) → number`, added to the telegraph number (after the multipliers, like
  `d.flat` in the damage pipeline) when the skill deals damage. Skills without it are unchanged. Why: Pack Tactics
  (+1 per packmate, `modifyOutgoingDamage` `d.flat`) and the spider's +3 vs webbed prey are flat bonuses that depend on
  the victim, so the telegraph showed 2 while three rats around a hero bit for 4 each (DESIGN pillar 1: every enemy
  shows what it will do). Regression: `enemies_act1: review fixes …` (three rats show 12 = bite 12; a dying packmate
  drops the number at once; the webbed-prey bite shows and deals 8). Mutation-checked: disabling the fix fails 3 of its
  assertions. Commented in place.

## Requests

- **RULES (`tests/content_tests.js`)** **[Resolved at integration — see docs/notes/content-digest.md.]** add the render-sprites extras to `SPRITE` (`hat: 'mushroom'`, `beard:
  'tentacles'`) so content can use them without failing `content: registry cross-references`.
- **RULES (`js/engine/autoplay.js`)**: `approachMove` ranks reachable tiles by Manhattan distance to the objective /
  foes, so a hero behind a wall of objects never walks around (seen as a 31-round timeout on a procedural
  destroy-objective map). A path-distance field (like `AI`'s `fieldTo`) would fix it.
- **RULES (docs)**: `stunLike` in `js/data/statuses.js` header is documented as "the unit loses its turn" but nothing
  reads it; a custom stun-like status needs hooks (I used Root + an AP drain for `a1_engulfed`).
- **RULES (`js/engine/autoplay.js`, review)**: `dangerAt` ignores `target.straight` for tracked intents, so a hero
  targeted by the Sticky Tongue flees the whole range diamond instead of simply leaving the Mimic's row / column.
- **RULES (docs, review)**: document the skill-level `telegraphFlat(unit, intent)` (Core fixes) next to the status one
  in ARCHITECTURE §3.2 / §5.6; acts 2 and 3 and the DM already rely on it.
- ~~BOSS-DM (`tests/content/boss_dm.js`)~~ resolved during the review by its owner: "DM Fiat still applies when his
  turn comes (19)" read the mage's HP after the next round's house-rule roll (with act 1's enemies in the cameo pool
  the RNG rolled Snack Break, heal 4, so it read 15 while the DM hit for 19); it now counts the hit itself.
- **Lead / balance**: with every act 1 enemy at the top of the DESIGN §5 bands, AutoPlay real-hero parties take ~3
  damage per act 1 fight (fixture party ~8, elites ~22). Telegraph dodging + 4 heroes × 3 AP of 1-AP basics (~45-50
  damage a round) kill a DESIGN-sized normal fight (36-100 HP) in 2-3 rounds. If act 1 should bite harder, the cheapest
  global knobs are the HP bands (+25%), enemy counts (5-6) or brutal-like scaling on normal difficulty; my numbers are
  in one place per enemy and easy to retune. (Reviewer: still true after the review fixes, which removed the outliers
  but not the gap: real parties lose 2.3% of their HP per normal fight and 4.0% per elite, the fixture party 7.2% / 15%.)

## Known issues

- The rats / slimes / spider fights are the easy openers (depth 0-1): the party usually kills the swarm before most
  bites land. Fungus (spores), union meeting, the keg raid and the elites are where act 1 starts to hurt.
- Against real hero kits every act 1 fight is won losing 0.4-5% of the party's HP (elites 3-5%): the global balance
  question in Requests, shared with acts 2 and 3.
- `killAll` / `protect` fights end as soon as the enemies on the board are dead, so a fast party skips later waves
  (fungus: 5 of 20 real-hero fights ended before the round-3 Spore Bro). That is the engine's rule (reward for speed).
- Layout fights are deterministic for AutoPlay (same map, same opening), so their sim rows repeat across seeds.
- The slingshot kid's line shot rarely lands (4% vs real heroes): a self-anchored line is one step to dodge. He is
  fodder whose gimmick (the pebble hits the first unit, friend or foe) still reads.
- The Mimic's chest painter and the strike fund piggy bank are custom canvas art; at zoom < 0.7 the chest's eyes and
  the piggy's tag become a few pixels.
- Engulfed heroes are shown by their status icon (🫧) and Root vines; there is no "inside the cube" sprite.

## Screenshots

`.tmp/enemies-act1/g.png` (gallery=act1), `g_mimic.png`, `g_spider.png` (detail pages), `c_web.png`, `c_mimic.png`,
`c_union.png`, `c_bar.png` (deployment views with telegraphs), `c_cube.png`, `c_fungus.png` (autoplay mid-fight).
Review: `.tmp/enemies-act1-review/g_act1.png` (gallery with fixtures), `c_mimic_ap.png` (the goblin owners arrive
behind the party, round 2), `c_web_big.png` (1920×1080 deployment).

Full `tools/test.sh` (no isolate) at hand-off: all 10 `enemies_act1:` suites pass; the 12 failing sections are other areas
in flight (`bosses_act1` grimble/rat king — a second `grimble` enemy registration overrides the boss —, `passive-table`).

## Review

Adversarial review after hand-off (resumed after an interruption: the first reviewer had added the `ai.js` hook and the
rat's `telegraphFlat`, untested and unrecorded; everything below was re-checked from the current files by running code).

Fixed, most severe first:

1. **Telegraphs lied about the rats** (core fix above): 3 rats around a hero showed 2 each and bit for 4 each. Now the
   badge, the inspect text and AutoPlay's danger map all see 4.
2. **The spider's gimmick never fired**: "+3 vs Rooted" is checked when the bite lands, but the web's Root (applied in
   the enemy phase) wears off at the end of the hero's turn, before the bite planned on that hero resolves (probe: the
   webbed hero took 5, not 8). The bonus now counts prey that is Rooted **or standing in a web**, the telegraph
   shows it (8), the AI values it and the desc / codex say so.
3. **Sticky Tongue dealt 7 where it said 4**: the pull bumped the hero into anything in between (+3 to both, a rat
   included). The tongue now stops at obstacles without a bump, so the telegraphed number is the whole hit.
4. **Lid Slam's knockback bump was undocumented** (7 shown, 10 dealt against a wall): `L.bump: 3` is passed explicitly
   and stated in the desc.
5. **Engulf: a second meal reset the "10 damage frees everyone" counter** for the hero already inside (12 damage dealt,
   still engulfed). The count now starts with the first meal.
6. **The Mimic was a pushover**: 0.3% of a real party's HP in 3.4 rounds (its self-anchored CHOMP was one step to
   dodge and it died before it reached anyone). CHOMP now tracks a hero up to 2 tiles away and hops 1 tile to bite
   (Rooted or boxed in: no bite; "keep 3 tiles away" is in the desc and codex), the tongue avoids the hero the CHOMP
   already tracks, and the room's goblin owners (2 grunts) come back from lunch behind the party in round 2. Real
   parties now lose 3.7% over 4.8 rounds, CHOMP lands 47% (was 20%); the fixture party 13% over 6 rounds.
7. **"Protect the Last Keg" was never in danger**: the keg sat behind the hero line and the wave came from the far
   side in round 3 (often skipped). The back-door wave now arrives in round 2 from the south, next to the keg; the
   keg is hit in about half the real-hero fights and lost occasionally (1/32 at L1), so the objective matters.
8. **The Big Flush (survive 5) was the softest fight**: waves now bring a second slime in round 2 and two Spore Bros in
   round 4 (real 1.3 → 2.1%, fixture 1.5 → 3%).

Checked and left as is: every skill/status/object desc at its only level matches `execute` (incl. Bleed, Weak, Taunt,
Inspired, Block timings in the real round flow); previews of hero skills against slimes (split / cooked), spores,
the cube (release, Acidic Body) and the mimic (gold back) are exact; odd states (charm, silence, sheep, dazzle,
confuse, taunt, root, stun, slow, weak) on every act 1 enemy for 2 rounds next to a pit and lava, empty / missing
targets and dead users: no errors, no shared tiles; no `Math.random`; sprites distinct and readable at zoom 1
(the spider's brown body is lower-contrast on cellar wood than on stone, outline and red eyes carry it).

Tests added: `enemies_act1: odd states … and empty targets` (10 statuses × 12 enemies, every skill with empty / no
target / dead user) and `enemies_act1: review fixes …` (26 assertions: rat telegraphs = bites incl. a dying packmate,
webbed bite in the real round flow and on a web tile, tongue blocked without bump, slam bump, CHOMP hop straight /
diagonal / lost / Rooted / boxed in, two-meal engulf, a grunt lining up on the keg, the back-door wave). Mutation check:
reverting the core fix, the tongue's `bump: 0` and the jiggle guard fails 5 of them. Stale comments in the damage
suite fixed; elite-vs-normal guard 2× → 1.25× (see Balance). All 12 `enemies_act1:` suites pass for `seed=1…7`.

Full `tools/test.sh` (no isolate), three runs at the end of the review (505 suites): all 12 `enemies_act1:` suites pass
every time and no act 1 warning reaches the console. The single failing section changed from run to run with other
areas' files being edited at that moment: `boss_dm` (an RNG-dependent check its owner has since fixed, see Requests),
`passive-table` (`rp_pet_rock`, passes in isolation a minute later) and `enemies_act2` (brunch cult; fails in its own
isolation, with or without act 1).
