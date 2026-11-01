# HERO: Corelos, the Undersigned (Runic Sorcerer) — notes

Files: `js/data/heroes/corelos.js` (content), `tests/content/hero_corelos.js` (20 suites `hero_corelos: …`).
Run: `bash tools/test.sh "suite=hero_corelos&isolate=heroes/corelos,hero_corelos"` (generic checks:
`bash tools/test.sh "suite=content:&isolate=heroes/corelos,hero_corelos"`).
Scratch (not shipped): `.tmp/corelos/` — `run.sh` + `probe.html?probe=<file>` (probe pages with the fixtures loaded,
one Chrome slot), `ap.js` / `ap2.js` / `ap3.js` (AutoPlay traces), `*_v1.*` (the v1 files this pass started from),
`g.png` (gallery), `c1.png` / `c2.png` (autoplayed fights with runes on the board).

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
Ifer*, *Torts McGee*): `cor_imp_poke` Billable Poke (melee 3 / 4 / 5) and `cor_imp_objection` Objection! ("Taunt a
foe: on its next turn it must attack this Lawyer if it can." II/III: + 3 / 5 Block; cd 2).

**Items** (all `hero: 'corelos'`, one effect each): `cor_quill` Quill of Questionable Provenance (rare weapon:
"Corelos' runes deal +2 damage." — part of the burst, so labels and descs show it and Weak / Inspired apply to the
whole amount), `cor_soul_card` Platinum Soul Card (rare trinket: "Every foe that dies pays off 7 of Corelos' Debt
(instead of 4)."), `cor_notarized` Notarized Soul (Photocopy) (legendary armor: "+6 max HP. Once per combat, instead of
going down Corelos stays up with half his HP and takes 10 Debt." — a `preventDeath` hook, mid-fight).

**Hero**: 24 HP (+4 per level), 3 AP, move 4, **init +1**, complexity 2, colour `#9b5cff`, `unlock: null`. Sprite
unchanged (hooded indigo robe, glowing robe runes, crimson quill + contract scroll, violet rune aura). Barks 4-6 per
key, ≤ 70 chars; new nods to Betty ("do NOT eat the contract before they sign it"), Kiri ("collect your arrows. All
of them are evidence.") and Basanos ("the werewolf clause is not boilerplate") — no pronouns needed in any of them.

### Combos with other heroes (DESIGN §6: power from combinations)
1. **Glyph of Warding (setup)** — every push, pull and throw sets runes off: Marwyn's Yeet, Betty's Ram, Slate's Hurl,
   Ellaria's Thorn Whip, Syllamin's Shriek, Marbles' Whack, Basanos' Shoulder Check. A binding rune (III) Roots the
   foe that stepped on it: held in place for Zarathor's Fireball or a cleave.
2. **You've Been Served (setup)** — pull a foe 3-4 tiles into the frontliners' reach (pull-into-cleave), across his
   runes, or over a pit (YEET, tested).
3. **Cease & Desist (setup / v2 counterplay)** — a Stunned foe loses its next turn: free hits for everybody, and the
   way to interrupt a boss wind-up from range.
4. **Runic Detonation (payoff)** — after allies herd or root foes next to his runes. Rune Bolt is the cheap version.
5. Collateral Damage — every ally kill pays his Debt; Soul Contract shields the ally the enemies will hit before her turn.

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
- **No Guard / no combat-start Block**: nothing of his granted either; the only Block is Soul Contract's (a skill) and
  Objection!'s (a skill), both lasting until their owner's next turn start.
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
- **META** (`js/run/meta.js`): `ACT_UNLOCKS` still lists `corelos` for act 3 (harmless while every hero has `unlock:
  null`; noted only because DESIGN §3 says the machinery "unlocks nothing today").
- **AUTOPLAY** (optional): AutoPlay prices a self-debuff such as Debt at a flat −2 per stack up to −6 whatever its real
  cost; a status-def hint (e.g. `autoplayCost(st, unit)`) would let content price deferred costs honestly without each
  skill carrying a `debtRelief` hint.

## Tests (20 suites, ~1200 assertions, deterministic)

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
turn start; on himself) · Infernal Lawyer I-III (acts on his turn, v2 taunt: the archer shoots the Lawyer) · Collect
Debt I-III · signature (every foe skips its next turn, stun-immune foe acts, wind-up void) · items · edge cases
(silenced / stunned / sheep / charmed user, no AP, not his turn, a stunned turn still collects Debt, downed clears
Debt, forced null targets) · previews of every skill (exact, side-effect free, then a round of enemy turns) · AutoPlay
battles: party corelos + test_knight / test_cleric / test_mage vs every fixture normal / elite encounter of acts 1-3
at levels 1 / 3 / 5 (+ the act 3 boss), two loadouts covering the whole pool.

## Known issues

- AutoPlay plays him as "Glyph + Rune Bolt" first (≈ 1 rune per turn, ~60% of runes go off); it uses Bargain,
  Detonation, Served, Cease & Desist, Sign Here, Soul Contract, Collect Debt and the Lawyer now and then, and Restraining
  Order rarely (it prefers walking away from melee). Sims therefore understate his control.
- Glyph has no cooldown: with Dark Bargain he can lay 3 runes next to one foe and Rune Bolt it (≈ 19 damage for 4 AP
  + 6 Debt at level 1). That is the intended big bargain turn; if playtests find it too swingy, give Glyph cooldown 1.
- Debt is cheap when many foes die (it is the passive working: bargain right before kills) and bites in elite / boss
  fights with few foes. Debuff immunity / cleanses also wipe Debt (an emergent "bankruptcy" combo).
- Soul Contract on an ally whose turn comes right after his is mostly wasted (v2 Block ends at its owner's next turn
  start) — the same rule as every Block skill; the target choice is the player's (AutoPlay reads the turn order).
- The balance numbers of the v1 review no longer apply (v1 kit, v1 turn model); fixture-party AutoPlay battles at
  levels 1 / 3 / 5 win 19/19 here. Re-measure with real content once the other heroes and enemies are converted.
