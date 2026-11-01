# BOSSES-ACT1 notes: Grimble and the Rat King (Act 1 bosses)

Files: `js/data/bosses/grimble.js`, `js/data/bosses/ratking.js`, `tests/content/bosses_act1.js` (21 suites
`bosses_act1: …`). Scratch: `.tmp/bosses-act1/` (scenario page `scene.html` + `scene.js` + `shot.sh` for screenshots of
exact moments, `summ.sh` to summarise sim output); review scratch `.tmp/bosses-act1-review/` (`probe.sh` +
`probe.js`: status robustness, edge cases, real-hero sims with `&party=starters|random|<ids>&runs=n&tune=…`;
`scene.html?…&scene=tails|guard` and `&zoom=3&focus=<defId>` close-ups via its `shot.sh`).
Isolated runs: `bash tools/test.sh "suite=bosses_act1&isolate=bosses/grimble,bosses/ratking,bosses_act1"` and
`bash tools/test.sh "suite=content:&isolate=bosses/grimble,bosses/ratking,bosses_act1"`.
Balance runs: add `&verbose=1&sims=48` (and `&tune=grcfg.noHint:1,rkcfg.noHint:1` = AutoPlay ignores the puzzles,
`&party=random` = 4 random real heroes per fight; see the test file header for `dmglog`, `hplog`, `fightlog`, `tune`).

## Summary

### Grimble, the Goblin Tax Collector (`grimble`, encounter `boss_grimble`)
A 12×12 tax office (theme `cellar`): a carpeted dais up north with **the Vault** (gold glinting inside, its round door
hoisted on one frayed rope), the striped red-X **DROP ZONE** under the door with **Grimble's Desk** in front of it, a
brazier and gold piles; filing cabinets and pillars for cover on the plank floor; three levers labelled
**Tax Loophole** (west flank, east dais edge, middle of the floor); break-room doors (mark `grim_door`) where interns
arrive; the party deploys along the south edge.

- **Grimble** (act 1 boss, **150 HP**, move 3, fire ×1.25 "paperwork", 1.9-scale goblin in a coat with a green
  accountant's visor, monocle, gold teeth, ledger, quill, gold chain, sparkle aura). Custom planner.
  - Every round: **Levy** (tracking, range 1-7, line of sight: 11 damage to *the biggest spender* = the hero who has
    dealt the most damage, steals up to 10 party gold via `DD.Act.loseGold`, 1 Block per 2 gold stolen until his next
    turn) and a fresh **Audit** (⏳1 paperwork barrage down a whole row or column, 20 to every hero in it; at most 2
    lanes pending in phase 1, it loves a hero stuck in Red Tape), plus a **Rubber Stamp of Denial** (14 + push 2 on the
    4 adjacent tiles, anchored to him) when a hero is next to him. Then alternately **Red Tape** (tracking 4 + Root 2:
    a rooted hero can't walk out of the audit that is coming) or **Hire Intern** (1 intern, max 2 on the payroll).
    The Levy is planned (and resolves) **last**, so the gold it pockets never changes an earlier attack's number.
  - **Ill-Gotten Gains** (soft timer, status `grim_ledger`, stacks = gold he holds): **+1 damage on all his attacks per
    10 gold he holds, up to +8** (telegraphs include it via `telegraphFlat`). Refunded when he falls (in a run the
    refund is paid back raw: no passive gold bonus on your own coins).
  - **Appeal Pending** (stun guard, status `grim_appeal`, like the act 2/3 bosses): after a stun, sleep, freeze or charm
    lands he can't get another one until the end of the next round. The vault door's stun always lands.
  - Phase 1 he never leaves the DROP ZONE.
  - **Phase 2 "Hostile Takeover"** (≤ 50%): banner, narration, bark, status `grim_takeover`, 2 Hasted interns at once
    (max 3), audits come in crossing pairs (a row + a column through a hero, max 4 lanes), the Levy becomes **Garnish
    Wages** (13 damage, 15 gold, any range, **no line of sight needed**: no hiding behind cabinets any more), and he
    leaves the desk to stamp people, walking back to it on every hiring round.
- **Puzzle — the Tax Loopholes** (`grim_loophole` ×3, "Exploit Loophole", 1 AP each). Exploit all three and **the vault
  door drops on the DROP ZONE**: everyone there loses all Block, takes **36** damage and is **Stunned** (his telegraphs,
  delayed audits included, are cancelled); Grimble is also **Vulnerable** (2 turns) and **every coin he holds spills
  back to the party** (Ill-Gotten Gains resets). In phase 1 he is always in the zone; in phase 2 only on hiring rounds
  (readable rhythm). A drop on an empty zone does nothing. **Goblin Interns** (6 HP) walk to exploited loopholes and
  telegraph **Close Loophole** on them (it fizzles if the intern is killed, stunned or shoved away first). After a drop
  the loopholes are "under review" for 3 rounds (+2 per later drop), then the interns winch the door back up.
  Discoverability: lever names/labels ("Tax Loophole: Offshore Account (EXPLOITED)", "(under review: 2 rounds)"), object
  and terrain descs in the inspect panel, the DM's opening line about the levers and the rope, a line at 2/3, banners,
  "LOOPHOLE 2/3!" texts, VOID tags while under review, an UNDER REVIEW tag on the vault.
- Ids — enemies `grimble`, `grim_intern` (Goblin Intern: Paper Cut 4 + Bleed 1, Close Loophole); skills `grim_levy`,
  `grim_garnish`, `grim_audit`, `grim_stamp`, `grim_redtape`, `grim_hire`, `grim_papercut`, `grim_refile`; statuses
  `grim_takeover`, `grim_ledger`, `grim_appeal`; terrain `grim_dropzone`; objects `grim_loophole`, `grim_vault`, `grim_desk`,
  `grim_cabinet` (6 HP, smoke burst when destroyed); encounter `boss_grimble` (act 1, boss, objective boss, legendary
  reward); narration `boss_start` (+2 lines), `grim_start`, `grim_vault_hit`, `grim_takeover`, `grim_death`; layout mark
  `grim_door` (+ `grim_loophole` marks, `boss_spawn`).

### The Rat King and the Rat Bar Association (`rat_king`, encounter `boss_rat_king`)
A 13×12 sewer junction (theme `sewer`): the throne walkway up north, **two 2-wide water channels (A, B) draining west
into the Big Drain** (pits at x = 0), an island between them, the party's walkway south. Rotten floor (`rat_rot`, 8
tiles) on every walkway, two explosive barrels. **Sluice Valve A** stands mid-island, **Sluice Valve B** mid-walkway
right in front of the party.

- **The Rat King** (act 1 boss, **200 HP**, move 5, **immovable** (only sewer water moves him), **immune to Sleep and
  Frozen** (forty rats never all sleep), poison ×0.5, 1.9-scale custom painter: a pile of up to 12 knotted, red-eyed
  rats on a red velvet robe with an ermine hem, the top rat in a crown and a barrister's wig, a gavel; the pile shrinks
  as he splits). He likes to wade in the channels (a swimmer, but standing in the water also gives heroes the high
  ground).
  - Rotation per phase (`PATTERNS`): **Tangled Tails** (tracking, range 2-6: 8 + pull 2 toward him + Root 2) /
    **Gnaw** (2 marked rotten tiles near heroes: 8 damage, then they collapse into pits) / **Sewer Surge** (⏳1, a whole
    channel floods: 8 damage to heroes in it, then everyone in it but him is washed into the drain), each with
    fallbacks. Then a **Rat Pile** (all 8 surrounding tiles: 12 + Bleed 1, **22 to a Rooted hero, buried in rats**),
    planned whenever a hero is next to him **or he is reeling one in**: the tails resolve first, so the reeled-in hero
    lands in it Rooted (the signature "get over here" combo). Telegraphs tell the whole truth: the pile shows 22 while a
    Rooted hero stands in it, and the tails' number includes the buried pile hit whenever the pull would drop the hero
    in it (a pure prediction of `DD.Act.pull`: blockers, cliffs, pits, ice, `modifyPush` hooks). Plus **Order in the
    Court!** gavels (tracking 12, range 2-6): 1 a round, 2 from phase 2.
  - **Swelling Ranks** (soft timer, status `rat_swarm`): +1 stack every round from round 2, **+2 damage per stack on all
    his attacks (max 6 = +12)**, shown in the telegraphs and logged ("More sewer rats pile onto the King: Swelling Ranks
    3 (+6 damage)."). A flush washes them all away.
  - **Recess** (stun guard, status `rat_recess`): after a stun or charm lands he can't get another one until the end of
    the next round. The flush's stun always lands.
  - **Splits** at 66% and 33% (banner MOTION TO SPLIT!, narration, bark, status `rat_session` shows the phase): 2 **Rat
    Lawyers** break off each time (14 HP, pushable; OBJECTION! 7 + push 1, Cease and Desist 4 + Root 1 (likes heroes
    near the King), Billable Bite 6; max 3 on retainer, 2 at the start). Phase 2 "Cross-Examination": Gnaw takes 3
    tiles, 2 gavels. Phase 3 "Closing Arguments": Sewer Surge floods **both** channels at once and **Class Action**
    calls up to 3 **Plaintiff Rats** (7 HP, Nibble 4 + Bleed 1) next to the drains. One huge hit can trigger both splits.
- **Puzzle — the sluices** (`rat_valve` ×2, "Crank Sluice", 1 AP). The channel floods and **everyone standing in it is
  washed all the way into the drain**: Rat Lawyers and Plaintiffs drown (environmental kills, +20 Hype), heroes lose 25%
  max HP and climb out on a dry walkway, and the Rat King is **FLUSHED: 30 damage, Stunned (telegraphs cancelled), Wet,
  Swelling Ranks gone**, climbing out at the far (drain) end. Whatever the water can't carry (a downed hero, a flyer, an
  immovable summon) never shields anyone: on an arena with a drain everybody in the channel ends up in it. Each valve
  needs 3 rounds to build pressure again
  (label "building pressure: N rounds", grey wheel, gauge needle). Discoverability: the DM's opening line ("Those two
  valves feed the channels. The channels feed the drain."), the valve desc in the inspect panel, labels "Sluice Valve
  (channel A) — ready", the King's codex, the Swelling Ranks status text, the big red wheels with A/B signs and drips.
- Ids — enemies `rat_king`, `rat_lawyer`, `rat_plaintiff`; skills `rat_pile`, `rat_gnaw`, `rat_surge`, `rat_gavel`,
  `rat_tails`, `rat_class`, `rat_nibble`, `rat_objection`, `rat_cease`, `rat_billable`; statuses `rat_session`,
  `rat_swarm`, `rat_recess`; terrain `rat_rot`; object `rat_valve`; encounter `boss_rat_king` (act 1, boss, objective boss, legendary
  reward); narration `boss_start` (+1 line), `rat_start`, `rat_flush`, `rat_split`, `rat_death`; layout marks
  `rat_chanA`, `rat_chanB` (channel tiles), `rat_drain`, `rat_rot`, `rat_valveA`, `rat_valveB`.

### Balance (AutoPlay, fixture party `test_knight, test_cleric, test_mage, test_rogue`, level 4, normal, 60 gold)
48 fights per boss and seed batch (randomised deployment order + one random pool skill per hero), after the review:

| boss | wins (3 seed batches) | avg rounds | puzzle use per fight | without the puzzle |
|---|---|---|---|---|
| Grimble | **46% / 29% / 33%** | 9.2-10.0 | 4.5 pulls, 0.96 vault drops (all on him), 0.85 loopholes re-closed | 6-8% |
| Rat King | **69% / 67% / 67%** | 10.0 | 2.8 sluices, 2.2 flushes, 1.2 lawyers drowned | 4-6% |

The test guard runs 8 fights each (Grimble 3/8, 10.1 rounds; Rat King 6/8, 10.4 rounds; no timeouts) and asserts:
puzzle engaged in most fights, a vault hit / a flush / a drowned lawyer / phase 2 / a split happen, wins between 1 and
n-1, average rounds 5-13. **Real heroes** at level 4 (starting skills + 1 random pool skill, no items or passives,
40 fights each, full content, `.tmp/bosses-act1-review/probe.js` probe3): Grimble 95% (starter parties, 6.4 rounds,
0.5 downs a fight) / 88% (random parties of all 10, 6.5 rounds, 0.95 downs); Rat King 100% (starters, 8.1 rounds, 0.6
downs) / 100% (random, 8.6 rounds, 1.0 downs). Real heroes are much stronger than the fixtures (as every other area
found); see Requests.

What tuning showed: both bosses were 96-100% wins with 10-12 round slogs before this pass. Small number bumps did
nothing (AutoPlay sidesteps every ground telegraph); what worked was (1) valves moved from the far east edge to
mid-arena (sluice use 2/8 → 8/8 fights), (2) a soft timer that the puzzle resets (Swelling Ranks; Ill-Gotten Gains +
the vault refund), (3) Tangled Tails before the Rat Pile, sleep immunity, (4) fewer/weaker interns (they ate ~40% of the
party's damage), (5) Garnish Wages in phase 2, which ended the 20-30 round "last hero kites behind a filing cabinet"
tails (one sim hit the 30-round cap before).

## Public API (for other authors)

- `DD.GrimbleBoss` (read-only helpers, used by tests and the scratch scene page): `def`, `zoneTiles(s)`,
  `loopholes(s)`, `vaultTile(s)`, `lane(kind, idx)`, `data(s)` (puzzle counters `{ pulls, drops, hits, refiles, jam }`),
  `dropVault(src)`, `fx.door`, `fx.paper` (FX painters), constants `VAULT_DMG, GAIN_PER, GAIN_MAX, REVIEW_ROUNDS,
  PHASE2_AT, P1, P2`, `reviewRounds(n)`, `cfg` (balance knobs for sims: `noHint, gainPer, gainMax`).
- `DD.RatKingBoss`: `channels(s)`, `chanTiles(chan, s)`, `rotTiles(s)`, `valves(s)`, `flood(chan, src, { exempt })`
  (wash a channel into the drain), `phaseOf(unit)`, constants `FLUSH_DMG, VALVE_CD, LAWYER_CAP, SPLITS, PATTERNS`,
  `cfg` (`lawyerCap, gavels, valveCd, wade, swarmDmg, noHint`).
- Events/narration may reuse: enemies `grim_intern`, `rat_lawyer`, `rat_plaintiff` (act 1 minion/normal), statuses
  `grim_ledger` (stacks = gold held; +damage for `grimble` only) and `rat_swarm` (+damage for `rat_king` only), terrain
  `rat_rot`, objects `grim_cabinet` (generic destructible cover), `rat_valve` (needs a channel tagged `rat_chan*`).
- Puzzle counters: `state.data.grim` and `state.data.rat` (`{ sluices, flushes, drowned }`).

## Deviations

- Puzzle objects carry their callbacks on their own (boss-specific) **defs** (`interact`, `available`, `autoplay`,
  `onRoundEnd`, `onDestroyed`) and keep per-instance state in `obj.data` / `obj.label`, instead of instance overrides
  through `DD.Act.placeObject`: they come from the layout legend, and def-level callbacks survive state copies
  (previews, deploy rewinds) without functions in the data.
- Boss phases reuse `slot.level` for numbers that change with the phase (Hire Intern L2, Gnaw L2) so the telegraph,
  desc and execution agree; the phase-2 Levy is a separate skill (`grim_garnish`) because line of sight is not
  per-level.
- The Rat King's fall damage is fixed: falling into the drain (`cause: 'fall'`) deals exactly the valve's 30 instead
  of 25% max HP (`modifyIncomingDamage`), so the payoff is the same at every HP.
- Grimble's arena uses the `cellar` theme (no tax-office theme exists); the carpet, vault, desk and cabinets sell it.
- Stun guards (`grim_appeal`, `rat_recess`) exempt the puzzle stuns (vault door, flush) through a module flag set while
  the puzzle applies them, rather than the DM's "source is the boss himself" convention: the puller stays the source.
- The flood pushes with `bump: 0` (water carries, it doesn't slam) and, on an arena with a drain, drops anyone it could
  not carry all the way (blocked by a downed hero, a flyer, an immovable summon) into the drain via `DD.Act.fall`.
- Telegraph numbers that depend on the target (the buried pile, the tails-into-the-pile combo) use the skill-level
  `telegraphFlat(unit, intent)` hook with a local copy of the engine's attacker multiplier (same approach as the DM).
  Bump damage from a blocked pull is not in the telegraph (engine convention for every push/pull).

## Core fixes

- `js/engine/ai.js` `describe()` (review): a tracking intent whose skill has `target.los === false` now reads "fizzles if
  out of range." instead of "out of range or sight" (execution never checked sight for them). One line, commented
  `[core fix, bosses-act1 review]`; regression test in "bosses_act1: telegraphs tell the truth" (Garnish Wages vs the
  plain Levy). Also fixes the text of the DM's secret roll and the act 1/2 enemies with `los: false` tracking shots.

## Requests

- **RULES / run tests**: `tests/run_tests.js` "run: boss unlocks" registers a stub `grimble` enemy and never restores it
  (its sandbox swaps `heroes, skills, items, consumables, encounters, events, statuses, passives` but not `enemies`),
  so every later suite in a full run fights a skill-less Grimble and the registry logs `duplicate id "grimble"`. My test
  file puts the real def back before each of my suites; please add `'enemies'` to its `SWAP` list. **[Resolved at integration — see docs/notes/content-digest.md.]**
- **Lead / balance**: real heroes at level 4 (no items/passives yet) beat the Act 1 bosses 88-100% of the time under
  AutoPlay with ~0.5-1 downs a fight, while the fixture party (the contract's yardstick) wins ~35% (Grimble) and ~68%
  (Rat King). Act 2/3 report the same gap (Lich 94%, Iris 88%, DM 80-89% for real parties). If real parties should find
  the bosses harder, scale them with one shared knob rather than per boss.

## Known issues

- The win rate swings ±7-15% between 48-fight samples (AutoPlay is chaotic: deployment order and the random pool skill
  change everything; Grimble read 46%, 29% and 33% on three seed batches); the 8-fight test guard is deliberately loose.
- AutoPlay only pulls the last loophole when Grimble (and no hero) is in the DROP ZONE and walks to the levers only when
  nothing better is in reach, so it averages ~1 drop per fight; a human can line up two.
- Every planning move through a channel logs "The Rat King is Wet." (the core's water `onEnter`; deployment re-plans are
  muted, so it is one line per water tile entered).
- The Rat King's custom painter draws the robe hem as a flat white band; it reads fine at zoom 1, a little flat in the
  gallery's big view.
- The vault door hangs above the north-east corner of the DROP ZONE (next to the vault) rather than its centre; the
  stripes, red X's, the DM line and the zone's desc carry where it lands.

## Review (adversarial pass after the author)

Verified by running code (probes in `.tmp/bosses-act1-review/probe.js`, scenes in `scene.js`, screenshots there), then
fixed, most severe first:

1. **The flush could silently fail.** A downed hero (or a flyer, or an immovable summon) lying in the channel between the
   King and the drain stopped the push: the King took 2 bump damage, was not stunned or flushed, and the valve still
   went on its 3-round cooldown. A downed hero in the water is exactly what a Rat Pile leaves behind, so the puzzle's
   payoff vanished in a natural situation. Now the water carries everyone past what it can't move (see Deviations);
   lawyers stuck behind the same body drown too.
2. **Telegraphs lied about the King's signature combo.** The Rat Pile always showed 12 although a Rooted hero takes the
   buried number, and the reeled-in hero's "Will be hit by" listed only Tangled Tails (8) while the tails + buried pile
   hit for 26 (34+ with Swelling Ranks): a full-HP squishy hero went down from a turn the HUD called safe. Now the pile
   shows the buried number while a Rooted hero stands in it, and the tails' number includes the whole pile hit when the
   pull would drop the hero in it (pure prediction of the pull; a valve in the way, a hero 5 tiles out, Marwyn-style
   shortened pulls all read the plain number). Grimble's Red Tape after a Levy that crossed a 10-gold step hit 1 harder
   than shown: the Levy is now planned last.
3. **No stun guard.** Lich, Dr. Iris and the DM all shrug off a second stun; the Act 1 bosses could be stun-locked by a
   stun-heavy party (Marbles, Marwyn, Slate and Sparrow all stun, cooldown 2-3 each). Added Appeal Pending /
   Recess (stun, sleep, freeze, charm guarded until the end of the next round, shown as a status, codex mentions it);
   the vault and the flush always land.
4. **A killing blow triggered the splits**: the King split into lawyers, announced phase 3 and narrated a split on the
   way to 0 HP (and previews of a killing blow listed lawyers spawning). Splits now need HP left.
5. **Refunds were income**: in a run, `DD.Act.gainGold` adds the party's passive gold bonus (Trust Fund +10-20% per
   hero), so getting your stolen gold back paid interest. Refunds now go back raw.
6. **HUD text**: Garnish Wages ("no line of sight needed") was described as "fizzles if out of range or sight" (core fix
   above). Sewer Surge's desc now states what the drain does (25% max HP, his own rats drown).
7. **AutoPlay wasted the last loophole on interns** (hint 8 per intern in the zone with Grimble elsewhere, starting a
   3-5 round review): it now waits for the taxman.
8. **Log noise**: "The Rat King is Swelling Ranks (3).", "...is Court in Session (2).", "Grimble is Ill-Gotten Gains
   (20).", "Grimble is Hostile Takeover." are silent now; the swarm and the Levy log what they mean instead.
9. **Rebalance for the honest telegraphs**: AutoPlay had been walking into the hidden combo, so honest numbers took the
   fixture party from 65% to 85% wins against the King. Restored inside the DESIGN §5 bands: HP 180 → 200, gavel
   11 → 12, buried pile 18 → 22 (big-telegraph band; telegraphed now). Fixture 67-69%, puzzle-ignored 4-6%.
10. **Sprite**: the King's rats read as grey blobs with big pink polka dots (the front ears); smaller, darker ears,
    a lighter snout and beady red eyes with a dark rim make the pile read as rats at zoom 1 and in the gallery.

Checked and fine: registry (no warnings), every desc with `user = null`, no `Math.random` in logic (names/lines use
the cosmetic `DD.rng`), charmed / silenced / taunted / dazzled / confused / sheep / sleep / frozen / rooted / slowed /
hasted bosses and minions run 4 rounds without warnings, previews match reality (fire weakness, pushes, splits),
phases land (banner, narration, bark, new patterns), minion caps, no timeouts in the 448 normal sims (one 30-round
timeout in 96 sims where AutoPlay was told to ignore the sluices). New suites (4, 58 assertions): stun guard,
unblockable flush + no death split, honest telegraphs (incl. the core describe fix), raw refunds + loophole hint +
quiet logs; each fails against the author's version.
