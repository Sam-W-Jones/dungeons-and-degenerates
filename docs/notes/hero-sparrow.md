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
| `spa_juicebox` ⭐ | Juice Box 🧃 (spell) | 2 AP, cd 2 | drain a foe within 2: 5 damage +3 per Bleed on it, heal the damage dealt (all of it since D9, Nov 12) | 7 +3 / 8 +4 |
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
- **Juice Box's desc is two sentences with an "If" (Nov 18, plan §4.8):** the plan's final text adds the share ("If it
  was Bleeding, the most hurt ally within 2 of you also heals half of that (rounded up).", 37 words at I). Her simplicity
  suite's one-breath rule (≤ 22 words, no if/else) now exempts Juice Box: ≤ 40 words, ≤ 2 sentences, its one "If it was
  Bleeding" clause. See "Conditional heal (Nov 18)" below.

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

## Sustain (Nov 12) — Juice Box drinks it all (D9; spec `.tmp/wf13/sustain-spec.md` §1.3, owner HERO-TRIO)

The user (D9): no generic heal for every party (the First-Aid Fanny Pack left the starting kit); sustain comes from each
hero's own verbs, spread over skills, items and passives. Sparrow's is her starting skill Juice Box: she is the vampire
goblin with a juice box, and draining a Bleeding foe was already her sustain fantasy. Why her: the lowest run-win share
(0.38x the median) and the most downs (0.54 a fight) in the no-pack sim, from a 22-HP pool and her own HP costs.

- **Juice Box** (`spa_juicebox`, AP 2, cd 2, range 1-2, LOS, levels `{5, +3}`, `{7, +3}`, `{8, +4}` unchanged) now heals
  **all the damage dealt** (was half, rounded up). `dealt` = the return of `Act.damage`: the HP the foe really lost (no
  overkill; HP that Block soaked up doesn't count). Objects are never targets (`foeOf`). It never revives anyone (self,
  active only). A `Slurrrp!` pop-up (blood red) over her; the log is Act.heal's `Sparrow heals N HP.`
- **Desc** (18 words, one sentence, no if/else words; her cap is 22): `Drain a foe within 2: deal 5 damage +3 per Bleed on
  it, and heal the damage dealt.` (II: 7 / +3; III: 8 / +4).
- **AutoPlay** (`aiScore`): the Bleed on the target as before, plus, in the **quick pass only**, `min(AI.estimate(dmg +
  per × Bleed), missing HP) × (1.5 below half HP, else 0.8)`. The quick pass credits `L.heal` only to friends in the
  area, so it never saw a self-heal on a skill aimed at a foe (AutoPlay drank 0.5 times a fight). With `ctx.autoplay`
  (the exact pass) it returns the Bleed only: the dry run already prices the real heal.
- **Loading tip** (her file, `DD.registerNarration('tips', …)`): `Juice Box heals Sparrow for every point it drains.
  Bleed it first: every Bleed on the foe makes the box bigger.`
- Example: level I against 1 Bleed, 8 damage heals 8, about every 3rd turn (it healed 4 before).
- Unchanged: Blood Price, her HP costs never take her below 1 HP, the Bib, Blood Drive.

**Tests** (`hero_sparrow: Juice Box`): each level with 3 Bleed heals exactly `6 + dealt` (run at hero level 3, 28 max HP,
so no cap hides the III drink of 20; asserted to fit); no Bleed: `10 + L.dmg` ("heals all of it"); a kill heals the 3 HP
actually drained (`10 + 3`); Block soaking 2 heals only the HP that got through; full HP: no overheal; the `Slurrrp!`
pop-up over her; `aiScore` at full HP = the Bleed, hurt in a quick ctx = Bleed + `min(est, missing) × 0.8` (× 1.5 below
half), with `ctx.autoplay` = the Bleed; the loading tip exists (≤ 140 chars). `v2 requests`: Juice Box next to a downed knight heals her `10 + 5` and the knight
stays down. The simplicity suite (18 words, `damage+heal`) passes unchanged.

**Fallbacks** (balance pass 3 decides, spec §9): if she runs hot (more than ~8 HP a normal fight, or above ~1.2x the
median), heal two-thirds of the damage dealt, rounded up. If she stays below ~0.6x, raise the range 1-2 to 1-3 (desc
`within 3`).

**Deviations**: none from the spec's mechanics or texts. Test-only: the spec's `:503 hp == 6 + dealt` runs at hero level 3
(at level 1, 22 max HP, the III drink of 20 would cap at 22); two extra cases (Block, pop-up) were added.

## Review (sustain, Nov 12) — adversarial review: the user's intent and the rules text (ADVERSARIAL REVIEWER role)

- **Verified** (suites; scratch harness `.tmp/rev13/rt.js` on real encounters with real allies; `tools/sim.sh`): Juice
  Box heals exactly the HP the foe lost (no overkill, nothing Block soaked), self only, never a revive; desc == execute
  at I-III ("Drain a foe within 2: deal 5/7/8 damage +3/3/4 per Bleed on it, and heal the damage dealt."); the
  `Slurrrp!` pop-up, Act.heal's log line and the preview agree; the quick-pass `aiScore` adds the drain, the exact pass
  leaves it to the dry run. In real fights (harness, 9 / 7 / 7 fights at I / II / III): 0.1 / 0.7 / 1.0 uses and
  0.4 / 4.1 / 8.0 HP a fight; in the act 1 sim (`seeds=8&from=7000&stop=1&party=slate,basanos,sparrow,marwyn&dump=1`,
  33 fights): **1.2 uses a fight** (the spec's target: at least 0.9; it was 0.5).
- **Fixed**: nothing. **Not changed**: III's 8 HP a fight sits at the spec's "hot" line (about 8 a normal fight): a
  balance-pass watch (fallback: two-thirds of the damage dealt, rounded up). Her tip and texts use no he / him.

## Review (sustain, Nov 12) — engine, AutoPlay and tests (ADVERSARIAL REVIEWER role)

Probes: `.tmp/rev-engine/probe.js` (scratch page, one Chrome slot; real act 1 encounters through `DD.Encounter.build` +
`DD.AutoPlay.runBattle`; AutoPlay traces with `DD.AutoPlay.trace = 'all'`); in-memory mutants (`&mut=`, no file on disk
changed).

**Verified (by running code)**
- The Juice Box preview shows her exact heal (+8 at level I on a 1-Bleed grunt) and leaves the board and the log
  untouched; over 20 AutoPlay fights all 17 real drinks healed through a real (non-simulated) `DD.Act.heal`.
- AutoPlay drinks when it matters: at 1 HP next to a Bleeding grunt the exact pass rates Juice Box about 100 against
  23 for the next option; at 9 / 22 with the grunt 2 tiles away she drinks from where she stands. In real fights, on her
  hurt turns (below 60% HP) with Juice Box ready and a foe in reach at the start of her turn, she drank 6 times in 9.
- The tests catch it: a mutant that heals half again fails 7 assertions (Juice Box, the v2 requests suite).

**Not changed (minor)**: the quick-pass term prices `min(estimate, missing)`, and `DD.AI.estimate` is after armor but
before the foe's Block and uncapped by its HP, so a drink at a 2-HP foe is over-rated in the quick pass. The exact pass
(dry run) prices the real heal and makes the decision, so only the shortlist can be off; spec formula kept.

## Balance refit (Nov 12) — Juice Box range 2 → 3 (BALANCE REFIT 1, spec §9 fallback; docs/notes/balance.md "Sustain refit - act 1")

- **Why**: her run-win share stayed far under 0.6× the median with the D9 drain: 0.47× (10 of 47 runs, campaign 200
  runs, seeds 11000+; the audit's no-pack B0: 0.38×), and Juice Box was cast only 0.7 times a regular fight (target 0.9)
  at range 2. The spec's pre-agreed fallback for "still below 0.6×" is range 3 (she isn't hot: 4.2 HP a fight).
- **Change**: `JUICE_RANGE = 3` (target range [1, 3]; desc `Drain a foe within 3: …`, 18 words as before). Nothing else.
- **Measured** (act 1 only, 300 runs, seeds 7000+, same seeds as before): Juice Box 0.7 → **0.9** casts a regular fight
  (elite 1.0 → 1.4, boss 0.5 → 0.9); she heals herself 4.1 / 7.2 / 5.8 HP a regular / elite / boss fight (≤ ~8, not
  hot); her downs 0.40 → **0.29** a fight. Whole-run share: see balance.md (campaign validation).
- **Tests**: `hero_sparrow: Juice Box` now drinks from 3 tiles away, asserts range 3, the "within 3" desc and a foe 4
  tiles away out of reach.
- **Docs** (request to DOCS): DESIGN §6 Sparrow brief and the v2-digest §2 Juice Box line say "within 2"; they should say
  "within 3".

## Finish (Nov 14) — the playtest findings held for the sustain build (FIX: CONTENT)

- **text-tone-8 / review-open-10 (fixed)**: her "Tell my blood... I loved it..." (a twin of the Rat's "Tell the
  cheese... I loved it...") is now "Return my blood... to sender...".
- **heroes-v1 / desc-sweep-5 / review-open-7 (fixed)**: Hemo-Glob, Juice Box, Thousand Paper Cuts, Goblin Mode, Evil
  Twin, Blood Drive and Vein Glory print `DD.Targeting.reach`.
- Suite `hero_sparrow: finish — her last words are her own …`. D1 opt-out kept: Vein Glory (the dart is the point; a
  22-damage point-blank barrel selfie). D7: two swap barks. Numbers: none changed.

## Review (finish, Nov 14) — REVIEWER

- D1 / D4 with her real kit: Hemoglobin and Juice Box now hit a crate for exactly their 🔨 number and drain nothing (no
  heal from a crate: D1's "no lifesteal"); Vein Glory stays an opt-out. Her twin death line and the range texts hold.

## Conditional heal (Nov 18) — "Sharing Is Caring (Ew)" (build:g1; plan `.tmp/heal/plan.md` §4.8, the user's Nov 18 request)

The user (Nov 18): "I want everyone else brought up but by conditional healing". Sparrow's D9 heal (Juice Box) is
broadened: a Bleeding foe's juice is shared with a hurt friend.

- **What:** Juice Box drains a foe that was Bleeding at the cast (`stacks > 0`, read before the damage, as before) and
  `dealt > 0`: her own heal is unchanged (all the damage dealt, unlabelled), then the most hurt active ally within 2 of her
  (`shareTarget`: any active unit on her side, not her, Manhattan ≤ `SHARE_RANGE` 2, missing HP > 0; most missing HP,
  ties: the lower HP ratio, then party order) heals `ceil(dealt × SHARE)`. Nobody hurt in reach, a downed ally, Block
  soaking it all (dealt 0) or Sparrow down mid-drain → no share (no call). Never a revive (`active(ally)` and her own
  `active` are checked before the heal).
- **Numbers:** `SHARE = 0.5`, `SHARE_RANGE = 2` (new `DD.Sparrow = { SHARE, SHARE_RANGE, JUICE_RANGE, shareOf,
  shareTarget, shareWord }` at the end of the file). I with 2 Bleed: she drains and heals 11, the ally heals 6. Tuning
  range: SHARE ½ [½, ⅔] (the desc word comes from `shareWord()`: "half" / "two thirds").
- **The call:** `A().heal(sparrow, ally, ceil(dealt × SHARE), { via: 'lift:sparrow' })` (the share only; her own drain stays
  unlabelled); a "Sip!" pop-up, a beam and the bark (`share`, 0.4: "Here. Sip. Don't make it weird." / "Sharing is caring.
  Ew." / "Bendy straw, best friend edition.") only when it healed > 0.
- **Texts (desc == execute):** Juice Box I: "Drain a foe within 3: deal 5 damage +3 per Bleed on it, and heal the damage
  dealt. If it was Bleeding, the most hurt ally within 2 of you also heals half of that (rounded up)." (II 7 / +3, III 8 /
  +4; the reach from `reach()` as before; "Drain a foe within 3:" kept for the docs tests.) Tags / kind unchanged
  (`['blood', 'drain', 'heal']`, spell; no `L.heal`).
- **AutoPlay:** the exact pass dry-runs the share (both heals in the preview). The quick-pass branch of `aiScore` adds,
  when the target is Bleeding, `DD.AutoPlay.healWorth(ally, ceil(est / 2))` for the ally `shareTarget` would pick (est =
  the drain estimate it already computed); the exact pass still returns the Bleed only.
- **Short Fuse:** the share healing Slate gives him +1 Rage (another src: intended; checked in hero_slate's new suite).
- **Tests:** new suite `hero_sparrow: conditional heal (Nov 18)` (51 assertions): at I/II/III with 2 Bleed she heals the
  dealt and the knight 2 tiles away heals ceil(dealt / 2) (preview == reality), one labelled share call (src Sparrow) and
  her drain unlabelled, her heals stat grows by both; the plan's case (11 / 6); the more hurt of two allies; a tie → the
  lower HP ratio; an ally 3 tiles away → no share; only a full-HP ally → no call; no Bleed → her heal only; a downed
  ally skipped for the hurt mage (and stays down); only a downed ally → no share; Block soaking all → no share; Sparrow
  down mid-drain → neither heal; three hurt allies → one share; the exact descs at I/II/III and the plan's sentence;
  the preview shows +11 on her and +6 on the knight; aiScore: nobody hurt → Bleed only, a hurt knight → + healWorth(knight,
  ceil(est / 2)), exact pass → Bleed only, no Bleed → 0; barks.share. Updated: the simplicity suite's one-breath rule
  (the Deviation above; nothing deleted).
- **Sanity sim** (`bash tools/sim.sh "debug=1&raw=1&seeds=30&from=50100&stop=2&party=sparrow,basanos,marbles,zarathor"`,
  `.tmp/heal/g1/sparrow.txt`, 30 runs, 225 fights): `lift:sparrow` **0.23 fires a fight, 1.4 HP a fight to others**
  (overheal 8%); regular 0.17 / 0.6, elite 0.5 / 2.8, boss 0.3 / 3.5. T8: HP inside the band (0.8-3.2); fires a hair under
  the 0.25 minimum (n = 225 fights, within the noise of a 30-run page). Juice Box was cast 1.0 times a fight; about a
  quarter of the drains had a Bleeding target and a hurt friend within 2. No AutoPlay change made (the exact pass already
  dry-runs the share from every tile it walks to).

- **Test runs (Nov 18, build:g1):** `tools/test.sh "suite=hero_slate,hero_sparrow,hero_marwyn,hero_josiah&isolate=slate,sparrow,marwyn,josiah"`: 94 suites, all pass but the two that need other heroes loaded (Kiri / Basanos / Valdris; they pass in the full run). One full `bash tools/test.sh`: 1309 suites, 150,284 ok, 3 failures, all in "content: descriptions at every level" (status `val_dented` desc: `fn.apply is not a function`, valdris.js, G2's work in progress); 0 swallowed "Error in" lines from the G1 files.
- **Review (Nov 18, review:g1, adversarial):** read end to end against plan §4.8 / §3. Bleed is read before the damage,
  `dealt` is the HP the foe really lost, the share needs `stacks > 0`, `dealt > 0`, an active Sparrow and an active,
  hurt unit on her side within Manhattan 2 (`DD.Grid.dist`), most missing HP, then the lower ratio, then `state.units`
  order (heroes in party order, summons after); src = Sparrow, `via` lift:sparrow, her drain unlabelled; Juice Box only
  ever targets a foe, so no aimed revive can ride on it. **Added** to the suite: the combat HUD itself wears both
  heals (Juice Box armed with key 2, the cursor on the Bleeding grunt: overlay badges +11 on her, +6 on the knight; the
  renderer's green "+N" badge reads exactly these). A hover can't be staged through `tools/shot.sh`, so this HUD-level
  assertion stands in for a screenshot. **T8 re-measured** on fresh seeds:
  `bash tools/sim.sh "debug=1&raw=1&seeds=30&from=55100&stop=2&party=sparrow,slate,pebbles,syllamin"` (226 fights):
  **0.14 fires, 0.8 HP a fight to others** (regular 0.07 / 0.2, elite 0.35 / 2.0, boss 0.34 / 2.5; overheal 5%); Juice
  Box 1.0 a fight (baseline 1.1); 0 errors, 0 DD.warn, 0 stalls. Pooled with the build page (451 fights): ~0.19 fires,
  ~1.1 HP to others: HP inside T8's 0.8-3.2 band, fires under its 0.25 minimum. Cause: opportunity (a Bleeding target
  AND a hurt friend within 2 at the cast, Juice Box on cooldown 2), not a bug; the plan's AutoPlay terms are as written
  (the exact pass dry-runs the share). `SHARE` ⅔ would lift HP, not fires: the lead's call (balance pass, plan §7).

### DESIGN §6 brief (Nov 18)
Anchor (unique in `docs/DESIGN.md`, `### Sparrow the Hemogoblin`, lines 527-528 today):

```
- Basic *Shiv Happens* (4 and Bleed 1, adjacent). Starters: *Hemo-Glob* (2 HP: a ranged hit and Bleed) and *Juice
  Box* (drain a foe within 3: more damage per Bleed on it, and she heals the damage dealt).
```

Replacement (keeps the pinned "*Juice Box* (drain a foe within 3:", i.e. "Box* (drain a foe within 3:" after the wrap):

```
- Basic *Shiv Happens* (4 and Bleed 1, adjacent). Starters: *Hemo-Glob* (2 HP: a ranged hit and Bleed) and *Juice
  Box* (drain a foe within 3: more damage per Bleed on it, and she heals the damage dealt; if it was Bleeding, the most
  hurt ally within 2 of her also heals half of that, rounded up).
```

### QA fixes (Nov 18, qa-fix:heal)
- **[heal QA-1] the log says why the ally healed.** A share that heals (> 0) now logs, right after "<ally> heals N HP
  (Sparrow).": "Sparrow shares the juice with <ally>. Bendy straw. Don't make it weird." Test: "hero_sparrow:
  conditional heal (Nov 18)".
- **[heal QA-5] heroes first.** `shareTarget` prefers a hurt hero: a summon (her Blood Clone, Zarathor's Statue of Me,
  Ellaria's corgis, Onyx) drinks only when no hero within 2 is hurt; inside each group the order is as before (most
  missing HP, then the lower HP ratio, then party order). The desc says so: "... the most hurt ally within 2 of you
  (heroes first) also heals half of that (rounded up)." Fires are unchanged (any hurt unit in reach still fires); only
  the target moves (the audit measured 0.07 HP a fight to summons against 1.20 to others). DESIGN §6 and v2-digest §2
  carry "heroes first". Tests: "hero_sparrow: conditional heal (Nov 18)" (a more hurt summon loses to a hurt hero; the
  summon drinks when no hero is hurt; the desc).

### Deviations (Nov 18, qa-fix:heal)
- Plan §4.8 says "any unit on her side" and gives the desc without "(heroes first)". QA-5 (the lead decides) offered
  "say so in the desc" or "prefer heroes"; this fix takes "prefer heroes" AND says it in the desc, so desc == execute.
  The user's words ("I want everyone else brought up") are about the heroes; a decoy statue built to be beaten was the
  "most hurt" ally too often. To revert: drop the `bh` (hero) test in `shareTarget` and " (heroes first)" in the desc
  (and in DESIGN §6 / v2-digest §2).
