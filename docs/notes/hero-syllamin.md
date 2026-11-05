# HERO: Syllamin — notes

Files: `js/data/heroes/syllamin.js`, `tests/content/hero_syllamin.js` (suites `hero_syllamin: …`).
Run: `bash tools/test.sh "suite=hero_syllamin&isolate=heroes/syllamin,hero_syllamin"` (and `suite=content:` with the same isolate).
Scratch (not shipped): `.tmp/syllamin/` — the v1 files (`*_v1.*`), a balance sim (`bal.html` + `bal_suite.js`, run with
`.tmp/syllamin/page.sh bal "suite=syl_balance&n=2&who=syllamin,test_rogue&verbose=1"`; outputs `bal_*.txt`), a staged
look page (`look.html` + `look.js`, shot with `.tmp/syllamin/look.sh "debug=1&isolate=heroes/syllamin&act=diss" out.png
1600x900 4200`: Glitter, Roasted / charmed / sleeping / dazzled foes; `act=diss|mosh|joke|heckle`, `sx=&sy=` moves him,
`slot=<n>` arms HUD slot n (0 = basic), `hx=&hy=` hovers a tile for the HUD's move / area preview), screenshots.
Review scratch (`.tmp/syl-rev3/`, Chrome-slot aware): `probe.html` + `run.sh "tests=<files>&mut=<copy of syllamin.js>&…"`
(the test harness with probe files and/or a mutated hero file), `mut.sh [ids]` + `muts.txt` (43 mutants, results in
`mut_results*.txt`), `bal.html` (the balance sim with `?mut=`, via `PAGE=bal runp.sh`), `shot.sh poses` (every pose at
scale 4), `probe_dump.js` (all 16 kits as text).

## v2 summary (initiative, no telegraphs, no Guard, simple skills, attacks of opportunity)

**Syllamin, the Roastmaster General**: Faerie Bard, available from the start (`unlock: null`), **he/him**. HP 20 (+3/level),
3 AP, move 5, **initiative +4** (`stats.init`), `flags.flying`, colour `#ff3fa4`. Role: *Support · debuffs · crowd
control*, complexity 2. A four-inch punk faerie with a hot-pink mohawk, glam lightning-bolt makeup, hoop earrings, a gold
lute and fairy wings. Barks: 5–6 lines per key (≤ 70 chars), swearing bleeped (`#$%&`), every other hero name-dropped
with the right pronouns, the six new ones included (Betty eats the map, Kiri phases through him, Basanos is a "big
puppy", Valdris should forge him tiny armour, Hjalmar touches his lute, Pebbles licks him while ON FIRE).

**Passive: Heckler** (one rule, one hook). His damaging skills Roast each foe they hit (skill damage only: no bumps,
burns, shocks or thorns). At **3 Roasted** the foe suffers **Emotional Damage**: the stacks clear, it is **Stunned**
(elites and bosses: **Weakened for 2 turns** instead) and the party gains **6 Hype**. Roasted (`syl_roasted`) is a pure
countdown: it changes nothing else. It sticks (no decay), so every joke is lasting progress; there is no
once-per-round guard (a foe can melt down twice in a turn: still one stun, 6 Hype each).

| id | name | kind · AP | cd / charges | L1 → L2 → L3 (one verb + at most one rider) |
|---|---|---|---|---|
| `syl_basic` | Your Mom Joke 🤬 | attack · 1 | — | 5 psychic to a foe up to 4 tiles away (LOS). Joke barks; a rude gesture while silenced |
| `syl_signature` | Diss Track 💿 | spell · 2 + 100 Hype | — | 3 verses × 4 psychic to every foe (12; each verse hits every foe on the board then). Each verse Roasts → mass Emotional Damage |
| `syl_heckle` | Heckle 🗯️ (starter) | spell · 2 | cd 2 | 4/5/6 psychic, range 4/4/5, and **Charm**: on its next turn the foe fights for the party |
| `syl_power_ballad` | Power Ballad 🎶 (starter) | spell · 1 | cd 2 | self + allies within 2/3/3 **Inspired** for 1/1/2 turns |
| `syl_hype_man` | Hype Man 📣 | buff · 1 | cd 2/1/1 | an ally (range 5) gains 1/1/2 AP **on its next turn** and is **Empowered** |
| `syl_shriek` | Discordant Shriek 🔊 | spell · 2 | cd 2 | 4/5/6 psychic in a 2/2/3-deep cone, **push** 1/1/2 |
| `syl_glitter_bomb` | Glitter Bomb ✨ | utility · 2 | cd 2 | **Dazzle** foes in radius 1/1/2 and leave slippery **Glitter** for 2/3/3 rounds (not over other surfaces) |
| `syl_lullaby` | Lullaby of Mediocrity 💤 | spell · 2 | cd 3 | foes in radius 1 **Asleep** 1/2/2 turns (damage wakes them); III also **Marked 3** |
| `syl_encore` | Encore! 🔁 | buff · 2/1/1 | 2 charges | reset an ally's cooldowns (range 5); III also +1 AP on its next turn |
| `syl_fae_blink` | Fae Blink 🧚 | move · 1 | cd 2 | teleport an ally 2-6/7/8 tiles away to a free tile next to him; +3/4/6 **Block** |
| `syl_mosh_pit` | Mosh Pit 🤘 | attack · 1 | cd 2 | foes within 2/2/3 of a tile take 2/3/3 and are **pulled up to** 1/1/2 toward it |
| `syl_mic_drop` | Mic Drop 🎤 | attack · 3 | 1 charge | 15/18/22 to a foe up to 4 tiles away (no LOS) and **Stun** it |

Targeting (the tooltip shows it; suite "targeting"): basic 1-4 LOS · Heckle 1-4/4/5 LOS · Hype Man 1-5 · Glitter Bomb
1-5 LOS · Lullaby 1-4 LOS · Encore 1-5 · Fae Blink 2-6/7/8 · Mosh Pit 1-5 LOS · Mic Drop 1-4 (no LOS) · Power Ballad and
Diss Track centred on him · Shriek a direction.

Silence: the five spells (Heckle, Power Ballad, Shriek, Lullaby, Diss Track) are `kind: 'spell'`, so the engine's one
Silence rule covers them — no hidden `canUse`. Hype Man and Encore refuse an ally that will lose its next turn anyway
(stunned, asleep, a sheep: "They can't act next turn.") — a targeting guard the HUD shows, not a mechanic. Encore I-II
also refuses an ally whose cooldowns all end by its next turn anyway ("Its skills are ready by its next turn anyway.":
a cooldown counts only if it would still be running then — `cd > 1`, or `cd > 0` when it was used since the ally's last
turn, since a fresh cooldown skips its next tick), so no charge is wasted; III always targets (+1 AP). Fae Blink can
rescue anyone (it only needs a free tile next to him that a ground ally can stand on). Mosh Pit uses the engine's
`Act.pull` (it stops next to the target point), hence "pulled **up to** N tiles": nobody is pulled onto the target tile
itself. (The pull is always exactly enough: at radius N + 1 every foe it catches ends next to the target tile unless
something blocks it.)

### Attacks of opportunity (v2 AoO pass)

- His basic is **ranged** (range 4), so he never makes attacks of opportunity (`DD.Act.opportunitySlot(him)` is null).
  No `noProvoke` / `noOpportunity` flags: walking off a tile next to a melee foe provokes him like anyone (flying does
  not help; the move preview — `Combat.provokes` — knows it). With 20 HP he wants his control, not his wings, to get
  away.
- **What he gives the party against pins** (all tested): **Charm** (Heckle) — a charmed foe is not hostile to the party
  (`Grid.hostile` uses its flipped side), so it makes no attacks of opportunity on heroes *and* stabs its own friends
  walking away from it; **Sleep** (Lullaby), **Stun** (Emotional Damage, Mic Drop) and **Dazzle** (Glitter Bomb) switch a
  foe's attacks of opportunity off (engine rule) until the status ends with its turn; **Discordant Shriek** pushes the
  foe out of reach (pushes never provoke), so the pinned hero then walks off for free; **Mosh Pit** drags a foe off an
  ally (a pull is not a move action: no free hit either way); **Fae Blink** teleports a pinned ally out (teleports
  never provoke). That is his v2-AoO identity: the party's "get out of jail" support while the melee heroes hold the line.
- **Tiny Studded Jacket**: an attack of opportunity on him is "a foe damaging him from an adjacent tile" → the comeback
  Roast (at 2 Roasted it melts the attacker down; his walk goes on).

### Combos with other heroes (the point of the kit, DESIGN §6)

- **Mosh Pit → anyone's AoE**: pulls a spread-out crowd around one tile (tested: the mage's radius-1 Fire Fixture on the
  pit's centre goes from 0 foes to 3). Pairs with Zarathor's fireball, Marwyn's cleave/whirlwind, Kiri's lines, Pebbles'
  Big Wag (adjacent foes), Betty's and Basanos' cleaves.
- **Mosh Pit / Shriek → hazards**: a foe dragged across a pit falls in (YEET), onto lava burns; a Mosh Pit around a pit
  gathers the crowd at its edge for a push (tested with Shriek). Hjalmar's traps and Corelos' runes are the same play
  (whether forced movement triggers them is their owners' rule).
- **Glitter Bomb → anyone's push**: a unit pushed onto Glitter slides 1 extra tile (tested: the knight's Shield Bash
  push 2 → 3) — into pits, lava, water, walls, traps or each other. Pairs with Marwyn's Yeet, Slate's throws, Betty's
  Ram, Marbles' whacks, Basanos' Shoulder Check and his own Shriek. The Dazzle is the control half. Anti-synergy: fire
  (Pebbles, Zarathor) burns Glitter away.
- **Hype Man → the big hitter**: Empowered (+50% on its next damaging skill) and +1 AP on its next turn (tested: the
  knight's next slash 5 → 8 with 4 AP). Stacks with Valdris' forge buffs and Power Ballad's Inspired on the same ally.
- **Lullaby III → the alpha strike**: sleepers are Marked 3 (the hit that wakes one deals +3).
- **Sleep / Emotional Damage → Betty's Kick 'Em While They're Down** (10 instead of 5 against a sleeping or stunned
  foe), Marwyn's and Basanos' big single hits, Kiri's Spirit Mark on top of the Mark.
- **Shriek → water**: a foe pushed into water is Wet (lightning +50%: the Electric Lute, a mage's Chain Zap).
- **Heckle**: a charmed foe hits its own friends on its turn — best right after a Mosh Pit packs them together.
- **Unpinning** (above): Lullaby / Heckle / Glitter Bomb / Shriek / Fae Blink let an engaged ally walk or blink away.
- **Power Ballad / Encore / Fae Blink**: Inspired, cooldown resets and a rescue-teleport with Block for whoever needs it.

**Status** `syl_roasted` (🍗, debuff, stack, max 3, `decay: 'never'`): desc "Roasted n/3. At 3: Emotional Damage
(…)"; its own `onStatusApplied` hook fires the meltdown, so any content can roast (`DD.Syllamin.roast` or a plain
`addStatus`). **Surface** `syl_glitter` (pink sparkles, custom `draw`, 2 rounds by default): `slide: true` only, fire
burns it away. It is placed only on tiles without a surface, so it never erases oil, fire or water.

**Items** (all `hero: 'syllamin'`, no starting shields, no Guard; one stat + one rule each):
- `syl_electric_lute`, The Electric Lute 🎸 (weapon, rare): +10% damage; Your Mom Joke deals lightning damage (Wet ×1.5)
  and electrifies the water its target stands in (the engine's shock: 4 lightning + Stun to every grounded unit in that
  water body, allies too — the desc says so).
- `syl_studded_jacket`, Tiny Studded Jacket 🧥 (armor, common): +4 max HP; a foe that damages him from an adjacent tile
  is Roasted (a comeback) — enemy turns and attacks of opportunity alike. A comeback meltdown on the foe's own turn costs
  it its *next* turn (fresh stun).
- `syl_mixtape`, Platinum Diss Mixtape 📼 (trinket, legendary): +15 Hype at combat start; each Emotional Damage gives
  the party 4 more Hype (10 in all).

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
| Mosh Pit "pulled 1/1/2 tiles toward it" | "pulled **up to** 1/1/2 tiles toward it" (AoO pass: exact — the pull stops next to the target tile) |
| Platinum Mixtape: Emotional Damage +4 Hype **and** roasts every foe within 2 | +4 Hype only |
| no `stats.init` | `stats.init: 4` |
| barks named 9 heroes | 15 (+ Kiri, Betty, Basanos; AoO pass: + Valdris, Hjalmar, Pebbles), pronoun-checked |

## Public API

- `DD.Syllamin.roast(src, target, n)` → `syl_roasted` instance | null. Roasts a foe of `src` (any unit if `src` is
  null); Emotional Damage triggers itself.
- `DD.Syllamin.emotionalDamage(unit, src)` → bool: a forced meltdown.
- `DD.Syllamin.blinkSpot(user, ally)` (pure) → `{x, y}` | null: where Fae Blink would put the ally.
- Constants `ROAST_MAX` (3), `EMO_HYPE` (6), `EMO_WEAK` (2), `MIX_HYPE` (4).
- The `syl_glitter` surface is usable by anyone (`DD.Act.setSurface(x, y, 'syl_glitter', turns)`).
- Removed in v2: `DD.Syllamin.heckleCandidates`, `HECKLE_KILL_HYPE`, status `syl_heckled` (nothing outside his files used them).

## Tests

`tests/content/hero_syllamin.js`, 22 suites (~2,600 assertions, ~2 s isolated):
- **hero def / kit shape**: stats (init +4, no starting Block in a fight), pool 10 = the documented kit, kinds (exactly
  the five spells), every desc at every level (with and without a user) shows its damage, ≤ 26 words, no if/else
  clauses, no telegraph / intent / Guard wording anywhere (role, blurb, passive, descs, items, barks), he/him, barks
  (4-6 per key, ≤ 70 chars, ≥ 8 heroes named incl. all six new ones, every named hero with the right pronouns, bleeped),
  no hidden `noProvoke` / `noOpportunity` flags, the passive is one hook, Roasted has no hidden damage change, Glitter is
  slippery only, items have no Block / Guard / combat-start hooks, the sprite paints without warnings.
- **Heckler**: 5 per joke, Roasted 1-2-3, a Roasted foe still deals full damage, meltdown = stacks clear + Stun 1 turn +
  exactly 6 Hype + a log line; the stunned grunt next to him loses exactly its next turn ("loses the turn (Stunned)")
  and stabs again the round after; stacks stick for rounds; two meltdowns in a turn pay twice; allies never Roasted
  (by a hit or by the public `DD.Syllamin.roast`); bumps don't Roast; elite and boss Weakened for exactly 2 of their
  turns; a stun-immune foe: no stun, stacks cleared, Hype paid, no warnings.
- **Targeting**: every targeted skill's [min, max] range at every level and its line-of-sight rule (the table above),
  and the "up to 5 tiles away" edge of Hype Man and Encore (5 in, 6 out).
- **Every pool skill at every level**: the exact desc string, AP, cooldown / charges, numbers, and the durations in own
  turns through real turn flow — Heckle's charmed grunt stabs its own friend on its turn and the charm ends with that
  turn; Power Ballad on the knight (whose turn comes later the same round) and on himself (fresh: through his next
  turn); Hype Man's AP banked (`apBank`) then spent on the knight's turn, Empowered 5 → 8, cooldown 1 = usable every
  other round; Shriek pits (YEET +20 Hype), lava, water (Wet), map edge bump, Glitter slide, kills not pushed, a row
  of two both pushed (the far one moves first: no bump); Glitter Bomb lasts exactly N rounds, doesn't cover oil, a
  Dazzled grunt misses the cleric then hits the next round; Lullaby sleepers skip 1/2 turns, damage wakes, Marked +3 at
  III; Encore makes the knight's bash usable on his next turn (+1 AP at III), 2 charges, and refuses (I-II) a bash that
  is ready by the knight's next turn anyway; Fae Blink's Block survives the grunt's turn and ends at the ally's own turn
  start, it lands next to him but never in the fire even when that tile is nearest, and a ring of pits leaves no target;
  Mosh Pit pulls, bumps, the centre stays, kills are not dragged, a foe dragged across a pit falls in (YEET) and one
  dragged onto lava burns, around a pit the crowd gathers at the edge (then Shriek shoves one in); Mic Drop: no splash,
  Stun costs exactly one turn, once per combat, over walls, Stuns an elite and **interrupts the fixture boss's
  wound-up meteor** (`windup:cancel`).
- **Combos**: Mosh Pit + the mage's fireball, Glitter + the knight's Shield Bash, Hype Man + the knight's slash.
- **Attacks of opportunity**: he never makes one (ranged basic); flying off a grunt provokes exactly one stab (the move
  preview `Combat.provokes` says so, 4 damage, no undo) and his walk goes on; stepping next to a foe never provokes; the
  Jacket's comeback Roast on an attack of opportunity (and a meltdown at 2 Roasted); Fae Blink pulls the cleric out
  from between two grunts with no attack (a walk would have provoked both); Shriek pushes the grunt off him, then he
  walks for free; Mosh Pit drags a grunt off the knight without a free slash; Sleep / Dazzle / Charm / Stun each switch
  the foe's attack of opportunity off (real moves, on his turn and on the cleric's), the sleeper pins again once its
  turn is slept away, and a charmed grunt stabs its own friend walking away from it.
- **Signature**: 99 Hype refused, 3 × 4 to every foe, mass meltdown (grunts Stunned, the boss Weakened), Hype after =
  4 × 6 + 4, allies untouched, kills mid-track, a foe that shows up after verse 1 hears verses 2-3, Silenced.
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
  no timeouts, no warnings, he has an initiative entry and gets his turns, uses many skills (last run: 12/12 won,
  11 meltdowns, 7 pool skills used), Emotional Damage happens, the party wins. Plus a decision test: AutoPlay heckles
  the tanky grunt standing next to a wounded cleric.

Last full `tools/test.sh` (v2 review, 2026-11-03, all 16 heroes loaded; only `tests/balance_tests.js` missing): 788
suites, 20 failing sections, all in areas still in flight:
- `bosses_act1` (17): the Grimble and Rat King suites still call the removed `DD.AI.plan`.
- `integration` (3): the old unlock expectations and "ten real heroes"; the "no XP" wording of the Objective Failed
  step; and the campaign smoke test's "seed 0: real fights were played (4)". In that last one the Josiah / Zarathor /
  Marbles / Syllamin party loses at Grimble after 4 fights. It fails identically with this review's two Syllamin changes
  reverted (`.tmp/syl-rev3/mut/prereview.js`), and it passed one run earlier, before other authors' edits to Josiah,
  the Rat King and others landed.

Every `hero_syllamin:` (22) and `content:` (8) suite passes, and there are no swallowed "Error in …" warnings anywhere
in the run. (The AoO pass before it: 694 suites, 73 failing sections, in the same kind of in-flight areas.)
Looks re-checked in game (`.tmp/syllamin/g3.png` gallery, `look_mosh.png`: the armed Mosh Pit previews "−3" on both
foes and "+10 Hype" = multi-hit 4 + a Roasted-2 grunt's meltdown 6; `look_aoo.png`: a move off a grunt).

An earlier interrupted pass had left two failing Mosh Pit asserts (foes next to the target tile "pulled into" a pit /
lava centre); the engine's pull never enters the target tile, so the desc became "up to" and the tests now cover the
real hazard play (dragged across a pit / onto lava, gathered at a pit's edge, then shoved in).

## Deviations

- **Pool 10** (DESIGN v2 says 8-10; the generic registry suite still asks 9-11).
- **Roasted does not decay** (as in v1) and is a pure countdown in v2: the −1 damage per stack was a hidden second effect.
- **Emotional Damage Weakens elites** (not just bosses) for 2 of their turns, so three 1-AP jokes a turn can't stun-lock
  an elite. A stun-immune normal foe gets the engine's "Immune!" (none exist outside elites/bosses today).
- **Power Ballad is a spell** (v1: a buff blocked by a custom `canUse`): Silence now works through the engine rule.
- **Ally-buff targeting guard**: Hype Man and Encore refuse a stunned / sleeping / sheep ally (the AP would be wasted: a
  stunned hero's banked AP is consumed by the lost turn); Encore I-II also refuses an ally with no cooldown still
  running on its next turn (review v2: a cooldown that ends at that turn's start anyway no longer counts). Fae Blink
  can rescue anyone.
- **Diss Track's verses** each hit every foe on the board at that moment (review v2), not just the ones there at the
  cast: a slime split by verse 1 or a reinforcement hears the rest of the track, as "every foe … per verse" says.
- **Glitter** never covers another surface (keeps allies' oil and water combos); the desc says "(not over other surfaces)".
- **Mosh Pit never pulls onto its target tile** (the engine's `Act.pull` stops next to the point), so a Mosh Pit centred
  on a pit or lava gathers foes at its edge instead of dropping them in; foes dragged *across* a hazard on the way still
  fall / burn. The desc says "pulled up to N tiles". (A test left by an interrupted earlier pass expected foes next to
  the centre to be pulled into it; that would have been a hidden 1-AP mass YEET, so the test was corrected instead.)
- **No attack-of-opportunity flags** on him (`noProvoke` would be a hidden second rule): he escapes pins with his skills.
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

- **RULES (cosmetic, optional)**: `js/engine/ai.js` ~line 152 — the `telegraphFlat` comment cites `syl_roasted (−1 per
  stack)` as its example; in v2 Roasted has no damage change, so the example is stale (the mechanism is fine).
- ~~HUD: move hover "⚔ provokes N"~~ — done by the HUD (review v2, checked in game: "⚔ Provokes 1 attack of
  opportunity: Test Grunt 4 (Stab). Can't be undone." plus an "Engaged: Test Grunt 4" chip on his card).
- **RENDER-WORLD (optional, repeat from v1)**: unit-behind-unit silhouettes. At scale 0.7 (hover 20) he clears a medium
  unit in front of him, but a large one (Marwyn, Slate, Betty) still hides everything but his mohawk tip and HP bar.
- **Lead / DESIGN §6 Syllamin brief**: it still says "Role: support / debuff / telegraph manipulation" and "Heckle
  (redirect an enemy's intent onto another enemy)". v2 kit: "crowd control", Heckle = damage + Charm; Mosh Pit could be
  listed (it is the kit's clustering setup).
- **RULES (registry suite)**: `content: registry cross-references` still asks 9-11 pool skills (DESIGN v2: 8-10).
- ~~NARRATIVE: `ev_syl_rap_battle` duet grants XP~~ — done (review v2: the duet is now a level-up through the rotation
  + 10% max HP for the mosh pit; the rest of the event still fits his v2 kit).

## Known issues

- AutoPlay rarely plays the pure-support skills (Glitter Bomb, Encore, Fae Blink): their value (pushes sliding further
  for allies, an ally's big cooldown back, a rescue, unpinning) is mostly outside its generic model, and in the short
  fixture fights a 1-AP joke usually wins the comparison. They work and are tested; a human plays them.
- Charmed bosses follow the engine's charm (they attack their own side on their turn); the real bosses' own stun / charm
  guards decide whether Heckle lands.
- At scale 0.7 he can still be hidden by a large unit standing directly in front of him (see Requests).
- The overlay copies the humanoid painter's `tiny` head geometry (radius 9.4 × head size, shoulders at −12.5); if
  RENDER-SPRITES changes those constants, the mohawk, ears and bolt will drift.

## Balance (v2 + attacks of opportunity)

Scratch sim (`.tmp/syllamin/bal_suite.js`, run with `.tmp/syllamin/page.sh bal "suite=syl_balance&n=2&who=…&verbose=1"`):
every real encounter (39) × 2 seeds, AutoPlay v2, party = the hero + `test_knight` + `test_cleric` + `test_mage`, level 2
in act 1, 3 in act 2 (4 at its bosses), 5 in act 3; loadout = the two starters + 0 / 1 / 2 rotated pool skills (level I,
II at L5). Same seeds for every hero. Run 2026-11-03 on the current content of every area (attacks of opportunity and
reach-aware targeting in; the other heroes mid-conversion, so their numbers will move; output `bal_aoo_all.txt`):

| hero in slot 1 | won / 78 | downs / fight | own dmg / fight | Hype / fight |
|---|---|---|---|---|
| **Syllamin** | **68** | **1.53** | 47.4 | 67.9 (1.51 Emotional Damage / fight) |
| Ellaria | 68 | 1.47 | 36.7 | 73.5 |
| Josiah, Kiri | 63 | 1.78, 2.00 | 30.5, 58.3 | 61 |
| Slate, Betty | 62 | 2.19, 2.24 | 41.4, 31.4 | 65–68 |
| Zarathor, Marbles, Buga | 61 | 1.88–2.28 | 35–46 | 58–65 |
| Sparrow, Corelos | 59 | 2.42, 2.22 | 36.0, 48.8 | 60–62 |
| Marwyn | 58 | 2.09 | 28.1 | 65.3 |
| Basanos | 55 | 2.79 | 28.6 | 58.6 |
| fixture stand-in `test_rogue` | 52 | 2.79 | 32.6 | 61.3 |

- Before attacks of opportunity (2026-11-01, same seeds): Syllamin 66/78, the stand-in 51-53, the pack 52–69.
- Tied top with the other control/support hero (Ellaria), +7 over the 13-hero median (61): about 2 SE on 78 fights
  (±3.5), the upper end, not an outlier. Normal and elite fights are near-certain wins; bosses are where everyone
  loses (his 3/10: Grimble 1/2, Lich-tenstein 1/2, the DM 1/2; Dr. Iris 0/2 and the Rat King 0/2 for him like for
  almost everyone). Bosses treat a charm like a stun (their stun guards), so Heckle doesn't trivialise them.
- AutoPlay's uses (his 78 fights): basic 673, Heckle 94, Power Ballad 72, Hype Man 46, Lullaby 18, Glitter Bomb 7,
  Shriek 6, Diss Track 5 (Encore, Fae Blink, Mosh Pit and Mic Drop were not in those rotated loadouts; see Known issues).
- No number changed in this pass (the user's latest feedback is that the game is too hard, and he is within the pack).
  Levers if he plays too strong with humans, in order: Heckle cooldown 2 → 3; `EMO_HYPE` 6 → 4; last resort, Emotional
  Damage Weakens normal foes too (ends the three-jokes stun on normals, but it is his comedic core).

**Re-run by the v2 review** (same harness and seeds, through `.tmp/syl-rev3/bal.html`; all 16 heroes now exist, and the
enemy / boss areas have been retuned since, so every number rose; output `.tmp/syl-rev3/bal_base.txt`):

| hero in slot 1 | won / 78 | downs / fight |
|---|---|---|
| **Syllamin**, Ellaria | **75**, 75 | **0.99**, 0.73 |
| Slate, Josiah | 73, 72 | 1.59, 1.21 |
| Pebbles, Sparrow | 71, 70 | 1.63, 1.69 |
| Kiri, Zarathor, Marbles, Corelos, Marwyn | 69 | 1.33–1.68 |
| Betty, Valdris, Hjalmar | 68 | 1.60–1.85 |
| Basanos | 67 | 1.96 |
| `test_rogue` (stand-in), Buga | 66, 65 | 2.15, 1.60 |

- Still tied top with Ellaria: +6 over the 16-hero median (69), and the second-fewest downs. Bosses: 8/10 now (Grimble
  1/2, Rat King 1/2, Lich-tenstein, Dr. Iris and the DM 2/2).
- **Heckle cooldown 3** (the first lever), same seeds: 75/78, 0.99 downs — no change at all (Heckle uses 96 → 87). In
  4–9-round fights a cooldown of 2 or 3 gives the same two or three heckles, so that lever is weak; his edge is the
  stream of Emotional Damage stuns from 1-AP jokes plus Power Ballad / Hype Man on a fixture party. Kept at 2: no
  measurable balance gain, and the starter is his fun. Next lever if humans find him too strong: `EMO_HYPE` 6 → 4
  (fewer party signatures: the Hype is shared), then `ROAST_MAX` 3 → 4 (fewer meltdown stuns).

## Review (v2) — adversarial review of the v2 + attacks-of-opportunity pass (HERO SYLLAMIN REVIEWER role, 2026-11-03)

Scope: the files above. I ran probes, 43 mutants, a 16-hero balance re-run, screenshots and full runs; scratch in
`.tmp/syl-rev3/` (see the top of this file).

### Verified (by running code)

- **desc == effect at every level** for the basic, the 10 pool skills, the signature, the passive and the 3 items:
  exact desc strings, numbers through real turn flow, previews exact against reality (every skill and level, up to 4
  targets, with and without items).
- **v2**: no intents, telegraphs, Guard, XP or combat-start Block anywhere (code grep and the suite); `stats.init` 4,
  `unlock: null`; durations count his foes' own turns. A grunt Heckled after its own turn this round stays Charmed through
  its turn next round, stabs its friend then, and makes no attack of opportunity on the knight walking off it meanwhile.
- **Attacks of opportunity**: his ranged basic never strikes; walking off a melee foe provokes him, and the HUD now says
  so on hover ("⚔ Provokes 1 attack of opportunity: Test Grunt 4 (Stab). Can't be undone." plus the "Engaged" chip, shot
  `look_aoo_hover.png`). Charm, Sleep, Stun and Dazzle switch a foe's attack off. Shriek, Mosh Pit and Fae Blink never
  provoke. A downed ally is not a target for Fae Blink, Hype Man or Encore. A Charmed Syllamin can only aim at his
  charmer (for 0), never at an ally.
- **Simplicity (DESIGN §6)**: every desc is 11–25 words (the suite caps them at 26), one verb plus at most one rider; the
  longest are the ones that spell out Charm, Empowered or Encore III's AP. Level III adds at most one
  rider (Lullaby: Marked 3; Encore: +1 AP). The passive is one hook and one rule, and it is still the joke (Roasted →
  EMOTIONAL DAMAGE).
- **Identity and distinctness**: I dumped all 16 kits (`probe_dump.js`). He is the only hero with a countdown debuff
  that pays off (Roasted → Emotional Damage), the only one with a cooldown reset (Encore), and the only one who teleports
  an ally to himself (Fae Blink). Two overlaps come straight from DESIGN, so I kept them: Power Ballad reads word for
  word like Basanos' Howl, and Hype Man ≈ Buga's Campaign Promise + Butter Up. Heckle is one of four charms, and the
  only one with damage, range 4–5, no cost, cooldown 2, and no "not a boss" clause. The bosses' own stun / charm guards
  (Grimble, the Rat King, Lich-tenstein, Dr. Iris, the DM) already handle charm.
- **Combos with the real 15** (not only fixtures):
  - Pushes slide on Glitter: Marbles' Whack, Kiri's Banishing Shot, Betty's Ramming Speed, Valdris' Hammer of Faith,
    Corelos' Restraining Order, Hjalmar's Spring Glove, Basanos' Shoulder Check, Pebbles' Big Wag.
  - Area attacks land after a Mosh Pit: Zarathor's fireball, Kiri's Haunted Volley, Sparrow's Paper Cuts, Josiah's
    flask, Betty's Stomping Grounds.
  - Sleep and Emotional Damage stuns set up Betty's Kick 'Em While They're Down (10 against a sleeping or stunned foe).
  - Hype Man feeds the big hitters.
- **Visuals**: every pose at scale 4 (`poses.png`: the mohawk, ears and bolt overlay follow the head, including
  downed), the gallery (`gallery*.png`), the staged board (Glitter, Roasted chips, charmed / asleep / dazzled foes), and
  Diss Track mid-cast (`look_diss.png`). No console errors from his files.
- **Mutation testing** (`mut_results*.txt`): 43 mutants of `syllamin.js`. The shipped suite killed 27 of the first 40.
  After this review 39 of 43 are killed. The 4 survivors behave exactly like the original:
  - Mosh Pit pull +1: at radius N + 1 a pull of N already brings every foe next to the target tile.
  - The passive's hostility check: `roast()` checks it again.
  - Fae Blink's drop check: `Grid.isFree` already refuses pits and deep water for a ground ally.
  - The Electric Lute's water check: only water reacts to lightning.

### Fixed (each with a regression test that fails on the old code)

1. **Diss Track skipped foes that appeared mid-track.** It was 'every foe' only at the moment of the cast: a Sewer
   Slime killed by verse 1 split into two Slimelets that verses 2–3 never touched (probe `probe2.js`). Now each verse
   hits every foe on the board at that moment (`verseFoes`, the same `all_foes` area). Test: a grunt that shows up when
   verse 1 kills its friend takes verses 2–3 (8 damage, Roasted 2). Mutant m43 (the old list) fails it.
2. **Encore could waste a charge.** It accepted an ally whose only cooldown would end at its next turn start anyway (a
   cooldown 1 started before the ally's last turn). Now I–II count only cooldowns still running on its next turn (`cd >
   1`, or `cd > 0` when fresh: a fresh cooldown skips its next tick) and say "Its skills are ready by its next turn
   anyway."; III still targets (+1 AP). It is tested in real turn flow (the knight's bash in rounds 1–3). Mutants m41
   (the old rule) and m42 (ignoring `fresh`) fail. The preview arena's "something to encore" is now a cooldown of 2.
3. **Test gaps found by surviving mutants, now covered:**
   - Shriek's far-first push order: a row of two foes, both pushed, no bump between them. Without it the front foe
     bumps and stays, contradicting "push them 1 tile away".
   - The public `DD.Syllamin.roast` refusing an ally.
   - Fae Blink avoiding fire even when the burning tile is the nearest (the old test's tie-break hid it), and a ring of
     pits leaving no target.
   - A new suite, "targeting": every targeted skill's range and line of sight at every level.
   - The "up to 5 tiles away" edge of Hype Man and Encore (5 in, 6 out).

### Not changed (checked, on purpose)

- **Heckle's cooldown 2.** It is shorter than the house pattern for "it loses its turn" skills (3 / 3 / 2). But the
  first balance lever, cooldown 3, measured exactly 0 difference: 75/78 and 0.99 downs on the same seeds (see Balance).
  It is his starter and his fun, so it stays.
- **Glitter on shallow water, and area skills aimed at a wall tile** (they reach foes behind it). Both are engine-wide
  targeting and surface rules, not his.
- **No `noProvoke` for the faerie.** The rules suggest it for faeries, but it would be a hidden second rule; he gets
  away with his control skills instead.

### Requests (still open; details under Requests above)

Lead (the DESIGN §6 brief still says "telegraph manipulation"), RULES (the stale `telegraphFlat` comment and the 9–11
registry pool count), RENDER-WORLD (silhouettes). The HUD and NARRATIVE requests are done.

### Known issues

Unchanged (see Known issues above). Also: Diss Track's preview can't list foes that only appear mid-track (the engine
previews units that exist). Fights where something splits or spawns are already "uncertain" previews.

## Requests (Nov 3) — flyers, barrels (CONTENT SWEEP heroes-1, 2026-11-04)

Suite: `hero_syllamin: v2 requests — …`. Rules: `docs/notes/rules.md` "v2 requests".

- **Flyers.** He is a born flyer (`flags.flying`): fire, poison, web, holy ground and his own Glitter no longer touch
  him (entry, turn end, pushes; no hazard shading); clouds (steam, smoke, Plague Miasma) still do. Glitter desc is exact
  now: "a grounded unit pushed onto it slides 1 extra tile (flyers just glide over)" (the engine's slide always skipped
  flyers). Fae Blink's landing tile reads `hazardAt(x, y, ally)` per unit (unchanged).
- **Barrels.** Your Mom Joke (basic) and Mic Drop (3 AP, once per combat, no line of sight) can set one off. Kept:
  dropping the mic on a barrel is the most Syllamin thing possible. A blast is not his words: it adds no Roasted stack.
- **Heals.** None.
