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
  - Threat shading is nearly invisible on warm floors (Grimble's wood + red carpet, `.tmp/uiv2/shots/c_boss_threat.png`):
    `threatFill` uses `rgba(255,96,36, 0.13 + 0.3k)` + an orange outline. Suggest a higher floor (≈0.22 + 0.4k), a dark
    contrasting outline or a light diagonal hatch on every threatened tile, so "can they reach me?" reads on any floor.
  - Optional: a dedicated look for a provoking walk (e.g. `overlay.pathProvokes: [{ x, y, unitId }]` → crossed swords
    on the tiles where a hit lands) and a mark on provoking move tiles (`moveTiles[i].provokes`) — the HUD would fill
    them from `Combat.reachable` entries.
  - The title campfire's `HERO_ORDER` (renderer.js ~3504) lists nine old heroes; use `DD.UI.HERO_ORDER` (16).
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
- Threat shading visibility on warm floors (RENDER request above).
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
- The 💥 marker and the UP! badge are not part of the badge-stack layout, so the marker can overlap a neighbour's HP pill
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
