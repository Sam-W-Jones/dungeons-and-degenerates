# HERO: Corelos, the Undersigned (Runic Sorcerer) — notes

Files: `js/data/heroes/corelos.js` (content), `tests/content/hero_corelos.js` (21 suites `hero_corelos: …`).
Run: `bash tools/test.sh "suite=hero_corelos&isolate=heroes/corelos,hero_corelos"` (generic checks:
`bash tools/test.sh "suite=content:&isolate=heroes/corelos,hero_corelos"`).
Scratch (not shipped): `.tmp/corelos/` — `run.sh` + `probe.html?probe=<file>` (probe pages with the fixtures loaded,
one Chrome slot), `ap.js` / `ap2.js` / `ap3.js` (AutoPlay traces), `*_v1.*` (the v1 files this pass started from),
`g.png` / `g2.png` (gallery), `c1.png` / `c2.png` / `c3.png` (autoplayed fights with runes on the board), `c4.png`
(deployment HUD with his level-5 skill bar), `full1.txt` / `full2.txt` (full `tools/test.sh` runs). The v2 review's
scratch: `.tmp/corelos-review/` — `run.sh` + `probe.html?probe=aoo.js|edge.js|combo.js|fuzz.js` (one Chrome slot),
`shot.sh` + `view.html` / `view_enc.js` (a 7×6 board with plain + binding runes, `&roll=1` adds Debt and the Lawyer),
`g1.png`, `c1.png`, `v1.png` / `v1_crop.png` / `v2.png` / `v2_chip.png`, `full*.txt`.

Status (v2 review, 2026-11-03): see "Review (v2)" at the end — three desc / simplicity fixes, a new attacks-of-
opportunity suite, barks for the three newest heroes; 21 suites green, nothing failing in the full run is his.
Earlier status (resumed pass, 2026-11-01): the v2 conversion below is complete. Re-verified after other areas' changes:
the 20 `hero_corelos` suites (1200 assertions) and the 8 generic `content:` suites pass isolated, with no console warnings from
his files; the gallery and combat screens render (runes, skill bar, deployment). Full `tools/test.sh` (669 suites):
74 failing sections, none from his files (every `hero_*` suite passes); they are other areas' pre-v2 tests (bosses_act1
18, boss_dm 15, bosses_act2 13, enemies_act1 8, kit 5, items 5, narrative 4, passive-table 3, integration 2,
enemies_act2 1). The only one naming him is integration's "corelos: unlock condition — expected {act:3}" (the v2
`unlock: null` rule for every hero; INTEGRATION's test to update). Real-hero DM sims: his parties won 4 of 5.

## Summary (v2: initiative, no telegraphs, no Guard, simple skills)

The user's brief: *"A runic sorcerer with a propensity for making dark bargains."* Corelos is a hooded rune-lawyer
who has signed every contract ever slid across a table. Two halves, both kept from v1, both simpler now:

- **Runes are traps** (`cor_rune`, a non-blocking object, max 3 per Corelos, the oldest fizzles). A foe that steps on
  one (its own walk, a push, a pull, a teleport; flyers float over; spawns don't count) sets it off: it bursts for its
  damage on **every foe on and next to it** (allies and objects are never hurt). Foes never see runes (no AI hazard),
  so in v2 runes punish the walks enemies make **on their own turns**, and every push / pull / throw of his allies.
- **Bargains cost Debt** (`cor_debt`, status name "In Debt", stacks = HP owed): paid in HP at the start of **his next
  turn** (ignores Block, never below 1 HP). Debt is a cost, like AP: "Gain 2 AP. Take 6 Debt."

**Passive: Collateral Damage** — *"Bargains cost Debt, paid in HP at the start of his next turn. Every foe that dies
before then pays off 4 of it."* One rule, still the comedic core (the dead pay his tab). Implemented as his own
`onAnyDeath` hook (v1 needed a combat rule + rule chip; the engine hook exists since phase 4). Any killer, any turn:
in v2 the whole round of other turns (allies and enemies) sits between a bargain and its payment.

| id | name | AP / cd | levels (I / II / III) — desc (one verb + at most one rider) |
|---|---|---|---|
| `cor_rune_bolt` (basic) | Rune Bolt 🔮 | 1 | "Deal 4 damage. Your runes on or next to the target burst." range 4 (an *attack*: Silence can't stop it) |
| `cor_fine_print` (signature) | Read the Fine Print 📜 | 2 + 100 Hype | "Every foe is Stunned: it skips its next turn." (stun-immune foes shrug it off; wind-ups are interrupted) |
| `cor_glyph` (starter) | Glyph of Warding 🔯 | 1 / 0 | "Inscribe a rune (max 3): when a foe steps on it, foes on and next to it take 5 damage." 5 / 6 / 6 + "that foe is Rooted" (III) |
| `cor_bargain` (starter) | Dark Bargain 😈 | 0 / 2 | "Gain 2 AP. Take 6 Debt." 2 AP & 6 / 2 AP & 4 / 3 AP & 6 |
| `cor_detonate` | Runic Detonation 💥 | 1 / 1 | "All your runes burst at once, each dealing +2 damage." +2 / +3 / +4 |
| `cor_served` | You've Been Served 📨 | 1 / 2 | "Deal 3 damage to a foe in a straight line and pull it up to 3 tiles toward you." 3 & 3 / 4 & 4 / 6 & 4 (range 2-5) |
| `cor_restraining` | Restraining Order 🚫 | 1 / 2 | "Deal 2 damage to each adjacent foe and push it 2 tiles away." 2 & 2 / 3 & 2 / 4 & 3 |
| `cor_cease` | Cease & Desist ✋ | 2 / 3 → 2 / 2 → 1 / 2 | "Stun a foe: it skips its next turn." (range 5; levels = cheaper / faster; stun-immune foes are not targets) |
| `cor_sign_here` | Sign Here, Please ✍️ | 2 / 3 | "Charm a foe (not a boss): on its next turn it fights for you. Take 5 Debt." 1 turn & 5 / 1 & 3 / 2 turns & 3 |
| `cor_soul_contract` | Soul Contract 🤝 | 1 / 2 | "Give yourself or an ally 8 Block. Take 4 Debt." 8 / 11 / 14 Block, 4 Debt |
| `cor_lawyer` | Infernal Lawyer 👿 | 2 / 1 charge | "Summon an Infernal Lawyer (12 HP, flies): Billable Poke deals 3, Objection! taunts. Once per combat." 12 / 15 / 18 HP; III "It acts at once." |
| `cor_collect` | Collect Debt 💀 | 2 / 2 | "Deal 7 damage, +1 per point of your Debt (max +10)." 7 / 9 / 11 (the desc adds the live total) |

Pool 10 (2 starting) besides basic and signature; AP mix 0 / 1 / 2; one charges skill; every desc ≤ 26 words (the
suite checks it, plus no v1 wording: telegraph / intent / Guard / planning / "this round").

**Summon `cor_imp` "Infernal Lawyer"** (flies, mov 4, 2 AP, acts on Corelos' turn; names like *Habeas Corpse*, *Sue
Ifer*, *Torts McGee*): `cor_imp_poke` Billable Poke (melee 3 / 4 / 5 — also its attack of opportunity: the imp holds
the line) and `cor_imp_objection` Objection! ("Taunt a foe: on its next turn it must attack this Lawyer if it can.";
one level, cd 2 — the v2 review dropped its II/III Block rider: Block for the Lawyer comes from Soul Contract).

**Items** (all `hero: 'corelos'`, one effect each): `cor_quill` Quill of Questionable Provenance (rare weapon:
"Corelos' runes deal +2 damage." — part of the burst, so labels and descs show it and Weak / Inspired apply to the
whole amount), `cor_soul_card` Platinum Soul Card (rare trinket: "Every foe that dies pays off 7 of Corelos' Debt
(instead of 4)."), `cor_notarized` Notarized Soul (Photocopy) (legendary armor: "+6 max HP. Once per combat, instead of
going down Corelos stays up at half his max HP and takes 10 Debt." — a `preventDeath` hook, mid-fight).

**Hero**: 24 HP (+4 per level), 3 AP, move 4, **init +1**, complexity 2, colour `#9b5cff`, `unlock: null`. Sprite
unchanged (hooded indigo robe, glowing robe runes, crimson quill + contract scroll, violet rune aura). Barks 4-6 per
key, ≤ 70 chars; new nods to Betty ("do NOT eat the contract before they sign it"), Kiri ("collect your arrows. All
of them are evidence.") and Basanos ("the werewolf clause is not boilerplate"); the review added Hjalmar ("Stepping
carefully. Hjalmar was here first."), Pebbles ("fetch the soul! Good boy. Do NOT chew it.") and Valdris ("forge me a
loophole. Any size.") — no pronouns needed in any of them.

### Combos with other heroes (DESIGN §6: power from combinations)
1. **Glyph of Warding (setup)** — every push, pull, throw and swap sets runes off (v2 names, re-checked 2026-11-03):
   Marwyn's YEET, Betty's Ramming Speed! / Head Over Heels, Slate's Personal Space / Get Over Here, Ellaria's Thorn
   Whip, Syllamin's Discordant Shriek, Marbles' Walking Stick Whack, Basanos' Shoulder Check, Zarathor's Bling Lasso,
   Sparrow's Blood Puppet Show, Kiri's Banishing Shot, Valdris' Hammer of Faith, Pebbles' Big Wag, Hjalmar's Spring
   Glove and Bait and Switch (a foe swapped onto the rune Hjalmar stood on bursts: probed). **Taunts drag foes across
   runes on their own turn** (the AI never sees runes): the Lawyer's Objection! (tested), Betty's Bleat of Defiance,
   Pebbles' Bork!, Hjalmar's Whoopee Cushion. A binding rune (III) Roots the foe that stepped on it: held in place for
   Zarathor's Gold-Plated Fireball, a cleave, or Betty's Kick 'Em While They're Down (10+ to Stunned or Rooted foes).
2. **You've Been Served (setup)** — pull a foe 3-4 tiles into the frontliners' reach (pull-into-cleave), across his
   runes, or over a pit (YEET, tested). v2 + attacks of opportunity: pulls never provoke, and a foe served next to a
   melee hero is *engaged* — it sticks to that hero on its turn (walking off would cost it a free hit), so the pull
   pins it away from Corelos (tested with the fixture knight; control: without him the grunt walks up and stabs Corelos).
3. **Cease & Desist (setup / v2 counterplay)** — a Stunned foe loses its next turn: free hits for everybody (Betty's
   Kick 'Em While They're Down and the kit's Sucker Punch hit Stunned foes harder), and the way to interrupt a boss
   wind-up from range. Read the Fine Print does it to every foe at once.
4. **Runic Detonation (payoff)** — after allies herd or root foes next to his runes. Rune Bolt is the cheap version.
5. Collateral Damage — every ally kill pays his Debt; Soul Contract shields the ally the enemies will hit before that
   ally's next turn (or the Lawyer that just taunted: tested).

### v1 → v2 (what changed and why)
- **Telegraph tools converted** (migration guide §8.1): Cease & Desist (cancelled a foe's telegraphs + Weak, III
  Silence) → a plain ranged **Stun**. Read the Fine Print (cancelled every intent + 6 to every foe + all runes burst) →
  **every foe is Stunned** (one big effect; still interrupts wind-ups; "VOID!"). Sign Here (charm re-aiming
  telegraphs, boss triple price) → charm for its next turn(s), **not bosses** (a canTarget rule instead of a hidden
  boss clause). Objection! ("its attacks go for this Lawyer or fizzle") → v2 taunt wording.
- **Simplified (one verb + at most one rider)**: Glyph lost its Marks (two effects); Detonation lost the III push and
  the chain-bonus bookkeeping; You've Been Served lost III Weak; Restraining Order lost III Root; Collect Debt lost
  "a kill wipes your Debt" and the III AP refund (kills already pay Debt off via the passive); Soul Contract (a custom
  damage-absorbing status with its own Debt formula) → plain **Block** for Debt on himself or an ally; rune bursts no
  longer hit objects (fewer clauses, no barrel accidents on allies).
- **Cut**: Power of Attorney (Empowered + Inspired + AP + a status that made an ally's hits burst his runes "this
  turn" — four effects, and in v2 the ally's turn isn't "this turn"; AP / Empower buffs already exist on Syllamin,
  Buga and others). Pool 11 → 10.
- **Items**: the Quill lost its +1 rune cap (one effect: +2 rune damage); the Soul Card lost its +10 starting Hype
  (one effect: deaths pay 7); the Notarized Soul uses `preventDeath` (was an `onTakeDamage` heal).
- **No Guard / no combat-start Block**: nothing of his granted either; the only Block is Soul Contract's (a skill),
  lasting until its owner's next turn start (Objection!'s II/III Block was cut in the review).
- **Durations per own turn**: every status he applies uses `turns: 1` = the foe's next turn (Stun, Root, Charm,
  Taunt; Charm III `turns: 2`). Debt has `decay: 'never'` and is collected by its own `onTurnStart` hook.
- `stats.init: 1`, `unlock: null`, complexity 3 → 2, role / blurb unchanged (they never mentioned telegraphs).

## Public API (for tests / other content)

`DD.Corelos` = `{ RUNE_CAP, PAYOFF, CARD_PAYOFF, QUILL_BONUS, runes(ownerOrId?) → rune tiles (oldest first; all runes
without an owner), runesNear(owner, p, r), placeRune(owner, x, y, { dmg, root }) → obj|null, burst(x, y, { bonus,
trigger }) → [{ unit, dealt }], burstAll(tiles, opts) → n, debt(unit), addDebt(unit, n, src) → added, payOff(unit, n,
reason) → paid, payoffFor(unit), runeValue(ctx), debtRelief(ctx) }`.
- Rune damage carries the tags `'cor_rune'`, `'arcane'`; source = the rune's owner (kills, Hype and stats go to
  Corelos); `noHighGround`. The amount is the rune's `dmg` + Detonation's bonus + the Quill's 2, before Weak / Inspired
  / Marked / armor. Cause `'skill'` while one of his skills resolves (Empowered applies), otherwise `'other'`.
- Any content may add Debt with `DD.Corelos.addDebt` (e.g. an event "the patron calls in a favour"); only Corelos'
  own Debt is paid off by deaths (his passive), anyone's Debt is collected at its holder's turn start.
- AutoPlay hints (never shown to players): Glyph's `autoplayValue` = `runeValue` (foes next to the tile ×0.5 rune
  damage, foes that can walk over it toward the party ×0.3, +1.5 for a binding rune, capped at 1.5 × damage, 0 at the
  rune cap); the three Debt skills' `autoplayValue` = `debtRelief` (AutoPlay prices any Debt like a flat −6 debuff;
  foes at ≤ 8 HP will likely die first and pay part of it off: min(Debt, payoff × such foes, 4)).

## Deviations

- DESIGN §6 v1 brief ("cancel every enemy intent this round; detonate all runes", "Terms & Conditions (silence)",
  "enemies move during planning") is v1; the v2 kit above follows DESIGN §6 "Simplicity" and the migration guide.
- Debt is paid like an `hpCost` (direct HP loss with `FX.damage({ cost: true })`, `Act.touch`, a log line), not via
  `Act.damage`: it must be exact and never below 1 HP whatever Vulnerable or hooks say.
- Runes are **not** `hazard` objects on purpose: the AI walks right over them (the trap fantasy) and heroes' paths
  are never flagged (runes never hurt the hero side).
- The Debt status is named "In Debt" so the engine's log line reads "Corelos is In Debt (6)." (was "Corelos is Debt").

## Core fixes

None.

## Requests

- **Lead (DESIGN §6 Corelos)**: the brief still describes the v1 kit ("unlock: beat the DM", runes punishing "planning",
  "cancel every enemy intent this round", Terms & Conditions). Suggested v2 text: the table above (runes = traps for
  enemy turns and allies' pushes; Debt = bargains paid at his next turn start; Collateral Damage; signature = every foe
  Stunned).
- **Lead (`docs/notes/content-digest.md`)**: the corelos rows are v1: the pool still lists `cor_attorney` (cut in v2),
  "unlock: act 3 / the DM" (now `unlock: null`), and "Fight-wide hero rules (HUD chips): … Corelos' Collateral Damage"
  (v2: his own `onAnyDeath` passive hook, no combat rule / chip). v2 pool: `cor_glyph cor_bargain cor_detonate
  cor_served cor_restraining cor_cease cor_sign_here cor_soul_contract cor_lawyer cor_collect`.
- **INTEGRATION** (`integration: cross-content consistency`): still expects `corelos` to unlock at act 3 (and ten
  heroes, one per boss unlock); v2 has `unlock: null` for all 16 heroes (user request), so that check needs the v2 rule.
- **HERO HJALMAR** (review v2, distinctness): the Firecracker Bundle ("when a foe steps on it, every foe within 1 takes
  N fire damage") is Glyph of Warding I/II with a fire tag, and the Bear Trap (damage + Root on step) is a binding rune
  (Glyph III). Corelos had runes first (DESIGN §6 v1 brief). Two heroes sharing the same trap reads samey in one party;
  suggest giving the firecracker a different verb (e.g. a fuse that goes off at the end of the foe's turn, a line or
  cone blast, a Burn/Dazzle rider, or knockback) so "AoE burst on step + remote detonation" stays the runic sorcerer's.
  Runes and traps already coexist fine (each refuses a tile with an object; a foe swapped onto a rune by Bait and Switch
  bursts it — probed).
- **META** (`js/run/meta.js`): `ACT_UNLOCKS` still lists `corelos` for act 3 (harmless while every hero has `unlock:
  null`; noted only because DESIGN §3 says the machinery "unlocks nothing today").
- **AUTOPLAY** (optional): AutoPlay prices a self-debuff such as Debt at a flat −2 per stack up to −6 whatever its real
  cost; a status-def hint (e.g. `autoplayCost(st, unit)`) would let content price deferred costs honestly without each
  skill carrying a `debtRelief` hint.

## Tests (21 suites, ~1240 assertions, deterministic)

registry / stats / barks / sprite / items (init +1 and the rolled d20 + 1, `unlock: null`, pool 9-10, one-breath
descs, no v1 wording) · Rune Bolt (exact bursts, allies / crates safe, flyer on a rune, lethal bolt still bursts) ·
Glyph I-III (damage, binding root for its next turn, targeting, cap, AutoPlay hint) · runes on enemy turns (corridor
walk, binding rune: stops the walk, Rooted through its next turn, free the turn after; flyers; a rune kill on the
enemy's turn pays Debt before his turn; pushes, pulls across two runes, teleports yes, spawns no, allies walk freely on
their own turn) · Detonation I-III (and only his own runes) · Dark Bargain I-III + Debt (paid at HIS next turn start,
not at an ally's; cooldown rounds; never below 1; ally / own kills pay off 4, ally summons don't; victory log line) ·
Served I-III (pull next to the knight, lethal, pit YEET) · Restraining I-III (pit, lava, water, edge, lethal, nobody
adjacent) · Cease & Desist I-III (exactly one lost turn, stun-immune not a target, boss wind-up interrupted, AutoPlay
stuns the brute about to hit the cleric) · Sign Here I-III (the charmed grunt stabs its friend on its turn(s), Debt,
no bosses / charm-immune / already charmed) · Soul Contract I-III (Block covers the grunt's turn and ends at the mage's
turn start; on himself) · Infernal Lawyer I-III (acts on his turn, v2 taunt: the archer shoots the Lawyer; Objection!
only taunts and the summon desc matches its skills at every level; Soul Contract co-signs the taunting Lawyer; a taunt
drags a grunt across a rune) · Collect Debt I-III · signature (every foe skips its next turn, stun-immune foe acts,
wind-up void) · items (Notarized desc "half his max HP") · edge cases (silenced / stunned / sheep / charmed user, no AP,
not his turn, a stunned turn still collects Debt, downed clears Debt, forced null targets) · **attacks of opportunity**
(he makes none — ranged basic; walking off a grunt costs a stab; Restraining Order / Cease & Desist / Sign Here each
let him walk off for free; the Lawyer's Billable Poke reaction; Served pulls never provoke and pin a grunt on the
knight, with a no-knight control; a binding rune ends a walk that already provoked) · Debt tooltip "his" on Corelos,
"its" (no payoff clause) on anyone else · previews of every skill (exact, side-effect free, then a round of enemy
turns) · AutoPlay battles: party corelos + test_knight / test_cleric / test_mage vs every fixture normal / elite encounter of acts 1-3
at levels 1 / 3 / 5 (+ the act 3 boss), two loadouts covering the whole pool.

## Known issues

- AutoPlay plays him as "Glyph + Rune Bolt" first (≈ 1 rune per turn, ~60% of runes go off); it uses Bargain,
  Detonation, Served, Cease & Desist, Sign Here, Soul Contract, Collect Debt and the Lawyer now and then, and Restraining
  Order rarely (with attacks of opportunity it mostly just doesn't walk off foes). Sims therefore understate his control.
- Runic Detonation (and Rune Bolt's burst) need Glyph of Warding socketed: a player who replaces the starter Glyph
  leaves them without runes. The player's choice (the card says "your runes"), not a bug.
- Sign Here charms elites (only bosses are excluded): a 2-AP charm on a Death Knight or a Young Red Dragon is a big
  swing, shared with Buga's Bribe and Pebbles' charm. Elite charm guards, if wanted, are the enemy authors' call.
- At 1 HP the collectors find nothing (Debt is never collected below 1 HP), so bargains are "free" until he is healed —
  a risky state by construction (the next hit downs him) and the joke of the passive; heals before his turn start are
  collected from.
- Glyph has no cooldown: with Dark Bargain he can lay 3 runes next to one foe and Rune Bolt it (≈ 19 damage for 4 AP
  + 6 Debt at level 1). That is the intended big bargain turn; if playtests find it too swingy, give Glyph cooldown 1.
- Debt is cheap when many foes die (it is the passive working: bargain right before kills) and bites in elite / boss
  fights with few foes. Debuff immunity / cleanses also wipe Debt (an emergent "bankruptcy" combo).
- Soul Contract on an ally whose turn comes right after his is mostly wasted (v2 Block ends at its owner's next turn
  start) — the same rule as every Block skill; the target choice is the player's (AutoPlay reads the turn order).
- The balance numbers of the v1 review no longer apply (v1 kit, v1 turn model); fixture-party AutoPlay battles at
  levels 1 / 3 / 5 win 19/19 here; the v2 review's real-content fuzz (below) won 24/30. Re-measure once the enemy
  retune for "hard but fair" lands.

## Review (v2) — adversarial review of the v2 Corelos (ADVERSARIAL REVIEWER role, 2026-11-03)

Scope: `js/data/heroes/corelos.js`, `tests/content/hero_corelos.js`, this file, against DESIGN §6 "Simplicity", the
migration guide and the attacks-of-opportunity rules (`docs/notes/rules.md`). Everything below was checked by running
code (probes in `.tmp/corelos-review/`, one Chrome slot each), not by reading.

### Verified (held)
- **Suites**: the 21 `hero_corelos` suites (1236 assertions) and the 8 generic `content:` suites pass isolated, no
  console warnings from his files (the only advisories are the fixture `test_ring_of_fire` and, in a full load,
  Pebbles' `peb_bbq` — neither his). Final full `bash tools/test.sh` (784 suites, 110707 assertions ok): 30 failing
  sections, none from his files and no `hero_*` failure — bosses_act1 18, boss_dm 7, integration 2 (v1 unlock
  expectations incl. "corelos: unlock condition — expected {act:3}", and the XP-less Objective Failed step),
  bosses_act2 2, ui 1 (16 hero cards clip names at 1600×900 / 1920×1080). An earlier full run that same evening also
  showed the Rat King's `WIND_TURNS is not defined` planner error (bosses-act1, mid-flight; gone in the final run).
- **desc == effect at every level**: dumped every desc at every level (pool, basic, signature, both imp skills,
  passive, items, Debt) and compared with `levels` / `execute`; previews exact and side-effect free (existing suite).
  Every skill is one verb + at most one rider, ≤ 26 words; II = bigger numbers, III = bigger numbers or one rider
  (Glyph III Root, Sign Here III a second turn, Lawyer III acts at once) — after fix 1 below.
- **Attacks of opportunity**: Rune Bolt is `'ranged'` → `opportunitySlot(corelos) === null` (he never reacts); walking
  off an adjacent grunt provokes a 4-damage stab; Restraining Order, Cease & Desist and Sign Here each let him walk off
  for free (pushed away / stunned / charmed foes don't strike); the Lawyer reacts with Billable Poke ("Barrister
  Brimstone gets an attack of opportunity on Test Grunt"); pulls (You've Been Served) never provoke, and a grunt served
  next to the knight sticks to the knight on its turn (control: without him it walks up and stabs Corelos); a binding
  rune still ends a walk that already provoked (stab 5, burst 6, Rooted, stops on the rune). No user-side effects on
  his reacting skill (the imp's poke), so nothing needs a `ctx.opportunity` guard.
- **v2 turn semantics** (existing suites + probes): Debt at HIS next turn start (not an ally's), also on a stunned turn;
  every status he applies = the foe's next turn; Block until its owner's next turn start; the Lawyer acts on his turn,
  also on the slot of a downed Corelos; a downed Corelos' runes still go off (damage and kill credit his).
- **Real content** (`fuzz.js`, 30 AutoPlay fights: random parties of the other 15 heroes, random encounters of every
  act incl. Dr. Iris and the DM, levels 1-5, random loadouts / items): 24 won, 6 lost, 0 timeouts, sane states, no
  swallowed errors; 16 rune bursts, 70 HP of Debt paid vs 75 paid off by deaths, 5 attacks of opportunity on him, 1 by
  the Lawyer. Combos with the newest heroes probed: Hjalmar's Bait and Switch swaps a foe onto the rune he stood on
  (it bursts); a taunt drags a grunt across a rune (now a test).
- **Leftovers**: no intents / telegraphs / Guard / combat-start Block / XP in code or text; `stats.init: 1`;
  `unlock: null`; he/him everywhere (after fix 2); barks name allies without pronouns.
- **Looks** (`g1.png`, `v1.png` + crop, `v2.png` + chip crop, `c1.png`): gallery poses / statuses / portraits fine;
  plain runes (violet circle + sigil) and the binding rune (green dashed chain ring) read clearly on a cellar floor next
  to goblins; the Debt chip (💸 6) and "Corelos is In Debt (6)." render; the Lawyer appears under him in the party
  panel ("acts in 3"); the deployment skill bar shows his cards.

### Fixed (most severe first; each with assertions in `tests/content/hero_corelos.js`)
1. **Objection! had a hidden, level-II rider.** The Lawyer's taunt gained Block at II / III (0 → 3 → 5): a new rider
   at level II ("II = bigger numbers") that the Infernal Lawyer's own desc ("Objection! taunts") never mentioned, so
   the summon's text was not exact at II / III. Now Objection! is one verb at every level (taunt; single level like the
   corgi's bark), and Block for the Lawyer comes from a combination: Soul Contract co-signs it (tested: the taunted
   archer's arrow only scratches the 8 Block). The Lawyer suite asserts the summon desc matches its skills per level.
2. **The Debt tooltip called Corelos "it"** ("paid at the start of its next turn"). Now "his" on Corelos (and in the
   codex), "its" — without the payoff clause, which only his own Debt has — on anyone else content puts in Debt.
3. **Notarized Soul desc** "stays up with half his HP" (half of what — he is at 0) → "stays up at half his max HP"
   (exact: `round(maxHp × 0.5)`).
4. **Tests**: new suite "attacks of opportunity: he makes none, walks off foes with his tools, the Lawyer and the pull
   hold the line" (22 assertions); the Lawyer suite gained the co-sign and taunt-drag combos; asserts for fixes 1-3.
5. **Barks**: nods to the three newest heroes (Hjalmar on `move`, Pebbles on `kill`, Valdris on `lowhp`), pronoun-free.

### Left as is (judgement calls, see Known issues)
- Glyph of Warding has no cooldown (the 3-rune cap is the brake; the big bargain turn is the fantasy).
- Read the Fine Print stuns every foe for 2 AP + 100 Hype: a signature-sized "free round"; bosses' stun guards still
  apply and it still interrupts wind-ups.
- Cease & Desist's desc is the same at every level (levels change only AP / cooldown, shown on the card).
- Glyph III says "that foe is Rooted" without "through its next turn" (tested as exactly its next turn; the house uses
  both phrasings and the longer one would push the desc to 29 words).
- "everything you planned is void" stays in the signature's banner / flavor (flavor, not mechanics).
- Distinctness vs Hjalmar's traps → request above (HERO HJALMAR).

### Hero-lens verdict
- *Simple?* Yes: every skill is one verb + at most one rider and reads in one breath.
- *Combos?* Glyph (setup for every push / pull / swap / taunt in the party), You've Been Served (pull into a cleave or
  onto a melee hero: pinned), Cease & Desist / the signature (Stunned for Kick 'Em / Sucker Punch, boss wind-ups);
  Runic Detonation and Rune Bolt are the payoffs; Soul Contract shields whoever (or whatever) draws the hits.
- *Passive?* One rule, still the joke: bargains cost Debt paid in HP at his next turn; every foe that dies first pays
  off 4 ("the dead pay his tab").
- *The user's character?* "A runic sorcerer with a propensity for making dark bargains": runes (Glyph, Detonation, Rune
  Bolt), bargains (Dark Bargain, Sign Here, Soul Contract, Collect Debt + the passive), the rest legal paperwork.
- *Attacks of opportunity?* A ranged caster: he makes none, has three ways to leave a melee foe without being hit, and
  his Lawyer is a little melee bodyguard that holds the line.
- *Distinct?* Yes, apart from the trap overlap with Hjalmar's Firecracker Bundle / Bear Trap (request).

## Requests (Nov 3) — barrels, flyers (CONTENT SWEEP heroes-1, 2026-11-04)

Suite: `hero_corelos: v2 requests: …`. Rules: `docs/notes/rules.md` "v2 requests".

- **Barrels.** Rune Bolt (basic), You've Been Served and the imp's Billable Poke can be aimed at a volatile object (kept:
  his ranged basic is his barrel tool). On a barrel the riders don't happen: Rune Bolt's "your runes on or next to the
  target burst" is skipped (a rune beside the barrel stays; tested), Served pulls nothing. The (flying) imp poking a
  barrel is in the blast: flight is no shelter from an explosion.
- **Flyers.** Runes are ground objects: the engine never sets one off under a flyer (walk, push, teleport); `runeValue`
  already skipped flyers. Tested: a flyer shoved across a rune by Restraining Order leaves it armed, a walker sets it off.
- **Heals.** None (Soul Contract is Block).
