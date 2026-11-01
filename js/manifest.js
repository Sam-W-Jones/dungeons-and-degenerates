/* Dungeons and Degenerates — js/manifest.js
 * Ordered list of every game script. Used by js/loader.js for both index.html and tests/test.html.
 * Missing files are tolerated (reported in DD_MISSING), so planned files can be listed before they exist.
 * Add a new file here ONLY if your area owns it (see docs/ARCHITECTURE.md §1).
 */
window.DD_MANIFEST = [
  // core (lead)
  'js/core/namespace.js',
  'js/core/util.js',
  'js/core/rng.js',
  'js/core/events.js',
  'js/core/storage.js',
  'js/core/fx_core.js',

  // engine (rules)
  'js/engine/grid.js',
  'js/engine/targeting.js',
  'js/engine/hooks.js',
  'js/engine/actions.js',
  'js/engine/ai.js',
  'js/engine/combat.js',
  'js/engine/autoplay.js',
  // engine (mapgen)
  'js/engine/mapgen.js',
  'js/engine/encounter.js',

  // render
  'js/render/iso.js',
  'js/render/sprites.js',
  'js/render/fx_render.js',
  'js/render/renderer.js',
  'js/render/input.js',
  'js/render/audio.js',
  'js/render/gallery.js',

  // core data (rules / mapgen)
  'js/data/statuses.js',
  'js/data/terrain.js',
  'js/data/balance.js',       // DD.Balance: the one place for global difficulty / Hype / economy knobs (balance phase)
  'js/data/themes.js',
  'js/data/wildmagic.js',
  'js/data/scars.js',
  'js/data/passives.js',

  // shared content
  'js/data/skills_generic.js',
  'js/data/items.js',
  'js/data/consumables.js',

  // heroes
  'js/data/heroes/zarathor.js',
  'js/data/heroes/syllamin.js',
  'js/data/heroes/marbles.js',
  'js/data/heroes/marwyn.js',
  'js/data/heroes/corelos.js',
  'js/data/heroes/josiah.js',
  'js/data/heroes/ellaria.js',
  'js/data/heroes/sparrow.js',
  'js/data/heroes/slate.js',
  'js/data/heroes/buga.js',
  'js/data/heroes/kiri.js',
  'js/data/heroes/betty.js',
  'js/data/heroes/basanos.js',

  // enemies + encounters
  'js/data/enemies/act1.js',
  'js/data/enemies/act2.js',
  'js/data/enemies/act3.js',
  'js/data/bosses/grimble.js',
  'js/data/bosses/ratking.js',
  'js/data/bosses/lich.js',
  'js/data/bosses/beholder.js',
  'js/data/bosses/dm.js',

  // narrative
  'js/data/events.js',
  'js/data/narrator.js',

  // run layer
  'js/run/meta.js',
  'js/run/run.js',
  'js/run/runmap.js',
  'js/run/rewards.js',
  'js/run/passives.js',

  // ui
  'js/ui/ui.js',
  'js/ui/screens/title.js',
  'js/ui/screens/party_select.js',
  'js/ui/screens/map.js',
  'js/ui/screens/rewards.js',
  'js/ui/screens/levelup.js',
  'js/ui/screens/event.js',
  'js/ui/screens/shop.js',
  'js/ui/screens/tavern.js',
  'js/ui/screens/party.js',
  'js/ui/screens/gameover.js',
  'js/ui/screens/settings.js',
  'js/ui/screens/hall.js',
  'js/ui/combat_hud.js',

  // boot (must be last)
  'js/main.js',
];
