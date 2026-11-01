# HERO-MARWYN notes

Files: `js/data/heroes/marwyn.js`, `tests/content/hero_marwyn.js` (18 suites `hero_marwyn: …`), this file.
Run: `bash tools/test.sh "suite=hero_marwyn&isolate=heroes/marwyn,hero_marwyn"`; generic validation:
`bash tools/test.sh "suite=content:&isolate=heroes/marwyn,hero_marwyn"`.
Looks: `bash tools/shot.sh "debug=1&fixtures=1&isolate=heroes/marwyn,hero_marwyn&gallery=marwyn" .tmp/marwyn/g.png 1280x720 4000`.

## v2 — the simplified kit (initiative, no telegraphs, no Guard, no combat-start Block)

User (after the v1 playtest): *"skills are too overcomplicated, doing too much each. Can we simplify them a bit such
that it's the combinations of effects that feel strong?"* — plus initiative order, no telegraphs, no Guard and no
start-of-fight shield. DESIGN §6 "Simplicity": one verb per skill + at most one simple rider, desc in one breath,
II = bigger numbers, III = bigger numbers or ONE added rider, power from combinations, passive = one clear rule.

### Summary

**Marwyn the Magnificent** (he/him), human barbarian, available from the start (`unlock: null`). Tank / bruiser /
taunts, complexity 2. 35 HP (+5/level), 3 AP, move 3, armor 0, **initiative +0** (`stats.init: 0`). Sprite unchanged:
huge ginger barbarian with a gold championship belt whose 5 gems light up with his MAGNIFICENCE (violet + orbiting
sparkles when full = his next skill surges).

**Passive — MAGNIFICENCE** (one rule): *each of his skills that reaches a foe (a foe in its area) adds 1 MAGNIFICENCE.
At 5, his next skill also unleashes a MAGNIFICENT SURGE (a random good wild magic effect, +10 party Hype) and the meter
resets.* Status `mrw_magnificence` (🦁, 0-5, never decays). The surge rolls one `DD.WildMagic` effect from the **good**
table with the combat RNG (no more 85/15 odds), shows a "MAGNIFICENT SURGE!" banner, barks and gives the party 10 Hype
(DESIGN §4.5). Implementation: `onSkillUsed` checks the meter first (≥ 5 → surge, reset), then adds this skill's +1
(`ctx.foes.length > 0`) plus anything banked in `unit.data.mrwPending` during the skill (Ginger Rage's +2), so the
surge always belongs to the skill AFTER the one that filled the meter. Consumables never count; no surge once the
fight is decided (`state.result`).

**Basic** `mrw_ginger_snap` Ginger Snap 🪓 (1 AP): 5 damage to an adjacent foe.
**Signature** `mrw_behold` BEHOLD, MARWYN! 💥 (2 AP, 100 Hype, area `all_foes`): *EVERY enemy is Taunted and Marwyn
gains 15 Block.* One big effect: for a round every enemy must come for him (the far ones walk toward him) while the
party works freely.

**Pool (9, starters ⭐ first)** — I / II / III:
| id | name | AP / cd | desc (level I) | II / III |
|---|---|---|---|---|
| `mrw_war_cry` ⭐ | LOOK AT MARWYN! 📣 | 1 / 2 | Taunt every foe within 2 tiles and gain 4 Block. | r2 B6 / r3 B8 |
| `mrw_yeet` ⭐ | YEET 🤾 | 2 / 2 | Throw an adjacent unit (friend or foe) 3 tiles away from him; on a crash, it and what it hits take 6 damage. | 3 t, 8 / 4 t, 10 |
| `mrw_cleave` | Glorious Cleave ⚔️ | 2 / 1 | Deal 5 damage to every foe on the 3 tiles in front of him. | 6 / 7 + knock them back 1 |
| `mrw_headbutt` | Use Your Head 🤕 | 2 (+2 HP) / 3 | Deal 7 damage to an adjacent foe and Stun it. Costs him 2 HP. | 8 / 10, cd 2 |
| `mrw_hero_landing` | Hero Landing 🦸 (move) | 2 / 2 | Leap to a free tile up to 3 tiles away and Taunt every foe next to where he lands. | 4 / 5 |
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
  Corelos' runes, Syllamin's cone, his own Glorious Cleave (tested: a pull lines 3 foes up for one Cleave).
- **Keg Stand** puts puddles + **Wet** on everything next to him: lightning allies deal +50%, frost freezes, fire is
  put out, lava cools (tested: a Wet foe takes 9 instead of 6 from a lightning hit). Marwyn gets Wet too (careful).
- **YEET** is positioning for everyone: throw foes into pits (YEETED: +20 Hype), lava, water (Wet), explosive barrels,
  other foes (both take the crash) or allies' traps; throw an ally (Sparrow, Marbles) into position.
- **Use Your Head** Stuns: the foe loses its whole next turn and a boss **wind-up is interrupted** at once (DESIGN §9).
- **Gun Show** Roots the foes next to him: stationary targets for the party, and they can't walk past him to the
  squishies (tested: a rooted grunt stabs Marwyn and eats the Thorns instead of finishing the wounded mage).
- Tank protection without telegraphs: LOOK AT MARWYN!, Hero Landing, Center of Attention and BEHOLD Taunt foes, so on
  their turns they must attack him (tested with a wounded mage next to the grunt: control vs taunted).

**Items** (hero `marwyn`; one rule each, nothing at combat start):
- `mrw_yeet_gauntlets` Gauntlets of Competitive Yeeting (weapon, rare): +5% damage. YEET throws 2 tiles further.
- `mrw_loincloth` Loincloth of Unearned Confidence (armor, rare): +6 max HP. Foes Taunted by Marwyn deal 25% less
  damage to him.
- `mrw_hand_mirror` Hand Mirror of Self-Admiration (trinket, legendary): his MAGNIFICENT SURGEs unleash two different
  good wild magic effects instead of one (still +10 Hype).

**Barks**: every key 4-6 lines ≤ 70 chars, lots of CAPITALS and third person; now also Kiri, Betty and Basanos
("Betty, stop eating the map. Marwyn was reading that.", "Roll for initiative? Marwyn rolls for MAGNIFICENCE!").
Extra keys: `surge`, `maxed`, `taunt`, `yeet`, `landing`, `flex` (new, Gun Show). Pronouns as confirmed by the user.

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
  Taunt the foes next to him (no intents to read; ally Block expired at the ally's own turn start anyway).
- **Use Your Head**: "its telegraphed attacks are cancelled" → Stun (it loses its next turn).
- **Gun Show**: Block + Thorns (+ III Weak) → Root adjacent foes + Thorns ("Tickets are free. Leaving is not.").
- **Ginger Rage**: −2/−3/−3 per hit for 2 turns + 2/2/3 stacks + III +1 AP → −2/−3/−4 through his next turn + 2.
- **Center of Attention**: III's "+1 MAGNIFICENCE per foe pulled" cut.
- **Keg Stand**: III heal 7 → 8 (the water rider unchanged).
- **Ginger Stampede** (`mrw_charge`) cut: Betty is the charger now (`bet_ram`), and the pool shrank to 9.
- **Items**: Gauntlets (+1 tile and +3 crash) → +2 tiles; Hand Mirror (3 MAGNIFICENCE at combat start, always-good
  surges, +10 Hype) → two effects per surge (no start-of-fight bonus, DESIGN v2 §8.7).
- Durations: every `turns: 2` workaround is `turns: 1` (own-turn counting).

### Public API

- `DD.Marwyn` (attached at load time): `MAX` (5), `SURGE_HYPE` (10), `GAUNTLET_TILES` (2), `stacksOf(u)`,
  `addStacks(u, n)` (now, capped), `gain(u, n)` (banked while his own skill resolves), `surge(u, rng) → [effects]`
  (forces a MAGNIFICENT SURGE; 1 effect, 2 with the mirror), `flightPath(unit, dir, n, src)` (YEET's landing path; asks
  the thrower's `modifyOutgoingPush` and the target's `modifyPush` hooks quietly, like `Act.push`),
  `hasItem(userOrRunHero, id)`. Removed: `PER_STACK`, `chargePlan`, `alliesAround`, `threatsTo`.
- Status `mrw_rage` (stacks = flat reduction vs hits: causes skill / other / bump / explosion; not statuses, terrain,
  surfaces or falls). Status `mrw_magnificence` has no hooks any more (the meter only).

### Deviations

- DESIGN §6's Marwyn brief is still the v1 text ("stacks from hitting, being hit and kills, each stack +damage",
  "resists pushes", Unstoppable Charge, Whirlwind, "Flex (Block + Thorns)", a leaping signature). The v2 Simplicity
  rules win: one gain rule and no damage bonus / push resistance (passive = one clear rule), no charge (Betty's),
  Center of Attention instead of Whirlwind (a pull is a setup, a whirlwind just another AoE), Gun Show = Root + Thorns
  (Block already lives on LOOK AT MARWYN! and BEHOLD), and a signature with ONE big effect (taunt everything + Block).
- Pool of 9: DESIGN v2 says 8-10, the registry suite still checks 9-11; 9 satisfies both.
- The hero's `stats.init` is 0 (the assignment), so he rolls a plain d20.

### Requests

- **Lead (DESIGN §6)**: replace Marwyn's brief with the v2 kit, e.g. "Passive *MAGNIFICENCE*: each of his skills that
  reaches a foe adds 1; at 5 his next skill unleashes a MAGNIFICENT SURGE (good wild magic + 10 Hype). Skills: LOOK AT
  MARWYN! (taunt + Block), YEET (throw friend or foe; crashes), Glorious Cleave, Use Your Head (Stun), Hero Landing
  (leap + taunt), Gun Show (Root + Thorns), Ginger Rage (damage reduction + MAGNIFICENCE), Center of Attention (pull +
  taunt), Keg Stand (heal + water). Signature: *BEHOLD, MARWYN!* (every enemy Taunted, huge Block)." Also
  `docs/notes/content-digest.md` still lists `mrw_charge`.
- **KIT** (FYI): `tests/content/kit.js`'s push-path highlight check still names "Marwyn (1 shorter)" and
  `docs/notes/kit.md` mentions "Too MAGNIFICENT to move!": Marwyn has no `modifyPush` hook any more (the check still
  passes, it just pushes him the full distance now). Barrel Armor remains a real `modifyPush` user.
- **Hero-betty** (FYI, no change needed): Betty and Marwyn both have a stun headbutt, an AoE taunt and a leap
  (DESIGN gives Betty those ideas too). Marwyn's identity is the MAGNIFICENCE meter, friend-or-foe YEET with crashes,
  Root + Thorns, beer puddles and the wild-magic pull; Betty's is the charge / ram, eating and the goat toss.
- **AutoPlay** (optional): YEET has no `dmg` number, so it is valued only through exact previews of its top targets;
  on open boards it rarely beats walking (it shines with pits, lava, walls and crowds).

### Known issues

- In fixture AutoPlay sims (48 fights, random 2-4 pool skills, levels 1/3/5) uses per fight offered: Gun Show 1.19,
  Ginger Rage 1.09, LOOK AT MARWYN! 0.86, Cleave 0.48, Use Your Head 0.39, Hero Landing 0.33, Center of Attention 0.26,
  Keg Stand 0.25, YEET 0.07 (open boards: nothing to crash into). 48/48 won; Marwyn 12 damage dealt / 7.8 taken per
  fight, never downed; 14 surges in 48 fights (~0.3 per fight: fixture fights are short, 3.6 Marwyn turns on average).
  Real fights (4-7 rounds) should see about one surge each; if it feels rare, lower `MAX` to 4 (one constant; the belt
  overlay follows it).
- A HUD preview of a skill used at 5 MAGNIFICENCE is uncertain ("?"): the surge rolls dice (fair previews).
- Keg Stand soaks Marwyn too (he stands in the middle of the puddle): a lightning ally's electrified water hits him.

### Tests (`tests/content/hero_marwyn.js`, 18 suites, ~2.1k assertions, ~2 s isolated)

1. definition + **simplicity budget**: stats (init 0, unlock null, no Block stat), pool of 9, AP mix, every desc ≤ 24
   words with no if/else or v1 words, level II = same text with bigger numbers, level III = same text or ONE short
   appended rider; passive ≤ 45 words; no "telegraph / intent / Guard / fizzle / redirect" in any text; pronouns per
   sentence (he/him for Zarathor, Syllamin, Marbles, Josiah, Corelos, Slate, Buga, Betty, Basanos; she/her for
   Ellaria, Sparrow, Kiri); items have no start-of-fight hooks and one rule; sprite + overlay + portrait.
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
6. `modifyPush` core hook regression (the v1 core fix: cancel, lengthen, payload, immovable first; Marwyn is pushed the
   full distance now).
7. Use Your Head I-III: damage, HP cost, cooldown, the stunned grunt loses exactly one turn, a boss wind-up interrupted.
8. Hero Landing I-III: range, units, hazards (lava / pit / fire), rooted; Taunt next to the landing; v2 rescue.
9. Gun Show I-III: Root adjacent only, Thorns; v2: the rooted grunt can't reach the mage and eats Thorns; durations.
10. Ginger Rage I-III: reduction vs hits / bumps, not statuses, tiny hits absorbed, through his next turn exactly.
11. Center of Attention I-III: pull geometry, Taunt, range, Silence, AP, pit kill, pull → Cleave payoff.
12. Keg Stand I-III: heal, puddles, Wet, fire out, lava → obsidian, charges, cooldown, Wet → lightning +50%.
13. BEHOLD: Hype, area = every foe, Taunt all, 15 Block, the party is left alone on the enemies' turns, surge at 5.
14. Items: gauntlets (desc, HUD path, distance, normal crash), loincloth, mirror (two different good effects, 10 Hype,
    no combat-start bonus), a short AutoPlay battle with each.
15. HUD previews vs reality: every skill × level × (0 and 5 MAGNIFICENCE), 3 targets each.
16. v2 edge cases: silence / stun / sleep / frozen / sheep, a stun costs exactly one own turn, charm (no damage to the
    charmer, 2 AP next turn), AP limits, "Not Marwyn's turn.", deaths mid-skill (Cleave III kills, YEET a dying minion,
    Marwyn downed by Thorns mid-skill), every skill executed with odd targets, corners / edges, own-turn durations of
    Stun / Taunt / Root / Block / Thorns / Rage in one turn.
17-18. AutoPlay battles, party marwyn + test knight / cleric / mage vs fixture encounters: act 1 at level 1 (normal,
    elite, boss, totems), acts 2-3 at levels 3 / 5 (normal, elite, boss, protect-the-keg, survive); every fight
    finishes with rolled initiative, Marwyn takes turns in every fight, uses his skills (both starters at level 1,
    6+ different skills later) and the party mostly wins.

## History (v1, superseded)

- v1 kit (12 skills: + Ginger Stampede, Fastball Special → Hero Landing in the v1 review), the 4-rule passive and the
  telegraph tools are described above under "What was cut or changed". The v1 review's fixes that still matter: no
  surge after the fight is won (kept), YEET's HUD path includes the ice slide (kept, and it now asks push hooks too).
- **Core fix (still in the engine)**: `js/engine/actions.js` `Act.push` fires the content hook `modifyPush(p)`, `p = {
  unit, src, dir, dist, cancel }`, after the immovable check (`modifyOutgoingPush` on the pusher came later, phase 4);
  `tests/content_tests.js` lists the hook. Marwyn no longer uses it; Barrel Armor and the kit's push paths do. Its
  regression suite stays in this file (suite 6 above).
