# HERO: Zarathor, the Bedazzled — notes

Files (mine): `js/data/heroes/zarathor.js`, `tests/content/hero_zarathor.js` (suites `hero_zarathor: …`), this file.
Run: `bash tools/test.sh "suite=hero_zarathor&isolate=heroes/zarathor,hero_zarathor"` · generic validation
`bash tools/test.sh "suite=content:&isolate=heroes/zarathor,hero_zarathor"` · look
`bash tools/shot.sh "debug=1&fixtures=1&isolate=heroes/zarathor,hero_zarathor&gallery=zarathor&screen=gallery" .tmp/zarathor/g.png 1280x720 4000`.
Diagnostic (skipped by default): `suite=hero_zarathor: slot&zarsim=1&seeds=2&lv=3&acts=1&gold=60` (every real hero in the
same slot next to the fixture knight / cleric / rogue in real normal encounters: wins, damage per round, downs).

## Summary (v2)

User's brief: *"A fire-wielding tiefling warlock with an obsession for wild magic and "bling""* (he/him). Role: **ranged
fire damage that pays off Burn and sets up the party**, with gold as a resource and wild magic on demand. 24 HP (+4 a
level), 3 AP, move 4, armor 0, **init +1**, complexity 2, `unlock: null` (v2: everyone from the start).

**Passive — Drip Check** (one rule): *at the start of each of his turns, +10% damage for every 50 gold the party holds
(max +30%).* Snapshotted as the status `zar_drip` (stacks = tier; also counted at combat start so deployment shows it),
logged + a popup when it changes; spending or earning mid-turn counts from his next turn, so the icon always matches the
damage. The tooltip reads the purse live ("The party holds 25 gold: the next Drip Check … gives +0%"). It changes how
you play him: hoard gold for damage, or spend it (Throw Money, Gold Plating, the shop).

**Basic** `zar_basic` Eldritch Bling 🔮 (spell, 1 AP, range 4, LOS): *5 fire damage (+2 if the foe is Burning)* — the
Burn payoff. **Signature** `zar_signature` Bling Supernova 💥 (100 Hype, 2 AP, range 5, radius 2): *18 fire to every
foe, Dazzle the survivors* (banner, gold flash, coin rain, shake).

**Skill pool (10; starters ★)** — every skill one verb + at most one rider; levels I / II / III:

| id | name | kind · AP / cd / charges | desc (L1) | levels |
|---|---|---|---|---|
| `zar_fireball` ★ | Gold-Plated Fireball 🔥 | spell · 2 / 1 | 5 fire to every foe in radius 1 (range 5); ignites oil, webs and explosive barrels there | 5 / 6 / 7 |
| `zar_bling_throw` ★ | Throw Money At It 💸 | attack · 1 / 2 | spend 5 gold: 8 damage to a foe within 5 + Dazzle | 8 / 10 / 12 |
| `zar_hex` | Tacky Hex 🧿 | spell · 1 / 2 | a foe within 5 is Vulnerable for its next 2 turns | 2 / 3 / 3 turns, III + every foe next to it |
| `zar_bedazzle` | Bedazzle 💅 | buff · 1 / 1 | an ally within 4: its next damaging skill +4 to each foe it hits | +4 / +5 / +6 |
| `zar_rebuke` | Hellish Rebuke 😈 | spell · 1 / 2 | ward himself / an ally within 4 until its next turn: enemies whose attacks hit it take 5 fire | 5 / 7 / 9 |
| `zar_lasso` | Bling Lasso ⛓️ | attack · 1 / 2 | straight line 2–4: 3 damage, pull up to 3 toward him | dmg 3/4/5, pull 3/3/4, range 4/5/5 |
| `zar_strut` | Fabulous Strut 🕺 | move · 1 / 2 | dash up to 3 in a straight line, fire (2 rounds) on every tile he leaves | 3/4/5 tiles, 2/2/3 rounds |
| `zar_gold_plating` | Gold Plating 🥇 | buff · 1 / 2 | spend 6 gold: himself / an ally within 4 gains 8 Block | 8 / 10 / 12 |
| `zar_statue` | Statue of Me 🏆 | summon · 2 / – / 1 per combat | a 12-HP gold statue within 3; Taunts foes within 2 now and whenever his turn starts | 12/18/24 HP, radius 2/2/3 |
| `zar_wild_card` | Wild Card 🃏 | buff · 1 / 1 / 2 per combat | set off a Wild Surge (any) | any / a good one / two good ones |

**Statuses** `zar_drip` 💎 (decay never), `zar_rebuke` 😈 (decay `turnStart`, until the owner's next turn),
`zar_bedazzled` 💅 (until used; once per foe per skill, so multi-strike skills get it once; attacks of opportunity
neither use nor spend it, like Empowered). **Summon** `zar_statue` (Tasteful Statue: 1 armor, 0 AP, 0 move, immovable,
stun-immune, no skills; random names "Monument to Me", "The Thinker (About Me)"…; re-taunts in its `onTurnStart`, i.e.
at the start of his turns, also while he is downed; never taunts a foe charmed onto the heroes' side, which would idle
it and waste the charm — v2 review). **Items** (`hero: 'zarathor'`): `zar_ring_bling` Ring of
Excessive Bling (rare trinket: +5% damage, Drip Check counts every 30 gold), `zar_hellcard` Platinum Hellcard (rare
weapon: +10% damage, short on gold → pays the missing gold in HP, dynamic `hpCost`), `zar_shades` Shades of Indoor
Brilliance (legendary armor: +6 HP, +1 armor, enemies whose attacks hit him are Dazzled). No starting Block, no Guard
hooks.

**Combos (setups → payoffs with the party)**
- *Burn payoff* — Eldritch Bling +2 on Burning foes: Pebbles' fire (DESIGN: "Burning foes for Valdris' and Zarathor's
  payoffs"), Valdris' flame-forged edges, fire weapons / Blessings, lava, fire surfaces. His own Burn sources: Fireball
  lighting oil (cellar lamp oil, the mage's Oil Slick, act-2 oil), and his Strut fire lane once someone shoves or
  Lassos a foe through it.
- *Tacky Hex* (Vulnerable, +25%) before the party's big hitters — Burn ticks included.
- *Bedazzle* on whoever hits several foes next (Marwyn's cleave, Basanos' and Betty's sweeps, Kiri's volleys).
- *Bling Lasso* pulls an archer out of the back line into a melee ally's reach, a cleave, a pit (YEET), lava, water or
  his fire lane; pulls never provoke attacks of opportunity.
- *Statue of Me* gathers foes for a Fireball / an ally's AoE; taunted foes strike only the statue (allies next to them
  slip away for free) and walk to it through the melee heroes' attacks of opportunity.
- *Hellish Rebuke* on the party's taunter (Marwyn, Betty, Basanos): every taunted attacker roasts itself. Inside his own
  kit: Statue + Rebuke on the statue (his whole 3-AP turn) — the taunted crowd queues up to burn; Gold Plating + Rebuke —
  a hit the Block soaks entirely still burns the attacker.
- *Statue of Me* + the party's charms (Corelos' Sign Here, Syllamin's Heckle, Buga's Bribe, Love Potion): a charmed foe
  near the statue is left untaunted, so it still turns on its friends.
- *Wild Card* ↔ *Drip Check*: Make It Rain refills the purse (more drip, more money to throw).
- *Throw Money At It* / *Bling Supernova* Dazzle: a Dazzled foe's next attack lands a tile off and it makes no attacks of
  opportunity — an engaged ally walks away.
- *Fabulous Strut* lane: allies push foes into it (Burn 2); the AI paths around it (a wall of fire).

**Attacks of opportunity** (v2 rule): his basic is ranged, so he **never makes them** and he **is** the squishy target
divers go for. A plain move off a tile next to a melee foe provokes it (once per attacker per round; a lethal one downs
him on the spot). His ways out: Fabulous Strut (a dash: never provokes), Throw Money's Dazzle (the dazzled foe can't
strike), the Statue's taunt (taunted foes only strike their taunter), the Shades (a foe whose attack hits him — attacks
of opportunity included — is Dazzled) and Hellish Rebuke (an attack of opportunity on the warded unit is an enemy
attack: it burns).

**Barks**: 4–6 per key (13 keys), ≤ 70 chars, no removed mechanics; they name Marwyn, Josiah, Ellaria, Professor
Marbles, Mayor Buga, Syllamin, Slate, Betty, Kiri, Basanos and the new recruits (Hjalmar has his ring; Valdris should
forge him gold armor; Pebbles should fetch help, not a stick), plus "Attacks of opportunity? I only take
opportunities." The bling merchant event (`ev_zar_bling_merchant`, NARRATIVE) is his hero event.

Every registered id: hero `zarathor`; skills `zar_basic, zar_signature, zar_fireball, zar_bling_throw, zar_hex,
zar_bedazzle, zar_rebuke, zar_lasso, zar_strut, zar_gold_plating, zar_statue, zar_wild_card`; statuses `zar_drip,
zar_rebuke, zar_bedazzled`; summon `zar_statue`; items `zar_ring_bling, zar_hellcard, zar_shades`.

## v2 conversion (what changed and why)

Earlier passes (interrupted) had already moved the kit to v2 — no intents anywhere, no Guard / starting Block, own-turn
durations, `init: 1`, `unlock: null`, Chaos Bolt (a 4-way element chain) and the Sparkle counter ("every 4th spell sets
off a surge") cut so the passive is one rule, riders trimmed (Fireball's Burn, Throw Money III's splash Dazzle,
Bedazzle's fire, Rebuke III's Burn, Lasso III's Vulnerable, Gold Plating III's Thorns, the statue's burst and
re-taunt-from-II, the Supernova's gold), Tacky Hex added (Vulnerable),
Throw Money cooldown 1 → 2 (a v2 Dazzle spoils a whole enemy turn). This pass:
1. **Eldritch Bling** "5 fire and ignite its tile" → **"5 fire (+2 if it is Burning)"**: one rider either way, but the
   tile ignite rarely did anything (a unit's own tile) while a Burn payoff is the combo DESIGN's Pebbles / Valdris briefs
   expect from him. Fireball keeps the ground ignite (oil, webs, barrels, steam).
2. **Bling Supernova** "18 fire + Dazzle + the area ignites" → **18 fire + Dazzle** (one rider; the brief's "dazzles
   everyone").
3. **Bedazzle** is not used or spent by the ally's attacks of opportunity (`d.opportunity` / `ctx.opportunity` guards),
   matching the engine's Empowered rule — an incidental reaction must not eat the planned big hit.
4. Barks for Valdris, Hjalmar and Pebbles and an attack-of-opportunity joke; descs / blurb / role re-checked against
   removed mechanics (the definition suite greps for telegraph / intent / Guard / planning / Sparkle wording).
5. Tests: attacks of opportunity, the Burn payoff, two Burn combos, the one-rider checks (below).

## Tests

`tests/content/hero_zarathor.js`, 21 suites (20 run + the skipped sim), ~1,477 assertions, all v2 recipes (sandboxes start
on his turn, `heroesFirst`; `endTurn` / `endRound`; `statusByTurn` + `covers(n)` prove a status covers exactly its owner's
next n turns):
- **definition** — stats (24 / 3 / 4 / 0, init +1), unlock null, pool of 10, starting kit Fireball + Throw Money (a fresh
  recruit sockets exactly those), passive = 2 hooks (no spell counter), every
  desc at every level short (≤ 26 words) and showing its numbers, no removed-mechanic wording anywhere (descs, statuses,
  items, blurb, role, barks), one-rider checks (basic: Burning, no ignite; Supernova: Dazzle, no ignite), kinds / AP mix /
  charges, items without Block or Guard / combat-start hooks, barks 4–6 per key with cross-hero mentions incl. Valdris,
  Hjalmar, Pebbles.
- **every skill at every level** in sandbox fights (damage vs armor-free fixture foes, statuses, own-turn durations,
  displacement, summons, costs, cooldowns counted in his own turns, charges, gold): basic (no ignite, +2 vs Burning by
  status and by a fire surface, ×Drip, Wet = no Burn, LOS, preview 7); Fireball (allies spared, radius, cooldown, no
  lingering fire on bare floor, the desc names what it ignites, explosive barrel, oil chain → Burn, steam, Wet, corner);
  Throw Money (gold, Dazzle covers 1, a dazzled grunt misses its
  next stab ×6 seeds, broke, forced execution declined, Hellcard HP, 1 HP, killing throw); Hex (Vulnerable covers
  2/3/3, III neighbours, +25% for an ally, Silenced); Bedazzle (+N once per foe, AoE, non-damaging skill keeps it, waits
  across rounds, 3-strike skill); Rebuke (both enemy turns, ends at the ward owner's turn start, every attack, non-attack
  damage ignored, Thorns no loop, downed caster → credited to the warded ally, ×Drip, through a fully blocked hit with Gold
  Plating, Statue + Rebuke: three taunted grunts burn on the statue); Lasso (range, straight, min range, pits /
  YEET + env-kill Hype, lava, water, bump, immovable, target dies, map edge, through his fire trail); Strut (length,
  straight, trail rounds, blocked by units / crates / cliffs, Rooted, oil + water, map edge, foes Burn walking in, AI
  hazard); Gold Plating (range 4 exactly, Block until the owner's next turn start, on an ally); Statue (fields, radius,
  once per combat, immovable, soaks the taunted attacks, re-taunt at his turn start, newcomers, the unveil taunt covers
  exactly one turn, breaks into coins, keeps taunting while he is downed, a charmed foe is never taunted and still stabs
  its friend — mutation-checked: without the guard 3 assertions fail —, AutoPlay with a 0-AP summon); Wild Card (2
  charges unconditionally at level II, cooldown, any / good / two good over 12 seeds, `random` tag).
- **passive** (8 gold tiers × damage, turn-start snapshot, mid-turn spend / income, Ring step 30 and cap, readout, no
  surge counter), **signature** (radius, armor, Dazzle covers 1, allies spared, oil not lit, Hype maths, Silenced),
  **items** (stats, no starting Block, Shades Dazzle through the attacker's next turn, control, non-attack damage).
- **previews** — every skill × level: the dry run leaves the fight untouched (fingerprint), HP / KO / spawns / Hype exactly
  as previewed; a Wild Surge hides behind an uncertain preview.
- **v2 edge cases** — silenced (spells vs the rest), stunned (exactly one lost turn), sheep, charmed (−1 AP next turn,
  can't hurt the charmer), not enough AP, not his turn, null targets (no gold spent on thin air), strutting through lava
  to his doom, the winning Fireball ends the fight cleanly (no surge after the win).
- **attacks of opportunity** — he makes none (ranged basic); his walk off a grunt provokes it once (preview names it,
  4 damage, walks on, no undo), stepping next to a foe never provokes, the reaction is spent for the round, a lethal one
  downs him on the spot; Strut boxed in by two grunts provokes nothing; a Lasso pull past the knight provokes nothing;
  Throw Money's Dazzle lets the cleric walk off (control: it stabs); the statue's taunt lets the cleric walk off, and a
  taunted grunt walks to the statue through the knight's attack of opportunity; Shades Dazzle the stabber; Rebuke burns
  it; Bedazzle survives the knight's attack of opportunity and pays out on his own slash (mutation-checked: without the
  guard 3 assertions fail).
- **combos** — Hex → knight + mage; Bedazzle → cleave on three; Lasso III drags an archer to the knight; Statue gathers
  foes → Fireball on 2+; War-shout taunt + Rebuke → every taunted grunt takes 7; Strut lane + Shield Bash → Burn 2 → next
  round's basic 7; the mage's Oil Slick + Fireball → the pack Burns → basic 7.
- **AutoPlay** — party `zarathor, test_knight, test_cleric, test_mage`, 14 fights: fixture normal acts 1–3 + an elite at
  levels 1 (the starting kit) / 3 / 5 and the fixture boss at 3 and 5 (rolled initiative, deployment): no errors, sane
  state, basic / Fireball / Throw Money used, ≥ 8 distinct skills used, wins ≥ half.

## Balance

- DESIGN §5 checks: basic 5 (4–6) +2 vs Burning; 2-AP AoE 5/6/7; 1-AP gold hit 8/10/12 + Dazzle (paid in gold, cd 2);
  signature 18 (15–25); level II ≈ +20–25%, III ≈ +40–50% or one rider (Hex III's neighbours, Wild Card III's second
  surge).
- Slot comparison (the diagnostic sim above; v2 engine with attacks of opportunity; every real hero in the same slot next
  to the fixture knight / cleric / rogue, starters at II + 2 random pool skills, real act-1 normal encounters, 8 × 2
  seeds, level 3; other heroes mid-conversion, so their numbers will move): damage per round **Zarathor 10.8** (60 gold),
  Kiri 8.8, Syllamin 7.8, Corelos 7.3, Sparrow 6.0, Marbles 5.9, Ellaria 5.7, Buga 5.2, Slate 4.8, Marwyn 4.1, Josiah
  4.0, Betty 3.2, Basanos 3.2; damage taken per fight Zarathor 4.9 (reach-aware enemies stick to the engaged melee
  heroes), downs 0.00; all 208 fights won, none threw. His purse: **9.7 at 0 gold** (no money throws: basic + Fireball),
  10.8 at 60, 11.2 at 150 (Kiri 8.8 each time). Where it comes from at 60 gold: Fireball 284 (19 casts, ~15 each),
  Throw Money 247 (25 casts, ~10), basic 241 (50 casts).
- Verdict: the top ranged damage dealer by ~10% broke and ~25% with a purse, as intended for the glass cannon (24 HP, no
  sustain, divers go for him, no attacks of opportunity of his own). The surplus is bought with run gold (5 per throw,
  6 per plating: most of a normal fight's 12–20 income if used on every cooldown — the sims hand it out for free) and the
  drip's opportunity cost. The Burn payoff barely shows in these sims (the fixture party has no Burn sources); with
  Pebbles / Valdris it adds +2 per basic, ≈ +40% on his cheapest skill — a combo, not a baseline. No number changed.
- v2 review — which starting kit (the question: wild magic is pool-only, see Review (v2)). Starter comparison
  (`.tmp/zar-v2rev/p2.js`: act 1, level 2, only the two starters at I, next to the fixture knight / cleric / rogue, 60
  gold, AutoPlay; damage per round · rounds · party downs a fight):

  | starters | normal (48 fights) | elite (36) | boss (Grimble + Rat King, 48) |
  |---|---|---|---|
  | **Fireball + Throw Money** (kept) | 11.7 · 4.5 · 0.08 | 11.0 · 5.9 · 0.08 | 20 won · 4.1 downs |
  | Throw Money + Wild Card | 10.4 · 4.6 · 0.06 | 9.9 · 6.1 · 0.08 | 18 won · 4.7 downs |
  | Fireball + Wild Card | 10.1 · 4.8 · 0.13 | 8.9 · 6.8 · 0.22 | 11 won · 5.1 downs |

  Throw Money + Wild Card is within noise of the current kit (−10% raw damage; the damage stat undercounts Wild Card's
  sheep / freeze / charm / Inspired / Empowered / duck surges) and would put all three obsessions in the starting hand;
  Fireball + Wild Card is clearly worse against elites and the first boss (no Dazzle on the big target). With Throw Money
  + Wild Card the slot sim at level 3 read Zarathor 9.1, Kiri 9.3, Syllamin 7.9, Corelos 7.3 (shortest fights, least
  damage taken). Not applied: `tests/ui_tests.js` (UI's file) renders Zarathor's starting Fireball on the party screen
  (Blood Pact −1 AP struck-through), so the swap fails a suite I don't own — a Request below.

## Public API

- Statuses others may apply: `zar_rebuke` (set `st.data.dmg` on the returned instance), `zar_bedazzled` (`st.data.bonus`),
  `zar_drip` (stacks = +10% each).
- Summon `zar_statue`: `unit.data.r` (taunt radius).
- `DD.Zarathor` (read-only helpers): `dripStep(unit)`, `dripTier(unit)`, `assessDrip(unit)`, `strutPath(unit, tile)`,
  `statueTaunt(statue, quiet)`, `wildSurge(unit, source, good)`.

## Deviations

- None from the contract. Notes: the drip is snapshotted at his turn start (status `zar_drip`) rather than read live
  from gold, so previews and the icon always agree with the damage. Wild Card is `kind: 'buff'` (usable while Silenced).
  The Hellcard uses a dynamic `hpCost` (`(L, user) => missing gold`), so the HUD shows the HP price and the engine pays
  it (never below 1 HP). The statue re-taunts from its own `onTurnStart` (a hero summon's turn is its owner's).

## Requests

- **Lead (DESIGN §6, Zarathor brief)**: the brief still lists v1 ideas the v2 simplification dropped — the passive's
  "fire skills sometimes trigger a Wild Surge" (now: Drip Check is one rule; wild magic lives in Wild Card) and "chaos
  bolt that bounces" (cut: a 4-way element chain). Suggested wording: "passive *Drip Check* (more damage the more gold
  the party holds). Gold-spending skills (Throw Money At It, Gold Plating), a gaudy Fireball, a tacky Hex (Vulnerable),
  Hellish Rebuke, a fire-trail strut, Wild Card (wild magic on demand); his basic pays off Burning foes."
- **Lead (identity, v2 review — a decision for you or the user)**: the user's brief is "fire-wielding … with an
  obsession for wild magic and bling", the blurb promises wild magic and Marwyn's passive surges every fight, yet
  Zarathor's only wild magic is Wild Card, 1 of 8 learnable skills (a level-up offers one random own-pool skill, so it
  is missing in about half the runs). Proposed: starters **Throw Money At It + Wild Card** (Fireball to the pool) —
  balance within noise of today's kit (Balance table: −10% raw damage, same elite safety, boss 18/48 vs 20/48);
  Fireball + Wild Card is not an option (boss 11/48). It is a one-line change in `zarathor.js` (+ its test's POOL /
  starters / level-1 AutoPlay loadout), blocked only by the UI request below.
- **UI (`tests/ui_tests.js`, "ui: out-of-combat skill text and costs follow items and Blessings (party screen)")**: the
  suite finds Zarathor's Gold-Plated Fireball card on the party screen of a fresh run, i.e. it depends on his starting
  kit. Please socket it explicitly (e.g. `run.party[0].skills.push({ id: 'zar_fireball', level: 1 })` before
  `UI.show('party', …)`, or `DD.Run.learnSkill`), so a starter change (above) doesn't break it.
- **Lead / Pebbles (distinctness, v2 review)**: Zarathor's Fabulous Strut (straight dash 3/4/5, fire 2/2/3 rounds on
  every tile left, cd 2) and Pebbles' Hot Zoomies (path dash 4/5/6, fire 2/2/3 rounds on every tile left, cd 2) are the
  same skill — both are in their DESIGN briefs (Zarathor's "strut … that leaves a fire trail" since v1, Pebbles'
  "Zoomies … leaving a trail of fire"), and Zoomies is strictly the stronger one. Not changed here (it is the brief's);
  if one should move, Pebbles' zoomies are core to the dog, so give Zarathor's strut a different rider (e.g. "Dazzle
  every foe next to where he stops"); a lead decision, since it rewrites a brief item.
- **RULES (engine, taunt + charm, v2 review)**: a foe charmed onto the heroes' side that a hero-side unit Taunts stands
  idle on its turn (it may only attack its taunter, and the taunter is now a friend), so any taunt wastes the party's
  charm: probe `.tmp/zar-v2rev/p5.js` — the fixture knight's War Shout on a charmed grunt: without the shout it stabs its
  friend (14 → 10), with it nothing happens. Same for Marwyn's / Betty's / Basanos' / Pebbles' taunts over a Sign Here,
  Heckle, Bribe or Love Potion. Suggest: `addStatus(…, 'taunt')` from a unit of the charmed foe's effective side is
  refused, or the AI ignores a taunt whose taunter it may not attack. The statue now skips charmed foes itself.
- **Hero authors (Pebbles, Valdris)**: Eldritch Bling deals +2 to Burning foes — the "Burning foes for Zarathor's
  payoffs" combo in your briefs is real; his Fabulous Strut leaves fire surfaces (2–3 rounds) and Fireball ignites oil,
  if Pebbles wants fire to stand in.
- (Resolved) **Narrative**: `ev_zar_bling_merchant`'s third choice no longer promises XP (it pays 25 gold now).
- (Older, still open, optional) **RULES/AUTOPLAY**: AutoPlay rarely values Fabulous Strut (a dash with a fire trail):
  it is used to disengage only when a walk would provoke something worse; fine for balance sims, noted for completeness.

## Known issues

- AutoPlay uses Statue of Me when it is socketed (5 of 12 probe fights at level 5) but never Fabulous Strut in the
  fixture fights (its best score loses to attacks); both are covered by their own suites.
- Debug combats (`screen=combat` without a run) start with 0 gold, so Throw Money At It and Gold Plating are greyed out
  there by design.
- Wild magic is a pool skill only (Wild Card), so about half the runs never see it — see the identity Request.
- Statue of Me and Sparrow's Evil Twin are both "summon a decoy that Taunts": they play differently (an immovable 0-AP
  taunt tower that re-taunts vs a mobile clone with skills), and the vanity joke is pure Zarathor.

## Review (v2)

Adversarial review of the v2 + attacks-of-opportunity kit (role: ADVERSARIAL REVIEWER, owning the same three files).
Method: the 21 suites, the generic `content:` suites (isolated and in the full run), probes in `.tmp/zar-v2rev/`
(`run.sh p1.js` … `p5.js`; Chrome-slot aware), starter sims (`p2.js`), the slot sim, and shots (`g.png` gallery,
`gs.png` statue, `c1.png` deployment, `s1.png` statue + strut trail, `ps.png` party select).

**Verified (held)**
- desc == effect at every level of all 12 skills, the passive, the 3 statuses and the 3 items (numbers, ranges, areas,
  durations in the owner's own turns, cooldowns in his own turns, charges, gold); "next to" = 4-way (the circle area is
  Manhattan: Hex III leaves diagonal foes alone); every desc 10–23 words (the statue's 23 is the longest).
- Simplicity: every skill is one verb + at most one rider (the basic's +2 vs Burning is its payoff rider, Throw Money's
  gold is a cost); levels II = numbers, III = numbers or one rider (Hex III's neighbours, Wild Card III's second surge).
  Passive = one rule, still the comedic core. No v1 leftovers (intents, Guard, combat-start Block, XP, the Sparkle
  counter, Chaos Bolt); init +1; `unlock: null`; he/him everywhere, other heroes named without pronouns.
- Attacks of opportunity: he makes none (ranged basic); his walks provoke, Strut (dash) and Lasso (pull) never do;
  Throw Money / Supernova Dazzle and the statue's taunt let anyone walk away from those foes; the Shades Dazzle an
  opportunity attacker; Rebuke burns it; Bedazzle is neither used nor spent by an ally's attack of opportunity.
- Previews in a real run never touch run gold (`setGold` is a no-op while simulating); Rebuke burns through a hit the
  Block soaked entirely, and Drip Check boosts it; Statue + Rebuke works (three taunted grunts × 5); Drip shows at
  deployment; the statue can't taunt the taunt-immune fixture boss (fine).
- Visuals: sprite, statue on its "ME" plinth, the strut's fire trail, the drip badge, the kit on the party-select card.
- Combos with other heroes: the Burn payoff (Pebbles, Valdris, oil + Fireball, the strut lane + a shove), Hex
  (Vulnerable) and Bedazzle before the party's big hitters, Lasso into a melee ally / cleave / pit, Rebuke on a taunter,
  the statue's taunt and the Dazzles as disengage tools for engaged allies — at least 3 clear setups, 2 payoffs.

**Fixed**
1. **Statue of Me wasted the party's charms (bug).** `foesOf(statue)` includes an enemy charmed onto the heroes' side;
   the statue Taunted it, and a taunted foe may only attack its taunter — now a friend — so it stood idle instead of
   turning on its pack (probe `p4.js`: friend 14 → 10 without the statue, 14 → 14 with it). Any charm near the statue
   (Sign Here, Heckle, Bribe, Love Potion, a wild surge) was lost, at the unveil and at every re-taunt. Fix: `statueTaunt`
   skips foes whose `DD.Grid.effectiveSide` is the statue's. Regression in the Statue suite (mutation-checked: without
   the guard 3 assertions fail). The general rule (any hero taunt idles a charmed foe) is a RULES request above.
2. **Fireball's desc "ignite the area"** read as a lingering fire surface, which never appears on bare floor → "Ignites
   oil, webs and explosive barrels there." (+ test: no surface on bare floor, the desc names oil).
3. **Hellish Rebuke's desc** trimmed from 24 to 20 words (same mechanics; status text to match).
4. **Tests that could not fail**: Gold Plating's "range 4" assert was always true (it tested an empty tile) → an ally 4
   tiles away valid, 5 not; Wild Card's "2 uses per combat" sat behind an `if` that silently skipped it → unconditional
   (level II: no backfire can skip it). New: the starting kit, Rebuke × Drip, Gold Plating + Rebuke, Statue + Rebuke,
   the statue / charm regression.

**Found, proposed, not applied**
- **Wild magic is missing from the starting kit (identity).** The brief is "fire-wielding … obsession for wild magic
  and bling", the blurb promises wild magic and Marwyn's passive surges every fight, but Zarathor's only wild magic is
  Wild Card, 1 of 8 learnable skills (a level-up offers one random own-pool skill: absent in about half the runs). The
  review switched the starters to Throw Money + Wild Card (balance within noise, Balance table) and reverted it when
  the full run showed UI's party-screen suite depends on his starting Fireball — see the two Requests.

**Looked at, left alone**
- Fabulous Strut ≈ Pebbles' Hot Zoomies (see Requests: a brief-level overlap, Pebbles' version is the stronger).
- Statue vs Sparrow's Evil Twin (known), Gold Plating vs Valdris' Forge Armour (costs gold, gives more Block, cd 2 vs 1),
  Bedazzle vs Forge Weapon (one big skill vs every hit for a turn): distinct enough.
- The Hellcard at low HP pays at most down to 1 HP (the engine's rule for every HP cost, ARCHITECTURE §3.2 `hpCost`),
  so at 3 HP a 5-gold throw costs 2 HP.
- Bedazzle also pays out on a consumable the ally throws (the engine resolves consumables as skills, like Empowered).
- Rebuke burns per damage instance; no enemy has a multi-hit attack today.
- AutoPlay still rarely struts (the dash's value is the escape; its score loses to attacks): AUTOPLAY's call.

## History (v1, kept short)

v1 had Chaos Bolt (random element, leaps), the Sparkle counter (every 4th spell → a Wild Surge) and telegraph tools
(Dazzle shifting intents, the statue redirecting / cancelling them); its adversarial review fixed surges after a won
fight (`fightOver()` guard, still in `wildSurge`), Bedazzle's once-per-foe rule, the drip readout, Rebuke with a downed
caster, the Hellcard log and the statue's plinth. All of that is either gone with v2 or kept and re-tested above.

## Requests (Nov 3) — flyers, barrels (CONTENT SWEEP heroes-1, 2026-11-04)

Suite: `hero_zarathor: v2 requests — …`. Rules: `docs/notes/rules.md` "v2 requests".

- **Barrels.** Eldritch Bling (his basic: a spell basic counts) and Bling Lasso can be aimed at a volatile object: it
  detonates (1 AP, the Lasso's cooldown), credited to him, no gold spent. **Throw Money At It opts out**
  (`target.objects: false`): its 5 gold is paid inside `execute`, which doesn't run on a barrel, so a barrel shot would
  have been free. Gold-Plated Fireball still ignites barrels in its radius (fire).
- **Flyers.** Nothing of his implements a floor effect in a hook. His fire lane (Fabulous Strut) and fireball fire are
  core `fire` surfaces: flyers cross them unburned and see no hazard there (tested); walkers still catch fire.
- **Heals.** None of his skills heal (Gold Plating is Block, Rebuke a ward).
