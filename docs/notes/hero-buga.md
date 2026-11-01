# HERO: Mayor Buga — notes

Files: `js/data/heroes/buga.js` (content), `tests/content/hero_buga.js` (18 suites `hero_buga: …`), this file.
Run: `bash tools/test.sh "suite=hero_buga&isolate=heroes/buga,hero_buga"` · generic checks:
`bash tools/test.sh "suite=content:&isolate=heroes/buga,hero_buga"`.

## Summary

**Mayor Buga, the Toast of the Town** — a lightly buttered slice of sourdough and small-town mayor (Toast (Sourdough)
Mayor, complexity 3, colour `#2a9d8f`, `unlock: { boss: 'grimble' }`). L1 24 HP, 3 AP, move 4, armor 0, +4 HP/level.
Role: support / manipulator / loot engine. He makes his allies do the work, squeezes gold out of every fight and takes
the credit for everything.

- **Passive — Skimming Off the Top** (`hooks.onCombatStart` installs the combat rule `buga_civic_fee`, shown as a
  "Civic Fee" chip in the HUD): every enemy the party (or a foe Buga bribed) defeats while a Buga stands pays 1 gold
  (2 with the Chain of Office). Allies Buga helps with a skill get **Endorsed** (`buga_endorsed`, this turn): the first
  enemy an Endorsed ally defeats is Buga's credit: **+5 Hype, +2 gold** (the endorsement is used up). Kills by a foe
  he bribed are credited too. Plays as: endorse the ally who is about to land the kill.
- **Basic — Campaign Pamphlet** `buga_pamphlet` 🗞️: 1 AP, 4 damage, range 1-4 (LOS).
- **Signature — Toast of the Town** `buga_toast_of_the_town` 🥂: 100 Hype + 2 AP. Every ally +1 AP, Inspired 2 turns,
  Endorsed; every foe that isn't Charmed is Dazzled; the party pockets 10 gold. Banner, flash, shake, coins, glitter.
- **Pool (10)** — starters **Delegate** + **Loitering Fine**:

| id | name | AP / cd | I → II → III |
|---|---|---|---|
| `buga_delegate` 👉 | Delegate | 1 / 1 | the ally best placed to hit a foe within 6 makes its basic attack on it for free → also Mark +2 first → the 2 best-placed allies swing |
| `buga_fine` 🧾 | Loitering Fine | 1 / 1 | 4 dmg (range 3) + Weak (next attack); first fine per foe pockets 2 gold → 5 dmg, 3 gold → 6 dmg, 3 gold, + Vulnerable 2 turns |
| `buga_promise` 🤞 | Campaign Promise | **0** / 2 | ally +1 AP now, −1 AP at its next turn start → kept (no loss) if it defeats an enemy first → +2 AP now |
| `buga_human_shield` 🛡️ | Human Shield | 1 / 2 | swap with an ally within 3, it gains 4 Block → range 4, 6 Block → 8 Block + Buga Stealthed until the end of his next turn |
| `buga_bribe` 💰 | Bribe | 1 / 3 | pay 10 gold (bosses ×3), Charm a foe within 3 this round → 7 gold, range 4 → Charmed 2 rounds (bosses: 1 round) |
| `buga_butter_up` 🧈 | Butter Up | 1 / 2 | ally Empowered (+50% next damaging skill) → + 4 Block → + Inspired this turn |
| `buga_red_tape` 🎀 | Red Tape | 1 / 2 | foe 2-4 tiles away: pull 2 toward Buga + Root (no move next turn) → pull 3 → + 4 damage first |
| `buga_photo_op` 📸 | Photo Op | 2 / 3 | allies within 2 Inspired 2 turns, foes within 2 (not Charmed ones) Dazzled → radius 3 → + 2 Hype per ally/foe pictured |
| `buga_pork_barrel` 🐷 | Pork Barrel | 2 / 1, **2 charges** | 5 dmg (range 4) and a lit Pork Barrel lands behind the foe: 8 fire blast at the end of the round, or at once when hit/lit → 6 / 10 → 7 / 12 + 3 gold when it pops |
| `buga_crumbs` 🍞 | Crumb Trail | 1 / 2 | crumbs on a 5-tile cross within 4 for 3 rounds: grounded foes there (scattered on, walking in, ending a turn) Slowed, grounded allies ending a turn there heal 2, flammable → 4 rounds, heal 3 → 9-tile cross |

- Telegraph tools: Bribe (the foe's planned attack is re-aimed at its own friends at once), Loitering Fine (Weak shows
  up in the telegraph number), Photo Op + signature (Dazzle), Red Tape (moves self-anchored attacks, Root), Human
  Shield (swap an ally out of the red). Positioning: Red Tape (pull into pits/lava/water/AoEs), Human Shield (swap),
  Pork Barrel (object), Crumb Trail (surface).
- Combos with other heroes: Delegate (any ally's basic + their passives: Roasted, MAGNIFICENCE, bleeds…), Butter Up
  (Empowered for a big skill; Butter Up + Delegate = a buttered free swing), Campaign Promise (AP for a big skill), Red
  Tape (pull into an ally's AoE), Crumb Trail (Zarathor's fire races along the crumbs), Pork Barrel (push a foe into it,
  set it alight). Zarathor's Drip Check also likes the extra party gold.
- **Statuses**: `buga_endorsed` (buff, 1 turn), `buga_promise` (debuff, until its next turn start).
- **Surface**: `buga_crumbs` (custom painter: golden tint + toasted crouton cubes).
- **Object**: `buga_pork_barrel` (pink pig barrel with a "$" and a lit fuse; hp 1, smashable, fire-reactive).
- **Rule**: `buga_civic_fee`.
- **Items** (`hero: 'buga'`): `buga_golden_pen` Mightier-Than-the-Sword Pen (weapon, rare: +10% dmg; an Endorsed ally
  that defeats an enemy regains 1 AP), `buga_chain_of_office` Chain of Office (Gold-Plated) (trinket, rare: +10 Hype at
  start; civic fee 2), `buga_toaster` The Re-Election Toaster (armor, legendary: +6 HP, +1 armor; once per combat Buga
  pops back up at 40% HP with 5 Block when downed. Ding!).
- **Sprite**: `base: 'custom'` painter (44 px tall at zoom 1): toast slice with crust rim and toasted gradient, a
  melting 3D butter pat, tilted top hat with gold band, dot eyes + smug brows + big gold-tooth grin, red mayor's sash,
  gold chain with medallion, stubby limbs with white gloves; idle politician wave, attack = point/throw, cast = both
  arms up + open mouth (speech), hurt = squint, downed = X eyes; walk cycle. `portrait: { x: 1, y: -25, r: 19 }`.
- **Barks**: 13 keys × 4-6 lines (≤ 70 chars), plus cosmetic skill one-liners (Delegate, Bribe, Fine, …, credit).
- Every id: `hero:buga`; skills `buga_pamphlet, buga_toast_of_the_town, buga_delegate, buga_fine, buga_promise,
  buga_human_shield, buga_bribe, buga_butter_up, buga_red_tape, buga_photo_op, buga_pork_barrel, buga_crumbs`;
  statuses `buga_endorsed, buga_promise`; surface `buga_crumbs`; object `buga_pork_barrel`; items `buga_golden_pen,
  buga_chain_of_office, buga_toaster`; combat rule `buga_civic_fee`.

### Tests (tests/content/hero_buga.js)
21 suites, ~1300 assertions (18 by the author, 3 added in review: see "Review"), all deterministic (fixed sandbox
seeds; also green with `seed=42` / `seed=999` / `seed=7`):
registration (fields, pool, levels, barks, prefixes, items, the `{ boss }` unlock incl. a regression run of the
`content: registry` suite), passive (fee, endorsed credit, used-up endorsement, downed Buga, bribed kill, a 2-round
Bribe III integration where the charmed grunt plans and kills its friend), basic + signature, each pool skill at
I/II/III (numbers, statuses + turns, displacement, costs, cooldowns, charges, gold), items, edge cases (silenced /
stunned / sheep / charmed user, AP, null + empty targets, downed user), previews vs reality for every skill and
level (incl. kills, credit Hype, bumps, gold), 12 AutoPlay battles (party `buga, test_knight, test_cleric, test_mage`,
acts 1-3 × levels 1/4/7/10, usage counted), painters (sprite poses/facings/statuses, portrait, barrel, crumbs).

### Balance (scratch sim `.tmp/hero-buga/sim.*`: AutoPlay, real encounters of all authors, 3 random allies)
- Win rates of Buga parties ≈ control parties (Buga in a 4th seat vs another hero): e.g. act 1 normal 24/24 vs 24/24,
  act 2 normal 23/24 vs 24/24, act 3 boss 3/3 vs 2/3; rounds within ±1.
- Buga's own damage ≈ 26 per fight (mid-pack: Zarathor 69, Corelos 47, Syllamin 40, … Ellaria 19, Marwyn 15); the
  damage his Delegates cause is credited to the allies.
- Gold: ≈ +11 gold per fight (civic fees ~4, fines ~3, credit ~2, signature occasionally) — about +40-60% of a normal
  fight's DESIGN gold. That is his trade: average personal combat power for loot. Watch it once the shop economy is tuned.
- Review re-run (`.tmp/hero-buga-review/sim.js`, n=6: 234 Buga fights + 234 control fights over all 39 real
  encounters, levels 2-3 / 5-6 / 8-9, bosses 4 / 7 / 10, after every review fix): see "Review" below.

## Public API (for other content)
- `buga_endorsed` status (buff, `source` = the Buga): any content may apply it to a hero-side unit to hand Buga the
  credit for its next kill; it removes itself on the credited kill.
- `buga_promise` status (debuff): −1 AP at the start of the bearer's next turn; `inst.data.keep = true` → removed
  (kept) when the bearer defeats an enemy first.
- `buga_crumbs` surface: `tile.surface.data = { heal, src }` (heal per hero turn end, src = unit id credited);
  Slows grounded enemy-side units that enter it or end their turn on it; fire spreads along it; water washes it away.
- `buga_pork_barrel` object: place with `DD.Act.placeObject(x, y, 'buga_pork_barrel', { data: { dmg, gold, owner, fuse } })`;
  hp 1 (any damage pops it), `smashable`, `react.fire.destroy`, explodes (radius 1, `data.dmg` fire damage, fire applied
  to the tiles — oil/crumbs ignite — but no lingering fire surface) crediting the hero who popped it, else its owner;
  `data.fuse` = rounds until it blows by itself at a round end (Pork Barrel sets 1; omitted = waits to be popped);
  def-level `autoplay` hint (foes in the blast − 1.5 × allies, halved while a fuse is lit).
- Combat rule `buga_civic_fee` (one per fight, `hooks.onKill`).

## Deviations
- The civic fee is a combat **rule** installed by the passive's `onCombatStart` (no hook fires on Buga when an ally
  kills). It shows in the HUD's rule chips and logs "New rule: Civic Fee" at the start of a fight.
- Delegate: a summon's "basic attack" is its first `kind: 'attack'` skill. Delegated swings use
  `DD.Combat.resolveSkill(ally, slot, target, { pay: false })`, so they cost the ally nothing (no AP, no HP cost —
  e.g. an HP-cost basic is free when delegated) and fire the ally's own `onSkillUsed` hooks.
- Campaign Promise costs 0 AP (outside the 1-3 band on purpose: promises cost nothing).
- DESIGN's idea list was reshaped: Tax Break → Loitering Fine, Executive Order / Kickback / Loot Goblin → Red Tape,
  Pork Barrel, Crumb Trail; Butter Up is Empowered (+ Block / Inspired) without the slide rider. Starters are Delegate
  + Loitering Fine (one manipulation tool, one loot tool).
- Bribe spends real run gold (`DD.Act.spendGold`); the charm is applied first and only paid for if it lands.

## Core fixes
1. `tests/content_tests.js` (RULES), `content: registry cross-references`: the hero `unlock` assertion only accepted
   `null` / `{ act: N }` and failed every `{ boss: enemyId }` hero (Buga, Slate), although ARCHITECTURE §3.1 and
   DD.Meta support them. One-line fix (commented) to also accept a non-empty `unlock.boss` string. Regression: the
   `hero_buga: registration…` suite runs the registry suite with a capturing `t` and asserts no `hero buga` failure,
   and checks `DD.Meta.unlocksForBoss('grimble')` / `unlockHint('buga')`.

## Requests
- **RULES / lead** **[Resolved at integration — see docs/notes/content-digest.md.]** please adopt the `unlock.boss` check above officially (and the sprite option list there lacks
  `head.hat: 'mushroom'`, which fails `a1_spore_bro` — not mine, FYI).
- **RULES (AutoPlay)**: `quickScore` ignores `aiScore` and previews do not diff AP, so ally-AP skills (Campaign
  Promise, the signature's +1 AP) and future-value skills (Bribe re-aims a telegraph; Pork Barrel's later blast) are
  undervalued by AutoPlay. An `ap` field in `Targeting.diff` (or `aiScore` in quickScore/exactScore) would fix it.
- **HUD** **[Resolved at integration — see docs/notes/content-digest.md.]** the party's gold is not shown during combat; Buga's fees/fines/bribes only show as floating text + log
  lines. A small gold counter (DD.Act.gold()) next to the Hype meter would make his loot game visible.
- **NARRATIVE / events**: DESIGN §11 mentions a Buga event ("re-election campaign" or "a toaster cult that worships
  him") — happy to see one; narration lines may reference "civic fee", "Endorsed", "the Re-Election Toaster".
  *(Done by NARRATIVE: `ev_buga_toaster_cult`, `ev_buga_reelection` in `js/data/events.js`.)*
- **RULES (AutoPlay), from the review**: `approachMove` ranks tiles by Manhattan distance and only runs as a unit's
  first action of the turn, so units walk into dead ends behind walls. In 468 sim fights it caused one 30-round
  stalemate (`a1_rats_in_the_cellar`, Buga + Syllamin + Slate + Zarathor at full HP against 2 full-HP rats in the
  walled pocket at x 0-1; nobody, rats included, ever found the way round). Path distance (`DD.Grid.path` length or a
  distance field) in `near()` would fix it. Not Buga-specific: the control seat (Marwyn) won the same fight by luck.

## Known issues
- AutoPlay rarely buys a Bribe (see Requests) and spams Loitering Fine; human play will differ.
- The Pork Barrel blast and burning crumbs hurt allies too (by design: friendly fire, readable on the board).
- Two Bugas (only possible in tests) share one Civic Fee rule; each Endorsed status credits its own Buga.
- The full suite currently fails in other areas still in progress (narration keys, `a1_spore_bro` sprite, act 2/3
  enemy sims, act 1 boss suites); nothing from `hero_buga` / Buga content.
- Delegate on Buga while he is Charmed by the target still works (the ally hits the charmer for him): a deliberate
  loophole, tested. Charmed Buga's own skills can't damage the charmer (engine rule).

## Review

### Round 1 (interrupted by an app restart before it wrote notes; reconstructed from the code and its suite)
Its fixes were already in `buga.js`; `hero_buga: review regressions (Delegate picks, flyers, lit fuse, quiet
statuses, Endorsed tooltips)` (71 assertions) guards them:
- **Delegate picks**: never hands the swing to an ally Charmed by the target (it would deal 0; no ally left → not a
  valid target) and halves the estimate of an ally Taunted by someone else (hero Taunt −50%).
- **Crumb Trail**: flyers are never Slowed (hovering there when scattered, or flying in); the tooltip states the
  duration ("for N rounds").
- **Pork Barrel**: the "lit fuse" became real (`data.fuse`: an untouched barrel blows at the end of the round, after
  the enemy turn, credited to Buga); the blast leaves no lingering fire (the tooltip promises none); the AutoPlay hint
  is halved while a fuse is lit (it will blow anyway).
- **Quiet statuses**: an unused endorsement lapses silently, re-Endorsing an ally shows no second popup/log line, and a
  Campaign Promise that comes due with nothing to take (stunned) shows no "Promise broken!".
- **Endorsed tooltips**: exactly the skills that Endorse say "Endorsed", at every level (the passive: "each skill says
  so"), so the passive's core loop is readable from the action bar.

### Round 2 (this pass; everything below was checked by running code)
Fixed, most severe first:
1. **Toast of the Town and Photo Op Dazzled Buga's own bribed foe.** Bribe → signature (a natural turn) knocked the
   bribed foe's re-aimed attack 1 tile off its friend, wasting the 7-30 gold. Charmed foes are now spared the Dazzle
   (they still count as "in the picture" for Photo Op III's Hype); both tooltips say "foes that aren't Charmed".
2. **Bribe III Charmed bosses for 2 rounds** for 21 gold. Probe (`.tmp/hero-buga-review/bribeboss.js`, real bosses,
   L8 party): the DM dealt 0 damage over 2 enemy turns (control 37), and at the final boss gold has no other use, so
   "bribe the DM every 4 rounds" was close to a must-do. Bosses now get 1 round at most, as with Corelos' Sign Here
   ("bosses haggle"); the tooltip says "for 2 rounds (bosses: 21 gold, this round only)". After: the DM sits out
   turn 1 (0 vs 10) and is back in turn 2 (19 vs 27); Dr. Iris 0 then 73 (control 30 then 70) — a 21-gold stun, fair.
3. **Crumb Trail's "foes on them are Slowed" was true once.** A foe that stayed on the crumbs was Slowed when they were
   scattered, then walked off at full speed two rounds later. The surface now also Slows grounded foes that end their
   turn on it (covers their next planning, like walking in; no double stacking — refresh, and a refresh of a Slow it
   still has is silent: one "Slowed" popup/log line per slowdown). Skill and tile tooltips updated; the tile tooltip
   now gives the heal ("2-3 HP by Crumb Trail level") instead of "a little".
4. **The Pork Barrel "blows up as soon as it is damaged" needed 3 damage** (hp 3): a 1-2 damage splash left it
   standing. hp 1 now; the Pork Barrel suite pops it with 1 damage.
5. **Tests**: `hero_buga: every stated range is the real range (all levels)` (85 assertions: every "within N tiles" /
   "2-N tiles away" of every level is valid at N and invalid at N+1, Delegate with an ally beside the foe; all were
   right) and `hero_buga: review regressions II (…)` (30 assertions incl. the untested Promise III "kept" path).
   Mutation check: reverting fix 1, 2 or 3 (or the silent refresh) fails that suite (3 / 2 / 1 / 2 failures). The
   painter test's canvas now uses `willReadFrequently` (Chrome printed a readback warning on every run).
6. **Notes**: the Public API claimed a 3-HP barrel that leaves a fire surface (neither is true); documented
   `data.fuse`, the crumbs' turn-end Slow and the Charmed-foe exceptions; summary table updated.

Verified and left as is (probes in `.tmp/hero-buga-review/r2edge*.js`, `r2prev.js`):
- Contract: no registry warnings, ids prefixed, `desc(L, null)` at every level, hook signatures (status/rule/item/
  surface/object), null/empty targets and a downed user (the harness fails on swallowed `Error in`), no `Math.random`
  (barks use the cosmetic `DD.rng`, never during previews). Green with harness seeds 42 / 999 / 7.
- Delegate previews are exact with **every real hero** as the swinging ally (54 cases incl. wild-magic and passive
  riders; the preview leaves the state untouched). The HUD's "⚠ hits N allies" comes from preview damage, so
  Delegate's ally-tile highlight never raises a false friendly-fire warning.
- `ally` targeting excludes charmed foes (`Grid.hostile` is asymmetric), so Butter Up / Promise / Human Shield can't
  pick a bribed foe and Endorse never lands on one (no double credit with the bribe credit). Killing your own bribed
  foe pays the fee (+1) and normal kill Hype.
- Re-Election Toaster when Buga is the last hero standing: he pops back up, no defeat. Promise on a summon (2 → 4 AP,
  1 next turn), rooted Buga can Human Shield (a swap is not a move action), Red Tape drags a flyer over a pit
  harmlessly, Delegate skips stunned / asleep / frozen / sheep / silenced-spell allies.
- Balance sim after all fixes (`.tmp/hero-buga-review/r2/sim_after_n6.txt`, 234 Buga + 234 control fights, all 39 real
  encounters; other areas' bosses were changing in parallel, so compare within a run): win rates Buga vs control —
  act 1 normal 47/48 vs 48/48 (the stalemate in Requests), elite 18/18 vs 18/18, boss 12/12 vs 11/12; act 2 normal
  48/48 vs 48/48, elite 24/24 vs 24/24, boss 11/12 vs 9/12; act 3 normal 48/48 vs 48/48, elite 18/18 vs 18/18, boss
  6/6 vs 6/6. Rounds within ±1. Buga per fight: own damage 32.1 (8th of 10: Zarathor 68, Corelos 53, Marbles 48,
  Syllamin 46, Sparrow 41, Josiah 40, Slate 34, Buga 32, Ellaria 23, Marwyn 23) plus 13.5 delegated damage credited
  to allies; 1.29 credits; +16.3 gold earned, 4.4 spent on bribes. Usage: Pamphlet 920, Fine 472, Delegate 469, Human
  Shield 67, Pork Barrel 62, Crumbs 51, Red Tape 47, Butter Up 46, Promise 45, Photo Op 44, Bribe 13, signature 10
  (AutoPlay limits: see Requests).
- Numbers vs DESIGN §5: basic 4; 1-AP skills 4/5/6 (Fine, like Whack / Raven Dive); Pork Barrel 5 + an 8-12 blast
  is above the 2-AP AoE band but is the kit's "big" skill (2 charges, delayed, friendly fire), in line with Bling
  Throw / Rock Bottom / Mic Drop. Delegate III (2 free basics + Mark 2 ≈ 12 for 1 AP, cd 1) matches Bling Throw III.
  Gold: DESIGN's fight gold averages ≈ 35 over a run's mix (normal / elite / boss), so +16.3 is ≈ +45% gross, +33% net
  of bribes — his identity, paid for with mid-pack damage; per-kill income matches Coin Purse / Coin Magnet. Watch it
  when the shop economy is tuned (the knobs: Fine's 2/3/3 first-fine gold, the 2-gold credit).
- Kit and identity: every DESIGN idea is there or recorded as a deviation; the passive is the joke (he takes the
  credit, skims a fee) and the play pattern (endorse the ally about to kill, keep the Mayor standing); no dead pick
  (Promise I is tempo + Endorse for 0 AP), Delegate is the natural must-have but is a starter. Butter Up's Empowered
  is shared with 4 other heroes; its Endorse/Block/Inspire riders keep it his. Barks: 13 keys × 4-6, ≤ 70, in voice.
- Visuals (`.tmp/hero-buga-review/r2/*.png`): gallery, hero lineup, combat on stone/grass/hell floors, crumbs + Pork
  Barrel on dirt. A golden slice with a black top hat is unlike the other 9 silhouettes; the outline keeps him readable
  on brown floors; the crumbs' crouton cubes and the pink "$" pig barrel read at zoom 1. No sprite changes needed.
- Full `bash tools/test.sh` after the fixes: 493 suites, 31 failures in 7 sections, all in other areas' in-progress
  files (enemies_act3 death knight, bosses_act1 Grimble phase 2 / Rat King sluice, narrative events/tips); none in or
  caused by Buga content (no other suite relies on the numbers changed here).
