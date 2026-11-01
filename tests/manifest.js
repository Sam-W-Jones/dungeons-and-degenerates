/* Test files loaded after the game manifest (missing ones are skipped). One file per owning area. */
window.DD_EXTRA_SCRIPTS = [
  'tests/fixtures.js',        // rules: test-only heroes/enemies/summons (ids prefixed "test_")
  'tests/engine_tests.js',    // rules: grid, LOS, pathing, damage, statuses, push, turn flow, AI
  'tests/content_tests.js',   // rules: generic content validation + skill/enemy smoke + encounter auto-battles
  'tests/mapgen_tests.js',    // mapgen: generation validity, layouts, encounter build
  'tests/render_tests.js',    // render-world: projection, picking, renderer smoke (headless canvas)
  'tests/sprite_tests.js',    // render-sprites: sprite painter, portraits, FX handlers
  'tests/run_tests.js',       // meta: run flow, rewards, leveling, save/load, events
  'tests/ui_tests.js',        // meta/hud: screens mount/unmount without errors
  'tests/hud_tests.js',       // hud: combat HUD on real sandbox fights (selection, targeting, previews, end of fight)
  'tests/passive_tests.js',   // passives: the random passive table in the run layer and UI (rolls, slots, level-ups)
  'tests/autoplay_tests.js',  // autoplay: AutoPlay fidelity (utility valuation, cover from aura threats, walking approach)
  'tests/balance_tests.js',   // balance: DD.Balance knobs, Hype and economy rules, difficulty targets (smoke-level sims)

  // content-specific suites (one file per content file owner)
  'tests/content/hero_zarathor.js',
  'tests/content/hero_syllamin.js',
  'tests/content/hero_marbles.js',
  'tests/content/hero_marwyn.js',
  'tests/content/hero_corelos.js',
  'tests/content/hero_josiah.js',
  'tests/content/hero_ellaria.js',
  'tests/content/hero_sparrow.js',
  'tests/content/hero_slate.js',
  'tests/content/hero_buga.js',
  'tests/content/hero_kiri.js',
  'tests/content/hero_betty.js',
  'tests/content/hero_basanos.js',
  'tests/content/shared.js',              // items
  'tests/content/kit.js',                 // generic skills + consumables
  'tests/content/passives.js',            // the Table of Questionable Blessings
  'tests/content/enemies_act1.js',
  'tests/content/enemies_act2.js',
  'tests/content/enemies_act3.js',
  'tests/content/bosses_act1.js',
  'tests/content/bosses_act2.js',
  'tests/content/boss_dm.js',
  'tests/content/narrative.js',
  'tests/content/integration.js',         // integrator: cross-content checks, core-fix regressions, campaign smoke
];
