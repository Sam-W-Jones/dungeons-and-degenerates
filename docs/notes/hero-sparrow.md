# HERO — Sparrow the Hemogoblin (notes)

Files: `js/data/heroes/sparrow.js`, `tests/content/hero_sparrow.js` (17 suites `hero_sparrow: …`).
Run: `bash tools/test.sh "suite=hero_sparrow&isolate=heroes/sparrow,hero_sparrow"` (and `suite=content:` with the same isolate).
Scratch tools in `.tmp/hero-sparrow/` (not game code): `sim.html/sim.sh` (AutoPlay balance sim vs the fixture rogue),
`scene.html/scene.js/sceneshot.sh` (scripted scenes in the real renderer + HUD for screenshots), `descs.html` (every desc).
Review tools in `.tmp/hero-sparrow-review/`: `probe.sh "probe=<file>.js&keep=all"` (scratch probes), `sim.js` (real heroes
in random parties vs real encounters), `simskill.js` (each pool skill forced into her loadout), `lineshot.sh` /
`closeshot.sh` / `varshot.sh` (sprite line-ups on every floor, close-ups, palette variants), `sceneshot.sh` (HUD scenes),
`mut_test.sh` (runs the suites against `mut_sparrow.js`, a copy with the review fixes reverted).

## Summary

A pint-sized goblin edgelord blood mage (DESIGN §6 "Sparrow — Goblin Blood Mage", user brief "a blood-magic wielding
goblin"): high-risk bleed assassin who pays for spells in blood — hers, ideally someone else's. Complexity 3,
unlock `{ act: 2 }`, 22 HP (+3/level), 3 AP, move 5, colour `#c0102a`.

**Passive — Blood Price** (all in `passive.hooks`):
- Under 50% HP she deals +25% damage, under 25% HP +50% (`modifyOutgoingDamage`, reads live HP, so the HP a skill just
  paid already boosts that skill). A cosmetic **Blood Frenzy** chip (`spa_frenzy` 🦇, stacks 1/2) mirrors the tier.
- Stepping into blood — or starting her turn in it — **slurps** it: heal 3 (only when hurt; the pool is consumed).
  Bleeding foes leave blood when they move or are pushed, so she chases their trails.
- **Someone else's blood:** her HP costs are paid by an adjacent Bleeding foe instead (nearest, then most Bleed;
  never an invulnerable one, nor the foe charming her). `modifyCost` zeroes her cost (HUD shows 0♥, she can cast at 1 HP), and `payInBlood(ctx)`
  — the first line of every HP-cost skill — charges the donor (cause `status`, ignores Block/armor). Nothing moves
  between `Combat.pay()` and `execute`, so both see the same donor.

**Kit** (ids `spa_*`; ♥ = HP cost):

| Skill | id | Cost | Levels I / II / III | Role |
|---|---|---|---|---|
| Shiv Happens (basic) | `spa_basic` | 1 AP | 4 dmg + Bleed 1 (melee) | bleed engine |
| Crimson Tide (signature) | `spa_signature` | 2 AP, 100 Hype, ½ current HP | every foe ≤3: 15 dmg + Bleed 3, swept 1 tile; blood floods radius 2 | set piece |
| Hemo-Glob ⭐ | `spa_hemoglob` | 1 AP 2♥ cd1 | 6+B1 / 8+B1 / 9+B2, range 5 LOS | ranged burst |
| Juice Box ⭐ | `spa_juicebox` | 2 AP cd2 | 5/7/8 dmg +2/+2/+3 per Bleed, drains Bleed, heal ½ dealt; III: 3+ Bleed → Stun | drain / cancel |
| Thousand Paper Cuts | `spa_papercuts` | 2 AP 2♥ cd2 | radius 1: 3+B2 / 4+B2 / 5+B3 | AoE bleed |
| Say It, Don't Spray It | `spa_spray` | 2 AP 2♥ cd2 | cone 2/2/3: 3/4/5 dmg + Dazzled, blood on the cone | soft cancel + blood |
| Scab Armor | `spa_scab` | 1 AP 3♥ cd2 | 8 / 10 / 12 Block (+Thorns 3) | defend |
| Goblin Mode | `spa_goblinmode` | 1 AP cd3 | teleport 4 / 5 / 5 + Stealth through her next turn (+Empowered) | evade tracking shots |
| Blood Puppet Show | `spa_puppet` | 1 AP 2♥ cd2 | every Bleeding foe ≤4/5/5 dragged 2/2/3 in a chosen direction | reposition / combo |
| Evil Twin | `spa_twin` | 2 AP 4♥ cd1, 2 charges | Blood Clone 8/11/14 HP; foes ≤1/1/2 Taunted (redirect or fizzle) | decoy / redirect |
| Blood Drive | `spa_blooddrive` | 1 AP 3♥ cd2 | ally ≤4: heal 4/6/8 + Empowered (+Inspired 2 turns) | ally combo |
| Vein Glory | `spa_veinglory` | 3 AP 4♥ cd3 | dart next to a foe ≤3: 13/16/19 (+4/5/6 vs Bleeding); kill → +3 AP | big finisher |

⭐ = starting skills. Telegraph tools: Juice Box III faint (cancel), Evil Twin / Hey, Ugly! taunt (redirect or cancel),
Say It, Don't Spray It (Dazzle), Blood Puppet Show / Crimson Tide (drag self-anchored attacks with their owner, pits,
lava, water, walls), Goblin Mode (tracking shots lose her), Scab Armor (Block). Combos with other heroes: Blood Drive
(an ally's next hit +50%), Blood Puppet Show (drag Bleeding foes into an ally's AoE / Corelos' runes / hazards; she is
the only hero who applies Bleed, so she arms it herself), Evil Twin (pulls attacks off allies).

**Summon** `spa_clone` "Blood Clone" (2 AP, move 4, random names: "Sparrow?", "Worraps", "Sparrow (Director's Cut)"…):
`spa_clone_shiv` "Copycat Shiv" (3/4/5 dmg + Bleed 1) and `spa_clone_taunt` "Hey, Ugly!" (Taunt foes within 2/2/3,
cd 1). `hooks.onDeath`: pops — adjacent foes Bleed 2 (credited to Sparrow, so the Shiv of Sharing makes it 3), blood
splashes radius 1 (she slurps her HP back). Arrives with 0 AP, acts from her next turn.

**Items** (all `hero: 'sparrow'`): `spa_shiv_of_sharing` Shiv of Sharing (rare weapon, +10% dmg, every Bleed she
applies +1 stack — her descs show it), `spa_scab_mail` Scab Mail (rare armor, +5 max HP, slurps heal 5),
`spa_donor_card` Organ Donor Card (Not Hers) (legendary trinket, +10 Hype, donors up to 3 tiles away and they pay double).

**Status** `spa_frenzy` "Blood Frenzy" (buff, cosmetic, icon 🦇). **Sprite**: tiny hooded goblin (scale 0.9, crimson
hood `#7d1630`, green skin, glowing red eyes, fangs, two daggers, blood aura) + overlay: long goblin ears poking out of
the hood (one silver hoop in the back ear), glowing blood tears running from the eyes, chest rune sigil, blood vial.
The clone is a red recolour with the same ears and drips. Barks: 5-6 lines for all 13 keys (≤ 70 chars), naming
Marwyn, Josiah, Zarathor, Corelos, Buga, Marbles, Ellaria, Slate and Syllamin.

**Tests** (17 suites, ~860 assertions, all pass isolated and in the full run, also with seeds 7 / 99 / 2024 / 31337):
registry/desc/barks; passive (frenzy tiers, chip, slurps by walking/pushing/turn start, donors incl. ties,
invulnerable, dying donors, 1 HP); every skill at every level (damage, statuses, displacement, summon HP/levels, costs,
AP, cooldowns, charges, ranges/LOS); the signature (HP cost, frenzy, edges, pits, kills); the 3 items; edge cases
(silenced/stunned/sheep/charmed user, empty and null targets for every skill, deaths mid-skill, map corner, pits, AP);
previews vs reality for all 12 skills with and without frenzy + donor; AutoPlay with
`['sparrow','test_knight','test_cleric','test_mage']` vs fixture acts 1-3 at L1/4/7/10 (normal/elite/normal/boss), a
decoy loadout fight, and a sandbox turn where AutoPlay must unleash Crimson Tide at 100 Hype. Last run (seed 12345):
12/12 wins; AutoPlay used Hemo-Glob ×26, Juice Box ×9, Paper Cuts ×6, Puppet Show ×5, Spray ×4, Vein Glory, Evil
Twin ×2 (+ clone ×2), Scab Armor, Crimson Tide, basic ×10.

**Balance** (scratch sim, AutoPlay, fixture party, 54 fights per level, normal): damage share 35/40/41/44% at
L1/4/7/10 vs the fixture rogue's 35/36/35/39%; no downs; she pays ~5-11 HP per fight and bottoms out at ~80% HP
(AutoPlay keeps her at range). Brutal at act-appropriate levels: 100% wins, 3% downed (rogue: 0-3%).
Against the real heroes and encounters (review sim, see "Review" below): 28% damage share (4th of 10), 14% downed on
normal; 27% / 22% on brutal — middle of the pack for a damage dealer.

## Public API (for other content)

- Status `spa_frenzy` (cosmetic Blood Price chip; stacks 1 = +25%, 2 = +50%; no hooks — the passive reads HP).
- Summon `spa_clone` (+ skills `spa_clone_shiv`, `spa_clone_taunt`); its `onDeath` pop is safe when the owner is gone.
- Items `spa_shiv_of_sharing`, `spa_scab_mail`, `spa_donor_card` (effects are read by Sparrow's own code, no item hooks).
- Cost objects: anyone firing `modifyCost` on Sparrow can set `c.spaNoDonor = true` to get her raw HP cost (the donor
  rule is skipped).
- Skill tags used: `bleed`, `blood`, `drain`, `taunt`, `stealth`, `dazzle`, `push`, `control`.
- Events/narrative: DESIGN §11 lists "Sparrow's blood bank" (done by NARRATIVE: `ev_spa_blood_bank` in
  `js/data/events.js`) — Sparrow's voice: edgy emo goblin ("It's not a phase, Mom."), loves blood, shiny vials, hates
  being called little.

## Deviations

- DESIGN names reworked (same mechanics where they worked): Blood Bolt → Hemo-Glob, Hemorrhage → Thousand Paper Cuts,
  Sanguine Shield → Scab Armor, Exsanguinate → Juice Box, Goblin Scramble → Goblin Mode (teleport, not a walk),
  Blood Puppet → Blood Puppet Show (drags *every* Bleeding foe in range in one chosen direction), Blood Clone → Evil
  Twin. Pocket Sand was dropped (it is a generic skill/consumable) for Say It, Don't Spray It (Dazzle + blood); added
  Blood Drive and Vein Glory.
- "Heals while standing in blood" is implemented as slurping: entering a blood tile or starting her turn on one heals
  3 and consumes the pool (no healing at full HP, the pool stays).
- Crimson Tide's `hpCost` is `(L, user) => floor(user.hp / 2)` (0 without a user, so out-of-combat tooltips show no HP
  pill; the desc says "Costs half your current HP").
- The donor payment happens inside `execute` (`payInBlood`), relying on `modifyCost` having charged Sparrow 0. So the
  waiver only applies to her own skills (`owner: 'sparrow'`, all of which call `payInBlood` first): a generic HP-cost
  skill learned from a tome (none exist yet) costs her HP as usual instead of being free with nobody paying.

## Core fixes

None.

## Requests

- **RULES (AutoPlay, optional)**: AutoPlay ignores `aiScore` and values Block / Stealth / teleports at ~0, so it never
  casts Goblin Mode and rarely Scab Armor (Blood Drive does get cast: it heals). Reading `aiScore` in
  `quickScore`/`exactScore` (or valuing Block on a threatened unit) would let balance sims exercise defensive skills.
- **RULES (optional)**: `Combat.pay()` changes HP without any hook; a `modifyCost`-like post-payment hook (or firing
  `onSkillUsed` with the paid costs) would let passives react to HP costs without re-deriving them.
- ~~**NARRATIVE**: the "Sparrow's blood bank" hero event~~ — done (`ev_spa_blood_bank`).
- ~~**PASSIVES**: treat Sparrow as an HP-payer~~ — done (`REQ.hpPayer` names her; `rp_blood_bank_card`'s `modifyCost`
  runs after her passive, so with a donor the donor pays the reduced cost — consistent).
- **HUD (optional, from the review)**: when `costOf` shows her HP cost waived by a donor, nothing says *who* pays until
  the target preview shows the donor's "−N" badge. A "paid by <foe>" hint on the HP pill would teach the passive.

## Known issues

- If some other system resolves one of her HP-cost skills **without paying** (`resolveSkill(..., { pay: false })`)
  while a Bleeding foe is adjacent, that foe still pays the blood price. Nothing does this today (Buga-style "free
  basic attack" effects hit her basic, which costs no HP).
- A content `modifyCost` hook that *adds* HP cost after the passive zeroed it would charge both Sparrow (the extra) and
  the donor (the raw cost). Edge case; none exists today.
- The Blood Frenzy chip syncs on damage, healing, skills and turn start; HP changed silently by other code (e.g. a
  Help Up revive, which fires no hook) shows a stale chip until her next turn — the damage bonus itself always reads
  live HP, and a revived hero has 0 AP for the rest of that turn anyway.
- Bleed decays at the end of the bleeder's own turn, before it next walks: a lone Bleed 1 (Shiv, Hemo-Glob I-II)
  never ticks on its own. Its value is the kit's synergies (donor, Juice Box, Vein Glory, Puppet Show, which forces
  the tick). That is the core status (RULES), not hers to change.
- Drawing blood from a sleeping donor wakes it (damage wakes sleepers). Emergent and consistent; the target preview
  shows the donor's "no Asleep" before she casts (tested).
- Blood Puppet Show aims through one of the 4 adjacent tiles (engine `dir` targeting), so on the map edge she can't
  pick the direction off the board, even though the drag itself doesn't care where she stands.
- Say It, Don't Spray It's Dazzle lasts 1 turn: a delayed (⏳2) intent fires after it expired.
- Goblin Mode never shows up in AutoPlay sims (no damage, no heal: AutoPlay scores it 0, see Requests).

## Review

Adversarial review after the author finished. Everything below was checked by running code (scratch probes in
`.tmp/hero-sparrow-review/`), not by reading.

**Verified and left alone**: every desc at every level against `execute` (printed and re-checked), previews against
reality (existing suite + the new cases), `desc(L, null)`, id prefixes, no `Math.random`, no registry warnings, no
swallowed errors; donor edge cases (stealth survives a donor-paid cast: `cause: 'status'` isn't offensive; thorns
don't reflect it; the frenzy doesn't inflate it; Vulnerable and Marked donors pay their usual extra, and Frozen ones
would too, which is just how damage works); Crimson Tide at 1 HP (free), with the Organ Donor Card (the donor pays her whole HP, 41 damage
at L1 — a legendary + signature spike, kept); clone HP 8/11/14; Dazzle redirects (0/40 seeds hit her); rooted Sparrow
can still Goblin Mode / Vein Glory (teleports); slurps at max HP − 1. Kit identity: the only Bleed user among the 10
heroes, HP-cost caster with a frenzy/slurp/donor loop no one else has; barks in voice, all ≤ 70 chars.

**Fixed (most severe first)**:
1. *Latent free lunch.* The passive's `modifyCost` waived the HP cost of *any* skill she used next to a Bleeding foe,
   but only her own skills' `execute` makes the donor pay. A generic HP-cost skill from a tome (items, generic skills
   and passives landed during the review; none has an HP cost yet) would have been free with nobody paying. The waiver
   is now limited to `owner: 'sparrow'` skills, and a test checks every one of her HP-cost skills really charges the
   donor when the HUD shows it free.
2. *Charmed Sparrow could hurt her charmer.* The blood price is status damage, which skips the "can't damage the
   charmer" rule, so a charmed Sparrow next to her Bleeding charmer drained it for free. `donorFor` now skips the
   foe charming her (another adjacent Bleeding foe still donates).
3. *Vein Glory lost its kill refund when the target died paying the blood price.* An adjacent Bleeding target is
   also the donor; if the 4-HP price killed it, `execute` bailed before the refund. "If it dies, regain 3 AP" now
   holds for that death too.
4. *Sprite: the portrait read wrong.* The two white rings on the back ear read as a second pair of googly eyes, and
   the rune tear streaks (a vertical line plus a cross bar under a round glowing eye) read as ♀ signs. Now one small
   silver hoop tucked behind the ear edge, and glowing blood tears running from the eyes (no cross bar). The hood went
   from near-black `#541a2c` to crimson `#7d1630`: she reads as a blood mage at a glance and keeps her silhouette on
   dark floors (obsidian, crypt) and among the green goblin enemies of act 1 (line-ups on 6 floors checked).
5. *Blood Frenzy wore Bleeding's icon (🩸)*, so the buff chip over her head said "Sparrow is bleeding". Now 🦇 (unused
   elsewhere).
6. *Shiv of Sharing vs the clone's pop.* The pop Bleed is credited to Sparrow, but ignored the item that promises
   "every Bleed Sparrow applies is 1 stack stronger". It now adds the stack, and Evil Twin's desc shows it.
7. *Juice Box II was a dead upgrade* (+1 damage, ~+10% with 2 Bleed). Now 5 / 7 / 8 base (+2 / +2 / +3 per Bleed):
   with 2 Bleed 9 → 11 → 14.
8. *Juice Box III popped "\*faints\*" on stun-immune foes* that then showed "Immune!". The popup now only shows when the
   stun lands.
9. Scab Armor III wording: "gain 12 Block and Thorns 3 until the end of your next turn" implied the Block lasts that
   long (Block resets at her turn start). Now "gain 12 Block, plus Thorns 3 until the end of your next turn
   (adjacent attackers take 3 damage)."
10. Bark polish: two "Running on…" low-HP lines and two "still not taller" level-up jokes; one of each replaced (and
    "Goblin on the move." → "Following the blood trail. Yum."). Notes: removed the claim that other heroes' Bleed arms
    Puppet Show (nobody else applies Bleed); marked the NARRATIVE and PASSIVES requests done.

**Tests**: new suite `hero_sparrow: review regressions (…)` — every HP-cost skill of hers really charges the donor
when the HUD shows it free, and a non-Sparrow HP-cost def is not waived; the charmer is no donor (cost, preview, HP)
while another one still pays; Vein Glory's refund when the target dies paying; stun-immune Juice Box III (full drain,
no stun, no popup); pop + Shiv of Sharing (desc and Bleed 3, credited to her); the sleeping-donor wake-up shows in the
preview; every pool skill strictly improves per level and Juice Box adds 2+ per level; Frenzy icon ≠ Bleeding icon;
both sprites paint in 5 poses × 2 facings with no warnings. Mutation check (`mut_test.sh`): a copy with fixes 2, 3, 7
and 8 reverted, then one with 1, 2, 3 and 6 reverted, each fail 7 assertions; the real file passes all 17 suites (881
assertions).

**Balance (review sim, real content)**: `sim.js` puts Sparrow with 3 random real heroes against real encounters picked
by `DD.Encounter.pick`, levels 2-4 / 5-7 / 8-10 for acts 1 / 2 / 3, random legal loadouts, 81 fights per difficulty:

| Difficulty | Sparrow share (rank of 10) | Sparrow downed | Range of the other 9 (share / downed) |
|---|---|---|---|
| Normal | 28% (4th), 57.6 dmg/fight | 14% | 14-31% / 0-24% |
| Brutal | 27% (5th), 71.4 dmg/fight | 22% | 15-32% / 7-36% |

Per act on normal her share is 23-36%. AutoPlay rarely banks 100 Hype: 8-15 signatures in 81 fights for all heroes
together, Crimson Tide 2-3 of them, so its half-HP price doesn't scare AutoPlay off more than the others' do.
`simskill.js` (starters + one forced pool skill, 18 fights each): no pool skill moves her damage share outside 22-31%;
Goblin Mode is never cast by AutoPlay (scored 0), the others 12-27 times. Numbers drift a little from run to run because
other heroes' and bosses' files were still changing during the review.

**Runs at the end of the review**: isolated `suite=hero_sparrow,content:` PASS (25 suites, 4074 assertions, no
registry warnings, no swallowed errors), also with seeds 7 and 2024 and with every other content file loaded. Full
`tools/test.sh`: 456 suites, all 17 `hero_sparrow` suites pass; the 13 failing sections are other areas' in-progress
files (`kit:` generic skills and consumables, `bosses_act1:` Grimble), none touch `spa_` content.
