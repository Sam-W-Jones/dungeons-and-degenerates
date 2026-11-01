/* Dungeons and Degenerates — js/run/rewards.js
 * Loot and progression numbers (DD.Rewards, ARCHITECTURE §9.4, DESIGN §3/§5): the level-ups per won fight (v2: no
 * XP — one hero levels up per win, see DD.Run), combat gold, "pick 1 of 3" reward choices, item / consumable /
 * skill-tome rolls with act-shifted rarity odds, treasure, shop stock and prices. Every roll takes an RNG (defaults
 * to DD.Run.rng()). Empty item / consumable / skill registries degrade to gold rewards. apply() goes through DD.Run
 * so the run state stays the source of truth.
 * Reward = { type: 'item'|'skill'|'upgrade'|'consumable'|'gold'|'heal', id?, heroIdx?, heroId?, amount?, icon, label, desc }
 */
(function () {
  'use strict';
  const DD = window.DD;

  const MAX_LEVEL = 10;
  // DESIGN §3 (v2): exactly one hero levels up per won fight — normal, elite, boss or event fight alike. The one
  // place to change it; DD.Balance.leveling.perWin (a number, or { normal, elite, boss }) overrides it.
  const LEVEL_UPS_PER_WIN = 1;
  // Gold, prices and healing amounts are DD.Balance knobs (js/data/balance.js); these are the fallbacks.
  const FALLBACK = {
    prices: { common: 40, rare: 80, legendary: 150, cursed: 25, consumable: 25, tome: 60, scar: 45, heal: 30, reroll: 40 },
    gold: { fight: { normal: [12, 20], elite: [35, 50], boss: [80, 100] }, fightPerAct: { normal: 6, elite: 0, boss: 0 }, finalBoss: 1,
      pile: [30, 45], pilePerAct: 15, treasure: [20, 35], treasurePerAct: 10 },
    heal: { reward: 0.3, shop: 0.3 },
  };
  function BAL(key) { return (DD.Balance && DD.Balance[key]) || FALLBACK[key]; }
  function range(r, fb) { return Array.isArray(r) && r.length ? [Math.round(+r[0]) || 0, Math.round(+(r.length > 1 ? r[1] : r[0])) || 0] : fb; }
  const PRICES = {};
  Object.keys(FALLBACK.prices).forEach(function (k) {
    Object.defineProperty(PRICES, k, { enumerable: true, get: function () { const p = BAL('prices')[k]; return typeof p === 'number' ? p : FALLBACK.prices[k]; } });
  });
  const RARITY_ODDS = {
    1: { common: 70, rare: 25, legendary: 3, cursed: 2 },
    2: { common: 50, rare: 38, legendary: 8, cursed: 4 },
    3: { common: 32, rare: 46, legendary: 16, cursed: 6 },
  };
  const RARITY_FALLBACK = {
    legendary: ['legendary', 'rare', 'common'], rare: ['rare', 'common', 'legendary'],
    common: ['common', 'rare', 'legendary'], cursed: ['cursed', 'common', 'rare'],
  };
  const RARITY_NAMES = { common: 'Common', rare: 'Rare', legendary: 'Legendary', cursed: 'Cursed' };
  const REWARD_WEIGHTS = { item: 3, skill: 2, upgrade: 1.5, consumable: 1.4, gold: 1, heal: 0.6 };
  function healFrac(k) { const v = BAL('heal')[k]; return typeof v === 'number' && v > 0 ? v : FALLBACK.heal[k]; }
  const SHOP = { items: 3, tomes: 2, consumables: 2 };
  Object.defineProperty(SHOP, 'heal', { enumerable: true, get: function () { return healFrac('shop'); } });
  const SLOTS = ['weapon', 'armor', 'trinket'];

  function values(o) { return Object.keys(o || {}).map(function (k) { return o[k]; }); }
  function runOf(run) { return run || (DD.Run && DD.Run.state) || null; }
  function rngOf(rng) { return rng || (DD.Run && DD.Run.rng ? DD.Run.rng() : DD.RNG()); }
  function actIdx(act) { return Math.max(1, Math.min(3, Math.floor(+act) || 1)); }
  function kindKey(kind) { return kind === 'elite' || kind === 'boss' ? kind : 'normal'; }
  function weightOf(def) { const w = def && def.weight; return typeof w === 'number' && isFinite(w) ? Math.max(0, w) : 1; }
  function heroName(rh) { const d = rh && DD.getHero(rh.id); return d ? d.name : (rh ? rh.id : 'Someone'); }
  function roman(n) { return DD.util.roman(n); }
  function aliveIdx(run) {
    const out = [];
    ((run && run.party) || []).forEach(function (h, i) { if (h && !h.dead) out.push(i); });
    return out;
  }
  function partyIds(run) { return aliveIdx(run).map(function (i) { return run.party[i].id; }); }

  /** Every item id the run owns (bag + equipped). */
  function ownedItems(run) {
    const out = [];
    if (!run) return out;
    (run.inventory || []).forEach(function (id) { out.push(id); });
    (run.party || []).forEach(function (h) {
      if (h && h.items) SLOTS.forEach(function (s) { if (h.items[s]) out.push(h.items[s]); });
    });
    return out;
  }

  // ---- level-ups & gold ---------------------------------------------------------------------------
  /** Level-ups a won fight of `kind` grants: LEVEL_UPS_PER_WIN unless DD.Balance.leveling.perWin says otherwise
   *  (a number for every kind, or per kind). Integer 0..4. */
  function levelUpsFor(kind) {
    const L = DD.Balance && DD.Balance.leveling;
    let v = L && typeof L === 'object' ? L.perWin : undefined;
    if (v && typeof v === 'object') v = v[kindKey(kind)];
    v = typeof v === 'number' && isFinite(v) ? v : LEVEL_UPS_PER_WIN;
    return Math.max(0, Math.min(4, Math.floor(v)));
  }
  /** Fight gold: DD.Balance.gold.fight[kind] [min, max] + fightPerAct[kind] × (act − 1), × mult (encounter goldMult),
   *  × gold.finalBoss for the boss of the final act (opts.final). */
  function combatGold(kind, act, rng, mult, opts) {
    rng = rngOf(rng);
    const g = BAL('gold'), k = kindKey(kind);
    const r = range(g.fight && g.fight[k], FALLBACK.gold.fight[k]);
    const per = g.fightPerAct && typeof g.fightPerAct[k] === 'number' ? g.fightPerAct[k] : FALLBACK.gold.fightPerAct[k];
    let n = rng.int(r[0], r[1]) + per * (actIdx(act) - 1);
    if (opts && opts.final && k === 'boss' && typeof g.finalBoss === 'number') n *= Math.max(0, g.finalBoss);
    return Math.max(0, Math.round(n * (typeof mult === 'number' && mult >= 0 ? mult : 1)));
  }

  // ---- rolls ----------------------------------------------------------------------------------------
  function rarityOdds(act) { return Object.assign({}, RARITY_ODDS[actIdx(act)]); }
  /** opts: noCursed, cursedMult, boost (treasure: halves the common weight). */
  function rollRarity(act, rng, opts) {
    opts = opts || {};
    const odds = rarityOdds(act);
    if (opts.noCursed) delete odds.cursed;
    if (opts.cursedMult) odds.cursed = (odds.cursed || 0) * opts.cursedMult;
    if (opts.boost) odds.common *= 0.5;
    return rngOf(rng).weighted(Object.keys(odds), function (k) { return odds[k]; });
  }

  /** Random item id. opts: { rarity, act, slot, hero, run, exclude, boost, noCursed }. Prefers items the party
   *  does not own; hero-specific items only for heroes in the party. null when the registry has nothing usable. */
  function randomItem(opts, rng) {
    opts = opts || {};
    rng = rngOf(rng);
    const run = runOf(opts.run);
    const heroIds = opts.hero ? [opts.hero] : partyIds(run);
    const strict = opts.exclude || [];
    const owned = ownedItems(run);
    const all = values(DD.defs.items).filter(function (d) {
      return d && d.id && SLOTS.indexOf(d.slot) >= 0 && !d.noDrop && strict.indexOf(d.id) < 0 &&
        (!d.hero || heroIds.indexOf(d.hero) >= 0) && (!opts.slot || d.slot === opts.slot);
    });
    if (!all.length) return opts.slot ? randomItem(Object.assign({}, opts, { slot: null }), rng) : null;
    const rarity = opts.rarity || rollRarity(opts.act || (run && run.act) || 1, rng, opts);
    const chain = RARITY_FALLBACK[rarity] || [rarity, 'common', 'rare', 'legendary'];
    for (let i = 0; i < chain.length; i++) {
      const ofRarity = all.filter(function (d) { return d.rarity === chain[i]; });
      const fresh = ofRarity.filter(function (d) { return owned.indexOf(d.id) < 0; });
      const pool = fresh.length ? fresh : ofRarity;
      if (pool.length) return rng.weighted(pool, weightOf).id;
    }
    return rng.weighted(all, weightOf).id;
  }

  /** Random consumable id (commons ~2.5x as likely as rares). opts: { exclude, rarity }. */
  function randomConsumable(rng, opts) {
    opts = opts || {};
    const all = values(DD.defs.consumables).filter(function (d) { return d && d.id && !d.noDrop; });
    if (!all.length) return null;
    const ex = opts.exclude || [];
    let pool = all.filter(function (d) { return ex.indexOf(d.id) < 0; });
    if (!pool.length) pool = all;
    if (opts.rarity) {
      const r = pool.filter(function (d) { return d.rarity === opts.rarity; });
      if (r.length) pool = r;
    }
    return rngOf(rng).weighted(pool, function (d) { return (d.rarity === 'rare' ? 1 : 2.5) * weightOf(d); }).id;
  }

  // ---- reward objects ----------------------------------------------------------------------------------
  function itemReward(id, run) {
    const d = DD.getItem(id);
    if (!d) return null;
    run = runOf(run);
    const r = { type: 'item', id: id, icon: d.icon, rarity: d.rarity, label: d.name, desc: '' };
    let who = '';
    if (d.hero) {
      const idx = run ? run.party.findIndex(function (h) { return h && h.id === d.hero; }) : -1;
      if (idx >= 0) { r.heroIdx = idx; r.heroId = d.hero; }
      const hd = DD.getHero(d.hero);
      who = ' (' + (hd ? hd.name : d.hero) + ' only)';
    }
    r.desc = (RARITY_NAMES[d.rarity] || DD.util.capitalize(d.rarity)) + ' ' + d.slot + who + ': ' + (d.desc || '');
    return r;
  }

  function skillReward(run, idx, skillId) {
    const s = DD.getSkill(skillId);
    const rh = run && run.party[idx];
    if (!s || !rh) return null;
    return {
      type: 'skill', id: skillId, heroIdx: idx, heroId: rh.id, icon: s.icon || '📖',
      label: 'Skill Tome: ' + s.name,
      desc: heroName(rh) + ' learns ' + s.name + ' I: ' + DD.skillDesc(s, 1, null),
    };
  }

  function upgradeReward(run, idx, skillIdx) {
    const rh = run && run.party[idx];
    const slot = rh && rh.skills[skillIdx];
    if (!slot) return null;
    const s = DD.getSkill(slot.id);
    const name = s ? s.name : slot.id;
    const next = slot.level + 1;
    return {
      type: 'upgrade', id: slot.id, heroIdx: idx, heroId: rh.id, skillIdx: skillIdx, level: next,
      icon: (s && s.icon) || '⬆️', label: name + ' ' + roman(next),
      desc: 'Upgrade ' + heroName(rh) + '\'s ' + name + ' to ' + roman(next) + ': ' + DD.skillDesc(s, next, null),
    };
  }

  function consumableReward(id) {
    const d = DD.getConsumable(id);
    return d ? { type: 'consumable', id: id, icon: d.icon, rarity: d.rarity, label: d.name, desc: d.desc || '' } : null;
  }
  function goldReward(n) {
    return { type: 'gold', amount: n, icon: '💰', label: 'Suspiciously Heavy Sack', desc: 'Gain ' + n + ' gold.' };
  }
  function goldPile(act, rng) {
    const g = BAL('gold'), r = range(g.pile, FALLBACK.gold.pile);
    const per = typeof g.pilePerAct === 'number' ? g.pilePerAct : FALLBACK.gold.pilePerAct;
    return goldReward(rngOf(rng).int(r[0], r[1]) + per * (actIdx(act) - 1));
  }
  function healReward() {
    const f = healFrac('reward');
    return { type: 'heal', amount: f, icon: '🍲', label: 'Mystery Stew', desc: 'Every living hero heals ' + Math.round(f * 100) + '% of their max HP.' };
  }

  /** Skill tome for a hero (random living hero when heroIdx is not given): an unlearned skill from their pool
   *  (65%) or the generic pool. opts.exclude: skill ids already offered. */
  function skillTome(heroIdx, rng, run, opts) {
    opts = opts || {};
    rng = rngOf(rng);
    run = runOf(run);
    if (!run || !DD.Run || !DD.Run.learnableFor) return null;
    const alive = aliveIdx(run);
    const order = typeof heroIdx === 'number' && alive.indexOf(heroIdx) >= 0 ? [heroIdx] : rng.shuffle(alive);
    const ex = opts.exclude || [];
    for (let i = 0; i < order.length; i++) {
      const rh = run.party[order[i]];
      const own = DD.Run.learnableFor(rh, { generic: false }).filter(function (id) { return ex.indexOf(id) < 0; });
      const gen = DD.Run.learnableFor(rh, { generic: true }).filter(function (id) { return own.indexOf(id) < 0 && ex.indexOf(id) < 0; });
      let id = null;
      if (own.length && (!gen.length || rng.chance(0.65))) id = rng.pick(own);
      else if (gen.length) id = rng.pick(gen);
      if (id) return skillReward(run, order[i], id);
    }
    return null;
  }

  /** "+1 level" offer for a random socketed skill below its max (random living hero unless heroIdx). */
  function upgradeOffer(run, rng, heroIdx) {
    run = runOf(run);
    rng = rngOf(rng);
    if (!run || !DD.Run || !DD.Run.upgradableFor) return null;
    const alive = aliveIdx(run);
    const order = typeof heroIdx === 'number' && alive.indexOf(heroIdx) >= 0 ? [heroIdx] : rng.shuffle(alive);
    for (let i = 0; i < order.length; i++) {
      const ups = DD.Run.upgradableFor(run.party[order[i]]);
      if (ups.length) return upgradeReward(run, order[i], rng.pick(ups));
    }
    return null;
  }

  function anyoneHurt(run) {
    return !!run && run.party.some(function (h) {
      return h && !h.dead && DD.Run && DD.Run.heroStats && h.hp < DD.Run.heroStats(h).maxHp;
    });
  }

  function makeReward(type, act, rng, run, used) {
    switch (type) {
      case 'item': {
        const id = randomItem({ act: act, run: run, exclude: used.items }, rng);
        return id ? itemReward(id, run) : null;
      }
      case 'skill': return skillTome(null, rng, run, { exclude: used.skills });
      case 'upgrade': return upgradeOffer(run, rng);
      case 'consumable': {
        if (run && run.consumables && run.consumables.length >= (run.maxConsumables || 3)) return null;
        const id = randomConsumable(rng);
        return id ? consumableReward(id) : null;
      }
      case 'gold': return goldPile(act, rng);
      case 'heal': return anyoneHurt(run) ? healReward() : null;
      default: return null;
    }
  }

  function track(used, r) {
    used.types[r.type] = true;
    if (r.type === 'item') used.items.push(r.id);
    if (r.type === 'skill') used.skills.push(r.id);
  }

  /** Fill `choices` up to n with distinct reward types; gold piles when nothing else is possible. */
  function fillChoices(choices, used, act, rng, run, n) {
    const hurt = anyoneHurt(run);
    const pool = Object.keys(REWARD_WEIGHTS).filter(function (t) { return !used.types[t]; });
    while (choices.length < n && pool.length) {
      const type = rng.weighted(pool, function (t) { return REWARD_WEIGHTS[t] * (t === 'heal' && hurt ? 2.5 : 1); });
      pool.splice(pool.indexOf(type), 1);
      const r = makeReward(type, act, rng, run, used);
      if (r) { choices.push(r); track(used, r); }
    }
    while (choices.length < n) choices.push(goldPile(act, rng));
    return choices;
  }

  /** Post-combat loot: { gold, levelUpCount (rotation level-ups the win grants, levelUpsFor), choices: [3 Rewards] }.
   *  Elites guarantee a rare item, bosses a legendary (opts.itemRarity overrides, from encounter.reward.itemRarity).
   *  opts.goldMult scales gold. */
  function combat(kind, act, rng, run, opts) {
    opts = opts || {};
    rng = rngOf(rng);
    run = runOf(run);
    kind = kindKey(kind);
    const out = { gold: combatGold(kind, act, rng, opts.goldMult, { final: !!opts.final }), levelUpCount: levelUpsFor(kind), choices: [] };
    const used = { types: {}, items: [], skills: [] };
    const guaranteed = opts.itemRarity || (kind === 'boss' ? 'legendary' : kind === 'elite' ? 'rare' : null);
    if (guaranteed) {
      const id = randomItem({ rarity: guaranteed, act: act, run: run, noCursed: true }, rng);
      const r = id && itemReward(id, run);
      if (r) { out.choices.push(r); track(used, r); }
    }
    fillChoices(out.choices, used, act, rng, run, 3);
    return out;
  }

  /** Treasure node: { gold, choices } — two items (the first with boosted rarity) plus one other reward. */
  function treasure(act, rng, run) {
    rng = rngOf(rng);
    run = runOf(run);
    const g = BAL('gold'), tr = range(g.treasure, FALLBACK.gold.treasure);
    const gold = rng.int(tr[0], tr[1]) + (typeof g.treasurePerAct === 'number' ? g.treasurePerAct : FALLBACK.gold.treasurePerAct) * (actIdx(act) - 1);
    const choices = [];
    const used = { types: {}, items: [], skills: [] };
    [{ boost: true, noCursed: true }, {}].forEach(function (o) {
      const id = randomItem(Object.assign({ act: act, run: run, exclude: used.items }, o), rng);
      const r = id && itemReward(id, run);
      if (r) { choices.push(r); track(used, r); }
    });
    fillChoices(choices, used, act, rng, run, 3);
    return { gold: gold, choices: choices };
  }

  // ---- prices & shop ------------------------------------------------------------------------------------
  function itemPrice(id) {
    const d = DD.getItem(id);
    if (!d) return 0;
    return typeof d.price === 'number' && d.price >= 0 ? Math.round(d.price) : (PRICES[d.rarity] || 50);
  }
  function consumablePrice(id) {
    const d = DD.getConsumable(id);
    if (!d) return 0;
    return typeof d.price === 'number' && d.price >= 0 ? Math.round(d.price) : PRICES.consumable;
  }
  function price(kind, id) {
    if (kind === 'item') return itemPrice(id);
    if (kind === 'consumable') return consumablePrice(id);
    if (kind === 'tome' || kind === 'skill') return PRICES.tome;
    return PRICES[kind] || 0;
  }
  /** A shop price in an act (DD.Balance.priceAct inflation; 0 stays 0). */
  function actPrice(p, act) {
    const m = DD.Balance && DD.Balance.priceMultOf ? DD.Balance.priceMultOf(actIdx(act)) : 1;
    return Math.max(0, Math.round((+p || 0) * m));
  }

  /** Shop stock (DESIGN §3): 3 items, 2 skill tomes, 2 consumables, services (heal 30%, remove a scar, and
   *  re-roll a Blessing while the passive table has entries). Every entry is a Reward plus { price, sold };
   *  services are { type: 'service', id: 'heal'|'scar'|'reroll', ... }. */
  function shopInventory(act, rng, run) {
    rng = rngOf(rng);
    run = runOf(run);
    const inv = { act: actIdx(act), items: [], tomes: [], consumables: [], services: [] };
    const usedItems = [];
    let legendaries = 0, cursed = 0;
    for (let i = 0; i < SHOP.items; i++) {
      let rarity = rollRarity(act, rng, { cursedMult: 2 });
      if (rarity === 'legendary' && legendaries) rarity = 'rare';
      if (rarity === 'cursed' && cursed) rarity = 'common';
      const id = randomItem({ rarity: rarity, act: act, run: run, exclude: usedItems }, rng);
      if (!id) break;
      usedItems.push(id);
      const d = DD.getItem(id);
      if (d.rarity === 'legendary') legendaries++;
      if (d.rarity === 'cursed') cursed++;
      inv.items.push(Object.assign(itemReward(id, run), { price: actPrice(itemPrice(id), act), sold: false }));
    }
    const usedSkills = [];
    for (let i = 0; i < SHOP.tomes; i++) {
      const t = skillTome(null, rng, run, { exclude: usedSkills });
      if (!t) break;
      usedSkills.push(t.id);
      inv.tomes.push(Object.assign(t, { price: actPrice(PRICES.tome, act), sold: false }));
    }
    const usedC = [];
    for (let i = 0; i < SHOP.consumables; i++) {
      const id = randomConsumable(rng, { exclude: usedC });
      if (!id || usedC.indexOf(id) >= 0) break;
      usedC.push(id);
      inv.consumables.push(Object.assign(consumableReward(id), { price: actPrice(consumablePrice(id), act), sold: false }));
    }
    inv.services.push({
      type: 'service', id: 'heal', icon: '🩹', label: 'Questionable Bandages',
      desc: 'Every living hero heals ' + Math.round(SHOP.heal * 100) + '% of their max HP.', price: actPrice(PRICES.heal, act), sold: false,
    });
    inv.services.push({
      type: 'service', id: 'scar', icon: '🧴', label: 'Scar Cream (Probably Expired)',
      desc: 'Remove one scar from a hero.', price: actPrice(PRICES.scar, act), sold: false,
    });
    if (DD.Passives && DD.Passives.count() > 0) {
      inv.services.push({
        type: 'service', id: 'reroll', icon: '🎲', label: 'Re-roll a Blessing',
        desc: 'A hero tosses one Blessing (gone for good) and rolls a fresh one on the Table of Questionable Blessings (never the one they tossed).',
        price: actPrice(PRICES.reroll, act), sold: false,
      });
    }
    return inv;
  }

  // ---- applying -------------------------------------------------------------------------------------------
  function heroIdxOf(reward, run) {
    if (reward.heroId) return run.party.findIndex(function (h) { return h && h.id === reward.heroId; });
    return typeof reward.heroIdx === 'number' ? reward.heroIdx : -1;
  }
  function fail(text, reason) { return { ok: false, reason: reason || 'invalid', text: text }; }

  function applyInner(reward, opts, Run, run) {
    switch (reward.type) {
      case 'gold': {
        const n = Run.addGold(Math.max(0, Math.round(reward.amount || 0)));
        return { ok: true, text: '+' + n + ' gold.' };
      }
      case 'heal': {
        const healed = Run.healParty(reward.amount > 0 ? reward.amount : healFrac('reward'));
        return { ok: true, healed: healed, text: 'The party heals ' + healed + ' HP. It tasted like regret.' };
      }
      case 'item': {
        const d = DD.getItem(reward.id);
        if (!d) return fail('That item no longer exists. Spooky.');
        Run.addItem(reward.id);
        const prefer = typeof opts.heroIdx === 'number' ? opts.heroIdx : heroIdxOf(reward, run);
        const eq = opts.equip === false ? -1 : Run.autoEquip(reward.id, prefer);
        return { ok: true, equippedTo: eq, text: eq >= 0 ? d.name + ' equipped on ' + Run.heroName(eq) + '.' : d.name + ' added to the bag.' };
      }
      case 'consumable': {
        const d = DD.getConsumable(reward.id);
        if (!d) return fail('That potion evaporated. Suspicious.');
        if (!Run.addConsumable(reward.id)) return fail('Your pockets are full. Use or toss a consumable first.', 'full');
        return { ok: true, text: d.name + ' added to your consumables.' };
      }
      case 'skill': {
        const idx = heroIdxOf(reward, run);
        if (idx < 0 || !run.party[idx] || run.party[idx].dead) return fail('That hero is no longer available.', 'gone');
        return Run.giveSkill(idx, reward.id, 'tome', opts.replaceIdx);
      }
      case 'upgrade': {
        const idx = heroIdxOf(reward, run);
        const rh = run.party[idx];
        const si = rh ? rh.skills.findIndex(function (s) { return s.id === reward.id; }) : -1;
        if (si < 0 || !Run.upgradeSkill(idx, si)) return fail('That skill can not be upgraded any further.', 'maxed');
        const s = DD.getSkill(reward.id);
        return { ok: true, text: Run.heroName(idx) + '\'s ' + (s ? s.name : reward.id) + ' is now level ' + roman(rh.skills[si].level) + '.' };
      }
      default:
        return fail('Unknown reward.');
    }
  }

  /** Apply a Reward to the run. opts: { run, replaceIdx (skill tomes: socket to replace, -1 = skip),
   *  heroIdx (preferred hero for items), equip: false }. Returns { ok, text, reason?, queued?, equippedTo? }.
   *  When the reward belongs to the pending rewards screen it is marked as taken (one pick per screen). */
  function apply(reward, opts) {
    opts = opts || {};
    const Run = DD.Run;
    const run = runOf(opts.run);
    if (!reward || !Run || !run) return fail('Nothing to take.');
    if (Run.isRewardTaken && Run.isRewardTaken(reward)) return fail('You already took your pick. Greedy.', 'taken');
    const res = applyInner(reward, opts, Run, run);
    if (res.ok && Run.noteRewardApplied) Run.noteRewardApplied(reward);
    return res;
  }

  DD.Rewards = {
    MAX_LEVEL: MAX_LEVEL,
    LEVEL_UPS_PER_WIN: LEVEL_UPS_PER_WIN,
    levelUpsFor: levelUpsFor,
    PRICES: PRICES,
    RARITY_ODDS: RARITY_ODDS,
    RARITY_NAMES: RARITY_NAMES,
    SLOTS: SLOTS,
    get HEAL_REWARD() { return healFrac('reward'); },
    SHOP: SHOP,
    combatGold: combatGold,
    rarityOdds: rarityOdds,
    rollRarity: rollRarity,
    combat: combat,
    treasure: treasure,
    apply: apply,
    randomItem: randomItem,
    randomConsumable: randomConsumable,
    skillTome: skillTome,
    upgradeOffer: upgradeOffer,
    goldPile: goldPile,
    goldReward: goldReward,
    healReward: healReward,
    itemReward: itemReward,
    consumableReward: consumableReward,
    shopInventory: shopInventory,
    itemPrice: itemPrice,
    consumablePrice: consumablePrice,
    price: price,
    ownedItems: ownedItems,
    describe: function (r) { return r ? { icon: r.icon || '', label: r.label || '', desc: r.desc || '' } : null; },
  };
})();
