# hero-slate — notes

Files: `js/data/heroes/slate.js`, `tests/content/hero_slate.js` (suites `hero_slate: …`). Scratch: `.tmp/hero-slate/`
(sprite sheet `spr.html`, portrait framings `portrait.html`, HUD scenes `scene.html?scene=rage|throw|tantrum`, balance
sim `sim.html`, screenshot helper `shot.sh`).

Isolated runs: `bash tools/test.sh "suite=hero_slate&isolate=heroes/slate,hero_slate"` (22 suites) and
`bash tools/test.sh "suite=content:&isolate=heroes/slate,hero_slate"` (the generic content suites).

## Summary

**Slate, the Unamused** (`slate`) — Stone Golem, Guardian (Retired). Lich-tenstein's library golem who quit after nine
hundred years of shushing. Unlock `{ boss: 'lichtenstein' }`. HP 32 (+4/level), AP 3, move 3, armor 1,
`flags.immovable`. Role: grappler / thrower / bruiser, complexity 3. Accent `#6fd3e6`.

**Passive — Short Fuse.** Rage (`sla_rage`, 1-5 stacks) +1 whenever he takes damage (even fully Blocked), when a foe
hits an ally standing next to him (fight-wide rule `sla_short_fuse`, HUD chip "💢 Short Fuse"), when an ally heals him
or gives him a buff ("Did I ASK?") and at the start of his turn if a foe is next to him. Every fight starts at 1 Rage
(kept through the first round). At 3+ Rage his runes **flare** (sprite + aura) and skills gain their "Rage 3+" riders.
After a full round with nothing to grumble about he loses 1 Rage at the end of his turn. Some skills spend Rage (Blow a
Gasket), the signature maxes it.

| id | name | AP / cd | what (L1 → L3) |
|---|---|---|---|
| `sla_love_tap` (basic) | Love Tap 👊 | 1 | 5 dmg melee (7 at Rage 3+) |
| `sla_hold_still` ★ | Hold Still 🤼 | 1 / 3·2·2 | 3/4/5 dmg + **grapple** 1/1/2 turns: intents cancelled, rooted, dragged along; Rage 3+: crush 2/3/4 per turn |
| `sla_personal_space` ★ | Personal Space ✋ | 2 / 1 | **throw** the adjacent foe/object 3/3/4 tiles (+1 at Rage 3+): 6/8/9 dmg, crash victim takes the same (collision), pits/deep water YEET, objects shatter (barrels explode, kegs flood); Rage 3+: crash stuns |
| `sla_rocks_fall` | Hard Pass 🪨 | 2 / 2 | lob a boulder 5/5/6 tiles, no LOS: 7/9/10 dmg; leaves a throwable **Boulder** on empty floor; Rage 3+: 3/4/5 splash to adjacent foes (id kept from its first name, "Rocks Fall") |
| `sla_air_mail` | Air Mail 📦 | 1 / 2·2·1 | throw the adjacent ally 3/4/4 tiles (+1 at Rage 3+) onto a safe empty tile: +4/5/6 Block, 3/4/5 dmg to foes next to the landing |
| `sla_foot_down` | Putting My Foot Down 👣 | 2 / 2 | cone 2/2/3: 4/5/6 dmg + push 1/2/2; Rage 3+: the floor cracks into rubble |
| `sla_lawn` | Get Off My Lawn 🏡 | 1 / 2 | +1 Rage, +3/5/7 Block, shove adjacent foes 1/1/2, then Taunt foes within 2/2/3 (shoved melee foes' attacks cancel at once) |
| `sla_rock_bottom` | Rock Bottom 🙃 | 2 / 2 | suplex an adjacent foe onto the tile behind him: 8/10/12 (11/13/15 if held, still held); pit behind = YEET; Rage 3+: stun |
| `sla_gasket` | Blow a Gasket 💢 | 2 / 3 | spend ALL Rage: 3/4/5 + 2 per Rage to every foe in the 8 tiles around him; L3 heals 2 per Rage (spell) |
| `sla_get_over_here` | Get Over Here ⛓️ | 1 / 2 | rune-chain pull in a straight line 4/5/5: 2/3/4 dmg, yank adjacent; L3 also grabs it (not bosses / stun-immune) (spell) |
| `sla_rooted` | Rooted in Tradition 🗿 | 2 / 3 | +10/12/15 Block, Thorns 2/3/4 (doubled at Rage 3+) for 2 turns, adjacent allies +4/5/6 Block, rooted this turn |
| `sla_tantrum` (signature) | Tectonic Tantrum 🤬 | 2 + 100 Hype | +5 Rage, 15 dmg to every foe within 2, each thrown 2 tiles outward; crashes 4 to both |

★ = starting skills. Pool (10): hold_still, personal_space, rocks_fall, air_mail, foot_down, lawn, rock_bottom, gasket,
get_over_here, rooted.

Statuses: `sla_rage` (buff, stacks, never decays), `sla_grappled` (debuff on the victim, turnEnd decay, hooks: crush +
cancel at its turn start, release on its last turn end / separation / death), `sla_grappling` (buff on Slate,
`data.victimId`). Object: `sla_boulder` (Boulder: blocks movement, 5 HP, `smashable`, `throwable`, custom iso painter).
Items (hero `slate`): `sla_mitts` Mitts of Unreasonable Velocity (rare weapon: +10% dmg, throws +1 tile, every thrown
hit +2), `sla_cardigan` Cardigan of Disapproval (rare armor: +6 HP, 2 Block per Rage gained), `sla_ledger` The Grudge
Ledger (legendary trinket: +10% dmg, starts combat at 3 Rage (tops up the passive's 1), Rage never drains). Narration: 3
`tips` lines.

Sprite: `base: 'custom'` painter (`scale 1.15`, ~48 px at zoom 1): hunched pale-blue (`#9fb7c9`) stone slab, little head
with a cliff-ledge V brow, glowing slit eyes, frown crack, moss, cracks, gorilla arms with huge fists; carved rune lines
dull at Rage 0, faintly lit at 1-2, bright cyan at 3+ with a back glow, orbiting rune glyphs and steam out of his head.
Poses: overhead smash (attack), both arms up (cast), flinch (hurt), arm reaching forward while grappling, stride on walk,
X eyes when downed. Portrait framed on the face. Barks: 13 keys × 5-6 lines (≤ 70 chars), naming Josiah, Marwyn,
Zarathor, Syllamin, Marbles, Ellaria and Buga.

## Public API

- `DD.Slate` (attached at load, runtime use only): `RULE` (`'sla_short_fuse'`), `rage(u)`, `flared(u)`, `gainRage(u, n)`,
  `spendRage(u, n?)`, `heldBy(slate)`, `holderOf(victim)`, `grab(slate, victim, turns, crush)`,
  `release(slate|null, victim|null, text)`, `flight(from, dir, n, mover)` (pure: where a thrown thing lands),
  `throwUnit(user, unit, dir, n, opts)`, `throwObject(user, at, dir, n, opts)`, `objThrowable(obj)`.
- Rule `sla_short_fuse` (💢 Short Fuse, installed once per fight by the passive's `onCombatStart`): its `onTakeDamage`
  gives +1 Rage to every active Slate standing next to the target when a foe hit that ally (not status ticks, floors or
  friendly fire).
- **Throwable objects**: crate, barrel, barrel_explosive, keg, mushroom, coffin, candles, brazier, sla_boulder, plus any
  object def or instance with `throwable: true` (`throwable: false` opts out). The `protect` objective's object never.
  Thrown objects shatter where they land (they are placed non-blocking and destroyed, so `onDestroyed` fires there).
- Bosses (`tier: 'boss'`) and `stunImmune` units can't be grappled; bosses and `immovable` units can't be thrown or
  suplexed (they still take the damage). Get Over Here is an engine pull, so like every hero's pull it yanks a boss that
  is not flagged `immovable` (Grimble, Lich-tenstein) but never holds it. Immovable non-boss foes can be held but not
  dragged.
- Statuses `sla_grappled` / `sla_grappling` and the `sla_boulder` object are safe for other content to read.

## Deviations

- The grapple also gives the victim a core `root` (turns -1, removed on release) because root is the only thing the AI
  planner respects to stop planning-time movement. Its intents are cancelled at the start of Slate's turn (after enemy
  planning) and again at the victim's turn start; a teleporting planner breaks the hold (separation check). A root
  another hero puts on the victim (before or during the hold) merges into the hold's root: `sla_grappled.data.root`
  remembers `{ turns, source }`, ticks it down as it would have, and the release gives it back.
- Short Fuse's "an ally next to him is hit" trigger is a fight-wide rule (`sla_short_fuse`): rules are the only hook
  source that sees damage to other units. It shows as a HUD rule chip, like Josiah's Contagion and Buga's Civic Fee.
- Throws into pits / deep water put the unit on the drop tile (`unit.x/y`, then `DD.Act.touch()`) and hand it to
  `DD.Act.fall` — `DD.Act.teleport` refuses non-walkable tiles. Same for Rock Bottom over a pit.
- Crash damage uses `cause: 'bump'` (environmental, as the engine's push bumps): a crash kill gives +20 Hype. Because
  environmental damage skips outgoing modifiers, the Mitts' +2 for crashes is added in Slate's code.
- `spendRage` lowers `st.stacks` directly (the same pattern the core burn/poison statuses use for stack decrements).
- Rage bookkeeping lives in `unit.data.slaAnnoyed` / `slaDragged` (copied by previews like all unit data).
- DESIGN §6 merged: Stone Skin + Bedrock → Rooted in Tradition; Toss a Friend → Air Mail (Marwyn already has a
  "Fastball Special"); added Get Over Here (rune-chain pull) as the positioning/combo tool. Hard Pass (DESIGN's Rock
  Toss) leaves a Boulder instead of rubble behind him; the stomp makes the rubble.

## Core fixes

None. (The `content:` registry check for `unlock: { boss }` was already fixed by hero-buga.)

## Requests

- **RULES**: a status-def flag (e.g. `holds: true` / `noMove: true`) that the AI planner and `Combat.reachable` treat
  like `root`, so a grapple doesn't need a hidden root (and the root vines on the held foe's sprite).
- **RENDER-SPRITES** (optional): skip the root-vines status visual when a unit also has `sla_grappled`.
- **Narrative** (optional): Slate-flavoured lines for `env_kill` ("…has hit Rock Bottom") / `level_up` would be fun; an
  event "Slate and the noisy kids" or "the sculptor who wants to fix him" is listed in DESIGN §11.

## Known issues

- A grappled foe shows the Rooted chip and root vines besides Grappled (see Requests).
- AutoPlay can't value cancelled intents or grab → throw combos, so in sims Slate leans on Love Tap / Personal Space /
  Hard Pass (it plays him at range: only 5-18% of his turns start next to a foe); it does find pit throws and fires the
  Tantrum at 100 Hype (tested). Played at range he calms down, which is the passive working as written.
- Air Mail's landing filter is the engine's `empty` (ground rules): flying allies can't be mailed onto a pit tile.
- In the shared `content:` arena the "ally" stands west of Slate with no foes near its landing tiles, so Air Mail's thud
  never lands there; its damage key is `thud` (not `dmg`) on purpose to avoid a misleading advisory.
- `content:` advisory "sla_gasket L1 dealt a base 7 (level numbers {dmg 3, per 2})": expected. The arena Slate holds
  2 Rage (starts at 1, a foe next to him), and Gasket deals `dmg + per × Rage` (3 + 2 × 2); the check can't know that.
- Throws ignore elevation: a thrown foe, object or ally flies over a 2+ level cliff and may land on top of it (about 1
  map in 5 has such steps, max height 3). Simple and previewed exactly; walls and tall objects still stop it.
- Hold Still holds elites (only bosses and stun-immune foes slip): at III it locks one for 2 turns out of every 3 for
  1 AP. Strong, but it is his identity skill and he must stay next to it; watch it if elites get too easy.
- His Rage riders read the Rage at the moment of use: Rage gained mid-skill (a barrel exploding next to him) doesn't
  turn on that skill's rider.

## Balance (AutoPlay sims, `.tmp/hero-slate/sim.html`, real encounters landed so far)

- Normal difficulty, acts 1-3 normal+elite, 2 seeds each, party Slate + Marwyn/Syllamin/Ellaria vs Zarathor + same:
  both 22/22, 24/24, 22/22 wins; rounds 4.5 / 5.3 / 6.3 vs 4.2 / 4.3 / 6.0. Slate dmg/fight 29 / 44 / 43 (Zarathor 48 /
  71 / 55, Marwyn 12-25, Ellaria 15-28).
- Brutal incl. bosses, Slate + Josiah/Sparrow/Marbles vs Corelos + same: 26/26, 28/28, 23/24 vs 26/26, 27/28, 24/24.
- Fixture AutoPlay battery (tests): 36/36 wins at L1/4/7/10, 9-10 distinct Slate skills used.
- Read: a control bruiser — middle-of-the-pack damage, wins at the same rate as DPS picks; real enemies currently deal
  very little damage (their own suites flag it), so survivability numbers aren't meaningful yet.
- After the review (see Review below for the Rage numbers): same win rates; Slate dmg/fight 32 / 45 / 42 (default kit)
  and 31 / 54 / 51 (melee kit) vs Zarathor 52 / 95 / 60; brutal + bosses 25/26, 27/28, 24/24 vs Corelos 26/26, 27/28,
  24/24, Slate dmg 30 / 50 / 46 vs Corelos 51 / 76 / 68.

## Review (adversarial reviewer; the first review session was interrupted, this one finished it)

Changed, most important first:

1. **Short Fuse ramp (identity).** Rage at Slate's turn starts in AutoPlay sims on the real encounters
   (`.tmp/hero-slate-review/sim2.js`, normal, acts 1-3 normal + elite, 2 seeds): the runes were flared on only
   12% / 27% / 33% of his turns (acts 1 / 2 / 3, default kit) and 21% / 21% / 43% with a melee kit, mostly from round 4
   on. The blurb promises they are "basically always on" and the brief says he "can rage to flare his runes". Now:
   - +1 Rage at the start of his turn when a foe is next to him (added by the first review session; a held foe counts,
     so grappling feeds Rage);
   - every fight starts at 1 Rage ("somebody woke him up"), kept through round 1;
   - DESIGN §6's missing trigger: +1 Rage when a foe hits an ally standing next to him (rule `sla_short_fuse`; not status
     ticks, floors or friendly fire). The Grudge Ledger tops him up to exactly 3.
   After: flared on 48% / 43% / 51% of his turns (default kit) and 58% / 55% / 77% (melee kit), usually by round 2-3 once
   he is in the fight. Win rates are unchanged and his damage barely moves, because the riders are mostly control (stuns,
   range, rubble). Played at range with nobody buffing him he still calms down (brutal, Josiah/Sparrow/Marbles: 5-29%).
2. **A hold wiped other heroes' roots** (fixed by the first review session, regression-tested now): releasing a hold
   removed every root on the foe, including a 2-turn root a teammate had put on it. The held status now remembers that
   root and gives it back with the turns it has left. New suite "a hold keeps (and gives back) other heroes' roots".
3. **Name clash, then a tone problem.** "Rocks Fall" is the Dungeon Master's attack and final phase (`dm_rocks_fall`,
   `dm_tpk`), so the first session renamed it "Hostile Architecture" 🧱. That phrase mostly means anti-homeless design,
   which DESIGN §2 rules out (no punching down, no real-world politics), so it is now **Hard Pass** 🪨 ("Someone asked him
   to pass the rock. He gave it a HARD pass."). The id `sla_rocks_fall` stays (saved runs). New test: none of his
   skill names is shared with another skill.
4. **Get Over Here III** promised "Then grab it" but bosses and stun-immune foes slip the grab: the desc now says so
   (tested: a boss is yanked over, like by any hero's pull, but never held).
5. **Personal Space II** 7 → 8 damage: +1 was the weakest upgrade in his kit (DESIGN §5: level II ≈ +25%).
6. Texts: the passive desc lists every trigger and the starting Rage without getting longer; Rage status desc; the
   loading tip no longer claims "every skill gets nastier" (4 of his skills have no Rage rider); notes corrected
   (bosses can be yanked by Get Over Here; suite count; balance).

Verified by running: isolated `hero_slate` 22/22 and `content:` 8/8; a fuzzer over all 12 skills on random boards (pits,
lava, water, walls, objects, allies, bosses and brutes, items, Rage 0-5, held foes): about 12,800 uses over 6 seeds,
previews exact (HP, KO, moved, Hype), no overlapping units, nobody left on an unwalkable tile, no orphan hold or stray
permanent root, no swallowed errors; every desc at every level read against the code; barks 13 keys × 5-6 lines ≤ 70.
Visuals: gallery, hero lineup and combat on cellar wood, academy stone and the graveyard. He is the only stone silhouette
and the only pale-blue palette in the cast. He reads clearly on brown floors; on grey stone the contrast is lower but
the dark outline carries it. The flare (cyan runes, back glow, orbiting glyphs) is visible at zoom 1.
Full run: 497 suites, 4 failing sections, all `bosses_act1` (Grimble phase 2, Rat King). They fail the same way with
Slate not loaded (`isolate=bosses/,bosses_act1,enemies/`), so they are another area's work in progress.

Looked at and left alone (see Known issues): Hold Still on elites, throws over cliffs, the Gasket advisory, the Grudge
Ledger's power (the "your passive, but more" pattern of Marwyn's and Marbles' legendaries), a charmed held foe's
attacks being cancelled (the text says a held foe's attacks are cancelled; rare with Corelos / Buga charms).

Reviewer scratch: `.tmp/hero-slate-review/` — `probe.html` + `run.sh` (run any probe file through the test harness),
`sim.js` / `sim2.js` (real-encounter AutoPlay sims with Rage-by-round numbers), `fuzz.js`, `descs.js`, `heights.js`,
`scene.html` + `scene.js` + `shot.sh` (board scenes).
