# HERO — Hjalmar, the Menace (notes)

Files: `js/data/heroes/hjalmar.js`, `tests/content/hero_hjalmar.js` (25 suites `hero_hjalmar: …`), this file.
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
`unit.data.hjaTrapTurn !== state.turn`, set when a trap is placed), `hja_canned_laughter` Canned Laughter (rare trinket,
D9 Nov 12: he heals 4 HP whenever a foe springs one of his traps; the rule lives in `spring()`, see "Sustain (Nov 12)").
No `stats.block` anywhere (v2).

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

`DD.Hjalmar = { KINDS, TRAP_HYPE, SLIPPED, CANNED ('hja_canned_laughter'), CANNED_HEAL (4), LAUGH_HEAL (5, Nov 18),
laughHeal(unit) → 5 | 9, isTrap(obj), traps(owner?) → [tiles], canTrapAt(p) → true | reason,
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

## Sustain (Nov 12) — Canned Laughter (D9; spec `.tmp/wf13/sustain-spec.md` §1.5 + §2.1, owner HERO-TRIO)

The user (D9): no generic heal for every party (the First-Aid Fanny Pack left the starting kit); sustain comes from each
hero's own verbs, spread over skills, items and passives, "without overloading each character with a self-heal".
Hjalmar's is the **item** delivery in that spread: the prankster monkey laughs at his own pratfalls, and laughter is the
best medicine. It is optional loot on purpose: his downs are average (0.25 a fight) and his weakness (0.44x the median in
the no-pack sim) is output, not sustain, so his kit doesn't change.

- **New hero item** `hja_canned_laughter` Canned Laughter 🥫: rare trinket, `hero: 'hjalmar'`, `stats: {}`, `hooks: {}`.
  Desc `Whenever a foe springs one of Hjalmar's traps, he heals 4 HP.` (`'… he heals ' + CANNED_HEAL + ' HP.'`, 61
  chars). Flavor `A tin can of recorded laughter. Laughter is the best medicine, says Hjalmar. Josiah declined to
  comment.` (104 chars). Ordinary hero-item loot and shop stock (default weight; only while he is in the party). It
  competes with the Greased Fur Pomade for the trinket slot and pairs with the Bottomless Sack of Props.
- **Mechanics** in `spring()` (the one place every trap goes off), inside the `owner.defId === HERO` block after the
  Monkey Business Hype: `if (active(owner))` the trap bark, then, if he wears it, a `🥫 HA-HA-HA!` pop-up (banana yellow)
  and `A().heal(owner, owner, CANNED_HEAL)`; when that heals more than 0, the log line `Hjalmar laughs so hard at the
  pratfall that it heals him.` (after Act.heal's own `Hjalmar heals 4 HP.`).
  - One heal per trap sprung: a Firecracker that hits 2 foes is one spring; two traps sprung are two heals.
  - It fires on any turn (traps mostly spring on the foes' turns) and for any way in: walking, pushed, pulled, swapped.
  - A downed Hjalmar is not `active`: his trap still bites and the crowd still cheers (+5 Hype), but he heals nothing and
    stays down (never a revive). An ownerless trap heals nobody.
- Constants `CANNED = 'hja_canned_laughter'`, `CANNED_HEAL = 4`, both exported on `DD.Hjalmar`. Header comment: "4 hero
  items, a loading tip".
- **Loading tip** (his file, `DD.registerNarration('tips', …)`): `Wearing Canned Laughter, Hjalmar heals every time a foe
  springs one of his traps. Laughter is the best medicine.`
- AutoPlay: nothing. It is a passive rider on springs; AutoPlay already values setting traps (`trapValue`).
- Expected (spec §1.5): about 0.7 springs a normal fight and 1.4 an elite fight under AutoPlay, so about 3-6 HP a fight
  when worn. Balance pass 3 measures its worn rate; no fallback (it is optional loot).

**Tests**: `ITEMS` gets `hja_canned_laughter` (registry: he/him in its texts, flavor ≤ 120, no stats.block); "four hero
items" (was three; the rare + legendary check stays); new suite `hero_hjalmar: Canned Laughter — he heals 4 HP whenever a
foe springs one of his traps (D9)` (24 assertions): the exports; a rare trinket only he wears, no stats, the exact desc,
desc and flavor ≤ 120; worn, hurt by 10, a grunt pushed onto his bear trap heals him exactly 4 (the trap still snaps and
roots), both log lines, the pop-up over him, Monkey Business still +5; not worn: 0; a grunt walking in on its own turn
heals him 4; one Firecracker hitting 2 foes heals once, a second trap heals again (+8 in all); downed: the trap springs
and pays Hype, he heals nothing and stays down; full HP: no overheal, no log line; hurt by 2: capped at max; an ownerless
trap heals nobody; the tip (≤ 140, no she/her). Monkey Business (Hype) is unchanged and its suite passes as written.

**Deviations**: none from the spec's mechanics or texts. The log line uses `owner.name` (it reads `Hjalmar …`). The
Canned Laughter cases are a suite of their own instead of extra lines in the items suite (whose title names the three
older items).

**Requests**: none.

## Review (sustain, Nov 12) — adversarial review: the user's intent and the rules text (ADVERSARIAL REVIEWER role)

- **Verified** (suites; scratch harness `.tmp/rev13/rt.js`: real encounters, real allies, Canned Laughter worn; 9 / 7 / 7
  fights at hero level 2 / 4 / 6): one heal of 4 per trap a foe springs (a two-foe Firecracker is one), on any turn,
  never for a downed Hjalmar, nothing from an ownerless trap; the item desc ("Whenever a foe springs one of Hjalmar's
  traps, he heals 4 HP."), the `🥫 HA-HA-HA!` pop-up, the log and the tip agree. 0.9 / 1.3 / 4.6 HP a fight while worn
  (the spec's estimate: about 3-6). It is the item delivery of D9's spread: optional, hero-locked rare loot.
- **Fixed**: nothing. Pronouns: he / him; Josiah (he) in the flavor.

## Review (sustain, Nov 12) — engine, AutoPlay and tests (ADVERSARIAL REVIEWER role)

Probes in a scratch page (`.tmp/rev-engine/probe.html` + `probe.js`, run by `.tmp/rev-engine/run.sh`, which takes a
Chrome slot like `tools/test.sh`): real act 1 encounters through `DD.Encounter.build` + `DD.AutoPlay.runBattle`, parties
with Hjalmar wearing Canned Laughter, Basanos, Sparrow and Slate (Stress Ball), levels 1 and 3.

**Verified (by running code)**
- Dry runs and previews never heal or log: every real "laughs so hard" line had a real (non-simulated) `DD.Act.heal` on
  Hjalmar behind it, over 20 AutoPlay fights; a party push onto his trap (Basanos' Shoulder Check) previews his +4
  (`perUnit[hjalmar].heal === 4`) and the preview leaves HP, the trap, the log and Hype untouched; the real push heals 4.
- Loot and shops: with Hjalmar in the party a rare roll gives Canned Laughter about 1 time in 27 (22/600), shops stock
  it (10/200); never without him. Save / load keeps it worn, and a fight from the reloaded run has it on his unit.

**Fixed**
1. **AutoPlay never valued the item's play pattern.** The spec (§5) says the dry run of the triggering action sees the
   heal, which holds for a party push onto a trap, but most traps spring on a foe's own turn, where no dry run runs:
   `trapValue` (the trap skills' `autoplayValue`) had no term for it, so wearing the item changed nothing about where or
   whether he set traps. `trapValue` now adds, while he wears it and is hurt, the chance that any foe springs the trap ×
   the heal priced the way AutoPlay prices heals (`(1 − miss) × min(4, missing) × (1.5 below half HP, else 0.8)`), before
   the "another trap is right there" discount and the cap of 14. At full HP or without the item: unchanged. Regression
   (each case fails without the fix): `hero_hjalmar: review (sustain) — AutoPlay prices Canned Laughter's heal when he
   sets a trap; previews show it and leak nothing; loot, shops and saves` (exact deltas: missing 3 → + chance × 3 × 0.8;
   below half → + chance × 4 × 1.5; full HP → no change; plus the preview, loot / shop and save / load cases above).
   Deviation from spec §5 ("Canned Laughter: no AutoPlay"), recorded here.

**Test runs**: isolated `suite=hero_hjalmar&isolate=hjalmar,basanos,items,consumables`: 26 suites, 996 ok, 0 failures
(before the loot / save cases were added; the review suite alone: 19 ok). Full run: see `docs/notes/hero-slate.md`
"Review (sustain) — engine, AutoPlay and tests".

## Finish (Nov 14) — the playtest findings held for the sustain build (FIX: CONTENT)

- **heroes-2 / desc-sweep-7 / review-open-6 (fixed)**: with the Coconut of Unusual Size, Coconut Toss reads "Deal 4
  damage to a foe within 4 and knock it 1 tile back (Coconut of Unusual Size)."
- **heroes-v1 / desc-sweep-5 / review-open-7 (fixed)**: every "within N" (Coconut Toss, the six traps, Swing Away,
  Bait and Switch, Prank War's aim) prints `DD.Targeting.reach`.
- **text-tone-24 / review-open-11 (fixed)**: Pickpocket says "it is Weakened through its next turn" (the status's name).
- Suite `hero_hjalmar: finish — texts follow his items …` covers all three. D7: two swap barks. Numbers: none changed.

## Conditional healing (Nov 18) — "The Laugh Track" (build:g4, plan §4.2)

The user (Nov 18): "I want everyoe else brought up but by conditional healing". Hjalmar's lift broadens his D9 heal:
Canned Laughter's heal moves into his passive **Monkey Business** (broaden-existing-heal), and the can becomes the
amplifier that keeps its old 4. Ellaria untouched.

**What.** A foe springs one of his traps (`spring(x, y, foe)`, the one choke point for every trap kind on any turn: walked
in, pushed, pulled, swapped, teleported): the party gains 5 Hype (as before) and, while he is active, he laughs so hard he
heals **`LAUGH_HEAL` = 5**, plus **`CANNED_HEAL` = 4** more with Canned Laughter (9 in all). Self, once per trap (a
Firecracker that hits three foes is one laugh). A downed Hjalmar's traps still bite and cheer; `active(owner)` is checked
before the heal (never a revive).
- **Code** (`js/data/heroes/hjalmar.js`): `LAUGH_HEAL`, `laughHeal(u)` (5, or 9 with the can), the local `healWorth`
  (E2 with a fallback), `spring()` calls `DD.Act.heal(Hjalmar, Hjalmar, laughHeal, { via: 'lift:hjalmar' })` on every spring
  (0 at full HP: the sim counts the fire); the pop-up ("🤣 HA-HA!", or "🥫 HA-HA-HA!" with the can), the log line and the
  new `laugh` bark (0.35) only when it healed, else the old `trap` bark (0.35).
- **Texts** (built from the constants): passive "Every time a foe springs one of Hjalmar's traps, the party gains 5 Hype
  and he laughs so hard he heals 5 HP. The crowd loves a pratfall." · Canned Laughter "Whenever a foe springs one of
  Hjalmar's traps, he heals 4 HP more (9 in all)." · the **loading tip** (critic, Nov 18: the old one said only the can
  healed) "Every trap a foe springs makes Hjalmar laugh so hard he heals 5 HP. Canned Laughter adds 4 more. Josiah has
  filed a complaint." · barks `laugh`: "HA! HAHA! Ow, my ribs. No wait, that's better." / "Comedy heals!" / "Laughter is the
  best medicine. Bananas are second."
- **AutoPlay.** The laugh mostly lands on a foe's turn (no dry run sees it), so `trapValue` adds `(1 − miss) ×
  healWorth(Hjalmar, laughHeal)` whenever he is active and hurt, with or without the can (the same pricing as before:
  min(heal, missing) × 1.5 below half HP, else × 0.8; the `Math.min(v, 14)` cap kept). A push / swap onto his trap inside
  a hero's action is dry-run (the preview shows his +5 / +9).
- **Exports:** `DD.Hjalmar.LAUGH_HEAL`, `laughHeal` (+ `CANNED_HEAL` as before).

**Tests** (`tests/content/hero_hjalmar.js`, new suite "hero_hjalmar: conditional heal (Nov 18)", 39 ok): the constants
(5 / 4, `laughHeal` 5 or 9); the passive, Canned Laughter and the tip word for word; the old item-only tip gone; the three
`laugh` barks (he/him, ≤ 70); a grunt walks onto his Bear Trap on its own turn → +5 and +5 Hype (with the can +9), his heals
stat grows by it, one call `heal(Hjalmar, Hjalmar, N, { via: 'lift:hjalmar' })`; at full HP the call is made (0) and the
`trap` bark plays, hurt the `laugh` bark; a Firecracker hitting three foes → one laugh; an ally pushed onto the trap, an
ownerless trap, a flyer floating over → no laugh; a downed Hjalmar → no call, stays down, the trap still bites; previews:
setting a trap shows no heal (delayed), Bait and Switch onto his own trap shows and heals +5; `trapValue` hurt − full =
chance × `healWorth(Hjalmar, 5)` without the item.
**Updated assertions (never deleted):** the Canned Laughter suite (renamed "… he heals 4 HP more (9 in all) … (D9; Nov 18
the amplifier)"): desc text, worn +9 (was +4), **not worn +5** (was 0), the foe's-turn and firecracker cases at 9 / 18,
the rest unchanged; the review (sustain) suite (renamed "… AutoPlay prices the laugh's heal …"): the hint gains the laugh
without the item (chance × 5 × 0.8 missing 10), missing 3 is the same worn or not, below half HP + chance × 9 × 1.5 worn /
× 5 × 1.5 bare, Shoulder Check's preview shows +9 (was +4).

**Sanity sims** (`bash tools/sim.sh "debug=1&raw=1&seeds=30&from=…&stop=2&party=…"`, normal, acts 1-2, one page at a
time; the `lift:hjalmar` row of "== conditional heals"):

| party (from) | fights | fires / fight | HP / fight (self) | by kind (fires, HP) | Canned Laughter worn |
|---|---|---|---|---|---|
| hjalmar, marbles, pebbles, zarathor (51200) | 257 | 1.11 | 2.5 (overheal 56%) | regular 1.22, 2.7 · elite 1.65, 3.5 · boss 0.4, 1.1 | 8 fights (3%): 1.13 fires, 5.3 HP |
| hjalmar, basanos, sparrow, corelos (51400) | 196 | 1.36 | 4.2 (overheal 39%) | regular 1.47, 4.2 · elite 1.75, 7.5 · boss 0.59, 2 | 5 fights (3%): 1 fire, 3.6 HP |

T8 for `lift:hjalmar` (min 0.6 fires, band 2-8 HP, guard rail ≤ 10 in regular fights): met on both pages (regular 2.7 /
4.2). The high overheal is honest: most springs land on a foe's turn while he is still at full HP (the call counts as a
fire all the same). Every page: 0 errors, 0 DD.warn lines, 0 stalls.

**Full run** (`bash tools/test.sh`, Nov 18, after the G4 build; G3 building in parallel): 1318 suites PASS, 150,819
assertions, 0 failures, 0 swallowed "Error in" lines (the one Bark-B-Q content advisory is the known, expected one).

### DESIGN §6 brief (Nov 18)

For the engine builder (phase 2), in `### Hjalmar the Menace — Monkey Trickster (he/him)` (DESIGN.md ~664). Two unique
anchors.

Anchor 1, these two whole lines:
```
- Passive *Monkey Business*: every time a foe springs one of his traps, the party gains 5 Hype. The crowd loves a
  pratfall.
```
Replace with:
```
- Passive *Monkey Business*: every time a foe springs one of his traps, the party gains 5 Hype and he laughs so hard
  he heals 5 HP. The crowd loves a pratfall.
```
Anchor 2, this whole line:
```
- Hero item *Canned Laughter* (rare trinket): he heals 4 HP whenever a foe springs one of his traps.
```
Replace with:
```
- Hero item *Canned Laughter* (rare trinket): whenever a foe springs one of his traps, he heals 4 HP more (9 in all).
```

### Deviations (Nov 18)

- None from the plan's mechanics, numbers or texts. Notes: the laugh's pop-up and log line now show only when it healed
  (the old item pop-up showed even at full HP: convention §3, FX gated on the return value); the pop-up reads "🤣 HA-HA!"
  without the can (the "🥫 HA-HA-HA!" can stays for the item).

### Requests (Nov 18)

- None.

### Conditional heal: adversarial review (Nov 18, review:g4)
Code path read end to end: every trap kind goes through `spring()` (the objects' `onEnter` → `springOn`: a foe of the
owner, on the floor), one `DD.Act.heal(Hjalmar, Hjalmar, laughHeal, { via: 'lift:hjalmar' })` per spring after the
effect (a Firecracker's blast loop is inside the switch, the laugh outside it), `active(owner)` checked first (a downed
Hjalmar, or one an ally is mid-revive on, is never healed by it); no trap ever feeds a heal back into a trap; ownerless
map traps heal nobody. Texts == execute (passive, Canned Laughter, the tip, all from the constants); `laugh` bark only
when the heal > 0. Mutations checked against the suite: LAUGH_HEAL ≠ 5, the heal per blast victim, a missing `active`
check, the item-gated `trapValue` term would each fail it. Forced-party sim (`seeds=30&from=55000&stop=2&party=hjalmar,
slate,kiri,buga`, `.tmp/heal/review-g4/hjalmar_55000.txt`, 209 fights): `lift:hjalmar` **1.49 fires, 4.5 HP a fight**
(regular 1.57 / 4.6, elite 1.48 / 4.1, boss 1.2 / 4.6), overheal 42%; Canned Laughter worn in 6 fights (2.83 fires, 12.3
HP each): inside T8 (≥ 0.6, 2-8, regular ≤ 10). 0 errors, 0 DD.warn, 0 stalls. Nothing changed.
