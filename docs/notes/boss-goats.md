# C6 — The Rapping Goats (the fifth act-4 door)

Owner C6. Files: `js/data/bosses/goats.js`, `tests/content/boss_goats.js`, this note. Normative spec:
`.tmp/v3/addendum-goats.md` (plan `.tmp/v3/design.md` §3.7 summarises it and wins only on the §7.1 bands).

Run:
- `tools/test.sh "suite=boss_goats&isolate=goats"` (fixture party; the Radio Edit suite skips without `svammiel`)
- `tools/test.sh "suite=boss_goats&isolate=goats,svammiel,syllamin,betty"` (+ the Radio Edit, Syllamin's clap, Betty first)
- author sims: `tools/test.sh "suite=boss_goats: AutoPlay&isolate=goats,heroes&real=1&n=50&verbose=1&seed=<s>"`;
  probes `hp=billy:110,kid:85`, `mov=billy:4`, `lv=rap_gruff.dmg:10,rap_bar_none.dmg2:26`, `knobs=punch:4`, `hpx=1.1`,
  `cameo=1` (with Svammiel's start cameo), `fights=1` (one line a fight), `trace=1` (the first fight's log).

## Summary

The user (Nov 12): *"three rapping black goats. They should spin lines together and diss the party, and at half health
summon a bear lyricist who joins them."* Encounter `boss_goats` **The Rapping Goats** 🐐, lane `goats`, order 5, theme
`a4_barn` "The Barn Burner" (15 × 14), `banner: false`, cameo `svam_cameo_goats` + the **Radio Edit** (C5's cheat),
objective `{ type: 'boss', bossIds: [the four] }`, reward `{ goldMult: 0.9, itemRarity: 'rare' }` (lead patch P5).
The crew **Herd Mentality** (all he, `pronoun: 'he'`): Billy Bleatz (the MC, Golden Mic), Lil' Kid (the hype goat),
DJ Turnip (the DJ), and at the goats' combined half HP the bear **Ursa Verse, the Paw-et Laureate**. Every member is
`tier: 'elite'`, tag `goats`, on his own initiative entry, with **no `boss` field**; the squad fall rule
(`preventDeath` on `cause: 'fall'`: 25% of max HP, climb out) is on every member. No crew healing at all (D9).

## Kit (shipped numbers; `DD.Goats.N`)

| Unit | HP | Armor | Move | Init | Skills (slots) |
|---|---|---|---|---|---|
| Billy Bleatz `rap_billy` | 110 | 1 | 4 | 0 | Catchy Hook 9 + knockback 2 (AoO); Gruff Talk 10 psychic, range 5, sight (diss); Headliner +2 next to the Mic Stand |
| Lil' Kid `rap_kid` | 85 | 0 | 5 | +3 | WHAT?! 8 psychic, range 6, **no sight** (diss); Kid Stuff 9 (AoO) |
| DJ Turnip `rap_turnip` | 90 | 0 | 4 | +1 | Scratch That 9 psychic, range 5, sight (diss); Turnip the Bass ⏳ 10 on one colour (not a slot) |
| Ursa Verse `rap_ursa` (large) | 110 | 1 | 4 | −1 | Writer's Block 11 + Root (AoO); Big Words 11 psychic, range 5, sight, cd 1 (a whole bar alone) |
| the Golden Mic holder | | | | | Bar None ⏳ 22 (I) / 26 (II, the bear) psychic + Weakened 1, range 1-30, no sight, tracks (not a slot) |

Goats 285 (half 142), with the bear 395. Punchline +3 (`modifyOutgoingDamage` flat, mirrored in `estimateDealt`);
Headliner +2 the same way (and as Bar None's `telegraphFlat`). Every desc reads its numbers from `L` (P3: the HUD scales
them), passives read `DD.AI.fightLevel`.

## The Verse (`state.data.rap`, rule `rap_verse`)

State: `{ verse, mark, open: { by, line }, holder, pending, landed, missed, dealt, clapRound, bear, used, moments, banter,
stats }` (plain data: previews copy it; cosmetic fields are never read by logic). The rule's live `name` / `desc` and
`state.objective.flavor` are rewritten on every change (`sync`, the E7 fallback: `renderTop` hashes the flavour), plus a
spotlight zone `state.data.zones` (`id: 'rap_spotlight'`, P10 / E8) on the Called-Out hero.

- A diss (`tags` has `diss`, Big Words excepted) that **delivers** (HP or Block lost) at the Called-Out hero while the
  Verse has room starts a bar (no open bar), finishes another member's (+3 already in the hit, +1 bar), or does nothing
  (his own bar). Big Words: +1 bar alone. Charmed members: nothing. `dissKind` is computed before the hit.
- Rule hooks, in the order they matter:
  - `onTurnStart(unit)`: the open bar's starter → it **hangs** (stunned turns too).
  - `onTurnEnd(unit)`: the holder with `pending` and no Bar None intent left → the Verse resets (`fizzled`, and
    `missed` for a skewed landing on nobody); then the holder at Verse 3, nothing pending, not stunned / asleep / frozen /
    sheep / charmed → `DD.AI.windUp(… 'rap_bar_none', mark, { anchor: 'unit', level: 1 | 2 })`.
  - `onStatusApplied`: a crew member whose pending Bar None is gone (a stun-like or sheep cancelled it) → `cut`, Verse 0;
    a stealthed hero while Bar None is pending → re-sync (the chip says "→ nobody"); hero moments (Basanos's wolf,
    the Dragonsnail).
  - `onStatusRemoved`: the 🗣️ / 🎙️ tokens come back at once unless the rule removed them (reason `'rap'`).
  - `onTakeDamage`: the damage tally for the next call-out (a summon's for its owner), the bear check.
  - `onDowned`: the Called-Out hero down → Verse 0, call out the next (the pending Bar None fizzles at its landing).
  - `onAnyDeath` (rules fire once): a crew member falls → his open bar hangs; his pending Bar None resets the Verse;
    the bear check; the **Tribute** (+1, cap 3, never while pending); the mic passes; the last one / the defeat line.
  - `preventDeath`: the last goat can't fall before the bear's entrance (the entrance runs first; if the spawn fails,
    "Not before the feature!" keeps him at 1 HP until the round-start retry).
- Bar None `execute`: the hero on the landing tile takes 22 / 26 + Weakened; Verse 0; then the new call-out (most
  damage to the crew since the last call-out; ties most max HP, then party order), unless the hit downed the
  Called-Out hero (the down already called out the next). A landing on nobody is a miss. "A hero" is the hero SIDE,
  not `G().hostile`: a holder charmed after winding up still lands it as marked (wind-ups ignore charm, the engine's
  rule, as the bass does).
- While Bar None is pending the chip is re-read at every turn start and end and when stealth comes off (a Help Up fires
  no hook), so it never says "→ nobody" about a hero it will hit.
- Call-outs: Betty first when he is in the party (Billy's line), else the most max HP. Only heroes.

## The Clap Back, the bass, the bear

- Mic Stand interact (1 AP, adjacent, `available`: a hero, not the Called-Out one, once a round for the party, a verse
  going): the clapper is called out, the open bar hangs, a pending Bar None is re-pointed (`DD.AI.redirectIntent`),
  +10 Hype (`gainHype`), Syllamin's clap deals 6 psychic to each crew member with sight to him.
- Turnip the Bass: a custom cooldown `unit.data.bassCd` (2 at the wind-up, −1 at his turn start: every other turn),
  explicit tiles (every square of the colour), crew never hit, a pending bass lands after the speakers break.
- The bear: combined goat HP ≤ ⌊live max × 0.5⌋ in `onTakeDamage` / `onAnyDeath` (and `preventDeath`); the stir at
  ⌊× 0.65⌋ once; the entrance removes the Hay Mounds and the Snoring Lump, `DD.Act.spawn('rap_ursa', 1, 1)` (he joins
  the order next round), the banner FEAT. URSA VERSE, the mic, `DD.Cameo.say('svammiel', 'svam_phase_goats')`
  (budgeted), narration `goats_feat`. Fallback `bear: 'due'` retried at `encounter.onRoundStart`.

## Voice

All pools are registered with `DD.registerNarration` (`rap_diss_<hero>` "setup|punchline" ×4, `rap_close_<hero>` ×2,
`rap_back_<hero>` ×2 for all 17 heroes incl. Benedick, `_generic` pools, `rap_hang / rap_windup / rap_cut / rap_clapped /
rap_bear_chant / rap_lump`, `goats_stir / goats_feat / goats_death / goats_tip`); barks on the defs (named lines are
party-filtered keys); banter sets gated by bear state / hero; four moments; the one-off lines in `DD.Goats.LINE`.
Picks use `DD.rng` (never `state.rng`), skipped in dry runs; every bubble is logged as `<name>: "<line>"`.
The voice suite lints: bubbles ≤ 70 (`{hero}` = the longest name), each couplet's setup names its hero, no other hero's
word, generic pools nameless, he/him vs she/her per hero, the dialect list, the word "black" only in the intro, named
barks name one hero, banter names only behind its gate, codex ≤ 120, narration ≤ 160, names unique (incl. the reserved
Mic Drop / Diss Track / Hype Man / Slow Burn / I'll Wait / Shellacking …). I read every line myself as well: all are
the addendum's (§17) original lines; the few I wrote (the speaker lines, "I have the mic?") are farm / stagecraft jokes.

## AutoPlay

Speaker Stack `autoplay` 6 (the last 12) while DJ Turnip lives; Hay Bales 0; the Mic Stand `clapValue` (30 / 10 / 4,
−10 on a pink bass). Known gaps (as the addendum §20): AutoPlay doesn't hide the Called-Out hero on purpose, doesn't
target the would-be finisher, doesn't time kills around the Tribute; it dodges every bass (0.5-1 hits a fight).

## Author sims (L5.5, random real parties, no items, `cameo` off)

| build | fights | won | rounds | downs | notes |
|---|---|---|---|---|---|
| addendum as written (105/70/80/110, hits 8/6/7/10, Bar None 18/22, move 3) | 50 + 30 | 100% | 13.5-14.2 | 1.2-1.3 | ~125 damage a fight; Lil' Kid dead in ~3 turns; the bass hits 0.7 heroes a fight |
| + Kid hides, DJ basses only with a hero on the floor | 30 | 100% | 13.9 | 1.7 | |
| + hits 10/8/9/9/11, Bar None 22/26 | 40 | 93% | 14.6 | 2.1 | |
| + move 4 (Billy, Turnip, Ursa) | 40 | 85% | 14.7 | 3.4 | |
| **shipped**: + HP Billy 110, Kid 85, Turnip 90 | 3 × 50 (seeds 1-3) | 68 / 72 / 80% = **73%** | 14.3-15.2 | 3.9-4.4 | in the band 66-74% |

Engagement a fight (shipped): bars started 6.3, finished 3.1, hung 4.4, tributes 2.3, Bar None landed 0.5-0.6, cut
0.2, fizzled 0.1, claps 1.3, Big Words bars 1.1, bass wound up 3.1 / landed 2.7 / heroes hit 0.5-1, speakers broken 0.3;
the bear at round ~7 in 149 / 149 fights that reached half. Damage to heroes a fight: Gruff Talk ~56, WHAT?! ~38,
Scratch That ~28, Big Words ~19, Writer's Block ~15, Bar None ~10, Catchy Hook ~9, Kid Stuff ~5, the bass ~3.
0 timeouts. Fixture party (2 fights): smoke only.

## Tests (`tests/content/boss_goats.js`, 18 suites)

Registry (exact descs, slots, tokens, terrains, objects, encounter fields, theme) · arena (39-square checkerboard 23 / 16,
stage heights, objects, deploy 20 tiles 7+ away, cover hides) · skills desc == execute (hook + knockback, Headliner
estimate = preview = result, sight, WHAT?! through a post, Writer's Block + Root, Big Words, the bass colour-only and
crew-safe, Bar None I / II = the marked number + Weakened) · bars (start / finish +3 with preview = estimate = result,
high ground, a Weakened finisher, no self-rhymes, Block counts, Invulnerable doesn't, caps, charm, taunt) · hangs ·
Bar None (wind-up, chip, tracking, landing, call-out by damage with summon credit, ties, never by a silenced holder,
his own third bar; interrupted ×4 with `windup:cancel`, stealth fizzle, the chip after stealth broken / a Help Up
(review), downed mark, Dazzled miss, a holder charmed after the wind-up lands as marked (review), holder killed →
Tribute → the mic passes) · call-outs (tokens survive a cleanse, the spotlight zone, Betty first) · Clap Back · Tribute ·
the bear (stir once, entrance inside the crossing hit, full round of notice, level I stays, level II, mic back, brutal
live max, an area wipe, the null-spawn fallback) · the bass (colour by count / tie / none, every other turn, speakers,
the holder list, AutoPlay hints) · honesty (previews leave no trace, threat shading counts the punchline, `state.rng`
untouched, the couplet pair) · the Radio Edit at this door (needs `svammiel.js`: the §15.1 pick, the exact chip ≤ 90,
refused rounds 1 / 5 / 10 and after a cooldown reset, honest crew estimates, AutoPlay never uses it, the Bribe) · voice ·
sprites (4 × 4 poses × 3 times × 5 yaws, props, the bear the biggest) · robustness (each member alone, the area watch) ·
AutoPlay battles (band 45-90% at `real=1`, engagement asserts).

## Deviations (from the addendum, with reasons)

- **Retuned numbers** (the author sims; plan §7.1 band 66-74% at L5.5): the addendum's numbers won 100% (table above).
  HP Billy 105 → 110, Lil' Kid 70 → 85, DJ Turnip 80 → 90 (goats 255 → 285, half 127 → 142); Gruff Talk 8 → 10, WHAT?!
  6 → 8 (no longer an under-band poke: Lil' Kid is the verse's starter and died in three turns), Scratch That 7 → 9,
  Kid Stuff 8 → 9, Big Words 10 → 11, Bar None 18 / 22 → 22 / 26 (the big-wind-up band top); move 3 → 4 for Billy,
  Turnip and the bear (they spent a quarter of their turns walking). Every hit stays in the act-4 band (7-11); the squad
  total (395 with the bear) is above the 320-365 row, but the goats heal nothing (the League's effective HP is ~415 with
  revivals and Mend). `bearAt` stays 0.5: "at half health" is the user's.
- **Lil' Kid yells from cover**: his planner picks, among the tiles in WHAT?! range of the chosen target, the one the
  fewest heroes can see or stand next to ("Can't see me? Can still HEAR me!"); addendum §13 only said keepDistance 2.
- **DJ Turnip basses only with a hero (or hero summon) on the dance floor** (else Scratch That): with nobody on the
  floor the colour choice is empty; his passive says so ("while a Speaker Stack stands and a hero is on the dance floor").
- **Bar None calls out after every landing** (the addendum's rule 2), also when a skew landed it on another hero; only a
  hit that downs the Called-Out hero leaves the call-out to the down.
- **The chip of a pending Bar None names whom it tracks** ("→ nobody" once the hero is stealthed or down) instead of the
  Called-Out hero, so it never names a hero it will not hit.
- **The corner bales** (13,0), (14,0), (14,1) hide nothing walkable from the dais or Billy's start (the map edge is behind
  them): the arena test checks the other six bales and four posts; the layout stays the addendum's.
- **Speaker lines**: "Not the speakers! ...Not BOTH speakers!" played when the FIRST speaker fell; now "My speaker!
  ...I still have the other one. Don't look at it." (first) and "Not BOTH speakers! ...Fine. I'll just hum it." (last).
- **Object descs** say "Destructible (N HP): any single-target damage skill can break it" (lower-case, the kit suite's
  D1 wording) instead of "Any single-target damage skill can break it (N HP)".
- The banner sub at the entrance comes from Lil' Kid first (he yells it), then Billy, then Turnip.
- Extra `DD.Goats` exports for tests / QA: `LINE`, `LAYOUT_LEGEND`, `pendingOn` is internal.

## Requests

- **Lead (DESIGN §5 band row, §9 entry 10)**: the goats' numbers moved (Deviations): §5 "the goats' WHAT?! at 6 is a
  deliberate under-band poke" → WHAT?! is 8 now (drop the note); "the goats 255 + the bear 110" → 285 + 110 = 395 (no
  crew healing); §9 entry 10 "255 HP between them", "Bar None 18" / "(Bar None 22)" → 285, 22, 26.
- **BAL**: campaign target 91-95% for this door; the author sims are at ~73% (L5.5, items off). Levers in order (the
  addendum's, re-based): Bar None 22 → 18, Ursa 110 → 95, HP (Kid 85 → 75 first), move 4 → 3, `tribute` 1 → 0. Never
  `bearAt` (the user's "half health") and never the Radio Edit's duration (lead decision: the whole fight). Measure the
  Radio Edit's cost with `cameo=0` vs on (`cameo=1` in this suite's sims); `clapHype` 10 → 5 if claps reach ≥ 4 a fight.
- **Integrator (sims)**: the goats' engagement columns are `DD.Goats.stats(state)` (bars, started, hung, barNone, cut,
  fizzled, missed, claps, tributes, words, bass, bassLanded, bassHits, speakers, bearRound, bear).
- **RENDER-SPRITES (optional)**: a `bleat` voice for the goats' barks (`def.voice`), not used yet.
- **The Gardener (C1)**: the kit suite "finish D1 — object texts …" also lists `gard_gourd`, `gard_drum` (their descs
  need the lower-case "any single-target damage skill" wording); the goats' two are fixed here.

## Review (V3)

Adversarial review, Nov 15 (owner of this file, `goats.js` and `boss_goats.js` from here on). Checked against the
addendum, plan §3.0 / §3.7 / §7.1, the USER OVERRIDES and the lead decisions (whole-fight Radio Edit, E13).

**Method.** The 18 suites (isolated with Svammiel, Syllamin, Betty, Benedick and Basanos, and in the full run), plus a
scratch harness (`.tmp/review-goats/run.sh` + `review.js`: a copy of `tests/test.html` that adds one script and takes
a Chrome slot). It plays WHOLE fights through `DD.AutoPlay.runBattle` (the Combat API: `useSkill`, `move`, `interact`,
`endTurn`) and checks these invariants live:
- every diss against what the chip showed just before it (start / finish +3 / nothing), with the estimate and the HUD
  preview equal to the hit;
- an open bar never survives its starter's turn start, and the holder at 3 bars always winds up;
- Bar None hits the number marked at the last hero turn end;
- the bass marks one colour, only while a Speaker Stack stands, and hits only marked hero-side units;
- a Clap Back moves the call-out, re-points a pending Bar None and pays the Hype;
- the bear spawns inside the hit that crosses combined half, exactly once, and first acts the round after;
- no member is a boss;
- the Radio Edit's skill is refused at every turn of its hero and never used.

Seven parties × 5 seeds, cameo on:
- Betty (betty, syllamin, marwyn, ellaria)
- no control (zarathor, sparrow, corelos, valdris)
- Syllamin (syllamin, slate, kiri, pebbles)
- mixed (josiah, basanos, hjalmar, buga)
- Marbles + Betty
- two Benedick parties (benedick, slate, sparrow, josiah; benedick, syllamin, betty, pebbles; his file landed during
  the review)

Totals: 703 disses (274 starts, 108 finishes, 55 Big Words bars), 24 Bar None landings, 95 basses, 47 Clap Backs
(21 re-points), 35 bears. The Radio Edit was refused 458 times and never used. Every result matched what the chip had
shown, and every estimate equalled its hit. Determinism holds: the same seed replays the same fight, and a different
cosmetic RNG stream changes nothing. A scripted check drives the Clap Back through `Combat.move` + `Combat.interact` on
the hero's own turn: 1 AP, Bar None re-pointed, +10 Hype, then unavailable for the rest of the round.

**Fixed** (most severe first; each has a regression test in `boss_goats.js`):
1. **A charmed Golden Mic holder's Bar None lied.** Charm the holder after he winds up (Syllamin's Heckle, Corelos's
   Sign Here, Please, Buga's Bribe, Pebbles' Puppy Eyes). The chip, the board and `DD.AI.windups()` kept showing
   "22 → the hero", but `execute` asked `G().hostile(holder, hero)`, which is false for a charmed enemy. So Bar None
   landed on nobody and counted as a miss. It happened twice in 30 playthroughs. The engine's rule is that wind-ups
   ignore charm (`actions.js` addStatus; DESIGN §4.4: only stun, sleep, freeze or sheep interrupt them), and the bass
   already hits by side. Fix: Bar None and its Headliner telegraph look for the hero SIDE, so it lands exactly as marked.
   Test: "charmed AFTER the wind-up" in the Bar None interrupt suite.
2. **The chip could say "BAR NONE ⏳ → nobody" about a hero it was going to hit.** If stealth broke on an attack, or a
   downed tracked hero was helped up before the landing, the engine tracks them again, but the chip only re-read on
   stealth gained or on a down. Fix: it re-reads on stealth removal and at every turn start and end while Bar None is
   pending. A revive fires no hook, so the chip can still be stale for the rest of the reviving hero's turn; the
   board's own wind-up marker is live meanwhile. Test: "the chip follows the tracked hero back".
3. A skewed miss left the chip on the old hero until the holder's turn end. It re-reads at once now.

**Checked, fine:**
- desc == execute for every skill, at both Bar None levels.
- The punchline and Headliner flats show in the estimate and threat shading, also with high ground and a Weakened
  goat.
- Hangs, the Tribute, the stir and the bear's entrance, the spawn fallback, brutal live max HP and the area wipe.
- The bass and the speakers; the holder order (never Turnip); the tokens survive a cleanse.
- The Radio Edit:
  - The pick follows the §15.1 tie-breaks: at debug L1 it picks Throw Money At It (8) over Gold-Plated Fireball (5),
    as the rule says.
  - The chip is ≤ 90 characters.
  - The Bribe buys it off, and AutoPlay never uses the bleeped skill.
- Nothing relies on enemies blocking each other.
- Objects as shipped: the speakers (12 HP) and bales (6 HP) are aimable with the D1 words; the Mic Stand, the mounds and
  the lump are not.
- No boss field on any member, `pronoun: 'he'` on all four, and the P2-P5 and P10 contract items are in.
- Ship dark: everything is `act: 4`, the encounter is weight 0 with a gauntlet lane, and the lines only play in this
  fight.
- Benedick's couplets, closers, comebacks, banter and the Dragonsnail moment work with his real file (`ben_dragon` is
  the id it registers).

**Voice and tone** (every pool in `goats.js` read line by line against addendum §17, not just linted):
- The lines are the addendum's, verbatim, plus the owner's few farm and stage lines. Each couplet hits that hero's own
  blurb or kit.
- No dialect spelling, and the whole word "black" appears only in the intro. No fur-colour joke and no coded costume:
  - Billy: gold-rimmed sunglasses, gold horn rings, a cowbell on a chain, a neckerchief;
  - Lil' Kid: a sweatband, a foam finger, a feed-funnel megaphone;
  - DJ Turnip: turnip headphones, a bitten record;
  - Ursa: a beret, a turtleneck, glasses, a notebook.
- No real lyrics or artists, no slurs.
- Self-harm: Sparrow's lines are about her blood-magic kit; her own text says she "pays for every spell in blood" and
  "She opened a vein". "That's not blood magic, Sparrow. That's a paper cut!" and "Bleeding's not how you join" mock the
  size and price of her spells, not self-harm. The one line that did read as self-harm was already replaced by
  plan:review. Kept, but flagged for the user's playtest ear (each is a one-line swap).
- "Four acts in" (a generic couplet) states this fight's act, not "the last act", and only plays here.

**Art** (every PNG Read; `.tmp/review-goats/shots/`):
- The arena at rot 0 / 90 / 180 / 270 / 37.5: the checkerboard reads at every yaw, the stage and dais step up, and the
  speakers, posts, bales and the hay corner with its drifting "Z" sit where the layout puts them. Nothing is mirrored.
- The gallery (Billy, Lil' Kid, DJ Turnip, Ursa): the goats are charcoal, never Betty's colours.
- The bear (`bosshp=0.52`, AutoPlay, rot 90): Ursa is the biggest unit, the chip reads "Ursa Verse holds the Golden
  Mic", and the bass marks only the pink squares.
- Not drawn yet: the 🗣️ spotlight in `state.data.zones` (RENDER-WORLD's E8).
- Nit, kept: the notebook's "RHYMES" overhangs the book, in the 128 px gallery view only.

**Sims after the fixes** (L5.5, random real parties, Benedick now in the pool, 50 fights each):
- Seed 1: 72% (36/50). Seed 3: 72% (36/50). Both inside the 66-74% band.
- The bear arrived in all 95 fights that reached half.
- Engagement stays above 0: about 4.5 bars hung, 1.2 Clap Backs and 0.25 Bar None cut or fizzled a fight.
- Radio Edit cost (`cameo=1`, seed 1, the same 50 parties): 66% against 72%, about 6 points in one paired batch. That
  is above the plan's ≤ 3 target. BAL takes it back on the goats' own numbers; the ban stays whole-fight.

**Full run** (`bash tools/test.sh`, Nov 15, Benedick landing in parallel): 1259 suites, 149,127 assertions ok, 25
failures in 13 suites, none in this area. All 18 `boss_goats` suites pass, and no "Error in" lines come from these files.
The 13 failing suites belong to other owners:
- 8 `hero_benedick` suites (his work in progress);
- `kit` ×2 (`ben_breath` reuses a generic skill's icon; `ben_inevitable` is not in the D1 opt-out list);
- `docs` D1 (The Inevitable is missing from DESIGN §4.2);
- `ui` ×2 (the 17-card party select at 1600×900 overflows, 734 / 725; an Armor chip pokes out at 1024×768).

### Requests (review)
- **BAL**: the Radio Edit costs about 6 points at L5.5 here (72% → 66%, one paired 50-fight batch, seed 1).
  Re-measure in campaign sims, `cameo=0` against the default. The levers are the goats' own numbers, Bar None 22 → 18
  first (lead: never the ban's length).
- **C2 / its reviewer**: `league.js intentVictim` and any execute that picks victims with `G().hostile` break when a
  member is charmed after his wind-up: it shows a number, then hits nobody or his own side. Wind-ups ignore charm, so
  land by side, as the goats now do.
- **RULES (optional)**: `AI.intentDmg` is the raw hit for every wind-up in the game: it ignores the target's armor,
  Block and Benedick's shell. That is fine as a convention, but the wind-up tooltip should say so if players read the
  number as exact.
- **RENDER-WORLD**: draw `state.data.zones` (E8). The goats write their 🗣️ spotlight there on every sync.

## QA fixes (Nov 17, QA FIXER content cluster; the full list: docs/notes/boss-svammiel.md "QA fixes (Nov 17)")
- **FIGHTS-09**: Ursa Verse gets the status Mic Check (`rap_mic_check`, 1 turn) when his rolled place next round comes
  before a hero who has not had a turn since he walked in; his first turn is then a mic check (a line, no action). Fixed
  initiative modes put a joiner last: never. Suite "QA FIGHTS-09 / voice-2".
- **voice-2**: with Billy gone the bear enters with `LINE.featureSolo` ("Who woke me? ...Ah. A verse needs finishing.").
- **voice-8** (a lead / user call, done as the QA hint suggested): Syllamin #3 and the Marbles closer #2 softened (no jab at
  his mother; forgetful, never forgettable). **HERO-7**: the Benedick bar no longer repeats Svammiel's "last Tuesday".
  Suite "QA voice-8 / HERO-7". Deviation: these three lines differ from addendum §17 (the lead may restore voice-8).
