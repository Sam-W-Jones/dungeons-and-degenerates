# ITEMS (shared pool) — notes

Files: `js/data/items.js`, `tests/content/shared.js` (suites `items: …`). Scratch: `.tmp/items/` (scene page + shots).
Run: `bash tools/test.sh "suite=items&isolate=items,shared"` · balance sim: `bash tools/test.sh "suite=items: balance&itemsim=1&n=8&verbose=1"`
(extra params `lvl=-2`, `difficulty=brutal`, `kinds=elite,boss`) · per-item outlier sim:
`bash tools/test.sh "suite=items: per-item&itemsim=each&n=8&verbose=1"` (extra `carrier=tank`, `only=id,id`, `seed=`).

## Summary

49 hero-agnostic items (`hero: null`, plain snake_case ids): 16 weapons, 16 armor, 17 trinkets — 18 common, 16 rare,
7 legendary, 8 cursed. Stats the engine applies (`hp ap mov armor dmg heal range block hype`) live in `stats` and are
also spelled out in `desc` (reward cards only show `desc`); everything else is a §5.3 hook. Prices are the rarity
defaults (40 / 80 / 150 / 25) except the Pay-to-Win Medallion (1 gold, "free to play").

| id | name | slot · rarity | mechanics |
|---|---|---|---|
| rusty_shiv | Rusty Shiv of Tetanus | weapon · common | skill hits on a foe: +1 Bleed |
| tiki_torch | Tiki Torch (Borrowed From a Luau) | weapon · common | skill hits: +1 Burn |
| hygiene_fork | Fork of Questionable Hygiene | weapon · common | skill hits: +1 Poison |
| butter_knife | Butter Knife of Grim Resolve | weapon · common | +10% damage |
| yardstick | Yardstick of Reach | weapon · common | +1 range (skills and thrown consumables with range 2+) |
| big_stick | Big Stick (Diplomatic Edition) | weapon · common | once per turn, an adjacent foe hit by a skill is pushed 1 |
| flametongue_knockoff | Flametongue (Knockoff) | weapon · rare | skill hits: +2 Burn |
| discount_headsman_axe | Discount Headsman's Axe | weapon · rare | +4 skill damage vs foes at or below half HP |
| high_horse_lance | Lance of the High Horse | weapon · rare | +3 skill damage vs lower foes; climb 2 levels per step (hop) |
| ldr_longbow | Longbow of Long-Distance Relationships | weapon · rare | +1 range (incl. thrown consumables); +2 skill damage vs foes 4+ tiles away |
| vampire_spork | Vampire Spork | weapon · rare | skill hits heal 2 (2× per turn) |
| excalibur_rental | Excalibur (Rental) | weapon · legendary | +20% damage; skill damage ignores armor |
| darryl_hammer | Mjölnir's Cousin Darryl | weapon · legendary | first foe hit by each skill knocked back 1; crash damage 6 (not 3) |
| overkill_glaive | Glaive of Giving 110% | weapon · legendary | +10%; a skill kill sends overkill +3 to the nearest foe within 2 (chains) |
| flail_of_flailing | Flail of Uncontrolled Flailing | weapon · cursed | +40%; each skill that hits a foe deals 2 to every adjacent ally |
| sentient_sword | Sentient Sword (Won't Shut Up) | weapon · cursed | +35%; turn start: foes within 3 are Inspired until their turn ends |
| chainmail_bikini | Chainmail Bikini | armor · common | +1 armor |
| grandmas_gambeson | Grandma's Quilted Gambeson | armor · common | +7 max HP |
| hedgehog_hoodie | Hedgehog Hoodie | armor · common | +2 HP; adjacent attackers take 2 |
| galoshes | Galoshes of Unwarranted Confidence | armor · common | +3 HP; immune to Root and Slow |
| fireproof_apron | Blacksmith's Apron (Fireproof-ish) | armor · common | immune to Burn; −50% fire damage |
| turtle_shell | Turtle Shell (Previous Tenant Evicted) | armor · common | turn end on the start tile: +4 Block |
| mithril_shirt | Mithril Shirt (Pre-Owned) | armor · rare | +6 HP, +1 armor, 4 Block at combat start |
| undying_undies | Undying Undies | armor · rare | once per combat a lethal hit leaves 1 HP + 8 Block |
| spiked_pauldrons | Spiked Pauldrons of Personal Space | armor · rare | +4 HP; adjacent attackers knocked back 1 |
| crash_helmet | Crash Helmet (Pre-Dented) | armor · rare | +6 HP; no bump or fall damage |
| tinfoil_hat | Tinfoil Hat | armor · rare | +3 HP; immune to Charmed / Confused / Silenced / Sleep |
| phoenix_down_jacket | Phoenix Down Jacket | armor · legendary | +6 HP; once per combat rise at 50% HP, 6 fire to adjacent foes |
| gilded_breastplate | Gilded Breastplate of Conspicuous Wealth | armor · legendary | turn start: +1 Block per 10 party gold (max 12) |
| barrel_armor | Barrel Armor (Still Has Ale In It) | armor · cursed | +15 HP, +2 armor, −1 Move; pushed away → roll 2 further |
| mimic_mail | Mimic Mail | armor · cursed | +3 armor, +4 HP; bites the wearer for 1 each turn start (never below 1) |
| haunted_plate | Haunted Plate (Kevin Lives Here) | armor · cursed | +2 armor, +6 HP; turn end: 50% swap with a random movable unit within 3 |
| coin_purse | Loot Goblin's Coin Purse | trinket · common | +2 gold per foe you defeat |
| foam_finger | Foam Finger (#1) | trinket · common | +10 Hype at start; +3 Hype per foe you defeat |
| pretzel_pouch | Pouch of Emergency Pretzels | trinket · common | using a consumable heals 4 |
| dog_treat_bandolier | Bandolier of Dog Treats | trinket · common | turn start: your summons heal 2 and gain 2 Block |
| hang_in_there_poster | "Hang In There" Poster | trinket · common | below half HP: +25% damage |
| whetstone | Whetstone on a String | trinket · common | basic attack +2 damage |
| scented_candle | Scented Candle of Sanctity | trinket · rare | turn end: your tile becomes Holy Ground (2 rounds; heroes heal 3, undead take 3) |
| adrenaline_jar | Jar of Questionable Adrenaline | trinket · rare | once per turn, a kill in your turn gives 1 AP |
| encore_kazoo | Encore Kazoo | trinket · rare | +10 Hype at start; +25 Hype after your signature |
| compound_interest_ledger | Ledger of Compound Interest | trinket · rare | combat start: +1 gold per 10 held (max 8) |
| hireling_contract | Hireling Contract (Steve) | trinket · rare | combat start: Steve the Torchbearer joins (summon) |
| chaos_crystal | Chaos Crystal (Cubic Zirconia) | trinket · legendary | each skill: 25% chance of a good Wild Surge |
| party_balloons | Bundle of Party Balloons | trinket · rare | +1 Move; flying |
| pocket_hourglass | Pocket Hourglass (Sand Not Included) | trinket · legendary | first skill each turn that costs AP costs 1 less |
| bag_of_tricks_tricked | Bag of Tricks (Tricked) | trinket · cursed | +1 AP; from round 2, a bad/chaotic Wild Surge at each turn start |
| pay_to_win_medallion | Pay-to-Win Medallion | trinket · cursed | +30%; each skill costs 1 gold, or 3 HP when broke (never below 1) |
| indiscriminate_ring | Ring of Indiscriminate Regeneration | trinket · cursed | turn start: every unit within 3 (foes too) heals 5 |

Also registered: summon `steve_torchbearer` ("Torchbearer", 12 HP, 2 AP, move 4, random names Steve / Steve II /
Other Steve / Steve (Temp) / Steven / Big Steve; pot-helmet sprite with a stew-pot handle overlay) with skills
`steve_torch_poke` (1 AP: 3 fire damage to an adjacent foe + 1 Burn) and `steve_cower` (1 AP, cooldown 1: 4 Block).

Every registered def: items above (49), `summon:steve_torchbearer`, `skill:steve_torch_poke`, `skill:steve_cower`.

Tests (`tests/content/shared.js`, 27 suites + 2 diagnostics; about 1,640 assertions with every content file loaded,
about 1,400 isolated, where the 5 real-hero suites skip): registry (counts, ids, unique names, desc shows every stat,
flavor ≤ 120, prices, hooks, the generic content validator accepts everything); every item's numbers checked in
sandbox fights against its desc (riders, damage math incl. high ground/armor/Block, AoE, allies, consumables and status
ticks excluded, once-per-turn / once-per-skill limits, immovable targets, map edges, crates, pits, lava, webs, deaths
mid-skill); cursed downsides; Steve; wild magic (only good surges / only bad-or-chaos, never on free echoes); the
Pocket Hourglass against later cost sources (rules, a scar, and every random passive with a `modifyCost` hook);
exact and side-effect-free previews with 24 items equipped (incl. a pit yeet, a crate crash, a chained overkill and 6
Chaos Crystal seeds) plus a consumable preview; 15 random-loadout AutoPlay battles covering all 49 items; DD.Rewards
(every item drops at its rarity, item reward text, shop stock/prices/limits, elite/boss guarantees); the run layer
(equip/unequip stats + HP shift, autoEquip refuses cursed, reward apply, interest and coin gold in a real run fight,
Phoenix in a run fight, finishCombat). With the real heroes loaded: all 49 items worn in AutoPlay fights by every
hero, previews exact for every hero kit with hook-heavy loadouts, Balloons on Syllamin and through Ellaria's Wild
Shape, Dog Treats on her corgi and Josiah's raven, Steve beside Ellaria's pack, Hourglass + Buga's Delegate,
Pay-to-Win + Zarathor's coin toss, Mimic Mail + Sparrow's blood costs, Barrel Armor / Crash Helmet + Marwyn's YEET,
Barrel Armor on Slate, the Whetstone on every basic (and Ellaria's Chomp) and the Kazoo on every signature;
Pay-to-Win + the Echo Chamber passive.

## Public API

- `DD.Items.ids` — the 49 shared ids (weapons, armor, trinkets). `DD.Items.has(unitOrRunHero, id)` — combat unit
  (`unit.items` array) or RunHero (`items` slots). `DD.Items.state(unit, id)` — an item's per-fight scratch state
  (`unit.data['item_<id>']`) or null.
- Summon `steve_torchbearer` (any content may summon him: `DD.Act.summon(owner, 'steve_torchbearer', x, y)`).
- Conventions other content can rely on: a "skill hit" for item riders = `d.cause === 'skill'`, not a consumable,
  final damage > 0, hostile target. Item damage tags: `item_glaive` (overkill splash), `item_flail` (backswing),
  `thorns` + `item_hoodie` (Hoodie reflection), `item_phoenix` (fire burst, cause `explosion`), `item_nonlethal`
  (self-harm that is clamped at 1 HP; first tag is the log label: `mimic bite`, `microtransactions`).
- "Whenever you use a skill" triggers (Chaos Crystal, Pay-to-Win Medallion) ignore free re-resolutions flagged
  `ctx.rpEcho` (the random passive Echo Chamber); a delegated use (`resolveSkill(..., { pay: false })`, e.g. Mayor
  Buga's Delegate) still counts as the ally using a skill.
- Units: Lance sets `unit.flags.hop`, Balloons set `unit.flags.flying` and a cosmetic `unit.sprite` override (the
  hero's own spec + a balloon overlay, kept the same size on screen whatever the sprite scale) at combat start, and
  re-tie it after skills and at round / turn boundaries when content swaps `unit.sprite` (Ellaria's Wild Shape).

## Deviations

- Item `desc` repeats the stat bonuses that the UI also lists as stat lines (consistent with the fixture and hero
  items, and the reward / shop cards only print `desc`).
- Haunted Plate swaps the wearer even when the wearer is immovable (`swap(..., { force: true })` — "Kevin ignores
  physics"); immovable *other* units are never picked. Slate's grapple re-checks adjacency, so a swap just ends a hold.
- Undying Undies trigger on damage (`onTakeDamage`), so an instant `Act.kill` skips them; the Phoenix Down Jacket
  uses `onDowned` and covers both.
- Pocket Hourglass: "costs AP" means the final price. Sources that fire after items (scars, random passives, rules)
  can price a skill outright (Ambidextrous: first basic free) or only discount 2+ AP skills (Unread Blood Pact); the
  Hourglass prices every skill with and without itself (a re-entrant `costOf`, still pure) and is spent only by a
  paid use whose price it lowered. It remembers its quotes in a module-level table (not fight state) keyed by
  unit, skill and the slot's use count, so `onSkillUsed` finds the quote `pay()` made just before counting the use.
- Previews are honest dry runs: a Chaos Crystal surge (and every other item effect) shows up in the HUD preview of
  the skill that triggers it (same as Marwyn's surges).

## Core fixes

None.

## Requests

- **Random passives (`js/data/passives.js`)**: `rp_phoenix_feather` sets `p.data.used` before checking that the hero
  is still down, so on a hero who also wears the Phoenix Down Jacket (items fire first and revive them) the Feather
  is spent on the same down without effect. Checking `unit.downed` first would give that hero both revivals.
- **RULES (optional)**: `modifyPush` fires only on the pushed unit, so an item cannot say "your pushes go 1 tile
  further" without a global rule; a source-side hook (e.g. `modifyOutgoingPush(p)` on `p.src`) would allow it.
- **RULES (optional)**: a `modifyGuard(g)` hook (`g = { unit, ap, block }`) would allow "Guard gives +3 Block per AP"
  armor; today Guard is computed inline in `Combat.endTurn`.
- **RULES (optional)**: `modifyCost`'s `c` has no `level`; the Hourglass looks the level up from the unit's slots.
- **Lead**: document the `modifyPush` hook (hero-marwyn) next to `modifyStatus` — Barrel Armor uses it.

## Balance (simulation, AutoPlay, real heroes)

`items: balance sim` runs the same parties (4 random real heroes, auto-built by `DD.Run.makeRunHero`, no random
passives) through the same encounters per mode: no items / 3 random items of one rarity / act-odds loot.
- Normal difficulty, L3/L6/L9, act 1-3 normals + elites (24 fights per mode): every mode wins 100%; rounds 5.1 (none)
  → 4.6 common → 4.6 rare → 4.0 legendary; party HP lost 5% → 7% → 5% → 5%; cursed 4.5 rounds, 10% HP lost, the
  highest damage (154 vs 138).
- Brutal, L1/L4/L7, act 1-3 elites + bosses (24 fights per mode): none 79% wins / 8.9 rounds / 41% HP lost / 1.4
  downs; common 92% / 7.7 / 25% / 0.6; rare 96% / 7.5 / 22% / 0.5; legendary 100% / 6.5 / 23% / 0.5; cursed 88% /
  7.1 / 37% / 0.8 (highest damage 306 vs 256 — the upside — and the most HP lost of any item mode — the downside);
  act-odds loot 92% / 7.5 / 25% / 0.8.
- Tuning from the design review before these sims: Scented Candle common → rare (it is effectively 3 HP per turn
  wherever you end), Vampire Spork heals at most 2× per turn (was 3×).
- The fixture-party loadout battles (`items: random loadouts…`) check robustness, not balance.
- Review re-run (after the Mimic Mail and Balloons changes, other areas' content as of Oct 31 afternoon): normal
  L3/6/9 (24 fights per mode): none 96% / 5.0 rounds / 6% HP lost, common 100% / 4.8 / 7%, rare 100% / 4.8 / 5%,
  legendary 100% / 3.9 / 6%, cursed 100% / 4.5 / 10% (damage 159 vs 136), act odds 100% / 4.8 / 6%. Brutal L1/4/7
  elites + bosses, 48 fights per mode (seed 99): none 81% / 8.8 / 40% / 1.5 downs, common 90% / 8.3 / 32% / 1.1,
  rare 88% / 7.5 / 27% / 0.8, legendary 96% / 6.3 / 22% / 0.7, cursed 94% / 7.1 / 26% / 0.6 (damage 327 vs 255),
  act odds 90% / 7.4 / 31% / 1.0.
- Per-item outlier sim (`items: per-item outlier sim`, brutal elites + bosses L1/4/7, the item on all 4 heroes, 24-72
  fights per item and several seeds): top Phoenix Down Jacket (+33), Gilded Breastplate (+28), Longbow (+25), Scented
  Candle (+24), Ring of Indiscriminate Regeneration (+24: 14% HP lost but 12.3 rounds — it heals the foes too); the
  pure stat armors sit at ±3 (noise is ±5). Outliers: Mimic Mail (2 HP bite) −21 / −33 and still −5 to −14 on a lone
  frontliner (it lost 7-14 points more of its own HP than without it: the AutoPlay tank takes ~25 damage per 9-round
  fight, so +3 armor saved ~9 while the bite cost ~18); Party Balloons (legendary) −3 / +6 / −1 over 432 fights
  per mode (flight alone −3 / +2 / −4): AutoPlay gets nothing from mobility, and every other legendary scored higher.
  Big Stick looked bad at n=8 (−18) but is neutral at n=24 (−3 / +3).

## Known issues

- Pocket Hourglass tells paid uses from free ones through `slot.uses` (`pay()` quotes, then bumps it). Content that
  bumps `slot.uses` itself during a free use, right after a cost query for that skill, would make that use count as
  paid; a paid use nested inside another skill's execute (nothing does this today) would get its own discount.
- Steve's random name consumes one roll of the combat RNG at spawn (deterministic, but it shifts later rolls).
- Balloons drawn above the head sit under the HUD's HP bar / status row; with statuses shown, the outer balloons peek
  out around the icons (cosmetic).
- Full `tools/test.sh` after the review (Oct 31): PASS, 508 suites, 79,975 assertions, 0 failing sections. One run
  earlier during the review failed 2 sections in `bosses_act1` (Grimble's pattern order, which reproduced with
  `isolate=ratking,grimble,act1`, i.e. without the item files; the rat king sim's "not a walkover" guard, whose
  fixture party carries no items), both gone on the next run while that area was being edited.

## Review (adversarial pass, Oct 31)

Verified by running code (sandbox probes, 360 random-loadout AutoPlay fights with real heroes in every act / kind /
difficulty with no swallowed errors or broken numbers, a preview-vs-reality audit over ~5,000 AutoPlay skill uses
with random items, and AutoPlay balance sims), not by reading. Fixed, most severe first:

1. **Crash Helmet leaked damage** (bug). It zeroed `d.mult` only, but sources that fire after items add flat damage:
   with the Weak Ankles scar (+3 from bumps and falls) a wall bump dealt 2 and a pit fall 3, against "You take no
   damage from bumps or falls". It now also sinks `d.flat` (the codebase's dodge idiom). The old Helmet test hid
   bumps behind the test knight's 3 starting Block; it now zeroes Block, and adds a later +5 flat rule and the real
   Weak Ankles scar (both fail on the old code).
2. **Pocket Hourglass never spent by a skill that re-prices itself** (bug). It kept one quote per unit, so any cost
   query between `pay()` and `onSkillUsed` overwrote it: the generic Power Nap calls `costOf` in its execute, so a
   napping wearer kept the discount for the rest of the turn (any later AP, e.g. from Hype Man, bought a discounted
   skill). Quotes are now keyed by unit, skill and the slot's use count, and `onSkillUsed` reads the one `pay()` made
   just before counting the use (free re-uses find nothing). Regression tests: a mid-swing re-price through an
   instance hook (isolated) and the real Power Nap (with the generic kit loaded); both fail on the old code.
3. **Yardstick / Longbow desc inexact**: the engine's `range` stat also extends thrown consumables with range 2+
   (7 of them, e.g. the Flask of Bad Decisions 4 → 5). Both descs now say "skills and thrown consumables"; tested.
4. **Scented Candle desc incomplete**: Holy Ground also deals 3 to undead that end a turn on it. Now in the desc and
   tested (an undead fixture minion standing on the Candle's tile).
5. **Mimic Mail retuned (bite 2 → 1)**. In the per-item sim it was the worst item: −21 / −33 with 4 wearers and
   −5 to −14 on a lone frontliner, whose own HP lost rose 7-14 points. AutoPlay heroes take few hits (the tank ~25
   damage per 9-round brutal fight), so +3 armor saved ~9 HP while a 2 HP bite every turn cost ~18. At 1 the cost is
   about what the armor saves for a tank (tank HP lost +2 / +7 points in the same sims), so it is a real trade for a
   frontliner and still a tax on anyone else. Tests updated (the never-below-1 clamp now checked with a Marked bite).
6. **Party Balloons legendary → rare (150 → 80 gold)**. 432 brutal fights per mode with all four heroes wearing them:
   −3 / +6 / −1 (flight alone −3 / +2 / −4), while the other legendaries scored +3 to +33 at n=8 (Darryl, the lowest
   there, +8 / +10 at n=24). Flight is real mobility for a human on lava / pit / mud maps, but it is not legendary
   power. Counts are now 18 / 16 / 7 / 8.
7. **New diagnostic** `items: per-item outlier sim` (`itemsim=each`, skipped otherwise): the per-item sim that found
   5 and 6, sorted by score, with `carrier=tank` and `only=` options.

Checked and fine (no change): every desc number against its effect, incl. the cursed downsides (Flail backswing,
Sword insults, Barrel roll vs pulls, Kevin's swaps, Bag surges, Pay-to-Win, Ring); hook signatures (item def last);
null `targetUnit` / dead / downed / charmed / stunned / sheep users; pits, lava and map edges (Steve's spawn, Kevin's
swaps, Darryl and Big Stick pushes); no `Math.random` in logic; previews exact with items (the audit's only
mismatches were KO flags on fleeing minions, also without items); reward / shop pipelines; no name clashes with any
skill, status, consumable, enemy, summon, scar or passive (icons 🔪 💍 🪶 📜 🧶 🗡️ are shared with hero-specific items,
which only drop for their hero). Visuals: Steve (gallery poses incl. downed and facing, in combat at zoom 1) and the
balloons on Syllamin and Ellaria read clearly. Balance re-runs are in the Balance section above.

Not changed, for the record: Big Stick looked harmful at n=8 but is neutral at n=24; the Ring of Indiscriminate
Regeneration is strong with four copies (14% HP lost) but drags fights out (12.3 rounds) and a single ring heals the
foes around its wearer too; the Fireproof Apron halves fire damage before flat bonuses such as the Afraid of Fire
scar (+2), which is the damage pipeline's convention for every percentage.

## Phase 4 (engine requests role)

The three RULES requests above exist (docs/notes/rules.md "Phase 4"): `modifyOutgoingPush(p)` on the pusher (before
the target's `modifyPush`), `modifyGuard(g)` (`g = { unit, ap, block }`), `c.level` in `modifyCost`. Nothing in
`items.js` needed migrating (the Hourglass's slot lookup works). Fair previews: a hit that rolls dice (the Chaos
Crystal's 25% surge) previews `uncertain` instead of revealing the roll, so `previewThenUse` in
`tests/content/shared.js` checks certain previews exactly and uncertain ones for their "?" flags only.
