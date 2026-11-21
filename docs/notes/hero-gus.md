# HERO-GUS — Phat Gus the Unfathomable, the 20th hero (h19)

Owner: HERO-GUS (`h19:hero-gus`). Spec: `.tmp/h19/addendum-gus.md` (normative for his content); plan `.tmp/h19/plan.md`
(§0.2 D1-D14, §1.4); the user's words: `.tmp/h19/request.md` (they win over everything). Phat Gus is he/him and, Nov 18,
an actual squirrel: an animal like Pebbles and Benedick, never a squirrel-person; never called a druid; russet with an
acorn-cap beanie; he doesn't climb; the size jokes are his own and "fat" is his word only.

## Files and run commands
- `js/data/heroes/gus.js` — the hero, 11 skills (`gus_*`), status `gus_cheeks`, 3 hero items, 3 loading tips, the
  sprite and six FX painters, test / debug API `DD.Gus`.
- `tests/content/hero_gus.js` — 26 suites `hero_gus: …` (the addendum's 23, the AutoPlay suite split in two, and the
  review's two: `review (h19)` and the `zz rules watcher`, sim=1 only; see "Review (h19)" below).
- this file.
- Iterate: `bash tools/test.sh "suite=hero_gus&isolate=heroes/gus,hero_gus"` (the combo suite skips the cast that isn't
  loaded; with `heroes/buga` it also checks Delegate). Full: `bash tools/test.sh`.
- zz sim: `bash tools/test.sh "suite=hero_gus: zz&sim=1&n=3&verbose=1"` (real random parties, act 1-3 fights).
- Sanity sims (seed block 82000 + 100·k): `bash tools/sim.sh "debug=1&raw=1&seeds=30&from=<S>&stop=2&party=gus,betty,kiri,josiah"`
  (then `syllamin` in Kiri's seat).
- Scratch pictures (not shipped): `.tmp/h19/gus/` — `sheet.js` (cheeks 0-4, poses, the six painters; `run.sh` +
  `probe.html`, sourcing `tools/chrome_slot.sh`) and `scene.js` (the CHOMP + whisper, the BONK, Don't Listen, the
  Hollow, the signature on the real combat screen), plus combat shots at rot 0 / 90 / 200.

## Summary and the user's brief
The user (Nov 18): *"And Phat Gus, a fat squirrel with weird eldritch forest powers who eats food"*; pronouns "He/him".
A very round, very mellow squirrel with a direct line to something ancient and hungry in the deep woods, which he mostly
uses to get snacks. Acorns fall into his cheeks from a tree that isn't there; every one he eats lets the woods whisper,
bite and stare through him. He stress-eats when monsters get close and does not share (usually). Role: eldritch control
that runs on acorns. 30 HP (+4 a level; 42 at level 4), AP 3, move 4, armor 0, init +2, complexity ★★, colour `#a05a9c`,
`pronoun: 'he'`, `flags: {}` (no hop, not immovable, no pocket slot), `unlock: null`.

## Kit table (level-by-level texts, as `DD.skillDesc(def, level, null)` prints them)
| id | name | AP / cd | I | II | III |
|---|---|---|---|---|---|
| `gus_incisor` (basic) | Incisor Decision 😬 | 1 / 0 | Deal 5 damage to an adjacent foe (7 if it is Confused). | — | — |
| `gus_whispers` (starter, spell) | Don't Listen to the Trees 🍂 | 2 / 2 | Eat an acorn: the trees whisper to every foe within 2 of you: 4 psychic damage, and each is Confused for 1 turn. | … within 2 …: 5 psychic … | … within 3 …: 6 psychic … |
| `gus_root_canal` (starter) | Root Canal 🦷 | 1 / 1 | Eat an acorn: roots burst up under a foe within 4 (no sight needed): 5 damage, and it is Weakened for 1 turn. | … within 5 …: 6 damage … 1 turn. | … within 5 …: 8 damage … 2 turns. |
| `gus_hollow` | The Hollow Hungers 👄 | 2 / 2 | Eat 2 acorns: the floor under a foe within 3 opens and bites: 12 damage, and it is Rooted for 1 turn. | … 15 … | … 18 … |
| `gus_binge` | All You Can Eat 🍽️ | 2 / 2 | Eat every acorn in your cheeks (at least 1): each foe next to you takes 3 psychic damage per acorn eaten. | … 4 psychic … | … each foe within 2 of you takes 4 psychic … |
| `gus_hole` (move) | Down the Squirrel Hole 🕳️ | 1 / 2, 2, 1 | Eat an acorn: tunnel to an empty tile within 4 (no sight needed). Foes next to the tile you left are Confused for 1 turn. | … within 5 … | … within 5 … |
| `gus_eyes` (spell) | Too Many Eyes 👁️ | 1 / 1 | Eat an acorn: eyes open in the bark around a tile within 5. Each foe on or next to it is Marked 3 (the next damage it takes is +3). | … Marked 4 (… +4). | … Marked 5 (… +5). |
| `gus_tree` | The Tree That Isn't There 🌳 | 2 / 2 | Acorns rain on every foe on or next to a tile within 4: 4 damage each. One lands in your cheeks if there's room (+1 acorn). | … 5 damage … | … 6 damage … |
| `gus_hangry` (buff) | Hangry 😠 | 0 / 3, 2, 2 | Only with empty cheeks: you are Empowered (your next damaging skill deals +50% damage). | (cd 2) | … +50% damage) and Inspired until the end of this turn (+25% damage). |
| `gus_have_one` (buff) | Fine, Have One 🎁 | 1 / 3, 3, 2 | Give an ally next to you one of your acorns (reluctantly): it is Hasted for its next turn (+1 AP). | Give an ally within 2 … | Give an ally within 3 … |
| `gus_acorn` (signature, 100 Hype) | The Acorn That Should Not Be ☄️ | 2 / 0 | A colossal acorn with far too many eyes drops on a tile within 5 (no sight needed): every foe within 2 of it takes 16 damage and is Confused for 1 turn. Then your cheeks fill up. | — | — |

Every "within N" target range prints `DD.Targeting.reach` (a +range item shows). All You Can Eat appends
` (now: N acorns, M each)` in a fight (the user a unit of the fight). Status: `gus_cheeks` "Cheekful of Acorns" 🌰, a
dispellable buff, stacks = acorns, `showStacks: true` (one acorn reads "1"; H19-SEATS landed it), tooltip
`Cheeks: 2 / 3 acorns. Skills that say Eat eat them; another falls in at the start of each of his turns.` (at the cap
the tail reads `full: the next one bonks off his head, wasted. Eat one first.`)

## The acorn loop and its hooks
- Truth: the `gus_cheeks` stacks (no status at 0), always written through `setCheeks` (clamped to `capOf`: 3, 4 with
  Cheeks of Holding; silent; `st.data.cap` for the tooltip). Bookkeeping `unit.data.gus = { stress, meal }` per fight.
- Passive *The Woods Provide* hooks (all on the known list): `onCombatStart` (1 acorn, 2 with Cheeks of Holding; the
  optional snack-bowl bark), `onTurnStart` (the drop: +1, stunned / asleep / a sheep too; at the cap the BONK, the log line
  `An acorn bonks Phat Gus on the head. His cheeks are full, so it rolls away.` and the `bonk` bark at 40%),
  `onCostPaid` (a paid use of his eating skill eats `L.acorns`, every acorn for All You Can Eat; Fine, Have One spends one
  without eating: `p.gusAte = 0`), `onSkillUsed` (after a paid meal: stress eating, then the Nomicon), the pure
  `modifyOpportunity` (Incisor's +2 on a Confused walker) and `onStatusRemoved` (a dispel confiscates: FX + bark).
- An object hit still eats (it was paid); an Echo Chamber echo eats nothing (unpaid; All You Can Eat's echo repeats the
  last meal, `mealOf`); previews and AutoPlay dry runs pay on the copy; attacks of opportunity and Delegate never eat (no
  eater is a basic); consumables are ignored (`p.consumable`): the party's pockets never change (the suite plays three turns
  of every eater with two Buckets of Ice Water in the pockets).
- Refusals, word for word: `Needs 1 acorn (his cheeks hold 0).` / `Needs 2 acorns (his cheeks hold 1).` /
  `Nothing to eat: his cheeks are empty.` / `Nobody close enough to watch.` / `Needs an acorn to share (his cheeks hold 0).` /
  `Not hangry yet: his cheeks aren't empty.` / `Rooted. Even the roots won't take you.` / `The woods won't put you there.` /
  `They can't chew right now.` / `Already Hasted.` Outside a fight every canUse says yes (party select, the codex).
- The eat moment (cosmetic, skipped while simulating): `CHOMP!` / `CHOMP CHOMP!` / `CHOMP CHOMP CHOMP!`, crumbs, `hit` at
  0.6, a whisper from the woods (`U.line(WHISPERS, DD.rng)`, FX text with `life: 1500`), the cheek shrinking on the beat,
  the log line `Phat Gus eats an acorn. Something in the woods is pleased.` (`… eats 3 acorns. … VERY pleased.`).

## Stress eating (the D9 statement)
His ONE conditional heal (Nov 18): after a paid eating skill resolved, once per turn (`d.stress === state.turn`), if an
active foe by effective side stands next to him, `DD.Act.heal(u, u, stressOf(u), { via: 'lift:gus' })` after an
`active()` check — 3, or 5 with the Winter Coat (Built In) (`tests/sim/sim.js` `WORN['lift:gus'] = 'gus_winter_coat'`).
- Grows out of eating; heals only Gus; needs him active and a living foe in his face; a charmed foe is on loan (no), an
  enemy minion counts (yes); objects never count.
- Checked after the skill: tunnelling into a crowd heals, out of one doesn't (never Kiri's heal-on-leaving); a skill that
  kills the only foe next to him heals nothing (never Betty's heal on a kill, an object or a death). An eater aimed at a
  crate still eats (the acorn is the cost) but nothing rides on an object hit (DESIGN D4): no stress eating, even with
  a foe next to him, and the turn's stress eating stays unused (h19 qa-fix:content, Nov 20; it healed 3 before).
- "Once per turn" is the heal itself (fix:polish, Nov 21; the addendum's text): the call is made on every paid meal with a
  foe next to him until one restores HP (`d.stress = state.turn` is set only when `healed > 0`). A meal at full HP is a
  0-HP call that leaves the turn's stress eating for a later meal that turn, once he is hurt; at 29 of 30 the call heals 1
  and that was the turn's heal. The passive text and tip 2 say it as the addendum did: "once per turn, if a foe is next
  to him after he eats, he heals 3 HP" / "…once a turn". (qa-fix:content, Nov 20, had kept the old code and changed the
  text to "the first time each turn"; the lead asked for code and text to agree on the addendum's words.)
- Never a button (no skill changes his HP with no foe next to him: the suite uses all 11), never an HP-threshold read (the
  same call at 1 HP and at 29; at full HP a 0-HP call), never a revive or a cleanse, never a combat-start shield (combat
  start gives an acorn, no HP, no Block; his kit has no Block at all). Fine, Have One, the signature's refill, the drop,
  The Tree, Hangry and the basic never heal. The healers of others stay Ellaria, Josiah and Valdris; Ellaria untouched.

## Items
- **The Nom-Nom-Nomicon** (legendary weapon 📖, `{ dmg: 0.1 }`): after an eating skill, the nearest awake foe within 3 (no
  sight needed; ties by HP + Block, then position) takes 2 psychic damage per acorn eaten (`cause: 'other'`: it never
  spends Hangry's Empowered). After the skill's own hit, once per use, never a sleeper, never on an echo, never on an object
  hit, never on Fine, Have One or The Tree.
- **Cheeks of Holding** (rare trinket 👝): cheeks hold 4, he starts each fight with 2 (a fifth cheek size on the sprite).
- **Winter Coat (Built In)** (rare armor 🧥, `{ hp: 5 }`): stress eating heals 2 more (5 in all).

## AutoPlay hooks and known gaps
- Every eater: `autoplayValue: eatValue` = −`priceOf(u, acorns)` and `aiScore: stressQuick` (quick pass only:
  `healWorth(u, stressOf(u))` when a foe would be next to him after it — the Hole reads its landing tile; the exact pass
  dry-runs the real heal). `priceOf`: `ACORN_VALUE` 3 an acorn, 1 for one the next drop would bonk anyway (full cheeks) and
  1 each against the last foe standing (see Deviations). `gainWorth`: 3, the last slot 1.5.
- All You Can Eat: + `0.8 × L.per × acorns × foes within L.r` (quick). Incisor: + `0.9 × L.mad` on a Confused target
  (quick). The Tree: `treeValue` = `gainWorth(u, 1)` − 1.5 on the exact pass when a stack is really gained (the engine
  already counts the chip's new stack as a buff). Fine, Have One: `shareValue` = `min(8, 0.6 × the ally's best ready hit)`
  − `priceOf(u, 1)`; 0 on an ally that can't act next turn. Signature: `0.5 × gainWorth(u, cap − cheeks)`.
- Known gaps (humans beat the sim here): AutoPlay doesn't save an acorn on purpose for a two-acorn turn; it values
  Confused modestly (the engine's 1.5 + the danger model's 0.6), so Don't Listen to the Trees is used ~0.4 times a fight
  and foes Confused a fight read ~0.6 in the zz sim (T10's report target is 2: the balance pass's knob "Don't Listen +1
  damage" is the addendum's lever); Hangry fires ~0.15 times a fight (he rarely empties his cheeks with AP left).

## Sprite and painters
`GUS_SPRITE` = `{ base: 'custom', look: 'gus', height 38, width 38, headY −27, portrait { x 7, y −25, r 13 }, draw:
drawGus, underlay: woodsMurk }` (no new sprite option). A round russet squirrel on his haunches: the ball body with a
cream belly, hind feet, an emergency acorn in his paws (lifted and glowing chartreuse in `cast`), the head with a muzzle,
buck teeth (open mouth in `attack`), whiskers that twitch, tufted ears, the acorn-cap beanie (his only garment; tumbled
beside him when he is down), the cheeks as the meter (`2.4 + 1.55 × n`, n = `shownCheeks`, an acorn cap in the mouth
corner at the cap), the eye with a chartreuse pin (wrong-coloured while casting; `>` when hurt; a lid when blinking), a
bushy S tail (a tube of 15 circles) with three eyes in the fur (open in `attack` / `cast` and on a creepy idle cycle, one
left open when he's down), three dark leaves drifting UP behind him, and the underlay: a green-violet murk pool, a
pulsing chartreuse rim, root tendrils and three tiny eyes blinking in it (`still`: the pool only). Billboard: only the
facing mirrors; nothing depends on the yaw. The cheek count shown is pinned to FX playback (`unit.vis.gusCheeks`, a
WeakMap counter, read only while `DD.FX.busy()`), so the cheek shrinks on the CHOMP and grows when the dropped acorn lands.
Painters (`FX.custom('custom', …)`, skipped while simulating; ground shapes are circles or on `view.local` axes):
`drawRoots` (Root Canal, 700 ms), `drawMouth` (The Hollow Hungers, 850 ms), `drawHole` (Down the Squirrel Hole, 1100 ms
at the old tile), `drawEye` (Too Many Eyes, 900 ms over each Marked foe), `drawTree` (The Tree That Isn't There, 900 ms)
and `drawGiantAcorn` (the signature, 1400 ms after the banner); the drop is a `rock` projectile from above.

## Barks and custom keys
13 standard keys (3-6 lines; idle 6, party-filtered: Betty, Mayor Buga, Pebbles, Benedick, Ellaria), `swap` (3, with
`{ally}`, naming no hero) and the custom keys `eat` (20%, never on the same meal as `stress`: decided after the skill),
`stress` (40%), `bonk` (40%), `hangry`, `binge`, `share`, `burp` (always), `hole` (50%), `whisper` (30%), `confiscated`
(always), `snackbowl` (50%, at combat start when the act-3 DM's Snack Bowl is on the board). Every bubble ≤ 70 characters
(the longest 66). No line names another new hero or another hero's construct (D11); no she/her; no act-4 word; never "druid"; no
sentence calls his Confused or Haste "the only" / "the first" (D7). The woods whisper in lowercase and name nobody.
Tips (3): the acorn supply, stress eating, Confused foes and the 7-damage bite.

## Tests
`tests/content/hero_gus.js` (24 suites): definition (names unique against every hero-side / item / consumable / Blessing /
scar / status / enemy name, the Radio Edit chip ≤ 90 — the longest 80, The Tree's 77 —, L4 HP 42, no generic skill's
icon), the acorn supply, eating, stress eating (the D9 guard), Incisor (attack-of-opportunity estimates read 7 through
`o.flat`), every pool skill at every level, the signature, items, HUD previews (every skill × level × 0-4 acorns, a foe next
to him or not, the Nomicon on: 4,000+ assertions), v2 edge cases, attacks of opportunity (Delegate when Mayor Buga is
loaded), AutoPlay prices and choices, AutoPlay fixture battles (acorns, bonks, a stress heal, bit-identical replays),
sprite and painters (every pose × cheeks 0-4, five yaws, the pin), combos (Betty, Marwyn, Ellaria's corgi when loaded) and
the zz sim (`sim=1`).

Measured (final code):
- Sanity sims, 30 seeds, `stop=2`: Kiri's party (82200) `lift:gus` 0.95 fires and 2.8 HP a fight (0 errors, 0 DD.warn,
  0 stalls); Syllamin's (82300) 0.96 fires, 2.6 HP. Earlier pages before the last-foe pricing: 82000 1.03 / 2.7 HP,
  82100 1.06 / 3.0 HP. T8n (≥ 0.8 fires, 2.4-9 HP): met on every page.
- zz sim (`n=3`, 102 fights): acorns eaten 4.25 a fight (≥ 3), bonks 0.62 (≤ 0.8), stress 0.81 fires / 2.2 HP (these are
  single fights at act levels, not a campaign), foes Confused 0.63 (T10 report: 2), wins 99 / 102.
- Fixture battles: 29 acorns in 10 fights of 2-7 rounds (0.75+ an acorn a turn of his), bonks 0.3 a fight, 10 / 10 wins.
- Isolated (`isolate=heroes/gus,hero_gus`): 24 suites, 4,833 assertions, 0 failures. Full run (Nov 19, Rasma and Biz
  registered): PASS, 1,389 suites, 177,223 assertions, 0 failures, 0 swallowed "Error in"; `kit: registry` green with
  Hangry's 😠; the attacks-of-opportunity suite checks Delegate (Mayor Buga loaded). The one content advisory naming
  him is the soft "gus_binge dealt a base 6 / 8" note (Deviation 9).

## Deviations
1. **Passive text**: `passive.desc` is a string with the base numbers (3 / 1 / 3), not a function of the user: hero
   passives are printed as strings by party select, the Hall, the party sheet and the HUD tooltips (`esc(d.passive.desc)`).
   The live numbers show in the chip tooltip (`/ 4`), the items' texts and `DD.Gus.passiveDesc(user)` (tested).
2. **The signature's barks**: `Combat.useSkill` already barks `signature` for every signature, so its execute barks only
   `burp` (after the refill), not a second `signature`.
3. **An object hit** (rewritten by h19 qa-fix:content, Nov 20, finding `gus-crate-stress-heal`): the eater still eats
   (the acorn is the cost, like AP), but nothing rides on the hit (DESIGN D4, the plan's standing rule "nothing rides on
   an object hit", which rank above the addendum): no stress eating and no Nomicon, and the turn's stress eating stays
   unused. The addendum §6 exception ("an eater aimed at a crate heals if a foe stands next to him") is dropped: the
   tooltip's own 🔨 line says "for N damage and nothing else" and the hint showed "💚 you heal 3" right under it.
   Tested (suite 4: no heal, still eats, the preview agrees, the next eat at a foe that turn heals).
4. **`priceOf` against the last foe** (sanity pass, the plan's "fix eatValue / priceOf first"): with one foe left standing
   (summons aside) an acorn is priced 1, like one the next drop would bonk: acorns never cross fights. Before it AutoPlay
   hoarded in short fights (2.9 acorns a fixture fight); the T8n reading stayed in band (0.95-0.96 fires, 2.6-2.8 HP).
5. **The fixture-battle threshold**: the suite asserts ≥ 0.75 acorns eaten per turn of his (fixture fights last 2-3
   rounds, so at most ~3-4 acorns ever fall); the campaign's "≥ 3 a fight" is read by the zz sim (4.25) and the sanity sims
   (~3.8 from the skill-usage table).
6. **Hangry's icon** is 😠, not the addendum's 😤: that is Come At Me, Bro's, and `kit: registry` forbids a hero skill
   wearing a generic skill's icon (they share the action bar).
7. **The `eat` bark** is rolled after the skill (so it never plays on the same meal as `stress`), not at the CHOMP.
8. **The whisper** floats with `life: 1500` (the visual), not `ms: 1500` (which would hold FX playback for 1.5 s an eat).
9. **All You Can Eat** deals one hit of `L.per × acorns` to each foe (the addendum's formula, so armor counts once): the
   generic content suite logs a soft advisory "gus_binge L1-L3 dealt a base 6 / 8" (its arena gives him 2 acorns). Not a
   failure; another h19 kit's skill shows the same kind of note.
10. **The tail**: one bushy tube of 15 overlapping circles along an S (control points at x −24) with fur tufts, instead of
    five blobs: five read as a stack of balls at board scale.
11. **The suite's D11 pin** spells the four names in its own regex (the check itself); no content line names them.
12. **Fine, Have One's icon** is 🎁 (a gift: "one of your acorns, reluctantly"), not the addendum's 🤲 (review:phat-gus,
    Nov 19). request.md wins over the addendum: he is an actual squirrel who holds things in his paws, cheeks or mouth,
    "never hands", and 🤲 is a pair of human hands (and the Ambidextrous Blessing's icon). 🎁 is worn by no skill, item,
    consumable, status or Blessing. Suite 1 now checks that no skill of his shows a hand emoji.

No DESIGN §6 brief block: the build matches the brief the contract pasted (numbers, texts, the Sustain line).

## Requests
| To | What | Why |
|---|---|---|
| h19 integrator (`tests/content/integration.js`) | `ALL += 'gus'` (he: no `SHE` entry); empty `PENDING_HEROES` once all three register | the pronoun sweep and the event check read the real file |
| h19 integrator (`tests/content/shared.js`) | `REAL += 'gus'` | the whole-pool AutoPlay, previews-with-item-hooks, Whetstone / Encore Kazoo suites ride on his kit |
| h19 integrator (`tests/sim/sim.js`) | nothing: `WORN['lift:gus'] = 'gus_winter_coat'` is already there; no protected-skill tag | — |
| h19 integrator (`tests/content/kit.js`) | nothing: no `target.objects: false` skill (Root Canal and The Hollow Hungers are object-aimable) | D1 |
| h19 integrator (README) | "pick 4 of 20"; "Phat Gus (a very round squirrel who eats acorns to cast)"; no act-4 word | addendum §18 |
| review:phat-gus | the scratch scenes in `.tmp/h19/gus/` (`sheet_yaw0.png`, `sheet_yaw37.png`, `scene_*.png`, `combat_rot*.png`) | painters at every yaw are also covered by the suite |
| balance (`h19:balance`) | if T10's "foes Confused ≥ 2" matters: the addendum's weak knob "Don't Listen +1 damage" (AutoPlay uses it ~0.4 times a fight); the knob lists are unchanged | report only |
| deferred (D9) | a generic HUD cost badge (`🌰1` / `🌰2` / `🌰all`) and a procedural `chomp` sound | fallbacks shipped: every eater's desc starts with its price, the ⛔ names the shortfall; `hit` at 0.6 |
| content suite owner (optional) | the "dealt a base" advisory could accept multiples of a `per` key | cosmetic |

## Public API
`DD.Gus = { HERO, CHEEKS, CAP, START, HOLD_CAP, HOLD_START, STRESS_HEAL, COAT_HEAL, NOMICON_DMG, NOMICON_RANGE, ACORN_VALUE,
GUS_SPRITE, WHISPERS, PASSIVE, cheeks(u), capOf(u), startOf(u), stressOf(u), setCheeks(u, n), drop(u), canEat(n, text),
mealOf(u, skillId), stressEat(u), nomiconTarget(u), priceOf(u, n), gainWorth(u, n), eatValue(ctx), stressQuick(ctx),
shareValue(ctx), treeValue(ctx), incisorQuick(ctx), bingeQuick(ctx), shownCheeks(o), passiveDesc(user),
adjacentFoesAt(u, at), painters: { drawGus, woodsMurk, drawRoots, drawMouth, drawHole, drawEye, drawTree,
drawGiantAcorn } }`. Skill def flags read by his passive: `eatsAll` (All You Can Eat), `shares` (Fine, Have One); level
key `acorns`. The paid record carries `p.gusAte` (also `ctx.paid.gusAte` in execute and `onSkillUsed`).

## Review (h19)
`review:phat-gus`, Nov 19 (plan §1.5). I assumed the kit was wrong until a run said otherwise. I read gus.js line by
line against the addendum, request.md (with the user's Nov 18 answers) and plan D1-D14, and checked every lens point by
running code. The scratch pages are in `.tmp/h19/review-gus/`: `scene.js` / `sheet.js` / `run.sh` (they source
`tools/chrome_slot.sh`), the `mut/` pages, the sims and the PNGs.

**Verdict: no logic defect in `js/data/heroes/gus.js`.** Its one change is cosmetic: Fine, Have One's icon (Deviation
12). The review fixed the suite. Two rules had no test that could fail: a scratch mutant of each passed the owner's suite
untouched. The real Echo Chamber path, the HUD's ⛔ lines and a rules watcher over AutoPlay battles are now tested too.

What was checked, and how:
- **Desc == execute, every skill at every level, cheeks 0-4**: suite 17 (previews against real hits) re-read, and the
  refusals word for word in code and on the real HUD buttons (`DD.HUD`, the same path as a click). At 0 acorns Root
  Canal is greyed with `⛔ Needs 1 acorn (his cheeks hold 0).` and Hangry lights up. At 1 the Hollow says
  `⛔ Needs 2 acorns (his cheeks hold 1).` and Hangry says `⛔ Not hangry yet: his cheeks aren't empty.` The chip prints
  "1" for one acorn (`showStacks`). The range numbers in the descs come from `DD.Targeting.reach`, which reads the same
  `Targeting.range` the targeting uses, so a +range item moves both.
- **The acorn loop**: a rules watcher (new suite 25, sim=1) wraps every real paid use of his and every `DD.Act.heal`
  while AutoPlay plays real act 1-3 encounters with shipped parties (Betty, Syllamin, Josiah · Corelos, Slate, Hjalmar ·
  Kiri, Marwyn, Ellaria), with his items rotated.
  - Per use: the cheeks move by exactly the price (the Tree +1, the signature to the cap), never past the cap, and the
    party's pockets never change.
  - Per turn start: +1, or the BONK at the cap. A Rules Lawyer dispel off his turn resets the count, as the
    confiscation rule says.
  - Per heal: `lift:gus` only on himself, only with a foe next to him at that moment, at most once a turn, asking
    `stressOf`; no other heal comes from his kit; a meal with a foe next to him and no heal yet this turn always heals.
  - Result: 0 broken rules in 24 battles (and 48 more in the review probe, two of them with a dispel), 0 warnings.
- **Echo Chamber through its own `onSkillUsed`** (new suite 24; the owner's test called `resolveSkill` by hand): at
  100% on every eater, Fine, Have One and the Tree, levels I and III, with the Nomicon on. Each use is paid once, the
  echo eats nothing, there is at most one stress heal, and the HUD preview equals the real outcome (HP, KOs, moves, Hype).
- **Cross-hero harness fights**: suite 24 now has Syllamin's Lullaby (a sleeper next to him still counts as a foe in his
  face; the Nomicon skips it and reads to the nearest awake foe) and Heckle (a charmed foe is on loan: no heal). A
  scratch probe also played the shared Confuse; it is not kept, because D11 keeps the other new heroes out of his files:
  - the construct monkey's Cymbal Crash, then his bite for 7 on his turn. This only works when that hero acts between
    the foe's turn and his, because Confused covers exactly the foe's next turn;
  - Fine, Have One on the spider construct gave it +1 AP on its owner's next turn;
  - the two constructs next to him are allies (no stress heal).
- **Previews, estimates, dry runs**: the attack-of-opportunity estimate reads 7 through `o.flat` (suite 5, re-run).
  Previews and AutoPlay dry runs pay on the copy: `Targeting.simulate` swaps `FX.push`, and his `pin` and whispers return
  while simulating. The exact pass prices the chip like the engine (`statusGain` gives 1.5 for a gained stack), so
  `treeValue`'s −1.5 on the exact pass is right.
- **The D9 guard**: re-read in code and in suite 4, plus the new distance rule (fix 1 below). Nothing in the engine or
  content removes his buff except OVERRULED! (`Act.cleanse(f, 'buff')`, act 3); every ally cleanse is `'debuff'` only;
  no `modifyStatus` hook anywhere cancels a hero buff, so the chip is never blocked.
- **Pronouns, tone, distinctness**: he/him everywhere, no she/her; the woods lowercase and nameless; no gore; "fat" only
  in his own item's joke; never a druid; no act-4 word; D7 holds (no "only" or "first" Confuse or Haste). D11 holds: the
  other new heroes are named in his files only by the D11 check's own regex and one measurement line in these notes. Not
  Betty (no heal on a kill, an object or a death), not Ellaria, not Basanos or Benedick (no transform).
- **D12 / ownership**: `git diff --stat` of `js/data/heroes`, `tests/content/hero_*.js` and `docs/notes/hero-*.md` is
  empty for the 17 shipped heroes. Every other modified file that mentions him falls under the contract's, the voice
  owner's or the seats owner's grants.
- **Painters**: shots at rot 0 / 90 / 200 of the plan's party (Betty, Kiri, Josiah); the CHOMP (with a whisper and the
  roots); the BONK with "(cheeks full)" and the log line; Don't Listen to the Trees; the Hollow; the signature before and
  after the impact; and the sheet (cheeks 0-4, every pose, the six painters) at yaw 90 and 200. I read every PNG: the
  cheeks read 0-4, the chip prints 1-3, and nothing draws off its tile at any yaw.

**Fixes**. Fixes 1 and 2 are proven by scratch mutants run through `.tmp/h19/review-gus/mut/`: each mutant replaces
gus.js in a scratch test page, so the real file was never mutated.
1. Suite 4: a foe on the diagonal (distance 2) and one two tiles away are not "next to him": no heal. The mutant
   "stress eating reaches distance 2" passed the owner's suite (4,833 assertions, 0 failures) and fails the reviewed one.
2. Suite 16: the Nomicon reads to a foe 3 tiles away, never 4. The mutant "Nomicon reach + 1" passed the owner's suite
   and fails the reviewed one. (The constant `NOMICON_RANGE` itself was caught only through the item's desc text.)
3. Suite 24 (new, always on): Echo Chamber's real path, Syllamin's sleeper and charm, the HUD's ⛔ lines and the chip.
4. Suite 25 (new, sim=1 only): the rules watcher above.
5. gus.js, cosmetic: Fine, Have One's icon 🤲 → 🎁 (Deviation 12), with a "no hands on his buttons" check in suite 1.

The constant mutant `STRESS_HEAL = 4` gives 22 failures in 6 suites (caught).

Runs after the review: isolated (`isolate=heroes/gus,hero_gus`) 26 suites, 4,846 assertions, 0 failures; the new
suites with every file loaded (`suite=hero_gus: review`) 332 assertions; the full `bash tools/test.sh` PASS, 1,393
suites, 177,689 assertions, 0 failures, 0 swallowed "Error in".

**Numbers**: forced-party sims, 30 seeds each, `stop=2`, the reviewer's block 85000 + 100·k. Every page had 0 errors,
0 DD.warn lines and 0 stalls.

| seeds | party (with him) | runs won | `lift:gus` per fight | worn Winter Coat | his uses a fight (socketed) |
|---|---|---|---|---|---|
| 85000 | Betty, Syllamin, Josiah | 27/30 | 1.18 fires, 3.2 HP (others 0) | 14 fights: 2.36 fires, 11 HP | Root Canal 2.6, Don't Listen 0.5, signature 0.1 |
| 85100 | the h19 summoner, Corelos, Slate (no healer) | 24/30 | 0.98 fires, 2.8 HP | 12 fights: 1.75 fires, 8.3 HP | Root Canal 2.6, Don't Listen 0.4, signature 0 |
| 85200 | Corelos, Slate, Hjalmar (T_B) | 3/30 (act 1 cleared 11) | 0.95 fires, 2.7 HP | 7 fights: 1.43 fires, 7.1 HP | Root Canal 2.5, Don't Listen 0.5, signature 0.1 |
| 85200 | Betty in his seat (paired reference) | 8/30 (act 1 cleared 16) | — | — | — |

T8n (≥ 0.8 fires and 2.4-9 HP a fight) holds on all three pages. The rules watcher (sim=1, 24 battles) reads acorns
eaten 3.3-4.9 a fight, bonks 0.5-1.0 and `lift:gus` 0.13-1.5 fires; it is lowest with Ellaria and Kiri, whose heals keep
him topped up and back from melee.

**Passed on** (not mine to change: numbers belong to `h19:balance`, plan D10):
- Healer-less T_B: 3/30 against Betty's 8/30 on the same seeds; act 1 cleared 11 vs 16, and he goes down more (0.45
  downs a fight vs 0.35). n = 30 is far too small for T5n, but it is the party shape the auditor is told to watch ("Gus
  with no melee partner"). If the 100-seed forced reading agrees, the weak knobs come first in his list (start with 2
  acorns, then stress heal 3 → 4).
- AutoPlay uses Don't Listen to the Trees 0.4-0.5 times a fight and the signature 0-0.1 times, so T10's "foes Confused
  ≥ 2" stays a report. Bonks run 0.5-1.75 a fight in the watcher and probe batches against T10's report line of ≤ 0.8.
  He bonks when no eater has a target in reach: the acorn is wasted, but nothing loops.
- Worn Winter Coat fights reach 11 HP a worn fight at 85000 (n = 14, all fight kinds; the guard rail is ≤ 10 in regular
  fights): report it in T8n's worn row.
- qa:voice / the lead (optional): Fine, Have One's icon is now 🎁 (Deviation 12). If the lead prefers the addendum's 🤲,
  it is a one-character swap back, and the "no hands" check in suite 1 would have to go with it.

**Owner requests in these files, done**:
- `showStacks: true` on `gus_cheeks` (H19-SEATS' request): already set, and the review's HUD check reads "1".
- "Never 'the only Haste'" (the contract review's request): suite 1's D7 check covers every text of his.
- The owner's scratch pictures in `.tmp/h19/gus/` were read.

The integrator's requests above (ALL, REAL, README) stay open for `h19:integrate`.

## Balance pass (h19:balance Nov 20; fix:balance Nov 21)
No number of his moved in either pass: he read in band each time (the lead, Nov 21: "Phat Gus: no change unless he
leaves his band"). Readings, seeds and every target: `docs/notes/balance.md` "h19 pass" and "h19 fix pass (Nov 21)".
- After fix:polish's stress-eating change (a full-HP meal leaves the turn's heal for a later one), iteration 0 re-read
  him: forced **1.41 (0.99-2.00, within noise; 21.5%, 43/200)**, random-pool share 1.24× (33.6%, 41/122), `lift:gus`
  1.10 fires · 3.25 HP a fight (the Winter Coat worn in 10% of his fights: 7.0 HP a worn fight).
- Iterations 1-3 (Biz's and Rasma's levers): pool 1.28× → 1.16× → 0.79× (19.3%, 21/109; within noise), `lift:gus`
  1.16 · 3.37 → 1.14 · 3.10 → 1.16 · 3.33. The final audit's reading is in `balance.md`.

## QA fixes (h19 qa-fix:content, Nov 20)
Findings from `qa:gus` and `qa:voice`, each reproduced and pinned (suite 4 and the new suite "hero_gus: QA fixes — …").
- **gus-crate-stress-heal** (the one that can move a sim number): an eater aimed at a crate still eats but heals
  nothing (DESIGN D4); see Deviation 3 (rewritten) and the Stress eating section.
- **gus-stress-spent-at-full-hp**: text, not mechanics (the smallest honest fix; the lead may still choose "mark the
  turn only when it healed", which would raise `lift:gus`): the passive, tip 2 and the DESIGN brief say "the first time
  each turn a foe is next to him after he eats". Suite 4 pins the full-HP case.
- **gus-cap-promises / voice-8**: at the cap the 🌰 chip ends "full: the next one bonks off his head, wasted. Eat one
  first."; The Tree That Isn't There says "One lands in your cheeks if there's room (+1 acorn)."
- **gus-hole-engulfed-wording**: Down the Squirrel Hole refuses with "Rooted. Even the roots won't take you." only when
  he is Rooted; any other hold (Engulfed, a grapple) gets "Can't move right now. Even the roots won't take you."
- **voice-1**: Root Canal's log is "Roots burst up under X. No proper biting for a while." (no "It" after a name).
- **gus-gold-crumbs**: eating throws `crumbs(u, n)`: brown `dust` (CRUMB) and a few dark `leaves`, never the `coins`
  kind (whose palette drew ~30% of them as spinning gold coins).
- **voice-4**: swaps "Scoot over, {ally}. Big squirrel coming through." (Ellaria's opener, Betty's punch) and "After you,
  {ally}. Actually, after me. I'm rounder." (Benedick's and Basanos's opener) are now **"Budge up, {ally}. The woods
  want me over there."** and **"You first, {ally}? No. Me first. I'm hungrier."**
- **voice-9**: the Winter Coat's flavour quotes him: `"It's not fat. It's a winter coat. It's built in." He has been
  getting ready for winter since birth.` ("fat" is his word only).
- **gus-sprite-tells-hidden**: the teeth (1.6 × 2.6) and the cheek-full acorn (now a little acorn held in his teeth at
  (15.6, −19.4)) draw with a 0.45 edge (the painter's default 1.9 stroke had swallowed their fill); the near cheek follows
  `CHEEK_R = [2.4, 4.8, 6.3, 7.5, 8.6]` (was 2.4 + 1.55 per acorn, inside the head's outline until 2 acorns), so 0, 1 and
  2 acorns read apart at board zoom. The suite spies on a real painter.
- The enemy-AI quick pass `stressQuick(ctx)` prices no stress heal when the skill is aimed at an object
  (`ctx.targetObj`), matching the rule (the exact pass already dry-ran the real heal).
- **Re-measured** (`tools/sim.sh "debug=1&healers=ellaria,josiah,valdris&raw=1&verbose=1&seeds=100&from=60000&diff=normal"`,
  `.tmp/h19/qa-fix-content/normal_60000.txt`, against the audit's `.tmp/h19/audit/normal_60000.txt`): not byte-identical.
  Wins 29 → 28 (one run of 100, an act-2 Lichtenstein loss), fights 1286 → 1277, `lift:gus` 1.06 → 1.02 fires and 2.9 →
  2.8 HP a fight (still in T8n), `lift:rasma` 1.02 → 1.05, `lift:biz` identical. The tree also carries the other QA
  fixers' engine edits (`js/engine/targeting.js` preview diffs gained AP fields, `combat.js`), so the delta is not this
  cluster's alone; the crate rule is the only change here that can move a number. The gate's replay settles it.

## Polish (fix:polish, Nov 21)
The release gate's cross-fixer requests that had not landed (`docs/notes/hud-v2.md` "h19 QA fixes" Requests, the
qa-fix note above, `docs/notes/h19-digest.md` §7). No number changed.
- **gus-passive-live-numbers** (render-ui's request): `PASSIVE.liveDesc = passiveDesc` (it already took a combat unit or a
  RunHero); `desc` stays `passiveDesc(null)`, the base text party select, the Hall and recruit show. `DD.UI.passiveText`
  (the HUD's party card tooltip, bar head and inspect panel, the party sheet, `heroTooltipHtml(id, { who })`) now prints
  his live numbers: "they hold 4; he starts with 2" with Cheeks of Holding, "he heals 5 HP" with the Winter Coat (Built
  In). desc == execute: the numbers come from `capOf` / `startOf` / `stressOf`, the functions the rules use.
- **gus-stress-spent-at-full-hp, the code half** (the lead, Nov 21: "the gate fixed the TEXT only — make the code and the
  text agree"; the smallest change): `stressEat` sets `d.stress = state.turn` after the heal and only when it healed
  (`healed > 0`), so "once per turn" is one real heal a turn, as the addendum's desc says. The texts went back to the
  addendum's words: passive "Stress eating: once per turn, if a foe is next to him after he eats, he heals N HP." (39
  words), tip 2 "Phat Gus heals when he eats with a foe next to him, once a turn. Stress eating is a valid tactic.", the
  file header and `stressEat`'s comment. Still no threshold: the same call at 1 HP, at 29 and at 30 (a 0-HP call at full
  HP, the D9 guard), never a button, never another unit, nothing on an object hit (the crate rule: unchanged, it never
  calls). `stressQuick` already read `d.stress` and `healWorth` (0 at full HP), so AutoPlay needed no change. What it
  can move: a hurt Gus who ate at full HP earlier in the same turn now heals on the later meal, and at full HP a turn
  with two meals next to a foe makes two 0-HP calls (the sim counts calls as fires), so `lift:gus` fires and HP can only
  rise a little; the balance pass re-measures (it was in band: 1.15 fires, 3.23 HP at the audit).
- **Tests**: suite 4 (stress eating): the full-HP case rewritten (a 0-HP call of 3 at full HP, the quick price 0 then > 0
  once hurt, the preview of the second meal "you heal 3", the second meal +3, a third meal nothing, next turn +3 again;
  at 29 of 30 the +1 is the turn's heal), and the passive / tip texts pinned. Suites 1 and 2: the passive desc word for
  word. New suite "hero_gus: polish — the passive's liveDesc …" (base text; RunHero and combat unit with none / each / both
  of his items; `DD.UI.passiveText` reads it; the printed numbers equal `capOf` / `startOf` / `stressOf`; the 5 it
  prints is the 5 he heals; pure). The sim=1 rules watcher now reads "once per turn" as one healing call a turn: a call
  after the turn's heal is an issue, a 0-HP call is not, and a meal aimed at an object is not a missed heal.
  `hero_gus` isolated: 28 suites, 4,914 assertions, 0 failures; the watcher with `sim=1&n=1` (12 AutoPlay battles, all
  shipped parties): 0 broken rules, 0 problems.

### Deviations (polish)
- The lead's wording "the gate fixed the TEXT only" pointed at qa-fix:content's Nov 20 text fix; read with the addendum
  (its desc and §6 "Once per turn: two eats in a turn heal once") and request.md ("no HP threshold"), the code now
  follows the addendum. It is one line to undo (move `d.stress = s.turn` back before the call) if the lead meant the
  other way round; the texts would then go back to "the first time each turn".

### Requests (polish)
- **Lead / docs (`docs/DESIGN.md`)**: two Phat Gus lines still say the Nov 20 rule. §5 Sustain (~l.449): "Phat Gus's
  stress eating (the first Eat skill each turn with a foe next to him, never on an object hit)" → "(once a turn, when he
  eats with a foe next to him; never on an object hit)". His §6 brief (~l.842-844): "Stress eating: the first time each
  turn a foe is next to him after he eats, he heals 3 HP (at full HP that first time heals nothing; …)" → "Stress eating:
  once per turn, if a foe is next to him after he eats, he heals 3 HP (a meal at full HP leaves the turn's heal for a
  later meal; an eater aimed at an object still eats, and nothing rides on it)."
- **Lead / gate (`.tmp/h19/release-notes.md` l.33)**: "The first time each turn a foe is next to him after he eats" →
  "Once a turn, when a foe is next to him after he eats".
- **Balance (`h19-digest.md` §3 and §4, the balance fixer's sections)**: §3's Phat Gus passive line ("stress eating: the
  first time each turn a foe is next to him after he eats") and §4's Phat Gus bullet ("the first time each turn an active
  foe is next to him after an Eat skill") → the "once per turn" rule above.
