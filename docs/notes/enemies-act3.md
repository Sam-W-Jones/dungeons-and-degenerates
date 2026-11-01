# ENEMIES — ACT 3 notes

Files: `js/data/enemies/act3.js` (content), `tests/content/enemies_act3.js` (16 suites `enemies_act3: …` + 2 opt-in
diagnostics). Run: `bash tools/test.sh "suite=enemies_act3&isolate=enemies/act3,enemies_act3"` (add `&verbose=1&sims=24`
for bigger sims). Screenshots: `.tmp/enemies-act3/` (`gallery_act3.png`, `c_trial.png`, `c_tax.png`, `c_lair.png`,
`c_dk.png`, `c_snack.png`, `c_walkies.png`, `d_*.png` detail pages) and, after the review, `.tmp/enemies-act3-review/`
(`gallery.png`, `d_dragon2.png`, `c_lair2.png`, `c_a3_*.png`).

## Summary

Act 3 "Behind the DM Screen": 9 regular enemies, 3 elite mini-bosses, 27 enemy skills, 4 statuses, 2 objects and
11 encounters (8 normal, 3 elite) over the three act-3 themes. Every id is prefixed `a3_`. Every gimmick is in the
enemy's codex `desc` (first sentence) and in its telegraphs (skill name + exact desc).

| Enemy | Tier / HP | Gimmick (skills) |
|---|---|---|
| `a3_imp_influencer` Imp Influencer | minion 18, flying | Blinks up to 5 tiles instead of walking (custom planner). `a3_imp_golive` Go Live! (7 fire + Mark 4, tracked, range 1-30 = anywhere, no LOS needed, spell) · `a3_imp_hottake` Hot Take (8 fire, tracked, range 5) |
| `a3_hell_hound` Hell Hound | normal 34 | Fire-immune, weak to frost. `a3_hound_breath` Hot Dog Breath (cone 2, 9 fire to everyone and every object, the floor burns through your next turn) · `a3_hound_pounce` Pounce (tracked, leaps up to 4, 11) · `a3_hound_bite` Chew Toy (adjacent tile, 9, also chews objects) |
| `a3_mind_flayer` Mind Flayer Life Coach | normal 36 | `a3_flayer_blast` Mind Blast: Hustle Culture (cone 3 = 9 tiles, 9 psychic + Confused) · `a3_flayer_advice` Unsolicited Life Advice (8 psychic + Charmed, tracked, no LOS) |
| `a3_eyeball_intern` Floating Eyeball Intern | normal 30, flying | `a3_eye_stare` Piercing Stare: a 5-tile ray that follows its tracked target and pierces everyone on it, coworkers included (10) · `a3_eye_overtime` Unpaid Overtime Beam (ground, delayed 1, 8-tile line, 14; only for lines with 2+ heroes; the eye holds still while charging) |
| `a3_rules_lawyer` Rules Lawyer (Devil, Esq.) | normal 34, armor 1 | `a3_lawyer_objection` OBJECTION! (spell, tracked anywhere: strips ALL buffs first — even Invulnerable — then 9 + Silence 1) · `a3_lawyer_motion` Motion to Dismiss (adjacent, 8 + push 2; AI values pits/lava/bumps) |
| `a3_nat1_golem` Natural 1 Golem | normal 40, armor 1 | `a3_golem_roll` Roll to Hit: d20 then the 3 tiles in front: 1 = hits itself for 10 + Stunned, 2-9 = 6, 10-19 = 11, 20 = 22 · `a3_golem_toss` Throw the Bones (tracked lob, radius 1 around the target, 8 or 16 on doubles, friends too). Custom painter (d20 torso showing a 1, d6 head whose pip is the eye) |
| `a3_kobold_shield` Kobold Dragonshield | minion 16, armor 1 | `a3_kobold_wall` Shield Wall (itself + adjacent allies +6 Block, lasts through your turn; AI loves shielding elites) · `a3_kobold_spear` Pointy Stick (first unit within 2, 7) |
| `a3_succubus_coach` Succubus Dating Coach | normal 32 | `a3_succubus_line` Terrible Pickup Line (8 psychic + Charmed, tracked; barks a PG-13 pickup line) · `a3_succubus_pep` You Deserve Better! (other allies within 3 Inspired 2 turns) |
| `a3_backup_dancer` Skeletal Backup Dancer | minion 14, undead | `a3_dancer_kick` Kick Ball Change (tracked, shimmies up to 2 tiles next to the target, 7; not while Rooted). Arrives with the Death Knight's intermission. |
| `a3_red_dragon` Young Red Dragon (Hoarder) | elite 145, flying | Hoarder: +3 Block per `a3_hoard_pile` within 3 tiles, every round (max 15). Guards: while piles remain and no Thief is loose it only moves to tiles within 3 of a pile, strikes from the spot with the most gold around it, and settles back on the richest reachable spot of its hoard when nobody is in reach. Walking over a pile pockets its gold and brands the hero `a3_thief` (+4 damage from dragons — the bite telegraph shows it — and hunted). `a3_dragon_breath` Hoard Breath (ground cone 3, delayed 1, 16 fire to everyone and every object, the floor burns through your next turn; it holds still while inhaling) · `a3_dragon_bite` Greedy Bite (tracked, swoops up to 4 tiles, 15; if the bite lands it steals up to 5 gold into a new pile (+3) next to it) · `a3_dragon_tail` Tail Sweep (adjacent foes 12 + push 1; added as a 2nd attack when foes are adjacent) |
| `a3_death_knight` Death Knight (Very Dramatic) | elite 135, armor 2 | `a3_dk_monologue` Villain Monologue (delayed 1, 16 to foes within 2; `a3_monologue` status counts damage: 30+ interrupts → cancelled, Vulnerable, +10 Hype; stun/silence also cancel) · `a3_dk_cleave` Overly Dramatic Swing (tracked reach 2, the target + both sides, 14) · `a3_dk_grip` Come Hither, Darling (spell, a spectral chain: tracked 2-6, no LOS, 9 frost + pull 3). Yank and swing: with nobody in reach he chains a hero and adds a swing tracking the same hero (it lands once the pull brings them within 2). At ≤50% HP: INTERMISSION banner + 2 Skeletal Backup Dancers (once). |
| `a3_pit_fiend` Pit Fiend Accountant | elite 150, immovable | `a3_debt` Infernal Debt: at the hero's turn start lose Debt HP (through Block), then Debt +1 (max 5); every skill hit on him pays off 2 (DoT ticks don't); forgiven on his death. `a3_fiend_invoice` Itemized Invoice (tracked cross, range 1-8 no LOS, 13 fire + 2 Debt) · `a3_fiend_audit` Hostile Audit (delayed 1, a whole line across the arena perpendicular to his facing, 16 + 1 Debt) · `a3_fiend_smack` Fiscal Smackdown (adjacent 15 + 1 Debt) |

All three elites use **tenacity**: when a stun / sleep / freeze lands they become `a3_unshakeable` (buff, 2 turns) and
shrug off the next stun-likes, so they can't be stun-locked (a stun still cancels that round's telegraphs; dispelling
the buff re-opens the window).

**Encounters** (`reward.itemRarity: 'rare'` on elites, elites `minDepth: 2`):

| Encounter | Kind / map | Enemies | Objective / extras |
|---|---|---|---|
| `a3_hellhound_walkies` Walkies in the Nine Hells | normal · hellscape 11×11 lava, oil, barrels | 3 hounds, 2 imps | killAll |
| `a3_influencer_collab` Influencer Collab Stream | normal · hellscape 10×9 fire vents, hills, chokepoint · minDepth 1 | 3 imps, succubus, hound, eyeball | killAll |
| `a3_self_help_seminar` Mandatory Self-Help Seminar | normal · dm_table 11×11 cheeto, water · minDepth 1 | flayer, 2 succubi, eyeball, kobold | **survive 5**; round 3: 2 imps (N) |
| `a3_trial_by_combat` Trial by Combat (Rules As Written) | normal · **layout** dm_table 11×11 (raised paper bench, the Honorable Judge d20, jury rails, a pit "bar" with 2 gaps, Exhibit B barrel) · minDepth 2 | 2 lawyers, eyeball, golem, imp | killAll; round 3: hound (N) |
| `a3_cursed_dice_night` Cursed Dice Night | normal · dm_table 12×11 pits, cheeto · minDepth 2 | 2 golems, 2 imps, lawyer, kobold | killAll |
| `a3_kobold_pep_rally` Kobold Pep Rally | normal · hoard 11×11 pits, chest · minDepth 1 | 2 kobolds, 2 hounds, imp | **destroy 3 totems**; rule `a3_spirit_fingers` (enemies take 2 less per hit while a totem stands); round 4: succubus + imp (N); leftover totems topple at round end once no enemy/wave is left |
| `a3_snack_heist` The Great Snack Heist | normal · dm_table 12×10 cheeto, cover · minDepth 1 | 3 hounds, imp, kobold | **protect `a3_snack_bowl`** (48 HP; the hounds' breath/bite chew objects) |
| `a3_intern_orientation` Intern Orientation Day | normal · hoard 12×12 pillars, open · minDepth 3 | 3 eyeballs, lawyer, kobold | killAll; round 3: 2 imps (E) |
| `a3_hoarders_lair` The Hoarder's Lair | **elite** · **layout** hoard 12×11 (gold mound with the dragon's perch, 5 hoard piles ringed within 3 of it, pit, lava pool, chest) | dragon, 2 kobolds (mark K), hound (mark D) | killAll |
| `a3_very_dramatic_entrance` A Very Dramatic Entrance | **elite** · hellscape 12×11 lava, braziers | death knight, 2 backup dancers, succubus | killAll |
| `a3_tax_season` Tax Season in the Nine Hells | **elite** · **layout** hellscape 12×11 "Infernal Revenue Office" (raised corner office, desks, filing cabinets, water cooler fountain, shredder barrels, lava vents) | pit fiend, 2 imps, lawyer | killAll; round 4: 2 imps (N) |

Sprites: distinct silhouettes per enemy (scale minion 0.78-0.82, normal 0.92-1.08, elite 1.42-1.55), overlays for
the props (imp selfie stick + ring light, eyeball propeller beanie + lanyard, flayer face tentacles + headset, kobold
tower shield, lawyer tie, succubus headset + floating heart, hound lava cracks + nostril smoke, dragon back spines (with
swept-back horns, crown and chain), Death Knight floor spotlight + rose, fiend tie + calculator), a full custom painter for the Natural 1 Golem and
custom object painters for the hoard pile and the snack bowl.

## Balance (AutoPlay sims)

Re-measured after the review (2026-10-31), 24 seeds per encounter and party. Fixture party = `test_knight,
test_cleric, test_mage, test_rogue`, levels 7-10, all 4 skills at III. Real = random 4 of the 10 heroes, levels 7-10,
starting skills at III + 2 pool skills at II (full content loaded; depends on the hero authors' current kits; the
opt-in `?a3real=1&verbose=1&sims=N` suite prints the same kind of table). "Taken" = all HP the heroes lost; "by
enemies" = damage credited to enemy units; "self" = damage the heroes took in their own phase from terrain, surfaces
and burns with no enemy source (AutoPlay walking through lava/fire, see Requests).

| Encounter | Fixture: won · rounds · taken · by enemies · self · downs | Real: won · rounds · taken · by enemies · self · downs |
|---|---|---|
| hellhound_walkies | 24/24 · 5.5 · 65 (30%) · 22 · 42 · 0.4 | 24/24 · 4.2 · 60 (27%) · 24 · 46 · 0.4 |
| influencer_collab | 24/24 · 6.0 · 97 (45%) · 40 · 58 · 0.7 | 24/24 · 4.4 · 49 (22%) · 39 · 18 · 0.1 |
| self_help_seminar | 24/24 · 5.0 · 44 (21%) · 45 · 2 · 0.1 | 24/24 · 4.9 · 23 (10%) · 31 · 2 · 0.0 |
| trial_by_combat | 24/24 · 6.0 · 67 (31%) · 72 · 0 · 0.0 | 24/24 · 4.6 · 35 (16%) · 46 · 0 · 0.0 |
| cursed_dice_night | 24/24 · 6.6 · 39 (18%) · 37 · 1 · 0.0 | 24/24 · 5.1 · 34 (15%) · 41 · 0 · 0.0 |
| kobold_pep_rally | 24/24 · 10.6 · 50 (23%) · 30 · 20 · 0.2 | 24/24 · 7.4 · 34 (15%) · 34 · 7 · 0.0 |
| snack_heist (12×10) | 23/24 · 5.4 · 15 (7%) · 10 · 2 · 0.0 (bowl −15 of 48 on average) | 24/24 · 4.2 · 11 (5%) · 15 · 1 · 0.0 |
| intern_orientation | 24/24 · 7.3 · 53 (25%) · 48 · 11 · 0.2 | 24/24 · 5.6 · 32 (14%) · 38 · 8 · 0.0 |
| **hoarders_lair** (elite) | 24/24 · 13.3 · 100 (46%) · 86 · 15 · 0.2 | 24/24 · 7.4 · 23 (11%) · 35 · 4 · 0.0 |
| **very_dramatic_entrance** (elite) | 24/24 · 8.4 · 103 (48%) · 35 · 69 · 0.5 | 24/24 · 7.0 · 62 (27%) · 24 · 55 · 0.2 |
| **tax_season** (elite) | 24/24 · 9.5 · 128 (60%) · 96 · 32 · 0.2 | 24/24 · 7.4 · 83 (37%) · 88 · 16 · 0.3 |

Before the review the real-hero Lair cost 6% party HP (13 damage in 7.4 rounds: the elite was the easiest fight of
the act) and the fixture Snack Heist lost 4 of 40 bowls on a 10×10 table.

The generic `content: encounters build and auto-battle` suite (random real parties, level 8) wins all 11 in 3-6 rounds
(normal; Pep Rally ~10) and 7-8 rounds (elite).

Tuning history worth knowing: AutoPlay (and players) sidestep every self-anchored telegraph, and step out of range or
sight of short tracked ones, so early versions dealt almost no damage (Cursed Dice Night: 3 damage in 6 rounds). The
fix was a mix of (a) a few deliberate **must-answer** threats with long, sight-free reach (Go Live!, OBJECTION!, the
golem's lob, the invoice — all telegraphed, all answerable by killing / stunning / silencing / stealth), (b) gap-closers
(Pounce, Swoop, Come Hither) and a tracking ray for the eyeball, (c) 5-6 enemies per normal fight, (d) elite tenacity
against stun-locks and (e) a positional hoard (piles only count within 3 tiles), which also removed a kiting stalemate.

## Public API (for other authors)

- Statuses: `a3_thief` (debuff, permanent; dragons deal +4 to it), `a3_monologue` (Death Knight helper; self-cleaning
  if its intent is gone), `a3_debt` (stacking debuff, max 5; ticks at the owner's turn start, grows; reduced by hitting
  `a3_pit_fiend`), `a3_unshakeable` (buff; meaning is enforced by the elite defs' hooks, see below).
- Objects: `a3_hoard_pile` (non-blocking; `data.gold` = gold inside, default 4-8; AutoPlay hint 10 near a living
  dragon, 3 otherwise; pocketing brands the walker a Thief), `a3_snack_bowl` (48 HP, blocks movement; a protect target).
- Enemies are safe to `DD.Act.spawn` anywhere (no encounter wiring needed): the dragon counts piles on any map, the
  Death Knight's intermission and the fiend's debt work in any fight. The DM boss can cameo any of them.
- Tenacity pattern (copyable): defs whose hooks cancel stun-likes in `modifyStatus` while `a3_unshakeable` is present
  and add it in `onStatusApplied` when a stun-like lands.

## Deviations

- Delayed intents are created by `plan()` / `api.addIntent` and then get `delay`/`pending` set (the default planner
  takes no delay option); identical to `makeIntent(..., { delay })`.
- Movement inside skills: Pounce, Greedy Bite and Kick Ball Change leap the attacker next to its tracked target during
  execution (tile effects apply on landing; not while Rooted); the imp blinks (teleports) during planning instead of
  walking.
- Some elites declare two intents in a round (dragon: main attack + tail sweep / breath; Death Knight: swing + grip,
  grip + a swing at the same hero, or monologue + swing; fiend: audit + attack). Normal enemies declare one (plus a
  pending delayed one at most). The Death Knight's follow-up swing is planned while its target is still out of reach
  (it tracks the hero the chain reels in, and fizzles honestly if the pull fails).
- `a3_kobold_pep_rally` auto-destroys the remaining totems at round end once no enemy and no wave is left (anti-stall:
  AutoPlay once failed to path to the last totem), so that destroy objective can also complete by routing the rally.
- The encounter rule `a3_spirit_fingers` is a rule object on the encounter (not a registry def).
- Snack bowl object is named "DM's Snack Bowl" (the engine prefixes "the" in the protect objective text).

## Core fixes

None. No core file was edited.

## Requests

- **RULES (AutoPlay)**: `approachMove` heads for objective tiles by Manhattan distance, so a hero can stall behind a
  pit or wall (seen as a 31-round timeout in the Pep Rally before my fallback). A walking-distance field (like the AI's
  `fieldTo`) would fix it for every destroy/hint objective.
- **RULES (AI api)**: let `api.defaultPlan(u, style)` / the engine `approach` take a style override; custom planners
  that mix melee and ranged skills (golem, eyeball, Death Knight) had to re-implement approach.
- **RULES (AI)**: `AI.recharm` re-plans a charmed enemy with all of its skills and no delay (harmless here, but a
  planner-aware recharm would keep delayed skills delayed).
- **RENDER-SPRITES**: an `underlay(g, t)` hook drawn before the base sprite would allow ground effects behind a unit
  (the Death Knight's spotlight had to shrink to a floor pool because overlays paint over the body).
- **MAPGEN (minor)**: layout enemy placement fills `E` marks by tier (normal before minion), so placing minions on
  specific marks needs explicit `mark` hints (used in the lair). Documenting this would help other layout authors.
- **RULES (AutoPlay, review)** **[Resolved at integration — see docs/notes/content-digest.md.]** heroes walk onto and across lava. `dangerAt` adds a flat 6 for a hazard on the end tile
  and nothing for hazards crossed on the way (the `hazard` of `reachable()` entries is unused), so a hero takes 8 +
  Burn 2 per lava tile to save a step. In act-3 hellscape fights that is most of the damage the party takes:
  `very_dramatic_entrance` 55-69 self-inflicted vs 24-35 from enemies per fight, `hellhound_walkies` 42-46 vs 22-24
  (table above). Players won't do this, so hellscape balance numbers overstate the danger. Pricing each crossed hazard
  at its real damage (like `AI.pathRisk`) would fix it for every act.
- **RULES (AI.describe, review)**: tracked telegraphs always say "fizzles if out of range or sight", also for skills
  with `target.los: false` (Go Live!, OBJECTION!, Unsolicited Life Advice, Throw the Bones, Itemized Invoice, Come
  Hither, Darling), whose desc says no line of sight is needed. "fizzles if out of range" when `los === false` (and
  nothing when the range covers the board) would keep the HUD honest.
- **MAPGEN (review)**: a `protect` object is placed 2-4 tiles from the hero zone with no minimum distance from the enemy
  zone, so on small maps it can spawn next to the enemies (Snack Heist on 10×10: bowl 1-2 tiles from the hounds in a
  third of the seeds; the lost bowls all spawned 1-3 tiles from them). I widened that map to 12×10; a minimum
  distance from the enemy zone would fix it for every protect encounter.

## Known issues

- Real heroes still handle the Hoarder's Lair comfortably (11% HP lost in ~7.4 rounds, up from 6%): their kits pile
  Weak / Roasted / Dazzle / taunts / stuns on the dragon. It is now in line with the normal fights; Death Knight and
  Tax Season stay the harder elites. The fixture party takes 13 rounds there (it loots every pile first).
- Self-anchored melee (golem d20 swing, kobold spear, fiend smack, motion to dismiss) and short tracked attacks are
  sidestepped by AutoPlay almost every time (it steps exactly one tile out of range); most damage comes from
  sight-free reach, AoEs and the elites' mechanics. That is the readable-telegraph design, but it makes golem-heavy
  fights lighter than their HP suggests.
- Imp Influencers are in 9 of the 11 encounters and Go Live! is the top damage source of most normal fights ("kill the
  imps first" is the common answer). Deliberate (the act's signature minion, the must-answer threat), but it is the
  first knob to turn if act 3 feels samey: Go Live! cooldown 1 → 2.
- The golem's d20 swing telegraphs its 10-19 tier (11); the HUD marks `random` intents with "?" and the desc lists
  every outcome.
- Snack Heist pressure is on the bowl (hero damage is low; the bowl loses ~15 of 48 HP; 1 bowl in 24-40 fixture sims
  is eaten).
- Imp Influencer's blink planner evaluates ~60 tiles × a no-move `bestAttack` each planning; fine in tests, but it is
  the most expensive act-3 planner.
- Full `tools/test.sh` on 2026-10-31 after the review: PASS, 505 suites, 0 failures, no swallowed `Error in`
  warnings (an Act 2 suite that was red mid-run belonged to that area's in-flight review and reproduced without act 3).

## Review (2026-10-31, adversarial pass)

Resumed after an interrupted first review pass that had left two suites red: it had raised the monologue interrupt
threshold 20 → 30 and cut the monologue 18 → 16 (18 was above the DESIGN §5 elite band of 12-16; one L7-10 hit
reached 20) without updating the tests. I kept both numbers and fixed the tests. Then, most severe first:

1. **Hoarder's Lair, the act's easiest fight although it is an elite** (real heroes: 6% party HP). The dragon left its
   perch on round 1 to creep to the edge of its leash, basked in 1 pile (3 Block) and its swoops fizzled 2 times in 3.
   Now it guards: when nobody is in reach it settles back on the richest reachable spot of its hoard (`goHome`), and
   it prefers to strike from tiles with more gold around it (`bestWithin` bonus = 0.4 × the Block it would get).
   Greedy Bite swoops 4 tiles (was 3). Real heroes now lose 11%, the fixture party 46%; no timeouts. (Swoop 5 pushed
   the fixture party to 76% with no change for real heroes, so 4.)
2. **Greedy Bite stole gold from targets it never hurt** (an Invulnerable hero lost 5 gold and seeded a new pile, i.e.
   +3 Block): the theft now needs the bite to land (HP or Block lost). Its telegraph now shows the +4 Thief bonus
   (`telegraphFlat`), so the number on a Thief tells the truth. Desc says "If the bite lands … plus 3".
3. **Skeletal Backup Dancers never hit anything** (none of 37 planned kicks over two sim batches landed: an
   adjacent-only, self-anchored kick). Kick Ball Change is now a tracked step-in kick: shimmies up to 2 tiles next to
   its target, then 7 (minion band); not while Rooted. Desc and codex updated. They still die fast (14 HP): fodder
   that now has to be answered. Every leap (Pounce, swoop, shimmy) also refuses a landing tile whose hazard would kill
   the leaper (a 6-HP dancer no longer hops into lava; at full HP it still braves it).
4. **Death Knight dealt ~20 damage per elite fight** (cleave and chain fizzled 3 times in 4: the 2-5, sight-bound
   chain was dodged by stepping one tile). Come Hither is now a spectral chain, 2-6 tiles, no LOS (a hero hugging
   him is still too close), and when nobody is in reach he chains a hero and adds a swing that tracks the same hero
   ("yank and swing"; only planned if the pull can bring them within 2). Enemy damage in his fight: fixture 22 → 35.
   The rest of that fight's damage is AutoPlay walking through lava (see Requests).
5. **Snack Heist was sometimes lost before the party could react**: on 10×10 the bowl spawned 1-2 tiles from the
   hounds in about a third of the seeds (three breaths = 27 of its 48 HP in round 1), and the lost bowls (4 of 40)
   all spawned 1-3 tiles from them. Map widened to 12×10: 1 of 40 lost, the bowl still loses ~15 HP per fight.
6. **Infernal Debt was paid off by damage-over-time ticks** credited to the indebted hero (Poison / Bleed on the
   fiend): only skill hits pay now, as the desc says ("each hit it lands").
7. **Mechanics text**: the hoard Block cap (max 15) is in the dragon and pile tooltips; both breaths say they also hit
   objects and that "the floor there burns through your next turn" (it never lasted two player turns: set in the enemy
   phase with 2 turns, it ticks at once); Throw the Bones says it never hits the golem itself; the chain states its
   2-6 range and no-LOS reach. Flavor fixes: the Pep Rally wave called the succubus a "life coach" (that is the Mind
   Flayer), the Tax Season wave called the imps "interns" (that is the Eyeball).
8. **Sprite**: the dragon wore ram horns (read as a goat and duplicated the Pit Fiend) and a gold "coin heap" overlay
   that rendered as a goblet under its chin; now swept-back horns, no plate (crown, chain and spines stay).
9. **Tests** (16 suites, ~2,300 assertions, ~5 s isolated): the DK suite reads the threshold and Hype from the level
   table; the hoard cap test no longer depends on where the dragon wanders (a Rooted dragon on 6 piles). New checks:
   hoard guarding (settles where 3 piles cover it, strikes from inside the leash), swoop range = desc, no theft on an
   Invulnerable target, Thief telegraph, the dancer's shimmy / fizzle / Root, the chain without LOS and too close, the
   yank-and-swing order and damage, the golem's lob sparing itself, the real fire-floor lifetime (present on your next
   turn, gone after), Poison ticks not paying Debt, previews under Spirit Fingers and against an Unshakeable elite,
   and a new robustness suite: every act-3 skill fired twice and every planner run under 14 conditions (charmed,
   silenced, dazzled, confused, taunted, rooted, sheep, dead / moved / stealthed / invulnerable targets, map edge,
   pits) plus every enemy spawned mid-fight (DM cameos), with no swallowed warnings (verified to fail on an injected
   bug). Stale numbers in assertion labels now come from the level tables.

Checked and fine: registry and load warnings (none), id prefixes, `desc(L, null)` for every skill, hook signatures,
no `Math.random` in logic (pickup-line barks use the cosmetic `DD.rng`), every intent readable in `AI.describe`,
previews == reality for Shield Wall, Debt payoff, Thief, Charm, the monologue interrupt Hype, hoard Block and Spirit
Fingers; silhouettes in the gallery and on the board (Lair, Trial, Tax Season, Pep Rally, Very Dramatic Entrance).
No encounter is lost by real heroes, won in 1-2 rounds on average, or times out (24 seeds each, both parties).
No core file was edited. Scratch probes used for the numbers above live in `.tmp/enemies-act3-review/` (`rv4.js` sim
table, `rv5.js` runtime overrides for tuning trials, `rv7.js` fizzle reasons, `rv9.js` snack-bowl timeline; run them
with `bash .tmp/enemies-act3-review/probe.sh "probe=rv4.js&suite=rv4&verbose=1&sims=24"`).
