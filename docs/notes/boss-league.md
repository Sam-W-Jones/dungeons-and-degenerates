# C2 — THE LLLLLLLLLLEEEEEEEEEEEAAAAAAAAAAAAGUUUUUUUUUUUUUEEEEEEEEE OF VILLAINY (act IV, door 2)

Owner: C2 (V3 build, plan `.tmp/v3/design.md` §3.2, §5.3, §5.4, §6.2, §8.4 Content; the user's names of Nov 6).
Files: `js/data/bosses/league.js`, `tests/content/boss_league.js`, this file.

## What landed
- **Encounter `boss_league`** — `act: 4`, `kind: 'boss'`, `weight: 0`, `gauntlet: { lane: 'league', order: 2, hint: 'Five of them:
  control and area damage.' }`, `name` = the user's full 72-character name, `shortName` "The League of Villainy", `icon` 🦹,
  `banner: false`, `cameo: { start: 'svam_cameo_league', cheat: 'svam_nepotism', interjections: true, frames: [13 stretch frames] }`,
  `objective: { type: 'boss', bossIds: [the five], bossId: 'lg_kelek', squadName: <level 3>, flavor: 'Break the bodies, or the
  cleric prays them back up.' }`, `reward: { goldMult: 0.9, itemRarity: 'rare' }` (lead patch P5). Theme `a4_lair` (MAPGEN).
- **The Clubhouse** (15 × 13, plan §3.2's layout): the War Room dais (h1, white marble), the Villain Podium (h2, tag `podium`,
  terrain `lg_podium`), the wall with the 1-wide side door and the 3-wide carpet stair, the hall in black marble (`lg_marble`)
  with a purple runway (`lg_carpet`), the Evil Conference Table (`lg_table`, 10 tiles, blocks movement not sight), four
  pillars, three Evil Powder Kegs (`barrel_explosive` labelled), the Shark Tank (`lg_shark_tank`, deep water, 12 tiles) and the
  Trapdoor Lever (`lg_lever`). Spawns: Warduke (5,3), Zarak (9,3), Kelek (7,1, on the podium), Skylla (3,2), Zargash (7,2).
- **The five** (act 4 elites, tag `league`, no `boss` field, `pronoun` set; HP 53 / 84 / 57 / 62 / 66 = 322):
  - **Kelek** (wizard, he; init +1, move 3) — Evil Missiles (4 to each of up to 3 foes within 6, no line of sight; the weakest
    first), the Unspeakable Fireball wind-up (16 fire in radius 2 around a tile within 7 in his sight, League included; cd 2;
    centred where heroes × 2 − League is highest with 2+ heroes), Meat Shield (status `lg_meat_shield`: `takenMult` 0.5 while
    Warduke stands next to him). The frontman.
  - **Warduke** (barbarian slot, he; init 0, move 4, armor 1) — Skull Splitter (11; his attack of opportunity), Hero Punt (3 tiles;
    7 to it and what it hits on a crash; cd 2), Bodyguard (+6 target value for a hero next to Kelek, Skylla or Zargash; punts
    priced by the landing: the tank, a crash into a hero, a pending fireball), Unreasonable below half HP (status
    `lg_unreasonable`: immovable, +3 on his skill hits, `telegraphFlat` 3, +3 on o.flat for his attacks of opportunity; healed
    above half he is reasonable again).
  - **Skylla** (warlock, she; init +2) — Eldritch Blah (8 + pull 2 toward her; the AI likes a pull that ends next to a brute),
    Hex of Mild Inconvenience (Vulnerable 2 turns; cd 2; on a hero next to Warduke or Zarak), Expendable Friends (`preventDeath`:
    once a fight the nearest other member dies instead, ties lowest HP then the frontman order; she is left at 1 HP; the kill
    credits the striker).
  - **Zarak** (orc rogue everyone calls a dwarf, he; init +3, immovable) — Shin Splitter (8 + Bleed 2; his attack of
    opportunity), Tunnel Ambush (10 + Slowed, pops up next to a foe within 6, no line of sight, a dash; cd 3; `fromStand`; used
    when nobody is next to him), Sneak Attack (Audible): +4 next to another League member (the hit, the skill `telegraphFlat`, the
    attack of opportunity's o.flat).
  - **Zargash** (cleric of Orcus, he; init −1, move 3, armor 2) — Smite of Disapproval (8), Unholy Water (Tap) (heal 12 on another
    member within 5, cd 1), Spiteful Revival (wind-up on a body within 4: the member gets back up with half its max HP; 2
    charges; a stun, a silence, his death or a broken body stops it).
- **Shared**: Villain Hype (rule `lg_hype`, chip name live "🎤 Villain Hype N/100": +10 at each round end, +20 per hero downed,
  +10 per member that falls; at 100 the frontman — Kelek → Warduke → Skylla → Zargash → Zarak, the first standing — winds up The
  Theme Song at the start of his or her turn instead of any other wind-up, and the meter resets). **The Theme Song**: the marked
  tiles are every tile within 3 of a singer when it starts; at the landing each foe on them takes 5 psychic per singing member
  (podium ×2; stunned / asleep / frozen / charmed / sheeped members don't sing); one voice is the skill's number, the rest ride on
  `d.flat` and the skill's `telegraphFlat`, so the badge is the hit. **Too Evil to Drown** (`preventDeath` on `cause: 'fall'`: HP
  − 20, never below 1, Bleed 3, the engine climbs it out). **Bodies** (`lg_body`, 10 HP, `targetable: true`, blocks movement not
  sight; AutoPlay hint 12, 30 with a raise pending on it, 0 once Zargash can't raise). **The Trapdoor Lever** (1 AP: everyone not
  flying on the podium drops into the nearest tank tile and the engine's fall runs — heroes 25% + Wet, members Too Evil to Drown
  — then they climb out at the tank's edge; it resets at the end of the third round after; AutoPlay hint 25 per villain − 15 per
  hero on the podium). **Union Rules** (a stun guard per member) exists as `DD.League.N.unionRules`, off.
- **Voice** (all new for the user's characters; ≤ 70 per bubble, stretched words ≤ 22 letters): spawn / attack / hurt / death /
  song / raised / drowned / last / mourn_<member> per member, plus fireball, punt, unreasonable, expendable, tunnel, heal, raise;
  named lines (`def.named` = [heroId, line]; picked by hero id so a hero whose file has not landed is never named — the engine's
  party filter only knows registered heroes) incl. Zarak's "A snail! At least nobody calls YOU a dwarf, Benedick!"; ten banter
  scripts (round starts from round 2, 30%, at most every other round, 550 ms apart, logged); the roll call at round 1 (spawn or a
  named line); Kelek's intro log line with the full word. Narration keys `league_tip` (the demoted DM whispering, round 1),
  `league_rollcall`, `league_song`, `league_trapdoor`, `league_death`. The dwarf gag: Zarak insists on "orc" in 16 lines; the
  others call him the dwarf (banter, mourning); his codex says Svammiel does too.
- **Art** (humanoid specs + overlays, rotation-safe billboards): every member wears the acid-green League sash with an "L" badge.
  Kelek slim wizard with a waxed mustache and a "MINE" tag on his staff; Warduke huge, a faceless dread-helm faceplate with
  red eye slits and bat-wing fins; Skylla in sunglasses with a tiny chicken-legged hut (the Baba Yaga pact) bobbing at her
  shoulder; Zarak stocky (0.95), horned helm with a brass bell, a huge braided beard with lockpicks, orc-green skin and tusks;
  Zargash in ram horns (Orcus) with a skull mace and a book. Painters: body (a draped cape with the sash), lever (yawAware box +
  a TRAPDOOR sign), table (yawAware slab), tank fins, podium / carpet rings, black-marble veins.

## API (others use)
- `DD.League.name(level)` (1 → "The League of Villainy", 13 → the full name; each letter run capped at the level),
  `word(level)`, `fit(maxChars)` (the widest name within maxChars), `frames()` (levels 1 → 13), `FULL`, `SHORT`, `LEVELS` (13),
  `CODEX_NOTE` ("(full name: 56 letters in 'League' alone; the members disagree on the count)").
- `DD.League.stats(state)` → `{ bodies, broken, raised, fizzled, songs, songLanded, songHits, expended, drowned, lever, dropped,
  fireballs, punted, tunnels }` (puzzle engagement for the sims), `hype(state)`, `frontman(state)`, `songCount(state)`,
  `songTiles(state)`, `bodyTiles(state)`, `N` (knobs), `SK` / `ST` (ids), `MEMBERS`, `NAMED`, `BANTER`, helpers for tests.
- Fight state: `state.data.league = { on, hype, expended, banterRound, banter, rolled, tipped, last, over, stats }`.
- Test params (the AutoPlay suite): `real=1&n=&level=&seed=` (random real parties; needs the hero files: `isolate=league,heroes`),
  `hpx=<HP factor>`, `knobs=key:value,…` (DD.League.N), `lv=skill.key:value,…` (level-1 numbers), `fights=1` (one line a fight).

## Numbers (author sims: random real parties of 4, level 5, no items / Blessings / consumables, full HP, normal, the real path)
`tools/test.sh "suite=boss_league: AutoPlay&isolate=league,heroes&real=1&verbose=1&n=80&seed=<s>"`:

| build | seeds × fights | win rate | rounds | downs / fight |
|---|---|---|---|---|
| plan §3.2 as written (365 HP, mend 15) | 11 × 40, 21 × 80 | 60%, 43% (≈ 48%) | 13.5-13.9 | 4.0-4.3 |
| HP × 0.9 | 11 × 40, 21 × 80 | 73%, 49% (≈ 57%) | 12.5-12.7 | 3.0-3.8 |
| HP × 0.87, mend 12 | 11 × 60, 21 × 60 | 75%, 55% (65%) | 12.1-13.3 | 3.0-3.8 |
| **shipped: HP 322 (× 0.88), mend 12** | 31, 41, 51, 61 × 80 | **69 / 63 / 64 / 75% (67.5%)** | 13.0-13.7 | 3.0-3.8 |

Band (plan §7.1, five doors): author 63-74% at L5 → **67.5%**. Per fight (shipped, seed 61): heroes take missiles 53, Blah 29,
Skull Splitter 27, Shin Splitter 19, Smite 8, Tunnel 7, Bleed 5, the song 3, the fireball 2 (both wind-ups are dodged by
AutoPlay); the League takes 284 from the heroes (~22 a round: 6 / 25 / 33 / 31 / 32 / 27… by round), heals 43; engagement a
fight: 4.8 bodies, 0.8 broken, 0.75 raised, 1.45 songs, 0.7 lever pulls, 1.4 fireballs, 0.85 Expendable Friends, 1.1 tunnels.
Fixture party (test_ heroes, L5): ~50%, ~15 rounds (smoke only). 0 timeouts in ~800 sims, no "Error in" warnings.

## Deviations (from the plan, with reasons)
- **HP 365 → 322 (−12%) and Unholy Water 15 → 12.** The plan's numbers won ~48% in the author sims (band 63-74%); HP is the
  plan's first lever (§7.1). 322 stays inside the plan's squad band (320-365, §3.0.5). The fights are long in item-less
  author sims (~13 rounds, plan 7-9 for the campaign): the heroes deal ~22 a round, the squad has 322 + ~0.75 revivals + ~45
  heal a fight. Campaign parties (items, ~35-40 a round) should land near the plan; BAL owns the campaign numbers.
- **`objective.bossId: 'lg_kelek'` next to `bossIds`.** Until MAPGEN's `buildObjective` keeps a squad boss objective without a
  boss-tier unit, the build fell back to killAll (and `content: encounters build` asserts the type survives). With `bossId` it
  survives; `Combat.bossUnits` merges both (same five defs), so nothing else changes. Harmless once MAPGEN lands; may stay.
- **`objective.squadName`** (= `DD.League.name(3)`): plan §5.4 wants the objective subtitle at level 3 ("Defeat the
  Llleeeaaaguuueee of Villainy (5 left)"); RULES' `objectiveText` reads `shortName` (E10). Inert until RULES reads it (request).
- **The Theme Song**: its marked tiles are frozen when it starts (every tile within 3 of a singer then: wind-ups need fixed tiles
  to be honest), the number is live (the singers at the landing). Desc: "every foe on the marked tiles (within 3 of a singing
  member when the song starts)" instead of "every hero within 3"; "frozen" listed with the other stun-likes. One voice is
  `L.dmg`, the others ride on `d.flat` / the skill's `telegraphFlat` (exact badge at every difficulty); no high ground (a song
  carries from the podium). Kind `attack` (not a spell: silence doesn't stop a song). It is not a skill slot (scripted like the
  DM's wind-ups); the Fireball and Spiteful Revival are slots with `windupOnly` so the engine keeps their cooldown / charges.
- **Hero Punt's crash is the engine's bump damage** (`L.crash`, not a damage key: like every bump it is never scaled by
  difficulty and `AI.fightLevel` leaves it alone, so the desc stays exact).
- **Unreasonable is live both ways** (healed above half HP he is reasonable and movable again; plan: "below half HP").
- **Expendable Friends is once per fight**, not per unit: a raised Skylla doesn't get another one (`state.data.league.expended`).
- **The Trapdoor Lever** puts each podium unit on the nearest Shark Tank tile and calls `DD.Act.fall` (the engine's 25% + Wet for
  heroes, `preventDeath` for the League, its climb-out at the nearest safe tile = the tank's edge).
- **Floors**: custom black marble (`lg_marble`) and purple carpet (`lg_carpet`) instead of the core obsidian (its glowing cracks
  read as lava in a screenshot) and red carpet; the dais stays white marble for contrast.
- **Pushed into the tank, a member bleeds once at once**: the push's own Bleed tick ("each move or push") hits the fresh Bleed 3.
- **Named lines are picked by hero id** (`def.named`), with `barks.named` kept as the texts: Benedick may not be registered when
  this file loads, and the engine's party filter only knows registered heroes (his line would have played without him).
- **Banter** waits 550 ms between bubbles with `DD.FX.wait` (0 in instant mode / sims).
- **Names**: the unit names are the user's (Kelek, Warduke, Skylla, Zarak, Zargash), no epithets; Zarak's passive is "Short
  and Sturdy (an Orc)". The Hex keeps V's name; Skylla's lines carry the Baba Yaga pact (V's Hexanne voice, rewritten).

## Requests
- **RULES (`combat.js objectiveText` / `squadName`)**: when `objective.squadName` is set, use it instead of `encounter.shortName`
  (plan §5.4's level-3 subtitle; ≤ 50 characters with "(5 left)").
- **RULES / AUTOPLAY (`autoplay.js objectValue`)**: a hinted object that takes two hits is worth only `dmg × 0.5` until the hit
  that breaks it, so AutoPlay rarely breaks the League's 10-HP bodies (0.8 broken vs 0.75 raised a fight) — the plan's "sims
  under-break bodies". A share of the hint per hit (e.g. `v × dmg / hp`) would let the sims play the puzzle a human plays.
- **HUD (E7)**: the `lg_hype` chip changes its `name` / `desc` live (`🎤 Villain Hype 40/100`); `renderTop` hashes `id:turns`
  only. `.log-line` needs `overflow-wrap: anywhere` for Kelek's intro (the 56-letter word in one piece).
- **META-UI**: the codex group header "The League of Villainy" + `DD.League.CODEX_NOTE` (plan §5.4); `overflow-wrap: anywhere`
  where the full encounter name shows (rewards banner sub, map tooltip, Hall history).
- **NARRATIVE (`svammiel_lines.js`)**: Svammiel calls Zarak "the dwarf" too (the user's running gag: "everyone, Svammiel
  included") — `svam_cameo_league` / `svam_sulk_league` are the natural spots; the "League Recruitment Drive" event uses the
  user's names (Kelek, Warduke, Skylla, Zarak, Zargash).
- **Lead (DESIGN §9 item 7, §5 act-4 column)**: the League now has 322 HP in all (was 365) and Unholy Water heals 12.
- **Integrator / BAL**: the author-sim table above; the act-4 campaign numbers are yours (HP is in `DD.League.N.hp`, the skill
  numbers in the skill levels; the sims can read `DD.League.stats(state)` for engagement).

## Tests
`tests/content/boss_league.js`, 13 suites "boss_league: …": registry + the user's 56-letter name (run lengths 10/11/12/1/13/9,
the level table, fit, frames) + the encounter fields; the arena (spawns, heights, podium, wall openings, tank, lever, kegs,
table, pillars, the hype chip, Meat Shield at start, the intro); Warduke (Skull Splitter, Bodyguard aiScore, punts into floor /
a hero / the tank, Unreasonable: status, immovable, +3 hit, telegraph, attack of opportunity, healed back); Zarak (immovable, no
skill swap, Shin Splitter + Bleed, Sneak Attack on the hit / the wind-up number / the attack of opportunity, Tunnel Ambush
targets, landing, damage, Slow, no provokes, boxed in); Kelek (missiles pick and hit, no LOS; Meat Shield on the hit and the AI
estimate; the fireball's area, number, cooldown, League included, nobody outside; no centre with one hero); Skylla (Blah + pull,
Hex, Expendable Friends: nearest, 1 HP, credit, once, ties, alone; a lethal preview leaves no trace); Zargash (Smite, Unholy
Water, never himself, bodies + D1 target + AutoPlay hints, the revival lands at half HP / charges / broken body / stun / his
planner winds it up / dead Zargash makes bodies worthless); Villain Hype sources and chip, frontman succession, singers
(podium ×2, stun / charm), the song at 100 (wind-up, reset, no fireball, marked tiles, honest live number, the hit, nobody off the
tiles, never the League); Too Evil to Drown (kill, floor of 1, pushed into the tank) and the lever (drops, heroes 25% + Wet,
climb-out at the edge, AutoPlay value, no second pull, reset after three rounds, flyers stay); the squad objective (text, flavor,
four down not over, a raised one keeps it going, victory, league_death) and Nepotism (+3 for every member; needs svammiel.js
and cameo.js, else logged); voice (lengths, ≤ 22-letter words, the villain pronoun sweep, no screen words, the dwarf gag, named
lines name real heroes exactly, the Benedick line verbatim and never without him, mourning and banter, the DM's whisper);
robustness (each member alone acts, charmed / sheeped turns, lethal previews on every member change nothing); AutoPlay battles
(fixture smoke; `real=1`: the band 45-90%, bodies and the body puzzle engaged).

Runs: `bash tools/test.sh "suite=boss_league&isolate=league"` — 13 suites PASS. With `isolate=league,svammiel` the Nepotism
check runs (PASS). `content:` suites with `isolate=league`: all PASS except the two that need the real hero files ("the rules
reach real content"), which fail in any isolated run.
Full `bash tools/test.sh` (Nov 14, 22:50): **PASS — 1146 suites, 138,844 assertions, 0 failures**, 0 swallowed "Error in"
lines (missing scripts 6: the Gardener's, Galbraith's and the Coven's files, not landed yet). An earlier full run caught the
body desc's capital "Any" (`kit: finish D1` matches the rule's words case-sensitively; fixed) and a RENDER-SPRITES banner check
that was mid-edit at the time (theirs; it passes now).
Screenshots (`.tmp/league/`): the arena at rot 0 / 90 / 37.5 and the five in the sprite gallery read as intended.

## Known issues
- Author-sim fights run ~13 rounds with ~3.4 downs (plan: 7-9 rounds, ≤ 1.3 downs in campaign sims); BAL measures the campaign.
- AutoPlay under-breaks bodies (see Requests); humans get a better fight than the sims show.
- Until MAPGEN's `a4_lair` theme is in the build the arena falls back to another theme (a "MapGen: unknown theme" warning, not a
  failure); the layout sets every floor explicitly.

## Review (V3)
Adversarial review of league.js and this suite (Nov 15; the reviewer now owns these files). Verified by running code: the
owners' 13 suites; scratch harness fights on the real path (Combat.start with deployment and rolled initiative, AutoPlay on
both sides) for five real parties at L5 (a no-healer party, two with Slate): bodies, raises, songs, the lever, Expendable
Friends, Too Evil to Drown all fire with no swallowed errors; The Theme Song's shown number against the hit in live fights
(equal for every hero without Block; the one difference was Slate's Block); a preview whose hit makes Warduke Unreasonable
leaves the real unit (status, `flags.immovable`) untouched and the def's flags are never mutated across fights; determinism
(same seed twice; a longer cosmetic pool leaves the fight bit-identical); the author sims (`real=1&n=80`, seeds 31 and 61:
69% and 75%, the owner's numbers exactly; 0 timeouts); the shot `.tmp/rv/league_r90.png` (the Clubhouse at rot 90: dais,
podium, tank, lever, kegs, the five, Kelek's 56-letter intro in the log).

Fixed: the Villain Hype chip showed its icon twice ("🎤 🎤 Villain Hype 0/100"): the HUD prints `icon + ' ' + name` and the
rule's name began with the icon. The name is now "Villain Hype N/100" (icon 🎤), so the chip reads exactly the plan's
"🎤 Villain Hype 40/100"; the suite checks it. Also the header comment's stale "365 HP in all" (322: `N.hp`).

Checked and true as built: every desc against its execute (Skull Splitter, Hero Punt's unscaled bump, Shin Splitter + Bleed,
Tunnel Ambush, Evil Missiles, the Fireball, The Theme Song's frozen tiles and live number, Eldritch Blah, the Hex, Smite,
Unholy Water 12, Spiteful Revival, Meat Shield, Unreasonable, Too Evil to Drown, the body, the lever, the table) and every
passive line; Sneak Attack and Unreasonable flats are unscaled, as their "+4" / "+3" say; the song's extra voices are
pre-scaled by the fight's damage factor (the engine adds `d.flat` after `mult`); the named lines' hero facts (Zarathor a
warlock, Kiri's ghost arrows, Sparrow's blood magic, Marwyn's beard, Slate a golem, Hjalmar a monkey, Valdris a cleric,
Josiah a doctor, Betty a goatfolk); the Benedick line only with Benedick in the fight (his file is still a stub); the dwarf
gag (Svammiel calls Zarak the dwarf in NARRATIVE's `svam_cameo_league`, which closes the owner's NARRATIVE request); no
mechanic leans on enemies blocking each other; ship dark (act 4, weight 0, a gauntlet lane).

Left for others: the owner's requests stand (RULES `objectiveText` / `squadName`; AUTOPLAY `objectValue` — the sims still
break ~0.7 bodies a fight; HUD E7 live chip refresh and `.log-line` wrapping; META-UI codex header and wrapping; Lead DESIGN
§9 / §5 numbers; BAL campaign tuning). The MAPGEN theme `a4_lair` has landed since (the Known issue about its fallback is
closed).

Final full run after the review (Nov 15): `bash tools/test.sh` PASS — 1227 suites, 143,159 assertions, 0 failures.

## QA fixes (Nov 17, QA FIXER content cluster; the full list: docs/notes/boss-svammiel.md "QA fixes (Nov 17)")
- **FIGHTS-10**: The Theme Song narrates `league_song` only when it hit a hero; a song every hero stepped out of narrates
  the new `league_song_whiff` pool. Asserted in the Theme Song suite.
