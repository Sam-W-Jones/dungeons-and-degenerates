# HERO-RASMA — Rasma the Monotaur, the 18th hero (h19)

Owner: HERO-RASMA (`h19:hero-rasma`). Spec: `.tmp/h19/addendum-rasma.md` (normative for his content); plan
`.tmp/h19/plan.md` (§0.2 D1-D14, §1.4); the user's words: `.tmp/h19/request.md` (they win over everything).

## Files and run commands
- `js/data/heroes/rasma.js` (the kit), `tests/content/hero_rasma.js` (16 suites + the zz sim, `hero_rasma: …`), this file.
- Iterate: `bash tools/test.sh "suite=hero_rasma&isolate=heroes/rasma,hero_rasma"`; the combos suite needs the cast:
  `bash tools/test.sh "suite=hero_rasma"` (no isolate). A battle trace: add `&dbg=1&verbose=1` to the AutoPlay battles
  suite. The zz sim: `bash tools/test.sh "suite=hero_rasma: zz&sim=1&n=3&verbose=1"`.
- Sanity sims (plan §3.1 seed ledger, 80000 + 100·k, one at a time):
  `bash tools/sim.sh "debug=1&raw=1&seeds=30&from=80000&stop=2&party=rasma,ellaria,kiri,josiah" .tmp/h19/rasma/sanity_k0b.txt`
  `bash tools/sim.sh "debug=1&raw=1&seeds=30&from=80100&stop=2&party=rasma,marwyn,kiri,josiah" .tmp/h19/rasma/sanity_k1.txt`
- Scratch sprite sheet (big zoom, every blade × pips, poses, facings, portraits): `bash .tmp/h19/rasma/shot.sh
  sprites.html s1.png 1400x860 3000 "big=ras_frost:3&z=7"` (query: `big=<status>:<n>`, `pose=`, `face=l`, `mono=1`,
  `still=1`).

## The user's brief
"Rasma, a monocle-wearing monotaur who speaks in formal, polite english. He is a spellsword (he enchants his sword with
magical effects to deal damage)." (Nov 18). He/him (the engine default: no `pronoun` field). "Monotaur" is his own joke:
epithet *the Monotaur*, race *Minotaur*, one select bark explains it. Everything else (tea, the three elements, the
claret tailcoat, init −1 as "after you") is the addendum's light proposal: names, flavour, barks and the sprite only
(open questions Q-R1..R7, plan §5.2).

## Kit table (level-by-level texts; every desc is pure with `user === null`)
| id | name | kind · AP / cd | I / II / III |
|---|---|---|---|
| `ras_pardon` (basic) | Pardon Me | attack · 1 / 0 | Sword strike: deal 5 damage to an adjacent foe. |
| `ras_cold_shoulder` (starter) | The Cold Shoulder | spell · 1 / 0 · self | Enchant your sword with frost (3 charges): its strikes deal frost damage, +2 / +3 / +3, and Slow each foe hit for 1 / 1 / 2 turn(s). Wet foes freeze. |
| `ras_shocking` | Positively Shocking | spell · 1 / 0 · self | Enchant your sword with lightning (3 charges): its strikes deal lightning damage (+50% against Wet foes), +2 / +3 / +3, and arc 2 / 3 / 4 lightning damage to the nearest other foe within 2. |
| `ras_disarming` | Most Disarming | spell · 1 / 0 · self | Enchant your sword with charm (3 charges): its strikes deal +2 / +3 / +3 damage and Weaken each foe hit for 1 / 1 / 2 turn(s) (it deals 25% less). |
| `ras_due_respect` (starter) | With All Due Respect | attack · 2 / 1 | Sword strike: deal 9 / 11 / 13 damage to an adjacent foe. (h19:balance: was 8 / 10 / 12) |
| `ras_sweeping_bow` | Sweeping Bow | attack · 2 / 2 · self, adjacent | Sword strike: deal 4 / 5 / 6 damage to every adjacent foe (one charge, however many it hits). |
| `ras_regards` | Sending My Regards | attack · 2 / 1 · LOS | Sword strike: flick a crescent of magic off your blade at a foe within 4 / 4 / 5: 6 / 8 / 9 damage. |
| `ras_keep_change` | Do Keep the Change | attack · 2 / 3 | Sword strike: deal 6 / 7 / 8 damage to an adjacent foe, +2 / +3 / +3 for each charge left on your enchantment; it uses them all. |
| `ras_touche` | Touché | buff · 1 / 2 · self | En garde: until your next turn, the first foe that hits you from an adjacent tile takes a sword strike back for 5 / 7. (III: the first 2 times a foe hits you from an adjacent tile, it takes a sword strike back for 7.) |
| `ras_tea` | Tea, Anyone? | utility · 1 / 3, 3, 2 · LOS, foe or ally | Throw your tea over a foe or ally within 3 / 4 / 4: it is Wet for 2 turns (a Burn on it goes out). |
| `ras_look` | A Disapproving Look | utility · 1 / 3 · LOS, not a boss | A foe within 3 / 4 / 4 (not a boss) is Silenced for 1 / 1 / 2 turn(s): no spells, and a spell wind-up fizzles. |
| `ras_thousand` (signature) | A Thousand Pardons | attack · 2, 100 Hype · self, circle 2 | Every foe within 2 takes three strikes of 6: lightning, then frost, then plain steel. Your enchantment is not used. |

Charges print the live number (`charges(user)`: 4 with Rapier Wit). "within N" prints `DD.Targeting.reach` (+range
items). The 6 sword skills append the live note in a fight only (a combat unit holding a blade): ` Now: ❄️ +2 frost,
Slows; 2 charges left.` / ` Now: ⚡ +2 lightning, arcs 2; 1 charge left.` / ` Now: 🌹 +2, Weakens; 3 charges left.`

Statuses: `ras_frost` Frosty Blade ❄️, `ras_shock` Shocking Blade ⚡, `ras_charm` Disarming Blade 🌹 (buff, refresh, max 4,
`decay: 'never'`, `showStacks: true`: the chip and the board glyph read "1" at the last charge), `ras_guard` En Garde 🤺
(buff, max 2, `decay: 'never'`; his passive removes it at his turn start). Items: Rapier Wit (legendary weapon, +10%,
4 charges), Bespoke Waistcoat (rare armor, +4 HP +1 armor), The Spare Monocle (rare trinket, the first enchantment each
turn costs 0 AP: `modifyCost` + `onCostPaid`, Basanos's Flea Collar pattern).

## The loop (charges, sword strikes, AoOs, spend timing, the arc, one at a time)
- Enchanting (1 AP, kind `spell`: Silence blocks it, a Silenced Rasma keeps his blade) removes every blade silently and
  adds one with `stacks = charges(u)`; recasting the one he holds refills it at the new level. Logs: `Rasma enchants his
  sword: Frosty Blade (3 charges).` / `Rasma swaps Frosty Blade for Shocking Blade (3 charges).`
- A sword strike = a hit (`cause 'skill'`) whose `d.skill` is one of HIS `'sword'` skills (`owner === 'rasma'`): Pardon Me
  (so his AoOs and Buga's Delegate), the five sword skills and Touché's riposte. Generic tome skills and the signature
  are not. The target must be a real foe: hostile both ways (`foeOf`), so a foe charmed to fight for the heroes takes a
  plain hit and no charge moves.
- `modifyOutgoingDamage` gives the hit the blade's element (`d.element`) and the bonus (`d.flat`), except on an AoO,
  which got the bonus as `o.flat` through `modifyOpportunity` (pure; the move preview, `AI.opportunityDmg` and the real
  hit read it). `estimateDealt` mirrors both (bonus, resist, the 0-immunity `e.mult = 0; e.flat = −1e6`, Wet ×1.5 on
  lightning, Frozen's physical ×1.5 taken back). No `telegraphFlat`, no `element` field on the status.
- `onDealDamage` (a hit that damaged: `d.amount > 0` after armor, before Block): the rider on a foe still standing (Slow
  / Weak; the engine freezes a Wet foe on frost), a `freeze` bark, and the strike is recorded on the resolving skill's
  ctx (`ctx.rasHit = { first, ids }`). Outside his own resolution (a riposte inside a foe's skill) it is spent at once.
- `onSkillUsed` (after `endSkill`): one charge per strike that damaged a foe, however many it hit (Do Keep the Change:
  every charge, flagged `ctx.rasCashOut` in its execute). Positively Shocking's arc fires there, once per strike, from the
  first foe's tile (it may have died there) to the nearest other foe within 2 that the strike did not hit (ties by
  position), `cause 'other'`, tag `ras_arc`: credited to him, never a multi-hit Hype foe, never a second sword strike.
- Never carried, never spent: an object hit (D4: `ctx.objectHit`, nothing recorded), a strike that dealt 0 (immune), Tea,
  the Look, Touché's own use, the arc, the signature. Downed, dispelled, combat start: plain steel, no afterglow.
- The look follows FX playback: `syncBlade` pins `unit.vis.rasBlade` to what was shown until the FX queue reaches each
  change (`DD.FX.call`); previews skip it. The painter reads the pin, else the statuses.

## Enchanté and the D9 statement
The passive *Enchanté* holds his one conditional heal, the **afterglow**: the strike that spends the last charge calls
`DD.Act.heal(u, u, AFTERGLOW, { via: 'lift:rasma' })` (`AFTERGLOW` 4 since h19:balance; was 3) after an `active()` check (0 HP healed at full HP: the call is still made,
so the sim's ledger counts the fire). It grows out of his core verb (enchant, then three strikes), heals only Rasma, needs
him standing (a downed Rasma holds no blade: never a revive), reads no HP threshold, is no button, and nothing happens at
combat start (he starts plain; no Block, no shield). Enchanting, refilling, replacing, dispels, Tea, the Look, Touché's
use, the signature and every item are HP-neutral (suite 4 checks each). The healers of others stay Ellaria, Josiah and
Valdris: `lift:rasma` to others is 0 in every sim below.

## AutoPlay hooks and known gaps
- `enchantScore` (the three enchantments): `strikeGain` per foe (the bonus after resist / Wet / Frozen, +1.5 Slow, a
  freeze worth 4 + half the foe's threat, Weak worth a quarter of its threat, the arc's 0.8 × arc on its target), the mean
  of the two best foes, × (this turn's strikes + the rest of the charges at full weight, LATER 1) × 0.85, + 0.6 × the
  afterglow's `healWorth`; foes only reachable next turn × 0.6 and 1.4 strikes. No churn (the same blade with ≥ 2 charges
  at the same level → 0); with the last charge and a strike in reach → 0 (strike first: that strike's dry run carries the
  afterglow, the recast follows); any recast pays for the charges it throws away and the afterglow it forfeits. In the
  exact pass (`ctx.autoplay`) it subtracts EXACT_OFFSET 2: the dry run credits any added or topped-up buff with a generic
  +1.5 (×0.75 for the hook), which made him refill full blades for nothing (see Deviations).
- `teaScore` (an ally's Burn; a freezable foe with a frost blade held or ready; a Shocking blade; the party's Wet payoffs:
  a Thunder Jar / Frost Flask in the pockets, an Electric Lute; −1.5 per Burn stack on a foe), `lookScore` (a spell wind-up
  the Silence outlasts: 8 + half its damage; else 0.7 × the best ready damaging spell; bosses and spell-less foes 0),
  `toucheScore`, `changeScore` (quick pass: the per-charge damage the quick pass misses; both: the charges it throws
  away), `thousandScore` (quick pass: the two strikes per foe it misses).
- Enemy AI: no content AI. Its AoO pricing walking past him reads `modifyOpportunity` + `estimateDealt`; Touché is
  invisible to it (like Thorns).
- Known gaps (sims understate a human Rasma): no "Tea now, freeze next turn" plan beyond `teaScore`'s next-turn term, no
  baiting into Touché, the signature is rare (3 in 102 zz fights), Sweeping Bow is almost never chosen (0 uses in 20
  zz fights socketed; 0.2/fight in the k=1 sanity sim): two Pardon Mes beat it unless 3 foes stand next to him. The quick
  pass (`AI.estimate` with `skill` null) adds the blade to his signature's first strike (approximation, §12.1).

## Sprite
Humanoid, `build: 'huge'`, `outfit: 'coat'`, scale 1.1, a stock `'sword'` and `'cat'` tail, claret / mustard palette, and
one overlay `rasOverlay` (facing space, no `g.text`, no `Math.random`): coat tails, the mustard waistcoat V with three
brass buttons and the white cravat with a gold pin, crescent ivory horns (the back one clipped outside the head), leaf
ears that twitch, three forelock curls, the pale muzzle with nostrils (open a crack in the attack pose), the monocle on the
front eye with a gold chain and a glint (always in the cast pose; dangling at the chest when hurt or down; a second small
ring with The Spare Monocle), the teacup in the back hand always level (on the floor beside him, upright, when he lies),
and the blade glow in drawItem's frame with the stock sword rotation: ice-blue motes, a yellow zigzag (a cosmetic hash
of `floor(t × 8)`), rose petals, or a steel glint when plain; 1-4 charge pips on the guard. Shots read:
`.tmp/h19/rasma/s1.png`, `s2.png` (scratch sheet), `gallery.png`, `auto_375.png` (a real AutoPlay fight, the ❄️ 3 chip).

## Barks and custom keys
13 standard keys (3-8 lines), `swap` ×3 with `{ally}` naming nobody, idle lines naming one hero each (Marwyn, Betty,
Syllamin, Hjalmar, Benedick, Corelos; party-filtered; plan D11: never another h19 hero or a construct, so the
addendum's two "once they ship" idle lines are left out). Custom keys fired by his code: `enchant_frost` / `enchant_shock` /
`enchant_charm` (40%), `freeze` (60%), `refresh` (35%, the afterglow healed), `opportunity` (40%), `touche` (50%), `tea`
(50%), `look` (50%), `change` (40%), `respect` / `bow` / `regards` (30%), `pop` (30%, a hit of 10+ on him). Every line
≤ 70 characters, no "sir" / "madam" (only his Svammiel comeback, in the voice owner's file, says "sir"), no swearing.
Tips: three (`DD.registerNarration('tips', …)`), word for word from addendum §13.6.

## Tests (`tests/content/hero_rasma.js`, 16 suites + the zz sim, ~8,980 assertions)
1 definition and the registry-wide gates (L4 HP 42, Radio Edit chip ≤ 90 with the longest 69, names unique against every
hero / enemy / skill / item / status / Blessing / passive, 13 bark keys × 3+, 3 swap lines, the forgetWarning) · 2 Pardon
Me and AoOs with each blade at every level (`AI.opportunityDmg` = the real hit; a Wet walker freezes and stops) · 3 the
loop (resist 0.5 / 1 / 1.5 / 0, the freeze and its guards, the arc's rules, charges, replace / refill, Silence, downs,
dispels, tome skills, the signature, Echo Chamber one charge per resolve) · 4 Enchanté (the D9 guard) · 5 the pool at
every level · 6 the signature · 7 items · 8 HUD previews (≈ 640 skill × level × blade × target previews against reality,
the last charge included) · 9 `DD.AI.estimate` and the AoO estimate on every blade × target state · 10 readability · 11
v2 edge cases · 12 AutoPlay scores and turn shapes · 13 battles at L1 / L3 / L5 (deterministic) · 14 the painter (every
pose × facing × blade × pips, ± The Spare Monocle, five yaws on the board, portraits, no `Math.random` inside the
overlay) · 15 combos with the cast (Ellaria's spring, Keg Stand, Tea + a Thunder Jar, an ally's Burn, Forge Weapon, Kick
'Em, Delegate, Galbraith's Counterspell) · 16 (review) every desc and tooltip word for word at every level, En Garde
counting hits, the arc's reach at exactly 2 · zz sim (`sim=1`).

### Readings (Nov 19)
- Full `bash tools/test.sh`: PASS, 1389 suites, 177,218 assertions, 0 failures, 0 swallowed "Error in" lines (his 15
  suites pass isolated and with everything loaded; the zz suite skips without `sim=1`).
- Sanity k=0 (`80000`, rasma/ellaria/kiri/josiah, 30 seeds, stop 2): 25/30 runs won, 285 fights, 0 errors, 0 DD.warn;
  **lift:rasma 0.83 fires, 2.2 HP a fight** (regular 0.65 / 2 HP, elite 1.16 / 3.2, boss 1.19 / 3.2), to others 0. The
  first reading, before the enchantScore fixes below, was 0.77 fires and 2.1 HP on the same seeds.
- Sanity k=1 (`80100`, rasma/marwyn/kiri/josiah): 20/30, 257 fights, 0 errors, 0 DD.warn; **lift:rasma 0.96 fires,
  2.4 HP a fight** (regular 0.78 / 2, elite 1.53 / 3.6, boss 1.22 / 3.1), to others 0.
- zz sim (`n=3`, 102 real act 1-3 fights, random parties): **blade on 353/432 = 82% of his foe strikes** (T10 ≥ 70%:
  met), afterglows 0.88 / 2.2 HP a fight, freezes 0.15 a fight (random parties: no Wet partner guaranteed), arcs 0.14, 18
  blades thrown away by a swap in 102 fights, 4.2 sword strikes a fight, damage 34.9 a fight (mid-pack melee), 5 downs.
- T8n (≥ 1.0 fire and 4-10 HP a fight) is **not met**: the fires are bounded by his sword strikes (≈ 4.2 a fight under
  AutoPlay ÷ 3 charges, minus the charges a fight ends on); the AutoPlay term is fixed first, as §3.4 says. The next
  lever is the balance pass's (request below).

## Deviations
- Desc lengths (addendum §23): the enchant descs run 22-28 words and the passive 36; the 6 sword skills append the live
  note in a fight; init −1 on a melee hero; enchantments have no turn limit; Do Keep the Change goes above the 7-10 band
  with a full blade, priced by its cooldown 3 and the enchant it cashes in; the hero side's first Silence (bosses
  refused).
- Strike scratch on the resolving ctx, not on `st.data` (addendum §5.2 / §5.3 kept `hit` / `first` / `ids` on the
  status): Echo Chamber's echo resolves inside the first resolution's `onSkillUsed` (random passives fire before
  statuses), so one flag on the status spent one charge for two resolves. Each resolution now records its own strike on
  its ctx (`currentSkill().extra`), and suite 3 pins "one charge per resolve". `st.data` keeps only `{ bonus, slow, arc,
  weak, level }`.
- `enchantScore` (addendum §12.2) changed after the first sanity reading (plan §1.4: "fix the AutoPlay term first"):
  (1) with the last charge and a strike in reach it returns 0 (he spent no last charge: he refilled at 1 forever and the
  afterglow never fired); (2) a refill no longer "only tops up": any recast pays for the charges it throws away; (3) the
  rest of the charges count at full weight (LATER 1: they never decay) instead of "+1.2 strikes", and a cast is credited
  0.6 × the afterglow's `healWorth`; (4) `− 0.5` instead of `− 1`; (5) EXACT_OFFSET: in the exact pass it subtracts 2 to
  cancel AutoPlay's generic +1.5 for an added or topped-up buff (without it he refilled a full blade with nothing to
  hit). The pinned behaviours of §12.2 / §18.12 all hold (suite 12).
- The AutoPlay battle assertion "an afterglow in ≥ 60% of fights of 4+ rounds" (§18.12) is judged on the fights where he
  struck at least as often as his enchantment holds charges (the fixture party often ends a 4-round fight before he has
  struck three times: in one elite fight he made no strike at all). Both counts are logged: 4/4 fights where he struck
  as often as his charges, 2/5 fights of 4+ rounds; the blade was on 23/26 of his foe strikes.
- Touché also refuses a riposte when he was asleep when the hit came (`modifyIncomingDamage` notes it): the engine wakes
  a sleeper before `onTakeDamage`, so the §9.5 hook alone riposted from sleep, against its own desc.
- A foe charmed to fight for the heroes takes no blade (hostile both ways, `foeOf`): the engine's `Grid.hostile` is
  one-directional and still reads it as hostile from his side (§18.11 asked for exactly this).
- En Garde's tooltip with 2 guards (Touché III) reads "the next 2 times a foe hits Rasma from an adjacent tile, it takes
  a 7-damage sword strike back …" (review:rasma). The addendum's template ("the next <n> foe(s) that hit Rasma … take")
  said two foes, but the guard counts hits: one foe hitting twice takes both ripostes, as Touché III's own desc ("the
  first 2 times a foe hits you") says. With 1 guard the text is unchanged.
- Not built (optional in the addendum): the tail tuft (the plain stock tail), the signature's 1-second forced hurt pose for
  the monocle pop (the pop is the `🧐 *pop*` text). The "cup level in every pose" is checked by the shots (the painter
  draws the cup without rotation), not by an assert.

## Requests
- **h19:balance (AFTERGLOW, plan §3.4 lever 1)**: T8n for `lift:rasma` is under (0.83-0.96 fires, 2.2-2.4 HP a fight)
  after the AutoPlay fix. The next step inside its range is `AFTERGLOW` 3 → 4 (the constant, the passive desc reads it;
  the tips, DESIGN's brief / Sustain paragraph and suite 4 quote 3). At ≈ 0.9 fires and ≈ 85-90% of the heal realized
  that reads ≈ 3.2 HP a fight, still under 4: the 4-10 HP band may be out of reach at 3 charges with ≈ 4.2 sword strikes
  a fight under AutoPlay. Never cut charges (D10). A question for the lead: accept ≈ 3 HP / ≈ 1 fire, or move T8n's HP
  floor for Rasma.
- **h19 integrator**: add `rasma` to `ALL` / `REAL` (he registers); `PENDING_HEROES` can drop him. His `forgetWarning`
  makes the sim keep his last enchantment (D4) — `DD_SIM.isProtected` is not loaded in `tests/test.html`, so suite 1
  checks it only when it is.
- **review:shared / qa:voice**: the idle lines name Marwyn, Betty, Syllamin, Hjalmar, Benedick and Corelos (one each,
  party-filtered); the addendum's two idle lines for the other two h19 heroes are left out (D11) and could be added by
  whoever owns cross-new-hero banter later.

## Review (h19)
`review:rasma`, Nov 19 (plan §1.5). I assumed the build was wrong until a run said otherwise. Scratch:
`.tmp/h19/review-rasma/` (`probe.js` and `rt.sh` / `t.html`, a test page that also loads `tests/sim/sim.js`;
`scene.html` and `shot.sh`, the real combat screen with `debug=1` in an iframe, his blade and pose set for a shot;
`sims/`, `out/`).

**Checked by running it**
- **Attacks of opportunity**: 240 cases of plain / frost / shock / charm at L1 and L3 × plain, Wet, resist 0.5 / 1.5 /
  0, armor 2, Vulnerable, Marked 2, Block 10, Wet + resist 0.5, × Rasma plain, Weak or Inspired. `DD.AI.opportunityDmg`
  equals the real hit in every case. A charge moves only on a hit that dealt more than 0 (an immune foe: 0 damage, 0
  charges).
- **Touché ripostes**: 64 cases of blade × L1 / L3 × plain, Wet, immune, resist 0.5 × 3 or 1 charges left. The damage is
  riposte + bonus through the element. The charge is spent inside the foe's resolution. The afterglow fires on the last
  charge (heals him 3). Shocking arcs 2. An immune foe takes 0 and nothing is spent.
- **AutoPlay**:
  - `AI.estimate` with the skill def equals the real hit for Regards and Respect on every target state.
  - An AoO with Shocking arcs after the resolution: no multi-hit Hype.
  - At 100 Hype he uses A Thousand Pardons with two foes adjacent, with one foe at 2, and with a lone foe at 2. His ~0
    signatures a fight in the sims come from init −1 and a shared Hype pool, not from his code.
  - In 68 AutoPlay act 1-3 fights with Ellaria or Marwyn in the party (`probe: wetfreeze`, n=2): 0.34 freezes a fight
    (T10 ≥ 0.2 met), blade on 282/330 strikes (85%), 1.09 afterglows and 2.7 HP a fight. Of 130 enchants, 0 were cast at
    1 charge with a foe adjacent.
- **D1 / D4**: Pardon Me, With All Due Respect, Sending My Regards and Do Keep the Change each break a crate for their
  listed 5 / 8 / 6 / 6 with a Shocking blade held. No charge moves and nothing arcs.
- **D4 sim rule** (`DD_SIM` loaded in the probe page): his only enchantment is protected, so `replaceIdx` takes the next
  skill. With two enchantments neither is protected. With his enchantment the only socket, the result is −1.
- **Voice**: no "sir" / "madam" in his barks; nothing of act 4. D11 holds in his texts. The code comment that named the
  other two h19 heroes now says "another h19 hero or a construct", and the notes say the same.
  - "X, at your service" (Benedick, Buga, Marbles) and "Mind the …" (Buga, Corelos, Ellaria, Josiah) are roster-wide
    formulas, not Benedick's courtesy, so his select line stays. "Coming through." is in six heroes' move barks; his
    goes on "Do forgive the hooves", and Basanos's "Sorry. Sorry." panic is not his.
- **Edits outside his cluster**: none (`git status`; every tracked change predates his build). None of the 17 shipped
  heroes' files changed.
- **Shots**: `.tmp/h19/review-rasma/shots_*.png` and the `crop_*.png` 2-3× crops; I read every PNG. Each is the real
  combat screen with party rasma, ellaria, marwyn, betty.
  - rot 0: frost blade with 3 pips and the ❄️3 glyph.
  - rot 90: shock blade with its zigzag, 1 pip and the ⚡1 glyph (showStacks).
  - rot 200: rose blade with 4 pips and 🌹4.
  - Hurt at rot 0 (frost 2, with The Spare Monocle: the Cold Shoulder pill reads 0) and at rot 90 (charm 1): the monocle
    dangles on its chain at the chest.
  - Downed at rot 200: X eyes, the monocle dangling, the cup upright on the floor and still steaming.
  - The monocle sits on the front eye at every yaw, and the cup is level in every pose.
- **Mutation** (a scratch copy, never the real file):
  - `ARC_RANGE` 2 → 3 passed all 16 suites. The descs read the constant, and no fight put a foe exactly 3 from the first
    foe hit. With the new suite 16 it fails 9 asserts.
  - A second mutant (the AoO bonus added twice) fails 56 asserts in suites 2 and 9.

**Fixed (with regression tests)**
1. **Do Keep the Change** logged `Rasma spends every last charge. "Do keep the change."` and barked `change` whenever he
   held a blade, even when the strike dealt 0 (a lightning-immune foe under a Shocking blade). In that case no charge was
   used: the log lied. It now logs and barks only when the strike damaged the foe (`ctx.rasHit`). Suite 5 pins it: vs an
   immune foe, 0 damage, 3 charges kept, no line, no afterglow, HP unchanged; vs a plain foe, the exact line.
2. **En Garde's tooltip at ×2** said "the next 2 foes that hit Rasma … take". The guard counts hits: one foe hitting
   twice takes both ripostes, as Touché III's desc says. It now reads "the next 2 times a foe hits Rasma from an adjacent
   tile, it takes …" (Deviations). Suite 16 pins both tooltips and one foe taking 7 + 7.
3. **Test gap**: the enchantments', Sweeping Bow's, Keep the Change's and Touché's descs at every level, the passive, the
   three items and the three blade tooltips (L1 / L3) were never pinned word for word, and the arc's reach had no
   boundary test. The new suite 16 pins all of them against addendum §6-§11, and the arc at exactly 2 (a line, a
   diagonal) against 3 (a line, 2 + 1).

**Numbers** (forced parties, `stop=2`, 30 seeds each, my block 83000 + 100·k; 0 errors, 0 DD.warn, 0 timeouts in every
page; `lift:rasma` to others 0 everywhere)

| k | party | runs won | fights | `lift:rasma` fires / HP a fight | his dmg / taken a fight |
|---|---|---|---|---|---|
| 0 | rasma, ellaria, marwyn, betty | 26/30 (87%) | 273 | 1.01 / 2.8 | 42 / 22.5 |
| 1 | rasma, pebbles, valdris, josiah | 14/30 (47%) | 230 | 0.88 / 2.4 | 39.7 / 25.2 |
| 2 | rasma, corelos, slate, hjalmar | 3/30 (10%) | 201 | 0.68 / 2.0 | 28.3 / 20.7 |

- zz (`sim=1&n=3`, 102 fights, random parties): blade on 354/433 strikes (82%), 0.89 afterglows and 2.2 HP a fight, 0.15
  freezes a fight, 0.14 arcs.
- **T8n** (≥ 1.0 fire and 4-10 HP a fight) is still not met: about 0.7-1.1 fires and 2.0-2.8 HP a fight. The AutoPlay
  term is sound: no refills at 1 charge, blade on 82-85% of strikes. The remaining lever is the balance pass's
  `AFTERGLOW` (Requests).
- **Paired reference for k=2**: betty, corelos, slate, hjalmar on the same seeds (83200-83229) won 7/30 (23%, CI 12-41%),
  against 3/30 (10%, CI 3-26%) for Rasma. The intervals overlap at n = 30 (noise), but the point is lower: the balance
  pass's forced reading (§3.2, n = 100 a seat) should look at this triple. His knobs are the addendum's weak list, and
  his charges are never cut.

## Public API (`DD.Rasma`)
`{ HERO, CHARGES 3, WIT_CHARGES 4, BASE 5, AFTERGLOW 4, ARC_RANGE 2, BLADES, EL, BLADE_OF, COLOR_OF, GUARD, LAST_WARNING,
RASMA_SPRITE, isSword(def), charges(unit|runHero|null), bladeInfo(u) → { id, stacks, data } | null, bladeShown(u) →
{ id, n } | null, enchantNow(u, 'frost' | 'shock' | 'charm', level) (the real enchant), spend(u, st, n, hit),
arcTarget(u, first, ids), strikeGain(u, statusId, L, foe), enchantScore / teaScore / lookScore / toucheScore /
changeScore / thousandScore (ctx), bladeNote(user), lastEnchantWarning(L, runHero), threatOf(u, foe),
strikeableNow(u, foe, apAfter), syncBlade(u), painters: { rasOverlay, bladeRot, paintedBlade } }`.

## Balance pass (h19:balance, Nov 20)
Numbers only (plan §3.4-§3.5, D10: an unreleased hero's own knobs, both ways, in the addendum's order); the kit, the loop,
the texts' wording and the AutoPlay terms are unchanged. Details and every reading: `docs/notes/balance.md` "h19 pass".
| knob | before | after | why |
|---|---|---|---|
| `AFTERGLOW` (Enchanté) | 3 | **4** (the top of [2*, 4]) | T8n lever 1 (0.92 fires, 2.43 HP a fight; band 4-10) and the second weak knob |
| With All Due Respect I-III | 8 / 10 / 12 | **9 / 11 / 13** | the third weak knob (T5n: forced reading 0.51) |
| HP | 30 (+4/level) | **32** (+4/level) | the fourth weak knob (T5n: forced reading 0.64 after the first two) |
The first weak knob (the enchant bonus +2 → +3 at I) was skipped: it makes The Cold Shoulder II and Most Disarming II the
same as their level I (+3, the same rider), a level-up that changes nothing. Charges are never cut. The fifth weak knob
(Sorry to Interrupt in place of A Disapproving Look) is a new skill, not a number, and was not needed.
The passive's desc and the tip read `AFTERGLOW` and DESIGN quotes 4; suite 4 pins 4, suite 5 Respect 9 / 11 / 13, suite 1
the 32 HP. Forced reading (with Josiah, Kiri, Marwyn / Corelos, Slate, Hjalmar; 200 runs a reading): 0.51 → 0.64 → **0.72
(0.48-1.08, within noise)**; random-pool share 0.71× (17.8%, 21/118; within noise). `lift:rasma` reads 0.90 fires and
3.22 HP a fight (iteration 4, 600 normal runs): still under T8n's 1.0 / 4 HP floors with `AFTERGLOW` at the top of its
range (the question this note's Requests already put to the lead).

### Balance fix pass (fix:balance, Nov 21; the lead's R1-R4)
The lead's levers (tuning, not character facts), in the lead's order, one a reading; every desc, tip, test and doc
follows the code. Readings, seeds and every target: `docs/notes/balance.md` "h19 fix pass (Nov 21)".
| # | lever | before | after | iteration |
|---|---|---|---|---|
| R1 | AutoPlay, no power: `enchantScore` → `onTheWay` | no foe in reach this turn: 0 (he walked in with plain steel; a fifth of his strikes were plain with an enchantment socketed, the blade was up at 56% of his turn starts) | no blade up, a foe in reach of his NEXT turn (2 × move + reach) and a move left after it: he enchants on the way in (never a swap; 0 when Rooted) | 1 |
| R2 | the enchant bonus (all three enchantments) | +2 / +3 / +3 | **+3 / +4 / +4** (the lead accepts the level steps that follow) | 2 |
| R4 | `AFTERGLOW` (Enchanté) | 4 | **5** (the heal step the lead allowed after R1: under the band, the most downs of all twenty) | 3 |
| R3 | HP 32 → 34 | — | **not taken**: he passed T5n after R2 (the stop rule) | — |
The reserve skill Sorry to Interrupt was never used (the lead: never). Charges are never cut.
Texts: the enchantments' descs and blade tooltips print the bonus (`L.bonus`), the passive and the tip print
`AFTERGLOW` ("…heals him 5 HP."); DESIGN quotes +3-4 and 5, Do Keep the Change "up to 15 … the enchantment's own +3".
Suites: "hero_rasma: fix:balance — …" pins R1's term (in reach next turn, a blade up, no move left, Rooted, too far),
the bonus on all three and a level-I charm strike for 5 + 3, `AFTERGLOW` 5; every bonus pin elsewhere reads `BONUS`
(+3 / +4 / +4); suite 4 and the word-for-word suite pin 5.
Forced reading (R, 200 runs a reading, references paired): 0.66 (the audit) → 0.80 (R1) → 0.73 (R2) → **0.83 (0.56-1.23,
in band; R4)**; random-pool share 0.54× (R1) → 0.98× (R2) → **0.78×** (18.9%, 25/132; the median 24.3% inside: within
noise). `lift:rasma`: 0.95 → 0.92 → 0.85 → **0.97 ± 0.13 fires · 4.07 ± 0.55 HP** a fight (it3; the HP band 4-10 met, the
fire floor 1.0 within noise). The final audit's reading is in `balance.md`.

## QA fixes (h19 qa-fix:content, Nov 20)
Findings from the QA lenses (`qa:rasma`, `qa:voice`), each reproduced on the files and pinned by a regression (suite 1's
voice check and the new suite "hero_rasma: QA fixes — …"); no number moved.
- **qa-rasma-2 / voice-3 (Benedick's courtesy)**: freeze "Do stay a while. You haven't much choice." was Benedick's stuck
  bark word for word; select "Rasma, at your service. Do mind the horns." fused Benedick's two select openers;
  opportunity "Do mind the sword on your way out." was his "Mind the slime on your way". Now **"Do pardon the
  frostbite. You shall thaw presently, I assure you."**, **"Rasma, delighted to oblige. Horns, monocle and all."** and
  **"Departing mid-conversation? Allow me to see you out."** Suite 1 bars Benedick's tics (No rush, Mind the slime,
  After you, I insist, Splendid, I'd only just, at your service, stay a while, "mind the X on your way") and any four
  words in a row shared with a line of Benedick's (when he is loaded). The Review (h19) call that "X, at your service"
  is a roster formula is superseded for Rasma: next to the copied freeze line it read as Benedick.
- **qa-rasma-3 (log order)**: the arc logs "Lightning arcs from A to B." before its damage line, and the riposte logs
  "Touché! Rasma ripostes against X." before its damage (and before the arc it carries).
- **qa-rasma-4 (the arc's look)**: `DD.FX.beam(…, { color: '#fff27a', width: 3, kind: 'lightning' })`, the zigzag the
  Thunder Jar and Corelos use (it was a straight 2-px line).
- **qa-rasma-5 (texts)**: (a) Positively Shocking and the Shocking Blade chip say "lightning damage (+50% against Wet
  foes), +2, and arc …": the engine multiplies first and adds the flat after (5 × 1.5 + 2 = 10, pinned); (b) the En Garde
  chip says "a 5-damage sword strike back, plus his enchantment if he holds one (…)" and, on the live chip (the HUD passes
  the very instance on him; `holderOf(st)` finds the holder, pure), appends his blade note (" Now: ⚡ +2 lightning, arcs
  2; 3 charges left.").
- **qa-rasma-7 (pips)**: the charge pips moved from the guard (often under the fist or a clinched foe) to the blade's
  flat, r 1.05 with a 1.4 dark rim and a glint (was r 0.7, about 1 px at the default zoom). Cosmetic; suite 14 runs every
  pose × pips.
- **voice-7 (tip)**: "…then hit it with a sword under The Cold Shoulder." (The Cold Shoulder is a self-enchantment, not a
  strike.)
