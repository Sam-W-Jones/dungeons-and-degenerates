# HERO: Zarathor, the Bedazzled — notes

Files: `js/data/heroes/zarathor.js`, `tests/content/hero_zarathor.js` (suites `hero_zarathor: …`).
Scratch (not shipped): `.tmp/hero-zarathor/` (sprite variant page, scripted combat scene, balance sim).
Run: `bash tools/test.sh "suite=hero_zarathor&isolate=heroes/zarathor,hero_zarathor"`.

## Summary

Tiefling warlock of **fire, wild magic and bling** (starter, `unlock: null`). Role: ranged fire / chaos damage that
also *spends the party's money* and gambles on wild magic. 24 HP (+4/level), 3 AP, move 4, armor 0, complexity 2.

**Passive — Drip Check** (hooks `onCombatStart`, `onTurnStart`, `onSkillUsed`):
- At combat start and the start of each of his turns his drip is assessed: **+10% damage per 50 gold the party
  holds, max +30%** (status `zar_drip`, stacks = tier, logged + floating text when it changes). Gold spent mid-turn
  only counts from the next turn, so the status always matches the damage he deals. The status tooltip reads the
  purse live: "The party holds 25 gold: the next Drip Check … gives +0%" (and the Ring's 30-gold step).
- **Every 4th spell he casts sets off a Wild Surge** (`DD.WildMagic.surge`, whole table, mostly good). Progress is the
  status `zar_sparkle` (1-3) plus a "🎇 n/4" popup. Spells = `kind: 'spell'` (basic, Fireball, Chaos Bolt, Hellish
  Rebuke, Bling Supernova); consumables never count. The passive desc says the basic counts (the HUD tooltip labels it
  "Basic attack", not "Spell"). No surge once the fight is decided (the killing blow's `onSkillUsed` runs after
  `Combat.finish`).
- It changes how you play him: hoard gold (damage) vs. spend it (Throw Money / Gold Plating / shopping), and time
  the 4th spell (the surge can be a fireball on your own friends).

**Basic** `zar_basic` Eldritch Bling 🔮 (spell, 1 AP, range 4): 5 fire; fire reacts with the target's tile (oil
ignites, webs burn, water steams). **Signature** `zar_signature` Bling Supernova 💥 (100 Hype, 2 AP, range 5, radius 2):
18 fire to every foe, Dazzle the survivors, the area ignites, the party gains 8 gold; banner + gold flash + coin rain.

**Skill pool (10; starters marked ★)** — levels I / II / III:
| id | name | AP / cd / charges | effect |
|---|---|---|---|
| `zar_fireball` ★ | Gold-Plated Fireball 🔥 | 2 / 1 | range 5, radius 1: 5/6/7 fire + Burn 1/1/2 to foes only; ignites the area (oil, webs, barrels, steam) |
| `zar_bling_throw` ★ | Throw Money At It 💸 | 1 / 1 | **spend 5 gold**: 8/10/12 damage + Dazzle; III also Dazzles adjacent foes |
| `zar_chaos_bolt` | Chaos Bolt 🎲 | 2 / 1 | 7/8/10 of a random element (fire Burn 2 · frost freezes Wet · lightning +50% vs Wet, shocks water · poison 2), leaps once/once/twice for 3/4/5. Tagged `random` |
| `zar_bedazzle` | Bedazzle 💅 | 1 / 1 | ally's next damaging skill (III: next 2) deals +3/+4/+5 once per foe hit (multi-strike skills too) and sets them on fire (applyElement fire: Burn 2, oil/webs ignite) |
| `zar_rebuke` | Hellish Rebuke 😈 | 1 / 2 | ward self/ally until their next turn: every enemy attack that hits them deals 5/7/8 fire back (III + Burn 2) |
| `zar_lasso` | Bling Lasso ⛓️ | 1 / 2 | straight line, range 4/5/5: 3/4/5 damage, pull 3/3/4 toward him; III Vulnerable 2 |
| `zar_strut` | Fabulous Strut 🕺 | 1 / 2 | straight dash 3/4/5 tiles, fire trail (2/2/3 rounds) on every tile left behind; blocked by units/objects/cliffs, refuses while Rooted |
| `zar_gold_plating` | Gold Plating 🥇 | 1 / 2 | **spend 6 gold**: self/ally +8/10/12 Block; III + Thorns 2 (2 turns) |
| `zar_statue` | Statue of Me 🏆 | 2 / – / **1 per combat** | summon a gold statue (12/18/24 HP, 1 armor, 0 AP, immovable); foes within 2/2/3 Taunted (attacks redirected or fizzle); II+ re-taunts every turn; III bursts for 6 fire on adjacent foes when it breaks |
| `zar_wild_card` | Wild Card 🃏 | 1 / 1 / **2 per combat** | set off a Wild Surge (I any, II good, III two good). Kind `buff` ("It's not a spell. It's a lifestyle.") |

Telegraph tools: Dazzle (Throw Money, Supernova), Taunt/redirect/cancel (Statue), pull moves self-anchored attacks
(Lasso), defend (Rebuke, Gold Plating), fire walls the AI avoids (Strut). Combos with other heroes: Bedazzle (buff an
ally's next hit, it also ignites oil/webs under the victims), Gold Plating / Rebuke on whoever is being targeted (e.g.
Marwyn after a taunt), Lasso pulls foes into an ally's AoE or through Zarathor's own fire trail (Burn 2 per tile),
Fireball/basic ignite anyone's oil, webs and barrels and boil Wet/water into steam, Mayor Buga's gold feeds the drip.
Self-synergies: Strut + Lasso (drag through the trail), Statue + Rebuke/Gold Plating (a decoy that bites back).

**Statuses** `zar_drip` 💎, `zar_sparkle` 🎇, `zar_rebuke` 😈 (decay `turnStart`), `zar_bedazzled` 💅.
**Summon** `zar_statue` (Tasteful Statue; random names like "Monument to Me", "The Thinker (About Me)").
**Items** (all `hero: 'zarathor'`): `zar_ring_bling` Ring of Excessive Bling (rare trinket, +5% damage, drip step 30
gold), `zar_hellcard` Platinum Hellcard (rare weapon, +10% damage, gold skills usable when short: the missing gold
becomes an HP cost), `zar_shades` Shades of Indoor Brilliance (legendary armor, +6 HP, +1 armor, immune to Dazzle, all
his own Wild Surges are good).

**Sprite**: red tiefling, **gold-plated tiefling horns**, bald, sunglasses indoors, gold-teeth grin + grill, gold chain
with $ medallion, rings, earrings, bracelets, popped gold collar, royal purple coat with gold trim, devil tail, fire
orb, flames aura and (overlay) hellfire in the open hand. Checked at zoom 1 in the gallery, party select, HUD and
fights. The statue is the same figure in solid gold with sparkles, standing on a gold drum plinth engraved "ME"
(overlay `statueOverlay`, skipped when lying down) so it reads as a monument, not a gold tiefling.

**Barks**: 4-6 per key (13 keys), all ≤ 70 chars, naming Marwyn, Josiah, Ellaria, Professor Marbles, Mayor Buga,
Syllamin and Slate.

Every registered id: hero `zarathor`; skills `zar_basic, zar_signature, zar_fireball, zar_bling_throw, zar_chaos_bolt,
zar_bedazzle, zar_rebuke, zar_lasso, zar_strut, zar_gold_plating, zar_statue, zar_wild_card`; statuses `zar_drip,
zar_sparkle, zar_rebuke, zar_bedazzled`; summon `zar_statue`; items `zar_ring_bling, zar_hellcard, zar_shades`.

**Tests** (`tests/content/hero_zarathor.js`, 17 suites, ~1,810 assertions): definition/pool/barks/desc at every level;
basic + fireball (numbers, Burn, allies spared, oil chain, barrel, steam, Wet, corner); gold skills (spend, broke,
forced execution declined, Hellcard HP cost, 1 HP); Chaos Bolt (all 4 elements found by seed, riders, Wet lightning
+50% + shock, Wet frost freeze, L3 double leap, target dies mid-skill, lone target); Bedazzle (every level, AoE,
non-damaging skill keeps it, oil ignition, ally-only); Rebuke (every level through Guard, decay, non-attack damage,
Thorns no-loop); Lasso (every level, straight/min range, pit YEET + env-kill Hype, lava, water, unit bump,
immovable, fire-trail combo); Strut (every level, trail turns, unit/crate/cliff blocks, Rooted, oil + water, map
edge, enemies burn walking in); Statue (summon fields, taunt radius, intent redirect/track/cancel, charges,
immovable, damage soak, L2 re-taunt, L3 radius + burst, AutoPlay with a 0-AP summon); Wild Card (charges, cooldown,
good-only from II, two at III, Shades); passive (8 gold tiers × damage, turn-start re-assessment, Ring, Sparkle
count, non-spells excluded, Shades); signature; items; previews (every skill × level, normal and 4th-spell-surge
variants: fingerprint untouched, HP / KO / spawns / Hype exactly as previewed, `random` → uncertain); edge cases
(silenced, stunned, sheep, charmed, AP, empty targets, death by strutting into lava); review regressions (no surge
after a winning 4th spell, in a run, preview agrees; Bedazzle once per foe with a 3-strike skill at every level; drip
readout; Rebuke with Zarathor downed; Chaos Bolt shocking an ally's pool; statue plinth drawn in every pose); AutoPlay
(15 battles: acts 1-3 normal × L1/4/7/10 + 3 elites, party zarathor + test_knight/cleric/mage, usage counted).

## Balance (sims)

- Own suite: 15/15 fixture battles won, avg 2.9 rounds; real uses (previews excluded): basic 13, Fireball 11, Throw
  Money 11, Chaos Bolt 9, Statue 3, Gold Plating 3, Bedazzle 2, Wild Card 1 (AutoPlay never picks Strut / Rebuke,
  see Known issues).
- Slot comparison (`.tmp/hero-zarathor/sim.html`: hero + test_knight/cleric/rogue, starters + 1 pool skill at level II,
  all 11 real act-1 encounters × 4 seeds, level 3): damage per round — **Zarathor 12.4** (60 gold) / 11.3 (0 gold) /
  13.0 (150 gold), Corelos 10.6, Marbles 8.9, Josiah 8.0, Syllamin 7.8, Sparrow 7.8, Ellaria 4.9, Slate 4.8, Buga 5.1,
  Marwyn 2.8 (tank). He is the top damage dealer by ~7% at 0 gold and ~15-20% with a healthy purse, as intended for the
  glass-cannon damage role (24 HP, no heals, little defense); the gold he spends is the brake (5 per money throw,
  6 per plating, i.e. most of a normal fight's income if used every cooldown). Every party won every fight in that sim,
  so the numbers compare output, not difficulty.
- DESIGN §5 checks: basic 5 (4-6); 2-AP single 7/8/10 (+leap); 2-AP AoE 5/6/7 + Burn; signature 18 (15-25); levels
  II ≈ +15-25%, III ≈ +40-50% and/or a rider.

## Public API

- Statuses others may apply: `zar_rebuke` (set `st.data.dmg/burn` on the returned instance), `zar_bedazzled`
  (`st.data.bonus`, stacks = uses), `zar_drip` (stacks = +10% each), `zar_sparkle`.
- Summon `zar_statue`: `unit.data.r` (taunt radius), `unit.data.every` (re-taunt each turn), `unit.data.boom`.
- `DD.Zarathor` (read-only helpers): `SPARKLE_MAX`, `dripStep(unit)`, `dripTier(unit)`, `assessDrip(unit)`,
  `strutPath(unit, tile)`, `wildSurge(unit, source, good)`.

## Deviations

- None from the contract. Notes: the drip bonus is snapshotted at turn start (status `zar_drip`) rather than read
  live from gold, so previews and the status icon always agree with the damage. Wild Card is `kind: 'buff'` (not a
  spell: usable while Silenced, does not charge Sparkle). The Hellcard is implemented with a dynamic `hpCost`
  (`(L, user) => missing gold`), so the HUD shows the HP price and the engine pays it (never below 1 HP).

## Core fixes

- None.

## Requests

- **Narrative (`js/data/events.js`)**: DESIGN §11's "Zarathor and a bling merchant" event — natural rewards are gold,
  `zar_ring_bling` / `zar_shades`, or a Wild Surge on the spot; a "pawn your bling" choice (gold now, lose an item)
  would hit his passive in a fun way.
- **RULES (optional)**: AutoPlay's `quickScore` ignores self/ally-target skills unless `kind: 'buff'`/heal/summon, so it
  never uses Hellish Rebuke (spell) or any pure movement skill (Strut). A small bonus for `allyOrSelf` spells that
  add a buff status, or for moves out of danger, would let balance sims exercise them.
- **HUD (optional)**: gold costs only live in skill descriptions; a gold pill (like the HP-cost pill) for skills
  whose level table has `gold` would make money skills readable at a glance.
- **HUD (review)** **[Resolved at integration — see docs/notes/content-digest.md.]** the party's gold is not shown anywhere in combat, yet Zarathor's Drip Check and money skills (and
  Mayor Buga's Bribe / Civic Fee) run on it. A gold counter in the top bar (`DD.Act.gold()`, refresh on
  `combat:changed`) would let players plan the drip; until then the `zar_drip` tooltip carries the number.
- **RULES (review, optional)**: content cannot mark a preview `uncertain` except via the `random` tag. A hook (e.g. the
  skill ctx or the passive setting `ctx.uncertain` during the dry run) would let the 4th spell's preview show "?" for
  the Wild Surge it will set off, instead of revealing the surge's exact outcome.

## Known issues

- AutoPlay never casts Hellish Rebuke or Fabulous Strut (see Requests); both are covered by their own suites.
- Chaos Bolt's lightning shocks the whole connected water body, allies included (engine semantics; the desc now says
  "allies in it too").
- A Drip Check / Wild Card surge is part of the skill's HUD preview (deterministic dry run), so the 4th spell's preview
  can show a surge's outcome before you commit — accurate, slightly spoilery (see the RULES review request).
- Debug combats (`screen=combat` without a run) start with 0 gold, so the gold skills are greyed out there by design.
- Statue of Me and Sparrow's Evil Twin are both "summon a decoy that Taunts nearby foes and pops on death". They play
  differently (immovable 0-AP taunt tower with auto re-taunt vs a mobile 2-AP clone with skills) and the vanity joke is
  pure Zarathor, so it was kept.

## Review (adversarial pass)

Verified by running code (isolated suites, the 8 generic `content:` suites, scratch probes and sims in
`.tmp/hero-zarathor-review/`, gallery / party select / combat screenshots), most severe first:

1. **Bug — Wild Surges after the fight was won.** `onSkillUsed` (Drip Check) runs after `Combat.finish`, so a 4th
   spell that killed the last foe always set off a surge after victory (40/40 seeds in a probe): "Make It Rain" paid
   free run gold, "Wild Magic Surcharge" took 5, chaos/backfire surges could hurt or down a hero after the win (a
   scar in a run), and a WILD MAGIC banner played over the Victory ribbon. Fix: `fightOver()` guard in
   `chargeSparkle` and `wildSurge` (also stops Wild Card III's second surge when the first one wins). The preview
   agrees. Regression-tested in a sandbox run (12 seeds); reverting the guard fails 37 assertions.
2. **Desc mismatch — Bedazzle.** "+N damage to each foe hit" was +N per damage instance: Flurry of Paws (3 strikes)
   got +9 at I and +15 at III instead of +3/+5. Now once per foe per skill (`st.data.got`, reset in `onSkillUsed`),
   tested with an unregistered 3-strike AoE def at every level (incl. III's second use).
3. **Readability — Drip.** The party's gold is shown nowhere in combat, so the drip could not be planned (and a
   mid-turn spend silently lowers next turn's tier). The `zar_drip` tooltip now shows the purse, the step (Ring: 30)
   and what the next check gives. The passive desc says Eldritch Bling counts as a spell (the HUD tooltip labels the
   basic "Basic attack", not "Spell") and "each of his turns".
4. **Desc — Chaos Bolt** now warns that the electrified water hits allies standing in it too (4 + Stun, tested).
5. **Hellish Rebuke** with Zarathor downed: the downed caster was still the damage source (and could bark kill
   lines from the floor). The warded unit now deals it while the caster is down (tested, credit included).
6. **Platinum Hellcard log** no longer claims the whole shortfall was paid in HP (the engine caps the payment at
   1 HP left and logs the real amount itself).
7. **Visuals — statue.** It read as a gold-skinned tiefling standing on the board; it now stands on a gold drum plinth
   engraved "ME" (`statueOverlay`, replaces the barely visible `mini` disc, skipped when lying). Icon 🗿 → 🏆 (🗿 is
   Slate's Rooted in Tradition; a gold trophy of himself is the joke). Zarathor's own sprite is distinct on the board
   and in party select (only red-skinned hero; gold horns, shades, purple coat, flames) and was left alone.

**Balance (my sims, `.tmp/hero-zarathor-review/sim.js` via `probe.html`)**: hero + test_knight/cleric/rogue, starters
+ 2 rotating pool skills, levels 3/6/9 with skill levels I/II/III, AutoPlay, damage per round of the slot hero.
- Real act 1-3 normal encounters (24 × 2 seeds): **Zarathor 11.4 at 0 gold / 14.0 at 120 gold** (spends 11.8 gold
  per fight on Throw Money / Gold Plating), Corelos 10.4, Marbles 10.2, Josiah 8.2, Syllamin 7.5, Sparrow 7.0. All won.
- Fixture encounters (6 × 4 seeds, 100 gold): Zarathor 14.3, Corelos 10.0, Josiah 9.4, Marbles 9.2, Syllamin 8.3,
  Sparrow 7.5, Slate 4.7, Buga 4.6, Ellaria 3.6, Marwyn 3.6.
- Where it comes from (real act 1-2, 48 fights, 80 gold): Fireball 1,628 damage (105 casts, 15.5 each), Throw Money
  776 (100 casts, 7.8), basic 521 (93, 5.6), Chaos Bolt 145 (17, 8.5).
- Verdict: top ranged DPS by ~10% with an empty purse and ~35% with a fat one. The surplus is bought with run gold
  (most of a normal fight's income) and with the drip's opportunity cost (gold not spent on items), which the sims
  hand him for free; he is the squishiest damage dealer with no sustain. Numbers stay as designed. Tried and rejected:
  Fireball cooldown 2 (his best skill and the top AoE in the game, but it only moved his output −3% because the AP
  flows into basics) and Fireball 4/5/6 (−1%). Gold Plating is weaker per use than Ellaria's free Barkskin but is the
  only ranged ally Block in his kit (niche, not dead); Chaos Bolt's 8.5 per cast is the low end of the 2-AP band but
  its random riders and leap keep it a fun pick. No dead or must-pick skill found.

Final full `tools/test.sh`: 417 suites, 46,716 assertions ok, 32 failures in 8 sections, all in `bosses_act1: grimble …`
(another author's file in progress); all 17 `hero_zarathor` suites pass, no `Error in` from these files. Earlier runs
during the review also showed in-progress failures in hero_josiah, hero_ellaria and passive-table that passed alone
and next to these suites and were gone by the final run.

## Phase 4 (engine requests role) — fair previews

The "uncertain" request above is done in the engine (docs/notes/rules.md "Phase 4"): a preview whose dry run rolls
the combat RNG (Chaos Bolt, Wild Card, the 4th spell's Wild Surge) is `uncertain` and shows the expected outcome of 8
other rolls, never the real one; a passive can also call `DD.Act.markUncertain()` or set `ctx.uncertain`.
`tests/content/hero_zarathor.js` previews suite: certain previews are still checked exactly; a use that set off a
Wild Surge must have previewed uncertain (every badge "?"); uncertain previews are no longer compared to reality
(that comparison was the leak). No change to `zarathor.js`.
