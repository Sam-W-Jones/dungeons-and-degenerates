# Hero: Josiah — notes (v2)

Files: `js/data/heroes/josiah.js`, `tests/content/hero_josiah.js` (14 suites `hero_josiah: …`, ~1,650 assertions).
Run: `bash tools/test.sh "suite=hero_josiah&isolate=heroes/josiah,hero_josiah"`; generic validation:
`bash tools/test.sh "suite=content:&isolate=heroes/josiah,hero_josiah"`; looks:
`bash tools/shot.sh "debug=1&fixtures=1&isolate=heroes/josiah,hero_josiah&screen=gallery&gallery=josiah" .tmp/josiah/g.png`.

## Summary

**Josiah the Medically Dubious** — Human Plague Doctor (he/him), `unlock: null` (available from the start),
complexity 2, colour `#86b84a`. Role: poison healer & raven wrangler. L1 26 HP / 3 AP / move 4 / armor 0 / init 0,
+4 HP per level, `consumableSlots: 1`. The user's brief ("a plague doctor who crafts potions and commands a raven") is
the whole kit: every skill is a flask, a potion or a raven order, and his Poison is literally contagious.

**Passive — Unlicensed Apothecary** (`passive.hooks`: `onCombatStart` only): "Starts each fight with his raven. Poison
is contagious: when a Poisoned foe dies, adjacent foes catch all of its Poison. +1 consumable slot."
- The raven (`jos_raven`) is summoned next to him at combat start (inside the deploy zone when possible).
- The rule is the combat rule `jos_contagion` ("☣️ Contagion" chip): when a Poisoned foe dies (anyone's kill, any
  Poison source), every adjacent foe catches all of its stacks, while a Josiah is standing. Chains happen by
  themselves: each foe ticks at its own turn start, so a tick that kills patient zero infects the next foe before its
  tick. Josiah's Poison skips a foe that has him Charmed (he can't damage his charmer, DESIGN 4.4).
- +1 consumable slot = hero def `consumableSlots: 1` (read by `DD.Run`). Brewing moved to the Portable Alembic item.

**Basic — House Call** `jos_cane` 🩺 (1 AP, reach 2, LOS): 4 damage, 6 to a Poisoned foe (a payoff for anyone's
Poison). Reach 2 is not melee: he never makes attacks of opportunity (below). Tagged `reach`, not `melee` (tooltips list
the tags, and "Melee" reads as "holds the line" in v2; the tag has no mechanical effect).
**Signature — Pandemic** `jos_pandemic` 🦠 (100 Hype + 2 AP): every foe takes 8 poison damage and is Poisoned 4.
Banner "PANDEMIC!", green flash, shake, the raven caws. Every victim then feeds the Contagion.

**Skill pool** (10; starters ★). One verb each; levels I / II / III:

| id | name | AP | cd | effect (I / II / III) |
|---|---|---|---|---|
| jos_plague_flask ★ | Plague Flask 🧪 (attack) | 2 | 2 | foes in radius 1 (range 2-4): 2 / 3 / 4 poison damage + Poisoned 3 / 4 / 5 |
| jos_draught ★ | Mostly Medicine 🍶 (heal) | 1 | 1 | heal 7 / 9 / 11 (an ally within 3 or himself) |
| jos_raven_dive | Raven Dive 🐦 (attack) | 1 | 1 | his raven (or a new one) teleports next to a foe within 5 and pecks: 4 / 5 / 6; III + Dazzled (its next turn) |
| jos_leeches | Prescribe Leeches 🪱 (attack) | 2 | 2 | 6 / 8 / 10 to a foe within 3; he heals the HP it lost |
| jos_miasma | Plague Miasma 🌫️ (utility) | 2 | 3 | radius-1 cloud for 2 / 2 / 3 rounds: foes inside are Poisoned 2 / 3 / 3, and again on each Miasma tile they enter; flammable |
| jos_quarantine | Quarantine 🚧 (utility) | 1 | 3 | a foe within 4: Rooted 1 / 1 / 2 + Vulnerable 2 / 3 / 3 (its own turns) |
| jos_vaccinate | Vaccinate 💉 (buff) | 1 | 2 | cure all debuffs; immune to new ones 1 / 2 / 2 turns; III + 5 Block |
| jos_volatile | Volatile Brew ⚗️ (attack) | 2 | 2 | every unit in radius 1 (allies too): 5 / 6 / 7 fire + pushed 1 / 1 / 2 outward |
| jos_murder | Murder of Crows 🪶 (spell) | 3 | 3 | foes within 2 of the raven: 7 / 9 / 10; III + Marked 3 |
| jos_salts | Smelling Salts 🧂 (heal) | 1 | 1 charge | revive a downed ally within 4 at 30 / 40 / 50% HP |

**Raven** `jos_raven` (summon: flyer bird, flying, 2 AP, move 5, acts on Josiah's turn, no initiative entry): 10 HP
+10% per Josiah level above 1 (10 / 12 / 13 / 14 / 16 / 19 at L1 / 3 / 4 / 5 / 7 / 10), doubled by the Treats; skill
level 1 / 2 / 3 at Josiah L1-3 / 4-6 / 7+. Skills: `jos_peck` 💢 Peck (melee 2 / 3 / 4 — also its attack of
opportunity) and `jos_omen` 👁️ Ill Omen (spell, cd 1, range 4, Marked 3 / 4 / 5: the next damage of any kind, a Poison
tick included, so the desc says "the next damage it takes", not "the next hit"). Random name (Nevermore, Edgar,
Mortimer, Quoth, Sir Caws-a-Lot, Lenore, Beakley). Josiah barks `raven_down` when it dies; a dead raven gives no Hype.

**Status** `jos_vaccinated` (buff, refresh, decay `turnEnd`, default 1 = through the target's next turn): cancels
every new debuff (`modifyStatus`). **Surface** `jos_miasma` (airborne, does not block sight, react fire → fire through
the whole cloud; a hazard only for its brewer's foes: `hazard(unit, tile)` + `hazardDmg: 3`, so enemy paths avoid it
and heroes walk through; `onEnter` doses foes on **each** Miasma tile they enter, so a foe shoved 2 tiles through the
cloud is Poisoned 2 + 2 (the desc says so); flat `draw` + billowing `drawVolume`). Like every `setSurface`, the cloud
replaces the floor surface under it (oil, puddles, brambles, marbles, crumbs, glitter, mist), except fire (no cloud over
open flames). **Rule** `jos_contagion` (`onDeath`).

**Items** (all `hero: 'josiah'`, no hooks except the Alembic's `onCombatEnd`):
- `jos_beak_mask` Herb-Stuffed Beak Mask (armor, rare): +4 max HP; every Poison he applies +1 stack (skills, cloud
  doses, contagion; descs in combat show it).
- `jos_raven_treats` Suspicious Raven Treats (trinket, rare): his raven has double max HP.
- `jos_alembic` Portable Alembic (trinket, rare): after a won run fight, 50% to brew a random liquid consumable into
  the party bag (if there is room — the desc says "if the bag has room"; also while he is downed; never after a defeat
  or outside a run).
- `jos_plague_bell` The Plague Bell (weapon, legendary): +10% damage; the Contagion reaches every foe within 2 tiles
  of the dead (the rule chip says so).

**Combos with other heroes** (each pinned by a test in `combos with other heroes …`):
1. *Plague Miasma → fire*: any fire on one tile turns the whole cloud into flames, so everyone inside Burns
   (test: the fixture mage's Fire Fixture). Checked with the real heroes in the v2 review: Zarathor's Gold-Plated
   Fireball and Fabulous Strut, Pebbles' Hot Zoomies and This Is Fine, Valdris' Molten Spray and Buga's Pork Barrel
   light the whole cloud (then Valdris' passive hits the Burning foes +3); Hjalmar's Firecracker (fire damage only)
   does not.
2. *Plague Miasma → shoves*: a foe pushed, pulled or thrown into the cloud is dosed on **each** Miasma tile it enters
   (test: the knight's Shield Bash; his own Volatile Brew III: 2 tiles = Poisoned 2 + 2). Checked with the real heroes:
   Basanos' Shoulder Check, Betty's Ram, Kiri's Banishing Shot, Pebbles' Big Wag / Fetch Quest, Ellaria's Thorn Whip,
   Marbles' Whack, Valdris' Hammer of Faith, Corelos' Restraining Order / You've Been Served, Buga's Red Tape, Slate's
   Personal Space / Get Over Here, Hjalmar's Bait and Switch, Zarathor's Lasso (3 tiles through it: Poisoned 6) and
   Marwyn's YEET (3 tiles: Poisoned 6).
3. *Quarantine → big hitters*: Vulnerable (+25%) for the party's heavy hits; Rooted keeps a foe on a trap or in the
   cloud (test: the knight's slash 5 → 6). Real heroes: Betty's Kick 'Em While They're Down hits a Quarantined foe for
   13 (10 for Rooted × 1.25) instead of 5.
4. *Ill Omen / Murder of Crows III → anyone's next hit*: Marked (test: the mage's bolt +3, the knight's slash +3).
5. *Contagion → anyone's kill*: a Poisoned foe killed by anyone spreads its stacks (test: the knight's kill).
6. *Raven Dive III → disengage*: a Dazzled enemy makes no attacks of opportunity, so the ally it pins walks away
   unpunished (test: the mage steps off a Dazzled grunt for free; without the Dazzle she takes 4).
7. *Volatile Brew → terrain*: blasts foes into pits (YEET, +20 Hype), lava, water, traps or his own cloud. Real heroes:
   a foe blasted onto each of Hjalmar's six traps springs it (Rooted, slipped, Taunted, Dazzled, firecracker, glove).

**Attacks of opportunity** (rules.md "v2 — attacks of opportunity"): his cane reaches 2 tiles, so it is not a melee
basic, and the hero def's `flags: { noOpportunity: true }` keeps it so when Dazzle (hero −1 max range) or the DM's
range house rule shrinks it to reach 1 (which the engine would read as melee) — he never makes them, and foes may walk
away from him (HUD: "Never makes attacks of opportunity."); when he walks off a melee foe he provokes like anyone
(the move preview shows it). His raven's Peck is melee: the raven strikes once per round at a foe leaving it (2 / 3 / 4),
so it pins a foe for him; stunned / asleep / frozen / sheep it doesn't. Raven Dive moves the raven by teleport and
Volatile Brew moves units by push: neither ever provokes. Rooted foes still strike (Root is not a stun); Dazzled ones
don't. No `ctx.opportunity` guards are needed (Peck has no user-side effects).

**Sprite**: slim humanoid, long charcoal coat with brown lapels, plague hat, bone-white `plague_mask` with glowing green
goggles, examination cane + glowing flask, collar + bandolier of vials, green `smoke` aura plus an overlay that puffs
herb smoke out of the beak tip; ~41 px tall at zoom 1. Raven: indigo-black bird, glowing green eye, monocle and a
green scarf. Gallery + in-combat captures (`.tmp/josiah/`) read fine.

## v2 conversion (what changed from v1, and why)

- Hero def: `unlock: null` (was `{ act: 1 }`), `stats.init: 0`; no Guard / combat-start Block anywhere.
- **Simplicity** (DESIGN §6: one verb + at most one rider; III = bigger numbers or one added rider):
  - Passive: no brewing (→ the new Portable Alembic item), no damage hooks; raven + one rule + the pocket.
  - Pandemic: no ally cleanse. Plague Flask III: no Weak. Mostly Medicine: no cleanse (Vaccinate's job).
  - Raven Dive: Dazzle only at III (was every level), no "+1 raven AP" at III; desc "Your raven (or a new one)".
  - Prescribe Leeches: heals only Josiah (was "the most wounded ally", 2 allies at III).
  - Plague Miasma: no per-turn dose, no longer blocks sight; desc "foes inside now or entering later".
  - Quarantine: no neighbour pushes (Root + Vulnerable only).
  - Volatile Brew (this pass): **no ignition** (oil, the cloud, barrels) and no object damage — the push is its one
    rider; lighting his cloud became other heroes' combo (Zarathor, Pebbles, Valdris).
  - Murder of Crows: no Dazzle (Marked at III); this pass 5 / 6 / 7 → **7 / 9 / 10** (DESIGN's 3-AP area band): at 5 a
    foe it lost to three cane pokes, so AutoPlay never cast it (0 uses in 14 socketed sim fights; a probe with three
    grunts around the raven: still no cast at 5, cast at 7 — now a test). Smelling Salts III: no +1 AP. Untested Tonic
    cut (pool 11 → 10).
  - Items: Beak Mask without Poison immunity, Treats = double raven HP (no +2 Peck / Dive), Bell without Hype.
- **Durations** count the owner's own turns (Quarantine, Vaccinate, Dazzle): tested turn by turn.
- **Barks**: "Roll for initiative? I roll for infection."; cameos for Kiri, Betty, Basanos and (this pass) Valdris,
  Hjalmar and Pebbles; no v1 words (telegraph / intent / Guard / XP) in any Josiah text (a test greps for them), and a
  pronoun check (he/him for everyone but Ellaria, Sparrow and Kiri).

## Balance (this pass)

Act-1 campaign sim, random parties of all 13 heroes, everyone's content as of this pass (`bash tools/sim.sh
"seeds=40&from=7100&stop=1" .tmp/josiah/sim_a1.txt`, before the Murder of Crows change): 53% act-1 clears; Josiah 12
runs, 58% run wins (median 50%), 24.7 damage / fight (raven 3.8) — mid-pack (Zarathor 54.8, Kiri 49.8, Syllamin 43.6,
Ellaria 34.1 … Marwyn 16.4) — and the most healing (13.8 / fight; Ellaria 10), 0.18 downs / fight. Not an outlier; no
other numbers changed. His uses per socketed fight: cane 2.3, Mostly Medicine 2.2, Vaccinate 2.0, Quarantine 1.6,
Volatile Brew 1.2, Plague Flask 1.2; Murder of Crows 0 (→ buffed, above); Pandemic 0 (AutoPlay rarely fires any
signature: 0.16 a fight across all heroes). Fixture AutoPlay suite: 27/27 wins.

## Public API

- `jos_vaccinated` — any content may apply it: `DD.Act.addStatus(u, 'jos_vaccinated', { turns: n })` = immune to new
  debuffs through u's next n turns.
- `jos_miasma` surface — `setSurface(x, y, 'jos_miasma', rounds)` then `tile.surface.data = { side, owner, poison }`
  (only units of the other side are dosed / see a hazard; without data it doses everyone, Poison 2). Fire spreads
  through it like oil.
- `jos_contagion` rule id (present in every fight with Josiah). Summon `jos_raven` (ownerId = Josiah's unit id).

## Deviations

- The passive has three short clauses: the raven start (like Ellaria's corgi), the one rule (Contagion) and the
  pocket (`consumableSlots`, a run-layer perk from the DESIGN brief that never touches combat).
- Contagion is a combat rule (`DD.Act.addRule` at combat start, hook `onDeath`) because a passive only sees its own
  unit's events; the HUD rule chip doubles as a reminder.
- Raven Dive's damage is credited to Josiah (the raven moves and animates): his items, Inspired and Empowered apply and
  the kill is his.
- Volatile Brew deals fire damage but does not ignite the ground (one rider, the push); DESIGN's "Volatile Concoction
  (fire explosion)" is otherwise kept.

## Requests

- **LEAD (DESIGN §6, Josiah brief)**: it still describes v1 — "*(unlock: clear Act 1)*" → available from the start;
  "Apothecary — … a chance to brew a potion after each victory" → brewing is the Portable Alembic item; "Healing
  Draught" → Mostly Medicine; "Volatile Concoction (fire explosion)" → a fire blast that pushes (no ignition). Could
  add: his cane reaches 2 (he doesn't hold the line), his raven does (melee Peck).
- **INTEGRATION** (`tests/content/integration.js`, "cross-content consistency"): still asserts the v1 unlock
  `josiah: { act: 1 }`; v2 heroes have `unlock: null` (DESIGN §3, migration guide code **U**).

## Known issues

- AutoPlay still casts Murder of Crows only when the raven already sits in a crowd at the start of Josiah's turn (it
  plays the hero before his summons, so it never flies the raven in first), and rarely fires Pandemic (100 Hype) or
  Smelling Salts (nobody down) in the fixture sample; direct tests cover all three.
- With no solid tile next to a dive target, the flying raven may land hovering over a pit or deep water (harmless).
- The Contagion chip stays in the HUD while Josiah is downed (the rule does nothing then).
- Out of combat the UI passed no unit to `skillDesc`, so party / reward screens showed base numbers (no Beak Mask +1);
  in combat the HUD shows the item-adjusted numbers. Being fixed by the UI role (v2 review): `UI.skillInfo` describes a
  RunHero through its sheet unit, and its new suite "ui: out-of-combat skill text and costs follow items and Blessings"
  checks Plague Flask with the Beak Mask (those checks pass; `pz` reads a sheet unit fine).
- A Marked foe walking away from the raven spends its Mark on the raven's attack of opportunity (the rule: "the next
  damage it takes").

## Tests (`tests/content/hero_josiah.js`, all seeded, 14 suites)

registration (v2 def incl. `flags.noOpportunity`, House Call tagged `reach` not `melee`, pool 8-10, III adds at most one key, desc ≤ 24 words and shows every number, no v1 words,
barks 4-6 per key ≤ 70 chars, cameos incl. the three new recruits, pronouns, raven / items / status / surface,
sprite + portrait) · passive (raven at L1-10, acts on his turn only, two Josiahs, contagion: adjacent only, stacks add,
Josiah down, v2 chain at turn start, an ally's kill spreads it, +1 slot in a run) · items (Beak +1 everywhere, Treats
×2 at L1/4/10, Alembic ~50%, full bag (+ its desc says so) / defeat / downed / no run, Bell reach 2 and chip text) · House Call / Plague
Flask / Mostly Medicine at every level (cooldowns by his own turns) · the raven (Peck, Ill Omen, Marked — also taken by
a Poison tick, as the desc says —, Raven Dive landing / re-summon / pits / corners / indisposed raven, Dazzle III through
exactly its next turn) · Plague Miasma (cloud, doses, pushed-in dose, a dose per Miasma tile entered, no dose for
staying, 2 rounds, per-side hazard, charmed foes, fire ignites the cloud, no cloud over flames) · Leeches / Quarantine / Vaccinate at every level (Root and Vulnerable by its own turns: it stays
put then walks over; immunity by its turns; Block until his next turn start; a cured stun gives the turn back) ·
Volatile Brew (friendly fire, pushes, no ignition, blast into his cloud, III through 2 cloud tiles + its preview, pit / lava / water / map edge) / Murder of
Crows (radius 2 of the raven, needs it, AutoPlay calls the flock on a crowd) / Smelling Salts (range, charges, AutoPlay
revives) · Pandemic · combos (above) · previews == reality for every
skill × level on a busy board, with and without his items · v2 edge cases (not his turn, silence, stun / sheep / sleep /
frozen, his stunned turn while the raven acts, charm, AP, empty / corner tiles, dying targets) · attacks of opportunity
(he provokes walking off a grunt, preview + no undo; reach 2 never strikes, nor a Dazzled reach-1 cane; the raven pecks at L1 / L4, once per round,
again next round, not while stunned / asleep / frozen / sheep; Raven Dive's teleport and Volatile Brew's pushes never
provoke while the raven's own walk does; Dazzled foes don't strike, through their next turn; Rooted ones still do) ·
AutoPlay with ['josiah', 'test_knight', 'test_cleric', 'test_mage'] vs the fixture encounters of acts 1-3 at L1/3/5
(27 fights, no errors, ≥ half won, ≥ 10 of his 14 skills used).

## Review (v2) — adversarial review of the v2 kit (ADVERSARIAL REVIEWER role)

Scope: the files above, after the author's v2 pass. An earlier review attempt was killed by the app hang (22:58); its
probes (`.tmp/josiah-v2rev/`) and notes edits (the real-hero combo checks, `flags.noOpportunity`, the per-tile Miasma
desc) are kept. Its last act was a mutation run: its backup `josiah.bak.js` is identical to the hero file, so nothing
was left mutated. Scratch harnesses (Chrome slot aware): `.tmp/josiah-v2rev/run.sh <probe> "<query>"` (probes
`r3_*.js`) and `.tmp/josiah-rev3/mut.sh <dir>` (all 14 Josiah suites against `.tmp/josiah-rev3/<dir>/josiah.js`;
`mut.html` swaps the copy into the manifest — the real file is never touched).

### Verified (by running code)
- **desc == execute** at every level: the suites' "desc shows every number" and previews == reality (94 board checks
  plus a pass with his items), the generic `content:` suites (isolated and in the full run), and the player-facing tooltips of
  every skill and item dumped from `DD.UI.skillTooltipHtml` (in combat with the Beak Mask: Poisoned +1 shown).
- **v2**: `unlock: null`, `stats.init: 0`; no Guard / starting Block / intents / XP in code (grep) or text (the suite's
  word check); Quarantine, Vaccinate and Dazzle durations count their owners' turns, turn by turn.
- **Attacks of opportunity**: Josiah never makes them — reach-2 cane; Dazzled, `opportunitySlot` does return the
  reach-1 cane, but `opportunityOf` is null thanks to `flags.noOpportunity`, and the HUD says "Never makes attacks of
  opportunity." He provokes when walking off a melee foe (move preview screenshot: "Provokes 1 attack of opportunity:
  Goblin Grunt 6 (Pointy Stick). Can't be undone."). The raven pecks foes leaving it — also on the enemy's own turn at
  0 AP, and while Josiah is downed; an archer next to it pays the peck to step back; a Poisoned foe killed by that peck
  spreads its Poison. Raven Dive (a teleport: like every teleport it also works on a Rooted raven) and Volatile Brew's
  pushes never provoke.
- **Targeting**: a grunt next to the raven sticks to it instead of walking to Josiah; after a Raven Dive the grunt
  attacks the raven and Josiah takes nothing — the raven is his bodyguard.
- **Edge cases**: a charmed ally in his cloud is not dosed and sees no hazard (heroes never switch sides); an adjacent
  foe blasted back into Josiah by Volatile Brew bumps both (5 + 3 / 3), as previewed; the centre unit flies along the
  dominant axis away from him.
- **Cross-hero combos with the real heroes** (probes re-run): fire lights the whole cloud — Zarathor's Gold-Plated
  Fireball and Fabulous Strut, Pebbles' Hot Zoomies and This Is Fine, Valdris' Molten Spray, Buga's Pork Barrel (not
  Hjalmar's Firecracker: fire damage only); 16 pushes / pulls / swaps dose a foe on each Miasma tile entered (Lasso,
  You've Been Served, YEET through 3 tiles: Poisoned 6); Betty's Kick 'Em While They're Down on a Quarantined grunt 13
  (5 on a free one); Valdris' hammer +3 on a foe Burning in the lit cloud; Volatile Brew springs each of Hjalmar's six
  traps.
- **AutoPlay fuzz**: 60 fights, Josiah + 3 random real heroes on random real encounters, acts 1-3 at L1-7
  (`r3_fuzz.js`, seed 11). Results: 55 wins, 5 losses, 0 timeouts, 0 errors. Invariants held: Josiah made 0 attacks of
  opportunity, the raven 6 (always adjacent), Josiah provoked 7; never two ravens; the raven never had its own
  initiative entry while he lived; his Poison and his cloud never landed on his side. The raven died 64 times and Raven
  Dive re-summoned it 30 times: a 1-AP decoy that soaks a brute's turn, which suits "commands a raven" (his sims are not
  an outlier). AutoPlay calls the flock whenever 2+ foes are within 2 of the raven (probe); in the sample it was rarely
  socketed.
- **Visuals** (`.tmp/josiah-rev3/*.png`): the gallery (plague mask, glowing goggles, beak smoke, cane, flask), the raven
  (indigo bird, monocle, green scarf), the cloud in a real fight, the provoking-move preview and the Murder of Crows III
  aim (orange radius-2 diamond round the raven, "Hits 3 foes for 31") all read fine.
- **Tests are meaningful** (mutation checks, each through all 14 suites). Each of these makes at least one suite fail:
  - no `flags.noOpportunity`;
  - Root +1 turn; Dazzle +1 turn; Vaccinate +1 turn;
  - one dose per cloud instead of per tile entered; the cloud dosing +1;
  - Contagion reaching 2 tiles without the Bell;
  - Raven Dive as a provoking walk;
  - Volatile Brew igniting its area;
  - House Call without the Poisoned bonus;
  - a reach-2 Peck (no attacks of opportunity);
  - Pandemic without the Mask's +1.
  Only one weaker mutation survives: igniting the blast's centre tile alone (no test puts oil there).

### Fixed
1. **House Call was tagged `melee`.** Its tooltip read "Basic attack · Melee" for a reach-2 cane that never makes
   attacks of opportunity, and in v2 "melee" is the word for "holds the line" (DESIGN §4.2). It is now tagged `reach`
   ("Basic attack · Reach"). The tag has no mechanical meaning anywhere: attacks of opportunity read the range, and the
   Blessing table's melee requirement reads range 1. Test: registration.
2. **The Portable Alembic desc** now says "(if the bag has room)". It never brews into a full bag, but only the notes
   said so. Test: items.

### Looked at, kept (judgment calls)
- **Passive (three clauses):** raven, Contagion, +1 slot. It is one rule (Contagion) plus two flat perks, reads in one
  breath (22 words), and the raven start follows Ellaria's corgi pattern.
- **Brewing stays on the Portable Alembic.** The kit still reads as "a plague doctor who crafts potions and commands a
  raven": every skill is a flask, a bomb, a potion or a raven order, he carries an extra potion, and the raven starts
  every fight.
- **III levels** add one rider on top of a small number bump (Raven Dive 5 → 6 + Dazzle, Murder of Crows 9 → 10 +
  Marked 3). Most of the 16 kits do the same.
- **Raven Dive's "within 5"** is measured from Josiah, like every "within N" (the targeting overlay shows it). Not
  reworded: it would add 2 words to a 22-word desc.
- **Plague Miasma's desc** (23 words) is his longest. It is exact (a foe shoved through the cloud is dosed per tile),
  and no shorter rewording was found.

### Requests / known issues
Unchanged (above): the LEAD's DESIGN §6 brief and INTEGRATION's v1 unlock expectations (the only Josiah-related failure
in the full run). Final full run after this review: 789 suites, 21 failing sections:
- `bosses_act1` (18): v1 `DD.AI.plan` calls;
- `integration` (2): v1 unlocks and the protect objective;
- `ui` (1): the UI role's new party-screen suite fails on Zarathor's Fireball AP pill with a Blood Pact; its Josiah
  checks pass.
None are in Josiah's files (14 / 14 suites pass), and there are no swallowed errors.

## Requests (Nov 3) — Onyx, flyers, barrels, heals that revive (CONTENT SWEEP heroes-1, 2026-11-04)

User: "rename Josiah's raven "Onyx"" · "Flying characters ignore floor effects" · "Allow detonation of barrels by
targetting them" · "Allow targetting o fheals on downed characters to heal and bring them up". Rules: `docs/notes/rules.md`
"v2 requests". Suite: `hero_josiah: v2 requests — …` (55 assertions).

- **Onyx.** `jos_raven` keeps `name: 'Raven'` (its title: the HUD reads "Onyx (Raven)") and has `names: ['Onyx']`, so a
  raven is Onyx at combat start, after Raven Dive calls one back, and for every Josiah. One name keeps the summon's one
  RNG draw (`rng.int(0, 0)` still calls `next()`): seeded fights are unchanged; the suite counts the draws. Renamed in the
  passive ("Starts each fight with Onyx, his raven"), Raven Dive ("Onyx (called back if gone) swoops…"), Murder of Crows,
  the canUse reasons (`'Needs Onyx.'`, `'Onyx is indisposed.'`), the raven's desc / spawn / death barks, the Treats,
  flavors, the blurb and his barks ("Tell Onyx... he was right...", "Onyx, take notes…", plus a raven_down line "Don't
  worry. Onyx always comes back. Ravens are like that."). No other content file names his raven (grep). DESIGN §Josiah
  says Onyx. Skill and item names stay ("Raven Dive", "Suspicious Raven Treats").
- **Flyers.** Plague Miasma stays `airborne` (a gas: it still doses flyers, on the cast and on every cloud tile they
  enter). It now declares `hazardStatus: 'poison'`: poison-proof foes see no hazard in it. Onyx flies over floor fire and
  poison untouched (engine). `ravenSpot` / `landingSpot` read hazards per unit already.
- **Barrels.** House Call, Raven Dive, Prescribe Leeches and Peck can be aimed at a volatile object (kept: all make
  sense). On a barrel the riders don't happen: Raven Dive doesn't move Onyx (the detonation's projectile comes from
  Josiah — cosmetic), Leeches drains nothing. Peck at an adjacent barrel puts Onyx in the blast (the preview shows it).
- **Heals.** Mostly Medicine already heals `ctx.targetUnit` unconditionally, so aimed at a downed ally it gets it up with
  the potion's HP (7 / 9 / 11), "UP! N HP" in the preview; tested at every level. Smelling Salts unchanged. Leeches'
  self-heal never revives.
- **Requests.** INTEGRATOR: `docs/notes/v2-digest.md` §2 (generated kit text) still quotes "Your raven (or a new one)" /
  "Your raven calls the flock" / "Josiah's raven has double max HP": regenerate.
