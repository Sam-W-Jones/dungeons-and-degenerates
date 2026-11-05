# HERO — Sparrow the Hemogoblin (notes)

Files: `js/data/heroes/sparrow.js`, `tests/content/hero_sparrow.js` (18 suites `hero_sparrow: …`), this file.
Run: `bash tools/test.sh "suite=hero_sparrow&isolate=heroes/sparrow,hero_sparrow"`; generic validation:
`bash tools/test.sh "suite=content:&isolate=heroes/sparrow,hero_sparrow"`.
Looks: `bash tools/shot.sh "debug=1&fixtures=1&isolate=heroes/sparrow,hero_sparrow&gallery=sparrow" .tmp/sparrow/g.png 1280x720 4000`;
in combat: `screen=combat&party=sparrow,test_knight,test_cleric,test_mage&encounter=test_a1_elite&autoplay=1&fast=1`.
Scratch (not game code, `.tmp/sparrow/`, every runner takes a Chrome slot via `tools/chrome_slot.sh`): `page.sh <page>
"<query>"` runs a page and prints its `#out`; `real.html` (balance sim: Sparrow + 3 random real heroes vs
`Encounter.pick` encounters, `n` / `diff` / `focus`), `sim.html` (fixture party, Sparrow vs the fixture rogue in the same
slot), `descs.html` (every desc at every level), `combo.html` (probe: combos with Basanos / Betty / Kiri);
`mut.sh` + `mut_test.html` run her suites against a mutated copy `.tmp/sparrow/mut_sparrow.js`, `realmut.html` sims it.
The v1 kit is archived there too (`sparrow_v1.js`, `hero_sparrow_v1.js`, `hero-sparrow_v1.md`).
Review scratch (`.tmp/sparrow-review/`): `run.sh <page> "<query>"`; `probe.html?p=stealth,donor,combos,stick,descs,
mentions,dups` (full real content + fixtures: Stealth vs her own reaction, donors under damage modifiers, real-hero
combos, reach-aware brutes, every desc, who mentions her, bark duplicates); gallery / combat shots.

## v2 — the simplified kit (initiative, no telegraphs, no Guard, no starting Block, attacks of opportunity)

User: *"skills are too overcomplicated, doing too much each. Can we simplify them a bit such that it's the
combinations of effects that feel strong?"* — plus initiative order, no enemy telegraphs, no Guard, no combat-start
Block, every hero available from the start, and (latest playtest) attacks of opportunity + reach-aware enemies for a
"hard but fair" game. DESIGN §6 "Simplicity": one verb per skill + at most one simple rider, one-breath descs, II =
bigger numbers, III = bigger numbers or ONE added rider, power from combinations, passive = one clear rule.

### Summary

**Sparrow the Hemogoblin** (she/her), goblin blood mage (user brief: *"a blood-magic wielding goblin"*): a pint-sized
edgelord who pays for spells in blood — hers, ideally someone else's. Role *High-risk bleed assassin*, complexity 2,
`unlock: null`, 22 HP (+3/level), 3 AP, move 5, armor 0, **initiative +3** (`stats.init: 3`), colour `#c0102a`.
Sprite unchanged from v1 (tiny crimson-hooded green goblin, glowing red eyes and blood tears, long ears with one silver
hoop, chest rune, blood vial, two daggers, blood aura).

**Passive — Blood Price** (one rule): *her skills' HP costs are paid by an adjacent Bleeding foe instead of her, when
there is one.* `modifyCost` waives the HP cost of her own (`owner: 'sparrow'`) skills while a donor stands next to her
(HUD shows 0♥, usable at 1 HP); `onCostPaid` makes that donor pay the raw cost as status damage (ignores Block and
armor, tags `bleed` / `blood_price`, doesn't break her Stealth). Donor = the nearest Bleeding foe in reach (most Bleed
on a tie), never an invulnerable one or the foe charming her. `passive.hpPayer(unit, def, level)` answers the HUD's
"paid by" pill exactly. Bleed is her signature status: it makes donors, feeds Juice Box and every ally's shove.

**Basic** `spa_basic` Shiv Happens 🔪 (1 AP, melee): 4 damage and Bleed 1. It is also her **attack of opportunity**.
**Signature** `spa_signature` Crimson Tide 🌊 (2 AP, 100 Hype, costs half her current HP — 0 at 1 HP, a donor pays it
instead): every foe within 3 takes 16 damage and gains Bleed 3.

**Pool (10, ⭐ = starting)** — I / II / III (♥ = HP cost):
| id | name | cost | desc (level I) | II / III |
|---|---|---|---|---|
| `spa_hemoglob` ⭐ | Hemo-Glob 🩸 (spell) | 1 AP, 2♥, cd 1 | lob blood at a foe within 5 (LOS): 6 damage + Bleed 1 | 8 + B1 / 9 + B2 |
| `spa_juicebox` ⭐ | Juice Box 🧃 (spell) | 2 AP, cd 2 | drain a foe within 2: 5 damage +3 per Bleed on it, heal half the damage dealt (rounded up) | 7 +3 / 8 +4 |
| `spa_papercuts` | Thousand Paper Cuts 📄 (spell) | 2 AP, 2♥, cd 2 | tile within 4, radius 1: 4 damage + Bleed 2 | 5 + B2 / 6 + B3 |
| `spa_spray` | Say It, Don't Spray It 💦 (spell) | 2 AP, 2♥, cd 2 | cone 2: 4 damage + Dazzled (its next turn) | 5 / 6, cone 3 |
| `spa_scab` | Scab Armor 🩹 | 1 AP, 3♥, cd 2 | 8 Block | 10 / 10 + Thorns 3 through her next turn (III: the rider only) |
| `spa_goblinmode` | Goblin Mode 👺 (move) | 1 AP, cd 3 | teleport within 4 + Stealthed through her next turn | 5 / 6 |
| `spa_puppet` | Blood Puppet Show 🎭 (spell) | 1 AP, 2♥, cd 2 | drag every Bleeding foe within 4 by 2 in a chosen direction | r5 / r5, 3 tiles |
| `spa_twin` | Evil Twin 👥 (summon) | 2 AP, 4♥, cd 1, 2 charges | Blood Clone (8 HP) within 3; foes next to it are Taunted | 11 HP / 14 HP, radius 2 |
| `spa_blooddrive` | Blood Drive 💉 | 1 AP, 3♥, cd 2 | ally within 4: heal 4 + Empowered | 6 / 8 |
| `spa_veinglory` | Vein Glory 🗡️ | 3 AP, 4♥, cd 3 | dart next to a foe within 3 and gut it for 15 | 19 / 22 |

v2 durations (own turns): Dazzled / Taunted on a foe = its next turn (`turns: 1` from her turn); Stealth and Thorns on
herself = through her next turn; Block until the start of her next turn (so it stands through every enemy turn of the
round); Bleed and Empowered are stacks / consumed (unchanged). Blood magic is `kind: 'spell'` (Silence blocks Hemo-Glob,
Juice Box, Paper Cuts, Spray, Puppet Show and Crimson Tide, never the Shiv, Scab Armor, Goblin Mode, Evil Twin, Blood
Drive or Vein Glory).

**Summon** `spa_clone` Blood Clone (8 HP base, ×HP for 11 / 14, 2 AP, move 4, random names "Sparrow?", "Worraps",
"Sparrow (Director's Cut)"…): `spa_clone_shiv` Copycat Shiv (3 / 4 / 5 + Bleed 1, also its attack of opportunity) and
`spa_clone_taunt` Hey, Ugly! (Taunt foes within 2 / 2 / 3, cd 1). Arrives with 0 AP, acts on her turns. Its death is
cosmetic only (a pop).

**Items** (`hero: 'sparrow'`, one rule each, nothing at combat start): `spa_shiv_of_sharing` Shiv of Sharing (rare
weapon): every Bleed she applies is 1 stack stronger (her descs show it; her attacks of opportunity too) ·
`spa_scab_mail` Bloodsucker's Bib (rare armor; id kept from v1 for saves): stepping into blood while hurt slurps it up —
heal 3, by walking, pushes or teleports · `spa_donor_card` Organ Donor Card (Not Hers) (legendary trinket): a Bleeding
foe up to 3 tiles away can pay her blood price.

**Barks**: 4-6 lines ≤ 70 chars for all 13 keys, naming all 15 other heroes (this pass added Hjalmar's banana peels,
"Valdris! Forge me armor. Black. Spiky. NOW." and "Pebbles, sit on my wound. Cauterize it. Good boy."), plus an extra
key `opportunity` (5 lines, 50% chance when she makes an attack of opportunity: "Nobody leaves the blood drive early.",
"Ghosting me? I'll haunt your veins."; none shared with Betty's / Valdris' / Pebbles' reaction lines).

### Combos (setups and payoffs with the other heroes)

- **Bleed + any shove**: Bleed ticks on every move action *and* forced movement (`Act.push` / `pull` / `knockback`), so
  each push or pull of a Bleeding foe hurts it and leaves blood (tested with the knight's Shield Bash; checked with real
  heroes in the review: Marwyn's YEET, Pebbles' Fetch Quest, Valdris' Hammer of Faith): also Betty's Ramming Speed!,
  Basanos' Shoulder Check, Marbles' Walking Stick Whack, Ellaria's Fetch!, Slate's Get Over Here / Putting My Foot
  Down, Hjalmar's Spring Glove trap. Teleport-style throws (Slate's Personal Space / Rock Bottom) don't tick Bleed.
  Allies' Bleed (Basanos' wolf Claw / Rend / Frenzy, the fixture rogue's stab, the generic Bleed-on-hit weapon) makes
  donors for her passive and food for Juice Box (tested; Rend → donor checked with the real Basanos).
- **Blood Puppet Show**: drags every Bleeding foe at once — into an ally's cleave line (tested: one Wide Cleave hits
  both, +4 Hype), into water for lightning (tested: Chain Zap Wet ×1.5 + stun), pits (YEET, +20 Hype), lava, Corelos'
  runes, onto Hjalmar's traps (a drag springs them: checked with the real Bear Trap, Root + snap); or out of a foe's
  reach before its turn (tested).
- **Blood Drive**: an ally's next damaging skill +50% on every target (tested on the mage's Fireball).
- **Say It, Don't Spray It**: Dazzled foes' attacks land 1 tile off on their turn (tested on 4 seeds) **and they make no
  attacks of opportunity**, so the whole party can walk off them (tested: the mage disengages for free; control: without
  the spray she is stabbed).
- **Evil Twin**: Taunted foes must attack the clone on their turn (tested) and only ever strike the clone, so Sparrow and
  her allies can walk away; the clone shivs foes that walk off it.

### Attacks of opportunity (v2 rule, `docs/notes/rules.md`)

- Her melee basic makes her hold a little line: a foe walking off her takes Shiv Happens for free (4 + Bleed 1, Bleed 2
  with the Shiv of Sharing) and then bleeds on its own walk — about 5 damage and a blood trail (tested). The AI prices it
  at 4 (`DD.AI.opportunityDmg`). An engaged Bleeding foe tends to stay next to her (reach-aware targeting): it stabs her,
  and on her next turn it is still her donor (tested). Risky on 22 HP: that is the "high-risk" in her role.
- Her mobility never provokes: Goblin Mode (teleport, then Stealthed: even her next walks slip away) and Vein Glory (a
  dash) get her in and out; Blood Puppet Show drags (a push) never trigger her own Shiv either (tested, plus mutants:
  a walking Vein Glory and a Shiv without Bleed on reactions each fail the suite).
- No user-side effects in her basic, so no `ctx.opportunity` guard was needed (it only picks the bark).
- A Stealthed Sparrow still makes her attack of opportunity (only movers are exempt from the rule), and dealing damage
  reveals her: a foe walking off her during Goblin Mode's Stealth gets shivved and every enemy acting after it can see
  her again (review probe; engine rule, see Requests). An ambush, not a bug — but she can't opt out.

### Tests (18 suites, ~1420 assertions, all pass isolated and in the full run)

registry, numbers, descs at every level, barks, no v1 words anywhere she shows text · simplicity (each `execute`'s verbs
counted by spying on `DD.Act`: one verb + at most one rider; descs ≤ 22 words, ≤ 2 sentences, no if/else; II bigger, III
bigger numbers **or** one added rider, not both — review) · Blood Price (donors, ties, invulnerable, charmer, Block /
armor, dying donors, a donor that is the target, 1 HP, no-pay resolves, sleeping donors, Stealth, every HP-cost skill
really charges the donor, foreign HP costs not waived, no desc says "your own blood" — review) · every skill at every
level with previews against reality and v2 own-turn durations on the enemies' turns ·
Crimson Tide · items · combos with fixture allies · **attacks of opportunity** (her move provokes and is previewed, no
undo; Goblin Mode / Stealth / Vein Glory / Puppet Show never provoke; her Shiv on a leaving foe, free, once per round,
refreshed next round; stun / sleep / frozen / sheep / downed make none, silenced still does, charmed never on her
charmer; Dazzle and the clone's Taunt let her go; the clone's Copycat Shiv; a lethal hit ends her walk; an engaged
Bleeding foe stays her donor) · edge cases (silenced / stunned / asleep / sheep / charmed user, not her turn, empty and
null targets for every skill, deaths mid-skill, corners, pits, walls, AP, Bleed clock) · previews with and without a donor
· sprites in 5 poses × 2 facings · AutoPlay with `['sparrow', 'test_knight', 'test_cleric', 'test_mage']` vs fixture acts
1-3 at L1 / 3 / 5 (12 fights, all won; ≥ 6 pool skills used) and a 100-Hype turn where AutoPlay casts Crimson Tide.

### Balance (this pass, AutoPlay)

- Real content (`real.html`, Sparrow + 3 random real heroes, v2 levels act 1 L1-2 / act 2 L3-4 / act 3 L5, random legal
  loadouts, 90 fights per difficulty; the 3 newest heroes not registered yet, others mid-conversion): **normal** 55/90
  wins, Sparrow 22% damage share (9th of 13; range 15-39%), 36 dmg/fight, downed 42% (others 23-57%); **brutal** 34/90,
  23% (9th; 16-35%), downed 64% (43-79%). Middle of the pack: below the ranged casters (Kiri, Zarathor, Corelos), above
  the tanks and supports. Her damage is AP-bound by the kiting a 22-HP goblin needs (Juice Box at range 3 was tried in a
  scratch copy: +60% casts, +0.6 dmg/fight — so range 2 stays, the drain is the risk).
- Fixture party (`sim.html`, 60 fights, normal): 28% share vs the fixture rogue's 25% in the same slot, downed 3% vs 7%.
- Changed this pass: Juice Box +3 / +3 / +4 per Bleed (was +2 / +2 / +3): with 2 Bleed 11 damage for 2 AP, 3 Bleed 14 —
  the Bleed payoff should beat a plain 2-AP hit (DESIGN §5: 7-10) once the combo is set up.
- Review re-run with all **16** heroes registered (Valdris, Hjalmar, Pebbles included; same `real.html`, `n=8`, 72
  fights per difficulty): **normal** 54/72 wins, Sparrow 26% damage share (6th of 16; others 13-37%), 48 dmg/fight,
  downed 38% (others 0-47%); **brutal** 33/72, 26% (6th; 17-39%), 55 dmg/fight, downed 58% (20-80%). No swallowed or
  uncaught errors. Her most used: Hemo-Glob (~3 a fight), the Shiv (1.4-1.9 a fight; attacks of opportunity are not
  counted there), Juice Box, Blood Drive, Goblin Mode. Still mid-pack; nothing to retune.

## Review (v2) — adversarial review of the v2 kit (ADVERSARIAL REVIEWER role)

Scope: `js/data/heroes/sparrow.js`, `tests/content/hero_sparrow.js`, this file. Verified by running code: her 18 suites
(isolated, with all content, seeds 7 / 99 / 2024), the generic `content:` suites and the HUD donor suite, mutants
(`.tmp/sparrow/mut.sh`), review probes (`.tmp/sparrow-review/probe.html`, full real content), gallery and combat shots.
Full `bash tools/test.sh` after the fixes: 788 suites, 20 failing sections, none from her files — `bosses_act1` ×17 (its
tests still call the removed `DD.AI.plan`) and `integration` ×3 (v1 unlocks for 5 heroes incl. hers, "ten real heroes"
now 16, the "Objective Failed … or XP" step, a seed-0 campaign smoke). All 18 `hero_sparrow` suites, every `content:`
suite and the HUD donor suite pass; no swallowed errors.

### Verified (held)
- **desc == effect** at every level for the 12 skills and the 2 clone skills: the suites compare every number with the
  level table and spy on what each `execute` really does; the review read every desc (probe `descs`).
- **v2**: `init: 3`, `unlock: null`, no Guard, no starting Block, no v1 words or code (intents, telegraphs, XP, planning);
  own-turn durations (Dazzle / Taunt cover the foe's next turn; Stealth / Thorns last through her next turn; Block until
  her next turn start); Bleed / Empowered stacks.
- **Attacks of opportunity**: her walk provokes (previewed, no undo); Goblin Mode, Vein Glory and Puppet Show never do;
  her Shiv is her reaction (4 + Bleed 1, once a round, free); no reaction while stunned / asleep / frozen / sheep /
  downed, still one while silenced, never on her charmer; Dazzle and the clone's Taunt let the party walk away. Real act-1
  enemies (Goblin Grunt, Dire-ish Rat) next to her stick to her and stab her instead of walking to Zarathor (probe
  `stick`): her donor stays next to her.
- **Combos with real heroes** (probe `combos`): Basanos' wolf Rend makes a donor (she casts Hemo-Glob for free);
  Marwyn's YEET, Pebbles' Fetch Quest and Valdris' Hammer of Faith make a Bleeding foe bleed; Puppet Show drags a
  Bleeding foe onto Hjalmar's Bear Trap (snap + Root).
- **Passive vs other content** (read in code; the probes cover the damage side): the Blood Bank Loyalty Card's discount
  carries over to what the donor pays; her extra cost query (`ap: 0`) leaves the Pocket Hourglass' bookkeeping alone; the
  Gelatinous Cube's acid ignores the blood price (status damage) while its gag counter counts it; off-board sheet units
  (level-up / shop cards, at -100, -100) never find a donor in a finished fight's state.
- **Visuals**: gallery shots of Sparrow and the Blood Clone (poses, statuses, portraits) and a combat HUD shot (HP pills,
  Crimson Tide's half-HP pill): nothing to fix.
- **Pronouns**: she/her in her files; the blood bank event ("…30% of her max HP") and the barks that name her
  (Syllamin, Marbles, Marwyn) are consistent.
- **Balance** with all 16 heroes: mid-pack (above, "Review re-run").

### Fixed (most severe first; 1 and 2 are guarded by assertions that a mutant fails)
1. **Scab Armor III broke the level rule**: 12 Block *and* the added Thorns 3 rider; DESIGN §6 / the task: III = bigger
   numbers **or** one added rider. Now 10 Block + Thorns 3. The simplicity suite enforced "or" loosely (it allowed both);
   it is strict now (the old table fails it).
2. **Hemo-Glob's desc contradicted her passive**: "Lob your own blood…", while an adjacent Bleeding foe pays its HP cost.
   Now "Lob blood at a foe within 5: deal 6 damage and Bleed 1." (12 words). New assertion: no desc of hers says "your /
   her own blood" (reverting the desc fails 3 assertions).
3. **Copied barks**: her reaction line "Where do you think YOU'RE going?" was word for word Betty's (and Valdris'), "Turning
   your back on a goblin? Bold." echoed Betty's goat line, and two lines shared "exit fee". Three new ones ("Ghosting me?
   I'll haunt your veins.", "Rude. You didn't even say bye. *stab*", "Your back looked lonely. Gave it a shiv.").
4. **Notes named skills that don't exist** in the combo list (Slate's "Hurl", Betty's "Ram", Pebbles' "Fetch!" — that is
   Ellaria's —, Hjalmar's "slides"); corrected, plus: Slate's throws teleport, so they don't make a Bleeding foe bleed.

### Hero lens
- **Simple**: every skill is one verb + at most one rider (counted from what `execute` does), descs 6-21 words, II =
  bigger numbers, III = bigger numbers or one rider (now strictly). Pool of 10, 2 starting.
- **Combos** (setups / payoffs): Bleed (Hemo-Glob, Paper Cuts, the Shiv) → every ally's push / pull ticks it and it feeds
  her passive and Juice Box; Basanos' Bleed feeds her the same way; Blood Puppet Show → allies' AoEs, water + lightning,
  pits, lava, Hjalmar's traps; Blood Drive → an ally's big hit; Say It, Don't Spray It → the whole party disengages
  without attacks of opportunity.
- **Passive**: one rule ("someone else's blood pays") and still the comedic core; it changes how she plays (stand next
  to a Bleeding foe — which, with reach-aware brutes, means taking hits: the "high-risk" in her role).
- **Reads as the user's character** ("a blood-magic wielding goblin", she/her): blood spells paid in HP, Bleed, a drain,
  a blood clone, blood puppetry, an edgy-emo goblin voice.
- **Attacks of opportunity**: a light line-holder (Shiv reaction) who disengages with teleports / dashes / Dazzle /
  Taunt rather than walking.
- **Distinct** from the other 15: the only hero whose costs are paid by enemies; Corelos pays HP for bargains, Basanos
  shares Bleed, nobody else drains or drags by status.

### Remaining (not fixed here)
- A Stealthed Sparrow's own attack of opportunity reveals her (engine rule; Requests).
- The blood price follows the donor's damage-taken modifiers (Vulnerable / Frozen / Marked / stone form): by design
  (status damage, like a Bleed tick), previews exact; the HUD pill says the listed cost (Requests).
- Others' areas: `integration.js` still expects her v1 unlock; DESIGN §6's Sparrow brief is pre-v2 (Requests).

## Public API (for other content)

- Summon `spa_clone` (+ skills `spa_clone_shiv`, `spa_clone_taunt`); items `spa_shiv_of_sharing`, `spa_scab_mail`,
  `spa_donor_card` (effects read by her own code; the Bib has an `onEnterTile` hook).
- `DD.getHero('sparrow').passive.hpPayer(unit, def, level)` → the foe paying that skill's HP cost, or null (HUD).
- Cost objects: anyone firing `modifyCost` on Sparrow can set `c.spaNoDonor = true` (or `c.noDonor`) to get her raw cost.
- Skill tags used: `bleed`, `blood`, `drain`, `taunt`, `stealth`, `dazzle`, `push`, `control`. Bark keys: the 13
  standard ones + `opportunity`.
- Narrative: `ev_spa_blood_bank` (NARRATIVE) is consistent with v2. Voice: edgy emo goblin ("It's not a phase, Mom."),
  loves blood and shiny vials, hates being called little.

## Deviations

- DESIGN §6's Sparrow brief (pre-v2) gives her passive "more damage the lower her HP; healing when standing in blood".
  v2 keeps ONE rule — someone else's blood pays — because it is the comedic core and changes how she plays (stand next
  to a Bleeding foe). The low-HP frenzy (and its `spa_frenzy` chip) was cut; the blood slurp moved to the Bloodsucker's
  Bib (3 HP). DESIGN names were reworked in v1 (Blood Bolt → Hemo-Glob, Hemorrhage → Thousand Paper Cuts, Sanguine Shield
  → Scab Armor, Exsanguinate → Juice Box, Goblin Scramble → Goblin Mode (a teleport), Blood Puppet → Blood Puppet Show,
  Blood Clone → Evil Twin; Pocket Sand → Say It, Don't Spray It; + Blood Drive, Vein Glory).
- Crimson Tide's `hpCost` is `(L, user) => floor(user.hp / 2)` (0 without a user, so tooltips outside combat show no
  HP pill; the desc says "Costs half your current HP").
- The donor pays in `onCostPaid` (after `modifyCost` charged her 0): only her own skills are waived, so a generic
  HP-cost skill from a tome costs her HP as usual.
- No "can't be opportunity-attacked" rule for her (rules.md suggested it for skirmishers): her escapes already are
  Goblin Mode and Vein Glory, and walking off a brute should stay a real cost for the high-risk goblin.

## Requests

- **Integrator** (`tests/content/integration.js`, "cross-content consistency"): still expects Sparrow's v1 unlock
  `{ act: 2 }`; v2 has `unlock: null` for every hero (DESIGN §3, user request).
- **Lead (DESIGN §6)**: the Sparrow brief still says "(unlock: clear Act 2)" and describes the v1 passive and names; the
  v2 kit is the table above (one-rule passive: an adjacent Bleeding foe pays her HP costs).
- Done / obsolete from v1: AutoPlay now reads `aiScore` (Goblin Mode gets cast), `onCostPaid` exists, the HUD shows "paid
  by" via `passive.hpPayer`.
- **Rules / engine** (review, optional): a Stealthed unit makes attacks of opportunity and its hit reveals it
  (`opportunityOf` only exempts stealthed *movers*). For Sparrow's Goblin Mode (and any melee hero under a Smoke Bomb)
  that means an automatic reaction she can't decline ends the Stealth her skill promised. Consider: stealthed units make
  no attacks of opportunity, or the reaction doesn't break Stealth. Her suites don't pin either behaviour.
- **HUD** (review, optional): the "paid by" pill / aim hint say the donor "pays the N HP"; the payment is Bleed-tagged
  status damage, so a Vulnerable or Frozen donor actually loses a little more (3 → 4 / 5) and a Marked one adds its Mark.
  The skill preview has the exact number; the pill could show the previewed loss.

## Known issues

- A resolve that skips paying (`resolveSkill(..., { pay: false })`) charges nobody — fine — but a content `modifyCost`
  that *adds* HP cost after her passive zeroed it would charge both her (the extra) and the donor (the raw cost). None
  exists today.
- Bleed decays at the end of the bleeder's own turn, before it next walks: a lone Bleed 1 that the foe never moves on
  does no damage by itself; its value is the donor rule, Juice Box, allies' shoves and Puppet Show. Engaged foes walk
  less under the v2 targeting, so pushes matter more than walks.
- Drawing blood from a sleeping donor wakes it (damage wakes sleepers); the target preview shows it.
- Blood Puppet Show aims through one of the 4 adjacent tiles (engine `dir` targeting): on the map edge she can't pick the
  direction off the board.
- Hey, Ugly! has the same radius at clone levels I and II (2, 2, 3): the clone's level follows Evil Twin's, whose II
  upgrade is the clone's HP and Copycat Shiv damage.
- The blood price is status damage (like a Bleed tick): Block and armor never stop it, but the donor's damage-taken
  modifiers do — Vulnerable 3 → 4, Frozen 3 → 5, a Mark is consumed on it (+its stacks), a stone-formed gargoyle pays a
  quarter. Previews show the exact loss.
- A Stealthed Sparrow's own attack of opportunity reveals her (see Requests).

## History

- **v1** (phase 1-4 + adversarial review): three-part passive (frenzy +25% / +50% damage under 50% / 25% HP with a
  `spa_frenzy` chip, slurping blood heals 3, donors), Juice Box drained the Bleed and stunned at III, Spray left blood,
  Goblin Mode III Empowered, Blood Drive III Inspired, Vein Glory +damage vs Bleeding and an AP refund on kills, the clone
  popped for Bleed 2 + a blood splash, items with stat riders (+10% damage, +5 HP, +10 Hype, donors pay double), telegraph
  tools (taunt redirects, Dazzle on intents, Block vs telegraphs), unlock act 2. Archived in `.tmp/sparrow/`.
- **v2** (an interrupted earlier pass + this one): everything above simplified to one verb + one rider, v2 durations,
  init +3, `unlock: null`, no Guard / starting Block, items one rule each; this pass added the attack-of-opportunity
  suite and combos, the `opportunity` barks, barks for Valdris / Hjalmar / Pebbles, the Juice Box payoff buff, and these
  notes.
- **v2 review** (adversarial): Scab Armor III = 10 Block + Thorns 3 (was 12 + Thorns: III is bigger numbers *or* a
  rider), Hemo-Glob's desc no longer says "your own blood", her reaction barks de-duplicated from Betty's / Valdris',
  combo names in these notes corrected; tests tightened (strict III rule, desc guard). See "Review (v2)".

## Requests (Nov 3) — heals that revive, barrels, flyers (CONTENT SWEEP heroes-1, 2026-11-04)

Suite: `hero_sparrow: v2 requests — …`. Rules: `docs/notes/rules.md` "v2 requests".

- **Heals.** Blood Drive no longer returns early on a downed ally (`!a || a.dead`): aimed at one it gets it up with its
  HP (4 / 6 / 8, "UP! N HP" = reality), then Empowers it; she still pays her 3 HP (or a Bleeding donor does). Juice Box
  (a drain on a foe) never revives.
- **Barrels.** Shiv Happens and the clone's Copycat Shiv can be aimed at an adjacent volatile object (she is in the
  blast; no Bleed on a barrel). **Vein Glory opts out** (`target.objects: false`): the dart is the point, and on a barrel
  it would have been a 3-AP ranged blast with no dart. Hemo-Glob is a spell (not barrel-aimable by the rule).
- **Flyers.** Bloodsucker's Bib checks `DD.Grid.feelsSurface(unit, tile)`: a flying Sparrow (wings from a status, an
  item or a Blessing) floats over blood and slurps nothing (tested); landed, she slurps again.
