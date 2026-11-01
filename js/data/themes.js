/* Dungeons and Degenerates — js/data/themes.js
 * Map themes (DESIGN §10): what a battlefield is made of (floors, walls, objects, hazards), how it looks
 * (background gradient, ambient particles) and the generation knobs DD.MapGen reads (js/engine/mapgen.js).
 *
 *   DD.Themes.cellar                → theme object (ARCHITECTURE §5.8 fields + the extras documented below)
 *   DD.Themes.forAct(2)             → ['hauntwood', 'academy', 'graveyard']
 *   DD.Themes.get(id) · ids() · random(act, rng)
 *
 * Extras beyond the contract: floorWeights (parallel to floors) · floorPatch (patch shape per secondary floor:
 * 'blob' | 'rect' | 'strip' | 'path') · raisedFloor + raisedMin (floor used at elevation >= raisedMin, default 1) ·
 * obstacleWeights / decorWeights · surfaces (surface ids the theme sprinkles) · flavor · gen {}.
 * bg runs from the lighter top to the darker bottom of the backdrop.
 * gen knobs: elevation 'flat'|'hills'|'terraces' · maxH · cliffs (chance of a sheer, unclimbable plateau) ·
 * zoneH { hero: [min,max], enemy: [min,max] } · liquid / deep (liquid + deep-core terrain for 'water' style
 * features) · liquidStyle 'channels'|'rivers'|'pools' · barrier { chance, kinds } (a mid-map line with 2-3 gaps =
 * chokepoints) · hazards [{ kind, w, ... }] + hazardCount (pools / pits / patches / surface) · extras [{ kind:
 * 'walls'|'circle'|'cluster', w }] + extraChance (non-hazard set dressing) · obstacleDensity / decorDensity (per
 * tile) · explosive / braziers [min,max] · chest (chance) · border { kind: 'wall'|'objects', ids, chance } (dressing
 * along the two back edges) · filler (blocking object used to plug unreachable pockets).
 */
(function () {
  'use strict';
  const DD = window.DD;

  const LIST = [
    {
      id: 'cellar', name: "The Leaky Flagon's Cellar", act: 1,
      flavor: 'Smells like spilled ale and worse decisions.',
      floors: ['wood', 'stone', 'cobble'], floorWeights: [6, 2, 1],
      floorPatch: { stone: 'rect', cobble: 'blob' },
      raisedFloor: 'stone',
      walls: 'wall',
      obstacles: ['crate', 'barrel', 'keg', 'pillar'], obstacleWeights: [4, 3, 3, 1],
      decor: ['candles', 'bones'], decorWeights: [3, 1],
      hazards: ['water', 'oil'],
      liquids: ['water'],
      surfaces: ['oil', 'water'],
      bg: { top: '#2c1b10', bottom: '#0d0907' },
      ambient: 'dust',
      gen: {
        elevation: 'terraces', maxH: 2, cliffs: 0.12,
        zoneH: { hero: [0, 0], enemy: [0, 1] },
        liquid: 'water', deep: null, liquidStyle: 'pools',
        barrier: { chance: 0.45, kinds: [
          { kind: 'walls', w: 3 },
          { kind: 'objects', ids: ['crate', 'keg', 'barrel'], w: 2 },
        ] },
        hazards: [
          { kind: 'pools', terrain: 'water', w: 3 },          // ale puddles
          { kind: 'surface', id: 'oil', w: 2 },               // lamp oil, very flammable, very convenient
          { kind: 'surface', id: 'water', w: 1 },
        ],
        hazardCount: [1, 2],
        extras: [{ kind: 'walls', w: 1 }], extraChance: 0.4,
        obstacleDensity: 0.08, decorDensity: 0.02,
        explosive: [1, 3], braziers: [0, 1], chest: 0.3,
        border: { kind: 'wall', chance: 0.75 },
        filler: 'crate',
      },
    },
    {
      id: 'sewer', name: 'The Sewers (Ew)', act: 1,
      flavor: 'Nobody checks for traps down here. Everybody checks their boots.',
      floors: ['stone', 'cobble', 'grate'], floorWeights: [4, 2, 2],
      floorPatch: { cobble: 'rect', grate: 'blob' },
      raisedFloor: 'cobble',
      walls: 'wall',
      obstacles: ['pipe', 'barrel', 'crate', 'rock'], obstacleWeights: [3, 2, 2, 1],
      decor: ['bones', 'mushroom'], decorWeights: [2, 1],
      hazards: ['water', 'deep_water', 'poison'],
      liquids: ['water', 'deep_water'],
      surfaces: ['poison'],
      bg: { top: '#15301f', bottom: '#060f0b' },
      ambient: 'fog',
      gen: {
        elevation: 'terraces', maxH: 2, cliffs: 0.1,
        zoneH: { hero: [0, 1], enemy: [0, 1] },
        liquid: 'water', deep: 'deep_water', liquidStyle: 'channels',
        barrier: { chance: 0.75, kinds: [
          { kind: 'channel', terrain: 'water', deep: 'deep_water', crossing: 'bridge', w: 4 },
          { kind: 'objects', ids: ['pipe', 'barrel'], w: 1 },
        ] },
        hazards: [
          { kind: 'surface', id: 'poison', w: 3 },            // sewer slime
          { kind: 'pools', terrain: 'water', w: 2 },
          { kind: 'pits', w: 1 },
        ],
        hazardCount: [1, 2],
        obstacleDensity: 0.07, decorDensity: 0.02,
        explosive: [0, 2], braziers: [0, 0], chest: 0.2,
        border: { kind: 'wall', chance: 0.8 },
        filler: 'barrel',
      },
    },
    {
      id: 'warren', name: 'The Goblin Warrens', act: 1,
      flavor: 'Cozy, if you like dirt, spores and being stabbed.',
      floors: ['dirt', 'moss', 'stone'], floorWeights: [5, 2, 1],
      floorPatch: { moss: 'blob', stone: 'blob' },
      raisedFloor: null,
      walls: 'wall',
      obstacles: ['rock', 'mushroom', 'crate', 'barrel'], obstacleWeights: [4, 3, 1, 1],
      decor: ['bones', 'mushroom'], decorWeights: [2, 1],
      hazards: ['pit', 'poison', 'web'],
      liquids: [],
      surfaces: ['poison', 'web'],
      bg: { top: '#2b1f11', bottom: '#0d0905' },
      ambient: 'spores',
      gen: {
        elevation: 'hills', maxH: 3, cliffs: 0.18,
        zoneH: { hero: [0, 1], enemy: [0, 2] },
        liquid: 'mud', deep: null, liquidStyle: 'pools',
        barrier: { chance: 0.35, kinds: [
          { kind: 'chasm', w: 3 },
          { kind: 'walls', w: 1 },
        ] },
        hazards: [
          { kind: 'pits', w: 4 },
          { kind: 'surface', id: 'poison', w: 2 },            // spore puffs
          { kind: 'surface', id: 'web', w: 1 },
          { kind: 'patches', terrain: 'mud', w: 1 },
        ],
        hazardCount: [1, 2],
        obstacleDensity: 0.08, decorDensity: 0.025,
        explosive: [0, 2], braziers: [0, 1], chest: 0.25,
        border: { kind: 'wall', chance: 0.5 },
        filler: 'rock',
      },
    },
    {
      id: 'hauntwood', name: 'The Hauntwood', act: 2,
      flavor: 'The trees are judging you. Quietly. Ominously.',
      floors: ['grass', 'moss', 'dirt'], floorWeights: [5, 2, 2],
      floorPatch: { moss: 'blob', dirt: 'path' },
      raisedFloor: null,
      walls: 'wall',
      obstacles: ['tree', 'dead_tree', 'rock', 'bush'], obstacleWeights: [4, 3, 2, 3],
      decor: ['mushroom', 'gravestone', 'bones'], decorWeights: [2, 1, 1],
      hazards: ['mud', 'water', 'deep_water', 'web'],
      liquids: ['water', 'deep_water'],
      surfaces: ['web'],
      bg: { top: '#14202b', bottom: '#05080f' },
      ambient: 'fog',
      gen: {
        elevation: 'hills', maxH: 3, cliffs: 0.12,
        zoneH: { hero: [0, 1], enemy: [0, 2] },
        liquid: 'water', deep: 'deep_water', liquidStyle: 'rivers',
        barrier: { chance: 0.5, kinds: [
          { kind: 'river', terrain: 'water', deep: 'deep_water', crossing: 'bridge', w: 3 },
          { kind: 'objects', ids: ['tree', 'dead_tree', 'bush'], w: 2 },
        ] },
        hazards: [
          { kind: 'patches', terrain: 'mud', w: 3 },
          { kind: 'pools', terrain: 'water', rim: 'mud', deep: 'deep_water', w: 2 },   // spooky pond
          { kind: 'surface', id: 'web', w: 1 },
        ],
        hazardCount: [1, 2],
        obstacleDensity: 0.1, decorDensity: 0.025,
        explosive: [0, 0], braziers: [0, 0], chest: 0.2,
        border: { kind: 'objects', ids: ['tree', 'dead_tree', 'tree', 'bush'], chance: 0.45 },
        filler: 'tree',
      },
    },
    {
      id: 'academy', name: 'The Necromancy Academy (Accredited)', act: 2,
      flavor: 'Tuition is your soul. Parking is extra.',
      floors: ['crypt', 'marble', 'carpet', 'wood'], floorWeights: [4, 2, 2, 1],
      floorPatch: { marble: 'rect', carpet: 'strip', wood: 'rect' },
      raisedFloor: 'wood',
      walls: 'wall',
      obstacles: ['bookshelf', 'pillar', 'statue'], obstacleWeights: [4, 2, 2],
      decor: ['candles', 'bones'], decorWeights: [3, 1],
      hazards: ['pit', 'holy'],
      liquids: [],
      surfaces: ['holy'],
      bg: { top: '#221636', bottom: '#0a0613' },
      ambient: 'dust',
      gen: {
        elevation: 'terraces', maxH: 3, cliffs: 0.15,
        zoneH: { hero: [0, 0], enemy: [0, 2] },
        liquid: null, deep: null, liquidStyle: 'pools',
        barrier: { chance: 0.55, kinds: [
          { kind: 'objects', ids: ['bookshelf'], w: 3 },       // library aisles
          { kind: 'walls', w: 1 },
          { kind: 'chasm', w: 1 },
        ] },
        hazards: [
          { kind: 'pits', w: 3 },                              // the floor was not up to code
          { kind: 'patches', terrain: 'rubble', w: 1 },        // collapsed shelving, overdue
          { kind: 'surface', id: 'web', w: 1 },                // the restricted section's cobwebs
        ],
        hazardCount: [1, 2],
        extras: [
          { kind: 'circle', id: 'holy', w: 2 },                // a magic circle somebody forgot to erase
          { kind: 'walls', w: 1 },
        ],
        extraChance: 0.6,
        obstacleDensity: 0.08, decorDensity: 0.03,
        explosive: [0, 1], braziers: [1, 2], chest: 0.25,
        border: { kind: 'wall', chance: 0.8 },
        filler: 'bookshelf',
      },
    },
    {
      id: 'graveyard', name: "Saint Nobody's Graveyard", act: 2,
      flavor: 'The residents are dead quiet. Mostly.',
      floors: ['dirt', 'grass', 'cobble'], floorWeights: [3, 3, 1],
      floorPatch: { grass: 'blob', cobble: 'path' },
      raisedFloor: null,
      walls: 'wall',
      obstacles: ['gravestone', 'coffin', 'dead_tree', 'statue'], obstacleWeights: [5, 2, 2, 1],
      decor: ['bones', 'candles'], decorWeights: [2, 1],
      hazards: ['mud', 'pit'],
      liquids: [],
      surfaces: [],
      bg: { top: '#1b212e', bottom: '#07090f' },
      ambient: 'fog',
      gen: {
        elevation: 'hills', maxH: 2, cliffs: 0.1,
        zoneH: { hero: [0, 1], enemy: [0, 1] },
        liquid: 'mud', deep: null, liquidStyle: 'pools',
        barrier: { chance: 0.45, kinds: [
          { kind: 'objects', ids: ['fence'], w: 3 },
          { kind: 'walls', w: 1 },
        ] },
        hazards: [
          { kind: 'pits', shape: 'grave', w: 3 },              // open graves, freshly dug, conveniently yeetable
          { kind: 'patches', terrain: 'mud', w: 3 },
        ],
        hazardCount: [1, 2],
        obstacleDensity: 0.09, decorDensity: 0.025,
        explosive: [0, 0], braziers: [0, 1], chest: 0.2,
        border: { kind: 'objects', ids: ['fence'], chance: 0.5 },
        filler: 'gravestone',
      },
    },
    {
      id: 'hellscape', name: 'The Nine Hells (Economy Class)', act: 3,
      flavor: 'Hot singles in your area. Also hot everything else.',
      floors: ['obsidian', 'stone'], floorWeights: [5, 2],
      floorPatch: { stone: 'blob' },
      raisedFloor: null,
      walls: 'wall',
      obstacles: ['rock', 'pillar', 'statue'], obstacleWeights: [4, 2, 1],
      decor: ['bones', 'candles'], decorWeights: [2, 1],
      hazards: ['lava', 'fire', 'rubble'],
      liquids: ['lava'],
      surfaces: ['fire'],
      bg: { top: '#3d0d06', bottom: '#130303' },
      ambient: 'embers',
      gen: {
        elevation: 'hills', maxH: 3, cliffs: 0.2,
        zoneH: { hero: [0, 1], enemy: [0, 2] },
        liquid: 'lava', deep: null, liquidStyle: 'rivers',
        barrier: { chance: 0.6, kinds: [
          { kind: 'river', terrain: 'lava', crossing: 'bridge', w: 4 },
          { kind: 'chasm', w: 1 },
        ] },
        hazards: [
          { kind: 'pools', terrain: 'lava', w: 3 },
          { kind: 'patches', terrain: 'rubble', w: 2 },
          { kind: 'surface', id: 'fire', w: 1 },               // brimstone vents
        ],
        hazardCount: [1, 2],
        obstacleDensity: 0.08, decorDensity: 0.02,
        explosive: [0, 1], braziers: [1, 2], chest: 0.2,
        border: { kind: 'objects', ids: ['rock'], chance: 0.35 },
        filler: 'rock',
      },
    },
    {
      id: 'hoard', name: "The Dragon's Hoard", act: 3,
      flavor: "Look, but don't touch. Okay, touch a little.",
      floors: ['marble', 'gold', 'stone'], floorWeights: [4, 2, 1],
      floorPatch: { gold: 'blob', stone: 'rect' },
      raisedFloor: 'gold', raisedMin: 2,                    // heaps of coins (difficult terrain) on the high ground
      walls: 'wall',
      obstacles: ['pillar', 'statue', 'crate'], obstacleWeights: [4, 3, 2],
      decor: ['gold_pile', 'candles', 'bones'], decorWeights: [4, 2, 1],
      hazards: ['pit', 'lava'],
      liquids: ['lava'],
      surfaces: [],
      bg: { top: '#3b2a08', bottom: '#110c03' },
      ambient: 'dust',
      gen: {
        elevation: 'terraces', maxH: 3, cliffs: 0.12,
        zoneH: { hero: [0, 0], enemy: [0, 2] },
        liquid: 'lava', deep: null, liquidStyle: 'pools',
        barrier: { chance: 0.4, kinds: [
          { kind: 'objects', ids: ['pillar', 'statue', 'pillar'], w: 2 },   // the colonnade of vanity
          { kind: 'chasm', w: 1 },
        ] },
        hazards: [
          { kind: 'pits', w: 3 },                              // where the last thieves went
          { kind: 'pools', terrain: 'lava', w: 2 },            // the dragon's fire pit
          { kind: 'surface', id: 'oil', w: 1 },                // lamp oil for polishing the gold
        ],
        hazardCount: [1, 2],
        extras: [{ kind: 'cluster', id: 'gold_pile', w: 1 }], extraChance: 0.5,   // treasure mounds
        obstacleDensity: 0.08, decorDensity: 0.02,
        explosive: [0, 1], braziers: [0, 2], chest: 0.65,
        border: { kind: 'wall', chance: 0.7 },
        filler: 'statue',
      },
    },
    {
      id: 'dm_table', name: "The DM's Actual Table", act: 3,
      flavor: 'Mind the Cheeto dust. And the dice. And the DM.',
      floors: ['felt', 'paper'], floorWeights: [5, 2],
      floorPatch: { paper: 'rect' },
      raisedFloor: 'paper',                                    // rulebook stacks
      walls: 'wall',
      obstacles: ['d20', 'soda_can', 'pencil'], obstacleWeights: [4, 3, 2],
      decor: ['candles'], decorWeights: [1],
      hazards: ['cheeto', 'water', 'pit'],
      liquids: [],
      surfaces: ['cheeto', 'water'],
      bg: { top: '#2b1a0f', bottom: '#0c0705' },
      ambient: null,
      gen: {
        elevation: 'terraces', maxH: 3, cliffs: 0.25,
        zoneH: { hero: [0, 0], enemy: [0, 1] },
        liquid: null, deep: null, liquidStyle: 'pools',
        barrier: { chance: 0.35, kinds: [
          { kind: 'objects', ids: ['soda_can', 'd20', 'pencil'], w: 2 },
          { kind: 'chasm', w: 1 },                             // the gap between the two folding tables
        ] },
        hazards: [
          { kind: 'surface', id: 'cheeto', w: 3 },
          { kind: 'surface', id: 'water', w: 2 },              // spilled soda (diet, tragically)
          { kind: 'pits', w: 1 },
        ],
        hazardCount: [1, 2],
        obstacleDensity: 0.08, decorDensity: 0.01,
        explosive: [0, 1], braziers: [0, 0], chest: 0.3,
        border: null,
        filler: 'd20',
      },
    },
  ];

  const Themes = (DD.Themes = {});
  LIST.forEach(function (t) { Themes[t.id] = t; });

  // Helpers are non-enumerable so Object.keys(DD.Themes) lists theme ids only.
  function hidden(name, fn) { Object.defineProperty(Themes, name, { value: fn, enumerable: false }); }

  /** Theme ids in definition order. */
  hidden('ids', function () { return LIST.map(function (t) { return t.id; }); });

  /** Theme ids for an act (clamped to 1..3). */
  hidden('forAct', function (act) {
    const a = Math.max(1, Math.min(3, Math.round(+act) || 1));
    return LIST.filter(function (t) { return t.act === a; }).map(function (t) { return t.id; });
  });

  /** Theme object by id (falls back to the cellar; everybody starts in a cellar). */
  hidden('get', function (id) {
    const t = typeof id === 'string' ? Themes[id] : null;
    return t && typeof t === 'object' ? t : Themes.cellar;
  });

  /** True when id names a real theme (not a helper). */
  hidden('has', function (id) { return typeof id === 'string' && !!Themes[id] && typeof Themes[id] === 'object'; });

  /** Random theme id for an act. */
  hidden('random', function (act, rng) {
    const ids = Themes.forAct(act);
    return ids[Math.floor((rng && rng.next ? rng.next() : DD.rng.next()) * ids.length) % ids.length];
  });
})();
