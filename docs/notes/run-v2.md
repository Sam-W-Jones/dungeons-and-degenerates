# RUN V2 — leveling without XP (notes)

Role files: `js/run/{run,rewards,runmap,meta,passives}.js`, `js/ui/screens/{rewards,levelup,party,map,tavern,event,hall}.js`
(and the parts of `js/ui/ui.js` / `css/style.css` they use), `tests/{run,ui,passive}_tests.js`, ARCHITECTURE §4.6 / §9.
Run: `bash tools/test.sh "suite=run:,ui:,passives:"`.

User request (v2): *"levelling up is far too quick. One character should level up after each combat (with rotations so
they all reach 2 before 1 goes to 3 - randomize who gets it?)"*. Spec: DESIGN §3 "Leveling is slow and shared", §5.

## Summary

- **No XP.** RunHeroes have no `xp`; `DD.Rewards` has no XP table / combat XP; nothing on screen says "XP".
- **One level-up per won fight** (normal, elite, boss — the act boss too, before the act clears — and event fights).
  The count is one constant, `DD.Rewards.LEVEL_UPS_PER_WIN = 1`, read through `DD.Rewards.levelUpsFor(kind)`, which
  `DD.Balance.leveling.perWin` (a number, or `{ normal, elite, boss }`) overrides for the balance phase. A lost protect
  objective ("Objective Failed"), a TPK and treasure nodes give none.
- **The rotation** (`DD.Run.levelUpCandidates` / `rotationLevelUp`): the hero is drawn with the run RNG among the
  living heroes with the **lowest** level below 10 — a dN for N candidates, one `rng().next()` draw, no draw when only
  one hero is behind. Every hero reaches level N before anyone reaches N+1; the living party never spans more than one
  level (tested after every fight of whole simulated runs). Dead heroes are skipped; a downed-but-revived hero counts.
- **The level-up itself is unchanged**: HP growth at once, one pending boon (learn / upgrade / perk, `pendingLevels`)
  and one Blessing roll, resolved on the existing level-up screen — now usually for the one hero the DM picked.
- **Events**: `api.levelUp(idx?)` (each call = one level-up: that hero, else the rotation). XP-era calls stay as
  aliases: `api.xp(n)` / `DD.Run.grantXp(n)` = one rotation level-up, `api.xp(n, idx)` / `DD.Run.grantHeroXp(idx, n)` =
  that hero; while an event choice resolves they level up **at most once in total** (a module-level gate set in
  `resolveChoice`, plus a per-`eventApi()` gate for stand-alone resolves), so old content that calls them freely gives
  exactly one level. The built-in fallback event's "Help him improvise." now levels one hero and names them.
- **Recruits** join at `DD.Run.recruitLevel(slot)`: the lowest level among the living heroes who stay (else the replaced
  hero's level), auto-built with their Blessings rolled for every level (headless policy), nothing pending.
- **Teacher's Pet** (`runMods.xp`): a hero's weight in the rotation draw is `DD.Passives.xpMult(rh)` = 1 + xp (1 for
  everyone without it). It only tilts the dN among the lowest; it never lets a hero jump the rotation (tested).
- **Saves**: same save version. Loading drops `xp` from RunHeroes and `xp` / `xpByHero` / `levelsGained` from a pending
  rewards step (`levelUps: []` filled in), keeps levels and pending boons; `stats.levelUps` is filled in. Uneven XP-era
  levels even out by themselves (the rotation always levels the lowest).
- **UI**:
  - Rewards: the XP stat and per-hero XP bars are gone. A level-up block announces the fight's level-up as a DM
    moment — "The DM rolls a d4 for the level-up… **3! Marwyn levels up!** Level 2 → 3" — with a die per candidate count
    (d4 triangle, d3 "(They exist. He has one. Do not ask.)", a gold coin "Heads!/Tails!", no roll when one hero is
    behind), a short quip, the party lineup (candidates wear their die face, the winner glows, heroes ahead are dimmed)
    and "🎲 Next level-up: random among …". The die tumbles ~0.85 s (cosmetic `DD.rng`; click lands it; instant when
    headless / `DD.FX.instant` / after the pick). Lost objectives say nobody levels up; a party at 10 gets a nod.
  - Map sidebar: `UI.heroMini(…, { levelHint: true })` shows "Lv 2 🎲" on heroes in the running (only while not
    everyone is), a "🎲 Next level-up: …" line under the party, hero tooltips state the hero's place in the rotation.
  - Party: the XP bar is replaced by a rotation line under the HP bar ("🎲 In the running for the next level-up (the DM
    rolls among 2)." / "🎲 Next level-up: random among Ellaria and Josiah." / "Max level (10)…"), tabs show 🎲; the
    "Starting Block" stat row is gone (v2: nobody starts a fight with Block).
  - Run bar (event / shop / tavern screens): a 🎲 badge on heroes in the running; tooltips say so.
  - Tavern: recruits "join at level N (the lowest level of the heroes who stay)".
  - Event: level-up chips ("✨ Syllamin levels up to 2 (+3 max HP)"), XP chips removed, the growth no longer shows as a
    separate "+3 HP" chip, and the run bar re-renders after a choice.
  - Map node tooltips (`UI.NODE_TYPES`, `DD.RunMap.TYPES`): fights say "one hero levels up".
  - Party sheet: an **Initiative** stat (v2): `DD.Run.heroStats()` now reports `init` = the def's `stats.init` + items /
    scars / perks / Blessings — the same sum ENGINE V2's `DD.Combat` falls back to, and which it uses when the run layer
    reports it (`heroInit`). It reads 0 for every hero until the hero content adds `stats.init` (DESIGN §5: −2..+4).
  - `UI.xpBar` / `UI.xpProgress` removed; `UI.xpForLevel` is a deprecated shim only for `js/main.js` (see Requests).

## Public API (new / changed)

**DD.Run**: `heroStats()` also returns `init` (initiative modifier). `levelUp(heroIdx?, { src }) → LevelUp | null`
(named hero, or the rotation with idx omitted),
`grantLevelUps(n, src) → [LevelUp]`, `levelUpCandidates() → [heroIdx]`, `nextLevelUp() → { candidates, ids, names, level,
maxed }`, `levelUpsPerWin(kind)`, `LEVEL_UPS_PER_WIN` (getter), `recruitLevel(replaceIdx)`. Compat: `grantXp(n) →
[heroIdx]` (one rotation level-up per call, `opts.half` ignored), `grantHeroXp(idx, n) → 0 | 1`. Removed: `xpInfo`,
`xpGain`. `stats.levelUps` counts every level gained.
`LevelUp = { heroIdx, heroId, name, from, to, src: 'fight'|'event'|'named'|'debug', rotation, die (N; 0 = named), face
(1..N), candidates: [heroIdx], candidateIds }`.
Rewards data: `levelUps: [LevelUp]` (this step's), `leveled` (every pending boon); no `xp` / `xpByHero` / `levelsGained`.

**DD.Rewards**: `LEVEL_UPS_PER_WIN`, `levelUpsFor(kind)`; `combat()` returns `{ gold, levelUpCount, choices }`. Removed:
`xpTable`, `COMBAT_XP`, `xpForLevel`, `levelForXp`, `xpProgress`, `combatXp`.

**Event API**: `api.levelUp(idx?) → LevelUp | null`; `api.xp(n, idx?) → [heroIdx]` (alias, once per choice).

**DD.Passives**: `xpMult(rh)` unchanged in value, now the rotation weight.

**DD.UI**: `nextLevelUp() → { candidates, names, level, maxed, all, text }`, `isNextLevelUp(idx)`, `levelMark(idx)` (🎲
marker: in the running while somebody is not), `levelLine(rh, idx)`, `andList(names)`; `heroMini(rh, idx, { levelHint })`.
CSS: `.rw-level`, `.rwl-*` (row, die, top, lead, next, result, lv, quip, lineup, hero, facebadge, none), `.side-next`,
`.sheet-next(.in-running)`, `.hm-next`, `.hero-mini.next-level`, `.rb-next`, `.rb-hero.next-level`; `.xpbar`, `.rw-xp`,
`.rw-hero`, `.rwh-*`, `.lvl-up-badge`, `.rw-stat.xp` removed.

## Deviations

1. **Named level-ups jump the rotation.** DESIGN §3 allows "(or to a named hero)"; `levelUp(idx)` / `api.levelUp(idx)` /
   `grantHeroXp(idx, n)` level that hero even when others are behind, so hero-specific events can leave the party two
   levels apart until the rotation catches up. The "≤ 1 level apart" invariant is guaranteed for fights, rotation
   event level-ups and recruits.
2. **XP aliases are capped per choice**, not per call: the task said "api.xp(n) = one rotation level-up per resolve";
   the gate covers `api.xp`, `grantXp` and `grantHeroXp` together inside one event choice (explicit `api.levelUp`
   calls are not capped).
3. **`runMods.xp` became a rotation weight** (the Blessing's text still says XP — see Requests).
4. Rewards' own count is `DD.Rewards.combat().levelUpCount` (not `levelUps`) so it is never confused with the
   `levelUps` records of a rewards step.
5. The party sheet no longer shows a "Starting Block" stat (`heroStats().block` is still computed; ENGINE V2 owns
   whether anything uses it).

## Requests

- **Narrative** (`js/data/events.js`, `js/data/narrator.js`, `tests/content/narrative.js`):
  - Hints and outcomes still promise XP: "Every hero gains N XP" (`api.xp(n)` → now *one* hero levels up through the
    rotation), "Zarathor gains 15 XP" / Marbles / Marwyn / Josiah (`heroXp` → `DD.Run.grantHeroXp` → that hero levels
    up), `CONSOLATION_XP` ("they take 15 XP instead" → they level up instead). Suggest `api.levelUp()` /
    `api.levelUp(idx)` and naming the hero from the returned record (`lv.name`), e.g. hint "One hero levels up (the DM
    rolls among the lowest-level heroes)."
  - `narrator.js` tip "Heroes who end a fight downed only get half XP." is false now (suggest: "After every win the DM
    rolls to see who levels up — the lowest level always goes first."); victory line "The DM grudgingly hands out
    experience points." could become a level-up joke.
  - `tests/content/narrative.js` reads `h.xp` (NaN now): ~840 event assertions and the tips' half-XP checks fail until
    they compare levels instead.
- **Table author** (`js/data/passives.js`): `rp_teachers_pet` "You gain +X% XP." — `runMods.xp` now weighs the hero ×(1 +
  xp) in the level-up roll among the lowest-level heroes; suggested desc: "When the DM rolls who levels up, your odds
  among the lowest-level heroes are ×1.1 / ×1.15 / ×1.25." (or a redesign; any `runMods.xp` keeps working).
- **`js/main.js` owner (lead / META-UI)**: `Main.debugRewards` still grants `rw.xp` (gone) — use
  `DD.Run.grantLevelUps(rw.levelUpCount, 'debug')` and put the records in `data.levelUps` so `screen=rewards` shows the
  d4 moment; `screen=levelup` can call `DD.Run.levelUp()` instead of the `UI.xpForLevel` / `grantXp` dance;
  `DDdbg.xp(n)` → a `DDdbg.levelUp` that levels (help text too); `Main.makeRunHero`'s fallback `xp` field. Then the
  deprecated `UI.xpForLevel` can go.
- **Balance** (`js/data/balance.js`): `xp` and `objectiveFailed.xpMult` are unused now; add `leveling: { perWin: 1 }`
  if the count should live with the other knobs (`DD.Rewards.levelUpsFor` reads it, per kind allowed).
- **Lead (DESIGN)**: §3 Tavern still says recruits join "at party average level" (built: the lowest level, per the
  Leveling bullet); §7.1 lists "XP" among run-layer effects.
- **Integrator** (`tests/content/integration.js`): the "Objective Failed" check `d.xp === 0` should become
  `d.levelUps.length === 0`.
- **Items**: Mithril Shirt "4 Block at the start of combat" (`stats.block`) and any start-of-combat Block hooks contradict
  v2 ("nobody starts a fight with Block"); the party sheet no longer advertises a Starting Block stat.

## Tests

- `tests/run_tests.js` (30 suites): new — the rotation (lowest first, random among them, named heroes, max level, the
  dead, compat aliases); seeded + fair over 400 runs (each hero ~25% first, never the same hero twice while others are
  behind) + the Balance override; every won fight kind levels one hero, lost objectives / treasure / TPK none; recruits
  join at the lowest level and the rotation stays fair through deaths and recruits; XP-era saves load cleanly (and the
  uneven levels catch up); events (`api.levelUp`, aliases once per choice, named, the fallback event). Whole simulated
  3-act runs now check after **every** fight: exactly one level-up (and `stats.levelUps` +1), the chosen hero was among
  the lowest, every other lowest hero was a candidate, max − min ≤ 1; the d4 lands on every face over the runs; act-1
  bosses are fought around level 2 (logged: [2,2,3,3] … act 2 ≈ 4). Updated: finishCombat, loot tables, tavern, save /
  load, event API, UI-mode stub flow, real-engine integration (each won real fight levels exactly one hero).
- `tests/ui_tests.js` (24 suites): new DOM flows — the rewards screen's d4 moment (face, winner, badges, "next" line,
  no "XP" anywhere) → Continue → that hero's roll + boon only → map markers; three more fights (d3, coin, no roll) until
  everyone is level 2; map / party / tavern / run bar hints, a recruit through the tavern DOM joins at the lowest level;
  an event level-up chip; an XP-era rewards screen resumed without XP. Two HUD suites were made independent of the
  engine's turn order (the right-click test now starts the grunt in range and rolls initiative / selects the hero;
  "Continue after Quit" ends round 1 with `endRound` when the engine has it and accepts round 0 for a fresh fight).
- `tests/passive_tests.js` (16 suites): level-ups through `DD.Run.levelUp`; runMods.xp tested as the rotation weight
  (900 draws ≈ 1.5/4.5, never jumps the rotation); the real-table AutoPlay audit counts won fights (Session Zero + one
  roll per win) instead of assuming full slots — with ENGINE V2 in place those runs end in act 1.
- Results at the end of this pass: `suite=run:,ui:,passives:` PASS (70 suites). Full run: see the report (failures are
  other areas: the engine / HUD / AutoPlay / content suites that assume side-based turns, telegraphs, Guard and XP).

## Known issues

- `screen=rewards` (main.js debug data) shows no level-up block until main.js builds `levelUps` (Requests).
- Event texts still promise XP (Requests); the mechanics behave as described above.
- Named level-ups from hero events can leave the party two levels apart for a while (Deviation 1).
- The rewards screen is a little taller than before; with three long loot cards it still fits at 1280×720 and
  1366×768 (checked with real content, `.tmp/runv2/shots/`); the panel scrolls on smaller screens as before.
