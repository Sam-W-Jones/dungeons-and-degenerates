# V3 contract (wave 0) — the lead's contract and core for act 4 "Under the Table" and the 17th hero

Owner: the lead (wave 0, plan `.tmp/v3/design.md` §8.2 row 0, §8.1 steps 1-2, §4.2, §4.4, §0.3 V7). Every later V3
agent reads this file and the "LEAD PATCHES (wave 0)" block at the top of the plan's §0.

## Files (this wave)
| File | What changed |
|---|---|
| `js/core/namespace.js` | `DD.finalAct()`, `DD.MAX_ACT`; `DD.registerCameo` / `DD.getCameo` / `DD.defs.cameos`; the `DD.Cameo` stand-in; narration act variants (`DD.narrationAct`, `DD.narrationKey`, `DD.narrationBaseKey`, `DD.narrate` reads the variant) |
| `js/data/balance.js` | plan §4.4 rows: `campaign: { acts: 3 }`, `act[4]`, `gauntlet`, `prices.bribe`, `priceAct[4]`, `map.gauntlet`, `cameo`; `actKey` clamps to `DD.finalAct()`. The review: `B.scale(…, { gauntlet: { index } })` applies the order scaling (P11); `cameo.off: 0` (P14) |
| `js/manifest.js`, `tests/manifest.js` | every new V3 file in load order (+ `tests/core_tests.js`, the review) |
| `tests/core_tests.js` (new, the review) | suites "core: …": `DD.finalAct` clamps and the act rows / prices before and after the flip, the V3 balance rows and the gauntlet order scaling in `DD.Balance.scale`, `registerCameo` defaults and the `DD.Cameo` API (stand-in or real), narration variants in every run / sandbox / stale case, both manifests' V3 load order |
| `js/data/heroes/benedick.js`, `js/data/bosses/goats.js`, `tests/content/hero_benedick.js`, `tests/content/boss_goats.js` | empty, valid IIFE stubs that register nothing (HERO-BENEDICK and C6 replace them) |
| `tests/content_tests.js`, `tests/mapgen_tests.js`, `tests/content/integration.js`, `tests/ui_tests.js`, `tests/render_tests.js` | the one-time widenings (below) |
| `docs/ARCHITECTURE.md` | §1 V3 owners, §2 core, §3.1, §3.6, §3.8, §3.9, §3.10, new §3.13, §4.1, §4.6, §4.7, §5.3 (`modifyUse`), §5.4, §5.5, §5.10, new §5.11, §6.9, §6.10, §7.4, §7.6, §8.2, §8.3, §9.2-9.4, §10.1, §10.2 |
| `docs/DESIGN.md` | intro, §1, §2 (pronouns, act-4 cast, Svammiel's voice), §3 (four acts, the twist, ship dark, act-4 progression, 4 of the 17), §5 (the act-4 column, the move-band note), §6 (sustain + the Serum, reserved names, Benedick's brief), §6.1 overlaps, §9 bosses 6-11, §10 act-4 themes, §11, §12 |
| `.tmp/v3/design.md` | the "LEAD PATCHES (wave 0)" block at the top of §0 (nothing else) |

Run: `bash tools/test.sh` (all), `bash tools/test.sh "suite=content: registry,mapgen: themes,integration: cross-content,ui: v2,render: title,docs:,balance: every"` (the widened suites).

## The contract that landed (summary; ARCHITECTURE is normative)
- **`DD.finalAct()`** = `DD.Balance.campaign.acts` clamped to 3..`DD.MAX_ACT` (4); default and floor 3. Every module
  asks it (never a literal 3 or 4 for "the last act"). `DD.MAX_ACT` = the highest act content may be written for: the
  content suites accept acts 1..`DD.MAX_ACT` whatever the knob says (act-4 content lands while the knob is 3).
- **The knob stays 3** until the integrator's flip. Suites that need act 4 set it inside `try / finally`
  (`DD.Balance.snapshot()` / `restore(snap)`); debug pages take `acts=4` (META-UI's `main.js`).
- **`DD.Balance` V3 rows**: `campaign.acts: 3`; `act[4] = { hp: 1, dmg: 1 }`; `gauntlet = { hpPerBeaten: 0,
  dmgPerBeaten: 0 }`; `prices.bribe: 75`; `priceAct[4]: 1.25`; `map.gauntlet = { lobby: ['shop', 'event'], between:
  ['tavern', 'shop', 'event'], last: ['tavern', 'shop'] }`; `cameo = { perFight: 3, perRound: 1, minGap: 2, comeback:
  0.6, off: 0 }` (`off`: the review's P14). `actKey` clamps to `DD.finalAct()`: before the flip an act-4 fight reads act
  3's row and act 3's prices (`priceMultOf(4) === priceAct[3]`); after it, the act-4 row and the markup. The review's
  P11: `B.scale(difficulty, act, kind, { encounter, gauntlet: { index } })` applies the gauntlet row.
- **Cameos**: `DD.registerCameo(def)` (defaults `title ''`, `icon '🎭'`, `color '#c0213a'`, `enemy null`, `triggers []`,
  `cheats {}`, `situation null`, `roastPrefix` / `comebackPrefix` null), `DD.getCameo(id)`, `DD.defs.cameos`. The core
  **`DD.Cameo` stand-in** (`stub: true`; `fire` 0, `play` / `say` '', `cheat` / `present` null, `history` [], `budget`
  { used 0, left 0, lastRound 0 }, `STYLES` / `TOKENS` {}) lets content call `DD.Cameo.*` before `js/engine/cameo.js`
  lands; its `campaignGoesOn(state)` already answers per the plan (`(state.run ? run.act : encounter.act) <
  DD.finalAct()`). **cameo.js must ASSIGN `DD.Cameo = { … }`** (never `DD.Cameo || …`), so the stand-in goes.
- **Narration act variants**: a pool `key@a<act>` replaces `key` in that act and uses `key`'s tokens.
  `DD.narrationAct()`: a run's act when the current fight belongs to the current run (`Combat.state.run ===
  Run.state`), else a sandbox / debug fight's `encounter.act` (while it runs, or after it when no run exists), else the
  run's act, else 0. `DD.narrationKey(key, act?)` → the key `DD.narrate` draws from; `DD.narrationBaseKey('k@a4')` →
  `'k'` (for token checks: `DD.Narrator.TOKENS[DD.narrationBaseKey(k)]`).
- **Manifests**: `js/engine/cameo.js` after `combat.js`; `heroes/benedick.js` after `pebbles.js`; after `dm.js`:
  `bosses/{gardener,league,galbraith,coven,svammiel,goats}.js` (the goats after the other act-4 bosses); `events_act4.js`
  after `events.js`; `svammiel_lines.js` after `narrator.js`. Tests: `content/hero_benedick.js` after
  `hero_pebbles.js`; `content/boss_{gardener,league,galbraith,coven,svammiel,goats}.js` after `boss_dm.js`;
  `content/{svammiel_lines,events_act4}.js` after `narrative.js`.
- **Missing files**: the loader skips a listed file that doesn't exist (the harness prints "missing scripts (N)", not a
  failure). So only the four files the plan asked for exist as stubs (`heroes/benedick.js`, `bosses/goats.js`,
  `content/hero_benedick.js`, `content/boss_goats.js`: empty IIFEs that register nothing; their owners overwrite them).
  Every other new V3 file (cameo.js, gardener / league / galbraith / coven / svammiel.js, events_act4.js,
  svammiel_lines.js and their suites) is listed but absent until its owner creates it.

## Test widenings (phase 0, one time; nobody else needs to touch these for acts or hero counts)
- `tests/content_tests.js`: enemy / encounter / hero-unlock acts in 1..`DD.MAX_ACT` (`inActs`); the DESIGN §5 HP bands
  gained the act-4 column (advisories only: minions 18-20, elites 60-115, bosses 300-480; no act-4 normals); a boss
  fight passes with a boss-tier unit OR a squad named in `objective.bossIds` (registered enemies, at least one in the
  opening line-up); every `gauntlet` / `finale` encounter is `kind: 'boss'` with `weight: 0`, a door has `gauntlet {
  lane, order }`; act coverage runs 1..`DD.finalAct()` (a gauntlet act needs only boss fights).
- `tests/mapgen_tests.js`: theme acts 1..`DD.MAX_ACT`; the real-registry pick loop covers the regular acts
  1..`DD.finalAct()` (a gauntlet act has no random picks); wild-magic texts resolve for acts 1..`DD.MAX_ACT`.
- `tests/content/integration.js`: the roster is the registry (`REAL = realHeroes()`: unlock, init, 3+ hero items,
  learnable pools, a hero event checked for every registered hero); "sixteen real heroes" → "N real heroes in the
  registry, every hero of the pronoun list among them" (+ a log line naming registered heroes missing from `ALL`); act
  coverage 1..`DD.finalAct()` with a gauntlet act = L doors (one per lane, L from the registry) + exactly one finale,
  nothing else, every one a boss fight with weight 0 and a `shortName` ≤ 24; the campaign smoke expects
  `actsCleared === DD.finalAct()` on a win. `ALL` stays the pronoun list (the integrator adds Benedick, he). The review:
  a hero event naming a hero whose file has not landed yet (`PENDING_HEROES = ['benedick']`: NARRATIVE's
  `ev_ben_bistro` lands before HERO-BENEDICK, plan §4.12) is logged instead of failing "names an existing hero"; any
  other unknown hero id still fails.
- `tests/ui_tests.js`: "16 heroes in UI.HERO_ORDER" → "every registered hero is in UI.HERO_ORDER" (N = registered
  non-test heroes; `UI.heroIds()` = the order's registered ids, then any hero it doesn't list yet; cards and the hall
  roster N); "4 of 16" / "All 16" → `UI.heroIds().length`; the fit suite reads N from the frame's `UI.heroIds()` and the
  recruit pick expects N − the party. (META-UI adds `V3_HEROES` and the padded 17 / 18 fit runs.)
- `tests/render_tests.js`: the campfire seats `min(N, seats)` where seats = `DD.Render.TITLE_SLOTS.length` when the
  renderer exposes it (else "every real hero sits": units ≥ N). (RENDER-WORLD adds Benedick's seat and his assertion.)

## Lead patches against the shipped v2 (the plan's §0 block, with the evidence)
Checked against `.tmp/wf11/user-decisions.md`, `.tmp/wf12/lead-decisions.md` (D1-D11), ARCHITECTURE as shipped and the
code at commit b184bea.

**P1 Swap** (plan §0.1, §3.0.4, §3.4, §3.5 R8 / R9).
- API as shipped: `DD.Combat.swapInfo(unit, x, y)` (pure; `null` = no hero-side ally there; `ok: true | 'reason'`,
  `ap: Combat.moveApCost(unit)`, the mover's `provokes`, both arrival hazards / edges / snags), `swapTargets(unit)`,
  `canSwap(unit, x, y)`, `swap(unit, x, y)` (spends `moveApCost`; `DD.Act.swapMove(mover, ally, { provoke: true })`;
  undo like a move). `DD.Act.swap(a, b, { force, noEnter, src })` = the forced swap of skills / scripts: never
  provokes, refuses immovable units unless `force`.
- **D2**: an immovable hero can START a swap; nobody can swap him (`swapProblem`: "Slate is immovable: he can start a
  swap, you can't move him."). At the Coven, an immovable spot-holder (Slate, Ellaria's Absolute Unit) hands the spot
  over by starting the swap; an ally can't take it from him. The plan's "the ally is not … immovable" is right.
- Refused allies: downed ("… is down: Help Up instead."), stunned / asleep / frozen, rooted / held (`cantMove`),
  immovable. The mover: not rooted, not stunned, enough AP, the step within its move; both tiles must hold the other
  (terrain, objects, the climb both ways). Enemies never swap.
- **R9 New Seating Chart**: `DD.Act.swap(a, b)` without `force` refuses immovable units; `DD.Act.isImmovable(u)` is
  `flags.immovable || downed`, so downed heroes stay on their chair too. `DD.Act.teleport` does NOT check
  immovability: the "someone on only one chair" branch must check `DD.Act.isImmovable(u)` first.
- **R8 Moving Costs Extra** is a `modifyMoveCost` rule; `Combat.swapInfo` / `swap` charge `Combat.moveApCost`, so the
  swap move is priced by the same rule. A Confused hero already pays 2 (`moveApCost` starts at 2): "costs 2 AP" =
  `m.ap = Math.max(m.ap, 2)`; "+1 AP" = `m.ap += 1` (desc == execute).
- Goats §3.0.4: the ally that swapped in claps back on ITS OWN turn (a swap costs the ally nothing and gives it nothing).
- `state.stats.swaps` doesn't exist (E12, RULES). AutoPlay's `bestSwap` prices a swap like a move plus the danger it
  saves; it knows no Stirring Spot or Clap Back (a sim gap, like the plan's other AutoPlay gaps).

**P2 Breakable objects** (plan §0.1 rule B, E4, E9; D1, D3, D4, D5).
- Shipped: EVERY hero-side single-target damage skill, attack or spell (and kind-less consumables), can aim at a
  breakable object (`DD.Targeting.aimsAtObjects`); `target.objects: false` opts out (nine opt-outs, DESIGN §4.2).
- An aimed hit deals `DD.Targeting.objectDamage(user, skill)` = `objectDmg` or `L.dmg` × Weak 0.75 / Inspired 1.25 /
  (1 + dmgBonus), rounded; **no hooks run** (no rule, no cheat, no `takenMult`, no high ground; Empowered neither adds
  to the hit nor is spent by it: `objectDamage` leaves it out and the damage path that consumes it never runs), no
  riders (D4), `onSkillUsed` still fires with `ctx.objectHit = { x, y, id }` and `ctx.target = null`; Stealth ends
  (D3). So Galbraith's Counterspell never protects a Focus Crystal (and must not count an object hit as "a spell at
  him"), the cameo cheat That's a 1 Now and the snap cheat S2 never touch object hits, Corroded / Intermission / Caught
  Red-Handed don't make objects softer.
- The integration suite (`integration: rules run — every breakable content object decides targetable…`) checks every
  content object (`hp > 0`, not a core id): a volatile one's desc says it explodes; any other sets `targetable: true |
  false`, its desc contains its HP as "<n> HP" and either "any single-target damage skill can break it" or "can't be
  aimed / never aimed"; a targetable one really takes the test mage's 4 from 1 and 3 tiles away as previewed. The
  plan's descs for Focus Crystal (15), Rigged Die (12), Master Die (20), Villain's Body (10), Speaker Stack (12), hay
  bales, Benedick's parcel (if it has HP) need those words.
- AutoPlay breaks objects worth it through `autoplay(unit, obj, tile, state, how)` hints (`how`: 'break' | 'interact' |
  'step'); plain cover is worth 0. The Smash interaction is unchanged.
- docs_tests "D1: DESIGN §4.2 names every hero-side opt-out": a new hero-side `target.objects: false` (Benedick's The
  Inevitable, addendum §18.10) fails it until DESIGN §4.2's opt-out sentence names it. **HERO-BENEDICK may append the
  name to that one sentence in the same landing** (it can't be listed earlier: the suite also checks each listed name
  is a registered opt-out).

**P3 Scaled texts** (v2 finish, "boss and enemy texts show the fight's scaled numbers"): `UI.skillInfo` and the inspect
panel print an enemy skill with `DD.AI.fightLevel(def, level, unit)` = every numeric key of `L` matching
`/^(dmg|damage|crit)$|dmg|Dmg|Damage/` × `state.difficulty.dmg`. An act-4 desc that prints a damage number from a
constant (or a key outside that pattern) disagrees with the hit as soon as a row, a difficulty or a gauntlet knob is
not 1. Use `L.dmg` (and friends) in descs and in `execute`.

**P4 Pronouns**: `DD.Act.pronouns(u)` reads the def / unit `pronoun`, else heroes by the campaign list, else 'it'. Set
`pronoun` on every named act-4 enemy (Svammiel, Kelek, Warduke, Zarak, Zargash, Galbraith, the goats and the bear 'he';
Skylla and the hags 'she'; the Gardener 'it' explicitly).

**P5 Economy** (plan §2.3): shipped `DD.Balance.gold.fight.boss` = [50, 70] (sustain refit 3; the plan sized on
[80, 100]). With the plan's `goldMult 0.6` a door would pay 30-42 (an elite pays 35-50). **Patch: doors ship
`reward: { goldMult: 0.9, itemRarity: 'rare' }`** = 45-63, mean 54 (the plan's own door mean: five doors ≈ +270). The
DM's loot = [50, 70] × 1.5 = 75-105 (mean 90; the plan said 120-150). Gold at the DM averages ~196 (release gate;
median 136 in the audit), not ~375. So ≈ 196 + 90 + 270 + events (0-35 a stop) ≈ 560-600 reaches act 4, and ~430-480
must be spent there to end a won run with 100-150. Six stops at ×1.25 (rare 100, legendary 188, heal 38, consumable
~31, tome 75, the Bribe 94) can sink that, but BAL measures before pulling §2.3's levers (Bribe 85, `priceAct[4]` 1.3):
with less gold than planned they may need to go the other way (`priceAct[4]` down, door `goldMult` up).

**P6 The campaign target** (plan §0.1 step 3, §7.1): see the re-baseline below. The shipped 3-act normal campaign is
**30.7%** (release gate, 300 runs), level ~4.5 at the DM. §7.1's own rule — act-4 clears = 0.25 / the new 3-act rate —
gives 0.25 / 0.307 ≈ **81%** act-4 clears (e.g. Svammiel 90% and every door ~97.9%: 0.979⁵ × 0.90 ≈ 0.81), far above its
55-65% band; doors at the band's 93% with Svammiel at 82% clear act 4 57% of the time → a ~17.5% campaign. **OPEN (lead,
maybe the user)**: "about 25% campaign wins" (the user's answer, given against v2's old 42.5%) vs the act-4 difficulty
bands. Default until decided: §7.1's written rule (≈ 25% campaign), BAL reports both the campaign rate and act-4
clears. Expected party level: door k ≈ 4.5 + 0.25 k (Svammiel ≈ 6.0).

**P7 Healing** (D9, D11) — corrected by the wave-0 review: D9 is about the HEROES (the user: sustain "linked to the
characters themselves", no repeatable heal for healer-less parties, no generic starting heal). So act 4 adds no hero
self-heal button, no party heal item / consumable / Blessing / starting-kit entry, and no cheat or Svammiel gift that
heals; Benedick's only heal is the Snail Mucin Serum. One-off map-stop heals stay as v2 ships them after D9: the
act-clear heal at the twist, taverns, the shop's heal service, the Mystery Stew reward, and event outcomes (v2's events
heal 15-100%; the plan's verbatim act-4 events in V §15 heal the party 10-25% (the Coven's "special pie" one hero to
full, with a Scar) and The Gardener's Compost Heap 15%, plan §5.6:
NARRATIVE keeps them; an earlier wording here, "no generic heal from any event", contradicted the plan and the shipped
v2). D11: no pass changes Ellaria's kit, numbers or items. Note for the
integrator / BAL: the sim rule "`takeRewards` never replaces a `'shapeshift'` skill" also keeps Ellaria's *Wild Shape:
Absolute Unit* (`ell_wildshape`, tagged `'shapeshift'`), Basanos's Transform and his *Blood Moon* (`bas_blood_moon`, also
tagged `'shapeshift'`): it changes AutoPlay's skill picks for both heroes, so their hero-table shares may move; that is
measurement, not a trim (the integrator may narrow the rule to transform skills if the plan's intent is only those).

**P8 Brutal, shops, Block**: every act-4 fight is boss-kind → brutal's extra enemy (`extraEnemies.brutal.boss` 0)
never joins; `map.minShops` is not read by the gauntlet; no act-4 content grants Block at fight start (v2 ignores
`stats.block`; cheats included).

**P9 Literal-3 sites beyond the plan's V7 list**: `js/data/wildmagic.js` (`actOf`, `describe`: `Math.min(3, …)`; act 4
reads the last row, fine, but write it data-driven); `js/loader.js`'s `isolate` filter does not treat
`js/data/svammiel_lines.js` / `js/data/events_act4.js` as content (they always load in isolated runs). The full list,
by owner, is in "Every 'last act' literal" below.

**P10 E8 content zones live in the combat state** (the review; plan §3.6 E8, §3.4, §3.5, `addendum-goats.md` E8): the
plan names `DD.Render.overlay.zones`, but the shipped HUD calls `DD.Render.resetOverlay()` when it mounts (after
`Combat.start`, so after `onStart` and the start cameo) and when it unmounts, and headless runs have no renderer: zones
written there at fight start vanish. Contract (ARCHITECTURE §4.1, §7.2): content writes `state.data.zones = [{ tiles,
color, label, line }]`; RENDER-WORLD draws them (and nothing when absent: yaw 0 pixel-identical). Fallback unchanged
(`DD.FX.tile` pulses).

**P11 The gauntlet's order scaling lives in `DD.Balance.scale`** (the review; plan §2.3, §4.4, §4.6): the plan has
`Encounter.build` apply `DD.Balance.gauntlet` through `opts.gauntlet`, but in a run `Combat.start` (`difficultyOf`)
computes the fight's multipliers from the run, the act, the kind and the encounter, never from `setup.difficulty`, so a
knob applied in the setup would be dead in every real fight. Built: `DD.Balance.scale(difficulty, act, kind,
{ encounter, gauntlet: { index } })` multiplies HP by `1 + hpPerBeaten × index` and damage by `1 + dmgPerBeaten × index`
(not in `neutral` sandbox fights; junk / negative index = 0). RULES passes `gauntlet: setup.gauntlet` from `difficultyOf`;
MAPGEN passes `opts.gauntlet` from `difficultyInfo` (ARCHITECTURE §5.8, §6.10). The knob stays 0 (off).

**P12 Cameo trigger context** (the review; plan §3.0.3, §4.1): a trigger's `when(state, ctx)` / `keyOf(state, ctx)` get
`DD.Combat.state` and the event's payload as emitted (ARCHITECTURE §5.11 lists them); the plan's `svam_env_kill`
interjection had no trigger: it is a `kill` trigger whose `when` checks a hero killer and the engine's environmental
causes (`surface | terrain | bump | fall | explosion`, `actions.js ENV_KILL_CAUSE`, the `env_kill` narration's rule); a
falsy `keyOf` result skips; the sulk's lane comes from `state.encounter.gauntlet.lane` (a sandbox door has no
`state.data.gauntlet`, so `s.data.gauntlet.lane` would throw and fail the suite through DD.safe's "Error in").

**P13 A cheat carries its rule's lifecycle and flats** (the review; plan §3.0.2, §4.1): the plan's Coven cheat *The Floor
Is Lava* restores the terrain "in `onRemove`" when its 3 rounds end, but the plan's `Cheat` shape had no `onRemove`
and `DD.Cameo.cheat` built the rule from `hooks` only, so the lava would have stayed all fight. Contract (ARCHITECTURE
§3.13, §5.11): a `Cheat` may carry `onAdd` / `onRemove` / `telegraphFlat`, which `DD.Cameo.cheat` copies onto the
rule (the shipped `Act.addRule` / `removeRule` call `onAdd(state, rule)` / `onRemove(state, rule)`; rules tick at round
end, so `rounds: 3` added at the cameo ends after round 3; `DD.AI.ruleFlat` reads a rule's `telegraphFlat(unit, intent,
rule)`). The honesty rule names the right places: rule `hooks` `estimateDealt` / `estimateTaken` / `threatAt`, the
rule's `telegraphFlat`, or a status's `takenFlat` / `telegraphFlat` / `takenMult` (fields, not hook names).

**P14 A page-wide cameo switch** (the review; plan §7.1-7.3 "`cameo=0` (sandbox `noCameo` for every fight)", §4.10
debug `cameo=0`): the contract had `state.noCameo` only from a sandbox's `cameo: false`, but the sims play RUN fights
(`run.js launchCombat` → `Combat.start`, no `cameo` option), so `cameo=0` — the measure of every cheat's ≤ 3-point
cost, the Radio Edit's included — had no way in. Built: `DD.Balance.cameo.off` (0 shipped; numeric, so `bal=cameo.off:1`
works); `Combat.start` sets `state.noCameo` when it is truthy (RULES); the sim's and `main.js`'s `cameo=0` set it to 1
(integrator, META-UI).

**P15 Two spoiler spots the plan leaves implicit** (the review; plan §2.6, §4.10): the Settings row "Svammiel's cameos:
Full / Short / Log only" and a map legend that gained a 😈 Mini-boss entry (`map.js LEGEND` is a fixed list;
`TYPES.miniboss`'s desc names Svammiel) would both show on a first run. Contract (ARCHITECTURE §4.7): the Settings row
appears only after the `seen.bosses.svammiel` gate; the Mini-boss legend entry only on a gauntlet map.

### Every "last act" literal in the shipped code, by owner (the review's grep; each owner reads `DD.finalAct()`)
Pattern: `[1, 2, 3]`, `act === 3`, `>= 3`, `<= 3`, `Math.min(3, …)`, `FINAL_ACT`, `{ 1: [], 2: [], 3: [] }`. Lines are as of
b184bea + wave 0 (they move; search by function).
| Owner | Site | What to do |
|---|---|---|
| META-RUN | `run.js` `const FINAL_ACT = 3` (`normalize` clamp, `resolveEncounter` / `queueCombat` clamps, `resolveCombat` `finalBoss`, `completeAct` `act >= FINAL_ACT`); `travel` / `normalizeKind` / `enterFight` (no `'miniboss'`) | the getter on `DD.finalAct()`, plan §4.3 |
| META-RUN | `run.js` `FALLBACK_EVENT` `acts: [1, 2, 3]` ("The DM Did Not Prep This Room") | `enterEvent` uses it whatever its `acts` say, so an act-4 stop with no `acts: [4]` event left shows the DM "behind his screen" though he is demoted: harmless with six act-4 events for ≤ 5 event stops (plan §5.6); an act-4 line is optional |
| META-RUN | `rewards.js actIdx` `Math.min(3, …)`; `meta.js unlockHint` `act >= 3` ("Beat the Dungeon Master") | `DD.finalAct()`; the unlock hint is dormant (no hero unlocks) but reads the last act |
| META-RUN | `tests/run_tests.js` act loops `[1, 2, 3]` / `act <= 3`, "campaign victory → `victory { final: true, act: 3 }`" | from `DD.finalAct()` (acts 3 and 4 cases, plan §8.4) |
| MAPGEN | `encounter.js clampAct` `Math.min(3, …)`, `pickFrom`'s act list `a <= 3`; `themes.js forAct` `Math.min(3, …)`; `wildmagic.js actOf` / `describe` `Math.min(3, …)` | `DD.finalAct()` (wildmagic: the last `SCALE` row, act 4 reads act 3's numbers) |
| META-UI | `main.js` the `act=` clamps (`Math.min(3, …)`, twice) and `screen=victory`'s `final: … run.act >= 3`; `hall.js` codex `[1, 2, 3, 0]` and its "other" filter `<= 3`; `ui.js` unlock hint `u.act >= 3` (dormant); `UI.ACTS` (no row 4); `tests/ui_tests.js` `victory { act: 3, final: true }`, the `[1, 2, 3]` price loop | `DD.finalAct()`; the codex groups gated by the spoiler rule |
| RENDER-SPRITES | `gallery.js` 'enemies' sections `[1, 2, 3]` + "Other", `case 'act1' … 'act3'` | debug-only page: act-4 enemies land in "Other" (works); an `act4` section is optional (no V3 row lists it) |
| Integrator | `tests/sim/sim.js` `finalBoss = … act === 3`, `levelsAtBoss { 1, 2, 3 }`, `downsByAct`, the act loops (`a <= 3`, `[1, 2, 3]`), `STOP < 3` | `DD.finalAct()` (plan §7.2) |
| RULES | `tests/fixtures.js` test encounters `[1, 2, 3]` | plus the act-4 fixtures of plan §4.5 (lanes and a finale, so a gauntlet act needs only boss fights) |
| BALANCE / BAL | `tests/balance_tests.js` `[1, 2, 3]` row and price loops | add act 4's row / markup checks after the flip if wanted (the core suite checks them now) |
| (v2 content, no V3 owner) | `js/data/passives.js actNo` `Math.min(3, …)` (a Blessing's per-act numbers, `ducks[actNo() - 1]`) | leave: act 4 reads act 3's numbers (the intended clamp); BAL may ask for an act-4 value |
| C5 | `dm.js cameoPool` `{ 1: [], 2: [], 3: [] }` and `[1, 2, 3]` | keep: the DM never summons act-4 enemies (plan V10) |
| NARRATIVE | `events.js` `acts: [1, 2, 3]` everywhere; `narrator.js` run_start "three acts" | keep: the classic acts; the lie is the setup (plan §2.6) |

Verified unchanged (the plan's claims hold on the shipped code): movement through allies is symmetric
(`ARCHITECTURE §6.2`); `Act.addRule` always logs "New rule: …" (needs `rule.silent`); `Act.log(text, cls)` has no
third parameter; no `combat:ready` / `skill:used` events; `Combat.canUse` has no rule veto (E13); `Act.isBoss` = tier
boss or a `boss` field (V21); `run.js` `const FINAL_ACT = 3`; `DD.Act.emit` is muted while `DD.Act.simulating`.

## Re-baseline (plan §0.1 step 3): the v2 game with the V3 core loaded
Command: `tools/sim.sh "seeds=50&from=1000&diff=normal"` (`campaign.acts` 3; report
`.tmp/v3/contract-check/rebaseline_normal_50_from1000.txt`).

| measure (normal) | wave-0 re-baseline (50 runs, seeds 1000-1049) | v2 release gate (300 runs, `docs/notes/v2-digest.md` §3.0) | |
|---|---|---|---|
| campaign wins | **24%** (12/50, 95% CI 14-37) | 30.7% (CI 26-36) | within noise (z ≈ −1.0) |
| act 1 / 2 / 3 cleared (of entered) | 64% / 69% / 55% | audit 67% / 69% / 70% (400 runs) | act 3 on n 22 |
| party level at the act 1 / 2 / 3 boss | 1.9 / 3.1 / 4.5 | 2.0 / 3.2 / 4.5 | same |
| act 1 bosses | 67% (32/48: Grimble 64%, Rat King 69%) | 73.2% | within noise |
| Lich-tenstein / Dr. Iris / the DM | 90% (9/10) / 87% (13/15) / 67% (12/18) | 84.5% / 82.6% / 71.9% | within noise |
| gold at the DM / left at the end | 164 (n 18) / 164 | DM start avg 196 / end median 147 | within noise |
| errors / stalls / `DD.warn` | 0 / 0 / 0 (465 fights) | 0 / 0 / 0 | |

So with `campaign.acts` 3 and the V3 core loaded the game plays as v2. The baseline for the act-4 targets stays the
release gate's 300-run **30.7%** (this 50-run batch is a check, not a better estimate); the integrator re-measures after
the flip with `acts=3` (plan §7.3).

## Deviations
- **`DD.narrationAct()` order**: the plan says "`DD.Combat.state.run.act`, else `DD.Run.state.act`, else the fight's
  `encounter.act`, else 0". Built: the fight's run only when it IS the current run (`Combat.state.run === Run.state`),
  a sandbox fight's `encounter.act` while it runs (or after it when no run exists), then the run, then 0. Reason:
  `DD.Combat.state` outlives its fight, so the plain order would read a stale run (an act-4 game over followed by a new
  run's act-1 map would draw `@a4` lines) and a sandbox fight would read a stale `DD.Run.state` from an earlier run.
- **`DD.MAX_ACT` (4)** is new (not in the plan): content validity ranges need "the highest act content may target"
  separately from `DD.finalAct()` (act-4 content lands while the knob is 3). `DD.narrationKey` / `DD.narrationBaseKey`
  are new helpers for the callers that filter pools and for token checks.
- **The `DD.Cameo` stand-in** (plan: "stubs so files can register before their engine lands"): registration needs only
  `DD.registerCameo`; the stand-in also lets content CALL `DD.Cameo.say` / `cheat` at runtime before cameo.js lands.
- **Door gold** `goldMult 0.9` instead of the plan's 0.6 (lead patch P5): keeps the plan's door mean (54) on the
  shipped boss row.
- **Missing-file tolerance** instead of stubs for the V3 files other than the goats' and Benedick's (the task allowed
  either): an owner creates the file; nothing to overwrite.
- **Extra widenings beyond the plan's list**: content_tests' squad boss-fight rule (`objective.bossIds`) and the
  gauntlet / finale shape checks, the act-4 HP band column, mapgen's regular-acts pick loop and wild-magic act loop,
  integration's per-hero checks over the registry. Reason: each would otherwise fail (or silently skip) the day act-4
  content or a 17th hero lands, and the owners don't own these files.
- **`ui_tests`**: the first v2 suite now also asserts the party-select card count in the fit suite (`N hero cards`).
- **`campaignGoesOn` in a sandbox** (the stand-in and ARCHITECTURE §5.11): the plan's sandbox rule is
  `encounter.act === 3 && DD.finalAct() === 4`; the contract's is "the encounter's act < `DD.finalAct()`" (the same
  rule as in a run). They agree for the act-3 boss (the twist, the DM's cut-off line) and differ only for a sandbox
  fight of acts 1-2, where no trigger or content asks. `tests/core_tests.js` checks only the cases both agree on, so
  RULES may implement either.
- **The review (wave 0, adversarial)**: P10 (E8 zones in `state.data.zones`, not `DD.Render.overlay`), P11 (the order
  scaling in `DD.Balance.scale`), P12 (trigger context, `svam_env_kill`), P13 (a cheat's `onAdd` / `onRemove` /
  `telegraphFlat`), P14 (`DD.Balance.cameo.off`, a row the plan's §4.4 doesn't list), P15 (two gated spoiler spots)
  and the corrected P7 change the plan; each is in the plan's LEAD PATCHES block and in ARCHITECTURE.
- **`tests/core_tests.js`** is a new lead-owned test file (ARCHITECTURE §1): the core had no suite, and the scratch
  checks of wave 0 would not have caught the review's P11 fix regressing.

## Requests
- **Lead (`js/loader.js`)**: add `svammiel_lines` and `events_act4` to the `isolate` content filter
  (`/^js\/data\/(skills_generic|items|consumables|events|events_act4|narrator|svammiel_lines|passives)\.js$/`) so an
  isolated run of one fight doesn't load NARRATIVE's work in progress.
- **META-RUN (`run.js narr`) and META-UI (`UI.narrate`)**: filter `DD.defs.narration[DD.narrationKey(key)]` (the pool
  `DD.narrate` will draw from) instead of the base key's pool, so the index shim picks a usable line of the act-4
  variant (today a variant line using a token the caller doesn't fill could slip through).
- **NARRATIVE**: token checks of variant pools use the base key (`DD.Narrator.TOKENS[DD.narrationBaseKey(k)]`;
  `DD.Narrator.badTokens(key)` reads `TOKENS[key]`, so it flags every token of a `k@a4` pool as bad).
- **RENDER-WORLD**: expose the title seats (`DD.Render.TITLE_SLOTS`, a copy or a getter) so the campfire test reads
  `min(N, seats)` exactly; add Benedick's seat [4, 6] and the fallback order entry (plan §4.12).
- **MAPGEN (`js/data/wildmagic.js`)**: `actOf` / `describe` clamp to `Math.min(3, …)`: make it data-driven (the last
  `SCALE` row) — act 4 reads act 3's surge numbers today, which is the intended clamp.
- **HERO-BENEDICK**: append *The Inevitable* (and any other `target.objects: false` skill) to DESIGN §4.2's opt-out
  sentence in the same landing (P2; lead's permission for that one sentence).
- **Every act-4 content owner (C1-C6)**: P2 (object descs and `targetable`), P3 (descs from `L` damage keys), P4
  (`pronoun`), P5 (door `goldMult 0.9`; the finale `{ goldMult: 0, itemRarity: null }`).
- **C5 (Svammiel)**: P1 (R9 via `DD.Act.swap` without `force` + `isImmovable` before a teleport; R8 `Math.max(m.ap, 2)`).
- **Integrator / BAL**: P5, P6 (the open campaign-target question), P7 (the `'shapeshift'` sim rule also covers
  Ellaria's Wild Shape and Basanos's Transform and Blood Moon).
- (Done by the review: the scratch core checks are now the permanent `tests/core_tests.js`.)

Added by the wave-0 review:
- **Lead (`.tmp/v3/dnd-v3-build.js` / `build-owners-addendum.md`)**: give `benedick` the deps `['narrative', 'world',
  'ui']`. Today it waits for NARRATIVE and RENDER-WORLD only, so HERO-BENEDICK can land before META-UI has appended
  `'benedick'` to `UI.HERO_ORDER` and refit the 4-column `.ps-roster` / `.hall-heroes` grids for 17 cards: then
  `ui: v2 — every registered hero is in UI.HERO_ORDER` (a phase-0 widening the plan asks for: plan §4.12, §8.4) and
  probably the 17-card fit suite fail in his run (not his files). Plan §4.12's "nothing hard-fails in either order"
  holds for the counts, not for that completeness check. If the deps can't change, HERO-BENEDICK names those two
  ui_tests failures as META-UI's.
- **RULES (`combat.js difficultyOf`)**: pass `gauntlet: setup && setup.gauntlet` to `DD.Balance.scale` (P11).
  **(`Combat.start`)**: `state.noCameo` also when `DD.Balance.cameo.off` is truthy (P14).
- **Integrator (`sim.js` `cameo=0`) and META-UI (`main.js` `cameo=0`)**: set `DD.Balance.cameo.off = 1` for the page
  (P14); `full` / `short` / `log` stay the setting.
- **META-UI**: P15 — the Settings cameo row behind the `seen.bosses.svammiel` gate; the 😈 Mini-boss legend entry only
  on a gauntlet map (with a `ui_tests` check that an act-1 map's legend and the gated Settings name no Svammiel).
  **(`tests/content_tests.js` HOOKS)**: add `'modifyUse'` with E13, or a rule / def that uses it is reported as an
  unknown hook name. **(cameo.js)**: implement the trigger context of P12 / ARCHITECTURE §5.11 (`when` / `keyOf` get the
  event payload; a falsy key skips; a throwing one is false) and copy a cheat's `onAdd` / `onRemove` / `telegraphFlat`
  onto its rule (P13).
- **MAPGEN (`encounter.js difficultyInfo` / `build`)**: pass `opts.gauntlet` to `DD.Balance.scale` and copy it to
  `setup.gauntlet` (P11; ARCHITECTURE §5.8).
- **RENDER-WORLD (E8)**: draw `state.data.zones` (P10; ARCHITECTURE §7.2), not a content-written `DD.Render.overlay.zones`.
- **C4 (Coven), C5 (Svammiel), C6 (goats)**: E8 zones go to `state.data.zones` (P10); C5's `svam_env_kill` and sulk
  triggers as in ARCHITECTURE §3.13 (P12); C5's *The Floor Is Lava* restores the terrain in the cheat's `onRemove` and
  any flat-damage cheat declares `telegraphFlat` (P13).
- **NARRATIVE**: P7 as corrected: the plan's verbatim act-4 events keep their heals (the Compost Heap's 15% too).

## Tests (wave 0)
- Full `bash tools/test.sh`: **PASS — 1052 suites, 123,923 assertions, 0 failures**, 0 swallowed "Error in" lines
  (missing scripts 15: the V3 files not yet created). The widened suites and the docs suites were re-run on their own.
- Scratch core check (`.tmp/v3/contract-check/check.html`, 27 checks): all pass.
- Re-baseline sim: above.
- The review: `bash tools/test.sh "suite=core:"` — 5 suites (99 assertions), PASS; the full run and a normal sim are
  under "Review results" below.

## Review results (wave 0, adversarial review, Nov 14)
Checked: every new file has one owner in ARCHITECTURE §1 matching plan §8.2 (added: QA, the integrator's optional
`kit.js`, the lead's `tests/core_tests.js`); every API of plan §3-4 and the tests of §8.4 against ARCHITECTURE (gaps
fixed: P10-P15, §5.8 MAPGEN V3 notes, §10.1's sentence the V3 params had split); `DD.finalAct()` as the only last-act
source (every literal listed above by owner); the manifests load the stubs; the lead patches against the shipped code
(P1 swap API, D2, `isImmovable` / `teleport`, `moveApCost`; P2 `objectDamage` and the integration suite; P3
`AI.fightLevel`'s key pattern; P4 `Act.pronouns`; P5 the gold rows and the DM's ×1.5; P6 the arithmetic; P8 brutal and
waves; P7 corrected); no player-visible V3 text (only docs, the plan and data rows changed; nothing the game shows
mentions act 4); with `campaign.acts` 3 the game is v2.
- Full `bash tools/test.sh`: **PASS — 1057 suites, 124,025 assertions, 0 failures** (the 1052 of wave 0 + the 5 core
  suites), 0 swallowed "Error in" lines, missing scripts 15 (the V3 files not yet created).
- `tools/sim.sh "seeds=50&from=1000&diff=normal"` after the review's P11 change to `B.scale`
  (`.tmp/v3/contract-check/review_normal_50_from1000.txt`): **identical** to the wave-0 re-baseline line for line
  (only the timing differs): 12/50 wins, the same fights, levels, bosses and gold. (P14's `cameo.off` row came after
  the sim; nothing reads it until cameo.js lands, and the full run above includes it.)

## Known issues
- The harness prints "missing scripts (15)" until the V3 owners create their files (expected; not a failure).
- The campaign target is open (P6).
- HERO-BENEDICK may land before META-UI (see the build-deps request above).
