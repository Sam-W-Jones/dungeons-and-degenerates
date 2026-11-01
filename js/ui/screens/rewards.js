/* Dungeons and Degenerates — js/ui/screens/rewards.js
 * Post-combat rewards: victory banner + DM line, gold summary, the fight's level-up announced as a little DM moment
 * (v2, no XP: "The DM rolls a d4… 3! Marwyn levels up!" — one hero per won fight, drawn among the lowest levels, with
 * the party lineup and who is next), casualties, a comedic MVP award computed from the combat stats, "pick 1 of 3"
 * reward cards (item / skill tome / upgrade / consumable / gold / heal, applied via DD.Rewards.apply with the
 * forget-a-skill picker when needed), then the level-up flow for the hero who leveled.
 * Params (from DD.Run.finishCombat, or run.pending.data when resumed):
 *   { gold, choices: [Reward], levelUps: [LevelUp], leveled: [heroIdx], kind, title, next } — `rewards: {...}`
 *   nesting is accepted too. Older saves may carry XP fields; they are ignored.
 */
(function () {
  'use strict';
  const DD = window.DD;

  const VICTORY_FALLBACK = [
    'Victory! The DM sighs and erases three pages of notes.',
    'The enemies are dead. Your dignity is mostly intact.',
    'A win! The DM mutters something about "next time".',
  ];

  const AWARDS = {
    kills: ['Murderhobo of the Match', 'Certified Murderhobo', 'Head Collector (Ew)'],
    dmg: ['Professional Overkiller', 'Damage Goblin of the Day', 'Most Likely to Set the Party on Fire'],
    heals: ['Unpaid Healer of the Week', 'Band-Aid Supreme', 'Keeper of Everyone Else\'s HP'],
    taken: ['Designated Punching Bag', 'Human Shield (Unwilling)', 'Face Tank Extraordinaire'],
  };
  const TROPHIES = ['Participation Trophy', 'Honorary Furniture', 'Emotional Support Party Member', 'Stood Near the Fight'];
  // the level-up moment (picked by the reward id, so a reload shows the same line)
  const LEVEL_QUIPS = [
    'The DM writes it down in pen. It is official now.',
    'The dice have spoken. The dice are smug about it.',
    'Nobody saw the roll. Everybody believes it anyway.',
    'The rest of the party pretends not to be jealous.',
    'The DM hums a little fanfare. Badly.',
  ];
  const ROLL_MS = 850;

  let st = null;

  function num(v) { v = +v; return isFinite(v) ? v : 0; }

  function normalize(params) {
    const UI = DD.UI;
    const run = UI.run();
    let p = Object.assign({}, params || {});
    if (run && run.pending && run.pending.type === 'rewards' && run.pending.data && typeof run.pending.data === 'object') {
      p = Object.assign({}, run.pending.data, p);
    }
    const r = p.rewards && typeof p.rewards === 'object' && !Array.isArray(p.rewards) ? Object.assign({}, p.rewards, p) : p;
    let picked = null;
    if (typeof r.taken === 'number') picked = r.taken;
    else if (r.skipped) picked = -1;
    else if (typeof r.picked === 'number') picked = r.picked;
    return {
      id: r.id || '', gold: num(r.gold),
      choices: (Array.isArray(r.choices) ? r.choices : Array.isArray(p.rewards) ? p.rewards : []).filter(Boolean),
      levelUps: (Array.isArray(r.levelUps) ? r.levelUps : []).filter(function (x) { return x && typeof x.heroIdx === 'number'; }),
      leveled: Array.isArray(r.leveled) ? r.leveled.slice() : [],
      downed: Array.isArray(r.downed) ? r.downed : [], scars: Array.isArray(r.scars) ? r.scars : [], deaths: Array.isArray(r.deaths) ? r.deaths : [],
      kills: r.kills !== undefined ? num(r.kills) : null,
      kind: r.kind || 'normal', source: r.source || null, title: r.title || null, text: r.text || '', encounterName: r.encounterName || '', encounterId: r.encounterId || null,
      next: p.next || null, actClear: r.actClear || null,
      picked: picked,
      boss: r.kind === 'boss' || r.source === 'boss' || !!r.boss,
    };
  }

  /** The finished fight's combat state, only when it is the fight these rewards are for (never a stale one). */
  function freshCombat() {
    const cs = DD.Combat && DD.Combat.state;
    if (!cs || !st || !st.data.encounterId) return null;
    const enc = cs.encounter;
    const encId = enc && typeof enc === 'object' ? enc.id : enc;
    return encId === st.data.encounterId ? cs : null;
  }

  /** MVP + trophy from the fight's stats (summons credit their owners). */
  function computeAwards() {
    const UI = DD.UI;
    const cs = freshCombat();
    if (!cs || !cs.stats || !cs.stats.units || !cs.units) return null;
    const byHero = {};
    const unitById = {};
    cs.units.forEach(function (u) { unitById[u.id] = u; });
    Object.keys(cs.stats.units).forEach(function (uid) {
      const u = unitById[uid];
      if (!u) return;
      let owner = u;
      if (u.kind === 'summon' && u.ownerId && unitById[u.ownerId]) owner = unitById[u.ownerId];
      if (owner.kind !== 'hero') return;
      const s = cs.stats.units[uid] || {};
      const b = byHero[owner.defId] = byHero[owner.defId] || { id: owner.defId, dmg: 0, kills: 0, heals: 0, taken: 0 };
      b.dmg += num(s.dmg); b.kills += num(s.kills); b.heals += num(s.heals);
      if (owner === u) b.taken += num(s.taken);
    });
    const list = Object.keys(byHero).map(function (k) { return byHero[k]; });
    if (!list.length) return null;
    list.forEach(function (b) { b.score = b.dmg + b.heals * 0.9 + b.kills * 6 + b.taken * 0.35; });
    list.sort(function (a, b) { return b.score - a.score; });
    const mvp = list[0];
    if (mvp.score <= 0) return null;
    const contrib = { kills: mvp.kills * 6, dmg: mvp.dmg, heals: mvp.heals * 0.9, taken: mvp.taken * 0.35 };
    const best = Object.keys(contrib).sort(function (a, b) { return contrib[b] - contrib[a]; })[0];
    const title = AWARDS[best][DD.util.hash(mvp.id + cs.id) % AWARDS[best].length];
    const last = list.length > 1 ? list[list.length - 1] : null;
    return {
      mvp: mvp, title: title,
      trophy: last && last.score < mvp.score * 0.5 ? { hero: last, title: TROPHIES[DD.util.hash(last.id + cs.id) % TROPHIES.length] } : null,
      name: UI.heroName(mvp.id),
    };
  }

  function rewardVisual(rw) {
    const UI = DD.UI;
    const run = UI.run();
    const hero = rw.heroIdx !== undefined && run && run.party ? run.party[rw.heroIdx] : null;
    const v = { type: rw.type, icon: '🎁', typeLabel: 'Reward', name: rw.label || '', sub: '', desc: rw.desc || '', rarity: null, hero: hero, tip: null, skill: null, level: 1 };
    switch (rw.type) {
      case 'item': {
        const d = DD.getItem(rw.id);
        if (d) {
          v.icon = d.icon || '❔'; v.name = d.name; v.rarity = d.rarity || 'common';
          v.typeLabel = UI.rarityName(v.rarity) + ' ' + ((UI.SLOTS[d.slot] && UI.SLOTS[d.slot].name) || 'Item');
          v.desc = d.desc || rw.desc || '';
          v.stats = UI.statLines(d.stats);
          v.restrict = d.hero && !hero ? UI.heroName(d.hero) + ' only' : '';
          v.tip = function () { return UI.itemTooltipHtml(rw.id); };
        }
        break;
      }
      case 'skill': {
        const d = DD.getSkill(rw.id);
        v.typeLabel = 'Skill Tome';
        // described for the hero who learns it: their items and Blessings show in the numbers and costs
        if (d) { v.icon = d.icon || '📖'; v.name = d.name; v.skill = d; v.level = 1; v.desc = DD.skillDesc(d, 1, UI.describer(hero)); v.tip = function () { return UI.skillTooltipHtml(rw.id, 1, hero, { showNext: true }); }; }
        break;
      }
      case 'upgrade': {
        v.typeLabel = 'Training Manual';
        let sk = null;
        if (hero && hero.skills) sk = rw.skillIdx !== undefined ? hero.skills[rw.skillIdx] : hero.skills.filter(function (s) { return s.id === rw.id; })[0];
        const d = DD.getSkill(sk ? sk.id : rw.id);
        if (d) {
          const lv = sk ? Math.min((sk.level || 1) + 1, d.maxLevel || 1) : 2;
          v.icon = d.icon || '⬆️'; v.name = d.name + ' → ' + DD.util.roman(lv); v.skill = d; v.level = lv;
          v.desc = DD.skillDesc(d, lv, UI.describer(hero));
          v.tip = function () { return UI.skillTooltipHtml(d.id, lv, hero, {}); };
        }
        break;
      }
      case 'consumable': {
        const d = DD.getConsumable(rw.id);
        v.typeLabel = 'Consumable';
        if (d) { v.icon = d.icon || '🧪'; v.name = d.name; v.rarity = d.rarity || 'common'; v.desc = d.desc || ''; v.tip = function () { return UI.consumableTooltipHtml(rw.id); }; }
        break;
      }
      case 'gold':
        v.icon = '💰'; v.typeLabel = 'Gold'; v.name = v.name || (num(rw.amount) + ' Gold'); v.desc = v.desc || 'Shiny. Zarathor approves.';
        break;
      case 'heal':
        v.icon = '🍗'; v.typeLabel = 'Healing'; v.name = v.name || 'Second Breakfast'; v.desc = v.desc || 'Heal the party.';
        break;
      default:
        v.typeLabel = DD.util.capitalize(rw.type || 'Reward');
    }
    if (!v.name) v.name = rw.label || v.typeLabel;
    return v;
  }

  function consumablesFull() {
    const run = DD.UI.run();
    if (!run) return false;
    return (run.consumables || []).length >= (run.maxConsumables || 3);
  }

  /** The run layer records picks itself (reward.rid → pending.data.taken); older/free-standing rewards keep it here. */
  function persistPick(idx) {
    const run = DD.UI.run();
    const d = run && run.pending && run.pending.type === 'rewards' ? run.pending.data : null;
    if (!d || typeof d !== 'object') return;
    if (idx === -1 && d.taken === null && DD.Run && typeof DD.Run.skipRewards === 'function') { DD.safe('Run.skipRewards', DD.Run.skipRewards, DD.Run); return; }
    if (!('taken' in d)) {
      d.picked = idx;
      if (DD.Run && typeof DD.Run.save === 'function') DD.safe('Run.save', DD.Run.save, DD.Run);
    }
  }

  function applyReward(idx, replaceIdx) {
    const UI = DD.UI;
    const rw = st.data.choices[idx];
    if (!DD.Rewards || typeof DD.Rewards.apply !== 'function') { UI.toast('The loot vanished (rewards system unavailable).', { cls: 'bad' }); return; }
    const opts = {};
    if (replaceIdx !== undefined && replaceIdx !== null && replaceIdx >= 0) opts.replaceIdx = replaceIdx;
    const res = DD.safe('Rewards.apply', DD.Rewards.apply, DD.Rewards, [rw, opts]);
    if (res && res.ok === false && res.reason !== 'taken') {
      UI.sound('error');
      UI.toast(res.text || 'That reward could not be taken.', { icon: '✋', cls: 'bad' });
      return;
    }
    st.data.picked = res && res.reason === 'taken' ? -2 : idx;
    persistPick(st.data.picked);
    const v = rewardVisual(rw);
    UI.sound(rw.type === 'gold' ? 'coin' : rw.type === 'heal' ? 'heal' : 'buy');
    UI.toast(res && res.text ? res.text : 'Took ' + v.name + (v.hero ? ' for ' + UI.heroName(v.hero) : '') + '.', { icon: v.icon, cls: res && res.ok === false ? '' : 'good' });
    renderCards();
    renderActions();
  }

  /** True when the run layer already recorded a pick for this rewards screen (e.g. after a reload). */
  function alreadyTaken(choices) {
    if (!DD.Run || typeof DD.Run.isRewardTaken !== 'function') return false;
    return choices.some(function (c) { return !!DD.safe('Run.isRewardTaken', DD.Run.isRewardTaken, DD.Run, [c]); });
  }

  function pick(idx) {
    const UI = DD.UI;
    if (st.data.picked !== null) return;
    const rw = st.data.choices[idx];
    if (!rw) return;
    if (rw.type === 'consumable' && consumablesFull()) { UI.sound('error'); UI.toast('Your bag is full. Use or sell a consumable first.', { icon: '🎒' }); return; }
    if (rw.type === 'skill') {
      UI.chooseSkillSlot(rw.heroIdx || 0, rw.id, { skipLabel: 'Back to the loot' }, function (ri) {
        if (ri === null) return;
        applyReward(idx, ri);
      });
      return;
    }
    applyReward(idx);
  }

  function renderCards() {
    const UI = DD.UI, el = UI.el;
    const box = st.refs.cards;
    box.innerHTML = '';
    const choices = st.data.choices;
    if (!choices.length) {
      // [integration fix] a lost objective pays nothing (see DD.Run resolveCombat)
      box.appendChild(el('div.empty-state.small', null, el('div.es-icon', null, st.data.kind === 'failed' ? '📉' : '🕸️'), el('div', null, st.data.kind === 'failed' ? 'No loot for a lost objective. The heroes keep their HP and their dignity (mostly).' : 'No loot this time. The DM forgot to stock this room.')));
      return;
    }
    const full = consumablesFull();
    choices.forEach(function (rw, i) {
      const v = rewardVisual(rw);
      const picked = st.data.picked === i;
      const gone = st.data.picked !== null && !picked;
      const card = el('button.reward-card', { type: 'button', class: ['type-' + (rw.type || 'other'), v.rarity ? 'rarity-' + v.rarity : '', picked ? 'picked' : '', gone ? 'gone' : ''] },
        el('div.rc-type', null, v.typeLabel),
        el('div.rc-icon', null, v.icon),
        el('div.rc-name', null, v.name),
        v.skill ? el('div.rc-pills', { html: skillPills(v.skill, v.level) }) : null,
        v.stats && v.stats.length ? el('div.rc-stats', null, v.stats.map(function (l) { return el('span.' + (l.good ? 'good' : 'bad'), null, l.text); })) : null,
        el('div.rc-desc', null, v.desc),
        v.restrict ? el('div.rc-note', null, v.restrict) : null,
        v.hero ? el('div.rc-for', null, UI.portrait(v.hero.id, 26), el('span', null, 'For ' + UI.heroName(v.hero))) : null,
        rw.type === 'consumable' && full && st.data.picked === null ? el('div.rc-warn', null, 'Bag full (' + (UI.run().consumables || []).length + '/' + (UI.run().maxConsumables || 3) + ')') : null,
        picked ? el('div.rc-stamp', null, 'Taken') : null,
        st.data.picked === null ? el('span.kbd.rc-key', null, String(i + 1)) : null);
      if (v.tip) UI.tooltip(card, v.tip, { pos: 'top', delay: 250 });
      if (st.data.picked === null) {
        UI.bindHotkey(card, String(i + 1));
        card.addEventListener('click', function () { UI.sound('click'); pick(i); });
      } else UI.setDisabled(card, true);
      box.appendChild(card);
    });
  }

  function skillPills(def, level) {
    const info = DD.UI.skillInfo(def.id, level, null);
    if (!info) return '';
    let h = '<span class="pill ap">' + info.ap + ' AP</span>';
    if (info.cooldown) h += '<span class="pill cd">⟳ ' + info.cooldown + '</span>';
    if (info.hpCost) h += '<span class="pill hpcost">−' + info.hpCost + ' HP</span>';
    h += '<span class="pill">' + DD.UI.esc(info.range) + '</span>';
    return h;
  }

  // ---- the level-up moment (v2) -------------------------------------------------------------------------------------
  /** The die's lead-in and the landed result for one LevelUp record: { lead, result } (plain text). */
  function levelText(lu, name) {
    const n = num(lu.die), face = num(lu.face);
    if (!lu.rotation || n < 1) return { lead: 'The DM points at ' + name + '.', result: name + ' levels up!' };
    if (n === 1) return { lead: 'Only ' + name + ' is behind the rest of the party, so there is nothing to roll.', result: name + ' levels up!' };
    if (n === 2) return { lead: 'The DM flips a coin for the level-up…', result: (face === 1 ? 'Heads!' : 'Tails!') + ' ' + name + ' levels up!' };
    if (n === 3) return { lead: 'The DM rolls a d3 for the level-up. (They exist. He has one. Do not ask.)…', result: face + '! ' + name + ' levels up!' };
    return { lead: 'The DM rolls a d' + n + ' for the level-up…', result: face + '! ' + name + ' levels up!' };
  }

  /** The party lineup for one level-up: candidates carry their die face, the winner glows, the rest are ahead. */
  function levelLineup(lu, run) {
    const UI = DD.UI, el = UI.el;
    const cands = Array.isArray(lu.candidates) ? lu.candidates : [lu.heroIdx];
    const roll = lu.rotation && num(lu.die) > 1;
    return el('div.rwl-lineup', null, (run.party || []).map(function (rh, i) {
      if (!rh || rh.dead) return null;
      const k = cands.indexOf(i);
      const won = i === lu.heroIdx;
      const chip = el('div.rwl-hero', { class: [won ? 'won' : '', k < 0 ? 'ahead' : 'cand'], style: { '--hc': (UI.heroDef(rh) || {}).color || '#c9a24f' } },
        UI.portrait(rh.id, 28),
        roll && k >= 0 ? el('span.rwl-facebadge', null, num(lu.die) === 2 ? (k === 0 ? 'H' : 'T') : String(k + 1)) : null,
        el('span.rwl-hname', null, UI.heroName(rh)),
        // the winner's chip only gives the result away once the die lands (landLevel swaps in data-after)
        el('span.rwl-hlvl', { dataset: won ? { after: 'Lv ' + num(lu.from) + ' → ' + num(lu.to) } : {} },
          won ? 'Lv ' + num(lu.from) : 'Lv ' + (num(rh.level) || 1) + (k < 0 ? ' · ahead' : '')));
      UI.tooltip(chip, '<div class="tt"><div class="tt-desc">' + UI.esc(won ? UI.heroName(rh) + ' got this level-up.' :
        k >= 0 ? 'In the running (the lowest level), but the dice said no. Next time, maybe.' : 'Already a level ahead: the others catch up first.') + '</div></div>', { pos: 'top' });
      return chip;
    }));
  }

  function landLevel(row) {
    if (!row || row.classList.contains('landed')) return;
    clearTimeout(row._ddTimer);
    row.classList.remove('rolling');
    row.classList.add('landed');
    const face = row.querySelector('.rwl-face');
    if (face) face.textContent = row.dataset.face || '';
    Array.prototype.forEach.call(row.querySelectorAll('.rwl-hlvl[data-after]'), function (s) { s.textContent = s.dataset.after; });
    if (st && st.levelLanded.indexOf(row.dataset.k) < 0) st.levelLanded.push(row.dataset.k);
    DD.UI.sound('levelup');
  }

  /** Cosmetic tumble of the die face (DD.rng) before it lands; instant when headless / FX instant / already seen. */
  function tumble(row, n, delay) {
    const face = row.querySelector('.rwl-face');
    const t0 = Date.now() + delay;
    function tick() {
      if (!row.isConnected || row.classList.contains('landed')) return;
      const t = Date.now() - t0;
      if (t >= ROLL_MS) { landLevel(row); return; }
      if (t >= 0 && face) face.textContent = n === 2 ? (DD.rng.next() < 0.5 ? 'H' : 'T') : String(DD.rng.int(1, Math.max(2, n)));
      row._ddTimer = setTimeout(tick, t < 0 ? -t : 60 + t * 0.12);
      if (st) st.timers.push(row._ddTimer);
    }
    row.classList.add('rolling');
    tick();
  }

  function renderLevel() {
    const UI = DD.UI, el = UI.el;
    const box = st.refs.level;
    box.innerHTML = '';
    const run = UI.run();
    const d = st.data;
    box.style.display = '';
    if (!run || d.source === 'treasure' || d.kind === 'treasure') { box.style.display = 'none'; return; } // no fight, no level-up
    if (d.kind === 'failed') {
      box.appendChild(el('div.rwl-none', null, '📉 Nobody levels up from a lost objective. The DM is a stickler about that.'));
      return;
    }
    const next = UI.nextLevelUp();
    if (!d.levelUps.length) {
      if (next && next.maxed && d.id) box.appendChild(el('div.rwl-none', null, '🏁 Everyone is level ' + UI.MAX_LEVEL + '. The DM has run out of levels and offers a sympathetic nod instead.'));
      else box.style.display = 'none'; // e.g. a rewards screen restored from an XP-era save
      return;
    }
    const instant = !!(DD.headless || (DD.FX && DD.FX.instant));
    d.levelUps.forEach(function (lu, k) {
      const name = lu.name || UI.heroName(lu.heroId || run.party[lu.heroIdx]);
      const txt = levelText(lu, name);
      const n = num(lu.die);
      const faceText = n === 2 ? (num(lu.face) === 1 ? 'H' : 'T') : n > 1 ? String(num(lu.face)) : '✨';
      // who is next sits on the last level-up's lead line (right side) to keep the screen short
      const nextEl = k === d.levelUps.length - 1 && next && next.text ? el('span.rwl-next', null, '🎲 ' + next.text) : null;
      const row = el('div.rwl-row', { class: [n > 1 && lu.rotation ? 'd' + n : 'no-roll'], dataset: { face: faceText, k: String(k) } },
        el('div.rwl-die', { title: n > 1 ? (n === 2 ? 'A coin flip' : 'A d' + n) : 'No roll needed' }, el('span.rwl-face', null, n > 1 ? '?' : faceText), el('span.rwl-dlabel', null, n > 2 ? 'd' + n : n === 2 ? 'coin' : '')),
        el('div.rwl-main', null,
          el('div.rwl-top', null, el('span.rwl-lead', null, txt.lead), nextEl),
          el('div.rwl-result', null, el('b', null, txt.result), ' ', el('span.rwl-lv', null, 'Level ' + num(lu.from) + ' → ' + num(lu.to)),
            el('span.rwl-quip', null, ' ' + LEVEL_QUIPS[DD.util.hash(String(d.id) + ':' + k) % LEVEL_QUIPS.length])),
          levelLineup(lu, run)));
      row.addEventListener('click', function () { landLevel(row); });
      box.appendChild(row);
      if (instant || n < 2 || st.levelLanded.indexOf(String(k)) >= 0) landLevel(row);
      else tumble(row, n, k * 500);
    });
  }

  /** Heroes downed (with their new scar) or written out in this fight. */
  function casualties() {
    const UI = DD.UI, el = UI.el;
    const run = UI.run();
    const d = st.data;
    if (!run || (!d.downed.length && !d.deaths.length)) return null;
    const rows = [];
    d.deaths.forEach(function (i) {
      const rh = run.party[i];
      if (rh) rows.push(el('div.cas-row.death', null, UI.portrait(rh.id, 30, { dead: true }), el('span', null, el('b', null, UI.heroName(rh)), ' was downed for the third time and is written out of the campaign.')));
    });
    d.downed.forEach(function (i) {
      if (d.deaths.indexOf(i) >= 0) return;
      const rh = run.party[i];
      if (!rh) return;
      const sc = d.scars.filter(function (s) { return s && s.heroIdx === i; })[0];
      const scar = sc ? DD.getScar(sc.scarId) : null;
      const row = el('div.cas-row', null, UI.portrait(rh.id, 30), el('span', null, el('b', null, UI.heroName(rh)), ' got back up with 1 HP' + (scar ? ' and a new scar:' : '.')), scar ? UI.scarChip(sc.scarId) : null, el('span.cas-downs', null, '💀 ' + num(rh.downs) + '/3'));
      rows.push(row);
    });
    return el('div.rw-casualties', null, el('div.cas-h', null, 'Casualties'), rows);
  }

  function renderActions() {
    const UI = DD.UI;
    const box = st.refs.actions;
    box.innerHTML = '';
    const hasChoices = st.data.choices.length > 0;
    if (st.data.picked === null && hasChoices) {
      box.appendChild(UI.button('Skip Loot', function () {
        UI.confirm('Leave the loot behind? The DM will remember this insult.', { title: 'Skip the Loot?', yes: 'Skip it', no: 'Wait, no' }).then(function (ok) {
          if (!ok) return;
          st.data.picked = -1;
          persistPick(-1);
          finish();
        });
      }, { cls: 'ghost' }));
      box.appendChild(UI.el('div.rw-hint', null, 'Choose one reward.'));
    } else {
      const run = UI.run();
      const lv = DD.Run && typeof DD.Run.hasPendingChoices === 'function' ? !!DD.safe('Run.hasPendingChoices', DD.Run.hasPendingChoices, DD.Run) :
        st.data.leveled.length > 0 || !!(run && run.party.some(function (h) { return num(h.pendingLevels) > 0; }));
      box.appendChild(UI.button(lv ? 'Continue — Level Up!' : 'Continue', finish, { cls: 'primary big', icon: lv ? '✨' : '▶', hotkey: 'Enter' }));
    }
  }

  /**
   * After loot. Boss fights first show the act-clear interstitial (its Continue moves on). Otherwise the run layer
   * decides what comes next (DD.Run.next: queued fight → level-ups → map); an explicit params.next (debug / tests)
   * is honoured after any pending level-ups.
   */
  function finish() {
    const UI = DD.UI;
    const data = st.data;
    const run = UI.run();
    if (!data.next && data.actClear && !data.actClear.victory) {
      const ac = data.actClear;
      UI.show('victory', { act: ac.act, unlocked: ac.unlocked || [], nextAct: ac.nextAct, healed: ac.healed, text: ac.text });
      return;
    }
    if (!data.next && DD.Run && typeof DD.Run.next === 'function') { DD.safe('Run.next', DD.Run.next, DD.Run); return; }
    const next = data.next || 'map';
    if (run && run.pending && run.pending.type === 'rewards') {
      if (DD.Run && typeof DD.Run.closeStep === 'function') DD.safe('Run.closeStep', DD.Run.closeStep, DD.Run);
      else {
        if (run.pending.data && run.pending.data.taken === null && !run.pending.data.skipped) run.pending.data.skipped = true;
        run.pending = null;
        if (DD.Run && typeof DD.Run.save === 'function') DD.safe('Run.save', DD.Run.save, DD.Run);
      }
    }
    const queue = data.leveled.filter(function (i) { return run && run.party && run.party[i] && !run.party[i].dead; });
    const pending = DD.Run && typeof DD.Run.hasPendingChoices === 'function' ? !!DD.safe('Run.hasPendingChoices', DD.Run.hasPendingChoices, DD.Run) : queue.length > 0;
    if (pending) UI.show('levelup', { queue: queue, next: next });
    else UI.goNext(next);
  }

  DD.afterLoad(function () {
    if (!DD.UI) return;
    const UI = DD.UI;
    UI.screen('rewards', {
      cls: 'full dim',
      history: false,
      mount: function (root, params) {
        const el = UI.el;
        st = { data: normalize(params), refs: {}, timers: [], levelLanded: [] };
        if (st.data.picked === null && st.data.choices.length && alreadyTaken(st.data.choices)) st.data.picked = -2;
        // a reload / re-mount of a screen whose level-up was already shown lands at once (no second suspense)
        if (st.data.picked !== null) st.data.levelUps.forEach(function (lu, k) { st.levelLanded.push(String(k)); });
        const panel = el('div.rw-panel.panel');
        const title = st.data.title || (st.data.source === 'treasure' || st.data.kind === 'treasure' ? 'Treasure!' : st.data.boss ? 'Boss Defeated!' : st.data.kind === 'elite' ? 'Elite Slain!' : 'Victory!');
        panel.appendChild(el('div.rw-banner', null, el('span.rw-banner-text', null, title), st.data.encounterName ? el('div.rw-banner-sub', null, st.data.encounterName + (st.data.boss || st.data.kind === 'elite' || st.data.kind === 'normal' ? ' — cleared' : '')) : null));
        // [integration fix, narrative request] a hero written out of the campaign gets the DM's hero_death line
        const line = st.data.text || (st.data.deaths.length ? UI.narrate('hero_death', {}, null) : '') || UI.narrate('victory', {}, VICTORY_FALLBACK);
        if (line) panel.appendChild(UI.narration(line, { cls: 'center' }));
        const cs = freshCombat();
        const kills = st.data.kills !== null ? st.data.kills : cs && cs.units ? cs.units.filter(function (u) { return u.side === 'enemy' && u.dead; }).length : 0;
        panel.appendChild(el('div.rw-summary', null,
          el('div.rw-stat.gold', null, el('div.rws-val', null, UI.goldText(st.data.gold, { big: true })), el('div.rws-label', null, 'Gold looted')),
          kills ? el('div.rw-stat', null, el('div.rws-val', null, String(kills)), el('div.rws-label', null, 'Foes defeated')) : null,
          cs && cs.round ? el('div.rw-stat', null, el('div.rws-val', null, String(cs.round)), el('div.rws-label', null, 'Rounds')) : null));
        st.refs.level = el('div.rw-level');
        panel.appendChild(st.refs.level);
        const aw = computeAwards();
        if (aw) {
          panel.appendChild(el('div.rw-mvp', null,
            el('div.mvp-trophy', null, '🏆'),
            UI.portrait(aw.mvp.id, 56),
            el('div.mvp-text', null,
              el('div.mvp-title', null, 'MVP: ' + aw.name),
              el('div.mvp-award', null, '“' + aw.title + '”'),
              el('div.mvp-stats', null, aw.mvp.dmg + ' damage · ' + aw.mvp.kills + ' kills · ' + aw.mvp.heals + ' healing · ' + aw.mvp.taken + ' taken')),
            aw.trophy ? el('div.mvp-trophy-2', null, el('span.t2-label', null, aw.trophy.title), el('span.t2-name', null, UI.heroName(aw.trophy.hero.id))) : null));
        }
        const cas = casualties();
        if (cas) panel.appendChild(cas);
        panel.appendChild(el('div.rw-h', null, st.data.choices.length ? 'Choose Your Loot' : 'Loot'));
        st.refs.cards = el('div.rw-cards');
        panel.appendChild(st.refs.cards);
        st.refs.actions = el('div.rw-actions');
        panel.appendChild(st.refs.actions);
        root.appendChild(el('div.rw-wrap', null, panel));
        renderLevel();
        renderCards();
        renderActions();
        if (!DD.headless) UI.sound('victory');
      },
      update: function () { if (st) renderCards(); },
      unmount: function () {
        if (st) st.timers.forEach(function (t) { clearTimeout(t); });
        st = null;
      },
    });
  });
})();
