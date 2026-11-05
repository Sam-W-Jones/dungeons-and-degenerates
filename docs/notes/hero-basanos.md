# HERO — Basanos, the Mostly Housebroken (notes)

Files: `js/data/heroes/basanos.js`, `tests/content/hero_basanos.js` (20 suites `hero_basanos: …`), this file.
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

**One transformation.** `Transform` (1 AP, no cooldown, a socketed skill, works in both forms) swaps human ⇄ werewolf.
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
| Transform ⭐ | both | 1 AP, cd 0 | switch forms (werewolf: +2 move, Claw) | — |
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
armor: +4 max HP; heal 6 when Hair Trigger fires — not on a chosen Transform), `bas_moonfang` Moonfang (legendary weapon:
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
wolf, on an enemy's turn, Coat heal) · basics at every level · Silver Slash / Shoulder Check I-III (Vulnerable exactly its
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

`DD.Basanos = { WOLF, WOLF_MOV, CLAW_LV, COAT_HEAL, HUMAN_SPRITE, WOLF_SPRITE, DIRE_SPRITE, isWolf(u), becomeWolf(u, why),
becomeHuman(u), syncForm(u), transformLevel(u), formOf(def), formValue(u, wolf, ap), transformScore(ctx), landingTile(u,
foe), baseMov(u) }`.

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
   `onOpportunityAttack` on both sides): still standing below half → the wolf (free, Coat heal); `onDowned` clears it.
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
