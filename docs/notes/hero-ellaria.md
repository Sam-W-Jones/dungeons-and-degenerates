# HERO ELLARIA — notes

Files: `js/data/heroes/ellaria.js`, `tests/content/hero_ellaria.js` (20 suites `hero_ellaria: …`), this file.
Isolated run: `bash tools/test.sh "suite=hero_ellaria&isolate=heroes/ellaria,hero_ellaria"` (also `suite=content:`).
Look: `bash tools/shot.sh "debug=1&fixtures=1&isolate=heroes/ellaria,hero_ellaria&gallery=ellaria" .tmp/ellaria/g.png 1280x720 4000`;
in combat: `screen=combat&party=ellaria,test_knight,test_cleric,test_mage&encounter=test_a1_normal&level=3`.

## v2 (initiative, no telegraphs, no Guard, simple skills, attacks of opportunity)

The user's v2 asks: initiative order, no Guard and no starting Block, no telegraphs, *"skills are too overcomplicated,
doing too much each — simplify them so that it's the combinations of effects that feel strong"*, and (latest playtest)
attacks of opportunity so melee can hold the line, difficulty "hard but fair". Ellaria follows DESIGN §6 "Simplicity":
one verb per skill plus at most one rider, II = bigger numbers, III = bigger numbers or one rider, a 9-skill pool, a
one-rule passive, combos with other heroes carrying the power. Comedy kept: names, flavor, corgi names, barks.

### Summary

**Ellaria, the Corgi Whisperer** — elf druid (she/her), `unlock: null`. Role: corgi summoner / healer / control,
complexity 2. 26 HP (+4/level), 3 AP, move 4, **initiative +1**, no starting Block. Sprites unchanged (flower crown,
emerald leafy dress, corgis with a white blaze and a loaf butt, the giant corgi).

**Attacks of opportunity.** Her basic (Thorn Whip, range 1-3) is ranged, so elf-form Ellaria never makes one and pays
one when she walks away from a melee foe. Her **corgis** (melee Bite, their first skill) and the **Absolute Unit**
(Chomp) do: they hold the line. Enemies weigh the cost, so a grunt next to a corgi keeps biting the corgi instead of
walking past it to the mage (tested, with a no-corgi control where it does walk to the mage). Her escapes and her
positioning never provoke: The Ol' Switcheroo (a swap), Fetch! (the corgi's dash + the drag), Thorn Whip (a pull),
Zoomies and Chomp (pushes). No rule text says so (it is the engine rule); the corgi's codex desc mentions that it bites
foes that walk away, and the Absolute Unit status says Chomp does too.

- **Passive — Pack Leader** (one rule, no hidden clause): *Starts each fight with a corgi. A fallen corgi Inspires the
  party for their next turn. AVENGE BISCUIT!* The rally is the corgi's own `onDeath` (`corgiFell`), so it now also
  works while Ellaria is downed (it used to need her standing: a hidden clause). Only corgis owned by an Ellaria count.
- **Corgi** (`ell_corgi`): HP 8 + Ellaria's level, move 4, 2 AP, acts on her turn. **Bite** 3 (1 AP; also its attack
  of opportunity). **Bark Bark Bark** (1 AP, cd 2): Taunt every adjacent foe (on its next turn it must attack this
  corgi if it can; a taunted foe also makes attacks of opportunity only on its taunter). Names unique among living
  corgis (a hash of the fight seed and the corgi count: no RNG draw, so summon previews stay exact). Pack limit 3.
- **Basic — Thorn Whip**: 1 AP, range 1-3 + LOS, 4 damage, pull 1. **Chomp** (Wild Shape's basic): 7/9/10 + knockback 1.
- **Pool (9)** — starters **Summon Corgi** + **Healing Spring** (descs at level I, ≤ 21 words each, tested):

| id | name | AP | cd | desc (I) · II / III |
|---|---|---|---|---|
| `ell_summon_corgi` | Summon Corgi | 2 | 3/2/2 | Summon a corgi (HP 8 + your level, Bite 3, Bark taunts). Max 3 corgis. · III: It acts at once. (range 1-2, an empty tile that is not lava / fire / poison / spikes) |
| `ell_spring` | Healing Spring | 2 | 2 | Heal yourself and allies in radius 1 for 5 HP; puddles (Wet) fill the rest of the area. · 6 / 8 |
| `ell_roots` | Entangling Roots | 2 | 2 | spell, range 2-5: Brambles fill radius 1 for 2 rounds. Foes caught or entering take 3 damage and are Rooted. · 4 / 5, 3 rounds |
| `ell_barkskin` | Barkskin | 1 | 1 | Give yourself or an ally 5 Block, and Thorns 2 through their next turn. · 7 / 9 Block, Thorns 3 |
| `ell_good_boy` | Who's a Good Boy? | 1 | 2/2/1 | Heal an ally, a corgi or yourself for 3 HP and Empower them (next damaging skill +50%). · 5 / 6 |
| `ell_fetch` | Fetch! | 1 | 2 | range 6: The corgi nearest the foe dashes in, bites it for 3 damage and drags it up to 2 tiles toward you. · 4, 3 tiles / 5, 3 |
| `ell_zoomies` | Zoomies | 2 | 2 | Each foe next to one of your corgis takes 4 damage and is pushed 1 tile away from it. · 5 / 6, push 2 |
| `ell_switcheroo` | The Ol' Switcheroo | 1 | 2/2/1 | Swap places with one of your corgis anywhere on the field; the corgi gains 4 Block. · 6 / 8 |
| `ell_wildshape` | Wild Shape: Absolute Unit | 1 | 1 charge | Once per fight: become an immovable giant corgi through your next turn. Thorn Whip becomes Chomp (7 damage, knockback 1). · Chomp 9 / 10, 2 turns |

- **Signature — Release the Corgis** (100 Hype, 2 AP): *A corgi pounces beside each of up to 6 foes (nearest first),
  bites it for 6 damage and Taunts it.* The pouncers stay (the pack limit only gates Summon Corgi), pin their foes
  (attacks of opportunity) and act from her next turn (the pounce is their action). Refused when no foe has room.
  AutoPlay fires it at 100 Hype in a crowded fight (tested).
- **Status** `ell_absolute_unit` (buff, turnEnd, default 1 turn): marks the Wild Shape form.
- **Surface** `ell_bramble` (custom painter: thorny vines): damage stored per tile (`surface.data.dmg`, the casting
  level's 3/4/5; 3 when other content lays it). Foes entering take it and are Rooted; Ellaria's side walks through;
  fire spreads through the whole patch. `hazard` is a function: true for non-hero units only (enemy AI paths around
  brambles; heroes, corgis and AutoPlay walk through).
- **Items** (all `hero: 'ellaria'`, one rule each, nothing at combat start): `ell_good_stick` The Good Stick (rare
  weapon: +10% damage; corgi attacks +2 — Bite (attacks of opportunity included) via the summon hook,
  Fetch!/Zoomies/Release via the item hook on 'corgi'-tagged skill damage), `ell_shedding_robe` Robe of Perpetual
  Shedding (common armor: +4 HP; melee attackers that hit her — attacks of opportunity too — are Dazzled until the end
  of their next turn), `ell_flower_crown` Flower Crown of the Corgi Queen (legendary trinket: +15% healing; lost a
  corgi? one new ready corgi bounds in beside her at the start of her next turn, pack of 3; a corgi lost while she is
  downed is replaced at the start of her first turn back on her feet).

### This pass (finishing the v2 conversion)

The previous pass had converted the kit to v2 (durations, no Guard, no starting Block, cut riders, Corgi Bowling gone).
This pass, for the simplicity rules and the new attacks of opportunity:
- **Descs tightened** to ≤ 21 words (test budget, was 24): Entangling Roots (17 words, was 21), Wild Shape, Release the
  Corgis ("Taunts it": the status shows its one turn), Summon Corgi ("Max 3 corgis", "It acts at once"; the empty-tile
  targeting is the HUD's), Barkskin (the Thorns duration no longer reads as the Block's), Fetch! (says the corgi
  dashes in, which is what happens), passive (17 words).
- **Pack Leader lost its hidden clause** ("While she stands"): the corgi's own death hook rallies the party. The Flower
  Crown's loss bookkeeping moved there too (same consistency).
- **Attacks of opportunity**: designed around rather than with new rules — corgis are the line-holders, the Absolute
  Unit gets a melee basic, her mobility (swap, dash, pull, push) is the escape. Corgi codex desc, Absolute Unit status
  desc, blurb ("loyal loaves who nip the ankles of anyone trying to leave"), a corgi attack bark, new barks.
- **Barks** for the new heroes and the new rule (pronouns as the user confirmed; tested): Pebbles ("signed a
  ceasefire", "a fireproof treat"), Hjalmar ("give Biscuit his collar back"), Valdris ("hammer them back into shape"),
  "Corgis, herd them. Nobody leaves without a nip.", "Ow! I provoked that one, didn't I?", "Biscuit, keep him busy while
  I tiptoe away." (the Marwyn idle line went; he keeps "Heel. No, not you, Marwyn."). Roots' flavor names Pebbles.
- Numbers unchanged (no balance pass needed: see Measurements).

### What the v2 conversion cut or changed (v1 → v2, for the record)

| v1 | v2 |
|---|---|
| Pack Leader: +5 Hype and Inspired per fallen corgi, Inspired turns 2 in the player phase / 1 in the enemy phase, only while she stands | Inspired only, `turns: 1` (= their next turn), also while she is downed |
| corgi level = Summon Corgi's level (Bite 3/4/5, Bark r1/2/2, +3 Block) | one corgi: Bite 3, Bark adjacent |
| Summon Corgi: corgi level 1/2/3 | cooldown 3/2/2, III acts at once |
| Healing Spring: heal + stop Burning + Wet + puddles + Regen 2 at III | heal + puddles (Wet); water's element rules still put fires out and cool lava |
| Entangling Roots: damage + Root 1/1/2 + Brambles (2 damage on entry) | the Brambles are the skill: one damage number on cast and on entry, Root 1 turn |
| Barkskin: Block + Thorns (turns 2) + cleanse at III | Block + Thorns (turns 1 = through their next turn) |
| Fetch!: + Weak at III | bite + drag only |
| Corgi Bowling | cut (fiddly targeting, overlapped Zoomies' push) |
| Wild Shape: 2/2/3 turns, Block 10/14/16, immovable, Chomp, Taunt r1/2/2, Regen 3 at III | immovable + Chomp only, 1/1/2 turns (fresh: through her next turn(s)) |
| Robe: Dazzled `turns: 2` on the attacker's own turn | `turns: 1` (through its next turn) |
| Flower Crown: pack 4 + respawn | respawn only |

### Combos with other heroes (setups and payoffs)

1. **Healing Spring → lightning / frost** (setup): the puddles conduct — any lightning on them (the Thunder Jar,
   Syllamin with The Electric Lute, wild surges, the fixture mage's Chain Zap) shocks the whole pool: +50% on the Wet
   and a Stun that costs each foe its next turn (tested). Allies are never given a puddle. Frost freezes Wet foes
   (Frozen: a lost turn) and turns the puddles to ice (pushed units slide 1 more). Anti-synergy to know: Wet foes
   can't Burn (Pebbles, Zarathor) and fire turns her puddles to steam.
2. **Entangling Roots (Brambles) → fire, shoves, "hits Rooted foes"** (setup): the patch is flammable (Zarathor's and
   Pebbles' fire runs through all of it, tested), every push, pull or throw into it — Marwyn's YEET, Slate's Personal
   Space / Get Over Here, Betty's Ramming Speed!, Syllamin's Discordant Shriek, Ellaria's own Thorn Whip / Fetch! /
   Zoomies — pricks the foe again and Roots it, and Rooted foes are payoffs for Betty's Kick 'Em While They're Down
   (more damage vs Stunned or Rooted), AoEs and ranged allies.
3. **Who's a Good Boy? → Empowered** (setup): +50% on an ally's next damaging skill (a cleave, a fireball, a
   signature); on a corgi it is the next real Bite (attacks of opportunity neither use nor spend it, tested).
4. **Positioning**: Thorn Whip / Fetch! pull foes into allies' cleaves, Corelos' runes and Hjalmar's traps; Zoomies and
   the Absolute Unit's Chomp push them into pits, lava, water and traps (a Chomp attack of opportunity on a walker with
   a pit behind it is a YEET, tested).
5. **Holding the line** (v2): corgis next to foes pin them (attacks of opportunity; enemies stick to them), Bark makes a
   foe ignore everyone else — including for attacks of opportunity, so a barking corgi lets Ellaria walk away
   untouched (tested) — and every corgi that dies for the party Inspires it (+25% damage).

### v2 behaviour notes

- Durations count own turns (ARCHITECTURE §6.5): every debuff she applies uses `turns: 1` (= the foe's next turn), her
  buffs `turns: 1` (= the target's next turn; on herself or her corgis it also covers the rest of the current turn).
- Block from Barkskin / Switcheroo follows the v2 rule (until the owner's next turn start): shield allies who already
  acted, herself or a corgi (corgis share her turn, so their Block lasts through every enemy turn of the round).
- The Wild Shape form ends on the status's last tick (`turns === 1 && !fresh`, in the status's own `onTurnEnd`), so no
  enemy turn ever sees an immovable elf; also on downed / combat end / dispel (next hook). `shapeOff` removes the status.
- Attacks of opportunity: Chomp and Bite have no user-side effects, so nothing needs a `ctx.opportunity` guard. The
  Good Stick's +2 and the Robe's Dazzle apply to them (cause 'skill', adjacent).
- AutoPlay hints: Wild Shape `aiScore` 6 with a foe adjacent (review: it was "within move + 1", and AutoPlay spent its
  last AP on the form far from anyone — 0.54 Chomps per cast); Who's a Good Boy? `aiScore` 3 on an ally with a foe
  within 4 who is not already Empowered. Brambles count in AutoPlay's `surfaceGain` (hazard flag).

## Public API

`DD.Ellaria` (read-only helpers, runtime only): `corgisOf(owner)` → her living corgis, `packMax()` (3), `corgiHp(owner)`,
`CORGI` (`'ell_corgi'`), `BRAMBLE` (`'ell_bramble'`), `GIANT_SPRITE` (the Absolute Unit SpriteSpec).
- Other content may lay Brambles (`DD.Act.setSurface(x, y, 'ell_bramble', rounds)`; set `tile.surface.data.dmg` for a
  damage other than 3) and summon corgis with `DD.Act.summon(owner, 'ell_corgi', x, y, opts)` (a corgi without an
  Ellaria owner never triggers Pack Leader or the Crown).
- Unit fields written: `unit.data.ellShape` (Wild Shape bookkeeping), `unit.data.ellCrownPending` (crown respawn),
  `unit.sprite` (giant corgi while shapeshifted), `unit.flags.immovable` (while shapeshifted; restored after).

## Deviations

- Wild Shape swaps `unit.basic` to a Chomp slot (level = Wild Shape level) and back; the status has no damage hooks.
- Skill descs leave targeting ranges to the HUD tooltip (range items and Dazzle change them); in-text numbers are
  effects only. Summon Corgi's desc shows the real corgi HP when a unit is given ("HP 8 + your level" without one).
- Entangling Roots: the cast damage is Ellaria's skill damage (her modifiers apply), the entry damage is surface damage
  (environmental: credited to whoever moved the foe, armor ignored), same base number. Brambles don't grow on a tile
  that is on fire (it would burn at once); foes in the radius are caught either way.
- Healing Spring floods every tile of the area that holds no ally (an empty tile, a foe's, a downed ally's): the shared
  water rules then put fires out and cool lava to obsidian.
- The starting corgi is summoned in `onCombatStart` (inside the deploy zone when there is one); it has 0 AP until
  Ellaria's first turn (engine v2 review).
- Pack Leader's rally and the Crown's loss note live in the corgi summon's `onDeath` hook (not the passive's
  `onAllyDeath`, which the engine skips for a downed hero), so the one-rule passive holds while she is down.
- Thorn Whip pulling a foe into an ally (or a corgi) bumps both for 3 (the shared displacement rule; previews show it).
  The act-1 sim below shows AutoPlay accepting that now and then ("FRIENDLY · ell_thorn_whip" 0.1-1.9 a fight).
- (review) Summon Corgi targets only safe empty tiles (no lava, fire, poison, spikes: `safeFree`, as the starting corgi,
  the Crown and Release already did). The refusal text is the HUD's generic one (see Requests).
- (review) Zoomies: a foe next to several corgis is pushed away from the first one (unit order) whose push lane holds no
  friend; a foe squeezed between two corgis has no clear lane and is bumped into one (shared rule, the preview says so).

## Requests

- ~~HERO PEBBLES: DESIGN's Pebbles ideas reused three of Ellaria's skill names~~ — resolved (review): Pebbles ships
  *Hot Zoomies*, *Fetch Quest* and *Hot Diggity Dog!*, so no two skills share a name. Combos still to lean on: fire runs
  through her Brambles; her Healing Spring makes foes Wet (no Burn) — the anti-synergy DESIGN mentions.
- **HERO HJALMAR / HERO VALDRIS (FYI)**: her pulls (Thorn Whip 1, Fetch! 2-3) and pushes (Zoomies, Chomp) put foes on
  traps; corgis make many small hits (Bite 3 twice a turn + attacks of opportunity), so a "+N damage per hit" forge buff
  on a corgi is a good target. Her barks name you (he/him).
- **RULES / AUTOPLAY (optional, carried over)**: AutoPlay plays the hero before its summons, so Zoomies (needs a corgi
  already next to a foe) is rare in sims (0.2 a fight when socketed); a "summons first when they set the hero up" pass
  would let sims exercise it.
- **HUD (optional, carried over)**: after Release the Corgis a hero can own 7-9 summons; the party panel then gets long
  (ui-polish compacts 3+ summons into an entourage row).
- **Lead / integrator (review)**: `docs/notes/content-digest.md` line 32 (pools besides the starters) still lists
  `ell_bowling`: Corgi Bowling was cut in v2.
- **HUD (optional, review)**: `combat_hud.js` `invalidReason` never shows a skill's `target.canTarget` refusal, so Summon
  Corgi on lava reads "Needs an empty tile." and Fetch!'s "No room for a corgi next to it." / "Needs a corgi." are never
  seen. Suggest: when the tile passes range / LOS / filter, show the string `canTarget` returns (run it through
  `DD.Targeting.pure`, it is a query).

## Known issues

- AutoPlay rarely uses Zoomies and The Ol' Switcheroo (both covered by tests), and plays her as a ranged support: even
  with the review's Wild Shape hint it lands about 0.7 Chomps per cast in fixture fights. Humans are not affected.
- In an isolated run (Ellaria the only real hero) the generic arena makes her the ally of the fixture heroes: the
  `test_charge` / `test_ring_of_fire` "no damage dealt" advisories are fixture notes, not hers.
- (review) A dispel of the Absolute Unit during an enemy turn (act 3's buff strippers) leaves her immovable with the
  Chomp basic until her next turn starts: the engine has no status-removed hook, so `syncShape` runs on her own hooks.
- (review) Bumps are the shared displacement rule everywhere in her kit: a Zoomies pincer (above), and a Chomp attack of
  opportunity that knocks a walker into one of her corgis (the walker takes 7 + bump 3, the corgi bump 3; the knockback
  did not move the walker, so its walk goes on and the corgi's own bite follows).

## Measurements

- Fixture AutoPlay battles (party Ellaria + test knight / cleric / mage, fixture encounters, L1/3/5, 27 fights): all
  victories in 2-8 rounds; per act her skill uses e.g. act 1 `{thorn_whip 19, summon_corgi 11, corgi_bite 29,
  barkskin 6, fetch 4, spring 3, wildshape 3, roots 2, chomp 2, bark 1}`; attacks of opportunity by corgis 0-3 an act,
  on corgis 1-2, on Ellaria 0-1 (enemies mostly stay put next to a corgi rather than pay to leave it).
- Real-content act-1 sim, party Ellaria / Marwyn / Zarathor / Kiri (`tools/sim.sh "seeds=8&from=300&party=ellaria,marwyn,
  zarathor,kiri&stop=1"`, 41 fights, other areas mid-conversion): act 1 cleared 6/8 (losses: the Rat King 2/4; Grimble
  4/4), normal fights 100% won with 5% party HP lost, no errors or warnings. Ellaria: 29.3 damage a fight (6.2 by
  corgis), 11 healing, 0.05 downs a fight (Zarathor 49, Kiri 37, Marwyn 11.6 damage).

## Tests

`tests/content/hero_ellaria.js`, 20 suites (sandboxes with `enemyAi: false` for skill math, AI turned on — `enemyAi:
true` or `state.aiOff = false` — where enemy turns matter):
definition + simplicity (descs ≤ 21 words and logged, passive ≤ 20, no telegraph / Guard wording, init +1, unlock
null, no starting Block, barks name 8+ heroes incl. Valdris / Hjalmar / Pebbles, pronoun check), Pack Leader (starting
corgi, unique names, deployment, Inspired durations when a corgi falls on her turn and on an enemy turn, other owners'
corgis and summons don't count, the rally while she is downed), Thorn Whip / Chomp (pit, lava, map edge, kill), Summon
Corgi (levels, AP on arrival and next turn, cooldown timing, pack limit), Healing Spring (heal, puddles, fire, lava,
the lightning combo stunning a foe for exactly its next turn, frost), Entangling Roots (cast, entry, heroes and corgis
walk through, root and bramble durations, fire spread, fire tile, hazard for foes only, a walk stopping inside, Thorn
Whip pulling a foe in, silence), Barkskin and Who's a Good Boy?, Fetch! (levels, nearest corgi, pit, brambles, kill,
corridor cases), Zoomies (levels, lava, edge, deep water, brambles, kill), The Ol' Switcheroo, Wild Shape (levels,
exact duration seen from enemy turns, downed, dispelled, fight end), Release the Corgis (taunts that force the stab onto
the corgi, caps, walls, kills, Hype kept when refused), corgi skills, **attacks of opportunity** (her walk away
provokes, preview says so, no undo; elf form makes none; a corgi bites a walker once per round, again next round, can
kill it; stunned / asleep / sheep corgis don't; Empowered kept; the Absolute Unit Chomps and knocks back a walker,
into a pit = YEET; Switcheroo, Fetch!'s dash and drag, Thorn Whip's pull, Zoomies' push provoke nothing; Bark lets her
walk away untouched while the barking corgi does get stabbed; Barkskin's Thorns answer one; the AI grunt sticks to a
corgi rather than walking to the mage, control without the corgi), items (Good Stick on every corgi attack incl. the
free bite, Robe's Dazzle duration incl. on an attacker of opportunity, Crown respawn, pack limit, while downed), v2 edge
cases (stun from an enemy costs her next turn while her corgi still acts, sheep, silence, charm, AP, not her turn) +
exact previews for every skill + previews leave the state untouched, AutoPlay fires Release the Corgis at 100 Hype,
AutoPlay battles acts 1-3 at L1/3/5 (party Ellaria + test knight / cleric / mage; logs skill uses and attacks of
opportunity). Review regressions (997 assertions in all): Summon Corgi refuses lava / fire / poison / spikes (brambles and
shallow water allowed), Zoomies picks a clear lane (and the pincer bump), Wild Shape 1 AP + two Chomps in the cast
turn, Healing Spring on herself, no Bramble damage for staying inside.

## Review (v2) — adversarial review of the v2 conversion (ADVERSARIAL REVIEWER role)

Scope: `js/data/heroes/ellaria.js`, `tests/content/hero_ellaria.js`, this file, against DESIGN §6 "Simplicity", the v2
turn rules and the attacks-of-opportunity rule (rules.md). An earlier review attempt was cut off by the app hang: its two
edits are kept (the log reads "Ellaria is an Absolute Unit.", not the engine's "Ellaria is Absolute Unit."; the
Fetch! fetcher comment) and so are its corridor / lane / stunned-corgi Fetch! and Zoomies tests.
Scratch (Chrome slot aware): `.tmp/ellrev/run.sh "probe=<file>&isolate=heroes/ellaria&verbose=1"` runs `probe*.js`;
`.tmp/ellrev/shot2.sh <out.png> 1280x720 7000 "screen=combat&encounter=a1_goblin_ambush&scene=wild2"` (scene2.js).

### Verified (probes + suites; all held)

- **desc == execute** at every level for the 13 skills, the passive, the status, the surface, the corgi and the 3 items
  (7-21 words, passive 18; all numbers shown). Fetch! fuzz, 400 random boards (317 fetches): 0 drags longer than the
  desc, 0 friendly damage, 0 attacks of opportunity, 0 preview mismatches, the corgi always ends next to its prize.
- **v2**: own-turn durations (every debuff `turns: 1` = the foe's next turn, buffs = the target's next turn, the
  Absolute Unit seen by enemy turns exactly while it lasts, Inspired from a corgi killed by an attack of opportunity on
  her own turn covers the rest of it + her next turn), no Guard, no starting Block, `init` +1, `unlock: null`, no XP /
  intent / telegraph wording; the Crown's pending flag does not leak into the next fight (fresh unit data); previews of
  a corgi's death leak no Inspired and no log line; Healing Spring over a downed ally (puddle, no harm from lightning).
- **Attacks of opportunity**: elf form makes none (Thorn Whip is tagged ranged) and pays one when walking off a melee
  foe; corgis (Bite) and the Absolute Unit (Chomp, whose knockback ends the walker's walk) hold the line; swap, dash,
  drag, pull and push never provoke; a barking corgi lets her disengage (a taunted foe only strikes its taunter);
  stunned / asleep / frozen / sheep corgis neither react nor answer Fetch! / Zoomies; the AI grunt sticks to a corgi.
- **Pronouns**: she/her for Ellaria; the barks naming Valdris, Hjalmar, Pebbles, Betty, Basanos, Slate, Marwyn use
  he/him or no pronoun ("his collar" is Biscuit's).
- **Simplicity**: one verb + at most one rider each. Closest to the line: Entangling Roots (a surface whose one effect is
  "damage + Rooted") and Wild Shape (a form: Chomp basic + immovable); both read in one breath. II = numbers, III =
  numbers or one rider (Summon Corgi III "acts at once"). Passive = one rule plus her setup corgi, as DESIGN's brief;
  AVENGE BISCUIT! stays the comedic core. Combos: Healing Spring (Wet → lightning / frost), Brambles (fire, shoves,
  Rooted payoffs), Who's a Good Boy? (Empowered allies), pulls / pushes into cleaves, traps, pits. Reads at once as "a
  corgi-summoning elf druid"; distinct from the other 15 (Pebbles, the other dog, is a fire skirmisher and renamed his
  Zoomies / Fetch skills).
- **Visuals**: gallery (Ellaria, corgi), deployment and in-combat shots, the giant corgi with its flower crown, Wild
  Shape's 1 AP / ×1 charge on the skill bar.
- **Real content**: 36 AutoPlay fights over every act's normal / elite / boss encounters, Ellaria + 3 random real heroes
  (L2/3/5, random loadouts and items): 33 wins, state sane, never two units on one tile, 0 warnings, every pool skill and
  the signature used.

### Fixed (each with a regression in `tests/content/hero_ellaria.js`; reverting the fix fails it — mutation-checked)

1. **Summon Corgi accepted lava, fire, poison and spikes.** The summon preview shows no damage, then the corgi burned at
   her turn end (lava: 9 → 1 HP + Burn): a misclick trap, and a 2-AP "sacrifice a corgi for a party Inspire" exploit.
   Now `canTarget` uses `safeFree`, the tiles the starting corgi, the Crown and Release already used (brambles and
   shallow water stay valid). Suite "Summon Corgi".
2. **Zoomies shoved a foe flanked by two corgis into the packmate or ally in the lane** of the first corgi in unit order
   (a foe with corgis W and S and the knight E: knight −2, foe +3). Now the push comes from a corgi whose lane holds no
   friend (the desc is unchanged: "pushed 1 tile away from it"); a true pincer still bumps by the shared rule (tested,
   the preview says so). Suite "Zoomies".
3. **Wild Shape cost 2 AP for a one-turn form.** Cast + one Chomp, then one turn of Chomp / step / Chomp (knockback 1
   makes a re-engage step) traded evenly with whipping (about 21-28 vs 24 damage for the same 6 AP), for a
   once-per-fight "big" skill that puts a 26-HP druid in melee; fixture AutoPlay battles showed nothing over Barkskin
   (72.0 vs 72.6 her damage a fight, all wins). Now **1 AP**: walk up + transform + Chomp, or transform + two Chomps,
   in the cast turn. Its AutoPlay hint now needs a foe adjacent (it was "within move + 1": AutoPlay spent its last AP on
   the form far from anyone, 0.54 Chomps per cast; now half the casts, same damage). Suite "Wild Shape".
4. **Healing Spring said "Heal allies"** but heals Ellaria when she stands in it (range 0 = on herself): "Heal yourself
   and allies in radius 1 …", like the kit's other "yourself" descs. Suite "Healing Spring".
5. **Entangling Roots said "Foes in or entering them take 3 damage"**, which reads as damage for standing in them each
   turn; the cast hits foes caught in it once, after that only entering pricks: "Foes caught or entering take 3 damage
   and are Rooted." Suite "Entangling Roots" (no damage after a round inside).

### Remaining (not fixed)

- The HUD never shows `canTarget` refusals (Summon Corgi on lava reads "Needs an empty tile."): HUD request above.
- A dispel of the Absolute Unit on an enemy turn lasts until her next turn start; bumps stay the shared rule (Known
  issues). AutoPlay plays her ranged (few Chomps, rare Zoomies, Release only at 100 Hype in a crowd): sims slightly
  under-rate her, players are unaffected.

## Requests (Nov 3) — heals that revive, barrels, flyers (CONTENT SWEEP heroes-1, 2026-11-04)

Suite: `hero_ellaria: v2 requests — …`. Rules: `docs/notes/rules.md` "v2 requests".

- **Heals.** Who's a Good Boy? no longer returns early on a downed target: the treat gets the ally up with its HP
  (3 / 5 / 6, "UP! N HP"), then Empowers the risen ally (rider after the heal). Healing Spring is an area heal: it never
  revives (a downed ally in it stays down; tested).
- **Barrels.** Thorn Whip, Chomp (Absolute Unit) and the corgis' Bite can be aimed at a volatile object (a biting corgi
  is in the blast). **Fetch! opts out** (`target.objects: false`): range 6 without line of sight, and the corgi's dash
  and drag don't happen on a barrel — it would be a free blind blast.
- **Flyers.** Brambles are a floor surface: the engine never pricks a flyer and it sees no hazard there. The cast's
  "caught" hit is aimed at the area, so it still hits a flyer standing in it. Descs are exact now: Brambles "Grounded
  foes that enter … (flyers pass over)"; Entangling Roots "Foes caught, and grounded foes entering, take N damage and are
  Rooted." `safeFree` / the starting corgi use `hazardAt(x, y, null)` (corgis walk): unchanged.
