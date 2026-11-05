# HERO: Mayor Buga — notes

Files: `js/data/heroes/buga.js` (content), `tests/content/hero_buga.js` (22 suites `hero_buga: …`), this file.
Run: `bash tools/test.sh "suite=hero_buga&isolate=heroes/buga,hero_buga"` · generic checks:
`bash tools/test.sh "suite=content:&isolate=heroes/buga,hero_buga"`.
Scratch (not shipped): `.tmp/buga/` — `g.png` (gallery), `c1.png` (deployment, his skill bar), `c3.png` (a real act 1
fight), `v2aoo_*_a1_40.txt` and `var_*_120.txt` (campaign sims, below), `full2.txt` (the last full test run), `probe/` (probe
pages via `probe/probe.sh <name>`: `aoo.js`, `bribeaoo.js`, `apshield.js`, `delegate.js` — every real hero as the
delegated ally, previews vs reality), `simvar/` (`simvar.sh`: the campaign sim with his def patched, e.g.
`bstart=buga_delegate,buga_red_tape`). Review scratch: `.tmp/buga-review/` (`probe.sh <name>` runs `rev1.js` … `rev7.js`;
`cshot.sh` screenshots `combat.html?mode=board|toast|barrel`; `sim_*_60.txt`, `full1.txt`).

Status (v2 + attacks of opportunity, 2026-11-03; adversarial review 2026-11-04, section "Review (v2)" below): conversion
complete. The 22 `hero_buga` suites (1893 assertions with all content loaded, at harness seeds 7 / 42 / 999; 1619
isolated, where the real-hero suite skips) and the 8 generic `content:` suites pass.

## Review (v2) — adversarial review of the v2 + attacks-of-opportunity work (ADVERSARIAL REVIEWER role, 2026-11-04)

Scope: the kit as the author's AoO pass left it (`js/data/heroes/buga.js`, `tests/content/hero_buga.js`, these notes;
an earlier review attempt was killed by the app hang before it changed anything). Method: read against DESIGN §4.1–4.4 /
§6 "Simplicity", the user's brief, `v2-migration.md` and rules.md "Attacks of opportunity"; probes in Chrome
(`.tmp/buga-review/rev1–7.js`), mutation checks, screenshots, a 60-run sim pair and a full `tools/test.sh`.

**Verified (held)**
- **desc == effect at every level**: all 12 skills, the passive, crumbs, barrel and 3 items (every desc dumped; the
  suites check numbers, statuses and own-turn durations, costs, cooldowns, charges, displacement, gold; previews exact).
  With the **real heroes**: Delegate and the Toast with each of the other 15 as the swinging ally (3 spots each): the
  swing lands, costs the ally nothing (no AP, bank, cooldown or charge), previews exact — now a suite (below).
- **Simplicity**: one verb + at most one rider per skill; III adds at most one rider (Butter Up's Inspired, Photo Op's
  Hype, Pork Barrel's gold) or bigger numbers (Delegate's second ally, Bribe's second turn); descs 9–25 words (avg 17;
  the 16 heroes average 13–19); the passive is one rule and one hook; pool 10 (2 starting). Pork Barrel is the busiest
  ("plant a bomb that blows at round end, or when hit or lit"), but it is one verb on an object the game already has.
- **v2**: `init: 0`, `unlock: null`; no Guard / starting Block / telegraph / intent / XP / `Math.random` in his code
  (grep) or texts (suite); durations count own turns (Bribe 1/1/2, Red Tape's Root 1, Inspired 1, crumbs' Slow 1 —
  refreshed by ending a turn on them, gone a turn after leaving); Campaign Promise on Ellaria's corgi banks +1 AP for
  her turn (corgi 3 AP).
- **Attacks of opportunity**: his ranged basic never strikes; walking off a foe provokes; Human Shield out of a
  two-grunt pinch provokes nothing and tags in the ally — with Marwyn, the goblin then sticks to Marwyn's Block; a
  Red-Taped goblin rooted next to Betty hits Betty, not the Mayor; a bribed foe is struck by nobody and stabs its old
  friends walking off it; kills by allies' attacks of opportunity pay his credit.
- **Bribe vs every real enemy**: 47 non-boss enemies × 2 layouts, Charmed by him for their next turn: none hurt a hero
  except the Tesla Coil (its own rule: it arcs into the nearest unit, friend or foe); 82 of 94 hit a friend (a bribed
  Spore Bro hugs and explodes on its friends); the rest idle (kobold rep, necro TA, Nat 1 golem, succubus coach, the
  kobold shield in one layout). Bosses are refused.
- **Toaster**: last hero standing → DING, no defeat (`onDowned` runs before `checkEnd`); once per fight (fresh unit
  `data` every fight); a pop leaves no scar (run downs are read from the end state).
- **Gold**: previews and AutoPlay dry runs never move run gold (`setGold` returns while simulating).
- **Combos with real heroes**: Zarathor's Fireball and Valdris' Molten Spray each light all 9 crumb tiles (a goblin
  outside the Fireball's radius catches fire); his own barrel's blast lights the crumbs; Marbles' Whack into a barrel
  is Marbles' kill → +2 credit. (Basic attacks — Pebbles' bite included — don't light crumbs; the notes never said so.)
- **Real-content fuzz**: 60 AutoPlay fights, random real encounters, Buga + 3 random real heroes, random 4-skill kits
  and items: 57 won, 0 problems, 0 warnings, every skill used (the Toast once), 313 credits, 32 bribes (no boss), 16
  barrels (none left standing at a fight's end), 5 attacks of opportunity on him, 2 Toaster pops.
- **Balance** (current content, act 1, seeds 500–559, his seat vs Marbles in the same seat): Buga 53/60 (88%; Grimble
  23/27, Rat King 30/33) vs 49/60 (82%); 25.3 damage, 1.6 kills, 6.8 taken, 0.1 downs a fight; 292 gold earned per run
  vs 211; 0 errors. Mid-pack combat, the loot engine on top — as designed.
- **Character read and distinctness**: points, promises, flatters, poses, bribes, fines and takes the credit — "all about
  the loot and manipulating allies", in toast puns. He is the only hero whose skills make *allies* attack (`pay: false`
  swings) and the main gold earner (Hjalmar's Pickpocket is the only other); AP / Inspired / Empowered / swap / charm are
  shared combo glue (Syllamin's review kept "Hype Man ≈ Promise + Butter Up").
- **Pronouns**: every line naming a hero follows the user's list (suite); "Pebbles, good boy!" is he.
- **Visuals**: gallery (`gal2.png`: poses, statuses, portraits, in game) and a real act-1 fight next to Marwyn, Kiri
  and Pebbles (`c_board.png`: crumbs under the goblins with "Slowed" log lines, the pig barrel, Delegate armed "Hits 1
  foe for 5"; `c_toast.png`: "Hits 1 foe for 18 · 💀 1 KO"; `c_barrel2.png`: the barrel's inspect).

**Fixed** (each with a regression test that fails on the code before the fix)
1. **The Toaster let a walk continue after a down.** Downed by an attack of opportunity mid-walk, he popped back up
   inside the hit, so `moveAlong` saw him standing and walked him on to his destination (probe: from (2,4) to (0,4)) —
   the rule says a hit that downs the mover ends its walk (the Phoenix Down Jacket already handles this). Now
   `if (A().revive(...)) A().stopMove(unit)`. Test: at 2 HP he walks off a grunt → DING at 50%, stays on (2,4) with 0
   AP; next round's walk goes all the way.
2. **A planted barrel's inspect said "8-12 fire damage (by Pork Barrel level)"**, not its blast. It now carries a label
   (`barrelLabel`: "Pork Barrel (10 fire)", III "Pork Barrel (12 fire, +3 gold)"), which the HUD's inspect and the destroy
   log show, and the object text points at it. Test: the label at each level.
3. **Test gap: Delegate and the Toast against the real party.** Their payoff is every *other* hero's basic attack, but
   only a scratch probe checked that. New suite `hero_buga: Delegate and the Toast with every real hero (free swings,
   exact previews)` (274 assertions with all content loaded; skips when isolated). Mutation-checked: making the swings
   paid fails 30 assertions.

**Considered, not changed**
- **Red Tape II / III** (pull 3 / 4) bring a foe on a clear lane all the way to his feet (L1: 1–2 tiles away), so a
  bigger pull can overshoot the melee line; in line behind an ally the pull stops at the ally (both bump 3). The desc
  says "toward Buga" and "up to"; where he stands is the skill. Kept (tested, the author's call).
- Diagonal pulls stop once the foe is in line with him (fewer tiles than "up to N"): the engine's pull, covered by "up to".
- A barrel popped by a foe he bribed counts as his own kill (Hype, no credit gold): crediting the bribed foe would trade
  8–20 Hype per kill for 2 gold.
- A Toaster pop still fires the down barks / narration and allies' `onAllyDowned` (he did go down; same as the jacket).
- Bribe on elites (2 turns at III for 8 gold) is strong; shared with Corelos' Sign Here and Pebbles' charm; elite guards
  are the enemy authors' call.
- "A cheap shot! I'll have you audited!" stays a `hurt` line (no bark key exists for the victim of an attack of
  opportunity, and a cosmetic hook would break the passive's one-hook rule).
- AutoPlay never fires the Toast in act-1 sims (see Requests, AUTOPLAY).

## Summary (v2: initiative, no telegraphs, no Guard, simple skills, attacks of opportunity)

The user's brief: *"An anthropomorphic piece of toast who is all about the loot and manipulating allies."*
**Mayor Buga, the Toast of the Town** — a lightly buttered slice of sourdough and small-town mayor (Toast (Sourdough)
Mayor, complexity 2, colour `#2a9d8f`, `unlock: null`). L1 24 HP (+4/level), 3 AP, move 4, armor 0, `stats.init: 0`.
Role: support / manipulator / loot. He makes his allies do the work, squeezes gold out of every fight and takes the
credit for everything.

**Passive — Skimming Off the Top**: *"Whenever an ally (or a foe he bribed) defeats an enemy while Buga stands, he
takes the credit: +2 gold."* One rule, one hook (`onAnyDeath`). Ally = any hero-side unit (summons too); the kill
counts however it happened (skills, Burn ticks, pushes into pits, Pork Barrels an ally popped, attacks of
opportunity). His own kills and enemy-side summons pay nothing; nothing while he is downed. Floating "🎖️ Credit taken!
+2 gold", coins, a log line, sometimes a bark.

| id | name | AP / cd | desc at I (one verb + at most one rider) → II → III |
|---|---|---|---|
| `buga_pamphlet` (basic) 🗞️ | Campaign Pamphlet | 1 | "Deal 4 damage to a foe within 4 tiles." (ranged: he never makes attacks of opportunity) |
| `buga_toast_of_the_town` 🥂 | Toast of the Town | 2 + 100 Hype | "Point at a foe within 6 tiles: every ally who can hit it makes 2 free basic attacks on it." A dogpile: every swing, then every swing again (best hitter first; nobody swings at a corpse). Banner, flash, shake, coins. |
| `buga_delegate` (starter) 👉 | Delegate | 1 / 2 → 1 → 1 | "Point at a foe within 6 tiles: the best-placed ally makes a free basic attack on it." cd 2 → cd 1 → the 2 best-placed allies |
| `buga_fine` (starter) 🧾 | Loitering Fine | 1 / 1 | "Deal 4 damage to a foe within 3 tiles and pocket 2 gold." 4 & 2 → 5 & 2 → 6 & 3 |
| `buga_promise` 🤞 | Campaign Promise | **0** / 3 → 2 → 2 | "An ally within 5 tiles gains 1 AP on its next turn." +1 → +1 (cd 2) → +2 |
| `buga_human_shield` 🛡️ | Human Shield | 1 / 2 | "Swap places with an ally within 3 tiles; it gains 4 Block." 3 & 4 → 4 & 6 → 5 & 8 |
| `buga_bribe` 💰 | Bribe | 1 / 3 | "Pay 10 gold to Charm a foe within 3 tiles (not a boss): on its next turn it fights for you." 10 g, r3 → 8 g, r4 → 8 g, r4, its next 2 turns |
| `buga_butter_up` 🧈 | Butter Up | 1 / 2 → 1 → 1 | "An ally within 3 tiles is Empowered: its next damaging skill deals +50%." r3 → r5 (cd 1) → + "it is Inspired (+25% damage) through its next turn" |
| `buga_red_tape` 🎀 | Red Tape | 1 / 2 | "Pull a foe 2-4 tiles away up to 2 tiles toward Buga and Root it for its next turn." 2-4 & 2 → 2-4 & 3 → 2-5 & 4 |
| `buga_photo_op` 📸 | Photo Op | 1 / 2 | "Allies within 2 tiles are Inspired (+25% damage) through their next turn." r2 → r3 → r3 + "+3 Hype for each of them" |
| `buga_pork_barrel` 🐷 | Pork Barrel | 2 / 1, **2 charges** | "Plant a Pork Barrel within 4 tiles. It explodes at round end, or when hit or lit: 8 fire damage within 1 tile." 8 → 10 → 12 + "+3 gold" |
| `buga_crumbs` 🍞 | Crumb Trail | 1 / 2 | "Scatter flammable crumbs on the bare floor of a 5-tile cross within 4 for 3 rounds: grounded foes there are Slowed (−2 move)." 5 tiles, 3 rounds → 9, 3 → 9, 5 |

Pool of 10 (2 starting) besides basic and signature; AP mix 0 / 1 / 2; one charges skill (Pork Barrel), one long
cooldown (Bribe); no `spell`-kind skills (politicians cannot be silenced); every desc ≤ 25 words with no if/else
clause and no v1 terms (the registration suite checks it). Starters: Delegate (manipulating allies) + Loitering Fine
(the loot), straight from the brief.

**Surface `buga_crumbs` "Toast Crumbs"** (3-5 rounds, custom painter: golden tint + toasted crouton cubes): grounded
enemy-side units that walk in or end their turn on it are Slowed through their next turn (a refresh of a Slow it still
has is silent); flyers never; fire spreads along it (`react.fire` → fire, spread), water washes it away. Only on bare,
dry floor (no liquids, pits or other surfaces).
**Object `buga_pork_barrel` "Pork Barrel"** (pink pig barrel with a "$" and a lit fuse; hp 1, `smashable`, blocks
movement, not sight): explodes (radius 1, `data.dmg` fire damage to everything there, no lingering fire) at the end of
the round (`data.fuse` = 1), or at once when hit (any damage, an ally's Smash, a shove into it) or lit (`react.fire`).
Credit: the hero who popped it, else Buga. III: +3 gold when it pops. A planted barrel's name carries its exact blast
(label "Pork Barrel (10 fire)", at III "(12 fire, +3 gold)"), so the inspect panel states the real number; the object
text says "the fire damage in its name (8-12 by Pork Barrel level)". AutoPlay hint (`autoplay`): foes in the blast
− 1.5 × allies, halved while the fuse is lit.

**Items** (`hero: 'buga'`, one per slot, one rule each; none gives Block):
- `buga_golden_pen` Mightier-Than-the-Sword Pen (rare weapon 🖋️): "+10% damage. Campaign Pamphlet also Marks its
  target: the next hit it takes deals +2 damage." (Pamphlet → Delegate = a marked free swing.)
- `buga_chain_of_office` Chain of Office (Gold-Plated) (rare trinket 🏅): "+10 Hype at combat start. Skimming Off the
  Top pays 3 gold per credit instead of 2."
- `buga_toaster` The Re-Election Toaster (legendary armor 🍞): "+6 max HP, +1 armor. Once per combat, when Buga goes
  down he pops right back up with 50% HP. Ding!" (`onDowned` → revive, so it beats the TPK check; downed mid-walk by
  an attack of opportunity or a trap, he still went down: `stopMove`, the walk ends where he fell, like the Phoenix
  Down Jacket.)
- Considered and dropped: "Diplomatic Immunity" (can't be opportunity-attacked; the AoO notes suggest such items).
  Human Shield already is his way out of melee, and keeping the three ids keeps old saves valid.

**Sprite**: `base: 'custom'` painter (44 px tall at zoom 1): toast slice with crust rim and toasted gradient, a melting
3D butter pat, tilted top hat with gold band, dot eyes + smug brows + big gold-tooth grin, red mayor's sash, gold chain
with medallion, stubby limbs with white gloves; idle politician wave, attack = point/throw, cast = both arms up + open
mouth (speech), hurt = squint, downed = X eyes; walk cycle. `portrait: { x: 1, y: -25, r: 19 }`. Re-checked in the
gallery (`.tmp/buga/g.png`: poses, statuses, portraits, in game) and in a real act 1 fight: unchanged, reads well.

**Barks**: 13 keys × 4-6 lines (≤ 70 chars), naming Marwyn, Josiah, Syllamin, Zarathor, Professor Marbles and now
Kiri, Betty, Basanos, Valdris, Hjalmar and Pebbles ("Betty, stop eating the ballots.", "Pebbles, good boy! Now stop
sniffing my crust.", "Hjalmar, if you rigged this floor, I'm suing.", "Valdris, engrave this on my chain of
office!", "Kiri, is the ethereal plane taxable? Asking for me.", "Basanos, stop looking at me like I'm breakfast!"),
plus a `hurt` line that fits attacks of opportunity ("A cheap shot! I'll have you audited!"; it can play on any hit:
there is no bark key for the victim of one, and he never makes any himself). Pronouns per the user's list (she:
Ellaria, Sparrow, Kiri; he: everyone else; the suite checks every line that names a hero). No removed mechanics in
barks, blurb, role or passive.

Every id: `hero:buga`; skills `buga_pamphlet buga_toast_of_the_town buga_delegate buga_fine buga_promise
buga_human_shield buga_bribe buga_butter_up buga_red_tape buga_photo_op buga_pork_barrel buga_crumbs`; surface
`buga_crumbs`; object `buga_pork_barrel`; items `buga_golden_pen buga_chain_of_office buga_toaster`. Removed in v2:
statuses `buga_endorsed`, `buga_promise`; combat rule `buga_civic_fee`.

## Attacks of opportunity (DESIGN §4.2) — how he plays with them

No rule text changed (the rule needs none); his kit already had the right tools, the new rule makes them matter.
- **He never holds the line**: Campaign Pamphlet is ranged, so he makes no attacks of opportunity (a grunt walks off
  him for free). His allies do the holding; he makes it pay.
- **Walking off a foe costs him its hit** (24 HP, armor 0): the move preview shows "provokes N". **Human Shield** is his
  way out — a swap never provokes — and it tags in the ally he swaps with, next to the foe, with Block: an engaged
  brute then sticks to the knight (tested: the grunt stabs the knight's Block, not the Mayor).
- **Red Tape** pulls never provoke (a foe dragged off the knight costs nobody anything). A Rooted foe can't walk, but
  it still strikes: Red Tape III (pull 4) can land a foe right next to him — mind your own red tape (tested).
- **Delegate / Toast of the Town** swings are plain free attacks, not reactions: the ally keeps its attack of
  opportunity for the round. With melee allies holding the line next to foes, those are exactly the allies who can
  swing — the AoO rule makes the dogpile easy to set up.
- **Bribe**: for its next turn the bribed foe is on the heroes' side — it stabs its old friends in the back when they
  walk off it (that kill is his credit), and nobody strikes it when it walks off them (engine rule since the AoO pass:
  `opportunityOf` skips units on the same effective side; tested).
- **Skimming Off the Top** pays for kills by allies' attacks of opportunity too.
- Nothing needed a `ctx.opportunity` guard (his basic has no user-side effects and never runs as a reaction).

## Combos with other heroes (the setups and payoffs the kit is built around)

1. **Delegate / Toast of the Town → anyone's basic attack** (payoff for the party's hitters): a free swing (two each
   for the Toast) with every rider of the ally's basic — Marwyn's MAGNIFICENCE, Syllamin's Roasted, Sparrow's Bleed,
   Basanos' claw — and every passive that counts hits. Best with melee allies holding the line next to the target.
2. **Butter Up → Empowered** (setup): an ally's next big skill +50% (Zarathor's fireball, a cleave, a charge). Butter
   Up + Delegate = a buttered free swing; Butter Up + the Toast = the first swing of the dogpile +50%.
3. **Red Tape → pull + Root** (setup): drag a back-liner into a cleave, an AoE, oil, water (Wet → lightning), lava, a
   pit (YEET), a trap or a rune, or next to the tank, Rooted so it stays there for the next hits.
4. **Crumb Trail → flammable Slow** (setup for fire heroes: Zarathor, Pebbles, Valdris): one spark sets the whole
   trail ablaze under the foes it is slowing.
5. **Pork Barrel → shove a foe into it / set it alight** (setup for pushers and throwers: Marwyn's Yeet, Betty's rams,
   Slate's throws, Marbles' Whack): the blast is the pusher's kill, so Buga takes the credit.
Plus turn control (Bribe: Charm, it loses its turn to its friends; Red Tape: Root; Crumbs: Slow), positioning (Human
Shield swaps, Red Tape pulls) and party tempo (Campaign Promise +AP, Photo Op Inspired).

## v1 → v2 (what changed, and why)

| v1 | v2 | why |
|---|---|---|
| Passive: civic-fee combat rule (1 gold per kill) + Endorsed status (the first kill of an ally his skills helped: +5 Hype, +2 gold) | +2 gold per enemy an ally (or a bribed foe) defeats | one clear rule, no hidden status |
| Toast: every ally +1 AP, Inspired 2 turns, Endorsed; foes Dazzled; +10 gold | every ally who can hit the foe makes 2 free basic attacks on it | one big, simple effect |
| Delegate: Endorse + free basic; II Mark +2 first | free basic (cd 2 → 1), III 2 allies | one verb |
| Loitering Fine: damage + Weak (+ Vulnerable at III), gold only for the first fine per foe | damage + gold, every time | one rider |
| Campaign Promise: +AP now, −1 AP next turn unless it kills (III kept) | +AP on its next turn (v2 AP banking), no strings | no mini-system |
| Human Shield: swap + Endorse + Block, III + Stealth for Buga | swap + Block | one rider |
| Bribe: re-aims its telegraph at its friends / calls it off; bosses ×3 gold | Charm for its next turn(s), not bosses | no telegraphs in v2 (§8.1 of the guide) |
| Butter Up: Endorse + Empowered, II + 4 Block, III + Inspired | Empowered, III + Inspired | one rider |
| Red Tape: III + 4 damage first | pull + Root at every level | one rider |
| Photo Op: allies Inspired 2 turns + Endorsed, foes Dazzled, III + Hype per ally and foe | allies Inspired through their next turn, III + Hype per ally | one verb |
| Pork Barrel: hurled at a foe (5-7 damage), barrel lands behind it | planted on a tile | one verb |
| Crumb Trail: Slow + allies heal 2-3 at turn end | Slow only | one rider |
| Items: Pen (Endorsed kill → +1 AP), Chain (fee 2), Toaster (40% + 5 Block) | Pen (Pamphlet Marks 2), Chain (credit 3), Toaster (50%, no Block) | no Endorsed, no Block on revive |
| `unlock: { boss: 'grimble' }` | `unlock: null` | v2: everyone unlocked |
| — | `stats.init: 0` | v2 initiative (a politician arrives fashionably late but on time) |

## Public API (for other content)

- `buga_crumbs` surface: `DD.Act.setSurface(x, y, 'buga_crumbs', rounds)`; Slows grounded enemy-side units that enter
  it or end their turn on it; fire spreads along it; water washes it away.
- `buga_pork_barrel` object: `DD.Act.placeObject(x, y, 'buga_pork_barrel', { label, data: { dmg, gold, owner, fuse } })`
  (Pork Barrel passes `label: 'Pork Barrel (<dmg> fire)'` so the inspect panel shows the blast; without one it shows the
  def name);
  hp 1 (any damage pops it), `smashable`, `react.fire.destroy`; explodes (radius 1, `data.dmg` fire damage, fire applied
  to the tiles — oil / crumbs ignite — but no lingering fire surface) crediting the hero who popped it, else its owner;
  `data.fuse` = rounds until it blows by itself at a round end (Pork Barrel sets 1; omitted = waits to be popped);
  `data.gold` = gold when it pops.

## Deviations

- Delegate / the Toast: a summon's "basic attack" is its first `kind: 'attack'` skill. The swings use
  `DD.Combat.resolveSkill(ally, slot, target, { pay: false })`: free for the ally (no AP, HP cost, cooldown or charge),
  its own `onSkillUsed` hooks fire, and they are not attacks of opportunity (`oppRound` untouched).
- Campaign Promise costs 0 AP (outside the 1-3 band on purpose: promises cost nothing).
- DESIGN §6's Buga brief predates v2 (Tax Break, Executive Order, Kickback, Loot Goblin, the Toast's speech, "unlock:
  defeat Grimble"): the kit follows DESIGN §6 "Simplicity" instead (table above; Request below).
- Bribe spends real run gold (`DD.Act.spendGold`); the charm is applied first and only paid for if it lands.
- Delegate on Buga while he is Charmed by the target still works (the ally hits the charmer for him): a deliberate
  loophole, tested. Charmed Buga's own skills can't damage the charmer (engine rule).

## Requests

- **Lead (DESIGN §6)**: update the Mayor Buga brief to the v2 kit: `unlock: null`; passive "+2 gold per enemy an ally
  (or a foe he bribed) defeats"; skills Delegate, Loitering Fine, Campaign Promise, Human Shield, Bribe (Charm), Butter
  Up (Empowered), Red Tape (pull + Root), Photo Op (Inspired), Pork Barrel (planted explosive), Crumb Trail (flammable
  Slow surface); signature *Toast of the Town* (every ally who can hit a foe makes 2 free basic attacks on it); a
  ranged basic (he never holds the line: Human Shield swaps a holder in).
- ~~**NARRATIVE** (`ev_buga_reelection` hint "Every hero gains 10 XP.")~~ — done (review check 2026-11-04: the hint
  now reads "Pay 30 gold. Mayor Buga upgrades a skill. Every hero heals 20% of their max HP.").
- ~~**ITEMS** (`tests/content/shared.js`, the Pocket Hourglass + Delegate check read the knight's AP on Buga's turn)~~ —
  done (it now asserts `!k.ap && !k.apBank` after the Delegate).
- **INTEGRATOR** (`tests/content/integration.js`, `cross-content consistency`): still expects `buga.unlock = { boss:
  'grimble' }` (and Grimble unlocking one hero); v2 has `unlock: null` for everyone (DESIGN §3). Still failing in the
  2026-11-04 full run ("buga: unlock condition — expected {"boss":"grimble"}, got null").
- **AUTOPLAY** (FYI, low priority): in campaign sims the Toast of the Town is never fired (0 in 206 fights; 0 in 297 in
  the review's 60-run sim, Zarathor's signature too): `bigMoment` wants 2+ foes, a boss, or 3+ allies healed / blocked /
  statused, and the allies' free swings are not counted, so a single-target signature only fires at a boss (which
  rarely sees 100 Hype in act 1). Suggestion: count an elite (or a foe the signature would kill or take below half) as a
  big moment. The situational tools (Pork Barrel 0.3, Crumbs 0.3, Human Shield 0.4, Red Tape 0.4 uses per fight
  socketed) are rare; the scripted AutoPlay checks in `hero_buga: AutoPlay v2 battles` show each is picked when the
  board calls for it.

## Balance (AutoPlay, 2026-11-03, with attacks of opportunity; other heroes and enemies are mid-conversion)

- Fixture AutoPlay (`hero_buga: AutoPlay v2 battles`, party `buga, test_knight, test_cleric, test_mage`, acts 1-3 ×
  normal / elite × levels 1 / 3 / 5, plus the three fixture bosses at level 5): 21 / 21 wins (bosses in 6-7 rounds);
  Buga used Pamphlet 81, Delegate 17, Fine 13, Promise 8, Butter Up 8, Photo Op 5, Bribe 4, Crumbs 3, Red Tape 3
  (+ scripted scenes: Pork Barrel between three grunts at I and III, the Toast at a boss, Human Shield II out of a
  two-grunt pinch).
- Act 1 campaign sims, the 4th seat swapped, everything else equal (`party=X,marwyn,zarathor,ellaria`, `stop=1`, the
  same 120 seeds 500-619; `.tmp/buga/var_*_120.txt`): act 1 cleared — **Buga 73%** (Grimble 52/56, Rat King 35/64),
  Marbles 71% (47/56, 38/64), Syllamin 90% (56/56, 52/64). A 40-seed pass (300-339) also had Josiah 75%. Buga's own
  damage 25.6 a fight, 1.4 kills, 7 damage taken; his party earned **259 gold per act-1 run** vs 187 (Marbles) / 208
  (Syllamin): +50-70 gold an act from fines, credits and Pork Barrel kickbacks, i.e. a few more items over a run. That
  is his trade: mid-pack combat power (on par with Marbles) for loot. With Syllamin the party deals the same damage
  (121 a fight in the 40-seed pass) but takes much less (23 vs 31): Roasted / Charm prevent hits — Syllamin, not Buga,
  is the outlier (FYI for the balance pass).
- Variant (`.tmp/buga/simvar/`, a sim page that patches his def): starting with Red Tape instead of Loitering Fine
  (turn control from level 1) gave 70% on the same 120 seeds (Grimble 47/56, Rat King 37/64; 246 gold): no gain, so the
  brief's starters stay (Delegate = manipulating allies, Loitering Fine = the loot).
- Uses per fight socketed (40-seed pass): Pamphlet 4.3, Promise 1.4, Fine 1.3, Photo Op 1.1, Delegate 1.1, Butter Up
  0.9, Bribe 0.8, Red Tape 0.4, Human Shield 0.4, Pork Barrel 0.3, Crumbs 0.3, the Toast 0 (see Requests).
- Knobs if he proves too weak: Delegate cd 1 at I, the Toast's dogpile to "3 free basic attacks". Too strong / too
  rich: the 2-gold credit, Fine's 2/2/3 gold, the Toast's second swing.

## Known issues

- Barks name other heroes even when they are not in the party (the bark picker has no party filter; same in every
  hero file). Valdris, Hjalmar and Pebbles are named before their files exist (their authors are mid-flight).
- The Pork Barrel blast and burning crumbs hurt allies too (by design: friendly fire, readable on the board); enemies
  don't avoid tiles next to a lit barrel (it is not a `hazard`; the fuse is the counterplay).
- Red Tape can pull a foe next to Buga (it pulls toward him); Rooted, it can still attack him and strike him if he walks
  off. Readable on the board, tested, kept (the pull direction is the joke and the tactic).
- Full `bash tools/test.sh` (review, 2026-11-04, 789 suites, `.tmp/buga-review/full1.txt`): 21 failing sections, none
  in his files or caused by his content — bosses_act1 18 (its suites still call the removed `DD.AI.plan`), integration
  2 (v1 unlock expectations, incl. his `{ boss: 'grimble' }`, and an "XP" objective-failed check), ui 1 (party screen
  costs with Josiah's / Zarathor's skills). No swallowed errors; all 22 `hero_buga` and the generic `content:` suites
  pass. (The author's 2026-11-03 run: 73 failing sections, other areas mid-conversion.)

## Tests (`tests/content/hero_buga.js`, 22 suites)

- **registration and v2 data**: fields, `unlock: null`, `init: 0`, DESIGN §5 stat ranges, pool of 10 with 3 levels
  each, every level changing something visible, one-breath descs (≤ 25 words, no if / unless / instead clause), AP
  mix, charges / long cooldown, combo and gold tags, barks (4-6 per key, ≤ 70 chars, other heroes incl. the six newest
  named, pronouns), no v1 statuses, no v1 words (telegraph, Guard, Endorse, XP, planning, this round, intent) in any
  player-facing text, id prefixes, items without starting Block or Guard hooks, no combat rule, no starting Block, and
  a run of the `content: registry` suite.
- **passive**: own kills pay nothing; an ally's kill +2 (normal kill Hype unchanged); downed Buga; summon kills, pushes
  into pits (+20 Hype), Burn ticks; a foe he bribed kills its friend on its turn (credited; charmed by someone else:
  not); enemy-side summons pay nothing; three kills in one cleave +6; the Chain of Office +3.
- **basic + signature**: range, damage, AP; the Toast's dogpile (who swings, twice each, order, armor per hit, free:
  no AP / bank / cooldowns), a target dying mid-toast, no ally in reach → not a target.
- **every pool skill at every level** (numbers, statuses and how many own turns they last, displacement, costs,
  cooldowns counted in his own turns, charges, gold): Delegate (best-placed ally, summons, skipped stunned / silenced /
  sheep allies, charmed-by-target and taunted allies, a target dying mid-skill), Fine, Promise (banked AP, a stunned
  ally loses it), Human Shield (Block through the enemy turn, gone at the ally's turn start, immovable, pits, rooted
  Buga), Bribe (the charmed grunt stabs its friend on its turn; I / III durations; bosses, incorruptible, already
  bought, too poor), Butter Up (Empowered used up, III Inspired through the ally's next turn, + Delegate), Red Tape
  (pulls, Root through its next turn, pits, water, lava, immovable, map edges), Photo Op (radius, Hype at III, who is
  excluded, duration), Pork Barrel (any hit pops it, the fuse at round end, kickbacks, charges, no room on liquids /
  pits / objects / fire, an ally's Smash → credit, chain reactions, fire, AutoPlay hints), Crumb Trail (shape, rounds,
  Slow on scatter / entry / turn end, Slow duration, fire races along it, water, liquids, other surfaces, flyers).
- **combos**: Butter Up + the mage's AoE, Butter Up + the Toast, crumbs + fireball, Red Tape into a cleave, a shove into
  a Pork Barrel (the knight's kill, Buga's credit).
- **Delegate and the Toast with every real hero** (review): each of the other 15 as the swinging ally (next to the foe,
  else 2 tiles off): the swing lands, costs the ally no AP, bank, cooldown or charge, and the preview is exact (274
  assertions with all content loaded; skipped in isolated runs). Mutation-checked: paid swings fail 30.
- **items**: Pen Mark, Chain Hype + credit, Toaster HP / armor / no Block / once-per-combat revive at 50%, and (review)
  downed mid-walk by an attack of opportunity he pops up where he fell (the walk ends; 0 AP), his next walk unaffected.
- **Pork Barrel** (review): the planted barrel's label states its blast at every level.
- **v2 edge cases**: whose turn, silenced (no spells in the kit), sheep, not enough AP, the 0-AP Promise, stunned Buga
  loses exactly his next turn, charmed Buga (can't hurt the charmer, Delegate loophole, −1 AP next turn), null / empty
  targets and a downed user for every skill (no swallowed errors).
- **v2 attacks of opportunity**: walking off a grunt provokes (preview `provokes`, `Combat.provokes`, the stab, the walk
  goes on, no undo); his ranged basic never strikes; Human Shield out of a pinch never provokes and the engaged grunt
  stabs the knight's Block instead; Red Tape pulls never provoke; Delegate's swing keeps the ally's reaction; an ally's
  attack-of-opportunity kill is his credit; a bribed grunt stabs a friend walking off it (credit) and nobody strikes it;
  a Rooted foe pulled next to him still strikes him.
- **previews**: every skill at every level (incl. kills, credit Hype, bumps, swings) predicts reality exactly and leaves
  the fight untouched.
- **stated ranges**: every "within N tiles" / "2-N tiles away" of every level is valid at N and invalid at N+1.
- **AutoPlay v2 battles**: 21 fixture fights (acts 1-3 × normal / elite × levels 1 / 3 / 5 and the three bosses at
  level 5, initiative rolled), no errors, state sane, Buga acts, ≥ 7 different pool skills used, Delegate a staple;
  scripted: Pork Barrel planted between three grunts (I, III), the Toast at a boss, Human Shield II out of a pinch.
- **painters**: every pose and facing with statuses, metrics, portrait, Pork Barrel, crumbs.

## Requests (Nov 3) — flyers ignore the floor, barrels, heals that revive (CONTENT SWEEP heroes-2)

- **Barrels**: `buga_pork_barrel` is `volatile: true`, so any hero's single-target attack (Campaign Pamphlet, Loitering
  Fine, an ally's basic) can be aimed at it and sets it off at once. Credit is as before (`onDestroyed` credits a hero
  `src`): an ally's shot is the ally's kill, so Buga skims; his own shot is his kill (no skim); kickbacks are paid either
  way. Loitering Fine's gold is a rider, so a fine served on a barrel collects nothing, and its `autoplayValue` is 0 on a
  barrel (it counted the gold before). The adjacent "Smash" interaction is unchanged.
- **AutoPlay (expected change)**: in the cue "three grunts around an empty tile", at L3 AutoPlay now plants the barrel
  and pops it at once with a pamphlet (12 to each grunt before they move); at L1 it plants it and lets the fuse do it.
  The assertion in `hero_buga: AutoPlay v2 battles …` accepts either (planted, and either standing or popped by Buga
  with the blast on every grunt) and logs which.
- **Flyers**: Crumb Trail is a floor surface: the engine skips it for flyers, and `slowFoe` already skipped them.
- **Heals**: none in his kit.
- **Tests**: `hero_buga: v2 requests — …`: the flag, a fine on his own barrel (aimable, preview KO, gold = kickbacks
  only, 0 AutoPlay gold), the mage's basic on it (kickbacks + 2 credit), crumbs under / around a flyer (never Slowed).
- **Requests**: none.
