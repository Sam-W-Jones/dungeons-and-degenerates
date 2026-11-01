# Hero: Josiah — notes

Files: `js/data/heroes/josiah.js`, `tests/content/hero_josiah.js` (12 suites `hero_josiah: …`).
Run: `bash tools/test.sh "suite=hero_josiah&isolate=heroes/josiah,hero_josiah"`.

## Summary

**Josiah the Medically Dubious** — Human Plague Doctor, unlock `{ act: 1 }`, complexity 2, colour `#86b84a`.
Role: poison healer & raven wrangler. L1 26 HP / 3 AP / move 4, +4 HP per level, `consumableSlots: 1`.
The user's brief ("a plague doctor who crafts potions and commands a raven") is the whole kit: every skill is a flask,
a potion or a raven order, and his poison is literally contagious.

**Passive — Unlicensed Apothecary** (`passive.hooks`: onCombatStart, onCombatEnd, modifyOutgoingDamage)
- Starts every fight with his raven (`jos_raven`, next to him, inside the deploy zone when possible).
- Adds the combat rule `jos_contagion` ("☣️ Contagion" chip in the HUD): when a Poisoned foe dies, every adjacent foe
  catches all of its Poison stacks. Works for any Poison source (puddles, Pandemic, other heroes), only while a Josiah
  is standing. Chain reactions happen naturally: a Poison tick that kills at a turn start infects the neighbours before
  their own tick. (Every Poison Josiah applies skips a foe that has him Charmed: he can't damage his charmer.)
- +1 consumable slot (hero def `consumableSlots: 1`, read by `DD.Run`).
- After a victory in a run, if he is still standing: 50% chance to brew a random potion into the party inventory
  (prefers liquid-sounding consumables; `DD.Act.giveRandomConsumable(id)`), logged, FX text + a UI toast (non-headless).

**Basic — House Call** `jos_cane` (renamed from "Bedside Manner" at integration: that is also a random passive) 🩺: 1 AP, reach 2: 4 damage, 6 to a Poisoned foe.
**Signature — Pandemic** `jos_pandemic` 🦠: 100 Hype + 2 AP: every foe takes 8 poison damage and is Poisoned 4; every
ally is cleansed. Banner "PANDEMIC!", green flash, shake, the raven caws.

**Skill pool** (11; starters ★). Levels I / II / III:

| id | name | AP | cd | effect (I / II / III) |
|---|---|---|---|---|
| jos_plague_flask ★ | Plague Flask 🧪 (attack) | 2 | 2 | foes in r1: 2+Poison 3 / 3+Poison 4 / 4+Poison 4 + Weak 1 |
| jos_draught ★ | Mostly Medicine 🍶 (heal) | 1 | 1 | heal 7 / 9 / 11 + remove 1 debuff (range 0-3) |
| jos_raven_dive | Raven Dive 🐦 | 1 | 1 | raven lands next to a foe ≤5: 4 / 5 / 6 dmg + Dazzled; III: raven +1 AP; re-summons a missing raven |
| jos_leeches | Prescribe Leeches 🪱 | 2 | 2 | 6 / 8 / 9 dmg; most wounded ally ≤3 (him included) heals the HP lost; III: 2 allies |
| jos_miasma | Plague Miasma 🌫️ (utility) | 2 | 3 | r1 cloud (`jos_miasma`) 2 / 3 / 3 rounds, Poison 2 / 2 / 3 on foes inside + 1 per turn end; blocks LOS |
| jos_quarantine | Quarantine 🚧 | 1 | 3 | Root 1/1/2 + Vulnerable 2/2/3; neighbours pushed 1/2/2 away (allies gently: no bump, no ice slide, never into pits/hazards) |
| jos_vaccinate | Vaccinate 💉 (buff) | 1 | 2 | cleanse all + `jos_vaccinated` (debuff immunity) 1 / 2 / 2 rounds; III +5 Block |
| jos_volatile | Volatile Brew ⚗️ | 2 | 2 | 5 / 6 / 8 fire to every unit + object in r1 (friendly fire), ignites oil/Miasma, pushes out 1 / 1 / 2 |
| jos_tonic | Untested Tonic 🥃 (buff) | 1 | 2 | ally +1 / +1 / +2 AP and Inspired this turn; side effect Poison 2 / 1 / 1; not on a stunned / asleep / frozen ally |
| jos_murder | Murder of Crows 🪶 (spell) | 3 | 3 | foes within 2 of the raven (of Josiah if it is gone): 5 / 6 / 7 + Dazzled; III + Marked 3 |
| jos_salts | Smelling Salts 🧂 (heal) | 1 | 1 charge | revive a downed ally ≤4 at 30 / 40 / 50% HP; III +1 AP |

Telegraph tools: Dazzle (Raven Dive, Murder), Miasma blocks tracking shots (they fizzle), Quarantine shoves allies
out of a melee swing and roots the attacker, Vaccinate blocks incoming stun/charm/silence, Flask III Weakens.
Combos with other heroes: Quarantine's Vulnerable, Ill Omen's Mark, Untested Tonic (+AP, Inspired), Zarathor-style fire
ignites the whole Miasma (Burn for everyone inside), Volatile Brew ignites other people's oil and barrels.

**Raven** `jos_raven` (summon, flyer bird, flying, 2 AP, move 5): 10 HP × (1 + 0.1 per Josiah level above 1) (× 1.5 with
the Treats, rounded half up: 10 / 13 / 16 / 19 HP at L1 / 4 / 7 / 10, 15 / 20 / 24 / 29 with the Treats), skill
level 1/2/3 at Josiah L1-3/4-6/7+. Random name (Nevermore, Edgar, Mortimer, Quoth, Sir Caws-a-Lot, Lenore, Beakley).
Skills: `jos_peck` 💢 Peck (2 / 3 / 4, adjacent) and `jos_omen` 👁️ Ill Omen (spell, cd 1, range 4, Marked 3 / 4 / 5).
Josiah barks `raven_down` when it dies.

**Status** `jos_vaccinated` (buff, refresh, decay `turnStart`, default 1): cancels every new debuff (`modifyStatus`).
**Surface** `jos_miasma` (blocksLos, airborne, react fire → fire spreading through the cloud, water → cleared; custom
flat `draw`). **Rule** `jos_contagion` (onDeath).

**Items** (all `hero: 'josiah'`):
- `jos_beak_mask` Herb-Stuffed Beak Mask (armor, rare): +4 HP, Josiah can't be Poisoned, his Poison on foes +1 stack.
- `jos_raven_treats` Suspicious Raven Treats (trinket, rare): raven +50% HP, Peck and Raven Dive +2 damage.
- `jos_plague_bell` The Plague Bell (weapon, legendary): +10% damage; the Contagion reaches every foe within 2 tiles of
  the dead (not just adjacent ones) and every Poisoned foe that dies gives +5 Hype (the rule chip says "within 2 tiles").

**Sprite**: slim humanoid, long charcoal coat with brown lapels, plague hat, bone-white `plague_mask` with glowing green
goggles, examination cane + glowing flask, collar + bandolier of vials, green `smoke` aura plus an overlay that puffs
herb smoke out of the beak tip. Raven: indigo-black bird, glowing green eye, monocle (it is smarter than him) and a
green scarf. ~41 px tall at zoom 1.

**Balance** (author's pass, before the review — current numbers in **Review**) (scratch sim `.tmp/hero-josiah/sim.*`:
slot hero + test_knight/cleric/mage, AutoPlay, real act 1-3
encounters, 6 per act × kind, levels 2-10). Final: Josiah 54/54 wins, 68 dmg/fight (raven and poison ticks included),
9.5 heals/fight, 9% party HP lost; Ellaria in the same run 54/54, 63 dmg, 7.5 heals, 9%. Before tuning he out-damaged
Zarathor while out-healing Ellaria, so Plague Flask went to cooldown 2, the basic to 4 (6 vs Poisoned) and Peck to
2/3/4. Biggest sources: the cane (≈14), Poison ticks (≈9), the raven (≈9), Plague Flask direct (≈5).

## Public API

- `jos_vaccinated` — any content may apply it: `DD.Act.addStatus(u, 'jos_vaccinated', { turns: n })` = immune to new
  debuffs until the start of its n-th next turn (hero side: n enemy phases).
- `jos_miasma` surface — place with `setSurface(x, y, 'jos_miasma', turns)` then set
  `tile.surface.data = { side, owner, poison }` (only units of the other side are dosed; without data it doses
  everyone, Poison 2). Fire spreads through it like oil.
- `jos_contagion` rule id (present in every fight with Josiah).
- Summon `jos_raven` (ownerId = Josiah's unit id).

## Deviations

- Contagion is a combat rule (`DD.Act.addRule` at combat start, hook `onDeath`) because a passive only sees its own
  unit's events; it shows as a rule chip in the HUD, which doubles as a reminder.
- `consumableSlots: 1` is on the hero def (META-RUN request), not set from a hook.
- Raven Dive's damage is credited to Josiah (the raven moves and animates): his items, Inspired and Empowered apply and
  the kill is his. The Raven Treats bonus is added by the passive's `modifyOutgoingDamage` for that skill.
- `jos_miasma` is not flagged `hazard` (it only hurts the brewer's foes and `hazardAt` has no side), so enemy AI walks
  into it and the HUD never warns heroes about it.

## Core fixes

- `js/engine/autoplay.js` `quickScore` (review, marked `[core fix, hero-josiah]`): a target tile holding a downed
  friendly hero now scores 20 for skills whose `target.filter` is `'downedAlly'` (before, downed heroes were skipped as
  "not active", so every revive skill scored 0 and was never even previewed). Only Smelling Salts uses that filter, so
  no other content changes behaviour; the exact preview still decides. Regression test: "AutoPlay casts Smelling Salts
  on a downed ally" in the `Volatile Brew, Untested Tonic, Murder of Crows, Smelling Salts` suite.

## Requests

- **RENDER-WORLD**: custom surfaces only get the flat, tile-clipped `def.draw`; a volumetric hook (e.g.
  `def.drawVolume(g, sf, t)` called where `SURF[id].vol` is) would let `jos_miasma` billow like smoke/steam. Today it
  reads as glowing toxic ground, not as a cloud that blocks sight (the tile tooltip says so).
- **RULES (AutoPlay)**: AutoPlay ignores `aiScore`.
- **RULES**: an optional per-side hazard (e.g. `hazard: function (unit, tile)`) would let friendly-only clouds warn foes
  only.

## Known issues

- AutoPlay rarely reaches 100 Hype for Pandemic in short fixture fights (covered by direct tests), and rarely has 3 AP
  left for Murder of Crows (3 uses in 54 sim fights) since it usually moves first.
- With no solid tile next to a dive target, the flying raven may land hovering over a pit or deep water (harmless).
- A stunned / sleeping / sheep raven still "calls the flock" for Murder of Crows (Raven Dive refuses in that state).
- The Contagion chip stays in the HUD while Josiah is downed (the rule does nothing then).
- Out of combat the UI passes no unit to `skillDesc`, so party / reward screens show base numbers (no Beak Mask +1
  Poison, no Treats +2); in combat the HUD shows the item-adjusted numbers.

## Review

Fresh-eyes review (adversarial pass after the author). Everything below was found by running code (scratch probes and
sims in `.tmp/hero-josiah-review/`), fixed in `js/data/heroes/josiah.js` and pinned by new tests.

**Bugs fixed**
1. **Quarantine shoved allies off ice into pits / lava.** The "gentle" ally push checked pits and hazards for the
   pushed distance but used a normal push, so an ally landing on ice (terrain or surface) skidded one more tile — a
   probe dropped the knight into a pit (−8 HP) and into lava (8 fire + Burn), contradicting "never into pits or
   hazards". Allies are now pushed with `slide: false`; foes still slide (and can still be YEETed). Tests: ice terrain
   + pit, ice surface + lava, foe-on-ice-into-pit.
2. **Raven Treats "+50% max HP" was additive with the level scaling**, so it was +50% at L1 but only +38% at L4 and
   +26% at L10 (24 instead of 29 HP). Now multiplicative, computed as a whole number first (float noise turned 28.5
   into 28). Tests at L4 and L10.
3. **A charmed Josiah could still Poison his charmer** (Plague Flask, Pandemic, Miasma, contagion), dodging DESIGN 4.4's
   "can't damage the charmer" with damage-on-a-timer. Poison now skips the charmer; other foes still get it.
4. **AutoPlay never cast Smelling Salts** (core fix above): balance sims and `?autoplay=1` undervalued the skill.

**Weak spots improved**
5. **The Plague Bell (legendary) was the weakest of his three items** (+10% damage, +5 Hype and 2 HP per Poisoned
   death: in sims it added less damage than the common Treats). It now makes the Contagion reach every foe within
   2 tiles of the dead (not just the 4 adjacent ones) and keeps the +5 Hype per Poisoned death (the 2 HP heal is gone).
   The Contagion rule chip reads "foes within 2 tiles" when a Josiah carries it. Build-defining, on theme ("Bring out
   your dead!"), and it feeds Pandemic. Tests: reach 2 straight / diagonal, 3 tiles safe, no Bell = adjacent only.
6. **Suspicious Raven Treats was a "common" that doubles Peck** (+2 on 2 / 3 / 4) and gave more damage than the rare
   Mask or the legendary Bell in sims (81 vs 78 vs 75 dmg/fight). Now **rare**, like most heroes' second item.
7. **Untested Tonic was the weakest ally-AP skill in the game** (cd 3, range 3 + LOS, AP-neutral at I / II, Poison side
   effect) next to Syllamin's Hype Man (cd 2, range 5, no LOS, +Empowered at II). Cooldown 3 → 2. It also refuses a
   stunned / asleep / frozen ally ("It is in no state to drink anything."), who could not spend the AP; Vaccinate
   first (the cleanse wakes them) and the Tonic works — tested.
8. Plague Flask III desc read "… and are Poisoned 4 and Weakened …"; now "…, are Poisoned 4 and are Weakened …".

**Tests added** (`tests/content/hero_josiah.js`, still 12 suites, ~1,380 assertions, all seeded): the bugs above; Bell
reach and chip text; Treats HP at L4 / L10; Tonic cooldown 2 and its stunned-ally rule (+ the Vaccinate → Tonic combo);
charmed Poison; AutoPlay Salts; and a second preview pass with all three of his items equipped (every skill at its top
level, 2 busiest targets): HP, KOs, Hype, summons **and who catches Poison** (the Bell's 2-tile contagion) all match
`DD.Combat.preview`.

**Checked and fine** (by running it): registry / desc(L, null) / hook signatures; null targets, dying targets, map
corners for every skill × level; silenced (only the two spells blocked), stunned / asleep / frozen / sheep; pits, lava,
water, edges; no `Math.random` in logic; previews side-effect free; brewing with the real consumables now loaded (it
picks only liquids: Red Drinks, Flask of Bad Decisions, Energy Drink, Antidote, Liquid Courage, Holy Water, Frost
Flask, Thunder Jar, Mystery Potion); real-hero parties (Ellaria / Corelos / Slate, Buga / Marwyn / Sparrow, Zarathor /
Syllamin / Marbles) with no swallowed errors. Vaccinate / Pandemic cleansing Corelos' Debt is the documented
"bankruptcy" combo (hero-corelos notes). Visuals: gallery + in-combat captures (cellar, hauntwood, zoom 1.9-3.2) — the
plague hat + bone beak + green goggles read instantly and differ from all 9 others; the raven (dark body, green eye and
scarf) is readable on stone and grass. The Miasma is the one weak visual (flat painter, see Requests).

**Balance after the review** (scratch `.tmp/hero-josiah-review/sim.js`: the slot hero + test_knight / cleric / mage,
AutoPlay, real act 1-3 encounters, 6 per act × kind = 54 fights, levels 2-10; content of every area as of this
review). Josiah 52/54 wins, 74 dmg/fight (34% of the party's), 19 heals/fight, 20% party HP lost, 0.46 downs/fight.
Same run: Corelos 52/54 · 78 dmg; Zarathor 51/54 · 73; Marbles 51/54 · 71; Slate 49/54 · 65; Ellaria 54/54 · 64 dmg ·
17 heals · 11% lost; Syllamin 50/54 · 62; Sparrow 49/54 · 63; Marwyn 47/54 · 48; Buga 52/54 · 38. He is the strongest
hybrid (top-2 damage and the most healing) but not dominant: Ellaria wins more and loses less HP, and his win rate
matches Corelos / Buga. His damage: cane 15.5, Poison ticks 12.6, raven Peck 10, Plague Flask 6.8, Volatile Brew 4.4.
Items (same sim): Bell 78 dmg (most kills, 2.28/fight, shortest fights), Treats 81, Mask 78, all three 90.
