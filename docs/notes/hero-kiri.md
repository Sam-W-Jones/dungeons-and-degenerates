# HERO — Kiri, the Half-There (notes)

Files: `js/data/heroes/kiri.js`, `tests/content/hero_kiri.js` (18 suites `hero_kiri: …`), this file.
Run: `bash tools/test.sh "suite=hero_kiri&isolate=heroes/kiri,hero_kiri"` and `bash tools/test.sh "suite=content:&isolate=heroes/kiri,hero_kiri"`.
Looks: `bash tools/shot.sh "debug=1&fixtures=1&isolate=heroes/kiri,hero_kiri&screen=gallery&gallery=kiri" .tmp/kiri/g.png 1280x720 4000`.
Scratch (not shipped) in `.tmp/kiri/`: `sprites.html` (big gridded sprite + poses + portraits), `scene.html` / `scene.js`
(scripted fights in the real renderer + HUD: `scene=phase|aim|mist|beyond|rain|step`), `shot.sh` (screenshots a page there;
takes a machine-wide Chrome slot like `tools/*.sh`).

## Summary

Built from scratch, v2-native (initiative, one turn per unit, no telegraphs, no Guard, no combat-start Block). User brief:
*"Kiri (female) half-elven ranger. Can send her arrows into the ethereal plane and move ethereally"* — she/her. DESIGN §6
"Kiri" + "Simplicity": one verb per skill, power from combinations. Dry, competent, slightly spooky; tired of being asked
whether she's "the elf or the human one". Role: precise ranged damage + ethereal mobility. Complexity 2, `unlock: null`,
24 HP (+4/level), 3 AP, move 4, **initiative +3**, colour `#8a9bff`.

**Passive — Between Worlds** (one rule): *Kiri's skills ignore line of sight* — walls, pillars, trees, smoke and her own
mist don't stop her; enemies still need sight of her. The rule is data (every Kiri skill has `target.los === false`;
a borrowed line-of-sight skill keeps its own rule). The passive's hooks only deliver Arrow from Beyond (below).

**Kit** (ids `kir_*`; ⭐ starting; numbers I / II / III):

| Skill | id | Cost | Effect (one verb + at most one rider) | Pairs with |
|---|---|---|---|---|
| Ghost Arrow (basic) | `kir_basic` | 1 AP | 5 damage to a foe within 5, through walls and cover | — |
| Phase Shot ⭐ | `kir_phase` | 2 AP, cd 1 | 5 / 6 / 8 to every foe in a straight line of 5 tiles, through walls and units (allies unharmed) | foes lined up by pulls, throws, corridors |
| Ethereal Step ⭐ | `kir_step` | 1 AP, cd 1 | teleport up to 3 / 4 / 5 tiles in a straight line through walls and units (works while Rooted) | escaping, flanking |
| Spirit Mark | `kir_mark` | 1 AP, cd 1 | Mark a foe within 6: next damage +5 / +7 / +9 | any heavy hitter (Marwyn, Slate…), Arrow from Beyond |
| Pinning Shot | `kir_pin` | 2 AP, cd 2 | 7 / 9 / 10 damage + Root for its next 1 / 1 / 2 turns | keep a foe in fire / poison / an AoE, keep melee off the squishies |
| Banishing Shot | `kir_banish` | 1 AP, cd 2 | 3 / 4 / 5 damage + push 2 / 2 / 3 away from Kiri | pits (YEET), lava, water (Wet → lightning), runes, a Phase Shot line |
| Haunted Volley | `kir_volley` | 2 AP, cd 2 | 4 / 5 / 6 to every foe within 1 of a tile within 5 | clusters made by others |
| Arrow from Beyond | `kir_beyond` | 3 AP, cd 2 | a foe within 7 takes 18 / 22 / 26 at the start of Kiri's next turn, wherever it is | Marked / Vulnerable applied in between |
| Fade Out | `kir_fade` | 1 AP, cd 3 / 2 / 2 | Kiri is Stealthed until the end of her next turn; III: and sheds her debuffs | — (self defence) |
| Mist Opportunity | `kir_mist` | 1 AP, cd 3 | ghost mist, radius 1 / 1 / 2 around a tile within 5, for 2 / 3 / 3 rounds (not over other surfaces); blocks line of sight except hers | hide allies from archers / casters while she keeps shooting |
| Rain from the Other Side (signature) | `kir_signature` | 2 AP, 100 Hype | 16 to every foe within 2 of a tile within 6, ignoring Block and armor | — |

Pool = 9 (+ basic + signature): AP 1 / 2 / 3 mixed, one long cooldown (Fade Out I, Mist), the "big" one is Arrow from
Beyond (3 AP: she spends her turn aiming into the other side; it lands at the start of her next one — a heroes'
mirror of the boss wind-ups). Nothing is a `spell` (Silence doesn't stop her). Every desc is ≤ 24 words, no
conditions (tested).

**Arrow from Beyond mechanics**: the skill puts `kir_incoming` "Arrow from Beyond" (debuff ☄️, `stacking: 'stack'`,
stacks = damage, `decay: 'never'`) on the target with Kiri as source. Her passive's `onTurnStart` lands every arrow she
owns (`DD.Act.damage(kiri, target, stacks, { skill, noHighGround })`: her outgoing modifiers apply at landing, the
target's Vulnerable / Marked / armor too; kills are hers). It lands even if she is stunned (the turn still starts);
`onDowned` makes her arrows fizzle (a downed hero's turn is skipped, so they would hang forever). The HUD preview shows
"Arrow from Beyond 22" on the target (status stacks), 0 damage now. `aiScore` = the landing damage × 0.9 (capped by
the target's HP) so AutoPlay values it (its dry-run preview shows no damage).

**Status / surface**: `kir_incoming` (above); `kir_ghost_mist` "Ghost Mist" (`blocksLos: true`, 2 rounds default,
lavender `drawVolume` puffs, no reactions).

**Items** (all `hero: 'kiri'`): `kir_ghostwood_bow` Ghostwood Longbow (rare weapon: +10% damage, +1 range to skills
with range ≥ 2 — Ethereal Step's distance included), `kir_name_tag` "Hello, I'm the Elf One" Name Tag (rare trinket:
+2 initiative, +4 max HP), `kir_cloak_elsewhere` Cloak of Being Somewhere Else (legendary armor: +6 max HP, +1 armor,
Ethereal Step costs 0 AP via `modifyCost`). No `stats.block` anywhere (v2).

**Sprite**: humanoid, slim, green-grey tunic + cloak (`cape`), hood, dark long hair, violet eyes, no blush (dry), longbow,
belt + bandolier, soft violet `glow` aura. `overlay`: half-elf ear tips poking out through the hood (the painter hides
`pointy` ears under a hood) and a quiver slung over the cloak with violet / blue ghost-lit fletchings behind her back
shoulder. `underlay`: a lavender ectoplasm puddle with rising motes at her heels ("never entirely in one plane").
Checked in the gallery (all poses, both facings, statuses, portraits 128 / 64 / 40) and in combat.

**Barks**: 13 keys × 4-6 lines, ≤ 70 characters, her voice (the elf-or-human question, walls being a suggestion,
"different plane, slow mail"), no he/him anywhere about her (tested).

## Tests (`tests/content/hero_kiri.js`, 18 suites, ~800 assertions)

registry / identity / numbers / descs at every level (numbers shown, ≤ 24 words, no conditions, levels differ) / barks /
pronouns · sprite + portrait (every pose and facing, no warnings) · Between Worlds (through walls; a borrowed LOS skill
can't; the archer still can't see her) · Ghost Arrow · Phase Shot I-III (line through a wall and past an ally, length,
straight-only, multi-hit Hype, cooldown 1 per own turn, map edge) · Ethereal Step I-III (through wall + unit, length, not
into walls / units / pits / off-line, works while Rooted, Wet on water, corner) · Spirit Mark I-III (the knight's next hit
+mark, used up) · Pinning Shot I-III (Rooted on exactly 1 / 1 / 2 of its turns with the AI on, lethal pin) · Banishing
Shot I-III (pit YEET + env Hype, lava, water → Wet, wall bump, map edge, immovable, diagonal) · Haunted Volley I-III ·
Arrow from Beyond I-III (nothing before her next turn — checked at every turn start —, lands 11 tiles away behind a wall,
full turn after, Marked + Vulnerable, kill credit + Hype, dead target, Kiri downed → fizzles, Kiri stunned → still
lands, two Kiris, aiScore) · Fade Out I-III (hidden during exactly one enemy turn with a grunt next to her, III sheds
debuffs, attacking reveals) · Mist Opportunity I-III (tiles / rounds / not over fire or walls, blocks an archer's shot at
the cleric, not Kiri's) · signature (Block + armor ignored, ally spared, 100 Hype, range) · items (range, +10%, init +5
in a rolled fight, 0-AP step) · previews == reality for every skill at every level (walls, pits, lava, water, lethal) ·
v2 edge cases (stunned by an enemy turn, silenced, sheep, charmed: −1 AP and no damage to the charmer even from beyond,
not enough AP, not her turn, a dying foe mid-line, a volley that ends the fight) · AutoPlay: 12 fixture fights (acts 1-3,
normal / elite / boss) with party Kiri + test knight / cleric / mage at levels 1 / 3 / 5 (two loadouts each), plus a
signature turn.

## Public API (for tests / other content)

`DD.Kiri = { GHOST, phaseLine(ctx), pendingArrows(unit) → [{ unit, st }], landArrows(unit) → n, fizzleArrows(unit) → n }`.

## Deviations

- Fade Out is self-only (DESIGN brief: "Ethereal until her next turn"). An ally version was tried and dropped: under
  v2 durations a Stealth given to an ally whose turn comes after Kiri's but before the enemies' would expire at the end of
  that ally's turn and protect nobody (stealth is a `turnEnd` status), so it was order-dependent.
- Ethereal Step is a teleport, so Root doesn't stop it (Root forbids move actions) and it doesn't trigger Bleed.
- Mist Opportunity skips tiles that already have a surface (said in its desc) instead of replacing them, so it never
  silently puts out fire or removes oil / webs.

## Requests

None blocking. Suggestions for other areas:
- **HUD / ENGINE** (`DD.AI.reachOf` / `threatMap`): reach ignores line of sight past the walk (a known over-estimate), so
  the threat shading still marks tiles that Kiri's Ghost Mist (or a Smoke Bomb) actually shields from archers and casters;
  the player can't see the mist's protection there. AutoPlay's own danger model is LOS-aware, so sims value it.
- **AUTOPLAY**: the quick score reads `L.dmg` as immediate damage, so a delayed skill (Arrow from Beyond) gets refined
  on the strength of a kill it won't make this turn; the exact pass then values the status + `aiScore`. Works; a skill
  flag such as `delayed: true` (no immediate kill bonus in `quickScore`) would make the quick pass honest.
- **NARRATIVE** (optional): a Kiri hero event (DESIGN §11 lists one per hero) — e.g. a census-taking NPC whose form only
  has the boxes "Elf" and "Human".

## Known issues

- The generic `content:` skill-execution suite logs an advisory for `kir_beyond` ("levels[].dmg but no damage dealt in
  the arena"): its probe is removed before the arrow lands at her next turn. Expected; not a failure.
- In AutoPlay fixture fights Kiri mostly fires Ghost Arrow (5 damage per AP is the best single-target rate in the game for
  every hero's basic); pool skills are used for their riders / areas when they pay (all nine get used across the suite's
  loadouts).
