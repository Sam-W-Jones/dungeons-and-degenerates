# HERO — Kiri, the Half-There (notes)

Files: `js/data/heroes/kiri.js`, `tests/content/hero_kiri.js` (20 suites `hero_kiri: …`, ~930 assertions), this file.
Run: `bash tools/test.sh "suite=hero_kiri&isolate=heroes/kiri,hero_kiri"` and `bash tools/test.sh "suite=content:&isolate=heroes/kiri,hero_kiri"`.
Looks: `bash tools/shot.sh "debug=1&fixtures=1&isolate=heroes/kiri,hero_kiri&screen=gallery&gallery=kiri" .tmp/kiri/g.png 1280x720 4000`.
Scratch (not shipped) in `.tmp/kiri/`: `scene.html` / `scene.js` (a sandbox fight in the real renderer + HUD, zoomable:
`bash .tmp/kiri/shot.sh scene.html out.png 1280x720 3000 "debug=1&fixtures=1&scene=aim|phase|mist|beyond|rain|step|walk|step2&zoom=2"`),
`shot.sh` (screenshots a page there; takes a machine-wide Chrome slot like `tools/*.sh`), `simprobe.html` + `simprobe.sh` +
`probe_phase.js` (`tests/sim/sim.js` plus a probe: at each Kiri turn, how many foes her best Phase Shot line holds from
where she stands / one move away, and whether she fired it), `sim/` (sim reports quoted below).

## Summary

Built from scratch, v2-native (initiative, one turn per unit, no telegraphs, no Guard, no combat-start Block, attacks of
opportunity). User brief: *"Kiri (female) half-elven ranger. Can send her arrows into the ethereal plane and move
ethereally"* — she/her. DESIGN §6 "Kiri" + "Simplicity": one verb per skill, power from combinations. Dry, competent,
slightly spooky; tired of being asked whether she's "the elf or the human one". Role: precise ranged damage + ethereal
mobility. Complexity 2, `unlock: null`, 24 HP (+4/level), 3 AP, move 4, **initiative +3**, colour `#8a9bff`, no flags.

**Passive — Between Worlds** (one rule): *Kiri's own skills ignore line of sight* — walls, pillars, trees, smoke and her
own mist don't stop her; enemies still need sight of her (so she can shoot from full cover). The rule is data (every
Kiri skill has `target.los === false`; a borrowed generic skill keeps its own rule, hence "own"). The passive's hooks
deliver Arrow from Beyond (below) and one cosmetic bark (`provoked`, when an attack of opportunity hits her).

**Kit** (ids `kir_*`; ⭐ starting; numbers I / II / III):

| Skill | id | Cost | Effect (one verb + at most one rider) | Pairs with |
|---|---|---|---|---|
| Ghost Arrow (basic) | `kir_basic` | 1 AP | 5 damage to a foe within 5, through walls and cover | — |
| Phase Shot ⭐ | `kir_phase` | 1 AP, cd 1 | 4 / 5 / 6 to every foe in a straight line of 5 tiles, through walls and units (allies unharmed) | foes lined up by pulls, throws, pushes, corridors |
| Ethereal Step ⭐ | `kir_step` | 1 AP, cd 1 | teleport up to 3 / 4 / 5 tiles in a straight line through walls and units (works while Rooted; never provokes) | escaping melee, flanking |
| Spirit Mark | `kir_mark` | 1 AP, cd 1 | Mark a foe within 6: next damage +5 / +7 / +9 | any heavy hitter (Marwyn, Slate…), Arrow from Beyond |
| Pinning Shot | `kir_pin` | 2 AP, cd 2 | 7 / 9 / 10 damage + Root for its next 1 / 1 / 2 turns | Betty's Kick 'Em While They're Down (10 instead of 5 on a Rooted foe), keep a foe in fire / poison / an AoE, keep melee off the squishies |
| Banishing Shot | `kir_banish` | 1 AP, cd 2 | 3 / 4 / 5 damage + push 2 / 2 / 3 away from Kiri | pits (YEET), lava, water (Wet → lightning), Hjalmar's Bear Trap (snap + Root), Corelos' Glyph of Warding (burst), a Phase Shot line, unpinning |
| Haunted Volley | `kir_volley` | 2 AP, cd 2 | 4 / 5 / 6 to every foe within 1 of a tile within 5 | clusters made by others |
| Arrow from Beyond | `kir_beyond` | 3 AP, cd 2 | a foe within 7 takes 18 / 22 / 26 at the start of Kiri's next turn, wherever it is (status "Foreshadowed") | Marked / Vulnerable / Empowered applied in between |
| Fade Out | `kir_fade` | 1 AP, cd 3 / 2 / 2 | Kiri is Stealthed until the end of her next turn; III: and sheds her debuffs | — (self defence, walking off melee) |
| Mist Opportunity | `kir_mist` | 1 AP, cd 3 | ghost mist that blocks line of sight around a tile within 5 (radius 1 / 1 / 2, for 2 / 3 / 3 rounds, not over other surfaces); her own skills ignore it (passive) | hide allies from archers / casters while she keeps shooting |
| Rain from the Other Side (signature) | `kir_signature` | 2 AP, 100 Hype | 16 to every foe within 2 of a tile within 6, ignoring Block and armor | — |

Pool = 9 (+ basic + signature): AP 1 / 2 / 3 mixed, one long cooldown (Fade Out I, Mist), the "big" one is Arrow from
Beyond (3 AP: she spends her turn aiming into the other side; it lands at the start of her next one — a heroes'
mirror of the boss wind-ups). Nothing is a `spell` (Silence doesn't stop her). Every desc is ≤ 20 words, one sentence
(a colon at most), no conditions, and names its real range / area at every level (tested; review v2 tightened 24 → 20).

**Phase Shot retune (this pass)**: it was 2 AP, 5 / 6 / 8. At 2 AP it only beat two Ghost Arrows (10) when three foes
lined up after a move, so sims almost never used it (0.1 uses per fight, vs 0.9 for Zarathor's same-budget Fireball).
Now 1 AP, 4 / 5 / 6: worse than Ghost Arrow on one foe, the pick once two line up. Probe (`probe_phase.js`, 60 act-1
runs, 1,252 Kiri turns): two or more foes in a line from where she stands on 3% of her turns, from a tile one move
away on 20%; AutoPlay fired it 103 times, 100 of them at 2+ foes, and took 78% of the stand-still chances — the low
count is geometry, as intended for a combo skill. Uses per fight 0.1 → 0.3 (act 1) / 0.6 (full campaigns).
A/B (150 act-1 runs, seeds 2000+, party Kiri + Marwyn + Ellaria + Zarathor): Kiri 43.2 damage per fight in both,
downs 0.15 → 0.14, clears 108 → 102 of 150 (noise: z ≈ 1.2 over both samples; losses are the Rat King either way).
So it changes how the starter plays, not how much power she has.

**Arrow from Beyond mechanics**: the skill puts `kir_incoming` "Foreshadowed" (debuff ☄️, `stacking: 'stack'`,
stacks = damage, `decay: 'never'`) on the target with Kiri as source. (Review v2 renamed the status from "Arrow from
Beyond": statuses read as states, and the log said "Goblin Grunt is Arrow from Beyond (22)."; now "Goblin Grunt is
Foreshadowed (22).") Her passive's `onTurnStart` lands every arrow she
owns (`DD.Act.damage(kiri, target, stacks, { skill, noHighGround })`: her outgoing modifiers apply at landing — an
Empowered given to her in between is used up on it (+50%) —, the target's Vulnerable / Marked / armor / Block too; kills
are hers). It lands even if she is stunned (the turn still starts);
`onDowned` makes her arrows fizzle (a downed hero's turn is skipped, so they would hang forever). Its number is
`L.arrow`, not `L.dmg` (AI / AutoPlay estimates and reach read `L.dmg` as damage dealt now; nothing lands now), and
`aiScore` = the landing damage × 0.9 (capped by the target's HP) values it. The HUD preview shows "Foreshadowed 22"
on the target (status stacks), 0 damage now.

**Attacks of opportunity** (DESIGN §4.2, rules.md "v2 — attacks of opportunity"): her basic is ranged, so she never
makes one (`opportunitySlot` null) and foes walking off her are free to go; she walks off a melee foe like anybody (it
strikes, no undo). Her ways out, each one verb: **Ethereal Step** (a teleport: out of a pincer, straight through the
foe, or while Rooted), **Fade Out** (a Stealthed mover never provokes, so she walks off), **Banishing Shot** (push it
off, then walk; a push never provokes, so it also gives an adjacent knight no free slash). Pinning Shot is *not* an
escape (a Rooted foe still strikes). AutoPlay knows: wounded between a rooted brute and a rooted grunt (every walk
lethal) it Ethereal Steps out (tested). Ethereal Step's flavor says it ("No, you don't get a free swing."). In the 12
fixture fights she suffers 1 attack of opportunity.

**Status / surface**: `kir_incoming` (above); `kir_ghost_mist` "Ghost Mist" (`blocksLos: true`, 2 rounds default,
lavender `drawVolume` puffs, no reactions).

**Items** (all `hero: 'kiri'`): `kir_ghostwood_bow` Ghostwood Longbow (rare weapon: +10% damage, +1 range to skills
with range ≥ 2 — Ethereal Step's distance and Phase Shot's line included), `kir_name_tag` "Hello, I'm the Elf One" Name
Tag (rare trinket: +2 initiative, +4 max HP), `kir_cloak_elsewhere` Cloak of Being Somewhere Else (legendary armor: +6
max HP, +1 armor, Ethereal Step costs 0 AP via `modifyCost` — a free disengage every other turn). No `stats.block`.

**Sprite**: humanoid, slim, green-grey tunic + cloak (`cape`), hood, dark hair (overlay: side-swept bangs clipped to the
hood's face opening + two long locks), violet eyes, deadpan mouth line, no blush (dry), longbow, a thin belt + quiver
strap drawn in the overlay (the painter's belt / bandolier vanish on a slim torso), soft violet `glow` aura. `overlay`:
half-elf ear tips poking out through the hood (the painter hides `pointy` ears under a hood) and a quiver slung over
the cloak with violet / blue ghost-lit fletchings behind her back shoulder. `underlay`: a lavender ectoplasm puddle with
rising motes at her heels ("never entirely in one plane"). Checked this pass in the gallery (all poses, both facings,
statuses, portraits 128 / 64 / 40) and in combat at zoom 1 / 1.6 / 2 next to Marwyn and Ellaria.

**Barks**: 13 keys × 4-6 lines + the extra key `provoked` (5 lines, fired by the passive's `onOpportunityAttack` when
one hits her: "That is what I get for using legs."), ≤ 70 characters, her voice (the elf-or-human question, walls
being a suggestion, "different plane, slow mail"), no he/him anywhere about her (tested).

## Tests (`tests/content/hero_kiri.js`, 20 suites, ~930 assertions)

registry / identity / numbers / descs at every level (numbers shown, ≤ 20 words, one sentence, no conditions, levels
differ, the range / area each desc names is the real one) / barks
(incl. `provoked`) / pronouns / no attack-of-opportunity flags · sprite + portrait (every pose and facing, no warnings) ·
Between Worlds (through walls; a borrowed LOS skill can't; the archer still can't see her) · Ghost Arrow · Phase Shot
I-III (line through a wall and past an ally, length, straight-only, multi-hit Hype, 1 AP, cooldown 1 per own turn, map
edge, 4 < 5 on one foe / 8 > 5 on two) · Ethereal Step I-III (through wall + unit, length, not into walls / units / a
pit in range (but past it) / off-line, works while Rooted, Wet on water, corner) · Spirit Mark I-III (the knight's next
hit +mark, used up) · Pinning Shot I-III (Rooted on exactly 1 / 1 / 2 of its turns with the AI on, lethal pin) ·
Banishing Shot I-III (range 4 / not 5, pit YEET + env Hype, lava, water → Wet, wall bump, map edge, immovable, a lethal
shot bumps nobody behind, diagonal) · Haunted Volley I-III · Arrow from Beyond
I-III (nothing before her next turn — checked at every turn start —, lands 11 tiles away behind a wall, full turn after,
Marked + Vulnerable, kill credit + Hype, dead target, Kiri downed → fizzles, Kiri stunned → still lands, two Kiris,
aiScore) · Fade Out I-III (hidden during exactly one enemy turn with a grunt next to her, III sheds debuffs, attacking
reveals) · Mist Opportunity I-III (tiles / rounds / not over fire or walls, blocks an archer's shot at the cleric, not
Kiri's) · combos (Banishing Shot into water → the mage's lightning ×1.5; Pinning Shot holds a foe in fire) · signature
(Block + armor ignored, ally spared, 100 Hype, range) · items (range, line length, +10%, init +5 in a rolled fight,
0-AP step) · previews == reality for every skill at every level (walls, pits, lava, water, lethal; the Foreshadowed
preview and log line) · v2 edge cases
(stunned by an enemy turn, silenced, sheep, charmed: −1 AP and no damage to the charmer even from beyond, not enough AP,
not her turn, Dazzled line, a dying foe mid-line, a volley that ends the fight) · **attacks of opportunity** (walking
off provokes exactly one stab, the move preview says 4, no undo, the reaction is spent; walking up never provokes; the
`provoked` bark only on an attack of opportunity; Ethereal Step out of a pincer / through the grunt / while Rooted:
nothing; Fade Out: the preview and the walk provoke nobody; Banishing Shot: push off, walk free, and no free slash for
the knight; a Rooted grunt still strikes; foes walk off Kiri untouched while the knight beside her slashes; AutoPlay
steps out of a lethal pin; mutation-checked: dropping the bark hook fails it) · AutoPlay: 12 fixture fights (acts 1-3,
normal / elite / boss) with party Kiri + test knight / cleric / mage at levels 1 / 3 / 5 (two loadouts each), plus a
signature turn, a Phase Shot line and a pit banish.

Sims (`tools/sim.sh`, not tests): act 1 with Kiri + Marwyn + Ellaria + Zarathor vs the same party with Syllamin in her
place, 60 runs each (seeds 700+, before the Phase Shot retune, which the A/B above shows is neutral): 51 / 51 clears;
Kiri 43 damage per fight (Zarathor 47, Syllamin 38), downs 0.14 (Syllamin 0.10). 30 full campaigns with Kiri + Slate +
Josiah + Marbles after the retune (seeds 900+): 0 errors, 0 warnings, 222 fights, Kiri 69 damage per fight (47% of the
party's). Over all acts with all 16 heroes she out-damages everyone (37-39% share) at an ordinary party win rate: see
Review (v2) → Balance and Known issues.

## Public API (for tests / other content)

`DD.Kiri = { GHOST, GHOSTING, markEngaged(unit) → bool, canGhost(unit) → bool, phaseLine(ctx), pendingArrows(unit) →
[{ unit, st }], landArrows(unit) → n, fizzleArrows(unit) → n }` (Nov 18: `GHOSTING` [3, 4, 5] = Ethereal Step I-III's
`ghost`; `markEngaged` is her turn-start check, `canGhost` = engaged this turn and not yet ghosted).

## Deviations

- Fade Out is self-only (DESIGN brief: "Ethereal until her next turn"). An ally version was tried and dropped: under
  v2 durations a Stealth given to an ally whose turn comes after Kiri's but before the enemies' would expire at the end of
  that ally's turn and protect nobody (stealth is a `turnEnd` status), so it was order-dependent. It is core Stealth, so
  she *can* attack while faded — it reveals her (the brief's "can't attack" becomes "attacking ends it").
- Ethereal Step is a teleport, so Root doesn't stop it (Root forbids move actions), it doesn't trigger Bleed and it
  never provokes attacks of opportunity (engine rule: teleports never do).
- Mist Opportunity skips tiles that already have a surface (said in its desc) instead of replacing them, so it never
  silently puts out fire or removes oil / webs.
- Phase Shot costs 1 AP (DESIGN §5 lists "AoE 4–6 per target for 2 AP"): a line from her own tile catches two foes far
  less often than a circle does (see the retune above), and at 1 AP it still loses to Ghost Arrow on a single foe.

## Requests

None blocking. Suggestions for other areas:
- **HUD / ENGINE** (`DD.AI.reachOf` / `threatMap`): reach ignores line of sight past the walk (a known over-estimate), so
  the threat shading still marks tiles that Kiri's Ghost Mist (or a Smoke Bomb) actually shields from archers and casters;
  the player can't see the mist's protection there. AutoPlay's own danger model is LOS-aware, so sims value it.
  (Re-checked in review v2: `reachOf` still says "walls and sight ignored past the walk".)
- **ENGINE** (`actions.js` `setSurface`, review v2): only `smoke` / `steam` count as clouds that may hang over pits,
  lava and deep water (`cloud = id === 'steam' || id === 'smoke'`), so Ghost Mist leaves a hole on those tiles (an archer
  sees through a misted pit). A surface-def flag (e.g. `cloud: true`, read there) would let content mists behave like
  smoke; `kir_ghost_mist` would set it.
- **INTEGRATION** (`tests/content/integration.js`, not mine): "cross-content consistency" still expects ten real heroes
  and the pre-v2 unlock conditions (8 failures in the review v2 full run; 16 heroes are registered, all `unlock: null`
  per DESIGN v2).
- Resolved: the **HUD** move preview now says "⚔ Provokes 2 attacks of opportunity: Goblin Grunt 6 · Goblin Grunt 6
  (up to 12). Can't be undone." and Kiri's card shows "Engaged: 2 foes, up to 12" (review v2 screenshot,
  `.tmp/kirirev/sc_walk.png`). The **NARRATIVE** hero event exists: `ev_kir_lost_and_found` "The Ethereal Lost and
  Found" (she/her throughout). The earlier AUTOPLAY request (a `delayed` flag so the quick score wouldn't read Arrow from
  Beyond's number as immediate damage) is moot — its number is `L.arrow`; the generic `content:` advisory is gone too.

## Known issues

- In AutoPlay Kiri mostly fires Ghost Arrow (7 uses per fight in act 1, ~10 over all acts): 5 damage per AP is the
  basic rate every pool skill is measured against; pool skills are used for their riders / areas when they pay (all nine
  get used across the suite's loadouts and in sims; Mist Opportunity least, ~0.05 per fight). No hero signature fires in
  act-1 sims (party Hype rarely reaches 100 there; global).
- **She is the top damage dealer** (review v2, real content with all 16 heroes, below): 37-39% of her party's damage,
  66-77 per fight, against 31-32% / ~56 for Zarathor, Syllamin and Corelos under the same harness; her parties' win rates
  are in line (normal 78-81% vs 76-86%; brutal 49% vs Sparrow's 46%), so it is her role (pure damage), not a power
  outlier, and nothing was changed. Ghost Arrow is the best basic in the game (5 damage, range 5, no line of sight;
  the other ranged basics are 4-5 damage, range ≤ 4, with line of sight); ~75% of her damage is basics. If parity is
  wanted: Ghost Arrow range 4 → 37% share, 4 damage → 35%, both → 32% (tested, `.tmp/kirirev/real.js?mod=r4,d4`); with
  4 damage Phase Shot (4) would no longer be worse than Ghost Arrow on one foe, so it would want 3 / 4 / 5.
- Fade Out and Arrow from Beyond in one turn (needs 4 AP): the arrow landing at her next turn start breaks the Stealth
  (core rule: Stealth breaks when she deals damage), so she is seen a turn early. Rule-consistent, documented.
- Arrow from Beyond's `aiScore` ignores invulnerability (the DM's screen, the Lich's Pile of Bones): it lands a turn
  later, when that may be over, so neither guess is right; AutoPlay casts it rarely (5-17 times in 72 fights).
- Act-1 sims lose mostly to the Rat King whatever the party (bosses-act1 retune, not Kiri).

## Review (v2) — adversarial review of the v2 kit (ADVERSARIAL REVIEWER role)

Scope: `js/data/heroes/kiri.js`, `tests/content/hero_kiri.js`, this file. Verified by running code: her 20 suites
(isolated, with all content loaded, seeds 7 / 99 / 2024), the generic `content:` suites, 21 runtime mutants
(`.tmp/kirirev/mut.html?m=…`), review probes with real heroes and enemies (`.tmp/kirirev/probe.html`), a real-content
balance page with all 16 heroes (`.tmp/kirirev/real.html`), gallery and combat shots (`.tmp/kirirev/*.png`).
Full `bash tools/test.sh` after the fixes: 794 suites, 3 failing sections, none from her files — `bosses_act1` "rat king
swelling ranks…" (its owner's work in progress; 9 sections failed in the run before the review) and `integration` ×2
(v1 unlocks / "ten real heroes", the "Objective Failed … or XP" step). All 20 `hero_kiri` suites and every `content:`
suite pass; no swallowed errors.

### Verified (held)
- **desc == effect** at every level for all 11 skills, the status, the surface and the 3 items: the suites check every
  number against the level table and what `execute` really does (damage, statuses and their own-turn durations,
  displacement, surfaces, costs, cooldowns); the new generic check also reads the range / area out of every desc and
  compares it with `Targeting.range` / the area size. Previews == reality for every skill at every level.
- **v2**: `init: 3` (rolled fights: d20 + 3, + 2 with the Name Tag), `unlock: null`, no Guard, no starting Block, no
  intents / telegraphs / XP / planning in code or text; Root covers the foe's next 1 / 1 / 2 turns, Stealth lasts through
  her next turn (exactly one turn of each enemy), the arrow lands at her next turn start (not before: checked at every
  turn start; mutants landing at her turn end or at anybody's turn start fail).
- **Attacks of opportunity**: her bow never strikes (`opportunitySlot` null); her walk off a melee foe provokes (HUD:
  "⚔ Provokes 2 attacks of opportunity … Can't be undone."); Ethereal Step (teleport), Fade Out (Stealth) and Banishing
  Shot (push) get her out without a swing; a walking Ethereal Step mutant fails the suites. AutoPlay uses the Step both to
  leave a lethal pin and, at full HP, to kite a fixture grunt (no attack of opportunity in either probe).
- **Combos with real heroes** (probe 5): Pinning Shot → Betty's Kick 'Em While They're Down hits 10 instead of 5;
  Banishing Shot pushes a grunt onto Hjalmar's Bear Trap (3 + 5 snap, Rooted) and onto Corelos' Glyph of Warding
  (3 + 5 burst); Spirit Mark → Marwyn's Ginger Snap 5 + 5. Arrow from Beyond takes Marked / Vulnerable / Empowered
  applied in between (an Empowered given to her between her turns is used on the landing: 18 → 27).
- **Passive vs bosses**: nothing in the boss puzzles depends on the heroes' line of sight (the DM's screen is
  invulnerability, Dr. Iris's gaze is her own sight), so Between Worlds breaks no puzzle.
- **Simplicity**: one verb each (damage / line damage / teleport / Mark / damage + Root / damage + push / area damage /
  delayed damage / Stealth (+ cleanse at III) / surface); II = bigger numbers, III = bigger numbers or one rider; pool 9.
- **Pronouns**: she/her in her files, the Ethereal Lost and Found event and every other hero's bark that names her.
- **Visuals**: gallery (poses, facings, statuses, portraits) and combat at zoom 1.6 (Phase Shot preview "Hits 3 foes
  for 12 · +4 Hype" through a wall, the Ethereal Step line, the Foreshadowed chip + log line, mist puffs, the rain):
  nothing to fix.

### Fixed (most severe first; 1-4 are guarded by assertions that a mutant fails)
1. **Two vacuous assertions.** Ethereal Step's "never into a pit" put the pit 6 tiles away, out of range at every level
   (a mutant allowing pits passed); Banishing Shot's "range 4" was `!valid(6,4) || g.x !== 6`, true for any range at
   I-II. Now a pit 2 tiles north (invalid, the tiles before and past it valid) and a foe 4 tiles away (yes) / 5 (no),
   plus a generic check that the range / area each desc names is the real one at every level (mutants: Banishing range
   5, Spirit Mark range 7, Volley radius 2 all fail it).
2. **Banishing Shot's order was untested** (a push-then-damage mutant passed): new "a lethal shot bumps nobody behind".
3. **The status read wrong**: "Goblin Grunt is Arrow from Beyond (22)." in the log and "+Arrow from Beyond 22" over the
   target (statuses are states: Rooted, Roasted, In Debt…). Renamed `kir_incoming` to **Foreshadowed** (a DM joke that
   reads as a state: "Goblin Grunt is Foreshadowed (22)."); preview and log line tested (the old name fails both).
4. **Simplicity (descs in one breath)**: Mist Opportunity was two sentences / 24 words ("… (not over other surfaces).
   It blocks line of sight, except Kiri's.") → "Ghost mist blocks line of sight around a tile within 5 (radius 1, for 2
   rounds, not over other surfaces)." (20; her seeing through it is the passive and the flavor); Arrow from Beyond
   19 → 16 words ("A foe within 7 takes 18 damage at the start of Kiri's next turn, wherever it is."). The suite's limit is
   20 words and one sentence now (was 24; the old Mist desc fails it).
5. **Barks** (probe 4: every line against the other 15 heroes' barks): no exact duplicates, but "Point me at it. Walls
   optional." shared its opener with Betty and Marbles, "Someone get them up. I'll make room." echoed Valdris' "Someone
   get them up. I'll hold the gap." and "Leveled up. Still not answering…" Sparrow's "I leveled up. Still not taller." →
   "Name a target. Walls optional." / "Stay out of the light. I know the people there." / "Stronger now. Still not
   answering the elf question." (Only the shared "Roll for initiative…" opener is left: the game's own dice moment.)
6. **Notes**: real-hero pairings in the kit table; stale requests resolved (the HUD's provoke preview, her hero event);
   new ENGINE request (a `cloud` surface flag so Ghost Mist can hang over pits / lava / deep water like smoke).

### Hero lens (verdict)
- Reads as the user's character at once: arrows through the ethereal plane (Ghost Arrow, Phase Shot, Arrow from Beyond,
  the rain) and moving ethereally (Ethereal Step, Fade Out). Passive = one rule (her skills ignore line of sight) and
  still the joke (Between Worlds: both planes, both halves).
- Combos: 2-3 clear setups (Spirit Mark, Pinning Shot, Banishing Shot) and payoffs (Phase Shot lines, Arrow from Beyond
  after Marked / Vulnerable). Distinct from the other 15: the only line-of-sight-free sniper with a through-walls
  teleport.
- Attacks of opportunity: she can't hold a line (ranged), but she can always leave one (Step is a starter).

### Balance (review re-run, real content, all 16 heroes; 72 fights a run, random partners and loadouts)
- Kiri focus, normal: 37-39% damage share, 66-71 per fight, downed 22-24%, party wins 56-58 / 72; brutal: 39%, 77, 53%,
  35 / 72. Same harness, focus Zarathor / Syllamin / Corelos / Hjalmar (normal): 32 / 32 / 31 / 27% share, 50-57 per
  fight, 55-62 / 72 wins. So she out-damages every other hero while her parties win at the same rate (her role is pure
  damage). Not changed; the tested lever for parity is under Known issues.

### Remaining (not fixed)
- Known issues above (top damage share by role, Mist rarely used by AutoPlay, Fade Out + arrow in one 4-AP turn reveals
  her a turn early, the arrow's `aiScore` and invulnerable targets).
- Requests above (threat shading ignores line of sight past the walk; the `cloud` surface flag; integration's v1 unlock
  expectations).

## Requests (Nov 3) — flyers ignore the floor, barrels, heals that revive (CONTENT SWEEP heroes-2)

- **Clouds**: `kir_ghost_mist` is `airborne: true` (a cloud, not a floor surface). The engine lets airborne surfaces
  hang over pits, lava and deep water, so this closes her old `cloud` request: a misted pit now blocks sight too. Mist
  Opportunity's desc ("not over other surfaces") stays exact. The mist has no unit effects, so flyers are unaffected.
- **Barrels**: Ghost Arrow, Pinning Shot and Banishing Shot can be aimed at a volatile object, through walls (Between
  Worlds: the barrel scan uses the skill's own `los: false`); riders skipped. Arrow from Beyond opts out
  (`target.objects: false`): its arrow lands next turn, and 3 AP to do what Ghost Arrow does for 1 makes no sense.
- **Heals**: none in her kit.
- **Tests**: `hero_kiri: v2 requests — …`: airborne flag; mist over a pit and over lava, and the misted pit blocks the
  archer's line; Ghost Arrow at a barrel behind a wall (preview = reality, 1 AP), Pinning Shot lists it, Arrow from
  Beyond does not.
- **Requests**: none (the `cloud` flag request above is done: `airborne`).

## Playtest fixes (Nov 12)

- **heroes-2 (Kiri part) / heroes-v1, fixed**: every range number in her descs is the range she really has: `reach(user,
  id, base)` → `DD.Targeting.reach` (fix:engine's helper: base + what range items, Dazzle and modifyRange hooks add to
  the skill's max range; no user → the listed number). With the Ghostwood Longbow: Ghost Arrow "within 6", Mark 7,
  Arrow from Beyond 8, Banishing Shot 5, Phase Shot "a straight line of 6 tiles" (its line already followed the range),
  Ethereal Step, Haunted Volley, Mist and the signature too. Suite `hero_kiri: playtest fixes (Nov 12)`.
- **heroes-v1 across the eleven heroes fix:content owns + the generic skills**: the same `reach()` helper (one copy per
  file, delegating to `DD.Targeting.reach`) now prints the target range in Zarathor (9 skills), Syllamin (6), Marbles
  (4), Josiah (8), Mayor Buga (11), Betty (Ramming Speed!, Mountain Goat, the G.O.A.T.), Valdris (6), Pebbles (3), Kiri
  (10) and the generic skills (Throw Chair, Dodge Roll, Pocket Sand, Come At Me Bro, Barrel Toss, Tactical Retreat).
  Ellaria and Corelos print no target range. Area sizes ("foes within 2 of the target", "within r tiles of you") are
  not target ranges and stay. Cross-hero suite: `kit: playtest fixes (Nov 12) — descs give the range a +range item
  really gives (heroes-v1)` (every skill level whose desc prints its max range prints max+1 with +1 range).
  Not done: Slate, Basanos, Sparrow, Marwyn and Hjalmar (deferred files this run) and the consumables (static desc
  strings: the Ice Bucket's "within 2", the Thunder Jar's "within 4"…; the post-balance finish run can make them
  functions). Checked Nov 12 (~20:10): a consumable's card never contradicts its own text today, because
  `UI.consumableTooltipHtml` / `consumableCard` take no user (the 🎯 line says "Range 1–4", the text "within 4"); only
  the real range in a fight is 1 more with a +range item. A user-aware desc needs the UI to pass the holder and to
  call a desc function (rewards.js / consumableCard read `d.desc` as a string), so it is a pair change:
  **Request (fix:ui or the post-balance finish run, heroes-v1)**: pass the holder to the consumable tooltip / card and
  render `typeof d.desc === 'function' ? DD.skillDesc(d, 1, holder) : d.desc`; then consumables.js switches its seven
  ranged descs (Ice Bucket, Flask of Bad Decisions, Scroll of Yeet, Bag of d4s, Holy Water, Frost Flask, Thunder Jar)
  to `DD.Targeting.reach`.

## Review (finish, Nov 14) — REVIEWER

- D3 re-played with her real kit: Fade Out (Stealthed), then Ghost Arrow at a crate → "Revealed!"; at an explosive
  barrel → revealed too. The Stealth tooltip now says "Breaks when it deals damage or attacks an object."
- Arrow from Beyond stays a D1 opt-out (it lands next turn); her other single-target damage skills hit a crate for
  exactly their 🔨 number (probe `.tmp/wf14/rev/d1.js`).

## Conditional healing (Nov 18) — "Ghosting" (build:g2, plan §4.11)

The user (Nov 18): "I want everyoe else brought up but by conditional healing". Kiri's lift is a skill-rider on her
starting **Ethereal Step**: leaving a foe she started her turn next to heals her. Ellaria untouched.

**What.** At her turn start, after Arrow from Beyond lands (a foe it kills no longer counts), her passive's `onTurnStart`
marks her engaged (`unit.data.kir.engaged = state.turn`) when an active unit hostile to her stands at `DD.Grid.dist` 1.
Ethereal Step on that turn, after a successful teleport, heals her **3 / 4 / 5** (level key `ghost`,
`DD.Kiri.GHOSTING`), once per turn (`data.kir.ghosted = state.turn`; cd 1 already makes it every other turn).
- **Ethereal Step** (`kir_step`): levels `{ len: 3, ghost: 3 }`, `{ 4, 4 }`, `{ 5, 5 }`; still `kind 'move'`, a tile target, no
  `'heal'` tag (never an aimed revive). Execute: teleport; on success `ghost(u, L.ghost)`: if `active(u)` and `canGhost(u)`,
  spend the turn's mark, then `DD.Act.heal(Kiri, Kiri, L.ghost, { via: 'lift:kiri' })`, always called when the condition holds
  (0 at full HP); the "👻 Ghosted!" text and the `ghost` bark (0.4) only when it healed (else the old `move` bark, 0.3). A failed
  teleport neither heals nor spends the mark. Desc (I): "Teleport to an empty tile up to 3 tiles away in a straight line, through
  walls and units. If a foe was next to you when your turn started, you ghost it: heal 3 HP." (II 4 / 4, III 5 / 5; the range
  from `reach()` as before.)
- **Barks** (new key `ghost`, exactly the plan's three): "Leaving you on read." / "It's not you. It's the plane of existence." /
  "Ghosted."
- **AutoPlay.** The exact pass dry-runs the heal (it is in the execute; the mark is in `unit.data`, deep-copied). New `aiScore`,
  quick pass only (0 when `ctx.autoplay`): `healWorth(Kiri, L.ghost)` while she is engaged this turn and has not ghosted
  (`DD.AutoPlay.healWorth`, E2, local fallback). It adds to `utilQuick`'s estimate for every Step landing (Step is a utility
  mover), so the Step competes for an exact dry run on an engaged turn.
- **Code:** `js/data/heroes/kiri.js`: `GHOSTING`, `kirData`, `healWorth`, `markEngaged` / `canGhost` / `ghost` (next to the
  arrows), the passive's `onTurnStart`, Ethereal Step, `barks.ghost`, the `DD.Kiri` exports.

**Tests** (`tests/content/hero_kiri.js`, new suite "hero_kiri: conditional heal (Nov 18)"): `GHOSTING`; the desc word for word
at I-III (numbers from `L`), no `heal` key, still a tile-target move; the three barks (she/her, ≤ 70 chars); fires at I-III
(a grunt next to her at her turn start, hurt Kiri Steps: +3 / +4 / +5, her heals stat grows by it, `previewThenUse` exact with
`+N` on her, the call `heal(Kiri, Kiri, N, { via: 'lift:kiri' })`); a second Step the same turn (an Encore-style reset) heals
nothing; at full HP the call is made and heals 0; near misses: nobody next to her at turn start, then a grunt arrives → 0;
she walks next to a grunt, then Steps → 0; an ally next to her → not engaged; her arrows land first (one that kills the grunt
next to her → not engaged; one that doesn't → engaged); the mark is per turn (her next turn with nobody next to her → not
engaged); a failed teleport (tile taken) → no heal, mark kept; Kiri downed → nothing (never a revive); a plain Step's preview
shows no heal; `aiScore` = `healWorth(Kiri, 5)` (III, engaged, hurt) / 0 in the exact pass / 0 when not engaged; AutoPlay with
the Cloak (Step free) next to a stunned grunt ghosts (+3), and the same board without the mark never heals her.
**Updated assertions:** the registry suite checks Ethereal Step's teleport sentence as before (≤ 20 words, ≤ 2 clauses, no
"if") plus exactly the Ghosting rider (plan §2.10: Step keeps one rider); `ghost` joins the shown-number keys. The suite
"attacks of opportunity" (AutoPlay steps out of a lethal pin): she started that turn next to both foes, so the Step now also
ghosts them: `k.hp === 9` became `9 + L('kir_step', 1).ghost` (12), the rest unchanged.

**Sanity sims** (`bash tools/sim.sh "debug=1&raw=1&seeds=30&from=…&stop=2&party=…"`, normal, acts 1-2):

| party (from) | fights | fires / fight | HP / fight | fires by kind |
|---|---|---|---|---|
| kiri, marbles, pebbles, basanos (50200) | 189 | 0.11 | 0.4 (self) | regular 0.09 · elite 0.26 · boss 0.13 |
| kiri, zarathor, syllamin, corelos (50250, probe page) | 263 | 0.11 | 0.3 (self) | |

T8 for `lift:kiri`: min 0.4 fires, band 1-4 HP. **Far under, and not fixable by an AutoPlay term.** A scratch probe
(`.tmp/g2/probe.js` on a copy of the sim page, `.tmp/g2/simx.sh`) counted her turns: party 1, 969 turns, only 52 (5.4%) started
with a foe next to her (0.28 a fight), 50 of them hurt; she Stepped on 21 (40%), Step was on cooldown on 6, and on most of the
rest she shot point blank three times (12) or walked off (11). Party 2: 1,093 turns, 70 engaged (0.27 a fight), 29 ghosted
(41%), 12 on cooldown, 21 three point-blank shots. So the ceiling, ghosting on every engaged turn Step is ready, is about
0.22-0.24 fires a fight: the plan's "~0.8 ghosts a fight" assumed she starts many more turns in melee than AutoPlay ever lets
her (she is a ranged hero who keeps her distance; her damage taken is mostly from range). The remaining choice (Step + 2 shots
vs 3 shots) is the exact pass weighing a 3-HP heal (2.4-4.5) against a 5-damage shot; I kept the plan's term (an exact-pass
top-up would count the heal twice). 0 errors, 0 DD.warn lines.

**Full run** (`bash tools/test.sh`, Nov 18, after the G2 build): 1310 suites PASS, 0 failures, 0 swallowed "Error in" lines.

### DESIGN §6 brief (Nov 18)

For the engine builder (phase 2). Anchor in `### Kiri the Half-There — Half-Elf Ranger (she/her)` (unique, DESIGN.md line
~598, the end of the "Basic" bullet), this whole line:

```
  units) and *Ethereal Step* (teleport up to 3 tiles in a straight line, through walls and units).
```

Replace it with these two lines:

```
  units) and *Ethereal Step* (teleport up to 3 tiles in a straight line, through walls and units; if a foe was next
  to her when her turn started, she ghosts it and heals 5–7 HP, by level).
```

### Deviations (Nov 18)

- None from the plan's mechanics, numbers or texts. Notes: the old `move` bark (0.3) now plays only when the Step did not
  ghost (the `ghost` bark takes that moment); the registry suite's "no if" / ≤ 20-word rule reads the teleport sentence and
  asserts the exact Ghosting rider in place of the old whole-desc check.

### Requests (Nov 18)

- **Lead / balance pass (decision needed, non-blocking)**: T8's minimum for `lift:kiri` (0.4 fires a fight) is out of reach
  under AutoPlay: she starts only ~0.28 turns a fight next to a foe (two parties, probe above), so even a Step on every one of
  them gives ~0.22-0.24. Options: (a) read Kiri's T8 row as met at ~0.1-0.2 fires (tier B, share 1.17: the lift was meant to
  be light); (b) the plan's lever, `ghost` 3 → 4 → 5 inside [3, 5]: more HP per fire, and a bigger heal wins more of the
  engaged turns she now spends shooting (fires up to the ~0.22 ceiling, not to 0.4); (c) a wider trigger (e.g. a foe within 2
  at her turn start) would be a design change for the user, not mine to make.

### Review (Nov 18) — review:g2

Adversarial review of "Ghosting" against plan §4.11 (code path read end to end, suites run, a sim).
- **Holds:** `markEngaged` runs from the passive's `onTurnStart` (the only `onTurnStart` site, combat.js `beginTurn`, fires
  for her own turn group only) after `landArrows`; it needs an active hostile unit at Manhattan distance 1 (the game's
  "next to"); the heal is `DD.Act.heal(Kiri, Kiri, ghost, { via: 'lift:kiri' })` after a successful teleport, once per turn
  (`ghosted`), only on the turn whose start marked her (a Step on someone else's turn never matches `state.turn`); `active`
  is checked first; desc == execute at I-III; no HP threshold, nothing at combat start, no loop (the heal makes no foe
  adjacent). Svammiel's floor halves it; the Radio Edit never picks a Step (no `dmg`).
- **Observation (no change):** the new quick-pass `aiScore` adds the same value to every Step landing, and every utility
  skill gets its top 3 landings dry-run anyway (`utilityOptions`, UTIL_REFINE 3), so it changes no AutoPlay choice; the
  exact dry run is what sees the heal. Harmless and as the plan wrote it.
- **Sim** (`tools/sim.sh "debug=1&raw=1&seeds=30&from=55100&stop=2&party=kiri,buga,marwyn,benedick"`, normal, acts 1-2):
  247 fights, **0.16 fires / 0.5 HP a fight** (regular 0.13 / 0.4, elite 0.35 / 1.0, boss 0.17 / 0.5); 0 errors, 0 DD.warn
  lines, 0 stalls. Confirms the builder's T8 shortfall (min 0.4, band 1-4): the condition is rare under AutoPlay (she keeps
  her distance). The lead's decision (the Requests above) stands.
- **Fix:** restored the space in the "playtest fixes (Nov 12)" section rule of `tests/content/hero_kiri.js` (the build had
  dropped it; cosmetic).

### Balance pass (Nov 18) — heal:balance: `GHOSTING` 3/4/5 → 5/6/7 (T8)
The conditional-healing balance pass (`docs/notes/balance.md` "Conditional healing pass (Nov 18)") measured `lift:kiri` at
the plan's numbers on 600 fresh campaign runs (seeds 30000-30599, normal): **0.16 fires and 0.51 HP a fight** (± 0.04 /
± 0.11; regular 0.13 / 0.41, boss 0.21 / 0.66), under T8's minimum (0.4 fires) and band (1-4 HP), as the build and the
review found. The plan's T8 rule: the AutoPlay term first (in, and no term can make her start more turns in melee), then
her number one step a iteration inside its range: `ghost` I 3 → 4 (iteration 1) → 5 (iteration 2, the top of [3, 5];
II / III = I + 1 / + 2). Only the constant moved (`GHOSTING = [5, 6, 7]`; the desc, the levels and the aiScore read it);
the suite's pin and its two literal 3 / 5 checks read the constant now; DESIGN §6 and v2-digest §2 say 5–7 / 5/6/7. The
fires stay under T8's 0.4 (structural: reported to the lead in the balance notes, with the HP a fight at each step).

### QA fixes (Nov 18, qa-fix:heal)
- **[heal QA-1] the log says why she healed.** A ghosting that heals (> 0) now logs, right after "Kiri heals N HP.":
  "Kiri ghosts <foe>. Left on read. She feels lighter already." The turn-start mark also keeps the name of the foe she
  started next to (`data.kir.engagedWith`, the first one found; fresh every fight like `engaged`). No pronoun for the
  foe (a named boss is never "it"). Test: "hero_kiri: conditional heal (Nov 18)" (the line after the heal line, the
  grunt by name; none at full HP). No number changed.
- **[heal QA-3]** her Step's aim hint now names the heal ("💚 you heal N") next to "Click an empty tile"
  (js/ui/combat_hud.js `previewSummary`).
