/* Dungeons and Degenerates — js/data/themes.js
 * Map themes (DESIGN §10): what a battlefield is made of (floors, walls, objects, hazards), how it looks
 * (background gradient, ambient particles) and the generation knobs DD.MapGen reads (js/engine/mapgen.js).
 *
 *   DD.Themes.cellar                → theme object (ARCHITECTURE §5.8 fields + the extras documented below)
 *   DD.Themes.forAct(2)             → ['hauntwood', 'academy', 'graveyard']
 *   DD.Themes.get(id) · ids() · random(act, rng)
 * V3: six act-4 arenas (a4_*, plan §6.3). Every act-4 fight is hand-made (a layout), but each still generates a valid
 * procedural map (the mapgen suites, a fallback build). forAct clamps to 1..DD.finalAct(), so they stay out of every
 * random pick until the campaign knob reaches act 4.
 *
 * Extras beyond the contract: floorWeights (parallel to floors) · floorPatch (patch shape per secondary floor:
 * 'blob' | 'rect' | 'strip' | 'path') · raisedFloor + raisedMin (floor used at elevation >= raisedMin, default 1) ·
 * obstacleWeights / decorWeights · surfaces (surface ids the theme sprinkles) · flavor · gen {} ·
 * V3: ambientFallback (a v2 ambient kind for a renderer without the new kind: 'pollen', 'stars') ·
 * borrow { obstacles: { objId: weight } } (content objects added to obstacles after load, only when registered:
 * the barn's hay bales live in the goats' file).
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
    // ---- V3: act IV "Under the Table" (plan §6.3). Hand-made arenas; these gen knobs only back the procedural fallback.
    {
      id: 'a4_conservatory', name: 'The Overgrown Conservatory', act: 4,
      flavor: 'A greenhouse gone feral. The topiary has opinions and the gnomes have seen things.',
      floors: ['grass', 'cobble', 'moss'], floorWeights: [5, 2, 2],
      floorPatch: { cobble: 'path', moss: 'blob' },           // gravel mow lanes through the lawn
      raisedFloor: 'dirt',                                     // terracotta raised planters, full of soil
      walls: 'wall',                                           // cracked brass-framed glass
      obstacles: ['bush', 'tree', 'statue', 'pillar', 'mushroom'], obstacleWeights: [4, 2, 2, 1, 1],
      decor: ['mushroom', 'bones'], decorWeights: [3, 1],      // the bones are fertiliser. Probably.
      hazards: ['water', 'mud', 'poison'],
      liquids: ['water'],
      surfaces: ['water', 'poison'],
      bg: { top: '#18321f', bottom: '#050b07' },
      ambient: 'pollen', ambientFallback: 'fireflies',
      gen: {
        elevation: 'terraces', maxH: 2, cliffs: 0.08,
        zoneH: { hero: [0, 0], enemy: [0, 1] },
        liquid: 'water', deep: null, liquidStyle: 'pools',
        barrier: { chance: 0.5, kinds: [
          { kind: 'objects', ids: ['bush', 'tree', 'bush'], w: 3 },   // a hedge row with gaps someone forgot to trim
          { kind: 'walls', w: 1 },                                     // a glass partition, mostly intact
        ] },
        hazards: [
          { kind: 'pools', terrain: 'water', rim: 'mud', w: 3 },      // the sprinkler pond
          { kind: 'patches', terrain: 'mud', w: 2 },                  // the compost heap
          { kind: 'surface', id: 'poison', w: 1 },                    // weedkiller, applied generously
        ],
        hazardCount: [1, 2],
        obstacleDensity: 0.1, decorDensity: 0.02,
        explosive: [0, 1], braziers: [0, 0], chest: 0.25,
        border: { kind: 'objects', ids: ['bush', 'tree', 'bush'], chance: 0.5 },
        filler: 'tree',
      },
    },
    {
      id: 'a4_lair', name: "The League's Clubhouse", act: 4,
      flavor: 'Five thrones, one very long banner, a shark tank and a trophy wall of your stuff.',
      floors: ['obsidian', 'carpet', 'marble'], floorWeights: [5, 2, 1],
      floorPatch: { carpet: 'strip', marble: 'rect' },        // black marble, the purple carpet runway, the dais
      raisedFloor: 'marble',                                   // the War Room dais and the podium
      walls: 'wall',
      obstacles: ['pillar', 'statue', 'bookshelf', 'crate'], obstacleWeights: [3, 3, 1, 1],
      decor: ['candles', 'gold_pile', 'bones'], decorWeights: [2, 1, 1],
      hazards: ['water', 'deep_water', 'fire', 'oil'],
      liquids: ['water', 'deep_water'],
      surfaces: ['fire', 'oil'],
      bg: { top: '#1c0f28', bottom: '#06030a' },
      ambient: 'embers',
      gen: {
        elevation: 'terraces', maxH: 2, cliffs: 0.12,
        zoneH: { hero: [0, 0], enemy: [0, 2] },
        liquid: 'water', deep: 'deep_water', liquidStyle: 'pools',
        barrier: { chance: 0.45, kinds: [
          { kind: 'channel', terrain: 'water', deep: 'deep_water', crossing: 'bridge', w: 2 },   // the Shark Tank moat
          { kind: 'objects', ids: ['statue', 'pillar', 'statue'], w: 2 },                        // a hall of villain busts
        ] },
        hazards: [
          { kind: 'pools', terrain: 'water', deep: 'deep_water', w: 3 },   // the Shark Tank (sharks sold separately)
          { kind: 'surface', id: 'oil', w: 1 },                            // evil floor polish
        ],
        hazardCount: [1, 2],
        obstacleDensity: 0.08, decorDensity: 0.02,
        explosive: [2, 3], braziers: [1, 2], chest: 0.3,      // Evil Powder Kegs: labelled, for safety
        border: { kind: 'wall', chance: 0.75 },
        filler: 'statue',
      },
    },
    {
      id: 'a4_observatory', name: "Galbraith's Grand Observatory", act: 4,
      flavor: 'Every star on the ceiling has been renamed after Galbraith. Twice.',
      floors: ['marble', 'stone', 'crypt'], floorWeights: [6, 2, 1],
      floorPatch: { stone: 'rect', crypt: 'strip' },          // white marble, star-chart inlays
      raisedFloor: 'stone',                                    // the telescope platforms
      walls: 'wall',
      obstacles: ['pillar', 'statue', 'mirror', 'bookshelf'], obstacleWeights: [4, 2, 2, 2],   // brass orrery columns
      decor: ['candles', 'bones'], decorWeights: [3, 1],
      hazards: ['pit', 'electric', 'ice', 'holy'],
      liquids: [],
      surfaces: ['electric', 'holy'],
      bg: { top: '#0e1240', bottom: '#02030a' },
      ambient: 'stars', ambientFallback: 'dust',
      gen: {
        elevation: 'terraces', maxH: 3, cliffs: 0.12,
        zoneH: { hero: [0, 0], enemy: [0, 2] },
        liquid: null, deep: null, liquidStyle: 'pools',
        barrier: { chance: 0.5, kinds: [
          { kind: 'chasm', w: 3 },                                    // a rift into the starry void
          { kind: 'objects', ids: ['pillar', 'mirror'], w: 1 },
        ] },
        hazards: [
          { kind: 'pits', w: 4 },                                     // the starry void (the floor was optional)
          { kind: 'surface', id: 'electric', w: 1 },                  // loose starlight, crackling
          { kind: 'patches', terrain: 'ice', w: 1 },                  // the cold of deep space, near the door
        ],
        hazardCount: [1, 2],
        extras: [{ kind: 'circle', id: 'holy', w: 1 }],               // the rune ring, signed "G"
        extraChance: 0.5,
        obstacleDensity: 0.08, decorDensity: 0.02,
        explosive: [0, 1], braziers: [1, 2], chest: 0.25,
        border: { kind: 'wall', chance: 0.7 },
        filler: 'pillar',
      },
    },
    {
      id: 'a4_cottage', name: 'Tea with the Coven', act: 4,
      flavor: 'The cottage has chicken legs, the tea has newt in it and the cat is judging you.',
      floors: ['moss', 'grass', 'dirt'], floorWeights: [4, 2, 2],
      floorPatch: { grass: 'blob', dirt: 'path' },
      raisedFloor: null,
      walls: 'wall',
      obstacles: ['dead_tree', 'tree', 'mushroom', 'rock', 'bush'], obstacleWeights: [3, 2, 2, 1, 2],   // gnarled trees, toadstools
      decor: ['mushroom', 'bones', 'candles'], decorWeights: [2, 1, 1],
      hazards: ['mud', 'water', 'deep_water', 'poison'],
      liquids: ['water', 'deep_water'],
      surfaces: ['poison'],
      bg: { top: '#1d2a1a', bottom: '#070a06' },
      ambient: 'fog',
      gen: {
        elevation: 'hills', maxH: 2, cliffs: 0.08,
        zoneH: { hero: [0, 1], enemy: [0, 1] },
        liquid: 'water', deep: 'deep_water', liquidStyle: 'pools',
        barrier: { chance: 0.45, kinds: [
          { kind: 'river', terrain: 'water', deep: 'deep_water', crossing: 'bridge', w: 2 },   // the bog creek
          { kind: 'objects', ids: ['dead_tree', 'bush', 'tree'], w: 2 },
        ] },
        hazards: [
          { kind: 'patches', terrain: 'mud', w: 3 },                  // the bog
          { kind: 'pools', terrain: 'water', rim: 'mud', w: 2 },      // the pools (do not drink)
          { kind: 'surface', id: 'poison', w: 1 },                    // a spilled brew
        ],
        hazardCount: [1, 2],
        obstacleDensity: 0.09, decorDensity: 0.025,
        explosive: [0, 0], braziers: [0, 1], chest: 0.2,
        border: { kind: 'objects', ids: ['dead_tree', 'tree', 'bush'], chance: 0.5 },
        filler: 'tree',
      },
    },
    {
      id: 'a4_barn', name: 'The Barn Burner', act: 4,
      flavor: 'A barn done up as a club. The crowd is three chickens, a cow and a sheep. Tough room.',
      floors: ['wood', 'sand'], floorWeights: [9, 1],
      floorPatch: { sand: 'blob' },                            // worn planks with loose straw
      raisedFloor: 'wood',                                     // the hayloft stage and the DJ dais
      walls: 'wall',                                           // barn-red boards
      obstacles: ['pillar', 'crate', 'barrel', 'fence'], obstacleWeights: [3, 2, 2, 1],   // barn posts, feed, stall fences
      decor: ['candles'], decorWeights: [1],                  // lanterns. In a barn. Full of hay. What could go wrong.
      hazards: ['rubble', 'oil', 'fire', 'water'],
      liquids: ['water'],
      surfaces: ['oil', 'fire'],
      bg: { top: '#2a1210', bottom: '#070302' },
      ambient: 'dust',
      borrow: { obstacles: { rap_bale: 5 } },                  // the goats' Hay Bales (burn), when their file is loaded
      gen: {
        elevation: 'terraces', maxH: 2, cliffs: 0.1,
        zoneH: { hero: [0, 0], enemy: [0, 1] },
        liquid: 'water', deep: null, liquidStyle: 'pools',
        barrier: { chance: 0.4, kinds: [
          { kind: 'objects', ids: ['fence', 'crate', 'fence'], w: 2 },   // the stalls
          { kind: 'walls', w: 1 },
        ] },
        hazards: [                                                       // no pits: it is a barn, not a dungeon
          { kind: 'patches', terrain: 'rubble', w: 3 },                  // loose hay (slow going)
          { kind: 'surface', id: 'oil', w: 2 },                          // lantern oil, right next to the hay
          { kind: 'pools', terrain: 'water', w: 1 },                     // the water trough, overturned
        ],
        hazardCount: [1, 2],
        extras: [{ kind: 'walls', w: 2 }, { kind: 'cluster', id: 'crate', w: 1 }],   // stall partitions, a feed pile
        extraChance: 0.6,
        obstacleDensity: 0.09, decorDensity: 0.015,
        explosive: [0, 1], braziers: [0, 1], chest: 0.2,
        border: { kind: 'wall', chance: 0.9 },                           // a walled barn
        filler: 'pillar',
      },
    },
    {
      id: 'a4_underfloor', name: 'The Last Floor', act: 4,
      flavor: "Under the DM's table: gum overhead, a canoe-sized Cheeto and a demon who owns the floor.",
      floors: ['obsidian', 'paper'], floorWeights: [3, 2],
      floorPatch: { paper: 'rect' },                           // black-and-cream linoleum panels
      raisedFloor: 'paper',
      walls: 'wall',
      obstacles: ['pillar', 'd20', 'soda_can', 'pencil'], obstacleWeights: [3, 3, 2, 1],   // giant table legs, lost dice
      decor: ['bones', 'gold_pile'], decorWeights: [2, 1],    // previous parties; their loot
      hazards: ['pit', 'cheeto', 'water'],
      liquids: [],
      surfaces: ['cheeto', 'water'],
      bg: { top: '#2a1a10', bottom: '#070403' },
      ambient: 'dust',
      gen: {
        elevation: 'terraces', maxH: 2, cliffs: 0.1,
        zoneH: { hero: [0, 0], enemy: [0, 1] },
        liquid: null, deep: null, liquidStyle: 'pools',
        barrier: { chance: 0.5, kinds: [
          { kind: 'chasm', w: 3 },                                    // a row of missing panels: the void
          { kind: 'objects', ids: ['pillar', 'd20'], w: 1 },
        ] },
        hazards: [
          { kind: 'pits', w: 4 },                                     // missing panels (he took them)
          { kind: 'surface', id: 'cheeto', w: 2 },
          { kind: 'surface', id: 'water', w: 1 },                     // spilled soda, still fizzing
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

  /** Theme ids for an act (clamped to 1..DD.finalAct(): the act-4 arenas only once the campaign has an act 4). */
  hidden('forAct', function (act) {
    const a = Math.max(1, Math.min(DD.finalAct(), Math.round(+act) || 1));
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
    if (!ids.length) return 'cellar';
    return ids[Math.floor((rng && rng.next ? rng.next() : DD.rng.next()) * ids.length) % ids.length];
  });

  // V3: borrowed obstacles join a theme once every file has loaded, and only if their content registered them
  DD.afterLoad(function () {
    LIST.forEach(function (t) {
      const b = t.borrow && t.borrow.obstacles;
      if (!b || typeof b !== 'object') return;
      Object.keys(b).forEach(function (id) {
        if (!DD.getObject(id) || t.obstacles.indexOf(id) >= 0) return;
        t.obstacles.push(id);
        t.obstacleWeights.push(Math.max(0, +b[id] || 1));
      });
    });
  });
})();
