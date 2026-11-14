# BALANCE — notes (shared by the balance passes; each pass adds its own section)

Files: `js/data/balance.js` (`DD.Balance`), `tests/balance_tests.js` (deterministic guard rails, no sims). Sims:
`tools/sim.sh` (`tests/sim/sim.js`). Pass 1's scratch harness `.tmp/bal1/sim.sh` loads the same page plus a read-only
add-on (`.tmp/bal1/split.js`: every fight kind split by a starting healer, run wins by healer count, act 1 normal fights
by their place in the run, experiment params `kit=`, `startskill=`, `helpup=`, `tune=`). Reports: `.tmp/bal1/runs/`.

Healer split everywhere below: **H** = a party with Ellaria or Josiah (the two heroes who start with an ally heal), **X**
= a party with neither (55% of random parties). "HP lost" = party HP at the start minus at the end over max HP (downed
= 0), as in the digest; "downs" = fights in which a hero went down.

---------------------------------------------------------------------------------------------------------------------

## Pass 1 — act 1 and the healer gap (BALANCE PASS 1)

> **Superseded in part (Nov 12, "Sustain refit - act 1" below):** the First-Aid Fanny Pack left the starting kit (D9; it
> is ordinary common loot now) and the act 1 rows were re-fitted (regular fights ×1.3 damage, bosses ×0.9 HP / ×1.35
> damage). The Bucket of Ice Water, the act 1 elite row and the `[balance]` kit read in `newRun` stand.

### What changed (shipped: Q2 + an act 1 elite row; the first attempt's V1 is under Experiments / Validation)

All in `DD.Balance` plus two new pieces of kit:

1. **Every party starts with a heal that lasts the run and a revive.**
   - `DD.Balance.start = { consumables: ['con_ice_bucket'], items: ['first_aid_fanny_pack'] }`.
   - `DD.Run.newRun` puts the consumables in the pockets and equips the item on the first hero with a free trinket slot
     (a `[balance]` read in `js/run/run.js`, see Deviations). Unknown ids are skipped; the pockets cap the consumables.
2. **New item: First-Aid Fanny Pack** (`first_aid_fanny_pack`, common trinket, `js/data/items.js`): "At the start of your
   turn, the most hurt of you and the allies next to you (not a downed one) heals 3 HP." An ordinary common otherwise
   (loot and shops prefer what the party doesn't own, so a party wearing one is not offered a second).
3. **New consumable: Bucket of Ice Water** (`con_ice_bucket`, common, 25 gold, 1 AP): "Splash a downed ally within 2: they
   get back up with 50% of their max HP." Target filter `downedAlly`: only a downed ally can be targeted, so it waits for
   the moment it matters (in AutoPlay: mostly the act 1 boss). It drops / is sold like any common (15 consumables now).
4. **Act 1 hurts more, to pay for the kit** (per-fight-kind act rows, new in `B.scale`: difficulty × act × act-kind row ×
   kind × encounter; a row reaches only that act's fights of that kind):
   - regular fights `act[1].normal = { hp: 1.15, dmg: 1.4 }`;
   - elites `act[1].elite = { hp: 1.05, dmg: 1.2 }` (so they stay harder than the regular fights: without it the act 1
     elites lost 9% of the party's HP against 14% in a regular fight);
   - bosses `act[1].boss = { dmg: 1.2 }` (HP unchanged: the fights don't get longer).
   Acts 2-3 are untouched.

Also: `DD.Balance.restore(snap)` drops knobs added after the snapshot (it is exact now); `tests/balance_tests.js` (new);
the act 1 elite guard in `tests/content/enemies_act1.js` is 1.1× the normal fights' HP share (was 1.2×).

Nothing in the act 1 bosses' or enemies' own files, the generic skills, the passives or the Blessings changed (boss levers
tried and dropped below). The Red Drink is no longer in the kit (it was drunk in the first fights; Q2 vs Q1/Q3).

### Numbers (V1, the first attempt's config; the shipped config's numbers are under Validation)

Act 1 only, 300 runs, normal (`.tmp/bal1/sim.sh "seeds=300&from=5000&stop=1"`, same seeds before / after):

| | before | after |
|---|---|---|
| act 1 cleared (X / H) | 68% (56% / 83%) | 68% (52% / 88%) |
| act 1 boss won: all / X / H | 69% / 58% / 83% | 71% / 57% / 89% |
| Grimble X / H · Rat King X / H | 59% / 81% · 57% / 86% | 57% / 92% · 56% / 86% |
| act 1 normal fights: won · HP lost · fights with a down · downs a fight | 100% · 13% · 17% · 0.28 | 99% · 15% (gross 27%) · 27% · 0.51 |
| … X parties / H parties: fights with a down | 24% / 9% | 36% / 15% |
| … the run's first fight: HP lost · with a down | 19% · 6% | 21% · 10% |
| act 1 elites: won · HP lost · with a down | 99% · 20% · 29% | 99% · 18% · 34% |
| kit used (300 runs) | — | Red Drink 309, Bucket 194 |

VALIDATION (fresh seeds and whole campaigns): see "Validation" below.

### Experiments (act 1 only, 300 runs, seeds 5000-5299, normal; boss all / X / H · normal fights HP lost / with a down / won · act 1 cleared (X / H))

| id | change (scratch params) | act 1 boss | act 1 normal fights | act 1 cleared |
|---|---|---|---|---|
| base | — | 69 / 58 / 83 | 13 / 17 / 100 | 68 (56 / 83) |
| E1 | kit 2 Red Drinks | 67 / 56 / 82 | 11 / 12 / 100 | 67 (55 / 82) |
| E2 | kit 1 Big Red Drink | 71 / 61 / 84 | 11 / 13 / 100 | 70 (60 / 84) |
| E3 | act 1 normal ×1.3 dmg ×1.15 HP | 67 / 49 / 86 | 19 / 34 / 96 | 58 (39 / 83) |
| E4 | E3 + kit 2 Red Drinks | 67 / 56 / 80 | 17 / 26 / 97 | 61 (46 / 79) |
| E5 | Help Up revives at 40% (scratch patch of the engine) | 70 / 60 / 84 | 13 / 17 / 100 | 70 (59 / 84) |
| E6 | E3 + First Aid socketed on every hero | 88 / 85 / 92 | 7 / 13 / 100 | 87 (84 / 92) |
| E7 | E3 + kit 2 revive-only "salts" (50%, range 2) | 73 / 59 / 89 | 18 / 34 / 97 | 67 (52 / 88) |
| F0 | act 1 normal ×1.2 dmg ×1.1 HP | 69 / 57 / 84 | 17 / 29 / 98 | 65 (51 / 84) |
| F1 | F0 + kit 2 Red Drinks | 72 / 58 / 89 | 14 / 20 / 98 | 68 (52 / 88) |
| F2 | F0 + kit 2 salts | 75 / 64 / 88 | 16 / 27 / 99 | 73 (62 / 88) |
| F3 | F0 + kit Red Drink + salts | 76 / 67 / 88 | 15 / 24 / 98 | 74 (62 / 88) |
| G1 | normal ×1.25 / ×1.1, kit Red + salts, act 1 boss ×1.12 HP | 67 / 51 / 86 | 15 / 27 / 99 | 64 (47 / 85) |
| G2 | same, act 1 boss ×1.12 damage instead | 69 / 55 / 85 | 15 / 27 / 99 | 65 (51 / 85) |
| H1 | boss ×1.1 dmg + Grimble's Levy and the Rat King's "contempt" count healing done + Swelling Ranks capped at +6 | 69 / 54 / 88 | 15 / 27 / 99 | 66 (50 / 87) |
| H2 | H1 without the boss damage | 72 / 58 / 88 | 15 / 27 / 99 | 68 (54 / 88) |
| **V1** | **shipped** (files: normal ×1.25 / ×1.1, kit Red Drink + Bucket) | **71 / 57 / 89** | **15 / 27 / 99** | **68 (52 / 88)** |
| V2 | V1 + act 1 boss ×1.06 damage | 66 / 53 / 82 | 15 / 27 / 99 | 63 (49 / 82) |
| P1 | V1 + a heal-aura trinket in every starting kit (`kititem=bal_fanny_pack`: at the wearer's turn start, it or the most hurt adjacent ally heals 3) | 84 / 77 / 93 | 11 / 21 / 100 | 83 (75 / 93) |
| P2 | P1 + act 1 boss ×1.1 damage | 76 / 67 / 88 | 11 / 21 / 100 | 75 (66 / 88) |
| Q1 | kit Bucket only + the trinket, normal ×1.4 dmg ×1.15 HP, act 1 boss ×1.1 dmg | 73 / 62 / 86 | 15 / 32 / 98 | 69 (56 / 86) |
| **Q2** | **Q1 with act 1 boss ×1.2 dmg** | **72 / 63 / 82** | **15 (gross 30) / 32 / 98** | **68 (57 / 82)** |
| Q3 | kit Red Drink + Bucket + a 2-HP trinket, normal ×1.35 / ×1.15, boss ×1.1 dmg | 71 / 59 / 86 | 14 / 25 / 99 | 69 (55 / 86) |

P1-Q3 were run by the first attempt after the notes above were written (it was killed before recording them; the
reports are `.tmp/bal1/runs/p1_fanny3.txt` … `q3.txt`). Q2's first fight of a run: HP lost 23%, a down in 20% (V1: 21%
/ 10%); fights 3+: a down in 37%. X parties win 96% of Q2's act 1 regular fights (H 100%).

Queries: `kit=con_red_drink,con_ice_bucket`, `bal=act.1.normal.dmg:1.25,act.1.normal.hp:1.1,act.1.boss.dmg:1.06`,
`startskill=gen_first_aid`, `helpup=0.4`, `tune=rat_swarm.maxStacks:6` (`.tmp/bal1/split.js` documents them). G1-V2 share
every fight before the boss (same seeds, same normal-fight rows), so their boss columns differ only by the boss config and
the boss fight's own chaos. A repeat of E4 on the same seeds moved the boss by 1-2 fights (AutoPlay is not fully
deterministic), so ±3 points between rows is noise.

What the experiments say:
- **Potions alone don't reach the boss under AutoPlay.** A kit of Red Drinks is drunk in the first fights (E1: 609 of
  600 used; the run's first fight lost 6% → 2% downs); boss X moved 0-3 points. A *revive-only* item waits for a down:
  +7 to +10 points of boss wins for X (E7 vs E3, F2/F3 vs F0).
- **A recurring heal is the real lever.** First Aid on every hero (E6) takes X from 49% to 85% at the boss and act 1
  from 58% to 87%: way past every target, and it needs a run-layer or hero-file change. One heal aura per party (an
  item: P1-Q3) is the pass-1-sized version: P1 +20 points for X at the boss, +4 for H, so the act 1 rows can pay for it
  (Q2: the shipped config).
- **Help Up for more HP is not a lever** (E5: 25% → 40%, +2 points, within noise).
- **Harder regular fights hit X parties hardest** (E3: X act 1 clears 56% → 39%, boss X 58% → 49%: more downs = more
  scars and the odd death before the boss). The kit buys most of that back (V1: X act 1 clears 52%, boss X 57%).
- **The act 1 bosses move both splits about equally** (G1-V2 vs V1: +6-12% boss damage costs 2-7 points to both X and H).
  H parties sit at 85-89% with any kit; no boss lever measured here gets H to 80% without taking X below 55%.
- **Bosses that target the healer don't move H** (H1/H2: Levy's "biggest spender" and the Rat King's contempt of court
  counting healing done: no measurable change), and **capping Swelling Ranks at +6 changes nothing measurable** (fights
  rarely run long enough). Both dropped; the code is unchanged.

### How the AutoPlay bias is accounted for

- AutoPlay overplays bosses (it dodges ~95% of wind-ups and solves the puzzles from exact hints) and underplays the
  party (few signatures, setup skills, summons). Both apply to H and X parties alike; the gap between them is what pass
  1 measures, so it is the more trustworthy number.
- AutoPlay spends consumables early (cost 8 in a normal fight vs 10 HP of healing): it drank the old kit's Red Drink in
  the first fights, which is one reason the shipped kit has none. The Bucket can't be spent early by anyone (only a
  downed ally is a target) and the Fanny Pack is passive, so the shipped kit works about the same for AutoPlay and people.
- AutoPlay doesn't *seek* the Fanny Pack (it doesn't value standing next to its wearer); a human who keeps the hurt
  hero beside the wearer gets more out of it than the sims show.
- The act 1 boss ×1.2 damage leaves the boss at 68-72% in the sims (top of the 60-70% target) on purpose: humans dodge
  fewer wind-ups and solve the puzzles slower than AutoPlay, so the boss plays harder for people than the sims say.
  Pushing it into the middle of the range would have taken X parties below 55% in the sims (G1-V2).

### Validation

**V1 (Red Drink + Bucket, act 1 normal ×1.25 / ×1.1) on fresh seeds and whole campaigns** (first attempt; reports in
`.tmp/bal1/runs/`; "off" = the same seeds with `bal=act.1.normal.dmg:1,act.1.normal.hp:1,start.consumables:[]`):

| batch (normal) | off | V1 |
|---|---|---|
| act 1 only, 300 runs, seeds 7000+: act 1 boss all / X / H | 67 / 57 / 80 | 74 / 64 / 84 |
| … act 1 cleared (X / H) · act 1 normal fights HP lost / with a down / won | 67% (56 / 80) · 13 / 18 / 100 | 70% (58 / 84) · 16 / 25 / 99 |
| campaign, 200 runs, seeds 1000+ (off = the pre-pass baseline run): runs won · X / H | 40% · 24% / 59% | 41% · 19% / 68% |
| … act 1 boss · act 1 cleared · end gold | 62% · 61% · 314 | 70% · 66% · 306 |
| campaign, 200 runs, seeds 2000+: runs won · X / H | 42% · 22% / 69% | 42% · 20% / 73% |
| … act 1 boss · act 1 cleared · end gold | 64% · 64% · 294 | 74% · 70% · 337 |
| run-win share vs the median (seeds 1000+ / 2000+): Ellaria · Josiah | 1.8× / 1.9× · 1.4× / 1.8× | 2.3× / 1.9× · 1.7× / 1.8× |

What V1 did in the campaign: act 1's boss got *easier* for the party that reaches it (+7-10 points: the kit), but X
parties won fewer runs (24 → 19%, 22 → 20%) and H parties more: the healer gap in whole runs grew. The kit is spent in
act 1; acts 2-3 still have no heal for X parties (X parties that clear act 1 clear act 2 61% of the time, H 83%).

With the trinket on top of V1 (P1's kit, campaign seeds 2000+, 200 runs): runs won 57% (X 38%, H 83%), Ellaria 1.6× /
Josiah 1.4× the median (V1: 1.9× / 1.8×). A *recurring* heal for every party is what closes the whole-run gap (as E6
said for act 1). Q2 pays for it in act 1 (no Red Drink, harsher regular fights, the act 1 bosses ×1.2 damage).

**The shipped config (pass 1 finish, Nov 11).** Q2 with the real item (`first_aid_fanny_pack`, `start.items`), then Q2 +
the act 1 elite row (×1.2 dmg / ×1.05 HP: the fixture guard "elites hurt more than normal fights" read 46% vs 51% without
it, 57% vs 51% with it). Act 1 only, 300 runs, seeds 7000+ (the same seeds as the V1 / off rows above):

| seeds 7000+, 300 runs | off | V1 | Q2 (real item) | **shipped** (Q2 + elite row) |
|---|---|---|---|---|
| act 1 boss all / X / H | 67 / 57 / 80 | 74 / 64 / 84 | 68 / 58 / 78 | **68 / 58 / 80** |
| Grimble X / H · Rat King X / H | 49 / 81 · 63 / 79 | 56 / 80 · 70 / 88 | 49 / 78 · 66 / 79 | **48 / 78 · 67 / 81** |
| act 1 cleared (X / H) | 67% (56 / 80) | 70% (58 / 84) | 65% (54 / 78) | **66% (53 / 80)** |
| normal fights: won · HP lost net (gross) · with a down | 100 · 13 · 18 | 99 · 16 · 25 | 99 · 14 (30) · 30 | **99 · 14 (31) · 30** |
| … X / H: won · with a down | 99 / 100 · 25 / 10 | 98 / 100 · 31 / 18 | 98 / 100 · 37 / 22 | **98 / 100 · 37 / 23** |
| … the run's first fight: HP lost · with a down | — | — | 20 · 19 | **20 · 19** |
| elites: won · HP lost net (gross) · with a down | 100 · 17 · 25 | 99 · 14 · 23 | 100 · 9 (27) · 16 | **99 · 12 (32) · 20** |
| boss downs a fight · rounds | 2.61 · 8.5 | 2.49 · 8.3 | 2.70 · 8.6 | **2.60 · 8.7** |
| Bucket used | — | — | 218 / 300 runs | 218 / 300 runs |

Pooled with Q2 on seeds 5000+ (the elite row moved nothing measurable on the boss): act 1 boss **70%** of 571 fights
(X 61% of 302, H 81% of 269). The gap between the splits went from 26-32 points (V1) to 20-22.

**Whole campaign, the shipped config** (normal, 200 runs, seeds 1000+, `.tmp/bal1/runs/v4_ship_camp_1000.txt`; same seeds
as the pre-pass baseline and V1 rows above):

| seeds 1000+, 200 runs | pre-pass | V1 | **shipped** |
|---|---|---|---|
| runs won (95% CI) | 40% | 41% | **49% (42-56%)** |
| … X / H parties | 24% / 59% | 19% / 68% | **35% / 66%** |
| act 1 cleared · act 2 (of entered) · act 3 (of entered) | 61% · 77% · 84% | 66% · 74% · 84% | **63% · 84% · 93%** |
| act 1 boss all · X / H (Grimble · Rat King) | 62% | 70% | **66% · 57% / 77% (65% · 68%)** |
| act 1 normal fights: won · HP lost net (gross) · with a down | 99 · 14 (20) · 19 | 98 · 17 (29) · 27 | **98 · 16 (32) · 30** (X won 97%) |
| act 1 elites: won · HP lost · with a down | 99 · 19 · 23 | 100 · 13 · 34 | **98 · 13 (33) · 32** |
| act 2 normal / elite: with a down | 46% / 46% | 54% / 52% | **46% / 52%** |
| Lich-tenstein · Dr. Iris · the DM | 48/51 · 46/49 · 79/82 | 41/44 · 57/60 · 82/87 | **46/52 · 59/60 · 98/99** |
| run-win share vs the median: Ellaria · Josiah | 1.8× · 1.4× | 2.3× · 1.7× | **1.5× · 1.4×** |
| … highest / lowest hero | Ellaria 1.8× / Valdris 0.6× | Ellaria 2.3× / Basanos 0.5× | **Ellaria 1.49× / Basanos 0.74×** |
| end gold | 314 | 306 | **320** |

Second batch, seeds 2000+ (200 runs, `v4_ship_camp_2000.txt`; pre-pass "off" / V1 on the same seeds in brackets): runs
won 45% (CI 38-52%) [42% / 42%]; X / H 25% / 73% [22% / 69% · 20% / 73%]; act 1 cleared 62% [64% / 70%], act 2 82% of
entered, act 3 89%; act 1 boss 64% (X 50%, H 82%; Grimble X 40% of 52, the Rat King X 58% of 57); act 1 normal fights
won 99%, 15% HP net (30% gross), a down in 29%; Lich-tenstein 44/50, Dr. Iris 57/59, the DM 90/91; Ellaria 2.07× the
median (87% of 45 runs), Josiah 1.45×, lowest Marwyn 0.71×; end gold 323.

**Both campaign batches pooled (400 runs):** runs won 47% (pre-pass 41%, V1 42%); X parties 30% of 226 (pre-pass 23%, V1
19%), H parties 69% of 174 (64%, 70%). Ellaria 78% of 95 runs ≈ 1.7× the pooled median (V1 ≈ 2.1×, pre-pass ≈ 1.9×),
Josiah 63% of 97 ≈ 1.4×. One hero's share over ~45 runs moves ±14 points between batches (Ellaria 1.49× → 2.07×), so
only the pooled number means much.

**Act 1 boss, everything pooled** (Q2 seeds 5000+, shipped seeds 7000+, both campaigns: 953 fights): **68%** won; X 57%
of 510, H 80% of 443. Per boss for X parties: Grimble ~50% (four batches 55 / 49 / 57 / 40), the Rat King ~64%; for H both
~80%.

What it did: the healer gap in whole runs closed part of the way (X parties 19-23% → 30% of runs won, Ellaria ~2.1× →
~1.7×, Josiah ~1.4×); act 1 sits on target (boss 68%, X 57%, H 80%; regular fights won 98-99% with a down in 29-30%).
Acts 2-3 got easier (the Fanny Pack lasts the run): act 2 conversion 74% → 82-84%, act 3 84% → 89-93%, campaign wins
42% → 45-49% (target 30-40%). That is for passes 2-3 to take back in acts 2-3 (their bosses were already above target).
Economy unchanged (end gold ~320).

### Deviations

- **`js/run/run.js` (META-RUN's file)**: a `[balance]` read of `DD.Balance.start` in `newRun` (`startKit()`, 8 lines):
  `start.consumables` into the pockets, `start.items` into the bag and `autoEquip`ped (the first living hero with a free
  slot). Same pattern as the v1 balance pass's `[balance]` reads in the run layer; no other run-layer code changed.
  Sandbox runs (tests/run_tests.js swap the item and consumable registries) get nothing: unknown ids are skipped.
- `DD.Balance.act[n]` may now hold `normal` / `elite` / `boss` rows (B.scale reads them; `bal=act.1.normal.dmg:…` works).
- `DD.Balance.restore` deletes knobs that did not exist in the snapshot (it used to leave them).
- A new shared item (`first_aid_fanny_pack`) in ITEMS' file: the task allowed "numbers and starting / reward availability";
  a starting-kit item needed a def. It follows the items file's style and has its own suite in `tests/content/shared.js`.

### Requests

- **LEAD / META-RUN (`js/run/run.js`)**: accept (or move) the `[balance]` starting-kit read in `newRun` (Deviations). The
  map's run-start text could name the kit ("The DM hands you a fanny pack and a bucket. Don't ask.").
- **MAPGEN (`tests/mapgen_tests.js` "mapgen: encounter build (synthetic encounters)")**: the assertion "difficulty info"
  expects the literal `brutal:1.25:1.2` for the synthetic act 1 normal encounter `mgt_proc`; with act 1's regular-fight
  row it is `brutal:1.438:1.68`. Compare with `DD.Balance.scale('brutal', 1, 'normal', { encounter: 'mgt_proc' })`
  instead of literals (the only failing suite in the full run, and it fails on a knob, not on mapgen).
- **LEAD / DOCS**: DESIGN §3 (every run starts with a First-Aid Fanny Pack on one hero and a Bucket of Ice Water in the
  pockets), §5 (act 1: regular fights ×1.4 damage / ×1.15 enemy HP, elites ×1.2 / ×1.05, bosses ×1.2 damage:
  `DD.Balance.act[1]`), §7 (Consumables: 15, + the Bucket of Ice Water; Items: + the First-Aid Fanny Pack, common
  trinket); ARCHITECTURE §6.10 (difficulty × act × act-kind row × kind × encounter) and §9.2 (`newRun` puts
  `DD.Balance.start.consumables` in the pockets and equips `start.items`); v2-digest §1 counts and §3-4 (this section).
- **NARRATIVE (optional)**: a tip, e.g. "Nobody brought a cleric? Every party starts with a First-Aid Fanny Pack and a
  Bucket of Ice Water. Stand next to whoever wears the fanny pack. The bucket only works on the unconscious."
- **BALANCE PASS 2 / 3**: the Fanny Pack lasts the whole run, so acts 2-3 got easier (Validation, campaign table: act 2
  conversion 74% → 84%, act 3 84% → 93%, campaign 41% → 49%, act 2 normal fights with a down 54% → 46%, the DM 98/99);
  they were already above target (act 2 / 3 bosses 91-98%). Re-baseline from the shipped campaign row, not V1's. The kit's knobs are `DD.Balance.start` (drop the item to measure
  the kit's share) and `act[1]` pays for it in act 1 only: if a later pass removes the item, take act 1's rows back
  toward V1 (normal ×1.25 / ×1.1, no elite / boss rows) or act 1 gets too hard for X parties.
- **BOSSES ACT 1 (knob, not a file change)**: Grimble reads ~10 points harder than the Rat King for X parties (48-49% vs
  66-67% on seeds 7000+; all seeds pooled Grimble ~65%, the Rat King ~74%). `DD.Balance.encounters.boss_grimble` /
  `boss_rat_king` can level them if the auditor sees the same.

### Known issues

- **Whole campaigns on normal: 45-49% won** (two 200-run batches; target 30-40%), up from 41-42%: acts 2-3 are easier
  with a heal that lasts the run. Passes 2-3 own those acts (Requests). Not re-measured: casual and brutal.
- **Act 1 regular fights lose 14% of the party's HP net** (31% gross; target "about 20-30%") with a down in 30% of them
  (target 25-40%). The Fanny Pack and the healers heal much of it back mid-fight (H 10% net, X 18%); pushing the net
  number higher cost X parties their runs before the boss (E3).
- **Act 1 elites hurt about as much as a regular fight, not more**, with real heroes: 12% HP net (32% gross) and a down
  in 20% of them, against 14% (31%) and 30% (they are longer and the pack heals every turn). The elite row keeps the
  fixture guard (57% vs 51%); a stronger row (×1.4 / ×1.15, as the regular fights) made the fixture elites lose 84% of
  the party's HP with 1.9 downs a fight, so it was not shipped. A later pass can raise `act[1].elite` if elites should
  clearly out-hurt the regular fights for real parties too.
- **Union Meeting is won 94%** (the hardest act 1 regular fight: 71% with a down); the other seven 98-100%.
- **H parties win the act 1 boss 77-82%** (pooled 80%: target "at most ~80%", at the edge), X parties 50-63% (pooled 57%:
  target 55%+), overall 64-72% (pooled 68%: target 60-70%). Grimble is the harder of the two for X parties (~50% pooled,
  40-57% per batch; the Rat King ~64%): an untested knob is `DD.Balance.encounters.boss_grimble = { dmg: 0.9 }` (it would lift H at Grimble too).
- `tests/mapgen_tests.js` "difficulty info" fails until MAPGEN compares with `DD.Balance.scale` (Requests).
- One round-cap fight in 300 act 1 runs (F3, `a1_web_of_lies`, 31 rounds) in an experiment config; none in the shipped
  config's runs.

### Tests (`tests/balance_tests.js`, 6 suites; `tests/content/kit.js` +1 suite; `tests/content/shared.js` +1 suite)

`balance: every DD.Balance knob is a sane number` · `difficulties stay ordered (casual < normal < brutal) in every act and
fight kind` · `scale = difficulty × act × act-kind row × kind × encounter (rows only reach their own fights)` · `get / set by
path, snapshot / restore` · `act 1 levers (pass 1) — regular fights hurt, the act 1 bosses hit a bit harder, nothing else
moves with them` (1.1-1.3 boss damage, HP untouched, act 2-3 normal fights and bosses never read act 1's rows; a real act
1 goblin ambush starts at the scaled numbers) · `every party starts the run with a heal and a revive (the starting kit)`
(a heal that lasts the run, a downed-only revive, a real `newRun` equips the item on one hero and pockets the kit, unknown
ids skipped). `kit: balance pass — the Bucket of Ice Water …` (targets 1-2 tiles, downed only; 50% HP; 1 AP; AutoPlay
keeps it while nobody is down and splashes a downed ally it can't walk to). `items: balance pass — the First-Aid Fanny
Pack …` (the most hurt of you and your adjacent allies, 3 HP, alone, a downed ally stays down, the desc, in the kit, a
party wearing one is not offered a second). `enemies_act1: autoplay sims (elite encounters …)`: elites ≥ 1.1× the
regular fights' HP share.

### Full run (Nov 11, 23:12)

`bash tools/test.sh`: 945 suites, 121,879 assertions, **1 failure**: `mapgen: encounter build (synthetic encounters)`
"difficulty info" (expected the literal `brutal:1.25:1.2`, got `brutal:1.438:1.68` — act 1's regular-fight row on a
synthetic act 1 normal encounter; MAPGEN's file, Requests). No swallowed "Error in" lines; the warnings are the
documented content advisories and the deliberate bad-content cases.

---------------------------------------------------------------------------------------------------------------------

## Pass 2 — acts 2 and 3, the difficulty curve (BALANCE PASS 2)

> **Note (Nov 12):** every number in this section was measured with the First-Aid Fanny Pack in the kit and pass 1's act 1
> rows; D9 took the pack out and the sustain refit re-fitted act 1 (below). The late-boss experiments (E1-E3) remain the
> head start for the next refit (spec §9 B4); re-baseline from "Sustain refit - act 1" (V2), not from `base`.
> **Superseded (Nov 13):** the late-boss rows landed in "Sustain refit - acts 2-3" below (Lich ×1.25 / ×1.5, Iris
> ×1.2 / ×1.45, the DM ×1.35 / ×1.6); its "in progress" status is history.

Status: **in progress** (this section is written as the pass goes; a re-run continues from the last line).

Harness: `.tmp/bal2/sim.sh "<query>" .tmp/bal2/runs/<name>.txt` (a copy of pass 1's: `tools/sim.sh`'s report + the
healer split, `split.js`). Reports: `.tmp/bal2/runs/`. Seeds: baselines and experiments on 11000+ (200 runs), validation on
fresh 13000+ / 14000+. Levers are tried with `bal=` first (act rows: `act.2.boss.hp:…`, encounter rows:
`encounters.boss_dr_iris.hp:…`), then written to `js/data/balance.js`.

### Baseline (the files as pass 1 left them)

`base` = `seeds=200&from=11000` (normal, files as pass 1 shipped them; `.tmp/bal2/runs/base_camp_11000.txt`, 1070 s):

| | base (11000+, 200 runs) |
|---|---|
| campaign won (95% CI) · X / H parties | **52%** (45-59%) · 37% / 68% |
| act 1 cleared · act 2 (of entered) · act 3 (of entered) | 67% · **89%** · **88%** |
| act 1 boss (Grimble · Rat King) | 70% (69% · 71%) |
| Lich-tenstein · Dr. Iris · the DM | **64/65 (98%) · 54/55 (98%) · 104/109 (95%)** |
| act 2 normal: won · HP lost · with a down · downs | 97% · 15% · 44% · 0.91 |
| act 2 elite: won · HP lost · with a down · downs | 95% · 16% · 51% · 1.06 (Office Hours 10/13, the others 100%) |
| act 3 normal: won · with a down · act 3 elite: won · with a down | 98% · 38% · 98% · 28% |
| boss rounds: Lich · Iris · DM | 7.7 · 8.8 · 7.0 (HP lost 28% · 31% · 24%; downs 1.1 · 0.6 · 0.7) |
| end gold | 351 |

Divers: the wisp's Swamp Gas Zap is the #3 cause of hero downs (96 of 1,941, 5%), the imp's Go Live! / Hot Take 55 + 44;
`a2_follow_the_lights` 93% won, 1.8 downs a fight (67% with a down), `a3_influencer_collab` 91% / 1.5 (65%).

So the curve is inverted: every act 2-3 boss is won 95-98% (target 65-80%, the DM 60-75%); the campaign (52%) is far
over 30-40%, all of it from acts 2-3 (89% / 88% conversion).

### Experiments (campaign, normal, 200 runs, seeds 11000-11199; act 1 is the same in every row)

Boss levers are `DD.Balance.encounters.<boss>` rows (× on top of everything else; they reach only that fight, so the
fixture encounters the hero suites battle (`test_a2_boss`, `test_a3_boss`) stay put).

| id | change (`bal=`) | Lich · Iris · DM won | rounds L · I · DM | act 2 · act 3 conv. | campaign (X / H) | Ellaria · Josiah × median |
|---|---|---|---|---|---|---|
| base | — | 98 · 98 · 95% | 7.7 · 8.8 · 7.0 | 89 · 88% | 52% (37 / 68) | 1.48 · 1.34 |
| E1 | Lich, Iris hp 1.5 dmg 1.2; DM hp 1.5 dmg 1.25 | 77 · 82 · 80% (50/65 · 45/55 · 70/87) | 12.6 · 13.1 · 10.3 | 71 · 74% | 35% (17 / 55) | 2.0 · 1.4 |

E1 notes: the right size for the act 2 bosses, the DM still too easy for "the hardest boss"; but long fights favour the
starting healers: Lich H 83% / X 65%, Iris 88 / 74%, DM 85 / 69%; Lich fights had 5.3 downs a fight (Help Up cycling
against the uncapped Late Fees) and Iris fights reach her round-14 closing time. Run-win shares spread: Ellaria 2.0×
the median, lowest Sparrow 0.56×, Buga 0.65×.
| E2 | Lich hp 1.2 dmg 1.4; Iris hp 1.25 dmg 1.4; DM hp 1.25 dmg 1.45 | 85 · 84 · 80% (55/65 · 46/55 · 75/94) | 10.0 · 12.5 · 8.8 | 76 · 74% | 38% (25 / 52) | 1.78 · 1.22 |

E2 (damage-heavy, shorter fights) splits less by healer: Lich H 90 / X 74%, Iris 84 / 83%, DM 83 / 74%. A logit fit over
base / E1 / E2 per boss (`logit(win) = c − kH·ln hp − kD·ln dmg`): Lich kH ≈ 4.3, kD ≈ 2.9; Iris 3.5 / 3.2; the DM 2.3 /
2.8 (noisy: ±7 points a boss per batch). It predicts ~75-78% for the act 2 bosses at hp 1.4 / dmg 1.4 and ~67% for
the DM at hp 1.6 / dmg 1.5 (E3).

Divers (E2, new `split.js` table: hero downs by cause, "high" = the hero ended its own last turn at ≥ 60% HP, "unacted"
= downed before its first turn of the fight): the wisp's Swamp Gas Zap 96 downs, high 4%, unacted 10% (it finishes off
the wounded: sneaky, not a lottery); the imp's Go Live! 38 downs, high 8%, **unacted 37%** (init +3: it dives a hero who
starts the fight hurt before that hero ever acts), Hot Take 44 / 5% / 11%. All act 3 downs: high 12%, unacted 7%. The
Lich's Overdue Notice (179 downs in E2, #1) is 28% high: the uncapped Late Fees × the row's damage.
| E3 | Lich, Iris hp 1.4 dmg 1.4; DM hp 1.6 dmg 1.5 | 72 · 76 · 66% (47/65 · 42/55 · 50/76) | 11.1 · 14.0 · 11.1 | 67 · 56% | **25%** (10 / 41) | 2.3 · 1.3 |

E3 puts every boss on target but the campaign under it (25%), and the healer gap opens wide: Lich H 79 / X 61%, Iris
81 / 70%, the DM 74 / 48%; runs X 10% / H 41%; Ellaria 2.3× the median, Slate 0.4×, Buga 0.44×. The arithmetic of the
targets: act 1 cleared ≈ 67% (pass 1), act 2 conversion ≈ 0.9 × the act 2 boss, act 3 ≈ 0.9 × the DM, so the campaign
reaches 30% only with the act 2 bosses near 80% and the DM near 68% (the top of their ranges).

---------------------------------------------------------------------------------------------------------------------

## Sustain refit - act 1 (BALANCE REFIT 1, Nov 12: spec `.tmp/wf13/sustain-spec.md` §9 B1-B3)

Status: **done** (Nov 12, ~22:50; B1-B3 of the spec). Full run: 998 suites, 122,916 assertions ok, 4 failures in 2
sections, neither from this pass (balance suite 7, written ahead for the next refit's late-boss rows; `hero_marwyn: AutoPlay
battles, acts 2-3`, the known coin-flip variety bar); no "Error in" lines. This section supersedes Pass
1's starting kit (the First-Aid Fanny Pack left `DD.Balance.start`: D9) and re-fits Pass 1's act 1 rows, which were sized
to pay for it. Pass 1 / Pass 2 above stay as history.

Harness `.tmp/bal3/` (a copy of `.tmp/bal2`'s `sim.sh` + `split.js`, one Chrome at a time): `.tmp/bal3/sim.sh "<query>"
.tmp/bal3/runs/<name>.txt`. `split.js` adds to pass 2's tables: heals a fight per hero split into self / to others (by
fight kind, fights the hero was in), where each healed HP came from (the skill in use, else the calling function, e.g.
`marwyn:surge`, `hjalmar:spring`), verb uses a fight with the verb socketed (Hold Still, Stress Ball, Transform, Juice
Box, Bear Trap, Banana Peel, Marwyn's surges), and worn rates (the Fanny Pack as loot, Canned Laughter, the Flea Collar,
the Coat, the Bib). Read-only: no RNG use.

### B1: what the sustain buys (rows unchanged: pass 1's act 1 rows, no Fanny Pack, the new hero sustain + the playtest fixes)

Act 1 only, 300 runs, seeds 7000+ (`.tmp/bal3/runs/b1_a1_7000.txt`, 315 s), against pass 1's rows on the same seeds:

| seeds 7000+, 300 runs | pass 1 "off" (no rows, no kit) | pass 1 shipped (rows + pack + Bucket) | **B1** (rows + Bucket, no pack, D9 sustain) |
|---|---|---|---|
| act 1 boss all / X / H | 67 / 57 / 80 | 68 / 58 / 80 | **71 / 58 / 85** |
| Grimble X / H · Rat King X / H | 49 / 81 · 63 / 79 | 48 / 78 · 67 / 81 | **55 / 86 · 61 / 84** |
| act 1 cleared (X / H) | 67% (56 / 80) | 66% (53 / 80) | **66% (52 / 83)** |
| normal fights: won · HP lost net (gross) · with a down · downs | 100 · 13 · 18 | 99 · 14 (31) · 30 | **98 · 18 (30) · 34 · 0.67** |
| … X / H: won · with a down | 99 / 100 · 25 / 10 | 98 / 100 · 37 / 23 | **97 / 99 · 42 / 25** |
| … the run's first fight: HP lost · with a down | — | 20 · 19 | **24 · 20** |
| elites: won · HP lost net (gross) · with a down | 100 · 17 · 25 | 99 · 12 (32) · 20 | **99 · 16 (32) · 26** |
| boss downs a fight · rounds | 2.61 · 8.5 | 2.60 · 8.7 | **2.56 · 8.5** |
| Bucket used | — | 218 / 300 runs | **220 / 300 runs** |

Sustain guard rails (act 1; uses a fight with the verb socketed; HP a fight the hero was in):

| piece | uses a fight: normal · elite · boss | self-heal a fight: normal · elite · boss | spec target | verdict |
|---|---|---|---|---|
| Slate Hold Still | 0.9 · 1.0 · 0.6 | — | ≥ 1.2 (fallback < 1.0: HOLD_AI 2.5) | **below: HOLD_AI 1.5 → 2.5 applied** |
| Slate Stress Ball (socketed in 17 / 4 / 11 fights) | 0.2 · 0.3 · 0.2 | 0.1 a fight overall | ≥ 0.8 socketed; heal ≤ ~6 | rarely socketed in act 1 (a pool pick); not hot |
| Basanos Transform | 2.6 · 3.6 · 4.1 | 5.4 · 8.6 · 9.2 (all of it the mend: 6.0 a fight) | 1.5-3; mend ≤ ~8 normal / ~15 boss | on target (no fallback) |
| Sparrow Juice Box | 0.7 · 1.0 · 0.5 | 3.9 · 6.6 · 3.4 | ≥ 0.9; ≤ ~8 | a little under on uses, not hot |
| Marwyn surges | 0.3 · 0.9 · 0.7 | 2.5 · 7.2 · 6.3 | ~0.35 / ~1; ~3 / ~8 | on target |
| Hjalmar Canned Laughter | worn in 3% of his act 1 fights (rare loot) | — | optional loot | — |

Downs a fight: Basanos 0.32 (≤ 0.42 ✓), Sparrow 0.40 (≤ 0.45 ✓). Heals to others a fight: Josiah 9.6 (normal) / 17.4
(boss), Ellaria 8.1 / 9.6, next Marbles 0.8 / 2.1: the healers stay the top 2 ✓. The Fanny Pack as loot: worn in 3% of
act 1 fights. Act 1 cleared share (act-1-only runs, median 66%): Josiah 86%, Ellaria 82%, Zarathor / Syllamin 75%;
lowest Valdris 51%, Buga 55%, Basanos 57%, Slate / Pebbles 58%.

Reading: without the pack and with pass 1's rows, act 1 is **not** harder than pass 1 shipped it: X parties hold 58% at
the boss (the D9 sustain and the Bucket replace the pack for them; Grimble also lost his trapped-Audit downs in the
playtest fixes), but H parties rose to 85% (over the ~80 cap), the boss overall to 71% (top of 60-70). Regular fights
hurt as intended (a down in 34%, 42% for X) but lose 18% net HP (target about 20-30%). So the spec's expected re-fit
(easier rows, A1-A3) is not what the measurement asks for: the act 1 rows stay at least as hard; the open question is
the healer gap at the boss (27 points).

**B1 campaign** (normal, 200 runs, seeds 11000+, `.tmp/bal3/runs/b1_camp_11000.txt`, 598 s; the same seeds as Pass 2's
`base` and the audit's no-pack B0):

| seeds 11000+, 200 runs | Pass 2 base (pack, pass 1 rows) | audit B0 (no pack, old hero files, 100 runs) | **B1** |
|---|---|---|---|
| campaign won · X / H | 52% · 37 / 68 | 38% | **47% (CI 40-54) · 33 / 62** |
| act 1 cleared · act 2 · act 3 (of entered) | 67 · 89 · 88 | 53 · 87 · 83 | **63 · 84 · 89** |
| act 1 boss all · X / H (Grimble X / H · Rat King X / H) | 70 | 60 · 53 / 65 | **68 · 58 / 78 (52 / 77 · 64 / 79)** |
| act 1 normal fights: won · HP lost net (gross) · with a down | — | 96 · 19 (31) · 37 | **98 · 17 (31) · 34** (X won 96%, a down in 43%; H 99%, 24%) |
| act 2 normal: with a down · elites won | 44% · 95% | 53% · 94% | **52% · 84%** (X 79%, H 88%) |
| Lich-tenstein · Dr. Iris · the DM | 98 · 98 · 95% | 22/23 · 24/24 · 38/40 | **57/59 · 49/49 · 94/97** |
| end gold | 351 | 254 | 326 |

Pooled run-win share (median 46%): Ellaria 1.45×, Zarathor 1.42×, Syllamin 1.38×, Josiah 1.35×, Corelos 1.20×, Kiri /
Pebbles 1.17×, Valdris 1.01×, Basanos 0.99×, Marbles 0.95×, Buga 0.91×, Hjalmar 0.84×, Marwyn 0.80×, Betty 0.78×, Slate
0.76×, **Sparrow 0.47×** (10 of 47; B0: 0.38×). Campaign guard rails (all acts, a normal / boss fight): Basanos Transform
3.1 / 3.8, mend 7.2 a fight (normal 8.0 / boss 9.7 self, everything included); the Flea Collar is worn in 13% of his
fights. Sparrow Juice Box 0.7 / 0.7 (4.2 HP a fight). Marwyn 0.4 / 1.1 surges (3.4 / 8.0 HP). Slate Hold Still 0.9 /
0.6; Stress Ball socketed in 32 / 12 fights, 0.4 / 0 uses. Canned Laughter worn in 7% of Hjalmar's fights (0.2 HP a
fight overall). The Fanny Pack as loot: worn in 9% of all fights. Josiah 13.4 / 19 and Ellaria 10.2 / 10.5 to others a
fight: still the top 2 (next Marbles 1.8 / 2.3).

The late bosses are still won 95-100% (B4's job: the next refit). Act 2 elites dropped to 84% (pack gone).

**K1** = B1's rows + HOLD_AI 2.5 (act 1 only, 300 runs, seeds **5000+**, `k1_a1_5000.txt`): act 1 boss 69% (**X 53%** of
143, H 87% of 130), act 1 cleared 63% (X 45%, H 86%); normal fights won 97%, 18% HP net (30% gross), a down in 36% (X
46%, won 95%); elites 98%, 18% (36% gross), a down in 41%. Hold Still 0.9 a normal fight (unchanged by HOLD_AI 2.5),
1.3 an elite, 0.7 a boss fight.

Pooled act 1 boss at pass 1's rows (B1 7000+, K1 5000+, B1 campaign 11000+: 736 fights): **70%; X 56% of 376, H 84% of
360** (gap 28). X holds 55 at the edge; H is over the ~80 cap.

Decisions so far:
- **Sparrow < 0.6× (0.47×, B0 0.38×): the spec's fallback applied, Juice Box range 2 → 3** (`JUICE_RANGE`, desc
  "within 3"; `hero_sparrow: Juice Box` asserts range 3 and a foe 4 tiles away out of reach). Measured below.
- **Slate's Hold Still < 1.0 a fight: HOLD_AI 1.5 → 2.5** (the spec's fallback). It did not raise his grabs in regular
  fights (0.9 → 0.9; elites 1.0 → 1.3): his grab is limited by reach (a foe next to him at his turn), not by AutoPlay's
  price. Kept (it is inside the spec's band and the hero suite's 1.5-2.5 bound).

### B2: the act 1 rows (act 1 only, 300 runs, seeds 7000+; boss all / X / H · Grimble X / H · Rat King X / H · act 1 cleared (X / H) · normal fights won / net HP lost / with a down)

From here on the files carry HOLD_AI 2.5 and Juice Box range 3 (R0 = the files with pass 1's rows).

| id | `bal=` | act 1 boss | Grimble · Rat King | cleared | normal fights | boss rounds |
|---|---|---|---|---|---|---|
| B1 | — (HOLD_AI 1.5, Juice Box range 2) | 71 / 58 / 85 | 55 / 86 · 61 / 84 | 66 (52 / 83) | 98 / 18 / 34 | 8.5 |
| R0 | — (the files: HOLD_AI 2.5, range 3) | 71 / 58 / 83 | 54 / 82 · 63 / 84 | 64 (50 / 81) | 97 / 18 / 33 | 8.7 |
| S1 | `act.1.boss.hp:0.85,act.1.boss.dmg:1.45` (shorter, deadlier boss fights) | 66 / 55 / 76 | 55 / 82 · 56 / 72 | 60 (47 / 75) | (same) | 8.1 |
| S1N | S1 + `act.1.normal.dmg:1.3` | 65 / 59 / 70 | 55 / 71 · 63 / 70 | 61 (53 / 70) | 98 / 17 (29 gross) / 31 (X 39, H 23; first fight 16) | 7.9 |
| **S2N** | `act.1.normal.dmg:1.3,act.1.boss.hp:0.9,act.1.boss.dmg:1.35` | **69 / 61 / 78** | 55 / 74 · 67 / 80 | 65 (55 / 77) | 98 / 17 (29 gross) / 31 (X 39, H 23; first fight 16) | 8.2 |

R0's sustain read-outs: Juice Box **0.9** a regular fight / 1.4 elite / 0.9 boss (was 0.7 / 1.0 / 0.5 at range 2: on
target now), Sparrow heals herself 4.1 / 7.2 / 5.8 a fight (≤ ~8 ✓), downs 0.29 a fight (was 0.40); her act 1 cleared
share 0.93× (B1 1.0×). Hold Still 0.9 / 1.1 / 0.6. Basanos with the Flea Collar: 6.8 HP a regular fight (4 fights;
without 5.3): no Collar outlier in act 1.

S1 is pass 1's G1 / G2 finding put to work: boss damage costs H parties more than X (their healers have fewer rounds to
heal through), boss HP costs X more. Shorter, deadlier act 1 boss fights cut H by 7 and X by 3 (gap 25 → 21), mostly
at the Rat King.

S1N / S2N share every fight before the boss (same seeds, same regular-fight row: AutoPlay replays them exactly), so
their boss columns differ only by the boss row. Lowering the regular fights' damage 1.4 → 1.3 lets healer-less parties
reach the boss in better shape (S1 → S1N: X 55 → 59 at the boss, X act 1 cleared 47 → 53) and leaves the regular fights
inside their targets (won 98%, a down in 31%: X 39%, H 23%; the run's first fight 16%; 29% gross HP lost).

**Chosen: S2N** (written to `DD.Balance.act[1]`: regular fights ×1.15 HP / ×1.3 damage, elites unchanged ×1.05 / ×1.2,
bosses ×0.9 HP / ×1.35 damage). Validation on fresh seeds (act 1 only, 300 runs, seeds **5000+**, the files,
`v1_a1_5000.txt`; K1 = pass 1's rows on the same seeds):

| seeds 5000+, 300 runs | K1 (pass 1's rows) | **S2N (the files)** |
|---|---|---|
| act 1 boss all / X / H | 69 / 53 / 87 | **70 / 58 / 83** |
| Grimble X / H · Rat King X / H | 50 / 85 · 56 / 89 | 63 / 85 · 54 / 81 |
| act 1 cleared (X / H) | 63 (45 / 86) | **64 (50 / 83)** |
| normal fights: won · net (gross) HP lost · with a down (X / H) · first fight with a down | 97 · 18 (30) · 36 (46 / 24) · 23 | **98 · 17 (29) · 30 (40 / 17) · 19** |
| elites: won · net (gross) · with a down | 98 · 18 (36) · 41 | 97 · 17 (34) · 32 |
| boss rounds · downs a fight | 8.4 · 2.62 | 8.1 · 2.71 |

**Pooled S2N, act 1 only (seeds 5000+ and 7000+, 559 boss fights): 70% won; X 59% of 291, H 81% of 268** (gap 21; pass
1's rows pooled: X 56 / H 84, gap 28). Act 1 cleared share (600 runs, median 63%): Ellaria 1.32×, Josiah 1.25×,
Zarathor 1.22×, Kiri 1.15× … Basanos 0.87×, Sparrow 0.86×, Slate 0.80× (all within 0.6-1.5×).

S1N on the fresh seeds too (`s1n_a1_5000.txt`): 63 / 52 / 76 (Grimble 62 / 81, Rat King 44 / 70). **Pooled S1N (5000+
and 7000+): 64%, X 55% of 291, H 73% of 268** (gap 18) against S2N's 70 / 59.5 / 81 (gap 21) on the same 559 fights. S1N
closes the gap a little more but takes X to the floor in the act-only batches and under it once the campaign batches
(which ran lower for X, below) are pooled in: S2N stays.

### B3: campaign validation (S2N rows, HOLD_AI 2.5, Juice Box range 3; Basanos still at mend 3/4/5)

| normal, 200 runs | seeds 11000+ (`v1_camp_11000.txt`) | seeds 13000+ (`v1_camp_13000.txt`) | **pooled 400** | B1 (11000+, pass 1's rows) |
|---|---|---|---|---|
| campaign won · X / H | 50% · 31 / 71 | 43% · 25 / 65 | **46.5% · X 28% of 216, H 68% of 184** | 47% · 33 / 62 |
| act 1 cleared · act 2 · act 3 (of entered) | 65 · 85 · 90 | 60 · 84 · 85 | 62.5 · 85 · 88 | 63 · 84 · 89 |
| act 1 boss all · X / H | 69 · 58 / 80 | 65 · 47 / 83 | **67 · X 53% of 192, H 81% of 183** | 68 · 58 / 78 |
| Grimble X / H · Rat King X / H | 57 / 83 · 59 / 76 | 49 / 81 · 46 / 86 | | 52 / 77 · 64 / 79 |
| act 1 normal: won · net (gross) · with a down (X / H) | 98 · 17 (29) · 28 (38 / 19) | 98 · 17 (28) · 31 (41 / 18) | 98 · 17 · 29.5 | 98 · 17 (31) · 34 |
| act 1 elites: won · with a down | 100 · 27 | 99 · 31 | | 98 · 30 |
| act 2 normal: with a down · won X / H | 44% · 93 / 99 | 50% · 94 / 98 | 47% | 52% · 97 / 99 |
| act 2 elites won (X / H) | 94% (86 / 100) | 88% (82 / 92) | 91% | 84% |
| Lich-tenstein · Dr. Iris · the DM | 58/58 · 53/55 · 100/102 | 52/54 · 49/49 · 86/87 | 98 · 98 · 99% | 57/59 · 49/49 · 94/97 |
| end gold | 319 | 305 | 312 | 326 |

**The act 1 boss, all S2N batches pooled (act-only 5000+ / 7000+, both campaigns: 934 fights): 68.5% won; X 56.7% of
483, H 80.9% of 451** (gap 24). Per boss (same pool): Grimble X 56% / H 81%, the Rat King X 57% / H 80.5%: level with
each other, so no per-boss row. Pass 1's rows, pooled the same way (736 fights): 70%, X 56%, H 84% (gap 28).

Pooled run-win share (400 runs, median 42%): **Ellaria 1.97×** (75 of 90), Josiah 1.35×, Zarathor 1.34×, Kiri / Corelos
1.26×, Syllamin 1.23×, Betty 1.09×, Basanos 1.01×, Buga 0.99×, Pebbles 0.98×, Marbles / Sparrow 0.95×, Hjalmar 0.92×,
Marwyn 0.86×, Slate 0.77×, Valdris 0.76×. Everyone is inside 0.6-1.5× except Ellaria (D11: reported, not trimmed). The
whole-run healer gap is mostly hers: runs with Ellaria in the party win 83%, runs with Josiah 57%, runs without either 28%.

Where X runs end now: act 1 (X 41-52% clear it, H 79-83%), then act 2's regular fights and elites (X won 93-94% of
the regular fights and 82-86% of the elites, H 98-100%): X act 2 conversion 69-78% vs H 89-97%. The late bosses are
won ~98% by everyone (the next refit's B4).

Guard rails (both campaigns, all acts, a regular / boss fight): Basanos Transform 3.0 / 3.6, self-heal 7.7 / 9.8;
**with the Flea Collar 13.3 / 15.4** (63 / 25 fights; without it 6.8 / 8.6) → over the spec's ~10 cap. Sparrow Juice
Box 0.9 / 0.8 (5.3 / 6.2 HP); Marwyn surges 0.3 / 0.9 (3.5 / 8.6 HP); Hjalmar with Canned Laughter 4.4 HP a regular
fight (worn in 12% of his fights; target 3-6); Slate Hold Still 0.9 / 0.6, Stress Ball socketed in only 6% of his
fights (the sim's level-up policy takes the first offered skill). Josiah 13.8 / 18.1 and Ellaria 10.7 / 10.7 to others
stay the top 2 (next Marbles 1.7 / 2.3). The Fanny Pack as loot is worn in 10% of fights.

**Basanos: the spec's first Flea Collar fallback applied, MEND 3/4/5 → 2/3/4** (D10 pre-agreed it). Measured below.

**V2 = the files after the Basanos fallback** (campaign, 200 runs, seeds 11000+, `v2_camp_11000.txt`; the same seeds as
V1's first batch): campaign 47% (X 30%, H 66%); act 1 cleared 64%, act 2 84%, act 3 88%; act 1 boss 68% (X 57%, H
79%); act 1 regular fights 98% won, a down in 30%; act 2 regular fights a down in 43%, elites 90%; Lich 62/62, Iris
45/47, DM 94/96; end gold 303; Bucket used 196 times in 200 runs (V1: 199 / 192). Basanos: Transform 2.5 a regular /
3.3 a boss fight, self-heal **4.5 / 5.7 without the Collar, 11.1 / 11.9 with it** (22 / 10 fights; was 13.3 / 15.4):
at the spec's ~10 within noise, so the second fallback (mend only into the wolf) is not applied. His run-win share on
these seeds 0.97× (V1 1.19×).

Pooled run-win share over the three S2N campaigns (600 runs, median 43%): **Ellaria 1.94×** (114 of 137), Zarathor
1.35×, Josiah 1.32×, Kiri 1.26×, Syllamin 1.23×, Corelos 1.20×, Betty 1.03×, Pebbles 1.01×, Basanos / Buga 0.99×,
Marbles 0.97×, Marwyn 0.91×, Sparrow 0.90×, Hjalmar 0.86×, Valdris 0.77×, **Slate 0.76×**. 

**The act 1 boss, every S2N batch pooled (act-only 5000+ / 7000+, three campaigns: 1121 fights): 68.4% won; X 56.8%
of 576, H 80.6% of 545.**

**The Bucket of Ice Water, measured** (act 1 only, 300 runs, seeds 7000+, `bal=start.consumables:[]`,
`nobucket_a1_7000.txt`, against S2N on the same seeds; Basanos already at mend 2/3/4 in this run): splashed 219 times
in 300 runs with it. Without it: act 1 boss 69 → 66% (X 61 → 60, H 78 → 71), act 1 cleared **65 → 59%** (X 55 → 50, H
77 → 69), regular fights won 98 → 97%. It is a one-shot revive that waits for a down (`downedAlly` only), not the
recurring heal D9 rejected, and it is worth ~6 points of act 1 clears for both kinds of party: **kept**.

### Decisions (what this pass landed)

1. **Act 1 rows** (`js/data/balance.js`): regular fights ×1.15 HP / **×1.3 damage** (was ×1.4), elites unchanged (×1.05 /
   ×1.2), bosses **×0.9 HP / ×1.35 damage** (was ×1 / ×1.2). Measured above (S2N); suite 5 of `tests/balance_tests.js`
   bounds the new shape.
2. **Sparrow**: Juice Box range 2 → 3 (spec fallback for < 0.6×).
3. **Slate**: HOLD_AI 1.5 → 2.5 (spec fallback for Hold Still < 1.0 a fight; little effect, kept).
4. **Basanos**: MEND 3/4/5 → 2/3/4 (spec's first Flea Collar fallback; D10).
5. **Kept**: the Bucket of Ice Water as the whole starting kit (measured: +6 points of act 1 clears); Marwyn's
   SURGE_HEAL 8 (he is 0.86-0.92×, over the 0.7× trigger for 10); Canned Laughter 4 (optional loot, 4.4-4.6 HP a fight
   when worn); Stress Ball 4/5/6 (not hot: rarely socketed in the sims); the Fanny Pack as ordinary common loot (worn in
   ~10% of fights). Nothing in `js/data/enemies/act1.js`, the act 1 boss files, the generic skills, the passives or
   the items changed.
6. **Ellaria** (D11): not touched. Her run-win share is 1.94× the median (600 runs); reported, see Known issues.

### Act 1 against its targets (normal; the S2N files)

| target | measured (batches) | |
|---|---|---|
| act 1 bosses 60-70% won | **68.4%** of 1121 fights (act-only 69 / 70, campaigns 69 / 65 / 68) | ✓ (upper half, see the bias note) |
| … without a starting healer ≥ 55% | **X 56.8%** of 576 (61 / 58 / 58 / 47 / 57) | ✓ (at the floor) |
| … with one ≤ ~80% | **H 80.6%** of 545 (78 / 83 / 80 / 83 / 79) | ✓ (at the cap) |
| regular fights won 95%+ | 98% (X 96-97%, H 100%) | ✓ |
| … party HP lost about 20-30% | 17% net, 28-29% gross (X 21-22% net) | net under, gross in |
| … someone goes down in 25-40% | 28-31% (X 38-41%, H 17-23%) | ✓ |
| … the first fight or two gentler | the run's first fight: a down in 16-19%, 23-24% HP lost | ✓ |
| act 1 cleared ~60-70% | 60-65% (X 41-55%, H 77-83%) | ✓ |
| the healer gap at the act 1 boss | 24 points pooled (pass 1's rows without the pack: 28) | narrowed, not closed |

### How the AutoPlay bias is accounted for

- AutoPlay overplays bosses (it dodges most wind-ups and solves the Grimble / Rat King puzzles from exact hints) and
  underplays the party (few signatures: 0.04-0.06 a boss fight; setup skills; Stress Ball socketed in ~6% of Slate's
  fights because the sim's level-up policy takes the first offered skill). Both apply to H and X parties alike, so the
  H / X gap is the more trustworthy number, and the pass was steered on it.
- The act 1 boss sits in the upper half of 60-70% on purpose (as pass 1 did): people dodge fewer wind-ups and solve the
  puzzles slower than AutoPlay, so the boss plays harder for them than the sims say. S1N (×0.85 HP / ×1.45 damage, 64%)
  was harder and closed the gap a little more, but it took X parties to or under the 55% floor and makes a missed
  wind-up hit harder for people (Grimble's Audit 18 → 26 instead of 24). The shape was chosen over a plain damage row
  because damage, not HP, is what costs a healer-carried party (shorter fights, fewer rounds to heal through).
- The new sustain is valued by AutoPlay (the spec's quick-pass terms), so the sims see it; a person who keeps Basanos
  flipping, squeezes with Slate and drains with Sparrow gets about what the sims show.

### Tests

- `tests/balance_tests.js` suite 5, renamed `balance: act 1 levers (pass 1, re-fitted by the sustain refit) — regular
  fights hurt, the act 1 bosses are shorter and deadlier, nothing else moves with them`: the boss row's damage is 1.2-1.5
  (was 1.1-1.3), its HP 0.8-1 (was "exactly 1": the fights only get shorter), HP × damage 1.1-1.35; a real Grimble
  fight (`DD.Encounter.build` + `DD.Combat.start`) starts at the row's numbers and with 160 × 0.9 = 144 HP. The regular
  fight bounds (≥ 1.15 damage, ≥ 1.05 HP, ≤ 1.5 / 1.4; elites never past them) are unchanged.
- Suite 6 (the kit owner's, `balance: every party starts the run with a revive and no generic heal (the starting kit,
  D9)`): unchanged; it is the one Pass 1's "Tests" paragraph above still names by its old title.
- `tests/content/hero_sparrow.js` (Juice Box at range 3), `tests/content/hero_basanos.js` (reads `MEND` instead of the
  literal 3), the comment of the act 1 elite guard in `tests/content/enemies_act1.js` (×1.3 regular fights).
- Suite 7 (pass 2's late-boss rows, written ahead) still fails by design: the next refit (B4) writes those rows.

### Requests

- **DOCS**: DESIGN §5 act 1 line: regular fights ×1.15 enemy HP / ×1.3 damage, elites ×1.05 / ×1.2, bosses ×0.9 HP /
  ×1.35 damage (`DD.Balance.act[1]`; shorter, deadlier boss fights). DESIGN §6 Sparrow brief (line ~419) and v2-digest §2
  Juice Box: "within 3". DESIGN §6 Basanos brief (line ~525: "heals him 3–5 HP") and v2-digest §2 Transform ("3/4/5"):
  2 / 3 / 4. v2-digest §3-4 sim tables are pre-D9.
- **NEXT REFIT (acts 2-3, B4)**: re-baseline from V2 (campaign 47%, X 30% / H 66%; Lich 62/62, Iris 45/47, the DM
  94/96; act 2 regular fights a down in 43-50%, elites won 88-94%). X runs now end mostly in act 1 and in act 2's regular
  fights and elites (X won 93-94% of act 2 regular fights and 82-90% of its elites, H 98-100%); the late bosses barely
  split by healer.
- **ENGINE / AUTOPLAY (optional)**: AutoPlay's level-up policy in `tests/sim/sim.js` takes the first offered skill, so
  pool skills like Stress Ball are socketed in ~6% of Slate's fights; a sim policy that weights by the hero's own
  AutoPlay values would show pool-skill sustain better.

### Known issues

- **Ellaria 1.94× the median run-win share** (114 of 137 runs, three campaigns; 1.84× / 2.02× / 1.86× per batch), far
  above ~1.5×. D11: not trimmed. Runs with her win 83%, with Josiah 57%, without either 28%; the whole-run healer gap is
  mostly hers. The sides that could close it (acts 2-3 enemies and bosses, the weaker heroes) belong to the next refits.
- **Slate 0.76× / Valdris 0.77×** (the lowest; inside 0.6×). Slate's sustain barely shows in the sims (Stress Ball is
  rarely socketed; HOLD_AI is at its ceiling). Zarathor 1.35× (flag only: a damage question).
- **The act 1 boss sits at both edges at once**: X 56.8% (floor 55) and H 80.6% (cap ~80), gap 24. The boss-shape lever
  narrows the gap ~1 point per 3 points of H it takes; any harder row takes X under 55. Closing it further needs
  stronger character-linked sustain for healer-less parties or acts-side work; no generic heal was added (D9).
- Act 1 regular fights lose 17% of the party's HP net (28-29% gross; target "about 20-30%"); X parties 21-22% net.
  Raising it costs healer-less parties their runs before the boss (pass 1's E3; S1 → S1N here).
- Basanos with the Flea Collar heals ~11 HP a regular fight (cap ~10, n = 22): the second fallback (mend only into the
  wolf) is held back; apply it if a bigger batch confirms > 10.
- Campaign 43-50% won (target 30-40%) and the late bosses ~98%: the next refit's (B4). End gold ~305-320 (target under
  ~150): the third refit's (B5).

---------------------------------------------------------------------------------------------------------------------

## Sustain refit - acts 2-3 (BALANCE REFIT 2, Nov 13: spec `.tmp/wf13/sustain-spec.md` §9 B4)

Status: **landed** (Nov 13, ~22:20; restarted ~19:15, the Nov 12 attempt ran ~3 minutes and left nothing). This
section lands Pass 2's late-boss rows (its E1-E3 were the head start) on refit 1's files. Sims one Chrome at a time.
Harness: refit 1's `.tmp/bal3/sim.sh` (+ `split.js`); this refit's reports are `.tmp/bal3/runs/r2_*.txt`, its pooling
helper `.tmp/bal3/pool.pl` (wins / n summed over reports) next to refit 1's `shares.pl`.
Baseline = refit 1's V2 (`v2_camp_11000.txt`: the files as they are now; Lich 62/62, Iris 45/47, the DM 94/96).

| id | `bal=` | query / report | result |
|---|---|---|---|
| C1 | E2's rows: Lich hp 1.2 dmg 1.4, Iris 1.25 / 1.4, DM 1.25 / 1.45 | `seeds=200&from=11000`, `r2_c1_camp_11000.txt` | campaign 31% (X 20 / H 43); Lich 49/62 (79%), Iris 37/47 (79%), DM 62/80 (78%); rounds 9.9 · 12.4 · 9.1; late bosses X ≥ H (84-85 / 74-77: only strong X parties get there) |
| C2 | spec C2: Lich, Iris 1.3 / 1.4, DM 1.4 / 1.5 | same seeds, `r2_c2_camp_11000.txt` | campaign 31% (X 17 / H 45); Lich 51/62 (82%), Iris 32/47 (68%), DM 61/76 (80%); rounds 10.5 · 12.8 · 10.0 |

C1 / C2 reading: the act 2 bosses land at the top of 65-80% already at E2's rows (pass 2 had 85 / 84 with the pack: the
pack and pass 1's act 1 rows were worth ~5 points at the late bosses). Iris fights run long (12-13 rounds, her closing
time is round 14); the DM barely moves with HP (1.25 → 1.4: 78 → 80%, within noise; his phases and Plot Armor pace
the fight) and is not yet the hardest. The arithmetic: act 1 cleared 64% × act 2 pre-boss 86% × act 3 pre-boss 93% =
0.51, so the campaign reaches 30% only with the act 2 bosses near 80% and the DM near 73% (the tops of their ranges);
every point of act 2 pre-boss losses (the regular-fight / elite targets) comes out of the 30%. Pooled C1+C2 shares
(the same 200 parties twice, median 31%): Ellaria 1.90×, Valdris 0.59×, Sparrow 0.66×, Slate 0.69×, Hjalmar 0.71×,
Basanos 0.73×. Overdue Notice: 177 hero downs in 62 Lich fights (C1), 36% of them from ≥ 60% HP (the uncapped Late
Fees; the row multiplies only its base 12, the fees are flat).
| C3 | Lich 1.2 / 1.4, Iris 1.2 / 1.45, DM 1.3 / 1.6, `act.2.normal.dmg:1.1` | same seeds, `r2_c3_camp_11000.txt` | campaign 29% (X 16 / H 42); act 2 normal: a down in 52% but won 94% (**X 89%**); act 2 cleared 69% (C1 68%); Lich 51/57 (89%), Iris 37/43 (86%), **DM 57/84 (68%)**, rounds 9.8 · 12.1 · 10.0 |

C3 reading: the act 2 regular-fight row only moves the act 2 losses from the boss to the regular fights (act 2 conversion
69% vs C1's 68%; the bosses rise to 86-89% because the weak parties die before them), and it breaks "regular fights won
95%+" (94%, X 89%). Dropped. The DM at ×1.3 HP / ×1.6 damage is the hardest boss and in range (68%).
| C4 | Lich 1.25 / 1.4, Iris 1.25 / 1.45, DM 1.3 / 1.6, `act.2.elite.dmg:1.15` | same seeds, `r2_c4_camp_11000.txt` | campaign 36% (X 22 / H 51); act 2 elites 85% (X 70 / H 97; Office Hours 65%), act 2 normal 98% (a down in 45%); Lich 52/61 (85%), Iris 35/46 (76%), DM 71/84 (85%) |

C4 reading: the DM at the same row went 68% (C3) → 85% (C4): his rate swings ±8 points per 200-run batch (C3's parties
also reached him more scarred after the harder act 2 regular fights). Pooled on the 11000+ seeds: Lich ~83% at ~1.25 /
1.4 (152/185, C1 / C2 / C4), Iris ~74% at 1.25 / 1.4-1.45 (104/140), the DM 76% at 1.3 / 1.6 (128/168) and 79% at
1.25-1.4 / 1.45-1.5 (123/156). The act 2 elite row ×1.15 puts elites at 85% (top of 75-85) without touching the regular
fights. Next: a candidate on fresh seeds, the Lich and the DM one step harder (logit steps from pass 2's fit: Lich kD
2.9 → ×1.5 damage for −4 points; DM kH 2.3 → ×1.4 HP for −3 points; the DM's damage is at suite 7's 1.6 cap).
| F1 | Lich 1.25 / 1.5, Iris 1.25 / 1.45, DM 1.4 / 1.6, `act.2.elite.dmg:1.15` | `seeds=200&from=13000`, `r2_f1_camp_13000.txt` | **campaign 22%** (X 10 / H 37; these seeds' baseline V1 was 43%, act 1 cleared 59-60%); act 2 elites 79% (X 65%), act 2 normal 96% (a down in 50%); Lich 45/54 (83%), Iris 30/40 (75%), DM 44/66 (67%) |

F1 reading: every per-fight target met at once (act 2 bosses 75-83%, the DM 67% and the hardest, elites 79%) puts the
campaign at 22% (X 10%): act 1 59% × act 2 64% × act 3 59%. The targets can't all hold together with act 1 cleared at
~60-64% (refit 1's, not mine to undo): with the act 2 pre-boss survival at 86% (no elite row) and act 3's at ~91%, the
campaign tops out near 0.62 × 0.86 × 0.80 × 0.91 × 0.75 ≈ 29% with the act 2 bosses at 80% and the DM at 75% (the tops
of their ranges); the elite row costs X parties most (X won 65-70% of act 2 elites with it, 84% without). Decision: the
boss rows carry the act 2-3 curve; no elite or regular-fight row (elites stay ~90%, act 2 regular fights a down in
43-50%, both "roughly"), so the campaign lands as close to 30% as the boss ranges allow. Reported as a conflict for
the lead (Known issues).
| F2 | Lich 1.3 / 1.55, Iris 1.25 / 1.45, DM 1.35 / 1.6 (no act rows) | `seeds=200&from=11000`, `r2_f2_camp_11000.txt` | campaign 28% (X 16 / H 41); act 2 64%, act 3 69%; **Lich 45/62 (73%)**, 4.5 downs a fight (H 5.0), Iris 36/47 (77%), DM 56/76 (74%; X 61 / H 81) |

F2 reading: the Lich's damage step 1.4 → 1.55 cost ~10 points (Help Up cycling under the notices: 4.5 downs a fight)
and made him as hard as the DM. Pooled so far: Iris at 1.25 / 1.45 76% (101/133: C4, F1, F2); the DM at 1.3-1.4 / 1.6
73.5% (228/310: C3, C4, F1, F2); the Lich ~80% at 1.2-1.25 / 1.4-1.5. F3 steps the Lich back (1.25 / 1.5) and Iris
one notch easier (1.2 / 1.45), so the DM stays clearly the hardest.
| F3 | Lich 1.25 / 1.5, Iris 1.2 / 1.45, DM 1.35 / 1.6 (**the files**, no `bal=`) | `seeds=200&from=13000`, `r2_f3_camp_13000.txt` | campaign 26% (X 14 / H 42; baseline on these seeds 43%, act 1 cleared 59%); act 2 73%, act 3 60%; Lich 48/57 (84%), Iris 38/46 (83%), **DM 52/78 (67%**; X 61 / H 69); act 2 normal 97% (a down in 51%), elites 92% |
| F3 | the files | `seeds=200&from=17000` (fresh), `r2_f3_camp_17000.txt` | campaign 27% (X 12 / H 48); act 1 62%, act 2 63%, act 3 68%; Lich 41/50 (82%), Iris 37/46 (80%), DM 53/70 (76%; X 57 / H 85); act 2 normal 94% (a down in 51%), elites 90% |
| F3 | the files | `seeds=200&from=11000`, `r2_f3_camp_11000.txt` | campaign 29% (X 14 / H 44); act 2 69%, act 3 65%; Lich 51/62 (82%), Iris 37/47 (79%), DM 57/77 (74%; X 63 / H 79); act 2 normal 97% (a down in 43%), elites 90% |
| A1 | the files, act 1 only (the re-check of refit 1's act 1) | `seeds=300&from=9000&stop=1` (fresh), `r2_a1_9000.txt` | act 1 boss 64% (X 54 / H 74; Grimble X 61 / H 82, Rat King X 45 / H 68); act 1 cleared 60% (X 48 / H 74); regular fights won 98%, a down in 30% (X 38 / H 21), 17% net (28% gross) HP lost; the run's first fight a down in 14% |

Landing history: F2's rows went into `DD.Balance.encounters` at ~20:55 (provisional; suite 7 passed), replaced by F3's
at ~21:15 (the files since; validated on three seed sets below).

### Decisions (what this refit landed)

1. **The late-boss rows** (`DD.Balance.encounters`, F3): **Lich-tenstein ×1.25 HP / ×1.5 damage, Dr. Iris ×1.2 / ×1.45,
   the DM ×1.35 / ×1.6** (at ×1 they were won 95-100%). Damage-heavy on purpose: HP lengthens the Lich's Late Fees clock
   and pushes Iris toward her round-14 closing time, and the DM barely responds to HP (his phases and Plot Armor pace
   the fight) but does to damage (×1.5 → ×1.6: ~79 → ~72%). The DM's row is the largest, so he is the hardest boss.
2. **No act 2 / act 3 regular-fight or elite rows** (`act[2]`, `act[3]` stay ×1). C3: ×1.1 regular-fight damage reached
   a down in 52% but took the wins to 94% (X 89%) and only moved the act 2 losses from the boss to the regular fights.
   C4 / F1: ×1.15 elite damage put elites at 79-85% but X parties won 65-70% of them, and with the bosses in range it
   takes the campaign to ~22-25%.
3. **No boss or enemy content changed** (`lich.js`, `beholder.js`, `dm.js`, `act2.js`, `act3.js`, `events.js`
   untouched). Pass 2's "divers": the Lich's notices go to the nearest foe with flat (unscaled) Late Fees, a readable
   design rule (the boss notes); the imp's Go Live! rarely downs a hero from ≥ 60% HP (5-6%: it picks off heroes who start
   the fight hurt; 16-25% of its downs land before the hero acts); the wisp's zap finishes the wounded. None is an outlier in the F3 batches, so they stay.
4. **Basanos' second Flea Collar fallback (mend only into the wolf) is NOT applied**, although the Collar subset is over
   the spec's ~10: 11.2 HP a regular fight (F3, 46 fights; refit 1 11.1 of 22). The fallback cuts his mend in every
   fight, and he is at 0.77× the median run-win share; flagged under Requests instead (D10 allows it, does not require it).
5. **Ellaria** (D11): untouched; measured and flagged (2.43×, below). No other spec fallback triggered (Marwyn 0.94× >
   0.7×; Sparrow 0.89×, Juice Box 0.9 a fight; Slate's HOLD_AI is already at 2.5).

### Acts 2-3 against the targets (normal; the files = F3, 600 runs: seeds 11000+ / 13000+ / 17000+)

| target | measured (pooled; per batch) | before (V2 11000+ / V1 13000+) | |
|---|---|---|---|
| act 2 bosses 65-80% | **Lich 82.8% of 169** (82 / 84 / 82), **Iris 80.6% of 139** (79 / 83 / 80) | 98-100% | top edge (~1-3 over) |
| the DM 60-75%, the hardest | **72.0% of 225** (74 / 67 / 76) | 98-99% | ✓ (hardest by ~9-11 points) |
| H-X gap at the bosses ≲ 15 (spec) | Lich H 85 / X 78, Iris 83 / 77, **DM 77 / 60** | ~0 | act 2 ✓, DM 17 |
| act 2 regular fights: a down in ~50-60%, won 95%+ | a down in **48%** (43 / 51 / 51), won 96.0% (X 92.5%) | 43-50%, 97% | bottom edge |
| act 2 elites won 75-85% | **90.6%** (X 83 / H 95) | 88-94% | ✗ (see decision 2) |
| act 3 regular / elite fights | won 97.4% (a down in 44%) / 94.7% | 97 / 97% | — |
| boss fight length (rounds) | Lich ~10, Iris ~12, the DM ~9.7 | 7.5-8.8 | Iris near her closing time |
| whole campaign 30-40% | **27.0%** (29 / 26 / 27; each batch's 95% CI ±6) · X 13.1% / H 44.5% | 47% / 43% (X 30 / H 66) | ✗ bottom, see Known issues |
| act 1 (refit 1's, re-checked on fresh seeds) | A1 (9000+, 300 runs): boss 64% (X 54 / H 74), cleared 60%; F3 17000+: boss 66% (X 59 / H 75) | refit 1: 68.4% (X 56.8 / H 80.6) | in range, X at the floor |
| end gold (refit 3's) | 270 / 273 / 275 | 303-319 | — |

Pooled run-win share (F3, 600 runs, median 23.2%): **Ellaria 2.43×** (74 of 131), **Zarathor 1.87×**, **Josiah 1.70×**,
Syllamin 1.49×, Betty 1.25×, Kiri / Pebbles 1.23×, Marbles 1.06×, Marwyn 0.94×, Corelos 0.90×, Sparrow 0.89×, Hjalmar /
Slate 0.81×, Basanos 0.77×, Buga 0.74×, Valdris 0.73×. Nobody under 0.6×; three over ~1.5×. The ratio grew because the
median fell (V2: median 43-45%, Ellaria 1.9×): every late boss compounds the act 1 healer edge (runs with a starting
healer clear act 1 78% vs 47-50%, then convert acts 2-3 at 57% vs 27%).

Sustain guard rails in the longer late fights (F3, all acts; a regular / boss fight): Basanos Transform 2.5-2.7 / 3.4-4.0,
self-heal 4.7-5.4 / 7.9 (≤ ~8 / ~15 ✓), **with the Flea Collar 11.2 / 12.1** (46 / 20 fights; cap ~10, decision 4);
Sparrow Juice Box 0.9 / 1.0 (≥ 0.9 ✓), 4.9-5.3 / ~8 HP; Marwyn surges 0.3 / ~1.0, 3.1-3.7 / 7.8-9 HP (✓); Slate Hold
Still 0.8-0.9 / 0.8-0.9 (under 1.2; HOLD_AI at its ceiling), Stress Ball socketed in ~5% of his fights; Hjalmar with
Canned Laughter 2.8-3.9 HP a regular fight (✓). Josiah 13.2-14 / 18.6-21.8 and Ellaria 10.1-10.9 / 10.7-13.8 HP to others
stay the top 2 (next Marbles 1.4-1.7).

### How the AutoPlay bias is accounted for

- AutoPlay overplays bosses: it dodges most wind-ups (Bookfall, Final Notice, Iris's rays and exams, Rocks Fall, the
  train) and solves the phylactery, mirror, Track Switch and handbook puzzles from exact hint values. People will find
  all three late bosses harder than the sims say, so the rows stop at the top of the target ranges (82 / 81 / 72%)
  rather than their middles; the DM, the most puzzle-driven fight, stays clearly the hardest.
- AutoPlay underplays the party (signatures 0.02-0.04 a boss fight, setup skills, summons; pool skills such as Stress
  Ball are rarely socketed by the sim's level-up policy). That applies to H and X alike; the H-X gaps (5-7 points at the
  act 2 bosses, 17 at the DM) are the steadier numbers.
- The per-boss rates swing ±7-9 points between 200-run batches (the DM 67-85% at the same ×1.6 damage), so every
  decision above uses pooled fights (169 / 139 / 225 at the final rows; 310+ DM fights at ×1.6 damage across C3-F3).

### Tests

- `tests/balance_tests.js` suite 7 (`balance: acts 2-3 levers (pass 2) — …`, written ahead by pass 2) now passes with
  the rows (24 ok in the isolated run: every row harder than ×1, at most ×1.8 HP / ×1.6 damage, the DM's row the
  largest, casual < normal < brutal, fixture boss fights read no row, a real fight starts at the row's numbers). New
  check: each row leans on damage (`dmg ≥ hp`). Header comments updated. The boss suites' AutoPlay sims already drop the
  row (`realFight` / `bare`), so their numbers are unchanged.
- Full run (Nov 13, ~22:30, `.tmp/bal3/r2_test_full.txt`): 998 suites, 122,928 assertions ok, 1 failure in 1 section,
  not from this refit: `hero_marwyn: AutoPlay battles, acts 2-3` ("many different skills used (6)": the known coin-flip
  variety bar on fixture fights that read no row). No "Error in" lines. Balance suite 7 no longer fails.

### Requests

- **DOCS**: DESIGN §5 late-boss line: "Lich-tenstein ×1.25 HP / ×1.5 damage, Dr. Iris ×1.2 / ×1.45, the Dungeon Master
  ×1.35 / ×1.6 (`DD.Balance.encounters`, damage-heavy: at ×1 a campaign party won them 95-100%)". The v2-digest §3-4 sim
  tables are pre-D9 and pre-rows.
- **LEAD (decision needed: the targets conflict)**: with act 1 cleared at 60-64% (refit 1's) and the act 2 / act 3
  pre-boss survival at ~86% / ~91%, the bosses at the tops of their ranges give a ~27-29% campaign; every per-fight
  target met at once (F1: elites 79%, bosses 75-83%, the DM 67%) gives ~22%. Options: (a) keep this (bosses in range,
  campaign ~27%); (b) let the act 2 bosses sit ~85% and the DM ~76% (C4-like, ~31-36% in one batch) for a 30%+ campaign;
  (c) widen the campaign target to 25-35%. Elites at 75-85% would cost another ~2-4 campaign points (X most).
- **BALANCE REFIT 3 (B5)**: start from these files (campaign 27%, X 13% / H 44.5%; end gold ~273). X runs are the low
  side (the spec's ~20%): the out-of-combat Mystery Stew lever (0.3 → 0.35) is the least generic one; never a starting
  heal. Casual / brutal are unmeasured with the rows (`diff=casual|brutal`).
- **HERO-BASANOS (flag)**: the Flea Collar subset heals 11.2 HP a regular fight (cap ~10). Rather than the global
  into-the-wolf fallback (a nerf to a 0.77× hero in every fight), a Collar-only lever, e.g. the Collar's free switch
  doesn't count as the first Transform, would trim only the outlier.
- **LEAD / hero owners (flag)**: Zarathor 1.87× (a damage question), Josiah 1.70× (never gut Josiah), Ellaria 2.43×
  (D11: not trimmed); lowest Valdris 0.73×, Buga 0.74× (inside 0.6×).

### Known issues

- **Campaign 27% at normal** (target 30-40%): see the LEAD request; the per-batch 95% CI (±6) includes 30% in 2 of 3
  batches. X runs win 13% (the spec's "about 20%+").
- **Act 2 elites 90.6%** (target 75-85%) and **act 2 regular fights a down in 48%** (target ~50-60%; won 96%): both left
  without a row (decision 2); the act 2 bosses at 81-83% are 1-3 points over 80.
- **The DM's H-X gap is 17 points** (77 / 60%; the spec's ~15). His Fudged Roll (×1.6: 32 damage at once, single
  target) is his main damage and parties without a healer can't win it back; a shorter DM fight (less HP, same damage)
  is the lever if the gap matters more than the campaign.
- **Lich fights are down-heavy**: 3-4 hero downs a fight (Help Up cycling under the notices), 23-30% of Overdue Notice
  downs from ≥ 60% HP once the fees build (2.6-3.2 notice downs a Lich fight in F3). The rule is readable (nearest
  foe, live fee count), but a fee cap is the lever if people find it bursty. Iris fights run ~12 rounds (her closing time is 14).
- **Hero shares**: Ellaria 2.43×, Zarathor 1.87×, Josiah 1.70× the median (600 runs), above ~1.5×.
- **Act 1 re-check**: X 54% on the fresh 9000+ batch (floor 55%; 59% on 17000+, pooled fresh 56%): refit 1's act 1 is
  unchanged by this refit (its rows and files are untouched; the same seeds replay act 1 exactly).

---------------------------------------------------------------------------------------------------------------------

## Sustain refit - difficulties and economy (BALANCE REFIT 3, Nov 13: spec `.tmp/wf13/sustain-spec.md` §9 B5-B6)

Status: **done** (started Nov 13 on refit 2's files; the machine slept at 23:58 just after BRU6 landed; the Nov 14
restart recorded BRU6, validated it on a second seed set and ran the full suite: "Brutal: BRU6" and "Full run" below). Sims
one Chrome at a time. Harness: `.tmp/bal3/sim.sh` (+ `split.js`) plus a new read-only economy tracker
`.tmp/bal3/econ.js` (`#econ` block: per act, how often a shop is among the map choices and taken, visits per run that
reaches the act, gold on entry, spent per visit, visits that bought nothing; gold at each boss's start; end gold of all
/ won / lost runs). Reports: `.tmp/bal3/runs/r3_*.txt`. Seeds 15000+ (left for B5 by refit 2) for the paired
experiments.

Economy target (the lead's task line): unspent gold at the end of a run under ~150 and shops worth a visit. The spec's
B5 said "end gold stays about 320"; the newer lead target wins (Deviations). Measured as **gold at the final boss's
start** (the last moment gold can be spent: the DM's 80-100 gold lands after the run is decided) and as the end gold of
all runs.

| id | query / report | result |
|---|---|---|
| N0 | the files (refit 2's), `seeds=200&from=15000`, `r3_n0_camp_15000.txt` | campaign 31% (X 12 / H 55); act 1 cleared 59%; Grimble 70%, Rat King 56%, Lich 78%, Iris 82%, DM 81%. **Economy**: a shop is among the map choices at only 11-13% of choices; visits per run that reaches the act 0.5 / 0.6 / 0.6 (half the runs never see a shop in an act); a visit spends most of the purse (89 / 197 / 220 gold per visit, 0-2% buy nothing); gold earned ~240-257 an act; **gold at the boss's start: act 1 117, act 2 216, the DM 342 (median 307, p75 509)**; won runs end with 482; all runs 274 |

N0 reading: the shops are worth the visit (the sim buys something on 98-100% of visits and leaves with ~25-35% of its
gold) but the map rarely offers one (one shop per act map, `minShops: 1`, weight 9 of 101), so gold piles up between
visits. The lever is access, not prices or income: more shops on the map.
| E1 | `bal=map.minShops:2`, same seeds, `r3_e1_camp_15000.txt` | campaign 29% (X 11 / H 53); a shop among 18% of map choices; visits/run 0.7 / 0.7 / 0.9; spent per run 219 (N0 165); **gold at the boss's start 99 / 173 / 244** (DM median 206, p75 389); won runs end with 384, all runs 213 |
| E2 | E1 + `priceAct.2:1.25,priceAct.3:1.5`, same seeds, `r3_e2_camp_15000.txt` | campaign **26%** (X 8 / H 51); DM gold 213 (median 161); spent per run 233 — **rejected**: act price inflation buys less for the same gold (fewer items and potions late) and costs ~3 campaign points (X most) while the hoard barely moves (-31) |
| E3 | E1 + `map.weights.shop:16`, same seeds, `r3_e3_camp_15000.txt` | campaign 26% (X 11 / H 45); shops offered at ~18-20% of choices (E1 18%: the one-shop-per-row and no-shop-after-a-shop rules cap it), visits 0.8 / 0.9 / 0.9; DM gold 217 (median 192); 1768 fights (E1 1839: shops replace fights, so fewer level-ups) — **rejected**: the extra weight barely adds shop visits and takes fights away |

E1-E3 reading: once every act map has two shops, AutoPlay's route takes nearly every shop it is offered in acts 2-3
(49/59, 44/45) and spends ~60-75% of its purse there; the map can't offer many more (one shop per row, never two in a
row). What is left at the DM (~215-245) is gold the sim had no use for at its last shop plus what it earned after.
Next: give the shops more to sell (E4: 4 items instead of 3), then trim the income if needed.
| E4 | E1 + 4 items in the shop's stock (`shopItems=4`, an econ.js experiment param on `DD.Rewards.SHOP.items`), same seeds, `r3_e4_camp_15000.txt` | campaign 27% (X 10 / H 49); DM gold 212 (median 166); spent per run 214 — **rejected**: a fourth item barely moves spending (AutoPlay buys an item only when it beats the wearer's gear by rarity, so a bigger stock rarely adds a want) |

E4 reading: with access fixed (E1), AutoPlay's demand is the cap. It buys what it wants and leaves the rest, and the runs
that never see a shop in act 3 (~27%) carry 400+ gold into the DM (the p75-p90 tail). The income breakdown (a 4-run
smoke, econ.js now splits income by source) before the DM: normal-fight gold ~185, boss gold ~180, in-fight gold
(chests, map piles, passives; content, not a knob here) ~150, elites ~65, treasure ~45, events ~35, start 60. The lever
left is the income that arrives where nothing can be bought: the act bosses' payday (80-100, spent only if the next act
offers a shop) and the per-act growth of regular-fight gold.
| E5 | E1 + `gold.fight.boss:[50,70],gold.fightPerAct.normal:0`, same seeds, `r3_e5_camp_15000.txt` | campaign 25% (X 8 / H 48); act 1 identical to E1 (the paydays land after the act 1 boss); spent per run 186 (E1 219); **DM gold avg 190, median 132** (p25 76, p75 324, p90 409); won runs end with 279 (median 204); all runs 167. Income before the DM (runs reaching him): normal fights 160, boss 123, in-fight 108, elites 83, treasure 48, events 23, piles 9 |

E5 reading: the median run now reaches the DM with ~130, but the mean stays ~190 because ~31% of act 3 runs never pass a
shop (AutoPlay's route is greedy: it looks only at the next row) and carry 300-400 into the DM. A player reading the
map routes to a shop when the purse is full; E6 measures that with a scratch route (`shopRoute=100`: with 100+ gold,
among the next nodes keep those from which an unvisited shop of the act is still reachable).
| E6 | E1 + the scratch shop-planning route (`shopRoute=100`), same seeds, `r3_e6_camp_15000.txt` | campaign 25% (X 12 / H 41); act 3 visits 1.2 per run (96% of act 3 runs visit a shop), spent per run 253; **DM gold avg 137, median 121** (p75 176, p90 295); 1739 fights (a planned shop visit replaces a fight now and then) |

E6 reading: with two shops per map and a player who routes toward a shop when the purse is full, the hoard at the DM is
already under ~150 without touching income; AutoPlay's greedy route is most of the gap (E1's 244). Decision: land
**two shops per act map + E5's payday trim** (bosses 50-70, regular fights +0 per act). That puts AutoPlay's median run
under ~150 at the DM (132) and leaves a shop-planning player ~90-140 (E5 / E6 arithmetic); a smaller trim keeps
AutoPlay's median over 150. Act price inflation (E2), a bigger stock (E4) and more shop weight (E3) are out.
**Landed in `js/data/balance.js` (~23:55)**: `map.minShops 2`, `gold.fight.boss [50, 70]`, `gold.fightPerAct.normal
0`, and the spec's B5 lever `heal.reward 0.35` (Mystery Stew; X campaign wins were 8-12%, far below the spec's ~20%;
a pick-1-of-3 choice offered only when someone is hurt, never a starting heal: its effect is below these batches'
resolution). Tests: `run_tests.js` reads the Stew's fraction from DD.Balance; new balance suite 8 (the economy).

| id | query / report | result |
|---|---|---|
| CAS0 | the files (economy landed), `seeds=100&from=15000&diff=casual`, `r3_cas0_camp_15000.txt` | **casual 76%** (95% CI 67-83; X 60 / H 98); act 1 cleared 94%, act 2 95%, act 3 85%; Grimble 92%, Rat King 96%, Lich 93%, Iris 98%, the DM 86% (X 74 / H 100); regular fights won 99-100% with a down in 14-30%; DM gold 177 (median 129) |
| BRU0 | the files, `seeds=100&from=15000&diff=brutal` (brutal = ×1.25 HP / ×1.2 damage, +1 grunt in regular fights), `r3_bru0_camp_15000.txt` | **brutal 1%** (1 of 100; X 0 / H 2); act 1 cleared 21%: act 1 regular fights won only 80% (a down in 60%, 1.9 downs a fight), the act 1 bosses 45% (Grimble X 33%, Rat King X 13%); act 2 regular fights 75%. Brutal's row predates the act 1 rows and the late-boss rows, and stacks on them (act 1 regular fights ×1.44 HP / ×1.56 damage + a grunt) |
| BRU1 | `bal=difficulty.brutal.hp:1.15,difficulty.brutal.dmg:1.1` (the extra grunt kept), same seeds, `r3_bru1_camp_15000.txt` | **brutal 8%** (95% CI 4-15; X 5 / H 12); act 1 cleared 35%, act 2 40%, act 3 57%; act 1 regular fights won 87%, act 2 74%, act 3 90%; act 1 bosses 57%, act 2 bosses 88%, the DM 73% (8/11) |
| BRU2 | `bal=difficulty.brutal.hp:1.2,difficulty.brutal.dmg:1.15,extraEnemies.brutal.normal:0.5`, same seeds, `r3_bru2_camp_15000.txt` | brutal 3% (CI 1-8); act 1 cleared 28%; act 1 regular fights 88% (the half-chance grunt with more damage hurts as much as BRU1's sure grunt), act 1 bosses 41% — rejected: damage is the lever that decides brutal's bosses |
| BRU1 | BRU1's rows, `seeds=200&from=15100&diff=brutal` (fresh brutal seeds), `r3_bru1_camp_15100.txt` | brutal 5% (CI 3-9; X 0 / H 13); act 1 cleared 33% (X 20 / H 52); act 1 regular fights 86%, act 1 bosses 52%, act 2 bosses 82%, the DM 50% (10/20). Pooled BRU1: 18/300 = **6%** (X 3/178 = 2%, H 15/122 = 12%) |
| BRU3 | `bal=difficulty.brutal.hp:1.1,difficulty.brutal.dmg:1.1`, seeds 15100+ (paired with the line above), `r3_bru3_camp_15100.txt` | brutal 6% (CI 3-10; X 1 / H 14); act 1 cleared 30%; act 1 regular fights 87%, act 1 bosses 45%: the HP step barely matters; what sinks brutal runs is act 1 (X parties clear it 15-20%), mostly its regular fights with the extra grunt (86-87% won, ~4 of them before the boss) |
| BRU4 | `bal=difficulty.brutal.hp:1.15,difficulty.brutal.dmg:1.1,extraEnemies.brutal.normal:0.5`, seeds 15100+, `r3_bru4_camp_15100.txt` | brutal 6% (CI 3-10; X 1 / H 13); act 1 cleared 38% (regular fights 91%), act 2 bosses 63%, the DM 48% (11/23) |
| BRU5 | `bal=difficulty.brutal.hp:1.15,difficulty.brutal.dmg:1.05,extraEnemies.brutal.normal:0.5`, seeds 15100+, `r3_bru5_camp_15100.txt` | **brutal 8%** (CI 5-13; X 2 / H 16); act 1 cleared 44% (regular fights 92% with a down in 44%, bosses 57%), act 2 44% (bosses 73%), act 3 42% (the DM 64%, 16/25) |

Landing history: BRU1's row (×1.15 / ×1.1, the sure extra grunt) went into `difficulty.brutal` first (in range,
6% pooled over 300 runs); BRU5 is the candidate for the middle of 5-15%, validated next on fresh seeds. (Superseded:
BRU6 below is the landed row.)
| BRU5 | BRU5's rows, `seeds=200&from=15300&diff=brutal` (fresh), `r3_bru5_camp_15300.txt` | brutal 13% (CI 9-18; X 5 / H 22); act 1 cleared 44% (regular fights 92%, bosses 58%), act 2 55% (bosses 77%), act 3 52% (the DM 68%, 25/37). Pooled BRU5: **41/400 = 10.3%** (X 8/229 = 3.5%, H 33/171 = 19%) |

**Landed, then replaced by BRU6**: `difficulty.brutal { hp: 1.15, dmg: 1.05 }`, `extraEnemies.brutal.normal 0.5` (BRU5;
replaced BRU1's provisional row; the 0.5 went back to 1 with BRU6). With it Settings / party select read "... and normal
fights have a 50% chance of an extra enemy" (DD.UI.DIFFICULTIES builds the text from these numbers). Casual stays ×0.8 /
×0.8 (76%, in 65-80).
| FIN | **the files** (economy + BRU5; the brutal row doesn't reach normal runs, so FIN stands for BRU6's files too), `seeds=400&from=21000` (fresh), `r3_final_camp_21000.txt` | **normal 31.0%** (124/400, 95% CI 27-36; X 14% / H 50%); act 1 cleared 63%, act 2 71%, act 3 70%; act 1 bosses 67% (X 54 / H 80); Lich 82%, Iris 84%, the DM 79% (X 63 / H 84); **DM gold avg 181, median 139** (p25 76, p75 248, p90 360); shop visits 1.6 a run (0-3% buy nothing), spent 211 a run; won runs end with 281 (median 254, the DM's 50-70 included), all runs 177 |
| CAS1 | the files, `seeds=200&from=15100&diff=casual` (fresh), `r3_cas1_camp_15100.txt` | casual 74% (CI 67-79; X 68 / H 82); act 1 cleared 91%; Grimble 93%, Rat King 89%, Lich 93%, Iris 98%, the DM 90%; regular fights won 99-100% with a down in 13-25%. Pooled casual (CAS0 + CAS1): **223/300 = 74.3%** |
| BRU6 | `bal=difficulty.brutal.hp:1.15,difficulty.brutal.dmg:1.05,extraEnemies.brutal.normal:1` (BRU5's rows with the sure grunt back), `seeds=200&from=15100&diff=brutal`, `r3_bru6_camp_15100.txt` | **brutal 13.5%** (27/200, CI 9-19; X 3/121 = 2.5%, H 24/79 = 30%); act 1 cleared 38% (regular fights won 90% with a down in 46%; the run's first fight 96% / 25%; bosses 53%: Grimble X 38 / H 66, Rat King X 45 / H 63), act 2 51% (regular fights 86%, bosses 76%), act 3 69% (the DM 79%, 27/34); gold at the DM's start avg 152, median 130 |
| BRU6 | **the files** (BRU6 landed; Nov 14 validation), `seeds=200&from=15300&diff=brutal` (paired with BRU5's 13% there), `r3_bru6_camp_15300.txt` | brutal 8.5% (17/200, CI 5-13; X 3/108, H 14/92); act 1 cleared 33% (regular fights 89% with a down in 48%; the first fight 98% / 26%; bosses 47%), act 2 44% (bosses 66%), act 3 59% (the DM 77%, 17/22); gold at the DM's start avg 185, median 110. Pooled BRU6: **44/400 = 11.0%** (X 6/229 = 2.6%, H 38/171 = 22.2%); act 1 regular fights won 89.5% with a down in 47%, act 1 bosses 50.0% (X 41 / H 59), act 2 regular fights 87.5% (a down in 69%), act 2 bosses 71%, the DM 78% (44/56) |

#### Brutal: BRU6 (landed Nov 13 ~23:50, after the notes above were written; recorded on the Nov 14 restart)

Why BRU5 was replaced: the 23:31 full run (`.tmp/bal3/r3_test_full.txt`: 999 suites, 122,796 assertions ok, 103
failures in 7 sections) failed 6 sections on the brutal row: 4 on BRU5's half chance of the extra grunt (`mapgen:
encounter build` ×2, `enemies_act1` / `enemies_act2: encounters build`: their encounter tests, in files this role
doesn't own, check that brutal brings **one** extra enemy to every normal fight) and 2 on the multipliers (`engine:
damage pipeline` and `narrative: tips` hard-code ×1.25 / ×1.2); the 7th was the known `hero_marwyn` AutoPlay battle. The sure grunt is also brutal's
identity in the Settings text since v1. So BRU6 keeps BRU5's milder multipliers (×1.15 HP / ×1.05 damage: damage is
the lever that decides brutal's bosses) and puts the grunt back in every regular fight; on the same seeds it won 13.5%
(BRU5 8%, BRU1's ×1.1 damage 5%), and 8.5% on 15300+ (BRU5 13%): pooled **11.0% of 400** (BRU5 10.3% of 400; the
two rows are within each other's batch spread, 8-14%). `js/data/balance.js`: `difficulty.brutal { hp: 1.15, dmg: 1.05 }`,
`extraEnemies.brutal.normal 1` (unchanged from HEAD). Settings / party select read "Enemies have 15% more HP and deal 5% more
damage, and normal fights bring one extra enemy." (DD.UI.DIFFICULTIES builds it from these numbers). The engine and
narrative tests that still hard-code the old row are under Requests.

### Decisions (what this refit landed, all in `js/data/balance.js`)

1. **Two shops on every act map** (`map.minShops` 1 → 2). N0: one shop per map left half the runs without a shop in
   an act while a visit spent most of the purse; now 64-72% of runs that reach an act visit one (1.6 visits a run).
   The generator places them where the map's rules allow (one per row, never a shop after a shop, a row keeps its only
   fight): ~98% of maps get two, the rest one.
2. **Less gold where nothing can be bought**: the act bosses pay 50-70 (was 80-100; still at least an elite's best) and
   regular fights pay 12-20 in every act (was +6 per act). Prices stay flat across acts (E2: inflation buys less for the
   same hoard) and the stock stays 3 / 2 / 2 (E4).
3. **Mystery Stew 35%** (`heal.reward` 0.3 → 0.35): the spec's B5 lever for parties without a healer (X campaign wins
   8-14%, far below its ~20%). An out-of-combat pick-1-of-3 choice offered only when someone is hurt; its effect is below
   these batches' resolution. The tavern (35%), the shop's Questionable Bandages (30%) and the act-clear heal (50%)
   are unchanged (spec B5).
4. **Brutal ×1.15 HP / ×1.05 damage, the extra grunt in every regular fight kept** (BRU6; was ×1.25 / ×1.2: 1% won;
   the old row predates the act 1 and late-boss rows it stacks on). Damage is the lever that decides brutal's bosses
   (BRU2). BRU5 (a 50% grunt) was landed first and replaced by BRU6 (see "Brutal: BRU6"): the half grunt broke the
   encounter tests of other owners and brutal's "one extra enemy" identity, and BRU6 measured as well. Brutal stays
   clearly the hardest setting (400 runs): act 1 regular fights won 89.5% with a down in 47% (normal 98% / 31%), the
   act 1 bosses 50% (normal 67%), the campaign 11.0% (normal 31%).
5. **Casual unchanged** (×0.8 / ×0.8): 74% over 300 runs.
6. **Ellaria** (D11): untouched; the spec's B6 trim is refused by the user (D10/D11), so measured and flagged only.
   No other hero number changed (B6 is flags only, below).

### Against the targets (the files; normal = FIN, 400 runs on fresh seeds 21000+, unless stated)

| target | measured | |
|---|---|---|
| act 1 bosses 60-70% | **67.0%** of 376 (Grimble 71%, Rat King 64%) | ✓ |
| act 1 bosses, parties without a starting healer ≥ 55% / with one ≤ ~80% | **X 54.3%** of 184 / **H 80.2%** of 192 | X 1 under the floor (refit 1's rows; untouched), H at the cap |
| act 1 regular fights won 95%+ | 98% (X 96%) | ✓ |
| act 1 regular fights: HP lost ~20-30% | 17% net (overall regular fights 18% net / 34% gross) | under (refit 1's known issue) |
| act 1 regular fights: a down in ~25-40% | 31% (X 41 / H 20); the run's first fight 16% (gentler) | ✓ |
| act 2 regular fights: a down in ~50-60% | 48% (X 65 / H 38), won 96% | bottom edge |
| act 2 elites won 75-85% | 93% (X 78 / H 99) | ✗ over (refit 2's decision 2) |
| act 2 bosses 65-80% | Lich 82.2% of 101, Iris 84.1% of 113 | 2-4 over (refit 2 pooled: 83 / 81) |
| the DM 60-75%, the hardest | 79.0% of 157 (X 63 / H 84); the hardest boss by 3-5 points | 4 over in this batch; with E5 (70%) 76% of 228, refit 2's pool 72% of 225 |
| campaign normal 30-40% | **31.0%** (124/400, CI 27-36) | ✓ (bottom; E5 on 15000+ 25%; refit 2's pool 27%) |
| campaign casual 65-80% | **74.3%** (CAS0 76% of 100, CAS1 74% of 200) | ✓ |
| campaign brutal 5-15%, winnable | **11.0%** of 400 (BRU6, the files: 13.5% of 200 on 15100+, 8.5% of 200 on 15300+); H 22.2%, X 2.6% | ✓ (BRU5, replaced: 10.3% of 400) |
| casual > normal > brutal, also for X | X 68-60% > 14% > 2.6%; H 82-98% > 50% > 22% | ✓ |
| heroes within ~0.6-1.5× the median | FIN (median 30.5%): Ellaria 1.79×, Josiah 1.61×, … Slate **0.50×**; pooled with refit 2's 600 (1000 runs, median 24.2%): Ellaria 2.30×, Josiah 1.78×, Zarathor 1.72×, Syllamin 1.45×, … Basanos 0.77×, Slate 0.72× | ✗ (flags, below) |
| unspent gold at the end under ~150 | gold at the DM's start (the last moment to spend it): **avg 181, median 139** (N0: 342 / 307); all runs end with 177 (lost 130); won runs 281 incl. the DM's payout | median ✓, mean over (the no-shop tail; see the bias) |
| shops worth a visit | 1.6 visits a run (N0 1.1), 0-3% of visits buy nothing, ~170-180 spent per act 2-3 visit | ✓ |

Sustain guard rails (FIN, all acts; a regular / boss fight): Basanos Transform 2.8 / 4.2, self-heal 4.7 / 7.4, with the
Flea Collar 8.0 (46 fights) / 13.3 (22) — under the ~10 cap in this batch (refits 1-2: 11.1-11.2); Sparrow Juice Box
0.9 / 1.1, 5.0 / 8.5 HP; Marwyn 0.4 / 1.1 surges, 3.6 / 10.6 HP; Slate Hold Still 0.9 / 0.7, Stress Ball socketed in 54
of 530 fights; Hjalmar with Canned Laughter 4.7 HP a regular fight (33 fights, worn 6%). Josiah 13.3 / 19.9 and Ellaria
10.3 / 10.1 HP to others stay the top 2 (next Marbles 1.8 / 2.3). The Bucket of Ice Water was splashed 381 times in 400
runs; the First-Aid Fanny Pack (loot) is worn in 6% of fights.

### How the AutoPlay bias is accounted for

- **Economy**: AutoPlay's route is greedy (it scores only the next row's nodes and wants a shop only with 90-150+ gold)
  and it buys only rarity upgrades, a heal under 60% HP, potions into empty pockets and a scar removal / re-roll when
  rich. So it under-visits and under-spends. E6 measured a shop-planning route (with 100+ gold, keep the next nodes
  that still lead to an unvisited shop): the DM-start hoard fell from 244 to 137 on the same economy (-44%). Applied to
  the landed files, a player who routes toward shops reaches the DM with ~100; AutoPlay's median run with 139 and its
  mean, dragged by the ~28% of act 3 runs that never pass a shop, with 181. The trim was sized so AutoPlay's median is
  under ~150, not its mean: trimming further would starve the shop-planning player.
- **Difficulties**: AutoPlay overplays bosses (wind-ups dodged, puzzles solved from exact hints) and underplays
  signatures and setup, alike on every difficulty. Brutal was put in the middle of 5-15% (BRU6 11.0% of 400) rather
  than at its top; casual (74%) sits mid-range. Decisions use 300-400 pooled runs (brutal: 6% pooled BRU1 vs 10% BRU5
  vs 11% BRU6; single 200-run batches of the same rows spread 8-14%).
- **Hero shares**: per-hero samples are ~100 runs in a 400-run batch (±9 points); the 1000-run pool is the steadier
  figure.

### Tests

- `tests/balance_tests.js` **suite 8** (new): `balance: the economy (sustain refit 3) — …`: `map.minShops ≥ 2`, a boss
  pays at least an elite's best and at most 80, regular-fight gold grows ≤ 3 per act (rolled: an act 3 fight pays act
  1's range), no act price inflation, Mystery Stew heals and says 35%, and 300 generated act maps: ≥ 95% have two shops
  (99%+ measured), all have one, at most one per row. Suites 1-2 (shape, casual < normal < brutal in every act and fight
  kind) pass with the new brutal row; the UI suite already checks that Settings' difficulty text follows DD.Balance.
- `tests/run_tests.js`: the loot-table suite reads the gold rows from `DD.Balance.gold` (it hard-coded DESIGN's 80-100
  and +6 per act); the reward-apply suite reads the Stew's fraction and checks its desc. Isolated: `suite=balance` 17
  suites ok, `suite=run: ` 31 suites / 1236 assertions ok.

### Requests

- **DOCS** (DESIGN §5, the gold line): "Gold: start 60. Normal fight 12–20, elite 35–50, boss 50–70 (no per-act
  growth). Prices: common item 40, rare 80, legendary 150, consumable 20–35, skill tome 60, scar removal 45, heal 30
  (the same in every act)." DESIGN §3 (acts): "two shops per act map (a few maps only have room for one), at most one
  per row". ARCHITECTURE §6.10 (line ~1203): "casual: enemy HP ×0.8, damage ×0.8 · normal: ×1 · brutal: HP ×1.15,
  damage ×1.05, +1 enemy per normal encounter (`DD.Balance.difficulty` / `extraEnemies`)".
- **ENGINE (blocking a green run)**: `tests/engine_tests.js:221-223` (`engine: damage pipeline`) hard-codes brutal's old
  row: read it from DD.Balance, e.g. `t.eq(foe().maxHp, Math.round(14 * DD.Balance.difficulty.brutal.hp), 'brutal enemy
  HP ×' + …)` (16 now) and `t.eq(DD.Act.damage(foe(), hero(), 5), Math.round(5 * DD.Balance.difficulty.brutal.dmg), …)`
  (5 now). Optional: `js/engine/combat.js:20` (`FALLBACK_DIFFICULTY`) and `js/engine/encounter.js:14-16` still carry
  the old row (×1.25 / ×1.2) as fallbacks for a build without DD.Balance; align them or drop the numbers.
- **NARRATIVE (blocking a green run)**: the loading tip `js/data/narrator.js:516` is false now; suggested: "Brutal:
  enemies get 15% more HP and 5% more damage, and normal fights bring an extra enemy." Its check in
  `tests/content/narrative.js:2040-2042` (`narrative: tips`, section 'difficulty') hard-codes the old row: match the new
  text and compare `C.DIFFICULTY.brutal` with DD.Balance's 1.15 / 1.05 (or build the regex from DD.Balance).
- **UI (optional)**: `js/ui/ui.js:61`, brutal's fallback desc (shown only without DD.Balance) still says 25% / 20%.
- **SIM / AUTOPLAY owner (optional)**: `tests/sim/sim.js`'s `pickNode` is greedy (next row only), so the sims
  under-visit shops; a route that keeps a reachable shop in view when the purse is full (`.tmp/bal3/econ.js`
  `shopRoute=`) measures the economy closer to how people play.
- **LEAD**: normal sits at the bottom of 30-40% (FIN 31%; 25-31% across this refit's 200-run batches; refit 2's pool
  27%): refit 2's open decision (the late-boss rows vs the campaign target) still stands; nothing here moved the bosses.
- **LEAD / hero owners (B6 flags)**: Ellaria 1.79× (FIN) / 2.30× (1000-run pool), D11: not trimmed (the spec's Healing
  Spring 5/6/8 → 4/5/7 needs the user's OK and the user said no); Josiah 1.61× / 1.78× (never gut Josiah); Zarathor 1.29×
  / 1.72× (a damage question); Slate 0.50× in FIN (15 of 98 runs) / 0.72× pooled — the lowest in both; his sustain
  barely shows in the sims (Stress Ball socketed in ~10% of his fights, Hold Still 0.9 a fight with HOLD_AI at its
  ceiling); Basanos 0.66× / 0.77×. Hjalmar (1.07× / 0.97×) and Buga (0.80× / 0.82×) are not below 0.6×.

### Known issues

- **Gold at the DM's start averages 181** (median 139; target ~150): ~28% of act 3 runs never pass a shop on AutoPlay's
  greedy route and carry 300+ into the DM. A shop-planning route lands ~100 (E6); see the bias section.
- **Casual parties end richer** (the DM's start: avg 232, median 201): they survive longer and need fewer shop heals;
  the target was set for normal.
- **Brutal is mostly an H-party mode**: H 22%, X 2.6% (BRU6, 400 runs; normal: 50 / 14). The act 1 healer gap compounds with the extra
  grunt; closing it is the heroes' sustain, not the difficulty row.
- Normal: X campaign 14% (the spec's ~20%+); the act 1 boss for X 54% (floor 55); act 2 elites 93% (75-85); the act 2
  bosses 82-84% and the DM 79% in FIN (refit 2's ranges 65-80 / 60-75; they swing ±7-9 between batches).
- Slate's run-win share is under 0.6× in the final batch (0.50×, n 98), 0.72× over 1000 runs.
- **Two full-run failures come from the new brutal row, in tests this role doesn't own** (`engine: damage pipeline`,
  `narrative: tips`): they hard-code brutal's old ×1.25 / ×1.2, and the tip they check now states the old numbers too.
  Fixes under Requests (ENGINE, NARRATIVE).

### Full run

Nov 14, 13:08 (`bash tools/test.sh`, the files with BRU6; `.tmp/bal3/r3_test_full2.txt`, 2 min): **999 suites, 122,941
assertions ok, 4 failures in 3 sections**. All of this refit's suites pass (balance suites 1-8, `run: rewards — loot
tables`, `run: rewards — apply`). The failures, none in this role's files:
- `engine: damage pipeline` (2): "brutal enemy HP x1.25 — expected 18, got 16", "brutal enemy damage x1.2 — expected
  6, got 5": `tests/engine_tests.js:221-223` hard-codes the old brutal row (Requests: ENGINE).
- `narrative: tips` (1): "brutal multipliers": `tests/content/narrative.js:2040-2042` hard-codes the old row, and the
  tip `js/data/narrator.js:516` says 25% / 20% (Requests: NARRATIVE).
- `hero_marwyn: AutoPlay battles, acts 2-3` (1): "many different skills used (6)", HERO-TRIO's known coin-flip bar.
No swallowed "Error in …" warnings (the warnings printed are the suites' own expected ones: synthetic junk encounters,
unknown ids). Compared with the 23:31 run on BRU5 (103 failures in 7 sections), BRU6 cleared the 4 encounter-count
sections (`mapgen` ×2, `enemies_act1`, `enemies_act2`). After the run only the difficulty comment in
`js/data/balance.js` changed (its measured rates); `suite=balance` re-run: 17 suites, 250 assertions ok.

---------------------------------------------------------------------------------------------------------------------

## Balance audit (INDEPENDENT AUDITOR, Nov 14: everything re-measured on fresh seeds)

Status: **done**. I trusted none of the passes' numbers and re-ran every target on seeds nobody had used (31000+,
33000+, 35000+, 37000+, 39000+, 41000+, 43000+, 45000+), one headless Chrome at a time. Harness: `.tmp/bal3/sim.sh`
(+ `split.js`, `econ.js`, unchanged) and a scratch copy `.tmp/audit/sim.sh` whose `audit.js` adds `with=<hero>` (that
hero replaces the 4th pick of every seed's own random party) and `nohold=1` (AutoPlay never wants Slate's Hold Still).
Per-composition tables come from `verbose=1` run lines (`.tmp/audit/comp.pl`, `.tmp/audit/heroes.pl`). Reports:
`.tmp/audit/runs/`.

### What landed (two fixes, one test suite)

1. **The Rat King: `DD.Balance.encounters.boss_rat_king = { hp: 0.9 }`** (on top of act 1's boss row: 122 HP instead
   of 135; his damage is unchanged). The averages hid it: over 1,130 act 1 boss fights on the files as refit 3 left
   them, parties without a starting healer won the Rat King **51.4% of 310** (a coin flip) and Grimble 55.9% of 264;
   with a healer 82% / 80%. His Swelling Ranks soft timer grows every round, so his long fights punish the parties that
   can't heal through them; a shorter fight is the lever. Paired test (act 1 only, the same 400 seeds 33000+,
   `bal=encounters.boss_rat_king.hp:0.9`): Rat King X 51% → 57%, H 76% → 83%; both act 1 bosses 66% → 69% (X 54 → 58,
   H 78 → 81); act 1 cleared 62% → 65%; Grimble identical. It does not close the healer gap (both sides gain ~6
   points); it moves the X side over its floor and evens out the two act 1 bosses (Grimble 69.6%, the Rat King 70.3%
   over 756 fights on the final files). Test: `tests/balance_tests.js` suite 9 (HP only, 0.8 ≤ hp < 1, no damage row,
   Grimble untouched, HP × damage ≥ 1, the difficulties stay ordered, a real Rat King fight starts at ×0.81 HP with 122
   HP). `bosses_act1` (its real-fight AutoPlay suites) and `mapgen` pass with it.
2. **The brutal loading tip told a lie**: `js/data/narrator.js` said "Brutal: enemies get 25% more HP and 20% more
   damage" since refit 3 moved the row to ×1.15 / ×1.05. Now "15% more HP and 5% more damage, and normal fights bring
   an extra enemy." (the Settings / party-select text is built from DD.Balance and was already right). Its check in
   `tests/content/narrative.js` hard-codes the old row (Requests: NARRATIVE).
3. `tests/balance_tests.js`: suite 9 (above); suite 5's comment no longer claims the healer gap closed to ~17 points
   (refit 1 measured 24; this audit 25-28).

Everything else was measured and left alone (reasons per target below). No hero, enemy or boss content number moved.

### Batches (normal unless stated; "the files" = with the Rat King row)

| id | query | result |
|---|---|---|
| N1 | refit 3's files, `seeds=400&from=31000`, `n_camp_31000.txt` | campaign **28.3%** (113/400, CI 24-33; X 12% / H 48%); act 1 cleared 64%, act 2 67%, act 3 66%; Grimble 65%, Rat King 71%, Lich 81%, Iris 84%, the DM 72%; 1 timeout (Hoarder's Lair) |
| A1 | refit 3's files, act 1 only, `seeds=400&from=33000&stop=1`, `a1_33000.txt` | act 1 cleared 62%; act 1 bosses 66% (X 54 / H 78; Rat King X 51%); regular fights won 98%, a down in 27% |
| CAS | refit 3's files, `seeds=200&from=35000&diff=casual`, `cas_35000.txt` | **casual 76%** (152/200, CI 70-81; X 63 / H 94); act 1 cleared 92%; act 1 bosses 92%, act 2 bosses 96%, the DM 90% |
| BRU | refit 3's files, `seeds=200&from=37000&diff=brutal`, `bru_37000.txt` | **brutal 11.5%** (23/200, CI 8-17; **X 1/109**, H 24%); act 1 cleared 43%; act 1 regular fights won 89% (a down in 48%); act 1 bosses 61% (X 44) |
| S0 | `with=slate`, `seeds=200&from=41000`, `s0_slate_41000.txt` | Slate in every party: **18.5%** (37/200; X 8%, H 39%); a party of the same healer mix with an average hero wins ~25% |
| S1 | S0 + `startskill=sla_stress_ball` | 16%: Stress Ball socketed from the start barely shows (Slate squeezes 0.3 times a fight, healing 1.3 HP a regular fight; the param also cost every other hero a socket, so 16% is pessimistic) |
| S2 | S0 + `nohold=1` | 13% (26/200): without his grabs Slate's parties do worse, so the grapple loop is net positive in the sims |
| RK | A1 + `bal=encounters.boss_rat_king.hp:0.9` (paired), `a1_rk90_33000.txt` | act 1 cleared 65%; act 1 bosses 69% (X 58 / H 81); Rat King 69% (X 57 / H 83) → **landed** |
| V | **the files**, `seeds=400&from=43000`, `v_camp_43000.txt` | campaign **32.8%** (131/400, CI 28-37; **X 19%** / H 49%); act 1 cleared 67%, act 2 69%, act 3 70%; act 1 bosses 71% (X 58 / H 84); Lich 74%, Iris 83%, the DM 78%; 2 boss timeouts (below) |
| VBRU | the files, `seeds=200&from=39000&diff=brutal`, `vbru_39000.txt` | brutal 8.5% (17/200, CI 5-13; X 3/126, H 19%); act 1 bosses 49% (X 38) |
| VCAS | the files, `seeds=200&from=45000&diff=casual`, `vcas_45000.txt` | casual **80.5%** (161/200, CI 74-85; X 67 / H 95); act 1 cleared 93%; act 1 bosses 93%, act 2 bosses 95%, the DM 95% (the row adds ~1 point; the rest is the 4-point seed spread) |

Pools below: act 1 on the files = RK + V (756 boss fights, 2,674 regular fights); acts 2-3 = N1 + V + refit 3's FIN
(1,200 runs; the Rat King row only changes who reaches them); campaign = V (400) and N1 + FIN (800, before the row).

### Every target (normal unless stated)

| target | measured | |
|---|---|---|
| act 1 bosses 60-70% | **70.0%** of 756 (Grimble 69.6%, Rat King 70.3%); before the row 67.0% of 1,130 | PASS (top edge) |
| act 1 bosses without a starting healer ≥ 55% | **58.0%** of 391 (Grimble 58.5, Rat King 57.0); before the row 53.3% of 574 (Rat King 51.4) | PASS (was MISS) |
| act 1 bosses with one ≤ ~80% | **82.5%** of 365 (before 81.3%) | MISS (soft cap, +2.5) |
| act 1 regular fights won 95%+ | 98.0% of 2,674 (X 97.0) | PASS |
| act 1 regular fights: party HP lost ~20-30% | 17-18% net, 27-28% gross | MISS net / PASS gross |
| act 1 regular fights: a down in ~25-40% | 27.0% (X 35.5 / H 17.5); the run's first fight 14.5%, the second 31.5% | PASS (first fight gentler) |
| act 2 regular fights: a down in ~50-60% | 48.0% of 2,461 (X 65 / H 38), won 96.0% | MISS (2 under) |
| act 2 elites won 75-85% | 91.7% of 371 (X 82.1 / H 96.4) | MISS (over) |
| act 2 bosses 65-80% | Lich-tenstein 79.0% of 328, Dr. Iris 83.7% of 331 | Lich PASS (edge), Iris MISS (+4) |
| the DM 60-75%, the hardest | 76.7% of 480 (X 65.0 / H 80.9): the lowest of the three late bosses, but the act 1 bosses (70%) are lower | MISS (+1.7); hardest of the late bosses only |
| campaign normal 30-40% | **32.8%** (131/400, V); before the row 29.6% of 800 (N1 28.3, FIN 31.0) | PASS (was MISS) |
| campaign casual 65-80% | 80.5% on the files (VCAS, 200, CI 74-85), 76.0% before the row (CAS); all 700 casual runs since refit 3: 76.6% | PASS (pooled; the files' own batch at the top edge) |
| campaign brutal 5-15% | 11.5% (BRU) and 8.5% (VBRU, the files); pooled with refit 3's 400: **10.5% of 800**; X 2.2% (10/464) | PASS (an H-party mode) |
| heroes 0.6-1.5× the median | 1,200 normal runs (median 26.6%): Ellaria 2.06×, Josiah 1.81×, **Zarathor 1.72×**, … Sparrow 0.81×, **Slate 0.54×** | MISS (flags below) |
| unspent gold under ~150 | gold at the DM's start median 136 / avg 187 (V); end of run: all 179, lost 132, won 276 (median 229, the DM's 50-70 payout included) | median PASS, mean MISS |
| shops worth a visit | 1.7 visits a run, 1-2% of visits buy nothing, ~160-170 spent per act 2-3 visit | PASS |
| no generic party heal (D9) | none: the kit is the Bucket only; no item, Blessing, consumable or event heal was added; Mystery Stew 35% (an opt-in reward, raised by refit 3 under the spec's B5) is the one generic heal number that moved | PASS (Stew flagged) |

### What the averages hide

- **The healer gap is in every target.** Parties with Ellaria or Josiah overshoot every fight kind and parties without
  undershoot it: act 1 bosses 82.5 / 58.0, act 2 elites 96 / 82, act 2 regular fights won 98 / 92 (a down in 38 /
  65%), the DM 81 / 65, campaign 49 / 19 (V). Every row moves both sides about equally (refit 1 and this audit's Rat
  King test), so the act 1 cap (H ≤ ~80) and floor (X ≥ 55) can't both hold with a row; the X floor was put first (the
  user's "first boss pretty much unbeatable" was about these parties).
- **The targets conflict at the campaign level** (refit 2's open lead decision, re-measured): with act 1 cleared ~67%
  and acts 2-3 cleared ~70% each, the campaign lands at ~33%; putting Iris, the DM and the act 2 elites inside their
  ranges (a few points harder each) would take it back under 30%. Left for the lead; nothing here moved acts 2-3.
- **Brutal is a mode for parties with a healer**: 2.2% of 464 healer-less runs won across the three brutal batches
  (H ~22%). Pre-existing (refit 3: 2.6%); the act 1 healer gap compounds with the extra grunt.
- **Slate is the weakest hero by far, and his sustain isn't why**: 0.54× over 1,200 runs (0.43× over N1 + FIN, 0.62×
  in V), fine in act 1 (0.94× of act 1 clears in A1) and weak in acts 2-3. With him in every party (S0) the campaign
  is 18.5% against ~25% for an average hero in the same healer mix. Socketing Stress Ball from the start (S1) changes
  nothing (0.3 squeezes a fight), and taking his grabs away (S2) makes it worse (13%). His limiter is tempo and output
  (move 3, init −2, melee: Love Tap 2.1 uses a fight against 4+ for the ranged basics; 31-35 damage a fight against
  ~40-70 for the top heroes). A kit question for the Slate owner and a human playtest, not a number for this audit to
  guess (Requests).
- **Zarathor carries healer-less parties**: 1.72× overall, 2.2× within parties without a healer (V: 37.9% of 66 X runs
  won, X median 17.4%); 64-69 damage a fight, the most in the game. A trim would cost the campaign and the X parties
  most; flagged, not changed (Requests).
- **Fights at the round cap** (counted as wins by the sim): 3 in ~11,600 normal fights. The Hoarder's Lair (an elite
  stall, N1); the Rat King, seed 43220 (V): Syllamin, the last hero standing at 3 HP, Helps Mayor Buga up every round,
  and the King downs Buga again every round instead of downing Syllamin (Swelling Ranks 28, 28 downs, 31 rounds); the
  DM, seed 43358. All three are AI loops, not tuning (Requests: BOSSES-ACT1, ENGINE).
- **Lich-tenstein is down-heavy**: 3.5-3.8 downs a fight (X 4.0-4.2); his Overdue Notice is 9% of all hero downs and
  30% of those hit a hero at 60%+ HP (refit 2's known issue; the fee cap is the lever if people find it bursty).
- **Act 3 elites are trivial**: won 97%, 9-13% HP lost (the Hoarder's Lair 100%, 4-7%). No target covers them;
  flagged.
- **Act 1 regular fights**: the Union Meeting (92% won, a down in 67%) and the Open Mic (95%, 56%) carry most of the
  act 1 regular-fight losses and downs; the openers (Slime Time, Rats in the Cellar, Big Flush) cost 5-12% HP and
  almost no downs.

### Degenerate-strategy and text checks

- **No sustain loop makes a hero unkillable.** Basanos: Transform 2.7 a regular fight / 3.8 a boss fight, self-heal
  5.4 / 8.2 (V); wearing the Flea Collar 10.0 / 13.7 (71 / 29 fights: at refit 1's ~10 cap), and he still has one of
  the highest down rates (0.41 a fight). Slate: Hold Still III with cooldown 2 can re-grab one liftable foe before the
  hold ends (never a boss: immovable), but his own heal is 0.6-1.0 HP a fight. Sparrow: Juice Box 0.9-1.0 a fight,
  5.3 / 8.7 HP. Marwyn 3.1 / 6.9 HP. Hjalmar with Canned Laughter 4.2 HP a regular fight (worn 8%).
- **The healers stay the top healers of others**: Josiah 12.4 / 18.0, Ellaria 11.2 / 11.9 HP to others a fight; next
  Marbles 1.2 / 1.5 and Sparrow 1.1 / 1.4.
- **desc == execute** for every number the passes changed: Juice Box's "within 3" reads its constant, Transform's mend
  reads `L.mend` (2 / 3 / 4), the Mystery Stew's "35%" and Settings' difficulty texts read DD.Balance; the brutal tip
  was the one lie (fixed). The Rat King row has no text: his HP bar shows the scaled HP; DESIGN quotes his content 150
  HP like every other boss (the rows are DESIGN §5's).
- The Bucket of Ice Water was splashed in 391 of 400 runs (V); the First-Aid Fanny Pack (loot) is worn in 8% of fights.

### How the AutoPlay bias is accounted for

- **Bosses**: AutoPlay dodges most wind-ups and solves the puzzles from exact hints, so its boss win rates are
  ceilings; the late bosses sit 2-4 points over their ranges in the sims and were left there (a human loses more of
  them), and the Rat King row was sized on a paired test, not on its absolute rate.
- **The party**: AutoPlay rarely fires signatures (0.02-0.18 a fight) or setup skills and learns the first offered pool
  skill (Stress Ball sits in ~7% of Slate's fights). S1 measured what picking his sustain skill buys Slate in AutoPlay's
  hands: little. A human who grabs, drags and throws on purpose may play him much better; that is the playtest's call.
- **Economy**: AutoPlay's greedy route under-visits shops (refit 3's E6: a shop-planning route cuts the hoard at the DM
  by ~44%), so the mean hoard (187) overstates and the median (136) is the figure to trust.
- **Noise**: decisions use 400-run batches and pools of 750-1,200 fights; single 200-run batches of the same files
  spread 8-12 points on brutal and ±4 on a boss.

### Tests

- `tests/balance_tests.js` suite 9 (new): the Rat King's row. Isolated `suite=balance`: 18 suites, 260 assertions ok.
- `suite=bosses_act1,mapgen,narrative: tips`: all pass except `narrative: tips` (3 checks: the old brutal row, below).

### Requests

- **NARRATIVE (blocking a green run)**: `tests/content/narrative.js` ~2040-2042 (`narrative: tips`, section
  'difficulty'): the tip is true now; replace the check with
  `tip(/^Brutal: enemies get 15% more HP and 5% more damage, and normal fights bring an extra enemy/);` and
  `t.ok(D && D.brutal.hp === 1.15 && D.brutal.dmg === 1.05, 'brutal multipliers');` (or build both from DD.Balance).
- **ENGINE (blocking a green run; refit 3's request, still open)**: `tests/engine_tests.js` 221-223 (`engine: damage
  pipeline`): brutal HP / damage from `DD.Balance.difficulty.brutal` (16 and 5 now, not 18 and 6).
- **DOCS**: DESIGN §5 (the rows line): "the Rat King ×0.9 HP on top of act 1's boss row (`DD.Balance.encounters`)".
  ARCHITECTURE §6.10 still gives brutal as ×1.25 / ×1.2 (refit 3's request).
- **HERO-SLATE (+ lead, playtest)**: Slate is the weakest hero (0.54× over 1,200 runs; S0-S2 above): act 1 fine, acts
  2-3 weak; not his sustain, not his grabs. Candidate levers for the owner, one at a time with a `with=slate` batch
  (`.tmp/audit/sim.sh "seeds=200&from=41000&with=slate&verbose=1"`, baseline 18.5%): move 3 → 4 (tempo), Love Tap
  5 → 6, or Stress Ball among his starters (the user's "a skill for healing while grappling" is then always his, not a
  pool pick). Each touches DESIGN §6 and hero_slate's tests.
- **LEAD (flags, unchanged)**: Ellaria 2.06× (D11: untouched), Josiah 1.81× (never gutted), Zarathor 1.72× (2.2× among
  healer-less parties; a damage question). The late bosses 2-4 over their ranges vs the campaign target (refit 2's
  decision): the files now give a 33% campaign with the act 2 bosses at 79 / 84 and the DM at 77.
- **BOSSES-ACT1**: the Rat King's targeting with one hero left standing: he downs the hero who was just helped up again
  every round (instead of the last one standing), which loops until the round cap (seed 43220, `tools/sim.sh
  "seeds=1&from=43220&dump=1"`). Prefer the knockout that ends the fight.
- **ENGINE / AUTOPLAY (optional)**: the same loop from the hero side: a lone hero at 3 HP spends every turn on Help Up.
  The Slate request from the sustain build (AI.reachOf / danger for a Grappled foe) still stands; S2 shows the grabs
  are net positive anyway.
- **BALANCE (later, optional)**: Mystery Stew 0.35 is the only generic heal number that moved since D9 (refit 3, the
  spec's B5 lever; its effect is below batch resolution). If the user reads D9 strictly, 0.3 is the safe revert.

### Known issues (left to the lead or a human playtest)

- Act 1 bosses with a starting healer 82.5% (cap ~80); the overall act 1 boss rate sits at the top of 60-70%.
- Act 2 elites 92% (75-85), act 2 regular fights a down in 48% (50-60), Dr. Iris 84% (65-80), the DM 77% (60-75):
  the conflict with the campaign target above.
- Act 1 regular fights lose 17-18% of the party's HP net (27-28% gross) against ~20-30%.
- Slate 0.54× (under 0.6×); Ellaria, Josiah and Zarathor over 1.5×.
- Brutal: healer-less parties win ~2%.
- Gold: the mean hoard at the DM's start is 187 (median 136); won runs end with 276 (the DM's payout included).
- Three AI loops at the round cap in ~11,600 fights (the Hoarder's Lair, the Rat King's Help-Up loop, the DM).

### Full run

Nov 14, 14:46-14:48 (`bash tools/test.sh`, the files with the Rat King row and the fixed tip; `.tmp/audit/test_full.txt`):
**1000 suites, 122,949 assertions ok, 6 failures in 3 sections**, all in test files this role doesn't own, all known:
- `engine: damage pipeline` (2): `tests/engine_tests.js` 221-223 hard-code brutal ×1.25 / ×1.2 (refit 3's row; Requests:
  ENGINE).
- `narrative: tips` (3): `tests/content/narrative.js` ~2040-2042 hard-code the old brutal row and the old (false) tip
  text, so the corrected tip is reported unmatched and unchecked (Requests: NARRATIVE; 1 failure before the fix).
- `hero_marwyn: AutoPlay battles, acts 2-3` (1): "many different skills used (6)", HERO-TRIO's known coin-flip bar.
All balance suites (1-9), `bosses_act1`, `mapgen`, `run` and every other hero suite pass (after the run only the Rat King row's comment in `js/data/balance.js` was reworded). No swallowed "Error in …" warnings:
the `warnings:` lines are the suites' deliberate ones (junk encounters, unknown ids, the peb_bbq advisory).


---------------------------------------------------------------------------------------------------------------------

## Finish (Nov 14) — FIX: CONTENT, TEXTS AND NUMBERS (the last run before release)

Four playtest findings moved numbers (FF-1, FF-4, FF-5, audit-8); each was re-measured, one Chrome at a time. Two
harnesses (reports in `.tmp/wf14/content/`):
- **Boss harness** `.tmp/wf14/content/h/run.sh boss.html "enc=<id>&n=&from=&level="` (a copy of the wf12 bosses-objectives
  page): n real boss fights, random 4-hero parties at a level with skills and Blessings rolled, AutoPlay on both sides;
  win rate, rounds, downs, and the boss's hits on heroes per skill (count, average, max, hits ≥ 75% of max HP, downs of
  a hero at 90%+ HP = one-shots). `nobj=lich|iris|dm&nmod={…}` overrides a boss's `N`, `bal=` DD.Balance. Its absolute
  rates are lower than the campaign's (no items, fresh HP but no consumables): use it paired (same seeds), not alone.
- **Campaign** `tools/sim.sh` and the audit's `with=<hero>` copy `.tmp/wf14/content/sim/sim.sh` (+ `patch.js`: `smov=`,
  `stap=`, `sstart=` Slate levers for the page only).

### FF-1: Lich-tenstein's Late Fees stop at 12 (landed)

Uncapped, the fees ran to +35-60 once the phylacteries were shredded (AutoPlay shreds them by round 2-3: the only reset
is spent early), and every Overdue Notice (unblockable, any range, the nearest hero) downed full-HP heroes.

| Lich, level 4, seeds 1000+ (200) | won | rounds | downs/fight | notices on a 90%+ HP hero → downed |
|---|---|---|---|---|
| base (uncapped, +4 / +5, ×1.25 HP) | 61% | 11.7 | 5.31 | 570 → 95 |
| cap 12 | 71% | 11.9 | 4.67 | 566 → 3 |
| cap 16 | 65% | 11.6 | 4.73 | 577 → 26 |
| cap 12, ×1.45 HP | 55% | 13.9 | 6.69 | 593 → 7 |
| cap 12, +6 / +7 a turn | 67% | 11.9 | 4.83 | 578 → 5 |
| cap 12, +6 / +7, ×1.32 HP | 61% | 12.7 | 5.61 | 573 → 4 |
| cap 14, ×1.3 HP | 62% | 12.4 | 5.31 | 579 → 15 |
| cap 12, +6 / +7, ×1.65 damage | 70% | 12.1 | 5.27 | 569 → 15 |
| **seeds 3000+ (300): base** | 60% | 12.0 | 5.48 | 922 → 143 |
| **seeds 3000+ (300): landed (cap 12, +6 / +7, ×1.3 HP)** | 66% | 12.5 | 5.25 | 918 → 11 |
| level 3, seeds 5000+ (300): base | 49% | 11.9 | 6.17 | 866 → 179 |
| level 3, seeds 5000+ (300): landed | 46% | 12.5 | 6.36 | 873 → 50 |

Landed: `N.feeCap` 12, `feeRate` 4 → 6, `feeRate2` 5 → 7 (lich.js; the clock fills in two of his turns), his row
`encounters.boss_lichtenstein` hp 1.25 → **1.3** (dmg 1.5 unchanged). Pooled over 800 paired fights the Lich is as hard
as before (level 4: 60.4% → 63.8%; level 3: 49% → 46%) and the notice one-shots fall from 417 to 65; the max notice is
18 + 12 = 30 at normal. Damage barely moves him (AutoPlay heals and dodges); HP lengthens the fight.

### FF-4: Dr. Iris closes at round 10 (landed)

| Iris, level 4 | won | rounds | past 12 rounds |
|---|---|---|---|
| seeds 1000+ (200): base (closing 14, ×1.2 HP) | 61% | 14.0 | 131 |
| ×1.0 HP | 78% | 11.7 | 91 |
| ×1.0 HP, ×1.65 damage | 75% | 12.2 | 97 |
| closing 11, ×1.05 HP | 68% | 11.4 | 82 |
| closing 10, ×1.1 HP | 63% | 11.5 | 71 |
| closing 11, ×1.12 HP | 63% | 12.0 | 100 |
| **seeds 3000+ (300): base** | 65% | 13.4 | 183 |
| **seeds 3000+ (300): landed (closing 10, ×1.1 HP)** | 66% | 11.1 | 100 |

Her win rate follows her HP (her damage barely matters: AutoPlay dodges), so less HP alone made her much easier. An
earlier closing time (from round 10 nothing hides you and her gaze grows +2 a round) puts the squeeze back: landed
`N.closing` 14 → 10 (beholder.js) and `encounters.boss_dr_iris` hp 1.2 → **1.1**. 500 paired fights: won 63% → 65%,
13.6 → 11.3 rounds, past 12 rounds 63% → 34%.

### FF-5: the DM's mercy (landed, no number moved)

His roll is 20 × 1.6 = 32. A whole-fight rule "Fudged in Your Favour" (dm.js, `modifyFinalDamage`): a Fudged Roll / Roll
Behind the Screen never takes a hero with 75%+ of their HP straight to 0 (at worst 1 HP). DM, level 5, seeds 1000+
(200): won 40% → 40%, downs a fight 4.01 → 3.92, rolls downing a hero at 90%+ HP 6 → 0. (At exactly full HP it never
fired in 200 fights, so the threshold is 75%.)

### FF-2: no round-cap loops

Ultra Instinct's `estimateTaken` (passives.js). Seeds 43220 / 43358 no longer reproduce on the current build. Rat King
(level 2, 200 fights) and DM (level 5, 200): 0 at the round cap; the campaign below: 0 timeouts in 3,114 fights (the
audit: 3 in ~11,600).

### audit-8: Slate move 3 → 4 (landed)

Same 200 seeds (47000+), Slate in every party (the audit's `with=slate`), the current files:

| | runs won | act 1 cleared | Slate's damage a fight |
|---|---|---|---|
| baseline (move 3, Love Tap 5) | 23.5% (47) | 57% | 33.2 |
| Love Tap 5 → 6 | 23.5% (47) | 58% | 35.1 |
| **move 3 → 4 (landed)** | 28.5% (57) | 64% | 38.5 |

Tempo was the limiter (the audit's diagnosis); his damage per hit was not. Love Tap was rejected.

### The normal campaign with everything landed (`tools/sim.sh "seeds=300&from=49000&diff=normal&verbose=1"`)

- **Campaign: 37.0% (111 of 300, 95% CI 32-43)**, inside 30-40% (the audit: 32.8% of 400; batches of the same files
  spread 28-33%). Act 1 cleared 70%, act 2 73%, act 3 73%. Timeouts 0.
- Bosses: Grimble 71% (159), Rat King 73% (132): act 1 bosses 71.8% (target 60-70: top edge +2); Lich-tenstein 87% (89,
  10.6 rounds), Dr. Iris 84% (91, **10 rounds**, was ~12), the DM 79% (140, 9.7 rounds). The paired harness says the Lich
  and Iris changes left their difficulty where it was; the late-boss rates in this batch are the audit's (79 / 84 / 77)
  plus the build's other changes this run (AutoPlay's audit-3 / FF-3 work) and batch noise (n ≈ 90). Flagged, not tuned.
- Regular fights won 98% (act 1 99%, act 2 96%, act 3 97%); a down in 38% (act 1 29%, act 2 46%); party HP lost 18% net.
- Downs by cause: the Overdue Notice 7% of all hero downs (the audit: 9%), the Fudged Roll 6%.
- **Hero shares** (median 33.5%): Ellaria 1.85×, Josiah 1.73×, Syllamin 1.46×, Zarathor 1.28×, Kiri 1.16×, Marbles 1.13×,
  Sparrow 1.04×, Corelos 1.01×, Betty 0.99×, Pebbles 0.99×, Valdris 0.96×, Basanos 0.90×, Marwyn 0.87×, **Slate 0.78×**
  (was 0.54× over the audit's 1,200 runs), Buga 0.75×, Hjalmar 0.69×. Nobody under 0.6×; Ellaria (D11) and Josiah over
  1.5× as before (n 68-90 a hero: ±0.15×).

### Tests

`bosses_act2: lich late fees` (the cap, its text, a capped notice), `boss_dm: finish — his mercy …` and `… his own numbers
in texts …`, `hero_slate: finish — move 4 …`, `passive-table` (Ultra Instinct's estimate before / after the first hit),
`balance:` suites 1-9 unchanged and passing (the Lich row still leans on damage: ×1.5 ≥ ×1.3; Iris ×1.45 ≥ ×1.1; the DM's
row still the biggest).

### Known issues

- Casual and brutal were not re-measured with these changes (the refits' 74-80% / 8-13%); the Lich / Iris / DM changes
  were sized to hold their difficulty, so the order should hold.
- Act 1 bosses 71.8% and the late bosses 79-87% in this one batch, the campaign at 37%: top of the ranges (refit 2's
  open lead decision: bosses vs the campaign target).
- The DM's mercy keys on 75% of max HP; a hero hit twice in one turn (phase 3 rolls two dice, at two different heroes)
  can't be saved twice, by design.

### Requests

- DOCS: DESIGN §5 rows (the docs test reads them live): Lich-tenstein ×1.3 HP / ×1.5 damage, Dr. Iris ×1.1 HP / ×1.45
  damage (both already in DESIGN by the docs owner when this ran); "uncapped Late Fees" (§5 ~line 298, the Lich section
  ~line 762) → "Late Fees +6 a turn (+7 below half HP), up to 12"; the DM's mercy rule in his section; Slate move 4 (§6).

### Review (finish) — REVIEWER, Nov 14 (no number moved)

The review's behaviour changes are AutoPlay-side only (the Bone Pile hint answers flyers for a break, D5; Slate's
Grappled answers `heldThrough`, audit-7); no balance number moved. Measured on the files with everything landed:

**Normal campaign, fresh seeds** (`tools/sim.sh "seeds=200&from=53000&diff=normal&verbose=1"`,
`.tmp/wf14/rev/sim_n200_53000.txt`, 9:49):

| | audit V (400, 43000+) | content FIN (300, 49000+) | review (200, 53000+) |
|---|---|---|---|
| campaign | 32.8% (CI 28-37) | 37.0% (CI 32-43) | **33.0%** (66/200, CI 27-40; 1 stalled run left out) |
| act 1 / 2 / 3 cleared | 67 / 69 / 70% | 70 / 73 / 73% | 72 / 65 / 71% |
| Grimble · Rat King | 70% · 72% | 71% · 73% | 76% (69/91) · 78% (75/96) |
| Lich-tenstein · Dr. Iris · the DM | 74% · 83% · 78% | 87% · 84% · 79% | 72% (39/54) · 77% (55/71) · 80% (66/82) |
| regular fights won · a down in | 98% · 37% | 98% · 38% | 97% · 37% (act 1 29%, act 2 47%, act 3 41%) |
| party HP lost (regular, net / gross) | 18% / 34% | 18% / 34% | 18% / 35% |
| round-cap stalls | 2 in 3,951 fights | 0 in 3,114 | 1 in 2,057 |
| hero shares (median) | Ellaria 2.06×, Slate 0.54× (1,200 runs) | Ellaria 1.85×, Josiah 1.73×, Hjalmar 0.69× | Ellaria 1.76×, Josiah 1.76×, Syllamin 1.59×, Zarathor 1.52×; Basanos 0.66×, Marbles 0.66×, Sparrow 0.72×, Slate 1.0× (median 29%, n 42-61 a hero) |

The campaign sits where the audit put it (33%). The late bosses moved back from the content batch's top-of-range
reading (Lich 87 → 72%, n 54-89: noise). The one stall (seed 53057, the DM) is no loop: Betty alone at 2 HP kept citing
Handbooks and healing while the DM went 540 → 64 HP (38 and 69 in round 30 alone); a long solo grind cut by the round
cap, like the audit's DM timeout. **Act 1 bosses read 77% (144/187)** against the 60-70% target, the one number above the
earlier batches (audit 70% of 756, content 71.8% of 291): checked with the paired act-1 batch below.

**Paired act-1 check** (`tools/sim.sh "seeds=400&from=33000&stop=1&verbose=1"`, `.tmp/wf14/rev/a1_33000.txt`; the same 400 runs
fix:engine measured, `.tmp/wf14/eng/sim/a1_33000.txt`, and the audit's RK batch before it):

| | audit RK | fix:engine | review (everything landed) |
|---|---|---|---|
| act 1 cleared | 65% | 66% | 67% (266) |
| Grimble · Rat King | 69% · 69% | 68% · 71% | 69% (132/191) · 71% (134/189) |
| act 1 bosses without / with a starting healer | 58% / 81% | 58% / 81% | 57.5% / 82.9% |
| regular fights: won · a down in · HP lost net (gross) | 98% · 27% · 17% (27%) | 98% · 28% · 17% (28%) | 98% · 27% · 16% (27%) |
| round-cap timeouts | 0 | 0 | 0 |

On the same seeds act 1 is where the audit left it (act 1 bosses 70.0% of 380): the 77% of the fresh batch is its party
mix and seed spread (z ≈ 2 against the audit's pool, 1.3 against the content batch), not a drift. Slate's parties: 67%
of 100 act 1 boss fights here, 76% in the fresh batch: move 4 doesn't explain it either way.

**Determinism**: the same 8 runs twice (`seeds=8&from=53600&verbose=1`, 83 fights): identical reports.
**Seeds**: 43220 (audit-3) and 80183 (FF-3) on the current files: no round cap (80183's Web of Lies: 12 and 8 rounds).
**Not re-measured** (the PC load stays light: one Chrome at a time, ~20 minutes of sims in this review): casual and
brutal with this run's changes (the refits' 74-80% / 8-13%), and acts 2-3 on paired seeds. Ellaria and Josiah stay over
1.5× the median (D11: reported, not trimmed).

---------------------------------------------------------------------------------------------------------------------

## Release gate (Nov 14) — the final measurement (no number moved)

Stock `tools/sim.sh` on fresh seeds, the shipped files (everything in "Finish (Nov 14)" landed), one headless Chrome at a
time; reports `.tmp/wf12/gate/sim_{normal_9000,act1_9300,casual_9000,brutal_9000}.txt`. 6,865 fights: 0 errors, 0
round-cap stalls, 0 `DD.warn` lines. The full target table (audit vs gate, PASS / MISS) is in `docs/notes/v2-digest.md`
§3.0; in short:

| | the audit | release gate |
|---|---|---|
| normal campaign (`seeds=300&from=9000`) | 32.8% | **30.7%** (92/300, CI 26-36; X 12.8% / H 50.0%) |
| casual (`seeds=120&from=9000&diff=casual`) | 80.5% | **83.3%** (100/120, CI 76-89) |
| brutal (`seeds=120&from=9000&diff=brutal`) | 10.5% (800) | **13.3%** (16/120, CI 8-21) |
| act 1 bosses (N + `seeds=300&from=9300&stop=1`) | 70.0% (X 58 / H 82.5) | **73.2%** of 549 (X 62.1 / H 82.8; Grimble 70.0, Rat King 76.6) |
| Lich-tenstein · Dr. Iris · the DM | 79.0 · 83.7 · 76.7% | 84.5% (84) · 82.6% (86) · 71.9% (128) |
| regular fights: act 1 won · a down in · HP lost | 98% · 27% · 17% (27%) | 97% · 29% · 18% (29%) |
| act 2 regular fights a down in · act 2 elites won | 48% · 91.7% | 46% · 93% |
| hero shares (median) | Ellaria 2.06× … Slate 0.54× | Ellaria 2.22×, Syllamin 1.63×, Josiah 1.59×, Zarathor 1.52× … Hjalmar 0.74×, Slate 0.67× |

No gap reaches 2σ against the audit's batches. The act 1 bosses crossed the 70% edge: all four fresh post-finish batches
read 71-77% (pooled 73.5% of 1,027, z 1.6 against the audit's 756), while the review's paired batch on the audit's seeds
reads 70.0% (audit 69%): seed spread plus at most a point or two from the finish run's AutoPlay fixes and Slate's move 4
(healer-less parties 58 → 62%). Flagged for the lead and the playtest, not tuned (AutoPlay's boss rates are ceilings).
