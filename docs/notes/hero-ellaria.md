# HERO ELLARIA — notes

Files: `js/data/heroes/ellaria.js`, `tests/content/hero_ellaria.js` (18 suites `hero_ellaria: …`).
Isolated run: `bash tools/test.sh "suite=hero_ellaria&isolate=heroes/ellaria,hero_ellaria"` (also `suite=content:`).
Look: `bash tools/shot.sh "debug=1&fixtures=1&isolate=heroes/ellaria,hero_ellaria&screen=gallery&gallery=ellaria" .tmp/ellaria/g.png`.

## v2 (initiative, no telegraphs, no Guard, simple skills)

The user's v2 asks: initiative order, no Guard and no starting Block, no telegraphs, and *"skills are too overcomplicated,
doing too much each — simplify them so that it's the combinations of effects that feel strong"*. Ellaria was rebuilt to
DESIGN §6 "Simplicity": one verb per skill plus at most one rider, level II = bigger numbers, level III = bigger numbers
or one rider, a 9-skill pool, a one-rule passive, and combos with other heroes carrying the power. Comedy kept: names,
flavor, corgi names, barks (new lines for initiative, Betty and Basanos).

### Summary

**Ellaria, the Corgi Whisperer** — elf druid (she/her), `unlock: null`. Role: corgi summoner / healer / control,
complexity 2. 26 HP (+4/level), 3 AP, move 4, **initiative +1**, no starting Block. Sprites unchanged (flower crown,
emerald leafy dress, corgis with a white blaze and a loaf butt, the giant corgi).

- **Passive — Pack Leader** (one rule): starts each fight with a corgi. While she stands, each fallen corgi Inspires
  the party (Ellaria, allies, corgis) until the end of their next turn: "AVENGE BISCUIT!". Cut: the +5 Hype rider.
- **Corgi** (`ell_corgi`, one stat line, no levels any more): HP 8 + Ellaria's level, move 4, 2 AP, acts on her turn.
  **Bite** 3 (1 AP). **Bark Bark Bark** (1 AP, cd 2): Taunt every adjacent foe for 1 turn (v2 taunt: on its turn it
  must attack this corgi if it can). Cut: corgi levels tied to Summon Corgi's level, Bark radius 2 and Block at III.
  Names unique among living corgis, picked by a hash of the fight seed and the corgi count (no RNG draw, so summon
  previews stay exact). Pack limit 3.
- **Basic — Thorn Whip**: 1 AP, range 1-3 + LOS, 4 damage, pull 1. **Chomp** (Wild Shape's basic): 7/9/10 + knockback 1.
- **Pool (9)** — starters **Summon Corgi** + **Healing Spring**:

| id | name | AP | cd | I / II / III (desc ≈ effect) |
|---|---|---|---|---|
| `ell_summon_corgi` | Summon Corgi | 2 | 3/2/2 | a corgi on an empty tile within 2; III: it acts right away |
| `ell_spring` | Healing Spring | 2 | 2 | allies in radius 1 heal 5/6/8; every other tile there becomes a puddle (Wet) |
| `ell_roots` | Entangling Roots | 2 | 2 | spell, range 2-5: Brambles fill radius 1 for 2/2/3 rounds; foes in or entering them take 3/4/5 and are Rooted |
| `ell_barkskin` | Barkskin | 1 | 1 | you or an ally: 5/7/9 Block, plus Thorns 2/2/3 until the end of their next turn |
| `ell_good_boy` | Who's a Good Boy? | 1 | 2/2/1 | an ally, corgi or herself: heal 3/5/6 and Empowered (next damaging skill +50%) |
| `ell_fetch` | Fetch! | 1 | 2 | range 6: the corgi nearest the foe bites it for 3/4/5 and drags it up to 2/3/3 toward her |
| `ell_zoomies` | Zoomies | 2 | 2 | each foe next to one of her corgis: 4/5/6 damage, pushed 1/1/2 away from it |
| `ell_switcheroo` | The Ol' Switcheroo | 1 | 2/2/1 | swap with one of her corgis anywhere; the corgi gains 4/6/8 Block |
| `ell_wildshape` | Wild Shape: Absolute Unit | 2 | once per fight | immovable giant corgi until the end of her next turn (III: next 2 turns); Thorn Whip becomes Chomp 7/9/10 |

- **Signature — Release the Corgis** (100 Hype, 2 AP): a corgi pounces beside each of up to 6 foes (nearest first),
  biting it for 6 and Taunting it for 1 turn. The pouncers stay (the pack limit only gates Summon Corgi) and act from
  her next turn (the pounce is their action). Refused when no foe has room beside it.
- **Status** `ell_absolute_unit` (buff, turnEnd, default 1 turn): marks the Wild Shape form.
- **Surface** `ell_bramble` (custom painter: thorny vines): its damage is stored per tile (`surface.data.dmg`, the
  casting level's 3/4/5; 3 when other content lays it). Foes entering take it and are Rooted; Ellaria's side walks
  through; fire spreads through the whole patch. `hazard` is a function: true for non-hero units only, so enemy AI
  paths around brambles, while heroes, corgis and AutoPlay walk through.
- **Items** (all `hero: 'ellaria'`): `ell_good_stick` The Good Stick (rare weapon: +10% damage; corgi attacks +2 —
  Bite via the summon hook, Fetch!/Zoomies/Release via the item hook on 'corgi'-tagged skill damage),
  `ell_shedding_robe` Robe of Perpetual Shedding (common armor: +4 HP; melee attackers that hit her are Dazzled until
  the end of their next turn), `ell_flower_crown` Flower Crown of the Corgi Queen (legendary trinket: +15% healing;
  lost a corgi? one new ready corgi bounds in beside her at the start of her next turn, pack of 3). Cut: the Crown's
  pack-limit-4 rider. None grants Block or acts at combat start.

### What was cut or changed (v1 → v2)

| v1 | v2 |
|---|---|
| Pack Leader: +5 Hype and Inspired per fallen corgi, Inspired turns 2 in the player phase / 1 in the enemy phase | Inspired only, `turns: 1` (= their next turn, both cases) |
| corgi level = Summon Corgi's level (Bite 3/4/5, Bark r1/2/2, +3 Block) | one corgi: Bite 3, Bark adjacent |
| Summon Corgi: corgi level 1/2/3 | cooldown 3/2/2, III acts right away |
| Healing Spring: heal + stop Burning + Wet + puddles + Regen 2 at III | heal + puddles (Wet); water's element rules still put fires out and cool lava |
| Entangling Roots: damage + Root 1/1/2 + Brambles (2 damage on entry) | the Brambles are the skill: one damage number on cast and on entry, Root 1 turn |
| Barkskin: Block + Thorns (turns 2) + cleanse at III | Block + Thorns (turns 1 = through their next turn) |
| Who's a Good Boy? | unchanged (heal + Empowered) |
| Fetch!: + Weak at III | bite + drag only |
| Corgi Bowling | cut (fiddly targeting, overlapped Zoomies' push) |
| The Ol' Switcheroo | unchanged (swap + Block) |
| Wild Shape: 2/2/3 turns, Block 10/14/16, immovable, Chomp, Taunt r1/2/2, Regen 3 at III | immovable + Chomp only, 1/1/2 turns (fresh: through her next turn(s)) |
| Release the Corgis | unchanged rules, shorter text |
| Robe: Dazzled `turns: 2` on the attacker's own turn | `turns: 1` (through its next turn) |
| Flower Crown: pack 4 + respawn | respawn only |

### Combos with other heroes (2-3 per DESIGN §6)

1. **Healing Spring → lightning / frost** (setup): the puddles conduct — any lightning on them (Thunder Jar, Syllamin's
   Electric Lute, Zarathor's Chaos Bolt, wild surges) shocks the whole pool: 4 damage (+50% on the Wet) and a Stun that
   costs each foe its next turn. Allies are never given a puddle, so they are not shocked. Frost freezes Wet foes
   (Frozen: a lost turn) and turns the puddles to ice (pushed units slide 1 more).
2. **Entangling Roots (Brambles) → fire, shoves** (setup + payoff): the patch is flammable (Zarathor's fire runs through
   all of it), and every push, pull or throw into it — Marwyn's Yeet, Slate's Hurl, Betty's Ram, Syllamin's shriek,
   Ellaria's own Thorn Whip / Fetch! / Zoomies — pricks the foe again and Roots it. Rooted foes are sitting ducks for
   AoEs and ranged allies.
3. **Who's a Good Boy? → Empowered** (setup): +50% on an ally's next damaging skill (a cleave, a fireball, a signature).
4. **Thorn Whip / Fetch!** pull foes into allies' cleaves, runes and traps; **corgi taunts** (Bark, Release) protect
   the party, and every corgi that dies for it Inspires the party (+25% damage).

### v2 behaviour notes

- Durations count own turns (ARCHITECTURE §6.5): every debuff she applies uses `turns: 1` (= the foe's next turn), her
  buffs `turns: 1` (= the target's next turn; on herself or her corgis it also covers the rest of the current turn).
- Block from Barkskin / Switcheroo follows the v2 rule (until the owner's next turn start): Barkskin on an ally whose
  turn comes before the enemies' is gone at that ally's turn start — shield allies who already acted, herself or a corgi
  (corgis share her turn, so their Block lasts through every enemy turn of the round).
- The Wild Shape form ends on the status's last tick (`turns === 1 && !fresh`, in the status's own `onTurnEnd`, right
  before the engine removes it), so no enemy turn ever sees an immovable elf; also on downed / combat end / dispel
  (next hook). `shapeOff` removes the status too.
- AutoPlay hints: Wild Shape `aiScore` 6 with a foe within move + 1; Who's a Good Boy? `aiScore` 3 on an ally with a
  foe within 4 who is not already Empowered. Brambles count in AutoPlay's `surfaceGain` (hazard flag).

## Public API

`DD.Ellaria` (read-only helpers, runtime only): `corgisOf(owner)` → her living corgis, `packMax()` (3), `corgiHp(owner)`,
`CORGI` (`'ell_corgi'`), `BRAMBLE` (`'ell_bramble'`), `GIANT_SPRITE` (the Absolute Unit SpriteSpec). Removed in v2:
`corgiLevel`, `rollPath` (no external users).
- Other content may lay Brambles (`DD.Act.setSurface(x, y, 'ell_bramble', rounds)`; set `tile.surface.data.dmg` for a
  damage other than 3) and summon corgis with `DD.Act.summon(owner, 'ell_corgi', x, y, opts)` (a corgi without an
  Ellaria owner never triggers Pack Leader).
- Unit fields written: `unit.data.ellShape` (Wild Shape bookkeeping), `unit.data.ellCrownPending` (crown respawn),
  `unit.sprite` (giant corgi while shapeshifted), `unit.flags.immovable` (while shapeshifted; restored after).

## Deviations

- Wild Shape swaps `unit.basic` to a Chomp slot (level = Wild Shape level) and back; the status has no damage hooks.
- Skill descs leave targeting ranges to the HUD tooltip (range items and Dazzle change them); in-text numbers are
  effects only. Summon Corgi's desc shows the real corgi HP when a unit is given ("8 + your level" without one).
- Entangling Roots: the cast damage is Ellaria's skill damage (her modifiers apply), the entry damage is surface damage
  (environmental: credited to whoever moved the foe, armor ignored), same base number. Brambles don't grow on a tile
  that is on fire (it would burn at once); foes in the radius are caught either way.
- Healing Spring floods every tile of the area that holds no ally (an empty tile, a foe's, a downed ally's): the shared
  water rules then put fires out and cool lava to obsidian.
- The starting corgi is summoned in `onCombatStart` (inside the deploy zone when there is one); it has 0 AP until
  Ellaria's first turn (engine v2 review).

## Requests

- **ITEMS (tests/content/shared.js, FYI)**: your Wild Shape checks still hold (immovable giant corgi with balloons, the
  form ends within 5 turns, Chomp under the Whetstone: 7 → 9). Chomp is 7/9/10 now (was 7/8/10).
- **RULES / AUTOPLAY (optional)**: AutoPlay plays the hero before its summons, so Zoomies (needs a corgi already next to
  a foe) is rarely picked in sims; a probe showed it is valued right (10.7 vs Summon Corgi's 11 in the same spot). A
  "summons first when they set the hero up" pass would let sims exercise it. The Ol' Switcheroo is also never picked.
- **HUD (optional, carried over)**: after Release the Corgis a hero can own 7-9 summons; the party panel then gets long.

## Known issues

- AutoPlay never uses Zoomies and The Ol' Switcheroo in the fixture battles (see Requests); both are covered by tests.
- In an isolated run (Ellaria the only real hero) the generic arena makes her the ally of the fixture heroes: the
  `test_charge` / `test_ring_of_fire` "no damage dealt" advisories are fixture notes, not hers.

## Tests

`tests/content/hero_ellaria.js`, 18 suites (all rewritten for v2 with the migration guide's recipes; sandboxes with
`enemyAi: false` for skill math, AI turned on — `enemyAi: true` or `state.aiOff = false` — where enemy turns matter):
definition + simplicity (descs ≤ 24 words, no telegraph / Guard wording, init +1, unlock null, no starting Block),
Pack Leader (starting corgi, unique names, deployment, Inspired durations when a corgi falls on her turn and on an enemy
turn, no rally while downed), Thorn Whip / Chomp (pit, lava, map edge, kill), Summon Corgi (levels, AP on arrival and
next turn, cooldown timing, pack limit), Healing Spring (heal, puddles, fire, lava, the lightning combo stunning a foe
for exactly its next turn, frost), Entangling Roots (cast, entry, heroes and corgis walk through, root and bramble
durations, fire spread, fire tile, hazard for foes only, a walk stopping inside, Thorn Whip pulling a foe in, silence),
Barkskin (Block lasting through the enemy turn, thorns biting back, durations, cooldown) and Who's a Good Boy? (the
ally's Empowered hit on his own turn, corgi treat), Fetch! (levels, nearest corgi, pit, brambles, kill, corridor
cases), Zoomies (levels, lava, edge, deep water, brambles, kill), The Ol' Switcheroo (levels, escape from a grunt
whose stab lands on the corgi), Wild Shape (levels, exact duration seen from enemy turns, downed, dispelled, fight end),
Release the Corgis (taunts that force the stab onto the corgi, caps, walls, kills, Hype kept when refused), corgi
skills (taunted grunt ignores the knight beside it, corgis act only on her turn), items (Good Stick on every corgi
attack, Robe's Dazzle duration, Crown respawn and its pack limit), v2 edge cases (stun from an enemy costs her next turn
while her corgi still acts, sheep, silence, charm, AP, not her turn) + exact previews for every skill + previews leave
the state untouched, AutoPlay battles acts 1-3 at L1/3/5 (party Ellaria + test knight / cleric / mage).
