# BOSSES-ACT1 notes: Grimble and the Rat King (Act 1 bosses) — v2

Files: `js/data/bosses/grimble.js`, `js/data/bosses/ratking.js`, `tests/content/bosses_act1.js` (21 suites
`bosses_act1: …`). Isolated runs:
`bash tools/test.sh "suite=bosses_act1&isolate=bosses/grimble,bosses/ratking,bosses_act1"` (the sims then use the
fixture party at level 4) and `bash tools/test.sh "suite=content:&isolate=bosses/grimble,bosses/ratking,bosses_act1"`.
Full-content sims (real heroes at the v2 act 1 level 2, Blessings rolled): `bash tools/test.sh "suite=bosses_act1:
grimble autoplay,bosses_act1: rat king autoplay&verbose=1&sims=48"`; params `per=1`, `log=<i>&tail=<n>` (the last n
log lines of fight i), `party=a,b,c,d`, `level=n`, `fixture=1`, `tune=<def.path:value,…>` (e.g. `grcfg.noHint:true`,
`rkcfg.valveCd:3`, `grimble.hp:170`, `rat_tails.levels.0.dmg:8`).
Scratch (v2): `.tmp/bosses-act1-v2/` — `run.sh` + `sim2.html/js` (fast boss sims with real heroes:
`PAGE=sim2.html bash .tmp/bosses-act1-v2/run.sh "enc=grimble|rat|both&n=48&level=2&party=random&bless=1&items=2&from=300&tune=…&per=1&trace=<i>"`),
`camp.sh` + `camp.html/camptrace.js` (a `tools/sim.sh` campaign that also dumps the log of every boss fight of `minr`+
rounds and the boss's reach from round `dbgr`), `descs.html/js` (every boss text as the player reads it). All of them
take a Chrome slot (`tools/chrome_slot.sh`).

## v2 summary (what changed from v1)

Both bosses: **two initiative entries a round** (`turnsPerRound: 2`, init +2). A solo boss with one turn a round did
too little against four heroes acting one by one (the act 2/3 bosses bring more minions and bigger single turns);
two turns with one action each keep every turn readable. Each turn: **walk, then ONE action** (a reaction to who is
next to him, else the next step of a fixed docket that the inspect panel names: "next: Levy"), then wind-ups.
**Wind-ups** (`api.windUp`, banner + marked tiles + ⏳) are the 1-2 big attacks per boss; they land **one round
later, at the start of the same turn of his** (`turns` = his entries a round, the engine's hero window switched off for
them: every unit, so every hero, gets exactly one turn in between, whatever the order of his two entries). Stun /
sheep / death interrupt them (engine); the stun guards still let a stun cancel the wind-up. Everything else happens at
once. No combat-start Block anywhere. Minions act on their own initiative. Planners pick reach-aware targets, price
attacks of opportunity (`api.aooCost`) and never walk into a lethal one. Neither boss has a melee basic, so neither
makes attacks of opportunity (intended: Grimble is a desk goblin, the Rat King's threat is the reel + pile; their
minions hold the line: interns' Paper Cut, lawyers' Billable Bite, plaintiffs' Nibble).

### Grimble, the Goblin Tax Collector (`grimble`, encounter `boss_grimble`)
Arena unchanged from v1 (12×12 tax office, DROP ZONE under the vault door, three Tax Loophole levers, filing cabinets
for cover, interns from the break-room doors). **160 HP**, move 1 (+2 in phase 2), fire ×1.25.
- Each turn: **Rubber Stamp of Denial** (11 + push 2 on the 4 adjacent tiles; cooldown 1 = never two of his turns in a
  row) if a hero is next to him, otherwise his docket **Levy, Red Tape, Levy, Hire Intern** (phase 2: Garnish Wages,
  Hire Interns, Garnish Wages, Red Tape). Then, if none is pending, he winds up an **Audit** (18 to every hero in a
  whole row or column through the heroes; phase 2: a crossing row + column).
  - **Levy** 11 + steals up to 10 party gold, Block = half the gold, rounded up (range 7, **line of sight**: a cabinet is cover; a
    Levy step with nobody in sight is wasted). Target: the biggest spender (most damage dealt).
  - **Red Tape** 3 + Root 1 turn, anywhere (no line of sight); prefers a hero standing in the pending Audit's lane
    (rooted, they can't walk out of it) — the designed combo; counterplay: stun him (cancels the Audit), dash or
    teleport out (not move actions), get pushed out by a friend.
  - **Hire Intern**: 1 (cap 3); phase 2: 2 Hasted (cap 4). Goblin Interns (7 HP, Paper Cut 4 + Bleed 1) walk to
    exploited loopholes and close them the moment they stand next to one.
- **Ill-Gotten Gains** (status `grim_ledger`, stacks = gold he holds): +1 damage per 10 gold on every attack but the
  Audit (max +8). Refunded raw (no Trust Fund interest) when the vault hits him or he dies.
- **Appeal Pending** (stun guard, 3 of his turns after a stun-like / charm): no second stun or charm lands, but a stun
  still cancels his Audit; the vault door always lands.
- **Phase 2 "Hostile Takeover"** at 50% HP **or from round 10 ("the fiscal quarter ends")**: banner, narration, bark,
  2 Hasted interns at once, crossing Audits, the Levy becomes **Garnish Wages** (13 + 15 gold, any range, no line of
  sight), +2 move: he leaves the desk to stamp people (walks back on hiring steps). The round-10 takeover is v2's
  anti-stall: a lone healer hiding behind a cabinet in phase 1 took no Levy and dodged every Audit (a campaign sim hit
  the 30-round cap that way).
- **Puzzle — the Tax Loopholes** (unchanged): exploit all three (1 AP each) and the vault door drops on the DROP ZONE:
  everyone there loses all Block, takes 36 and is Stunned (Grimble for **both** of his next turns, his Audit
  cancelled), Grimble is Vulnerable (4 of his turns) and every coin he holds spills back. Phase 1 he never leaves the
  zone. After a drop the loopholes are under review 3 rounds (+2 per later drop). AutoPlay hint (`loopholeValue`):
  progress pulls 16+, 6 if an intern can reach an exploited loophole next turn, the last pull = 60 when Grimble (and no
  hero) stands in the zone. Wind-ups don't change it (it reads the zone, not intents).

### The Rat King and the Rat Bar Association (`rat_king`, encounter `boss_rat_king`)
Arena unchanged (13×12 sewer junction, channels A/B draining west into the Big Drain, rotten floor, valve A on the
island, valve B on the party walkway). **150 HP**, move 5, immovable (only sewer water moves him), immune to Sleep and
Frozen, poison ×0.5.
- Each turn: a **Rat Pile** (7 + Bleed 1 on all 8 tiles around him) when **three or more heroes, or a Rooted one**, are
  next to him (`CFG.crowd` 3; 2 made him ~10% harder), otherwise his docket **Tangled Tails, Gnaw, Tangled Tails,
  Sewer Surge** (phase 2: Tails, Surge, Tails, Gnaw; phase 3: Tails, Surge, Class Action, Gnaw).
  - **Tangled Tails** 6 + pull 2 + Root 1 (range 1-6, sight): reels a hero next to him, Rooted → next turn the Pile.
  - **Gnaw** (wind-up): up to 2 rotten tiles near heroes (3 from phase 2): 8, then they collapse into pits (a hero on
    one falls: 25% max HP). **Sewer Surge** (wind-up): the channel with heroes in it (phase 3: both): 8, then
    everyone in it but him is washed into the drain. A wind-up step with one still pending, or nobody to catch,
    throws the **gavel** (10, range 1-6, sight) instead. **Class Action** (phase 3): 2 Plaintiff Rats (cap 3).
  - Ranged target score: the hit's damage **capped at what the hero has left**, +10 for a knockout, +12 for a reel
    (Tails on a hero 1-3 tiles away), up to +4 contempt of court (most damage dealt). The cap is v2's loop breaker:
    with "a sure knockout first" he re-floored the same freshly helped-up hero forever while two helpers stood by (a
    fixture sim hit the 30-round cap); as the swarm grows a healthy hero is worth more.
  - **Scurry**: boxed in with no tile to walk to (his corner, the barrel and a downed hero: bodies can't be walked
    through) **and nothing to do from there** (no Rat Pile, nobody in reach of Tails or the gavel), the swarm teleports
    to the free tile within his move closest to the party (log line, "Scurry!" text). It stalled a campaign fight for
    25 rounds before. Heroes who surround him get piled on, not scurried away from (review fix).
  - He never ends a walk on a tile of his own pending Gnaw (−60 in `moveKing`): standing on it when it lands dropped
    him into the pit (the fall hook makes that a flat 30, a free flush for the party).
- **Swelling Ranks** (`rat_swarm`): +1 stack every round from round 2, **+1 damage per stack, no cap**, on his at-once
  attacks (not on wind-ups: it grows at the round start, after the heroes' last look at them). A flush washes it away.
- **Recess** (stun guard, like Grimble's). The flush always lands.
- **Splits** at 66% / 33% (not on the killing blow): 2 Rat Lawyers each time (14 HP, OBJECTION! 7 + push 1, Cease
  and Desist 4 + Root 1 (likes heroes near the King), Billable Bite 6 = their attack of opportunity; max 3, 2 at start).
- **Puzzle — the sluices**: Crank Sluice (1 AP) washes everyone in its channel into the drain: lawyers / plaintiffs
  drown (environmental kills), heroes lose 25% max HP and climb out dry, the King is **FLUSHED**: 30 damage, Stunned
  for both of his next turns (wind-ups cancelled), Wet, Swelling Ranks gone. **Each valve needs 4 rounds** (v1: 3; at
  3 the flush made the fight an ~80% win). Nothing in the channel shields him (downed heroes, flyers, immovable
  summons are swept past). AutoPlay hint (`valveValue`): King in the channel 55, each other enemy 18, each hero −30.

## Balance (v2)

Target (user, latest playtest): **hard but fair** — a well-played party beats the first boss about 60-70% of the time;
the act 1 boss is met around level 2.

**Campaign sims** (`tools/sim.sh "seeds=N&from=S&stop=1"`, normal, random 4-hero parties of all 16, AutoPlay plays
every fight, items / Blessings / consumables from the run; party level at the boss avg 2.0-2.1), final content:

| sample | Grimble | Rat King | act 1 cleared |
|---|---|---|---|
| 200 runs, seeds 15000+ | 61/101 (**60%**), 8.9 rounds, 3.0 downs | 65/97 (**67%**), 9.8 rounds, 2.5 downs | 63% |
| 120 runs, seeds 12000+ | 44/57 (**77%**), 8.1 rounds, 2.2 downs | 41/61 (**67%**), 9.6 rounds, 2.7 downs | 71% |
| together | **105/158 = 66%** | **106/158 = 67%** | |

Boss fights: party HP lost ~55%, someone goes down in ~78% of them, no timeouts (0 in 990 + 629 fights).
Before this pass (first sample, 60 runs): Grimble 64%, Rat King 83%.

**Boss sims** (`sim2`, 48 fights per line, random real parties at level 2, Blessing per level, 2 random items):
Grimble 63 / 73 / 63% (plain level 2 without items or Blessings: 50 / 42%), Rat King 67 / 65 / 67% (plain: 54 / 46%).
Fixture party at level 4 (the isolated test guard): Grimble ~40%, Rat King ~60-70%, 11-13 rounds.

What tuning showed:
- The v1 numbers mostly held. Under v2 the Rat King was the easy one (80% with items): the flush (30 + two lost turns +
  swarm reset) every 3 rounds per valve carried fights. Valve cooldown 4: −13%. HP 170/180, Tails 8, Pile 9, gavel 12,
  each alone: within noise (±8% at n=48).
- Grimble: HP 150 → 160 (−5% in sims). A Red Tape fallback for blind Levy steps (tried as the anti-stall) took him from
  68% to 43% (Red Tape → Audit landed every round): dropped for the round-10 takeover, which changed nothing measurable
  (fights end by round 9-10) but ends stalls.
- Stalls found and fixed: Rat King help-up loop (targeting cap), boxed-in Rat King (Scurry), Grimble vs a lone hero
  behind cover (fiscal quarter). Fixture and campaign sims: 0 timeouts after.

## Public API (for other authors)

- `DD.GrimbleBoss`: `def`, `zoneTiles(s)`, `loopholes(s)`, `vaultTile(s)`, `lane(kind, idx)`, `data(s)` (puzzle counters
  `{ pulls, drops, hits, refiles, jam }`), `dropVault(src)`, `threatened(l, s)`, `levyTarget(unit, from, foes, skillId)`,
  `fx.door`, `fx.paper`, constants `VAULT_DMG, GAIN_PER, GAIN_MAX, REVIEW_ROUNDS, PHASE2_AT, QUARTER_END, PHASE2_MOV,
  GUARD_TURNS, P1, P2`, `reviewRounds(n)`, `cfg` (sim knobs: `noHint, gainPer, gainMax, p1, p2, vaultStun, quarterEnd`).
- `DD.RatKingBoss`: `channels(s)`, `chanTiles(chan, s)`, `rotTiles(s)`, `valves(s)`, `flood(chan, src, { exempt })`,
  `phaseOf(unit)`, constants `FLUSH_DMG, VALVE_CD, LAWYER_CAP, SPLITS, PATTERNS, SWARM_MAX, GUARD_TURNS`, `cfg`
  (`lawyerCap, valveCd, wade, swarmDmg, swarmFrom, crowd, flushStun, noHint`).
- Reusable: enemies `grim_intern`, `rat_lawyer`, `rat_plaintiff`; statuses `grim_ledger`, `rat_swarm` (+damage for their
  boss only); terrain `rat_rot`; objects `grim_cabinet` (generic destructible cover), `rat_valve` (needs `rat_chan*`
  tags). Puzzle counters: `state.data.grim`, `state.data.rat` (`{ sluices, flushes, drowned }`).

## Deviations

- **Two turns a round** for both act 1 bosses (`turnsPerRound: 2`; DESIGN §9 allows it "if its design needs it").
- **Wind-ups land one round later** (at the same turn of his), not "at his next turn": with two entries his next turn
  can follow at once. `windUpRound()` sets `turns` = his entries and `intent.window = 0` (re-set in `onTurnStart`) so
  the engine's hero window doesn't add a second round when his entries are back to back.
- Puzzle objects carry their callbacks on their own defs and per-instance state in `obj.data` / `obj.label` (from the
  layout legend; survives previews and deploy rewinds).
- Phase numbers live in `slot.level` (Hire Intern L2); Garnish Wages is its own skill (line of sight isn't per level).
- The Rat King's drain fall deals exactly the flush's 30 (`modifyIncomingDamage` on `cause: 'fall'`).
- Grimble's arena uses the `cellar` theme.
- Stun guards exempt the puzzle stuns through a module flag set while the puzzle applies them.
- The flood pushes with `bump: 0` and drops anyone it couldn't carry into the drain (`DD.Act.fall`).
- Swelling Ranks and Ill-Gotten Gains don't apply to wind-ups (each wind-up's `telegraphFlat` cancels the status flat
  the engine adds): both grow between the heroes' last look and the landing.
- Scurry (a teleport out of a box) and the round-10 takeover are boss-specific anti-stall rules, stated in the codex /
  passive / log.

## Requests

- **RULES / ENGINE (optional)**: a boxed-in AI unit has no fallback in the engine (bodies of downed heroes can't be
  walked through and the default planner just passes); the Rat King now scurries, but any big immovable enemy in a
  corner can stall the same way. A generic rule ("a unit with no reachable tile may squeeze past downed bodies") would
  cover everyone.
- **ENGINE (log noise, optional)**: re-applying a status a unit already has logs it again ("The Rat King is Wet." once
  per channel tile he wades through, 4-6 lines a walk; heroes in water too). Logging only a new status (or a real
  change of stacks / turns) would clean the combat log up.
- **AUTOPLAY**: the request in `docs/notes/autoplay.md` to the boss owners is done (one action a turn + a wind-up; the
  gavel no longer "always goes for the most hurt hero").

## Known issues

- Win rates swing ±8-12% between samples (AutoPlay is chaotic: deployment, initiative and random parties); the test
  guard (10 fights) is deliberately loose (winnable, hurts, 4-14 rounds, AutoPlay engages the puzzle, no timeouts).
- AutoPlay pulls the last loophole only with Grimble (and no hero) in the DROP ZONE: ~1-1.5 drops a fight; a human can
  line up more.
- Every planning move through a channel logs "The Rat King is Wet." (core water `onEnter`).
- The Rat King's robe hem reads flat in the gallery's big view; the vault door hangs above the zone's north-east corner.

## Requests (Nov 3) — content sweep for the user's v2 requests (flyers, barrels, aimed heals)

Neither boss flies; their puzzles stay walker puzzles (levers, valves, loopholes: interactions, not floor effects).
- **Rat King**: the flood (sluice and Sewer Surge) already skipped flyers, the rot's collapse never drops a flyer
  (engine), the valve hint already ignored flyers. Texts now say so: the sluice and Sewer Surge "(flyers stay dry)", the
  rotten floor "(flyers just hover)". Gnaw's planner scores a flyer's rotten tile 8 instead of 20 (it only takes the
  bite, no fall), so walkers' tiles are picked first. Surge and Gnaw damage still hit flyers (aimed areas).
- **Grimble**: the vault door falls from above, so it still flattens a flyer in the DROP ZONE (not a floor effect; the
  zone desc says "everyone here"). No change.
- **Barrels**: the sewer arena's `X` barrels are the core `barrel_explosive` (volatile): heroes can shoot them now, the
  blast credited to the shooter. No boss object explodes (the filing cabinet bursts into smoke, a cloud). **Aimed heals**:
  no hero-usable skill here.
- **Tests**: `bosses_act1: v2 requests (Nov 3) — …` (12 assertions: Gnaw on a walker vs a flyer, the walker's tile picked
  first (mutation-checked), the texts, the vault door on a flyer, a hero's attack setting off a sewer barrel).
- **Request (AUTOPLAY, known)**: in an ISOLATED run (`isolate=bosses`: the fixture party) 1 of 10 Rat King sims times
  out in a Help-Up loop (the knight and the mage help the cleric and the rogue up every round, the King downs them
  again: 31 rounds, 36 downs), so `bosses_act1: rat king autoplay sims` fails its no-timeout check there. The full run
  (real heroes) passes. It is the v2-digest AutoPlay item "Help-Up loop against a boss"; it was failing before this sweep.
- **Rotation (box props, plan `.tmp/wf7/rotation-design.md` §7 P2)**: Grimble's loophole, vault, desk and filing
  cabinet are `yawAware: true`, so their boxes stand on the view's ground quad and turn with the board. Details keep their
  yaw-0 coordinates and are moved onto the view by `onFace` / `onTop` (exactly `[px, py]` at yaw 0), or drawn along each
  face's bottom edge (`f.x0 … f.y1`, the same numbers at yaw 0). Each detail stays on its physical side and hides when that
  side faces away:
  - the vault's gold-stuffed opening on the south (toward the drop zone), rivets on its other sides;
  - the cabinet's handles and escaping paperwork on the south, its damage dent on the east, drawer seams all round;
  - desk papers, quill and stamp stay on the top.

  The hoisted door hangs at a ground point over the dais and is drawn behind the vault when it hangs on the far side.
  Tags, stamps, levers and glows near a box's middle stay billboards. The default view is pixel-identical: per-state
  painter hashes, the frozen `renderTo` arena and `tools/shot.sh` at rot=0 were compared before and after (scratch under
  `.tmp/wf7/boxes/`). Suite: `bosses_act1: grimble's office furniture turns with the map (box props, yawAware)`, 25
  assertions.

## Review (v2)

Adversarial review of the v2 conversion (attacks of opportunity + reach-aware targeting in place), done by running
code: the isolated and full suites, scripted probes and instrumented AutoPlay sims (scratch: `.tmp/ba1v2rev/`,
`probe.sh "suite=probe&verbose=1&probe=p1.js"` / `p2.js` = sims that log wind-up fairness, AoO counts, scurries and
non-flush King falls), screenshots of both fights, and a fresh 100-run campaign sample.

**Verified (no change needed)**
- Wind-up fairness: in 144 instrumented AutoPlay fights (real heroes, level 2, rolled initiative, ~1000 wind-ups) every
  hero who was up when a wind-up was announced and still up when it landed got a turn in between. The only "misses"
  were heroes downed inside the window (helped up later), as intended. Stuns and flushes interrupt; the guards still let
  a stun cancel; bosses are sheep-immune (engine).
- Attacks of opportunity: neither boss ever makes one (the Rubber Stamp and the Rat Pile are 'self' skills, which the
  engine's `opportunitySlot` never picks); interns (Paper Cut), lawyers (Billable Bite) and plaintiffs (Nibble) do.
  Both bosses' walks are priced (`api.aooCost`) and they take a few hero AoOs per fight.
- Every desc against its execute at every level (Hire Intern L1/L2 included); the docket and the wind-up texts the
  inspect panel shows; caps on every add (no endless spawns); phases land (Grimble's phase 2 in 47/48 sims); no timeouts.
- Visuals: Audit lanes, Gnaw tiles and the Sewer Surge channel read clearly with their numbers; the vault drop, the
  VOID tags and the valve gauges are readable.

**Fixed**
1. **Rat King scurried away from a surround** (probe: 4 heroes around him in the open → "Boxed in, the Rat King
   scatters..." and a Tails instead of a 4-hero Rat Pile). Scurry is an anti-stall; it now fires only when he is boxed
   in AND has nothing to do from there (`stalled`: no Rat Pile, nobody in Tails / gavel reach). A boxed-in King who can
   attack can't stall anyway: Swelling Ranks grow every round.
2. **Rat King could stand on his own pending Gnaw tile** (`pathRisk` ignores own intents; probe: on the tile at landing
   he fell in for the flat 30 of the fall hook, a free flush). `moveKing` now scores his marked Gnaw tiles −60.
3. **Levy / Garnish Wages desc said "1 Block per 2 gold"** but the code gives half rounded up (3 gold = 2 Block, 7 = 4).
   The descs now say "Block equal to half the gold stolen (rounded up)"; a test pins the wording.
- Tests: 3 new asserts in "rat king previews and edge cases" (surround → pile, boxed-in with a hero in reach → lashes
  instead of scurrying, keeps off his marked Gnaw tile; all three fail without the fixes), 2 in "grimble attacks deal
  exactly what they say" (the Block wording).

**Balance check** (after the fixes): `tools/sim.sh "seeds=100&from=31000&stop=1"` → Grimble 36/52 (69%), Rat King
33/47 (70%), act 1 cleared 69%, boss fights 9.1 rounds, someone down in 76% of them, 0 timeouts. Pooled with the
author's 316 runs: **Grimble 141/210 = 67%, Rat King 139/205 = 68%** — on target. Boss-only sims with Blessings and no
items (`p2.js`, 48 fights, seeds 500+): Grimble 48%, Rat King 42% (the plain-party floor the author also saw).

**Observations (left as is)**
- The Rubber Stamp is the biggest single source of hero damage in Grimble fights (~17 HP per boss fight, the top
  "downs by cause" line). It is his anti-crowd move (never two of his turns in a row, no AoO), and melee heroes' run
  win rates in this sample are within noise of the ranged ones, so no change; worth watching after playtests, given
  the "melee feels weak" feedback.
- Red Tape + a pending Audit is a near-sure 21 on one hero every other round in phase 1 (designed combo; counters:
  stun him, dash / teleport out, a friend's push).

## History (v1, kept short)

v1 (pre-initiative) had telegraphed intents, several actions per boss turn and Guard; its review fixed the unblockable
flush, honest telegraph numbers for the tails-into-pile combo, the stun guards, killing-blow splits, raw refunds, the
loophole hint and log noise (`git log` of this file for the full text). The v1 core fix in `js/engine/ai.js`
`describe()` (a `los: false` tracking intent reads "fizzles if out of range.") still stands.
