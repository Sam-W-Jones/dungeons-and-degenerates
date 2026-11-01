/* Dungeons and Degenerates — js/ui/screens/party.js
 * Party management (from the map, shop or tavern): hero tabs, then per hero a character sheet (portrait, level and
 * the hero's place in the level-up rotation — v2, no XP —, HP, full stats via DD.Run.heroStats, passive, scars,
 * downs), the skill loadout (basic, signature, 4 sockets with
 * levels and full descriptions) and the loadout column: the 4 Blessing slots (random passives, with a "Roll!" button
 * for waiting rolls), gear (weapon / armor / trinket slots with unequip, the shared stash with equip) and
 * consumables with discard. Params: { back: screenId (default 'map'), hero: index }.
 */
(function () {
  'use strict';
  const DD = window.DD;

  let st = null;

  function num(v) { v = +v; return isFinite(v) ? v : 0; }

  function statRow(icon, label, value, cls, tip) {
    const UI = DD.UI, el = UI.el;
    const r = el('div.sheet-stat' + (cls ? '.' + cls : ''), null, el('span.ss-icon', null, icon), el('span.ss-label', null, label), el('span.ss-val', null, String(value)));
    if (tip) UI.tooltip(r, '<div class="tt"><div class="tt-desc">' + UI.esc(tip) + '</div></div>', { pos: 'right' });
    return r;
  }

  function renderTabs() {
    const UI = DD.UI, el = UI.el;
    const run = UI.run();
    const box = st.refs.tabs;
    box.innerHTML = '';
    run.party.forEach(function (rh, i) {
      const d = UI.heroDef(rh);
      const s = UI.heroStats(rh);
      const tab = el('button.hero-tab', { type: 'button', class: [i === st.hero ? 'active' : '', rh.dead ? 'dead' : ''], style: { '--hc': (d && d.color) || '#c9a24f' } },
        UI.portrait(rh.id, 40, { dead: rh.dead }),
        el('span.ht-text', null, el('span.ht-name', null, UI.heroName(rh)), el('span.ht-sub', null, rh.dead ? 'Written out' : 'Lv ' + num(rh.level || 1) + (UI.levelMark(i) ? ' 🎲' : '') + ' · ' + Math.round(num(rh.hp)) + '/' + s.maxHp + ' HP')),
        el('span.kbd.ht-key', null, String(i + 1)));
      UI.bindHotkey(tab, String(i + 1));
      tab.addEventListener('click', function () { if (st.hero !== i) { UI.sound('click'); st.hero = i; render(); } });
      box.appendChild(tab);
    });
  }

  function renderSheet(rh, idx) {
    const UI = DD.UI, el = UI.el;
    const d = UI.heroDef(rh) || {};
    const s = UI.heroStats(rh);
    const col = el('section.party-col.sheet.panel');
    col.appendChild(el('div.sheet-head', null,
      UI.portrait(rh.id, 96, { dead: rh.dead }),
      el('div.sheet-titles', null,
        el('div.sheet-name', null, UI.heroName(rh)),
        d.epithet ? el('div.sheet-epithet', null, d.epithet) : null,
        el('div.sheet-class', null, [d.race, d.cls].filter(Boolean).join(' ')),
        el('div.sheet-level', null, el('span.lvl-badge.big', null, 'Level ' + num(rh.level || 1)), num(rh.kills) ? el('span.chip', { title: 'Kills this run' }, '💀 ' + num(rh.kills)) : null))));
    if (rh.dead) col.appendChild(el('div.sheet-dead', null, '⚰️ Written out of the campaign. Replace them at a tavern.'));
    col.appendChild(UI.hpBar(rh.hp, s.maxHp, { big: true, dead: rh.dead, deadText: 'Written out', label: '❤' }));
    const next = rh.dead ? '' : UI.levelLine(rh, idx);
    if (next) {
      const line = el('div.sheet-next', { class: UI.isNextLevelUp(idx) ? 'in-running' : '' }, next);
      UI.tooltip(line, '<div class="tt"><div class="tt-title">Level-ups</div><div class="tt-desc">There is no XP. After every won fight one hero levels up: the DM rolls among the living heroes with the lowest level, so everyone reaches a level before anyone gets the next one.</div></div>', { pos: 'right' });
      col.appendChild(line);
    }
    const grid = el('div.sheet-stats');
    grid.appendChild(statRow('⚡', 'Action Points', s.ap, 'ap', 'AP per turn. Moving costs 1 AP; skills cost their listed AP.'));
    grid.appendChild(statRow('👣', 'Move', s.mov, null, 'Tiles of path cost per move action.'));
    grid.appendChild(statRow('🛡️', 'Armor', s.armor, null, 'Reduces each hit by this much (minimum 1 damage).'));
    grid.appendChild(statRow('⏱️', 'Initiative', num(s.init) > 0 ? '+' + num(s.init) : String(num(s.init)), num(s.init) > 0 ? 'good' : num(s.init) < 0 ? 'bad' : null,
      'Added to the d20 when the fight rolls for initiative: higher goes earlier in the turn order.'));
    if (num(s.dmg)) grid.appendChild(statRow('⚔️', 'Damage', UI.pct(s.dmg), num(s.dmg) > 0 ? 'good' : 'bad', 'Bonus to all damage dealt.'));
    if (num(s.heal)) grid.appendChild(statRow('💚', 'Healing', UI.pct(s.heal), num(s.heal) > 0 ? 'good' : 'bad', 'Bonus to all healing done.'));
    if (num(s.range)) grid.appendChild(statRow('🎯', 'Range', UI.signed(s.range), num(s.range) > 0 ? 'good' : 'bad', 'Bonus max range for skills with max range 2+.'));
    // (v2: nobody starts a fight with Block, so a "Starting Block" stat is no longer shown)
    if (num(s.hype)) grid.appendChild(statRow('🔥', 'Starting Hype', UI.signed(s.hype), 'good', 'Party Hype at the start of each combat.'));
    col.appendChild(grid);
    if (d.passive) col.appendChild(el('div.sheet-passive', null, el('div.sp-h', null, el('span.psd-h-tag', null, 'Passive'), d.passive.name || 'Passive'), el('div.sp-desc', null, d.passive.desc || '')));
    const downs = num(rh.downs);
    const scars = rh.scars || [];
    const sc = el('div.sheet-scars', null, el('div.sp-h', null, el('span.psd-h-tag', null, 'Scars'), downs ? el('span.downs', { title: 'Downs this run. The third one is permanent.' }, '💀 ' + downs + ' / 3 downs') : 'No downs yet'));
    if (scars.length) sc.appendChild(el('div.scar-list', null, scars.map(function (sid) { return UI.scarChip(sid); })));
    else sc.appendChild(el('div.muted.small', null, 'Unblemished. For now.'));
    col.appendChild(sc);
    return col;
  }

  /** The 4 Blessing slots (random passives from the Table of Questionable Blessings, on top of the built-in passive)
   *  and any roll still waiting. Lives at the top of the gear column, which has the room at 1280×720. */
  function renderBlessings(rh, col) {
    const UI = DD.UI, el = UI.el;
    const list = rh.passives || [];
    if (!list.length && !(DD.Passives && DD.Passives.count() > 0)) return; // no table loaded: nothing to show
    col.appendChild(el('div.col-h', null, 'Blessings', el('span.col-sub', { title: 'Up to 4, on top of the built-in passive. Rolled on level-ups.' }, list.length + ' / ' + UI.MAX_PASSIVES + ' · rolled on level-ups')));
    col.appendChild(UI.passiveSlots(rh, { tipPos: 'left', emptyText: 'Empty slot', cls: 'party-bless' }));
    const rolls = rh.dead || !DD.Passives ? 0 : (rh.passiveRolls || []).length;
    if (rolls) {
      col.appendChild(el('div.bl-pending', null, el('span', null, '🎲 ' + (rolls > 1 ? rolls + ' rolls are' : 'A roll is') + ' waiting on the table'),
        UI.button('Roll!', function () { UI.show('levelup', { next: { id: 'party', params: { back: st.back, hero: st.hero } } }); }, { cls: 'small primary' })));
    }
  }

  function renderSkills(rh) {
    const UI = DD.UI, el = UI.el;
    const d = UI.heroDef(rh) || {};
    const col = el('section.party-col.skills.panel');
    col.appendChild(el('div.col-h', null, 'Skills', el('span.col-sub', null, (rh.skills || []).length + ' / 4 socketed')));
    // described through the hero (UI.sheetUnit): item bonuses in the text, AP costs after Blessings / items / scars
    const unit = rh.dead ? null : rh;
    const fixed = el('div.skill-fixed');
    if (d.basic) fixed.appendChild(UI.skillCard(d.basic, 1, { compact: true, role: 'basic', badge: 'Basic', unit: unit }));
    if (d.signature) fixed.appendChild(UI.skillCard(d.signature, 1, { compact: true, role: 'signature', badge: 'Signature', unit: unit }));
    col.appendChild(fixed);
    const sockets = el('div.sockets');
    for (let i = 0; i < 4; i++) {
      const s = (rh.skills || [])[i];
      if (s) sockets.appendChild(el('div.socket.filled', null, el('span.socket-n', null, String(i + 1)), UI.skillCard(s.id, s.level || 1, { showNext: true, unit: unit })));
      else sockets.appendChild(el('div.socket.empty', null, el('span.socket-n', null, String(i + 1)), el('div.socket-empty', null, 'Empty socket — learn skills by levelling up or reading tomes.')));
    }
    col.appendChild(sockets);
    return col;
  }

  function slotView(rh, idx, slot) {
    const UI = DD.UI, el = UI.el;
    const id = rh.items ? rh.items[slot] : null;
    const info = UI.SLOTS[slot];
    if (!id) return el('div.gear-slot.empty', null, el('span.gs-icon', null, info.icon), el('span.gs-name', null, 'No ' + info.name.toLowerCase()));
    const card = UI.itemCard(id, { compact: true, tipPos: 'left', equipped: true });
    const btn = UI.button('Unequip', function () {
      if (DD.Run && typeof DD.Run.unequip === 'function') DD.safe('Run.unequip', DD.Run.unequip, DD.Run, [idx, slot]);
      render();
    }, { cls: 'small ghost' });
    return el('div.gear-slot.filled', null, card, btn);
  }

  function renderGear(rh, idx) {
    const UI = DD.UI, el = UI.el;
    const run = UI.run();
    const col = el('section.party-col.gear.panel');
    renderBlessings(rh, col);
    col.appendChild(el('div.col-h', null, 'Equipment'));
    col.appendChild(el('div.gear-slots', null, ['weapon', 'armor', 'trinket'].map(function (slot) { return slotView(rh, idx, slot); })));
    const inv = run.inventory || [];
    col.appendChild(el('div.col-h', null, 'Stash', el('span.col-sub', null, inv.length ? inv.length + ' item' + (inv.length > 1 ? 's' : '') : 'empty')));
    const stash = el('div.stash.scroll');
    if (!inv.length) stash.appendChild(el('div.muted.small.pad', null, 'Nothing in the stash. Loot harder.'));
    inv.forEach(function (itemId) {
      const d = DD.getItem(itemId);
      if (!d) return;
      const restricted = d.hero && d.hero !== rh.id;
      const can = DD.Run && typeof DD.Run.canEquip === 'function' ? !!DD.safe('Run.canEquip', DD.Run.canEquip, DD.Run, [idx, itemId]) : !rh.dead && !restricted;
      const cur = rh.items && rh.items[d.slot] ? DD.getItem(rh.items[d.slot]) : null;
      const tip = restricted ? 'Only ' + UI.esc(UI.heroName(d.hero)) + ' can use this.' : rh.dead ? 'The dead have no use for loot.' :
        cur ? 'Swap with ' + UI.esc(cur.name) + ' (it goes back to the stash).' : null;
      const equipBtn = UI.button(cur && can ? 'Swap' : 'Equip', function () {
        if (DD.Run && typeof DD.Run.equip === 'function') DD.safe('Run.equip', DD.Run.equip, DD.Run, [idx, itemId]);
        UI.sound('buff');
        render();
      }, { cls: 'small', disabled: !can, tooltip: tip ? '<div class="tt"><div class="tt-desc">' + tip + '</div></div>' : null });
      stash.appendChild(el('div.stash-row', null, UI.itemCard(itemId, { compact: true, tipPos: 'left' }), equipBtn));
    });
    col.appendChild(stash);
    col.appendChild(el('div.col-h', null, 'Consumables', el('span.col-sub', null, (run.consumables || []).length + ' / ' + (run.maxConsumables || 3) + ' · usable in combat')));
    const cons = el('div.cons-list');
    (run.consumables || []).forEach(function (cid, ci) {
      const btn = UI.button('✕', function () {
        const d = DD.getConsumable(cid);
        UI.confirm('Throw away <b>' + UI.esc(d ? d.name : cid) + '</b>? A goblin will find it and become insufferable.', { title: 'Discard Consumable?', yes: 'Discard', danger: true }).then(function (ok) {
          if (!ok) return;
          if (DD.Run && typeof DD.Run.removeConsumable === 'function') DD.safe('Run.removeConsumable', DD.Run.removeConsumable, DD.Run, [ci]);
          render();
        });
      }, { cls: 'small ghost icon-only', tooltip: '<div class="tt"><div class="tt-desc">Discard</div></div>' });
      cons.appendChild(el('div.stash-row', null, UI.consumableCard(cid, { compact: true, tipPos: 'left' }), btn));
    });
    if (!(run.consumables || []).length) cons.appendChild(el('div.muted.small.pad', null, 'No consumables. Shops and loot have them.'));
    col.appendChild(cons);
    return col;
  }

  function render() {
    const UI = DD.UI;
    const run = UI.run();
    if (!st || !run) return;
    if (st.hero >= run.party.length) st.hero = 0;
    renderTabs();
    st.refs.gold.innerHTML = '';
    st.refs.gold.appendChild(UI.goldText(run.gold, { big: true }));
    const body = st.refs.body;
    body.innerHTML = '';
    const rh = run.party[st.hero];
    if (!rh) return;
    body.style.setProperty('--hc', (UI.heroDef(rh) || {}).color || '#c9a24f');
    body.appendChild(renderSheet(rh, st.hero));
    body.appendChild(renderSkills(rh));
    body.appendChild(renderGear(rh, st.hero));
  }

  DD.afterLoad(function () {
    if (!DD.UI) return;
    DD.UI.screen('party', {
      scene: 'none',
      cls: 'full bg-tavern',
      history: false,
      mount: function (root, params) {
        const UI = DD.UI, el = UI.el;
        params = params || {};
        const run = UI.run();
        st = { hero: Math.max(0, num(params.hero)), back: params.back || 'map', refs: {} };
        const backTo = function () {
          const target = st.back;
          if (target && UI.screens[target]) UI.show(target, target === 'party' ? {} : { fromParty: true });
          else UI.show('map');
        };
        if (!run) {
          root.appendChild(el('div.center-message.panel', null, el('div.es-icon', null, '🎒'), el('h2', null, 'No party to manage'), el('p', null, 'Start a campaign first.'), UI.button('Title', function () { UI.show('title'); }, { cls: 'primary' })));
          return;
        }
        st.refs.gold = el('div.party-gold');
        root.appendChild(UI.header('The Party', 'Skills, gear and questionable life choices.', [st.refs.gold, UI.button('Back', backTo, { icon: '←', cls: 'ghost', hotkey: 'Escape', showKey: false })]));
        st.refs.tabs = el('nav.hero-tabs');
        root.appendChild(st.refs.tabs);
        st.refs.body = el('div.party-body');
        root.appendChild(st.refs.body);
        render();
      },
      update: function () { render(); },
      unmount: function () { st = null; },
    });
  });
})();
