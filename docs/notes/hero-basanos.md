# HERO — Basanos, the Mostly Housebroken (notes)

Files: `js/data/heroes/basanos.js`, `tests/content/hero_basanos.js` (23 suites `hero_basanos: …`), this file.
Run: `bash tools/test.sh "suite=hero_basanos&isolate=heroes/basanos,hero_basanos"` and
`bash tools/test.sh "suite=content:&isolate=heroes/basanos,hero_basanos"` (the Party Balloons check in the "form follows
bas_wolf" suite needs `js/data/items.js`: run that suite without `isolate` once).
Looks: `bash tools/shot.sh "debug=1&fixtures=1&isolate=heroes/basanos,hero_basanos&screen=gallery&gallery=basanos" .tmp/basanos/g.png 1280x720 4000`.
Scratch (not shipped) in `.tmp/basanos/`: `sprites.html` (human / werewolf / dire specs big, every pose, portraits),
`variants2.html` + `.js` (look variants; `set=wolf`), `scene.html` + `scene.js` (scripted fights in the real renderer +
HUD: `scene=human|wolf|moon|pounce|trigger`; needs `debug=1&fixtures=1&screen=combat&party=…&encounter=test_a1_normal`),
`descs.html` (every desc / item / bark dumped as text), `shot.sh` / `dump.sh` (take a machine-wide Chrome slot).

## Summary

User brief: *"Basanos, human who can transform into a werewolf"*, *"in [human] form should be a melee fighter"* — he/him.
DESIGN §6 "Basanos" + "Simplicity". An apologetic, scruffy monster hunter who IS the monster once things get bad.
v2-native (initiative, one turn per unit, no telegraphs, no Guard, no combat-start Block, own-turn durations, attacks of
opportunity). Complexity 2, `unlock: null`, 28 HP (+4/level), 3 AP, move 4, **initiative +2**, armor 0, colour `#7b93c4`.

**One transformation.** `Transform` (1 AP, no cooldown, a socketed skill, works in both forms) swaps human ⇄ werewolf;
his first switch each turn, either way, heals him 2 / 3 / 4 (the mend, D9 — see "Sustain (Nov 12)"; 3 / 4 / 5 until the balance refit).
The form is the status `bas_wolf` "Werewolf" (🐺 buff, no duration) — the source of truth — plus bookkeeping in
`unit.data.bas` kept in step by `syncForm` / `settle` (on combat start, round start, his turn start / end, any status
applied to him, any damage or healing he takes, after his skills, after an attack of opportunity he makes or provokes,
when downed); his attack of opportunity reads the status directly (`modifyOpportunity`), so it is always the right basic:
- **Werewolf**: +2 move, basic attack **Claw** (4 / 5 / 5 damage + 1 / 1 / 2 Bleed — the level of his socketed Transform),
  wolf skills ready, human skills locked (`canUse` → "Human form only (Transform first).").
- **Human**: basic attack **Silvered Sword** (5 damage), human skills ready, wolf skills locked ("Werewolf form only
  (Transform first).").
- Every fight starts human. Downed → the status is wiped → a man again (revived as a man). A dispel takes the wolf away
  too (the act 3 Rules Lawyer's "OBJECTION!" overrules his lycanthropy): human again at once.
- Sprite override: `unit.sprite` = the werewolf spec at once (logic); on screen the old look is pinned in
  `unit.vis.sprite` until FX playback reaches the change, then the pin is dropped so `unit.sprite` shows (also when other
  content re-wrapped it meanwhile). Previews never touch either.

**Passive — Hair Trigger** (one rule): *when damage leaves him below half HP, he turns into the werewolf for free.* It
needs real HP lost (a hit fully soaked by Block doesn't count), works on any turn (an enemy's hit, an attack of
opportunity mid-walk: he walks on as a wolf), never on a lethal hit (downed, not a wolf). A lethal hit that something
refuses (the Plot Armor Blessing: "stay up at 1 HP") does set him off: the engine asks `onTakeDamage` before it decides
the down, so the check waits for the next thing that happens to him (a rider of that hit, an attack of opportunity mid-walk,
at the latest his own turn start). He can Transform back while low; the next hit sets him off again.

**Kit** (ids `bas_*`; ⭐ starting; numbers I / II / III):

| Skill | Form | Cost | Effect (one verb + at most one rider) | Pairs with |
|---|---|---|---|---|
| Silvered Sword (basic) | human | 1 AP | 5 damage to an adjacent foe | his attack of opportunity as a man |
| Claw (basic) | wolf | 1 AP | 4 / 5 / 5 damage + 1 / 1 / 2 Bleed (by Transform's level) | his attack of opportunity as a wolf: the Bleed bites when the fleeing foe's walk ends |
| Transform ⭐ | both | 1 AP, cd 0 | switch forms (werewolf: +2 move, Claw); the first Transform each turn heals 2 / 3 / 4 (balance refit; was 3 / 4 / 5) | Hold the Line / Step In after a wolf rush (the Coat's Block) |
| Shoulder Check ⭐ | human | 1 AP, cd 1 | 5 / 6 / 7 damage + push 1 / 1 / 2 | pits (YEET), lava, water (Wet → lightning), allies' traps and runes, bleeding foes |
| Silver Slash | human | 2 AP, cd 1 | 8 / 10 / 12 damage + Vulnerable for 1 / 1 / 2 turns | every ally's big hit |
| Hold the Line | human | 1 AP, cd 2 | Taunt every foe within 2 / 2 / 3 for 1 turn + 4 / 5 / 6 Block | taunted foes can't make attacks of opportunity on his friends; protects squishies |
| Step In | human | 1 AP, cd 2 | swap with an ally within 3 / 4 / 5 + 4 / 5 / 6 Block | pulls a friend out of melee without an attack of opportunity |
| Rend | wolf | 1 AP, cd 1 | 3 / 4 / 5 damage + 3 / 4 / 5 Bleed | allies' pushes, pulls and throws (each forced move bleeds), his Claw reactions |
| Pounce | wolf | 2 AP, cd 3 | leap next to a foe within 3 / 4 / 5, 4 / 6 / 8 damage + Stun | stops a caster's / charger's next turn, interrupts boss wind-ups |
| Howl | wolf | 1 AP, cd 3 | he and allies within 2 / 3 / 3 are Inspired for 1 / 1 / 2 turns | the party's heavy hitters |
| Savage Bite | wolf | 2 AP, cd 1 | 9 / 11 / 13 damage; if that kills it, heal 6 / 8 / 10 | finisher after Bleed / Vulnerable |
| Frenzy | wolf | 2 AP, cd 2 | 4 / 5 / 6 damage + 1 / 1 / 2 Bleed to every adjacent foe | foes bunched up by pulls / taunts |
| Blood Moon (signature) | both | 2 AP, 100 Hype | become the werewolf; 14 damage + 3 Bleed to every foe within 2 | — |

Pool = 10 (Transform + 4 human + 5 wolf) besides the two basics and the signature. Nothing is a `spell` (Silence doesn't
stop him). Every desc names its form ("Human form: …" / "Werewolf form: …") and reads in one breath (13–16 words).
Blood Moon's look: a huge red-eyed dire wolf (`DIRE_SPRITE`, cosmetic) for the rest of that turn, then the werewolf.

**Attacks of opportunity** (v2): both basics are melee, so he holds the line in both forms (sword 5 as a man, Claw +
Bleed as a wolf; the AI's engaged / disengage cost keeps brutes on him). Pounce (a teleport-leap), Step In (a swap) and
Shoulder Check (a push) never provoke; his own move actions do (and an AoO that drops him below half HP lets the wolf out
mid-walk). Hold the Line's taunt also stops the taunted foes from striking anyone but him.

**Items** (all `hero: 'basanos'`, no `stats.block`): `bas_flea_collar` Flea Collar (rare trinket: his first Transform each
turn costs 0 AP — `modifyCost` / `onCostPaid`, keyed by `state.turn`), `bas_wolfsbane_coat` Wolfsbane-Lined Coat (rare
armor: +4 max HP; 5 Block when Transform turns him back into a man — D9, it no longer heals on Hair Trigger),
`bas_moonfang` Moonfang (legendary weapon:
+10% damage; the Bleed his skills apply is doubled — descs show the doubled number for him).

**Sprites**: human — humanoid, navy coat over mail lapels, long dark scruffy hair with a grey streak (the wolf showing),
stubble, tired eyes, frown, three claw scratches on the cheek, a crescent-moon pendant "worn ironically", silvered sword,
belt + pouches. Werewolf (`unit.sprite` override) — bigger (1.12), stocky and hunched, grey fur, spiky mane, pointed ears,
glowing yellow eyes, long snout poking past the face with a pale muzzle, black nose and fangs (the jaw drops on attack),
dog tail, the torn navy coat. Dire (Blood Moon) — 1.34, red eyes, red glow. Checked in the gallery (poses, statuses,
portraits 128 / 64 / 40 / gray), the scratch sheet and in combat (wolf, Blood Moon).

**Barks**: 13 keys × 4-6 lines + `wolf` / `human` / `trigger` (form changes), ≤ 70 characters, apologetic voice, no
she/her anywhere in his texts (tested). Idle lines poke Marwyn, Ellaria, Marbles, Buga, Pebbles and Valdris.

## Tests (`tests/content/hero_basanos.js`, 20 suites, ~1930 assertions)

definition (stats, init +2, pool, form tags, desc length + form prefix, barks, pronouns, items, sprites + portraits) ·
Transform (move, basic swap, sprite override, form gates with reasons, no duration, swaps per AP, Claw by Transform level,
dispel) · Hair Trigger (exactly half vs below, Block-soaked hits, again after changing back, lethal → downed man, downed
wolf, on an enemy's turn, the Coat's Block, Blood Moon never heals) · Transform mends (D9; see "Sustain (Nov 12)") ·
basics at every level · Silver Slash / Shoulder Check I-III (Vulnerable exactly its
next 1 / 2 turns, pits + env Hype, lava, water, wall / edge / unit bumps, Bleed on the push) · Hold the Line / Step In I-III
(radius, Block until his next turn, the taunted grunt stabs him not the 4-HP mage, swaps an immovable ally) · Rend /
Savage Bite / Frenzy I-III · Pounce / Howl I-III (landing next to the foe on safe ground — never pits / lava, no room →
"No room to land.", adjacent = no leap, corner; the stunned foe loses exactly its next turn; Inspired on allies' next
turns / his own) · Blood Moon (radius 2, ally spared, 100 Hype, already a wolf) · items (0-AP Transform once a turn,
Moonfang doubled Bleed + descs, real fights) · previews == reality for every skill at every level · v2 edge cases
(silenced, sheep, stunned turn passes, charmed −1 AP + no damage to the charmer, not enough AP, deaths mid-skill, immovable,
odd targets through the raw resolver, map corner) · Transform aiScore (+ an AutoPlay turn: Transform → Pounce while
rooted) · AutoPlay battles (party Basanos + test knight / cleric / mage, fixture encounters acts 1-3, levels 1 / 3 / 5,
items, a no-Transform swordsman loadout; skills of both forms used) · **attacks of opportunity** (sword and Claw reactions,
once a round, the Claw's Bleed on the fleeing walk, he provokes walking off + the move preview, Hair Trigger mid-walk,
Pounce / Step In / Shoulder Check never provoke, no reactions while stunned / a sheep / charmed / downed, Hold the Line
frees the mage to disengage vs a control, the AI grunt sticks to him over the wounded mage) · **form follows bas_wolf**
(dispel + status / dispel + hit sync at once, the Blood Moon look fades at his turn end, Party Balloons kept through every
form change, previews leave his look alone) · **review (v2)** ×3 (a form swap keeps the basic slot's use count + an
AutoPlay turn of a werewolf after 6 Claws; Hair Trigger after a refused down with the real Plot Armor — or a stand-in rule
when isolated — on an enemy's turn and mid-walk, a real down leaves nothing pending; a bare dispel: the reaction, the move
preview and the AI see the sword). Mutation-checked: dropping the `onStatusApplied` sync or the sprite-pin release fails
suites, and so does each review fix (see Review (v2)).

## Public API (tests / debug)

`DD.Basanos = { WOLF, WOLF_MOV, CLAW_LV, MEND, COAT_BLOCK, HUMAN_SPRITE, WOLF_SPRITE, DIRE_SPRITE, isWolf(u),
becomeWolf(u, why), becomeHuman(u), syncForm(u), transformLevel(u), formOf(def), formValue(u, wolf, ap),
transformScore(ctx), mendSpent(u), landingTile(u, foe), baseMov(u) }` (`COAT_HEAL` removed Nov 12, D9).

## Deviations

- Transform is a socketed skill (it takes one of his 4 slots; DESIGN: "cheap; swaps forms"). Without it he can still turn
  into the wolf (Hair Trigger, Blood Moon) but not back — a player choice. Its level sets the Claw's numbers (the basic
  attacks themselves have one level), so upgrading Transform is "bigger numbers" for the wolf.
- The brief's "Parry (Block until his next turn)" became the Block riders of Hold the Line and Step In (skill Block that
  lasts until his next turn start); Step In (bodyguard swap) and Frenzy (adjacent AoE + Bleed) were added to reach a pool
  of 10.
- `bas_wolf` is a `buff`, so buff dispels turn him human (intended: counterplay + the "OBJECTION!" joke). Nothing else
  removes it but Transform, going down or the end of the fight.
- v2 review: Shoulder Check 4 / 5 / 6 → 5 / 6 / 7 (it was weaker than his 5-damage sword; now on par with other 1-AP
  shoves), Hold the Line radius 1 / 1 / 2 → 2 / 2 / 3 and Block 4 / 6 / 6 → 4 / 5 / 6 (other taunts reach 2; less Block
  than the dedicated tanks).
- Sustain (Nov 12), from the spec: no mechanical departures. Code shape only: the spec's inline "spent this turn" check
  (`S() && peek(u) && peek(u).mend === S().turn`) is one pure helper `mendSpent(u)`, shared by the desc and
  `transformScore` and exported for the tests. A Transform whose switch does not happen (the wolf status refused)
  neither heals nor spends the mend, as in the spec's execute.

## Requests

- **ITEMS** (`js/data/items.js`, `balloonSprite`): it wraps `DD.Sprites.specFor(unit)`, which prefers `unit.vis.sprite`
  (an on-screen pin) over `unit.sprite`. When content pins the old look during FX playback (Basanos' Transform) the
  balloons' `onSkillUsed` sees the already-wrapped pin and returns, so after a
  Transform in the real game (FX queued) the balloons vanish until his next skill or the end of his turn. Wrapping the
  logical sprite (`unit.sprite`, else the def's) would keep them. Cosmetic; the headless suite passes because FX are
  instant there.
- **HUD** (optional): the party panel / initiative tracker portraits use `DD.UI.portrait(u.defId)`, so the werewolf still
  shows the man's face. `DD.Sprites.portrait(unit)` already resolves sprite overrides (Basanos, Ellaria's Wild Shape, the
  DM's cameos) if the HUD passed the unit (re-render on `combat:changed`).
- ~~**NARRATIVE** (optional): a Basanos hero event~~ — done by NARRATIVE: `ev_bas_somebody_ate_dolly` ("Somebody ate
  Dolly", he/his throughout; checked in the review).
- **RENDER-SPRITES** (optional): overlays only get `g.head`; exposing the hand positions (e.g. `g.hands = { front, back }`
  after `paintHumanoid` places them) would let the werewolf get the claws of the DESIGN brief (and other content rings,
  glows, held props).
- **INTEGRATION** (FYI, not mine): `integration: cross-content consistency` still asserts "ten real heroes" and the old
  unlock conditions; it counts 16 now (Nov 4 full run), and `losing a protect objective…` still expects "no XP".
- **RULES** (optional, review v2): (1) a hook after a refused down, e.g. `onDeathPrevented(unit, d)` on the unit's
  sources once `preventDeath` set its HP (or fire `onTakeDamage` after `zeroHp`): today `onTakeDamage` sees 0 HP, so
  Hair Trigger after Plot Armor waits for the next hook on him (at the latest his turn start) instead of firing at once.
  (2) `onStatusRemoved(unit, st)` on the unit's sources from `removeStatus` / `cleanse` (and the status def's own
  `onRemove`): content whose state follows a status (his form) could re-sync at once instead of at the next hook.
- **AUTOPLAY** (optional, review v2): `statusGain` values any hook-less buff at +1.5 on, −0.5 off. `bas_wolf` is a form
  marker (what the form can do is already priced by the dry run's follow-up value), so every Transform into the wolf gets
  +1.5 for free: a small wolf bias (he ends 31 of 247 sampled turns on a Transform, all of them into the wolf, mostly
  "Transform + walk in", which is fine play). A status-def opt-out (`autoplayValue: 0` or `marker: true`) would remove it.

## Known issues

- AutoPlay mostly plays the werewolf (+2 move reaches more, the Claw is worth about the sword): with Transform socketed it
  transforms early and rarely changes back; the human skills get used when the fight comes to him or Transform isn't
  socketed (both are covered in the AutoPlay suites).
- The werewolf's portrait is the man's (see the HUD request); the werewolf has no claws drawn (see the RENDER-SPRITES
  request).
- Hair Trigger after a refused down (Plot Armor) fires at the next hook on him, not at the very moment (see the RULES
  request); a dispel with nothing after it leaves his move / sprite stale until that hook (his attack of opportunity is
  right regardless).
- AutoPlay walks the werewolf (move 6) out of reach after attacking more often than other melee heroes and takes the
  priced attack of opportunity for it (16 provoked in 60 sampled fights vs 5–7 for Betty / Marwyn / Pebbles; 10 of the
  16 were that hit-and-run step): AutoPlay's generic danger model, not his kit; a player has Pounce / Step In / Shoulder
  Check to disengage for free.
- See the Review (v2) section for the latest full run.

## Review (v2) — adversarial review (ADVERSARIAL REVIEWER role)

Scope: `js/data/heroes/basanos.js`, `tests/content/hero_basanos.js`, this file. An earlier attempt (killed by the app hang)
only left probes in `.tmp/basrev/`; their findings are folded in here. Scratch (not shipped, Chrome-slot aware):
`.tmp/basrev2/run.sh` + `probe.html?files=p_edge|p_ap|p_ap2|p_apfix|p_cmp|p_aoo|p_dump` (edge cases, AutoPlay traces,
a melee-hero comparison, provoked walks, a roster dump), `old.html` (the earlier probes), `shot.sh` with `scene.html` /
`sprites.html` (looks).

### Verified (held)

- **desc == effect** at every level for all 13 skills and 3 items (desc dump, the sandbox suites, previews == reality for
  every skill at every level). Every desc reads in one breath (9–16 words) and names its form.
- **Simplicity**: every pool skill is one verb + at most one rider (Pounce is the brief's leap + Stun; Blood Moon's
  transform + maul + Bleed is in line with the other signatures, e.g. Crimson Tide, Tectonic Tantrum). The passive is one
  rule and the comedic core ("the wolf gets out when he's hurt").
- **Combos**: Silver Slash → Vulnerable for allies' big hits; Shoulder Check → pits / lava / water / traps / runes; Pounce →
  Stun (wind-up interrupts, Betty's Kick and Sucker Punch payoffs); Rend / Frenzy Bleed → allies' pushes and pulls; Howl →
  the party Inspired; Hold the Line → taunted foes can't strike his friends.
- **v2**: init +2, `unlock: null`, no Guard / starting Block / intents / XP in his files; own-turn durations (tested).
- **Attacks of opportunity**: both basics are melee (he holds the line in both forms); Pounce (teleport), Step In (swap) and
  Shoulder Check (push) never provoke; Hair Trigger fires mid-walk; the Claw's Bleed bites the fleeing foe.
- **Form consistency**: 100 real-content AutoPlay fights (random parties, every act, his items and Party Balloons): move,
  basic, Claw level and look match `bas_wolf` at every turn start and end; no swallowed errors.
- **Engine interactions** (probed): sheep (drawn by status, move 2, `u.mov` untouched), downed (statuses wiped → the man,
  helped up as the man), OBJECTION! (dispel + Silence → synced at once), thorns mid-skill (the wolf gets out during Silver
  Slash and the preview shows it), Blood Moon into thorns (he goes down mid-maul, the maul stops), Step In onto fire (the
  preview shows the Burn), Hold the Line on a charmed foe (fine), no content copies or steals statuses.
- **Distinct and on brief**: the only hero whose basic attack swaps with his form (Ellaria's Wild Shape is a giant corgi);
  gallery, sprite sheet and in-combat werewolf / Blood Moon read right; he/him everywhere, incl. other heroes' barks and the
  "Somebody Ate Dolly" event.
- **Power** (rough: AutoPlay, the same 60 random non-boss fights per hero, partners random): Basanos 59/60 won, 31.9 damage
  a fight (Betty 30.3, Marwyn 28.1, Pebbles 34.1), the most damage taken (24.8; Betty 20.6, Marwyn 18.3) and downed about
  as often as Pebbles (21 vs 20): a hard-hitting, fragile wolf in AutoPlay's hands, in band.

### Fixed (each with a regression suite `hero_basanos: review (v2) — …`, each mutation-checked: the mutant fails it)

1. **AutoPlay transformed back and forth** (wasted AP in every balance sim). `setBasic` built a fresh basic slot
   (`uses: 0`); AutoPlay's `cooldownGain` compares slots index by index and pays +2 per "refunded use", so a werewolf who
   had clawed 5 times saw +9.5 in turning human, then +1.5 in turning back. Fix: a swap keeps the slot's `uses` / `cd` /
   `fresh` (one attack slot, like `usedThisTurn` already). The same 40 random real-content fights before → after: turns
   spent on Transform ×2 11 of 245 → 0 of 247; Transforms 90 → 36, Claws 112 → 150, wins 35 → 36, his downs 16 → 13; he
   now commits to the werewolf (69% of his turns, was 62%: the phantom refunds kept flipping him back). The mutant: a
   werewolf after 6 Claws spends his turn transforming twice (grunt a walk away) or turns into a man next to the grunt he
   was mauling.
2. **Hair Trigger missed refused downs.** Plot Armor (a rare Blessing any hero can roll: "stay up at 1 HP") refuses the
   down after `onTakeDamage` has run at 0 HP, so a Basanos saved at 1 HP stayed a man. Fix: a 0-HP hit marks a pending
   trigger that `settle()` resolves at the next hook on him (every sync point, now also `onHealed` and
   `onOpportunityAttack` on both sides): still standing below half → the wolf (free; then also the Coat heal, removed Nov 12 by D9); `onDowned` clears it.
   Tested with the real Plot Armor (a stand-in rule when isolated): on the grunt's turn (his turn starts as a werewolf
   with 3 AP, one trigger) and mid-walk (a lethal stab refused → a 1-HP wolf at the end of the walk); a real down leaves
   nothing pending.
3. **A man clawing.** After a dispel with nothing after it the basic slot stays the Claw until a hook re-syncs, and his
   attack of opportunity used it (4 + Bleed from a human). Latent today (OBJECTION! Silences right after its dispel). Fix:
   a pure `modifyOpportunity` hook swaps the reaction to the basic of his real form, so the move preview
   (`Combat.provokes`), the AI's cost and the strike all see the sword.

### Design notes (not changed)

- Hold the Line (taunt r 2 / 2 / 3 + Block 4 / 5 / 6, 1 AP, cd 2) is the same tool as Marwyn's LOOK AT MARWYN! and Slate's
  Get Off My Lawn (same reach and cost, Block 4 / 6 / 8); at the brief's "adjacent" it would be Marbles' Back In My Day.
  Kept: it is the brief's skill and a standard tank tool, and his kit is distinct through the two forms. A later pass
  could give the human a line-holding twist of his own (e.g. tied to attacks of opportunity).
- Blood Moon's 14 is a point under DESIGN §5's 15–25 (its 3 Bleed covers it); kept as tuned.
- The starting kit (Transform + Shoulder Check) gives the werewolf no skill of its own until his first level-up (about
  fight 4 with v2's slow leveling); the Claw and +2 move carry it, and the human stays the brief's "melee fighter". Kept.

### Full run

Isolated (`suite=hero_basanos&isolate=heroes/basanos,hero_basanos`): 20 suites, ~1925 assertions, all pass (the Plot
Armor suite uses its stand-in rule there). Generic `content:` suites with him isolated: 8 suites, 3,318 assertions, all
pass. Full `bash tools/test.sh` (Nov 4, other areas mid-flight): 794 suites, 115,134 assertions ok, 9 failures in 2
sections, both in `tests/content/integration.js` (the integrator's: "ten real heroes" now counts 16, the old unlock
conditions, "no XP" in the Objective Failed step), none involving Basanos; all 20 `hero_basanos` suites pass with all
content loaded (the real Plot Armor, the Party Balloons check), no swallowed "Error in" warnings. The manifest's
`tests/balance_tests.js` does not exist yet (balance area).

## Requests (Nov 3) — flyers ignore the floor, barrels, heals that revive (CONTENT SWEEP heroes-2)

- **Barrels**: Silvered Sword, Claw, Silver Slash, Shoulder Check, Rend and Savage Bite can be aimed at a volatile object
  (riders skipped: no push, Bleed, Vulnerable or heal). Pounce opts out (`target.objects: false`): it is a leap next to a
  foe, and its leap would not happen on a barrel.
- **Flyers**: no floor effects of his own; Pounce's landing already asks the per-unit `hazardAt`.
- **Heals**: none that target allies (Savage Bite heals himself on a kill).
- **Tests**: `hero_basanos: v2 requests — …`: Pounce lists no barrel; Silvered Sword and Claw at a barrel (preview =
  reality, no Bleed).
- **Requests**: none.

## Sustain (Nov 12) — Transform mends; the Coat gives Block (D9, spec `.tmp/wf13/sustain-spec.md` §1.2 / 2.2 / 5 / 7)

The user (D9): healing "linked to the characters themselves ... Basanos gets to heal on trasnform (not by HP threshold)",
"without overloading each character with a self-heal". Lead D10: Blood Moon does not heal; the Flea Collar fallbacks
(mend 2 / 3 / 4, then wolf-only) are the balance pass's to apply on measurement.

**Transform** (`bas_transform`, 1 AP, cd 0, self, tags `['shapeshift']` — no `heal` tag, so he is not a `REQ.healer`):
- `MEND = [3, 4, 5]`; levels `{ claw, bleed, mend }` (key `mend`, not `heal`: AutoPlay's `quickScore` reads `L.heal` on
  self-target skills and would credit it even once spent).
- His **first switch each turn, either direction**, heals `mend`. It is spent by that first switch even at full HP
  (`unit.data.bas.mend = state.turn`, the Flea Collar's per-turn marker pattern); a second switch that turn heals 0;
  the next turn's first switch heals again. Pop-up `Good as new-ish!`; log `The change knits Basanos back together. His
  trousers are not so lucky.` (only when he actually healed).
- **Never heals**: Hair Trigger (the HP-threshold path the user ruled out), Blood Moon (signature, D10), `syncForm`
  (a dispel, a down). None of them spends the mend either: after Hair Trigger or Blood Moon, his first chosen switch that
  turn still heals.
- Desc (`desc(L, user)`, 24 words, 27 with the live clause; cap 28): `Switch between human and werewolf. Your first switch
  each turn heals you 3 HP. Werewolf: +2 move; basic attack Claw (4 damage, 1 Bleed).` (II: 4 HP, Claw 5 / 1; III: 5 HP,
  Claw 5 / 2; the Bleed keeps `bleedN`, so Moonfang shows 2 / 2 / 4). Live: once his mend is spent this turn, `3 HP`
  reads `3 HP (used this turn)` (pure: `mendSpent(u)` uses `peek`, `S()` may be null).
- Flea Collar: the free first switch still heals, once (tested).

**Wolfsbane-Lined Coat** (`bas_wolfsbane_coat`, rare armor, `{ hp: 4 }` unchanged): the Hair-Trigger heal (`COAT_HEAL` 6,
in `becomeWolf`) is deleted. New: `COAT_BLOCK = 5` Block when **Transform** turns him back into a man (not a dispel, not
a down; not gated: each switch costs AP and Block resets at his turn start). Pop-up `Coat on.`; log `Basanos buttons the
wolfsbane coat back up. It itches. It works.` Desc: `+4 max HP. When Transform turns you back into a human, gain 5 Block.`
Flavor unchanged. It now rewards switching on purpose (wolf to rush in, man to hold the line), not dropping below half.

**AutoPlay** (`transformScore`): `base = max(0, then − now − 2)` (form value, friction unchanged); in the **quick pass
only** (no `ctx.autoplay`) and while the mend is unspent this turn, `+ min(mend, missing) × (1.5 below half HP, else 0.8)`
— outside the `max(0, …)`, so form friction can't swallow it. The exact pass's dry run already sees the real heal.

**Exports**: `DD.Basanos.MEND`, `COAT_BLOCK`, `mendSpent(u)`; `COAT_HEAL` dropped (nothing else in the repo used it).
**Loading tip** (registered from basanos.js): `Basanos's first Transform each turn knits him back together. Hair Trigger
doesn't count: he has to mean it.`

**Tests** (`tests/content/hero_basanos.js`):
- new suite `Transform mends …`: MEND / COAT_BLOCK exports, no `COAT_HEAL`; no `heal` tag / key; per level I-III: the
  desc names 3 / 4 / 5 HP, man → wolf heals exactly MEND, one log line, the live desc gains `(used this turn)` (≤ 28
  words) and the user-less desc never does, the second switch heals 0, the next turn's first switch heals again, wolf →
  man as the first switch heals too; full HP spends it (no log line; a later switch that turn heals 0); Flea Collar (free
  and healing once, twice over two turns); Hair Trigger then a chosen switch the same turn heals; a dispel neither heals
  nor spends it; the preview shows exactly +3 and spends nothing, preview == reality, then no heal in the next preview;
  the tip.
- Hair Trigger suite, Coat part rewritten: the desc; +4 HP; into the wolf: mend, no Block; back: 5 Block, no heal; the
  Block expires at his next turn; the next turn's first switch heals; wolf → man first switch: mend + Block; a dispel
  gives no Block; Hair Trigger with the Coat: exactly 15 HP, no Block; Blood Moon from human form, with and without the
  Coat: no heal, no Block, mend unspent. The Hair Trigger HP asserts above it are unchanged (no heal).
- new suite `Transform aiScore prices the unspent mend …`: exact (ctx.autoplay) = the old form value; quick adds
  min(mend, missing) × 0.8 / 1.5 at I / II / III (missing 0 / 2 / 10 / 16); spent this turn → quick == exact; next turn
  unspent again; far from every foe and below half → 3 × 1.5 (the friction can't swallow it).
- Unchanged and green: the item suite (+4 HP), the AutoPlay battles, `tests/content/shared.js` Party Balloons (run
  without `isolate`).

**Numbers** (the fixture AutoPlay battles, verbose, `['basanos', test_knight, test_cleric, test_mage]`, 10 fights at
L1 / 3 / 5): 10 / 10 wins, Transform 9 uses (0.9 a fight). These are short (2-7 rounds) with a cleric in the party, so he
is rarely hurt when he decides: the spec's 1.5-3 a fight is for the balance pass's real-run sims (spec §9), along with
the Flea Collar watch (fallbacks: mend 2 / 3 / 4, then wolf-only; D10 lets the balance pass apply them).

**Status**: the build:basanos run restarted at ~18:50 found the code, tests and these notes already landed by the first
attempt; it re-checked them line by line against the spec (all match), ran the isolated suites (23 / 23, 2089 ok), the
Party Balloons suites without `isolate` (27 / 27, 2135 ok), and the full `tools/test.sh`. Full run (19:08-19:10): 967
suites, 11 failures in 7 sections, none in a Basanos suite or caused by basanos.js: mapgen difficulty info (brutal
knobs), two HUD playtest suites (first-hour), balance pass 2's late-boss rows (not landed), hero_marwyn acts 2-3 battles
("many different skills"), two narrative tip checks (the "Flyers" tip in narrator.js). An earlier full run (19:05) had
also caught a playtest fixer's half-written `AI.rollSkew` in js/engine/ai.js (the boss fixture's wind-ups threw in the
Basanos battle suites too); the rerun against the finished file is clean.

**Deviations** from the spec: see the Deviations list (Nov 12 entries).
**Requests**: none (no file outside mine needs a change; DESIGN §6 / v2-digest texts are the DOCS phase's, spec §6).

## Review (sustain, Nov 12) — adversarial review: the user's intent and the rules text (ADVERSARIAL REVIEWER role)

**Verified by running code** (suites; a scratch harness `.tmp/rev13/rt.js` that plays real encounters through
`DD.Encounter.build` + `DD.AutoPlay.runBattle` with real heroes; `tools/sim.sh`):
- The user's words, "heal on transform (not by HP threshold)": the only new heal is in Transform's execute, either
  direction, once per turn (`d.mend = s.turn`). Hair Trigger (`becomeWolf(u, 'trigger')`), Blood Moon
  (`'signature'`) and `syncForm` (a dispel or a down) never heal and never spend the mend. The Coat's Hair-Trigger heal
  (`COAT_HEAL` 6, the threshold heal the user rejected) is gone; the Coat now gives 5 Block when Transform turns him back
  into a human. Grep: the only `heal(` calls left in basanos.js are the mend and Savage Bite's kill heal (a kill, not
  a threshold).
- Real fights (harness, allies Zarathor / Kiri / Buga or Ellaria / Kiri / Zarathor, act 1 / 2 / 3 encounters at hero
  level 2 / 4 / 6 with Transform I / II / III; 18 / 14 / 14 fights): Transform 1.5 / 2.4 / 4.4 a fight, the mend
  1.4 / 5.8 / 15.8 HP a fight; Hair Trigger fired 2 / 8 / 16 times and never healed. **With the Flea Collar**: 2.5 /
  4.5 / 6.6 Transforms and 3.6 / 11.9 / 21.9 HP a fight. `tools/sim.sh "seeds=8&from=7000&stop=1&party=slate,basanos,sparrow,marwyn&dump=1"`
  (act 1, 33 fights, no capped fight): Transform 4.2 a fight.
- Previews, tooltips and the log agree (the mend suite's preview / live-desc checks pass; log "The change knits Basanos
  back together. His trousers are not so lucky." only when he healed). Pronouns: he / him everywhere.

**Fixed**
1. Transform's desc said "Your first **switch** each turn heals you N HP", but a Hair Trigger switch on his own turn
   (an attack of opportunity while he walks, lava, thorns) is a switch that neither heals nor spends the mend, and the
   Transform after it does heal (the mend suite's own case). The desc now says "Your first **Transform** each turn heals
   you N HP" — exact, the Flea Collar's own wording ("Your first Transform each turn costs 0 AP"), and the user's
   words ("heal on transform"). Same word count (24, 27 live). Regression: the mend suite asserts the new wording at
   I-III and that no desc says "first switch" (right after the Hair-Trigger-then-Transform case). Header / constant
   comments and the suite title follow.

**Not changed (for the balance pass; D10 lets it apply the pre-agreed fallbacks)**
- Transform runs above the spec's 1.5-3 a fight once he is hurt (4.2 in the act 1 sim, 4.4 at III in the harness) and
  the mend above its guard rails (about 8 a normal fight / 15 a boss; the Collar subset about 10): 15.8 HP a fight at
  III, 21.9 with the Collar. AutoPlay flips forms almost every turn for the 1-AP (Collar: 0-AP) heal — so would a
  human. Fallbacks in order (spec §1.2, D10): mend 2 / 3 / 4, then mend only on switches into the wolf.

**Requests**
- **DOCS (lead)**: `docs/notes/v2-digest.md` (the Transform line, ~:336) and DESIGN §6's Basanos brief (~:525) say "first
  switch each turn"; the code now says "Your first Transform each turn heals you 3/4/5 HP" (DESIGN can read "his first
  Transform each turn heals him 3–5 HP, by level — Hair Trigger and Blood Moon never heal").

**Test runs**: isolated `suite=hero_basanos&isolate=basanos`: 23 suites, 2,092 assertions ok, 0 failures. Full run: see
the end of `docs/notes/hero-slate.md` "Review (sustain)".

## Review (sustain, Nov 12) — engine, AutoPlay and tests (ADVERSARIAL REVIEWER role)

Probes: `.tmp/rev-engine/probe.js` (scratch page, one Chrome slot; real act 1 encounters through `DD.Encounter.build` +
`DD.AutoPlay.runBattle`, Basanos with the Flea Collar or the Coat, levels 1 and 3, 20 fights) and AutoPlay traces
(`DD.AutoPlay.trace = 'all'`) of hand-built spots; in-memory mutants (`&mut=`, no file on disk changed).

**Verified (by running code)**
- Previews and dry runs never heal or spend the mend: every real "knits ... back together" line (75 in 20 fights)
  matched a real, non-simulated mend heal, one for one; the mend marker lives in `unit.data.bas`, which
  `Targeting.simulate` deep-copies; `unit.data` is fresh per fight (`combat.js` unit construction), so a turn number from
  the last fight can never block this one's mend.
- `s.turn` counts every unit's turn, so "first Transform each turn" is per Basanos turn; no content lets him Transform
  on someone else's turn (Delegate gives basic swings only).
- The tests catch it: a mutant that heals on every switch fails 14 assertions (the mend suite, Hair Trigger, the quick-
  pass aiScore suite).

**Observed, not changed (for the balance pass)**: why AutoPlay Transforms so often (5.8 a fight in these probe fights,
4.2 in the other reviewer's sim). In 17 of his turns he switched twice or more, and 12 of those ended in the form they
began: 2 AP (1 with the Collar) for the mend, back where he started. The mechanism: `transformScore` returns
`max(0, then − now − 2)`, so the first switch into the *worse* form costs nothing in the score while the dry run pays its
heal; the switch back then scores `then − now − 2 > 0`. The traces show it happens with AP he has no other use for (no
foe in reach); next to a foe he claws or switches once into the better form. So it is not a wasted attack, and a human
would do the same, but "Transform uses a fight" now counts flaps: **measure the mend (heals a fight) instead**. If the
balance pass wants fewer flaps without touching MEND, the AutoPlay-side lever is to drop the clamp while the mend is
unspent (`base = then − now − 2`, negative allowed), so the heal has to pay for the form it lands in; the D10 fallbacks
(mend 2 / 3 / 4, then into the wolf only) stay the rules-side levers.

## Balance refit (Nov 12) — MEND 3/4/5 → 2/3/4 (BALANCE REFIT 1, spec §9 / D10 pre-agreed fallback; docs/notes/balance.md "Sustain refit - act 1")

- **Why**: the spec's guard rails are mend ≤ ~8 a regular fight, ≤ ~15 a boss fight and **the Flea Collar subset ≤ ~10**.
  Whole campaigns (400 runs, seeds 11000+ / 13000+): Transform 3.0 casts a regular fight / 3.6 a boss fight; he healed
  himself 6.8 / 8.6 HP a fight without the Collar (inside the caps) but **13.3 / 15.4 with it** (63 / 25 fights: a free
  Transform every turn is a personal 3-5 HP aura). His run-win share was 1.01× the median (act 1 alone 0.87×).
- **Change**: `MEND = [2, 3, 4]` (the spec's first fallback; the second, "mend only into the wolf", is held back). The
  Transform desc reads `L.mend`, so it stays exact ("…heals you 2 HP."); the header comment says 2 / 3 / 4.
- **Tests**: `hero_basanos` reads `Bz().MEND` everywhere it used the literal 3 (the Collar cases, the Coat cases, the
  dispel / Hair Trigger cases, the preview, the quick-pass `transformScore` cases; the first case now misses 1 HP so
  `min(mend, missing)` is still tested at mend 2). Isolated run: 23 suites, 2092 assertions, 0 failures.
- **Docs** (request to DOCS): the DESIGN §6 Basanos brief and the v2-digest §2 Transform line ("3/4/5") should say
  2 / 3 / 4 (this file's summary lines above are updated).

## Finish (Nov 14) — the playtest findings held for the sustain build (FIX: CONTENT)

- **heroes-1 / review-open-1 (fixed)**: Transform can still be forgotten at a level-up (a player choice, recorded under
  Deviations), but now the forget picker warns: `bas_transform.forgetWarning` ("Both his forms hang on this. Without
  Transform the wolf only gets out by Hair Trigger or Blood Moon, and then stays out (human skills locked) until the
  fight ends. Vet bills not included."; `DD.UI.chooseSkillSlot` shows it on the card). `gate()` names the way out he
  really has: with Transform socketed the locks still say "(Transform first)"; without it, "Werewolf form only (no
  Transform socketed: Hair Trigger or Blood Moon lets the wolf out)." / "Human form only (no Transform socketed: he is
  human again next fight)." Suite `hero_basanos: finish — a forgotten Transform …`.
- **heroes-4 / review-open-2 (fixed)**: Step In has Human Shield's `canTarget` (lead decision D2): no immovable ally
  ("Won't budge."), no pit / non-walkable tile under a flying ally ("Basanos can't stand there."), and no hazard
  (lava, fire: "Basanos would rather not stand in THAT."). `force: true` is gone, so the engine refuses an immovable
  ally even on a forced resolve (no Block then). The old review test "an immovable ally still swaps" now asserts the
  refusal. Suite `hero_basanos: finish — Step In follows the swap rules …`.
- **heroes-v1 / desc-sweep-5 (fixed)**: Step In and Pounce print `DD.Targeting.reach` (a local `reach(user, id, L,
  base)`): a +range item reads "within 4 tiles" where the card says Range 4.
- **desc-sweep-7 (fixed)**: with the Wolfsbane-Lined Coat, Transform's text adds "Turning back into a human gives you 5
  Block (Wolfsbane-Lined Coat)."
- D1 opt-out kept: Pounce (`target.objects: false`): the leap lands next to a foe; Claw / the Sword hit an adjacent crate.
- D7: two swap barks (`barks.swap`, `{ally}` filled by the engine).
- Numbers: none changed.

## Review (finish, Nov 14) — REVIEWER

- heroes-4 re-played with the real kit: Step In lists no Slate (immovable), and its `A().swap` without `force` refuses only
  what `canTarget` already refuses, so no AP is ever spent on a "Won't budge!". heroes-1: the locks name the way out he
  has. D1: Pounce stays an opt-out; his other single-target damage skills hit a crate for exactly their 🔨 number.

## Conditional heal (Nov 18) — "Sorry, It's Crowded In Here" (build:g3; plan `.tmp/heal/plan.md` §4.4, the user's Nov 18 request)

The user (Nov 18): "I want everyone else brought up but by conditional healing" (D9: "Basanos gets to heal on trasnform
(not by HP threshold)"). His D9 heal, Transform's mend, is broadened: the change is roomier when monsters are pressing in.

- **What:** his first Transform each turn (either direction, through the skill: the `d.mend !== s.turn` gate, unchanged)
  heals `mend + min(foeCap, perFoe × adjacent foes)`, the foes counted AFTER the switch (`crowdAt(u)`: active units
  hostile to him at `DD.Grid.dist` 1; allies, dead foes and foes at distance 2 / diagonal don't count). Self, once per
  turn (the existing marker, still spent at full HP). Hair Trigger, Blood Moon and `syncForm` still never heal. Flea
  Collar / Coat unchanged.
- **Numbers:** MEND 2 / 3 / 4 (unchanged) + `CROWD_PER` **2** per adjacent foe, max `CROWD_CAP` **+4**: I 2-6, II 3-7,
  III 4-8. Level keys `perFoe` / `foeCap` (never `heal`). Exported on `DD.Basanos`: `CROWD_PER`, `CROWD_CAP`, `crowdAt`,
  `mendWith(L, n)`. Tuning range: perFoe 2 [1 on a guard-rail breach only, 3]; foeCap 4 [2 on a breach, 6].
- **The call:** `A().heal(u, u, mendWith(ctx.L, crowd), { via: 'lift:basanos' })` — the WHOLE mend carries the label
  (the sim reads base and crowd together). The old `if (u.hp < u.maxHp)` guard is gone: always called (0 HP at full HP,
  counted as a fire), the marker spent as before; "Good as new-ish!" (no crowd) / "Sorry! Crowded!" (a crowd), the
  "knits him back together" log line and the new `crowd` bark (0.35, only with ≥ 1 foe adjacent) only when it healed.
  The `active(u)` check before the heal is the existing `if (!switched || !active(u)) return;` (nothing revives).
- **Text (desc == execute):** `Switch between human and werewolf. Your first Transform each turn heals you 2 HP, +2 for
  each adjacent foe (max +4)` + (spent this turn: `; used this turn`) + `. Werewolf: +2 move; basic attack Claw (4 damage,
  1 Bleed).` + the Coat sentence (II: 3 HP / Claw 5, 1; III: 4 HP / Claw 5, 2). The live marker moved from
  " (used this turn)" to "; used this turn" (it follows the crowd clause). Keeps "heals you 2/3/4 HP" (v2-digest docs test).
- **Barks** (new key `crowd`): "Sorry. It's crowded in here." / "Nobody look. NOBODY LOOK." / "Bad dog. Good knees."
- **AutoPlay:** the exact pass dry-runs the real heal from every reachable tile (it walks into contact, then flips: the
  new suite pins it with a 2-AP turn between two stunned grunts → a walk, then Transform for 6). `transformScore` (quick
  pass, unspent mend) prices `mendWith(L, crowdAt(u))` with the house heal formula (outside the form friction's max).
- **Existing assertions updated to the new truth** (none deleted): the mend suite's desc lines ("heals you M HP, +2 for
  each adjacent foe (max +4)." and "…(max +4); used this turn."), the live desc's one-breath cap 28 → 34 words, the
  definition suite's Transform cap 28 → 32 words (the crowd clause; every other skill stays ≤ 28), the Hair Trigger case
  with the grunt next to him (2 → 2 + 2), and the quick-pass mend case with an adjacent grunt (min(mend + 2, missing)).
- **Tests:** new suite `hero_basanos: conditional heal (Nov 18)` (104 assertions): constants and level keys; the desc
  word for word at I-III; the crowd table 0/1/2/3/4 foes at I → 2/4/6/6/6, II 1 foe → 5, III 2 / 4 foes → 8 (src
  Basanos, one labelled call, no other heal); an adjacent ally, foes at distance 2 (straight and diagonal), a dead
  neighbour → no bonus; once per turn and fresh next turn; full HP → one 0-HP call; Hair Trigger and Blood Moon in a crowd
  → no lift heal; a downed Basanos can't Transform and a forced resolve heals nothing; the preview shows +6 with two
  foes and matches reality; the live desc; the quick-pass term = healWorth(mend + crowd) for 0-3 foes; the AutoPlay turn.
- **Sanity sim** (`bash tools/sim.sh "debug=1&raw=1&seeds=30&from=50900&stop=2&party=basanos,sparrow,buga,marwyn"`,
  `.tmp/heal/g3/basanos.txt`, 30 runs, 183 Basanos fights): `lift:basanos` (the whole mend) **2.73 fires a fight, 6.6 HP
  a fight** (self; overheal 10%); regular 2.56 / 6.2, elite 3.5 / 9.4, boss 3.06 / 7.0. T8: fires ≥ 2.0 and HP inside
  4.5-14: OK; guard rail (≤ 12 a regular fight without the Flea Collar): 6.2 with the Collar fights in, OK. 0 errors,
  0 DD.warn lines.
- **Deviations:** none.

### DESIGN §6 brief (Nov 18)
Anchor (unique in `docs/DESIGN.md`, `### Basanos the Mostly Housebroken`, lines 634-635 today):

```
  Starters: *Transform* (1 AP: switch forms; his first Transform each turn heals him 2–4 HP, by level — Hair Trigger and
  Blood Moon never heal) and *Shoulder Check* (human: hit and push).
```

Replacement (keeps the pinned "heals him 2–4 HP"; appends "+2 per adjacent foe, max +4"):

```
  Starters: *Transform* (1 AP: switch forms; his first Transform each turn heals him 2–4 HP, by level, +2 per adjacent
  foe, max +4 — Hair Trigger and Blood Moon never heal) and *Shoulder Check* (human: hit and push).
```

### Conditional heal: test runs (Nov 18, build:g3)
`tools/test.sh "suite=hero_basanos&isolate=heroes/basanos,hero_basanos"` while iterating (all pass but the Step In suite, which needs Slate loaded: it passes in the full run); then ONE full `bash tools/test.sh`: **1317 suites, 150,775 assertions ok, 0 failures**, 0 swallowed "Error in" lines.

### Conditional heal: requests (Nov 18, non-blocking)
- **Engine builder, phase 2:** apply the DESIGN §6 brief above; regenerate his v2-digest §2 Transform line (it keeps
  "heals you 2/3/4 HP", which the docs test pins). Its hand-written note after the generated text (line 342 today: "in a
  fight the desc adds "(used this turn)" once the heal is spent") now reads "; used this turn" (review:g3, Nov 18: the
  live marker follows the crowd clause).

### Conditional heal: adversarial review (Nov 18, review:g3)
Code path read end to end (the `d.mend !== s.turn` gate, the switch, `active` before `DD.Act.heal`, `crowdAt` after the
switch, `mendWith` capped; Hair Trigger, Blood Moon and `syncForm` never reach it); desc == execute; the suites pass.
Forced-party sim with Ellaria in the party (`seeds=30&from=55100&stop=2&party=basanos,zarathor,ellaria,pebbles`,
`.tmp/heal/review_g3/basanos.txt`, 297 fights): `lift:basanos` **2.01 fires, 4.5 HP a fight** (regular 1.85 / 3.9,
elite 2.41 / 5.9, boss 2.32 / 6.1), overheal 15%: on T8's floor (≥ 2.0 fires, 4.5-14 HP), guard rail far below (3.9 a
regular fight). The build's sim (no healer: 2.73 / 6.6) read higher: with Ellaria topping him up, the quick pass prices
the mend lower and he flips less. Worth watching on the final gate. 0 errors, 0 DD.warn, 0 stalls.
