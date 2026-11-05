# HERO-MARWYN notes

Files: `js/data/heroes/marwyn.js`, `tests/content/hero_marwyn.js` (21 suites `hero_marwyn: …`), this file.
Run: `bash tools/test.sh "suite=hero_marwyn&isolate=heroes/marwyn,hero_marwyn"`; generic validation:
`bash tools/test.sh "suite=content:&isolate=heroes/marwyn,hero_marwyn"`.
Looks: `bash tools/shot.sh "debug=1&fixtures=1&isolate=heroes/marwyn,hero_marwyn&gallery=marwyn" .tmp/marwyn/g.png 1280x720 4000`.

## v2 — the simplified kit (initiative, no telegraphs, no Guard, no combat-start Block, attacks of opportunity)

User (after the v1 playtest): *"skills are too overcomplicated, doing too much each. Can we simplify them a bit such
that it's the combinations of effects that feel strong?"* — plus initiative order, no telegraphs, no Guard, no
start-of-fight shield, and (latest playtest) *"melee characters feel very weak"* → attacks of opportunity and
reach-aware enemies. DESIGN §6 "Simplicity": one verb per skill + at most one simple rider, desc in one breath, II =
bigger numbers, III = bigger numbers or ONE added rider, power from combinations, passive = one clear rule.

### Summary

**Marwyn the Magnificent** (he/him), human barbarian, available from the start (`unlock: null`). Tank / bruiser /
taunts, complexity 2. 35 HP (+5/level), 3 AP, move 3, armor 0, **initiative +0** (`stats.init: 0`). Sprite unchanged:
huge ginger barbarian with a gold championship belt whose 5 gems light up with his MAGNIFICENCE (violet + orbiting
sparkles when full = his next skill surges).

**Passive — MAGNIFICENCE** (one rule): *each of his skills that reaches a foe adds 1 MAGNIFICENCE. At 5, his next
skill also unleashes a MAGNIFICENT SURGE (random good wild magic, +10 party Hype) and resets the meter.* "Reaches a
foe" = a foe stands in the skill's area (`ctx.foes`, what the HUD highlights). Status `mrw_magnificence` (🦁, 0-5,
never decays). The surge rolls one `DD.WildMagic` effect from the **good** table with the combat RNG, shows a
"MAGNIFICENT SURGE!" banner, barks and gives the party 10 Hype (DESIGN §4.5). Implementation: `onSkillUsed` checks the
meter first (≥ 5 → surge, reset), then adds this skill's +1 (`ctx.foes.length > 0`) plus anything banked in
`unit.data.mrwPending` during the skill (Ginger Rage's +2), so the surge always belongs to the skill AFTER the one that
filled the meter. Consumables never count; no surge once the fight is decided (`state.result`), and a Hand Mirror's
second effect is skipped when the first one won the fight, re-rolled (another good one that still applies) when the
first took its target away; the banner names what went off. Only the good table is ever rolled (no fallback).

**Attacks of opportunity** (DESIGN §4.2, engine rule): his basic **Ginger Snap** is melee, so it is his attack of
opportunity — a foe that walks away from him takes 5 (once per round). It is a use of his skill like any other:
**+1 MAGNIFICENCE**, and at a full meter **it surges** (on the foe's turn); a swing that wins the fight never surges.
He barks about it (key `opportunity`, 50%). His mobility never provokes: Hero Landing (a leap), YEET (the thrown
ally or foe), Center of Attention (a pull), Glorious Cleave III (a knockback). Walking away
from a foe himself provokes it like anyone (Ginger Rage softens that stab; Gun Show's Thorns answer it; the
Loincloth cuts the stab of a foe he Taunted).

**Basic** `mrw_ginger_snap` Ginger Snap 🪓 (1 AP): 5 damage to an adjacent foe.
**Signature** `mrw_behold` BEHOLD, MARWYN! 💥 (2 AP, 100 Hype, area `all_foes`): *EVERY enemy is Taunted and Marwyn
gains 15 Block.* One big effect: for a round every enemy must come for him (the far ones walk toward him — off the
allies they were fighting, through those allies' attacks of opportunity) while the party works freely.

**Pool (9, starters ⭐ first)** — I / II / III:
| id | name | AP / cd | desc (level I) | II / III |
|---|---|---|---|---|
| `mrw_war_cry` ⭐ | LOOK AT MARWYN! 📣 | 1 / 2 | Taunt every foe within 2 tiles and gain 4 Block. | r2 B6 / r3 B8 |
| `mrw_yeet` ⭐ | YEET 🤾 | 2 / 2 | Throw an adjacent friend or foe 3 tiles away; on a crash, it and what it hits take 6 damage. | 3 t, 8 / 4 t, 10 |
| `mrw_cleave` | Glorious Cleave ⚔️ | 2 / 1 | Deal 5 damage to every foe on the 3 tiles in front of him. | 6 / 7 + knock them back 1 |
| `mrw_headbutt` | Use Your Head 🤕 | 2 (+2 HP) / 3 | Deal 7 damage to an adjacent foe and Stun it. Costs him 2 HP. | 8 / 10, cd 2 |
| `mrw_hero_landing` | Hero Landing 🦸 (move) | 2 / 2 | Leap up to 3 tiles, then Taunt every foe next to him. | 4 / 5 |
| `mrw_gun_show` | Gun Show 💪 | 1 / 2 | Flex: Root every adjacent foe and gain Thorns 2 (adjacent attackers take 2 back). | Thorns 3 / 4 |
| `mrw_rage` | Ginger Rage 🌋 | 1 / 3 | Until the end of his next turn, every hit deals 2 less damage to him. Gain 2 MAGNIFICENCE. | −3 / −4 |
| `mrw_magnetism` | Center of Attention 🧲 (spell) | 3 / 3 | Wild magic: pull every foe within 3 tiles up to 2 tiles toward him, then Taunt them. | r4 p2 / r4 p3 |
| `mrw_keg_stand` | Keg Stand 🍺 (heal) | 1 / 1, 2 charges | Heal 4 HP and splash water on every tile within 1 (units there get Wet). 2 kegs per fight. | 6 r1 / 8 r2 |

v2 durations (own turns): Taunt / Root / Stun on a foe = its next turn (`turns: 1` from his turn); Thorns and Ginger
Rage on himself = through his next turn; Block from his skills lasts until the start of his next turn, so it stands
through every enemy turn of the round. Hero Landing can't land on hazards (lava, fire, pits) and is refused while he is
rooted / held (`DD.Act.cantMove`).

**Combos (setups and payoffs with the other heroes)**:
- **Center of Attention** gathers the crowd around him (taunted): the payoff is everybody's AoE — Zarathor's fire,
  Corelos' runes, Syllamin's cone, Pebbles' fire, his own Glorious Cleave (tested: a pull lines 3 foes up for one
  Cleave). Pulled foes end next to him: from then on, leaving him costs them a Ginger Snap.
- **LOOK AT MARWYN! / BEHOLD + melee allies**: a foe he Taunts walks off the ally it was fighting and eats that ally's
  attack of opportunity (Betty, Basanos, Slate, Marbles, Sparrow, corgis…) on the way (tested with the knight: 5 damage
  on its walk, then it stabs Marwyn's Block instead of the knight).
- **LOOK AT MARWYN! / BEHOLD free pinned allies**: a Taunted foe only strikes its taunter, so a squishy ally next to it
  walks away without an attack of opportunity (tested: the pinned mage walks off the grunt unhurt, the move preview shows
  no provoke; control: the stab costs it 4). Shout first, then let the wizard leave.
- **Keg Stand** puts puddles + **Wet** on everything next to him: lightning allies deal +50%, frost freezes, fire is
  put out, lava cools (tested: a Wet foe takes 9 instead of 6 from a lightning hit). Marwyn gets Wet too (careful), and
  Wet foes shrug off Burn (anti-synergy with Pebbles / Zarathor — pick your moment).
- **YEET** is positioning for everyone: throw foes into pits (YEETED: +20 Hype), lava, water (Wet), explosive barrels,
  other foes (both take the crash), allies' traps (Hjalmar, Corelos' runes); throw a pinned ally out of reach — a throw
  never provokes (tested: the 5-HP mage flies out from between two grunts unhurt).
- **Use Your Head** Stuns: the foe loses its whole next turn and a boss **wind-up is interrupted** at once (DESIGN §9).
- **Gun Show** Roots the foes next to him: stationary targets for the party (Kiri, Betty's rams), and nobody leaves the
  show — not even divers that shrug off attacks of opportunity (tested: a rooted grunt stabs Marwyn and eats the Thorns
  instead of finishing the wounded mage).
- **Hero Landing** is the bodyguard leap: land next to the foe on a wounded ally and Taunt it; a leap never provokes,
  so it is also his way out of a crowd (tested: out of three grunts without a scratch).

**Items** (hero `marwyn`; one rule each, nothing at combat start):
- `mrw_yeet_gauntlets` Gauntlets of Competitive Yeeting (weapon, rare): +5% damage. YEET throws 2 tiles further.
- `mrw_loincloth` Loincloth of Unearned Confidence (armor, rare): +6 max HP. Foes Taunted by Marwyn deal 25% less
  damage to him (their attacks of opportunity too).
- `mrw_hand_mirror` Hand Mirror of Self-Admiration (trinket, legendary): his MAGNIFICENT SURGEs unleash two different
  good wild magic effects instead of one (still +10 Hype).

**AutoPlay hints** (pure, quick to compute):
- YEET `autoplayValue` (quick pass only): the throw's crash / pit / hazard value from its HUD flight path.
- Hero Landing `autoplayValue` (quick pass only): +1.5 per foe next to the landing tile that he has not Taunted yet,
  +1.5 more if that foe stands next to one of his allies (its quick estimate saw only his own danger at the tile).
- BEHOLD `aiScore`: 4 per foe that is not next to him and not yet Taunted by him (AutoPlay's gain counts a Taunt as 1
  and Block as 0.1, so the signature never cleared its "worth 100 Hype" bar): with three grunts around the 8-HP mage
  AutoPlay now BEHOLDs (tested); with the hint mutated to 0 it kept the Hype.

**Barks**: every key 4-6 lines ≤ 70 chars, lots of CAPITALS and third person, naming the whole party now and then —
incl. Kiri, Betty, Basanos and the new Valdris, Hjalmar and Pebbles ("Pebbles! FETCH! ...Not the goblin, Pebbles. Too
late.", "Valdris! Forge Marwyn a new everything!", "Hjalmar, if this floor is trapped, Marwyn WILL find out.").
Extra keys: `surge`, `maxed`, `taunt`, `yeet`, `landing`, `flex`, `opportunity` (new: "LEAVING? Nobody leaves until
Marwyn says so!"). Pronouns as confirmed by the user (he/him: Zarathor, Syllamin, Marbles, Marwyn, Josiah, Corelos,
Slate, Buga, Betty, Basanos, Valdris, Hjalmar, Pebbles; she/her: Ellaria, Sparrow, Kiri).

**Every registered id**: hero `marwyn`; skills `mrw_ginger_snap, mrw_behold, mrw_war_cry, mrw_yeet, mrw_cleave,
mrw_headbutt, mrw_hero_landing, mrw_gun_show, mrw_rage, mrw_magnetism, mrw_keg_stand`; statuses `mrw_magnificence,
mrw_rage`; items `mrw_yeet_gauntlets, mrw_loincloth, mrw_hand_mirror`. No summons / objects / surfaces.

### What was cut or changed (v1 → v2)

- **Passive**: v1 had four rules (gains from skill hits / taunts, kills and the first hit taken each round; +10% damage
  per stack; the surge at 5 with 85% good odds; pushes and pulls moved him 1 tile less). v2 keeps one: skills that
  reach a foe fill the meter, the next skill surges (always a good effect). No damage bonus, no push resistance.
- **Signature**: leap + 15 slam + knockback + taunt all + 12 Block + max MAGNIFICENCE → taunt all + 15 Block.
- **LOOK AT MARWYN!**: "their attacks turn on Marwyn or fizzle" (telegraph wording) → plain Taunt.
- **YEET**: III's crash-Stun cut (III = bigger numbers: 4 tiles, 10).
- **Hero Landing**: "land next to an ally, allies +Block, Taunt the foes whose telegraph hits them, III slam" → leap +
  Taunt the foes next to him (no intents to read). Desc shortened ("Leap up to 3 tiles, then Taunt every foe next to
  him.").
- **Use Your Head**: "its telegraphed attacks are cancelled" → Stun (it loses its next turn).
- **Gun Show**: Block + Thorns (+ III Weak) → Root adjacent foes + Thorns ("Tickets are free. Leaving is not.").
- **Ginger Rage**: −2/−3/−3 per hit for 2 turns + 2/2/3 stacks + III +1 AP → −2/−3/−4 through his next turn + 2.
- **Center of Attention**: III's "+1 MAGNIFICENCE per foe pulled" cut.
- **Keg Stand**: III heal 7 → 8 (the water rider unchanged).
- **Ginger Stampede** (`mrw_charge`) cut: Betty is the charger now (`bet_ram`), and the pool shrank to 9.
- **Items**: Gauntlets (+1 tile and +3 crash) → +2 tiles; Hand Mirror (3 MAGNIFICENCE at combat start, always-good
  surges, +10 Hype) → two effects per surge (no start-of-fight bonus, DESIGN v2 §8.7).
- Durations: every `turns: 2` workaround is `turns: 1` (own-turn counting).
- Blurb: "…throws anything, swings at whatever tries to walk away from him and bottles up so much MAGNIFICENCE…".

### Public API

- `DD.Marwyn` (attached at load time): `MAX` (5), `SURGE_HYPE` (10), `GAUNTLET_TILES` (2), `stacksOf(u)`,
  `addStacks(u, n)` (now, capped), `gain(u, n)` (banked while his own skill resolves), `surge(u, rng) → [effects]`
  (forces a MAGNIFICENT SURGE; 1 good effect, 2 with the mirror unless the first won the fight; a second that lost
  its target to the first is re-rolled),
  `flightPath(unit, dir, n, src)` (YEET's landing path; asks the thrower's `modifyOutgoingPush` and the target's
  `modifyPush` hooks quietly, like `Act.push`), `hasItem(userOrRunHero, id)`.
- Status `mrw_rage` (stacks = flat reduction vs hits: causes skill / other / bump / explosion — attacks of opportunity
  included; not statuses, terrain, surfaces or falls). Status `mrw_magnificence` has no hooks (the meter only).

### Deviations

- DESIGN §6's Marwyn brief is still the v1 text ("stacks from hitting, being hit and kills, each stack +damage",
  "resists pushes", Unstoppable Charge, Whirlwind, "Flex (Block + Thorns)", a leaping signature). The v2 Simplicity
  rules win: one gain rule and no damage bonus / push resistance (passive = one clear rule), no charge (Betty's),
  Center of Attention instead of Whirlwind (a pull is a setup, a whirlwind just another AoE), Gun Show = Root + Thorns
  (Block already lives on LOOK AT MARWYN! and BEHOLD), and a signature with ONE big effect (taunt everything + Block).
- Attacks of opportunity count for MAGNIFICENCE (and surge at 5): the passive's rule is literal ("each of his skills
  that reaches a foe"), an attack of opportunity is his Ginger Snap, and holding the line is the tank's job. No extra
  clause in any text.
- No "+N on attacks of opportunity" item (rules.md suggestion for tanks): his three items stay build-arounds for his
  three mechanics (YEET, taunts, MAGNIFICENCE); the Loincloth's Taunt reduction covers attacks of opportunity anyway.
- Pool of 9: DESIGN v2 says 8-10, the registry suite still checks 9-11; 9 satisfies both.
- The hero's `stats.init` is 0 (the assignment), so he rolls a plain d20.

### Requests

- **Lead (DESIGN §6)**: replace Marwyn's brief with the v2 kit, e.g. "Passive *MAGNIFICENCE*: each of his skills that
  reaches a foe adds 1; at 5 his next skill unleashes a MAGNIFICENT SURGE (good wild magic + 10 Hype). Melee basic =
  he holds the line (attacks of opportunity fill the meter too). Skills: LOOK AT MARWYN! (taunt + Block), YEET (throw
  friend or foe; crashes), Glorious Cleave, Use Your Head (Stun), Hero Landing (leap + taunt), Gun Show (Root +
  Thorns), Ginger Rage (damage reduction + MAGNIFICENCE), Center of Attention (pull + taunt), Keg Stand (heal + water).
  Signature: *BEHOLD, MARWYN!* (every enemy Taunted, huge Block)." Also `docs/notes/content-digest.md` still lists
  `mrw_charge`.
- **ENGINE / AI** (optional): `DD.AI.estimate` (and so `DD.Combat.provokes(...).dmg`, the move preview's "provokes"
  numbers, threat shading) applies only status `takenMult`s, not flat reductions or item hooks: a raging Marwyn is shown
  a 4-damage stab that deals 2 (Ginger Rage), a Loincloth-wearing one 4 instead of 3 vs a foe he Taunted. A pure
  `takenFlat(st, unit)` on status defs (like `telegraphFlat` for attackers) would let `mrw_rage` declare it.
- **KIT** (FYI): `tests/content/kit.js`'s push-path highlight check still names "Marwyn (1 shorter)" and
  `docs/notes/kit.md` mentions "Too MAGNIFICENT to move!": Marwyn has no `modifyPush` hook any more (the check still
  passes, it just pushes him the full distance now). Barrel Armor remains a real `modifyPush` user.
- **Hero-betty** (FYI, no change needed): Betty and Marwyn both have a stun headbutt, an AoE taunt and a leap
  (DESIGN gives Betty those ideas too). Marwyn's identity is the MAGNIFICENCE meter, friend-or-foe YEET with crashes,
  Root + Thorns, beer puddles and the wild-magic pull; Betty's is the charge / ram, eating and the goat toss.
- **Hero-slate** (v2 review): `sla_lawn` Get Off My Lawn is now a copy of Marwyn's starter LOOK AT MARWYN! — same AP
  (1), cooldown (2), radius (2/2/3), Block (4/6/8) and effect ("every foe within N is Taunted … and you gain N Block").
  DESIGN §6 gives Marwyn the shout (*War Cry ("I AM MAGNIFICENT!" taunt + Block)*) and Slate *Get Off My Lawn (taunt +
  push adjacent foes)*: please give Slate's the push rider back (e.g. "Push every adjacent foe 2 tiles; they are
  Taunted"), so the two tanks don't share a skill. (Still open after Slate's own v2 review, re-checked in the Marwyn
  review pass 2: same AP, cooldown, radius, Block and effect.)
- **MAPGEN** (FYI, `js/data/wildmagic.js`): `wm_caffeine` says "a hero also gains 1 AP right now", but a surge outside
  the hero's own turn banks that AP (`DD.Act.gainAp`): Marwyn's attack of opportunity at a full meter surges on the
  enemy's turn, so he gets it on his next turn. Maybe "a hero also gains 1 AP (on its next turn if it is not its turn)".

### Known issues

- Act-1 campaign sims, real content (`tools/sim.sh "seeds=8&from=100&party=marwyn,zarathor,ellaria,syllamin&stop=1"`,
  44 fights, 8/8 act-1 clears): Marwyn deals 10.7 / takes 7.3 HP a fight (the most of the four), 0.07 downs a fight;
  uses per fight socketed: Gun Show 1.5, Ginger Snap 1.5 (on his turn; attacks of opportunity not counted), LOOK AT
  MARWYN! 0.8, YEET 0.3, Use Your Head 0.3, Hero Landing 0.1 (was 0 before its hint), BEHOLD 0 (the party's Hype goes to
  the damage signatures first, and act-1 fights rarely still have 3+ foes away from him by the time Hype is full; the
  hint makes AutoPlay use it when they do — tested). Fixture AutoPlay suites: every fight won, 7 different skills used.
- A HUD preview of a skill used at 5 MAGNIFICENCE is uncertain ("?"): the surge rolls dice (fair previews).
- Keg Stand soaks Marwyn too (he stands in the middle of the puddle): a lightning ally's electrified water hits him.
- The move preview's attack-of-opportunity numbers ignore Ginger Rage / the Loincloth (see Requests, ENGINE / AI).

### Tests (`tests/content/hero_marwyn.js`, 21 suites, 2,161 assertions, ~2 s isolated)

1. definition + **simplicity budget**: stats (init 0, unlock null, no Block stat), pool of 9, AP mix, every desc ≤ 24
   words with no if/else or v1 words, level II = same text with bigger numbers, level III = same text or ONE short
   appended rider; passive ≤ 45 words; no "telegraph / intent / Guard / fizzle / redirect" in any text; pronouns per
   sentence (all 16 heroes); a bark for each of Kiri, Betty, Basanos, Valdris, Hjalmar and Pebbles; items have no
   start-of-fight hooks and one rule; sprite + overlay + portrait.
2. MAGNIFICENCE: one gain per skill with a foe in its area (War Cry with / without an audience, YEET of an ally over
   open floor vs into a foe, Keg Stand splash, kills, being hit, consumables), no damage bonus at 0/3/5, cap, the meter
   persists between turns, the skill that fills the meter does not surge, the next one does (exactly one good effect,
   exactly +10 Hype, a normal hit), Ginger Rage at 3 and 5, no surge after the winning blow, 40 seeds all good and
   varied, deterministic per seed.
3. Ginger Snap + Glorious Cleave I-III (row, III knockback + bump, cooldown per own turn).
4. LOOK AT MARWYN! I-III + v2 behaviour: control vs taunted grunt next to a wounded mage (the grunt stabs Marwyn's
   Block instead), Block stands on the grunt's turn and is gone at his next turn start, Taunt gone after its turn.
5. YEET I-III: open floor, wall / unit crashes, edge, explosive barrel, pit (+20 Hype), lava, water, allies, immovable,
   bosses climb out, HUD flight path (incl. ice slide and slide-into-crash), a `modifyPush` hook shown in the HUD path.
6. `modifyPush` core hook regression (the v1 core fix: cancel, lengthen, payload, immovable first).
7. Use Your Head I-III: damage, HP cost, cooldown, the stunned grunt loses exactly one turn, a boss wind-up interrupted.
8. Hero Landing I-III: range, units, hazards (lava / pit / fire), rooted; Taunt next to the landing; v2 rescue.
9. Gun Show I-III: Root adjacent only, Thorns; v2: the rooted grunt can't reach the mage and eats Thorns; durations.
10. Ginger Rage I-III: reduction vs hits / bumps, not statuses, tiny hits absorbed, through his next turn exactly.
11. Center of Attention I-III: pull geometry, Taunt, range, Silence, AP, pit kill, pull → Cleave payoff.
12. Keg Stand I-III: heal, puddles, Wet, fire out, lava → obsidian, charges, cooldown, Wet → lightning +50%.
13. BEHOLD: Hype, area = every foe, Taunt all, 15 Block, the party is left alone on the enemies' turns, surge at 5.
14. Items: gauntlets (desc, HUD path, distance, normal crash), loincloth, mirror (two different good effects, 10 Hype,
    no combat-start bonus; a first effect that wins the fight skips the second; one that takes the second's target away
    — BEES! on the last non-boss foe before Baa-d Luck — gets the second re-rolled, and the banner names both that went
    off), a short AutoPlay battle with each.
15. HUD previews vs reality: every skill × level × (0 and 5 MAGNIFICENCE), 3 targets each.
16. v2 edge cases: silence / stun / sleep / frozen / sheep, a stun costs exactly one own turn, charm (no damage to the
    charmer, 2 AP next turn), AP limits, "Not Marwyn's turn.", deaths mid-skill (Cleave III kills, YEET a dying minion,
    Marwyn downed by Thorns mid-skill), every skill executed with odd targets, corners / edges, own-turn durations of
    Stun / Taunt / Root / Block / Thorns / Rage in one turn.
17. **Attacks of opportunity**: Ginger Snap is his reaction (free: no AP, no use), +1 MAGNIFICENCE, the bark key, once
    per round then again next round; at 5 it surges (good, +10 Hype); a winning swing never surges; walking away from a
    grunt provokes it (move preview: 4) and being hit adds nothing; Ginger Rage (4 → 2) and Gun Show's Thorns vs that
    stab; the Loincloth (4 → 3); Hero Landing out of three grunts, YEET of a pinned mage, Center of Attention's pull off
    the knight and Cleave III's knockback never provoke; LOOK AT MARWYN! drags a grunt off the knight through the
    knight's attack of opportunity (control: it sticks to the knight); a grunt he Taunted lets the pinned mage walk
    away unhurt (control: a 4-damage stab; the move preview agrees); stunned / asleep / frozen / sheep / charmed Marwyn
    makes none; a Ginger Snap on his own turn never asks for the `opportunity` bark.
18-19. AutoPlay battles, party marwyn + test knight / cleric / mage vs fixture encounters: act 1 at level 1 (normal,
    elite, boss, totems), acts 2-3 at levels 3 / 5 (normal, elite, boss, protect-the-keg, survive); every fight
    finishes with rolled initiative, Marwyn takes turns in every fight, uses his skills (both starters at level 1,
    6+ different skills later) and the party mostly wins. (Review v2) Every real use of his skills in these fights is
    audited (`audited()`): the passive's one rule on each use, attacks of opportunity included (a full meter surges
    unless the fight is decided, then +1 with a foe in the area, +2 more for Ginger Rage, nothing else), and for each
    skill AutoPlay picks the HUD preview == what happened (HP, KOs, movement, Hype).
20. AutoPlay walks up and YEETs a foe into a pit (the throw hint's numbers + a real turn).
21. AutoPlay hints: Hero Landing's numbers (3 next to the grunt on the mage, 0 next to nobody / in the exact pass /
    for a foe already Taunted) and a real turn (he leaps next to the grunt, Taunts it, the 4-HP mage survives its
    turn); BEHOLD's numbers (12 for three grunts on the mage, 8 once one is Taunted) and a real turn (AutoPlay spends
    the 100 Hype on it). Mutation-checked: with the BEHOLD hint at 0 AutoPlay keeps the Hype.

## Review (v2) — adversarial review of the v2 + attacks-of-opportunity pass (ADVERSARIAL REVIEWER role)

Scope: the v2 author's work on `js/data/heroes/marwyn.js`, `tests/content/hero_marwyn.js` and this file. Two passes:
pass 1 finished its fixes and these notes but the desktop app hung (22:58) before its report went out; pass 2 resumed,
re-verified everything on the current engine and content, and added real-content invariant checks plus a
mutation-checked audit to the suite (see "Pass 2" below).

### Pass 1

Method: every claim of the author's report re-run; scratch probes in `.tmp/mrwrev/` (`run.sh` + `probe.js`: forced
surges in the middle of an enemy's walk, odd landing / throw tiles, a real-content AutoPlay fuzz; `shot.sh` + `view.js`:
combat views with a pumped-up Marwyn), screenshots read, each fix mutation-checked.

#### Verified (held)

- **desc == effect** at every level for all 11 skills, the passive, both statuses and the 3 items (each desc re-read
  against `execute`; the per-level suites and the 1,098 preview checks re-run). Longest desc: YEET, 18 words; the rest
  ≤ 16.
- **Simplicity**: every skill is one verb + at most one rider (Taunt + Block, throw + crash, row damage (+ III
  knockback), damage + Stun, leap + Taunt, Root + Thorns, damage reduction + 2 MAGNIFICENCE, pull + Taunt, heal +
  water); II = numbers only; III = numbers, or numbers + the one Cleave rider. The passive is one rule (skills that reach
  a foe fill the meter; the next skill surges) and still the joke.
- **v2**: no intents / Guard / combat-start Block / XP left (grep), `init: 0`, `unlock: null`, own-turn durations and
  Block until his next turn start (suite 16).
- **Attacks of opportunity**: Ginger Snap is his free reaction (+1 MAGNIFICENCE, surges at 5, never after the win). Each
  of the 17 good wild magic effects, forced onto an attack of opportunity in the middle of an enemy's walk (real turn
  order): no errors, no units sharing a tile; a foe turned into a sheep or frozen never attacks afterwards (frozen ends
  the walk on the spot), a charmed one leaves the mage alone, crates that pop up in its way end the walk. His leap,
  throws, pull and knockback never provoke.
- **Real content**: 40 AutoPlay fights, random real parties with Marwyn vs random normal / elite encounters of every act
  (levels 1-5): 36 won, 0 swallowed errors, 0 timeouts, the meter never above 5, 19 surges. Marwyn made only 2 attacks of
  opportunity (brutes stay on him, as intended) and took 8 (his own walks off foes); 22.6 dealt / 27 taken per fight;
  5 downs in 40 fights.
- **Odd tiles**: Hero Landing refuses walls, deep water, crates / barrels and hazards (lava, fire, poison, pits) and
  allows water, ice, mud, oil, webs (he lands Rooted) and any height; YEET's HUD path matches the real throw up a +2
  step (crash), off a 3-high ledge (no damage), into deep water (KO, shown in the preview) and into a crate (crash, crate
  breaks); a downed ally is not a YEET target.
- **Looks**: gallery (poses, statuses, portraits), party-select card + detail panel, combat views at 5 MAGNIFICENCE
  (violet belt gems, orbiting sparkles, the 🦁 5 and Thorns chips) and the YEET tooltip text.
- **Pronouns** he/him throughout, the 16 heroes checked per sentence; barks ≤ 70 characters, Valdris / Hjalmar /
  Pebbles named in character ("Valdris! Forge Marwyn a new everything!").

#### Fixed (each with an assertion that fails without it)

1. **Hand Mirror after a winning surge**: when the first of its two effects won the fight (Smite on the last foe), the
   second still went off after the victory (a duck summoned into a finished fight). `surge()` now skips further effects
   once `state.result` is set. Test: items suite (with the old line it reports `wm_smite,wm_duck`).
2. **"Random good wild magic"** had an unreachable fallback to the whole table (backfires included) when no good effect
   was eligible; removed, so the code says what the passive says (a hero's good pool is never empty: Spontaneous Plate
   Armor, Self-Care, Enlarge… have no conditions).
3. **The untested half of the attack-of-opportunity combo**: a foe Taunted by Marwyn only strikes its taunter, so a
   pinned ally walks away from it for free. New test: LOOK AT MARWYN! at the grunt pinning the mage → the mage leaves
   unhurt and the move preview shows no provoke; control: a 4-damage stab. Added to Combos above.
4. **Bark guard**: the `opportunity` bark was only tested positively; a negative check now fails if Ginger Snap asks for
   it on his own turn (mutation: `if (ctx.opportunity)` removed → fails).

#### Lens checks (no change needed)

- **Reads as the user's character** ("a large ginger human barbarian with wild magic aspects who refers to himself as
  MAGNIFICENT a lot"): Marwyn the Magnificent, MAGNIFICENCE in capitals and the third person everywhere, the ginger
  beard sprite, wild magic leaking out of the meter, the wild-magic pull, LOOK AT MARWYN! / BEHOLD, MARWYN!.
- **Combos** (setups / payoffs with other heroes): Center of Attention (gathers foes for AoE: Zarathor, Pebbles' Big Wag,
  Valdris' Molten Spray, his own Cleave), YEET (pits, lava, Hjalmar's traps, Corelos' runes; throws a pinned ally out),
  LOOK AT MARWYN! / BEHOLD (Taunted foes walk through allies' attacks of opportunity and let pinned allies go), Use Your
  Head (Stun interrupts boss wind-ups), Gun Show (Rooted targets), Keg Stand (Wet).
- **Distinct**: the meter, friend-or-foe YEET, Gun Show, Center of Attention, Keg Stand, Ginger Rage and BEHOLD are his
  alone. Overlaps: Betty's Butt Out (≈ Use Your Head) and Mountain Goat (≈ the leap of Hero Landing), both from DESIGN;
  Slate's Get Off My Lawn is an exact copy of LOOK AT MARWYN! → Requests (hero-slate).
- **AoO**: he holds the line (melee basic, Taunts that redirect walkers, Gun Show Roots) and disengages with Hero
  Landing; YEET gets allies out.

### Pass 2 (resumed after the hang)

Method: pass 1's fixes and claims re-checked on the current files; new scratch in `.tmp/mrwrev2/` (`run.sh` +
`probe.js`: a real-content invariant fuzz and a Hype probe; `mut.sh` + `mut.html` + `heroes/marwyn.mut*.js`: the test
page with `marwyn.js` swapped for a mutant); screenshots re-taken and read.

#### Verified (held)

- **Pass 1's fixes are in place and green**: at the start of pass 2 `marwyn.js` was byte-identical to pass 1's final
  copy (`.tmp/mrwrev/marwyn.fixed.js`): the Mirror skip after a win, the good-only pool, the pinned-ally test, the bark
  guard. Isolated suites green; generic `content:` suites with Marwyn isolated: 8 suites, 3,293 assertions, green.
- **desc == effect** re-read against `execute` for every skill at every level, the passive, both statuses and the 3
  items: no drift. Simplicity, v2 (no intents / Guard / starting Block / XP; `init: 0`; own-turn durations), pronouns:
  as pass 1 says.
- **Real-content invariant fuzz** (`bash .tmp/mrwrev2/run.sh "suite=probe: real&n=40&verbose=1"`): 40 AutoPlay fights,
  Marwyn + 3 random heroes of the other 15, random encounters of every act including 5 bosses (levels 1-6), 2-4 random
  pool skills at random levels, a random item of his in half the fights:
  - the passive's rule on all **320** real uses of his skills (3 of them attacks of opportunity): MAGNIFICENCE after ==
    (surged ? 0 : before) + 1 with a foe in the area (+2 for Ginger Rage); a full meter always surged unless the fight
    was decided, never below it: **0 mismatches**;
  - HUD preview vs reality for all **312** skills AutoPlay picked (279 certain; the other 33 were "?" at 5 MAGNIFICENCE):
    HP, KOs, movement, Hype: **0 mismatches**;
  - **144** per-skill effect checks on real enemies (shout / BEHOLD Taunts + exact Block, landing Taunts, Gun Show Roots
    + Thorns, Rage stacks, Center of Attention Taunts, Stuns, Keg heals): **0 failures**;
  - 39 surges, all good, none after the result; meter ≤ 5; 0 swallowed errors, 0 timeouts; 29/40 won; Marwyn ended 13
    of the fights downed (the tank takes the hits; the party still won most of those).
  - re-run after fix 5 on new seeds (`&from=100`): 40 fights, 31 won, 376 uses accounted (7 attacks of opportunity), 325
    certain previews and 177 effect checks, 46 surges: all clean again.
- **BEHOLD's rarity measured** (`suite=probe: Hype`, 40 real fights, starting kits): the party's Hype was 100 at the start
  of only 2 of Marwyn's 308 turns and the whole party used 7 signatures in 40 fights. It is the Hype economy, not his
  hint (the fixture suite shows AutoPlay spending a full bar on BEHOLD when three foes are on a wounded ally).
- **Looks** re-shot and read: gallery (poses, statuses, portraits, the belt buckle), party select (card + detail panel:
  blurb, stats, passive), a real act-1 combat (Kiri, Valdris, Pebbles) with Marwyn at 5 MAGNIFICENCE (orbiting
  sparkles, 🦁 5 and Thorns chips).

#### Fixed / added (each mutation-checked)

5. **Hand Mirror's second effect could fizzle** (desc ≠ effect, found by running it): both effects were picked before
   the first was applied, so when the first took the second's target away — Smite or BEES! finishing the last non-boss
   foe while a boss stands, then Baa-d Luck / Brain Freeze / Love Potion with nobody left to hit — the second did
   nothing: the item delivered one effect while its desc promises two, and the banner named the dud (probe: 8 of 12
   seeds of a boss + minion fight). `surge()` now re-rolls that second effect among the good ones that still apply
   (only in that case, so normal surges roll exactly as before) and sets the queued banner's sub line to the effects
   that went off. Test: items suite (BEES! + Baa-d Luck with a boss up → BEES! + another good effect, no sheep, the
   banner names both); the pass-1 file fails it twice ("wm_bees" only; banner "🐝 BEES! + 🐑 Baa-d Luck"), a copy
   without the banner line fails once.
6. **A suite-level audit of every real use** (suites 18-19, `audited()` in the test file): the 13 AutoPlay fixture
   battles now check the passive's one rule on each use (attacks of opportunity included) and, for each skill AutoPlay
   picks, that the HUD preview matches what happened. Green on the real file (19 + 25 uses accounted, 18 + 23 previews
   compared). Mutants: +1 MAGNIFICENCE even without a foe in the area → fails (25 mismatches); surging on the skill
   that fills the meter → fails ("surged below a full meter"); a `Math.random()` damage roll in Ginger Snap → fails
   (preview ≠ outcome, the class of bug "randomness only via RNG instances" forbids).

#### Lens checks (pass 2)

- **Combos have real partners today**: Betty's Kick (extra damage vs Stunned / Rooted) pays off Use Your Head and Gun
  Show; Hjalmar's traps spring on pushes and pulls (YEET, Center of Attention, Cleave III); AoE payoffs for the pull
  (Zarathor, Valdris' Molten Spray, Corelos' runes, Kiri's volley, his own Cleave); Taunts that walk foes through allies'
  attacks of opportunity and let pinned allies leave (tested). Wet's payoffs stay thin (Syllamin's lightning item, the
  Thunder Jar / Frost Flask, the Smite surge), as pass 1 said: Keg Stand is a heal + fire / lava answer first.
- **Overlaps** (all from the DESIGN briefs; Marwyn's identity — the meter, friend-or-foe YEET, Gun Show, Ginger Rage,
  Center of Attention, Keg Stand, BEHOLD — is his alone): Slate's Get Off My Lawn is still an exact copy of LOOK AT
  MARWYN! (1 AP, cd 2, radius 2/2/3, Block 4/6/8; Requests, hero-slate); Betty's Butt Out = Use Your Head without the
  2 HP cost (1 less damage), Bleat of Defiance ≈ the shout without Block, Mountain Goat ≈ Hero Landing without the Taunt.

#### Test runs (pass 2, final files)

- Isolated `bash tools/test.sh "suite=hero_marwyn&isolate=heroes/marwyn,hero_marwyn"`: 21 suites, 2,161 assertions, 0
  failures. Generic `bash tools/test.sh "suite=content:&isolate=heroes/marwyn,hero_marwyn"`: 8 suites, 3,293, 0.
- Full `bash tools/test.sh` (last run): 789 suites, 114,630 assertions, 20 failing sections, none of them Marwyn's —
  bosses_act1 ×18 (its tests still call the removed `DD.AI.plan`; the Grimble sim's round count) and integration ×2
  (unlock / "no XP" expectations); all 21 `hero_marwyn` suites green with every author's content loaded; no swallowed
  "Error in". One earlier full run also failed `ui: out-of-combat skill text and costs …` (Zarathor's Fireball AP pill
  on the party screen; it runs before any Marwyn suite): it passed alone, with every `ui:` suite, after the `run:`,
  `content:`, `engine:` and render / sprites / mapgen groups, and in the next full run — other areas mid-flight.

### Remaining (not Marwyn's files, or by design)

- Move preview / threat numbers ignore Ginger Rage and the Loincloth (engine estimate; Requests, ENGINE / AI).
- Keg Stand's Wet has few payoffs in today's roster (Syllamin's lightning item, Thunder Jar, Frost Flask, the Smite
  surge) and works against Burn; the skill's value is the heal plus putting out fire / cooling lava. Left as designed.
- His damage is low by design (the tank takes the hits); BEHOLD is rare in sims because full Hype is (pass 2 numbers).
- `wm_caffeine`'s "right now" AP is banked when his surge happens on an enemy's turn (Requests, MAPGEN).
- At 5 MAGNIFICENCE previews show sampled ranges ("? −7 · Stun"): the surge rolls dice (fair previews, engine rule).
- Overlaps with Slate (an exact copy of the shout) and Betty (headbutt, shout, leap): Requests, hero-slate / hero-betty.

## History (v1, superseded)

- v1 kit (12 skills: + Ginger Stampede, Fastball Special → Hero Landing in the v1 review), the 4-rule passive and the
  telegraph tools are described above under "What was cut or changed". The v1 review's fixes that still matter: no
  surge after the fight is won (kept), YEET's HUD path includes the ice slide (kept, and it now asks push hooks too).
- **Core fix (still in the engine)**: `js/engine/actions.js` `Act.push` fires the content hook `modifyPush(p)`, `p = {
  unit, src, dir, dist, cancel }`, after the immovable check (`modifyOutgoingPush` on the pusher came later, phase 4);
  `tests/content_tests.js` lists the hook. Marwyn no longer uses it; Barrel Armor and the kit's push paths do. Its
  regression suite stays in this file (suite 6 above).

## Requests (Nov 3) — flyers, barrels (CONTENT SWEEP heroes-1, 2026-11-04)

Suite: `hero_marwyn: v2 requests — …`. Rules: `docs/notes/rules.md` "v2 requests".

- **Flyers.** Keg Stand's splash is a floor puddle (`DD.Act.splash`: the engine Wets only units that feel the surface),
  so its desc now says "(grounded units there get Wet)"; a flyer above the puddle stays dry (tested). YEET's flight path
  and the AutoPlay throw hint already read `hazardDamage(x, y, unit)` / `isFlying` per unit.
- **Barrels.** Ginger Snap and Use Your Head can be aimed at an adjacent volatile object (kept: Marwyn headbutting a
  barrel is canon). He is in the blast: Ginger Snap costs him 8, Use Your Head 2 HP (its cost) + 8; no Stun on a barrel.
  YEET is a direction target (never at objects).
- **Heals.** Keg Stand heals himself only (self target): never a revive.
