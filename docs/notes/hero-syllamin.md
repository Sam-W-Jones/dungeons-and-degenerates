# HERO: Syllamin — notes

Files: `js/data/heroes/syllamin.js`, `tests/content/hero_syllamin.js` (suites `hero_syllamin: …`).
Run: `bash tools/test.sh "suite=hero_syllamin&isolate=heroes/syllamin,hero_syllamin"` (and `suite=content:` with the same isolate).
Scratch (not shipped): `.tmp/syllamin/` — the v1 files (`*_v1.*`), a balance sim (`bal.html` + `bal_suite.js`, run with
`.tmp/syllamin/page.sh bal "n=2"`), screenshots.

## v2 summary (initiative, no telegraphs, no Guard, simple skills)

**Syllamin, the Roastmaster General**: Faerie Bard, available from the start (`unlock: null`), **he/him**. HP 20 (+3/level),
3 AP, move 5, **initiative +4** (`stats.init`), `flags.flying`, colour `#ff3fa4`. Role: *Support · debuffs · crowd
control*, complexity 2 (was 3). A four-inch punk faerie with a hot-pink mohawk, glam lightning-bolt makeup, hoop
earrings, a gold lute and fairy wings. Barks: 5–6 lines per key (≤ 70 chars), swearing bleeped (`#$%&`), every other
hero name-dropped, the three new ones included (Betty eats the map, Kiri phases through him, Basanos is a "big puppy").

**Passive: Heckler** (one rule, one hook). His damaging skills Roast each foe they hit (skill damage only: no bumps,
burns, shocks or thorns). At **3 Roasted** the foe suffers **Emotional Damage**: the stacks clear, it is **Stunned**
(elites and bosses: **Weakened for 2 turns** instead) and the party gains **6 Hype**. Roasted (`syl_roasted`) is a pure
countdown now: it no longer lowers the foe's damage. It sticks (no decay), so every joke is lasting progress; the
v1 "once per foe per round" guard is gone (a foe can melt down twice in a turn: still one stun, 6 Hype each).

| id | name | kind · AP | cd / charges | L1 → L2 → L3 (one verb + at most one rider) |
|---|---|---|---|---|
| `syl_basic` | Your Mom Joke 🤬 | attack · 1 | — | 5 psychic to a foe up to 4 tiles away (LOS). Joke barks; a rude gesture while silenced |
| `syl_signature` | Diss Track 💿 | spell · 2 + 100 Hype | — | 3 verses × 4 psychic to every foe (12). Each verse Roasts → mass Emotional Damage |
| `syl_heckle` | Heckle 🗯️ (starter) | spell · 2 | cd 2 | 4/5/6 psychic, range 4/4/5, and **Charm**: on its next turn the foe fights for the party |
| `syl_power_ballad` | Power Ballad 🎶 (starter) | spell · 1 | cd 2 | self + allies within 2/3/3 **Inspired** for 1/1/2 turns |
| `syl_hype_man` | Hype Man 📣 | buff · 1 | cd 2/1/1 | an ally (range 5) gains 1/1/2 AP **on its next turn** and is **Empowered** |
| `syl_shriek` | Discordant Shriek 🔊 | spell · 2 | cd 2 | 4/5/6 psychic in a 2/2/3-deep cone, **push** 1/1/2 |
| `syl_glitter_bomb` | Glitter Bomb ✨ | utility · 2 | cd 2 | **Dazzle** foes in radius 1/1/2 and leave slippery **Glitter** for 2/3/3 rounds (not over other surfaces) |
| `syl_lullaby` | Lullaby of Mediocrity 💤 | spell · 2 | cd 3 | foes in radius 1 **Asleep** 1/2/2 turns (damage wakes them); III also **Marked 3** |
| `syl_encore` | Encore! 🔁 | buff · 2/1/1 | 2 charges | reset an ally's cooldowns (range 5); III also +1 AP on its next turn |
| `syl_fae_blink` | Fae Blink 🧚 | move · 1 | cd 2 | teleport an ally 2-6/7/8 tiles away to a free tile next to him; +3/4/6 **Block** |
| `syl_mosh_pit` | Mosh Pit 🤘 | attack · 1 | cd 2 | foes within 2/2/3 of a tile take 2/3/3 and are **pulled** 1/1/2 toward it |
| `syl_mic_drop` | Mic Drop 🎤 | attack · 3 | 1 charge | 15/18/22 to a foe up to 4 tiles away (no LOS) and **Stun** it |

Silence: the five spells (Heckle, Power Ballad, Shriek, Lullaby, Diss Track) are `kind: 'spell'`, so the engine's one
Silence rule covers them — no hidden `canUse`. Hype Man, Encore and Fae Blink refuse an ally that will lose its next turn
anyway (stunned, asleep, a sheep: "They can't act next turn.") — a targeting guard the HUD shows, not a mechanic.

**Combos with other heroes** (the point of the kit, DESIGN §6):
- **Mosh Pit → anyone's AoE**: pulls a spread-out crowd around one tile (tested: the mage's radius-1 Fire Fixture on
  the pit's centre goes from 0 foes to 3). Pairs with Zarathor's fireball, Marwyn's cleave/whirlwind, Kiri's lines.
- **Glitter Bomb → anyone's push**: a unit pushed onto Glitter slides 1 extra tile (tested: the knight's Shield Bash
  push 2 → 3) — into pits, lava, water, walls or each other. Pairs with Marwyn's Yeet, Slate's throws, Betty's Ram,
  Marbles' whacks, Basanos' Shoulder Check and his own Shriek. The Dazzle is the control half.
- **Hype Man → the big hitter**: Empowered (+50% on its next damaging skill) and +1 AP on its next turn (tested: the
  knight's next slash 5 → 8 with 4 AP).
- **Lullaby III → the alpha strike**: sleepers are Marked 3 (the hit that wakes one deals +3).
- **Shriek → water**: a foe pushed into water is Wet (lightning +50%: the Electric Lute, a mage's Chain Zap).
- **Heckle**: a charmed foe hits its own friends on its turn — best right after a Mosh Pit packs them together.
- **Power Ballad / Encore / Fae Blink**: Inspired, cooldown resets and a rescue-teleport with Block for whoever needs it.

**Status** `syl_roasted` (🍗, debuff, stack, max 3, `decay: 'never'`): desc "Roasted n/3. At 3: Emotional Damage
(…)"; its own `onStatusApplied` hook fires the meltdown, so any content can roast (`DD.Syllamin.roast` or a plain
`addStatus`). **Surface** `syl_glitter` (pink sparkles, custom `draw`, 2 rounds by default): `slide: true` only, fire
burns it away. It is placed only on tiles without a surface, so it never erases oil, fire or water.

**Items** (all `hero: 'syllamin'`, no starting shields, no Guard):
- `syl_electric_lute`, The Electric Lute 🎸 (weapon, rare): +10% damage; Your Mom Joke deals lightning damage (Wet ×1.5)
  and electrifies the water its target stands in (the engine's shock: 4 lightning + Stun to every grounded unit in that
  water body, allies too — the desc says so).
- `syl_studded_jacket`, Tiny Studded Jacket 🧥 (armor, common): +4 max HP; a foe that damages him from an adjacent tile
  is Roasted (a comeback). A comeback meltdown on the foe's own turn costs it its *next* turn (fresh stun).
- `syl_mixtape`, Platinum Diss Mixtape 📼 (trinket, legendary): +15 Hype at combat start; each Emotional Damage gives
  the party 4 more Hype (10 in all). The v1 "roast spreads to foes within 2" chain is cut (it needed the
  once-per-round guard to terminate).

**Narration keys** (own): `syl_emotional_damage`, `syl_heckle` (on a successful charm), `syl_diss_track`.

**Sprite** (unchanged): humanoid `tiny`, scale 0.7, `outfit: 'coat'`, fairy wings, gold lute, hoop earrings, belt, pink
notes aura, `hover: 20`; the `overlay` paints a chunky hot-pink mohawk, faerie ears and a mint glam bolt.

## v2 conversion — what changed from v1 (and why)

| v1 | v2 |
|---|---|
| Role "Support · debuffs · telegraph sabotage", blurb "talks their own attacks into their friends' faces" | "Support · debuffs · crowd control"; "heckles them into punching their own friends" |
| Heckle: re-aims up to 1/2/3 foes' **telegraphs** onto the victim (`redirectIntent`, `charmed` with `noRecharm`, the `syl_heckled` kill-Hype status, `heckleCandidates`) | damage + **Charm** the target (`turns: 1` = its next turn). `syl_heckled`, `HECKLE_KILL_HYPE`, `heckleCandidates` removed |
| Heckler: Roasted −1 damage per stack (+ `telegraphFlat`), meltdown once per foe per round, stun-immune → Weak | Roasted is a countdown only; no per-round guard; Stunned (elites/bosses Weakened 2 turns); the engine's immunity handles the stun-immune |
| Power Ballad "this turn" / "2 turns" + 2 Block at III; a `canUse` silence check | Inspired 1/1/2 turns (own-turn counting); radius 2/3/3; a spell (Silence via the engine); the Block rider cut |
| Hype Man +1/+1/+2 AP **now**, Empowered from II, +5 Hype | +1/+1/+2 AP **on the ally's next turn** (banked), Empowered from I, cooldown 2/1/1, no Hype rider |
| Glitter Bomb: damage + Dazzle + a Glitter surface that also Dazzles foes walking in | Dazzle + slippery Glitter (Glitter only slides pushed units; no damage) |
| Lullaby "their attacks are cancelled" | "Asleep for 1/2/2 turns (damage wakes them up)", Marked 3 at III |
| Encore +1 AP "now" at III | "+1 AP on its next turn" at III |
| Fae Blink III also cleansed a debuff | numbers only (range 6/7/8, Block 3/4/6); the Block lasts until the ally's next turn starts |
| Sick Burn (fire, +per Roasted stack, Burn, tile reaction) | **cut** (four effects in one skill; the pool is 10 now) |
| Mic Drop 10/12/14 + 4/5/6 splash + "Roasts it 3 times" (a guaranteed meltdown) | 15/18/22 + **Stun** (no splash): a once-per-fight wind-up interrupt that works on elites |
| Platinum Mixtape: Emotional Damage +4 Hype **and** roasts every foe within 2 | +4 Hype only |
| no `stats.init` | `stats.init: 4` |

## Public API

- `DD.Syllamin.roast(src, target, n)` → `syl_roasted` instance | null. Roasts a foe of `src` (any unit if `src` is
  null); Emotional Damage triggers itself.
- `DD.Syllamin.emotionalDamage(unit, src)` → bool: a forced meltdown.
- `DD.Syllamin.blinkSpot(user, ally)` (pure) → `{x, y}` | null: where Fae Blink would put the ally.
- Constants `ROAST_MAX` (3), `EMO_HYPE` (6), `EMO_WEAK` (2), `MIX_HYPE` (4).
- The `syl_glitter` surface is usable by anyone (`DD.Act.setSurface(x, y, 'syl_glitter', turns)`).
- Removed in v2: `DD.Syllamin.heckleCandidates`, `HECKLE_KILL_HYPE`, status `syl_heckled` (nothing outside his files used them).

## Tests

`tests/content/hero_syllamin.js`, 20 suites (~2,460 assertions, ~2 s isolated):
- **hero def / kit shape**: stats (init +4, no starting Block in a fight), pool 10 = the documented kit, kinds (exactly
  the five spells), every desc at every level (with and without a user) shows its damage, ≤ 26 words, no if/else
  clauses, no telegraph / intent / Guard wording anywhere (role, blurb, passive, descs, items, barks), he/him, barks
  (4-6 per key, ≤ 70 chars, ≥ 8 heroes named incl. Kiri / Betty / Basanos, bleeped), the passive is one hook, Roasted
  has no hidden damage change, Glitter is slippery only, items have no Block / Guard / combat-start hooks, the sprite
  paints without warnings.
- **Heckler**: 5 per joke, Roasted 1-2-3, a Roasted foe still deals full damage, meltdown = stacks clear + Stun 1 turn +
  exactly 6 Hype + a log line; the stunned grunt next to him loses exactly its next turn ("loses the turn (Stunned)")
  and stabs again the round after; stacks stick for rounds; two meltdowns in a turn pay twice; allies never Roasted;
  bumps don't Roast; elite and boss Weakened for exactly 2 of their turns; a stun-immune foe: no stun, stacks cleared,
  Hype paid, no warnings.
- **Every pool skill at every level**: the exact desc string, AP, cooldown / charges, numbers, and the durations in own
  turns through real turn flow — Heckle's charmed grunt stabs its own friend on its turn and the charm ends with that
  turn; Power Ballad on the knight (whose turn comes later the same round) and on himself (fresh: through his next
  turn); Hype Man's AP banked (`apBank`) then spent on the knight's turn, Empowered 5 → 8, cooldown 1 = usable every
  other round; Shriek pits (YEET +20 Hype), lava, water (Wet), map edge bump, Glitter slide, kills not pushed;
  Glitter Bomb lasts exactly N rounds, doesn't cover oil, a Dazzled grunt misses the cleric then hits the next round;
  Lullaby sleepers skip 1/2 turns, damage wakes, Marked +3 at III; Encore makes the knight's bash usable on his next
  turn (+1 AP at III), 2 charges; Fae Blink's Block survives the grunt's turn and ends at the ally's own turn start;
  Mosh Pit pulls, bumps, the centre stays, kills are not dragged; Mic Drop: no splash, Stun costs exactly one turn,
  once per combat, over walls, Stuns an elite and **interrupts the fixture boss's wound-up meteor** (`windup:cancel`).
- **Combos**: Mosh Pit + the mage's fireball, Glitter + the knight's Shield Bash, Hype Man + the knight's slash.
- **Signature**: 99 Hype refused, 3 × 4 to every foe, mass meltdown (grunts Stunned, the boss Weakened), Hype after =
  4 × 6 + 4, allies untouched, kills mid-track, Silenced.
- **Items**: Lute numbers (6, Wet 8), lightning element, electrified water (stuns, 4 shock, no Roast, an ally in the
  water shocked for 6 and Stunned); Jacket +4 HP, comeback Roast from a real AI stab (not from the archer), a comeback
  meltdown on the grunt's own turn costs it its next turn; Mixtape +15 start, 10 per meltdown (elites too), no spread.
- **Edge cases**: silenced (spells refused, everything else works, rude gesture), stunned / asleep / sheep, charmed by a
  grunt (0 damage, no Roast, −1 AP), not enough AP, not his turn, his unused AP lost (no Guard Block), stunned during
  his own turn → his next turn passes by itself, every skill on an empty tile / null target, targets dying mid-skill
  (Heckle, Mic Drop, Mosh Pit), flying over pits and deep water.
- **Previews**: every skill at every level against up to 4 targets, with no item / the Lute / the Mixtape: never
  uncertain, side-effect free (`fingerprint`), HP, KOs and Hype exactly as predicted (76 checks).
- **AutoPlay v2**: party Syllamin + `test_knight` + `test_cleric` + `test_mage` at levels 1 / 3 / 5 vs the fixture
  act-1/2/3 normal, elite, boss and objective encounters (12 fights, rotated loadouts covering the pool, items at 3/5):
  no timeouts, no warnings, he has an initiative entry and gets his turns, uses many skills, Emotional Damage happens,
  the party wins. Plus a decision test: AutoPlay heckles the tanky grunt standing next to a wounded cleric.

## Deviations

- **Pool 10** (DESIGN v2 says 8-10; the generic registry suite still asks 9-11).
- **Roasted does not decay** (as in v1) and is a pure countdown in v2: the −1 damage per stack was a hidden second effect.
- **Emotional Damage Weakens elites** (not just bosses) for 2 of their turns, so three 1-AP jokes a turn can't stun-lock
  an elite. A stun-immune normal foe gets the engine's "Immune!" (none exist outside elites/bosses today).
- **Power Ballad is a spell** (v1: a buff blocked by a custom `canUse`): Silence now works through the engine rule.
- **Ally-buff targeting guard**: Hype Man, Encore and Fae Blink? — Hype Man and Encore refuse a stunned / sleeping /
  sheep ally (the AP would be wasted: a stunned hero's banked AP is consumed by the lost turn). Fae Blink can rescue anyone.
- **Glitter** never covers another surface (keeps allies' oil and water combos); the desc says "(not over other surfaces)".
- **Roast FX are silent** (`addStatus(..., { silent: true })` + a small parallel "🍗 Roasted N"), so a three-verse
  Diss Track doesn't queue 15 status pop-ups and log lines. Diss Track verses play as one beat (`together()`, visual only).

## Core fixes (v1, by the first review pass; still in place)

1. **`js/engine/ai.js` (RULES): status `telegraphFlat`.** Added so Roasted foes showed their real (lower) damage. v2
   Roasted no longer changes damage, so Syllamin no longer uses it; the hook stays useful for any status with a flat
   damage change (the comment in `ai.js` near `telegraphFlat` still names `syl_roasted (−1 per stack)` as the example —
   see Requests).
2. **`js/render/sprites.js` (RENDER-SPRITES): numeric `hover` for flying units** (`hover: 20` is honoured). Regression
   suite: "he hovers at his own height in game".

## Requests

- **RULES (cosmetic, optional)**: `js/engine/ai.js` ~line 139 — the `telegraphFlat` comment cites `syl_roasted (−1 per
  stack)` as its example; in v2 Roasted has no damage change, so the example is stale (the mechanism is fine).
- **RENDER-WORLD (optional, repeat from v1)**: unit-behind-unit silhouettes. At scale 0.7 (hover 20) he clears a medium
  unit in front of him, but a large one (Marwyn, Slate, Betty) still hides everything but his mohawk tip and HP bar.
- **Lead / DESIGN §6 Syllamin brief**: it still says "Role: support / debuff / telegraph manipulation" and "Heckle
  (redirect an enemy's intent onto another enemy)". v2 kit: "crowd control", Heckle = damage + Charm.
- **RULES (registry suite)**: `content: registry cross-references` still asks 9-11 pool skills (DESIGN v2: 8-10).

## Known issues

- AutoPlay rarely plays the pure-support skills (Glitter Bomb, Encore, Fae Blink): their value (pushes sliding further
  for allies, an ally's big cooldown back, a rescue) is mostly outside its generic model, and in the short fixture
  fights a 1-AP joke usually wins the comparison. They work and are tested; a human plays them.
- Charmed bosses follow the engine's charm (they attack their own side on their turn); the real bosses' own stun / charm
  guards decide whether Heckle lands.
- At scale 0.7 he can still be hidden by a large unit standing directly in front of him (see Requests).
- The overlay copies the humanoid painter's `tiny` head geometry (radius 9.4 × head size, shoulders at −12.5); if
  RENDER-SPRITES changes those constants, the mohawk, ears and bolt will drift.

## Balance (v2)

(filled in below after the sims)
