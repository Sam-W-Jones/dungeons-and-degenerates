# NARRATIVE notes (events + narrator)

Files: `js/data/events.js`, `js/data/narrator.js`, `tests/content/narrative.js` (suites `narrative: …`).
Isolated run: `bash tools/test.sh "suite=narrative&isolate=events,narrator,narrative"`.

## Summary

### Events (`js/data/events.js`, 29 events, ids `ev_*`: 12 hero events + 17 generic)
Every event: 2-5 sentence text, 3 choices, each with an exact mechanics `hint`, at least one risk/reward trade and at least
one free choice. Outcome text is built from what actually happened (item / skill / scar / consumable names, real gold
amounts from the API's return values). Fights are returned as `{ text, combat: { act: run.act, kind } }` (no encounter ids).

Hero events (at least one per hero, two for the newest heroes Slate and Mayor Buga since DESIGN §11 offers two ideas
each; `requires` that hero alive in the party, `hero: <id>` so the event screen shows the portrait, weight 2, acts 1-3,
every one rewards that hero):

| id | hero | title | choices |
|---|---|---|---|
| `ev_zar_bling_merchant` | zarathor | Glimmerjaw's Discount Bling | pay 50 → rare item for Zarathor · 50/50 free rare item / Zarathor −25% HP · Zarathor +15 XP |
| `ev_syl_rap_battle` | syllamin | Rap Battle at Dead Goblin Crossing | 70% upgrade + 30 gold / 30% scar · party +12 XP · Blessing roll + normal fight |
| `ev_mar_lost_marbles` | marbles | He Has Lost His Marbles | learn a skill + normal fight · pay 30 → upgrade · full heal + 10 XP |
| `ev_mrw_mirror` | marwyn | Mirror, Mirror, on the Wall | Blessing roll · 60% rare item / 40% scar · Marwyn +25 XP, everyone else −10% HP |
| `ev_ell_lost_corgi` | ellaria | A Very Good Boy, Very Lost | +45 gold, party +8 XP · learn a skill · 50% rare item / 50% normal fight |
| `ev_jos_rat_union` | josiah | Local 404: The Plague-Rat Union | pay 35 → upgrade + 2 consumables · Blessing roll, party −10% HP · +15 XP + normal fight |
| `ev_spa_blood_bank` | sparrow | First National Blood Bank | Sparrow −30% HP for 45 gold · pay 30 → party heals 50% · rare item + elite fight |
| `ev_cor_fine_print` | corelos | Your Patron Would Like a Word | upgrade + Blessing roll (curses possible) + scar Owes the DM Money · party +12 XP, Corelos −25% HP · learn + normal fight |
| `ev_sla_noisy_kids` | slate | Kids These Days | Blessing roll + consumable · full heal + 20 XP · learn a skill, 50% normal fight |
| `ev_sla_sculptor` | slate | A Sculptor Wants to "Fix" Him | −25% HP, upgrade · +15 XP · pay 25 → Blessing roll |
| `ev_buga_reelection` | buga | Re-Elect Mayor Buga! | +70 gold + scar · pay 30 → upgrade, party +10 XP · 60% rare item / 40% normal fight |
| `ev_buga_toaster_cult` | buga | The Church of the Golden Crust | +60 gold, 50% normal fight · party heals 30% + Blessing roll · 50% full heal + rare item / 50% −30% HP + scar |

Generic events (17):

| id | acts | title |
|---|---|---|
| `ev_dice_goblin` | 1-3 | The Dice Goblin (d20 bet: 11-19 / nat 20 / nat 1) |
| `ev_session_cancelled` | 1-3 | Session Cancelled (Real Life) |
| `ev_snack_run` | 1-3 | Snack Run |
| `ev_cursed_clearance` | 1-3 | Cursed Ring Clearance Sale |
| `ev_trap_hallway` | 1-2 | I Check for Traps |
| `ev_mimic_meeting` | 1-2 | Mimics Anonymous |
| `ev_wizard_did_it` | 1-2 | A Wizard Did It |
| `ev_goblin_mlm` | 1 | An Exciting Business Opportunity |
| `ev_fountain_youth` | 2-3 | Fountain of Questionable Youth |
| `ev_retcon` | 2-3 | Retcon |
| `ev_career_fair` | 2 | Necromancy Academy Career Fair |
| `ev_overdue_book` | 2 | Extremely Overdue |
| `ev_owlbear_daycare` | 2 | Little Talons Owlbear Daycare |
| `ev_rules_lawyer` | 3 | Bracket & Bracket, Rules Lawyers |
| `ev_infernal_dmv` | 3 | The Infernal DMV |
| `ev_dragon_yard_sale` | 3 | Dragon's Yard Sale |
| `ev_dm_notes` | 3 | Behind the Screen |

Generic events per act: 8 / 12 / 10 (plus the 12 hero events in every act). Rewards used: gold (±), heal / damage
(fractions and flat), party XP, single-hero XP, rare / legendary / common / cursed items (hero events prefer that
hero's own unowned `hero:` items, else any item of that rarity the hero can use, equipped on them when the slot is
free), consumables (sold for 15 gold each when the pockets are full), learn / upgrade a skill, Blessing rolls (with or
without curses), add / remove scars, normal and elite fights.

### Narrator (`js/data/narrator.js`)
Lines for every ARCHITECTURE §3.10 key: 8-10 per key (8+ everywhere), 49 tips. The DM voice: snarky, sleep-deprived,
secretly proud, fudges dice, Cheetos, "rocks fall". Shopkeeper keys (`shop_*`) are in the shopkeeper's voice (the shop
screen shows them in his speech bubble), `tavern_greet` in the barkeep's, `gameover_title` / `victory_title` are short
titles (the screens quote them under "Total Party Kill" / "Victory!"), `rest` / `recruit` lines lead into the run
layer's "The party heals N HP." / "X joins at level N." sentences.

Tokens are used only where **every** caller fills them (DD.narrate leaves an unfilled `{token}` in the text):

| key | tokens | callers |
|---|---|---|
| kill, env_kill | hero, enemy | actions.js (`hero` may be a summon's name, e.g. a corgi) |
| overkill | hero, enemy, n | actions.js (n = overkill ≥ 10) |
| multi_kill | hero, n | actions.js (n = kills in one skill, ≥ 3) |
| hero_downed | hero, enemy | actions.js (`enemy` is 'gravity' without a culprit) |
| hero_revived, signature | hero | actions.js, combat.js |
| round_start | n | combat.js (round ≥ 2, 20%) |
| recruit | hero, name | run.js |
| everything else | none | victory / defeat / treasure / shop_buy have callers with and without vars (screens pass `{}`), so none |

Tips: every tip was checked against the engine source; the test re-checks the numbers in-engine (Guard +2 Block / AP,
poison vs burn and Block, pits / YEET / heroes −25%, bump 3, lava 8 + Burn 2, Hype +8 / +20 / +4, high ground +25%,
Help Up 2 AP → 25%, shocked water 4 (6 if Wet) + Stun, barrel 8, Smash 1 AP / 5, fountain 10, Frozen ×1.5, Marked,
sleep vs stun, armor min 1, brutal ×1.25 / ×1.2, tavern rest 35% + a scar, act clear 50%, 3 pockets).

### Tests (`tests/content/narrative.js`, 10 suites, ~6.2k assertions in isolation; review additions listed under Review)
- `events — registry, copy and hero events`: shapes, title / label / hint lengths, 2-5 sentences, 2-3 choices, risk +
  free choice, acts coverage, one gated hero event per hero.
- `events — text, requires and gold costs`: every event opened through `DD.Run.openEvent` / `currentEvent`; availability
  (acts, hero gating); every "Pay N gold" hint has a `requires` that locks at N−1 and opens at N.
- `generic events (acts 1+)`, `generic events (acts 2-3)`, `hero events`: every choice resolved through
  `DD.Run.chooseEventOption` on cloned run states (own RNG stream per seed) and checked against its hint: exact gold, HP
  (heal / damage maths incl. max-HP changes from level-ups / items / Blessings), XP per hero, skills (learn / queue /
  upgrade / consolation), items (rarity, hero ownership, equipped), consumables (+ the 15-gold sale), scars, Blessing
  rolls, queued fights (kind + act). Every random branch must be reached (the d20's nat 1 / nat 20 too). Hero events
  also: offered only with the hero alive, and every choice still resolves with a stand-in without the hero.
- `events — fallbacks`: full pockets, 4 sockets (queued learn), everything maxed (consolation XP), no scars.
- `event fights start and auto-battle`: a normal and an elite event fight start via `DD.Run.startQueuedCombat()`,
  match act / kind, auto-battle to the end and hand over to rewards.
- `narration — every key, line counts, tokens (static)` and `narration tokens are filled in practice`: DD.narrate is
  recorded during real sandbox fights (every engine key forced through its real call site with a low-rolling cosmetic
  RNG), a real run (run_start, shop, tavern rest / recruit, treasure, act clear, a fight to rewards) and the screens'
  `UI.narrate(key, {})` calls: no unfilled token in any produced line and every caller's vars cover the token table.
- `tips — 30+ and their numbers checked in-engine`.
In isolation, missing real heroes are stood in by fixture clones (restored afterwards); with all content loaded the
real heroes are used.

## Public API

- `DD.Narrator.TOKENS` — `{ key: [tokens every caller fills] }` for the §3.10 keys. `DD.Narrator.KEYS`,
  `DD.Narrator.LINES` (this file's lines), `DD.Narrator.tokensOf(line)`, `DD.Narrator.badTokens(key, lines?)` (lines
  using a token the key's callers do not fill). Other authors can test their own narration lines with it.
- Events have no public helpers; other content may check `DD.getEvent('ev_…')` or the `hero` field.

## Deviations

1. Event `text` is a plain string (`run.js` and the event screen accept strings or functions).
2. Beyond the §9.5 event API, hero-targeted rewards use public run-layer functions at runtime: `DD.Run.grantHeroXp`
   (XP for one hero; `api.xp` is party-wide), `DD.Run.learnableSkills` (pick from the hero's own pool),
   `DD.Run.addItem` + `DD.Run.autoEquip(id, heroIdx)` and `DD.Rewards.randomItem({ hero })` / `ownedItems` (an item for
   that hero, equipped on them), and `DD.Run.addScar(idx, scarId)` for a named scar (Corelos' fine print gives
   `scar_owes_the_dm`; `api.addScar` can only roll a random one). Everything else goes through `api.*`.
3. Hero events carry `hero: '<heroId>'` (read by the event screen for the portrait) and weight 2.
4. Fallbacks not spelled out in hints (edge cases only): "learn" falls back to an upgrade, an upgrade or a Blessing
   roll with nothing left to give falls back to 15 XP for that hero, an item with an empty item registry is paid out
   as gold (the API's behaviour), and Corelos' debt scar becomes a random scar when he already owes the DM. The
   outcome text always says what happened instead.

## Core fixes

None.

## Requests

- **META-RUN (event API)**: `api.xp(n, heroIdx)` for one hero, `api.giveItem({ ..., heroIdx })` to prefer a wearer,
  and an optional `scarId` on `api.addScar` / `api.removeScar` would let events stay inside the API.
- **META-UI / lead**: `hint` and `label` are rendered as-is, so they must be strings. Accepting `(run) => string`
  would allow act-scaled numbers in hints. Also consider letting `DD.narrate` / `UI.narrate` skip lines with unfilled
  tokens: today `victory`, `defeat`, `treasure` and `shop_buy` get vars from the engine / run but `{}` from the screens,
  so no author can use `{hero}` / `{gold}` / `{name}` on those keys.
- **HUD / META-UI** **[`hero_death` resolved at integration: the rewards screen of a fight where a hero is written out; `level_up` / `idle_dm` still open — see docs/notes/content-digest.md.]** `hero_death`, `level_up` and `idle_dm` have lines but no caller yet (e.g. narrate `hero_death` on
  the rewards screen when a hero is written out, `level_up` on the level-up screen, `idle_dm` after ~30 s of no input in
  the player phase). They use no tokens, so a caller can pass `{}`.

## Verification

- Isolated (`isolate=events,narrator,narrative`): all 162 suites pass (12.5k assertions), including the generic
  `content:` suites, `run: every registered event resolves through the event API` and the `ui: flow — event choice …` suite.
- Full run (all authors' content, 2026-10-30): 478 suites; my 10 `narrative:` suites pass with the real heroes / items /
  Blessings loaded. The only failing sections were 8 `bosses_act1: grimble …` suites (that author's file was mid-edit);
  none mention events or narration.
- Screenshots (`.tmp/narrative/`): `ev_dice.png`, `ev_zar.png`, `ev_buga.png`, `ev_sla_sculptor.png` (event screen with
  the hero portrait), `outcome_mrw.png` and `outcome_buga.png` (outcome text + change chips; Buga's toaster picked his
  own Chain of Office), `combat_narr.png` (a kill line in the HUD's DM caption and log), `title.png` (a tip),
  `map.png` (act II intro). Outcome pages come from a scratch page (`.tmp/narrative/outcome.html?…&pick=N`) that loads
  the game and clicks choice N.
- Review pass (2026-10-31): see **Review** below for the runs and screenshots.

## Known issues

- The dice goblin's natural 1 says "Everyone loses 5 HP"; heroes never drop below 1 HP, so a hero at 3 HP loses 2.
  The event screen's change chips show the exact numbers. (Every other HP cost is a % of max HP, and Zarathor's
  exploding cart reports the HP he actually lost.)
- Gold and healing from events go through the run layer, so gold / heal Blessings (runMods) scale them, like all income.
- Event fights in act 1 can be elite (only when the player picks that choice; the hint says so).

## Review (adversarial pass, 2026-10-31)

Verified by running code, not by reading: every choice of all 29 events resolved through `DD.Run.openEvent` /
`chooseEventOption` with all content loaded, headless and with `useUi` on (4,176 outcomes; 0 problems, 0 swallowed
errors; `.tmp/narrative-review/p3.js`); every narration call site re-read (the token table holds); and every tip
re-checked against the engine source, including the ones the tips suite did not exercise (Block reset, undo, green
deploy zone, intent anchors, tracking shots, stun cancels, water / steam / ice / oil / webs, climbing and flyers,
starting Hype, 100-Hype signatures for all 10 heroes, armor-ignoring causes, consumables for heroes only, level-up
1 of 3, 4 Blessings).

### Fixed (most severe first)
1. **`hero_downed` printed "gravity looks far too proud of itself."** `actions.js` passes `enemy: 'gravity'` when nothing
   gets the credit (lava and other terrain, surfaces, burn / poison ticks), and 5 of 8 lines opened a sentence with
   `{enemy}`. The lines are rewritten so the culprit never starts a sentence. Tests: every line of every key is
   rendered with the lowercase values callers can pass (`LOWER_FILLS`) and no sentence may start lowercase; the
   in-practice suite now records a culprit-less down.
2. **Broken outcome sentences.**
   - "Make him go away" with full pockets read "Inside the hat, along with a rabbit demanding a lawyer, your pockets are
     full, so you sell it for 15 gold." The sentence is rewritten.
   - 8 learnable hero skills end in "!", "?" or "..." ("Fetch!", "Encore!", "Who's a Good Boy?", "Back In My Day..."),
     so learns printed "learns Fetch!." and "Back In My Day....". `stop()` now ends sentences once.
   - Two identical consumables read "Pocket Sand (Family Size) and Pocket Sand (Family Size)". `tally()` now prints
     "two …".
   - Zarathor's exploding cart at 1 HP said "loses 0 HP"; it now says he was already at 1 HP.
   Tests: a temporarily renamed "…!" skill; a one-consumable registry; every consumable-giving choice resolved with
   full pockets must read as a sentence; a 1-HP Zarathor; and every SPEC outcome is checked for doubled punctuation.
3. **Dominated or free choices.** Values are gold-equivalents from the EV table below.
   - *I Check for Traps*: "Sprint for the coin" (50% 50 gold / 50% −20% party HP) was worse than "Send the toughest
     hero first" (35 gold for a flat 8 HP) in both gold and HP, and 8 HP is nothing by act 2. Now the sprint pays 70,
     and the toughest hero loses 25% of max HP (values 31 / 15 / 33 → 31 / 24 / 27).
   - *Dragon's Yard Sale*: the haggle (40% rare / 60% −25% HP) was worse than the 1-gold common. The prize is now a
     free legendary, so the choices are a sure common, a paid sure legendary, or a gamble for a free one (39 / 30 / 17
     → 40 / 31 / 41).
   - *Glimmerjaw's Discount Bling*: the haggle's "fail" still paid 25 gold for 8 HP, so gambling beat paying 50 gold
     for the same rare. The fail now costs Zarathor 25% of his max HP and no gold, and the text names the HP he
     actually lost (30 / 52 / 11 → 30 / 36 / 11).
   - *Your Patron Would Like a Word*: "Sign without reading" was a free upgrade plus a free Blessing roll (9.2% curse
     chance): the best choice of any hero event, for the hero whose design is "bargains that come due". The fine print
     now adds the scar **Owes the DM Money** (−5 gold per won fight; a random scar if he already owes), via the public
     `DD.Run.addScar(idx, scarId)` (about 100 / 33 / 60 → 55 / 33 / 60).
   - *A Sculptor Wants to "Fix" Him*: "Let her chisel" paid an upgrade and 30 gold for 25% of Slate's HP (82 vs 11 / 15).
     The 30 gold is gone ("you never see a coin of it").
   - Flat HP costs in all-act hero events were free by act 3, when heroes have 40-70 HP: Marwyn's mirror (−4 HP to the
     others) and Josiah's lab assistants (−3 HP to everyone) now cost 10% of max HP.
4. **Narration variety**: two `boss_start` lines nearly repeated lines other authors put on the same key (`dm.js` "dims
   the lights and puts on the boss music. From his phone. On speaker."; `grimble.js` "This one I actually prepped.").
   They are replaced with the laminated stat block and the forty-hour mini. Test: none of my lines shares 5 words in
   a row with another of mine on the same key; an overlap with another author's line is a content advisory.
5. **Tips made exact.**
   - "Artillery is anchored to the ground" is now "ground-targeted attacks keep their red tiles": the code's rule is
     per intent anchor, not per enemy type.
   - "Help them up before the last enemy falls" is now "before the fight ends": boss, survive and protect objectives
     end fights too.
   - New in-engine checks: a ground intent keeps its tiles and a self intent moves when the attacker is pushed; a hero
     still down at victory gets 1 HP, a Scar, a down and half XP; the third down writes them out.

Tests are meaningful: re-introducing three of the original bugs (an `{enemy}`-first downed line, the old hat sentence,
`stop()` without its check) fails 3 assertions in 2 suites. All suites are seeded, so runs are deterministic, and
they finish in milliseconds.

### Balance numbers
EV per choice (`.tmp/narrative-review/p6.js`, 200 resolutions each, real content, party at 60% HP, 200 gold, one scar).
Gold-equivalents: gold 1, 1% of party max HP 1, XP 2 per point per hero, items 40 / 80 / 150 (cursed 25),
consumable 25, scar −45, Blessing roll 40 (the shop's re-roll), upgrade or learn 60 (a tome), fights 0 (their own
rewards roughly pay for their risk). After the fixes no choice is beaten by another in the same currencies. Remaining
spreads come from XP and fights, which this model under-values early (one level is about 100 gold-equivalent: an HP
bump, a Blessing roll and a level-up pick). Party-wide XP choices are therefore stronger in act 1 than the table says.

AutoPlay sims of the fights events start (`.tmp/narrative-review/p7.js`, 12 fights per row, real encounters, `makeRunHero` parties):

| fight | win | HP left on wins | heroes down at end | rounds |
|---|---|---|---|---|
| act 1 normal, L1 | 100% | 96% | 0.00 | 3.5 |
| act 1 elite, L1 (an event on row 1) | 100% | 90% | 0.08 | 5.8 |
| act 1 elite, L2 / L3 | 100% / 100% | 93% / 95% | 0.00 / 0.00 | 5.1 / 5.6 |
| act 2 elite, L5 | 100% | 90% | 0.00 | 5.8 |
| act 3 elite, L8 | 100% | 77% | 0.17 | 9.8 |
| act 1 elite / normal, L1, Brutal | 100% / 100% | 89% / 94% | 0.17 / 0.08 | 7.0 / 4.7 |

An event's "fight an elite battle" is not a run-ender, even on row 1 of act 1. At the current enemy tuning, event
fights are rewards (elite loot, gold, XP) more than risks. That tuning belongs to the enemy and engine areas.

### Left as is (judged fine)
- Josiah's paid contract (upgrade and 2 consumables for 35 gold, value 75) stays the best choice of its event: hero
  events are generous on purpose, and it costs gold.
- "Join his downline" (+4 gold EV) stays a bad deal on purpose: it is an MLM.
- A hero item is equipped on another hero when the star's slot is taken; the outcome says who wears it.
- Hero events forced open without their hero (debug only: `requires` gates them in runs) keep the absent hero's
  pronouns for the stand-in.
- `hero_death`, `level_up` and `idle_dm` still have no caller (see Requests).

### Runs
- Isolated: `suite=narrative&isolate=events,narrator,narrative` 10/10 pass (6,196 assertions);
  `suite=content:&isolate=events,narrator,narrative` 8/8 pass.
- Full run: 502 suites, 61,263 assertions. All 10 `narrative:` suites pass with the real content, as do
  `run: every registered event…` and the three `ui: flow` suites. The only failures are 2 `bosses_act1: rat king`
  sections (18 assertions: the sluice puzzle and flushing damage). `ratking.js` and its tests were being edited during
  the run, and no failure mentions events or narration.
- Screenshots (`.tmp/narrative-review/`): `ev_cor.png` and `ev_zar.png` (event screens with the hero portrait and the
  new hints), `out_zar_3.png` (the cart explodes: text and chip both say −6 HP), `out_jos.png` (upgrade and
  consumable chips, 4 pockets), `out_dragon.png` (the offended dragon, per-hero HP chips), `out_cor.png` (the fine-print
  choice opens the Blessing roll modal). `shot_outcome.sh` takes the outcome pages.
