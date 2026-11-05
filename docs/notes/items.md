# ITEMS (shared pool) — notes

Files: `js/data/items.js`, `tests/content/shared.js` (suites `items: …`). Scratch: `.tmp/items/` (`mut/` = a mutant
harness: `bash .tmp/items/mut/run.sh <mutant|base> "suite=items&isolate=items,shared"`, Chrome-slot aware).
Run: `bash tools/test.sh "suite=items&isolate=items,shared"` · rarity sim: `bash tools/test.sh "suite=items: balance&itemsim=1&n=8&verbose=1"`
(extra `lvl=`, `difficulty=brutal`, `kinds=elite,boss`) · per-item outlier sim:
`VTB=1800000 bash tools/test.sh "suite=items: per-item&itemsim=each&n=8&kinds=normal,elite&verbose=1"` (extra `carrier=tank`,
`only=id,id`, `seed=`, `difficulty=`).

## Summary (v2)

50 hero-agnostic items (`hero: null`, plain snake_case ids): 17 weapons, 16 armor, 17 trinkets — 19 common, 16 rare,
7 legendary, 8 cursed. Prices are the rarity defaults (40 / 80 / 150 / 25) except the Pay-to-Win Medallion (1 gold).
Stats the engine applies (`hp ap mov armor dmg heal range hype init`) live in `stats` and are spelled out in `desc`
(reward / shop cards print only `desc`); everything else is a §5.3 hook.

v2 rules every item follows (user: initiative order, no Guard, "the shield at the start of combat should go", simple
skills; DESIGN §4.1–4.2, §6 Simplicity; `docs/notes/v2-migration.md` §8.7):
- **One clear effect per item** (a stat line plus at most one effect); cursed = one upside + one funny downside. Every
  desc reads in one breath (≤ 150 characters, tested).
- **No starting shield**: no `stats.block`, no Block from `onCombatStart`. Block only from the Turtle Shell (earned by
  standing still, at your turn end), the Undying Undies (on a lethal hit) and Steve's Cower (a skill). Tested for every
  item with enemies acting first.
- **"Per turn" = each unit's own turn** (`state.turn`): your turn, an enemy's turn (your attack of opportunity) and
  another hero's turn (a delegated swing) are separate turns. **"During your turn"** = `DD.Combat.isTurnOf(wearer)`.
- **Attacks of opportunity** are skill hits (damage riders apply: Bleed, Burn, Poison, pushes, Darryl, Spork, Whetstone…)
  but **not "using a skill"** (no Pay-to-Win gold, no Chaos Crystal surge, no Flail backswing, the Hourglass unspent).
- Nothing reads intents or telegraphs; status durations follow the owner's own turns.

| id | name | slot · rarity | mechanics (v2 changes in **bold**) |
|---|---|---|---|
| rusty_shiv | Rusty Shiv of Tetanus | weapon · common | skill hits on a foe: +1 Bleed |
| tiki_torch | Tiki Torch (Borrowed From a Luau) | weapon · common | skill hits: +1 Burn |
| hygiene_fork | Fork of Questionable Hygiene | weapon · common | skill hits: +1 Poison |
| butter_knife | Butter Knife of Grim Resolve | weapon · common | +10% damage |
| yardstick | Yardstick of Reach | weapon · common | +1 range (skills and thrown consumables with range 2+) |
| big_stick | Big Stick (Diplomatic Edition) | weapon · common | once per turn, an adjacent foe hit by a skill is pushed 1 (**per own turn**) |
| passive_aggressive_polearm | **Polearm of Passive Aggression** | weapon · common | **new: a foe your attack of opportunity damages stops (its walk ends); the desc says "melee basic attacks only"** |
| flametongue_knockoff | Flametongue (Knockoff) | weapon · rare | skill hits: +2 Burn |
| discount_headsman_axe | Discount Headsman's Axe | weapon · rare | +4 skill damage vs foes at or below half HP |
| high_horse_lance | Lance of the High Horse | weapon · rare | **+4** skill damage vs lower foes (**no more 2-level climbing**) |
| ldr_longbow | Longbow of Long-Distance Relationships | weapon · rare | +1 range (incl. thrown consumables); +2 skill damage vs foes 4+ tiles away |
| vampire_spork | Vampire Spork | weapon · rare | skill hits heal 2 (2× per turn, **per own turn**) |
| excalibur_rental | Excalibur (Rental) | weapon · legendary | +20% damage; skill damage ignores armor |
| darryl_hammer | Mjölnir's Cousin Darryl | weapon · legendary | first foe hit by each skill knocked back 1; crash damage 6 (not 3) |
| overkill_glaive | Glaive of Giving 110% | weapon · legendary | +10%; a skill kill sends overkill +3 to the nearest foe within 2 (chains) |
| flail_of_flailing | Flail of Uncontrolled Flailing | weapon · cursed | +40%; each skill that hits a foe deals 2 to every adjacent ally (**not reactions**) |
| sentient_sword | Sentient Sword (Won't Shut Up) | weapon · cursed | +35%; turn start: foes within 3 Inspired **through their next turn** |
| chainmail_bikini | Chainmail Bikini | armor · common | +1 armor |
| grandmas_gambeson | Grandma's Quilted Gambeson | armor · common | +7 max HP |
| hedgehog_hoodie | Hedgehog Hoodie | armor · common | +2 HP; adjacent attackers take 2 (incl. their attacks of opportunity) |
| galoshes | Galoshes of Unwarranted Confidence | armor · common | +3 HP; immune to Root and Slow |
| fireproof_apron | Blacksmith's Apron (Fireproof-ish) | armor · common | immune to Burn; −50% fire damage |
| turtle_shell | Turtle Shell (Previous Tenant Evicted) | armor · common | turn end on the start tile: +4 Block (lasts through the enemies' turns) |
| mithril_shirt | Mithril Shirt (Pre-Owned) | armor · rare | +1 armor; **never provokes attacks of opportunity** (was +6 HP, +1 armor, 4 Block at combat start) |
| undying_undies | Undying Undies | armor · rare | once per combat a lethal hit leaves 1 HP + 8 Block |
| spiked_pauldrons | Spiked Pauldrons of Personal Space | armor · rare | +4 HP; adjacent attackers knocked back 1 (then they no longer pin you) |
| crash_helmet | Crash Helmet (Pre-Dented) | armor · rare | +6 HP; no bump or fall damage |
| tinfoil_hat | Tinfoil Hat | armor · rare | +3 HP; immune to Charmed / Confused / Silenced / Sleep |
| phoenix_down_jacket | Phoenix Down Jacket | armor · legendary | +6 HP; once per combat rise at 50% HP, 6 fire to adjacent foes (**a walk ends where he fell**) |
| gilded_breastplate | Gilded Breastplate of Conspicuous Wealth | armor · legendary | **at combat start +1 armor per 40 party gold (max +3)** (was up to 12 Block every turn start) |
| barrel_armor | Barrel Armor (Still Has Ale In It) | armor · cursed | +15 HP, +2 armor; pushed away → roll 2 further (**the −1 Move is gone: one downside**) |
| mimic_mail | Mimic Mail | armor · cursed | +3 armor, +4 HP; bites the wearer for 1 each turn start (never below 1) |
| haunted_plate | Haunted Plate (Kevin Lives Here) | armor · cursed | +2 armor, +6 HP; turn end: 50% swap with a random movable unit within 3 |
| coin_purse | Loot Goblin's Coin Purse | trinket · common | +2 gold per foe you defeat |
| foam_finger | Foam Finger (#1) | trinket · common | +10 Hype at start; +3 Hype per foe you defeat |
| pretzel_pouch | Pouch of Emergency Pretzels | trinket · common | using a consumable heals 4 |
| dog_treat_bandolier | Bandolier of Dog Treats | trinket · common | turn start: your summons heal **3** (**no more 2 Block**) |
| hang_in_there_poster | "Hang In There" Poster | trinket · common | below half HP: +25% damage |
| whetstone | Whetstone on a String | trinket · common | basic attack +2 damage (so melee heroes' attacks of opportunity too) |
| scented_candle | Scented Candle of Sanctity | trinket · rare | turn end: your tile becomes Holy Ground (2 rounds; heroes heal 3, undead take 3) |
| adrenaline_jar | Jar of Questionable Adrenaline | trinket · rare | **+2 initiative**; once per turn, a kill **on your own turn** gives 1 AP |
| encore_kazoo | Encore Kazoo | trinket · rare | +10 Hype at start; +25 Hype after your signature |
| compound_interest_ledger | Ledger of Compound Interest | trinket · rare | combat start: +1 gold per 10 held (max 8) |
| hireling_contract | Hireling Contract (Steve) | trinket · rare | combat start: Steve the Torchbearer joins (summon, acts on your turn) |
| chaos_crystal | Chaos Crystal (Cubic Zirconia) | trinket · legendary | each skill: 25% chance of a good Wild Surge (**not reactions**) |
| party_balloons | Bundle of Party Balloons | trinket · rare | +1 Move; flying |
| pocket_hourglass | Pocket Hourglass (Sand Not Included) | trinket · legendary | first skill each turn that costs AP costs 1 less (**own turn only**) |
| bag_of_tricks_tricked | Bag of Tricks (Tricked) | trinket · cursed | +1 AP; from round 2, a bad/chaotic Wild Surge at each of your turn starts |
| pay_to_win_medallion | Pay-to-Win Medallion | trinket · cursed | +30%; each skill costs 1 gold, or 3 HP when broke (never below 1) (**reactions free**) |
| indiscriminate_ring | Ring of Indiscriminate Regeneration | trinket · cursed | turn start: every unit within 3 (foes too) heals 5 |

Also registered: summon `steve_torchbearer` ("Torchbearer", 12 HP, 2 AP, move 4, random names Steve / Steve II /
Other Steve / Steve (Temp) / Steven / Big Steve; pot-helmet sprite with a stew-pot handle overlay) with skills
`steve_torch_poke` (1 AP: 3 fire damage to an adjacent foe + 1 Burn; melee, so also his attack of opportunity) and
`steve_cower` (1 AP, cooldown 1: 4 Block). He acts on his employer's turn (no initiative entry of his own).

Tests (`tests/content/shared.js`, 31 suites + 2 diagnostics; ~1,905 assertions isolated, ~5,360 with every content file,
where the 5 real-hero suites run): registry (counts, ids, unique names, desc shows every stat incl. initiative, one-breath
descs, no stats.block / Guard / telegraph wording, flavor ≤ 120, prices, hooks, the generic content validator and its v2
advisories); every item's numbers checked in sandbox fights against its desc; the v2 rules (no item gives Block before
the wearer's first turn — every item, enemies first — and only the Turtle Shell earns some by standing still; per-own-turn
budgets across the wearer's turn, an enemy's turn and another hero's turn; attacks of opportunity: Polearm stops (also on
the enemy's own AI turn), Mithril never provokes and the HUD's "provokes" preview / Undo agree, armor items' provokes
numbers equal the real stab, riders on reactions, reactions are not uses; the Phoenix rising mid-walk; the Jar's +2
initiative in 12 rolled fights); exact and side-effect-free previews with 28 items equipped; 15 random-loadout AutoPlay
battles covering all 50 items; DD.Rewards (every item drops at its rarity, reward text, shop stock / prices / limits,
elite / boss guarantees); the run layer (equip / unequip stats, init in heroStats, autoEquip refuses cursed, Gilded armor
from run gold, interest and coin gold in a run fight, Phoenix, finishCombat). With the real heroes loaded (all 16): the
whole pool worn in AutoPlay fights, previews exact for every hero kit with 12 hook-heavy loadouts, Balloons on Syllamin /
through Ellaria's Wild Shape, Dog Treats on her corgi and Josiah's raven, Steve beside Ellaria's pack, Hourglass +
Buga's Delegate (on Buga's turn), Pay-to-Win + Zarathor's coin toss, Mimic Mail + Sparrow's blood costs, Barrel Armor /
Crash Helmet + Marwyn's YEET, Barrel Armor on Slate, the Polearm stopping a foe walking off each melee hero (8), the
Whetstone on every basic (16) and the Kazoo on every signature (15); Pay-to-Win + the Echo Chamber passive.
Mutation-checked (scratch harness `.tmp/items/mut/`, each mutant one change): the author's set (the pre-v2 `round:phase` turn
key, the old `phase === 'player'` own-turn test, reactions counted as uses) and the review's 25 `r*` mutants regenerated
from the current file (see Review (v2)) — each fails at least one suite. (The author's `phoenix` / `flail` / `mithril` /
`pole` mutants still carry the old "+4 on reactions" Polearm, so they fail for that reason: use the `r*` ones.)

## Public API

- `DD.Items.ids` — the 50 shared ids (weapons, armor, trinkets). `DD.Items.has(unitOrRunHero, id)` — combat unit
  (`unit.items` array) or RunHero (`items` slots). `DD.Items.state(unit, id)` — an item's per-fight scratch state
  (`unit.data['item_<id>']`) or null (e.g. `.turn` = the `state.turn` a once-per-turn effect was spent in, Gilded's
  `.armor`).
- Summon `steve_torchbearer` (any content may summon him: `DD.Act.summon(owner, 'steve_torchbearer', x, y)`).
- Conventions other content can rely on: a "skill hit" for item riders = `d.cause === 'skill'`, not a consumable,
  final damage > 0, hostile target (attacks of opportunity included). Item damage tags: `item_glaive` (overkill splash),
  `item_flail` (backswing), `thorns` + `item_hoodie` (Hoodie reflection), `item_phoenix` (fire burst, cause `explosion`),
  `item_nonlethal` (self-harm clamped at 1 HP; first tag is the log label: `mimic bite`, `microtransactions`).
- "Whenever you use a skill" triggers (Chaos Crystal, Pay-to-Win Medallion, Flail backswing) ignore free re-resolutions
  flagged `ctx.rpEcho` (Echo Chamber) and attacks of opportunity (`ctx.opportunity` / `d.opportunity`); a delegated use
  (`resolveSkill(..., { pay: false })`, e.g. Mayor Buga's Delegate) still counts as the ally using a skill.
- Units: Balloons set `unit.flags.flying` and a cosmetic `unit.sprite` override (the hero's own spec + a balloon overlay,
  same size on screen whatever the sprite scale) at combat start, and re-tie it after skills and at round / turn
  boundaries when content swaps `unit.sprite` (Ellaria's Wild Shape, Basanos' forms). Gilded adds to `unit.armor` once at
  combat start. (The Lance no longer sets `flags.hop`.)

## Deviations

- Item `desc` repeats the stat bonuses that the UI also lists as stat lines (consistent with the fixture and hero items;
  reward / shop cards print only `desc`).
- "Per turn" counts `state.turn` (every unit's turn is its own), not rounds: the Big Stick / Vampire Spork budgets
  refresh on an enemy's turn (your attack of opportunity) and on another hero's turn (a delegated swing).
- Attacks of opportunity count as skill hits (riders) but not as skill uses (Pay-to-Win, Chaos Crystal, Flail): DESIGN
  §4.2 calls them free reactions; the descs say "use".
- Polearm: only a reaction that damages (`o.dealt > 0`, HP or Block) stops the foe. The stop is `Act.stopMove` on the
  foe (no status); the AI prices the reaction's damage, not the stop, so foes still try to leave and get "Stopped!".
- Phoenix Down Jacket: rising mid-walk (downed by an attack of opportunity or a trap) ends the walk on that tile
  (`Act.stopMove`), so "a hit that downs the mover ends its walk" (DESIGN §4.2) still holds after the instant revive.
- Gilded Breastplate: the armor is set once, when the fight starts (gold spent or earned mid-fight changes nothing);
  it is real `unit.armor`, so the HUD, previews and the AI's estimates see it.
- Pocket Hourglass: discounts only on the wearer's own turn (`isTurnOf`); on other heroes' turns and in deployment the HUD
  shows the full price. Its quote bookkeeping (below) is unchanged.
- Haunted Plate swaps the wearer even when the wearer is immovable (`swap(..., { force: true })` — "Kevin ignores
  physics"); immovable *other* units are never picked. Swaps never provoke attacks of opportunity.
- Undying Undies trigger on damage (`onTakeDamage`), so an instant `Act.kill` skips them; the Phoenix Down Jacket uses
  `onDowned` and covers both.
- Pocket Hourglass: "costs AP" means the final price. Sources that fire after items (scars, random passives, rules) can
  price a skill outright or only discount 2+ AP skills; the Hourglass prices every skill with and without itself (a
  re-entrant `costOf`, still pure) and is spent only by a paid use whose price it lowered, keyed by unit, skill and the
  slot's use count (free uses — Delegate, echoes, attacks of opportunity — never bump the count).
- Previews are honest dry runs: a Chaos Crystal surge (and every other item effect) shows up in the HUD preview of the
  skill that triggers it; a roll makes the preview `uncertain`.

## Core fixes

None.

## Requests

- **META-UI (`js/ui/ui.js` `STAT_LABEL` / `STAT_ORDER`)**: item stat lines know no `init`, so the Jar of Questionable
  Adrenaline's "+2 initiative" (and hero items with `stats.init`: Kiri's Name Tag, Valdris' Conditioner) shows only in
  the desc. Please add `init: v => signed(v) + ' initiative'`. The `block` label ("Block at combat start") is obsolete:
  no item grants it any more (Run.heroStats still sums it for old saves; it can stay hidden).
- **Lead (docs)**: ARCHITECTURE §3.4 Item still lists `block: Block at combat start` — v2: `stats.block` is ignored, add
  `init` (initiative modifier). DESIGN §7 "armor (HP/armor/Block)" → "armor (HP/armor/retaliation/resistances)".
- **AUTOPLAY (optional)**: AutoPlay never values an attack of opportunity's riders (the Polearm's stop, Darryl / Big
  Stick shoves on reactions), so in sims the Polearm measures ~0; nothing to change unless you model riders.
- **ENGINE / AI (optional, review v2)**: `DD.AI.opportunityDmg` → `estimate` ignores hooks, so a hero's reaction with an
  outgoing-damage item is under-priced when an enemy decides whether to walk off him (measured, knight's slash as the
  reaction: Whetstone 5 → really 7, Headsman's Axe on a half-HP grunt 5 → 7, Lance from above 6 → 10, "Hang In There"
  Poster 5 → 6, Excalibur vs the 1-armor brute 5 → 6; the % items — Butter Knife, Pay-to-Win, Flail — are exact via
  `dmgBonus`). Enemy-side numbers the HUD shows (incoming, armor items) are exact. A pure "flat outgoing" hint items could
  declare (like statuses' `telegraphFlat`) would fix it; low priority (the AI rarely walks off a melee hero anyway).

## Balance (v2 simulations, AutoPlay, real heroes, all 16 heroes)

Levels 2 / 4 / 6 for acts 1 / 2 / 3 (v2 slow leveling), normal difficulty, normal + elite encounters, no random passives.
Noise: about ±5 per row at 24 fights with four carriers, ±7 with one.
- Rarity sim (`itemsim=1`, 24 fights per mode; random items of one rarity on every hero; final content of Nov 3):
  none 96% wins / 6.2 rounds / 35% party HP lost / 0.8 downs; common 100% / 5.6 / 25% / 0.1; rare 100% / 6.2 / 27% /
  0.5; legendary 100% / 4.7 / 20% / 0.1; cursed 100% / 4.8 / 20% / 0.1 with the most damage (155 vs 126: the upside);
  act-odds loot 100% / 5.5 / 25% / 0.1. (A run before the Polearm rework: common 96% / 5.7 / 28% / 0.3, rare 100% / 6.0
  / 26% / 0.2 — common vs rare is within noise.) Three items per hero cut downs a lot, so the hard fights are the early
  ones, before loot.
- Per-item sim, the item on all four heroes (`itemsim=each`, 24 fights): Ring of Indiscriminate Regeneration +28 (8% HP
  lost: four rings heal everyone 20 a round), Barrel Armor +27, Haunted Plate +20, Scented Candle +18, Gilded
  Breastplate +17 (at 80 gold: +2 armor), Mithril Shirt +15, Mimic Mail +12, Chainmail Bikini +11, Turtle Shell +6,
  Gambeson +5, Lance +3, Adrenaline Jar +1, Dog Treats / Rusty Shiv / Polearm ≈ 0. Armor is the strongest stat in v2
  (every hit lands; no Guard).
- The same with one carrier, the tank (`carrier=tank`, 24 fights): Haunted Plate +17, Ring +12, Barrel +9, Mimic +8,
  Mithril +8, Gilded +7, Bikini +7, Candle +5, Phoenix +2; Butter Knife +6, Big Stick +5, Whetstone +4, Rusty Shiv +3,
  Jar +2, Lance +1, Polearm 0. So the four-copy outliers (Ring, Barrel) are stress cases a run can't assemble (one copy
  each, cursed items are never auto-equipped and a shop sells at most one); with one carrier every cursed item sits in the
  legendary band. Not changed for that reason; watch the Haunted Plate (Kevin's swaps seem to cost AutoPlay nothing).
- The Polearm: as "+4 on attacks of opportunity" it measured +0.1 on its tank and −1 with four carriers — the AI prices
  the bonus and simply never walks away from a melee hero, so it never fired. Reworked to the stop (a rider the AI does not
  foresee), which still measures ≈ 0 in sims (+0.2 / +1.1: reactions are rare, ~0.25 hero reactions per fight in the
  engine's own census) but matters in exactly the fights it is for: divers (`assassin` / `skirmisher`: spiders,
  gargoyles, wisps, act-3 divers, the DM's cameos) walking past the tank, taunted foes and archers stepping back.

## Known issues

- Items acting on attacks of opportunity (Polearm, the reaction riders) rarely fire in AutoPlay sims because the AI avoids
  provoking; balance numbers for them are mostly noise.
- `UI.statLines` shows no initiative line (Request above); the desc says it.
- Pocket Hourglass tells paid uses from free ones through `slot.uses` (`pay()` quotes, then bumps it). Content that bumps
  `slot.uses` itself during a free use, right after a cost query for that skill, would make that use count as paid.
- Steve's random name consumes one roll of the combat RNG at spawn (deterministic, but it shifts later rolls).
- Balloons drawn above the head sit under the HUD's HP bar / status row (cosmetic).
- Phoenix Down Jacket rising on the wearer's own turn (downed by an attack of opportunity on his walk, or a trap) leaves
  him at 0 AP with his statuses gone for the rest of that turn: going down costs the turn (the engine's `down()` zeroes AP
  and clears statuses, `Act.revive` keeps 0 AP; full AP at his next turn). Intended (he did go down); not in the desc.
- AI estimates of a hero's reaction ignore outgoing-damage items (Request above, ENGINE / AI).
- Full `tools/test.sh` (Nov 4, review v2, final): 799 suites, 2 failing sections, both `integration` (cross-content: unlock
  conditions / "ten real heroes" vs 16; protect objective: "no XP" wording) — not this area; every `items:` suite passes,
  0 swallowed errors, no content advisories about shared items. (Nov 3, the author's final run: 780 suites, 33 failing
  sections, none from the items.)

## Review (v2)

Adversarial review of the v2 conversion above (Nov 4), by running code. Scratch (all Chrome-slot aware):
`.tmp/items-v2rev/probe.sh` (+ `probe.js`: Phoenix / Undies mid-walk, Sentient Sword timing in both initiative orders,
the Polearm vs the act-1 spider, AoO estimates vs real hits, a 40-fight real-hero AutoPlay fuzz of the AoO items),
`.tmp/items-v2rev/shot.sh` (+ `scene.js`: `pole`, `party`, `deploy` scenes), mutants in `.tmp/items/mut/items_r*.js`
(`bash .tmp/items/mut/run.sh <name> "suite=items&isolate=items,shared"`).

Verified (held):
- **desc == effect** for all 50 items and Steve's two skills, line by line against the hooks; every desc ≤ 150 chars,
  one stat line + one effect (cursed: one upside, one downside); no Guard / telegraph / intent / starting-shield wording;
  names, prices, flavors and jokes intact; no hero pronouns in item text.
- **No pre-fight Block**: every item, enemies first — now asserted non-vacuous (the enemies' round-1 turns are really
  watched for all 50). Gilded's armor is `unit.armor`, not Block; Steve, the Turtle Shell and the Undies earn Block mid-fight.
- **Per-own-turn**: `state.turn` increments at every unit's turn start (`beginTurn`), `isTurnOf` covers summons; the
  Sentient Sword's Inspired covers each foe's next turn and is gone at its end in heroes-first and enemies-first orders.
- **Attacks of opportunity**: the 40-fight real-hero fuzz (Polearm / Mithril / Pay-to-Win / Hoodie / Pauldrons / Darryl /
  Phoenix / Undies loadouts, 1,715 move-action walks): 0 reactions on a Mithril wearer, the damaging Polearm reaction
  ended the walk on the tile it was leaving (the fixture suites cover the rest), sane numbers, no swallowed errors.
  AoOs are rare under AutoPlay (12 in 40 fights, 1 Polearm stop): the AI's reach-aware targeting avoids provoking, as
  the author found. `Act.stopMove` cannot
  leak into a later walk (`moveAlong` clears it at start and end), so the Phoenix's stop when he is not walking is harmless.
- **Visuals** (`.tmp/items-v2rev/pole_*.png`, `party0.png`, `deploy.png`): the Polearm stop reads "⚔️ Attack of
  opportunity!" → "🍢 Not so fast!" → "Stopped!" over a real goblin walking off Marwyn; the party-screen tooltip, the
  Jar's "Initiative +2" stat and Steve in the deployment roster render fine; Gilded's +2 armor shows on the unit.

Fixed:
1. **Polearm desc** didn't say who makes attacks of opportunity: on the 8 heroes without a melee basic (Zarathor,
   Syllamin, Corelos, Josiah, Ellaria, Buga, Kiri, Hjalmar) it silently does nothing. Now "A foe you damage with an
   attack of opportunity (melee basic attacks only) stops right there: its walk ends." (mechanics unchanged; tested).
2. **Tests that let wrong code pass** (each surviving mutant now fails a suite):
   - the Polearm without its `wears(o.attacker)` guard stopped its OWN wearer's walk whenever a foe's reaction hit him
     (`onOpportunityAttack` also fires on the mover's items) — new check: the wearer walking off a grunt walks on;
   - the Ring of Indiscriminate Regeneration moved to `onRoundStart` passed (the wearer acted first) — the Ring test now
     puts him second and checks nobody heals at the round start or on the mage's turn;
   - Kevin (Haunted Plate) at the wearer's turn START passed — now asserted never at his turn start (24 fights);
   - Dog Treats at the owner's turn END passed — now the enemy's turn in between must still see the pet hurt.
3. Mutation re-check: the author's `phoenix` / `flail` / `mithril` / `pole` mutants were cut from the pre-rework file (they
   carry the old "+4 on reactions" Polearm), so they failed for that reason. 25 fresh one-change mutants of the current
   file (Phoenix stop, Flail reaction guard, Mithril side, Polearm wears / dealt / target, Sword 2 turns, Turtle at turn
   start, Gilded as Block, Jar without init, Spork per round, Hourglass on any turn, Candle 3 rounds, Bag from round 1,
   Lance +3, Mimic 2, Barrel −1 Move, Dog Treats + Block, Ring at round start, Kevin / Dog Treats / Candle / Bag / Sword
   hook moved to the other end of the turn, Coin Purse 3): all 25 fail (4 survived before the new checks).
4. Scratch hygiene: `.tmp/items/shot.sh` launched Chrome without a slot (CLAUDE.md memory rule) — it now sources
   `tools/chrome_slot.sh`.

Not changed (judgement calls, see Known issues / Requests): the Phoenix rising mid-turn at 0 AP (going down costs the
turn); AI estimates of hero reactions ignore outgoing-damage items (engine `estimate`, request filed); the Polearm stays a
niche common (≈ 0 in sims because the AI rarely walks off melee heroes; in play it stops divers). Balance: a smoke rerun
of the rarity sim (n=4, 12 fights per mode) matches the author's table within noise (none 36% HP lost / 0.8 downs; act
odds 29% / 0.6; cursed 13% / 0.5 with the most damage). Items do soften regular fights a lot once heroes carry three;
the campaign sims (`tools/sim.sh`, which loot as they go) are where "hard but fair" is judged.

## Requests (Nov 3) — flyers, barrels (CONTENT SWEEP, shared)

- **Bundle of Party Balloons**: flight now floats over everything on the floor (the engine): the desc says so ("height,
  pits, liquids and everything on the floor (fire, puddles, traps)"). Clouds and blasts still reach the wearer.
- **Scented Candle**: "grounded units ending a turn there" (a flying wearer still leaves Holy Ground, but floats above it).
- **Steve's Torch Poke** is a hero-side single-target attack: it can set off an explosive barrel (kept: a torch and a
  barrel is the whole joke). No other item hook needed a change (`onSkillUsed` hooks guard `ctx.targetUnit`).
- Tests: "items: v2 requests — Party Balloons float over the whole floor, a flying Candle bearer, Steve pokes barrels".

## History (v1, condensed)

- Review (Oct 31): Crash Helmet also sinks `d.flat` (Weak Ankles scar leaked bump damage); Pocket Hourglass quotes keyed
  by use count (Power Nap re-pricing mid-execute kept the discount); Yardstick / Longbow descs name thrown consumables;
  Scented Candle desc names the undead half; Mimic Mail bite 2 → 1 (worst item in sims); Party Balloons legendary →
  rare; the per-item outlier diagnostic. Earlier: Scented Candle common → rare, Vampire Spork 3 → 2 heals per turn.
- Phase 4: the RULES hooks `modifyOutgoingPush`, `c.level` in `modifyCost` arrived; nothing needed migrating. Fair
  previews: dice-rolling hits preview `uncertain`, so the preview checks compare certain previews only.
- v2 (this pass, Nov 3): the conversion above. Kept every name, price and joke; changed six mechanics (Mithril Shirt,
  Gilded Breastplate, Lance, Dog Treats, Barrel Armor, Adrenaline Jar init), added one item (the Polearm), made the
  turn-based ones count own turns and the "use" triggers skip reactions; the test file was rewritten for initiative
  (heroes first, AI off by default, `endRound`, real AI turns where it matters) with 4 new v2 suites.
