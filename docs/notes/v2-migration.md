# v2 migration guide — initiative, no telegraphs, no Guard (for the content pass)

Written by ENGINE V2 for the content agents (heroes, enemies, bosses, items, kit, passives, narrative). The engine
contract is ARCHITECTURE §4.1, §4.3–4.5, §5.3–5.7 and §6; design intent DESIGN §1, §3, §4.1–4.4 (v2 note), §6
"Simplicity", §8, §9. This file says **what changed, how to convert your content, how to test it, and what bites**.

-----------------------------------------------------------------------------------------------------------------------

## 0. TL;DR

- **Initiative.** After deployment, `DD.Combat.rollInitiative()` ("Roll for initiative!"): every hero and enemy rolls
  `d20 + init` (state.rng). The order is fixed for the fight. **Every unit takes one turn in that order**; hero summons
  act on their owner's turn. A round = everybody's turn once.
- **No telegraphs.** An enemy decides and acts **on its own turn, at once** (move + skill). Nothing is planned ahead,
  so there is nothing to redirect, cancel or dodge "after seeing it". Only **boss wind-ups** stay visible.
- **Wind-ups** (`DD.AI.windUp`): a boss's big attack is announced (marked tiles, ⏳) and **lands at the start of its next
  turn**, unless the boss is stunned / asleep / frozen / sheep or dead by then. That is the counterplay.
- **No Guard, no combat-start Block.** Unused AP is just lost. Nobody starts a fight with Block (items' `stats.block`
  does nothing; Block from `onCombatStart` is wiped when initiative is rolled). Block from a skill lasts until the start
  of its owner's next turn.
- **Durations count the owner's own turns.** `turns: 1` on an enemy from a hero's turn = it covers that enemy's next
  turn. A buff you put on yourself during your turn lasts through your next turn.
- **XP is gone** (RUN role: one hero levels up per won fight). The engine still tallies `state.stats.xp`; nobody reads it.

-----------------------------------------------------------------------------------------------------------------------

## 1. Removed → replaced (engine)

| removed (pre-v2) | v2 replacement |
|---|---|
| enemy planning phase (`DD.AI.planAll`, `plan`, `executeAll`, `state.planning`, `unit.turnPending`) | `DD.AI.act(unit)` on the unit's own turn: it decides **and** acts |
| telegraphed intents on normal enemies (`unit.intents` between turns) | none. `unit.intents` holds only **wind-ups** (`windup: true`) |
| intent anchors / delays for normal enemies | `api.act(u, skill, target)` (now). `delay` only for boss wind-ups |
| taunt re-aiming intents (`DD.AI.retarget`, `DD.Act.retarget`, addStatus taunt → retarget) | taunt = on its turn it must attack the taunter if it can (no other attacks) |
| charm re-aiming intents (`DD.AI.recharm`, `addStatus(..., { noRecharm })`) | charm = on its turn it fights for the other side (hostility flipped) |
| `DD.AI.turnOn(enemy, victim)` (Heckle-style redirect) | no intents to turn: charm it, taunt it onto a target, or push it into its friends |
| silence cancelling spell intents (`DD.AI.cancelSpellIntents`) | silenced = no spells on its turn (a spell wind-up fizzles when it would land) |
| stun cancelling intents | stun-like = it **skips its next turn**; it also interrupts a pending wind-up at once |
| Guard (unused AP → 2 Block), `modifyGuard(g)` hook | nothing. Unused AP is lost. A `modifyGuard` hook is now an *unknown hook* (content suite fails) |
| combat-start Block (items `stats.block`, `onCombatStart` Block) | 0 Block when initiative is rolled. Give Block from skills / turn-start hooks instead |
| `enemyDecay: 'afterPlan'` status flag | gone; every status ticks on its owner's own turn |
| `skipFresh: true` only on stun/sleep/frozen | **every** status skips the tick at the end of the turn it was applied in, if applied during its owner's own turn (opt out: `skipFresh: false`) |
| `state.nextOrder`, `unit.order` = enemy execution order | `state.order` (initiative), `unit.order` = 1-based initiative position |
| `turn:player` / `turn:enemy` = side phases | still emitted (`turn:player` at each hero turn that waits for input, `turn:enemy` once per run of AI turns) + new `turn:start`, `turn:end`, `round:end`, `initiative:rolled`, `initiative:joined`, `windup:start`, `windup:cancel` |

Kept on purpose (they still work): `DD.AI.makeIntent` (stores a **silent** pending action = a wind-up resolving at the
owner's next turn start), `DD.AI.cancelIntents(u, reason)` (interrupts wind-ups), `DD.AI.redirectIntent(u, intent, t)`
(re-aims a wind-up), `DD.AI.intentTiles / intentTarget / intentDmg / describe` (wind-ups), `telegraphFlat` (now the
wind-up / reach numbers), `threatAt` (auras), `api.addIntent` / `api.setIntent` (compat: no delay = **now**, delay = a
wind-up), `DD.Act.isOwnTurn(u)`.

-----------------------------------------------------------------------------------------------------------------------

## 2. The turn model in a nutshell

```
deployment (phase 'deploy', round 0: free swaps) → rollInitiative() → round 1:
  for each entry in state.order (dead: dropped; a downed hero with no summon acting for it: skipped):
    TURN START (the unit + the summons acting on its turn): Block → 0, AP → 3 ± haste/slow/charm (+ banked AP),
                onTurnStart, 'turnStart' decay, cooldown ticks, due wind-ups land
    hero turn  → the player acts with the hero and its summons, then End Turn
    AI turn    → DD.AI.act(unit): stunned → turn lost; sheep → wanders; else the planner acts at once
    TURN END:   AP → 0 (lost), onTurnEnd (Burn, Bleed −1...), 'turnEnd' decay, surface/terrain onTurnEnd
  round end: surfaces tick, objects onRoundEnd, rules tick, encounter.onRoundEnd, survive check; next round
```
- `DD.Combat.endTurn()` ends the current hero's turn and resolves **every following AI turn** (FX queued) until the
  next hero turn (or the end). `DD.Combat.isPlayerTurn()` = a hero-controlled turn is waiting (or deployment is open).
- Who acts: `DD.Combat.current()`, `turnGroup()`, `isTurnOf(u)`, `controllable(u)`. Only the current unit's group can
  move / use skills / consumables / interact (`canUse` → `"Not X's turn."`).
- Units arriving mid-fight (spawns, reinforcement waves, enemy summons via `Act.spawn`) roll on arrival and act from
  the next round start (arrivals *at* a round start act that round). Hero summons (`Act.summon` with a hero owner)
  act on their owner's turn, never get an entry. A summon whose owner died gets its own entry next round.
- Downed heroes keep their slot. Revived (Help Up) → 0 AP now, full AP on their next own slot.
- Initiative modifiers: heroes `stats.init` (DESIGN: −2..+4, default 0; items / scars / Blessings can add `stats.init`);
  enemies `def.init` (default by tier: minion +1, normal 0, elite +1, boss +2); `def.turnsPerRound: 2` gives a boss two
  entries a round. Ties: higher init, then heroes, then a coin flip. Hook: `modifyInitiative(r)` (r = { unit, roll,
  init, total, k }) on the unit's sources, rolled fights only.

-----------------------------------------------------------------------------------------------------------------------

## 3. Durations — exact rules

`turns` decrement at the end of each of the **owner's own** turns (`decay: 'turnEnd'`, the default) or at the start
(`'turnStart'`). A status applied during the owner's own turn (after its start-of-turn ticks) is `fresh`: the end of
*that* turn does not count. Hero summons share their owner's turn.

| you write | applied when | effect |
|---|---|---|
| `addStatus(enemy, 'root', { turns: 1 })` | on a hero's turn | the enemy is rooted through its next turn, gone at that turn's end |
| `addStatus(enemy, 'stun', { turns: 1 })` | on a hero's turn | it skips its next turn (consumed), stun gone at that turn's end |
| `addStatus(hero, 'stun', { turns: 1 })` | by an enemy on its turn | the hero's next turn passes automatically (0 AP); stun gone after |
| `addStatus(self, 'inspired', { turns: 1 })` | on your own turn | rest of this turn + your whole next turn |
| `addStatus(ally, 'inspired', { turns: 1 })` | on your turn (not the ally's) | until the end of the ally's next turn |
| `addStatus(u, 'x', { turns: 2 })` | anyone, any time | covers u's next 2 turns (plus the rest of the current one if it is u's) |
| status def `decay: 'turnStart', defaultTurns: 1` | anyone | until the start of u's next turn (like Block) |
| status def `skipFresh: false` | on u's own turn | ends at the end of *this* turn ("this turn only") |
| stun applied in u's `onTurnStart` hook | u's turn start | u loses *this* turn only (start-phase statuses are not fresh) |
| stun applied to u during u's own turn (a trap, thorns) | mid-turn | u loses its *next* turn |

Rules of thumb for the content pass: debuffs on enemies → `turns: 1` = "its next turn"; buffs on heroes → `turns: 1` =
"your next turn". Burn / Poison / Bleed / Marked / Empowered use stacks (`decay: 'never'`) and are unchanged.
Round-based things (surfaces' `turns`, rules' `turns`, reinforcements, "survive N rounds", `onRoundStart/End`) count
**rounds**.

-----------------------------------------------------------------------------------------------------------------------

## 4. AP

- Every hero (and its summons) gets its AP at the start of **its own** turn; unused AP is lost at the end of it.
- `DD.Act.gainAp(unit, n)`: on the unit's own turn → spendable now; otherwise **banked** (`unit.apBank`, may be
  negative) and added at the start of its next turn, shown as "+1 AP next turn". So "an ally gains +1 AP" from your
  turn = +1 AP on the ally's next turn. "+1 AP now, −1 next turn" on yourself works as written.
- Never set `unit.ap` directly for someone else's turn: it is overwritten at their turn start. Use `gainAp`.
- `onRoundStart` AP grants (`gainAp`) are banked for each hero's turn of that round — that works. `onTurnStart` grants
  are spendable at once.
- AI units ignore AP.

-----------------------------------------------------------------------------------------------------------------------

## 5. Block

Nobody starts a fight with Block. Block from a skill / hook lasts until the start of its **owner's** next turn, so Block
gained on your turn protects you through every enemy turn of the round. `onTurnStart: addBlock(u, n)` = "n Block at the
start of each of your turns" (works, lasts until your next turn start; keep such passives rare and conditional, see
§8.7). Items with `stats.block` → convert (§8.7). The content registry suite reports each remaining one as an advisory
("stats.block … is ignored in v2"). The test fixture knight's Overly Prepared is now "3 Block at the start of his turn
in round 1" (it was 3 Block at combat start), so fixture arithmetic like "+3 Overly Prepared" in round 1 still holds —
a fixture convenience only, not a pattern for real content.

-----------------------------------------------------------------------------------------------------------------------

## 6. AI turns (what enemies do now)

- `DD.AI.act(unit)` is the whole turn: the default planner picks the best (move, skill, target) and does it; a custom
  planner `def.ai(unit, api)` is called **on the unit's turn** and acts through the api.
- Planner api (v2): `api.act(u, skillId, target, opts) → bool` (use now), `api.windUp(u, skillId, target, opts)`
  (bosses), `api.moveTo(u, x, y)` (walk now), `api.addIntent / setIntent` (compat: **no delay → happens now**;
  `delay` / `turns` / `windup: true` → a wind-up), `api.defaultPlan(u, style)` (= the default turn: acts now),
  `api.entry` (its initiative entry: `entry.k` = which of its entries), `api.round`, `api.unit`, the rest as before.
- Status semantics on its turn: **stun / sleep / frozen** → it loses the turn; **sheep** → wanders, no skills;
  **taunt** → the default planner only considers the taunter (walks toward it if out of reach); any *attack* a custom
  planner makes must reach the taunter (re-aimed if the skill can, else "Taunted, can't reach!" and nothing happens);
  **charmed** → its hostility is flipped for the turn (it attacks its own side); **silenced** → no `kind: 'spell'`
  skills; **dazzled** → each attack lands 1 tile off; **confused** → each attack turns a quarter turn; **rooted / held**
  → no moves; **stealthed** heroes are ignored.
- Cooldowns start when the action happens (a wind-up: when it is wound up) and tick at the start of its own turns.
- Order of operations matters now: in the old system a planner could add an intent and *then* move; now `api.act`
  resolves immediately from where the unit stands — **move first, then act**.
- HUD threat shading and AutoPlay estimate where an enemy can strike before your next turn with `DD.AI.reachOf(enemy)`
  (move + skill reach, ready skills only) and `DD.AI.threatMap('hero')`. Keep `L.dmg` on damaging skills honest — it is
  the number those read.

-----------------------------------------------------------------------------------------------------------------------

## 7. Boss wind-ups

```js
api.windUp(unit, 'grim_audit', anchorTile, { tiles: laneTiles, label: 'Audit (row)', turns: 1, banner: true });
```
- Resolves at the **start of the boss's next turn** (`turns: 2` → after two of its turns). Before its normal action that
  turn, so a boss can land a wind-up and then act (and wind up the next one).
- **The heroes always get a window** (v2 review): a wind-up only counts down at a boss turn start that comes after a hero
  turn started since it was announced (or last counted down). For a one-entry boss winding up on its own turn nothing
  changes (every hero acts before its next turn). It matters for `turnsPerRound: 2` (the two entries are rolled
  separately and can be back to back, or k1 last and k0 first next round: the wind-up then lands at the first boss
  turn after the heroes had theirs), and for wind-ups made in `onTurnStart` / `onRoundStart` hooks or at combat start
  without deployment (they used to land at once when the boss acted first). Wind-ups announced while the player is in
  control — a hero's turn (a hero's skill makes the boss wind up, tests calling `DD.AI.windUp` on the hero's turn) or
  deployment (the marked tiles can be deployed out of) — still land at the boss's very next turn start.
- Anchor: default `'ground'` (fixed tiles: the area as drawn now, or `opts.tiles`); `track: true` → follows the target
  unit (fizzles out of range / sight or if stealthed); `anchor: 'self'` → relative to the boss (push it and the attack
  moves).
- Interrupted at once by stun / sleep / frozen (any `stunLike`) / sheep, and by the boss's death
  (`windup:cancel`). `data: { unstoppable: true }` = nothing interrupts it (use sparingly; the DM's diverted train).
- At resolution: taunt does **not** re-aim it (it is committed); dazzle shifts it 1 tile; confuse rotates it; silence
  fizzles a spell; charm flips who counts as a foe (`ctx.foes`).
- Its number: `DD.AI.intentDmg` (`L.dmg` × attacker multipliers + `telegraphFlat`s) — keep it honest (the content
  suites check that a wind-up only hits units standing on its marked tiles at resolution).
- `DD.AI.windups()` lists them for the HUD/renderer (tiles, turnsLeft, label, dmg).
- Puzzles: hang them off wind-ups ("pull the lever before the audit lands"), stun windows, and arena objects. Object
  `autoplay` hints (§5.7) still drive AutoPlay.
- Two turns a round: `turnsPerRound: 2` on the def (two entries; `api.entry.k` tells which turn this is).

-----------------------------------------------------------------------------------------------------------------------

## 8. Converting content, by kind

### 8.1 Hero skills that manipulated enemy intents
Affected today (grep `intents|cancelIntents|redirectIntent|noRecharm|telegraph` in your file):
- **Syllamin** Heckle (`syl_heckle`: re-aims foes' telegraphs with `redirectIntent` + `charmed` with `noRecharm`; his
  role line and Roasted's `telegraphFlat` wording).
- **Corelos** Cease & Desist (`cor_cease`: "cancel a foe's telegraphed attacks" via his own intents filter) and Read the
  Fine Print (`cor_fine_print`: cancels every foe's telegraphs, `cancelIntents(f, 'VOID!')`).
- **Slate** Grapple (`DD.AI.cancelIntents(v, 'Grappled!')` in the hold code and the `Grappled` status).
- **Buga** Bribe (`buga_bribe`: "turns its telegraphed attack on its own friends (or calls it off)").
- **Marwyn** Hero Landing (`mrw_hero_landing`: taunts foes whose telegraph would hit an ally, read from
  `intentTiles`) and Use Your Head (`mrw_headbutt`: the desc says "its telegraphed attacks are cancelled").
- `skills_generic.js`: the `telegraphed()` helper used by Tactical Retreat (`gen_tactical_retreat`, "out of telegraphed
  attacks") and exported as `Kit.telegraphed`; Sand in Your Eye's (`gen_pocket_sand`) aiScore counts foes' intents; the
  "No Guard Block" joke in a heal desc.
- `passives.js`: `dangerTiles()` (enemy intent tiles) used by Sleepwalker (`rp_sleepwalker`) and Displacer Beast
  Ancestry (`rp_displacer_ancestry`).
Normal enemies have no intents now, so these find nothing and do nothing (they don't crash; only boss wind-ups are
left in `unit.intents`). Convert them to effects on the enemy's **next turn**, one verb each (DESIGN §6 Simplicity):
- "redirect its attack onto another enemy" → **Charm** it (`turns: 1`): on its turn it attacks its own side; or
  **Taunt** it onto a target; or **push/pull** it next to its friends before a cleave.
- "cancel its attack" → **Stun** / **Sleep** (it skips the turn) or **Root** (melee can't reach) or **Silence** (casters).
- "cancel every enemy intent this round" (a signature) → e.g. "Silence and Weaken every enemy; interrupt every wind-up"
  (`DD.AI.cancelIntents(boss, 'Fine Print!')` still interrupts wind-ups).
- Grapple "cancels its attacks" → a held status with `noMove: true` (+ e.g. Weak, or `stunLike` for one turn at III).
- Tooling that asked "is X about to be hit?" → `DD.AI.threatMap('hero').get(x + ',' + y)` / `DD.AI.reachOf(enemy)` and
  `DD.AI.windups()`.
- Hero `aiScore` bonuses for "stun something that has an intent" → stun anything that can act (`!DD.Combat.isStunned(f)`).

### 8.2 Hero skills that give allies AP or act "now"
`gainAp` outside the ally's turn is banked (§4) — the desc should say "on its next turn". "Delegate: an ally makes its
basic attack now" still works (resolve the ally's skill now; it does not need the ally's AP). Skills that "reset an
ally's cooldowns so it can use them again" only matter on the ally's next turn. Skills that move an ally ("Fae Blink",
"Toss a Friend") work at any time.

### 8.3 Custom statuses
- Durations: re-read §3; most `turns: 2` that existed to survive the old side-phase tick should become `turns: 1`.
- Remove `enemyDecay` and any "applied during planning" branches (`state.planning` is always false now).
- `stunLike: true` = loses its next turn + interrupts wind-ups. `noMove` = can't move (pushes still work).
- Statuses with flat damage changes keep `telegraphFlat(st, unit)` (now read by wind-ups and reach estimates).
- `skipFresh: false` if a status must end with the turn it was applied in.

### 8.4 Enemy skills
`anchor` only matters for wind-ups; for actions it is irrelevant. "Telegraph" wording in `desc` ("telegraphed", "after a
delay", "next round") → plain mechanics. A skill that relied on "the hero dodges if they read it" now just hits: retune
(DESIGN §5 v2 note). Keep `L.dmg` the real number (reach estimates, AutoPlay, honesty checks).

### 8.5 Enemy planners
- `api.addIntent(u, s, t, {})` already means "do it now" (compat). Prefer `api.act` in new code (returns whether it fired).
- **Move before acting.** Planners that added an intent and then moved (expecting the attack to follow) now attack from
  the old tile. Reorder.
- Planners that queued several actions per turn (a stab + a buff + a summon) do them all at once, in order — usually
  fine; check the total damage per turn against DESIGN §5.
- `delay: 1` intents on **normal enemies/elites** are wind-ups now (compat): act 1 `a1_mimic_slam`, `a1_bugbear_stool`,
  `a1_cube_slam`; act 2 the banshee's `a2_banshee_scream` (`commit` / `aim` with `delay: 1`), `a2_mama_stomp`; act 3
  `a3_eye_overtime`, `a3_dragon_breath`, `a3_dk_monologue`, `a3_fiend_audit`. DESIGN says normal enemies don't
  telegraph: make them immediate, or keep a wind-up only where the counterplay is the point (an elite's one big move),
  and say so in the codex desc. Bosses with `delay` intents today: beholder (`iris_eye_exam`, `iris_disintegrate`
  delay 2), dm (`dm_rocks_fall`, `dm_railroad`, `dm_tpk`, the diverted train via `makeIntent`), grimble (`grim_audit`),
  lich (`lich_bookfall`, `lich_shhh` / `lich_quiet`, `lich_final_notice`), ratking (`rat_surge`) — all keep working as
  announced wind-ups through the compat path (`turns` = `delay`; the anchor defaults to the skill def's `anchor`, else
  `'self'`, so pass `anchor` explicitly). `api.windUp` is the explicit form (default anchor `'ground'`).
- "Is it charging?" checks: `unit.intents.some(i => i.skillId === X)` still works (wind-ups live there).
- `api.round` parity patterns still work; a boss with `turnsPerRound: 2` gets two calls a round (`api.entry.k`).
- A planner that reads heroes' positions to place ground attacks "where they will be" should now aim where they **are**.

### 8.6 Boss telegraphed / delayed attacks
Convert each signature big attack to `api.windUp(...)` (§7) with explicit `tiles`, a clear `label`, and optionally
`banner: true`. Everything else the boss does happens on its turn. The puzzle hints and arena objects keep working;
re-check stun guards (`flags.stunImmune`, stun guard statuses) because stun is now THE way to interrupt a wind-up —
DESIGN §9 wants it to be a real counterplay. The DM's diverted train (`pinDiverted` / `runDiverted` with
`data.unstoppable`) runs at his turn start as a silent `makeIntent` — fine; simplify if you rewrite it.

### 8.7 Items, Blessings, scars
- `stats.block` → ignored. Convert to something that works mid-fight: `+armor`, HP, "+N Block when you use a skill",
  or a conditional per-turn Block ("at the start of your turn, +N Block if you didn't move last turn"). DESIGN §4.1:
  Block comes from skills and a *few* mid-fight item / passive effects.
- Guard bonuses (`modifyGuard`) → gone; none exist today.
- `onCombatStart` Block → wiped at initiative. **Don't re-create a starting shield** (no "first turn: +N Block" flags):
  the user asked for the start-of-combat shield to go. Give the item / passive a different job.
- "+X AP on round N" via `onRoundStart` + `gainAp` → banked for that hero's turn: works.
- New stat: `stats.init` (items / Blessings / scars) adds to the hero's initiative modifier; hook `modifyInitiative(r)`.
- Hype items unchanged.

### 8.8 Heroes' stats
Add `stats.init` (−2..+4) to every hero (quick ones high, golems low). The registry suite advises outside that range.

### 8.9 Content that reads turn state
`state.phase` is `'deploy' | 'player' | 'enemy' | 'over'`; `'player'` = a hero-controlled turn waiting for input (it is
still 'player' while that hero acts). Use `DD.Combat.current()` / `DD.Combat.isTurnOf(u)` / `DD.Act.isOwnTurn(u)`
instead of phase checks. `state.planning` and `unit.turnPending` no longer exist (always falsy).

-----------------------------------------------------------------------------------------------------------------------

## 9. Test recipes (copy-paste)

Sandbox defaults (v2): initiative `'heroesFirst'` (heroes in the listed order, then enemies; no dice), so after
`DD.Combat.sandbox(...)` it is **the first hero's turn, round 1**. Options: `initiative: 'roll' | 'enemiesFirst'`,
`order: ['zarathor', 'a1_gob_grunt', ...]` (unit ids or def ids first), `noPlan: true` (AI units pass their round-1
turns), `enemyAi: false` (AI units always pass — great for hero tests), `deploy: true` + `deployTiles`.
Helpers: `DD.Combat.endTurn()` (next unit's turn; AI turns resolve inside), `DD.Combat.endRound()` (pass every hero turn
until the next round's first hero turn), `DD.Combat.giveTurnTo(unit)` (sandbox only: it's that unit's turn now; an AI
unit acts at once), `DD.Combat.setOrder([...])`, `DD.Combat.current()`, `DD.Combat.order()`, `DD.AI.act(enemy)` (an AI
turn body right now), `DD.AI.windUp(...)`, `DD.AI.windups()`.

```js
// 1. a hero skill on its own turn (enemies frozen in place)
DD.Combat.sandbox({ w: 9, h: 9, seed: 1, enemyAi: false, heroes: [{ id: 'zarathor', x: 1, y: 4, level: 3 }],
  enemies: [{ id: 'a1_gob_grunt', x: 4, y: 4 }] });
const z = DD.Combat.heroes()[0], g = DD.Combat.enemies()[0];
t.ok(DD.Combat.current() === z && z.ap === 3, 'his turn');
t.ok(DD.Combat.useSkill(z, z.basic, g.x, g.y), 'cast');   // or z.skills[i] / z.signature

// 2. a debuff from a hero's turn covers the enemy's NEXT turn
DD.Act.addStatus(g, 'root', { turns: 1 }, z);
DD.Combat.endTurn();                 // the grunt's turn runs (rooted), then round 2 = Zarathor's turn again
t.ok(!DD.Act.hasStatus(g, 'root'), 'expired at the end of its turn');

// 3. an enemy acting: let the AI play one turn now, or run the rest of the round
DD.AI.act(g);                         // its turn body, immediately
DD.Combat.endRound();                 // or: every remaining turn until the next round's first hero turn

// 4. a two-hero test: whose turn?
DD.Combat.sandbox({ heroes: [{ id: 'ellaria', x: 1, y: 1 }, { id: 'marwyn', x: 1, y: 3 }], enemies: [...] });
DD.Combat.endTurn();                  // now Marwyn's turn (same round)
DD.Combat.giveTurnTo(DD.Combat.heroes()[0]);   // or jump straight to a unit (sandbox only)

// 5. a wind-up lands at the boss's next turn start, a stun interrupts it
const w = DD.AI.windUp(boss, 'grim_audit', tile, { tiles: lane });
DD.Act.addStatus(boss, 'stun', { turns: 1 }, hero);  // → boss.intents is empty again, 'windup:cancel'
                                                     //   (a stun-immune boss refuses the stun: test its own guard)
// or let it land: DD.Combat.endTurn() (heroesFirst: the boss's turn comes after the heroes)

// 6. Block lasts until the owner's next turn start
let during = -1;
const off = DD.Events.on('turn:start', function (e) { if (e.unit.side === 'enemy') during = hero.block; });
DD.Combat.endTurn(); off();

// 7. AP given outside the ally's turn is banked (two heroes, heroesFirst: the ally's turn is next)
DD.Act.gainAp(ally, 1); t.eq(ally.apBank, 1); DD.Combat.endTurn(); t.eq(ally.ap, DD.Combat.turnAp(ally) + 1);

// 8. a real rolled fight with fixed dice: Combat.start(setup, { seed: 7, initiative: 'roll' }) → state.order
//    (Encounter.build setups open deployment: call DD.Combat.rollInitiative() or DD.AutoPlay.runBattle())

// 9. honest areas: T.contentHelpers.watchAreas(function (w) { ...start a fight...; w.arm(); ... }) → w.violations
```
Enemy test files that looped `endTurn()` "for N rounds": use `endRound()` N times (with one hero, `endTurn()` is a
round). Tests that placed telegraphs with `DD.AI.makeIntent` and then `endTurn()`: that is now a pending wind-up that
lands at the enemy's next turn start (fine for boss tests; for normal enemies test the immediate action instead).

-----------------------------------------------------------------------------------------------------------------------

## 10. Pitfalls

- **"Nothing happened"**: you called `useSkill` for a hero whose turn it isn't (`canUse` says `Not X's turn.`), or in
  deployment (`Roll for initiative first!` — sandboxes start at the first hero's turn unless `deploy: true`).
- **`turns: 2` that was a workaround** for the old end-of-player-phase tick now lasts a turn longer. Re-check numbers.
- **Self-buffs**: applied on your own turn, `turns: 1` lasts through your next turn. If you mean "this turn only", use
  a status with `skipFresh: false`, or remove it in `onTurnEnd`.
- **Stuns are stronger**: a stunned enemy loses its whole next action (it doesn't just lose a visible intent). Stun
  durations of 2 = two lost turns. Bosses: keep a stun guard but allow interrupting wind-ups.
- **AI that hits harder**: enemies now act with full information on their turn (they pick the best target at that
  moment). DESIGN §5 numbers are being retuned; don't stack many immediate attacks on one enemy.
- **Protect objectives**: enemies reach the protected object immediately now (no telegraph to react to): give the
  heroes a way to body-block or taunt (the act 2 "Last Coffee" and act 3 "Snack Heist" fights lose fast in sims).
- **Hero summons** act on their owner's turn; an enemy-side summon (`Act.summon` with an enemy owner) acts on its
  owner's turn too. `Act.spawn` units (kind 'enemy') get their own initiative. `summon(..., { ready: true })` gives AP at
  once only during the owner's turn (a combat-start corgi has 0 AP until Ellaria's first turn; v2 review).
- **`state.phase`** stays `'player'` during a hero turn even inside your hooks; the enemy phase is no longer "the enemy
  side's turn" — use `isTurnOf`.
- **Previews** never roll initiative for a unit they create (`Combat.noteArrival` is skipped while simulating), so a
  spawn / summon skill's preview stays exact (no "?" from the initiative die).
- **AutoPlay** (used by balance sims and many tests) reads reach + wind-ups; if your enemy's damage lives outside `L.dmg`
  (hooks, procs), declare `telegraphFlat` or `aiScore`, or AutoPlay will misjudge it.
- `DD.AI.planAll()` / `DD.AI.plan()` / `DD.AI.turnOn()` / `DD.AI.recharm()` / `DD.Act.retarget()` are gone: calling them
  throws (a swallowed "Error in …" fails the suite).

-----------------------------------------------------------------------------------------------------------------------

## 11. Old → new cheat sheet

| old | new |
|---|---|
| `DD.AI.planAll(); DD.Combat.endTurn();` | `DD.Combat.endTurn()` (AI acts on its turn) / `DD.Combat.endRound()` |
| `DD.AI.plan(e)` then check `e.intents` | `DD.AI.act(e)` then check the board (HP, positions, `onSkillUsed`) |
| `api.addIntent(u, s, t, { delay: 1 })` (boss) | `api.windUp(u, s, t, { turns: 1, tiles, label })` |
| `api.addIntent(u, s, t, {})` | `api.act(u, s, t, {})` (the old call still works: it happens now) |
| `DD.AI.makeIntent(e, s, hero)` to place a telegraph | `DD.AI.windUp(e, s, hero, {})` (announced) / `makeIntent` (silent) |
| `addStatus(e, 'charmed', { noRecharm: true })` + re-aim | `addStatus(e, 'charmed', { turns: 1 })` |
| `DD.AI.retarget(e, t)` / `DD.AI.turnOn(e, v)` | Taunt (`addStatus(e, 'taunt', { turns: 1 }, t)`) / Charm |
| `modifyGuard(g)` | — (gone) |
| item `stats.block: 3` | a mid-fight effect instead: armor / HP, or conditional Block in a hook (§8.7) |
| `state.planning`, `unit.turnPending` | `DD.Combat.isTurnOf(u)`, `DD.Act.isOwnTurn(u)` |
| `turn:player` = the player phase | `turn:start` / `turn:end` per unit (`turn:player` = a hero turn waiting) |
| enemy `order` = execution order | `state.order` (initiative) / `DD.Combat.order()` |

-----------------------------------------------------------------------------------------------------------------------

## 12. Your suites right after the engine change (full `tools/test.sh`, 588 suites)

168 failing sections; every engine / content / autoplay / mapgen suite passes; no swallowed or uncaught errors. 12 of
the 168 were already failing before the change (marked *before*). Codes (first cause seen; more can hide behind an
**A**, which stops the suite):

- **A** calls a removed API (`DD.AI.planAll` / `DD.AI.plan`) → TypeError (46 suites).
- **T** one `endTurn()` used as "the player phase" / "a round" in a multi-hero sandbox → `endRound()`.
- **O** a hero acts while it is not its turn (`useSkill` refused: "Not X's turn.") → `endTurn()` to it / `giveTurnTo`.
- **I** asserts telegraphs / planned intents / re-aims / cancels of normal enemies, or drives attacks with
  `makeIntent` + `endTurn` (now a wind-up landing at the enemy's next turn start).
- **P** reads a hero's AP outside its turn (0) or expects an ally's AP now (banked: `apBank`).
- **G** Guard Block or a starting shield (items' `stats.block`, `onCombatStart` Block).
- **D** v1 durations ("only this turn", "wore off after planning") → own-turn counting (§3).
- **E** enemies now act inside `endTurn()` (numbers off; clearing `e.intents` no longer stops them → `enemyAi: false`).
- **R** `Encounter.build` fights open in deployment (round 0); round-1 hooks run at `rollInitiative()`.
- **H** a hook fired by hand outside the unit's turn (`gainAp` banks).
- **B** AutoPlay balance band / puzzle engagement under the new turn model (retune).
- **U** / **X** not the engine: heroes now have `unlock: null` (DESIGN v2) / the RUN role removed XP (`hero.xp` → NaN).

| area | failing suites → code |
|---|---|
| hero_zarathor (5) | Bedazzle O · Hellish Rebuke E/I+G · Statue of Me I · edge cases T · review E/I |
| hero_syllamin (10) | Heckler T/D · Heckle ×3 I (redirects are gone, §8.1) · Power Ballad D · Hype Man P · Lullaby T · Encore! O · previews A · AutoPlay heckles I |
| hero_marbles (6) | Marble Scatter I · Rabbit Punch T/D · Back In My Day I · Carrot Toss… O · Absent-Minded Mastery T/P · review D |
| hero_marwyn (7) | Ginger Snap… I · Hero Landing I · Ginger Rage… D/T · BEHOLD I · edge cases T · AutoPlay battles ×2 B (she never acted in a 2–4-round fight; acts 1-2 *before*) |
| hero_corelos (11) | registry U *before* · Rune Bolt I/E · runes vs enemy paths I · Dark Bargain O · Cease & Desist I · Sign Here A · Soul Contract I · Power of Attorney P/O · Infernal Lawyer A · Read the Fine Print A · previews A |
| hero_josiah (4) | registration U *before* · Plague Miasma A · Prescribe Leeches… T · Volatile Brew… P+D |
| hero_ellaria (6) | Pack Leader D/I · Entangling Roots I/D · Barkskin I/E · Switcheroo / Wild Shape D/T · corgi Bite I · hero items I/E |
| hero_sparrow (3) | registry U *before* · Scab Armor… D/T · Evil Twin I |
| hero_slate (6) | definition U *before* · Short Fuse G (Cardigan's starting Block) · a hold keeps roots D/T · Hold Still I · Get Off My Lawn I · Rooted in Tradition D |
| hero_buga (13) | registration U *before* · Skimming Off the Top O · Campaign Pamphlet P · Delegate P · Loitering Fine A · Campaign Promise P · Bribe A · Butter Up O · Pork Barrel I/E · Crumb Trail T · items P · review D/T · review II A |
| enemies_act1 (6) | elite skills I (delays are wind-ups) · AI plans readable intents I · HUD previews vs reality O/I · odd states A · review fixes I · autoplay sims B *before* |
| enemies_act2 (9) | brunch cult, wisps, banshee, gargoyles, Mama Owlbear, Flesh Golem Gary, tesla coils, every enemy plans: A · Necromancer TA T/D+A |
| enemies_act3 (12) | minions and normals I (overtime charge) · Natural 1 Golem, imp, AI plans, Eyeball Intern, Red Dragon, Death Knight, odd conditions: A · Pit Fiend T/H · Unshakeable D/T · hero previews vs reality O · AutoPlay sims B *before* |
| bosses_act1 (16) | 11 Grimble / Rat King suites A · swelling ranks T+A · stun guard I/T · the flush I/T · telegraphs tell the truth I/T+A · refunds T |
| bosses_act2 (14) | lich late fees, lich patterns, lich bone pile, iris patterns, iris gaze, iris previews: A · lich puzzle I/T · lich minion caps I/T · lich previews & honesty I *before* · lich sims B *before* · iris mirrors I · iris eye exam I/T · iris mirror hints I+A · iris sims B *before* |
| boss_dm (15) | registry R · DM Screen I/R · house rules H · telegraphs show the house rule I · pattern rotation R · Get Off My Table I · phase transitions R · track switches I · diverted train I · Handbooks I · doom T · random encounters R · robustness T/R · AutoPlay sims ×2 B (the Track Switch hint never fires) |
| items (5) | armor stats G+I · Turtle Shell G (Guard) · cursed armor T (Kevin waits for a round end) · cursed trinkets T (Ring heals at round start) · real heroes P |
| kit (4) | Rally / Come At Me D+I · consumables (Energy Drink) P · Holy Water T · Smoke Bomb T+I |
| passive-table (3) | common: Pet Rock T · uncommon: Loaded Dice G (`onCombatStart` Block) · cursed: Blood Pact E, Loud Eater I, Narcoleptic D/T, Spontaneous Combustion T |
| narrative (4) | generic events ×2, hero events: X · tips G (the Guard tip) + X |
| integration (2) | cross-content U *before* · protect objective X ("no XP" in the Objective Failed step) |
| hud (7) | HUD role, see `docs/notes/rules.md` v2 Requests |
