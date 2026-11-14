# hero-slate — notes (v2: initiative turns, no telegraphs, no Guard, simple kit, attacks of opportunity)

Files: `js/data/heroes/slate.js`, `tests/content/hero_slate.js` (26 suites `hero_slate: …` since Nov 12; the D9 sustain
work is in "Sustain (Nov 12)" at the end). Scratch (not shipped):
`.tmp/slate/` — `probe.html` + `run.sh` (any probe file through the test harness; takes a Chrome slot like test.sh),
`sim.js` (AutoPlay on the real encounters: `bash .tmp/slate/run.sh "probe=sim.js&n=1&acts=1,2,3&hero=slate"`),
screenshots `g.png` (gallery), `c1.png` / `c2.png` (fixture and real act-1 fights). v2 review scratch (all Chrome-slot
aware): `.tmp/slate-rev/` — `run.sh "probe=<file>"` (`probe1.js` / `probe2.js` adversarial probes, `fuzz.js` AutoPlay
invariants on every real encounter, `pfuzz.js` previews vs reality on random boards), `mut.sh "mut=heroes/<copy>.js&…"`
(the test page with `slate.js` swapped for a mutant copy in `.tmp/slate-rev/heroes/`), `shot.sh scene.html
"debug=1&screen=title&scene=rage|move|close|portraits|select" <abs.png>` (scripted screenshots). The v1 reviewers'
scratch (`.tmp/hero-slate*/`) is stale (v1 kit, no slot cap): don't run it.

Isolated runs: `bash tools/test.sh "suite=hero_slate&isolate=heroes/slate,hero_slate"` (26 suites) and
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
| `sla_hold_still` ★ | Hold Still 🤼 | 1 / 2 | 4/5/6 dmg + **Grappled** until the end of HIS next 1/1/2 turns (can't move; dragged along when he walks); D9 retime, see "Sustain (Nov 12)" |
| `sla_personal_space` ★ combo | Personal Space ✋ | 2 / 1 | **throw** the adjacent foe or object up to 3/3/4 tiles in a line: it and the foe it hits take 7/9/11; objects shatter (barrels explode, kegs flood); pits / deep water YEET, lava burns, water wets |
| `sla_rocks_fall` | Hard Pass 🪨 | 2 / 2 | lob a boulder up to 5/5/6 tiles, over walls: 7/9/10 to the foe or object there; on empty floor the **Boulder** stays |
| `sla_air_mail` combo | Air Mail 📦 | 1 / 2·2·1 | throw an adjacent ally up to 3/4/4 tiles onto a safe empty tile; foes next to the landing take 3/4/5 |
| `sla_foot_down` | Putting My Foot Down 👣 | 2 / 2 | cone 2/2/3: 4/5/6 dmg + push 1/2/2 |
| `sla_lawn` | Get Off My Lawn 🏡 | 1 / 2 | foes within 2/2/3 are Taunted for their next turn + 4/6/8 Block (until his next turn) |
| `sla_rock_bottom` | Rock Bottom 🙃 | 2 / 2 | slam an adjacent foe onto the tile behind him (if there's room): 10/12/12; III adds Stun (its next turn); a pit behind = YEET |
| `sla_gasket` | Blow a Gasket 💢 | 2 / 3 | spell: spend all Rage, 3/5/5 + 2/2/3 per Rage spent to every foe in the 8 tiles around him (desc shows "N right now") |
| `sla_get_over_here` combo | Get Over Here ⛓️ | 1 / 2 | spell: rune-chain a foe in a straight line up to 4/5/6 (LOS): 2/3/4 + pull it next to him |
| `sla_stress_ball` (D9) | Stress Ball ✊ | 1 / 1 | squeeze the foe he is holding: 3/4/5 dmg, and he heals 4/5/6 HP (his own heal: no Rage) |
| `sla_tantrum` (signature) | Tectonic Tantrum 🤬 | 2 + 100 Hype | 15 dmg to every foe within 2, each knocked 2 tiles away; then his Rage maxes out |

★ = starting skills. Pool (10): hold_still, personal_space, rocks_fall, air_mail, foot_down, lawn, rock_bottom, gasket,
get_over_here, stress_ball (appended Nov 12). Every skill is one verb + at most one rider; level II = bigger numbers; level III = bigger numbers, or
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

**Grappled** (`sla_grappled`, debuff on the victim, `noMove`, `decay: 'never'` since Nov 12, `turns` = SLATE's turns
left, ticked by Short Fuse's `onTurnEnd` (`tickHold`; the grab turn's own end doesn't count: `data.slaFresh`), source =
Slate): it can't move (pushes still work), and when Slate walks (a move action, `cause 'move'`) it is dragged into the
tile he just left (a teleport: forced movement, never provokes; a Bleeding foe bleeds like any moved unit). It never
makes an attack of opportunity on its holder (they move together; `modifyOpportunity` cancel), but still on anyone
else. It ends when he lets go at the end of his Nth turn after the grab, when they are apart (pushed, thrown,
teleported, his walk through a friend's tile), when he can't hold on (stunned / asleep / frozen / sheep / downed) or
when it dies. The victim is held for exactly N of its own turns (as before the retime), in both initiative orders. One
hold at a time (a new grab drops the old one). Anything liftable can be held, thrown or slammed: not immovable /
untargetable units (so not the Rat King, Dr. Iris, the DM, brutes), but a pushable boss (Grimble, Lich-tenstein) can be
grabbed for its next turn and thrown (pits then do their boss rule: 25% max HP).

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
8 `tips` (Rage, healing him, holds, throws, Air Mail and Get Off My Lawn as attack-of-opportunity escapes, Stress Ball,
the hold lasting through his next turn).

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
  `throwObject(user, at, dir, n, dmg)`, `objThrowable(obj)`; since Nov 12 `tickHold(holder)` (one of the holder's turn
  ends: Short Fuse calls it; another caller of `grab` whose holder has no Short Fuse must call it at that holder's turn
  ends), `HOLD_AI` (1.5) and `holdValue(ctx)` (Hold Still's `autoplayValue`, exported for tests).
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
- **Hold timing (D9, Nov 12; spec `.tmp/wf13/sustain-spec.md` §1.1 A / §6)**: Grappled counts Slate's turns
  (`decay: 'never'`, ticked by Short Fuse's `onTurnEnd`): the hold ends at the end of his Nth turn after the grab, and
  the victim is still held for exactly N of its own turns. (Statuses normally count their bearer's turns, ARCHITECTURE's
  `decay`; this one counts its source's, so that "while grappling" lasts into his next turn for Stress Ball, drags and
  throws.) Side effect, accepted by the spec: a foe with two turns a round stays held through both.

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

## Rules run (Nov 6) — breaking objects (CONTENT SWEEP)

User: "objects should be targetable to break them" (engine rule: `docs/notes/rules.md` "Rules run"). The Boulder
(`sla_boulder`, 5 HP) says `targetable: true`: anyone can clear it from range (desc "5 HP: Smash it, or hit it with any
single-target attack. Slate can throw it again."). **Hard Pass** (tile-aimed, so outside the engine's object rule) now
refuses what the party may not aim at — `targetable: false` objects and the protect objective's object ("He has been asked
not to throw rocks at that."); it still crushes any other object there. Hold Still and Rock Bottom keep `objects: false`
(he grapples foes; Personal Space throws crates). Swap move (Nov 10 check): Slate is `immovable`, and the engine refuses
a swap when either unit is immovable ("Slate is immovable."), so he never swaps — allies still walk through him. DESIGN
§4.2 says so. **Request (lead, design call)**: the user's "tank to the front" swap is exactly Slate's job; if he should
swap, the engine would need to tell "can't be pushed" (immovable) from "won't swap" (e.g. only refuse
stunned / rooted / downed for the mover and ally, or a `noSwap` flag). Tests: "hero_slate: Hard Pass…" (refusals), "hero_slate: rules run — the
Boulder is a breakable target…".

## Sustain (Nov 12) — Stress Ball + the Hold Still retime (D9; spec `.tmp/wf13/sustain-spec.md` §1.1, §5, §7)

Status: DONE (build:slate, Nov 12). slate.js + tests landed; isolated run green (26 suites, 2,058 assertions); full
run: no Slate failures (see "Test runs" below).

The user (D9): "Slate gets a skill for healing while grappling something" / "without overloading each character with a
self-heal". Spec §1.1 A-C, built in `slate.js` only (no engine change). The First-Aid Fanny Pack leaves the starting
kit (KIT-BALANCE's part, not this file).

**A. Hold Still retime** (`sla_grappled`; desc == execute):
- Status def `decay: 'never'` (was `'turnEnd'`); `noMove`, `stacking: 'refresh'`, `defaultTurns: 1` and its three hooks
  (victim `onTurnStart` stale-hold release, `onEnterTile`, `modifyOpportunity`) unchanged.
- `grab()` sets `st.data.slaFresh = DD.Act.isOwnTurn(slate)` after `addStatus` (a refresh keeps the same instance).
- Short Fuse gains `onTurnEnd: tickHold(u)` (fires before turn-end decay): the grab turn's own end only clears
  `slaFresh`; each later end of his turns takes 1; at 0 he lets go ("Let go.", log "<foe> is free.").
- Result: I-II hold until the end of his next turn, III until the end of his next 2; the victim is held for 1 / 1 / 2 of
  its own turns as before (both initiative orders tested). He can squeeze, drag or throw it on that next turn.
- Hold Still desc: `Grab an adjacent foe: 4 damage, and it is Grappled until the end of your next turn (can't move;
  dragged along when you walk).` (II 5 damage; III 6 damage, `next 2 turns`). Levels / AP 1 / cooldown 2 unchanged.
- Grappled desc names when the hold ends, in his turns: `Held by Slate: can't move, and is dragged along when he walks
  (no attack of opportunity on him: they move together). Free once they are apart, or when Slate lets go at the end of
  <when>.` with `<when>` = `this turn` (his turn, 1 left, not the grab turn), `his next turn` / `his next N turns`
  (otherwise; on his own later turn with n > 1 left: `his next n-1 turn(s)`). The old "(N turns left)" suffix is gone
  (`left()` removed).

**B. Stress Ball** (`sla_stress_ball`, new pool skill #10, appended; starters unchanged): ✊, `kind 'attack'`, tags
`['melee', 'grapple']` (no `'heal'` tag: REQ.healer must not count him), AP 1, cooldown 1, levels `{dmg 3, heal 4}`,
`{4, 5}`, `{5, 6}`; target an adjacent enemy unit, `objects: false`, `canTarget`: only the foe he holds, else
`Grab it first (Hold Still).`
- Desc: `Squeeze the foe you're holding: 3 damage, and you heal 4 HP.` (II 4 / 5, III 5 / 6; 60 chars).
- Flavor: `His therapist said to get a stress ball. He got a goblin. Close enough.`
- Execute: lunge, `SQUEAK!` over the foe, `DD.Act.damage(u, v, dmg, { tags: ['grapple', 'squeeze'] })` (an ordinary
  skill hit, so the Rage 3+ flare adds +2), then `DD.Act.heal(u, u, heal)` if he is still up — even when the squeeze
  killed the foe (the hold ends with it); self, active only (never a revive). His own heal is no one touching him: no
  Rage. Log (only when it healed): `Slate squeezes <foe> like a stress ball. He feels marginally less furious.` Bark key
  `squeeze` (35%): `Hmph. Better.` / `Squeeze. Breathe. Squeeze.` / `Stop wriggling. This is for my health.` /
  `Anger management. Very effective. For me.`
- Frequency: I-II one squeeze per grab cycle (Hold Still cd 2, Stress Ball cd 1); III up to two per grab (the grab
  turn and his 2nd turn after it; tested).

**C. AutoPlay** (content side):
- `stressScore` (Stress Ball `aiScore`, quick pass only: `ctx.autoplay` → 0, the exact pass's dry run prices the heal):
  `min(heal, missing) × (1.5 below half HP, else 0.8)`.
- `holdValue` (Hold Still `autoplayValue`, both passes): `HOLD_AI` 1.5 + (Stress Ball socketed and usable now or next
  turn: cd 0, or cd 1 and not fresh) `min(heal, missing) × (1.5 / 0.8) + 0.5 × dmg`. 0 for a foe he can't lift.
- Sandbox (tested): Slate at 40% HP with Hold Still + Stress Ball and a grunt next to him: AutoPlay plays Love Tap, Hold
  Still, Stress Ball on the same turn (L1 and L2). `HOLD_AI` stays 1.5 (the spec's 1.5-2.5 band); the balance pass may
  raise it to 2.5 if real sims show Hold Still under 1.0 a fight (spec §9 table).

**Tips** (2 new, 8 about Slate): `Slate's Stress Ball squeezes whatever he is holding. It hurts them. It helps him. He
will deny both.` / `Slate holds on until the end of his next turn: grab a foe, then drag it, throw it or squeeze it
next turn.` File header: "12 skills"; it also says only Hold Still grabs and how another caller must tick the hold.

**Tests** (`tests/content/hero_slate.js`): POOL + pool order with `sla_stress_ball` (the generic desc / flavor / icon /
3-level checks cover it); barks key `squeeze`; Short Fuse: Stress Ball's heal gives no Rage, the cleric's still does;
**Hold Still** suite rewritten (I-II: still Grappled with 1 left on Slate's round-2 turn, next to him, mage safe; free at
that turn's end; the grunt then walks off on its next turn. III: held through its 2 turns, free at the end of Slate's
2nd turn after the grab. `enemiesFirst`: held through its round-2 turn, still held on Slate's round-2 turn, free at its
end, walks off in round 3. Grappled desc timing at I and III: grab turn / the foe's turn / his later turns.);
new **Stress Ball** suite (desc per level, dmg and heal exact per level, AP 1, cd 1, only the held foe and the reason
text, no Rage, the flare +2, heals on a kill and the hold is gone, full HP heals 0 with no log line, grab then squeeze
next turn, III's two squeezes per grab, no `heal` tag, appended to the pool, not a starter); previews == reality now
include Stress Ball on a held foe (the heal on Slate too); new **AutoPlay** suite (grab-and-squeeze sandbox at L1 / L2,
`holdValue` = HOLD_AI without Stress Ball, 0 on an immovable brute, exact values with it ready below half HP / missing
2 / at full HP, counted at cd 1 not fresh, not at cd 1 fresh; `stressScore` heal × 1.5 in the quick pass, 0 with
`ctx.autoplay`); the edge-case AI round comment fixed ("the III hold lasts through Slate's next 2 turns").

**Deviations from the spec (small; the contract deviation itself, the hold timing, is under "Deviations" above)**:
- `holdValue` tests `!(sl.cd > 0)` where the spec says `sl.cd === 0`: the same for real slots, and a slot without a
  `cd` field counts as ready.
- `tickHold` also returns for `st.turns < 0` (a permanent hold some future caller might set is never ticked away), and
  `grab` writes `st.data = st.data || {}` before the flag (the engine always creates `data: {}`; defensive only).
- `stressScore` and `holdValue` share one `healWorth(u, heal)` helper (the spec's formula, written once).
- Added `DD.Slate.releasesThisTurn(v)` (pure, exported, tested) for the prediction issue below; nothing calls it yet.
- The Hold Still suite's title now says "until the end of his next turn(s) (its own turns held as before)".

**Known issue (found while building; the spec doesn't cover it)**: the HUD threat shading (`DD.AI.reachOf`) and
AutoPlay's danger model (`mov: DD.Combat.cantMove(e) ? 0 : …`) read the hold as a snapshot ("can't move now"). Before the
retime that snapshot was right for the victim's next turn on every hero turn in between. Now it is wrong in two cases:
(1) on Slate's own release turn (I-II: his next turn after the grab) the held foe is shaded as reaching only the tiles
next to it, though he lets go at the end of that turn and it walks on its next turn (the Grappled tooltip does say
"lets go at the end of this turn"); (2) with a hero acting after the victim's held turn and before Slate's next turn
(order Slate, foe, ally), that ally sees it held although its next turn will be free. Gameplay is exact; only the
prediction is off (it makes AutoPlay a little careless once per grab). `DD.Slate.releasesThisTurn(v)` (pure, tested)
answers case (1).

**Requests**:
- **ENGINE / AUTOPLAY (AI owner; optional, not blocking)**: make the "can it move on its next turn?" predictions
  (`AI.reachOf` for the threat shading, AutoPlay's danger `mov`) skip a Grappled hold that ends first. Case (1): skip it
  when `DD.Slate.releasesThisTurn(v)`. General rule for the plan-aware danger model: the hold ends after
  `st.turns + (st.data.slaFresh ? 1 : 0)` more ends of its holder's turns (the current one included when he is
  acting), so it covers the victim's next turn only if fewer of those holder turn ends come before it in the plan. A
  generic alternative: an optional status-def query (e.g. `endsBeforeTurnOf(st, unit, plan)`) that these predictors
  honour; Slate would implement it.
- **DOCS (lead)**: DESIGN §6 Slate brief and `docs/notes/v2-digest.md` texts per spec §6 (Hold Still "until the end of
  his next turn", Stress Ball in the pool and the combos line).

### Test runs

- Isolated (`bash tools/test.sh "suite=hero_slate&isolate=slate"`): **26 suites, 2,058 assertions, 0 failures** (was 24 /
  ~1,908 before; the Hold Still suite had 5 expected failures from the retime before its rewrite). `suite=content:` with
  `isolate=heroes/slate,hero_slate`: Slate's skills all pass; Stress Ball, like Air Mail, logs "no valid target in the
  arena" (it needs a held foe; its previews are compared in `hero_slate: previews match reality`, with the heal).
- Full run (`bash tools/test.sh`, Nov 12 ~21:40, other owners mid-flight): 955 suites, 122,515 assertions ok, 21
  failures in 10 sections, **none of them Slate's**: engine attacks-of-opportunity ×3 (fixtures, engine files being
  edited), mapgen difficulty info (balance.js), hud boss wind-ups, balance pass-2 levers, hero_marwyn AutoPlay acts 2-3,
  bosses_act1 rat king Injunction, narrative tips ×2 (a flyers tip). All 26 `hero_slate` suites pass there (with the
  cast loaded: 2,083+ assertions; the cast combos 31), no swallowed `Error in …` warnings, no Slate mention among the
  failures. (An earlier full run at ~21:20 had 4 failing sections, the same non-Slate kinds.)
- AutoPlay sandbox (L1 / L2, Slate at 40% HP, a grunt next to him): Love Tap, Hold Still, Stress Ball on the same turn.
  Fixture battles (acts 1-3, 27 fights): all won; Hold Still 4 uses in 18 normal / elite fights (the elite is an
  immovable brute) and 9 in 9 boss fights.

## Review (sustain, Nov 12) — adversarial review: the user's intent and the rules text (ADVERSARIAL REVIEWER role)

**Verified by running code** (suites; scratch harness `.tmp/rev13/rt.js`: real encounters through `DD.Encounter.build` +
`DD.AutoPlay.runBattle`, real allies Zarathor / Kiri / Buga or Ellaria / Kiri / Zarathor, Slate with Hold Still +
Stress Ball at the same level I / II / III at hero level 2 / 4 / 6 against act 1 / 2 / 3 encounters; `tools/sim.sh`):
- The user's words, "a skill for healing while grappling something": Stress Ball is a skill, it only targets the foe
  Slate holds, desc == execute at I-III (3/4/5 damage, 4/5/6 heal, capped at max HP, heals on a kill, never revives,
  no Rage, the flare's +2 on the squeeze). It is not a turn-start check, so the audit's "Grappled lasts 1 turn at I-II"
  trap doesn't apply, and the retime gives him the hold through his next turn.
- **It fires in real fights at every level** (harness, 27 / 21 / 21 fights): Stress Ball 0.1 / 0.3 / 0.7 a fight
  (squeezes on the grab turn and on a later turn both happen at II and III; the later-turn squeeze at all three),
  0.4 / 1.7 / 3.9 HP a fight; Hold Still 0.5 / 1.0 / 1.1 a fight; his turns that start with a hold: 3 / 6 / 15. In the
  act 1 sim (`seeds=8&from=7000&stop=1&party=slate,basanos,sparrow,marwyn&dump=1`, 33 fights, no capped fight): Hold
  Still 1.1 a fight, Stress Ball 0.7 a fight when socketed (it was drafted for 3 fights). Why I is rare: in act 1 he is
  barely hurt (2.7 HP missing at his turn start on average), so AutoPlay prefers Love Tap's 5 damage — the decision the
  spec wants — and 9 of 13 grabbed act 1 foes die before his next turn. Tuning `HOLD_AI` is the balance pass's (spec §9).
- The retime, in real fights: victims stay held into his next turn (3 / 6 / 10 of 13 / 22 / 23 grabs; the rest died
  first), and on those turns AutoPlay squeezed, threw or dragged. Turn timing at I-III in both initiative orders: the
  Hold Still suite.
- Pronouns and tone: he / him in every new text; the barks, log, flavor and tips are in his voice.

**Fixed**
1. The retime tip said "Slate holds on until the end of his next turn", true only at Hold Still I-II (III holds through
   his next 2). Now: "Slate holds on at least until the end of his next turn: grab a foe, then drag it, throw it or
   squeeze it next turn." Regression (Stress Ball suite): the tip's wording, and at I and III a grabbed foe is still held
   on his next turn, where he throws it (Personal Space: lands, hold over) or drags it along (walks two tiles).

**Confirmed, not fixable here (engine; the Known issue / Request above stands, and it is common, not rare)**: the HUD
threat shading (`DD.AI.reachOf`) reads the hold as "can't move" for the victim's NEXT turn. Sandbox (order Slate, grunt,
mage): on the mage's turn — after the grunt's held turn, before Slate's next turn — the held grunt is shaded as reaching
only the tiles next to it, though the hold ends at the end of Slate's next turn, before the grunt acts again. This
happens on every grab where a hero acts between the victim and Slate. Gameplay and the Grappled tooltip ("lets go at the
end of his next turn") are exact; the shading and AutoPlay's danger term are not. A noMove-as-function workaround in
slate.js was rejected: it would change real movement (a two-turn foe) and the desc.

**Not changed (on purpose)**
- Grappled's tooltip header is the generic "N turns left" (ui.js), now counting Slate's turns; the desc right under it
  says exactly when he lets go.
- Stress Ball has no `canUse` reason: with nobody held the HUD's "No valid targets" hint already names the nearest foe's
  `canTarget` refusal ("Grab it first (Hold Still).", combat_hud.js `invalidReason`).

**Requests**
- **DOCS (lead)**: `docs/notes/v2-digest.md` D1 list of `target.objects: false` opt-outs (~:695) lacks Stress Ball
  (he squeezes the foe he holds, not a crate).
- ENGINE / AUTOPLAY: the reachOf / danger request above (case 2 is the common one).

**Test runs (review, Nov 12 ~20:45)**: isolated `hero_slate` (Stress Ball + definition suites after the fix: 2 suites,
554 ok) and `hero_basanos` (23 suites, 2,092 ok) green. Full `bash tools/test.sh`: **995 suites, 122,842 assertions ok,
4 failures in 2 sections, neither from the sustain run**: `balance: acts 2-3 levers (pass 2)` (3, waiting for phase 2's
late-boss rows) and `hero_marwyn: AutoPlay battles, acts 2-3` (1, "many different skills"; see hero-marwyn.md "Review
(sustain)"). No swallowed `Error in …` warnings. All hero_slate / hero_basanos / hero_sparrow / hero_hjalmar suites, the
kit suite and the Fanny Pack suite pass.

## Review (sustain, Nov 12) — engine, AutoPlay and tests (ADVERSARIAL REVIEWER role)

Probes in a scratch page (`.tmp/rev-engine/probe.html` + `probe.js`, run one at a time by `.tmp/rev-engine/run.sh`,
which takes a Chrome slot like `tools/test.sh`): real act 1 encounters (goblin ambush, rats, union meeting, Last Call,
Grimble, the Rat King) through `DD.Encounter.build` + `DD.AutoPlay.runBattle`, parties Slate (Hold Still + Personal
Space + Stress Ball) / Basanos / Sparrow / Marwyn or Hjalmar, levels 1 and 3; in-memory mutants (`&mut=`, no file on
disk changed); one `tools/sim.sh "seeds=6&from=7000&stop=1&party=slate,basanos,sparrow,hjalmar&dump=1"`.

**Verified (by running code)**
- The tick fires once per Slate turn and only there: `decay: 'never'` keeps the engine's turn-end decay off the status;
  Short Fuse's `onTurnEnd` runs from `finishTurn` before decay, also on a lost turn (a stun releases the hold first
  anyway). Hero passive hooks fire only for `kind: 'hero'` units, and nothing else uses `sla_grappled` or
  `DD.Slate.grab` (grep; `sprites.js` only reads the id), so no copy of Slate can hold without ticking.
- Previews and AutoPlay dry runs never heal, tick or log: over 20 AutoPlay fights every "like a stress ball" log line
  matched a real (non-simulated) `DD.Act.heal` from Stress Ball, one for one; dry runs heal only cloned units
  (`Targeting.simulate` deep-copies the state, and the hold lives on the victim's status, `st.data.slaFresh` included).
- AutoPlay grapples and holds: Hold Still 1.3 a fight and Stress Ball 0.55 a fight (always socketed) in the 20 probe
  fights; in the sim (23 fights, no capped fight) Hold Still 1.5 a fight and Stress Ball 1.0 when socketed. He squeezes
  when hurt (the squeeze log appears only with a real heal) and prefers Love Tap at full HP, as the spec wants.
- The tests catch the bugs that matter (in-memory mutants, each run once): the hold never ticking fails 20 assertions
  (Hold Still, Stress Ball, edge cases); ticking on the grab turn fails 35 (Hold Still, Stress Ball); a squeeze heal
  sourced to the victim (so Short Fuse gains Rage) fails 6 (Short Fuse, Stress Ball).

**Fixed**: nothing in Slate's files.

**Confirmed, not fixable in content (Request to ENGINE / AUTOPLAY stands)**: `DD.AI.reachOf` (HUD threat shading) and
AutoPlay's threat model (`mov: cantMove(e) || pinned(e) ? 0 : …`) read the hold as "can't walk on its next turn".
Since the retime that is wrong when Slate lets go before the victim's next turn: on his last hold turn, and for every
hero acting between the victim's held turn and Slate's next turn. A `noMove` function in slate.js can't fix it without
changing real rules: Betty's Kick 'Em While They're Down reads `cantMove` at the moment of the hit ("held count too"),
so a held foe must stay `cantMove` while it is held. The engine fix: in those two predictors, a `sla_grappled` victim
(or, generically, a status that declares when it ends) counts as able to move on its next turn when the holder's
remaining turn ends — `st.turns`, plus one if `st.data.slaFresh`, counting the current turn while the holder acts —
all come before the victim's next turn in `s.order`. `DD.Slate.releasesThisTurn(v)` answers the first case.

**Test runs (this review, Nov 12 ~21:00, one Chrome at a time)**: full `bash tools/test.sh` before the fix: 993 suites,
122,840 ok, 4 failures in 2 sections; after it: **994 suites, 122,859 assertions ok, 4 failures in 2 sections, neither
from the sustain run** (`balance: acts 2-3 levers (pass 2)`, 3, waiting for phase 2's late-boss rows;
`hero_marwyn: AutoPlay battles, acts 2-3`, 1, see hero-marwyn.md). No swallowed `Error in …` warnings. The new suite
(`hero_hjalmar: review (sustain) — …`) passes.

## Balance refit (Nov 12) — HOLD_AI 1.5 → 2.5 (BALANCE REFIT 1, spec §9 fallback; docs/notes/balance.md "Sustain refit - act 1")

- **Why**: in the real-encounter sims Hold Still was used 0.9 times a regular act 1 fight (elite 1.0, boss 0.6; act 1
  only, 300 runs, seeds 7000+), under the spec's 1.0 trigger (target 1.2). The pre-agreed fallback is `HOLD_AI` 2.5.
- **Change**: `HOLD_AI = 2.5` (AutoPlay only; no text changes; the hero suite's 1.5-2.5 bound holds).
- **Measured** (same seeds): regular fights 0.9 → 0.9, elites 1.0 → 1.1-1.3, bosses 0.6 → 0.6-0.7. His grabs are
  limited by reach (a liftable foe next to him at his turn), not by AutoPlay's price, so the knob is near its ceiling.
  Stress Ball is rarely socketed in act 1 (a pool pick: 17 of 247 regular fights) and used 0.2-0.4 times a fight when it
  is; 0.1 HP a fight overall. Not hot; nothing else changed. His run-win share: see balance.md.

## Finish (Nov 14) — the playtest findings held for the sustain build (FIX: CONTENT)

- **heroes-6 / desc-sweep-6 / review-open-3 (fixed, text)**: Short Fuse now says exactly what counts: "whenever someone
  else hits him, heals him or gives him a buff status (Block doesn't count)" — passive, Rage status desc and tip#1. The
  rule is unchanged (an ally's Block fires no hook; making it count needs an engine hook on Act.addBlock: not asked
  for, and a balance change). DESIGN §6 needs the same words (request below). Suite `hero_slate: finish — Short Fuse
  says what counts …` (Forge Armor on Slate: Block, no Rage; Forge Weapon: +1).
- **heroes-v1 / desc-sweep-5 / review-open-7 (fixed)**: Hard Pass and Get Over Here print `DD.Targeting.reach`; the
  throws (Personal Space, Air Mail) print their throw distance = the reach less the lift tile, so a Yardstick and the
  Mitts both show ("up to 4" with either). Get Over Here pulls the foe all the way in from however far it reaches
  (`max(L.range, dist − 1)`), so "pull it next to you" stays true with +2 range. Suite `hero_slate: finish — range
  texts …`.
- D1: the Boulder says "5 HP: Smash it, or any single-target damage skill can break it." Opt-outs kept, each with its
  reason in the code: Hold Still, Rock Bottom, Stress Ball (he grapples / slams / squeezes foes, never crates).
- **audit-8 (Slate 0.54x)**: see docs/notes/balance.md "Finish (Nov 14)".
- D7: two swap barks. Slate starts swaps (D2); nobody can swap him.

Requests:
- DOCS: DESIGN §6 Slate (~line 487): "he gains 1 Rage (max 5) whenever someone else hits him, heals him or gives him a
  buff status (Block doesn't count)".
- **audit-8 (fixed): move 3 → 4.** The audit's two levers measured on the same 200 seeds with Slate in every party
  (`.tmp/wf14/content/sim/sim.sh … with=slate`, the current files): baseline 23.5% of runs won; Love Tap 5 → 6 23.5% (no
  change, rejected); move 4 28.5% (act 1 cleared 57% → 64%, 33 → 38 damage a fight). Landed: tempo was the limiter (the
  audit: "move 3, init −2, melee"). Init −2, his HP, armor and kit are unchanged; he is still the slowest to act. The
  normal campaign with it: docs/notes/balance.md "Finish (Nov 14)". Suite `hero_slate: finish — move 4 …`.
- DOCS request: DESIGN §6 Slate's stat line "move 3" → "move 4" (wherever his move is given).

## Review (finish, Nov 14) — REVIEWER

- **audit-7, the content half (fix:engine's request): Grappled answers `heldThrough(st, v)`.** The engine's
  `DD.Act.cantMoveNext` (threat shading, AutoPlay's danger model) asks a noMove status whether it still holds when the
  victim's next turn starts. Grappled counts SLATE's turn ends (decay 'never'), so it answers: still held when the turn ends
  of his that come first (the one under way, if he is acting, + `DD.AI.turnsBefore(slate, victim)`) are fewer than
  `turns` (+1 on the grab turn, `slaFresh`); a stale hold (`holdOk` false) is free. Hold Still I: the grab turn predicts
  the victim's next turn held, his next turn predicts it free, and both come true; III: still held. Suite `hero_slate:
  finish review — Grappled tells predictions …` (fails without the hook).
- D2 re-played with the real Slate: he starts a swap with Kiri; Kiri is refused "Slate is immovable: he can start a swap,
  you can't move him."; Human Shield and Step In list no Slate. A swap while he holds a foe lets it go ("Test Grunt is
  free.": the tile it would be dragged into is the ally's now) — consistent with "free once they are apart"; the swap
  preview doesn't warn about it (HUD, polish).
- Campaign check (review batch, 200 normal runs, seeds 53000+): Slate's parties won 29% against a 29% median (1.0×; the
  content batch: 0.78×; the audit: 0.54×). n = 52 runs, so ±0.2×.
