# hero-slate — notes (v2: initiative turns, no telegraphs, no Guard, simple kit, attacks of opportunity)

Files: `js/data/heroes/slate.js`, `tests/content/hero_slate.js` (22 suites `hero_slate: …`). Scratch (not shipped):
`.tmp/slate/` — `probe.html` + `run.sh` (any probe file through the test harness; takes a Chrome slot like test.sh),
`sim.js` (AutoPlay on the real encounters: `bash .tmp/slate/run.sh "probe=sim.js&n=1&acts=1,2,3&hero=slate"`),
screenshots `g.png` (gallery), `c1.png` / `c2.png` (fixture and real act-1 fights). v2 review scratch (all Chrome-slot
aware): `.tmp/slate-rev/` — `run.sh "probe=<file>"` (`probe1.js` / `probe2.js` adversarial probes, `fuzz.js` AutoPlay
invariants on every real encounter, `pfuzz.js` previews vs reality on random boards), `mut.sh "mut=heroes/<copy>.js&…"`
(the test page with `slate.js` swapped for a mutant copy in `.tmp/slate-rev/heroes/`), `shot.sh scene.html
"debug=1&screen=title&scene=rage|move|close|portraits|select" <abs.png>` (scripted screenshots). The v1 reviewers'
scratch (`.tmp/hero-slate*/`) is stale (v1 kit, no slot cap): don't run it.

Isolated runs: `bash tools/test.sh "suite=hero_slate&isolate=heroes/slate,hero_slate"` (22 suites) and
`bash tools/test.sh "suite=content:&isolate=heroes/slate,hero_slate"` (the generic content suites, 8).

User's brief: *"A grumpy golem (pale blue stone + runes) who can rage to flare his runes. He throws things and grapples
things."* (he/him).

## Summary

**Slate, the Unamused** (`slate`) — Stone Golem, Guardian (Retired). Lich-tenstein's library golem who quit after nine
hundred years of shushing. `unlock: null` (v2: everyone from the start). HP 32 (+4/level), AP 3, move 3, armor 1,
**init −2** (golems are slow), `flags.immovable`. Role: grappler / thrower / bruiser, complexity 2. Accent `#6fd3e6`.
Melee basic attack → he makes **attacks of opportunity** (Love Tap) on foes walking away from him: with Hold Still and
immovable, he holds the line.

**Passive — Short Fuse** (one rule, his comedic core): *"Gains 1 Rage (max 5) whenever someone else hits, heals or buffs
him. At 3+ Rage his runes flare: his skills deal +2 damage."* Rage (`sla_rage`, 1-5 stacks) never drains and every
fight starts at 0. Foes' hits (even fully Blocked, friendly fire too, attacks of opportunity too), allies' heals that
heal something and allies' buffs all count ("Did I ASK?"); his own heals / buffs, debuffs, sourceless damage and hits
that do nothing (invulnerable) don't. The flare's +2 is on every damaging hit of his skills (basic, signature, crash
damage of his throws); on his attacks of opportunity it goes through `modifyOpportunity` (`o.flat`) so the AI and HUD
estimates see it (exact, except ±1 when he is also Inspired / Weak: an engine estimate issue, see Requests). Blow a
Gasket spends it, the signature maxes it.

| id | name | AP / cd | what (L1 → L3) |
|---|---|---|---|
| `sla_love_tap` (basic) | Love Tap 👊 | 1 | 5 dmg to an adjacent foe (also his attack of opportunity) |
| `sla_hold_still` ★ | Hold Still 🤼 | 1 / 2 | 4/5/6 dmg + **Grappled** through its next 1/1/2 turns (can't move; dragged along when he walks) |
| `sla_personal_space` ★ combo | Personal Space ✋ | 2 / 1 | **throw** the adjacent foe or object up to 3/3/4 tiles in a line: it and the foe it hits take 7/9/11; objects shatter (barrels explode, kegs flood); pits / deep water YEET, lava burns, water wets |
| `sla_rocks_fall` | Hard Pass 🪨 | 2 / 2 | lob a boulder up to 5/5/6 tiles, over walls: 7/9/10 to the foe or object there; on empty floor the **Boulder** stays |
| `sla_air_mail` combo | Air Mail 📦 | 1 / 2·2·1 | throw an adjacent ally up to 3/4/4 tiles onto a safe empty tile; foes next to the landing take 3/4/5 |
| `sla_foot_down` | Putting My Foot Down 👣 | 2 / 2 | cone 2/2/3: 4/5/6 dmg + push 1/2/2 |
| `sla_lawn` | Get Off My Lawn 🏡 | 1 / 2 | foes within 2/2/3 are Taunted for their next turn + 4/6/8 Block (until his next turn) |
| `sla_rock_bottom` | Rock Bottom 🙃 | 2 / 2 | slam an adjacent foe onto the tile behind him (if there's room): 10/12/12; III adds Stun (its next turn); a pit behind = YEET |
| `sla_gasket` | Blow a Gasket 💢 | 2 / 3 | spell: spend all Rage, 3/5/5 + 2/2/3 per Rage spent to every foe in the 8 tiles around him (desc shows "N right now") |
| `sla_get_over_here` combo | Get Over Here ⛓️ | 1 / 2 | spell: rune-chain a foe in a straight line up to 4/5/6 (LOS): 2/3/4 + pull it next to him |
| `sla_tantrum` (signature) | Tectonic Tantrum 🤬 | 2 + 100 Hype | 15 dmg to every foe within 2, each knocked 2 tiles away; then his Rage maxes out |

★ = starting skills. Pool (9): hold_still, personal_space, rocks_fall, air_mail, foot_down, lawn, rock_bottom, gasket,
get_over_here. Every skill is one verb + at most one rider; level II = bigger numbers; level III = bigger numbers, or
one added rider (Rock Bottom's Stun). The signature keeps two riders (knockback + max Rage), like the other heroes'
set-piece signatures (Zarathor's Dazzle + ignite).

**Combos with other heroes** (setups / payoffs, tested where the partner exists):
- *Throws as positioning*: Personal Space / Rock Bottom / Foot Down / the Tantrum put foes into pits, lava, water (Wet →
  anyone's lightning electrifies the pool: Wet + stun, tested with the fixture mage), onto Corelos' runes (tested), onto
  Hjalmar's traps (tested), bunched up for cleaves; thrown explosive barrels / kegs / braziers make the fire / water.
- *Get Over Here* pulls a backline archer into the knight's / Marwyn's / Betty's reach before their turn (tested).
- *Air Mail* delivers a melee ally into the enemy line (thud now, the ally's own attack on its turn; tested) and is the
  party's **escape hatch**: a throw never provokes attacks of opportunity, so an engaged squishy leaves the brawl free
  (tested; a loading tip says so).
- *Grappled* is a `noMove` hold: other heroes' "rooted or held" payoffs count it (Betty's Kick 'Em While They're Down:
  tested). Every forced landing (throw, drag, slam, pull) springs Hjalmar's traps (tested: a goblin thrown onto his
  Bear Trap and one dragged onto it: snap + Root + his Hype).
- *Short Fuse*: healers and buffers (Josiah, Ellaria, Valdris, Syllamin) flare his runes for him (tested: Valdris'
  Forge Weapon is +1 Rage and its +2 stacks with the flare; his Forge Armour is Block, not a buff: no Rage, probed). Get Off My
  Lawn's taunt makes foes hit him (Rage) instead of the backline, and a taunted foe only swings at its taunter, so the
  squishy next to it walks away without an attack of opportunity (tested; a tip says so).

**Grappled** (`sla_grappled`, debuff on the victim, `noMove`, `turnEnd` decay, `turns` = its next N turns, source =
Slate): it can't move (pushes still work), and when Slate walks (a move action, `cause 'move'`) it is dragged into the
tile he just left (a teleport: forced movement, never provokes; a Bleeding foe bleeds like any moved unit). It never
makes an attack of opportunity on its holder (they move together; `modifyOpportunity` cancel), but still on anyone
else. It ends when its turns run out, when they are apart (pushed, thrown, teleported, his walk through a friend's
tile), when he can't hold on (stunned / asleep / frozen / sheep / downed) or when it dies. One hold at a time (a new
grab drops the old one). Anything liftable can be held, thrown or slammed: not immovable / untargetable units (so not
the Rat King, Dr. Iris, the DM, brutes), but a pushable boss (Grimble, Lich-tenstein) can be grabbed for its next turn
and thrown (pits then do their boss rule: 25% max HP).

**Throws**: lift the adjacent unit / object and land it up to N tiles away in a straight line, over units and low
clutter (crates, barrels, bushes); walls, tall objects (pillars, `blocksLos`) and the map edge stop it short ("BONK").
It crashes into the first foe on its landing tile: both take the damage (the crash is a collision, `cause 'bump'`, so a
crash kill is an environmental kill: +20 Hype), the thrown unit bounces back to the last free tile. Pits / deep water at
the landing: the engine's fall (YEET for normal foes). Thrown objects shatter where they land (placed non-blocking and
destroyed, so `onDestroyed` fires: barrels explode, kegs flood); an object never lands on another object (it breaks just
short). Allies are never hurt by his throws (a thrown foe bounces off them).

**Items** (hero `slate`, no `stats.block`, no combat-start hooks):
- `sla_mitts` Mitts of Unreasonable Velocity (rare weapon): +10% damage; Personal Space and Air Mail throw 1 tile further.
- `sla_cardigan` Cardigan of Disapproval (rare armor): +6 max HP; 2 Block for every Rage he gains (mid-fight Block).
- `sla_ledger` The Grudge Ledger (legendary trinket): +10% damage; Short Fuse gives 2 Rage instead of 1.

Object `sla_boulder` (Boulder: blocks movement, not LOS, 5 HP, `smashable`, `throwable`, custom iso painter). Narration:
6 `tips` (Rage, healing him, holds, throws, Air Mail and Get Off My Lawn as attack-of-opportunity escapes).

Sprite: `base: 'custom'` painter (scale 1.15, ~48 px at zoom 1): hunched pale-blue (`#9fb7c9`) stone slab, small head
with a cliff-ledge brow, glowing slit eyes, frown crack, moss, gorilla arms with huge fists; carved runes dull at Rage
0, faintly lit at 1-2, bright cyan at 3+ with a back glow, orbiting glyphs and steam. Poses: overhead smash, both arms up,
flinch, reaching forward while holding someone, stride, X eyes when downed. Barks: 13 keys × 5-6 lines (≤ 70 chars),
naming Zarathor, Syllamin, Marbles, Marwyn, Ellaria, Josiah, Buga, Kiri, Betty, Basanos, Valdris, Hjalmar and Pebbles
("A fire dog named Pebbles. My cousins are OFFENDED.").

## Public API

- `DD.Slate` (attached at load, runtime use only): `rage(u)`, `flared(u)`, `gainRage(u, n)`, `spendRage(u)` (all of
  it), `heldBy(slate)`, `holderOf(victim)`, `grab(slate, victim, turns)`, `release(victim, text)`,
  `flight(from, dir, n, mover)` (pure: where a thrown thing comes down), `throwUnit(user, unit, dir, n, dmg)`,
  `throwObject(user, at, dir, n, dmg)`, `objThrowable(obj)`.
- **Throwable objects**: crate, barrel, barrel_explosive, keg, mushroom, coffin, candles, brazier, sla_boulder, plus any
  object def or instance with `throwable: true` (`throwable: false` opts out). The `protect` objective's object never.
- Statuses `sla_rage` / `sla_grappled` and the `sla_boulder` object are safe for other content to read.

## Deviations

- Throws into pits / deep water put the unit on the drop tile (`unit.x/y`, then `DD.Act.touch()`) and hand it to
  `DD.Act.fall` — `DD.Act.teleport` refuses non-walkable tiles. Same for Rock Bottom over a pit.
- Crash damage uses `cause: 'bump'` (environmental, like the engine's push bumps): a crash kill gives +20 Hype. Because
  environmental damage skips outgoing modifiers, the flare's +2 on a crash is added in Slate's code (`crashDmg`).
- The flare on his attacks of opportunity is added through the passive's `modifyOpportunity` (`o.flat`, once per
  attack via an `o.slaFlare` marker since the hook fires for attacker and mover) and skipped in `modifyOutgoingDamage`
  for `d.opportunity` hits: same damage, but `DD.AI.opportunityDmg` (enemy walk pricing, AutoPlay, the HUD) knows it.
- The id `sla_rocks_fall` stays for Hard Pass (saved runs; its first name clashed with the DM's attack).
- DESIGN §6's v1 brief (intents cancelled by the grapple, Rage drain and riders, Stone Skin / Bedrock / Rune Flare)
  was simplified per DESIGN §6 "Simplicity": Stone Skin + Bedrock (v1 "Rooted in Tradition") dropped, Rune Flare = Blow a
  Gasket, Toss a Friend = Air Mail, Grapple = Hold Still, Hurl = Personal Space, Rock Toss = Hard Pass, Suplex = Rock
  Bottom, Seismic Stomp = Putting My Foot Down; added Get Over Here (rune-chain pull) as the positioning combo tool.

## Requests

- **Lead (DESIGN §6)**: the Slate brief still describes v1 (*"unlock: defeat Lich-tenstein"*, the grapple cancelling
  telegraphed attacks, Rage draining, Rage riders, Stone Skin / Bedrock). Suggested v2 text: the passive and kit table
  above ("Short Fuse: +1 Rage when someone else hits, heals or buffs him; 3+ Rage: his skills +2 damage"; Grappled = can't
  move + dragged along; init −2; holds the line with attacks of opportunity).
- **INTEGRATION** (`tests/content/integration.js`, "cross-content consistency"): it still expects the v1 unlocks
  (`slate: { boss: 'lichtenstein' }`, likewise Josiah / Sparrow / Corelos / Buga, "grimble / lichtenstein unlock exactly
  one hero") and "ten real heroes"; v2 heroes have `unlock: null` (DESIGN §3, user request) and there are 16 now
  (Valdris, Hjalmar and Pebbles landed; the review's full run: "expected 10, got 16").
- **AUTOPLAY** (optional, not a bug): AutoPlay mostly plays him at range (in real-encounter sims he starts only 6% / 21% /
  14% of his turns next to a foe in acts 1 / 2 / 3, leaning on Hard Pass), so it rarely makes his attacks of opportunity
  or drags. A "stand next to the enemy that threatens the backline" valuation for immovable melee heroes (body-blocking
  already exists for allies' danger) would play him, Marwyn and Betty more like a player would. (Review data: over 117
  real-encounter AutoPlay fights he made 4 attacks of opportunity and took 20; after Love Tap his most used skill is
  Personal Space, 109 uses vs Hold Still's 95, and it throws the foe next to him away.)
- **Narrative** (optional): Slate-flavoured lines for `env_kill` ("…has hit Rock Bottom"); events "Slate and the noisy
  kids" / "the sculptor who wants to fix him" (DESIGN §11) — Valdris, a forge cleric, could be the one who wants to fix
  him.
- **ENGINE** (`js/engine/ai.js` `oppDmg`, review v2): it prices a `modifyOpportunity` flat bonus *before* the
  attacker's multipliers (`estimate(attacker, mover, L.dmg × o.mult + o.flat)` → `round((dmg + flat) × m)`), while
  `Act.damage` adds `o.flat` to `d.flat` *after* every multiplier (`round(amount × mult + flat)`, then armor). With an
  Inspired / Weak / `dmgBonus` attacker or a Vulnerable mover the estimate is off by about 1: flared Slate + Inspired is
  estimated 9 for a real 8, flared + Weak 5 for a real 6, flared + Inspired + Mitts 10 for a real 9 (plain, Mitts-only and
  Ledger-only cases match). Suggest passing the flat to `estimate` separately: `Math.round(L.dmg × o.mult × m + o.flat)`,
  then Marked and armor, as the damage pipeline does. Affects every content `o.flat` hook, not just Slate's.

## Known issues

- AutoPlay plays him at range (see Requests); his attacks of opportunity and holds happen far more in human hands.
- Throws ignore elevation: a thrown foe, object or ally flies over a 2+ level cliff and may land on top of it (about 1
  map in 5 has such steps). Simple and previewed exactly; walls and tall objects still stop it.
- Air Mail's landing filter is the engine's `empty` (ground rules): flying allies can't be mailed onto a pit tile.
- In the isolated `content:` arena the "ally" is another Slate (no other real hero is loaded), which is immovable, so Air
  Mail logs "no valid target in the arena" there; in the full run it executes (its damage key is `thud`, not `dmg`, so
  the arena's missing landing foes raise no advisory).
- Holding a pushable boss (Grimble, Lich-tenstein) stops it walking for its next turn and lets him drag it, like any
  root plus a drag. Bosses' own stun guards are untouched (Rock Bottom III's Stun goes through them like anyone's).
  (No pit exploit today: Grimble's arena has no pits and Lich-tenstein flies over his chute.)
- `DD.AI.opportunityDmg` misjudges his flared attack of opportunity by about 1 when he is also Inspired / Weak (the
  engine's estimate multiplies `o.flat`; see Requests, ENGINE). The real damage always equals a flared Love Tap's.
- A crash hit is a collision (`cause 'bump'`): the foe he throws gets his outgoing modifiers (Inspired, Weak, the Mitts'
  and the Ledger's +10%), the foe it crashes into only gets the flare's +2 (like every push bump in the engine). The
  preview shows both numbers exactly; the desc's single number is the unmodified one.

## Tests (`tests/content/hero_slate.js`, 22 suites, ~1870 assertions with the cast loaded)

Definition + simplicity rules (desc ≤ 160 chars, no per-skill Rage clauses, no removed mechanics, he/him, init −2,
unlock null, pool 9, 2-3 combo skills, barks naming the cast incl. the three newest heroes) · Short Fuse · every skill at
every level (damage, ranges, cooldowns, AP, statuses lasting exactly the right own turns, both initiative orders for
the hold; a held foe's threat shading shrinks to its stab's reach) · the signature · the items · combos (fixtures; with
the cast loaded: Betty's cheap shot on a held foe, a throw onto Corelos' rune, a goblin thrown and one dragged onto
Hjalmar's Bear Trap, Valdris' Forge Weapon feeding Short Fuse and stacking with the flare) · **attacks of opportunity**
(walking off a grunt provokes: preview, damage, Rage, no undo; a foe walking off him eats Love Tap 5 / flared 7 and the
AI's estimate says so; once a round; no strike while stunned / asleep / frozen / sheep / charmed by the mover, a
silenced Slate still strikes; a held foe never strikes him while dragged but still strikes others; throws, slams, pulls,
stomps, the Tantrum and Air Mail never provoke; a foe Taunted by Get Off My Lawn lets the mage walk off it, an
untaunted one still stabs her) · previews == reality on a busy board (~670 assertions) · v2 edge cases (disabled
users, not his turn, deaths mid-skill, no AP, pushes into lava / water at the map edge, odd contexts, an AI round with a
hold and a taunt that both end exactly) · AutoPlay battles (party slate + test_knight / test_cleric / test_mage vs the
fixture encounters of acts 1-3 at levels 1 / 3 / 5: no errors, initiative rolled, a spread of his skills used) ·
AutoPlay set pieces (pit throw, Tantrum) · tooltips · sprite. Mutation-checked (author pass): without the held-foe
cancel 4 asserts fail, without the flare on attacks of opportunity 2 fail; (review pass) see "Review (v2)".

Full run (author pass, `bash tools/test.sh`): 693 suites, 76 failing sections, none of them Slate's. Full run (review
pass, final files): **788 suites, 20 failing sections, none of them Slate's** — bosses_act1 17, integration 3 (other
areas mid-flight). All 22 `hero_slate` suites pass there (1,866 assertions; the cast combos with Betty, Corelos, Hjalmar
and Valdris run: 31 asserts), the 8 `content:` suites pass with no Slate advisory, no swallowed errors. The only Slate
mention among the failures is integration's stale v1 unlock expectation (`slate: { boss: 'lichtenstein' }`, Requests);
its campaign smoke failure is seed 0 (a party without Slate losing to Grimble); seed 1's party with Slate won the
whole campaign.

## Balance (AutoPlay sims, `.tmp/slate/sim.js`, real encounters, normal, n=1 per encounter, mates Kiri / Josiah / Ellaria)

v2 levels: act 1 L2 (starters + Hard Pass), act 2 L3 (+ Air Mail), act 3 L5 (starters at II).

| slot hero | act 1 wins / dmg / taken / downs | act 2 | act 3 (party downs / fight) |
|---|---|---|---|
| Slate | 11/11 · 17 · 3 · 0 | 12/12 · 48 · 13 · 0.08 | 9/11 · 36 · 36 · 0.64 (1.82) |
| Marwyn | 11/11 · 13 · 5 · 0 | 12/12 · 23 · 30 · 0.17 | 10/11 · 32 · 46 · 0.64 (2.00) |
| Betty | 11/11 · 15 · 6 · 0 | 12/12 · 28 · 18 · 0 | 11/11 · 31 · 30 · 0.27 (1.09) |

Read: in the same band as the other melee heroes (small samples; act 3 is where fights bite). No swallowed errors.

## v2 conversion log

- **Earlier pass** (committed in the v2-in-progress snapshot): simple kit. Short Fuse lost its extra triggers (foe
  adjacent at turn start, fight-wide "ally hit next to him" rule), the starting Rage, the drain and every per-skill
  "Rage 3+" rider → one rule (+1 Rage when touched; 3+ = +2 damage). Hold Still: no intent cancelling, no crush, no
  hidden root → `noMove` Grappled through its next turn(s), cd 2. Personal Space: no Rage range / crash stun, 7/9/11.
  Hard Pass: no splash. Air Mail: no Block (one rider: the thud). Foot Down: no rubble. Get Off My Lawn: no shove, no
  free Rage (Taunt + Block). Rock Bottom: no held bonus, III Stun. Gasket: no heal. Get Over Here: no grab at III.
  Rooted in Tradition and `sla_grappling` removed. Items: Mitts lost "thrown hits +2", the Ledger lost its starting Rage
  and no-drain clause. `stats.init −2`, `unlock: null`, complexity 3 → 2. Durations per own turn (`turns: 1` = its next
  turn). A thrown object never vanishes (it breaks short of another object). Descs shortened to one breath.
- **This pass** (attacks of opportunity + finishing): a held foe never makes an attack of opportunity on its holder
  (status hook + desc); the flare reaches attacks of opportunity through `o.flat` (honest estimates); Hold Still's AI
  control rewritten for reach-aware targeting (an engaged grunt now sticks to him; with his reaction spent it leaves for
  the wounded mage; held, it can't); new attacks-of-opportunity suite; barks for Valdris / Hjalmar / Pebbles; blurb ("smacks
  whatever walks away"; "basically always on" overstated the flare: "They glow a lot."); a tip fixed ("someone else",
  not "anyone") and the Air Mail escape tip; header comments; these notes rewritten for v2.

## Review (v2) — adversarial review of the v2 + attacks-of-opportunity pass (ADVERSARIAL REVIEWER role)

Scope: everything Slate owns (`slate.js`, `hero_slate.js`, these notes) against DESIGN §6 "Simplicity", the v2 turn
model (`docs/notes/v2-migration.md`) and the attacks-of-opportunity rule (`docs/notes/rules.md`). Verified by running
code; scratch harnesses in `.tmp/slate-rev/` (see the top of this file).

### Verified (held under probing)

- **desc == execute at every level** (all 11 skills, every level, with and without the Mitts): numbers, ranges,
  cooldowns, AP, own-turn durations. On top of the suite's busy board, `pfuzz.js` compared **1,315 previews with the
  real outcome on random boards** (pits, lava, water, ice, walls, barrels, kegs, braziers, spore pods, Boulders,
  Hjalmar's six traps, fixture and real enemies incl. brutes and the Test Overlord, a knight and Hjalmar as allies,
  Rage 0 / 2 / 3 / 5, his three items, a held foe): **0 mismatches** in HP, downs, kills and Hype, no swallowed errors.
- **Attacks of opportunity**: Love Tap is his opportunity slot; a flared reaction deals exactly a flared Love Tap
  (5 / 7; with the Mitts 6 / 8, the Ledger 6 / 8, Inspired 6 / 8, Weak 4 / 6); a held foe never strikes its holder
  but strikes anyone else; throws, slams, drags, pulls, stomps, the Tantrum and Air Mail never provoke; a reaction that
  stuns him on his first step ends the walk and drops the hold; an ally teleporting him drops it too. The line holds:
  in 78 real-encounter AutoPlay fights, enemies that began their turn next to him stayed and fought 84 of 90 times
  (4 walked off, 2 died on their turn).
- **Invariants** (`fuzz.js`, 117 AutoPlay fights over every real act 1-3 encounter, random mates, three salts): no stale
  hold at any turn end (holder active, not stunned / asleep / frozen / sheep, adjacent), no two units sharing a tile, Rage
  always 0-5, no held foe striking its holder, no swallowed errors, no timeouts.
- **Simplicity**: every skill is one verb + at most one rider (Hard Pass's Boulder and Rock Bottom's "if there's room"
  are the only conditions; Rock Bottom III's Stun is the only added rider); the passive is one rule and still the joke
  ("heal him anyway"); pool 9 + 2 starters; 3 combo-tagged skills (Personal Space, Air Mail, Get Over Here). His descs
  average 16 words (cast 13.5, Hjalmar 16.2): long-ish because they are exact; left as they are.
- **The brief** ("grumpy golem, pale blue stone + runes, rages to flare his runes, throws things, grapples things"):
  reads at once — grumpy barks and passive, the rune flare is visible on the sprite (dull at 0, faint at 1-2, cyan with
  a back glow at 3+), four throws (foes, objects, allies, boulders) and the only grapple-and-drag in the cast.
- **v1 leftovers**: none (no intents, Guard, combat-start Block, XP, `Math.random`); `init −2`, `unlock: null`; he/him
  everywhere; the barks name Valdris, Hjalmar and Pebbles with no pronouns.
- **Visuals** (screenshots read): gallery (poses, status tints, portraits), a scripted fight (a flared and a calm Slate
  side by side, the holding pose and the Grappled chip, the Boulder, the throw preview "Hits 1 foe for 11"), the move
  preview while holding (the held grunt is not in his "Engaged" chip), party select.

### Fixed (most severe first)

1. **Party-select panel**: the blurb wrapped to 5 lines and pushed his kit row out of the panel at 1280×720. Trimmed to 4
   lines (dropped "on the spot" and "Nothing short of an earthquake moves him.", which the Immovable chip right under
   it says); every joke about touching / healing him stays.
2. **Untested AoO synergy, now a tested rule + tip**: a foe Taunted by Get Off My Lawn only swings at its taunter, so
   the squishy next to it walks away free (control: without the yell both grunts stab her; with it only the one out of
   earshot does; the taunted one still punishes Slate walking off). New loading tip.
3. **Cast combos claimed but untested** (Hjalmar's traps, Valdris' buffs): a goblin thrown onto Hjalmar's Bear Trap and
   one dragged onto it (snap + Root + Monkey Business Hype), Valdris' Forge Weapon is +1 Rage and its +2 stacks with
   the flare (5 + 2 + 2). Guarded like the Betty / Corelos ones (skipped when those files are isolated out).
4. **Vacuous asserts**: the edge-case suite's "after 4 rounds the hold is over (or still a real one)" (`!has(x || slate)
   || heldBy` — true either way) and "statuses sane" (`turns >= 0`) now assert exactly: no hold and no taunt left. A
   double negative in the Ledger test (`!flared === false`) is now `flared`.
5. **Threat shading**: new assert that a held foe's `DD.AI.reachOf` (the HUD's shading) shrinks to the tiles its stab
   reaches.
6. Mutation-checked (`mut.sh`, mutant copies of `slate.js`): the Lawn without its taunt fails 9 asserts (3 in the new
   AoO block), no drag fails 8 (2 in the new Hjalmar block), buffs not feeding Short Fuse fails 5 (2 in the new Valdris
   block).

### Not changed (reported or kept on purpose)

- **ENGINE**: `DD.AI.opportunityDmg` adds `o.flat` before the attacker's multipliers (off by ~1 for a flared Slate who is
  also Inspired / Weak); see Requests. Slate's own numbers are right.
- **AutoPlay** still plays him at range (Requests): in 117 fights he made 4 attacks of opportunity and took 20.
- **Overlap**: Marwyn's YEET and Betty's Head Over Heels also throw; all three come from the user's briefs. Slate's
  throws are the broadest (foes, objects, allies, boulders) and only he grapples; Rock Bottom is a damage payoff where
  Head Over Heels is a Vulnerable setup. Kept.
- **Crash vs thrown damage** with outgoing modifiers (Known issues): engine collision rule, previews exact. Kept.
- **Block from an ally** (Valdris' Forge Armour) is not a buff status, so no Rage ("buffs" = buff chips). Kept.
- **No pit exploit on bosses**: Grimble's arena has no pits, Lich-tenstein flies over his chute, the Rat King, Dr. Iris
  and the DM are immovable.

### Test runs (review pass, final files)

- Isolated: `bash tools/test.sh "suite=hero_slate,content:&isolate=heroes/slate,hero_slate"` — 30 suites, 5,115
  assertions, 0 failures; with the combo partners (`…,heroes/hjalmar,heroes/valdris,heroes/betty,heroes/corelos`) 30
  suites, 0 failures (the cast-combo suite runs 31 asserts instead of 1).
- Full: `bash tools/test.sh` — 788 suites, 20 failing sections, none Slate's (bosses_act1 17, integration 3); all 22
  `hero_slate` suites and all 8 `content:` suites pass; no Slate advisory; no swallowed errors.

## Requests (Nov 3) — flyers ignore the floor, barrels, heals that revive (CONTENT SWEEP heroes-2)

- **Barrels**: Love Tap can be aimed at a volatile object (Slate stands in his own blast; no Rage from it). Hold Still
  (a grab) and Rock Bottom (a slam with a custom area) opt out with `target.objects: false`: he grapples foes, and a
  barrel goes through Personal Space (a tile skill that throws it, unchanged) or Love Tap. Get Over Here is a spell (not
  aimable).
- **Flyers**: throws, slams and Air Mail were already per unit (`flight` skips drops for a flying mover, Rock Bottom too,
  Air Mail asks `hazardAt(…, ally)`); a flying foe thrown onto lava hovers there, unburnt (the engine skips the floor).
- **Heals**: none in his kit. A revive by someone else's heal still feeds Short Fuse (`onHealed` fires).
- **Tests**: `hero_slate: v2 requests — …`: grab / slam don't list barrels, Love Tap does (preview = reality on Slate
  and the grunt, no Rage, 1 AP); a flyer vs a walker thrown onto lava (preview = reality, the walker pays).
- **Requests**: none.
