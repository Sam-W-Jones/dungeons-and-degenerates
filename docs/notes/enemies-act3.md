# ENEMIES — ACT 3 notes

Files: `js/data/enemies/act3.js` (content), `tests/content/enemies_act3.js` (20 suites `enemies_act3: …` + 2 opt-in
diagnostics). Run: `bash tools/test.sh "suite=enemies_act3&isolate=enemies/act3,enemies_act3"` (add `&verbose=1&sims=24`
for bigger sims; `&a3real=1&verbose=1&sims=N` without `isolate` = random real-hero parties; `&a3debug=<encounter>&bseed=N
&blevel=5[&bparty=a,b,c,d]&verbose=1` = one battle's map + condensed log). Scratch probes of the v2 / AoO pass:
`.tmp/enemies-act3-aoo/` (`trial.sh <name> "<overrides>" [sims]` = the sim table for both parties with damage sources and
attacks of opportunity, `trial1.sh` for chosen encounters, `ovr.js` runtime overrides used for the tuning trials,
`look.sh` + `look.html` = a screenshot with an enemy's inspect panel open, `look_lawyer.png`, `look_dk.png`).

## v2 — initiative, no telegraphs, attacks of opportunity, reach-aware targeting (this pass)

Act 3 "Behind the DM Screen": 9 regular enemies, 3 elites, 27 enemy skills, 4 statuses, 2 objects, 11 encounters
(8 normal, 3 elite). Every id is `a3_`. An earlier, interrupted v2 attempt had already converted the turn model (all its
suites were green when this pass started); this pass adopted the attacks-of-opportunity engine and the new targeting,
put every enemy's behaviour into its inspect panel, simplified two skills and did the light balance.

**Turn model** (unchanged from the earlier v2 attempt, verified): every enemy decides and acts at once on its initiative
turn (move first, then act). No telegraphs and no delayed intents for normal enemies; each elite has exactly one
announced wind-up for its signature move (dragon: Hoard Breath, Death Knight: Villain Monologue, Pit Fiend: Hostile
Audit), landing at the start of its next turn, interrupted by stun-likes (and the monologue also by silence or 20+
damage). The Eyeball's Unpaid Overtime Beam fires at once and the eyeball then passes out for its next turn. Durations
count the owner's own turns (`turns: 1` debuffs from an enemy's turn cover the hero's next turn); no combat-start Block
(the dragon basks at the end of its own turns; Shield Wall is a skill); waves / survive / destroy / protect objectives
run per round under initiative (suite "objectives and waves").

**Targeting and attacks of opportunity** (DESIGN §8 "Targeting", rules.md "v2 — attacks of opportunity"):

| Enemy | init | style (who it picks) | its attack of opportunity | inspect-panel line (`def.passive`) |
|---|---|---|---|---|
| `a3_imp_influencer` minion 18 | +3 | **assassin** (the act's diver: weakest hero it can reach); blinks ≈3 tiles from the heroes, `flags.noProvoke` | none | Blink |
| `a3_hell_hound` 34 | +2 | melee (sticks to the hero next to it) | Chew Toy (9) | Off the Leash |
| `a3_mind_flayer` 36 | +1 | ranged, keeps 2 | none | Life Coaching |
| `a3_eyeball_intern` 30 | +2 | ranged, keeps 3 | none | Unpaid Overtime |
| `a3_rules_lawyer` 34 | 0 | melee | Motion to Dismiss (8 + push 2: the walk ends there) | Rules As Written |
| `a3_nat1_golem` 40 | −2 | melee (custom planner) | Roll to Hit (d20: 9, 20 → 18, 1 → hits itself + Stunned) | Rolls for Everything |
| `a3_kobold_shield` minion 16 | +1 | melee | Pointy Stick (7) | Shield Wall |
| `a3_succubus_coach` 32 | 0 | ranged, keeps 2 | none | Dating Coach |
| `a3_backup_dancer` minion 14 | +2 | melee | none (the shimmy-kick reaches 2) | Jazz Hands |
| `a3_red_dragon` elite 145 | +1 | melee (custom; guards its hoard; Thieves hunted anywhere) | none (flies, swoops) | Hoarder |
| `a3_death_knight` elite 135 | −1 | melee (custom) | Overly Dramatic Swing (14) | Very Dramatic |
| `a3_pit_fiend` elite 150 | +1 | melee (custom; immovable) | Fiscal Smackdown (15 + 1 Debt) | Infernal Debt |

Each passive line says what it does on its turn, how it picks its target ("sticks to", "keeps N tiles from the heroes",
"the weakest") and whether walking away from it provokes ("(attack of opportunity)"); the codex `desc` sums it up for the
hover tooltip. Passive descs read the skills' numbers (`lvl(id)`), so they can't drift. The suite "targeting styles,
attacks of opportunity and what the inspect panel says" checks all of it per enemy.

**Planners** (custom: imp, golem, dragon, Death Knight, fiend; shared helpers `plan` / `approach` / `bestWithin`):
every walk prices the attacks of opportunity it would provoke (`api.aooCost`; a lethal one rules the tile out) — the
custom `approach`, `bestWithin` (the dragon's leash), `goHome` (the dragon settling on its gold) and `monologueSpot`;
`plan` uses `api.bestAttack` (the engine's reach-aware scoring) and re-aims with `noMove` when a reaction cut its walk
short. `bestWithin` scores a virtually placed unit, which makes the engine measure "engaged" from that spot:
`engagedFix` re-bases the focus bonus on the tile the turn began on (`DD.AI.targetValue(…, 0, style, origin)`), so the
hoard-bound dragon still sticks to the hero next to it. Leaps (Pounce, Greedy Bite's swoop, Kick Ball Change), blinks
and the chain's pull never provoke (rule). Mutation-checked: without `engagedFix`, without the AoO cost in
`monologueSpot` or in `approach`, the targeting suite fails.

**Simplified (DESIGN §6 "Simplicity")**
- `a3_golem_roll` Roll to Hit: one roll, three outcomes — 9 to each foe in the 3 tiles in front, a 20 deals 18, a 1 hits
  itself for 10 and Stuns it (was 1 / 2-9 = 6 / 10-19 = 11 / 20 = 22: the same 9 a swing on average; `L.dmg` is now the
  real number the HUD, reach shading and attacks of opportunity show).
- `a3_dk_cleave` Overly Dramatic Swing: "a sweeping arc at the 3 tiles in front of him: 14 to each foe" ('dir' + row,
  tagged melee) instead of "a target up to 2 tiles away and its sides" — he now holds the line (it is his attack of
  opportunity), and the yank-and-swing swings when the chain lands the hero next to him (the chain's `aiScore` prefers a
  hero its 3-tile pull can bring adjacent).
- Every other skill already reads as one verb + at most one rider (damage + Mark / Charm / Confused / Silence / push /
  pull / Debt / a burning floor); the elites keep their one mini-system each (hoard + Thief, monologue interrupt, Debt).

**Light balance** (the v2 balance pass comes next; "nothing absurd"): imps are the act's most common enemy and, as
divers, focus the weakest hero — Go Live! 6 fire + Mark 3 (was 7 + 4), Hot Take 7 (was 8); Piercing Stare 9 (was 10);
Itemized Invoice cooldown 2 (was 1); Spirit Fingers −1 per hit (was −2); Influencer Collab 2 imps (was 3); Intern
Orientation's wave 1 imp (was 2); Trial by Combat without its imp (round-1 downs); Tax Season = the fiend + 2 imps, + 1
imp at round 4 (the Rules Lawyer and the second late imp are gone). Trials behind those picks (24-36 seeds each,
`.tmp/enemies-act3-aoo/ovr.js`): for Tax Season the invoice at 11 damage, Debt 1 instead of 2, the fiend at 140 HP or the
smack at 14 moved its win rate less than the cooldown and the roster; elite HP at the band's low end (dragon 130, Death
Knight 125) or hoard Block 2 per pile (max 10) shortened the long elite fights by only ~1 round, so they are left to the
balance pass (Requests).

### Balance (AutoPlay sims, this pass)

24 seeds per encounter and party, levels 4 / 5 / 6 (v2: one level-up per won fight, about level 5 at the DM). Fixture =
`test_knight, test_cleric, test_mage, test_rogue` with 2 pool skills, (level − 3) skills at II (the suite's party; it
hits small, so it suffers most from Block and armor). Real = 4 random real heroes from the 15 registered at the time
(Valdris and Pebbles mid-flight, Hjalmar's file not landed yet), same skill rule, full content. HP = share of the
party's HP lost; downs counted per fight (a hero can go down twice).

| Encounter | Fixture: won · rounds · HP lost · downs | Real: won · rounds · HP lost · downs |
|---|---|---|
| hellhound_walkies | 22/24 · 7.0 · 83% · 1.9 | 22/24 · 6.5 · 48% · 0.9 |
| influencer_collab | 22/24 · 7.1 · 89% · 2.1 | 23/24 · 6.5 · 64% · 1.7 |
| self_help_seminar (survive 5) | 24/24 · 5.0 · 63% · 1.5 | 24/24 · 5.0 · 59% · 1.5 |
| trial_by_combat | 22/24 · 8.3 · 102% · 2.1 | 20/24 · 8.0 · 81% · 2.8 |
| cursed_dice_night | 22/24 · 10.3 · 107% · 2.3 | 23/24 · 9.5 · 73% · 1.8 |
| kobold_pep_rally (destroy 3) | 18/24 · 12.5 · 99% · 2.8 | 23/24 · 8.7 · 56% · 1.5 |
| snack_heist (protect, bowl −30 / −18 of 48) | 19/24 · 6.7 · 52% · 0.8 | 24/24 · 6.2 · 32% · 0.5 |
| intern_orientation | 15/24 · 10.2 · 106% · 2.8 | 19/24 · 9.3 · 80% · 2.5 |
| **hoarders_lair** (elite) | 22/24 · 16.4 · 112% · 3.2 (1 timeout) | 21/24 · 13.5 · 68% · 2.3 |
| **very_dramatic_entrance** (elite) | 22/24 · 13.3 · 100% · 3.0 | 23/24 · 10.6 · 64% · 2.2 |
| **tax_season** (elite) | 18/24 · 11.9 · 141% · 5.6 | 15/24 · 10.4 · 99% · 4.6 |
| **total** | 226/264 (normal 85%, elite 86%) | 237/264 (normal 93%, elite 82%) |

Before this pass (same harness, 12 seeds): fixture 83/132 (Tax Season 1/12, Intern Orientation 3/12, Influencer Collab
5/12), real 94/132 (Tax Season 2/12, Intern Orientation 3/12). Biggest damage sources now (real, per fight): the
eyeballs' Stare + Overtime (Intern Orientation 109), the fiend (invoice 48, smack 36 + 5 as reactions, Debt 26), the
dragon (bite 50, tail 36), the Death Knight's swing (54 + 4 as reactions), the golems' dice (52). Attacks of opportunity
in 264 real fights: by enemies 99 (hound 37, lawyer 22, kobold 16, golem 10, fiend 8, Death Knight 6), by heroes 130
(the raven, corgis, Marwyn, Marbles, Sparrow, Valdris…). Round-1 downs (focus fire before the party acts; no single
enemy can one-shot, see the suite): at most 1 fight in 24 per encounter at levels 4-6; at level 4 alone, real heroes:
Tax Season 3/24, Cursed Dice Night 2/24 — and Trial by Combat 4/24 before its imp went (0/24 after: the imp acted first,
Marked the weakest hero and the bench's high ground did the rest). The suites' own sims (3 seeds) add soft bands on the
totals: normal fights ≥ 60% won, elites ≥ a third, and the party loses ≥ 25% of its HP (fights must hurt).

### Public API (for other authors)

- Statuses: `a3_thief` (debuff, permanent; dragons deal +4 to it), `a3_monologue` (Death Knight helper; self-cleaning if
  its wind-up is gone), `a3_debt` (stacking debuff, max 5; ticks at the owner's turn start, then grows; reduced by skill
  hits on `a3_pit_fiend`), `a3_unshakeable` (buff; meaning enforced by the elite defs' hooks, below).
- Objects: `a3_hoard_pile` (non-blocking; `data.gold`, default 4-8; AutoPlay hint 10 near a living dragon, 3
  otherwise; pocketing brands the walker a Thief), `a3_snack_bowl` (48 HP, blocks movement; a protect target).
- Every act-3 enemy is safe to `DD.Act.spawn` anywhere (DM cameos): the dragon counts piles on any map, the Death
  Knight's intermission and the fiend's Debt work in any fight; spawned units roll initiative on arrival.
- Tenacity pattern (copyable): defs whose hooks cancel stun-likes in `modifyStatus` while `a3_unshakeable` is present
  and add it (2 turns) in `onStatusApplied` when a stun-like lands; a stun still interrupts that elite's wind-up.
- `engagedFix(unit, b, spot, origin, style)` (local helper) is the pattern for any custom planner that scores spots by
  placing the unit virtually and calling `DD.AI.bestAttack(…, { noMove: true })`.

## Deviations

- The Death Knight's swing lost its 2-tile reach (now the 3 tiles in front of him) so that he makes attacks of
  opportunity like the other brutes; the chain + swing combo needs the pull to land the hero next to him.
- The dragon and the backup dancers make no attacks of opportunity (their attacks are a swoop / a shimmy, not melee by
  the engine's rule); the passive lines say so (the dancers "too busy dancing").
- `flags.noProvoke` on the imp: it never walks (blinks are teleports), so only a sheep'd imp's stroll is affected —
  declared for the HUD / AutoPlay like the act-2 wisp.
- Tax Season's roster changed (no Rules Lawyer; 1 late imp instead of 2), Influencer Collab has 2 imps (was 3) and
  Trial by Combat none (its court reporter is now the eyeball); the intros and wave texts say so.
- The custom planners' hoard leash, monologue spot and approach keep their own scoring (the engine has no destination
  filter); they add the engine's prices (walk 0.2 per point, hazards, `aooCost`) so they choose like the default turn.
- From the earlier v2 attempt (kept): delayed intents only through `api.windUp` (the three signatures); several elites
  act twice in a turn (dragon: breath wind-up + tail sweep; Death Knight: monologue wind-up + swing, or chain + swing;
  fiend: audit wind-up + one attack); `a3_kobold_pep_rally` topples its remaining totems at round end once no enemy and
  no wave is left (anti-stall); the encounter rule `a3_spirit_fingers` is a rule object on the encounter.

## Core fixes

None. No core file was edited.

## Requests

- **BALANCE (v2 balance pass)**: act-3 HP pools were set for level 7-10 parties; at v2's levels 4-6 the elite fights
  run long — real heroes 10.4-13.5 rounds, the fixture party 11.9-16.4 (Hoarder's Lair longest: 211 enemy HP and up to
  15 hoard Block a round; 1 fixture timeout in 24 = a cleric Help-Up loop the dragon can't finish). Tried here: elite HP
  to 130 / 125 and hoard Block 2 per pile, each ~1 round shorter at similar win rates. Normal fights are 5-10 rounds.
  The hardest fights today: Tax Season (real 15/24), Intern Orientation (19/24, fixture 15/24), Pep Rally (fixture
  18/24).
- **AUTOPLAY**: Infernal Debt is invisible to the danger model (a custom status that deals its stacks at the owner's
  turn start, ignoring Block) and so is its payoff (each skill hit on the fiend pays 2): AutoPlay neither hurries to
  pay it nor kills the fiend to have it forgiven, which overstates Tax Season's difficulty a little. A generic way for
  status defs to declare "damage at the owner's turn start" would help (Poison-like content statuses).
- **MAPGEN (carried over, still applies as far as I know)**: a `protect` object is placed 2-4 tiles from the hero zone
  with no minimum distance from the enemy zone (Snack Heist was widened to 12×10 for it).
- **Lead (DESIGN §8 act-3 list, optional)**: the Imp Influencer is the act's diver (assassin targeting); the Rules
  Lawyer, Golem, Kobold, hounds, Death Knight and Pit Fiend hold the line (attacks of opportunity).

## Known issues

- Real-hero sims depend on other areas' work in progress (new heroes being added, kits changing): the same seeds gave
  Tax Season 8/16 in one run and 25/36 in another hour; trust the 24-36-seed numbers, not single runs.
- The Lawyer's attack of opportunity can shove a hero 2 tiles into a pit or lava (intended: "Motion to Dismiss"); the
  move preview names the Motion but shows only its damage, not the push. A natural 1 on the golem's reaction stuns the
  golem instead (intended).
- Imps still deal a lot in total (the act's most common enemy, diving the weak); Go Live! cooldown 1 → 2 is the next
  knob if act 3 feels samey.
- The fixture party (4-7 damage hits) finds armor 2 + Block elites slow (Hoarder's Lair 16 rounds); real heroes don't.

## Requests (Nov 3) — content sweep for the user's v2 requests (flyers, barrels, aimed heals)

The engine skips every floor effect for flyers (DD.Grid.feelsFloor / feelsSurface). Act 3 flyers: the Imp Influencer, the
Floating Eyeball Intern and the Young Red Dragon (hero fire, webs, puddles and traps no longer touch them).
- **Hoard Pile**: pocketing is a floor effect, so a flying hero floats over the gold (no gold, no Thief). The desc adds
  "Flyers can't reach down that far"; the AutoPlay hint is 0 for a flyer. Kept to the rule (good and bad floor effects
  alike); flip `pocketHoard` to a non-floor trigger if the user wants flyers to loot.
- **Imp blink**: a web only rules out a blink spot when it would snare the imp (`G().feelsSurface`): a flying imp blinks
  onto webs now.
- **pushBonus** (Motion to Dismiss and the dragon's Tail Sweep scoring): lava counts only when it can hurt the target
  (`G().harmlessTo`: a fire-proof hero is no lava target); flyers were already worth 0.
- **Barrels**: Exhibit B (Trial by Combat), the Industrial Shredder (Tax Season) and the hellhound walk's barrels are the
  core `barrel_explosive` (volatile): heroes can shoot them now. No act 3 object of its own explodes (hoard piles and the
  snack bowl don't). **Aimed heals**: no hero-usable skill here.
- **Tests**: `enemies_act3: v2 requests (Nov 3) — …` (18 assertions: hoard walked vs flown over with gold, Thief and the
  hint; an imp blinking onto webs everywhere; Motion scores for a fire-proof and a flying target; the exhibits are
  volatile). The imp and lava fixes are mutation-checked.

## Review (v2) — adversarial review of the v2 / attacks-of-opportunity pass (ADVERSARIAL REVIEWER role)

Scope: the pass above (`act3.js`, its suites, these notes). Method: the 20 suites and the 8 generic `content:` suites
isolated; scratch probes in `.tmp/ea3v2rev/` (`probe.sh "suite=probe: pN&probe=pN.js&verbose=1"`, Chrome-slot aware):
`p1` = per-enemy turn stats over 66 real-hero AutoPlay fights (idle turns with a reachable foe, engaged → stuck /
switched, attacks of opportunity made / taken, wind-ups), `p3` = a per-turn log of one enemy type, `p4` = a board dump
whenever it idles next to a foe, `p5` = every hero's HP at levels 4-6, `p6` = how much Shield Wall Block is wiped
before any hero acts; screenshots (`look.sh` + `look.js`: the Pit Fiend, Imp and Hell Hound inspect panels; the
Hoarder's Lair under AutoPlay; `gallery=act3`).

**Verified (held)**: every skill's desc matches its execute (1 level each; the suites fire each one as an action, the
golem's three d20 outcomes and the dice lob rigged); every enemy's first melee skill is its attack of opportunity
exactly as the table says (the engine's `meleeDef`: no 'ranged' tag, area skills only when tagged 'melee', 'self'-target
tails never), the preview names it and hits for the desc number, the six without one let a hero walk off for free; the
elites have exactly one wind-up each and nobody else ever winds up (also over 66 real fights: 25 breaths with 2.0 foes
in the cone when announced, 7 monologues with 2.6, 14 audits with 1.7); styles (one diver, three ranged, the rest
brutes) and init values fit (imps +3 first, golem −2 last); brutes stick (hound 31 of 33 engaged turns hit the engaged
hero, fiend 14/14, golem 7/7, Death Knight 9/9); objectives and waves under initiative; panels read well and fit
(screenshots). Real-hero sims after the fixes (12 seeds): normal 91/96, elite 30/36; fixture (12 seeds): normal 81/96,
elite 33/36 — the same band as the pass's 24-seed table.

**Fixed** (each with a regression assertion in the suites named, mutation-checked: reverting the fix fails it):
1. **A walk stopped by an attack of opportunity on its first tile counted as "not moved"**, so the custom planners
   walked a second time in the same turn: `plan()` set `moved` from the position, `approach()` returned the walk's
   success. Seen: the dragon, stopped leaving the knight, re-planned with walking allowed and swooped across the board.
   Now a walk that set off is spent (`plan` → `moved: true`, `approach` returns true once it sets off). ("Hoard Breath"
   suite.)
2. **The dragon re-aimed its breath wind-up after an interrupted walk at whatever was in front of it** (no
   `BREATH_MIN` check on the re-aim: a breath at one Invulnerable knight). `plan(opts.minScore)`; it strikes from where
   it stopped instead. ("Hoard Breath" suite.)
3. **The Death Knight wound up his monologue wherever a reaction stopped his walk** (one hero in range). He now checks
   the audience where he ended up, else takes a plain turn without walking again; the walk uses the priced path.
   ("Death Knight" suite.)
4. **Spirit Fingers took 1 off Burn / Poison / Bleed ticks and hazards** while its desc said "every hit". Ticks and
   hazards (cause 'status' / 'surface' / 'terrain') are not hits now, and the desc says so. ("every encounter builds".)
5. **Shield Wall wasted its Block on allies that act before any hero** (Block is wiped at the ally's own turn start):
   23% of the allies' Block in 36 real-hero kobold fights. The aiScore counts only allies whose Block meets a hero
   turn (`blockHolds`: walks the initiative order); 16% left = incidental neighbours of a useful cast. ("statuses from
   enemy turns".)
6. **The custom planners' approach field went through hostile bodies**: a downed hero lying in a doorway was a
   shortcut, so the golem parked next to the body. The field skips hostile-occupied tiles. ("targeting styles".)
7. Passive wording: the imp blinks "out of melee reach (3+ tiles from the heroes when it can)" (it was "about 3": it
   only avoids 1-2); the eyeball fires the overtime beam "when it can line up two heroes (or their summons) in a
   straight line from it" (it was "when two heroes share a straight line"; codex desc too).
8. Tests: the one-shot bound now uses every registered hero (Syllamin, 29 HP at level 4, is frailer than the fixtures'
   31; the Death Knight's 23-damage yank-and-swing still leaves him standing); a stale "−2" comment.

**Requests (cross-area, found here)**
- **ENGINE (`ai.js` `reachOf` / `threatMap`)**: skills a planner only ever winds up count as "on its turn it can reach":
  the Pit Fiend's panel lists every hero at 16 (Hostile Audit, range 12) and threat shading covers the board; same for
  Hoard Breath, Villain Monologue and the bosses' wind-ups. Their marked tiles already show them: skip such skills (a
  def flag, e.g. `windupOnly: true`, that content can set).
- **ENGINE (`grid.js` `hazardDamage` / `terrain.js`)**: hazard estimates ignore resistances: lava (8 fire + Burn) and
  fire surfaces read as deadly for fire-immune walkers (Hell Hound, Pit Fiend), who then avoid lava they can't feel.
- **ENGINE (`ai.js` `bestAttack` / `positionScore`)**: a unit standing on a hazard tile with only hazards around it gets
  that tile's end-of-turn penalty on every action, so it does nothing even next to a foe (a Hell Hound that pounced
  into lava sat beside a raven for two turns, `bestAttack` null). Staying put costs the same with or without an
  attack: compare against doing nothing.
- **ENGINE (`ai.js` `fieldTo`)**: the default planner's approach field has the doorway issue of fix 6 (a Rules Lawyer
  stood two turns in Trial by Combat's gap behind a downed hero).
- **ENGINE (`actions.js` ~1427)**: the element chain log prints the surface id ("The jos_miasma goes up in a line of
  flames!"); use the surface's name.
- **BALANCE**: the Succubus Dating Coach idles about half her turns once her allies are Inspired (Pickup Line
  cooldown 1, pep talk cooldown 3: 83 idle of 168 turns); the Lawyer about half (Objection cooldown 2, the Motion only
  up close). Fine for "hard but fair", dull to watch; a cheap knob is a small off-turn action.

**Known issues (left)**: the hound-in-lava stall above (engine); the author's open items (Lawyer push not in the move
preview, Debt invisible to AutoPlay, long elite fights) stand.

## Earlier history (v1 → v2, condensed)

- **v1 + adversarial review (2026-10-31)**: the roster, layouts and sprites above; must-answer threats with long
  sight-free reach (Go Live!, OBJECTION!, the golem's lob, the invoice), gap-closers (Pounce, Swoop, Come Hither),
  5-6 enemies per normal fight, elite tenacity against stun-locks and a positional hoard (piles only count within 3
  tiles, the dragon guards and settles back on its gold). Fixed then: Greedy Bite stole from Invulnerable targets
  (theft now needs the bite to land; Thief +4 in its wind-up number), dancers never hit (now a 2-tile shimmy-kick; no
  leap onto a hazard that would kill the leaper), the Death Knight's chain was dodged by one step (spectral, no LOS,
  2-6), the Snack Heist bowl spawned next to the hounds on 10×10 (map 12×10), Debt was paid by DoT ticks (only skill
  hits pay), and a dozen mechanics-text fixes. Sprites: distinct silhouettes per enemy (scales minion 0.78-0.82,
  normal 0.92-1.08, elite 1.42-1.55), a custom painter for the Natural 1 Golem, object painters for the hoard pile and
  the snack bowl, the Death Knight's spotlight underlay.
- **v2 turn model (the interrupted earlier attempt, kept)**: actions at once, the three elite wind-ups via
  `api.windUp`, init modifiers, the eyeball's overtime beam made immediate (+ a nap), Unshakeable per own turn, the
  Hoarder's Block at the end of the dragon's turns, the monologue threshold 20 (act-3 parties are levels 4-6 now), the
  fire floors "until the end of next round", suites rewritten for v2 (registry incl. init and no telegraph wording,
  damage == desc for every skill as an action, statuses per own turn, every enemy's turns under `watchAreas`, previews,
  odd conditions + mid-fight cameos, encounters under initiative, no round-1 one-shots, fixture sims at levels 4-6).
