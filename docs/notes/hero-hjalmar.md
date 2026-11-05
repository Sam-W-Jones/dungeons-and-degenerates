# HERO — Hjalmar, the Menace (notes)

Files: `js/data/heroes/hjalmar.js`, `tests/content/hero_hjalmar.js` (22 suites `hero_hjalmar: …`), this file.
Run: `bash tools/test.sh "suite=hero_hjalmar&isolate=heroes/hjalmar,hero_hjalmar"` and `bash tools/test.sh "suite=content:&isolate=heroes/hjalmar,hero_hjalmar"`.
Looks: `bash tools/shot.sh "debug=1&fixtures=1&isolate=heroes/hjalmar,hero_hjalmar&screen=gallery&gallery=hjalmar" .tmp/hjalmar/g.png 1280x720 4000`,
in combat: `bash tools/shot.sh "debug=1&fixtures=1&isolate=heroes/hjalmar,hero_hjalmar&screen=combat&party=hjalmar,test_knight,test_cleric,test_mage&encounter=test_a1_elite&seed=4&autoplay=1&fast=1" .tmp/hjalmar/c1.png 1280x720 9000`.
Scratch (not shipped) in `.tmp/hjalmar/`: `traps.html` (every trap painter big, the glove in 4 directions, zoom-1 tiles, the
sprite's poses and portraits), `big.html` (the monkey at zoom 9 + a size line-up), `shot.sh` (screenshots a page there; takes a
machine-wide Chrome slot like `tools/*.sh`).

## Summary

Built from scratch, v2-native (initiative, one turn per unit, no telegraphs, no Guard, no combat-start Block, attacks of
opportunity). User brief: *"Hjalmar (male) a monkey. Very mischievous, focuses on comedic traps"* — he/him. DESIGN §6
"Hjalmar" + "Simplicity": one verb per skill, power from combinations. A small, gleeful menace who rigs every floor with
banana peels, bear traps and whoopee cushions, steals hats and gold, and laughs at his own pranks. Role: trapper /
trickster. Complexity 2, `unlock: null`, 22 HP (+3/level), 3 AP, move 5, **initiative +4**, `flags.hop`, colour `#e0a53a`.

**Traps** (the identity): non-blocking objects set on empty tiles (`hja_peel`, `hja_bear_trap`, `hja_cushion`, `hja_paint`,
`hja_firecracker`, `hja_glove`; `data = { owner: Hjalmar's unit id, kind, seq, …its numbers }`, `label` with the numbers for
the inspect panel). The **first foe** of his to enter one — walking on its own turn, pushed, pulled, swapped or teleported
in — springs it: the trap is used up and its one effect happens. Heroes walk over them harmlessly (Undo still works),
flyers float over (the engine skips object `onEnter` for flyers), and foes never see them: no `hazard`, so the AI walks
straight into them. They last until sprung (cooldowns pace them; no cap). Every trap has a dashed banana-yellow ring under
it so the board reads at a glance.

**Passive — Monkey Business** (one rule): *every time a foe springs one of Hjalmar's traps, the party gains 5 Hype* ("the
crowd loves a pratfall"). Lives in `spring()` (every trap is his); it keeps working while he is down.

**Kit** (ids `hja_*`; ⭐ starting; numbers I / II / III):

| Skill | id | Cost | Effect (one verb + at most one rider) | Pairs with |
|---|---|---|---|---|
| Coconut Toss (basic) | `hja_basic` | 1 AP | 4 damage to a foe within 4 (line of sight) | — (ranged: he makes no attacks of opportunity) |
| Banana Peel ⭐ | `hja_peel` | 1 AP, cd 3 / 3 / 2 | trap within 3 / 4 / 4: the first foe to step on it slips and can't act until the end of its turn | pushes / swaps onto it (= a Stun on its next turn), interrupts boss wind-ups |
| Bear Trap ⭐ | `hja_bear_trap` | 1 AP, cd 1 | trap within 3: 5 / 7 / 9 damage and Rooted through its next turn | Betty's Kick 'Em, Basanos, AoEs and fire on a foe that can't leave |
| Whoopee Cushion | `hja_cushion` | 1 AP, cd 2 / 1 / 1 | trap within 3: Taunted by Hjalmar through its next 1 / 1 / 2 turns | keeps a brute off the squishies while the monkey stays out of reach; drags it through the tanks' attacks of opportunity |
| Paint Bucket | `hja_paint` | 1 AP, cd 2 / 2 / 1 | trap within 3: Dazzled through its next 1 / 2 / 2 turns | protects whoever it was about to hit |
| Firecracker Bundle | `hja_firecracker` | 2 AP, cd 2 | trap within 3 (the HUD shows its radius 1): when a foe steps on it, 6 / 7 / 9 fire damage to every foe within 1 | pulls / cleaves that bunch foes up (fire *damage* only: it does not ignite oil or webs — no `applyElement`) |
| Spring Glove | `hja_glove` | 1 AP, cd 2 / 2 / 1 | trap within 3, aimed away from Hjalmar (the HUD area shows the aim): the first foe to step on it is knocked 2 / 3 / 3 tiles that way | pits (YEET), lava, water (Wet → lightning), walls (bump), his other traps |
| Pickpocket | `hja_pickpocket` | 1 AP, cd 2 | steal 3 / 4 / 5 gold from an adjacent foe; it is Weak through its next 1 / 1 / 2 turns | — (gold; a Weak brute) |
| Swing Away | `hja_swing` | 1 AP, cd 2 / 1 / 1 | leap to an empty tile within 3 / 4 / 5 that he can see (a jump: never provokes, works while Rooted) | escaping melee after a pickpocket |
| Bait and Switch | `hja_switch` | 1 AP, cd 3 / 3 / 2 | swap places with a foe within 2 / 3 / 4 (not immovable foes) | stand on your own trap, then swap a foe onto it; swaps foes into hazards |
| Prank War (signature) | `hja_signature` | 2 AP, 100 Hype | every foe within 2 of a tile within 5 takes 8 damage and slips (can't act until the end of its turn) | — |

Pool = 9 (+ basic + signature): six one-verb traps, a steal, a leap, a swap. AP 1 / 2 mixed; long cooldowns on Banana Peel
and Bait and Switch. Nothing is a `spell` (Silence doesn't stop him). Every desc ≤ 24 words, no conditions (tested).

**Durations** (v2 own-turn counting, all tested turn by turn): a trap sprung **during the foe's own turn** (it walked in)
applies its status mid-turn, so the standard "fresh" rule makes Root / Taunt / Dazzle cover the rest of that turn **and**
its next turn ("through its next turn"); sprung on someone else's turn (a push, a swap) they cover its next turn. A Bear
Trap ends the walk there (Root); a Spring Glove ends it after the punch (`Act.stopMove`, the walk can't go on from another
tile); a Banana Peel's `hja_slipped` "Slipped" is `stunLike` with `skipFresh: false`: walked into, it costs the rest of
that turn (no attack) and is gone at its end; pushed into on a hero's turn, it costs the foe its whole next turn. So "it
can't act until the end of its turn" is exact in both cases — one turn's worth either way, never two. (Review v2: it is
also `noMove`, so a custom planner that walks again after the slip is refused, and its `onTurnEnd` calls off a wind-up
queued after the slip — see Review.)

**Damage** from traps is Hjalmar's (`Act.damage(owner, …)`, `noHighGround`): his outgoing modifiers apply at the moment it
springs (Inspired, item `dmg`), kills are credited to him (+kill Hype), pit / hazard kills by the glove are environmental
(+20). A charmed Hjalmar's trap can't damage his charmer (the core charm rule) but still applies its status.

**AutoPlay hints** (`autoplayValue`, never shown to players): `trapValue(ctx, kind)` = the chance a foe walks over the
tile before his next turn (within its move, on a shortest way to the hero-side unit nearest it: 0.5, a stop tile next to
that unit +0.15, a detour 0.15, ranged ×0.4, engaged / pinned / flying 0) × what the trap would do to it (peel: its hit
+3; bear: snap after armor +3 vs melee; cushion (review v2): its hit × 0.8 when the hero it is walking at stands more
than 2 from Hjalmar (its strike fizzles), × 0.2 when he is next to that hero, × 0.1 when it is coming for him anyway;
paint: half its hit + 1;
firecracker: the chance that anyone springs it × boom × the foes around; glove: where the punch lands — pit 15, hazard
6, bump 3), best foe + 0.3 × the next, × 0.6 per trap of his already next to the tile, max 14. Pickpocket: +gold (run
value, like Buga's fines). Bait and Switch (quick pass): the trap under him × the target. In the suite's 12 fixture fights
(short ones: 2-8 rounds) AutoPlay sets all six traps (28 set, 12 sprung) and wins 12/12.

**Status / objects**: `hja_slipped` "Slipped" (🍌 debuff, stun-like, `noMove`, refresh, 1 turn, `skipFresh: false`,
`onTurnEnd` → `DD.AI.cancelIntents(unit, '🍌 Slipped!', { keepUnstoppable: true })`); six trap objects
(`blocksMove: false`, `blocksLos: false`, `hp: 0`, `onEnter` → `springOn`, custom `draw`).

**Items** (all `hero: 'hjalmar'`): `hja_coconut` Coconut of Unusual Size (rare weapon: +10% damage — his traps too —, and
Coconut Toss knocks its target 1 tile away from him, e.g. into one of his traps), `hja_pomade` Greased Fur Pomade (rare
trinket: +1 move, he can't be opportunity-attacked — `modifyOpportunity` cancel, pure), `hja_prop_sack` Bottomless Sack of
Props (legendary armor: +6 max HP, the first trap he sets each turn costs 0 AP — `modifyCost` keyed on
`unit.data.hjaTrapTurn !== state.turn`, set when a trap is placed). No `stats.block` anywhere (v2).

**Sprite**: humanoid, `tiny` build, scale 0.92 (a small monkey next to the party), brown fur skin, `rat` ears in fur with
pale insides (they read as round monkey ears), a red organ-grinder tunic, a long `cat` tail in fur, no base eyes / mouth.
`overlay`: a pale peanut-shaped face mask with big shiny eyes (one brow slanted, one raised: scheming), nostrils and a huge
white grin, a tiny tilted fez with a swinging tassel, a pale belly patch, a strap and a burlap sack of props at his back
hip with a banana poking out, and the curl at the end of his tail. Trap painters: a three-flap banana peel with its
stem, open steel jaws with teeth and a chain, a pink whoopee cushion with its nozzle, a paint bucket propped on a stick
over a tripwire and colour splats, a red firecracker bundle with a fizzing fuse, a box with a spring and a red boxing
glove plus a floor arrow pointing the aim. Checked in the gallery (poses, both facings, statuses, portraits 128 / 64 / 40),
at zoom 9 and in combat (traps on the board).

**Barks**: 13 keys × 4-6 lines + an extra `trap` key (when a foe springs one, 35%), ≤ 70 characters, his voice ("Ooh ooh!",
"Hee hee", bananas, never sorry), no she/her anywhere about him (tested).

## Tests (`tests/content/hero_hjalmar.js`, 22 suites, ~896 assertions)

registry / identity / numbers / descs at every level (numbers shown, ≤ 24 words, no conditions, levels differ) / barks /
pronouns / trap objects (flat, walkable, no hazard) · sprite + portrait + every trap painter (all glove directions), no
warnings · traps (not on objects / pits / walls / units, one per tile, invisible to the AI, a hero walks over his own trap
and can Undo, a grunt walks in on its turn and is stopped, ownerless traps, never on heroes, flyers float over, they wait
for rounds) · Monkey Business (+5 per trap, +5 +kill, cap 100, while he is down) · Coconut Toss · Banana Peel I-III
(range, cooldown counted in his turns, a walking grunt slips and never attacks, back up at that turn's end, normal next
turn) · Banana Peel pushed in by the knight (loses its next turn, exactly one), stun-immune foes, a boss wind-up
interrupted · Bear Trap I-III (Rooted at exactly one turn start, stuck, then walks and stabs; a lethal snap mid-push;
the knight's shield bash into it) · Whoopee Cushion I-III (the stab at the cleric fizzles mid-walk; Taunted at exactly 1 /
1 / 2 turn starts; pushed in with Hjalmar in reach it stabs him, not the cleric) · Paint Bucket I-III (Dazzled at exactly 1
/ 2 / 2 turn starts; pushed in: 1 turn) · Firecracker I-III (radius 1 shown, foes on and next to it, not 2 away, the cleric
spared; a grunt walking in dies, credited to him, victory) · Spring Glove I-III (area shows the aim, aimed east / north,
a walking grunt knocked back and stopped; pit YEET + Hype, wall bump, lava, water → Wet, map edge, immovable brute, glove →
bear trap chain) · Pickpocket I-III (gold, Weak stab 3, Weak at exactly 1 / 1 / 2 turn starts) · Swing Away I-III (range,
line of sight, empty tiles, no attack of opportunity vs a walk that provokes −4, works while Rooted, Wet on water) · Bait and
Switch I-III (onto his own bear trap, no attack of opportunity, not immovable foes, not a flyer over a pit) · Prank War (100
Hype, 8 to foes within 2 only, the cleric spared, all slip and lose their next turn exactly once, stun-immune: damage only,
a kill mid-skill) · items (knockback into his trap, +10% on traps, move 6 and no provokes, free first trap incl. the 2-AP
firecracker, 28 HP, init +4 in a rolled fight) · previews == reality for every skill at every level + swaps onto three
kinds of traps (damage, Root, the glove's punch, Hype) · v2 edge cases (stunned by an enemy turn, silenced, sheep, charmed:
−1 AP and his trap roots but can't hurt the charmer, not enough AP, not his turn, a lethal toss, the last foe dying in a trap
on its own turn → victory, leap / swap out of melee without attacks of opportunity) · combos (the knight's shield bash into
a firecracker, the glove → water → the mage's Chain Zap, a rooted grunt held for the party) · AutoPlay: 12 fixture fights
(acts 1-3, normal / elite / boss, levels 1 / 3 / 5, two loadouts) with Hjalmar + knight / cleric / mage, no swallowed
errors, all six traps set, traps sprung, plus deterministic turns (a trap in a corridor, a swap onto his bear trap, Prank
War into a crowd) · review (v2): a peel on the last step of a walk (no stab), a planner that walks twice and winds up
after slipping (second walk refused, wind-up called off, next turn normal), a glove aimed into a wall (bump 3, the walk
goes on), a charmed foe springs his bear trap, the cushion's AutoPlay worth (far-off ally ≫ himself). Coconut Toss's line
of sight is now checked on a foe in range behind a wall (it was out of range before, so the check proved nothing).

## Public API (for tests / other content)

`DD.Hjalmar = { KINDS, TRAP_HYPE, SLIPPED, isTrap(obj), traps(owner?) → [tiles], canTrapAt(p) → true | reason,
setTrap(owner, x, y, kind, opts) → obj | null, spring(x, y, foe) → bool, springOn(tile, unit) → bool, gloveTiles(ctx),
trapValue(ctx, kind), crossChance(foe, p, party) }`. Kinds: `peel`, `bear` (`{ snap }`), `cushion` / `paint` (`{ turns }`),
`boom` (`{ boom }`), `glove` (`{ push, dir }`).

## Deviations

- **Banana Peel**: DESIGN's idea was "slips and slides 2 tiles". A slide needs the direction a foe was moving; object
  `onEnter(unit, obj, tile)` gets no cause and no previous tile, so a pushed foe's direction is unknowable (and an onward
  slide mostly carries an approaching foe into the party). The push verb went to the Spring Glove (aimed when set, which
  the HUD shows), and the peel's slip became "it can't act until the end of its turn" (stun-like, one turn's worth, see
  Durations). See Requests.
- **Signature**: DESIGN suggested "a trap appears under every foe / every trap triggers at once"; Prank War is the
  banana-peel version of the first (every foe within 2 of a tile slips + 8 damage) — one verb, no dependence on how many
  traps are out, distinct from Corelos' all-foe Stun.
- **Whoopee Cushion** = Taunted *by Hjalmar* (DESIGN: "the foe must attack the cushion... or Confused"; the task:
  taunt). A taunted foe out of reach of the monkey wastes its attack — the monkey is the bait.
- **No trap cap**: traps last until sprung; cooldowns (1-3) pace them. Simpler descs than a "(max N)" rule; revisit if
  boards get cluttered in long boss fights.
- Traps don't stop a **push**: the engine's push loop goes on after a trap springs mid-push (a foe shoved two tiles over a
  bear trap is snapped and Rooted, then slides on; a glove's punch inside another push leaves the rest of that push to
  carry on from the new tile). Every entered tile fires its trap, as for runes.
- **Swing Away** works while Rooted (a leap is not a move action — the engine's rule, like Kiri's Ethereal Step).
- Pool of 9 (DESIGN v2: 8-10; the registry suite: 9-11).

## Requests

- **RULES / ENGINE** (`js/engine/actions.js` `enterTile`): pass `cause` (and the tile the unit came from) to object and
  surface `onEnter(unit, obj, tile, cause, from)` — terrain `onEnter` already gets `cause`. Tile traps could then react to
  how / from where a unit arrived (a true "slides on the way it was going" peel; traps that only catch walkers).
- **Integrator** (`tests/content/integration.js`): "ten real heroes" expects 10; there are 16 now (13 before Hjalmar).
- **Lead (DESIGN)**: §6 Hjalmar brief can list the final kit above; §3 "all 10 heroes" → 16.
- ~~**NARRATIVE** (optional): a Hjalmar hero event (DESIGN §11)~~ — done by NARRATIVE: `ev_hja_prank_king` (a goblin
  prank-off; he/him checked by the review).
- **HUD** (optional): a hover on a trap tile shows its `label` + object desc already; a small "🐒 n traps" chip on his card
  would help in long fights.
- (review v2) **ENGINE** (`js/engine/ai.js`): `AI.moveTo` / `api.moveTo` and `AI.windUp` / `api.windUp` don't refuse a
  unit that became stun-like (or a sheep) earlier in its own turn — only `executeIntent` fizzles its strikes. Any mid-turn
  stun (a banana peel, a stun rune, an attack of opportunity's stun rider, thorns) leaves a planner free to walk on or to
  queue a wind-up that lands next turn. Slipped now guards itself (`noMove` + its `onTurnEnd`, see Review); a check in
  those two functions would cover every status. Repro: `.tmp/hjalmar-review/p5.js` (a grunt def with a planner that walks
  twice and winds up after slipping).
- (review v2) **ENEMIES ACT 3** (`leapTo`, the Hell Hound's Pounce) and **ACT 2** (`doCharge`): a skill that moves its
  user and then strikes should stop when the move left the user stun-like (`DD.Combat.isStunned(user)`): a Hell Hound
  pouncing onto a banana peel still bit (twice in 40 real AutoPlay fights), and a charger that slips on the last tile of
  its charge would still hit.

## Known issues

- AutoPlay seldom picks Pickpocket (it values the gold like Buga's fines, below a coconut + safety); players will use it.
- Trap AutoPlay hints are estimates of enemy paths (shortest ways toward the nearest hero); fights where foes stand still
  (ranged, engaged) get few traps from AutoPlay — by design.
- (review v2) Pickpocket deals no damage, so a stalled fight (one foe kept alive next to him) farms 3-5 gold every third
  turn with no cap — the same class as Buga's Loitering Fine (cd 1, 2-3 gold, but it hurts the foe). Left as is.
- (review v2) A spring glove facing a wall (or the map edge) can't knock anyone: the walker is bumped (3) and walks on,
  like any blocked push; the HUD's aim area shows the wall. A foe charmed onto the party's side still springs his traps
  (it is still a foe to a trap). Both pinned by the review suite.
- In the full run at the end of the build pass (766 suites), every `hero_hjalmar` (21) and `content:` (8) suite passed; the
  78 failing sections belonged to other areas mid-migration. After the review: see Review (v2) → Full run.

## Review (v2) — adversarial review of the Hjalmar v2 work (ADVERSARIAL REVIEWER role)

Scope: `js/data/heroes/hjalmar.js`, `tests/content/hero_hjalmar.js`, this file. Scratch (Chrome-slot aware, not shipped):
`.tmp/hjalmar-review/` — `run.sh` + `probe.html` (probes `p1*.js` deterministic, `p2.js` real-content AutoPlay fuzz with
Hjalmar in every party, `p3.js` previews / boss guards, `p5.js` the slip-then-act repro, `p6.js` downs per hero),
`shot.sh` + `scene.html` / `scene.js` (a real-hero board with all six traps, `zoom=`, `key=` / `hx=` for HUD targeting).

**Verified (by running it; everything below held)**
- desc == effect at every level for all 11 skills: the numbers, ranges, AP and cooldowns were dumped and compared (descs
  7-23 words); own-turn durations are tested turn by turn; previews equal reality, also for the cases the suite did not
  cover — the Coconut's knockback into a bear trap / onto a peel / into a pit / against a wall, a swap onto a peel /
  cushion / paint bucket (statuses included), Prank War's statuses.
- Simplicity: every skill is one verb + at most one rider (a trap's one effect; Bear Trap damage + Root; Pickpocket gold +
  Weak; Prank War damage + slip); levels II / III are numbers only; the passive is one rule ("every trap a foe springs:
  +5 Hype") and the comedic core (the crowd loves a pratfall); pool 9. The six traps share one rule set (first foe,
  heroes walk over, flyers float, unseen by the AI), written once in the trap objects' desc.
- Reads as the user's character (a very mischievous monkey whose thing is comedic traps): banana peels, whoopee cushions,
  paint buckets, spring gloves, firecrackers, a pickpocket and a bait and switch; he/him everywhere (tested), barks ≤ 70.
- Combos with other heroes are real: pushes / pulls / swaps onto traps (the knight's bash, the Coconut, glove → bear trap),
  Root and Slipped feed Betty's Kick 'Em (`isStunned || cantMove`), a taunted foe walks through a tank's attack of
  opportunity to reach the monkey (probe: the grunt passed the knight, took 5, then stabbed Hjalmar), glove → water → Wet.
- v2 + attacks of opportunity: no intents / Guard / Block / XP leftovers (grep), `init: 4`, `unlock: null`; his ranged basic
  makes none; Swing Away and Bait and Switch never provoke; the Pomade's `modifyOpportunity` is pure. A peel on the last
  step of a walk (next to him) still costs the strike. Real bosses' stun guards key on `DD.Act.isStunLike`, so the slip
  counts (Grimble: the first peel slips him, then his appeal refuses Prank War's slip).
- Real content (scratch fuzz, AutoPlay, normal; random real parties around Hjalmar, every act and kind): 40 + 80 fights
  (two seeds) → 36 and 77 won; 40 boss fights → 25 won; no swallowed errors; a trap never sprang on a hero-side unit. In a
  120-fight census Hjalmar went down in 24% of the fights he was in, the same as Sparrow (24%) and Syllamin (23%), the
  other ~20-HP heroes: the reach-aware targeting does not single him out.
- Visuals: gallery (poses, statuses, portraits 128 / 64 / 40, zoom-1 size), the objects gallery, a real-hero board with all
  six traps at zoom 1 and 2.2 (each trap reads at a glance; the glove's floor arrow shows its aim), the glove's HUD aim
  area while targeting, the trap inspect panel (label with numbers + desc).

**Fixed (each with a regression in `hero_hjalmar: review (v2) — …`, mutation-checked)**
1. **"It can't act until the end of its turn" leaked when a foe slipped during its own turn.** Stun-like only stops strikes
   (`executeIntent` fizzles them); `AI.moveTo` / `AI.windUp` don't check stuns, so a custom planner could walk on after
   the slip (the act 1 Mimic did, twice in 80 real fights) or queue a wind-up that landed on its next turn (several elites
   and bosses walk, then wind up). Slipped is now also `noMove` (the second walk is refused) and its `onTurnEnd` calls off a
   wind-up queued after the slip (`keepUnstoppable`; one queued before it was already interrupted). Removing either half
   fails the suite. The engine-wide fix is under Requests.
2. **AutoPlay hardly ever set a Whoopee Cushion.** Its worth tested "Hjalmar out of the foe's reach" as his distance to the
   trap (≤ 3, the cast range) against the foe's move + 1 (≥ 4), so every cushion was worth 0.15 × the foe's hit. Now: × 0.8
   when the hero the foe walks at stands more than 2 from him (its strike fizzles), × 0.2 when he is next to that hero,
   × 0.1 when it is coming for him anyway (Durations / AutoPlay hints above).
3. **A vacuous test**: Coconut Toss's line-of-sight assertion used a foe out of range (it passed whatever LOS did); it now
   uses a foe 2 tiles away behind a wall.
4. **Notes**: the Firecracker no longer claims to pair with oil (fire *damage* does not ignite tiles; only skills that call
   `applyElement` do, and their descs say so).

**Not changed (judgement calls, documented)**: the glove's bump-and-walk-on when it faces a wall (the push rule; the desc
is exact), charmed foes springing traps (still foes), no trap cap, Pickpocket's uncapped gold in a stalled fight (Known
issues), the long-ish trap descs (19-23 words: "the first foe to step on it" is the trap rule and other heroes run to ~22).

**Full run** (`bash tools/test.sh`, after the fixes): 794 suites, 115,224 assertions ok, 3 failing sections, none of them
Hjalmar's — `bosses_act1: rat king swelling ranks…` (a TypeError in its own file, mid-flight), `integration: cross-content
consistency` (pre-v2 unlocks and "ten real heroes"), `integration: losing a protect objective…` ("no XP" step). All 22
`hero_hjalmar` suites and the 8 `content:` suites pass (also isolated), and so do the other areas' suites that use his
traps (`hero_slate: combos with the cast…`); no swallowed "Error in …" from his file.

## Requests (Nov 3) — flyers ignore the floor, barrels, heals that revive, map rotation (CONTENT SWEEP heroes-2)

User requests: flyers ignore floor effects; barrels can be set off by targeting them; heals aimed at a downed ally get it
up; a rotatable map. Engine rules: `docs/notes/rules.md` "v2 requests".

- **Flyers**: his traps are ground objects, so the engine never runs their `onEnter` for a flyer; `springOn` now also
  checks `DD.Grid.feelsFloor(unit)` (a direct call agrees). AutoPlay: `crossChance` was already 0 for a flyer; Bait and
  Switch's hint (`switchHint`) is now 0 on a flying target (it would hover over his trap), and the glove's `knockValue`
  no longer counts a pit for a flyer. The trap descs already say "flyers float over". The firecracker's blast is an
  explosion, so it still hits a flyer next to the trap.
- **Barrels**: Coconut Toss (his basic) can be aimed at a volatile object; the Coconut of Unusual Size's knock-back is a
  rider, so it is skipped. Pickpocket, Swing Away and Bait and Switch are not attacks (not aimable). No opt-outs.
- **Heals**: none in his kit.
- **Map rotation (P0)**: `isoStep` goes through `DD.Iso.local` (fallback: the yaw-0 formula if `DD.Iso` is missing), so the
  spring glove's floor arrow and the glove's aim follow the view; pixel-identical at the default view.
- **Rotation (box prop, P2)**: the spring glove's def is `yawAware: true`, so its `g.box` stands on the view's ground quad
  and turns with the board. It is the only trap with a box; the other five stay billboards. The default view is
  pixel-identical (painter hashes before vs after, all four aims). Suite: `hero_hjalmar: the spring glove's box turns
  with the map (yawAware)`.
- **Onyx**: nothing of his mentions Josiah's raven.
- **Tests**: `hero_hjalmar: v2 requests — …` (53 assertions): each of the 6 trap kinds pushed under a flyer (no spring,
  no Hype, the trap stays; `springOn` refuses), a walker still springs; a trap in a flyer's path and Bait and Switch on a
  flyer are worth 0 to AutoPlay, and the real swap leaves the trap; Coconut Toss at a barrel (preview = reality, no
  knock-back, 1 AP); the glove arrow at 0 / 90 / 180 / 270 / 37° equals `DD.Iso.local`, yaw 0 is the classic step and
  180° points the other way.
- **Requests**: none.
