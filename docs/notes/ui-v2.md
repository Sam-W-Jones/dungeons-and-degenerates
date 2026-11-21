# UI v2 — notes (UI role: double triggers, 16 heroes, attacks of opportunity in the HUD, debug screens, HUD review)

Role files: `js/ui/combat_hud.js`, `js/ui/ui.js`, `js/ui/screens/party_select.js`, `js/ui/screens/hall.js`,
`css/style.css`, `js/main.js`, `tests/hud_tests.js`, `tests/ui_tests.js`, this file.
Built on ENGINE V2 + the ENGINE AoO role (`docs/notes/rules.md` "v2 — attacks of opportunity"), HUD v2
(`docs/notes/hud-v2.md`, history) and RUN v2 (`docs/notes/run-v2.md`).
Run: `bash tools/test.sh "suite=hud:,ui:"` (57 suites). Scratch harness (one Chrome at a time, slot-aware):
`.tmp/uiv2/probe.sh "<query>"` (DOM probes, `probe=space|frames|recruit|show`), `.tmp/uiv2/shot.sh "<query>&scene=…"`
(HUD scenes: deploy · roll · hero · aoo · enemy · threat · inspect · boss · tracker), `.tmp/uiv2/shots/`.

## Summary

### 1. A key that skips an animation never also acts (the bug + an audit of every Space / Enter / click path)

**The bug** (reproduced on the real page, `.tmp/uiv2/probe.js` `probe=space`): the Space that skipped the initiative
dice tray did not end the turn by itself — but the press right after it did, ~150 ms later, before anything on screen
said the turn had started. The guard window (380 ms) only started when the HUD's own loop noticed that playback had
ended (`settle()`); the renderer ends the FX first, and in between (one HUD frame; a 100 ms timer in background tabs /
headless) `doEndTurn` saw "FX idle, no grace" and ended the first hero's turn. Fixes (`combat_hud.js`):
- `doEndTurn`: a turn the HUD has not handed over on screen yet (`M.turnPending` / `M.enemyPlayback`) is handed over
  first (`refresh()` → `settle()` starts the guard) — so it can never be ended by the same burst of input.
- Every skip (dice moment by key / click, AI or own animations by Space, `skipAnimations`) opens a 420 ms input guard
  of its own (`holdAfterSkip`); `settle` now extends the guard instead of overwriting it. The end-of-fight ribbon's
  Space / Enter hand-off respects it too (the press that skipped the last animations does not also skip the victory).
- `skipAnimations` flushes with the dice moment unhosted (`M.flushing`): a flush starts every queued marker once, and
  used to pop the tray up for that instant.
- HUD buttons never take keyboard focus (`mousedown` → `preventDefault` on any HUD button), and the combat screen
  consumes **Enter** (confirm the armed skill, else nothing): a focused button can't be activated by Space / Enter.
- `ui.js`: a screen or modal that just appeared swallows Space / Enter and trusted clicks for 320 ms
  (`UI.inShowGuard()`, real input only): Enter that skipped the victory ribbon can't also press the rewards screen's
  Continue (hotkey Enter), a double click on a map node / Continue / Menu can't land on the next screen's cards or a
  modal's backdrop (backdrop mousedown is guarded too), and the combat board ignores tile clicks in that window.

Audit (every path that skips or acts on Space / Enter / click in my files):

| input | while | does | guard |
|---|---|---|---|
| Space / Enter / Esc / click tray | dice moment | skips it | consumed; 420 ms hold; End Turn hands over first |
| Space | own / AI animations | skips them | 420 ms hold; settle extends 380 ms; turn handed over before any end |
| Space | hero turn | ends it | not before the HUD showed the turn + 380 ms; not within 420 ms of a skip |
| Space | deployment | rolls initiative (or skips intro FX first) | same |
| Space / Enter | end-of-fight ribbon | hands off now | not within the skip hold |
| click End Turn | any | as Space (disabled during AI turns) | same; never keeps focus |
| Space / click / Enter / Esc | ≤ 260 ms after a press rolled initiative or ended a turn | nothing (a double tap can't flush the dice moment or the enemy turn it started) | act hold (review) |
| Enter / Space / click | ≤ 320 ms after the Blessing roll lands | nothing (no Keep on an unread Blessing) | `noteShown` in `land()` (review) |
| Enter | combat | fires the armed skill at the hovered target | consumed always; never a focused button |
| key repeat | anywhere in combat | nothing | `e.repeat` ignored (Enter added) |
| any Space / Enter | ≤ 320 ms after a screen / modal shows | nothing | `UI.inShowGuard` |
| click (trusted) | ≤ 320 ms after a screen / modal shows | nothing | capture listener; modal backdrops; board clicks |

### 2. Sixteen heroes, all available (no lock UI)
- `UI.HERO_ORDER`: the original ten, then `kiri, betty, basanos, valdris, hjalmar, pebbles`.
- Party select: the 4 × 4 roster already fit; verified with real content at 1024×640, 1280×720, 1600×900, 1920×1080
  (cards contain everything, no cut text, the roster never scrolls, Start is on screen). The lock branches stay for a
  def with an `unlock` condition (none today); the Roll tooltip no longer says "unlocked heroes".
- Hall of Fame → Heroes: the lock grid became **the roster**: 16 compact horizontal cards (portrait, name, race / class,
  role, and the hero's record from the run history: "2 campaigns · 👑 1 · 💀 34 · best Lv 6 · ⚰️ 1", or "Never played.
  Yet."), a DM line counting who has played; all sixteen fit without scrolling at the four sizes. Records: "Heroes
  unlocked" → "Heroes who braved a campaign".
- The tavern's "Who joins?" pick (`UI.choice` with the 12 heroes outside the party) scrolled at 1024–1600 px: long
  choice lists (7+ options) now use four compact columns (`.choice-list.many`, a wider modal) — no scrolling at the four
  sizes.

### 3. Attacks of opportunity in the HUD (DESIGN §4.2, rules.md "Attacks of opportunity")
- **Move preview** (hover a reachable tile): from the engine's fewest-provoke path (`Combat.reachable(u)` entries'
  `provokes`, details `Combat.provokes(u, x, y)`): the hint leads with "⚔ **Provokes 2** attacks of opportunity:
  **Goblin Grunt 6 · Rat 2** (up to 8) — 💀 enough to drop X. Can't be undone. Skill dashes, pushes and teleports never
  provoke."; the path turns red (`overlay.pathHazard`), the mover wears the hit ("-8 ⚔", lethal skull) and every
  attacker a "⚔" badge (`overlay.previews`). With threat shading on, its hint starts with "⚔ Provokes N on the way: …".
  Next to a foe whose attack of opportunity is spent this round: "✓ Goblin Grunt already used its attack of
  opportunity this round: no free hit."
- **Party cards**: "⚔ Engaged: Goblin Grunt 6" / "⚔ Engaged: 3 foes, up to 14" (red when lethal) for every hero next
  to foes that would punish a move (`DD.AI.engaged`, `DD.AI.opportunityDmg`); the card tooltip lists them.
- **Inspect**: heroes — "⚔ Engaged — a move away provokes: Goblin Grunt 6 (Pointy Stick), …", spent neighbours, and
  "🛡 Holds the line: a foe walking away from Marwyn takes a free Greataxe (once per round)" (or "No melee basic attack:
  foes can walk away from Zarathor freely"); enemies — "⚔ Holds the line: walking away from it provokes Pointy Stick
  (≈6 to Marwyn), once per round" / "— already used this round" / "No melee attack ready: walking away from it is free"
  / "Never makes attacks of opportunity" / "None while incapacitated".
- **When one happens**: the engine's log line is marked (`.log-line.aoo`: ⚔️, gold border; in step with playback), and
  the first one of a fight explains the rule in the hint bar ("⚔ Attack of opportunity! Walking away from X gave it a
  free hit on Y. Skill dashes, pushes and teleports never provoke." / "… Melee heroes hold the line."). The engine's
  "⚔️ Attack of opportunity!" floating text is the FX.
- **Undo** after a provoking move: the tooltip and Z say "That move provoked an attack of opportunity: the hit happened,
  so it can't be undone."

### 4. `js/main.js` debug screens (v2 leveling, RUN's request)
- `screen=rewards`: `Main.debugRewards` grants the fight's level-up through the rotation (`DD.Run.grantLevelUps(
  DD.Rewards.combat().levelUpCount, 'debug')`) and puts the records in `data.levelUps` (+ `leveled` from
  `DD.Run.levelQueueFull`), no XP fields: the rewards screen shows the DM's d4 moment ("1! Zarathor levels up!").
- `screen=levelup`: one level-up (`Main.debugLevelUp(P.hero)`: the rotation, or `&hero=<party index>`) then the real
  flow. `DDdbg.levelUp(i?)` levels (named or rotation) and opens it; `DDdbg.xp()` is an alias of one rotation level-up;
  help text updated. The deprecated `UI.xpForLevel` shim (and its XP table) is gone from `ui.js`.

### 5. The v2 combat HUD through a first-time player's eyes (headless shots, `.tmp/uiv2/shots/c_*.png`)
Deployment, the dice tray, hero turns (new heroes), an enemy turn mid-animation, threat shading on a small and on a big
boss map, Grimble's Audit wind-up, the AoO preview at 1024×640 and 1280×720. Fixed in my files:
- **The dice tray spoiled itself**: party cards said "#7 in the order", their init badges and End Turn's "Next: Pebbles"
  revealed the order while the dice were still tumbling → "🎲 Rolling…", no badges, End Turn "🎲 Rolling…".
- **End Turn during AI turns** showed a stale "Next: …" → "⏩ Space skips".
- **Enemies hidden behind the objective panel** (the back corner of most boards sits under it; a spider and a critic
  were invisible in the Web of Lies) → the panel fades to 32% and lets clicks through while a unit or the hovered tile
  is under it (`updateObjPeek`, ~3× a second and on hover).
- "Goblin Grunt 6, …, Slingshot Kid 5 **+1**" read like damage → "(+1 more)".
- "acts in 6" (seconds? rounds?) → "acts in 6 turns" / "✓ Acted · in 7 turns".
Not in my files (Requests): threat shading is nearly invisible on warm floors; lock wording left on other screens.

## Public API (new / changed)
- `DD.HUD.realInput(on)` (tests: the real-input guard windows headless too), `DD.HUD.graceLeft()` (ms of input guard),
  `DD.HUD.objPeek()` (re-check the objective fade → bool). `select`, `endTurn`, `key` unchanged.
- `DD.UI.inShowGuard()` → true while a just-shown screen / modal (or a Blessing roll that just landed) swallows Space / Enter /
  clicks (never headless unless `DD.UI.realInput(true)`, review). `DD.HUD.realInput(false)` also clears the act hold.
- `UI.choice` with 7+ options → `.choice-list.many` (four compact columns). `UI.xpForLevel` removed.
- `DD.Main.debugLevelUp(idx?)`; `DDdbg.levelUp(i?)`; debug URL `screen=levelup&hero=<i>`.
- CSS: `.hc-engaged(.lethal)`, `.hi-line.aoo(.own|.spent)`, `.hud-log .log-line.aoo`, `.hud-obj.peek`,
  `.hall-roster`, `.hh-text`, `.hh-rec`, `.hh-card.fresh|.played`, `.choice-list.many`.

## Deviations
- A deliberate second Space ~0.4 s after a skip still ends the turn (it is a separate press, and Space = End Turn):
  the guard covers the same press, key repeat and a double tap, not a later decision.
- Space in deployment while the intro animations play skips them first (as before); the roll needs a second press.
- The provoking walk reuses existing overlay channels (`pathHazard` = red path + ⚠ glyph, `previews` badges) instead
  of a dedicated renderer style (Request).
- "Engaged" lines are for heroes (cards + inspect); summons show it in their inspect panel only via the hint / preview.
- `UI.inShowGuard` also applies after a modal opens (level-up roll → boon modal, confirms): 320 ms is shorter than any
  deliberate read-and-click.

## Requests
- **RENDER-WORLD** (`js/render/renderer.js`):
  - **DONE (polish, Nov 5: dot texture + stronger wash + dark-backed outline, render-world.md).** Threat shading is nearly invisible on warm floors (Grimble's wood + red carpet, `.tmp/uiv2/shots/c_boss_threat.png`):
    `threatFill` uses `rgba(255,96,36, 0.13 + 0.3k)` + an orange outline. Suggest a higher floor (≈0.22 + 0.4k), a dark
    contrasting outline or a light diagonal hatch on every threatened tile, so "can they reach me?" reads on any floor.
  - Optional: a dedicated look for a provoking walk (e.g. `overlay.pathProvokes: [{ x, y, unitId }]` → crossed swords
    on the tiles where a hit lands) and a mark on provoking move tiles (`moveTiles[i].provokes`) — the HUD would fill
    them from `Combat.reachable` entries.
  - **DONE (polish, Nov 5: 16 seats).** The title campfire's `HERO_ORDER` (renderer.js ~3504) lists nine old heroes; use `DD.UI.HERO_ORDER` (16).
- **META-UI** (`js/ui/screens/gameover.js`, `settings.js`): v2 has no locks, but the game-over screen shows "Heroes
  unlocked: 16 / 16" + a lock-progress portrait row + "🔒 Next: …"; Settings offers "I'm the DM's Favorite — Unlock
  every hero right now" and "Delete unlocks, …". Suggest dropping the unlock block (or showing the party's records) and
  hiding the toggle while no hero def has an `unlock` condition.
- **RUN** (`js/ui/screens/tavern.js`): "Nobody new is drinking here tonight. Unlock more heroes!" and "with an unlocked
  hero" / "No unlocked heroes outside the party." — lock wording in v2.
- **Lead**: ARCHITECTURE §8.3 keys — the combat screen consumes Enter; skips open a short input guard; §8.1 add
  `inShowGuard()`, `choice` long lists; §10.1 `screen=levelup&hero=<i>`, `DDdbg.levelUp`; `UI.xpForLevel` is gone.
  `docs/notes/hud-v2.md` (history) still says "acts in N".
- **NARRATIVE** (optional): an `opportunity` narration key; the HUD's first-AoO teaching hint is fixed text today.
- (review) **ENGINE** (`combat.js` `provokes`): mark entries whose strike can end the walk (a stun / root / push / pull
  rider, or `Act.stopMove`) with `stops: true`. The HUD would then warn "its hit can end the walk there". Today the
  preview can't tell that the walk may stop short.
- (review) **META-UI** (`settings.js` controls list): "Space: End turn · skip animations" should be "Roll initiative ·
  end turn · skip animations", as in the HUD menu.
- (review) **Lead**: ARCHITECTURE §8.3. A press that rolls initiative or ends a turn can't also skip the animation it
  started (260 ms act hold). `DD.UI.realInput(on)` is a test hook.

## Tests
- `tests/hud_tests.js` (+4 suites, 3 extended; 29 suites):
  - "a key that skips an animation never also acts": real `KeyboardEvent`s through `UI.onKeyDown` on a rolled fight
    with animated FX — Space skips the moment and does **not** end the first hero's turn; a second Space / Enter / End
    Turn click right after (playback over, HUD loop not yet run: the bug's race) does nothing; the HUD then hands the
    turn over; HUD buttons refuse focus; a deliberate Space after the guard ends it; Space skipping AI animations +
    a quick second Space keep the next hero's turn. Mutation-checked: without both fixes 5 assertions fail.
  - "a screen or modal that just appeared ignores Space / Enter" (stubbed guard: swallowed, then the default button).
  - "attacks of opportunity": "⚔ Provokes 1" hint, red path, "-N ⚔" on the mover = `Combat.provokes` damage, ⚔ on the
    attacker, threat-shading hint, engaged card line (and none for the mage), inspect lines (hero engaged + holds the
    line, grunt holds the line ≈ on the selected hero, archer makes none), the walk takes exactly the previewed hit,
    the marked log line, the teaching hint, Undo refusal text, spent reaction → card line gone + "already used" hint
    and panel line, the knight's own attack of opportunity on a fleeing grunt (logged, marked).
  - "the objective panel fades and lets clicks through while a unit stands under it".
  - extended: dice moment (no spoilers: cards "Rolling…", no init badges, End Turn sub), AI playback (End Turn says
    "Space skips"), threat shading ("(+1 more)" with four reachers).
- `tests/ui_tests.js` (+4 suites; 28 suites): 16 heroes in `HERO_ORDER` / party select / hall roster (order, names,
  roles, no lock UI, Records wording); the hall roster's records from a history; **the real page in iframes of exactly
  1024×640, 1280×720, 1600×900 and 1920×1080** (party select cards, hall roster without scrolling, the tavern's
  12-recruit pick without scrolling — every descendant inside its card, no cut text); `js/main.js` in a frame —
  `screen=rewards` has one LevelUp record, no XP fields, the block names the hero; `DDdbg.levelUp(3)` levels Pebbles;
  `screen=levelup` levels exactly one hero.
- Results at the end of this pass: `suite=hud:,ui:` PASS (57 suites). Full `tools/test.sh`: 788 suites, 21 failing
  sections, none in `hud:` / `ui:` and no swallowed errors — all in files other areas own and are converting:
  `bosses_act1` ×18 (v1 tests calling the removed `DD.AI.plan`), `hero_syllamin` previews (Encore! finds no target in the
  preview arena), `integration` ×2 (v1 unlock conditions / "ten real heroes" / "no XP" expectations).

## Review (v2)

Adversarial review of this pass. I ran it on the real game page with a slot-aware scratch harness
(`.tmp/uirev/probe.sh` / `shot.sh`, `probe=space|enter|proll|aoo|aoowalk|enemyshot|showtab|scars`) and read the shots.

**Confirmed working.** The original bug is fixed: the Space that skips the dice tray never ends the first hero's turn. I
fired real `KeyboardEvent`s every 40 ms after the skip, and none acted until the guard ran out about 460 ms later.
- All 16 heroes fit party select, the hall roster and the 12-hero recruit pick at 1024×640 and 1920×1080 (party select)
  and at 1024×640 and 1600×900 (hall). That includes a hall where every hero has a long record line.
- The 7+ option compact layout also works for a non-recruit list (eight scars with descriptions at 1024×640).
- The move preview's attack-of-opportunity numbers match the engine on real content: Goblin Grunt preview −8, the walk
  took −8. Dire-ish Rat preview −2, the walk took −3. The extra 1 is the bite's Bleed ticking when the walk ends, which
  is now shown (below).

**Fixed (most severe first)**
1. **A double tap on Roll / End Turn skipped what it had just started.** Reproduced on the real page: Space to roll
   initiative, then a second Space 80 or 250 ms later (or a double click on the button). The second press saw "FX
   busy, no moment yet" and flushed everything: the dice moment never appeared, and neither did the first enemy turn.
   An End Turn double tap skipped the enemy turn it had just started in the same way. Now a press that rolls initiative
   or ends a turn opens a 260 ms act hold (`holdAfterAct`, `ACT_HOLD_MS`). Inside it, Space, End Turn, the tray / scrim
   click and Enter / Esc on the moment do nothing. A deliberate skip after that still works.
2. **Blessing roll modal: Enter, Enter kept a Blessing nobody had read.** The first Enter skipped the d100 (the default
   button is Skip). A second Enter 90 ms later hit the new default button, Keep it, and the modal closed with
   `keep`. Now `land()` re-arms the show guard (`noteShown()`), so Space, Enter and clicks within 320 ms of the result
   appearing are swallowed. `UI.realInput(on)` lets tests apply the guard headless, like `DD.HUD.realInput`.
3. **Inspect said "⚔ Holds the line" for foes that can't strike.** A Dazzled or Confused AI unit never makes an attack
   of opportunity, and a taunted one only strikes its taunter (`DD.Act.opportunityOf`). The panel now says "No attacks
   of opportunity while Dazzled: walking away from it is free", or "(taunted: only X provokes it)" without the ≈ estimate
   on someone else.
4. **Threat-shading hint ignored the walk's own hit for "💀 enough to drop".** Example: a walk that provokes 8 to a tile
   enemies can hit for 10, with 15 HP. The 💀 now counts the provoke, and the hint names it ("… with the walk's 8").
5. **Bleeding movers.** The move preview now adds "🩸 Bleeding N: this move costs N HP when it ends", with 💀 when that
   plus the free hits would drop the hero. Before, the preview's number was short by the Bleed (rat bite and walk).
6. **Hall roster.** A hero who was written out and replaced by a recruit is missing from the run summary's final party.
   Their only trace is `summary.fallen`, so they showed "Never played. Yet." They now count as a campaign with ⚰️ and no
   crown. A hero listed as dead in a won campaign no longer gets the 👑. When all 16 have played, the DM line no
   longer says "The rest are 'still making their character'".

**Tests added / extended (mutation-checked).** With `actHeld()` stubbed to false, five `hud:` assertions fail. With
`land()`'s `noteShown()` removed, the new `ui:` suite fails.
- `hud: a key that skips an animation never also acts`: a second Space and a second click right after the roll flush
  nothing, the moment still plays, and a Space inside the hold doesn't skip it. An End Turn double tap keeps the
  grunt's turn on screen.
- `hud: attacks of opportunity`: Bleeding move line. Threat hint "💀 … with the walk's N" at an HP where reach alone
  isn't lethal. Dazzled grunt: no "holds the line", and the engine agrees nothing is provoked. Grunt taunted by the
  mage: "only … provokes it", no ≈ on the knight, and the engine agrees.
- `ui: review — the Enter that skips the Blessing roll (or a quick second one) never also keeps the Blessing` (new).
- `ui: v2 — the hall roster shows each hero's record`: fallen-only hero, "4 of 16", and the all-played DM line.

**Not fixed / for others**
- An attack of opportunity whose rider stuns, roots or pushes ends the walk early. The preview can't say so because
  `Combat.provokes` entries carry no "stops the walk" flag. Request ENGINE: add `stops: true` to those entries and the
  HUD will append "its hit can end the walk there".
- Settings' controls list (`settings.js`, META-UI) still says "Space: End turn · skip animations". It should also say
  "roll initiative".
- The party card's "⚔ Engaged: Goblin Grunt 8" uses the same "name number" format as the threat hint. The tooltip,
  inspect panel ("≈8 to Marwyn") and the board badge ("−8 ⚔") spell it out.
- Engaged lines stay hero-only. Summon cards rely on the move preview.
- A transient hint, such as the first attack of opportunity's teaching line, hides the move preview text for 2.6 s.
  This is the existing HINT_MS behaviour.

## Known issues
- ~~Threat shading visibility on warm floors~~ (fixed in the polish pass, Nov 5).
- The objective fade reads unit screen boxes (same estimate as the DM caption's placement), ~3× a second.
- Long enemy / boss inspect panels scroll (the new "holds the line" line adds one row); the abilities come last.
- `.tmp/uiv2/probe.js` is scratch (not shipped); its `frames` probe is the quickest way to re-check the four sizes.

## v2 user requests — barrels you can shoot, heals that get a downed ally up, flyers over the floor (UI role)

User (verbatim): "Allow detonation of barrels by targetting them" · "Allow targetting o fheals on downed characters to heal
and bring them up" · "Flying characters ignore floor effects" (+ "we really need a rotate map ability": the highlights and
previews below follow the view). Engine rules: `docs/notes/rules.md` "v2 requests". Files: `js/ui/combat_hud.js`,
`js/ui/ui.js`, `css/style.css`, `tests/hud_tests.js`, plus surgical overlay additions in `js/render/renderer.js`.
Run: `bash tools/test.sh "suite=hud: v2 requests"` (5 suites). Scratch scenes: `.tmp/uireq/shot.sh
"debug=1&scene=barrel|downed|flyer[&hover=barrel|down|x,y][&rot=30]" <out.png>` (+ `.tmp/uireq/crop.ps1`, no Chrome).

### What the player sees
- **Barrels (any volatile object).** Arm an attack that can aim at objects (`DD.Targeting.aimsAtObjects`): the barrel's
  tile gets the normal target diamond **and a pulsing 💥 marker above the object** (visible behind units and tall
  props, at any yaw). The aim hint offers it: "Click an enemy or 💥 the Explosive Barrel (range 1–4)". Hovering it
  previews the blast exactly: the blast tiles are the area, every unit in it wears its damage badge (💀 when lethal), and
  the hint reads "💥 Detonate: Explosive Barrel — 8 fire damage within 1 tile · Hits 2 foes for 14 · ⚠ hits Marwyn! ·
  +4 Hype" (chain explosions: "+ 1 chain explosion"; a melee whack in its own blast: "⚠ Slate is in the blast: −7").
  A click fires through the normal `useSkill` / `useConsumable` path. Inspecting a volatile object: "💥 Volatile: aim a
  single-target attack at it (in range and line of sight) and it goes off (— or Smash it from next to it). Its blast
  catches everyone around it, friends included." plus, with an attack armed, "🎯 Click: Eldritch Bling sets it off — 8
  fire damage within 1 tile." / "· X can't set it off." / "· X can't reach it from here." Clicking a barrel with a
  skill that opts out: "Chain Zap can't set off the Explosive Barrel: aim a single-target attack at it." The Smash
  button on a volatile object warns that Smash is done from right next to it.
- **Downed allies and heals.** Arm a heal that revives (`DD.Targeting.revivesWith`): the downed ally is a target, its
  "DOWNED" label turns green with a pulsing 💚 (instead of 🆘), the aim hint offers "or 🆘 downed Marwyn (back UP)".
  Hover: a green **"UP! 7 HP"** badge (uncertain heals: "? UP! 5–7 HP 60%") and the hint "🆘 UP! Marwyn gets back up
  with 7 HP (0 AP now; acts next)" (or "acts in 3 turns (next round)" when the slot passed); not counted as a plain heal.
  The downed hero's **card** says "💚 Heal back up (2)" when the acting unit has a ready heal that reaches (else "🆘
  Down: heal or Help Up"); its **tooltip**: "a single-target heal aimed at Marwyn gets Marwyn back up with the healed HP;
  an adjacent ally can also Help Up (2 AP) at 25% HP" + "💚 Ready now: Mostly Medicine (2)". Its inspect panel: "🎯
  Click: Mostly Medicine gets Marwyn back up — UP! 7 HP (…)" while aiming, else "🆘 Downed: skipped until revived. Press
  2 (Mostly Medicine), then click Marwyn: back UP with the healed HP. Or Help Up (2 AP) from an adjacent tile." The same
  line answers a click on a downed ally (card or board) that is not next to the acting hero; a buff aimed at one explains
  "Marwyn is down and Pep Talk won't get Marwyn up: only a single-target heal does (or Help Up…)". Help Up's button
  tooltip mentions heals too.
- **Skill / consumable tooltips** (`DD.UI.skillTooltipHtml`, `consumableTooltipHtml`: the HUD bar, level-ups, shops):
  "💥 Can also be aimed at an explosive barrel (anything volatile) in range to set it off: the blast happens instead of
  its usual effect." and "🆘 Aimed at a downed ally, it gets that ally back up with the healed HP." (`DD.UI.aimNotes`).
- **Flyers.** The engine's per-unit hazards already drop the floor warnings from the move preview (no red path, no
  "The path crosses Fire", no "Next to a drop"). The HUD adds the inspect-panel and card-tooltip line "🪽 Flying: ignores
  floor effects — lava, fire, puddles, traps and pressure plates. Clouds and gases still reach Syllamin." (enemies and
  summons: "it"; the 🪽 Flying pill has it as its title; status flight counts via `DD.Grid.isFlying`). A tile's panel,
  with a flyer selected: "🪽 Syllamin flies over this floor: none of it applies." and, on a cloud, "☁️ Steam hangs in the
  air: it reaches flyers too." Roster / codex tooltips (`UI.heroTooltipHtml`, `UI.enemyTooltipHtml`) show the same line
  for flying defs (`DD.UI.flyLine(who)`).
- **Rotation.** Everything above is tile- or unit-anchored: the target diamonds, blast area, 💥 marker, 💚 and the UP!
  badge are drawn by the renderer at the live view, so they follow Q / R, the buttons and a middle drag (checked at yaw
  30 and 200 in shots and in a suite). No input or view-cluster code changed.

### Public API (new / changed)
- `DD.HUD.unitTip(unitOrId)` (the card tooltip HTML), `DD.HUD.reviveOptions(unitOrId)` → `[{ name, key }]` (the selected
  unit's ready heals that would get that downed ally up now).
- `DD.UI.aimNotes(def, unit?)` → lines; `DD.UI.flyLine(who?)`.
- Overlay contract (HUD writes, renderer reads): `overlay.objTargets: [{ x, y }]` (volatile objects the armed attack can
  set off: 💥 marker), `overlay.reviveTargets: [unitId]` (downed allies the armed heal gets up: green label + 💚),
  `overlay.previews[id].revive: true` (green badge; `text` "UP! N HP", `heal` 0). Empty / absent → nothing drawn.
- CSS: `.hc-when.revive|.down`, `.hi-line.boom|.revive|.fly` (HUD-injected), `.tt-target.tt-aimnote` (style.css).

### Renderer additions (`js/render/renderer.js`, surgical; nothing changes while the new fields are empty)
- `defaultOverlay` / `buildOverlay`: `objTargets` (a tile set or null), `reviveIds` (or null).
- `measureBadge`: `prev.revive` → a green badge (`#1f9d55`).
- Downed widget: a revive target gets a green "DOWNED" and a pulsing 💚 instead of 🆘.
- After the object HP bars: a pulsing 💥 marker (dark disc, gold ring, pointer) above each object in `objTargets`,
  larger on the hovered one and lifted over a damaged object's HP bar; placed with `w2s` from the object's frame
  centre, so it follows the view.

### Deviations
- **The blast numbers ("8 fire damage within 1 tile") come from watching `DD.Act.explode` while the HUD previews a use
  aimed at a volatile object** (`watchBlasts` in combat_hud.js): every call goes through unchanged, the first call per
  tile records `{ x, y, radius, dmg, element }` with explode's defaults (1, 8, fire), and the original is put back in
  `finally` (a suite asserts it). The engine preview carries only the blast tiles. Request ENGINE below.
- Move mode keeps its click rules: a click on an adjacent downed ally still does Help Up (the explicit interaction); a
  heal is aimed by arming it first. A card / board click on a downed ally that is not adjacent explains both ways.
- (Fixed in the polish pass, Nov 5: both are in the badge-stack layout now.) The 💥 marker and the UP! badge were not part of the badge-stack layout, so the marker can overlap a neighbour's HP pill
  in a crowd (it is drawn last, so it stays readable).

### Requests
- **ENGINE** (`actions.js` / `targeting.js`): record each explosion's options in the dry run (`Act._sim.explosions:
  [{ x, y, radius, dmg, element }]` next to `blasts`) and return them on the preview (`p.explosions`). The HUD already
  prefers `p.explosions` and would then drop its `DD.Act.explode` watch.
- **party_select.js owner**: `FLAG_LABEL.flying` still says "Ignores height, pits, liquids and terrain cost." Add "and
  every floor effect (lava, fire, traps, plates); clouds still reach it" (or use `DD.UI.flyLine()`).
- **NARRATIVE** (optional): `hero_down` lines such as "An adjacent friend can Help Up for 2 AP." could also mention aiming
  a heal at the downed hero.
- **LEAD (docs)**: ARCHITECTURE §8.3 (HUD): barrel targets (💥 marker, blast hint, inspect lines), downed-heal targets
  ("UP! N HP", cards, tooltips), flyer lines; §7.2 overlay contract: `objTargets`, `reviveTargets`,
  `previews[id].revive`; §8.1: `DD.UI.aimNotes`, `DD.UI.flyLine`; README tips: "aim any attack at an explosive barrel to
  set it off; aim a heal at a downed ally to get them up".

### Tests (`tests/hud_tests.js`, 5 new suites, all through DD.HUD = the mouse / keyboard paths)
- "attacks aimed at an explosive barrel": target + `objTargets`, a plain barrel is none, the aim hint, hover = the engine
  preview (blast tiles as the area, each unit's badge = its preview damage), "Detonate: Explosive Barrel — 8 fire damage
  within 1 tile" and "⚠ hits Sir Testsalot!", `DD.Act.explode` restored, the inspect lines; a non-basic spell does not
  aim at it and says why; the click detonates it with exactly the previewed damage for 1 AP.
- "a heal aimed at a downed ally": card "Heal back up (2)", `reviveOptions`, the card tooltip, the click-on-him hint, a
  buff that can't revive (no target, and why), the heal's revive target + `reviveTargets`, the green "UP! N HP" badge =
  the engine preview, the hint ("acts next"), the inspect line; the click revives him with the previewed HP for 1 AP and
  he acts next.
- "skill and consumable tooltips say what else they can be aimed at" (basic spell yes, non-basic spell no, kind attack
  yes without a unit, single heal yes, area heal no, Test Potion neither, Red Drink when loaded).
- "flyers": a flying unit's path over fire is not flagged and the hint warns of nothing; the fire tile's flyer line; a
  cloud still counts; inspect / card tooltip "Flying: ignores floor effects" (not on the walker); Syllamin's roster
  tooltip; the walker is still warned.
- "the barrel marker, the blast area and the UP! badge follow the map rotation (yaw 0, 30, 200)": `renderTo` with and
  without each overlay field; the pixel diff's box must sit right above / centred on the barrel or the downed hero at
  each yaw. Mutation-checked: a marker placed from the yaw-0 projection fails at 30 and 200 and passes at 0.

### Known issues
- Tooltips still don't show up in `tools/shot.sh` captures; their text is covered by the suites.
- At diagonal views the fitted board's back row can sit under the faded objective panel, and an UP! badge lifted out of a
  crowd can reach it (the panel fades so it shows through; the existing fit request in render-world.md).
- `.tmp/rot/run.sh ident.html` (yaw-0 A/B): 0 px on boss_dm, boss_rat_king and the title. boss_lichtenstein and
  boss_grimble differ because their content objects now paint with `g.faces` (the content-boxes sweep), which HEAD's
  renderer copy in `.tmp/rot/base/` lacks ("Error in object draw lich_shelf: g.faces is not a function" in the base
  run). My renderer additions draw nothing without the new overlay fields.

## Rules run (Nov 6-10) — breaking objects in tooltips (HUD / RENDER role)

- `UI.aimNotes(def, unit, level)` adds "🔨 Can also hit a breakable object in range (crates, totems…) for N damage; it
  breaks at 0 HP." when the skill aims at objects and `DD.Targeting.objectDamage(unit, def at level) > 0` (the
  skill-tooltip passes its level, so an upgraded skill shows its upgraded number). The HUD side: `docs/notes/hud-v2.md`
  "Rules run"; suite `hud: rules run — breaking: what it does …; tooltips offer it`.

## Playtest fixes (Nov 12) — fix:ui

Full table, requests and deviations: docs/notes/hud-v2.md "Playtest fixes (Nov 12)". UI-side changes:
- ui.js: UI.CONTROLS (one controls list for Settings + the in-combat menu), UI.partyLines (bark lines that name only party
  members), UI.bossWithTitle, UI.fightDmgMult + skillInfo.fightMult (a monster's skill text at the fight's damage factor,
  DD.AI.fightLevel when present), rangeLabel 'Anywhere' (range ≥ 30), areaLabel drops size-0 circles / squares / crosses,
  UI.DIFFICULTIES descs read DD.Balance (getters), UI.flyLine(who, loot), the forget picker's note + `forgetWarning`, the
  Blessing roll's Discard tooltip without "they", Elite node blurb.
- Screens: gameover (pronoun-free epitaphs, seeded, no repeats), levelup + tavern (party-filtered barks; "so X learned
  humility"), party ("Replace X at a tavern"), party_select (🎲 Init box), map (boss + title join), rewards (the "Next
  level-up" line and chip tooltips wait for the die), settings (shared controls), title (Settings blurb).
- css: scrolling panels draw their rivets as their own background (`.panel.scroll`, the inspect panel), `.rwl-next` hidden
  until `.landed`, the forget-picker warning, five stat boxes on the party-select card.
- Re-check after the restart (Nov 12 ~20:15): the Blessing roll's Discard tooltip still said "keeps the Blessings they
  have" (now "keeps every Blessing as it is", asserted); gameover's TPK stats read "Downs before the wipe" / "Heroes lost
  before the wipe" (first-hour-3: those counters never include the wipe); `UI.consumableDesc(d, user)` + `opts.user` on
  consumableTooltipHtml / consumableCard (heroes-v1, fix:content's request in hero-kiri.md); the rewards screen uses it.
- Suites: `ui: playtest …` (6) in tests/ui_tests.js.

## Review (playtest fixes, Nov 12 ~20:45) — REVIEWER role

- robustness-4 / text-tone-4 leftover: the act-clear unlock banner said "Recruit them at a tavern or pick them in your
  next campaign." under one named hero. Now "Now on the menu at every tavern, and in the lineup for your next campaign."
  Asserted in `ui: playtest robustness-4 / …` (the victory screen with an unlock).

## Finish (Nov 14) — fix:ui

Full table, tests and requests: docs/notes/hud-v2.md "Finish (Nov 14)". UI-side changes:
- ui.js: `UI.aimNotes` asks `DD.Targeting.aimsAtObjects` at the tooltip's level, and the 🔨 line says "for N damage and
  nothing else" (D1 / D4); brutal's fallback desc now matches DD.Balance (15% / 5%, the balance audit's request).
- title.js: the telegraph quip names "the bosses and a few show-off elites" (text-tone-17 leftover); the screen def
  exposes `taglines` for tests.
- README: Slate's swap rule (D2). ARCHITECTURE §8.1 (`aimNotes`, `flyLine(who, loot)`) and §8.3 (object and swap texts).
- Suite: `ui: finish text-tone-17 / balance audit`.

## Review (finish) — REVIEWER (Nov 14)

Full table, probes, docs-truth list and requests: docs/notes/hud-v2.md "Review (finish)". UI-side:
- title.js: the telegraph quip is one line again ("Nobody telegraphs. Bosses and a few elites wind up. You still stand in
  it."): the finish run's 101-character version wrapped at both shot sizes and made the rotating tagline jump.
- ARCHITECTURE §8.1 now lists `CONTROLS`, `partyLines`, `bossWithTitle`, `consumableDesc`, `chooseSkillSlot`
  (`forgetWarning`); §8.3 the adjacent-ally click in one sentence and the ✖ on a refused swap.
- Suite: `ui: review (finish) — every title quip fits one line; ARCHITECTURE §3.7 / §7.5 / §8.1 / §8.3 …`.

## V3 — act IV "Under the Table" and the 17th hero (META-UI, Nov 14-15)

Plan `.tmp/v3/design.md` §2.1-2.6, §4.10, §4.12, §8.4 (META-UI); the goats' door and codex from
`.tmp/v3/addendum-goats.md` §17.7; Benedick's lists from `.tmp/v3/addendum-benedick.md` §17. Ships dark: nothing here
shows until a run reaches act IV (`DD.finalAct() === 4`) or the spoiler gate `seen.bosses.svammiel` is open. Every count
is read from the run or the registry (`map.lanes.length`, `summary.gauntletLanes`, `UI.heroIds()`), never a literal.
(A first attempt at this role was cut off on Nov 14; its edits were reviewed, kept and finished here.)

### What the player sees
- **Svammiel's floor** (`map.js renderGauntlet`, `map.shape === 'gauntlet'`): blue graph paper, red ink, table legs, a
  coffee ring, horns on the party token, a smug Svammiel doodle ("mine.") over the floor boss and the DM in the margin
  ("help"). Columns = the map's rows, every node on one of T lane tracks (T = lanes, at least the widest stop row): a
  lane's doors share its track, so the labels (the encounter's `shortName`, two lines at most) sit between tracks and
  never meet a node. Node size and label width follow the board (container units) and `--g-cols` / `--g-tracks`, so
  L = 0..6 fits; `fitGauntlet` keeps the nodes under the narration box and lifts them until the bottom labels clear the
  legend. Only travelled and open links are drawn (plus a dotted "leads on" stub). Doors show the mini-boss portrait
  (the first `objective.bossIds` def: the goats' door is Billy Bleatz, the bear stays a surprise), the encounter icon
  (🕷️ 🦹 🔭 🫖 🐐) and the shortName; a beaten lane is greyed out on every row ("✓ Beaten"; the fought door
  "✓ <shortName>"). Door tooltip: the full name (the League's 72 characters wrap: the wrap is the joke), the teaser
  (V §5.1; the goats': "🐐 The Rapping Goats — three goats, one mic, a verse about each of you. (feat. ???)"), 🧭 the
  `gauntlet.hint`, the node text, the state. The legend lists Mini-boss / Event / Shop / Tavern / Floor Boss, only on a
  gauntlet map (P15). Act banner and cartouche: "Act IV — Under the Table" + `act_intro_4`; `UI.ACTS[4].sub` is
  count-free.
- **The Twist panel** (`gameover.js twistPanel`: the `victory` screen with `twist: true`, passed by `rewards.js finish`
  from `actClear.twist`): V §4.3's steps on a timeline — the act-3 clear and the DM yielding, the crack and vignette (and
  `svam_sting` off the debug pages), the typed **YOU THOUGHT THIS WAS OVER?**, his portrait rising, **I, SVAMMIEL,
  CONTROL ALL.** (both halves split from `svam_twist[0]`, the user's line), the cast card (SVAMMIEL · The Floor Boss ·
  Dungeon Master of Dungeon Masters, then every lane of the run's map as a chip, the goats' "(feat. ???)"), his
  `svam_twist_panel` line (😈 badge), the DM's `act_clear_twist` line, the heal "(Svammiel allowed it. Healthy players
  last longer.)", **Descend to Act IV** (Enter) and "Next: Under the Table — Svammiel's floor. Five mini-bosses in any
  order, then him." (the number word from the lanes). A click or Space completes every step; a second press descends.
  Headless and static captures mount it fully drawn. No confetti.
- **The four-act victory**: "The Campaign Is Over (For Real This Time)", a `victory_title` line, `campaign_won` (the
  DM), then a `victory_final` line with Svammiel's 😈 badge; the stat grid adds "Floor bosses N / M" and "The order:"
  lane icons → 😈. A v2 summary (no `acts`) keeps the classic screen and the DM's "Fine. FINE." line.
- **Game over in act IV**: the killer by shortName; the floor boss by his unit's name plus " (he cheated)" (`UI.killerOf`
  reads `summary.killedByEncounter`'s `finale`); "😈 Floor bosses beaten: N / M (names)"; the stat grid's floor bosses.
- **Hall** (behind the gate): records "Campaigns won (of which classic: N)", "The DM defeated" (`stats.dmDefeated`),
  "Floor bosses beaten" (`stats.miniBosses`); history "Act IV · N / M floor bosses" (M: that run's `gauntletLanes`) with
  the lanes' icons, "Won (classic, 3 acts)" for a 3-act win, "Fell in Act IV to Svammiel (he cheated)". The codex's Act
  IV group: a sub-group per lane in gauntlet order (its units, act-4 enemies sharing their id prefix, a content
  module's `CODEX` export, breakable objects, anything flagged `codex: true`), then "The Floor Boss — Svammiel", then
  "Also Under the Table" for strays. Before the gate act-4 defs are out of every group, "Miscellaneous Horrors" and every
  count. The goats' group: "The Rapping Goats (Herd Mentality, feat. Ursa Verse)", 8 entries (4 units + `DD.Goats.CODEX`).
- **Settings** (behind the gate, P15): "Svammiel's cameos": Full / Short / Log only (`DD.Meta.CAMEO_SETTINGS`), saved
  in `settings.cameos`.
- **Title**: "Now with a fourth act. Allegedly." joins the taglines and `tips_act4` the loading tips (weighted by pool
  size), both only after the gate.
- **Shop and tavern under the table**: "Ye Olde Overpriced Shoppe (Under New Management)", the DM (Demoted) at the
  counter in a paper hat, the Bribe as a fourth counter service (refusal texts: an unspent bribe, no door left); with
  four services the column tightens and Party goes icon-only (title "Party & Loadout (P)") so Leave Shop fits 1024 px.
  The tavern: a wall-to-wall rug and the sign "NO DEMONS PAST THE RUG" ("He can't cheat on carpet. Fine print.").
- **The 17th hero**: `'benedick'` appended to `UI.HERO_ORDER`; party select switches to a 5-column grid below 1280 px and
  6 columns from 1280 px once the registry outgrows a 4 × 4 grid (`.ps-roster.many`); the Hall roster keeps 4 columns
  (17 and 18 fit at every size). He shows from the start; nothing of him names act IV.
- **Debug params** (`js/main.js`): `acts=3|4`; `act=4` (alias `start=4`, the sims' name) through `DD.Run.startAtAct(4,
  { gear: 'auto', beaten, level?, gold?, noShow })`; `beaten=a,b`; `twist=1` (`screen=victory`: the Twist panel;
  `screen=combat&encounter=boss_dm`: the entrance via `DD.Cameo.fire('victory')`); `final=1` (act 4: every lane sealed);
  `screen=gameover` in act 4 (killed by the floor boss); `cameo=full|short|log|0` (0 → `DD.Balance.cameo.off = 1`);
  `bosshp=<0..1>` (applied on `combat:ready`); two additions: `gate=1` (the spoiler gate open in memory) and
  `screen=hall&tab=<tab>`. `DDdbg.act(n, beaten?)` fast-forwards from the console.

### Public API (new / changed)
- `DD.UI.ACTS[4]`, `DD.UI.NODE_TYPES.miniboss`, `DD.UI.HERO_ORDER` (+ `'benedick'`).
- `DD.UI.narration(text, { cls, speaker })`: `speaker` = a cameo actor id → its badge (😈) and colour.
- `DD.UI.narrate` filters `DD.defs.narration[DD.narrationKey(key)]` (the act variant's pool; the wave-0 request).
- `DD.UI.act4Seen()` (the gate), `DD.UI.inGauntlet(run?)`, `DD.UI.laneInfo(lane | laneId | encounterId)` → `{ id,
  encounterId, icon, name, shortName, hint, teaser, castNote, portrait, finale, codex: { title, note } }`,
  `DD.UI.gauntletLanes(run?)` (the run's map, else the registry's), `DD.UI.laneShort(lane)`,
  `DD.UI.encounterUnitIds(enc)`, `DD.UI.killerOf(summary)` → `{ name, cheated, pronoun }`, `DD.UI.cheatedText(k)`,
  `DD.UI.floorCounts(run | summary)` → `{ n, m, order }`, `DD.UI.numberWord(n)`.
- `victory` screen params: `twist: true` (+ `act`, `nextAct`, `healed`, `text`) → the Twist panel.
- Read by the Hall codex: a content module's `DD.<Module>.CODEX = { group, entries: [{ id, name, icon, text }] }`.

### Deviations
- The Hall codex also reads a content module's `CODEX` export (any `DD.<Module>.CODEX` with `entries`), besides
  `codex: true` flags and breakable objects: the goats' Golden Mic is a status and their Mic Stand an unbreakable
  object, so without it their group showed 6 of its 8 entries.
- Debug additions not in the plan: `gate=1`, `screen=hall&tab=`, `start=` as an alias of `act=`, and a debug run that
  starts below the table opens the spoiler gate in memory (a real party there has always met him; the Settings row and
  the codex then show as they would). The params save nothing themselves.
- `bosshp=` uses `objective.bossIds` / `bossId`, and boss-tier units when the encounter names neither.
- The Hall roster keeps 4 columns (5 rows of 17 or 18 fit at all four sizes); only party select got the 6 × 3 / 5 × 4
  grid. Its switch is "more heroes than a 4 × 4 grid holds" (`GRID4_CAP`), a layout constant, not a hero count.
- `gameover.js summary()` prefers a finished run's own `run.summary` to a rebuild from the live state.
- `victory_final` is NARRATIVE's pool of three lines; the plan's "Svammiel, from somewhere far below" is one of them, and
  whichever is drawn wears his badge.
- A debug map from `startAtAct` stands the party at a door it never walked to from the lobby, so no travelled link is
  drawn into it; real play always has the lobby → door path.

### Requests
- Lead (ARCHITECTURE §10.1): list `gate=1`, `screen=hall&tab=<tab>`, `start=` (alias of `act=`), "a debug run below the
  table opens the spoiler gate for the page" and `bosshp`'s boss-tier fallback; §8.1: the new `DD.UI` helpers above and
  the `CODEX` export the codex reads.
- C5 (`js/data/bosses/svammiel.js`): "The DM (Demoted)" is on plan §5.8's codex list, but the kids'-table object has
  `hp: 0` and no `codex: true`, so the codex skips it. Set `codex: true` on it (or list it in a `DD.Svammiel.CODEX`
  export) and it joins the Floor Boss group.
- QA: `.tmp/v3/metaui/shotpage.sh "q=<url-encoded query>&to=<selector>&block=start|end" <absolute out.png> [WxH]` shoots
  a scrolled screen (e.g. the codex's Act IV group); it takes a slot like `tools/shot.sh`.

### Tests (`tests/ui_tests.js`, 11 new suites "ui: V3 — …", ~250 assertions with full content)
- Svammiel's floor: a door per lane per door row (L × L, lane order, shortName, icon, portrait), the floor boss, the
  doodles, only the lobby's open links at the start, the legend, "Act IV — Under the Table", door and boss tooltips,
  the goats' teaser and Billy's portrait; a beaten lane: the fought door "✓ <shortName>" under the party, the rest
  "✓ Beaten", the next door row offers L − 1, only travelled and open links.
- The board's fit (real page) at 1280×720 and 1024×640 with L = 5 and L = 6 (stand-in lanes when fewer are loaded):
  every node on the board, one column per row, no node / label / narration / legend / doodle overlap, no cut label, no
  scroll.
- The Twist panel from the rewards' Continue: both halves of `svam_twist` (exactly the user's line), the cast card = the
  run's lanes, the goats' "(feat. ???)", his 😈 line, the heal, "Descend to Act IV", the next line's number word, no
  confetti; animated: Space completes it, Enter descends to the gauntlet.
- End screens: the four-act victory (kicker, `campaign_won`, no old DM line, `victory_final` with 😈, N / M, the order),
  a classic win, game over to the floor boss ("(he cheated)", names), to a door, a v2 summary.
- The Hall: gate shut (no Act IV group, act-4 defs out of every card and count, no act-IV records, no classic label);
  gate open (records, history titles and "Act IV · 2 / 7" from the entry's own count, the codex group, the goats' 8).
- Settings: the gated row, Full / Short / Log only from `DD.Meta.CAMEO_SETTINGS`, saved and re-selected.
- Spoilers: `UI.ACTS[4].sub` count-free; act-1 maps (acts 3 and 4) name no mini-boss, Svammiel or act IV; a 3-act
  act-3 clear names no act IV; the title's tagline and tips (forced picks) only after the gate.
- Shop and tavern under the table (sign, the DM, the Bribe bought → `flags.cameo.bribe`, the rug) and not in act 1; the
  four-service counter fits 1024×640 and 1280×720 (real page).
- The League's 72-character name wraps in the map tooltip, the rewards banner, the game-over killer and the Hall
  history (real page).
- Debug params (real page): `acts=4&act=4` (gate opened), `beaten=` order and seals, `start=4`, `acts=3` clamps,
  `twist=1` (fits 1280×720), `final=1` (L / L, one stat row), `screen=gameover` in act 4, the codex with and without
  `gate=1`, `cameo=short`, `cameo=0`, `bosshp=0.5`.
- The v2 hero suites (made data-driven in phase 0): `V3_HEROES = ['benedick']`, last in `UI.HERO_ORDER`; the fit suite
  pads the roster with cloned worst-case cards to 17 and 18 while Benedick is a stub (party select, Hall roster and the
  tavern's recruit pick at four sizes).
- Full run (Nov 15, acts 3): 1223 suites, 142,866 assertions, 0 failures.

### Known issues
- Benedick's file is still a stub, so the 17-card layout is proven with padded clones (the worst-case name and role);
  once he lands the same suite checks the real 17 and pads to 18.
- The doodles, the coffee ring and the token horns are CSS and inline SVG, not sprites.

## Review (V3) — adversarial review of the render / HUD / META-UI work for act IV and the 17th hero (REVIEWER, Nov 15)

Verified by running code: the four owners' suites, a full `tools/test.sh`, real-page probes (`.tmp/v3/rv/probe.sh`:
an iframe of the real game at a fixed size, a probe script, `--dump-dom`; `.tmp/v3/rv/montage.sh`: four real pages in
one capture, e.g. one fight at rot 0 / 90 / 200 / 37.5), the plan §8.5 shots (`.tmp/v3/qa/`, each PNG read) and the
render-world A/B identity harness against HEAD's renderer.

### Fixed (most severe first)
1. **The Hall roster overflowed at 1600×900 with the real 17 heroes** (`ui: v2 — party select and the hall roster fit
   …` failed: 734 / 725, also padded to 18). The padded clones had passed while Benedick was a stub, but his card has a
   two-line race / class and a two-line role, which no clone modelled. Fix (`css/style.css`): `.hall-heroes.many`
   (hall.js already set the class above 4 × 4) gives each row a little height back (gap .4rem, card padding .36rem,
   tighter sub / role lines). Regression: `padHeroes` now builds the worst case from the roster's longest name, race,
   class, epithet AND role (it took only the longest role and name), and the suite still passes at all four sizes with
   17 real cards and 18 padded ones.
2. **Party select at 1024 px: "0 ARMOR" poked out of the details panel** (`ui: playtest first-hour-6 …` failed at
   1024×768; measured 1002 / 1000 px at 1024×640 too). The V3 `.many` grid narrows the details panel to 19-21rem below
   1280 px (v2 had 20-24rem), and the four stat boxes no longer fit. Fix: under `.ps-body.many` below 1280 px the stat
   row tightens (gap .3rem, box padding .36rem, column gap .26rem, label letter-spacing .04em). Regression: the fit
   suite's `fitRoster` now asserts that the stat boxes and the 🎲 Init chip stay inside the details panel at every size
   (1024×640 included; first-hour-6 only checked 1024×768).
3. Twist panel: the deco font's narrow space made "I, SVAMMIEL, CONTROL ALL." read as "CONTROLALL" in the shots;
   `.tw-control` gets `word-spacing: .22em` (cosmetic).

### Checked and fine
- Ship dark (acts 3, fresh profile): title (tagline, tips), Settings (no cameo row), the Hall's records, history, heroes
  and codex (3 act groups; act-4 defs out of every count: "Codex entries 0 / 52"), party select and every hero's
  details panel name nothing of act IV (the only hit of a name sweep was Betty's "Goatfolk Warrior"). Every act-4
  enemy def carries `act: 4` (none would fall into "Miscellaneous Horrors"). Benedick is live: party select (last),
  the Hall (last), the title campfire (the 17th seat on the cobble path), nothing of his mentions act IV.
- Behind `gate=1` the codex shows the Act IV group: Gardener 5, League 6 (with the note), Galbraith 2, Coven 5, the
  Rapping Goats 8 (the header "The Rapping Goats (Herd Mentality, feat. Ursa Verse)"), the Floor Boss 4 (The DM
  (Demoted) is missing: C5's object, the open META-UI request).
- The act-4 map (seed 7, 1280×720 and 1024×640, with `beaten=` and the goats last): five doors on every door row, 12
  columns, sealed lanes greyed with "✓ Beaten", only travelled / open links; every door tooltip (probed through real
  hover) carries the teaser and the hint, the goats' exactly ("… (feat. ???)", 🐐), the League's 72-character name
  wraps with no overflowing element; the legend lists 😈 Mini-boss only here. Every "N / M" is computed (map, Twist
  panel "Five mini-bosses", final victory "5 / 5", game over "2 / 5 (League of Villainy, Rapping Goats)", history).
- The Twist panel, the four-act victory and the act-4 game over ("(he cheated)") at 1280×720; the shop under new
  management (the Bribe 94), the tavern rug.
- Real input: on the real page a real Space keydown and a real click (the top element at the board is the see-through
  `.hud-cameoscrim`) each skip the League's start swoop; deployment stays open, initiative is not rolled, input unlocks.

### Passed on (not in these files)
- C5 (`svammiel.js`): set `codex: true` on the kids'-table DM object (or export `DD.Svammiel.CODEX`) so "The DM
  (Demoted)" joins the Floor Boss codex group (plan §5.8; META-UI's request stands).
- C5 (`svammiel.js twistExtras`): the twist's log reads Svammiel's line first, then "The table shakes…" and the DM's
  "Oh no. That's my DM."; plan §2.1's script has the table shaking (500 ms) before his line (2800 ms). Low.
- Lead: META-UI's ARCHITECTURE §10.1 / §8.1 requests stand.

### Tests (review)
- `tools/test.sh "suite=ui:"` before the fixes: 53 suites, 3 failures in the two fit suites above; after: both pass
  (party select / Hall fit 100 assertions, first-hour-6 9). `suite=hud:,render,sprites`: 150 suites, 3822 assertions,
  0 failures.
- Full run (Nov 15, acts 3, Benedick registered): 1265 suites, 149,172 assertions, 1 failure, not from these files:
  `kit: finish D1` (tests/content/kit.js) expects the v2 opt-out list and gets `ben_inevitable` too (HERO-BENEDICK /
  the integrator: add it to the kit's list along with DESIGN §4.2's sentence).

## V3 QA fixes (render-ui, Nov 17)
HERO-8 (`DD.UI.targetLabel`: tile skills open to anything target "a tile"), HERO-3 (`DD.UI.drainsAp`, "1+ AP" pills) and
HERO-5 (`statusChip` turns badge with status `showTurns`, `.st-turns` in `css/style.css`); details, requests and tests:
`hud-v2.md` "V3 QA fixes".

## h19 — Rasma, Biz and Phat Gus: the order, the 20-card fit and `showStacks` (H19-SEATS, Nov 18)

READY: h19 seats

Plan `.tmp/h19/plan.md` §1.3, D2, D9 (META-UI pieces; the renderer's seats are in `render-world.md` "h19"). Nothing
here needs the three heroes registered: every list tolerates a registered or an unregistered id (`UI.heroIds()`).

### What the player sees
- **Order** (`UI.HERO_ORDER`, plan D2): `…, 'hjalmar', 'pebbles', 'rasma', 'biz', 'gus', 'benedick'`: the user's order,
  after the v2 six and before Benedick, who still arrives last (obviously).
- **Party select** (`party_select.js`, `css/style.css`): 17 and 18 heroes keep V3's grid (6 × 3 from 1280 px, 5 × 4
  below). 19 and 20 (`.ps-roster.many.fives`) sit in rows of five at every width: 5 × 4 = 20 with no ragged last row (6
  columns would leave four empty chairs; at 1920×1080 the cards grow to ~240 × 185 px). 21 or more go back to 6 × 4
  from 1280 px and 5 × 5 below (the rows share the height: the art shrinks, the text keeps its lines). The
  `.ps-body.many` details panel is unchanged (its stat boxes stay inside at 1024×640; the fit suite checks it).
- **Hall roster** (`hall.js`): 17-20 keep `.many` (4 columns, five rows). More than 20 (`.hall-heroes.crowd`) take a
  sixth row; the cards keep the small type and the 3.2rem portrait at every width (no 1500 px step up), with a little
  less padding and line height (21 overflowed by 15 px at 1280×720 and 66 px at 1600×900 without it; with it the body
  has 43 px and 89 px to spare).
- **Tavern recruit pick**: unchanged: 16 recruits at twenty heroes fill the four compact columns (4 × 4), a 21st adds a
  fifth row; both fit at the four sizes (the CSS comment says so).
- **Status chips** (`UI.statusChip`, plan D9, ARCHITECTURE §3.3 / §7.2): a status def with `showStacks: true` prints its
  stack count from 1 (default: from 2): Rasma's last charge and Phat Gus's one acorn read "1" once their owners set the
  flag. The value printed is the number (`num(st.stacks, 1)`), so an instance without `stacks` reads "1", never
  "undefined"; 0 stacks print nothing. The tooltip's "×n" still starts at 2; `showTurns` is untouched.
- Comments: party select "all twenty", no "17 is prime"; hall "17 to 20 fit"; the tavern recruit CSS note.

### Card worst case (re-check if a builder lengthens a string)
`padHeroes` reads the worst case from the registry (longest role, name, race, class, epithet). Today: Betty's 46-char
role, Professor Marbles's 17-char name, Benedick's 25-char race and 21-char class, Syllamin's 23-char epithet. The
addenda's strings beat none of them: roles Rasma 39 ("Melee spellsword · enchant, then strike"), Biz 35, Phat Gus 33;
Phat Gus's race "Squirrel (Mostly Cheeks)" 24 and class "Snackromancer" 13; epithets "the Monotaur" 12, "the
Subcontractor" 17, "the Unfathomable" 16. A longer one becomes the new worst case automatically.

### Public API (new / changed)
- `DD.UI.HERO_ORDER` + `'rasma', 'biz', 'gus'` before `'benedick'`.
- Status def flag `showStacks` read by `DD.UI.statusChip` (the board glyph: `render-world.md` "h19").
- CSS classes `.ps-roster.fives` (19-20 heroes) and `.hall-heroes.crowd` (more than 20).

### Deviations
- Party select at 19-20 heroes is 5 × 4 at every width, not "7 × 3 or 6 × 4 by width" (the brief's examples): 20 fills
  5 × 4 exactly, the cards are bigger than 6 × 4's at every size, and the headroom for 21 is 6 × 4 from 1280 px / 5 × 5
  below (all proven by the fit suite, padded).

### Requests
- **HERO-RASMA / HERO-GUS**: `showStacks: true` has landed (chip and board glyph): set it on `ras_frost`, `ras_shock`,
  `ras_charm` and `gus_cheeks` if you want the "1" (your addenda's optional request); the suites `ui: h19 — …showStacks`
  and `render: h19 — …showStacks` log which of them set it.
- **Lead / integrator (optional M1, plan D9)**: the party-select details panel does not list `def.summons`. Deferred, not
  built: it would put every summon's `desc` on a new player-facing surface (Ellaria's corgi "HP 8 + Ellaria's level",
  Josiah's Onyx "10 HP, +10% per Josiah level…", Corelos's Lawyer, Zarathor's statue, Sparrow's clone, Biz's two
  robots), and each would first need a desc == execute audit, Ellaria's text included (she is never touched). Biz's
  fallback stands: his blurb and passive name both robots, the numbers are in the in-combat tooltip.
- **review:shared / integrator**: once all three register, `tools/test.sh "suite=ui: v2"` runs the fit at 20 real cards
  plus a padded 21; the shots at 20 real cards are review:shared's (plan §1.5).

### Tests (`tests/ui_tests.js`)
- `H19_HEROES = ['rasma', 'biz', 'gus']` beside `V3_HEROES`; "ui: v2 — every registered hero is in UI.HERO_ORDER…" also
  asserts the three sit right after the v2 six, in the user's order, before Benedick (Benedick's "last" assert unchanged).
- The fit suite ("ui: v2 — party select and the hall roster fit…", real page at 1024×640, 1280×720, 1600×900,
  1920×1080) now pads to every count from the registry's +1 (at least 17) up to 21: 18 and 19 while the three land one
  by one, 20, and 21 for one more. 244 assertions with 17 registered. Before the CSS: 3 failures, all the
  Hall at 21 (1280×720 by 15 px, 1600×900 by 66 px and one card off screen); after: 0.
- New: "ui: h19 — a status def with showStacks prints its stack count on the chip from 1; without it, from 2; nothing
  else changes" (9 assertions; it toggles the flag on `ras_frost` / `gus_cheeks` when registered, else `burn`).
- Shots (`.tmp/h19/seats/`, every URL `debug=1`): the real party select and Hall (heroes tab, `tab=heroes`) at the four
  sizes with 17 heroes, and a scratch probe (`.tmp/h19/seats/probe.html` + `run.sh`, sourcing `tools/chrome_slot.sh`)
  padding to 20 / 21 worst-case cards: party select 20 at 1024 / 1280 / 1600 / 1920, 21 at 1024 / 1280; the Hall 20 at
  1280, 21 at 1600; the tavern recruit pick (16) at 1024×640. All read; nothing clipped.

### Known issues
- 21 heroes at 1024×640: 5 × 5 party-select cards, the portraits shrink to ~25 px (the fit passes; only a 21st hero
  reaches it).
- Full run (Nov 18, 17 heroes registered, the three new files still stubs): `bash tools/test.sh` 1323 suites, 152,638
  assertions, 0 failures; my suites under `CONSOLE=1`: no "Error in" line.

## Review (h19) — `review:shared`, Nov 19
All three hero files registered: 20 REAL cards.
- **Fit**: `tools/test.sh "suite=hall roster fit"` PASS (108 assertions: 20 real and a padded 21, party select, the Hall
  and the tavern recruit pick at 1024×640, 1280×720, 1600×900, 1920×1080). Shots read (`.tmp/h19/review-shared/`):
  party select and the Hall heroes tab at the four sizes (5 × 4 and 4 × 5, nothing clipped, no scroll, Rasma, Biz and
  Phat Gus after Pebbles, Benedick last), the details panel focused on Biz, Rasma and Phat Gus at 1024×640 (stat boxes
  and Init chip inside; a probe, `probe.html` + `run.sh` sourcing `tools/chrome_slot.sh`), the recruit pick (16) at
  1024×640, 1280×720 and 1920×1080.
- **Fixed — the recruit pick's order**: it listed the run layer's registry order (`DD.Run.recruitCandidates`), so
  Benedick came BEFORE Rasma, Biz and Phat Gus (they load after him), and Corelos second. `tavern.js` now shows the
  candidates in `UI.heroIds()` order, as party select and the Hall do (display only: the run's list, its count and
  the rules are untouched). The fit suite asserts the order at every size and count.
- **showStacks**: `ui: h19 — …` logs `ras_frost`, `ras_shock`, `ras_charm` and `gus_cheeks` set it and read "1"; a real
  fight (`party=gus,rasma,betty,josiah&autoplay=1`) shows Phat Gus's cheek chip "1" and Rasma's blade chip "3".
- **HUD worst case** (`party=biz,ellaria,josiah,corelos`, 1024×640; deployment and an AutoPlay turn): no overflow; the
  summons compact into "entourage" rows. One cosmetic HUD request: the hotbar's slot labels break single long words
  mid-word at 1024×640 ("OVERCLOC K", "SPOODMARI NO!"): the HUD's CSS, passed on.
- Observation (sprite framing, not the grid): at 1600 / 1920 the bigger 5 × 4 cards show Phat Gus's tail (and
  Benedick's shell, as in V3) cut by the square portrait canvas's left edge. Passed on to qa:screens / qa:gus.

## h19 QA fixes (render-ui, Nov 20)
SCR-1 / qa-rasma-6 (hotbar name fit), QA-BIZ-4 (`turnEndNote`), QA-BIZ-5 (`DD.UI.ANYWHERE_RANGE`), the hero passive
`liveDesc` (`DD.UI.passiveText`, also `screens/party.js`), SCR-2 (card art fades, `css/style.css`) and SCR-3 (README
order); details, requests and tests: `hud-v2.md` "h19 QA fixes".

## h19 polish (fix:polish, Nov 21) — the cross-fixer requests that had not landed
The HUD half of QA-BIZ-6 (`docs/notes/rules.md` "h19 QA fixes (Nov 20)" Requests: render-ui, show a preview entry's
`ap` / `apNext`) and the content halves of `hud-v2.md` "h19 QA fixes" Requests; the digest's list: `h19-digest.md` §7.
- **AP in previews** (`js/ui/combat_hud.js`): `apLabel(e, next)` / `apLabels(e)` print an entry's AP in the engine's
  words, the number always the entry's: "+2 AP", "−1 AP next turn", a range "+1–2 AP" from an uncertain entry's `apMin` /
  `apMax` (`apNextMin` / `apNextMax`). `overlayPreviews` adds them to the unit's badge after the Block part (Overclock's
  robot reads "+2 AP ♨️", "+3 AP ♨️" with the Universal Remote); `previewSummary` adds one "⚡" part to the aim hint:
  "⚡ Hjalmarino +2 AP", "⚡ Slate +1 AP next turn", the actor's own first as "you" ("⚡ you +2 AP": a refund, a self-gift;
  its own cost is not in the preview), past three "… and N more". Never on a KO or a revive entry; never twice when a
  def's own preview text (`hudCustom`) already names the AP. Display only: no engine, AI, AutoPlay or sim path reads the
  badge or the hint.
- **Content landed by the same pass** (their notes have the details): Biz's `turnEndNote` (the bask cue the HUD hook was
  waiting for: `hero-biz.md` "Polish"), Phat Gus's `liveDesc` (`hero-gus.md` "Polish"), `shooter: false` on Galbraith's
  chain hops (`boss-galbraith.md` "Polish"), and the ARCHITECTURE lines for the h19 hooks and fields (§3.1 `liveDesc` /
  `turnEndNote`, §3.2 the `forgetWarning` resolve, §3.2 / §5.2 `ap` / `apNext` and `Targeting.diff` opts, §7.2
  `overlay.moves`, `renderTo` `landings` / `heads`, the title seats, §7.4 beam shooters, §8.1 `passiveText` /
  `ANYWHERE_RANGE`, §8.3 the h19 HUD and `DD.HUD.endTurnTip` / `turnEndNote` / `fitNames`).
- **Tests** (`tests/hud_tests.js`, three new suites before the map-rotation check):
  - "hud: h19 polish — a preview's AP (ap / apNext) shows on the unit's badge and in the aim hint …" (Good Boy! at I and
    III on the hound (now) and the knight (next turn): badge and hint carry exactly what the preview says, "+2 AP" at
    III; a temporary self-gift reads "⚡ you +2 AP"; a skill with no AP adds no ⚡; 20 assertions).
  - "hud: h19 polish — Biz: Overclock's aim reads "+N AP" on the robot …" (real biz.js; skips isolated without it: N is
    the preview's, 2 and 3 with the Remote; after a real Overclock his move hint next to / away from the hot robot,
    Hjalmarino's own move hint, End Turn where he stands, then the bask he really gets there; 19 assertions).
  - "hud: h19 polish — ARCHITECTURE documents the h19 hooks and fields the code has …" (reads ARCHITECTURE.md through the
    page, as the ui review suite does; 13 assertions).
  `bash tools/test.sh "suite=hud: h19&isolate=heroes/biz,heroes/gus"`: 8 suites, 0 failures.
